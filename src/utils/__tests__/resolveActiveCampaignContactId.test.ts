import { resolveActiveCampaignContactId } from '../resolveActiveCampaignContactId';

describe('resolveActiveCampaignContactId', () => {
  test('prefers explicit contact fields on root/instruction', () => {
    expect(
      resolveActiveCampaignContactId({
        instruction: { acContactId: '222' },
        deal: { ProspectId: 999 },
      }),
    ).toBe('222');

    expect(
      resolveActiveCampaignContactId({
        AC_ContactId: '333',
        instruction: { acid: '111' },
        deal: { ProspectId: 999 },
      }),
    ).toBe('333');
  });

  test('prefers instruction ACID/acid over deal ProspectId', () => {
    expect(
      resolveActiveCampaignContactId({
        instruction: { acid: 510 },
        deal: { ProspectId: 556 },
      }),
    ).toBe('510');
  });

  test('falls back to ProspectId fields when no better ID exists', () => {
    expect(
      resolveActiveCampaignContactId({
        instruction: { ProspectId: '777' },
        deal: { ProspectId: '888' },
      }),
    ).toBe('777');

    expect(
      resolveActiveCampaignContactId({
        instruction: {},
        deal: { ProspectId: 888 },
      }),
    ).toBe('888');
  });

  test('ignores empty/placeholder values', () => {
    expect(resolveActiveCampaignContactId({ instruction: { acid: '—' } })).toBeNull();
    expect(resolveActiveCampaignContactId({ instruction: { acid: '  ' } })).toBeNull();
    expect(resolveActiveCampaignContactId({ instruction: { acid: 'undefined' } })).toBeNull();
  });
});
