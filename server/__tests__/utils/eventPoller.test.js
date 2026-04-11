/**
 * Tests for server/utils/eventPoller.js — poll loop, stamp, cleanup
 */

// ── Mocks (before require) ──

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

const mockQuery = jest.fn();
const mockInput = jest.fn().mockReturnThis();
const MockRequest = jest.fn(() => ({ query: mockQuery, input: mockInput }));

jest.mock('../../utils/db', () => ({
  getPool: jest.fn().mockResolvedValue({ connected: true }),
  sql: { Request: MockRequest, BigInt: 'BigInt', Int: 'Int' },
}));

jest.mock('../../utils/eventHandlers', () => ({
  routeEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/enquiries-stream', () => ({
  broadcastEnquiriesChanged: jest.fn(),
  broadcastPipelineChanged: jest.fn(),
  lastBroadcastClaimStateByEnquiryId: new Map(),
}));

jest.mock('../../utils/redisClient', () => ({
  deleteCachePattern: jest.fn().mockResolvedValue(undefined),
}));

// ── Setup ──

let pollTick, cleanupOldEvents, startEventPoller, stopEventPoller;
const { routeEvent } = require('../../utils/eventHandlers');
const { trackEvent, trackException } = require('../../utils/appInsights');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = 'Server=test;Database=test;';

  // Re-require to reset internal state
  jest.resetModules();

  // Re-apply mocks after resetModules
  jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  }));
  jest.mock('../../utils/appInsights', () => ({
    trackEvent: jest.fn(),
    trackException: jest.fn(),
    trackMetric: jest.fn(),
  }));
  jest.mock('../../utils/db', () => ({
    getPool: jest.fn().mockResolvedValue({ connected: true }),
    sql: { Request: MockRequest, BigInt: 'BigInt', Int: 'Int' },
  }));
  jest.mock('../../utils/eventHandlers', () => ({
    routeEvent: jest.fn().mockResolvedValue(undefined),
  }));
  jest.mock('../../utils/enquiries-stream', () => ({
    broadcastEnquiriesChanged: jest.fn(),
    broadcastPipelineChanged: jest.fn(),
    lastBroadcastClaimStateByEnquiryId: new Map(),
  }));
  jest.mock('../../utils/redisClient', () => ({
    deleteCachePattern: jest.fn().mockResolvedValue(undefined),
  }));

  const poller = require('../../utils/eventPoller');
  pollTick = poller._pollTick;
  cleanupOldEvents = poller._cleanupOldEvents;
  startEventPoller = poller.startEventPoller;
  stopEventPoller = poller.stopEventPoller;
});

afterEach(() => {
  if (stopEventPoller) stopEventPoller();
  delete process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
});

describe('eventPoller', () => {
  describe('pollTick', () => {
    test('does nothing when no unprocessed events exist', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      await pollTick();

      const { routeEvent: handler } = require('../../utils/eventHandlers');
      expect(handler).not.toHaveBeenCalled();
    });

    test('processes events and stamps ProcessedAt', async () => {
      const fakeEvents = [
        { EventId: 1, EventType: 'instruction.completed', Source: 'instruct-pitch', EntityId: 'HLX-001', EntityType: 'instruction', Payload: null, CreatedAt: new Date().toISOString() },
        { EventId: 2, EventType: 'payment.succeeded', Source: 'instruct-pitch', EntityId: 'HLX-002', EntityType: 'payment', Payload: '{"amount":500}', CreatedAt: new Date().toISOString() },
      ];

      // First call: SELECT events
      mockQuery.mockResolvedValueOnce({ recordset: fakeEvents });
      // Second call: UPDATE stamp
      mockQuery.mockResolvedValueOnce({ rowsAffected: [2] });

      await pollTick();

      const { routeEvent: handler } = require('../../utils/eventHandlers');
      expect(handler).toHaveBeenCalledTimes(2);

      // First event — no payload
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ EventId: 1, EventType: 'instruction.completed', parsedPayload: null }),
        expect.any(Object)
      );

      // Second event — parsed payload
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ EventId: 2, parsedPayload: { amount: 500 } }),
        expect.any(Object)
      );

      // Verify stamp query was called
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('skips poll when INSTRUCTIONS_SQL_CONNECTION_STRING is missing', async () => {
      delete process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

      await pollTick();

      const { routeEvent: handler } = require('../../utils/eventHandlers');
      expect(handler).not.toHaveBeenCalled();
    });

    test('handles DB errors gracefully without crashing', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(pollTick()).resolves.toBeUndefined();

      const { trackException: te } = require('../../utils/appInsights');
      expect(te).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: 'EventPoller.Tick' })
      );
    });

    test('still stamps event as processed even when handler throws', async () => {
      const fakeEvents = [
        { EventId: 10, EventType: 'instruction.completed', Source: 'test', EntityId: 'X', EntityType: 'instruction', Payload: null, CreatedAt: new Date().toISOString() },
      ];

      mockQuery.mockResolvedValueOnce({ recordset: fakeEvents });
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

      const { routeEvent: handler } = require('../../utils/eventHandlers');
      handler.mockRejectedValueOnce(new Error('Handler exploded'));

      await pollTick();

      // Stamp query should still be called (event marked processed to avoid infinite retry)
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // Should track handler failure event
      const { trackEvent: te } = require('../../utils/appInsights');
      expect(te).toHaveBeenCalledWith('EventPoller.Event.HandlerFailed', expect.objectContaining({
        eventType: 'instruction.completed',
        eventId: '10',
      }));
    });

    test('tracks E2E latency metric for processed events', async () => {
      const fakeEvents = [
        { EventId: 20, EventType: 'payment.succeeded', Source: 'instruct-pitch', EntityId: 'HLX-003', EntityType: 'payment', Payload: null, CreatedAt: new Date(Date.now() - 1500).toISOString() },
      ];

      mockQuery.mockResolvedValueOnce({ recordset: fakeEvents });
      mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

      await pollTick();

      const { trackMetric: tm } = require('../../utils/appInsights');
      expect(tm).toHaveBeenCalledWith('EventPoller.Event.E2ELatency', expect.any(Number), expect.objectContaining({
        eventType: 'payment.succeeded',
      }));
    });
  });

  describe('cleanupOldEvents', () => {
    test('deletes events older than retention period', async () => {
      mockQuery.mockResolvedValueOnce({ rowsAffected: [150] });

      await cleanupOldEvents();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM [dbo].[Events]')
      );
    });

    test('handles cleanup errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Cleanup failed'));

      await expect(cleanupOldEvents()).resolves.toBeUndefined();
    });
  });

  describe('startEventPoller / stopEventPoller', () => {
    test('start sets up timers, stop clears them', () => {
      // Suppress actual polling by removing conn string
      delete process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

      startEventPoller();
      // Should not throw on duplicate start
      startEventPoller();

      stopEventPoller();
      // Should not throw on duplicate stop
      stopEventPoller();
    });
  });
});
