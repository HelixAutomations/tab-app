/**
 * Telemetry Route
 * 
 * Receives client-side telemetry events and logs them for Application Insights.
 * Events are also stored in opLog for local debugging.
 */
const express = require('express');
const router = express.Router();
const opLog = require('../utils/opLog');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const presenceTracker = require('../utils/presenceTracker');

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g;

/**
 * POST /api/telemetry
 * 
 * Receives telemetry events from the client and logs them.
 * Application Insights will pick up console logs in Azure.
 */
router.post('/', (req, res) => {
  try {
    const { source, event } = req.body;

    if (!source || !event) {
      return res.status(400).json({ error: 'Missing source or event' });
    }

    // Validate event structure
    const { type, timestamp, sessionId, enquiryId, feeEarner, data, error, duration } = event;
    
    if (!type || !timestamp) {
      return res.status(400).json({ error: 'Invalid event structure' });
    }

    const sanitizedEntityRef = sanitizeScalar('enquiryId', enquiryId);
    const sanitizedFeeEarner = sanitizeScalar('feeEarner', feeEarner);
    const sanitizedData = sanitizeData(data);
    const sanitizedError = error ? sanitizeScalar('error', error) : null;
    const durationNumber = Number(duration);

    // Update presence tracker on heartbeats (Nav:heartbeat carries { tab })
    if (source === 'Nav' && type === 'heartbeat' && req.user) {
      presenceTracker.update(req.user, sanitizedData?.tab);
    }

    // Log to opLog for local persistence
    opLog.append({
      type: `telemetry.${source}.${type}`,
      route: 'server:/api/telemetry',
      clientSessionId: sessionId,
      entityRef: sanitizedEntityRef,
      feeEarner: sanitizedFeeEarner,
      data: sanitizedData,
      error: sanitizedError,
      durationMs: Number.isFinite(durationNumber) ? durationNumber : undefined,
      clientTimestamp: timestamp,
    });

    // Log structured data for Application Insights
    // Azure App Service will pick up console logs and send to App Insights
    const telemetryLog = {
      source,
      eventType: type,
      sessionId,
      entityRef: sanitizedEntityRef,
      feeEarner: sanitizedFeeEarner,
      durationMs: Number.isFinite(durationNumber) ? durationNumber : undefined,
      error: sanitizedError,
      timestamp: new Date().toISOString(),
      clientTimestamp: timestamp,
      ...sanitizedData
    };

    // Send to App Insights via structured log (no console dump in dev — too noisy)
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({
        message: `[Telemetry] ${source}:${type}`,
        ...telemetryLog
      }));
    }

    // Fire direct App Insights events for all client-side telemetry
    const eventName = `Client.${source}.${type}`;
    const measurements = Number.isFinite(durationNumber)
      ? { durationMs: durationNumber }
      : {};
    trackEvent(eventName, telemetryLog, measurements);
    if (Number.isFinite(durationNumber)) {
      trackMetric(`${eventName}.Duration`, durationNumber, {
        source,
        eventType: type,
        path: typeof sanitizedData?.path === 'string' ? sanitizedData.path : '',
      });
    }

    // Track errors/failures as exceptions in App Insights
    if (type.includes('error') || type.includes('failed') || type.includes('Failed') || sanitizedError) {
      trackException(new Error(sanitizedError || `${source}:${type}`), {
        component: 'Client',
        operation: type,
        source,
        clientSessionId: sessionId || '',
        feeEarner: sanitizedFeeEarner || ''
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Telemetry] Error processing telemetry:', err);
    // Don't fail the request - telemetry errors shouldn't affect the user
    res.status(200).json({ received: true, warning: 'Processing error' });
  }
});

/**
 * GET /api/telemetry/recent
 * 
 * Retrieve recent telemetry events (for debugging)
 */
router.get('/recent', (req, res) => {
  try {
    const { source, type, limit = 50 } = req.query;
    
    const typeFilter = source && type 
      ? `telemetry.${source}.${type}`
      : source 
        ? new RegExp(`^telemetry\\.${source}\\.`)
        : /^telemetry\./;
    
    const events = opLog.list({
      type: typeFilter,
      limit: parseInt(limit, 10)
    });

    res.json(events);
  } catch (err) {
    console.error('[Telemetry] Error fetching recent events:', err);
    res.status(500).json({ error: 'Failed to fetch telemetry' });
  }
});

/**
 * Sanitize data to remove sensitive information
 */
function sanitizeData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized = { ...data };

  // Remove potentially sensitive fields
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'cookie'];
  
  for (const key of Object.keys(sanitized)) {
    sanitized[key] = sanitizeScalar(key, sanitized[key]);

    // Truncate long strings
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
      sanitized[key] = sanitized[key].slice(0, 500) + '...[truncated]';
    }
  }

  return sanitized;
}

function sanitizeScalar(key, value) {
  if (value == null) return value;

  const lowerKey = String(key || '').toLowerCase();
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'auth', 'cookie',
    'email', 'phone', 'name', 'address', 'dob', 'birth',
    'instruction', 'prospect', 'matterid', 'clientid', 'enquiryid'
  ];

  if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return value
      .replace(EMAIL_PATTERN, '[redacted-email]')
      .replace(LONG_NUMBER_PATTERN, '[redacted-number]');
  }

  if (typeof value === 'object') {
    return '[object]';
  }

  return value;
}

module.exports = router;
