/**
 * System Triage route.
 *
 * Read-only operator endpoint for the System tab's first-response dashboard.
 * It merges live in-process buffers with optional Log Analytics history so the
 * operator can filter by user/time without opening the older tool wall.
 */
const express = require('express');
const fetch = require('node-fetch');
const { DefaultAzureCredential } = require('@azure/identity');

const opLog = require('../utils/opLog');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getRecentRequests } = require('../utils/requestTracker');
const { getPresence } = require('../utils/presenceTracker');
const { listSessionTraces } = require('../utils/sessionTraceTracker');
const { isDevGroupOrHigher } = require('../utils/userTier');
const { matchCatalog } = require('../utils/failureCatalog');
const { runMatterReplay } = require('../utils/matterReplay');
const { listRecentSubmissionsForUser } = require('../utils/formSubmissionLog');

const router = express.Router();

const REPLAY_ALLOWED_INITIALS = new Set(['LZ', 'AC']);

const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;
const MAX_LIMIT = 240;
const SLOW_REQUEST_MS = 1500;
const DEFAULT_LOG_ANALYTICS_ROLES = ['link-hub-v1', 'helix-hub-server'];

function parseDelimitedList(value, fallback = []) {
  const items = String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function kqlStringList(values) {
  return values.map((value) => `"${escapeKqlString(value).toLowerCase()}"`).join(', ');
}

function evidencePriority(event) {
  if (Number.isFinite(event?.incidentPriority)) return event.incidentPriority;
  const categories = Array.isArray(event?.categories) ? event.categories : [];
  if (event?.tone === 'danger' || categories.includes('server-errors') || categories.includes('client-errors')) return 0;
  if (event?.tone === 'warning' || categories.includes('slow-routes')) return 1;
  if (event?.source === 'Session trace') return 2;
  return 3;
}

function compareEvidencePriority(a, b) {
  const priority = evidencePriority(a) - evidencePriority(b);
  if (priority !== 0) return priority;
  return (Date.parse(b?.ts || '') || 0) - (Date.parse(a?.ts || '') || 0);
}

function normaliseEvidenceKey(value) {
  return String(value || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<guid>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 180);
}

function evidenceRepresentativeKey(event) {
  const source = normaliseEvidenceKey(event?.source);
  const title = normaliseEvidenceKey(event?.title);
  const detail = normaliseEvidenceKey(event?.detail);
  const path = normaliseEvidenceKey(event?.path || event?.route);
  const status = event?.status == null ? '' : String(event.status);
  if (path || source.includes('request')) return `request:${title}:${path}:${status}`;
  return `${source}:${title}:${detail}`;
}

function selectRepresentativeEvidence(events, limit) {
  const sorted = [...events].sort(compareEvidencePriority);
  const seen = new Set();
  const representatives = [];
  const duplicates = [];
  for (const event of sorted) {
    const key = evidenceRepresentativeKey(event);
    if (!seen.has(key)) {
      seen.add(key);
      representatives.push(event);
    } else {
      duplicates.push(event);
    }
  }
  return [...representatives, ...duplicates].slice(0, limit);
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function cleanInitials(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return null;
  return /^[A-Z0-9]{1,16}$/.test(raw) ? raw : '';
}

function inWindowMs(ts, sinceMs, untilMs) {
  const value = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
  return Number.isFinite(value) && value >= sinceMs && value < untilMs;
}

function isoFromTs(ts) {
  const value = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function parseJsonObject(value) {
  const text = String(value || '').trim();
  if (!text || !text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeStr(value) {
  const text = String(value || '').trim();
  return text && text !== 'null' && text !== 'undefined' ? text : null;
}

function inferEventTypeFromName(name) {
  const text = safeStr(name);
  if (!text) return null;
  if (/^(trace|event|exception)$/i.test(text)) return null;
  return text
    .replace(/^Client\./i, '')
    .replace(/^telemetry\./i, '');
}

function stripSourcePrefix(value, source) {
  const text = safeStr(value) || '';
  const prefix = safeStr(source);
  if (!prefix) return text;
  return text.toLowerCase().startsWith(`${prefix.toLowerCase()}.`) ? text.slice(prefix.length + 1) : text;
}

function surfaceFromEventType(eventType, source) {
  let text = stripSourcePrefix(eventType, source)
    .replace(/^Realtime\./i, '')
    .replace(/^AppShell\./i, '')
    .replace(/^Network\./i, '')
    .replace(/\.error$/i, '')
    .replace(/-stream-error$/i, '-stream')
    .replace(/-error$/i, '')
    .trim();
  if (!text) text = 'unknown';
  return text;
}

function isStaticShellProbe(pathOrUrl) {
  const text = safeStr(pathOrUrl) || '';
  return text === '/'
    || text === '/index.html'
    || text === '/health'
    || /^\/static\/(?:js|css)\//i.test(text);
}

function isCclGuardedPath(pathOrUrl) {
  const text = safeStr(pathOrUrl) || '';
  return /^\/api\/(?:ccl|ccl-ai|ccl-admin|ccl-ops|ccl-dry-run|ccl-date)(?:\/|$)/i.test(text);
}

function isOptionalBootstrapGuardPath(pathOrUrl) {
  const text = safeStr(pathOrUrl) || '';
  return text === '/api/access/effective' || text === '/api/demo-cheat-sheet/access';
}

function isOptionalAuditSchemaName(name) {
  const text = safeStr(name).toLowerCase();
  return text === 'client_submission_id'
    || text === 'dbo.form_submission_intents'
    || text === 'form_submission_intents'
    || text === 'dbo.ai_proposals'
    || text === 'ai_proposals';
}

function extractFailedRequestTarget(value) {
  const text = String(value || '');
  const match = text.match(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s'"}]+)\s+failed\b/i);
  return safeStr(match?.[1]);
}

function parseRemoteTelemetryContext(item) {
  const parsedMessage = parseJsonObject(item.message);
  const parsedDetails = parseJsonObject(item.details);
  const inferredEventType = inferEventTypeFromName(item.name);
  const source = safeStr(parsedMessage?.source) || safeStr(parsedDetails?.source) || (inferredEventType?.split('.')[0] || null);
  const eventType = safeStr(parsedMessage?.eventType) || safeStr(parsedDetails?.eventType) || inferredEventType;
  const error = safeStr(parsedMessage?.error) || safeStr(parsedDetails?.error) || (item.itemType === 'exception' ? safeStr(item.message) : null);
  const path = safeStr(item.path) || safeStr(parsedMessage?.path) || safeStr(parsedDetails?.path);
  const url = safeStr(parsedMessage?.url) || safeStr(parsedDetails?.url);
  const status = coerceNumber(item.status ?? parsedMessage?.status ?? parsedDetails?.status);
  const durationMs = coerceNumber(item.durationMs ?? parsedMessage?.durationMs ?? parsedDetails?.durationMs);
  const message = safeStr(parsedMessage?.message) || safeStr(parsedDetails?.message) || safeStr(item.message);
  return { parsedMessage, parsedDetails, source, eventType, error, path, url, status, durationMs, message };
}

function remoteIncidentMetadata(item, context, categories) {
  const combined = [item.itemType, item.name, item.message, item.details, context.eventType, context.error].map((value) => String(value || '')).join(' ');
  const eventType = safeStr(context.eventType) || '';
  const source = safeStr(context.source) || '';
  const pathOrUrl = safeStr(context.path) || safeStr(context.url) || '';

  if (/azure:identity:warning\s+DefaultAzureCredential\s+=>\s+Skipped createDefault(?:Broker|WorkloadIdentity)Credential/i.test(combined)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 95,
      incidentKey: 'noise:azure-identity-credential-chain',
      incidentTitle: 'Azure credential chain warning',
      title: 'Azure credential chain warning',
      detail: 'DefaultAzureCredential skipped an optional credential provider.',
    };
  }

  if (/CredentialUnavailableError|EnvironmentCredential is unavailable/i.test(combined)
    && !context.path && !context.url && !item.route && !item.submissionId && !item.instructionRef) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 95,
      incidentKey: 'noise:azure-identity-credential-chain',
      incidentTitle: 'Azure credential chain warning',
      title: 'Azure credential chain warning',
      detail: 'DefaultAzureCredential skipped an optional credential provider.',
    };
  }

  if (/ENOENT: no such file or directory, stat .*wwwroot.*index\.html/i.test(combined)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 92,
      incidentKey: 'noise:staging-static-shell-404',
      incidentTitle: 'Staging static shell 404',
      title: 'Staging static shell 404',
      detail: pathOrUrl || 'Static shell file was not present for a probe request.',
    };
  }

  if (/Server\.Error\.Caught/i.test(combined) && context.status === 404 && isStaticShellProbe(pathOrUrl)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 92,
      incidentKey: `noise:staging-static-shell-404:${normaliseEvidenceKey(pathOrUrl || 'unknown')}`,
      incidentTitle: 'Staging static shell 404',
      title: 'Staging static shell 404',
      detail: pathOrUrl || 'Static shell probe returned 404.',
    };
  }

  if (/\bfailed:\s*0\b/i.test(combined) && !/\bfailed:\s*[1-9]\d*\b/i.test(combined)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 90,
      incidentKey: `noise:success-telemetry:${normaliseEvidenceKey(item.name || context.message || 'event')}`,
      incidentTitle: 'Successful telemetry event',
      title: 'Successful telemetry event',
      detail: context.message || safeStr(item.message) || 'No failure recorded.',
    };
  }

  if (/\b(?:The user aborted a request|AbortError|request aborted)\b/i.test(combined)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 88,
      incidentKey: `noise:aborted-request:${normaliseEvidenceKey(pathOrUrl || context.message || item.name || 'request')}`,
      incidentTitle: 'Aborted client request',
      title: 'Aborted client request',
      detail: context.message || safeStr(item.message) || 'Request was cancelled by the caller.',
    };
  }

  if (/Returning stale cache after error/i.test(combined)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 82,
      incidentKey: `notice:stale-cache-served:${normaliseEvidenceKey(context.message || item.name || 'cache')}`,
      incidentTitle: 'Stale cache served after upstream error',
      title: 'Stale cache served after upstream error',
      detail: context.message || safeStr(item.message) || 'Fallback cache was returned.',
    };
  }

  if (context.status === 403 && (isCclGuardedPath(pathOrUrl) || /CCL_DISABLED|CCL\.Operations\.Disabled\.Blocked/i.test(combined))) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 86,
      incidentKey: `notice:ccl-operations-disabled:${normaliseEvidenceKey(pathOrUrl || 'unknown')}`,
      incidentTitle: 'CCL operations disabled guard',
      title: 'CCL operations disabled guard',
      detail: pathOrUrl || 'CCL operation was intentionally blocked outside local development.',
    };
  }

  if ((context.status === 401 || context.status === 403) && isOptionalBootstrapGuardPath(pathOrUrl)) {
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 87,
      incidentKey: `notice:optional-bootstrap-auth-guard:${normaliseEvidenceKey(pathOrUrl)}`,
      incidentTitle: 'Optional bootstrap auth guard',
      title: 'Optional bootstrap auth guard',
      detail: pathOrUrl,
    };
  }

  if (/Realtime\.|eventsource-error|stream-error/i.test(`${source}.${eventType} ${context.error || ''} ${combined}`)
    && !Number.isFinite(context.status)) {
    const surface = surfaceFromEventType(eventType, source);
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 84,
      incidentKey: `notice:eventsource-retry:${normaliseEvidenceKey(source || 'realtime')}:${normaliseEvidenceKey(surface)}`,
      incidentTitle: 'EventSource retry telemetry',
      title: 'EventSource retry telemetry',
      detail: pathOrUrl || safeStr(context.error) || 'Browser EventSource retry path.',
    };
  }

  if (/Realtime\.|eventsource-error|stream-error/i.test(`${source}.${eventType} ${context.error || ''} ${combined}`)) {
    const surface = surfaceFromEventType(eventType, source);
    const failure = safeStr(context.error) || 'eventsource-error';
    const titlePrefix = /AppShell/i.test(source) || /AppShell/i.test(eventType) ? 'App shell stream error' : 'Realtime stream error';
    return {
      incidentPriority: 35,
      incidentKey: `stream:${normaliseEvidenceKey(source || 'realtime')}:${normaliseEvidenceKey(surface)}:${normaliseEvidenceKey(failure)}`,
      incidentTitle: `${titlePrefix}: ${surface}`,
      title: `${titlePrefix}: ${surface}`,
      detail: pathOrUrl || failure,
    };
  }

  if (/request-slow|UX\.hydrate|hydrate\./i.test(`${source}.${eventType} ${combined}`)
    && (!Number.isFinite(context.status) || context.status < 400)) {
    const surface = pathOrUrl || surfaceFromEventType(eventType, source) || 'timing';
    return {
      categories: [],
      tone: 'info',
      incidentPriority: 82,
      incidentKey: `notice:timing-telemetry:${normaliseEvidenceKey(surface)}`,
      incidentTitle: 'Timing telemetry',
      title: 'Timing telemetry',
      detail: surface,
    };
  }

  if (/Network\.|request-failed/i.test(`${source}.${eventType} ${combined}`)) {
    const target = pathOrUrl
      || extractFailedRequestTarget(context.error)
      || extractFailedRequestTarget(context.message)
      || extractFailedRequestTarget(item.message)
      || extractFailedRequestTarget(item.details)
      || surfaceFromEventType(eventType, source)
      || 'request';
    return {
      incidentPriority: 25,
      incidentKey: `network:${normaliseEvidenceKey(target)}:${Number.isFinite(context.status) ? context.status : 'failed'}`,
      incidentTitle: `Network request failed: ${target}`,
      title: `Network request failed: ${target}`,
      detail: safeStr(context.error) || context.message || target,
    };
  }

  if (/CompactMatterWizard\.PreValidation\.Failed/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:compact-matter-prevalidation',
      incidentTitle: 'Compact matter pre-validation failed',
      title: 'Compact matter pre-validation failed',
    };
  }

  if (/Invalid practice area/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:matter-opening-invalid-practice-area',
      incidentTitle: 'Matter opening failed: invalid practice area',
      title: 'Matter opening failed: invalid practice area',
    };
  }

  if (/MatterOpening\.ClioMatter\.Failed|Invalid practice area|\/api\/clio-matters/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:matter-opening-clio-matter',
      incidentTitle: 'Matter opening failed in Clio',
      title: 'Matter opening failed in Clio',
    };
  }

  if (/Asana credentials missing/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:asana-credentials-missing',
      incidentTitle: 'Asana credentials missing',
      title: 'Asana credentials missing',
    };
  }

  if (/UpdateATY-CWO|api\/updateaty-cwo/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:updateaty-cwo',
      incidentTitle: 'UpdateATY-CWO failed',
      title: 'UpdateATY-CWO failed',
    };
  }

  if (/Matter-open confirmation email failed/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:matter-open-confirmation-email-auth',
      incidentTitle: 'Matter-open confirmation email failed auth',
      title: 'Matter-open confirmation email failed auth',
    };
  }

  if (/Auto-book annual leave|@outlookEntryId|TDS.*RPC/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: 'operational:annual-leave-calendar-side-effects',
      incidentTitle: 'Annual leave calendar side-effects failed',
      title: 'Annual leave calendar side-effects failed',
    };
  }

  if (/Clio.*429|RateLimited|rate limit/i.test(combined)) {
    return {
      incidentPriority: 3,
      incidentKey: 'integration:clio-rate-limit',
      incidentTitle: 'Clio rate limit hit',
      title: 'Clio rate limit hit',
    };
  }

  if (/invalid (column|object) name|SQL error on attempt/i.test(combined)) {
    const schemaMatch = combined.match(/invalid\s+(column|object)\s+name\s+['"]([^'"]+)['"]/i);
    const kind = schemaMatch?.[1]?.toLowerCase() || 'schema';
    const name = schemaMatch?.[2] || 'unknown';
    if (isOptionalAuditSchemaName(name)) {
      return {
        categories: [],
        tone: 'info',
        incidentPriority: 83,
        incidentKey: `notice:optional-audit-schema:${kind}:${normaliseEvidenceKey(name)}`,
        incidentTitle: `Optional audit schema unavailable: ${name}`,
        title: `Optional audit schema unavailable: ${name}`,
      };
    }
    return {
      incidentPriority: 2,
      incidentKey: `sql-schema:${kind}:${normaliseEvidenceKey(name)}`,
      incidentTitle: name === 'unknown' ? 'SQL schema mismatch' : `SQL ${kind} missing: ${name}`,
      title: name === 'unknown' ? 'SQL schema mismatch' : `SQL ${kind} missing: ${name}`,
    };
  }

  if (/MatterOpening|CompactMatterWizard|Invalid practice area|Asana credentials missing|UpdateATY-CWO|api\/updateaty-cwo|Matter-open confirmation email failed/i.test(combined)) {
    return {
      incidentPriority: 1,
      incidentKey: `operational:${normaliseEvidenceKey(combined)}`,
      incidentTitle: null,
    };
  }

  if (categories.includes('server-errors')) return { incidentPriority: 10 };
  if (categories.includes('client-errors')) return { incidentPriority: 20 };
  if (categories.includes('slow-routes')) return { incidentPriority: 70 };
  return { incidentPriority: 80 };
}

