// server/utils/asanaTasksMirror.js
//
// Hub-side SQL mirror of Asana System Tasks boards.
// Phase 1: drift sync (30s) + write-through after Hub mutations + SQL read.
// Sits behind the same dev preview as the System Tasks bench (LZ + AC).
//
// Privacy: every Asana read inside this module runs as the synthetic
// 'system-tasks-mirror-sync' operator. All telemetry uses safeTaskSummary
// (gids, counts, flags) only; task names and notes never leave SQL.

const { sql, getPool } = require('./db');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { ASANA_BASE_URL, resolveAsanaAccessToken, ASANA_TECH_AUTOMATIONS_PROJECT_ID } = require('./asana');
const { getTask } = require('./asanaTasks');
const { safeTaskSummary } = require('./asanaContentGuard');

const MIRROR_OPERATOR_ACTOR = 'system-tasks-mirror-sync';
const DEFAULT_INTERVAL_MS = Number(process.env.HELIX_TASKS_MIRROR_INTERVAL_MS) || 30_000;
const ASANA_FETCH_TIMEOUT_MS = 10_000;

let _intervalHandle = null;
let _stopping = false;
const _registeredProjects = new Set();
let _inFlight = false; // suppress overlap if sync runs long

// ─── DB helpers ───────────────────────────────────────────────────────────

function getInstructionsPool() {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not set');
  return getPool(conn);
}

// ─── Asana fetch (paginated) ──────────────────────────────────────────────

async function fetchAsanaCollection(firstUrl, accessToken) {
  const rows = [];
  let nextUrl = firstUrl;
  for (let page = 0; nextUrl && page < 20; page += 1) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: ASANA_FETCH_TIMEOUT_MS,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `Asana HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    rows.push(...(payload.data || []));
    nextUrl = payload.next_page?.uri || null;
  }
  return rows;
}

async function fetchProjectMeta(projectGid, accessToken) {
  const url = `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectGid)}?opt_fields=gid,name,team.name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: ASANA_FETCH_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || `Asana project HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json()).data || {};
}

// ─── Shape normalisation (matches dev-console route response) ─────────────

function normaliseBoardTask(raw, sectionLookup) {
  const membership = Array.isArray(raw.memberships)
    ? raw.memberships.find((m) => m?.section?.gid && sectionLookup.has(String(m.section.gid)))
    : null;
  const sectionGid = membership?.section?.gid ? String(membership.section.gid) : null;
  return {
    gid: String(raw.gid || ''),
    name: raw.name || '',
    assignee: raw.assignee?.name || null,
    dueOn: raw.due_on || null,
    createdAt: raw.created_at || null,
    url: raw.permalink_url || null,
    sectionGid,
  };
}

// ─── Upsert (single project snapshot) ─────────────────────────────────────

const SECTION_UPSERT_SQL = `
MERGE [dbo].[OpsAsanaSections] AS target
USING (SELECT @projectGid AS ProjectGid, @sectionGid AS SectionGid, @name AS Name, @sortOrder AS SortOrder) AS src
  ON target.ProjectGid = src.ProjectGid AND target.SectionGid = src.SectionGid
WHEN MATCHED THEN UPDATE SET Name = src.Name, SortOrder = src.SortOrder, MirroredAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (ProjectGid, SectionGid, Name, SortOrder) VALUES (src.ProjectGid, src.SectionGid, src.Name, src.SortOrder);
`;

const TASK_UPSERT_SQL = `
MERGE [dbo].[OpsAsanaTasks] AS target
USING (SELECT
  @projectGid AS ProjectGid, @taskGid AS TaskGid, @sectionGid AS SectionGid,
  @name AS Name, @assigneeName AS AssigneeName, @dueOn AS DueOn,
  @asanaCreated AS AsanaCreated, @url AS Url, @completed AS Completed
) AS src
  ON target.ProjectGid = src.ProjectGid AND target.TaskGid = src.TaskGid
