/**
 * Signals registry — server-side helper over dbo.signals.
 *
 * Unified intake ledger for the Suggestions Inbox in My Helix.
 *
 * Why this exists
 * ───────────────
 * The team has four separate intake surfaces (tech_problems, tech_ideas,
 * roadmap whiteboard, stash briefs). Plus the new agent footer envelope
 * (Health/Stash items). This module is the optional additive mirror that
 * any source can write into so a single Inbox UI can show everything.
 *
 * Failure model
 * ─────────────
 * Every helper here is *best effort*. If the write fails, we log + track
 * an exception but DO NOT throw. Caller flows (form submissions, agent
 * footer ingestion) must never fail because the registry was unavailable.
 *
 * Mirrors the cache pattern of hubTodoLog.js / aiProposalLog.js. Targets
 * the Instructions DB short-term; will likely move to a dedicated helper
 * DB once volume + access patterns are clearer.
 */

const { withRequest, sql } = require('./db');
const { trackEvent, trackException } = require('./appInsights');

const TABLE_CHECK_TTL_MS = 5 * 60 * 1000;
const tableCache = new Map();

function getConnStr() {
  return process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || null;
}

async function hasSignalsTable(connStr) {
  if (!connStr) return false;
  const cached = tableCache.get(connStr);
  const now = Date.now();
  if (cached && now - cached.checkedAt < TABLE_CHECK_TTL_MS) {
    return cached.exists;
  }
  try {
    const result = await withRequest(connStr, async (request) => request.query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.signals', N'U') IS NOT NULL THEN 1 ELSE 0 END AS exists_flag;
    `));
    const exists = Boolean(result?.recordset?.[0]?.exists_flag);
    tableCache.set(connStr, { exists, checkedAt: now });
    if (!exists) trackEvent('Signals.Table.Missing', {});
    return exists;
  } catch (err) {
    trackException(err, { phase: 'signalsLog.hasSignalsTable' });
    tableCache.set(connStr, { exists: false, checkedAt: now });
    return false;
  }
}

const KNOWN_SOURCES = new Set([
  'tech_problem',
  'tech_idea',
  'roadmap',
  'stash',
  'agent_health',
  'agent_stash',
]);

function clamp(value, max) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

/**
 * Record a signal. Returns `{ id }` on success, `{ id: null }` on no-op or
 * failure. Never throws.
 *
 * Required: source, title.
 * Optional: detail, fileRef, submittedBy, sessionId, severity,
 *           sourceRecordId, asanaTaskGid, metadata.
 */
async function recordSignal(input) {
  const connStr = getConnStr();
  if (!connStr) return { id: null };

  const source = clamp(input?.source, 40);
  const title = clamp(input?.title, 500);
  if (!source || !title) {
    return { id: null };
  }
  if (!KNOWN_SOURCES.has(source)) {
    trackEvent('Signals.UnknownSource', { source });
  }

  const exists = await hasSignalsTable(connStr);
  if (!exists) return { id: null };

  try {
    const metadataJson = input?.metadata
      ? JSON.stringify(input.metadata).slice(0, 8000)
      : null;

    const result = await withRequest(connStr, async (request) => {
      request
        .input('source', sql.NVarChar(40), source)
        .input('title', sql.NVarChar(500), title)
        .input('detail', sql.NVarChar(sql.MAX), clamp(input?.detail, 100000))
        .input('file_ref', sql.NVarChar(512), clamp(input?.fileRef, 512))
        .input('submitted_by', sql.NVarChar(64), clamp(input?.submittedBy, 64))
        .input('session_id', sql.NVarChar(128), clamp(input?.sessionId, 128))
        .input('severity', sql.NVarChar(16), clamp(input?.severity, 16))
        .input('source_record_id', sql.NVarChar(64), clamp(input?.sourceRecordId, 64))
        .input('asana_task_gid', sql.NVarChar(64), clamp(input?.asanaTaskGid, 64))
        .input('metadata_json', sql.NVarChar(sql.MAX), metadataJson);
      return request.query(`
        INSERT INTO dbo.signals (
          source, title, detail, file_ref, submitted_by, session_id,
          severity, source_record_id, asana_task_gid, metadata_json
        )
        OUTPUT inserted.id
        VALUES (
          @source, @title, @detail, @file_ref, @submitted_by, @session_id,
          @severity, @source_record_id, @asana_task_gid, @metadata_json
        );
      `);
    });
    const id = result?.recordset?.[0]?.id || null;
    trackEvent('Signals.Recorded', { source, hasFile: input?.fileRef ? 'true' : 'false' });
    return { id };
  } catch (err) {
    trackException(err, { phase: 'signalsLog.recordSignal', source });
    return { id: null };
  }
}

/**
 * List recent signals for the Inbox UI. Returns an array (possibly empty).
 * Never throws.
 */
async function listSignals({ status = 'open', limit = 50, source = null } = {}) {
  const connStr = getConnStr();
  if (!connStr) return [];
  const exists = await hasSignalsTable(connStr);
  if (!exists) return [];

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

  try {
    const result = await withRequest(connStr, async (request) => {
      request
        .input('status', sql.NVarChar(24), status)
        .input('source', sql.NVarChar(40), source)
        .input('limit', sql.Int, safeLimit);
      return request.query(`
        SELECT TOP (@limit)
          id, source, title, detail, file_ref, submitted_by, session_id,
          status, severity, promoted_to, asana_task_gid, source_record_id,
          metadata_json, created_at, updated_at
        FROM dbo.signals
        WHERE (@status IS NULL OR status = @status)
          AND (@source IS NULL OR source = @source)
        ORDER BY created_at DESC;
      `);
    });
    return result?.recordset || [];
  } catch (err) {
    trackException(err, { phase: 'signalsLog.listSignals' });
    return [];
  }
}

/**
 * Update status of a signal. Returns `true` on success.
 */
async function updateSignalStatus(id, nextStatus, { promotedTo = null } = {}) {
  const connStr = getConnStr();
  if (!connStr) return false;
  const exists = await hasSignalsTable(connStr);
  if (!exists) return false;

  try {
    await withRequest(connStr, async (request) => {
      request
        .input('id', sql.UniqueIdentifier, id)
        .input('status', sql.NVarChar(24), nextStatus)
        .input('promoted_to', sql.NVarChar(128), promotedTo);
      return request.query(`
        UPDATE dbo.signals
        SET status = @status,
            promoted_to = COALESCE(@promoted_to, promoted_to),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id;
      `);
    });
    trackEvent('Signals.StatusUpdated', { status: nextStatus });
    return true;
  } catch (err) {
    trackException(err, { phase: 'signalsLog.updateSignalStatus' });
    return false;
  }
}

module.exports = {
  recordSignal,
  listSignals,
  updateSignalStatus,
  KNOWN_SOURCES,
};
