const express = require('express');
const { listOpsChecks, recordOpsCheckFailure, recordOpsCheckRun, runOpsCheck } = require('../utils/opsCheckCatalog');
const { getRequestUser, isDevGroupOrHigher } = require('../utils/userTier');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { pushOpsCheckSummary } = require('./ops-pulse');

const router = express.Router();

function getTriggeredBy(req) {
  const user = getRequestUser(req);
  return user.initials || user.email || 'unknown';
}

function requireOpsChecksAccess(req, res) {
  if (isDevGroupOrHigher(req)) return true;
  res.status(403).json({ error: 'forbidden', message: 'Activity checks are available to dev-group users only.' });
  return false;
}

router.get('/catalog', (req, res) => {
  if (!requireOpsChecksAccess(req, res)) return;

  try {
    res.json({ checks: listOpsChecks() });
  } catch (error) {
    trackException(error, { operation: 'OpsChecks.Catalog', phase: 'list' });
    res.status(500).json({ error: 'ops_checks_catalog_failed', message: error?.message || 'Failed to load checks catalog.' });
  }
});

router.post('/run/:id', async (req, res) => {
  if (!requireOpsChecksAccess(req, res)) return;

  const checkId = String(req.params.id || '').trim();
  const inputs = req.body && typeof req.body === 'object' && req.body.inputs && typeof req.body.inputs === 'object'
    ? req.body.inputs
    : {};
  const triggeredBy = getTriggeredBy(req);
  const startedAt = Date.now();

  trackEvent('OpsChecks.Run.Started', {
    operation: 'run',
    checkId,
    triggeredBy,
  });

  try {
    const result = await runOpsCheck(checkId, { req, inputs });
    const durationMs = Date.now() - startedAt;

    if (!result) {
      trackEvent('OpsChecks.Run.Failed', {
        operation: 'run',
        checkId,
        triggeredBy,
        durationMs,
        reason: 'not_found',
      });
      return res.status(404).json({ error: 'unknown_check', message: `No check exists for ${checkId}.` });
    }

    trackEvent('OpsChecks.Run.Completed', {
      operation: 'run',
      checkId,
      triggeredBy,
      durationMs,
      resultStatus: result.status,
      dependencyCount: result.dependencyResults.length,
    });
    trackMetric('OpsChecks.Run.Duration', durationMs, { checkId, resultStatus: result.status });
    const summary = recordOpsCheckRun(result, triggeredBy);
    pushOpsCheckSummary(summary);

    return res.json({ result, summary });
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error?.statusCode === 400) {
      trackEvent('OpsChecks.Run.Failed', {
        operation: 'run',
        checkId,
        triggeredBy,
        durationMs,
        reason: 'input_invalid',
        fields: Array.isArray(error.fields) ? error.fields.join(',') : '',
      });
      return res.status(400).json({
        error: error.code || 'ops_check_input_invalid',
        message: error.message || 'Check input is invalid.',
        fields: Array.isArray(error.fields) ? error.fields : [],
      });
    }

    trackException(error, { operation: 'OpsChecks.Run', phase: 'execute', checkId, triggeredBy });
    trackEvent('OpsChecks.Run.Failed', {
      operation: 'run',
      checkId,
      triggeredBy,
      durationMs,
      error: error?.message || String(error),
    });
    trackMetric('OpsChecks.Run.Duration', durationMs, { checkId, resultStatus: 'error' });

    const summary = recordOpsCheckFailure(checkId, { triggeredBy, durationMs, error });
    pushOpsCheckSummary(summary);

    return res.status(500).json({
      error: 'ops_check_failed',
      message: error?.message || 'Check failed unexpectedly.',
    });
  }
});

module.exports = router;