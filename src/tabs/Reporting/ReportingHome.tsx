import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  DefaultButton,
  PrimaryButton,
  Spinner,
  SpinnerSize,
  FontIcon,
  type IButtonStyles,
  Slider,
  TooltipHost,
  IconButton,
  Callout,
} from '@fluentui/react';
import { FaChartLine, FaClipboardList, FaFolderOpen, FaInbox } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import type { Enquiry, Matter, POID, TeamData, UserData } from '../../app/functionality/types';
import { endOfDay, format, startOfDay, subMonths } from 'date-fns';
import ManagementDashboard, { WIP } from './ManagementDashboard';
import AnnualLeaveReport, { AnnualLeaveRecord } from './AnnualLeaveReport';
import MetaMetricsReport from './MetaMetricsReport';
import SeoReport from './SeoReport';
import PpcReport from './PpcReport';
import MattersReport from './MattersReport';
import { debugLog, debugWarn } from '../../utils/debug';
import { getNormalizedEnquirySource } from '../../utils/enquirySource';
import HomePreview from './HomePreview';
import EnquiriesReport, { MarketingMetrics } from './EnquiriesReport';
import LogMonitor from './LogMonitor';
import { useStreamingDatasets } from '../../hooks/useStreamingDatasets';
import { fetchWithRetry, fetchJSON } from '../../utils/fetchUtils';
import markWhite from '../../assets/markwhite.svg';
import type { PpcIncomeMetrics } from './PpcReport';
import { useToast } from '../../components/feedback/ToastProvider';
import type { DealRecord, InstructionRecord } from './dataSources';

// Add spinner animation CSS
const spinnerStyle = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes fadeInSlideDown {
  0% { 
    opacity: 0; 
    transform: translateY(-8px); 
  }
  100% { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

@keyframes dotFadeIn {
  0% { 
    opacity: 0; 
    transform: scale(0); 
  }
  60% { 
    transform: scale(1.1); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1); 
  }
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes fadeInUp {
  0% { 
    opacity: 0; 
    transform: translateY(12px); 
  }
  100% { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes slideInRight {
  0% { 
    opacity: 0; 
    transform: translateX(20px); 
  }
  100% { 
    opacity: 1; 
    transform: translateX(0); 
  }
}

@keyframes scaleIn {
  0% { 
    opacity: 0; 
    transform: scale(0.95); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1); 
  }
}
`;

// Persist streaming progress across navigation
const STREAM_SNAPSHOT_KEY = 'reporting_stream_snapshot_v1';
const CACHE_STATE_KEY = 'reporting_cache_state_v1';
const CACHE_PREHEAT_TIMESTAMP_KEY = 'reporting_cache_preheat_ts';
const CACHE_PREHEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes between background preheats

type ReportRangeKey = '3m' | '6m' | '12m' | '24m';
type MattersWipRangeKey = ReportRangeKey;

const REPORT_RANGE_OPTIONS: Array<{ key: ReportRangeKey; label: string; months: number }> = [
  { key: '3m', label: '90 days', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
  { key: '24m', label: '24 months', months: 24 },
];

const MATTERS_WIP_RANGE_OPTIONS = REPORT_RANGE_OPTIONS;

const RANGE_MONTH_LOOKUP = REPORT_RANGE_OPTIONS.reduce<Record<ReportRangeKey, number>>((acc, option) => {
  acc[option.key] = option.months;
  return acc;
}, {} as Record<ReportRangeKey, number>);



type ReportingRangeDatasetInfo = {
  key: string;
  label: string;
  range: string;
};

const formatDateForQuery = (date: Date) => format(date, 'yyyy-MM-dd');

const describeRangeKey = (key: ReportRangeKey) => {
  const option = REPORT_RANGE_OPTIONS.find((entry) => entry.key === key);
  return option ? option.label : REPORT_RANGE_OPTIONS[0].label;
};

const describeMattersRange = (key: MattersWipRangeKey) => describeRangeKey(key);

const computeRangeWindowForMonths = (months: number) => {
  const now = new Date();
  const end = endOfDay(now);
  const start = startOfDay(subMonths(end, months));
  return { start, end };
};

const computeRangeWindowByKey = (key: ReportRangeKey) => computeRangeWindowForMonths(RANGE_MONTH_LOOKUP[key]);

const buildDateRangeParams = (prefix: string, range: { start: Date; end: Date }) => {
  const startStr = formatDateForQuery(range.start);
  const endStr = formatDateForQuery(range.end);
  return {
    [`${prefix}RangeStart`]: startStr,
    [`${prefix}RangeEnd`]: endStr,
  };
};

const computeMattersRangeWindow = (key: MattersWipRangeKey) => computeRangeWindowByKey(key);

const buildMattersRangeParams = (range: { start: Date; end: Date }) => ({
  ...buildDateRangeParams('wip', range),
  ...buildDateRangeParams('recovered', range),
  ...buildDateRangeParams('deals', range),
  ...buildDateRangeParams('instructions', range),
});

const buildEnquiriesRangeParams = (range: { start: Date; end: Date }) => ({
  ...buildDateRangeParams('enquiries', range),
  ...buildDateRangeParams('deals', range),
  ...buildDateRangeParams('instructions', range),
});

const computeMetaDaysBackForRange = (key: ReportRangeKey) => {
  const monthsRequested = RANGE_MONTH_LOOKUP[key] ?? RANGE_MONTH_LOOKUP['6m'];
  const estimatedDays = Math.max(Math.round(monthsRequested * 30), 30);
  return estimatedDays;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const computeRangeLengthInDays = (range: { start: Date; end: Date }) => {
  if (!range?.start || !range?.end) {
    return 0;
  }
  const diff = range.end.getTime() - range.start.getTime();
  return Math.max(1, Math.round(diff / MS_PER_DAY));
};

const DEFAULT_META_DAYS = computeMetaDaysBackForRange('6m');

const buildMetaRangeParams = (key: ReportRangeKey) => ({
  metaDaysBack: String(computeMetaDaysBackForRange(key)),
});

const buildEnquiriesCoverageEntries = (key: ReportRangeKey): ReportingRangeDatasetInfo[] => {
  const rangeLabel = describeRangeKey(key);
  return [
    { key: 'enquiries', label: 'Enquiries feed', range: rangeLabel },
    { key: 'deals', label: 'Pitches feed', range: rangeLabel },
    { key: 'instructions', label: 'Instructions feed', range: rangeLabel },
    { key: 'metaAds', label: 'Meta Ads feed', range: rangeLabel },
    { key: 'googleAnalytics', label: 'Google Analytics', range: rangeLabel },
    { key: 'googleAds', label: 'Google Ads', range: rangeLabel },
  ];
};

const buildMattersCoverageEntries = (key: MattersWipRangeKey): ReportingRangeDatasetInfo[] => {
  const rangeLabel = describeMattersRange(key);
  return [
    { key: 'allMatters', label: 'Matters feed', range: rangeLabel },
    { key: 'wip', label: 'WIP', range: rangeLabel },
    { key: 'recoveredFees', label: 'Collected fees', range: rangeLabel },
  ];
};

// Global refresh state to prevent application-wide refresh spamming
let globalLastRefresh = 0;
const GLOBAL_REFRESH_COOLDOWN = 60000; // 1 minute global cooldown

// Persistent cache flags
const getCacheState = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_STATE_KEY);
    return raw ? JSON.parse(raw) : { hasFetchedOnce: false, lastCacheTime: null };
  } catch {
    return { hasFetchedOnce: false, lastCacheTime: null };
  }
};

const setCacheState = (hasFetchedOnce: boolean, lastCacheTime?: number | null) => {
  try {
    sessionStorage.setItem(
      CACHE_STATE_KEY,
      JSON.stringify({ hasFetchedOnce, lastCacheTime: lastCacheTime ?? null })
    );
  } catch {
    // no-op
  }
};

const getLastPreheatTimestamp = (): number | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_PREHEAT_TIMESTAMP_KEY);
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const setLastPreheatTimestamp = (timestamp: number) => {
  try {
    sessionStorage.setItem(CACHE_PREHEAT_TIMESTAMP_KEY, String(timestamp));
  } catch {
    // ignore
  }
};

let cachedData: DatasetMap = {
  userData: null,
  teamData: null,
  enquiries: null,
  allMatters: null,
  wip: null,
  recoveredFees: null,
  poidData: null,
  annualLeave: null,
  metaMetrics: null,
  googleAnalytics: null,
  googleAds: null,
  deals: null,
  instructions: null,
};
let cachedTimestamp: number | null = null;

const updateRefreshTimestamp = (timestamp: number, setLastRefreshTimestamp: (ts: number) => void) => {
  setLastRefreshTimestamp(timestamp);
  setCacheState(true, timestamp);
};

const normaliseKey = (input: unknown): string => {
  if (input == null) {
    return '';
  }
  return String(input).trim().toLowerCase();
};

const parseDateLoose = (input: unknown): Date | null => {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const candidate = new Date(input);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const normalised = trimmed.includes('/') && !trimmed.includes('T')
    ? (() => {
      const parts = trimmed.split('/');
      if (parts.length !== 3) {
        return trimmed;
      }
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    })()
    : trimmed;
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumberSafe = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractUserInitials = (userRecords: UserData[] | null | undefined): string | undefined => {
  if (!Array.isArray(userRecords) || userRecords.length === 0) {
    return undefined;
  }
  const first = userRecords[0] as Record<string, unknown>;
  const candidates = ['Initials', 'initials', 'Fe', 'FE'];
  for (const key of candidates) {
    const value = first[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const mapAnnualLeaveRecords = (raw: unknown): AnnualLeaveRecord[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.reduce<AnnualLeaveRecord[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }

    const personCandidate = item.person ?? item.fe ?? item.Fe;
    const startCandidate = item.start_date ?? item.startDate;
    const endCandidate = item.end_date ?? item.endDate;
    if (typeof personCandidate !== 'string' || typeof startCandidate !== 'string' || typeof endCandidate !== 'string') {
      return acc;
    }

    const rawRequestId = item.request_id ?? item.id ?? item.requestId ?? 0;
    const requestId = typeof rawRequestId === 'number' && Number.isFinite(rawRequestId)
      ? rawRequestId
      : Number(rawRequestId) || 0;

    const rawHearingConfirmation = item.hearing_confirmation;
    let hearingConfirmation: boolean | undefined;
    if (typeof rawHearingConfirmation === 'boolean') {
      hearingConfirmation = rawHearingConfirmation;
    } else if (rawHearingConfirmation != null) {
      const normalized = String(rawHearingConfirmation).trim().toLowerCase();
      hearingConfirmation = ['1', 'true', 'yes'].includes(normalized);
    }

    const rejectionNotes = typeof item.rejection_notes === 'string' && item.rejection_notes.trim().length > 0
      ? item.rejection_notes
      : undefined;

    const hearingDetails = typeof item.hearing_details === 'string' && item.hearing_details.trim().length > 0
      ? item.hearing_details
      : undefined;

    acc.push({
      request_id: requestId,
      fe: personCandidate,
      start_date: String(startCandidate),
      end_date: String(endCandidate),
      reason: typeof item.reason === 'string' ? item.reason : '',
      status: typeof item.status === 'string' ? item.status : '',
      days_taken: toNumberSafe(item.days_taken),
      leave_type: typeof item.leave_type === 'string' ? item.leave_type : undefined,
      rejection_notes: rejectionNotes,
      hearing_confirmation: hearingConfirmation,
      hearing_details: hearingDetails,
    });

    return acc;
  }, []);
};

const mapTeamDataFromPayload = (raw: unknown): TeamData[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<TeamData[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }

    const entry: TeamData = {};
    const initials = typeof item.Initials === 'string'
      ? item.Initials
      : typeof item.initials === 'string'
        ? item.initials
        : undefined;
    if (initials && initials.trim()) {
      entry.Initials = initials.trim();
    }

    const aow = typeof item.AOW === 'string'
      ? item.AOW
      : typeof item.aow === 'string'
        ? item.aow
        : undefined;
    if (aow && aow.trim()) {
      entry.AOW = aow.trim();
    }

    const entitlementRaw = item.holiday_entitlement ?? item.holidayEntitlement ?? item.HolidayEntitlement;
    const entitlement = typeof entitlementRaw === 'number'
      ? entitlementRaw
      : typeof entitlementRaw === 'string'
        ? Number(entitlementRaw)
        : undefined;
    if (Number.isFinite(entitlement)) {
      entry.holiday_entitlement = Number(entitlement);
    }

    acc.push(entry);
    return acc;
  }, []);
};

const isPpcSourceLabel = (value: unknown): boolean => {
  const source = normaliseKey(value);
  if (!source) {
    return false;
  }
  return (
    source.includes('ppc') ||
    source.includes('paid search') ||
    source.includes('google ads') ||
    source.includes('google ad') ||
    source.includes('adwords')
  );
};

const extractMatterIdentifiers = (matter: Matter) => {
  const rawIds = [
    (matter as any).MatterID,
    (matter as any)['Unique ID'],
    (matter as any).UniqueID,
    (matter as any).unique_id,
    (matter as any).matter_id,
    (matter as any).id,
  ];
  const displayValue = (matter as any).DisplayNumber
    ?? (matter as any)['Display Number']
    ?? (matter as any).display_number
    ?? '';
  const variants = [...rawIds.map(normaliseKey), normaliseKey(displayValue)]
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
  const canonical = variants[0] ?? '';
  return {
    canonical,
    variants,
    displayNumber: typeof displayValue === 'string' ? displayValue : String(displayValue ?? ''),
  };
};

interface RecoveredFee {
  payment_date: string;
  payment_allocated: number;
  user_id: number;
  matter_id?: number;
  description?: string;
  kind?: string;
  type?: string;
  activity_type?: string;
  bill_id?: number;
  user_name?: string;
}

interface GoogleAnalyticsData {
  date: string;
  sessions?: number;
  activeUsers?: number;
  screenPageViews?: number;
  bounceRate?: number;
  averageSessionDuration?: number;
  conversions?: number;
}

interface GoogleAdsData {
  date: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  ctr?: number;
  cpc?: number;
  cpa?: number;
}

interface DatasetMap {
  userData: UserData[] | null;
  teamData: TeamData[] | null;
  enquiries: Enquiry[] | null;
  allMatters: Matter[] | null;
  wip: WIP[] | null;
  recoveredFees: RecoveredFee[] | null;
  poidData: POID[] | null;
  annualLeave: AnnualLeaveRecord[] | null;
  metaMetrics: MarketingMetrics[] | null;
  googleAnalytics: GoogleAnalyticsData[] | null;
  googleAds: GoogleAdsData[] | null;
  deals: DealRecord[] | null;
  instructions: InstructionRecord[] | null;
}

interface AnnualLeaveFetchResult {
  records: AnnualLeaveRecord[];
  current: AnnualLeaveRecord[];
  future: AnnualLeaveRecord[];
  team: TeamData[];
  userDetails?: Record<string, unknown>;
}

const DATASETS = [
  { key: 'userData', name: 'Users' },
  { key: 'teamData', name: 'Team' },
  { key: 'enquiries', name: 'Enquiries' },
  { key: 'allMatters', name: 'Matters' },
  { key: 'wip', name: 'WIP' },
  { key: 'recoveredFees', name: 'Collected Fees' },
  { key: 'poidData', name: 'ID Submissions' },
  { key: 'annualLeave', name: 'Annual Leave' },
  { key: 'metaMetrics', name: 'Meta Ads' },
  { key: 'googleAnalytics', name: 'Google Analytics' },
  { key: 'googleAds', name: 'Google Ads' },
  { key: 'deals', name: 'Pitches' },
  { key: 'instructions', name: 'Instructions' },
] as const;

type DatasetDefinition = typeof DATASETS[number];
type DatasetKey = DatasetDefinition['key'];

type StreamingOverride = {
  datasets?: string[];
  bypassCache?: boolean;
  queryParams?: Record<string, string | number | boolean | null | undefined>;
};

interface GlobalRangeOverrides {
  enquiriesRangeKey?: ReportRangeKey;
  mattersRangeKey?: MattersWipRangeKey;
}

type StreamingDatasetKey = DatasetKey | 'wipClioCurrentWeek' | 'wipDbCurrentWeek';

interface RefreshOptions {
  rangeOverrides?: GlobalRangeOverrides;
  streamTargets?: StreamingDatasetKey[];
  statusTargets?: DatasetKey[];
  scope?: 'all' | 'dashboard';
}

const MATTERS_RANGE_DATASETS: DatasetKey[] = ['allMatters', 'wip', 'recoveredFees'];
const ENQUIRIES_RANGE_DATASETS: DatasetKey[] = ['enquiries', 'deals', 'instructions', 'metaMetrics'];
const MATTERS_REPORT_REFRESH_DATASETS: DatasetKey[] = [...MATTERS_RANGE_DATASETS, 'deals', 'instructions'];
const ENQUIRIES_REPORT_DATASETS: DatasetKey[] = ['enquiries', 'teamData', 'annualLeave', 'metaMetrics', 'deals', 'instructions'];
const META_REPORT_DATASETS: DatasetKey[] = ['metaMetrics', 'enquiries', 'deals', 'instructions'];
type DatasetStatusValue = 'idle' | 'loading' | 'ready' | 'error';

interface DatasetMeta {
  status: DatasetStatusValue;
  updatedAt: number | null;
}

type DatasetStatus = Record<DatasetKey, DatasetMeta>;

interface StreamSnapshot {
  statuses: Partial<DatasetStatus>;
  isComplete: boolean;
  hadStream: boolean;
  ts: number;
}

interface AvailableReport {
  key: string;
  name: string;
  status: string;
  action?: 'dashboard' | 'annualLeave' | 'enquiries' | 'metaMetrics' | 'seoReport' | 'ppcReport' | 'matters' | 'logMonitor';
  requiredDatasets: DatasetKey[];
  description?: string;
  disabled?: boolean;
}

const AVAILABLE_REPORTS: AvailableReport[] = [
  {
    key: 'dashboard',
    name: 'Management dashboard',
    status: 'Live today',
    action: 'dashboard',
    requiredDatasets: ['enquiries', 'allMatters', 'wip', 'recoveredFees', 'teamData', 'userData', 'annualLeave'],
  },
  {
    key: 'enquiries',
    name: 'Enquiries report',
    status: 'Live today',
    action: 'enquiries',
    requiredDatasets: ENQUIRIES_REPORT_DATASETS,
  },
  {
    key: 'annualLeave',
    name: 'Annual leave report',
    status: 'Live today',
    action: 'annualLeave',
    requiredDatasets: ['annualLeave', 'teamData'],
  },
  {
    key: 'matters',
    name: 'Matters',
    status: 'Focus view',
    action: 'matters',
    requiredDatasets: MATTERS_REPORT_REFRESH_DATASETS,
  },
  {
    key: 'metaMetrics',
    name: 'Meta ads',
    status: 'Live today',
    action: 'metaMetrics',
    requiredDatasets: META_REPORT_DATASETS,
  },
  {
    key: 'seo',
    name: 'SEO report',
    status: 'In beta',
    action: 'seoReport',
    requiredDatasets: ['googleAnalytics', 'googleAds'],
    disabled: true,
  },
  {
    key: 'ppc',
    name: 'PPC report',
    status: 'Live today',
    action: 'ppcReport',
    requiredDatasets: ['googleAds', 'enquiries', 'allMatters', 'recoveredFees'],
  },
  {
    key: 'logMonitor',
    name: 'Log Monitor',
    status: 'Developer tool',
    action: 'logMonitor',
    requiredDatasets: [],
    description: 'Real-time application logs',
  },
];

const REPORT_DATASET_REQUIREMENTS = AVAILABLE_REPORTS.reduce<Record<string, DatasetKey[]>>((acc, report) => {
  acc[report.key] = report.requiredDatasets;
  return acc;
}, {});

const MANAGEMENT_DATASET_KEYS = DATASETS.map((dataset) => dataset.key);
const GLOBAL_STREAM_DATASETS: StreamingDatasetKey[] = [
  ...MANAGEMENT_DATASET_KEYS.filter((key) => key !== 'annualLeave'),
  'wipClioCurrentWeek',
  'wipDbCurrentWeek',
];
const MANAGEMENT_DASHBOARD_STREAM_TARGETS: StreamingDatasetKey[] = [
  'userData',
  'teamData',
  'enquiries',
  'allMatters',
  'wip',
  'recoveredFees',
  'wipClioCurrentWeek',
  'wipDbCurrentWeek',
];
const MANAGEMENT_DASHBOARD_STATUS_TARGETS: DatasetKey[] = [
  'userData',
  'teamData',
  'enquiries',
  'allMatters',
  'wip',
  'recoveredFees',
  'annualLeave',
];

const STATUS_BADGE_COLOURS: Record<DatasetStatusValue, {
  lightBg: string;
  darkBg: string;
  dot: string;
  label: string;
  icon?: string;
}> = {
  ready: {
    lightBg: 'rgba(13, 47, 96, 0.22)',
    darkBg: 'rgba(34, 197, 94, 0.28)',
    dot: '#22c55e',
    label: 'Ready',
    icon: 'CheckMark',
  },
  loading: {
    lightBg: 'rgba(54, 144, 206, 0.18)',
    darkBg: 'rgba(54, 144, 206, 0.32)',
    dot: '#3690CE',
    label: 'Refreshing',
  },
  error: {
    lightBg: 'rgba(148, 163, 184, 0.16)',
    darkBg: 'rgba(148, 163, 184, 0.28)',
    dot: 'rgba(148, 163, 184, 0.7)',
    label: 'Error',
    icon: 'WarningSolid',
  },
  idle: {
    lightBg: 'rgba(148, 163, 184, 0.16)',
    darkBg: 'rgba(148, 163, 184, 0.28)',
    dot: 'rgba(148, 163, 184, 0.7)',
    label: 'Not loaded',
    icon: 'Clock',
  },
};

const DATASET_STATUS_SORT_ORDER: Record<DatasetStatusValue, number> = {
  loading: 0,
  error: 1,
  idle: 2,
  ready: 3,
};

const surfaceShadow = (isDarkMode: boolean): string => (
  isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
);

const subtleStroke = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'
);

const containerStyle = (isDarkMode: boolean): CSSProperties => ({
  minHeight: '100vh',
  width: '100%',
  padding: '26px 30px 40px',
  background: isDarkMode
    ? 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)'
    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 65%, #cbd5e1 100%)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  transition: 'background 0.3s ease, color 0.3s ease',
  fontFamily: 'Raleway, sans-serif',
});

const sectionSurfaceStyle = (isDarkMode: boolean, overrides: CSSProperties = {}): CSSProperties => ({
  background: isDarkMode ? 'linear-gradient(135deg, #020617 0%, #0a1220 100%)' : '#ffffff',
  borderRadius: 0,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(148, 163, 184, 0.45)'}`,
  boxShadow: surfaceShadow(isDarkMode),
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease',
  animation: 'fadeInUp 0.4s ease forwards',
  ...overrides,
});

const heroRightMarkStyle = (isDarkMode: boolean, isHovered: boolean = false): CSSProperties => ({
  position: 'absolute',
  top: '50%',
  right: 22,
  transform: 'translateY(-50%)',
  width: 120,
  height: 120,
  backgroundImage: `url(${markWhite})`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: 'contain',
  opacity: isHovered ? (isDarkMode ? 0.22 : 0.14) : (isDarkMode ? 0.14 : 0.08),
  pointerEvents: 'none',
  zIndex: 0,
  transition: 'opacity 0.45s ease',
});

const heroRightOverlayStyle = (isDarkMode: boolean): CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  width: 100,
  height: '100%',
  background: isDarkMode
    ? 'linear-gradient(to left, rgba(15, 23, 42, 0.18) 0%, transparent 70%)'
    : 'linear-gradient(to left, rgba(15, 23, 42, 0.04) 0%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 1,
});

