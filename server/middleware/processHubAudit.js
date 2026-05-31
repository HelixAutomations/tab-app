const { runWithProcessHubAuditContext } = require('../utils/processHubAuditContext');
const { recordSubmission, recordStep, markComplete, markFailed } = require('../utils/formSubmissionLog');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const VALID_LANES = new Set(['Start', 'Request', 'Log', 'Escalate', 'Find']);

const EXCLUDED_PREFIXES = [
  '/api/process-hub',
  '/api/forms/intent',
  '/api/telemetry',
  '/api/health',
  '/api/dev/health',
  '/api/stripe/webhook',
  '/api/clio/webhook',
  '/api/ops-pulse',
  '/api/activity-feed',
  '/api/release-notes',
  '/api/system-triage',
  '/api/dev/console',
  '/api/dev-console',
  '/api/cache',
  '/api/cache-status',
];

const READ_ONLY_POST_PATHS = new Set([
  '/api/attendance/getattendance',
  '/api/attendance/getannualleave',
  '/api/getmatters',
  '/api/getallmatters',
  '/api/home-wip',
  '/api/home-wip/team',
  '/api/home-enquiries/pitch-lookup',
  '/api/home-enquiries/counts',
  '/api/ccl/batch-status',
  '/api/cache/clear-cache',
  '/api/cache/prefetch',
]);

const READ_ONLY_SEGMENT_HINTS = [
  'batch-status',
  'context-preview',
  'counts',
  'discover',
  'fetch',
  'get',
  'list',
  'lookup',
  'peek',
  'prefetch',
  'preview',
  'query',
  'resolve',
  'search',
  'snapshot',
  'status',
  'validate',
];

const REDACTED_KEY_PATTERN = /(authorization|base64|body|connection|string|content|cookie|dataurl|document|file|html|key|passcode|password|secret|signature|token)/i;

