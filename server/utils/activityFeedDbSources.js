const { withRequest } = require('./db');
const { trackException } = require('./appInsights');
const { buildTeamsDeepLink } = require('./teamsDeepLink');
const { MAX_ACTIVITY_FEED_LIMIT } = require('./activityFeedSources');

function mapTrackedCard(row) {
  const subject = row.LeadName || row.Email || `Enquiry ${row.EnquiryId}`;
  const summaryParts = [];
  if (row.CardType) {
    summaryParts.push(row.CardType);
  }
  if (row.Stage) {
    summaryParts.push(`stage ${row.Stage}`);
  }
  if (row.ClaimedBy) {
    summaryParts.push(`claimed by ${row.ClaimedBy}`);
  }

  return {
    id: `tracked-${row.Id}`,
    source: 'teams.card',
    sourceLabel: 'Enquiry card',
    status: row.ClaimedBy ? 'active' : 'info',
    title: row.ClaimedBy ? `Card updated for ${subject}` : `Card tracked for ${subject}`,
    summary: summaryParts.join(' · ') || 'Tracked enquiry-processing Teams card activity.',
    timestamp: row.UpdatedAt || row.CreatedAt,
    teamsLink: buildTeamsDeepLink(
      row.ChannelId,
      row.ActivityId,
      row.TeamId,
      row.TeamsMessageId,
      row.CreatedAtMs,
      row.MessageTimestamp,
    ),
  };
}

async function getTrackedCardItems(limit) {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return [];
  }

  const boundedLimit = Math.min(limit, MAX_ACTIVITY_FEED_LIMIT);
  try {
    const rows = await withRequest(connectionString, async (request) => {
      const result = await request.query(`
        SELECT TOP ${boundedLimit}
          Id,
          ActivityId,
          ChannelId,
          TeamId,
          EnquiryId,
          LeadName,
          Email,
          CardType,
          MessageTimestamp,
          TeamsMessageId,
          DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
          Stage,
          Status,
          ClaimedBy,
          ClaimedAt,
          CreatedAt,
          UpdatedAt
        FROM [instructions].[dbo].[TeamsBotActivityTracking]
        WHERE Status = 'active'
        ORDER BY COALESCE(UpdatedAt, ClaimedAt, CreatedAt) DESC
      `);

      return result.recordset || [];
    }, 2);

    return rows.map(mapTrackedCard);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      component: 'ActivityFeed',
      operation: 'getTrackedCardItems',
    });
    return [];
  }
}

function getOpsConnectionString() {
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() !== 'true') {
    return null;
  }
  return process.env.OPS_SQL_CONNECTION_STRING || null;
}

function statusFromProcessing(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'failed') return 'error';
  if (normalized === 'complete') return 'success';
  if (normalized === 'processing' || normalized === 'queued') return 'info';
  return 'info';
}

function mapFormSubmissionRow(row) {
  const submitter = row.submitted_by || 'unknown';
  const formKey = row.form_key || 'unknown';
  const status = statusFromProcessing(row.processing_status);
  const summaryParts = [`form ${formKey}`];
  if (row.lane) summaryParts.push(row.lane);
  if (row.last_event) summaryParts.push(row.last_event);

  return {
    id: `form-submission-${row.id}`,
    source: 'forms.submission',
    sourceLabel: 'Form submission',
    status,
    title: row.summary || `Form submission by ${submitter}`,
    summary: summaryParts.join(' · '),
    timestamp: row.last_event_at || row.submitted_at,
  };
}

async function getFormSubmissionItems(limit) {
  const connectionString = getOpsConnectionString();
  if (!connectionString) return [];
  const boundedLimit = Math.min(limit * 2, MAX_ACTIVITY_FEED_LIMIT);
  try {
    const rows = await withRequest(connectionString, async (request, sql) => {
      request.input('top', sql.Int, boundedLimit);
      const result = await request.query(`
        SELECT TOP (@top)
          id, form_key, submitted_by, submitted_at, lane, summary,
          processing_status, last_event, last_event_at
        FROM dbo.form_submissions
        WHERE archived_at IS NULL
        ORDER BY COALESCE(last_event_at, submitted_at) DESC
      `);
      return result.recordset || [];
    }, 2);
    return rows.map(mapFormSubmissionRow);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      component: 'ActivityFeed',
      operation: 'getFormSubmissionItems',
    });
    return [];
  }
}

