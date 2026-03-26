import React from 'react';
import { createPortal } from 'react-dom';
import { FiRefreshCw, FiInbox, FiSend, FiCheckCircle, FiFolder } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import helixMark from '../../assets/markwhite.svg';
import clioIcon from '../../assets/clio.svg';
import netdocumentsIcon from '../../assets/netdocuments.svg';
import { useToast } from '../feedback/ToastProvider';
import { useClaimEnquiry } from '../../utils/claimEnquiry';
import { DEFAULT_CCL_TEMPLATE, generateTemplateContent, type GenerationOptions } from '../../shared/ccl';
import { isCclUser } from '../../app/admin';
import { DocumentRenderer } from '../../tabs/instructions/ccl/DocumentRenderer';
import { fetchAiFill, fetchAiFillStream, approveCcl, fetchPressureTest, type AiFillRequest, type AiFillResponse, type PressureTestResponse, type PressureTestFieldScore } from '../../tabs/matters/ccl/cclAiService';

/* ── Types ── */

type PeriodKey = 'today' | 'weekToDate' | 'monthToDate' | 'yearToDate';
type SortKey = 'date' | 'name' | 'aow';
type MatterSortKey = 'date' | 'name' | 'fe' | 'aow';
type EnquiryTab = 'enquiries' | 'unclaimed';
type UnclaimedRange = 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth';
type WeekComparisonMode = 'relative' | 'full';
type ActivityTab = 'enquiries' | 'pitched' | 'instructed';
type InsightPeriod = 'today' | 'weekToDate' | 'monthToDate' | null;
type CclContactSource = 'matter' | 'current';

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
  chartMode: 'none' | 'working-days' | 'month-weeks' | 'quarter-weeks';
  buckets: ConversionComparisonBucket[];
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
interface DetailRecord {
  id?: string; enquiryId?: string; date?: string; poc?: string; aow?: string; source?: string; name?: string; stage?: string;
  pipelineStage?: string; teamsChannel?: string; teamsCardType?: string; teamsStage?: string; teamsClaimed?: string; teamsLink?: string;
  email?: string;
}
interface DetailsPayload { currentRange?: string; current?: { records?: DetailRecord[] } }

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
}

function getCanonicalCclStage(status?: string | null): 'pending' | 'generated' | 'reviewed' | 'sent' {
  switch (String(status || '').trim().toLowerCase()) {
    case 'generated':
    case 'draft':
      return 'generated';
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
    case 'generated':
      return 'Generated';
    case 'reviewed':
      return 'Reviewed';
    case 'sent':
      return 'Sent';
    default:
      return 'Pending';
  }
}

interface MatterRecord {
  matterId: string;
  displayNumber: string;
  clientName: string;
  practiceArea: string;
  openDate: string;
  responsibleSolicitor: string;
  status: 'active' | 'closed';
  instructionRef?: string;
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
  if (!body.trim()) return '';

  const matchers = relevantKeys.flatMap((key) => CCL_PROMPT_CONTEXT_LINE_MATCHERS[key] || []);
  if (matchers.length === 0) return body;

  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const filtered = lines.filter((line) => matchers.some((matcher) => matcher.test(line)));
  return filtered.length > 0 ? filtered.join('\n') : body;
}

