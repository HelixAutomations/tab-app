jest.mock('../../utils/db', () => ({
  withRequest: jest.fn(),
}));

const { withRequest } = require('../../utils/db');
const { userContextMiddleware } = require('../../middleware/userContext');

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/matters',
    query: {},
    body: undefined,
    headers: {},
    ...overrides,
  };
}

function mockRes() {
  return {
    statusCode: 200,
    send: jest.fn(),
  };
}

function primeUserLookup(row) {
  withRequest.mockImplementation(async (_connectionString, callback) => {
    const request = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn().mockResolvedValue({ recordset: row ? [row] : [] }),
    };

    const sqlClient = {
      NVarChar: 'NVarChar',
      VarChar: jest.fn(() => 'VarChar'),
    };

    return callback(request, sqlClient);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SQL_CONNECTION_STRING = 'Server=local;Database=test;';
});

describe('userContextMiddleware', () => {
  test('hydrates req.user from Azure client principal object identifier claims', async () => {
    const entraId = '11111111-2222-3333-4444-555555555555';
    const email = 'lz@helix-law.com';

    primeUserLookup({
      entraId,
      fullName: 'Luke Ze',
      initials: 'LZ',
      email,
      clioId: '141740',
      role: 'Admin',
    });

    const clientPrincipal = Buffer.from(JSON.stringify({
      userDetails: email,
      claims: [
        {
          typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier',
          val: entraId,
        },
        {
          typ: 'preferred_username',
          val: email,
        },
      ],
    })).toString('base64');

    const req = mockReq({
      headers: {
        'x-ms-client-principal': clientPrincipal,
      },
    });
    const res = mockRes();
    const next = jest.fn();

    await userContextMiddleware(req, res, next);

    expect(withRequest).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(expect.objectContaining({
      entraId,
      initials: 'LZ',
      email,
    }));
    expect(next).toHaveBeenCalledTimes(1);
  });
});