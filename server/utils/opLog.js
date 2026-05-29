const fs = require('fs');
const path = require('path');
const MAX_EVENTS = 1000;
const events = [];
const sessionId = Math.random().toString(36).slice(2);
// In dev, __dirname is <repo>/server/utils, so logs land at <repo>/logs (outside the
// `node --watch-path=server` tree). In prod the deploy flattens server/ to the app
// root, so __dirname is <approot>/utils and logs land at <approot>/logs. Detect by
// asking whether the parent dir is literally named "server".
const PARENT_DIR = path.join(__dirname, '..');
const IS_DEV_LAYOUT = path.basename(PARENT_DIR) === 'server';
const LOG_DIR = IS_DEV_LAYOUT
  ? path.join(PARENT_DIR, '..', 'logs')
  : path.join(PARENT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ops.log.jsonl');

function nowIso() {
  return new Date().toISOString();
}

function redact(url) {
  if (!url) return url;
  return String(url).replace(/([?&]code=)[^&]+/i, '$1***');
}

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) { /* ignore */ }
}

function init() {
  ensureLogDir();
  try {
    if (fs.existsSync(LOG_FILE)) {
      const data = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = data.split(/\r?\n/).filter(Boolean);
      const tail = lines.slice(-MAX_EVENTS);
      for (const line of tail) {
        try {
          const obj = JSON.parse(line);
          events.push(obj);
        } catch { /* ignore bad line */ }
      }
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    }
  } catch { /* ignore load errors */ }
}

function append(event) {
  const entry = {
    id: Math.random().toString(36).slice(2),
    ts: nowIso(),
    sessionId,
    ...event,
  };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  try {
    ensureLogDir();
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  } catch { /* ignore write errors */ }
  return entry;
}

function list({ type, status, limit = 200, since, sessionId: filterSession } = {}) {
  let out = events;
  if (type) {
    out = out.filter(e => type instanceof RegExp ? type.test(e.type) : e.type === type);
  }
  if (status) out = out.filter(e => e.status === status);
  if (since) out = out.filter(e => e.ts >= since);
  if (filterSession) out = out.filter(e => e.sessionId === filterSession);
  out = out.slice().reverse();
  if (limit && Number.isFinite(limit)) out = out.slice(0, limit);
  return out;
}

module.exports = { append, list, redact, init, sessionId };
