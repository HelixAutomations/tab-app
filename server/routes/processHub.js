const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const { trackEvent, trackMetric, trackException } = require('../utils/appInsights');
const { sendCardToDM } = require('../utils/teamsNotificationClient');
const {
  loadSubmission,
  bumpRetrigger,
  archiveSubmission,
  markComplete,
  markFailed,
  recordStep,
} = require('../utils/formSubmissionLog');

const router = express.Router();
const PROCESS_HEALTH_ALERT_RECIPIENT = 'lz@helix-law.com';
const PROCESS_HEALTH_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const ADMIN_INITIALS = new Set(['LZ', 'AC', 'KW', 'JW', 'LA', 'EA']);
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
  // form_submissions now lives on the Helix Operations Platform DB
  // (helix-operations). Two-stage gate identical to formSubmissionLog so reads
  // and writes always agree on which database they hit.
  //
  // Emergency rollback: FORM_SUBMISSIONS_USE_LEGACY=true forces the rail back
  // onto legacy helix-core-data (via SQL_CONNECTION_STRING).
  const useLegacy = String(process.env.FORM_SUBMISSIONS_USE_LEGACY || '').toLowerCase() === 'true';
  if (useLegacy) {
    const legacy = process.env.SQL_CONNECTION_STRING;
    if (!legacy) throw new Error('Process hub legacy connection string not configured');
    return legacy;
  }
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('Process hub: OPS_PLATFORM_ENABLED is not "true"');
  }
  const connectionString = process.env.OPS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('Process hub: OPS_SQL_CONNECTION_STRING is not configured');
  }
  return connectionString;
}

function normaliseInitials(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function resolveActorInitials(req) {
  return normaliseInitials(
    req.query?.initials
      || req.body?.initials
      || req.headers?.['x-user-initials']
      || req.user?.initials
      || req.user?.Initials
      || req.userContext?.initials
  );
}

function toProcessStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'failed') return 'failed';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'processing') return 'processing';
  if (normalized === 'queued') return 'queued';
  return 'awaiting_human';
}

function parseStepsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summariseLastEvent(row, status) {
  if (row.last_event) return row.last_event;
  if (status === 'failed') return 'Submission failed';
  if (status === 'complete') return 'Completed';
  if (status === 'processing') return 'Processing';
  if (status === 'queued') return 'Queued';
  return 'Awaiting triage';
}

