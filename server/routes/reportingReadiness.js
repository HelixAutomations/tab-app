/**
 * Management Dashboard Trust Gate — readiness endpoint.
 *
 * Returns the confidence picture for the moving parts the Management
 * Dashboard depends on. Designed to respond fast (< 1.5 s warm cache)
 * so the entry strip can settle visually without keeping the user waiting.
 *
 * Phase A intentionally does NOT hit Clio directly. Live parity is read
 * from the most recent reconciliation snapshot held in dataOperations.js,
 * which the existing manual snapshot endpoint and (in future) automated
 * snapshot scheduler will keep current. This avoids turning the gate into
 * a 30 s+ Clio report poll on every dashboard open.
 *
 * Contract: see src/tabs/Reporting/readiness.types.ts
 * Scope:    docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md
 */

const express = require('express');
const router = express.Router();
const { withRequest } = require('../utils/db');
const { getMatterDateExpressions } = require('../utils/matterDateColumns');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  getLatestReconciliationSnapshot,
  getPersistedSchedulerSnapshot,
  syncCollectedTime,
  refreshReconciliationSnapshot,
} = require('./dataOperations');
const { escalate } = require('../utils/teamsEscalation');

const READ_ONLY_FLAG = 'HELIX_TRUST_GATE_READ_ONLY';

// ─── Tunables ───
const CACHE_TTL_MS = 60 * 1000;          // 60 s shared cache
const CHECK_TIMEOUT_MS = 4 * 1000;       // hard cap per check
const SNAPSHOT_FRESH_WINDOW_MS = 15 * 60 * 1000;       // snapshot fresh
const SNAPSHOT_STALE_WINDOW_MS = 60 * 60 * 1000;       // snapshot stale → warn
const ENQUIRIES_BUSINESS_MAX_AGE_S = 90 * 60;          // 90 min business hours
const ENQUIRIES_OVERNIGHT_MAX_AGE_S = 6 * 60 * 60;     // 6 h overnight
const MATTERS_MAX_AGE_S = 90 * 60;                     // 90 min
const TEAM_MAX_AGE_S = 24 * 60 * 60;                   // 24 h
const ANNUAL_LEAVE_MAX_AGE_S = 24 * 60 * 60;           // 24 h
const DRIFT_ABS_THRESHOLD = 500;                       // £500
const DRIFT_PCT_THRESHOLD = 1;                         // 1 %

// Current-month fill cadence per entity (ms). If the latest effective fill is
// older than 2x cadence, the Management Dashboard entry check is blocked.
const CURRENT_FILL_CADENCE_MS = {
  collected: 60 * 60 * 1000,
  wip: 60 * 60 * 1000,
};

const TERMINAL_FAILURE_STATUSES = new Set(['error', 'failed', 'timeout']);
const TERMINAL_SUCCESS_STATUSES = new Set(['completed', 'validated']);

// In-memory cache for the assembled payload + per-check last-good cache.
let payloadCache = { value: null, expiresAt: 0 };
const lastGoodAt = Object.create(null);   // checkId → ISO string

/**
 * Treat 08:00–19:00 Europe/London Mon–Fri as business hours.
 * Approximate via UTC + 0/+1 offset — good enough for staleness thresholds.
 */
