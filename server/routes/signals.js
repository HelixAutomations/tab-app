// server/routes/signals.js
// Unified intake ledger for the Suggestions Inbox in My Helix.
// See docs/notes/AGENT_SUGGESTIONS_INBOX_IN_MY_HELIX.md.

const express = require('express');
const { recordSignal, listSignals, updateSignalStatus, KNOWN_SOURCES } = require('../utils/signalsLog');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

function readInitials(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
}
function readEmail(req) {
  return String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
}

function isDevGroup(req) {
  const initials = readInitials(req);
  const email = readEmail(req);
  if (initials === 'LZ' || initials === 'AC') return true;
  if (email === 'lz@helix-law.com' || email === 'ac@helix-law.com') return true;
  return false;
}

function requireDevGroup(req, res, next) {
  if (!isDevGroup(req)) return res.status(403).json({ error: 'forbidden' });
  next();
}

/**
 * POST /api/signals
 * Single-item or batch ingestion. Used by the agent footer capture tool
 * and (later) by mirror calls from form routes.
 *
 * Body:
 *   { source, title, detail?, fileRef?, severity?, sessionId?, sourceRecordId?, asanaTaskGid?, metadata? }
 *   OR
 *   { items: [ { source, title, ... }, ... ] }
 */
router.post('/', requireDevGroup, async (req, res) => {
  try {
    const submittedBy = readInitials(req) || readEmail(req) || 'unknown';
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [body];

    const recorded = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const result = await recordSignal({
        source: item.source,
        title: item.title,
        detail: item.detail,
        fileRef: item.fileRef ?? item.file ?? item.file_ref,
        severity: item.severity,
        sessionId: item.sessionId ?? item.session_id,
        sourceRecordId: item.sourceRecordId ?? item.source_record_id,
        asanaTaskGid: item.asanaTaskGid ?? item.asana_task_gid,
        metadata: item.metadata,
        submittedBy,
      });
      if (result.id) recorded.push(result.id);
    }

    trackEvent('Signals.IngestRequest', {
      count: String(items.length),
      recorded: String(recorded.length),
    });

    return res.status(recorded.length ? 201 : 200).json({
      ok: true,
      recorded: recorded.length,
      ids: recorded,
    });
  } catch (err) {
    trackException(err, { phase: 'signals.post' });
    return res.status(500).json({ ok: false, error: 'failed to record signal' });
  }
});

/**
 * GET /api/signals
 * Returns recent open signals for the Inbox UI.
 *
 * Query: status=open|dismissed|promoted|all (default open),
 *        source=tech_problem|... (default all),
 *        limit=1..200 (default 50).
 */
router.get('/', requireDevGroup, async (req, res) => {
  try {
    const status = (() => {
      const raw = String(req.query?.status || 'open').toLowerCase();
      if (raw === 'all') return null;
      return raw;
    })();
    const source = (() => {
      const raw = String(req.query?.source || '').toLowerCase().trim();
      if (!raw || raw === 'all') return null;
      if (!KNOWN_SOURCES.has(raw)) return null;
      return raw;
    })();
    const limit = Number(req.query?.limit) || 50;

    const items = await listSignals({ status, source, limit });
    return res.json({ items, count: items.length });
  } catch (err) {
    trackException(err, { phase: 'signals.get' });
    return res.status(500).json({ items: [], error: 'failed to list signals' });
  }
});

/**
 * PATCH /api/signals/:id
 * Update status (dismiss / promote / mark done).
 *
 * Body: { status: 'dismissed' | 'promoted' | 'done' | 'pinned' | 'open', promotedTo? }
 */
router.patch('/:id', requireDevGroup, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'missing id' });
    const status = String(req.body?.status || '').toLowerCase().trim();
    const allowed = new Set(['open', 'dismissed', 'promoted', 'done', 'pinned']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'invalid status' });
    const promotedTo = req.body?.promotedTo ? String(req.body.promotedTo).slice(0, 128) : null;
    const ok = await updateSignalStatus(id, status, { promotedTo });
    return res.status(ok ? 200 : 500).json({ ok });
  } catch (err) {
    trackException(err, { phase: 'signals.patch' });
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
