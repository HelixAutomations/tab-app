const express = require('express');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getRequestUser, isDevGroupOrHigher } = require('../utils/userTier');
const {
  CONFIRMATION_PHRASE,
  listRecentOpeningRequests,
  loadReplayDetail,
  runReplayFromConsole,
  saveReplayRepair,
  validateReplayRepair,
} = require('../utils/matterReplayConsole');

const router = express.Router();

function requireAccess(req, res) {
  if (isDevGroupOrHigher(req)) return true;
  res.status(403).json({ ok: false, error: 'forbidden', message: 'Matter replay is available to dev-owner users only.' });
  return false;
}

function readActor(req) {
  const user = getRequestUser(req);
  return user.initials || user.email || 'unknown';
}

function resolveBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
  const host = req.get('host');
  return host ? `${proto}://${host}` : undefined;
}

function identityFromRequest(req) {
  const user = getRequestUser(req);
  return {
    email: user.email || '',
    entraId: user.entraId || '',
  };
}

function sendError(res, error, fallbackCode) {
  const status = Number(error?.statusCode) || 500;
  return res.status(status).json({
    ok: false,
    error: error?.code || fallbackCode,
    message: error?.message || 'Matter replay request failed',
    details: error?.details || undefined,
  });
}

router.get('/requests', async (req, res) => {
  if (!requireAccess(req, res)) return;

  const actor = readActor(req);
  const startedMs = Date.now();
  const status = String(req.query.status || 'all');
  const limit = req.query.limit;
  const days = req.query.days || req.query.windowDays;
  trackEvent('MatterReplay.Console.List.Started', { operation: 'list', triggeredBy: actor, status });

  try {
    const payload = await listRecentOpeningRequests({ status, limit, days });
    const durationMs = Date.now() - startedMs;
    trackEvent('MatterReplay.Console.List.Completed', {
      operation: 'list',
      triggeredBy: actor,
      status: payload.status,
      durationMs,
      count: payload.requests.length,
    });
    trackMetric('MatterReplay.Console.List.Duration', durationMs, { status: payload.status });
    return res.json({ ok: true, ...payload, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'MatterReplay.Console.List', phase: 'route', triggeredBy: actor });
    trackEvent('MatterReplay.Console.List.Failed', { operation: 'list', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendError(res, error, 'matter_replay_list_failed');
  }
});

router.get('/requests/:instructionRef', async (req, res) => {
  if (!requireAccess(req, res)) return;

  const actor = readActor(req);
  const instructionRef = String(req.params.instructionRef || '').trim();
  const startedMs = Date.now();
  trackEvent('MatterReplay.Console.Detail.Started', { operation: 'detail', triggeredBy: actor, instructionRef });

  try {
    const detail = await loadReplayDetail(instructionRef);
    const durationMs = Date.now() - startedMs;
    trackEvent('MatterReplay.Console.Detail.Completed', { operation: 'detail', triggeredBy: actor, instructionRef: detail.instructionRef, durationMs, status: detail.status });
    trackMetric('MatterReplay.Console.Detail.Duration', durationMs, { status: detail.status });
    return res.json({ ok: true, detail, confirmationPhrase: CONFIRMATION_PHRASE });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'MatterReplay.Console.Detail', phase: 'route', triggeredBy: actor, instructionRef });
    trackEvent('MatterReplay.Console.Detail.Failed', { operation: 'detail', triggeredBy: actor, instructionRef, durationMs, error: error?.message || String(error) });
    return sendError(res, error, 'matter_replay_detail_failed');
  }
});

