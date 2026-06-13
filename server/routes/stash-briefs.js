// server/routes/stash-briefs.js
// Stashed brief API for System / Projects and the Activity tab briefs panel.
// Summary cards are available to System/admin users. Full bodies and mutation
// routes remain dev-owner only.
//
// Routes:
//   GET    /api/stash-briefs                  → list with metadata (dev-owner)
//   GET    /api/stash-briefs/cards            → safe summary cards (System/admin)
//   GET    /api/stash-briefs/:id              → full body
//   POST   /api/stash-briefs/:id/reverify     → bump verified to today
//   POST   /api/stash-briefs/:id/close        → mark shipped + archive
//   PATCH  /api/stash-briefs/:id              → write back body (metadata locked)
//   POST   /api/stash-briefs                  → scaffold new from template
//
// Auth: dev-owner only (LZ). Mirrors the gate in src/app/admin.ts.

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  NOTES_DIR,
  ARCHIVE_DIR,
  TEMPLATE_FILE,
  loadAllBriefs,
  extractMetaBlock,
  parseMetaBlock,
  daysSince,
  statusFor,
  titleFromContent,
  regenerateIndex,
} = require('../utils/stashMeta');
const { trackEvent, trackException } = require('../utils/appInsights');
const { isAdmin: isAdminRequest } = require('../utils/userTier');

const router = express.Router();

function isDevOwner(req) {
  const initials = String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
  const email = String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  return initials === 'LZ' || email === 'lz@helix-law.com';
}

