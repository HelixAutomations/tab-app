// server/routes/access.js
//
// Access Controls — Phase Access.2 HTTP surface.
//
// LZ-only endpoints to read live grants and (later) mutate them:
//   GET    /api/access/grants                List all live grants
//   GET    /api/access/effective             Caller's effective capabilities
//   GET    /api/access/effective?subject=…   (LZ only) any subject
//   GET    /api/access/capabilities          Capability registry (vocabulary)
//   GET    /api/access/cache-status          Resolver cache health
//   POST   /api/access/grants                Insert override (LZ only)
//   DELETE /api/access/grants/:id            Revoke grant (LZ only)
//
// Mutations write an AccessGrantHistory row and invalidate the resolver
// cache so the change is visible to all subsequent requests.

const express = require('express');
const sql = require('mssql');
const { trackEvent, trackException } = require('../utils/appInsights');
const { getRequestUser, getUserTier } = require('../utils/userTier');
const access = require('../utils/access');

const router = express.Router();

function callerInfo(req) {
  const user = getRequestUser(req);
  return {
    initials: user.initials || null,
    email: user.email || null,
    tier: getUserTier(req),
  };
}

function isLzOnly(req) {
  const me = callerInfo(req);
  return me.tier === 'dev';
}

async function getInstructionsPool() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return sql.connect(connStr);
}

// ── GET /api/access/capabilities ───────────────────────────────────────
// Open to any authed user — describes the vocabulary of capabilities the
// app gates on. Used by the matrix UI to render columns.
router.get('/capabilities', (req, res) => {
  // Mirror of src/app/capabilities.ts (server can't import .ts directly).
  // Order matters: tier first, then features, then actions.
  const capabilities = [
    { key: 'tier:dev', kind: 'tier', label: 'Dev tier', description: 'God mode. Firm-wide data scope, all dev preview features.' },
    { key: 'tier:admin', kind: 'tier', label: 'Admin tier', description: 'Trusted internal feature tier. Personal data scope.' },
    { key: 'feature:reports', kind: 'feature', label: 'Reports tab', description: 'Access to the Reports tab. LA is admin but excluded.' },
    { key: 'feature:firm-wide-home', kind: 'feature', label: 'Firm-wide Home data', description: 'Home data-scope exception — see firm-wide datasets on Home.' },
    { key: 'feature:hub-controls', kind: 'feature', label: 'Private hub controls', description: 'DebugLatencyOverlay, CCL diff drawer, cache monitor, dev preview locks.' },
    { key: 'feature:activity-tab', kind: 'feature', label: 'Activity (System) tab', description: 'Operations dashboard, ops pulse, Operator Actions surface.' },
    { key: 'feature:ccl', kind: 'feature', label: 'CCL editing', description: 'CCL matter to-do items / lifecycle steps. Open to all.' },
    { key: 'action:matter-oneoff-replay', kind: 'action', label: 'Matter one-off replay (write)', description: 'Replays the matter-opening pipeline against prod for one InstructionRef.' },
  ];
  res.json({ ok: true, capabilities });
});

// ── GET /api/access/effective ──────────────────────────────────────────
// Returns the caller's effective capability map. LZ may pass ?subject=user:AC
// to inspect another subject. Other tiers can only read their own.
router.get('/effective', async (req, res) => {
  const me = callerInfo(req);
  const overrideSubject = String(req.query.subject || '').trim() || null;

  let user = { initials: me.initials, email: me.email };
  if (overrideSubject) {
    if (me.tier !== 'dev') {
      return res.status(403).json({ error: 'forbidden', reason: 'subject-override-requires-dev' });
    }
    // Parse 'user:LZ' style subject for this lookup.
    const m = overrideSubject.match(/^user:([A-Za-z0-9]+)$/);
    if (m) {
      user = { initials: m[1].toUpperCase() };
    } else {
      return res.status(400).json({ error: 'invalid-subject', subject: overrideSubject });
    }
  }

  try {
    const capabilities = await access.getEffectiveCapabilities(user);
    return res.json({
      ok: true,
      subject: overrideSubject || `user:${me.initials || ''}`,
      capabilities,
      cache: access.getCacheStatus(),
    });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'effective' });
    return res.status(500).json({ error: 'effective-failed', message: err.message });
  }
});

