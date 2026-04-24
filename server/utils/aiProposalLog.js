/**
 * AI proposal audit log — shared across every "AI suggests, user disposes"
 * surface in Helix Hub.
 *
 * Forms-AI-Composer Step 1.
 *
 * Why this exists
 * ───────────────
 * Multiple upcoming surfaces will let the AI propose an action the user can
 * accept, refine, or discard:
 *   - Forms Composer (free-text query → pre-filled form submission)
 *   - Future ⌘K command bar
 *   - Future AI-drafted internal emails / tasks
 *
 * Rather than a per-surface table for each one, every surface writes to the
 * single `dbo.ai_proposals` table (created by
 * `scripts/migrate-add-ai-proposals.mjs`). Acceptance rate, prompt iteration,
 * and cross-surface analytics all become trivial as a result.
 *
 * CCL stays on its own dedicated tables (CclDrafts / CclAiTraces) — its
 * lifecycle is more elaborate (draft → pressure-tested → approved → uploaded)
 * and the existing surface works.
 *
 * Failure model
 * ─────────────
 * Every helper here is *best effort*. If the audit log write fails (DB blip,
 * table missing in dev, …) the helper logs + tracks an exception but DOES
 * NOT throw. The user-facing AI flow must never fail because the audit log
 * was unavailable.
 */

const { withRequest } = require('./db');
const { trackEvent, trackException } = require('./appInsights');

/**
 * Resolve the Helix Operations Platform DB connection string at call time.
 *
 * Two-stage gate:
 *   1. OPS_PLATFORM_ENABLED must be 'true' (repo-level kill switch — set to
 *      'false' in .env to disable all writes from the Hub instantly without
 *      touching Azure).
 *   2. OPS_SQL_CONNECTION_STRING must be set (loaded from Key Vault at
 *      boot or wired to the linked Key Vault reference in App Service).
 *
 * Returns null if either gate fails. Helpers tolerate null and degrade
 * silently (audit log goes dark; user-facing flows are unaffected).
 */
function getConnStr() {
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() !== 'true') {
    return null;
  }
  return process.env.OPS_SQL_CONNECTION_STRING || null;
}

/**
 * @typedef {'pending'|'accepted'|'discarded'|'failed'|'unsupported'} ProposalOutcome
 * @typedef {'send-now'|'review-and-send'} ProposalAcceptMode
 */

/**
 * Build a compact "high:3,med:2,low:1" summary from a proposal's field
 * confidence values. Returns null if there are no confidences to summarise.
 *
 * @param {Array<{confidence?: string}>} fields
 * @returns {string|null}
 */
function summariseConfidence(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const counts = { high: 0, med: 0, low: 0, unknown: 0 };
  for (const f of fields) {
    const c = String(f?.confidence || '').toLowerCase();
    if (c === 'high') counts.high += 1;
    else if (c === 'med' || c === 'medium') counts.med += 1;
    else if (c === 'low') counts.low += 1;
    else counts.unknown += 1;
  }
  const parts = [];
  if (counts.high) parts.push(`high:${counts.high}`);
  if (counts.med) parts.push(`med:${counts.med}`);
  if (counts.low) parts.push(`low:${counts.low}`);
  if (counts.unknown) parts.push(`unknown:${counts.unknown}`);
  return parts.join(',') || null;
}

/**
 * Record a new AI proposal at the moment the LLM returns. Returns the row's
 * id so the surface can later mark it accepted / discarded / failed.
 *
 * Always returns a string id on success, or `null` if persistence failed.
 * The caller MUST tolerate `null` and continue serving the user.
 *
 * @param {object} args
 * @param {string} args.surface           e.g. 'forms-composer'
 * @param {string} args.createdBy         Initials of the requester.
 * @param {string} args.query             The user's free-text input.
 * @param {object} args.proposal          Full LLM response (will be stringified).
 * @param {string} [args.targetKind]      e.g. 'form:tech-problem'
 * @param {string} [args.confidenceSummary]
 *                                        Pre-computed summary; if omitted and
 *                                        `proposal.fields` is an array, one is
 *                                        derived via `summariseConfidence`.
 * @param {string} [args.model]           Model id, e.g. 'gpt-5.1'
 * @param {number} [args.durationMs]      LLM call duration.
 * @returns {Promise<string|null>}
 */
async function recordProposal({
  surface,
  createdBy,
  query,
  proposal,
  targetKind = null,
  confidenceSummary = null,
  model = null,
  durationMs = null,
}) {
  const connStr = getConnStr();
  if (!connStr) return null;
  if (!surface || !createdBy || typeof query !== 'string') {
    trackException(new Error('aiProposalLog.recordProposal missing required args'), {
      surface: String(surface || ''),
      createdBy: String(createdBy || ''),
      hasQuery: String(typeof query === 'string'),
    });
    return null;
  }

  const proposalJson = JSON.stringify(proposal ?? {});
  const summary =
    confidenceSummary || summariseConfidence(Array.isArray(proposal?.fields) ? proposal.fields : []);

  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('surface', sql.NVarChar(32), surface);
      request.input('created_by', sql.NVarChar(16), createdBy);
      request.input('query', sql.NVarChar(2000), query.slice(0, 2000));
      request.input('target_kind', sql.NVarChar(64), targetKind);
      request.input('proposal_json', sql.NVarChar(sql.MAX), proposalJson);
      request.input('confidence_summary', sql.NVarChar(64), summary);
      request.input('model', sql.NVarChar(64), model);
      request.input('duration_ms', sql.Int, durationMs);
      return request.query(`
        INSERT INTO dbo.ai_proposals
          (created_by, surface, query, target_kind, proposal_json,
           confidence_summary, model, duration_ms)
        OUTPUT INSERTED.id
        VALUES
          (@created_by, @surface, @query, @target_kind, @proposal_json,
           @confidence_summary, @model, @duration_ms);
      `);
    });
    const id = result?.recordset?.[0]?.id || null;
    trackEvent('AiProposal.Recorded', {
      proposalId: id,
      surface,
      createdBy,
      targetKind,
      model,
    });
    return id;
  } catch (err) {
    trackException(err, { phase: 'recordProposal', surface, createdBy });
    return null;
  }
}

