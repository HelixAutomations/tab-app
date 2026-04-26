const express = require('express');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { MAX_ACTIVITY_FEED_LIMIT, getOpLogActivityItems } = require('../utils/activityFeedSources');
const { getDatabaseActivityItems } = require('../utils/activityFeedDbSources');

const router = express.Router();
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = MAX_ACTIVITY_FEED_LIMIT;

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

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const limit = parseLimit(req.query.limit);

  try {
    const { items: opLogItems, counts: opLogCounts } = getOpLogActivityItems(limit);
    const databaseItems = await getDatabaseActivityItems(limit);

    const items = [
      ...opLogItems,
      ...databaseItems.items,
    ]
      .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left))
      .slice(0, limit);

    const durationMs = Date.now() - startedAt;
    trackEvent('ActivityFeed.Fetch.Completed', {
      operation: 'list',
      limit,
      itemCount: items.length,
      botCount: opLogCounts.bot || 0,
      trackedCount: databaseItems.counts.tracked || 0,
      formSubmissionCount: databaseItems.counts.formSubmission || 0,
      aiProposalCount: databaseItems.counts.aiProposal || 0,
      hubTodoCount: databaseItems.counts.hubTodo || 0,
      cardLabCount: opLogCounts.cardLab || 0,
      notificationCardCount: opLogCounts.notificationCard || 0,
      botActionCount: opLogCounts.botAction || 0,
      dmSendCount: opLogCounts.dmSend || 0,
      cclAutopilotCount: opLogCounts.cclAutopilot || 0,
      emailSearchCount: opLogCounts.emailSearch || 0,
      emailForwardCount: opLogCounts.emailForward || 0,
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