function eventUserMatches(value, initials, sessionIds) {
  if (!initials) return true;
  const user = String(value?.user || value?.feeEarner || '').toUpperCase().trim();
  if (user === initials) return true;
  const sessionId = String(value?.clientSessionId || value?.sessionId || '').trim();
  return Boolean(sessionId && sessionIds.has(sessionId));
}

function buildEvidenceEvent(input) {
  const base = {
    id: input.id,
    ts: input.ts,
    source: input.source,
    categories: Array.isArray(input.categories) ? input.categories.filter(Boolean) : [],
    tone: input.tone || 'info',
    title: input.title,
    detail: input.detail || '',
    user: input.user || null,
    path: input.path || null,
    status: typeof input.status === 'number' ? input.status : null,
    durationMs: Number.isFinite(input.durationMs) ? Math.round(input.durationMs) : null,
    sessionId: input.sessionId || null,
    exceptionType: input.exceptionType || null,
    scope: input.scope || 'user',
    submissionId: input.submissionId || null,
    clientSubmissionId: input.clientSubmissionId || null,
    formKey: input.formKey || null,
    instructionRef: input.instructionRef || null,
    route: input.route || input.path || null,
    payloadFingerprint: input.payloadFingerprint || null,
    incidentKey: input.incidentKey || null,
    incidentTitle: input.incidentTitle || null,
    incidentPriority: Number.isFinite(input.incidentPriority) ? input.incidentPriority : null,
  };
  const match = matchCatalog(base);
  if (match) base.catalogMatch = match;
  return base;
}