function mapAiProposalRow(row) {
  const outcome = String(row.outcome || 'pending').toLowerCase();
  let status = 'info';
  if (outcome === 'accepted') status = 'success';
  else if (outcome === 'failed') status = 'error';
  const surface = row.surface || 'ai';
  const summaryParts = [`outcome ${outcome}`];
  if (row.target_kind) summaryParts.push(row.target_kind);
  if (row.confidence_summary) summaryParts.push(row.confidence_summary);

  return {
    id: `ai-proposal-${row.id}`,
    source: 'ai.proposal',
    sourceLabel: `AI ${surface}`,
    status,
    title: `AI proposal by ${row.created_by || 'unknown'}`,
    summary: summaryParts.join(' · '),
    timestamp: row.outcome_at || row.created_at,
  };
}

async function getAiProposalItems(limit) {
  const connectionString = getOpsConnectionString();
  if (!connectionString) return [];
  const boundedLimit = Math.min(limit * 2, MAX_ACTIVITY_FEED_LIMIT);
  try {
    const rows = await withRequest(connectionString, async (request, sql) => {
      request.input('top', sql.Int, boundedLimit);
      const result = await request.query(`
        SELECT TOP (@top)
          id, created_at, created_by, surface, target_kind,
          confidence_summary, outcome, outcome_at
        FROM dbo.ai_proposals
        ORDER BY COALESCE(outcome_at, created_at) DESC
      `);
      return result.recordset || [];
    }, 2);
    return rows.map(mapAiProposalRow);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      component: 'ActivityFeed',
      operation: 'getAiProposalItems',
    });
    return [];
  }
}

function mapHubTodoRow(row) {
  const completed = row.completed_at != null;
  const status = completed ? 'success' : 'info';
  const kind = row.kind || 'todo';
  const ownerInitials = row.owner_initials || 'unknown';
  const summaryParts = [`kind ${kind}`];
  if (row.matter_ref) summaryParts.push(String(row.matter_ref));
  if (row.doc_type) summaryParts.push(String(row.doc_type));
  if (completed) {
    summaryParts.push(`completed via ${row.completed_via || 'hub'}`);
  } else if (row.last_event) {
    summaryParts.push(String(row.last_event));
  }
  return {
    id: `hub-todo-${row.id}`,
    source: 'hub.todo',
    sourceLabel: 'Hub to-do',
    status,
    title: row.summary || `To-do · ${kind} · ${ownerInitials}`,
    summary: summaryParts.join(' · '),
    timestamp: row.completed_at || row.created_at,
  };
}

async function getHubTodoItems(limit) {
  const connectionString = getOpsConnectionString();
  if (!connectionString) return [];
  const boundedLimit = Math.min(limit * 2, MAX_ACTIVITY_FEED_LIMIT);
  try {
    const rows = await withRequest(connectionString, async (request, sql) => {
      request.input('top', sql.Int, boundedLimit);
      const result = await request.query(`
        SELECT TOP (@top)
          id, kind, owner_initials, matter_ref, doc_type,
          summary, created_at, completed_at, completed_via, last_event
        FROM dbo.hub_todo
        ORDER BY COALESCE(completed_at, created_at) DESC
      `);
      return result.recordset || [];
    }, 2);
    return rows.map(mapHubTodoRow);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      component: 'ActivityFeed',
      operation: 'getHubTodoItems',
    });
    return [];
  }
}

async function getDatabaseActivityItems(limit) {
  const [trackedItems, formSubmissionItems, aiProposalItems, hubTodoItems] = await Promise.all([
    getTrackedCardItems(limit),
    getFormSubmissionItems(limit),
    getAiProposalItems(limit),
    getHubTodoItems(limit),
  ]);

  return {
    items: [
      ...trackedItems,
      ...formSubmissionItems,
      ...aiProposalItems,
      ...hubTodoItems,
    ],
    counts: {
      tracked: trackedItems.length,
      formSubmission: formSubmissionItems.length,
      aiProposal: aiProposalItems.length,
      hubTodo: hubTodoItems.length,
    },
  };
}

module.exports = {
  getDatabaseActivityItems,
};