function isBusinessHoursNow(now = new Date()) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hourUtc = now.getUTCHours();
  // BST (Apr–Oct) ≈ UTC+1, GMT (Nov–Mar) ≈ UTC. Tolerate either: 7–18 UTC covers both.
  return hourUtc >= 7 && hourUtc <= 18;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function ageSeconds(fromIsoOrDate, now = Date.now()) {
  if (!fromIsoOrDate) return null;
  const t = fromIsoOrDate instanceof Date ? fromIsoOrDate.getTime() : new Date(fromIsoOrDate).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

function recordLastGood(check) {
  if (check.status === 'ok') {
    lastGoodAt[check.id] = new Date().toISOString();
    check.lastGoodAt = lastGoodAt[check.id];
  } else {
    check.lastGoodAt = lastGoodAt[check.id] || null;
  }
}

function makeCheck(partial) {
  const base = {
    label: '',
    status: 'unknown',
    blocking: true,
    ageSeconds: null,
    lastGoodAt: null,
    source: 'inferred',
    measured: null,
    threshold: null,
    reason: null,
    message: null,
    remediation: null,
  };
  return { ...base, ...partial };
}

function unknownFromError(id, label, blocking, error) {
  return makeCheck({
    id,
    label,
    blocking,
    status: 'unknown',
    reason: 'check-error',
    message: error?.message ? `Check failed: ${error.message}`.slice(0, 240) : 'Check failed',
    remediation: 'retry',
  });
}

// ─── Per-check evaluators ───

function evaluateParityFromSnapshot({ id, label, scope, sourceCheckKeys }) {
  const snapshot = getLatestReconciliationSnapshot();
  if (!snapshot || !Array.isArray(snapshot.checks)) {
    return makeCheck({
      id,
      label,
      status: 'warn',
      reason: 'no-snapshot',
      message: 'Scheduler hasn\'t produced a reconciliation snapshot yet — current month refreshes hourly (Collected :05, WIP :20); previous month is sealed on day 1, days 2-14 overnight, day 21, and the last day. Live parity confidence is unknown until then.',
      remediation: 'run-reconciliation-snapshot',
    });
  }
  const snapAgeMs = Date.now() - new Date(snapshot.generatedAt).getTime();
  const snapshotAgeS = Math.round(snapAgeMs / 1000);

  // Filter parity checks for this scope (e.g. all 'collected' UI/SQL parity rows).
  const scoped = snapshot.checks.filter((c) =>
    c.scope === scope && (sourceCheckKeys?.length ? sourceCheckKeys.some((k) => c.key?.includes(k)) : true)
  );
  if (scoped.length === 0) {
    return makeCheck({
      id,
      label,
      status: 'warn',
      ageSeconds: snapshotAgeS,
      reason: 'snapshot-missing-scope',
      message: `Most recent snapshot did not include ${scope} parity rows.`,
      remediation: 'run-reconciliation-snapshot',
    });
  }

  // Phase A — aggregate per-month findings from rolling parity rows. Each `collected-month-*`
  // row carries `month`, `monthLabel`, and `delta`. UI surfaces these for drill-down; the
  // overall verdict reflects the worst month's drift.
  const monthRows = scoped.filter((c) => typeof c.key === 'string' && /^collected-month-\d{4}-\d{2}-/.test(c.key));
  const findings = monthRows
    .map((c) => ({
      month: c.month || (c.key.match(/^collected-month-(\d{4}-\d{2})/) || [])[1] || null,
      label: c.monthLabel || null,
      sql: c.actual ?? null,
      clio: c.expected ?? null,
      delta: c.delta ?? null,
      status: c.status === 'ok' ? 'ok' : (Math.abs(Number(c.delta) || 0) > DRIFT_ABS_THRESHOLD ? 'error' : 'warn'),
      isCurrent: c.isCurrent === true,
    }))
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

  // Pick worst row (largest abs delta). Falls back to legacy single-row representative if
  // no per-month rows are present (e.g. older snapshots before A1). Current-period drift
  // is included because the Management Dashboard depends on current MTD/WTD figures.
  const verdictPool = scoped;
  const sortedByDrift = [...verdictPool].sort((a, b) => Math.abs(Number(b.delta) || 0) - Math.abs(Number(a.delta) || 0));
  const worst = sortedByDrift.find((c) => Math.abs(Number(c.delta) || 0) > 0);
  const errored = verdictPool.find((c) => c.status === 'error' || c.status === 'warn' || c.status === 'monitor');
  const representative = worst
    || errored
    || verdictPool.find((c) => c.key?.includes('sql-vs-clio'))
    || verdictPool.find((c) => c.key?.includes('ui-vs-clio'))
    || verdictPool[0];
  let drift = 0;
  let driftPct = 0;
  if (representative?.delta != null) drift = Math.abs(Number(representative.delta) || 0);
  if (representative?.actual != null && representative?.expected != null && Number(representative.expected) !== 0) {
    driftPct = Math.abs((Number(representative.actual) - Number(representative.expected)) / Number(representative.expected)) * 100;
  }

  const measured = representative
    ? {
        sql: representative.actual ?? null,
        clio: representative.expected ?? null,
        drift,
        driftPct: Math.round(driftPct * 100) / 100,
        comparisonKey: representative.key ?? null,
        findings,
        monthsChecked: findings.length,
        monthsDiffering: findings.filter((f) => f.status !== 'ok').length,
      }
    : null;
  const threshold = { absolute: DRIFT_ABS_THRESHOLD, pct: DRIFT_PCT_THRESHOLD };
  const exceedsAbs = drift > DRIFT_ABS_THRESHOLD;
  const exceedsPct = driftPct > DRIFT_PCT_THRESHOLD;
  const driftBlocking = errored && (exceedsAbs || exceedsPct);

  // Snapshot age fades confidence regardless of drift.
  if (snapAgeMs > SNAPSHOT_STALE_WINDOW_MS) {
    return makeCheck({
      id,
      label,
      status: 'warn',
      ageSeconds: snapshotAgeS,
      source: 'snapshot',
      measured,
      threshold,
      reason: 'snapshot-stale',
      message: `Last reconciliation snapshot was over ${Math.round(snapAgeMs / 60000)} minutes ago. Run a fresh snapshot to confirm live parity.`,
      remediation: 'run-reconciliation-snapshot',
    });
  }

  if (driftBlocking) {
    return makeCheck({
      id,
      label,
      status: 'blocked',
      ageSeconds: snapshotAgeS,
      source: 'snapshot',
      measured,
      threshold,
      reason: exceedsAbs ? 'drift-exceeds-absolute' : 'drift-exceeds-pct',
      message: `Drift of £${drift.toFixed(2)} (${driftPct.toFixed(2)}%) detected vs Clio source.`,
      remediation: 'investigate-source-drift',
    });
  }

  if (errored && snapAgeMs > SNAPSHOT_FRESH_WINDOW_MS) {
    return makeCheck({
      id,
      label,
      status: 'warn',
      ageSeconds: snapshotAgeS,
      source: 'snapshot',
      measured,
      threshold,
      reason: 'minor-drift-aged-snapshot',
      message: `Minor drift seen in last snapshot and snapshot is ageing. Refresh to confirm.`,
      remediation: 'run-reconciliation-snapshot',
    });
  }

  return makeCheck({
    id,
    label,
    status: 'ok',
    ageSeconds: snapshotAgeS,
    source: 'snapshot',
    measured,
    threshold,
    reason: null,
    message: null,
  });
}

async function evaluateEnquiriesFresh(connStr) {
  if (!connStr) {
    return makeCheck({
      id: 'enquiriesFresh',
      label: 'Enquiries freshness',
      status: 'unknown',
      reason: 'no-core-connection',
      message: 'Core SQL connection unavailable.',
    });
  }
  const latest = await withRequest(connStr, async (request) => {
    const r = await request.query(`SELECT MAX(Touchpoint_Date) AS latest FROM [dbo].[enquiries]`);
    return r.recordset?.[0]?.latest || null;
  });
  const ageS = ageSeconds(latest);
  const maxAge = isBusinessHoursNow() ? ENQUIRIES_BUSINESS_MAX_AGE_S : ENQUIRIES_OVERNIGHT_MAX_AGE_S;
  const status = ageS == null ? 'unknown' : ageS <= maxAge ? 'ok' : 'blocked';
  return makeCheck({
    id: 'enquiriesFresh',
    label: 'Enquiries freshness',
    blocking: true,
    status,
    ageSeconds: ageS,
    source: 'sql',
    threshold: { maxAgeSeconds: maxAge },
    measured: { latestTouchpoint: latest ? new Date(latest).toISOString() : null },
    reason: status === 'blocked' ? 'stale-watermark' : null,
    message: status === 'blocked'
      ? `Latest enquiry touchpoint is ${Math.round((ageS || 0) / 60)} minutes old (limit ${Math.round(maxAge / 60)} min).`
      : null,
    remediation: status === 'blocked' ? 'check-enquiries-ingest' : null,
  });
}

async function evaluateMattersFresh(connStr) {
  if (!connStr) {
    return makeCheck({
      id: 'mattersFresh',
      label: 'Matters freshness',
      status: 'unknown',
      reason: 'no-core-connection',
      message: 'Core SQL connection unavailable.',
    });
  }

  const resolvedDateExpressions = await getMatterDateExpressions(connStr);
  const freshnessExpressions = resolvedDateExpressions.filter((expression) => !/close/i.test(expression));
  const freshnessCandidates = freshnessExpressions.length ? freshnessExpressions : resolvedDateExpressions;

  if (!freshnessCandidates.length) {
    return makeCheck({
      id: 'mattersFresh',
      label: 'Matters freshness',
      status: 'unknown',
      reason: 'no-date-column',
      message: 'No recognised matters date column found.',
      remediation: 'check-matters-schema',
    });
  }

  const freshnessExpression = freshnessCandidates.length === 1
    ? freshnessCandidates[0]
    : `COALESCE(${freshnessCandidates.join(', ')})`;

  const latest = await withRequest(connStr, async (request) => {
    const r = await request.query(`
      SELECT MAX(TRY_CONVERT(datetime2, ${freshnessExpression})) AS latest
      FROM [dbo].[matters]
    `);
    return r.recordset?.[0]?.latest || null;
  });
  const ageS = ageSeconds(latest);
  const status = ageS == null ? 'unknown' : ageS <= MATTERS_MAX_AGE_S ? 'ok' : 'blocked';
  return makeCheck({
    id: 'mattersFresh',
    label: 'Matters freshness',
    blocking: true,
    status,
    ageSeconds: ageS,
    source: 'sql',
    threshold: { maxAgeSeconds: MATTERS_MAX_AGE_S },
    measured: { latestMatterDate: latest ? new Date(latest).toISOString() : null },
    reason: status === 'blocked' ? 'stale-watermark' : null,
    message: status === 'blocked'
      ? `Most recent matter record is ${Math.round((ageS || 0) / 60)} minutes old (limit ${Math.round(MATTERS_MAX_AGE_S / 60)} min).`
      : null,
    remediation: status === 'blocked' ? 'check-matters-ingest' : null,
  });
}

async function evaluateDataOpsScheduler() {
  const snapshot = await getPersistedSchedulerSnapshot(80);
  if (!snapshot || !snapshot.tiers) {
    return makeCheck({
      id: 'dataOpsScheduler',
      label: 'Data-ops scheduler',
      status: 'unknown',
      reason: 'no-snapshot',
      message: 'Could not read persisted scheduler history.',
    });
  }

  const now = Date.now();
  const issues = [];
  let oldestAgeS = null;

  for (const [entity, cadence] of Object.entries(CURRENT_FILL_CADENCE_MS)) {
    const currentTier = snapshot.tiers?.[entity]?.currentHourly?.lastRun || null;
    const recentRuns = Array.isArray(snapshot.recentRuns) ? snapshot.recentRuns : [];
    const latestRepairRun = recentRuns
      .filter((run) => run.entity === entity && (TERMINAL_SUCCESS_STATUSES.has(run.status) || TERMINAL_FAILURE_STATUSES.has(run.status)))
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))[0] || null;
    const latest = [currentTier, latestRepairRun]
      .filter(Boolean)
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))[0] || null;

    if (!latest) {
      issues.push({ entity, tier: 'currentHourly', reason: 'no-current-fill' });
      continue;
    }

    const ageMs = now - Number(latest.ts || 0);
    const ageS = Math.round(ageMs / 1000);
    if (oldestAgeS == null || ageS > oldestAgeS) oldestAgeS = ageS;
    if (TERMINAL_FAILURE_STATUSES.has(latest.status)) {
      issues.push({
        entity,
        tier: 'currentHourly',
        reason: 'current-fill-failed',
        ageSeconds: ageS,
        message: latest.message || null,
      });
    } else if (ageMs > cadence * 2) {
      issues.push({ entity, tier: 'currentHourly', reason: 'current-fill-overdue', ageSeconds: ageS });
    }
  }

  const status = issues.length === 0 ? 'ok' : 'blocked';
  return makeCheck({
    id: 'dataOpsScheduler',
    label: 'Data-ops scheduler',
    blocking: true,
    status,
    ageSeconds: oldestAgeS,
    source: 'snapshot',
    measured: { issues: issues.length, firstIssueEntity: issues[0]?.entity || null },
    reason: issues[0]?.reason || null,
    message: status === 'blocked'
      ? `Scheduler fill issues: ${issues.map((i) => `${i.entity}:${i.reason}${i.message ? ` (${i.message})` : ''}`).join(', ')}`
      : null,
    remediation: status === 'blocked' ? 'check-scheduler-logs' : null,
  });
}