function requestCategories(request) {
  const categories = [];
  if (request.status >= 500) categories.push('server-errors');
  else if (request.status >= 400) categories.push('client-errors');
  if (request.durationMs >= SLOW_REQUEST_MS) categories.push('slow-routes');
  return categories;
}

function traceCategories(trace) {
  const categories = ['sessions'];
  if ((trace.errorCount || 0) > 0 || trace.health === 'error') categories.push('client-errors');
  if ((trace.slowCount || 0) > 0 || trace.health === 'busy') categories.push('slow-routes');
  return categories;
}

function clientEventCategories(event) {
  const categories = [];
  if (event.kind === 'error') categories.push('client-errors');
  if (Number(event.durationMs) >= SLOW_REQUEST_MS) categories.push('slow-routes');
  return categories;
}

function telemetryCategories(entry) {
  const text = `${entry.type || ''} ${entry.error || ''} ${entry.status || ''}`;
  const categories = [];
  if (entry.error || /error|failed|request-failed/i.test(text)) categories.push('client-errors');
  if (Number(entry.durationMs) >= SLOW_REQUEST_MS) categories.push('slow-routes');
  return categories;
}

function remoteEventCategories(item, context = parseRemoteTelemetryContext(item)) {
  const status = context.status;
  const durationMs = context.durationMs;
  const parsedError = safeStr(context.error) || '';
  const plainMessage = context.parsedMessage ? '' : String(item.message || '');
  const text = `${item.itemType || ''} ${item.name || ''} ${plainMessage} ${context.eventType || ''} ${context.message || ''} ${parsedError}`;
  const categories = [];
  if (item.itemType === 'exception' || status >= 500) categories.push('server-errors');
  else if ((status >= 400 && status < 500) || Boolean(parsedError) || /error|failed|exception|timeout|request-failed|eventsource-error/i.test(text)) categories.push('client-errors');
  else if (/error|failed|exception|timeout/i.test(text)) categories.push(item.itemType === 'request' || item.itemType === 'dependency' ? 'server-errors' : 'client-errors');
  if (durationMs >= SLOW_REQUEST_MS || /slow/i.test(text)) categories.push('slow-routes');
  return Array.from(new Set(categories));
}

