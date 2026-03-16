/**
 * Teams Notification Routes — POST cards and notifications from Team Hub
 * 
 * POST /api/teams-notify/card          — Post an Adaptive Card to a channel
 * POST /api/teams-notify/html          — Post simple HTML to a channel
 * POST /api/teams-notify/activity-feed — Send activity feed notification to a user
 * POST /api/teams-notify/test          — Quick test: post a card to api-tests channel
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
  CHANNEL_ROUTES,
} = require('../utils/teamsNotificationClient');
const { trackEvent, trackException } = require('../utils/appInsights');
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