function gate(req, res, next) {
  if (!isDevOwner(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function cardsGate(req, res, next) {
  if (!isDevOwner(req) && !isAdminRequest(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function actor(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || req.user?.email || req.query?.email || 'unknown').trim() || 'unknown';
}

function summarize(brief) {
  const meta = brief.meta || {};
  return {
    id: meta.id || null,
    title: titleFromContent(brief.rawContent, brief.filename),
    file: brief.filename,
    status: statusFor(meta),
    verified: meta.verified || null,
    ageDays: daysSince(meta.verified),
    branch: meta.branch || null,
    touches: meta.touches || { client: [], server: [], submodules: [] },
    depends_on: meta.depends_on || [],
    coordinates_with: meta.coordinates_with || [],
    conflicts_with: meta.conflicts_with || [],
    shipped: meta.shipped === true || meta.shipped === 'true',
    shipped_on: meta.shipped_on || null,
    hasMetaBlock: brief.hasMetaBlock,
  };
}

function summarizeCard(brief) {
  const summary = summarize(brief);
  const touches = summary.touches || {};
  const touchCount = ['client', 'server', 'submodules'].reduce((total, key) => {
    const value = touches[key];
    return total + (Array.isArray(value) ? value.length : 0);
  }, 0);
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status,
    verified: summary.verified,
    ageDays: summary.ageDays,
    branch: summary.branch,
    shipped: summary.shipped,
    touchCount,
    dependencyCount: Array.isArray(summary.depends_on) ? summary.depends_on.length : 0,
    coordinationCount: Array.isArray(summary.coordinates_with) ? summary.coordinates_with.length : 0,
    conflictCount: Array.isArray(summary.conflicts_with) ? summary.conflicts_with.length : 0,
  };
}

function findById(id) {
  const briefs = loadAllBriefs();
  return briefs.find((b) => b.meta && b.meta.id === id) || null;
}

// ── GET /api/stash-briefs ─────────────────────────────────────────────
router.get('/stash-briefs', gate, (req, res) => {
  try {
    const briefs = loadAllBriefs().filter((b) => b.hasMetaBlock);
    const summary = briefs.map(summarize);
    res.json({ items: summary, total: summary.length, generatedAt: Date.now() });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.List' });
    res.status(500).json({ error: 'failed to load briefs', detail: err.message });
  }
});

router.get('/stash-briefs/cards', cardsGate, (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = actor(req);
  try {
    const briefs = loadAllBriefs().filter((b) => b.hasMetaBlock);
    const cards = briefs.map(summarizeCard);
    trackEvent('StashBriefs.Cards.Completed', {
      operation: 'cards',
      triggeredBy,
      rowCount: cards.length,
      durationMs: Date.now() - startedAt,
    });
    res.json({ items: cards, total: cards.length, generatedAt: Date.now(), canSeeFull: isDevOwner(req) });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Cards', triggeredBy });
    trackEvent('StashBriefs.Cards.Failed', { operation: 'cards', triggeredBy, error: err.message });
    res.status(500).json({ error: 'failed to load stash cards', detail: err.message });
  }
});

// ── GET /api/stash-briefs/archived ────────────────────────────────────
// Titles + minimal metadata only — body never returned. The Activity tab
// "Briefs" lens renders shipped briefs in a collapsed footer purely for
// completeness; we don't surface the markdown because the briefs contain
// raw prompt language that should stay private.
router.get('/stash-briefs/archived', gate, (req, res) => {
  try {
    const archiveDir = path.join(process.cwd(), ARCHIVE_DIR);
    if (!fs.existsSync(archiveDir)) {
      return res.json({ items: [], total: 0, generatedAt: Date.now() });
    }
    const files = fs.readdirSync(archiveDir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => f !== 'INDEX.md' && !f.startsWith('_'));
    const items = files.map((filename) => {
      const full = path.join(archiveDir, filename);
      const content = fs.readFileSync(full, 'utf8');
      const yaml = extractMetaBlock(content);
      let meta = null;
      if (yaml) {
        try { meta = parseMetaBlock(yaml); } catch { /* ignore unparseable */ }
      }
      // Title only — no rawContent passes through to the response.
      return {
        id: meta?.id || null,
        title: titleFromContent(content, filename),
        file: path.relative(process.cwd(), full).replace(/\\/g, '/'),
        shipped_on: meta?.shipped_on || null,
      };
    });
    // Sort newest-shipped first; missing dates last.
    items.sort((a, b) => {
      if (!a.shipped_on) return 1;
      if (!b.shipped_on) return -1;
      return a.shipped_on < b.shipped_on ? 1 : -1;
    });
    res.json({ items, total: items.length, generatedAt: Date.now() });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.ListArchived' });
    res.status(500).json({ error: 'failed to load archived briefs', detail: err.message });
  }
});

// ── GET /api/stash-briefs/:id ─────────────────────────────────────────
router.get('/stash-briefs/:id', gate, (req, res) => {
  try {
    const brief = findById(req.params.id);
    if (!brief) return res.status(404).json({ error: 'brief not found' });
    res.json({
      ...summarize(brief),
      content: brief.rawContent,
    });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Get', id: req.params.id });
    res.status(500).json({ error: 'failed to read brief', detail: err.message });
  }
});

// ── POST /api/stash-briefs/:id/reverify ───────────────────────────────
router.post('/stash-briefs/:id/reverify', gate, (req, res) => {
  try {
    const brief = findById(req.params.id);
    if (!brief) return res.status(404).json({ error: 'brief not found' });

    const today = new Date().toISOString().slice(0, 10);
    const updated = brief.rawContent.replace(
      /(```ya?ml[\s\S]*?\nverified:\s*)([^\n]+)/,
      (_m, p1) => `${p1}${today}`,
    );
    if (updated === brief.rawContent) {
      return res.status(400).json({ error: 'verified field not found in metadata block' });
    }
    fs.writeFileSync(brief.file, updated, 'utf8');
    regenerateIndex();
    trackEvent('StashBriefs.Reverified', { id: req.params.id, by: req.user?.initials || 'unknown' });
    res.json({ ok: true, id: req.params.id, verified: today });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Reverify', id: req.params.id });
    res.status(500).json({ error: 'reverify failed', detail: err.message });
  }
});

// ── POST /api/stash-briefs/:id/close ──────────────────────────────────
router.post('/stash-briefs/:id/close', gate, (req, res) => {
  try {
    const brief = findById(req.params.id);
    if (!brief) return res.status(404).json({ error: 'brief not found' });

    const today = new Date().toISOString().slice(0, 10);
    const updated = brief.rawContent.replace(
      /(```ya?ml[\s\S]*?id:\s*[^\n]+\n)/,
      (_m, p1) => `${p1}shipped: true\nshipped_on: ${today}\n`,
    );

    const archiveDir = path.join(process.cwd(), ARCHIVE_DIR);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

    const newPath = path.join(archiveDir, brief.filename);
    fs.writeFileSync(newPath, updated, 'utf8');
    fs.unlinkSync(path.join(process.cwd(), brief.file));

    // Closure ripple — find dependents
    const all = loadAllBriefs();
    const dependents = all.filter((b) => {
      if (!b.meta || b.meta.id === req.params.id) return false;
      const refs = [
        ...(b.meta.depends_on || []),
        ...(b.meta.coordinates_with || []),
        ...(b.meta.conflicts_with || []),
      ];
      return refs.includes(req.params.id);
    }).map((b) => ({
      id: b.meta.id,
      file: b.filename,
      role: (b.meta.depends_on || []).includes(req.params.id) ? 'depends_on'
        : (b.meta.conflicts_with || []).includes(req.params.id) ? 'conflicts_with'
        : 'coordinates_with',
    }));

    regenerateIndex();
    trackEvent('StashBriefs.Closed', { id: req.params.id, by: req.user?.initials || 'unknown', dependents: dependents.length });
    res.json({ ok: true, id: req.params.id, shipped_on: today, archivedTo: path.relative(process.cwd(), newPath).replace(/\\/g, '/'), dependents });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Close', id: req.params.id });
    res.status(500).json({ error: 'close failed', detail: err.message });
  }
});

// ── PATCH /api/stash-briefs/:id ───────────────────────────────────────
// Accepts { content } — the full markdown. The Stash metadata block must
// be byte-identical to the on-disk version (we lock metadata to the file).
router.patch('/stash-briefs/:id', express.json({ limit: '256kb' }), gate, (req, res) => {
  try {
    const brief = findById(req.params.id);
    if (!brief) return res.status(404).json({ error: 'brief not found' });

    const next = String(req.body?.content || '');
    if (!next.trim()) return res.status(400).json({ error: 'content is required' });

    const oldMeta = extractMetaBlock(brief.rawContent);
    const newMeta = extractMetaBlock(next);
    if (!newMeta) return res.status(400).json({ error: 'metadata block missing in submitted content' });
    if (oldMeta.trim() !== newMeta.trim()) {
      return res.status(409).json({
        error: 'metadata block changed',
        detail: 'Edit metadata directly in the file. UI edits cover body only.',
      });
    }

    fs.writeFileSync(path.join(process.cwd(), brief.file), next, 'utf8');
    regenerateIndex();
    trackEvent('StashBriefs.Edited', { id: req.params.id, by: req.user?.initials || 'unknown', bytes: next.length });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Patch', id: req.params.id });
    res.status(500).json({ error: 'patch failed', detail: err.message });
  }
});

// ── POST /api/stash-briefs ────────────────────────────────────────────
// Scaffold a new brief from the template. Body: { title }.
router.post('/stash-briefs', express.json({ limit: '8kb' }), gate, (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });

    const slug = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(process.cwd(), NOTES_DIR, `${slug}.md`);

    if (fs.existsSync(file)) return res.status(409).json({ error: 'file already exists', file: path.relative(process.cwd(), file) });

    const tmplPath = path.join(process.cwd(), TEMPLATE_FILE);
    if (!fs.existsSync(tmplPath)) return res.status(500).json({ error: 'template not found', path: TEMPLATE_FILE });

    let body = fs.readFileSync(tmplPath, 'utf8');
    body = body.replace(/<TITLE>/g, title);
    body = body.replace(/<DATE>/g, today);
    body = body.replace(/<ID>/g, id);
    body = body.replace(/<BRANCH>/g, 'unknown');

    fs.writeFileSync(file, body, 'utf8');
    regenerateIndex();
    trackEvent('StashBriefs.Created', { id, by: req.user?.initials || 'unknown' });
    res.status(201).json({ ok: true, id, file: path.relative(process.cwd(), file).replace(/\\/g, '/') });
  } catch (err) {
    trackException(err, { operation: 'StashBriefs.Create' });
    res.status(500).json({ error: 'create failed', detail: err.message });
  }
});

module.exports = router;