router.post('/validate', express.json({ limit: '96kb' }), async (req, res) => {
  if (!requireAccess(req, res)) return;

  const actor = readActor(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const instructionRef = String(body.instructionRef || '').trim();
  const startedMs = Date.now();
  trackEvent('MatterReplay.Console.Validate.Started', { operation: 'validate', triggeredBy: actor, instructionRef });

  try {
    const payload = await validateReplayRepair(instructionRef, body.repair || {});
    const durationMs = Date.now() - startedMs;
    trackEvent('MatterReplay.Console.Validate.Completed', { operation: 'validate', triggeredBy: actor, instructionRef: payload.instructionRef, durationMs, ok: String(payload.validation.ok) });
    trackMetric('MatterReplay.Console.Validate.Duration', durationMs, { ok: String(payload.validation.ok) });
    return res.json({ ok: true, ...payload });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'MatterReplay.Console.Validate', phase: 'route', triggeredBy: actor, instructionRef });
    trackEvent('MatterReplay.Console.Validate.Failed', { operation: 'validate', triggeredBy: actor, instructionRef, durationMs, error: error?.message || String(error) });
    return sendError(res, error, 'matter_replay_validate_failed');
  }
});

router.post('/repair', express.json({ limit: '128kb' }), async (req, res) => {
  if (!requireAccess(req, res)) return;

  const actor = readActor(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const instructionRef = String(body.instructionRef || '').trim();
  const startedMs = Date.now();
  trackEvent('MatterReplay.Console.Repair.Started', { operation: 'repair', triggeredBy: actor, instructionRef });

  try {
    const payload = await saveReplayRepair({
      instructionRef,
      repair: body.repair || {},
      matterRequestId: body.matterRequestId,
    });
    const durationMs = Date.now() - startedMs;
    trackEvent('MatterReplay.Console.Repair.Completed', {
      operation: 'repair',
      triggeredBy: actor,
      instructionRef: payload.instructionRef,
      durationMs,
      matterRows: String(payload.updated.matterRows),
      instructionRows: String(payload.updated.instructionRows),
    });
    trackMetric('MatterReplay.Console.Repair.Duration', durationMs, { ok: 'true' });
    return res.json({ ok: true, ...payload });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'MatterReplay.Console.Repair', phase: 'route', triggeredBy: actor, instructionRef });
    trackEvent('MatterReplay.Console.Repair.Failed', { operation: 'repair', triggeredBy: actor, instructionRef, durationMs, error: error?.message || String(error) });
    return sendError(res, error, 'matter_replay_repair_failed');
  }
});

router.post('/replay', express.json({ limit: '128kb' }), async (req, res) => {
  if (!requireAccess(req, res)) return;

  const actor = readActor(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const instructionRef = String(body.instructionRef || '').trim();
  const dryRun = body.dryRun !== false;
  const startedMs = Date.now();
  trackEvent('MatterReplay.Console.Replay.Started', { operation: 'replay', triggeredBy: actor, instructionRef, dryRun: String(dryRun) });

  try {
    const payload = await runReplayFromConsole({
      instructionRef,
      repair: body.repair || {},
      dryRun,
      matterRequestId: body.matterRequestId,
      confirmationPhrase: body.confirmationPhrase,
      baseUrl: resolveBaseUrl(req),
      identity: identityFromRequest(req),
    });
    const durationMs = Date.now() - startedMs;
    trackEvent('MatterReplay.Console.Replay.Completed', {
      operation: 'replay',
      triggeredBy: actor,
      instructionRef: payload.instructionRef,
      dryRun: String(payload.dryRun),
      durationMs,
      ok: String(payload.result.ok),
      exitCode: String(payload.result.exitCode),
    });
    trackMetric('MatterReplay.Console.Replay.Duration', durationMs, { dryRun: String(payload.dryRun), ok: String(payload.result.ok) });
    return res.json({ ok: payload.result.ok, ...payload });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'MatterReplay.Console.Replay', phase: 'route', triggeredBy: actor, instructionRef, dryRun: String(dryRun) });
    trackEvent('MatterReplay.Console.Replay.Failed', { operation: 'replay', triggeredBy: actor, instructionRef, dryRun: String(dryRun), durationMs, error: error?.message || String(error) });
    return sendError(res, error, 'matter_replay_failed');
  }
});

module.exports = router;