function toProcessItem(row) {
  const status = toProcessStatus(row.processing_status);
  const steps = parseStepsJson(row.processing_steps_json);
  const lane = row.lane || 'Log';
  const formKey = row.form_key || 'unknown';
  const id = String(row.id);

  return {
    id: `submission-${id}`,
    submissionId: id,
    formKey,
    currentStatus: status,
    lane,
    lastEvent: summariseLastEvent(row, status),
    processTitle: row.summary || formKey,
    source: 'form_submissions',
    startedAt: row.submitted_at,
    submittedBy: row.submitted_by || null,
    summary: row.summary || formKey,
    payloadAvailable: true,
    steps,
    retriggerCount: row.retrigger_count ?? 0,
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

async function probeProcessHub(limit, { initials, scope } = {}) {
  const isAdmin = initials ? ADMIN_INITIALS.has(initials) : false;
  const requestedScope = scope === 'mine' || scope === 'all' ? scope : null;
  // Default scope: admins see all, non-admins (with initials) see their own,
  // unauthenticated callers see all (back-compat with the old tech-tickets adapter).
  const effectiveScope = requestedScope
    || (isAdmin ? 'all' : (initials ? 'mine' : 'all'));

  const rows = await withRequest(getConnectionString(), async (request) => {
    request.input('limit', sql.Int, limit);
    let whereClause = 'WHERE archived_at IS NULL';
    if (effectiveScope === 'mine' && initials) {
      request.input('initials', sql.NVarChar(16), initials);
      whereClause += ' AND submitted_by = @initials';
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        id,
        form_key,
        submitted_by,
        submitted_at,
        lane,
        summary,
        processing_status,
        processing_steps_json,
        last_event,
        last_event_at,
        retrigger_count
      FROM dbo.form_submissions
      ${whereClause}
      ORDER BY submitted_at DESC
    `);

    return result.recordset || [];
  }, 1);

  return { rows, scope: effectiveScope, isAdmin };
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
  const initials = resolveActorInitials(req);
  const requestedScope = typeof req.query?.scope === 'string' ? req.query.scope : null;
  const rawLimit = req.query?.limit;
  const parsedLimit = typeof rawLimit === 'string' ? parseInt(rawLimit, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 12;

  if (limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'Invalid limit (must be 1-50)' });
  }

  trackEvent('ProcessHub.Submissions.Started', {
    operation: 'submissions',
    triggeredBy,
    initials: initials || 'unknown',
    scope: requestedScope || 'auto',
    limit: String(limit),
  });

  try {
    const { rows, scope, isAdmin } = await probeProcessHub(limit, { initials, scope: requestedScope });

    const items = rows.map(toProcessItem);
    const durationMs = Date.now() - startedAt;

    trackEvent('ProcessHub.Submissions.Completed', {
      operation: 'submissions',
      triggeredBy,
      initials: initials || 'unknown',
      scope,
      isAdmin: String(isAdmin),
      count: String(items.length),
      durationMs: String(durationMs),
    });
    trackMetric('ProcessHub.Submissions.Duration', durationMs, {
      operation: 'submissions',
    });

    return res.json({
      items,
      source: 'form_submissions',
      scope,
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

/**
 * Retrigger dispatcher.
 *
 * Each entry maps a `form_key` to an async function that re-runs the
 * side-effects of that form using the stored payload. The function receives
 * `(submission, { triggeredBy })` and should:
 *   - re-run external integrations (Asana, Teams, Clio, …) idempotently,
 *   - call `recordStep` for each external attempt,
 *   - call `markComplete` on success or `markFailed` on failure.
 *
 * Per-form retrigger functions are registered below. Each handler receives
 * `(submission, { triggeredBy })` and is responsible for calling
 * `recordStep()` for each external attempt. The dispatcher in
 * `POST /:id/retrigger` calls `markComplete()` if the handler resolves and
 * `markFailed()` if it throws. Handlers for unknown form_keys return 501.
 */
const RETRIGGER_DISPATCH = Object.create(null);

// B5b: tech-ticket retrigger handlers (re-run Asana create from stored payload).
const techTickets = require('./techTickets');
if (typeof techTickets.retriggerIdea === 'function') {
  RETRIGGER_DISPATCH['tech-idea'] = techTickets.retriggerIdea;
}
if (typeof techTickets.retriggerProblem === 'function') {
  RETRIGGER_DISPATCH['tech-problem'] = techTickets.retriggerProblem;
}

function isAdminInitials(initials) {
  return Boolean(initials) && ADMIN_INITIALS.has(initials);
}

function authoriseSubmissionAccess(submission, initials) {
  if (!submission) return { allowed: false, status: 404, reason: 'Submission not found' };
  if (isAdminInitials(initials)) return { allowed: true };
  if (initials && submission.submitted_by === initials) return { allowed: true };
  return { allowed: false, status: 403, reason: 'Not authorised' };
}

function toSubmissionPayload(submission) {
  return {
    id: String(submission.id),
    formKey: submission.form_key,
    lane: submission.lane || null,
    submittedBy: submission.submitted_by,
    submittedAt: submission.submitted_at,
    summary: submission.summary,
    status: submission.processing_status,
    lastEvent: submission.last_event || null,
    lastEventAt: submission.last_event_at || null,
    retriggerCount: submission.retrigger_count ?? 0,
    lastRetriggeredAt: submission.last_retriggered_at || null,
    lastRetriggeredBy: submission.last_retriggered_by || null,
    archivedAt: submission.archived_at || null,
    payload: submission.payload ?? null,
    steps: submission.steps ?? [],
  };
}

router.get('/submissions/:id', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = getTriggeredBy(req);
  const initials = resolveActorInitials(req);
  const submissionId = req.params.id;

  trackEvent('ProcessHub.Submission.LoadStarted', {
    operation: 'submission.load',
    triggeredBy,
    submissionId,
  });

  try {
    const submission = await loadSubmission(submissionId);
    const auth = authoriseSubmissionAccess(submission, initials);
    if (!auth.allowed) {
      return res.status(auth.status).json({ error: auth.reason });
    }

    trackEvent('ProcessHub.Submission.Loaded', {
      operation: 'submission.load',
      triggeredBy,
      submissionId,
      formKey: submission.form_key,
      durationMs: String(Date.now() - startedAt),
    });

    return res.json({ submission: toSubmissionPayload(submission) });
  } catch (error) {
    trackException(error, {
      component: 'ProcessHub',
      operation: 'submission.load',
      submissionId,
      triggeredBy,
    });
    trackEvent('ProcessHub.Submission.LoadFailed', {
      operation: 'submission.load',
      triggeredBy,
      submissionId,
      error: error.message,
    });
    return res.status(500).json({ error: 'Failed to load submission' });
  }
});

router.post('/submissions/:id/retrigger', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = getTriggeredBy(req);
  const initials = resolveActorInitials(req);
  const submissionId = req.params.id;

  trackEvent('ProcessHub.Submission.RetriggerStarted', {
    operation: 'submission.retrigger',
    triggeredBy,
    submissionId,
  });

  try {
    const submission = await loadSubmission(submissionId);
    const auth = authoriseSubmissionAccess(submission, initials);
    if (!auth.allowed) {
      return res.status(auth.status).json({ error: auth.reason });
    }

    const handler = RETRIGGER_DISPATCH[submission.form_key];
    if (typeof handler !== 'function') {
      trackEvent('ProcessHub.Submission.RetriggerUnsupported', {
        triggeredBy,
        submissionId,
        formKey: submission.form_key,
      });
      return res.status(501).json({
        error: 'Retrigger not yet supported for this form',
        formKey: submission.form_key,
      });
    }

    await bumpRetrigger(submissionId, { triggeredBy: initials || triggeredBy });
    await recordStep(submissionId, {
      name: 'retrigger.invoked',
      status: 'processing',
      output: { triggeredBy: initials || triggeredBy },
    });

    // Fire-and-forget the retrigger so the client can poll /:id for progress.
    Promise.resolve()
      .then(() => handler(submission, { triggeredBy: initials || triggeredBy }))
      .then(() => markComplete(submissionId, { lastEvent: 'retrigger:complete' }))
      .catch((handlerErr) => {
        trackException(handlerErr, {
          component: 'ProcessHub',
          operation: 'submission.retrigger.handler',
          submissionId,
          formKey: submission.form_key,
        });
        return markFailed(submissionId, {
          lastEvent: 'retrigger:failed',
          error: handlerErr,
        });
      });

    trackEvent('ProcessHub.Submission.RetriggerDispatched', {
      operation: 'submission.retrigger',
      triggeredBy,
      submissionId,
      formKey: submission.form_key,
      durationMs: String(Date.now() - startedAt),
    });

    return res.status(202).json({ ok: true, submissionId, status: 'processing' });
  } catch (error) {
    trackException(error, {
      component: 'ProcessHub',
      operation: 'submission.retrigger',
      submissionId,
      triggeredBy,
    });
    trackEvent('ProcessHub.Submission.RetriggerFailed', {
      operation: 'submission.retrigger',
      triggeredBy,
      submissionId,
      error: error.message,
    });
    return res.status(500).json({ error: 'Failed to retrigger submission' });
  }
});

router.delete('/submissions/:id', async (req, res) => {
  const triggeredBy = getTriggeredBy(req);
  const initials = resolveActorInitials(req);
  const submissionId = req.params.id;

  if (!isAdminInitials(initials)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  try {
    const archived = await archiveSubmission(submissionId);
    trackEvent('ProcessHub.Submission.ArchiveAttempted', {
      operation: 'submission.archive',
      triggeredBy,
      submissionId,
      archived: String(archived),
    });
    if (!archived) {
      return res.status(404).json({ error: 'Submission not found or already archived' });
    }
    return res.status(204).send();
  } catch (error) {
    trackException(error, {
      component: 'ProcessHub',
      operation: 'submission.archive',
      submissionId,
      triggeredBy,
    });
    return res.status(500).json({ error: 'Failed to archive submission' });
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
    const { rows } = await probeProcessHub(1, { scope: 'all' });
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