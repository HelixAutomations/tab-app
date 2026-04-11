/**
 * Event Poller — polls the shared Events table for unprocessed events,
 * routes them to handlers (cache invalidation + SSE broadcast), then stamps ProcessedAt.
 *
 * Follows the same start pattern as dataOperationsScheduler.js:
 * called from server/index.js and server/server.js inside app.listen() callback.
 */

const { getPool, sql } = require('./db');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { createLogger } = require('./logger');
const { routeEvent } = require('./eventHandlers');
const { broadcastEnquiriesChanged, broadcastPipelineChanged } = require('./enquiries-stream');
const { deleteCachePattern } = require('./redisClient');
const { status: devStatus } = require('./devConsole');

const log = createLogger('EventPoller');

const POLL_INTERVAL_MS = Number(process.env.EVENT_POLL_INTERVAL_MS || 3000);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RETENTION_DAYS = 7;
const BATCH_SIZE = 50;

let pollTimer = null;
let cleanupTimer = null;
let isPolling = false; // Simple mutex — one tick at a time
let lastProcessedEventId = 0;

// ── Dependencies injected into handlers for testability ──
const deps = {
  broadcastEnquiriesChanged,
  broadcastPipelineChanged,
  deleteCachePattern,
};

/**
 * Single poll tick: fetch unprocessed events, route each, stamp ProcessedAt.
 */
async function pollTick() {
  if (isPolling) return;
  isPolling = true;

  const tickStart = Date.now();
  let eventsProcessed = 0;

  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) {
      log.warn('No INSTRUCTIONS_SQL_CONNECTION_STRING — skipping event poll');
      return;
    }

    const pool = await getPool(connStr);
    const request = new sql.Request(pool);
    request.input('lastId', sql.BigInt, lastProcessedEventId);

    const result = await request.query(`
      SELECT TOP ${BATCH_SIZE}
        EventId, EventType, Source, EntityId, EntityType, Payload, CreatedAt
      FROM [dbo].[Events]
      WHERE ProcessedAt IS NULL
        AND EventId > @lastId
      ORDER BY CreatedAt ASC
    `);

    const events = result.recordset || [];
    if (events.length === 0) return;

    // Process each event through the routing map
    const processedIds = [];
    for (const event of events) {
      try {
        // Parse Payload JSON if present
        let payload = null;
        if (event.Payload) {
          try { payload = JSON.parse(event.Payload); } catch { payload = null; }
        }

        await routeEvent(
          { ...event, parsedPayload: payload },
          deps
        );

        processedIds.push(event.EventId);
        eventsProcessed++;

        // E2E latency: time from event creation to processing
        const e2eLatencyMs = event.CreatedAt ? Date.now() - new Date(event.CreatedAt).getTime() : 0;
        if (e2eLatencyMs > 0) {
          trackMetric('EventPoller.Event.E2ELatency', e2eLatencyMs, { eventType: event.EventType });
        }

        trackEvent('EventPoller.Event.Processed', {
          eventType: event.EventType,
          source: event.Source,
          entityId: event.EntityId,
          entityType: event.EntityType,
        });
      } catch (handlerErr) {
        // Individual handler failure — log but continue processing remaining events
        log.error(`Handler failed for EventId ${event.EventId} (${event.EventType}):`, handlerErr.message);
        trackException(handlerErr, {
          operation: 'EventPoller.RouteEvent',
          eventId: String(event.EventId),
          eventType: event.EventType,
        });
        trackEvent('EventPoller.Event.HandlerFailed', {
          eventType: event.EventType,
          eventId: String(event.EventId),
          source: event.Source,
          error: handlerErr.message,
        });
        // Still stamp as processed to avoid infinite retry loop
        processedIds.push(event.EventId);
      }
    }

    // Batch stamp ProcessedAt
    if (processedIds.length > 0) {
      const stampRequest = new sql.Request(pool);
      // Build parameterised IN clause
      const idParams = processedIds.map((id, i) => `@eid${i}`);
      processedIds.forEach((id, i) => {
        stampRequest.input(`eid${i}`, sql.BigInt, id);
      });
      await stampRequest.query(`
        UPDATE [dbo].[Events]
        SET ProcessedAt = SYSUTCDATETIME()
        WHERE EventId IN (${idParams.join(',')})
      `);

      // Advance watermark
      lastProcessedEventId = Math.max(...processedIds);
    }
  } catch (err) {
    log.error('Poll tick failed:', err.message);
    trackException(err, { operation: 'EventPoller.Tick', phase: 'poll' });
    trackEvent('EventPoller.Tick.Failed', { error: err.message });
  } finally {
    isPolling = false;
    const durationMs = Date.now() - tickStart;
    if (eventsProcessed > 0) {
      log.info(`Processed ${eventsProcessed} events in ${durationMs}ms`);
      devStatus('Event poller', true, `${eventsProcessed} event${eventsProcessed > 1 ? 's' : ''} processed in ${durationMs}ms`);
      trackEvent('EventPoller.Tick.Completed', {
        eventsProcessed: String(eventsProcessed),
        durationMs: String(durationMs),
      });
      trackMetric('EventPoller.Tick.Duration', durationMs, { eventsProcessed: String(eventsProcessed) });
    }
  }
}

