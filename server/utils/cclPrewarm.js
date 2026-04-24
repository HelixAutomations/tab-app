/**
 * CCL Pre-warm — silent, fire-and-forget CCL draft generation triggered
 * automatically after a matter is opened.
 *
 * Goal: by the time the user clicks "compile" in the home pipeline, the CCL
 * draft already exists. No UI changes — this surfaces only in telemetry.
 *
 * Behaviour:
 *   - Off by default. Enable via env var: CCL_PREWARM_ENABLED=1
 *   - Dedup: skips if a CclContent record already exists at version > 0
 *     (never clobber a draft the user has already worked on).
 *   - Internal helpers only — no HTTP self-calls (avoids auth/CORS/middleware
 *     overhead and prevents recursive event emission).
 *   - Background pressure test runs after persistence (existing pattern in
 *     /service/run); never blocks.
 *   - Full telemetry: CCL.Prewarm.Started/Completed/Skipped/Failed +
 *     CCL.Prewarm.Duration/SourceCount/FieldCount metrics.
 */

const { trackEvent, trackException, trackMetric } = require('./appInsights');

let _cclModule = null;
let _cclAiModule = null;
let _cclPersistenceModule = null;

// Lazy require to avoid circular load order issues with route modules
function getCclModules() {
    if (!_cclModule) _cclModule = require('../routes/ccl');
    if (!_cclAiModule) _cclAiModule = require('../routes/ccl-ai');
    if (!_cclPersistenceModule) _cclPersistenceModule = require('./cclPersistence');
    return {
        compileCclContext: _cclModule.compileCclContext,
        persistCclSnapshot: _cclModule.persistCclSnapshot,
        runCclAiFill: _cclAiModule.runCclAiFill,
        runPressureTestInternal: _cclAiModule.runPressureTestInternal,
        getLatestCclContent: _cclPersistenceModule.getLatestCclContent,
        CCL_PROMPT_VERSION: _cclAiModule.CCL_PROMPT_VERSION || 'ccl-ai-v2',
    };
}

const CCL_TEMPLATE_VERSION = 'helix-ccl-template-v1';
const PREWARM_ACTOR = 'system:matter-prewarm';

function isPrewarmEnabled() {
    return process.env.CCL_PREWARM_ENABLED === '1' || process.env.CCL_PREWARM_ENABLED === 'true';
}

function mergeDraftWithAiFields(draft, aiFields) {
    const base = draft && typeof draft === 'object' ? { ...draft } : {};
    if (!aiFields || typeof aiFields !== 'object') return base;
    for (const [key, val] of Object.entries(aiFields)) {
        if (val === undefined || val === null) continue;
        const str = typeof val === 'string' ? val.trim() : val;
        if (typeof str === 'string' && str.length === 0) continue;
        base[key] = val;
    }
    return base;
}

/**
 * Run a silent CCL pre-warm for the given matter context.
 *
 * @param {object} ctx
 * @param {string} ctx.matterId - Clio matter id (required)
 * @param {string} [ctx.instructionRef]
 * @param {string} [ctx.practiceArea]
 * @param {string} [ctx.description]
 * @param {string} [ctx.clientName]
 * @param {string} [ctx.opponent]
 * @param {string} [ctx.handlerName]
 * @param {string} [ctx.handlerRole]
 * @param {string|number} [ctx.handlerRate]
 * @param {string} [ctx.triggeredBy='matter.opened']
 * @returns {Promise<{ok: boolean, skipped?: string, durationMs?: number, error?: string}>}
 */
