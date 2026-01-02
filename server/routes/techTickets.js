/**
 * Tech Tickets Routes
 * 
 * POST /api/tech-tickets/idea - Submit tech development idea
 * POST /api/tech-tickets/problem - Report technical problem
 * GET /api/tech-tickets/team - Get team members with Asana IDs (for assignment)
 * 
 * Creates Asana tasks in the Tech project
 */

const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');

const router = express.Router();

function createHttpError(status, code, message, extra) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (extra && typeof extra === 'object') {
    Object.assign(err, extra);
  }
  return err;
}

function serializeUnknownError(err) {
  if (!err) return { message: 'Unknown error' };
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      status: err.status,
      code: err.code,
      asanaStatus: err.asanaStatus,
      asanaBodySnippet: typeof err.asanaBody === 'string' ? err.asanaBody.slice(0, 1000) : undefined,
    };
  }

  if (typeof err === 'object') {
    const obj = err;
    return {
      message: obj.message || String(err),
      status: obj.status,
      code: obj.code,
    };
  }

  return { message: String(err) };
}

async function tryGetTechRecipientAsanaUserIds() {
  try {
    const rows = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('roleLike', sql.NVarChar, '%tech%')
        .query(`
          SELECT [ASANAUser_ID]
          FROM [dbo].[team]
          WHERE [status] = 'active'
            AND [ASANAUser_ID] IS NOT NULL
            AND [Role] LIKE @roleLike
        `);
      return result.recordset || [];
    }, 1);

    return rows
      .map((r) => r.ASANAUser_ID)
      .filter((v) => typeof v === 'string' && v.length > 0);
  } catch (err) {
    console.warn('[tech-tickets] Failed to fetch tech recipients from team table:', serializeUnknownError(err));
    return [];
  }
}

// Asana API configuration
const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';

// Tech team project ID - TODO: Fetch from Asana API or configure in env
// For now, using LZ's team project as placeholder
const TECH_PROJECT_ID = process.env.ASANA_TECH_PROJECT_ID || '1204962032378888';

// Connection string for helix_projects database (falls back to core SQL)
const getConnectionString = () => {
  const connStr = process.env.PROJECTS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('Database connection string not configured');
  }
  return connStr;
};

// Known Asana user IDs for tech team (from team database)
// These will be fetched dynamically from the team table
const KNOWN_TEAM_MEMBERS = {
  LZ: { name: 'Lukasz Zemanek', asanaUserId: '1203336817680917' },
  KW: { name: 'Kanchel White', asanaUserId: '1203336030510561' },
  // CB - Need to look up from database
};

/**
 * Get Asana access token from environment or Key Vault
 */
async function getAsanaToken() {
  // First try environment variable
  if (process.env.ASANA_ACCESS_TOKEN) {
    return process.env.ASANA_ACCESS_TOKEN;
  }
  
  // Otherwise, could fetch from Key Vault if needed
  // For now, throw error if not configured
  throw createHttpError(
    503,
    'ASANA_NOT_CONFIGURED',
    'Asana integration not configured (missing ASANA_ACCESS_TOKEN)'
  );
}

/**
 * Create an Asana task
 */
