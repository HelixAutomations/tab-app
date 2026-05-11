// server/operatorActions/attach.js
//
// Attach dispatcher for Operator Action artefacts (B1, Phase B).
//
// Targets implemented in Phase B.1:
//   - blob   → uploads artefact body to Azure Blob (`operator-action-results`
//              container by default) under `runs/<runId>/<filename>`.
//   - asana  → posts a comment on a task OR creates a task in a section,
//              using the per-user OAuth refresh path from server/utils/asana.js.
//
// Targets deferred to Phase B.2:
//   - matter      (NetDocuments + Clio link, needs helper extraction from
//                  server/routes/ccl-ops.js)
//   - prospect    (workspace blob writer for instructions workspace)
//   - time-entry  (Clio time-entry creation, used today by Call Centre filing)
//
// Every attempt — success or failure — writes one row to
// dbo.operator_action_attachments and emits App Insights telemetry.

const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { artefactBodyToBuffer, describeArtefact, VALID_TARGETS } = require('./artefactKinds');
const { getInstructionsPool } = require('./telemetry');
const { addCommentToTask, createTaskInSection, resolveAsanaAccessToken } = require('../utils/asanaTasks');

const RESULTS_BLOB_CONTAINER = process.env.OPERATOR_ACTIONS_BLOB_CONTAINER || 'operator-action-results';
const STORAGE_ACCOUNT_NAME = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_NAME || 'instructionfiles';

let blobClientCache = null;

function getResultsBlobClient() {
  if (blobClientCache) return blobClientCache;
  try {
    const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
    const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
    if (connectionString) {
      blobClientCache = BlobServiceClient.fromConnectionString(connectionString);
      return blobClientCache;
    }
    if (accountKey) {
      const cred = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
      blobClientCache = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, cred);
      return blobClientCache;
    }
    const { getCredential } = require('../utils/getSecret');
    const credential = getCredential();
    blobClientCache = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, credential);
    return blobClientCache;
  } catch (err) {
    console.warn('[operator-actions] Blob client init failed:', err.message);
    return null;
  }
}

function safeBlobName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchRun(runId) {
  const pool = await getInstructionsPool();
  const result = await pool.request()
    .input('id', sql.UniqueIdentifier, runId)
    .query(`
      SELECT id, action_id, status, summary, artefact_kind, artefact_blob_url, params_json
      FROM dbo.operator_action_runs WHERE id = @id
    `);
  return result.recordset[0] || null;
}

async function recordAttachment({
  runId,
  actionId,
  target,
  targetRef,
  targetMeta,
  attachedBy,
  durationMs,
  status,
  error,
}) {
  try {
    const pool = await getInstructionsPool();
    await pool.request()
      .input('id', sql.UniqueIdentifier, uuidv4())
      .input('runId', sql.UniqueIdentifier, runId)
      .input('actionId', sql.NVarChar(100), actionId)
      .input('target', sql.NVarChar(32), target)
      .input('targetRef', sql.NVarChar(400), targetRef || null)
      .input('targetMeta', sql.NVarChar(sql.MAX), targetMeta ? JSON.stringify(targetMeta) : null)
      .input('initials', sql.NVarChar(16), attachedBy?.initials || null)
      .input('email', sql.NVarChar(320), attachedBy?.email || null)
      .input('duration', sql.Int, durationMs ?? null)
      .input('status', sql.NVarChar(16), status)
      .input('error', sql.NVarChar(2000), error ? String(error).slice(0, 2000) : null)
      .query(`
        INSERT INTO dbo.operator_action_attachments
          (id, run_id, action_id, target, target_ref, target_meta_json,
           attached_by_initials, attached_by_email, duration_ms, status, error)
        VALUES (@id, @runId, @actionId, @target, @targetRef, @targetMeta,
                @initials, @email, @duration, @status, @error)
      `);
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'attach-audit', runId, target });
  }
}

// --- Target handlers ---------------------------------------------------------