const reportsListStyle = (): CSSProperties => ({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});

const reportRowStyle = (isDarkMode: boolean, animationIndex?: number): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 14px',
  borderRadius: 0,
  border: `1px solid ${subtleStroke(isDarkMode)}`,
  background: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : 'rgba(255, 255, 255, 0.95)',
  opacity: animationIndex !== undefined ? 0 : 1,
  animation: animationIndex !== undefined ? 'fadeInUp 0.3s ease forwards' : 'none',
  animationDelay: animationIndex !== undefined ? `${animationIndex * 0.06}s` : '0s',
});

const reportRowHeaderStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  color: isDarkMode ? colours.dark.text : colours.light.text,
});

const reportNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
};

const reportStatusStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  color: isDarkMode ? colours.dark.subText : colours.highlight,
});

const dataFeedListStyle = (): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

const feedRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderRadius: 0,
  padding: '8px 12px',
  background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
  border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
  gap: 12,
});

const feedLabelGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const feedLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const feedMetaStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
};

const statusPillStyle = (
  palette: { lightBg: string; darkBg: string; dot: string; label: string },
  isDarkMode: boolean,
): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: isDarkMode ? palette.darkBg : palette.lightBg,
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  boxShadow: 'none',
});

const statusDotStyle = (colour: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: colour,
});

const statusIconStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 12,
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
});

const reportCardsGridStyle = (): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
  marginTop: 4,
});

const reportCardBaseStyle = (isDarkMode: boolean): CSSProperties => ({
  borderRadius: 12,
  padding: 16,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
  border: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.45)' : 'rgba(226, 232, 240, 0.9)'}`,
  boxShadow: isDarkMode ? '0 6px 18px rgba(2, 6, 23, 0.35)' : '0 3px 10px rgba(15, 23, 42, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 150,
});

type ReportVisualState = 'neutral' | 'warming' | 'ready' | 'disabled';

const REPORT_CARD_STATE_TOKENS: Record<ReportVisualState, {
  label: string;
  accent: string;
  lightBadgeBg: string;
  darkBadgeBg: string;
}> = {
  ready: {
    label: 'Ready',
    accent: '#22c55e',
    lightBadgeBg: 'rgba(34, 197, 94, 0.15)',
    darkBadgeBg: 'rgba(34, 197, 94, 0.28)',
  },
  warming: {
    label: 'Fetching…',
    accent: '#3690CE',
    lightBadgeBg: 'rgba(54, 144, 206, 0.15)',
    darkBadgeBg: 'rgba(54, 144, 206, 0.28)',
  },
  neutral: {
    label: 'Needs data',
    accent: '#94a3b8',
    lightBadgeBg: 'rgba(148, 163, 184, 0.18)',
    darkBadgeBg: 'rgba(148, 163, 184, 0.32)',
  },
  disabled: {
    label: 'In beta',
    accent: '#3690CE',
    lightBadgeBg: 'rgba(54, 144, 206, 0.15)',
    darkBadgeBg: 'rgba(54, 144, 206, 0.3)',
  },
};

const getReportCardBadgeBg = (state: ReportVisualState, isDarkMode: boolean): string => (
  isDarkMode ? REPORT_CARD_STATE_TOKENS[state].darkBadgeBg : REPORT_CARD_STATE_TOKENS[state].lightBadgeBg
);

const dependencyChipsWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const dependencyChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 500,
  background: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
  border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.7)' : 'rgba(203, 213, 225, 1)'}`,
  color: isDarkMode ? '#e2e8f0' : '#0f172a',
});

const dependencyDotStyle = (colour: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: colour,
});

// Render a compact JSON-like snippet for previewing row content safely
const formatPreviewRow = (row: unknown): string => {
  try {
    // Avoid huge payloads; stringify with replacer to trim nested arrays/objects
    const replacer = (_key: string, value: any) => {
      if (Array.isArray(value)) return `[Array(${value.length})]`;
      if (value && typeof value === 'object') return Object.fromEntries(
        Object.entries(value).slice(0, 6)
      );
      return value;
    };
    const text = JSON.stringify(row, replacer, 2);
    // Truncate long strings
    return text.length > 320 ? text.slice(0, 320) + '…' : text;
  } catch {
    return String(row);
  }
};

const refreshProgressPanelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '14px 16px',
  borderRadius: 12,
  background: isDarkMode
    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.94) 100%)'
    : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(59, 130, 246, 0.18)'}`,
  boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
});

const refreshProgressHeaderStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
});

const refreshProgressDetailStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 12,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.72)',
  lineHeight: 1.5,
});

const refreshProgressDatasetListStyle = (): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

const refreshProgressDatasetRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderRadius: 10,
  background: isDarkMode ? 'rgba(30, 41, 59, 0.65)' : 'rgba(241, 245, 249, 0.85)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.28)'}`,
  gap: 10,
});

const refreshProgressDatasetLabelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  fontWeight: 600,
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
});

const refreshProgressDatasetStatusStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  fontWeight: 600,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.74)' : 'rgba(15, 23, 42, 0.64)',
});

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 9,
  fontWeight: 700,
  fontFamily: 'Raleway, sans-serif',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const heroMetaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  fontSize: 12,
};

const heroContentStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 26,
  width: '100%',
  position: 'relative',
  zIndex: 2,
});

const heroLeftColumnStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  color: isDarkMode ? colours.light.text : colours.dark.text,
});

const heroRightColumnStyle = (isDarkMode: boolean): CSSProperties => ({
  borderRadius: 0,
  padding: '18px 20px',
  background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.88)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`,
  boxShadow: isDarkMode ? '0 20px 45px rgba(2, 6, 23, 0.35)' : '0 16px 30px rgba(15, 23, 42, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
});

const heroBadgeRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'Raleway, sans-serif',
  color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(13, 47, 96, 0.7)',
  fontSize: 11,
  letterSpacing: 0.2,
});

const heroDescriptionStyle = (isDarkMode: boolean): CSSProperties => ({
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.78)',
});

const heroMetaChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
  border: `1px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: 'none',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  fontSize: 12,
});

const heroCtaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
};

const fullScreenWrapperStyle = (isDarkMode: boolean): CSSProperties => ({
  minHeight: '100vh',
  padding: '24px 28px',
  background: isDarkMode 
    ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 65%, #cbd5e1 100%)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  transition: 'background 0.3s ease, color 0.3s ease',
  position: 'relative',
  overflow: 'hidden',
});

type ButtonState = 'neutral' | 'warming' | 'ready';

interface ReportDependency {
  key: DatasetKey;
  name: string;
  status: DatasetStatusValue;
  range: string;
}

type ReportCard = AvailableReport & {
  readiness: ButtonState;
  dependencies: ReportDependency[];
  readyDependencies: number;
  totalDependencies: number;
};

const conditionalButtonStyles = (isDarkMode: boolean, state: ButtonState): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 16px',
    height: 36,
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(13, 47, 96, 0.22)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.16)'; // Using dark blue for light mode
        case 'neutral':
        default:
          return isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.04)';
      }
    })(),
    color: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? '#86efac' : '#0d2f60'; // Using dark blue for light mode
        case 'warming':
          return isDarkMode ? '#87F3F3' : '#0d2f60'; // Using dark blue for light mode
        case 'neutral':
        default:
          return isDarkMode ? '#cbd5e1' : '#64748b';
      }
    })(),
    border: (() => {
      switch (state) {
        case 'ready':
          return `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(13, 47, 96, 0.2)'}`;
        case 'warming':
          return `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(13, 47, 96, 0.2)'}`; // Dark blue border
        case 'neutral':
        default:
          return `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`;
      }
    })(),
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'all 0.15s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(13, 47, 96, 0.28)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(135, 243, 243, 0.16)' : 'rgba(13, 47, 96, 0.16)';
        case 'neutral':
        default:
          return isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.08)';
      }
    })(),
    color: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? '#86efac' : '#0d2f60';
        case 'warming':
          return isDarkMode ? '#87F3F3' : '#0d2f60'; // Using dark blue for light mode
        case 'neutral':
        default:
          return isDarkMode ? '#cbd5e1' : '#64748b';
      }
    })(),
    borderColor: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(13, 47, 96, 0.3)';
        case 'warming':
          return isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(13, 47, 96, 0.3)';
        case 'neutral':
        default:
          return isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
      }
    })(),
  },
  rootPressed: {
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(13, 47, 96, 0.32)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(13, 47, 96, 0.2)';
        case 'neutral':
        default:
          return isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)';
      }
    })(),
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)',
    color: isDarkMode ? '#64748b' : '#94a3b8',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
  },
});

const primaryButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 18px',
    height: 36,
    background: colours.highlight,
    color: '#ffffff',
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.15s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: '#2d7ab8',
    boxShadow: '0 2px 8px rgba(54, 144, 206, 0.3)',
  },
  rootPressed: {
    background: '#266795',
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
    color: isDarkMode ? '#64748b' : '#94a3b8',
    border: 'none',
  },
  icon: {
    color: '#ffffff',
    fontSize: 14,
  },
});

const subtleButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 14px',
    height: 36,
    background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'transparent',
    color: isDarkMode ? '#e2e8f0' : '#475569',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
    fontWeight: 500,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.15s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.08)',
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.12)',
  },
  icon: {
    color: isDarkMode ? '#94a3b8' : '#64748b',
    fontSize: 14,
  },
});

const dashboardNavigatorStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
});

const dashboardNavigatorTitleStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Raleway, sans-serif',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
});

const dashboardNavigatorButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 999,
    height: 32,
    padding: '0 12px',
    background: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.95)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(13, 47, 96, 0.18)'}`,
    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
    boxShadow: 'none',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'rgba(236, 244, 251, 0.96)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(222, 235, 249, 0.96)',
  },
  icon: {
    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  },
  label: {
    fontSize: 12,
  },
});

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) {
    const minutes = Math.round(diff / 60000);
    return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  }
  if (diff < 86400000) {
    const hours = Math.round(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTimestamp = (timestamp: number): string => (
  new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
);

// Convert Clio current week data to WIP format for Management Dashboard
function convertClioToWipFormat(clioData: any, teamData: any[], currentUserData: any[]): WIP[] {
  if (!clioData || !currentUserData?.[0]) return [];
  
  const wipEntries: WIP[] = [];
  const currentWeek = clioData.current_week;
  const currentUser = currentUserData[0];
  const currentUserClioId = currentUser['Clio ID'] ? parseInt(currentUser['Clio ID'], 10) : null;
  
  if (!currentUserClioId || !currentWeek?.daily_data) return [];
  
  // Iterate through each day in current week
  Object.entries(currentWeek.daily_data).forEach(([date, dayData]: [string, any]) => {
    if (dayData && typeof dayData === 'object' && dayData.total_hours > 0) {
      // Create a WIP entry for this day and the current user
      wipEntries.push({
        created_at: `${date}T00:00:00`, // Use the date from Clio
        total: dayData.total_amount || 0,
        quantity_in_hours: dayData.total_hours || 0,
        user_id: currentUserClioId,
      });
    }
  });
  
  return wipEntries;
}

const formatDurationMs = (ms: number): string => {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const formatElapsedTime = (ms: number): string => {
  if (ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`; // e.g., "4.2s"
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 10 && seconds > 0) return `${minutes}m ${seconds}s`;
  return `${minutes}m`;
};

const REFRESH_PHASES: Array<{ thresholdMs: number; label: string }> = [
  { thresholdMs: 15000, label: 'Connecting to reporting data sources…' },
  { thresholdMs: 45000, label: 'Pulling the latest matters and enquiries…' },
  { thresholdMs: 90000, label: 'Crunching reporting metrics…' },
  { thresholdMs: Number.POSITIVE_INFINITY, label: 'Finalising dashboard views…' },
];

const formatCurrency = (amount: number): string => {
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `£${(amount / 1000).toFixed(1)}k`;
};

// Marketing Data Settings Component
// (Removed MarketingDataSettingsProps; settings UI deleted)

// (Removed MarketingDataSettings component)

interface ReportingHomeProps {
  userData?: UserData[] | null;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
}

/**
 * Streamlined reporting landing page that centres on the Management Dashboard experience.
 */
const ReportingHome: React.FC<ReportingHomeProps> = ({ userData: propUserData, teamData: propTeamData, demoModeEnabled = false }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const { showToast, hideToast, updateToast } = useToast();
  const loadingToastIdRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [activeView, setActiveView] = useState<'overview' | 'dashboard' | 'annualLeave' | 'enquiries' | 'metaMetrics' | 'seoReport' | 'ppcReport' | 'matters' | 'logMonitor'>('overview');
  const [mattersWipRangeKey, setMattersWipRangeKey] = useState<MattersWipRangeKey>('12m');
  const [pendingMattersRangeKey, setPendingMattersRangeKey] = useState<MattersWipRangeKey>(mattersWipRangeKey);
  const [enquiriesRangeKey, setEnquiriesRangeKey] = useState<ReportRangeKey>('12m');
  const [pendingEnquiriesRangeKey, setPendingEnquiriesRangeKey] = useState<ReportRangeKey>(enquiriesRangeKey);
  const refreshRangeButtonRef = useRef<HTMLSpanElement | null>(null);
  const [isRefreshRangeCalloutOpen, setRefreshRangeCalloutOpen] = useState(false);
  const mattersRangeWindow = useMemo(() => computeMattersRangeWindow(mattersWipRangeKey), [mattersWipRangeKey]);
  const enquiriesRangeWindow = useMemo(() => computeRangeWindowByKey(enquiriesRangeKey), [enquiriesRangeKey]);
  const mattersRangeDays = useMemo(() => computeRangeLengthInDays(mattersRangeWindow), [mattersRangeWindow]);
  const enquiriesRangeDays = useMemo(() => computeRangeLengthInDays(enquiriesRangeWindow), [enquiriesRangeWindow]);
  const managementRangeDays = useMemo(
    () => Math.max(1, Math.min(mattersRangeDays || 1, enquiriesRangeDays || 1)),
    [mattersRangeDays, enquiriesRangeDays]
  );
  const enquiriesRangeParams = useMemo(() => buildEnquiriesRangeParams(enquiriesRangeWindow), [enquiriesRangeWindow]);
  const metaRangeParams = useMemo(() => buildMetaRangeParams(enquiriesRangeKey), [enquiriesRangeKey]);
  const metaDaysBack = useMemo(() => computeMetaDaysBackForRange(enquiriesRangeKey), [enquiriesRangeKey]);
  const enquiriesRangeActiveCoverage = useMemo(() => buildEnquiriesCoverageEntries(enquiriesRangeKey), [enquiriesRangeKey]);
  const enquiriesRangePendingCoverage = useMemo(() => buildEnquiriesCoverageEntries(pendingEnquiriesRangeKey), [pendingEnquiriesRangeKey]);
  const mattersRangeActiveCoverage = useMemo(() => buildMattersCoverageEntries(mattersWipRangeKey), [mattersWipRangeKey]);
  const mattersRangePendingCoverage = useMemo(() => buildMattersCoverageEntries(pendingMattersRangeKey), [pendingMattersRangeKey]);
  const streamingRangeParams = useMemo(() => ({
    ...buildMattersRangeParams(mattersRangeWindow),
    ...enquiriesRangeParams,
    ...metaRangeParams,
  }), [mattersRangeWindow, enquiriesRangeParams, metaRangeParams]);

  useEffect(() => {
    setPendingMattersRangeKey(mattersWipRangeKey);
  }, [mattersWipRangeKey]);
  useEffect(() => {
    setPendingEnquiriesRangeKey(enquiriesRangeKey);
  }, [enquiriesRangeKey]);
  const [heroHovered, setHeroHovered] = useState(false);
  const [expandedReportCards, setExpandedReportCards] = useState<string[]>([]);
  const [activePrimaryCard, setActivePrimaryCard] = useState<string | null>(null); // Track which primary card is active
  
  // Individual report loading states and progress tracking
  const [reportProgressStates, setReportProgressStates] = useState<{
    [key: string]: {
      isLoading: boolean;
      progress: number;
      estimatedTimeRemaining?: number;
      stage?: string;
      startTime?: number;
    }
  }>({});

  const [resumeNotice, setResumeNotice] = useState<{ message: string; startedAt: number } | null>(null);
  const resumeNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Test mode - only available in local development
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [testMode, setTestMode] = useState(() => demoModeEnabled);
  // (Removed marketing data settings state; always fetch 24 months)
  
  // Memoize handlers to prevent recreation on every render
  const handleBackToOverview = useCallback(() => {
    setActiveView('overview');
  }, []);

  useEffect(() => {
    setTestMode(demoModeEnabled);
  }, [demoModeEnabled]);

  const clearResumeNoticeTimeout = useCallback(() => {
    if (resumeNoticeTimeoutRef.current) {
      clearTimeout(resumeNoticeTimeoutRef.current);
      resumeNoticeTimeoutRef.current = null;
    }
  }, []);

  const dismissResumeNotice = useCallback(() => {
    clearResumeNoticeTimeout();
    setResumeNotice(null);
  }, [clearResumeNoticeTimeout]);

  const showResumeNotice = useCallback((message: string) => {
    clearResumeNoticeTimeout();
    setResumeNotice({ message, startedAt: Date.now() });
    resumeNoticeTimeoutRef.current = setTimeout(() => {
      setResumeNotice(null);
      resumeNoticeTimeoutRef.current = null;
    }, 8000);
  }, [clearResumeNoticeTimeout]);

  // Fetch Google Analytics data with time range
  const fetchGoogleAnalyticsData = useCallback(async (months: number, signal?: AbortSignal): Promise<GoogleAnalyticsData[]> => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      const params = new URLSearchParams({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const response = await fetch(`/api/marketing-metrics/ga4?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Google Analytics fetch failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching Google Analytics data:', error);
      throw error;
    }
  }, []);

  // Fetch Google Ads data with time range
  const fetchGoogleAdsData = useCallback(async (months: number, signal?: AbortSignal): Promise<GoogleAdsData[]> => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      const params = new URLSearchParams({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const response = await fetch(`/api/marketing-metrics/google-ads?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Google Ads fetch failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching Google Ads data:', error);
      throw error;
    }
  }, []);
  const [datasetData, setDatasetData] = useState<DatasetMap>(() => ({
    userData: propUserData ?? cachedData.userData,
    teamData: propTeamData ?? cachedData.teamData,
    enquiries: cachedData.enquiries,
    allMatters: cachedData.allMatters,
    wip: cachedData.wip,
    recoveredFees: cachedData.recoveredFees,
    poidData: cachedData.poidData,
    annualLeave: cachedData.annualLeave,
    metaMetrics: cachedData.metaMetrics,
    googleAnalytics: cachedData.googleAnalytics,
    googleAds: cachedData.googleAds,
    deals: cachedData.deals,
    instructions: cachedData.instructions,
  }));
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>(() => {
    const record: Partial<DatasetStatus> = {};
    DATASETS.forEach((dataset) => {
      const value = dataset.key === 'userData' && propUserData !== undefined
        ? propUserData
        : dataset.key === 'teamData' && propTeamData !== undefined
          ? propTeamData
          : cachedData[dataset.key];
      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
      record[dataset.key] = { status: hasValue ? 'ready' : 'idle', updatedAt: cachedTimestamp };
    });
    return record as DatasetStatus;
  });
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number | null>(cachedTimestamp);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState<boolean>(() => {
    const cacheState = getCacheState();
    // If we have valid cached data AND the persistent flag says we've fetched before, honor it
    return Boolean(cachedTimestamp) && cacheState.hasFetchedOnce;
  });
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null);
  const prevIsFetchingRef = useRef<boolean>(false);

  // Show global toast notifications for data loading
  useEffect(() => {
    const wasFetching = prevIsFetchingRef.current;
    prevIsFetchingRef.current = isFetching;

    if (isFetching && !wasFetching) {
      // Starting to fetch - clear any orphaned loading toast from previous instance
      if (loadingToastIdRef.current) {
        hideToast(loadingToastIdRef.current);
      }
      const toastId = showToast({
        type: 'loading',
        title: 'Loading Reporting Data',
        message: 'Fetching latest data. You can continue browsing - we\'ll notify you when it\'s ready.',
      });
      loadingToastIdRef.current = toastId;
    } else if (!isFetching && wasFetching) {
      // Finished fetching - hide loading toast and show success
      if (loadingToastIdRef.current) {
        hideToast(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
      showToast({
        type: 'success',
        title: 'Data Ready',
        message: 'Reporting data has been refreshed.',
        action: {
          label: 'View Reports',
          onClick: () => setActiveView('overview'),
        },
      });
    }

    // Cleanup when unmounting - only hide toast if fetching completed
    // If still fetching, let it persist so user knows data is loading in background
    return () => {
      if (loadingToastIdRef.current && !isFetching) {
        hideToast(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
    };
  }, [isFetching, showToast, hideToast]);

  const buildDemoDatasets = useCallback((): DatasetMap => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    return {
      userData: propUserData ?? [],
      teamData: propTeamData ?? [],
      enquiries: [],
      allMatters: [],
      wip: [
        {
          created_at: now.toISOString(),
          total: 750,
          quantity_in_hours: 2.5,
          user_id: 1,
        },
      ],
      recoveredFees: [
        {
          payment_date: today,
          payment_allocated: 1200,
          user_id: 1,
          kind: 'Service',
        },
      ],
      poidData: [],
      annualLeave: [],
      metaMetrics: [],
      googleAnalytics: [],
      googleAds: [],
      deals: [],
      instructions: [],
    };
  }, [propUserData, propTeamData]);

  const applyDemoDatasets = useCallback(() => {
    const now = Date.now();
    const demoData = buildDemoDatasets();
    setDatasetData(prev => ({ ...prev, ...demoData }));
    setDatasetStatus(() => {
      const next: Partial<DatasetStatus> = {};
      DATASETS.forEach((dataset) => {
        next[dataset.key] = { status: 'ready', updatedAt: now } as DatasetStatus[DatasetKey];
      });
      return next as DatasetStatus;
    });
    cachedData = { ...cachedData, ...demoData };
    cachedTimestamp = now;
    setLastRefreshTimestamp(now);
    setHasFetchedOnce(true);
    setCacheState(true, now);
  }, [buildDemoDatasets]);
  const datasetStatusRef = useRef<DatasetStatus>(datasetStatus);
  const refreshStartedAtRef = useRef<number | null>(refreshStartedAt);
  const isStreamingConnectedRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(isFetching);
  const preheatInFlightRef = useRef(false);
  const lastStreamActivityRef = useRef<number>(Date.now());
  const lastAutoResumeRef = useRef<number>(0);
  const lastStreamingConfigRef = useRef<StreamingOverride | undefined>(undefined);
  const streamingQueryParamsRef = useRef<Record<string, string>>(streamingRangeParams);
  // PPC-specific Google Ads data (follows enquiries range)
  const [ppcGoogleAdsData, setPpcGoogleAdsData] = useState<GoogleAdsData[] | null>(null);
  const [ppcLoading, setPpcLoading] = useState<boolean>(false);
  const [ppcGoogleAdsUpdatedAt, setPpcGoogleAdsUpdatedAt] = useState<number | null>(() => {
    const initial = datasetStatus.googleAds?.updatedAt;
    return typeof initial === 'number' && Number.isFinite(initial) ? initial : null;
  });
  const googleAdsRequestIdRef = useRef(0);
  const googleAnalyticsRequestIdRef = useRef(0);

  useEffect(() => {
    if (demoModeEnabled) {
      applyDemoDatasets();
    }
  }, [demoModeEnabled, applyDemoDatasets]);
  const ppcIncomeMetrics = useMemo<PpcIncomeMetrics | null>(() => {
    const enquiries = datasetData.enquiries;
    const matters = datasetData.allMatters;
    const recovered = datasetData.recoveredFees;

    if (!Array.isArray(enquiries) || !Array.isArray(matters) || !Array.isArray(recovered)) {
      return null;
    }

    const MAX_UNMATCHED_PREVIEW = 25;
    const MS_IN_DAY = 1000 * 60 * 60 * 24;

    const ppcEnquiries = enquiries.filter((enquiry) => {
      try {
        return getNormalizedEnquirySource(enquiry).key === 'google_ads';
      } catch (err) {
        debugWarn('ReportingHome: Failed to normalise enquiry source for PPC detection', {
          enquiryId: enquiry.ID,
          error: err instanceof Error ? err.message : err,
        });
        return false;
      }
    });

    const enquiriesByMatterRef = new Map<string, Enquiry[]>();
    const enquiriesByEmail = new Map<string, Enquiry[]>();

    const pushToBucket = (map: Map<string, Enquiry[]>, key: string, record: Enquiry) => {
      if (!key) {
        return;
      }
      const bucket = map.get(key) ?? [];
      bucket.push(record);
      map.set(key, bucket);
    };

    ppcEnquiries.forEach((enquiry) => {
      pushToBucket(enquiriesByMatterRef, normaliseKey(enquiry.Matter_Ref || (enquiry as any).matter_ref), enquiry);
      pushToBucket(enquiriesByEmail, normaliseKey(enquiry.Email), enquiry);
    });

    const candidateMatters = matters
      .map((matter) => {
        const identifiers = extractMatterIdentifiers(matter);
        const displayKey = normaliseKey(identifiers.displayNumber);
        const matchesSource = isPpcSourceLabel((matter as any).Source || (matter as any).source);
        const hasLinkedEnquiry = displayKey && enquiriesByMatterRef.has(displayKey);
        if (!matchesSource && !hasLinkedEnquiry) {
          return null;
        }
        return { matter, identifiers, displayKey };
      })
      .filter((entry): entry is { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string } => Boolean(entry));

    if (candidateMatters.length === 0 && ppcEnquiries.length === 0) {
      return null;
    }

    const idToMatter = new Map<string, { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string }>();
    candidateMatters.forEach((entry) => {
      entry.identifiers.variants.forEach((variant) => {
        if (variant) {
          idToMatter.set(variant, entry);
        }
      });
    });

    const selectLinkedEnquiry = (entry: { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string }): Enquiry | undefined => {
      if (entry.displayKey && enquiriesByMatterRef.has(entry.displayKey)) {
        return enquiriesByMatterRef.get(entry.displayKey)?.[0];
      }
      const emailCandidate = (entry.matter as any).ClientEmail
        || (entry.matter as any)['Client Email']
        || (entry.matter as any).client_email
        || (entry.matter as any).clientEmail;
      const emailKey = normaliseKey(emailCandidate);
      if (emailKey && enquiriesByEmail.has(emailKey)) {
        return enquiriesByEmail.get(emailKey)?.[0];
      }
      return undefined;
    };

    const breakdownMap = new Map<string, PpcIncomeMetrics['breakdown'][number]>();
    const unmatchedPreview: { matterId?: string; paymentDate?: string; amount: number; kind?: string; description?: string }[] = [];
    let unmatchedTotal = 0;
    let matchedPaymentCount = 0;

    recovered.forEach((fee) => {
      const amount = toNumberSafe(fee.payment_allocated);
      if (amount <= 0) {
        return;
      }

      const kind = typeof fee.kind === 'string' ? fee.kind : undefined;
      if (kind === 'Expense' || kind === 'Product') {
        return; // Skip disbursements to mirror Management Dashboard totals
      }

      const candidateKeys = [
        normaliseKey(fee.matter_id),
        normaliseKey((fee as any).matterId),
        normaliseKey((fee as any).matter),
        normaliseKey(fee.bill_id),
      ].filter(Boolean);

      let matchedEntry: { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string } | undefined;
      let canonicalKey: string | undefined;

      for (const key of candidateKeys) {
        const entry = idToMatter.get(key);
        if (entry) {
          matchedEntry = entry;
          canonicalKey = entry.identifiers.canonical || entry.identifiers.variants[0];
          break;
        }
      }

      if (!matchedEntry && typeof fee.description === 'string') {
        const matches = fee.description.match(/[A-Z]{2,}-\d{3,}/g);
        if (matches) {
          for (const token of matches) {
            const entry = idToMatter.get(normaliseKey(token));
            if (entry) {
              matchedEntry = entry;
              canonicalKey = entry.identifiers.canonical || entry.identifiers.variants[0];
              break;
            }
          }
        }
      }

      if (!matchedEntry || !canonicalKey) {
        unmatchedTotal += 1;
        if (unmatchedPreview.length < MAX_UNMATCHED_PREVIEW) {
          unmatchedPreview.push({
            matterId: fee.matter_id != null ? String(fee.matter_id) : undefined,
            paymentDate: fee.payment_date,
            amount,
            kind,
            description: fee.description,
          });
        }
        return;
      }

      matchedPaymentCount += 1;

      let breakdown = breakdownMap.get(canonicalKey);
      if (!breakdown) {
        const linkedEnquiry = selectLinkedEnquiry(matchedEntry);
        breakdown = {
          matterId: matchedEntry.identifiers.canonical || matchedEntry.identifiers.variants[0],
          displayNumber: matchedEntry.identifiers.displayNumber,
          clientName: (matchedEntry.matter as any).ClientName || (matchedEntry.matter as any)['Client Name'],
          source: (matchedEntry.matter as any).Source || (matchedEntry.matter as any).source,
          openDate: (matchedEntry.matter as any).OpenDate || (matchedEntry.matter as any)['Open Date'] || (matchedEntry.matter as any).openDate,
          totalCollected: 0,
          collectedWithin7Days: 0,
          collectedWithin30Days: 0,
          payments: [],
          enquiryId: linkedEnquiry?.ID,
          enquiryDate: linkedEnquiry?.Touchpoint_Date,
          enquirySource: linkedEnquiry?.Ultimate_Source,
          enquiryMoc: linkedEnquiry?.Method_of_Contact,
        };
        breakdownMap.set(canonicalKey, breakdown);
      }

      breakdown.payments.push({
        paymentDate: fee.payment_date,
        amount,
        kind,
        description: fee.description,
      });
      breakdown.totalCollected += amount;

      const openDate = parseDateLoose(breakdown.openDate);
      const paymentDate = parseDateLoose(fee.payment_date);
      if (openDate && paymentDate) {
        const diffDays = (paymentDate.getTime() - openDate.getTime()) / MS_IN_DAY;
        if (diffDays >= 0 && diffDays <= 7) {
          breakdown.collectedWithin7Days += amount;
        }
        if (diffDays >= 0 && diffDays <= 30) {
          breakdown.collectedWithin30Days += amount;
        }
      }
    });

    candidateMatters.forEach((entry) => {
      const canonicalKey = entry.identifiers.canonical || entry.identifiers.variants[0];
      if (!canonicalKey || breakdownMap.has(canonicalKey)) {
        return;
      }
      const linkedEnquiry = selectLinkedEnquiry(entry);
      breakdownMap.set(canonicalKey, {
        matterId: canonicalKey,
        displayNumber: entry.identifiers.displayNumber,
        clientName: (entry.matter as any).ClientName || (entry.matter as any)['Client Name'],
        source: (entry.matter as any).Source || (entry.matter as any).source,
        openDate: (entry.matter as any).OpenDate || (entry.matter as any)['Open Date'] || (entry.matter as any).openDate,
        totalCollected: 0,
        collectedWithin7Days: 0,
        collectedWithin30Days: 0,
        payments: [],
        enquiryId: linkedEnquiry?.ID,
        enquiryDate: linkedEnquiry?.Touchpoint_Date,
        enquirySource: linkedEnquiry?.Ultimate_Source,
        enquiryMoc: linkedEnquiry?.Method_of_Contact,
      });
    });

    const breakdownList = Array.from(breakdownMap.values()).sort((a, b) => b.totalCollected - a.totalCollected);

    const summary = {
      totalEnquiries: ppcEnquiries.length,
      totalMatters: candidateMatters.length,
      mattersWithRevenue: breakdownList.filter((record) => record.totalCollected > 0).length,
      totalRevenue: breakdownList.reduce((sum, record) => sum + record.totalCollected, 0),
      revenue7d: breakdownList.reduce((sum, record) => sum + record.collectedWithin7Days, 0),
      revenue30d: breakdownList.reduce((sum, record) => sum + record.collectedWithin30Days, 0),
    };

    const notes: string[] = [];
    if (unmatchedTotal > 0) {
      notes.push(`${unmatchedTotal} PPC payments could not be linked to matters (showing ${unmatchedPreview.length}).`);
    }
    if (candidateMatters.length === 0 && summary.totalEnquiries > 0) {
      notes.push('No PPC matters matched via Source or Matter Reference.');
    }

    const metrics: PpcIncomeMetrics = {
      generatedAt: new Date().toISOString(),
      summary,
      breakdown: breakdownList,
      unmatchedPayments: unmatchedPreview,
      debug: {
        unmatchedCount: unmatchedTotal,
        matchedPaymentCount,
        candidateMatterCount: candidateMatters.length,
      },
      notes,
    };

    debugLog('ReportingHome: PPC income metrics ready', {
      summary,
      sampleBreakdown: breakdownList.slice(0, 3).map((record) => ({
        matterId: record.matterId,
        displayNumber: record.displayNumber,
        totalCollected: record.totalCollected,
      })),
    });
    if (unmatchedTotal > 0) {
      debugWarn('ReportingHome: Unmatched PPC revenue entries (preview)', unmatchedPreview.slice(0, 3));
    }

    return metrics;
  }, [datasetData.enquiries, datasetData.allMatters, datasetData.recoveredFees]);
  // Feed-row preview toggles (keyed by dataset key)

  // Live metrics date range selection
  const [selectedDateRange, setSelectedDateRange] = useState<'7d' | '30d' | '3mo' | '6mo' | '12mo' | '24mo'>('7d');

  // Helper function to show selected range if data exists, otherwise show actual data range
  const getActualDataRange = useCallback((data: any[], dateField: string): string => {
    if (!Array.isArray(data) || data.length === 0) return selectedDateRange;
    
    // Manually filter data for the selected range (inline logic to avoid dependency)
    const now = new Date();
    let cutoffDate: Date;
    
    switch (selectedDateRange) {
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3mo':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6mo':
        cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '12mo':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case '24mo':
        cutoffDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const filteredData = data.filter(item => {
      const itemDate = new Date(item[dateField]);
      return !isNaN(itemDate.getTime()) && itemDate >= cutoffDate;
    });
    
    if (filteredData.length > 0) {
      return selectedDateRange; // Show selected range if data exists for it
    }
    
    // If no data for selected range, calculate actual available range
    const dates = data
      .map(item => new Date(item[dateField]))
      .filter(date => !isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length === 0) return selectedDateRange;
    
    const oldestDate = dates[0];
    const daysDiff = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 1000));
    
    if (daysDiff <= 7) return '7d';
    if (daysDiff <= 30) return '30d';
    if (daysDiff <= 90) return '3mo';
    if (daysDiff <= 180) return '6mo';
    if (daysDiff <= 365) return '12mo';
    return '24mo';
  }, [selectedDateRange]);

  // Helper function to filter data by selected date range
  const getFilteredDataByDateRange = useCallback((data: any[], dateField: string) => {
    if (!Array.isArray(data) || data.length === 0) return data;
    
    const now = new Date();
    let cutoffDate: Date;
    
    switch (selectedDateRange) {
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3mo':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6mo':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case '12mo':
        cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '24mo':
      default:
        cutoffDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        break;
    }
    
    return data.filter(item => {
      const itemDate = new Date(item[dateField]);
      return itemDate >= cutoffDate && itemDate <= now;
    });
  }, [selectedDateRange]);

  // Add debounced state updates to prevent excessive re-renders
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const pendingStatusUpdatesRef = useRef<Map<DatasetKey, { status: DatasetStatusValue; updatedAt: number | null }>>(new Map());
  const latestStreamSnapshotRef = useRef<StreamSnapshot | null>(null);

  const debouncedSetDatasetStatus = useCallback((updates: Map<DatasetKey, { status: DatasetStatusValue; updatedAt: number | null }>) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      if (updates.size > 0) {
        setDatasetStatus(prev => {
          const next: DatasetStatus = { ...prev };
          updates.forEach((update, key) => {
            next[key] = update;
          });
          return next;
        });
        updates.clear();
      }
    }, 100); // 100ms debounce
  }, []);

  // Helper: set status for a subset of datasets with debouncing
  const setStatusesFor = useCallback((keys: DatasetKey[], status: DatasetStatusValue) => {
    keys.forEach(k => {
      const prevMeta = pendingStatusUpdatesRef.current.get(k) || { status: 'idle', updatedAt: null };
      pendingStatusUpdatesRef.current.set(k, { status, updatedAt: prevMeta.updatedAt });
    });
    debouncedSetDatasetStatus(pendingStatusUpdatesRef.current);
  }, [debouncedSetDatasetStatus]);

  // Prepare list of datasets to stream (stable identity across re-renders)
  const streamableDatasets = useMemo<StreamingDatasetKey[]>(
    () => GLOBAL_STREAM_DATASETS,
    []
  );


  // Add streaming datasets hook
  const {
    datasets: streamingDatasets,
    isConnected: isStreamingConnected,
    isComplete: isStreamingComplete,
    start: startStreaming,
    stop: stopStreaming,
    progress: streamingProgress,
  } = useStreamingDatasets({
    datasets: streamableDatasets,
    entraId: propUserData?.[0]?.EntraID,
    bypassCache: false, // We'll control this via button
    autoStart: false,
    queryParams: streamingRangeParams,
  });

  const startStreamingWithMemo = useCallback((override?: StreamingOverride) => {
    const mergedOverride: StreamingOverride = {
      ...(override ?? {}),
      queryParams: {
        ...(streamingQueryParamsRef.current || {}),
        ...(override?.queryParams ?? {}),
      },
    };
    lastStreamingConfigRef.current = mergedOverride;
    startStreaming(mergedOverride);
  }, [startStreaming]);

  useEffect(() => {
    datasetStatusRef.current = datasetStatus;
  }, [datasetStatus]);

  useEffect(() => {
    streamingQueryParamsRef.current = streamingRangeParams;
  }, [streamingRangeParams]);

  useEffect(() => {
    refreshStartedAtRef.current = refreshStartedAt;
  }, [refreshStartedAt]);

  useEffect(() => {
    isStreamingConnectedRef.current = isStreamingConnected;
  }, [isStreamingConnected]);

  useEffect(() => {
    if (isStreamingConnected) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [isStreamingConnected]);

  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  // Restore in-progress streaming state on mount and auto-resume if not complete
  useEffect(() => {
    // Only run once on mount, prevent re-triggering on every render
    let hasRunOnce = false;
    
    const resumeSession = () => {
      if (hasRunOnce) return;
      hasRunOnce = true;
      
      try {
        const raw = sessionStorage.getItem(STREAM_SNAPSHOT_KEY);
        if (!raw) return;
        const snap = JSON.parse(raw);
        if (snap && snap.statuses) {
          setDatasetStatus(prev => ({
            ...prev,
            ...snap.statuses,
          }));
        }
        // Only auto-resume if the session was incomplete AND it's recent (within 10 minutes) AND not already streaming
        // Extended window gives users time to navigate back to reporting tab if browser was briefly inactive
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const hadStream: boolean = Boolean(snap?.hadStream);
        if (snap && hadStream && snap.isComplete === false && snap.ts > tenMinutesAgo && !isStreamingConnected) {
          debugLog('ReportingHome: Resuming incomplete streaming session from', new Date(snap.ts).toLocaleTimeString());
          setIsFetching(true);
          setRefreshStartedAt(Date.now());
          // Only restart streaming datasets, not non-streaming ones to prevent retriggering
          startStreamingWithMemo();
        } else if (snap && snap.isComplete === false) {
          // Clear stale incomplete session
          debugLog('ReportingHome: Clearing stale streaming session from', new Date(snap.ts).toLocaleTimeString());
          sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
        }
      } catch {/* ignore */}
    };
    
    resumeSession();
  // Empty dependency array to run only once on mount
  }, []);

  // Persist streaming status snapshot whenever it changes
  useEffect(() => {
    try {
      const statuses: Partial<DatasetStatus> = {} as Partial<DatasetStatus>;
      Object.entries(streamingDatasets).forEach(([name, state]) => {
        statuses[name as keyof DatasetStatus] = {
          status: state.status,
          updatedAt: state.updatedAt || null,
        } as any;
      });
      // Only persist a snapshot if a stream actually started or is connected
      const hadStream = (
        isStreamingConnected ||
        refreshStartedAt !== null ||
        Object.values(streamingDatasets).some(s => s.status === 'loading' || s.status === 'ready')
      );
      if (hadStream) {
        if (!isStreamingComplete) {
          const snapshot: StreamSnapshot = {
            statuses,
            isComplete: false,
            hadStream: true,
            ts: Date.now(),
          };
          sessionStorage.setItem(STREAM_SNAPSHOT_KEY, JSON.stringify(snapshot));
          latestStreamSnapshotRef.current = snapshot;
        } else {
          sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
          latestStreamSnapshotRef.current = null;
        }
      } else {
        sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
        latestStreamSnapshotRef.current = null;
      }
    } catch {/* ignore */}
  }, [streamingDatasets, isStreamingComplete, isStreamingConnected, refreshStartedAt]);

  // Cleanup streaming connection on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
      try {
        const existing = latestStreamSnapshotRef.current;
        const isActivelyRefreshing = isFetchingRef.current || isStreamingConnectedRef.current || refreshStartedAtRef.current !== null;
        
        // Only persist snapshot if we're mid-refresh or have an incomplete session
        const shouldPersist = existing 
          ? (existing.hadStream && !existing.isComplete)
          : isActivelyRefreshing;

        if (shouldPersist) {
          const currentStatuses = datasetStatusRef.current;
          const statuses: Partial<DatasetStatus> = {} as Partial<DatasetStatus>;
          if (currentStatuses) {
            Object.entries(currentStatuses).forEach(([key, meta]) => {
              statuses[key as DatasetKey] = {
                status: meta.status,
                updatedAt: meta.updatedAt ?? null,
              };
            });
          }

          const snapshotToPersist: StreamSnapshot = existing && existing.hadStream && !existing.isComplete
            ? {
                statuses: Object.keys(existing.statuses).length > 0 ? existing.statuses : statuses,
                isComplete: false,
                hadStream: true,
                ts: Date.now(),
              }
            : {
                statuses,
                isComplete: false,
                hadStream: true,
                ts: Date.now(),
              };

          sessionStorage.setItem(STREAM_SNAPSHOT_KEY, JSON.stringify(snapshotToPersist));
          latestStreamSnapshotRef.current = snapshotToPersist;
          debugLog('Persisted incomplete streaming session for resume');
        } else {
          // Only clear if we're not mid-refresh
          if (!isActivelyRefreshing) {
            sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
            latestStreamSnapshotRef.current = null;
          }
        }
      } catch {/* ignore */}
    };
  }, [stopStreaming]);

  // Optimize timer - update every 2 seconds instead of every second to reduce CPU usage
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 2000); // 2s intervals for better performance
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => clearResumeNoticeTimeout(), [clearResumeNoticeTimeout]);

  useEffect(() => {
    if (!isFetching && resumeNotice) {
      dismissResumeNotice();
    }
  }, [isFetching, resumeNotice, dismissResumeNotice]);

  // Fetch Google Ads data for enquiries range when opening PPC report
  useEffect(() => {
    if (activeView !== 'ppcReport') {
      return undefined;
    }

    let cancelled = false;
    const requestId = googleAdsRequestIdRef.current + 1;
    googleAdsRequestIdRef.current = requestId;
    const controller = new AbortController();

    setPpcLoading(true);
    setDatasetStatus(prev => ({
      ...prev,
      googleAds: { status: 'loading', updatedAt: prev.googleAds?.updatedAt ?? null },
    }));

    fetchGoogleAdsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey], controller.signal)
      .then((rows) => {
        if (cancelled || controller.signal.aborted || googleAdsRequestIdRef.current !== requestId) {
          return;
        }
        const data = rows || [];
        setPpcGoogleAdsData(data);
        const now = Date.now();
        setPpcGoogleAdsUpdatedAt(now);
        setDatasetData(prev => ({ ...prev, googleAds: data }));
        setDatasetStatus(prev => ({
          ...prev,
          googleAds: { status: 'ready', updatedAt: now },
        }));
        cachedData = { ...cachedData, googleAds: data };
        cachedTimestamp = now;
        updateRefreshTimestamp(now, setLastRefreshTimestamp);
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        console.error('ReportingHome: Failed to fetch Google Ads data for PPC report', error);
        setDatasetStatus(prev => ({
          ...prev,
          googleAds: { status: 'error', updatedAt: prev.googleAds?.updatedAt ?? null },
        }));
      })
      .finally(() => {
        if (!cancelled && googleAdsRequestIdRef.current === requestId) {
          setPpcLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeView, fetchGoogleAdsData]);

  useEffect(() => {
    const statusTs = datasetStatus.googleAds?.updatedAt;
    if (typeof statusTs === 'number' && Number.isFinite(statusTs)) {
      setPpcGoogleAdsUpdatedAt((prev) => (prev === statusTs ? prev : statusTs));
    }
  }, [datasetStatus.googleAds?.updatedAt]);

  const googleAdsLastRefreshTimestamp = useMemo(() => {
    if (typeof ppcGoogleAdsUpdatedAt === 'number' && Number.isFinite(ppcGoogleAdsUpdatedAt)) {
      const statusTs = datasetStatus.googleAds?.updatedAt;
      if (typeof statusTs === 'number' && Number.isFinite(statusTs)) {
        return Math.max(ppcGoogleAdsUpdatedAt, statusTs);
      }
      return ppcGoogleAdsUpdatedAt;
    }
    const statusTs = datasetStatus.googleAds?.updatedAt;
    return typeof statusTs === 'number' && Number.isFinite(statusTs) ? statusTs : null;
  }, [ppcGoogleAdsUpdatedAt, datasetStatus.googleAds?.updatedAt]);

  // Fetch Google Analytics data for enquiries range when opening SEO report
  useEffect(() => {
    if (activeView !== 'seoReport') {
      return undefined;
    }

    let cancelled = false;
    const requestId = googleAnalyticsRequestIdRef.current + 1;
    googleAnalyticsRequestIdRef.current = requestId;
    const controller = new AbortController();

    setDatasetStatus(prev => ({
      ...prev,
      googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
    }));

    fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey], controller.signal)
      .then((rows) => {
        if (cancelled || controller.signal.aborted || googleAnalyticsRequestIdRef.current !== requestId) {
          return;
        }
        const data = rows || [];
        setDatasetData(prev => ({ ...prev, googleAnalytics: data }));
        const now = Date.now();
        setDatasetStatus(prev => ({
          ...prev,
          googleAnalytics: { status: 'ready', updatedAt: now },
        }));
        cachedData = { ...cachedData, googleAnalytics: data };
        cachedTimestamp = now;
        updateRefreshTimestamp(now, setLastRefreshTimestamp);
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        console.error('ReportingHome: Failed to fetch Google Analytics data for SEO report', error);
        setDatasetStatus(prev => ({
          ...prev,
          googleAnalytics: { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeView, fetchGoogleAnalyticsData]);

  useEffect(() => {
  if (activeView === 'dashboard') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Management dashboard</span>
        </div>,
      );
  } else if (activeView === 'annualLeave') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Annual leave report</span>
        </div>,
      );
    } else if (activeView === 'enquiries') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Enquiries report</span>
        </div>,
      );
    } else if (activeView === 'matters') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Matters report</span>
        </div>,
      );
    } else if (activeView === 'seoReport') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>SEO report</span>
        </div>,
      );
    } else if (activeView === 'ppcReport') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>PPC report</span>
        </div>,
      );
    } else if (activeView === 'metaMetrics') {
      setContent(
        <div style={dashboardNavigatorStyle(isDarkMode)}>
          <DefaultButton
            text="Back to overview"
            iconProps={{ iconName: 'Back' }}
            onClick={handleBackToOverview}
            styles={dashboardNavigatorButtonStyles(isDarkMode)}
          />
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Meta ads report</span>
        </div>,
      );
    } else {
      setContent(null);
    }

    return () => {
      setContent(null);
    };
  }, [activeView, handleBackToOverview, isDarkMode, setContent]);

  const fetchAnnualLeaveDataset = useCallback(async (forceRefresh: boolean): Promise<AnnualLeaveFetchResult> => {
    const endpoint = forceRefresh ? '/api/attendance/getAnnualLeave?forceRefresh=true' : '/api/attendance/getAnnualLeave';
    const initials = extractUserInitials(propUserData);

    let response: Response;
    try {
      response = await fetchWithRetry(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initials ? { userInitials: initials } : {}),
        timeout: 45000, // 45 second timeout (annual leave is a heavier query)
        retries: 2, // Retry up to 2 times on transient failures
        retryDelay: 2000, // Start with 2s delay, then exponential backoff
      });
    } catch (networkError) {
      throw new Error(networkError instanceof Error ? networkError.message : 'Network error while fetching annual leave data');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Annual leave fetch failed: ${response.status} ${response.statusText}${text ? ` – ${text.slice(0, 160)}` : ''}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (parseError) {
      throw new Error('Failed to parse annual leave response');
    }

    if (!isRecord(payload)) {
      return { records: [], current: [], future: [], team: [], userDetails: undefined };
    }

    const userDetails = isRecord(payload.user_details) ? payload.user_details : undefined;
    const successFlag = typeof payload.success === 'boolean' ? payload.success : true;

    if (!successFlag) {
      return { records: [], current: [], future: [], team: [], userDetails };
    }

    return {
      records: mapAnnualLeaveRecords(payload.all_data),
      current: mapAnnualLeaveRecords(payload.annual_leave),
      future: mapAnnualLeaveRecords(payload.future_leave),
      team: mapTeamDataFromPayload(payload.team),
      userDetails,
    };
  }, [propUserData]);

  // Marketing metrics fetching function
  const fetchMetaMetrics = useCallback(async (daysBack: number = DEFAULT_META_DAYS): Promise<MarketingMetrics[]> => {
    debugLog('ReportingHome: fetchMetaMetrics called');
    
    try {
      const safeDays = Math.max(Math.floor(daysBack), 7);
      // Use our Express server route for live Facebook data with daily breakdown
      const url = `/api/marketing-metrics?daysBack=${safeDays}`; // Request limited history to match UI window
      debugLog('ReportingHome: Fetching meta metrics from:', url);
      
      const response = await fetchWithRetry(url, {
        timeout: 30000,
        retries: 2,
        retryDelay: 1000,
      });
      
      if (!response.ok) {
        throw new Error(`Meta metrics fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        debugWarn('ReportingHome: Meta metrics API returned error:', result.error);
        return [];
      }
      
      // The API now returns an array of daily metrics
      const dailyMetrics = result.data;
      
      if (!Array.isArray(dailyMetrics)) {
        debugWarn('ReportingHome: Expected array of daily metrics, got:', typeof dailyMetrics);
        return [];
      }
      
      debugLog('ReportingHome: Meta metrics fetched successfully. Days included:', dailyMetrics.length);
      debugLog('ReportingHome: Date range:', result.dataSource, result.dateRange);
      
      return dailyMetrics; // Return the array directly as it's already in the correct format
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugWarn('ReportingHome: Meta metrics request timed out after 30 seconds');
        return [];
      }
      console.error('ReportingHome: Meta metrics fetch error:', error);
      debugWarn('ReportingHome: Failed to fetch meta metrics:', error);
      // Return empty array on error to prevent blocking the dashboard
      return [];
    }
  }, []);

  // Enhanced refresh function with streaming support and better throttling
  const performStreamingRefresh = useCallback(async (forceRefresh: boolean, options?: RefreshOptions) => {
    if (demoModeEnabled) {
      showToast({
        message: 'Demo mode: reporting refresh disabled. Using cached/sample data.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    // Prevent triggering if already actively loading
    if (isFetching && (isStreamingConnected || refreshStartedAt !== null)) {
      debugLog('Refresh already in progress, skipping');
      return;
    }

    const { rangeOverrides, scope = 'all', streamTargets, statusTargets } = options ?? {};
    const streamingTargets = streamTargets ?? streamableDatasets;
    const statusKeys = statusTargets ?? MANAGEMENT_DATASET_KEYS;
    const effectiveEnquiriesKey = rangeOverrides?.enquiriesRangeKey ?? enquiriesRangeKey;
    const effectiveMattersKey = rangeOverrides?.mattersRangeKey ?? mattersWipRangeKey;
    const effectiveEnquiriesRange = computeRangeWindowByKey(effectiveEnquiriesKey);
    const effectiveMattersRange = computeMattersRangeWindow(effectiveMattersKey);
    const effectiveMetaDaysBack = computeMetaDaysBackForRange(effectiveEnquiriesKey);
    const streamingRangeOverride = {
      ...buildMattersRangeParams(effectiveMattersRange),
      ...buildEnquiriesRangeParams(effectiveEnquiriesRange),
      ...buildMetaRangeParams(effectiveEnquiriesKey),
    };

    debugLog('ReportingHome: refreshDatasetsWithStreaming called', {
      forceRefresh,
      overrides: rangeOverrides,
    });
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());

    // Initialize all dataset statuses to loading
    setDatasetStatus((prev) => {
      const next: DatasetStatus = { ...prev };
      statusKeys.forEach((key) => {
        const previousMeta = prev[key];
        next[key] = { status: 'loading', updatedAt: previousMeta?.updatedAt ?? null };
      });
      return next;
    });

    try {
      debugLog('🌊 Starting streaming with datasets:', streamingTargets);
      debugLog('🌊 EntraID for streaming:', propUserData?.[0]?.EntraID);
      startStreamingWithMemo({
        datasets: streamingTargets,
        ...(forceRefresh ? { bypassCache: true } : {}),
        queryParams: streamingRangeOverride,
      });

      const nowTs = Date.now();
      const thirtyMinutes = 30 * 60 * 1000; // Extended intervals for auxiliary data
      const lastAL = datasetStatus.annualLeave?.updatedAt ?? 0;
      const lastMeta = datasetStatus.metaMetrics?.updatedAt ?? 0;
      const lastGA = datasetStatus.googleAnalytics?.updatedAt ?? 0;
      const lastGAds = datasetStatus.googleAds?.updatedAt ?? 0;

      const shouldFetchAnnualLeave = forceRefresh || !cachedData.annualLeave || (nowTs - lastAL) > thirtyMinutes;
      const includeMarketingFeeds = scope === 'all';
      const shouldFetchMeta = includeMarketingFeeds && (forceRefresh || !cachedData.metaMetrics || (nowTs - lastMeta) > thirtyMinutes);
      const shouldFetchGA = includeMarketingFeeds && (forceRefresh || !cachedData.googleAnalytics || (nowTs - lastGA) > thirtyMinutes);
      const shouldFetchGAds = includeMarketingFeeds && (forceRefresh || !cachedData.googleAds || (nowTs - lastGAds) > thirtyMinutes);

      let annualLeaveData: AnnualLeaveRecord[] = cachedData.annualLeave || [];
      let metaMetricsData: MarketingMetrics[] = cachedData.metaMetrics || [];
      let googleAnalyticsData: GoogleAnalyticsData[] = cachedData.googleAnalytics || [];
      let googleAdsData: GoogleAdsData[] = cachedData.googleAds || [];
      let refreshedTeamData: TeamData[] | undefined;

      if (shouldFetchAnnualLeave || shouldFetchMeta || shouldFetchGA || shouldFetchGAds) {
        setDatasetStatus(prev => ({
          ...prev,
          ...(shouldFetchGA && { googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null } }),
          ...(shouldFetchGAds && { googleAds: { status: 'loading', updatedAt: prev.googleAds?.updatedAt ?? null } }),
        }));

        const [annualLeaveResult, metaMetrics, gaData, gAdsData] = await Promise.all([
          shouldFetchAnnualLeave ? fetchAnnualLeaveDataset(forceRefresh) : Promise.resolve<AnnualLeaveFetchResult | null>(null),
          shouldFetchMeta ? fetchMetaMetrics(effectiveMetaDaysBack) : Promise.resolve(metaMetricsData),
          shouldFetchGA ? fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]) : Promise.resolve(googleAnalyticsData),
          shouldFetchGAds ? fetchGoogleAdsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]) : Promise.resolve(googleAdsData),
        ]);

        if (shouldFetchAnnualLeave && annualLeaveResult) {
          annualLeaveData = annualLeaveResult.records;
          if (annualLeaveResult.team.length > 0) {
            refreshedTeamData = annualLeaveResult.team;
          }
        }

        if (shouldFetchMeta) {
          metaMetricsData = Array.isArray(metaMetrics) ? metaMetrics : [];
        }

        if (shouldFetchGA) {
          googleAnalyticsData = Array.isArray(gaData) ? gaData : [];
        }

        if (shouldFetchGAds) {
          googleAdsData = Array.isArray(gAdsData) ? gAdsData : [];
        }
      }

      setDatasetData(prev => ({
        ...prev,
        annualLeave: annualLeaveData,
        ...(includeMarketingFeeds && {
          metaMetrics: metaMetricsData,
          googleAnalytics: googleAnalyticsData,
          googleAds: googleAdsData,
        }),
        ...(refreshedTeamData && refreshedTeamData.length > 0 && (!prev.teamData || prev.teamData.length === 0)
          ? { teamData: refreshedTeamData }
          : {}),
      }));

      setDatasetStatus(prev => ({
        ...prev,
        annualLeave: { status: 'ready', updatedAt: shouldFetchAnnualLeave ? nowTs : (prev.annualLeave?.updatedAt ?? nowTs) },
        ...(includeMarketingFeeds && {
          metaMetrics: { status: 'ready', updatedAt: shouldFetchMeta ? nowTs : (prev.metaMetrics?.updatedAt ?? nowTs) },
          googleAnalytics: { status: 'ready', updatedAt: shouldFetchGA ? nowTs : (prev.googleAnalytics?.updatedAt ?? nowTs) },
          googleAds: { status: 'ready', updatedAt: shouldFetchGAds ? nowTs : (prev.googleAds?.updatedAt ?? nowTs) },
        }),
      }));

      cachedData = {
        ...cachedData,
        annualLeave: annualLeaveData,
        ...(includeMarketingFeeds && {
          metaMetrics: metaMetricsData,
          googleAnalytics: googleAnalyticsData,
          googleAds: googleAdsData,
        }),
        ...(refreshedTeamData && refreshedTeamData.length > 0 ? { teamData: refreshedTeamData } : {}),
      };
      cachedTimestamp = nowTs;
      updateRefreshTimestamp(nowTs, setLastRefreshTimestamp);

    } catch (fetchError) {
      debugWarn('Failed to refresh non-streaming datasets:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
      showToast({
        message: `Failed to refresh reporting data: ${fetchError instanceof Error ? fetchError.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    }
    // Note: Don't set isFetching(false) here - let the streaming completion handler do it
  }, [
    startStreamingWithMemo,
    fetchAnnualLeaveDataset,
    fetchMetaMetrics,
    streamableDatasets,
    fetchGoogleAnalyticsData,
    fetchGoogleAdsData,
    isFetching,
    isStreamingConnected,
    refreshStartedAt,
    enquiriesRangeKey,
    mattersWipRangeKey,
    datasetStatus,
    propUserData,
    showToast,
    demoModeEnabled,
  ]);

  // Enhanced throttling to prevent excessive refresh triggers
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);
  
  const refreshDatasetsWithStreaming = useCallback(async () => {
    if (demoModeEnabled) {
      showToast({
        message: 'Demo mode: reporting refresh disabled. Open reports without hitting live data.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;
    const timeSinceGlobalRefresh = now - globalLastRefresh;
    const minRefreshInterval = 30000; // 30 seconds minimum between refreshes
    
    // Check global cooldown first
    if (timeSinceGlobalRefresh < GLOBAL_REFRESH_COOLDOWN) {
      debugLog(`Global refresh cooldown active: ${Math.round(timeSinceGlobalRefresh / 1000)}s since last global refresh`);
      showToast({
        message: `Please wait ${Math.round((GLOBAL_REFRESH_COOLDOWN - timeSinceGlobalRefresh) / 1000)}s before refreshing again`,
        type: 'info'
      });
      return;
    }
    
    // Prevent multiple refresh requests within the minimum interval
    if (timeSinceLastRefresh < minRefreshInterval) {
      debugLog(`Refresh throttled: only ${Math.round(timeSinceLastRefresh / 1000)}s since last refresh (min: 30s)`);
      showToast({
        message: `Please wait ${Math.round((minRefreshInterval - timeSinceLastRefresh) / 1000)}s before refreshing again`,
        type: 'info'
      });
      return;
    }
    
    // Clear any pending debounce
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
    }
    
    // Set debounce to prevent rapid successive calls
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
    }, 5000); // 5 second debounce window
    
    // Show immediate feedback
    showToast({
      message: 'Starting data refresh...',
      type: 'info'
    });
    
    lastRefreshRef.current = now;
    globalLastRefresh = now; // Update global refresh timestamp
    // Use cached server data by default for speed; full fresh is available via the global Refresh Data modal
    return performStreamingRefresh(false);
  }, [performStreamingRefresh, showToast, demoModeEnabled]);

  // Scoped refreshers for specific reports with enhanced throttling
  const refreshAnnualLeaveOnly = useCallback(async () => {
    if (demoModeEnabled) {
      showToast({
        message: 'Demo mode: annual leave refresh skipped. Live attendance endpoints stay idle.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    // Prevent retriggering if already loading or recently completed
    if (isFetching || (datasetStatus.annualLeave?.status === 'loading')) {
      showToast({
        message: 'Annual leave refresh already running. Please wait for the current update to finish.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    
    const lastUpdate = datasetStatus.annualLeave?.updatedAt;
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000); // Extended to 15 minutes
    if (lastUpdate && lastUpdate > fifteenMinutesAgo) {
      debugLog('Annual leave data is recent, skipping refresh');
      showToast({
        message: 'Annual leave already up to date. Try again later if you need a fresh pull.',
        type: 'info',
        duration: 4000,
      });
      return;
    }

    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    setStatusesFor(['annualLeave'], 'loading');
    try {
      const result = await fetchAnnualLeaveDataset(true);
      const annualLeaveData = result.records;
      setDatasetData(prev => ({
        ...prev,
        annualLeave: annualLeaveData,
        ...(result.team.length > 0 && (!prev.teamData || prev.teamData.length === 0)
          ? { teamData: result.team }
          : {}),
      }));
      const now = Date.now();
      setDatasetStatus(prev => ({ ...prev, annualLeave: { status: 'ready', updatedAt: now } }));
      cachedData = {
        ...cachedData,
        annualLeave: annualLeaveData,
        ...(result.team.length > 0 ? { teamData: result.team } : {}),
      };
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: `Annual leave updated - loaded ${annualLeaveData.length} records`,
        type: 'success',
        duration: 5000,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh annual leave');
      setStatusesFor(['annualLeave'], 'error');
      showToast({
        message: `Annual leave refresh failed: ${e instanceof Error ? e.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchAnnualLeaveDataset, setStatusesFor, isFetching, datasetStatus.annualLeave, showToast, demoModeEnabled]);

  const refreshMetaMetricsOnly = useCallback(async () => {
    if (demoModeEnabled) {
      showToast({
        message: 'Demo mode: Meta metrics refresh skipped. Marketing API calls are disabled.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    // Prevent retriggering if already loading or recently completed
    if (isFetching || (datasetStatus.metaMetrics?.status === 'loading')) {
      showToast({
        message: 'Meta metrics refresh already running. Hang tight while we finish the current update.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    
    const lastUpdate = datasetStatus.metaMetrics?.updatedAt;
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000); // Extended to 15 minutes
    if (lastUpdate && lastUpdate > fifteenMinutesAgo) {
      debugLog('Meta metrics data is recent, skipping refresh');
      showToast({
        message: 'Meta metrics already fresh. Try again later for another update.',
        type: 'info',
        duration: 4000,
      });
      return;
    }

    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    setStatusesFor(['metaMetrics'], 'loading');
    try {
      const metrics = await fetchMetaMetrics(metaDaysBack);
      setDatasetData(prev => ({ ...prev, metaMetrics: metrics }));
      const now = Date.now();
      setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'ready', updatedAt: now } }));
      cachedData = { ...cachedData, metaMetrics: metrics };
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: `Meta metrics updated - loaded ${metrics.length} days of performance data`,
        type: 'success',
        duration: 5000,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh Meta metrics');
      setStatusesFor(['metaMetrics'], 'error');
      showToast({
        message: `Meta metrics refresh failed: ${e instanceof Error ? e.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchMetaMetrics, setStatusesFor, isFetching, datasetStatus.metaMetrics, showToast, metaDaysBack, demoModeEnabled]);

  const refreshGoogleAnalyticsOnly = useCallback(async () => {
    if (demoModeEnabled) {
      showToast({
        message: 'Demo mode: SEO analytics refresh skipped. GA4 pulls are disabled.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    if (datasetStatus.googleAnalytics?.status === 'loading') {
      showToast({
        message: 'SEO analytics refresh already running. We are still pulling the latest GA4 data.',
        type: 'info',
        duration: 4000,
      });
      return;
    }

    const requestId = googleAnalyticsRequestIdRef.current + 1;
    googleAnalyticsRequestIdRef.current = requestId;

    setDatasetStatus(prev => ({
      ...prev,
      googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
    }));

    try {
      const rows = await fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey]);
      if (googleAnalyticsRequestIdRef.current !== requestId) {
        return;
      }
      const data = rows || [];
      setDatasetData(prev => ({ ...prev, googleAnalytics: data }));
      const now = Date.now();
      setDatasetStatus(prev => ({
        ...prev,
        googleAnalytics: { status: 'ready', updatedAt: now },
      }));
      cachedData = { ...cachedData, googleAnalytics: data };
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: `SEO analytics updated - loaded ${data.length} GA4 rows`,
        type: 'success',
        duration: 5000,
      });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        // Request was aborted, no notification needed
        return;
      }
      console.error('ReportingHome: Failed to refresh Google Analytics data', error);
      setDatasetStatus(prev => ({
        ...prev,
        googleAnalytics: { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
      }));
      setError(error instanceof Error ? error.message : 'Failed to refresh Google Analytics data');
      showToast({
        message: `SEO analytics refresh failed: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    }
  }, [datasetStatus.googleAnalytics?.status, fetchGoogleAnalyticsData, showToast, demoModeEnabled]);

  const refreshGoogleAdsOnly = useCallback(async () => {
    if (datasetStatus.googleAds?.status === 'loading') {
      showToast({
        message: 'PPC refresh already running. Latest Google Ads data is on the way.',
        type: 'info',
        duration: 4000,
      });
      return;
    }

    const requestId = googleAdsRequestIdRef.current + 1;
    googleAdsRequestIdRef.current = requestId;
    const shouldToggleLoading = activeView === 'ppcReport';

    if (shouldToggleLoading) {
      setPpcLoading(true);
    }

    setDatasetStatus(prev => ({
      ...prev,
      googleAds: { status: 'loading', updatedAt: prev.googleAds?.updatedAt ?? null },
    }));

    try {
      const rows = await fetchGoogleAdsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey]);
      if (googleAdsRequestIdRef.current !== requestId) {
        return;
      }
      const data = rows || [];
      setDatasetData(prev => ({ ...prev, googleAds: data }));
      setPpcGoogleAdsData(data);
      const now = Date.now();
      setDatasetStatus(prev => ({
        ...prev,
        googleAds: { status: 'ready', updatedAt: now },
      }));
      cachedData = { ...cachedData, googleAds: data };
      cachedTimestamp = now;
      setPpcGoogleAdsUpdatedAt(now);
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: `PPC data updated - loaded ${data.length} Google Ads rows`,
        type: 'success',
        duration: 5000,
      });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        // Request was aborted, no notification needed
        return;
      }
      console.error('ReportingHome: Failed to refresh Google Ads data', error);
      setDatasetStatus(prev => ({
        ...prev,
        googleAds: { status: 'error', updatedAt: prev.googleAds?.updatedAt ?? null },
      }));
      setError(error instanceof Error ? error.message : 'Failed to refresh Google Ads data');
      showToast({
        message: `PPC refresh failed: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    } finally {
      if (shouldToggleLoading && googleAdsRequestIdRef.current === requestId) {
        setPpcLoading(false);
      }
    }
  }, [activeView, datasetStatus.googleAds?.status, fetchGoogleAdsData, showToast]);

  const refreshEnquiriesScoped = useCallback(async () => {
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    // Only the datasets this report needs
    const needed: DatasetKey[] = [...ENQUIRIES_RANGE_DATASETS, 'teamData'];
    setStatusesFor(needed, 'loading');
    
    const errors: string[] = [];
    let hasCriticalFailure = false;
    
    try {
      // Start streaming just the needed datasets
      startStreamingWithMemo({
        datasets: needed,
        bypassCache: true,
        queryParams: {
          ...enquiriesRangeParams,
          ...metaRangeParams,
        },
      });
      
      // Refresh auxiliary non-streaming data in parallel with individual error handling
      const now = Date.now();
      
      // Try to fetch annual leave - non-blocking
      try {
        const annualLeaveResult = await fetchAnnualLeaveDataset(true);
        const annualLeave = annualLeaveResult.records;
        setDatasetData(prev => ({
          ...prev,
          annualLeave,
          ...(annualLeaveResult.team.length > 0 && (!prev.teamData || prev.teamData.length === 0)
            ? { teamData: annualLeaveResult.team }
            : {}),
        }));
        setDatasetStatus(prev => ({ ...prev, annualLeave: { status: 'ready', updatedAt: now } }));
        cachedData = {
          ...cachedData,
          annualLeave,
          ...(annualLeaveResult.team.length > 0 ? { teamData: annualLeaveResult.team } : {}),
        };
      } catch (annualLeaveError) {
        errors.push('Annual leave');
        console.error('Annual leave fetch failed (non-blocking):', annualLeaveError);
        setDatasetStatus(prev => ({ ...prev, annualLeave: { status: 'error', updatedAt: now } }));
      }
      
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      
      // Show partial error if some datasets failed
      if (errors.length > 0) {
        setError(`Some optional datasets failed: ${errors.join(', ')} (core data loaded)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh datasets');
      setStatusesFor(needed, 'error');
      hasCriticalFailure = true;
      showToast({
        message: `Enquiries refresh failed: ${e instanceof Error ? e.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
      if (!hasCriticalFailure) {
        if (errors.length > 0) {
          showToast({
            message: `Enquiries refreshed with warnings. Optional datasets failed: ${errors.join(', ')}`,
            type: 'warning',
            duration: 7000,
          });
        } else {
          showToast({
            message: 'Enquiries refresh triggered. New enquiries will appear as soon as streaming completes.',
            type: 'success',
            duration: 5000,
          });
        }
      }
    }
  }, [fetchAnnualLeaveDataset, enquiriesRangeParams, metaRangeParams, setStatusesFor, showToast, startStreamingWithMemo]);

  const refreshMattersScoped = useCallback(async () => {
    setHasFetchedOnce(true);
    setCacheState(true);
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());

    const datasetsToRefresh: DatasetKey[] = MATTERS_REPORT_REFRESH_DATASETS;
    setStatusesFor(datasetsToRefresh, 'loading');

    try {
      startStreamingWithMemo({ datasets: datasetsToRefresh, bypassCache: true });
      const now = Date.now();
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: 'Matters refresh triggered. Matters, WIP, recovered fees, pitches, and instructions will update as streaming completes.',
        type: 'success',
        duration: 5000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh matters datasets';
      setError(message);
      setStatusesFor(datasetsToRefresh, 'error');
      showToast({
        message: `Matters refresh failed: ${message}`,
        type: 'error',
        duration: 7000,
      });
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [setStatusesFor, showToast, startStreamingWithMemo]);

  // Sync streaming dataset updates with local state
  useEffect(() => {
    let sawActivity = false;
    Object.entries(streamingDatasets).forEach(([datasetName, datasetState]) => {
      if (datasetState.status !== 'idle') {
        sawActivity = true;
      }
      if (datasetState.status === 'ready' && datasetState.data) {
        // Update dataset data (special-case WIP to always include current-week merge)
        if (datasetName === 'wip') {
          const baseWip = Array.isArray(datasetState.data) ? (datasetState.data as WIP[]) : [];
          const clioState = streamingDatasets['wipClioCurrentWeek'];
          const dbCurrentState = streamingDatasets['wipDbCurrentWeek'];
          const clioActivities: WIP[] | undefined = clioState && clioState.status === 'ready'
            ? (clioState.data?.current_week?.activities as WIP[] | undefined)
            : undefined;
          const dbCurrentActivities: WIP[] | undefined = dbCurrentState && dbCurrentState.status === 'ready'
            ? (dbCurrentState.data as WIP[] | undefined)
            : undefined;
          const activitiesToMerge = (clioActivities && clioActivities.length > 0)
            ? clioActivities
            : (dbCurrentActivities && dbCurrentActivities.length > 0 ? dbCurrentActivities : []);

          if (activitiesToMerge.length > 0) {
            const seen = new Set<string>(
              baseWip.map(e => (
                (e as any).id != null
                  ? `id:${(e as any).id}`
                  : `t:${e.created_at}|d:${e.date}|u:${e.user_id ?? (e.user as any)?.id ?? ''}|h:${e.quantity_in_hours ?? ''}|v:${e.total ?? ''}`
              ))
            );
            const merged = baseWip.slice();
            for (const a of activitiesToMerge) {
              if (!a.date && a.created_at && typeof a.created_at === 'string') {
                const m = a.created_at.match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) {
                  (a as any).date = m[1];
                }
              }
              const key = (a as any).id != null
                ? `id:${(a as any).id}`
                : `t:${a.created_at}|d:${a.date}|u:${a.user_id ?? (a.user as any)?.id ?? ''}|h:${a.quantity_in_hours ?? ''}|v:${a.total ?? ''}`;
              if (!seen.has(key)) {
                merged.push(a);
                seen.add(key);
              }
            }
            setDatasetData(prev => ({
              ...prev,
              wip: merged,
            }));
          } else {
            setDatasetData(prev => ({
              ...prev,
              wip: baseWip,
            }));
          }
        } else {
          // Debug: log when recoveredFees is received
          if (datasetName === 'recoveredFees') {
            const feesData = Array.isArray(datasetState.data) ? datasetState.data : [];
            const latestDates = feesData.slice(0, 10).map((f: any) => f.payment_date);
            console.log('💰 recoveredFees received:', {
              count: feesData.length,
              latestPaymentDates: latestDates,
            });
          }
          setDatasetData(prev => ({
            ...prev,
            [datasetName]: datasetState.data,
          }));
        }

        // Update dataset status
        setDatasetStatus(prev => ({
          ...prev,
          [datasetName]: {
            status: 'ready',
            updatedAt: datasetState.updatedAt || Date.now(),
          },
        }));

        // Update cache
        cachedData = { ...cachedData, [datasetName]: datasetState.data };
        if (datasetState.updatedAt) {
          cachedTimestamp = datasetState.updatedAt;
          setLastRefreshTimestamp(datasetState.updatedAt);
        }
      } else if (datasetState.status === 'error') {
        // Update error status
        setDatasetStatus(prev => ({
          ...prev,
          [datasetName]: {
            status: 'error',
            updatedAt: datasetState.updatedAt || Date.now(),
          },
        }));
      }
    });

    if (sawActivity) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [streamingDatasets]);

  // Merge current-week WIP from streaming into historical WIP when streaming is used
  useEffect(() => {
    const wipState = streamingDatasets['wip'];
    const clioState = streamingDatasets['wipClioCurrentWeek'];
    const dbCurrentState = streamingDatasets['wipDbCurrentWeek'];

    // Debug: Always log what we have
    console.log('📊 WIP Merge Check:', {
      wipStatus: wipState?.status,
      wipCount: Array.isArray(wipState?.data) ? wipState?.data.length : 0,
      clioStatus: clioState?.status,
      clioActivities: clioState?.data?.current_week?.activities?.length ?? 0,
      clioDataShape: clioState?.data ? Object.keys(clioState.data) : 'no data',
      dbCurrentStatus: dbCurrentState?.status,
      dbCurrentCount: Array.isArray(dbCurrentState?.data) ? dbCurrentState?.data.length : 0,
    });

    const hasWip = wipState && wipState.status === 'ready' && Array.isArray(wipState.data);
    const clioActivities: WIP[] | undefined = clioState && clioState.status === 'ready'
      ? (clioState.data?.current_week?.activities as WIP[] | undefined)
      : undefined;
    const dbCurrentActivities: WIP[] | undefined = dbCurrentState && dbCurrentState.status === 'ready'
      ? (dbCurrentState.data as WIP[] | undefined)
      : undefined;

    // If Clio returns nothing, fallback to DB current-week activities
    const activitiesToMerge = (clioActivities && clioActivities.length > 0)
      ? clioActivities
      : (dbCurrentActivities && dbCurrentActivities.length > 0 ? dbCurrentActivities : undefined);

    if (!activitiesToMerge || activitiesToMerge.length === 0) {
      console.log('📊 WIP Merge: No activities to merge (clio:', clioActivities?.length ?? 0, 'db:', dbCurrentActivities?.length ?? 0, ')');
      return;
    }

    setDatasetData(prev => {
      const baseWip: WIP[] = hasWip ? (wipState!.data as WIP[]) : (prev.wip || []);
      // Dedupe by id if available, otherwise by a composite key
      const seen = new Set<string>(
        baseWip.map(e => (
          (e as any).id != null
            ? `id:${(e as any).id}`
            : `t:${e.created_at}|d:${e.date}|u:${e.user_id ?? (e.user as any)?.id ?? ''}|h:${e.quantity_in_hours ?? ''}|v:${e.total ?? ''}`
        ))
      );
      const merged = baseWip.slice();
      for (const a of activitiesToMerge) {
        // Ensure a.date is present (YYYY-MM-DD) for reliable filtering
        if (!a.date && a.created_at && typeof a.created_at === 'string') {
          const m = a.created_at.match(/^(\d{4}-\d{2}-\d{2})/);
          if (m) {
            (a as any).date = m[1];
          }
        }
        const key = (a as any).id != null
          ? `id:${(a as any).id}`
          : `t:${a.created_at}|d:${a.date}|u:${a.user_id ?? (a.user as any)?.id ?? ''}|h:${a.quantity_in_hours ?? ''}|v:${a.total ?? ''}`;
        if (!seen.has(key)) {
          merged.push(a);
          seen.add(key);
        }
      }
      if ((prev.wip?.length || 0) === merged.length) {
        return prev; // no change
      }
      // eslint-disable-next-line no-console
      debugLog('🔗 Merged current-week activities into WIP (streaming):', {
        base: baseWip.length,
        added: merged.length - baseWip.length,
        total: merged.length,
      });
      return { ...prev, wip: merged };
    });
  }, [streamingDatasets.wip, streamingDatasets.wipClioCurrentWeek, streamingDatasets.wipDbCurrentWeek]);

  // Handle streaming completion
  useEffect(() => {
    if (!isStreamingComplete) {
      return;
    }

    const startedAt = refreshStartedAtRef.current;
    const hadActiveRefresh = isFetchingRef.current || startedAt !== null;
    
    debugLog('ReportingHome: Streaming completion handler triggered', {
      isStreamingComplete,
      hadActiveRefresh,
      isFetchingRef: isFetchingRef.current,
      refreshStartedAtRef: startedAt,
    });
    
    if (!hadActiveRefresh) {
      // Edge case: streaming completed but no active refresh was tracked
      // This can happen if the refs weren't updated properly, so force-clear the state anyway
      debugWarn('ReportingHome: Streaming completed but no active refresh was tracked. Force-clearing state.');
      setIsFetching(false);
      setRefreshStartedAt(null);
      return;
    }

    // Clear refresh state immediately when streaming completes
    setIsFetching(false);
    setRefreshStartedAt(null);
    
    debugLog('ReportingHome: Streaming completed, clearing fetch state');

    const duration = startedAt ? Date.now() - startedAt : 0;
    showToast({
      message: duration > 0 ? `Reporting data refreshed. Completed in ${formatElapsedTime(duration)}` : 'Reporting data refreshed',
      type: 'success',
      duration: 5000,
    });
  }, [isStreamingComplete, isStreamingConnected, showToast]);

  // Safety timeout: if streaming takes longer than 10 minutes, forcefully clear the loading state
  // This prevents the UI from getting stuck in a loading state if something goes wrong
  useEffect(() => {
    if (!isFetching || !refreshStartedAt) {
      return;
    }

    const timeout = setTimeout(() => {
      const elapsed = Date.now() - refreshStartedAt;
      const maxWait = 10 * 60 * 1000; // 10 minutes
      
      if (elapsed > maxWait) {
        debugWarn('ReportingHome: Refresh timeout exceeded (10 minutes). Forcing clear of loading state.');
        setIsFetching(false);
        setRefreshStartedAt(null);
        showToast({
          message: 'Refresh timed out. The refresh took longer than expected. Try again if data is not complete.',
          type: 'warning',
          duration: 7000,
        });
      }
    }, 60000); // Check every minute

    return () => clearTimeout(timeout);
  }, [isFetching, refreshStartedAt, showToast]);

  // Attempt to resume streaming when the tab becomes visible again
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!isFetching || isStreamingConnected) {
        return;
      }
      const now = Date.now();
      if (now - lastAutoResumeRef.current < 5000) {
        return;
      }
      lastAutoResumeRef.current = now;
      debugWarn('ReportingHome: Tab became visible while refresh stuck, auto-resuming stream');
      const override = lastStreamingConfigRef.current;
      startStreamingWithMemo(override);
      showResumeNotice('We resumed the refresh after reconnecting to the data feeds. You can keep working while it finalises.');
      showToast({
        message: 'Refresh resumed. We picked up the in-progress refresh after you returned.',
        type: 'info',
        duration: 4500,
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isFetching, isStreamingConnected, startStreamingWithMemo, showResumeNotice, showToast]);

  // Watch for stalled streaming progress and auto-restart if needed
  useEffect(() => {
    if (!isFetching) {
      return undefined;
    }

    const monitor = setInterval(() => {
      if (isStreamingConnected) {
        return;
      }
      const elapsed = Date.now() - lastStreamActivityRef.current;
      const stallThresholdMs = 20000; // 20 seconds without activity triggers a restart
      if (elapsed < stallThresholdMs) {
        return;
      }
      const now = Date.now();
      if (now - lastAutoResumeRef.current < 10000) {
        return;
      }
      lastAutoResumeRef.current = now;
      debugWarn('ReportingHome: Streaming stalled, attempting automatic restart', { elapsedMs: elapsed });
      const override = lastStreamingConfigRef.current;
      startStreamingWithMemo(override);
    }, 5000);

    return () => clearInterval(monitor);
  }, [isFetching, isStreamingConnected, startStreamingWithMemo]);

  const refreshDatasets = useCallback(async () => {
    debugLog('ReportingHome: refreshDatasets called (delegating to streaming)');
    await performStreamingRefresh(true);
  }, [performStreamingRefresh]);

  // Predictive cache loading - preload commonly needed datasets when Reports tab is accessed
  const preloadReportingCache = useCallback(async () => {
    const cacheState = getCacheState();
    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000);

    const needsFreshData =
      !hasFetchedOnce ||
      !cacheState.lastCacheTime ||
      cacheState.lastCacheTime < thirtyMinutesAgo;

    if (!needsFreshData) {
      const cacheAgeSeconds = cacheState.lastCacheTime ? Math.round((now - cacheState.lastCacheTime) / 1000) : 0;
      debugLog(`✅ Using cached data (${cacheAgeSeconds}s old, <30min) - instant load`);
      return;
    }

    if (preheatInFlightRef.current) {
      debugLog('🔄 Cache preheat already running, skipping duplicate preheat request');
      return;
    }

    const lastPreheatTs = getLastPreheatTimestamp();
    if (lastPreheatTs && (now - lastPreheatTs) < CACHE_PREHEAT_INTERVAL) {
      const elapsedSeconds = Math.round((now - lastPreheatTs) / 1000);
      const remainingSeconds = Math.max(0, Math.round((CACHE_PREHEAT_INTERVAL - (now - lastPreheatTs)) / 1000));
      debugLog(`⏳ Cache preheated ${elapsedSeconds}s ago, skipping background load (retry in ${remainingSeconds}s)`);
      return;
    }

    const commonDatasets = ['teamData', 'userData', 'enquiries', 'allMatters'];
    const cacheAgeSeconds = cacheState.lastCacheTime ? Math.round((now - cacheState.lastCacheTime) / 1000) : null;
    debugLog(`🔄 Cache refresh needed: ${!hasFetchedOnce ? 'first load' : `cache age: ${cacheAgeSeconds}s (>30min)`}`);
    debugLog('ReportingHome: Preloading common reporting datasets on tab access:', commonDatasets);

    preheatInFlightRef.current = true;
    try {
      await fetch('/api/cache-preheater/preheat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasets: commonDatasets,
          entraId: propUserData?.[0]?.EntraID,
        }),
      });
      setLastPreheatTimestamp(now);
      debugLog('ReportingHome: Cache preheating completed successfully');
    } catch (error) {
      debugWarn('Cache preload failed:', error);
    } finally {
      preheatInFlightRef.current = false;
    }
  }, [hasFetchedOnce, propUserData]);

  // Trigger cache preheating when component mounts (Reports tab accessed)
  useEffect(() => {
    // Add a small delay to allow the UI to render first, then start preheating
    const preheatingTimer = setTimeout(() => {
      preloadReportingCache();
    }, 100); // 100ms delay to prioritize UI rendering
    
    return () => clearTimeout(preheatingTimer);
  }, [preloadReportingCache]);

  // Targeted refresh function that only refreshes specific datasets needed for a report
  const refreshSpecificDatasets = useCallback(async (datasets: DatasetKey[], reportName: string) => {
    const now = Date.now();
    const timeSinceGlobalRefresh = now - globalLastRefresh;
    
    // Check global cooldown
    if (timeSinceGlobalRefresh < GLOBAL_REFRESH_COOLDOWN) {
      showToast({
        message: `Please wait ${Math.round((GLOBAL_REFRESH_COOLDOWN - timeSinceGlobalRefresh) / 1000)}s before refreshing again`,
        type: 'info'
      });
      return false;
    }

    // Check if any of the required datasets are already loading
    const alreadyLoading = datasets.some(key => datasetStatus[key]?.status === 'loading');
    if (alreadyLoading) {
      showToast({
        message: `${reportName} data is already refreshing. Please wait for the current update to finish.`,
        type: 'info',
      });
      return false;
    }

    globalLastRefresh = now;
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(now);
    setStatusesFor(datasets, 'loading');

    try {
      // Use streaming for supported datasets, individual fetchers for others
      const supportedStreamingDatasets = datasets.filter(key => 
        MANAGEMENT_DATASET_KEYS.includes(key) && key !== 'annualLeave' && key !== 'metaMetrics' && key !== 'googleAnalytics' && key !== 'googleAds'
      );
      const specialDatasets = datasets.filter(key => !MANAGEMENT_DATASET_KEYS.includes(key) || ['annualLeave', 'metaMetrics', 'googleAnalytics', 'googleAds'].includes(key));

      // Start streaming for supported datasets
      if (supportedStreamingDatasets.length > 0) {
        startStreamingWithMemo({ datasets: supportedStreamingDatasets, bypassCache: true });
      }

      // Handle special datasets individually
      const errors: string[] = [];
      for (const datasetKey of specialDatasets) {
        try {
          if (datasetKey === 'annualLeave') {
            const result = await fetchAnnualLeaveDataset(true);
            setDatasetData(prev => ({ ...prev, annualLeave: result.records }));
            setDatasetStatus(prev => ({ ...prev, annualLeave: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, annualLeave: result.records };
          } else if (datasetKey === 'metaMetrics') {
            const metrics = await fetchMetaMetrics(metaDaysBack);
            setDatasetData(prev => ({ ...prev, metaMetrics: metrics }));
            setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, metaMetrics: metrics };
          } else if (datasetKey === 'googleAnalytics') {
            const data = await fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey]);
            setDatasetData(prev => ({ ...prev, googleAnalytics: data }));
            setDatasetStatus(prev => ({ ...prev, googleAnalytics: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, googleAnalytics: data };
          } else if (datasetKey === 'googleAds') {
            const data = await fetchGoogleAdsData(RANGE_MONTH_LOOKUP[enquiriesRangeKey]);
            setDatasetData(prev => ({ ...prev, googleAds: data }));
            setDatasetStatus(prev => ({ ...prev, googleAds: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, googleAds: data };
          }
        } catch (error) {
          errors.push(datasetKey);
          console.error(`Failed to fetch ${datasetKey}:`, error);
          setDatasetStatus(prev => ({ ...prev, [datasetKey]: { status: 'error', updatedAt: now } }));
        }
      }

      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);

      if (errors.length > 0) {
        showToast({
          message: `${reportName} partially refreshed. Some datasets failed: ${errors.join(', ')}`,
          type: 'warning',
          duration: 7000,
        });
      } else {
        showToast({
          message: `${reportName} data refreshed. All required data updated successfully.`,
          type: 'success',
          duration: 5000,
        });
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh datasets';
      setError(message);
      setStatusesFor(datasets, 'error');
      showToast({
        message: `${reportName} refresh failed. ${message}`,
        type: 'error',
        duration: 7000,
      });
      return false;
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [datasetStatus, setStatusesFor, startStreamingWithMemo, fetchAnnualLeaveDataset, fetchMetaMetrics, fetchGoogleAnalyticsData, fetchGoogleAdsData, showToast, metaDaysBack]);

  // More conservative auto-refresh logic to prevent excessive refreshing
  const handleOpenDashboard = useCallback(() => {
    // Immediately show loading state for better UX
    setActiveView('dashboard');
    
    // In test mode, skip data refresh entirely
    if (testMode) {
      debugLog('Test mode active: skipping dashboard data refresh');
      return;
    }
    
    // Check if we have recent enough data or need a fresh fetch
    const cacheState = getCacheState();
    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000); // Extended to 30 minutes before forcing refresh
    
    const needsFresh = !hasFetchedOnce || 
                       !cacheState.lastCacheTime || 
                       cacheState.lastCacheTime < thirtyMinutesAgo;
    
    if (needsFresh && !isFetching && !isStreamingConnected) {
      debugLog('Dashboard needs fresh data (>30min old), triggering refresh');
      void refreshDatasetsWithStreaming(); // Use streaming version
    } else {
      debugLog('Dashboard using cached data (fresh enough)');
    }
  }, [hasFetchedOnce, isFetching, isStreamingConnected, refreshDatasetsWithStreaming, testMode]);

  // Helper to navigate to reports in test mode without triggering refreshes
  const navigateToReport = useCallback((view: typeof activeView) => {
    setActiveView(view);
    if (testMode) {
      debugLog(`Test mode active: navigating to ${view} without data refresh`);
    }
  }, [testMode]);

  useEffect(() => {
    if (propUserData !== undefined) {
      setDatasetData((prev) => {
        if (prev.userData === propUserData) {
          return prev;
        }
        const next = { ...prev, userData: propUserData ?? null };
        cachedData = { ...cachedData, userData: propUserData ?? null };
        return next;
      });
    }
  }, [propUserData]);

  useEffect(() => {
    if (propTeamData !== undefined) {
      setDatasetData((prev) => {
        if (prev.teamData === propTeamData) {
          return prev;
        }
        const next = { ...prev, teamData: propTeamData ?? null };
        cachedData = { ...cachedData, teamData: propTeamData ?? null };
        return next;
      });
    }
  }, [propTeamData]);

  // Memoize expensive dataset summaries computation with better dependency tracking
  const datasetSummaries = useMemo(() => {
    return DATASETS.map((dataset) => {
      // Check if this dataset is being streamed
      const streamingState = streamingDatasets[dataset.key];
      const useStreamingState = streamingState && (isStreamingConnected || streamingState.status !== 'idle');

      const value = useStreamingState ? streamingState.data : datasetData[dataset.key];
      const meta = useStreamingState 
        ? { status: streamingState.status, updatedAt: streamingState.updatedAt }
        : datasetStatus[dataset.key];

      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
      const status: DatasetStatusValue = meta.status === 'loading'
        ? 'loading'
        : hasValue
          ? 'ready'
          : meta.status;
      const count = useStreamingState ? (streamingState.count || 0) : (Array.isArray(value) ? value.length : hasValue ? 1 : 0);
      const cached = useStreamingState ? streamingState.cached : false;
      
      return {
        definition: dataset,
        status,
        updatedAt: meta.updatedAt,
        count,
        cached,
      };
    });
  }, [datasetData, datasetStatus, streamingDatasets, isStreamingConnected]);

  const datasetSummariesSorted = useMemo(() => {
    const sortable = [...datasetSummaries];
    return sortable.sort((a, b) => {
      const statusDiff = DATASET_STATUS_SORT_ORDER[a.status] - DATASET_STATUS_SORT_ORDER[b.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return a.definition.name.localeCompare(b.definition.name);
    });
  }, [datasetSummaries]);

  // Detect datasets stuck loading for too long and auto-mark as error
  // Heavy datasets (recoveredFees, poidData) get up to 10min; light datasets get 2min
  useEffect(() => {
    if (!refreshStartedAt || !isFetching) return;
    
    const timeoutHandle = setInterval(() => {
      const elapsedMs = Date.now() - refreshStartedAt;
      
      datasetSummaries.forEach(summary => {
        if (summary.status === 'loading') {
          // Heavy datasets get more time (10 min / 600s)
          const isHeavy = ['recoveredFees', 'poidData', 'wip'].includes(summary.definition.key);
          const timeoutMs = isHeavy ? 600000 : 120000; // 10min vs 2min
          
          if (elapsedMs > timeoutMs) {
            const timeoutSec = Math.round(timeoutMs / 1000);
            console.warn(`⚠️ Dataset ${summary.definition.key} stuck loading for ${Math.round(elapsedMs / 1000)}s (timeout: ${timeoutSec}s) - marking as error`);
            setDatasetStatus(prev => ({
              ...prev,
              [summary.definition.key]: {
                status: 'error',
                updatedAt: Date.now(),
              }
            }));
          }
        }
      });
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(timeoutHandle);
  }, [refreshStartedAt, isFetching, datasetSummaries]);

  // Optimize elapsed time calculation with reduced precision to prevent excessive re-renders
  const refreshElapsedMs = useMemo(() => {
    if (!refreshStartedAt) return 0;
    const elapsed = currentTime.getTime() - refreshStartedAt;
    // Round to nearest 500ms to reduce re-render frequency while maintaining smooth UX
    return Math.round(elapsed / 500) * 500;
  }, [currentTime, refreshStartedAt]);

  const refreshPhaseLabel = useMemo(() => {
    if (!isFetching || !refreshStartedAt) {
      return null;
    }
    const phase = REFRESH_PHASES.find((candidate) => refreshElapsedMs < candidate.thresholdMs);
    return phase?.label ?? 'Finalising reporting data…';
  }, [isFetching, refreshElapsedMs, refreshStartedAt]);

  // Memoize expensive calculations that depend on arrays or complex objects
  const readyCount = useMemo(() => 
    datasetSummaries.filter((summary) => summary.status === 'ready').length, 
    [datasetSummaries]
  );
  
  // Optimize date/time formatting with reduced frequency updates (only update every 2 seconds)
  const formattedDate = useMemo(() => currentTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }), [currentTime]);
  
  const formattedTime = useMemo(() => currentTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }), [currentTime]);

  // Memoize loading state calculations to prevent excessive re-computation
  const isActivelyLoading = useMemo(() => 
    isFetching && (isStreamingConnected || refreshStartedAt !== null) && !isStreamingComplete, 
    [isFetching, isStreamingConnected, refreshStartedAt, isStreamingComplete]
  );
  
  const canUseReports = useMemo(() => 
    hasFetchedOnce && readyCount > 0, 
    [hasFetchedOnce, readyCount]
  );

  // Function to handle report card clicks with loading feedback
  const handleReportCardClick = async (reportKey: string, action: () => void | Promise<void>, dependencies: string[]) => {
    const isCurrentlyLoading = reportProgressStates[reportKey]?.isLoading || reportLoadingStates[reportKey as keyof typeof reportLoadingStates];
    
    if (isCurrentlyLoading) {
      return; // Don't allow clicks while loading
    }

    // Check if data needs to be refreshed
    const needsRefresh = dependencies.some(dep => {
      const status = datasetStatus[dep as keyof typeof datasetStatus];
      return !status || status.status === 'idle' || status.status === 'loading';
    });

    if (needsRefresh) {
      // Start loading state
      setReportProgressStates(prev => ({
        ...prev,
        [reportKey]: {
          isLoading: true,
          progress: 0,
          stage: 'Preparing data feeds...',
          startTime: Date.now(),
          estimatedTimeRemaining: 15000, // 15 seconds initial estimate
        }
      }));

      try {
        // Trigger targeted data refresh for only the datasets this report needs
        const reportName = AVAILABLE_REPORTS.find(r => r.key === reportKey)?.name || reportKey;
        const success = await refreshSpecificDatasets(dependencies as DatasetKey[], reportName);
        
        if (success) {
          // Clear loading state on success
          setReportProgressStates(prev => ({
            ...prev,
            [reportKey]: {
              isLoading: false,
              progress: 100,
              stage: 'Complete',
              estimatedTimeRemaining: 0,
            }
          }));

          // Clean up progress state after a brief delay
          setTimeout(() => {
            setReportProgressStates(prev => {
              const newState = { ...prev };
              delete newState[reportKey];
              return newState;
            });
          }, 1000);
        } else {
          // Clear loading state on failure
          setReportProgressStates(prev => ({
            ...prev,
            [reportKey]: {
              isLoading: false,
              progress: 0,
              stage: 'Failed',
              estimatedTimeRemaining: 0,
            }
          }));

          setTimeout(() => {
            setReportProgressStates(prev => {
              const newState = { ...prev };
              delete newState[reportKey];
              return newState;
            });
          }, 3000);
          return; // Don't execute the action if refresh failed
        }

      } catch (error) {
        setReportProgressStates(prev => ({
          ...prev,
          [reportKey]: {
            isLoading: false,
            progress: 0,
            stage: 'Error occurred',
            estimatedTimeRemaining: 0,
          }
        }));
        
        setTimeout(() => {
          setReportProgressStates(prev => {
            const newState = { ...prev };
            delete newState[reportKey];
            return newState;
          });
        }, 3000);
        return; // Don't execute the action if there was an error
      }
    }

    // Execute the action (navigate to report or open dashboard)
    if (typeof action === 'function') {
      const result = action();
      if (result instanceof Promise) {
        await result;
      }
    }
  };

  const isDatasetStreamingReady = useCallback((key: DatasetKey) => {
    const streamState = streamingDatasets[key];
    if (!streamState) {
      return true;
    }
    return streamState.status === 'ready';
  }, [streamingDatasets]);

  const isReportLoading = useCallback((reportKey: string) => {
    const required = REPORT_DATASET_REQUIREMENTS[reportKey] ?? [];
    if (required.length === 0) {
      return false;
    }
    const waitingOnDataset = required.some((datasetKey) => datasetStatus[datasetKey]?.status === 'loading');
    const waitingOnStream = isFetching && required.some((datasetKey) => !isDatasetStreamingReady(datasetKey));
    return waitingOnDataset || waitingOnStream;
  }, [datasetStatus, isDatasetStreamingReady, isFetching]);

  // Individual report loading states based on their specific data dependencies
  // Enhanced report loading states with progress tracking
  const reportLoadingStates = useMemo(() => {
    return {
      dashboard: isReportLoading('dashboard'),
      annualLeave: datasetStatus.annualLeave?.status === 'loading',
      enquiries: isReportLoading('enquiries'),
      matters: isReportLoading('matters'),
      metaMetrics: isReportLoading('metaMetrics'),
      seoReport: datasetStatus.googleAnalytics?.status === 'loading',
      ppcReport: datasetStatus.googleAds?.status === 'loading' || ppcLoading,
    };
  }, [
    isReportLoading,
    datasetStatus.annualLeave?.status,
    datasetStatus.metaMetrics?.status,
    datasetStatus.googleAnalytics?.status,
    datasetStatus.googleAds?.status,
    ppcLoading,
  ]);

  // Helper function to check if all required datasets are ready for a report
  const areRequiredDatasetsReady = useCallback((requiredDatasets: DatasetKey[]): boolean => {
    return requiredDatasets.every(key => {
      const status = datasetStatus[key];
      return status?.status === 'ready';
    });
  }, [datasetStatus]);

  // Helper function to get date range for datasets
  // Helper function to determine button state based on dataset statuses
  const getButtonState = useCallback((requiredDatasets: DatasetKey[]): ButtonState => {
    if (requiredDatasets.length === 0) return 'ready'; // No dependencies = always ready
    
    const statuses = requiredDatasets.map(key => datasetStatus[key]?.status || 'idle');
    
    // If all are ready, show ready state
    if (statuses.every(status => status === 'ready')) {
      return 'ready';
    }
    
    // If any are loading, show warming state
    if (statuses.some(status => status === 'loading')) {
      return 'warming';
    }
    
    // Otherwise neutral
    return 'neutral';
  }, [datasetStatus]);

  // Memoize progress detail text to prevent string concatenation on every render
  const progressDetailText = useMemo(() => {
    if (refreshStartedAt && !isStreamingConnected) {
      return `Elapsed ${formatDurationMs(refreshElapsedMs)}${refreshPhaseLabel ? ` • ${refreshPhaseLabel}` : ''}`;
    }
    if (isStreamingConnected) {
      return `Elapsed ${formatDurationMs(refreshElapsedMs)} • Progress: ${Math.round(streamingProgress.percentage)}% • Redis caching active`;
    }
    return 'Preparing data sources…';
  }, [refreshStartedAt, isStreamingConnected, refreshElapsedMs, refreshPhaseLabel, streamingProgress.percentage]);

  // Memoize hero subtitle to prevent frequent updates
  const heroSubtitle = useMemo(() => {
    if (isActivelyLoading) {
      return refreshPhaseLabel ?? 'Refreshing';
    }
    if (lastRefreshTimestamp) {
      return `Updated ${formatRelativeTime(lastRefreshTimestamp)}`;
    }
    return 'Not refreshed yet';
  }, [isActivelyLoading, refreshPhaseLabel, lastRefreshTimestamp]);

  // Memoize hero meta items to prevent array recreation on every render
  const heroMetaItems = useMemo(() => [
    `${formattedDate} • ${formattedTime}`,
    heroSubtitle,
    `${readyCount}/${datasetSummaries.length} data feeds`,
  ], [formattedDate, formattedTime, heroSubtitle, readyCount, datasetSummaries.length]);

  const heroCollaboratorsLabel = useMemo(() => {
    if (!Array.isArray(datasetData.userData) || datasetData.userData.length === 0) {
      return null;
    }
    const initials = datasetData.userData
      .map((user) => {
        if (typeof user.Initials === 'string' && user.Initials.trim().length > 0) {
          return user.Initials.trim();
        }
        if (typeof user.FullName === 'string' && user.FullName.trim().length > 0) {
          return user.FullName
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('');
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    return initials.length > 0 ? initials.join(' • ') : null;
  }, [datasetData.userData]);

  const renderAvailableReportCards = () => {
    // Separate primary reports from secondary ones
    const primaryKeys = ['dashboard', 'enquiries', 'matters'];
    const primaryCards = reportCards.filter(card => primaryKeys.includes(card.key));
    const secondaryCards = reportCards.filter(card => !primaryKeys.includes(card.key));
    
    return (
      <>
        {/* Primary reports - 3 across */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            marginBottom: 20,
          }}
        >
          {primaryCards.map((card, index) => renderReportCard(card, true, index))}
        </div>

        {/* Separator */}
        <div style={{
          height: 1,
          background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
          marginBottom: 20,
        }} />

        {/* Secondary reports - flexible layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
            gap: 14,
          }}
        >
          {secondaryCards.map((card, index) => renderReportCard(card, false, index + primaryCards.length))}
        </div>
      </>
    );
  };

  const renderReportCard = (card: ReportCard, isPrimary: boolean = false, animationIndex: number = 0) => {
        const { readiness, dependencies, readyDependencies, totalDependencies, ...report } = card;
        const visualState: ReportVisualState = (report.disabled && !testMode) ? 'disabled' : readiness;
        const isReportReady = readiness === 'ready' || testMode;
        const stateTokens = REPORT_CARD_STATE_TOKENS[visualState];
        
        // For primary cards: show expanded if any primary is expanded, highlight if active
        const isPrimaryRow = isPrimary && (expandedReportCards.some(key => ['dashboard', 'enquiries', 'matters'].includes(key)));
        const isActive = isPrimary && activePrimaryCard === report.key;
        const isExpanded = isPrimary ? isPrimaryRow : expandedReportCards.includes(report.key);
        
        const readinessSummary = totalDependencies === 0
          ? 'No feeds required'
          : `${readyDependencies}/${totalDependencies} feeds ready`;
        const resolvePrimaryButtonLabel = (readyLabel: string) => {
          if (visualState === 'disabled') {
            return report.status || 'Coming soon';
          }
          if (isReportReady) {
            return readyLabel;
          }
          if (visualState === 'warming') {
            return 'Refreshing…';
          }
          return 'Refresh data to unlock';
        };

        const getReportIcon = () => {
          switch (report.key) {
            case 'dashboard':
              return <FaChartLine size={18} />;
            case 'enquiries':
              return <FaInbox size={18} />;
            case 'annualLeave':
              return <FaClipboardList size={18} />;
            case 'matters':
              return <FaFolderOpen size={18} />;
            default:
              return <FaChartLine size={18} />;
          }
        };

        return (
          <div
            key={report.key}
            onClick={() => {
              // For primary cards: if row is already expanded, clicking anywhere switches active card
              if (isPrimary && isExpanded) {
                setActivePrimaryCard(report.key);
              }
            }}
            style={{
              padding: 0,
              borderRadius: 0,
              background: isDarkMode
                ? `linear-gradient(90deg, ${colours.dark.sectionBackground} 0%, ${colours.dark.cardBackground} 100%)`
                : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
              border: `1px solid ${isDarkMode ? `${colours.highlight}2B` : `${colours.highlight}1A`}`,
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              opacity: visualState === 'disabled' ? 0.6 : 1,
              cursor: isPrimary && isExpanded ? 'pointer' : 'default',
              animation: 'fadeInUp 0.35s ease forwards',
              animationDelay: `${animationIndex * 0.06}s`,
            }}
          >
            <div
              onClick={() => {
                if (report.action && (!report.disabled || testMode)) {
                  const action = report.action === 'dashboard' ? handleOpenDashboard : () => navigateToReport(report.action!);
                  handleReportCardClick(report.key, action, dependencies.map(d => d.key));
                }
              }}
              style={{
                padding: '18px 18px',
                cursor: (report.action && (!report.disabled || testMode)) ? 
                  (reportProgressStates[report.key]?.isLoading ? 'wait' : 'pointer') : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                background: reportProgressStates[report.key]?.isLoading
                  ? (isDarkMode ? `${colours.highlight}26` : `${colours.highlight}14`)
                  : (isPrimary && isActive && isExpanded)
                  ? (isDarkMode ? `${colours.highlight}26` : `${colours.highlight}1A`)
                  : isReportReady
                  ? (isDarkMode ? `${colours.highlight}14` : `${colours.highlight}0D`)
                  : 'transparent',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (report.action && (!report.disabled || testMode) && !reportProgressStates[report.key]?.isLoading) {
                  e.currentTarget.style.background = isDarkMode ? `${colours.highlight}1F` : `${colours.highlight}14`;
                }
              }}
              onMouseLeave={(e) => {
                const currentProgress = reportProgressStates[report.key];
                e.currentTarget.style.background = currentProgress?.isLoading
                  ? (isDarkMode ? `${colours.highlight}26` : `${colours.highlight}14`)
                  : isReportReady
                  ? (isDarkMode ? `${colours.highlight}14` : `${colours.highlight}0D`)
                  : 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: isReportReady
                    ? `linear-gradient(135deg, ${stateTokens.accent}22 0%, ${stateTokens.accent}11 100%)`
                    : (isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.12)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${isReportReady ? stateTokens.accent + '33' : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)')}`,
                  color: isReportReady ? stateTokens.accent : (isDarkMode ? '#94a3b8' : '#64748b'),
                  flexShrink: 0,
                }}>
                  {getReportIcon()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: isDarkMode ? '#f8fafc' : '#0f172a',
                    marginBottom: 8,
                    fontFamily: 'Raleway, sans-serif',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {report.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: isDarkMode ? '#94a3b8' : '#64748b',
                    fontWeight: 500,
                    minHeight: 24,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'visible',
                  }}>
                    {reportProgressStates[report.key]?.isLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{reportProgressStates[report.key]?.stage || 'Loading...'}</span>
                          <div style={{
                            width: 8,
                            height: 8,
                            border: `2px solid ${colours.highlight}`,
                            borderTop: '2px solid transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                          }} />
                        </div>
                        {reportProgressStates[report.key]?.estimatedTimeRemaining && (
                          <span style={{ fontSize: 10, opacity: 0.8 }}>
                            ~{Math.ceil((reportProgressStates[report.key]?.estimatedTimeRemaining || 0) / 1000)}s remaining
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 14px',
                        borderRadius: 999,
                        background: reportProgressStates[report.key]?.isLoading
                          ? (isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)')
                          : isReportReady
                          ? (isDarkMode ? stateTokens.accent + '22' : stateTokens.accent + '15')
                          : (isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(148, 163, 184, 0.15)'),
                        color: reportProgressStates[report.key]?.isLoading
                          ? (isDarkMode ? '#3b82f6' : '#2563eb')
                          : isReportReady ? stateTokens.accent : (isDarkMode ? '#94a3b8' : '#64748b'),
                        border: `1px solid ${reportProgressStates[report.key]?.isLoading
                          ? (isDarkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)')
                          : isReportReady ? stateTokens.accent + '33' : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)')}`,
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        {reportProgressStates[report.key]?.isLoading ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            LOADING
                            <span style={{
                              fontSize: 10,
                              opacity: 0.8,
                              fontWeight: 400,
                            }}>
                              {Math.round(reportProgressStates[report.key]?.progress || 0)}%
                            </span>
                          </span>
                        ) : (
                          visualState === 'disabled' ? (report.status || stateTokens.label) : 
                          (stateTokens.label === 'Not loaded' ? `Ready (${describeRangeKey(enquiriesRangeKey)})` : stateTokens.label)
                        )}
                        
                        {/* Progress bar overlay */}
                        {reportProgressStates[report.key]?.isLoading && (
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            height: 2,
                            width: `${reportProgressStates[report.key]?.progress || 0}%`,
                            background: colours.highlight,
                            transition: 'width 0.3s ease',
                            borderRadius: '0 0 999px 999px',
                          }} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {(dependencies.length > 0 || report.action) && (
                  <FontIcon
                    iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isPrimary) {
                        // For primary cards: toggle all primary cards expanded, set as active
                        if (isExpanded) {
                          setExpandedReportCards((prev) => prev.filter((key) => !['dashboard', 'enquiries', 'matters'].includes(key)));
                          setActivePrimaryCard(null);
                        } else {
                          setExpandedReportCards((prev) => {
                            const withoutPrimary = prev.filter((key) => !['dashboard', 'enquiries', 'matters'].includes(key));
                            return [...withoutPrimary, report.key];
                          });
                          setActivePrimaryCard(report.key);
                        }
                      } else {
                        // For secondary cards: toggle normally
                        setExpandedReportCards((prev) => {
                          if (isExpanded) {
                            return prev.filter((key) => key !== report.key);
                          }
                          return [...prev, report.key];
                        });
                      }
                    }}
                    style={{
                      fontSize: 14,
                      color: isDarkMode ? '#94a3b8' : '#64748b',
                      cursor: 'pointer',
                      padding: 8,
                      borderRadius: 8,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  />
                )}
              </div>
            </div>

            {!isExpanded && dependencies.length > 0 && (
              <div style={{
                padding: '12px 28px 16px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: (isPrimary && !isActive && isExpanded) ? 0.5 : 1,
                animation: 'fadeInSlideDown 0.3s ease 0.1s forwards',
                transition: 'opacity 0.2s ease',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    overflow: 'visible',
                    minHeight: 20,
                  }}>
                    {dependencies.slice(0, 8).map((dependency, index) => {
                      const palette = STATUS_BADGE_COLOURS[dependency.status];
                      const dotColour = dependency.status === 'ready'
                        ? (isDarkMode ? '#4ade80' : '#15803d')
                        : palette.dot;
                      return (
                        <div
                          key={`${report.key}-dot-${dependency.key}`}
                          title={`${dependency.name}: ${palette.label}${dependency.range ? ` (${dependency.range})` : ''}`}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: dotColour,
                            flexShrink: 0,
                            opacity: dependency.status === 'ready' ? 1 : 0.7,
                            transform: 'scale(0)',
                            animation: `dotFadeIn 0.3s ease ${0.1 + (index * 0.05)}s forwards`,
                          }}
                        />
                      );
                    })}
                    {dependencies.length > 8 && (
                      <span style={{
                        fontSize: 10,
                        color: isDarkMode ? '#64748b' : '#94a3b8',
                        fontWeight: 500,
                        marginLeft: 2,
                        opacity: 0,
                        animation: `fadeIn 0.3s ease ${0.1 + (Math.min(8, dependencies.length) * 0.05)}s forwards`,
                      }}>
                        +{dependencies.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isExpanded && (
              <div style={{
                padding: '0 28px 24px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)'}`,
                background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(248, 250, 252, 0.5)',
                opacity: (isPrimary && !isActive) ? 0.5 : 1,
                transition: 'opacity 0.2s ease',
              }}>
                <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {dependencies.length > 0 ? (
                    <div>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isDarkMode ? '#cbd5e1' : '#64748b',
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Data Feeds ({readyDependencies}/{totalDependencies} ready)
                      </div>
                      <div style={dependencyChipsWrapStyle}>
                        {dependencies.map((dependency) => {
                          const palette = STATUS_BADGE_COLOURS[dependency.status];
                          const dotColour = dependency.status === 'ready'
                            ? (isDarkMode ? '#4ade80' : '#15803d')
                            : palette.dot;
                          return (
                            <span
                              key={`${report.key}-${dependency.key}`}
                              style={dependencyChipStyle(isDarkMode)}
                              title={dependency.range ? `Typical coverage: ${dependency.range}` : undefined}
                            >
                              <span style={dependencyDotStyle(dotColour)} />
                              <span style={{ fontWeight: 600 }}>{dependency.name}</span>
                              <span style={{ fontSize: 10, opacity: 0.7 }}>
                                {palette.label === 'Not loaded'
                                  ? dependency.range || describeRangeKey(enquiriesRangeKey)
                                  : palette.label}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                      No datasets required
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {report.action === 'dashboard' && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!managementRangeIsRefreshing && (
                          <div
                            style={{
                              width: '100%',
                              borderRadius: 12,
                              padding: 12,
                              background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 248, 255, 0.9)',
                              border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(96, 165, 250, 0.4)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Management data window</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>
                                {managementRangeIsRefreshing
                                  ? 'Refreshing…'
                                  : managementSliderHasPendingChange
                                    ? `Pending: ${describeRangeKey(pendingEnquiriesRangeKey)}`
                                    : `Active: ${describeRangeKey(enquiriesRangeKey)}`}
                              </div>
                            </div>
                            <Slider
                              min={0}
                              max={REPORT_RANGE_OPTIONS.length - 1}
                              step={1}
                              value={managementSliderValue}
                              onChange={handleManagementSliderValueChange}
                              showValue={false}
                              styles={{
                                root: { margin: '8px 4px' },
                                activeSection: { background: colours.highlight },
                                thumb: { borderColor: colours.highlight },
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                              {REPORT_RANGE_OPTIONS.map((option, index) => (
                                <span
                                  key={`${report.key}-mgmt-${option.key}`}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: index === managementSliderValue ? 700 : 500,
                                    color: index === managementSliderValue
                                      ? colours.highlight
                                      : (isDarkMode ? '#94a3b8' : '#64748b'),
                                    transition: 'color 0.2s ease',
                                  }}
                                >
                                  {option.label}
                                </span>
                              ))}
                            </div>
                            {managementSliderHasPendingChange && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                                <DefaultButton
                                  text={`Apply ${describeRangeKey(pendingEnquiriesRangeKey)}`}
                                  onClick={handleApplyManagementRange}
                                  styles={subtleButtonStyles(isDarkMode)}
                                  disabled={managementRangeIsRefreshing}
                                  iconProps={{ iconName: 'Play' }}
                                />
                              </div>
                            )}
                            {managementSliderHasPendingChange && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: 8,
                                  background: 'rgba(191, 219, 254, 0.35)',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  color: isDarkMode ? '#e2e8f0' : '#475569',
                                  fontWeight: 500,
                                }}
                              >
                                Refreshes management dashboard datasets only
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          <PrimaryButton
                            text={resolvePrimaryButtonLabel('Open dashboard')}
                            onClick={() => {
                              if (isReportReady) handleOpenDashboard();
                            }}
                            styles={isReportReady
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 0,
                                    padding: '0 16px',
                                    height: 36,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 600,
                                    boxShadow: 'none',
                                    transition: 'all 0.15s ease',
                                    fontFamily: 'Raleway, sans-serif',
                                  },
                                  rootHovered: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                  },
                                  rootPressed: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                  },
                                  rootDisabled: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                  },
                                }}
                            disabled={!isReportReady}
                          />
                          <DefaultButton
                            text="Refresh All Datasets"
                            onClick={refreshDatasetsWithStreaming}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={reportLoadingStates.dashboard}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </div>
                      </div>
                    )}
                    {report.action === 'annualLeave' && (
                      <>
                        <PrimaryButton
                          text={resolvePrimaryButtonLabel('Open annual leave')}
                          onClick={() => {
                            if (isReportReady) navigateToReport('annualLeave');
                          }}
                          styles={isReportReady
                            ? primaryButtonStyles(isDarkMode)
                            : {
                                root: {
                                  borderRadius: 0,
                                  padding: '0 16px',
                                  height: 36,
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                  fontWeight: 600,
                                  boxShadow: 'none',
                                  transition: 'all 0.15s ease',
                                  fontFamily: 'Raleway, sans-serif',
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                },
                                rootPressed: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                },
                                rootDisabled: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                },
                              }}
                          disabled={!isReportReady}
                        />
                        <DefaultButton
                          text="Refresh leave data"
                          onClick={refreshAnnualLeaveOnly}
                          styles={subtleButtonStyles(isDarkMode)}
                          disabled={reportLoadingStates.annualLeave}
                          iconProps={{ iconName: 'Refresh' }}
                        />
                      </>
                    )}
                    {report.action === 'matters' && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!isActivelyLoading && (
                        <div
                          style={{
                            width: '100%',
                            borderRadius: 12,
                            padding: 12,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 248, 255, 0.9)',
                            border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(96, 165, 250, 0.4)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Matters data window</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>
                              {wipRangeIsRefreshing
                                ? 'Refreshing…'
                                : sliderHasPendingChange
                                  ? `Pending: ${describeMattersRange(pendingMattersRangeKey)}`
                                  : `Active: ${describeMattersRange(mattersWipRangeKey)}`}
                            </div>
                          </div>
                          <Slider
                            min={0}
                            max={MATTERS_WIP_RANGE_OPTIONS.length - 1}
                            step={1}
                            value={mattersRangeSliderValue}
                            onChange={handleMattersSliderValueChange}
                            showValue={false}
                            disabled={report.disabled && !testMode}
                            styles={{
                              root: { margin: '8px 4px' },
                              activeSection: { background: colours.highlight },
                              thumb: { borderColor: colours.highlight },
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            {MATTERS_WIP_RANGE_OPTIONS.map((option, index) => (
                              <span
                                key={option.key}
                                style={{
                                  fontSize: 10,
                                  fontWeight: index === mattersRangeSliderValue ? 700 : 500,
                                  color: index === mattersRangeSliderValue
                                    ? colours.highlight
                                    : (isDarkMode ? '#94a3b8' : '#64748b'),
                                  transition: 'color 0.2s ease',
                                }}
                              >
                                {option.label}
                              </span>
                            ))}
                          </div>
                          {sliderHasPendingChange && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                              <DefaultButton
                                text={`Apply ${describeMattersRange(pendingMattersRangeKey)}`}
                                onClick={handleApplyPendingMattersRange}
                                styles={subtleButtonStyles(isDarkMode)}
                                disabled={wipRangeIsRefreshing || (report.disabled && !testMode)}
                                iconProps={{ iconName: 'Play' }}
                              />
                            </div>
                          )}
                          {sliderHasPendingChange && (
                            <div style={{ 
                              marginTop: 8, 
                              padding: 8, 
                              background: 'rgba(191, 219, 254, 0.35)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: isDarkMode ? '#e2e8f0' : '#475569',
                              fontWeight: 500
                            }}>
                              Will cover: {describeMattersRange(pendingMattersRangeKey)}
                            </div>
                          )}
                        </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          <PrimaryButton
                            text={resolvePrimaryButtonLabel('Open matters report')}
                            onClick={() => {
                              if ((!report.disabled || testMode) && isReportReady) navigateToReport('matters');
                            }}
                            styles={isReportReady && (!report.disabled || testMode)
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 0,
                                    padding: '0 16px',
                                    height: 36,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 600,
                                    boxShadow: 'none',
                                    transition: 'all 0.15s ease',
                                    fontFamily: 'Raleway, sans-serif',
                                  },
                                  rootHovered: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                  },
                                  rootPressed: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                  },
                                  rootDisabled: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                  },
                                }}
                            disabled={!isReportReady || (report.disabled && !testMode)}
                          />
                          <DefaultButton
                            text="Refresh"
                            onClick={refreshMattersScoped}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={reportLoadingStates.matters || (report.disabled && !testMode)}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </div>
                      </div>
                    )}
                    {report.action === 'enquiries' && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!isActivelyLoading && (
                        <div
                          style={{
                            width: '100%',
                            borderRadius: 12,
                            padding: 12,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 248, 255, 0.9)',
                            border: `1px solid ${isDarkMode ? 'rgba(129, 140, 248, 0.25)' : 'rgba(96, 165, 250, 0.4)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>Enquiries & marketing window</div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>
                              {enquiriesRangeIsRefreshing
                                ? 'Refreshing…'
                                : enquiriesSliderHasPendingChange
                                  ? `Pending: ${describeRangeKey(pendingEnquiriesRangeKey)}`
                                  : `Active: ${describeRangeKey(enquiriesRangeKey)}`}
                            </div>
                          </div>
                          <Slider
                            min={0}
                            max={REPORT_RANGE_OPTIONS.length - 1}
                            step={1}
                            value={enquiriesRangeSliderValue}
                            onChange={handleEnquiriesSliderValueChange}
                            showValue={false}
                            disabled={report.disabled && !testMode}
                            styles={{
                              root: { margin: '8px 4px' },
                              activeSection: { background: colours.highlight },
                              thumb: { borderColor: colours.highlight },
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            {REPORT_RANGE_OPTIONS.map((option, index) => (
                              <span
                                key={option.key}
                                style={{
                                  fontSize: 10,
                                  fontWeight: index === enquiriesRangeSliderValue ? 700 : 500,
                                  color: index === enquiriesRangeSliderValue
                                    ? colours.highlight
                                    : (isDarkMode ? '#94a3b8' : '#64748b'),
                                  transition: 'color 0.2s ease',
                                }}
                              >
                                {option.label}
                              </span>
                            ))}
                          </div>

                          {enquiriesSliderHasPendingChange && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                              <DefaultButton
                                text={`Apply ${describeRangeKey(pendingEnquiriesRangeKey)}`}
                                onClick={handleApplyPendingEnquiriesRange}
                                styles={subtleButtonStyles(isDarkMode)}
                                disabled={enquiriesRangeIsRefreshing || (report.disabled && !testMode)}
                                iconProps={{ iconName: 'Play' }}
                              />
                            </div>
                          )}
                          {enquiriesSliderHasPendingChange && (
                            <div style={{ 
                              marginTop: 8, 
                              padding: 8, 
                              background: 'rgba(191, 219, 254, 0.35)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: isDarkMode ? '#e2e8f0' : '#475569',
                              fontWeight: 500
                            }}>
                              Will cover: {describeRangeKey(pendingEnquiriesRangeKey)}
                            </div>
                          )}
                        </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          <PrimaryButton
                            text={resolvePrimaryButtonLabel('Open enquiries report')}
                            onClick={() => {
                              if (isReportReady) navigateToReport('enquiries');
                            }}
                            styles={isReportReady
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 0,
                                    padding: '0 16px',
                                    height: 36,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 600,
                                    boxShadow: 'none',
                                    transition: 'all 0.15s ease',
                                    fontFamily: 'Raleway, sans-serif',
                                  },
                                  rootHovered: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                  },
                                  rootPressed: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                  },
                                  rootDisabled: {
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                  },
                                }}
                            disabled={!isReportReady}
                          />
                          <DefaultButton
                            text="Refresh enquiries data"
                            onClick={refreshEnquiriesScoped}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={reportLoadingStates.enquiries}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </div>
                      </div>
                    )}
                    {report.action === 'metaMetrics' && (
                      <>
                        <PrimaryButton
                          text={resolvePrimaryButtonLabel('Open Meta ads')}
                          onClick={() => {
                            if (isReportReady) navigateToReport('metaMetrics');
                          }}
                          styles={isReportReady
                            ? primaryButtonStyles(isDarkMode)
                            : {
                                root: {
                                  borderRadius: 0,
                                  padding: '0 16px',
                                  height: 36,
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                  fontWeight: 600,
                                  boxShadow: 'none',
                                  transition: 'all 0.15s ease',
                                  fontFamily: 'Raleway, sans-serif',
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                },
                                rootPressed: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                },
                                rootDisabled: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                },
                              }}
                          disabled={!isReportReady}
                        />
                        <DefaultButton
                          text="Refresh Meta data"
                          onClick={refreshMetaMetricsOnly}
                          styles={subtleButtonStyles(isDarkMode)}
                          disabled={reportLoadingStates.metaMetrics}
                          iconProps={{ iconName: 'Refresh' }}
                        />
                      </>
                    )}
                    {report.action === 'seoReport' && (
                      <>
                        <PrimaryButton
                          text={resolvePrimaryButtonLabel('Open SEO report')}
                          onClick={() => {
                            if ((!report.disabled || testMode) && isReportReady) navigateToReport('seoReport');
                          }}
                          styles={isReportReady && (!report.disabled || testMode)
                            ? primaryButtonStyles(isDarkMode)
                            : {
                                root: {
                                  borderRadius: 0,
                                  padding: '0 16px',
                                  height: 36,
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                  fontWeight: 600,
                                  boxShadow: 'none',
                                  transition: 'all 0.15s ease',
                                  fontFamily: 'Raleway, sans-serif',
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                },
                                rootPressed: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                },
                                rootDisabled: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                },
                              }}
                          disabled={(report.disabled && !testMode) || !isReportReady}
                        />
                        <DefaultButton
                          text={reportLoadingStates.seoReport ? 'Refreshing…' : 'Refresh'}
                          onClick={refreshGoogleAnalyticsOnly}
                          styles={subtleButtonStyles(isDarkMode)}
                          disabled={reportLoadingStates.seoReport}
                          iconProps={{ iconName: 'Refresh' }}
                        />
                      </>
                    )}
                    {report.action === 'ppcReport' && (
                      <>
                        <PrimaryButton
                          text={resolvePrimaryButtonLabel('Open PPC report')}
                          onClick={() => {
                            if ((!report.disabled || testMode) && isReportReady) navigateToReport('ppcReport');
                          }}
                          styles={isReportReady && (!report.disabled || testMode)
                            ? primaryButtonStyles(isDarkMode)
                            : {
                                root: {
                                  borderRadius: 0,
                                  padding: '0 16px',
                                  height: 36,
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                  fontWeight: 600,
                                  boxShadow: 'none',
                                  transition: 'all 0.15s ease',
                                  fontFamily: 'Raleway, sans-serif',
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.18)',
                                },
                                rootPressed: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)',
                                },
                                rootDisabled: {
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                  color: isDarkMode ? '#94a3b8' : '#64748b',
                                  border: `1px solid ${colours.highlight}`,
                                },
                              }}
                          disabled={(report.disabled && !testMode) || !isReportReady}
                        />
                        <DefaultButton
                          text={reportLoadingStates.ppcReport ? 'Refreshing…' : 'Refresh'}
                          onClick={refreshGoogleAdsOnly}
                          styles={subtleButtonStyles(isDarkMode)}
                          disabled={report.disabled || reportLoadingStates.ppcReport}
                          iconProps={{ iconName: 'Refresh' }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
  };

  const handleLaunchDashboard = useCallback(() => {
    if (!canUseReports) {
      showToast({
        message: 'Refresh data to continue. We need at least one ready dataset before opening the management dashboard.',
        type: 'info',
        duration: 5000,
      });
      return;
    }
    setActiveView('dashboard');
  }, [canUseReports, setActiveView, showToast]);

  const handleEnquiriesRangeChange = useCallback((nextKey: ReportRangeKey) => {
    if (nextKey === enquiriesRangeKey) {
      return;
    }
    const nextRangeWindow = computeRangeWindowByKey(nextKey);
    setEnquiriesRangeKey(nextKey);
    setPendingEnquiriesRangeKey(nextKey);
    setStatusesFor(ENQUIRIES_RANGE_DATASETS, 'loading');
    setIsFetching(true);
    setRefreshStartedAt(Date.now());
    const nextQueryParams = {
      ...buildEnquiriesRangeParams(nextRangeWindow),
      ...buildMetaRangeParams(nextKey),
    };
    startStreamingWithMemo({
      datasets: ENQUIRIES_RANGE_DATASETS,
      bypassCache: true,
      queryParams: nextQueryParams,
    });
  }, [
    enquiriesRangeKey,
    setStatusesFor,
    showToast,
    startStreamingWithMemo,
    setIsFetching,
    setRefreshStartedAt,
  ]);

  const handleMattersWipRangeChange = useCallback((nextKey: string) => {
    const isValidKey = MATTERS_WIP_RANGE_OPTIONS.some((option) => option.key === nextKey);
    if (!isValidKey) {
      console.warn('Matters WIP range change ignored for unknown key', nextKey);
      return;
    }
    const typedKey = nextKey as MattersWipRangeKey;
    if (typedKey === mattersWipRangeKey) {
      return;
    }
    const nextRange = computeMattersRangeWindow(typedKey);
    setMattersWipRangeKey(typedKey);
    setPendingMattersRangeKey(typedKey);
    setStatusesFor(MATTERS_REPORT_REFRESH_DATASETS, 'loading');
    setIsFetching(true);
    setRefreshStartedAt(Date.now());
    const nextQueryParams = buildMattersRangeParams(nextRange);
    startStreamingWithMemo({
      datasets: MATTERS_REPORT_REFRESH_DATASETS,
      bypassCache: true,
      queryParams: nextQueryParams,
    });
  }, [
    mattersWipRangeKey,
    setPendingMattersRangeKey,
    setStatusesFor,
    showToast,
    startStreamingWithMemo,
    setIsFetching,
    setRefreshStartedAt,
  ]);

  const heroDescriptionCopy = 'Access management dashboards, marketing insights, and enquiries reporting with real-time data feeds.';

  const wipRangeIsRefreshing = useMemo(
    () => MATTERS_RANGE_DATASETS.some((key) => streamingDatasets[key]?.status === 'loading'),
    [streamingDatasets]
  );

  const enquiriesRangeIsRefreshing = useMemo(
    () => ENQUIRIES_RANGE_DATASETS.some((key) => streamingDatasets[key]?.status === 'loading'),
    [streamingDatasets]
  );

  const wipRangeDisplayOptions = useMemo(
    () => MATTERS_WIP_RANGE_OPTIONS.map(({ key, label }) => ({ key, label })),
    []
  );

  const enquiriesRangeDisplayOptions = useMemo(
    () => REPORT_RANGE_OPTIONS.map(({ key, label }) => ({ key, label })),
    []
  );

  const mattersRangeSliderValue = useMemo(() => {
    const idx = MATTERS_WIP_RANGE_OPTIONS.findIndex(option => option.key === pendingMattersRangeKey);
    if (idx >= 0) {
      return idx;
    }
    const defaultIdx = MATTERS_WIP_RANGE_OPTIONS.findIndex(option => option.key === '12m');
    return defaultIdx >= 0 ? defaultIdx : 0;
  }, [pendingMattersRangeKey]);

  const handleMattersSliderValueChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    const option = MATTERS_WIP_RANGE_OPTIONS[rounded];
    if (!option) {
      return;
    }
    setPendingMattersRangeKey(option.key);
  }, []);

  const enquiriesRangeSliderValue = useMemo(() => {
    const idx = REPORT_RANGE_OPTIONS.findIndex(option => option.key === pendingEnquiriesRangeKey);
    if (idx >= 0) {
      return idx;
    }
    const defaultIdx = REPORT_RANGE_OPTIONS.findIndex(option => option.key === '12m');
    return defaultIdx >= 0 ? defaultIdx : 0;
  }, [pendingEnquiriesRangeKey]);

  const handleEnquiriesSliderValueChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    const option = REPORT_RANGE_OPTIONS[rounded];
    if (!option) {
      return;
    }
    setPendingEnquiriesRangeKey(option.key);
    if (isRefreshRangeCalloutOpen) {
      setPendingMattersRangeKey(option.key as MattersWipRangeKey);
    }
  }, [isRefreshRangeCalloutOpen, setPendingMattersRangeKey]);

  const sliderHasPendingChange = pendingMattersRangeKey !== mattersWipRangeKey;
  const enquiriesSliderHasPendingChange = pendingEnquiriesRangeKey !== enquiriesRangeKey;
  const enquiriesCoverageEntriesForDisplay = enquiriesSliderHasPendingChange
    ? enquiriesRangePendingCoverage
    : enquiriesRangeActiveCoverage;
  const mattersCoverageEntriesForDisplay = sliderHasPendingChange
    ? mattersRangePendingCoverage
    : mattersRangeActiveCoverage;

  const applyGlobalRangeAndRefresh = useCallback((nextEnquiriesKey: ReportRangeKey, nextMattersKey: MattersWipRangeKey) => {
    if (nextEnquiriesKey === enquiriesRangeKey && nextMattersKey === mattersWipRangeKey) {
      return;
    }
    setEnquiriesRangeKey(nextEnquiriesKey);
    setPendingEnquiriesRangeKey(nextEnquiriesKey);
    setMattersWipRangeKey(nextMattersKey);
    setPendingMattersRangeKey(nextMattersKey);
    performStreamingRefresh(true, {
      rangeOverrides: {
        enquiriesRangeKey: nextEnquiriesKey,
        mattersRangeKey: nextMattersKey,
      },
    });
  }, [enquiriesRangeKey, mattersWipRangeKey, performStreamingRefresh]);

  const applyManagementRangeAndRefresh = useCallback((nextEnquiriesKey: ReportRangeKey, nextMattersKey: MattersWipRangeKey) => {
    if (nextEnquiriesKey === enquiriesRangeKey && nextMattersKey === mattersWipRangeKey) {
      return;
    }
    setEnquiriesRangeKey(nextEnquiriesKey);
    setPendingEnquiriesRangeKey(nextEnquiriesKey);
    setMattersWipRangeKey(nextMattersKey);
    setPendingMattersRangeKey(nextMattersKey);
    performStreamingRefresh(true, {
      rangeOverrides: {
        enquiriesRangeKey: nextEnquiriesKey,
        mattersRangeKey: nextMattersKey,
      },
      scope: 'dashboard',
      streamTargets: MANAGEMENT_DASHBOARD_STREAM_TARGETS,
      statusTargets: MANAGEMENT_DASHBOARD_STATUS_TARGETS,
    });
  }, [enquiriesRangeKey, mattersWipRangeKey, performStreamingRefresh]);

  const managementSliderValue = enquiriesRangeSliderValue;
  const managementSliderHasPendingChange = sliderHasPendingChange || enquiriesSliderHasPendingChange;
  const managementRangeIsRefreshing = isActivelyLoading;

  const handleManagementSliderValueChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    const option = REPORT_RANGE_OPTIONS[rounded];
    if (!option) {
      return;
    }
    setPendingEnquiriesRangeKey(option.key);
    setPendingMattersRangeKey(option.key as MattersWipRangeKey);
  }, []);

  const handleApplyManagementRange = useCallback(() => {
    applyManagementRangeAndRefresh(pendingEnquiriesRangeKey, pendingMattersRangeKey);
  }, [applyManagementRangeAndRefresh, pendingEnquiriesRangeKey, pendingMattersRangeKey]);

  const getDatasetDateRange = useCallback(
    (datasetKey: DatasetKey, reportKey?: string): string => {
      const globalPreviewRangeKey = isRefreshRangeCalloutOpen ? pendingEnquiriesRangeKey : null;
      const mattersPreviewRangeKey =
        !globalPreviewRangeKey && reportKey === 'matters' && sliderHasPendingChange
          ? pendingMattersRangeKey
          : null;
      const enquiriesPreviewRangeKey =
        !globalPreviewRangeKey && reportKey === 'enquiries' && enquiriesSliderHasPendingChange
          ? pendingEnquiriesRangeKey
          : null;
      const managementPreviewRangeKey =
        !globalPreviewRangeKey && reportKey === 'dashboard' && managementSliderHasPendingChange
          ? pendingEnquiriesRangeKey
          : null;

      const previewRangeKey =
        globalPreviewRangeKey ||
        mattersPreviewRangeKey ||
        enquiriesPreviewRangeKey ||
        managementPreviewRangeKey;

      if (previewRangeKey) {
        const isMattersDataset = MATTERS_RANGE_DATASETS.includes(datasetKey);
        return isMattersDataset
          ? describeMattersRange(previewRangeKey as MattersWipRangeKey)
          : describeRangeKey(previewRangeKey as ReportRangeKey);
      }

      const dateRanges: Record<DatasetKey, string> = {
        userData: 'Current',
        teamData: 'Current',
        enquiries: describeRangeKey(enquiriesRangeKey),
        allMatters: describeMattersRange(mattersWipRangeKey),
        wip: describeMattersRange(mattersWipRangeKey),
        recoveredFees: describeMattersRange(mattersWipRangeKey),
        poidData: 'Last 24 months',
        annualLeave: 'Current year',
        metaMetrics: describeRangeKey(enquiriesRangeKey),
        googleAnalytics: describeRangeKey(enquiriesRangeKey),
        googleAds: describeRangeKey(enquiriesRangeKey),
        deals: describeRangeKey(enquiriesRangeKey),
        instructions: describeRangeKey(enquiriesRangeKey),
      };

      return dateRanges[datasetKey] || '';
    },
    [
      enquiriesRangeKey,
      enquiriesSliderHasPendingChange,
      isRefreshRangeCalloutOpen,
      managementSliderHasPendingChange,
      mattersWipRangeKey,
      pendingEnquiriesRangeKey,
      pendingMattersRangeKey,
      sliderHasPendingChange,
    ]
  );

  const reportCards = useMemo<ReportCard[]>(() => {
    return AVAILABLE_REPORTS.map((report) => {
        const dependencies = report.requiredDatasets.map<ReportDependency>((datasetKey) => {
        const dataset = DATASETS.find((definition) => definition.key === datasetKey);
        const status = datasetStatus[datasetKey]?.status ?? 'idle';
        return {
          key: datasetKey,
          name: dataset?.name ?? datasetKey,
          status,
            range: getDatasetDateRange(datasetKey, report.key),
        };
      });

      return {
        ...report,
        readiness: getButtonState(report.requiredDatasets),
        dependencies,
        readyDependencies: dependencies.filter((dependency) => dependency.status === 'ready').length,
        totalDependencies: dependencies.length,
      };
    });
  }, [datasetStatus, getDatasetDateRange, getButtonState]);

  const handleApplyPendingMattersRange = useCallback(() => {
    if (!sliderHasPendingChange || wipRangeIsRefreshing) {
      return;
    }
    handleMattersWipRangeChange(pendingMattersRangeKey);
  }, [sliderHasPendingChange, wipRangeIsRefreshing, handleMattersWipRangeChange, pendingMattersRangeKey]);

  const handleApplyPendingEnquiriesRange = useCallback(() => {
    if (!enquiriesSliderHasPendingChange || enquiriesRangeIsRefreshing) {
      return;
    }
    handleEnquiriesRangeChange(pendingEnquiriesRangeKey);
  }, [enquiriesSliderHasPendingChange, enquiriesRangeIsRefreshing, handleEnquiriesRangeChange, pendingEnquiriesRangeKey]);

  const handleToggleRefreshRangeCallout = useCallback(() => {
    setRefreshRangeCalloutOpen((prev) => !prev);
  }, []);

  const handleCloseRefreshRangeCallout = useCallback(() => {
    setRefreshRangeCalloutOpen(false);
  }, []);

  const handleApplyGlobalRangeFromCallout = useCallback(() => {
    const nextEnquiriesKey = enquiriesSliderHasPendingChange ? pendingEnquiriesRangeKey : enquiriesRangeKey;
    const nextMattersKey = sliderHasPendingChange ? pendingMattersRangeKey : mattersWipRangeKey;
    applyGlobalRangeAndRefresh(nextEnquiriesKey, nextMattersKey);
    setRefreshRangeCalloutOpen(false);
  }, [
    applyGlobalRangeAndRefresh,
    enquiriesSliderHasPendingChange,
    pendingEnquiriesRangeKey,
    sliderHasPendingChange,
    pendingMattersRangeKey,
    enquiriesRangeKey,
    mattersWipRangeKey,
  ]);



  // Safety: if streaming disconnected and nothing is loading, clear fetching flag
  useEffect(() => {
    const anyLoading = datasetSummaries.some(s => s.status === 'loading');
    if (!isStreamingConnected && !anyLoading && isFetching) {
      const started = refreshStartedAt ?? refreshStartedAtRef.current ?? null;
      if (started && Date.now() - started < 1500) {
        return; // allow freshly triggered refreshes to establish streaming connection
      }
      debugLog('ReportingHome: Clearing fetching state (no active loads and stream closed)');
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [isStreamingConnected, datasetSummaries, isFetching, refreshStartedAt]);

  if (activeView === 'dashboard') {
    return (
      <div style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <ManagementDashboard
            enquiries={datasetData.enquiries}
            allMatters={datasetData.allMatters}
            wip={datasetData.wip}
            recoveredFees={datasetData.recoveredFees}
            teamData={datasetData.teamData}
            userData={datasetData.userData}
            poidData={datasetData.poidData}
              annualLeave={datasetData.annualLeave}
              triggerRefresh={refreshDatasetsWithStreaming}
              lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
              isFetching={isFetching}
              dataWindowDays={managementRangeDays}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'annualLeave') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>

          <AnnualLeaveReport
            data={datasetData.annualLeave || []}
            teamData={datasetData.teamData || []}
              triggerRefresh={refreshAnnualLeaveOnly}
              lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
              isFetching={isFetching}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'matters') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <MattersReport
              matters={datasetData.allMatters ?? []}
              isLoading={reportLoadingStates.matters}
              error={error}
              userData={datasetData.userData ?? []}
              teamData={datasetData.teamData}
              deals={datasetData.deals}
              instructions={datasetData.instructions}
              wip={datasetData.wip}
              recoveredFees={datasetData.recoveredFees}
              enquiries={datasetData.enquiries}
              wipRangeKey={mattersWipRangeKey}
              wipRangeOptions={wipRangeDisplayOptions}
              onWipRangeChange={handleMattersWipRangeChange}
              wipRangeIsRefreshing={wipRangeIsRefreshing}
              dataWindowDays={mattersRangeDays}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'enquiries') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <EnquiriesReport 
              enquiries={datasetData.enquiries} 
              teamData={datasetData.teamData}
              annualLeave={datasetData.annualLeave}
              metaMetrics={datasetData.metaMetrics}
              deals={datasetData.deals}
              instructions={datasetData.instructions}
              reportingRangeKey={enquiriesRangeKey}
              reportingRangeLabel={describeRangeKey(enquiriesRangeKey)}
              reportingRangeOptions={enquiriesRangeDisplayOptions}
              onReportingRangeChange={handleEnquiriesRangeChange}
              reportingRangeIsRefreshing={enquiriesRangeIsRefreshing}
              dataWindowDays={enquiriesRangeDays}

              reportingRangeDatasets={enquiriesRangeActiveCoverage}
              triggerRefresh={refreshEnquiriesScoped}
              lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
              isFetching={isFetching}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'metaMetrics') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <MetaMetricsReport
              metaMetrics={datasetData.metaMetrics}
              enquiries={datasetData.enquiries}
              triggerRefresh={refreshMetaMetricsOnly}
              lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
              isFetching={isFetching}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'seoReport') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <SeoReport 
              cachedGa4Data={(datasetData.googleAnalytics ?? cachedData.googleAnalytics) || []}
              cachedChannelData={[]} // TODO: Add when channel data is cached
              cachedSourceMediumData={[]} // TODO: Add when source/medium data is cached
              cachedLandingPageData={[]} // TODO: Add when landing page data is cached
              cachedDeviceData={[]} // TODO: Add when device data is cached
            />
        </div>
      </div>
    );
  }

  if (activeView === 'ppcReport') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <PpcReport 
              cachedGoogleAdsData={(ppcGoogleAdsData ?? datasetData.googleAds ?? cachedData.googleAds) || []}
              ppcIncomeMetrics={ppcIncomeMetrics}
              isFetching={isFetching || ppcLoading}
              lastRefreshTimestamp={googleAdsLastRefreshTimestamp ?? undefined}
            />
        </div>
      </div>
    );
  }

  if (activeView === 'logMonitor') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <LogMonitor onBack={handleBackToOverview} />
      </div>
    );
  }

  return (
    <>
      <style>{spinnerStyle}</style>

      <div className="reporting-home-container" style={containerStyle(isDarkMode)}>
        <section style={{
          padding: '32px 28px',
          background: isDarkMode
            ? `linear-gradient(90deg, ${colours.dark.background} 0%, ${colours.dark.sectionBackground} 100%)`
            : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.light.background} 140%)`,
          border: `1px solid ${isDarkMode ? `${colours.highlight}33` : `${colours.highlight}26`}`,
          borderRadius: 16,
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 600, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? colours.dark.text : colours.light.text }}>
                Reporting workspace
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                {isActivelyLoading ? 'Refreshing data feeds...' : 'All systems ready'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DefaultButton
                  text={isActivelyLoading ? 'Refreshing…' : 'Refresh All Datasets'}
                  onClick={refreshDatasetsWithStreaming}
                  styles={{
                    root: {
                      borderRadius: 0,
                      padding: '0 16px',
                      height: 36,
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                      background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'transparent',
                      color: isDarkMode ? '#e2e8f0' : '#475569',
                      fontWeight: 500,
                      fontSize: 13,
                      fontFamily: 'Raleway, sans-serif',
                      transition: 'all 0.15s ease',
                    },
                    rootHovered: {
                      background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(148, 163, 184, 0.08)',
                      borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)',
                    },
                    icon: {
                      color: isDarkMode ? '#94a3b8' : '#64748b',
                      fontSize: 14,
                    },
                  }}
                  disabled={isActivelyLoading}
                  iconProps={{ iconName: 'Sync' }}
                />
                <TooltipHost content="Adjust global data window">
                  <span ref={refreshRangeButtonRef}>
                    <IconButton
                      ariaLabel="Adjust data window"
                      iconProps={{ iconName: 'Settings' }}
                      onClick={handleToggleRefreshRangeCallout}
                      styles={{
                        root: {
                          width: 36,
                          height: 36,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                          background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'transparent',
                          color: isDarkMode ? '#94a3b8' : '#64748b',
                          transition: 'all 0.15s ease',
                        },
                        rootHovered: {
                          background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(148, 163, 184, 0.08)',
                          color: isDarkMode ? '#e2e8f0' : '#475569',
                        },
                        icon: {
                          fontSize: 14,
                        },
                      }}
                    />
                  </span>
                </TooltipHost>
              </div>
              <PrimaryButton
                text='Open dashboard'
                onClick={handleLaunchDashboard}
                styles={{
                  root: {
                    borderRadius: 0,
                    padding: '0 18px',
                    height: 36,
                    background: colours.highlight,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    fontFamily: 'Raleway, sans-serif',
                    transition: 'all 0.15s ease',
                  },
                  rootHovered: {
                    background: '#2d7ab8',
                    boxShadow: '0 2px 8px rgba(54, 144, 206, 0.3)',
                  },
                  rootDisabled: {
                    background: isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.2)',
                  },
                  icon: {
                    color: '#ffffff',
                    fontSize: 14,
                  },
                }}
                disabled={isActivelyLoading || !canUseReports}
                iconProps={{ iconName: 'Forward' }}
              />
            </div>
          </div>

          {isRefreshRangeCalloutOpen && refreshRangeButtonRef.current && (
            <Callout
              target={refreshRangeButtonRef.current}
              onDismiss={handleCloseRefreshRangeCallout}
              setInitialFocus
              styles={{
                root: {
                  width: 360,
                  borderRadius: 16,
                  boxShadow: isDarkMode 
                    ? '0 25px 45px rgba(0, 0, 0, 0.5)' 
                    : '0 25px 45px rgba(15, 23, 42, 0.35)',
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(15, 23, 42, 0.08)'}`,
                  background: isDarkMode
                    ? `linear-gradient(90deg, ${colours.dark.sectionBackground}F2 0%, ${colours.dark.cardBackground}F2 100%)`
                    : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
                  backdropFilter: 'blur(24px) saturate(160%)',
                  padding: 0,
                },
                calloutMain: {
                  borderRadius: 16,
                  background: isDarkMode
                    ? `linear-gradient(90deg, ${colours.dark.sectionBackground}F2 0%, ${colours.dark.cardBackground}F2 100%)`
                    : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
                  color: isDarkMode ? '#e2e8f0' : '#0f172a',
                  padding: 0,
                },
                beak: {
                  background: isDarkMode
                    ? `linear-gradient(90deg, ${colours.dark.sectionBackground} 0%, ${colours.dark.cardBackground} 100%)`
                    : colours.light.sectionBackground,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(15, 23, 42, 0.1)'}`,
                  boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(15,23,42,0.15)',
                },
                beakCurtain: {
                  background: isDarkMode
                    ? `linear-gradient(90deg, ${colours.dark.sectionBackground}F2 0%, ${colours.dark.cardBackground}F2 100%)`
                    : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
                  borderRadius: 16,
                },
              }}
            >
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, color: isDarkMode ? '#cbd5e1' : '#64748b', opacity: isDarkMode ? 0.8 : 0.7 }}>
                    Reporting data window
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isDarkMode ? '#f8fafc' : '#0f172a', marginTop: 4 }}>
                    {enquiriesSliderHasPendingChange
                      ? `Pending: ${describeRangeKey(pendingEnquiriesRangeKey)}`
                      : `Active: ${describeRangeKey(enquiriesRangeKey)}`}
                  </div>
                </div>
                <Slider
                  min={0}
                  max={REPORT_RANGE_OPTIONS.length - 1}
                  step={1}
                  showValue={false}
                  value={enquiriesRangeSliderValue}
                  onChange={handleEnquiriesSliderValueChange}
                  styles={{
                    root: { margin: '10px 4px 0' },
                    slideBox: {
                      selectors: {
                        '::before': {
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.5)',
                        },
                      },
                    },
                    activeSection: {
                      background: isDarkMode ? colours.highlight : colours.missedBlue,
                      boxShadow: isDarkMode ? `0 0 8px ${colours.highlight}40` : 'none',
                    },
                    thumb: {
                      borderColor: isDarkMode ? colours.highlight : colours.missedBlue,
                      background: isDarkMode ? colours.highlight : colours.missedBlue,
                      boxShadow: isDarkMode ? `0 2px 8px ${colours.highlight}60` : 'none',
                    },
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {REPORT_RANGE_OPTIONS.map((option, index) => {
                    const isSelected = enquiriesRangeSliderValue === index;
                    return (
                      <span
                        key={option.key}
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected
                            ? (isDarkMode ? '#fff' : colours.missedBlue)
                            : (isDarkMode ? '#cbd5e1' : '#64748b'),
                          padding: '4px 12px',
                          borderRadius: 999,
                          border: isSelected
                            ? `1.5px solid ${isDarkMode ? colours.highlight : colours.missedBlue}`
                            : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'}`,
                          background: isSelected
                            ? (isDarkMode ? `${colours.highlight}30` : `${colours.missedBlue}15`)
                            : (isDarkMode ? 'rgba(71, 85, 105, 0.25)' : 'rgba(248, 250, 252, 0.9)'),
                          transition: 'all 0.2s ease',
                          cursor: 'default',
                        }}
                      >
                        {option.label}
                      </span>
                    );
                  })}
                </div>
                {(enquiriesCoverageEntriesForDisplay.length > 0 || mattersCoverageEntriesForDisplay.length > 0) && (
                  <div style={{
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(191, 219, 254, 0.35)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 12,
                    color: isDarkMode ? '#e2e8f0' : '#0f172a',
                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(59, 130, 246, 0.15)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.8 }}>
                      Data window coverage
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[...enquiriesCoverageEntriesForDisplay, ...mattersCoverageEntriesForDisplay].map((entry) => (
                        <div
                          key={entry.key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            fontSize: 12,
                            fontWeight: 500,
                            color: isDarkMode ? '#cbd5e1' : '#1f2937',
                            paddingBottom: 6,
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(59, 130, 246, 0.1)'}`,
                          }}
                        >
                          <span>{entry.label}</span>
                          <span style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>{entry.range}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <PrimaryButton
                    text={enquiriesSliderHasPendingChange ? `Apply ${describeRangeKey(pendingEnquiriesRangeKey)}` : 'Range active'}
                    onClick={handleApplyGlobalRangeFromCallout}
                    disabled={!enquiriesSliderHasPendingChange || enquiriesRangeIsRefreshing}
                    styles={primaryButtonStyles(isDarkMode)}
                  />
                  <DefaultButton
                    text="Close"
                    onClick={handleCloseRefreshRangeCallout}
                    styles={subtleButtonStyles(isDarkMode)}
                  />
                </div>
              </div>
            </Callout>
          )}

          {resumeNotice && (
            <div
              style={{
                marginBottom: 18,
                padding: '14px 18px',
                borderRadius: 14,
                border: `1px solid ${isDarkMode ? 'rgba(147, 197, 253, 0.35)' : 'rgba(59, 130, 246, 0.25)'}`,
                background: isDarkMode ? 'rgba(30, 64, 175, 0.35)' : 'rgba(191, 219, 254, 0.4)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <FontIcon
                iconName="SyncStatus"
                style={{
                  fontSize: 18,
                  color: isDarkMode ? '#bfdbfe' : '#1d4ed8',
                  marginTop: 2,
                }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: isDarkMode ? '#e0f2fe' : '#1d4ed8' }}>
                  Resuming refresh
                </span>
                <span style={{ fontSize: 13, color: isDarkMode ? '#f8fafc' : '#0f172a', lineHeight: 1.4 }}>
                  {resumeNotice.message}
                </span>
                <span style={{ fontSize: 11, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(31, 41, 55, 0.8)' }}>
                  {progressDetailText}
                </span>
              </div>
              <button
                type="button"
                onClick={dismissResumeNotice}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: isDarkMode ? '#bfdbfe' : '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
                aria-label="Dismiss resume notice"
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(71, 85, 105, 0.85)',
              }}
            >
              Available reports
            </h3>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                color: isDarkMode ? '#60a5fa' : colours.highlight,
              }}
            >
              {readyCount}/{datasetSummaries.length} feeds ready
            </span>
          </div>

          {renderAvailableReportCards()}
        </section>

      {/* Notes & Suggestions Box - only show in development */}
      {isLocalhost && (
        <section style={sectionSurfaceStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <FontIcon
              iconName="Lightbulb"
              style={{
                fontSize: 14,
                color: isDarkMode ? colours.accent : colours.missedBlue,
              }}
            />
            <h2 style={sectionTitleStyle}>quick thoughts..</h2>
          </div>
          
          <NotesAndSuggestionsBox isDarkMode={isDarkMode} />
        </section>
      )}

      {/* Marketing Data Settings removed (GA4 and Google Ads now follow enquiries range) */}
      </div>
    </>
  );
};

// Notes and Suggestions Component
interface NotesAndSuggestionsBoxProps {
  isDarkMode: boolean;
}

const NotesAndSuggestionsBox: React.FC<NotesAndSuggestionsBoxProps> = ({ isDarkMode }) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);

  const handleSubmit = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    
    try {
      const emailBody = `
        <div style="font-family: Raleway, Arial, sans-serif; line-height: 1.6; color: #333;">
          <h3 style="color: #3690CE; margin-bottom: 16px;">Quick idea from the dashboard</h3>
          
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #87F3F3; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 14px;"><strong>Submitted:</strong> ${new Date().toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric', 
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>

          <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px; color: #475569;">Message:</h4>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>

          <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <strong>Source:</strong> Helix Hub - Reporting Dashboard<br>
            <strong>User:</strong> Teams App User<br>
            <strong>Timestamp:</strong> ${new Date().toISOString()}
          </div>
        </div>
      `;

      const response = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_contents: emailBody,
          user_email: 'automations@helix-law.com',
          subject: `dashboard idea - ${new Date().toLocaleDateString('en-GB')}`,          from_email: 'automations@helix-law.com'
        })
      });

      if (response.ok) {
        setMessage('');
        setLastSent(Date.now());
      } else {
        throw new Error('Failed to send feedback');
      }
    } catch (error) {
      console.error('Failed to send feedback:', error);
      alert('Failed to send feedback. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const canSubmit = message.trim().length > 0 && !isSending;
  const showSuccessMessage = lastSent && (Date.now() - lastSent) < 5000; // Show for 5 seconds

  return (
    <div style={{
      background: isDarkMode ? 'linear-gradient(135deg, #0f172a 0%, #1a2a3a 100%)' : 'rgba(248, 250, 252, 0.8)',
      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.15)'}`,
      borderRadius: 12,
      padding: 20,
    }}>


      {showSuccessMessage && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
          border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)'}`,
          color: isDarkMode ? '#86efac' : '#166534',
          fontSize: 12,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <FontIcon iconName="CheckMark" style={{ fontSize: 10 }} />
          thanks! sent that through 🚀
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="got an idea, something not quite right? just drop it here"
        disabled={isSending}
        style={{
          width: '100%',
          minHeight: 80,
          padding: 12,
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.2)'}`,
          borderRadius: 8,
          background: isDarkMode ? '#1e293b' : '#ffffff',
          color: isDarkMode ? '#f1f5f9' : '#1f2937',
          fontSize: 13,
          fontFamily: 'Raleway, Arial, sans-serif',
          resize: 'vertical',
          outline: 'none',
          transition: 'all 0.2s ease',
          marginBottom: 12,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = colours.accent;
          e.target.style.boxShadow = `0 0 0 2px ${colours.accent}20`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
          e.target.style.boxShadow = 'none';
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 11,
          color: isDarkMode ? '#94a3b8' : '#64748b',
          opacity: 0.8,
        }}>
          quick way to share ideas and feedback
        </span>
        
        <DefaultButton
          text={isSending ? 'Sending...' : 'send it'}
          onClick={handleSubmit}
          disabled={!canSubmit}
          iconProps={isSending ? undefined : { iconName: 'Send' }}
          styles={{
            root: {
              borderRadius: 0,
              padding: '0 16px',
              height: 36,
              background: canSubmit 
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)'),
              color: canSubmit 
                ? colours.accent 
                : (isDarkMode ? '#64748b' : '#94a3b8'),
              border: `1px solid ${canSubmit 
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(135, 243, 243, 0.2)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
              fontWeight: 600,
              fontSize: 12,
              boxShadow: 'none',
              transition: 'all 0.15s ease',
              fontFamily: 'Raleway, sans-serif',
            },
            rootHovered: canSubmit ? {
              background: isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(135, 243, 243, 0.15)',
              borderColor: isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)',
            } : {},
            rootPressed: canSubmit ? {
              background: isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(135, 243, 243, 0.2)',
            } : {},
          }}
        />
      </div>
    </div>
  );
};

export default ReportingHome;