async function createAsanaTask({ name, notes, projectId, assigneeId, collaboratorIds = [], dueOn }) {
  const token = await getAsanaToken();
  
  const taskData = {
    data: {
      name,
      notes,
      projects: [projectId],
      workspace: process.env.ASANA_WORKSPACE_ID || '1203336030510557', // Helix workspace
    }
  };

  // Add assignee if provided
  if (assigneeId) {
    taskData.data.assignee = assigneeId;
  }

  // Add followers/collaborators
  if (collaboratorIds.length > 0) {
    taskData.data.followers = collaboratorIds;
  }

  // Add due date if provided
  if (dueOn) {
    taskData.data.due_on = dueOn;
  }

  const response = await fetch(`${ASANA_BASE_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(taskData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[tech-tickets] Asana API error:', {
      status: response.status,
      bodySnippet: errorText.slice(0, 1000),
    });
    throw createHttpError(502, 'ASANA_API_ERROR', `Asana API error: ${response.status}`, {
      asanaStatus: response.status,
      asanaBody: errorText,
    });
  }

  const result = await response.json();
  return result.data;
}

async function tryInsertIdeaRecord({ title, description, priority, area, submittedBy }) {
  try {
    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('submitted_by', sql.NVarChar, submittedBy || null)
        .input('title', sql.NVarChar, title)
        .input('description', sql.NVarChar, description)
        .input('priority', sql.NVarChar, priority)
        .input('area', sql.NVarChar, area)
        .query(`
          INSERT INTO tech_ideas (
            submitted_by, title, description, priority, area,
            status
          )
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (
            @submitted_by, @title, @description, @priority, @area,
            'submitted'
          )
        `);
      return result.recordset?.[0] || null;
    }, 1);

    return record;
  } catch (err) {
    console.warn('[tech-tickets] Failed to insert tech_ideas record (continuing):', serializeUnknownError(err));
    return null;
  }
}

async function tryMarkIdeaAsanaCreated({ id }) {
  if (!id) return;
  try {
    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, id)
        .query(`
          UPDATE tech_ideas
          SET status = 'asana_created',
              error_code = NULL,
              error_message = NULL
          WHERE id = @id
        `);
    }, 1);
  } catch (err) {
    console.warn('[tech-tickets] Failed to mark tech_ideas as asana_created:', serializeUnknownError(err));
  }
}

async function tryUpdateIdeaFailure({ id, code, message }) {
  if (!id) return;
  try {
    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, id)
        .input('error_code', sql.NVarChar, code || null)
        .input('error_message', sql.NVarChar, (message || '').slice(0, 1000) || null)
        .query(`
          UPDATE tech_ideas
          SET status = 'asana_failed',
              error_code = @error_code,
              error_message = @error_message
          WHERE id = @id
        `);
    }, 1);
  } catch (err) {
    console.warn('[tech-tickets] Failed to update tech_ideas failure info:', serializeUnknownError(err));
  }
}

async function tryInsertProblemRecord({ system, summary, stepsToReproduce, expectedVsActual, urgency, submittedBy }) {
  try {
    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('submitted_by', sql.NVarChar, submittedBy || null)
        .input('system', sql.NVarChar, system)
        .input('summary', sql.NVarChar, summary)
        .input('steps_to_reproduce', sql.NVarChar, stepsToReproduce || null)
        .input('expected_vs_actual', sql.NVarChar, expectedVsActual)
        .input('urgency', sql.NVarChar, urgency)
        .query(`
          INSERT INTO tech_problems (
            submitted_by, system, summary, steps_to_reproduce, expected_vs_actual,
            urgency, status
          )
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (
            @submitted_by, @system, @summary, @steps_to_reproduce, @expected_vs_actual,
            @urgency, 'submitted'
          )
        `);
      return result.recordset?.[0] || null;
    }, 1);

    return record;
  } catch (err) {
    console.warn('[tech-tickets] Failed to insert tech_problems record (continuing):', serializeUnknownError(err));
    return null;
  }
}

async function tryMarkProblemAsanaCreated({ id }) {
  if (!id) return;
  try {
    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, id)
        .query(`
          UPDATE tech_problems
          SET status = 'asana_created',
              error_code = NULL,
              error_message = NULL
          WHERE id = @id
        `);
    }, 1);
  } catch (err) {
    console.warn('[tech-tickets] Failed to mark tech_problems as asana_created:', serializeUnknownError(err));
  }
}

async function tryUpdateProblemFailure({ id, code, message }) {
  if (!id) return;
  try {
    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, id)
        .input('error_code', sql.NVarChar, code || null)
        .input('error_message', sql.NVarChar, (message || '').slice(0, 1000) || null)
        .query(`
          UPDATE tech_problems
          SET status = 'asana_failed',
              error_code = @error_code,
              error_message = @error_message
          WHERE id = @id
        `);
    }, 1);
  } catch (err) {
    console.warn('[tech-tickets] Failed to update tech_problems failure info:', serializeUnknownError(err));
  }
}

/**
 * GET /api/tech-tickets/team
 * Get team members with Asana IDs for assignment dropdowns
 */
router.get('/team', async (req, res) => {
  try {
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const rows = await withRequest(connectionString, async (request) => {
      // Query team table for members with Asana IDs
      const result = await request.query(`
        SELECT 
          [Initials],
          [Full Name],
          [First],
          [Email],
          [ASANA_ID],
          [ASANAUser_ID],
          [ASANATeam_ID],
          [AOW],
          [Role],
          [status]
        FROM [dbo].[team]
        WHERE [status] = 'active'
          AND [ASANAUser_ID] IS NOT NULL
        ORDER BY [Full Name]
      `);
      return result.recordset || [];
    }, 2);

    // Format for frontend consumption
    const teamMembers = rows.map(row => ({
      initials: row.Initials,
      fullName: row['Full Name'],
      firstName: row.First,
      email: row.Email,
      asanaUserId: row.ASANAUser_ID,
      asanaProjectId: row.ASANA_ID,
      asanaTeamId: row.ASANATeam_ID,
      areaOfWork: row.AOW,
      role: row.Role,
    }));

    console.log(`[tech-tickets] Found ${teamMembers.length} team members with Asana IDs`);
    return res.json(teamMembers);

  } catch (error) {
    console.error('[tech-tickets] Team lookup error:', error);
    return res.status(500).json({ error: 'Failed to fetch team data', details: error.message });
  }
});

/**
 * GET /api/tech-tickets/ledger
 * Returns recent tech ideas + tech problems (unified) so the UI can show a ledger.
 */
router.get('/ledger', async (req, res) => {
  try {
    const rawLimit = req.query?.limit;
    const parsedLimit = typeof rawLimit === 'string' ? parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;

    const rawType = req.query?.type;
    const type = typeof rawType === 'string' ? rawType.toLowerCase() : 'all';

    if (type !== 'all' && type !== 'idea' && type !== 'problem') {
      return res.status(400).json({ error: "Invalid type (must be 'all', 'idea', or 'problem')" });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'Invalid limit (must be 1-100)' });
    }

    const items = await withRequest(getConnectionString(), async (request) => {
      const baseQuery = {
        all: `
          SELECT TOP (@limit)
            x.[type],
            x.[id],
            x.[created_at],
            x.[submitted_by],
            x.[title],
            x.[status]
          FROM (
            SELECT
              'idea' AS [type],
              [id],
              [created_at],
              [submitted_by],
              [title],
              [status]
            FROM [dbo].[tech_ideas]
            UNION ALL
            SELECT
              'problem' AS [type],
              [id],
              [created_at],
              [submitted_by],
              [summary] AS [title],
              [status]
            FROM [dbo].[tech_problems]
          ) x
          ORDER BY x.[created_at] DESC
        `,
        idea: `
          SELECT TOP (@limit)
            'idea' AS [type],
            [id],
            [created_at],
            [submitted_by],
            [title],
            [status]
          FROM [dbo].[tech_ideas]
          ORDER BY [created_at] DESC
        `,
        problem: `
          SELECT TOP (@limit)
            'problem' AS [type],
            [id],
            [created_at],
            [submitted_by],
            [summary] AS [title],
            [status]
          FROM [dbo].[tech_problems]
          ORDER BY [created_at] DESC
        `,
      };

      const result = await request
        .input('limit', sql.Int, limit)
        .query(baseQuery[type]);
      return result.recordset || [];
    }, 1);

    return res.json({ items });
  } catch (err) {
    console.error('[tech-tickets] Failed to fetch ledger:', serializeUnknownError(err));
    return res.status(500).json({ error: 'Failed to fetch tech tickets ledger' });
  }
});

/**
 * POST /api/tech-tickets/idea
 * Submit a tech development idea
 * 
 * Body:
 * - title: string (required)
 * - description: string (required)
 * - priority: 'Low' | 'Medium' | 'High'
 * - area: 'Hub' | 'Email' | 'Clio' | 'NetDocs' | 'Other'
 * - submittedBy: string (initials)
 */
router.post('/idea', async (req, res) => {
  try {
    const { title, description, priority = 'Medium', area = 'Hub', submittedBy } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    // Get LZ's Asana user ID for collaborator
    const connectionString = process.env.SQL_CONNECTION_STRING;
    let lzAsanaId = KNOWN_TEAM_MEMBERS.LZ.asanaUserId;

    if (connectionString) {
      try {
        const rows = await withRequest(connectionString, async (request) => {
          const result = await request
            .input('initials', sql.NVarChar, 'LZ')
            .query(`SELECT [ASANAUser_ID] FROM [dbo].[team] WHERE [Initials] = @initials`);
          return result.recordset || [];
        }, 1);
        if (rows.length > 0 && rows[0].ASANAUser_ID) {
          lzAsanaId = rows[0].ASANAUser_ID;
        }
      } catch (dbErr) {
        console.warn('[tech-tickets] Could not fetch LZ Asana ID from DB, using default');
      }
    }

    // Build task description
    const notes = [
      `**Tech Development Idea**`,
      ``,
      `**Submitted by:** ${submittedBy || 'Unknown'}`,
      `**Area:** ${area}`,
      `**Priority:** ${priority}`,
      ``,
      `---`,
      ``,
      description,
    ].join('\n');

    const ideaRecord = await tryInsertIdeaRecord({ title, description, priority, area, submittedBy });

    const techRecipientIds = await tryGetTechRecipientAsanaUserIds();
    const collaboratorIds = Array.from(
      new Set([lzAsanaId, ...techRecipientIds].filter((v) => typeof v === 'string' && v.length > 0))
    );

    // Create Asana task
    let task;
    try {
      task = await createAsanaTask({
        name: `[Idea] ${title}`,
        notes,
        projectId: TECH_PROJECT_ID,
        collaboratorIds,
      });
    } catch (asanaErr) {
      await tryUpdateIdeaFailure({
        id: ideaRecord?.id,
        code: asanaErr?.code,
        message: asanaErr?.message,
      });
      throw asanaErr;
    }

    await tryMarkIdeaAsanaCreated({ id: ideaRecord?.id });

    console.log(`[tech-tickets] Created idea task: ${task.gid}`);
    return res.status(201).json({
      success: true,
      taskId: task.gid,
      taskUrl: `https://app.asana.com/0/${TECH_PROJECT_ID}/${task.gid}`,
    });

  } catch (error) {
    const serialized = serializeUnknownError(error);
    console.error('[tech-tickets] Idea submission error:', serialized);
    const status = (error && error.status) ? error.status : 500;
    const code = (error && error.code) ? error.code : 'TECH_TICKET_CREATE_FAILED';
    const details = serialized.message;
    return res.status(status).json({ error: 'Failed to create idea ticket', code, details });
  }
});

