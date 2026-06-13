// server/routes/system-tasks.js
//
// System > Tasks board editor - Hub-owned write surface over Asana, now
// backed by a Hub-side SQL mirror (Phase 1: read replacement + write-through).
//
// Reads:   GET  /board/:projectGid  -> Instructions DB (snappy)
// Writes:  POST /asana/task/:gid/section
//          POST /asana/task/:gid/complete
//          PATCH /asana/task/:gid
//          POST /asana/task/:gid/comment
//          POST /asana/task/:gid/notify       (no mirror impact)
// Every mutation calls refreshMirrorTask (or tombstoneMirrorTask) AFTER
// the Asana call succeeds and BEFORE responding to the operator, so the
// next read reflects their change immediately. A 30s drift sync in
// server/utils/asanaTasksMirror.js catches edits made directly in Asana.
//
// Gate: dev preview only (LZ + AC). Mirrors the inline `isLzOrAc` rule used
// elsewhere; promote to `isAdminUser` when the feature is ready to widen.

const express = require('express');

const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  resolveAsanaAccessToken,
  addCommentToTask,
  createTaskInSection,
  getTask,
  moveTaskToSection,
  normaliseTask,
  setTaskCompleted,
  updateTaskFields,
} = require('../utils/asanaTasks');
const { sendCardToDM } = require('../utils/teamsNotificationClient');
const {
  readBoard: readMirrorBoard,
  syncProject: syncMirrorProject,
  refreshTask: refreshMirrorTask,
  tombstoneTask: tombstoneMirrorTask,
  registerProject: registerMirrorProject,
} = require('../utils/asanaTasksMirror');
const { ASANA_TECH_AUTOMATIONS_PROJECT_ID } = require('../utils/asana');

const router = express.Router();

const DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);
const DEV_PREVIEW_EMAILS = new Set(['lz@helix-law.com', 'ac@helix-law.com']);

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

function resolveAsanaInitials(req) {
  const explicit = readActorInitials(req);
  return explicit || 'LZ';
}

async function withAsana(req, res, op, handler) {
  const actor = readActorInitials(req) || readActorEmail(req) || 'unknown';
  const startedAt = Date.now();
  trackEvent(`SystemTasks.Asana.${op}.Started`, { operation: op, actor });
  try {
    const accessToken = await resolveAsanaAccessToken({ initials: resolveAsanaInitials(req) });
    if (!accessToken) {
      trackEvent(`SystemTasks.Asana.${op}.Failed`, { operation: op, actor, reason: 'no_token' });
      return res.status(500).json({ success: false, error: 'Unable to acquire Asana access token.' });
    }
    const payload = await handler(accessToken);
    const durationMs = Date.now() - startedAt;
    trackMetric(`SystemTasks.Asana.${op}.Duration`, durationMs, { operation: op });
    trackEvent(`SystemTasks.Asana.${op}.Completed`, { operation: op, actor, durationMs });
    return res.json({ success: true, ...(payload && typeof payload === 'object' ? payload : {}) });
  } catch (err) {
    const status = Number(err?.status) || 500;
    trackException(err, { operation: `SystemTasks.Asana.${op}`, actor });
    trackEvent(`SystemTasks.Asana.${op}.Failed`, { operation: op, actor, error: err?.message || 'error' });
    return res.status(status).json({ success: false, error: err?.message || `${op} failed.` });
  }
}

function readTaskGid(req) {
  const gid = String(req.params?.gid || '').trim();
  if (!/^\d{6,}$/.test(gid)) {
    const err = new Error('Invalid task gid');
    err.status = 400;
    throw err;
  }
  return gid;
}

// Project gid for write-through. Clients append ?projectId= to mutations so we
// know which board mirror to refresh after the Asana call succeeds.
function readProjectGid(req) {
  const explicit = String(req.query?.projectId || req.body?.projectId || '').trim();
  if (/^\d{6,}$/.test(explicit)) return explicit;
  return String(ASANA_TECH_AUTOMATIONS_PROJECT_ID || '').trim() || null;
}

