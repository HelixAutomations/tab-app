// server/processors/taskIntakeProcessor.js
//
// Hub-native task intake processor (Phase B of HUB_NATIVE_TASK_INTAKE_PIPELINE_PARALLEL_TO_TASKING_V3).
//
// Picks up a task_request row that the intake route wrote and fans it out:
//   1. team_lookup  - resolve assignee / assignor / approver from helix-core-data.team
//   2. asana        - create the Asana task in the assignor's personal project
//   3. clio         - if matter_label present, create a task on the matter
//   4. teams        - DM the assignee an Adaptive Card
//   5. email        - send the assignee a notification email
//   6. finalise     - flip status to 'processed' (or 'partial' if any leg errored)
//
// Each leg writes its own OpsTaskRequestTransitions row + external ref row
// + emits a Tasks.Processor.<Leg>.<Outcome> telemetry event + broadcasts an
// SSE event so the bench updates live. Legs are independent: a Clio failure
// does NOT block the Teams or email leg.
//
// Privacy: telemetry + SSE payloads carry structural metadata only
// (request id, leg, outcome, durationMs, external ref ids). Task name,
// description, matter label, free-text never appear in telemetry or SSE.

const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { sql, getPool } = require('../utils/db');
const { findTeamMember } = require('../utils/teamLookup');
const { resolveAsanaAccessToken, ASANA_TECH_AUTOMATIONS_PROJECT_ID } = require('../utils/asana');
const { createTaskInSection } = require('../utils/asanaTasks');
const { createClioTaskOnMatter } = require('../utils/clioTaskOnMatter');
const { sendCardToDM } = require('../utils/teamsNotificationClient');
const { sendHelixEmail } = require('../utils/helixEmail');
const { broadcastTaskIntake } = require('../utils/taskIntakeStream');

const PROCESSOR_ACTOR = 'task-intake-processor';

function getInstructionsPool() {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not set');
  return getPool(conn);
}

// ─── SQL helpers ─────────────────────────────────────────────────────────

async function loadRequest(requestId) {
  const pool = await getInstructionsPool();
  const result = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query('SELECT * FROM [dbo].[OpsTaskRequests] WHERE RequestId = @requestId');
  return result.recordset?.[0] || null;
}

async function recordTransition({ requestId, leg, outcome, message, durationMs }) {
  const pool = await getInstructionsPool();
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .input('leg', sql.NVarChar(32), leg)
    .input('outcome', sql.NVarChar(16), outcome)
    .input('message', sql.NVarChar(1024), message ? String(message).slice(0, 1024) : null)
    .input('durationMs', sql.Int, Number.isFinite(durationMs) ? Math.round(durationMs) : null)
    .input('createdBy', sql.NVarChar(64), PROCESSOR_ACTOR)
    .query(`
      INSERT INTO [dbo].[OpsTaskRequestTransitions] (RequestId, Leg, Outcome, Message, DurationMs, CreatedBy)
      VALUES (@requestId, @leg, @outcome, @message, @durationMs, @createdBy);
    `);
}

async function recordExternalRef({ requestId, system, refType, refValue }) {
  if (!refValue) return;
  const pool = await getInstructionsPool();
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .input('system', sql.NVarChar(32), system)
    .input('refType', sql.NVarChar(64), refType)
    .input('refValue', sql.NVarChar(256), String(refValue).slice(0, 256))
    .query(`
      INSERT INTO [dbo].[OpsTaskRequestExternalRefs] (RequestId, System, RefType, RefValue)
      VALUES (@requestId, @system, @refType, @refValue);
    `);
}

async function updateStatus(requestId, status) {
  const pool = await getInstructionsPool();
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .input('status', sql.NVarChar(32), status)
    .query(`
      UPDATE [dbo].[OpsTaskRequests]
        SET Status = @status, UpdatedAt = SYSUTCDATETIME()
        WHERE RequestId = @requestId;
    `);
}

// ─── Leg runner ──────────────────────────────────────────────────────────

function legEvent(requestId, leg, outcome, extra) {
  const evt = { requestId, event: outcome === 'started' ? 'leg_started' : (outcome === 'ok' ? 'leg_completed' : (outcome === 'skipped' ? 'leg_skipped' : 'leg_failed')), leg, outcome };
  if (extra) Object.assign(evt, extra);
  broadcastTaskIntake(evt);
}

