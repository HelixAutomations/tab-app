import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import { getApiUrl } from '../../../utils/getApiUrl';
import './DataHubAttributionWorkbench.css';

type SpineStageKey = 'source' | 'intake' | 'enquiry' | 'pitch' | 'instruction' | 'identity' | 'payment' | 'risk' | 'matter' | 'collected';

type AttributionChain = {
  id?: number | null;
  source_channel?: string | null;
  source_value?: string | null;
  source_detail?: string | null;
  intake_type?: string | null;
  call_id?: string | null;
  form_submission_id?: string | null;
  email_thread_id?: string | null;
  intake_at?: string | null;
  enquiry_id?: string | null;
  enquiry_at?: string | null;
  enquiry_owner?: string | null;
  pitch_id?: string | null;
  pitch_at?: string | null;
  pitch_status?: string | null;
  pitched_by?: string | null;
  deal_amount?: number | string | null;
  instruction_ref?: string | null;
  instruction_at?: string | null;
  instruction_stage?: string | null;
  instruction_owner?: string | null;
  client_id?: string | null;
  client_type?: string | null;
  identity_check_id?: string | null;
  identity_check_result?: string | null;
  identity_check_status?: string | null;
  identity_check_at?: string | null;
  risk_assessment_id?: string | null;
  risk_assessment_result?: string | null;
  risk_assessment_status?: string | null;
  risk_assessment_at?: string | null;
  payment_id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  payment_at?: string | null;
  matter_id?: string | null;
  matter_work_type?: string | null;
  matter_at?: string | null;
  responsible_solicitor?: string | null;
  originating_solicitor?: string | null;
  collected_value?: number | string | null;
  collected_value_as_at?: string | null;
  recent_sync_at?: string | null;
  attribution_note?: string | null;
  attribution_locked_at?: string | null;
  attribution_locked_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecordPreviewItem = {
  label: string;
  value: string;
};

type LookupCandidate = {
  type: SpineStageKey;
  id: string;
  title: string;
  subtitle?: string;
  patch: Partial<AttributionChain>;
  preview?: RecordPreviewItem[];
};

type SourceEvidence = {
  id?: string | null;
  startTime?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  keywords?: string | null;
  sourceName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  direction?: string | null;
  landingHost?: string | null;
  landingPageUrl?: string | null;
  referringUrl?: string | null;
  lastRequestedUrl?: string | null;
  timelineUrl?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  hasPaidClickId?: boolean;
  channel?: string | null;
  answered?: boolean;
  duration?: number | null;
};

type SourceCheckResult = {
  checked?: boolean;
  reason?: string;
  count?: number;
  recommendedPatch?: Partial<AttributionChain> | null;
  decision?: {
    recommendation?: string;
    suggestedSource?: string | null;
    suggestionReason?: string;
    paidSignals?: number;
    organicSignals?: number;
    unknownSignals?: number;
    total?: number;
  };
  evidence?: SourceEvidence[];
};

type PitchCheckResult = {
  checked?: boolean;
  count?: number;
  autoPatch?: Partial<AttributionChain> | null;
  autoCandidate?: LookupCandidate | null;
  candidates?: LookupCandidate[];
};

type DataHubAttributionWorkbenchProps = {
  isDarkMode: boolean;
  userInitials?: string;
};

type PreviewMode = 'json' | 'checklist';

type StageDef = {
  key: SpineStageKey;
  label: string;
  anchorField: keyof AttributionChain;
  detailFields: Array<keyof AttributionChain>;
  requiredFields: Array<keyof AttributionChain>;
  searchHint: string;
};

const STAGES: StageDef[] = [
  { key: 'source', label: 'Source', anchorField: 'source_channel', detailFields: ['source_value', 'source_detail'], requiredFields: ['source_channel', 'source_value'], searchHint: 'Confirm channel and source evidence' },
  { key: 'intake', label: 'Intake', anchorField: 'intake_type', detailFields: ['call_id', 'form_submission_id', 'email_thread_id', 'intake_at'], requiredFields: ['intake_type'], searchHint: 'Call, form, email, or manual intake' },
  { key: 'enquiry', label: 'Enquiry', anchorField: 'enquiry_id', detailFields: ['enquiry_at', 'enquiry_owner'], requiredFields: ['enquiry_id'], searchHint: 'Recent enquiries are the starting point' },
  { key: 'pitch', label: 'Pitch', anchorField: 'pitch_id', detailFields: ['pitch_status', 'pitched_by', 'deal_amount', 'pitch_at'], requiredFields: ['pitch_id'], searchHint: 'Deal id, prospect id, passcode, or instruction ref' },
  { key: 'instruction', label: 'Instruction', anchorField: 'instruction_ref', detailFields: ['instruction_stage', 'instruction_owner', 'client_id', 'client_type', 'instruction_at'], requiredFields: ['instruction_ref'], searchHint: 'Instruction ref, client id, or matter id' },
  { key: 'identity', label: 'Identity', anchorField: 'identity_check_id', detailFields: ['identity_check_result', 'identity_check_status', 'identity_check_at'], requiredFields: ['identity_check_id', 'identity_check_result'], searchHint: 'Usually found from the instruction ref' },
  { key: 'payment', label: 'Payment', anchorField: 'payment_id', detailFields: ['payment_method', 'payment_status', 'payment_amount', 'payment_at'], requiredFields: ['payment_id', 'payment_amount'], searchHint: 'Payment id or instruction ref' },
  { key: 'risk', label: 'Risk', anchorField: 'risk_assessment_id', detailFields: ['risk_assessment_result', 'risk_assessment_status', 'risk_assessment_at'], requiredFields: ['risk_assessment_id', 'risk_assessment_result'], searchHint: 'Usually found from the instruction ref' },
  { key: 'matter', label: 'Matter', anchorField: 'matter_id', detailFields: ['matter_work_type', 'matter_at', 'responsible_solicitor', 'originating_solicitor'], requiredFields: ['matter_id', 'matter_work_type'], searchHint: 'Matter id or instruction ref' },
  { key: 'collected', label: 'Collected', anchorField: 'collected_value', detailFields: ['collected_value_as_at', 'recent_sync_at'], requiredFields: ['collected_value'], searchHint: 'Value updates from reporting sync, manual prototype entry allowed' },
];

const SOURCE_CHANNELS = ['SEO', 'PPC', 'Email', 'Referral', 'Direct', 'Unknown'];
const INTAKE_TYPES = ['call', 'form', 'email', 'manual', 'unknown'];
const CLIENT_TYPES = ['individual', 'company', 'multiple_individuals', 'existing_client', 'unknown'];
const WORKBENCH_STATUSES = ['pending', 'processing', 'review', 'complete'];
const RISK_STATUSES = ['pending', 'warning', 'review', 'complete'];
const PAYMENT_METHODS = ['card', 'bank_transfer', 'mixed', 'unknown'];
const PAYMENT_STATUSES = ['pending', 'processing', 'succeeded', 'confirmed', 'failed', 'paid'];

const isPresent = (value: unknown): boolean => String(value ?? '').trim().length > 0;
const comparableValue = (value: unknown): string => String(value ?? '').trim();

const formatDate = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const inferSourceChannel = (sourceValue?: string | null): string | null => {
  const value = String(sourceValue ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'organic search' || value.includes('seo') || value.includes('organic')) return 'SEO';
  if (value === 'paid search' || value.includes('ppc') || value.includes('google ads') || value.includes('paid')) return 'PPC';
  if (value.includes('email')) return 'Email';
  if (value.includes('referral') || value.includes('refer')) return 'Referral';
  if (value.includes('direct')) return 'Direct';
  return 'Unknown';
};

const fieldLabel = (field: keyof AttributionChain): string => field
  .replace(/_/g, ' ')
  .replace(/^./, (char) => char.toUpperCase());

const serialisePatch = (patch: Partial<AttributionChain>): Partial<AttributionChain> => {
  const next: Partial<AttributionChain> = { ...patch };
  if (next.source_value && !next.source_channel) next.source_channel = inferSourceChannel(next.source_value);
  return next;
};

const EDITABLE_FIELDS = STAGES.flatMap((stage) => [stage.anchorField, ...stage.detailFields]).concat(['attribution_note'] as Array<keyof AttributionChain>);
const SPINE_FIELDS = STAGES.flatMap((stage) => [stage.anchorField, ...stage.detailFields]);
const DATE_TIME_FIELDS = new Set<keyof AttributionChain>([
  'intake_at',
  'enquiry_at',
  'pitch_at',
  'instruction_at',
  'identity_check_at',
  'risk_assessment_at',
  'payment_at',
  'matter_at',
  'collected_value_as_at',
  'recent_sync_at',
]);

const buildDraftPatch = (chain: AttributionChain): Partial<AttributionChain> => {
  const patch: Partial<AttributionChain> = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (isPresent(chain[field])) patch[field] = chain[field] as never;
  });
  return serialisePatch(patch);
};

