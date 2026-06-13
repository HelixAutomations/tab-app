// server/routes/task-intake.js
//
// Hub-native task intake (Phase A of HUB_NATIVE_TASK_INTAKE_PIPELINE_PARALLEL_TO_TASKING_V3).
//
// Canonical ingress for every form/source that wants to create a Helix task.
// Writes one row into OpsTaskRequests + initial transition rows, returns
// { requestId }. The processor (Phase B) reads the row and drives the
// asana/clio/teams/email legs. This route does NOT call Asana directly.
//
// Routes:
//   POST /api/tasks/intake           submit a new request
//   GET  /api/tasks/intake/:id       read request + transitions + external refs
//
// Gate: dev preview only (LZ + AC). Same rule as system-tasks.js.
//
// Privacy: TaskDescription stays in SQL only. Telemetry payloads use
// structural metadata only (request id, source, workflow_type, status,
// duration). Never put TaskDescription/MatterLabel/free-text into telemetry.

const express = require('express');

const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { sql, getPool } = require('../utils/db');
const { attachTaskIntakeStream, broadcastTaskIntake } = require('../utils/taskIntakeStream');
const { processTaskRequest } = require('../processors/taskIntakeProcessor');
const {
  loadRequestBundle,
  findAsanaTaskGid,
  allowedActions,
  applyTransition,
  TRANSITION_ACTIONS,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
} = require('../utils/taskRequestState');
const { resolveAsanaAccessToken } = require('../utils/asana');
const { addCommentToTask, updateTaskFields, setTaskCompleted } = require('../utils/asanaTasks');
const { findTeamMember } = require('../utils/teamLookup');

const router = express.Router();

const DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);
const DEV_PREVIEW_EMAILS = new Set(['lz@helix-law.com', 'ac@helix-law.com']);

const ALLOWED_SOURCES = new Set([
  'system-bench',
  'cognito-tasking',
  'hub-form',
  'enquiry-processing',
  'instruct-pitch',
  'manual',
]);

const ALLOWED_WORKFLOW_TYPES = new Set([
  'individual',
  'team',
  'approval',
]);

const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function readActorInitials(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '')
    .toUpperCase()
    .trim();
}

function readActorEmail(req) {
  return String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '')
    .toLowerCase()
    .trim();
}

function isDevPreview(req) {
  return DEV_PREVIEW_INITIALS.has(readActorInitials(req)) || DEV_PREVIEW_EMAILS.has(readActorEmail(req));
}

function requireDevPreview(req, res, next) {
  if (!isDevPreview(req)) return res.status(403).json({ success: false, error: 'forbidden' });
  next();
}

function getInstructionsPool() {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not set');
  return getPool(conn);
}

function readActor(req) {
  return readActorInitials(req) || readActorEmail(req) || 'unknown';
}

