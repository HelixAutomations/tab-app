const { list } = require('./opLog');

const MAX_ACTIVITY_FEED_LIMIT = 50;

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

function mapEmailSearchEvent(event) {
  return {
    id: `email-search-${event.id}`,
    source: 'activity.email.search',
    sourceLabel: 'Email thread',
    status: event.status === 'error' ? 'error' : 'info',
    title: event.title || 'Email thread viewed',
    summary: event.summary || 'Mailbox search activity recorded.',
    timestamp: event.ts,
  };
}

function mapEmailForwardEvent(event) {
  return {
    id: `email-forward-${event.id}`,
    source: 'activity.email.forward',
    sourceLabel: 'Email forward',
    status: event.status === 'error' ? 'error' : 'success',
    title: event.title || 'Email forwarded',
    summary: event.summary || 'Email forward activity recorded.',
    timestamp: event.ts,
  };
}

function mapMatterOpeningEvent(event) {
  const summaryParts = [];
  if (event.step) summaryParts.push(event.step);
  if (event.initials) summaryParts.push(`operator ${event.initials}`);
  if (event.traceId) summaryParts.push(`trace ${event.traceId}`);
  if (event.summary) summaryParts.push(event.summary);

  return {
    id: `matter-opening-${event.id}`,
    source: 'activity.matter-opening',
    sourceLabel: 'Matter opening',
    status: event.status === 'error' ? 'error' : 'info',
    title: event.title || 'Matter opening event',
    summary: summaryParts.join(' · '),
    timestamp: event.ts,
  };
}

function mapTransactionEvent(event) {
  const summaryParts = [];
  if (event.action) summaryParts.push(`action ${event.action}`);
  if (event.newStatus) summaryParts.push(`status ${event.newStatus}`);
  if (event.userInitials) summaryParts.push(`operator ${event.userInitials}`);

  return {
    id: `transaction-${event.id}`,
    source: 'ops.transaction',
    sourceLabel: 'Transaction',
    status: event.status === 'error' ? 'error' : 'success',
    title: event.title || 'Transaction activity',
    summary: summaryParts.join(' · ') || 'Transaction workflow updated.',
    timestamp: event.ts,
  };
}

function mapDataHubEvent(event) {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const actor = event.userInitials || data.actor || 'User';
  const eventType = String(event.type || '').replace(/^telemetry\.DataHub\./, '');
  const datasetCount = Number(data.datasetCount || (Array.isArray(data.datasets) ? data.datasets.length : 0));
  const datasetLabel = data.datasetLabel
    || data.datasetSummary
    || (Array.isArray(data.datasetLabels) ? data.datasetLabels[0] : null)
    || data.dataset
    || (datasetCount > 1 ? `${datasetCount} datasets` : 'datasets');

  const title = eventType === 'refreshQueued'
    ? `${actor} queued Data Hub refresh`
    : eventType === 'datasetEntered'
      ? `${actor} opened ${datasetLabel}`
      : `${actor} opened Data Hub`;
  const summary = eventType === 'refreshQueued'
    ? `${datasetCount || 'Selected'} dataset${datasetCount === 1 ? '' : 's'} queued`
    : [data.target || data.surface || 'datasets', datasetLabel].filter(Boolean).join(' · ');

  return {
    id: `datahub-${event.id}`,
    source: 'data.activity',
    sourceLabel: 'Data Hub',
    status: event.status === 'error' ? 'error' : 'info',
    title,
    summary,
    timestamp: event.ts,
  };
}

const OP_LOG_ACTIVITY_SOURCES = [
  {
    key: 'bot',
    type: 'teams.bot',
    limitFactor: 3,
    filter: (event) => event.status !== 'started',
    map: mapBotEvent,
  },
  {
    key: 'cardLab',
    type: 'activity.cardlab.send',
    limitFactor: 2,
    map: mapCardLabSend,
  },
  {
    key: 'notificationCard',
    type: 'activity.card.send',
    limitFactor: 2,
    map: mapNotificationCardSend,
  },
  {
    key: 'botAction',
    type: 'teams.bot.action',
    limitFactor: 2,
    map: mapBotActionEvent,
  },
  {
    key: 'dmSend',
    type: 'activity.dm.send',
    limitFactor: 2,
    map: mapDmSendEvent,
  },
  {
    key: 'cclAutopilot',
    type: 'activity.ccl.autopilot',
    limitFactor: 2,
    map: mapCclAutopilotEvent,
  },
  {
    key: 'emailSearch',
    type: 'activity.email.search',
    limitFactor: 2,
    map: mapEmailSearchEvent,
  },
  {
    key: 'emailForward',
    type: 'activity.email.forward',
    limitFactor: 2,
    map: mapEmailForwardEvent,
  },
  {
    key: 'matterOpening',
    type: 'activity.matter-opening',
    limitFactor: 3,
    map: mapMatterOpeningEvent,
  },
  {
    key: 'transaction',
    type: 'ops.transaction',
    limitFactor: 2,
    map: mapTransactionEvent,
  },
  {
    key: 'dataHub',
    type: /^telemetry\.DataHub\.(entered|datasetEntered|refreshQueued)$/,
    limitFactor: 3,
    map: mapDataHubEvent,
  },
];

function getOpLogActivityItems(limit) {
  const boundedLimit = Math.min(limit, MAX_ACTIVITY_FEED_LIMIT);
  const counts = {};
  const items = [];

  for (const source of OP_LOG_ACTIVITY_SOURCES) {
    const sourceItems = list({
      type: source.type,
      limit: Math.min(boundedLimit * source.limitFactor, MAX_ACTIVITY_FEED_LIMIT),
    })
      .filter(source.filter || (() => true))
      .map(source.map);

    counts[source.key] = sourceItems.length;
    items.push(...sourceItems);
  }

  return { items, counts };
}

module.exports = {
  MAX_ACTIVITY_FEED_LIMIT,
  getOpLogActivityItems,
};