async function evaluateTeamData(connStr) {
  if (!connStr) {
    return makeCheck({
      id: 'teamData', label: 'Team data', blocking: false, status: 'unknown',
      reason: 'no-core-connection',
    });
  }
  const row = await withRequest(connStr, async (request) => {
    const r = await request.query(`SELECT COUNT(*) AS cnt, MAX([Created Date]) AS latest FROM [dbo].[team]`);
    return r.recordset?.[0] || null;
  });
  const ageS = ageSeconds(row?.latest);
  const status = !row || row.cnt === 0
    ? 'warn'
    : (ageS != null && ageS > TEAM_MAX_AGE_S)
      ? 'warn'
      : 'ok';
  return makeCheck({
    id: 'teamData',
    label: 'Team data',
    blocking: false,
    status,
    ageSeconds: ageS,
    source: 'sql',
    threshold: { maxAgeSeconds: TEAM_MAX_AGE_S },
    measured: { rowCount: row?.cnt ?? 0 },
    reason: status === 'warn' ? (row?.cnt ? 'stale-watermark' : 'empty-table') : null,
    message: status === 'warn' ? 'Team data may be stale or empty.' : null,
  });
}

function evaluateUserData(req) {
  const user = req.user || null;
  const initials = user?.initials || null;
  const status = initials ? 'ok' : 'warn';
  return makeCheck({
    id: 'userData',
    label: 'User context',
    blocking: false,
    status,
    source: 'inferred',
    measured: { initials: initials || null },
    reason: status === 'warn' ? 'no-initials' : null,
    message: status === 'warn' ? 'User initials not resolved.' : null,
  });
}

