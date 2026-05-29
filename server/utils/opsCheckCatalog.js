const { getRequestUser } = require('./userTier');
const { withRequest } = require('./db');

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RECENT_RUNS = 25;
const DATA_OPS_MAX_CURRENT_FILL_AGE_MS = 2 * 60 * 60 * 1000;
const DATA_OPS_MAX_COLLECTED_LAG_MS = 72 * 60 * 60 * 1000;
const DATA_OPS_MAX_WIP_LAG_MS = 36 * 60 * 60 * 1000;
const DATA_OPS_TERMINAL_FAILURES = new Set(['error', 'failed', 'timeout']);
const latestRunsByCheck = new Map();
const recentRuns = [];

class OpsCheckInputError extends Error {
  constructor(message, fields = []) {
    super(message);
    this.name = 'OpsCheckInputError';
    this.statusCode = 400;
    this.code = 'ops_check_input_invalid';
    this.fields = fields;
  }
}

function withTimeout(promiseFactory, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  return promiseFactory(controller.signal)
    .then((value) => ({ ...value, durationMs: Date.now() - startedAt }))
    .catch((error) => ({
      ok: false,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      error: error?.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : error?.message || String(error),
    }))
    .finally(() => clearTimeout(timeout));
}

function getRequestOrigin(req) {
  const protoHeader = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = protoHeader || req.protocol || (req.secure ? 'https' : 'http');
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  return `${proto}://${host}`;
}

function getForwardedIdentityHeaders(req) {
  const user = getRequestUser(req);
  const headers = {
    accept: 'application/json,text/plain,*/*',
    'user-agent': 'helix-ops-checks/1.0',
  };
  if (user.initials) headers['x-helix-initials'] = user.initials;
  if (user.email) headers['x-user-email'] = user.email;
  if (user.entraId) headers['x-helix-entra-id'] = user.entraId;
  return headers;
}

function dependencyStatusFromHttp(statusCode, severity = 'blocking') {
  if (statusCode >= 200 && statusCode < 400) return 'pass';
  if (severity === 'noise' && statusCode >= 400 && statusCode < 500) return 'warn';
  return 'fail';
}

function summarizeStatus(dependencies) {
  const blockingFail = dependencies.some((dep) => dep.status === 'fail' && dep.severity === 'blocking');
  if (blockingFail) return 'fail';
  const anyIssue = dependencies.some((dep) => dep.status !== 'pass');
  return anyIssue ? 'warn' : 'pass';
}

function summarizeDependencyIssues(dependencies) {
  return dependencies
    .filter((dependency) => dependency.status !== 'pass')
    .slice(0, 4)
    .map((dependency) => ({
      name: dependency.name,
      status: dependency.status,
      severity: dependency.severity,
      statusCode: dependency.statusCode ?? null,
      detail: dependency.detail || '',
    }));
}

function toSummaryItem(result, triggeredBy = 'unknown') {
  const dependencyResults = Array.isArray(result.dependencyResults) ? result.dependencyResults : [];
  const ts = Date.parse(result.checkedAt || '');
  return {
    id: result.id,
    label: result.label,
    group: result.group,
    risk: result.risk,
    status: result.status,
    durationMs: result.durationMs,
    checkedAt: result.checkedAt,
    ts: Number.isNaN(ts) ? Date.now() : ts,
    triggeredBy,
    dependencyCount: dependencyResults.length,
    failingBlockingCount: dependencyResults.filter((dependency) => dependency.status === 'fail' && dependency.severity === 'blocking').length,
    degradedIssueCount: dependencyResults.filter((dependency) => dependency.status !== 'pass' && dependency.severity === 'degraded').length,
    noiseIssueCount: dependencyResults.filter((dependency) => dependency.status !== 'pass' && dependency.severity === 'noise').length,
    issues: summarizeDependencyIssues(dependencyResults),
  };
}

function appendRecentRun(item) {
  recentRuns.push(item);
  if (recentRuns.length > MAX_RECENT_RUNS) recentRuns.shift();
}

async function fetchProbe(url, { method = 'GET', headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, expected = (status) => status >= 200 && status < 400 } = {}) {
  return withTimeout(async (signal) => {
    const response = await fetch(url, {
      method,
      headers,
      signal,
      redirect: 'follow',
    });
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }
    return {
      ok: expected(response.status),
      statusCode: response.status,
      size: body.length,
      contentType: response.headers.get('content-type') || null,
    };
  }, timeoutMs);
}

