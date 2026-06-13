export const LEGACY_PITCH_BUILDER_STATE_KEY = 'pitchBuilderState';
export const PITCH_BUILDER_SESSION_DRAFT_PREFIX = 'pitchBuilderState:';

const DEFAULT_SUBJECTS = new Set(['your enquiry', 'your enquiry - helix law']);
const GENERIC_SCOPE_VALUES = new Set(['payment on account of costs']);

export interface PitchBuilderDraftSummary {
    hasBody: boolean;
    hasSubject: boolean;
    hasScope: boolean;
    hasFee: boolean;
    hasScenario: boolean;
    hasTemplateSelections: boolean;
    hasAttachments: boolean;
}

export interface ActivePitchBuilderDraft {
    enquiryId: string;
    storageKey: string;
    storage: 'local' | 'session';
    savedAt?: string;
    summary: PitchBuilderDraftSummary;
}

export interface StoredPitchBuilderDraft extends ActivePitchBuilderDraft {
    state: Record<string, unknown>;
}

export function getPitchBuilderDraftKey(enquiryId: string | number | null | undefined): string | null {
    if (enquiryId == null) return null;
    const value = String(enquiryId).trim();
    return value ? `${PITCH_BUILDER_SESSION_DRAFT_PREFIX}${value}` : null;
}

export function isPitchBuilderDraftStorageKey(key: string | null | undefined): boolean {
    return Boolean(key && (key === LEGACY_PITCH_BUILDER_STATE_KEY || key.startsWith(PITCH_BUILDER_SESSION_DRAFT_PREFIX)));
}

function getStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
    try {
        const storage = (globalThis as typeof globalThis & { localStorage?: Storage; sessionStorage?: Storage })[kind];
        return storage || null;
    } catch {
        return null;
    }
}

function normaliseDraftText(value: unknown): string {
    return String(value || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasEnabledSelection(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>).some((entry) => {
        if (Array.isArray(entry)) return entry.length > 0;
        if (typeof entry === 'boolean') return entry;
        return String(entry || '').trim().length > 0;
    });
}

export function getPitchBuilderDraftSummary(state: Record<string, unknown>): PitchBuilderDraftSummary {
    const subject = normaliseDraftText(state.subject).toLowerCase();
    const scope = normaliseDraftText(state.initialScopeDescription || state.serviceDescription).toLowerCase();
    const amount = normaliseDraftText(state.amount);
    return {
        hasBody: normaliseDraftText(state.body).length > 0,
        hasSubject: subject.length > 0 && !DEFAULT_SUBJECTS.has(subject),
        hasScope: scope.length > 20 && !GENERIC_SCOPE_VALUES.has(scope),
        hasFee: amount.length > 0,
        hasScenario: normaliseDraftText(state.selectedScenarioId).length > 0,
        hasTemplateSelections: hasEnabledSelection(state.selectedTemplateOptions) || hasEnabledSelection(state.insertedBlocks),
        hasAttachments: Array.isArray(state.attachments) && state.attachments.length > 0,
    };
}

export function isMeaningfulPitchBuilderDraftState(state: Record<string, unknown>): boolean {
    const summary = getPitchBuilderDraftSummary(state);
    return summary.hasBody
        || summary.hasSubject
        || summary.hasScope
        || summary.hasTemplateSelections
        || summary.hasAttachments;
}

function parsePitchBuilderDraft(raw: string | null, storageKey: string, storage: 'local' | 'session'): StoredPitchBuilderDraft | null {
    if (!raw) return null;
    try {
        const state = JSON.parse(raw) as Record<string, unknown>;
        const enquiryId = state?.enquiryId == null ? '' : String(state.enquiryId).trim();
        if (!enquiryId) return null;
        const summary = getPitchBuilderDraftSummary(state);
        if (!isMeaningfulPitchBuilderDraftState(state)) return null;
        return {
            enquiryId,
            storageKey,
            storage,
            savedAt: typeof state.savedAt === 'string' ? state.savedAt : undefined,
            summary,
            state,
        };
    } catch {
        return null;
    }
}

function toActiveDraft(record: StoredPitchBuilderDraft): ActivePitchBuilderDraft {
    const { state: _state, ...active } = record;
    return active;
}

function compareDraftsNewestFirst(a: StoredPitchBuilderDraft, b: StoredPitchBuilderDraft): number {
    const aTime = a.savedAt ? Date.parse(a.savedAt) : 0;
    const bTime = b.savedAt ? Date.parse(b.savedAt) : 0;
    return bTime - aTime;
}

export const getActivePitchBuilderDraft = (): ActivePitchBuilderDraft | null => {
    const local = getStorage('localStorage');
    const session = getStorage('sessionStorage');
    const candidates: StoredPitchBuilderDraft[] = [];

    const legacy = parsePitchBuilderDraft(
        local?.getItem(LEGACY_PITCH_BUILDER_STATE_KEY) || null,
        LEGACY_PITCH_BUILDER_STATE_KEY,
        'local',
    );
    if (legacy) candidates.push(legacy);

    if (!session) return candidates.length ? toActiveDraft(candidates.sort(compareDraftsNewestFirst)[0]) : null;

    for (let index = 0; index < session.length; index += 1) {
        const key = session.key(index);
        if (!key || !key.startsWith(PITCH_BUILDER_SESSION_DRAFT_PREFIX)) continue;
        const draft = parsePitchBuilderDraft(session.getItem(key), key, 'session');
        if (draft) candidates.push(draft);
    }

    return candidates.length ? toActiveDraft(candidates.sort(compareDraftsNewestFirst)[0]) : null;
};

export const getPitchBuilderDraftForEnquiry = (enquiryId: string | number | null | undefined): StoredPitchBuilderDraft | null => {
    const value = enquiryId == null ? '' : String(enquiryId).trim();
    if (!value) return null;

    const session = getStorage('sessionStorage');
    const key = getPitchBuilderDraftKey(value);
    if (session && key) {
        const sessionDraft = parsePitchBuilderDraft(session.getItem(key), key, 'session');
        if (sessionDraft && sessionDraft.enquiryId === value) return sessionDraft;
    }

    const local = getStorage('localStorage');
    const legacyDraft = parsePitchBuilderDraft(
        local?.getItem(LEGACY_PITCH_BUILDER_STATE_KEY) || null,
        LEGACY_PITCH_BUILDER_STATE_KEY,
        'local',
    );
    return legacyDraft?.enquiryId === value ? legacyDraft : null;
};

export const hasActivePitchBuilder = (): boolean => Boolean(getActivePitchBuilderDraft());

export const clearPitchBuilderDraft = (enquiryId?: string | number): void => {
    const local = getStorage('localStorage');
    const session = getStorage('sessionStorage');
    local?.removeItem(LEGACY_PITCH_BUILDER_STATE_KEY);
    const targetKey = enquiryId == null ? null : `${PITCH_BUILDER_SESSION_DRAFT_PREFIX}${String(enquiryId)}`;

    if (targetKey) {
        session?.removeItem(targetKey);
        return;
    }

    const keysToRemove: string[] = [];
    if (!session) return;
    for (let index = 0; index < session.length; index += 1) {
        const key = session.key(index);
        if (key?.startsWith(PITCH_BUILDER_SESSION_DRAFT_PREFIX)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => session.removeItem(key));
};