/**
 * Hourly cleanup: remove events older than RETENTION_DAYS.
 */
async function cleanupOldEvents() {
  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return;

    const pool = await getPool(connStr);
    const request = new sql.Request(pool);
    request.input('retentionDays', sql.Int, RETENTION_DAYS);

    const result = await request.query(`
      DELETE FROM [dbo].[Events]
      WHERE CreatedAt < DATEADD(DAY, -@retentionDays, SYSUTCDATETIME())
    `);

    const deleted = result.rowsAffected?.[0] || 0;
    if (deleted > 0) {
      log.info(`Cleanup: removed ${deleted} events older than ${RETENTION_DAYS} days`);
      trackEvent('EventPoller.Cleanup.Completed', { deleted: String(deleted) });
    }
  } catch (err) {
    log.error('Cleanup failed:', err.message);
    trackException(err, { operation: 'EventPoller.Cleanup' });
  }
}

/**
 * Start the event poller. Called once from server boot (inside app.listen callback).
 */
function startEventPoller() {
  if (pollTimer) {
    log.warn('Event poller already started — ignoring duplicate call');
    return;
  }

  log.info(`Event poller starting (interval: ${POLL_INTERVAL_MS}ms, batch: ${BATCH_SIZE}, retention: ${RETENTION_DAYS}d)`);
  devStatus('Event poller', true, `polling every ${POLL_INTERVAL_MS / 1000}s (batch ${BATCH_SIZE}, retention ${RETENTION_DAYS}d)`);
  trackEvent('EventPoller.Started', {
    intervalMs: String(POLL_INTERVAL_MS),
    batchSize: String(BATCH_SIZE),
    retentionDays: String(RETENTION_DAYS),
  });

  // Poll timer
  pollTimer = setInterval(() => {
    pollTick().catch(() => { /* logged inside pollTick */ });
  }, POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  // Cleanup timer
  cleanupTimer = setInterval(() => {
    cleanupOldEvents().catch(() => { /* logged inside cleanupOldEvents */ });
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  // Run first tick immediately
  pollTick().catch(() => {});
}

/**
 * Stop the event poller (for graceful shutdown / tests).
 */
function stopEventPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  lastProcessedEventId = 0;
  isPolling = false;
  log.info('Event poller stopped');
}

module.exports = {
  startEventPoller,
  stopEventPoller,
  POLL_INTERVAL_MS,
  // Exposed for testing
  _pollTick: pollTick,
  _cleanupOldEvents: cleanupOldEvents,
};