WHEN MATCHED THEN UPDATE SET
  SectionGid = src.SectionGid, Name = src.Name, AssigneeName = src.AssigneeName,
  DueOn = src.DueOn, AsanaCreated = src.AsanaCreated, Url = src.Url,
  Completed = src.Completed, MirroredAt = SYSUTCDATETIME(), DeletedAt = NULL
WHEN NOT MATCHED THEN INSERT
  (ProjectGid, TaskGid, SectionGid, Name, AssigneeName, DueOn, AsanaCreated, Url, Completed)
  VALUES (src.ProjectGid, src.TaskGid, src.SectionGid, src.Name, src.AssigneeName, src.DueOn, src.AsanaCreated, src.Url, src.Completed);
`;

async function upsertProjectMeta(pool, { projectGid, name, teamName, status, error, taskCount, sectionCount }) {
  await pool.request()
    .input('projectGid', sql.NVarChar(64), projectGid)
    .input('name', sql.NVarChar(255), name || projectGid)
    .input('teamName', sql.NVarChar(255), teamName || null)
    .input('status', sql.NVarChar(20), status)
    .input('error', sql.NVarChar(400), error || null)
    .input('taskCount', sql.Int, taskCount || 0)
    .input('sectionCount', sql.Int, sectionCount || 0)
    .query(`
MERGE [dbo].[OpsAsanaProjects] AS target
USING (SELECT @projectGid AS ProjectGid) AS src ON target.ProjectGid = src.ProjectGid
WHEN MATCHED THEN UPDATE SET
  Name = @name, TeamName = @teamName, LastSyncAt = SYSUTCDATETIME(),
  LastStatus = @status, LastError = @error, TaskCount = @taskCount, SectionCount = @sectionCount
WHEN NOT MATCHED THEN INSERT (ProjectGid, Name, TeamName, LastSyncAt, LastStatus, LastError, TaskCount, SectionCount)
  VALUES (@projectGid, @name, @teamName, SYSUTCDATETIME(), @status, @error, @taskCount, @sectionCount);`);
}

async function upsertSection(pool, { projectGid, sectionGid, name, sortOrder }) {
  await pool.request()
    .input('projectGid', sql.NVarChar(64), projectGid)
    .input('sectionGid', sql.NVarChar(64), sectionGid)
    .input('name', sql.NVarChar(255), name || 'Untitled section')
    .input('sortOrder', sql.Int, sortOrder)
    .query(SECTION_UPSERT_SQL);
}

async function upsertTaskRow(pool, { projectGid, task, completed }) {
  await pool.request()
    .input('projectGid', sql.NVarChar(64), projectGid)
    .input('taskGid', sql.NVarChar(64), task.gid)
    .input('sectionGid', sql.NVarChar(64), task.sectionGid || null)
    .input('name', sql.NVarChar(500), (task.name || '').slice(0, 500))
    .input('assigneeName', sql.NVarChar(255), task.assignee || null)
    .input('dueOn', sql.Date, task.dueOn || null)
    .input('asanaCreated', sql.DateTime2, task.createdAt ? new Date(task.createdAt) : null)
    .input('url', sql.NVarChar(500), task.url || null)
    .input('completed', sql.Bit, completed ? 1 : 0)
    .query(TASK_UPSERT_SQL);
}

// ─── Public: sync a whole project ─────────────────────────────────────────

async function syncProject({ projectGid, trigger = 'scheduled' }) {
  if (!projectGid) throw new Error('projectGid is required');
  _registeredProjects.add(String(projectGid));

  const startedAt = Date.now();
  trackEvent('SystemTasks.Mirror.Sync.Started', { projectGid, trigger });

  try {
    const accessToken = await resolveAsanaAccessToken({ initials: 'LZ' });
    if (!accessToken) throw new Error('Unable to acquire Asana access token');

    const projectMeta = await fetchProjectMeta(projectGid, accessToken);

    const sectionsUrl = `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectGid)}/sections?opt_fields=name,gid`;
    const tasksUrl = `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectGid)}/tasks?completed_since=now&opt_fields=${encodeURIComponent('gid,name,completed,assignee.name,permalink_url,due_on,created_at,memberships.section.gid,memberships.section.name')}&limit=100`;

    const [sectionsRaw, tasksRaw] = await Promise.all([
      fetchAsanaCollection(sectionsUrl, accessToken),
      fetchAsanaCollection(tasksUrl, accessToken),
    ]);

    const sectionLookup = new Map(sectionsRaw.map((s) => [String(s.gid || ''), s.name || 'Untitled section']));
    const tasks = tasksRaw.map((raw) => normaliseBoardTask(raw, sectionLookup));

    const pool = await getInstructionsPool();

    // Upsert sections in declared order.
    for (let i = 0; i < sectionsRaw.length; i += 1) {
      const s = sectionsRaw[i];
      await upsertSection(pool, {
        projectGid,
        sectionGid: String(s.gid || ''),
        name: s.name || 'Untitled section',
        sortOrder: i,
      });
    }

    // Upsert tasks. completed_since=now means the snapshot only contains
    // open tasks, so Completed is always 0 here. The write-through path
    // handles the completed=true transition via tombstoneTask().
    for (const task of tasks) {
      if (!task.gid) continue;
      await upsertTaskRow(pool, { projectGid, task, completed: false });
    }

    // Soft-delete tasks that vanished from the snapshot (moved, deleted,
    // archived in Asana). Treat completed write-through tombstones as
    // already-handled (DeletedAt set + Completed=1).
    const liveGids = tasks.map((t) => t.gid).filter(Boolean);
    if (liveGids.length === 0) {
      await pool.request()
        .input('projectGid', sql.NVarChar(64), projectGid)
        .query(`UPDATE [dbo].[OpsAsanaTasks] SET DeletedAt = SYSUTCDATETIME()
                 WHERE ProjectGid = @projectGid AND DeletedAt IS NULL`);
    } else {
      // Build IN list via table variable to avoid query bloat for large boards.
      const tvp = new sql.Table();
      tvp.columns.add('TaskGid', sql.NVarChar(64));
      for (const g of liveGids) tvp.rows.add(g);
      // mssql TVP needs a declared type; use OPENJSON instead for portability.
      const jsonGids = JSON.stringify(liveGids);
      await pool.request()
        .input('projectGid', sql.NVarChar(64), projectGid)
        .input('liveGids', sql.NVarChar(sql.MAX), jsonGids)
        .query(`