function summarizeIssues({ requests, traces, opEvents, remoteEvents, remoteState, initials }) {
  const issues = [];
  const failingRequests = requests.filter((request) => request.status >= 500);
  const clientErrors = traces.flatMap((trace) =>
    (trace.recentEvents || [])
      .filter((event) => event.kind === 'error')
      .map((event) => ({ trace, event })),
  );
  const clientErrorSessions = traces.filter((trace) => (trace.errorCount || 0) > 0);
  const clientErrorCount = clientErrorSessions.reduce((sum, trace) => sum + (trace.errorCount || 0), 0) || clientErrors.length;
  const slowRequests = requests.filter((request) => request.durationMs >= SLOW_REQUEST_MS);
  const degradedSessions = traces.filter((trace) => trace.health === 'error' || trace.health === 'warning' || trace.health === 'busy');
  const remoteFailures = remoteEvents.filter((event) => event.tone === 'danger');
  const remoteClientFailures = remoteEvents.filter((event) => event.categories?.includes('client-errors'));

  if (failingRequests.length > 0) {
    const first = failingRequests[0];
    issues.push({
      id: 'server-errors',
      severity: 'critical',
      title: initials ? `${initials} hit a server error` : 'Server errors in the selected window',
      summary: `${failingRequests.length} request${failingRequests.length === 1 ? '' : 's'} returned 5xx. Latest: ${first.method} ${first.path}.`,
      evidenceIds: failingRequests.slice(0, 5).map((request) => `request-${request.ts}-${request.path}`),
      recommendedAction: 'Open the route evidence, check the matching server exception, then replay the smallest safe smoke path.',
    });
  }

  if (clientErrors.length > 0 || clientErrorSessions.length > 0 || remoteClientFailures.length > 0) {
    const first = clientErrors[0] || null;
    const firstSession = clientErrorSessions[0] || null;
    const firstRemote = remoteClientFailures[0] || null;
    const totalClientErrors = clientErrorCount + remoteClientFailures.length;
    issues.push({
      id: 'client-errors',
      severity: issues.length > 0 ? 'warning' : 'critical',
      title: initials ? `${initials} has a degraded client session` : 'Client session errors detected',
      summary: `${totalClientErrors} client error event${totalClientErrors === 1 ? '' : 's'} found. Latest: ${first?.event?.label || firstRemote?.title || firstSession?.lastEventLabel || firstSession?.sessionId}.`,
      evidenceIds: [
        ...clientErrors.slice(0, 5).map(({ event, trace }) => `trace-${trace.sessionId}-${event.ts}`),
        ...clientErrorSessions.slice(0, 5).map((trace) => `session-${trace.sessionId}`),
        ...remoteClientFailures.slice(0, 5).map((event) => event.id),
      ],
      recommendedAction: 'Use the session id to correlate recent network and route events before changing business logic.',
    });
  }

  if (remoteFailures.length > 0) {
    const first = remoteFailures[0];
    issues.push({
      id: 'app-insights-failures',
      severity: issues.length > 0 ? 'warning' : 'critical',
      title: 'App Insights has matching failures',
      summary: `${remoteFailures.length} historical failure${remoteFailures.length === 1 ? '' : 's'} matched. Latest: ${first.title}.`,
      evidenceIds: remoteFailures.slice(0, 5).map((event) => event.id),
      recommendedAction: 'Compare the historical failure with the live route and session evidence before escalating.',
    });
  }

  if (slowRequests.length > 0) {
    const first = slowRequests[0];
    issues.push({
      id: 'slow-requests',
      severity: 'warning',
      title: 'Slow route responses',
      summary: `${slowRequests.length} request${slowRequests.length === 1 ? '' : 's'} exceeded ${SLOW_REQUEST_MS}ms. Latest: ${first.path} took ${first.durationMs}ms.`,
      evidenceIds: slowRequests.slice(0, 5).map((request) => `request-${request.ts}-${request.path}`),
      recommendedAction: 'Check whether the slow route maps to SQL, Clio, or a known warmup path before retrying.',
    });
  }

  if (degradedSessions.length > 0 && issues.length === 0) {
    const first = degradedSessions[0];
    issues.push({
      id: 'busy-sessions',
      severity: 'notice',
      title: 'Session is busy but no hard failure is visible',
      summary: `${degradedSessions.length} active session${degradedSessions.length === 1 ? '' : 's'} are busy or degraded. Latest: ${first.lastEventLabel || first.sessionId}.`,
      evidenceIds: degradedSessions.slice(0, 5).map((trace) => `session-${trace.sessionId}`),
      recommendedAction: 'Wait for the pending step to resolve or ask the caller which button/page they last used.',
    });
  }

  if (issues.length === 0) {
    const hasAnyEvidence = requests.length > 0 || traces.length > 0 || opEvents.length > 0 || remoteEvents.length > 0;
    const stagingUnavailable = remoteState && !remoteState.configured;
    issues.push({
      id: stagingUnavailable && !hasAnyEvidence ? 'staging-logs-not-connected' : hasAnyEvidence ? 'no-clear-fault' : 'no-evidence',
      severity: stagingUnavailable && !hasAnyEvidence ? 'warning' : 'clear',
      title: stagingUnavailable && !hasAnyEvidence
        ? 'Staging logs are not connected locally'
        : hasAnyEvidence
          ? 'No obvious fault in this window'
          : 'No matching activity found',
      summary: stagingUnavailable && !hasAnyEvidence
        ? `No local evidence matched ${initials || 'ALL'}, and this local server cannot query staging yet.`
        : hasAnyEvidence
          ? 'There is activity, but no 5xx, client error, or slow request stands out.'
          : 'No live, local, or App Insights evidence matched this filter.',
      evidenceIds: [],
      recommendedAction: stagingUnavailable && !hasAnyEvidence
        ? 'Set SYSTEM_TRIAGE_STAGING_LOG_ANALYTICS_WORKSPACE_ID or STAGING_LOG_ANALYTICS_WORKSPACE_ID locally, restart the dev server, then rerun this user/time window.'
        : hasAnyEvidence
          ? 'Widen the window or switch to all users if the caller cannot remember the exact time.'
          : 'Confirm the user and time window, then check whether they were using staging, production, or Teams local shell.',
    });
  }

  return issues.slice(0, 5);
}