function clampString(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function normaliseCsv(value, max) {
  if (value == null) return null;
  if (Array.isArray(value)) return clampString(value.filter(Boolean).join(','), max);
  return clampString(value, max);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseInteger(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function validatePayload(body) {
  const errors = [];
  const source = clampString(body?.source, 64);
  const workflowType = clampString(body?.workflow_type || body?.workflowType, 64);
  const taskName = clampString(body?.task_name || body?.taskName, 256);

  if (!source) errors.push('source is required');
  else if (!ALLOWED_SOURCES.has(source)) errors.push(`source must be one of: ${[...ALLOWED_SOURCES].join(', ')}`);
  if (!workflowType) errors.push('workflow_type is required');
  else if (!ALLOWED_WORKFLOW_TYPES.has(workflowType)) errors.push(`workflow_type must be one of: ${[...ALLOWED_WORKFLOW_TYPES].join(', ')}`);
  if (!taskName) errors.push('task_name is required');

  const priority = body?.priority ? clampString(body.priority, 32) : null;
  if (priority && !ALLOWED_PRIORITIES.has(priority)) errors.push(`priority must be one of: ${[...ALLOWED_PRIORITIES].join(', ')}`);

  return {
    errors,
    fields: {
      source,
      sourceExternalId: clampString(body?.source_external_id || body?.sourceExternalId, 128),
      workflowType,
      assignorInitials: clampString(body?.assignor_initials || body?.assignorInitials, 8)?.toUpperCase() || null,
      assignorFirstName: clampString(body?.assignor_first_name || body?.assignorFirstName, 64),
      assigneeFirstName: clampString(body?.assignee_first_name || body?.assigneeFirstName, 64),
      assigneeTeam: clampString(body?.assignee_team || body?.assigneeTeam, 64),
      assigneeLevel: clampString(body?.assignee_level || body?.assigneeLevel, 64),
      approverFirstName: clampString(body?.approver_first_name || body?.approverFirstName, 64),
      collaboratorsCsv: normaliseCsv(body?.collaborators ?? body?.collaboratorsCsv, 512),
      matterLabel: clampString(body?.matter_label || body?.matterLabel, 256),
      taskName,
      taskDescription: clampString(body?.task_description || body?.taskDescription, 8000),
      priority,
      dueDate: parseDate(body?.due_date || body?.dueDate),
      timeEstimateMinutes: parseInteger(body?.time_estimate_minutes || body?.timeEstimateMinutes),
      approvalRequired: Boolean(body?.approval_required || body?.approvalRequired),
    },
  };
}

function safeRequestSummary(row) {
  if (!row) return null;
  return {
    requestId: row.RequestId,
    source: row.Source,
    workflowType: row.WorkflowType,
    status: row.Status,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

// ─── POST /api/tasks/intake ───────────────────────────────────────────────

router.post('/intake', requireDevPreview, async (req, res) => {
  const actor = readActor(req);
  const startedAt = Date.now();

  const { errors, fields } = validatePayload(req.body || {});
  if (errors.length) {
    trackEvent('Tasks.Intake.Validation.Failed', { actor, errorCount: String(errors.length) });
    return res.status(400).json({ success: false, error: 'Invalid payload', details: errors });
  }

  const opName = `Tasks.Intake.${fields.source}`;
  trackEvent(`${opName}.Started`, { actor, workflowType: fields.workflowType });

  let pool;
  let transaction;
  try {
    pool = await getInstructionsPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const insertReq = new sql.Request(transaction);
    insertReq.input('source', sql.NVarChar(64), fields.source);
    insertReq.input('sourceExternalId', sql.NVarChar(128), fields.sourceExternalId);
    insertReq.input('workflowType', sql.NVarChar(64), fields.workflowType);
    insertReq.input('assignorInitials', sql.NVarChar(8), fields.assignorInitials);
    insertReq.input('assignorFirstName', sql.NVarChar(64), fields.assignorFirstName);
    insertReq.input('assigneeFirstName', sql.NVarChar(64), fields.assigneeFirstName);
    insertReq.input('assigneeTeam', sql.NVarChar(64), fields.assigneeTeam);
    insertReq.input('assigneeLevel', sql.NVarChar(64), fields.assigneeLevel);
    insertReq.input('approverFirstName', sql.NVarChar(64), fields.approverFirstName);
    insertReq.input('collaboratorsCsv', sql.NVarChar(512), fields.collaboratorsCsv);
    insertReq.input('matterLabel', sql.NVarChar(256), fields.matterLabel);
    insertReq.input('taskName', sql.NVarChar(256), fields.taskName);
    insertReq.input('taskDescription', sql.NVarChar(sql.MAX), fields.taskDescription);
    insertReq.input('priority', sql.NVarChar(32), fields.priority);
    insertReq.input('dueDate', sql.Date, fields.dueDate);
    insertReq.input('timeEstimateMinutes', sql.Int, fields.timeEstimateMinutes);
    insertReq.input('approvalRequired', sql.Bit, fields.approvalRequired ? 1 : 0);
    insertReq.input('createdBy', sql.NVarChar(64), actor);

    const insertResult = await insertReq.query(`
      DECLARE @newId UNIQUEIDENTIFIER = NEWID();
      INSERT INTO [dbo].[OpsTaskRequests] (
        RequestId, Source, SourceExternalId, WorkflowType,
        AssignorInitials, AssignorFirstName,
        AssigneeFirstName, AssigneeTeam, AssigneeLevel,
        ApproverFirstName, CollaboratorsCsv,
        MatterLabel, TaskName, TaskDescription,
        Priority, DueDate, TimeEstimateMinutes,
        ApprovalRequired, Status, CreatedBy
      )
      VALUES (
        @newId, @source, @sourceExternalId, @workflowType,
        @assignorInitials, @assignorFirstName,
        @assigneeFirstName, @assigneeTeam, @assigneeLevel,
        @approverFirstName, @collaboratorsCsv,
        @matterLabel, @taskName, @taskDescription,
        @priority, @dueDate, @timeEstimateMinutes,
        @approvalRequired, 'received', @createdBy
      );
      SELECT @newId AS RequestId;
    `);

    const requestId = insertResult.recordset?.[0]?.RequestId;
    if (!requestId) throw new Error('Insert did not return RequestId');

    const transitionReq = new sql.Request(transaction);
    transitionReq.input('requestId', sql.UniqueIdentifier, requestId);
    transitionReq.input('createdBy', sql.NVarChar(64), actor);
    transitionReq.input('durationMs', sql.Int, Date.now() - startedAt);
    await transitionReq.query(`
      INSERT INTO [dbo].[OpsTaskRequestTransitions] (RequestId, Leg, Outcome, Message, DurationMs, CreatedBy)
      VALUES (@requestId, 'intake', 'completed', 'request accepted', @durationMs, @createdBy);
    `);

    await transaction.commit();

    const durationMs = Date.now() - startedAt;
    trackMetric(`${opName}.Duration`, durationMs, { workflowType: fields.workflowType });
    trackEvent(`${opName}.Completed`, {
      actor,
      requestId,
      workflowType: fields.workflowType,
      durationMs: String(durationMs),
    });

    // Optional fire-and-forget processor dispatch. The bench passes
    // auto_process:true so the user gets immediate visual feedback while the
    // four legs (asana / clio / teams / email) run in the background and
    // stream progress via /api/tasks/intake/stream.
    const autoProcess = Boolean(req.body?.auto_process || req.body?.autoProcess);
    if (autoProcess) {
      trackEvent('Tasks.Intake.Process.Dispatched', { actor, requestId, trigger: 'auto_process' });
      broadcastTaskIntake({ requestId, event: 'queued' });
      setImmediate(() => {
        processTaskRequest({ requestId }).catch((err) => {
          trackException(err, { operation: 'Tasks.Intake.Process.Dispatch', requestId, actor });
        });
      });
    }

    return res.status(201).json({
      success: true,
      requestId,
      status: autoProcess ? 'queued' : 'received',
      autoProcess,
    });
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* ignore */ }
    }
    trackException(err, { operation: opName, actor });
    trackEvent(`${opName}.Failed`, { actor, error: err?.message || 'error' });
    return res.status(500).json({ success: false, error: err?.message || 'Intake failed' });
  }
});

// ─── GET /api/tasks/intake/stream ─────────────────────────────────────────
// SSE channel for live per-leg processor progress. Public path (EventSource
// cannot send custom headers, so this is registered in sseEndpoints.js to
// bypass auth + gzip); payloads carry structural metadata only.

router.get('/intake/stream', (req, res) => {
  attachTaskIntakeStream(req, res);
});

// ─── POST /api/tasks/intake/:requestId/process ────────────────────────────
// Kick off the processor for a previously-accepted request. Fire-and-forget:
// returns 202 immediately and progress is published to /intake/stream.

router.post('/intake/:requestId/process', requireDevPreview, async (req, res) => {
  const actor = readActor(req);
  const requestId = String(req.params?.requestId || '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) {
    return res.status(400).json({ success: false, error: 'Invalid requestId' });
  }
  trackEvent('Tasks.Intake.Process.Dispatched', { actor, requestId });
  broadcastTaskIntake({ requestId, event: 'queued' });
  setImmediate(() => {
    processTaskRequest({ requestId }).catch((err) => {
      trackException(err, { operation: 'Tasks.Intake.Process.Dispatch', requestId, actor });
    });
  });
  return res.status(202).json({ success: true, requestId, status: 'queued' });
});

// ─── GET /api/tasks/intake/:requestId ─────────────────────────────────────

router.get('/intake/:requestId', requireDevPreview, async (req, res) => {
  const actor = readActor(req);
  const requestId = String(req.params?.requestId || '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) {
    return res.status(400).json({ success: false, error: 'Invalid requestId' });
  }

  trackEvent('Tasks.Intake.Read.Started', { actor, requestId });
  const startedAt = Date.now();

  try {
    const pool = await getInstructionsPool();

    const reqRow = await pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query('SELECT * FROM [dbo].[OpsTaskRequests] WHERE RequestId = @requestId');
    if (!reqRow.recordset.length) {
      trackEvent('Tasks.Intake.Read.NotFound', { actor, requestId });
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const request = reqRow.recordset[0];

    const transitions = await pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT TransitionId, Leg, Outcome, Message, DurationMs, CreatedAt, CreatedBy
        FROM [dbo].[OpsTaskRequestTransitions]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, TransitionId ASC
      `);

    const externalRefs = await pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT RefId, System, RefType, RefValue, CreatedAt
        FROM [dbo].[OpsTaskRequestExternalRefs]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, RefId ASC
      `);

    const attachments = await pool.request()
      .input('requestId', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT AttachmentId, Name, ContentType, SizeBytes, ExternalUrl, CreatedAt
        FROM [dbo].[OpsTaskRequestAttachments]
        WHERE RequestId = @requestId
        ORDER BY CreatedAt ASC, AttachmentId ASC
      `);

    trackMetric('Tasks.Intake.Read.Duration', Date.now() - startedAt, {});
    trackEvent('Tasks.Intake.Read.Completed', {
      actor,
      requestId,
      ...safeRequestSummary(request),
      transitionCount: String(transitions.recordset.length),
    });

    const actions = allowedActions({ request, transitions: transitions.recordset });

    return res.json({
      success: true,
      request,
      transitions: transitions.recordset,
      externalRefs: externalRefs.recordset,
      attachments: attachments.recordset,
      allowedActions: actions,
    });
  } catch (err) {
    trackException(err, { operation: 'Tasks.Intake.Read', actor, requestId });
    trackEvent('Tasks.Intake.Read.Failed', { actor, requestId, error: err?.message || 'error' });
    return res.status(500).json({ success: false, error: err?.message || 'Read failed' });
  }
});

// ─── PATCH /api/tasks/intake/:requestId/transition ────────────────────────
// Phase C1: drive the request state machine. Body:
//   { action: 'claim'|'approve'|'decline'|'reassign'|'request_type_change',
//     reason?: string,
//     assigneeFirstName?: string,        // required for reassign
//     workflowType?: 'individual'|'team'|'approval' } // required for request_type_change
//
// Side effects per action (kept narrow in C1; leg retries deferred to C3):
//   claim:               Status -> 'claimed', AssigneeFirstName patched to claimer,
//                        Asana task reassigned to claimer + comment posted.
//   approve:             Status -> 'approved', Asana comment posted, task completed.
//   decline:             Status -> 'declined', Asana comment posted (task left open).
//   reassign:            AssigneeFirstName rewritten, Status -> 'reassigned',
//                        Asana assignee patched + comment posted.
//   request_type_change: WorkflowType rewritten, transition logged.
//                        Asana section policy deferred to Phase C+.
//
// Each side effect is best-effort: failure to update Asana writes an
// extra 'failed' transition row but does NOT roll back the status change
// (mirrors processor leg discipline). The drawer surfaces both rows.

router.patch('/intake/:requestId/transition', requireDevPreview, async (req, res) => {
  const actor = readActor(req);
  const requestId = String(req.params?.requestId || '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) {
    return res.status(400).json({ success: false, error: 'Invalid requestId' });
  }

  const action = String(req.body?.action || '').toLowerCase().trim();
  if (!TRANSITION_ACTIONS.has(action)) {
    return res.status(400).json({ success: false, error: `Unsupported action: ${action || '<missing>'}` });
  }
  if (action === 'retry_leg') {
    // Deferred to Phase C3 with proper idempotent per-leg runners.
    return res.status(501).json({ success: false, error: 'retry_leg not implemented in C1' });
  }

  const opName = `Tasks.Transition.${action}`;
  const startedAt = Date.now();
  trackEvent(`${opName}.Started`, { actor, requestId });

  try {
    const bundle = await loadRequestBundle(requestId);
    if (!bundle) {
      trackEvent(`${opName}.NotFound`, { actor, requestId });
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const { request, transitions, externalRefs } = bundle;
    const status = String(request.Status || '').toLowerCase();

    if (TERMINAL_STATUSES.has(status)) {
      return res.status(409).json({ success: false, error: `Request is ${status}; no further transitions allowed.` });
    }

    const available = new Set(allowedActions({ request, transitions }));
    if (!available.has(action)) {
      return res.status(409).json({
        success: false,
        error: `Action '${action}' not allowed for status='${status}', workflow='${request.WorkflowType}'.`,
        allowedActions: Array.from(available),
      });
    }

    // Resolve action-specific intent.
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1024) : null;
    let newStatus = null;
    let workflowTypePatch;
    let assigneeFirstNamePatch;
    let asanaSideEffect = null; // { kind: 'reassign'|'comment'|'complete'|'comment_only', assigneeFirstName?, comment }

    if (action === 'claim') {
      const claimer = (req.body?.assigneeFirstName || actor || '').toString().trim() || actor;
      assigneeFirstNamePatch = claimer.slice(0, 64);
      newStatus = 'claimed';
      asanaSideEffect = { kind: 'reassign', assigneeFirstName: claimer, comment: `Claimed by ${actor}${reason ? `: ${reason}` : ''}` };
    } else if (action === 'approve') {
      newStatus = 'approved';
      asanaSideEffect = { kind: 'complete', comment: `Approved by ${actor}${reason ? `: ${reason}` : ''}` };
    } else if (action === 'decline') {
      newStatus = 'declined';
      asanaSideEffect = { kind: 'comment_only', comment: `Declined by ${actor}${reason ? `: ${reason}` : ''}` };
    } else if (action === 'reassign') {
      const nextAssignee = String(req.body?.assigneeFirstName || '').trim();
      if (!nextAssignee) {
        return res.status(400).json({ success: false, error: 'assigneeFirstName is required for reassign' });
      }
      assigneeFirstNamePatch = nextAssignee.slice(0, 64);
      newStatus = 'reassigned';
      asanaSideEffect = { kind: 'reassign', assigneeFirstName: nextAssignee, comment: `Reassigned to ${nextAssignee} by ${actor}${reason ? `: ${reason}` : ''}` };
    } else if (action === 'request_type_change') {
      const nextType = String(req.body?.workflowType || '').toLowerCase().trim();
      if (!ALLOWED_WORKFLOW_TYPES.has(nextType)) {
        return res.status(400).json({ success: false, error: 'workflowType must be individual|team|approval' });
      }
      workflowTypePatch = nextType;
      // Status stays put for type changes in C1.
      asanaSideEffect = { kind: 'comment_only', comment: `Workflow changed to ${nextType} by ${actor}${reason ? `: ${reason}` : ''}` };
    }

    // Apply the state-machine update first so the drawer sees the new badge
    // even if Asana is unavailable.
    await applyTransition({
      requestId,
      action,
      outcome: 'completed',
      message: reason || null,
      durationMs: Date.now() - startedAt,
      actor,
      newStatus: newStatus || undefined,
      workflowTypePatch,
      assigneeFirstNamePatch,
    });

    // Best-effort Asana side effect.
    let asanaResult = { skipped: true, reason: 'no_asana_task' };
    const asanaTaskGid = findAsanaTaskGid(externalRefs);
    if (asanaTaskGid && asanaSideEffect) {
      asanaResult = await applyAsanaSideEffect({
        requestId,
        actor,
        asanaTaskGid,
        sideEffect: asanaSideEffect,
        assignorInitials: request.AssignorInitials,
      });
    }

    // Stream the transition so any open drawer flips instantly.
    broadcastTaskIntake({
      requestId,
      event: 'transition',
      leg: `transition:${action}`,
      outcome: 'completed',
      durationMs: Date.now() - startedAt,
      message: newStatus || workflowTypePatch || null,
      ref: { asana: asanaResult },
    });

    trackMetric(`${opName}.Duration`, Date.now() - startedAt, {});
    trackEvent(`${opName}.Completed`, {
      actor, requestId,
      newStatus: newStatus || '',
      asana: asanaResult?.ok ? 'ok' : (asanaResult?.skipped ? 'skipped' : 'failed'),
      durationMs: String(Date.now() - startedAt),
    });

    return res.json({
      success: true,
      requestId,
      action,
      newStatus: newStatus || status,
      asana: asanaResult,
    });
  } catch (err) {
    trackException(err, { operation: opName, actor, requestId });
    trackEvent(`${opName}.Failed`, { actor, requestId, error: err?.message || 'error' });
    return res.status(500).json({ success: false, error: err?.message || 'Transition failed' });
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────

// Apply the Asana mirror of a transition. Never throws; returns
// { ok, skipped, reason, error } so the caller can attach the outcome to
// SSE + telemetry without aborting the state change.
async function applyAsanaSideEffect({ requestId, actor, asanaTaskGid, sideEffect, assignorInitials }) {
  const initials = (assignorInitials || actor || 'LZ').toString().toUpperCase();
  try {
    const accessToken = await resolveAsanaAccessToken({ initials });
    if (!accessToken) return { skipped: true, reason: 'no_asana_token' };

    if (sideEffect.kind === 'reassign') {
      const member = await findTeamMember({ firstName: sideEffect.assigneeFirstName });
      if (!member?.asanaUserGid) {
        await addCommentToTask({ accessToken, taskGid: asanaTaskGid, text: sideEffect.comment });
        return { ok: true, skipped: true, reason: 'assignee_no_asana_gid', commented: true };
      }
      await updateTaskFields({ accessToken, taskGid: asanaTaskGid, fields: { assigneeGid: member.asanaUserGid } });
      await addCommentToTask({ accessToken, taskGid: asanaTaskGid, text: sideEffect.comment });
      return { ok: true, assigneeGid: member.asanaUserGid };
    }

    if (sideEffect.kind === 'complete') {
      await addCommentToTask({ accessToken, taskGid: asanaTaskGid, text: sideEffect.comment });
      await setTaskCompleted({ accessToken, taskGid: asanaTaskGid, completed: true });
      return { ok: true, completed: true };
    }

    if (sideEffect.kind === 'comment_only') {
      await addCommentToTask({ accessToken, taskGid: asanaTaskGid, text: sideEffect.comment });
      return { ok: true, commented: true };
    }

    return { skipped: true, reason: `unknown_side_effect:${sideEffect.kind}` };
  } catch (err) {
    trackException(err, { operation: 'Tasks.Transition.Asana', requestId, actor, kind: sideEffect.kind });
    return { ok: false, error: err?.message || 'asana_side_effect_failed' };
  }
}

module.exports = router;