// ─── SQL-backed board read (Phase 1 of the Hub-side mirror) ──────────────
// GET /api/system-tasks/board/:projectGid
// Returns the same shape the legacy /api/dev-console/asana/tech-automations
// route returned, but served from the Instructions DB so reads are ~10-30ms.

router.get('/board/:projectGid', requireDevPreview, async (req, res) => {
  const projectGid = String(req.params?.projectGid || '').trim();
  if (!/^\d{6,}$/.test(projectGid)) {
    return res.status(400).json({ success: false, error: 'Invalid projectGid' });
  }
  const actor = readActorInitials(req) || readActorEmail(req) || 'unknown';
  const startedAt = Date.now();
  trackEvent('SystemTasks.Mirror.Read.Started', { projectGid, actor });

  try {
    let board = await readMirrorBoard({ projectGid });
    if (!board) {
      // Lazy-register: first time the bench opens a board, sync on demand
      // then serve from SQL. Subsequent reads come straight from the mirror.
      trackEvent('SystemTasks.Mirror.Read.Miss', { projectGid, actor });
      registerMirrorProject(projectGid);
      await syncMirrorProject({ projectGid, trigger: 'on-demand-register' });
      board = await readMirrorBoard({ projectGid });
      if (!board) {
        return res.status(502).json({ success: false, error: 'Mirror unavailable after register' });
      }
    } else {
      registerMirrorProject(projectGid);
      trackEvent('SystemTasks.Mirror.Read.Hit', { projectGid, actor });
    }
    const durationMs = Date.now() - startedAt;
    trackMetric('SystemTasks.Mirror.Read.Duration', durationMs, { projectGid });
    trackEvent('SystemTasks.Mirror.Read.Completed', {
      projectGid,
      actor,
      durationMs: String(durationMs),
      taskCount: String((board.tasks || []).length),
    });
    return res.json(board);
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Mirror.Read', projectGid, actor });
    trackEvent('SystemTasks.Mirror.Read.Failed', { projectGid, actor, error: err.message || 'error' });
    return res.status(500).json({ success: false, error: err.message || 'Mirror read failed.' });
  }
});

// Move task to a different section within the same project.
// Body: { sectionGid: string }
router.post('/asana/task/:gid/section', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
  const sectionGid = String(req.body?.sectionGid || '').trim();
  if (!/^\d{6,}$/.test(sectionGid)) {
    return res.status(400).json({ success: false, error: 'sectionGid is required' });
  }
  const projectGid = readProjectGid(req);
  await withAsana(req, res, 'MoveSection', async (accessToken) => {
    await moveTaskToSection({ accessToken, taskGid, sectionGid });
    if (projectGid) await refreshMirrorTask({ projectGid, taskGid, trigger: 'MoveSection' });
    return { taskGid, sectionGid };
  });
});

// Toggle completion. Body: { completed: boolean }
router.post('/asana/task/:gid/complete', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
  const completed = Boolean(req.body?.completed);
  const projectGid = readProjectGid(req);
  await withAsana(req, res, 'SetCompleted', async (accessToken) => {
    const task = await setTaskCompleted({ accessToken, taskGid, completed });
    if (projectGid) {
      if (completed) await tombstoneMirrorTask({ projectGid, taskGid });
      else await refreshMirrorTask({ projectGid, taskGid, trigger: 'SetCompleted' });
    }
    return { taskGid, task };
  });
});

// Patch allow-listed fields. Body: { name?, notes?, dueOn?: 'YYYY-MM-DD' | null, assigneeGid?: gid | 'me' | null }
router.patch('/asana/task/:gid', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
  const projectGid = readProjectGid(req);
  await withAsana(req, res, 'UpdateFields', async (accessToken) => {
    const task = await updateTaskFields({ accessToken, taskGid, fields: req.body || {} });
    if (projectGid) await refreshMirrorTask({ projectGid, taskGid, trigger: 'UpdateFields' });
    return { taskGid, task };
  });
});