function clampText(value, maxLength, fallback = '') {
  const text = String(value || fallback || '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function getPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || req.path || '';
}

function normalisePath(pathname) {
  return String(pathname || '').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function hasExcludedPrefix(pathname) {
  const lowerPath = pathname.toLowerCase();
  return EXCLUDED_PREFIXES.some((prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`));
}

function isReadOnlyPost(pathname, method) {
  if (method !== 'POST') return false;
  const lowerPath = pathname.toLowerCase();
  if (READ_ONLY_POST_PATHS.has(lowerPath)) return true;
  const segments = lowerPath.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || '';
  if (lastSegment.endsWith('stream')) return true;
  return READ_ONLY_SEGMENT_HINTS.some((hint) => lastSegment === hint || lastSegment.startsWith(hint));
}

function shouldTrackRequest(req) {
  const method = String(req.method || '').toUpperCase();
  if (!TRACKED_METHODS.has(method)) return false;
  const pathname = normalisePath(getPath(req));
  if (!pathname.startsWith('/api/')) return false;
  if (hasExcludedPrefix(pathname)) return false;
  if (isReadOnlyPost(pathname, method)) return false;
  return true;
}

function getActor(req) {
  return clampText(
    req.user?.initials || req.user?.email || req.headers['x-helix-initials'] || req.headers['x-user-initials'] || 'UNK',
    16,
    'UNK'
  ).toUpperCase();
}

function sanitiseSegment(segment) {
  const clean = String(segment || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean) return null;
  if (/^\d+$/.test(clean)) return null;
  if (/^[0-9a-f-]{12,}$/i.test(clean)) return null;
  return clean;
}

function buildFormKey(pathname) {
  const parts = pathname.replace(/^\/api\/?/i, '').split('/').map(sanitiseSegment).filter(Boolean);
  const keyParts = parts.slice(0, 3);
  // Dotted prefix `activity.api.<segment>` distinguishes fallback audit rows
  // from real form submissions even when the `kind` column is unavailable.
  return clampText(`activity.api.${keyParts.join('.') || 'request'}`, 64, 'activity.api.request');
}

function inferLane(pathname) {
  const lowerPath = pathname.toLowerCase();
  if (/\/(search|lookup|people-search|experts|counsel|clio-client|clio-contacts)/.test(lowerPath)) return 'Find';
  if (/\/(tech|signals|access|ops|operator-actions|system-triage|matter-replay)/.test(lowerPath)) return 'Escalate';
  if (/\/(attendance|registers|todo|logs|audit|data-operations)/.test(lowerPath)) return 'Log';
  if (/\/(matters|matter|instructions|verify-id|enquiries|deal|pitches|documents|doc-)/.test(lowerPath)) return 'Start';
  if (/\/(payments|payment|financial|transactions|outstanding-balances|rate-changes|ccl|ai|forms-ai)/.test(lowerPath)) return 'Request';
  return 'Request';
}

function safeJsonValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      sample: depth >= 2 ? [] : value.slice(0, 3).map((entry) => safeJsonValue(entry, depth + 1)),
    };
  }
  if (typeof value === 'object') {
    if (depth >= 3) return { type: 'object', keys: Object.keys(value).slice(0, 20) };
    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 24)) {
      output[key] = REDACTED_KEY_PATTERN.test(key) ? '[redacted]' : safeJsonValue(entry, depth + 1);
    }
    return output;
  }
  return String(value);
}

function getQuerySnapshot(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  return safeJsonValue(query);
}

function buildSnapshot(req) {
  const method = String(req.method || '').toUpperCase();
  const pathname = normalisePath(getPath(req));
  const lane = inferLane(pathname);
  return {
    method,
    pathname,
    formKey: buildFormKey(pathname),
    lane: VALID_LANES.has(lane) ? lane : 'Request',
    submittedBy: getActor(req),
    summary: clampText(`${method} ${pathname}`, 400, pathname),
    payload: {
      source: 'api-fallback-audit',
      method,
      pathname,
      query: getQuerySnapshot(req),
      body: safeJsonValue(req.body || {}),
      userAgent: clampText(req.headers['user-agent'] || '', 240),
      referer: clampText(req.headers.referer || req.headers.referrer || '', 240),
    },
  };
}

async function writeFallbackAudit(snapshot, statusCode, durationMs) {
  const failed = Number(statusCode) >= 400;
  const submissionId = await recordSubmission({
    formKey: snapshot.formKey,
    submittedBy: snapshot.submittedBy,
    lane: snapshot.lane,
    kind: 'activity',
    payload: {
      ...snapshot.payload,
      response: { statusCode, durationMs },
    },
    summary: snapshot.summary,
  });

  if (!submissionId) return;

  await recordStep(submissionId, {
    name: 'api.request',
    status: failed ? 'failed' : 'success',
    error: failed ? `HTTP ${statusCode}` : null,
    output: { statusCode, durationMs, path: snapshot.pathname },
  });

  if (failed) {
    await markFailed(submissionId, { lastEvent: `api ${statusCode}`, error: `HTTP ${statusCode}` });
  } else {
    await markComplete(submissionId, { lastEvent: `api ${statusCode}` });
  }

  trackEvent('ProcessHub.ApiFallback.Recorded', {
    operation: 'processHub.apiFallback',
    triggeredBy: snapshot.submittedBy,
    formKey: snapshot.formKey,
    path: snapshot.pathname,
    method: snapshot.method,
    statusCode: String(statusCode),
  });
  trackMetric('ProcessHub.ApiFallback.Duration', durationMs, {
    path: snapshot.pathname,
    method: snapshot.method,
    statusCode: String(statusCode),
  });
}

function processHubAuditMiddleware(req, res, next) {
  const context = { recorded: false, formKey: null, submissionId: null };

  return runWithProcessHubAuditContext(context, () => {
    if (!shouldTrackRequest(req)) return next();

    const startedAt = Date.now();
    const snapshot = buildSnapshot(req);

    res.on('finish', () => {
      if (context.recorded) return;
      const durationMs = Date.now() - startedAt;
      writeFallbackAudit(snapshot, res.statusCode, durationMs).catch((error) => {
        trackException(error, {
          operation: 'processHub.apiFallback',
          phase: 'finish',
          path: snapshot.pathname,
          method: snapshot.method,
          triggeredBy: snapshot.submittedBy,
        });
      });
    });

    return next();
  });
}

module.exports = { processHubAuditMiddleware };