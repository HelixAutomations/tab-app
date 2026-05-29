jest.mock('mssql', () => ({
  NVarChar: jest.fn(() => 'NVarChar'),
  VarChar: jest.fn(() => 'VarChar'),
  Int: 'Int',
  Money: 'Money',
  Date: 'Date',
  Time: 'Time',
  Bit: 'Bit',
  MAX: 'MAX',
}));

jest.mock('../../utils/db', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../utils/eventEmitter', () => ({
  emitEvent: jest.fn(),
}));

jest.mock('../../utils/pitchTeamsNotifications', () => ({
  queuePitchLinkNotification: jest.fn(),
}));

jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  loggers: {
    payments: {
      child: () => ({
        op: jest.fn(),
        fail: jest.fn(),
      }),
    },
  },
}));

const express = require('express');
const request = require('supertest');
const { getPool } = require('../../utils/db');
const { queuePitchLinkNotification } = require('../../utils/pitchTeamsNotifications');
const dealCapture = require('../../routes/dealCapture');

function createPoolMock() {
  const requests = [];
  const pool = {
    request: jest.fn(() => {
      const req = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn(async (queryText) => {
          if (/INFORMATION_SCHEMA\.COLUMNS/i.test(queryText)) {
            return { recordset: [{ COLUMN_NAME: 'DealKind' }] };
          }
          if (/OUTPUT INSERTED\.DealId/i.test(queryText)) {
            return { recordset: [{ DealId: 42 }] };
          }
          return { recordset: [] };
        }),
      };
      requests.push(req);
      return req;
    }),
    requests,
  };
  return pool;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { email: 'lz@helix-law.com', initials: 'LZ', fullName: 'Luke' };
    next();
  });
  app.post('/api/deal-capture', dealCapture);
  return app;
}

describe('dealCapture route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = 'Server=local;Database=instructions;';
    process.env.DEAL_INSTRUCTIONS_URL = 'https://instruct.helix-law.com/pitch';
    getPool.mockResolvedValue(createPoolMock());
  });

  test('queues a pitch Teams DM after creating a deal', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/deal-capture')
      .set('x-user-email', 'lz@helix-law.com')
      .send({
        linkOnly: true,
        prospectId: 12345,
        serviceDescription: 'Commercial contract advice',
        amount: 2000,
        areaOfWork: 'Commercial',
        pitchedBy: 'LZ',
        firstName: 'Test',
        lastName: 'Client',
        leadClientEmail: 'client@example.test',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      dealId: 42,
      instructionsUrl: expect.stringContaining('/pitch/'),
    }));
    expect(queuePitchLinkNotification).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 42,
      amount: 2000,
      areaOfWork: 'Commercial',
      serviceDescription: 'Commercial contract advice',
      firstName: 'Test',
      lastName: 'Client',
      linkOnly: true,
      requestedBy: 'Luke',
    }));
  });
});