function buildLocalSnapshot({ initials, since, until, limit }) {
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  const allTraces = listSessionTraces(40).list || [];
  const matchingTraces = allTraces.filter((trace) => !initials || String(trace.user || '').toUpperCase() === initials);
  const matchingSessionIds = new Set(matchingTraces.map((trace) => trace.sessionId));

  const requests = getRecentRequests(200)
    .filter((request) => inWindowMs(request.ts, sinceMs, untilMs))
    .filter((request) => !initials || String(request.user || '').toUpperCase() === initials)
    .slice(0, limit);

  const traces = matchingTraces
    .filter((trace) => inWindowMs(trace.lastSeen, sinceMs, untilMs))
    .slice(0, limit);

  const opEvents = opLog.list({ limit: 1000, since: since.toISOString() })
    .filter((entry) => inWindowMs(entry.ts || entry.clientTimestamp, sinceMs, untilMs))
    .filter((entry) => eventUserMatches(entry, initials, matchingSessionIds))
    .filter((entry) => /^telemetry\./i.test(String(entry.type || '')) || entry.error || entry.status === 'error')
    .slice(0, limit);

  const presence = getPresence()
    .filter((entry) => !initials || String(entry.initials || '').toUpperCase() === initials);

  const evidence = [];
  for (const request of requests) {
    const tone = request.status >= 500 ? 'danger' : request.status >= 400 ? 'warning' : 'info';
    evidence.push(buildEvidenceEvent({
      id: `request-${request.ts}-${request.path}`,
      ts: isoFromTs(request.ts),
      source: 'Live request',
      categories: requestCategories(request),
      tone,
      title: `${request.method} ${request.path}`,
      detail: `${request.status} in ${request.durationMs}ms`,
      user: request.user,
      path: request.path,
      status: request.status,
      durationMs: request.durationMs,
    }));
  }

  for (const trace of traces) {
    const sessionDetail = [
      `${trace.pendingCount || 0} pending`,
      `${trace.errorCount || 0} errors`,
      `${trace.slowCount || 0} slow`,
      trace.lastEventLabel,
    ].filter(Boolean).join(' · ');
    evidence.push(buildEvidenceEvent({
      id: `session-${trace.sessionId}`,
      ts: isoFromTs(trace.lastSeen),
      source: 'Session trace',
      categories: traceCategories(trace),
      tone: (trace.errorCount || 0) > 0 || trace.health === 'error' ? 'danger' : trace.health === 'warning' ? 'warning' : 'info',
      title: `${trace.user} on ${trace.tab || 'unknown'}`,
      detail: sessionDetail,
      user: trace.user,
      sessionId: trace.sessionId,
    }));

    for (const event of (trace.recentEvents || []).slice(0, 8)) {
      if (!inWindowMs(event.ts, sinceMs, untilMs)) continue;
      if (event.kind !== 'error' && event.kind !== 'warning' && !/error|fail|exception|timeout|slow/i.test(`${event.label || ''} ${event.type || ''}`)) continue;
      const isTimingEvent = /request-slow|UX\.hydrate|hydrate\./i.test(`${event.label || ''} ${event.type || ''}`);
      evidence.push(buildEvidenceEvent({
        id: `trace-${trace.sessionId}-${event.ts}`,
        ts: isoFromTs(event.ts),
        source: 'Client event',
        categories: clientEventCategories(event),
        tone: event.kind === 'error' ? 'danger' : isTimingEvent ? 'info' : event.kind === 'warning' ? 'warning' : 'info',
        title: event.label,
        detail: `${event.source}.${event.type}`,
        user: trace.user,
        durationMs: event.durationMs,
        sessionId: trace.sessionId,
      }));
    }
  }

  for (const entry of opEvents) {
    const data = entry.data && typeof entry.data === 'object' ? entry.data : {};
    evidence.push(buildEvidenceEvent({
      id: `op-${entry.id || entry.ts}`,
      ts: entry.ts || entry.clientTimestamp,
      source: 'Local telemetry',
      categories: telemetryCategories(entry),
      tone: entry.error || /error|failed/i.test(String(entry.type || '')) ? 'danger' : 'info',
      title: String(entry.type || 'telemetry event'),
      detail: entry.error || data.path || data.tab || 'Telemetry event',
      user: entry.feeEarner || null,
      path: typeof data.path === 'string' ? data.path : null,
      durationMs: Number(entry.durationMs),
      sessionId: entry.clientSessionId || null,
    }));
  }

  return { requests, traces, opEvents, presence, evidence };
}

