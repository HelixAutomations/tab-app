const express = require('express');
const request = require('supertest');

const mockGetFutureBookingsSnapshot = jest.fn();
const mockGetOutstandingBalancesSnapshot = jest.fn();
const mockGetRedisClient = jest.fn();

jest.mock('../../routes/futureBookings', () => ({
  getFutureBookingsSnapshot: mockGetFutureBookingsSnapshot,
}));

jest.mock('../../routes/outstandingBalances', () => ({
  getOutstandingBalancesSnapshot: mockGetOutstandingBalancesSnapshot,
}));

jest.mock('../../utils/redisClient', () => ({
  getRedisClient: (...args) => mockGetRedisClient(...args),
  generateCacheKey: (...parts) => parts.join(':'),
}));

const homeMetricsRouter = require('../../routes/home-metrics-stream');

function createApp() {
  const app = express();
  app.use('/api/home-metrics', homeMetricsRouter);
  return app;
}

describe('home-metrics stream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRedisClient.mockResolvedValue(null);
    mockGetFutureBookingsSnapshot.mockResolvedValue({
      boardroomBookings: [],
      soundproofBookings: [],
    });
    mockGetOutstandingBalancesSnapshot.mockResolvedValue({
      data: [],
      meta: { source: 'table' },
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('uses local snapshot helpers for default home metrics', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/home-metrics/stream')
      .query({ metrics: 'futureBookings,outstandingBalances' });

    expect(response.status).toBe(200);
    expect(mockGetFutureBookingsSnapshot).toHaveBeenCalledWith({ forceRefresh: false });
    expect(mockGetOutstandingBalancesSnapshot).toHaveBeenCalledWith({ forceLive: false });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.text).toContain('"metric":"futureBookings"');
    expect(response.text).toContain('"metric":"outstandingBalances"');
    expect(response.text).toContain('"type":"complete"');
  });
});