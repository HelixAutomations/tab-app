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

function getBotItems(limit) {
  return list({ type: 'teams.bot', limit: Math.min(limit * 3, MAX_LIMIT) })
    .filter((event) => event.status !== 'started')
    .map(mapBotEvent);
}

function getCardLabItems(limit) {
  return list({ type: 'activity.cardlab.send', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapCardLabSend);
}

function getBotActionItems(limit) {
  return list({ type: 'teams.bot.action', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapBotActionEvent);
}

function getDmSendItems(limit) {
  return list({ type: 'activity.dm.send', limit: Math.min(limit * 2, MAX_LIMIT) })
    .map(mapDmSendEvent);
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

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const limit = parseLimit(req.query.limit);

  try {
    const [botItems, trackedItems] = await Promise.all([
      Promise.resolve(getBotItems(limit)),
      getTrackedCardItems(limit),
    ]);
    const cardLabItems = getCardLabItems(limit);
    const botActionItems = getBotActionItems(limit);
    const dmSendItems = getDmSendItems(limit);

    const items = [...botItems, ...trackedItems, ...cardLabItems, ...botActionItems, ...dmSendItems]
      .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left))
      .slice(0, limit);

    const durationMs = Date.now() - startedAt;
    trackEvent('ActivityFeed.Fetch.Completed', {
      operation: 'list',
      limit,
      itemCount: items.length,
      botCount: botItems.length,
      trackedCount: trackedItems.length,
      cardLabCount: cardLabItems.length,
      botActionCount: botActionItems.length,
      dmSendCount: dmSendItems.length,
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