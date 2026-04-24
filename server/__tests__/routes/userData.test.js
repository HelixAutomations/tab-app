jest.mock('../../utils/db', () => ({
  withRequest: jest.fn(),
}));

jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { withRequest } = require('../../utils/db');
const userDataRouter = require('../../routes/userData');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/user-data', userDataRouter);
  return app;
}

describe('userData route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SQL_CONNECTION_STRING = 'Server=local;Database=test;';
  });

  test('hydrates a full user row from email and initials when object id is unavailable', async () => {
    const requestMock = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn().mockResolvedValue({
        recordset: [{
          'Full Name': 'Luke Ze',
          Initials: 'LZ',
          Email: 'lz@helix-law.com',
          'Entra ID': '11111111-2222-3333-4444-555555555555',
          'Clio ID': '141740',
          Role: 'Admin',
          AOW: 'Commercial',
          status: 'active',
        }],
      }),
    };
    const sqlClient = {
      NVarChar: 'NVarChar',
      VarChar: jest.fn(() => 'VarChar'),
    };

    withRequest.mockImplementation(async (_connectionString, callback) => callback(requestMock, sqlClient));

    const app = createApp();
    const response = await request(app)
      .post('/api/user-data')
      .send({ email: 'lz@helix-law.com', initials: 'lz' });

    expect(response.status).toBe(200);
    expect(requestMock.input).toHaveBeenCalledWith('email', 'VarChar', 'lz@helix-law.com');
    expect(requestMock.input).toHaveBeenCalledWith('initials', 'VarChar', 'LZ');
    expect(response.body).toEqual([
      expect.objectContaining({
        Email: 'lz@helix-law.com',
        Initials: 'LZ',
        EntraID: '11111111-2222-3333-4444-555555555555',
        FullName: 'Luke Ze',
        clio_id: '141740',
      }),
    ]);
  });

  test('returns 400 when no lookup fields are provided', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/user-data')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      error: 'Missing lookup fields in request body',
    }));
  });
});