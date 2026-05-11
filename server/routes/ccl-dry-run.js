/**
 * CCL Dry-Run harness (W2D)
 *
 * Read-only AI + docx generation for matter X without persisting to
 * `CclContent`, `CclSent`, `CclPressureTest`, or queueing the autopilot
 * chain. Used by the dev-only `src/tabs/dev/CclDiff.tsx` two-column
 * comparison page to validate prompt / template / model swaps before
 * promoting them to the live pipeline.
 *
 * Returns a base64-encoded `.docx` plus the raw AI fields so the diff
 * surface can render side-by-side comparisons. Reuses
 * `runCclAiFill()` and `generateWordFromJson()` so the dry-run path
 * stays in lockstep with production output.
 *
 * Telemetry: `CCL.DryRun.{Started,Completed,Failed}` + duration metric.
 *   - `triggeredBy` always 'dev-diff'
 *   - never writes to CclContent / CclSent / CclPressureTest
 *   - never triggers ND upload, send-to-client, or autopilot
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const router = express.Router();

const cclAiRouter = require('./ccl-ai');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const CCL_PROMPT_VERSION = cclAiRouter.CCL_PROMPT_VERSION || 'ccl-ai-v3-voice';
const CCL_TEMPLATE_VERSION = 'helix-ccl-template-v1';

router.post('/', async (req, res) => {
    const {
        matterId,
        instructionRef,
        practiceArea,
        description,
        clientName,
        opponent,
        enquiryNotes,
        handlerName,
        handlerRole,
        handlerRate,
    } = req.body || {};

    if (!matterId) {
        return res.status(400).json({ error: 'matterId is required' });
    }

    const trackingId = Math.random().toString(36).slice(2, 10);
    const startMs = Date.now();
    const actor = (req.user && (req.user.initials || req.user.email)) || 'dev-diff';

    trackEvent('CCL.DryRun.Started', {
        trackingId,
        matterId: String(matterId),
        triggeredBy: 'dev-diff',
        actor: String(actor),
    });

    let tempDocxPath = null;

    try {
        const fillResult = await cclAiRouter.runCclAiFill({
            matterId,
            instructionRef,
            practiceArea,
            description,
            clientName,
            opponent,
            enquiryNotes,
            handlerName,
            handlerRole,
            handlerRate,
        }, actor);

        if (!fillResult || !fillResult.ok) {
            throw new Error('AI fill returned no result');
        }

        const aiFields = fillResult.fields || {};
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccl-dry-run-'));
        tempDocxPath = path.join(tmpDir, `dry-run-${matterId}.docx`);

        const generationMeta = await generateWordFromJson(aiFields, tempDocxPath);
        const unresolvedPlaceholders = (generationMeta && generationMeta.unresolvedPlaceholders) || [];

        let docxBase64 = null;
        if (fs.existsSync(tempDocxPath)) {
            docxBase64 = fs.readFileSync(tempDocxPath).toString('base64');
        }

        const durationMs = Date.now() - startMs;
        trackEvent('CCL.DryRun.Completed', {
            trackingId,
            matterId: String(matterId),
            triggeredBy: 'dev-diff',
            durationMs: String(durationMs),
            confidence: String(fillResult.confidence || 'unknown'),
            model: String(fillResult.model || 'unknown'),
            promptVersion: String(fillResult.promptVersion || CCL_PROMPT_VERSION),
            templateVersion: CCL_TEMPLATE_VERSION,
            unresolvedCount: String(unresolvedPlaceholders.length),
            fieldCount: String(Object.keys(aiFields).length),
        });
        trackMetric('CCL.DryRun.Duration', durationMs, { triggeredBy: 'dev-diff' });

        return res.json({
            ok: true,
            trackingId,
            matterId,
            aiFields,
            docxBase64,
            docxName: `CCL-dryrun-${matterId}.docx`,
            unresolvedPlaceholders,
            unresolvedCount: unresolvedPlaceholders.length,
            confidence: fillResult.confidence,
            model: fillResult.model,
            promptVersion: fillResult.promptVersion || CCL_PROMPT_VERSION,
            templateVersion: CCL_TEMPLATE_VERSION,
            durationMs,
            contextSummary: fillResult.contextSummary,
            dataSources: fillResult.dataSources || [],
            fallbackReason: fillResult.fallbackReason || null,
            source: fillResult.source,
        });
    } catch (err) {
        const durationMs = Date.now() - startMs;
        console.error(`[CCL-DryRun] Failed (trackingId: ${trackingId}):`, err.message);
        trackException(err, {
            operation: 'CCL.DryRun',
            trackingId,
            matterId: String(matterId),
        });
        trackEvent('CCL.DryRun.Failed', {
            trackingId,
            matterId: String(matterId),
            triggeredBy: 'dev-diff',
            error: err.message,
            durationMs: String(durationMs),
        });
        return res.status(500).json({ error: 'Dry-run failed', message: err.message, trackingId });
    } finally {
        if (tempDocxPath) {
            try {
                fs.unlinkSync(tempDocxPath);
                fs.rmdirSync(path.dirname(tempDocxPath));
            } catch { /* best-effort cleanup */ }
        }
    }
});

module.exports = router;
