/**
 * Audit Lens route.
 *
 * Operator god-mode P3.
 * Brief: docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md §3
 *
 * Purpose
 *   Pressure-release valve for LZ/AC. Type a user's initials, see every
 *   action that user took (or that fired for that user) in a window.
 *   Unified timeline across form intents (matched + orphaned),
 *   form submissions, AI proposals, and telemetry events tagged with
 *   feeEarner. Each row is classified by kind (user / system / background)
 *   so the operator can instantly see "did they do this or did the
 *   system fire it?".
 *
 * Endpoints
 *   GET /api/audit/team
 *     -> { ok, members: [{ initials, name, email }] }
 *
 *   GET /api/audit/user/:initials?since=ISO&until=ISO&includeBackground=0|1
 *     -> { ok, initials, since, until, stats, rows }
 *
 * Failure model
 *   Best-effort per source. If any single source query fails we still
 *   return rows from the others so the lens never goes dark.
 */
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();

const { withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');
const opLog = require('../utils/opLog');
const { createEnvBasedQueryRunner } = require('../utils/sqlHelpers');

const runTeamQuery = createEnvBasedQueryRunner('SQL_CONNECTION_STRING');

function getOpsConnStr() {
  if (String(process.env.FORM_SUBMISSIONS_USE_LEGACY || '').toLowerCase() === 'true') {
    return process.env.SQL_CONNECTION_STRING || null;
  }
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() === 'true' && process.env.OPS_SQL_CONNECTION_STRING) {
    return process.env.OPS_SQL_CONNECTION_STRING;
  }
  return process.env.SQL_CONNECTION_STRING || null;
}

const auditLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.initials || ipKeyGenerator(req) || 'anon').toString().toUpperCase(),
  handler: (req, res) => {
    trackEvent('Audit.Lens.RateLimited', { user: req.user?.initials, ip: req.ip });
    res.status(429).json({ ok: false, error: 'rate_limited' });
  },
});

router.use(auditLimiter);

const BACKGROUND_TYPE_PATTERNS = [
  /^telemetry\..*\.heartbeat$/i,
  /^telemetry\.Nav\.navigate\.process$/i,
  /\.heartbeat$/i,
];

function classifyKind(opLogType) {
  if (!opLogType) return 'system';
  if (BACKGROUND_TYPE_PATTERNS.some((re) => re.test(opLogType))) return 'background';
  // Anything client-prefixed and not heartbeat/process is a user action.
  if (/^telemetry\./i.test(opLogType)) return 'user';
  return 'system';
}

