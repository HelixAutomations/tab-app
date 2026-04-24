import React from 'react';
import { createPortal } from 'react-dom';
import { FiRefreshCw, FiInbox, FiCheckCircle, FiChevronDown, FiChevronUp, FiChevronRight, FiFolder, FiFilter, FiTrendingUp, FiMail, FiPhoneCall, FiClock, FiFileText, FiUser } from 'react-icons/fi';
import { renderAreaOfWorkGlyph } from '../../components/filter/areaGlyphs';
import { TbCurrencyPound } from 'react-icons/tb';
import { colours, withAlpha } from '../../app/styles/colours';
import helixMark from '../../assets/markwhite.svg';
import clioIcon from '../../assets/clio.svg';
import netdocumentsIcon from '../../assets/netdocuments.svg';
import ErrorBoundary from '../ErrorBoundary';
import { CclStatusContext, type CclStatusContextValue } from '../../contexts/CclStatusContext';
import { useCclPipelineToasts } from '../../hooks/useCclPipelineToasts';
import { useToast } from '../feedback/ToastProvider';
import { useClaimEnquiry } from '../../utils/claimEnquiry';
import { trackClientEvent } from '../../utils/telemetry';
import { DEFAULT_CCL_TEMPLATE, generateTemplateContent, type GenerationOptions } from '../../shared/ccl';
import CclOverrideRerunModal from './ccl/CclOverrideRerunModal';
import { isCclUser, isDevGroupOrHigher } from '../../app/admin';
import HomePipelineStrip, { type HomePipelineStripItem } from '../../components/HomePipelineStrip';
import { buildPitchScenarioStripItems } from '../../components/pitchScenarioPresentation';
import { DocumentRenderer } from '../../tabs/instructions/ccl/DocumentRenderer';
import { approveCcl, buildCclApiUrl, fetchCclCompile, fetchPressureTest, runCclService, uploadToNetDocuments, type AiFillRequest, type AiFillResponse, type CclCompileResponse, type PressureTestResponse, type PressureTestFieldScore } from '../../tabs/matters/ccl/cclAiService';
import CclReviewDecisionPanel from './CclReviewDecisionPanel';
import CclReviewDevTools from './CclReviewDevTools';
import CclReviewFieldHeader from './CclReviewFieldHeader';
import CclReviewQueueStrip from './CclReviewQueueStrip';
import BillingRailSkeleton from './BillingRailSkeleton';
import ConversionProspectBasket, { type ConversionProspectChipItem } from './ConversionProspectBasket';
import ConversionStreamPreview from './ConversionStreamPreview';
import ConversionStreamLedger from './ConversionStreamLedger';
import { buildConversionPocketChartSVG, buildCombinedConversionChartSVG } from './conversionPocketChart';
import { resolveBreakpoint, type ConversionBreakpoint } from './hooks/useContainerWidth';

import CallsAndNotes from './CallsAndNotes';

/* ── Types ── */

type PeriodKey = 'today' | 'weekToDate' | 'monthToDate' | 'yearToDate';
type SortKey = 'date' | 'name' | 'aow';
type MatterSortKey = 'date' | 'name' | 'fe' | 'aow';
type UnclaimedRange = 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth';
type ActivityTab = 'enquiries' | 'unclaimed';
type InsightPeriod = 'today' | 'weekToDate' | 'monthToDate' | null;
type CclContactSource = 'matter' | 'current';
type HomeMatterStepKey = 'compile' | 'generate' | 'pressure' | 'review' | 'nd';
type CclPipelineDetailModal = { matterId: string; kind: 'compile' | 'pressure' };
type CclReviewLaunchPhase = 'retrieving-draft' | 'compiling' | 'generating' | 'pressure-testing' | 'handoff' | 'complete';
type CclReviewLaunchStepStatus = 'pending' | 'active' | 'done' | 'error';
type CclReviewLaunchStep = { label: string; detail?: string; status: CclReviewLaunchStepStatus };
type FollowUpChannel = 'email' | 'phone';
type FollowUpDueState = 'pending' | 'due' | 'late' | null;
type EnquiryLifecycleStepKey = 'pitch' | 'follow-up' | 'instruction';
type EnquiryFollowUpModal = { record: DetailRecord };
type DashboardWidthBand = 'xs' | 'sm' | 'md' | 'lg';
type ConversionLayoutState = { breakpoint: ConversionBreakpoint; chartHasOwnLine: boolean };

const HOME_PITCH_SCENARIO_STRIP_ITEMS = buildPitchScenarioStripItems();
const HOME_MATTER_STEP_HEADER_LABELS = ['Compile', 'Generate', 'Test', 'Review', 'Upload'] as const;
const HOME_ENQUIRY_STEP_HEADER_LABELS = ['Pitch', 'Follow Up', 'Instruction'] as const;
const HOME_ENQUIRY_NOTES_SLOT_WIDTH = 22;
const CCL_LOCAL_LAUNCH_HOLD_KEY = ' ';

function resolveDashboardWidthBand(width: number): DashboardWidthBand {
  if (width < 540) return 'xs';
  if (width < 700) return 'sm';
  if (width < 920) return 'md';
  return 'lg';
}

function resolveConversionLayout(width: number): ConversionLayoutState {
  const breakpoint = resolveBreakpoint(width);
  // 2026-04-21 fix: use a SINGLE monotonic threshold for wrap-to-own-line.
  // Previously the threshold was `chartWidth + 174` where chartWidth itself
  // flipped 260↔340 at the 'wide' breakpoint (480) — which produced a
  // 434–513px "bounce zone" where the chart oscillated wrapped → inline →
  // wrapped as you shrank. Once it wraps, it stays wrapped and the inline
  // `.conv-spark-fluid svg { width: 100% }` rule scales the SVG cleanly.
  //
  // Threshold math (why 560): card has 14px padding each side, inner flex
  // row gap is 14, numbers column basis 160, chart wide-mode 340. Minimum
  // card width to fit inline: 14+14 + 160 + 14 + 340 = 542. Anything below
  // that lets the browser auto-wrap but our wrapper kept the inline 340px
  // width, leaving dead space on the right. 560 gives a small cushion so
  // the wrapped branch fires BEFORE the browser wrap point — the chart
  // then stretches to full row width via `width: 100%` + the fluid SVG
  // CSS rule, finally touching the card's right edge on narrow sizes.
  const chartHasOwnLine = width > 0 && width < 560;
  return {
    breakpoint,
    chartHasOwnLine,
  };
}

const CCL_ORDERED_REVIEW_FIELD_KEYS = [
  'insert_clients_name',
  'insert_heading_eg_matter_description',
  'name_of_person_handling_matter',
  'status',
  'name',
  'fee_earner_email',
  'fee_earner_phone',
  'fee_earner_postal_address',
  'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
  'insert_current_position_and_scope_of_retainer',
  'next_steps',
  'realistic_timescale',
  'handler_hourly_rate',
  'charges_estimate_paragraph',
  'disbursements_paragraph',
  'costs_other_party_paragraph',
  'figure',
  'and_or_intervals_eg_every_three_months',
  'contact_details_for_marketing_opt_out',
  'eid_paragraph',
  'may_will',
  'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
  'instructions_link',
  'insert_next_step_you_would_like_client_to_take',
  'state_why_this_step_is_important',
  'state_amount',
  'insert_consequence',
  'describe_first_document_or_information_you_need_from_your_client',
  'describe_second_document_or_information_you_need_from_your_client',
  'describe_third_document_or_information_you_need_from_your_client',
] as const;
const CCL_SUPPRESSED_REVIEW_FIELD_KEYS = new Set<string>([
  'insert_clients_name',
  'name_of_person_handling_matter',
  'status',
  'name',
  'fee_earner_email',
  'fee_earner_phone',
  'fee_earner_postal_address',
  'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
  'contact_details_for_marketing_opt_out',
  'handler_hourly_rate',
]);
const CCL_PRESSURE_TEST_FIELD_KEYS = CCL_ORDERED_REVIEW_FIELD_KEYS.filter((key) => !CCL_SUPPRESSED_REVIEW_FIELD_KEYS.has(key));

function readCclReviewTextValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function sanitiseCclPressureTestFields(fields: Record<string, unknown> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fields) return result;
  for (const key of CCL_PRESSURE_TEST_FIELD_KEYS) {
    const text = readCclReviewTextValue(fields[key]);
    if (text) result[key] = text;
  }
  return result;
}

function extractCclTraceFields(trace: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!trace) return {};
  const outputJson = trace.AiOutputJson;
  if (typeof outputJson !== 'string' || !outputJson.trim()) return {};
  try {
    const parsed = JSON.parse(outputJson) as { fields?: Record<string, unknown> } | Record<string, unknown>;
    const source = parsed && typeof parsed === 'object' && 'fields' in parsed && parsed.fields && typeof parsed.fields === 'object'
      ? parsed.fields as Record<string, unknown>
      : parsed as Record<string, unknown>;
    return sanitiseCclPressureTestFields(source);
  } catch {
    return {};
  }
}

interface TeamMemberRecord {
  'Full Name'?: string;
  FullName?: string;
  First?: string;
  Last?: string;
  Initials?: string;
  Email?: string;
  Role?: string;
  Rate?: string | number;
  status?: string;
}

const DEFAULT_BILLING_SKELETON_COUNT = 4;

interface CclContactProfile {
  fullName: string;
  email: string;
  role: string;
  rate: string;
  sourceLabel: string;
}

interface TimeMetric {
  title: string;
  isTimeMoney?: boolean;
  isMoneyOnly?: boolean;
  money?: number;
  hours?: number;
  prevMoney?: number;
  prevHours?: number;
  yesterdayMoney?: number;
  yesterdayHours?: number;
  secondary?: number;
  showDial?: boolean;
  dialTarget?: number;
  count?: number;
  prevCount?: number;
}

interface WipActivityEntry { hours: number; value: number; type?: string; note?: string; matter?: string; matterDesc?: string; activity?: string }
interface WipDailyEntry { hours: number; value: number; entries?: WipActivityEntry[] }
interface WipDailyData {
  currentWeek: Record<string, WipDailyEntry>;
  lastWeek: Record<string, WipDailyEntry>;
}

interface EnquiryMetric {
  title: string;
  count?: number;
  prevCount?: number;
  elapsedPrevCount?: number;
  pitchedCount?: number;
  percentage?: number;
  prevPercentage?: number;
  isPercentage?: boolean;
  showTrend?: boolean;
  context?: {
    enquiriesMonthToDate?: number;
    mattersOpenedMonthToDate?: number;
    prevEnquiriesMonthToDate?: number;
  };
}

interface BreakdownAowItem { key: string; count: number }
interface BreakdownPeriod { aowTop?: BreakdownAowItem[] }
interface BreakdownPayload { today?: BreakdownPeriod; weekToDate?: BreakdownPeriod; monthToDate?: BreakdownPeriod }
export interface ConversionComparisonBucket {
  label: string;
  axisLabel?: string;
  currentEnquiries: number;
  previousEnquiries: number;
  currentMatters: number;
  previousMatters: number;
  isFuture?: boolean;
  currentAvailable?: boolean;
  isCurrentEndpoint?: boolean;
}
export interface ConversionComparisonAowItem {
  key: string;
  count: number;
}
/**
 * Phase C — prospect chip payload for the Conversion panel. Names are
 * redacted to "J. Smith" before hitting the UI. Capped ~20 per list.
 */
export interface ConversionComparisonProspect {
  id: string;
  displayName: string;
  feeEarnerInitials?: string;
  aow: string;
  matterOpened?: boolean;
  /** Optional unredacted name shown inside the D3 stream preview modal only. */
  fullName?: string;
  /** Optional ISO timestamp for the D3 stream preview modal. */
  occurredAt?: string;
  /** 2026-04-20: matter display number (e.g. "HLX-00898-37693") — used as the
   *  trail label for matter bezels in place of a redacted surname, which
   *  doesn't work for company clients. */
  displayNumber?: string;
  /** 2026-04-20: Clio numeric matter id used to build the Clio deep link that
   *  reveals on hover. */
  clioMatterId?: string;
  /** 2026-04-24: enquiry ACID (Core Data `enquiries.ID`) — surfaced as a
   *  subtle secondary line on the hover pill for enquiry bezels, so ops can
   *  match a chip to the record without leaving the strip. Undefined for
   *  matter chips (which use `displayNumber` + `clioMatterId` instead). */
  acid?: string;
}
export interface ConversionComparisonItem {
  key: string;
  title: string;
  comparisonLabel: string;
  currentLabel: string;
  previousLabel: string;
  currentEnquiries: number;
  previousEnquiries: number;
  currentMatters: number;
  previousMatters: number;
  currentPct: number;
  previousPct: number;
  chartMode: 'none' | 'hourly' | 'working-days' | 'month-weeks' | 'quarter-weeks';
  buckets: ConversionComparisonBucket[];
  currentAowMix?: ConversionComparisonAowItem[];
  /** Phase C — most-recent-first, capped at ~20. */
  currentEnquiryProspects?: ConversionComparisonProspect[];
  /** Phase C — matters opened in the period, most-recent-first, capped. */
  currentMatterProspects?: ConversionComparisonProspect[];
}
export interface ConversionComparisonPayload {
  items: ConversionComparisonItem[];
}
export interface UnclaimedAowBreakdownItem {
  key: string;
  count: number;
  totalValue: number;
}
export interface UnclaimedInsightItem {
  id: string;
  name: string;
  email?: string;
  aow: string;
  date: string;
  ageDays: number;
  value: number;
  dataSource: 'new' | 'legacy';
}
export interface UnclaimedRangeSummary {
  key: UnclaimedRange;
  label: string;
  count: number;
  totalValue: number;
  staleCount: number;
  oldestAgeDays: number;
  aowBreakdown: UnclaimedAowBreakdownItem[];
  items: UnclaimedInsightItem[];
}
export interface UnclaimedSummaryPayload {
  ranges: UnclaimedRangeSummary[];
}

interface DetailRecordFollowUpSummary {
  totalCount: number;
  emailCount: number;
  phoneCount: number;
  lastFollowUpAt?: string;
  lastChannel?: FollowUpChannel;
  lastRecordedBy?: string;
}
interface DetailRecord {
  id?: string; enquiryId?: string; date?: string; poc?: string; aow?: string; source?: string; name?: string; stage?: string;
  processingEnquiryId?: string; pitchEnquiryId?: string; legacyEnquiryId?: string;
  pipelineStage?: string; teamsChannel?: string; teamsCardType?: string; teamsStage?: string; teamsClaimed?: string; teamsLink?: string;
  dataSource?: 'new' | 'legacy';
  email?: string;
  notes?: string;
  prospectIds?: string[];
  pitchedBy?: string;
  pitchedAt?: string;
  pitchDealId?: string;
  pitchStatus?: string;
  pitchScenarioId?: string;
  followUpSummary?: DetailRecordFollowUpSummary;
  currentRange?: string;
  previousRange?: string;
}

interface DetailsPayload {
  period?: string;
  limit?: number;
  currentRange?: string;
  previousRange?: string;
  current?: {
    records?: DetailRecord[];
  };
  previous?: {
    records?: DetailRecord[];
  };
  filters?: {
    email?: string;
    initials?: string;
    includeTeamInbox?: boolean;
    includePrevious?: boolean;
    fetchAll?: boolean;
    overridden?: boolean;
  };
  cached?: boolean;
  stale?: boolean;
}

interface CclStatus {
  status: string;
  stage?: string;
  label?: string;
  version: number;
  feeEarner?: string;
  practiceArea?: string;
  clientName?: string;
  matterDescription?: string;
  createdAt?: string;
  finalizedAt?: string;
  uploadedToClio?: boolean;
  uploadedToNd?: boolean;
  needsAttention?: boolean;
  attentionReason?: string;
  confidence?: string;
  unresolvedCount?: number;
  compiledAt?: string;
  compileSummary?: {
    sourceCount?: number;
    readyCount?: number;
    limitedCount?: number;
    missingCount?: number;
  } | null;
}

function getCanonicalCclStage(status?: string | null): 'pending' | 'compiled' | 'generated' | 'pressure-tested' | 'reviewed' | 'sent' {
  switch (String(status || '').trim().toLowerCase()) {
    case 'compiled':
      return 'compiled';
    case 'generated':
    case 'draft':
      return 'generated';
    case 'pressure-tested':
    case 'pressure_tested':
    case 'pressuretested':
      return 'pressure-tested';
    case 'reviewed':
    case 'approved':
    case 'final':
      return 'reviewed';
    case 'sent':
    case 'uploaded':
      return 'sent';
    default:
      return 'pending';
  }
}

function getCanonicalCclLabel(status?: string | null, explicitLabel?: string | null): string {
  if (explicitLabel && explicitLabel.trim()) {
    return explicitLabel.trim();
  }

  switch (getCanonicalCclStage(status)) {
    case 'compiled':
      return 'Compiled';
    case 'generated':
      return 'Generated';
    case 'pressure-tested':
      return 'Pressure tested';
    case 'reviewed':
      return 'Reviewed';
    case 'sent':
      return 'Sent';
    default:
      return 'Pending';
  }
}

function isCompileOnlyCclStatus(ccl?: CclStatus | null): boolean {
  if (!ccl) return false;
  const stage = getCanonicalCclStage(ccl.stage || ccl.status);
  if (stage === 'compiled') return true;
  if (stage === 'generated' || stage === 'pressure-tested' || stage === 'reviewed' || stage === 'sent') {
    return false;
  }
  return !Number(ccl.version || 0) && Boolean(ccl.compiledAt || ccl.compileSummary);
}

const CCL_REVIEW_SESSION_STORAGE_KEY = 'opsDashboard.cclReviewSession.v1';

interface PersistedCclReviewSessionEntry {
  reviewedFields?: string[];
  selectedField?: string;
  summaryDismissed?: boolean;
}

interface CclDraftCacheEntry {
  fields: Record<string, string> | null;
  docUrl?: string;
  fetchError?: string;
  loadInfo?: {
    version?: number | null;
    contentId?: number | null;
    status?: string | null;
    historyCount?: number | null;
  };
}

function loadPersistedCclReviewSession(): Record<string, PersistedCclReviewSessionEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CCL_REVIEW_SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PersistedCclReviewSessionEntry>;
  } catch {
    return {};
  }
}

function persistCclReviewSession(
  reviewedByMatter: Record<string, Set<string>>,
  selectedFieldByMatter: Record<string, string>,
  summaryDismissedByMatter: Record<string, boolean>,
) {
  if (typeof window === 'undefined') return;
  try {
    const matterIds = new Set<string>([
      ...Object.keys(reviewedByMatter),
      ...Object.keys(selectedFieldByMatter),
      ...Object.keys(summaryDismissedByMatter),
    ]);
    const nextPayload = Array.from(matterIds).reduce((acc, matterId) => {
      const reviewedFields = Array.from(reviewedByMatter[matterId] || []);
      const selectedField = selectedFieldByMatter[matterId];
      const summaryDismissed = !!summaryDismissedByMatter[matterId];
      if (!reviewedFields.length && selectedField === undefined && !summaryDismissed) {
        return acc;
      }
      acc[matterId] = {
        ...(reviewedFields.length > 0 ? { reviewedFields } : {}),
        ...(selectedField !== undefined ? { selectedField } : {}),
        ...(summaryDismissed ? { summaryDismissed: true } : {}),
      };
      return acc;
    }, {} as Record<string, PersistedCclReviewSessionEntry>);
    if (Object.keys(nextPayload).length === 0) {
      window.localStorage.removeItem(CCL_REVIEW_SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(CCL_REVIEW_SESSION_STORAGE_KEY, JSON.stringify(nextPayload));
  } catch {
    // Ignore storage failures. Review state can still live in memory for this session.
  }
}

interface MatterRecord {
  matterId: string;
  displayNumber: string;
  clientName: string;
  // Matter description used as a fallback label when ClientName is blank
  // (common for older matters where Clio's ClientName wasn't populated).
  description?: string;
  practiceArea: string;
  openDate: string;
  responsibleSolicitor: string;
  originatingSolicitor: string;
  status: 'active' | 'closed';
  instructionRef?: string;
  sourceVersion?: 'v3' | 'v4';
}

interface CclPromptSection {
  key: string;
  title: string;
  body: string;
}

const CCL_PROMPT_SECTION_PRIORITY: Record<string, string[]> = {
  insert_current_position_and_scope_of_retainer: ['pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts', 'deal-information', 'matter-context'],
  next_steps: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  realistic_timescale: ['initial-call-notes', 'call-transcripts', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  charges_estimate_paragraph: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  disbursements_paragraph: ['matter-context', 'pitch-email', 'instruction-notes'],
  costs_other_party_paragraph: ['matter-context', 'initial-call-notes', 'enquiry-notes', 'instruction-notes'],
  may_will: ['initial-call-notes', 'call-transcripts', 'enquiry-notes', 'matter-context'],
  figure: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  state_amount: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  insert_next_step_you_would_like_client_to_take: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  state_why_this_step_is_important: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_first_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_second_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_third_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  eid_paragraph: ['matter-context', 'instruction-notes'],
};

function getRelevantPromptSectionKeys(fieldKey?: string | null, confidence?: string | null): string[] {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (normalizedFieldKey && CCL_PROMPT_SECTION_PRIORITY[normalizedFieldKey]?.length) {
    return CCL_PROMPT_SECTION_PRIORITY[normalizedFieldKey];
  }

  switch (String(confidence || '').trim().toLowerCase()) {
    case 'data':
      return ['matter-context', 'deal-information'];
    case 'templated':
      return ['matter-context', 'instruction-notes'];
    case 'inferred':
      return ['pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts', 'deal-information', 'matter-context'];
    default:
      return ['matter-context', 'deal-information', 'pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts'];
  }
}

const CCL_PROMPT_CONTEXT_LINE_MATCHERS: Record<string, RegExp[]> = {
  practiceArea: [/^- Practice Area:/i],
  description: [/^- Matter Description:/i, /^- Type of Work:/i],
  typeOfWork: [/^- Type of Work:/i, /^- Matter Description:/i],
  clientName: [/^- Client Name:/i],
  handlerName: [/^- Handler:/i],
  handlerRole: [/^- Handler:/i],
  handlerRate: [/^- Handler Hourly Rate:/i],
  opponent: [/^- Opposing Party:/i],
  clientType: [/^- Client Type:/i],
  company: [/^- Client Company:/i],
  clientGender: [/^- Client Gender:/i],
  enquiryValue: [/^- Enquiry Value:/i],
  source: [/^- Enquiry Source:/i],
  instructionStage: [/^- Instruction Stage:/i],
};

function detectCclPromptSection(line: string): { key: string; title: string; initialBody?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed === 'MATTER CONTEXT:') return { key: 'matter-context', title: 'Matter Context' };
  if (trimmed === 'DEAL INFORMATION:') return { key: 'deal-information', title: 'Deal Information' };
  if (trimmed === 'PITCH EMAIL SENT TO CLIENT (use this to match scope and costs):') return { key: 'pitch-email', title: 'Pitch Email Sent To Client' };
  if (trimmed.startsWith('PITCH SERVICE DESCRIPTION:')) return { key: 'pitch-service-description', title: 'Pitch Service Description', initialBody: trimmed.slice('PITCH SERVICE DESCRIPTION:'.length).trim() };
  if (trimmed === 'INITIAL CALL NOTES (first contact with client):') return { key: 'initial-call-notes', title: 'Initial Call Notes' };
  if (trimmed === 'ENQUIRY NOTES:') return { key: 'enquiry-notes', title: 'Enquiry Notes' };
  if (trimmed === 'INSTRUCTION NOTES:') return { key: 'instruction-notes', title: 'Instruction Notes' };
  if (trimmed === 'CALL TRANSCRIPTS (conversations with client):') return { key: 'call-transcripts', title: 'Call Transcripts' };
  if (trimmed.startsWith('PITCH NOTES:')) return { key: 'pitch-notes', title: 'Pitch Notes', initialBody: trimmed.slice('PITCH NOTES:'.length).trim() };
  if (trimmed.startsWith('Generate all CCL intake fields for this matter.')) return { key: 'generation-instruction', title: 'Generation Instruction', initialBody: trimmed };
  return null;
}

function parseCclUserPromptSections(prompt: string): CclPromptSection[] {
  if (!prompt.trim()) return [];

  const sections: CclPromptSection[] = [];
  const lines = prompt.split(/\r?\n/);
  let activeKey = '';
  let activeTitle = '';
  let activeLines: string[] = [];

  const flushSection = () => {
    const body = activeLines.join('\n').trim();
    if (activeKey && body) {
      sections.push({ key: activeKey, title: activeTitle, body });
    }
  };

  for (const line of lines) {
    const detected = detectCclPromptSection(line);
    if (detected) {
      flushSection();
      activeKey = detected.key;
      activeTitle = detected.title;
      activeLines = detected.initialBody ? [detected.initialBody] : [];
      continue;
    }
    if (activeKey) {
      activeLines.push(line);
    }
  }
  flushSection();
  return sections;
}

function filterMatterContextPrompt(body: string, relevantKeys: string[]): string {
  const lines = body.split(/\r?\n/);
  const matchers = relevantKeys.flatMap((key) => CCL_PROMPT_CONTEXT_LINE_MATCHERS[key] || []);
  if (matchers.length === 0) return body;
  const filtered = lines.filter((line) => matchers.some((matcher) => matcher.test(line)));
  return filtered.length > 0 ? filtered.join('\n').trim() : body;
}

interface SharedJsonCacheEntry<T> {
  timestamp: number;
  promise?: Promise<T>;
  value?: T;
}

const SHARED_REQUEST_CACHE_TTL_MS = 5000;
const sharedJsonRequestCache = new Map<string, SharedJsonCacheEntry<unknown>>();

function fetchSharedJson<T>(key: string, loader: () => Promise<T>, ttlMs = SHARED_REQUEST_CACHE_TTL_MS): Promise<T> {
  const now = Date.now();
  const cached = sharedJsonRequestCache.get(key) as SharedJsonCacheEntry<T> | undefined;

  if (cached?.promise) {
    return cached.promise;
  }

  if (cached && cached.value !== undefined && now - cached.timestamp < ttlMs) {
    return Promise.resolve(cached.value);
  }

  const promise = loader()
    .then((value) => {
      sharedJsonRequestCache.set(key, { timestamp: Date.now(), value });
      return value;
    })
    .catch((error) => {
      sharedJsonRequestCache.delete(key);
      throw error;
    });

  sharedJsonRequestCache.set(key, {
    timestamp: now,
    promise,
    value: cached?.value,
  });

  return promise;
}

function chunkMatterIds(ids: string[], chunkSize = 50): string[][] {
  if (ids.length <= chunkSize) return [ids];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

export interface OperationsDashboardProps {
  metrics: TimeMetric[];
  enquiryMetrics?: EnquiryMetric[];
  enquiryMetricsBreakdown?: unknown;
  conversionComparison?: ConversionComparisonPayload | null;
  enableConversionComparison?: boolean;
  isResolvingConversionComparison?: boolean;
  enquiriesUsingSnapshot?: boolean;
  enquiriesLiveRefreshInFlight?: boolean;
  enquiriesLastLiveSyncAt?: number | null;
  isTeamWideEnquiryView?: boolean;
  unclaimedSummary?: UnclaimedSummaryPayload | null;
  recentEnquiryRecords?: DetailRecord[];
  unclaimedQueueCount?: number;
  unclaimedToday?: number;
  unclaimedThisWeek?: number;
  unclaimedLastWeek?: number;
  canClaimUnclaimed?: boolean;
  isProcessingView?: boolean;
  processingLabel?: string;
  processingDetail?: string;
  isDarkMode: boolean;
  userEmail?: string;
  userInitials?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  isLoadingEnquiryMetrics?: boolean;
  isOutstandingLoading?: boolean;
  hasOutstandingBreakdown?: boolean;
  onOpenOutstandingBreakdown?: () => void;
  recentMatters?: MatterRecord[];
  teamData?: TeamMemberRecord[];
  wipDailyData?: WipDailyData;
  demoModeEnabled?: boolean;
  isActive?: boolean;
  reviewRequest?: { requestedAt: number; matterId?: string; openInspector?: boolean } | null;
  /**
   * When true, the caller (Home) is rendering its own ToDo surface in place of the
   * dashboard's pipeline + recent-matters sub-blocks. Keep the enquiries/matters
   * metric tiles, conversion chart, and unclaimed tabs visible regardless. The
   * sub-block gating inside this component is wired progressively — see
   * `docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md` Phase A follow-up.
   */
  hidePipelineAndMatters?: boolean;
  /**
   * Optional node rendered in the right column of the pipeline row when
   * `hidePipelineAndMatters` is true. The grid collapses from `1fr 2fr` to
   * `1fr 1fr`, giving the ToDo surface 50/50 width with the Conversion panel.
   * Used by Home to place `ImmediateActionsBar` as the ToDo pickup surface.
   */
  todoSlot?: React.ReactNode;
  /**
   * Total outstanding To Do count, rendered inline next to the "To Do"
   * section header label as a small badge. Hidden when 0/undefined.
   */
  todoCount?: number;
}

function getAttentionSummary(reason?: string | null): string {
  switch (String(reason || '').trim().toLowerCase()) {
    case 'missing_fields':
      return 'Missing inputs need confirmation.';
    case 'low_confidence':
      return 'Low-confidence fields need review.';
    default:
      return 'Review required before the service can complete delivery.';
  }
}

/* ── Helpers ── */

const fmt = {
  currency: (v: number): string => {
    if (v >= 1000) return `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
    return `£${Math.round(v).toLocaleString()}`;
  },
  hours: (v: number): string => `${v.toFixed(1)}h`,
  int: (v: number): string => String(Math.round(v)),
  pct: (v: number): string => `${v.toFixed(1)}%`,
  /** Exact (hover-reveal) formatters — full precision, no abbreviation. */
  currencyExact: (v: number): string =>
    `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  hoursExact: (v: number): string => {
    const whole = Math.floor(v);
    const mins = Math.round((v - whole) * 60);
    return mins === 0 ? `${whole}h` : `${whole}h ${mins}m`;
  },
};

const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const safeBreakdown = (value: unknown): BreakdownPayload => {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const read = (k: string): BreakdownPeriod | undefined => {
    const p = obj[k];
    if (!p || typeof p !== 'object') return undefined;
    const po = p as Record<string, unknown>;
    const top = po.aowTop;
    if (!Array.isArray(top)) return { aowTop: [] };
    return {
      aowTop: top
        .filter((x) => x && typeof x === 'object')
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.key === 'string' && typeof x.count === 'number')
        .map((x) => ({ key: String(x.key), count: Number(x.count) })),
    };
  };
  return { today: read('today'), weekToDate: read('weekToDate'), monthToDate: read('monthToDate') };
};

const shortLabel = (title: string): string => {
  const t = title.toLowerCase();
  if (t.includes('time today') || t === 'today') return t.includes('firm') ? 'Firm Today' : 'Today';
  if (t.includes('av.') || t.includes('avg')) return t.includes('firm') ? 'Firm Avg / Day' : 'Avg / Day';
  if (t.includes('time this week')) return t.includes('firm') ? 'Firm This Week' : 'This Week';
  if (t.includes('fees') || t.includes('recovered') || t.includes('collected')) return t.includes('firm') ? 'Firm Collected' : 'Fees Recovered';
  if (t.includes('outstanding')) return t.includes('firm') ? 'Firm Outstanding' : 'Outstanding';
  if (t.includes('this week')) return 'This Week';
  if (t.includes('this month') && t.includes('matter')) return 'Matters Opened';
  if (t.includes('conversion')) return 'Conversion';
  return title;
};

/** Reverse-lookup: worktype (practice area) → area of work.
 *  Built from the canonical practiceAreasByArea in MatterOpening/config.ts. */
const worktypeToAow: Record<string, string> = {};
([
 ['Commercial', ['Director Rights & Dispute Advice','Shareholder Rights & Dispute Advice','Civil/Commercial Fraud Advice','Partnership Advice','Business Contract Dispute','Unpaid Loan Recovery','Contentious Probate','Statutory Demand - Drafting','Statutory Demand - Advising','Winding Up Petition Advice','Bankruptcy Petition Advice','Injunction Advice','Intellectual Property','Professional Negligence','Unpaid Invoice/Debt Dispute','Commercial Contract - Drafting','Company Restoration','Small Claim Advice','Trust Advice','Terms and Conditions - Drafting']],
 ['Construction', ['Final Account Recovery','Retention Recovery Advice','Adjudication Advice & Dispute','Construction Contract Advice','Interim Payment Recovery','Contract Dispute']],
 ['Property', ['Landlord & Tenant \u2013 Commercial Dispute','Landlord & Tenant \u2013 Residential Dispute','Boundary and Nuisance Advice','Trust of Land (Tolata) Advice','Service Charge Recovery & Dispute Advice','Breach of Lease Advice','Terminal Dilapidations Advice','Investment Sale and Ownership \u2013 Advice','Trespass','Right of Way']],
 ['Employment', ['Employment Contract - Drafting','Employment Retainer Instruction','Settlement Agreement - Drafting','Settlement Agreement - Advising','Handbook - Drafting','Policy - Drafting','Redundancy - Advising','Sick Leave - Advising','Disciplinary - Advising','Restrictive Covenant Advice','Post Termination Dispute','Employment Tribunal Claim - Advising']],
] as [string, string[]][]).forEach(([area, types]: [string, string[]]) => { types.forEach((t: string) => { worktypeToAow[t.toLowerCase()] = area.toLowerCase(); }); });

/**
 * 2026-04-20: canonical resolver — given any AoW / practice-area / worktype
 * string, return one of the five canonical category slugs. Used by the
 * Conversion trail bezels so the icon always matches the colour (many matter
 * rows carry a specific worktype like "Contract Dispute" rather than a bare
 * "Construction" — the icon mapping inside the basket couldn't match those,
 * which is why they were rendering as the fallback info circle).
 */
export const resolveAowCategory = (key: string): 'commercial' | 'construction' | 'property' | 'employment' | 'other' => {
  const k = String(key || '').toLowerCase().trim();
  if (!k) return 'other';
  const mapped = worktypeToAow[k];
  const resolved = mapped || k;
  if (resolved.includes('commercial')) return 'commercial';
  if (resolved.includes('construction')) return 'construction';
  if (resolved.includes('property') || resolved.includes('landlord') || resolved.includes('tenant') || resolved.includes('lease')) return 'property';
  if (resolved.includes('employment') || resolved.includes('redundanc') || resolved.includes('tribunal')) return 'employment';
  return 'other';
};

const aowColor = (key: string): string => {
  const k = key.toLowerCase();
  // Check reverse mapping first (e.g. "Contract Dispute" → "construction")
  const mapped = worktypeToAow[k];
  const resolvedKey = mapped || k;
  if (resolvedKey.includes('commercial')) return colours.blue;
  if (resolvedKey.includes('construction')) return colours.orange;
  if (resolvedKey.includes('property')) return colours.green;
  if (resolvedKey.includes('employment')) return colours.yellow;
  return colours.greyText;
};

const HOME_CCL_DEFAULT_PHONE = '0345 314 2044';
const HOME_CCL_DEFAULT_POSTAL_ADDRESS = 'Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';
const HOME_CCL_DEFAULT_MARKETING_CONTACT = 'team@helix-law.com';

/** Map backend source labels to client-facing channel names */
const friendlySource = (raw?: string): string => {
  if (!raw) return '—';
  const s = raw.toLowerCase().trim();
  if (s === 'instructions' || s === 'instruct-pitch') return 'Portal';
  if (s === 'legacy' || s === 'manual') return 'Direct';
  if (s === 'facebook' || s === 'fb' || s.includes('facebook')) return 'Facebook';
  if (s === 'google' || s.includes('google')) return 'Google';
  if (s === 'referral') return 'Referral';
  if (s === 'website' || s === 'web') return 'Website';
  // Capitalise first letter for anything else
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/** Copy text to clipboard with fallback */
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); return true;
  } catch { return false; }
};

/** Map backend stage to short client-facing status */
const friendlyStage = (raw?: string): string => {
  if (!raw) return '';
  const s = raw.toLowerCase().trim();
  if (s === 'enquiry' || s === 'new') return 'New';
  if (s === 'claimed') return 'Claimed';
  if (s === 'pitch' || s === 'pitched') return 'Pitched';
  if (s === 'instructed' || s === 'instruction') return 'Instructed';
  if (s === 'initialised') return 'New';
  if (s.includes('proof-of-id') || s.includes('poid')) return 'ID check';
  if (s.includes('complete')) return 'Complete';
  if (s.includes('closed') || s.includes('rejected')) return 'Closed';
  if (s.includes('conflict')) return 'Conflict';
  // Capitalise first letter for anything else
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/** Pipeline stage level (cumulative: 1=Posted, 2=Claimed, 3=Pitched, 4=Instructed, 5=Matter) */
const stageLevel = (raw?: string): number => {
  if (!raw) return 0;
  const s = raw.toLowerCase().trim();
  if (s === 'enquiry' || s === 'new' || s === 'initialised') return 1;
  if (s === 'claimed') return 2;
  if (s === 'pitch' || s === 'pitched') return 3;
  if (s === 'instructed' || s === 'instruction' || s === 'actioned') return 4;
  if (s.includes('proof-of-id') || s.includes('poid') || s.includes('complete')) return 5;
  if (s.includes('conflict') || s.includes('closed') || s.includes('rejected')) return 2;
  return 1;
};

const effectiveStageForRecord = (record: DetailRecord): string | undefined => {
  const candidates = [record.pipelineStage, record.teamsStage, record.stage].filter(Boolean) as string[];
  return candidates.sort((a, b) => stageLevel(b) - stageLevel(a))[0];
};

const activityStageForRecord = (record: DetailRecord): string | undefined => record.stage || record.pipelineStage || record.teamsStage;

const hasPitchEvidenceForRecord = (record: DetailRecord): boolean => Boolean(
  String(record.pitchDealId || '').trim() || String(record.pitchedAt || '').trim()
);

const hasInstructionForRecord = (record: DetailRecord): boolean =>
  stageLevel(effectiveStageForRecord(record)) >= 4
  || ['instructed', 'instruction', 'actioned'].includes(String(record.pitchStatus || '').trim().toLowerCase());

const hasCompletedPitchForRecord = (record: DetailRecord): boolean => hasPitchEvidenceForRecord(record) || hasInstructionForRecord(record);

const getDetailRecordIds = (record: DetailRecord): string[] => Array.from(new Set([
  record.enquiryId,
  record.id,
  record.processingEnquiryId,
  record.pitchEnquiryId,
  record.legacyEnquiryId,
].map((value) => String(value || '').trim()).filter(Boolean)));

const doDetailRecordsMatch = (left: DetailRecord, right: DetailRecord): boolean => {
  const rightIds = new Set(getDetailRecordIds(right));
  if (rightIds.size === 0) {
    return String(left.email || '').trim().toLowerCase() !== ''
      && String(left.email || '').trim().toLowerCase() === String(right.email || '').trim().toLowerCase();
  }

  return getDetailRecordIds(left).some((value) => rightIds.has(value));
};

const getFollowUpSummaryForRecord = (record: DetailRecord): DetailRecordFollowUpSummary | null => {
  if (!record.followUpSummary || Number(record.followUpSummary.totalCount || 0) <= 0) return null;
  return record.followUpSummary;
};

const getFollowUpDueStateForRecord = (record: DetailRecord): FollowUpDueState => {
  if (hasInstructionForRecord(record)) return null;
  if (!hasPitchEvidenceForRecord(record)) return null;
  const anchor = record.pitchedAt || record.date;
  const ageHours = hoursSince(anchor);
  if (ageHours >= 48) return 'late';
  if (ageHours >= 24) return 'due';
  return 'pending';
};

const hoursSince = (raw?: string): number => {
  if (!raw) return 0;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
};

const recordFallsWithinPeriod = (rawDate: string | undefined, period: PeriodKey): boolean => {
  if (!rawDate) return false;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  const weekDay = (startOfWeek.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - weekDay);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  if (period === 'today') {
    return date >= startOfToday;
  }
  if (period === 'weekToDate') {
    return date >= startOfWeek;
  }
  if (period === 'yearToDate') {
    return date >= startOfYear;
  }
  return date >= startOfMonth;
};

const stageVisuals = (stage: string | undefined, isDarkMode: boolean) => {
  const level = stageLevel(stage);
  if (level >= 4) {
    return {
      colour: colours.green,
      tint: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.08)',
      hover: isDarkMode ? 'rgba(32,178,108,0.14)' : 'rgba(32,178,108,0.12)',
      pillBg: isDarkMode ? 'rgba(32,178,108,0.16)' : 'rgba(32,178,108,0.12)',
      pillBorder: isDarkMode ? 'rgba(32,178,108,0.34)' : 'rgba(32,178,108,0.22)',
    };
  }
  if (level === 3) {
    return {
      colour: colours.orange,
      tint: isDarkMode ? 'rgba(255,140,0,0.08)' : 'rgba(255,140,0,0.08)',
      hover: isDarkMode ? 'rgba(255,140,0,0.14)' : 'rgba(255,140,0,0.12)',
      pillBg: isDarkMode ? 'rgba(255,140,0,0.16)' : 'rgba(255,140,0,0.12)',
      pillBorder: isDarkMode ? 'rgba(255,140,0,0.32)' : 'rgba(255,140,0,0.22)',
    };
  }
  return {
    colour: isDarkMode ? colours.accent : colours.highlight,
    tint: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)',
    hover: isDarkMode ? 'rgba(135,243,243,0.14)' : 'rgba(54,144,206,0.12)',
    pillBg: isDarkMode ? 'rgba(135,243,243,0.16)' : 'rgba(54,144,206,0.10)',
    pillBorder: isDarkMode ? 'rgba(135,243,243,0.30)' : 'rgba(54,144,206,0.18)',
  };
};

/** Clean timestamp to short readable date — "3 Mar 16:33" */
const friendlyDate = (raw?: string): string => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const day = d.getDate();
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    // If time is midnight (no time component), show date only
    if (hrs === 0 && mins === '00') return `${day} ${month}`;
    return `${day} ${month} ${hrs}:${mins}`;
  } catch {
    return raw;
  }
};

const friendlyDateParts = (raw?: string, nowMs: number = Date.now()): { primary: string; secondary?: string; isToday?: boolean } => {
  if (!raw) return { primary: '—' };
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return { primary: raw };
    const now = new Date(nowMs);
    const toDateKey = (dt: Date) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    const isToday = toDateKey(d) === toDateKey(now);
    const day = d.getDate();
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const hasMeaningfulTime = !(hrs === '00' && mins === '00');
    if (isToday) {
      if (!hasMeaningfulTime) {
        return { primary: 'Today', isToday: true };
      }
      return {
        primary: `${hrs}:${mins}`,
        secondary: 'Today',
        isToday: true,
      };
    }

    return {
      primary: `${day} ${month}`,
      secondary: hasMeaningfulTime ? `${hrs}:${mins}` : undefined,
    };
  } catch {
    return { primary: raw };
  }
};

const formatLiveSyncAge = (lastLiveSyncAt?: number | null, nowMs: number = Date.now()): string | undefined => {
  if (!lastLiveSyncAt || !Number.isFinite(lastLiveSyncAt)) return undefined;
  const diffMs = Math.max(0, nowMs - lastLiveSyncAt);
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 15) return 'just now';
  if (diffSeconds < 90) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

/* ── Component ── */

const OperationsDashboardInner: React.FC<OperationsDashboardProps> = ({
  metrics,
  enquiryMetrics,
  enquiryMetricsBreakdown,
  conversionComparison,
  enableConversionComparison = false,
  isResolvingConversionComparison = false,
  enquiriesUsingSnapshot = false,
  enquiriesLiveRefreshInFlight = false,
  enquiriesLastLiveSyncAt = null,
  isTeamWideEnquiryView = false,
  unclaimedSummary,
  recentEnquiryRecords = [],
  unclaimedQueueCount = 0,
  unclaimedToday = 0,
  unclaimedThisWeek = 0,
  unclaimedLastWeek = 0,
  canClaimUnclaimed = false,
  isProcessingView = false,
  processingLabel = 'Refreshing Home view…',
  processingDetail = 'Recalculating personalised metrics and queue detail.',
  isDarkMode,
  userEmail,
  userInitials,
  onRefresh,
  isRefreshing,
  isLoading,
  isLoadingEnquiryMetrics,
  isOutstandingLoading,
  hasOutstandingBreakdown,
  onOpenOutstandingBreakdown,
  recentMatters = [],
  teamData,
  wipDailyData,
  demoModeEnabled = false,
  isActive = true,
  reviewRequest = null,
  hidePipelineAndMatters = false,
  todoSlot = null,
  todoCount,
}) => {
  const { showToast, updateToast, hideToast } = useToast();
  const cclPipelineToasts = useCclPipelineToasts();
  /* Build poc-value → initials lookup from teamData (handles emails, names, and short initials) */
  const feInitials = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (teamData) {
      teamData.forEach((t) => {
        const ini = (t.Initials || '').trim();
        if (!ini) return;
        // Full Name → initials  (e.g. "alex cook" → "AC")
        const name = (t['Full Name'] || '').trim().toLowerCase();
        if (name) map[name] = ini;
        // "First Last" variant
        const first = (t.First || '').trim();
        const last = (t.Last || '').trim();
        if (first && last) map[`${first} ${last}`.toLowerCase()] = ini;
        // Email → initials  (e.g. "ac@helix-law.com" → "AC")
        const email = (t.Email || '').trim().toLowerCase();
        if (email) map[email] = ini;
        // Short initials → initials  (e.g. "ac" → "AC")
        map[ini.toLowerCase()] = ini;
      });
    }
    return map;
  }, [teamData]);

  const normalizeTeamValue = React.useCallback((value: unknown) => String(value || '').trim().toLowerCase(), []);
  const resolveFeeEarnerDisplay = React.useCallback((value: unknown): { label: string; title?: string } => {
    const raw = String(value || '').trim();
    if (!raw) return { label: '—' };

    const normalized = raw.toLowerCase();
    const mapped = feInitials[normalized];
    if (mapped) {
      return { label: mapped, title: raw };
    }

    const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
    const initialsFromWords = localPart
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

    if (initialsFromWords) {
      return { label: initialsFromWords, title: raw };
    }

    return { label: raw.length <= 3 ? raw.toUpperCase() : raw, title: raw };
  }, [feInitials]);
  const [secondaryFetchesReady, setSecondaryFetchesReady] = React.useState(false);
  const hasSeededRecentEnquiryRecords = recentEnquiryRecords.length > 0;

  React.useEffect(() => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;
    let cancelled = false;

    const markReady = () => {
      if (!cancelled) {
        setSecondaryFetchesReady(true);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as typeof window & {
        requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => markReady(), { timeout: 900 });
    } else {
      timeoutId = globalThis.setTimeout(markReady, 350);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && idleId !== null && 'cancelIdleCallback' in window) {
        (window as typeof window & {
          cancelIdleCallback: (id: number) => void;
        }).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  const getTeamMemberFullName = React.useCallback((member: TeamMemberRecord | null | undefined) => {
    if (!member) return '';
    const fullName = String(member['Full Name'] || member.FullName || '').trim();
    if (fullName) return fullName;
    return `${String(member.First || '').trim()} ${String(member.Last || '').trim()}`.trim();
  }, []);
  const formatRateValue = React.useCallback((value: unknown) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const numeric = Number(text.replace(/[^\d.]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) return String(Math.round(numeric));
    return text.replace(/^£/, '').trim();
  }, []);
  const activeTeamMembers = React.useMemo(() => (
    ((teamData || []) as TeamMemberRecord[]).filter((member) => normalizeTeamValue(member?.status || 'active') !== 'inactive')
  ), [teamData, normalizeTeamValue]);
  const findTeamMember = React.useCallback((candidate: unknown): TeamMemberRecord | null => {
    const raw = String(candidate || '').trim();
    if (!raw) return null;
    const normalized = normalizeTeamValue(raw);
    return activeTeamMembers.find((member) => {
      const fullName = normalizeTeamValue(getTeamMemberFullName(member));
      const email = normalizeTeamValue(member?.Email);
      const initials = normalizeTeamValue(member?.Initials);
      return normalized === fullName || normalized === email || normalized === initials;
    }) || null;
  }, [activeTeamMembers, getTeamMemberFullName, normalizeTeamValue]);
  const partnerTeamMember = React.useMemo(() => (
    activeTeamMembers.find((member) => {
      const role = normalizeTeamValue(member?.Role);
      return role === 'partner' || role === 'senior partner';
    }) || null
  ), [activeTeamMembers, normalizeTeamValue]);
  const currentUserTeamMember = React.useMemo(() => (
    findTeamMember(userEmail) || findTeamMember(userInitials)
  ), [findTeamMember, userEmail, userInitials]);

  const period: PeriodKey = 'weekToDate';
  const activityDetailsPeriod = 'yearToDate';
  const showPrev = true;
  const layoutStacked = true;
  const [claimedUnclaimedIds, setClaimedUnclaimedIds] = React.useState<Set<string>>(new Set());
  const [claimedRecentEnquiryIds, setClaimedRecentEnquiryIds] = React.useState<Set<string>>(new Set());
  const [unclaimedClaimFeedback, setUnclaimedClaimFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const { claimEnquiry: triggerClaimEnquiry, isLoading: isClaimingUnclaimed } = useClaimEnquiry();
  const { claimEnquiry: triggerRecentClaimEnquiry, isLoading: isClaimingRecentEnquiry } = useClaimEnquiry();
  const [claimingItemId, setClaimingItemId] = React.useState<string | null>(null);
  const [claimingRecentEnquiryId, setClaimingRecentEnquiryId] = React.useState<string | null>(null);
  const [expandedRecentNoteIds, setExpandedRecentNoteIds] = React.useState<Set<string>>(new Set());
  const [selectedPitchScenariosByRecord, setSelectedPitchScenariosByRecord] = React.useState<Record<string, string>>({});

  // Responsive: auto-stack when container is narrow
  const dashRef = React.useRef<HTMLDivElement | null>(null);
  const conversionRailRef = React.useRef<HTMLDivElement | null>(null);
  const conversionCardRef = React.useRef<HTMLDivElement | null>(null);
  const [dashboardWidthBand, setDashboardWidthBand] = React.useState<DashboardWidthBand>('md');
  // 2026-04-21: store the raw observed Conversion-card width and derive the
  // layout on every render. Previously we cached the resolved layout in
  // state, which meant any tweak to `resolveConversionLayout` during an
  // HMR swap wouldn't take effect until the user next resized the pane.
  // By deriving per-render the new thresholds apply immediately on save.
  const [conversionCardWidth, setConversionCardWidth] = React.useState<number>(0);
  const conversionLayout = React.useMemo(
    () => resolveConversionLayout(conversionCardWidth),
    [conversionCardWidth],
  );
  const conversionBreakpoint = conversionLayout.breakpoint;
  const [liveNowMs, setLiveNowMs] = React.useState(() => Date.now());
  const [conversionRailHeight, setConversionRailHeight] = React.useState<number | null>(null);
  const measureDashboardLayout = React.useCallback(() => {
    const dashEl = dashRef.current;
    if (!dashEl) return;

    const nextWidth = dashEl.getBoundingClientRect().width;
    const nextBand = resolveDashboardWidthBand(nextWidth);
    setDashboardWidthBand((prev) => (prev === nextBand ? prev : nextBand));

    const conversionCardEl = conversionCardRef.current;
    if (conversionCardEl) {
      // Round to whole pixels so sub-pixel jitter from the ResizeObserver
      // doesn't trigger a cascade of rerenders; thresholds are in px anyway.
      const nextCardWidth = Math.round(conversionCardEl.getBoundingClientRect().width);
      setConversionCardWidth((prev) => (prev === nextCardWidth ? prev : nextCardWidth));
    }

    const nextIsNarrow = nextBand === 'xs' || nextBand === 'sm';
    if (nextIsNarrow) {
      setConversionRailHeight((prev) => (prev === null ? prev : null));
      return;
    }

    const railEl = conversionRailRef.current;
    if (!railEl) {
      setConversionRailHeight((prev) => (prev === null ? prev : null));
      return;
    }

    const nextHeight = Math.ceil(railEl.getBoundingClientRect().height);
    setConversionRailHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);
  React.useLayoutEffect(() => {
    measureDashboardLayout();
  }, [measureDashboardLayout]);
  const isNarrow = dashboardWidthBand === 'xs' || dashboardWidthBand === 'sm';
  const canSeeCcl = isCclUser(userInitials);
  // Dev panel inside the CCL review modal: LZ + AC see it everywhere
  // (staging / prod), plus anyone running on localhost. Prevents the
  // previous behaviour where the hostname-only gate hid the panel from
  // the dev group in hosted envs and showed it to non-devs locally.
  const canSeeCclDevPanel = isLocalDev
    || isDevGroupOrHigher({ Initials: userInitials, Email: userEmail } as any);
  const matterStepsInline = canSeeCcl || dashboardWidthBand === 'lg';
  const callsAndNotesNarrow = dashboardWidthBand === 'xs';
  React.useEffect(() => {
    const dashEl = dashRef.current;
    if (!dashEl) return;

    let animationFrameId: number | null = null;
    const scheduleMeasure = () => {
      if (animationFrameId !== null) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measureDashboardLayout();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });

    observer.observe(dashEl);
    if (conversionRailRef.current) {
      observer.observe(conversionRailRef.current);
    }
    if (conversionCardRef.current) {
      observer.observe(conversionCardRef.current);
    }

    window.addEventListener('resize', scheduleMeasure);
    if (isActive) {
      scheduleMeasure();
    }

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isActive, measureDashboardLayout]);
  React.useEffect(() => {
    if (!isActive) {
      return;
    }

    let timeoutId: number | null = null;
    let intervalId: number | null = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setLiveNowMs(Date.now());
    };
    const schedule = () => {
      const now = Date.now();
      const msUntilNextMinute = 60000 - (now % 60000);
      timeoutId = window.setTimeout(() => {
        tick();
        intervalId = window.setInterval(tick, 60000);
      }, msUntilNextMinute);
    };
    tick();
    schedule();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [isActive]);
  const [unclaimedRange, setUnclaimedRange] = React.useState<UnclaimedRange>('today');
  const [activityTab, setActivityTab] = React.useState<ActivityTab>('enquiries');
  const [sortKey, setSortKey] = React.useState<SortKey>('date');
  const [sortDesc, setSortDesc] = React.useState(true);
  const [matterSortKey, setMatterSortKey] = React.useState<MatterSortKey>('date');
  const [matterSortDesc, setMatterSortDesc] = React.useState(true);
  const initialCclReviewSession = React.useMemo(() => loadPersistedCclReviewSession(), []);
  const [details, setDetails] = React.useState<DetailsPayload | null>(null);
  const [detailsRequestKey, setDetailsRequestKey] = React.useState('');
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [pitchLookup, setPitchLookup] = React.useState<{
    byProspectId: Record<string, { pitchDealId?: string; pitchedBy?: string; pitchedAt?: string; pitchInstructionRef?: string; pitchStatus?: string; pitchScenarioId?: string }>;
    byEmail: Record<string, { pitchDealId?: string; pitchedBy?: string; pitchedAt?: string; pitchInstructionRef?: string; pitchStatus?: string; pitchScenarioId?: string }>;
  } | null>(null);
  const [pitchLookupLoading, setPitchLookupLoading] = React.useState(false);
  const [pitchLookupHydrated, setPitchLookupHydrated] = React.useState(false);
  const [selectedConversionKey, setSelectedConversionKey] = React.useState<string>('week-vs-last');
  const [hoveredConversionBucketKey, setHoveredConversionBucketKey] = React.useState<string | null>(null);
  // D3: stream preview modal — opened from the hover chevron on each banded
  // section. Keyed by section so the same modal can render either stream.
  const [conversionStreamPreview, setConversionStreamPreview] = React.useState<'enquiries' | 'matters' | null>(null);
  // 2026-04-20: inline ledger expansion — clicking the overflow chevron (or
  // the header chevron) expands a section's ledger beneath the trail. Card
  // height grows; paired ToDo follows via `conversionRailHeight` measurement.
  const [conversionInlineLedger, setConversionInlineLedger] = React.useState<'enquiries' | 'matters' | null>(null);
  const toggleConversionInlineLedger = React.useCallback((key: 'enquiries' | 'matters') => {
    setConversionInlineLedger((prev) => (prev === key ? null : key));
  }, []);
  const [insightPeriod, setInsightPeriod] = React.useState<InsightPeriod>(null);
  const [insightRecords, setInsightRecords] = React.useState<DetailRecord[]>([]);
  const [insightLoading, setInsightLoading] = React.useState(false);
  const [billingInsightIdx, setBillingInsightIdx] = React.useState<number | null>(null);
  const [expandedDays, setExpandedDays] = React.useState<Set<string>>(new Set());
  React.useEffect(() => { setExpandedDays(new Set()); }, [billingInsightIdx]);
  // Demo-only scrub override for the Today tile so we can preview every
  // billing-frame stage without touching fixtures. Set via mouse wheel on
  // the Today KPI tile (only when demoModeActive). Null = use real value.
  const [demoTodayOverride, setDemoTodayOverride] = React.useState<number | null>(null);
  // 2026-04-21: one-shot completion animation. When `billingStage`
  // transitions to `done` (from any non-done state), this state flips to
  // a fresh nonce so the CSS keyframe re-runs. Cleared after the animation
  // ends so it can fire again on the next done-transition (e.g. demo scrub
  // up→down→up). The stage itself is computed downstream alongside the
  // billing rail JSX, so we expose a setter that JSX calls inside an effect.
  const [billingCompletePulse, setBillingCompletePulse] = React.useState<number>(0);
  const billingStageRef = React.useRef<string>('off');
  const [cclMap, setCclMap] = React.useState<Record<string, CclStatus>>({});
  const [cclStatusResolvingByMatter, setCclStatusResolvingByMatter] = React.useState<Record<string, boolean>>({});
  const [cclStatusResolvedByMatter, setCclStatusResolvedByMatter] = React.useState<Record<string, boolean>>({});
  const [expandedCcl, setExpandedCcl] = React.useState<string | null>(null);
  const [cclDraftCache, setCclDraftCache] = React.useState<Record<string, CclDraftCacheEntry>>({});
  const [cclDraftLoading, setCclDraftLoading] = React.useState<string | null>(null);
  const [cclDocPreview, setCclDocPreview] = React.useState<{ matterId: string; embedUrl: string } | null>(null);
  const [cclFieldsModal, setCclFieldsModal] = React.useState<string | null>(null);
  const [cclLetterModal, setCclLetterModal] = React.useState<string | null>(null);
  // Ref-based keyboard nav for the CCL review modal. The render block deep-
  // sets this ref to a handler that closes over the current selectedFieldKey /
  // focus helpers; the top-level effect below simply delegates document
  // keydowns to whatever is on the ref. This avoids hoisting a large amount
  // of render-scope state to component-top level.
  const cclReviewKeyHandlerRef = React.useRef<((event: KeyboardEvent) => void) | null>(null);
  React.useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const handler = cclReviewKeyHandlerRef.current;
      if (handler) handler(event);
    };
    document.addEventListener('keydown', listener);
    return () => { document.removeEventListener('keydown', listener); };
  }, []);
  const [cclPipelineDetailModal, setCclPipelineDetailModal] = React.useState<CclPipelineDetailModal | null>(null);
  const [enquiryFollowUpModal, setEnquiryFollowUpModal] = React.useState<EnquiryFollowUpModal | null>(null);
  const [enquiryFollowUpSavingChannel, setEnquiryFollowUpSavingChannel] = React.useState<FollowUpChannel | null>(null);
  // cclReviewFocus removed — inspector-first layout; preview toggled via cclPreviewOpen
  const [cclPreviewOpen, setCclPreviewOpen] = React.useState(false);
  const [cclAiFillingMatter, setCclAiFillingMatter] = React.useState<string | null>(null);
  const [cclAiStatusByMatter, setCclAiStatusByMatter] = React.useState<Record<string, string>>({});
  const [cclAiResultByMatter, setCclAiResultByMatter] = React.useState<Record<string, { request: AiFillRequest; response: AiFillResponse; baseFields: Record<string, string> }>>({});
  const [cclCompileByMatter, setCclCompileByMatter] = React.useState<Record<string, CclCompileResponse>>({});
  const [cclAiTraceByMatter, setCclAiTraceByMatter] = React.useState<Record<string, any>>({});
  const [cclAiTraceLoadingByMatter, setCclAiTraceLoadingByMatter] = React.useState<Record<string, boolean>>({});
  const [cclAiTraceResolvedByMatter, setCclAiTraceResolvedByMatter] = React.useState<Record<string, boolean>>({});
  const [cclAiReviewedFields, setCclAiReviewedFields] = React.useState<Record<string, Set<string>>>(() => (
    Object.fromEntries(
      Object.entries(initialCclReviewSession)
        .filter(([, value]) => Array.isArray(value?.reviewedFields) && value.reviewedFields.length > 0)
        .map(([matterId, value]) => [matterId, new Set(value.reviewedFields || [])]),
    )
  ));
  const [cclSelectedReviewFieldByMatter, setCclSelectedReviewFieldByMatter] = React.useState<Record<string, string>>(() => (
    Object.fromEntries(
      Object.entries(initialCclReviewSession)
        .filter(([, value]) => typeof value?.selectedField === 'string')
        .map(([matterId, value]) => [matterId, String(value.selectedField)]),
    )
  ));
  const [cclSessionPromptExpandedByMatter, setCclSessionPromptExpandedByMatter] = React.useState<Record<string, boolean>>({});
  const [cclSessionPromptTabByMatter, setCclSessionPromptTabByMatter] = React.useState<Record<string, 'system' | 'user'>>({});
  const [cclPlaceholderRevealByMatter, setCclPlaceholderRevealByMatter] = React.useState<Record<string, boolean>>({});
  const [cclPromptContextRevealByMatter, setCclPromptContextRevealByMatter] = React.useState<Record<string, boolean>>({});
  const [cclGodModeVisibleByMatter, setCclGodModeVisibleByMatter] = React.useState<Record<string, boolean>>({});
  const [cclGodModeFieldByMatter, setCclGodModeFieldByMatter] = React.useState<Record<string, string>>({});
  const [cclGodModeValueByMatter, setCclGodModeValueByMatter] = React.useState<Record<string, string>>({});
  const [cclReviewRailPrimedByMatter, setCclReviewRailPrimedByMatter] = React.useState<Record<string, boolean>>({});
  const [cclVisibleReviewGroupByMatter, setCclVisibleReviewGroupByMatter] = React.useState<Record<string, string>>({});
  const [cclForcedIntroByMatter, setCclForcedIntroByMatter] = React.useState<Record<string, boolean>>({});
  const [cclApprovingMatter, setCclApprovingMatter] = React.useState<string | null>(null);
  const [cclApprovalStep, setCclApprovalStep] = React.useState<string>('');
  const [cclJustApproved, setCclJustApproved] = React.useState<string | null>(null);
  const [cclContactSourceByMatter, setCclContactSourceByMatter] = React.useState<Record<string, CclContactSource>>({});
  const [cclAiStreamLog, setCclAiStreamLog] = React.useState<{ key: string; value: string }[]>([]);
  const [cclPressureTestByMatter, setCclPressureTestByMatter] = React.useState<Record<string, PressureTestResponse>>({});
  const [cclPressureTestRunning, setCclPressureTestRunning] = React.useState<string | null>(null);
  const [cclPressureTestSteps, setCclPressureTestSteps] = React.useState<{ label: string; detail?: string; status: 'pending' | 'active' | 'done' | 'error' }[]>([]);
  const [cclPressureTestElapsed, setCclPressureTestElapsed] = React.useState(0);
  const [cclPressureTestError, setCclPressureTestError] = React.useState<string | null>(null);
  const [cclPressureTestContext, setCclPressureTestContext] = React.useState<{ fieldKeys: string[]; clientName: string } | null>(null);
  const cclPressureTestTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [cclLaunchHandoffMatter, setCclLaunchHandoffMatter] = React.useState<string | null>(null);
  const [cclLaunchDevHold, setCclLaunchDevHold] = React.useState(false);
  const [cclOverrideConfirmMatter, setCclOverrideConfirmMatter] = React.useState<string | null>(null);
  const [cclOverrideCardExpandedMatter, setCclOverrideCardExpandedMatter] = React.useState<string | null>(null);
  const cclLaunchHadWorkRef = React.useRef<Set<string>>(new Set());
  const cclLaunchCompletionToastShownRef = React.useRef<Set<string>>(new Set());
  const [cclReviewSummaryDismissedByMatter, setCclReviewSummaryDismissedByMatter] = React.useState<Record<string, boolean>>(() => (
    Object.fromEntries(
      Object.entries(initialCclReviewSession)
        .filter(([, value]) => !!value?.summaryDismissed)
        .map(([matterId]) => [matterId, true]),
    )
  ));
  const cclAiAutoFiredRef = React.useRef<Set<string>>(new Set());
  const lastHandledReviewRequestRef = React.useRef<number | null>(null);
  const cclActiveLaunchMatterRef = React.useRef<string | null>(null);
  const streamFeedRef = React.useRef<HTMLDivElement | null>(null);
  const cclReviewPreviewRef = React.useRef<HTMLDivElement | null>(null);
  const cclLegendRef = React.useRef<HTMLDivElement | null>(null);
  const cclLegendCollapsedRef = React.useRef(false);
  const cclReviewFieldElementRefs = React.useRef<Record<string, HTMLSpanElement | null>>({});
  const cclScrollSpyLockRef = React.useRef(false);
  const cclScrollSpyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cclScrollSpyPendingFieldRef = React.useRef<{ key: string | null; count: number }>({ key: null, count: 0 });
  const cclSelectedFieldRef = React.useRef<string | null>(null);
  const cclPageBreakObserverRef = React.useRef<ResizeObserver | null>(null);
  const cclRendererRootRef = React.useRef<HTMLDivElement>(null);
  const cclIntroPreviewModeRef = React.useRef(false);
  /** Array of page break info: each entry is { beforeBlockId, pageNumber }. First page (1) has no entry. */
  const [cclPageBreaks, setCclPageBreaks] = React.useState<Array<{ beforeBlockId: string; pageNumber: number }>>([]);
  /** Total page count derived from section measurement */
  const [cclTotalPages, setCclTotalPages] = React.useState(1);
  const [cclIntroPageBreaks, setCclIntroPageBreaks] = React.useState<Array<{ beforeBlockId: string; pageNumber: number }>>([]);
  const [cclIntroTotalPages, setCclIntroTotalPages] = React.useState(1);
  const [cclIntroCurrentPage, setCclIntroCurrentPage] = React.useState(1);
  const [cclReviewCurrentPage, setCclReviewCurrentPage] = React.useState(1);
  const [cclIntroScrollProgress, setCclIntroScrollProgress] = React.useState(0);
  const [cclHoveredPreviewPage, setCclHoveredPreviewPage] = React.useState<number | null>(null);
  const cclAutoScrollReviewRef = React.useRef<string | null>(null);
  const cclPreviewZoomRef = React.useRef(1);
  const [cclPreviewZoom, setCclPreviewZoom] = React.useState(1);
  const [cclPreviewContentHeight, setCclPreviewContentHeight] = React.useState(0);
  const [cclPreviewViewportVersion, setCclPreviewViewportVersion] = React.useState(0);

  /** Measures DocumentRenderer section heights and calculates page assignments. */
  const calcPageBreaks = React.useCallback(() => {
    const rootEl = cclRendererRootRef.current;
    if (!rootEl) return;
    const isIntroPreview = cclIntroPreviewModeRef.current;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 820 : false;
    if (isMobile) {
      if (isIntroPreview) {
        setCclIntroPageBreaks(prev => prev.length === 0 ? prev : []);
        setCclIntroTotalPages(1);
      } else {
        setCclPageBreaks(prev => prev.length === 0 ? prev : []);
        setCclTotalPages(1);
      }
      return;
    }
    const PAGE_W = 794; // canonical A4 width at 96 DPI — always use fixed width regardless of zoom
    const PAGE_H = Math.round(PAGE_W * (297 / 210)); // 1123
    const PADDING_TOP = 48;
    const PADDING_BOTTOM = 84; // reserve a Word-style footer lane on every page
    const USABLE_H = PAGE_H - PADDING_TOP - PADDING_BOTTOM;

    const blockDivs = rootEl.querySelectorAll<HTMLElement>('[data-ccl-block-id]');
    if (!blockDivs.length) return;

    const currentZoom = cclPreviewZoomRef.current || 1;
    const firstPageEl = rootEl.querySelector<HTMLElement>('[data-page-number="1"]');
    const firstPageFirstBlockEl = firstPageEl?.querySelector<HTMLElement>('[data-ccl-block-id]') || blockDivs[0];
    const firstPageFooterEl = firstPageEl?.querySelector<HTMLElement>('[data-ccl-first-page-footer]');
    const measuredFirstPageUsableH =
      firstPageFirstBlockEl && firstPageFooterEl
        ? Math.max(((firstPageFooterEl.getBoundingClientRect().top - firstPageFirstBlockEl.getBoundingClientRect().top) / currentZoom) - 10, 260)
        : null;
    const FIRST_PAGE_USABLE_H = measuredFirstPageUsableH ?? (USABLE_H - 82);

    const MIN_SECTION_START_SPACE = 74;

    let accumulated = 0;
    let pageNum = 1;
    const breaks: Array<{ beforeBlockId: string; pageNumber: number }> = [];

    blockDivs.forEach((el, i) => {
      const blockId = el.getAttribute('data-ccl-block-id');
      if (!blockId) return;
      const blockMarginBottom = parseFloat(window.getComputedStyle(el).marginBottom || '0') || 0;
      const blockH = (currentZoom !== 1 ? el.getBoundingClientRect().height / currentZoom : el.getBoundingClientRect().height) + blockMarginBottom;
      const startsTopLevelSection = i > 0 && el.getAttribute('data-ccl-top-level-start') === 'true';
      const pageUsableHeight = pageNum === 1 ? FIRST_PAGE_USABLE_H : USABLE_H;
      const remainingSpace = pageUsableHeight - accumulated;

      if (accumulated > 0 && startsTopLevelSection && remainingSpace < MIN_SECTION_START_SPACE) {
        pageNum++;
        breaks.push({ beforeBlockId: blockId, pageNumber: pageNum });
        accumulated = blockH;
      } else if (accumulated > 0 && accumulated + blockH > pageUsableHeight) {
        pageNum++;
        breaks.push({ beforeBlockId: blockId, pageNumber: pageNum });
        accumulated = blockH;
      } else {
        accumulated += blockH;
      }
    });

    if (isIntroPreview) {
      setCclIntroTotalPages(pageNum);
      setCclIntroPageBreaks(prev => {
        if (prev.length === breaks.length && prev.every((b, i) => b.beforeBlockId === breaks[i].beforeBlockId && b.pageNumber === breaks[i].pageNumber)) {
          return prev;
        }
        return breaks;
      });
    } else {
      setCclTotalPages(pageNum);
      setCclPageBreaks(prev => {
        if (prev.length === breaks.length && prev.every((b, i) => b.beforeBlockId === breaks[i].beforeBlockId && b.pageNumber === breaks[i].pageNumber)) {
          return prev;
        }
        return breaks;
      });
    }
  }, []);

  const cclReviewPageRefCallback = React.useCallback((el: HTMLDivElement | null) => {
    if (cclPageBreakObserverRef.current) {
      cclPageBreakObserverRef.current.disconnect();
      cclPageBreakObserverRef.current = null;
    }
    if (!el) return;
    const syncLayout = () => {
      setCclPreviewContentHeight(el.offsetHeight || 0);
      requestAnimationFrame(calcPageBreaks);
    };
    syncLayout();
    const observer = new ResizeObserver(() => syncLayout());
    observer.observe(el);
    cclPageBreakObserverRef.current = observer;
  }, [calcPageBreaks]);

  const updateCclPreviewZoom = React.useCallback(() => {
    const el = cclReviewPreviewRef.current;
    if (!el) return false;
    const framePaddingX = 48;
    const availableWidth = el.getBoundingClientRect().width - framePaddingX;
    if (availableWidth <= 0) return false;
    const z = availableWidth >= 794 ? 1 : Math.max(availableWidth / 794, 0.55);
    const rounded = Math.round(z * 1000) / 1000;
    if (cclPreviewZoomRef.current !== rounded) {
      cclPreviewZoomRef.current = rounded;
      setCclPreviewZoom(rounded);
      requestAnimationFrame(calcPageBreaks);
    }
    return true;
  }, [calcPageBreaks]);

  const cclReviewPreviewRefCallback = React.useCallback((el: HTMLDivElement | null) => {
    cclReviewPreviewRef.current = el;
    if (!el) return;
    setCclPreviewViewportVersion((prev) => prev + 1);
  }, []);

  // Re-run page break measurement when content changes (field edits don't always trigger resize)
  React.useEffect(() => {
    if (cclLetterModal && cclRendererRootRef.current) {
      requestAnimationFrame(calcPageBreaks);
    }
  });

  // Observe scroll container width → compute preview zoom so pages always render at 794px internally
  React.useLayoutEffect(() => {
    if (!cclLetterModal) {
      if (cclPreviewZoomRef.current !== 1) {
        cclPreviewZoomRef.current = 1;
        setCclPreviewZoom(1);
      }
      return;
    }
    const el = cclReviewPreviewRef.current;
    if (!el) return;
    let frameA = 0;
    updateCclPreviewZoom();
    frameA = window.requestAnimationFrame(updateCclPreviewZoom);
    const obs = new ResizeObserver(() => requestAnimationFrame(updateCclPreviewZoom));
    obs.observe(el);
    return () => {
      window.cancelAnimationFrame(frameA);
      obs.disconnect();
    };
  }, [cclLetterModal, cclPreviewViewportVersion, updateCclPreviewZoom]);

  const cclAiToastIdRef = React.useRef<string | null>(null);
  const cclTraceFetchingRef = React.useRef<Set<string>>(new Set());
  const cclTraceAttemptedRef = React.useRef<Set<string>>(new Set());
  const cclLetterModalOpenedAtRef = React.useRef<number>(0);
  const cclCompileOnlyLaunchRef = React.useRef<Set<string>>(new Set());
  const cclExplicitGenerateLaunchRef = React.useRef<Set<string>>(new Set());
  const cclMapRef = React.useRef(cclMap);
  cclMapRef.current = cclMap;
  const [cclStatusRefreshTick, setCclStatusRefreshTick] = React.useState(0);
  const cclStatusContextValue = React.useMemo<CclStatusContextValue>(() => ({
    byMatterId: cclMap,
    refresh: () => setCclStatusRefreshTick((tick) => tick + 1),
  }), [cclMap]);
  // Expose tick so downstream fetchers can subscribe (read-only shape today; keep silent).
  void cclStatusRefreshTick;
  const cclDraftCacheRef = React.useRef(cclDraftCache);
  cclDraftCacheRef.current = cclDraftCache;
  const [homeReviewRequest, setHomeReviewRequest] = React.useState<{ requestedAt: number; matterId?: string; openInspector?: boolean; autoRunAi?: boolean } | null>(null);

  const reviewTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const autoSizeReviewTextarea = React.useCallback((element: HTMLTextAreaElement | null) => {
    reviewTextareaRef.current = element;
    if (!element) return;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    // Re-measure after layout in case the browser hasn't computed scrollHeight yet
    requestAnimationFrame(resize);
  }, []);

  React.useEffect(() => {
    persistCclReviewSession(
      cclAiReviewedFields,
      cclSelectedReviewFieldByMatter,
      cclReviewSummaryDismissedByMatter,
    );
  }, [cclAiReviewedFields, cclSelectedReviewFieldByMatter, cclReviewSummaryDismissedByMatter]);

  const toggleReviewedFieldForMatter = React.useCallback((matterId: string, key: string) => {
    setCclAiReviewedFields((prev) => {
      const existing = new Set(prev[matterId] || []);
      if (existing.has(key)) existing.delete(key); else existing.add(key);
      return { ...prev, [matterId]: existing };
    });
  }, []);

  const dismissCclLaunchToast = React.useCallback(() => {
    if (!cclAiToastIdRef.current) return;
    hideToast(cclAiToastIdRef.current);
    cclAiToastIdRef.current = null;
  }, [hideToast]);

  const clearCclTransientLaunchState = React.useCallback((matterId?: string | null) => {
    if (matterId) {
      cclLaunchHadWorkRef.current.delete(matterId);
      cclLaunchCompletionToastShownRef.current.delete(matterId);
      cclCompileOnlyLaunchRef.current.delete(matterId);
      cclExplicitGenerateLaunchRef.current.delete(matterId);
      cclTraceAttemptedRef.current.delete(matterId);
      setCclLaunchHandoffMatter((prev) => (prev === matterId ? null : prev));
    } else {
      cclLaunchHadWorkRef.current.clear();
      cclLaunchCompletionToastShownRef.current.clear();
      cclCompileOnlyLaunchRef.current.clear();
      cclExplicitGenerateLaunchRef.current.clear();
      cclTraceAttemptedRef.current.clear();
      setCclLaunchHandoffMatter(null);
    }
    setCclPipelineDetailModal(null);
    setCclPressureTestContext(null);
    dismissCclLaunchToast();
    cclSelectedFieldRef.current = null;
    cclScrollSpyPendingFieldRef.current = { key: null, count: 0 };
  }, [dismissCclLaunchToast]);

  const dismissReviewIntroForMatter = React.useCallback((matterId: string) => {
    setCclForcedIntroByMatter((prev) => {
      if (!prev[matterId]) return prev;
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setCclReviewSummaryDismissedByMatter((prev) => ({ ...prev, [matterId]: true }));
  }, []);

  const resetCclReviewLaunchState = React.useCallback((matterId: string) => {
    clearCclTransientLaunchState(matterId);
    setCclForcedIntroByMatter((prev) => ({ ...prev, [matterId]: true }));
    setCclReviewRailPrimedByMatter((prev) => {
      if (!(matterId in prev)) return prev;
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setCclSelectedReviewFieldByMatter((prev) => {
      if (!(matterId in prev)) return prev;
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setCclReviewSummaryDismissedByMatter((prev) => {
      if (!prev[matterId]) return prev;
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    cclScrollSpyLockRef.current = true;
    setTimeout(() => { cclScrollSpyLockRef.current = false; }, 600);
  }, [clearCclTransientLaunchState]);

  const openCclLetterModal = React.useCallback((matterId: string, options?: { forceIntro?: boolean; compileOnly?: boolean }) => {
    if (cclLetterModal === matterId) {
      return;
    }
    cclLetterModalOpenedAtRef.current = Date.now();
    cclActiveLaunchMatterRef.current = matterId;
    clearCclTransientLaunchState();
    if (options?.forceIntro !== false) {
      resetCclReviewLaunchState(matterId);
    }
    const launchStatus = cclMapRef.current[matterId];
    const isCompileStage = options?.compileOnly ?? isCompileOnlyCclStatus(launchStatus);
    if (isCompileStage) {
      cclCompileOnlyLaunchRef.current.add(matterId);
    } else {
      cclCompileOnlyLaunchRef.current.delete(matterId);
    }
    setCclLetterModal(matterId);

    // Compile-stage matters have no draft yet — seed empty cache + resolve trace
    // so the modal skips the draft fetch and goes straight to generation.
    if (isCompileStage && !cclDraftCacheRef.current[matterId]?.fields) {
      const entry: CclDraftCacheEntry = { fields: {} as Record<string, string> };
      cclDraftCacheRef.current[matterId] = entry;
      setCclDraftCache(prev => ({ ...prev, [matterId]: entry }));
      setCclAiTraceResolvedByMatter(prev => prev[matterId] ? prev : { ...prev, [matterId]: true });
      setCclAiTraceLoadingByMatter(prev => prev[matterId] ? { ...prev, [matterId]: false } : prev);
      setCclDraftLoading(prev => prev === matterId ? null : prev);
      console.log('[CCL modal] compile-stage — seeded empty draft, skipping fetch for', matterId);
    }

    // Fetch draft immediately — not via an effect (avoids cancellation race)
    // Re-fetch when draft is missing/null so repeated launches don't dead-end on stale empty cache.
    const cachedDraft = cclDraftCacheRef.current[matterId];
    const needsDraftMetadata = !cachedDraft?.loadInfo && !Number(cclMapRef.current[matterId]?.version || 0);
    const shouldFetchDraft = cachedDraft === undefined || !cachedDraft?.fields || needsDraftMetadata;
    if (shouldFetchDraft) {
      console.log('[CCL modal] fetching draft for', matterId);
      setCclDraftLoading(matterId);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      fetch(buildCclApiUrl(`/api/ccl/${encodeURIComponent(matterId)}`), { signal: controller.signal, credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error(`Draft fetch failed: ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log('[CCL modal] draft loaded', matterId, !!data?.json);
          const fields = data?.json && typeof data.json === 'object' ? data.json : {};
          setCclDraftCache(prev => ({ ...prev, [matterId]: { fields, docUrl: data?.url || undefined, loadInfo: data?.loadInfo || prev[matterId]?.loadInfo } }));
          // Hydrate persisted pressure-test result so the PT ceremony doesn't replay
          if (data?.pressureTest?.fieldScores) {
            setCclPressureTestByMatter(prev => ({ ...prev, [matterId]: data.pressureTest }));
          }
        })
        .catch(err => {
          console.warn('[CCL modal] draft fetch failed', matterId, err?.message);
          setCclDraftCache(prev => ({ ...prev, [matterId]: { fields: null, fetchError: err?.message || 'Network error', loadInfo: prev[matterId]?.loadInfo } }));
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
          setCclDraftLoading(prev => prev === matterId ? null : prev);
        });
    } else {
      console.log('[CCL modal] draft already cached for', matterId);
    }
  }, [cclLetterModal, clearCclTransientLaunchState, resetCclReviewLaunchState]);

  const closeCclLetterModal = React.useCallback(() => {
    // Clear stuck-state flags so the modal never reopens in a stale loading state
    setCclDraftLoading(prev => prev === cclLetterModal ? null : prev);
    setCclAiFillingMatter(prev => prev === cclLetterModal ? null : prev);
    setCclPressureTestRunning(prev => prev === cclLetterModal ? null : prev);
    // Clear pressure test timer to prevent leaked intervals
    if (cclPressureTestTimerRef.current) { clearInterval(cclPressureTestTimerRef.current); cclPressureTestTimerRef.current = null; }
    setCclPressureTestError(null);
    setCclPressureTestContext(null);
    cclActiveLaunchMatterRef.current = null;
    clearCclTransientLaunchState(cclLetterModal);
    setCclOverrideConfirmMatter((prev) => (prev === cclLetterModal ? null : prev));
    setCclOverrideCardExpandedMatter((prev) => (prev === cclLetterModal ? null : prev));
    setCclLetterModal(null);
  }, [cclLetterModal, clearCclTransientLaunchState]);

  const openCclPipelineDetailModal = React.useCallback((matterId: string, kind: 'compile' | 'pressure') => {
    setCclPipelineDetailModal({ matterId, kind });
  }, []);

  const closeCclPipelineDetailModal = React.useCallback(() => {
    setCclPipelineDetailModal(null);
  }, []);

  const handleCclLetterBackdropClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    // Review is a multi-step workflow; only explicit close actions should dismiss it.
  }, [closeCclLetterModal]);

  const buildCclAiPromptSummary = React.useCallback((practiceArea?: string, description?: string) => {
    const summary = [practiceArea, description].filter((value) => !!String(value || '').trim()).join(' · ').trim();
    const fallback = 'Generate CCL draft fields from the matter context';
    const text = summary || fallback;
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  }, []);

  const buildCclAiToastMessage = React.useCallback((statusMessage: string, _promptSummary?: string) => {
    return statusMessage;
  }, []);

  const buildCclAiToastProgress = React.useCallback((phase: string, fieldCount: number, status: 'running' | 'success' | 'error') => {
    const phaseOrder: CclReviewLaunchPhase[] = ['retrieving-draft', 'compiling', 'generating', 'pressure-testing', 'handoff'];
    const normalizedPhase: CclReviewLaunchPhase = phase === 'gathering-context'
      ? 'compiling'
      : phase === 'calling-ai'
        ? (fieldCount > 0 ? 'generating' : 'compiling')
        : phase === 'retrieving-draft' || phase === 'compiling' || phase === 'generating' || phase === 'pressure-testing' || phase === 'handoff' || phase === 'complete'
          ? phase as CclReviewLaunchPhase
          : 'compiling';
    const activeIndex = normalizedPhase === 'complete' ? phaseOrder.length - 1 : Math.max(phaseOrder.indexOf(normalizedPhase), 0);
    const labels = [
      'Draft',
      'Context',
      fieldCount > 0 ? `Fields (${fieldCount})` : 'Fields',
      'Check',
      'Review',
    ];
    return labels.map((label, index) => {
      let stepStatus: CclReviewLaunchStepStatus = 'pending';
      if (status === 'success' || normalizedPhase === 'complete') {
        stepStatus = 'done';
      } else if (index < activeIndex) {
        stepStatus = 'done';
      } else if (index === activeIndex) {
        stepStatus = status === 'error' ? 'error' : 'active';
      }
      return { label, status: stepStatus };
    });
  }, []);

  const buildCclReviewLaunchSteps = React.useCallback((options: {
    hasDraft: boolean;
    draftLoading: boolean;
    hasAiContext: boolean;
    traceLoading: boolean;
    aiRunning: boolean;
    aiStatusMessage: string;
    pressureReady: boolean;
    pressureRunning: boolean;
    pressureErrored: boolean;
    handoffActive: boolean;
  }): CclReviewLaunchStep[] => {
    const compileActive = options.aiRunning && /compil/i.test(options.aiStatusMessage || '');
    const generateActive = options.aiRunning && !compileActive;
    const draftStatus: CclReviewLaunchStepStatus = options.hasDraft
      ? 'done'
      : options.draftLoading || options.traceLoading
        ? 'active'
        : 'pending';
    const compileStatus: CclReviewLaunchStepStatus = options.hasAiContext || generateActive || options.pressureRunning || options.pressureReady || options.pressureErrored
      ? 'done'
      : compileActive
        ? 'active'
        : options.hasDraft
          ? 'pending'
          : 'pending';
    const generateStatus: CclReviewLaunchStepStatus = options.hasAiContext || options.pressureRunning || options.pressureReady || options.pressureErrored
      ? 'done'
      : generateActive
        ? 'active'
        : options.hasDraft
          ? 'pending'
          : 'pending';
    const pressureStatus: CclReviewLaunchStepStatus = options.pressureErrored
      ? 'error'
      : options.pressureReady
        ? 'done'
        : options.pressureRunning || (options.hasDraft && options.hasAiContext)
          ? 'active'
          : 'pending';
    const reviewStatus: CclReviewLaunchStepStatus = options.handoffActive
      ? 'active'
      : options.hasDraft && options.hasAiContext && (options.pressureReady || options.pressureErrored)
        ? 'done'
        : 'pending';
    // Canonical pipeline vocab: Compile → Generate → Test → Review → Upload
    // (mirrors HOME_MATTER_STEP_HEADER_LABELS so one mental model across the app).
    // Draft load folds into Compile — it's the same "getting matter context ready" phase.
    const compileFoldedStatus: CclReviewLaunchStepStatus = compileStatus === 'done'
      ? 'done'
      : compileStatus === 'active'
        ? 'active'
        : draftStatus === 'active'
          ? 'active'
          : 'pending';
    // Upload is always pending during launch — it happens after the human reviews and approves.
    const uploadStatus: CclReviewLaunchStepStatus = 'pending';
    return [
      {
        label: 'Compile',
        detail: compileActive
          ? 'Pulling matter context.'
          : options.draftLoading || options.traceLoading
            ? 'Loading saved draft and context.'
            : 'Checking saved context.',
        status: compileFoldedStatus,
      },
      {
        label: 'Generate',
        detail: generateActive ? 'Writing review fields.' : 'Preparing field values.',
        status: generateStatus,
      },
      {
        label: 'Test',
        detail: options.pressureErrored ? 'Checks skipped. Review can continue.' : options.pressureRunning ? 'Checking against source evidence.' : 'Final evidence check.',
        status: pressureStatus,
      },
      {
        label: 'Review',
        detail: options.handoffActive ? 'Opening the review workspace.' : 'Waiting to open review.',
        status: reviewStatus,
      },
      {
        label: 'Upload',
        detail: 'Uploads to NetDocuments after review is approved.',
        status: uploadStatus,
      },
    ];
  }, []);

  const renderCclLaunchOverlay = React.useCallback((options: {
    matter?: MatterRecord;
    headline: string;
    body: string;
    steps: CclReviewLaunchStep[];
    tone?: 'accent' | 'success' | 'warning';
    matterDescription?: string;
    statusLabel?: string;
    instructionRef?: string;
    onRetry?: () => void;
    showRetry?: boolean;
    errorMessage?: string | null;
    devHoldActive?: boolean;
    onToggleDevHold?: () => void;
  }) => {
    const compactViewport = typeof window !== 'undefined' ? window.innerWidth <= 980 : false;
    const summaryClient = String(options.matter?.clientName || 'Client').trim();
    const summaryMatterRef = String(options.matter?.displayNumber || '').trim() || 'Matter';
    const summaryInstructionRef = String(options.instructionRef || options.matter?.instructionRef || '').trim();
    const activeStepIndex = options.steps.findIndex((step) => step.status === 'active');
    const errorStepIndex = options.steps.findIndex((step) => step.status === 'error');
    const pendingStepIndex = options.steps.findIndex((step) => step.status === 'pending');
    const focusStepIndex = activeStepIndex >= 0
      ? activeStepIndex
      : errorStepIndex >= 0
        ? errorStepIndex
        : pendingStepIndex >= 0
          ? pendingStepIndex
          : Math.max(options.steps.length - 1, 0);
    const focusStep = options.steps[focusStepIndex] || options.steps[0];
    const focusStepStatus = focusStep?.status || 'pending';
    const focusStepColor = focusStepStatus === 'done'
      ? colours.green
      : focusStepStatus === 'error'
        ? colours.cta
        : colours.highlight;
    const setupCueFieldsByStep: Record<string, string[]> = {
      Draft: ['Client name', 'Matter heading', 'Instruction ref'],
      Context: ['Practice area', 'Handler details', 'Matter scope'],
      Fields: ['Costs estimate', 'Next steps', 'Disbursements'],
      Check: ['Source evidence', 'Field scoring', 'Confidence'],
      Review: ['Review queue', 'Ready to open', 'Workspace handoff'],
    };
    const setupCueFields = setupCueFieldsByStep[focusStep?.label || ''] || ['Preparing document', 'Syncing context', 'Finalising'];
    const placeholderTemplateLines = DEFAULT_CCL_TEMPLATE.split('\n').slice(0, 120);

    const renderPlaceholderLine = (line: string, lineIndex: number) => {
      const trimmed = line.replace(/\t/g, '    ');
      if (!trimmed) {
        return <div key={`blank-${lineIndex}`} style={{ height: 8 }} />;
      }
      const segments = trimmed.split(/(\{\{[^}]+\}\})/g).filter(Boolean);
      return (
        <div key={`line-${lineIndex}`} style={{ fontSize: 10.5, lineHeight: 1.55, color: '#1f2937', whiteSpace: 'pre-wrap' }}>
          {segments.map((segment, idx) => {
            const isToken = /^\{\{[^}]+\}\}$/.test(segment);
            if (!isToken) {
              return <React.Fragment key={`text-${lineIndex}-${idx}`}>{segment}</React.Fragment>;
            }
            return (
              <span
                key={`token-${lineIndex}-${idx}`}
                style={{
                  background: 'rgba(54, 144, 206, 0.14)',
                  border: '1px solid rgba(54, 144, 206, 0.32)',
                  padding: '0 4px',
                  color: '#0D2F60',
                  fontWeight: 700,
                }}
              >
                {segment}
              </span>
            );
          })}
        </div>
      );
    };

    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 30000,
          background: 'rgba(0, 3, 25, 0.82)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
          padding: compactViewport ? '0' : '20px',
        }}
        onClick={handleCclLetterBackdropClick}
      >
        <style>{`
          @keyframes cclLaunchDotPulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.14); } }
          @keyframes cclDocScan { 0% { transform: translateY(-12%); opacity: 0; } 12% { opacity: 0.46; } 50% { opacity: 0.64; } 88% { opacity: 0.46; } 100% { transform: translateY(112%); opacity: 0; } }
          @keyframes cclFieldPop { 0%, 100% { opacity: 0; transform: translateY(8px) scale(0.98); } 18%, 78% { opacity: 1; transform: translateY(0) scale(1); } }
          .ccl-setup-shell {
            width: min(1280px, 100%);
            height: 100%;
            max-height: calc(100vh - 40px);
            background: rgba(6, 23, 51, 0.98);
            border: 1px solid rgba(135, 243, 243, 0.12);
            box-shadow: var(--shadow-overlay-lg);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-radius: 2px;
          }
          .ccl-setup-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(100, 110, 120, 0.5) rgba(0, 0, 0, 0.06);
          }
          .ccl-setup-scroll::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          .ccl-setup-scroll::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.06);
          }
          .ccl-setup-scroll::-webkit-scrollbar-thumb {
            background: rgba(100, 110, 120, 0.5);
            border: 2px solid rgba(213, 216, 220, 0.5);
          }
          .ccl-setup-stage-wrap {
            flex: 1;
            min-height: 0;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 248px;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(180deg, rgba(6, 23, 51, 0.98), rgba(2, 6, 23, 0.98));
          }
          .ccl-setup-a4-stage {
            min-width: 0;
            min-height: 0;
            border: 1px solid rgba(75, 85, 99, 0.42);
            background: linear-gradient(180deg, rgba(2, 6, 23, 0.96), rgba(8, 28, 48, 0.88));
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
          }
          .ccl-setup-a4 {
            width: min(794px, 100%);
            aspect-ratio: 210 / 297;
            background: #ffffff;
            border: 1px solid rgba(54, 144, 206, 0.18);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
            position: relative;
            overflow: hidden;
            padding: 22px 26px;
            display: grid;
            align-content: start;
            gap: 4px;
            overflow: auto;
          }
          .ccl-setup-a4::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            top: -10%;
            height: 16%;
            background: linear-gradient(180deg, rgba(54, 144, 206, 0), rgba(54, 144, 206, 0.18), rgba(54, 144, 206, 0));
            animation: cclDocScan 2.4s ease-in-out infinite;
            pointer-events: none;
          }
          .ccl-setup-a4-line {
            height: 8px;
            background: rgba(13, 47, 96, 0.12);
          }
          .ccl-setup-field-chip {
            position: absolute;
            border: 1px solid rgba(54, 144, 206, 0.34);
            background: rgba(54, 144, 206, 0.12);
            color: #0D2F60;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 5px 8px;
            animation: cclFieldPop 2.1s ease-in-out infinite;
            white-space: nowrap;
          }
          .ccl-step-roller {
            min-height: 0;
            border: 1px solid rgba(75, 85, 99, 0.42);
            background: linear-gradient(180deg, rgba(2, 6, 23, 0.96), rgba(8, 28, 48, 0.88));
            padding: 14px 12px;
            display: grid;
            grid-template-rows: auto auto 1fr;
            gap: 12px;
          }
          .ccl-step-window {
            position: relative;
            height: 126px;
            overflow: hidden;
            border: 1px solid rgba(75, 85, 99, 0.42);
            background: rgba(2, 6, 23, 0.78);
          }
          .ccl-step-window::before,
          .ccl-step-window::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            height: 34px;
            z-index: 2;
            pointer-events: none;
          }
          .ccl-step-window::before {
            top: 0;
            background: linear-gradient(180deg, rgba(2,6,23,0.95), rgba(2,6,23,0));
          }
          .ccl-step-window::after {
            bottom: 0;
            background: linear-gradient(180deg, rgba(2,6,23,0), rgba(2,6,23,0.95));
          }
          .ccl-step-track {
            position: relative;
            transition: transform 360ms cubic-bezier(0.2, 0.7, 0.18, 1);
          }
          .ccl-step-row {
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 8px;
            text-align: center;
            font-size: 12px;
            font-weight: 700;
            color: #d1d5db;
            transition: opacity 220ms ease, transform 220ms ease, color 220ms ease;
          }
          .ccl-step-row.active {
            color: #f3f4f6;
            opacity: 1;
            transform: scale(1.02);
          }
          .ccl-step-row.done {
            color: #87F3F3;
            opacity: 0.58;
          }
          @media (max-width: 980px) {
            .ccl-setup-shell { max-height: 100vh; border-radius: 0; }
            .ccl-setup-stage-wrap { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
            .ccl-step-roller { grid-template-rows: auto auto auto; }
            .ccl-setup-a4 { width: min(640px, 100%); }
          }
        `}</style>

        <button
          type="button"
          onClick={closeCclLetterModal}
          style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: 'rgba(255,255,255,0.46)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
          aria-label="Close"
        >
          &times;
        </button>

        <div onClick={(event) => event.stopPropagation()} className="ccl-setup-shell">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: compactViewport ? '12px 14px' : '14px 18px', borderBottom: '1px solid rgba(135, 243, 243, 0.08)', flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: focusStepColor, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: compactViewport ? 12 : 11, fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {summaryMatterRef}
                <span style={{ color: colours.subtleGrey, fontWeight: 500 }}> · {summaryClient}</span>
              </div>
              <div style={{ marginTop: 5, fontSize: compactViewport ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                {focusStep?.label || 'Review setup'} in progress
              </div>
            </div>
            {summaryInstructionRef && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: colours.subtleGrey,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                padding: '5px 8px',
              }}>
                {summaryInstructionRef}
              </span>
            )}
          </div>

          <div className="ccl-setup-stage-wrap">
            <div className="ccl-setup-a4-stage">
              <div className="ccl-setup-a4 ccl-setup-scroll">
                {placeholderTemplateLines.map((line, index) => renderPlaceholderLine(line, index))}

                <span className="ccl-setup-field-chip" style={{ top: '16%', left: '58%', animationDelay: '0ms' }}>{setupCueFields[0] || 'Preparing field'}</span>
                <span className="ccl-setup-field-chip" style={{ top: '39%', left: '12%', animationDelay: '420ms' }}>{setupCueFields[1] || 'Syncing context'}</span>
                <span className="ccl-setup-field-chip" style={{ top: '66%', left: '49%', animationDelay: '840ms' }}>{setupCueFields[2] || 'Final checks'}</span>
              </div>
            </div>

            <div className="ccl-step-roller">
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colours.accent }}>
                Review setup
              </div>
              <div style={{ fontSize: 12.5, color: '#d1d5db', lineHeight: 1.45 }}>
                {options.body}
              </div>

              <div className="ccl-launch-timeline" role="list" aria-label="CCL review setup pipeline">
                {options.steps.map((step, index) => {
                  const isDone = step.status === 'done';
                  const isActive = step.status === 'active';
                  const isError = step.status === 'error';
                  const isPending = step.status === 'pending';
                  const dotColor = isDone ? colours.green : isActive ? colours.accent : isError ? colours.cta : 'rgba(160,160,160,0.45)';
                  const labelColor = isDone ? 'rgba(243,244,246,0.78)' : isActive ? '#f3f4f6' : isError ? colours.cta : '#7a8290';
                  const detailColor = isActive ? '#d1d5db' : 'rgba(160,160,160,0.68)';
                  const connectorColor = isDone ? 'rgba(32,178,108,0.55)' : 'rgba(75,85,99,0.35)';
                  return (
                    <div
                      key={step.label}
                      role="listitem"
                      aria-current={isActive ? 'step' : undefined}
                      className={`ccl-launch-timeline__row${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}${isError ? ' is-error' : ''}${isPending ? ' is-pending' : ''}`}
                    >
                      <div className="ccl-launch-timeline__marker" aria-hidden="true">
                        {isActive ? (
                          <span
                            className="ccl-launch-timeline__spinner"
                            style={{ borderTopColor: dotColor }}
                          />
                        ) : (
                          <span
                            className="ccl-launch-timeline__dot"
                            style={{ borderColor: dotColor, background: isDone || isError ? dotColor : 'transparent' }}
                          >
                            {isDone && (
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                                <path d="M1.5 4.2L3.2 5.8L6.5 2.4" stroke="#061733" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isError && (
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                                <path d="M2 2L6 6M6 2L2 6" stroke="#061733" strokeWidth="1.6" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                        )}
                        {index < options.steps.length - 1 && (
                          <span
                            className="ccl-launch-timeline__connector"
                            style={{ background: connectorColor }}
                          />
                        )}
                      </div>
                      <div className="ccl-launch-timeline__body">
                        <div className="ccl-launch-timeline__label" style={{ color: labelColor }}>
                          {step.label}
                        </div>
                        {step.detail && (
                          <div className="ccl-launch-timeline__detail" style={{ color: detailColor }}>
                            {step.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {options.errorMessage && (
                <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: 11.5, color: colours.cta, lineHeight: 1.5 }}>
                  {options.errorMessage}
                </div>
              )}

              {options.showRetry && options.onRetry && (
                <button
                  type="button"
                  onClick={options.onRetry}
                  style={{
                    justifySelf: 'start',
                    border: '1px solid rgba(135, 243, 243, 0.28)',
                    background: 'rgba(135, 243, 243, 0.08)',
                    color: '#f3f4f6',
                    padding: '8px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  Retry draft fetch
                </button>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [closeCclLetterModal, handleCclLetterBackdropClick]);

  React.useEffect(() => {
    cclActiveLaunchMatterRef.current = cclLetterModal;
    dismissCclLaunchToast();
    if (cclLetterModal) {
      setCclPipelineDetailModal(null);
      return;
    }
    clearCclTransientLaunchState();
  }, [cclLetterModal, clearCclTransientLaunchState, dismissCclLaunchToast]);

  React.useEffect(() => {
    if (!isLocalDev || !cclLetterModal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName || '';
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key !== CCL_LOCAL_LAUNCH_HOLD_KEY || event.repeat) return;
      event.preventDefault();
      setCclLaunchDevHold((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cclLetterModal]);

  React.useEffect(() => {
    if (cclLetterModal) return;
    setCclLaunchDevHold(false);
  }, [cclLetterModal]);

  const upsertCclAiToast = React.useCallback((options: {
    matterId: string;
    title: string;
    promptSummary: string;
    statusMessage: string;
    phase: string;
    fieldCount: number;
    type?: 'loading' | 'success' | 'error';
    persist?: boolean;
    duration?: number;
    action?: { label: string; onClick: () => void };
  }) => {
    const { matterId, title, statusMessage, phase, type = 'loading', persist, duration, action } = options;
    return cclPipelineToasts.upsert({
      matterId: matterId || '__no-matter__',
      phase,
      title,
      message: statusMessage,
      type,
      persist: persist === undefined ? null : persist,
      duration,
      action,
    });
  }, [cclPipelineToasts]);

  const isDemoMatter = React.useCallback((matter: MatterRecord): boolean => {
    const matterId = String(matter.matterId || '').toUpperCase();
    const displayNumber = String(matter.displayNumber || '').toUpperCase();
    const instructionRef = String(matter.instructionRef || '').toUpperCase();
    const clientName = String(matter.clientName || '').toUpperCase();
    return matterId.startsWith('DEMO-')
      || displayNumber.startsWith('DEMO-')
      || instructionRef.includes('HLX-DEMO')
      || clientName.startsWith('DEMO ');
  }, []);

  const demoMatterIds = React.useMemo(() => (
    recentMatters
      .filter(isDemoMatter)
      .slice(0, 3)
      .map(m => m.matterId)
      .filter(Boolean)
  ), [recentMatters, isDemoMatter]);

  const demoModeActive = React.useMemo(() => {
    if (demoModeEnabled) return true;
    try {
      return localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  }, [demoModeEnabled]);

  const pipelineSyncMeta = React.useMemo(() => {
    const lastLiveAge = formatLiveSyncAge(enquiriesLastLiveSyncAt, liveNowMs);
    if (enquiriesLiveRefreshInFlight) {
      return {
        label: 'Refreshing',
        detail: lastLiveAge ? `live ${lastLiveAge}` : 'checking live feed',
        color: isDarkMode ? colours.accent : colours.highlight,
      };
    }
    if (enquiriesUsingSnapshot) {
      return {
        label: 'Cached',
        detail: lastLiveAge ? `live ${lastLiveAge}` : 'awaiting sync',
        color: isDarkMode ? colours.yellow : colours.orange,
      };
    }
    return {
      label: 'Live',
      detail: lastLiveAge ? `updated ${lastLiveAge}` : 'watching changes',
      color: colours.green,
    };
  }, [enquiriesLastLiveSyncAt, enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, isDarkMode, liveNowMs]);

  const buildDemoCclMap = React.useCallback((demoIds: string[]): Record<string, CclStatus> => {
    if (demoIds.length === 0) return {};
    const ago = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); };
    const now = new Date().toISOString();
    const fe = userInitials || 'Demo';
    const demoMap: Record<string, CclStatus> = {};
    if (demoIds[0]) {
      demoMap[demoIds[0]] = { status: 'uploaded', version: 3, feeEarner: fe, practiceArea: 'Commercial', clientName: 'Demo Prospect', matterDescription: 'Commercial Dispute — Demo Prospect v Acme Corp', createdAt: ago(14), finalizedAt: ago(2), uploadedToNd: true };
    }
    if (demoIds[1]) {
      demoMap[demoIds[1]] = { status: 'final', version: 2, feeEarner: fe, practiceArea: 'Property', clientName: 'Demo Property Co', matterDescription: 'Property Acquisition — Land Registry Title Review', createdAt: ago(7), finalizedAt: ago(1) };
    }
    if (demoIds[2]) {
      demoMap[demoIds[2]] = { status: 'draft', version: 1, feeEarner: fe, practiceArea: 'Construction', clientName: 'Demo Builders Ltd', matterDescription: 'Construction Dispute — Defective Works Claim', createdAt: now };
    }
    return demoMap;
  }, [userInitials]);

  const seedDemoDraftCache = React.useCallback((demoIds: string[]) => {
    if (demoIds.length === 0) return;
    setCclDraftCache(prev => ({
      ...prev,
      ...(demoIds[0] ? { [demoIds[0]]: {
        fields: {
          insert_clients_name: 'Demo Prospect', client_email: 'demo.prospect@helix-law.com',
          insert_heading_eg_matter_description: 'Commercial Dispute — Demo Prospect v Acme Corp',
          name_of_person_handling_matter: 'Luke Zemanek', status: 'Partner', name: 'Luke Zemanek',
          insert_current_position_and_scope_of_retainer: 'You have a commercial dispute with Acme Corp regarding unpaid invoices totalling £45,000. We will review the contractual position, advise on merits and next steps, and correspond with the opponent to seek resolution.',
          next_steps: 'Review the documents you have provided, advise on your position, and write a Letter Before Action to Acme Corp.',
          realistic_timescale: '4-6 weeks', handler_hourly_rate: '395',
          charges_estimate_paragraph: 'I estimate the cost of the Initial Scope will be £2,500 plus VAT.',
          figure: '2,500', disbursements_paragraph: 'We cannot give an exact figure for your disbursements, but this is likely to be in the region of £350.',
        }, docUrl: undefined,
      }} : {}),
      ...(demoIds[1] ? { [demoIds[1]]: {
        fields: {
          insert_clients_name: 'Demo Property Co', client_email: 'enquiries@demo-property.co.uk',
          insert_heading_eg_matter_description: 'Property Acquisition — Land Registry Title Review',
          name_of_person_handling_matter: 'Luke Zemanek', status: 'Associate', name: 'Luke Zemanek',
          insert_current_position_and_scope_of_retainer: 'You are acquiring a commercial property at Unit 4, Riverside Business Park. We will conduct title review, raise requisitions, report on title, and handle completion.',
          next_steps: 'Review title documents, raise pre-contract enquiries, and prepare report on title.',
          realistic_timescale: '6-8 weeks', handler_hourly_rate: '325',
          charges_estimate_paragraph: 'I estimate the cost of the conveyancing will be £3,800 plus VAT and disbursements.',
          figure: '3,800', disbursements_paragraph: 'Disbursements will include Land Registry fees (approx £270), search fees (approx £350), and SDLT as applicable.',
        }, docUrl: undefined,
      }} : {}),
      ...(demoIds[2] ? { [demoIds[2]]: {
        fields: {
          insert_clients_name: 'Demo Builders Ltd', client_email: 'pm@demo-builders.co.uk',
          insert_heading_eg_matter_description: 'Construction Dispute — Defective Works Claim',
          name_of_person_handling_matter: 'Luke Zemanek', status: 'Senior Associate', name: 'Luke Zemanek',
          insert_current_position_and_scope_of_retainer: 'Your company has a construction dispute relating to defective waterproofing works at Block C, Marine Parade development. We will review the building contract, assess liability, and advise on quantum.',
          next_steps: 'Obtain and review expert surveyor report, analyse contractual defects provisions, and prepare initial claim letter.',
          realistic_timescale: '8-12 weeks', handler_hourly_rate: '350',
          charges_estimate_paragraph: 'I estimate the cost of the initial assessment and pre-action phase will be £5,000 plus VAT.',
          figure: '5,000', disbursements_paragraph: 'Disbursements will include expert surveyor fees (approx £2,500) and court fees if proceedings are issued.',
        }, docUrl: undefined,
      }} : {}),
    }));
  }, []);

  // Fetch CCL status for displayed matters; in demo mode, layer demo CCL onto actual demo matters
  React.useEffect(() => {
    if (!secondaryFetchesReady || !isActive) {
      return;
    }
    if (!recentMatters || recentMatters.length === 0) {
      setCclMap({});
      setCclStatusResolvingByMatter({});
      setCclStatusResolvedByMatter({});
      return;
    }
    const ids = recentMatters.map(m => m.matterId).filter(Boolean);
    if (ids.length === 0) {
      setCclMap({});
      setCclStatusResolvingByMatter({});
      setCclStatusResolvedByMatter({});
      return;
    }
    setCclStatusResolvingByMatter((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    setCclStatusResolvedByMatter((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = false;
      });
      return next;
    });
    let cancelled = false;
    Promise.all(chunkMatterIds(ids).map((chunk) => (
      fetchSharedJson(`ccl-batch-status:${JSON.stringify(chunk)}`, () => fetch(buildCclApiUrl('/api/ccl/batch-status'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterIds: chunk }),
      }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
    )))
      .then((batches) => {
        if (cancelled) return;
        const results = batches.reduce((acc, batch) => ({
          ...acc,
          ...((batch?.results || {}) as Record<string, CclStatus>),
        }), {} as Record<string, CclStatus>);
        const nextCclMap = demoModeActive && demoMatterIds.length > 0
          ? { ...results, ...buildDemoCclMap(demoMatterIds) }
          : results;
        setCclMap(nextCclMap);
        setCclStatusResolvedByMatter((prev) => {
          const next = { ...prev };
          ids.forEach((id) => {
            next[id] = true;
          });
          return next;
        });
        setCclStatusResolvingByMatter((prev) => {
          const next = { ...prev };
          ids.forEach((id) => {
            next[id] = false;
          });
          return next;
        });
        if (demoModeActive && demoMatterIds.length > 0) {
          seedDemoDraftCache(demoMatterIds);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const nextCclMap = demoModeActive && demoMatterIds.length > 0
          ? buildDemoCclMap(demoMatterIds)
          : {};
        setCclMap(nextCclMap);
        setCclStatusResolvedByMatter((prev) => {
          const next = { ...prev };
          ids.forEach((id) => {
            next[id] = true;
          });
          return next;
        });
        setCclStatusResolvingByMatter((prev) => {
          const next = { ...prev };
          ids.forEach((id) => {
            next[id] = false;
          });
          return next;
        });
        if (demoModeActive && demoMatterIds.length > 0) {
          seedDemoDraftCache(demoMatterIds);
        }
      });
    return () => { cancelled = true; };
  }, [recentMatters, demoModeActive, demoMatterIds, buildDemoCclMap, seedDemoDraftCache, secondaryFetchesReady, isActive]);

  const displayMatters = React.useMemo(() => {
    const list = [...recentMatters];
    const val = (m: MatterRecord): string =>
      matterSortKey === 'date' ? (m.openDate || '') : matterSortKey === 'name' ? (m.clientName || '') : matterSortKey === 'fe' ? (m.responsibleSolicitor || '') : (m.practiceArea || '');
    list.sort((a, b) => {
      const cmp = val(a).localeCompare(val(b));
      return matterSortDesc ? -cmp : cmp;
    });
    return list;
  }, [recentMatters, matterSortKey, matterSortDesc]);

  const buildContactProfile = React.useCallback((candidate: unknown, fallback: { email?: unknown; role?: unknown; rate?: unknown; sourceLabel: string }): CclContactProfile => {
    const matchedMember = findTeamMember(candidate) || findTeamMember(fallback.email);
    if (matchedMember) {
      return {
        fullName: getTeamMemberFullName(matchedMember),
        email: String(matchedMember.Email || '').trim(),
        role: String(matchedMember.Role || fallback.role || '').trim(),
        rate: formatRateValue(matchedMember.Rate || fallback.rate),
        sourceLabel: fallback.sourceLabel,
      };
    }

    return {
      fullName: String(candidate || '').trim(),
      email: String(fallback.email || '').trim(),
      role: String(fallback.role || '').trim(),
      rate: formatRateValue(fallback.rate),
      sourceLabel: fallback.sourceLabel,
    };
  }, [findTeamMember, formatRateValue, getTeamMemberFullName]);

  const resolveCclContactContext = React.useCallback((
    matterId: string,
    matter: MatterRecord | undefined,
    ccl: CclStatus | undefined,
    draftFields: Record<string, string>,
    persistedContextFields?: Record<string, any>,
  ) => {
    const explicitSupervisor = String(draftFields.name || persistedContextFields?.supervisingPartner || '').trim();
    const matterHandlerCandidate = ccl?.feeEarner || matter?.responsibleSolicitor || draftFields.name_of_person_handling_matter || persistedContextFields?.handlerName || '';
    const matterProfile = buildContactProfile(matterHandlerCandidate, {
      email: draftFields.fee_earner_email || persistedContextFields?.feeEarnerEmail || persistedContextFields?.handlerEmail,
      role: draftFields.status || persistedContextFields?.handlerRole,
      rate: draftFields.handler_hourly_rate || persistedContextFields?.handlerRate,
      sourceLabel: ccl?.feeEarner ? 'matter CCL record' : matter?.responsibleSolicitor ? 'matter responsible solicitor' : 'matter context',
    });
    const currentUserProfile = buildContactProfile(currentUserTeamMember ? getTeamMemberFullName(currentUserTeamMember) : (userEmail || userInitials || ''), {
      email: userEmail,
      role: currentUserTeamMember?.Role,
      rate: currentUserTeamMember?.Rate,
      sourceLabel: 'current signed-in user',
    });
    const hasDifferentCurrentUser = !!(
      currentUserProfile.fullName
      && matterProfile.fullName
      && normalizeTeamValue(currentUserProfile.fullName) !== normalizeTeamValue(matterProfile.fullName)
    );
    const defaultSource: CclContactSource = matterProfile.fullName ? 'matter' : 'current';
    const requestedSource = cclContactSourceByMatter[matterId] || defaultSource;
    const preferredProfile = requestedSource === 'current' ? currentUserProfile : matterProfile;
    const fallbackProfile = requestedSource === 'current' ? matterProfile : currentUserProfile;
    const activeProfile = preferredProfile.fullName ? preferredProfile : fallbackProfile;
    const supervisorProfile = explicitSupervisor
      ? buildContactProfile(explicitSupervisor, { email: '', role: 'Partner', rate: '', sourceLabel: 'draft supervisor' })
      : activeProfile.role && /partner/i.test(activeProfile.role)
        ? activeProfile
        : buildContactProfile(getTeamMemberFullName(partnerTeamMember), {
            email: partnerTeamMember?.Email,
            role: partnerTeamMember?.Role || 'Partner',
            rate: partnerTeamMember?.Rate,
            sourceLabel: 'partner fallback',
          });
    const teamContactDetails = activeTeamMembers
      .filter((member) => normalizeTeamValue(getTeamMemberFullName(member)) !== normalizeTeamValue(activeProfile.fullName))
      .slice(0, 2)
      .map((member) => {
        const name = getTeamMemberFullName(member);
        const role = String(member.Role || '').trim();
        const email = String(member.Email || '').trim();
        return [name, role ? `(${role})` : '', email ? `— ${email}` : ''].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join('\n');

    return {
      activeProfile,
      currentUserProfile,
      matterProfile,
      hasDifferentCurrentUser,
      usingSource: requestedSource,
      supervisorName: supervisorProfile.fullName,
      teamContactDetails,
    };
  }, [
    activeTeamMembers,
    buildContactProfile,
    cclContactSourceByMatter,
    currentUserTeamMember,
    getTeamMemberFullName,
    normalizeTeamValue,
    partnerTeamMember,
    userEmail,
    userInitials,
  ]);

  const applyCclContactFallbacks = React.useCallback((
    matterId: string,
    fields: Record<string, string>,
    matter: MatterRecord | undefined,
    ccl: CclStatus | undefined,
    persistedContextFields?: Record<string, any>,
  ) => {
    const setFallback = (key: string, fallback: unknown) => {
      const text = String(fallback || '').trim();
      if ((!fields[key] || !String(fields[key]).trim()) && text) fields[key] = text;
    };
    const context = resolveCclContactContext(matterId, matter, ccl, fields, persistedContextFields);
    setFallback('name_of_person_handling_matter', context.activeProfile.fullName || ccl?.feeEarner || matter?.responsibleSolicitor);
    setFallback('status', context.activeProfile.role);
    setFallback('name_of_handler', context.activeProfile.fullName);
    setFallback('handler', context.activeProfile.fullName);
    setFallback('fee_earner_email', context.activeProfile.email || userEmail);
    setFallback('email', context.activeProfile.email ? `by email at ${context.activeProfile.email}` : `via our office on ${HOME_CCL_DEFAULT_PHONE}`);
    setFallback('name', context.supervisorName);
    setFallback('handler_hourly_rate', context.activeProfile.rate);
    setFallback('names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries', context.teamContactDetails);
    setFallback('fee_earner_phone', HOME_CCL_DEFAULT_PHONE);
    setFallback('fee_earner_postal_address', HOME_CCL_DEFAULT_POSTAL_ADDRESS);
    setFallback('contact_details_for_marketing_opt_out', HOME_CCL_DEFAULT_MARKETING_CONTACT);
    return context;
  }, [resolveCclContactContext, userEmail]);

  const persistCclDraft = React.useCallback((matterId: string, fields: Record<string, string>) => {
    void fetch(buildCclApiUrl(`/api/ccl/${encodeURIComponent(matterId)}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftJson: fields, initials: userInitials || '' }),
    }).then(res => {
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    }).catch(err => {
      showToast({ type: 'error', title: 'Draft save failed', message: err?.message || 'Could not save CCL draft. Your edits may not be persisted.', persist: false, duration: 5000 });
    });
  }, [userInitials, showToast]);

  // Fetch CCL draft JSON when a matter is expanded in the audit trail
  React.useEffect(() => {
    if (!expandedCcl || !cclMap[expandedCcl]) return;
    if (cclDraftCache[expandedCcl] !== undefined) return; // already fetched
    let cancelled = false;
    setCclDraftLoading(expandedCcl);
    fetch(buildCclApiUrl(`/api/ccl/${expandedCcl}`), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Draft fetch failed: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!cancelled) {
          setCclDraftCache(prev => ({ ...prev, [expandedCcl]: { fields: data?.json || null, docUrl: data?.url || undefined, loadInfo: data?.loadInfo || prev[expandedCcl]?.loadInfo } }));
          setCclDraftLoading(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCclDraftCache(prev => ({ ...prev, [expandedCcl]: { fields: null, loadInfo: prev[expandedCcl]?.loadInfo } }));
          setCclDraftLoading(null);
        }
      });
    return () => { cancelled = true; };
  }, [expandedCcl, cclMap, cclDraftCache]);

  const runHomeCclAiAutofill = React.useCallback(async (matterId: string, options?: { overrideExisting?: boolean }) => {
    if (!matterId) return;
    const shouldOverride = !!options?.overrideExisting;
    // Override path: if a stale `cclAiFillingMatter` flag is blocking a legitimate rerun
    // (seen in prod as "button does nothing"), force-reset it and proceed. Non-override
    // path keeps the original guard so we don't double-run a live generation.
    if (cclAiFillingMatter === matterId) {
      if (shouldOverride) {
        trackClientEvent('operations-ccl', 'CCL.OverrideRerun.StuckStateCleared', { matterId });
        setCclAiFillingMatter(null);
      } else {
        trackClientEvent('operations-ccl', 'CCL.AutoFill.Skipped', { matterId, reason: 'alreadyRunning' });
        return;
      }
    }

    const matter = displayMatters.find((m) => m.matterId === matterId);
    if (!matter) {
      trackClientEvent('operations-ccl', 'CCL.AutoFill.Skipped', { matterId, reason: 'matterNotFound', override: shouldOverride });
      return;
    }
    trackClientEvent('operations-ccl', shouldOverride ? 'CCL.OverrideRerun.Confirmed' : 'CCL.AutoFill.Started', { matterId });

    const ccl = cclMap[matterId];
    const shouldOverrideExisting = shouldOverride;
    const baseFields = { ...(cclDraftCache[matterId]?.fields || {}) } as Record<string, string>;
    const setFallback = (key: string, fallback: string | undefined) => {
      if ((!baseFields[key] || !String(baseFields[key]).trim()) && fallback && String(fallback).trim()) {
        baseFields[key] = String(fallback).trim();
      }
    };

    setFallback('insert_clients_name', matter.clientName || ccl?.clientName);
    setFallback('insert_heading_eg_matter_description', ccl?.matterDescription || matter.practiceArea);
    const contactContext = applyCclContactFallbacks(matterId, baseFields, matter, ccl);

    setCclAiFillingMatter(matterId);
    setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: 'Compiling evidence…' }));
    setCclAiStreamLog([]); // Reset live feed
    setCclPressureTestByMatter((prev) => {
      if (!(matterId in prev)) return prev;
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setCclPressureTestError(null);
    if (shouldOverrideExisting) {
      setCclOverrideConfirmMatter((prev) => (prev === matterId ? null : prev));
    }

    // Keep the run in the background so the user can continue using the app.
    setCclPreviewOpen(false);

    // Snapshot base fields BEFORE AI
    const baseFieldsSnapshot = { ...baseFields };

    const aiRequest: AiFillRequest = {
      matterId,
      instructionRef: matter.instructionRef || '',
      practiceArea: matter.practiceArea || ccl?.practiceArea || '',
      description: ccl?.matterDescription || '',
      clientName: matter.clientName || ccl?.clientName || '',
      handlerName: baseFields.name_of_person_handling_matter || contactContext.activeProfile.fullName || '',
      handlerRole: baseFields.status || contactContext.activeProfile.role || '',
      handlerRate: baseFields.handler_hourly_rate || contactContext.activeProfile.rate || '',
      initials: userInitials || '',
    };
    const toastTitle = `Preparing CCL · ${matter.displayNumber || matterId}`;
    const promptSummary = buildCclAiPromptSummary(aiRequest.practiceArea, aiRequest.description);
    const showToastForThis = true;
    upsertCclAiToast({
      matterId,
      title: toastTitle,
      promptSummary,
      statusMessage: 'Compiling the matter evidence and review prompt…',
      phase: 'compiling',
      fieldCount: 0,
      type: 'loading',
      persist: true,
    });

    try {
      const compileResult = await fetchCclCompile(aiRequest);
      setCclCompileByMatter((prev) => ({ ...prev, [matterId]: compileResult.compile }));
      const compiledStatus: CclStatus = {
        ...(ccl || { status: 'compiled', version: 0 }),
        status: 'compiled',
        stage: 'compiled',
        label: 'Compiled',
        version: Math.max(Number(ccl?.version || 0), 0),
        feeEarner: ccl?.feeEarner || matter.responsibleSolicitor || baseFields.name_of_person_handling_matter,
        practiceArea: ccl?.practiceArea || matter.practiceArea,
        clientName: ccl?.clientName || matter.clientName,
        matterDescription: ccl?.matterDescription || matter.practiceArea,
        compiledAt: compileResult.compile.createdAt || new Date().toISOString(),
        compileSummary: compileResult.compile.summary,
        uploadedToClio: Boolean(ccl?.uploadedToClio),
        uploadedToNd: Boolean(ccl?.uploadedToNd),
        needsAttention: false,
        attentionReason: 'none',
        confidence: ccl?.confidence,
        unresolvedCount: ccl?.unresolvedCount || 0,
      };
      setCclMap((prev) => ({ ...prev, [matterId]: compiledStatus }));
      setCclStatusResolvedByMatter((prev) => ({ ...prev, [matterId]: true }));
      setCclStatusResolvingByMatter((prev) => ({ ...prev, [matterId]: false }));

      setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: 'Generating CCL on the backend…' }));
      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage: 'Generating draft wording and review-ready fields…',
        phase: 'generating',
        fieldCount: 0,
        type: 'loading',
        persist: true,
      });

      const serviceResult = await runCclService({
        ...aiRequest,
        draftJson: baseFieldsSnapshot,
        stage: 'home-operations',
        skipCompilePersistence: true,
        overrideMode: shouldOverrideExisting ? 'replace-ai-fields' : 'preserve-existing',
        baseVersion: typeof ccl?.version === 'number' ? ccl.version : null,
      });
      const result = serviceResult.ai;
      const merged = { ...(serviceResult.fields || {}) } as Record<string, string>;
      applyCclContactFallbacks(matterId, merged, matter, ccl, serviceResult.preview?.contextFields);
      if (merged.figure && !merged.state_amount) merged.state_amount = merged.figure;
      if (merged.state_amount && !merged.figure) merged.figure = merged.state_amount;

      setCclAiStreamLog(Object.entries(result.fields || {}).map(([key, value]) => ({ key, value })));
      setCclAiResultByMatter((prev) => ({
        ...prev,
        [matterId]: { request: aiRequest, response: result, baseFields: baseFieldsSnapshot },
      }));
      setCclDraftCache((prev) => ({
        ...prev,
        [matterId]: { ...prev[matterId], fields: merged, docUrl: serviceResult.url || prev[matterId]?.docUrl },
      }));

      const needsAttention = result.confidence !== 'full' || (serviceResult.unresolvedCount || 0) > 0;
      const nextGeneratedStatus: CclStatus = {
        ...(ccl || { status: 'generated', version: 0 }),
        status: 'generated',
        stage: 'generated',
        label: 'Generated',
        version: Math.max(Number(ccl?.version || 0), 0) + 1,
        feeEarner: ccl?.feeEarner || matter.responsibleSolicitor || merged.name_of_person_handling_matter,
        practiceArea: ccl?.practiceArea || matter.practiceArea,
        clientName: ccl?.clientName || matter.clientName,
        matterDescription: merged.insert_heading_eg_matter_description || ccl?.matterDescription || matter.practiceArea,
        createdAt: new Date().toISOString(),
        compiledAt: serviceResult.compile?.createdAt || compileResult.compile.createdAt || ccl?.compiledAt,
        compileSummary: serviceResult.compile?.summary || compileResult.compile.summary,
        uploadedToClio: Boolean(ccl?.uploadedToClio),
        uploadedToNd: Boolean(ccl?.uploadedToNd),
        needsAttention,
        attentionReason: (serviceResult.unresolvedCount || 0) > 0 ? 'missing_fields' : (needsAttention ? 'low_confidence' : 'none'),
        confidence: result.confidence,
        unresolvedCount: serviceResult.unresolvedCount || 0,
      };
      setCclMap((prev) => ({ ...prev, [matterId]: nextGeneratedStatus }));
      setCclStatusResolvedByMatter((prev) => ({ ...prev, [matterId]: true }));
      setCclStatusResolvingByMatter((prev) => ({ ...prev, [matterId]: false }));

      let finalStatus = nextGeneratedStatus;
      if (!needsAttention) {
        const approvalResult = await approveCcl(matterId, 'approved');
        if (approvalResult.ok) {
          finalStatus = {
            ...nextGeneratedStatus,
            status: approvalResult.status || 'reviewed',
            stage: 'reviewed',
            label: 'Reviewed',
            finalizedAt: approvalResult.finalizedAt || new Date().toISOString(),
            uploadedToClio: Boolean(approvalResult.uploadedToClio),
            needsAttention: false,
            attentionReason: 'none',
            unresolvedCount: 0,
          };
          setCclMap((prev) => ({ ...prev, [matterId]: finalStatus }));
          setCclAiReviewedFields((prev) => ({ ...prev, [matterId]: new Set(Object.keys(result.fields || {})) }));
          setCclReviewSummaryDismissedByMatter((prev) => ({ ...prev, [matterId]: true }));
          setCclSelectedReviewFieldByMatter((prev) => ({ ...prev, [matterId]: '__none__' }));
        }
      } else {
        resetCclReviewLaunchState(matterId);
      }

      const confidenceLabel = result.confidence === 'full' ? 'full' : result.confidence === 'partial' ? 'partial' : 'fallback';
      const statusMessage = finalStatus.stage === 'reviewed'
        ? `Backend complete · ${confidenceLabel}${result.durationMs ? ` · ${Math.round(result.durationMs / 100) / 10}s` : ''}`
        : `Draft needs review · ${confidenceLabel}${result.durationMs ? ` · ${Math.round(result.durationMs / 100) / 10}s` : ''}`;
      setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: statusMessage }));

      // Phase C1 — emit AutoFill.Completed so we can measure generation latency + confidence
      // distribution in App Insights. Fired BEFORE the optimistic 'pressure-testing' toast
      // so the Generate phase is clearly bracketed.
      trackClientEvent('operations-ccl', 'CCL.AutoFill.Completed', {
        matterId,
        fieldCount: String(Object.keys(result.fields || {}).length),
        confidence: String(result.confidence || 'unknown'),
        durationMs: String(Math.round(result.durationMs || 0)),
        unresolvedCount: String(serviceResult.unresolvedCount || 0),
        stage: String(finalStatus.stage || 'generated'),
        override: String(!!shouldOverrideExisting),
      });

      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage,
        phase: finalStatus.stage === 'reviewed' ? 'complete' : 'pressure-testing',
        fieldCount: Object.keys(result.fields || {}).length,
        type: finalStatus.stage === 'reviewed' ? 'success' : 'loading',
        persist: finalStatus.stage !== 'reviewed',
        duration: finalStatus.stage === 'reviewed' ? 6000 : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI autofill failed';
      // Phase C1 — telemetry so Azure Alerts can catch generate failures.
      trackClientEvent('operations-ccl', 'CCL.AutoFill.Failed', {
        matterId,
        error: message,
        phase: 'generating',
        override: String(!!shouldOverrideExisting),
      });
      setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: `Generation failed after compile · ${message}` }));
      setCclStatusResolvingByMatter((prev) => ({ ...prev, [matterId]: false }));
      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage: `Generation failed after compile · ${message}`,
        phase: 'generating',
        fieldCount: 0,
        type: 'error',
        persist: false,
        duration: 7000,
      });
      cclAiToastIdRef.current = null;
    } finally {
      setCclAiFillingMatter(null);
    }
  }, [applyCclContactFallbacks, buildCclAiPromptSummary, cclAiFillingMatter, cclDraftCache, cclLetterModal, cclMap, displayMatters, openCclLetterModal, upsertCclAiToast, userInitials]);

  const runPressureTest = React.useCallback(async (matterId: string, options?: { silent?: boolean }) => {
    if (!matterId) return;
    if (cclPressureTestRunning) {
      if (!options?.silent && !cclLetterModal) openCclLetterModal(cclPressureTestRunning, { forceIntro: false });
      return;
    }
    const matter = displayMatters.find((m) => m.matterId === matterId);
    const ccl = cclMap[matterId];
    const aiResult = cclAiResultByMatter[matterId];
    let persistedTrace = cclAiTraceByMatter[matterId];
    const titleRef = matter?.displayNumber || matterId;

    if (!options?.silent && !cclLetterModal) openCclLetterModal(matterId, { forceIntro: false });

    let persistedDraft = cclDraftCache[matterId]?.fields || null;
    if ((!persistedDraft || Object.keys(persistedDraft).length === 0) && ccl?.version) {
      try {
        setCclPressureTestSteps([
          { label: 'Loading generated draft', status: 'active' as const },
          { label: 'Preparing Safety Net review', status: 'pending' as const },
          { label: 'Gathering evidence', status: 'pending' as const },
          { label: 'Scoring fields against evidence', status: 'pending' as const },
        ]);
        const response = await fetch(buildCclApiUrl(`/api/ccl/${encodeURIComponent(matterId)}`), { credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(String(data?.error || `Draft fetch failed: ${response.status}`));
        }
        persistedDraft = (data?.json && typeof data.json === 'object') ? data.json as Record<string, string> : null;
        setCclDraftCache((prev) => ({
          ...prev,
          [matterId]: { fields: persistedDraft, docUrl: data?.url || prev[matterId]?.docUrl, loadInfo: data?.loadInfo || prev[matterId]?.loadInfo },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load generated CCL draft.';
        setCclPressureTestError(message);
        showToast({
          type: 'error',
          title: `Safety Net failed · ${titleRef}`,
          message,
          persist: false,
          duration: 6200,
        });
        return;
      }
    }

    if (!aiResult && !persistedTrace) {
      try {
        const traceResponse = await fetch(buildCclApiUrl(`/api/ccl-admin/traces/${encodeURIComponent(matterId)}?limit=1`), { credentials: 'include' });
        const traceData = await traceResponse.json().catch(() => null);
        if (traceResponse.ok && traceData?.traces?.length) {
          persistedTrace = traceData.traces[0] as Record<string, unknown>;
          setCclAiTraceByMatter((prev) => ({ ...prev, [matterId]: persistedTrace as any }));
        }
      } catch {
        // Trace lookup is best-effort. Pressure test can still fall back to the persisted draft.
      }
    }

    const generatedFields = (() => {
      const liveAiFields = sanitiseCclPressureTestFields(aiResult?.response?.fields as Record<string, unknown> | undefined);
      if (Object.keys(liveAiFields).length > 0) return liveAiFields;
      const traceFields = extractCclTraceFields(persistedTrace as Record<string, unknown> | null | undefined);
      if (Object.keys(traceFields).length > 0) return traceFields;
      return sanitiseCclPressureTestFields(persistedDraft as Record<string, unknown> | null | undefined);
    })();

    if (Object.keys(generatedFields).length === 0) {
      const message = 'Generate AI review context first so the Safety Net has the actual fee-earner decision fields to test.';
      setCclPressureTestError(message);
      showToast({
        type: 'error',
        title: `Safety Net blocked · ${titleRef}`,
        message,
        persist: false,
        duration: 5200,
      });
      return;
    }

    const fieldKeyList = Object.keys(generatedFields);
    const fieldCount = fieldKeyList.length;

    const toastTitle = `Preparing CCL · ${titleRef}`;
    const promptSummary = buildCclAiPromptSummary(matter?.practiceArea || ccl?.practiceArea || '', ccl?.matterDescription || matter?.practiceArea || '');

    upsertCclAiToast({
      matterId,
      title: toastTitle,
      promptSummary,
      statusMessage: `Pressure testing ${fieldCount} field${fieldCount === 1 ? '' : 's'} against source evidence…`,
      phase: 'pressure-testing',
      fieldCount,
      type: 'loading',
      persist: true,
    });

    setCclPressureTestRunning(matterId);
    setCclPressureTestError(null);
    setCclPressureTestContext({ fieldKeys: fieldKeyList, clientName: matter?.clientName || ccl?.clientName || 'Client' });
    const startMs = Date.now();
    setCclPressureTestElapsed(0);

    // Phase C1 — PressureTest.Started. Paired with Completed/Failed below so
    // we can measure Safety-Net latency + failure rate in App Insights.
    trackClientEvent('operations-ccl', 'CCL.PressureTest.Started', {
      matterId,
      fieldCount: String(fieldCount),
      silent: String(!!options?.silent),
    });

    const steps = [
      { label: 'Starting Safety Net review', detail: `${fieldCount} AI-generated fields queued`, status: 'active' as const },
      { label: 'Gathering evidence', detail: 'Emails, calls, documents, deal data', status: 'pending' as const },
      { label: 'Scoring fields against evidence', detail: `AI verification of ${fieldCount} fields`, status: 'pending' as const },
      { label: 'Compiling results', status: 'pending' as const },
    ];
    setCclPressureTestSteps([...steps]);

    if (cclPressureTestTimerRef.current) clearInterval(cclPressureTestTimerRef.current);
    cclPressureTestTimerRef.current = setInterval(() => setCclPressureTestElapsed(Date.now() - startMs), 200);

    const phaseTimers = [
      setTimeout(() => setCclPressureTestSteps(prev => prev.map((s, i) =>
        i === 0 ? { ...s, status: 'done' } : i === 1 ? { ...s, status: 'active' } : s
      )), 800),
      setTimeout(() => setCclPressureTestSteps(prev => prev.map((s, i) =>
        i <= 1 ? { ...s, status: 'done' } : i === 2 ? { ...s, status: 'active' } : s
      )), 4000),
    ];

    try {
      const result = await fetchPressureTest({
        matterId,
        instructionRef: matter?.instructionRef || '',
        generatedFields,
        practiceArea: matter?.practiceArea || '',
        clientName: matter?.clientName || '',
      });
      await approveCcl(matterId, 'pressure-tested');
      phaseTimers.forEach(clearTimeout);
      setCclPressureTestSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
      setCclPressureTestByMatter((prev) => ({ ...prev, [matterId]: result }));
      // Phase C1 — PressureTest.Completed with flaggedCount so we can trend
      // "what % of drafts need fee-earner review" over time.
      trackClientEvent('operations-ccl', 'CCL.PressureTest.Completed', {
        matterId,
        fieldCount: String(fieldCount),
        flaggedCount: String(result.flaggedCount ?? 0),
        durationMs: String(Date.now() - startMs),
        silent: String(!!options?.silent),
      });
      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage: result.flaggedCount > 0
          ? `${result.flaggedCount} field${result.flaggedCount === 1 ? '' : 's'} flagged. Opening the review workspace…`
          : 'Pressure testing complete. Opening the review workspace…',
        phase: 'complete',
        fieldCount,
        type: 'success',
        persist: false,
        duration: 5200,
      });
      cclAiToastIdRef.current = null;
      setCclMap((prev) => {
        const current = prev[matterId];
        if (!current) return prev;
        return {
          ...prev,
          [matterId]: {
            ...current,
            stage: current.stage === 'reviewed' || current.stage === 'sent' ? current.stage : 'pressure-tested',
            status: current.status === 'approved' || current.status === 'final' || current.status === 'uploaded' ? current.status : 'pressure-tested',
            label: current.stage === 'reviewed' || current.stage === 'sent' ? current.label : 'Pressure tested',
          },
        };
      });
    } catch (err: unknown) {
      phaseTimers.forEach(clearTimeout);
      console.error('[CCL] Pressure test failed:', err);
      const msg = err instanceof Error ? err.message : 'Pressure test failed';
      // Phase C1 — PressureTest.Failed so Azure Alerts pick up PT failures without
      // having to infer them from the absence of Completed events.
      trackClientEvent('operations-ccl', 'CCL.PressureTest.Failed', {
        matterId,
        error: msg,
        fieldCount: String(fieldCount),
        durationMs: String(Date.now() - startMs),
        silent: String(!!options?.silent),
      });
      setCclPressureTestError(msg);
      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage: msg,
        phase: 'pressure-testing',
        fieldCount,
        type: 'error',
        persist: false,
        duration: 6200,
      });
      cclAiToastIdRef.current = null;
      setCclPressureTestSteps(prev => prev.map(s =>
        s.status === 'active' || s.status === 'pending' ? { ...s, status: 'error' as const } : s
      ));
    } finally {
      if (cclPressureTestTimerRef.current) { clearInterval(cclPressureTestTimerRef.current); cclPressureTestTimerRef.current = null; }
      setCclPressureTestRunning(null);
      setCclPressureTestContext(null);
    }
  }, [buildCclAiPromptSummary, cclLetterModal, cclPressureTestRunning, displayMatters, cclAiResultByMatter, cclAiTraceByMatter, cclDraftCache, cclMap, openCclLetterModal, showToast, updateToast, upsertCclAiToast]);

  const openCclWorkflowModal = React.useCallback((matterId: string, options?: { forceIntro?: boolean; autoRun?: 'generate' | 'pressure'; compileOnly?: boolean }) => {
    // For compile-stage matters, skip the draft + trace fetch entirely.
    // At compile stage only context was gathered — no draft or review exists yet.
    const workflowStatus = cclMapRef.current[matterId];
    const isCompileOnly = options?.compileOnly ?? isCompileOnlyCclStatus(workflowStatus);

    // Phase 2: state-aware short-circuit — never re-run a stage that's already complete.
    // Stage progression: pending → compiled → generated → pressure-tested → reviewed → sent
    const currentStage = workflowStatus ? getCanonicalCclStage(workflowStatus.stage || workflowStatus.status) : null;
    const stagesAtOrPast = (target: 'compiled' | 'generated' | 'pressure-tested') => {
      const order: Record<string, number> = {
        pending: 0, compiled: 1, generated: 2, 'pressure-tested': 3, reviewed: 4, sent: 5,
      };
      const t = order[target] ?? 0;
      const c = currentStage ? (order[currentStage] ?? 0) : 0;
      return c >= t;
    };

    let effectiveAutoRun: 'generate' | 'pressure' | undefined = options?.autoRun;
    if (effectiveAutoRun === 'generate' && stagesAtOrPast('generated') && !isCompileOnly) {
      console.log(`[CCL workflow] Skipping auto-generate — matter ${matterId} already at stage '${currentStage}'`);
      effectiveAutoRun = undefined;
    } else if (effectiveAutoRun === 'pressure' && stagesAtOrPast('pressure-tested')) {
      console.log(`[CCL workflow] Skipping auto-pressure — matter ${matterId} already at stage '${currentStage}'`);
      effectiveAutoRun = undefined;
    }

    if (isCompileOnly) {
      cclExplicitGenerateLaunchRef.current.add(matterId);
      // Seed empty draft so openCclLetterModal's shouldFetchDraft check is false
      if (!cclDraftCacheRef.current[matterId]?.fields) {
        const entry = { fields: {} as Record<string, string> };
        cclDraftCacheRef.current[matterId] = entry;
        setCclDraftCache(prev => ({ ...prev, [matterId]: entry }));
      }
      // Mark trace as resolved — the compile trace is context, not review output
      setCclAiTraceResolvedByMatter(prev => prev[matterId] ? prev : { ...prev, [matterId]: true });
    } else if (effectiveAutoRun === 'generate') {
      cclExplicitGenerateLaunchRef.current.add(matterId);
    } else {
      cclExplicitGenerateLaunchRef.current.delete(matterId);
    }

    openCclLetterModal(matterId, { forceIntro: options?.forceIntro, compileOnly: isCompileOnly });

    // Compile-stage: auto-generate unless caller specified a different autoRun
    if (isCompileOnly && !effectiveAutoRun) {
      window.setTimeout(() => { void runHomeCclAiAutofill(matterId); }, 0);
      return;
    }
    if (effectiveAutoRun === 'generate') {
      window.setTimeout(() => {
        void runHomeCclAiAutofill(matterId);
      }, 0);
      return;
    }
    if (effectiveAutoRun === 'pressure') {
      window.setTimeout(() => {
        void runPressureTest(matterId, { silent: true });
      }, 0);
    }
  }, [openCclLetterModal, runHomeCclAiAutofill, runPressureTest]);

  const modalCclStage = cclLetterModal ? cclMap[cclLetterModal]?.stage : undefined;
  const modalCclStatus = cclLetterModal ? cclMap[cclLetterModal]?.status : undefined;
  const modalAiResult = cclLetterModal ? cclAiResultByMatter[cclLetterModal] : undefined;
  const modalSavedTrace = cclLetterModal ? cclAiTraceByMatter[cclLetterModal] : undefined;
  const modalTraceResolved = cclLetterModal ? cclAiTraceResolvedByMatter[cclLetterModal] : undefined;
  const modalTraceLoading = cclLetterModal ? cclAiTraceLoadingByMatter[cclLetterModal] : undefined;

  React.useEffect(() => {
    if (!cclLetterModal) return;
    const matterId = cclLetterModal;
    if (cclCompileOnlyLaunchRef.current.has(cclLetterModal) || isCompileOnlyCclStatus(cclMap[cclLetterModal])) {
      setCclAiTraceResolvedByMatter((prev) => prev[matterId] ? prev : { ...prev, [matterId]: true });
      setCclAiTraceLoadingByMatter((prev) => prev[matterId] ? { ...prev, [matterId]: false } : prev);
      return;
    }
    if (modalAiResult) return;
    if (modalSavedTrace) return;
    if (modalTraceResolved) return;

    // If a fetch is already in flight, wait for it to finish
    if (modalTraceLoading) return;

    // Guard via ref — prevents duplicate fetches when effect re-runs during loading
    if (cclTraceAttemptedRef.current.has(matterId)) return;
    if (cclTraceFetchingRef.current.has(matterId)) return;
    cclTraceAttemptedRef.current.add(matterId);
    cclTraceFetchingRef.current.add(matterId);
    setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [matterId]: true }));

    let active = true;
    const controller = new AbortController();
    fetch(buildCclApiUrl(`/api/ccl-admin/traces/${encodeURIComponent(matterId)}?limit=1`), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!active) return;
        if (data?.traces?.length) {
          setCclAiTraceByMatter((prev) => ({ ...prev, [matterId]: data.traces[0] }));
        }
        setCclAiTraceResolvedByMatter((prev) => ({ ...prev, [matterId]: true }));
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return;
        // Mark resolved on failure to prevent infinite re-fetch loop.
        // Without this, the effect re-triggers because resolved stays false.
        setCclAiTraceResolvedByMatter((prev) => ({ ...prev, [matterId]: true }));
      })
      .finally(() => {
        cclTraceFetchingRef.current.delete(matterId);
        setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [matterId]: false }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cclLetterModal, modalCclStage, modalCclStatus, modalAiResult, modalSavedTrace, modalTraceResolved]);

  React.useEffect(() => {
    if (!cclLetterModal) return;
    if (!(cclCompileOnlyLaunchRef.current.has(cclLetterModal) || isCompileOnlyCclStatus(cclMap[cclLetterModal]))) return;

    const cachedDraft = cclDraftCache[cclLetterModal];
    if (cachedDraft?.fields && !cachedDraft?.fetchError) return;

    const repairedEntry = {
      ...(cachedDraft || {}),
      fields: {} as Record<string, string>,
      fetchError: undefined,
    };

    cclDraftCacheRef.current[cclLetterModal] = repairedEntry;
    setCclDraftCache((prev) => {
      const current = prev[cclLetterModal];
      if (current?.fields && !current?.fetchError) return prev;
      return { ...prev, [cclLetterModal]: repairedEntry };
    });
    setCclAiTraceResolvedByMatter((prev) => prev[cclLetterModal] ? prev : { ...prev, [cclLetterModal]: true });
    setCclAiTraceLoadingByMatter((prev) => prev[cclLetterModal] ? { ...prev, [cclLetterModal]: false } : prev);
    setCclDraftLoading((prev) => prev === cclLetterModal ? null : prev);
  }, [cclLetterModal, cclMap, cclDraftCache]);

  // Auto-trigger AI fill when the letter modal opens and no saved AI context exists.
  // This removes the manual "Generate AI review" click — the review starts generating immediately.
  React.useEffect(() => {
    if (!cclLetterModal) return;
    const shouldAutoGenerate = cclExplicitGenerateLaunchRef.current.has(cclLetterModal)
      || cclCompileOnlyLaunchRef.current.has(cclLetterModal)
      || isCompileOnlyCclStatus(cclMap[cclLetterModal]);
    if (!shouldAutoGenerate) return;
    // Already have AI context — nothing to auto-trigger
    if (cclAiResultByMatter[cclLetterModal] || cclAiTraceByMatter[cclLetterModal]) return;
    // Trace fetch still in flight — wait for it to finish first
    if (cclAiTraceLoadingByMatter[cclLetterModal]) return;
    // Already running AI fill
    if (cclAiFillingMatter === cclLetterModal) return;
    // Draft not loaded yet — need it for AI context
    if (!cclDraftCache[cclLetterModal]?.fields) return;
    console.log('[CCL] Auto-triggering AI fill for', cclLetterModal);
    cclExplicitGenerateLaunchRef.current.delete(cclLetterModal);
    void runHomeCclAiAutofill(cclLetterModal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cclLetterModal, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter, cclAiFillingMatter, cclDraftCache]);

  React.useEffect(() => {
    if (!cclLetterModal) return;
    if (cclDraftLoading !== cclLetterModal) return;
    const matter = displayMatters.find((item) => item.matterId === cclLetterModal);
    const ccl = cclMap[cclLetterModal];
    upsertCclAiToast({
      matterId: cclLetterModal,
      title: `Preparing review · ${matter?.displayNumber || cclLetterModal}`,
      promptSummary: buildCclAiPromptSummary(matter?.practiceArea || ccl?.practiceArea, ccl?.matterDescription || matter?.practiceArea),
      statusMessage: 'Retrieving the latest draft and saved review context…',
      phase: 'retrieving-draft',
      fieldCount: 0,
      type: 'loading',
      persist: true,
    });
  }, [buildCclAiPromptSummary, cclDraftLoading, cclLetterModal, cclMap, displayMatters, upsertCclAiToast]);

  // Auto-trigger pressure test after AI generation completes (fire-and-forget).
  // Results surface inline in the review rail — no modal opens.
  React.useEffect(() => {
    if (!cclLetterModal) return;
    // Need AI context to test against
    const hasAiContext = !!(cclAiResultByMatter[cclLetterModal] || cclAiTraceByMatter[cclLetterModal]);
    if (!hasAiContext) return;
    // Already have PT results or PT is running
    if (cclPressureTestByMatter[cclLetterModal]) return;
    if (cclPressureTestRunning) return;
    // Draft not loaded
    if (!cclDraftCache[cclLetterModal]?.fields) return;
    // Still generating AI
    if (cclAiFillingMatter === cclLetterModal) return;
    console.log('[CCL] Auto-triggering pressure test for', cclLetterModal);
    void runPressureTest(cclLetterModal, { silent: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cclLetterModal, cclAiResultByMatter, cclAiTraceByMatter, cclPressureTestByMatter, cclPressureTestRunning, cclAiFillingMatter, cclDraftCache]);

  React.useEffect(() => {
    if (!cclLetterModal) {
      setCclLaunchHandoffMatter(null);
      return;
    }
    const matterId = cclLetterModal;
    const draftReady = !!cclDraftCache[matterId]?.fields;
    const draftLoadingHere = cclDraftLoading === matterId;
    const traceLoadingHere = !!cclAiTraceLoadingByMatter[matterId];
    const hasAiContext = !!(cclAiResultByMatter[matterId] || cclAiTraceByMatter[matterId]);
    const aiRunningHere = cclAiFillingMatter === matterId;
    const pressureRunningHere = cclPressureTestRunning === matterId;
    const pressureReady = !!cclPressureTestByMatter[matterId];
    const pressureErrored = !!cclPressureTestError && !pressureRunningHere && hasAiContext && !pressureReady;
    const launchHeldLocally = isLocalDev && cclLaunchDevHold;
    const launchNeedsWork = draftLoadingHere
      || traceLoadingHere
      || aiRunningHere
      || pressureRunningHere
      || (draftReady && !hasAiContext)
      || (draftReady && hasAiContext && !pressureReady && !pressureErrored);

    if (launchNeedsWork) {
      cclLaunchHadWorkRef.current.add(matterId);
      return;
    }

    const launchReady = draftReady && hasAiContext && (pressureReady || pressureErrored);
    if (!launchReady) return;
  if (launchHeldLocally) return;

    const hadWork = cclLaunchHadWorkRef.current.has(matterId);
    if (!hadWork) {
      setCclReviewRailPrimedByMatter((prev) => prev[matterId] ? prev : { ...prev, [matterId]: true });
      dismissCclLaunchToast();
      return;
    }

    if (cclReviewRailPrimedByMatter[matterId] || cclLaunchHandoffMatter === matterId) return;

    setCclLaunchHandoffMatter(matterId);
    dismissCclLaunchToast();
    cclLaunchCompletionToastShownRef.current.add(matterId);
  }, [cclAiFillingMatter, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter, cclDraftCache, cclDraftLoading, cclLaunchDevHold, cclLaunchHandoffMatter, cclLetterModal, cclPressureTestByMatter, cclPressureTestError, cclPressureTestRunning, cclReviewRailPrimedByMatter, dismissCclLaunchToast]);

  React.useEffect(() => {
    if (!cclLaunchHandoffMatter) return;
    const matterId = cclLaunchHandoffMatter;
    const timer = window.setTimeout(() => {
      setCclLaunchHandoffMatter((current) => current === matterId ? null : current);
      setCclReviewRailPrimedByMatter((prev) => prev[matterId] ? prev : { ...prev, [matterId]: true });
    }, 520);
    return () => window.clearTimeout(timer);
  }, [cclLaunchHandoffMatter]);

  React.useEffect(() => {
    if (!cclLetterModal || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cclLetterModal]);

  // Draft fetch for the modal now lives inside openCclLetterModal (fire-and-forget).
  // This avoids the React effect cancellation race that caused the loading spinner to stick.
  // The expandedCcl effect (above) still handles inline audit-trail expansion.

  // Helper: count unresolved template fields for a given matter
  const countUnresolved = React.useCallback((matterId: string): { count: number; names: string[] } => {
    const cached = cclDraftCache[matterId];
    if (!cached?.fields) return { count: 0, names: [] };
    const ccl = cclMap[matterId];
    const matter = displayMatters.find((m) => m.matterId === matterId);
    const norm = { ...cached.fields } as Record<string, string>;
    const fb = (k: string, v: string | undefined) => { if ((!norm[k] || !String(norm[k]).trim()) && v && String(v).trim()) norm[k] = String(v).trim(); };
    fb('insert_clients_name', matter?.clientName || ccl?.clientName);
    fb('insert_heading_eg_matter_description', ccl?.matterDescription || matter?.practiceArea);
    applyCclContactFallbacks(matterId, norm, matter, ccl);
    fb('figure', norm.state_amount); fb('state_amount', norm.figure);
    const options: GenerationOptions = {
      costsChoice: (norm.costs_section_choice as 'no_costs' | 'risk_costs') || 'risk_costs',
      chargesChoice: (norm.charges_section_choice as 'hourly_rate' | 'no_estimate') || 'hourly_rate',
      disbursementsChoice: (norm.disbursements_section_choice as 'table' | 'estimate') || 'estimate',
      showEstimateExamples: false,
    };
    const raw = generateTemplateContent(DEFAULT_CCL_TEMPLATE, norm, options);
    const names = [...new Set([...raw.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => String(m[1] || '').trim()).filter(Boolean))];
    return { count: names.length, names };
  }, [applyCclContactFallbacks, cclDraftCache, cclMap, displayMatters]);

  // Home is visibility-first: do not trigger AI or drafting side effects here.

  /* ── Derived ── */
  const breakdown = React.useMemo(() => safeBreakdown(enquiryMetricsBreakdown), [enquiryMetricsBreakdown]);
  const billingMetrics = React.useMemo(() => metrics.filter((m) => !m.title.toLowerCase().includes('outstanding')), [metrics]);
  // 2026-04-21: lift the billing-stage computation up so a useEffect can
  // observe transitions cleanly (was previously computed inside an IIFE in
  // the JSX, which made firing the completion-pulse from setState an anti-
  // pattern). Stage drives both the steady gradient and the one-shot sweep.
  const billingStage = React.useMemo<'off' | 'early' | 'mid' | 'closing' | 'done'>(() => {
    const todayMetric = billingMetrics.find((mm) => mm.title.toLowerCase().includes('today'));
    const dailyAvgMetric = billingMetrics.find((mm) => {
      const t = mm.title.toLowerCase();
      return t.includes('avg') || t.includes('av.') || t.includes('av ') || t.includes('daily');
    });
    const todayHrsRaw = todayMetric?.hours ?? 0;
    const todayHrs = (demoModeActive && demoTodayOverride !== null)
      ? demoTodayOverride
      : todayHrsRaw;
    const dialTarget = (todayMetric as any)?.dialTarget;
    // Demo mode pins the per-day target to 6.5 so the completion-border
    // animation has a deterministic trigger point.
    const targetHrs = demoModeActive
      ? 6.5
      : (typeof dialTarget === 'number' && dialTarget > 0)
        ? dialTarget
        : (dailyAvgMetric?.hours ?? todayMetric?.prevHours ?? 6);
    const progress = targetHrs > 0 ? Math.min(todayHrs / targetHrs, 1.25) : 0;
    if (progress >= 1) return 'done';
    if (progress >= 0.66) return 'closing';
    if (progress >= 0.33) return 'mid';
    if (progress > 0) return 'early';
    return 'off';
  }, [billingMetrics, demoModeActive, demoTodayOverride]);
  React.useEffect(() => {
    const wasDone = billingStageRef.current === 'done';
    billingStageRef.current = billingStage;
    if (billingStage === 'done' && !wasDone) {
      setBillingCompletePulse((n) => n + 1);
    }
  }, [billingStage]);
  const outstandingMetric = React.useMemo(() => metrics.find((m) => m.title.toLowerCase().includes('outstanding')) || null, [metrics]);
  const periodEnquiry = React.useMemo(() => enquiryMetrics?.find((m) => m.title.toLowerCase().includes('this week')) || null, [enquiryMetrics]);
  const todayEnquiry = React.useMemo(() => enquiryMetrics?.find((m) => m.title.toLowerCase().includes('today')) || null, [enquiryMetrics]);
  const conversionMetric = React.useMemo(() => enquiryMetrics?.find((m) => m.isPercentage) || null, [enquiryMetrics]);
  const monthEnquiry = React.useMemo(() => enquiryMetrics?.find((m) => m.title.toLowerCase().includes('this month') && !m.isPercentage) || null, [enquiryMetrics]);

  const effectiveUnclaimedQueueCount = React.useMemo(
    () => Math.max(0, Number(unclaimedQueueCount || 0) - claimedUnclaimedIds.size),
    [claimedUnclaimedIds.size, unclaimedQueueCount],
  );

  const claimSignal = React.useMemo(() => {
    const total = Number(periodEnquiry?.count || 0);
    const unclaimed = effectiveUnclaimedQueueCount;
    return { total, unclaimed };
  }, [effectiveUnclaimedQueueCount, periodEnquiry]);

  const topAow = React.useMemo(() => {
    const list = breakdown[period]?.aowTop ?? [];
    return [...list].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [breakdown, period]);
  const conversionRows = React.useMemo(() => conversionComparison?.items ?? [], [conversionComparison]);
  const visibleConversionRows = React.useMemo(() => {
    return conversionRows.filter((item) => item.key !== 'week-pace');
  }, [conversionRows]);
  const selectedConversionItem = React.useMemo(
    () => visibleConversionRows.find((item) => item.key === selectedConversionKey) ?? visibleConversionRows[0] ?? null,
    [selectedConversionKey, visibleConversionRows],
  );
  const selectedConversionAowMix = React.useMemo(() => {
    const list = selectedConversionItem?.currentAowMix ?? [];
    return [...list].sort((a, b) => b.count - a.count);
  }, [selectedConversionItem]);
  // 2026-04-21: pre-compute the Conversion panel sparklines once per
  // (item, breakpoint, theme) tuple instead of on every dashboard render.
  // Previously each render — including the 1-min liveNowMs tick, hover
  // pulses, and unrelated state changes — rebuilt two SVG strings inside
  // an IIFE and re-applied them via dangerouslySetInnerHTML, churning the
  // most-rendered tab.
  const conversionSparklines = React.useMemo(() => {
    const item = selectedConversionItem;
    if (!item) return null;
    const hasChart = item.chartMode !== 'none' && Array.isArray(item.buckets) && item.buckets.length > 0;
    if (!hasChart) return null;
    const breakpoint = conversionLayout.breakpoint;
    const chartWidth = breakpoint === 'wide' ? 340 : 260;
    const chartHeight = breakpoint === 'wide' ? 84 : 72;
    const sparkStroke = isDarkMode ? 'rgba(135,243,243,0.95)' : 'rgba(54,144,206,1)';
    const sparkPrevStroke = isDarkMode ? 'rgba(209,213,219,0.7)' : 'rgba(55,65,81,0.55)';
    const sparkGrid = isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.09)';
    const chartBucketLabels = item.buckets.map((b: any) => String(b?.label ?? ''));
    const chartCurrentLabel =
      item.key === 'today'
        ? 'Today'
        : item.key === 'week-vs-last'
        ? 'This week'
        : item.key === 'month-vs-last'
        ? 'This month'
        : 'Current';
    const chartPreviousLabel = item.comparisonLabel || 'Previous';
    const baseOpts = {
      stroke: sparkStroke,
      previousStroke: sparkPrevStroke,
      gridStroke: sparkGrid,
      width: chartWidth,
      height: chartHeight,
      bucketLabels: chartBucketLabels,
      currentLabel: chartCurrentLabel,
      previousLabel: chartPreviousLabel,
    } as const;
    return {
      chartWidth,
      chartHeight,
      enquiriesSVG: buildConversionPocketChartSVG(item.buckets, 'enquiries', baseOpts),
      mattersSVG: buildConversionPocketChartSVG(item.buckets, 'matters', { ...baseOpts, chartStyle: 'bar' }),
      combinedSVG: buildCombinedConversionChartSVG(item.buckets, {
        width: 560,
        height: 170,
        enquiriesStroke: sparkStroke,
        mattersStroke: isDarkMode ? colours.green : colours.green,
        enquiriesPreviousStroke: sparkPrevStroke,
        mattersPreviousStroke: isDarkMode ? 'rgba(32,178,108,0.6)' : 'rgba(32,178,108,0.7)',
        gridStroke: sparkGrid,
        bucketLabels: chartBucketLabels,
        currentLabel: chartCurrentLabel,
        previousLabel: chartPreviousLabel,
      }),
    };
  }, [selectedConversionItem, conversionLayout.breakpoint, isDarkMode]);
  const selectedConversionInsightTarget = React.useMemo<InsightPeriod>(() => {
    if (!selectedConversionItem) return null;
    if (selectedConversionItem.key === 'today') return 'today';
    if (selectedConversionItem.key === 'week-vs-last') return 'weekToDate';
    if (selectedConversionItem.key === 'month-vs-last') return 'monthToDate';
    return null;
  }, [selectedConversionItem]);
  React.useEffect(() => {
    setHoveredConversionBucketKey(null);
  }, [selectedConversionKey]);
  const useExperimentalConversion = enableConversionComparison && conversionRows.length > 0;
  const showExperimentalConversionSkeleton = enableConversionComparison && isResolvingConversionComparison;
  // When experimental conversion is paired with the ToDo slot, the panel is
  // shorter than the old pipeline+matters stack — lower the floor so ToDo can
  // cap to the measured Conversion height (D5) without being forced taller.
  const conversionTodoPaired = Boolean(useExperimentalConversion && hidePipelineAndMatters && todoSlot);
  const primaryRailMinHeight = isNarrow
    ? undefined
    : conversionTodoPaired
      ? 360
      : (useExperimentalConversion ? 440 : 520);
  // Measured height of the Conversion rail — ToDo cap (D5). Only used when
  // paired and not narrow. Falls back to the min-height floor otherwise so
  // the skeleton→live transition doesn't pop.
  const todoMatchedHeight = conversionTodoPaired && conversionRailHeight ? conversionRailHeight : undefined;
  const pipelineRailHeight = isNarrow
    ? undefined
    : Math.max(primaryRailMinHeight ?? 0, conversionRailHeight ?? 0) || undefined;
  const pipelineCardHeight = pipelineRailHeight ? Math.max(180, Math.floor((pipelineRailHeight - 8) / 2)) : undefined;
  const unclaimedRanges = React.useMemo(() => unclaimedSummary?.ranges ?? [], [unclaimedSummary]);
  const visibleUnclaimedRanges = React.useMemo(() => (
    unclaimedRanges.map((range) => {
      const items = range.items.filter((item) => !claimedUnclaimedIds.has(item.id));
      const totalValue = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
      const staleCount = items.filter((item) => item.ageDays >= 7).length;
      const oldestAgeDays = items.reduce((max, item) => Math.max(max, Number(item.ageDays || 0)), 0);
      const aowMap = new Map<string, { count: number; totalValue: number }>();
      items.forEach((item) => {
        const key = item.aow || 'Other';
        const current = aowMap.get(key) || { count: 0, totalValue: 0 };
        aowMap.set(key, {
          count: current.count + 1,
          totalValue: current.totalValue + Number(item.value || 0),
        });
      });
      return {
        ...range,
        items,
        count: items.length,
        totalValue,
        staleCount,
        oldestAgeDays,
        aowBreakdown: [...aowMap.entries()]
          .map(([key, value]) => ({ key, count: value.count, totalValue: value.totalValue }))
          .sort((left, right) => right.count - left.count),
      };
    })
  ), [claimedUnclaimedIds, unclaimedRanges]);
  const activeUnclaimedRange = React.useMemo(
    () => visibleUnclaimedRanges.find((range) => range.key === unclaimedRange) ?? null,
    [visibleUnclaimedRanges, unclaimedRange],
  );
  const ledgerUnclaimedItems = React.useMemo(() => {
    const items = activeUnclaimedRange?.items ?? [];
    return [...items].sort((left, right) => {
      const staleDelta = Number(left.ageDays || 0) - Number(right.ageDays || 0);
      if (staleDelta !== 0) return staleDelta;
      const valueDelta = Number(right.value || 0) - Number(left.value || 0);
      if (valueDelta !== 0) return valueDelta;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
  }, [activeUnclaimedRange?.items]);

  const handleClaimUnclaimed = React.useCallback(async (item: { id: string; name: string; dataSource?: 'new' | 'legacy' }) => {
    if (!userEmail || !canClaimUnclaimed || isClaimingUnclaimed) return;
    setClaimingItemId(item.id);
    setUnclaimedClaimFeedback(null);
    try {
      await triggerClaimEnquiry(item.id, userEmail, item.dataSource || 'legacy');
      setClaimedUnclaimedIds((current) => {
        const next = new Set(current);
        next.add(item.id);
        return next;
      });
      setUnclaimedClaimFeedback({
        tone: 'success',
        message: `Claimed ${item.name} and cleared one from ${activeUnclaimedRange?.label.toLowerCase() || 'the queue'}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim enquiry.';
      setUnclaimedClaimFeedback({ tone: 'error', message });
    } finally {
      setClaimingItemId(null);
    }
  }, [activeUnclaimedRange?.label, canClaimUnclaimed, isClaimingUnclaimed, triggerClaimEnquiry, userEmail]);

  const closeEnquiryFollowUpModal = React.useCallback(() => {
    if (enquiryFollowUpSavingChannel) return;
    setEnquiryFollowUpModal(null);
  }, [enquiryFollowUpSavingChannel]);

  const openEnquiryFollowUpModal = React.useCallback((record: DetailRecord) => {
    const hasLookupTarget = getDetailRecordIds(record).length > 0 || String(record.email || '').trim().length > 0;
    if (!hasLookupTarget) return;
    setEnquiryFollowUpModal({ record });
  }, []);

  const applyFollowUpSummaryToCollections = React.useCallback((targetRecord: DetailRecord, followUpSummary: DetailRecordFollowUpSummary | null) => {
    const applyToRecords = (records?: DetailRecord[]) => {
      if (!Array.isArray(records)) return records;
      return records.map((record) => (
        doDetailRecordsMatch(record, targetRecord)
          ? { ...record, followUpSummary: followUpSummary || undefined }
          : record
      ));
    };

    setDetails((current) => {
      if (!current) return current;
      return {
        ...current,
        current: current.current ? { ...current.current, records: applyToRecords(current.current.records) } : current.current,
        previous: current.previous ? { ...current.previous, records: applyToRecords(current.previous.records) } : current.previous,
      };
    });
    setInsightRecords((current) => applyToRecords(current) || []);
    setEnquiryFollowUpModal((current) => {
      if (!current || !doDetailRecordsMatch(current.record, targetRecord)) return current;
      return { record: { ...current.record, followUpSummary: followUpSummary || undefined } };
    });
  }, []);

  const recordEnquiryFollowUp = React.useCallback(async (record: DetailRecord, channel: FollowUpChannel) => {
    const lookupIds = getDetailRecordIds(record);
    const email = String(record.email || '').trim().toLowerCase();
    if (lookupIds.length === 0 && !email) return;

    setEnquiryFollowUpSavingChannel(channel);
    const toastId = showToast({
      type: 'loading',
      title: `Recording ${channel === 'email' ? 'email' : 'phone'} follow-up`,
      message: 'Saving the follow-up attempt and refreshing the Home enquiry lifecycle.',
      persist: true,
    });

    try {
      const response = await fetch('/api/home-enquiries/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiryId: record.enquiryId,
          id: record.id,
          processingEnquiryId: record.processingEnquiryId,
          pitchEnquiryId: record.pitchEnquiryId,
          legacyEnquiryId: record.legacyEnquiryId,
          email,
          channel,
          recordedBy: userEmail || userInitials || '',
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(data?.error || 'Failed to record follow-up'));
      }

      const nextSummary = (data?.followUpSummary || null) as DetailRecordFollowUpSummary | null;
      applyFollowUpSummaryToCollections(record, nextSummary);

      updateToast(toastId, {
        type: 'success',
        title: `${channel === 'email' ? 'Email' : 'Phone'} follow-up recorded`,
        message: nextSummary?.totalCount
          ? `${nextSummary.totalCount} follow-up attempt${nextSummary.totalCount === 1 ? '' : 's'} now recorded for this enquiry.`
          : 'The follow-up attempt has been recorded.',
      });
    } catch (error) {
      updateToast(toastId, {
        type: 'error',
        title: 'Follow-up not saved',
        message: error instanceof Error ? error.message : 'Failed to record follow-up',
      });
    } finally {
      setEnquiryFollowUpSavingChannel(null);
    }
  }, [applyFollowUpSummaryToCollections, showToast, updateToast, userEmail, userInitials]);

  /* pitched/mattersOpened removed — Col 3 now shows matters */

  /* ── Insight modal fetch ── */
  const openInsight = React.useCallback((p: 'today' | 'weekToDate' | 'monthToDate') => {
    if (!userEmail && !userInitials) return;
    setInsightPeriod(p);
    if (isTeamWideEnquiryView) {
      setInsightRecords(recentEnquiryRecords.filter((record) => recordFallsWithinPeriod(record.date, p)));
      setInsightLoading(false);
      return;
    }

    setInsightRecords([]);
    setInsightLoading(true);
    const params = new URLSearchParams();
    if (userEmail) params.set('email', userEmail);
    if (userInitials) params.set('initials', userInitials);
    params.set('period', p);
    params.set('limit', '50');
    const requestKey = `home-enquiries-details:${params.toString()}`;
    fetchSharedJson(requestKey, () => fetch(`/api/home-enquiries/details?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
      .then((d: DetailsPayload) => setInsightRecords(d?.current?.records || []))
        .catch(() => setInsightRecords([]))
      .finally(() => setInsightLoading(false));
      }, [isTeamWideEnquiryView, recentEnquiryRecords, userEmail, userInitials]);

  const insightLabel = insightPeriod === 'today' ? 'Today' : insightPeriod === 'weekToDate' ? 'This Week' : insightPeriod === 'monthToDate' ? 'This Month' : '';

  const insightAow = React.useMemo(() => {
    const map: Record<string, number> = {};
    insightRecords.forEach((r) => { const k = r.aow || 'Other'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [insightRecords]);

  /* ── Billing insight daily rows ── */
  const billingInsightMetric = billingInsightIdx !== null ? billingMetrics[billingInsightIdx] ?? null : null;
  const billingInsightTitle = billingInsightMetric ? shortLabel(billingInsightMetric.title) : '';
  const isRecoveredInsight = billingInsightMetric?.title.toLowerCase().includes('recovered') || billingInsightMetric?.title.toLowerCase().includes('fees');

  const billingDailyRows = React.useMemo(() => {
    if (billingInsightIdx === null || !wipDailyData) return [];
    const merge = (data: Record<string, WipDailyEntry>, label: string) =>
      Object.entries(data)
        .map(([date, d]) => ({ date, hours: d.hours, value: d.value, week: label, entries: d.entries || [] }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const currentRows = merge(wipDailyData.currentWeek, 'This week');
    const lastRows = merge(wipDailyData.lastWeek, 'Last week');
    return [...currentRows, ...lastRows];
  }, [billingInsightIdx, wipDailyData]);

  const billingCurrentRows = React.useMemo(() => billingDailyRows.filter((r) => r.week === 'This week'), [billingDailyRows]);
  const billingLastRows = React.useMemo(() => billingDailyRows.filter((r) => r.week === 'Last week'), [billingDailyRows]);
  const currentDetailsRequestKey = React.useMemo(() => {
    if (isTeamWideEnquiryView) return '';
    if (!userEmail && !userInitials) return '';
    const params = new URLSearchParams();
    if (userEmail) params.set('email', userEmail);
    if (userInitials) params.set('initials', userInitials);
    params.set('period', activityDetailsPeriod);
    params.set('limit', '500');
    params.set('includePrevious', 'false');
    return `home-enquiries-details:${params.toString()}`;
  }, [activityDetailsPeriod, isTeamWideEnquiryView, userEmail, userInitials]);

  /* ── Fetch recents ── */
  React.useEffect(() => {
    if (!isActive) return;
    if (isTeamWideEnquiryView) {
      setDetails(null);
      setDetailsRequestKey('');
      setDetailsLoading(false);
      return;
    }
    if (!userEmail && !userInitials) return;
    let active = true;
    const hasSeededRecords = recentEnquiryRecords.length > 0;
    const params = new URLSearchParams();
    if (userEmail) params.set('email', userEmail);
    if (userInitials) params.set('initials', userInitials);
    params.set('period', activityDetailsPeriod);
    params.set('limit', '500');
    params.set('includePrevious', 'false');
    if (isTeamWideEnquiryView) {
      params.set('fetchAll', 'true');
      params.set('includeTeamInbox', 'true');
    }
    const requestKey = `home-enquiries-details:${params.toString()}`;
    const runFetch = () => {
      if (!active) return;
      if (!hasSeededRecords) {
        setDetailsLoading(true);
      }
      fetchSharedJson(requestKey, () => fetch(`/api/home-enquiries/details?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
        .then((d: DetailsPayload) => {
          if (active) {
            setDetails(d);
            setDetailsRequestKey(requestKey);
          }
        })
        .catch(() => {})
        .finally(() => { if (active) setDetailsLoading(false); });
    };

    if (!hasSeededRecords) {
      setDetails(null);
      setDetailsRequestKey('');
      runFetch();
    } else if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
      setDetailsRequestKey('');
      window.requestAnimationFrame(() => {
        runFetch();
      });
    } else {
      setDetailsRequestKey('');
      runFetch();
    }

    return () => {
      active = false;
    };
  }, [activityDetailsPeriod, isTeamWideEnquiryView, recentEnquiryRecords, userEmail, userInitials, isActive]);

  /* ── Stable key for pitch-lookup deps (avoids re-fire on array reference change) ── */
  const pitchLookupKey = React.useMemo(() => {
    const lookupRecords = isTeamWideEnquiryView
      ? recentEnquiryRecords.filter((record) => recordFallsWithinPeriod(record.date, activityDetailsPeriod))
      : recentEnquiryRecords;
    const pids = [...new Set(
      lookupRecords.flatMap((r) =>
        Array.isArray(r.prospectIds) ? r.prospectIds.map((v: string) => String(v || '').trim()).filter(Boolean) : [],
      ),
    )].sort().join(',');
    const em = [...new Set(
      lookupRecords.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean),
    )].sort().join(',');
    return `${pids}|${em}`;
  }, [recentEnquiryRecords, isTeamWideEnquiryView, activityDetailsPeriod]);

  /* ── Fetch pitch evidence for ALL seeded records (not user-scoped) ── */
  React.useEffect(() => {
    if (!isActive) {
      return;
    }

    // 500ms settling delay — pitchLookupKey can change twice in quick succession
    // (snapshot hydration → live data) so we wait for it to stabilise
    const timer = setTimeout(() => {

    const lookupRecords = isTeamWideEnquiryView
      ? recentEnquiryRecords.filter((record) => recordFallsWithinPeriod(record.date, activityDetailsPeriod))
      : recentEnquiryRecords;

    if (lookupRecords.length === 0) {
      setPitchLookup(null);
      setPitchLookupLoading(false);
      setPitchLookupHydrated(true);
      return;
    }
    const prospectIds = [...new Set(
      lookupRecords.flatMap((r) =>
        Array.isArray(r.prospectIds) ? r.prospectIds.map((v: string) => String(v || '').trim()).filter(Boolean) : [],
      ),
    )];
    const emails = [...new Set(
      lookupRecords.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean),
    )];
    setPitchLookup(null);
    if (prospectIds.length === 0 && emails.length === 0) {
      setPitchLookupLoading(false);
      setPitchLookupHydrated(true);
      return;
    }
    setPitchLookupLoading(true);
    fetch('/api/home-enquiries/pitch-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospectIds, emails }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { setPitchLookup(data); })
      .catch(() => {})
      .finally(() => { setPitchLookupLoading(false); setPitchLookupHydrated(true); });

    }, 500);
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchLookupKey, isActive]);

  const recents = React.useMemo(() => {
    const seededRecords = isTeamWideEnquiryView
      ? recentEnquiryRecords.filter((record) => recordFallsWithinPeriod(record.date, activityDetailsPeriod))
      : recentEnquiryRecords;
    const seededRecordMap = new Map<string, DetailRecord>();
    seededRecords.forEach((record) => {
      getDetailRecordIds(record).forEach((key) => {
        seededRecordMap.set(key, record);
      });
    });
    const currentDetails = detailsRequestKey === currentDetailsRequestKey ? details : null;
    const currentRecordsRaw = currentDetails?.current?.records;
    const currentRecords = Array.isArray(currentRecordsRaw) ? currentRecordsRaw : [];
    const mergedCurrentRecords = currentRecords.map((record) => {
      const seeded = getDetailRecordIds(record)
        .map((key) => seededRecordMap.get(key))
        .find(Boolean);
      return seeded ? { ...seeded, ...record, dataSource: record.dataSource || seeded.dataSource } : record;
    });
    const hydratedSeededRecords = seededRecords.map((seededRecord) => {
      const enrichedRecord = mergedCurrentRecords.find((record) => doDetailRecordsMatch(record, seededRecord));
      return enrichedRecord
        ? { ...seededRecord, ...enrichedRecord, dataSource: enrichedRecord.dataSource || seededRecord.dataSource }
        : seededRecord;
    });
    const additionalDetailRecords = mergedCurrentRecords.filter(
      (record) => !seededRecords.some((seededRecord) => doDetailRecordsMatch(record, seededRecord)),
    );
    const sourceRecords = currentRecords.length > 0
      ? [...hydratedSeededRecords, ...additionalDetailRecords]
      : seededRecords;
    // Apply pitch evidence from the bulk pitch lookup to records that lack it
    const pitchedRecords = sourceRecords.map((record) => {
      if (hasPitchEvidenceForRecord(record)) return record;
      if (!pitchLookup) return record;
      const ids = Array.isArray(record.prospectIds)
        ? record.prospectIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      const matchedById = ids
        .map((pid) => pitchLookup.byProspectId[pid])
        .find(Boolean);
      const email = String(record.email || '').trim().toLowerCase();
      const matchedPitch = matchedById || (email ? pitchLookup.byEmail[email] : undefined);
      if (!matchedPitch) return record;
      return { ...record, ...matchedPitch };
    });
    const list = pitchedRecords.map((record) => {
      const enquiryId = String(record.enquiryId || record.id || '').trim();
      if (!enquiryId || !claimedRecentEnquiryIds.has(enquiryId)) return record;
      return {
        ...record,
        teamsClaimed: userInitials?.toUpperCase() || record.teamsClaimed || record.poc,
        stage: record.stage === 'enquiry' || !record.stage ? 'claimed' : record.stage,
      };
    });
    // Inject demo prospect when demo mode is active
    if (demoModeActive && !list.some((r) => r.name === 'Demo Prospect')) {
      const now = new Date();
      list.unshift({
        date: now.toISOString(),
        name: 'Demo Prospect',
        aow: 'Commercial',
        poc: userInitials?.toUpperCase() || 'LZ',
        stage: 'claimed',
        teamsClaimed: userInitials?.toUpperCase() || 'LZ',
        source: 'demo',
      });
    }
    const val = (r: DetailRecord): string =>
      sortKey === 'date' ? (r.date || '') : sortKey === 'name' ? (r.name || '') : (r.aow || '');
    list.sort((a, b) => {
      const cmp = val(a).localeCompare(val(b));
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [activityDetailsPeriod, claimedRecentEnquiryIds, currentDetailsRequestKey, details, detailsRequestKey, isTeamWideEnquiryView, pitchLookup, recentEnquiryRecords, sortKey, sortDesc, demoModeActive, userInitials]);

  const filteredRecents = React.useMemo(() => {
    return recents.filter((record) => {
      const enquiryId = String(record.enquiryId || record.id || '').trim();
      const isClaimedLocally = enquiryId.length > 0 && claimedRecentEnquiryIds.has(enquiryId);
      const activityStage = activityStageForRecord(record);
      const effectiveStage = effectiveStageForRecord(record);
      const stageImpliesClaimed = stageLevel(activityStage) >= 2 || stageLevel(effectiveStage) >= 2;
      const claimedBy = isClaimedLocally
        ? (userInitials?.toUpperCase() || record.teamsClaimed || record.poc)
        : (record.teamsClaimed || (stageImpliesClaimed ? record.poc : undefined));

      return Boolean(claimedBy || hasPitchEvidenceForRecord(record) || hasInstructionForRecord(record) || stageImpliesClaimed);
    });
  }, [claimedRecentEnquiryIds, recents, userInitials]);
  const activityVisibleCount = layoutStacked ? 6 : 8;
  const matterVisibleCount = Math.max(recentMatters.length, layoutStacked ? 6 : 8);
  const alignStackedColumns = layoutStacked && !isNarrow;
  const showInlineMatterSteps = matterStepsInline;
  const sharedDotColumnWidth = 28;
  const sharedDateColumnWidth = alignStackedColumns ? 78 : 74;
  const sharedFeColumnWidth = alignStackedColumns ? 62 : 48;
  const sharedPipelineColumnWidth = 240;
  const sharedSeparatorColumnWidth = 12;
  const matterCollapsedCclWidth = alignStackedColumns ? 78 : 62;
  const matterActionLabelWidth = showInlineMatterSteps
    ? sharedPipelineColumnWidth
    : (canSeeCcl ? matterCollapsedCclWidth : 0);
  const nameColumnMax = alignStackedColumns ? 160 : 120;
  const matterGridTemplate = `${sharedDotColumnWidth}px ${sharedDateColumnWidth}px minmax(0, ${nameColumnMax}px) 1fr`;
  const enquiryActionGridTemplate = `${HOME_ENQUIRY_NOTES_SLOT_WIDTH}px ${sharedFeColumnWidth}px ${sharedSeparatorColumnWidth}px minmax(0, ${sharedPipelineColumnWidth}px)`;
  const matterActionGridTemplate = matterActionLabelWidth > 0
    ? `${sharedFeColumnWidth}px ${sharedSeparatorColumnWidth}px minmax(0, ${matterActionLabelWidth}px)`
    : `${sharedFeColumnWidth}px`;

  const getRecentRecordKey = React.useCallback((record: DetailRecord) => {
    return String(record.enquiryId || record.id || record.pitchEnquiryId || record.legacyEnquiryId || record.date || record.name || '').trim();
  }, []);

  const getDefaultPitchScenarioForRecord = React.useCallback((record: DetailRecord) => {
    const stage = String(record.stage || record.pipelineStage || '').toLowerCase().trim();
    if (stage.includes('claim') || stage.includes('pitch')) return 'after-call-want-instruction';
    return 'before-call-call';
  }, []);

  const openEnquiryRecord = React.useCallback((record: DetailRecord, subTab?: string) => {
    const enquiryId = String(record.enquiryId || record.id || '').trim();
    if (!enquiryId) return;
    try {
      const recordKey = getRecentRecordKey(record);
      const pitchScenario = subTab === 'Pitch'
        ? (selectedPitchScenariosByRecord[recordKey] || getDefaultPitchScenarioForRecord(record))
        : undefined;
      window.dispatchEvent(new CustomEvent('navigateToEnquiry', {
        detail: subTab ? { enquiryId, subTab, pitchScenario } : { enquiryId },
      }));
    } catch (error) {
      console.error('Failed to open enquiry from home activity row', error);
    }
  }, [getDefaultPitchScenarioForRecord, getRecentRecordKey, selectedPitchScenariosByRecord]);

  const openPitchBuilderForRecord = React.useCallback((record: DetailRecord, scenarioId?: string) => {
    try {
      const recordKey = getRecentRecordKey(record);
      if (recordKey && scenarioId) {
        setSelectedPitchScenariosByRecord((current) => ({
          ...current,
          [recordKey]: scenarioId,
        }));
      }
      openEnquiryRecord(record, 'Pitch');
    } catch (error) {
      console.error('Failed to open pitch builder from home activity row', error);
    }
  }, [getRecentRecordKey, openEnquiryRecord]);

  const toggleRecentNotesTray = React.useCallback((recordKey: string) => {
    setExpandedRecentNoteIds((current) => {
      const next = new Set(current);
      if (next.has(recordKey)) {
        next.delete(recordKey);
      } else {
        next.add(recordKey);
      }
      return next;
    });
  }, []);

  const handleClaimRecentEnquiry = React.useCallback(async (record: DetailRecord) => {
    const enquiryId = String(record.enquiryId || record.id || '').trim();
    const prospectName = String(record.name || 'enquiry').trim() || 'enquiry';
    if (!enquiryId || !userEmail || isClaimingRecentEnquiry) return;

    setClaimingRecentEnquiryId(enquiryId);
    const toastId = showToast({
      type: 'loading',
      title: `Claiming ${prospectName}`,
      message: 'Updating the enquiry owner and refreshing the Teams card.',
      persist: true,
    });

    try {
      await triggerRecentClaimEnquiry(enquiryId, userEmail, record.dataSource || 'legacy');
      setClaimedRecentEnquiryIds((current) => {
        const next = new Set(current);
        next.add(enquiryId);
        return next;
      });
      updateToast(toastId, {
        type: 'success',
        title: `Claimed ${prospectName}`,
        message: 'Opening the prospect so you can carry on from Home.',
        persist: false,
        duration: 3200,
      });
      openEnquiryRecord(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim enquiry.';
      updateToast(toastId, {
        type: 'error',
        title: `Could not claim ${prospectName}`,
        message,
        persist: false,
        duration: 5200,
      });
    } finally {
      setClaimingRecentEnquiryId(null);
    }
  }, [isClaimingRecentEnquiry, openEnquiryRecord, showToast, triggerRecentClaimEnquiry, updateToast, userEmail]);

  /** Mini pipeline dot trail: P → C → P → I → M */
  const pipelineDots = (stage?: string) => {
    const level = stageLevel(stage);
    const dotEmpty = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    const stages = [1, 2, 3, 4, 5];
    return (
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: alignStackedColumns ? 'center' : 'flex-start', width: '100%' }} title={friendlyStage(stage)}>
        {stages.map((s) => {
          const reached = s <= level;
          const isCurrent = s === level;
          const isMatter = s === 5;
          const colour = !reached
            ? dotEmpty
            : isMatter
              ? colours.green
              : isCurrent
                ? accent
                : isDarkMode
                  ? `rgba(135,243,243,${0.15 + s * 0.12})`
                  : `rgba(54,144,206,${0.2 + s * 0.12})`;
          return (
            <span
              key={s}
              style={{
                width: isCurrent ? 5 : 4,
                height: isCurrent ? 5 : 4,
                borderRadius: '50%',
                background: colour,
                display: 'inline-block',
                transition: 'all 0.2s ease',
              }}
            />
          );
        })}
      </div>
    );
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc((v) => !v);
    else { setSortKey(k); setSortDesc(true); }
  };

  const toggleMatterSort = (k: MatterSortKey) => {
    if (matterSortKey === k) setMatterSortDesc((v) => !v);
    else { setMatterSortKey(k); setMatterSortDesc(true); }
  };

  /* ── Tokens ── */
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : colours.grey;
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)';
  const colHeaderBg = isDarkMode ? 'rgba(6,23,51,0.75)' : colours.helixBlue;
  const tabActiveBg = isDarkMode ? 'rgba(6,23,51,0.75)' : 'rgba(13,47,96,0.04)';
  const cardShadow = isDarkMode ? 'none' : 'inset 0 0 0 1px rgba(13,47,96,0.06), 0 1px 4px rgba(13,47,96,0.04)';
  const theadBg = isDarkMode ? 'rgba(255,255,255,0.02)' : colours.helixBlue;
  const theadText = isDarkMode ? colours.subtleGrey : colours.grey;
  const theadAccent = isDarkMode ? colours.accent : colours.dark.text;
  const hoverBg = isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(13,47,96,0.04)';
  const hoverShadow = isDarkMode ? 'inset 2px 0 0 rgba(135,243,243,0.3)' : `inset 2px 0 0 ${colours.helixBlue}`;

  const renderUnclaimedPipelinePanel = React.useCallback(() => {
    const relativeAge = (dateStr: string): string => {
      if (!dateStr) return '';
      const then = new Date(dateStr);
      if (isNaN(then.getTime())) return '';
      const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
      if (seconds < 0) return 'just now';
      if (seconds < 60) return 'just now';
      if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? `${m}m ${s}s` : `${m}m`;
      }
      if (seconds < 86400) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
      }
      const days = Math.floor(seconds / 86400);
      if (days <= 2) {
        const h = Math.floor((seconds % 86400) / 3600);
        return h > 0 ? `${days}d ${h}h` : `${days}d`;
      }
      return `${days}d`;
    };

    const unclaimedGridTemplate = canClaimUnclaimed
      ? `${sharedDotColumnWidth}px ${sharedDateColumnWidth}px minmax(0,1fr) 108px`
      : `${sharedDotColumnWidth}px ${sharedDateColumnWidth}px minmax(0,1fr)`;

    const formatShortDate = (dateStr: string): string => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    return (
    <div style={{ width: '100%', transition: 'opacity 0.2s ease' }}>
      {unclaimedClaimFeedback ? (
        <div style={{ padding: '9px 12px', border: `1px solid ${unclaimedClaimFeedback.tone === 'success' ? colours.green : colours.cta}`, background: unclaimedClaimFeedback.tone === 'success' ? (isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.06)') : (isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.06)'), fontSize: 11, color: text, lineHeight: 1.4, animation: 'opsDashFadeIn 0.2s ease both' }}>
          {unclaimedClaimFeedback.message}
        </div>
      ) : null}

      {/* Range filter tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: theadBg, borderBottom: `1px solid ${cardBorder}` }}>
        {([
          ['today', 'Today'],
          ['week', 'This week'],
          ['month', 'This month'],
        ] as const).map(([key, label]) => {
          const rangeData = visibleUnclaimedRanges.find((range) => range.key === key);
          const count = rangeData?.count ?? 0;
          return (
            <div
              key={key}
              onClick={() => setUnclaimedRange(key)}
              style={{
                flex: 1,
                padding: '9px 6px 7px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.3px',
                textAlign: 'center',
                color: text,
                borderBottom: unclaimedRange === key ? `2px solid ${accent}` : '2px solid transparent',
                cursor: 'pointer',
                userSelect: 'none',
                background: unclaimedRange === key ? tabActiveBg : 'transparent',
                transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
              }}
            >
              {label}
              {count > 0 && <span style={{ marginLeft: 3, fontSize: 8, opacity: 0.6 }}>{count}</span>}
            </div>
          );
        })}
      </div>

      {/* Column headers */}
      {!isNarrow && ledgerUnclaimedItems.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: unclaimedGridTemplate,
          alignItems: 'center',
          gap: 0,
          padding: '7px 8px 5px 4px',
          background: theadBg,
          borderBottom: `1px solid ${cardBorder}`,
        }}>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <FiFolder size={9} style={{ color: theadText, opacity: 0.8 }} />
          </span>
          <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText }}>Date</span>
          <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText }}>Prospect</span>
          {canClaimUnclaimed ? <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, textAlign: 'center' }}>Action</span> : null}
        </div>
      ) : null}

      {/* Data rows */}
      {ledgerUnclaimedItems.length > 0 ? (
        ledgerUnclaimedItems.map((item, index) => {
          const isClaimingRow = claimingItemId === item.id;
          const ageLabel = relativeAge(item.date);
          const ageTone = item.ageDays >= 7 ? colours.orange : muted;
          return (
            <div
              key={item.id}
              className="ops-enquiry-row"
              style={{ borderBottom: `1px solid ${rowBorder}`, animation: `opsDashRowFade 0.25s ease ${0.03 * index}s both` }}
            >
              <div
                style={{
                  padding: '6px 8px 6px 4px',
                  display: 'grid',
                  gridTemplateColumns: isNarrow ? '1fr' : unclaimedGridTemplate,
                  alignItems: 'center',
                  gap: 0,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* AoW dot */}
                <span style={{ display: 'flex', justifyContent: 'center', opacity: 0.55 }} title={item.aow || 'Unknown'}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: aowColor(item.aow), display: 'inline-block' }} />
                </span>

                {/* Date — relative age primary, short date secondary */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 24 }}>
                  <span style={{ fontSize: 9, color: ageTone, fontWeight: item.ageDays >= 7 ? 700 : 400, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{ageLabel}</span>
                  <span style={{ fontSize: 8, color: muted, opacity: 0.9, whiteSpace: 'nowrap', lineHeight: 1.05 }}>{formatShortDate(item.date)}</span>
                </div>

                {/* Prospect name + email / fallback subtitle */}
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {item.email || `${item.aow}${item.value > 0 ? ` · ${fmt.currency(item.value)}` : ''}`}
                  </span>
                </div>

                {/* Claim button */}
                {canClaimUnclaimed ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleClaimUnclaimed(item)}
                      disabled={isClaimingUnclaimed || !userEmail}
                      style={{
                        border: `1px solid ${colours.cta}`,
                        background: isClaimingRow ? colours.cta : 'transparent',
                        color: isClaimingRow ? colours.dark.text : colours.cta,
                        padding: '5px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: isClaimingUnclaimed && !isClaimingRow ? 'default' : 'pointer',
                        opacity: isClaimingUnclaimed && !isClaimingRow ? 0.45 : 1,
                        transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                      }}
                    >
                      {isClaimingRow ? 'Claiming…' : 'Claim'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ padding: '16px 8px', fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'center' }}>
          Nothing waiting to be picked up.
        </div>
      )}
    </div>
    );
  }, [accent, canClaimUnclaimed, cardBorder, claimingItemId, fmt, handleClaimUnclaimed, hoverBg, isClaimingUnclaimed, isDarkMode, isNarrow, ledgerUnclaimedItems, muted, rowBorder, sharedDateColumnWidth, sharedDotColumnWidth, tabActiveBg, text, theadBg, theadText, unclaimedClaimFeedback, unclaimedRange, userEmail, visibleUnclaimedRanges]);

  React.useEffect(() => {
    const handleOpenHomeCclReview = (event: Event) => {
      const detail = (event as CustomEvent<{ matterId?: string; openInspector?: boolean; autoRunAi?: boolean }>).detail;
      setHomeReviewRequest({
        requestedAt: Date.now(),
        matterId: detail?.matterId,
        openInspector: detail?.openInspector,
        autoRunAi: detail?.autoRunAi,
      });
    };

    window.addEventListener('openHomeCclReview', handleOpenHomeCclReview);
    return () => window.removeEventListener('openHomeCclReview', handleOpenHomeCclReview);
  }, []);

  React.useEffect(() => {
    const requestAt = homeReviewRequest?.requestedAt;
    if (!requestAt || lastHandledReviewRequestRef.current === requestAt) {
      return;
    }

    const requestedMatterId = homeReviewRequest?.matterId;
    const resolvedMatterId = requestedMatterId && displayMatters.some((matter) => matter.matterId === requestedMatterId)
      ? requestedMatterId
      : displayMatters.find((matter) => cclMap[matter.matterId])?.matterId || null;

    if (!resolvedMatterId) {
      return;
    }

    lastHandledReviewRequestRef.current = requestAt;
    setExpandedCcl(resolvedMatterId);

    if (homeReviewRequest?.openInspector !== false) {
      const hasExistingAiContext = !!cclAiResultByMatter[resolvedMatterId]
        || !!cclAiTraceByMatter[resolvedMatterId]
        || !!cclAiTraceLoadingByMatter[resolvedMatterId];

      if (homeReviewRequest?.autoRunAi && !hasExistingAiContext) {
        setCclPreviewOpen(false);
        void runHomeCclAiAutofill(resolvedMatterId);
      } else {
        setCclPreviewOpen(true);
        // A `review-ccl` pickup (Home ImmediateActions / Matters CCL pill) means
        // the CCL is already drafted + pressure-tested — skip the intro/generation
        // screens and drop straight onto the review rail. Only force intro when
        // we're at the compile stage (no draft yet).
        if (isCompileOnlyCclStatus(cclMap[resolvedMatterId])) {
          openCclWorkflowModal(resolvedMatterId, { forceIntro: true, compileOnly: true });
        } else {
          openCclLetterModal(resolvedMatterId, { forceIntro: false });
        }
      }
    }
  }, [homeReviewRequest, displayMatters, cclMap, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter, openCclLetterModal, openCclWorkflowModal, runHomeCclAiAutofill]);
  const cardHoverBorder = isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(13,47,96,0.18)';
  const cardHoverShadow = isDarkMode
    ? '0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(135,243,243,0.08)'
    : '0 4px 16px rgba(13,47,96,0.10), inset 0 0 0 1px rgba(13,47,96,0.10)';
  const skeletonStrong = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)';
  const skeletonSoft = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.04)';
  const skeletonTint = isDarkMode ? 'rgba(255,255,255,0.025)' : 'rgba(13,47,96,0.025)';

  const skeletonBlock = (width: string | number, height: number, extra: React.CSSProperties = {}) => (
    <div
      style={{
        width,
        height,
        background: skeletonStrong,
        borderRadius: 2,
        animation: 'opsDashPulse 1.5s ease-in-out infinite',
        ...extra,
      }}
    />
  );

  const renderConversionSkeleton = () => {
    const conversionTabs = (visibleConversionRows.length > 0
      ? visibleConversionRows.map((row) => row.key)
      : ['today', 'week-vs-last', 'month-vs-last', 'quarter-vs-last']).slice(0, 4);
    const selectedTab = conversionTabs.includes(selectedConversionKey) ? selectedConversionKey : conversionTabs[0];

    // ── Paired mode (Phase D/E layout): sub-strip + banded sections with pocket charts + trails ──
    // Mirror HomeDashboardSkeleton paired branch so Suspense fallback → internal
    // resolving skeleton → live render transitions stay visually flush.
    const paired = hidePipelineAndMatters && Boolean(todoSlot);
    if (paired) {
      // 2026-04-20: skeleton geometry mirrors the settled paired layout
      // *exactly* — same outer card, same substrip-outside-body pattern,
      // same body padding (12/14/12), same per-band padding (10px 0) with
      // borderBottom (except last), same chart width/height per breakpoint.
      // Previously the skeleton wrapped the substrip *inside* the body with
      // extra gap, which made it visibly taller than the live render — the
      // "jolt" the user noticed when the data arrived.
      // 2026-04-20: the card has ample room to the left of the chart — the
      // label/number/copy stack rarely fills its `1 1 160px` track. Widen
      // the chart so we take that space when available; flex-wrap still
      // drops the chart below when the card narrows.
      const pairedChartWidth = conversionBreakpoint === 'wide' ? 340 : 260;
      const pairedChartHeight = conversionBreakpoint === 'wide' ? 84 : 72;
      return (
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            boxShadow: cardShadow,
            display: 'flex',
            flexDirection: 'column',
            minHeight: primaryRailMinHeight,
          }}
        >
          {/* Period tabs row — padding matches live (10px 12px) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', borderBottom: `1px solid ${rowBorder}` }}>
            {conversionTabs.map((key, index) => {
              const isSelected = key === selectedTab;
              const label = key === 'week-vs-last' ? 'Week' : key === 'month-vs-last' ? 'Month' : key === 'quarter-vs-last' ? 'Quarter' : 'Today';
              return (
                <div
                  key={`conversion-skeleton-tab-paired-${key}`}
                  style={{
                    width: label === 'Today' ? 56 : 64,
                    height: 21,
                    background: isSelected ? skeletonSoft : skeletonTint,
                    border: `1px solid ${isSelected ? skeletonStrong : skeletonTint}`,
                    animation: 'opsDashPulse 1.5s ease-in-out infinite',
                    animationDelay: `${index * 0.08}s`,
                  }}
                  title={label}
                />
              );
            })}
          </div>

          {/* Conversion % substrip — OUTSIDE the body, matches live padding 8/14/8 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 14px 8px',
              borderBottom: `1px solid ${rowBorder}`,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              {skeletonBlock(72, 9, { background: skeletonTint })}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {skeletonBlock(56, 22, { background: skeletonStrong })}
                {skeletonBlock(38, 9, { background: skeletonSoft })}
              </div>
            </div>
            {skeletonBlock(108, 9, { background: skeletonTint })}
          </div>

          {/* Body — padding 12/14/12, gap 0, flex column; bands bordered individually */}
          <div style={{ padding: '12px 14px 12px', display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
            {['enquiries', 'matters'].map((key, sIdx) => {
              const isLast = sIdx === 1;
              return (
                <div
                  key={`conversion-skeleton-band-${key}`}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: '10px 0',
                    borderBottom: isLast ? 'none' : `1px solid ${rowBorder}`,
                  }}
                >
                  {/* Row 1: left stack + right chart (matches live gap 14 + rowGap 6) */}
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, flexWrap: 'wrap', rowGap: 6 }}>
                    <div style={{ flex: '1 1 160px', minWidth: 0, display: 'grid', gap: 6, alignContent: 'start' }}>
                      {skeletonBlock(sIdx === 0 ? 64 : 58, 9, { background: skeletonStrong })}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        {skeletonBlock(sIdx === 0 ? 48 : 42, 26, { background: skeletonStrong })}
                        {skeletonBlock(28, 9, { background: skeletonSoft })}
                        {sIdx === 1 ? skeletonBlock(34, 11, { background: skeletonSoft }) : null}
                      </div>
                      {skeletonBlock(sIdx === 0 ? 180 : 200, 10, { background: skeletonTint })}
                    </div>
                    <div
                      style={{
                        width: pairedChartWidth,
                        height: pairedChartHeight,
                        background: skeletonTint,
                        position: 'relative',
                        overflow: 'hidden',
                        flexShrink: 0,
                        marginLeft: 'auto',
                        animation: 'opsDashPulse 1.5s ease-in-out infinite',
                        animationDelay: `${sIdx * 0.1}s`,
                      }}
                    >
                      {[0.25, 0.5, 0.75].map((r) => (
                        <span
                          key={r}
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: Math.round(pairedChartHeight * r),
                            height: 1,
                            background: skeletonSoft,
                            opacity: 0.6,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* AoW trail — marginTop 6 matches live */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {Array.from({ length: sIdx === 0 ? 6 : 4 }).map((_, ti) => (
                      <span
                        key={`conversion-skeleton-trail-${key}-${ti}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 22,
                          padding: '0 8px',
                          border: `1px solid ${skeletonTint}`,
                          background: skeletonSoft,
                          animation: 'opsDashPulse 1.5s ease-in-out infinite',
                          animationDelay: `${ti * 0.05 + sIdx * 0.08}s`,
                        }}
                      >
                        <span style={{ width: 13, height: 13, background: skeletonTint }} />
                        <span style={{ width: 24 + (ti % 3) * 8, height: 8, background: skeletonTint }} />
                      </span>
                    ))}
                    {skeletonBlock(18, 8, { background: skeletonSoft })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── Legacy layout: hero KPI + full chart + AoW mix footer ──
    const chartTicks = selectedTab === 'today'
      ? ['8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const chartWidth = 240;
    const chartHeight = isNarrow ? 96 : 144;
    const currentLine = selectedTab === 'today'
      ? '10,70 32,62 54,66 76,54 98,50 120,44 142,52 164,42 186,38 208,46 230,40'
      : '12,82 66,62 120,56 174,46 228,34';
    const previousLine = selectedTab === 'today'
      ? '10,78 32,74 54,70 76,68 98,60 120,58 142,62 164,54 186,50 208,56 230,52'
      : '12,88 66,78 120,70 174,66 228,58';

    return (
      <div
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          boxShadow: cardShadow,
          display: 'flex',
          flexDirection: 'column',
          minHeight: primaryRailMinHeight,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', borderBottom: `1px solid ${rowBorder}` }}>
          {conversionTabs.map((key, index) => {
            const isSelected = key === selectedTab;
            const label = key === 'week-vs-last'
              ? 'Week'
              : key === 'month-vs-last'
                ? 'Month'
                : key === 'quarter-vs-last'
                  ? 'Quarter'
                  : 'Today';
            return (
              <div
                key={`conversion-skeleton-tab-${key}`}
                style={{
                  width: label === 'Today' ? 56 : 64,
                  height: 21,
                  background: isSelected ? skeletonSoft : skeletonTint,
                  border: `1px solid ${isSelected ? skeletonStrong : skeletonTint}`,
                  animation: 'opsDashPulse 1.5s ease-in-out infinite',
                  animationDelay: `${index * 0.08}s`,
                }}
                title={label}
              />
            );
          })}
        </div>

        <div style={{ padding: '14px 14px 12px', display: 'grid', gap: 12, flex: 1, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                {skeletonBlock(92, 36, { background: skeletonStrong })}
                {skeletonBlock(42, 10, { background: skeletonSoft })}
              </div>
              {skeletonBlock(104, 9, { background: skeletonTint })}
            </div>
            {skeletonBlock('76%', 11, { background: skeletonSoft })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={`conversion-skeleton-stat-${index}`}
                  style={{
                    display: 'grid',
                    gap: 4,
                    padding: '7px 9px',
                    border: `1px solid ${rowBorder}`,
                    background: index === 0 ? skeletonTint : skeletonSoft,
                  }}
                >
                  {skeletonBlock(index === 0 ? '34%' : '40%', 8, { background: skeletonStrong })}
                  {skeletonBlock('70%', 10, { background: skeletonTint })}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={`conversion-skeleton-legend-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 10, height: 0, borderTop: `1.8px solid ${index === 0 ? skeletonStrong : skeletonSoft}`, display: 'inline-block' }} />
                      <span style={{ width: 10, height: index === 0 ? 0 : 8, borderTop: index === 0 ? 'none' : `1px dashed ${skeletonTint}`, display: 'inline-block' }} />
                    </span>
                    {skeletonBlock(56, 8, { background: skeletonTint })}
                  </div>
                ))}
              </div>
              {skeletonBlock(selectedTab === 'today' ? 56 : 80, 8, { background: skeletonTint })}
            </div>
            <div
              style={{
                height: chartHeight,
                border: `1px solid ${rowBorder}`,
                background: `linear-gradient(180deg, ${skeletonTint} 0%, transparent 100%)`,
                padding: '10px 12px 12px',
                display: 'grid',
                gap: 8,
              }}
            >
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
                <line x1="10" y1={chartHeight - 12} x2={chartWidth - 10} y2={chartHeight - 12} stroke={skeletonTint} strokeWidth="1" />
                {[24, 48, 72].map((y) => (
                  <line key={y} x1="10" y1={y} x2={chartWidth - 10} y2={y} stroke={skeletonTint} strokeWidth="1" />
                ))}
                <polyline points={previousLine} fill="none" stroke={skeletonSoft} strokeWidth="1.6" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={currentLine} fill="none" stroke={skeletonStrong} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chartTicks.length}, minmax(0, 1fr))`, gap: 4 }}>
                {chartTicks.map((tick, index) => (
                  <div key={`conversion-skeleton-tick-${tick}-${index}`} style={{ display: 'grid', justifyItems: 'center' }}>
                    {skeletonBlock(index % 2 === 0 ? 16 : 12, 7, { background: skeletonTint })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 0 2px', borderTop: `1px solid ${rowBorder}`, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {skeletonBlock(68, 8, { background: skeletonStrong })}
              {skeletonBlock(74, 8, { background: skeletonTint })}
            </div>
            <div style={{ width: '100%', minHeight: 8, border: `1px solid ${rowBorder}`, background: skeletonTint, overflow: 'hidden', display: 'flex' }}>
              {[22, 24, 18, 14, 22].map((width, index) => (
                <div key={`conversion-skeleton-mix-${index}`} style={{ width: `${width}%`, minHeight: 8, background: index % 2 === 0 ? skeletonStrong : skeletonSoft, animation: 'opsDashPulse 1.5s ease-in-out infinite', animationDelay: `${index * 0.06}s` }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`conversion-skeleton-chip-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: index === 1 ? skeletonSoft : skeletonStrong, animation: 'opsDashPulse 1.5s ease-in-out infinite', animationDelay: `${index * 0.08}s` }} />
                  {skeletonBlock(index === 0 ? 58 : 48, 8, { background: skeletonTint })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPipelineSkeletonCard = (variant: 'activity' | 'matters') => {
    const isActivity = variant === 'activity';
    const rowCount = isActivity ? activityVisibleCount : matterVisibleCount;
    const actionGridTemplate = isActivity ? enquiryActionGridTemplate : matterActionGridTemplate;
    const stepCount = isActivity
      ? HOME_ENQUIRY_STEP_HEADER_LABELS.length
      : (showInlineMatterSteps ? HOME_MATTER_STEP_HEADER_LABELS.length : (matterActionLabelWidth > 0 ? 1 : 0));

    return (
      <div
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          boxShadow: cardShadow,
          display: 'flex',
          flexDirection: 'column',
          minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0,
        }}
      >
        {isActivity ? (
          <div style={{ display: 'flex', borderBottom: `1px solid ${cardBorder}` }}>
            {['Enquiries', 'Unclaimed'].map((label, index) => (
              <div
                key={`pipeline-skeleton-tab-${label}`}
                style={{
                  flex: 1,
                  padding: '9px 6px 7px',
                  textAlign: 'center',
                  background: index === 0 ? tabActiveBg : 'transparent',
                  borderBottom: index === 0 ? `2px solid ${accent}` : '2px solid transparent',
                }}
              >
                {skeletonBlock(index === 0 ? 70 : 62, 9, { background: index === 0 ? skeletonStrong : skeletonSoft, margin: '0 auto' })}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: matterGridTemplate, alignItems: 'center', gap: 0, padding: '7px 8px 5px 4px', background: theadBg, borderBottom: `1px solid ${cardBorder}` }}>
          <span style={{ display: 'flex', justifyContent: 'center' }}>{skeletonBlock(10, 8, { background: skeletonSoft })}</span>
          {skeletonBlock(34, 8, { background: skeletonSoft })}
          {skeletonBlock(isActivity ? 54 : 44, 8, { background: skeletonSoft })}
          <div style={{ display: 'grid', gridTemplateColumns: actionGridTemplate, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
            {isActivity ? <span aria-hidden="true" style={{ width: '100%', display: 'block' }} /> : null}
            {skeletonBlock(26, 8, { background: skeletonSoft })}
            {matterActionLabelWidth > 0 || isActivity ? <span aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}>{skeletonBlock(6, 8, { background: skeletonTint })}</span> : null}
            {stepCount > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                {Array.from({ length: stepCount }).map((_, index) => (
                  <div key={`pipeline-skeleton-head-${variant}-${index}`} style={{ display: 'flex', justifyContent: 'center' }}>
                    {skeletonBlock(isActivity ? 34 : (showInlineMatterSteps ? 28 : 24), 7, { background: skeletonSoft })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {Array.from({ length: rowCount }).map((_, index) => (
            <div key={`pipeline-skeleton-row-${variant}-${index}`} style={{ display: 'grid', gridTemplateColumns: matterGridTemplate, alignItems: 'center', gap: 0, padding: '6px 8px 6px 4px', borderBottom: `1px solid ${rowBorder}` }}>
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: skeletonSoft, animation: 'opsDashPulse 1.5s ease-in-out infinite', animationDelay: `${index * 0.06}s` }} />
              </span>
              <div style={{ display: 'grid', gap: 2 }}>
                {skeletonBlock(index % 2 === 0 ? 28 : 32, 8, { background: skeletonStrong })}
                {skeletonBlock(index % 2 === 0 ? 18 : 24, 7, { background: skeletonTint })}
              </div>
              <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                {skeletonBlock(index % 2 === 0 ? '62%' : '54%', 9, { background: skeletonStrong })}
                {skeletonBlock(index % 2 === 0 ? '44%' : '58%', 8, { background: skeletonTint })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: actionGridTemplate, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
                {isActivity ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: HOME_ENQUIRY_NOTES_SLOT_WIDTH, height: 20 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: skeletonTint }} />
                  </span>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  {skeletonBlock(isActivity ? 22 : 26, 8, { background: skeletonStrong })}
                </div>
                {matterActionLabelWidth > 0 || isActivity ? <span aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}>{skeletonBlock(6, 8, { background: skeletonTint })}</span> : null}
                {stepCount > 0 ? (
                  showInlineMatterSteps || isActivity ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                      {Array.from({ length: stepCount }).map((__, stepIndex) => (
                        <div key={`pipeline-skeleton-step-${variant}-${index}-${stepIndex}`} style={{ display: 'flex', justifyContent: 'center' }}>
                          <span style={{ width: stepIndex % 2 === 0 ? 18 : 14, height: 8, background: stepIndex % 2 === 0 ? skeletonSoft : skeletonTint, animation: 'opsDashPulse 1.5s ease-in-out infinite', animationDelay: `${(index + stepIndex) * 0.04}s` }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {skeletonBlock(matterCollapsedCclWidth, 20, { background: skeletonSoft })}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderConversionChart = (item: ConversionComparisonItem) => {
    if (item.chartMode === 'none' || item.buckets.length === 0) {
      return null;
    }

    const chartWidth = 240;
    const chartHeight = isNarrow ? 102 : 160;
    const buckets = item.buckets.map((bucket) => ({
      ...bucket,
      currentEnquiries: Number(bucket.currentEnquiries ?? 0),
      previousEnquiries: Number(bucket.previousEnquiries ?? 0),
      currentMatters: Number(bucket.currentMatters ?? 0),
      previousMatters: Number(bucket.previousMatters ?? 0),
      currentAvailable: bucket.currentAvailable !== false,
      isCurrentEndpoint: Boolean(bucket.isCurrentEndpoint),
    }));
    const maxEnquiries = Math.max(
      1,
      ...buckets.flatMap((bucket) => [bucket.currentEnquiries, bucket.previousEnquiries]),
    );
    const maxMatters = Math.max(
      1,
      ...buckets.flatMap((bucket) => [bucket.currentMatters, bucket.previousMatters]),
    );
    const padTop = 10;
    const padBot = 22;
    const padLeft = 5;
    const padRight = 5;
    const drawWidth = chartWidth - padLeft - padRight;
    const bucketWidth = buckets.length > 0 ? drawWidth / buckets.length : drawWidth;
    const groupWidth = Math.max(14, Math.min(30, bucketWidth * 0.78));
    const barGap = Math.max(1.5, Math.min(3, bucketWidth * 0.08));
    const barWidth = Math.max(5, Math.min(12, (groupWidth - barGap) / 2));
    const separatorInset = Math.max(0.9, Math.min(1.8, barWidth * 0.14));
    const xAt = (index: number) => padLeft + bucketWidth * index + bucketWidth / 2;
    const yAtEnquiry = (value: number) => chartHeight - padBot - (value / maxEnquiries) * (chartHeight - padTop - padBot);
    const yAtMatter = (value: number) => chartHeight - padBot - (value / maxMatters) * (chartHeight - padTop - padBot);
    const buildLinePath = (values: Array<number | null>, mapY: (value: number) => number) => {
      const segments: Array<Array<{ x: number; y: number }>> = [];
      let currentSegment: Array<{ x: number; y: number }> = [];

      values.forEach((value, index) => {
        if (value == null) {
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
            currentSegment = [];
          }
          return;
        }

        currentSegment.push({ x: xAt(index), y: mapY(value) });
      });

      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }

      return segments
        .map((segment) => {
          if (segment.length === 0) return '';
          if (segment.length === 1) {
            return `M ${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`;
          }

          let path = `M ${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`;
          for (let index = 0; index < segment.length - 1; index += 1) {
            const current = segment[index];
            const next = segment[index + 1];
            const controlX = ((current.x + next.x) / 2).toFixed(2);
            path += ` C ${controlX} ${current.y.toFixed(2)}, ${controlX} ${next.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
          }

          return path;
        })
        .filter(Boolean)
        .join(' ');
    };
    const visibleAxisIndexes = new Set<number>(
      item.chartMode === 'hourly'
        ? [0, Math.min(4, buckets.length - 1), Math.min(8, buckets.length - 1), buckets.length - 1]
        : buckets.length <= 5
          ? buckets.map((_, index) => index)
          : buckets.length <= 8
            ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]
            : [0, Math.floor((buckets.length - 1) / 3), Math.floor(((buckets.length - 1) * 2) / 3), buckets.length - 1],
    );
    const currentFill = isDarkMode ? withAlpha(colours.highlight, 0.62) : withAlpha(colours.highlight, 0.48);
    const previousFill = isDarkMode ? withAlpha(colours.highlight, 0.18) : withAlpha(colours.highlight, 0.14);
    const currentMatterStroke = isDarkMode ? withAlpha(colours.highlight, 0.98) : withAlpha(colours.highlight, 0.94);
    const previousMatterStroke = isDarkMode ? withAlpha(colours.highlightBlue, 0.9) : withAlpha(colours.highlight, 0.72);
    const currentMatterSeparator = isDarkMode ? withAlpha(colours.light.background, 0.24) : withAlpha(colours.light.background, 0.52);
    const previousMatterSeparator = isDarkMode ? withAlpha(colours.light.background, 0.14) : withAlpha(colours.highlight, 0.16);
    const currentEnquiryStroke = isDarkMode ? withAlpha(colours.highlight, 0.98) : withAlpha(colours.highlight, 0.96);
    const previousEnquiryStroke = isDarkMode ? withAlpha(colours.highlightBlue, 0.86) : withAlpha(colours.highlight, 0.72);
    const chartGrid = isDarkMode ? 'rgba(255,255,255,0.045)' : 'rgba(13,47,96,0.05)';
    const axisText = isDarkMode ? 'rgba(244,244,246,0.5)' : 'rgba(6,23,51,0.48)';
    const axisCaption = isDarkMode ? 'rgba(160,160,160,0.48)' : 'rgba(107,107,107,0.52)';
    const hoverGuideStroke = isDarkMode ? 'rgba(135,243,243,0.16)' : 'rgba(13,47,96,0.12)';
    const hoverGuideFill = isDarkMode ? 'rgba(135,243,243,0.035)' : 'rgba(54,144,206,0.035)';
    const matterTicks = [maxMatters, Math.max(0, Math.round(maxMatters / 2)), 0];
    const enquiryTicks = [maxEnquiries, Math.max(0, Math.round(maxEnquiries / 2)), 0];
    const xAxisY = chartHeight - padBot;
    const currentEnquiryPath = buildLinePath(
      buckets.map((bucket) => (bucket.currentAvailable ? bucket.currentEnquiries : null)),
      yAtEnquiry,
    );
    const previousEnquiryPath = buildLinePath(buckets.map((bucket) => bucket.previousEnquiries), yAtEnquiry);
    const buildMatterSeparators = (count: number, y: number, height: number) => {
      if (count <= 1 || height < 11) return [] as number[];
      const requestedLines = Math.min(count - 1, 4);
      const maxLinesByHeight = Math.max(0, Math.floor(height / 10));
      const lineCount = Math.min(requestedLines, maxLinesByHeight);
      if (lineCount <= 0) return [] as number[];

      const step = height / (lineCount + 1);
      return Array.from({ length: lineCount }, (_, index) => y + step * (index + 1));
    };

    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }}>
          {enquiryTicks.map((tick, index) => {
            const y = yAtEnquiry(tick);
            const showTickLabel = index !== 1;
            return (
              <g key={`${item.key}-enquiry-tick-${tick}-${index}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={chartWidth - padRight}
                  y2={y}
                  stroke={chartGrid}
                  strokeWidth="1"
                  strokeDasharray={index === 2 ? undefined : '3 3'}
                />
                {showTickLabel ? (
                  <text
                    x={padLeft + 2}
                    y={y + 3}
                    textAnchor="start"
                    fontSize="8.5"
                    fontWeight="600"
                    fill={axisText}
                  >
                    {fmt.int(tick)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {matterTicks.map((tick, index) => {
            if (index === 1) return null;
            const y = yAtMatter(tick);
            return (
              <text
                key={`${item.key}-matter-tick-${tick}-${index}`}
                x={chartWidth - 2}
                y={y + 3}
                textAnchor="end"
                fontSize="8.5"
                fontWeight="600"
                fill={axisText}
              >
                {fmt.int(tick)}
              </text>
            );
          })}
          {buckets.map((bucket, index) => {
            const centreX = xAt(index);
            const currentX = centreX - groupWidth / 2;
            const previousX = centreX - groupWidth / 2 + barWidth + barGap;
            const previousY = yAtMatter(bucket.previousMatters);
            const currentY = yAtMatter(bucket.currentMatters);
            const previousH = Math.max(0, xAxisY - previousY);
            const currentH = Math.max(0, xAxisY - currentY);
            const currentSeparators = buildMatterSeparators(bucket.currentMatters, currentY, currentH);
            const previousSeparators = buildMatterSeparators(bucket.previousMatters, previousY, previousH);
            return (
              <g key={`${item.key}-${bucket.label}`}>
                {bucket.currentAvailable ? (
                  <>
                    <rect
                      x={currentX}
                      y={currentY}
                      width={barWidth}
                      height={currentH}
                      fill={currentFill}
                    />
                    {currentSeparators.map((lineY, lineIndex) => (
                      <line
                        key={`${item.key}-${bucket.label}-current-sep-${lineIndex}`}
                        x1={currentX + separatorInset}
                        y1={lineY}
                        x2={currentX + barWidth - separatorInset}
                        y2={lineY}
                        stroke={currentMatterSeparator}
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    ))}
                  </>
                ) : null}
                <rect
                  x={previousX}
                  y={previousY}
                  width={barWidth}
                  height={previousH}
                  fill={previousFill}
                />
                {previousSeparators.map((lineY, lineIndex) => (
                  <line
                    key={`${item.key}-${bucket.label}-previous-sep-${lineIndex}`}
                    x1={previousX + separatorInset}
                    y1={lineY}
                    x2={previousX + barWidth - separatorInset}
                    y2={lineY}
                    stroke={previousMatterSeparator}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
          <path
            d={previousEnquiryPath}
            fill="none"
            stroke={previousEnquiryStroke}
            strokeWidth="1.32"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
          <path
            d={currentEnquiryPath}
            fill="none"
            stroke={currentEnquiryStroke}
            strokeWidth="2.08"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {buckets.map((bucket, index) => {
            const centreX = xAt(index);
            const currentY = yAtEnquiry(bucket.currentEnquiries);
            const previousY = yAtEnquiry(bucket.previousEnquiries);
            return (
              <g key={`${item.key}-${bucket.label}-enquiry-points`}>
                <circle cx={centreX} cy={previousY} r="1.7" fill={previousEnquiryStroke} />
                {bucket.currentAvailable ? (
                  <circle cx={centreX} cy={currentY} r={bucket.isCurrentEndpoint ? 2.5 : 2.1} fill={currentEnquiryStroke} />
                ) : null}
                {bucket.currentAvailable && bucket.isCurrentEndpoint ? (
                  <g className="chart-current-endpoint" style={{ pointerEvents: 'none' }}>
                    <circle className="chart-current-pulse" cx={centreX} cy={currentY} r="3.6" fill={withAlpha(colours.highlight, isDarkMode ? 0.24 : 0.18)} />
                    <circle cx={centreX} cy={currentY} r="5.1" fill="none" stroke={withAlpha(colours.highlight, isDarkMode ? 0.38 : 0.26)} strokeWidth="1" />
                  </g>
                ) : null}
              </g>
            );
          })}
          {buckets.map((bucket, index) => {
            const centreX = xAt(index);
            const colW = bucketWidth;
            const colX = buckets.length > 1 ? Math.max(0, centreX - colW / 2) : 0;
            const currentEnqY = bucket.currentAvailable ? yAtEnquiry(bucket.currentEnquiries) : null;
            const previousEnqY = yAtEnquiry(bucket.previousEnquiries);
            const bucketHoverKey = `${item.key}-${bucket.label}-${index}`;
            const isHovered = hoveredConversionBucketKey === bucketHoverKey;
            const enqLabelY = Math.min(...([previousEnqY, currentEnqY].filter((value): value is number => value != null))) - 5;
            const matLabelY = xAxisY + 1;
            const showCurrentHover = bucket.currentAvailable;
            const showPreviousEnquiryHover = bucket.previousEnquiries > 0;
            const showPreviousMatterHover = bucket.previousMatters > 0;
            return (
              <g
                key={`${item.key}-${bucket.label}-hit`}
                className="chart-hover-col"
                style={{ cursor: selectedConversionInsightTarget ? 'pointer' : 'default' }}
                onMouseEnter={() => setHoveredConversionBucketKey(bucketHoverKey)}
                onMouseLeave={() => {
                  setHoveredConversionBucketKey((current) => (current === bucketHoverKey ? null : current));
                }}
              >
                <rect
                  x={colX}
                  y={0}
                  width={colW}
                  height={chartHeight}
                  fill={isHovered ? hoverGuideFill : 'transparent'}
                />
                {isHovered ? (
                  <>
                    <line
                      className="chart-hover-guide"
                      x1={centreX}
                      y1={padTop}
                      x2={centreX}
                      y2={xAxisY}
                      stroke={hoverGuideStroke}
                      strokeWidth="0.8"
                      strokeDasharray="2 2"
                    />
                    <text
                      className="chart-hover-label"
                      x={centreX}
                      y={enqLabelY}
                      textAnchor="middle"
                      fontSize="7.5"
                      fontWeight="600"
                    >
                      {showCurrentHover ? <tspan fill={currentEnquiryStroke}>{bucket.currentEnquiries}</tspan> : null}
                      {showCurrentHover && showPreviousEnquiryHover ? (
                        <>
                          <tspan fill={isDarkMode ? 'rgba(244,244,246,0.36)' : 'rgba(107,107,107,0.42)'}> / </tspan>
                          <tspan fill={previousEnquiryStroke}>{bucket.previousEnquiries}</tspan>
                        </>
                      ) : null}
                      {!showCurrentHover && showPreviousEnquiryHover ? <tspan fill={previousEnquiryStroke}>{bucket.previousEnquiries}</tspan> : null}
                    </text>
                    {((showCurrentHover && bucket.currentMatters > 0) || showPreviousMatterHover) ? (
                      <text
                        className="chart-hover-label"
                        x={centreX}
                        y={matLabelY + 8}
                        textAnchor="middle"
                        fontSize="7"
                        fontWeight="600"
                      >
                        {showCurrentHover ? <tspan fill={currentMatterStroke}>{bucket.currentMatters}</tspan> : null}
                        {showCurrentHover && showPreviousMatterHover ? (
                          <>
                            <tspan fill={isDarkMode ? 'rgba(244,244,246,0.36)' : 'rgba(107,107,107,0.42)'}> / </tspan>
                            <tspan fill={previousMatterStroke}>{bucket.previousMatters}</tspan>
                          </>
                        ) : null}
                        {!showCurrentHover && showPreviousMatterHover ? <tspan fill={previousMatterStroke}>{bucket.previousMatters}</tspan> : null}
                      </text>
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div style={{ position: 'relative', height: 10, width: '100%' }}>
          {buckets.map((bucket, index) => {
            const isVisible = visibleAxisIndexes.has(index) && !!bucket.axisLabel;
            if (!isVisible) return null;
            const leftPercent = (xAt(index) / chartWidth) * 100;
            return (
              <span
                key={`${item.key}-${bucket.label}-ax`}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 8.5,
                  color: axisCaption,
                  letterSpacing: '0.05em',
                  textAlign: 'center',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {bucket.axisLabel || ''}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const cardHover = {
    enter: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.borderColor = cardHoverBorder;
      el.style.boxShadow = cardHoverShadow;
      el.style.transform = 'translateY(-1px)';
    },
    leave: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.borderColor = cardBorder;
      el.style.boxShadow = cardShadow;
      el.style.transform = 'translateY(0)';
    },
  };

  const tileHover = {
    enter: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.background = hoverBg;
      el.style.transform = 'scale(1.01)';
      el.querySelectorAll<HTMLElement>('[data-muted]').forEach((m) => { m.style.opacity = '1'; m.style.color = text; });
      el.querySelectorAll<HTMLElement>('[data-hover-detail]').forEach((detail) => {
        detail.style.opacity = '1';
        detail.style.maxHeight = '28px';
        detail.style.transform = 'translateY(0)';
      });
    },
    leave: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.background = 'transparent';
      el.style.transform = 'scale(1)';
      el.querySelectorAll<HTMLElement>('[data-muted]').forEach((m) => { m.style.opacity = ''; m.style.color = ''; });
      el.querySelectorAll<HTMLElement>('[data-hover-detail]').forEach((detail) => {
        detail.style.opacity = '';
        detail.style.maxHeight = '';
        detail.style.transform = '';
      });
    },
  };

  const hoverDetailStyle: React.CSSProperties = {
    opacity: 0,
    maxHeight: 0,
    overflow: 'hidden',
    transform: 'translateY(3px)',
    transition: 'opacity 0.18s ease, max-height 0.2s ease, transform 0.18s ease',
  };

  /* ── Reusable elements ── */

  const bigNumber = (value: string, opts?: { color?: string; loading?: boolean; size?: number }) => (
    opts?.loading
      ? <div style={{ width: 52, height: 22, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)', borderRadius: 2, animation: 'opsDashPulse 1.5s ease-in-out infinite' }} />
      : <div style={{ fontSize: opts?.size || 22, fontWeight: 700, color: opts?.color || text, letterSpacing: '-0.03em', lineHeight: 1.1, animation: 'opsDashFadeIn 0.3s ease both' }}>{value}</div>
  );

  const kpiRow = (lbl: string, value: string, opts?: { color?: string; opacity?: number }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '7px 14px',
      borderBottom: `1px solid ${rowBorder}`,
    }}>
      <span style={{ fontSize: 11, color: muted }}>{lbl}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: opts?.color || text, opacity: opts?.opacity }}>{value}</span>
    </div>
  );

  const progressBar = (pct: number, opts?: { color?: string; height?: number; bg?: string }) => {
    const clamped = Math.max(0, Math.min(100, pct));
    return (
      <div style={{
        width: '100%',
        height: opts?.height || 3,
        background: opts?.bg || (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)'),
        borderRadius: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped}%`,
          height: '100%',
          background: opts?.color || accent,
          borderRadius: 0,
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'left',
          animation: 'opsDashBarGrow 0.6s cubic-bezier(0.4, 0, 0.2, 1) both',
        }} />
      </div>
    );
  };

  /** Inline coloured delta — e.g. "+1.2h" green, "-£340" red */
  const delta = (current: number, previous: number, formatter: (v: number) => string): React.ReactNode => {
    if (previous === 0 && current === 0) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return null;
    const color = diff > 0 ? colours.green : colours.cta;
    const sign = diff > 0 ? '+' : '-';
    return <span style={{ fontSize: 9, fontWeight: 600, color, marginLeft: 4 }}>{sign}{formatter(Math.abs(diff))}</span>;
  };

  return (
    <CclStatusContext.Provider value={cclStatusContextValue}>
    <div ref={dashRef} style={{ padding: '4px 12px 10px', display: 'grid', gap: 8 }}>
      {/* Keyframe animations */}
      <style>{`
        @keyframes opsDashFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsDashRowFade {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes opsDashBarGrow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes opsDashPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes opsDashSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes opsDashFieldAppear {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsDashStreamDot {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes opsDashFieldGlow {
          0% { opacity: 0; transform: translateX(-6px); border-left-color: transparent; }
          20% { opacity: 1; transform: translateX(0); }
          40% { border-left-color: var(--stream-glow-color, #87F3F3); }
          100% { border-left-color: transparent; }
        }
        @keyframes opsDashSlideRight {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes opsDashScaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes opsDashCheckPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes opsDashSyncPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(32,178,108,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(32,178,108,0); }
        }
        /* Mobile touch feedback */
        @media (hover: none) and (pointer: coarse) {
          .ops-dash-row:active {
            background: ${hoverBg} !important;
            transition: background 0.05s ease !important;
          }
        }
        /* Smooth scroll for pipeline cards */
        .ops-dash-scroll {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        /* 2026-04-21: when the Conversion section's chart wraps below the
           count column on narrow widths, force the inline SVG to scale to
           100% of the wrapper. The SVG carries a viewBox so it scales
           cleanly without distortion. */
        .conv-spark-fluid svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .ops-dash-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .ops-dash-scroll::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
          border-radius: 2px;
        }
        /* Hover-reveal copy button */
        .ops-copy-btn {
          opacity: 0;
          transition: opacity 0.15s ease;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0 2px;
          line-height: 1;
          flex-shrink: 0;
        }
        .ops-enquiry-row:hover .ops-copy-btn,
        .ops-matter-row:hover .ops-copy-btn {
          opacity: 0.45;
        }
        .ops-copy-btn:hover {
          opacity: 1 !important;
        }
        /* ── Billing KPI frame (2026-04-20) ─────────────────────────────
           Wraps the billing metric tiles so each gets its own border.
           ──────────────────────────────────────────────────────────────
           Billing rail (2026-04-20, v4): single static gradient border on
           the 4-tile strip, *responsive to today's progress*. Replaces
           the per-tile pulse experiment.

           Progress signal: today's hours / daily-avg hours (computed in
           JS from billingMetrics). Drives the frame border through four
           visual stages — the colour vocabulary is a journey, not a mix:
             • no data → border off (neutral, like before the experiment)
             • early    (>0, <33%) → dull blue (helixBlue → blue)
             • mid      (33%–66%)  → cool highlight → accent
             • closing  (66%–99%)  → accent → green (green-leaning, not half/half)
             • done     (≥100%)    → mostly green (subtle green-on-green)

           The mask-composite trick (content-box mask + xor composite)
           paints the 1px ring; the JS-supplied gradient is read via
           --billing-frame-bg. One tick thinner than v3 (lower opacity +
           subpixel padding).
           ---------------------------------------------------------------- */
        .ops-billing-frame {
          display: grid;
          gap: 0;
          position: relative;
        }
        .ops-billing-frame::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          padding: 0.75px;
          background: var(--billing-frame-bg, transparent);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: var(--billing-frame-opacity, 0);
          transition: opacity 0.4s ease, background 0.4s ease;
        }
        /* 2026-04-21: stage-driven border gradients. The earlier inline
           IIFE that piped --billing-frame-bg into element style was lost
           in a refactor, so the frame border has been invisible. Restore
           via [data-billing-stage] selectors so the same JSX scaffolding
           drives the visuals. */
        .ops-billing-frame[data-billing-stage="early"] {
          --billing-frame-bg: linear-gradient(135deg, ${withAlpha(colours.highlight, 0.55)} 0%, ${withAlpha(colours.highlight, 0.25)} 100%);
          --billing-frame-opacity: 0.55;
        }
        .ops-billing-frame[data-billing-stage="mid"] {
          --billing-frame-bg: linear-gradient(135deg, ${withAlpha(colours.highlight, 0.65)} 0%, ${withAlpha(colours.accent, 0.55)} 100%);
          --billing-frame-opacity: 0.7;
        }
        .ops-billing-frame[data-billing-stage="closing"] {
          --billing-frame-bg: linear-gradient(135deg, ${withAlpha(colours.accent, 0.55)} 0%, ${withAlpha(colours.green, 0.7)} 45%, ${withAlpha(colours.green, 0.75)} 100%);
          --billing-frame-opacity: 0.78;
        }
        .ops-billing-frame[data-billing-stage="done"] {
          --billing-frame-bg: linear-gradient(135deg, ${withAlpha(colours.green, 0.85)} 0%, #1a8c5a 60%, ${withAlpha(colours.green, 0.85)} 100%);
          --billing-frame-opacity: 0.85;
        }
        /* One-shot completion sweep: a brighter green/accent ring fades in
           and out once when the stage flips to done. Re-keyed via a state
           nonce on the data-billing-complete attribute so React can refire
           it (subsequent demo scrubs from non-done back to done). */
        .ops-billing-frame::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          padding: 1.5px;
          background: linear-gradient(135deg, ${withAlpha(colours.accent, 0.95)} 0%, ${withAlpha(colours.green, 0.95)} 50%, ${withAlpha(colours.accent, 0.95)} 100%);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0;
          filter: drop-shadow(0 0 6px ${withAlpha(colours.green, 0.55)});
        }
        .ops-billing-frame[data-billing-complete] {
          /* attribute presence is enough; key is the value (nonce) which
             forces a fresh animation cycle when it changes. */
        }
        .ops-billing-frame[data-billing-complete]::after {
          animation: opsBillingComplete 1.7s ease-out 1 both;
        }
        @keyframes opsBillingComplete {
          0%   { opacity: 0;    transform: scale(1.005); }
          15%  { opacity: 0.95; transform: scale(1); }
          55%  { opacity: 0.65; }
          100% { opacity: 0;    transform: scale(1); }
        }
        .ops-billing-tile {
          position: relative;
          padding: 14px 16px 12px;
          background: transparent;
          transition: background 0.2s ease, transform 0.2s ease;
          cursor: pointer;
        }
      `}</style>

      {isProcessingView && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          border: `1px solid ${cardBorder}`,
          background: isDarkMode ? 'rgba(6, 23, 51, 0.72)' : 'rgba(214,232,255,0.45)',
          boxShadow: cardShadow,
        }}>
          <FiRefreshCw size={13} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: text }}>{processingLabel}</div>
            <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{processingDetail}</div>
          </div>
        </div>
      )}

      {/* ── Billing rail ── */}
      {(billingMetrics.length > 0 || isLoading) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0 3px' }}>
            <span className="home-section-header"><TbCurrencyPound size={11} className="home-section-header-icon" />Billing</span>
            {onRefresh && (
              <FiRefreshCw
                size={11}
                onClick={!isRefreshing ? onRefresh : undefined}
                style={{
                  color: muted,
                  cursor: isRefreshing ? 'not-allowed' : 'pointer',
                  opacity: isRefreshing ? 0.4 : 0.6,
                  animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
            )}
          </div>
          <div
            className="ops-billing-rail"
            style={{
              background: cardBg,
              border: `1px solid ${cardBorder}`,
              boxShadow: cardShadow,
              animation: 'opsDashFadeIn 0.35s ease both',
              transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
            }}
            onMouseEnter={cardHover.enter}
            onMouseLeave={cardHover.leave}
          >
            {billingMetrics.length === 0 ? (
              <BillingRailSkeleton
                isDarkMode={isDarkMode}
                metricCount={isNarrow ? Math.min(2, billingMetrics.length || DEFAULT_BILLING_SKELETON_COUNT) : (billingMetrics.length || DEFAULT_BILLING_SKELETON_COUNT)}
              />
            ) : (
              (() => {
                /* Today-progress → frame stage (2026-04-21).
                   `billingStage` is computed up at the component scope
                   (useMemo) so a useEffect can fire the one-shot
                   completion pulse on transitions into `done`. We only
                   need todayMetric here for the demo-scrub override
                   (per-tile wheel handler below). */
                const todayMetric = billingMetrics.find((mm) => mm.title.toLowerCase().includes('today'));
                return (
                  <div
                    className="ops-billing-frame"
                    data-billing-stage={billingStage}
                    data-billing-complete={billingCompletePulse > 0 ? String(billingCompletePulse) : undefined}
                    style={{
                      gridTemplateColumns: `repeat(${billingMetrics.length}, 1fr)`,
                    }}
                  >
                {billingMetrics.map((m, i) => {
                const isRecovered = m.title.toLowerCase().includes('recovered') || m.title.toLowerCase().includes('fees') || m.title.toLowerCase().includes('collected');
                const primary = m.isMoneyOnly
                  ? fmt.currency(m.money || 0)
                  : m.isTimeMoney
                    ? (isRecovered ? fmt.currency(m.money || 0) : fmt.hours(m.hours || 0))
                    : m.hours !== undefined ? fmt.hours(m.hours) : fmt.int(m.count || 0);
                const prev = m.isMoneyOnly
                  ? fmt.currency(m.prevMoney || 0)
                  : m.isTimeMoney
                    ? (isRecovered ? fmt.currency(m.prevMoney || 0) : fmt.hours(m.prevHours || 0))
                    : fmt.hours(m.prevHours || 0);
                // Secondary inline value: for time cards show money, for recovered show hours
                const secondary = m.isTimeMoney
                  ? isRecovered
                    ? ((m.hours || 0) > 0 ? fmt.hours(m.hours || 0) : null)
                    : ((m.money || 0) > 0 ? fmt.currency(m.money || 0) : null)
                  : null;
                const curVal = m.isMoneyOnly ? (m.money || 0) : isRecovered ? (m.money || 0) : (m.hours || 0);
                const prevVal = m.isMoneyOnly ? (m.prevMoney || 0) : isRecovered ? (m.prevMoney || 0) : (m.prevHours || 0);
                const barPct = prevVal > 0 ? Math.min((curVal / prevVal) * 100, 100) : (curVal > 0 ? 100 : 0);
                const barColor = prevVal > 0 && curVal >= prevVal ? colours.green : accent;
                const deltaFmt = m.isMoneyOnly || isRecovered ? fmt.currency : fmt.hours;
                // Exact (hover-reveal) value — full precision, no abbreviation.
                const exactFmt = m.isMoneyOnly || isRecovered ? fmt.currencyExact : fmt.hoursExact;
                const exactPrimary = m.isMoneyOnly
                  ? fmt.currencyExact(m.money || 0)
                  : m.isTimeMoney
                    ? (isRecovered ? fmt.currencyExact(m.money || 0) : fmt.hoursExact(m.hours || 0))
                    : m.hours !== undefined ? fmt.hoursExact(m.hours) : fmt.int(m.count || 0);
                const exactSecondary = m.isTimeMoney
                  ? isRecovered
                    ? ((m.hours || 0) > 0 ? fmt.hoursExact(m.hours || 0) : null)
                    : ((m.money || 0) > 0 ? fmt.currencyExact(m.money || 0) : null)
                  : null;
                const diff = curVal - prevVal;
                const deltaLabel = !isLoading && prevVal > 0 && Math.abs(diff) >= 0.05
                  ? `${diff >= 0 ? '+' : '-'}${deltaFmt(Math.abs(diff))}`
                  : null;
                const deltaColour = diff >= 0 ? colours.green : colours.cta;
                const isTodayTile = m.title.toLowerCase().includes('today');
                const demoScrubActive = demoModeActive && isTodayTile;
                const demoOverrideShown = demoScrubActive && demoTodayOverride !== null;
                // When the demo override is active, swap the displayed Today
                // hours so the operator sees the value they're scrubbing to.
                const displayedPrimary = (demoOverrideShown && !m.isMoneyOnly && !isRecovered)
                  ? fmt.hours(demoTodayOverride!)
                  : primary;
                return (
                  <div
                    key={i}
                    className="ops-billing-tile"
                    style={{
                      animation: 'opsDashFadeIn 0.3s ease both',
                      ...(demoScrubActive ? { position: 'relative' as const } : {}),
                    }}
                    onMouseEnter={tileHover.enter}
                    onMouseLeave={tileHover.leave}
                    onClick={() => setBillingInsightIdx(i)}
                    onWheel={demoScrubActive ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const step = e.shiftKey ? 0.1 : 0.5;
                      setDemoTodayOverride((prev) => {
                        const base = prev ?? (todayMetric?.hours ?? 0);
                        // Wheel up (deltaY < 0) → increase hours.
                        const next = base + (e.deltaY < 0 ? step : -step);
                        return Math.max(0, Math.min(12, Math.round(next * 10) / 10));
                      });
                    } : undefined}
                    onDoubleClick={demoScrubActive ? (e) => {
                      e.stopPropagation();
                      setDemoTodayOverride(null);
                    } : undefined}
                    title={demoScrubActive
                      ? `${shortLabel(m.title)} — demo: scroll to scrub today's hours, double-click to reset`
                      : `${shortLabel(m.title)} — exact: ${exactPrimary}`}
                  >
                    {/* Label — matches Conversion (9px uppercase, tight letter-spacing) */}
                    <div
                      data-muted
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: muted,
                        opacity: 0.82,
                        marginBottom: 5,
                        transition: 'color 0.2s ease, opacity 0.2s ease',
                      }}
                    >
                      {shortLabel(m.title)}
                    </div>
                    {/* Big number + inline delta (matches Conversion `big % + delta` layout) */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      {bigNumber(displayedPrimary, { loading: !!isLoading })}
                      {demoOverrideShown && (
                        <span style={{
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colours.accent,
                          border: `1px solid ${colours.accent}`,
                          padding: '1px 5px',
                        }}>demo</span>
                      )}
                      {deltaLabel && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: deltaColour,
                        }}>{deltaLabel}</span>
                      )}
                      {secondary && (
                        <span data-muted style={{
                          fontSize: 11,
                          color: muted,
                          fontWeight: 500,
                          marginLeft: 'auto',
                          transition: 'color 0.2s ease, opacity 0.2s ease',
                        }}>{secondary}</span>
                      )}
                    </div>
                    {/* Progress bar (reserved 2px slot — always mounted so hover doesn't jolt) */}
                    <div style={{ marginTop: 6, height: 2 }}>
                      {!isLoading && curVal > 0 ? progressBar(barPct, { height: 2, color: barColor }) : null}
                    </div>
                    {/* Meta line — prev + exact (hover-reveal). Fixed height prevents vertical jolt. */}
                    <div style={{ marginTop: 5, minHeight: 12, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      {showPrev && !isLoading && prevVal > 0 && (
                        <span data-muted style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          color: muted,
                          opacity: 0.6,
                          transition: 'color 0.2s ease, opacity 0.2s ease',
                        }}>prev {prev}</span>
                      )}
                      {!isLoading && (
                        <span
                          data-hover-detail
                          style={{
                            ...hoverDetailStyle,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            color: isDarkMode ? colours.accent : colours.highlight,
                            marginLeft: 'auto',
                          }}
                        >
                          {exactPrimary}{exactSecondary ? ` · ${exactSecondary}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
                  </div>
                );
              })()
            )}
            {(outstandingMetric || isLoading) && (
              <div
                style={{
                  padding: '10px 16px',
                  borderTop: `1px solid ${rowBorder}`,
                  fontSize: 11,
                  color: muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: hasOutstandingBreakdown ? 'pointer' : 'default',
                }}
                onClick={hasOutstandingBreakdown ? onOpenOutstandingBreakdown : undefined}
              >
                {isOutstandingLoading ? 'Loading outstanding…' : outstandingMetric ? (
                  <>
                    <span style={{ fontWeight: 700, color: text }}>{shortLabel(outstandingMetric.title)}</span>
                    <span aria-hidden="true" style={{ opacity: 0.45 }}>·</span>
                    <span style={{ color: text }}>{fmt.currency(outstandingMetric.money || 0)}</span>
                    {hasOutstandingBreakdown && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>
                        Open breakdown
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline: 3-column layout ── */}
      {((enquiryMetrics && enquiryMetrics.length > 0) || isLoadingEnquiryMetrics) && (
        <div>
          {/* 2026-04-20: use `minmax(0, …)` on every track so wide intrinsic
             content in a column (e.g. a long row of matter display-number
             bezels on the Month view) can't force the grid to overflow its
             parent. Without this, min-content of a flex-shrink:0 chip row
             becomes the column's floor, cramming the paired column and
             pushing siblings off screen. With minmax(0, …), the column
             respects its fractional share and the trail's own overflowX:auto
             does the scrolling. */}
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : (hidePipelineAndMatters ? (todoSlot ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)') : 'minmax(0, 1fr) minmax(0, 2fr)'), gap: 6 }}>
          {/* ── Left: Conversion ── */}
          <div>
            <div className="home-section-header" style={{ animation: 'opsDashFadeIn 0.25s ease both' }}><FiTrendingUp size={10} className="home-section-header-icon" />Conversion</div>
            <div ref={conversionRailRef} style={{ minHeight: primaryRailMinHeight }}>
              {(!enquiryMetrics || enquiryMetrics.length === 0 || showExperimentalConversionSkeleton || (enableConversionComparison && !useExperimentalConversion)) ? (
                renderConversionSkeleton()
              ) : (
                <div
                  ref={conversionCardRef}
                  // 2026-04-20: minWidth:0 + overflow:hidden so long intrinsic
                  // content (month-view matter display numbers) can't push
                  // the card past its `minmax(0, 2fr)` track and into the
                  // paired ToDo column. The trail's own overflowX:auto then
                  // scrolls internally as intended.
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: primaryRailMinHeight, overflow: 'hidden', animation: 'opsDashFadeIn 0.35s ease 0.05s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
                  onMouseEnter={cardHover.enter}
                  onMouseLeave={cardHover.leave}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {useExperimentalConversion ? (
                      (() => {
                        const item = selectedConversionItem;
                        if (!item) return null;

                        const hasCurrentBasis = item.currentEnquiries > 0;
                        const hasPreviousBasis = item.previousEnquiries > 0;
                        const showPreviousComparison = item.previousEnquiries > 0 || item.previousMatters > 0;
                        const currentPctLabel = hasCurrentBasis ? fmt.pct(item.currentPct) : '—';
                        const previousPctLabel = showPreviousComparison ? fmt.pct(item.previousPct) : '—';
                        const deltaPoints = item.currentPct - item.previousPct;
                        const deltaPointsLabel = hasCurrentBasis && hasPreviousBasis
                          ? `${deltaPoints >= 0 ? '+' : ''}${deltaPoints.toFixed(1)}%`
                          : null;
                        const enquiryDelta = item.currentEnquiries - item.previousEnquiries;
                        const matterDelta = item.currentMatters - item.previousMatters;
                        const hasChart = item.chartMode !== 'none' && item.buckets.length > 0;
                        const enquiryProspects: ConversionProspectChipItem[] = Array.isArray(item.currentEnquiryProspects) ? item.currentEnquiryProspects : [];
                        const matterProspects: ConversionProspectChipItem[] = Array.isArray(item.currentMatterProspects) ? item.currentMatterProspects : [];
                        const showChart = hasChart && conversionSparklines !== null;
                        const combinedSVG = conversionSparklines?.combinedSVG ?? '';

                        // 2026-04-24: restructured into a 3-KPI row (Enquiries /
                        // Matters / Conversion%) + a single combined chart
                        // (enquiries line + matters bars) + prospect baskets.
                        // The card now drives the ToDo height instead of the
                        // previous banded layout, which was tall enough to let
                        // ToDo run free.
                        const formatDelta = (delta: number): string | null => {
                          if (!showPreviousComparison || !hasCurrentBasis) return null;
                          const sign = delta >= 0 ? '+' : '';
                          return `${sign}${fmt.int(delta)}`;
                        };
                        const enquiriesAccent = isDarkMode ? 'rgba(135,243,243,0.95)' : colours.highlight;
                        const mattersAccent = colours.green;
                        const conversionAccent = isDarkMode ? colours.accent : colours.highlight;

                        const renderKpi = (
                          key: 'enquiries' | 'matters' | 'conversion',
                          label: string,
                          bigValue: string,
                          deltaLabel: string | null,
                          deltaPositive: boolean,
                          previousLine: string | null,
                          isLast: boolean,
                          accent: string,
                          onClick?: () => void,
                        ) => (
                          <div
                            key={key}
                            onClick={onClick}
                            onMouseEnter={onClick ? tileHover.enter : undefined}
                            onMouseLeave={onClick ? tileHover.leave : undefined}
                            style={{
                              padding: '12px 14px 12px',
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 5,
                              borderRight: isLast ? 'none' : `1px solid ${rowBorder}`,
                              cursor: onClick ? 'pointer' : 'default',
                              transition: 'background 0.2s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {key === 'enquiries' ? (
                                <span aria-hidden="true" style={{ width: 12, height: 2, background: accent, flexShrink: 0 }} />
                              ) : (
                                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: key === 'matters' ? 0 : '50%', background: accent, flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 9, fontWeight: 700, color: muted, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.82 }}>{label}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 24, fontWeight: 700, color: text, letterSpacing: '-0.035em', lineHeight: 1 }}>{bigValue}</span>
                              {deltaLabel ? (
                                <span style={{ fontSize: 10, fontWeight: 700, color: deltaPositive ? colours.green : colours.cta, letterSpacing: '0.04em' }}>{deltaLabel}</span>
                              ) : null}
                            </div>
                            {previousLine ? (
                              <div style={{ fontSize: 10, color: muted, opacity: 0.78, lineHeight: 1.4, minHeight: 14 }}>{previousLine}</div>
                            ) : (
                              <div style={{ fontSize: 10, minHeight: 14 }} aria-hidden="true">&nbsp;</div>
                            )}
                          </div>
                        );

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Period tabs */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${rowBorder}` }}>
                              {visibleConversionRows.map((row) => {
                                const isSelected = row.key === item.key;
                                const label = row.key === 'week-vs-last'
                                  ? 'Week'
                                  : row.key === 'month-vs-last'
                                    ? 'Month'
                                    : row.key === 'quarter-vs-last'
                                      ? 'Quarter'
                                      : 'Today';
                                return (
                                  <button
                                    key={row.key}
                                    type="button"
                                    onClick={() => setSelectedConversionKey(row.key)}
                                    style={{
                                      border: `1px solid ${isSelected ? (isDarkMode ? 'rgba(135,243,243,0.36)' : 'rgba(54,144,206,0.26)') : rowBorder}`,
                                      background: isSelected ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)') : 'transparent',
                                      color: isSelected ? text : muted,
                                      padding: '5px 8px',
                                      fontSize: 9,
                                      fontWeight: 700,
                                      letterSpacing: '0.08em',
                                      textTransform: 'uppercase',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.06em', opacity: 0.75, textTransform: 'uppercase', textAlign: 'right' }}>
                                {item.currentLabel}
                                {showPreviousComparison ? ` · vs ${item.previousLabel.toLowerCase()}` : ''}
                              </span>
                            </div>

                            {/* 3 KPI cards — Enquiries / Matters / Conversion% */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                                borderBottom: `1px solid ${rowBorder}`,
                                animation: 'opsDashRowFade 0.25s ease 0.06s both',
                              }}
                            >
                              {renderKpi(
                                'enquiries',
                                'Enquiries',
                                fmt.int(item.currentEnquiries),
                                formatDelta(enquiryDelta),
                                enquiryDelta >= 0,
                                showPreviousComparison
                                  ? `was ${fmt.int(item.previousEnquiries)} ${item.previousLabel.toLowerCase()}`
                                  : hasCurrentBasis
                                    ? item.currentLabel
                                    : 'No enquiries yet',
                                false,
                                enquiriesAccent,
                                selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined,
                              )}
                              {renderKpi(
                                'matters',
                                'Matters',
                                fmt.int(item.currentMatters),
                                formatDelta(matterDelta),
                                matterDelta >= 0,
                                showPreviousComparison
                                  ? `was ${fmt.int(item.previousMatters)} ${item.previousLabel.toLowerCase()}`
                                  : hasCurrentBasis
                                    ? item.currentLabel
                                    : 'No matters yet',
                                false,
                                mattersAccent,
                                selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined,
                              )}
                              {renderKpi(
                                'conversion',
                                'Conversion',
                                currentPctLabel,
                                deltaPointsLabel,
                                deltaPoints >= 0,
                                showPreviousComparison
                                  ? `was ${previousPctLabel} ${item.previousLabel.toLowerCase()}`
                                  : hasCurrentBasis
                                    ? `${fmt.int(item.currentMatters)} from ${fmt.int(item.currentEnquiries)}`
                                    : 'No enquiries yet',
                                true,
                                conversionAccent,
                                selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined,
                              )}
                            </div>

                            {/* Combined trend chart */}
                            {showChart && combinedSVG ? (
                              <div style={{ padding: '10px 14px 10px', borderBottom: `1px solid ${rowBorder}`, animation: 'opsDashRowFade 0.28s ease 0.12s both' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.82 }}>Trend</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.04em' }}>
                                    <span style={{ width: 12, height: 2, background: enquiriesAccent }} />
                                    Enquiries
                                  </span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.04em' }}>
                                    <span style={{ width: 8, height: 8, background: mattersAccent, opacity: 0.9 }} />
                                    Matters
                                  </span>
                                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 500, color: muted, opacity: 0.6, letterSpacing: '0.02em' }}>
                                    Hover for full breakdown
                                  </span>
                                </div>
                                <div
                                  aria-label="Enquiries and matters trend for selected period"
                                  className="conv-combined-chart"
                                  style={{ width: '100%', lineHeight: 0 }}
                                  dangerouslySetInnerHTML={{ __html: combinedSVG.replace(/<svg([^>]*?)width="\d+"\s+height="(\d+)"/, '<svg$1width="100%" height="$2" preserveAspectRatio="none"') }}
                                />
                              </div>
                            ) : null}

                            {/* Prospect trails */}
                            <div
                              style={{ padding: '12px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, cursor: selectedConversionInsightTarget ? 'pointer' : 'default' }}
                              onMouseEnter={selectedConversionInsightTarget ? tileHover.enter : undefined}
                              onMouseLeave={selectedConversionInsightTarget ? tileHover.leave : undefined}
                              onClick={selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined}
                            >
                              {([
                                { key: 'enquiries' as const, label: 'Enquiries', items: enquiryProspects, placeholderCount: item.currentEnquiries, accent: enquiriesAccent, anim: 0.16 },
                                { key: 'matters' as const, label: 'Matters', items: matterProspects, placeholderCount: item.currentMatters, accent: mattersAccent, anim: 0.22 },
                              ]).map(({ key, label, items, placeholderCount, accent, anim }) => (
                                <div key={key} style={{ minWidth: 0, animation: `opsDashRowFade 0.25s ease ${anim}s both` }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                    {key === 'enquiries' ? (
                                      <span aria-hidden="true" style={{ width: 12, height: 2, background: accent, flexShrink: 0 }} />
                                    ) : (
                                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: key === 'matters' ? 0 : '50%', background: accent, flexShrink: 0 }} />
                                    )}
                                    <span style={{ fontSize: 9, fontWeight: 700, color: muted, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.75 }}>{label}</span>
                                  </div>
                                  <ConversionProspectBasket
                                    items={items}
                                    section={key}
                                    aowColor={aowColor}
                                    resolveAowCategory={resolveAowCategory}
                                    isDarkMode={isDarkMode}
                                    maxVisible={14}
                                    breakpoint={conversionBreakpoint}
                                    onOpenProspect={selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined}
                                    onOpenAll={selectedConversionInsightTarget ? () => openInsight(selectedConversionInsightTarget) : undefined}
                                    overflowExpanded={conversionInlineLedger === key}
                                    onOverflowToggle={() => toggleConversionInlineLedger(key)}
                                    placeholderCount={items.length === 0 && placeholderCount > 0 ? placeholderCount : undefined}
                                  />
                                  {conversionInlineLedger === key && items.length > 0 ? (
                                    <div style={{ marginTop: 8 }}>
                                      <ConversionStreamLedger
                                        section={key}
                                        items={items}
                                        aowColor={aowColor}
                                        isDarkMode={isDarkMode}
                                        maxHeight={240}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                          <div style={{ padding: '14px 14px 10px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.1s both' }} onMouseEnter={tileHover.enter} onMouseLeave={tileHover.leave} onClick={() => openInsight('today')}>
                            {bigNumber(fmt.int(todayEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 20 })}
                            <div data-muted style={{ fontSize: 10, color: muted, marginTop: 3, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Today</div>
                            {showPrev && todayEnquiry?.prevCount != null && <div data-muted style={{ fontSize: 9, color: muted, opacity: 0.5, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>yesterday {fmt.int(todayEnquiry.prevCount)}{delta(todayEnquiry.count || 0, todayEnquiry.prevCount, fmt.int)}</div>}
                          </div>
                          <div style={{ padding: '14px 14px 10px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.16s both' }} onMouseEnter={tileHover.enter} onMouseLeave={tileHover.leave} onClick={() => openInsight('weekToDate')}>
                            {bigNumber(fmt.int(periodEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 20 })}
                            <div data-muted style={{ fontSize: 10, color: muted, marginTop: 3, transition: 'color 0.2s ease, opacity 0.2s ease' }}>This Week</div>
                            {showPrev && periodEnquiry?.prevCount != null && <div data-muted style={{ fontSize: 9, color: muted, opacity: 0.5, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>last week {fmt.int(periodEnquiry.prevCount)}{delta(periodEnquiry.count || 0, periodEnquiry.elapsedPrevCount ?? periodEnquiry.prevCount, fmt.int)}</div>}
                          </div>
                        </div>

                        {(monthEnquiry || isLoadingEnquiryMetrics) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                          <div style={{ padding: '10px 14px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.2s both' }} onMouseEnter={tileHover.enter} onMouseLeave={tileHover.leave} onClick={() => openInsight('monthToDate')}>
                            {bigNumber(fmt.int(monthEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                            <div data-muted style={{ fontSize: 10, color: muted, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>This Month</div>
                          </div>
                          {(showPrev || isLoadingEnquiryMetrics) && <div style={{ padding: '10px 14px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'default', animation: 'opsDashRowFade 0.25s ease 0.26s both' }} onMouseEnter={tileHover.enter} onMouseLeave={tileHover.leave}>
                            {bigNumber(fmt.int(monthEnquiry?.prevCount || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                            <div data-muted style={{ fontSize: 10, color: muted, opacity: 0.45, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Last Month</div>
                          </div>}
                        </div>}

                        {((conversionMetric && conversionMetric.percentage != null && conversionMetric.context) || isLoadingEnquiryMetrics) && (() => {
                          const opened = conversionMetric?.context?.mattersOpenedMonthToDate || 0;
                          const total = conversionMetric?.context?.enquiriesMonthToDate || 0;
                          const pct = conversionMetric?.percentage || 0;
                          return (
                            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${cardBorder}`, background: isDarkMode ? 'rgba(135,243,243,0.02)' : 'rgba(13,47,96,0.02)', animation: 'opsDashFadeIn 0.3s ease 0.3s both' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                                {isLoadingEnquiryMetrics ? <div style={{ width: 52, height: 18, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)', borderRadius: 2, animation: 'opsDashPulse 1.5s ease-in-out infinite' }} /> : <span style={{ fontSize: 18, fontWeight: 700, color: text, letterSpacing: '-0.03em' }}>{fmt.pct(pct)}</span>}
                                <span style={{ fontSize: 10, color: muted }}>conversion</span>
                                <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{isLoadingEnquiryMetrics ? <div style={{ width: 140, height: 10, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)', borderRadius: 2, animation: 'opsDashPulse 1.5s ease-in-out infinite 0.1s' }} /> : <><span style={{ fontWeight: 600, color: text }}>{fmt.int(opened)}</span> matters from <span style={{ fontWeight: 600, color: text }}>{fmt.int(total)}</span> enquiries</>}</span>
                              </div>
                              <div style={{ position: 'relative', height: 4, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: isLoadingEnquiryMetrics ? '38%' : `${Math.min(pct, 100)}%`, background: isLoadingEnquiryMetrics ? (isDarkMode ? 'rgba(135,243,243,0.3)' : 'rgba(54,144,206,0.25)') : colours.green, animation: isLoadingEnquiryMetrics ? 'opsDashPulse 1.5s ease-in-out infinite' : 'opsDashBarGrow 0.6s ease both', transformOrigin: 'left' }} />
                              </div>
                            </div>
                          );
                        })()}

                        {topAow.length > 0 && (() => {
                          const maxCount = Math.max(...topAow.map((a) => a.count), 1);
                          return (
                            <div style={{ padding: '8px 14px 6px', animation: 'opsDashFadeIn 0.3s ease 0.35s both' }}>
                              <div style={{ fontSize: 10, color: muted, marginBottom: 6 }}>Area of Work</div>
                              {topAow.map((a, i) => (
                                <div key={i} style={{ marginBottom: 6, animation: `opsDashRowFade 0.2s ease ${0.38 + i * 0.04}s both` }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: aowColor(a.key), flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: text, flex: 1 }}>{a.key}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: text }}>{a.count}</span>
                                  </div>
                                  {progressBar((a.count / maxCount) * 100, { color: aowColor(a.key), height: 2 })}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Pipeline ── */}
          {!hidePipelineAndMatters && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <div className="home-section-header" style={{ minHeight: 18 }}>
            <FiFilter size={10} className="home-section-header-icon" />Pipeline
            <div
              title={enquiriesLiveRefreshInFlight ? 'Home is checking the live enquiries feed.' : enquiriesUsingSnapshot ? 'Home is showing cached data until the live feed settles.' : 'Home is showing the live enquiries feed.'}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: muted,
                fontSize: 7,
                fontWeight: 600,
                letterSpacing: '0.28px',
                whiteSpace: 'nowrap',
                lineHeight: 1,
                maxWidth: isNarrow ? '56%' : 136,
                overflow: 'hidden',
                opacity: 0.8,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: pipelineSyncMeta.color, flexShrink: 0, opacity: 0.9 }} />
              <span style={{ color: text, opacity: 0.82 }}>{pipelineSyncMeta.label}</span>
              {!isNarrow ? <span style={{ opacity: 0.64, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pipelineSyncMeta.detail}</span> : null}
            </div>
          </div>
          {(!enquiryMetrics || enquiryMetrics.length === 0) ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: isNarrow ? 'auto auto' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, flex: 1, minHeight: pipelineRailHeight ?? 0 }}>
              {renderPipelineSkeletonCard('activity')}
              {renderPipelineSkeletonCard('matters')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gridTemplateRows: isNarrow ? 'auto auto' : 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 6,
                flex: 1,
                minHeight: pipelineRailHeight ?? 0,
              }}
            >

            {/* ── Column 2: Recent Activity (tabbed) ── */}
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0, height: isNarrow ? 'auto' : '100%', maxHeight: isNarrow ? 380 : pipelineCardHeight ?? '100%', animation: 'opsDashFadeIn 0.35s ease 0.1s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              {/* Activity tabs */}
              <div style={{
                display: 'flex',
                borderBottom: `1px solid ${cardBorder}`,
              }}>
                {([['enquiries', 'Enquiries'], ['unclaimed', 'Unclaimed']] as const).map(([key, label]) => {
                  const tabCount = key === 'enquiries'
                    ? filteredRecents.length
                    : claimSignal.unclaimed;
                  return (
                  <div
                    key={key}
                    onClick={() => setActivityTab(key)}
                    style={{
                      flex: 1,
                      padding: '9px 6px 7px',
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.3px',
                      textAlign: 'center',
                      color: text,
                      borderBottom: activityTab === key ? `2px solid ${accent}` : '2px solid transparent',
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: activityTab === key ? tabActiveBg : 'transparent',
                      transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
                    }}
                  >
                    {label}
                    {tabCount > 0 && <span style={{ marginLeft: 3, fontSize: 8, opacity: 0.6 }}>{tabCount}</span>}
                  </div>
                  );
                })}
              </div>
              <div className="ops-dash-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {activityTab === 'unclaimed' ? renderUnclaimedPipelinePanel() : detailsLoading && filteredRecents.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 6 }}>
                    <FiRefreshCw size={13} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite' }} />
                    <span style={{ fontSize: 11, color: muted }}>Loading activity…</span>
                  </div>
                ) : filteredRecents.length > 0 ? (
                  <div style={{ width: '100%', transition: 'opacity 0.2s ease' }}>
                    {/* Column headers — CSS Grid aligned with matters */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: matterGridTemplate,
                      alignItems: 'center',
                      gap: 0,
                      padding: '7px 8px 5px 4px',
                      background: theadBg,
                      borderBottom: `1px solid ${cardBorder}`,
                    }}>
                      <span onClick={() => toggleSort('aow')} style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }} title="Sort by area of work">
                        <FiFolder size={9} style={{ color: sortKey === 'aow' ? theadAccent : theadText, opacity: 0.8 }} />
                      </span>
                      <span onClick={() => toggleSort('date')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sortKey === 'date' ? theadAccent : theadText, cursor: 'pointer', userSelect: 'none' }}>
                        Date{sortKey === 'date' ? (sortDesc ? ' ↓' : ' ↑') : ''}
                      </span>
                      <span onClick={() => toggleSort('name')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sortKey === 'name' ? theadAccent : theadText, cursor: 'pointer', userSelect: 'none' }}>
                        Prospect{sortKey === 'name' ? (sortDesc ? ' ↓' : ' ↑') : ''}
                      </span>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: enquiryActionGridTemplate,
                          alignItems: 'center',
                          justifyContent: 'end',
                          gap: 0,
                          minWidth: 0,
                          width: '100%',
                        }}
                      >
                        <span aria-hidden="true" style={{ width: '100%', display: 'block' }} />
                        <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, textAlign: 'left', whiteSpace: 'nowrap', width: '100%', paddingLeft: 2 }}>FE</span>
                        <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: theadText, opacity: 0.32, display: 'flex', justifyContent: 'center' }}>|</span>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${HOME_ENQUIRY_STEP_HEADER_LABELS.length}, minmax(0, 1fr))`,
                            alignItems: 'center',
                            gap: 0,
                            textAlign: 'center',
                            width: '100%',
                            minWidth: 0,
                          }}
                        >
                          {HOME_ENQUIRY_STEP_HEADER_LABELS.map((label) => (
                            <span
                              key={label}
                              style={{
                                fontSize: 7,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.35px',
                                color: theadText,
                                opacity: 0.82,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={label}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Data rows */}
                    {filteredRecents.map((r, i) => {
                      const enquiryId = String(r.enquiryId || r.id || '').trim();
                      const hasProspectLink = enquiryId.length > 0;
                      const isClaimedLocally = enquiryId ? claimedRecentEnquiryIds.has(enquiryId) : false;
                      const activityStage = activityStageForRecord(r);
                      const effectiveStage = effectiveStageForRecord(r);
                      const activityLevel = stageLevel(activityStage);
                      const effectiveLevel = stageLevel(effectiveStage);
                      const stageImpliesClaimed = activityLevel >= 2 || effectiveLevel >= 2;
                      const recordKey = getRecentRecordKey(r) || `recent-${i}`;
                      const notesText = String(r.notes || '').trim();
                      const hasNotes = notesText.length > 0;
                      const notesExpanded = expandedRecentNoteIds.has(recordKey);
                      const selectedScenarioId = selectedPitchScenariosByRecord[recordKey] || getDefaultPitchScenarioForRecord(r);
                      const rowLifecycleProcessing = !hasSeededRecentEnquiryRecords && (detailsLoading || !pitchLookupHydrated);
                      const hasPitchEvidence = hasPitchEvidenceForRecord(r);
                      const hasInstruction = hasInstructionForRecord(r);
                      const hasCompletedPitch = hasCompletedPitchForRecord(r);
                      const followUpSummary = getFollowUpSummaryForRecord(r);
                      const followUpDueState = getFollowUpDueStateForRecord(r);
                      const followUpAgeHours = hoursSince(r.pitchedAt || r.date);
                      const pitchedByDisplay = resolveFeeEarnerDisplay(r.pitchedBy);
                      const claimedBy = isClaimedLocally
                        ? (userInitials?.toUpperCase() || r.teamsClaimed || r.poc)
                        : (r.teamsClaimed || (stageImpliesClaimed ? r.poc : undefined));
                      const hasTeams = !!r.teamsLink && !!claimedBy;
                      const isClaimingRecent = enquiryId.length > 0 && claimingRecentEnquiryId === enquiryId;
                      const enquiryDateParts = friendlyDateParts(r.date, liveNowMs);
                      const enquiryFe = resolveFeeEarnerDisplay(claimedBy);
                      const followUpLabel = (() => {
                        if (followUpSummary) return 'Follow';
                        if (followUpDueState === 'late') {
                          return followUpAgeHours >= 72
                            ? `Follow ${Math.round((followUpAgeHours - 48) / 24)}d`
                            : `Follow ${Math.round(followUpAgeHours - 48)}h`;
                        }
                        if (followUpDueState === 'due') return 'Follow due';
                        if (followUpDueState === 'pending') return `Follow ${Math.max(1, Math.round(24 - followUpAgeHours))}h`;
                        return 'Follow';
                      })();
                      const lifecycleItems: HomePipelineStripItem<EnquiryLifecycleStepKey>[] = rowLifecycleProcessing ? [
                        {
                          key: 'pitch',
                          label: 'Pitch',
                          tone: colours.subtleGrey,
                          title: 'Checking live claim and pitch state…',
                          state: 'loading',
                          disabled: true,
                        },
                        {
                          key: 'follow-up',
                          label: 'Follow',
                          tone: colours.subtleGrey,
                          title: 'Checking live claim and pitch state…',
                          state: 'loading',
                          disabled: true,
                        },
                        {
                          key: 'instruction',
                          label: 'Instruct',
                          tone: colours.subtleGrey,
                          title: 'Checking live claim and pitch state…',
                          state: 'loading',
                          disabled: true,
                        },
                      ] : [
                        {
                          key: 'pitch',
                          label: 'Pitch',
                          tone: hasCompletedPitch
                            ? colours.green
                            : claimedBy
                              ? (isDarkMode ? colours.accent : colours.highlight)
                              : colours.subtleGrey,
                          title: hasPitchEvidence
                            ? `Pitched${pitchedByDisplay.title ? ` by ${pitchedByDisplay.title}` : ''}${r.pitchedAt ? ` on ${friendlyDate(r.pitchedAt)}` : ''}`
                            : `Open ${HOME_PITCH_SCENARIO_STRIP_ITEMS.find((item) => item.key === selectedScenarioId)?.title || 'pitch builder'}`,
                          state: hasCompletedPitch ? 'done' : (claimedBy ? 'active' : 'default'),
                          disabled: hasInstruction || (!claimedBy && !stageImpliesClaimed),
                        },
                        {
                          key: 'follow-up',
                          label: followUpLabel,
                          tone: followUpDueState === 'pending' ? colours.subtleGrey : followUpDueState === 'late' ? colours.cta : colours.orange,
                          title: followUpSummary
                            ? `${followUpSummary.totalCount} follow-up attempt${followUpSummary.totalCount === 1 ? '' : 's'} recorded${followUpSummary.lastFollowUpAt ? `, last ${friendlyDate(followUpSummary.lastFollowUpAt)}` : ''}`
                            : followUpDueState === 'late'
                              ? 'Follow-up overdue'
                              : followUpDueState === 'due'
                                ? 'Follow-up due'
                                : followUpDueState === 'pending'
                                  ? 'Pitched recently — follow-up window opens in 24h'
                                  : 'Record a follow-up attempt',
                          state: followUpSummary
                            ? 'done'
                            : followUpDueState === 'due' || followUpDueState === 'late'
                              ? 'active'
                              : 'default',
                          disabled: !hasPitchEvidence || followUpDueState === 'pending',
                        },
                        {
                          key: 'instruction',
                          label: 'Instruct',
                          tone: hasInstruction ? colours.green : colours.subtleGrey,
                          title: hasInstruction ? 'Instruction received' : 'Instruction not yet received',
                          state: hasInstruction ? 'done' : 'default',
                        },
                      ];
                      return (
                        <div
                          key={i}
                          className="ops-enquiry-row"
                          style={{ borderBottom: `1px solid ${rowBorder}`, animation: `opsDashRowFade 0.25s ease ${0.03 * i}s both` }}
                        >
                          <div
                            style={{
                              padding: '6px 8px 6px 4px',
                              cursor: hasProspectLink ? 'pointer' : 'default',
                              display: 'grid',
                              gridTemplateColumns: matterGridTemplate,
                              alignItems: 'center',
                              gap: 0,
                              transition: 'background 0.15s ease',
                            }}
                            onClick={hasProspectLink ? () => openEnquiryRecord(r) : undefined}
                            title={hasProspectLink ? 'Open prospect' : undefined}
                            onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* AoW glyph */}
                            <span style={{ display: 'flex', justifyContent: 'center', opacity: 0.55 }} title={r.aow || 'Unknown'}>{renderAreaOfWorkGlyph(r.aow || '', undefined, 'glyph', 12)}</span>

                            {/* Date */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 24 }} title={r.date ? new Date(r.date).toLocaleString('en-GB') : undefined}>
                              <span style={{ fontSize: 9, color: enquiryDateParts.isToday ? text : muted, lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                                {enquiryDateParts.primary}
                              </span>
                              <span style={{ fontSize: 8, color: muted, opacity: enquiryDateParts.secondary ? 0.9 : 0.45, whiteSpace: 'nowrap', lineHeight: 1.05 }}>{enquiryDateParts.secondary || '—'}</span>
                            </div>

                            {/* Name + email */}
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, lineHeight: 1.15 }}>{r.name || '—'}</span>
                                {r.name && (
                                  <button
                                    className="ops-copy-btn"
                                    type="button"
                                    title="Copy name"
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(r.name || ''); }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                                  </button>
                                )}

                              </div>
                              {r.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <span style={{ fontSize: 9, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1 }}>{r.email}</span>
                                  <button
                                    className="ops-copy-btn"
                                    type="button"
                                    title="Copy email"
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(r.email || ''); }}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Notes + FE + Pipeline */}
                            <div style={{ display: 'grid', gridTemplateColumns: enquiryActionGridTemplate, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
                              <span
                                style={{
                                  width: HOME_ENQUIRY_NOTES_SLOT_WIDTH,
                                  height: 20,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {hasNotes ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleRecentNotesTray(recordKey);
                                    }}
                                    style={{
                                      border: 'none',
                                      background: notesExpanded
                                        ? (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.08)')
                                        : 'transparent',
                                      width: HOME_ENQUIRY_NOTES_SLOT_WIDTH,
                                      height: 20,
                                      padding: 0,
                                      margin: 0,
                                      fontSize: 8,
                                      fontWeight: 700,
                                      letterSpacing: '0.3px',
                                      color: text,
                                      cursor: 'pointer',
                                      flexShrink: 0,
                                      lineHeight: '14px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title={notesExpanded ? 'Hide notes' : 'Reveal notes'}
                                    aria-label={notesExpanded ? 'Hide notes' : 'Reveal notes'}
                                  >
                                    {notesExpanded ? <FiChevronUp size={10} /> : <FiChevronDown size={10} />}
                                  </button>
                                ) : null}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-start', width: '100%', minWidth: 0 }} title={rowLifecycleProcessing ? 'Checking live claim state…' : claimedBy ? `Claimed by ${enquiryFe.title || enquiryFe.label}` : 'Claim this enquiry'}>
                                {rowLifecycleProcessing ? (
                                  <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 3, flexShrink: 0 }}>
                                    <FiRefreshCw size={10} style={{ color: muted, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
                                  </span>
                                ) : claimedBy ? (
                                  <>
                                    <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 3, flexShrink: 0 }}>
                                      {hasTeams ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(r.teamsLink, '_blank');
                                          }}
                                          title={`Open in Teams · ${r.teamsChannel || 'Channel'}`}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: 0,
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            lineHeight: 0,
                                          }}
                                        >
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.98 }}>
                                            <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5z" stroke={colours.green} strokeWidth="1.9" />
                                            <path d="M8 10h3.5" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" />
                                            <path d="M9.75 10v4.5" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" />
                                            <path d="M15 9l3.8-1.5A1 1 0 0 1 20 8.43v7.14a1 1 0 0 1-1.2.98L15 15" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                                          </svg>
                                        </button>
                                      ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }} title="Claimed. Teams card refresh pending.">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.72 }}>
                                            <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5z" stroke={colours.green} strokeWidth="1.9" />
                                            <path d="M8 10h3.5" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" />
                                            <path d="M9.75 10v4.5" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" />
                                            <path d="M15 9l3.8-1.5A1 1 0 0 1 20 8.43v7.14a1 1 0 0 1-1.2.98L15 15" stroke={colours.green} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                                          </svg>
                                        </span>
                                      )}
                                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                        <circle cx="6" cy="6" r="5" fill={colours.green} opacity="0.18" />
                                        <path d="M3 6.2 5 8.1 9 4" stroke={colours.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </span>
                                    <span style={{ fontSize: 8, fontWeight: 700, color: colours.green, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                                      {enquiryFe.label}
                                    </span>
                                  </>
                                ) : enquiryId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClaimRecentEnquiry(r);
                                    }}
                                    disabled={isClaimingRecentEnquiry && !isClaimingRecent}
                                    style={{ '--home-pipeline-action-tone': colours.cta, opacity: isClaimingRecentEnquiry && !isClaimingRecent ? 0.45 : undefined } as React.CSSProperties}
                                    className={isClaimingRecent ? 'home-pipeline-action home-pipeline-action--busy' : 'home-pipeline-action'}
                                  >
                                    {isClaimingRecent ? 'Claiming…' : 'Claim'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 8, fontWeight: 600, color: muted }}>—</span>
                                )}
                              </div>
                              <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: muted, opacity: 0.42, display: 'flex', justifyContent: 'center' }}>|</span>
                              <div
                                style={{ '--home-pipeline-columns': lifecycleItems.length, width: '100%', minWidth: 0 } as React.CSSProperties}
                                onClick={(e) => e.stopPropagation()}
                                title="Enquiry lifecycle"
                              >
                                <HomePipelineStrip
                                  items={lifecycleItems}
                                  onSelect={(stepKey) => {
                                    if (stepKey === 'pitch') {
                                      showToast({ type: 'info', message: 'Opening pitch builder…', duration: 1500 });
                                      openPitchBuilderForRecord(r, selectedScenarioId);
                                      return;
                                    }
                                    if (stepKey === 'follow-up') {
                                      showToast({ type: 'info', message: 'Recording follow-up…', duration: 1500 });
                                      openEnquiryFollowUpModal(r);
                                      return;
                                    }
                                    openEnquiryRecord(r);
                                  }}
                                  ariaLabel="Enquiry lifecycle"
                                />
                              </div>
                            </div>
                          </div>
                          {notesExpanded && hasNotes ? (
                            <div
                              style={{
                                marginLeft: sharedDotColumnWidth,
                                marginRight: 8,
                                padding: '8px 10px 10px',
                                borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.08)'}`,
                                background: isDarkMode ? 'rgba(255,255,255,0.025)' : 'rgba(13,47,96,0.03)',
                              }}
                            >
                              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.32px', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 4 }}>
                                Notes
                              </div>
                              <div style={{ fontSize: 10, lineHeight: 1.45, color: isDarkMode ? '#d1d5db' : '#374151', whiteSpace: 'pre-wrap' }}>
                                {notesText}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const emptyIcon = <FiInbox size={18} />;
                    const emptyMsg = 'No Enquiries';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 6 }}>
                        <div style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, opacity: 0.5 }}>{emptyIcon}</div>
                        <span style={{ fontSize: 11, color: muted, letterSpacing: '0.2px' }}>{emptyMsg}</span>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* ── Column 3: Matters ── */}
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0, height: isNarrow ? 'auto' : '100%', maxHeight: isNarrow ? 380 : pipelineCardHeight ?? '100%', overflow: 'hidden', animation: 'opsDashFadeIn 0.35s ease 0.15s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              <div style={{
                padding: '7px 12px 5px',
                background: tabActiveBg,
                borderBottom: `2px solid ${accent}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, letterSpacing: '0.3px', lineHeight: 1.1 }}>Matters</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {displayMatters.length > 0 && (
                    <span style={{ fontSize: 8, color: muted, opacity: 0.5, lineHeight: 1.1 }}>{displayMatters.length} shown</span>
                  )}
                  {canSeeCcl && (() => {
                    const total = displayMatters.length;
                    const withCcl = displayMatters.filter(m => cclMap[m.matterId]).length;
                    if (withCcl > 0) return <span style={{ fontSize: 8, color: isDarkMode ? colours.accent : colours.highlight, opacity: 0.7, lineHeight: 1.1 }}>{withCcl}/{total} CCL</span>;
                    return null;
                  })()}
                </div>
              </div>
              <div className="ops-dash-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {displayMatters.length > 0 ? (
                  <div style={{ padding: 0 }}>
                    {/* Column headers */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: matterGridTemplate,
                      alignItems: 'center',
                      gap: 0,
                      padding: '7px 8px 5px 4px',
                      background: theadBg, borderBottom: `1px solid ${cardBorder}`,
                    }}>
                      <span onClick={() => toggleMatterSort('aow')} style={{ width: 'auto', flexShrink: 0, display: 'flex', justifyContent: 'center', cursor: 'pointer' }} title="Sort by area of work">
                        <FiFolder size={9} style={{ color: matterSortKey === 'aow' ? theadAccent : theadText, opacity: 0.8 }} />
                      </span>
                      <span onClick={() => toggleMatterSort('date')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'date' ? theadAccent : theadText, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}>Date{matterSortKey === 'date' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      <span onClick={() => toggleMatterSort('name')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'name' ? theadAccent : theadText, flex: 1, cursor: 'pointer', userSelect: 'none' }}>Matter{matterSortKey === 'name' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: matterActionGridTemplate, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
                        <span onClick={() => toggleMatterSort('fe')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'fe' ? theadAccent : theadText, textAlign: 'left', paddingLeft: 2, cursor: 'pointer', userSelect: 'none', width: '100%' }}>FE{matterSortKey === 'fe' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                        {matterActionLabelWidth > 0 ? <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: theadText, opacity: 0.32, display: 'flex', justifyContent: 'center' }}>|</span> : null}
                        {matterActionLabelWidth > 0 ? (
                          showInlineMatterSteps ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${HOME_MATTER_STEP_HEADER_LABELS.length}, minmax(0, 1fr))`,
                                alignItems: 'center',
                                gap: 0,
                                textAlign: 'center',
                                width: '100%',
                                minWidth: 0,
                                opacity: canSeeCcl ? 1 : 0.42,
                              }}
                              title={canSeeCcl ? 'CCL lifecycle' : 'CCL lifecycle (view only)'}
                            >
                              {HOME_MATTER_STEP_HEADER_LABELS.map((label) => (
                                <span
                                  key={label}
                                  style={{
                                    fontSize: 7,
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.35px',
                                    color: theadText,
                                    opacity: 0.82,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={label}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, textAlign: 'left', width: '100%', paddingLeft: 2 }} title={canSeeCcl ? 'CCL' : undefined}>CCL</span>
                          )
                        ) : null}
                      </div>
                    </div>
                    {displayMatters.map((m, i) => {
                      const ccl = cclMap[m.matterId] || null;
                      const matterDateParts = friendlyDateParts(m.openDate, liveNowMs);
                      const matterResponsible = resolveFeeEarnerDisplay(m.responsibleSolicitor);
                      const matterOriginating = resolveFeeEarnerDisplay(m.originatingSolicitor);
                      const normalizedResponsible = (m.responsibleSolicitor || '').trim().toLowerCase();
                      const normalizedOriginating = (m.originatingSolicitor || '').trim().toLowerCase();
                      const showOriginating = Boolean(normalizedOriginating) && normalizedOriginating !== normalizedResponsible;
                      const isCclStatusResolving = !!cclStatusResolvingByMatter[m.matterId];
                      const hasResolvedCclStatus = !!cclStatusResolvedByMatter[m.matterId];
                      const showCclStatusResolving = (canSeeCcl || showInlineMatterSteps) && (!hasResolvedCclStatus || isCclStatusResolving);
                      const isExp = canSeeCcl && !showInlineMatterSteps && expandedCcl === m.matterId;
                      const isDemo = String(m.matterId || '').toUpperCase().startsWith('DEMO-');
                      const clioUrl = m.matterId && !isDemo ? `https://eu.app.clio.com/nc/#/matters/${m.matterId}` : undefined;
                      const cclStage = getCanonicalCclStage(ccl?.stage || ccl?.status);
                      const hasDraft = Boolean(ccl && ccl.version);
                      const isApproved = cclStage === 'reviewed' || cclStage === 'sent';
                      const isAiRunning = cclAiFillingMatter === m.matterId;
                      const aiStatus = cclAiStatusByMatter[m.matterId] || '';
                      const isPtRunning = cclPressureTestRunning === m.matterId;
                      const ptResult = cclPressureTestByMatter[m.matterId];
                      const ptFlagged = ptResult?.flaggedCount || 0;
                      const toNd = Boolean(ccl?.uploadedToNd);
                      const compileDone = Boolean(ccl?.compiledAt || ccl?.compileSummary || cclStage === 'compiled' || cclStage === 'generated' || cclStage === 'pressure-tested' || cclStage === 'reviewed' || cclStage === 'sent');
                      const genDone = hasDraft;
                      const genActive = isAiRunning;
                      const pressureDone = Boolean(ptResult) || cclStage === 'pressure-tested' || cclStage === 'reviewed' || cclStage === 'sent';
                      const pressureActive = hasDraft && !pressureDone && isPtRunning;
                      const reviewDone = isApproved;
                      const reviewActive = hasDraft && pressureDone && !isApproved;
                      const ndDone = toNd;
                      const activeMatterStepKey: HomeMatterStepKey = !compileDone
                        ? 'compile'
                        : genActive || !genDone
                          ? 'generate'
                          : pressureActive || !pressureDone
                            ? 'pressure'
                            : !reviewDone
                              ? 'review'
                              : 'nd';
                      const inlineStageHint = genActive
                        ? aiStatus || 'Generating'
                        : !compileDone
                          ? 'Compile'
                          : !genDone
                            ? 'Generate'
                            : pressureActive
                              ? 'Testing'
                              : !pressureDone
                                ? 'Pressure test'
                                : !reviewDone
                                  ? (ptFlagged > 0 ? `${ptFlagged} flag${ptFlagged === 1 ? '' : 's'}` : 'Review')
                                  : ndDone
                                    ? 'In ND'
                                    : 'ND pending';
                      const openReview = (event: React.MouseEvent) => {
                        event.stopPropagation();
                        openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                      };
                      const activeMatterTone = isDarkMode ? colours.accent : colours.highlight;
                      const matterStepsReadOnly = !canSeeCcl;
                      const readOnlyCclTitleSuffix = matterStepsReadOnly ? ' (view only)' : '';
                      const matterStepItems: HomePipelineStripItem<HomeMatterStepKey>[] = [
                        {
                          key: 'compile',
                          label: 'Compile',
                          state: compileDone ? 'done' : (activeMatterStepKey === 'compile' ? 'active' : 'default'),
                          title: `${compileDone ? 'Compilation Results' : 'Compile context and evidence'}${readOnlyCclTitleSuffix}`,
                          tone: compileDone ? colours.green : activeMatterTone,
                          disabled: matterStepsReadOnly,
                        },
                        {
                          key: 'generate',
                          label: genActive ? 'Drafting' : 'Draft',
                          state: genDone ? 'done' : (genActive ? 'loading' : (activeMatterStepKey === 'generate' ? 'active' : 'default')),
                          title: `${genDone ? 'Open generated CCL draft' : genActive ? 'Generating CCL draft' : 'Generate CCL draft'}${readOnlyCclTitleSuffix}`,
                          tone: genDone ? colours.green : activeMatterTone,
                          disabled: matterStepsReadOnly || genActive,
                        },
                        {
                          key: 'pressure',
                          label: pressureActive ? 'Testing' : 'Test',
                          state: pressureDone ? 'done' : (pressureActive ? 'loading' : (activeMatterStepKey === 'pressure' ? 'active' : 'default')),
                          title: `${pressureDone ? 'Pressure Test Results' : genDone ? 'Run Pressure Test' : 'Generate draft before Pressure Test'}${readOnlyCclTitleSuffix}`,
                          tone: pressureDone ? colours.green : activeMatterTone,
                          disabled: matterStepsReadOnly || !genDone,
                        },
                        {
                          key: 'review',
                          label: 'Review',
                          state: reviewDone ? 'done' : (activeMatterStepKey === 'review' ? 'active' : 'default'),
                          title: `${reviewDone ? 'Open reviewed CCL' : hasDraft ? 'Review CCL draft' : 'Draft required before review'}${readOnlyCclTitleSuffix}`,
                          tone: reviewDone ? colours.green : activeMatterTone,
                          disabled: matterStepsReadOnly || !hasDraft,
                        },
                        {
                          key: 'nd',
                          label: 'Upload',
                          state: ndDone ? 'done' : (activeMatterStepKey === 'nd' ? 'active' : 'default'),
                          title: `${ndDone ? 'CCL is in NetDocuments' : reviewDone ? 'Open CCL to finish NetDocuments delivery' : 'Review required before NetDocuments'}${readOnlyCclTitleSuffix}`,
                          tone: ndDone ? colours.green : activeMatterTone,
                          disabled: matterStepsReadOnly || (!reviewDone && !ndDone),
                        },
                      ];
                      const matterLoadingTone = isDarkMode ? colours.accent : colours.highlight;
                      const matterLoadingItems: HomePipelineStripItem<HomeMatterStepKey>[] = [
                        { key: 'compile', label: 'Compile', state: 'loading', tone: matterLoadingTone, title: 'Resolving CCL status…', disabled: true },
                        { key: 'generate', label: 'Draft', state: 'loading', tone: matterLoadingTone, title: 'Resolving CCL status…', disabled: true },
                        { key: 'pressure', label: 'Test', state: 'loading', tone: matterLoadingTone, title: 'Resolving CCL status…', disabled: true },
                        { key: 'review', label: 'Review', state: 'loading', tone: matterLoadingTone, title: 'Resolving CCL status…', disabled: true },
                        { key: 'nd', label: 'Upload', state: 'loading', tone: matterLoadingTone, title: 'Resolving CCL status…', disabled: true },
                      ];
                      const cclDotColor = !ccl
                        ? (isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)')
                        : cclStage === 'sent'
                          ? colours.green
                          : cclStage === 'reviewed' || cclStage === 'pressure-tested' || cclStage === 'generated' || cclStage === 'compiled'
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : colours.orange;
                      const collapsedCta = !ccl
                        ? null
                        : hasDraft
                          ? {
                              label: isApproved ? 'Open' : 'Review',
                              title: isApproved ? 'Open CCL' : 'Review CCL',
                              tone: isApproved ? 'done' as const : 'action' as const,
                              onClick: (event: React.MouseEvent) => {
                                event.stopPropagation();
                                openCclLetterModal(m.matterId);
                              },
                            }
                          : {
                              label: 'Draft',
                              title: 'Open CCL',
                              tone: 'muted' as const,
                              onClick: (event: React.MouseEvent) => {
                                event.stopPropagation();
                                setExpandedCcl(prev => prev === m.matterId ? null : m.matterId);
                              },
                            };

                      return (
                        <div
                          key={m.matterId || i}
                          className="ops-matter-row"
                          style={{
                            borderBottom: `1px solid ${rowBorder}`,
                            animation: `opsDashRowFade 0.25s ease ${0.04 * i}s both`,
                          }}
                        >
                          {/* Matter summary row */}
                          <div
                            style={{
                              padding: '6px 8px 6px 4px',
                              cursor: 'pointer',
                              display: 'grid',
                              gridTemplateColumns: matterGridTemplate,
                              alignItems: 'center',
                              gap: 0,
                              transition: 'background 0.15s ease',
                            }}
                            onClick={() => {
                              if (canSeeCcl && !showInlineMatterSteps) {
                                setExpandedCcl(prev => prev === m.matterId ? null : m.matterId);
                              } else {
                                window.dispatchEvent(new CustomEvent('navigateToMatter', { detail: { matterId: m.matterId } }));
                              }
                            }}
                            onMouseEnter={(e) => {
                              window.dispatchEvent(new CustomEvent('warmMattersTab'));
                              e.currentTarget.style.background = hoverBg;
                            }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* AoW glyph */}
                            <span style={{ display: 'flex', justifyContent: 'center', opacity: 0.55 }} title={m.practiceArea || 'Unknown'}>{renderAreaOfWorkGlyph(m.practiceArea || '', undefined, 'glyph', 12)}</span>

                            {/* Date */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 24 }} title={m.openDate ? new Date(m.openDate).toLocaleString('en-GB') : undefined}>
                              <span style={{ fontSize: 9, color: matterDateParts.isToday ? text : muted, lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                                {matterDateParts.primary}
                              </span>
                              <span style={{ fontSize: 8, color: muted, opacity: matterDateParts.secondary ? 0.9 : 0.45, whiteSpace: 'nowrap', lineHeight: 1.05 }}>
                                {matterDateParts.secondary || '—'}
                              </span>
                            </div>

                            {/* Ref + client */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                                <span
                                  style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, lineHeight: 1.15, flexShrink: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                                  onMouseEnter={() => { window.dispatchEvent(new CustomEvent('warmMattersTab')); }}
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('navigateToMatter', { detail: { matterId: m.matterId } })); }}
                                  title="Open matter"
                                >
                                  {m.displayNumber}
                                </span>
                                {m.displayNumber && (
                                  <button
                                    className="ops-copy-btn"
                                    type="button"
                                    title="Copy matter ref"
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(m.displayNumber || ''); }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                                  </button>
                                )}
                              </div>
                              <span style={{ fontSize: 9, color: muted, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(m.clientName && m.clientName.trim()) || '—'}</span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: matterActionGridTemplate, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between', width: '100%', minWidth: 0 }} title={showOriginating
                                ? `Responsible: ${matterResponsible.title || '—'} · Originating: ${matterOriginating.title || '—'}`
                                : (matterResponsible.title || undefined)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                  <span style={{ fontSize: 8, fontWeight: 700, color: matterResponsible.label !== '—' ? colours.green : muted, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                                    {matterResponsible.label}
                                  </span>
                                  {showOriginating && (
                                    <>
                                      <span style={{ fontSize: 8, color: muted, opacity: 0.55, lineHeight: 1 }}>·</span>
                                      <span style={{ fontSize: 8, fontWeight: 700, color: matterOriginating.label !== '—' ? (isDarkMode ? colours.accent : colours.highlight) : muted, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                                        {matterOriginating.label}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <span
                                  style={{
                                    marginLeft: 6,
                                    flexShrink: 0,
                                    fontSize: 7,
                                    fontWeight: 700,
                                    letterSpacing: '0.35px',
                                    textTransform: 'uppercase',
                                    color: colours.greyText,
                                    opacity: 0.6,
                                  }}
                                  title={m.sourceVersion === 'v4' ? 'New space matter' : 'Legacy matter'}
                                >
                                  {m.sourceVersion === 'v4' ? 'v4' : 'v3'}
                                </span>
                              </div>
                              {matterActionLabelWidth > 0 ? <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: muted, opacity: canSeeCcl ? 0.42 : 0.26, display: 'flex', justifyContent: 'center' }}>|</span> : null}
                              {matterActionLabelWidth > 0 ? (
                                showCclStatusResolving ? (
                                  <div
                                    style={{ '--home-pipeline-columns': matterLoadingItems.length, width: '100%', minWidth: 0, overflow: 'hidden' } as React.CSSProperties}
                                    onClick={(event) => event.stopPropagation()}
                                    title={matterStepsReadOnly ? 'Resolving CCL status (view only)' : 'Resolving CCL status'}
                                  >
                                    <HomePipelineStrip
                                      items={matterLoadingItems}
                                      onSelect={() => undefined}
                                      className={matterStepsReadOnly ? 'home-pipeline-strip--readonly' : undefined}
                                      ariaLabel="Matter CCL steps loading"
                                    />
                                  </div>
                                ) : showInlineMatterSteps ? (
                                  <div
                                    style={{ '--home-pipeline-columns': matterStepItems.length, width: '100%', minWidth: 0, overflow: 'hidden' } as React.CSSProperties}
                                    onClick={(event) => event.stopPropagation()}
                                    title={`${matterStepsReadOnly ? 'CCL lifecycle (view only)' : 'CCL'}${ccl ? ` · ${getCanonicalCclLabel(ccl?.stage || ccl?.status, ccl?.label)}${ccl?.version ? ` · v${ccl.version}` : ''}` : ''}`}
                                  >
                                    <HomePipelineStrip
                                      items={matterStepItems}
                                      onSelect={(stepKey) => {
                                        if (!canSeeCcl) return;

                                        if (stepKey === 'compile') {
                                          openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                                          return;
                                        }

                                        if (stepKey === 'generate') {
                                          if (genDone) {
                                            openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                                            return;
                                          }
                                          if (!genActive) {
                                            openCclWorkflowModal(m.matterId, { autoRun: 'generate', compileOnly: isCompileOnlyCclStatus(ccl) });
                                          }
                                          return;
                                        }

                                        if (stepKey === 'pressure') {
                                          if (pressureDone) {
                                            openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                                            return;
                                          }
                                          if (!pressureActive && genDone) {
                                            openCclWorkflowModal(m.matterId, { autoRun: 'pressure', compileOnly: isCompileOnlyCclStatus(ccl) });
                                          }
                                          return;
                                        }

                                        if (stepKey === 'review' && hasDraft) {
                                          openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                                          return;
                                        }

                                        if (stepKey === 'nd' && (reviewDone || ndDone)) {
                                          openCclWorkflowModal(m.matterId, { compileOnly: isCompileOnlyCclStatus(ccl) });
                                        }
                                      }}
                                      className={matterStepsReadOnly ? 'home-pipeline-strip--readonly' : undefined}
                                      ariaLabel="Matter CCL steps"
                                    />
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                    <button
                                      type="button"
                                      onClick={collapsedCta ? collapsedCta.onClick : (event) => { event.stopPropagation(); setExpandedCcl(prev => prev === m.matterId ? null : m.matterId); }}
                                      style={{
                                        border: `1px solid ${collapsedCta
                                          ? collapsedCta.tone === 'action'
                                            ? (isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)')
                                            : collapsedCta.tone === 'done'
                                              ? 'rgba(32,178,108,0.18)'
                                              : 'rgba(255,255,255,0.06)'
                                          : 'transparent'}`,
                                        background: collapsedCta
                                          ? collapsedCta.tone === 'action'
                                            ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)')
                                            : collapsedCta.tone === 'done'
                                              ? 'rgba(32,178,108,0.08)'
                                              : 'rgba(255,255,255,0.025)'
                                          : 'transparent',
                                        color: collapsedCta
                                          ? collapsedCta.tone === 'action'
                                            ? accent
                                            : collapsedCta.tone === 'done'
                                              ? colours.green
                                              : muted
                                          : muted,
                                        padding: alignStackedColumns ? '3px 6px' : '2px 4px',
                                        width: matterCollapsedCclWidth,
                                        display: 'grid',
                                        gridTemplateColumns: '6px minmax(0, 1fr) 10px',
                                        alignItems: 'center',
                                        columnGap: 5,
                                        fontSize: alignStackedColumns ? 8 : 7,
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                        lineHeight: 1.1,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                        flexShrink: 0,
                                        transition: 'background 0.15s ease, border-color 0.15s ease',
                                      }}
                                      title={collapsedCta ? collapsedCta.title : (ccl ? `CCL ${getCanonicalCclLabel(ccl?.stage || ccl?.status, ccl?.label)} · v${ccl.version}` : 'Open CCL details')}
                                    >
                                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: cclDotColor }} />
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{collapsedCta ? collapsedCta.label : 'CCL'}</span>
                                      <span
                                        style={{
                                          width: 10,
                                          height: 10,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: isExp ? (isDarkMode ? colours.accent : colours.highlight) : 'currentColor',
                                          transition: 'transform 0.18s ease, color 0.18s ease',
                                          transform: isExp ? 'rotate(90deg)' : 'rotate(0deg)',
                                        }}
                                        aria-hidden="true"
                                      >
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ display: 'block' }}>
                                          <path
                                            d="M3.25 2.1L6.55 5L3.25 7.9"
                                            stroke="currentColor"
                                            strokeWidth="1.45"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </span>
                                    </button>
                                  </div>
                                )
                              ) : null}
                            </div>
                          </div>

                            {/* Expanded: CCL pipeline tray */}
                            {isExp && (
                              <div style={{
                                padding: '6px 14px 10px',
                                animation: 'opsDashRowFade 0.15s ease both',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0,
                              }}>
                                {(() => {
                                  const uploadDone = toNd;

                                  // Connector line helper
                                  const connectorColor = (done: boolean) => done
                                    ? colours.green
                                    : isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

                                  // Dot helper
                                  const dotStyle = (done: boolean, active: boolean): React.CSSProperties => ({
                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                    background: done ? colours.green : active ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
                                    boxShadow: done ? `0 0 0 3px ${isDarkMode ? 'rgba(32,178,108,0.14)' : 'rgba(32,178,108,0.10)'}` : active ? `0 0 0 3px ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.10)'}` : 'none',
                                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                                  });

                                  // Status badge helper
                                  const badge = (label: string, tone: 'done' | 'active' | 'muted') => {
                                    const toneMap = {
                                      done: { color: colours.green, bg: isDarkMode ? 'rgba(32,178,108,0.10)' : 'rgba(32,178,108,0.08)' },
                                      active: { color: isDarkMode ? colours.accent : colours.highlight, bg: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.06)' },
                                      muted: { color: isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)', bg: 'transparent' },
                                    };
                                    const t = toneMap[tone];
                                    return (
                                      <span style={{
                                        fontSize: 7.5, fontWeight: 700, letterSpacing: '0.4px',
                                        textTransform: 'uppercase', color: t.color, background: t.bg,
                                        padding: tone !== 'muted' ? '1px 5px' : 0, flexShrink: 0,
                                      }}>{label}</span>
                                    );
                                  };

                                  // Spinner
                                  const spin = (size: number = 10) => (
                                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'helix-spin 0.8s linear infinite', flexShrink: 0 }}>
                                      <circle cx="12" cy="12" r="10" stroke={isDarkMode ? colours.accent : colours.highlight} strokeWidth="3" strokeDasharray="48" strokeLinecap="round" opacity={0.3} />
                                      <circle cx="12" cy="12" r="10" stroke={isDarkMode ? colours.accent : colours.highlight} strokeWidth="3" strokeDasharray="48" strokeDashoffset="36" strokeLinecap="round" />
                                    </svg>
                                  );

                                  return (
                                    <>
                                      {/* ── Stage 1: Generate ── */}
                                      <div
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                                          cursor: !genDone && !genActive ? 'pointer' : genDone ? 'pointer' : 'default',
                                          animation: 'opsDashRowFade 0.2s ease 0s both',
                                        }}
                                        onClick={genDone ? openReview : (!genActive ? (e) => { e.stopPropagation(); openCclWorkflowModal(m.matterId, { autoRun: 'generate' }); } : undefined)}
                                        onMouseEnter={(e) => { if (!genActive) e.currentTarget.style.background = hoverBg; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <span style={dotStyle(genDone, genActive)} />
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          width: 18, height: 18, flexShrink: 0,
                                          color: genDone ? colours.green : genActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                                        }}>
                                          {genActive ? spin(14) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                          )}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontSize: 10, fontWeight: 600, color: genDone ? text : genActive ? text : muted }}>
                                            {genDone ? 'CCL generated' : genActive ? 'Generating CCL…' : 'Generate CCL'}
                                          </span>
                                          {genActive && aiStatus && (
                                            <div style={{ fontSize: 8, color: isDarkMode ? colours.accent : colours.highlight, marginTop: 1, opacity: 0.8 }}>{aiStatus}</div>
                                          )}
                                        </div>
                                        {genDone ? badge(`v${ccl?.version || 1}`, 'done') : genActive ? badge('processing', 'active') : badge('not started', 'muted')}
                                      </div>

                                      {/* Connector */}
                                      <div style={{ marginLeft: 3.5, width: 1, height: 6, background: connectorColor(genDone) }} />

                                      {/* ── Stage 2: Review ── */}
                                      <div
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                                          cursor: hasDraft && !reviewDone ? 'pointer' : reviewDone ? 'pointer' : 'default',
                                          animation: 'opsDashRowFade 0.2s ease 0.06s both',
                                        }}
                                        onClick={hasDraft ? openReview : undefined}
                                        onMouseEnter={hasDraft ? (e) => { e.currentTarget.style.background = hoverBg; } : undefined}
                                        onMouseLeave={hasDraft ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}
                                      >
                                        <span style={dotStyle(reviewDone, reviewActive)} />
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          width: 18, height: 18, flexShrink: 0,
                                          color: reviewDone ? colours.green : reviewActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                                        }}>
                                          {reviewActive ? spin(14) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                          )}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontSize: 10, fontWeight: 600, color: reviewDone ? text : hasDraft ? text : muted }}>
                                            {reviewDone ? 'Reviewed' : reviewActive ? 'Reviewing…' : hasDraft ? 'Review CCL' : 'Review'}
                                          </span>
                                          {reviewDone && ccl?.finalizedAt && (
                                            <div style={{ fontSize: 8, color: colours.green, marginTop: 1, opacity: 0.8 }}>{new Date(ccl.finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                                          )}
                                          {reviewActive && (
                                            <div style={{ fontSize: 8, color: isDarkMode ? colours.accent : colours.highlight, marginTop: 1, opacity: 0.8 }}>Safety net in progress…</div>
                                          )}
                                          {ptResult && !reviewDone && !reviewActive && (
                                            <div style={{ fontSize: 8, color: ptFlagged > 0 ? colours.orange : colours.green, marginTop: 1 }}>
                                              {ptFlagged > 0 ? `${ptFlagged} field${ptFlagged > 1 ? 's' : ''} flagged` : 'All fields passed'}
                                            </div>
                                          )}
                                        </div>
                                        {reviewDone ? badge('approved', 'done') : reviewActive ? badge('checking', 'active') : !hasDraft ? badge('waiting', 'muted') : badge('review ready', 'active')}
                                      </div>

                                      {/* Connector */}
                                      <div style={{ marginLeft: 3.5, width: 1, height: 6, background: connectorColor(reviewDone) }} />

                                      {/* ── Stage 3: Upload ── */}
                                      <div
                                        style={{
                                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0',
                                          cursor: reviewDone ? 'pointer' : 'default',
                                          animation: 'opsDashRowFade 0.2s ease 0.12s both',
                                        }}
                                        onClick={reviewDone ? openReview : undefined}
                                        onMouseEnter={reviewDone ? (e) => { e.currentTarget.style.background = hoverBg; } : undefined}
                                        onMouseLeave={reviewDone ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}
                                      >
                                        <span style={{ ...dotStyle(uploadDone, false), marginTop: 4 }} />
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          width: 18, height: 18, flexShrink: 0, marginTop: 1,
                                          color: uploadDone ? colours.green : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                                        }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                          <span style={{ fontSize: 10, fontWeight: 600, color: uploadDone ? text : muted }}>
                                            {uploadDone ? 'In NetDocuments' : reviewDone ? 'NetDocuments pending' : 'NetDocuments'}
                                          </span>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: toNd ? colours.green : (isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)') }} />
                                              <span style={{ fontSize: 8, color: toNd ? colours.green : muted, fontWeight: 600 }}>NetDocuments</span>
                                            </div>
                                          </div>
                                        </div>
                                        {uploadDone ? badge('complete', 'done') : !reviewDone ? badge('waiting', 'muted') : badge('ready', 'active')}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 6 }}>
                    <div style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, opacity: 0.5 }}><FiFolder size={18} /></div>
                    <span style={{ fontSize: 11, color: muted, letterSpacing: '0.2px' }}>No Recent Matters</span>
                  </div>
                )}
              </div>
            </div>

            </div>
          )}
          </div>
          )}

          {/* ── Right: ToDo (replaces Pipeline when toggled) ── */}
          {hidePipelineAndMatters && todoSlot && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
              <div className="home-section-header" style={{ minHeight: 18 }}>
                <FiCheckCircle size={10} className="home-section-header-icon" />To Do
                {/* 2026-04-21: count moved inline with the header label as a
                    subtle pill — sized to the label cap-height so it never
                    increases the header strip's vertical footprint. The
                    standalone strip inside ImmediateActionsBar (seamless mode)
                    is removed in tandem to reclaim the vertical space. */}
                {typeof todoCount === 'number' && todoCount > 0 && (
                  <span
                    aria-label={`${todoCount} outstanding`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                      height: 14,
                      padding: '0 5px',
                      marginLeft: 6,
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      background: isDarkMode ? withAlpha(colours.accent, 0.18) : withAlpha(colours.highlight, 0.12),
                      color: isDarkMode ? colours.accent : colours.highlight,
                    }}
                  >
                    {todoCount}
                  </span>
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: primaryRailMinHeight,
                  // D5: cap ToDo card to the measured Conversion rail height so
                  // the two panels read as peers. Long todo lists scroll inside
                  // this card rather than pushing the row taller than Conversion.
                  height: todoMatchedHeight,
                  maxHeight: todoMatchedHeight,
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  boxShadow: cardShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'opsDashFadeIn 0.35s ease 0.05s both',
                  transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '6px 10px 8px' }}>
                  {/* 2026-04-21: tighter inset (was 12/14) — count badge has
                      moved up to the section header so the body no longer
                      needs to host a header strip; the rows can sit closer to
                      the card edges and feel less padded. */}
                  {todoSlot}
                </div>
              </div>
            </div>
          )}

          </div>
        </div>
      )}

        {/* ── Calls & Attendance Notes ── */}
        <ErrorBoundary
          fallback={(
            <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, padding: '12px 14px', color: muted, fontSize: 11 }}>
              Call Centre is temporarily unavailable while the panel reloads.
            </div>
          )}
        >
          <React.Suspense
            fallback={(
              <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, padding: '12px 14px', color: muted, fontSize: 11 }}>
                Loading Call Centre…
              </div>
            )}
          >
            <CallsAndNotes isDarkMode={isDarkMode} userInitials={userInitials || ''} userEmail={userEmail} userRate={currentUserTeamMember?.Rate} isNarrow={callsAndNotesNarrow} demoModeEnabled={demoModeEnabled} isActive={isActive} />
          </React.Suspense>
        </ErrorBoundary>

        {/* ── Conversion Stream Preview Modal (D3) ── */}
        {conversionStreamPreview && selectedConversionItem ? (
          <ConversionStreamPreview
            open
            onClose={() => setConversionStreamPreview(null)}
            section={conversionStreamPreview}
            comparisonLabel={selectedConversionItem.comparisonLabel}
            currentLabel={selectedConversionItem.currentLabel}
            items={
              conversionStreamPreview === 'enquiries'
                ? (Array.isArray(selectedConversionItem.currentEnquiryProspects) ? selectedConversionItem.currentEnquiryProspects : [])
                : (Array.isArray(selectedConversionItem.currentMatterProspects) ? selectedConversionItem.currentMatterProspects : [])
            }
            aowColor={aowColor}
            isDarkMode={isDarkMode}
          />
        ) : null}

        {/* ── Enquiry Follow-Up Modal ── */}
        {enquiryFollowUpModal && (() => {
          const record = enquiryFollowUpModal.record;
          const summary = getFollowUpSummaryForRecord(record);
          const followUpDueState = getFollowUpDueStateForRecord(record);
          const lastFollowUpLabel = summary?.lastFollowUpAt ? friendlyDate(summary.lastFollowUpAt) : 'No follow-up recorded yet';
          const lastChannelLabel = summary?.lastChannel ? (summary.lastChannel === 'email' ? 'Email' : 'Phone') : 'Not yet recorded';
          const canRecordFollowUp = getDetailRecordIds(record).length > 0 || String(record.email || '').trim().length > 0;

          return createPortal(
            <div
              onClick={closeEnquiryFollowUpModal}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1200,
                background: 'rgba(0, 3, 25, 0.6)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 18,
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: 'min(560px, calc(100vw - 28px))',
                  maxHeight: 'calc(100vh - 36px)',
                  overflowY: 'auto',
                  background: isDarkMode ? 'rgba(8, 28, 48, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                  border: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.55)' : 'rgba(13,47,96,0.12)'}`,
                  boxShadow: 'var(--shadow-overlay-lg)',
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: colours.orange, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: colours.orange, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Enquiry Follow Up
                      </span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: text, lineHeight: 1.1 }}>{record.name || 'Enquiry'}</div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 6, lineHeight: 1.45 }}>
                      {record.aow || 'Area unknown'} · {hasInstructionForRecord(record) ? 'Instruction received' : followUpDueState === 'late' ? 'Follow-up overdue' : followUpDueState === 'due' ? 'Follow-up due now' : 'Track outreach against this enquiry'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeEnquiryFollowUpModal}
                    disabled={!!enquiryFollowUpSavingChannel}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: muted,
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: enquiryFollowUpSavingChannel ? 'default' : 'pointer',
                      opacity: enquiryFollowUpSavingChannel ? 0.5 : 0.8,
                    }}
                    aria-label="Close follow-up modal"
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Attempts', value: String(summary?.totalCount || 0), tone: summary?.totalCount ? colours.highlight : muted },
                    { label: 'Email / Phone', value: `${summary?.emailCount || 0} / ${summary?.phoneCount || 0}`, tone: colours.orange },
                    { label: 'Last touch', value: summary ? lastChannelLabel : 'Pending', tone: summary ? colours.green : muted },
                  ].map((item) => (
                    <div key={item.label} style={{ border: `1px solid ${rowBorder}`, padding: '10px 12px', background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.02)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: item.tone }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ border: `1px solid ${rowBorder}`, padding: '12px 14px', marginBottom: 16, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.02)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: text, marginBottom: 6 }}>Current follow-up state</div>
                  <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
                    {summary
                      ? `${summary.totalCount} follow-up attempt${summary.totalCount === 1 ? '' : 's'} recorded. Last touch: ${lastChannelLabel}${summary.lastRecordedBy ? ` by ${summary.lastRecordedBy}` : ''} on ${lastFollowUpLabel}.`
                      : followUpDueState === 'late'
                        ? 'No follow-up attempt is recorded and this enquiry is already beyond the 24-hour follow-up window.'
                        : followUpDueState === 'due'
                          ? 'No follow-up attempt is recorded and this enquiry has reached the 24-hour follow-up point.'
                          : 'No follow-up attempt is recorded yet.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { void recordEnquiryFollowUp(record, 'email'); }}
                    disabled={!canRecordFollowUp || !!enquiryFollowUpSavingChannel}
                    style={{
                      border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(54,144,206,0.24)'}`,
                      background: enquiryFollowUpSavingChannel === 'email' ? colours.highlight : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)'),
                      color: enquiryFollowUpSavingChannel === 'email' ? colours.dark.text : text,
                      padding: '12px 14px',
                      cursor: !canRecordFollowUp || enquiryFollowUpSavingChannel ? 'default' : 'pointer',
                      opacity: !canRecordFollowUp ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <FiMail size={14} />
                    {enquiryFollowUpSavingChannel === 'email' ? 'Recording email…' : 'Record email follow-up'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void recordEnquiryFollowUp(record, 'phone'); }}
                    disabled={!canRecordFollowUp || !!enquiryFollowUpSavingChannel}
                    style={{
                      border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.28)' : 'rgba(255,140,0,0.24)'}`,
                      background: enquiryFollowUpSavingChannel === 'phone' ? colours.orange : (isDarkMode ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.08)'),
                      color: enquiryFollowUpSavingChannel === 'phone' ? colours.dark.text : text,
                      padding: '12px 14px',
                      cursor: !canRecordFollowUp || enquiryFollowUpSavingChannel ? 'default' : 'pointer',
                      opacity: !canRecordFollowUp ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <FiPhoneCall size={14} />
                    {enquiryFollowUpSavingChannel === 'phone' ? 'Recording call…' : 'Record phone follow-up'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()}

        {/* ── CCL Pipeline Detail Modal ── */}
        {cclPipelineDetailModal && (() => {
          const { matterId, kind } = cclPipelineDetailModal;
          const matter = displayMatters.find((item) => item.matterId === matterId);
          const ccl = cclMap[matterId];
          const compileResult = cclCompileByMatter[matterId];
          const compileSummary = compileResult?.summary || ccl?.compileSummary || null;
          const pressureResult = cclPressureTestByMatter[matterId];
          const flaggedFieldEntries = pressureResult
            ? Object.entries(pressureResult.fieldScores || {})
                .filter(([, value]) => !!value?.flag)
                .sort((left, right) => (right[1]?.score || 0) - (left[1]?.score || 0))
            : [];
          const modalTitle = kind === 'compile' ? 'Compilation Results' : 'Pressure Test Results';
          const modalAccent = kind === 'compile'
            ? (isDarkMode ? colours.accent : colours.highlight)
            : ((pressureResult?.flaggedCount || 0) > 0 ? colours.orange : colours.green);

          return createPortal(
            <div
              onClick={closeCclPipelineDetailModal}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 28000,
                background: 'rgba(0, 3, 25, 0.68)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                boxSizing: 'border-box',
                fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: 'min(760px, 100%)',
                  maxHeight: 'min(82vh, 920px)',
                  overflow: 'auto',
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.98)' : colours.grey,
                  border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.14)' : 'rgba(54,144,206,0.14)'}`,
                  boxShadow: 'var(--shadow-overlay-lg)',
                  padding: '18px 20px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: modalAccent, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: modalAccent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {modalTitle}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? '#f3f4f6' : '#061733', lineHeight: 1.2 }}>
                      {matter?.displayNumber || 'Matter'}
                      <span style={{ color: isDarkMode ? colours.subtleGrey : '#374151', fontWeight: 500 }}> · {matter?.clientName || ccl?.clientName || 'Client'}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, lineHeight: 1.45 }}>
                      {kind === 'compile'
                        ? 'Source readiness, context coverage, and missing evidence used before generation.'
                        : 'Field-by-field verification of the generated draft against source evidence.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeCclPipelineDetailModal}
                    style={{ border: 'none', background: 'transparent', color: isDarkMode ? colours.subtleGrey : colours.greyText, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
                    aria-label="Close pipeline detail modal"
                  >
                    ×
                  </button>
                </div>

                {kind === 'compile' ? (
                  compileSummary ? (
                    <div style={{ display: 'grid', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                        {[
                          { label: 'Ready', value: compileSummary.readyCount || 0, tone: colours.green },
                          { label: 'Limited', value: compileSummary.limitedCount || 0, tone: colours.orange },
                          { label: 'Missing', value: compileSummary.missingCount || 0, tone: colours.cta },
                          { label: 'Snippets', value: compileSummary.snippetCount || 0, tone: isDarkMode ? colours.accent : colours.highlight },
                        ].map((item) => (
                          <div key={item.label} style={{ padding: '10px 12px', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.10)'}`, background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.025)' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{item.label}</div>
                            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: item.tone }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '10px 12px', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.12)'}`, background: isDarkMode ? 'rgba(135,243,243,0.05)' : 'rgba(54,144,206,0.04)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: modalAccent }}>
                          {compileSummary.readyCount || 0}/{compileSummary.sourceCount || 0} evidence sources ready
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                          {(compileSummary.missingFlagsCount || 0)} missing-data flags, {compileSummary.contextFieldCount || 0} context fields, {compileSummary.snippetCount || 0} evidence snippets.
                          {compileResult?.createdAt ? ` Compiled ${new Date(compileResult.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}
                        </div>
                      </div>
                      {compileResult?.sourceCoverage?.length ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evidence Coverage</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {compileResult.sourceCoverage.map((source) => {
                              const sourceTone = source.status === 'ready' ? colours.green : source.status === 'limited' ? colours.orange : colours.cta;
                              return (
                                <div key={source.key} style={{ padding: '10px 12px', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.10)'}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.02)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#f3f4f6' : '#061733' }}>{source.label}</div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: sourceTone, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{source.status}</span>
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{source.summary}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, lineHeight: 1.5, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          Detailed source-by-source coverage is only available for compile runs completed in this session.
                        </div>
                      )}
                      {!!compileResult?.missingDataFlags?.length && (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Missing Data Flags</div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {compileResult.missingDataFlags.map((flag) => (
                              <div key={flag.key} style={{ padding: '8px 10px', border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.18)' : 'rgba(214,85,65,0.16)'}`, background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: colours.cta }}>{flag.label}</div>
                                {flag.detail ? <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.45, color: isDarkMode ? '#d1d5db' : '#374151' }}>{flag.detail}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, lineHeight: 1.6, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      No compile result is cached for this matter yet.
                    </div>
                  )
                ) : cclPressureTestRunning === matterId ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ padding: '12px 14px', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.14)' : 'rgba(54,144,206,0.16)'}`, background: isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: modalAccent }}>Safety Net running</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#374151' }}>{(cclPressureTestElapsed / 1000).toFixed(1)}s</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                        Verifying generated fields against source evidence.
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {cclPressureTestSteps.map((step) => {
                        const tone = step.status === 'done'
                          ? colours.green
                          : step.status === 'active'
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : step.status === 'error'
                              ? colours.cta
                              : (isDarkMode ? colours.subtleGrey : colours.greyText);
                        return (
                          <div key={step.label} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '8px 10px', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.02)' }}>
                            <div style={{ width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: tone, marginTop: 1 }}>
                              {step.status === 'active' ? <FiRefreshCw size={12} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> : step.status === 'done' ? <FiCheckCircle size={12} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, display: 'inline-block' }} />}
                            </div>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 600, color: step.status === 'pending' ? (isDarkMode ? colours.subtleGrey : colours.greyText) : (isDarkMode ? '#f3f4f6' : '#061733') }}>{step.label}</div>
                              {step.detail && (step.status === 'active' || step.status === 'done') && (
                                <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 2, lineHeight: 1.4 }}>{step.detail}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Dev context: fields being tested */}
                    {cclPressureTestContext && cclPressureTestContext.fieldKeys.length > 0 && (
                      <div style={{ padding: '10px 12px', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.10)'}`, background: isDarkMode ? 'rgba(135,243,243,0.03)' : 'rgba(54,144,206,0.03)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 6 }}>
                          Fields under test ({cclPressureTestContext.fieldKeys.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {cclPressureTestContext.fieldKeys.map((key) => (
                            <span key={key} style={{
                              fontSize: 8.5, fontWeight: 600, padding: '2px 6px',
                              background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)',
                              color: isDarkMode ? colours.accent : colours.highlight,
                              textTransform: 'capitalize',
                            }}>
                              {key.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : cclPressureTestError ? (
                  <div style={{ padding: '12px 14px', border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.18)' : 'rgba(214,85,65,0.16)'}`, background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colours.cta }}>Safety Net unavailable</div>
                    <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      {cclPressureTestError}
                    </div>
                  </div>
                ) : pressureResult ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    {/* Single-line status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 12px', border: `1px solid ${pressureResult.flaggedCount > 0 ? colours.orange : colours.green}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.025)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pressureResult.flaggedCount > 0 ? colours.orange : colours.green }}>
                        {pressureResult.flaggedCount > 0 ? `${pressureResult.flaggedCount} of ${pressureResult.totalFields} fields flagged` : `All ${pressureResult.totalFields} fields passed`}
                      </span>
                      <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>·</span>
                      <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        {pressureResult.dataSources?.join(', ') || 'source evidence'}
                      </span>
                      <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>·</span>
                      <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        {Math.round((pressureResult.durationMs || 0) / 100) / 10}s
                      </span>
                    </div>
                    {flaggedFieldEntries.length > 0 && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flagged Fields</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {flaggedFieldEntries.map(([fieldKey, score]) => (
                            <div key={fieldKey} style={{ padding: '8px 10px', border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.22)' : 'rgba(255,140,0,0.18)'}`, background: isDarkMode ? 'rgba(255,140,0,0.08)' : 'rgba(255,140,0,0.05)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: colours.orange, textTransform: 'capitalize' }}>{fieldKey.replace(/_/g, ' ')}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: colours.orange }}>Score {score.score}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      closeCclPipelineDetailModal();
                                      setCclReviewSummaryDismissedByMatter((prev) => ({ ...prev, [matterId]: true }));
                                      setCclForcedIntroByMatter((prev) => ({ ...prev, [matterId]: false }));
                                      setCclSelectedReviewFieldByMatter((prev) => ({ ...prev, [matterId]: fieldKey }));
                                      openCclLetterModal(matterId, { forceIntro: false });
                                    }}
                                    style={{ border: 'none', background: 'rgba(255,140,0,0.14)', color: colours.orange, fontSize: 9, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}
                                  >
                                    Go to field
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.45, color: isDarkMode ? '#d1d5db' : '#374151' }}>{score.reason}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {flaggedFieldEntries.length === 0 && (
                      <div style={{ fontSize: 10.5, lineHeight: 1.55, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                        No fields were flagged against the available evidence. All scores were above the threshold.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    <FiRefreshCw size={11} style={{ animation: 'opsDashSpin 1s linear infinite', opacity: 0.5 }} />
                    Preparing verification…
                  </div>
                )}
              </div>
            </div>,
            document.body,
          );
        })()}

      {/* ── CCL Fields Modal ── */}
      {cclFieldsModal && (() => {
        const cached = cclDraftCache[cclFieldsModal];
        const draft = cached?.fields;
        const ccl = cclMap[cclFieldsModal];
        const matter = displayMatters.find(m => m.matterId === cclFieldsModal);
        if (!draft) return null;

        const rawDraft = draft as Record<string, unknown>;
        const readTextValue = (value: unknown): string => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'string') return value.trim();
          if (typeof value === 'number' || typeof value === 'boolean') return String(value);
          return '';
        };
        const normalizedDraft: Record<string, string> = Object.keys(rawDraft).reduce((acc, key) => {
          const text = readTextValue(rawDraft[key]);
          if (text) acc[key] = text;
          return acc;
        }, {} as Record<string, string>);
        const applyFallback = (key: string, fallback: unknown) => {
          const fallbackText = readTextValue(fallback);
          if (!normalizedDraft[key] && fallbackText) normalizedDraft[key] = fallbackText;
        };
        applyFallback('insert_clients_name', matter?.clientName);
        applyFallback('insert_heading_eg_matter_description', ccl?.matterDescription || matter?.practiceArea);
        applyCclContactFallbacks(cclFieldsModal, normalizedDraft, matter, ccl);
        applyFallback('matter', matter?.displayNumber);
        applyFallback('matter_number', matter?.displayNumber);
        applyFallback('display_number', matter?.displayNumber);
        applyFallback('figure', normalizedDraft.state_amount);
        applyFallback('state_amount', normalizedDraft.figure);
        applyFallback('may_will', 'may');

        const fieldSections: { title: string; fields: { key: string; label: string }[] }[] = [
          { title: 'Client Details', fields: [
            { key: 'insert_clients_name', label: 'Client Name' },
            { key: 'client_email', label: 'Email' },
            { key: 'insert_heading_eg_matter_description', label: 'Matter Heading' },
          ]},
          { title: 'Handler', fields: [
            { key: 'name_of_person_handling_matter', label: 'Handler' },
            { key: 'status', label: 'Role / Status' },
            { key: 'name', label: 'Supervisor' },
          ]},
          { title: 'Scope & Next Steps', fields: [
            { key: 'insert_current_position_and_scope_of_retainer', label: 'Scope of Retainer' },
            { key: 'next_steps', label: 'Next Steps' },
            { key: 'realistic_timescale', label: 'Timescale' },
          ]},
          { title: 'Costs', fields: [
            { key: 'handler_hourly_rate', label: 'Hourly Rate (£)' },
            { key: 'charges_estimate_paragraph', label: 'Costs Estimate' },
            { key: 'figure', label: 'Payment on Account (£)' },
            { key: 'disbursements_paragraph', label: 'Disbursements' },
          ]},
        ];

        const populatedFieldCount = Object.keys(normalizedDraft).length;
        const sectionFieldKeys = new Set(fieldSections.flatMap((section) => section.fields.map((field) => field.key)));
        const otherPopulatedFields = Object.keys(normalizedDraft)
          .filter((key) => !sectionFieldKeys.has(key))
          .sort();
        const structuredFieldCount = Object.keys(rawDraft)
          .filter((key) => rawDraft[key] !== null && rawDraft[key] !== undefined)
          .filter((key) => typeof rawDraft[key] === 'object')
          .length;

        const genOptions: GenerationOptions = {
          costsChoice: (normalizedDraft.costs_section_choice as 'no_costs' | 'risk_costs') || 'risk_costs',
          chargesChoice: (normalizedDraft.charges_section_choice as 'hourly_rate' | 'no_estimate') || 'hourly_rate',
          disbursementsChoice: (normalizedDraft.disbursements_section_choice as 'table' | 'estimate') || 'estimate',
          showEstimateExamples: false,
        };
        const rawGeneratedContent = generateTemplateContent(DEFAULT_CCL_TEMPLATE, normalizedDraft, genOptions);
        const unresolvedFields = Array.from(new Set(
          [...rawGeneratedContent.matchAll(/\{\{([^}]+)\}\}/g)]
            .map((match) => String(match[1] || '').trim())
            .filter(Boolean)
        )).sort();

        const unresolvedWithReason = unresolvedFields.map((key) => {
          const rawValue = rawDraft[key];
          const value = normalizedDraft[key];
          const reason = rawValue !== null && rawValue !== undefined && typeof rawValue === 'object'
            ? 'Field contains structured data object; map a text value for this template token.'
            : value === undefined
            ? 'No value captured in draft data for this template field.'
            : String(value).trim().length === 0
              ? 'Field exists but value is blank.'
              : 'Template token is still unresolved (check token-to-field mapping).';
          return { key, reason };
        });

        const prettifyFieldKey = (key: string) => key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());

        // AI review data (optional — only set when AI has been run this session)
        const aiData = cclFieldsModal ? cclAiResultByMatter[cclFieldsModal] : undefined;
        const aiFields = aiData?.response?.fields || {};
        const aiBaseFields = aiData?.baseFields || {};
        const hasAiData = !!aiData;
        const isStreamingNow = !!(cclFieldsModal && cclAiFillingMatter === cclFieldsModal);
        const reviewedSet = cclFieldsModal ? (cclAiReviewedFields[cclFieldsModal] || new Set<string>()) : new Set<string>();
        const allFieldKeys = new Set([...Object.keys(normalizedDraft), ...Object.keys(aiFields)]);
        const aiFieldKeys = Object.keys(aiFields);
        const reviewedCount = aiFieldKeys.filter(k => reviewedSet.has(k)).length;
        const totalAiFields = aiFieldKeys.length;
        const allReviewed = totalAiFields > 0 && reviewedCount === totalAiFields;
        const progressPct = totalAiFields > 0 ? Math.round((reviewedCount / totalAiFields) * 100) : 0;

        const toggleFieldReviewed = (key: string) => {
          if (!cclFieldsModal) return;
          toggleReviewedFieldForMatter(cclFieldsModal, key);
        };

        // Helper: render a single field value row with optional review checkbox
        const renderFieldRow = (key: string, label: string, val: string) => {
          const isAiFilled = !!aiFields[key];
          const isReviewed = reviewedSet.has(key);
          const priorValue = aiBaseFields[key] || '';
          const isNewFromAi = isAiFilled && !priorValue.trim();
          const isUpdatedByAi = isAiFilled && priorValue.trim() && aiFields[key] !== priorValue;
          const checkboxBorder = isDarkMode ? colours.dark.borderColor : colours.subtleGrey;
          const shouldAnimate = isAiFilled && isStreamingNow;

          return (
            <div
              key={key}
              style={{
                marginBottom: 4,
                display: 'flex', gap: hasAiData && isAiFilled ? 8 : 0, alignItems: 'flex-start',
                padding: hasAiData && isAiFilled ? '5px 6px 5px 4px' : '0',
                background: isReviewed ? (isDarkMode ? 'rgba(32,178,108,0.04)' : 'rgba(32,178,108,0.02)') : 'transparent',
                border: hasAiData && isAiFilled ? `1px solid ${isReviewed ? `${colours.green}18` : 'transparent'}` : 'none',
                cursor: hasAiData && isAiFilled ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
                opacity: isReviewed ? 0.65 : 1,
                animation: shouldAnimate ? 'opsDashFieldAppear 0.25s ease both' : 'none',
              }}
              onClick={hasAiData && isAiFilled ? () => toggleFieldReviewed(key) : undefined}
            >
              {/* Subtle checkbox — only for AI-filled fields */}
              {hasAiData && isAiFilled && (
                <div style={{
                  width: 13, height: 13, flexShrink: 0, marginTop: 2,
                  border: `1px solid ${isReviewed ? colours.green : checkboxBorder}`,
                  background: isReviewed ? colours.green : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  opacity: 0.7,
                }}>
                  {isReviewed && <span style={{ color: colours.dark.text, fontSize: 8, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                  <span style={{ fontSize: 8, fontWeight: 600, color: muted }}>{label}</span>
                  {isNewFromAi && (
                    <span style={{
                      fontSize: 7, fontWeight: 700, padding: '0px 4px', borderRadius: 999,
                      background: isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.06)',
                      color: isDarkMode ? colours.accent : colours.highlight,
                    }}>AI</span>
                  )}
                  {isUpdatedByAi && (
                    <span style={{
                      fontSize: 7, fontWeight: 700, padding: '0px 4px', borderRadius: 999,
                      background: isDarkMode ? 'rgba(255,213,79,0.10)' : 'rgba(255,140,0,0.06)',
                      color: isDarkMode ? colours.yellow : colours.orange,
                    }}>AI·UPDATED</span>
                  )}
                </div>
                <div style={{
                  fontSize: 10, color: text, lineHeight: 1.5,
                  padding: '4px 8px',
                  background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                }}>{val}</div>
                {isUpdatedByAi && (
                  <div style={{ marginTop: 2, fontSize: 8, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    <span>Was: </span><span style={{ textDecoration: 'line-through' }}>{priorValue}</span>
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div
            onClick={() => setCclFieldsModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0, 3, 25, 0.6)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'opsDashRowFade 0.15s ease both',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 460, maxHeight: '85vh', overflow: 'auto',
                background: isDarkMode ? colours.darkBlue : colours.grey,
                border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.15)'}`,
                padding: '18px 20px',
                boxShadow: 'var(--shadow-overlay)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (hasAiData || isStreamingNow) ? 8 : 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: text }}>CCL Inspector</div>
                  <div style={{ fontSize: 8, color: muted }}>{matter?.displayNumber} · v{ccl?.version || 1} · {populatedFieldCount} populated · {unresolvedWithReason.length} unresolved{structuredFieldCount > 0 ? ` · ${structuredFieldCount} structured` : ''}</div>
                </div>
                <div
                  style={{ fontSize: 10, color: muted, cursor: 'pointer', padding: '2px 6px' }}
                  onClick={() => setCclFieldsModal(null)}
                >✕</div>
              </div>

              {/* ── Live streaming feed ── */}
              {isStreamingNow && (() => {
                const statusText = (cclFieldsModal && cclAiStatusByMatter[cclFieldsModal]) || 'Streaming fields…';
                const streamColor = isDarkMode ? colours.accent : colours.highlight;
                const streamBg = isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(54,144,206,0.03)';
                const streamBorder = isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.06)';
                return (
                  <div style={{ marginBottom: 10 }}>
                    {/* Status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', marginBottom: cclAiStreamLog.length > 0 ? 6 : 0, background: streamBg, border: `1px solid ${streamBorder}` }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: streamColor, animation: `opsDashStreamDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 8, color: streamColor, fontWeight: 500 }}>{statusText}</span>
                      {cclAiStreamLog.length > 0 && (
                        <span style={{ fontSize: 8, color: muted, marginLeft: 'auto' }}>{cclAiStreamLog.length} fields</span>
                      )}
                    </div>

                    {/* Live field feed — shows each field as it arrives */}
                    {cclAiStreamLog.length > 0 && (
                      <div
                        ref={streamFeedRef}
                        style={{
                          maxHeight: 200, overflowY: 'auto', overflowX: 'hidden',
                          border: `1px solid ${streamBorder}`,
                          background: isDarkMode ? 'rgba(2,6,23,0.5)' : 'rgba(0,0,0,0.015)',
                          padding: '4px 0',
                          // CSS var for the glow colour
                          ['--stream-glow-color' as string]: streamColor,
                        }}
                      >
                        {cclAiStreamLog.map((entry, idx) => (
                          <div
                            key={`${entry.key}-${idx}`}
                            ref={idx === cclAiStreamLog.length - 1 ? (el) => { el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } : undefined}
                            style={{
                              display: 'flex', gap: 8, padding: '3px 8px 3px 6px',
                              borderLeft: '2px solid transparent',
                              animation: 'opsDashFieldGlow 1.5s ease both',
                            }}
                          >
                            <span style={{
                              fontSize: 8, fontWeight: 600, color: streamColor,
                              minWidth: 80, maxWidth: 100, flexShrink: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {prettifyFieldKey(entry.key)}
                            </span>
                            <span style={{
                              fontSize: 8, color: text, flex: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              opacity: 0.8,
                            }}>
                              {entry.value.length > 80 ? entry.value.slice(0, 77) + '…' : entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Subtle AI review progress — only when AI data exists, very understated */}
              {hasAiData && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: allReviewed ? colours.green : (isDarkMode ? colours.subtleGrey : colours.greyText), fontWeight: 500 }}>
                      {allReviewed ? '✓ All AI fields reviewed' : `${reviewedCount}/${totalAiFields} AI fields reviewed`}
                    </span>
                    <span style={{ fontSize: 8, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: 2, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${progressPct}%`,
                      background: allReviewed ? colours.green : (isDarkMode ? `${colours.accent}60` : `${colours.highlight}50`),
                      transition: 'width 0.25s ease, background 0.25s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Unresolved fields */}
              {unresolvedWithReason.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const, color: colours.cta, marginBottom: 6 }}>
                    Unresolved Fields
                  </div>
                  <div
                    style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                      padding: '4px 10px', cursor: cclAiFillingMatter === cclFieldsModal ? 'wait' : 'pointer',
                      color: isDarkMode ? colours.dark.cardBackground : colours.dark.text, background: colours.highlight,
                      borderRadius: 999, display: 'inline-block', marginBottom: 8,
                    }}
                    onClick={() => { if (cclFieldsModal) runHomeCclAiAutofill(cclFieldsModal); }}
                  >
                    {cclAiFillingMatter === cclFieldsModal ? 'Running AI Autofill…' : 'Run AI Autofill'}
                  </div>
                  {cclFieldsModal && cclAiStatusByMatter[cclFieldsModal] && (
                    <div style={{ fontSize: 8, color: muted, marginBottom: 8 }}>{cclAiStatusByMatter[cclFieldsModal]}</div>
                  )}
                  {unresolvedWithReason.map((item) => (
                    <div key={item.key} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 8, fontWeight: 600, color: text, marginBottom: 1 }}>{prettifyFieldKey(item.key)}</div>
                      <div style={{
                        fontSize: 9, color: isDarkMode ? colours.cta : colours.cta, lineHeight: 1.45,
                        padding: '4px 8px',
                        background: isDarkMode ? 'rgba(214,85,65,0.12)' : 'rgba(214,85,65,0.08)',
                        border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.28)' : 'rgba(214,85,65,0.22)'}`,
                      }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Field sections — now with inline review checkboxes on AI-filled fields */}
              {fieldSections.map(section => {
                const populated = section.fields.filter(f => normalizedDraft[f.key] && String(normalizedDraft[f.key]).trim());
                if (populated.length === 0) return null;
                return (
                  <div key={section.title} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const, color: isDarkMode ? colours.accent : colours.highlight, marginBottom: 6 }}>{section.title}</div>
                    {populated.map(f => renderFieldRow(f.key, f.label, String(normalizedDraft[f.key]).trim()))}
                  </div>
                );
              })}

              {/* Other populated fields not in curated sections */}
              {otherPopulatedFields.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const, color: isDarkMode ? colours.accent : colours.highlight, marginBottom: 6 }}>
                    Additional Fields
                  </div>
                  {otherPopulatedFields.map((key) => renderFieldRow(key, prettifyFieldKey(key), String(normalizedDraft[key]).trim()))}
                </div>
              )}

              {/* ── Collapsible AI Trace (subtle, diagnostic, not primary) ── */}
              {hasAiData && (() => {
                const aiRes = aiData.response;
                const aiReq = aiData.request;
                const sectionTitleColor = isDarkMode ? colours.accent : colours.highlight;
                const bodyColor = isDarkMode ? '#d1d5db' : '#374151';
                const helpColor = isDarkMode ? colours.subtleGrey : colours.greyText;
                const cardBg = isDarkMode ? 'rgba(2,6,23,0.5)' : 'rgba(0,0,0,0.015)';
                const fieldBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

                return (
                  <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                    <details>
                      <summary style={{
                        fontSize: 8, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                        color: helpColor, cursor: 'pointer', userSelect: 'none',
                        listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <span style={{ fontSize: 7, transition: 'transform 0.15s' }}>▶</span>
                        AI Trace
                        <span style={{ fontWeight: 400, textTransform: 'none' as const }}>
                          · {aiRes.confidence} · {aiRes.source}{aiRes.durationMs ? ` · ${Math.round(aiRes.durationMs / 100) / 10}s` : ''}
                        </span>
                      </summary>
                      <div style={{ paddingTop: 8 }}>
                        {/* Meta */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, fontSize: 9, color: helpColor }}>
                          {aiRes.model && <span>Model: {aiRes.model}</span>}
                          {aiRes.dataSources && aiRes.dataSources.length > 0 && <span>Data: {aiRes.dataSources.join(', ')}</span>}
                          {aiRes.debug?.generatedFieldCount != null && <span>Fields: {aiRes.debug.generatedFieldCount}</span>}
                        </div>

                        {/* Inputs */}
                        <details style={{ marginBottom: 8 }}>
                          <summary style={{ fontSize: 8, fontWeight: 600, color: helpColor, cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 7 }}>▶</span> Inputs
                          </summary>
                          <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                            {([
                              ['Matter ID', aiReq.matterId], ['Instruction Ref', aiReq.instructionRef], ['Practice Area', aiReq.practiceArea],
                              ['Client Name', aiReq.clientName], ['Description', aiReq.description], ['Handler', aiReq.handlerName],
                              ['Role', aiReq.handlerRole], ['Rate', aiReq.handlerRate],
                            ] as [string, string | undefined][]).filter(([, v]) => v && v.trim()).map(([label, value]) => (
                              <div key={label} style={{ display: 'flex', gap: 6, marginBottom: 2, fontSize: 9 }}>
                                <span style={{ color: helpColor, minWidth: 75, flexShrink: 0, fontWeight: 600 }}>{label}</span>
                                <span style={{ color: bodyColor }}>{value}</span>
                              </div>
                            ))}
                          </div>
                        </details>

                        {/* Prompts */}
                        {(aiRes.userPrompt || aiRes.systemPrompt) && (
                          <details style={{ marginBottom: 8 }}>
                            <summary style={{ fontSize: 8, fontWeight: 600, color: helpColor, cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 7 }}>▶</span> Prompts
                            </summary>
                            <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                              {aiRes.systemPrompt && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontSize: 7, fontWeight: 700, color: helpColor, textTransform: 'uppercase' as const, marginBottom: 2 }}>System</div>
                                  <div style={{ fontSize: 9, color: bodyColor, lineHeight: 1.4, padding: '4px 8px', whiteSpace: 'pre-wrap', background: cardBg, border: `1px solid ${fieldBorder}`, maxHeight: 120, overflow: 'auto' }}>{aiRes.systemPrompt}</div>
                                </div>
                              )}
                              {aiRes.userPrompt && (
                                <div>
                                  <div style={{ fontSize: 7, fontWeight: 700, color: helpColor, textTransform: 'uppercase' as const, marginBottom: 2 }}>User</div>
                                  <div style={{ fontSize: 9, color: bodyColor, lineHeight: 1.4, padding: '4px 8px', whiteSpace: 'pre-wrap', background: cardBg, border: `1px solid ${fieldBorder}`, maxHeight: 150, overflow: 'auto' }}>{aiRes.userPrompt}</div>
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {/* Context sources */}
                        {aiRes.debug?.context && (
                          <details style={{ marginBottom: 4 }}>
                            <summary style={{ fontSize: 8, fontWeight: 600, color: helpColor, cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 7 }}>▶</span> Context ({aiRes.debug.context.sourceCount || 0} sources)
                            </summary>
                            <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                              {aiRes.debug.context.sources && aiRes.debug.context.sources.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                  {aiRes.debug.context.sources.map((src: string) => (
                                    <span key={src} style={{ fontSize: 8, padding: '1px 6px', background: isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.04)', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.08)'}`, color: sectionTitleColor, fontWeight: 500 }}>{src}</span>
                                  ))}
                                </div>
                              )}
                              {aiRes.debug.context.contextFields && Object.keys(aiRes.debug.context.contextFields).length > 0 && (
                                <div>
                                  {Object.entries(aiRes.debug.context.contextFields).map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2, fontSize: 8 }}>
                                      <span style={{ color: helpColor, minWidth: 90, flexShrink: 0, fontWeight: 600 }}>{prettifyFieldKey(k)}</span>
                                      <span style={{ color: bodyColor }}>{String(v || '—')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    </details>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── CCL Letter Preview Modal ── */}
      {cclLetterModal && (() => { try {
        let cached = cclDraftCache[cclLetterModal];
        const ccl = cclMap[cclLetterModal];
        const cclStage = getCanonicalCclStage(ccl?.stage || ccl?.status);
        const isCompileStageRender = cclCompileOnlyLaunchRef.current.has(cclLetterModal) || isCompileOnlyCclStatus(ccl);

        const draft = cached?.fields;
        const docUrl = cached?.docUrl;
        const matter = displayMatters.find(m => m.matterId === cclLetterModal);
        const launchPersistedTrace = cclAiTraceByMatter[cclLetterModal];
        const launchTraceLoading = !!cclAiTraceLoadingByMatter[cclLetterModal];
        const launchHasAiData = !!(cclAiResultByMatter[cclLetterModal] || launchPersistedTrace);
        const launchIsStreamingNow = cclAiFillingMatter === cclLetterModal;
        const launchAiStatusMessage = cclAiStatusByMatter[cclLetterModal] || '';
        const launchPressureReady = !!cclPressureTestByMatter[cclLetterModal];
        const launchPressureRunning = cclPressureTestRunning === cclLetterModal;
        const launchPressureErrored = !!cclPressureTestError && !launchPressureRunning && launchHasAiData && !launchPressureReady;
        const reviewRailPrimed = !!cclReviewRailPrimedByMatter[cclLetterModal];
        const launchHandoffActive = cclLaunchHandoffMatter === cclLetterModal;
        const launchHeldLocally = isLocalDev && cclLaunchDevHold;
        const launchDraftLoading = cclDraftLoading === cclLetterModal;
        const launchReadyForHandoff = !!draft
          && !launchDraftLoading
          && !launchTraceLoading
          && !launchIsStreamingNow
          && !launchPressureRunning
          && launchHasAiData
          && (launchPressureReady || launchPressureErrored)
          && !launchHeldLocally;
        const launchSteps = buildCclReviewLaunchSteps({
          hasDraft: !!draft,
          draftLoading: launchDraftLoading,
          hasAiContext: launchHasAiData,
          traceLoading: launchTraceLoading,
          aiRunning: launchIsStreamingNow,
          aiStatusMessage: launchAiStatusMessage,
          pressureReady: launchPressureReady,
          pressureRunning: launchPressureRunning,
          pressureErrored: launchPressureErrored,
          handoffActive: launchHandoffActive,
        });
        console.log('[CCL modal render]', { matterId: cclLetterModal, hasCached: cached !== undefined, hasDraft: !!draft, loading: cclDraftLoading, isCompileStage: isCompileStageRender });
        const isDraftLoading = cclDraftLoading === cclLetterModal;
        const openedAt = cclLetterModalOpenedAtRef.current;
        const elapsed = Date.now() - openedAt;
        const isDraftLoadStale = !draft && isDraftLoading && elapsed > 6000;
        const draftFetchError = isCompileStageRender ? null : (cached?.fetchError && !isDraftLoading ? cached.fetchError : null);
        const launchDraftError = draftFetchError
          ? `Draft fetch failed \u2014 ${draftFetchError}. Close and re-open to retry.`
          : !draft && !isDraftLoading && !isDraftLoadStale && !isCompileStageRender
            ? 'No saved draft was found for this matter yet. Create the draft first, then return to review it here.'
            : null;
        const retryDraftFetch = (isDraftLoadStale || draftFetchError) ? (() => {
          console.log('[CCL modal] manual retry for', cclLetterModal);
          setCclDraftLoading(cclLetterModal);
          cclLetterModalOpenedAtRef.current = Date.now();
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 20000);
          fetch(buildCclApiUrl(`/api/ccl/${encodeURIComponent(cclLetterModal!)}`), { signal: controller.signal, credentials: 'include' })
            .then(res => res.ok ? res.json() : Promise.reject(new Error(`${res.status}`)))
            .then(data => {
              const fields = data?.json && typeof data.json === 'object' ? data.json : {};
              setCclDraftCache(prev => ({ ...prev, [cclLetterModal!]: { fields, docUrl: data?.url || undefined, loadInfo: data?.loadInfo || prev[cclLetterModal!]?.loadInfo } }));
              // Hydrate persisted pressure-test result so the PT ceremony doesn't replay
              if (data?.pressureTest?.fieldScores) {
                setCclPressureTestByMatter(prev => ({ ...prev, [cclLetterModal!]: data.pressureTest }));
              }
            })
            .catch((err) => {
              setCclDraftCache(prev => ({ ...prev, [cclLetterModal!]: { fields: null, fetchError: err?.message || 'Network error', loadInfo: prev[cclLetterModal!]?.loadInfo } }));
            })
            .finally(() => {
              window.clearTimeout(timeoutId);
              setCclDraftLoading(prev => prev === cclLetterModal ? null : prev);
            });
        }) : undefined;

        const rawDraft = (draft || {}) as Record<string, unknown>;
        const readTextValue = (value: unknown): string => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'string') return value.trim();
          if (typeof value === 'number' || typeof value === 'boolean') return String(value);
          return '';
        };
        const normalizedDraft = Object.keys(rawDraft).reduce((acc, key) => {
          const text = readTextValue(rawDraft[key]);
          if (text) acc[key] = text;
          return acc;
        }, {} as Record<string, string>);
        const setFallback = (key: string, fallback: string | undefined) => {
          if ((!normalizedDraft[key] || !String(normalizedDraft[key]).trim()) && fallback && String(fallback).trim()) {
            normalizedDraft[key] = String(fallback).trim();
          }
        };
        setFallback('insert_clients_name', matter?.clientName);
        setFallback('insert_heading_eg_matter_description', ccl?.matterDescription || matter?.practiceArea);
        setFallback('figure', normalizedDraft.state_amount);
        setFallback('state_amount', normalizedDraft.figure);

        const statusLabel = getCanonicalCclLabel(ccl?.stage || ccl?.status, ccl?.label);
        const statusColor = cclStage === 'sent' ? colours.green
          : cclStage === 'reviewed' || cclStage === 'pressure-tested' || cclStage === 'generated' || cclStage === 'compiled' ? (isDarkMode ? colours.accent : colours.highlight)
          : colours.orange;
        const parseTraceJson = (value: unknown, fallback: any) => {
          if (value == null || value === '') return fallback;
          if (typeof value !== 'string') return value;
          try {
            return JSON.parse(value);
          } catch {
            return fallback;
          }
        };
        const aiData = cclAiResultByMatter[cclLetterModal];
        const persistedTrace = cclAiTraceByMatter[cclLetterModal];
        const traceLoading = !!cclAiTraceLoadingByMatter[cclLetterModal];
        const persistedOutput = parseTraceJson(persistedTrace?.AiOutputJson, {});
        const persistedFields = persistedOutput?.fields && typeof persistedOutput.fields === 'object'
          ? persistedOutput.fields
          : (persistedOutput && typeof persistedOutput === 'object' ? persistedOutput : {});
        const persistedContextFields = parseTraceJson(persistedTrace?.ContextFieldsJson, {});
        const persistedSources = parseTraceJson(persistedTrace?.DataSourcesJson, []);
        const activeContactContext = applyCclContactFallbacks(cclLetterModal, normalizedDraft, matter, ccl, persistedContextFields);
        const aiReq = aiData?.request || (persistedTrace ? {
          matterId: cclLetterModal,
          instructionRef: matter?.instructionRef || '',
          practiceArea: matter?.practiceArea || ccl?.practiceArea || persistedContextFields?.practiceArea,
          description: ccl?.matterDescription || normalizedDraft.insert_heading_eg_matter_description || persistedContextFields?.typeOfWork,
          clientName: matter?.clientName || normalizedDraft.insert_clients_name || persistedContextFields?.clientName,
          handlerName: normalizedDraft.name_of_person_handling_matter || activeContactContext.activeProfile.fullName || persistedContextFields?.handlerName,
          handlerRole: normalizedDraft.status || activeContactContext.activeProfile.role || persistedContextFields?.handlerRole,
          handlerRate: normalizedDraft.handler_hourly_rate || activeContactContext.activeProfile.rate || persistedContextFields?.handlerRate,
        } : undefined);
        const aiRes = aiData?.response || (persistedTrace ? {
          fields: persistedFields,
          dataSources: Array.isArray(persistedSources) ? persistedSources : [],
          systemPrompt: persistedTrace.SystemPrompt,
          userPrompt: persistedTrace.UserPrompt,
          confidence: persistedTrace.Confidence,
          model: persistedTrace.Model,
          source: 'saved trace',
          durationMs: persistedTrace.DurationMs,
          debug: {
            generatedFieldCount: persistedTrace.GeneratedFieldCount,
            context: {
              sources: Array.isArray(persistedSources) ? persistedSources : [],
              sourceCount: Array.isArray(persistedSources) ? persistedSources.length : 0,
              contextFields: persistedContextFields && typeof persistedContextFields === 'object' ? persistedContextFields : {},
            },
          },
        } : undefined);
        const hasAiData = !!aiRes;
        const isStreamingNow = cclAiFillingMatter === cclLetterModal;
        const aiStatusMessage = cclAiStatusByMatter[cclLetterModal] || '';
        const aiState = isStreamingNow
          ? {
              tone: 'info' as const,
              title: 'Generating draft review',
              detail: aiStatusMessage || 'Analysing matter context and generating field values.',
            }
          : hasAiData && aiData
            ? {
                tone: 'success' as const,
                title: 'Review ready',
                detail: 'Start from the review summary. The full first page stays visible until you choose to begin.',
              }
            : persistedTrace
              ? {
                  tone: 'success' as const,
                  title: 'Review ready',
                  detail: 'Start from the review summary. This panel is using the latest saved AI run.',
                }
              : traceLoading
                ? {
                    tone: 'muted' as const,
                    title: 'Loading saved review',
                    detail: 'Retrieving the latest AI run for this draft.',
                  }
                : {
                    tone: 'warning' as const,
                    title: 'No guided review yet',
                    detail: 'Generate review context to get guided steps here, or select a field from the draft to edit it directly.',
                  };
        const reviewedSet = cclAiReviewedFields[cclLetterModal] || new Set<string>();
        const aiFields = aiRes?.fields || {};
        const aiFieldKeys = Object.keys(aiFields);
        const reviewedCount = aiFieldKeys.filter((key) => reviewedSet.has(key)).length;
        const totalAiFields = aiFieldKeys.length;
        const allReviewed = totalAiFields > 0 && reviewedCount === totalAiFields;
        const progressPct = totalAiFields > 0 ? Math.round((reviewedCount / totalAiFields) * 100) : 0;
        const showReviewLaunchOverlay = launchHandoffActive || (!reviewRailPrimed && (
          launchHeldLocally
          ||
          launchReadyForHandoff
          ||
          launchTraceLoading
          || launchIsStreamingNow
          || launchPressureRunning
        ));
        const showSetupInDefaultView = !draft || showReviewLaunchOverlay;
        const launchHeadline = isDraftLoadStale ? 'Taking longer than expected' : 'Opening CCL review';
        const launchBody = isDraftLoadStale
          ? 'The draft service may be warming up. Retry the fetch or close the review for now.'
          : launchHeldLocally
            ? 'Everything is ready. Press Space when you want to continue.'
            : launchPressureErrored
              ? 'The draft is ready. Final checks were skipped, so review will open without them.'
              : launchHandoffActive
                ? 'Opening the review workspace.'
                : launchPressureRunning
                  ? 'Running final checks.'
                  : launchIsStreamingNow
                    ? (/compil/i.test(launchAiStatusMessage) ? 'Pulling matter context.' : 'Writing review fields.')
                    : launchTraceLoading
                      ? 'Checking for saved review data.'
                      : !launchHasAiData
                        ? (draft && Object.keys(draft).length === 0 && !isDraftLoading
                          ? 'Starting review generation.'
                          : 'Loading draft and review data.')
                        : 'Finalising review setup.';
        const prettifyFieldKey = (key: string) => key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());

        const templateLines = DEFAULT_CCL_TEMPLATE.split('\n');
        const templateContextFor = (key: string) => {
          const token = `{{${key}}}`;
          const hits = templateLines.filter((line) => line.includes(token)).map((line) => line.trim()).filter(Boolean);
          return hits.length > 0 ? hits.join('\n') : token;
        };

        const toggleFieldReviewed = (key: string) => {
          toggleReviewedFieldForMatter(cclLetterModal, key);
        };

        // Confidence tiers:
        //   'data'      — hard data exists (Deal.Amount, team record, Clio field). High confidence.
        //   'inferred'  — AI derived from notes, call transcripts, pitch email. Medium confidence — check.
        //   'templated' — standard per practice area / static constant. Review once, trust thereafter.
        //   'unknown'   — no data source; requires fee earner judgement. Must be manually confirmed.
        const fieldMeta: Record<string, { label: string; group: string; anchor: string; prompt: string; confidence: 'data' | 'inferred' | 'templated' | 'unknown' }> = {
          insert_clients_name: { label: 'Client Name', group: 'Intro', anchor: 'intro', confidence: 'data', prompt: 'Source: Matter record client name. Should match exactly.' },
          insert_heading_eg_matter_description: { label: 'Matter Heading', group: 'Intro', anchor: 'intro', confidence: 'data', prompt: 'Source: Matter description or practice area from Clio. The RE: line the client sees.' },
          name_of_person_handling_matter: { label: 'Responsible Solicitor', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. The fee earner assigned to this matter.' },
          status: { label: 'Role', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Job title exactly as it should appear.' },
          name: { label: 'Supervising Partner', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Person with overall supervisory responsibility.' },
          fee_earner_email: { label: 'Fee Earner Email', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Direct email for the fee earner.' },
          fee_earner_phone: { label: 'Fee Earner Phone', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Direct or office phone number.' },
          fee_earner_postal_address: { label: 'Fee Earner Postal Address', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Office address constant. Helix Law Brighton office.' },
          names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: { label: 'Team Contact Details', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Colleagues who can assist when fee earner unavailable.' },
          insert_current_position_and_scope_of_retainer: { label: 'Scope of Retainer', group: 'Section 2 · Scope of services', anchor: '2', confidence: 'inferred', prompt: 'Source: Pitch email, deal description, initial call notes. AI writes 2-4 sentences describing what the client instructed Helix to do. CHECK: does this match what was actually discussed?' },
          next_steps: { label: 'Next Steps', group: 'Section 3 · Next steps', anchor: '3', confidence: 'inferred', prompt: 'Source: Call notes, pitch email. AI infers 2-3 next actions. CHECK: are these the actual agreed next steps, or generic practice-area boilerplate?' },
          realistic_timescale: { label: 'Realistic Timescale', group: 'Section 3 · Next steps', anchor: '3', confidence: 'unknown', prompt: 'No data source — timescale is not captured in any database. AI guesses from practice area norms. MUST be confirmed by fee earner.' },
          handler_hourly_rate: { label: 'Hourly Rate (£)', group: 'Section 4.1 · Our charges', anchor: '4.1', confidence: 'data', prompt: 'Source: Team data rate table. Number only.' },
          charges_estimate_paragraph: { label: 'Costs Estimate', group: 'Section 4.1 · Our charges', anchor: '4.1', confidence: 'inferred', prompt: 'Source: Deal.Amount + Pitch email. If a deal amount exists, the estimate should be built around it. CHECK: does the £ figure match what the client was told?' },
          disbursements_paragraph: { label: 'Disbursements', group: 'Section 4.2 · Disbursements', anchor: '4.2', confidence: 'templated', prompt: 'Standard per practice area. Property: Land Registry + search fees + SDLT. Employment: minimal. Construction: may include surveyor fees. CHECK: does this matter have unusual disbursements?' },
          costs_other_party_paragraph: { label: 'Other Side Costs', group: 'Section 4.3 · Other side costs', anchor: '4.3', confidence: 'inferred', prompt: 'Derived from: is there an opponent? Is this litigation? If no opponent → "We do not expect you will have to pay another party\'s costs." CHECK: correct for this matter.' },
          figure: { label: 'Payment on Account (£)', group: 'Section 6 · Payment on account', anchor: '6', confidence: 'data', prompt: 'Source: Deal.Amount (the agreed fee captured at deal stage). Number only, no £ sign. If Deal.Amount exists, this should equal it. If only PitchContent.Amount exists, use that. If NEITHER exists → unknown, must be set by fee earner.' },
          and_or_intervals_eg_every_three_months: { label: 'Costs Update Interval', group: 'Section 7 · Costs updates', anchor: '7', confidence: 'templated', prompt: 'Almost always " monthly" for Helix. Property conveyancing may use " on completion". Starts with a space.' },
          contact_details_for_marketing_opt_out: { label: 'Marketing Opt-out Contact', group: 'Section 11 · Marketing', anchor: '11', confidence: 'templated', prompt: 'Static: standard opt-out contact for Helix Law. Should not vary per matter.' },
          eid_paragraph: { label: 'EID Verification', group: 'Section 12 · AML / EID', anchor: '12', confidence: 'templated', prompt: 'Standard AML/EID wording. May vary by client type (individual vs company). CHECK: is the client type correct?' },
          may_will: { label: 'Court Proceedings Risk', group: 'Section 13 · Duties to the court', anchor: '13', confidence: 'inferred', prompt: 'Derived from practice area + call notes. "may" (proceedings possible) or "will" (proceedings certain). CHECK: has the client been advised proceedings are definite?' },
          explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement: { label: 'Referral / Fee Sharing Arrangement', group: 'Section 16 · Referral and fee sharing', anchor: '16', confidence: 'unknown', prompt: 'No data source — referral/introducer data is not captured in any table. Should be blank unless there is a known referral arrangement. CHECK with fee earner.' },
          instructions_link: { label: 'Instructions Link', group: 'Section 17 · Right to cancel', anchor: '17', confidence: 'templated', prompt: 'Static: standard cancellation instructions link/reference for Helix Law. Should not vary per matter.' },
          insert_next_step_you_would_like_client_to_take: { label: 'Action Required', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Source: Call notes, pitch email. AI infers a specific imperative action. CHECK: is this what was actually agreed with the client?' },
          state_why_this_step_is_important: { label: 'Why This Step Matters', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'AI writes one sentence explaining why the client action matters. CHECK: is this accurate for this engagement?' },
          state_amount: { label: 'Action Table Payment Figure', group: 'Section 18 · Action points', anchor: '18', confidence: 'data', prompt: 'Must always equal the "figure" field. Same source: Deal.Amount.' },
          insert_consequence: { label: 'Non-payment Consequence', group: 'Section 18 · Action points', anchor: '18', confidence: 'templated', prompt: 'Standard: "we may not be able to start work on your matter" or similar. Rarely varies.' },
          describe_first_document_or_information_you_need_from_your_client: { label: 'Document Request 1', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Source: Call notes, practice area. AI names a specific document needed. CHECK: is this actually what you need from this client?' },
          describe_second_document_or_information_you_need_from_your_client: { label: 'Document Request 2', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Same as above — second document or information item.' },
          describe_third_document_or_information_you_need_from_your_client: { label: 'Document Request 3', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Same as above — third document or information item.' },
        };
        const populatedFieldCount = Object.keys(normalizedDraft).length;
        const structuredFieldCount = Object.keys(rawDraft)
          .filter((key) => rawDraft[key] !== null && rawDraft[key] !== undefined)
          .filter((key) => typeof rawDraft[key] === 'object')
          .length;

        const dateStr = ccl?.createdAt
          ? new Date(ccl.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const matterRecord = (matter || {}) as Record<string, unknown>;
        const recipientName = String(normalizedDraft.insert_clients_name || matter?.clientName || '').trim();
        const recipientAddressRaw = String(
          normalizedDraft.insert_postal_address
          || normalizedDraft.client_address
          || matterRecord.client_address
          || matterRecord.clientAddress
          || ''
        ).trim();
        const recipientAddressLines = recipientAddressRaw
          ? recipientAddressRaw
            .split(/\r?\n/)
            .flatMap((line) => line.split(/\s*,\s*/))
            .map((line) => line.trim())
            .filter(Boolean)
          : [];
        const recipientMatterHeading = String(
          normalizedDraft.insert_heading_eg_matter_description
          || matterRecord.description
          || matterRecord.practiceArea
          || ''
        ).trim();

        const getDraftValue = (fields: Record<string, unknown>, key: string) => String(fields[key] || '').trim();
        const normalizeInitialScopeValue = (value: string) => value
          .replace(/(?:\s*\(\s*["'“”]?Initial Scope["'“”]?\s*\)\s*)+$/i, '')
          .trim();
        const hasOrScaffold = (value: string) => /(^|\n)\s*(or|OR)\s*($|\n)/.test(value);
        const placeholderValue = (fields: Record<string, unknown>, key: string) => getDraftValue(fields, key) || `{{${key}}}`;
        const inferChargesChoice = (fields: Record<string, unknown>) => {
          const raw = getDraftValue(fields, 'charges_estimate_paragraph');
          if (raw.includes('We cannot give an estimate of our overall charges')) return 'no_estimate' as const;
          if (raw.includes('I estimate the cost of the Initial Scope')) return 'hourly_rate' as const;
          return null;
        };
        const inferDisbursementsChoice = (fields: Record<string, unknown>) => {
          const raw = getDraftValue(fields, 'disbursements_paragraph');
          if (raw.includes('Description | Amount | VAT chargeable')) return 'table' as const;
          if (raw.includes('we do not expect disbursements to be a major feature at the outset of your matter')) return 'table' as const;
          if (raw.includes('We cannot give an exact figure for your disbursements')) return 'estimate' as const;
          if (raw.includes('At this stage we cannot give an exact figure for your disbursements')) return 'estimate' as const;
          return null;
        };
        const inferCostsChoice = (fields: Record<string, unknown>) => {
          const raw = getDraftValue(fields, 'costs_other_party_paragraph');
          if (raw.includes("We do not expect that you will have to pay another party's costs")) return 'no_costs' as const;
          if (raw.includes('There is a risk that you may have to pay')) return 'risk_costs' as const;
          return null;
        };
        const buildChargesParagraph = (fields: Record<string, unknown>, choice: 'hourly_rate' | 'no_estimate') => {
          const raw = getDraftValue(fields, 'charges_estimate_paragraph');
          if (!hasOrScaffold(raw) && raw) {
            if (choice === 'hourly_rate' && raw.includes('I estimate the cost of the Initial Scope')) return raw;
            if (choice === 'no_estimate' && raw.includes('We cannot give an estimate of our overall charges')) return raw;
          }
          if (choice === 'hourly_rate') {
            return `I estimate the cost of the Initial Scope will be £${placeholderValue(fields, 'figure')} plus VAT.`;
          }
          return `We cannot give an estimate of our overall charges in this matter because ${placeholderValue(fields, 'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible')}. The next stage in your matter is ${placeholderValue(fields, 'next_stage')} and we estimate that our charges up to the completion of that stage will be in the region of £${placeholderValue(fields, 'figure_or_range')}.`;
        };
        const buildDisbursementsParagraph = (fields: Record<string, unknown>, choice: 'table' | 'estimate') => {
          const raw = getDraftValue(fields, 'disbursements_paragraph');
          if (!hasOrScaffold(raw) && raw) {
            if (choice === 'table' && (raw.includes('Description | Amount | VAT chargeable') || raw.includes('we do not expect disbursements to be a major feature at the outset of your matter'))) return raw;
            if (choice === 'estimate' && (raw.includes('We cannot give an exact figure for your disbursements') || raw.includes('At this stage we cannot give an exact figure for your disbursements'))) return raw;
          }
          if (choice === 'table') {
            return `Based on the information you have provided, we do not expect disbursements to be a major feature at the outset of your matter. If third-party expenses become necessary, such as court fees, counsel's fees, expert fees, search fees or similar external costs, we will discuss them with you in advance and, where possible, give you an estimate before we incur them on your behalf.`;
          }
          return `At this stage we cannot give an exact figure for your disbursements, but these are likely to be in the region of £${placeholderValue(fields, 'simple_disbursements_estimate')} for the next steps in your matter, including ${placeholderValue(fields, 'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees')}. We will discuss any significant disbursement with you before it is incurred on your behalf.`;
        };
        const buildCostsParagraph = (fields: Record<string, unknown>, choice: 'no_costs' | 'risk_costs') => {
          const raw = getDraftValue(fields, 'costs_other_party_paragraph');
          if (!hasOrScaffold(raw) && raw) {
            if (choice === 'no_costs' && raw.includes("We do not expect that you will have to pay another party's costs")) return raw;
            if (choice === 'risk_costs' && raw.includes('There is a risk that you may have to pay')) return raw;
          }
          if (choice === 'no_costs') {
            return "We do not expect that you will have to pay another party's costs. This only tends to arise in litigation and is therefore not relevant to your matter.";
          }
          return `There is a risk that you may have to pay ${placeholderValue(fields, 'identify_the_other_party_eg_your_opponents')} costs in this matter. This is explained in section 5, Funding and billing below.`;
        };
        const resolveStructuredReviewFields = (fields: Record<string, unknown>) => {
          const chargesChoice = ((fields.charges_section_choice as 'hourly_rate' | 'no_estimate' | undefined) || inferChargesChoice(fields) || 'hourly_rate');
          const disbursementsChoice = ((fields.disbursements_section_choice as 'table' | 'estimate' | undefined) || inferDisbursementsChoice(fields) || 'estimate');
          const costsChoice = ((fields.costs_section_choice as 'no_costs' | 'risk_costs' | undefined) || inferCostsChoice(fields) || 'risk_costs');
          const resolvedFields = {
            ...fields,
            insert_current_position_and_scope_of_retainer: normalizeInitialScopeValue(getDraftValue(fields, 'insert_current_position_and_scope_of_retainer')),
            charges_section_choice: chargesChoice,
            disbursements_section_choice: disbursementsChoice,
            costs_section_choice: costsChoice,
            charges_estimate_paragraph: buildChargesParagraph(fields, chargesChoice),
            disbursements_paragraph: buildDisbursementsParagraph(fields, disbursementsChoice),
            costs_other_party_paragraph: buildCostsParagraph(fields, costsChoice),
          } as Record<string, string>;
          return {
            fields: resolvedFields,
            choices: { chargesChoice, disbursementsChoice, costsChoice },
          };
        };
        const structuredReviewState = resolveStructuredReviewFields(normalizedDraft as Record<string, unknown>);
        const structuredReviewFields = structuredReviewState.fields;
        const structuredAiState = resolveStructuredReviewFields({ ...normalizedDraft, ...aiFields } as Record<string, unknown>);
        const structuredAiFields = structuredAiState.fields;

        // ── Generate the REAL letter using the canonical template engine ──
        const genOptions: GenerationOptions = {
          costsChoice: structuredReviewState.choices.costsChoice,
          chargesChoice: structuredReviewState.choices.chargesChoice,
          disbursementsChoice: structuredReviewState.choices.disbursementsChoice,
          showEstimateExamples: false,
        };
        const rawPreviewTemplate = generateTemplateContent(DEFAULT_CCL_TEMPLATE, structuredReviewFields, genOptions, true);
        const rawGeneratedContent = generateTemplateContent(DEFAULT_CCL_TEMPLATE, structuredReviewFields, genOptions);
        // The letterhead header already renders "Dear {name}" and the matter heading,
        // so skip both and start the template body from the substantive opening paragraph.
        const introPreviewTemplateStart = rawPreviewTemplate.search(/\bThank you for your instructions\b/);
        const introPreviewTemplate = introPreviewTemplateStart >= 0
          ? rawPreviewTemplate.slice(introPreviewTemplateStart)
          : rawPreviewTemplate;
        const unresolvedPlaceholders = Array.from(new Set(
          [...rawGeneratedContent.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => String(m[1] || '').trim()).filter(Boolean)
        ));
        const hasUnresolved = unresolvedPlaceholders.length > 0;
        const canApprove = ['generated', 'pressure-tested'].includes(getCanonicalCclStage(ccl?.stage || ccl?.status)) && !hasUnresolved;

        const orderedTemplateFieldKeys: string[] = [...CCL_ORDERED_REVIEW_FIELD_KEYS];
        const streamFieldValues = cclAiStreamLog.reduce((acc, entry) => {
          const key = String(entry?.key || '').trim();
          if (!key) return acc;
          const value = String(entry?.value || '').trim();
          if (!value) return acc;
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
        const setupDisplayFields = orderedTemplateFieldKeys.reduce((acc, key) => {
          const rawValue = String(streamFieldValues[key] || structuredReviewFields[key] || normalizedDraft[key] || '').trim();
          acc[key] = rawValue || `{{${key}}}`;
          return acc;
        }, {} as Record<string, string>);
        const suppressedReviewFieldKeys = CCL_SUPPRESSED_REVIEW_FIELD_KEYS;
        const visibleReviewFieldKeys = orderedTemplateFieldKeys.filter((key) => (
          !suppressedReviewFieldKeys.has(key)
          &&
          !!fieldMeta[key]
          && (
            !!normalizedDraft[key]?.trim()
            || unresolvedPlaceholders.includes(key)
            || aiFieldKeys.includes(key)
          )
        ));
        // Additive queue: union of generation review fields (unresolved/unknown) and PT-flagged fields.
        // Never hard-switch — both types coexist so the count doesn't jolt when PT lands.
        const ptScores = cclPressureTestByMatter[cclLetterModal]?.fieldScores;
        const hasPtResult = !!ptScores;
        const reviewFieldTypeMap: Record<string, 'set-wording' | 'verify'> = {};
        const effectiveReviewFieldKeys: string[] = [];
        for (const key of visibleReviewFieldKeys) {
          const isAiBacked = aiFieldKeys.includes(key);
          if (!isAiBacked) continue;
          const isUnresolved = unresolvedPlaceholders.includes(key);
          const isUnknownConfidence = fieldMeta[key]?.confidence === 'unknown';
          const isPtFlagged = !!ptScores?.[key]?.flag;
          if (isUnresolved || isUnknownConfidence) {
            reviewFieldTypeMap[key] = 'set-wording';
            effectiveReviewFieldKeys.push(key);
          } else if (isPtFlagged) {
            reviewFieldTypeMap[key] = 'verify';
            effectiveReviewFieldKeys.push(key);
          }
        }
        const setWordingCount = Object.values(reviewFieldTypeMap).filter((t) => t === 'set-wording').length;
        const verifyCount = Object.values(reviewFieldTypeMap).filter((t) => t === 'verify').length;
        const allClickableFieldKeys: string[] = effectiveReviewFieldKeys.length > 0 ? effectiveReviewFieldKeys : visibleReviewFieldKeys;
        const visibleReviewFieldCount = effectiveReviewFieldKeys.length;

        // ── Provenance meta strip ──
        // Passive read-only footer: which prompt produced this draft, which
        // model, how many fields Safety Net flagged, and the trace id. Visible
        // to everyone so the whole team can see what the AI ran on — this is
        // reference, not a call to action. Styled as plain inline text (no
        // border, no background) so it doesn't compete with actionable content.
        const ptResultForDev = cclPressureTestByMatter[cclLetterModal];
        const promptVersionForDev = (aiRes as { promptVersion?: string } | undefined)?.promptVersion
            || ptResultForDev?.promptVersion
            || null;
        const flaggedForDev = ptResultForDev?.flaggedCount
            ?? (ptResultForDev?.fieldScores
                ? Object.values(ptResultForDev.fieldScores).filter((s: { flag?: boolean }) => !!s?.flag).length
                : null);
        const modelForDev = (aiRes as { model?: string } | undefined)?.model || null;
        const traceIdForDev = (aiRes as { aiTraceId?: number | null; debug?: { trackingId?: string } } | undefined)?.aiTraceId
            || (aiRes as { debug?: { trackingId?: string } } | undefined)?.debug?.trackingId
            || null;
        const devMetaStrip = (promptVersionForDev || modelForDev || ptResultForDev) ? (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 9.5,
                    color: colours.subtleGrey,
                    opacity: 0.7,
                    letterSpacing: '0.02em',
                }}
                title="AI run provenance — reference only"
            >
                {promptVersionForDev && <span>{promptVersionForDev}</span>}
                {modelForDev && <span>· {modelForDev}</span>}
                {typeof flaggedForDev === 'number' && (
                    <span>
                        · flagged <span style={{ color: flaggedForDev > 0 ? colours.orange : colours.green }}>{flaggedForDev}</span>
                    </span>
                )}
                {traceIdForDev && <span>· trace {String(traceIdForDev)}</span>}
            </div>
        ) : null;

        // Confidence breakdown for summary card
        const confidenceBreakdown = { data: 0, inferred: 0, templated: 0, unknown: 0 };
        for (const key of aiFieldKeys) {
          const tier = fieldMeta[key]?.confidence;
          if (tier && tier in confidenceBreakdown) confidenceBreakdown[tier as keyof typeof confidenceBreakdown]++;
        }

        const summaryDismissed = !!cclReviewSummaryDismissedByMatter[cclLetterModal];

        const savedSelectedField = cclSelectedReviewFieldByMatter[cclLetterModal];
        const isExplicitFullLetter = savedSelectedField === '__none__';
        const forcedIntro = !!cclForcedIntroByMatter[cclLetterModal];
        const shouldOfferReviewIntro = forcedIntro || (!summaryDismissed && !savedSelectedField && visibleReviewFieldCount > 0);
        const showSummaryLanding = shouldOfferReviewIntro && !traceLoading && !isStreamingNow && (hasAiData || !!persistedTrace);
        const nextQueuedFieldKey = effectiveReviewFieldKeys.find((key) => !reviewedSet.has(key)) || effectiveReviewFieldKeys[0] || null;
        const resolvedSelectedFieldKey = isExplicitFullLetter
          ? null
          : (savedSelectedField && (effectiveReviewFieldKeys.includes(savedSelectedField) || allClickableFieldKeys.includes(savedSelectedField)))
            ? savedSelectedField
            : null;
        const showReviewIntro = !showSetupInDefaultView && shouldOfferReviewIntro;
        const useIntroPreviewLayout = showReviewIntro || showSetupInDefaultView;
        cclIntroPreviewModeRef.current = useIntroPreviewLayout;
        const selectedFieldKey = showReviewIntro ? null : resolvedSelectedFieldKey;
        cclSelectedFieldRef.current = selectedFieldKey;
        const selectedFieldMeta = selectedFieldKey ? fieldMeta[selectedFieldKey] : null;
        const selectedFieldTemplateContext = selectedFieldKey ? templateContextFor(selectedFieldKey) : '';
        const selectedFieldAiOutput = selectedFieldKey ? String(structuredAiFields[selectedFieldKey] || '').trim() : '';
        const selectedFieldOutput = selectedFieldKey ? String(structuredReviewFields[selectedFieldKey] || selectedFieldAiOutput || '') : '';
        const selectedFieldUnresolved = selectedFieldKey ? unresolvedPlaceholders.includes(selectedFieldKey) : false;
        const structuredChoiceConfig = selectedFieldKey === 'charges_estimate_paragraph'
          ? {
              choiceKey: 'charges_section_choice',
              selectedChoice: structuredReviewState.choices.chargesChoice,
              options: [
                {
                  value: 'hourly_rate',
                  title: 'Give a specific estimate',
                  help: 'Use when the client has been given an initial scope estimate.',
                  preview: buildChargesParagraph(structuredReviewFields, 'hourly_rate'),
                },
                {
                  value: 'no_estimate',
                  title: 'No overall estimate yet',
                  help: 'Use when only the next stage can be estimated.',
                  preview: buildChargesParagraph(structuredReviewFields, 'no_estimate'),
                },
              ],
            }
          : selectedFieldKey === 'disbursements_paragraph'
            ? {
                choiceKey: 'disbursements_section_choice',
                selectedChoice: structuredReviewState.choices.disbursementsChoice,
                options: [
                  {
                    value: 'table',
                    title: 'Detailed disbursement table',
                    help: 'Use when you want the client to see named disbursement rows.',
                    preview: buildDisbursementsParagraph(structuredReviewFields, 'table'),
                  },
                  {
                    value: 'estimate',
                    title: 'Simple overall estimate',
                    help: 'Use when only a broad estimate is appropriate.',
                    preview: buildDisbursementsParagraph(structuredReviewFields, 'estimate'),
                  },
                ],
              }
            : selectedFieldKey === 'costs_other_party_paragraph'
              ? {
                  choiceKey: 'costs_section_choice',
                  selectedChoice: structuredReviewState.choices.costsChoice,
                  options: [
                    {
                      value: 'no_costs',
                      title: 'No other side costs expected',
                      help: 'Use when the matter is non-contentious and litigation risk is not relevant.',
                      preview: buildCostsParagraph(structuredReviewFields, 'no_costs'),
                    },
                    {
                      value: 'risk_costs',
                      title: 'Risk of paying another party',
                      help: 'Use when the matter could expose the client to opponent costs.',
                      preview: buildCostsParagraph(structuredReviewFields, 'risk_costs'),
                    },
                  ],
                }
              : null;
        const reviewFieldGroups = effectiveReviewFieldKeys.reduce((acc, key) => {
          const meta = fieldMeta[key];
          if (!meta) return acc;
          const existing = acc.find((group) => group.title === meta.group);
          if (existing) {
            existing.keys.push(key);
          } else {
            acc.push({ title: meta.group, keys: [key] });
          }
          return acc;
        }, [] as Array<{ title: string; keys: string[] }>);
        const selectedFieldGroup = selectedFieldMeta
          ? reviewFieldGroups.find((group) => group.title === selectedFieldMeta.group) || null
          : null;
        const reviewedDecisionCount = effectiveReviewFieldKeys.filter((key) => reviewedSet.has(key)).length;
        const selectedFieldSequence = selectedFieldKey && !effectiveReviewFieldKeys.includes(selectedFieldKey)
          ? allClickableFieldKeys
          : effectiveReviewFieldKeys;
        const selectedFieldSequenceCount = selectedFieldSequence.length;
        const currentDecisionNumber = selectedFieldKey
          ? Math.max(selectedFieldSequence.indexOf(selectedFieldKey) + 1, 1)
          : 0;
        const selectedFieldIsReviewed = selectedFieldKey ? reviewedSet.has(selectedFieldKey) : false;
        const selectedFieldPressureTest = selectedFieldKey ? cclPressureTestByMatter[cclLetterModal]?.fieldScores?.[selectedFieldKey] : undefined;
        const selectedFieldPressureTestResponse = cclPressureTestByMatter[cclLetterModal];
        const selectedFieldDecisionReason = structuredChoiceConfig
          ? 'Pick the wording branch.'
          : selectedFieldUnresolved
          ? 'Set the wording.'
          : selectedFieldPressureTest?.flag
            ? 'Confirm this wording against the pressure-test evidence.'
            : selectedFieldMeta?.confidence === 'unknown'
              ? 'No source found — set manually.'
              : 'Confirm wording.';
        const systemPromptText = String(aiRes?.systemPrompt || '').trim();
        const userPromptText = String(aiRes?.userPrompt || '').trim();
        const hasSessionPrompts = !!(systemPromptText || userPromptText);
        const sessionPromptExpanded = !!cclSessionPromptExpandedByMatter[cclLetterModal];
        const sessionPromptTab = cclSessionPromptTabByMatter[cclLetterModal] || (systemPromptText ? 'system' : 'user');
        const visiblePromptTab = sessionPromptTab === 'system' && !systemPromptText && userPromptText
          ? 'user'
          : sessionPromptTab === 'user' && !userPromptText && systemPromptText
            ? 'system'
            : sessionPromptTab;
        const placeholderRevealActive = !!cclPlaceholderRevealByMatter[cclLetterModal];
        const revealedPlaceholderToken = selectedFieldKey ? `{{${selectedFieldKey}}}` : '';
        const promptContextRevealActive = !!cclPromptContextRevealByMatter[cclLetterModal];
        const aiContextFields = aiRes?.debug?.context?.contextFields && typeof aiRes.debug.context.contextFields === 'object'
          ? aiRes.debug.context.contextFields as Record<string, unknown>
          : {};
        const aiContextSnippets = aiRes?.debug?.context && 'snippets' in aiRes.debug.context && aiRes.debug.context.snippets && typeof aiRes.debug.context.snippets === 'object'
          ? aiRes.debug.context.snippets as Record<string, unknown>
          : {};
        const requestValueByKey: Record<string, string> = {
          practiceArea: String(aiReq?.practiceArea || aiContextFields.practiceArea || ''),
          description: String(aiReq?.description || aiContextFields.typeOfWork || aiContextFields.description || ''),
          clientName: String(aiReq?.clientName || aiContextFields.clientName || ''),
          handlerName: String(aiReq?.handlerName || aiContextFields.handlerName || ''),
          handlerRole: String(aiReq?.handlerRole || aiContextFields.handlerRole || ''),
          handlerRate: String(aiReq?.handlerRate || aiContextFields.handlerRate || ''),
          instructionRef: String(aiReq?.instructionRef || aiContextFields.instructionRef || ''),
          figure: String(structuredReviewFields.figure || normalizedDraft.figure || ''),
          state_amount: String(structuredReviewFields.state_amount || normalizedDraft.state_amount || ''),
          next_steps: String(aiContextFields.nextSteps || ''),
          typeOfWork: String(aiContextFields.typeOfWork || ''),
          opponent: String(aiContextFields.opponent || ''),
          clientType: String(aiContextFields.clientType || ''),
        };
        const fieldDataFedKeyMap: Record<string, string[]> = {
          insert_current_position_and_scope_of_retainer: ['practiceArea', 'description', 'clientName', 'typeOfWork'],
          next_steps: ['practiceArea', 'description', 'clientName', 'next_steps'],
          realistic_timescale: ['practiceArea', 'description', 'typeOfWork'],
          charges_estimate_paragraph: ['practiceArea', 'description', 'figure', 'state_amount', 'clientName'],
          disbursements_paragraph: ['practiceArea', 'description', 'clientType'],
          costs_other_party_paragraph: ['practiceArea', 'description', 'opponent'],
          may_will: ['practiceArea', 'description', 'opponent'],
          insert_next_step_you_would_like_client_to_take: ['practiceArea', 'description', 'clientName', 'next_steps'],
          state_why_this_step_is_important: ['practiceArea', 'description', 'clientName', 'next_steps'],
          describe_first_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
          describe_second_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
          describe_third_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
          eid_paragraph: ['clientType', 'clientName', 'description'],
        };
        const selectedFieldDataKeys = selectedFieldKey
          ? (fieldDataFedKeyMap[selectedFieldKey] || ['practiceArea', 'description', 'clientName', 'handlerName'])
          : [];
        const selectedFieldDataFedRows = selectedFieldDataKeys
          .map((key) => ({
            key,
            label: prettifyFieldKey(key),
            value: String(requestValueByKey[key] || '').trim(),
          }))
          .filter((row, index, rows) => row.value && rows.findIndex((candidate) => candidate.key === row.key) === index);
        const selectedFieldSnippetRows = Object.entries(aiContextSnippets)
          .filter(([key, value]) => !!String(value || '').trim() && (!selectedFieldKey || key.toLowerCase().includes(selectedFieldKey.toLowerCase()) || selectedFieldDataKeys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))))
          .map(([key, value]) => ({ key, label: prettifyFieldKey(key), value: String(value || '').trim() }));
        const userPromptSections = parseCclUserPromptSections(userPromptText);
        const selectedFieldPromptSectionKeys = getRelevantPromptSectionKeys(selectedFieldKey, selectedFieldMeta?.confidence);
        const selectedFieldPromptSections = selectedFieldPromptSectionKeys
          .map((sectionKey) => userPromptSections.find((section) => section.key === sectionKey) || null)
          .filter((section): section is CclPromptSection => !!section)
          .map((section) => ({
            ...section,
            body: section.key === 'matter-context'
              ? filterMatterContextPrompt(section.body, selectedFieldDataKeys)
              : section.body,
          }))
          .filter((section) => !!section.body.trim());
        const selectedFieldIndex = selectedFieldKey ? selectedFieldSequence.indexOf(selectedFieldKey) : -1;
        const nextDecisionFieldKey = selectedFieldIndex >= 0
          ? selectedFieldSequence.slice(selectedFieldIndex + 1).find((key) => !reviewedSet.has(key))
            || selectedFieldSequence[selectedFieldIndex + 1]
            || null
          : null;
        const selectionProgressPercent = visibleReviewFieldCount > 0
          ? Math.min(100, Math.max(0, (reviewedDecisionCount / visibleReviewFieldCount) * 100))
          : 0;
        const isFullLetterActive = !selectedFieldKey;
        const placeholderLabels = Object.fromEntries(Object.entries(fieldMeta).map(([key, meta]) => [key, meta.label]));
        const previewPlaceholderPromptPresent = /\[[^\]]+\]/.test(rawPreviewTemplate);
        const godModeFieldOptions = [
          ...orderedTemplateFieldKeys,
          ...Object.keys(fieldMeta).filter((key) => !orderedTemplateFieldKeys.includes(key)),
          ...Object.keys(structuredReviewFields).filter((key) => !orderedTemplateFieldKeys.includes(key) && !(key in fieldMeta)),
        ];
        const godModeVisible = !!cclGodModeVisibleByMatter[cclLetterModal];
        const godModeSelectedFieldKey = cclGodModeFieldByMatter[cclLetterModal] || godModeFieldOptions[0] || '';
        const godModeCurrentValue = godModeSelectedFieldKey
          ? String(structuredReviewFields[godModeSelectedFieldKey] || normalizedDraft[godModeSelectedFieldKey] || '')
          : '';
        const godModeDraftValue = cclGodModeValueByMatter[cclLetterModal] ?? godModeCurrentValue;
        const setGodModeField = (fieldKey: string) => {
          const nextFieldKey = String(fieldKey || '').trim();
          setCclGodModeFieldByMatter((prev) => ({ ...prev, [cclLetterModal]: nextFieldKey }));
          setCclGodModeValueByMatter((prev) => ({
            ...prev,
            [cclLetterModal]: nextFieldKey
              ? String(structuredReviewFields[nextFieldKey] || normalizedDraft[nextFieldKey] || '')
              : '',
          }));
        };
        const applyGodModeDraftValue = () => {
          if (!godModeSelectedFieldKey) return;
          applyDraftPatch({ [godModeSelectedFieldKey]: godModeDraftValue });
          showToast({
            type: 'success',
            title: 'God mode applied',
            message: `${fieldMeta[godModeSelectedFieldKey]?.label || prettifyFieldKey(godModeSelectedFieldKey)} updated in the draft.`,
            duration: 2600,
          });
        };
        const deleteGodModeDraftField = () => {
          if (!godModeSelectedFieldKey) return;
          const confirmed = window.confirm(`Delete ${fieldMeta[godModeSelectedFieldKey]?.label || prettifyFieldKey(godModeSelectedFieldKey)} from this draft?`);
          if (!confirmed) return;
          deleteDraftField(godModeSelectedFieldKey);
          setCclGodModeValueByMatter((prev) => ({ ...prev, [cclLetterModal]: '' }));
          showToast({
            type: 'success',
            title: 'Field deleted',
            message: `${fieldMeta[godModeSelectedFieldKey]?.label || prettifyFieldKey(godModeSelectedFieldKey)} removed from the draft.`,
            duration: 2600,
          });
        };
        const reconstructedTraceBaseFields = persistedTrace
          ? orderedTemplateFieldKeys.reduce((acc, key) => {
              const meta = fieldMeta[key];
              if (!meta || (meta.confidence !== 'data' && meta.confidence !== 'templated')) return acc;
              const value = String(structuredReviewFields[key] || normalizedDraft[key] || '').trim();
              if (value) acc[key] = value;
              return acc;
            }, {} as Record<string, string>)
          : {};
        const effectiveAiBaseFields = aiData?.baseFields || reconstructedTraceBaseFields;
        const previewFieldStates = orderedTemplateFieldKeys.reduce((acc, key) => {
          const baseValue = String(effectiveAiBaseFields[key] || '').trim();
          const aiValue = String(aiFields[key] || '').trim();
          const currentValue = String(structuredReviewFields[key] || normalizedDraft[key] || '').trim();
          const isAiGenerated = !!aiValue && !baseValue;
          const isAiUpdated = !!aiValue && !!baseValue && aiValue !== baseValue;
          const isReviewed = reviewedSet.has(key);
          const isUnresolved = unresolvedPlaceholders.includes(key);
          const isMailMergeValue = !!currentValue && !isUnresolved && !isAiGenerated && !isAiUpdated;
          if (isMailMergeValue || isAiGenerated || isAiUpdated || isReviewed || isUnresolved) {
            acc[key] = { isMailMergeValue, isAiGenerated, isAiUpdated, isReviewed, isUnresolved };
          }
          return acc;
        }, {} as Record<string, { isMailMergeValue?: boolean; isAiGenerated?: boolean; isAiUpdated?: boolean; isReviewed?: boolean; isUnresolved?: boolean }>);
        const previewFieldStateList = Object.values(previewFieldStates);
        const previewLegendItems = [
          { key: 'mail-merge', label: 'Mail merge', show: previewFieldStateList.some((state) => state.isMailMergeValue), swatch: 'rgba(135,243,243,0.14)', border: 'rgba(135,243,243,0.48)', text: '#0D2F60' },
          { key: 'ai', label: 'AI output', show: previewFieldStateList.some((state) => state.isAiGenerated || state.isAiUpdated), swatch: 'rgba(54,144,206,0.18)', border: 'rgba(54,144,206,0.45)', text: '#0D2F60' },
          { key: 'placeholder', label: 'AI placeholder', show: previewFieldStateList.some((state) => state.isUnresolved) || previewPlaceholderPromptPresent, swatch: 'rgba(255,140,0,0.14)', border: 'rgba(255,140,0,0.40)', text: colours.orange },
          { key: 'static', label: 'Static text', show: true, swatch: 'rgba(255,255,255,0.96)', border: 'rgba(13,47,96,0.18)', text: '#374151' },
          { key: 'reviewed', label: 'Approved', show: previewFieldStateList.some((state) => state.isReviewed), swatch: 'rgba(32,178,108,0.14)', border: 'rgba(32,178,108,0.45)', text: colours.green },
        ].filter((item) => item.show);
        const selectedFieldState = selectedFieldKey ? previewFieldStates[selectedFieldKey] : undefined;
        const setupPressureActiveKey = launchPressureRunning && cclPressureTestContext?.fieldKeys?.length
          ? cclPressureTestContext.fieldKeys[Math.floor((cclPressureTestElapsed / 900) % cclPressureTestContext.fieldKeys.length)]
          : null;
        const setupActiveFieldKey = setupPressureActiveKey || (cclAiStreamLog.length > 0 ? cclAiStreamLog[cclAiStreamLog.length - 1].key : null);
        const setupHeaderTitle = launchPressureRunning
          ? `Pressure testing ${cclPressureTestContext?.fieldKeys?.length || Object.keys(streamFieldValues).length || 1} field${(cclPressureTestContext?.fieldKeys?.length || Object.keys(streamFieldValues).length || 1) === 1 ? '' : 's'}`
          : launchIsStreamingNow
            ? `${Math.max(cclAiStreamLog.length, Object.keys(streamFieldValues).length, 0)} field${Math.max(cclAiStreamLog.length, Object.keys(streamFieldValues).length, 0) === 1 ? '' : 's'} generated`
            : launchTraceLoading
              ? 'Loading saved review'
              : launchHandoffActive
                ? 'Review ready'
                : launchHeadline;
        const setupHeaderBody = launchPressureRunning
          ? (setupPressureActiveKey ? `Checking ${prettifyFieldKey(setupPressureActiveKey)} against source evidence.` : 'Checking generated fields against source evidence.')
          : launchBody;
        const setupFlowStrip = (() => {
          const activeIdx = launchSteps.findIndex((s) => s.status === 'active');
          const errorIdx = launchSteps.findIndex((s) => s.status === 'error');
          const focusIdx = activeIdx >= 0 ? activeIdx : errorIdx >= 0 ? errorIdx : launchSteps.findIndex((s) => s.status === 'pending');
          return (
            <div
              role="group"
              aria-label="CCL pipeline progress"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                padding: '6px 10px',
                background: 'rgba(8, 28, 48, 0.55)',
                border: '1px solid rgba(75, 85, 99, 0.32)',
              }}
            >
              {launchSteps.map((step, i) => {
                const isDone = step.status === 'done';
                const isActive = step.status === 'active';
                const isError = step.status === 'error';
                const isFocus = i === focusIdx;
                const ringColor = isDone
                  ? colours.green
                  : isActive
                    ? colours.accent
                    : isError
                      ? colours.cta
                      : 'rgba(160, 160, 160, 0.45)';
                const fillColor = isDone
                  ? colours.green
                  : isActive
                    ? colours.accent
                    : isError
                      ? colours.cta
                      : 'transparent';
                const labelColor = isDone
                  ? '#9fd9b8'
                  : isActive
                    ? '#f3f4f6'
                    : isError
                      ? colours.cta
                      : '#7a8290';
                // Connector fills green up to (and including) the segment between two done steps.
                const prev = i > 0 ? launchSteps[i - 1] : null;
                const connectorDone = prev && prev.status === 'done' && (isDone || isActive || isError);
                const connectorColor = connectorDone
                  ? 'rgba(32, 178, 108, 0.55)'
                  : 'rgba(75, 85, 99, 0.32)';
                return (
                  <React.Fragment key={step.label}>
                    {i > 0 && (
                      <div
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 1,
                          background: connectorColor,
                          flexShrink: 0,
                          margin: '0 2px',
                        }}
                      />
                    )}
                    <div
                      aria-current={isActive ? 'step' : undefined}
                      title={step.detail || step.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                        padding: '2px 4px',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'relative',
                          width: 14,
                          height: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isActive ? (
                          // Active step: spinning ring — replaces the static pulse dot so the
                          // loading affordance lives *inside* the step rather than beside the strip.
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              border: `1.5px solid rgba(135, 243, 243, 0.18)`,
                              borderTopColor: ringColor,
                              boxSizing: 'border-box',
                              animation: 'helix-spin 0.8s linear infinite',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              border: `1.5px solid ${ringColor}`,
                              background: fillColor,
                              boxSizing: 'border-box',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isDone && (
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                                <path d="M1.5 4.2L3.2 5.8L6.5 2.4" stroke="#061733" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isError && (
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                                <path d="M2 2L6 6M6 2L2 6" stroke="#061733" strokeWidth="1.6" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: isActive ? 700 : isFocus && !isDone ? 600 : 500,
                          letterSpacing: isActive ? 0.01 : 0,
                          color: labelColor,
                          whiteSpace: 'nowrap',
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })();
        const selectedFieldCue = selectedFieldState?.isUnresolved
          ? { label: 'AI placeholder', swatch: 'rgba(255,140,0,0.14)', border: 'rgba(255,140,0,0.40)', text: colours.yellow }
          : (selectedFieldState?.isAiGenerated || selectedFieldState?.isAiUpdated)
            ? { label: 'AI output', swatch: 'rgba(54,144,206,0.18)', border: 'rgba(54,144,206,0.45)', text: colours.accent }
            : selectedFieldState?.isMailMergeValue
              ? { label: 'Mail merge', swatch: 'rgba(135,243,243,0.14)', border: 'rgba(135,243,243,0.48)', text: colours.accent }
              : { label: 'Static text', swatch: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: '#d1d5db' };
        const selectedFieldCueTone = selectedFieldState?.isUnresolved
          ? 'placeholder'
          : (selectedFieldState?.isAiGenerated || selectedFieldState?.isAiUpdated)
            ? 'ai'
            : selectedFieldState?.isMailMergeValue
              ? 'mail-merge'
              : 'static';
        const godModeFieldOptionsWithLabels = godModeFieldOptions.map((fieldKey) => ({
          key: fieldKey,
          label: fieldMeta[fieldKey]?.label || prettifyFieldKey(fieldKey),
        }));
        const reviewSectionTabs = reviewFieldGroups.map((group) => {
          const firstKey = group.keys[0] || null;
          const focusKey = group.keys.find((key) => !reviewedSet.has(key)) || firstKey;
          const completedCount = group.keys.filter((key) => reviewedSet.has(key)).length;
          const isActive = selectedFieldKey
            ? group.keys.includes(selectedFieldKey)
            : false;
          return {
            key: group.title,
            title: group.title,
            firstKey,
            focusKey,
            completedCount,
            totalCount: group.keys.length,
            isActive,
          };
        });
        const setFocusedReviewField = (key: string | null, fromScrollSpy = false, shouldScrollIntoView = true) => {
          if (key) {
            const nextGroupTitle = fieldMeta[key]?.group;
            if (nextGroupTitle) {
              setCclVisibleReviewGroupByMatter((prev) => (
                prev[cclLetterModal] === nextGroupTitle
                  ? prev
                  : { ...prev, [cclLetterModal]: nextGroupTitle }
              ));
            }
          }
          setCclSelectedReviewFieldByMatter((prev) => ({
            ...prev,
            [cclLetterModal]: key || '__none__',
          }));
          if (key && !fromScrollSpy) {
            // Lock scroll spy for 600ms to prevent circular: programmatic scroll → spy → set field
            cclScrollSpyLockRef.current = true;
            setTimeout(() => { cclScrollSpyLockRef.current = false; }, 600);
            if (shouldScrollIntoView) {
              requestAnimationFrame(() => scrollReviewFieldIntoView(key));
            }
          }
        };
        const focusNextDecision = () => {
          if (!nextDecisionFieldKey) return;
          setFocusedReviewField(nextDecisionFieldKey);
          requestAnimationFrame(() => scrollReviewFieldIntoView(nextDecisionFieldKey));
        };
        const previousDecisionFieldKey = selectedFieldIndex > 0
          ? selectedFieldSequence[selectedFieldIndex - 1]
          : null;
        const focusPreviousDecision = () => {
          if (!previousDecisionFieldKey) return;
          setFocusedReviewField(previousDecisionFieldKey);
          requestAnimationFrame(() => scrollReviewFieldIntoView(previousDecisionFieldKey));
        };
        const jumpToDecision = (targetKey: string) => {
          if (!targetKey || targetKey === selectedFieldKey) return;
          setFocusedReviewField(targetKey);
          requestAnimationFrame(() => scrollReviewFieldIntoView(targetKey));
        };
        const queueStripItems = selectedFieldSequence.map((key) => {
          const meta = fieldMeta[key];
          const ptScore = cclPressureTestByMatter[cclLetterModal]?.fieldScores?.[key];
          const isUnresolved = meta?.confidence === 'unknown'
            || !String(structuredReviewFields[key] || normalizedDraft[key] || '').trim();
          return {
            key,
            label: meta?.label || prettifyFieldKey(key),
            group: meta?.group,
            reviewed: reviewedSet.has(key),
            flagged: !!ptScore?.flag,
            unresolved: isUnresolved,
          };
        });
        const beginReviewFromIntro = () => {
          dismissReviewIntroForMatter(cclLetterModal);
          setCclIntroCurrentPage(1);
          setCclReviewCurrentPage(1);
          setCclIntroScrollProgress(0);
          cclHoveredPreviewPage && setCclHoveredPreviewPage(null);
          const scrollContainer = cclReviewPreviewRef.current;
          scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
          if (!nextQueuedFieldKey) {
            setFocusedReviewField(null, false, false);
            return;
          }
          setFocusedReviewField(nextQueuedFieldKey, false, false);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollReviewFieldIntoView(nextQueuedFieldKey, 'auto');
            });
          });
        };
        const applyDraftPatch = (patch: Record<string, string>) => {
          const nextFields = { ...normalizedDraft, ...patch };
          setCclDraftCache((prev) => ({
            ...prev,
            [cclLetterModal]: { ...prev[cclLetterModal], fields: nextFields },
          }));
          persistCclDraft(cclLetterModal, nextFields);
        };
        const applySelectedFieldValue = (value: string) => {
          if (!selectedFieldKey) return;
          applyDraftPatch({ [selectedFieldKey]: value });
          // Re-size the review textarea after programmatic value change
          requestAnimationFrame(() => {
            const el = reviewTextareaRef.current;
            if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
          });
        };
        const applyStructuredChoice = (choiceValue: string) => {
          if (!selectedFieldKey || !structuredChoiceConfig) return;
          const nextState = resolveStructuredReviewFields({
            ...normalizedDraft,
            [structuredChoiceConfig.choiceKey]: choiceValue,
          } as Record<string, unknown>);
          applyDraftPatch({
            [structuredChoiceConfig.choiceKey]: choiceValue,
            [selectedFieldKey]: String(nextState.fields[selectedFieldKey] || ''),
          });
        };
        const deleteDraftField = (fieldKey: string) => {
          const nextFields = { ...normalizedDraft };
          delete nextFields[fieldKey];
          setCclDraftCache((prev) => ({
            ...prev,
            [cclLetterModal]: { ...prev[cclLetterModal], fields: nextFields },
          }));
          persistCclDraft(cclLetterModal, nextFields);
        };
        const scrollReviewGroupIntoView = (_groupTitle: string | null, behavior: ScrollBehavior = 'smooth') => {
          cclReviewPreviewRef.current?.scrollTo({ top: 0, behavior });
        };
        const scrollReviewFieldIntoView = (fieldKey: string | null, behavior: ScrollBehavior = 'smooth') => {
          const scrollContainer = cclReviewPreviewRef.current;
          if (!fieldKey) {
            scrollContainer?.scrollTo({ top: 0, behavior });
            return;
          }
          const fieldElement = cclReviewFieldElementRefs.current[fieldKey];
          if (fieldElement && scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const fieldRect = fieldElement.getBoundingClientRect();
            const stickyHeader = scrollContainer.querySelector('[data-review-tabs-header="true"]') as HTMLElement | null;
            const stickyOffset = (stickyHeader?.getBoundingClientRect().height || 0) + 18;
            const availableHeight = Math.max(scrollContainer.clientHeight - stickyOffset, 1);
            const desiredOffset = stickyOffset + Math.max((availableHeight - fieldRect.height) * 0.22, 0);
            const targetTop = scrollContainer.scrollTop + (fieldRect.top - containerRect.top) - desiredOffset;
            const boundedTargetTop = Math.min(
              Math.max(targetTop, 0),
              Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0),
            );
            if (Math.abs(scrollContainer.scrollTop - boundedTargetTop) < 10) return;
            scrollContainer.scrollTo({ top: boundedTargetTop, behavior });
            return;
          }
          scrollContainer?.scrollTo({ top: 0, behavior });
        };

        const handleApproveCurrentLetter = async () => {
          if (cclApprovingMatter) return;
          const matterId = cclLetterModal;
          setCclApprovingMatter(matterId);
          setCclApprovalStep('Finalising your letter…');
          try {
            const result = await approveCcl(matterId, 'approved');
            if (!result.ok) {
              showToast({ type: 'error', title: 'Approval failed', message: result.error || 'Could not approve letter.', duration: 5000 });
              return;
            }
            setCclMap(prev => ({
              ...prev,
              [matterId]: {
                ...prev[matterId],
                status: 'reviewed',
                stage: 'reviewed',
                label: 'Reviewed',
                finalizedAt: result.finalizedAt || new Date().toISOString(),
              },
            }));

            // Upload reviewed document to NetDocuments (best-effort — don't block approval)
            const displayNum = matter?.displayNumber || matterId;
            setCclApprovalStep('Uploading to NetDocuments…');
            try {
              await uploadToNetDocuments({
                matterId,
                matterDisplayNumber: displayNum,
                fields: structuredReviewFields as Record<string, string>,
              });
            } catch (ndErr) {
              console.warn('[ccl] ND upload after approval failed (non-blocking):', ndErr);
            }

            // Clear field selection so user doesn't land on stale field view
            setCclSelectedReviewFieldByMatter(prev => {
              const next = { ...prev };
              delete next[matterId];
              return next;
            });

            // Show approved confirmation overlay, then auto-close
            setCclApprovalStep('');
            setCclJustApproved(matterId);
            setTimeout(() => {
              setCclJustApproved(prev => prev === matterId ? null : prev);
              setCclLetterModal(prev => prev === matterId ? null : prev);
            }, 2200);
          } catch (err) {
            console.error('[ccl] Approval error:', err);
            showToast({ type: 'error', title: 'Approval error', message: 'Something went wrong approving this letter.', duration: 5000 });
          } finally {
            setCclApprovingMatter(null);
            setCclApprovalStep('');
          }
        };

        // Keyboard nav — delegated from the top-level document listener via ref.
        // ↑ previous · ↓ next · Enter (with Ctrl) approve · R toggle reviewed
        // · Esc back to summary. We bail if focus is inside a textarea/input so
        // the user can still type freely, except for Ctrl+Enter which is always
        // honoured (approve-letter shortcut).
        cclReviewKeyHandlerRef.current = (event: KeyboardEvent) => {
          if (!cclLetterModal) return;
          const target = event.target as HTMLElement | null;
          const isTypingTarget = !!target && (
            target.tagName === 'TEXTAREA'
            || target.tagName === 'INPUT'
            || target.isContentEditable
          );
          const ctrlOrMeta = event.ctrlKey || event.metaKey;
          if (event.key === 'Escape') {
            if (selectedFieldKey) {
              event.preventDefault();
              setFocusedReviewField(null);
            }
            return;
          }
          if (!selectedFieldKey) return;
          if (isTypingTarget && !(ctrlOrMeta && event.key === 'Enter')) return;
          if (ctrlOrMeta && event.key === 'Enter') {
            if (canApprove && !nextDecisionFieldKey && !cclApprovingMatter) {
              event.preventDefault();
              handleApproveCurrentLetter();
            }
            return;
          }
          if (event.key === 'ArrowUp') {
            if (previousDecisionFieldKey) {
              event.preventDefault();
              focusPreviousDecision();
            }
            return;
          }
          if (event.key === 'ArrowDown') {
            if (nextDecisionFieldKey) {
              event.preventDefault();
              focusNextDecision();
            }
            return;
          }
          if (event.key === 'r' || event.key === 'R') {
            event.preventDefault();
            toggleFieldReviewed(selectedFieldKey);
            if (!selectedFieldIsReviewed) focusNextDecision();
          }
        };

        // P5: Auto-scroll to the initial guided field once per matter/field pair.
        const autoScrollReviewKey = selectedFieldKey && !savedSelectedField ? `${cclLetterModal}:${selectedFieldKey}` : null;
        if (autoScrollReviewKey && cclAutoScrollReviewRef.current !== autoScrollReviewKey) {
          cclAutoScrollReviewRef.current = autoScrollReviewKey;
          requestAnimationFrame(() => {
            scrollReviewFieldIntoView(selectedFieldKey, 'auto');
          });
        }
        if (!autoScrollReviewKey && cclAutoScrollReviewRef.current !== null) {
          cclAutoScrollReviewRef.current = null;
        }

        const isMobileReview = typeof window !== 'undefined' ? window.innerWidth <= 820 : false;
        const ptRunningHere = cclPressureTestRunning === cclLetterModal;
        const ptResultHere = cclPressureTestByMatter[cclLetterModal];
        const compileResultHere = cclCompileByMatter[cclLetterModal];
        const compileSummaryHere = compileResultHere?.summary || ccl?.compileSummary || null;
        const compiledAtHere = ccl?.compiledAt || compileResultHere?.createdAt || null;
        const ptHasAiContext = hasAiData || !!persistedTrace;
        const ptPending = ptHasAiContext && !ptResultHere && (ptRunningHere || !cclPressureTestRunning);
        const ptCanRun = ptHasAiContext && !ptResultHere && !ptRunningHere;
        const generationFieldCount = Number(aiRes?.debug?.generatedFieldCount || persistedTrace?.GeneratedFieldCount || totalAiFields || 0);
        const generationConfidence = String(aiRes?.confidence || persistedTrace?.Confidence || ccl?.confidence || '').trim().toLowerCase();
        const loadingReviewContext = !selectedFieldKey && (traceLoading || isStreamingNow);
        const noAiReviewContext = !selectedFieldKey && !loadingReviewContext && !hasAiData && !persistedTrace;
        const showQueuedReviewLanding = !selectedFieldKey && !loadingReviewContext && !noAiReviewContext && !showSummaryLanding && visibleReviewFieldCount > 0;
        const shouldShowReviewRail = !showReviewIntro && !showSetupInDefaultView && !showQueuedReviewLanding && (
          reviewRailPrimed
          || !!selectedFieldKey
          || traceLoading
          || isStreamingNow
          || hasAiData
          || !!persistedTrace
          || visibleReviewFieldCount > 0
          || ptRunningHere
        );
        const noClarificationsQueued = !selectedFieldKey && !loadingReviewContext && !noAiReviewContext && visibleReviewFieldCount === 0 && !showSummaryLanding;
        const currentDraftVersion = Number(ccl?.version ?? cached?.loadInfo?.version ?? 0);
        const replacementDraftVersion = currentDraftVersion > 0 ? currentDraftVersion + 1 : null;
        const canOfferOverrideRerun = !showSetupInDefaultView && !!draft && !isCompileStageRender;
        const showOverrideConfirm = cclOverrideConfirmMatter === cclLetterModal && canOfferOverrideRerun;
        const overrideButtonLabel = cclAiFillingMatter === cclLetterModal
          ? currentDraftVersion > 0 && replacementDraftVersion
            ? `Replacing v${currentDraftVersion} with v${replacementDraftVersion}…`
            : 'Replacing current draft…'
          : replacementDraftVersion
            ? `Rerun and replace with v${replacementDraftVersion}`
            : 'Rerun and replace draft';
        const overrideCardExpanded = cclOverrideCardExpandedMatter === cclLetterModal || showOverrideConfirm;
        const overrideExpandedCard = canOfferOverrideRerun && overrideCardExpanded ? (
          <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(75, 85, 99, 0.45)', background: 'rgba(10, 28, 50, 0.55)', padding: isMobileReview ? '12px 14px' : '12px 14px', animation: 'cclOverrideExpandIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
            {currentDraftVersion > 0 && replacementDraftVersion ? (
              <div style={{ display: 'grid', gap: 2, lineHeight: 1.2 }}>
                <div style={{
                  fontSize: isMobileReview ? 12 : 11,
                  color: colours.subtleGrey,
                  textDecoration: 'line-through',
                  textDecorationColor: 'rgba(160, 160, 160, 0.6)',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                }}>
                  v{currentDraftVersion}
                </div>
                <div style={{
                  fontSize: isMobileReview ? 17 : 15,
                  color: '#f3f4f6',
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}>
                  v{replacementDraftVersion}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: isMobileReview ? 13 : 12, color: '#f3f4f6', fontWeight: 700 }}>
                New draft
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                trackClientEvent('operations-ccl', 'CCL.OverrideRerun.Clicked', {
                  matterId: cclLetterModal,
                  currentVersion: currentDraftVersion,
                  filling: cclAiFillingMatter === cclLetterModal,
                });
                // Direct fire — the v{n} → v{n+1} visual above conveys what happens.
                // A second confirm modal was being swallowed by stacking context in
                // the Teams iframe, leaving the button looking dead. One deliberate
                // click is enough.
                void runHomeCclAiAutofill(cclLetterModal, { overrideExisting: true });
              }}
              disabled={cclAiFillingMatter === cclLetterModal}
              style={{
                justifySelf: 'start',
                fontSize: isMobileReview ? 12 : 11,
                fontWeight: 700,
                color: '#fff',
                background: colours.highlight,
                padding: isMobileReview ? '11px 12px' : '9px 11px',
                cursor: cclAiFillingMatter === cclLetterModal ? 'wait' : 'pointer',
                border: 'none',
                minHeight: isMobileReview ? 44 : 'auto',
              }}
            >
              {cclAiFillingMatter === cclLetterModal
                ? overrideButtonLabel
                : `Rerun${replacementDraftVersion ? ` as v${replacementDraftVersion}` : ''}`}
            </button>
          </div>
        ) : null;
        const overrideStartAgainLink = canOfferOverrideRerun && !overrideCardExpanded ? (
          <button
            type="button"
            onClick={() => {
              trackClientEvent('operations-ccl', 'CCL.OverrideRerun.Expanded', { matterId: cclLetterModal });
              setCclOverrideCardExpandedMatter(cclLetterModal);
            }}
            style={{
              justifySelf: 'center',
              background: 'transparent',
              border: 'none',
              padding: '6px 8px',
              color: colours.subtleGrey,
              fontSize: isMobileReview ? 11 : 10.5,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              letterSpacing: '0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              fontFamily: 'Raleway, sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = isDarkMode ? colours.accent : colours.highlight; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colours.subtleGrey; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M9.5 2.5V5H7M2.5 9.5V7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.2 5.2A3.5 3.5 0 0 1 9 4.6M8.8 6.8A3.5 3.5 0 0 1 3 7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>
              Start again{currentDraftVersion > 0 && replacementDraftVersion ? ` (v${currentDraftVersion} \u2192 v${replacementDraftVersion})` : ''}
            </span>
          </button>
        ) : null;
        const overrideSummaryCard = overrideExpandedCard;
        const showReviewRailSkeleton = shouldShowReviewRail && loadingReviewContext;
        const reviewValueFontSize = isMobileReview ? 11 : 10;
        const reviewPaneHeight = isMobileReview ? ((selectedFieldKey || showSetupInDefaultView) ? 'min(50vh, 440px)' : '0px') : 'auto';
        const previewBottomPadding = isMobileReview && selectedFieldKey ? 380 : 22;
        const firmSignatureAddress = 'Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';
        const firmSignaturePhone = '0345 314 2044';
        const firmSignatureEmail = 'info@helix-law.com';
        const firmSignatureWeb = 'www.helix-law.com';
        const firmRegulatoryParagraph = 'Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. Helix\u00AE and Helix Law\u00AE are registered trademarks (UK00003984532 and UK00003984535).';
        const introHeadline = loadingReviewContext
          ? 'Preparing your review'
          : noAiReviewContext
            ? 'Draft open'
            : 'Review ready';
        const introBody: React.ReactNode = loadingReviewContext
          ? (aiState.detail || 'Pulling the matter context together and setting up the review.')
          : noAiReviewContext
            ? 'Draft open. Run the review pass to pull out anything that still needs sign-off.'
            : visibleReviewFieldCount > 0
              ? (setWordingCount > 0 && verifyCount > 0
                ? (
                  <span style={{ display: 'grid', gap: 6 }}>
                    <span>
                      <strong style={{ color: '#f3f4f6' }}>{setWordingCount} to write</strong>
                      <span style={{ color: colours.subtleGrey }}> — left blank for you</span>
                    </span>
                    <span>
                      <strong style={{ color: colours.orange }}>{verifyCount} to verify</strong>
                      <span style={{ color: colours.subtleGrey }}> — review pressure test results</span>
                    </span>
                  </span>
                )
                : verifyCount > 0
                  ? (
                    <span>
                      <strong style={{ color: colours.orange }}>{verifyCount} to verify</strong>
                      <span style={{ color: colours.subtleGrey }}> — review pressure test results. Everything else lined up with the evidence.</span>
                    </span>
                  )
                  : ptPending
                    ? (
                      <span>
                        <strong style={{ color: '#f3f4f6' }}>{setWordingCount} to write</strong>
                        <span style={{ color: colours.subtleGrey }}> — Safety Net is still checking the rest.</span>
                      </span>
                    )
                    : hasPtResult && verifyCount === 0
                      ? (
                        <span>
                          <strong style={{ color: '#f3f4f6' }}>{setWordingCount} to write</strong>
                          <span style={{ color: colours.subtleGrey }}> — everything else passed Safety Net.</span>
                        </span>
                      )
                      : `${visibleReviewFieldCount} still to sign off.`)
              : 'Open the workspace for a final read-through.';
        const introShellGrid = isMobileReview
          ? 'minmax(0, 1fr)'
          : 'minmax(0, 1.15fr) minmax(360px, 0.85fr)';
        const reviewShellGrid = isMobileReview
          ? 'minmax(0, 1fr)'
          : (shouldShowReviewRail ? introShellGrid : 'minmax(0, 1fr)');
        const introSectionTitles = reviewSectionTabs.map((tab) => tab.title);
        const introRemainingStart = Math.min(
          Math.max(Math.floor(cclIntroScrollProgress * Math.max(introSectionTitles.length, 1)), 0),
          Math.max(introSectionTitles.length - 1, 0),
        );
        const introRemainingTitles = introSectionTitles.slice(introRemainingStart, introRemainingStart + 3);
        const previewCurrentPage = useIntroPreviewLayout ? cclIntroCurrentPage : cclReviewCurrentPage;
        const previewTotalPages = useIntroPreviewLayout ? cclIntroTotalPages : cclTotalPages;
        const previewFramePaddingX = isMobileReview ? 0 : 24;
        const previewDocumentMaxWidth = isMobileReview ? '100%' : 794;
        const previewScaledWidth = isMobileReview ? '100%' : Math.round(794 * cclPreviewZoom);
        const previewScaledHeight = isMobileReview ? undefined : (cclPreviewContentHeight > 0 ? Math.round(cclPreviewContentHeight * cclPreviewZoom) : undefined);
        const previewDesktopFontSize = '10pt';
        const previewDesktopLineHeight = 1.42;
        const previewDocumentPaddingX = isMobileReview ? 24 : 64;

        const previewFirstPageHeader = (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
              <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/Asset-2@72x.png" alt="Helix Law" style={{ width: isMobileReview ? 146 : 178, height: 'auto', display: 'block', flexShrink: 0 }} />
              <div style={{ textAlign: 'right' as const, fontSize: 9.5, lineHeight: 1.55, color: '#374151', minWidth: isMobileReview ? 160 : 220 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0D2F60' }}>01273 761990</div>
                <div>helix-law.com</div>
                <div>Second Floor, Britannia House</div>
                <div>21 Station Street, Brighton</div>
                <div>BN1 4DE</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobileReview ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) max-content', gap: isMobileReview ? 16 : 28, fontSize: 10.5, lineHeight: 1.65, color: '#061733', marginTop: 22, marginBottom: 14, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{recipientName || 'Client'}</div>
                {recipientAddressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: isMobileReview ? 'start' : 'end', textAlign: isMobileReview ? 'left' as const : 'right' as const, minWidth: isMobileReview ? 0 : 220 }}>
                <div>Our Reference {matter?.displayNumber || ''}</div>
                {!!structuredReviewFields.fee_earner_email && <div>Email {structuredReviewFields.fee_earner_email}</div>}
                <div>Date {dateStr}</div>
              </div>
            </div>

            {!!structuredReviewFields.client_email && (
              <div style={{ fontSize: 10.5, lineHeight: 1.65, color: '#061733', marginBottom: 18 }}>
                BY EMAIL ONLY - {structuredReviewFields.client_email}
              </div>
            )}

            {!!recipientMatterHeading && (
              <div style={{ fontSize: 11, lineHeight: 1.65, color: '#061733', fontWeight: 600, marginBottom: 18 }}>
                {recipientMatterHeading}
              </div>
            )}

            <div style={{ fontSize: 10.5, lineHeight: 1.65, color: '#061733', marginBottom: 18 }}>
              Dear {recipientName || 'Client'}
            </div>
          </>
        );
        const previewFirstPageFooter = (
          <div style={{ paddingTop: 10, borderTop: '0.5px solid #d5dbe3', display: 'grid', gap: 8, color: colours.subtleGrey }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 2, fontSize: 8, lineHeight: 1.5, color: '#374151' }}>
              <span>{firmSignatureAddress}</span>
              <span>·</span>
              <span>{firmSignaturePhone}</span>
              <span>·</span>
              <span>{firmSignatureEmail}</span>
              <span>·</span>
              <span>{firmSignatureWeb}</span>
            </div>
            <div style={{ fontSize: 7, lineHeight: 1.45, color: colours.subtleGrey, textAlign: 'justify' as const, hyphens: 'auto' as const }}>
              {firmRegulatoryParagraph}
            </div>
          </div>
        );
        const syncVisibleReviewGroup = () => {
          const el = cclReviewPreviewRef.current;
          const legend = cclLegendRef.current;
          if (!el || !legend) return;
          const scrolled = el.scrollTop > 40;
          if (scrolled !== cclLegendCollapsedRef.current) {
            cclLegendCollapsedRef.current = scrolled;
            legend.style.maxHeight = scrolled ? '0px' : '60px';
            legend.style.opacity = scrolled ? '0' : '1';
            legend.style.paddingTop = scrolled ? '0' : '2px';
            legend.style.overflow = 'hidden';
          }
          // ── Scroll spy: update active bookmark from scroll position ──
          if (cclScrollSpyLockRef.current) return;
          if (cclScrollSpyTimerRef.current) clearTimeout(cclScrollSpyTimerRef.current);
          cclScrollSpyTimerRef.current = setTimeout(() => {
            if (cclScrollSpyLockRef.current) return;
            const containerRect = el.getBoundingClientRect();
            const scanY = containerRect.top + containerRect.height * 0.4;
            const currentKey = cclSelectedFieldRef.current;
            let bestKey: string | null = null;
            let bestDist = Infinity;
            for (const key of allClickableFieldKeys) {
              const fieldEl = cclReviewFieldElementRefs.current[key];
              if (!fieldEl) continue;
              const rect = fieldEl.getBoundingClientRect();
              // Field must be at least partially visible
              if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
              const dist = Math.abs(rect.top - scanY);
              if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
              }
            }
            // Only snap back to full letter at the very top if no field is explicitly selected.
            if (el.scrollTop < 18 && !currentKey) {
              bestKey = null;
            }
            const currentFieldEl = currentKey ? cclReviewFieldElementRefs.current[currentKey] : null;
            const currentRect = currentFieldEl?.getBoundingClientRect();
            const currentStillAnchored = !!currentRect
              && currentRect.bottom > containerRect.top + 40
              && currentRect.top < containerRect.top + containerRect.height * 0.68;
            if (bestKey !== currentKey) {
              const pending = cclScrollSpyPendingFieldRef.current;
              if (pending.key === bestKey) {
                pending.count += 1;
              } else {
                cclScrollSpyPendingFieldRef.current = { key: bestKey, count: 1 };
              }
              const nextPending = cclScrollSpyPendingFieldRef.current;
              const shouldCommit = bestKey === null
                ? el.scrollTop < 18 || nextPending.count >= 3
                : (!currentStillAnchored && nextPending.count >= 3) || nextPending.count >= 4;
              if (shouldCommit) {
                cclScrollSpyPendingFieldRef.current = { key: bestKey, count: 0 };
                setFocusedReviewField(bestKey, true);
              }
              return;
            }
            cclScrollSpyPendingFieldRef.current = { key: currentKey, count: 0 };
          }, 160);

          const containerRect = el.getBoundingClientRect();
          const pageEls = Array.from(el.querySelectorAll<HTMLElement>('[data-page-number]'));
          let bestPage = 1;
          let bestDistance = Number.POSITIVE_INFINITY;
          pageEls.forEach((pageEl) => {
            const rect = pageEl.getBoundingClientRect();
            if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return;
            const distance = Math.abs(rect.top - containerRect.top - 24);
            const pageNum = Number(pageEl.dataset.pageNumber || 1);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestPage = pageNum;
            }
          });
          setCclReviewCurrentPage((prev) => prev === bestPage ? prev : bestPage);
        };
        const syncIntroPreviewProgress = () => {
          const el = cclReviewPreviewRef.current;
          if (!el) return;
          const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0);
          const nextProgress = maxScroll > 0 ? Math.min(Math.max(el.scrollTop / maxScroll, 0), 1) : 0;
          setCclIntroScrollProgress((prev) => Math.abs(prev - nextProgress) < 0.01 ? prev : nextProgress);
          const pageEls = Array.from(el.querySelectorAll<HTMLElement>('[data-page-number]'));
          if (!pageEls.length) {
            setCclIntroCurrentPage(1);
            return;
          }
          const containerRect = el.getBoundingClientRect();
          let bestPage = 1;
          let bestDistance = Number.POSITIVE_INFINITY;
          pageEls.forEach((pageEl) => {
            const rect = pageEl.getBoundingClientRect();
            if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return;
            const distance = Math.abs(rect.top - containerRect.top - 24);
            const pageNum = Number(pageEl.dataset.pageNumber || 1);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestPage = pageNum;
            }
          });
          setCclIntroCurrentPage((prev) => prev === bestPage ? prev : bestPage);
        };
        const reviewRailContentKey = selectedFieldKey
          ? `field:${selectedFieldKey}`
          : loadingReviewContext
            ? 'loading'
            : noAiReviewContext
              ? 'no-ai'
              : noClarificationsQueued
                ? 'no-clarifications'
                : 'overview';
        const reviewModal = (
          <div
            onClick={handleCclLetterBackdropClick}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 30000,
              background: 'rgba(0, 3, 25, 0.82)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              padding: isMobileReview ? '0' : '20px',
              boxSizing: 'border-box',
              animation: 'opsDashFadeIn 0.2s ease both',
              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ccl-review-modal-shell"
              style={{
                position: 'relative',
                width: isMobileReview ? '100%' : 'min(1280px, 100%)',
                height: '100%',
                maxHeight: isMobileReview ? '100vh' : 'calc(100vh - 40px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(6, 23, 51, 0.98)',
                border: '1px solid rgba(135, 243, 243, 0.12)',
                boxShadow: 'var(--shadow-overlay-lg)',
                animation: 'opsDashScaleIn 0.24s ease both',
                overflow: 'hidden',
                borderRadius: isMobileReview ? 0 : 2,
              }}
            >
              <style>{`
                .ccl-review-scroll {
                  scrollbar-width: thin;
                  scrollbar-color: rgba(100, 110, 120, 0.5) rgba(0, 0, 0, 0.06);
                }
                .ccl-review-scroll::-webkit-scrollbar {
                  width: 10px;
                  height: 10px;
                }
                .ccl-review-scroll::-webkit-scrollbar-track {
                  background: rgba(0, 0, 0, 0.06);
                }
                .ccl-review-scroll::-webkit-scrollbar-thumb {
                  background: rgba(100, 110, 120, 0.5);
                  border: 2px solid rgba(213, 216, 220, 0.5);
                }
                .ccl-review-scroll::-webkit-scrollbar-thumb:hover {
                  background: rgba(80, 90, 100, 0.65);
                }
              `}</style>

              {/* ── Approval overlay (in-progress or just-approved) ── */}
              {(cclApprovingMatter === cclLetterModal || cclJustApproved === cclLetterModal) && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 50,
                  background: 'rgba(6, 23, 51, 0.96)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  animation: 'opsDashFadeIn 0.25s ease both',
                  fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                }}>
                  {cclJustApproved === cclLetterModal ? (
                    <>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(32, 178, 108, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', marginBottom: 6 }}>Letter approved</div>
                      <div style={{ fontSize: 13, color: colours.subtleGrey, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
                        {matter?.displayNumber || 'This letter'} has been finalised and uploaded to NetDocuments.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ position: 'relative', width: 44, height: 44, marginBottom: 20 }}>
                        <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(135, 243, 243, 0.08)', borderRadius: '50%' }} />
                        <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent', borderTopColor: colours.accent, borderRadius: '50%', animation: 'cclLoadPulse 1.2s ease-in-out infinite, cclApprovalSpin 1s linear infinite' }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', marginBottom: 6 }}>{cclApprovalStep || 'Approving…'}</div>
                      <div style={{ fontSize: 12, color: colours.subtleGrey }}>This will only take a moment.</div>
                    </>
                  )}
                </div>
              )}
              <style>{`@keyframes cclApprovalSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobileReview ? '12px 14px' : '14px 18px', borderBottom: '1px solid rgba(135, 243, 243, 0.08)', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobileReview ? 12 : 11, fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {matter?.displayNumber || 'Matter'}
                    <span style={{ color: colours.subtleGrey, fontWeight: 500 }}> · {matter?.clientName || normalizedDraft.insert_clients_name || 'Client'}</span>
                  </div>

                  <div style={{ marginTop: 5, fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                    {showSetupInDefaultView
                      ? `${launchSteps[Math.max(0, launchSteps.findIndex((step) => step.status === 'active'))]?.label || 'Review setup'} in progress`
                      : showReviewIntro
                      ? 'Draft review'
                      : selectedFieldKey
                        ? `Decision ${Math.max(currentDecisionNumber, 1)} of ${visibleReviewFieldCount}`
                        : visibleReviewFieldCount > 0
                          ? `${visibleReviewFieldCount} point${visibleReviewFieldCount === 1 ? '' : 's'} left to check`
                          : 'Final review workspace'}
                  </div>
                </div>

                <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#A0A0A0', whiteSpace: 'nowrap' }}>
                  {`Page ${previewCurrentPage} of ${Math.max(previewTotalPages, 1)}`}
                </div>
                <button
                  type="button"
                  onClick={closeCclLetterModal}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >×</button>
              </div>

                <div style={{ display: 'grid', gridTemplateColumns: useIntroPreviewLayout ? introShellGrid : reviewShellGrid, flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                  <div
                    className="ccl-review-scroll"
                    ref={cclReviewPreviewRefCallback}
                    onScroll={useIntroPreviewLayout ? syncIntroPreviewProgress : syncVisibleReviewGroup}
                    style={{
                      overflow: 'auto',
                      padding: isMobileReview ? 0 : `0 ${previewFramePaddingX}px`,
                      paddingBottom: useIntroPreviewLayout ? 0 : previewBottomPadding,
                      scrollbarGutter: 'stable',
                      background: colours.grey,
                      height: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                  <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                      position: isMobileReview ? 'static' : 'relative',
                      width: previewScaledWidth,
                      maxWidth: isMobileReview ? previewDocumentMaxWidth : previewScaledWidth,
                      minHeight: isMobileReview ? 'calc(100% - 52px)' : previewScaledHeight,
                      margin: isMobileReview ? '0' : '0 auto',
                      overflow: isMobileReview ? 'visible' : 'hidden',
                    }}>
                    <div ref={cclReviewPageRefCallback} data-ccl-page-container style={{
                      position: isMobileReview ? 'static' : 'absolute',
                      top: isMobileReview ? undefined : 0,
                      left: isMobileReview ? undefined : 0,
                      width: isMobileReview ? '100%' : 794,
                      maxWidth: isMobileReview ? previewDocumentMaxWidth : undefined,
                      margin: 0,
                      padding: useIntroPreviewLayout
                        ? (isMobileReview ? '18px 14px 20px' : '30px 28px 34px')
                        : (isMobileReview ? '28px 24px 28px' : '24px 0 40px'),
                      color: colours.darkBlue,
                      boxSizing: 'border-box',
                      fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                      fontSize: isMobileReview ? 14 : previewDesktopFontSize,
                      lineHeight: isMobileReview ? 1.8 : previewDesktopLineHeight,
                      background: isMobileReview ? colours.grey : 'transparent',
                      minHeight: isMobileReview ? 'calc(100% - 52px)' : 'auto',
                      transform: !isMobileReview && cclPreviewZoom < 1 ? `scale(${cclPreviewZoom})` : undefined,
                      transformOrigin: !isMobileReview ? 'top left' : undefined,
                    }}>
                      {showSetupInDefaultView ? (
                        <DocumentRenderer
                        template={introPreviewTemplate}
                          fieldValues={setupDisplayFields}
                          interactiveFieldKeys={[]}
                          activeFieldKey={setupActiveFieldKey}
                          placeholderLabels={placeholderLabels}
                          fieldStates={previewFieldStates}
                          fieldElementRefs={cclReviewFieldElementRefs}
                          editableFieldKey={null}
                          onFieldValueChange={undefined}
                          onFieldClick={undefined}
                          rootRef={cclRendererRootRef}
                          pageBreaks={isMobileReview ? undefined : cclIntroPageBreaks}
                          totalPages={cclIntroTotalPages}
                          currentPageNumber={previewCurrentPage}
                          hoveredPageNumber={cclHoveredPreviewPage}
                          contentPaddingX={previewDocumentPaddingX}
                          contentPaddingY={isMobileReview ? { top: 26, bottom: 44 } : { top: 42, bottom: 84 }}
                          firstPageHeader={previewFirstPageHeader}
                          firstPageFooter={previewFirstPageFooter}
                        />
                    ) : showReviewIntro ? (
                        <DocumentRenderer
                          template={introPreviewTemplate}
                          fieldValues={structuredReviewFields}
                          interactiveFieldKeys={[]}
                          activeFieldKey={null}
                          placeholderLabels={placeholderLabels}
                          fieldStates={{}}
                          fieldElementRefs={cclReviewFieldElementRefs}
                          editableFieldKey={null}
                          onFieldValueChange={undefined}
                          onFieldClick={undefined}
                          rootRef={cclRendererRootRef}
                          pageBreaks={isMobileReview ? undefined : cclIntroPageBreaks}
                          totalPages={cclIntroTotalPages}
                          currentPageNumber={previewCurrentPage}
                          hoveredPageNumber={cclHoveredPreviewPage}
                          contentPaddingX={previewDocumentPaddingX}
                          contentPaddingY={isMobileReview ? { top: 26, bottom: 44 } : { top: 42, bottom: 84 }}
                          firstPageHeader={previewFirstPageHeader}
                          firstPageFooter={previewFirstPageFooter}
                        />
                    ) : (
                        <DocumentRenderer
                          template={rawPreviewTemplate}
                          fieldValues={structuredReviewFields}
                          interactiveFieldKeys={allClickableFieldKeys}
                          activeFieldKey={selectedFieldKey}
                          placeholderLabels={placeholderLabels}
                          fieldStates={previewFieldStates}
                          fieldElementRefs={cclReviewFieldElementRefs}
                          editableFieldKey={structuredChoiceConfig ? null : selectedFieldKey}
                          onFieldValueChange={!structuredChoiceConfig ? (_fieldKey, value) => applySelectedFieldValue(value) : undefined}
                          onFieldClick={(fieldKey) => setFocusedReviewField(fieldKey === selectedFieldKey ? null : fieldKey)}
                          rootRef={cclRendererRootRef}
                          pageBreaks={isMobileReview ? undefined : cclPageBreaks}
                          totalPages={cclTotalPages}
                          currentPageNumber={previewCurrentPage}
                          hoveredPageNumber={cclHoveredPreviewPage}
                          contentPaddingX={previewDocumentPaddingX}
                          contentPaddingY={isMobileReview ? undefined : { top: 48, bottom: 84 }}
                          firstPageHeader={previewFirstPageHeader}
                          firstPageFooter={previewFirstPageFooter}
                        />
                    )}
                    </div>
                    </div>
                    </div>
                  </div>
                  </div>

                {(showReviewIntro || showSetupInDefaultView) && (
                  <div style={{
                    borderLeft: isMobileReview ? 'none' : '1px solid rgba(135, 243, 243, 0.08)',
                    borderTop: isMobileReview ? '1px solid rgba(135, 243, 243, 0.12)' : 'none',
                    background: 'rgba(6, 23, 51, 0.98)',
                    padding: isMobileReview ? '22px 18px 20px' : '34px 32px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 18,
                    minWidth: 0,
                  }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 10, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                        CCL Review
                      </div>
                      <div style={{ fontSize: isMobileReview ? 24 : 30, lineHeight: 1.1, fontWeight: 700, color: '#f3f4f6' }}>
                        {showSetupInDefaultView
                          ? setupHeaderTitle
                          : loadingReviewContext ? introHeadline : visibleReviewFieldCount > 0 ? `${visibleReviewFieldCount} point${visibleReviewFieldCount === 1 ? '' : 's'} to check` : 'Review draft'}
                      </div>
                      <div style={{ fontSize: isMobileReview ? 13 : 14, lineHeight: 1.65, color: '#d1d5db', maxWidth: 360 }}>
                        {showSetupInDefaultView ? setupHeaderBody : introBody}
                      </div>
                    </div>

                    {showSetupInDefaultView ? (
                      <div style={{ display: 'grid', gap: 14, padding: isMobileReview ? '12px 0 0' : '14px 0 0' }}>
                        {setupFlowStrip}
                        {(launchDraftError || launchPressureErrored || cclPressureTestError) && (
                          <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: isMobileReview ? 11 : 10, color: colours.cta, lineHeight: 1.5 }}>
                            {launchDraftError || cclPressureTestError}
                          </div>
                        )}
                        {!!retryDraftFetch && (
                          <button
                            type="button"
                            onClick={retryDraftFetch}
                            style={{
                              justifySelf: 'start',
                              border: '1px solid rgba(135, 243, 243, 0.28)',
                              background: 'rgba(135, 243, 243, 0.08)',
                              color: '#f3f4f6',
                              padding: '10px 12px',
                              fontSize: isMobileReview ? 12 : 11,
                              fontWeight: 700,
                              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                              cursor: 'pointer',
                            }}
                          >
                            Retry draft fetch
                          </button>
                        )}
                        <div style={{ fontSize: 11, color: colours.subtleGrey, lineHeight: 1.55 }}>
                          {draftFetchError
                            ? 'The draft service did not respond. Check your connection or retry.'
                            : launchPressureRunning
                              ? 'The draft stays open while the current field is checked against source evidence.'
                              : launchIsStreamingNow
                                ? 'Generating review context. The draft will appear as fields are produced.'
                                : launchTraceLoading
                                  ? 'Checking for saved review data before a fresh review pass starts.'
                                  : !launchHasAiData
                                    ? 'Generating review context. The draft will appear as fields are produced.'
                                    : 'The review will settle into the standard workspace as soon as setup completes.'}
                        </div>
                        {aiRes?.durationMs && (
                          <div style={{ fontSize: 10, color: colours.subtleGrey, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            Draft prepared in {(aiRes.durationMs / 1000).toFixed(1)}s
                          </div>
                        )}
                      </div>
                    ) : loadingReviewContext && (
                      <div style={{ display: 'grid', gap: 12, padding: '16px 0 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 18,
                            height: 18,
                            border: '2px solid rgba(135, 243, 243, 0.12)',
                            borderTopColor: colours.accent,
                            borderRadius: '50%',
                            animation: 'helix-spin 0.8s linear infinite',
                            flexShrink: 0,
                          }} />
                          <div style={{ fontSize: 12, color: '#f3f4f6', fontWeight: 600 }}>
                            {cclAiStreamLog.length > 0
                              ? `${cclAiStreamLog.length} field${cclAiStreamLog.length === 1 ? '' : 's'} generated so far`
                              : (aiStatusMessage || 'Loading matter context…')}
                          </div>
                        </div>
                        <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{
                            width: '50%',
                            height: '100%',
                            background: `linear-gradient(90deg, transparent, ${colours.accent}, transparent)`,
                            animation: 'cclLoadBar 1.8s ease-in-out infinite',
                          }} />
                        </div>
                      </div>
                    )}

                    {noAiReviewContext && !showSetupInDefaultView && (
                      <div style={{ display: 'grid', gap: 12, padding: '8px 0 0' }}>
                        <div style={{ fontSize: 11, lineHeight: 1.55, color: colours.subtleGrey }}>
                          No saved AI run was found for this draft yet. Generate one now and the review workspace will open with the right checkpoints already prepared.
                        </div>
                        <button
                          type="button"
                          onClick={() => runHomeCclAiAutofill(cclLetterModal)}
                          disabled={cclAiFillingMatter === cclLetterModal}
                          style={{
                            fontSize: isMobileReview ? 13 : 12,
                            fontWeight: 700,
                            color: '#061733',
                            background: colours.accent,
                            padding: isMobileReview ? '14px 14px' : '12px 14px',
                            cursor: cclAiFillingMatter === cclLetterModal ? 'wait' : 'pointer',
                            textAlign: 'center' as const,
                            border: 'none',
                            minHeight: isMobileReview ? 48 : 'auto',
                          }}
                        >
                          {cclAiFillingMatter === cclLetterModal ? 'Generating AI review…' : 'Generate AI review'}
                        </button>
                      </div>
                    )}

                    {showSummaryLanding && !showSetupInDefaultView && (
                      <div style={{ display: 'grid', gap: 14, padding: isMobileReview ? '12px 0 0' : '14px 0 0' }}>
                        {devMetaStrip}
                        {visibleReviewFieldCount === 0 && (
                          <div style={{ fontSize: 11, color: colours.subtleGrey, lineHeight: 1.55 }}>
                            The draft is ready for a final read-through.
                          </div>
                        )}
                        {overrideExpandedCard}

                        <button
                          type="button"
                          onClick={beginReviewFromIntro}
                          style={{
                            fontSize: isMobileReview ? 14 : 13,
                            fontWeight: 700,
                            color: '#061733',
                            background: colours.accent,
                            padding: isMobileReview ? '15px 16px' : '13px 16px',
                            cursor: 'pointer',
                            textAlign: 'center' as const,
                            border: 'none',
                            minHeight: isMobileReview ? 50 : 'auto',
                            transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(135, 243, 243, 0.2)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          {visibleReviewFieldCount > 0 ? `Start review (${visibleReviewFieldCount})` : 'Open review workspace'}
                        </button>

                        {overrideStartAgainLink && (
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4 }}>
                            {overrideStartAgainLink}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {shouldShowReviewRail && (
                  <div style={{
                    borderLeft: !isMobileReview ? '1px solid rgba(135, 243, 243, 0.08)' : 'none',
                    borderTop: isMobileReview ? '1px solid rgba(135, 243, 243, 0.12)' : 'none',
                    overflow: 'auto',
                    scrollbarGutter: 'stable',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(2, 6, 23, 0.96)',
                    position: isMobileReview ? 'absolute' : 'relative',
                    left: isMobileReview ? 0 : 'auto',
                    right: isMobileReview ? 0 : 'auto',
                    bottom: isMobileReview ? 0 : 'auto',
                    height: reviewPaneHeight,
                    maxHeight: isMobileReview ? '50vh' : 'none',
                    boxShadow: isMobileReview ? '0 -16px 32px rgba(0, 3, 25, 0.42)' : 'none',
                  }} className="ccl-review-scroll">
                    <div key={`rail-header:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '16px 16px 14px' : '22px 24px 18px', flexShrink: 0, animation: 'opsDashFadeIn 0.24s ease both' }}>
                      {isMobileReview && (
                        <div style={{ width: 44, height: 4, background: 'rgba(148,163,184,0.42)', borderRadius: 999, margin: '0 auto 10px' }} />
                      )}
                      {selectedFieldKey && selectedFieldMeta ? (
                        <>
                          <CclReviewFieldHeader
                            isMobile={isMobileReview}
                            currentDecisionNumber={currentDecisionNumber}
                            totalDecisions={selectedFieldSequenceCount || visibleReviewFieldCount}
                            fieldType={reviewFieldTypeMap[selectedFieldKey] || null}
                            fieldLabel={selectedFieldMeta.label}
                            fieldGroup={selectedFieldMeta.group}
                            decisionReason={selectedFieldDecisionReason}
                            pressureTest={selectedFieldPressureTest}
                            pressureTestSources={selectedFieldPressureTestResponse?.dataSources}
                            pressureTestTraceId={selectedFieldPressureTestResponse?.aiTraceId ?? null}
                            pressureTestPromptVersion={selectedFieldPressureTestResponse?.promptVersion}
                          />
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            CCL Review
                          </div>
                          <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', marginTop: 6, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {showSetupInDefaultView && <span style={{ width: 7, height: 7, borderRadius: '50%', background: launchPressureErrored ? colours.cta : launchPressureRunning ? colours.orange : colours.accent, display: 'inline-block', animation: 'cclLaunchDotPulse 1.1s ease-in-out infinite', flexShrink: 0 }} />}
                            <span>{showSetupInDefaultView ? setupHeaderTitle : aiState.title}</span>
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, marginTop: 6, lineHeight: 1.45 }}>
                            {showSetupInDefaultView ? setupHeaderBody : aiState.detail}
                          </div>
                          {showSetupInDefaultView && aiRes?.durationMs && (
                            <div style={{ fontSize: 10, color: colours.subtleGrey, marginTop: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              Draft prepared in {(aiRes.durationMs / 1000).toFixed(1)}s
                            </div>
                          )}
                        </>
                      )}
                    </div>

                      {visibleReviewFieldCount > 0 && !loadingReviewContext && !selectedFieldKey && !showSetupInDefaultView && (
                        <div style={{ padding: '0 24px 12px', display: 'grid', gap: 6, flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: isMobileReview ? 11 : 10.5, color: colours.subtleGrey, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Progress
                            </span>
                            <span style={{ fontSize: isMobileReview ? 11 : 10.5, color: reviewedDecisionCount === visibleReviewFieldCount ? colours.green : '#d1d5db', fontWeight: 700 }}>
                              {reviewedDecisionCount}/{visibleReviewFieldCount}
                            </span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${selectionProgressPercent}%`, height: '100%', background: reviewedDecisionCount === visibleReviewFieldCount ? colours.green : colours.accent, transition: 'width 0.18s ease' }} />
                          </div>
                        </div>
                      )}

                    <div key={`rail-body:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '14px 16px' : '14px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, alignContent: 'start', animation: 'opsDashFadeIn 0.24s ease both' }}>
                      {showSetupInDefaultView && (() => {
                        const railStepStrip = (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 6 }}>
                            {launchSteps.map((step, i) => {
                              const isDone = step.status === 'done';
                              const isActive = step.status === 'active';
                              const isError = step.status === 'error';
                              const dotColor = isDone ? colours.green : isActive ? colours.accent : isError ? colours.cta : colours.subtleGrey;
                              const labelColor = isDone ? 'rgba(32,178,108,0.72)' : isActive ? '#f3f4f6' : isError ? colours.cta : colours.subtleGrey;
                              const lineColor = isDone ? 'rgba(32,178,108,0.28)' : 'rgba(160,160,160,0.18)';
                              return (
                                <React.Fragment key={step.label}>
                                  {i > 0 && <div style={{ width: 14, height: 1, background: lineColor, flexShrink: 0 }} />}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                    <div style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: dotColor,
                                      flexShrink: 0,
                                      ...(isActive ? { animation: 'cclLaunchDotPulse 1.1s ease-in-out infinite' } : {}),
                                    }} />
                                    <span style={{ fontSize: isMobileReview ? 10 : 9.5, fontWeight: isActive ? 700 : 500, color: labelColor, whiteSpace: 'nowrap' }}>
                                      {step.label}
                                    </span>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        );
                        return (
                          <div style={{ display: 'grid', gap: 12 }}>
                            {railStepStrip}
                            {(launchDraftError || launchPressureErrored || cclPressureTestError) && (
                              <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: isMobileReview ? 11 : 10, color: colours.cta, lineHeight: 1.5 }}>
                                {launchDraftError || cclPressureTestError}
                              </div>
                            )}
                            {!!retryDraftFetch && (
                              <button
                                type="button"
                                onClick={retryDraftFetch}
                                style={{
                                  justifySelf: 'start',
                                  border: '1px solid rgba(135, 243, 243, 0.28)',
                                  background: 'rgba(135, 243, 243, 0.08)',
                                  color: '#f3f4f6',
                                  padding: '8px 10px',
                                  fontSize: isMobileReview ? 11.5 : 10.5,
                                  fontWeight: 700,
                                  fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                  cursor: 'pointer',
                                }}
                              >
                                Retry draft fetch
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {!showSetupInDefaultView && (
                      <>
                      {showReviewRailSkeleton && (
                        <>
                          <div style={{
                            padding: 0,
                            display: 'grid',
                            gap: 10,
                            animation: 'opsDashFadeIn 0.22s ease 0.03s both',
                          }}>
                            {isStreamingNow ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{
                                    width: 16, height: 16, flexShrink: 0,
                                    border: '2px solid rgba(135, 243, 243, 0.12)',
                                    borderTopColor: colours.accent,
                                    borderRadius: '50%',
                                    animation: 'helix-spin 0.8s linear infinite',
                                  }} />
                                  <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, fontWeight: 600 }}>
                                    {cclAiStreamLog.length > 0
                                      ? `${cclAiStreamLog.length} field${cclAiStreamLog.length === 1 ? '' : 's'} generated`
                                      : (aiStatusMessage || 'Loading matter context…')}
                                  </div>
                                </div>
                                <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                  <div style={{
                                    width: '50%', height: '100%',
                                    background: `linear-gradient(90deg, transparent, ${colours.accent}, transparent)`,
                                    animation: 'cclLoadBar 1.8s ease-in-out infinite',
                                  }} />
                                </div>
                              </>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 16, height: 16, flexShrink: 0,
                                  border: '2px solid rgba(135, 243, 243, 0.12)',
                                  borderTopColor: colours.accent,
                                  borderRadius: '50%',
                                  animation: 'helix-spin 0.8s linear infinite',
                                }} />
                                <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.subtleGrey, fontWeight: 600 }}>
                                  Loading saved review…
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {noAiReviewContext && (
                        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Generate Review
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                            No saved AI run was found for this draft yet. You can still read the letter on the left, or generate AI review context now.
                          </div>
                          <button
                            type="button"
                            onClick={() => runHomeCclAiAutofill(cclLetterModal)}
                            disabled={cclAiFillingMatter === cclLetterModal}
                            style={{
                              fontSize: isMobileReview ? 13 : 12,
                              fontWeight: 700,
                              color: '#061733',
                              background: colours.accent,
                              padding: isMobileReview ? '14px 14px' : '11px 14px',
                              cursor: cclAiFillingMatter === cclLetterModal ? 'wait' : 'pointer',
                              textAlign: 'center' as const,
                              border: 'none',
                              minHeight: isMobileReview ? 48 : 'auto',
                            }}
                          >
                            {cclAiFillingMatter === cclLetterModal ? 'Generating AI review…' : 'Generate AI review'}
                          </button>
                        </div>
                      )}

                      {showSummaryLanding && (
                        <div style={{ display: 'grid', gap: 12, animation: 'opsDashFadeIn 0.35s ease both' }}>
                          {devMetaStrip}
                          {/* Field count + duration */}
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: isMobileReview ? 16 : 15, fontWeight: 700, color: '#f3f4f6' }}>
                              {totalAiFields} fields generated
                            </div>
                            {aiRes?.durationMs && (
                              <div style={{ fontSize: 10, color: colours.subtleGrey, flexShrink: 0 }}>
                                {(aiRes.durationMs / 1000).toFixed(1)}s
                              </div>
                            )}
                          </div>

                          {/* Confidence breakdown — muted single line */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: colours.subtleGrey }}>
                            {confidenceBreakdown.data > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, background: 'rgba(32,178,108,0.6)', borderRadius: '50%' }} />
                                {confidenceBreakdown.data} data
                              </span>
                            )}
                            {confidenceBreakdown.inferred > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, background: 'rgba(255,140,0,0.6)', borderRadius: '50%' }} />
                                {confidenceBreakdown.inferred} inferred
                              </span>
                            )}
                            {confidenceBreakdown.templated > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, background: 'rgba(54,144,206,0.6)', borderRadius: '50%' }} />
                                {confidenceBreakdown.templated} templated
                              </span>
                            )}
                            {confidenceBreakdown.unknown > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, background: 'rgba(214,85,65,0.6)', borderRadius: '50%' }} />
                                {confidenceBreakdown.unknown} unknown
                              </span>
                            )}
                          </div>

                          {/* Review summary line */}
                          <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                            {visibleReviewFieldCount > 0
                              ? (setWordingCount > 0 && verifyCount > 0
                                ? <><strong style={{ color: '#f3f4f6' }}>{setWordingCount} to write</strong>, <strong style={{ color: colours.orange }}>{verifyCount} to verify</strong>.</>
                                : verifyCount > 0
                                  ? <><strong style={{ color: colours.orange }}>{verifyCount} to verify</strong> — review pressure test results. The rest lined up with the evidence.</>
                                  : hasPtResult && verifyCount === 0 && setWordingCount > 0
                                    ? <><strong style={{ color: '#f3f4f6' }}>{setWordingCount} to write</strong>. Everything else passed Safety Net.</>
                                    : <><strong style={{ color: '#f3f4f6' }}>{visibleReviewFieldCount}</strong> still to sign off.</>)
                              : 'All fields backed by hard data or standard templates.'}
                          </div>

                          {ptPending && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 12, height: 12, border: '1.5px solid rgba(135,243,243,0.15)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite', flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color: colours.subtleGrey }}>Safety Net verifying…</span>
                            </div>
                          )}

                          {/* Data sources */}
                          {aiRes?.dataSources && aiRes.dataSources.length > 0 && (
                            <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                              Sources: {aiRes.dataSources.join(', ')}
                            </div>
                          )}

                          {/* Begin Review CTA */}
                          <button
                            type="button"
                            onClick={beginReviewFromIntro}
                            style={{
                              fontSize: isMobileReview ? 13 : 12,
                              fontWeight: 700,
                              color: '#f3f4f6',
                              background: 'transparent',
                              padding: isMobileReview ? '12px 14px' : '10px 14px',
                              cursor: 'pointer',
                              textAlign: 'center' as const,
                              border: `1px solid ${colours.accent}`,
                              minHeight: isMobileReview ? 48 : 'auto',
                              marginTop: 4,
                            }}
                          >
                            {visibleReviewFieldCount > 0 ? `Start review (${visibleReviewFieldCount})` : 'Review letter'}
                          </button>
                        </div>
                      )}

                      {showQueuedReviewLanding && (
                        <div style={{ display: 'grid', gap: 12, animation: 'opsDashFadeIn 0.24s ease both' }}>
                          {devMetaStrip}
                          <div style={{ display: 'grid', gap: 5 }}>
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                              Remaining Points
                            </div>
                            <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', lineHeight: 1.3 }}>
                              {visibleReviewFieldCount} point{visibleReviewFieldCount === 1 ? '' : 's'} left
                            </div>
                            {setWordingCount > 0 && verifyCount > 0 ? (
                              <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                                {setWordingCount} to set, {verifyCount} surfaced by Safety Net for review.
                              </div>
                            ) : verifyCount > 0 ? (
                              <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                                {verifyCount} field{verifyCount === 1 ? '' : 's'} surfaced by Safety Net for review.
                              </div>
                            ) : (
                              <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                                Open the next point when ready, or click straight into the letter.
                              </div>
                            )}
                            {overrideSummaryCard}
                            {ptPending && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <div style={{ width: 12, height: 12, border: '1.5px solid rgba(135,243,243,0.15)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite', flexShrink: 0 }} />
                                <span style={{ fontSize: isMobileReview ? 10 : 9.5, color: colours.subtleGrey }}>Safety Net verifying…</span>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {nextQueuedFieldKey && (
                              <button
                                type="button"
                                onClick={() => setFocusedReviewField(nextQueuedFieldKey)}
                                style={{
                                  fontSize: isMobileReview ? 13 : 12,
                                  fontWeight: 700,
                                  color: '#061733',
                                  background: colours.accent,
                                  padding: isMobileReview ? '14px 14px' : '11px 14px',
                                  cursor: 'pointer',
                                  textAlign: 'center' as const,
                                  border: 'none',
                                  minHeight: isMobileReview ? 48 : 'auto',
                                }}
                              >
                                Open first point
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setFocusedReviewField(null)}
                              style={{
                                fontSize: isMobileReview ? 13 : 12,
                                fontWeight: 700,
                                color: '#d1d5db',
                                background: 'transparent',
                                padding: isMobileReview ? '14px 14px' : '11px 14px',
                                cursor: 'pointer',
                                textAlign: 'center' as const,
                                border: '1px solid rgba(255,255,255,0.12)',
                                minHeight: isMobileReview ? 48 : 'auto',
                              }}
                            >
                              Stay on full letter
                            </button>
                          </div>
                          {overrideStartAgainLink && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -2 }}>
                              {overrideStartAgainLink}
                            </div>
                          )}
                          {!ptResultHere && ptCanRun && !ptPending && (
                            <div style={{ fontSize: isMobileReview ? 10 : 9.5, color: colours.subtleGrey, lineHeight: 1.5 }}>
                              Run Safety Net if you want a second-pass evidence check before sign-off.
                            </div>
                          )}
                        </div>
                      )}

                      {noClarificationsQueued && (
                        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                          {(compileSummaryHere || generationFieldCount > 0 || ptResultHere) && (
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Pipeline Insight
                              </div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                {compileSummaryHere && (
                                  <div style={{ padding: '8px 10px', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)'}`, background: isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.05)' }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>
                                      Compiled {compileSummaryHere.readyCount || 0}/{compileSummaryHere.sourceCount || 0} evidence sources ready
                                    </div>
                                    <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                      {compileSummaryHere.limitedCount || 0} limited, {compileSummaryHere.missingCount || 0} missing, {compileSummaryHere.contextFieldCount || 0} context fields, {compileSummaryHere.snippetCount || 0} evidence snippets.
                                      {compiledAtHere ? ` Compiled ${new Date(compiledAtHere).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}
                                    </div>
                                  </div>
                                )}
                                {generationFieldCount > 0 && (
                                  <div style={{ padding: '8px 10px', border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.12)'}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.025)' }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#d1d5db' }}>
                                      Generated {generationFieldCount} field{generationFieldCount === 1 ? '' : 's'}
                                    </div>
                                    <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                      Confidence {generationConfidence || 'unknown'}{typeof ccl?.unresolvedCount === 'number' ? `, ${ccl.unresolvedCount} unresolved placeholder${ccl.unresolvedCount === 1 ? '' : 's'}.` : '.'}
                                    </div>
                                  </div>
                                )}
                                {ptResultHere && !ptRunningHere && (
                                  <div style={{ padding: '8px 10px', border: `1px solid ${ptResultHere.flaggedCount > 0 ? colours.orange : colours.green}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.025)' }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: ptResultHere.flaggedCount > 0 ? colours.orange : colours.green }}>
                                      Pressure tested {ptResultHere.totalFields} field{ptResultHere.totalFields === 1 ? '' : 's'}
                                    </div>
                                    <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                      {ptResultHere.flaggedCount} surfaced for fee-earner review against source evidence.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Review Status
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#d1d5db', lineHeight: 1.45, fontWeight: 700 }}>
                            No review points are waiting.
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                            {ptResultHere
                              ? ptResultHere.flaggedCount > 0
                                ? `Safety Net checked ${ptResultHere.totalFields} fields and surfaced ${ptResultHere.flaggedCount} for review. The formatted letter stays open on the left.`
                                : `Safety Net checked ${ptResultHere.totalFields} fields and found no further review points. The formatted letter is ready on the left.`
                              : 'Review the letter on the left, or run Safety Net if you want a second-pass evidence check before sign-off.'}
                          </div>
                          {ptCanRun && (
                            <button
                              type="button"
                              onClick={() => void runPressureTest(cclLetterModal, { silent: true })}
                              style={{
                                fontSize: isMobileReview ? 13 : 12,
                                fontWeight: 700,
                                color: '#061733',
                                background: colours.accent,
                                padding: isMobileReview ? '14px 14px' : '11px 14px',
                                cursor: 'pointer',
                                textAlign: 'center' as const,
                                border: 'none',
                                minHeight: isMobileReview ? 48 : 'auto',
                              }}
                            >
                              Run Safety Net
                            </button>
                          )}
                          {ptResultHere && !ptRunningHere && (() => {
                            const ptScores = Object.values(ptResultHere.fieldScores);
                            const ptAvg = ptScores.length > 0 ? ptScores.reduce((sum, s) => sum + s.score, 0) / ptScores.length : 0;
                            const ptRounded = Math.round(ptAvg * 10) / 10;
                            const ptColour = ptRounded >= 8 ? colours.green : ptRounded >= 5 ? colours.orange : colours.cta;
                            return (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '6px 10px',
                                  border: `1px solid ${ptColour}`,
                                  color: ptColour,
                                  fontSize: 10.5, fontWeight: 700,
                                }}>
                                  Safety Net {ptRounded}/10
                                </div>
                                {ptResultHere.flaggedCount > 0 && (
                                  <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '6px 10px',
                                    border: `1px solid ${colours.orange}`,
                                    color: colours.orange,
                                    fontSize: 10.5, fontWeight: 600,
                                  }}>
                                    {ptResultHere.flaggedCount} flagged
                                  </div>
                                )}
                                {ptResultHere.dataSources?.length > 0 && (
                                  <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 2, width: '100%' }}>
                                    Sources: {ptResultHere.dataSources.join(', ')}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      </>
                      )}

                      {/* Safety Net in-progress feedback */}
                      {ptRunningHere && !selectedFieldKey && (
                        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                              Safety Net
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: colours.subtleGrey, fontVariantNumeric: 'tabular-nums' }}>
                              {(cclPressureTestElapsed / 1000).toFixed(1)}s
                            </span>
                          </div>
                          {cclPressureTestSteps.map(step => (
                            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>
                                {step.status === 'done' ? <span style={{ color: colours.green }}>✓</span>
                                  : step.status === 'active' ? (
                                    <div style={{
                                      width: 12, height: 12,
                                      border: '2px solid rgba(135,243,243,0.12)',
                                      borderTopColor: colours.accent,
                                      borderRadius: '50%',
                                      animation: 'helix-spin 0.8s linear infinite',
                                    }} />
                                  )
                                  : step.status === 'error' ? <span style={{ color: colours.cta }}>✗</span>
                                  : <span style={{ color: colours.subtleGrey }}>·</span>}
                              </span>
                              <span style={{
                                fontSize: 11, lineHeight: 1.45,
                                color: step.status === 'active' ? '#f3f4f6' : step.status === 'done' ? colours.green : step.status === 'error' ? colours.cta : colours.subtleGrey,
                                fontWeight: step.status === 'active' ? 700 : 500,
                              }}>
                                {step.label}
                              </span>
                            </div>
                          ))}
                          {cclPressureTestError && (
                            <div style={{
                              marginTop: 2, padding: '6px 10px',
                              background: 'rgba(214,85,65,0.1)',
                              border: '1px solid rgba(214,85,65,0.25)',
                              fontSize: 10.5, color: colours.cta, lineHeight: 1.4,
                            }}>
                              {cclPressureTestError}
                            </div>
                          )}
                          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{
                              width: '50%', height: '100%',
                              background: `linear-gradient(90deg, transparent, ${colours.accent}, transparent)`,
                              animation: 'cclLoadBar 1.8s ease-in-out infinite',
                            }} />
                          </div>
                        </div>
                      )}

                      {selectedFieldKey && selectedFieldMeta && (
                        <>
                          <CclReviewQueueStrip
                            isMobile={isMobileReview}
                            items={queueStripItems}
                            currentKey={selectedFieldKey}
                            onJump={jumpToDecision}
                          />
                          <CclReviewDecisionPanel
                            isMobile={isMobileReview}
                            choiceConfig={structuredChoiceConfig}
                            selectedFieldOutput={selectedFieldOutput}
                            selectedFieldIsReviewed={selectedFieldIsReviewed}
                            hasNextDecision={!!nextDecisionFieldKey}
                            hasPreviousDecision={!!previousDecisionFieldKey}
                            isFirstDecision={currentDecisionNumber <= 1}
                            canApprove={canApprove && !nextDecisionFieldKey}
                            isApproving={cclApprovingMatter === cclLetterModal}
                            approvalLabel={cclApprovingMatter === cclLetterModal ? (cclApprovalStep || 'Approving…') : 'Approve full letter'}
                            onSelectChoice={applyStructuredChoice}
                            onTextChange={(value, element) => {
                              autoSizeReviewTextarea(element);
                              applySelectedFieldValue(value);
                            }}
                            textareaRef={autoSizeReviewTextarea}
                            onToggleReviewed={() => {
                              if (!selectedFieldKey) return;
                              toggleFieldReviewed(selectedFieldKey);
                              if (!selectedFieldIsReviewed) focusNextDecision();
                            }}
                            onApprove={handleApproveCurrentLetter}
                            onBack={() => setFocusedReviewField(null)}
                            onPrevious={focusPreviousDecision}
                            onNext={focusNextDecision}
                          />

                          {canSeeCclDevPanel && (
                            <CclReviewDevTools
                              isMobile={isMobileReview}
                              generationSources={aiRes?.dataSources || []}
                              safetyNetSources={ptResultHere?.dataSources || []}
                              callsSent={(aiRes?.dataSources || []).some((source: string) => /call/i.test(source))}
                              callsVerified={(ptResultHere?.dataSources || []).some((source: string) => /call/i.test(source))}
                              callsSkipped={(aiRes?.dataSources || []).some((source: string) => /no phone/i.test(source))}
                              selectedFieldLabel={selectedFieldMeta.label}
                              selectedFieldToken={selectedFieldKey ? `{{${selectedFieldKey}}}` : ''}
                              selectedFieldOutput={selectedFieldOutput}
                              selectedFieldCueLabel={selectedFieldCue.label}
                              selectedFieldCueTone={selectedFieldCueTone}
                              selectedFieldDataFedRows={selectedFieldDataFedRows}
                              selectedFieldPromptSections={selectedFieldPromptSections}
                              selectedFieldSnippetRows={selectedFieldSnippetRows}
                              systemPromptText={systemPromptText}
                              userPromptText={userPromptText}
                              visiblePromptTab={visiblePromptTab}
                              onSelectPromptTab={(tab) => setCclSessionPromptTabByMatter((prev) => ({ ...prev, [cclLetterModal]: tab }))}
                              godModeVisible={godModeVisible}
                              godModeFieldOptions={godModeFieldOptionsWithLabels}
                              godModeSelectedFieldKey={godModeSelectedFieldKey}
                              godModeDraftValue={godModeDraftValue}
                              onToggleGodMode={() => {
                                const nextVisible = !godModeVisible;
                                setCclGodModeVisibleByMatter((prev) => ({ ...prev, [cclLetterModal]: nextVisible }));
                                if (nextVisible && !cclGodModeFieldByMatter[cclLetterModal] && godModeFieldOptions[0]) {
                                  setGodModeField(godModeFieldOptions[0]);
                                }
                              }}
                              onGodModeFieldChange={setGodModeField}
                              onGodModeValueChange={(value) => setCclGodModeValueByMatter((prev) => ({ ...prev, [cclLetterModal]: value }))}
                              onGodModeApply={applyGodModeDraftValue}
                              onGodModeReload={() => setGodModeField(godModeSelectedFieldKey)}
                              onGodModeDelete={deleteGodModeDraftField}
                            />
                          )}
                        </>
                      )}
                    </div>

                    <div style={{ padding: isMobileReview ? '14px 16px max(16px, env(safe-area-inset-bottom))' : '14px 24px 18px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'grid', gap: 10, flexShrink: 0, background: 'rgba(2, 6, 23, 0.98)', position: 'sticky', bottom: 0, animation: 'opsDashFadeIn 0.2s ease 0.24s both' }}>
                      {!selectedFieldKey && (
                        <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                          {loadingReviewContext
                            ? 'Generating review context. The draft will appear as fields are produced.'
                            : showSummaryLanding
                              ? 'Review the summary above, then open the guided review when you are ready.'
                              : noAiReviewContext
                                ? 'Use Generate AI review if you want guided checking for this draft. Otherwise you can review the letter manually.'
                                : noClarificationsQueued
                                  ? 'No further side-panel action is needed unless you want to approve the current preview letter.'
                                  : 'Stay in this workspace while you work through the guided review steps.'}
                        </div>
                      )}
                      {!selectedFieldKey && noClarificationsQueued && canApprove && (
                        <button
                          type="button"
                          style={{ fontSize: isMobileReview ? 13 : 12, fontWeight: 700, color: colours.dark.text, background: colours.green, padding: isMobileReview ? '14px 14px' : '11px 14px', cursor: cclApprovingMatter === cclLetterModal ? 'wait' : 'pointer', textAlign: 'center' as const, border: 'none', minHeight: isMobileReview ? 48 : 'auto', opacity: cclApprovingMatter === cclLetterModal ? 0.7 : 1 }}
                          onClick={handleApproveCurrentLetter}
                          disabled={!!cclApprovingMatter}
                        >
                          {cclApprovingMatter === cclLetterModal ? (cclApprovalStep || 'Approving…') : 'Approve current preview letter'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

        return typeof document !== 'undefined' ? createPortal(reviewModal, document.body) : reviewModal;
      } catch (renderErr) {
        console.error('[CCL review modal render error]', renderErr);
        return createPortal(
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 30000,
              background: 'rgba(0, 3, 25, 0.82)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            }}
          >
            <div style={{ textAlign: 'center', color: '#f3f4f6', maxWidth: 420, padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: colours.cta }}>Review failed to render</div>
              <div style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 16 }}>{renderErr instanceof Error ? renderErr.message : 'Unknown error'}</div>
              <button
                type="button"
                onClick={closeCclLetterModal}
                style={{
                  padding: '8px 20px', background: colours.cta, color: colours.dark.text,
                  border: 'none', borderRadius: 0, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Raleway', sans-serif",
                }}
              >
                Close
              </button>
            </div>
          </div>,
          document.body,
        );
      } })()}

      {/* ── Billing Insight Modal ── */}
      {billingInsightIdx !== null && billingInsightMetric && (
        <div
          onClick={() => setBillingInsightIdx(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 3, 25, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'opsDashFadeIn 0.2s ease both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isDarkMode ? colours.darkBlue : '#FFFFFF',
              border: `1px solid ${cardBorder}`,
              boxShadow: 'var(--shadow-overlay)',
              width: '90%',
              maxWidth: 480,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'opsDashFadeIn 0.25s ease 0.05s both',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px 12px',
              borderBottom: `1px solid ${cardBorder}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>
                  {billingInsightTitle}
                </div>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  {isRecoveredInsight
                    ? `${fmt.currency(billingInsightMetric.money || 0)} recovered`
                    : `${fmt.hours(billingInsightMetric.hours || 0)} · ${fmt.currency(billingInsightMetric.money || 0)}`}
                </div>
              </div>
              <span
                onClick={() => setBillingInsightIdx(null)}
                style={{ fontSize: 16, color: muted, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
              >×</span>
            </div>

            {/* Summary strip with current vs previous */}
            <div style={{
              padding: '10px 18px',
              borderBottom: `1px solid ${cardBorder}`,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Current</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: text }}>
                  {isRecoveredInsight ? fmt.currency(billingInsightMetric.money || 0) : fmt.hours(billingInsightMetric.hours || 0)}
                </span>
                {!isRecoveredInsight && <span style={{ fontSize: 10, color: muted }}>{fmt.currency(billingInsightMetric.money || 0)}</span>}
              </div>
              {showPrev && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.6 }}>
                  <span style={{ fontSize: 9, color: muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Previous</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: text }}>
                    {isRecoveredInsight ? fmt.currency(billingInsightMetric.prevMoney || 0) : fmt.hours(billingInsightMetric.prevHours || 0)}
                  </span>
                  {!isRecoveredInsight && <span style={{ fontSize: 10, color: muted }}>{fmt.currency(billingInsightMetric.prevMoney || 0)}</span>}
                </div>
              )}
              {(() => {
                const cur = isRecoveredInsight ? (billingInsightMetric.money || 0) : (billingInsightMetric.hours || 0);
                const prev = isRecoveredInsight ? (billingInsightMetric.prevMoney || 0) : (billingInsightMetric.prevHours || 0);
                const d = cur - prev;
                if (Math.abs(d) < 0.05) return null;
                const color = d > 0 ? colours.green : colours.cta;
                const sign = d > 0 ? '+' : '';
                const fmtFn = isRecoveredInsight ? fmt.currency : fmt.hours;
                return <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 'auto' }}>{sign}{fmtFn(d)}</span>;
              })()}
            </div>

            {/* Day-by-day table */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {!wipDailyData || isRecoveredInsight ? (
                <div style={{ padding: '24px 18px', fontSize: 11, color: muted, textAlign: 'center' }}>
                  {isRecoveredInsight ? 'Monthly summary only — no daily breakdown available.' : 'No daily breakdown available.'}
                </div>
              ) : (
                <>
                  {/* This week */}
                  {billingCurrentRows.length > 0 && (
                    <>
                      <div style={{ padding: '8px 18px 4px', fontSize: 9, fontWeight: 600, color: accent, textTransform: 'uppercase', letterSpacing: '0.4px' }}>This Week</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: theadBg }}>
                            {['Day', 'Hours', 'Value'].map((h) => (
                              <th key={h} style={{ padding: '6px 14px', fontSize: 9, fontWeight: 600, color: theadText, textAlign: h === 'Day' ? 'left' : 'right', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {billingCurrentRows.map((r, i) => {
                            const d = new Date(r.date + 'T00:00:00');
                            const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
                            const dayDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                            const isToday = r.date === new Date().toISOString().split('T')[0];
                            const hasEntries = r.entries && r.entries.length > 0;
                            const isExpanded = expandedDays.has(r.date);
                            return (
                              <React.Fragment key={r.date}>
                                <tr
                                  style={{
                                    background: isToday ? hoverBg : 'transparent',
                                    transition: 'background 0.15s ease',
                                    animation: `opsDashRowFade 0.2s ease ${0.03 * i}s both`,
                                    cursor: hasEntries ? 'pointer' : 'default',
                                  }}
                                  onClick={() => {
                                    if (!hasEntries) return;
                                    setExpandedDays((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(r.date)) next.delete(r.date); else next.add(r.date);
                                      return next;
                                    });
                                  }}
                                  onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = hoverBg; }}
                                  onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <td style={{ padding: '6px 14px', fontSize: 11, color: isToday ? accent : text, fontWeight: isToday ? 600 : 400, borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {hasEntries && <span style={{ display: 'inline-block', width: 12, fontSize: 8, color: muted, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>}
                                    {dayName} <span style={{ color: muted, fontSize: 10 }}>{dayDate}</span>
                                    {hasEntries && <span style={{ fontSize: 9, color: muted, marginLeft: 4 }}>({r.entries.length})</span>}
                                  </td>
                                  <td style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: r.hours > 0 ? text : muted, textAlign: 'right', borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {r.hours > 0 ? fmt.hours(r.hours) : '—'}
                                  </td>
                                  <td style={{ padding: '6px 14px', fontSize: 11, color: r.value > 0 ? text : muted, textAlign: 'right', borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {r.value > 0 ? fmt.currency(r.value) : '—'}
                                  </td>
                                </tr>
                                {isExpanded && (() => {
                                  const groups = new Map<string, WipActivityEntry[]>();
                                  for (const e of r.entries) { const k = e.matter || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(e); }
                                  const groupArr = Array.from(groups.entries());
                                  let ri = 0;
                                  return groupArr.map(([matter, ents], gi) => {
                                    const gH = ents.reduce((s, e) => s + e.hours, 0);
                                    const gV = ents.reduce((s, e) => s + e.value, 0);
                                    const isLastG = gi === groupArr.length - 1;
                                    return (
                                      <React.Fragment key={`${r.date}-g${gi}`}>
                                        <tr style={{ animation: `opsDashRowFade 0.15s ease ${0.02 * ri++}s both` }}>
                                          <td style={{ padding: '4px 14px 2px 26px', fontSize: 10, color: accent, fontWeight: 600, borderBottom: 'none' }}>
                                            {matter}
                                            {ents[0]?.matterDesc && <span style={{ marginLeft: 6, fontWeight: 400, color: muted, fontSize: 9 }}>{ents[0].matterDesc}</span>}
                                            <span style={{ fontSize: 8, color: muted, marginLeft: 4, fontWeight: 400 }}>({ents.length})</span>
                                          </td>
                                          <td style={{ padding: '4px 14px 2px', fontSize: 10, fontWeight: 600, color: gH > 0 ? text : muted, textAlign: 'right', borderBottom: 'none' }}>
                                            {gH > 0 ? fmt.hours(gH) : '—'}
                                          </td>
                                          <td style={{ padding: '4px 14px 2px', fontSize: 10, fontWeight: 600, color: gV > 0 ? text : muted, textAlign: 'right', borderBottom: 'none' }}>
                                            {gV > 0 ? fmt.currency(gV) : '—'}
                                          </td>
                                        </tr>
                                        {ents.map((e, ei) => (
                                          <tr key={`${r.date}-g${gi}-e${ei}`} style={{ animation: `opsDashRowFade 0.12s ease ${0.02 * ri++}s both` }}>
                                            <td style={{ padding: '2px 14px 2px 38px', fontSize: 9, color: muted, borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none' }}>
                                              {e.activity ? <span>{e.activity}</span> : null}
                                              {e.note && <span style={{ marginLeft: e.activity ? 6 : 0, color: isDarkMode ? colours.subtleGrey : colours.greyText }} title={e.note}> {e.note.length > 40 ? e.note.slice(0, 40) + '…' : e.note}</span>}
                                              {!e.activity && !e.note && '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.hours > 0 ? muted : (isDarkMode ? colours.greyText : colours.subtleGrey), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.hours > 0 ? fmt.hours(e.hours) : '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.value > 0 ? muted : (isDarkMode ? colours.greyText : colours.subtleGrey), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.value > 0 ? fmt.currency(e.value) : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </React.Fragment>
                                    );
                                  });
                                })()}
                              </React.Fragment>
                            );
                          })}
                          {/* Total row */}
                          <tr>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: accent, borderBottom: `1px solid ${cardBorder}` }}>Total</td>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: text, textAlign: 'right', borderBottom: `1px solid ${cardBorder}` }}>
                              {fmt.hours(billingCurrentRows.reduce((s, r) => s + r.hours, 0))}
                            </td>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: text, textAlign: 'right', borderBottom: `1px solid ${cardBorder}` }}>
                              {fmt.currency(billingCurrentRows.reduce((s, r) => s + r.value, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  )}
                  {/* Last week */}
                  {showPrev && billingLastRows.length > 0 && (
                    <>
                      <div style={{ padding: '10px 18px 4px', fontSize: 9, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Last Week</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: isDarkMode ? 'rgba(255,255,255,0.01)' : 'rgba(13,47,96,0.03)' }}>
                            {['Day', 'Hours', 'Value'].map((h) => (
                              <th key={h} style={{ padding: '6px 14px', fontSize: 9, fontWeight: 600, color: muted, textAlign: h === 'Day' ? 'left' : 'right', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {billingLastRows.map((r, i) => {
                            const d = new Date(r.date + 'T00:00:00');
                            const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
                            const dayDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                            const hasEntries = r.entries && r.entries.length > 0;
                            const dayKey = `lw-${r.date}`;
                            const isExpanded = expandedDays.has(dayKey);
                            return (
                              <React.Fragment key={r.date}>
                                <tr
                                  style={{
                                    opacity: 0.6,
                                    transition: 'background 0.15s ease',
                                    animation: `opsDashRowFade 0.2s ease ${0.03 * i}s both`,
                                    cursor: hasEntries ? 'pointer' : 'default',
                                  }}
                                  onClick={() => {
                                    if (!hasEntries) return;
                                    setExpandedDays((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(dayKey)) next.delete(dayKey); else next.add(dayKey);
                                      return next;
                                    });
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.opacity = '1'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.6'; }}
                                >
                                  <td style={{ padding: '6px 14px', fontSize: 10, color: text, borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {hasEntries && <span style={{ display: 'inline-block', width: 12, fontSize: 8, color: muted, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>}
                                    {dayName} <span style={{ color: muted, fontSize: 9 }}>{dayDate}</span>
                                    {hasEntries && <span style={{ fontSize: 9, color: muted, marginLeft: 4 }}>({r.entries.length})</span>}
                                  </td>
                                  <td style={{ padding: '6px 14px', fontSize: 10, color: r.hours > 0 ? text : muted, textAlign: 'right', borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {r.hours > 0 ? fmt.hours(r.hours) : '—'}
                                  </td>
                                  <td style={{ padding: '6px 14px', fontSize: 10, color: r.value > 0 ? text : muted, textAlign: 'right', borderBottom: isExpanded ? 'none' : `1px solid ${rowBorder}` }}>
                                    {r.value > 0 ? fmt.currency(r.value) : '—'}
                                  </td>
                                </tr>
                                {isExpanded && (() => {
                                  const groups = new Map<string, WipActivityEntry[]>();
                                  for (const e of r.entries) { const k = e.matter || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(e); }
                                  const groupArr = Array.from(groups.entries());
                                  let ri = 0;
                                  return groupArr.map(([matter, ents], gi) => {
                                    const gH = ents.reduce((s, e) => s + e.hours, 0);
                                    const gV = ents.reduce((s, e) => s + e.value, 0);
                                    const isLastG = gi === groupArr.length - 1;
                                    return (
                                      <React.Fragment key={`${r.date}-g${gi}`}>
                                        <tr style={{ opacity: 0.7, animation: `opsDashRowFade 0.15s ease ${0.02 * ri++}s both` }}>
                                          <td style={{ padding: '4px 14px 2px 26px', fontSize: 10, color: accent, fontWeight: 600, borderBottom: 'none' }}>
                                            {matter}
                                            {ents[0]?.matterDesc && <span style={{ marginLeft: 6, fontWeight: 400, color: muted, fontSize: 9 }}>{ents[0].matterDesc}</span>}
                                            <span style={{ fontSize: 8, color: muted, marginLeft: 4, fontWeight: 400 }}>({ents.length})</span>
                                          </td>
                                          <td style={{ padding: '4px 14px 2px', fontSize: 10, fontWeight: 600, color: gH > 0 ? text : muted, textAlign: 'right', borderBottom: 'none' }}>
                                            {gH > 0 ? fmt.hours(gH) : '—'}
                                          </td>
                                          <td style={{ padding: '4px 14px 2px', fontSize: 10, fontWeight: 600, color: gV > 0 ? text : muted, textAlign: 'right', borderBottom: 'none' }}>
                                            {gV > 0 ? fmt.currency(gV) : '—'}
                                          </td>
                                        </tr>
                                        {ents.map((e, ei) => (
                                          <tr key={`${r.date}-g${gi}-e${ei}`} style={{ opacity: 0.7, animation: `opsDashRowFade 0.12s ease ${0.02 * ri++}s both` }}>
                                            <td style={{ padding: '2px 14px 2px 38px', fontSize: 9, color: muted, borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none' }}>
                                              {e.activity ? <span>{e.activity}</span> : null}
                                              {e.note && <span style={{ marginLeft: e.activity ? 6 : 0, color: isDarkMode ? colours.subtleGrey : colours.greyText }} title={e.note}> {e.note.length > 40 ? e.note.slice(0, 40) + '…' : e.note}</span>}
                                              {!e.activity && !e.note && '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.hours > 0 ? muted : (isDarkMode ? colours.greyText : colours.subtleGrey), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.hours > 0 ? fmt.hours(e.hours) : '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.value > 0 ? muted : (isDarkMode ? colours.greyText : colours.subtleGrey), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.value > 0 ? fmt.currency(e.value) : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </React.Fragment>
                                    );
                                  });
                                })()}
                              </React.Fragment>
                            );
                          })}
                          {/* Total row */}
                          <tr style={{ opacity: 0.6 }}>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: muted }}>Total</td>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: text, textAlign: 'right' }}>
                              {fmt.hours(billingLastRows.reduce((s, r) => s + r.hours, 0))}
                            </td>
                            <td style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: text, textAlign: 'right' }}>
                              {fmt.currency(billingLastRows.reduce((s, r) => s + r.value, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  )}
                  {billingCurrentRows.length === 0 && billingLastRows.length === 0 && (
                    <div style={{ padding: '24px 18px', fontSize: 11, color: muted, textAlign: 'center' }}>No daily data available.</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CCL Document Preview Overlay ── */}
      {cclDocPreview && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
            background: 'rgba(0, 3, 25, 0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'opsDashFadeIn 0.15s ease both',
          }}
          onClick={() => setCclDocPreview(null)}
        >
          <div
            style={{
              width: '90vw',
              maxWidth: 900,
              height: '85vh',
              background: isDarkMode ? colours.darkBlue : colours.grey,
              border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(6, 23, 51, 0.08)'}`,
              boxShadow: 'var(--shadow-overlay-lg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(6, 23, 51, 0.08)'}`,
              background: isDarkMode ? 'rgba(5, 21, 37, 0.8)' : '#f8fafc',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isDarkMode ? colours.accent : colours.highlight }}>
                  Document preview
                </span>
                <span style={{ fontSize: 10, color: muted }}>{cclDocPreview!.matterId}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    window.open(cclDocPreview!.embedUrl.replace('embed.aspx', 'view.aspx'), '_blank');
                  }}
                  style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Open in new tab
                </button>
                <button
                  type="button"
                  onClick={() => setCclDocPreview(null)}
                  style={{ fontSize: 10, fontWeight: 600, color: muted, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={cclDocPreview!.embedUrl}
              title="CCL Document Preview"
              style={{ flex: 1, width: '100%', border: 'none', display: 'block' }}
            />
          </div>
        </div>
      )}

  </div>
    </CclStatusContext.Provider>
  );
};

const OperationsDashboard = React.memo(OperationsDashboardInner);

export default OperationsDashboard;
