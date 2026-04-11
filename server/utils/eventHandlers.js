/**
 * Event Handlers — routing map that determines what to do when each event type arrives.
 *
 * Each handler: invalidate relevant cache keys → broadcast via SSE → return.
 * Handlers receive DI deps for testability.
 */

const { createLogger } = require('./logger');
const { trackEvent } = require('./appInsights');

const log = createLogger('EventHandlers');

/**
 * Handler map: EventType → async handler(event, deps).
 *
 * deps: { broadcastEnquiriesChanged, broadcastPipelineChanged, deleteCachePattern }
 */
const handlers = {
  // ── Instruction pipeline events ──

  'instruction.completed': async (event, deps) => {
    await deps.deleteCachePattern(`inst:instruction:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'instruction',
      status: 'completed',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'payment.succeeded': async (event, deps) => {
    await deps.deleteCachePattern(`inst:payment:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'payment',
      status: 'paid',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'payment.failed': async (event, deps) => {
    await deps.deleteCachePattern(`inst:payment:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'payment',
      status: 'failed',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'id.verified': async (event, deps) => {
    await deps.deleteCachePattern(`inst:verification:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    const status = event.parsedPayload?.result || 'passed';
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'id',
      status,
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'matter.opened': async (event, deps) => {
    await deps.deleteCachePattern(`inst:matter:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'matter',
      status: 'opened',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'risk.assessed': async (event, deps) => {
    await deps.deleteCachePattern(`inst:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'risk',
      status: event.parsedPayload?.result || 'completed',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  // ── Enquiry events (flow through existing enquiries broadcast) ──

  'enquiry.created': async (event, deps) => {
    await deps.deleteCachePattern(`unified:enquiries:*`);
    await deps.deleteCachePattern(`unified:data:*`);
    deps.broadcastEnquiriesChanged({
      changeType: 'create',
      enquiryId: event.EntityId,
      source: event.Source,
    });
  },

  'enquiry.posted': async (event, deps) => {
    await deps.deleteCachePattern(`unified:enquiries:*`);
    await deps.deleteCachePattern(`unified:data:*`);
    deps.broadcastEnquiriesChanged({
      changeType: 'posted',
      enquiryId: event.EntityId,
      source: event.Source,
    });
  },

  'enquiry.claimed': async (event, deps) => {
    await deps.deleteCachePattern(`unified:enquiries:*`);
    await deps.deleteCachePattern(`unified:data:*`);
    deps.broadcastEnquiriesChanged({
      changeType: 'claim',
      enquiryId: event.EntityId,
      claimedBy: event.parsedPayload?.claimedBy || '',
      claimedAt: event.parsedPayload?.claimedAt || null,
      source: event.Source,
    });
  },

  'enquiry.stage_changed': async (event, deps) => {
    await deps.deleteCachePattern(`unified:enquiries:*`);
    deps.broadcastEnquiriesChanged({
      changeType: 'update',
      enquiryId: event.EntityId,
      record: event.parsedPayload || {},
      source: event.Source,
    });
  },

  // ── Deal events ──

  'deal.created': async (event, deps) => {
    await deps.deleteCachePattern(`inst:deal:*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'deal',
      status: 'created',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'deal.updated': async (event, deps) => {
    await deps.deleteCachePattern(`inst:deal:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'deal',
      status: event.parsedPayload?.action || 'updated',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },

  'matter.requested': async (event, deps) => {
    await deps.deleteCachePattern(`inst:matter:*${event.EntityId}*`);
    await deps.deleteCachePattern(`unified:*`);
    deps.broadcastPipelineChanged({
      eventType: event.EventType,
      entityId: event.EntityId,
      entityType: event.EntityType,
      field: 'matter',
      status: 'requested',
      source: event.Source,
      timestamp: event.CreatedAt,
      data: event.parsedPayload,
    });
  },
};

/**
 * Route an event to its handler. Logs a warning for unknown event types.
 *
 * @param {object} event - Row from Events table (with parsedPayload added by poller)
 * @param {object} deps  - { broadcastEnquiriesChanged, broadcastPipelineChanged, deleteCachePattern }
 */
async function routeEvent(event, deps) {
  const handler = handlers[event.EventType];
  if (!handler) {
    log.warn(`No handler for event type: ${event.EventType} (EventId: ${event.EventId})`);
    trackEvent('EventPoller.Event.RoutingFailed', {
      eventType: event.EventType,
      eventId: String(event.EventId),
      source: event.Source,
    });
    return;
  }

  await handler(event, deps);
}

module.exports = {
  routeEvent,
  // Exposed for testing — allows checking registered types
  _handlers: handlers,
};