function classifyStatus(opLogType, status, error) {
  if (status === 'error' || error) return 'error';
  if (status === 'warn' || /warn/i.test(opLogType || '')) return 'warning';
  if (/error|failed/i.test(opLogType || '')) return 'error';
  if (status === 'ok' || status === 'success') return 'ok';
  return 'info';
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

const OPTIONAL_AUDIT_SCHEMA_TOKENS = [
  'form_submission_intents',
  'form_submissions',
  'ai_proposals',
  'client_submission_id',
];

function getErrorText(err) {
  const parts = [err?.message, err?.originalError?.message];
  if (Array.isArray(err?.precedingErrors)) {
    for (const preceding of err.precedingErrors) parts.push(preceding?.message);
  }
  return parts.filter(Boolean).join(' ');
}

function isOptionalAuditSchemaError(err) {
  const text = getErrorText(err);
  return /Invalid (object|column) name/i.test(text)
    && OPTIONAL_AUDIT_SCHEMA_TOKENS.some((token) => text.includes(token));
}

function recordAuditSourceError(sourceErrors, source, err, context) {
  sourceErrors.push(source);
  if (isOptionalAuditSchemaError(err)) {
    trackEvent('Audit.Lens.OptionalSourceUnavailable', {
      ...context,
      source,
      error: getErrorText(err).slice(0, 240),
    });
    return;
  }
  trackException(err, context);
}

/**
 * GET /api/audit/team
 * Returns the team-member directory the lens uses for initials autocomplete.
 */
router.get('/team', async (req, res) => {
  try {
    const result = await runTeamQuery((request, s) =>
      request.query(`
        SELECT Initials, Email, [Full Name] AS FullName
        FROM dbo.team
        WHERE Initials IS NOT NULL AND LEN(Initials) > 0
        ORDER BY Initials ASC
      `)
    );
    const members = (result?.recordset || []).map((row) => ({
      initials: (row.Initials || '').toString().toUpperCase().trim(),
      email: row.Email || null,
      name: (row.FullName || '').toString().trim() || null,
    })).filter((m) => m.initials);
    return res.json({ ok: true, members });
  } catch (err) {
    trackException(err, { phase: 'audit.team' });
    return res.json({ ok: true, members: [], reason: 'query_failed' });
  }
});

/**
 * GET /api/audit/user/:initials?since=ISO&until=ISO&includeBackground=0|1
 */
router.get('/user/:initials', async (req, res) => {
  const startedMs = Date.now();
  const initials = (req.params.initials || '').toString().toUpperCase().trim();
  if (!initials || initials.length > 16) {
    return res.status(400).json({ ok: false, error: 'invalid_initials' });
  }

  const now = new Date();
  const defaultSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since = req.query.since ? new Date(String(req.query.since)) : defaultSince;
  const until = req.query.until ? new Date(String(req.query.until)) : now;
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since >= until) {
    return res.status(400).json({ ok: false, error: 'invalid_range' });
  }
  // Hard cap the window so a runaway query can't drag the lens down.
  const MAX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  if (until.getTime() - since.getTime() > MAX_WINDOW_MS) {
    return res.status(400).json({ ok: false, error: 'window_too_large', maxDays: 14 });
  }
  const includeBackground = String(req.query.includeBackground || '0') === '1';
  const rowLimit = Math.max(50, Math.min(1000, Number(req.query.limit) || 500));

  const connStr = getOpsConnStr();
  const rows = [];
  const sourceErrors = [];

  // --- 1. form_submission_intents ---------------------------------------
  if (connStr) {
    try {
      const intentResult = await withRequest(connStr, async (request, sql) => {
        request.input('initials', sql.NVarChar(16), initials);
        request.input('since', sql.DateTime2, since);
        request.input('until', sql.DateTime2, until);
        request.input('lim', sql.Int, rowLimit);
        return request.query(`
          SELECT TOP (@lim)
            id, client_submission_id, form_key, submitted_by, created_at,
            matched_submission_id, matched_at, orphan_notified_at, route
          FROM dbo.form_submission_intents
          WHERE submitted_by = @initials
            AND created_at >= @since
            AND created_at < @until
          ORDER BY created_at DESC;
        `);
      });
      const intentRows = intentResult?.recordset || [];
      const orphanThresholdMs = 120 * 1000;
      for (const r of intentRows) {
        const createdAtIso = toIso(r.created_at);
        const matchedAtIso = toIso(r.matched_at);
        const matched = !!r.matched_submission_id;
        const ageMs = createdAtIso ? Date.now() - new Date(createdAtIso).getTime() : 0;
        const isOrphan = !matched && ageMs > orphanThresholdMs;
        const status = matched ? 'ok' : (isOrphan ? 'error' : 'warning');
        const summaryBits = [];
        summaryBits.push(matched ? 'submission landed' : (isOrphan ? 'no matching submission' : 'awaiting submission'));
        if (r.route) summaryBits.push(`route ${r.route}`);
        rows.push({
          id: `intent-${r.id}`,
          source: 'forms.intent',
          sourceLabel: matched ? 'Form intent (matched)' : (isOrphan ? 'Form intent (orphan)' : 'Form intent (pending)'),
          kind: 'user',
          status,
          title: `Pressed Submit on ${r.form_key}`,
          summary: summaryBits.join(' · '),
          timestamp: matchedAtIso || createdAtIso,
          createdAt: createdAtIso,
          extras: {
            clientSubmissionId: r.client_submission_id,
            formKey: r.form_key,
            matchedSubmissionId: r.matched_submission_id || null,
            orphanNotifiedAt: toIso(r.orphan_notified_at),
            route: r.route || null,
          },
        });
      }
    } catch (err) {
      recordAuditSourceError(sourceErrors, 'intents', err, { phase: 'audit.intents', initials });
    }
  }

  // --- 2. form_submissions ---------------------------------------------
  if (connStr) {
    try {
      const subResult = await withRequest(connStr, async (request, sql) => {
        request.input('initials', sql.NVarChar(16), initials);
        request.input('since', sql.DateTime2, since);
        request.input('until', sql.DateTime2, until);
        request.input('lim', sql.Int, rowLimit);
        return request.query(`
          SELECT TOP (@lim)
            id, form_key, submitted_by, submitted_at, lane, summary,
            processing_status, last_event, last_event_at, client_submission_id
          FROM dbo.form_submissions
          WHERE submitted_by = @initials
            AND COALESCE(last_event_at, submitted_at) >= @since
            AND COALESCE(last_event_at, submitted_at) < @until
          ORDER BY COALESCE(last_event_at, submitted_at) DESC;
        `);
      });
      const subRows = subResult?.recordset || [];
      for (const r of subRows) {
        const ps = String(r.processing_status || '').toLowerCase();
        let status = 'info';
        if (ps === 'complete' || ps === 'completed' || ps === 'ok') status = 'ok';
        else if (ps === 'failed' || ps === 'error') status = 'error';
        else if (ps === 'pending' || ps === 'processing') status = 'warning';
        const summaryBits = [`form ${r.form_key}`];
        if (r.lane) summaryBits.push(r.lane);
        if (r.last_event) summaryBits.push(r.last_event);
        if (r.processing_status) summaryBits.push(`status ${r.processing_status}`);
        rows.push({
          id: `submission-${r.id}`,
          source: 'forms.submission',
          sourceLabel: 'Form submission',
          kind: 'user',
          status,
          title: r.summary || `Submitted ${r.form_key}`,
          summary: summaryBits.join(' · '),
          timestamp: toIso(r.last_event_at || r.submitted_at),
          createdAt: toIso(r.submitted_at),
          extras: {
            submissionId: String(r.id),
            formKey: r.form_key,
            clientSubmissionId: r.client_submission_id || null,
            processingStatus: r.processing_status || null,
            lane: r.lane || null,
          },
        });
      }
    } catch (err) {
      recordAuditSourceError(sourceErrors, 'submissions', err, { phase: 'audit.submissions', initials });
    }
  }

  // --- 3. ai_proposals --------------------------------------------------
  if (connStr) {
    try {
      const aiResult = await withRequest(connStr, async (request, sql) => {
        request.input('initials', sql.NVarChar(16), initials);
        request.input('since', sql.DateTime2, since);
        request.input('until', sql.DateTime2, until);
        request.input('lim', sql.Int, rowLimit);
        return request.query(`
          SELECT TOP (@lim)
            id, created_at, created_by, surface, target_kind,
            confidence_summary, outcome, outcome_at
          FROM dbo.ai_proposals
          WHERE created_by = @initials
            AND COALESCE(outcome_at, created_at) >= @since
            AND COALESCE(outcome_at, created_at) < @until
          ORDER BY COALESCE(outcome_at, created_at) DESC;
        `);
      });
      const aiRows = aiResult?.recordset || [];
      for (const r of aiRows) {
        const outcome = String(r.outcome || 'pending').toLowerCase();
        let status = 'info';
        if (outcome === 'accepted') status = 'ok';
        else if (outcome === 'failed' || outcome === 'rejected') status = 'error';
        else if (outcome === 'pending') status = 'warning';
        const summaryBits = [];
        if (r.surface) summaryBits.push(r.surface);
        if (r.target_kind) summaryBits.push(r.target_kind);
        summaryBits.push(`outcome ${outcome}`);
        if (r.confidence_summary) summaryBits.push(r.confidence_summary);
        rows.push({
          id: `ai-${r.id}`,
          source: 'ai.proposal',
          sourceLabel: `AI proposal (${r.surface || 'unknown'})`,
          kind: 'system',
          status,
          title: `AI proposal: ${r.target_kind || r.surface || 'unspecified'}`,
          summary: summaryBits.join(' · '),
          timestamp: toIso(r.outcome_at || r.created_at),
          createdAt: toIso(r.created_at),
          extras: {
            proposalId: String(r.id),
            surface: r.surface || null,
            outcome: r.outcome || null,
          },
        });
      }
    } catch (err) {
      recordAuditSourceError(sourceErrors, 'aiProposals', err, { phase: 'audit.ai', initials });
    }
  }

  // --- 4. opLog telemetry (in-memory ring) ------------------------------
  try {
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const logEntries = opLog.list({ limit: 1000, since: sinceIso });
    for (const e of logEntries) {
      const ts = e.ts || e.clientTimestamp || null;
      if (!ts || ts < sinceIso || ts >= untilIso) continue;
      const feeEarner = (e.feeEarner || '').toString().toUpperCase().trim();
      if (feeEarner !== initials) continue;
      const kind = classifyKind(e.type);
      if (!includeBackground && kind === 'background') continue;
      const status = classifyStatus(e.type, e.status, e.error);
      const summaryBits = [];
      if (e.route) summaryBits.push(e.route);
      if (e.data && typeof e.data === 'object') {
        if (e.data.path) summaryBits.push(`path ${e.data.path}`);
        if (e.data.tab) summaryBits.push(`tab ${e.data.tab}`);
      }
      if (Number.isFinite(e.durationMs)) summaryBits.push(`${e.durationMs}ms`);
      if (e.error) summaryBits.push(String(e.error).slice(0, 120));
      rows.push({
        id: `op-${e.id || ts}`,
        source: e.type || 'telemetry.unknown',
        sourceLabel: e.type || 'Telemetry',
        kind,
        status,
        title: e.type || 'Telemetry event',
        summary: summaryBits.join(' · ') || 'no details',
        timestamp: ts,
        createdAt: ts,
        extras: {
          clientSessionId: e.clientSessionId || null,
          entityRef: e.entityRef || null,
        },
      });
    }
  } catch (err) {
    sourceErrors.push('telemetry');
    trackException(err, { phase: 'audit.telemetry', initials });
  }

  // --- merge / sort / cap ----------------------------------------------
  rows.sort((a, b) => {
    const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bt - at;
  });
  const capped = rows.slice(0, rowLimit);

  const stats = {
    total: capped.length,
    ok: 0,
    warning: 0,
    error: 0,
    info: 0,
    user: 0,
    system: 0,
    background: 0,
    orphans: 0,
    truncated: rows.length > capped.length,
    sourceErrors,
  };
  for (const r of capped) {
    stats[r.status] = (stats[r.status] || 0) + 1;
    stats[r.kind] = (stats[r.kind] || 0) + 1;
    if (r.source === 'forms.intent' && /orphan/i.test(r.sourceLabel)) stats.orphans += 1;
  }

  trackEvent('Audit.Lens.Query', {
    initialsFilter: initials,
    sinceIso: since.toISOString(),
    untilIso: until.toISOString(),
    rowsReturned: capped.length,
    durationMs: Date.now() - startedMs,
    sourceErrors: sourceErrors.join(',') || null,
  });

  return res.json({
    ok: true,
    initials,
    since: since.toISOString(),
    until: until.toISOString(),
    includeBackground,
    stats,
    rows: capped,
  });
});

module.exports = router;
