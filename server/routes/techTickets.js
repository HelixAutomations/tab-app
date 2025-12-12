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

// Asana API configuration
const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';

// Tech team project ID - TODO: Fetch from Asana API or configure in env
// For now, using LZ's team project as placeholder
const TECH_PROJECT_ID = process.env.ASANA_TECH_PROJECT_ID || '1204962032378888';

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
  throw new Error('ASANA_ACCESS_TOKEN not configured');
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
    console.error('[tech-tickets] Asana API error:', errorText);
    throw new Error(`Asana API error: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
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

    // Create Asana task
    const task = await createAsanaTask({
      name: `[Idea] ${title}`,
      notes,
      projectId: TECH_PROJECT_ID,
      collaboratorIds: [lzAsanaId], // LZ as collaborator
    });

    console.log(`[tech-tickets] Created idea task: ${task.gid}`);
    return res.status(201).json({
      success: true,
      taskId: task.gid,
      taskUrl: `https://app.asana.com/0/${TECH_PROJECT_ID}/${task.gid}`,
    });

  } catch (error) {
    console.error('[tech-tickets] Idea submission error:', error);
    return res.status(500).json({ error: 'Failed to create idea ticket', details: error.message });
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

    // Get Asana user IDs for LZ, CB, KW
    const connectionString = process.env.SQL_CONNECTION_STRING;
    const assigneeIds = [];

    if (connectionString) {
      try {
        const rows = await withRequest(connectionString, async (request) => {
          const result = await request.query(`
            SELECT [Initials], [ASANAUser_ID] 
            FROM [dbo].[team] 
            WHERE [Initials] IN ('LZ', 'CB', 'KW')
              AND [ASANAUser_ID] IS NOT NULL
          `);
          return result.recordset || [];
        }, 1);

        for (const row of rows) {
          if (row.ASANAUser_ID) {
            assigneeIds.push(row.ASANAUser_ID);
          }
        }
      } catch (dbErr) {
        console.warn('[tech-tickets] Could not fetch team Asana IDs from DB, using defaults');
        // Fall back to known IDs
        assigneeIds.push(KNOWN_TEAM_MEMBERS.LZ.asanaUserId);
        assigneeIds.push(KNOWN_TEAM_MEMBERS.KW.asanaUserId);
      }
    }

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

    // Create Asana task - assign to LZ (first assignee), others as collaborators
    const primaryAssignee = assigneeIds[0];
    const collaborators = assigneeIds.slice(1);

    const task = await createAsanaTask({
      name: `[${system}] ${summary}`,
      notes,
      projectId: TECH_PROJECT_ID,
      assigneeId: primaryAssignee,
      collaboratorIds: collaborators,
      dueOn,
    });

    console.log(`[tech-tickets] Created problem task: ${task.gid}`);
    return res.status(201).json({
      success: true,
      taskId: task.gid,
      taskUrl: `https://app.asana.com/0/${TECH_PROJECT_ID}/${task.gid}`,
    });

  } catch (error) {
    console.error('[tech-tickets] Problem submission error:', error);
    return res.status(500).json({ error: 'Failed to create problem ticket', details: error.message });
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
    console.error('[tech-tickets] Projects list error:', error);
    return res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  }
});

module.exports = router;