async function attachToBlob({ run, artefact, body }) {
  const client = getResultsBlobClient();
  if (!client) {
    const err = new Error('Blob storage not configured');
    err.status = 503;
    throw err;
  }
  const desc = describeArtefact(artefact) || { extension: 'txt', mimeType: 'text/plain; charset=utf-8' };
  const buffer = artefactBodyToBuffer(artefact);
  const baseName = safeBlobName(body?.fileName || artefact?.downloadName || `${run.action_id}-${run.id}.${desc.extension}`);
  const blobName = `runs/${run.id}/${baseName}`;
  const containerClient = client.getContainerClient(RESULTS_BLOB_CONTAINER);
  await containerClient.createIfNotExists();
  const blockBlob = containerClient.getBlockBlobClient(blobName);
  await blockBlob.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: desc.mimeType },
  });
  return {
    targetRef: blobName,
    targetMeta: {
      container: RESULTS_BLOB_CONTAINER,
      url: blockBlob.url,
      sizeBytes: buffer.length,
      mimeType: desc.mimeType,
    },
  };
}

async function attachToAsana({ run, artefact, body, requestor }) {
  const accessToken = await resolveAsanaAccessToken({
    email: requestor?.email,
    initials: requestor?.initials,
  });
  if (!accessToken) {
    const err = new Error('Asana access token unavailable for this user');
    err.status = 401;
    throw err;
  }

  // Body shapes:
  //   { mode: 'comment', taskGid, prefix? }
  //   { mode: 'task',    sectionGid, name, workspaceGid? }
  const mode = body?.mode === 'task' ? 'task' : 'comment';
  const summaryLine = run.summary ? `[${run.action_id}] ${run.summary}` : `[${run.action_id}] result`;
  const artefactText = artefact ? artefactBodyToBuffer(artefact).toString('utf8') : '';
  // Cap at 9k to stay well clear of Asana's story/task limits.
  const artefactSnippet = artefactText.length > 9000 ? `${artefactText.slice(0, 9000)}\n…[truncated]` : artefactText;
  const compose = `${summaryLine}\n\n${artefactSnippet}`.trim();

  if (mode === 'comment') {
    if (!body?.taskGid) {
      const err = new Error('taskGid is required for Asana comment attach');
      err.status = 400;
      throw err;
    }
    const data = await addCommentToTask({ accessToken, taskGid: String(body.taskGid), text: compose });
    return {
      targetRef: String(body.taskGid),
      targetMeta: { mode: 'comment', storyGid: data?.gid || null, taskGid: String(body.taskGid) },
    };
  }

  if (!body?.sectionGid) {
    const err = new Error('sectionGid is required for Asana task attach');
    err.status = 400;
    throw err;
  }
  const taskName = body.name || `${run.action_id} — ${run.summary || run.id}`;
  const data = await createTaskInSection({
    accessToken,
    sectionGid: String(body.sectionGid),
    workspaceGid: body.workspaceGid ? String(body.workspaceGid) : undefined,
    name: taskName,
    notes: compose,
  });
  return {
    targetRef: data?.gid || null,
    targetMeta: { mode: 'task', taskGid: data?.gid || null, sectionGid: String(body.sectionGid) },
  };
}

const NOT_YET_TARGETS = new Set(['matter', 'prospect', 'time-entry']);

// --- Public entry point ------------------------------------------------------

