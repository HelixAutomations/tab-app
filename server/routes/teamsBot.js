const express = require('express');
const { randomUUID } = require('crypto');
const { append } = require('../utils/opLog');
const { updateCardInConversation } = require('../utils/teamsNotificationClient');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('TeamsBot');

function getConversationType(activity) {
  return activity?.conversation?.conversationType || activity?.conversationType || 'unknown';
}

function getActionName(value) {
  if (!value || typeof value !== 'object') return '';

  if (typeof value.action === 'string') return value.action;
  if (typeof value.actionType === 'string') return value.actionType;
  if (typeof value.verb === 'string') return value.verb;

  if (value.action && typeof value.action === 'object') {
    if (typeof value.action.type === 'string') return value.action.type;
    if (value.action.data && typeof value.action.data === 'object' && typeof value.action.data.action === 'string') {
      return value.action.data.action;
    }
  }

  if (value.data && typeof value.data === 'object') {
    if (typeof value.data.action === 'string') return value.data.action;
    if (typeof value.data.actionType === 'string') return value.data.actionType;
    if (typeof value.data.verb === 'string') return value.data.verb;
  }

  return '';
}

function buildInvokeResponse(message) {
  return {
    status: 200,
    body: {
      statusCode: 200,
      type: 'application/vnd.microsoft.activity.message',
      value: message,
    },
  };
}

router.options('/', (_req, res) => {
  res.sendStatus(204);
});

router.get('/', (_req, res) => {
  res.json({
    success: true,
    endpoint: 'Team Hub bot messages',
    capabilities: {
      receivesActivities: true,
      handlesInvokes: true,
      supportsPersonalBot: true,
      supportsOutboundCards: false,
      supportsStateTracking: false,
    },
    note: 'Groundwork endpoint only. Outbound DM orchestration and persisted card-state tracking are follow-up work.',
    timestamp: new Date().toISOString(),
  });
});

router.post('/', async (req, res) => {
  const startedAt = Date.now();
  const requestId = randomUUID().slice(0, 8);

  try {
    const activity = req.body && typeof req.body === 'object' ? req.body : null;
    const activityType = activity?.type || '';
    const activityName = activity?.name || '';
    const actionName = getActionName(activity?.value);
    const conversationType = getConversationType(activity);

    if (!activity || !activityType) {
      append({
        type: 'teams.bot',
        action: 'messages',
        status: 'error',
        requestId,
        error: 'missing-activity-type',
      });

      return res.status(400).json({
        success: false,
        error: 'Missing activity payload or activity type',
      });
    }

    append({
      type: 'teams.bot',
      action: 'messages',
      status: 'started',
      requestId,
      activityType,
      activityName: activityName || undefined,
      actionName: actionName || undefined,
      conversationType,
    });

    trackEvent('TeamsBot.Activity.Started', {
      operation: 'messages',
      requestId,
      activityType,
      activityName,
      actionName,
      conversationType,
      channelId: activity.channelId || '',
    });

    log.info('Inbound Teams bot activity', {
      requestId,
      activityType,
      activityName: activityName || undefined,
      actionName: actionName || undefined,
      conversationType,
    });

    const durationMs = Date.now() - startedAt;

    append({
      type: 'teams.bot',
      action: 'messages',
      status: 'success',
      requestId,
      activityType,
      activityName: activityName || undefined,
      actionName: actionName || undefined,
      conversationType,
      durationMs,
    });

    trackEvent('TeamsBot.Activity.Completed', {
      operation: 'messages',
      requestId,
      activityType,
      activityName,
      actionName,
      conversationType,
      durationMs,
    });
    trackMetric('TeamsBot.Activity.Duration', durationMs, {
      operation: 'messages',
      activityType,
      activityName,
      actionName,
    });

    if (activityType === 'invoke') {
      // ── Dispatch on actionName ───────────────────────────────
      if (actionName === 'test-ack') {
        const userId = activity.from?.id || 'unknown';
        const userName = activity.from?.name || 'Unknown';
        const conversationId = activity.conversation?.id || '';
        const replyToId = activity.replyToId || '';
        const ackedAt = new Date().toISOString();

        append({
          type: 'teams.bot.action',
          action: 'test-ack',
          status: 'success',
          userId,
          userName,
          conversationId,
          replyToId,
          conversationType,
        });

        // Update the card inline to show acknowledgement
        if (conversationId && replyToId) {
          const updatedCard = {
            type: 'AdaptiveCard',
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.4',
            body: [
              {
                type: 'ColumnSet',
                columns: [
                  {
                    type: 'Column',
                    width: 'auto',
                    items: [{
                      type: 'Image',
                      url: 'https://helix-law.com/favicon.ico',
                      size: 'Small',
                      style: 'Person',
                    }],
                  },
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      {
                        type: 'TextBlock',
                        text: 'Team Hub',
                        weight: 'Bolder',
                        size: 'Medium',
                      },
                      {
                        type: 'TextBlock',
                        text: `Acknowledged · ${ackedAt}`,
                        isSubtle: true,
                        spacing: 'None',
                        size: 'Small',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'TextBlock',
                text: `✓ Acknowledged by ${userName} at ${new Date(ackedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
                wrap: true,
                spacing: 'Medium',
                size: 'Small',
                color: 'Good',
                weight: 'Bolder',
              },
            ],
          };

          try {
            await updateCardInConversation(conversationId, replyToId, updatedCard);
          } catch (updateErr) {
            log.warn('Failed to update card after test-ack', { error: updateErr.message, conversationId, replyToId });
          }
        }

        return res.status(200).json(buildInvokeResponse(`Acknowledged by ${userName}.`));
      }

      return res.status(200).json(buildInvokeResponse('Team Hub action received.'));
    }

    return res.sendStatus(200);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error instanceof Error ? error : new Error(String(error));

    append({
      type: 'teams.bot',
      action: 'messages',
      status: 'error',
      requestId,
      error: err.message,
      durationMs,
    });

    trackException(err, {
      component: 'TeamsBot',
      operation: 'messages',
      phase: 'route',
      requestId,
    });
    trackEvent('TeamsBot.Activity.Failed', {
      operation: 'messages',
      requestId,
      error: err.message,
      durationMs,
    });
    trackMetric('TeamsBot.Activity.Duration', durationMs, {
      operation: 'messages',
      status: 'failed',
    });

    log.error('Teams bot activity failed', {
      requestId,
      error: err.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process Teams bot activity',
    });
  }
});

module.exports = router;