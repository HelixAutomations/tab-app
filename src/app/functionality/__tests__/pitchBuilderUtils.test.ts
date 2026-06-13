import {
  clearPitchBuilderDraft,
  getActivePitchBuilderDraft,
  getPitchBuilderDraftForEnquiry,
  hasActivePitchBuilder,
  isMeaningfulPitchBuilderDraftState,
} from '../pitchBuilderUtils';

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
  };
}

describe('pitchBuilderUtils', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('detects current per-enquiry session drafts', () => {
    sessionStorage.setItem('pitchBuilderState:12345', JSON.stringify({
      enquiryId: 12345,
      subject: 'Synthetic subject',
      savedAt: '2026-06-05T10:00:00.000Z',
    }));

    expect(hasActivePitchBuilder()).toBe(true);
    expect(getActivePitchBuilderDraft()).toMatchObject({
      enquiryId: '12345',
      storage: 'session',
      storageKey: 'pitchBuilderState:12345',
      savedAt: '2026-06-05T10:00:00.000Z',
    });
    expect(getPitchBuilderDraftForEnquiry('12345')?.state.subject).toBe('Synthetic subject');
  });

  it('detects legacy localStorage drafts', () => {
    localStorage.setItem('pitchBuilderState', JSON.stringify({
      enquiryId: '67890',
      body: '<p>Legacy draft body</p>',
      selectedScenarioId: 'after-call-want-instruction',
    }));

    expect(getActivePitchBuilderDraft()).toMatchObject({
      enquiryId: '67890',
      storage: 'local',
      storageKey: 'pitchBuilderState',
    });
  });

  it('ignores empty or default-only stale shells with no draft content', () => {
    localStorage.setItem('pitchBuilderState', JSON.stringify({
      enquiryId: '67890',
      amount: '1500.00',
      initialScopeDescription: 'Debt Recovery',
      subject: 'Your Enquiry',
    }));
    sessionStorage.setItem('pitchBuilderState:12345', JSON.stringify({
      enquiryId: '12345',
      selectedScenarioId: 'after-call-want-instruction',
      amount: '1500.00',
    }));

    expect(hasActivePitchBuilder()).toBe(false);
    expect(getActivePitchBuilderDraft()).toBeNull();
  });

  it('treats bespoke text as meaningful draft content', () => {
    expect(isMeaningfulPitchBuilderDraftState({
      enquiryId: '12345',
      body: '<p>A bespoke pitch paragraph the user typed.</p>',
    })).toBe(true);
  });

  it('returns the newest active draft across storage', () => {
    sessionStorage.setItem('pitchBuilderState:older', JSON.stringify({
      enquiryId: 'older',
      subject: 'Older draft',
      savedAt: '2026-06-05T09:00:00.000Z',
    }));
    sessionStorage.setItem('pitchBuilderState:newer', JSON.stringify({
      enquiryId: 'newer',
      subject: 'Newer draft',
      savedAt: '2026-06-05T11:00:00.000Z',
    }));

    expect(getActivePitchBuilderDraft()?.enquiryId).toBe('newer');
  });

  it('clears all pitch builder draft storage', () => {
    localStorage.setItem('pitchBuilderState', JSON.stringify({ enquiryId: '67890', subject: 'Legacy' }));
    sessionStorage.setItem('pitchBuilderState:12345', JSON.stringify({ enquiryId: '12345', subject: 'Current' }));

    clearPitchBuilderDraft();

    expect(localStorage.getItem('pitchBuilderState')).toBeNull();
    expect(sessionStorage.getItem('pitchBuilderState:12345')).toBeNull();
  });

  it('clears only the targeted session draft while removing legacy state', () => {
    localStorage.setItem('pitchBuilderState', JSON.stringify({ enquiryId: '67890', subject: 'Legacy' }));
    sessionStorage.setItem('pitchBuilderState:12345', JSON.stringify({ enquiryId: '12345', subject: 'Current' }));
    sessionStorage.setItem('pitchBuilderState:99999', JSON.stringify({ enquiryId: '99999', subject: 'Other' }));

    clearPitchBuilderDraft('12345');

    expect(localStorage.getItem('pitchBuilderState')).toBeNull();
    expect(sessionStorage.getItem('pitchBuilderState:12345')).toBeNull();
    expect(sessionStorage.getItem('pitchBuilderState:99999')).not.toBeNull();
  });
});