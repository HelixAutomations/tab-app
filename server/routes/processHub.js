const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const { trackEvent, trackMetric, trackException } = require('../utils/appInsights');
const { sendCardToDM } = require('../utils/teamsNotificationClient');

const router = express.Router();
const PROCESS_HEALTH_ALERT_RECIPIENT = 'lz@helix-law.com';
const PROCESS_HEALTH_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
let lastProcessHubAlert = {
  reason: '',
  sentAt: 0,
  status: 'healthy',
};

const PROCESS_DEFINITIONS = [
  {
    id: 'open-a-matter',
    title: 'Open a Matter',
    lane: 'Start',
    engine: 'transition',
    context: ['Client', 'Matter'],
    section: 'General',
  },
  {
    id: 'payment-requests',
    title: 'Payment Requests',
    lane: 'Request',
    engine: 'transition',
    context: ['Matter', 'Finance'],
    section: 'Finance',
  },
  {
    id: 'transfer-request',
    title: 'Transfer Request',
    lane: 'Request',
    engine: 'transition',
    context: ['Matter', 'Finance'],
    section: 'Finance',
  },
  {
    id: 'bundle',
    title: 'Bundle',
    lane: 'Request',
    engine: 'live',
    context: ['Matter', 'Court'],
    section: 'Operations',
  },
  {
    id: 'tech-development-idea',
    title: 'Tech Development Idea',
    lane: 'Escalate',
    engine: 'live',
    context: ['Tech', 'Improvement'],
    section: 'Tech',
  },
  {
    id: 'report-technical-problem',
    title: 'Report Technical Problem',
    lane: 'Escalate',
    engine: 'live',
    context: ['Tech', 'Operations'],
    section: 'Tech',
  },
  {
    id: 'expert-directory',
    title: 'Expert Directory',
    lane: 'Find',
    engine: 'live',
    context: ['Recommendation', 'Matter'],
    section: 'Directories',
  },
  {
    id: 'counsel-directory',
    title: 'Counsel Directory',
    lane: 'Find',
    engine: 'live',
    context: ['Recommendation', 'Matter'],
    section: 'Directories',
  },
];

function getTriggeredBy(req) {
  return req.user?.initials || req.user?.Initials || req.userContext?.initials || 'unknown';
}

function getConnectionString() {
  const connectionString = process.env.PROJECTS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('Process hub connection string not configured');
  }
  return connectionString;
}

function toProcessStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'asana_failed') {
    return 'failed';
  }
  if (normalized === 'asana_created') {
    return 'processing';
  }
  if (normalized === 'submitted') {
    return 'queued';
  }

  return 'awaiting_human';
}

function toProcessItem(row) {
  const isIdea = row.type === 'idea';
  const sourceTitle = isIdea ? 'Tech Development Idea' : 'Report Technical Problem';
  const status = toProcessStatus(row.status);

  return {
    id: `tech-${row.type}-${row.id}`,
    currentStatus: status,
    lane: 'Escalate',
    lastEvent: status === 'failed' ? 'Asana handoff failed' : status === 'processing' ? 'Logged into Asana' : 'Awaiting triage',
    processTitle: sourceTitle,
    source: 'techTickets',
    startedAt: row.created_at,
    submittedBy: row.submitted_by || null,
    summary: row.title,
  };
}

function getRouteBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildProcessHubAlertCard({ baseUrl, checkedAt, checks, errorMessage }) {
  const submissionsCheck = checks.submissions;

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: 'Process Hub route not ready',
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'TextBlock',
        text: 'The Forms launcher pressure test failed. The UI dot should be red until this route settles.',
        wrap: true,
        spacing: 'Small',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Checked', value: checkedAt },
          { title: 'Definitions', value: `${checks.definitions.status}${checks.definitions.count != null ? ` (${checks.definitions.count})` : ''}` },
          { title: 'Submissions', value: `${submissionsCheck.status}${submissionsCheck.sampleCount != null ? ` (${submissionsCheck.sampleCount})` : ''}` },
          { title: 'Reason', value: errorMessage || submissionsCheck.error || 'Unknown failure' },
        ],
      },
      {
        type: 'ActionSet',
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'Open Forms launcher',
            url: `${baseUrl}/`,
          },
        ],
      },
    ],
  };
}

async function notifyProcessHubFailure({ baseUrl, checks, errorMessage }) {
  const now = Date.now();
  const reason = errorMessage || checks.submissions.error || 'Process hub health probe failed';
  const shouldSuppress = lastProcessHubAlert.status === 'unhealthy'
    && lastProcessHubAlert.reason === reason
    && now - lastProcessHubAlert.sentAt < PROCESS_HEALTH_ALERT_COOLDOWN_MS;

  if (shouldSuppress) {
    return {
      recipient: PROCESS_HEALTH_ALERT_RECIPIENT,
      sent: false,
      suppressed: true,
    };
  }

  const checkedAt = new Date(now).toLocaleString('en-GB', { timeZone: 'Europe/London' });
  const result = await sendCardToDM(
    PROCESS_HEALTH_ALERT_RECIPIENT,
    buildProcessHubAlertCard({
      baseUrl,
      checkedAt,
      checks,
      errorMessage: reason,
    }),
    'Process hub route not ready',
  );

  if (result.success) {
    lastProcessHubAlert = {
      reason,
      sentAt: now,
      status: 'unhealthy',
    };
  }

  return {
    error: result.error || null,
    recipient: PROCESS_HEALTH_ALERT_RECIPIENT,
    sent: Boolean(result.success),
    suppressed: false,
  };
}

