/**
 * Ops Pulse — SSE stream + REST snapshot for the Live Monitor dashboard.
 *
 * Provides 6 event types:
 *   pulse     – heartbeat with uptime, connections, request stats
 *   scheduler – sync tier states, mutex, next fires
 *   errors    – recent error ring buffer
 *   sessions  – active SSE sessions
 *   requests  – recent API request log
 *   presence  – who is online and what tab they're viewing
 *
 * Gated to dev group only. SSE excluded from compression + rate limiting.
 */

const express = require('express');
const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');
const { getStatus } = require('../utils/serverStatus');
const { getSchedulerState } = require('../utils/dataOperationsScheduler');
const { getRecentRequests, getRequestStats } = require('../utils/requestTracker');
const { getActiveSessions, getSessionStats, register, unregister } = require('../utils/sessionTracker');
const { getPresence, getPresenceStats, update } = require('../utils/presenceTracker');
const { listSessionTraces } = require('../utils/sessionTraceTracker');
const { isDevGroupOrHigher } = require('../utils/userTier');
const { getOpsCheckRunSummary } = require('../utils/opsCheckCatalog');

const router = express.Router();
const log = createLogger('OpsPulse');

// ── Shared event bus — channels emit here, SSE stream subscribes ──
const errorBus = new EventEmitter();
errorBus.setMaxListeners(40);

/**
 * Factory for an ops-pulse failure channel.
 *
 * Each channel is a bounded ring buffer that:
 *   - caps entries at `bufferSize` (oldest dropped first)
 *   - culls entries older than `maxAgeMs` on every read (keeps the buffer relevant)
 *   - emits `eventName` on the shared `errorBus` whenever a new entry arrives
 *
 * Use this whenever a new failure class needs dev-group visibility (proxy
 * timeouts, schema-mismatch 400s, stale token refreshes, etc.). One channel
 * per class — adding one is ~5 lines instead of touching 5 files.
 *
 * @param {Object} opts
 * @param {string} opts.eventName    Bus event name (also used in logs).
 * @param {number} [opts.bufferSize] Max retained entries (default 50).
 * @param {number} [opts.maxAgeMs]   Entries older than this are filtered on read (default 15min).
 * @param {(raw: any) => any} [opts.normalize] Shape the entry before storage. Receives caller arg, returns stored object. Always overrides `ts`.
 */
function createOpsPulseChannel({ eventName, bufferSize = 50, maxAgeMs = 15 * 60_000, normalize }) {
  const buf = [];

  function push(raw) {
    const base = typeof normalize === 'function' ? normalize(raw) : { ...raw };
    const entry = { ...base, ts: Date.now() };
    buf.push(entry);
    if (buf.length > bufferSize) buf.shift();
    errorBus.emit(eventName, entry);
    return entry;
  }

  function getRecent(limit = bufferSize) {
    const cutoff = Date.now() - maxAgeMs;
    // Cull old entries in-place so the buffer doesn't fossilise.
    while (buf.length > 0 && buf[0].ts < cutoff) buf.shift();
    return buf.slice(-limit).reverse();
  }

  function size() {
    return buf.length;
  }

  return { push, getRecent, size, eventName };
}

// ── Errors channel ──
const errorsChannel = createOpsPulseChannel({
  eventName: 'app-error',
  bufferSize: 50,
  maxAgeMs: 15 * 60_000,
  normalize: (entry) => ({
    message: entry.message || 'Unknown error',
    path: entry.path || null,
    status: entry.status || 500,
    user: entry.user || null,
    stack: entry.stack ? entry.stack.split('\n').slice(0, 3).join('\n') : null,
  }),
});

/** Push an error to the ring buffer. Called by errorHandler + hubNotifier. */
function pushError(entry) { return errorsChannel.push(entry); }
function getRecentErrors(limit = 50) { return errorsChannel.getRecent(limit); }

// ── Doubled-API channel ──
// Surfaced in the Activity tab alerts strip. Populated by the `/api/api/*`
// middleware in `server/index.js`. Time-bounded so a 9am regression doesn't
// still glow red at 5pm — the operator sees it for 15 minutes, then it ages out.
const doubledApiChannel = createOpsPulseChannel({
  eventName: 'doubled-api',
  bufferSize: 50,
  maxAgeMs: 15 * 60_000,
  normalize: (entry) => ({
    method: entry.method || 'GET',
    originalPath: entry.originalPath || '',
    suggestedPath: entry.suggestedPath || '',
    referer: entry.referer || '',
    userAgent: entry.userAgent || '',
  }),
});

/** Push a doubled-api hit. Called by the `/api/api/*` middleware. */
function pushDoubledApi(entry) { return doubledApiChannel.push(entry); }
function getRecentDoubledApi(limit = 50) { return doubledApiChannel.getRecent(limit); }

function pushOpsCheckSummary(summary) {
  errorBus.emit('ops-checks', summary || getOpsCheckRunSummary());
}