// ── GET /api/access/cache-status ───────────────────────────────────────
router.get('/cache-status', (req, res) => {
  res.json({ ok: true, cache: access.getCacheStatus() });
});

// ── GET /api/access/grants ─────────────────────────────────────────────
// LZ-only. Returns every live grant (raw rows). The matrix UI uses this
// plus /effective to render the full table.
router.get('/grants', async (req, res) => {
  if (!isLzOnly(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'grants-pool' });
    return res.status(503).json({ error: 'access-db-unavailable' });
  }
  try {
    const result = await pool.request().query(`
      SELECT GrantId, Subject, Capability, ResourceScope, Effect, Source,
             Priority, GrantedBy, GrantedAt, ExpiresAt, Reason
      FROM AccessGrants
      WHERE RevokedAt IS NULL
      ORDER BY Capability, Subject
    `);
    return res.json({ ok: true, grants: result.recordset });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'grants-query' });
    return res.status(500).json({ error: 'grants-query-failed' });
  }
});

// ── POST /api/access/grants ────────────────────────────────────────────
// LZ-only. Body:
//   { subject, capability, effect, resourceScope?, expiresAt?, reason? }
// Source is forced to 'override' (defaults are seed-only). Priority 200
// (allow) or 300 (deny). History row written; cache invalidated.
router.post('/grants', express.json({ limit: '32kb' }), async (req, res) => {
  if (!isLzOnly(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const me = callerInfo(req);
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const subject = String(body.subject || '').trim();
  const capability = String(body.capability || '').trim();
  const effect = String(body.effect || 'allow').trim();
  const resourceScope = body.resourceScope ? String(body.resourceScope).trim() : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const reason = body.reason ? String(body.reason).slice(0, 500) : null;

  if (!subject || !capability) {
    return res.status(400).json({ error: 'missing-fields', need: ['subject', 'capability'] });
  }
  if (!/^(user|group|role):[\w*-]+$/.test(subject)) {
    return res.status(400).json({ error: 'invalid-subject', subject });
  }
  if (!/^(tier|feature|action):[\w-]+$/.test(capability)) {
    return res.status(400).json({ error: 'invalid-capability', capability });
  }
  if (effect !== 'allow' && effect !== 'deny') {
    return res.status(400).json({ error: 'invalid-effect', effect });
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: 'invalid-expiresAt' });
  }
  const priority = effect === 'deny' ? 300 : 200;

  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'grant-pool' });
    return res.status(503).json({ error: 'access-db-unavailable' });
  }

  try {
    const insert = await pool.request()
      .input('subject', sql.NVarChar(50), subject)
      .input('capability', sql.NVarChar(100), capability)
      .input('resourceScope', sql.NVarChar(200), resourceScope)
      .input('effect', sql.NVarChar(10), effect)
      .input('priority', sql.Int, priority)
      .input('grantedBy', sql.NVarChar(50), me.initials || me.email || 'unknown')
      .input('expiresAt', sql.DateTime2, expiresAt)
      .input('reason', sql.NVarChar(500), reason)
      .query(`
        INSERT INTO AccessGrants
          (Subject, Capability, ResourceScope, Effect, Source, Priority, GrantedBy, ExpiresAt, Reason)
        OUTPUT INSERTED.GrantId, INSERTED.GrantedAt
        VALUES
          (@subject, @capability, @resourceScope, @effect, 'override', @priority, @grantedBy, @expiresAt, @reason)
      `);
    const row = insert.recordset[0];
    const grantId = row.GrantId;

    await pool.request()
      .input('grantId', sql.UniqueIdentifier, grantId)
      .input('actor', sql.NVarChar(10), me.initials || 'LZ')
      .input('payload', sql.NVarChar(sql.MAX), JSON.stringify({ subject, capability, effect, resourceScope, expiresAt, reason }))
      .query(`
        INSERT INTO AccessGrantHistory (GrantId, Action, ActorInitials, PayloadJson)
        VALUES (@grantId, 'created', @actor, @payload)
      `);

    access.invalidate();
    trackEvent('Access.Grant.Created', {
      grantId,
      subject,
      capability,
      effect,
      actor: me.initials || 'unknown',
    });

    return res.status(201).json({ ok: true, grantId, grantedAt: row.GrantedAt });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'grant-insert' });
    return res.status(500).json({ error: 'grant-insert-failed', message: err.message });
  }
});

