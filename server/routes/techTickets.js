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
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
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
    const pool = await getTeamSqlPool();
    const result = await pool
      .request()
      .input('roleLike', sql.NVarChar, '%tech%')
      .query(`
        SELECT [ASANAUser_ID]
        FROM [dbo].[team]
        WHERE [status] = 'active'
          AND [ASANAUser_ID] IS NOT NULL
          AND [Role] LIKE @roleLike
      `);

    const rows = result.recordset || [];
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

const KV_URI = 'https://helix-keys.vault.azure.net/';
const CORE_SQL_SERVER = 'helix-database-server.database.windows.net';
const CORE_SQL_DATABASE = 'helix-core-data';
const ASANA_WORKSPACE_ID = '1203336030510557';

// Tech team project ID
const TECH_PROJECT_ID = '1204962032378888';

// Connection string for helix_projects database (falls back to core SQL)
const getConnectionString = () => {
  const connStr = process.env.PROJECTS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('Database connection string not configured');
  }
  return connStr;
};

let cachedCorePool;

async function getTeamSqlPool() {
  if (cachedCorePool) return cachedCorePool;
  const secretClient = new SecretClient(KV_URI, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret('sql-databaseserver-password');
  cachedCorePool = await sql.connect({
    server: CORE_SQL_SERVER,
    database: CORE_SQL_DATABASE,
    user: 'helix-database-server',
    password: passwordSecret.value,
    options: { encrypt: true, enableArithAbort: true },
  });
  return cachedCorePool;
}

// Known Asana user IDs for tech team (from team database)
// These will be fetched dynamically from the team table
const KNOWN_TEAM_MEMBERS = {
  LZ: { name: 'Lukasz Zemanek', asanaUserId: '1203336817680917' },
  KW: { name: 'Kanchel White', asanaUserId: '1203336030510561' },
  // CB - Need to look up from database
};

async function getAsanaCredentials(initials) {
  if (!initials) return null;
  const pool = await getTeamSqlPool();
  const result = await pool
    .request()
    .input('Initials', sql.NVarChar, initials.toUpperCase())
    .query(`
      SELECT [ASANAClient_ID], [ASANASecret], [ASANARefreshToken], [ASANAUser_ID]
      FROM [dbo].[team]
      WHERE UPPER([Initials]) = @Initials
    `);

  if (!result.recordset?.length) return null;
  const row = result.recordset[0];
  if (!row.ASANAClient_ID || !row.ASANASecret || !row.ASANARefreshToken) return null;
  return {
    clientId: row.ASANAClient_ID,
    secret: row.ASANASecret,
    refreshToken: row.ASANARefreshToken,
    userId: row.ASANAUser_ID,
  };
}

async function getAsanaAccessToken(credentials) {
  const { clientId, secret, refreshToken } = credentials;
  const tokenUrl = `https://app.asana.com/-/oauth_token?grant_type=refresh_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}&refresh_token=${encodeURIComponent(refreshToken)}`;
  const response = await fetch(tokenUrl, { method: 'POST' });
  if (!response.ok) {
    throw createHttpError(502, 'ASANA_TOKEN_REFRESH_FAILED', 'Failed to refresh Asana token');
  }
  const data = await response.json();
  return data.access_token;
}

/**
 * Create an Asana task
 */
async function createAsanaTask({ accessToken, name, notes, projectId, assigneeId, collaboratorIds = [], dueOn }) {
  
  const taskData = {
    data: {
      name,
      notes,
      projects: [projectId],
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
      'Authorization': `Bearer ${accessToken}`,
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
    const pool = await getTeamSqlPool();
    const result = await pool.request().query(`
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
    const rows = result.recordset || [];

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
 * PATCH /api/tech-tickets/item/:type/:id
 * Update a tech idea/problem title/summary or status.
 */
router.patch('/item/:type/:id', async (req, res) => {
  try {
    const rawType = req.params?.type;
    const type = typeof rawType === 'string' ? rawType.toLowerCase() : '';
    const id = Number(req.params?.id);

    if (!id || (type !== 'idea' && type !== 'problem')) {
      return res.status(400).json({ error: "Invalid type or id" });
    }

    const { title, status } = req.body || {};
    const nextTitle = typeof title === 'string' ? title.trim() : '';
    const nextStatus = typeof status === 'string' ? status.trim() : '';

    if (!nextTitle && !nextStatus) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const table = type === 'idea' ? '[dbo].[tech_ideas]' : '[dbo].[tech_problems]';
    const titleField = type === 'idea' ? '[title]' : '[summary]';

    await withRequest(getConnectionString(), async (request) => {
      request.input('id', sql.Int, id);
      request.input('title', sql.NVarChar, type === 'idea' ? 200 : 500, nextTitle || null);
      request.input('status', sql.NVarChar, 30, nextStatus || null);

      await request.query(`
        UPDATE ${table}
        SET
          ${titleField} = COALESCE(@title, ${titleField}),
          [status] = COALESCE(@status, [status])
        WHERE [id] = @id
      `);
    }, 1);

    return res.json({ success: true });
  } catch (err) {
    console.error('[tech-tickets] Failed to update ticket:', serializeUnknownError(err));
    return res.status(500).json({ error: 'Failed to update tech ticket' });
  }
});

/**
 * DELETE /api/tech-tickets/item/:type/:id
 * Remove a tech idea/problem.
 */
router.delete('/item/:type/:id', async (req, res) => {
  try {
    const rawType = req.params?.type;
    const type = typeof rawType === 'string' ? rawType.toLowerCase() : '';
    const id = Number(req.params?.id);

    if (!id || (type !== 'idea' && type !== 'problem')) {
      return res.status(400).json({ error: "Invalid type or id" });
    }

    const table = type === 'idea' ? '[dbo].[tech_ideas]' : '[dbo].[tech_problems]';

    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, id)
        .query(`DELETE FROM ${table} WHERE [id] = @id`);
    }, 1);

    return res.json({ success: true });
  } catch (err) {
    console.error('[tech-tickets] Failed to delete ticket:', serializeUnknownError(err));
    return res.status(500).json({ error: 'Failed to delete tech ticket' });
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
    const {
      title,
      description,
      priority = 'Medium',
      area = 'Hub',
      submittedBy,
      submitted_by_initials,
      submitted_by,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    const submitterInitials = (submitted_by_initials || submittedBy || '').trim();
    const submittedLabel = submitted_by || submittedBy || 'Unknown';
    const submittedByValue = submitterInitials ? submitterInitials.slice(0, 10) : null;

    // Get LZ's Asana user ID for collaborator
    let lzAsanaId = KNOWN_TEAM_MEMBERS.LZ.asanaUserId;

    try {
      const pool = await getTeamSqlPool();
      const result = await pool
        .request()
        .input('initials', sql.NVarChar, 'LZ')
        .query('SELECT [ASANAUser_ID] FROM [dbo].[team] WHERE [Initials] = @initials');
      const rows = result.recordset || [];
      if (rows.length > 0 && rows[0].ASANAUser_ID) {
        lzAsanaId = rows[0].ASANAUser_ID;
      }
    } catch (dbErr) {
      console.warn('[tech-tickets] Could not fetch LZ Asana ID from DB, using default');
    }

    // Build task description
    const notes = [
      `**Tech Development Idea**`,
      ``,
      `**Submitted by:** ${submittedLabel}`,
      `**Area:** ${area}`,
      `**Priority:** ${priority}`,
      ``,
      `---`,
      ``,
      description,
    ].join('\n');

    const ideaRecord = await tryInsertIdeaRecord({ title, description, priority, area, submittedBy: submittedByValue });

    const techRecipientIds = await tryGetTechRecipientAsanaUserIds();
    const collaboratorIds = Array.from(
      new Set([lzAsanaId, ...techRecipientIds].filter((v) => typeof v === 'string' && v.length > 0))
    );

    // Create Asana task
    let task;
    try {
      if (!submitterInitials) {
        throw createHttpError(400, 'ASANA_CREDENTIALS_MISSING', 'Submitter initials are required for Asana authentication.');
      }

      const asanaCredentials = await getAsanaCredentials(submitterInitials);
      if (!asanaCredentials) {
        throw createHttpError(400, 'ASANA_CREDENTIALS_MISSING', 'Asana credentials not found for the provided initials.');
      }

      const accessToken = await getAsanaAccessToken(asanaCredentials);
      task = await createAsanaTask({
        accessToken,
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

      if (asanaErr?.code === 'ASANA_CREDENTIALS_MISSING') {
        return res.status(201).json({
          success: true,
          taskId: null,
          taskUrl: null,
          recordId: ideaRecord?.id ?? null,
          warning: 'Idea recorded but Asana credentials were not found for the submitter.',
          code: 'ASANA_CREDENTIALS_MISSING',
        });
      }

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
      submittedBy,
      submitted_by_initials,
      submitted_by,
    } = req.body;

    if (!system || !summary || !expectedVsActual) {
      return res.status(400).json({ 
        error: 'system, summary, and expectedVsActual are required' 
      });
    }

    // Build task description
    const urgencyEmoji = {
      Blocking: '🔴',
      Annoying: '🟡',
      Minor: '🟢',
    }[urgency] || '🟡';

    const submitterInitials = (submitted_by_initials || submittedBy || '').trim();
    const submittedLabel = submitted_by || submittedBy || 'Unknown';
    const submittedByValue = submitterInitials ? submitterInitials.slice(0, 10) : null;

    const notes = [
      `**Technical Problem Report** ${urgencyEmoji}`,
      ``,
      `**Submitted by:** ${submittedLabel}`,
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
      submittedBy: submittedByValue,
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
      if (!submitterInitials) {
        throw createHttpError(400, 'ASANA_CREDENTIALS_MISSING', 'Submitter initials are required for Asana authentication.');
      }

      const asanaCredentials = await getAsanaCredentials(submitterInitials);
      if (!asanaCredentials) {
        throw createHttpError(400, 'ASANA_CREDENTIALS_MISSING', 'Asana credentials not found for the provided initials.');
      }

      const accessToken = await getAsanaAccessToken(asanaCredentials);
      task = await createAsanaTask({
        accessToken,
        name: `[Problem: ${system}] ${summary}`,
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

      if (asanaErr?.code === 'ASANA_CREDENTIALS_MISSING') {
        return res.status(201).json({
          success: true,
          taskId: null,
          taskUrl: null,
          recordId: problemRecord?.id ?? null,
          warning: 'Problem recorded but Asana credentials were not found for the submitter.',
          code: 'ASANA_CREDENTIALS_MISSING',
        });
      }

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
    const rawInitials = req.query?.initials;
    const initials = typeof rawInitials === 'string' ? rawInitials.trim() : '';
    if (!initials) {
      return res.status(400).json({ error: 'initials query param is required' });
    }

    const asanaCredentials = await getAsanaCredentials(initials);
    if (!asanaCredentials) {
      return res.status(400).json({ error: 'Asana credentials not found for the provided initials.' });
    }

    const token = await getAsanaAccessToken(asanaCredentials);
    const workspaceId = ASANA_WORKSPACE_ID;

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