/**
 * Mark a proposal as accepted by the user.
 *
 * @param {string|null} proposalId
 * @param {object} opts
 * @param {string} [opts.outcomeRef]   External id resulting from acceptance,
 *                                     e.g. the new `form_submissions.id`.
 * @param {ProposalAcceptMode} [opts.mode]
 */
async function markAccepted(proposalId, { outcomeRef = null, mode = null } = {}) {
  const connStr = getConnStr();
  if (!proposalId || !connStr) return;
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, proposalId);
      request.input('outcome_ref', sql.NVarChar(128), outcomeRef);
      request.input('outcome_mode', sql.NVarChar(16), mode);
      await request.query(`
        UPDATE dbo.ai_proposals
        SET outcome      = 'accepted',
            outcome_at   = SYSUTCDATETIME(),
            outcome_ref  = @outcome_ref,
            outcome_mode = @outcome_mode
        WHERE id = @id
          AND outcome = 'pending';
      `);
    });
    trackEvent('AiProposal.Accepted', { proposalId, outcomeRef, mode });
  } catch (err) {
    trackException(err, { phase: 'markAccepted', proposalId });
  }
}

/**
 * Mark a proposal as discarded by the user.
 *
 * @param {string|null} proposalId
 */
async function markDiscarded(proposalId) {
  const connStr = getConnStr();
  if (!proposalId || !connStr) return;
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, proposalId);
      await request.query(`
        UPDATE dbo.ai_proposals
        SET outcome    = 'discarded',
            outcome_at = SYSUTCDATETIME()
        WHERE id = @id
          AND outcome = 'pending';
      `);
    });
    trackEvent('AiProposal.Discarded', { proposalId });
  } catch (err) {
    trackException(err, { phase: 'markDiscarded', proposalId });
  }
}

/**
 * Mark a proposal as failed (LLM error, validation failure, downstream
 * 5xx, etc.). Records the error message for later replay.
 *
 * @param {string|null} proposalId
 * @param {object} opts
 * @param {Error|string} opts.error
 */
async function markFailed(proposalId, { error }) {
  const connStr = getConnStr();
  if (!proposalId || !connStr) return;
  const errorString = (error instanceof Error ? error.message : String(error || '')).slice(0, 1000);
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, proposalId);
      request.input('error_message', sql.NVarChar(1000), errorString);
      await request.query(`
        UPDATE dbo.ai_proposals
        SET outcome       = 'failed',
            outcome_at    = SYSUTCDATETIME(),
            error_message = @error_message
        WHERE id = @id;
      `);
    });
    if (error instanceof Error) {
      trackException(error, { phase: 'markFailed', proposalId });
    }
    trackEvent('AiProposal.Failed', { proposalId, error: errorString });
  } catch (err) {
    trackException(err, { phase: 'markFailed', proposalId });
  }
}

/**
 * Mark a proposal as unsupported — used when the LLM picked a target the
 * surface doesn't yet handle (e.g. Forms Composer pilot only handles 4
 * forms; if the LLM picks a 5th we still log the row to inform pilot
 * expansion, but mark it unsupported so it doesn't pollute accept-rate).
 *
 * @param {string|null} proposalId
 * @param {object} [opts]
 * @param {string} [opts.reason]   Short identifier, e.g. 'form_not_in_pilot'.
 */
async function markUnsupported(proposalId, { reason = null } = {}) {
  const connStr = getConnStr();
  if (!proposalId || !connStr) return;
  try {
    await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, proposalId);
      request.input('error_message', sql.NVarChar(1000), reason ? `unsupported:${reason}` : null);
      await request.query(`
        UPDATE dbo.ai_proposals
        SET outcome       = 'unsupported',
            outcome_at    = SYSUTCDATETIME(),
            error_message = @error_message
        WHERE id = @id
          AND outcome = 'pending';
      `);
    });
    trackEvent('AiProposal.Unsupported', { proposalId, reason });
  } catch (err) {
    trackException(err, { phase: 'markUnsupported', proposalId });
  }
}

/**
 * Load a single proposal for read APIs (surface refresh, retry, debug).
 * Returns the row with `proposal_json` parsed; returns `null` on miss/failure.
 *
 * @param {string|null} proposalId
 */
async function loadProposal(proposalId) {
  const connStr = getConnStr();
  if (!proposalId || !connStr) return null;
  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, proposalId);
      return request.query('SELECT * FROM dbo.ai_proposals WHERE id = @id');
    });
    const row = result?.recordset?.[0];
    if (!row) return null;
    let proposal = null;
    try {
      proposal = row.proposal_json ? JSON.parse(row.proposal_json) : null;
    } catch {
      proposal = null;
    }
    return { ...row, proposal };
  } catch (err) {
    trackException(err, { phase: 'loadProposal', proposalId });
    return null;
  }
}

module.exports = {
  recordProposal,
  markAccepted,
  markDiscarded,
  markFailed,
  markUnsupported,
  loadProposal,
  // Exposed for tests / direct callers that want to compute the summary
  // independently of the persistence path.
  summariseConfidence,
};
