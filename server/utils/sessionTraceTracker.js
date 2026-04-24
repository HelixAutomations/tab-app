/**
 * Session trace tracker — bounded live buffer of client telemetry by browser session.
 *
 * This is intentionally ephemeral and operator-facing.
 * It is not the durable system of record; Application Insights remains the long-term store.
 */

const SESSION_TTL_MS = 20 * 60 * 1000;
const MAX_SESSIONS = 40;
const MAX_EVENTS_PER_SESSION = 30;
const ACTIVE_EVENT_PREFIX = 'boot:';

const traces = new Map();

function formatTab(tab) {
  const labels = {
    home: 'Home',
    enquiries: 'Enquiries',
    matters: 'Matters',
    instructions: 'Instructions',
    reporting: 'Reporting',
    roadmap: 'Activity',
    blueprints: 'Blueprints',
    resources: 'Resources',
    forms: 'Forms',
  };

  return labels[tab] || tab || 'Unknown';
}

function sweep() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, session] of traces.entries()) {
    if ((session.lastSeen || 0) < cutoff) {
      traces.delete(sessionId);
    }
  }

  if (traces.size <= MAX_SESSIONS) return;

  const sorted = Array.from(traces.entries()).sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
  const keep = new Set(sorted.slice(0, MAX_SESSIONS).map(([sessionId]) => sessionId));
  for (const sessionId of traces.keys()) {
    if (!keep.has(sessionId)) traces.delete(sessionId);
  }
}

function getEventKind(type, error, durationMs) {
  const lowerType = String(type || '').toLowerCase();
  if (error || lowerType.includes('failed') || lowerType.includes('error')) return 'error';
  if (lowerType.includes('slow') || (Number.isFinite(durationMs) && durationMs >= 1000)) return 'warning';
  if (lowerType.includes('completed') || lowerType.includes('restored') || lowerType.includes('connected')) return 'success';
  return 'info';
}

function summarizeEvent(source, type, data = {}, error) {
  if (source === 'Boot' && type === 'stage') {
    const flow = data.flow ? String(data.flow) : 'boot';
    const stage = data.stage ? String(data.stage) : 'stage';
    const status = data.status ? String(data.status) : 'updated';
    return `${flow} · ${stage} · ${status}`;
  }

  if (source === 'Boot' && type === 'summary') {
    return `${data.flow ? String(data.flow) : 'boot'} summary`;
  }

  if (source === 'Nav' && type === 'tab-switch') {
    return `${formatTab(String(data.from || 'unknown'))} -> ${formatTab(String(data.to || 'unknown'))}`;
  }

  if (source === 'Network' && (type === 'request-slow' || type === 'request-failed')) {
    return `${String(data.method || 'GET')} ${String(data.path || 'request')}`;
  }

  if (source === 'AppShell' && String(type).startsWith('enquiries-stream')) {
    return String(data.path || '/api/enquiries-unified/stream');
  }

  if (source === 'Browser' && error) {
    return String(error);
  }

  const preferred = [data.stage, data.path, data.to, data.tab, data.flow].find((value) => typeof value === 'string' && value.trim());
  return preferred ? `${source} · ${type} · ${preferred}` : `${source} · ${type}`;
}

function activeKeyForEvent(source, type, data = {}) {
  if (source !== 'Boot' || type !== 'stage') return null;
  const flow = data.flow ? String(data.flow) : 'boot';
  const stage = data.stage ? String(data.stage) : 'stage';
  return `${ACTIVE_EVENT_PREFIX}${flow}:${stage}`;
}

function ensureSession(sessionId) {
  const existing = traces.get(sessionId);
  if (existing) return existing;

  const created = {
    sessionId,
    user: 'unknown',
    name: 'unknown',
    lastSeen: Date.now(),
    tab: 'unknown',
    pendingKeys: new Set(),
    errorCount: 0,
    slowCount: 0,
    recentEvents: [],
    lastErrorAt: null,
    lastSlowAt: null,
    lastEventLabel: null,
  };
  traces.set(sessionId, created);
  return created;
}

function recordTrace({ sessionId, user, source, type, data, error, durationMs, clientTimestamp }) {
  if (!sessionId) return;

  sweep();
  const session = ensureSession(sessionId);
  const now = Date.now();

  session.lastSeen = now;
  if (user?.initials) session.user = String(user.initials).toUpperCase();
  if (user?.name) session.name = String(user.name);

  if (source === 'Nav' && type === 'heartbeat' && data?.tab) {
    session.tab = String(data.tab);
    traces.set(sessionId, session);
    return;
  }

  if (source === 'Nav' && type === 'tab-switch' && data?.to) {
    session.tab = String(data.to);
  } else if (data?.tab) {
    session.tab = String(data.tab);
  }

  const activeKey = activeKeyForEvent(source, type, data);
  const status = data?.status ? String(data.status) : null;
  if (activeKey && status === 'started') {
    session.pendingKeys.add(activeKey);
  } else if (activeKey && status && ['completed', 'failed', 'skipped', 'restored'].includes(status)) {
    session.pendingKeys.delete(activeKey);
  }

  const kind = getEventKind(type, error, durationMs);
  const label = summarizeEvent(source, type, data, error);
  if (kind === 'error') {
    session.errorCount += 1;
    session.lastErrorAt = now;
  }
  if (kind === 'warning') {
    session.slowCount += 1;
    session.lastSlowAt = now;
  }

  session.lastEventLabel = label;
  session.recentEvents.unshift({
    ts: Number.isFinite(Date.parse(String(clientTimestamp || ''))) ? Date.parse(String(clientTimestamp)) : now,
    source,
    type,
    label,
    kind,
    durationMs: Number.isFinite(durationMs) ? Number(durationMs) : null,
    error: error || null,
  });
  if (session.recentEvents.length > MAX_EVENTS_PER_SESSION) {
    session.recentEvents.length = MAX_EVENTS_PER_SESSION;
  }

  traces.set(sessionId, session);
}

function getHealth(session) {
  const now = Date.now();
  if (session.lastErrorAt && now - session.lastErrorAt < 5 * 60 * 1000) return 'error';
  if (session.pendingKeys.size > 0) return 'busy';
  if (session.lastSlowAt && now - session.lastSlowAt < 5 * 60 * 1000) return 'warning';
  return 'healthy';
}

function listSessionTraces(limit = 12) {
  sweep();

  const sessions = Array.from(traces.values())
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, limit)
    .map((session) => ({
      sessionId: session.sessionId,
      user: session.user,
      name: session.name,
      tab: session.tab,
      lastSeen: session.lastSeen,
      pendingCount: session.pendingKeys.size,
      errorCount: session.errorCount,
      slowCount: session.slowCount,
      health: getHealth(session),
      lastEventLabel: session.lastEventLabel,
      recentEvents: session.recentEvents.slice(0, 12),
    }));

  const degraded = sessions.filter((session) => session.health === 'error' || session.health === 'warning').length;
  const busy = sessions.filter((session) => session.health === 'busy').length;

  return {
    active: sessions.length,
    degraded,
    busy,
    list: sessions,
  };
}

module.exports = {
  recordTrace,
  listSessionTraces,
};