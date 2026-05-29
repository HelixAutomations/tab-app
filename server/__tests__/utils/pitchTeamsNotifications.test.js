jest.mock('../../utils/teamsNotificationClient', () => ({
  sendCardToDM: jest.fn(async () => ({ success: true, activityId: 'activity-1' })),
}));

jest.mock('../../utils/teamLookup', () => ({
  getTeamEmail: jest.fn(async (initials) => initials === 'AC' ? 'ac@helix-law.com' : null),
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

const { sendCardToDM } = require('../../utils/teamsNotificationClient');
const { getTeamEmail } = require('../../utils/teamLookup');
const {
  buildPitchNotificationCard,
  notifyPitchLinkReady,
  resolvePitchDmRecipient,
} = require('../../utils/pitchTeamsNotifications');

beforeEach(() => jest.clearAllMocks());

describe('pitchTeamsNotifications', () => {
  test('builds a card with client, link and copy-ready text', () => {
    const card = buildPitchNotificationCard({
      firstName: 'Test',
      lastName: 'Client',
      instructionsUrl: 'https://example.test/pitch/12345',
      passcode: '12345',
      amount: 1500,
      areaOfWork: 'Commercial',
      serviceDescription: 'Shareholder dispute advice',
      instructionRef: 'HLX-12345-12345',
      requestedBy: 'LZ',
      linkOnly: true,
      createdAt: '2026-05-28T10:00:00.000Z',
    });

    expect(card.type).toBe('AdaptiveCard');
    expect(card.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'Action.OpenUrl', url: 'https://example.test/pitch/12345' }),
    ]));

    const factSet = card.body.find((item) => item.type === 'FactSet');
    expect(factSet.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Client', value: 'Test Client' }),
      expect.objectContaining({ title: 'Passcode', value: '12345' }),
    ]));

    const copyInput = card.body.find((item) => item.type === 'Input.Text' && item.id === 'pitchCopyText');
    expect(copyInput.value).toContain('Pitch link: https://example.test/pitch/12345');
    expect(copyInput.value).toContain('Passcode: 12345');
  });

  test('resolves recipient from authenticated request before pitchedBy', async () => {
    const recipient = await resolvePitchDmRecipient({
      req: {
        user: { email: 'lz@helix-law.com', initials: 'LZ' },
        headers: { 'x-user-email': 'ac@helix-law.com' },
      },
      pitchedBy: 'AC',
    });

    expect(recipient).toBe('lz@helix-law.com');
    expect(getTeamEmail).not.toHaveBeenCalled();
  });

  test('falls back from initials to team email', async () => {
    const recipient = await resolvePitchDmRecipient({ pitchedBy: 'AC' });

    expect(recipient).toBe('ac@helix-law.com');
    expect(getTeamEmail).toHaveBeenCalledWith('AC');
  });

  test('sends the pitch card to the resolved DM recipient', async () => {
    const result = await notifyPitchLinkReady({
      recipientEmail: 'lz@helix-law.com',
      firstName: 'Test',
      lastName: 'Client',
      instructionsUrl: 'https://example.test/pitch/12345',
      passcode: '12345',
      amount: 1500,
      serviceDescription: 'Advice',
    });

    expect(result.success).toBe(true);
    expect(sendCardToDM).toHaveBeenCalledWith(
      'lz@helix-law.com',
      expect.objectContaining({ type: 'AdaptiveCard' }),
      'Pitch link ready · Test Client',
    );
  });
});