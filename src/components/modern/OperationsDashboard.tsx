import React from 'react';
import { FiRefreshCw, FiColumns, FiList, FiInbox, FiSend, FiCheckCircle, FiFolder } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import helixMark from '../../assets/markwhite.svg';
import clioIcon from '../../assets/clio.svg';
import netdocumentsIcon from '../../assets/netdocuments.svg';
import { DEFAULT_CCL_TEMPLATE, generateTemplateContent, type GenerationOptions } from '../../shared/ccl';
import { isCclUser } from '../../app/admin';
import { fetchAiFill, fetchAiFillStream, approveCcl, fetchPressureTest, type AiFillRequest, type AiFillResponse, type PressureTestResponse, type PressureTestFieldScore } from '../../tabs/matters/ccl/cclAiService';

/* ── Types ── */

type PeriodKey = 'today' | 'weekToDate' | 'monthToDate';
type SortKey = 'date' | 'name' | 'aow';
type EnquiryTab = 'enquiries' | 'unclaimed';
type UnclaimedRange = 'today' | 'week' | 'lastWeek';
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
interface DetailRecord {
  id?: string; enquiryId?: string; date?: string; poc?: string; aow?: string; source?: string; name?: string; stage?: string;
  pipelineStage?: string; teamsChannel?: string; teamsCardType?: string; teamsStage?: string; teamsClaimed?: string; teamsLink?: string;
}
interface DetailsPayload { currentRange?: string; current?: { records?: DetailRecord[] } }