// Append a comment story. Body: { text: string }
router.post('/asana/task/:gid/comment', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'text is required' });
  const projectGid = readProjectGid(req);
  await withAsana(req, res, 'AddComment', async (accessToken) => {
    const story = await addCommentToTask({ accessToken, taskGid, text });
    if (projectGid) await refreshMirrorTask({ projectGid, taskGid, trigger: 'AddComment' });
    return { taskGid, story };
  });
});

// Create a new task inside a section on the current board. The created task
// is mirrored before we respond so the bench shows it immediately on refetch.
// Body: { sectionGid, name, dueOn?: 'YYYY-MM-DD', assigneeGid?: gid|'me', notes? }
//
// Phase B (Hub-native intake pipeline): when the body carries
// `useIntake: true`, the request is routed through /api/tasks/intake instead
// of going straight to Asana. The intake processor fans out to asana / clio /
// teams / email and streams per-leg progress to /api/tasks/intake/stream so
// the bench shows real-time updates. When `useIntake` is false (default for
// older callers), behaviour is unchanged.
router.post('/asana/task', requireDevPreview, async (req, res) => {
  if (req.body?.useIntake === true) {
    return createViaIntake(req, res);
  }
  const sectionGid = String(req.body?.sectionGid || '').trim();
  if (!/^\d{6,}$/.test(sectionGid)) {
    return res.status(400).json({ success: false, error: 'sectionGid is required' });
  }
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  const dueOn = typeof req.body?.dueOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueOn)
    ? req.body.dueOn : undefined;
  const assigneeGid = req.body?.assigneeGid === 'me'
    ? 'me'
    : (typeof req.body?.assigneeGid === 'string' && /^\d{6,}$/.test(req.body.assigneeGid)
      ? req.body.assigneeGid : undefined);
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
  const projectGid = readProjectGid(req);
  await withAsana(req, res, 'CreateTask', async (accessToken) => {
    const raw = await createTaskInSection({
      accessToken, sectionGid, name, dueOn, assigneeGid, notes,
    });
    const task = normaliseTask(raw);
    const taskGid = String(raw?.gid || task?.gid || '').trim();
    if (projectGid && taskGid) {
      await refreshMirrorTask({ projectGid, taskGid, trigger: 'CreateTask' });
    }
    return { taskGid, task };
  });
});

// ─── Phase B adapter: bench create -> intake pipeline ────────────────────
//
// Lazy-required to avoid a require cycle (task-intake -> processor -> ...).
// Writes the OpsTaskRequests row inline + fire-and-forgets the processor.
// Returns 202 immediately with { requestId } so the bench can optimistically
// render the new card and light up legs as SSE events arrive.

let _taskIntakeProcessor = null;
let _taskIntakeStream = null;
function _loadIntakeDeps() {
  if (!_taskIntakeProcessor) _taskIntakeProcessor = require('../processors/taskIntakeProcessor');
  if (!_taskIntakeStream) _taskIntakeStream = require('../utils/taskIntakeStream');
}