async function evaluateAnnualLeave(instructionsConnStr) {
  // Annual leave lives in the operations DB; tolerate absence of the table.
  if (!instructionsConnStr) {
    return makeCheck({
      id: 'annualLeave', label: 'Annual leave', blocking: false, status: 'unknown',
      reason: 'no-instructions-connection',
    });
  }
  try {
    const row = await withRequest(instructionsConnStr, async (request) => {
      const r = await request.query(`
        SELECT TOP 1
          modify_date AS latest,
          CAST(1 AS INT) AS cnt
        FROM sys.tables
        WHERE name = 'annualLeave'
      `);
      return r.recordset?.[0] || null;
    });
    const ageS = ageSeconds(row?.latest);
    // We can't reliably read annualLeave row-level timestamps here without coupling to the table shape.
    // For Phase A treat the table's existence as enough to keep the signal non-blocking.
    const status = row && row.cnt > 0 ? 'ok' : 'warn';
    return makeCheck({
      id: 'annualLeave',
      label: 'Annual leave',
      blocking: false,
      status,
      ageSeconds: ageS,
      source: 'sql',
      threshold: { maxAgeSeconds: ANNUAL_LEAVE_MAX_AGE_S },
      measured: { tablePresent: Boolean(row?.cnt), latestSchemaChange: row?.latest ? new Date(row.latest).toISOString() : null },
      reason: status === 'warn' ? 'table-missing' : null,
      message: status === 'warn' ? 'Annual leave table unavailable.' : null,
    });
  } catch (err) {
    return unknownFromError('annualLeave', 'Annual leave', false, err);
  }
}

