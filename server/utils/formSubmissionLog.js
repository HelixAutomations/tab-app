/**
 * Form submission audit log + processing-state tracker.
 *
 * Forms-stream-persistence Phase B2.
 *
 * Why this exists
 * ───────────────
 * Each Helix Hub form (Undertakings, Complaints, Learning & Dev,
 * Tech Ideas / Problems, Bundles, …) writes to its own table and triggers
 * its own side-effects (Asana, Teams, Clio, …). There is no unified record
 * of "what did the user submit, when, and how did the side-effects go?".
 * That gap is what powers the rail in `src/tabs/forms/FormsHub.tsx` —
 * without it we cannot show payloads, replay failures, or attribute work.
 *
 * This module is a thin wrapper around `dbo.form_submissions` (created by
 * `scripts/migrate-add-form-submissions.mjs`). It is purposely additive:
 * it never touches the per-form tables, and individual handlers can adopt
 * it incrementally in B3 without changing their existing logic.
 *
 * Failure model
 * ─────────────
 * Every helper here is *best effort*. If the audit log write fails (DB
 * blip, table missing in dev, …), the helper logs + tracks an exception
 * but DOES NOT throw. Form submission flows must never fail because the
 * audit log was unavailable.
 */

const { withRequest } = require('./db');
const { trackEvent, trackException } = require('./appInsights');

/**
 * Resolve the Helix Operations Platform DB connection string at call time.
 *
 * Two-stage gate (mirrors aiProposalLog):
 *   1. OPS_PLATFORM_ENABLED must be 'true' (repo-level kill switch).
 *   2. OPS_SQL_CONNECTION_STRING must be set.
 *
 * Emergency rollback path: setting FORM_SUBMISSIONS_USE_LEGACY=true forces
 * the helper back onto legacy helix-core-data via SQL_CONNECTION_STRING. Use
 * only if the ops DB is degraded — leaves new rows on the legacy table that
 * will need a second backfill once the ops DB recovers.
 *
 * Resolved per-call (not at module-load) because Key Vault resolution in
 * server/index.js completes after some utils are required.
 */
function getConnStr() {
  if (String(process.env.FORM_SUBMISSIONS_USE_LEGACY || '').toLowerCase() === 'true') {
    return process.env.SQL_CONNECTION_STRING || null;
  }
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() !== 'true') {
    return null;
  }
  return process.env.OPS_SQL_CONNECTION_STRING || null;
}

/**
 * Statuses recognised by the rail. Keep in sync with
 * `src/tabs/forms/processHubData.ts` `streamStatusMeta`.
 *
 * @typedef {'queued'|'processing'|'awaiting_human'|'complete'|'failed'} ProcessingStatus
 */

/**
 * Insert a new submission row at the start of a form handler. The returned
 * id is then used by `recordStep`/`markComplete`/`markFailed`.
 *
 * @param {object} args
 * @param {string} args.formKey       Form discriminator, e.g. 'undertaking'.
 * @param {string} args.submittedBy   Initials of the submitting user.
 * @param {string} [args.lane]        Optional ProcessLane string for the rail.
 * @param {object} args.payload       The original POST body (will be JSON.stringified).
 * @param {string} [args.summary]     Short human label for the rail row.
 * @returns {Promise<string|null>}    UUID of the new row, or `null` on failure.
 */