function getMonitorUser(req) {
  const initials = (req.user?.initials || req.query?.initials || '').toUpperCase().trim();
  if (!initials) return null;

  return {
    initials,
    name: req.user?.fullName || req.query?.name || initials,
    email: req.user?.email || req.query?.email || '',
  };
}

// ── REST snapshot (for initial load) ──
router.get('/snapshot', (req, res) => {
  if (!isDevGroupOrHigher(req)) return res.status(403).json({ error: 'forbidden' });

  const monitorUser = getMonitorUser(req);
  if (monitorUser) {
    update(monitorUser, 'activity');
  }

  const serverStatus = getStatus();
  const schedulerState = getSchedulerState();
  const requestStats = getRequestStats();
  const sessionStats = getSessionStats();

  res.json({
    pulse: {
      uptimeSeconds: serverStatus.uptimeSeconds,
      startedAt: serverStatus.startedAt,
      connections: serverStatus,
      requests: requestStats,
    },
    scheduler: schedulerState,
    errors: getRecentErrors(50),
    doubledApi: getRecentDoubledApi(50),
    opsChecks: getOpsCheckRunSummary(),
    sessions: {
      ...sessionStats,
      list: getActiveSessions(),
    },
    sessionTraces: listSessionTraces(12),
    requests: getRecentRequests(50),
    presence: {
      ...getPresenceStats(),
      list: getPresence(),
    },
  });
});

// ── SSE stream (real-time updates) ──
router.get('/stream', (req, res) => {
  if (!isDevGroupOrHigher(req)) return res.status(403).json({ error: 'forbidden' });

  const monitorUser = getMonitorUser(req);
  if (monitorUser) {
    update(monitorUser, 'activity');
  }
  const sessionId = register(monitorUser?.initials || req.query?.initials || 'unknown', 'ops-pulse');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (typeof res.flushHeaders === 'function') {
    try { res.flushHeaders(); } catch { /* ignore */ }
  }

  let alive = true;

  function writeSse(event, data) {
    if (!alive || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    } catch { /* connection closed */ }
  }

  // Send initial snapshot immediately
  const serverStatus = getStatus();
  writeSse('pulse', {
    uptimeSeconds: serverStatus.uptimeSeconds,
    startedAt: serverStatus.startedAt,
    connections: serverStatus,
    requests: getRequestStats(),
  });
  writeSse('scheduler', getSchedulerState());
  writeSse('errors', getRecentErrors(50));
  writeSse('doubledApi', getRecentDoubledApi(50));
  writeSse('opsChecks', getOpsCheckRunSummary());
  writeSse('sessions', { ...getSessionStats(), list: getActiveSessions() });
  writeSse('sessionTraces', listSessionTraces(12));
  writeSse('requests', getRecentRequests(50));
  writeSse('presence', { ...getPresenceStats(), list: getPresence() });

  // ── Periodic broadcasts ──

  // Pulse + scheduler every 5s
  const pulseInterval = setInterval(() => {
    const status = getStatus();
    writeSse('pulse', {
      uptimeSeconds: status.uptimeSeconds,
      startedAt: status.startedAt,
      connections: status,
      requests: getRequestStats(),
    });
    writeSse('scheduler', getSchedulerState());
  }, 5000);

  // Sessions + presence every 10s
  const sessionInterval = setInterval(() => {
    writeSse('sessions', { ...getSessionStats(), list: getActiveSessions() });
    writeSse('sessionTraces', listSessionTraces(12));
    writeSse('presence', { ...getPresenceStats(), list: getPresence() });
  }, 10000);

  // Request log every 3s
  const requestInterval = setInterval(() => {
    writeSse('requests', getRecentRequests(30));
  }, 3000);

  // Error bus — push immediately when an error occurs
  const onError = (err) => writeSse('error', err);
  errorBus.on('app-error', onError);

  // Doubled-API hit — push immediately so the alerts strip lights up live
  const onDoubledApi = (hit) => writeSse('doubledApi.hit', hit);
  errorBus.on('doubled-api', onDoubledApi);

  const onOpsChecks = (summary) => writeSse('opsChecks', summary);
  errorBus.on('ops-checks', onOpsChecks);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    if (!alive || res.writableEnded || res.destroyed) return;
    try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    alive = false;
    unregister(sessionId);
    clearInterval(pulseInterval);
    clearInterval(sessionInterval);
    clearInterval(requestInterval);
    clearInterval(heartbeat);
    errorBus.removeListener('app-error', onError);
    errorBus.removeListener('doubled-api', onDoubledApi);
    errorBus.removeListener('ops-checks', onOpsChecks);
    log.info('[OpsPulse] Client disconnected');
  });

  log.info('[OpsPulse] Client connected');
});

module.exports = { router, pushError, pushDoubledApi, pushOpsCheckSummary, errorBus };