// ─── Main route ───

router.get('/management-readiness', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = req.user?.initials || 'unknown';
  const readOnly = String(process.env[READ_ONLY_FLAG] || '').toLowerCase() === '1'
    || String(process.env[READ_ONLY_FLAG] || '').toLowerCase() === 'true';

  // Cache first.
  if (payloadCache.value && payloadCache.expiresAt > startedAt) {
    trackEvent('Reporting.Readiness.Served.FromCache', { triggeredBy, readOnly: String(readOnly) });
    return res.json({ ...payloadCache.value, fromCache: true });
  }

  const coreConn = process.env.SQL_CONNECTION_STRING;
  const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  // Each check wrapped in timeout + safe error handling.
  const guard = (id, label, blocking, fn) =>
    withTimeout(Promise.resolve().then(fn), CHECK_TIMEOUT_MS, `readiness:${id}`)
      .then((check) => {
        const checkStartedAt = Date.now();
        trackMetric('Reporting.Readiness.Check.Duration', Date.now() - checkStartedAt, { checkId: id });
        return check;
      })
      .catch((err) => {
        trackException(err, { operation: 'management-readiness', phase: id });
        trackEvent('Reporting.Readiness.Check.Failed', { checkId: id, error: err.message || 'unknown' });
        return unknownFromError(id, label, blocking, err);
      });

  trackEvent('Reporting.Readiness.Build.Started', { triggeredBy, readOnly: String(readOnly) });

  let checks;
  try {
    checks = await Promise.all([
      guard('collectedMtd', 'Collected MTD parity', true, () =>
        evaluateParityFromSnapshot({
          id: 'collectedMtd',
          label: 'Collected parity (rolling 6 months)',
          scope: 'collected',
          // Phase A — include rolling per-month rows alongside the legacy current-month keys.
          sourceCheckKeys: ['collected-current-month', 'collected-month-'],
        })
      ),
      guard('wipWtd', 'WIP WTD parity', true, () =>
        evaluateParityFromSnapshot({
          id: 'wipWtd',
          label: 'WIP WTD parity',
          scope: 'wip',
          sourceCheckKeys: ['wip-current-week', 'wip-week'],
        })
      ),
      guard('enquiriesFresh', 'Enquiries freshness', true, () => evaluateEnquiriesFresh(coreConn)),
      guard('mattersFresh', 'Matters freshness', true, () => evaluateMattersFresh(coreConn)),
      guard('dataOpsScheduler', 'Data-ops scheduler', true, () => evaluateDataOpsScheduler()),
      guard('teamData', 'Team data', false, () => evaluateTeamData(coreConn)),
      guard('userData', 'User context', false, () => Promise.resolve(evaluateUserData(req))),
      guard('annualLeave', 'Annual leave', false, () => evaluateAnnualLeave(instructionsConn)),
    ]);
  } catch (err) {
    // Should be unreachable because each check is guarded, but keep a hard floor.
    trackException(err, { operation: 'management-readiness', phase: 'assemble' });
    return res.status(500).json({ error: 'Failed to assemble readiness payload' });
  }

  // Decorate lastGoodAt and decide overall.
  for (const c of checks) recordLastGood(c);
  const blockedAny = checks.some((c) => c.blocking && c.status === 'blocked');
  const warnAny = checks.some((c) => c.status === 'warn' || (c.blocking && c.status === 'unknown'));
  const overall = blockedAny ? 'blocked' : warnAny ? 'warn' : 'ready';

  const buildMs = Date.now() - startedAt;
  const payload = {
    generatedAt: new Date(startedAt).toISOString(),
    overall,
    buildMs,
    fromCache: false,
    checks,
  };

  payloadCache = { value: payload, expiresAt: startedAt + CACHE_TTL_MS };

  trackEvent(`Reporting.Readiness.Overall.${overall === 'ready' ? 'Ready' : overall === 'warn' ? 'Warn' : 'Blocked'}`, {
    triggeredBy,
    buildMs: String(buildMs),
    blockedCount: String(checks.filter((c) => c.status === 'blocked').length),
    warnCount: String(checks.filter((c) => c.status === 'warn').length),
    unknownCount: String(checks.filter((c) => c.status === 'unknown').length),
  });
  trackMetric('Reporting.Readiness.Build.Duration', buildMs, { overall });

  res.json(payload);
});