async function fetchJsonProbe(url, { method = 'GET', headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, expected = (status) => status >= 200 && status < 400 } = {}) {
  return withTimeout(async (signal) => {
    const response = await fetch(url, {
      method,
      headers,
      signal,
      redirect: 'follow',
    });
    let body = '';
    let json = null;
    try {
      body = await response.text();
      json = body ? JSON.parse(body) : null;
    } catch {
      json = null;
    }
    return {
      ok: expected(response.status),
      statusCode: response.status,
      size: body.length,
      contentType: response.headers.get('content-type') || null,
      json,
    };
  }, timeoutMs);
}

function normalizeInputValue(field, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';
  if (field.kind === 'initials') return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
  if (field.kind === 'instruction-ref') return value.toUpperCase().replace(/\s+/g, '').slice(0, 80);
  if (field.kind === 'passcode') return value.slice(0, 120);
  return value.slice(0, 240);
}

function normalizeCheckInputs(check, rawInputs = {}) {
  const schema = Array.isArray(check.inputSchema) ? check.inputSchema : [];
  const inputs = {};
  const missing = [];

  for (const field of schema) {
    const value = normalizeInputValue(field, rawInputs[field.key]);
    if (field.required && !value) missing.push(field.key);
    inputs[field.key] = value;
  }

  if (missing.length > 0) {
    throw new OpsCheckInputError('Required check input missing.', missing);
  }

  return inputs;
}

function routeCheck({ id, label, target, dependencies, whatWillHappen, successCriteria, timeoutMs = 5000 }) {
  return {
    id,
    label,
    group: 'route',
    risk: 'safe',
    runMode: 'safe',
    method: 'GET',
    target,
    dependencies,
    whatWillHappen,
    successCriteria,
    timeoutMs,
    async run(context) {
      const url = new URL(target, getRequestOrigin(context.req)).toString();
      const probe = await fetchProbe(url, {
        method: 'GET',
        headers: getForwardedIdentityHeaders(context.req),
        timeoutMs,
      });
      const status = dependencyStatusFromHttp(probe.statusCode || 0, 'blocking');
      const dependencyResults = [{
        name: label,
        status,
        severity: 'blocking',
        statusCode: probe.statusCode,
        durationMs: probe.durationMs,
        detail: probe.ok ? `HTTP ${probe.statusCode}` : probe.error || `HTTP ${probe.statusCode || 'unavailable'}`,
        evidence: {
          path: target,
          contentType: probe.contentType,
          bytes: probe.size,
        },
      }];
      return {
        status: summarizeStatus(dependencyResults),
        dependencyResults,
      };
    },
  };
}

function findTeamMemberByInitials(rows, initials) {
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => String(row?.Initials || '').toUpperCase().trim() === initials) || null;
}

function ageMs(value, now = Date.now()) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, now - timestamp);
}

