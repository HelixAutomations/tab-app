/**
 * CCL Admin API — management endpoints for the ops panel.
 * Only returns data; gated by ADMIN_USERS on the frontend.
 *
 * GET  /api/ccl-admin/stats                  → aggregate dashboard stats
 * GET  /api/ccl-admin/matters                → list all CCLs (paginated)
 * GET  /api/ccl-admin/matters/:matterId      → full content + trace history for one matter
 * GET  /api/ccl-admin/traces/:matterId       → AI traces for a matter
 * GET  /api/ccl-admin/trace/:trackingId      → single trace by trackingId
 * GET  /api/ccl-admin/by-practice-area       → CCLs grouped by practice area
 * GET  /api/ccl-admin/by-fee-earner          → CCLs grouped by fee earner
 * GET  /api/ccl-admin/timeline               → daily CCL activity
 * GET  /api/ccl-admin/ai-timeline            → daily AI performance
 * GET  /api/ccl-admin/ops-log                → recent operations (unified event log)
 */
const express = require('express');
const {
    getCclStats,
    listAllCcls,
    getCclContentHistory,
    getLatestCclContent,
    getCclAiTraces,
    getCclAiTraceByTrackingId,
    getCclByPracticeArea,
    getCclByFeeEarner,
    getCclTimeline,
    getCclAiTimeline,
    getCclOpsLog,
    saveCclAssessment,
    getCclAssessments,
    getAssessmentCorpus,
    getAssessmentAccuracySummary,
    markAssessmentApplied,
} = require('../utils/cclPersistence');
const { trackEvent } = require('../utils/appInsights');

const router = express.Router();