const buildPreview = (chain: AttributionChain, status: string, readyStages: number) => ({
  meta: {
    id: chain.id ?? null,
    status,
    readyStages,
    totalStages: STAGES.length,
    lockedAt: chain.attribution_locked_at || null,
  },
  source: {
    channel: chain.source_channel || null,
    value: chain.source_value || null,
    detail: chain.source_detail || null,
  },
  intake: {
    type: chain.intake_type || null,
    call_id: chain.call_id || null,
    form_submission_id: chain.form_submission_id || null,
    email_thread_id: chain.email_thread_id || null,
    at: chain.intake_at || null,
  },
  enquiry: {
    id: chain.enquiry_id || null,
    at: chain.enquiry_at || null,
    owner: chain.enquiry_owner || null,
  },
  pitch: {
    id: chain.pitch_id || null,
    status: chain.pitch_status || null,
    pitched_by: chain.pitched_by || null,
    amount: chain.deal_amount || null,
    at: chain.pitch_at || null,
  },
  instruction: {
    ref: chain.instruction_ref || null,
    stage: chain.instruction_stage || null,
    owner: chain.instruction_owner || null,
    client_id: chain.client_id || null,
    client_type: chain.client_type || null,
    at: chain.instruction_at || null,
  },
  identity: {
    id: chain.identity_check_id || null,
    result: chain.identity_check_result || null,
    status: chain.identity_check_status || null,
    at: chain.identity_check_at || null,
  },
  risk: {
    id: chain.risk_assessment_id || null,
    result: chain.risk_assessment_result || null,
    status: chain.risk_assessment_status || null,
    at: chain.risk_assessment_at || null,
  },
  payment: {
    id: chain.payment_id || null,
    method: chain.payment_method || null,
    status: chain.payment_status || null,
    amount: chain.payment_amount || null,
    at: chain.payment_at || null,
  },
  matter: {
    id: chain.matter_id || null,
    work_type: chain.matter_work_type || null,
    at: chain.matter_at || null,
    responsible_solicitor: chain.responsible_solicitor || null,
    originating_solicitor: chain.originating_solicitor || null,
  },
  collected: {
    value: chain.collected_value || null,
    as_at: chain.collected_value_as_at || null,
    recent_sync_at: chain.recent_sync_at || null,
  },
  attribution: {
    note: chain.attribution_note || null,
    locked_by: chain.attribution_locked_by || null,
  },
});

