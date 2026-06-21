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
  enquiry_contact_method?: string | null;
  enquiry_area_of_work?: string | null;
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

type JourneyEntryMode = 'choice' | 'new' | 'inspect';
type PreviewMode = 'json' | 'checklist';
type IntakeScenarioKey = 'enquiry' | 'enquiry_pitch' | 'instruction' | 'client_matter';
type IntakeStepKey = 'enquiry' | 'pitch' | 'instruction' | 'client' | 'matter' | 'payment';

type IntakeStepDef = {
  key: IntakeStepKey;
  label: string;
  summary: string;
  stageKey: SpineStageKey;
  fields: Array<keyof AttributionChain>;
  requiredFields: Array<keyof AttributionChain>;
};

type IntakeScenarioDef = {
  key: IntakeScenarioKey;
  label: string;
  summary: string;
  iconName: string;
  steps: IntakeStepDef[];
  optionalPayment: boolean;
};

type StageDef = {
  key: SpineStageKey;
  label: string;
  anchorField: keyof AttributionChain;
  detailFields: Array<keyof AttributionChain>;
  requiredFields: Array<keyof AttributionChain>;
  searchHint: string;
};

type AssistedLock = {
  source: string;
  confidence: 'high';
};

const STAGES: StageDef[] = [
  { key: 'source', label: 'Source', anchorField: 'source_channel', detailFields: ['source_value', 'source_detail'], requiredFields: ['source_channel', 'source_value'], searchHint: 'Confirm channel and source evidence' },
  { key: 'intake', label: 'Intake', anchorField: 'intake_type', detailFields: ['call_id', 'form_submission_id', 'email_thread_id', 'intake_at'], requiredFields: ['intake_type'], searchHint: 'Call, form, email, or manual intake' },
  { key: 'enquiry', label: 'Enquiry', anchorField: 'enquiry_id', detailFields: ['enquiry_at', 'enquiry_owner', 'enquiry_contact_method', 'enquiry_area_of_work'], requiredFields: ['enquiry_id', 'enquiry_area_of_work'], searchHint: 'Recent enquiries are the starting point' },
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
const ENQUIRY_CONTACT_METHODS = ['phone', 'email', 'web_form', 'live_chat', 'referral', 'walk_in', 'unknown'];
const AREA_OF_WORK_OPTIONS = ['commercial', 'property', 'construction', 'employment', 'insolvency', 'debt', 'professional_negligence', 'unknown'];
const CLIENT_TYPES = ['individual', 'company', 'multiple_individuals', 'existing_client', 'unknown'];
const WORKBENCH_STATUSES = ['pending', 'processing', 'review', 'complete'];
const RISK_STATUSES = ['pending', 'warning', 'review', 'complete'];
const PAYMENT_METHODS = ['card', 'bank_transfer', 'mixed', 'unknown'];
const PAYMENT_STATUSES = ['pending', 'processing', 'succeeded', 'confirmed', 'failed', 'paid'];

const isPresent = (value: unknown): boolean => String(value ?? '').trim().length > 0;
const comparableValue = (value: unknown): string => String(value ?? '').trim();

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

const formatLockDateParts = (value?: string | null): { day: string; time: string } => {
  if (!value) return { day: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: String(value), time: '' };
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return {
    day: date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      ...(includeYear ? { year: 'numeric' as const } : {}),
    }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
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

const sourceDetailExample = (sourceChannel?: string | null): string => {
  switch (String(sourceChannel || '').trim().toLowerCase()) {
    case 'seo':
      return 'Example: Google organic search, commercial litigation page';
    case 'ppc':
      return 'Example: Google Ads campaign, landing page, or keyword group';
    case 'email':
      return 'Example: newsletter, nurture email, or named campaign';
    case 'referral':
      return 'Example: professional referral, existing client referral, or partner route';
    case 'direct':
      return 'Example: typed URL, bookmark, direct phone, or direct email';
    case 'unknown':
      return 'Example: operator note on what could be confirmed';
    default:
      return '';
  }
};

const normaliseFieldToken = (value: string): string => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const PREVIEW_FIELD_ALIASES: Record<string, keyof AttributionChain> = {
  pitch: 'pitch_id',
  pitch_id: 'pitch_id',
  pitchid: 'pitch_id',
  deal: 'pitch_id',
  deal_id: 'pitch_id',
  dealid: 'pitch_id',
  prospect_id: 'enquiry_id',
  prospectid: 'enquiry_id',
  enquiry: 'enquiry_id',
  enquiryid: 'enquiry_id',
  inquiry_id: 'enquiry_id',
  instruction: 'instruction_ref',
  instruction_ref: 'instruction_ref',
  instructionref: 'instruction_ref',
};

const serialisePatch = (patch: Partial<AttributionChain>): Partial<AttributionChain> => {
  const next: Partial<AttributionChain> = { ...patch };
  if (next.source_value && !next.source_channel) next.source_channel = inferSourceChannel(next.source_value);
  return next;
};

const EDITABLE_FIELDS = STAGES.flatMap((stage) => [stage.anchorField, ...stage.detailFields]).concat(['attribution_note'] as Array<keyof AttributionChain>);
const SPINE_FIELDS = STAGES.flatMap((stage) => [stage.anchorField, ...stage.detailFields]);
const COLLECTED_FIELDS = new Set<keyof AttributionChain>(['collected_value', 'collected_value_as_at', 'recent_sync_at']);
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
    if (!isPresent(chain.matter_id) && COLLECTED_FIELDS.has(field)) return;
    if (isPresent(chain[field])) patch[field] = chain[field] as never;
  });
  return serialisePatch(patch);
};

const getCandidateEnquiryId = (candidate: LookupCandidate): string => String(candidate.patch.enquiry_id || candidate.id || '').trim();

const getCandidateSelectionKey = (candidate: LookupCandidate): string => `${candidate.type}:${getCandidateEnquiryId(candidate) || candidate.id}`;

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
    contact_method: chain.enquiry_contact_method || null,
    area_of_work: chain.enquiry_area_of_work || null,
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

const uniqueFields = (fields: Array<keyof AttributionChain>): Array<keyof AttributionChain> => {
  const seen = new Set<keyof AttributionChain>();
  return fields.filter((field) => {
    if (seen.has(field)) return false;
    seen.add(field);
    return true;
  });
};

const lockFieldsFromPatch = (patch: Partial<AttributionChain>, source: string): Partial<Record<keyof AttributionChain, AssistedLock>> => {
  const locks: Partial<Record<keyof AttributionChain, AssistedLock>> = {};
  (Object.keys(patch) as Array<keyof AttributionChain>).forEach((field) => {
    if (field === 'id' || !isPresent(patch[field])) return;
    locks[field] = { source, confidence: 'high' };
  });
  return locks;
};

const INTAKE_EVIDENCE_FIELD_BY_TYPE: Partial<Record<string, keyof AttributionChain>> = {
  call: 'call_id',
  form: 'form_submission_id',
  email: 'email_thread_id',
};

const INTAKE_EVIDENCE_FIELDS: Array<keyof AttributionChain> = ['call_id', 'form_submission_id', 'email_thread_id'];

const intakeEvidenceFields = (chain: AttributionChain): Array<keyof AttributionChain> => {
  const intakeType = String(chain.intake_type || '').trim().toLowerCase();
  const evidenceField = INTAKE_EVIDENCE_FIELD_BY_TYPE[intakeType];
  return evidenceField ? [evidenceField] : [];
};

const ENQUIRY_STEP: IntakeStepDef = {
  key: 'enquiry',
  label: 'Enquiry details',
  summary: 'Capture source, contact route, area and owner before downstream records.',
  stageKey: 'enquiry',
  fields: ['enquiry_id', 'source_channel', 'source_value', 'intake_type', 'enquiry_contact_method', 'enquiry_area_of_work', 'enquiry_owner', 'enquiry_at'],
  requiredFields: ['source_channel', 'source_value', 'intake_type', 'enquiry_contact_method', 'enquiry_area_of_work', 'enquiry_owner'],
};

const PITCH_STEP: IntakeStepDef = {
  key: 'pitch',
  label: 'Pitch deal',
  summary: 'Attach the deal evidence and quoted amount for the enquiry.',
  stageKey: 'pitch',
  fields: ['pitch_id', 'pitch_status', 'pitched_by', 'deal_amount', 'pitch_at'],
  requiredFields: ['pitch_id', 'pitch_status', 'deal_amount'],
};

const INSTRUCTION_STEP: IntakeStepDef = {
  key: 'instruction',
  label: 'Instruction',
  summary: 'Add the instruction reference, stage, owner and client shape.',
  stageKey: 'instruction',
  fields: ['instruction_ref', 'instruction_stage', 'instruction_owner', 'client_type', 'instruction_at'],
  requiredFields: ['instruction_ref', 'instruction_stage', 'instruction_owner', 'client_type'],
};

const CLIENT_STEP: IntakeStepDef = {
  key: 'client',
  label: 'Client',
  summary: 'Use identifiers and client type only. Do not add client narrative here.',
  stageKey: 'instruction',
  fields: ['client_id', 'client_type', 'instruction_owner'],
  requiredFields: ['client_id', 'client_type'],
};

const MATTER_STEP: IntakeStepDef = {
  key: 'matter',
  label: 'Matter',
  summary: 'Link the matter id, work type and solicitor ownership.',
  stageKey: 'matter',
  fields: ['matter_id', 'matter_work_type', 'matter_at', 'responsible_solicitor', 'originating_solicitor'],
  requiredFields: ['matter_id', 'matter_work_type', 'responsible_solicitor'],
};

const PAYMENT_STEP: IntakeStepDef = {
  key: 'payment',
  label: 'Payment record',
  summary: 'Optional payment evidence for the same chain.',
  stageKey: 'payment',
  fields: ['payment_id', 'payment_method', 'payment_status', 'payment_amount', 'payment_at'],
  requiredFields: ['payment_id', 'payment_status', 'payment_amount'],
};

const INTAKE_SCENARIOS: IntakeScenarioDef[] = [
  {
    key: 'enquiry',
    label: 'Enquiry',
    summary: 'Create the first enquiry link.',
    iconName: 'Contact',
    steps: [ENQUIRY_STEP],
    optionalPayment: true,
  },
  {
    key: 'enquiry_pitch',
    label: 'Enquiry + pitch',
    summary: 'Link enquiry context to pitch evidence.',
    iconName: 'Send',
    steps: [ENQUIRY_STEP, PITCH_STEP],
    optionalPayment: true,
  },
  {
    key: 'instruction',
    label: 'Instruction',
    summary: 'Join enquiry, pitch and instruction evidence.',
    iconName: 'PageAdd',
    steps: [ENQUIRY_STEP, PITCH_STEP, INSTRUCTION_STEP],
    optionalPayment: true,
  },
  {
    key: 'client_matter',
    label: 'Client + matter',
    summary: 'Join enquiry through to client and matter.',
    iconName: 'WorkItem',
    steps: [ENQUIRY_STEP, PITCH_STEP, INSTRUCTION_STEP, CLIENT_STEP, MATTER_STEP],
    optionalPayment: true,
  },
];

const getIntakeScenarioByKey = (key: IntakeScenarioKey): IntakeScenarioDef => (
  INTAKE_SCENARIOS.find((scenario) => scenario.key === key) || INTAKE_SCENARIOS[0]
);

const getIntakeScenarioSteps = (scenario: IntakeScenarioDef, includePayment: boolean): IntakeStepDef[] => (
  includePayment && scenario.optionalPayment ? [...scenario.steps, PAYMENT_STEP] : scenario.steps
);