async function runLeg({ requestId, leg, label, run }) {
  const startedAt = Date.now();
  trackEvent(`Tasks.Processor.${label}.Started`, { requestId, leg });
  legEvent(requestId, leg, 'started');
  try {
    const result = await run();
    const durationMs = Date.now() - startedAt;
    if (result && result.skipped) {
      await recordTransition({ requestId, leg, outcome: 'skipped', message: result.reason || null, durationMs });
      trackEvent(`Tasks.Processor.${label}.Skipped`, { requestId, leg, reason: result.reason || 'unknown', durationMs: String(durationMs) });
      legEvent(requestId, leg, 'skipped', { durationMs, message: result.reason || null });
      return { leg, outcome: 'skipped', reason: result.reason || null };
    }
    await recordTransition({ requestId, leg, outcome: 'completed', message: result?.note || null, durationMs });
    trackMetric(`Tasks.Processor.${label}.Duration`, durationMs, { leg });
    trackEvent(`Tasks.Processor.${label}.Completed`, { requestId, leg, durationMs: String(durationMs) });
    legEvent(requestId, leg, 'ok', { durationMs, ref: result?.ref || null });
    return { leg, outcome: 'completed', result };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await recordTransition({ requestId, leg, outcome: 'failed', message: err?.message || 'error', durationMs });
    trackException(err, { operation: `Tasks.Processor.${label}`, requestId, leg });
    trackEvent(`Tasks.Processor.${label}.Failed`, { requestId, leg, error: err?.message || 'error', durationMs: String(durationMs) });
    legEvent(requestId, leg, 'error', { durationMs, message: err?.message || 'error' });
    return { leg, outcome: 'failed', error: err?.message || 'error' };
  }
}

// ─── Card + email builders (no PII in subjects, full content stays in body) ─

function buildAssigneeCard({ taskName, assignorFirst, matterLabel, dueDate, priority, asanaTaskUrl }) {
  const facts = [];
  if (assignorFirst) facts.push({ title: 'From', value: assignorFirst });
  if (matterLabel) facts.push({ title: 'Matter', value: matterLabel });
  if (dueDate) facts.push({ title: 'Due', value: dueDate });
  if (priority) facts.push({ title: 'Priority', value: priority });
  const body = [
    { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: 'New task for you', wrap: true },
    { type: 'TextBlock', text: taskName || 'Untitled task', wrap: true, spacing: 'Small' },
  ];
  if (facts.length) body.push({ type: 'FactSet', facts });
  const actions = [];
  if (asanaTaskUrl) actions.push({ type: 'Action.OpenUrl', title: 'Open in Asana', url: asanaTaskUrl });
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    actions,
  };
}

function buildAssigneeEmailHtml({ taskName, assignorFirst, matterLabel, dueDate, priority, asanaTaskUrl, description }) {
  const rows = [];
  if (assignorFirst) rows.push(`<tr><td><strong>From</strong></td><td>${assignorFirst}</td></tr>`);
  if (matterLabel) rows.push(`<tr><td><strong>Matter</strong></td><td>${matterLabel}</td></tr>`);
  if (dueDate) rows.push(`<tr><td><strong>Due</strong></td><td>${dueDate}</td></tr>`);
  if (priority) rows.push(`<tr><td><strong>Priority</strong></td><td>${priority}</td></tr>`);
  const link = asanaTaskUrl ? `<p><a href="${asanaTaskUrl}">Open in Asana</a></p>` : '';
  const desc = description ? `<p>${String(description).replace(/\n/g, '<br/>')}</p>` : '';
  return `
    <p>You have a new task: <strong>${taskName || 'Untitled task'}</strong></p>
    ${rows.length ? `<table>${rows.join('')}</table>` : ''}
    ${desc}
    ${link}
  `;
}

// ─── Main entry ──────────────────────────────────────────────────────────

/**
 * Process a single task request end-to-end. Returns a per-leg summary; never
 * throws. Telemetry + SSE + DB transitions carry the full story.
 *
 * @param {object} args
 * @param {string} args.requestId  UNIQUEIDENTIFIER of the OpsTaskRequests row.
 * @returns {Promise<{ requestId, status, legs: Array<{leg, outcome, ...}> }>}
 */
