import type { Request, Response } from 'express';

const makeRes = () => {
  const res: Partial<Response> & { _status?: number; _json?: any } = {};
  res.status = jest.fn((code: number) => {
    res._status = code;
    return res as Response;
  }) as any;
  res.json = jest.fn((payload: any) => {
    res._json = payload;
    return res as Response;
  }) as any;
  return res;
};

// Mocks must be declared before importing the router under test.

type QueryRecordset = { recordset: Array<Record<string, any>> };

type Scenario =
  | {
      kind: 'legacyIdWithPairedInstructions';
      inputId: string;
      pairedInstructionsId: string;
    }
  | {
      kind: 'instructionsIdWithPairedLegacy';
      inputId: string;
      pairedLegacyId: string;
    };

const makeDbMock = (scenario: Scenario) => {
  const calls: Array<{ connectionString: string; sqlText: string; inputs: Record<string, any> }> = [];

  const withRequest = jest.fn(async (connectionString: string, fn: any) => {
    const inputs: Record<string, any> = {};

    const request = {
      input: jest.fn((name: string, _type: any, value: any) => {
        inputs[name] = value;
        return request;
      }),
      query: jest.fn(async (sqlText: string): Promise<QueryRecordset> => {
        calls.push({ connectionString, sqlText, inputs: { ...inputs } });

        const normalized = sqlText.replace(/\s+/g, ' ').trim().toLowerCase();

        const isMain = connectionString.includes('main');
        const isInst = connectionString.includes('instructions');

        // COUNT checks (main uses WHERE ID=@id; instructions uses WHERE id=@id; both normalize to the same string)
        if (normalized.includes('select count(*) as count from enquiries where id = @id')) {
          if (scenario.kind === 'legacyIdWithPairedInstructions') {
            if (isMain) return { recordset: [{ count: inputs.id === scenario.inputId ? 1 : 0 }] };
            if (isInst) return { recordset: [{ count: inputs.id === scenario.inputId ? 0 : 0 }] };
          }
          if (scenario.kind === 'instructionsIdWithPairedLegacy') {
            if (isMain) return { recordset: [{ count: inputs.id === scenario.pairedLegacyId ? 1 : 0 }] };
            if (isInst) return { recordset: [{ count: inputs.id === scenario.inputId ? 1 : 0 }] };
          }
        }

        // Pair resolution
        if (normalized.includes('select top 1 id from enquiries where acid = @acid') && isInst) {
          if (scenario.kind === 'legacyIdWithPairedInstructions' && inputs.acid === scenario.inputId) {
            return { recordset: [{ id: scenario.pairedInstructionsId }] };
          }
          return { recordset: [] };
        }

        if (normalized.includes('select top 1 acid from enquiries where id = @id') && isInst) {
          if (scenario.kind === 'instructionsIdWithPairedLegacy' && inputs.id === scenario.inputId) {
            return { recordset: [{ acid: scenario.pairedLegacyId }] };
          }
          return { recordset: [] };
        }

        // UPDATE queries: just acknowledge success
        if (normalized.startsWith('update enquiries set') || normalized.includes('update enquiries set')) {
          return { recordset: [] };
        }

        // Default fall-through
        return { recordset: [] };
      }),
    };

    return await fn(request);
  });

  return { withRequest, calls };
};

jest.mock('../../utils/redisClient', () => {
  return {
    CACHE_CONFIG: { PREFIXES: { UNIFIED: 'unified' } },
    deleteCachePattern: jest.fn(async () => 0),
    cacheUnified: jest.fn(async (_params: any, fn: any) => fn()),
    generateCacheKey: jest.fn(() => 'unified:data:test'),
  };
});

jest.mock('../../utils/logger', () => {
  const noop = () => undefined;
  return {
    loggers: {
      enquiries: {
        debug: jest.fn(noop),
        info: jest.fn(noop),
        warn: jest.fn(noop),
        error: jest.fn(noop),
      },
    },
  };
});

describe('POST /api/enquiries-unified/update (cross-db id resolution)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SQL_CONNECTION_STRING = 'main';
    process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = 'instructions';
  });

  test('legacy ID updates both legacy row and paired instructions row via acid', async () => {
    const scenario: Scenario = {
      kind: 'legacyIdWithPairedInstructions',
      inputId: '123',
      pairedInstructionsId: 'inst-999',
    };

    const db = makeDbMock(scenario);

    jest.doMock('../../utils/db', () => {
      return {
        withRequest: db.withRequest,
        sql: {
          VarChar: (len: number) => ({ type: 'VarChar', len }),
          Text: () => ({ type: 'Text' }),
        },
      };
    });

    const router = require('../enquiries-unified');
    const layer = router.stack.find((l: any) => l.route?.path === '/update');
    expect(layer).toBeTruthy();

    const handler = layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;

    const req = {
      body: { ID: scenario.inputId, Point_of_Contact: 'lz@helix-law.com' },
    } as Partial<Request> as Request;

    const res = makeRes();

    await handler(req, res as unknown as Response);

    expect((res as any)._status).toBe(200);
    expect((res as any)._json?.success).toBe(true);
    expect((res as any)._json?.updatedIds).toEqual({
      legacyId: scenario.inputId,
      instructionsId: scenario.pairedInstructionsId,
    });

    const updateCalls = db.calls.filter((c) => c.sqlText.toLowerCase().includes('update enquiries set'));
    expect(updateCalls.length).toBe(2);

    const mainUpdate = updateCalls.find((c) => c.connectionString === 'main');
    const instUpdate = updateCalls.find((c) => c.connectionString === 'instructions');
    expect(mainUpdate?.inputs.id).toBe(scenario.inputId);
    expect(instUpdate?.inputs.id).toBe(scenario.pairedInstructionsId);
  });

  test('instructions ID updates both instructions row and paired legacy row via acid', async () => {
    const scenario: Scenario = {
      kind: 'instructionsIdWithPairedLegacy',
      inputId: 'inst-321',
      pairedLegacyId: '555',
    };

    const db = makeDbMock(scenario);

    jest.doMock('../../utils/db', () => {
      return {
        withRequest: db.withRequest,
        sql: {
          VarChar: (len: number) => ({ type: 'VarChar', len }),
          Text: () => ({ type: 'Text' }),
        },
      };
    });

    const router = require('../enquiries-unified');
    const layer = router.stack.find((l: any) => l.route?.path === '/update');
    expect(layer).toBeTruthy();

    const handler = layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;

    const req = {
      body: { ID: scenario.inputId, Point_of_Contact: 'team@helix-law.com' },
    } as Partial<Request> as Request;

    const res = makeRes();

    await handler(req, res as unknown as Response);

    expect((res as any)._status).toBe(200);
    expect((res as any)._json?.success).toBe(true);
    expect((res as any)._json?.updatedIds).toEqual({
      legacyId: scenario.pairedLegacyId,
      instructionsId: scenario.inputId,
    });

    const updateCalls = db.calls.filter((c) => c.sqlText.toLowerCase().includes('update enquiries set'));
    expect(updateCalls.length).toBe(2);

    const mainUpdate = updateCalls.find((c) => c.connectionString === 'main');
    const instUpdate = updateCalls.find((c) => c.connectionString === 'instructions');
    expect(mainUpdate?.inputs.id).toBe(scenario.pairedLegacyId);
    expect(instUpdate?.inputs.id).toBe(scenario.inputId);
  });
});