// ── DELETE /api/access/grants/:id ─────────────────────────────────────
// LZ-only. Soft-revoke (sets RevokedAt). History row written; cache
// invalidated. Default-source rows can be revoked too — but the seed
// migration will not re-insert them on next run because of the IF NOT
// EXISTS guard, so revoking a default is permanent until manually
// re-seeded. That's intentional: revoking a default is a deliberate act.
router.delete('/grants/:id', async (req, res) => {
  if (!isLzOnly(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const me = callerInfo(req);
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing-id' });

  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'revoke-pool' });
    return res.status(503).json({ error: 'access-db-unavailable' });
  }

  try {
    const update = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('actor', sql.NVarChar(50), me.initials || me.email || 'unknown')
      .query(`
        UPDATE AccessGrants
        SET RevokedAt = SYSUTCDATETIME(), RevokedBy = @actor
        OUTPUT INSERTED.Subject, INSERTED.Capability, INSERTED.Source
        WHERE GrantId = @id AND RevokedAt IS NULL
      `);
    if (update.recordset.length === 0) {
      return res.status(404).json({ error: 'grant-not-found-or-already-revoked' });
    }
    const revoked = update.recordset[0];

    await pool.request()
      .input('grantId', sql.UniqueIdentifier, id)
      .input('actor', sql.NVarChar(10), me.initials || 'LZ')
      .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(revoked))
      .query(`
        INSERT INTO AccessGrantHistory (GrantId, Action, ActorInitials, PayloadJson)
        VALUES (@grantId, 'revoked', @actor, @payload)
      `);

    access.invalidate();
    trackEvent('Access.Grant.Revoked', {
      grantId: id,
      subject: revoked.Subject,
      capability: revoked.Capability,
      source: revoked.Source,
      actor: me.initials || 'unknown',
    });

    return res.json({ ok: true, grantId: id, revoked });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'revoke-update' });
    return res.status(500).json({ error: 'revoke-failed', message: err.message });
  }
});

// ── GET /api/access/history ────────────────────────────────────────────
// LZ-only audit log. Joins AccessGrantHistory with AccessGrants to return
// the most recent grant lifecycle events.
//   ?limit=N  (default 100, max 500)
//   ?subject= filter by subject
//   ?capability= filter by capability
router.get('/history', async (req, res) => {
  if (!isLzOnly(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const limitRaw = parseInt(String(req.query.limit || '100'), 10);
  const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
  const subject = req.query.subject ? String(req.query.subject).trim() : null;
  const capability = req.query.capability ? String(req.query.capability).trim() : null;

  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'history-pool' });
    return res.status(503).json({ error: 'access-db-unavailable' });
  }
  try {
    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .input('subject', sql.NVarChar(50), subject)
      .input('capability', sql.NVarChar(100), capability)
      .query(`
        SELECT TOP (@limit)
          h.HistoryId, h.GrantId, h.Action, h.ActorInitials, h.At, h.PayloadJson,
          g.Subject, g.Capability, g.Effect, g.Source, g.ExpiresAt, g.RevokedAt
        FROM AccessGrantHistory h
        LEFT JOIN AccessGrants g ON g.GrantId = h.GrantId
        WHERE (@subject IS NULL OR g.Subject = @subject)
          AND (@capability IS NULL OR g.Capability = @capability)
        ORDER BY h.At DESC
      `);
    return res.json({ ok: true, history: result.recordset });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'history-query' });
    return res.status(500).json({ error: 'history-query-failed' });
  }
});

// ── POST /api/access/sweep-now ─────────────────────────────────────────
// LZ-only manual trigger of the expiry sweep. Useful for verifying
// behaviour without waiting for the 6h interval.
router.post('/sweep-now', async (req, res) => {
  if (!isLzOnly(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const result = await access.sweepExpired({ triggeredBy: 'manual' });
    return res.json({ ok: true, ...result });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'sweep-manual' });
    return res.status(500).json({ error: 'sweep-failed', message: err.message });
  }
});

module.exports = router;