async function processTaskRequest({ requestId }) {
  if (!requestId) throw new Error('requestId is required');
  const startedAt = Date.now();
  trackEvent('Tasks.Processor.Run.Started', { requestId });
  broadcastTaskIntake({ requestId, event: 'processing' });

  let request;
  try {
    request = await loadRequest(requestId);
    if (!request) {
      trackEvent('Tasks.Processor.Run.NotFound', { requestId });
      broadcastTaskIntake({ requestId, event: 'failed', message: 'request_not_found' });
      return { requestId, status: 'not_found', legs: [] };
    }
  } catch (err) {
    trackException(err, { operation: 'Tasks.Processor.Load', requestId });
    broadcastTaskIntake({ requestId, event: 'failed', message: err?.message || 'load_failed' });
    return { requestId, status: 'failed', legs: [], error: err?.message };
  }

  await updateStatus(requestId, 'processing');

  const legs = [];

  // ── Leg 1: team lookup ─────────────────────────────────────────────────
  let assignee = null;
  let assignor = null;
  let approver = null;
  const teamLeg = await runLeg({
    requestId,
    leg: 'team_lookup',
    label: 'TeamLookup',
    run: async () => {
      [assignee, assignor, approver] = await Promise.all([
        findTeamMember({ firstName: request.AssigneeFirstName, initials: null }),
        findTeamMember({ initials: request.AssignorInitials, firstName: request.AssignorFirstName }),
        request.ApproverFirstName ? findTeamMember({ firstName: request.ApproverFirstName }) : Promise.resolve(null),
      ]);
      if (!assignee && !assignor) return { skipped: true, reason: 'no_team_members_resolved' };
      return { note: `assignee=${!!assignee} assignor=${!!assignor} approver=${!!approver}` };
    },
  });
  legs.push(teamLeg);

  // Fall back: if no assignor in team table, use the request CreatedBy initials so the Asana leg still picks a project.
  const asanaActorInitials = (assignor?.initials || request.AssignorInitials || request.CreatedBy || '').toString().toUpperCase();

  // ── Leg 2: Asana ───────────────────────────────────────────────────────
  let asanaTaskGid = null;
  let asanaTaskUrl = null;
  const asanaLeg = await runLeg({
    requestId,
    leg: 'asana',
    label: 'Asana',
    run: async () => {
      const accessToken = await resolveAsanaAccessToken({ initials: asanaActorInitials || 'LZ' });
      if (!accessToken) return { skipped: true, reason: 'no_asana_token' };
      // Section: assignor's personal Asana project root section.
      // ASANAUser_ID on the team table is the project gid; we drop the task
      // straight into the project (no section) by using the project's default
      // section. tasking-v3 uses the assignor project + first section.
      // For now, fall back to the System Tasks board if the assignor has no
      // personal project, so the request always lands somewhere visible.
      const projectGid = assignor?.asanaPersonalProjectGid || String(ASANA_TECH_AUTOMATIONS_PROJECT_ID || '');
      if (!projectGid) return { skipped: true, reason: 'no_target_project' };
      // Resolve the first section in the project. We piggy-back on the
      // tech automations default section when targeting that board; for
      // a personal project we need a section gid, so list and pick the
      // first one.
      const sectionsRes = await fetch(`https://app.asana.com/api/1.0/projects/${encodeURIComponent(projectGid)}/sections?opt_fields=gid,name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!sectionsRes.ok) {
        const text = await sectionsRes.text();
        throw new Error(`Asana sections list ${sectionsRes.status}: ${text.slice(0, 160)}`);
      }
      const sectionsPayload = await sectionsRes.json();
      const sectionGid = sectionsPayload?.data?.[0]?.gid ? String(sectionsPayload.data[0].gid) : null;
      if (!sectionGid) return { skipped: true, reason: 'project_has_no_sections' };
      const taskRaw = await createTaskInSection({
        accessToken,
        sectionGid,
        name: request.TaskName,
        notes: request.TaskDescription || undefined,
        assigneeGid: assignee?.asanaUserGid || undefined,
        dueOn: request.DueDate ? new Date(request.DueDate).toISOString().slice(0, 10) : undefined,
      });
      asanaTaskGid = taskRaw?.gid ? String(taskRaw.gid) : null;
      asanaTaskUrl = taskRaw?.permalink_url || (asanaTaskGid ? `https://app.asana.com/0/${projectGid}/${asanaTaskGid}` : null);
      if (asanaTaskGid) {
        await recordExternalRef({ requestId, system: 'asana', refType: 'task_gid', refValue: asanaTaskGid });
        if (projectGid) await recordExternalRef({ requestId, system: 'asana', refType: 'project_gid', refValue: projectGid });
      }
      return { ref: { asanaTaskGid, asanaProjectGid: projectGid } };
    },
  });
  legs.push(asanaLeg);

  // ── Leg 3: Clio (optional) ─────────────────────────────────────────────
  const clioLeg = await runLeg({
    requestId,
    leg: 'clio',
    label: 'Clio',
    run: async () => {
      const result = await createClioTaskOnMatter({
        assignorInitials: asanaActorInitials,
        matterLabel: request.MatterLabel,
        assigneeClioId: assignee?.clioId,
        taskName: request.TaskName,
        description: request.TaskDescription,
        dueAt: request.DueDate ? new Date(request.DueDate).toISOString().slice(0, 10) : undefined,
        priority: request.Priority,
      });
      if (result.skipped) return { skipped: true, reason: result.reason };
      await recordExternalRef({ requestId, system: 'clio', refType: 'task_id', refValue: result.clioTaskId });
      await recordExternalRef({ requestId, system: 'clio', refType: 'matter_id', refValue: result.matterId });
      return { ref: { clioTaskId: result.clioTaskId, clioMatterId: result.matterId } };
    },
  });
  legs.push(clioLeg);

  // ── Leg 4: Teams DM ────────────────────────────────────────────────────
  const teamsLeg = await runLeg({
    requestId,
    leg: 'teams',
    label: 'Teams',
    run: async () => {
      if (!assignee?.email) return { skipped: true, reason: 'assignee_no_email' };
      const card = buildAssigneeCard({
        taskName: request.TaskName,
        assignorFirst: assignor?.first,
        matterLabel: request.MatterLabel,
        dueDate: request.DueDate ? new Date(request.DueDate).toISOString().slice(0, 10) : null,
        priority: request.Priority,
        asanaTaskUrl,
      });
      const result = await sendCardToDM(assignee.email, card, 'New task');
      if (!result?.success) {
        throw new Error(result?.error || 'sendCardToDM failed');
      }
      return { note: 'card_sent' };
    },
  });
  legs.push(teamsLeg);

  // ── Leg 5: Email ───────────────────────────────────────────────────────
  const emailLeg = await runLeg({
    requestId,
    leg: 'email',
    label: 'Email',
    run: async () => {
      if (!assignee?.email) return { skipped: true, reason: 'assignee_no_email' };
      const subject = `New task: ${(request.TaskName || 'Untitled').slice(0, 120)}`;
      const html = buildAssigneeEmailHtml({
        taskName: request.TaskName,
        assignorFirst: assignor?.first,
        matterLabel: request.MatterLabel,
        dueDate: request.DueDate ? new Date(request.DueDate).toISOString().slice(0, 10) : null,
        priority: request.Priority,
        asanaTaskUrl,
        description: request.TaskDescription,
      });
      const result = await sendHelixEmail({
        body: {
          to: assignee.email,
          subject,
          body_html: html,
          from_email: 'automations@helix-law.com',
          skipSignature: true,
        },
        route: 'server:tasks-intake-processor',
      });
      if (!result?.ok) throw new Error(result?.error || 'sendHelixEmail failed');
      return { note: 'email_sent' };
    },
  });
  legs.push(emailLeg);

  // ── Finalise ───────────────────────────────────────────────────────────
  const anyFailed = legs.some((l) => l.outcome === 'failed');
  const finalStatus = anyFailed ? 'partial' : 'processed';
  await updateStatus(requestId, finalStatus);
  await recordTransition({
    requestId,
    leg: 'finalise',
    outcome: anyFailed ? 'partial' : 'completed',
    message: `legs:${legs.map((l) => `${l.leg}=${l.outcome}`).join(',')}`,
    durationMs: Date.now() - startedAt,
  });
  trackMetric('Tasks.Processor.Run.Duration', Date.now() - startedAt, {});
  trackEvent('Tasks.Processor.Run.Completed', {
    requestId,
    status: finalStatus,
    legSummary: legs.map((l) => `${l.leg}:${l.outcome}`).join(','),
    durationMs: String(Date.now() - startedAt),
  });
  broadcastTaskIntake({
    requestId,
    event: anyFailed ? 'partial' : 'completed',
    durationMs: Date.now() - startedAt,
    ref: { asanaTaskGid, asanaTaskUrl },
  });

  return { requestId, status: finalStatus, legs };
}

module.exports = { processTaskRequest };