/** Force-clear the cache. Useful for tests and the manual `Retry` button. */
router.post('/management-readiness/refresh', (req, res) => {
  payloadCache = { value: null, expiresAt: 0 };
  trackEvent('Reporting.Readiness.Cache.Cleared', { triggeredBy: req.user?.initials || 'unknown' });
  res.json({ ok: true });
});

// ─── Phase D: remediation loop ────────────────────────────────────────────
// Per-(checkId+initials) attempt counter. After ATTEMPT_CEILING failed
// remediations we escalate to Teams instead of letting the user keep
// hammering the button. State is in-memory only — fine for the sub-day
// horizon the gate cares about; a bounce wipes it.
const ATTEMPT_CEILING = 2;
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000; // 30 min sliding window
const remediationAttempts = new Map(); // key -> { count, firstAt, lastError }

function attemptKey(checkId, initials) {
  return `${checkId}:${initials || 'anon'}`;
}

function readAttempts(key) {
  const now = Date.now();
  const entry = remediationAttempts.get(key);
  if (!entry) return { count: 0, firstAt: now, lastError: null };
  if (now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    remediationAttempts.delete(key);
    return { count: 0, firstAt: now, lastError: null };
  }
  return entry;
}

const REMEDIATORS = {
  collectedMtd: {
    label: 'Collected MTD parity',
    async run({ initials }) {
      // Re-run the same syncCollectedTime the scheduler uses, MTD scope.
      const result = await syncCollectedTime({
        daysBack: 0,
        triggeredBy: 'trustGate.remediate',
        invokedBy: initials || null,
      });
      // CRITICAL: refresh the reconciliation snapshot so the next readiness
      // build sees the post-sync parity, not the stale pre-sync drift.
      // Without this the check stays blocked even though the sync succeeded.
      try {
        await refreshReconciliationSnapshot('collected');
      } catch (snapErr) {
        // Don't fail remediation if snapshot rebuild fails — surface as warn
        // via telemetry; the next periodic snapshot will catch up.
        trackException(snapErr, {
          operation: 'Reporting.Readiness.Remediate',
          phase: 'refreshSnapshot',
          checkId: 'collectedMtd',
        });
      }
      return result;
    },
  },
};

