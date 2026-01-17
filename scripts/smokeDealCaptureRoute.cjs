/*
  Smoke-test the deal capture route handler without a real SQL connection.

  Goals:
  - Ensure INSTRUCTIONS_SQL_CONNECTION_STRING parsing supports both:
      - Server=...;Initial Catalog=...
      - Data Source=...;Database=...
  - Ensure "Invalid object name 'Deals'." maps to recoverable response (200)

  Usage:
    node scripts/smokeDealCaptureRoute.cjs
*/

const assert = require('assert');
const path = require('path');

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createMockPool() {
  const calls = [];

  function makeRequest() {
    const inputs = [];
    return {
      input(name, _type, value) {
        inputs.push({ name, value });
        return this;
      },
      async query(sqlText) {
        calls.push({ sqlText, inputs: [...inputs] });

        if (/SELECT TOP 1 DealId, Passcode\s+FROM\s+dbo\.Deals/i.test(sqlText)) {
          return { recordset: [] }; // no duplicates
        }

        if (/INSERT INTO\s+dbo\.Deals/i.test(sqlText)) {
          return { recordset: [{ DealId: 12345 }] };
        }

        if (/INSERT INTO\s+dbo\.DealJointClients/i.test(sqlText)) {
          return { recordset: [] };
        }

        if (/INSERT INTO\s+dbo\.PitchContent/i.test(sqlText)) {
          return { recordset: [] };
        }

        throw new Error(`Unexpected SQL in mock: ${sqlText}`);
      }
    };
  }

  return {
    calls,
    request() {
      return makeRequest();
    }
  };
}

async function runCase({ name, connectionString, connectImpl, expectFn }) {
  // Ensure a clean module load each case (dealCapture caches dbConfig)
  const dealCapturePath = require.resolve('../server/routes/dealCapture');
  delete require.cache[dealCapturePath];

  // IMPORTANT: dealCapture resolves 'mssql' from within the server package (server/node_modules)
  // which can be a different module instance than this script would load from the workspace root.
  // Mock the exact module path dealCapture will resolve.
  const mssqlPath = require.resolve('mssql', {
    paths: [path.join(__dirname, '../server/routes')]
  });
  delete require.cache[mssqlPath];

  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = connectionString;

  const mockSql = {
    // Minimal surface area needed by server/routes/dealCapture.js
    MAX: 'MAX',
    Int: 'Int',
    Money: 'Money',
    Date: 'Date',
    Time: 'Time',
    Bit: 'Bit',
    NVarChar: (len) => ({ type: 'NVarChar', len }),
    connect: connectImpl
  };

  require.cache[mssqlPath] = {
    id: mssqlPath,
    filename: mssqlPath,
    loaded: true,
    exports: mockSql
  };

  const handler = require(dealCapturePath);

  const req = {
    body: {
      serviceDescription: 'Test service',
      amount: 1500,
      areaOfWork: 'commercial (costs)',
      prospectId: 22388,
      pitchedBy: 'LZ',
      isMultiClient: false,
      leadClientEmail: 'test@example.com',
      clients: [],
      emailSubject: 'Subject',
      emailBody: 'Body',
      emailBodyHtml: '<p>Body</p>',
      reminders: [],
      notes: ''
    }
  };

  const res = createMockRes();

  await handler(req, res);
  await expectFn({ res });

  console.log(`✅ ${name} -> status=${res.statusCode}`);
}

(async () => {
  // Case 1: Server/Initial Catalog parsing
  await runCase({
    name: 'parses Server + Initial Catalog',
    connectionString:
      'Server=tcp:myserver.database.windows.net,1433;Initial Catalog=InstructionsDb;User ID=myuser;Password=mypassword;Encrypt=true;',
    connectImpl: async (cfg) => {
      assert.equal(cfg.server, 'myserver.database.windows.net');
      assert.equal(cfg.database, 'InstructionsDb');
      assert.equal(cfg.user, 'myuser');
      assert.equal(cfg.password, 'mypassword');
      return createMockPool();
    },
    expectFn: async ({ res }) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.ok, true);
      assert.equal(res.body?.success, true);
      assert.equal(res.body?.dealId, 12345);
    }
  });

  // Case 2: Data Source/Database parsing
  await runCase({
    name: 'parses Data Source + Database',
    connectionString:
      'Data Source=tcp:myserver2.database.windows.net,1433;Database=InstructionsDb2;User ID=myuser2;Password=mypassword2;Encrypt=true;',
    connectImpl: async (cfg) => {
      assert.equal(cfg.server, 'myserver2.database.windows.net');
      assert.equal(cfg.database, 'InstructionsDb2');
      assert.equal(cfg.user, 'myuser2');
      assert.equal(cfg.password, 'mypassword2');
      return createMockPool();
    },
    expectFn: async ({ res }) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.ok, true);
      assert.equal(res.body?.success, true);
      assert.equal(res.body?.dealId, 12345);
    }
  });

  // Case 3: Missing Deals table becomes recoverable
  await runCase({
    name: "maps missing Deals table to recoverable",
    connectionString:
      'Server=tcp:myserver.database.windows.net,1433;Initial Catalog=WrongDb;User ID=myuser;Password=mypassword;Encrypt=true;',
    connectImpl: async (_cfg) => {
      const err = new Error("Invalid object name 'Deals'.");
      throw err;
    },
    expectFn: async ({ res }) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.ok, false);
      assert.equal(res.body?.recoverable, true);
    }
  });

  console.log('All deal capture smoke tests passed.');
})().catch((err) => {
  console.error('❌ Smoke test failed:', err);
  process.exitCode = 1;
});