// ─── GET /api/ccl-admin/stats ──────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
    try {
        const stats = await getCclStats();
        if (!stats) return res.json({ ok: false, error: 'Tables not available' });
        return res.json({ ok: true, ...stats });
    } catch (err) {
        console.error('[ccl-admin] Stats query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/matters ────────────────────────────────────────────
router.get('/matters', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        const status = req.query.status || undefined;
        const rows = await listAllCcls({ limit, offset, status });
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] List matters failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/matters/:matterId ──────────────────────────────────
router.get('/matters/:matterId', async (req, res) => {
    try {
        const { matterId } = req.params;
        const [latest, history, traces] = await Promise.all([
            getLatestCclContent(matterId),
            getCclContentHistory(matterId),
            getCclAiTraces(matterId),
        ]);
        return res.json({
            ok: true,
            matterId,
            latest,
            versions: history,
            aiTraces: traces,
        });
    } catch (err) {
        console.error('[ccl-admin] Matter detail failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/traces/:matterId ───────────────────────────────────
router.get('/traces/:matterId', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const traces = await getCclAiTraces(req.params.matterId, limit);
        return res.json({ ok: true, count: traces.length, traces });
    } catch (err) {
        console.error('[ccl-admin] Traces query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/trace/:trackingId ──────────────────────────────────
router.get('/trace/:trackingId', async (req, res) => {
    try {
        const trace = await getCclAiTraceByTrackingId(req.params.trackingId);
        if (!trace) return res.status(404).json({ error: 'Trace not found' });
        return res.json({ ok: true, trace });
    } catch (err) {
        console.error('[ccl-admin] Trace lookup failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});


// ─── GET /api/ccl-admin/by-practice-area ───────────────────────────────────
router.get('/by-practice-area', async (_req, res) => {
    try {
        const rows = await getCclByPracticeArea();
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] Practice area breakdown failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/by-fee-earner ──────────────────────────────────────
router.get('/by-fee-earner', async (_req, res) => {
    try {
        const rows = await getCclByFeeEarner();
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] Fee earner breakdown failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/timeline ───────────────────────────────────────────
router.get('/timeline', async (req, res) => {
    try {
        const days = Math.min(Number(req.query.days) || 30, 365);
        const rows = await getCclTimeline(days);
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] Timeline query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/ai-timeline ────────────────────────────────────────
router.get('/ai-timeline', async (req, res) => {
    try {
        const days = Math.min(Number(req.query.days) || 30, 365);
        const rows = await getCclAiTimeline(days);
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] AI timeline query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/ops-log ────────────────────────────────────────────
router.get('/ops-log', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const rows = await getCclOpsLog(limit);
        return res.json({ ok: true, count: rows.length, rows });
    } catch (err) {
        console.error('[ccl-admin] Ops log query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/ccl-admin/assessments ───────────────────────────────────────
// Submit a structured quality assessment of a CCL output.
router.post('/assessments', async (req, res) => {
    try {
        const {
            matterId, cclContentId, cclAiTraceId, instructionRef,
            practiceArea, feeEarner, documentType,
            overallScore, fieldAssessmentsJson, issueCategories,
            manualEditsJson, fieldsCorrect, fieldsEdited, fieldsReplaced, fieldsEmpty,
            notes, promptSuggestion, assessedBy,
        } = req.body;

        if (!matterId || !overallScore || !assessedBy) {
            return res.status(400).json({ ok: false, error: 'matterId, overallScore, and assessedBy are required.' });
        }

        const id = await saveCclAssessment({
            matterId, cclContentId, cclAiTraceId, instructionRef,
            practiceArea, feeEarner, documentType,
            overallScore, fieldAssessmentsJson, issueCategories,
            manualEditsJson, fieldsCorrect, fieldsEdited, fieldsReplaced, fieldsEmpty,
            notes, promptSuggestion, assessedBy,
        });

        trackEvent('CCL.Assessment.Submitted', { matterId, assessedBy, overallScore: String(overallScore) });
        return res.json({ ok: true, assessmentId: id });
    } catch (err) {
        console.error('[ccl-admin] Assessment save failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/assessments/:matterId ──────────────────────────────
router.get('/assessments/:matterId', async (req, res) => {
    try {
        const assessments = await getCclAssessments(req.params.matterId);
        return res.json({ ok: true, count: assessments.length, assessments });
    } catch (err) {
        console.error('[ccl-admin] Assessments query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/assessment-corpus ──────────────────────────────────
// Query the assessment corpus for prompt engineering. Filters:
//   ?practiceArea=Property&maxScore=3&unappliedOnly=true&feeEarner=XX&limit=50
router.get('/assessment-corpus', async (req, res) => {
    try {
        const opts = {
            practiceArea: req.query.practiceArea || undefined,
            maxScore: req.query.maxScore ? Number(req.query.maxScore) : undefined,
            unappliedOnly: req.query.unappliedOnly === 'true',
            feeEarner: req.query.feeEarner || undefined,
            limit: Math.min(Number(req.query.limit) || 100, 500),
        };
        const rows = await getAssessmentCorpus(opts);
        return res.json({ ok: true, count: rows.length, corpus: rows });
    } catch (err) {
        console.error('[ccl-admin] Corpus query failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/ccl-admin/assessment-accuracy ────────────────────────────────
// Aggregated accuracy summary — field-level precision across all assessments.
//   ?practiceArea=Property
router.get('/assessment-accuracy', async (req, res) => {
    try {
        const data = await getAssessmentAccuracySummary({
            practiceArea: req.query.practiceArea || undefined,
        });
        if (!data) return res.json({ ok: false, error: 'Tables not available' });
        return res.json({ ok: true, ...data });
    } catch (err) {
        console.error('[ccl-admin] Accuracy summary failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── PATCH /api/ccl-admin/assessments/:id/applied ──────────────────────────
// Mark an assessment's prompt suggestion as applied.
router.patch('/assessments/:id/applied', async (req, res) => {
    try {
        const { appliedBy } = req.body;
        if (!appliedBy) return res.status(400).json({ ok: false, error: 'appliedBy is required.' });
        await markAssessmentApplied(Number(req.params.id), appliedBy);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[ccl-admin] Mark applied failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
