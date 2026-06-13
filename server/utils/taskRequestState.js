// server/utils/taskRequestState.js
//
// Phase C of HUB_NATIVE_TASK_INTAKE_PIPELINE_PARALLEL_TO_TASKING_V3.
//
// Read + transition helpers for OpsTaskRequests state machine. Pure data
// helpers here; side-effects (Asana mutations, Teams cards, processor leg
// retries) are wired by the transition route and the processor itself.
//
// Allowed actions:
//   claim                 unassigned -> claimed (assignee picks up a team task)
//   approve               processed | partial -> approved
//   decline               processed | partial -> declined
//   reassign              any active status; rewrites AssigneeFirstName + Asana assignee
//   request_type_change   rewrites WorkflowType (state-machine only in C1; section policy deferred)
//   retry_leg             re-runs a single processor leg; status unchanged on dispatch
//
// Status vocabulary (kept narrow; everything else is "noise" so the bench
// drawer can render a stable badge ladder):
//   received | processing | processed | partial | failed
//   claimed | reassigned | approved | declined

const { trackEvent, trackException } = require('./appInsights');
const { sql, getPool } = require('./db');

const TRANSITION_ACTOR_FALLBACK = 'task-intake-transition';

function getInstructionsPool() {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not set');
  return getPool(conn);
}

const ACTIVE_STATUSES = new Set([
  'received', 'processing', 'processed', 'partial', 'claimed', 'reassigned',
]);

const TERMINAL_STATUSES = new Set(['approved', 'declined', 'failed']);

const TRANSITION_ACTIONS = new Set([
  'claim', 'approve', 'decline', 'reassign', 'request_type_change', 'retry_leg',
]);

const RETRYABLE_LEGS = new Set(['asana', 'clio', 'teams', 'email']);

// Compute the actions a bench drawer should expose for a given request +
// transition history. Pure function; the route enforces dev-preview, the
// processor enforces side-effect ordering, and this function answers
// "which buttons should be live".
function allowedActions({ request, transitions }) {
  if (!request) return [];
  const status = String(request.Status || '').toLowerCase();
  const workflowType = String(request.WorkflowType || '').toLowerCase();
  const actions = new Set();

  // Reassign + retry available whenever the request is still mutable.
  if (ACTIVE_STATUSES.has(status)) {
    actions.add('reassign');
    actions.add('request_type_change');
  }

  // Claim only makes sense for team workflow without an assignee yet.
  if (workflowType === 'team' && !request.AssigneeFirstName && ACTIVE_STATUSES.has(status)) {
    actions.add('claim');
  }

  // Approval workflow gets approve/decline once processing has landed.
  if (workflowType === 'approval' && (status === 'processed' || status === 'partial')) {
    actions.add('approve');
    actions.add('decline');
  }

  // Retry is per-leg; surface it whenever any leg has a 'failed' transition
  // and the request is not in a terminal state.
  if (!TERMINAL_STATUSES.has(status) && Array.isArray(transitions)) {
    const failedLegs = new Set(
      transitions
        .filter((t) => String(t.Outcome || '').toLowerCase() === 'failed' && RETRYABLE_LEGS.has(String(t.Leg || '').toLowerCase()))
        .map((t) => String(t.Leg).toLowerCase()),
    );
    if (failedLegs.size > 0) actions.add('retry_leg');
  }

  return Array.from(actions);
}

