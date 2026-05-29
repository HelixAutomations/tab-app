/**
 * Form intent beacon route.
 *
 * Operator god-mode P1.
 * Brief: docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md
 *
 * Purpose
 *   Capture a row the INSTANT the user presses submit on any Helix form,
 *   BEFORE the real submission POST is fired. If the real POST never
 *   lands, the orphan intent remains so the user's action is never
 *   silently lost.
 *
 * Endpoints
 *   POST /api/forms/intent              record a new intent
 *   GET  /api/forms/intent/orphaned     list intents older than N min with no match
 *
 * Failure model
 *   Best-effort. Never throw. If the DB write fails we still return 202
 *   so the client form submit can proceed without being blocked.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');

function getConnStr() {
  if (String(process.env.FORM_SUBMISSIONS_USE_LEGACY || '').toLowerCase() === 'true') {
    return process.env.SQL_CONNECTION_STRING || null;
  }
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() === 'true' && process.env.OPS_SQL_CONNECTION_STRING) {
    return process.env.OPS_SQL_CONNECTION_STRING;
  }
  return process.env.SQL_CONNECTION_STRING || null;
}

const intentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.initials || req.ip || 'anon').toString().toUpperCase(),
  handler: (req, res) => {
    trackEvent('FormIntent.RateLimited', { user: req.user?.initials, ip: req.ip });
    res.status(429).json({ ok: false, error: 'rate_limited' });
  },
});

router.use(intentLimiter);

function clamp(value, max) {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * POST /api/forms/intent
 * Body: { clientSubmissionId, formKey, payloadFingerprint?, userAgent?, route? }
 */
router.post('/', async (req, res) => {
  const body = req.body || {};
  const clientSubmissionId = clamp(body.clientSubmissionId, 64);
  const formKey = clamp(body.formKey, 64);
  const submittedBy = clamp(req.user?.initials || body.submittedBy || 'unknown', 16);
  const payloadFingerprint = clamp(body.payloadFingerprint, 128);
  const userAgent = clamp(body.userAgent || req.headers['user-agent'], 400);
  const route = clamp(body.route, 200);

  if (!clientSubmissionId || !formKey) {
    return res.status(400).json({ ok: false, error: 'missing_required' });
  }

  const connStr = getConnStr();
  if (!connStr) {
    // Local dev without DB. Acknowledge so the client flow keeps moving.
    return res.status(202).json({ ok: true, recorded: false, reason: 'no_db' });
  }

  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('client_submission_id', sql.NVarChar(64), clientSubmissionId);
      request.input('form_key', sql.NVarChar(64), formKey);
      request.input('submitted_by', sql.NVarChar(16), submittedBy);
      request.input('payload_fingerprint', sql.NVarChar(128), payloadFingerprint);
      request.input('user_agent', sql.NVarChar(400), userAgent);
      request.input('route', sql.NVarChar(200), route);
      // Idempotent insert: client retries with the same clientSubmissionId
      // (e.g. sendBeacon + fetch race) must not double-row.
      await request.query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.form_submission_intents WHERE client_submission_id = @client_submission_id
        )
        BEGIN
          INSERT INTO dbo.form_submission_intents
            (client_submission_id, form_key, submitted_by, payload_fingerprint, user_agent, route)
          VALUES
            (@client_submission_id, @form_key, @submitted_by, @payload_fingerprint, @user_agent, @route);
        END
      `);
    });
    trackEvent('FormIntent.Recorded', { formKey, submittedBy, clientSubmissionId });
    return res.status(202).json({ ok: true, recorded: true });
  } catch (err) {
    trackException(err, { phase: 'form-intent.record', formKey, submittedBy });
    return res.status(202).json({ ok: true, recorded: false, reason: 'db_error' });
  }
});

/**
 * GET /api/forms/intent/orphaned?olderThanSeconds=120
 * Returns intents created before (now - olderThanSeconds) that still have
 * no matched_submission_id. Dev-preview surface.
 */
router.get('/orphaned', async (req, res) => {
  const olderThan = Math.max(30, Math.min(86400, Number(req.query.olderThanSeconds) || 120));
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));

  const connStr = getConnStr();
  if (!connStr) {
    return res.json({ ok: true, orphans: [], reason: 'no_db' });
  }

  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('older_than', sql.Int, olderThan);
      request.input('lim', sql.Int, limit);
      return request.query(`
        SELECT TOP (@lim)
          id, client_submission_id, form_key, submitted_by, created_at,
          payload_fingerprint, user_agent, route, orphan_notified_at
        FROM dbo.form_submission_intents
        WHERE matched_submission_id IS NULL
          AND created_at < DATEADD(SECOND, -@older_than, SYSUTCDATETIME())
        ORDER BY created_at ASC;
      `);
    });
    const orphans = result?.recordset || [];
    if (orphans.length) {
      trackEvent('FormIntent.OrphanScan', { count: orphans.length, olderThanSeconds: olderThan });
    }
    return res.json({ ok: true, orphans, olderThanSeconds: olderThan });
  } catch (err) {
    trackException(err, { phase: 'form-intent.orphaned' });
    return res.status(500).json({ ok: false, error: 'query_failed' });
  }
});

module.exports = router;