router.post('/management-readiness/remediate', async (req, res) => {
  const startedAt = Date.now();
  const checkId = String(req.body?.checkId || '').trim();
  const initials = req.user?.initials || req.body?.initials || 'unknown';

  const remediator = REMEDIATORS[checkId];
  if (!remediator) {
    return res.status(400).json({
      ok: false, error: `No remediator registered for checkId='${checkId}'`,
    });
  }

  if (process.env[READ_ONLY_FLAG] === '1') {
    trackEvent('Reporting.Readiness.Remediate.Suppressed', { checkId, reason: 'read-only', initials });
    return res.status(503).json({
      ok: false, error: 'Trust gate is in read-only mode (HELIX_TRUST_GATE_READ_ONLY=1)',
    });
  }

  const key = attemptKey(checkId, initials);
  const before = readAttempts(key);

  trackEvent('Reporting.Readiness.Remediate.Started', {
    checkId, initials, attempt: String(before.count + 1),
  });

  let runError = null;
  let runResult = null;
  try {
    runResult = await remediator.run({ initials });
  } catch (err) {
    runError = err;
    trackException(err, { operation: 'Reporting.Readiness.Remediate', checkId });
  }

  const durationMs = Date.now() - startedAt;
  trackMetric('Reporting.Readiness.Remediate.Duration', durationMs, { checkId });

  // Force the next /management-readiness call to re-evaluate freshly.
  payloadCache = { value: null, expiresAt: 0 };

  if (runError) {
    const next = {
      count: before.count + 1,
      firstAt: before.firstAt,
      lastError: runError.message || String(runError),
    };
    remediationAttempts.set(key, next);

    if (next.count >= ATTEMPT_CEILING) {
      const escalation = await escalate({
        checkId,
        checkLabel: remediator.label,
        attempts: next.count,
        initials,
        lastError: next.lastError,
      });
      trackEvent('Reporting.Readiness.Remediate.Failed', {
        checkId, attempt: String(next.count), escalated: 'true',
        escalationStatus: escalation.ok ? 'sent' : (escalation.suppressed ? 'suppressed' : 'failed'),
        durationMs: String(durationMs),
      });
      return res.status(202).json({
        ok: false,
        status: 'escalated',
        attempts: next.count,
        escalated: escalation.ok,
        escalationDetail: escalation,
        error: next.lastError,
      });
    }

    trackEvent('Reporting.Readiness.Remediate.Failed', {
      checkId, attempt: String(next.count), escalated: 'false',
      durationMs: String(durationMs),
    });
    return res.status(502).json({
      ok: false,
      status: 'persisted',
      attempts: next.count,
      attemptsRemaining: ATTEMPT_CEILING - next.count,
      error: next.lastError,
    });
  }

  // Success — clear attempt counter for this key.
  remediationAttempts.delete(key);
  trackEvent('Reporting.Readiness.Remediate.Resolved', {
    checkId, initials, durationMs: String(durationMs),
  });
  return res.json({
    ok: true,
    status: 'resolved',
    durationMs,
    result: runResult ? {
      // Surface a small, safe slice — no full row dumps.
      deletedRows: runResult.deletedRows ?? null,
      insertedRows: runResult.insertedRows ?? null,
      syncDurationMs: runResult.durationMs ?? null,
      noData: runResult.noData === true,
    } : null,
  });
});

module.exports = router;
