/**
 * Tests for server/middleware/requireUser.js
 */

// Mocks MUST be declared before require() — no babel hoisting with transform: {}
jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

const requireUser = require('../../middleware/requireUser');

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/matters',
    originalUrl: '/api/matters',
    user: null,
    headers: {},
    get: jest.fn(() => null),
    ...overrides,
  };
}

function mockRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('requireUser', () => {
  test('passes through when req.user is set', () => {
    const req = mockReq({ user: { initials: 'LZ' } });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when req.user is null (production)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      requireUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('skips auth check in non-production (dev passthrough)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      requireUser(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('skips non-API paths', () => {
    const req = mockReq({ path: '/index.html', originalUrl: '/index.html' });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('skips OPTIONS requests', () => {
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('skips public endpoints (health)', () => {
    const req = mockReq({ path: '/api/health', originalUrl: '/api/health' });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('skips public endpoints (stripe)', () => {
    const req = mockReq({ path: '/api/stripe/webhook', originalUrl: '/api/stripe/webhook' });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('skips public endpoints (telemetry)', () => {
    const req = mockReq({ path: '/api/telemetry', originalUrl: '/api/telemetry' });
    const res = mockRes();
    const next = jest.fn();

    requireUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