DECLARE @gids TABLE (TaskGid NVARCHAR(64) PRIMARY KEY);
INSERT INTO @gids (TaskGid) SELECT value FROM OPENJSON(@liveGids);
UPDATE [dbo].[OpsAsanaTasks]
   SET DeletedAt = SYSUTCDATETIME()
 WHERE ProjectGid = @projectGid
   AND DeletedAt IS NULL
   AND TaskGid NOT IN (SELECT TaskGid FROM @gids);`);
    }

    await upsertProjectMeta(pool, {
      projectGid,
      name: projectMeta.name || projectGid,
      teamName: projectMeta.team?.name || null,
      status: 'ok',
      error: null,
      taskCount: tasks.length,
      sectionCount: sectionsRaw.length,
    });

    const durationMs = Date.now() - startedAt;
    trackMetric('SystemTasks.Mirror.Sync.Duration', durationMs, { projectGid, trigger });
    trackEvent('SystemTasks.Mirror.Sync.Completed', {
      projectGid,
      trigger,
      durationMs: String(durationMs),
      taskCount: String(tasks.length),
      sectionCount: String(sectionsRaw.length),
    });
    return { taskCount: tasks.length, sectionCount: sectionsRaw.length, durationMs };
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Mirror.Sync', projectGid, trigger });
    trackEvent('SystemTasks.Mirror.Sync.Failed', { projectGid, trigger, error: err.message || 'error' });
    try {
      const pool = await getInstructionsPool();
      await upsertProjectMeta(pool, {
        projectGid,
        name: projectGid,
        teamName: null,
        status: 'failed',
        error: String(err.message || 'error').slice(0, 400),
        taskCount: 0,
        sectionCount: 0,
      });
    } catch { /* best effort */ }
    throw err;
  }
}

// ─── Public: write-through for a single task ──────────────────────────────

async function refreshTask({ projectGid, taskGid, trigger = 'write-through' }) {
  if (!projectGid || !taskGid) return;
  const startedAt = Date.now();
  trackEvent('SystemTasks.Mirror.WriteThrough.Started', { projectGid, taskGid, trigger });
  try {
    const accessToken = await resolveAsanaAccessToken({ initials: 'LZ' });
    if (!accessToken) throw new Error('no token');
    const raw = await getTask({
      accessToken,
      taskGid,
      operatorConsent: true,
      operatorActor: MIRROR_OPERATOR_ACTOR,
    });
    if (!raw) return;
    const summary = safeTaskSummary(raw);

    // Resolve section membership for the requested project only.
    let sectionGid = null;
    if (Array.isArray(raw.memberships)) {
      const m = raw.memberships.find((mem) => mem?.project?.gid && String(mem.project.gid) === String(projectGid));
      if (m?.section?.gid) sectionGid = String(m.section.gid);
    }

    const completed = Boolean(raw.completed);
    const task = {
      gid: String(raw.gid || taskGid),
      name: raw.name || '',
      assignee: raw.assignee?.name || null,
      dueOn: raw.due_on || null,
      createdAt: raw.created_at || null,
      url: raw.permalink_url || null,
      sectionGid,
    };

    const pool = await getInstructionsPool();
    await upsertTaskRow(pool, { projectGid, task, completed });

    // Completed tasks should drop out of board reads. Soft-delete so a
    // later "uncomplete" via sync can resurrect them.
    if (completed) {
      await pool.request()
        .input('projectGid', sql.NVarChar(64), projectGid)
        .input('taskGid', sql.NVarChar(64), taskGid)
        .query(`UPDATE [dbo].[OpsAsanaTasks]
                   SET DeletedAt = SYSUTCDATETIME()
                 WHERE ProjectGid = @projectGid AND TaskGid = @taskGid`);
    }

    const durationMs = Date.now() - startedAt;
    trackMetric('SystemTasks.Mirror.WriteThrough.Duration', durationMs, { projectGid, trigger });
    trackEvent('SystemTasks.Mirror.WriteThrough.Completed', {
      projectGid,
      taskGid,
      trigger,
      durationMs: String(durationMs),
      sectionGid: String(summary.sectionGid || ''),
      completed: String(summary.completed),
    });
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Mirror.WriteThrough', projectGid, taskGid, trigger });
    trackEvent('SystemTasks.Mirror.WriteThrough.Failed', {
      projectGid, taskGid, trigger, error: err.message || 'error',
    });
    // Never throw; the user's mutation has already succeeded.
  }
}

async function tombstoneTask({ projectGid, taskGid }) {
  if (!projectGid || !taskGid) return;
  try {
    const pool = await getInstructionsPool();
    await pool.request()
      .input('projectGid', sql.NVarChar(64), projectGid)
      .input('taskGid', sql.NVarChar(64), taskGid)
      .query(`UPDATE [dbo].[OpsAsanaTasks]
                 SET Completed = 1, DeletedAt = SYSUTCDATETIME(), MirroredAt = SYSUTCDATETIME()
               WHERE ProjectGid = @projectGid AND TaskGid = @taskGid`);
    trackEvent('SystemTasks.Mirror.Tombstone', { projectGid, taskGid });
  } catch (err) {
    trackException(err, { operation: 'SystemTasks.Mirror.Tombstone', projectGid, taskGid });
  }
}

// ─── Public: snappy read of one board ─────────────────────────────────────

async function readBoard({ projectGid }) {
  if (!projectGid) throw new Error('projectGid is required');
  const pool = await getInstructionsPool();
  const request = pool.request().input('projectGid', sql.NVarChar(64), projectGid);
  const result = await request.query(`
