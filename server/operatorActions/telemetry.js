// server/operatorActions/telemetry.js
//
// Single seam wrapping every action invocation:
//   1. Validate params and tier.
//   2. Insert audit row with status='running'.
//   3. Run the action with App Insights start/complete/fail events.
//   4. Update audit row with summary, duration, status, error.
//
// Returns the result object the client lens renders.

const crypto = require('crypto');
const sql = require('mssql');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { redactParams } = require('./redact');
const {
  buildRedactionPolicy,
  callerCanRun,
  validateParams,
} = require('./registry');

const MAX_INLINE_ARTEFACT_BYTES = 64 * 1024;
const ARTEFACT_CACHE_LIMIT = 50;

// Bounded LRU of completed-run artefacts so Phase B attach can hydrate the
// body without re-running the action. Map preserves insertion order so we
// can evict the oldest entry once we hit the cap. Process-memory only —
// Phase B.2 will swap this for a blob-backed read-through.
const runArtefactCache = new Map();

function cacheArtefact(runId, artefact) {
  if (!runId || !artefact) return;
  if (runArtefactCache.has(runId)) {
    runArtefactCache.delete(runId);
  } else if (runArtefactCache.size >= ARTEFACT_CACHE_LIMIT) {
    const oldest = runArtefactCache.keys().next().value;
    if (oldest) runArtefactCache.delete(oldest);
  }
  runArtefactCache.set(runId, artefact);
}

function getCachedArtefact(runId) {
  return runArtefactCache.get(runId) || null;
}

function computeArtefactSize(artefact) {
  if (!artefact) return null;
  try {
    const body = artefact.body;
    if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
    if (body && typeof body === 'object') return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return null;
  }
  return null;
}

function safeSummary(value) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : String(value);
  return text.length > 1990 ? `${text.slice(0, 1987)}...` : text;
}

function safeError(err) {
  if (!err) return null;
  const message = (err && err.message) ? String(err.message) : String(err);
  return message.length > 1990 ? `${message.slice(0, 1987)}...` : message;
}

async function getInstructionsPool() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  }
  return sql.connect(connStr);
}

async function getCoreDataPool() {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('SQL_CONNECTION_STRING not configured');
  }
  // mssql.connect caches by connection string at the module level, so this is
  // safe to call repeatedly per action without leaking pools.
  return sql.connect(connStr);
}

async function insertAuditRow(pool, row) {
  await pool.request()
    .input('id', sql.UniqueIdentifier, row.id)
    .input('actionId', sql.NVarChar(100), row.actionId)
    .input('initials', sql.NVarChar(16), row.initials || null)
    .input('email', sql.NVarChar(320), row.email || null)
    .input('name', sql.NVarChar(200), row.name || null)
    .input('tier', sql.NVarChar(32), row.tier)
    .input('paramsJson', sql.NVarChar(sql.MAX), row.paramsJson || null)
    .input('dryRun', sql.Bit, row.dryRun ? 1 : 0)
    .input('telemetryEventId', sql.NVarChar(100), row.telemetryEventId)
    .query(`
      INSERT INTO dbo.operator_action_runs
        (id, action_id, requestor_initials, requestor_email, requestor_name,
         tier, params_json, dry_run, status, telemetry_event_id)
      VALUES
        (@id, @actionId, @initials, @email, @name,
         @tier, @paramsJson, @dryRun, 'running', @telemetryEventId)
    `);
}

async function finaliseAuditRow(pool, id, patch) {
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('finishedAt', sql.DateTimeOffset, new Date())
    .input('durationMs', sql.Int, patch.durationMs ?? null)
    .input('status', sql.NVarChar(16), patch.status)
    .input('summary', sql.NVarChar(2000), patch.summary || null)
    .input('artefactKind', sql.NVarChar(32), patch.artefactKind || null)
    .input('artefactSizeBytes', sql.Int, patch.artefactSizeBytes ?? null)
    .input('error', sql.NVarChar(2000), patch.error || null)
    .query(`
      UPDATE dbo.operator_action_runs
         SET finished_at = @finishedAt,
             duration_ms = @durationMs,
             status = @status,
             summary = @summary,
             artefact_kind = @artefactKind,
             artefact_size_bytes = @artefactSizeBytes,
             error = @error
       WHERE id = @id
    `);
}

/**
 * Run an action end-to-end. Returns:
 *   { ok: boolean, status: number, runId, response }
 * where response is the JSON body to send back to the client.
 */