async function probeProcessHub(limit) {
  const rows = await withRequest(getConnectionString(), async (request) => {
    const result = await request
      .input('limit', sql.Int, limit)
      .query(`
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
      `);

    return result.recordset || [];
  }, 1);

  return rows;
}

router.get('/definitions', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = getTriggeredBy(req);

  trackEvent('ProcessHub.Definitions.Started', {
    operation: 'definitions',
    triggeredBy,
  });

  try {
    const items = PROCESS_DEFINITIONS.map((item) => ({
      ...item,
      supportsDryRun: item.engine !== 'transition',
    }));

    const durationMs = Date.now() - startedAt;
    trackEvent('ProcessHub.Definitions.Completed', {
      operation: 'definitions',
      triggeredBy,
      count: String(items.length),
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Definitions.Duration', durationMs, {
      operation: 'definitions',
    });

    return res.json({
      items,
      lanes: ['Start', 'Request', 'Log', 'Escalate', 'Find'],
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      component: 'ProcessHub',
      operation: 'definitions',
      phase: 'route',
      triggeredBy,
    });
    trackEvent('ProcessHub.Definitions.Failed', {
      operation: 'definitions',
      triggeredBy,
      error: error.message,
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Definitions.Duration', durationMs, {
      operation: 'definitions',
      failed: 'true',
    });
    return res.status(500).json({ error: 'Failed to load process definitions' });
  }
});

router.get('/submissions', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = getTriggeredBy(req);
  const rawLimit = req.query?.limit;
  const parsedLimit = typeof rawLimit === 'string' ? parseInt(rawLimit, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 12;

  if (limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'Invalid limit (must be 1-50)' });
  }

  trackEvent('ProcessHub.Submissions.Started', {
    operation: 'submissions',
    triggeredBy,
    limit: String(limit),
  });

  try {
    const rows = await probeProcessHub(limit);

    const items = rows.map(toProcessItem);
    const durationMs = Date.now() - startedAt;

    trackEvent('ProcessHub.Submissions.Completed', {
      operation: 'submissions',
      triggeredBy,
      count: String(items.length),
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Submissions.Duration', durationMs, {
      operation: 'submissions',
    });

    return res.json({
      items,
      source: 'techTickets-adapter',
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      component: 'ProcessHub',
      operation: 'submissions',
      phase: 'route',
      triggeredBy,
    });
    trackEvent('ProcessHub.Submissions.Failed', {
      operation: 'submissions',
      triggeredBy,
      error: error.message,
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Submissions.Duration', durationMs, {
      operation: 'submissions',
      failed: 'true',
    });
    return res.status(500).json({ error: 'Failed to load process submissions' });
  }
});

router.get('/health', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = getTriggeredBy(req);
  const checks = {
    definitions: {
      count: PROCESS_DEFINITIONS.length,
      status: PROCESS_DEFINITIONS.length > 0 ? 'healthy' : 'unhealthy',
    },
    submissions: {
      sampleCount: 0,
      status: 'healthy',
      error: null,
    },
  };

  trackEvent('ProcessHub.Health.Started', {
    operation: 'health',
    triggeredBy,
  });

  try {
    const rows = await probeProcessHub(1);
    checks.submissions.sampleCount = rows.length;

    const durationMs = Date.now() - startedAt;
    const overallStatus = checks.definitions.status === 'healthy' && checks.submissions.status === 'healthy'
      ? 'healthy'
      : 'unhealthy';

    if (overallStatus === 'healthy') {
      lastProcessHubAlert = {
        reason: '',
        sentAt: lastProcessHubAlert.sentAt,
        status: 'healthy',
      };
    }

    trackEvent('ProcessHub.Health.Completed', {
      operation: 'health',
      triggeredBy,
      status: overallStatus,
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Health.Duration', durationMs, {
      operation: 'health',
      status: overallStatus,
    });

    return res.json({
      checks,
      checkedAt: new Date().toISOString(),
      durationMs,
      notification: {
        recipient: PROCESS_HEALTH_ALERT_RECIPIENT,
        sent: false,
        suppressed: false,
      },
      status: overallStatus,
    });
  } catch (error) {
    checks.submissions = {
      sampleCount: 0,
      status: 'unhealthy',
      error: error.message,
    };

    const durationMs = Date.now() - startedAt;
    let notification = {
      recipient: PROCESS_HEALTH_ALERT_RECIPIENT,
      sent: false,
      suppressed: false,
      error: null,
    };

    try {
      notification = await notifyProcessHubFailure({
        baseUrl: getRouteBaseUrl(req),
        checks,
        errorMessage: error.message,
      });
    } catch (notificationError) {
      notification = {
        recipient: PROCESS_HEALTH_ALERT_RECIPIENT,
        sent: false,
        suppressed: false,
        error: notificationError.message,
      };
      trackException(notificationError, {
        component: 'ProcessHub',
        operation: 'health-notify',
        phase: 'dm',
        triggeredBy,
      });
    }

    trackException(error, {
      component: 'ProcessHub',
      operation: 'health',
      phase: 'probe',
      triggeredBy,
    });
    trackEvent('ProcessHub.Health.Failed', {
      operation: 'health',
      triggeredBy,
      error: error.message,
      durationMs: String(durationMs),
      notificationSent: String(notification.sent),
      notificationSuppressed: String(notification.suppressed),
    });
    trackMetric('ProcessHub.Health.Duration', durationMs, {
      operation: 'health',
      status: 'unhealthy',
    });

    return res.status(503).json({
      checks,
      checkedAt: new Date().toISOString(),
      durationMs,
      error: error.message,
      notification,
      status: 'unhealthy',
    });
  }
});

module.exports = router;