function escapeKqlString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildLogAnalyticsQuery(initials, since, until, limit, sourcePrefix, allowedRoles = DEFAULT_LOG_ANALYTICS_ROLES) {
  const userFilter = initials ? `| where user =~ targetInitials or name has targetInitials or message has targetInitials or path has targetInitials or tostring(details) has targetInitials` : '';
  const source = escapeKqlString(sourcePrefix || 'App Insights');
  const roleFilter = kqlStringList(allowedRoles);
  return `
let targetInitials = "${escapeKqlString(initials || '')}";
let startTime = datetime(${since.toISOString()});
let endTime = datetime(${until.toISOString()});
union isfuzzy=true
  (exceptions | project ts=timestamp, source="${source} exception", role=tostring(column_ifexists("cloud_RoleName", "")), itemType="exception", name=tostring(problemId), message=tostring(outerMessage), path=tostring(customDimensions.path), user=tostring(coalesce(customDimensions.user, customDimensions.initials, customDimensions.feeEarner, user_Id)), status=toint(customDimensions.status), durationMs=real(null), details=tostring(customDimensions), submissionId=tostring(customDimensions.submissionId), clientSubmissionId=tostring(customDimensions.clientSubmissionId), formKey=tostring(customDimensions.formKey), instructionRef=tostring(customDimensions.instructionRef), route=tostring(customDimensions.route), payloadFingerprint=tostring(customDimensions.payloadFingerprint)),
  (traces | project ts=timestamp, source="${source} trace", role=tostring(column_ifexists("cloud_RoleName", "")), itemType="trace", name="trace", message=tostring(message), path=tostring(customDimensions.path), user=tostring(coalesce(customDimensions.user, customDimensions.initials, customDimensions.feeEarner, user_Id)), status=int(null), durationMs=real(null), details=tostring(customDimensions), submissionId=tostring(customDimensions.submissionId), clientSubmissionId=tostring(customDimensions.clientSubmissionId), formKey=tostring(customDimensions.formKey), instructionRef=tostring(customDimensions.instructionRef), route=tostring(customDimensions.route), payloadFingerprint=tostring(customDimensions.payloadFingerprint)),
  (requests | project ts=timestamp, source="${source} request", role=tostring(column_ifexists("cloud_RoleName", "")), itemType="request", name=tostring(name), message=tostring(url), path=tostring(parse_url(url).Path), user=tostring(coalesce(customDimensions.user, customDimensions.initials, customDimensions.feeEarner, user_Id)), status=toint(resultCode), durationMs=toreal(duration), details=tostring(customDimensions), submissionId=tostring(customDimensions.submissionId), clientSubmissionId=tostring(customDimensions.clientSubmissionId), formKey=tostring(customDimensions.formKey), instructionRef=tostring(customDimensions.instructionRef), route=tostring(customDimensions.route), payloadFingerprint=tostring(customDimensions.payloadFingerprint)),
  (dependencies | project ts=timestamp, source="${source} dependency", role=tostring(column_ifexists("cloud_RoleName", "")), itemType="dependency", name=tostring(name), message=tostring(target), path="", user=tostring(coalesce(customDimensions.user, customDimensions.initials, customDimensions.feeEarner, user_Id)), status=toint(resultCode), durationMs=toreal(duration), details=tostring(customDimensions), submissionId=tostring(customDimensions.submissionId), clientSubmissionId=tostring(customDimensions.clientSubmissionId), formKey=tostring(customDimensions.formKey), instructionRef=tostring(customDimensions.instructionRef), route=tostring(customDimensions.route), payloadFingerprint=tostring(customDimensions.payloadFingerprint)),
  (customEvents | project ts=timestamp, source="${source} event", role=tostring(column_ifexists("cloud_RoleName", "")), itemType="event", name=tostring(name), message=tostring(name), path=tostring(customDimensions.path), user=tostring(coalesce(customDimensions.user, customDimensions.initials, customDimensions.feeEarner, user_Id)), status=int(null), durationMs=toreal(customMeasurements.durationMs), details=tostring(customDimensions), submissionId=tostring(customDimensions.submissionId), clientSubmissionId=tostring(customDimensions.clientSubmissionId), formKey=tostring(customDimensions.formKey), instructionRef=tostring(customDimensions.instructionRef), route=tostring(customDimensions.route), payloadFingerprint=tostring(customDimensions.payloadFingerprint)),
  (AppExceptions | project ts=TimeGenerated, source="${source} exception", role=tostring(column_ifexists("AppRoleName", "")), itemType="exception", name=tostring(ProblemId), message=tostring(OuterMessage), path=tostring(Properties.path), user=tostring(coalesce(Properties.user, Properties.initials, Properties.feeEarner, UserId)), status=toint(Properties.status), durationMs=real(null), details=tostring(Properties), submissionId=tostring(Properties.submissionId), clientSubmissionId=tostring(Properties.clientSubmissionId), formKey=tostring(Properties.formKey), instructionRef=tostring(Properties.instructionRef), route=tostring(Properties.route), payloadFingerprint=tostring(Properties.payloadFingerprint)),
  (AppTraces | project ts=TimeGenerated, source="${source} trace", role=tostring(column_ifexists("AppRoleName", "")), itemType="trace", name="trace", message=tostring(Message), path=tostring(Properties.path), user=tostring(coalesce(Properties.user, Properties.initials, Properties.feeEarner, UserId)), status=int(null), durationMs=real(null), details=tostring(Properties), submissionId=tostring(Properties.submissionId), clientSubmissionId=tostring(Properties.clientSubmissionId), formKey=tostring(Properties.formKey), instructionRef=tostring(Properties.instructionRef), route=tostring(Properties.route), payloadFingerprint=tostring(Properties.payloadFingerprint)),
  (AppRequests | project ts=TimeGenerated, source="${source} request", role=tostring(column_ifexists("AppRoleName", "")), itemType="request", name=tostring(Name), message=tostring(Url), path=tostring(parse_url(Url).Path), user=tostring(coalesce(Properties.user, Properties.initials, Properties.feeEarner, UserId)), status=toint(ResultCode), durationMs=toreal(DurationMs), details=tostring(Properties), submissionId=tostring(Properties.submissionId), clientSubmissionId=tostring(Properties.clientSubmissionId), formKey=tostring(Properties.formKey), instructionRef=tostring(Properties.instructionRef), route=tostring(Properties.route), payloadFingerprint=tostring(Properties.payloadFingerprint)),
  (AppDependencies | project ts=TimeGenerated, source="${source} dependency", role=tostring(column_ifexists("AppRoleName", "")), itemType="dependency", name=tostring(Name), message=tostring(Target), path="", user=tostring(coalesce(Properties.user, Properties.initials, Properties.feeEarner, UserId)), status=toint(ResultCode), durationMs=toreal(DurationMs), details=tostring(Properties), submissionId=tostring(Properties.submissionId), clientSubmissionId=tostring(Properties.clientSubmissionId), formKey=tostring(Properties.formKey), instructionRef=tostring(Properties.instructionRef), route=tostring(Properties.route), payloadFingerprint=tostring(Properties.payloadFingerprint)),
  (AppEvents | project ts=TimeGenerated, source="${source} event", role=tostring(column_ifexists("AppRoleName", "")), itemType="event", name=tostring(Name), message=tostring(Name), path=tostring(Properties.path), user=tostring(coalesce(Properties.user, Properties.initials, Properties.feeEarner, UserId)), status=int(null), durationMs=real(null), details=tostring(Properties), submissionId=tostring(Properties.submissionId), clientSubmissionId=tostring(Properties.clientSubmissionId), formKey=tostring(Properties.formKey), instructionRef=tostring(Properties.instructionRef), route=tostring(Properties.route), payloadFingerprint=tostring(Properties.payloadFingerprint))
| where ts >= startTime and ts < endTime
| where isempty(role) == false and tolower(role) in (${roleFilter})
${userFilter}
| where not (name has_any ("heartbeat", "Heartbeat") or message has_any ("heartbeat", "Heartbeat"))
| extend parsedMessage = parse_json(message)
| extend parsedEventType = tostring(parsedMessage.eventType), parsedError = tostring(parsedMessage.error), parsedStatus = toint(parsedMessage.status), parsedDurationMs = todouble(parsedMessage.durationMs)
| extend status = coalesce(status, parsedStatus), durationMs = coalesce(durationMs, parsedDurationMs)
| extend messageIsJson = message startswith "{"
| where itemType == "exception" or status >= 400 or durationMs >= ${SLOW_REQUEST_MS} or name has_any ("error", "failed", "exception", "timeout", "slow") or parsedEventType has_any ("error", "failed", "exception", "timeout", "slow") or (parsedError !in ("", "null", "undefined")) or (not(messageIsJson) and message has_any ("error", "failed", "exception", "timeout", "slow"))
| extend failureRank = case(itemType == "exception" or status >= 500 or name has_any ("error", "failed", "exception", "timeout") or parsedEventType has_any ("error", "failed", "exception", "timeout") or (parsedError !in ("", "null", "undefined")) or (not(messageIsJson) and message has_any ("error", "failed", "exception", "timeout")), 2, status >= 400, 1, 0)
| sort by failureRank desc, ts desc
| take ${Math.max(40, Math.min(limit * 4, 800))}
`;
}

