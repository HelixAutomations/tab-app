/**
 * Tests for server/utils/hubNotifier.js
 */

jest.mock('../../utils/teamsNotificationClient', () => ({
  sendCardToDM: jest.fn(async () => ({ success: true })),
  CHANNEL_ROUTES: { dev: { teamId: 'test', channelId: 'test' } },
}));

jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
  trackMetric: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const { notify, buildCard, COOLDOWN_MS } = require('../../utils/hubNotifier');
const { sendCardToDM } = require('../../utils/teamsNotificationClient');

beforeEach(() => jest.clearAllMocks());

describe('buildCard', () => {
  test('builds matter.opened card with correct facts', () => {
    const card = buildCard('matter.opened', {
      displayNumber: 'HLX-00001-11111',
      instructionRef: 'HLX-00001-11111',
      practiceArea: 'Commercial',
    });
    expect(card.type).toBe('AdaptiveCard');
    const factSet = card.body.find(b => b.type === 'FactSet');
    expect(factSet.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Matter', value: 'HLX-00001-11111' }),
        expect.objectContaining({ title: 'Practice area', value: 'Commercial' }),
      ])
    );
  });

  test('builds error.critical card', () => {
    const card = buildCard('error.critical', {
      method: 'POST',
      path: '/api/test',
      status: 500,
      message: 'Something failed',
    });
    const factSet = card.body.find(b => b.type === 'FactSet');
    expect(factSet.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Route', value: 'POST /api/test' }),
      ])
    );
  });
});

describe('notify', () => {
  test('calls sendCardToDM on first call', async () => {
    await notify('matter.opened', { instructionRef: 'unique-test-1' });
    expect(sendCardToDM).toHaveBeenCalledTimes(1);
    expect(sendCardToDM).toHaveBeenCalledWith(
      'lz@helix-law.com',
      expect.objectContaining({ type: 'AdaptiveCard' }),
      'Hub: matter.opened'
    );
  });

  test('rate-limits duplicate events within cooldown', async () => {
    await notify('eid.completed', { instructionRef: 'rate-limit-test' });
    await notify('eid.completed', { instructionRef: 'rate-limit-test' });
    // Only the first should actually send
    expect(sendCardToDM).toHaveBeenCalledTimes(1);
  });

  test('allows different keys through', async () => {
    await notify('matter.opened', { instructionRef: 'key-a' });
    await notify('matter.opened', { instructionRef: 'key-b' });
    expect(sendCardToDM).toHaveBeenCalledTimes(2);
  });

  test('never throws even if sendCardToDM fails', async () => {
    sendCardToDM.mockRejectedValueOnce(new Error('network down'));
    await expect(notify('error.critical', { path: '/api/fail' })).resolves.toBeUndefined();
  });
});