function getRelevantPromptSectionKeys(fieldKey: string | null, confidence: 'data' | 'inferred' | 'templated' | 'unknown' | undefined): string[] {
  if (fieldKey && CCL_PROMPT_SECTION_PRIORITY[fieldKey]) {
    return CCL_PROMPT_SECTION_PRIORITY[fieldKey];
  }

  switch (confidence) {
    case 'inferred':
      return ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'];
    case 'data':
      return ['matter-context', 'deal-information', 'pitch-service-description'];
    case 'templated':
      return ['matter-context', 'instruction-notes'];
    case 'unknown':
      return ['initial-call-notes', 'call-transcripts', 'enquiry-notes', 'instruction-notes', 'matter-context'];
    default:
      return ['matter-context', 'deal-information', 'pitch-email', 'initial-call-notes'];
  }
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

export interface OperationsDashboardProps {
  metrics: TimeMetric[];
  enquiryMetrics?: EnquiryMetric[];
  enquiryMetricsBreakdown?: unknown;
  conversionComparison?: ConversionComparisonPayload | null;
  enableConversionComparison?: boolean;
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
  reviewRequest?: { requestedAt: number; matterId?: string; openInspector?: boolean } | null;
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
  if (t.includes('time today') || t === 'today') return 'Today';
  if (t.includes('av.') || t.includes('avg')) return 'Avg / Day';
  if (t.includes('time this week')) return 'This Week';
  if (t.includes('fees') || t.includes('recovered')) return 'Fees Recovered';
  if (t.includes('outstanding')) return 'Outstanding';
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

const friendlyDateParts = (raw?: string): { primary: string; secondary?: string } => {
  if (!raw) return { primary: '—' };
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return { primary: raw };
    const day = d.getDate();
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    if (hrs === 0 && mins === '00') {
      return { primary: `${day} ${month}` };
    }
    return {
      primary: `${day} ${month}`,
      secondary: `${hrs}:${mins}`,
    };
  } catch {
    return { primary: raw };
  }
};

/* ── Component ── */

const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  metrics,
  enquiryMetrics,
  enquiryMetricsBreakdown,
  conversionComparison,
  enableConversionComparison = false,
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
  reviewRequest = null,
}) => {
  const { showToast, updateToast } = useToast();
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
  const [unclaimedAowFilter, setUnclaimedAowFilter] = React.useState<string>('all');
  const [weekComparisonMode, setWeekComparisonMode] = React.useState<WeekComparisonMode>('relative');
  const [claimedUnclaimedIds, setClaimedUnclaimedIds] = React.useState<Set<string>>(new Set());
  const [unclaimedClaimFeedback, setUnclaimedClaimFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const { claimEnquiry: triggerClaimEnquiry, isLoading: isClaimingUnclaimed } = useClaimEnquiry();
  const [claimingItemId, setClaimingItemId] = React.useState<string | null>(null);

  // Responsive: auto-stack when container is narrow
  const dashRef = React.useRef<HTMLDivElement | null>(null);
    const conversionRailRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
    const [conversionRailHeight, setConversionRailHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = dashRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => { setContainerWidth(entry.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const isNarrow = containerWidth > 0 && containerWidth < 700;
  React.useEffect(() => {
    if (isNarrow) {
      setConversionRailHeight(null);
      return;
    }
    const el = conversionRailRef.current;
    if (!el) return;
    const updateHeight = (nextHeight: number) => {
      setConversionRailHeight((prev) => {
        if (prev === nextHeight) return prev;
        return nextHeight;
      });
    };
    updateHeight(Math.ceil(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(([entry]) => {
      updateHeight(Math.ceil(entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isNarrow]);
  const [enquiryTab, setEnquiryTab] = React.useState<EnquiryTab>('enquiries');
  const [unclaimedRange, setUnclaimedRange] = React.useState<UnclaimedRange>('today');
  const [activityTab, setActivityTab] = React.useState<ActivityTab>('enquiries');
  const [sortKey, setSortKey] = React.useState<SortKey>('date');
  const [sortDesc, setSortDesc] = React.useState(true);
  const [matterSortKey, setMatterSortKey] = React.useState<MatterSortKey>('date');
  const [matterSortDesc, setMatterSortDesc] = React.useState(true);
  const [details, setDetails] = React.useState<DetailsPayload | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [insightPeriod, setInsightPeriod] = React.useState<InsightPeriod>(null);
  const [insightRecords, setInsightRecords] = React.useState<DetailRecord[]>([]);
  const [insightLoading, setInsightLoading] = React.useState(false);
  const [billingInsightIdx, setBillingInsightIdx] = React.useState<number | null>(null);
  const [expandedDays, setExpandedDays] = React.useState<Set<string>>(new Set());
  React.useEffect(() => { setExpandedDays(new Set()); }, [billingInsightIdx]);
  const canSeeCcl = isCclUser(userInitials);
  const [cclMap, setCclMap] = React.useState<Record<string, CclStatus>>({});
  const [cclStatusResolvingByMatter, setCclStatusResolvingByMatter] = React.useState<Record<string, boolean>>({});
  const [cclStatusResolvedByMatter, setCclStatusResolvedByMatter] = React.useState<Record<string, boolean>>({});
  const [expandedCcl, setExpandedCcl] = React.useState<string | null>(null);
  const [cclDraftCache, setCclDraftCache] = React.useState<Record<string, { fields: Record<string, string> | null; docUrl?: string }>>({});
  const [cclDraftLoading, setCclDraftLoading] = React.useState<string | null>(null);
  const [cclDocPreview, setCclDocPreview] = React.useState<{ matterId: string; embedUrl: string } | null>(null);
  const [cclFieldsModal, setCclFieldsModal] = React.useState<string | null>(null);
  const [cclLetterModal, setCclLetterModal] = React.useState<string | null>(null);
  // cclReviewFocus removed — inspector-first layout; preview toggled via cclPreviewOpen
  const [cclPreviewOpen, setCclPreviewOpen] = React.useState(false);
  const [cclAiFillingMatter, setCclAiFillingMatter] = React.useState<string | null>(null);
  const [cclAiStatusByMatter, setCclAiStatusByMatter] = React.useState<Record<string, string>>({});
  const [cclAiResultByMatter, setCclAiResultByMatter] = React.useState<Record<string, { request: AiFillRequest; response: AiFillResponse; baseFields: Record<string, string> }>>({});
  const [cclAiTraceByMatter, setCclAiTraceByMatter] = React.useState<Record<string, any>>({});
  const [cclAiTraceLoadingByMatter, setCclAiTraceLoadingByMatter] = React.useState<Record<string, boolean>>({});
  const [cclAiReviewedFields, setCclAiReviewedFields] = React.useState<Record<string, Set<string>>>({});
  const [cclSelectedReviewFieldByMatter, setCclSelectedReviewFieldByMatter] = React.useState<Record<string, string>>({});
  const [cclSessionPromptExpandedByMatter, setCclSessionPromptExpandedByMatter] = React.useState<Record<string, boolean>>({});
  const [cclSessionPromptTabByMatter, setCclSessionPromptTabByMatter] = React.useState<Record<string, 'system' | 'user'>>({});
  const [cclPlaceholderRevealByMatter, setCclPlaceholderRevealByMatter] = React.useState<Record<string, boolean>>({});
  const [cclPromptContextRevealByMatter, setCclPromptContextRevealByMatter] = React.useState<Record<string, boolean>>({});
  const [cclReviewRailPrimedByMatter, setCclReviewRailPrimedByMatter] = React.useState<Record<string, boolean>>({});
  const [cclVisibleReviewGroupByMatter, setCclVisibleReviewGroupByMatter] = React.useState<Record<string, string>>({});
  const [cclApprovingMatter, setCclApprovingMatter] = React.useState<string | null>(null);
  const [cclContactSourceByMatter, setCclContactSourceByMatter] = React.useState<Record<string, CclContactSource>>({});
  const [cclAiStreamLog, setCclAiStreamLog] = React.useState<{ key: string; value: string }[]>([]);
  const [cclPressureTestByMatter, setCclPressureTestByMatter] = React.useState<Record<string, PressureTestResponse>>({});
  const [cclPressureTestRunning, setCclPressureTestRunning] = React.useState<string | null>(null);
  const [cclPressureTestSteps, setCclPressureTestSteps] = React.useState<{ label: string; status: 'pending' | 'active' | 'done' | 'error' }[]>([]);
  const [cclPressureTestElapsed, setCclPressureTestElapsed] = React.useState(0);
  const [cclPressureTestError, setCclPressureTestError] = React.useState<string | null>(null);
  const cclPressureTestTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [cclReviewSummaryDismissedByMatter, setCclReviewSummaryDismissedByMatter] = React.useState<Record<string, boolean>>({});
  const cclAiAutoFiredRef = React.useRef<Set<string>>(new Set());
  const lastHandledReviewRequestRef = React.useRef<number | null>(null);
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
  /** Array of page break info: each entry is { beforeSectionIdx, pageNumber }. First page (1) has no entry. */
  const [cclPageBreaks, setCclPageBreaks] = React.useState<Array<{ beforeSectionIdx: number; pageNumber: number }>>([]);
  /** Total page count derived from section measurement */
  const [cclTotalPages, setCclTotalPages] = React.useState(1);
  const cclAutoScrollReviewRef = React.useRef<string | null>(null);

  /** Measures DocumentRenderer section heights and calculates page assignments. */
  const calcPageBreaks = React.useCallback(() => {
    const rootEl = cclRendererRootRef.current;
    if (!rootEl) return;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 820 : false;
    if (isMobile) {
      setCclPageBreaks(prev => prev.length === 0 ? prev : []);
      setCclTotalPages(1);
      return;
    }
    // Fixed A4 page width for the document area
    const PAGE_W = 680;
    // A4 ratio: 210mm × 297mm
    const PAGE_H = Math.round(PAGE_W * (297 / 210));
    const PADDING_TOP = 48;
    const PADDING_BOTTOM = 56; // room for page number
    const USABLE_H = PAGE_H - PADDING_TOP - PADDING_BOTTOM;

    const sectionDivs = rootEl.querySelectorAll<HTMLElement>('[data-section-idx]');
    if (!sectionDivs.length) return;

    const topSectionRe = /^(\d+)\s+/;
    const MIN_SECTION_START_SPACE = 74;

    let accumulated = 0;
    let pageNum = 1;
    const breaks: Array<{ beforeSectionIdx: number; pageNumber: number }> = [];

    sectionDivs.forEach((el, i) => {
      const sectionIdx = parseInt(el.getAttribute('data-section-idx') || '0', 10);
      const sectionH = el.getBoundingClientRect().height;
      const firstText = el.textContent?.trim().slice(0, 20) || '';
      const isTopLevelSection = i > 0 && topSectionRe.test(firstText);
      const remainingSpace = USABLE_H - accumulated;

      if (accumulated > 0 && isTopLevelSection && remainingSpace < MIN_SECTION_START_SPACE) {
        pageNum++;
        breaks.push({ beforeSectionIdx: sectionIdx, pageNumber: pageNum });
        accumulated = sectionH;
      } else if (accumulated > 0 && accumulated + sectionH > USABLE_H) {
        pageNum++;
        breaks.push({ beforeSectionIdx: sectionIdx, pageNumber: pageNum });
        accumulated = sectionH;
      } else {
        accumulated += sectionH;
      }
    });

    setCclTotalPages(pageNum);
    setCclPageBreaks(prev => {
      if (prev.length === breaks.length && prev.every((b, i) => b.beforeSectionIdx === breaks[i].beforeSectionIdx && b.pageNumber === breaks[i].pageNumber)) {
        return prev;
      }
      return breaks;
    });
  }, []);

  const cclReviewPageRefCallback = React.useCallback((el: HTMLDivElement | null) => {
    if (cclPageBreakObserverRef.current) {
      cclPageBreakObserverRef.current.disconnect();
      cclPageBreakObserverRef.current = null;
    }
    if (!el) return;
    requestAnimationFrame(calcPageBreaks);
    const observer = new ResizeObserver(() => requestAnimationFrame(calcPageBreaks));
    observer.observe(el);
    cclPageBreakObserverRef.current = observer;
  }, [calcPageBreaks]);

  // Re-run page break measurement when content changes (field edits don't always trigger resize)
  React.useEffect(() => {
    if (cclLetterModal && cclRendererRootRef.current) {
      requestAnimationFrame(calcPageBreaks);
    }
  });

  const cclAiToastIdRef = React.useRef<string | null>(null);
  const cclTraceFetchingRef = React.useRef<Set<string>>(new Set());
  const cclLetterModalOpenedAtRef = React.useRef<number>(0);
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

  const openCclLetterModal = React.useCallback((matterId: string) => {
    cclLetterModalOpenedAtRef.current = Date.now();
    setCclReviewRailPrimedByMatter((prev) => (prev[matterId] ? prev : { ...prev, [matterId]: true }));
    setCclLetterModal(matterId);

    // Fetch draft immediately — not via an effect (avoids cancellation race)
    if (cclDraftCacheRef.current[matterId] === undefined) {
      console.log('[CCL modal] fetching draft for', matterId);
      setCclDraftLoading(matterId);
      fetch(`/api/ccl/${encodeURIComponent(matterId)}`)
        .then(res => {
          if (!res.ok) throw new Error(`Draft fetch failed: ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log('[CCL modal] draft loaded', matterId, !!data?.json);
          setCclDraftCache(prev => ({ ...prev, [matterId]: { fields: data?.json || null, docUrl: data?.url || undefined } }));
          setCclDraftLoading(prev => prev === matterId ? null : prev);
        })
        .catch(err => {
          console.warn('[CCL modal] draft fetch failed', matterId, err?.message);
          setCclDraftCache(prev => ({ ...prev, [matterId]: { fields: null } }));
          setCclDraftLoading(prev => prev === matterId ? null : prev);
        });
    } else {
      console.log('[CCL modal] draft already cached for', matterId);
    }
  }, []);

  const closeCclLetterModal = React.useCallback(() => {
    setCclLetterModal(null);
  }, []);

  const handleCclLetterBackdropClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (Date.now() - cclLetterModalOpenedAtRef.current < 250) return;
    closeCclLetterModal();
  }, [closeCclLetterModal]);

  const buildCclAiPromptSummary = React.useCallback((practiceArea?: string, description?: string) => {
    const summary = [practiceArea, description].filter((value) => !!String(value || '').trim()).join(' · ').trim();
    const fallback = 'Generate CCL draft fields from the matter context';
    const text = summary || fallback;
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  }, []);

  const buildCclAiToastProgress = React.useCallback((phase: string, fieldCount: number, status: 'running' | 'success' | 'error') => {
    const gatheringStatus: 'pending' | 'active' | 'done' | 'error' =
      status === 'error' && phase === 'gathering-context'
        ? 'error'
        : phase === 'gathering-context'
          ? 'active'
          : phase === 'calling-ai' || status === 'success'
            ? 'done'
            : 'pending';

    const promptStatus: 'pending' | 'active' | 'done' | 'error' =
      status === 'error' && phase === 'calling-ai' && fieldCount === 0
        ? 'error'
        : phase === 'calling-ai' && fieldCount === 0 && status === 'running'
          ? 'active'
          : fieldCount > 0 || status === 'success'
            ? 'done'
            : phase === 'gathering-context'
              ? 'pending'
              : 'pending';

    const streamingStatus: 'pending' | 'active' | 'done' | 'error' =
      status === 'error' && fieldCount > 0
        ? 'error'
        : status === 'success'
          ? 'done'
          : fieldCount > 0
            ? 'active'
            : 'pending';

    const readyStatus: 'pending' | 'active' | 'done' | 'error' =
      status === 'success'
        ? 'done'
        : status === 'error'
          ? 'error'
          : 'pending';

    return [
      { label: 'Gather matter context', status: gatheringStatus },
      { label: 'Build AI prompt', status: promptStatus },
      { label: fieldCount > 0 ? `Stream draft fields (${fieldCount})` : 'Stream draft fields', status: streamingStatus },
      { label: 'Ready for review', status: readyStatus },
    ];
  }, []);

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
    const toastPayload = {
      type: options.type || 'loading',
      title: options.title,
      message: `${options.statusMessage} Prompt: ${options.promptSummary}`,
      persist: options.persist ?? (options.type === 'loading' || !options.type),
      duration: options.duration,
      progress: buildCclAiToastProgress(options.phase, options.fieldCount, options.type === 'success' ? 'success' : options.type === 'error' ? 'error' : 'running'),
      action: options.action,
    };

    if (cclAiToastIdRef.current) {
      updateToast(cclAiToastIdRef.current, toastPayload);
      return cclAiToastIdRef.current;
    }

    const toastId = showToast(toastPayload);
    cclAiToastIdRef.current = toastId;
    return toastId;
  }, [buildCclAiToastProgress, showToast, updateToast]);

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

  const buildDemoCclMap = React.useCallback((demoIds: string[]): Record<string, CclStatus> => {
    if (demoIds.length === 0) return {};
    const ago = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); };
    const now = new Date().toISOString();
    const fe = userInitials || 'Demo';
    const demoMap: Record<string, CclStatus> = {};
    if (demoIds[0]) {
      demoMap[demoIds[0]] = { status: 'uploaded', version: 3, feeEarner: fe, practiceArea: 'Commercial', clientName: 'Demo Prospect', matterDescription: 'Commercial Dispute — Demo Prospect v Acme Corp', createdAt: ago(14), finalizedAt: ago(2), uploadedToClio: true };
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
    if (!secondaryFetchesReady) {
      return;
    }
    if (!recentMatters || recentMatters.length === 0) {
      setCclMap({});
      setCclStatusResolvingByMatter({});
      setCclStatusResolvedByMatter({});
      return;
    }
    const ids = recentMatters.slice(0, 12).map(m => m.matterId).filter(Boolean);
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
    fetchSharedJson(`ccl-batch-status:${JSON.stringify(ids)}`, () => fetch('/api/ccl/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterIds: ids }),
    }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
      .then(data => {
        if (cancelled) return;
        const results: Record<string, CclStatus> = data?.results || {};
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
  }, [recentMatters, demoModeActive, demoMatterIds, buildDemoCclMap, seedDemoDraftCache, secondaryFetchesReady]);

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
    void fetch(`/api/ccl/${encodeURIComponent(matterId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftJson: fields, initials: userInitials || '' }),
    }).catch(() => {});
  }, [userInitials]);

  // Fetch CCL draft JSON when a matter is expanded in the audit trail
  React.useEffect(() => {
    if (!expandedCcl || !cclMap[expandedCcl]) return;
    if (cclDraftCache[expandedCcl] !== undefined) return; // already fetched
    let cancelled = false;
    setCclDraftLoading(expandedCcl);
    fetch(`/api/ccl/${expandedCcl}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Draft fetch failed: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!cancelled) {
          setCclDraftCache(prev => ({ ...prev, [expandedCcl]: { fields: data?.json || null, docUrl: data?.url || undefined } }));
          setCclDraftLoading(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCclDraftCache(prev => ({ ...prev, [expandedCcl]: { fields: null } }));
          setCclDraftLoading(null);
        }
      });
    return () => { cancelled = true; };
  }, [expandedCcl, cclMap, cclDraftCache]);

  const runHomeCclAiAutofill = React.useCallback(async (matterId: string) => {
    if (!matterId || cclAiFillingMatter === matterId) return;

    const matter = displayMatters.find((m) => m.matterId === matterId);
    if (!matter) return;

    const ccl = cclMap[matterId];
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
    setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: 'Gathering context…' }));
    setCclAiStreamLog([]); // Reset live feed

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
    const toastTitle = `CCL review · ${matter.displayNumber || matterId}`;
    const promptSummary = buildCclAiPromptSummary(aiRequest.practiceArea, aiRequest.description);
    // Only show toast when the review modal isn't already showing this matter
    const showToastForThis = cclLetterModal !== matterId;
    if (showToastForThis) {
      upsertCclAiToast({
        matterId,
        title: toastTitle,
        promptSummary,
        statusMessage: 'Running in the background. You can keep using the app.',
        phase: 'gathering-context',
        fieldCount: 0,
        type: 'loading',
        persist: true,
      });
    }

    try {
      await fetchAiFillStream(aiRequest, {
        onPhase: (phase, message, dataSources) => {
          setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: message }));
          if (showToastForThis) {
            upsertCclAiToast({
              matterId,
              title: toastTitle,
              promptSummary,
              statusMessage: message,
              phase,
              fieldCount: cclAiStreamLog.length,
              type: 'loading',
              persist: true,
            });
          }
        },
        onField: (key, value, index) => {
          // Push to live feed log
          setCclAiStreamLog((prev) => [...prev, { key, value }]);

          // Merge field into draft cache in real-time — always apply AI values
          // The user explicitly triggered the fill, so AI output is authoritative
          setCclDraftCache((prev) => {
            const existing = prev[matterId]?.fields || {};
            return {
              ...prev,
              [matterId]: { ...prev[matterId], fields: { ...existing, [key]: value } },
            };
          });
          setCclAiStatusByMatter((prev) => ({
            ...prev,
            [matterId]: `Generating field ${index}…`,
          }));
          if (showToastForThis) {
            upsertCclAiToast({
              matterId,
              title: toastTitle,
              promptSummary,
              statusMessage: `Generating field ${index}…`,
              phase: 'calling-ai',
              fieldCount: index,
              type: 'loading',
              persist: true,
            });
          }
        },
        onComplete: (result) => {
          // Store full AI result for review checklist
          setCclAiResultByMatter((prev) => ({
            ...prev,
            [matterId]: { request: aiRequest, response: result, baseFields: baseFieldsSnapshot },
          }));

          // Final merge — AI result is authoritative for all returned fields
          setCclDraftCache((prev) => {
            const merged = { ...(prev[matterId]?.fields || {}) } as Record<string, string>;
            for (const [key, value] of Object.entries(result.fields || {})) {
              merged[key] = value;
            }
            applyCclContactFallbacks(matterId, merged, matter, ccl);
            if (merged.figure && !merged.state_amount) merged.state_amount = merged.figure;
            if (merged.state_amount && !merged.figure) merged.figure = merged.state_amount;
            return {
              ...prev,
              [matterId]: { ...prev[matterId], fields: merged },
            };
          });

          // Persist to server (best-effort)
          setCclDraftCache((prev) => {
            const fields = prev[matterId]?.fields || {};
            persistCclDraft(matterId, fields);
            return prev;
          });

          const confidenceLabel = result.confidence === 'full' ? 'full' : result.confidence === 'partial' ? 'partial' : 'fallback';
          setCclAiStatusByMatter((prev) => ({
            ...prev,
            [matterId]: `AI ${confidenceLabel} · ${result.source}${result.durationMs ? ` · ${Math.round(result.durationMs / 100) / 10}s` : ''}`,
          }));

          setCclAiFillingMatter(null);
          if (showToastForThis) {
            upsertCclAiToast({
              matterId,
              title: toastTitle,
              promptSummary,
              statusMessage: 'Draft ready. Review whenever you are ready.',
              phase: 'complete',
              fieldCount: Object.keys(result.fields || {}).length,
              type: 'success',
              persist: false,
              duration: 7000,
              action: {
                label: 'Review now',
                onClick: () => openCclLetterModal(matterId),
              },
            });
            cclAiToastIdRef.current = null;
          }
        },
        onError: (message, fallbackFields) => {
          if (fallbackFields) {
            setCclDraftCache((prev) => {
              const existing = prev[matterId]?.fields || {};
              const merged = { ...existing };
              for (const [key, value] of Object.entries(fallbackFields)) {
                if (!merged[key] || !String(merged[key]).trim()) merged[key] = value;
              }
              return { ...prev, [matterId]: { ...prev[matterId], fields: merged } };
            });
          }
          setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: `AI failed · ${message}` }));
          setCclAiFillingMatter(null);
          if (showToastForThis) {
            upsertCclAiToast({
              matterId,
              title: toastTitle,
              promptSummary,
              statusMessage: `AI failed · ${message}`,
              phase: 'calling-ai',
              fieldCount: 0,
              type: 'error',
              persist: false,
              duration: 7000,
            });
            cclAiToastIdRef.current = null;
          }
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI autofill failed';
      setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: `AI failed · ${message}` }));
      setCclAiFillingMatter(null);
      if (showToastForThis) {
        upsertCclAiToast({
          matterId,
          title: toastTitle,
          promptSummary,
          statusMessage: `AI failed · ${message}`,
          phase: 'calling-ai',
          fieldCount: 0,
          type: 'error',
          persist: false,
          duration: 7000,
        });
        cclAiToastIdRef.current = null;
      }
    }
  }, [applyCclContactFallbacks, buildCclAiPromptSummary, cclAiFillingMatter, cclAiStreamLog.length, cclLetterModal, displayMatters, cclMap, cclDraftCache, setCclLetterModal, persistCclDraft, upsertCclAiToast, userInitials]);

  const runPressureTest = React.useCallback(async (matterId: string) => {
    if (!matterId || cclPressureTestRunning) return;
    const matter = displayMatters.find((m) => m.matterId === matterId);
    const aiResult = cclAiResultByMatter[matterId];
    const draft = cclDraftCache[matterId]?.fields;
    const generatedFields = aiResult?.response?.fields || draft || {};
    if (Object.keys(generatedFields).length === 0) return;

    setCclPressureTestRunning(matterId);
    setCclPressureTestError(null);
    const startMs = Date.now();
    setCclPressureTestElapsed(0);

    const steps = [
      { label: 'Starting Safety Net review', status: 'active' as const },
      { label: 'Gathering evidence', status: 'pending' as const },
      { label: 'Scoring fields against evidence', status: 'pending' as const },
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
      phaseTimers.forEach(clearTimeout);
      setCclPressureTestSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
      setCclPressureTestByMatter((prev) => ({ ...prev, [matterId]: result }));
    } catch (err: unknown) {
      phaseTimers.forEach(clearTimeout);
      console.error('[CCL] Pressure test failed:', err);
      const msg = err instanceof Error ? err.message : 'Pressure test failed';
      setCclPressureTestError(msg);
      setCclPressureTestSteps(prev => prev.map(s =>
        s.status === 'active' || s.status === 'pending' ? { ...s, status: 'error' as const } : s
      ));
    } finally {
      if (cclPressureTestTimerRef.current) { clearInterval(cclPressureTestTimerRef.current); cclPressureTestTimerRef.current = null; }
      setCclPressureTestRunning(null);
    }
  }, [cclPressureTestRunning, displayMatters, cclAiResultByMatter, cclDraftCache]);

  React.useEffect(() => {
    if (!cclLetterModal) return;
    if (cclAiResultByMatter[cclLetterModal]) return;
    if (cclAiTraceByMatter[cclLetterModal]) return;

    // Guard via ref — functional updater timing is unreliable across React versions
    if (cclTraceFetchingRef.current.has(cclLetterModal)) return;
    cclTraceFetchingRef.current.add(cclLetterModal);
    setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [cclLetterModal]: true }));

    let cancelled = false;
    fetch(`/api/ccl-admin/traces/${encodeURIComponent(cclLetterModal)}?limit=1`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.traces?.length) return;
        setCclAiTraceByMatter((prev) => ({ ...prev, [cclLetterModal]: data.traces[0] }));
      })
      .catch(() => {})
      .finally(() => {
        cclTraceFetchingRef.current.delete(cclLetterModal);
        if (cancelled) return;
        setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [cclLetterModal]: false }));
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cclLetterModal, cclAiResultByMatter, cclAiTraceByMatter]);

  // Auto-trigger AI fill when the letter modal opens and no saved AI context exists.
  // This removes the manual "Generate AI review" click — the review starts generating immediately.
  React.useEffect(() => {
    if (!cclLetterModal) return;
    // Already have AI context — nothing to auto-trigger
    if (cclAiResultByMatter[cclLetterModal] || cclAiTraceByMatter[cclLetterModal]) return;
    // Trace fetch still in flight — wait for it to finish first
    if (cclAiTraceLoadingByMatter[cclLetterModal]) return;
    // Already running AI fill
    if (cclAiFillingMatter === cclLetterModal) return;
    // Draft not loaded yet — need it for AI context
    if (!cclDraftCache[cclLetterModal]?.fields) return;
    console.log('[CCL] Auto-triggering AI fill for', cclLetterModal);
    void runHomeCclAiAutofill(cclLetterModal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cclLetterModal, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter, cclAiFillingMatter, cclDraftCache]);

  // Pressure test is user-initiated only — no auto-trigger.
  // The review rail shows a "Run Safety Net" button when AI context is present.

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
    const weekKey = weekComparisonMode === 'relative' ? 'week-pace' : 'week-vs-last';
    return conversionRows.filter((item) => {
      if (item.key === 'week-pace' || item.key === 'week-vs-last') {
        return item.key === weekKey;
      }
      return true;
    });
  }, [conversionRows, weekComparisonMode]);
  const useExperimentalConversion = enableConversionComparison && conversionRows.length > 0;
  const showExperimentalConversionSkeleton = enableConversionComparison;
  const primaryRailMinHeight = isNarrow ? undefined : (useExperimentalConversion ? 500 : 520);
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
  const unclaimedAowOptions = React.useMemo(
    () => activeUnclaimedRange?.aowBreakdown ?? [],
    [activeUnclaimedRange],
  );
  const filteredUnclaimedItems = React.useMemo(() => {
    const items = activeUnclaimedRange?.items ?? [];
    if (unclaimedAowFilter === 'all') return items;
    return items.filter((item) => item.aow === unclaimedAowFilter);
  }, [activeUnclaimedRange, unclaimedAowFilter]);
  const priorityUnclaimedItem = React.useMemo(() => {
    const pool = filteredUnclaimedItems.length > 0 ? filteredUnclaimedItems : activeUnclaimedRange?.items ?? [];
    return [...pool].sort((left, right) => {
      const staleDelta = Number(right.ageDays || 0) - Number(left.ageDays || 0);
      if (staleDelta !== 0) return staleDelta;
      const valueDelta = Number(right.value || 0) - Number(left.value || 0);
      if (valueDelta !== 0) return valueDelta;
      return String(left.name || '').localeCompare(String(right.name || ''));
    })[0] ?? null;
  }, [activeUnclaimedRange?.items, filteredUnclaimedItems]);

  React.useEffect(() => {
    setUnclaimedAowFilter('all');
  }, [unclaimedRange]);

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

  const handleClaimPriorityUnclaimed = React.useCallback(() => {
    if (priorityUnclaimedItem) handleClaimUnclaimed(priorityUnclaimedItem);
  }, [handleClaimUnclaimed, priorityUnclaimedItem]);

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

  /* ── Fetch recents ── */
  React.useEffect(() => {
    if (!secondaryFetchesReady) return;
    if (isTeamWideEnquiryView) {
      setDetails(null);
      setDetailsLoading(false);
      return;
    }
    if (!userEmail && !userInitials) return;
    let active = true;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const hasSeededRecords = recentEnquiryRecords.length > 0;
    const params = new URLSearchParams();
    if (userEmail) params.set('email', userEmail);
    if (userInitials) params.set('initials', userInitials);
    params.set('period', activityDetailsPeriod);
    params.set('limit', '500');
    params.set('includePrevious', 'false');
    const requestKey = `home-enquiries-details:${params.toString()}`;
    const runFetch = () => {
      if (!active) return;
      if (!hasSeededRecords) {
        setDetailsLoading(true);
      }
      fetchSharedJson(requestKey, () => fetch(`/api/home-enquiries/details?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
        .then((d: DetailsPayload) => { if (active) setDetails(d); })
        .catch(() => {})
        .finally(() => { if (active) setDetailsLoading(false); });
    };

    if (hasSeededRecords) {
      setDetailsLoading(false);
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        timeoutId = globalThis.setTimeout(() => {
          (window as typeof window & {
            requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
          }).requestIdleCallback(() => runFetch(), { timeout: 1200 });
        }, 550);
      } else {
        timeoutId = globalThis.setTimeout(runFetch, 700);
      }
    } else {
      runFetch();
    }

    return () => {
      active = false;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [activityDetailsPeriod, isTeamWideEnquiryView, recentEnquiryRecords, userEmail, userInitials, secondaryFetchesReady]);

  const recents = React.useMemo(() => {
    const seededRecords = isTeamWideEnquiryView
      ? recentEnquiryRecords.filter((record) => recordFallsWithinPeriod(record.date, activityDetailsPeriod))
      : recentEnquiryRecords;
    const currentRecordsRaw = details?.current?.records;
    const currentRecords = Array.isArray(currentRecordsRaw) ? currentRecordsRaw : [];
    const sourceRecords = currentRecords.length > 0 ? currentRecords : seededRecords;
    const list = [...sourceRecords];
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
  }, [activityDetailsPeriod, details, isTeamWideEnquiryView, recentEnquiryRecords, sortKey, sortDesc, demoModeActive, userInitials]);

  const filteredRecents = React.useMemo(() => {
    const eff = (r: DetailRecord) => stageLevel(activityStageForRecord(r));
    if (activityTab === 'enquiries') return recents;
    if (activityTab === 'pitched') return recents.filter((r) => eff(r) === 3);
    if (activityTab === 'instructed') return recents.filter((r) => eff(r) >= 4);
    return recents;
  }, [recents, activityTab]);
  const activityVisibleCount = layoutStacked ? 6 : 8;
  const matterVisibleCount = layoutStacked ? 6 : 8;
  const alignStackedColumns = layoutStacked && !isNarrow;
  const sharedDotColumnWidth = 20;
  const sharedDateColumnWidth = alignStackedColumns ? 62 : 36;
  const sharedFeColumnWidth = alignStackedColumns ? 34 : 28;
  const sharedAowColumnWidth = alignStackedColumns ? 72 : 48;
  const sharedStatusColumnWidth = 52;
  const matterActionColumnWidth = canSeeCcl ? (alignStackedColumns ? 92 : 76) : 14;
  const matterStatusColumnWidth = alignStackedColumns ? sharedStatusColumnWidth : (canSeeCcl ? 34 : 14);
  const matterGridTemplate = `${sharedDotColumnWidth}px ${sharedDateColumnWidth}px minmax(0, 1fr) 1px ${sharedAowColumnWidth}px ${sharedFeColumnWidth}px ${matterActionColumnWidth}px`;

  const openPitchBuilderForRecord = React.useCallback((record: DetailRecord) => {
    const enquiryId = String(record.enquiryId || record.id || '').trim();
    if (!enquiryId) return;
    try {
      window.dispatchEvent(new CustomEvent('navigateToEnquiry', {
        detail: { enquiryId, subTab: 'Pitch' },
      }));
    } catch (error) {
      console.error('Failed to open pitch builder from home activity row', error);
    }
  }, []);

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
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)';
  const colHeaderBg = isDarkMode ? 'rgba(6,23,51,0.75)' : colours.helixBlue;
  const tabActiveBg = isDarkMode ? 'rgba(6,23,51,0.75)' : 'rgba(13,47,96,0.04)';
  const cardShadow = isDarkMode ? 'none' : 'inset 0 0 0 1px rgba(13,47,96,0.06), 0 1px 4px rgba(13,47,96,0.04)';
  const theadBg = isDarkMode ? 'rgba(255,255,255,0.02)' : colours.helixBlue;
  const theadText = isDarkMode ? colours.subtleGrey : colours.grey;
  const theadAccent = isDarkMode ? colours.accent : '#FFFFFF';
  const hoverBg = isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(13,47,96,0.04)';
  const hoverShadow = isDarkMode ? 'inset 2px 0 0 rgba(135,243,243,0.3)' : `inset 2px 0 0 ${colours.helixBlue}`;

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
        openCclLetterModal(resolvedMatterId);
      }
    }
  }, [homeReviewRequest, displayMatters, cclMap, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter, openCclLetterModal, runHomeCclAiAutofill]);
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

  const renderSectionSkeleton = (
    title: string,
    detail: string,
    opts: { rows?: number; minHeight?: number; columns?: number } = {},
  ) => {
    const rows = opts.rows ?? 3;
    const columns = opts.columns ?? 1;
    return (
      <div
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          boxShadow: cardShadow,
          display: 'flex',
          flexDirection: 'column',
          minHeight: opts.minHeight ?? 0,
        }}
      >
        <div style={{ padding: '11px 14px 10px', borderBottom: `1px solid ${rowBorder}`, background: isDarkMode ? 'rgba(255,255,255,0.015)' : 'rgba(13,47,96,0.025)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiRefreshCw size={11} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: text }}>{title}</div>
              <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{detail}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: columns > 1 ? `repeat(${columns}, minmax(0, 1fr))` : '1fr', gap: 10, flex: 1 }}>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
              {skeletonBlock(index % 2 === 0 ? '36%' : '28%', 9, { animationDelay: `${index * 0.08}s` })}
              {skeletonBlock('100%', index === 0 ? 18 : 12, { animationDelay: `${index * 0.1}s`, background: skeletonSoft })}
              {skeletonBlock(index % 2 === 0 ? '62%' : '48%', 8, { animationDelay: `${index * 0.12}s`, background: skeletonTint })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderConversionSkeleton = () => (
    renderSectionSkeleton(
      'Conversion warming up',
      showExperimentalConversionSkeleton
        ? 'Comparing live enquiry and matter flow across the current period.'
        : 'Calculating current conversion and unclaimed queue position.',
      {
        rows: showExperimentalConversionSkeleton ? 5 : 4,
        minHeight: primaryRailMinHeight,
        columns: showExperimentalConversionSkeleton ? 1 : 2,
      },
    )
  );

  const renderPipelineSkeletonCard = (variant: 'activity' | 'matters') => (
    renderSectionSkeleton(
      variant === 'activity' ? 'Recent activity' : 'Recent matters',
      variant === 'activity'
        ? 'Pulling live enquiry movement and stage updates.'
        : 'Loading the latest opened matters and CCL status.',
      {
        rows: variant === 'activity' ? activityVisibleCount : matterVisibleCount,
        minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0,
      },
    )
  );

  const renderConversionChart = (item: ConversionComparisonItem) => {
    if (item.chartMode === 'none' || item.buckets.length === 0) {
      return null;
    }

    const chartWidth = 240;
    const chartHeight = 74;
    const buckets = item.buckets.map((bucket) => ({
      ...bucket,
      currentEnquiries: Number(bucket.currentEnquiries || 0),
      previousEnquiries: Number(bucket.previousEnquiries || 0),
      currentMatters: Number(bucket.currentMatters || 0),
      previousMatters: Number(bucket.previousMatters || 0),
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
    const padBot = 4;
    const padLeft = 10;
    const padRight = 10;
    const drawWidth = chartWidth - padLeft - padRight;
    const step = buckets.length > 1 ? drawWidth / (buckets.length - 1) : drawWidth;
    const xAt = (index: number) => padLeft + (buckets.length > 1 ? index * step : drawWidth / 2);
    const yAt = (value: number) => chartHeight - padBot - (value / maxEnquiries) * (chartHeight - padTop - padBot);
    const yAtMatter = (value: number) => chartHeight - padBot - (value / maxMatters) * (chartHeight - padTop - padBot);
    const buildSmoothPath = (values: number[]) => {
      const points = values.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
      if (points.length === 0) return '';
      if (points.length === 1) {
        return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      }

      let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const point = points[index];
        const controlX = ((previousPoint.x + point.x) / 2).toFixed(2);
        path += ` C ${controlX} ${previousPoint.y.toFixed(2)}, ${controlX} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      }
      return path;
    };
    const currentLine = buildSmoothPath(buckets.map((bucket) => bucket.currentEnquiries));
    const previousLine = buildSmoothPath(buckets.map((bucket) => bucket.previousEnquiries));
    const barWidth = Math.max(6, Math.min(14, buckets.length > 8 ? step * 0.45 : 14));
    const visibleAxisIndexes = new Set<number>(
      buckets.length <= 5
        ? buckets.map((_, index) => index)
        : buckets.length <= 8
          ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]
          : [0, Math.floor((buckets.length - 1) / 3), Math.floor(((buckets.length - 1) * 2) / 3), buckets.length - 1],
    );
    const currentStroke = isDarkMode ? 'rgba(135,243,243,0.78)' : 'rgba(54,144,206,0.82)';
    const previousStroke = isDarkMode ? 'rgba(160,160,160,0.34)' : 'rgba(107,107,107,0.38)';
    const matterFill = isDarkMode ? 'rgba(32,178,108,0.3)' : 'rgba(32,178,108,0.24)';
    const matterStroke = isDarkMode ? 'rgba(32,178,108,0.58)' : 'rgba(32,178,108,0.42)';

    return (
      <div>
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-hidden="true" style={{ display: 'block' }}>
          <line
            x1="0"
            y1={chartHeight - 0.5}
            x2={chartWidth}
            y2={chartHeight - 0.5}
            stroke={isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.06)'}
            strokeWidth="1"
          />
          <line
            x1="0"
            y1={chartHeight / 2}
            x2={chartWidth}
            y2={chartHeight / 2}
            stroke={isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.04)'}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          {buckets.map((bucket, index) => {
            const centreX = xAt(index);
            const barY = yAtMatter(bucket.currentMatters);
            const barH = Math.max(1, chartHeight - padBot - barY);
            return (
              <g key={`${item.key}-${bucket.label}`} opacity={bucket.isFuture ? 0.28 : 1}>
                <rect
                  x={centreX - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barH}
                  fill={matterFill}
                  stroke={matterStroke}
                  strokeWidth="0.8"
                  rx="1"
                />
              </g>
            );
          })}
          <path d={previousLine} fill="none" stroke={previousStroke} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
          <path d={currentLine} fill="none" stroke={currentStroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          {/* Hover columns — invisible rects with tooltip */}
          {buckets.map((bucket, index) => {
            const centreX = xAt(index);
            const colW = buckets.length > 1 ? step : chartWidth;
            const colX = buckets.length > 1 ? Math.max(0, centreX - colW / 2) : 0;
            const tip = `${bucket.label}\nEnquiries: ${bucket.currentEnquiries} (prior ${bucket.previousEnquiries})\nMatters: ${bucket.currentMatters}`;
            return (
              <rect
                key={`${item.key}-${bucket.label}-hit`}
                x={colX}
                y={0}
                width={colW}
                height={chartHeight}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
              >
                <title>{tip}</title>
              </rect>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0 0' }}>
          {buckets.filter((_, index) => visibleAxisIndexes.has(index)).map((bucket) => (
            <span
              key={`${item.key}-${bucket.label}-ax`}
              style={{ fontSize: 7, color: muted, opacity: 0.65, letterSpacing: '0.1px' }}
            >
              {bucket.axisLabel || ''}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 2, background: currentStroke, display: 'inline-block' }} />
            <span style={{ fontSize: 7, color: muted, opacity: 0.7 }}>Enquiries</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 2, background: previousStroke, display: 'inline-block' }} />
            <span style={{ fontSize: 7, color: muted, opacity: 0.7 }}>Prior</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, background: matterFill, border: `1px solid ${matterStroke}`, display: 'inline-block', borderRadius: 1 }} />
            <span style={{ fontSize: 7, color: muted, opacity: 0.7 }}>Matters</span>
          </span>
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
    <div ref={dashRef} style={{ padding: '4px 8px 10px', display: 'grid', gap: 8 }}>
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
        .ops-dash-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .ops-dash-scroll::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
          border-radius: 2px;
        }
        .ops-dash-scroll::-webkit-scrollbar-thumb:hover {
          background: ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
        }
        /* Hover-reveal email line in enquiry rows */
        .ops-enquiry-row .ops-email-line {
          opacity: 0;
          max-height: 0;
          overflow: hidden;
          transition: opacity 0.15s ease, max-height 0.15s ease;
        }
        .ops-enquiry-row:hover .ops-email-line {
          opacity: 1;
          max-height: 16px;
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
            <span style={{ fontSize: 11, fontWeight: 600, color: muted, letterSpacing: '0.2px' }}>Billing</span>
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
            style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, animation: 'opsDashFadeIn 0.35s ease both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
            onMouseEnter={cardHover.enter}
            onMouseLeave={cardHover.leave}
          >
            {billingMetrics.length === 0 ? (
              <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiRefreshCw size={11} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: text }}>Billing warming up</div>
                    <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>Pulling WIP, recovered fees, and outstanding balances.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isNarrow ? 2 : 4}, 1fr)`, gap: 12 }}>
                  {Array.from({ length: isNarrow ? 2 : 4 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {skeletonBlock('38%', 9, { animationDelay: `${i * 0.08}s` })}
                      {skeletonBlock('72%', 20, { animationDelay: `${i * 0.1}s` })}
                      {skeletonBlock('54%', 8, { animationDelay: `${i * 0.12}s`, background: skeletonSoft })}
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: rowBorder }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {skeletonBlock(84, 10, { background: skeletonSoft })}
                  {skeletonBlock(72, 10, { background: skeletonTint })}
                  {skeletonBlock(96, 10, { background: skeletonSoft, marginLeft: 'auto' })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${billingMetrics.length}, 1fr)` }}>
                {billingMetrics.map((m, i) => {
                const isRecovered = m.title.toLowerCase().includes('recovered') || m.title.toLowerCase().includes('fees');
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
                return (
                  <div
                    key={i}
                    style={{
                      padding: '16px 18px 14px',
                      borderRight: i < billingMetrics.length - 1 ? `1px solid ${rowBorder}` : 'none',
                      transition: 'background 0.2s ease, transform 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={tileHover.enter}
                    onMouseLeave={tileHover.leave}
                    onClick={() => setBillingInsightIdx(i)}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      {bigNumber(primary, { loading: !!isLoading })}
                      {secondary && <span data-muted style={{ fontSize: 12, color: muted, fontWeight: 500, transition: 'color 0.2s ease, opacity 0.2s ease' }}>{secondary}</span>}
                    </div>
                    <div data-muted style={{ fontSize: 10, color: muted, marginTop: 4, letterSpacing: '0.3px', transition: 'color 0.2s ease, opacity 0.2s ease' }}>{shortLabel(m.title)}</div>
                    {!isLoading && curVal > 0 && <div style={{ marginTop: 5 }}>{progressBar(barPct, { height: 2, color: barColor })}</div>}
                    {showPrev && !isLoading && (
                      <div data-muted style={{ fontSize: 9, color: muted, opacity: 0.5, marginTop: 4, transition: 'color 0.2s ease, opacity 0.2s ease' }}>prev {prev}{delta(curVal, prevVal, deltaFmt)}</div>
                    )}
                  </div>
                );
              })}
              </div>
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
                {isOutstandingLoading ? 'Loading outstanding…' : (
                  <>
                    <span style={{ fontWeight: 600, color: text }}>{fmt.currency(outstandingMetric?.money || 0)}</span>
                    <span>outstanding</span>
                    {typeof outstandingMetric?.secondary === 'number' && (
                      <span style={{ opacity: 0.5 }}>· firm {fmt.currency(outstandingMetric?.secondary || 0)}</span>
                    )}
                    {hasOutstandingBreakdown && <span style={{ color: accent, marginLeft: 'auto' }}>View breakdown →</span>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline: 3-column layout ── */}
      {((enquiryMetrics && enquiryMetrics.length > 0) || isLoadingEnquiryMetrics) && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 2fr', gap: 6 }}>
          {/* ── Left: Conversion ── */}
          <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '2px 0 3px', letterSpacing: '0.2px', animation: 'opsDashFadeIn 0.25s ease both' }}>Conversion</div>
          <div ref={conversionRailRef} style={{ minHeight: primaryRailMinHeight }}>
          {(!enquiryMetrics || enquiryMetrics.length === 0) ? (
              renderConversionSkeleton()
          ) : (
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: primaryRailMinHeight, animation: 'opsDashFadeIn 0.35s ease 0.05s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              {/* Tabs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: `1px solid ${cardBorder}`,
              }}>
                {(['enquiries', 'unclaimed'] as const).map((tab, tabIdx) => (
                  <div
                    key={tab}
                    onClick={() => setEnquiryTab(tab)}
                    style={{
                      padding: '10px 14px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.3px',
                      color: enquiryTab === tab ? accent : muted,
                      borderBottom: enquiryTab === tab ? `2px solid ${accent}` : '2px solid transparent',
                      cursor: 'pointer',
                      userSelect: 'none',
                      textAlign: 'center',
                      background: enquiryTab === tab ? tabActiveBg : 'transparent',
                      transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
                      animation: `opsDashRowFade 0.2s ease ${0.06 + tabIdx * 0.04}s both`,
                    }}
                  >
                    {tab === 'enquiries' ? 'Enquiries' : 'Unclaimed'}
                    {tab === 'unclaimed' && claimSignal.unclaimed > 0 && (
                      <span style={{ marginLeft: 4, color: colours.orange, fontWeight: 700 }}>{claimSignal.unclaimed}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1 }}>
                {enquiryTab === 'enquiries' ? (
                  <>
                    {useExperimentalConversion ? (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {visibleConversionRows.map((item, index) => {
                          const hasChart = item.chartMode !== 'none' && item.buckets.length > 0;
                          const insightTarget = item.key === 'today'
                            ? 'today'
                            : item.key === 'week-vs-last' || item.key === 'week-pace'
                              ? 'weekToDate'
                              : item.key === 'month-vs-last'
                                ? 'monthToDate'
                                : null;
                          const hasCurrentBasis = item.currentEnquiries > 0;
                          const hasPreviousBasis = item.previousEnquiries > 0;
                          const deltaPoints = item.currentPct - item.previousPct;
                          const deltaColour = hasCurrentBasis && hasPreviousBasis
                            ? (deltaPoints >= 0 ? colours.green : colours.cta)
                            : muted;
                          const currentPctLabel = hasCurrentBasis ? fmt.pct(item.currentPct) : '—';
                          const deltaLabel = hasCurrentBasis && hasPreviousBasis
                            ? `${deltaPoints >= 0 ? '+' : ''}${deltaPoints.toFixed(1)} pts`
                            : hasCurrentBasis
                              ? 'No prior basis'
                              : 'No enquiries yet';
                          const showWeekToggle = item.key === 'week-pace' || item.key === 'week-vs-last';
                          if (item.key === 'today') {
                            const todayTile = {
                              title: item.currentLabel,
                              enquiries: item.currentEnquiries,
                              matters: item.currentMatters,
                              pct: hasCurrentBasis ? currentPctLabel : '—',
                              detail: hasCurrentBasis ? `${item.currentMatters} matters opened` : 'No enquiries yet',
                            };
                            const yesterdayHasBasis = item.previousEnquiries > 0;
                            const yesterdayTile = {
                              title: item.previousLabel,
                              enquiries: item.previousEnquiries,
                              matters: item.previousMatters,
                              pct: yesterdayHasBasis ? fmt.pct(item.previousPct) : '—',
                              detail: yesterdayHasBasis ? `${item.previousMatters} matters opened` : 'No enquiries yet',
                            };
                            return (
                              <div
                                key={item.key}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: 0,
                                  borderBottom: index < conversionRows.length - 1 || topAow.length > 0 ? `1px solid ${rowBorder}` : 'none',
                                }}
                              >
                                {[todayTile, yesterdayTile].map((tile, tileIndex) => (
                                  <div
                                    key={tile.title}
                                    style={{
                                      padding: '12px 12px 11px',
                                      borderRight: tileIndex === 0 ? `1px solid ${rowBorder}` : 'none',
                                      cursor: insightTarget ? 'pointer' : 'default',
                                      transition: 'background 0.16s ease, transform 0.16s ease',
                                      animation: `opsDashRowFade 0.25s ease ${0.1 + tileIndex * 0.06}s both`,
                                    }}
                                    onMouseEnter={insightTarget ? tileHover.enter : undefined}
                                    onMouseLeave={insightTarget ? tileHover.leave : undefined}
                                    onClick={insightTarget ? () => openInsight(insightTarget) : undefined}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: text, letterSpacing: '0.12px' }}>{tile.title}</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: text, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 5 }}>{fmt.int(tile.enquiries)}</div>
                                      </div>
                                      <div data-muted style={{ fontSize: 12, fontWeight: 700, color: text, opacity: 0.68, letterSpacing: '-0.02em', lineHeight: 1.05, transition: 'color 0.2s ease, opacity 0.2s ease' }}>
                                        {tile.pct}
                                      </div>
                                    </div>
                                    <div data-muted style={{ fontSize: 8, color: muted, marginTop: 4, opacity: 0.68, lineHeight: 1.25, transition: 'color 0.2s ease, opacity 0.2s ease' }}>
                                      {tile.detail}
                                    </div>
                                    <div
                                      data-hover-detail
                                      style={{
                                        ...hoverDetailStyle,
                                        fontSize: 8,
                                        color: muted,
                                        marginTop: 4,
                                        lineHeight: 1.2,
                                      }}
                                    >
                                      Conversion {tile.pct}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          // Compact diff cues
                          const enquiryDelta = hasCurrentBasis && hasPreviousBasis
                            ? item.currentEnquiries - item.previousEnquiries
                            : null;
                          const matterDelta = hasCurrentBasis && hasPreviousBasis
                            ? item.currentMatters - item.previousMatters
                            : null;
                          return (
                            <div
                              key={item.key}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: hasChart ? 4 : 3,
                                padding: '8px 12px 7px',
                                borderBottom: index < conversionRows.length - 1 || topAow.length > 0 ? `1px solid ${rowBorder}` : 'none',
                                background: 'transparent',
                                cursor: insightTarget ? 'pointer' : 'default',
                                transition: 'background 0.16s ease',
                                animation: `opsDashRowFade 0.25s ease ${0.12 + index * 0.06}s both`,
                              }}
                              onMouseEnter={insightTarget ? tileHover.enter : undefined}
                              onMouseLeave={insightTarget ? tileHover.leave : undefined}
                              onClick={insightTarget ? () => openInsight(insightTarget) : undefined}
                            >
                              {/* Title row with inline toggle */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: text, letterSpacing: '0.12px' }}>{item.title}</div>
                                {showWeekToggle ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                                    <button
                                      type="button"
                                      onClick={(event) => { event.stopPropagation(); setWeekComparisonMode('relative'); }}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: weekComparisonMode === 'relative' ? accent : muted,
                                        padding: '0 3px',
                                        fontSize: 8,
                                        fontWeight: weekComparisonMode === 'relative' ? 700 : 500,
                                        cursor: 'pointer',
                                        opacity: weekComparisonMode === 'relative' ? 1 : 0.6,
                                        textDecoration: weekComparisonMode === 'relative' ? 'none' : 'underline',
                                        textUnderlineOffset: '2px',
                                        textDecorationColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
                                      }}
                                    >
                                      so far
                                    </button>
                                    <span style={{ color: muted, fontSize: 7, opacity: 0.35 }}>·</span>
                                    <button
                                      type="button"
                                      onClick={(event) => { event.stopPropagation(); setWeekComparisonMode('full'); }}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: weekComparisonMode === 'full' ? accent : muted,
                                        padding: '0 3px',
                                        fontSize: 8,
                                        fontWeight: weekComparisonMode === 'full' ? 700 : 500,
                                        cursor: 'pointer',
                                        opacity: weekComparisonMode === 'full' ? 1 : 0.6,
                                        textDecoration: weekComparisonMode === 'full' ? 'none' : 'underline',
                                        textUnderlineOffset: '2px',
                                        textDecorationColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
                                      }}
                                    >
                                      full
                                    </button>
                                  </div>
                                ) : null}
                                <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: text, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{currentPctLabel}</div>
                              </div>
                              {/* Count row with inline diff badges */}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 19, fontWeight: 700, color: text, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
                                  {fmt.int(item.currentEnquiries)}
                                </div>
                                {enquiryDelta != null && enquiryDelta !== 0 ? (
                                  <span style={{ fontSize: 9, fontWeight: 600, color: enquiryDelta > 0 ? colours.green : colours.cta, letterSpacing: '-0.01em' }}>
                                    {enquiryDelta > 0 ? '▲' : '▼'}{Math.abs(enquiryDelta)}
                                  </span>
                                ) : null}
                                <span style={{ fontSize: 9, color: muted, opacity: 0.7 }}>→</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: text, opacity: 0.85 }}>
                                  {fmt.int(item.currentMatters)} matter{item.currentMatters === 1 ? '' : 's'}
                                </span>
                                {matterDelta != null && matterDelta !== 0 ? (
                                  <span style={{ fontSize: 9, fontWeight: 600, color: matterDelta > 0 ? colours.green : colours.cta, letterSpacing: '-0.01em' }}>
                                    {matterDelta > 0 ? '▲' : '▼'}{Math.abs(matterDelta)}
                                  </span>
                                ) : null}
                              </div>
                              {!hasCurrentBasis ? (
                                <div style={{ fontSize: 9, color: muted, opacity: 0.6 }}>No enquiries yet</div>
                              ) : null}
                              {hasChart ? <div style={{ width: '100%', animation: `opsDashFadeIn 0.3s ease ${0.2 + index * 0.06}s both` }}>{renderConversionChart(item)}</div> : null}
                            </div>
                          );
                        })}
                        {topAow.length > 0 && (
                          <div style={{ padding: '10px 14px 12px', animation: `opsDashFadeIn 0.3s ease 0.35s both` }}>
                            <div data-muted style={{ fontSize: 8, color: muted, marginBottom: 7, letterSpacing: '0.18px', textTransform: 'uppercase', opacity: 0.62, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Area of Work</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {topAow.slice(0, 3).map((item, aowIdx) => (
                                <div key={item.key} data-muted style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: `1px solid ${rowBorder}`, background: isDarkMode ? 'rgba(255,255,255,0.015)' : 'rgba(13,47,96,0.02)', opacity: 0.7, transition: 'color 0.2s ease, opacity 0.2s ease, background 0.2s ease', animation: `opsDashRowFade 0.2s ease ${0.38 + aowIdx * 0.04}s both` }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: aowColor(item.key), display: 'inline-block' }} />
                                  <span style={{ fontSize: 10, color: text }}>{item.key}</span>
                                  <span style={{ fontSize: 10, color: muted }}>{item.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                          <div
                            style={{ padding: '14px 14px 10px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.1s both' }}
                            onMouseEnter={tileHover.enter}
                            onMouseLeave={tileHover.leave}
                            onClick={() => openInsight('today')}
                          >
                            {bigNumber(fmt.int(todayEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 20 })}
                            <div data-muted style={{ fontSize: 10, color: muted, marginTop: 3, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Today</div>
                            {showPrev && todayEnquiry?.prevCount != null && (
                              <div data-muted style={{ fontSize: 9, color: muted, opacity: 0.5, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>yesterday {fmt.int(todayEnquiry.prevCount)}{delta(todayEnquiry.count || 0, todayEnquiry.prevCount, fmt.int)}</div>
                            )}
                          </div>
                          <div
                            style={{ padding: '14px 14px 10px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.16s both' }}
                            onMouseEnter={tileHover.enter}
                            onMouseLeave={tileHover.leave}
                            onClick={() => openInsight('weekToDate')}
                          >
                            {bigNumber(fmt.int(periodEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 20 })}
                            <div data-muted style={{ fontSize: 10, color: muted, marginTop: 3, transition: 'color 0.2s ease, opacity 0.2s ease' }}>This Week</div>
                            {showPrev && periodEnquiry?.prevCount != null && (
                              <div data-muted style={{ fontSize: 9, color: muted, opacity: 0.5, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>last week {fmt.int(periodEnquiry.prevCount)}{delta(periodEnquiry.count || 0, periodEnquiry.elapsedPrevCount ?? periodEnquiry.prevCount, fmt.int)}</div>
                            )}
                          </div>
                        </div>

                        {(monthEnquiry || isLoadingEnquiryMetrics) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                            <div
                              style={{ padding: '10px 14px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer', animation: 'opsDashRowFade 0.25s ease 0.2s both' }}
                              onMouseEnter={tileHover.enter}
                              onMouseLeave={tileHover.leave}
                              onClick={() => openInsight('monthToDate')}
                            >
                              {bigNumber(fmt.int(monthEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                              <div data-muted style={{ fontSize: 10, color: muted, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>This Month</div>
                            </div>
                            {(showPrev || isLoadingEnquiryMetrics) && (
                              <div
                                style={{ padding: '10px 14px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'default', animation: 'opsDashRowFade 0.25s ease 0.26s both' }}
                                onMouseEnter={tileHover.enter}
                                onMouseLeave={tileHover.leave}
                              >
                                {bigNumber(fmt.int(monthEnquiry?.prevCount || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                                <div data-muted style={{ fontSize: 10, color: muted, opacity: 0.45, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Last Month</div>
                              </div>
                            )}
                          </div>
                        )}

                        {((conversionMetric && conversionMetric.percentage != null && conversionMetric.context) || isLoadingEnquiryMetrics) && (() => {
                          const opened = conversionMetric?.context?.mattersOpenedMonthToDate || 0;
                          const total = conversionMetric?.context?.enquiriesMonthToDate || 0;
                          const pct = conversionMetric?.percentage || 0;
                          return (
                            <div style={{
                              padding: '10px 14px',
                              borderBottom: `1px solid ${cardBorder}`,
                              background: isDarkMode ? 'rgba(135,243,243,0.02)' : 'rgba(13,47,96,0.02)',
                              animation: 'opsDashFadeIn 0.3s ease 0.3s both',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                                {isLoadingEnquiryMetrics ? (
                                  <div style={{ width: 52, height: 18, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)', borderRadius: 2, animation: 'opsDashPulse 1.5s ease-in-out infinite' }} />
                                ) : (
                                  <span style={{ fontSize: 18, fontWeight: 700, color: text, letterSpacing: '-0.03em' }}>{fmt.pct(pct)}</span>
                                )}
                                <span style={{ fontSize: 10, color: muted }}>conversion</span>
                                <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>
                                  {isLoadingEnquiryMetrics ? (
                                    <div style={{ width: 140, height: 10, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)', borderRadius: 2, animation: 'opsDashPulse 1.5s ease-in-out infinite 0.1s' }} />
                                  ) : (
                                    <>
                                      <span style={{ fontWeight: 600, color: text }}>{fmt.int(opened)}</span> matters from <span style={{ fontWeight: 600, color: text }}>{fmt.int(total)}</span> enquiries
                                    </>
                                  )}
                                </span>
                              </div>
                              <div style={{ position: 'relative', height: 4, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)', overflow: 'hidden' }}>
                                <div style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  height: '100%',
                                  width: isLoadingEnquiryMetrics ? '38%' : `${Math.min(pct, 100)}%`,
                                  background: isLoadingEnquiryMetrics ? (isDarkMode ? 'rgba(135,243,243,0.3)' : 'rgba(54,144,206,0.25)') : colours.green,
                                  animation: isLoadingEnquiryMetrics ? 'opsDashPulse 1.5s ease-in-out infinite' : 'opsDashBarGrow 0.6s ease both',
                                  transformOrigin: 'left',
                                }} />
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
                  </>
                ) : (
                  <>
                    {/* ── Unclaimed: Hero ── */}
                    <div style={{ padding: '18px 16px 14px', animation: 'opsDashFadeIn 0.3s ease 0.12s both' }}>
                      {/* Claim feedback toast */}
                      {unclaimedClaimFeedback ? (
                        <div style={{ marginBottom: 12, padding: '9px 12px', border: `1px solid ${unclaimedClaimFeedback.tone === 'success' ? colours.green : colours.cta}`, background: unclaimedClaimFeedback.tone === 'success' ? (isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.06)') : (isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.06)'), fontSize: 11, color: text, lineHeight: 1.4 }}>
                          {unclaimedClaimFeedback.message}
                        </div>
                      ) : null}

                      {/* Big count + plain English headline */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        {bigNumber(
                          String(activeUnclaimedRange?.count ?? (unclaimedRange === 'today' ? unclaimedToday : unclaimedRange === 'week' ? unclaimedThisWeek : unclaimedLastWeek)),
                          { color: (activeUnclaimedRange?.count ?? claimSignal.unclaimed) > 0 ? colours.orange : text, loading: !!isLoadingEnquiryMetrics, size: 28 },
                        )}
                        <div style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', fontWeight: 500, lineHeight: 1.3 }}>
                          {(activeUnclaimedRange?.count ?? claimSignal.unclaimed) === 1
                            ? 'enquiry waiting'
                            : 'enquiries waiting'}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 4, lineHeight: 1.4 }}>
                        {(activeUnclaimedRange?.count ?? claimSignal.unclaimed) > 0
                          ? `These came in ${activeUnclaimedRange?.label?.toLowerCase() || 'recently'} and no one has picked them up yet.`
                          : 'All clear — every enquiry has been picked up.'}
                      </div>
                    </div>

                    {/* ── Pick up next: priority card ── */}
                    {priorityUnclaimedItem ? (
                      <div style={{
                        margin: '0 14px 12px',
                        padding: '14px 16px',
                        border: `1px solid ${isDarkMode ? 'rgba(32,178,108,0.28)' : 'rgba(32,178,108,0.22)'}`,
                        background: isDarkMode ? 'rgba(32,178,108,0.06)' : 'rgba(32,178,108,0.04)',
                        animation: 'opsDashFadeIn 0.35s ease 0.2s both',
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: colours.green, marginBottom: 8 }}>
                          Pick up next
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: aowColor(priorityUnclaimedItem.aow), display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{priorityUnclaimedItem.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', marginBottom: canClaimUnclaimed ? 12 : 0, lineHeight: 1.4 }}>
                          {priorityUnclaimedItem.aow} · {priorityUnclaimedItem.ageDays === 0 ? 'arrived today' : priorityUnclaimedItem.ageDays === 1 ? 'arrived yesterday' : `waiting ${priorityUnclaimedItem.ageDays} days`}
                          {priorityUnclaimedItem.value > 0 ? ` · ${fmt.currency(priorityUnclaimedItem.value)}` : ''}
                        </div>
                        {canClaimUnclaimed ? (
                          <button
                            type="button"
                            onClick={handleClaimPriorityUnclaimed}
                            disabled={isClaimingUnclaimed || !userEmail}
                            style={{
                              border: 'none',
                              background: colours.green,
                              color: '#fff',
                              padding: '9px 18px',
                              fontSize: 12,
                              fontWeight: 700,
                              width: '100%',
                              cursor: isClaimingUnclaimed ? 'default' : 'pointer',
                              opacity: isClaimingUnclaimed ? 0.7 : 1,
                              letterSpacing: '0.2px',
                              transition: 'opacity 0.2s ease',
                            }}
                          >
                            {isClaimingUnclaimed ? 'Claiming…' : 'Claim this enquiry'}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ margin: '0 14px 12px', padding: '14px 16px', border: `1px solid ${rowBorder}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                        <div style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'center' }}>
                          Nothing waiting to be picked up.
                        </div>
                      </div>
                    )}

                    {/* ── Breakdown by area ── */}
                    {unclaimedAowOptions.length > 0 && (
                      <div style={{ padding: '0 14px 10px', animation: 'opsDashFadeIn 0.35s ease 0.26s both' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 8 }}>
                          By area
                        </div>
                        {unclaimedAowOptions.slice(0, 5).map((item) => {
                          const maxCount = unclaimedAowOptions[0]?.count || 1;
                          const barPct = Math.max(8, Math.round((item.count / maxCount) * 100));
                          return (
                            <div
                              key={item.key}
                              onClick={() => setUnclaimedAowFilter(unclaimedAowFilter === item.key ? 'all' : item.key)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, cursor: 'pointer', userSelect: 'none' }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: aowColor(item.key), display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: unclaimedAowFilter === item.key ? text : (isDarkMode ? '#d1d5db' : '#374151'), fontWeight: unclaimedAowFilter === item.key ? 600 : 400, minWidth: 80 }}>{item.key}</span>
                              <div style={{ flex: 1, height: 6, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barPct}%`, background: aowColor(item.key), opacity: unclaimedAowFilter === item.key ? 0.9 : 0.5, transition: 'width 0.3s ease, opacity 0.2s ease' }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: text, minWidth: 16, textAlign: 'right' }}>{item.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Waiting list (oldest first) ── */}
                    {filteredUnclaimedItems.length > 0 && (
                      <div style={{ borderTop: `1px solid ${rowBorder}`, animation: 'opsDashFadeIn 0.35s ease 0.32s both' }}>
                        <div style={{ padding: '10px 14px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          {unclaimedAowFilter !== 'all' ? `${unclaimedAowFilter} enquiries` : 'Waiting longest'}
                        </div>
                        {filteredUnclaimedItems.slice(0, 4).map((item, index) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '9px 14px',
                              borderBottom: index < Math.min(filteredUnclaimedItems.length, 4) - 1 ? `1px solid ${rowBorder}` : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: aowColor(item.aow), display: 'inline-block', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                              <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 2 }}>
                                {item.aow}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: item.ageDays >= 7 ? colours.orange : (isDarkMode ? '#d1d5db' : '#374151'), fontWeight: item.ageDays >= 7 ? 600 : 400 }}>
                                {item.ageDays === 0 ? 'Today' : item.ageDays === 1 ? '1 day' : `${item.ageDays} days`}
                              </div>
                              {item.value > 0 && (
                                <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 1 }}>{fmt.currency(item.value)}</div>
                              )}
                            </div>
                            {canClaimUnclaimed && (
                              <button
                                type="button"
                                onClick={() => handleClaimUnclaimed(item)}
                                disabled={isClaimingUnclaimed || !userEmail}
                                style={{
                                  border: 'none',
                                  background: claimingItemId === item.id ? colours.green : (isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)'),
                                  color: claimingItemId === item.id ? '#fff' : colours.green,
                                  padding: '4px 10px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: isClaimingUnclaimed ? 'default' : 'pointer',
                                  opacity: isClaimingUnclaimed && claimingItemId !== item.id ? 0.4 : 1,
                                  flexShrink: 0,
                                  transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                                }}
                              >
                                {claimingItemId === item.id ? 'Claiming…' : 'Claim'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Time range toggle (subtle, bottom) ── */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '10px 14px', borderTop: `1px solid ${rowBorder}` }}>
                      {([
                        ['today', 'Today'],
                        ['week', 'This week'],
                        ['month', 'This month'],
                      ] as const).map(([key, label]) => {
                        const rangeData = visibleUnclaimedRanges.find((r) => r.key === key);
                        const count = rangeData?.count ?? 0;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setUnclaimedRange(key)}
                            style={{
                              border: 'none',
                              background: unclaimedRange === key ? (isDarkMode ? 'rgba(135,243,243,0.1)' : 'rgba(54,144,206,0.08)') : 'transparent',
                              color: unclaimedRange === key ? accent : muted,
                              padding: '5px 10px',
                              fontSize: 10,
                              fontWeight: unclaimedRange === key ? 700 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {label}{count > 0 ? ` (${count})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          </div>
          </div>

          {/* ── Right: Pipeline ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '2px 0 3px', letterSpacing: '0.2px' }}>Pipeline</div>
          {(!enquiryMetrics || enquiryMetrics.length === 0) ? (
            <div style={{ display: 'grid', gridTemplateColumns: isNarrow || layoutStacked ? '1fr' : '1fr 1fr', gap: 6, minHeight: pipelineRailHeight ?? 0, height: pipelineRailHeight }}>
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
                height: pipelineRailHeight,
              }}
            >

            {/* ── Column 2: Recent Activity (tabbed) ── */}
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0, maxHeight: isNarrow ? 380 : pipelineCardHeight, animation: 'opsDashFadeIn 0.35s ease 0.1s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              {/* Activity tabs */}
              <div style={{
                display: 'flex',
                borderBottom: `1px solid ${cardBorder}`,
              }}>
                {([['enquiries', 'Enquiries'], ['pitched', 'Pitched'], ['instructed', 'Instructed']] as const).map(([key, label]) => {
                  const tabCount = key === 'enquiries'
                    ? recents.length
                    : key === 'pitched'
                      ? recents.filter((r) => stageLevel(activityStageForRecord(r)) === 3).length
                      : recents.filter((r) => stageLevel(activityStageForRecord(r)) >= 4).length;
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
                      color: activityTab === key ? accent : muted,
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
                {detailsLoading && filteredRecents.length === 0 ? (
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
                      <span style={{ display: 'flex', justifyContent: 'center' }} title="Area of work">
                        <FiFolder size={9} style={{ color: theadText, opacity: 0.8 }} />
                      </span>
                      <span onClick={() => toggleSort('date')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sortKey === 'date' ? theadAccent : theadText, cursor: 'pointer', userSelect: 'none' }}>
                        Date{sortKey === 'date' ? (sortDesc ? ' ↓' : ' ↑') : ''}
                      </span>
                      <span onClick={() => toggleSort('name')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sortKey === 'name' ? theadAccent : theadText, cursor: 'pointer', userSelect: 'none' }}>
                        Prospect{sortKey === 'name' ? (sortDesc ? ' ↓' : ' ↑') : ''}
                      </span>
                      {/* Pipe separator */}
                      <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ width: 1, height: 12, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.10)' }} /></span>
                      <span onClick={() => toggleSort('aow')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sortKey === 'aow' ? theadAccent : theadText, paddingLeft: 6, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                        {alignStackedColumns ? 'Worktype' : 'AoW'}{sortKey === 'aow' ? (sortDesc ? ' ↓' : ' ↑') : ''}
                      </span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, textAlign: 'center', whiteSpace: 'nowrap' }}>FE</span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, textAlign: 'center' }}></span>
                    </div>
                    {/* Data rows */}
                    {filteredRecents.slice(0, activityVisibleCount).map((r, i) => {
                      const hasTeams = !!r.teamsLink;
                      const activityStage = activityStageForRecord(r);
                      const effectiveStage = effectiveStageForRecord(r);
                      const activityLevel = stageLevel(activityStage);
                      const effectiveLevel = stageLevel(effectiveStage);
                      const ageHours = hoursSince(r.date);
                      const enquiryDateParts = friendlyDateParts(r.date);
                      const enquiryFe = resolveFeeEarnerDisplay(r.teamsClaimed || r.poc);
                      const canPitch = activityLevel <= 2 && effectiveLevel < 3;
                      const followUpState = activityLevel === 3 && effectiveLevel === 3
                        ? (ageHours >= 48 ? 'late' : ageHours >= 24 ? 'due' : null)
                        : null;
                      return (
                        <div
                          key={i}
                          className="ops-enquiry-row"
                          style={{ borderBottom: `1px solid ${rowBorder}`, animation: `opsDashRowFade 0.25s ease ${0.03 * i}s both` }}
                        >
                          <div
                            style={{
                              padding: '6px 8px 6px 4px',
                              cursor: hasTeams ? 'pointer' : 'default',
                              display: 'grid',
                              gridTemplateColumns: matterGridTemplate,
                              alignItems: 'center',
                              gap: 0,
                              transition: 'background 0.15s ease',
                            }}
                            onClick={hasTeams ? () => window.open(r.teamsLink, '_blank') : undefined}
                            title={hasTeams ? `Open in Teams · ${r.teamsChannel || 'Channel'}` : undefined}
                            onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* AoW dot */}
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: aowColor(r.aow || ''), justifySelf: 'center' }} />

                            {/* Date */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 24 }}>
                              <span style={{ fontSize: 9, color: muted, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{enquiryDateParts.primary}</span>
                              <span style={{ fontSize: 8, color: muted, opacity: enquiryDateParts.secondary ? 0.9 : 0.45, whiteSpace: 'nowrap', lineHeight: 1.05 }}>{enquiryDateParts.secondary || '—'}</span>
                            </div>

                            {/* Name + email on hover */}
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                {hasTeams && (
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? colours.accent : colours.highlight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                                    <rect x="3.5" y="6" width="12" height="12" rx="2" />
                                    <path d="M7 10h5" />
                                    <path d="M9.5 10v6" />
                                    <circle cx="18.5" cy="9" r="2" />
                                    <rect x="16.5" y="12" width="5" height="6" rx="2" />
                                  </svg>
                                )}
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: text }}>{r.name || '—'}</span>
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
                                {followUpState && (
                                  <span style={{
                                    fontSize: 8,
                                    fontWeight: followUpState === 'late' ? 700 : 600,
                                    letterSpacing: '0.2px',
                                    color: colours.orange,
                                    opacity: followUpState === 'late' ? 1 : 0.72,
                                    flexShrink: 0,
                                  }}>
                                    {followUpState === 'late' ? 'Follow up' : 'Follow up soon'}
                                  </span>
                                )}
                              </div>
                              {r.email && (
                                <div className="ops-email-line" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
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

                            {/* Pipe separator */}
                            <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ width: 1, height: 14, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)' }} /></span>

                            {/* AoW label */}
                            <span style={{ fontSize: 8, fontWeight: 600, color: aowColor(r.aow || ''), letterSpacing: '0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 6 }}>
                              {r.aow || '—'}
                            </span>

                            {/* FE initials */}
                            <span style={{ fontSize: 8, fontWeight: 700, color: enquiryFe.label !== '—' ? colours.green : muted, letterSpacing: '0.3px', textAlign: 'center' }} title={enquiryFe.title ? `Claimed by ${enquiryFe.title}` : undefined}>
                              {enquiryFe.label}
                            </span>

                            {/* Pitch action */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                              {canPitch ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPitchBuilderForRecord(r);
                                  }}
                                  style={{
                                    border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)'}`,
                                    background: isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.10)',
                                    padding: '2px 6px',
                                    margin: 0,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    letterSpacing: '0.3px',
                                    color: accent,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    lineHeight: '14px',
                                    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
                                  }}
                                  title="Open pitch builder"
                                  onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.10)'; }}
                                >
                                  Pitch
                                </button>
                              ) : effectiveLevel >= 3 ? (
                                <FiCheckCircle size={12} style={{ color: colours.green, flexShrink: 0, opacity: 0.8 }} title="Pitched" />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const emptyIcon = activityTab === 'pitched' ? <FiSend size={18} />
                      : activityTab === 'instructed' ? <FiCheckCircle size={18} />
                      : <FiInbox size={18} />;
                    const emptyMsg = activityTab === 'pitched' ? 'No Recent Pitches'
                      : activityTab === 'instructed' ? 'No Recent Instructions'
                      : 'No Enquiries';
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
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 220 : pipelineCardHeight ?? 0, maxHeight: isNarrow ? 'none' : pipelineCardHeight, animation: 'opsDashFadeIn 0.35s ease 0.15s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
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
                    <span style={{ fontSize: 8, color: muted, opacity: 0.5, lineHeight: 1.1 }}>{matterVisibleCount} shown</span>
                  )}
                  {canSeeCcl && (() => {
                    const total = displayMatters.slice(0, matterVisibleCount).length;
                    const withCcl = displayMatters.slice(0, matterVisibleCount).filter(m => cclMap[m.matterId]).length;
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
                      <span style={{ width: 'auto', flexShrink: 0, display: 'flex', justifyContent: 'center' }} title="Area of work">
                        <FiFolder size={9} style={{ color: theadText, opacity: 0.8 }} />
                      </span>
                      <span onClick={() => toggleMatterSort('date')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'date' ? theadAccent : theadText, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}>Date{matterSortKey === 'date' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      <span onClick={() => toggleMatterSort('name')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'name' ? theadAccent : theadText, flex: 1, cursor: 'pointer', userSelect: 'none' }}>Matter{matterSortKey === 'name' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      {/* Pipe separator */}
                      <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ width: 1, height: 12, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.10)' }} /></span>
                      <span onClick={() => toggleMatterSort('aow')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'aow' ? theadAccent : theadText, flexShrink: 0, textAlign: 'left', paddingLeft: 6, cursor: 'pointer', userSelect: 'none' }}>{alignStackedColumns ? 'Worktype' : 'AoW'}{matterSortKey === 'aow' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      <span onClick={() => toggleMatterSort('fe')} style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: matterSortKey === 'fe' ? theadAccent : theadText, flexShrink: 0, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>FE{matterSortKey === 'fe' ? (matterSortDesc ? ' ↓' : ' ↑') : ''}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, flexShrink: 0, textAlign: 'center' }}>{canSeeCcl ? 'CCL' : ''}</span>
                    </div>
                    {displayMatters.slice(0, matterVisibleCount).map((m, i) => {
                      const ccl = canSeeCcl ? (cclMap[m.matterId] || null) : null;
                      const matterDateParts = friendlyDateParts(m.openDate);
                      const matterFe = resolveFeeEarnerDisplay(m.responsibleSolicitor);
                      const isCclStatusResolving = canSeeCcl && !!cclStatusResolvingByMatter[m.matterId];
                      const hasResolvedCclStatus = canSeeCcl && !!cclStatusResolvedByMatter[m.matterId];
                      const showCclStatusResolving = canSeeCcl && (!hasResolvedCclStatus || isCclStatusResolving);
                      const isExp = canSeeCcl && expandedCcl === m.matterId;
                      const isDemo = String(m.matterId || '').toUpperCase().startsWith('DEMO-');
                      const clioUrl = m.matterId && !isDemo ? `https://eu.app.clio.com/nc/#/matters/${m.matterId}` : undefined;
                      const cclStage = getCanonicalCclStage(ccl?.stage || ccl?.status);
                      const hasDraft = Boolean(ccl && ccl.version);
                      const isApproved = cclStage === 'reviewed' || cclStage === 'sent';
                      const cclDotColor = !ccl
                        ? (isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)')
                        : cclStage === 'sent'
                          ? colours.green
                          : cclStage === 'reviewed' || cclStage === 'generated'
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
                              if (canSeeCcl) {
                                setExpandedCcl(prev => prev === m.matterId ? null : m.matterId);
                              } else {
                                window.dispatchEvent(new CustomEvent('navigateToMatter', { detail: { matterId: m.matterId } }));
                              }
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* AoW dot */}
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: aowColor(m.practiceArea || ''), justifySelf: 'center' }} />

                            {/* Date */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 24 }}>
                              <span style={{ fontSize: 9, color: muted, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{matterDateParts.primary}</span>
                            </div>

                            {/* Ref + client */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                                <span
                                  style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, lineHeight: 1.15, flexShrink: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
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
                              <span style={{ fontSize: 9, color: muted, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.clientName || '—'}</span>
                            </div>

                            {/* Pipe separator */}
                            <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ width: 1, height: 14, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)' }} /></span>

                            {/* AoW label */}
                            <span style={{ fontSize: 8, fontWeight: 600, color: aowColor(m.practiceArea || ''), letterSpacing: '0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 6 }}>
                              {m.practiceArea || '—'}
                            </span>

                            {/* FE initials */}
                            <span style={{ fontSize: 8, fontWeight: 700, color: matterFe.label !== '—' ? colours.green : muted, letterSpacing: '0.3px', textAlign: 'center' }} title={matterFe.title || undefined}>
                              {matterFe.label}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                              {canSeeCcl && (
                                showCclStatusResolving ? (
                                  <div
                                    style={{
                                      border: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.3)' : 'rgba(75,85,99,0.16)'}`,
                                      background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(6,23,51,0.03)',
                                      color: muted,
                                      padding: alignStackedColumns ? '3px 6px' : '2px 4px',
                                      width: alignStackedColumns ? 78 : 62,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      lineHeight: 1.1,
                                      flexShrink: 0,
                                      opacity: 0.9,
                                    }}
                                    title="Resolving CCL status"
                                  >
                                    <FiRefreshCw size={alignStackedColumns ? 11 : 10} style={{ color: muted, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
                                  </div>
                                ) : (
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
                                      width: alignStackedColumns ? 78 : 62,
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
                                )
                              )}
                            </div>
                          </div>

                            {/* Expanded: CCL milestone line items */}
                            {isExp && (
                              <div style={{
                                padding: '4px 14px 10px',
                                animation: 'opsDashRowFade 0.15s ease both',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0,
                              }}>
                                {(() => {
                                  const openReview = (event: React.MouseEvent) => {
                                    event.stopPropagation();
                                    openCclLetterModal(m.matterId);
                                  };
                                  const toClio = Boolean(ccl?.uploadedToClio);
                                  const toNd = Boolean(ccl?.uploadedToNd);

                                  const milestones: { label: string; sublabel: string; done: boolean; icon: React.ReactNode; onClick?: (e: React.MouseEvent) => void }[] = [
                                    {
                                      label: hasDraft ? 'CCL ready' : 'Draft CCL',
                                      sublabel: hasDraft ? `v${ccl?.version || 1}` : 'Not started',
                                      done: hasDraft,
                                      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
                                      onClick: hasDraft ? openReview : undefined,
                                    },
                                    {
                                      label: isApproved ? 'Reviewed' : 'Review CCL',
                                      sublabel: isApproved ? (ccl?.finalizedAt ? new Date(ccl.finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Done') : 'Step through fields',
                                      done: isApproved,
                                      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
                                      onClick: hasDraft && !isApproved ? openReview : undefined,
                                    },
                                    {
                                      label: toClio ? 'In Clio' : 'Send to Clio',
                                      sublabel: toClio ? 'Sent' : 'Not sent yet',
                                      done: toClio,
                                      icon: <img src={clioIcon} alt="Clio" width={14} height={14} style={{ opacity: toClio ? 1 : 0.3, filter: `${isDarkMode ? 'invert(1) ' : ''}${toClio ? '' : 'grayscale(1)'}`.trim() || 'none' }} />,
                                    },
                                    {
                                      label: toNd ? 'In NetDocuments' : 'File in NetDocuments',
                                      sublabel: toNd ? 'Filed' : 'Not filed yet',
                                      done: toNd,
                                      icon: <img src={netdocumentsIcon} alt="NetDocuments" width={14} height={14} style={{ opacity: toNd ? 1 : 0.3, filter: `${isDarkMode ? 'invert(1) ' : ''}${toNd ? '' : 'grayscale(1)'}`.trim() || 'none' }} />,
                                    },
                                  ];

                                  return (
                                    <>
                                      {milestones.map((ms, mi) => {
                                        const dotColor = ms.done ? colours.green : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)');
                                        return (
                                          <div
                                            key={ms.label}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 10,
                                              padding: '5px 0',
                                              borderTop: mi > 0 ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` : 'none',
                                              cursor: ms.onClick ? 'pointer' : 'default',
                                              animation: `opsDashRowFade 0.2s ease ${0.05 * mi}s both`,
                                            }}
                                            onClick={ms.onClick}
                                            onMouseEnter={ms.onClick ? (e) => { e.currentTarget.style.background = hoverBg; } : undefined}
                                            onMouseLeave={ms.onClick ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}
                                          >
                                            {/* Status dot */}
                                            <span style={{
                                              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                              background: dotColor,
                                              boxShadow: ms.done ? `0 0 0 3px ${isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.12)'}` : 'none',
                                            }} />

                                            {/* Icon */}
                                            <span style={{
                                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                              width: 18, height: 18, flexShrink: 0,
                                              color: ms.done ? colours.green : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                                            }}>
                                              {ms.icon}
                                            </span>

                                            {/* Label + sublabel */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <span style={{
                                                fontSize: 10, fontWeight: 600,
                                                color: ms.done ? text : muted,
                                              }}>
                                                {ms.label}
                                              </span>
                                            </div>

                                            {/* Sublabel / status */}
                                            <span style={{
                                              fontSize: 8.5, fontWeight: 600, flexShrink: 0,
                                              color: ms.done ? colours.green : (isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'),
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.3px',
                                            }}>
                                              {ms.sublabel}
                                            </span>
                                          </div>
                                        );
                                      })}
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

          </div>
        </div>
      )}

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
          setCclAiReviewedFields(prev => {
            const existing = new Set(prev[cclFieldsModal] || []);
            if (existing.has(key)) existing.delete(key); else existing.add(key);
            return { ...prev, [cclFieldsModal]: existing };
          });
        };

        // Helper: render a single field value row with optional review checkbox
        const renderFieldRow = (key: string, label: string, val: string) => {
          const isAiFilled = !!aiFields[key];
          const isReviewed = reviewedSet.has(key);
          const priorValue = aiBaseFields[key] || '';
          const isNewFromAi = isAiFilled && !priorValue.trim();
          const isUpdatedByAi = isAiFilled && priorValue.trim() && aiFields[key] !== priorValue;
          const checkboxBorder = isDarkMode ? colours.dark.borderColor : '#94a3b8';
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
                  {isReviewed && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700, lineHeight: 1 }}>✓</span>}
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
                background: isDarkMode ? colours.darkBlue : '#fff',
                border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.15)'}`,
                padding: '18px 20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
                      color: isDarkMode ? '#0a1c32' : '#fff', background: colours.highlight,
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
                        fontSize: 9, color: isDarkMode ? '#fca5a5' : '#7f1d1d', lineHeight: 1.45,
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
        const cached = cclDraftCache[cclLetterModal];
        const draft = cached?.fields;
        const docUrl = cached?.docUrl;
        const ccl = cclMap[cclLetterModal];
        const matter = displayMatters.find(m => m.matterId === cclLetterModal);
        console.log('[CCL modal render]', { matterId: cclLetterModal, hasCached: cached !== undefined, hasDraft: !!draft, loading: cclDraftLoading });
        if (!draft) {
          const isLoading = cclDraftLoading === cclLetterModal;
          const openedAt = cclLetterModalOpenedAtRef.current;
          const elapsed = Date.now() - openedAt;
          const isStale = isLoading && elapsed > 6000;
          // Draft still loading or empty — portal to body so contain:paint doesn't trap it
          return createPortal(
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 30000,
                background: 'rgba(0, 3, 25, 0.82)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
              }}
              onClick={handleCclLetterBackdropClick}
            >
              <style>{`
                @keyframes cclLoadPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                @keyframes cclLoadBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
              `}</style>
              <button type="button" onClick={closeCclLetterModal} style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label="Close">&times;</button>
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ textAlign: 'center', color: '#f3f4f6', maxWidth: 340, width: '100%', padding: '0 20px' }}
              >
                {isLoading && !isStale ? (
                  <>
                    {/* Matter context header */}
                    {matter && (
                      <div style={{ marginBottom: 24, opacity: 0.6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: colours.accent }}>{matter.displayNumber}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{matter.clientName || 'Client'}{matter.practiceArea ? ` · ${matter.practiceArea}` : ''}</div>
                      </div>
                    )}

                    {/* Animated ring */}
                    <div style={{ position: 'relative', width: 44, height: 44, margin: '0 auto 20px' }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        border: '2px solid rgba(135, 243, 243, 0.08)',
                        borderRadius: '50%',
                      }} />
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        border: '2px solid transparent',
                        borderTopColor: colours.accent,
                        borderRightColor: colours.accent,
                        borderRadius: '50%',
                        animation: 'helix-spin 0.8s linear infinite',
                      }} />
                      <div style={{
                        position: 'absolute',
                        inset: 6,
                        border: '2px solid transparent',
                        borderBottomColor: 'rgba(54, 144, 206, 0.5)',
                        borderRadius: '50%',
                        animation: 'helix-spin 1.2s linear infinite reverse',
                      }} />
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, marginBottom: 6 }}>Preparing your letter</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, animation: 'cclLoadPulse 2.5s ease-in-out infinite' }}>
                      Retrieving draft fields and AI context
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginTop: 20, height: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', maxWidth: 200, margin: '20px auto 0' }}>
                      <div style={{ width: '50%', height: '100%', background: `linear-gradient(90deg, transparent, ${colours.accent}, transparent)`, animation: 'cclLoadBar 1.8s ease-in-out infinite' }} />
                    </div>
                  </>
                ) : isStale ? (
                  <>
                    {matter && (
                      <div style={{ marginBottom: 20, opacity: 0.5 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: colours.orange }}>{matter.displayNumber}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{matter.clientName || 'Client'}</div>
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, marginBottom: 6, color: colours.orange }}>Taking longer than expected</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>The server may be warming up. Try again.</div>
                    <button
                      type="button"
                      onClick={() => {
                        console.log('[CCL modal] manual retry for', cclLetterModal);
                        setCclDraftLoading(cclLetterModal);
                        cclLetterModalOpenedAtRef.current = Date.now();
                        fetch(`/api/ccl/${encodeURIComponent(cclLetterModal!)}`)
                          .then(res => res.ok ? res.json() : Promise.reject(new Error(`${res.status}`)))
                          .then(data => {
                            setCclDraftCache(prev => ({ ...prev, [cclLetterModal!]: { fields: data?.json || null, docUrl: data?.url || undefined } }));
                            setCclDraftLoading(prev => prev === cclLetterModal ? null : prev);
                          })
                          .catch(() => {
                            setCclDraftCache(prev => ({ ...prev, [cclLetterModal!]: { fields: null } }));
                            setCclDraftLoading(prev => prev === cclLetterModal ? null : prev);
                          });
                      }}
                      style={{
                        background: colours.highlight,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 0,
                        padding: '8px 20px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginRight: 8,
                        fontFamily: "'Raleway', Arial, sans-serif",
                      }}
                    >Retry</button>
                    <button
                      type="button"
                      onClick={closeCclLetterModal}
                      style={{
                        background: 'none',
                        color: '#A0A0A0',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 0,
                        padding: '8px 20px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Raleway', Arial, sans-serif",
                      }}
                    >Close</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>No draft found</div>
                    <div style={{ fontSize: 12, color: '#A0A0A0' }}>Create a draft first, then review it here.</div>
                  </>
                )}
              </div>
            </div>,
            document.body
          );
        }

        const rawDraft = draft as Record<string, unknown>;
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

        const cclStage = getCanonicalCclStage(ccl?.stage || ccl?.status);
        const statusLabel = getCanonicalCclLabel(ccl?.stage || ccl?.status, ccl?.label);
        const statusColor = cclStage === 'sent' ? colours.green
          : cclStage === 'reviewed' || cclStage === 'generated' ? (isDarkMode ? colours.accent : colours.highlight)
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
                detail: 'Start with the first flagged step below. The draft updates as you go.',
              }
            : persistedTrace
              ? {
                  tone: 'success' as const,
                  title: 'Review ready',
                  detail: 'Start with the first flagged step below. This panel is using the latest saved AI run.',
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
          setCclAiReviewedFields((prev) => {
            const existing = new Set(prev[cclLetterModal] || []);
            if (existing.has(key)) existing.delete(key); else existing.add(key);
            return { ...prev, [cclLetterModal]: existing };
          });
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
        const unresolvedPlaceholders = Array.from(new Set(
          [...rawGeneratedContent.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => String(m[1] || '').trim()).filter(Boolean)
        ));
        const hasUnresolved = unresolvedPlaceholders.length > 0;
        const canApprove = getCanonicalCclStage(ccl?.stage || ccl?.status) === 'generated' && !hasUnresolved;

        const orderedTemplateFieldKeys = [
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
        ];
        const suppressedReviewFieldKeys = new Set([
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
        const lowConfidenceReviewFieldKeys = visibleReviewFieldKeys.filter((key) => {
          const meta = fieldMeta[key];
          const ptFieldScore = cclPressureTestByMatter[cclLetterModal]?.fieldScores?.[key];
          const isAiBacked = aiFieldKeys.includes(key);
          return isAiBacked && (
            unresolvedPlaceholders.includes(key)
            || !!ptFieldScore?.flag
            || meta?.confidence === 'inferred'
            || meta?.confidence === 'unknown'
          );
        });
        const effectiveReviewFieldKeys = lowConfidenceReviewFieldKeys;
        const allClickableFieldKeys = visibleReviewFieldKeys;
        const visibleReviewFieldCount = effectiveReviewFieldKeys.length;

        // Confidence breakdown for summary card
        const confidenceBreakdown = { data: 0, inferred: 0, templated: 0, unknown: 0 };
        for (const key of aiFieldKeys) {
          const tier = fieldMeta[key]?.confidence;
          if (tier && tier in confidenceBreakdown) confidenceBreakdown[tier as keyof typeof confidenceBreakdown]++;
        }

        const summaryDismissed = !!cclReviewSummaryDismissedByMatter[cclLetterModal];
        const showSummaryLanding = !summaryDismissed && !traceLoading && !isStreamingNow && (hasAiData || !!persistedTrace);

        const savedSelectedField = cclSelectedReviewFieldByMatter[cclLetterModal];
        const isExplicitFullLetter = savedSelectedField === '__none__';
        const selectedFieldKey = showSummaryLanding
          ? null
          : isExplicitFullLetter
            ? null
            : (savedSelectedField && (effectiveReviewFieldKeys.includes(savedSelectedField) || allClickableFieldKeys.includes(savedSelectedField)))
              ? savedSelectedField
              : (effectiveReviewFieldKeys.find(key => !reviewedSet.has(key)) || effectiveReviewFieldKeys[0] || null);
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
        const currentDecisionNumber = selectedFieldKey
          ? Math.max(effectiveReviewFieldKeys.indexOf(selectedFieldKey) + 1, 1)
          : 0;
        const selectedFieldIsReviewed = selectedFieldKey ? reviewedSet.has(selectedFieldKey) : false;
        const selectedFieldPressureTest = selectedFieldKey ? cclPressureTestByMatter[cclLetterModal]?.fieldScores?.[selectedFieldKey] : undefined;
        const selectedFieldDecisionReason = structuredChoiceConfig
          ? 'Choose the branch that should appear in the approved letter preview on the left.'
          : selectedFieldUnresolved
          ? 'No wording has been filled in yet for this part of the letter.'
          : selectedFieldPressureTest?.reason
            ? selectedFieldPressureTest.reason
            : selectedFieldMeta?.confidence === 'unknown'
              ? 'We do not have a reliable source for this, so a fee earner needs to decide it.'
              : selectedFieldMeta?.confidence === 'inferred'
                ? 'This wording was inferred from the intake context, so it needs a human check.'
                : selectedFieldMeta?.prompt || 'Check that this reads correctly before you move on.';
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
        const reviewRailPrimed = !!cclReviewRailPrimedByMatter[cclLetterModal];
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
        const selectedFieldIndex = selectedFieldKey ? effectiveReviewFieldKeys.indexOf(selectedFieldKey) : -1;
        const nextDecisionFieldKey = selectedFieldIndex >= 0
          ? effectiveReviewFieldKeys.slice(selectedFieldIndex + 1).find((key) => !reviewedSet.has(key))
            || effectiveReviewFieldKeys[selectedFieldIndex + 1]
            || null
          : null;
        const selectionProgressPercent = visibleReviewFieldCount > 0
          ? Math.min(100, Math.max(0, (reviewedDecisionCount / visibleReviewFieldCount) * 100))
          : 0;
        const isFullLetterActive = !selectedFieldKey;
        const placeholderLabels = Object.fromEntries(Object.entries(fieldMeta).map(([key, meta]) => [key, meta.label]));
        const previewPlaceholderPromptPresent = /\[[^\]]+\]/.test(rawPreviewTemplate);
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
          { key: 'placeholder', label: 'AI placeholder', show: previewFieldStateList.some((state) => state.isUnresolved) || previewPlaceholderPromptPresent, swatch: 'rgba(255,140,0,0.14)', border: 'rgba(255,140,0,0.40)', text: '#7c2d12' },
          { key: 'static', label: 'Static text', show: true, swatch: 'rgba(255,255,255,0.96)', border: 'rgba(13,47,96,0.18)', text: '#334155' },
          { key: 'reviewed', label: 'Approved', show: previewFieldStateList.some((state) => state.isReviewed), swatch: 'rgba(32,178,108,0.14)', border: 'rgba(32,178,108,0.45)', text: colours.green },
        ].filter((item) => item.show);
        const selectedFieldState = selectedFieldKey ? previewFieldStates[selectedFieldKey] : undefined;
        const selectedFieldCue = selectedFieldState?.isUnresolved
          ? { label: 'AI placeholder', swatch: 'rgba(255,140,0,0.14)', border: 'rgba(255,140,0,0.40)', text: '#fbbf24' }
          : (selectedFieldState?.isAiGenerated || selectedFieldState?.isAiUpdated)
            ? { label: 'AI output', swatch: 'rgba(54,144,206,0.18)', border: 'rgba(54,144,206,0.45)', text: colours.accent }
            : selectedFieldState?.isMailMergeValue
              ? { label: 'Mail merge', swatch: 'rgba(135,243,243,0.14)', border: 'rgba(135,243,243,0.48)', text: colours.accent }
              : { label: 'Static text', swatch: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: '#d1d5db' };
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
        const setFocusedReviewField = (key: string | null, fromScrollSpy = false) => {
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
            requestAnimationFrame(() => scrollReviewFieldIntoView(key));
          }
        };
        const focusNextDecision = () => {
          if (!nextDecisionFieldKey) return;
          setFocusedReviewField(nextDecisionFieldKey);
          requestAnimationFrame(() => scrollReviewFieldIntoView(nextDecisionFieldKey));
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
          setCclApprovingMatter(cclLetterModal);
          try {
            const result = await approveCcl(cclLetterModal, 'approved');
            if (result.ok) {
              setCclMap(prev => ({
                ...prev,
                [cclLetterModal]: {
                  ...prev[cclLetterModal],
                  status: 'reviewed',
                  stage: 'reviewed',
                  label: 'Reviewed',
                  finalizedAt: result.finalizedAt || new Date().toISOString(),
                },
              }));
            }
          } catch (err) {
            console.error('[ccl] Approval error:', err);
          } finally {
            setCclApprovingMatter(null);
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
        const ptHasAiContext = hasAiData || !!persistedTrace;
        const ptCanRun = ptHasAiContext && !ptResultHere && !ptRunningHere;
        const shouldShowReviewRail = !isMobileReview && (
          reviewRailPrimed
          || !!selectedFieldKey
          || traceLoading
          || isStreamingNow
          || hasAiData
          || !!persistedTrace
          || visibleReviewFieldCount > 0
          || ptRunningHere
        );
        const loadingReviewContext = !selectedFieldKey && (traceLoading || isStreamingNow);
        const noAiReviewContext = !selectedFieldKey && !loadingReviewContext && !hasAiData && !persistedTrace;
        const noClarificationsQueued = !selectedFieldKey && !loadingReviewContext && !noAiReviewContext && visibleReviewFieldCount === 0 && !showSummaryLanding;
        const showReviewRailSkeleton = shouldShowReviewRail && loadingReviewContext;
        const reviewValueFontSize = isMobileReview ? 11 : 10;
        const reviewPaneHeight = isMobileReview ? (selectedFieldKey ? 'min(50vh, 440px)' : '0px') : 'auto';
        const previewBottomPadding = isMobileReview && selectedFieldKey ? 380 : 22;
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
            // If at top of scroll, deselect to show "Full letter"
            if (el.scrollTop < 30) {
              bestKey = null;
            }
            const currentKey = cclSelectedFieldRef.current;
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
                width: isMobileReview ? '100%' : 'min(1280px, 100%)',
                height: '100%',
                maxHeight: isMobileReview ? '100vh' : 'calc(100vh - 40px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(6, 23, 51, 0.98)',
                border: '1px solid rgba(135, 243, 243, 0.12)',
                boxShadow: '0 24px 72px rgba(0, 3, 25, 0.62)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobileReview ? '12px 14px' : '14px 18px', borderBottom: '1px solid rgba(135, 243, 243, 0.08)', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobileReview ? 12 : 11, fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {matter?.displayNumber || 'Matter'}
                    <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {matter?.clientName || normalizedDraft.insert_clients_name || 'Client'}</span>
                  </div>

                  <div style={{ marginTop: 8, height: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${selectionProgressPercent}%`, height: '100%', background: colours.accent, transition: 'width 0.18s ease' }} />
                  </div>
                </div>
                <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#A0A0A0', whiteSpace: 'nowrap' }}>
                  {selectedFieldKey ? `Step ${Math.max(currentDecisionNumber, 1)} of ${visibleReviewFieldCount}` : visibleReviewFieldCount > 0 ? `${visibleReviewFieldCount} to check` : 'No clarifications'}
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

                <div style={{ display: 'grid', gridTemplateColumns: shouldShowReviewRail ? 'minmax(0, 3fr) minmax(340px, 2fr)' : 'minmax(0, 1fr)', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                  <div
                    className="ccl-review-scroll"
                    ref={(el) => {
                      cclReviewPreviewRef.current = el;
                    }}
                    onScroll={syncVisibleReviewGroup}
                    style={{ overflow: 'auto', padding: 0, paddingBottom: previewBottomPadding, background: '#d5d8dc' }}
                  >
                  <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
                    {reviewSectionTabs.length > 0 && (
                      <div data-review-tabs-header="true" style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        padding: isMobileReview ? '12px 12px 10px' : '10px 18px 8px',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                        background: isMobileReview ? '#f6f7f9' : 'rgba(213,216,220,0.92)',
                        backdropFilter: isMobileReview ? 'none' : 'blur(8px)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        display: 'grid',
                        gap: 8,
                      }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          <button
                            type="button"
                            onClick={() => {
                              cclScrollSpyLockRef.current = true;
                              setTimeout(() => { cclScrollSpyLockRef.current = false; }, 600);
                              setFocusedReviewField(null, true);
                              cclReviewPreviewRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{
                              border: `1px solid ${isFullLetterActive ? 'rgba(54,144,206,0.34)' : 'rgba(13,47,96,0.12)'}`,
                              background: isFullLetterActive ? 'rgba(214,232,255,1)' : '#ffffff',
                              color: '#061733',
                              padding: isMobileReview ? '7px 10px' : '5px 9px',
                              fontSize: isMobileReview ? 10 : 9,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Full letter
                          </button>
                          {reviewSectionTabs.map((tab) => {
                            const done = tab.completedCount === tab.totalCount;
                            return (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => {
                                  setFocusedReviewField(tab.focusKey);
                                  requestAnimationFrame(() => scrollReviewGroupIntoView(tab.title));
                                }}
                                style={{
                                  border: `1px solid ${tab.isActive ? 'rgba(54,144,206,0.34)' : done ? 'rgba(32,178,108,0.22)' : 'rgba(13,47,96,0.12)'}`,
                                  background: tab.isActive ? 'rgba(214,232,255,1)' : done ? 'rgba(32,178,108,0.08)' : '#ffffff',
                                  color: tab.isActive ? '#061733' : done ? colours.green : '#334155',
                                  padding: isMobileReview ? '7px 10px' : '5px 9px',
                                  fontSize: isMobileReview ? 10 : 9,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {tab.title}{!done && tab.totalCount > 1 ? ` (${tab.completedCount}/${tab.totalCount})` : done ? ' ✓' : ''}
                              </button>
                            );
                          })}
                        </div>
                        {previewLegendItems.length > 0 && (
                          <div ref={cclLegendRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 2, borderTop: '1px solid rgba(0,0,0,0.06)', maxHeight: 60, opacity: 1, transition: 'max-height 0.25s ease, opacity 0.2s ease, padding-top 0.25s ease' }}>
                            {previewLegendItems.map((item) => (
                              <span
                                key={item.key}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: isMobileReview ? '6px 8px' : '4px 7px',
                                  fontSize: isMobileReview ? 10 : 9,
                                  color: item.text,
                                  background: 'rgba(255,255,255,0.75)',
                                  border: '1px solid rgba(0,0,0,0.08)',
                                }}
                              >
                                <span style={{ width: 10, height: 10, background: item.swatch, borderBottom: `1px solid ${item.border}`, boxShadow: item.key === 'reviewed' ? 'inset 0 -2px 0 rgba(32,178,108,0.7)' : 'none' }} />
                                {item.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div ref={cclReviewPageRefCallback} data-ccl-page-container style={{
                      maxWidth: isMobileReview ? '100%' : 680,
                      margin: isMobileReview ? '0' : '0 auto',
                      padding: isMobileReview ? '28px 24px 28px' : '24px 0 40px',
                      color: '#0f172a',
                      boxSizing: 'border-box',
                      fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                      fontSize: isMobileReview ? 14 : '10pt',
                      lineHeight: isMobileReview ? 1.8 : 1.75,
                      background: isMobileReview ? '#ffffff' : 'transparent',
                      minHeight: isMobileReview ? 'calc(100% - 52px)' : 'auto',
                    }}>
                    {/* Letterhead */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                      <div>
                        <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/Asset-2@72x.png" alt="Helix Law" style={{ width: 140, height: 'auto', display: 'block' }} />
                        <div style={{ fontSize: 8.5, color: '#94a3b8', lineHeight: 1.5, marginTop: 6 }}>
                          Second Floor, Britannia House<br />21 Station Street, Brighton, BN1 4DE<br />0345 314 2044 · helix-law.com
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' as const, fontSize: 10.5, lineHeight: 1.5, color: '#94a3b8' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2F60', marginBottom: 2 }}>
                          {matter?.displayNumber || ''}
                        </div>
                        <div>Client Care Letter</div>
                        <div>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      </div>
                    </div>
                    <DocumentRenderer
                      template={rawPreviewTemplate}
                      fieldValues={structuredReviewFields}
                      interactiveFieldKeys={allClickableFieldKeys}
                      activeFieldKey={selectedFieldKey}
                      placeholderLabels={placeholderLabels}
                      fieldStates={previewFieldStates}
                      fieldElementRefs={cclReviewFieldElementRefs}
                      editableFieldKey={!structuredChoiceConfig ? selectedFieldKey : null}
                      onFieldValueChange={!structuredChoiceConfig ? (_fieldKey, value) => applySelectedFieldValue(value) : undefined}
                      onFieldClick={(fieldKey) => setFocusedReviewField(fieldKey === selectedFieldKey ? null : fieldKey)}
                      rootRef={cclRendererRootRef}
                      pageBreaks={isMobileReview ? undefined : cclPageBreaks}
                      totalPages={cclTotalPages}
                      contentPaddingX={isMobileReview ? 24 : 52}
                      contentPaddingY={isMobileReview ? undefined : { top: 48, bottom: 56 }}
                    />
                    </div>
                    </div>
                  </div>

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
                    <div key={`rail-header:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '10px 16px' : '14px 18px', flexShrink: 0, animation: 'opsDashFadeIn 0.24s ease both' }}>
                      {isMobileReview && (
                        <div style={{ width: 44, height: 4, background: 'rgba(148,163,184,0.42)', borderRadius: 999, margin: '0 auto 10px' }} />
                      )}
                      {selectedFieldKey && selectedFieldMeta ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0' }}>
                              {currentDecisionNumber} / {visibleReviewFieldCount}
                            </div>
                            <button
                              type="button"
                              onClick={() => setFocusedReviewField(null)}
                              style={{ border: 'none', background: 'transparent', color: '#A0A0A0', cursor: 'pointer', padding: 0, fontSize: isMobileReview ? 10 : 9 }}
                            >
                              ← back
                            </button>
                          </div>
                          <div style={{
                            marginTop: 6,
                            padding: isMobileReview ? '8px 10px' : '7px 9px',
                            borderLeft: `3px solid ${selectedFieldCue.border}`,
                            background: selectedFieldCue.swatch,
                            display: 'grid',
                            gap: 6,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '2px 6px',
                                fontSize: isMobileReview ? 10 : 9,
                                fontWeight: 700,
                                color: selectedFieldCue.text,
                                border: `1px solid ${selectedFieldCue.border}`,
                                background: 'rgba(2, 6, 23, 0.18)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}>
                                <span style={{ width: 8, height: 8, background: selectedFieldCue.swatch, borderBottom: `1px solid ${selectedFieldCue.border}` }} />
                                {selectedFieldCue.label}
                              </span>
                              {selectedFieldState?.isReviewed && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 6px',
                                  fontSize: isMobileReview ? 10 : 9,
                                  fontWeight: 700,
                                  color: colours.green,
                                  border: '1px solid rgba(32,178,108,0.45)',
                                  background: 'rgba(32,178,108,0.10)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}>
                                  Approved
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', lineHeight: 1.25 }}>
                              {selectedFieldMeta.label}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            CCL Review
                          </div>
                          <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', marginTop: 6, lineHeight: 1.25 }}>
                            {aiState.title}
                          </div>
                          {isStreamingNow && (
                            <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#94a3b8', marginTop: 6, lineHeight: 1.45 }}>
                              {aiState.detail}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div key={`rail-body:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '12px 16px' : '12px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, alignContent: 'start', animation: 'opsDashFadeIn 0.24s ease both' }}>
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
                                <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#94a3b8', fontWeight: 600 }}>
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
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#94a3b8', lineHeight: 1.45 }}>
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
                          {/* Field count + duration */}
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: isMobileReview ? 16 : 15, fontWeight: 700, color: '#f3f4f6' }}>
                              {totalAiFields} fields generated
                            </div>
                            {aiRes?.durationMs && (
                              <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                                {(aiRes.durationMs / 1000).toFixed(1)}s
                              </div>
                            )}
                          </div>

                          {/* Confidence breakdown — muted single line */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: '#94a3b8' }}>
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
                              ? <><strong style={{ color: '#f3f4f6' }}>{visibleReviewFieldCount} field{visibleReviewFieldCount === 1 ? '' : 's'}</strong> need{visibleReviewFieldCount === 1 ? 's' : ''} review — AI-inferred or no data source.</>
                              : 'All fields backed by hard data or standard templates.'}
                          </div>

                          {/* Data sources */}
                          {aiRes?.dataSources && aiRes.dataSources.length > 0 && (
                            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.45 }}>
                              Sources: {aiRes.dataSources.join(', ')}
                            </div>
                          )}

                          {/* Begin Review CTA */}
                          <button
                            type="button"
                            onClick={() => setCclReviewSummaryDismissedByMatter((prev) => ({ ...prev, [cclLetterModal]: true }))}
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
                            {visibleReviewFieldCount > 0 ? `Begin Review (${visibleReviewFieldCount} field${visibleReviewFieldCount === 1 ? '' : 's'})` : 'Review Letter'} →
                          </button>
                        </div>
                      )}

                      {noClarificationsQueued && (
                        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Review Status
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#d1d5db', lineHeight: 1.45, fontWeight: 700 }}>
                            No low-confidence clarifications are queued.
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#94a3b8', lineHeight: 1.45 }}>
                            {ptResultHere
                              ? `Safety Net scored ${ptResultHere.totalFields} fields with ${ptResultHere.flaggedCount} flagged. Review the formatted letter on the left.`
                              : 'Review the letter on the left, or run a Safety Net check to verify AI output against source evidence.'}
                          </div>
                          {ptCanRun && (
                            <button
                              type="button"
                              onClick={() => void runPressureTest(cclLetterModal)}
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
                                  <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.45, marginTop: 2, width: '100%' }}>
                                    Sources: {ptResultHere.dataSources.join(', ')}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Safety Net in-progress feedback */}
                      {ptRunningHere && !selectedFieldKey && (
                        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                              Safety Net
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
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
                                  : <span style={{ color: '#94a3b8' }}>·</span>}
                              </span>
                              <span style={{
                                fontSize: 11, lineHeight: 1.45,
                                color: step.status === 'active' ? '#f3f4f6' : step.status === 'done' ? colours.green : step.status === 'error' ? colours.cta : '#94a3b8',
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
                      <div style={{
                        padding: 0,
                        display: 'grid',
                        gap: 8,
                        animation: 'opsDashFadeIn 0.2s ease 0.04s both',
                      }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: 'rgba(160,160,160,0.72)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Current Value
                          </div>
                        </div>

                        {!structuredChoiceConfig ? (
                          <textarea
                            key={selectedFieldKey || '__none'}
                            ref={autoSizeReviewTextarea}
                            value={selectedFieldOutput}
                            onChange={(event) => {
                              autoSizeReviewTextarea(event.target);
                              applySelectedFieldValue(event.target.value);
                            }}
                            placeholder="Enter approved wording for this field"
                            rows={1}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              border: `1px solid ${colours.dark.borderColor}`,
                              background: colours.dark.cardBackground,
                              color: '#f3f4f6',
                              padding: isMobileReview ? '10px 11px' : '9px 10px',
                              fontSize: reviewValueFontSize,
                              lineHeight: 1.5,
                              resize: 'none',
                              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                              minHeight: isMobileReview ? 90 : 78,
                              overflow: 'hidden',
                            }}
                          />
                        ) : (
                          <div style={{
                            fontSize: reviewValueFontSize,
                            color: selectedFieldOutput ? '#f3f4f6' : '#fca5a5',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            padding: isMobileReview ? '10px 0 2px' : '8px 0 2px',
                            minHeight: 48,
                          }}>
                            {selectedFieldOutput || 'Needs input'}
                          </div>
                        )}
                      </div>

                      <div style={{
                        paddingTop: 10,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'grid',
                        gap: 8,
                        animation: 'opsDashFadeIn 0.2s ease 0.16s both',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Step Action
                          </div>
                          {selectedFieldKey && !nextDecisionFieldKey && canApprove && (
                            <button
                              type="button"
                              style={{ fontSize: isMobileReview ? 11 : 10, fontWeight: 700, color: '#fff', background: colours.green, padding: isMobileReview ? '10px 11px' : '8px 10px', cursor: cclApprovingMatter === cclLetterModal ? 'wait' : 'pointer', textAlign: 'center' as const, border: 'none' }}
                              onClick={handleApproveCurrentLetter}
                            >
                              {cclApprovingMatter === cclLetterModal ? 'Approving…' : 'Approve full letter'}
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          style={{ fontSize: isMobileReview ? 13 : 12, fontWeight: 700, color: '#061733', background: colours.green, padding: isMobileReview ? '14px 14px' : '11px 14px', cursor: 'pointer', textAlign: 'center' as const, border: 'none', minHeight: isMobileReview ? 48 : 'auto' }}
                          onClick={() => {
                            if (!selectedFieldKey) return;
                            toggleFieldReviewed(selectedFieldKey);
                            if (!selectedFieldIsReviewed) focusNextDecision();
                          }}
                        >
                          {selectedFieldIsReviewed ? 'Undo approval' : 'Approve'}
                        </button>
                      </div>

                      {structuredChoiceConfig && (
                        <div style={{ display: 'grid', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', animation: 'opsDashFadeIn 0.2s ease 0.22s both' }}>
                          {structuredChoiceConfig.options.map((option) => {
                            const isSelected = structuredChoiceConfig.selectedChoice === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => applyStructuredChoice(option.value)}
                                style={{
                                  border: 'none',
                                  borderLeft: `3px solid ${isSelected ? colours.accent : 'rgba(255,255,255,0.12)'}`,
                                  background: isSelected ? 'rgba(255,255,255,0.03)' : 'transparent',
                                  padding: isMobileReview ? '10px 10px 10px 12px' : '9px 10px 9px 12px',
                                  textAlign: 'left' as const,
                                  cursor: 'pointer',
                                  color: '#f3f4f6',
                                }}
                              >
                                <div style={{ fontSize: isMobileReview ? 12 : 11, fontWeight: 700, color: isSelected ? colours.accent : '#f3f4f6' }}>
                                  {isSelected ? 'Selected: ' : ''}{option.title}
                                </div>
                                <div style={{ fontSize: isMobileReview ? 12 : 11, color: '#d1d5db', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginTop: 6 }}>
                                  {option.preview}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {isLocalDev && (
                      <div style={{
                        paddingTop: 10,
                        borderTop: '1px dashed rgba(135, 243, 243, 0.18)',
                        display: 'grid',
                        gap: 6,
                        animation: 'opsDashFadeIn 0.2s ease 0.24s both',
                        position: 'relative',
                      }}>
                        <div style={{ fontSize: 7, color: 'rgba(135, 243, 243, 0.38)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 2 }}>
                          Dev Tools
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: isMobileReview ? 9 : 8, color: 'rgba(160,160,160,0.82)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Prompt Context
                          </div>
                          <button
                            type="button"
                            onClick={() => setCclPromptContextRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: !prev[cclLetterModal] }))}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: promptContextRevealActive ? 'rgba(209,213,219,0.92)' : 'rgba(160,160,160,0.78)',
                              padding: 0,
                              fontSize: isMobileReview ? 10 : 9,
                              fontWeight: 600,
                              cursor: 'pointer',
                              letterSpacing: '0.02em',
                              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                            }}
                            title="Optional prompt context for this step"
                          >
                            {promptContextRevealActive ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {!promptContextRevealActive && (
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: 'rgba(148,163,184,0.72)', lineHeight: 1.4 }}>
                            Optional context behind this step.
                          </div>
                        )}
                        {promptContextRevealActive && (
                          <>
                            <div style={{
                              display: 'grid',
                              gap: 6,
                              padding: isMobileReview ? '8px 9px' : '7px 8px',
                              background: colours.darkBlue,
                              border: `1px solid ${colours.dark.border}`,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Field Placeholder
                                </div>
                                <button
                                  type="button"
                                  onMouseDown={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: true }))}
                                  onMouseUp={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: false }))}
                                  onMouseLeave={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: false }))}
                                  onTouchStart={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: true }))}
                                  onTouchEnd={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: false }))}
                                  onTouchCancel={() => setCclPlaceholderRevealByMatter((prev) => ({ ...prev, [cclLetterModal]: false }))}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: placeholderRevealActive ? colours.accent : 'rgba(160,160,160,0.78)',
                                    padding: 0,
                                    fontSize: isMobileReview ? 10 : 9,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    letterSpacing: '0.02em',
                                    fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                  }}
                                  title={selectedFieldKey ? `Hold to reveal {{${selectedFieldKey}}}` : 'Hold to reveal field placeholder'}
                                >
                                  {placeholderRevealActive ? 'Showing' : 'Hold to reveal'}
                                </button>
                              </div>
                              {placeholderRevealActive && (
                                <div style={{
                                  fontSize: reviewValueFontSize,
                                  color: colours.accent,
                                  lineHeight: 1.5,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  padding: isMobileReview ? '6px 7px' : '5px 6px',
                                  background: colours.dark.cardBackground,
                                  border: `1px solid ${colours.dark.borderColor}`,
                                }}>
                                  {revealedPlaceholderToken || 'No placeholder token'}
                                </div>
                              )}
                            </div>
                            {hasSessionPrompts && (
                              <div style={{
                                display: 'grid',
                                gap: 8,
                                padding: isMobileReview ? '8px 9px' : '7px 8px',
                                background: colours.darkBlue,
                                border: `1px solid ${colours.dark.border}`,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      Full Prompt
                                    </div>
                                    <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#94a3b8', lineHeight: 1.4, marginTop: 2 }}>
                                      Run-level system and user instructions for the whole AI generation session.
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setCclSessionPromptExpandedByMatter((prev) => ({ ...prev, [cclLetterModal]: !prev[cclLetterModal] }))}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: sessionPromptExpanded ? '#d1d5db' : 'rgba(160,160,160,0.82)',
                                      padding: 0,
                                      fontSize: isMobileReview ? 10 : 9,
                                      fontWeight: 600,
                                      letterSpacing: '0.02em',
                                      cursor: 'pointer',
                                      fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                    }}
                                  >
                                    {sessionPromptExpanded ? 'Hide full prompt' : 'Show full prompt'}
                                  </button>
                                </div>

                                {sessionPromptExpanded && (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: `1px solid ${colours.dark.border}` }}>
                                      <button
                                        type="button"
                                        onClick={() => setCclSessionPromptTabByMatter((prev) => ({ ...prev, [cclLetterModal]: 'system' }))}
                                        style={{
                                          border: 'none',
                                          borderRight: `1px solid ${colours.dark.border}`,
                                          background: visiblePromptTab === 'system' ? colours.helixBlue : colours.darkBlue,
                                          color: systemPromptText ? (visiblePromptTab === 'system' ? colours.accent : '#d1d5db') : '#6b7280',
                                          padding: isMobileReview ? '8px 10px' : '7px 9px',
                                          fontSize: isMobileReview ? 10 : 9,
                                          fontWeight: 700,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          cursor: systemPromptText ? 'pointer' : 'default',
                                          fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                        }}
                                      >
                                        System
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCclSessionPromptTabByMatter((prev) => ({ ...prev, [cclLetterModal]: 'user' }))}
                                        style={{
                                          border: 'none',
                                          background: visiblePromptTab === 'user' ? colours.helixBlue : colours.darkBlue,
                                          color: userPromptText ? (visiblePromptTab === 'user' ? colours.accent : '#d1d5db') : '#6b7280',
                                          padding: isMobileReview ? '8px 10px' : '7px 9px',
                                          fontSize: isMobileReview ? 10 : 9,
                                          fontWeight: 700,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          cursor: userPromptText ? 'pointer' : 'default',
                                          fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                                        }}
                                      >
                                        User
                                      </button>
                                    </div>

                                    <div style={{ display: 'grid', gap: 4 }}>
                                      <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {visiblePromptTab === 'system' ? 'System Prompt' : 'User Prompt'}
                                      </div>
                                      <div style={{
                                        fontSize: isMobileReview ? 11 : 10,
                                        color: '#d1d5db',
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        maxHeight: isMobileReview ? 100 : 120,
                                        overflow: 'auto',
                                        scrollbarWidth: 'thin',
                                        background: colours.dark.cardBackground,
                                        border: `1px solid ${colours.dark.border}`,
                                        padding: isMobileReview ? '8px 9px' : '7px 8px',
                                      }}>
                                        {visiblePromptTab === 'system' ? (systemPromptText || 'No system prompt captured for this run.') : (userPromptText || 'No user prompt captured for this run.')}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {aiRes.dataSources && aiRes.dataSources.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {aiRes.dataSources.map((source) => (
                                  <span
                                    key={source}
                                    style={{
                                      fontSize: isMobileReview ? 10 : 9,
                                      padding: '2px 6px',
                                      background: colours.darkBlue,
                                      border: `1px solid ${colours.dark.border}`,
                                      color: '#d1d5db',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {source}
                                  </span>
                                ))}
                              </div>
                            )}
                            {selectedFieldPromptSections.length > 0 ? (
                              <div style={{ display: 'grid', gap: 6 }}>
                                {selectedFieldPromptSections.map((section) => (
                                  <div key={section.key} style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      {section.title}
                                    </div>
                                    <div style={{
                                      fontSize: reviewValueFontSize,
                                      color: '#d1d5db',
                                      lineHeight: 1.45,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      padding: isMobileReview ? '8px 9px' : '7px 8px',
                                      background: colours.dark.cardBackground,
                                      border: `1px solid ${colours.dark.borderColor}`,
                                      maxHeight: isMobileReview ? 110 : 130,
                                      overflow: 'auto',
                                      scrollbarWidth: 'thin',
                                    }}>
                                      {section.body}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : selectedFieldDataFedRows.length > 0 ? (
                              <div style={{ display: 'grid', gap: 6 }}>
                                {selectedFieldDataFedRows.map((row) => (
                                  <div key={row.key} style={{ display: 'grid', gap: 2 }}>
                                    <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      {row.label}
                                    </div>
                                    <div style={{ fontSize: reviewValueFontSize, color: '#d1d5db', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                      {row.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: reviewValueFontSize, color: '#d1d5db', lineHeight: 1.45 }}>
                                {selectedFieldDecisionReason}
                              </div>
                            )}
                            {selectedFieldSnippetRows.length > 0 && (
                              <details>
                                <summary style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, cursor: 'pointer', fontWeight: 600 }}>
                                  View trace snippets
                                </summary>
                                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                  {selectedFieldSnippetRows.map((row) => (
                                    <div key={row.key} style={{ display: 'grid', gap: 2 }}>
                                      <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {row.label}
                                      </div>
                                      <div style={{ fontSize: reviewValueFontSize, color: '#d1d5db', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {row.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </>
                        )}
                      </div>
                      )}
                        </>
                      )}
                    </div>

                    <div style={{ padding: isMobileReview ? '12px 16px max(16px, env(safe-area-inset-bottom))' : '12px 18px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'grid', gap: 8, flexShrink: 0, background: 'rgba(2, 6, 23, 0.98)', position: 'sticky', bottom: 0, animation: 'opsDashFadeIn 0.2s ease 0.24s both' }}>
                      {!selectedFieldKey && (
                        <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#94a3b8', lineHeight: 1.45 }}>
                          {loadingReviewContext
                            ? 'Generating review context. The draft will appear as fields are produced.'
                            : showSummaryLanding
                              ? 'Review the summary above, then begin the guided review when ready.'
                              : noAiReviewContext
                                ? 'Use Generate AI review if you want guided checking for this draft. Otherwise you can review the letter manually.'
                                : noClarificationsQueued
                                  ? 'No sidepane action is required right now unless you want to approve the current preview letter.'
                                  : 'Stay in this workspace while you work through the guided review steps.'}
                        </div>
                      )}
                      {!selectedFieldKey && noClarificationsQueued && canApprove && (
                        <button
                          type="button"
                          style={{ fontSize: isMobileReview ? 13 : 12, fontWeight: 700, color: '#fff', background: colours.green, padding: isMobileReview ? '14px 14px' : '11px 14px', cursor: cclApprovingMatter === cclLetterModal ? 'wait' : 'pointer', textAlign: 'center' as const, border: 'none', minHeight: isMobileReview ? 48 : 'auto' }}
                          onClick={handleApproveCurrentLetter}
                        >
                          {cclApprovingMatter === cclLetterModal ? 'Approving…' : 'Approve current preview letter'}
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
                  padding: '8px 20px', background: colours.cta, color: '#fff',
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
              boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(13,47,96,0.15)',
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
                                              {e.note && <span style={{ marginLeft: e.activity ? 6 : 0, color: isDarkMode ? '#9ca3af' : '#6b7280' }} title={e.note}> {e.note.length > 40 ? e.note.slice(0, 40) + '…' : e.note}</span>}
                                              {!e.activity && !e.note && '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.hours > 0 ? muted : (isDarkMode ? '#6b7280' : '#9ca3af'), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.hours > 0 ? fmt.hours(e.hours) : '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.value > 0 ? muted : (isDarkMode ? '#6b7280' : '#9ca3af'), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
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
                                              {e.note && <span style={{ marginLeft: e.activity ? 6 : 0, color: isDarkMode ? '#9ca3af' : '#6b7280' }} title={e.note}> {e.note.length > 40 ? e.note.slice(0, 40) + '…' : e.note}</span>}
                                              {!e.activity && !e.note && '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.hours > 0 ? muted : (isDarkMode ? '#6b7280' : '#9ca3af'), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
                                              {e.hours > 0 ? fmt.hours(e.hours) : '—'}
                                            </td>
                                            <td style={{ padding: '2px 14px', fontSize: 9, color: e.value > 0 ? muted : (isDarkMode ? '#6b7280' : '#9ca3af'), textAlign: 'right', borderBottom: isLastG && ei === ents.length - 1 ? `1px solid ${rowBorder}` : 'none', verticalAlign: 'top' }}>
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
              background: isDarkMode ? colours.darkBlue : '#ffffff',
              border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(6, 23, 51, 0.08)'}`,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
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
  );
};

export default OperationsDashboard;
