/**
 * Session tracker — tracks active SSE connections by user and stream type.
 *
 * Exposes who is currently connected to the platform via SSE streams.
 * Feeds the Sessions panel on the ops-pulse dashboard.
 */

// Map<connectionId, { user, stream, connectedAt }>
const _sessions = new Map();
let _counter = 0;

/**
 * Register an SSE connection. Returns an ID to use when unregistering.
 * @param {string} user - User initials
 * @param {string} stream - Stream name (e.g. 'reporting-stream', 'home-metrics')
 * @returns {string} connectionId
 */
function register(user, stream) {
  const id = `sse-${++_counter}`;
  _sessions.set(id, {
    user: user || 'unknown',
    stream,
    connectedAt: Date.now(),
  });
  return id;
}

/**
 * Unregister an SSE connection.
 * @param {string} id - Connection ID from register()
 */
function unregister(id) {
  _sessions.delete(id);
}

/** Get all active sessions */
function getActiveSessions() {
  const sessions = [];
  for (const [id, info] of _sessions) {
    sessions.push({
      id,
      ...info,
      durationMs: Date.now() - info.connectedAt,
    });
  }
  return sessions;
}

/** Summary for pulse strip */
function getSessionStats() {
  const sessions = getActiveSessions();
  const users = new Set(sessions.map((s) => s.user));
  const streams = {};
  sessions.forEach((s) => {
    streams[s.stream] = (streams[s.stream] || 0) + 1;
  });

  return {
    totalConnections: sessions.length,
    uniqueUsers: users.size,
    users: Array.from(users),
    streams,
  };
}

module.exports = { register, unregister, getActiveSessions, getSessionStats };