async function prewarmCcl(ctx = {}) {
    const startedAt = Date.now();
    const matterId = ctx.matterId ? String(ctx.matterId) : '';
    const instructionRef = ctx.instructionRef ? String(ctx.instructionRef) : '';
    const triggeredBy = ctx.triggeredBy || 'matter.opened';

    if (!matterId) {
        return { ok: false, skipped: 'no-matter-id' };
    }
    if (!isPrewarmEnabled()) {
        return { ok: false, skipped: 'flag-disabled' };
    }

    trackEvent('CCL.Prewarm.Started', {
        matterId, instructionRef, triggeredBy,
        practiceArea: String(ctx.practiceArea || ''),
    });

    let mods;
    try {
        mods = getCclModules();
    } catch (err) {
        trackException(err, { component: 'CCL.Prewarm', phase: 'load-modules', matterId });
        trackEvent('CCL.Prewarm.Failed', { matterId, instructionRef, triggeredBy, phase: 'load-modules', error: err.message });
        return { ok: false, error: err.message };
    }

    // Dedup — never clobber an existing draft (version > 0)
    try {
        const existing = await mods.getLatestCclContent(matterId);
        if (existing && Number(existing.Version) > 0) {
            trackEvent('CCL.Prewarm.Skipped', {
                matterId, instructionRef, triggeredBy,
                reason: 'existing-version', version: String(existing.Version),
            });
            return { ok: true, skipped: 'existing-version' };
        }
    } catch (err) {
        // Dedup check failure is non-fatal — proceed cautiously but log
        console.warn(`[ccl-prewarm] dedup check failed for ${matterId}: ${err.message}`);
    }

    try {
        const compileInput = {
            matterId,
            instructionRef,
            practiceArea: ctx.practiceArea,
            description: ctx.description,
            clientName: ctx.clientName,
            opponent: ctx.opponent,
            handlerName: ctx.handlerName,
            handlerRole: ctx.handlerRole,
            handlerRate: ctx.handlerRate,
        };

        const compile = await mods.compileCclContext(compileInput, PREWARM_ACTOR, { persist: true });
        const preview = compile.preview;

        const aiResult = await mods.runCclAiFill(compileInput, PREWARM_ACTOR, {
            preBuiltContextPackage: compile._contextPackage,
        });

        const merged = mergeDraftWithAiFields({}, aiResult.fields || {});
        // Inject handler context so personnel placeholders are filled
        if (ctx.handlerName && !merged.name_of_person_handling_matter) merged.name_of_person_handling_matter = ctx.handlerName;
        if (ctx.handlerRole && !merged.status) merged.status = ctx.handlerRole;
        if (ctx.handlerRate && !merged.handler_hourly_rate) merged.handler_hourly_rate = ctx.handlerRate;

        const sourceCoverage = compile.sourceCoverage;
        const provenance = {
            serviceVersion: 'ccl-prewarm-v1',
            promptVersion: aiResult.promptVersion || mods.CCL_PROMPT_VERSION,
            templateVersion: CCL_TEMPLATE_VERSION,
            sourceCoverage,
            dataSources: preview?.dataSources || [],
            missingDataFlags: compile.missingDataFlags,
            excludedSources: (sourceCoverage || []).filter((item) => item.status !== 'ready').map((item) => item.label),
            workbenchStage: 'matter-open-prewarm',
            contextFields: preview?.contextFields || {},
            contextSnippets: preview?.snippets || {},
            compile: {
                trackingId: compile.trackingId,
                traceId: compile.traceId,
                durationMs: compile.durationMs,
                createdAt: compile.createdAt,
                summary: compile.summary,
            },
            ai: {
                source: aiResult.source || '',
                confidence: aiResult.confidence || '',
                durationMs: aiResult.durationMs || null,
                fallbackReason: aiResult.fallbackReason || null,
                trackingId: aiResult.debug?.trackingId || null,
                aiTraceId: aiResult.aiTraceId || null,
            },
            lastRunAt: new Date().toISOString(),
            triggeredBy: PREWARM_ACTOR,
            prewarmTrigger: triggeredBy,
        };

        const result = await mods.persistCclSnapshot({
            matterId,
            draftJson: { ...merged, _provenance: provenance },
            user: PREWARM_ACTOR,
            provenanceJson: provenance,
            templateVersion: CCL_TEMPLATE_VERSION,
            aiTraceId: aiResult.aiTraceId || null,
        });

        // Background pressure test — non-blocking, mirrors /service/run pattern
        if (mods.runPressureTestInternal && aiResult.fields && Object.keys(aiResult.fields).length > 0) {
            mods.runPressureTestInternal({
                matterId,
                instructionRef,
                generatedFields: aiResult.fields,
                practiceArea: ctx.practiceArea,
                clientName: ctx.clientName,
                feeEarnerEmail: preview?.contextFields?.feeEarnerEmail || '',
                prospectEmail: preview?.contextFields?.prospectEmail || '',
            }).catch(err => {
                console.warn(`[ccl-prewarm] background PT failed for ${matterId}: ${err.message}`);
                trackEvent('CCL.Prewarm.PressureTestFailed', { matterId, error: err.message });
            });
        }

        const durationMs = Date.now() - startedAt;
        trackEvent('CCL.Prewarm.Completed', {
            matterId, instructionRef, triggeredBy,
            durationMs: String(durationMs),
            sourceCount: String((preview?.dataSources || []).length),
            fieldCount: String(result?.fieldCount || 0),
            unresolvedCount: String(result?.unresolvedCount || 0),
            confidence: String(aiResult.confidence || ''),
        });
        trackMetric('CCL.Prewarm.Duration', durationMs, { matterId });
        trackMetric('CCL.Prewarm.SourceCount', (preview?.dataSources || []).length, { matterId });
        trackMetric('CCL.Prewarm.FieldCount', result?.fieldCount || 0, { matterId });

        return { ok: true, durationMs };
    } catch (err) {
        const durationMs = Date.now() - startedAt;
        console.warn(`[ccl-prewarm] failed for ${matterId}: ${err.message}`);
        trackException(err, { component: 'CCL.Prewarm', matterId, instructionRef, triggeredBy });
        trackEvent('CCL.Prewarm.Failed', {
            matterId, instructionRef, triggeredBy,
            error: err.message, durationMs: String(durationMs),
        });
        return { ok: false, error: err.message, durationMs };
    }
}

module.exports = { prewarmCcl, isPrewarmEnabled };
