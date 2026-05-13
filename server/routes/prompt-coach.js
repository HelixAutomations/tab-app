/**
 * Prompt Coach — refine a rough operator brief into an agent-ready prompt.
 *
 * POST /api/ai/prompt-coach/refine
 * Body: { brief: string, context?: string }
 * Returns: { ok, result: { refinedPrompt, overallScore, dimensions, missingContext, mechanisms }, durationMs }
 *
 * GET /api/ai/prompt-coach/prompt
 * Returns: { ok, systemPrompt, promptVersion }
 *
 * Local-dev / LZ-AC gated client-side; route itself is unauthenticated for
 * the same reasons as comms-framework (internal staff app, behind app auth).
 */
const express = require('express');
const router = express.Router();
const { chatCompletion } = require('../utils/aiClient');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getPromptCoachPrompt } = require('../prompts/prompt-coach');
const { resolveRequestActor } = require('../utils/requestActor');

const MIN_BRIEF_CHARS = 8;
const MAX_BRIEF_CHARS = 8000;
const MAX_CONTEXT_CHARS = 12000;

router.get('/prompt-coach/prompt', (_req, res) => {
  const { systemPrompt, promptVersion } = getPromptCoachPrompt();
  res.json({ ok: true, systemPrompt, promptVersion });
});

router.post('/prompt-coach/refine', async (req, res) => {
  const start = Date.now();
  const actor = resolveRequestActor(req);
  const { brief, context } = req.body || {};

  if (!brief || typeof brief !== 'string' || brief.trim().length < MIN_BRIEF_CHARS) {
    return res.status(400).json({
      ok: false,
      error: `Brief is required and must be at least ${MIN_BRIEF_CHARS} characters.`,
    });
  }
  if (brief.length > MAX_BRIEF_CHARS) {
    return res.status(400).json({ ok: false, error: 'Brief is too long.' });
  }
  if (context && typeof context === 'string' && context.length > MAX_CONTEXT_CHARS) {
    return res.status(400).json({ ok: false, error: 'Context is too long.' });
  }

  const { systemPrompt, promptVersion } = getPromptCoachPrompt();

  trackEvent('AI.PromptCoach.Started', {
    triggeredBy: actor,
    briefLength: String(brief.length),
    hasContext: String(!!context),
    promptVersion,
  });

  try {
    const userPrompt = context && typeof context === 'string' && context.trim()
      ? `EXTRA CONTEXT FROM OPERATOR:\n${context.trim()}\n\nROUGH BRIEF TO REFINE:\n${brief.trim()}`
      : `ROUGH BRIEF TO REFINE:\n${brief.trim()}`;

    const result = await chatCompletion(systemPrompt, userPrompt, { temperature: 0.2 });
    const durationMs = Date.now() - start;

    trackEvent('AI.PromptCoach.Completed', {
      triggeredBy: actor,
      durationMs: String(durationMs),
      overallScore: String(result?.overallScore ?? 'unknown'),
      missingContextCount: String(Array.isArray(result?.missingContext) ? result.missingContext.length : 0),
      mechanismsCount: String(Array.isArray(result?.mechanisms) ? result.mechanisms.length : 0),
      promptVersion,
    });
    trackMetric('AI.PromptCoach.Duration', durationMs);

    return res.json({ ok: true, result, durationMs, promptVersion });
  } catch (err) {
    const durationMs = Date.now() - start;
    trackException(err, { operation: 'prompt-coach-refine', phase: 'chatCompletion', triggeredBy: actor });
    trackEvent('AI.PromptCoach.Failed', {
      triggeredBy: actor,
      error: err.message,
      durationMs: String(durationMs),
      promptVersion,
    });
    return res.status(500).json({ ok: false, error: 'Prompt coach failed. Please try again.' });
  }
});

module.exports = router;
