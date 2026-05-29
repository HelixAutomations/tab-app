/**
 * Teams Notification Routes — POST cards and notifications from Team Hub
 * 
 * POST /api/teams-notify/card          — Post an Adaptive Card to a channel
 * POST /api/teams-notify/html          — Post simple HTML to a channel
 * POST /api/teams-notify/activity-feed — Send activity feed notification to a user
 * POST /api/teams-notify/test          — Quick test: post a card to api-tests channel
 * POST /api/teams-notify/pitch-link-test — Send Luke a pitch notification test card
 * GET  /api/teams-notify/health        — Token + channel health check
 */

const express = require('express');
const router = express.Router();
const {
  getGraphToken,
  resolveChannel,
  postAdaptiveCardToChannel,
  postHtmlToChannel,
  sendActivityFeedNotification,
  postCardToArea,
  sendCardToDM,
  CHANNEL_ROUTES,
} = require('../utils/teamsNotificationClient');
const { notifyPitchLinkReady } = require('../utils/pitchTeamsNotifications');
const { trackEvent, trackException } = require('../utils/appInsights');
const { append } = require('../utils/opLog');
const log = require('../utils/logger');

// ── POST /card — Post Adaptive Card to a channel ─────────────
router.post('/card', async (req, res) => {
  try {
    const { area, teamId, channelId, card, summary } = req.body;

    if (!card) {
      return res.status(400).json({ error: 'Missing required field: card' });
    }

    let result;
    if (teamId && channelId) {
      // Direct channel specification
      result = await postAdaptiveCardToChannel(teamId, channelId, card, summary);
    } else if (area) {
      // Route by area of work
      result = await postCardToArea(area, card, summary);
    } else {
      return res.status(400).json({ error: 'Provide either { area } or { teamId, channelId }' });
    }

    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /card error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.PostCard' });
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /html — Post HTML message to a channel ─────────────
router.post('/html', async (req, res) => {
  try {
    const { area, teamId, channelId, html } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'Missing required field: html' });
    }

    const route = (teamId && channelId) ? { teamId, channelId } : resolveChannel(area);
    const result = await postHtmlToChannel(route.teamId, route.channelId, html);
    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /html error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.PostHtml' });
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /activity-feed — Send notification to user's activity feed ──
router.post('/activity-feed', async (req, res) => {
  try {
    const { userId, activityType, previewText, topic } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const result = await sendActivityFeedNotification(userId, { activityType, previewText, topic });
    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /activity-feed error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.ActivityFeed' });
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /test — Quick smoke test: post a card to api-tests channel ──
router.post('/test', async (req, res) => {
  try {
    const testCard = {
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
                  text: 'Team Hub Notification Test',
                  weight: 'Bolder',
                  size: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: `Sent from Team Hub at ${new Date().toISOString()}`,
                  isSubtle: true,
                  spacing: 'None',
                },
              ],
            },
          ],
        },
        {
          type: 'TextBlock',
          text: '✅ If you can see this card, the Team-Hub-Notification-Handler app registration is working correctly with Graph API permissions.',
          wrap: true,
          spacing: 'Medium',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'App', value: 'Team-Hub-Notification-Handler' },
            { title: 'App ID', value: '3d935d23-349e-4502-a9c0-6f5ca48d5d33' },
            { title: 'Channel', value: 'api-tests' },
            { title: 'Method', value: 'Graph API (client credentials)' },
          ],
        },
      ],
    };

    const route = resolveChannel('api-tests');
    const result = await postAdaptiveCardToChannel(route.teamId, route.channelId, testCard, 'Team Hub notification test');

    trackEvent('TeamsNotification.TestCard', { success: String(result.success) });
    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /test error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.Test' });
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /dm-test — Send a test card to Luke's DM ───────────
router.post('/dm-test', async (req, res) => {
  try {
    const sentAt = new Date().toISOString();
    const testCard = {
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
                  text: `Test card · ${sentAt}`,
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
          text: 'This is a test card sent from Team Hub directly to your DM. Click the button below to acknowledge — the card will update inline and the action will appear in Activity.',
          wrap: true,
          spacing: 'Medium',
          size: 'Small',
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Acknowledge',
          data: { action: 'test-ack', sentAt },
        },
      ],
    };

    const result = await sendCardToDM('lz@helix-law.com', testCard, 'Team Hub DM test');

    append({
      type: 'activity.dm.send',
      action: 'dm-test',
      status: result.success ? 'success' : 'error',
      email: 'lz@helix-law.com',
      displayName: result.displayName || null,
      conversationId: result.conversationId || null,
      activityId: result.activityId || null,
      error: result.error || undefined,
    });

    trackEvent('TeamsNotification.DmTest', {
      success: String(result.success),
      activityId: result.activityId || '',
    });

    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    console.error('[TeamsNotifyRoute] /dm-test error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.DmTest' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /pitch-link-test - Send Luke the same card used by pitch requests.
router.post('/pitch-link-test', async (req, res) => {
  const startedAt = Date.now();
  try {
    const sentAt = new Date().toISOString();
    const result = await notifyPitchLinkReady({
      recipientEmail: 'lz@helix-law.com',
      dealId: 'TEST-PITCH-CARD',
      instructionRef: 'HLX-TEST-12345',
      passcode: '12345',
      instructionsUrl: 'https://instruct.helix-law.com/pitch/12345',
      amount: 2000,
      areaOfWork: 'Commercial',
      serviceDescription: 'Demo pitch notification card',
      pitchedBy: 'LZ',
      requestedBy: 'Luke',
      linkOnly: true,
      firstName: 'Test',
      lastName: 'Client',
      createdAt: sentAt,
    });

    append({
      type: 'activity.pitch-link-test.send',
      action: 'pitch-link-test',
      status: result.success ? 'success' : 'error',
      email: 'lz@helix-law.com',
      displayName: result.displayName || null,
      conversationId: result.conversationId || null,
      activityId: result.activityId || null,
      error: result.error || undefined,
    });

    trackEvent('TeamsNotification.PitchLinkTest', {
      success: String(result.success),
      activityId: result.activityId || '',
      durationMs: String(Date.now() - startedAt),
    });

    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /pitch-link-test error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.PitchLinkTest' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /error-report — Auto-notify Luke when a UI error boundary trips ──
// Called from src/components/ErrorBoundary.tsx on mount. Fire-and-forget on
// the client; the server still returns the delivery result so the UI can
// switch its envelope animation to a tick.
router.post('/error-report', async (req, res) => {
  try {
    const {
      errorCode,
      message,
      stack,
      componentStack,
      url,
      userInitials,
      userEmail,
      environment,
      timestamp,
    } = req.body || {};

    const safeMessage = typeof message === 'string' ? message.slice(0, 600) : 'Unknown error';
    const safeStack = typeof stack === 'string' ? stack.split('\n').slice(0, 8).join('\n') : '';
    const safeComponentStack = typeof componentStack === 'string' ? componentStack.split('\n').slice(0, 8).join('\n') : '';
    const ts = timestamp || new Date().toISOString();

    const card = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Hub error boundary tripped',
          weight: 'Bolder',
          size: 'Medium',
          color: 'Attention',
        },
        {
          type: 'TextBlock',
          text: `${userInitials || 'unknown user'}${userEmail ? ` · ${userEmail}` : ''}${environment ? ` · ${environment}` : ''}`,
          isSubtle: true,
          spacing: 'None',
          size: 'Small',
          wrap: true,
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Ref', value: errorCode || 'unknown' },
            { title: 'When', value: ts },
            { title: 'Where', value: url || 'n/a' },
          ],
        },
        {
          type: 'TextBlock',
          text: safeMessage,
          wrap: true,
          spacing: 'Medium',
        },
        ...(safeStack ? [{
          type: 'TextBlock',
          text: `\`\`\`\n${safeStack}\n\`\`\``,
          wrap: true,
          isSubtle: true,
          fontType: 'Monospace',
          size: 'Small',
        }] : []),
        ...(safeComponentStack ? [{
          type: 'TextBlock',
          text: `\`\`\`\n${safeComponentStack}\n\`\`\``,
          wrap: true,
          isSubtle: true,
          fontType: 'Monospace',
          size: 'Small',
        }] : []),
      ],
    };

    const result = await sendCardToDM('lz@helix-law.com', card, `Hub error · ${errorCode || 'unknown'}`);

    trackEvent('Hub.ErrorBoundary.AutoNotified', {
      errorCode: String(errorCode || 'unknown'),
      userInitials: String(userInitials || ''),
      delivered: String(!!result.success),
    });

    append({
      type: 'activity.error.auto-notify',
      action: 'error-boundary',
      status: result.success ? 'success' : 'error',
      errorCode: errorCode || null,
      userInitials: userInitials || null,
      timestamp: ts,
    });

    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    log.error('[TeamsNotifyRoute] /error-report error:', err.message);
    trackException(err, { operation: 'TeamsNotifyRoute.ErrorReport' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /health — Token acquisition + channel list ───────────
router.get('/health', async (req, res) => {
  try {
    const start = Date.now();
    await getGraphToken();
    const tokenMs = Date.now() - start;

    return res.json({
      status: 'ok',
      tokenAcquiredMs: tokenMs,
      availableChannels: Object.keys(CHANNEL_ROUTES),
    });
  } catch (err) {
    log.error('[TeamsNotifyRoute] /health error:', err.message);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
