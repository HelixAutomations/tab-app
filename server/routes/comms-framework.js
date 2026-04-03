/**
 * Communication Frameworks — pressure-test route.
 *
 * POST /api/ai/pressure-test-comms
 * Body: { framework: string, draft: string, context?: string }
 * Returns: { ok, result: { overallScore, dimensions, redFlags, suggestions, revisedDraft }, durationMs }
 */
const express = require('express');
const router = express.Router();
const { chatCompletion } = require('../utils/aiClient');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getFrameworkPrompt, listFrameworks } = require('../prompts/communication-frameworks');
const { resolveRequestActor } = require('../utils/requestActor');

const VALID_FRAMEWORKS = ['communication', 'management', 'tasking', 'feedback', 'projects'];

/** GET /api/ai/frameworks — list available frameworks */
router.get('/frameworks', (_req, res) => {
  res.json({ ok: true, frameworks: listFrameworks() });
});

/** POST /api/ai/pressure-test-comms — pressure-test a draft */
router.post('/pressure-test-comms', async (req, res) => {
  const start = Date.now();
  const actor = resolveRequestActor(req);
  const { framework, draft, context } = req.body || {};

  // ── Validation ──
  if (!framework || !VALID_FRAMEWORKS.includes(framework)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid framework. Must be one of: ${VALID_FRAMEWORKS.join(', ')}`,
    });
  }
  if (!draft || typeof draft !== 'string' || draft.trim().length < 10) {
    return res.status(400).json({
      ok: false,
      error: 'Draft is required and must be at least 10 characters.',
    });
  }

  const promptTemplate = getFrameworkPrompt(framework);
  if (!promptTemplate) {
    return res.status(400).json({ ok: false, error: 'Unknown framework.' });
  }

  trackEvent('AI.CommsFramework.Started', {
    framework,
    triggeredBy: actor,
    draftLength: String(draft.length),
    hasContext: String(!!context),
  });

  try {
    const userPrompt = context
      ? `CONTEXT:\n${context}\n\nDRAFT TO REVIEW:\n${draft}`
      : `DRAFT TO REVIEW:\n${draft}`;

    const result = await chatCompletion(promptTemplate.systemPrompt, userPrompt, {
      temperature: 0.1,
    });

    const durationMs = Date.now() - start;

    trackEvent('AI.CommsFramework.Completed', {
      framework,
      triggeredBy: actor,
      durationMs: String(durationMs),
      overallScore: String(result?.overallScore ?? 'unknown'),
      redFlagCount: String(Array.isArray(result?.redFlags) ? result.redFlags.length : 0),
    });
    trackMetric('AI.CommsFramework.Duration', durationMs, { framework });

    return res.json({ ok: true, result, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    trackException(err, {
      operation: 'pressure-test-comms',
      framework,
      phase: 'chatCompletion',
      triggeredBy: actor,
    });
    trackEvent('AI.CommsFramework.Failed', {
      framework,
      triggeredBy: actor,
      error: err.message,
      durationMs: String(durationMs),
    });
    return res.status(500).json({ ok: false, error: 'Pressure test failed. Please try again.' });
  }
});

module.exports = router;
