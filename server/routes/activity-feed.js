const express = require('express');
const { list } = require('../utils/opLog');
const { withRequest } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { buildTeamsDeepLink } = require('../utils/teamsDeepLink');

const router = express.Router();
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function getEventTimestamp(item) {
  const parsed = Date.parse(item?.timestamp || item?.ts || item?.updatedAt || item?.createdAt || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildBotTitle(event) {
  if (event.activityType === 'invoke') {
    return event.actionName ? `Team Hub action: ${event.actionName}` : 'Team Hub action received';
  }
  if (event.activityType === 'message') {
    return 'Team Hub message received';
  }
  if (event.activityType) {
    return `Team Hub ${event.activityType} received`;
  }
  return 'Team Hub bot activity';
}

function mapBotEvent(event) {
  const summaryParts = [];
  if (event.conversationType && event.conversationType !== 'unknown') {
    summaryParts.push(event.conversationType);
  }
  if (event.activityName) {
    summaryParts.push(event.activityName);
  }
  if (event.actionName && event.activityType !== 'invoke') {
    summaryParts.push(`action ${event.actionName}`);
  }
  if (event.error) {
    summaryParts.push(event.error);
  }

  return {
    id: `bot-${event.id}`,
    source: 'teams.bot',
    sourceLabel: 'Hub bot',
    status: event.status === 'error' ? 'error' : 'success',
    title: buildBotTitle(event),
    summary: summaryParts.join(' · ') || 'Inbound Teams bot traffic received by Team Hub.',
    timestamp: event.ts,
  };
}

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

function mapCardLabSend(event) {
  return {
    id: `cardlab-${event.id}`,
    source: 'activity.cardlab',
    sourceLabel: 'Card Lab',
    status: 'success',
    title: event.title || `Card sent to ${event.routeLabel || 'Teams'}`,
    summary: event.summary || 'Card sent from Activity Card Lab.',
    timestamp: event.ts,
    teamsLink: event.teamsLink || null,
  };
}

function mapNotificationCardSend(event) {
  const summaryParts = [];
  if (event.templateLabel) summaryParts.push(event.templateLabel);
  if (event.routeLabel) summaryParts.push(event.routeLabel);
  if (event.summary) summaryParts.push(event.summary);

  return {
    id: `notification-card-${event.id}`,
    source: 'activity.card.send',
    sourceLabel: 'Team Hub card',
    status: event.status === 'error' ? 'error' : 'success',
    title: event.title || `${event.templateLabel || 'Team Hub card'} sent`,
    summary: summaryParts.join(' · '),
    timestamp: event.ts,
    teamsLink: event.teamsLink || null,
  };
}

function mapBotActionEvent(event) {
  const actionLabel = event.action || 'unknown';
  return {
    id: `bot-action-${event.id}`,
    source: 'teams.bot.action',
    sourceLabel: 'Bot action',
    status: event.status === 'error' ? 'error' : 'success',
    title: `Action: ${actionLabel}${event.userName ? ` by ${event.userName}` : ''}`,
    summary: event.conversationType ? `${event.conversationType} · ${actionLabel}` : actionLabel,
    timestamp: event.ts,
  };
}

function mapDmSendEvent(event) {
  return {
    id: `dm-${event.id}`,
    source: 'activity.dm.send',
    sourceLabel: 'DM sent',
    status: event.status === 'error' ? 'error' : 'success',
    title: `DM card sent${event.displayName ? ` to ${event.displayName}` : ''}`,
    summary: event.action ? `${event.action}${event.email ? ` · ${event.email}` : ''}` : 'Direct message card.',
    timestamp: event.ts,
  };
}

function mapCclAutopilotEvent(event) {
  const label = event.matterDisplayNumber || event.matterId || 'matter';
  const title = event.status === 'error'
    ? `CCL autopilot failed for ${label}`
    : event.allGreen
      ? `CCL autopilot ran for ${label}`
      : `CCL autopilot completed for ${label}`;
  return {
    id: `ccl-autopilot-${event.id}`,
    source: 'activity.ccl.autopilot',
    sourceLabel: 'CCL autopilot',
    status: event.status === 'error' ? 'error' : (event.allGreen ? 'success' : 'info'),
    title,
    summary: event.summary || '',
    timestamp: event.ts,
  };
}

function getBotItems(limit) {
  return list({ type: 'teams.bot', limit: Math.min(limit * 3, MAX_LIMIT) })
    .filter((event) => event.status !== 'started')
    .map(mapBotEvent);
}

function getCardLabItems(limit) {
  return list({ type: 'activity.cardlab.send', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapCardLabSend);
}

function getNotificationCardItems(limit) {
  return list({ type: 'activity.card.send', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapNotificationCardSend);
}

function getBotActionItems(limit) {
  return list({ type: 'teams.bot.action', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapBotActionEvent);
}

function getDmSendItems(limit) {
  return list({ type: 'activity.dm.send', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapDmSendEvent);
}

function getCclAutopilotItems(limit) {
  return list({ type: 'activity.ccl.autopilot', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapCclAutopilotEvent);
}

async function getTrackedCardItems(limit) {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return [];
  }

  const boundedLimit = Math.min(limit, MAX_LIMIT);
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
}

// ── Helix Operations Platform sources ──────────────────────────────────────
// Both helpers tolerate the platform being disabled (kill switch) and never
// throw — Activity feed degrades to existing sources rather than failing the
// whole route.

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
  const boundedLimit = Math.min(limit * 2, MAX_LIMIT);
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
  const boundedLimit = Math.min(limit * 2, MAX_LIMIT);
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
  const boundedLimit = Math.min(limit * 2, MAX_LIMIT);
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

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const limit = parseLimit(req.query.limit);

  try {
    const [botItems, trackedItems, formSubmissionItems, aiProposalItems, hubTodoItems] = await Promise.all([
      Promise.resolve(getBotItems(limit)),
      getTrackedCardItems(limit),
      getFormSubmissionItems(limit),
      getAiProposalItems(limit),
      getHubTodoItems(limit),
    ]);
    const cardLabItems = getCardLabItems(limit);
    const notificationCardItems = getNotificationCardItems(limit);
    const botActionItems = getBotActionItems(limit);
    const dmSendItems = getDmSendItems(limit);
    const cclAutopilotItems = getCclAutopilotItems(limit);

    const items = [
      ...botItems,
      ...trackedItems,
      ...formSubmissionItems,
      ...aiProposalItems,
      ...hubTodoItems,
      ...cardLabItems,
      ...notificationCardItems,
      ...botActionItems,
      ...dmSendItems,
      ...cclAutopilotItems,
    ]
      .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left))
      .slice(0, limit);

    const durationMs = Date.now() - startedAt;
    trackEvent('ActivityFeed.Fetch.Completed', {
      operation: 'list',
      limit,
      itemCount: items.length,
      botCount: botItems.length,
      trackedCount: trackedItems.length,
      formSubmissionCount: formSubmissionItems.length,
      aiProposalCount: aiProposalItems.length,
      hubTodoCount: hubTodoItems.length,
      cardLabCount: cardLabItems.length,
      notificationCardCount: notificationCardItems.length,
      botActionCount: botActionItems.length,
      dmSendCount: dmSendItems.length,
      cclAutopilotCount: cclAutopilotItems.length,
      durationMs,
    });
    trackMetric('ActivityFeed.Fetch.Duration', durationMs, {
      operation: 'list',
      itemCount: items.length,
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error instanceof Error ? error : new Error(String(error));

    trackException(err, {
      component: 'ActivityFeed',
      operation: 'list',
      phase: 'route',
    });
    trackEvent('ActivityFeed.Fetch.Failed', {
      operation: 'list',
      limit,
      error: err.message,
      durationMs,
    });
    trackMetric('ActivityFeed.Fetch.Duration', durationMs, {
      operation: 'list',
      status: 'failed',
    });

    return res.status(500).json({
      error: 'Failed to load activity feed',
      detail: err.message,
    });
  }
});

module.exports = router;