async function createViaIntake(req, res) {
  const actor = readActorInitials(req) || readActorEmail(req) || 'unknown';
  const startedAt = Date.now();
  try {
    _loadIntakeDeps();
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Intake.LoadDeps', actor });
    return res.status(500).json({ success: false, error: 'Intake pipeline unavailable' });
  }

  // Build the intake payload from the composer body. The composer sends
  // optional workflow_type/assignee/matter fields; we default sensibly.
  const body = req.body || {};
  const name = String(body?.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  // Forward to the canonical intake route via direct fetch so we hit the
  // same validation + telemetry + dev-preview gate, no logic duplication.
  // We use the loopback URL because the route is mounted on the same app.
  const port = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || 8080;
  const intakeUrl = `http://127.0.0.1:${port}/api/tasks/intake`;
  const payload = {
    source: 'system-bench',
    workflow_type: body.workflow_type || body.workflowType || 'individual',
    task_name: name,
    task_description: typeof body.notes === 'string' ? body.notes : undefined,
    assignor_initials: readActorInitials(req) || 'LZ',
    assignee_first_name: body.assignee_first_name || body.assigneeFirstName || null,
    matter_label: body.matter_label || body.matterLabel || null,
    priority: body.priority || null,
    due_date: body.dueOn || body.due_date || null,
    auto_process: true,
  };

  trackEvent('SystemTasks.Intake.Submit.Started', { actor });
  try {
    const upstream = await fetch(intakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Propagate identity so the intake route sees the same dev-preview actor.
        'x-user-initials': readActorInitials(req) || '',
        'x-user-email': readActorEmail(req) || '',
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* leave null */ }
    const durationMs = Date.now() - startedAt;
    trackMetric('SystemTasks.Intake.Submit.Duration', durationMs, {});
    if (!upstream.ok) {
      trackEvent('SystemTasks.Intake.Submit.Failed', { actor, status: String(upstream.status) });
      return res.status(upstream.status).json(parsed || { success: false, error: 'Intake submit failed' });
    }
    trackEvent('SystemTasks.Intake.Submit.Completed', { actor, requestId: parsed?.requestId || '', durationMs: String(durationMs) });
    return res.status(202).json({
      success: true,
      requestId: parsed?.requestId || null,
      status: parsed?.status || 'queued',
      autoProcess: true,
    });
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Intake.Submit', actor });
    return res.status(500).json({ success: false, error: err?.message || 'Intake submit failed' });
  }
}

// ── Notify recipients via Teams DM with an Adaptive Card ─────────────────
//
// Body: {
//   recipients?: Array<'assignee'|'creator'|'followers'|'all'>,  // roles
//   emails?: string[],                                           // explicit
//   note?: string,                                               // optional
// }
//
// Returns: { task, recipients: [{ email, role, ok, error? }] }

const RECIPIENT_ROLES = new Set(['assignee', 'creator', 'followers', 'all']);

function formatDueLabel(dueOn) {
  if (!dueOn) return 'No due date';
  const due = new Date(`${dueOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return dueOn;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const formatted = due.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  if (diffDays < 0) return `${formatted} (overdue ${-diffDays}d)`;
  if (diffDays === 0) return `${formatted} (today)`;
  if (diffDays === 1) return `${formatted} (tomorrow)`;
  return `${formatted} (in ${diffDays}d)`;
}

function buildTaskNotifyCard({ task, sectionName, projectName, actorLabel, note }) {
  const facts = [
    task.assignee?.name ? { title: 'Assignee', value: task.assignee.name } : null,
    sectionName ? { title: 'Section', value: sectionName } : null,
    projectName ? { title: 'Board', value: projectName } : null,
    { title: 'Due', value: formatDueLabel(task.dueOn) },
  ].filter(Boolean);

  const body = [
    {
      type: 'TextBlock',
      text: 'Task heads-up',
      weight: 'Bolder',
      size: 'Medium',
      wrap: true,
    },
    {
      type: 'TextBlock',
      text: task.name || 'Untitled task',
      wrap: true,
      spacing: 'Small',
    },
    {
      type: 'FactSet',
      facts,
      spacing: 'Medium',
    },
  ];

  if (note && String(note).trim()) {
    body.push({
      type: 'TextBlock',
      text: String(note).trim(),
      wrap: true,
      spacing: 'Medium',
      isSubtle: false,
    });
  }

  if (actorLabel) {
    body.push({
      type: 'TextBlock',
      text: `Sent by ${actorLabel} from Helix Hub`,
      wrap: true,
      spacing: 'Small',
      isSubtle: true,
      size: 'Small',
    });
  }

  const actions = [];
  if (task.url) {
    actions.push({ type: 'Action.OpenUrl', title: 'Open in Asana', url: task.url });
  }

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    actions,
  };
}

function collectRecipientCandidates(task, roles) {
  const wantAll = roles.includes('all');
  const want = (r) => wantAll || roles.includes(r);
  const out = new Map();

  function add(email, name, role) {
    const e = String(email || '').toLowerCase().trim();
    if (!e) return;
    if (out.has(e)) return;
    out.set(e, { email: e, name: name || '', role });
  }

  if (want('assignee') && task.assignee?.email) {
    add(task.assignee.email, task.assignee.name, 'assignee');
  }
  if (want('creator') && task.createdBy?.email) {
    add(task.createdBy.email, task.createdBy.name, 'creator');
  }
  if (want('followers') && Array.isArray(task.followers)) {
    for (const f of task.followers) {
      if (f?.email) add(f.email, f.name, 'follower');
    }
  }
  return Array.from(out.values());
}

// Body: { recipients?: string[], emails?: string[], note?: string }
router.post('/asana/task/:gid/notify', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }

  const roles = Array.isArray(req.body?.recipients)
    ? req.body.recipients.map((r) => String(r || '').toLowerCase().trim()).filter((r) => RECIPIENT_ROLES.has(r))
    : [];
  const explicitEmails = Array.isArray(req.body?.emails)
    ? req.body.emails.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean)
    : [];
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 1500) : '';

  if (roles.length === 0 && explicitEmails.length === 0) {
    return res.status(400).json({ success: false, error: 'recipients or emails required' });
  }

  await withAsana(req, res, 'NotifyDM', async (accessToken) => {
    const actor = readActorInitials(req) || readActorEmail(req) || 'unknown';
    const raw = await getTask({ accessToken, taskGid, operatorConsent: true, operatorActor: actor });
    const task = normaliseTask(raw);
    if (!task) {
      const err = new Error('Task not found');
      err.status = 404;
      throw err;
    }

    const roleRecipients = collectRecipientCandidates(task, roles);
    const explicitRecipients = explicitEmails.map((email) => ({ email, name: '', role: 'explicit' }));

    const merged = new Map();
    for (const r of [...roleRecipients, ...explicitRecipients]) {
      if (!merged.has(r.email)) merged.set(r.email, r);
    }
    const recipients = Array.from(merged.values());

    if (recipients.length === 0) {
      return { taskGid, recipients: [], warning: 'No deliverable recipients (missing emails)' };
    }

    const sectionName = task.memberships?.[0]?.section?.name || '';
    const projectName = task.memberships?.[0]?.project?.name || task.projects?.[0]?.name || '';
    const actorLabel = readActorInitials(req) || readActorEmail(req) || '';

    const card = buildTaskNotifyCard({ task, sectionName, projectName, actorLabel, note });

    const results = [];
    for (const r of recipients) {
      try {
        const result = await sendCardToDM(r.email, card, `Task heads-up: ${task.name || taskGid}`);
        results.push({
          email: r.email,
          name: r.name,
          role: r.role,
          ok: Boolean(result?.success),
          error: result?.success ? null : (result?.error || 'send failed'),
        });
      } catch (err) {
        results.push({ email: r.email, name: r.name, role: r.role, ok: false, error: err?.message || 'send failed' });
      }
    }

    return { taskGid, recipients: results };
  });
});

// Preview recipient candidates for a task. Returns the assignee/creator/follower
// roles whose users have an email on record (and therefore are deliverable).
router.get('/asana/task/:gid/notify-preview', requireDevPreview, async (req, res) => {
  let taskGid;
  try { taskGid = readTaskGid(req); } catch (err) { return res.status(400).json({ success: false, error: err.message }); }

  await withAsana(req, res, 'NotifyPreview', async (accessToken) => {
    const actor = readActorInitials(req) || readActorEmail(req) || 'unknown';
    const raw = await getTask({ accessToken, taskGid, operatorConsent: true, operatorActor: actor });
    const task = normaliseTask(raw);
    if (!task) {
      const err = new Error('Task not found');
      err.status = 404;
      throw err;
    }
    const candidates = {
      assignee: task.assignee?.email
        ? [{ email: task.assignee.email.toLowerCase(), name: task.assignee.name || '' }]
        : [],
      creator: task.createdBy?.email
        ? [{ email: task.createdBy.email.toLowerCase(), name: task.createdBy.name || '' }]
        : [],
      followers: Array.isArray(task.followers)
        ? task.followers
            .filter((f) => f && f.email)
            .map((f) => ({ email: String(f.email).toLowerCase(), name: f.name || '' }))
        : [],
    };
    return { taskGid, candidates };
  });
});

module.exports = router;