async function queryLogAnalytics({ initials, since, until, limit }) {
  const stagingWorkspaceId = String(process.env.SYSTEM_TRIAGE_STAGING_LOG_ANALYTICS_WORKSPACE_ID || process.env.STAGING_LOG_ANALYTICS_WORKSPACE_ID || '').trim();
  const workspaceId = stagingWorkspaceId || String(process.env.SYSTEM_TRIAGE_LOG_ANALYTICS_WORKSPACE_ID || process.env.LOG_ANALYTICS_WORKSPACE_ID || '').trim();
  if (!workspaceId) {
    return { configured: false, reason: 'workspace_not_configured', sourceName: 'Staging logs', events: [] };
  }
  const sourceName = stagingWorkspaceId ? 'Staging logs' : 'App Insights';
  const allowedRoles = parseDelimitedList(
    process.env.SYSTEM_TRIAGE_STAGING_LOG_ANALYTICS_ROLES || process.env.SYSTEM_TRIAGE_LOG_ANALYTICS_ROLES,
    DEFAULT_LOG_ANALYTICS_ROLES,
  );

  const startedMs = Date.now();
  const credential = new DefaultAzureCredential();
  const token = await credential.getToken('https://api.loganalytics.io/.default');
  const query = buildLogAnalyticsQuery(initials, since, until, limit, sourceName, allowedRoles);
  const response = await fetch(`https://api.loganalytics.io/v1/workspaces/${encodeURIComponent(workspaceId)}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Log Analytics query failed (${response.status}) ${body.slice(0, 180)}`);
  }

  const payload = await response.json();
  const table = Array.isArray(payload?.tables) ? payload.tables[0] : null;
  const columns = Array.isArray(table?.columns) ? table.columns.map((column) => column.name) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const events = rows.map((row, index) => {
    const item = {};
    columns.forEach((name, columnIndex) => { item[name] = row[columnIndex]; });
    const context = parseRemoteTelemetryContext(item);
    const status = context.status;
    const durationMs = context.durationMs;
    const categories = remoteEventCategories(item, context);
    const metadata = remoteIncidentMetadata(item, context, categories);
    const finalCategories = Array.isArray(metadata.categories) ? metadata.categories : categories;
    const semanticFailureText = [
      item.itemType,
      item.name,
      context.parsedMessage ? context.eventType : item.message,
      context.error,
    ].map((value) => String(value || '')).join(' ');
    const isFailure = metadata.tone === 'info' ? false : item.itemType === 'exception' || status >= 500 || /error|failed|exception|timeout/i.test(semanticFailureText);
    const nameStr = String(item.name || '');
    const exceptionType = item.itemType === 'exception'
      ? (nameStr.split(/\s+at\s+/)[0] || nameStr).trim() || null
      : null;
    const parsedTitle = [safeStr(context.source), safeStr(context.eventType)].filter(Boolean).join('.');
    const title = metadata.title || (item.itemType === 'trace'
      ? (safeStr(context.message) || parsedTitle || safeStr(item.message) || safeStr(item.name) || 'Trace')
      : (safeStr(item.name) || safeStr(item.message) || 'Telemetry event'));
    const detail = metadata.detail || (context.parsedMessage || context.parsedDetails
      ? (safeStr(context.error) || safeStr(context.path) || safeStr(context.url) || safeStr(context.message) || '')
      : (safeStr(item.message) || safeStr(item.path) || ''));
    const targetInitialsUpper = String(initials || '').toUpperCase();
    const rowUser = String(item.user || '').toUpperCase();
    const detailsText = String(item.details || '');
    const scope = targetInitialsUpper
      ? ((rowUser && rowUser === targetInitialsUpper) || detailsText.toUpperCase().includes(targetInitialsUpper) ? 'user' : 'global')
      : 'user';
    return buildEvidenceEvent({
      id: `ai-${Date.parse(String(item.ts || '')) || index}-${index}`,
      ts: item.ts,
      source: item.source || 'App Insights',
      categories: finalCategories,
      tone: metadata.tone || (isFailure ? 'danger' : status >= 400 ? 'warning' : 'info'),
      title,
      detail,
      user: item.user || null,
      path: context.path || context.url || null,
      status: Number.isFinite(status) ? status : null,
      durationMs,
      exceptionType,
      scope,
      submissionId: safeStr(item.submissionId),
      clientSubmissionId: safeStr(item.clientSubmissionId),
      formKey: safeStr(item.formKey),
      instructionRef: safeStr(item.instructionRef),
      route: safeStr(item.route) || safeStr(item.path) || context.path || context.url,
      payloadFingerprint: safeStr(item.payloadFingerprint),
      incidentKey: metadata.incidentKey,
      incidentTitle: metadata.incidentTitle,
      incidentPriority: metadata.incidentPriority,
    });
  });

  trackMetric('System.Triage.LogAnalytics.Duration', Date.now() - startedMs, { operation: 'queryLogAnalytics' });
  return { configured: true, reason: null, sourceName, events };
}

function canAccessSystemTriage(req) {
  const headerInitials = req.headers?.['x-helix-initials'];
  const headerEmail = req.headers?.['x-user-email'];
  const tierRequest = {
    ...req,
    user: {
      ...req.user,
      ...(headerInitials ? { initials: headerInitials } : {}),
      ...(headerEmail ? { email: headerEmail } : {}),
    },
    query: {
      ...req.query,
      initials: undefined,
    },
  };
  return isDevGroupOrHigher(tierRequest);
}