async function recordSubmission({ formKey, submittedBy, lane = null, payload, summary = null }) {
  const connStr = getConnStr();
  if (!connStr) {
    // Local dev without DB — silently skip.
    return null;
  }
  if (!formKey || !submittedBy) {
    trackException(new Error('formSubmissionLog.recordSubmission missing required args'), {
      formKey: String(formKey || ''),
      submittedBy: String(submittedBy || ''),
    });
    return null;
  }

  try {
    const payloadJson = JSON.stringify(payload ?? {});
    const stepsJson = JSON.stringify([]);
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('form_key', sql.NVarChar(64), formKey);
      request.input('submitted_by', sql.NVarChar(16), submittedBy);
      request.input('lane', sql.NVarChar(32), lane);
      request.input('payload_json', sql.NVarChar(sql.MAX), payloadJson);
      request.input('summary', sql.NVarChar(400), summary);
      request.input('processing_status', sql.NVarChar(32), 'queued');
      request.input('processing_steps_json', sql.NVarChar(sql.MAX), stepsJson);
      return request.query(`
        INSERT INTO dbo.form_submissions
          (form_key, submitted_by, lane, payload_json, summary, processing_status, processing_steps_json)
        OUTPUT INSERTED.id
        VALUES
          (@form_key, @submitted_by, @lane, @payload_json, @summary, @processing_status, @processing_steps_json);
      `);
    });
    const id = result?.recordset?.[0]?.id || null;
    trackEvent('FormSubmission.Recorded', { formKey, submittedBy, submissionId: id, lane });
    return id;
  } catch (err) {
    trackException(err, { phase: 'recordSubmission', formKey, submittedBy });
    return null;
  }
}

/**
 * Append a step record + flip processing_status to 'processing' (unless
 * already terminal). Each step represents one external side-effect attempt
 * (Asana create, Teams notify, Clio matter, …).
 *
 * @param {string|null} submissionId  Returned by `recordSubmission`. No-ops if null.
 * @param {object} step
 * @param {string} step.name          Step identifier, e.g. 'asana.create'.
 * @param {ProcessingStatus} step.status
 * @param {string} [step.error]       Error string when status === 'failed'.
 * @param {object} [step.output]      Optional structured output (external id, etc.).
 */
async function recordStep(submissionId, { name, status, error = null, output = null }) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return;
  try {
    // Read existing steps.
    const current = await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      return request.query(
        'SELECT processing_steps_json FROM dbo.form_submissions WHERE id = @id'
      );
    });
    const row = current?.recordset?.[0];
    if (!row) return;
    let steps = [];
    try {
      steps = row.processing_steps_json ? JSON.parse(row.processing_steps_json) : [];
      if (!Array.isArray(steps)) steps = [];
    } catch {
      steps = [];
    }
    steps.push({
      name,
      status,
      at: new Date().toISOString(),
      ...(error ? { error: String(error).slice(0, 1000) } : {}),
      ...(output ? { output } : {}),
    });
    const stepsJson = JSON.stringify(steps);

    // Write back. Terminal statuses are owned by markComplete / markFailed,
    // so we never overwrite those here.
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      request.input('steps', sql.NVarChar(sql.MAX), stepsJson);
      request.input('last_event', sql.NVarChar(200), `${name}:${status}`);
      await request.query(`
        UPDATE dbo.form_submissions
        SET processing_steps_json = @steps,
            last_event = @last_event,
            last_event_at = SYSUTCDATETIME(),
            processing_status = CASE
              WHEN processing_status IN ('complete','failed','awaiting_human') THEN processing_status
              ELSE 'processing'
            END
        WHERE id = @id;
      `);
    });
    trackEvent('FormSubmission.StepCompleted', {
      submissionId,
      step: name,
      status,
    });
  } catch (err) {
    trackException(err, { phase: 'recordStep', submissionId, step: name });
  }
}

/**
 * Mark a submission as complete (all side-effects landed).
 *
 * @param {string|null} submissionId
 * @param {object} [opts]
 * @param {string} [opts.lastEvent]  Optional human label for the last_event column.
 */