async function attachRunArtefact({ runId, target, body, requestor, getArtefactForRun }) {
  if (!VALID_TARGETS.includes(target)) {
    return { ok: false, status: 400, response: { error: 'unknown-target', target, valid: VALID_TARGETS } };
  }
  if (NOT_YET_TARGETS.has(target)) {
    return {
      ok: false,
      status: 501,
      response: {
        error: 'wiring-pending-phase-b2',
        target,
        message: 'matter/prospect/time-entry attach lands in Phase B.2.',
      },
    };
  }

  const run = await fetchRun(runId).catch((err) => {
    trackException(err, { component: 'OperatorActions', phase: 'attach-fetch-run', runId });
    return null;
  });
  if (!run) {
    return { ok: false, status: 404, response: { error: 'run-not-found', runId } };
  }
  if (run.status !== 'completed') {
    return { ok: false, status: 409, response: { error: 'run-not-completed', status: run.status } };
  }

  // Re-derive the artefact. Phase A keeps artefacts in-memory only — Phase B.2
  // will hydrate from blob when MAX_INLINE_ARTEFACT_BYTES was exceeded.
  let artefact = null;
  if (typeof getArtefactForRun === 'function') {
    artefact = await getArtefactForRun(run);
  }
  if (!artefact) {
    return {
      ok: false,
      status: 410,
      response: {
        error: 'artefact-not-cached',
        message: 'Artefact body is no longer available in memory. Re-run the action and attach immediately, or wait for the Phase B.2 blob spill.',
      },
    };
  }

  trackEvent('OperatorActions.Attach.Started', {
    actionId: run.action_id,
    runId: String(runId),
    target,
    requestor: requestor?.initials || requestor?.email || 'unknown',
  });

  const start = Date.now();
  try {
    let outcome;
    if (target === 'blob') {
      outcome = await attachToBlob({ run, artefact, body });
    } else if (target === 'asana') {
      outcome = await attachToAsana({ run, artefact, body, requestor });
    } else {
      // Should be unreachable due to the early gates above.
      throw new Error(`Unhandled target: ${target}`);
    }
    const durationMs = Date.now() - start;
    await recordAttachment({
      runId,
      actionId: run.action_id,
      target,
      targetRef: outcome.targetRef,
      targetMeta: outcome.targetMeta,
      attachedBy: requestor,
      durationMs,
      status: 'completed',
    });
    trackEvent('OperatorActions.Attach.Completed', {
      actionId: run.action_id,
      runId: String(runId),
      target,
      requestor: requestor?.initials || requestor?.email || 'unknown',
      durationMs: String(durationMs),
    });
    trackMetric('OperatorActions.Attach.Duration', durationMs, { target, actionId: run.action_id });
    return {
      ok: true,
      status: 200,
      response: {
        ok: true,
        runId: String(runId),
        target,
        targetRef: outcome.targetRef,
        targetMeta: outcome.targetMeta,
        durationMs,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    trackException(err, { component: 'OperatorActions', phase: 'attach', target, runId: String(runId) });
    trackEvent('OperatorActions.Attach.Failed', {
      actionId: run.action_id,
      runId: String(runId),
      target,
      requestor: requestor?.initials || requestor?.email || 'unknown',
      error: err && err.message ? err.message : String(err),
    });
    await recordAttachment({
      runId,
      actionId: run.action_id,
      target,
      targetRef: null,
      targetMeta: null,
      attachedBy: requestor,
      durationMs,
      status: 'failed',
      error: err && err.message ? err.message : String(err),
    });
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return {
      ok: false,
      status,
      response: { error: 'attach-failed', target, message: err && err.message ? err.message : String(err) },
    };
  }
}

async function listAttachmentsForRun(runId) {
  const pool = await getInstructionsPool();
  const result = await pool.request()
    .input('runId', sql.UniqueIdentifier, runId)
    .query(`
      SELECT id, run_id, action_id, target, target_ref, target_meta_json,
             attached_by_initials, attached_by_email, attached_at, duration_ms, status, error
      FROM dbo.operator_action_attachments
      WHERE run_id = @runId
      ORDER BY attached_at DESC
    `);
  return result.recordset.map((row) => ({
    id: row.id,
    runId: row.run_id,
    actionId: row.action_id,
    target: row.target,
    targetRef: row.target_ref,
    targetMeta: row.target_meta_json ? safeJson(row.target_meta_json) : null,
    attachedBy: { initials: row.attached_by_initials, email: row.attached_by_email },
    attachedAt: row.attached_at,
    durationMs: row.duration_ms,
    status: row.status,
    error: row.error,
  }));
}

async function listAttachmentsForAction(actionId, limit = 25) {
  const pool = await getInstructionsPool();
  const result = await pool.request()
    .input('actionId', sql.NVarChar(100), actionId)
    .input('limit', sql.Int, Math.min(Math.max(limit, 1), 200))
    .query(`
      SELECT TOP (@limit)
        id, run_id, action_id, target, target_ref,
        attached_by_initials, attached_at, duration_ms, status, error
      FROM dbo.operator_action_attachments
      WHERE action_id = @actionId
      ORDER BY attached_at DESC
    `);
  return result.recordset.map((row) => ({
    id: row.id,
    runId: row.run_id,
    actionId: row.action_id,
    target: row.target,
    targetRef: row.target_ref,
    attachedBy: { initials: row.attached_by_initials },
    attachedAt: row.attached_at,
    durationMs: row.duration_ms,
    status: row.status,
    error: row.error,
  }));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = {
  attachRunArtefact,
  listAttachmentsForRun,
  listAttachmentsForAction,
};
