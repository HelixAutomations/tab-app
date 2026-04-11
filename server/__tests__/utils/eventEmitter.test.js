/**
 * Tests for server/utils/eventEmitter.js — fire-and-forget event INSERT
 */

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

jest.mock('../../utils/db', () => ({
  getPool: jest.fn().mockResolvedValue({ connected: true }),
  sql: {
    Request: jest.fn(() => ({ query: mockQuery, input: mockInput })),
    NVarChar: jest.fn((n) => `NVarChar(${n})`),
    MAX: 'MAX',
  },
}));

const { emitEvent } = require('../../utils/eventEmitter');
const { trackException } = require('../../utils/appInsights');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = 'Server=test;Database=test;';
});

afterEach(() => {
  delete process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
});

describe('eventEmitter', () => {
  test('inserts event with correct parameters', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

    await emitEvent('enquiry.claimed', 'tab-app', '12345', 'enquiry', { claimedBy: 'LZ' });

    expect(mockInput).toHaveBeenCalledWith('eventType', expect.anything(), 'enquiry.claimed');
    expect(mockInput).toHaveBeenCalledWith('source', expect.anything(), 'tab-app');
    expect(mockInput).toHaveBeenCalledWith('entityId', expect.anything(), '12345');
    expect(mockInput).toHaveBeenCalledWith('entityType', expect.anything(), 'enquiry');
    expect(mockInput).toHaveBeenCalledWith('payload', expect.anything(), JSON.stringify({ claimedBy: 'LZ' }));
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO [dbo].[Events]'));
  });

  test('handles null payload', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

    await emitEvent('deal.created', 'tab-app', 'D-100', 'deal');

    expect(mockInput).toHaveBeenCalledWith('payload', expect.anything(), null);
  });

  test('swallows errors by default (fire-and-forget)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      emitEvent('matter.opened', 'tab-app', 'M-1', 'matter', {})
    ).resolves.toBeUndefined();

    expect(trackException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'EventEmitter.emit' })
    );
  });

  test('throws when throwOnError is true', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      emitEvent('matter.opened', 'tab-app', 'M-1', 'matter', {}, { throwOnError: true })
    ).rejects.toThrow('DB down');
  });

  test('warns and returns when connection string missing', async () => {
    delete process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

    await emitEvent('enquiry.created', 'tab-app', '1', 'enquiry');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('converts numeric entityId to string', async () => {
    mockQuery.mockResolvedValueOnce({ rowsAffected: [1] });

    await emitEvent('enquiry.created', 'tab-app', 42, 'enquiry');

    expect(mockInput).toHaveBeenCalledWith('entityId', expect.anything(), '42');
  });
});