function formatAge(age) {
  if (age == null) return 'unknown age';
  const minutes = Math.round(age / 60000);
  if (minutes < 90) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function sqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dependencyFromAge({ name, latest, maxAgeMs, missingDetail, staleDetail, evidence = {} }) {
  const age = ageMs(latest);
  if (age == null) {
    return {
      name,
      status: 'fail',
      severity: 'blocking',
      statusCode: null,
      durationMs: 0,
      detail: missingDetail,
      evidence,
    };
  }
  const stale = age > maxAgeMs;
  return {
    name,
    status: stale ? 'fail' : 'pass',
    severity: 'blocking',
    statusCode: null,
    durationMs: 0,
    detail: stale ? staleDetail(age) : `Latest ${sqlDate(latest)} (${formatAge(age)} old)`,
    evidence: { ...evidence, latest: sqlDate(latest), ageMinutes: Math.round(age / 60000), maxAgeMinutes: Math.round(maxAgeMs / 60000) },
  };
}

function dependencyFromSchedulerRow(row, label) {
  if (!row) {
    return {
      name: label,
      status: 'fail',
      severity: 'blocking',
      statusCode: null,
      durationMs: 0,
      detail: 'No currentHourly scheduler lifecycle row found.',
      evidence: {},
    };
  }
  const age = ageMs(row.ts);
  const failed = DATA_OPS_TERMINAL_FAILURES.has(String(row.status || '').toLowerCase());
  const stale = age == null || age > DATA_OPS_MAX_CURRENT_FILL_AGE_MS;
  return {
    name: label,
    status: failed || stale ? 'fail' : 'pass',
    severity: 'blocking',
    statusCode: null,
    durationMs: Number(row.durationMs || 0),
    detail: failed
      ? `Latest scheduler row is ${row.status}: ${row.message || 'no message'}`
      : stale
        ? `Latest scheduler row is ${formatAge(age)} old (status ${row.status || 'unknown'}).`
        : `Latest scheduler row ${row.status || 'unknown'} ${formatAge(age)} ago.`,
    evidence: {
      operation: row.operation,
      status: row.status,
      ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
      startDate: sqlDate(row.startDate),
      endDate: sqlDate(row.endDate),
      insertedRows: row.insertedRows ?? null,
      deletedRows: row.deletedRows ?? null,
    },
  };
}

const checks = [
  routeCheck({
    id: 'ops-pulse-snapshot',
    label: 'Ops Pulse snapshot',
    target: '/api/ops-pulse/snapshot',
    dependencies: ['Activity auth gate', 'ops-pulse route', 'server status registry'],
    whatWillHappen: [
      'Calls the Activity live-monitor snapshot route with the current operator identity.',
      'Confirms the server can return pulse, scheduler, errors, request, session, and presence data.',
    ],
    successCriteria: ['HTTP 200', 'JSON payload returned before timeout'],
  }),
  routeCheck({
    id: 'release-notes',
    label: 'Release notes feed',
    target: '/api/release-notes',
    dependencies: ['Express route', 'logs/changelog.md runtime copy'],
    whatWillHappen: [
      'Calls the release-notes route used by Activity.',
      'Verifies the deployed app can read the changelog asset that powers user-facing release notes.',
    ],
    successCriteria: ['HTTP 200', 'Non-empty markdown/text response'],
  }),
  routeCheck({
    id: 'cache-preheater-diagnostics',
    label: 'Cache diagnostics',
    target: '/api/cache-preheater/diagnostics',
    dependencies: ['Express route', 'Redis client availability', 'cache key metadata'],
    whatWillHappen: [
      'Calls the cache diagnostics endpoint used by the operator cache monitor.',
      'Checks whether Redis diagnostics can be reached without opening the Reporting tab.',
    ],
    successCriteria: ['HTTP 200', 'Diagnostics payload returned before timeout'],
  }),
  routeCheck({
    id: 'team-data-bootstrap',
    label: 'Team data bootstrap',
    target: '/api/team-data',
    dependencies: ['Team data route', 'Core SQL or cached bootstrap payload'],
    whatWillHappen: [
      'Calls the production-safe team-data bootstrap route.',
      'Confirms the app can still resolve the team payload needed by the shell and smoke checks.',
    ],
    successCriteria: ['HTTP 200', 'Team payload returned before timeout'],
  }),
  {
    id: 'data-ops-freshness-sentry',
    label: 'Data-ops freshness sentry',
    group: 'workflow',
    risk: 'safe',
    runMode: 'safe',
    method: 'SQL',
    target: 'Core data + dataOpsLog',
    dependencies: ['Core SQL collectedTime', 'Core SQL wip', 'Instructions dataOpsLog', 'currentHourly scheduler rows'],
    whatWillHappen: [
      'Reads aggregate-only current-month freshness from collectedTime and wip.',
      'Reads the latest persisted currentHourly scheduler lifecycle rows for Collected and WIP.',
      'Fails closed if current fills are failed, stale, or if data freshness has drifted beyond the tolerance window.',
    ],
    successCriteria: ['Collected latest payment date is recent', 'WIP latest date is recent', 'Collected and WIP currentHourly rows are recent non-failures'],
    timeoutMs: 8000,
    async run() {
      const coreConn = process.env.SQL_CONNECTION_STRING;
      const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
      const dependencyResults = [];

      if (!coreConn) {
        dependencyResults.push({
          name: 'Core SQL connection',
          status: 'fail',
          severity: 'blocking',
          statusCode: null,
          durationMs: 0,
          detail: 'SQL_CONNECTION_STRING is not configured.',
          evidence: {},
        });
      } else {
        try {
          const stats = await withRequest(coreConn, async (request) => {
            const result = await request.query(`
              SELECT
                (SELECT COUNT(*) FROM collectedTime WHERE payment_date >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS collectedRows,
                (SELECT MAX(CAST(payment_date AS date)) FROM collectedTime WHERE payment_date >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS collectedLatestDate,
                (SELECT COUNT(*) FROM wip WHERE date >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS wipRows,
                (SELECT MAX(CAST(date AS date)) FROM wip WHERE date >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS wipLatestDate
            `);
            return result.recordset?.[0] || {};
          });

          dependencyResults.push(dependencyFromAge({
            name: 'Collected current-month data',
            latest: stats.collectedLatestDate,
            maxAgeMs: DATA_OPS_MAX_COLLECTED_LAG_MS,
            missingDetail: 'No collectedTime rows found for the current month.',
            staleDetail: (age) => `Latest collected payment date is ${formatAge(age)} old, beyond the 72h sentry window.`,
            evidence: { rows: stats.collectedRows ?? null },
          }));

          dependencyResults.push(dependencyFromAge({
            name: 'WIP current-month data',
            latest: stats.wipLatestDate,
            maxAgeMs: DATA_OPS_MAX_WIP_LAG_MS,
            missingDetail: 'No WIP rows found for the current month.',
            staleDetail: (age) => `Latest WIP date is ${formatAge(age)} old, beyond the 36h sentry window.`,
            evidence: { rows: stats.wipRows ?? null },
          }));
        } catch (error) {
          dependencyResults.push({
            name: 'Core SQL data freshness query',
            status: 'fail',
            severity: 'blocking',
            statusCode: null,
            durationMs: 0,
            detail: error?.message || 'Core SQL query failed.',
            evidence: {},
          });
        }
      }

      if (!instructionsConn) {
        dependencyResults.push({
          name: 'Instructions SQL connection',
          status: 'fail',
          severity: 'blocking',
          statusCode: null,
          durationMs: 0,
          detail: 'INSTRUCTIONS_SQL_CONNECTION_STRING is not configured.',
          evidence: {},
        });
      } else {
        try {
          const rows = await withRequest(instructionsConn, async (request) => {
            const result = await request.query(`
              ;WITH ranked AS (
                SELECT
                  operation,
                  status,
                  message,
                  ts,
                  startDate,
                  endDate,
                  insertedRows,
                  deletedRows,
                  durationMs,
                  ROW_NUMBER() OVER (PARTITION BY operation ORDER BY ts DESC) AS rn
                FROM dataOpsLog
                WHERE operation IN ('syncCollectedTimeCurrentHourly', 'syncWipCurrentHourly')
                  AND status <> 'progress'
                  AND ts >= DATEADD(HOUR, -8, SYSUTCDATETIME())
              )
              SELECT operation, status, message, ts, startDate, endDate, insertedRows, deletedRows, durationMs
              FROM ranked
              WHERE rn = 1
            `);
            return result.recordset || [];
          });
          const byOperation = new Map(rows.map((row) => [row.operation, row]));
          dependencyResults.push(dependencyFromSchedulerRow(byOperation.get('syncCollectedTimeCurrentHourly'), 'Collected currentHourly scheduler'));
          dependencyResults.push(dependencyFromSchedulerRow(byOperation.get('syncWipCurrentHourly'), 'WIP currentHourly scheduler'));
        } catch (error) {
          dependencyResults.push({
            name: 'Instructions dataOpsLog query',
            status: 'fail',
            severity: 'blocking',
            statusCode: null,
            durationMs: 0,
            detail: error?.message || 'Instructions SQL query failed.',
            evidence: {},
          });
        }
      }

      return { status: summarizeStatus(dependencyResults), dependencyResults };
    },
  },
  {
    id: 'home-bank-holidays',
    label: 'GOV.UK bank holidays dependency',
    group: 'dependency',
    risk: 'safe',
    runMode: 'safe',
    method: 'GET',
    target: 'https://www.gov.uk/bank-holidays.json',
    dependencies: ['GOV.UK bank holidays API'],
    whatWillHappen: [
      'Performs a server-side GET against the GOV.UK bank-holidays JSON used by Home.',
      'Classifies failure as degraded because the app can still run with reduced date-context confidence.',
    ],
    successCriteria: ['HTTP 200 from GOV.UK', 'JSON response received before timeout'],
    timeoutMs: 5000,
    async run() {
      const probe = await fetchProbe('https://www.gov.uk/bank-holidays.json', { timeoutMs: 5000 });
      const dependencyResults = [{
        name: 'GOV.UK bank holidays',
        status: probe.ok ? 'pass' : 'fail',
        severity: 'degraded',
        statusCode: probe.statusCode,
        durationMs: probe.durationMs,
        detail: probe.ok ? `HTTP ${probe.statusCode}` : probe.error || `HTTP ${probe.statusCode || 'unavailable'}`,
        evidence: { contentType: probe.contentType, bytes: probe.size },
      }];
      return { status: summarizeStatus(dependencyResults), dependencyResults };
    },
  },
  {
    id: 'brand-runtime-assets',
    label: 'Brand/runtime browser assets',
    group: 'dependency',
    risk: 'safe',
    runMode: 'safe',
    method: 'GET',
    target: 'Google Fonts + SharePoint Fabric CSS',
    dependencies: ['Google Fonts CSS', 'SharePoint Fabric CSS'],
    whatWillHappen: [
      'Performs server-side GET probes for the external CSS assets referenced by the SPA shell.',
      'Classifies failures as noise so asset/CDN issues do not look like SQL or route outages.',
    ],
    successCriteria: ['External assets respond before timeout', 'Failures are reported separately from backend blockers'],
    timeoutMs: 5000,
    async run() {
      const probes = await Promise.all([
        fetchProbe('https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&display=swap', { timeoutMs: 5000 }),
        fetchProbe('https://static2.sharepointonline.com/files/fabric/office-ui-fabric-core/11.0.0/css/fabric.min.css', { timeoutMs: 5000 }),
      ]);
      const names = ['Google Fonts CSS', 'SharePoint Fabric CSS'];
      const dependencyResults = probes.map((probe, index) => ({
        name: names[index],
        status: probe.ok ? 'pass' : 'warn',
        severity: 'noise',
        statusCode: probe.statusCode,
        durationMs: probe.durationMs,
        detail: probe.ok ? `HTTP ${probe.statusCode}` : probe.error || `HTTP ${probe.statusCode || 'unavailable'}`,
        evidence: { contentType: probe.contentType, bytes: probe.size },
      }));
      return { status: summarizeStatus(dependencyResults), dependencyResults };
    },
  },
  {
    id: 'home-core-bootstrap',
    label: 'Home core bootstrap dry-run',
    group: 'workflow',
    risk: 'observe',
    runMode: 'dry-run-only',
    method: 'PACK',
    target: 'Team data -> Home WIP',
    dependencies: ['Team data route', 'Core SQL team table', 'Home WIP route', 'Clio credentials/cache'],
    whatWillHappen: [
      'Uses the supplied initials to resolve one active team member through the team-data route.',
      'If an Entra ID is available to the current operator, probes that member\'s Home WIP route without writing anything.',
      'Reports missing identity data as degraded rather than pretending the full Home path was exercised.',
    ],
    successCriteria: ['Team member resolves from live team data', 'Home WIP route returns before timeout when identity is available'],
    timeoutMs: 8000,
    inputSchema: [{
      key: 'initials',
      label: 'Team initials',
      required: true,
      kind: 'initials',
      helpText: 'Internal initials only; no client data.',
    }],
    async run(context) {
      const initials = context.inputs.initials;
      const origin = getRequestOrigin(context.req);
      const headers = getForwardedIdentityHeaders(context.req);
      const teamProbe = await fetchJsonProbe(new URL('/api/team-data', origin).toString(), {
        headers,
        timeoutMs: 5000,
      });
      const teamStatus = dependencyStatusFromHttp(teamProbe.statusCode || 0, 'blocking');
      const member = teamProbe.ok ? findTeamMemberByInitials(teamProbe.json, initials) : null;
      const dependencyResults = [{
        name: 'Team data bootstrap',
        status: teamStatus === 'pass' && member ? 'pass' : 'fail',
        severity: 'blocking',
        statusCode: teamProbe.statusCode,
        durationMs: teamProbe.durationMs,
        detail: teamProbe.ok
          ? member ? `Resolved ${initials}` : `No active team member found for ${initials}`
          : teamProbe.error || `HTTP ${teamProbe.statusCode || 'unavailable'}`,
        evidence: {
          path: '/api/team-data',
          contentType: teamProbe.contentType,
          bytes: teamProbe.size,
        },
      }];

      const entraId = member?.['Entra ID'] || member?.entraId || member?.EntraId || '';
      if (member && entraId) {
        const wipProbe = await fetchJsonProbe(new URL(`/api/home-wip?entraId=${encodeURIComponent(entraId)}`, origin).toString(), {
          headers,
          timeoutMs: 8000,
        });
        dependencyResults.push({
          name: 'Home WIP bootstrap',
          status: dependencyStatusFromHttp(wipProbe.statusCode || 0, 'blocking'),
          severity: 'blocking',
          statusCode: wipProbe.statusCode,
          durationMs: wipProbe.durationMs,
          detail: wipProbe.ok ? `HTTP ${wipProbe.statusCode}` : wipProbe.error || `HTTP ${wipProbe.statusCode || 'unavailable'}`,
          evidence: {
            path: '/api/home-wip?entraId=<redacted>',
            contentType: wipProbe.contentType,
            bytes: wipProbe.size,
          },
        });
      } else if (member) {
        dependencyResults.push({
          name: 'Home WIP identity',
          status: 'warn',
          severity: 'degraded',
          statusCode: null,
          durationMs: 0,
          detail: 'Team data resolved but did not expose an Entra ID to this check context.',
          evidence: { path: '/api/home-wip?entraId=<not-run>' },
        });
      }

      return { status: summarizeStatus(dependencyResults), dependencyResults };
    },
  },
];

function toCatalogItem(check) {
  return {
    id: check.id,
    label: check.label,
    group: check.group,
    risk: check.risk,
    runMode: check.runMode || 'safe',
    method: check.method,
    target: check.target,
    dependencies: check.dependencies,
    whatWillHappen: check.whatWillHappen,
    successCriteria: check.successCriteria,
    timeoutMs: check.timeoutMs,
    inputSchema: Array.isArray(check.inputSchema) ? check.inputSchema : [],
  };
}

function listOpsChecks() {
  return checks.map(toCatalogItem);
}

function getOpsCheck(id) {
  return checks.find((check) => check.id === id) || null;
}

function getOpsCheckRunSummary() {
  const latest = Array.from(latestRunsByCheck.values()).sort((a, b) => b.ts - a.ts);
  return {
    totalTracked: latest.length,
    failingCount: latest.filter((item) => item.status === 'fail').length,
    warningCount: latest.filter((item) => item.status === 'warn').length,
    passCount: latest.filter((item) => item.status === 'pass').length,
    checkedAt: latest[0]?.checkedAt || null,
    ts: latest[0]?.ts || null,
    lastRun: latest[0] || null,
    latest,
    recent: recentRuns.slice().reverse(),
  };
}

function recordOpsCheckRun(result, triggeredBy = 'unknown') {
  const item = toSummaryItem(result, triggeredBy);
  latestRunsByCheck.set(item.id, item);
  appendRecentRun(item);
  return getOpsCheckRunSummary();
}

function recordOpsCheckFailure(checkId, { triggeredBy = 'unknown', durationMs = 0, error } = {}) {
  const check = getOpsCheck(checkId);
  const message = error?.message || String(error || 'Check failed unexpectedly.');
  const checkedAt = new Date().toISOString();
  const item = {
    id: checkId,
    label: check?.label || checkId,
    group: check?.group || 'workflow',
    risk: check?.risk || 'observe',
    status: 'fail',
    durationMs,
    checkedAt,
    ts: Date.now(),
    triggeredBy,
    dependencyCount: 1,
    failingBlockingCount: 1,
    degradedIssueCount: 0,
    noiseIssueCount: 0,
    issues: [{
      name: check?.label || checkId,
      status: 'fail',
      severity: 'blocking',
      statusCode: null,
      detail: message,
    }],
  };
  latestRunsByCheck.set(item.id, item);
  appendRecentRun(item);
  return getOpsCheckRunSummary();
}

async function runOpsCheck(id, context) {
  const check = getOpsCheck(id);
  if (!check) return null;
  const inputs = normalizeCheckInputs(check, context.inputs || {});
  const startedAt = Date.now();
  const runResult = await check.run({ ...context, inputs });
  const durationMs = Date.now() - startedAt;
  return {
    ...toCatalogItem(check),
    status: runResult.status,
    durationMs,
    checkedAt: new Date().toISOString(),
    dependencyResults: runResult.dependencyResults,
  };
}

module.exports = {
  listOpsChecks,
  getOpsCheckRunSummary,
  recordOpsCheckRun,
  recordOpsCheckFailure,
  runOpsCheck,
};