router.get('/', async (req, res) => {
  if (!canAccessSystemTriage(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const startedMs = Date.now();
  const now = new Date();
  const until = parseDate(req.query.until, now);
  const since = parseDate(req.query.since, new Date(until.getTime() - DEFAULT_WINDOW_MS));
  const initials = cleanInitials(req.query.targetInitials || req.query.initials);
  const limit = Math.max(20, Math.min(MAX_LIMIT, Number(req.query.limit) || 80));

  if (initials === '') return res.status(400).json({ ok: false, error: 'invalid_initials' });
  if (since >= until) return res.status(400).json({ ok: false, error: 'invalid_range' });
  if (until.getTime() - since.getTime() > MAX_WINDOW_MS) {
    return res.status(400).json({ ok: false, error: 'window_too_large', maxDays: 7 });
  }

  trackEvent('System.Triage.Query.Started', {
    triggeredBy: req.user?.initials || 'unknown',
    initialsFilter: initials || 'ALL',
    sinceIso: since.toISOString(),
    untilIso: until.toISOString(),
  });

  try {
    const local = buildLocalSnapshot({ initials, since, until, limit });
    let appInsights = { configured: false, reason: 'not_queried', events: [] };
    try {
      appInsights = await queryLogAnalytics({ initials, since, until, limit });
    } catch (error) {
      trackException(error, { operation: 'System.Triage.Query', phase: 'logAnalytics', initialsFilter: initials || 'ALL' });
      appInsights = { configured: true, reason: 'query_failed', sourceName: 'Staging logs', events: [] };
    }

    const evidence = selectRepresentativeEvidence(
      [...local.evidence, ...appInsights.events].filter((event) => event.ts),
      limit,
    );
    const issues = summarizeIssues({
      requests: local.requests,
      traces: local.traces,
      opEvents: local.opEvents,
      remoteEvents: appInsights.events,
      remoteState: appInsights,
      initials,
    });
    const durationMs = Date.now() - startedMs;

    trackMetric('System.Triage.Query.Duration', durationMs, { operation: 'query', initialsFilter: initials || 'ALL' });
    trackEvent('System.Triage.Query.Completed', {
      triggeredBy: req.user?.initials || 'unknown',
      initialsFilter: initials || 'ALL',
      durationMs,
      issueCount: issues.length,
      evidenceCount: evidence.length,
      appInsightsState: appInsights.configured ? (appInsights.reason || 'ok') : appInsights.reason,
    });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        initials: initials || 'ALL',
        since: since.toISOString(),
        until: until.toISOString(),
        limit,
      },
      sources: {
        live: true,
        localTelemetry: true,
        appInsights: {
          configured: appInsights.configured,
          status: appInsights.configured ? (appInsights.reason || 'ok') : appInsights.reason,
          name: appInsights.sourceName || 'Staging logs',
          count: appInsights.events.length,
        },
      },
      summary: {
        issueCount: issues.length,
        evidenceCount: evidence.length,
        serverErrors: local.requests.filter((request) => request.status >= 500).length + appInsights.events.filter((event) => event.categories?.includes('server-errors')).length,
        clientErrors: local.traces.reduce((sum, trace) => sum + (trace.errorCount || 0), 0) + appInsights.events.filter((event) => event.categories?.includes('client-errors')).length,
        slowRequests: local.requests.filter((request) => request.durationMs >= SLOW_REQUEST_MS).length + appInsights.events.filter((event) => event.categories?.includes('slow-routes')).length,
        activeSessions: local.traces.length,
        onlineUsers: local.presence.length,
      },
      issues,
      evidence,
    });
  } catch (error) {
    trackException(error, { operation: 'System.Triage.Query', phase: 'route', initialsFilter: initials || 'ALL' });
    trackEvent('System.Triage.Query.Failed', {
      triggeredBy: req.user?.initials || 'unknown',
      initialsFilter: initials || 'ALL',
      error: error.message,
      durationMs: Date.now() - startedMs,
    });
    return res.status(500).json({ ok: false, error: 'triage_failed', message: error.message });
  }
});

// POST /api/system-triage/replay-matter
// Re-runs the matter-opening chain for a given instruction. Dry-run by default.
// Gated to LZ/AC initially; commit also requires dev-group-or-higher.
router.post('/replay-matter', express.json({ limit: '64kb' }), async (req, res) => {
  if (!canAccessSystemTriage(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const headerInitials = String(req.headers?.['x-helix-initials'] || req.user?.initials || '').trim().toUpperCase();
  if (!REPLAY_ALLOWED_INITIALS.has(headerInitials)) {
    return res.status(403).json({ ok: false, error: 'forbidden_replay_role' });
  }

  const body = req.body || {};
  const instructionRef = String(body.instructionRef || '').trim();
  const initials = String(body.initials || headerInitials || '').trim().toUpperCase();
  const commit = body.commit === true;
  const dryRun = !commit;

  if (!/^[A-Z]+-?\d+-\d+$/i.test(instructionRef)) {
    return res.status(400).json({ ok: false, error: 'invalid_instruction_ref' });
  }

  const startedMs = Date.now();
  trackEvent('System.Errors.Action.ReplayStarted', {
    triggeredBy: headerInitials,
    instructionRef,
    initials,
    dryRun: String(dryRun),
  });

  try {
    const result = await runMatterReplay({ instructionRef, initials, dryRun });
    trackMetric('System.Errors.Action.ReplayDuration', Date.now() - startedMs, { dryRun: String(dryRun) });
    trackEvent('System.Errors.Action.ReplayCompleted', {
      triggeredBy: headerInitials,
      instructionRef,
      dryRun: String(dryRun),
      ok: String(result.ok),
      exitCode: String(result.exitCode),
    });
    return res.json({
      ok: result.ok,
      dryRun: result.dryRun,
      output: result.output,
      stderr: result.stderr ? result.stderr.slice(0, 2000) : '',
      exitCode: result.exitCode,
    });
  } catch (error) {
    trackException(error, { operation: 'System.Errors.Action.Replay', instructionRef, dryRun: String(dryRun) });
    const status = error?.message === 'matter_replay_timeout' ? 504 : 500;
    return res.status(status).json({
      ok: false,
      error: error?.message || 'replay_failed',
      message: error?.userMessage || error?.message || 'Matter replay failed',
    });
  }
});

// GET /api/system-triage/user-submissions?initials=XX&hours=2&limit=40
// Returns recent dbo.form_submissions for a single user. Powers the Lookup
// submodule: "what did this person submit in the last N hours, and how did
// each one land?". No payload bodies returned by default (use the existing
// /api/process-hub/submissions/:id endpoint to drill in).
router.get('/user-submissions', async (req, res) => {
  if (!canAccessSystemTriage(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const initials = String(req.query.initials || '').trim().toUpperCase();
  if (!/^[A-Z]{2,8}$/.test(initials)) {
    return res.status(400).json({ ok: false, error: 'invalid_initials' });
  }
  const hours = Math.max(0.25, Math.min(72, Number(req.query.hours) || 2));
  const limit = Math.max(1, Math.min(120, Number(req.query.limit) || 40));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const startedMs = Date.now();
  try {
    const rows = await listRecentSubmissionsForUser({ initials, since, limit });
    const submissions = rows.map((row) => ({
      id: row.id,
      formKey: row.form_key,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      lane: row.lane,
      summary: row.summary,
      processingStatus: row.processing_status,
      lastEvent: row.last_event,
      lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null,
      retriggerCount: row.retrigger_count || 0,
      lastRetriggeredAt: row.last_retriggered_at ? new Date(row.last_retriggered_at).toISOString() : null,
      lastRetriggeredBy: row.last_retriggered_by || null,
      clientSubmissionId: row.client_submission_id || null,
      stepCount: Array.isArray(row.steps) ? row.steps.length : 0,
      lastStep: Array.isArray(row.steps) && row.steps.length
        ? {
            name: row.steps[row.steps.length - 1]?.name || null,
            status: row.steps[row.steps.length - 1]?.status || null,
            error: row.steps[row.steps.length - 1]?.error || null,
          }
        : null,
    }));

    trackMetric('System.Triage.UserSubmissions.Duration', Date.now() - startedMs, { operation: 'userSubmissions' });
    trackEvent('System.Triage.UserSubmissions.Completed', {
      triggeredBy: req.user?.initials || 'unknown',
      initials,
      hours: String(hours),
      count: submissions.length,
    });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: { initials, since: since.toISOString(), hours, limit },
      submissions,
    });
  } catch (error) {
    trackException(error, { operation: 'System.Triage.UserSubmissions', initials });
    return res.status(500).json({ ok: false, error: 'user_submissions_failed', message: error?.message || 'lookup failed' });
  }
});

module.exports = router;