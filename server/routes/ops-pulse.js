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
 * Gated to dev group (LZ + AC) only. SSE excluded from compression + rate limiting.
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

const router = express.Router();
const log = createLogger('OpsPulse');

// ── Error bus — other modules emit here, we collect + broadcast ──
const errorBus = new EventEmitter();
errorBus.setMaxListeners(20);

const ERROR_BUFFER_SIZE = 50;
const _errors = [];

/** Push an error to the ring buffer. Called by errorHandler + hubNotifier. */
function pushError(entry) {
  _errors.push({
    ts: Date.now(),
    message: entry.message || 'Unknown error',
    path: entry.path || null,
    status: entry.status || 500,
    user: entry.user || null,
    stack: entry.stack ? entry.stack.split('\n').slice(0, 3).join('\n') : null,
  });
  if (_errors.length > ERROR_BUFFER_SIZE) _errors.shift();
  errorBus.emit('app-error', _errors[_errors.length - 1]);
}

function getRecentErrors(limit = 50) {
  return _errors.slice(-limit).reverse();
}

/** Dev group gate — LZ + AC */
function isDevGroup(req) {
  const initials = (req.user?.initials || req.query?.initials || '').toUpperCase().trim();
  return ['LZ', 'AC'].includes(initials);
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
  if (!isDevGroup(req)) return res.status(403).json({ error: 'forbidden' });

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
  if (!isDevGroup(req)) return res.status(403).json({ error: 'forbidden' });

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
    log.info('[OpsPulse] Client disconnected');
  });

  log.info('[OpsPulse] Client connected');
});

module.exports = { router, pushError, errorBus };
