/**
 * Forms AI Composer route.
 *
 * Endpoints:
 *   POST  /api/forms-ai/plan                 — generate a pre-filled proposal
 *   POST  /api/forms-ai/plan/:id/accepted    — mark proposal accepted (after the user submits the form)
 *   POST  /api/forms-ai/plan/:id/discarded   — mark proposal discarded
 *
 * Storage: every call writes a row to dbo.ai_proposals via aiProposalLog
 * so we can measure accept-rate, replay queries against new prompts, and
 * audit "AI suggested X, user did Y".
 */

const express = require('express');
const router = express.Router();

const { chatCompletion } = require('../utils/aiClient');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  buildSystemPrompt,
  buildUserPrompt,
  validatePlan,
  SUPPORTED_FORM_KEYS,
} = require('../prompts/formsComposer');
const {
  recordProposal,
  markAccepted,
  markDiscarded,
  markUnsupported,
  markFailed,
} = require('../utils/aiProposalLog');

const MODEL = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.1';

router.post('/plan', async (req, res) => {
  const { query, currentUser } = req.body || {};
  const initials = String(currentUser?.initials || '').trim();

  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ ok: false, error: 'query_required' });
  }
  if (!initials) {
    return res.status(400).json({ ok: false, error: 'initials_required' });
  }
  if (query.length > 2000) {
    return res.status(400).json({ ok: false, error: 'query_too_long' });
  }

  const startMs = Date.now();
  trackEvent('FormsAi.Plan.Started', {
    operation: 'plan',
    triggeredBy: initials,
    queryLength: String(query.length),
  });

  let proposalId = null;
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ query, currentUser });

    const raw = await chatCompletion(systemPrompt, userPrompt, { temperature: 0.2 });
    const validation = validatePlan(raw);

    if (!validation.ok) {
      const durationMs = Date.now() - startMs;
      proposalId = await recordProposal({
        surface: 'forms-composer',
        createdBy: initials,
        query,
        proposal: { _validationError: validation.error, _raw: raw },
        targetKind: null,
        model: MODEL,
        durationMs,
      });
      await markFailed(proposalId, { error: `validation:${validation.error}` });
      trackEvent('FormsAi.Plan.Failed', {
        operation: 'plan',
        triggeredBy: initials,
        proposalId,
        phase: 'validation',
        error: validation.error,
        durationMs: String(durationMs),
      });
      return res.status(502).json({ ok: false, error: 'invalid_plan', detail: validation.error, proposalId });
    }

    const { plan } = validation;
    const durationMs = Date.now() - startMs;
    const targetKind = plan.formKey === 'unsupported' ? null : `form:${plan.formKey}`;

    proposalId = await recordProposal({
      surface: 'forms-composer',
      createdBy: initials,
      query,
      proposal: plan,
      targetKind,
      model: MODEL,
      durationMs,
    });

    if (plan.formKey === 'unsupported' || !SUPPORTED_FORM_KEYS.has(plan.formKey)) {
      await markUnsupported(proposalId, { reason: 'no_form_match' });
      trackEvent('FormsAi.Plan.Unsupported', {
        operation: 'plan',
        triggeredBy: initials,
        proposalId,
        durationMs: String(durationMs),
      });
      return res.json({ ok: true, supported: false, proposalId, plan });
    }

    trackEvent('FormsAi.Plan.Completed', {
      operation: 'plan',
      triggeredBy: initials,
      proposalId,
      formKey: plan.formKey,
      durationMs: String(durationMs),
    });
    trackMetric('FormsAi.Plan.Duration', durationMs, { operation: 'plan', formKey: plan.formKey });

    return res.json({ ok: true, supported: true, proposalId, plan });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    trackException(err, { phase: 'plan', operation: 'plan', triggeredBy: initials });
    trackEvent('FormsAi.Plan.Failed', {
      operation: 'plan',
      triggeredBy: initials,
      proposalId,
      phase: 'llm',
      error: err.message || 'unknown',
      durationMs: String(durationMs),
    });
    if (proposalId) {
      await markFailed(proposalId, { error: err });
    }
    return res.status(500).json({ ok: false, error: 'plan_failed', detail: err.message, proposalId });
  }
});

router.post('/plan/:id/accepted', async (req, res) => {
  const { id } = req.params;
  const { outcomeRef = null, mode = 'review-and-send' } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
  try {
    await markAccepted(id, { outcomeRef, mode });
    return res.json({ ok: true });
  } catch (err) {
    trackException(err, { phase: 'plan.accepted', proposalId: id });
    return res.status(500).json({ ok: false, error: 'accept_failed' });
  }
});

router.post('/plan/:id/discarded', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
  try {
    await markDiscarded(id);
    return res.json({ ok: true });
  } catch (err) {
    trackException(err, { phase: 'plan.discarded', proposalId: id });
    return res.status(500).json({ ok: false, error: 'discard_failed' });
  }
});

module.exports = router;
