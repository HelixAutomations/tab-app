const fs = require('fs');
const path = require('path');
const MAX_EVENTS = 1000;
const DEV_RETENTION_DAYS = 3;
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

function retentionCutoffIso() {
  return new Date(Date.now() - (DEV_RETENTION_DAYS * 24 * 60 * 60 * 1000)).toISOString();
}

function parseLines(text) {
  return text.split(/\r?\n/).filter(Boolean);
}

function filterRetainedLines(lines, cutoffIso) {
  return lines.filter((line) => {
    try {
      const obj = JSON.parse(line);
      return !obj?.ts || obj.ts >= cutoffIso;
    } catch {
      return false;
    }
  });
}

function pruneLogFileIfNeeded() {
  if (!IS_DEV_LAYOUT) {
    return [];
  }

  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const current = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = parseLines(current);
    const kept = filterRetainedLines(lines, retentionCutoffIso());

    if (kept.length !== lines.length) {
      const next = kept.length ? `${kept.join('\n')}\n` : '';
      fs.writeFileSync(LOG_FILE, next, 'utf8');
    }

    return kept;
  } catch {
    return [];
  }
}

function init() {
  ensureLogDir();
  try {
    if (fs.existsSync(LOG_FILE)) {
      const lines = pruneLogFileIfNeeded();
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
    pruneLogFileIfNeeded();
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