const getIntakeStepFields = (step: IntakeStepDef, chain: AttributionChain): Array<keyof AttributionChain> => {
  if (step.key !== 'enquiry') return step.fields;
  const fields: Array<keyof AttributionChain> = [];
  step.fields.forEach((field) => {
    fields.push(field);
    if (field === 'intake_type') fields.push(...intakeEvidenceFields(chain));
  });
  return uniqueFields(fields);
};

const getIntakeStepRequiredFields = (step: IntakeStepDef, chain: AttributionChain): Array<keyof AttributionChain> => (
  step.key === 'enquiry'
    ? uniqueFields([...step.requiredFields, ...intakeEvidenceFields(chain)])
    : step.requiredFields
);

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
  const [callIntakeCandidates, setCallIntakeCandidates] = React.useState<LookupCandidate[]>([]);
  const [callIntakeLoading, setCallIntakeLoading] = React.useState(false);
  const [callIntakeError, setCallIntakeError] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<LookupCandidate[]>([]);
  const [pitchQuery, setPitchQuery] = React.useState('');
  const [pitchChooserOpen, setPitchChooserOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pitchLoading, setPitchLoading] = React.useState(false);
  const [tableReady, setTableReady] = React.useState<boolean | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingLabel, setSavingLabel] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedEnquiryKeys, setSelectedEnquiryKeys] = React.useState<Set<string>>(() => new Set());
  const [lastSelectedEnquiryKey, setLastSelectedEnquiryKey] = React.useState<string | null>(null);
  const [bulkSourceRunning, setBulkSourceRunning] = React.useState(false);
  const [bulkSourceProgress, setBulkSourceProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [lookupWarnings, setLookupWarnings] = React.useState<string[]>([]);
  const [sourceCheck, setSourceCheck] = React.useState<SourceCheckResult | null>(null);
  const [checkingSource, setCheckingSource] = React.useState(false);
  const [pitchCheck, setPitchCheck] = React.useState<PitchCheckResult | null>(null);
  const [activeCandidatesByStage, setActiveCandidatesByStage] = React.useState<Partial<Record<SpineStageKey, LookupCandidate>>>({});
  const [assistedLocks, setAssistedLocks] = React.useState<Partial<Record<keyof AttributionChain, AssistedLock>>>({});
  const [checkingPitch, setCheckingPitch] = React.useState(false);
  const [lastLinkedLookupRef, setLastLinkedLookupRef] = React.useState('');
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>('checklist');
  const [expandedStages, setExpandedStages] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});
  const [rowDetailsOpenByStage, setRowDetailsOpenByStage] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});
  const [rowDetailsEditByStage, setRowDetailsEditByStage] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});
  const [rowDetailsRawOpenByStage, setRowDetailsRawOpenByStage] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});
  const [supportingFieldsOpenByStage, setSupportingFieldsOpenByStage] = React.useState<Partial<Record<SpineStageKey, boolean>>>({});
  const [sourceEvidenceOpen, setSourceEvidenceOpen] = React.useState(false);
  const [detailDraftByStage, setDetailDraftByStage] = React.useState<Partial<Record<SpineStageKey, Record<string, string>>>>({});
  const [hideReviewed, setHideReviewed] = React.useState(false);
  const [enquiryRailOpen, setEnquiryRailOpen] = React.useState(true);
  const [enquiryRailPinned, setEnquiryRailPinned] = React.useState(false);
  const [previewPaneOpen, setPreviewPaneOpen] = React.useState(true);
  const [spineOpen, setSpineOpen] = React.useState(false);
  const [entryMode, setEntryMode] = React.useState<JourneyEntryMode>('choice');
  const [intakeOpen, setIntakeOpen] = React.useState(false);
  const [intakeScenario, setIntakeScenario] = React.useState<IntakeScenarioKey>('enquiry');
  const [activeIntakeStep, setActiveIntakeStep] = React.useState<IntakeStepKey>('enquiry');
  const [includePaymentStep, setIncludePaymentStep] = React.useState(false);

  const text = isDarkMode ? '#d1d5db' : '#374151';
  const subtle = isDarkMode ? '#d1d5db' : colours.subtleGrey;
  const border = isDarkMode ? withAlpha(colours.dark.borderColor, 0.62) : withAlpha(colours.helixBlue, 0.16);
  const panel = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.96);
  const fill = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.92) : '#ffffff';
  const inset = isDarkMode ? colours.dark.background : colours.light.previewBackground;
  const cardSurface = isDarkMode ? colours.dark.sectionBackground : colours.light.cardBackground;
  const cardControlSurface = isDarkMode ? colours.dark.cardBackground : colours.grey;
  const cardBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  const cardShadow = isDarkMode ? `0 18px 44px ${colours.websiteBlue}33` : `0 16px 36px ${withAlpha(colours.helixBlue, 0.07)}`;
  const accent = isDarkMode ? colours.accent : colours.helixBlue;
  const lockTone = colours.green;
  const progressTone = accent;
  const pendingTone = accent;
  const quietEdge = border;
  const quietPanel = isDarkMode ? withAlpha(colours.dark.cardHover, 0.36) : withAlpha(colours.light.cardBackground, 0.9);
  const quietInsetStyle: React.CSSProperties = { borderTop: `1px solid ${quietEdge}`, paddingTop: 9, display: 'grid', gap: 7 };
  const quietRowStyle: React.CSSProperties = { borderLeft: `2px solid ${quietEdge}`, background: quietPanel, padding: '7px 8px', display: 'grid', gap: 4 };
  const locked = isPresent(chain.attribution_locked_at);
  const callIntakeEnabled = String(chain.intake_type || '').trim().toLowerCase() === 'call';

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

  React.useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const stageProgress = React.useCallback((stage: StageDef) => {
    const fields = stage.requiredFields;
    if (stage.key === 'collected' && !isPresent(chain.matter_id)) return { state: 'open' as const, filled: 0, total: fields.length };
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
  const spineStatusLabel = loading ? 'Loading' : locked ? 'Locked' : dirty ? 'Draft open' : spineOpen ? 'Open' : 'Closed';
  const spineReadyPercent = Math.round((completeCount / STAGES.length) * 100);
  const hasSelectedEnquiry = isPresent(chain.enquiry_id);
  const selectedIntakeScenario = React.useMemo(() => getIntakeScenarioByKey(intakeScenario), [intakeScenario]);
  const intakeSteps = React.useMemo(() => getIntakeScenarioSteps(selectedIntakeScenario, includePaymentStep), [includePaymentStep, selectedIntakeScenario]);
  const activeIntakeStepDef = intakeSteps.find((step) => step.key === activeIntakeStep) || intakeSteps[0] || ENQUIRY_STEP;
  const activeIntakeStepFields = getIntakeStepFields(activeIntakeStepDef, chain);
  const intakeScenarioFields = uniqueFields(intakeSteps.flatMap((step) => getIntakeStepFields(step, chain)));
  const intakeRequiredFields = uniqueFields(intakeSteps.flatMap((step) => getIntakeStepRequiredFields(step, chain)));
  const intakeMissingFields = intakeRequiredFields.filter((field) => !isPresent(chain[field]));
  const intakeFilledFields = intakeScenarioFields.filter((field) => isPresent(chain[field])).length;
  const canSaveIntake = hasDraftValues && !locked && !saving && tableReady !== false && intakeMissingFields.length === 0;
  const nextOpenStage = STAGES.find((stage) => stageProgress(stage).state !== 'ready') ?? null;
  const currentStage = nextOpenStage ?? STAGES[STAGES.length - 1];

  const focusStage = React.useCallback((stageKey: SpineStageKey) => {
    setExpandedStages({ [stageKey]: true });
  }, []);

  const setLeftPaneOpen = React.useCallback((open: boolean, reason?: 'manual' | 'auto') => {
    setEnquiryRailOpen(open);
    setMessage(open ? 'Enquiry list opened.' : reason === 'auto' ? 'Enquiry list closed after selection.' : 'Enquiry list closed.');
  }, []);

  const setRightPaneOpen = React.useCallback((open: boolean) => {
    setPreviewPaneOpen(open);
    setMessage(open ? 'Preview opened.' : 'Preview closed.');
  }, []);

  const toggleSpineOpen = React.useCallback(() => {
    setSpineOpen((current) => {
      const next = !current;
      if (next && currentStage) {
        setExpandedStages({ [currentStage.key]: true });
      }
      return next;
    });
  }, [currentStage]);

  const inspectExistingJourney = React.useCallback(() => {
    setEntryMode('inspect');
    setIntakeOpen(false);
    setSpineOpen(true);
    setLeftPaneOpen(true, 'manual');
    setRightPaneOpen(true);
    if (currentStage) {
      setExpandedStages({ [currentStage.key]: true });
    }
  }, [currentStage, setLeftPaneOpen, setRightPaneOpen]);

  React.useEffect(() => {
    if (!intakeSteps.some((step) => step.key === activeIntakeStep)) {
      setActiveIntakeStep(intakeSteps[0]?.key || 'enquiry');
    }
  }, [activeIntakeStep, intakeSteps]);

  const candidatesByStage = React.useMemo(() => STAGES.reduce((acc, stage) => {
    acc[stage.key] = candidates.filter((candidate) => candidate.type === stage.key);
    return acc;
  }, {} as Record<SpineStageKey, LookupCandidate[]>), [candidates]);

  const pitchStreamCandidates = React.useMemo(() => {
    const trimmedQuery = pitchQuery.trim();
    if (trimmedQuery) return recentPitches;
    const enquiryId = String(chain.enquiry_id || '').trim();
    const instructionRef = String(chain.instruction_ref || '').trim();
    if (!enquiryId && !instructionRef) return recentPitches;
    return recentPitches.filter((candidate) => {
      const candidateEnquiry = String(candidate.patch.enquiry_id || '').trim();
      const candidateInstruction = String(candidate.patch.instruction_ref || '').trim();
      if (enquiryId && candidateEnquiry === enquiryId) return true;
      if (instructionRef && candidateInstruction === instructionRef) return true;
      return false;
    });
  }, [chain.enquiry_id, chain.instruction_ref, pitchQuery, recentPitches]);

  const chainsByEnquiryId = React.useMemo(() => recentChains.reduce((acc, row) => {
    const key = String(row.enquiry_id ?? '').trim();
    if (key && !acc[key]) acc[key] = row;
    return acc;
  }, {} as Record<string, AttributionChain>), [recentChains]);

  const getSpineStatus = React.useCallback((candidate: LookupCandidate) => {
    const enquiryId = String(candidate.patch.enquiry_id || candidate.id || '').trim();
    const row = chainsByEnquiryId[enquiryId];
    if (!row) return { state: 'missing' as const, label: 'Not indexed', filledFields: 0, totalFields: SPINE_FIELDS.length, readyStages: 0 };
    const filledFields = SPINE_FIELDS.filter((field) => isPresent(row[field])).length;
    const readyStages = STAGES.filter((stage) => [stage.anchorField, ...stage.detailFields].every((field) => isPresent(row[field]))).length;
    const complete = filledFields === SPINE_FIELDS.length;
    if (complete) return { state: 'complete' as const, label: 'Complete', filledFields, totalFields: SPINE_FIELDS.length, readyStages };
    return { state: 'partial' as const, label: 'Needs links', filledFields, totalFields: SPINE_FIELDS.length, readyStages };
  }, [chainsByEnquiryId]);

  const isReviewedCandidate = React.useCallback((candidate: LookupCandidate) => {
    const enquiryId = String(candidate.patch.enquiry_id || candidate.id || '').trim();
    const row = chainsByEnquiryId[enquiryId];
    return isPresent(row?.attribution_locked_at);
  }, [chainsByEnquiryId]);

  const visibleRecentEnquiries = React.useMemo(() => (
    hideReviewed ? recentEnquiries.filter((candidate) => !isReviewedCandidate(candidate)) : recentEnquiries
  ), [hideReviewed, isReviewedCandidate, recentEnquiries]);

  const hiddenReviewedCount = React.useMemo(() => (
    hideReviewed ? recentEnquiries.length - visibleRecentEnquiries.length : 0
  ), [hideReviewed, recentEnquiries.length, visibleRecentEnquiries.length]);

  const selectedVisibleEnquiries = React.useMemo(() => (
    visibleRecentEnquiries.filter((candidate) => selectedEnquiryKeys.has(getCandidateSelectionKey(candidate)))
  ), [selectedEnquiryKeys, visibleRecentEnquiries]);

  const toggleEnquirySelection = React.useCallback((candidate: LookupCandidate, index: number, event?: React.MouseEvent<HTMLInputElement>) => {
    if (bulkSourceRunning) return;
    const key = getCandidateSelectionKey(candidate);
    setLastSelectedEnquiryKey(key);
    setSelectedEnquiryKeys((current) => {
      const next = new Set(current);
      if (event?.shiftKey && lastSelectedEnquiryKey) {
        const anchorIndex = visibleRecentEnquiries.findIndex((item) => getCandidateSelectionKey(item) === lastSelectedEnquiryKey);
        if (anchorIndex !== -1) {
          const start = Math.min(anchorIndex, index);
          const end = Math.max(anchorIndex, index);
          const shouldSelectRange = !next.has(key);
          visibleRecentEnquiries.slice(start, end + 1).forEach((item) => {
            const itemKey = getCandidateSelectionKey(item);
            if (event.ctrlKey || event.metaKey) {
              if (shouldSelectRange) next.add(itemKey);
              else next.delete(itemKey);
            } else {
              next.add(itemKey);
            }
          });
          return next;
        }
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [bulkSourceRunning, lastSelectedEnquiryKey, visibleRecentEnquiries]);

  const setAllVisibleEnquiriesSelected = React.useCallback((selected: boolean) => {
    setSelectedEnquiryKeys((current) => {
      const next = new Set(current);
      visibleRecentEnquiries.forEach((candidate) => {
        const key = getCandidateSelectionKey(candidate);
        if (selected) next.add(key);
        else next.delete(key);
      });
      return next;
    });
    setLastSelectedEnquiryKey(null);
  }, [visibleRecentEnquiries]);

  const loadCallIntakeCandidates = React.useCallback(async () => {
    if (String(chain.intake_type || '').trim().toLowerCase() !== 'call') {
      setCallIntakeCandidates([]);
      setCallIntakeError(null);
      return;
    }
    setCallIntakeLoading(true);
    setCallIntakeError(null);
    try {
      const params = new URLSearchParams({ limit: '12' });
      if (chain.enquiry_id) params.set('enquiry_id', String(chain.enquiry_id));
      const response = await fetch(getApiUrl(`/api/marketing-attribution-chain/recent-call-intakes?${params.toString()}`), {
        credentials: 'include',
        headers: userInitials ? { 'x-helix-initials': userInitials } : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      setCallIntakeCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
    } catch (err) {
      setCallIntakeCandidates([]);
      setCallIntakeError(err instanceof Error ? err.message : 'Failed to load incoming call intakes');
    } finally {
      setCallIntakeLoading(false);
    }
  }, [chain.enquiry_id, chain.intake_type, userInitials]);

  React.useEffect(() => {
    if (locked) return;
    if (callIntakeEnabled) {
      void loadCallIntakeCandidates();
      return;
    }
    setCallIntakeCandidates([]);
    setCallIntakeError(null);
  }, [callIntakeEnabled, loadCallIntakeCandidates, locked]);

  const updateManualField = React.useCallback((field: keyof AttributionChain, value: string) => {
    setChain((prev) => ({ ...prev, [field]: value }));
    setAssistedLocks((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (field === 'intake_type' && value === 'call') {
      setExpandedStages((prev) => ({ ...prev, intake: true }));
    }
  }, []);

  const unlockAssistedField = React.useCallback((field: keyof AttributionChain) => {
    setAssistedLocks((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const getSelectOptions = React.useCallback((field: keyof AttributionChain) => (
    field === 'source_channel' ? SOURCE_CHANNELS
      : field === 'intake_type' ? INTAKE_TYPES
        : field === 'enquiry_contact_method' ? ENQUIRY_CONTACT_METHODS
          : field === 'enquiry_area_of_work' ? AREA_OF_WORK_OPTIONS
            : field === 'client_type' ? CLIENT_TYPES
              : field === 'identity_check_status' ? WORKBENCH_STATUSES
                : field === 'risk_assessment_status' ? RISK_STATUSES
                  : field === 'payment_method' ? PAYMENT_METHODS
                    : field === 'payment_status' ? PAYMENT_STATUSES
                      : null
  ), []);

  const resolvePreviewField = React.useCallback((stage: StageDef, label: string): keyof AttributionChain | null => {
    const target = normaliseFieldToken(label);
    const stageFields = [stage.anchorField, ...stage.detailFields];
    const match = stageFields.find((field) => {
      const fieldToken = normaliseFieldToken(String(field));
      const labelToken = normaliseFieldToken(fieldLabel(field));
      return fieldToken === target || labelToken === target;
    });
    if (match) return match;
    return PREVIEW_FIELD_ALIASES[target] || null;
  }, []);

  const updateDetailDraftField = React.useCallback((stageKey: SpineStageKey, key: string, value: string) => {
    setDetailDraftByStage((prev) => ({
      ...prev,
      [stageKey]: {
        ...(prev[stageKey] || {}),
        [key]: value,
      },
    }));
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
        const patch = serialisePatch(autoPatch);
        setChain((prev) => ({ ...prev, ...patch }));
        setAssistedLocks((prev) => ({ ...prev, ...lockFieldsFromPatch(patch, 'Linked record lookup') }));
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
        setAssistedLocks((prev) => ({ ...prev, ...lockFieldsFromPatch(patch, 'Pitch auto-check') }));
        setActiveCandidatesByStage((prev) => ({ ...prev, pitch: payload.autoCandidate || undefined }));
        setPitchChooserOpen(false);
        setMessage('Pitch auto-check found one deal and added it to draft. Lock to save.');
        void runLinkedRecordCheck(patch);
      } else if (Array.isArray(payload.candidates)) {
        setRecentPitches(payload.candidates);
        if (payload.candidates.length > 0) {
          setPitchChooserOpen(true);
          setMessage(`${payload.candidates.length} possible pitch matches found. Pick the right one from Pitch.`);
        } else {
          setPitchChooserOpen(false);
        }
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
    setAssistedLocks((prev) => ({ ...prev, ...lockFieldsFromPatch(patch, `${candidate.title} lookup`) }));
    setActiveCandidatesByStage((prev) => ({
      ...prev,
      [candidate.type]: candidate,
      ...(candidate.type === 'enquiry' && (isPresent(patch.source_channel) || isPresent(patch.source_value)) ? { source: candidate } : {}),
      ...(candidate.type === 'enquiry' && (isPresent(patch.intake_type) || isPresent(patch.intake_at)) ? { intake: candidate } : {}),
    }));
    setDetailDraftByStage((prev) => ({ ...prev, [candidate.type]: {} }));
    if (candidate.type === 'enquiry' && String(patch.intake_type || '').toLowerCase() === 'call' && !isPresent(patch.call_id)) {
      setExpandedStages((prev) => ({ ...prev, intake: true }));
    }
    if (!enquiryRailPinned) {
      setLeftPaneOpen(false, 'auto');
      setMessage(`${candidate.title} added to draft. Enquiry list closed.`);
    } else {
      setMessage(`${candidate.title} added to draft. Lock to save.`);
    }
    setError(null);
    if (candidate.type === 'pitch') {
      setPitchChooserOpen(false);
      void runLinkedRecordCheck(patch);
    }
    if (candidate.type === 'enquiry' || candidate.type === 'instruction') {
      void runPitchCheck(patch);
      void runLinkedRecordCheck(patch);
    }
  }, [candidates, enquiryRailPinned, runLinkedRecordCheck, runPitchCheck, setLeftPaneOpen]);

  const startFresh = React.useCallback(() => {
    setChain({});
    setPersistedChain({});
    setCandidates([]);
    setSourceCheck(null);
    setSourceEvidenceOpen(false);
    setPitchCheck(null);
    setActiveCandidatesByStage({});
    setAssistedLocks({});
    setPitchChooserOpen(false);
    setLastLinkedLookupRef('');
    setExpandedStages({});
    setRowDetailsOpenByStage({});
    setRowDetailsEditByStage({});
    setRowDetailsRawOpenByStage({});
    setSupportingFieldsOpenByStage({});
    setDetailDraftByStage({});
    setLookupWarnings([]);
    setIntakeScenario('enquiry');
    setActiveIntakeStep('enquiry');
    setIncludePaymentStep(false);
    setEntryMode('new');
    setIntakeOpen(false);
    setSpineOpen(false);
    setMessage('Started a new draft. Save the intake first, then lock after review.');
    setError(null);
  }, []);

  const selectIntakeScenario = React.useCallback((scenarioKey: IntakeScenarioKey) => {
    const nextScenario = getIntakeScenarioByKey(scenarioKey);
    setIntakeScenario(scenarioKey);
    setActiveIntakeStep(nextScenario.steps[0]?.key || 'enquiry');
    setEntryMode('new');
    setIntakeOpen(true);
  }, []);

  const togglePaymentStep = React.useCallback(() => {
    setIncludePaymentStep((current) => {
      const next = !current;
      if (next) {
        setActiveIntakeStep('payment');
      } else {
        setActiveIntakeStep((currentStep) => currentStep === 'payment'
          ? getIntakeScenarioByKey(intakeScenario).steps[0]?.key || 'enquiry'
          : currentStep);
      }
      return next;
    });
  }, [intakeScenario]);

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
        setAssistedLocks((prev) => ({ ...prev, ...lockFieldsFromPatch(patch, 'CallRail recommendation') }));
        setMessage('CallRail recommendation added to draft. Lock to save.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source pressure check failed');
    } finally {
      setCheckingSource(false);
    }
  }, [chain.enquiry_id, chain.source_value, requestHeaders]);

  const runSelectedSourceChecksAndSave = React.useCallback(async () => {
    if (selectedVisibleEnquiries.length === 0 || bulkSourceRunning || tableReady === false) return;
    setBulkSourceRunning(true);
    setBulkSourceProgress({ done: 0, total: selectedVisibleEnquiries.length });
    setSavingLabel('Running selected CallRail checks');
    setError(null);
    setMessage(null);
    let savedCount = 0;
    let recommendedCount = 0;
    let failedCount = 0;
    try {
      for (let index = 0; index < selectedVisibleEnquiries.length; index += 1) {
        const candidate = selectedVisibleEnquiries[index];
        const enquiryId = getCandidateEnquiryId(candidate);
        const existingChain = chainsByEnquiryId[enquiryId];
        if (!enquiryId || isPresent(existingChain?.attribution_locked_at)) {
          failedCount += 1;
          setBulkSourceProgress({ done: index + 1, total: selectedVisibleEnquiries.length });
          continue;
        }

        const sourceResponse = await fetch(getApiUrl('/api/marketing-attribution-chain/source-check'), {
          method: 'POST',
          credentials: 'include',
          headers: requestHeaders,
          body: JSON.stringify({ enquiry_id: enquiryId, source_value: candidate.patch.source_value || existingChain?.source_value || '' }),
        });
        const sourcePayload = await sourceResponse.json().catch(() => ({}));
        if (!sourceResponse.ok) {
          failedCount += 1;
          setBulkSourceProgress({ done: index + 1, total: selectedVisibleEnquiries.length });
          continue;
        }

        const patch = serialisePatch({ ...candidate.patch, ...(sourcePayload.recommendedPatch || {}) });
        if (sourcePayload.recommendedPatch) recommendedCount += 1;
        const saveResponse = await fetch(getApiUrl('/api/marketing-attribution-chain'), {
          method: 'POST',
          credentials: 'include',
          headers: requestHeaders,
          body: JSON.stringify({ id: existingChain?.id ?? null, patch }),
        });
        if (saveResponse.ok) savedCount += 1;
        else failedCount += 1;
        setBulkSourceProgress({ done: index + 1, total: selectedVisibleEnquiries.length });
      }
      setSelectedEnquiryKeys(new Set());
      setMessage(`CallRail bulk check saved ${savedCount.toLocaleString('en-GB')} row${savedCount === 1 ? '' : 's'}${recommendedCount ? `, ${recommendedCount.toLocaleString('en-GB')} with recommendations` : ''}${failedCount ? `, ${failedCount.toLocaleString('en-GB')} skipped or failed` : ''}.`);
      await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk CallRail check failed');
    } finally {
      setBulkSourceRunning(false);
      setBulkSourceProgress(null);
      setSavingLabel(null);
    }
  }, [bulkSourceRunning, chainsByEnquiryId, loadInitial, requestHeaders, selectedVisibleEnquiries, tableReady]);

  const saveDraft = React.useCallback(async () => {
    if (!hasDraftValues || locked) return;
    setSaving(true);
    setSavingLabel('Saving intake');
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
      if (savedRow) {
        setChain(savedRow);
        setPersistedChain(savedRow);
        setAssistedLocks({});
      }
      setMessage('Intake draft saved. Reveal the chain when you want to review the full spine.');
      await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attribution draft');
    } finally {
      setSaving(false);
      setSavingLabel(null);
    }
  }, [chain.id, draftPatch, hasDraftValues, loadInitial, locked, requestHeaders]);

  const lockDraft = React.useCallback(async () => {
    if (!hasDraftValues || locked) return;
    setSaving(true);
    setSavingLabel('Saving and locking draft');
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
        setAssistedLocks({});
      }
      setMessage('Draft saved and attribution locked.');
      await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock attribution draft');
    } finally {
      setSaving(false);
      setSavingLabel(null);
    }
  }, [chain.id, draftPatch, hasDraftValues, loadInitial, locked, requestHeaders]);

  const renderFieldEditor = (field: keyof AttributionChain) => {
    const value = chain[field] ?? '';
    const fieldDirty = comparableValue(chain[field]) !== comparableValue(persistedChain[field]);
    const assistedLock = assistedLocks[field];
    const isDateTime = DATE_TIME_FIELDS.has(field);
    const selectOptions = getSelectOptions(field);
    const selectValues = selectOptions && isPresent(value) && !selectOptions.includes(String(value))
      ? [String(value), ...selectOptions]
      : selectOptions;
    const intakeType = String(chain.intake_type || '').trim().toLowerCase();
    const selectedIntakeEvidenceField = INTAKE_EVIDENCE_FIELD_BY_TYPE[intakeType];
    const inactiveIntakeEvidenceField = INTAKE_EVIDENCE_FIELDS.includes(field) && !!selectedIntakeEvidenceField && field !== selectedIntakeEvidenceField;
    const fieldDisabled = locked || !!assistedLock || COLLECTED_FIELDS.has(field) && !isPresent(chain.matter_id);
    const helperText = field === 'source_detail' ? sourceDetailExample(chain.source_channel) : '';
    const baseInput: React.CSSProperties = {
      width: '100%',
      minHeight: 31,
      border: `${fieldDirty ? 2 : 1}px solid ${fieldDirty ? withAlpha(pendingTone, inactiveIntakeEvidenceField ? 0.42 : 0.78) : inactiveIntakeEvidenceField ? withAlpha(subtle, 0.18) : border}`,
      background: assistedLock ? withAlpha(lockTone, isDarkMode ? 0.1 : 0.045) : inactiveIntakeEvidenceField ? withAlpha(subtle, isDarkMode ? 0.08 : 0.035) : fieldDirty ? withAlpha(pendingTone, isDarkMode ? 0.11 : 0.055) : fill,
      color: inactiveIntakeEvidenceField ? subtle : text,
      padding: '6px 8px',
      fontSize: 12,
      fontWeight: fieldDirty ? 800 : undefined,
      boxSizing: 'border-box',
      opacity: inactiveIntakeEvidenceField ? 0.58 : 1,
    };

    return (
      <label key={String(field)} style={{ display: 'grid', gap: 4, opacity: inactiveIntakeEvidenceField ? 0.72 : 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 10, color: inactiveIntakeEvidenceField ? withAlpha(subtle, 0.68) : subtle, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fieldLabel(field)}</span>
          {assistedLock ? (
            <button
              type="button"
              onClick={() => unlockAssistedField(field)}
              disabled={locked}
              title={`Filled by ${assistedLock.source}`}
              style={{ border: `1px solid ${withAlpha(lockTone, 0.34)}`, background: withAlpha(lockTone, 0.09), color: lockTone, padding: '1px 5px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: locked ? 'default' : 'pointer' }}
            >
              Edit
            </button>
          ) : fieldDirty && <span style={{ border: `1px solid ${withAlpha(pendingTone, 0.34)}`, background: withAlpha(pendingTone, 0.09), color: pendingTone, padding: '1px 5px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>Pending save</span>}
        </span>
        {selectValues ? (
          <select value={String(value ?? '')} onChange={(event) => updateManualField(field, event.target.value)} disabled={fieldDisabled} style={baseInput}>
            <option value="">Unset</option>
            {selectValues.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : isDateTime ? (
          <input
            type="datetime-local"
            value={formatDateTimeInputValue(String(value ?? ''))}
            onChange={(event) => updateManualField(field, parseDateTimeInputValue(event.target.value))}
            disabled={fieldDisabled}
            style={baseInput}
          />
        ) : (
          <input value={String(value ?? '')} onChange={(event) => updateManualField(field, event.target.value)} disabled={fieldDisabled} style={baseInput} placeholder={helperText || undefined} />
        )}
        {helperText && !isPresent(value) && (
          <span style={{ fontSize: 10, color: subtle, lineHeight: 1.35 }}>{helperText}</span>
        )}
      </label>
    );
  };

  const renderIntakeTray = () => {
    const activeStepIndex = Math.max(0, intakeSteps.findIndex((step) => step.key === activeIntakeStepDef.key));
    const activeRequiredFields = getIntakeStepRequiredFields(activeIntakeStepDef, chain);
    const activeMissingFields = activeRequiredFields.filter((field) => !isPresent(chain[field]));
    return (
      <div data-helix-region="reports/data-hub/attribution-workbench/intake" style={{ display: 'grid', gap: 10, border: `1px solid ${withAlpha(accent, 0.2)}`, background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.74) : withAlpha(colours.light.cardBackground, 0.94), padding: 10 }}>
        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase' }}>Chain intake</span>
              <span style={{ fontSize: 13, color: text, fontWeight: 900 }}>{selectedIntakeScenario.label}</span>
              <span style={{ fontSize: 11, color: subtle, lineHeight: 1.35 }}>{selectedIntakeScenario.summary}</span>
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ border: `1px solid ${withAlpha(intakeMissingFields.length === 0 ? subtle : accent, 0.26)}`, background: withAlpha(intakeMissingFields.length === 0 ? subtle : accent, 0.055), color: intakeMissingFields.length === 0 ? subtle : accent, padding: '3px 7px', fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
                {intakeFilledFields}/{intakeScenarioFields.length} fields
              </span>
              <button
                type="button"
                onClick={() => setIntakeOpen(false)}
                style={{ border: `1px solid ${cardBorder}`, background: cardControlSurface, color: subtle, padding: '3px 7px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Hide intake
              </button>
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {intakeSteps.map((step, index) => {
              const selected = step.key === activeIntakeStepDef.key;
              const missing = getIntakeStepRequiredFields(step, chain).filter((field) => !isPresent(chain[field]));
              const tone = missing.length === 0 ? subtle : selected ? accent : subtle;
              return (
                <button
                  key={`chain-intake-step-${step.key}`}
                  type="button"
                  onClick={() => setActiveIntakeStep(step.key)}
                  style={{ border: `1px solid ${selected ? withAlpha(accent, 0.46) : withAlpha(tone, 0.2)}`, background: selected ? withAlpha(accent, isDarkMode ? 0.12 : 0.06) : missing.length === 0 ? withAlpha(subtle, isDarkMode ? 0.05 : 0.035) : cardControlSurface, color: selected ? accent : tone, padding: '5px 8px', fontSize: 10, fontWeight: selected ? 900 : 750, textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: missing.length === 0 && !selected ? 0.62 : 1 }}
                >
                  <span>{index + 1}</span>
                  <span>{step.label}</span>
                  <Icon iconName={missing.length === 0 ? 'CheckMark' : 'CircleRing'} styles={{ root: { fontSize: 9 } }} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={togglePaymentStep}
              style={{ border: `1px solid ${includePaymentStep ? withAlpha(accent, 0.56) : cardBorder}`, background: includePaymentStep ? withAlpha(accent, isDarkMode ? 0.14 : 0.08) : cardControlSurface, color: includePaymentStep ? accent : text, padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Icon iconName={includePaymentStep ? 'CheckboxComposite' : 'Checkbox'} styles={{ root: { fontSize: 11 } }} />
              Payment record
            </button>
          </div>

          <div style={{ display: 'grid', gap: 5 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: text, fontWeight: 900 }}>{activeStepIndex + 1}. {activeIntakeStepDef.label}</span>
              <span style={{ fontSize: 10, color: activeMissingFields.length === 0 ? subtle : accent, fontWeight: 850, textTransform: 'uppercase' }}>
                {activeMissingFields.length === 0 ? 'Step ready' : `Needs ${activeMissingFields.length}`}
              </span>
            </span>
            <span style={{ fontSize: 11, color: subtle, lineHeight: 1.35 }}>{activeIntakeStepDef.summary}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {activeIntakeStepFields.map(renderFieldEditor)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10, color: intakeMissingFields.length > 0 ? accent : subtle, fontWeight: 800 }}>
              {intakeMissingFields.length > 0
                ? `Needs ${intakeMissingFields.slice(0, 5).map(fieldLabel).join(', ')}${intakeMissingFields.length > 5 ? '...' : ''}`
                : 'Ready to save this intake'}
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={startFresh}
                disabled={saving}
                style={{ border: `1px solid ${cardBorder}`, background: cardControlSurface, color: text, padding: '7px 9px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer' }}
              >
                New chain
              </button>
              <button
                type="button"
                onClick={toggleSpineOpen}
                aria-expanded={spineOpen}
                aria-controls="data-hub-attribution-spine-panel"
                style={{ border: `1px solid ${spineOpen ? withAlpha(accent, 0.56) : cardBorder}`, background: spineOpen ? withAlpha(accent, isDarkMode ? 0.14 : 0.08) : cardControlSurface, color: spineOpen ? accent : text, padding: '7px 9px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon iconName={spineOpen ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 11 } }} />
                {spineOpen ? 'Fold chain' : 'Reveal chain'}
              </button>
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={!canSaveIntake}
                style={{ border: 'none', background: canSaveIntake ? accent : withAlpha(accent, 0.3), color: '#ffffff', padding: '7px 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: canSaveIntake ? 'pointer' : 'default' }}
              >
                {saving ? 'Saving' : 'Save links'}
              </button>
            </span>
          </div>
        </div>
        <span style={{ fontSize: 10, color: subtle }}>
          {nextOpenStage ? `Next link to complete: ${nextOpenStage.label}.` : 'All required links have field coverage.'} The full business link map is available from this frame.
        </span>
      </div>
    );
  };

  const renderEntryChoice = () => (
    <div data-helix-region="reports/data-hub/attribution-workbench/entry" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 9 }}>
      <button
        type="button"
        onClick={startFresh}
        style={{ border: `1px solid ${withAlpha(accent, 0.5)}`, background: withAlpha(accent, isDarkMode ? 0.14 : 0.07), color: text, padding: 12, display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, textAlign: 'left', cursor: 'pointer', alignItems: 'start' }}
      >
        <Icon iconName="Add" styles={{ root: { fontSize: 18, color: accent, marginTop: 1 } }} />
        <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: text }}>Start new link path</span>
          <span style={{ fontSize: 11, color: subtle, lineHeight: 1.35 }}>Start clean and choose the business-link template.</span>
        </span>
      </button>
      <button
        type="button"
        onClick={inspectExistingJourney}
        style={{ border: `1px solid ${entryMode === 'inspect' || spineOpen ? withAlpha(accent, 0.5) : cardBorder}`, background: entryMode === 'inspect' || spineOpen ? withAlpha(accent, isDarkMode ? 0.12 : 0.055) : cardControlSurface, color: text, padding: 12, display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, textAlign: 'left', cursor: 'pointer', alignItems: 'start' }}
      >
        <Icon iconName="Search" styles={{ root: { fontSize: 17, color: entryMode === 'inspect' || spineOpen ? accent : subtle, marginTop: 1 } }} />
        <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: text }}>Check existing links</span>
          <span style={{ fontSize: 11, color: subtle, lineHeight: 1.35 }}>Open indexed enquiries and repair or lock existing links.</span>
        </span>
      </button>
    </div>
  );

  const renderScenarioPicker = () => (
    <div data-helix-region="reports/data-hub/attribution-workbench/scenarios" style={{ display: 'grid', gap: 9, border: `1px solid ${withAlpha(accent, 0.18)}`, background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.62) : withAlpha(colours.light.cardBackground, 0.94), padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase' }}>New link path</span>
          <span style={{ fontSize: 13, color: text, fontWeight: 900 }}>Choose a template</span>
        </span>
        <button
          type="button"
          onClick={() => setEntryMode('choice')}
          style={{ border: `1px solid ${cardBorder}`, background: cardControlSurface, color: subtle, padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Back
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
        {INTAKE_SCENARIOS.map((scenario) => (
          <button
            key={`chain-intake-scenario-${scenario.key}`}
            type="button"
            onClick={() => selectIntakeScenario(scenario.key)}
            style={{ border: `1px solid ${cardBorder}`, background: cardControlSurface, color: text, padding: 11, display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 9, textAlign: 'left', cursor: 'pointer', minWidth: 0, alignItems: 'start' }}
          >
            <Icon iconName={scenario.iconName} styles={{ root: { fontSize: 16, color: accent, marginTop: 1 } }} />
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900 }}>{scenario.label}</span>
              <span style={{ fontSize: 10, color: subtle, lineHeight: 1.35 }}>{scenario.summary}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderRecordDetailsEditor = (stage: StageDef, candidate: LookupCandidate | null, title = 'Row preview') => {
    const preview = (candidate?.preview || []).filter((item) => isPresent(item.label) && isPresent(item.value));
    if (preview.length === 0) return null;
    const detailsOpen = rowDetailsOpenByStage[stage.key] === true;
    const editOpen = rowDetailsEditByStage[stage.key] === true;
    const rawOpen = rowDetailsRawOpenByStage[stage.key] === true;
    const mappedCount = preview.filter((item) => resolvePreviewField(stage, item.label)).length;
    const summaryItems = preview.map((item, index) => {
      const mappedField = resolvePreviewField(stage, item.label);
      const value = mappedField && isPresent(chain[mappedField]) ? String(chain[mappedField] ?? '') : String(item.value ?? '');
      return { ...item, mappedField, value, key: `${item.label}__${index}` };
    });
    return (
      <div style={quietInsetStyle}>
        <button
          type="button"
          onClick={() => setRowDetailsOpenByStage((prev) => ({ ...prev, [stage.key]: !detailsOpen }))}
          style={{ border: `1px solid ${border}`, background: detailsOpen ? withAlpha(accent, isDarkMode ? 0.12 : 0.06) : quietPanel, color: detailsOpen ? accent : text, padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>{title}</span>
          <span style={{ fontSize: 10, color: detailsOpen ? accent : subtle, fontWeight: 800 }}>{detailsOpen ? 'Hide' : `${preview.length} details`}</span>
        </button>
        {detailsOpen && (
          <div style={{ border: `1px solid ${withAlpha(subtle, 0.15)}`, borderTop: 'none', background: quietPanel, display: 'grid', gap: 8, padding: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', gap: 2 }}>
                <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase' }}>Paper intake summary</span>
                <span style={{ fontSize: 10, color: subtle }}>{preview.length} values / {mappedCount} draft-linked</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setRowDetailsEditByStage((prev) => ({ ...prev, [stage.key]: !editOpen }))}
                  disabled={locked}
                  style={{ border: `1px solid ${editOpen ? withAlpha(accent, 0.42) : border}`, background: editOpen ? withAlpha(accent, isDarkMode ? 0.12 : 0.06) : fill, color: editOpen ? accent : text, padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: locked ? 'default' : 'pointer' }}
                >
                  {editOpen ? 'Close edit' : 'Edit details'}
                </button>
                <button
                  type="button"
                  onClick={() => setRowDetailsRawOpenByStage((prev) => ({ ...prev, [stage.key]: !rawOpen }))}
                  style={{ border: `1px solid ${rawOpen ? withAlpha(accent, 0.42) : border}`, background: rawOpen ? withAlpha(accent, isDarkMode ? 0.12 : 0.06) : fill, color: rawOpen ? accent : text, padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  {rawOpen ? 'Hide data' : 'Underlying data'}
                </button>
              </span>
            </div>
            <div className="dhaw-inline-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, maxHeight: 230, overflow: 'auto', border: `1px solid ${withAlpha(subtle, 0.12)}`, background: fill }}>
              {summaryItems.map((item) => {
                  const rowKey = item.key;
                  const mappedField = item.mappedField;
                  const selectOptions = mappedField ? getSelectOptions(mappedField) : null;
                  const mappedIsDateTime = mappedField ? DATE_TIME_FIELDS.has(mappedField) : false;
                  const mappedValue = mappedField
                    ? (isPresent(chain[mappedField]) ? String(chain[mappedField] ?? '') : String(item.value ?? ''))
                    : '';
                  const intakePitchSuggestion = stage.key === 'intake' && mappedField === 'pitch_id' && isPresent(chain.pitch_id)
                    ? String(chain.pitch_id)
                    : '';
                  const localValue = detailDraftByStage[stage.key]?.[rowKey] ?? String(item.value ?? '');
                  return (
                    <div key={`${candidate?.type || 'candidate'}-${candidate?.id || 'preview'}-${rowKey}-summary`} style={{ display: 'grid', gap: 4, padding: '7px 8px', borderBottom: `1px solid ${withAlpha(subtle, 0.11)}`, borderRight: `1px solid ${withAlpha(subtle, 0.08)}`, minWidth: 0, background: editOpen ? withAlpha(accent, isDarkMode ? 0.08 : 0.035) : 'transparent' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 9, color: subtle, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                        {editOpen && (mappedField
                          ? <span style={{ fontSize: 9, color: colours.green, fontWeight: 800, whiteSpace: 'nowrap' }}>draft field</span>
                          : <span style={{ fontSize: 9, color: subtle, fontWeight: 800, whiteSpace: 'nowrap' }}>local note</span>)}
                      </span>
                      {!editOpen ? (
                        <span style={{ fontSize: 11, color: text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
                      ) : mappedField ? (
                        selectOptions ? (
                          <select
                            value={mappedValue}
                            onChange={(event) => updateManualField(mappedField, event.target.value)}
                            disabled={locked}
                            style={{ width: '100%', minHeight: 30, border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 11, boxSizing: 'border-box' }}
                          >
                            <option value="">Unset</option>
                            {selectOptions.map((option) => <option key={`${rowKey}-${option}`} value={option}>{option}</option>)}
                          </select>
                        ) : mappedIsDateTime ? (
                          <input
                            type="datetime-local"
                            value={formatDateTimeInputValue(mappedValue)}
                            onChange={(event) => updateManualField(mappedField, parseDateTimeInputValue(event.target.value))}
                            disabled={locked}
                            style={{ width: '100%', minHeight: 30, border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 11, boxSizing: 'border-box' }}
                          />
                        ) : (
                          <input
                            value={mappedValue}
                            onChange={(event) => updateManualField(mappedField, event.target.value)}
                            disabled={locked}
                            style={{ width: '100%', minHeight: 30, border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 11, boxSizing: 'border-box' }}
                          />
                        )
                      ) : (
                        <input
                          value={localValue}
                          onChange={(event) => updateDetailDraftField(stage.key, rowKey, event.target.value)}
                          disabled={locked}
                          style={{ width: '100%', minHeight: 30, border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 11, boxSizing: 'border-box' }}
                        />
                      )}
                      {intakePitchSuggestion && (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 10, color: subtle }}>
                          <span>
                            Identified pitch suggestion: <strong style={{ color: text }}>{intakePitchSuggestion}</strong>
                          </span>
                          {mappedValue !== intakePitchSuggestion && (
                            <button
                              type="button"
                              onClick={() => updateManualField('pitch_id', intakePitchSuggestion)}
                              disabled={locked}
                              style={{ border: `1px solid ${border}`, background: panel, color: text, padding: '3px 7px', fontSize: 10, fontWeight: 800, cursor: locked ? 'default' : 'pointer' }}
                            >
                              Use identified pitch
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
            {rawOpen && (
              <div className="dhaw-inline-scroll" style={{ display: 'grid', gap: 1, maxHeight: 220, overflow: 'auto', border: `1px solid ${withAlpha(subtle, 0.12)}`, background: fill }}>
                {preview.map((item, index) => (
                  <div key={`${candidate?.type || 'candidate'}-${candidate?.id || 'preview'}-${item.label}-${index}-raw`} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.35fr) minmax(0, 1fr)', gap: 8, padding: '6px 8px', borderBottom: `1px solid ${withAlpha(subtle, 0.1)}` }}>
                    <span style={{ fontSize: 10, color: subtle, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                    <span style={{ fontSize: 10, color: text, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{String(item.value ?? '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
      {STAGES.map((stage, index) => {
        const fields = [stage.anchorField, ...stage.detailFields];
        const collectedBlocked = stage.key === 'collected' && !isPresent(chain.matter_id);
        const filled = collectedBlocked ? [] : fields.filter((field) => isPresent(chain[field]));
        const previewComplete = !collectedBlocked && filled.length === fields.length;
        const previewActive = stage.key === currentStage.key && !previewComplete;
        return (
          <div key={`preview-checklist-${stage.key}`} style={{ borderTop: index === 0 ? 'none' : `1px solid ${quietEdge}`, paddingTop: index === 0 ? 0 : 8, display: 'grid', gap: 6, opacity: previewComplete ? 0.58 : 1 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: previewActive ? text : subtle, fontSize: 11, fontWeight: 850 }}>
              <span>{stage.label}</span>
              <span style={{ color: previewComplete ? subtle : filled.length > 0 ? accent : subtle }}>{filled.length}/{fields.length}</span>
            </span>
            {collectedBlocked && (
              <span style={{ fontSize: 10, color: subtle }}>Waiting for matter id</span>
            )}
            <div style={{ display: 'grid', gap: 4 }}>
              {fields.map((field) => {
                const populated = !collectedBlocked && isPresent(chain[field]);
                return (
                  <span key={`preview-checklist-${stage.key}-${String(field)}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 6, alignItems: 'start', fontSize: 10, color: populated ? subtle : text, opacity: populated ? 0.68 : 1 }}>
                    <Icon iconName={populated ? 'CompletedSolid' : 'CircleRing'} styles={{ root: { fontSize: 10, marginTop: 2 } }} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ color: populated ? subtle : text }}>{fieldLabel(field)}</strong>
                      {populated && <span style={{ color: subtle }}> {String(chain[field])}</span>}
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

  const renderEnquirySelectionPrompt = (surface: 'workflow' | 'preview') => {
    const isWorkflow = surface === 'workflow';
    return (
      <div className={`dhaw-selection-empty dhaw-selection-empty--${surface}`} style={{ border: `1px solid ${cardBorder}`, background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.22) : withAlpha(colours.light.cardBackground, 0.92), boxShadow: isWorkflow ? cardShadow : 'none' }}>
        <span className="dhaw-selection-empty-icon" style={{ color: accent }}>
          <Icon iconName={isWorkflow ? 'Search' : 'CircleRing'} styles={{ root: { fontSize: isWorkflow ? 24 : 20 } }} />
        </span>
        <span className="dhaw-selection-empty-title" style={{ color: text }}>
          {isWorkflow ? 'Select an enquiry to open links' : 'Link checklist appears after selection'}
        </span>
        <span className="dhaw-selection-empty-copy" style={{ color: subtle }}>
          {isWorkflow ? 'Pick an indexed enquiry, or start a new link path and choose the enquiry template.' : 'The preview stays quiet until an enquiry id is selected.'}
        </span>
        <button
          type="button"
          onClick={() => setLeftPaneOpen(true, 'manual')}
          style={{ border: `1px solid ${withAlpha(accent, 0.42)}`, background: withAlpha(accent, isDarkMode ? 0.12 : 0.06), color: accent, padding: '7px 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Open enquiry list
        </button>
      </div>
    );
  };

  const renderStageSection = (stage: StageDef) => {
    const progress = stageProgress(stage);
    const complete = progress.state === 'ready';
    const partial = progress.state === 'partial';
    const stageCandidates = candidatesByStage[stage.key] || [];
    const activeCandidate = activeCandidatesByStage[stage.key] || null;
    const fields = [stage.anchorField, ...stage.detailFields];
    const selectedIntakeEvidenceField = INTAKE_EVIDENCE_FIELD_BY_TYPE[String(chain.intake_type || '').trim().toLowerCase()];
    const visibleFields = fields.filter((field) => !INTAKE_EVIDENCE_FIELDS.includes(field) || !selectedIntakeEvidenceField || field === selectedIntakeEvidenceField);
    const requiredFields = visibleFields.filter((field) => stage.requiredFields.includes(field));
    const supportingFields = visibleFields.filter((field) => !stage.requiredFields.includes(field));
    const supportingOpen = supportingFieldsOpenByStage[stage.key] === true;
    const supportingFilled = supportingFields.filter((field) => isPresent(chain[field])).length;
    const stageDirty = !locked && fields.some((field) => comparableValue(chain[field]) !== comparableValue(persistedChain[field]));
    const expanded = expandedStages[stage.key] === true;
    const collectedBlocked = stage.key === 'collected' && !isPresent(chain.matter_id);
    const stageNeedsAttention = stageDirty || partial || (!complete && stage.key === currentStage.key && !collectedBlocked);
    const stageTone = stageNeedsAttention ? accent : subtle;
    const statusLabel = collectedBlocked ? 'waiting' : complete ? 'complete' : partial ? `${progress.total - progress.filled} needed` : 'open';
    const stageSummary = collectedBlocked
      ? 'Matter id required'
      : `${progress.filled}/${progress.total} fields filled${activeCandidate ? ` / ${activeCandidate.title}` : ''}`;
    return (
      <section key={stage.key} style={{ border: `1px solid ${withAlpha(stageTone, stageNeedsAttention ? 0.38 : complete ? 0.12 : 0.16)}`, borderLeft: `${stageNeedsAttention ? 3 : 2}px solid ${withAlpha(stageTone, stageNeedsAttention ? 0.74 : 0.34)}`, background: stageNeedsAttention ? withAlpha(accent, isDarkMode ? 0.1 : 0.045) : complete ? withAlpha(subtle, isDarkMode ? 0.035 : 0.025) : panel, display: 'grid', overflow: 'hidden', opacity: complete && !expanded ? 0.62 : 1, transition: 'opacity 160ms ease, border-color 160ms ease, background-color 160ms ease' }}>
        <button
          type="button"
          onClick={() => setExpandedStages((prev) => (prev[stage.key] ? {} : { [stage.key]: true }))}
          aria-expanded={expanded}
          style={{ border: 'none', background: 'transparent', color: text, padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start', textAlign: 'left', cursor: 'pointer' }}
        >
          <span style={{ display: 'grid', gap: 5, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Icon iconName={expanded ? 'ChevronDown' : 'ChevronRight'} styles={{ root: { fontSize: 11, color: stageTone, flex: '0 0 auto' } }} />
              <span style={{ fontSize: 11, fontWeight: 850, color: stageNeedsAttention ? stageTone : subtle, whiteSpace: 'nowrap' }}>{stage.label}</span>
              <span style={{ height: 1, flex: 1, background: withAlpha(stageTone, stageNeedsAttention ? 0.18 : 0.1), minWidth: 14 }} />
            </span>
            <span style={{ fontSize: 10, color: subtle, lineHeight: 1.25 }}>{stageSummary}</span>
          </span>
          <span style={{ display: 'grid', gap: 4, justifyItems: 'end', alignSelf: 'start' }}>
            <span style={{ border: `1px solid ${withAlpha(stageTone, stageNeedsAttention ? 0.34 : 0.18)}`, background: withAlpha(stageTone, stageNeedsAttention ? 0.08 : 0.035), padding: '3px 7px', fontSize: 9, fontWeight: 900, color: stageTone, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              {statusLabel}
            </span>
            {stageDirty && (
              <span style={{ border: `1px solid ${withAlpha(pendingTone, 0.34)}`, background: withAlpha(pendingTone, 0.08), padding: '2px 6px', fontSize: 9, fontWeight: 900, color: pendingTone, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                pending save
              </span>
            )}
          </span>
        </button>

        {expanded && (
          <div style={{ borderTop: `1px solid ${withAlpha(stageTone, stageNeedsAttention ? 0.18 : 0.1)}`, padding: 10, display: 'grid', gap: 9, background: inset }}>
            {requiredFields.length > 0 && (
              <div className="dhaw-stage-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8 }}>
                {requiredFields.map(renderFieldEditor)}
              </div>
            )}

            {supportingFields.length > 0 && (
              <div style={{ border: `1px solid ${withAlpha(subtle, 0.16)}`, background: quietPanel, display: 'grid' }}>
                <button
                  type="button"
                  onClick={() => setSupportingFieldsOpenByStage((prev) => ({ ...prev, [stage.key]: !supportingOpen }))}
                  style={{ border: 'none', background: 'transparent', color: text, padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: 10, color: subtle, fontWeight: 900, textTransform: 'uppercase' }}>Supporting fields</span>
                    <span style={{ fontSize: 10, color: subtle }}>{supportingFilled}/{supportingFields.length} filled</span>
                  </span>
                  <span style={{ fontSize: 10, color: supportingOpen ? accent : subtle, fontWeight: 900, textTransform: 'uppercase' }}>{supportingOpen ? 'Hide' : 'Reveal'}</span>
                </button>
                {supportingOpen && (
                  <div className="dhaw-stage-grid" style={{ borderTop: `1px solid ${withAlpha(subtle, 0.14)}`, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 7 }}>
                    {supportingFields.map(renderFieldEditor)}
                  </div>
                )}
              </div>
            )}

            {renderRecordDetailsEditor(stage, activeCandidate, `${stage.label} row details`)}

            {stage.key === 'intake' && callIntakeEnabled && (
              <div data-helix-region="reports/data-hub/intake-call-picker" style={quietInsetStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: text }}>Incoming call intake submissions</span>
                  <button
                    type="button"
                    onClick={() => void loadCallIntakeCandidates()}
                    disabled={callIntakeLoading || locked}
                    style={{ border: `1px solid ${border}`, background: callIntakeLoading || locked ? withAlpha(accent, 0.18) : panel, color: text, padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: callIntakeLoading || locked ? 'default' : 'pointer' }}
                  >
                    {callIntakeLoading ? 'Loading' : 'Refresh calls'}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: subtle }}>
                  {chain.enquiry_id ? `Prioritising enquiry ${chain.enquiry_id} and recent unlinked call intakes.` : 'Showing recent external call intake submissions.'}
                </span>
                {callIntakeError && <span style={{ fontSize: 11, color: colours.red, fontWeight: 800 }}>{callIntakeError}</span>}
                {!callIntakeLoading && !callIntakeError && callIntakeCandidates.length === 0 && (
                  <span style={{ fontSize: 11, color: subtle }}>No incoming call intake submissions found.</span>
                )}
                {callIntakeCandidates.length > 0 && (
                  <div className="dhaw-inline-scroll" style={{ display: 'grid', gap: 6, maxHeight: 320, overflow: 'auto', paddingRight: 2 }}>
                    {callIntakeCandidates.map((candidate) => (
                      <button
                        key={`call-intake-${candidate.id}`}
                        type="button"
                        onClick={() => applyCandidate(candidate)}
                        disabled={locked}
                        title={candidate.subtitle || candidate.title}
                        style={{ borderStyle: 'solid', borderWidth: '0 0 0 3px', borderColor: chain.call_id === candidate.patch.call_id ? colours.green : accent, background: chain.call_id === candidate.patch.call_id ? withAlpha(colours.green, isDarkMode ? 0.1 : 0.055) : quietPanel, color: text, padding: '7px 8px', display: 'grid', gap: 3, textAlign: 'left', cursor: locked ? 'default' : 'pointer' }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 900 }}>{candidate.title}</span>
                        <span style={{ fontSize: 10, color: subtle, lineHeight: 1.3 }}>{candidate.subtitle || 'Call intake metadata unavailable'}</span>
                        {(candidate.preview || []).length > 0 && (
                          <span style={{ fontSize: 10, color: subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {candidate.preview?.slice(0, 4).map((item) => `${item.label} ${item.value}`).join(' / ')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            )}
            {stage.key === 'source' && (
          <div style={{ ...quietInsetStyle, borderTop: `1px solid ${withAlpha(accent, 0.16)}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: text }}>Source verification</span>
                <span style={{ fontSize: 10, color: subtle }}>{chain.enquiry_id ? `Checks CallRail evidence for enquiry ${chain.enquiry_id}.` : 'Pick an enquiry before checking source evidence.'}</span>
              </span>
              <button
                type="button"
                onClick={() => void runSourceCheck()}
                disabled={checkingSource || !chain.enquiry_id || locked}
                style={{ border: `1px solid ${border}`, background: checkingSource || !chain.enquiry_id || locked ? withAlpha(accent, 0.18) : accent, color: checkingSource || !chain.enquiry_id || locked ? text : '#ffffff', padding: '6px 9px', fontSize: 11, fontWeight: 900, cursor: checkingSource || !chain.enquiry_id || locked ? 'default' : 'pointer' }}
              >
                {checkingSource ? 'Checking' : sourceCheck ? 'Recheck' : 'Check'}
              </button>
            </div>
            {sourceCheck && (
              <div style={{ border: `1px solid ${withAlpha(sourceCheck.decision?.suggestedSource ? colours.green : progressTone, 0.28)}`, background: withAlpha(sourceCheck.decision?.suggestedSource ? colours.green : progressTone, isDarkMode ? 0.09 : 0.045), padding: '8px 9px', display: 'grid', gap: 5 }}>
                {sourceCheck.decision && (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 900, color: sourceCheck.decision.suggestedSource ? colours.green : progressTone }}>
                      {sourceCheck.decision.recommendation || 'No CallRail recommendation'}
                    </span>
                    <span style={{ fontSize: 10, color: subtle }}>
                      {sourceCheck.decision.suggestionReason || 'No decision reason returned.'}
                    </span>
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[
                        `${sourceCheck.count || 0} checked`,
                        `paid ${sourceCheck.decision.paidSignals || 0}`,
                        `organic ${sourceCheck.decision.organicSignals || 0}`,
                        `unknown ${sourceCheck.decision.unknownSignals || 0}`,
                      ].map((label) => (
                        <span key={`source-check-${label}`} style={{ border: `1px solid ${withAlpha(subtle, 0.2)}`, background: fill, color: subtle, padding: '2px 6px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>
                          {label}
                        </span>
                      ))}
                    </span>
                  </>
                )}
                {(sourceCheck.evidence || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSourceEvidenceOpen((current) => !current)}
                    style={{ border: `1px solid ${border}`, background: fill, color: text, padding: '6px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', justifySelf: 'start' }}
                  >
                    {sourceEvidenceOpen ? 'Hide evidence' : `Show ${Math.min((sourceCheck.evidence || []).length, 3)} evidence row${Math.min((sourceCheck.evidence || []).length, 3) === 1 ? '' : 's'}`}
                  </button>
                )}
                {sourceEvidenceOpen && (sourceCheck.evidence || []).slice(0, 3).map((item, index) => (
                  <div key={`${item.id || 'call'}-${index}`} style={quietRowStyle}>
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
          <div style={quietInsetStyle}>
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
                  {pitchStreamCandidates.length === 0 && (
                    <span style={{ fontSize: 11, color: subtle }}>
                      {chain.enquiry_id || chain.instruction_ref
                        ? 'No linked pitch candidates for this enquiry or instruction yet. Use Search pitches to widen the lookup.'
                        : 'No pitch candidates loaded yet.'}
                    </span>
                  )}
                  {pitchStreamCandidates.slice(0, 6).map((candidate) => (
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
          </div>
        )}
      </section>
    );
  };

  const renderCandidateButton = (candidate: LookupCandidate, tone: 'recent' | 'search', ordinal = 0) => {
    const enquiryId = String(candidate.patch.enquiry_id || candidate.id || '').trim();
    const chainRow = tone === 'recent' && candidate.type === 'enquiry' ? chainsByEnquiryId[enquiryId] : null;
    const streamLockedAt = chainRow?.attribution_locked_at || null;
    const streamLockedBy = chainRow?.attribution_locked_by || null;
    const lockParts = formatLockDateParts(streamLockedAt);
    const isStreamLocked = isPresent(streamLockedAt);
    const spineStatus = tone === 'recent' && candidate.type === 'enquiry' ? getSpineStatus(candidate) : null;
    const reviewed = isStreamLocked;
    const readyToLock = !reviewed && spineStatus?.state === 'complete';
    const statusColour = reviewed ? subtle : spineStatus?.state === 'complete' || spineStatus?.state === 'partial' ? accent : subtle;
    const spineStatusLabel = readyToLock ? 'Ready to lock' : spineStatus?.label;
    return (
      <button
        key={`${tone}-${candidate.type}-${candidate.id}-${ordinal}`}
        type="button"
        onClick={() => applyCandidate(candidate)}
        disabled={locked}
        style={{
          border: `1px solid ${chain.enquiry_id === candidate.patch.enquiry_id ? withAlpha(accent, 0.52) : border}`,
          borderLeft: `3px solid ${reviewed ? withAlpha(subtle, 0.42) : (readyToLock || spineStatus?.state === 'partial') ? accent : tone === 'recent' ? withAlpha(subtle, 0.7) : accent}`,
          background: reviewed ? withAlpha(subtle, isDarkMode ? 0.055 : 0.028) : readyToLock ? withAlpha(accent, isDarkMode ? 0.08 : 0.04) : chain.enquiry_id === candidate.patch.enquiry_id ? withAlpha(accent, 0.09) : fill,
          color: text,
          textAlign: 'left',
          padding: 0,
          display: 'grid',
          gap: 0,
          cursor: locked ? 'default' : 'pointer',
        }}
      >
        <span style={{ padding: '8px 9px', display: 'grid', gap: 5 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 900 }}>{candidate.title}</span>
            {reviewed ? (
              <span style={{ border: `1px solid ${withAlpha(subtle, 0.2)}`, background: withAlpha(subtle, 0.045), color: subtle, padding: '2px 6px', fontSize: 9, fontWeight: 850, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Reviewed
              </span>
            ) : spineStatus && (
              <span style={{ border: `1px solid ${withAlpha(statusColour, 0.42)}`, background: withAlpha(statusColour, 0.1), color: statusColour, padding: '2px 5px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {spineStatusLabel}
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: subtle, lineHeight: 1.3 }}>{candidate.subtitle || 'No source evidence yet'}</span>
        </span>

        {(isStreamLocked || (spineStatus && spineStatus.state !== 'missing')) && (
          <span style={{ borderTop: `1px solid ${withAlpha(reviewed ? subtle : readyToLock ? accent : subtle, reviewed || readyToLock ? 0.18 : 0.12)}`, background: reviewed ? withAlpha(subtle, isDarkMode ? 0.06 : 0.035) : readyToLock ? withAlpha(accent, isDarkMode ? 0.08 : 0.045) : withAlpha(subtle, 0.04), padding: '7px 9px', display: 'grid', gap: 5 }}>
            {isStreamLocked && (
              <span style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr)', gap: 6, alignItems: 'start', color: subtle }}>
                <Icon iconName="LockSolid" styles={{ root: { fontSize: 12, marginTop: 1, color: subtle } }} />
                <span style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Lock review complete</span>
                  <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ border: `1px solid ${withAlpha(lockTone, 0.3)}`, background: withAlpha(lockTone, 0.08), color: text, padding: '2px 5px', fontSize: 10, fontWeight: 900, lineHeight: 1.1 }}>
                      {streamLockedBy || 'Unknown'}
                    </span>
                    {lockParts.day && (
                      <span style={{ border: `1px solid ${withAlpha(subtle, 0.2)}`, background: withAlpha(subtle, 0.055), color: subtle, padding: '2px 5px', fontSize: 10, fontWeight: 800, lineHeight: 1.1 }}>
                        {lockParts.day}
                      </span>
                    )}
                    {lockParts.time && (
                      <span style={{ border: `1px solid ${withAlpha(subtle, 0.2)}`, background: withAlpha(subtle, 0.055), color: subtle, padding: '2px 5px', fontSize: 10, fontWeight: 800, lineHeight: 1.1 }}>
                        {lockParts.time}
                      </span>
                    )}
                  </span>
                </span>
              </span>
            )}
            {spineStatus && spineStatus.state !== 'missing' && (
              <span style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr)', gap: 6, alignItems: 'start', fontSize: 10, color: subtle, lineHeight: 1.25 }}>
                <Icon iconName={reviewed ? 'CompletedSolid' : 'ProgressRingDots'} styles={{ root: { fontSize: 11, marginTop: 1, color: reviewed ? lockTone : statusColour } }} />
                <span>{spineStatus.readyStages}/{STAGES.length} links ready / {spineStatus.filledFields}/{spineStatus.totalFields} fields filled</span>
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  const intakeTray = intakeOpen
    ? renderIntakeTray()
    : entryMode === 'new'
      ? renderScenarioPicker()
      : renderEntryChoice();
  const processingLabel = saving
    ? savingLabel || 'Saving draft'
    : searching
      ? 'Searching links'
      : checkingSource
        ? 'Checking source evidence'
        : bulkSourceRunning
          ? `Checking selected ${bulkSourceProgress ? `${bulkSourceProgress.done}/${bulkSourceProgress.total}` : ''}`
        : checkingPitch
          ? 'Checking deal links'
          : pitchLoading
            ? 'Searching pitches'
            : callIntakeLoading
              ? 'Refreshing call intakes'
              : loading
                ? 'Loading journeys'
                : null;
  const statusText = error || processingLabel || message;
  const statusTone = error ? 'error' : processingLabel ? 'processing' : message ? 'success' : 'idle';
  const spineShellClassName = [
    'dhaw-spine-shell',
    enquiryRailOpen ? 'dhaw-spine-shell--left-open' : 'dhaw-spine-shell--left-folded',
    previewPaneOpen ? 'dhaw-spine-shell--right-open' : 'dhaw-spine-shell--right-folded',
  ].join(' ');

  return (
    <section
      data-helix-region="reports/data-hub/attribution-workbench"
      style={{
        background: cardSurface,
        border: `1px solid ${cardBorder}`,
        borderRadius: 0,
        boxShadow: cardShadow,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'grid', gap: 16, alignItems: 'center', padding: '18px 20px' }}>
        <div style={{ display: 'grid', gap: 9, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: accent }}>
            Business links
          </span>
          <span style={{ fontSize: 20, lineHeight: 1.16, fontWeight: 900, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            Indexed business link map
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', fontWeight: 700 }}>
            <span>{completeCount}/{STAGES.length} links ready</span>
            <span style={{ opacity: 0.65 }}>/</span>
            <span>{recentEnquiries.length.toLocaleString('en-GB')} enquiries indexed</span>
            <span style={{ opacity: 0.65 }}>/</span>
            <span>{spineStatusLabel}</span>
          </span>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ height: 5, background: isDarkMode ? withAlpha(colours.dark.borderColor, 0.36) : withAlpha(colours.subtleGrey, 0.18), overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${spineReadyPercent}%`, background: completeCount === STAGES.length ? lockTone : progressTone, transition: 'width 180ms ease' }} />
            </div>
            {intakeTray}
          </div>
        </div>
      </div>

      {spineOpen && (
        <div
          id="data-hub-attribution-spine-panel"
          data-helix-region="reports/data-hub/attribution-workbench/spine"
          className={spineShellClassName}
          style={{
            borderTop: `1px solid ${cardBorder}`,
            background: panel,
          }}
        >
      <aside className={`dhaw-side-pane dhaw-left-pane ${enquiryRailOpen ? 'dhaw-side-pane--open' : 'dhaw-side-pane--folded'}`} style={{ borderRight: `1px solid ${border}`, background: panel }}>
          <button
            type="button"
            onClick={() => setLeftPaneOpen(!enquiryRailOpen, 'manual')}
            title={enquiryRailOpen ? 'Close enquiry list' : 'Open enquiry list'}
            aria-expanded={enquiryRailOpen}
            className="dhaw-pane-toggle"
            style={{ border: `1px solid ${border}`, background: fill, color: enquiryRailOpen ? subtle : accent }}
          >
            <Icon iconName={enquiryRailOpen ? 'ChevronLeft' : 'ChevronRight'} styles={{ root: { fontSize: 12 } }} />
            <span className="dhaw-pane-toggle-label">{enquiryRailOpen ? 'Close list' : 'Open list'}</span>
          </button>
          <div className="dhaw-pane-content" aria-hidden={!enquiryRailOpen} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void search(); }}
                placeholder="Search links"
                style={{ border: `1px solid ${border}`, background: fill, color: text, minHeight: 32, padding: '6px 8px', fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => void search()}
                disabled={searching || !query.trim()}
                title="Search"
                style={{ border: 'none', background: searching || !query.trim() ? withAlpha(accent, 0.34) : accent, color: '#ffffff', minWidth: 34, fontSize: 11, fontWeight: 900, cursor: searching || !query.trim() ? 'default' : 'pointer' }}
              >
                {searching ? '...' : <Icon iconName="Search" styles={{ root: { fontSize: 12 } }} />}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <button
                type="button"
                onClick={() => setEnquiryRailPinned((prev) => !prev)}
                style={{ border: `1px solid ${enquiryRailPinned ? withAlpha(accent, 0.5) : border}`, background: enquiryRailPinned ? withAlpha(accent, 0.1) : fill, color: enquiryRailPinned ? accent : subtle, padding: '4px 7px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
              >
                {enquiryRailPinned ? 'Pinned' : 'Pin'}
              </button>
              <span style={{ display: 'flex', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => setHideReviewed((prev) => !prev)}
                  title="Hide reviewed locked or complete enquiries"
                  style={{ border: `1px solid ${hideReviewed ? withAlpha(lockTone, 0.42) : border}`, background: hideReviewed ? withAlpha(lockTone, 0.1) : fill, color: hideReviewed ? lockTone : subtle, padding: '4px 7px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Reviewed
                </button>
              </span>
            </div>
            <div style={{ border: `1px solid ${selectedVisibleEnquiries.length ? withAlpha(accent, 0.34) : border}`, background: selectedVisibleEnquiries.length ? withAlpha(accent, isDarkMode ? 0.1 : 0.05) : fill, padding: 7, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: selectedVisibleEnquiries.length ? accent : subtle, fontWeight: 900, textTransform: 'uppercase' }}>
                    Bulk CallRail: {selectedVisibleEnquiries.length.toLocaleString('en-GB')} selected
                  </span>
                  <span style={{ fontSize: 9, color: subtle, fontWeight: 750 }}>
                    Shift selects a range. Ctrl/Cmd toggles one row.
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setAllVisibleEnquiriesSelected(selectedVisibleEnquiries.length !== visibleRecentEnquiries.length)}
                    disabled={bulkSourceRunning || visibleRecentEnquiries.length === 0}
                    style={{ border: `1px solid ${border}`, background: fill, color: text, padding: '4px 7px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: bulkSourceRunning || visibleRecentEnquiries.length === 0 ? 'default' : 'pointer' }}
                  >
                    {selectedVisibleEnquiries.length === visibleRecentEnquiries.length && visibleRecentEnquiries.length > 0 ? 'Clear' : 'Select visible'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSelectedSourceChecksAndSave()}
                    disabled={bulkSourceRunning || selectedVisibleEnquiries.length === 0 || tableReady === false}
                    title="Run CallRail source check and save for selected enquiries from top to bottom"
                    style={{ border: 'none', background: bulkSourceRunning || selectedVisibleEnquiries.length === 0 || tableReady === false ? withAlpha(accent, 0.32) : accent, color: '#ffffff', padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: bulkSourceRunning || selectedVisibleEnquiries.length === 0 || tableReady === false ? 'default' : 'pointer' }}
                  >
                    {bulkSourceRunning ? (bulkSourceProgress ? `${bulkSourceProgress.done}/${bulkSourceProgress.total}` : 'Running') : 'Run selected'}
                  </button>
                </span>
              </div>
            </div>
            <div className="dhaw-preview-scroll" style={{ display: 'grid', gap: 6, overflow: 'auto', flex: 1, minHeight: 0, alignContent: 'start' }}>
              {candidates.length > 0 && candidates.filter((candidate) => candidate.type !== 'source').slice(0, 10).map((candidate, index) => renderCandidateButton(candidate, 'search', index))}
              {hideReviewed && hiddenReviewedCount > 0 && <span style={{ fontSize: 10, color: subtle }}>Hiding {hiddenReviewedCount} reviewed.</span>}
              {loading && <span style={{ fontSize: 11, color: subtle }}>Loading</span>}
              {!loading && recentEnquiries.length === 0 && <span style={{ fontSize: 11, color: subtle }}>No enquiries.</span>}
              {!loading && recentEnquiries.length > 0 && visibleRecentEnquiries.length === 0 && <span style={{ fontSize: 11, color: subtle }}>All reviewed.</span>}
              {visibleRecentEnquiries.map((candidate, index) => {
                const selectionKey = getCandidateSelectionKey(candidate);
                const selected = selectedEnquiryKeys.has(selectionKey);
                return (
                  <div key={`recent-select-${selectionKey}-${index}`} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 6, alignItems: 'stretch' }}>
                    <label title={selected ? 'Remove from bulk CallRail run' : 'Add to bulk CallRail run'} style={{ border: `1px solid ${selected ? withAlpha(accent, 0.5) : border}`, background: selected ? withAlpha(accent, isDarkMode ? 0.14 : 0.08) : fill, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: bulkSourceRunning ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={bulkSourceRunning}
                        onChange={() => {}}
                        onClick={(event) => toggleEnquirySelection(candidate, index, event)}
                        aria-label={`Select enquiry ${getCandidateEnquiryId(candidate) || index + 1} for bulk CallRail check`}
                      />
                    </label>
                    {renderCandidateButton(candidate, 'recent', index)}
                  </div>
                );
              })}
            </div>
          </div>
      </aside>

      <main className="dhaw-preview-scroll dhaw-workbench-main" style={{ padding: 12, display: 'grid', gap: 10, alignContent: 'start', overflow: 'auto', minHeight: 0 }}>
        {statusText && (
          <div className={`dhaw-status-strip dhaw-status-strip--${statusTone}`} style={{ border: `1px solid ${error ? withAlpha(colours.cta, 0.42) : processingLabel ? withAlpha(accent, 0.36) : withAlpha(colours.green, 0.36)}`, background: error ? withAlpha(colours.cta, 0.08) : processingLabel ? withAlpha(accent, isDarkMode ? 0.12 : 0.065) : withAlpha(colours.green, 0.07), color: error ? colours.cta : processingLabel ? accent : colours.green }}>
            {processingLabel && <span className="dhaw-processing-pulse" style={{ backgroundColor: accent }} />}
            <span>{statusText}</span>
          </div>
        )}

        {tableReady === false && (
          <div style={{ border: `1px solid ${withAlpha(colours.orange, 0.38)}`, background: withAlpha(colours.orange, 0.08), color: isDarkMode ? '#fbbf24' : '#92400e', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
            The attribution table is not available yet. Run tools/db/migrate-marketing-attribution-chain.sql before saving the first chain row.
          </div>
        )}

        {lookupWarnings.length > 0 && (
          <div style={{ border: `1px solid ${withAlpha(colours.orange, 0.32)}`, background: withAlpha(colours.orange, 0.06), color: isDarkMode ? '#fbbf24' : '#92400e', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
            Some lookup sources were unavailable: {lookupWarnings.join('; ')}
          </div>
        )}

        {!hasSelectedEnquiry ? renderEnquirySelectionPrompt('workflow') : (
          <div className="dhaw-workflow-live">
            <div className="dhaw-workflow-block dhaw-process-strip" style={{ border: `1px solid ${withAlpha(accent, 0.14)}`, background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.2) : withAlpha(colours.light.cardBackground, 0.9), padding: 10 }}>
              <div className="dhaw-process-strip-head">
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: subtle, fontWeight: 850 }}>Current</span>
                  <span style={{ fontSize: 13, color: text, fontWeight: 850, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentStage.label}</span>
                </span>
                <span style={{ color: accent, fontSize: 10, fontWeight: 850, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {spineReadyPercent}% ready
                </span>
              </div>
              <div className="dhaw-process-track" style={{ background: withAlpha(subtle, isDarkMode ? 0.14 : 0.1) }}>
                <span style={{ display: 'block', height: '100%', width: `${spineReadyPercent}%`, background: accent, transition: 'width 180ms ease' }} />
              </div>
              <div className="dhaw-stage-tabs">
                {STAGES.map((stage) => {
                  const progress = stageProgress(stage);
                  const selected = stage.key === currentStage.key;
                  const ready = progress.state === 'ready';
                  const tone = selected && !ready ? accent : subtle;
                  return (
                    <button
                      key={`stage-rail-${stage.key}`}
                      type="button"
                      onClick={() => focusStage(stage.key)}
                      title={`${stage.label}: ${progress.filled}/${progress.total}`}
                      className="dhaw-stage-tab"
                      style={{ border: `1px solid ${withAlpha(tone, selected ? 0.34 : 0.12)}`, background: selected && !ready ? withAlpha(accent, isDarkMode ? 0.12 : 0.06) : ready ? withAlpha(subtle, isDarkMode ? 0.05 : 0.035) : fill, color: tone, fontWeight: selected && !ready ? 900 : 750, opacity: ready ? 0.58 : 1 }}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="dhaw-workflow-block" style={{ display: 'grid', gap: 9 }}>
              {STAGES.map(renderStageSection)}
            </div>
          </div>
        )}
      </main>

      <aside className={`dhaw-side-pane dhaw-right-pane ${previewPaneOpen ? 'dhaw-side-pane--open' : 'dhaw-side-pane--folded'}`} style={{ borderLeft: `1px solid ${border}`, background: panel }}>
        <button
          type="button"
          onClick={() => setRightPaneOpen(!previewPaneOpen)}
          title={previewPaneOpen ? 'Fold preview' : 'Open preview'}
          aria-expanded={previewPaneOpen}
          className="dhaw-pane-toggle dhaw-pane-toggle--right"
          style={{ border: `1px solid ${border}`, background: fill, color: previewPaneOpen ? subtle : accent }}
        >
          <Icon iconName={previewPaneOpen ? 'ChevronRight' : 'ChevronLeft'} styles={{ root: { fontSize: 12 } }} />
          <span className="dhaw-pane-toggle-label">{previewPaneOpen ? 'Fold preview' : 'Open preview'}</span>
        </button>
        <div className="dhaw-pane-content" aria-hidden={!previewPaneOpen} style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        {!hasSelectedEnquiry ? renderEnquirySelectionPrompt('preview') : (
          <div className="dhaw-preview-live">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(['checklist', 'json'] as PreviewMode[]).map((mode) => (
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

            <div className="dhaw-preview-scroll" style={{ margin: 0, border: `1px solid ${border}`, background: inset, color: text, padding: 10, fontSize: 11, lineHeight: 1.42, overflow: 'auto', flex: 1, minHeight: 0, fontFamily: previewMode === 'json' ? 'Consolas, Monaco, monospace' : undefined }}>
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
              style={{ border: 'none', background: locked ? withAlpha(lockTone, 0.28) : (!hasDraftValues || saving || tableReady === false ? withAlpha(colours.green, 0.38) : colours.green), color: '#ffffff', fontSize: 12, fontWeight: 900, padding: '11px 12px', cursor: !hasDraftValues || locked || saving || tableReady === false ? 'default' : 'pointer' }}
            >
              {locked ? 'Attribution locked' : 'Save and lock chain'}
            </button>
          </div>
        )}
        </div>
      </aside>

        </div>
      )}
    </section>
  );
};

export default DataHubAttributionWorkbench;