async function runAction({ action, rawParams, dryRun, requestor }) {
  // 1. Tier gate.
  if (!callerCanRun(action, requestor.tier)) {
    return {
      ok: false,
      status: 403,
      runId: null,
      response: { error: 'forbidden', reason: 'tier-gate', actionId: action.id },
    };
  }

  // 2. Param validation.
  const validation = validateParams(action, rawParams, { dryRun: Boolean(dryRun) });
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      runId: null,
      response: { error: 'invalid-params', errors: validation.errors },
    };
  }
  const params = validation.cleaned;

  // 3. Dry-run support gate.
  if (dryRun && !action.dryRunSupported) {
    return {
      ok: false,
      status: 400,
      runId: null,
      response: { error: 'dry-run-not-supported', actionId: action.id },
    };
  }

  // 4. Build audit row.
  const id = crypto.randomUUID();
  const telemetryEventId = id;
  const policy = buildRedactionPolicy(action);
  const redactedParams = redactParams(params, policy);
  const paramsJson = JSON.stringify(redactedParams);

  let pool;
  try {
    pool = await getInstructionsPool();
  } catch (err) {
    // If the audit DB is unreachable we refuse the run rather than silently
    // executing without an audit trail. Phase A acceptance requires an audit row.
    trackException(err, { component: 'OperatorActions', phase: 'audit-pool', actionId: action.id });
    return {
      ok: false,
      status: 503,
      runId: null,
      response: { error: 'audit-unavailable' },
    };
  }

  try {
    await insertAuditRow(pool, {
      id,
      actionId: action.id,
      initials: requestor.initials,
      email: requestor.email,
      name: requestor.name,
      tier: requestor.tier,
      paramsJson,
      dryRun: Boolean(dryRun),
      telemetryEventId,
    });
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'audit-insert', actionId: action.id });
    return {
      ok: false,
      status: 503,
      runId: null,
      response: { error: 'audit-write-failed' },
    };
  }

  // 5. Telemetry: started.
  const startedAt = Date.now();
  trackEvent('OperatorActions.Run.Started', {
    actionId: action.id,
    requestor: requestor.initials || requestor.email || 'unknown',
    tier: requestor.tier,
    dryRun: Boolean(dryRun),
    runId: id,
  });

  // 6. Run.
  let result;
  try {
    result = await action.run({
      params,
      dryRun: Boolean(dryRun),
      requestor,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    trackException(err, {
      component: 'OperatorActions',
      phase: 'run',
      actionId: action.id,
      runId: id,
    });
    trackEvent('OperatorActions.Run.Failed', {
      actionId: action.id,
      requestor: requestor.initials || requestor.email || 'unknown',
      runId: id,
      error: err && err.message ? err.message : String(err),
      durationMs,
    });
    try {
      await finaliseAuditRow(pool, id, {
        durationMs,
        status: 'failed',
        summary: null,
        error: safeError(err),
      });
    } catch {
      /* swallow secondary failure */
    }
    return {
      ok: false,
      status: 500,
      runId: id,
      response: {
        error: 'action-failed',
        runId: id,
        message: err && err.message ? err.message : 'Action threw an error',
      },
    };
  }

  // 7. Finalise.
  const durationMs = Date.now() - startedAt;
  const artefact = result && result.artefact ? result.artefact : null;
  const artefactSize = computeArtefactSize(artefact);
  const summary = safeSummary(result && result.summary);
  const status = dryRun ? 'dry-run' : 'completed';

  try {
    await finaliseAuditRow(pool, id, {
      durationMs,
      status,
      summary,
      artefactKind: artefact ? artefact.kind || null : null,
      artefactSizeBytes: artefactSize,
      error: null,
    });
  } catch (err) {
    trackException(err, { component: 'OperatorActions', phase: 'audit-finalise', actionId: action.id, runId: id });
  }

  trackEvent('OperatorActions.Run.Completed', {
    actionId: action.id,
    requestor: requestor.initials || requestor.email || 'unknown',
    tier: requestor.tier,
    dryRun: Boolean(dryRun),
    runId: id,
    durationMs,
  });
  trackMetric('OperatorActions.Run.Duration', durationMs, { actionId: action.id });

  // 8. Reject artefacts that overshoot the inline cap. Phase A keeps it
  //    simple and surfaces a warning; Phase B will spill to blob.
  const warnings = Array.isArray(result.warnings) ? [...result.warnings] : [];
  if (artefactSize && artefactSize > MAX_INLINE_ARTEFACT_BYTES) {
    warnings.push(`Artefact exceeds inline cap (${artefactSize} bytes > ${MAX_INLINE_ARTEFACT_BYTES}). Phase B blob storage not yet wired.`);
  }

  // 9. Cache artefact in memory so Phase B attach can hydrate without
  //    re-running. Bounded LRU; Phase B.2 will spill to blob for durability.
  if (!dryRun && artefact) {
    cacheArtefact(id, artefact);
  }

  return {
    ok: true,
    status: 200,
    runId: id,
    response: {
      ok: true,
      runId: id,
      actionId: action.id,
      durationMs,
      dryRun: Boolean(dryRun),
      summary,
      artefact,
      warnings,
    },
  };
}

module.exports = {
  runAction,
  getInstructionsPool,
  getCoreDataPool,
  getCachedArtefact,
  MAX_INLINE_ARTEFACT_BYTES,
};
