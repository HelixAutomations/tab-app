/**
 * Presence tracker — tracks which users are online and what tab they're viewing.
 *
 * Clients send heartbeats every 60s via the telemetry endpoint.
 * Entries expire after 90s of silence (missed heartbeat = offline).
 * Feeds the Presence panel on the Activity tab's Live Monitor.
 */

const TTL_MS = 90_000; // 90 seconds — 1.5× heartbeat interval

// Map<initials, { initials, name, tab, lastSeen, email }>
const _presence = new Map();

/**
 * Update presence for a user. Called on each heartbeat.
 * @param {{ initials: string, name?: string, email?: string }} user
 * @param {string} tab - Active tab key (e.g. 'home', 'enquiries', 'matters')
 */
function update(user, tab) {
  if (!user?.initials) return;
  _presence.set(user.initials, {
    initials: user.initials,
    name: user.name || user.initials,
    email: user.email || '',
    tab: tab || 'unknown',
    lastSeen: Date.now(),
  });
}

/**
 * Remove stale entries older than TTL.
 */
function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, entry] of _presence) {
    if (entry.lastSeen < cutoff) {
      _presence.delete(key);
    }
  }
}

/**
 * Get all currently-online users (after sweeping stale entries).
 * @returns {Array<{ initials: string, name: string, tab: string, lastSeen: number, email: string }>}
 */
function getPresence() {
  sweep();
  return Array.from(_presence.values());
}

/**
 * Summary for pulse strip.
 * @returns {{ online: number, tabs: Record<string, number> }}
 */
function getPresenceStats() {
  const entries = getPresence();
  const tabs = {};
  entries.forEach((e) => {
    tabs[e.tab] = (tabs[e.tab] || 0) + 1;
  });
  return {
    online: entries.length,
    tabs,
  };
}

module.exports = { update, getPresence, getPresenceStats };
