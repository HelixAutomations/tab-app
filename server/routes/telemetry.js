/**
 * Telemetry Route
 * 
 * Receives client-side telemetry events and logs them for Application Insights.
 * Events are also stored in opLog for local debugging.
 */
const express = require('express');
const router = express.Router();
const opLog = require('../utils/opLog');
const { trackEvent, trackException } = require('../utils/appInsights');

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

    // Log to opLog for local persistence
    opLog.append({
      type: `telemetry.${source}.${type}`,
      route: 'server:/api/telemetry',
      clientSessionId: sessionId,
      enquiryId,
      feeEarner,
      data,
      error,
      durationMs: duration,
      clientTimestamp: timestamp,
    });

    // Log structured data for Application Insights
    // Azure App Service will pick up console logs and send to App Insights
    const telemetryLog = {
      source,
      eventType: type,
      sessionId,
      enquiryId,
      feeEarner,
      durationMs: duration,
      error: error || null,
      timestamp: new Date().toISOString(),
      clientTimestamp: timestamp,
      ...sanitizeData(data)
    };

    // Use console.log with JSON for structured logging in Application Insights
    console.log(JSON.stringify({
      message: `[Telemetry] ${source}:${type}`,
      ...telemetryLog
    }));

    // Fire direct App Insights events for all client-side telemetry
    const eventName = `Client.${source}.${type}`;
    trackEvent(eventName, telemetryLog);

    // Track errors/failures as exceptions in App Insights
    if (type.includes('error') || type.includes('failed') || type.includes('Failed') || error) {
      trackException(new Error(error || `${source}:${type}`), {
        component: 'MatterOpening',
        operation: type,
        source,
        instructionRef: data?.instructionRef || data?.instruction_ref || enquiryId || '',
        feeEarner: feeEarner || ''
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
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
    
    // Truncate long strings
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
      sanitized[key] = sanitized[key].slice(0, 500) + '...[truncated]';
    }
  }

  return sanitized;
}

module.exports = router;