/**
 * POST /api/tech-tickets/problem
 * Report a technical problem
 * 
 * Body:
 * - system: 'Hub' | 'Email' | 'Clio' | 'NetDocs' | 'Asana' | 'Other' (required)
 * - summary: string (required)
 * - stepsToReproduce: string (optional)
 * - expectedVsActual: string (required)
 * - urgency: 'Blocking' | 'Annoying' | 'Minor' (required)
 * - submittedBy: string (initials)
 */
router.post('/problem', async (req, res) => {
  try {
    const { 
      system, 
      summary, 
      stepsToReproduce, 
      expectedVsActual, 
      urgency = 'Annoying',
      submittedBy 
    } = req.body;

    if (!system || !summary || !expectedVsActual) {
      return res.status(400).json({ 
        error: 'system, summary, and expectedVsActual are required' 
      });
    }

    // Get Asana user IDs for the tech team based on Role
    const connectionString = process.env.SQL_CONNECTION_STRING;
    void connectionString;

    // Build task description
    const urgencyEmoji = {
      Blocking: '🔴',
      Annoying: '🟡',
      Minor: '🟢',
    }[urgency] || '🟡';

    const notes = [
      `**Technical Problem Report** ${urgencyEmoji}`,
      ``,
      `**Submitted by:** ${submittedBy || 'Unknown'}`,
      `**System:** ${system}`,
      `**Urgency:** ${urgency}`,
      ``,
      `---`,
      ``,
      `**Summary:**`,
      summary,
      ``,
      stepsToReproduce ? `**Steps to Reproduce:**\n${stepsToReproduce}\n` : '',
      `**Expected vs Actual:**`,
      expectedVsActual,
    ].filter(Boolean).join('\n');

    // Determine due date based on urgency
    const now = new Date();
    let dueOn;
    if (urgency === 'Blocking') {
      dueOn = now.toISOString().split('T')[0]; // Today
    } else if (urgency === 'Annoying') {
      now.setDate(now.getDate() + 3);
      dueOn = now.toISOString().split('T')[0]; // 3 days
    }
    // Minor = no due date

    const problemRecord = await tryInsertProblemRecord({
      system,
      summary,
      stepsToReproduce,
      expectedVsActual,
      urgency,
      submittedBy,
    });

    // Create Asana task - assign to LZ (first assignee), others as collaborators
    const techRecipientIds = await tryGetTechRecipientAsanaUserIds();
    const fallbackAssignees = [KNOWN_TEAM_MEMBERS.LZ.asanaUserId, KNOWN_TEAM_MEMBERS.KW.asanaUserId]
      .filter((v) => typeof v === 'string' && v.length > 0);
    const assigneeIds = techRecipientIds.length > 0 ? techRecipientIds : fallbackAssignees;

    const primaryAssignee = assigneeIds[0];
    const collaborators = assigneeIds.slice(1);

    let task;
    try {
      task = await createAsanaTask({
        name: `[${system}] ${summary}`,
        notes,
        projectId: TECH_PROJECT_ID,
        assigneeId: primaryAssignee,
        collaboratorIds: collaborators,
        dueOn,
      });
    } catch (asanaErr) {
      await tryUpdateProblemFailure({
        id: problemRecord?.id,
        code: asanaErr?.code,
        message: asanaErr?.message,
      });
      throw asanaErr;
    }

    await tryMarkProblemAsanaCreated({ id: problemRecord?.id });

    console.log(`[tech-tickets] Created problem task: ${task.gid}`);
    return res.status(201).json({
      success: true,
      taskId: task.gid,
      taskUrl: `https://app.asana.com/0/${TECH_PROJECT_ID}/${task.gid}`,
    });

  } catch (error) {
    const serialized = serializeUnknownError(error);
    console.error('[tech-tickets] Problem submission error:', serialized);
    const status = (error && error.status) ? error.status : 500;
    const code = (error && error.code) ? error.code : 'TECH_TICKET_CREATE_FAILED';
    const details = serialized.message;
    return res.status(status).json({ error: 'Failed to create problem ticket', code, details });
  }
});

/**
 * GET /api/tech-tickets/projects
 * List available Asana projects (for configuration/debugging)
 */
router.get('/projects', async (req, res) => {
  try {
    const token = await getAsanaToken();
    const workspaceId = process.env.ASANA_WORKSPACE_ID || '1203336030510557';

    const response = await fetch(
      `${ASANA_BASE_URL}/workspaces/${workspaceId}/projects?opt_fields=name,gid,archived`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Asana API error: ${response.status}`);
    }

    const result = await response.json();
    const activeProjects = (result.data || [])
      .filter(p => !p.archived)
      .map(p => ({ id: p.gid, name: p.name }));

    return res.json(activeProjects);

  } catch (error) {
    const serialized = serializeUnknownError(error);
    console.error('[tech-tickets] Projects list error:', serialized);
    const status = (error && error.status) ? error.status : 500;
    const code = (error && error.code) ? error.code : 'ASANA_PROJECTS_FETCH_FAILED';
    const details = serialized.message;
    return res.status(status).json({ error: 'Failed to fetch projects', code, details });
  }
});

module.exports = router;