SELECT TOP 1 Name, TeamName, LastSyncAt, LastStatus
  FROM [dbo].[OpsAsanaProjects]
 WHERE ProjectGid = @projectGid;

SELECT SectionGid, Name, SortOrder
  FROM [dbo].[OpsAsanaSections]
 WHERE ProjectGid = @projectGid
 ORDER BY SortOrder ASC;

SELECT TaskGid, SectionGid, Name, AssigneeName, DueOn, AsanaCreated, Url
  FROM [dbo].[OpsAsanaTasks]
 WHERE ProjectGid = @projectGid
   AND DeletedAt IS NULL
   AND Completed = 0
 ORDER BY MirroredAt DESC;`);

  const [projectRows, sectionRows, taskRows] = result.recordsets;
  const project = projectRows?.[0] || null;
  if (!project) return null;

  const sections = sectionRows.map((row) => ({
    gid: String(row.SectionGid || ''),
    name: row.Name || 'Untitled section',
    count: 0,
  }));
  const sectionByGid = new Map(sections.map((s) => [s.gid, s]));
  const hasUnsectioned = taskRows.some((t) => !t.SectionGid);

  const tasks = taskRows.map((row) => {
    const sectionGid = row.SectionGid ? String(row.SectionGid) : 'unsectioned';
    const section = sectionByGid.get(sectionGid)?.name || 'Unsectioned';
    return {
      gid: String(row.TaskGid || ''),
      name: row.Name || '',
      assignee: row.AssigneeName || null,
      dueOn: row.DueOn ? row.DueOn.toISOString().slice(0, 10) : null,
      createdAt: row.AsanaCreated ? row.AsanaCreated.toISOString() : null,
      url: row.Url || null,
      section,
      sectionGid,
    };
  });

  for (const t of tasks) {
    const s = sectionByGid.get(t.sectionGid);
    if (s) s.count += 1;
  }

  const responseSections = sections.slice();
  if (hasUnsectioned) {
    const unsCount = tasks.filter((t) => t.sectionGid === 'unsectioned').length;
    responseSections.push({ gid: 'unsectioned', name: 'Unsectioned', count: unsCount });
  }

  return {
    success: true,
    projectId: projectGid,
    projectName: project.Name || projectGid,
    teamName: project.TeamName || null,
    generatedAt: project.LastSyncAt ? new Date(project.LastSyncAt).toISOString() : new Date().toISOString(),
    tasks,
    sections: responseSections,
  };
}

// ─── Background timer ─────────────────────────────────────────────────────

function registerProject(projectGid) {
  if (projectGid) _registeredProjects.add(String(projectGid));
}

async function tick() {
  if (_inFlight || _stopping) return;
  _inFlight = true;
  try {
    const ids = Array.from(_registeredProjects);
    for (const projectGid of ids) {
      try {
        await syncProject({ projectGid, trigger: 'scheduled' });
      } catch {
        // syncProject already records telemetry; swallow to keep the loop alive.
      }
    }
  } finally {
    _inFlight = false;
  }
}

function startMirrorSync() {
  if (_intervalHandle) return;
  _stopping = false;
  // Seed the default board so the bench is warm before the first user load.
  if (ASANA_TECH_AUTOMATIONS_PROJECT_ID) {
    _registeredProjects.add(String(ASANA_TECH_AUTOMATIONS_PROJECT_ID));
  }
  // Kick a first tick immediately, then settle into the interval cadence.
  setImmediate(tick);
  _intervalHandle = setInterval(tick, DEFAULT_INTERVAL_MS);
  if (typeof _intervalHandle.unref === 'function') _intervalHandle.unref();
  trackEvent('SystemTasks.Mirror.Scheduler.Started', { intervalMs: String(DEFAULT_INTERVAL_MS) });
}

function stopMirrorSync() {
  _stopping = true;
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    trackEvent('SystemTasks.Mirror.Scheduler.Stopped', {});
  }
}

function getMirrorState() {
  return {
    intervalMs: DEFAULT_INTERVAL_MS,
    running: Boolean(_intervalHandle),
    inFlight: _inFlight,
    projectGids: Array.from(_registeredProjects),
  };
}

module.exports = {
  syncProject,
  refreshTask,
  tombstoneTask,
  readBoard,
  registerProject,
  startMirrorSync,
  stopMirrorSync,
  getMirrorState,
};