const formatDateTimeInputValue = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (segment: number) => String(segment).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseDateTimeInputValue = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const DataHubAttributionWorkbench: React.FC<DataHubAttributionWorkbenchProps> = ({ isDarkMode, userInitials }) => {
  const [query, setQuery] = React.useState('');
  const [chain, setChain] = React.useState<AttributionChain>({});
  const [persistedChain, setPersistedChain] = React.useState<AttributionChain>({});
  const [recentEnquiries, setRecentEnquiries] = React.useState<LookupCandidate[]>([]);
  const [recentChains, setRecentChains] = React.useState<AttributionChain[]>([]);
  const [recentPitches, setRecentPitches] = React.useState<LookupCandidate[]>([]);
  const [candidates, setCandidates] = React.useState<LookupCandidate[]>([]);
  const [pitchQuery, setPitchQuery] = React.useState('');
  const [pitchChooserOpen, setPitchChooserOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pitchLoading, setPitchLoading] = React.useState(false);
  const [tableReady, setTableReady] = React.useState<boolean | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lookupWarnings, setLookupWarnings] = React.useState<string[]>([]);
  const [sourceCheck, setSourceCheck] = React.useState<SourceCheckResult | null>(null);
  const [checkingSource, setCheckingSource] = React.useState(false);
  const [pitchCheck, setPitchCheck] = React.useState<PitchCheckResult | null>(null);
  const [activeCandidatesByStage, setActiveCandidatesByStage] = React.useState<Partial<Record<SpineStageKey, LookupCandidate>>>({});
  const [checkingPitch, setCheckingPitch] = React.useState(false);
  const [lastLinkedLookupRef, setLastLinkedLookupRef] = React.useState('');
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>('json');
  const [expandedStages, setExpandedStages] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});

  const text = isDarkMode ? '#d1d5db' : '#374151';
  const subtle = isDarkMode ? colours.greyText : colours.subtleGrey;
  const border = isDarkMode ? withAlpha(colours.dark.borderColor, 0.62) : withAlpha(colours.helixBlue, 0.16);
  const panel = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.96);
  const fill = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.92) : '#ffffff';
  const accent = isDarkMode ? colours.accent : colours.helixBlue;
  const locked = isPresent(chain.attribution_locked_at);

  const requestHeaders = React.useMemo(() => ({
    'Content-Type': 'application/json',
    ...(userInitials ? { 'x-helix-initials': userInitials } : {}),
  }), [userInitials]);

  const loadInitial = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recentResponse, enquiryResponse, pitchResponse] = await Promise.all([
        fetch(getApiUrl('/api/marketing-attribution-chain/recent'), {
          credentials: 'include',
          headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
        }),
        fetch(getApiUrl('/api/marketing-attribution-chain/recent-enquiries'), {
          credentials: 'include',
          headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
        }),
        fetch(getApiUrl('/api/marketing-attribution-chain/recent-pitches'), {
          credentials: 'include',
          headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
        }),
      ]);
      const recentPayload = await recentResponse.json().catch(() => ({}));
      const enquiryPayload = await enquiryResponse.json().catch(() => ({}));
      const pitchPayload = await pitchResponse.json().catch(() => ({}));
      if (!recentResponse.ok) throw new Error(recentPayload?.details || recentPayload?.error || `HTTP ${recentResponse.status}`);
      if (!enquiryResponse.ok) throw new Error(enquiryPayload?.details || enquiryPayload?.error || `HTTP ${enquiryResponse.status}`);
      if (!pitchResponse.ok) throw new Error(pitchPayload?.details || pitchPayload?.error || `HTTP ${pitchResponse.status}`);
      setTableReady(recentPayload.tableReady !== false);
      setRecentChains(Array.isArray(recentPayload.rows) ? recentPayload.rows : []);
      setRecentEnquiries(Array.isArray(enquiryPayload.candidates) ? enquiryPayload.candidates : []);
      setRecentPitches(Array.isArray(pitchPayload.candidates) ? pitchPayload.candidates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attribution workbench');
    } finally {
      setLoading(false);
    }
  }, [userInitials]);

  React.useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const stageProgress = React.useCallback((stage: StageDef) => {
    const fields = [stage.anchorField, ...stage.detailFields];
    const filled = fields.filter((field) => isPresent(chain[field])).length;
    if (filled === 0) return { state: 'open' as const, filled, total: fields.length };
    if (filled < fields.length) return { state: 'partial' as const, filled, total: fields.length };
    return { state: 'ready' as const, filled, total: fields.length };
  }, [chain]);

  const completeCount = STAGES.filter((stage) => stageProgress(stage).state === 'ready').length;
  const draftPatch = React.useMemo(() => buildDraftPatch(chain), [chain]);
  const hasDraftValues = Object.keys(draftPatch).length > 0;
  const dirty = React.useMemo(() => EDITABLE_FIELDS.some((field) => comparableValue(chain[field]) !== comparableValue(persistedChain[field])), [chain, persistedChain]);
  const previewStatus = locked ? 'locked' : dirty ? 'draft' : 'unchanged';
  const previewObject = React.useMemo(() => buildPreview(chain, previewStatus, completeCount), [chain, completeCount, previewStatus]);

  const candidatesByStage = React.useMemo(() => STAGES.reduce((acc, stage) => {
    acc[stage.key] = candidates.filter((candidate) => candidate.type === stage.key);
    return acc;
  }, {} as Record<SpineStageKey, LookupCandidate[]>), [candidates]);

  const chainsByEnquiryId = React.useMemo(() => recentChains.reduce((acc, row) => {
    const key = String(row.enquiry_id ?? '').trim();
    if (key && !acc[key]) acc[key] = row;
    return acc;
  }, {} as Record<string, AttributionChain>), [recentChains]);

  const getSpineStatus = React.useCallback((candidate: LookupCandidate) => {
    const enquiryId = String(candidate.patch.enquiry_id || candidate.id || '').trim();
    const row = chainsByEnquiryId[enquiryId];
    if (!row) return { state: 'missing' as const, label: 'Not in spine', filledFields: 0, totalFields: SPINE_FIELDS.length, readyStages: 0 };
    const filledFields = SPINE_FIELDS.filter((field) => isPresent(row[field])).length;
    const readyStages = STAGES.filter((stage) => [stage.anchorField, ...stage.detailFields].every((field) => isPresent(row[field]))).length;
    const complete = filledFields === SPINE_FIELDS.length;
    if (complete) return { state: 'complete' as const, label: 'Complete', filledFields, totalFields: SPINE_FIELDS.length, readyStages };
    return { state: 'partial' as const, label: 'Partial', filledFields, totalFields: SPINE_FIELDS.length, readyStages };
  }, [chainsByEnquiryId]);

  const updateManualField = React.useCallback((field: keyof AttributionChain, value: string) => {
    setChain((prev) => ({ ...prev, [field]: value }));
  }, []);

  const runLinkedRecordCheck = React.useCallback(async (seed: Partial<AttributionChain>) => {
    const lookupValue = String(seed.instruction_ref || '').trim();
    if (!lookupValue) return;
    if (lookupValue === lastLinkedLookupRef) return;
    setLastLinkedLookupRef(lookupValue);
    try {
      const response = await fetch(getApiUrl(`/api/marketing-attribution-chain/lookup?q=${encodeURIComponent(lookupValue)}`), {
        credentials: 'include',
        headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      const liveCandidates = Array.isArray(payload.candidates) ? payload.candidates as LookupCandidate[] : [];
      const autoTypes: SpineStageKey[] = ['instruction', 'identity', 'payment', 'risk', 'matter'];
      const autoPatch = autoTypes.reduce<Partial<AttributionChain>>((patch, type) => {
        const stage = STAGES.find((item) => item.key === type);
        const stageFields = stage ? [stage.anchorField, ...stage.detailFields] : [];
        if (!stage || stageFields.every((field) => isPresent(chain[field]))) return patch;
        const matches = liveCandidates.filter((candidate) => candidate.type === type);
        if (matches.length === 1) return { ...patch, ...matches[0].patch };
        return patch;
      }, {});
      if (Object.keys(autoPatch).length > 0) {
        setChain((prev) => ({ ...prev, ...serialisePatch(autoPatch) }));
        setActiveCandidatesByStage((prev) => {
          const next = { ...prev };
          autoTypes.forEach((type) => {
            const matches = liveCandidates.filter((candidate) => candidate.type === type);
            if (matches.length === 1) next[type] = matches[0];
          });
          return next;
        });
        setMessage('Linked records found from the instruction ref and added to draft. Lock to save.');
      }
      const downstreamCandidates = liveCandidates.filter((candidate) => autoTypes.includes(candidate.type));
      if (downstreamCandidates.length > 0) {
        setCandidates((prev) => {
          const seen = new Set(prev.map((candidate) => `${candidate.type}:${candidate.id}`));
          const merged = [...prev];
          downstreamCandidates.forEach((candidate) => {
            const key = `${candidate.type}:${candidate.id}`;
            if (!seen.has(key)) merged.push(candidate);
          });
          return merged;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linked record check failed');
    }
  }, [chain, lastLinkedLookupRef, userInitials]);

  React.useEffect(() => {
    if (!locked && chain.instruction_ref) {
      void runLinkedRecordCheck({ instruction_ref: chain.instruction_ref });
    }
  }, [chain.instruction_ref, locked, runLinkedRecordCheck]);

  const runPitchCheck = React.useCallback(async (seed?: Partial<AttributionChain>) => {
    const enquiryId = seed?.enquiry_id ?? chain.enquiry_id;
    const instructionRef = seed?.instruction_ref ?? chain.instruction_ref;
    if (!enquiryId && !instructionRef) return;
    setCheckingPitch(true);
    setPitchCheck(null);
    try {
      const response = await fetch(getApiUrl('/api/marketing-attribution-chain/pitch-check'), {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({ enquiry_id: enquiryId, instruction_ref: instructionRef }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      setPitchCheck(payload);
      if (payload.autoPatch) {
        const patch = serialisePatch(payload.autoPatch);
        setChain((prev) => ({ ...prev, ...patch }));
        setActiveCandidatesByStage((prev) => ({ ...prev, pitch: payload.autoCandidate || undefined }));
        setPitchChooserOpen(false);
        setMessage('Pitch auto-check found one deal and added it to draft. Lock to save.');
        void runLinkedRecordCheck(patch);
      } else if (Array.isArray(payload.candidates) && payload.candidates.length > 0) {
        setRecentPitches(payload.candidates);
        setPitchChooserOpen(true);
        setMessage(`${payload.candidates.length} possible pitch matches found. Pick the right one from Pitch.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pitch auto-check failed');
    } finally {
      setCheckingPitch(false);
    }
  }, [chain.enquiry_id, chain.instruction_ref, requestHeaders, runLinkedRecordCheck]);

  const searchPitches = React.useCallback(async () => {
    setPitchLoading(true);
    setError(null);
    try {
      const suffix = pitchQuery.trim() ? `?q=${encodeURIComponent(pitchQuery.trim())}` : '';
      const response = await fetch(getApiUrl(`/api/marketing-attribution-chain/recent-pitches${suffix}`), {
        credentials: 'include',
        headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      setRecentPitches(Array.isArray(payload.candidates) ? payload.candidates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pitch search failed');
    } finally {
      setPitchLoading(false);
    }
  }, [pitchQuery, userInitials]);

  const applyCandidate = React.useCallback((candidate: LookupCandidate) => {
    const sourceCandidate = candidate.type === 'enquiry'
      ? candidates.find((item) => item.type === 'source' && item.id === `source-${candidate.id}`)
      : null;
    const patch = serialisePatch({ ...sourceCandidate?.patch, ...candidate.patch });
    setChain((prev) => ({ ...prev, ...patch }));
    setActiveCandidatesByStage((prev) => ({
      ...prev,
      [candidate.type]: candidate,
      ...(candidate.type === 'enquiry' && (isPresent(patch.source_channel) || isPresent(patch.source_value)) ? { source: candidate } : {}),
      ...(candidate.type === 'enquiry' && (isPresent(patch.intake_type) || isPresent(patch.intake_at)) ? { intake: candidate } : {}),
    }));
    setMessage(`${candidate.title} added to draft. Lock to save.`);
    setError(null);
    if (candidate.type === 'pitch') {
      setPitchChooserOpen(false);
      void runLinkedRecordCheck(patch);
    }
    if (candidate.type === 'enquiry' || candidate.type === 'instruction') {
      void runPitchCheck(patch);
      void runLinkedRecordCheck(patch);
    }
  }, [candidates, runLinkedRecordCheck, runPitchCheck]);

  const startFresh = React.useCallback(() => {
    setChain({});
    setPersistedChain({});
    setCandidates([]);
    setSourceCheck(null);
    setPitchCheck(null);
    setActiveCandidatesByStage({});
    setPitchChooserOpen(false);
    setLastLinkedLookupRef('');
    setExpandedStages({});
    setLookupWarnings([]);
    setMessage('Started a new draft. It will save only when locked.');
    setError(null);
  }, []);

  const search = React.useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setMessage(null);
    setLookupWarnings([]);
    try {
      const response = await fetch(getApiUrl(`/api/marketing-attribution-chain/lookup?q=${encodeURIComponent(trimmed)}`), {
        credentials: 'include',
        headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setLookupWarnings(Array.isArray(payload.warnings) ? payload.warnings.slice(0, 5) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setSearching(false);
    }
  }, [query, userInitials]);

  const runSourceCheck = React.useCallback(async () => {
    if (!chain.enquiry_id) {
      setError('Link an enquiry before running the CallRail pressure check.');
      return;
    }
    setCheckingSource(true);
    setError(null);
    setSourceCheck(null);
    try {
      const response = await fetch(getApiUrl('/api/marketing-attribution-chain/source-check'), {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({ enquiry_id: chain.enquiry_id, source_value: chain.source_value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      setSourceCheck(payload);
      if (payload.recommendedPatch) {
        const patch = serialisePatch(payload.recommendedPatch);
        setChain((prev) => ({ ...prev, ...patch }));
        setMessage('CallRail recommendation added to draft. Lock to save.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source pressure check failed');
    } finally {
      setCheckingSource(false);
    }
  }, [chain.enquiry_id, requestHeaders]);

  const lockDraft = React.useCallback(async () => {
    if (!hasDraftValues || locked) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saveResponse = await fetch(getApiUrl('/api/marketing-attribution-chain'), {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({ id: chain.id ?? null, patch: draftPatch }),
      });
      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(savePayload?.details || savePayload?.error || `HTTP ${saveResponse.status}`);
      const savedRow = savePayload.row as AttributionChain | undefined;
      const savedId = savedRow?.id;
      if (!savedId) throw new Error('Attribution row saved without an id.');

      const lockResponse = await fetch(getApiUrl(`/api/marketing-attribution-chain/${savedId}/lock`), {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({}),
      });
      const lockPayload = await lockResponse.json().catch(() => ({}));
      if (!lockResponse.ok) throw new Error(lockPayload?.details || lockPayload?.error || `HTTP ${lockResponse.status}`);
      if (lockPayload.row) {
        setChain(lockPayload.row);
        setPersistedChain(lockPayload.row);
      }
      setMessage('Draft saved and attribution locked.');
      await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock attribution draft');
    } finally {
      setSaving(false);
    }
  }, [chain.id, draftPatch, hasDraftValues, loadInitial, locked, requestHeaders]);

  const renderFieldEditor = (field: keyof AttributionChain) => {
    const value = chain[field] ?? '';
    const fieldDirty = comparableValue(chain[field]) !== comparableValue(persistedChain[field]);
    const isDateTime = DATE_TIME_FIELDS.has(field);
    const selectOptions = field === 'source_channel' ? SOURCE_CHANNELS
      : field === 'intake_type' ? INTAKE_TYPES
        : field === 'client_type' ? CLIENT_TYPES
          : field === 'identity_check_status' ? WORKBENCH_STATUSES
            : field === 'risk_assessment_status' ? RISK_STATUSES
              : field === 'payment_method' ? PAYMENT_METHODS
                : field === 'payment_status' ? PAYMENT_STATUSES
                  : null;
    const baseInput: React.CSSProperties = {
      width: '100%',
      minHeight: 31,
      border: `1px solid ${fieldDirty ? colours.orange : border}`,
      background: fill,
      color: text,
      padding: '6px 8px',
      fontSize: 12,
      boxSizing: 'border-box',
    };

    return (
      <label key={String(field)} style={{ display: 'grid', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 10, color: subtle, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fieldLabel(field)}</span>
          {fieldDirty && <span style={{ fontSize: 10, fontWeight: 800, color: colours.orange }}>Draft</span>}
        </span>
        {selectOptions ? (
          <select value={String(value ?? '')} onChange={(event) => updateManualField(field, event.target.value)} disabled={locked} style={baseInput}>
            <option value="">Unset</option>
            {selectOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : isDateTime ? (
          <input
            type="datetime-local"
            value={formatDateTimeInputValue(String(value ?? ''))}
            onChange={(event) => updateManualField(field, parseDateTimeInputValue(event.target.value))}
            disabled={locked}
            style={baseInput}
          />
        ) : (
          <input value={String(value ?? '')} onChange={(event) => updateManualField(field, event.target.value)} disabled={locked} style={baseInput} />
        )}
      </label>
    );
  };

  const renderRecordPreview = (candidate: LookupCandidate | null, title = 'Row preview') => {
    const preview = (candidate?.preview || []).filter((item) => isPresent(item.label) && isPresent(item.value));
    if (preview.length === 0) return null;
    return (
      <div style={{ border: `1px solid ${border}`, background: panel, padding: '7px 8px', display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: accent }}>{title}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 5, maxHeight: 240, overflow: 'auto' }}>
          {preview.map((item) => (
            <span key={`${candidate?.type || 'candidate'}-${candidate?.id || 'preview'}-${item.label}`} style={{ fontSize: 10, color: subtle, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${item.label}: ${item.value}`}>
              <strong style={{ color: text }}>{item.label}</strong> {item.value}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderJsonPreview = (value: unknown, depth = 0, path = 'root'): React.ReactNode => {
    if (Array.isArray(value)) {
      return (
        <span>
          [
          {value.length > 0 && <br />}
          {value.map((item, index) => (
            <React.Fragment key={`${path}-${index}`}>
              <span style={{ paddingLeft: (depth + 1) * 12, display: 'inline-block' }} />
              {renderJsonPreview(item, depth + 1, `${path}-${index}`)}{index < value.length - 1 ? ',' : ''}
              <br />
            </React.Fragment>
          ))}
          {value.length > 0 && <span style={{ paddingLeft: depth * 12, display: 'inline-block' }} />}
          ]
        </span>
      );
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      return (
        <span>
          {'{'}
          {entries.length > 0 && <br />}
          {entries.map(([key, item], index) => {
            const populated = isPresent(item);
            return (
              <React.Fragment key={`${path}-${key}`}>
                <span style={{ paddingLeft: (depth + 1) * 12, display: 'inline-block' }} />
                <span style={{ color: subtle }}>"{key}"</span>: <span style={{ color: populated && (typeof item !== 'object' || item === null) ? colours.green : text }}>{renderJsonPreview(item, depth + 1, `${path}-${key}`)}</span>{index < entries.length - 1 ? ',' : ''}
                <br />
              </React.Fragment>
            );
          })}
          {entries.length > 0 && <span style={{ paddingLeft: depth * 12, display: 'inline-block' }} />}
          {'}'}
        </span>
      );
    }
    if (value === null || value === undefined || value === '') return <span style={{ color: subtle }}>null</span>;
    if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;
    return <span>"{String(value)}"</span>;
  };

  const renderChecklistPreview = () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {STAGES.map((stage) => {
        const fields = [stage.anchorField, ...stage.detailFields];
        const filled = fields.filter((field) => isPresent(chain[field]));
        return (
          <div key={`preview-checklist-${stage.key}`} style={{ border: `1px solid ${border}`, background: fill, padding: 8, display: 'grid', gap: 6 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: text, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
              <span>{stage.label}</span>
              <span style={{ color: filled.length === fields.length ? colours.green : filled.length > 0 ? colours.orange : subtle }}>{filled.length}/{fields.length}</span>
            </span>
            <div style={{ display: 'grid', gap: 4 }}>
              {fields.map((field) => {
                const populated = isPresent(chain[field]);
                return (
                  <span key={`preview-checklist-${stage.key}-${String(field)}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 6, alignItems: 'start', fontSize: 10, color: populated ? colours.green : subtle }}>
                    <Icon iconName={populated ? 'CompletedSolid' : 'CircleRing'} styles={{ root: { fontSize: 10, marginTop: 2 } }} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ color: populated ? colours.green : text }}>{fieldLabel(field)}</strong>
                      {populated && <span style={{ color: text }}> {String(chain[field])}</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderStageSection = (stage: StageDef) => {
    const progress = stageProgress(stage);
    const complete = progress.state === 'ready';
    const partial = progress.state === 'partial';
    const stageCandidates = candidatesByStage[stage.key] || [];
    const activeCandidate = activeCandidatesByStage[stage.key] || null;
    const fields = [stage.anchorField, ...stage.detailFields];
    const expanded = expandedStages[stage.key] === true;
    const statusColour = complete ? colours.green : partial ? colours.orange : subtle;
    return (
      <section key={stage.key} style={{ border: `1px solid ${border}`, borderLeft: `3px solid ${complete ? colours.green : partial ? colours.orange : withAlpha(subtle, 0.42)}`, background: panel, padding: 10, display: 'grid', gap: 9 }}>
        <button
          type="button"
          onClick={() => setExpandedStages((prev) => ({ ...prev, [stage.key]: !expanded }))}
          aria-expanded={expanded}
          style={{ border: 'none', background: 'transparent', color: text, padding: 0, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', textAlign: 'left', cursor: 'pointer' }}
        >
          <div style={{ display: 'grid', gap: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: complete ? colours.green : partial ? colours.orange : accent }}>
              <Icon iconName={expanded ? 'ChevronDown' : 'ChevronRight'} styles={{ root: { fontSize: 11, color: statusColour } }} />
              {stage.label}
            </span>
            <span style={{ fontSize: 11, color: subtle }}>{stage.searchHint}</span>
            {!expanded && progress.filled > 0 && (
              <span style={{ fontSize: 10, color: subtle }}>
                {progress.filled}/{progress.total} fields filled{activeCandidate ? ` / ${activeCandidate.title}` : ''}
              </span>
            )}
          </div>
          <span style={{ border: `1px solid ${withAlpha(statusColour, 0.38)}`, background: withAlpha(statusColour, 0.08), padding: '3px 6px', fontSize: 10, fontWeight: 900, color: statusColour, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
            {complete ? 'complete' : partial ? `partial ${progress.filled}/${progress.total}` : 'open'}
          </span>
        </button>

        {expanded && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8 }}>
              {fields.map(renderFieldEditor)}
            </div>

            {renderRecordPreview(activeCandidate, `${stage.label} row details`)}

            {stage.key === 'source' && (
          <div style={{ border: `1px solid ${border}`, background: fill, padding: 8, display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: text }}>CallRail pressure check</span>
              <button
                type="button"
                onClick={() => void runSourceCheck()}
                disabled={checkingSource || !chain.enquiry_id || locked}
                style={{ border: `1px solid ${border}`, background: checkingSource || !chain.enquiry_id || locked ? withAlpha(accent, 0.18) : accent, color: checkingSource || !chain.enquiry_id || locked ? text : '#ffffff', padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: checkingSource || !chain.enquiry_id || locked ? 'default' : 'pointer' }}
              >
                {checkingSource ? 'Checking' : 'Check CallRail'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: subtle }}>
              {chain.enquiry_id ? `Uses enquiry ${chain.enquiry_id} server-side and returns source evidence only.` : 'Pick an enquiry first.'}
            </span>
            {sourceCheck && (
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: sourceCheck.checked ? colours.green : colours.orange }}>
                  {sourceCheck.checked ? `${sourceCheck.count || 0} CallRail match${sourceCheck.count === 1 ? '' : 'es'} checked` : sourceCheck.reason || 'CallRail check unavailable'}
                </span>
                {sourceCheck.decision && (
                  <div style={{ border: `1px solid ${border}`, background: panel, padding: '7px 8px', display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: sourceCheck.decision.suggestedSource ? colours.green : text }}>
                      {sourceCheck.decision.recommendation || 'No CallRail recommendation'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      {sourceCheck.decision.suggestionReason || 'No decision reason returned.'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      Paid {sourceCheck.decision.paidSignals || 0} / organic {sourceCheck.decision.organicSignals || 0} / unknown {sourceCheck.decision.unknownSignals || 0}
                    </span>
                  </div>
                )}
                {(sourceCheck.evidence || []).slice(0, 3).map((item, index) => (
                  <div key={`${item.id || 'call'}-${index}`} style={{ border: `1px solid ${border}`, padding: '6px 8px', display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: text }}>
                      {item.channel || 'Unknown'} / {item.source && item.source !== 'Unknown' ? item.source : item.sourceName || item.utmSource || 'source not provided'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      {[
                        item.id ? `Call ${item.id}` : null,
                        item.startTime ? formatDateTime(item.startTime) : null,
                        item.direction || null,
                      ].filter(Boolean).join(' / ') || 'Call metadata unavailable'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      {[
                        item.sourceName ? `source_name ${item.sourceName}` : null,
                        item.source ? `source ${item.source}` : null,
                        item.medium ? `medium ${item.medium}` : null,
                        item.campaign ? `campaign ${item.campaign}` : null,
                        item.keywords ? `keywords ${item.keywords}` : null,
                        item.landingHost ? `landing ${item.landingHost}` : null,
                      ].filter(Boolean).join(' / ') || 'Channel detail unavailable'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      {[
                        item.utmSource ? `utm_source ${item.utmSource}` : null,
                        item.utmMedium ? `utm_medium ${item.utmMedium}` : null,
                        item.utmCampaign ? `utm_campaign ${item.utmCampaign}` : null,
                        item.utmTerm ? `utm_term ${item.utmTerm}` : null,
                        item.gclid ? 'gclid present' : null,
                        item.msclkid ? 'msclkid present' : null,
                        item.fbclid ? 'fbclid present' : null,
                        item.hasPaidClickId ? 'paid click id present' : null,
                        item.answered ? 'answered' : 'not answered',
                        item.duration ? `${item.duration}s` : null,
                      ].filter(Boolean).join(' / ')}
                    </span>
                    {(item.lastRequestedUrl || item.referringUrl || item.timelineUrl) && (
                      <span style={{ fontSize: 10, color: subtle }}>
                        {[
                          item.lastRequestedUrl ? `last ${item.lastRequestedUrl}` : null,
                          item.referringUrl ? `referrer ${item.referringUrl}` : null,
                          item.timelineUrl ? `timeline ${item.timelineUrl}` : null,
                        ].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

            {stage.key === 'pitch' && (
          <div style={{ border: `1px solid ${border}`, background: fill, padding: 8, display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: text }}>Pitch assist</span>
              <button
                type="button"
                onClick={() => void runPitchCheck()}
                disabled={checkingPitch || (!chain.enquiry_id && !chain.instruction_ref) || locked}
                style={{ border: `1px solid ${border}`, background: checkingPitch || (!chain.enquiry_id && !chain.instruction_ref) || locked ? withAlpha(accent, 0.18) : accent, color: checkingPitch || (!chain.enquiry_id && !chain.instruction_ref) || locked ? text : '#ffffff', padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: checkingPitch || (!chain.enquiry_id && !chain.instruction_ref) || locked ? 'default' : 'pointer' }}
              >
                {checkingPitch ? 'Checking' : 'Auto-check deals'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: subtle }}>
              {chain.enquiry_id || chain.instruction_ref ? 'Checks live Deals by enquiry/prospect id and instruction ref.' : 'Pick an enquiry or instruction first, or search recent pitches below.'}
            </span>
            {pitchCheck && (
              <span style={{ fontSize: 11, fontWeight: 800, color: pitchCheck.autoPatch ? colours.green : (pitchCheck.count || 0) > 0 ? colours.orange : subtle }}>
                {pitchCheck.autoPatch ? 'One deal was auto-added to draft.' : `${pitchCheck.count || 0} possible pitch match${pitchCheck.count === 1 ? '' : 'es'} found.`}
              </span>
            )}
            {chain.pitch_id && !pitchChooserOpen && (
              <div style={{ display: 'grid', gap: 7 }}>
                <button
                  type="button"
                  onClick={() => setPitchChooserOpen(true)}
                  disabled={locked}
                  style={{ border: `1px solid ${border}`, background: panel, color: text, padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: locked ? 'default' : 'pointer', justifySelf: 'start' }}
                >
                  Change pitch
                </button>
              </div>
            )}
            {(!chain.pitch_id || pitchChooserOpen) && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
                  <input
                    value={pitchQuery}
                    onChange={(event) => setPitchQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void searchPitches(); }}
                    placeholder="Search deal id, prospect id, passcode, status, pitched by"
                    style={{ border: `1px solid ${border}`, background: fill, color: text, minHeight: 31, padding: '6px 8px', fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => void searchPitches()}
                    disabled={pitchLoading || locked}
                    style={{ border: `1px solid ${border}`, background: pitchLoading || locked ? withAlpha(accent, 0.18) : panel, color: text, padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: pitchLoading || locked ? 'default' : 'pointer' }}
                  >
                    {pitchLoading ? 'Searching' : 'Search pitches'}
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {recentPitches.length === 0 && <span style={{ fontSize: 11, color: subtle }}>No pitch candidates loaded yet.</span>}
                  {recentPitches.slice(0, 6).map((candidate) => (
                    <button
                      key={`pitch-stream-${candidate.id}`}
                      type="button"
                      onClick={() => applyCandidate(candidate)}
                      disabled={locked}
                      style={{ border: `1px solid ${border}`, borderLeft: `3px solid ${accent}`, background: chain.pitch_id === candidate.patch.pitch_id ? withAlpha(accent, 0.09) : panel, color: text, padding: '7px 8px', display: 'grid', gap: 2, textAlign: 'left', cursor: locked ? 'default' : 'pointer' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900 }}>{candidate.title}</span>
                      <span style={{ fontSize: 10, color: subtle }}>{candidate.subtitle || 'No extra pitch detail'}</span>
                      {(candidate.preview || []).length > 0 && (
                        <span style={{ fontSize: 10, color: subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.preview?.slice(0, 4).map((item) => `${item.label} ${item.value}`).join(' / ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

            {stageCandidates.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {stageCandidates.map((candidate) => (
              <button
                key={`${candidate.type}-${candidate.id}`}
                type="button"
                onClick={() => applyCandidate(candidate)}
                disabled={locked}
                title={candidate.subtitle || candidate.title}
                style={{ border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 11, fontWeight: 800, cursor: locked ? 'default' : 'pointer', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {candidate.title}
              </button>
            ))}
          </div>
        )}
          </>
        )}
      </section>
    );
  };

  const renderCandidateButton = (candidate: LookupCandidate, tone: 'recent' | 'search', ordinal = 0) => {
    const spineStatus = tone === 'recent' && candidate.type === 'enquiry' ? getSpineStatus(candidate) : null;
    const statusColour = spineStatus?.state === 'complete' ? colours.green : spineStatus?.state === 'partial' ? colours.orange : subtle;
    return (
      <button
        key={`${tone}-${candidate.type}-${candidate.id}-${ordinal}`}
        type="button"
        onClick={() => applyCandidate(candidate)}
        disabled={locked}
        style={{
          border: `1px solid ${chain.enquiry_id === candidate.patch.enquiry_id ? withAlpha(accent, 0.52) : border}`,
          borderLeft: `3px solid ${spineStatus?.state === 'complete' ? colours.green : spineStatus?.state === 'partial' ? colours.orange : tone === 'recent' ? withAlpha(subtle, 0.7) : accent}`,
          background: chain.enquiry_id === candidate.patch.enquiry_id ? withAlpha(accent, 0.09) : fill,
          color: text,
          textAlign: 'left',
          padding: '8px 9px',
          display: 'grid',
          gap: 5,
          cursor: locked ? 'default' : 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 900 }}>{candidate.title}</span>
          {spineStatus && (
            <span style={{ border: `1px solid ${withAlpha(statusColour, 0.42)}`, background: withAlpha(statusColour, 0.1), color: statusColour, padding: '2px 5px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {spineStatus.label}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: subtle, lineHeight: 1.25 }}>{candidate.subtitle || 'No source evidence yet'}</span>
        {spineStatus && spineStatus.state !== 'missing' && (
          <span style={{ fontSize: 10, color: subtle, lineHeight: 1.25 }}>
            {spineStatus.readyStages}/{STAGES.length} stages ready / {spineStatus.filledFields}/{spineStatus.totalFields} spine fields
          </span>
        )}
      </button>
    );
  };

  return (
    <section
      data-helix-region="reports/data-hub/attribution-workbench"
      style={{
        border: `1px solid ${border}`,
        background: isDarkMode ? colours.dark.sectionBackground : '#f8fafc',
        display: 'grid',
        gridTemplateColumns: 'minmax(230px, 300px) minmax(0, 1fr) minmax(300px, 380px)',
        gap: 0,
        height: 'min(760px, calc(100vh - 190px))',
        minHeight: 620,
        overflow: 'hidden',
      }}
    >
      <aside style={{ borderRight: `1px solid ${border}`, background: panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>Recent enquiries</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: text }}>Start from the enquiry</span>
          <span style={{ fontSize: 11, lineHeight: 1.35, color: subtle }}>Pick a recent enquiry or search for a hard link. Nothing saves until lock.</span>
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void search(); }}
              placeholder="Enquiry, instruction, deal, payment, matter, client"
              style={{ border: `1px solid ${border}`, background: fill, color: text, minHeight: 34, padding: '7px 9px', fontSize: 12 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void search()}
            disabled={searching || !query.trim()}
            style={{ border: 'none', background: searching || !query.trim() ? withAlpha(accent, 0.42) : accent, color: '#ffffff', fontSize: 12, fontWeight: 900, padding: '9px 12px', cursor: searching || !query.trim() ? 'default' : 'pointer' }}
          >
            {searching ? 'Searching' : 'Search all links'}
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: subtle }}>Search results</span>
            {candidates.filter((candidate) => candidate.type !== 'source').slice(0, 10).map((candidate, index) => renderCandidateButton(candidate, 'search', index))}
          </div>
        )}

        <div className="dhaw-preview-scroll" style={{ borderTop: `1px solid ${border}`, paddingTop: 10, display: 'grid', gap: 6, overflow: 'auto', flex: 1, minHeight: 0, alignContent: 'start' }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: subtle }}>Latest enquiry stream</span>
          {loading && <span style={{ fontSize: 11, color: subtle }}>Loading enquiries</span>}
          {!loading && recentEnquiries.length === 0 && <span style={{ fontSize: 11, color: subtle }}>No recent enquiries available.</span>}
          {recentEnquiries.map((candidate, index) => renderCandidateButton(candidate, 'recent', index))}
        </div>
      </aside>

      <main className="dhaw-preview-scroll" style={{ padding: 12, display: 'grid', gap: 10, alignContent: 'start', overflow: 'auto', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>Draft canvas</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: text }}>Fill the full attribution chain</span>
            <span style={{ fontSize: 11, color: subtle }}>{completeCount}/{STAGES.length} stages ready{dirty ? ' / unsaved draft changes' : ''}</span>
          </div>
          <button
            type="button"
            onClick={startFresh}
            style={{ border: `1px solid ${border}`, background: fill, color: text, fontSize: 11, fontWeight: 900, padding: '7px 10px', cursor: 'pointer' }}
          >
            New draft
          </button>
        </div>

        {(message || error || saving) && (
          <div style={{ border: `1px solid ${error ? withAlpha(colours.cta, 0.42) : withAlpha(colours.green, 0.36)}`, background: error ? withAlpha(colours.cta, 0.08) : withAlpha(colours.green, 0.07), color: error ? colours.cta : (isDarkMode ? colours.green : '#0f6b3a'), padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
            {saving ? 'Saving and locking draft' : error || message}
          </div>
        )}

        {tableReady === false && (
          <div style={{ border: `1px solid ${withAlpha(colours.orange, 0.38)}`, background: withAlpha(colours.orange, 0.08), color: isDarkMode ? '#fbbf24' : '#92400e', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
            The attribution table is not available yet. Run tools/db/migrate-marketing-attribution-chain.sql before locking the first chain row.
          </div>
        )}

        {lookupWarnings.length > 0 && (
          <div style={{ border: `1px solid ${withAlpha(colours.orange, 0.32)}`, background: withAlpha(colours.orange, 0.06), color: isDarkMode ? '#fbbf24' : '#92400e', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
            Some lookup sources were unavailable: {lookupWarnings.join('; ')}
          </div>
        )}

        <div style={{ display: 'grid', gap: 9 }}>
          {STAGES.map(renderStageSection)}
        </div>
      </main>

      <aside style={{ borderLeft: `1px solid ${border}`, background: panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: accent }}>Chain preview</span>
            <span style={{ fontSize: 11, color: subtle }}>{chain.id ? `Row #${chain.id}` : 'Draft not saved'}{locked ? ` / locked ${formatDate(chain.attribution_locked_at)}` : ''}</span>
          </div>
          <Icon iconName={locked ? 'LockSolid' : 'Code'} styles={{ root: { color: locked ? colours.green : subtle, fontSize: 15 } }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['json', 'checklist'] as PreviewMode[]).map((mode) => (
            <button
              key={`preview-mode-${mode}`}
              type="button"
              onClick={() => setPreviewMode(mode)}
              style={{ border: `1px solid ${previewMode === mode ? withAlpha(accent, 0.62) : border}`, background: previewMode === mode ? withAlpha(accent, 0.12) : fill, color: previewMode === mode ? accent : text, padding: '6px 8px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {mode === 'json' ? 'JSON' : 'Checklist'}
            </button>
          ))}
        </div>

        <div className="dhaw-preview-scroll" style={{ margin: 0, border: `1px solid ${border}`, background: isDarkMode ? '#07111f' : '#ffffff', color: text, padding: 10, fontSize: 11, lineHeight: 1.42, overflow: 'auto', flex: 1, minHeight: 0, fontFamily: previewMode === 'json' ? 'Consolas, Monaco, monospace' : undefined }}>
          {previewMode === 'json' ? renderJsonPreview(previewObject) : renderChecklistPreview()}
        </div>

        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase' }}>Short attribution note</span>
          <textarea
            value={chain.attribution_note || ''}
            onChange={(event) => updateManualField('attribution_note', event.target.value)}
            disabled={locked}
            rows={3}
            style={{ border: `1px solid ${border}`, background: fill, color: text, padding: 8, fontSize: 12, resize: 'vertical' }}
          />
        </label>

        <button
          type="button"
          onClick={() => void lockDraft()}
          disabled={!hasDraftValues || locked || saving || tableReady === false}
          style={{ border: 'none', background: !hasDraftValues || locked || saving || tableReady === false ? withAlpha(colours.green, 0.38) : colours.green, color: '#ffffff', fontSize: 12, fontWeight: 900, padding: '11px 12px', cursor: !hasDraftValues || locked || saving || tableReady === false ? 'default' : 'pointer' }}
        >
          {locked ? 'Attribution locked' : 'Save and lock chain'}
        </button>
      </aside>
    </section>
  );
};

export default DataHubAttributionWorkbench;
