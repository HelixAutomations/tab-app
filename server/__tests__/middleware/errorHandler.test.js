/**
 * Tests for server/middleware/errorHandler.js
 */

// Mocks MUST be declared before require() — no babel hoisting with transform: {}
jest.mock('../../utils/appInsights', () => ({
  trackException: jest.fn(),
  trackEvent: jest.fn(),
  trackMetric: jest.fn(),
}));

jest.mock('../../utils/hubNotifier', () => ({
  notify: jest.fn(),
}));

const errorHandler = require('../../middleware/errorHandler');
const { trackException, trackEvent } = require('../../utils/appInsights');
const { notify } = require('../../utils/hubNotifier');

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    get: jest.fn(() => null),
    ...overrides,
  };
}

function mockRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('errorHandler', () => {
  test('returns 500 JSON for API routes by default', () => {
    const err = new Error('boom');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'internal_error',
        message: 'boom',
      })
    );
  });

  test('returns 413 for PayloadTooLargeError', () => {
    const err = new Error('too big');
    err.name = 'PayloadTooLargeError';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'payload_too_large',
        message: 'Request body too large',
      })
    );
  });

  test('sends plain text for non-API routes', () => {
    const err = new Error('bad');
    const req = mockReq({ originalUrl: '/some-page' });
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('bad');
    expect(res.json).not.toHaveBeenCalled();
  });

  test('tracks exception and event in App Insights', () => {
    const err = new Error('tracked');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(trackException).toHaveBeenCalledWith(err, expect.objectContaining({
      operation: 'HTTP.UnhandledError',
    }));
    expect(trackEvent).toHaveBeenCalledWith('Server.Error.Caught', expect.objectContaining({
      status: '500',
    }));
  });

  test('sends DM notification for 500 errors', () => {
    const err = new Error('server down');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(notify).toHaveBeenCalledWith('error.critical', expect.objectContaining({
      status: 500,
      message: 'server down',
    }));
  });

  test('does NOT send DM for 4xx errors', () => {
    const err = new Error('not found');
    err.status = 404;
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(notify).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('uses error.status when provided', () => {
    const err = new Error('forbidden');
    err.status = 403;
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
