// server/routes/operator-actions.js
//
// HTTP surface for the in-app Operator Actions registry (B1, Phase A).
//
//   GET  /api/operator-actions               → catalog visible to caller
//   POST /api/operator-actions/:id/run       → run one action (with dry-run flag)
//   GET  /api/operator-actions/runs?limit=&actionId=
//
// Tier-gated via server/utils/userTier.js + the action's allowedTiers.

const express = require('express');
const sql = require('mssql');
const { trackEvent, trackException } = require('../utils/appInsights');
const { getRequestUser, getUserTier } = require('../utils/userTier');
const {
  callerCanRun,
  getAction,
  listActions,
  publicShape,
  tierAtLeast,
} = require('../operatorActions/registry');
const { runAction, getInstructionsPool, getCachedArtefact } = require('../operatorActions/telemetry');
const {
  attachRunArtefact,
  listAttachmentsForRun,
  listAttachmentsForAction,
} = require('../operatorActions/attach');

// Eagerly require each action so it self-registers via registerAction().
require('../operatorActions/person-lookup');
require('../operatorActions/passcode-lookup');
require('../operatorActions/enquiry-lookup');
require('../operatorActions/deal-lookup');
require('../operatorActions/instruction-lookup');
require('../operatorActions/dataops-recent');
require('../operatorActions/prospect-lookup');
require('../operatorActions/pipeline-lookup');
require('../operatorActions/ccl-lookup');
require('../operatorActions/tiller-verify');
require('../operatorActions/validate-instructions');
require('../operatorActions/matter-oneoff-replay');

const router = express.Router();

function requestor(req) {
  const user = getRequestUser(req);
  return {
    initials: user.initials || null,
    email: user.email || null,
    name: user.fullName || null,
    tier: getUserTier(req),
  };
}

router.get('/', (req, res) => {
  const me = requestor(req);
  const visible = listActions()
    .filter((action) => callerCanRun(action, me.tier))
    .map(publicShape);
  res.json({ ok: true, tier: me.tier, actions: visible });
});

router.post('/:id/run', express.json({ limit: '256kb' }), async (req, res) => {
  const id = String(req.params.id || '').trim();
  const action = getAction(id);
  if (!action) {
    return res.status(404).json({ error: 'unknown-action', actionId: id });
  }
  const me = requestor(req);
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const dryRun = Boolean(body.dryRun);
  const rawParams = (body.params && typeof body.params === 'object') ? body.params : {};

  try {
    const result = await runAction({
      action,
      rawParams,
      dryRun,
      requestor: me,
    });
    return res.status(result.status).json(result.response);
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'route-run', actionId: id });
    return res.status(500).json({ error: 'run-threw', message: err && err.message ? err.message : String(err) });
  }
});

router.get('/runs', async (req, res) => {
  const me = requestor(req);
  // Phase C.5: admin tier and above can see run history (filtered to their own).
  // Wider tiers (regular users) land in Phase D.
  if (!tierAtLeast(me.tier, 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1), 200);
  const actionId = String(req.query.actionId || '').trim() || null;

  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'runs-pool' });
    return res.status(503).json({ error: 'audit-unavailable' });
  }

  try {
    const reqDb = pool.request().input('limit', sql.Int, limit);
    let where = '';
    if (actionId) {
      where = 'WHERE action_id = @actionId';
      reqDb.input('actionId', sql.NVarChar(100), actionId);
    }
    const result = await reqDb.query(`
      SELECT TOP (@limit)
        id, action_id, requestor_initials, requestor_email, tier,
        params_json, dry_run, started_at, finished_at, duration_ms,
        status, summary, artefact_kind, artefact_size_bytes, error
      FROM dbo.operator_action_runs
      ${where}
      ORDER BY started_at DESC
    `);

    const runs = result.recordset.map((row) => ({
      id: row.id,
      actionId: row.action_id,
      requestor: {
        initials: row.requestor_initials,
        email: row.requestor_email,
      },
      tier: row.tier,
      params: row.params_json ? safeJson(row.params_json) : null,
      dryRun: Boolean(row.dry_run),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      status: row.status,
      summary: row.summary,
      artefact: row.artefact_kind ? { kind: row.artefact_kind, sizeBytes: row.artefact_size_bytes } : null,
      error: row.error,
    }));

    trackEvent('OperatorActions.Runs.Listed', {
      requestor: me.initials || me.email || 'unknown',
      actionId: actionId || 'all',
      count: runs.length,
    });

    return res.json({ ok: true, runs });
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'runs-query' });
    return res.status(500).json({ error: 'runs-query-failed' });
  }
});

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// --- Attach (Phase B) ----------------------------------------------------

router.post('/runs/:runId/attach', express.json({ limit: '256kb' }), async (req, res) => {
  const runId = String(req.params.runId || '').trim();
  if (!runId) return res.status(400).json({ error: 'missing-runId' });
  const me = requestor(req);
  if (!tierAtLeast(me.tier, 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const target = String(body.target || '').trim();
  if (!target) return res.status(400).json({ error: 'missing-target' });

  try {
    const result = await attachRunArtefact({
      runId,
      target,
      body,
      requestor: me,
      getArtefactForRun: async (run) => getCachedArtefact(run.id),
    });
    return res.status(result.status).json(result.response);
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'route-attach', runId, target });
    return res.status(500).json({ error: 'attach-threw', message: err && err.message ? err.message : String(err) });
  }
});

router.get('/runs/:runId/attachments', async (req, res) => {
  const me = requestor(req);
  if (!tierAtLeast(me.tier, 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const runId = String(req.params.runId || '').trim();
  if (!runId) return res.status(400).json({ error: 'missing-runId' });
  try {
    const rows = await listAttachmentsForRun(runId);
    return res.json({ ok: true, attachments: rows });
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'attachments-by-run', runId });
    return res.status(500).json({ error: 'attachments-query-failed' });
  }
});

router.get('/attachments', async (req, res) => {
  const me = requestor(req);
  if (!tierAtLeast(me.tier, 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const actionId = String(req.query.actionId || '').trim();
  if (!actionId) return res.status(400).json({ error: 'missing-actionId' });
  const limit = parseInt(String(req.query.limit || '25'), 10) || 25;
  try {
    const rows = await listAttachmentsForAction(actionId, limit);
    return res.json({ ok: true, attachments: rows });
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'attachments-by-action', actionId });
    return res.status(500).json({ error: 'attachments-query-failed' });
  }
});

module.exports = router;
