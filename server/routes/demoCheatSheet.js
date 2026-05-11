// server/routes/demoCheatSheet.js
//
// Backs the LZ-only Demo Cheat Sheet overlay (Ctrl+Shift+D).
//
//   GET  /api/demo-cheat-sheet/access            → { allowed: string[] }
//   POST /api/demo-cheat-sheet/access            body: { requesterInitials, initials, action: 'grant'|'revoke' }
//   GET  /api/demo-cheat-sheet/overrides?presenter=LZ
//                                                → { schema, sections, updatedAt }
//   PUT  /api/demo-cheat-sheet/overrides         body: { requesterInitials, presenter, overrides }
//
// LZ is always implicitly allowed and cannot be revoked.
// Mutations require requesterInitials === 'LZ'. This is honour-system,
// internal-only — same trust level as the rest of the dev-preview gates.

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Resolve the data directory in both layouts:
//   - deployed IIS: routes/demoCheatSheet.js -> ../data
//   - local/dev:    server/routes/demoCheatSheet.js -> ../../data
// App Service can leave a stale C:\home\site\data folder behind, so prefer
// the sibling wwwroot/data candidate first and only fall back to ../../data.
const DATA_DIR = (() => {
  const candidates = [
    path.join(__dirname, '..', 'data'),
    path.join(__dirname, '..', '..', 'data'),
  ];
  for (const dir of candidates) {
    try { if (fs.existsSync(dir)) return dir; } catch { /* ignore */ }
  }
  return candidates[0];
})();
const STORE_PATH = path.join(DATA_DIR, 'demo-cheat-sheet-access.json');
const OVERRIDES_PATH = path.join(DATA_DIR, 'demo-cheat-sheet-overrides.json');
const OWNER = 'LZ';

function ensureStore() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ allowed: [OWNER], updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const allowed = Array.isArray(parsed?.allowed) ? parsed.allowed : [];
    const set = new Set(allowed.map((v) => String(v || '').toUpperCase()).filter(Boolean));
    set.add(OWNER);
    return { allowed: Array.from(set), updatedAt: parsed?.updatedAt || null };
  } catch (err) {
    return { allowed: [OWNER], updatedAt: null };
  }
}

function writeStore(allowed) {
  const set = new Set(allowed.map((v) => String(v || '').toUpperCase()).filter(Boolean));
  set.add(OWNER);
  const payload = { allowed: Array.from(set), updatedAt: new Date().toISOString() };
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

router.get('/demo-cheat-sheet/access', (_req, res) => {
  res.json(readStore());
});

router.post('/demo-cheat-sheet/access', (req, res) => {
  const requester = String(req.body?.requesterInitials || '').toUpperCase();
  if (requester !== OWNER) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const initials = String(req.body?.initials || '').toUpperCase().trim();
  const action = String(req.body?.action || '').toLowerCase();
  if (!/^[A-Z]{1,4}$/.test(initials)) {
    return res.status(400).json({ error: 'invalid initials' });
  }
  if (action !== 'grant' && action !== 'revoke') {
    return res.status(400).json({ error: 'invalid action' });
  }
  if (action === 'revoke' && initials === OWNER) {
    return res.status(400).json({ error: 'cannot revoke owner' });
  }

  const current = readStore().allowed;
  let next;
  if (action === 'grant') {
    next = Array.from(new Set([...current, initials]));
  } else {
    next = current.filter((v) => v !== initials);
  }
  const result = writeStore(next);
  res.json(result);
});

// ── Overrides store (per-presenter) ──────────────────────────────────────
function ensureOverridesFile() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
  if (!fs.existsSync(OVERRIDES_PATH)) {
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
}

function readOverridesFile() {
  ensureOverridesFile();
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverridesFile(obj) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function normalisePresenter(value) {
  return String(value || '').toUpperCase().trim();
}

function isValidOverridesShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.schema !== 1) return false;
  if (!obj.sections || typeof obj.sections !== 'object') return false;
  for (const v of Object.values(obj.sections)) {
    if (!v || typeof v !== 'object') return false;
  }
  return true;
}

router.get('/demo-cheat-sheet/overrides', (req, res) => {
  const presenter = normalisePresenter(req.query?.presenter);
  if (!/^[A-Z]{1,4}$/.test(presenter)) {
    return res.status(400).json({ error: 'invalid presenter' });
  }
  const all = readOverridesFile();
  const entry = all[presenter];
  if (!entry) {
    return res.json({ schema: 1, sections: {}, updatedAt: null });
  }
  res.json({
    schema: 1,
    sections: entry.sections || {},
    updatedAt: entry.updatedAt || null,
  });
});

router.put('/demo-cheat-sheet/overrides', (req, res) => {
  const requester = normalisePresenter(req.body?.requesterInitials);
  const presenter = normalisePresenter(req.body?.presenter);
  if (requester !== OWNER) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!/^[A-Z]{1,4}$/.test(presenter)) {
    return res.status(400).json({ error: 'invalid presenter' });
  }
  const overrides = req.body?.overrides;
  if (!isValidOverridesShape(overrides)) {
    return res.status(400).json({ error: 'invalid overrides shape' });
  }
  const all = readOverridesFile();
  const updatedAt = new Date().toISOString();
  all[presenter] = { schema: 1, sections: overrides.sections, updatedAt };
  try {
    writeOverridesFile(all);
  } catch (err) {
    return res.status(500).json({ error: 'write failed' });
  }
  res.json({ schema: 1, sections: overrides.sections, updatedAt });
});

module.exports = router;
