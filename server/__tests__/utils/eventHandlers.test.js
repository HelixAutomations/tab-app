/**
 * Tests for server/utils/eventHandlers.js — event routing map
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

const { routeEvent, _handlers } = require('../../utils/eventHandlers');
const { trackEvent } = require('../../utils/appInsights');

function makeDeps() {
  return {
    broadcastEnquiriesChanged: jest.fn(),
    broadcastPipelineChanged: jest.fn(),
    deleteCachePattern: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEvent(overrides = {}) {
  return {
    EventId: 1,
    EventType: 'instruction.completed',
    Source: 'instruct-pitch',
    EntityId: 'HLX-00001-12345',
    EntityType: 'instruction',
    CreatedAt: new Date().toISOString(),
    parsedPayload: null,
    ...overrides,
  };
}

describe('eventHandlers', () => {
  describe('handler registration', () => {
    test('has handlers for all expected event types', () => {
      const expectedTypes = [
        'instruction.completed',
        'payment.succeeded',
        'payment.failed',
        'id.verified',
        'matter.opened',
        'risk.assessed',
        'enquiry.created',
        'enquiry.claimed',
        'enquiry.stage_changed',
        'deal.created',
        'deal.updated',
        'matter.requested',
      ];
      for (const type of expectedTypes) {
        expect(_handlers[type]).toBeDefined();
        expect(typeof _handlers[type]).toBe('function');
      }
    });
  });

  describe('pipeline events', () => {
    test('instruction.completed invalidates cache and broadcasts pipeline', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'instruction.completed' });
      await routeEvent(event, deps);

      expect(deps.deleteCachePattern).toHaveBeenCalledWith(expect.stringContaining('inst:instruction:'));
      expect(deps.deleteCachePattern).toHaveBeenCalledWith('unified:*');
      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'instruction',
          status: 'completed',
          entityId: 'HLX-00001-12345',
        })
      );
      expect(deps.broadcastEnquiriesChanged).not.toHaveBeenCalled();
    });

    test('payment.succeeded broadcasts payment paid', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'payment.succeeded', EntityType: 'payment' });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'payment', status: 'paid' })
      );
    });

    test('payment.failed broadcasts payment failed', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'payment.failed', EntityType: 'payment' });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'payment', status: 'failed' })
      );
    });

    test('id.verified uses parsedPayload.result for status', async () => {
      const deps = makeDeps();
      const event = makeEvent({
        EventType: 'id.verified',
        EntityType: 'verification',
        parsedPayload: { result: 'failed' },
      });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'id', status: 'failed' })
      );
    });

    test('matter.opened broadcasts matter opened', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'matter.opened', EntityType: 'matter' });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'matter', status: 'opened' })
      );
    });

    test('deal.created broadcasts deal', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'deal.created', EntityType: 'deal' });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'deal', status: 'created' })
      );
    });

    test('deal.updated invalidates cache and broadcasts deal updated', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'deal.updated', EntityType: 'deal', parsedPayload: { action: 'closed' } });
      await routeEvent(event, deps);

      expect(deps.deleteCachePattern).toHaveBeenCalledWith(expect.stringContaining('inst:deal:'));
      expect(deps.deleteCachePattern).toHaveBeenCalledWith('unified:*');
      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'deal', status: 'closed', entityId: 'HLX-00001-12345' })
      );
    });

    test('deal.updated falls back to status "updated" when no action in payload', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'deal.updated', EntityType: 'deal', parsedPayload: { amount: 500 } });
      await routeEvent(event, deps);

      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'deal', status: 'updated' })
      );
    });

    test('matter.requested invalidates cache and broadcasts matter requested', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'matter.requested', EntityType: 'matter', parsedPayload: { matterId: 42 } });
      await routeEvent(event, deps);

      expect(deps.deleteCachePattern).toHaveBeenCalledWith(expect.stringContaining('inst:matter:'));
      expect(deps.deleteCachePattern).toHaveBeenCalledWith('unified:*');
      expect(deps.broadcastPipelineChanged).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'matter', status: 'requested', entityId: 'HLX-00001-12345' })
      );
    });
  });

  describe('enquiry events', () => {
    test('enquiry.created invalidates cache and broadcasts via enquiries stream', async () => {
      const deps = makeDeps();
      const event = makeEvent({
        EventType: 'enquiry.created',
        EntityId: '9999',
        EntityType: 'enquiry',
        Source: 'enquiry-processing',
      });
      await routeEvent(event, deps);

      expect(deps.deleteCachePattern).toHaveBeenCalledWith('unified:enquiries:*');
      expect(deps.broadcastEnquiriesChanged).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'create', enquiryId: '9999' })
      );
      expect(deps.broadcastPipelineChanged).not.toHaveBeenCalled();
    });

    test('enquiry.claimed broadcasts claim with claimedBy from payload', async () => {
      const deps = makeDeps();
      const event = makeEvent({
        EventType: 'enquiry.claimed',
        EntityId: '9999',
        EntityType: 'enquiry',
        parsedPayload: { claimedBy: 'LZ', claimedAt: '2026-04-10T10:00:00Z' },
      });
      await routeEvent(event, deps);

      expect(deps.broadcastEnquiriesChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: 'claim',
          enquiryId: '9999',
          claimedBy: 'LZ',
          claimedAt: '2026-04-10T10:00:00Z',
        })
      );
    });

    test('enquiry.stage_changed broadcasts update', async () => {
      const deps = makeDeps();
      const event = makeEvent({
        EventType: 'enquiry.stage_changed',
        EntityId: '9999',
        EntityType: 'enquiry',
        parsedPayload: { stage: 'Instructed' },
      });
      await routeEvent(event, deps);

      expect(deps.broadcastEnquiriesChanged).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'update', record: { stage: 'Instructed' } })
      );
    });
  });

  describe('unknown events', () => {
    test('logs warning and tracks routing failure for unknown event type', async () => {
      const deps = makeDeps();
      const event = makeEvent({ EventType: 'something.unknown' });
      await routeEvent(event, deps);

      expect(deps.broadcastEnquiriesChanged).not.toHaveBeenCalled();
      expect(deps.broadcastPipelineChanged).not.toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledWith('EventPoller.Event.RoutingFailed', expect.any(Object));
    });
  });
});