interface CclStatus {
  status: string;
  version: number;
  feeEarner?: string;
  practiceArea?: string;
  clientName?: string;
  matterDescription?: string;
  createdAt?: string;
  finalizedAt?: string;
  uploadedToClio?: boolean;
  uploadedToNd?: boolean;
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
  unclaimedQueueCount?: number;
  unclaimedToday?: number;
  unclaimedThisWeek?: number;
  unclaimedLastWeek?: number;
  canClaimUnclaimed?: boolean;
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

const aowColor = (key: string): string => {
  const k = key.toLowerCase();
  if (k.includes('commercial')) return colours.blue;
  if (k.includes('construction')) return colours.orange;
  if (k.includes('property')) return colours.green;
  if (k.includes('employment')) return colours.yellow;
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

/* ── Component ── */

const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  metrics,
  enquiryMetrics,
  enquiryMetricsBreakdown,
  unclaimedQueueCount = 0,
  unclaimedToday = 0,
  unclaimedThisWeek = 0,
  unclaimedLastWeek = 0,
  canClaimUnclaimed: _canClaimUnclaimed,
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
}) => {
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
  const [showPrev, setShowPrev] = React.useState(true);
  const [layoutStacked, setLayoutStacked] = React.useState(false);
  const [enquiryTab, setEnquiryTab] = React.useState<EnquiryTab>('enquiries');
  const [unclaimedRange, setUnclaimedRange] = React.useState<UnclaimedRange>('today');
  const [activityTab, setActivityTab] = React.useState<ActivityTab>('enquiries');
  const [sortKey, setSortKey] = React.useState<SortKey>('date');
  const [sortDesc, setSortDesc] = React.useState(true);
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
  const [cclFieldInspectorTabByMatter, setCclFieldInspectorTabByMatter] = React.useState<Record<string, 'placeholder' | 'prompt' | 'output'>>({});
  const [cclApprovingMatter, setCclApprovingMatter] = React.useState<string | null>(null);
  const [cclContactSourceByMatter, setCclContactSourceByMatter] = React.useState<Record<string, CclContactSource>>({});
  const [cclAiStreamLog, setCclAiStreamLog] = React.useState<{ key: string; value: string }[]>([]);
  const [cclPressureTestByMatter, setCclPressureTestByMatter] = React.useState<Record<string, PressureTestResponse>>({});
  const [cclPressureTestRunning, setCclPressureTestRunning] = React.useState<string | null>(null);
  const cclAiAutoFiredRef = React.useRef<Set<string>>(new Set());
  const streamFeedRef = React.useRef<HTMLDivElement | null>(null);

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
      return;
    }
    const ids = recentMatters.slice(0, 12).map(m => m.matterId).filter(Boolean);
    if (ids.length === 0) {
      setCclMap({});
      return;
    }
    let cancelled = false;
    fetchSharedJson(`ccl-batch-status:${JSON.stringify(ids)}`, () => fetch('/api/ccl/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterIds: ids }),
    }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
      .then(data => {
        if (cancelled) return;
        const results: Record<string, CclStatus> = data?.results || {};
        if (demoModeActive && demoMatterIds.length > 0) {
          seedDemoDraftCache(demoMatterIds);
          setCclMap({ ...results, ...buildDemoCclMap(demoMatterIds) });
        } else {
          setCclMap(results);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (demoModeActive && demoMatterIds.length > 0) {
          seedDemoDraftCache(demoMatterIds);
          setCclMap(buildDemoCclMap(demoMatterIds));
        } else {
          setCclMap({});
        }
      });
    return () => { cancelled = true; };
  }, [recentMatters, demoModeActive, demoMatterIds, buildDemoCclMap, seedDemoDraftCache, secondaryFetchesReady]);

  const displayMatters = React.useMemo(() => recentMatters, [recentMatters]);

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

    // Open unified review modal immediately so streamed output is visible
    setCclPreviewOpen(false);
    setCclLetterModal(matterId);

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

    try {
      await fetchAiFillStream(aiRequest, {
        onPhase: (phase, message, dataSources) => {
          setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: message }));
        },
        onField: (key, value, index) => {
          // Push to live feed log
          setCclAiStreamLog((prev) => [...prev, { key, value }]);

          // Merge field into draft cache in real-time
          setCclDraftCache((prev) => {
            const existing = prev[matterId]?.fields || {};
            const existingVal = existing[key];
            // Only apply if current value is empty or very short (template placeholder)
            if (!existingVal || String(existingVal).trim().length < 5) {
              return {
                ...prev,
                [matterId]: { ...prev[matterId], fields: { ...existing, [key]: value } },
              };
            }
            return prev;
          });
          setCclAiStatusByMatter((prev) => ({
            ...prev,
            [matterId]: `Generating field ${index}…`,
          }));
        },
        onComplete: (result) => {
          // Store full AI result for review checklist
          setCclAiResultByMatter((prev) => ({
            ...prev,
            [matterId]: { request: aiRequest, response: result, baseFields: baseFieldsSnapshot },
          }));

          // Final merge — ensure all fields are captured
          setCclDraftCache((prev) => {
            const merged = { ...(prev[matterId]?.fields || {}), ...baseFields } as Record<string, string>;
            for (const [key, value] of Object.entries(result.fields || {})) {
              const existing = merged[key];
              if (!existing || String(existing).trim().length < 5) {
                merged[key] = value;
              }
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
            fetch(`/api/ccl/${encodeURIComponent(matterId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draftJson: fields, initials: userInitials || '' }),
            }).catch(() => {});
            return prev;
          });

          const confidenceLabel = result.confidence === 'full' ? 'full' : result.confidence === 'partial' ? 'partial' : 'fallback';
          setCclAiStatusByMatter((prev) => ({
            ...prev,
            [matterId]: `AI ${confidenceLabel} · ${result.source}${result.durationMs ? ` · ${Math.round(result.durationMs / 100) / 10}s` : ''}`,
          }));

          setCclAiFillingMatter(null);
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
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI autofill failed';
      setCclAiStatusByMatter((prev) => ({ ...prev, [matterId]: `AI failed · ${message}` }));
      setCclAiFillingMatter(null);
    }
  }, [applyCclContactFallbacks, cclAiFillingMatter, displayMatters, cclMap, cclDraftCache, userInitials]);

  const runPressureTest = React.useCallback(async (matterId: string) => {
    if (!matterId || cclPressureTestRunning) return;
    const matter = displayMatters.find((m) => m.matterId === matterId);
    const aiResult = cclAiResultByMatter[matterId];
    const draft = cclDraftCache[matterId]?.fields;
    const generatedFields = aiResult?.response?.fields || draft || {};
    if (Object.keys(generatedFields).length === 0) return;

    setCclPressureTestRunning(matterId);
    try {
      const result = await fetchPressureTest({
        matterId,
        instructionRef: matter?.instructionRef || '',
        generatedFields,
        practiceArea: matter?.practiceArea || '',
        clientName: matter?.clientName || '',
      });
      setCclPressureTestByMatter((prev) => ({ ...prev, [matterId]: result }));
    } catch (err) {
      console.error('[CCL] Pressure test failed:', err);
    } finally {
      setCclPressureTestRunning(null);
    }
  }, [cclPressureTestRunning, displayMatters, cclAiResultByMatter, cclDraftCache]);

  React.useEffect(() => {
    if (!cclLetterModal) return;
    if (cclAiResultByMatter[cclLetterModal]) return;
    if (cclAiTraceByMatter[cclLetterModal]) return;
    if (cclAiTraceLoadingByMatter[cclLetterModal]) return;

    let cancelled = false;
    setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [cclLetterModal]: true }));
    fetch(`/api/ccl-admin/traces/${encodeURIComponent(cclLetterModal)}?limit=1`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.traces?.length) return;
        setCclAiTraceByMatter((prev) => ({ ...prev, [cclLetterModal]: data.traces[0] }));
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setCclAiTraceLoadingByMatter((prev) => ({ ...prev, [cclLetterModal]: false }));
      });

    return () => { cancelled = true; };
  }, [cclLetterModal, cclAiResultByMatter, cclAiTraceByMatter, cclAiTraceLoadingByMatter]);

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

  const claimSignal = React.useMemo(() => {
    const total = Number(periodEnquiry?.count || 0);
    const unclaimed = Math.max(0, Number(unclaimedQueueCount || 0));
    return { total, unclaimed };
  }, [periodEnquiry, unclaimedQueueCount]);

  const topAow = React.useMemo(() => {
    const list = breakdown[period]?.aowTop ?? [];
    return [...list].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [breakdown, period]);

  /* pitched/mattersOpened removed — Col 3 now shows matters */

  /* ── Insight modal fetch ── */
  const openInsight = React.useCallback((p: 'today' | 'weekToDate' | 'monthToDate') => {
    if (!userEmail && !userInitials) return;
    setInsightPeriod(p);
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
  }, [userEmail, userInitials]);

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
    if (!userEmail && !userInitials) return;
    let active = true;
    setDetailsLoading(true);
    const params = new URLSearchParams();
    if (userEmail) params.set('email', userEmail);
    if (userInitials) params.set('initials', userInitials);
    params.set('period', period);
    params.set('limit', '80');
    const requestKey = `home-enquiries-details:${params.toString()}`;
    fetchSharedJson(requestKey, () => fetch(`/api/home-enquiries/details?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status))))
      .then((d: DetailsPayload) => { if (active) setDetails(d); })
      .catch(() => {})
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [period, userEmail, userInitials, secondaryFetchesReady]);

  const recents = React.useMemo(() => {
    const list = [...(details?.current?.records || [])];
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
  }, [details, sortKey, sortDesc, demoModeActive, userInitials]);

  const filteredRecents = React.useMemo(() => {
    const eff = (r: DetailRecord) => stageLevel(activityStageForRecord(r));
    if (activityTab === 'enquiries') return recents;
    if (activityTab === 'pitched') return recents.filter((r) => eff(r) === 3);
    if (activityTab === 'instructed') return recents.filter((r) => eff(r) >= 4);
    return recents;
  }, [recents, activityTab]);

  const openPitchBuilderForRecord = React.useCallback((record: DetailRecord) => {
    const enquiryId = String(record.enquiryId || record.id || '').trim();
    if (!enquiryId) return;
    try {
      localStorage.setItem('navigateToEnquiryId', enquiryId);
      localStorage.setItem('navigateToEnquirySubTab', 'Pitch');
      window.dispatchEvent(new CustomEvent('navigateToEnquiries'));
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
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }} title={friendlyStage(stage)}>
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
  const cardHoverBorder = isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(13,47,96,0.18)';
  const cardHoverShadow = isDarkMode
    ? '0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(135,243,243,0.08)'
    : '0 4px 16px rgba(13,47,96,0.10), inset 0 0 0 1px rgba(13,47,96,0.10)';

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
      el.style.transform = 'scale(1.02)';
      el.querySelectorAll<HTMLElement>('[data-muted]').forEach((m) => { m.style.opacity = '1'; m.style.color = text; });
    },
    leave: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.background = 'transparent';
      el.style.transform = 'scale(1)';
      el.querySelectorAll<HTMLElement>('[data-muted]').forEach((m) => { m.style.opacity = ''; m.style.color = ''; });
    },
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
    <div style={{ padding: '4px 14px 16px', display: 'grid', gap: 14 }}>
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
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        <span
          onClick={() => setShowPrev((v) => !v)}
          style={{ fontSize: 10, color: showPrev ? accent : muted, cursor: 'pointer', userSelect: 'none' }}
        >
          Previous {showPrev ? 'on' : 'off'}
        </span>
        <span
          onClick={() => setLayoutStacked((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: muted, cursor: 'pointer', userSelect: 'none' }}
          title={layoutStacked ? 'Switch to side-by-side' : 'Switch to stacked layout'}
        >
          {layoutStacked ? <FiList size={10} /> : <FiColumns size={10} />}
          {layoutStacked ? 'Stacked' : 'Side by side'}
        </span>
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

      {/* ── Billing rail ── */}
      {billingMetrics.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '6px 0 4px', letterSpacing: '0.2px' }}>Billing</div>
          <div
            style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, animation: 'opsDashFadeIn 0.35s ease both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
            onMouseEnter={cardHover.enter}
            onMouseLeave={cardHover.leave}
          >
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
            {outstandingMetric && (
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
                    <span style={{ fontWeight: 600, color: text }}>{fmt.currency(outstandingMetric.money || 0)}</span>
                    <span>outstanding</span>
                    {typeof outstandingMetric.secondary === 'number' && (
                      <span style={{ opacity: 0.5 }}>· firm {fmt.currency(outstandingMetric.secondary)}</span>
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
          <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '6px 0 4px', letterSpacing: '0.2px' }}>Conversion & Pipeline</div>
          {(!enquiryMetrics || enquiryMetrics.length === 0) ? (
            /* Skeleton placeholder while loading */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: 8 }}>
              <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, height: 160, animation: 'opsDashPulse 1.5s ease-in-out infinite' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, height: 160, animation: 'opsDashPulse 1.5s ease-in-out infinite 0.1s' }} />
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, height: 160, animation: 'opsDashPulse 1.5s ease-in-out infinite 0.2s' }} />
              </div>
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: 8 }}>

            {/* ── Column 1: Enquiries / Unclaimed (tabbed) ── */}
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', animation: 'opsDashFadeIn 0.35s ease 0.05s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              {/* Tabs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: `1px solid ${cardBorder}`,
              }}>
                {(['enquiries', 'unclaimed'] as const).map((tab) => (
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
                    {/* Today + This Week side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                      <div
                        style={{ padding: '14px 14px 10px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer' }}
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
                        style={{ padding: '14px 14px 10px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer' }}
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

                    {/* This Month + Last Month */}
                      {(monthEnquiry || isLoadingEnquiryMetrics) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
                        <div
                          style={{ padding: '10px 14px', borderRight: `1px solid ${rowBorder}`, transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'pointer' }}
                          onMouseEnter={tileHover.enter}
                          onMouseLeave={tileHover.leave}
                          onClick={() => openInsight('monthToDate')}
                        >
                            {bigNumber(fmt.int(monthEnquiry?.count || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                          <div data-muted style={{ fontSize: 10, color: muted, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>This Month</div>
                        </div>
                          {(showPrev || isLoadingEnquiryMetrics) && (
                          <div
                            style={{ padding: '10px 14px', transition: 'background 0.2s ease, transform 0.2s ease', cursor: 'default' }}
                            onMouseEnter={tileHover.enter}
                            onMouseLeave={tileHover.leave}
                          >
                              {bigNumber(fmt.int(monthEnquiry?.prevCount || 0), { loading: !!isLoadingEnquiryMetrics, size: 16 })}
                            <div data-muted style={{ fontSize: 10, color: muted, opacity: 0.45, marginTop: 2, transition: 'color 0.2s ease, opacity 0.2s ease' }}>Last Month</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conversion strip */}
                    {((conversionMetric && conversionMetric.percentage != null && conversionMetric.context) || isLoadingEnquiryMetrics) && (() => {
                      const opened = conversionMetric?.context?.mattersOpenedMonthToDate || 0;
                      const total = conversionMetric?.context?.enquiriesMonthToDate || 0;
                      const pct = conversionMetric?.percentage || 0;
                      return (
                        <div style={{
                          padding: '10px 14px',
                          borderBottom: `1px solid ${cardBorder}`,
                          background: isDarkMode ? 'rgba(135,243,243,0.02)' : 'rgba(13,47,96,0.02)',
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
                          {/* Bar: green = converted, remainder = unconverted */}
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

                    {/* AoW breakdown */}
                    {topAow.length > 0 && (() => {
                      const maxCount = Math.max(...topAow.map((a) => a.count), 1);
                      return (
                        <div style={{ padding: '8px 14px 6px' }}>
                          <div style={{ fontSize: 10, color: muted, marginBottom: 6 }}>Area of Work</div>
                          {topAow.map((a, i) => (
                            <div key={i} style={{ marginBottom: 6 }}>
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
                ) : (
                  <>
                    {/* Range pills */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${cardBorder}` }}>
                      {([['today', 'Today'], ['week', 'This Week'], ['lastWeek', 'Last Week']] as const).map(([key, label]) => (
                        <div
                          key={key}
                          onClick={() => setUnclaimedRange(key)}
                          style={{
                            flex: 1,
                            padding: '7px 6px',
                            fontSize: 9,
                            fontWeight: 600,
                            textAlign: 'center',
                            color: unclaimedRange === key ? accent : muted,
                            background: unclaimedRange === key ? (isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(54,144,206,0.04)') : 'transparent',
                            cursor: 'pointer',
                            userSelect: 'none',
                            letterSpacing: '0.2px',
                          }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    {/* Count for selected range */}
                    {(() => {
                      const rangeCount = unclaimedRange === 'today' ? unclaimedToday
                        : unclaimedRange === 'week' ? unclaimedThisWeek
                        : unclaimedLastWeek;
                      const rangeLabel = unclaimedRange === 'today' ? 'unclaimed today'
                        : unclaimedRange === 'week' ? 'unclaimed this week'
                        : 'unclaimed last week';
                      return (
                        <div style={{ padding: '14px 14px 10px' }}>
                          {bigNumber(String(rangeCount), { color: rangeCount > 0 ? colours.orange : text, loading: !!isLoadingEnquiryMetrics })}
                          <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{rangeLabel}</div>
                        </div>
                      );
                    })()}

                    {/* Total queue */}
                    {kpiRow('Total in queue', String(claimSignal.unclaimed), { color: claimSignal.unclaimed > 0 ? colours.orange : undefined })}
                    {claimSignal.total > 0 && kpiRow('Enquiries this week', fmt.int(claimSignal.total))}
                  </>
                )}
              </div>
            </div>

            {/* ── Right side: Activity + Matters ── */}
            <div style={{ display: layoutStacked ? 'flex' : 'grid', ...(layoutStacked ? { flexDirection: 'column' as const, gap: 8 } : { gridTemplateColumns: '1fr 1fr', gap: 8 }) }}>

            {/* ── Column 2: Recent Activity (tabbed) ── */}
            <div
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', animation: 'opsDashFadeIn 0.35s ease 0.1s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
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
              <div style={{ flex: 1, overflow: 'auto' }}>
                {detailsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 6 }}>
                    <FiRefreshCw size={13} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite' }} />
                    <span style={{ fontSize: 11, color: muted }}>Loading activity…</span>
                  </div>
                ) : filteredRecents.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: theadBg, borderBottom: `1px solid ${cardBorder}` }}>
                        {/* AoW dot column — far left */}
                        <th style={{ width: 20, padding: '7px 4px 5px 10px' }} />
                        {([['date', 'Date'], ['name', 'Name']] as const).map(([k, lbl]) => (
                          <th
                            key={k}
                            onClick={() => toggleSort(k)}
                            style={{
                              textAlign: 'left',
                              fontSize: 8,
                              fontWeight: 600,
                              textTransform: 'uppercase' as const,
                              letterSpacing: '0.5px',
                              color: sortKey === k ? theadAccent : theadText,
                              padding: '7px 14px 5px',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            {lbl}{sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
                          </th>
                        ))}
                        {/* Fee Earner column */}
                        <th style={{ textAlign: 'left', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, padding: '7px 8px 5px', whiteSpace: 'nowrap' }}>FE</th>
                        {/* Pipeline dots column */}
                        <th style={{ textAlign: 'left', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, padding: '7px 8px 5px', whiteSpace: 'nowrap', width: 52 }}>Pipeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecents.slice(0, 12).map((r, i) => {
                        const hasTeams = !!r.teamsLink;
                        const activityStage = activityStageForRecord(r);
                        const effectiveStage = effectiveStageForRecord(r);
                        const activityLevel = stageLevel(activityStage);
                        const effectiveLevel = stageLevel(effectiveStage);
                        const activityTone = stageVisuals(activityStage, isDarkMode);
                        const ageHours = hoursSince(r.date);
                        const canPitch = activityLevel <= 2 && effectiveLevel < 3;
                        const followUpState = activityLevel === 3 && effectiveLevel === 3
                          ? (ageHours >= 48 ? 'late' : ageHours >= 24 ? 'due' : null)
                          : null;
                        const rowEl = (
                        <tr
                          key={i}
                          style={{
                            cursor: hasTeams ? 'pointer' : 'default',
                            background: activityTone.tint,
                            boxShadow: `inset 3px 0 0 ${activityTone.colour}`,
                            transition: 'background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease',
                            animation: `opsDashRowFade 0.25s ease ${0.03 * i}s both`,
                          }}
                          onClick={hasTeams ? () => window.open(r.teamsLink, '_blank') : undefined}
                          title={hasTeams ? `Open in Teams · ${r.teamsChannel || 'Channel'}` : undefined}
                          onMouseEnter={(e) => {
                            const el = e.currentTarget;
                            el.style.background = activityTone.hover;
                            el.style.boxShadow = `inset 3px 0 0 ${activityTone.colour}${hasTeams ? `, ${hoverShadow}` : ''}`;
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget;
                            el.style.background = activityTone.tint;
                            el.style.boxShadow = `inset 3px 0 0 ${activityTone.colour}`;
                          }}
                        >
                          <td style={{ padding: '5px 4px 5px 10px', borderBottom: `1px solid ${rowBorder}`, textAlign: 'center', width: 20 }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: aowColor(r.aow || '') }} />
                          </td>
                          <td style={{ padding: '5px 6px 5px 8px', fontSize: 10, color: muted, borderBottom: `1px solid ${rowBorder}`, whiteSpace: 'nowrap' }}>
                            {friendlyDate(r.date)}
                          </td>
                          <td style={{ padding: '5px 8px', fontSize: 10, color: text, borderBottom: `1px solid ${rowBorder}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {hasTeams && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? colours.accent : colours.highlight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                                  <rect x="3.5" y="6" width="12" height="12" rx="2" />
                                  <path d="M7 10h5" />
                                  <path d="M9.5 10v6" />
                                  <circle cx="18.5" cy="9" r="2" />
                                  <rect x="16.5" y="12" width="5" height="6" rx="2" />
                                </svg>
                              )}
                              <span style={{ flex: 1 }}>{r.name || '—'}</span>
                              {canPitch && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPitchBuilderForRecord(r);
                                  }}
                                  style={{
                                    border: 'none',
                                    background: activityTone.colour,
                                    padding: '1px 6px',
                                    margin: 0,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    letterSpacing: '0.3px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    lineHeight: '14px',
                                  }}
                                  title="Open pitch builder"
                                >
                                  Pitch
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
                          </td>
                          <td style={{ padding: '5px 8px', borderBottom: `1px solid ${rowBorder}`, whiteSpace: 'nowrap' }}>
                            {r.teamsClaimed && (
                              <span style={{
                                fontSize: 8,
                                fontWeight: 700,
                                color: colours.green,
                                letterSpacing: '0.3px',
                              }} title={`Claimed by ${r.teamsClaimed}`}>{r.teamsClaimed}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px 8px', borderBottom: `1px solid ${rowBorder}`, width: 52 }}>
                            {pipelineDots(effectiveStageForRecord(r))}
                          </td>
                        </tr>
                        );
                        return rowEl;
                      })}
                    </tbody>
                  </table>
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
              style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', animation: 'opsDashFadeIn 0.35s ease 0.15s both', transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease' }}
              onMouseEnter={cardHover.enter}
              onMouseLeave={cardHover.leave}
            >
              <div style={{
                padding: '9px 14px 7px',
                background: tabActiveBg,
                borderBottom: `2px solid ${accent}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: accent, letterSpacing: '0.3px' }}>Matters</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {displayMatters.length > 0 && (
                    <span style={{ fontSize: 9, color: muted, opacity: 0.5 }}>{recentMatters.length} recent</span>
                  )}
                  {canSeeCcl && (() => {
                    const total = displayMatters.slice(0, 12).length;
                    const withCcl = displayMatters.slice(0, 12).filter(m => cclMap[m.matterId]).length;
                    if (withCcl > 0) return <span style={{ fontSize: 9, color: isDarkMode ? colours.accent : colours.highlight, opacity: 0.7 }}>{withCcl}/{total} CCL</span>;
                    return null;
                  })()}
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {displayMatters.length > 0 ? (
                  <div style={{ padding: 0 }}>
                    {/* Column headers */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 5px',
                      background: theadBg, borderBottom: `1px solid ${cardBorder}`,
                    }}>
                      <span style={{ width: 6, flexShrink: 0 }} />
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, flexShrink: 0, minWidth: 36 }}>Date</span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, flex: 1 }}>Matter</span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, flexShrink: 0, width: 28, textAlign: 'center' }}>FE</span>
                      {canSeeCcl && <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theadText, flexShrink: 0, width: 20, textAlign: 'center' }}>CCL</span>}
                      <span style={{ width: 14, flexShrink: 0 }} />
                    </div>
                    {displayMatters.slice(0, 12).map((m, i) => {
                      const ccl = canSeeCcl ? (cclMap[m.matterId] || null) : null;
                      const isExp = canSeeCcl && expandedCcl === m.matterId;
                      const isDemo = String(m.matterId || '').toUpperCase().startsWith('DEMO-');
                      const clioUrl = m.matterId && !isDemo ? `https://eu.app.clio.com/nc/#/matters/${m.matterId}` : undefined;

                      return (
                        <div
                          key={m.matterId || i}
                          style={{
                            borderBottom: `1px solid ${rowBorder}`,
                            animation: `opsDashRowFade 0.25s ease ${0.04 * i}s both`,
                          }}
                        >
                          {/* Matter summary row */}
                          <div
                            style={{
                              padding: '6px 14px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
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
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: aowColor(m.practiceArea || ''), flexShrink: 0 }} />

                            {/* Date */}
                            <span style={{ fontSize: 9, color: muted, flexShrink: 0, minWidth: 36 }}>{friendlyDate(m.openDate)}</span>

                            {/* Ref + client */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
                              <span
                                style={{ fontSize: 10, fontWeight: 500, color: clioUrl ? (isDarkMode ? colours.accent : colours.highlight) : text, lineHeight: 1.3, flexShrink: 0, cursor: clioUrl ? 'pointer' : 'default' }}
                                onClick={clioUrl ? (e: React.MouseEvent) => { e.stopPropagation(); window.open(clioUrl, '_blank'); } : undefined}
                                title={clioUrl ? 'Open in Clio' : undefined}
                              >
                                {m.displayNumber}
                              </span>
                              <span style={{ fontSize: 9, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.clientName || '—'}</span>
                            </div>

                            {/* FE initials */}
                            <span style={{ fontSize: 8, fontWeight: 700, color: m.responsibleSolicitor ? colours.green : 'transparent', letterSpacing: '0.3px', flexShrink: 0, width: 28, textAlign: 'center' }} title={m.responsibleSolicitor || undefined}>
                              {m.responsibleSolicitor ? (feInitials[m.responsibleSolicitor.toLowerCase()] || m.responsibleSolicitor) : '—'}
                            </span>

                            {/* CCL status dot */}
                            {canSeeCcl && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, flexShrink: 0 }}>
                            {(() => {
                              if (!ccl) return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} title="No CCL" />;
                              const dotColor = ccl.status === 'uploaded' ? colours.green
                                : ccl.status === 'approved' ? (isDarkMode ? colours.accent : colours.highlight)
                                : ccl.status === 'final' ? (isDarkMode ? colours.accent : colours.highlight)
                                : colours.orange;
                              const label = ccl.status === 'uploaded' ? 'Sent' : ccl.status === 'approved' ? 'Approved' : ccl.status === 'final' ? 'Final' : 'Draft';
                              return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: dotColor }} title={`CCL ${label} · v${ccl.version}`} />;
                            })()}
                            </span>
                            )}

                            {/* Expand caret */}
                            <span
                              style={{
                                width: 14,
                                height: 14,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                border: `1px solid ${isExp
                                  ? (isDarkMode ? 'rgba(135, 243, 243, 0.22)' : 'rgba(54, 144, 206, 0.18)')
                                  : 'transparent'}`,
                                background: isExp
                                  ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)')
                                  : 'transparent',
                                color: isExp ? (isDarkMode ? colours.accent : colours.highlight) : muted,
                                transition: 'transform 0.18s ease, color 0.18s ease, background 0.18s ease, border-color 0.18s ease',
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
                                  const openWorkbench = (event: React.MouseEvent) => {
                                    event.stopPropagation();
                                    window.dispatchEvent(new CustomEvent('navigateToMatter', {
                                      detail: { matterId: m.matterId, showCcl: true },
                                    }));
                                  };

                                  const hasDraft = Boolean(ccl && ccl.version);
                                  const isApproved = ccl?.status === 'approved' || ccl?.status === 'final' || ccl?.status === 'uploaded';
                                  const toClio = Boolean(ccl?.uploadedToClio);
                                  const toNd = Boolean(ccl?.uploadedToNd);

                                  const milestones: { label: string; sublabel: string; done: boolean; icon: React.ReactNode; onClick?: (e: React.MouseEvent) => void }[] = [
                                    {
                                      label: 'CCL Draft',
                                      sublabel: hasDraft ? `v${ccl?.version || 1}` : 'Not started',
                                      done: hasDraft,
                                      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
                                      onClick: openWorkbench,
                                    },
                                    {
                                      label: 'Approved',
                                      sublabel: isApproved ? (ccl?.finalizedAt ? new Date(ccl.finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Yes') : 'Pending',
                                      done: isApproved,
                                      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
                                    },
                                    {
                                      label: 'Uploaded to Clio',
                                      sublabel: toClio ? 'Complete' : 'Pending',
                                      done: toClio,
                                      icon: <img src={clioIcon} alt="Clio" width={14} height={14} style={{ opacity: toClio ? 1 : 0.3, filter: `${isDarkMode ? 'invert(1) ' : ''}${toClio ? '' : 'grayscale(1)'}`.trim() || 'none' }} />,
                                    },
                                    {
                                      label: 'Uploaded to NetDocuments',
                                      sublabel: toNd ? 'Complete' : 'Pending',
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

            </div>{/* end right-side wrapper */}

          </div>
          )}
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

      {/* ── CCL Letter Preview Modal (dev/demo only — not visible in production) ── */}
      {demoModeActive && cclLetterModal && (() => {
        const cached = cclDraftCache[cclLetterModal];
        const draft = cached?.fields;
        const docUrl = cached?.docUrl;
        const ccl = cclMap[cclLetterModal];
        const matter = displayMatters.find(m => m.matterId === cclLetterModal);
        if (!draft) return null;

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

        const statusLabel = ccl?.status === 'uploaded' ? 'Sent' : ccl?.status === 'approved' ? 'Approved' : ccl?.status === 'final' ? 'Final' : 'Draft';
        const statusColor = ccl?.status === 'uploaded' ? colours.green
          : ccl?.status === 'approved' ? (isDarkMode ? colours.accent : colours.highlight)
          : ccl?.status === 'final' ? (isDarkMode ? colours.accent : colours.highlight)
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
        const aiBaseFields = aiData?.baseFields || {};
        const hasAiData = !!aiRes;
        const isStreamingNow = cclAiFillingMatter === cclLetterModal;
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

        // ── Generate the REAL letter using the canonical template engine ──
        const genOptions: GenerationOptions = {
          costsChoice: (normalizedDraft.costs_section_choice as 'no_costs' | 'risk_costs') || 'risk_costs',
          chargesChoice: (normalizedDraft.charges_section_choice as 'hourly_rate' | 'no_estimate') || 'hourly_rate',
          disbursementsChoice: (normalizedDraft.disbursements_section_choice as 'table' | 'estimate') || 'estimate',
          showEstimateExamples: false,
        };
        const rawGeneratedContent = generateTemplateContent(DEFAULT_CCL_TEMPLATE, normalizedDraft, genOptions);
        const unresolvedPlaceholders = Array.from(new Set(
          [...rawGeneratedContent.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => String(m[1] || '').trim()).filter(Boolean)
        ));
        const hasUnresolved = unresolvedPlaceholders.length > 0;
        const canApprove = ccl?.status === 'draft' && !hasUnresolved;

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
        const visibleReviewFieldCount = visibleReviewFieldKeys.length;
        const defaultSelectedField = visibleReviewFieldKeys[0] || null;
        const savedSelectedField = cclSelectedReviewFieldByMatter[cclLetterModal];
        const selectedFieldKey = savedSelectedField && visibleReviewFieldKeys.includes(savedSelectedField)
          ? savedSelectedField
          : defaultSelectedField;
        const selectedFieldMeta = selectedFieldKey ? fieldMeta[selectedFieldKey] : null;
        const selectedFieldTab = cclFieldInspectorTabByMatter[cclLetterModal] || 'output';
        const selectedFieldTemplate = selectedFieldKey ? templateContextFor(selectedFieldKey) : '';
        const selectedFieldPrompt = selectedFieldKey ? (fieldMeta[selectedFieldKey]?.prompt || 'Fill this field so it reads naturally in the surrounding template wording.') : '';
        const selectedFieldAiOutput = selectedFieldKey && aiFields[selectedFieldKey] ? String(aiFields[selectedFieldKey]).trim() : '';
        const selectedFieldOutput = selectedFieldKey ? (normalizedDraft[selectedFieldKey] || selectedFieldAiOutput || '') : '';
        const selectedFieldPrevious = selectedFieldKey && aiBaseFields[selectedFieldKey] ? String(aiBaseFields[selectedFieldKey]).trim() : '';
        const selectedFieldUnresolved = selectedFieldKey ? unresolvedPlaceholders.includes(selectedFieldKey) : false;
        const previewAnchorId = (anchor: string) => `ccl-preview-${cclLetterModal}-${anchor.replace(/[^a-z0-9]+/gi, '-')}`;
        const selectedPreviewAnchor = selectedFieldMeta?.anchor || 'intro';
        const reviewFieldGroups = visibleReviewFieldKeys.reduce((acc, key) => {
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
        const renderReviewListItem = (key: string) => {
          const meta = fieldMeta[key];
          if (!meta) return null;
          const isSelected = key === selectedFieldKey;
          const isReviewed = reviewedSet.has(key);
          const aiValue = aiFields[key] ? String(aiFields[key]).trim() : '';
          const currentValue = normalizedDraft[key] || '';
          const previousValue = aiBaseFields[key] ? String(aiBaseFields[key]).trim() : '';
          const isAiFilled = !!aiValue;
          const isUpdated = !!aiValue && !!previousValue && currentValue !== previousValue;
          const isNewFromAi = !!aiValue && !previousValue;
          const isUnresolved = unresolvedPlaceholders.includes(key);
          const snippet = currentValue || aiValue || 'No value yet';

          const ptResult = cclPressureTestByMatter[cclLetterModal];
          const ptFieldScore = ptResult?.fieldScores?.[key];

          return (
            <div
              key={key}
              style={{
                marginBottom: 6,
                padding: '8px 10px',
                border: `1px solid ${isSelected ? 'rgba(135,243,243,0.28)' : ptFieldScore?.flag ? 'rgba(255,140,0,0.25)' : 'rgba(255,255,255,0.06)'}`,
                background: isSelected ? 'rgba(135,243,243,0.06)' : ptFieldScore?.flag ? 'rgba(255,140,0,0.04)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
              }}
              onClick={() => {
                setCclSelectedReviewFieldByMatter((prev) => ({ ...prev, [cclLetterModal]: key }));
                requestAnimationFrame(() => {
                  document.getElementById(previewAnchorId(meta.anchor))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' as const }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#f3f4f6' }}>{meta.label}</div>
                {selectedFieldKey === key && <span style={{ fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999, background: 'rgba(135,243,243,0.1)', color: colours.accent }}>Focused</span>}
                {isUnresolved && <span style={{ fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999, background: 'rgba(214,85,65,0.12)', color: '#fca5a5' }}>Missing</span>}
                {isNewFromAi && <span style={{ fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999, background: 'rgba(135,243,243,0.10)', color: colours.accent }}>AI</span>}
                {isUpdated && <span style={{ fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999, background: 'rgba(255,213,79,0.10)', color: colours.yellow }}>AI·CHANGED</span>}
                {isReviewed && <span style={{ fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999, background: 'rgba(32,178,108,0.12)', color: colours.green }}>Reviewed</span>}
                {ptFieldScore && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, padding: '0 4px', borderRadius: 999,
                    background: ptFieldScore.score >= 8
                      ? 'rgba(32,178,108,0.12)' : ptFieldScore.score >= 7
                      ? 'rgba(255,213,79,0.12)' : 'rgba(214,85,65,0.12)',
                    color: ptFieldScore.score >= 8
                      ? colours.green : ptFieldScore.score >= 7
                      ? colours.yellow : '#fca5a5',
                  }}>
                    {ptFieldScore.score}/10{ptFieldScore.flag ? ' · CHECK' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 8, color: '#A0A0A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{snippet}</div>
              {ptFieldScore?.flag && ptFieldScore.reason && (
                <div style={{ fontSize: 8, color: colours.orange, marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal' }}>
                  ⚠ {ptFieldScore.reason}
                </div>
              )}
            </div>
          );
        };

        const generatedContent = rawGeneratedContent
          .replace(/\{\{[^}]+\}\}/g, '________')
          .replace(/\n{3,}/g, '\n\n');

        // ── Parse into structured sections (same logic as PreviewStep) ──
        const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
        const bulletRe = /^[—–-]\s*(.+)$/;
        const checkboxRe = /^☐\s*(.+)$/;
        const tableRowRe = /^.+\|.+$/;
        const lines = generatedContent.split('\n');
        const headingColor = colours.helixBlue;
        const tableBorder = 'rgba(13,47,96,0.16)';

        type PSection = { id: string; number: string; title: string; isSubsection: boolean; content: React.ReactNode[] };
        const sections: PSection[] = [];
        let cur: PSection = { id: 'intro', number: '', title: '', isSubsection: false, content: [] };
        let idx = 0;
        let pKey = 0;

        while (idx < lines.length) {
          const line = lines[idx].trimEnd();
          if (!line.trim()) { idx++; continue; }

          // Section heading
          const sm = line.match(sectionRe);
          if (sm) {
            if (cur.content.length > 0 || cur.id === 'intro') sections.push(cur);
            const [, num, title] = sm;
            cur = { id: num, number: num, title, isSubsection: num.includes('.'), content: [] };
            idx++;
            continue;
          }

          // Bullets
          if (bulletRe.test(line)) {
            const bullets: string[] = [];
            while (idx < lines.length) {
              const bl = lines[idx].trimEnd();
              if (bulletRe.test(bl)) { const bm = bl.match(bulletRe); if (bm) bullets.push(bm[1]); idx++; }
              else if (!bl.trim()) {
                let peek = idx + 1;
                while (peek < lines.length && !lines[peek].trim()) peek++;
                if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) { idx = peek; } else break;
              } else break;
            }
            cur.content.push(
              <ul key={pKey++} style={{
                margin: '6px 0 10px 8px',
                paddingLeft: 20,
                listStyleType: 'none',
              }}>
                {bullets.map((b, bi) => (
                  <li key={bi} style={{
                    position: 'relative',
                    paddingLeft: 16,
                    marginBottom: 5,
                    lineHeight: 1.7,
                  }}>
                    <span style={{
                      position: 'absolute', left: 0, top: '0.55em',
                      width: 5, height: 5, borderRadius: '50%',
                      background: headingColor, display: 'inline-block',
                    }} />
                    {b}
                  </li>
                ))}
              </ul>
            );
            continue;
          }

          // Checkboxes
          if (checkboxRe.test(line)) {
            const items: { action: string; info: string }[] = [];
            while (idx < lines.length) {
              const cl = lines[idx].trimEnd();
              if (checkboxRe.test(cl)) {
                const raw = cl.replace(/^☐\s*/, '');
                const parts = raw.split('|').map(s => s.trim());
                items.push({ action: parts[0] || '________', info: parts[1] || '' });
                idx++;
              } else if (!cl.trim()) {
                let peek = idx + 1;
                while (peek < lines.length && !lines[peek].trim()) peek++;
                if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) { idx = peek; } else break;
              } else break;
            }
            cur.content.push(
              <div key={pKey++} style={{ margin: '8px 0 12px 0' }}>
                {items.map((item, ci) => (
                  <div key={ci} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '8px 0',
                    marginBottom: 0,
                    borderBottom: `1px solid ${tableBorder}`,
                    fontSize: 12, lineHeight: 1.6,
                  }}>
                    <span style={{
                      flexShrink: 0, marginTop: 3,
                      width: 14, height: 14,
                      borderRadius: 2,
                      border: '1.5px solid #94a3b8',
                      display: 'inline-block',
                    }} />
                    <div style={{ flex: 1, color: '#061733' }}>
                      <span style={{ fontWeight: 600 }}>{item.action}</span>
                      {item.info && (
                        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 3 }}>
                          {item.info}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
            continue;
          }

          // Table rows
          if (tableRowRe.test(line)) {
            let peekIdx = idx + 1;
            while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
            if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
              const headers = line.split('|').map(s => s.trim());
              idx++;
              const items: { action: string; info: string }[] = [];
              while (idx < lines.length) {
                const cl = lines[idx].trimEnd();
                if (checkboxRe.test(cl)) {
                  const raw = cl.replace(/^☐\s*/, '');
                  const parts = raw.split('|').map(s => s.trim());
                  items.push({ action: parts[0] || '________', info: parts[1] || '' });
                  idx++;
                } else if (!cl.trim()) {
                  let pk = idx + 1;
                  while (pk < lines.length && !lines[pk].trim()) pk++;
                  if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { idx = pk; } else { break; }
                } else { break; }
              }
              cur.content.push(
                <table key={pKey++} style={{
                  width: '100%', borderCollapse: 'collapse',
                  margin: '10px 0 14px', fontSize: 12, color: '#061733',
                }}>
                  <thead>
                    <tr>
                      <th style={{ width: 24 }} />
                      {headers.map((h, hi) => (
                        <th key={hi} style={{
                          textAlign: 'left', padding: '6px 12px',
                          borderBottom: `2px solid ${headingColor}`,
                          fontWeight: 700, fontSize: 11,
                          color: headingColor, textTransform: 'uppercase' as const,
                          letterSpacing: '0.03em',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, ci) => (
                      <tr key={ci}>
                        <td style={{
                          padding: '10px 4px 10px 12px', verticalAlign: 'top',
                          borderBottom: `1px solid ${tableBorder}`,
                        }}>
                          <span style={{
                            display: 'inline-block', width: 14, height: 14, borderRadius: 2,
                            border: '1.5px solid #94a3b8',
                          }} />
                        </td>
                        <td style={{
                          padding: '10px 12px', verticalAlign: 'top',
                          borderBottom: `1px solid ${tableBorder}`,
                          fontWeight: 600, color: '#061733',
                        }}>{item.action}</td>
                        {item.info ? (
                          <td style={{
                            padding: '10px 12px', verticalAlign: 'top',
                            borderBottom: `1px solid ${tableBorder}`,
                            color: '#4b5563', fontSize: 11,
                          }}>{item.info}</td>
                        ) : <td style={{ borderBottom: `1px solid ${tableBorder}` }} />}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
              continue;
            }
            const rows: string[][] = [];
            while (idx < lines.length && tableRowRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd())) {
              rows.push(lines[idx].trimEnd().split('|').map(s => s.trim()));
              idx++;
            }
            if (rows.length > 0) {
              const [header, ...body] = rows;
              cur.content.push(
                <table key={pKey++} style={{
                  width: '100%', borderCollapse: 'collapse',
                  margin: '8px 0 12px 0',
                  fontSize: 12, color: text,
                }}>
                  <thead><tr>{header.map((cell, ci) => (
                    <th key={ci} style={{
                      textAlign: 'left', padding: '8px 12px',
                      borderBottom: `2px solid ${headingColor}`,
                      fontWeight: 700, fontSize: 11,
                      color: headingColor, textTransform: 'uppercase' as const,
                      letterSpacing: '0.03em',
                    }}>{cell}</th>
                  ))}</tr></thead>
                  {body.length > 0 && <tbody>{body.map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '6px 12px',
                        borderBottom: `1px solid ${tableBorder}`,
                        verticalAlign: 'top',
                      }}>{cell}</td>
                    ))}</tr>
                  ))}</tbody>}
                </table>
              );
            }
            continue;
          }

          // Paragraph
          const paraLines: string[] = [];
          while (idx < lines.length && lines[idx].trim() && !sectionRe.test(lines[idx].trimEnd()) && !bulletRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd()) && !tableRowRe.test(lines[idx].trimEnd())) {
            paraLines.push(lines[idx].trimEnd());
            idx++;
          }
          if (paraLines.length > 0) {
            const pText = paraLines.join('\n');
            const isGreeting = pText.startsWith('Dear ');
            const isClosing = /^(Kind regards|Yours sincerely|Yours faithfully|Please contact me)/i.test(pText);
            cur.content.push(
              <p key={pKey++} style={{
                margin: '0 0 10px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                ...(isGreeting ? { fontWeight: 600, marginBottom: 12 } : {}),
                ...(isClosing ? { marginTop: 14 } : {}),
              }}>{pText}</p>
            );
          }
        }
        if (cur.content.length > 0) sections.push(cur);

        return (
          <div
            onClick={() => setCclLetterModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0, 3, 25, 0.75)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'opsDashFadeIn 0.2s ease both',
              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            }}
          >
            {/* ═══ Main stage: A4 document + sync pipeline ═══ */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 0,
                maxHeight: '92vh', overflow: 'auto',
                padding: '24px 32px 20px',
                background: 'rgba(6, 23, 51, 0.65)',
                border: '1px solid rgba(135, 243, 243, 0.08)',
                boxShadow: '0 8px 48px rgba(0, 3, 25, 0.5)',
                backdropFilter: 'blur(12px)',
                flex: cclPreviewOpen ? '1 1 auto' : '0 0 auto',
                transition: 'flex 0.3s ease',
                animation: 'opsDashScaleIn 0.3s ease both',
              }}
            >
              {/* ── Header bar ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                width: '100%', maxWidth: 340,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#d1d5db', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {matter?.displayNumber} <span style={{ color: '#6b7280', fontWeight: 400 }}>· {statusLabel} · v{ccl?.version || 1}</span>
                  </div>
                </div>
                <div
                  style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, transition: 'color 0.15s' }}
                  onClick={() => setCclLetterModal(null)}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
                >✕</div>
              </div>

              {/* ── Branded processing view ── */}
              <div style={{
                width: 300, minHeight: 360,
                background: colours.dark?.background || '#020617',
                border: '1px solid rgba(135, 243, 243, 0.06)',
                display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'hidden',
              }}>
                {/* ── Brand header ── */}
                <div style={{
                  padding: '14px 16px 10px',
                  borderBottom: '1px solid rgba(135, 243, 243, 0.08)',
                  background: 'rgba(6, 23, 51, 0.5)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <img src={helixMark} alt="Helix" style={{ height: 18, opacity: 0.85, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#f3f4f6', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Helix Law</div>
                      <div style={{ fontSize: 7, color: '#A0A0A0', marginTop: 1, lineHeight: 1.3 }}>
                        Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
                      </div>
                    </div>
                    <span style={{ fontSize: 7, color: '#6b7280', flexShrink: 0 }}>{dateStr}</span>
                  </div>
                  {/* Client + matter context */}
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#d1d5db', marginTop: 4 }}>
                    {matter?.clientName || normalizedDraft.insert_clients_name || 'Client'}
                    <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                      {normalizedDraft.insert_heading_eg_matter_description || matter?.practiceArea || ''}
                    </span>
                  </div>
                </div>

                {/* ── Processing sections ── */}
                <div style={{ flex: 1, padding: '10px 16px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {sections.filter(s => s.number).map((s, i) => {
                    const sectionFields = orderedTemplateFieldKeys.filter(k => fieldMeta[k]?.anchor === s.number || fieldMeta[k]?.anchor === s.id);
                    const filled = sectionFields.filter(k => !!normalizedDraft[k]?.trim()).length;
                    const total = sectionFields.length;
                    const allFilled = total > 0 && filled === total;
                    const hasGaps = total > 0 && filled < total;
                    const isProcessing = hasGaps && filled > 0;
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: s.isSubsection ? '2px 0 2px 14px' : '3px 0',
                        opacity: total === 0 ? 0.45 : 1,
                      }}>
                        {/* Status indicator */}
                        <div style={{
                          width: s.isSubsection ? 12 : 14, height: s.isSubsection ? 12 : 14,
                          borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: allFilled ? 'rgba(32, 178, 108, 0.12)' : isProcessing ? 'rgba(255, 140, 0, 0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${allFilled ? colours.green : isProcessing ? 'rgba(255, 140, 0, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'all 0.3s ease',
                        }}>
                          {allFilled
                            ? <span style={{ fontSize: 7, color: colours.green, fontWeight: 700 }}>✓</span>
                            : isProcessing
                              ? <span style={{ fontSize: 6, color: colours.orange }}>●</span>
                              : <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
                          }
                        </div>
                        {/* Section label */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: s.isSubsection ? 7.5 : 8, color: allFilled ? '#d1d5db' : '#8b95a5',
                            fontWeight: allFilled ? 600 : 400,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            <span style={{ color: '#6b7280', marginRight: 4, fontSize: 7 }}>{s.number}</span>
                            {s.title}
                          </div>
                        </div>
                        {/* Field count */}
                        {total > 0 && (
                          <span style={{
                            fontSize: 7, flexShrink: 0, fontWeight: 500,
                            color: allFilled ? colours.green : isProcessing ? colours.orange : '#4b5563',
                          }}>
                            {filled}/{total}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Status badge (approved/uploaded) ── */}
                {(ccl?.status === 'approved' || ccl?.status === 'uploaded') && (
                  <div style={{
                    margin: '0 16px 8px', padding: '5px 10px',
                    display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                    background: ccl?.status === 'uploaded' ? 'rgba(32,178,108,0.06)' : 'rgba(54,144,206,0.06)',
                    border: `1px solid ${ccl?.status === 'uploaded' ? 'rgba(32,178,108,0.15)' : 'rgba(54,144,206,0.15)'}`,
                  }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700,
                      color: ccl?.status === 'uploaded' ? colours.green : colours.highlight,
                    }}>{ccl?.status === 'uploaded' ? '✓' : '◎'}</span>
                    <span style={{
                      fontSize: 7, fontWeight: 600, letterSpacing: '0.06em',
                      color: ccl?.status === 'uploaded' ? colours.green : colours.highlight,
                      textTransform: 'uppercase' as const,
                    }}>{ccl?.status === 'uploaded' ? 'Synced to Clio' : 'Approved'}</span>
                  </div>
                )}

                {/* ── Legal footer ── */}
                <div style={{
                  padding: '8px 16px 10px',
                  borderTop: '1px solid rgba(135, 243, 243, 0.06)',
                  background: 'rgba(6, 23, 51, 0.3)',
                }}>
                  <p style={{
                    fontSize: 5.5, lineHeight: 1.5, color: '#4b5563', margin: 0,
                    letterSpacing: '0.01em',
                  }}>
                    Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. A list of Directors is available for inspection at the Registered Office: Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. Helix Law and applicable logo are exclusively owned trademarks of Helix Law Limited, registered with the Intellectual Property Office under numbers UK00003984532 and UK00003984535.
                  </p>
                </div>
              </div>

              {/* ── Pipeline ── */}
              <div style={{
                marginTop: 14, display: 'flex', alignItems: 'center', gap: 0,
                width: '100%', maxWidth: 300,
              }}>
                {[
                  { label: 'Saved', done: !!ccl },
                  { label: 'Approved', done: ccl?.status === 'approved' || ccl?.status === 'uploaded' },
                  { label: 'Clio', done: ccl?.status === 'uploaded' },
                  { label: 'NetDocs', done: false },
                ].map((step, i, arr) => (
                  <React.Fragment key={i}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: step.done ? colours.green : 'rgba(255,255,255,0.04)',
                        border: step.done ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        transition: 'all 0.3s ease',
                      }}>
                        {step.done
                          ? <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>
                          : <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
                        }
                      </div>
                      <span style={{
                        fontSize: 7, fontWeight: step.done ? 600 : 400,
                        color: step.done ? '#f3f4f6' : '#6b7280',
                      }}>{step.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{
                        flex: 1, height: 1, marginTop: -12, minWidth: 12,
                        background: step.done && arr[i + 1]?.done
                          ? colours.green
                          : step.done
                            ? `linear-gradient(90deg, ${colours.green}, rgba(255,255,255,0.06))`
                            : 'rgba(255,255,255,0.06)',
                        transition: 'background 0.3s ease',
                      }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* ── Actions row ── */}
              <div style={{
                marginTop: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const,
                justifyContent: 'center', width: '100%', maxWidth: 300,
              }}>
                {/* Approve button (when ready) */}
                {ccl?.status === 'draft' && !hasUnresolved && (
                  <div
                    style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                      padding: '5px 16px', cursor: cclApprovingMatter === cclLetterModal ? 'wait' : 'pointer',
                      color: '#fff', background: colours.green,
                      borderRadius: 999, transition: 'all 0.2s ease',
                      opacity: cclApprovingMatter === cclLetterModal ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      if (cclApprovingMatter) return;
                      setCclApprovingMatter(cclLetterModal);
                      try {
                        const result = await approveCcl(cclLetterModal, 'approved');
                        if (result.ok) {
                          setCclMap(prev => ({
                            ...prev,
                            [cclLetterModal]: {
                              ...prev[cclLetterModal],
                              status: 'approved',
                              finalizedAt: result.finalizedAt || new Date().toISOString(),
                            },
                          }));
                        } else {
                          console.warn('[ccl] Approval failed:', result.error);
                        }
                      } catch (err) {
                        console.error('[ccl] Approval error:', err);
                      } finally {
                        setCclApprovingMatter(null);
                      }
                    }}
                  >{cclApprovingMatter === cclLetterModal ? 'Approving…' : 'Approve'}</div>
                )}

                {ccl?.status === 'draft' && hasUnresolved && (
                  <span style={{ fontSize: 8, color: colours.cta, fontWeight: 600 }}>
                    {unresolvedPlaceholders.length} field{unresolvedPlaceholders.length === 1 ? '' : 's'} incomplete
                  </span>
                )}

                {/* Inspector toggle */}
                <div
                  style={{
                    fontSize: 8, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                    padding: '4px 12px', cursor: 'pointer', borderRadius: 999,
                    color: cclPreviewOpen ? '#0a1c32' : colours.accent,
                    background: cclPreviewOpen ? colours.accent : 'rgba(135,243,243,0.06)',
                    border: cclPreviewOpen ? 'none' : '1px solid rgba(135,243,243,0.12)',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => setCclPreviewOpen((p) => !p)}
                >{cclPreviewOpen ? 'Hide Inspector' : 'Inspector'}</div>

                {/* Download */}
                {docUrl && (
                  <div
                    style={{
                      fontSize: 8, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                      padding: '4px 12px', cursor: 'pointer', borderRadius: 999,
                      color: '#6b7280', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => window.open(docUrl, '_blank')}
                  >.docx</div>
                )}
              </div>
            </div>

            {/* ═══ Inspector drawer (slides from right) ═══ */}
            {cclPreviewOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 420, maxWidth: '40vw',
                  height: '100vh', maxHeight: '100vh',
                  position: 'fixed', right: 0, top: 0,
                  background: colours.darkBlue,
                  borderLeft: `1px solid rgba(135,243,243,0.1)`,
                  boxShadow: '-8px 0 40px rgba(0,3,25,0.4)',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                  animation: 'opsDashSlideRight 0.25s ease both',
                  fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                }}
              >
                {/* Inspector header */}
                <div style={{
                  padding: '16px 18px 12px', flexShrink: 0,
                  borderBottom: '1px solid rgba(135,243,243,0.08)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f3f4f6' }}>CCL Inspector</div>
                      <div style={{ fontSize: 8, color: '#A0A0A0', marginTop: 2 }}>
                        {visibleReviewFieldCount} fields · {unresolvedPlaceholders.length} unresolved{structuredFieldCount > 0 ? ` · ${structuredFieldCount} structured` : ''}
                      </div>
                    </div>
                    <div
                      style={{ fontSize: 12, color: '#A0A0A0', cursor: 'pointer', padding: '2px 6px', transition: 'color 0.15s' }}
                      onClick={() => setCclPreviewOpen(false)}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f3f4f6'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#A0A0A0'; }}
                    >✕</div>
                  </div>

                  {/* Contact source toggle */}
                  {(activeContactContext.hasDifferentCurrentUser || activeContactContext.usingSource === 'current') && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px',
                      border: '1px solid rgba(135,243,243,0.08)',
                      background: 'rgba(135,243,243,0.02)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 600, color: '#d1d5db', marginBottom: 3 }}>
                        Contact source: {activeContactContext.usingSource === 'current' ? 'Current user' : 'Matter record'}
                      </div>
                      {activeContactContext.hasDifferentCurrentUser && activeContactContext.currentUserProfile.fullName && activeContactContext.matterProfile.fullName && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <div
                            style={{
                              fontSize: 7, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                              padding: '2px 7px', cursor: 'pointer', borderRadius: 999,
                              color: activeContactContext.usingSource === 'matter' ? '#0a1c32' : '#d1d5db',
                              background: activeContactContext.usingSource === 'matter' ? colours.highlight : 'rgba(255,255,255,0.05)',
                              transition: 'all 0.15s ease',
                            }}
                            onClick={() => setCclContactSourceByMatter((prev) => ({ ...prev, [cclLetterModal]: 'matter' }))}
                          >Matter</div>
                          <div
                            style={{
                              fontSize: 7, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                              padding: '2px 7px', cursor: 'pointer', borderRadius: 999,
                              color: activeContactContext.usingSource === 'current' ? '#0a1c32' : '#d1d5db',
                              background: activeContactContext.usingSource === 'current' ? colours.accent : 'rgba(255,255,255,0.05)',
                              transition: 'all 0.15s ease',
                            }}
                            onClick={() => setCclContactSourceByMatter((prev) => ({ ...prev, [cclLetterModal]: 'current' }))}
                          >Current user</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI progress bar */}
                  {hasAiData && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 8, color: allReviewed ? colours.green : '#A0A0A0', fontWeight: 500 }}>
                          {allReviewed ? '✓ All AI fields reviewed' : `${reviewedCount}/${totalAiFields} AI fields reviewed`}
                        </span>
                        <span style={{ fontSize: 8, color: '#A0A0A0' }}>{progressPct}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${progressPct}%`,
                          background: allReviewed ? colours.green : `${colours.accent}60`,
                          transition: 'width 0.25s ease, background 0.25s ease',
                        }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Inspector scrollable body */}
                <div style={{
                  flex: 1, overflow: 'auto',
                  padding: '14px 18px',
                  color: '#f3f4f6', fontSize: 10,
                }}>
                  {unresolvedPlaceholders.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const, color: colours.cta }}>
                          {unresolvedPlaceholders.length} unresolved
                        </div>
                        <div
                          style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                            padding: '3px 10px', cursor: cclAiFillingMatter === cclLetterModal ? 'wait' : 'pointer',
                            color: '#0a1c32', background: colours.highlight, borderRadius: 999,
                          }}
                          onClick={() => { if (!isStreamingNow) runHomeCclAiAutofill(cclLetterModal); }}
                        >
                          {isStreamingNow ? 'Running AI Autofill…' : 'AI Autofill'}
                        </div>
                        {(isStreamingNow || cclAiStatusByMatter[cclLetterModal]) && (
                          <span style={{ fontSize: 8, color: '#A0A0A0' }}>{cclAiStatusByMatter[cclLetterModal] || 'Running AI autofill…'}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Pressure Test: Verify button + results ── */}
                  {hasAiData && !isStreamingNow && (() => {
                    const ptResult = cclPressureTestByMatter[cclLetterModal];
                    const ptRunning = cclPressureTestRunning === cclLetterModal;
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: ptResult ? 8 : 0 }}>
                          <div
                            style={{
                              fontSize: 8, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                              padding: '3px 10px', cursor: ptRunning ? 'wait' : 'pointer',
                              color: '#0a1c32', background: ptResult ? colours.green : colours.orange, borderRadius: 999,
                            }}
                            onClick={() => { if (!ptRunning) runPressureTest(cclLetterModal); }}
                          >
                            {ptRunning ? 'Verifying…' : ptResult ? 'Re-verify' : 'Verify Output'}
                          </div>
                          {ptRunning && (
                            <span style={{ fontSize: 8, color: '#A0A0A0' }}>
                              <FiRefreshCw size={9} style={{ animation: 'opsDashSpin 1s linear infinite', marginRight: 3, verticalAlign: 'middle' }} />
                              Running pressure test against all data sources…
                            </span>
                          )}
                          {ptResult && !ptRunning && (
                            <span style={{ fontSize: 8, color: ptResult.flaggedCount > 0 ? colours.orange : colours.green }}>
                              {ptResult.flaggedCount > 0
                                ? `${ptResult.flaggedCount} of ${ptResult.totalFields} fields flagged for review`
                                : `All ${ptResult.totalFields} fields verified ✓`}
                              {ptResult.durationMs ? ` · ${Math.round(ptResult.durationMs / 100) / 10}s` : ''}
                            </span>
                          )}
                        </div>
                        {ptResult && (
                          <div style={{ fontSize: 8, color: '#A0A0A0', marginBottom: 4 }}>
                            Evidence: {ptResult.dataSources.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {selectedFieldKey && selectedFieldMeta && (
                    <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#f3f4f6' }}>{selectedFieldMeta.label}</div>
                          <div style={{ fontSize: 8, color: '#A0A0A0' }}>{selectedFieldMeta.group}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
                          {(['placeholder', 'prompt', 'output'] as const).map((tab) => (
                            <div
                              key={tab}
                              style={{
                                fontSize: 7, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                                padding: '3px 8px', cursor: 'pointer', borderRadius: 999,
                                color: selectedFieldTab === tab ? '#0a1c32' : '#d1d5db',
                                background: selectedFieldTab === tab ? colours.accent : 'rgba(255,255,255,0.05)',
                              }}
                              onClick={() => setCclFieldInspectorTabByMatter((prev) => ({ ...prev, [cclLetterModal]: tab }))}
                            >
                              {tab}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ fontSize: 8, color: '#A0A0A0', marginBottom: 6 }}>Preview anchor: {selectedFieldMeta.group}</div>

                      {selectedFieldTab === 'placeholder' && (
                        <div style={{ fontSize: 9, color: '#d1d5db', lineHeight: 1.5, padding: '8px 10px', background: 'rgba(2,6,23,0.45)', border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {selectedFieldTemplate}
                        </div>
                      )}

                      {selectedFieldTab === 'prompt' && (
                        <div style={{ fontSize: 9, color: '#d1d5db', lineHeight: 1.5, padding: '8px 10px', background: 'rgba(2,6,23,0.45)', border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {selectedFieldPrompt}
                        </div>
                      )}

                      {selectedFieldTab === 'output' && (
                        <div>
                          <div style={{ fontSize: 9, color: selectedFieldOutput ? '#f3f4f6' : '#fca5a5', lineHeight: 1.55, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${selectedFieldOutput ? 'rgba(255,255,255,0.06)' : 'rgba(214,85,65,0.28)'}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            {selectedFieldOutput || 'No output inserted yet for this placeholder.'}
                          </div>
                          {selectedFieldAiOutput && selectedFieldAiOutput !== selectedFieldOutput && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: '#A0A0A0', textTransform: 'uppercase' as const, marginBottom: 2 }}>AI returned</div>
                              <div style={{ fontSize: 8, color: '#d1d5db', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{selectedFieldAiOutput}</div>
                            </div>
                          )}
                          {selectedFieldPrevious && selectedFieldPrevious !== selectedFieldOutput && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: '#A0A0A0', textTransform: 'uppercase' as const, marginBottom: 2 }}>Previous</div>
                              <div style={{ fontSize: 8, color: '#A0A0A0', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{selectedFieldPrevious}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {reviewFieldGroups.map((group) => (
                    <div key={group.title} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const, color: colours.accent, marginBottom: 6 }}>
                        {group.title}
                      </div>
                      {group.keys.map((key) => renderReviewListItem(key))}
                    </div>
                  ))}

                  {(hasAiData || traceLoading) && (
                    <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <details>
                        <summary style={{
                          fontSize: 8, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' as const,
                          color: '#A0A0A0', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <span style={{ fontSize: 7 }}>▶</span>
                          AI Trace
                          {aiRes && (
                            <span style={{ fontWeight: 400, textTransform: 'none' as const }}>
                              · {aiRes.confidence || persistedTrace?.AiStatus || 'saved'} · {aiRes.source || 'trace'}{aiRes.durationMs ? ` · ${Math.round(aiRes.durationMs / 100) / 10}s` : ''}
                            </span>
                          )}
                        </summary>
                        <div style={{ paddingTop: 8 }}>
                          {traceLoading && !aiRes ? (
                            <div style={{ fontSize: 8, color: '#A0A0A0' }}>Loading saved AI trace…</div>
                          ) : aiRes && aiReq ? (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, fontSize: 9, color: '#A0A0A0' }}>
                                {aiRes.model && <span>Model: {aiRes.model}</span>}
                                {aiRes.dataSources && aiRes.dataSources.length > 0 && <span>Data: {aiRes.dataSources.join(', ')}</span>}
                                {aiRes.debug?.generatedFieldCount != null && <span>Fields: {aiRes.debug.generatedFieldCount}</span>}
                              </div>

                              <details style={{ marginBottom: 8 }}>
                                <summary style={{ fontSize: 8, fontWeight: 600, color: '#A0A0A0', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 7 }}>▶</span> Inputs
                                </summary>
                                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                                  {([
                                    ['Matter ID', aiReq.matterId], ['Instruction Ref', aiReq.instructionRef], ['Practice Area', aiReq.practiceArea],
                                    ['Client Name', aiReq.clientName], ['Description', aiReq.description], ['Handler', aiReq.handlerName],
                                    ['Role', aiReq.handlerRole], ['Rate', aiReq.handlerRate],
                                  ] as [string, string | undefined][]).filter(([, v]) => v && v.trim()).map(([label, value]) => (
                                    <div key={label} style={{ display: 'flex', gap: 6, marginBottom: 2, fontSize: 9 }}>
                                      <span style={{ color: '#A0A0A0', minWidth: 75, flexShrink: 0, fontWeight: 600 }}>{label}</span>
                                      <span style={{ color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>

                              {(aiRes.userPrompt || aiRes.systemPrompt) && (
                                <details style={{ marginBottom: 8 }}>
                                  <summary style={{ fontSize: 8, fontWeight: 600, color: '#A0A0A0', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 7 }}>▶</span> Prompts
                                  </summary>
                                  <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                                    {aiRes.systemPrompt && (
                                      <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 7, fontWeight: 700, color: '#A0A0A0', textTransform: 'uppercase' as const, marginBottom: 2 }}>System</div>
                                        <div style={{ fontSize: 9, color: '#d1d5db', lineHeight: 1.4, padding: '4px 8px', whiteSpace: 'pre-wrap', background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 120, overflow: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{aiRes.systemPrompt}</div>
                                      </div>
                                    )}
                                    {aiRes.userPrompt && (
                                      <div>
                                        <div style={{ fontSize: 7, fontWeight: 700, color: '#A0A0A0', textTransform: 'uppercase' as const, marginBottom: 2 }}>User</div>
                                        <div style={{ fontSize: 9, color: '#d1d5db', lineHeight: 1.4, padding: '4px 8px', whiteSpace: 'pre-wrap', background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 150, overflow: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{aiRes.userPrompt}</div>
                                      </div>
                                    )}
                                  </div>
                                </details>
                              )}

                              {aiRes.debug?.context && (
                                <details style={{ marginBottom: 4 }}>
                                  <summary style={{ fontSize: 8, fontWeight: 600, color: '#A0A0A0', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 7 }}>▶</span> Context ({aiRes.debug.context.sourceCount || 0} sources)
                                  </summary>
                                  <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                                    {aiRes.debug.context.sources && aiRes.debug.context.sources.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                        {aiRes.debug.context.sources.map((src: string) => (
                                          <span key={src} style={{ fontSize: 8, padding: '1px 6px', background: 'rgba(135,243,243,0.06)', border: '1px solid rgba(135,243,243,0.12)', color: colours.accent, fontWeight: 500 }}>{src}</span>
                                        ))}
                                      </div>
                                    )}
                                    {aiRes.debug.context.contextFields && Object.keys(aiRes.debug.context.contextFields).length > 0 && (
                                      <div>
                                        {Object.entries(aiRes.debug.context.contextFields).map(([k, v]) => (
                                          <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2, fontSize: 8 }}>
                                            <span style={{ color: '#A0A0A0', minWidth: 90, flexShrink: 0, fontWeight: 600 }}>{prettifyFieldKey(k)}</span>
                                            <span style={{ color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{String(v || '—')}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </details>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: 8, color: '#A0A0A0' }}>No AI trace yet.</div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Insight Modal ── */}
      {insightPeriod && (
        <div
          onClick={() => setInsightPeriod(null)}
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
              maxWidth: 520,
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
                  Enquiries — {insightLabel}
                </div>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  {insightLoading ? 'Loading…' : `${insightRecords.length} enquir${insightRecords.length === 1 ? 'y' : 'ies'}`}
                </div>
              </div>
              <span
                onClick={() => setInsightPeriod(null)}
                style={{ fontSize: 16, color: muted, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
              >×</span>
            </div>

            {/* AoW summary strip */}
            {insightAow.length > 0 && !insightLoading && (
              <div style={{ padding: '10px 18px', borderBottom: `1px solid ${cardBorder}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {insightAow.map((a) => (
                  <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: aowColor(a.key) }} />
                    <span style={{ fontSize: 10, color: text }}>{a.key}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: accent }}>{a.count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Records table */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {insightLoading ? (
                <div style={{ padding: '12px 0 0' }}>
                  <div style={{ padding: '0 18px 12px' }}>
                    <div style={{ width: '34%', height: 10, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)', borderRadius: 2, animation: 'opsDashPulse 1.2s ease-in-out infinite' }} />
                  </div>
                  <div style={{ background: theadBg, borderTop: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}`, display: 'grid', gridTemplateColumns: '34px 1fr 1.4fr 0.9fr 0.5fr', gap: 0, padding: '6px 10px' }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} style={{ height: 8, width: i === 2 ? '72%' : i === 1 ? '60%' : '48%', background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)', borderRadius: 2, animation: `opsDashPulse 1.4s ease-in-out infinite ${i * 0.08}s` }} />
                    ))}
                  </div>
                  {[0, 1, 2, 3, 4].map((row) => (
                    <div key={row} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 1.4fr 0.9fr 0.5fr', gap: 0, padding: '9px 10px', borderBottom: `1px solid ${rowBorder}`, alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDarkMode ? 'rgba(135,243,243,0.14)' : 'rgba(54,144,206,0.12)', animation: `opsDashPulse 1.4s ease-in-out infinite ${row * 0.06}s` }} />
                      <div style={{ width: '58%', height: 10, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)', borderRadius: 2, animation: `opsDashPulse 1.4s ease-in-out infinite ${row * 0.06 + 0.02}s` }} />
                      <div style={{ width: '74%', height: 10, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)', borderRadius: 2, animation: `opsDashPulse 1.4s ease-in-out infinite ${row * 0.06 + 0.04}s` }} />
                      <div style={{ width: '52%', height: 10, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)', borderRadius: 2, animation: `opsDashPulse 1.4s ease-in-out infinite ${row * 0.06 + 0.06}s` }} />
                      <div style={{ width: 18, height: 10, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)', borderRadius: 2, justifySelf: 'end', animation: `opsDashPulse 1.4s ease-in-out infinite ${row * 0.06 + 0.08}s` }} />
                    </div>
                  ))}
                </div>
              ) : insightRecords.length === 0 ? (
                <div style={{ padding: '24px 18px', fontSize: 11, color: muted, textAlign: 'center' }}>No records found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: theadBg }}>
                      {['', 'Date', 'Name', 'Source', 'FE'].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: theadText, textAlign: 'left', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insightRecords.map((r, i) => (
                      <tr
                        key={i}
                        style={{ transition: 'background 0.15s ease', animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '5px 4px 5px 10px', borderBottom: `1px solid ${rowBorder}`, width: 20, textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: aowColor(r.aow || '') }} />
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: 10, color: muted, borderBottom: `1px solid ${rowBorder}`, whiteSpace: 'nowrap' }}>
                          {r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: 10, color: text, borderBottom: `1px solid ${rowBorder}`, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name || '—'}
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: 10, color: muted, borderBottom: `1px solid ${rowBorder}`, whiteSpace: 'nowrap' }}>
                          {friendlySource(r.source)}
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: 9, fontWeight: 700, color: colours.green, borderBottom: `1px solid ${rowBorder}`, whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>
                          {r.poc ? (feInitials[r.poc.toLowerCase()] || r.poc) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

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
