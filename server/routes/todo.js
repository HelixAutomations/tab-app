/**
 * /api/todo — thin REST wrapper over server/utils/hubTodoLog.js.
 *
 * HOME_TODO_SINGLE_PICKUP_SURFACE — Phase B3b.
 *
 * Endpoints
 * ─────────
 *   POST   /api/todo/create
 *   POST   /api/todo/reconcile
 *   GET    /api/todo?owner=XX[&includeCompleted=1]
 *
 * Home-journey cache invalidation
 * ───────────────────────────────
 * Mutations blow away `home-journey:*` so the next Home hydrate picks up
 * the new card. The cache helper (`deleteCachePattern`) is best-effort;
 * if it fails we still return success for the mutation itself.
 *
 * Failure model: the underlying helpers never throw, so we always return
 * a well-formed JSON response and let the client surface transient
 * failures (empty list ≠ error).
 */

const express = require('express');
const {
  createCard,
  reconcileCard,
  fetchForOwner,
  fetchAll,
  KNOWN_KINDS,
} = require('../utils/hubTodoLog');
const { deleteCachePattern } = require('../utils/redisClient');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

function isDevOwner(req) {
  const initials = String(
    req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || ''
  ).toUpperCase().trim();
  const email = String(
    req.user?.email || req.query?.email || req.headers['x-user-email'] || ''
  ).toLowerCase().trim();
  return initials === 'LZ' || email === 'lz@helix-law.com';
}

async function invalidateHomeJourneyCache() {
  try {
    await deleteCachePattern('home-journey:*');
  } catch (err) {
    trackException(err, { phase: 'todo.invalidateHomeJourneyCache' });
  }
}

function sanitiseInitials(value) {
  if (!value) return null;
  const s = String(value).trim().toUpperCase();
  if (!s || s.length > 16) return null;
  return s;
}

router.post('/create', async (req, res) => {
  try {
    const body = req.body || {};
    const ownerInitials = sanitiseInitials(body.ownerInitials);
    const kind = body.kind ? String(body.kind).trim() : null;

    if (!kind || !ownerInitials) {
      return res.status(400).json({
        ok: false,
        error: 'kind and ownerInitials are required',
      });
    }
    if (!KNOWN_KINDS.has(kind)) {
      // Not a hard reject — log + accept. Keeps the endpoint forward-compatible
      // with downstream briefs that introduce new kinds.
      trackEvent('Todo.Create.UnknownKind', { kind, ownerInitials });
    }

    const { id, deduplicated } = await createCard({
      kind,
      ownerInitials,
      matterRef: body.matterRef ? String(body.matterRef).trim() : null,
      docType: body.docType ? String(body.docType).trim() : null,
      stage: body.stage ? String(body.stage).trim() : null,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : null,
      summary: body.summary ? String(body.summary).trim().slice(0, 400) : null,
      lastEvent: body.lastEvent ? String(body.lastEvent).trim().slice(0, 200) : null,
    });

    if (id) {
      // Fire and forget.
      invalidateHomeJourneyCache();
    }

    return res.json({ ok: true, id, deduplicated });
  } catch (err) {
    trackException(err, { phase: 'POST /api/todo/create' });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.post('/reconcile', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id ? String(body.id).trim() : null;
    const kind = body.kind ? String(body.kind).trim() : null;
    const ownerInitials = sanitiseInitials(body.ownerInitials);
    const matterRef = body.matterRef ? String(body.matterRef).trim() : null;
    const completedVia = body.completedVia ? String(body.completedVia).trim() : null;

    if (!completedVia) {
      return res.status(400).json({ ok: false, error: 'completedVia is required' });
    }
    if (!id && !(kind && ownerInitials)) {
      return res.status(400).json({
        ok: false,
        error: 'provide id OR (kind + ownerInitials)',
      });
    }

    const result = await reconcileCard({
      id,
      kind,
      ownerInitials,
      matterRef,
      completedVia,
      lastEvent: body.lastEvent ? String(body.lastEvent).trim().slice(0, 200) : null,
    });

    if (result.id) {
      invalidateHomeJourneyCache();
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    trackException(err, { phase: 'POST /api/todo/reconcile' });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = String(req.query.scope || '').toLowerCase();
    const includeCompleted =
      String(req.query.includeCompleted || '').toLowerCase() === '1' ||
      String(req.query.includeCompleted || '').toLowerCase() === 'true';

    if (scope === 'all') {
      if (!isDevOwner(req)) {
        trackEvent('Todo.Registry.AllScopeForbidden', {
          initials: String(req.headers['x-user-initials'] || req.query.initials || '').toUpperCase(),
        });
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const cards = await fetchAll({ includeCompleted });
      trackEvent('Todo.Registry.AllScopeRead', {
        rowCount: String(cards.length),
        includeCompleted: String(includeCompleted),
      });
      return res.json({ ok: true, scope: 'all', cards });
    }

    const ownerInitials = sanitiseInitials(req.query.owner);
    if (!ownerInitials) {
      return res.status(400).json({ ok: false, error: 'owner is required' });
    }

    const cards = await fetchForOwner(ownerInitials, { includeCompleted });
    return res.json({ ok: true, cards });
  } catch (err) {
    trackException(err, { phase: 'GET /api/todo' });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