// Load the full request bundle (header + transitions + external refs +
// attachments) in one trip. Used by GET /intake/:id and the transition
// route to figure out side effects.
async function loadRequestBundle(requestId) {
  const pool = await getInstructionsPool();
  const reqRow = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query('SELECT * FROM [dbo].[OpsTaskRequests] WHERE RequestId = @requestId');
  const request = reqRow.recordset?.[0] || null;
  if (!request) return null;

  const [transitions, externalRefs, attachments] = await Promise.all([
    pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT TransitionId, Leg, Outcome, Message, DurationMs, CreatedAt, CreatedBy
        FROM [dbo].[OpsTaskRequestTransitions]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, TransitionId ASC
      `),
    pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT RefId, System, RefType, RefValue, CreatedAt
        FROM [dbo].[OpsTaskRequestExternalRefs]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, RefId ASC
      `),
    pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT AttachmentId, Name, ContentType, SizeBytes, ExternalUrl, CreatedAt
        FROM [dbo].[OpsTaskRequestAttachments]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, AttachmentId ASC
      `),
  ]);

  return {
    request,
    transitions: transitions.recordset,
    externalRefs: externalRefs.recordset,
    attachments: attachments.recordset,
  };
}

// Look up the Asana task gid this request produced. Returns null if the
// asana leg has not yet written its ref (or skipped).
function findAsanaTaskGid(externalRefs) {
  if (!Array.isArray(externalRefs)) return null;
  const row = externalRefs.find((r) => r.System === 'asana' && r.RefType === 'task_gid');
  return row?.RefValue || null;
}

function findAsanaProjectGid(externalRefs) {
  if (!Array.isArray(externalRefs)) return null;
  const row = externalRefs.find((r) => r.System === 'asana' && r.RefType === 'project_gid');
  return row?.RefValue || null;
}

// Apply a status change + transition row in a single SQL trip. Caller is
// expected to have already validated the action against `allowedActions`.
async function applyTransition({
  requestId,
  action,
  outcome = 'completed',
  message,
  durationMs,
  actor,
  newStatus,
  workflowTypePatch,
  assigneeFirstNamePatch,
}) {
  const pool = await getInstructionsPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const headerReq = new sql.Request(tx);
    headerReq.input('requestId', sql.UniqueIdentifier, requestId);
    const sets = ['UpdatedAt = SYSUTCDATETIME()'];
    if (newStatus) {
      headerReq.input('newStatus', sql.NVarChar(32), newStatus);
      sets.push('Status = @newStatus');
    }
    if (workflowTypePatch) {
      headerReq.input('workflowType', sql.NVarChar(64), workflowTypePatch);
      sets.push('WorkflowType = @workflowType');
    }
    if (assigneeFirstNamePatch !== undefined) {
      headerReq.input('assigneeFirstName', sql.NVarChar(64), assigneeFirstNamePatch);
      sets.push('AssigneeFirstName = @assigneeFirstName');
    }
    await headerReq.query(`UPDATE [dbo].[OpsTaskRequests] SET ${sets.join(', ')} WHERE RequestId = @requestId;`);

    const transitionReq = new sql.Request(tx);
    transitionReq.input('requestId', sql.UniqueIdentifier, requestId);
    transitionReq.input('leg', sql.NVarChar(32), `transition:${action}`);
    transitionReq.input('outcome', sql.NVarChar(16), outcome);
    transitionReq.input('message', sql.NVarChar(1024), message ? String(message).slice(0, 1024) : null);
    transitionReq.input('durationMs', sql.Int, Number.isFinite(durationMs) ? Math.round(durationMs) : null);
    transitionReq.input('createdBy', sql.NVarChar(64), actor || TRANSITION_ACTOR_FALLBACK);
    await transitionReq.query(`
      INSERT INTO [dbo].[OpsTaskRequestTransitions] (RequestId, Leg, Outcome, Message, DurationMs, CreatedBy)
      VALUES (@requestId, @leg, @outcome, @message, @durationMs, @createdBy);
    `);

    await tx.commit();
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* ignore */ }
    trackException(err, { operation: 'TaskRequestState.ApplyTransition', requestId, action });
    throw err;
  }
  trackEvent('TaskRequestState.Transition.Applied', {
    requestId, action, outcome, status: newStatus || '',
  });
}

module.exports = {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  TRANSITION_ACTIONS,
  RETRYABLE_LEGS,
  allowedActions,
  loadRequestBundle,
  findAsanaTaskGid,
  findAsanaProjectGid,
  applyTransition,
};