async function markComplete(submissionId, { lastEvent = 'complete' } = {}) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return;
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      request.input('last_event', sql.NVarChar(200), lastEvent);
      await request.query(`
        UPDATE dbo.form_submissions
        SET processing_status = 'complete',
            last_event = @last_event,
            last_event_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);
    });
    trackEvent('FormSubmission.Completed', { submissionId, lastEvent });
  } catch (err) {
    trackException(err, { phase: 'markComplete', submissionId });
  }
}

/**
 * Mark a submission as failed.
 *
 * @param {string|null} submissionId
 * @param {object} opts
 * @param {string} opts.lastEvent    Human label, e.g. 'asana.create:failed'.
 * @param {Error|string} opts.error  Underlying error.
 */
async function markFailed(submissionId, { lastEvent, error }) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return;
  const errorString = error instanceof Error ? error.message : String(error || '');
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      request.input('last_event', sql.NVarChar(200), lastEvent || 'failed');
      await request.query(`
        UPDATE dbo.form_submissions
        SET processing_status = 'failed',
            last_event = @last_event,
            last_event_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);
    });
    if (error instanceof Error) {
      trackException(error, { phase: 'markFailed', submissionId, lastEvent });
    }
    trackEvent('FormSubmission.Failed', { submissionId, lastEvent, error: errorString });
  } catch (err) {
    trackException(err, { phase: 'markFailed', submissionId });
  }
}

/**
 * Load a single submission for read APIs (GET /submissions/:id, retrigger).
 * Returns the row with `payload_json` parsed; returns `null` on miss/failure.
 */
async function loadSubmission(submissionId) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return null;
  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      return request.query('SELECT * FROM dbo.form_submissions WHERE id = @id');
    });
    const row = result?.recordset?.[0];
    if (!row) return null;
    let payload = null;
    let steps = [];
    try { payload = row.payload_json ? JSON.parse(row.payload_json) : null; } catch { payload = null; }
    try { steps = row.processing_steps_json ? JSON.parse(row.processing_steps_json) : []; } catch { steps = []; }
    return { ...row, payload, steps };
  } catch (err) {
    trackException(err, { phase: 'loadSubmission', submissionId });
    return null;
  }
}

/**
 * Bump retrigger metadata at the start of a retry attempt. Increments
 * `retrigger_count`, sets `last_retriggered_at`/`last_retriggered_by`,
 * and resets `processing_status` to 'processing' so the rail reflects the retry.
 *
 * @param {string|null} submissionId
 * @param {object} opts
 * @param {string} opts.triggeredBy  Initials of the user retriggering.
 */
async function bumpRetrigger(submissionId, { triggeredBy }) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return;
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      request.input('triggered_by', sql.NVarChar(16), triggeredBy || 'UNK');
      await request.query(`
        UPDATE dbo.form_submissions
        SET retrigger_count = retrigger_count + 1,
            last_retriggered_at = SYSUTCDATETIME(),
            last_retriggered_by = @triggered_by,
            processing_status = 'processing',
            last_event = 'retriggered',
            last_event_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);
    });
    trackEvent('FormSubmission.Retriggered', { submissionId, triggeredBy: triggeredBy || 'UNK' });
  } catch (err) {
    trackException(err, { phase: 'bumpRetrigger', submissionId });
  }
}

/**
 * Soft-delete (archive) a submission. Sets `archived_at` so the row drops
 * out of the rail but stays in the audit log.
 *
 * @param {string|null} submissionId
 * @returns {Promise<boolean>} true if a row was archived.
 */
async function archiveSubmission(submissionId) {
  const connStr = getConnStr();
  if (!submissionId || !connStr) return false;
  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, submissionId);
      return request.query(`
        UPDATE dbo.form_submissions
        SET archived_at = SYSUTCDATETIME()
        WHERE id = @id AND archived_at IS NULL;
        SELECT @@ROWCOUNT AS affected;
      `);
    });
    const affected = result?.recordset?.[0]?.affected || 0;
    if (affected > 0) {
      trackEvent('FormSubmission.Archived', { submissionId });
    }
    return affected > 0;
  } catch (err) {
    trackException(err, { phase: 'archiveSubmission', submissionId });
    return false;
  }
}

module.exports = {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
  loadSubmission,
  bumpRetrigger,
  archiveSubmission,
};
