import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import './ReportingScroll.css';
import { ActionButton, DefaultButton, PrimaryButton, IconButton } from '@fluentui/react/lib/Button';
import { Modal } from '@fluentui/react/lib/Modal';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { FontIcon } from '@fluentui/react/lib/Icon';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { Slider } from '@fluentui/react/lib/Slider';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { Callout } from '@fluentui/react/lib/Callout';
import { FaChartLine, FaClipboardList, FaFolderOpen, FaInbox, FaChartArea, FaPhoneAlt, FaSearchDollar } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import type { Enquiry, Matter, TeamData, UserData } from '../../app/functionality/types';
import { endOfDay, format, startOfDay, subMonths } from 'date-fns';
import ManagementDashboard, { WIP } from './ManagementDashboard';
import AnnualLeaveReport, { AnnualLeaveRecord } from './AnnualLeaveReport';
// Meta is intentionally off across the Reports tab — no tile, no nav entry, no
// render block, no fetch. Re-import MetaMetricsReport here if it is ever
// resurrected. The component file remains so type re-exports keep compiling.
import SeoReport from './SeoReport';
import PpcReport from './PpcReport';
import MarketingPerformanceReport from './MarketingPerformanceReport';
import MattersReport from './MattersReport';
import { debugLog, debugWarn } from '../../utils/debug';
import { getNormalizedEnquirySource } from '../../utils/enquirySource';
import HomePreview from './HomePreview';
import EnquiriesReport, { MarketingMetrics } from './EnquiriesReport';
// MetaMetricsReport import removed — Meta surface is fully gated off in the
// Reports tab (see AVAILABLE_REPORTS, REPORT_NAV_TABS, and the activeView
// switch). Re-add the import alongside re-adding the entry below if Meta is
// ever resurrected as a real report.
import LogMonitor from './LogMonitor';
import CacheMonitor from './CacheMonitor';
import AgedDebtsReport from './AgedDebtsReport';
import SyncHistory from './SyncHistory';
import ResponseTimeReport from './ResponseTimeReport';
import ManagementAccessIndicator from './ManagementAccessIndicator';
import ReportingPulseStrip from './ReportingPulseStrip';
import type { ReadinessOverall } from './readiness.types';
import {
  useReportingReadiness,
  getTrustCheckId,
  deriveTrustState,
  findTrustCheck,
  MANAGEMENT_ENTRY_CHECK_IDS,
  formatReadinessBlockerDetail,
  registerManagementBlockerSimulationControls,
  simulateManagementBlocker,
  clearManagementBlockerSimulation,
} from './reportTrust';
import { useReadinessRemediate } from './useReadinessRemediate';
import { useStreamingDatasets } from '../../hooks/useStreamingDatasets';
import { fetchWithRetry, fetchJSON } from '../../utils/fetchUtils';
import { buildRequestAuthHeaders } from '../../utils/requestAuthContext';
import { canSeePrivateHubControls, isAdminUser, canUseSessionModeControls } from '../../app/admin';
import type { LocalSupportSettings } from '../../app/localSupportMode';
import { useEffectivePermissions } from '../../app/effectivePermissions';
import markDark from '../../assets/dark blue mark.svg';
import markWhite from '../../assets/markwhite.svg';
import type { PpcIncomeMetrics, PpcMatchKind } from './types/ppc';
import { useToast } from '../../components/feedback/ToastProvider';
import type { DealRecord, InstructionRecord, DubberCallRecord } from './dataSources';
import { reportingPanelBackground, reportingPanelBorder } from './styles/reportingFoundation';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import CallsReport from './CallsReport';
import ReceptionReport, { type ReceptionKpisResponse } from './ReceptionReport';
import EnquiryLedgerReport from './EnquiryLedgerReport';
import ReportCard from './ReportCard';
import { ReportProcessingRailItemCard, type ReportProcessingRailItem, type ReportProcessingRailRow, type ReportProcessingRailStatus } from './components/ReportProcessingRail';
import AccessMatrixConnector from './components/AccessMatrixConnector';
import { type RangeKey as ReportShellRangeKey } from './hooks/useReportRange';
import { checkIsLocalDev } from '../../utils/useIsLocalDev';
import { REPORTING_DATASET_DEFINITIONS, type ReportingDatasetKey } from './reportingDatasets';
import {
  getReportingDatasetActivitySnapshot,
  recordReportingDatasetActivity,
  subscribeReportingDatasetActivity,
  type ReportingDatasetActivitySnapshot,
} from '../../utils/reportingDatasetActivity';

const DataCentre = React.lazy(() => import('./DataCentre'));

// Reception report is locked to call-taker-owning partners only.
// Source of truth for who can see it; mirrored in the tab strip, the card grid,
// and the in-view lock screen below.
const RECEPTION_REPORT_ALLOWED_INITIALS = ['LZ', 'AC', 'JW', 'KW'];
const canSeeReceptionReport = (initials: string | null | undefined): boolean => {
  const value = (initials || '').trim().toUpperCase();
  return value !== '' && RECEPTION_REPORT_ALLOWED_INITIALS.includes(value);
};

const RECEPTION_REPORT_DEFAULT_RANGE_KEY: ReportShellRangeKey = 'month';
const RECEPTION_REPORT_FETCH_OPTIONS = {
  credentials: 'include' as const,
  timeout: 45000,
  retries: 1,
  retryDelay: 1200,
  retryStatuses: [408, 425, 429, 500, 502, 503, 504],
};

const receptionReportHasData = (payload: ReceptionKpisResponse | null | undefined): boolean => {
  if (!payload) return false;
  return Boolean(
    (payload.handlers?.length ?? 0) > 0
    || (payload.evidence?.totalRows ?? 0) > 0
    || (payload.conversionStages?.callsLogged ?? 0) > 0
    || (payload.phonePickups?.totals?.calls ?? 0) > 0
    || (payload.totals?.callsTaken ?? 0) > 0
    || (payload.totals?.callsHandled ?? 0) > 0
  );
};

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

@keyframes helix-card-land {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  60% {
    opacity: 1;
    transform: translateY(-3px) scale(1.008);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes helix-status-pop {
  0% { transform: scale(0.85); opacity: 0.6; }
  55% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes feedDotReady {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.35); }
  65%  { transform: scale(0.9); }
  100% { transform: scale(1); }
}

@keyframes feedTickDraw {
  0%   { stroke-dashoffset: 8; opacity: 0; }
  40%  { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes feedDotSpin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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

const REPORT_RANGE_OPTIONS: Array<{ key: ReportRangeKey; label: string; shortLabel: string; months: number }> = [
  { key: '3m', label: '90 days', shortLabel: '90 D', months: 3 },
  { key: '6m', label: '6 months', shortLabel: '6 M', months: 6 },
  { key: '12m', label: '1 year', shortLabel: '1 Y', months: 12 },
  { key: '24m', label: '2 years', shortLabel: '2 Y', months: 24 },
];

const MATTERS_WIP_RANGE_OPTIONS = REPORT_RANGE_OPTIONS;

type EntrySnapshotMetricKey = 'enquiries' | 'matters' | 'instructions' | 'wip' | 'collected';
type EntrySnapshotMetricKind = 'count' | 'currency';

interface EntrySnapshotMetric {
  key: EntrySnapshotMetricKey;
  label: string;
  kind: EntrySnapshotMetricKind;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
  projected: number;
  note: string;
  conversionNote?: string;
}

interface EntrySnapshotChartModel {
  currentLine: string;
  previousLine: string;
  projectionLine: string;
  currentArea: string;
  maxValue: number;
}

interface EntrySnapshotModel {
  currentLabel: string;
  previousLabel: string;
  elapsedDays: number;
  daysInMonth: number;
  pipeline: EntrySnapshotMetric[];
  money: EntrySnapshotMetric[];
  collectedChart: EntrySnapshotChartModel;
  readyCount: number;
  totalFeeds: number;
}

// Compatibility shim for stale hot-reload closures that may still reference
// the old preview metric symbol after local module replacement.
const KPI_PREVIEW_METRICS: Array<{ label: string; value: string; note: string }> = [];

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
const formatDateForRangeLabel = (date: Date) => format(date, 'd MMM yyyy');

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

const getReceptionReportWindow = (key: ReportRangeKey) => {
  const range = computeRangeWindowByKey(key);
  return {
    range,
    from: formatDateForQuery(range.start),
    to: formatDateForQuery(range.end),
  };
};

const describeRangeWindowByKey = (key: ReportRangeKey) => {
  const range = computeRangeWindowByKey(key);
  return `${formatDateForRangeLabel(range.start)} to ${formatDateForRangeLabel(range.end)}`;
};

const RANGE_REFRESH_ESTIMATES: Record<string, Record<ReportRangeKey, string>> = {
  dashboard: {
    '3m': '~16s',
    '6m': '~24s',
    '12m': '~38s',
    '24m': '~58s',
  },
  marketingPerformance: {
    '3m': '~9s',
    '6m': '~13s',
    '12m': '~19s',
    '24m': '~29s',
  },
  receptionReport: {
    '3m': '~6s',
    '6m': '~8s',
    '12m': '~11s',
    '24m': '~16s',
  },
  seo: {
    '3m': '~7s',
    '6m': '~10s',
    '12m': '~14s',
    '24m': '~21s',
  },
  enquiries: {
    '3m': '~8s',
    '6m': '~11s',
    '12m': '~16s',
    '24m': '~24s',
  },
  default: {
    '3m': '~9s',
    '6m': '~12s',
    '12m': '~17s',
    '24m': '~25s',
  },
};

const normalizeRangeEstimateOwner = (ownerKey?: string | null) => {
  switch (ownerKey) {
    case 'dashboard':
    case 'marketingPerformance':
    case 'receptionReport':
    case 'enquiries':
      return ownerKey;
    case 'seo':
    case 'seoReport':
      return 'seo';
    default:
      return 'default';
  }
};

const getRangeRefreshEstimate = (key: ReportRangeKey, ownerKey?: string | null) => {
  const owner = normalizeRangeEstimateOwner(ownerKey);
  return RANGE_REFRESH_ESTIMATES[owner]?.[key] ?? RANGE_REFRESH_ESTIMATES.default[key];
};

const getRangeOptionTitle = (key: ReportRangeKey, ownerKey?: string | null) => `${describeRangeWindowByKey(key)}. Est. refresh ${getRangeRefreshEstimate(key, ownerKey)}.`;

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
    // Meta Ads feed intentionally omitted — Meta is off across the Reports tab.
    { key: 'googleAnalytics', label: 'Google Analytics', range: rangeLabel },
    { key: 'googleAds', label: 'Google Ads', range: rangeLabel },
  ];
};

const buildMarketingCoverageEntries = (key: ReportRangeKey): ReportingRangeDatasetInfo[] => {
  const rangeLabel = describeRangeKey(key);
  return [
    { key: 'googleAnalytics', label: 'Google Analytics', range: rangeLabel },
    { key: 'googleAds', label: 'Google Ads', range: rangeLabel },
    { key: 'enquiries', label: 'Enquiries feed', range: rangeLabel },
    { key: 'allMatters', label: 'Matters feed', range: rangeLabel },
    { key: 'recoveredFees', label: 'Collected fees', range: rangeLabel },
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
  annualLeave: null,
  metaMetrics: null,
  googleAnalytics: null,
  googleAds: null,
  deals: null,
  instructions: null,
  emailLists: null,
  dubberCalls: null,
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
  const legacyDateParts = !trimmed.includes('T')
    ? trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s|$)/)
    : null;
  const normalised = legacyDateParts
    ? (() => {
      const [, day, month, year] = legacyDateParts;
      const dayNumber = Number(day);
      const monthNumber = Number(month);
      if (dayNumber < 1 || dayNumber > 31 || monthNumber < 1 || monthNumber > 12) {
        return trimmed;
      }
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

const canSeeReportsDevPreview = (user?: UserData | null): boolean => {
  if (!user) return false;
  const initials = user.Initials?.toUpperCase().trim();
  const first = user.First?.toLowerCase().trim();
  const nickname = user.Nickname?.toLowerCase().trim();
  const email = user.Email?.toLowerCase().trim();
  return Boolean(
    canSeePrivateHubControls(user) ||
    initials === 'AC' ||
    first === 'alex' ||
    nickname === 'alex' ||
    email === 'ac@helix-law.com'
  );
};

const canSeeDataHubProdAudience = (user?: UserData | null): boolean => {
  if (!user) return false;
  const initials = user.Initials?.toUpperCase().trim();
  const first = user.First?.toLowerCase().trim();
  const nickname = user.Nickname?.toLowerCase().trim();
  const email = user.Email?.toLowerCase().trim();
  return Boolean(
    initials === 'LZ'
    || initials === 'AC'
    || first === 'luke'
    || first === 'alex'
    || nickname === 'luke'
    || nickname === 'alex'
    || email === 'lz@helix-law.com'
    || email === 'ac@helix-law.com'
  );
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

    const coerceBoolean = (value: unknown): boolean | undefined => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (value == null) {
        return undefined;
      }
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) {
        return undefined;
      }
      if (['1', 'true', 'yes'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no'].includes(normalized)) {
        return false;
      }
      return undefined;
    };

    const readTimestamp = (value: unknown): string | undefined => {
      if (typeof value !== 'string') {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    acc.push({
      request_id: requestId,
      fe: personCandidate,
      start_date: String(startCandidate),
      end_date: String(endCandidate),
      reason: typeof item.reason === 'string' ? item.reason : '',
      status: typeof item.status === 'string' ? item.status : '',
      days_taken: toNumberSafe(item.days_taken),
      leave_type: typeof item.leave_type === 'string' ? item.leave_type : undefined,
      half_day_start: coerceBoolean(item.half_day_start),
      half_day_end: coerceBoolean(item.half_day_end),
      rejection_notes: rejectionNotes,
      hearing_confirmation: hearingConfirmation,
      hearing_details: hearingDetails,
      requested_at: readTimestamp(item.requested_at),
      approved_at: readTimestamp(item.approved_at),
      booked_at: readTimestamp(item.booked_at),
      updated_at: readTimestamp(item.updated_at),
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

const hasPpcEnquirySignal = (enquiry: Enquiry): boolean => {
  const sourceValue = (enquiry as any).Ultimate_Source
    ?? (enquiry as any).source
    ?? (enquiry as any).Source;
  if (isPpcSourceLabel(sourceValue)) {
    return true;
  }

  const gclid = normaliseKey((enquiry as any).GCLID ?? (enquiry as any).gclid);
  if (gclid) {
    return true;
  }

  const url = normaliseKey((enquiry as any).Referral_URL ?? (enquiry as any).referral_url ?? (enquiry as any).url);
  if (!url) {
    return false;
  }

  return (
    url.includes('gclid=') ||
    (url.includes('utm_source=google') && (url.includes('utm_medium=cpc') || url.includes('utm_medium=ppc')))
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

const toNormalisedKeySet = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  values.forEach((value) => {
    const key = normaliseKey(value);
    if (key) {
      seen.add(key);
    }
  });
  return Array.from(seen);
};

const extractInstructionAssociationKeys = (instruction: InstructionRecord | undefined): string[] => {
  if (!instruction) {
    return [];
  }

  return toNormalisedKeySet([
    instruction.InstructionRef,
    instruction.MatterId,
    (instruction as any).MatterID,
    instruction.ClientId,
    (instruction as any).matter_ref,
  ]);
};

const extractMatterAssociationKeys = (matter: Matter, identifiers?: ReturnType<typeof extractMatterIdentifiers>): string[] => {
  const resolved = identifiers ?? extractMatterIdentifiers(matter);
  return toNormalisedKeySet([
    ...resolved.variants,
    (matter as any).InstructionRef,
    (matter as any).ClientID,
    (matter as any).ClientId,
    (matter as any).MatterRef,
    (matter as any)['Matter Ref'],
  ]);
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

const isCollectedFeeRow = (row: RecoveredFee): boolean => {
  const kind = typeof row.kind === 'string' ? row.kind.trim().toLowerCase() : '';
  return kind !== 'expense' && kind !== 'product';
};

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

interface GoogleAdsApiResponse {
  success?: boolean;
  data?: GoogleAdsData[];
  dateRange?: {
    start: string;
    end: string;
    daysIncluded?: number;
  };
  source?: string;
  error?: string;
}

interface DatasetMap {
  userData: UserData[] | null;
  teamData: TeamData[] | null;
  enquiries: Enquiry[] | null;
  allMatters: Matter[] | null;
  wip: WIP[] | null;
  recoveredFees: RecoveredFee[] | null;
  annualLeave: AnnualLeaveRecord[] | null;
  metaMetrics: MarketingMetrics[] | null;
  googleAnalytics: GoogleAnalyticsData[] | null;
  googleAds: GoogleAdsData[] | null;
  deals: DealRecord[] | null;
  instructions: InstructionRecord[] | null;
  emailLists: unknown[] | null;
  dubberCalls: DubberCallRecord[] | null;
}

interface AnnualLeaveFetchResult {
  records: AnnualLeaveRecord[];
  current: AnnualLeaveRecord[];
  future: AnnualLeaveRecord[];
  team: TeamData[];
  userDetails?: Record<string, unknown>;
}

interface AnnualLeaveFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelay?: number;
}

const DATASETS = REPORTING_DATASET_DEFINITIONS;

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

interface SpecificRefreshOptions {
  rangeOverrides?: GlobalRangeOverrides;
  bypassCooldown?: boolean;
}

const MATTERS_RANGE_DATASETS: DatasetKey[] = ['allMatters', 'wip', 'recoveredFees'];
const ENQUIRIES_RANGE_DATASETS: DatasetKey[] = ['enquiries', 'deals', 'instructions'];
const MATTERS_REPORT_REFRESH_DATASETS: DatasetKey[] = [...MATTERS_RANGE_DATASETS, 'deals', 'instructions'];
const ENQUIRIES_REPORT_DATASETS: DatasetKey[] = ['enquiries', 'teamData', 'annualLeave', 'deals', 'instructions'];
const ENQUIRY_LEDGER_REPORT_DATASETS: DatasetKey[] = ['enquiries', 'deals', 'instructions'];
// META_REPORT_DATASETS removed — Meta report tile is gated off across the
// Reports tab. Re-add alongside the AVAILABLE_REPORTS entry if Meta returns.
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
  action?: 'dashboard' | 'annualLeave' | 'enquiries' | 'enquiryLedger' | 'metaMetrics' | 'seoReport' | 'ppcReport' | 'marketingPerformance' | 'matters' | 'logMonitor' | 'calls' | 'receptionReport';
  requiredDatasets: DatasetKey[];
  description?: string;
  disabled?: boolean;
  development?: boolean;
  // Tier (rollout ladder, see .github/copilot-instructions.md §User Tiers):
  //   tier: 'prod'        → visible to every reports user (default for live reports).
  //   tier: 'devPreview'  → visible only to dev-preview audience (LZ + AC) until promoted.
  // Anything not yet trusted in production should be 'devPreview' so the Reports
  // entry surface stays focused on what works and we don't pay the dataset cost
  // (Meta ads / GA4 / Google Ads / calls) for users who can't open those tiles.
  tier?: 'prod' | 'devPreview';
}

const AVAILABLE_REPORTS: AvailableReport[] = [
  {
    key: 'dashboard',
    name: 'Management dashboard',
    status: 'Live today',
    action: 'dashboard',
    requiredDatasets: ['enquiries', 'allMatters', 'wip', 'recoveredFees', 'teamData', 'userData'],
    tier: 'prod',
  },
  {
    key: 'receptionReport',
    name: 'Reception Performance',
    status: 'Evidence live',
    action: 'receptionReport',
    requiredDatasets: ['dubberCalls', 'enquiries', 'teamData'],
    tier: 'prod',
  },
  {
    key: 'marketingPerformance',
    name: 'Marketing',
    status: 'Live draft',
    action: 'marketingPerformance',
    requiredDatasets: ['googleAnalytics', 'googleAds', 'enquiries', 'allMatters', 'recoveredFees'],
    tier: 'devPreview',
  },
  {
    key: 'seo',
    name: 'SEO report',
    status: '',
    description: 'Organic search performance, attributable enquiries, matters, and fee outcome across the selected window.',
    action: 'seoReport',
    requiredDatasets: ['googleAnalytics', 'enquiries', 'allMatters'],
    tier: 'devPreview',
  },
  {
    key: 'enquiries',
    name: 'Enquiries report',
    status: 'In development',
    action: 'enquiries',
    requiredDatasets: ENQUIRIES_REPORT_DATASETS,
    development: true,
    tier: 'devPreview',
  },
  {
    key: 'enquiryLedger',
    name: 'Enquiry ledger',
    status: 'Draft',
    action: 'enquiryLedger',
    requiredDatasets: ENQUIRY_LEDGER_REPORT_DATASETS,
    development: true,
    tier: 'devPreview',
  },
  {
    key: 'annualLeave',
    name: 'Annual leave report',
    status: 'Draft',
    action: 'annualLeave',
    requiredDatasets: ['annualLeave', 'teamData'],
    disabled: true,
    tier: 'devPreview',
  },
  {
    key: 'matters',
    name: 'Matters',
    status: 'Draft',
    action: 'matters',
    requiredDatasets: MATTERS_REPORT_REFRESH_DATASETS,
    disabled: true,
    tier: 'devPreview',
  },
  // Meta ads tile intentionally removed — Meta is off across the Reports tab.
  // The Meta dataset, fetch path, and render block are also gated below.
  {
    key: 'ppc',
    name: 'PPC report',
    status: 'Draft',
    action: 'ppcReport',
    requiredDatasets: ['googleAds', 'enquiries', 'allMatters', 'recoveredFees'],
    disabled: true,
    tier: 'devPreview',
  },
  {
    key: 'calls',
    name: 'Calls report',
    status: 'In development',
    action: 'calls',
    requiredDatasets: ['dubberCalls', 'teamData'],
    development: true,
    tier: 'devPreview',
  },
  // logMonitor is not a report â€” rendered separately as a utility strip below the reports grid
];

// Datasets that are only consumed by dev-preview reports. We strip these from
// the streaming pull and the visible "feeds ready" strip for non-dev users so
// that a flaky third-party endpoint (Meta / GA4 / Google Ads / Dubber) cannot
// stall the Reports entry surface for the rest of the firm.
const DEV_PREVIEW_ONLY_DATASETS: ReadonlySet<DatasetKey> = new Set([
  'metaMetrics',
  'googleAnalytics',
  'googleAds',
  'dubberCalls',
]);

const REPORT_DATASET_REQUIREMENTS = AVAILABLE_REPORTS.reduce<Record<string, DatasetKey[]>>((acc, report) => {
  acc[report.key] = report.requiredDatasets;
  return acc;
}, {});

const MANAGEMENT_DATASET_KEYS = DATASETS.map((dataset) => dataset.key);
const GLOBAL_STREAM_DATASETS: StreamingDatasetKey[] = [
  ...MANAGEMENT_DATASET_KEYS.filter((key) => key !== 'annualLeave' && key !== 'emailLists'),
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
    darkBg: 'rgba(32, 178, 108, 0.28)',
    dot: colours.green,
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
    lightBg: `${colours.subtleGrey}29`,
    darkBg: `${colours.dark.borderColor}47`,
    dot: colours.subtleGrey,
    label: 'Error',
    icon: 'WarningSolid',
  },
  idle: {
    lightBg: `${colours.subtleGrey}29`,
    darkBg: `${colours.dark.borderColor}47`,
    dot: colours.subtleGrey,
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

const brandSignal = (isDarkMode: boolean): string => (
  isDarkMode ? colours.blue : colours.highlight
);

const brandSurfaceLift = (isDarkMode: boolean): string => (
  isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground
);

const surfaceShadow = (isDarkMode: boolean): string => (
  isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.12)' : '0 1px 4px rgba(6, 23, 51, 0.04)'
);

const subtleStroke = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)'
);

/** Frosted glass surface â€” matches nav bar language */
const glassSurface = (isDarkMode: boolean): CSSProperties => ({
  backdropFilter: 'blur(20px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
});

const containerStyle = (isDarkMode: boolean): CSSProperties => ({
  minHeight: '100vh',
  width: '100%',
  padding: '24px 28px 36px',
  background: isDarkMode ? colours.websiteBlue : colours.light.background,
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  transition: 'background 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease',
  fontFamily: 'Raleway, sans-serif',
});

const sectionSurfaceStyle = (isDarkMode: boolean, overrides: CSSProperties = {}): CSSProperties => ({
  background: isDarkMode ? 'rgba(6, 23, 51, 0.65)' : 'rgba(255, 255, 255, 0.72)',
  ...glassSurface(isDarkMode),
  borderRadius: 0,
  border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(6, 23, 51, 0.06)'}`,
  boxShadow: surfaceShadow(isDarkMode),
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  transition: 'background 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease',
  animation: 'fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
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
  opacity: isHovered ? (isDarkMode ? 0.18 : 0.1) : (isDarkMode ? 0.1 : 0.05),
  pointerEvents: 'none',
  zIndex: 0,
  transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
});

const heroRightOverlayStyle = (isDarkMode: boolean): CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  width: 80,
  height: '100%',
  background: isDarkMode ? `${colours.darkBlue}33` : `${colours.darkBlue}05`,
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
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  background: isDarkMode ? 'rgba(10, 28, 50, 0.6)' : 'rgba(255, 255, 255, 0.7)',
  ...glassSurface(isDarkMode),
  opacity: animationIndex !== undefined ? 0 : 1,
  animation: animationIndex !== undefined ? 'fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
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
  color: brandSignal(isDarkMode),
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
  background: isDarkMode ? 'rgba(10, 28, 50, 0.55)' : 'rgba(255, 255, 255, 0.65)',
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
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
  padding: '3px 10px',
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 600,
  background: isDarkMode ? palette.darkBg : palette.lightBg,
  color: isDarkMode ? colours.dark.text : colours.helixBlue,
  boxShadow: 'none',
  letterSpacing: 0.2,
});

const statusDotStyle = (colour: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: colour,
});

const statusIconStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 12,
  color: isDarkMode ? colours.dark.text : colours.helixBlue,
});

const reportCardsGridStyle = (): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 10,
  marginTop: 4,
});

const reportCardBaseStyle = (isDarkMode: boolean): CSSProperties => ({
  borderRadius: 0,
  padding: 16,
  background: isDarkMode ? 'rgba(8, 28, 48, 0.55)' : 'rgba(255, 255, 255, 0.6)',
  ...glassSurface(isDarkMode),
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 150,
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
    accent: colours.green,
    lightBadgeBg: 'rgba(32, 178, 108, 0.15)',
    darkBadgeBg: 'rgba(32, 178, 108, 0.28)',
  },
  warming: {
    label: 'Fetching...',
    accent: colours.blue,
    lightBadgeBg: 'rgba(54, 144, 206, 0.15)',
    darkBadgeBg: 'rgba(54, 144, 206, 0.28)',
  },
  neutral: {
    label: 'Needs data',
    accent: colours.subtleGrey,
    lightBadgeBg: `${colours.subtleGrey}2E`,
    darkBadgeBg: `${colours.dark.borderColor}52`,
  },
  disabled: {
    label: 'Disabled',
    accent: colours.subtleGrey,
    lightBadgeBg: 'rgba(160, 160, 160, 0.12)',
    darkBadgeBg: 'rgba(160, 160, 160, 0.18)',
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
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 500,
  background: isDarkMode ? 'rgba(10, 28, 50, 0.55)' : 'rgba(244, 244, 246, 0.8)',
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  color: isDarkMode ? colours.dark.text : colours.light.text,
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
    return text.length > 320 ? text.slice(0, 320) + '...' : text;
  } catch {
    return String(row);
  }
};

const refreshProgressPanelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '14px 16px',
  borderRadius: 0,
  background: isDarkMode ? 'rgba(14, 36, 62, 0.6)' : 'rgba(255, 255, 255, 0.75)',
  ...glassSurface(isDarkMode),
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: 'none',
});

const refreshProgressHeaderStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  color: isDarkMode ? colours.dark.text : colours.helixBlue,
});

const refreshProgressDetailStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 12,
  color: isDarkMode ? 'rgba(243, 244, 246, 0.82)' : 'rgba(6, 23, 51, 0.72)',
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
  borderRadius: 0,
  background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(244, 244, 246, 0.65)',
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  gap: 10,
});

const refreshProgressDatasetLabelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  fontWeight: 600,
  color: isDarkMode ? colours.dark.text : colours.helixBlue,
});

const refreshProgressDatasetStatusStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  fontWeight: 600,
  color: isDarkMode ? 'rgba(243, 244, 246, 0.74)' : 'rgba(6, 23, 51, 0.64)',
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
  background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(255, 255, 255, 0.6)',
  ...glassSurface(isDarkMode),
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: 'none',
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
  color: isDarkMode ? 'rgba(243, 244, 246, 0.7)' : 'rgba(13, 47, 96, 0.7)',
  fontSize: 11,
  letterSpacing: 0.2,
});

const heroDescriptionStyle = (isDarkMode: boolean): CSSProperties => ({
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: isDarkMode ? 'rgba(243, 244, 246, 0.82)' : 'rgba(6, 23, 51, 0.78)',
});

const heroMetaChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 2,
  background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(255, 255, 255, 0.7)',
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: 'none',
  color: isDarkMode ? colours.dark.text : colours.helixBlue,
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
  background: isDarkMode ? colours.websiteBlue : colours.light.background,
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  transition: 'background 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease',
  position: 'relative',
  overflow: 'hidden',
});

type ButtonState = 'neutral' | 'warming' | 'ready';

interface ReportDependency {
  key: DatasetKey;
  name: string;
  status: DatasetStatusValue;
  range: string;
  /** Per-source trust verdict (passed/stale/failed/checking/repairing/unsupported). */
  trust?: 'unsupported' | 'checking' | 'passed' | 'stale' | 'failed' | 'repairing';
  /** Operator-facing reason copy for tooltips. */
  trustReason?: string | null;
}

type ReportCard = AvailableReport & {
  readiness: ButtonState;
  dependencies: ReportDependency[];
  readyDependencies: number;
  totalDependencies: number;
};

const toProcessingRailStatus = (status: DatasetStatusValue): ReportProcessingRailStatus => {
  if (status === 'ready') return 'ready';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return 'idle';
};

const summariseProcessingRailStatus = (rows: ReportProcessingRailRow[]): ReportProcessingRailStatus => {
  if (rows.some((row) => row.status === 'blocked')) return 'blocked';
  if (rows.some((row) => row.status === 'error')) return 'error';
  if (rows.some((row) => row.status === 'warn')) return 'warn';
  if (rows.some((row) => row.status === 'loading')) return 'loading';
  if (rows.length > 0 && rows.every((row) => row.status === 'ready')) return 'ready';
  return 'idle';
};

const conditionalButtonStyles = (isDarkMode: boolean, state: ButtonState): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 16px',
    height: 36,
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(13, 47, 96, 0.22)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(13, 47, 96, 0.16)';
        case 'neutral':
        default:
          return isDarkMode ? 'rgba(75, 85, 99, 0.08)' : 'rgba(75, 85, 99, 0.04)';
      }
    })(),
    color: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? colours.green : colours.helixBlue; // Using dark blue for light mode
        case 'warming':
          return isDarkMode ? colours.blue : '#0d2f60';
        case 'neutral':
        default:
          return isDarkMode ? colours.subtleGrey : colours.greyText;
      }
    })(),
    border: (() => {
      switch (state) {
        case 'ready':
          return `0.5px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(13, 47, 96, 0.16)'}`;
        case 'warming':
          return `0.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(13, 47, 96, 0.16)'}`;
        case 'neutral':
        default:
          return `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(75, 85, 99, 0.14)'}`;
      }
    })(),
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(13, 47, 96, 0.28)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(13, 47, 96, 0.16)';
        case 'neutral':
        default:
          return isDarkMode ? `${colours.dark.borderColor}1F` : `${colours.subtleGrey}14`;
      }
    })(),
    color: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? colours.green : colours.helixBlue;
        case 'warming':
          return isDarkMode ? colours.blue : '#0d2f60';
        case 'neutral':
        default:
          return isDarkMode ? colours.subtleGrey : colours.greyText;
      }
    })(),
    borderColor: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(32, 178, 108, 0.4)' : 'rgba(13, 47, 96, 0.3)';
        case 'warming':
          return isDarkMode ? 'rgba(54, 144, 206, 0.36)' : 'rgba(13, 47, 96, 0.3)';
        case 'neutral':
        default:
          return isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
      }
    })(),
  },
  rootPressed: {
    background: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(13, 47, 96, 0.32)'; // Darker for light mode
        case 'warming':
          return isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(13, 47, 96, 0.2)';
        case 'neutral':
        default:
          return isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
      }
    })(),
    color: (() => {
      switch (state) {
        case 'ready':
          return isDarkMode ? colours.green : colours.helixBlue;
        case 'warming':
          return isDarkMode ? colours.blue : colours.helixBlue;
        case 'neutral':
        default:
          return isDarkMode ? colours.subtleGrey : colours.greyText;
      }
    })(),
  },
  rootDisabled: {
    background: isDarkMode ? `${colours.dark.border}1A` : `${colours.subtleGrey}0D`,
    color: isDarkMode ? colours.greyText : colours.subtleGrey,
    border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(75, 85, 99, 0.1)'}`,
  },
});

const primaryButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 18px',
    height: 34,
    background: colours.cta,
    color: '#ffffff',
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: '#b94736',
    boxShadow: 'none',
  },
  rootPressed: {
    background: '#9e3e30',
    color: '#ffffff',
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
    color: isDarkMode ? colours.greyText : colours.subtleGrey,
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
    height: 34,
    background: isDarkMode ? 'rgba(75, 85, 99, 0.08)' : 'transparent',
    color: isDarkMode ? colours.dark.text : colours.greyText,
    border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(75, 85, 99, 0.14)'}`,
    fontWeight: 500,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(75, 85, 99, 0.14)' : 'rgba(75, 85, 99, 0.06)',
    borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.36)' : 'rgba(75, 85, 99, 0.2)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.1)',
    color: isDarkMode ? colours.dark.text : colours.greyText,
  },
  icon: {
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    fontSize: 14,
  },
});

/** Navigator tabs for report sub-views â€” matches Matters/Enquiries pivot pattern.
 *  `draft` tabs are visually muted but still clickable (work-in-progress reports). */
const REPORT_NAV_TABS: { key: typeof ACTIVE_VIEW_TYPE; label: string; draft?: boolean }[] = [
  // â”€â”€ Prod â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'dashboard' as const, label: 'Dashboard' },
  { key: 'receptionReport' as const, label: 'Reception' },
  { key: 'marketingPerformance' as const, label: 'Marketing' },
  { key: 'seoReport' as const, label: 'SEO', draft: true },
  { key: 'enquiries' as const, label: 'Enquiries' },
  { key: 'enquiryLedger' as const, label: 'Ledger' },
  { key: 'annualLeave' as const, label: 'Leave', draft: true },
  // 'metaMetrics' nav entry intentionally removed â€" Meta is off across the Reports tab.
  // â”€â”€ Draft (visually muted) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { key: 'matters' as const, label: 'Matters', draft: true },
  { key: 'ppcReport' as const, label: 'PPC', draft: true },
  { key: 'agedDebts' as const, label: 'Debts', draft: true },
  { key: 'calls' as const, label: 'Calls', draft: true },
  { key: 'responseTime' as const, label: 'Response Time', draft: true },
];
type ActiveViewType = 'overview' | 'dashboard' | 'annualLeave' | 'enquiries' | 'enquiryLedger' | 'metaMetrics' | 'seoReport' | 'ppcReport' | 'marketingPerformance' | 'matters' | 'logMonitor' | 'syncHistory' | 'dataCentre' | 'cacheMonitor' | 'agedDebts' | 'calls' | 'responseTime' | 'receptionReport';
const ACTIVE_VIEW_TYPE: ActiveViewType = 'overview';
const REPORT_PROCESSING_PANEL_PREVIEW_EVENT = 'helix:reports:simulate-processing-panel';
const REPORT_PROCESSING_PANEL_PREVIEW_STORAGE_KEY = 'helix.reports.simulateProcessingPanel';

interface ReportingNavigationRequest {
  view: ActiveViewType;
  requestedAt: number;
}

interface ProcessingRailRequest {
  reportKey: string;
  requestedAt: number;
  settled?: boolean;
  failed?: boolean;
}

// reportNavigatorBackStyles removed â€” now shared via NavigatorDetailBar

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
  { thresholdMs: 15000, label: 'Connecting to reporting data sources...' },
  { thresholdMs: 45000, label: 'Pulling the latest matters and enquiries...' },
  { thresholdMs: 90000, label: 'Crunching reporting metrics...' },
  { thresholdMs: Number.POSITIVE_INFINITY, label: 'Finalising dashboard views...' },
];

const formatCurrency = (amount: number): string => {
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `£${(amount / 1000).toFixed(1)}k`;
};

const formatSnapshotCurrency = (amount: number): string => {
  const abs = Math.abs(amount);
  const prefix = amount < 0 ? '-£' : '£';
  if (abs >= 1_000_000) {
    return `${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${prefix}${(abs / 1_000).toFixed(1)}k`;
  }
  return `${prefix}${Math.round(abs).toLocaleString('en-GB')}`;
};

const formatSnapshotMetricValue = (metric: Pick<EntrySnapshotMetric, 'kind' | 'current'>): string =>
  metric.kind === 'currency'
    ? formatSnapshotCurrency(metric.current)
    : Math.round(metric.current).toLocaleString('en-GB');

const formatSnapshotDelta = (metric: EntrySnapshotMetric): string => {
  const direction = metric.delta > 0 ? '+' : '';
  if (metric.deltaPercent === null) {
    return metric.delta === 0 ? 'level with previous month' : `${direction}${formatSnapshotMetricValue({ kind: metric.kind, current: metric.delta })} vs previous month`;
  }
  return `${direction}${metric.deltaPercent.toFixed(0)}% vs previous month`;
};

const formatSnapshotProjection = (metric: EntrySnapshotMetric): string =>
  `${metric.kind === 'currency' ? formatSnapshotCurrency(metric.projected) : Math.round(metric.projected).toLocaleString('en-GB')} projected`;

const buildEntryMonthPeriod = (anchor: Date, monthOffset: number, elapsedDays: number) => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const cappedElapsedDays = Math.max(1, Math.min(elapsedDays, daysInMonth));
  const end = new Date(start.getFullYear(), start.getMonth(), cappedElapsedDays, 23, 59, 59, 999);
  return {
    start,
    end,
    daysInMonth,
    elapsedDays: cappedElapsedDays,
    label: format(start, 'MMM yyyy'),
  };
};

const isDateInPeriod = (date: Date | null, period: ReturnType<typeof buildEntryMonthPeriod>): boolean =>
  Boolean(date && date >= period.start && date <= period.end);

const getDateDayIndex = (date: Date | null): number | null => {
  if (!date) {
    return null;
  }
  return Math.max(0, date.getDate() - 1);
};

const sumEntriesForPeriod = <T,>(
  rows: T[] | null | undefined,
  period: ReturnType<typeof buildEntryMonthPeriod>,
  getDate: (row: T) => Date | null,
  getValue: (row: T) => number = () => 1,
): number => {
  if (!Array.isArray(rows)) {
    return 0;
  }
  return rows.reduce((total, row) => {
    const date = getDate(row);
    return isDateInPeriod(date, period) ? total + getValue(row) : total;
  }, 0);
};

const buildDailySeries = <T,>(
  rows: T[] | null | undefined,
  monthStart: Date,
  days: number,
  getDate: (row: T) => Date | null,
  getValue: (row: T) => number,
): number[] => {
  const daily = Array.from({ length: days }, () => 0);
  if (!Array.isArray(rows)) {
    return daily;
  }
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), days, 23, 59, 59, 999);
  rows.forEach((row) => {
    const date = getDate(row);
    const dayIndex = getDateDayIndex(date);
    if (!date || dayIndex === null || date < monthStart || date > monthEnd || dayIndex >= days) {
      return;
    }
    daily[dayIndex] += getValue(row);
  });
  return daily;
};

const cumulativeSeries = (daily: number[], limit?: number): number[] => {
  let running = 0;
  return daily.map((value, index) => {
    if (limit === undefined || index < limit) {
      running += value;
    }
    return running;
  });
};

const buildSnapshotLine = (values: number[], maxValue: number, width = 420, top = 16, bottom = 118, totalPoints = values.length, startIndex = 0): string => {
  if (values.length === 0) {
    return '';
  }
  const denominator = Math.max(totalPoints - 1, 1);
  const range = bottom - top;
  return values.map((value, index) => {
    const x = ((startIndex + index) / denominator) * width;
    const y = bottom - ((maxValue <= 0 ? 0 : value / maxValue) * range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const buildSnapshotArea = (points: string, width = 420, bottom = 118): string => {
  if (!points) {
    return '';
  }
  const segments = points.split(' ');
  const firstPoint = segments[0] ?? '0,118';
  const lastPoint = segments.at(-1) ?? `${width},118`;
  const lineSegments = segments.length > 1 ? ` L${segments.slice(1).join(' L')}` : '';
  return `M${firstPoint}${lineSegments} L${lastPoint.split(',')[0]},${bottom} L0,${bottom} Z`;
};

// Marketing Data Settings Component
// (Removed MarketingDataSettingsProps; settings UI deleted)

// (Removed MarketingDataSettings component)

interface ReportingHomeProps {
  userData?: UserData[] | null;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
  featureToggles?: Record<string, boolean>;
  localSupportSettings?: LocalSupportSettings | null;
  initialView?: ActiveViewType;
  dedicatedDataHub?: boolean;
  navigationRequest?: ReportingNavigationRequest | null;
  onNavigationRequestHandled?: (requestedAt: number) => void;
}

interface ReportingStructureModule {
  module: string;
  files: number;
  lines: number;
}

interface ReportingStructureFile {
  path: string;
  module: string;
  lines: number;
}

interface ReportingStructureSnapshot {
  generatedAt: string;
  totals: {
    files: number;
    lines: number;
  };
  modules: ReportingStructureModule[];
  largestFiles: ReportingStructureFile[];
}

/**
 * Streamlined reporting landing page that centres on the Management Dashboard experience.
 */
const ReportingHome: React.FC<ReportingHomeProps> = ({
  userData: propUserData,
  teamData: propTeamData,
  demoModeEnabled = false,
  featureToggles,
  localSupportSettings = null,
  initialView = 'overview',
  dedicatedDataHub = false,
  navigationRequest = null,
  onNavigationRequestHandled,
}) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const { showToast, hideToast, updateToast } = useToast();
  const loadingToastIdRef = useRef<string | null>(null);
  const slimDashboardRangeToastLabelRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [activeView, setActiveView] = useState<ActiveViewType>(initialView);
  const [mattersWipRangeKey, setMattersWipRangeKey] = useState<MattersWipRangeKey>('12m');
  const [pendingMattersRangeKey, setPendingMattersRangeKey] = useState<MattersWipRangeKey>(mattersWipRangeKey);
  const [enquiriesRangeKey, setEnquiriesRangeKey] = useState<ReportRangeKey>('12m');
  const [pendingEnquiriesRangeKey, setPendingEnquiriesRangeKey] = useState<ReportRangeKey>(enquiriesRangeKey);
  const [slimSelectedRangeKey, setSlimSelectedRangeKey] = useState<ReportRangeKey | null>(null);
  const [slimReceptionRangeKey, setSlimReceptionRangeKey] = useState<ReportRangeKey | null>(null);
  const [slimMarketingRangeKey, setSlimMarketingRangeKey] = useState<ReportRangeKey | null>(null);
  const [slimSeoRangeKey, setSlimSeoRangeKey] = useState<ReportRangeKey | null>(null);
  const [marketingReportPreparedRangeKey, setMarketingReportPreparedRangeKey] = useState<ReportRangeKey | null>(null);
  const [seoReportPreparedRangeKey, setSeoReportPreparedRangeKey] = useState<ReportRangeKey | null>(null);
  const [slimRangeInvoked, setSlimRangeInvoked] = useState(false);
  const refreshRangeButtonRef = useRef<HTMLSpanElement | null>(null);
  const isLocalReportsSurface = checkIsLocalDev(featureToggles);
  const [reportingStructure, setReportingStructure] = useState<ReportingStructureSnapshot | null>(null);
  const [reportingStructureStatus, setReportingStructureStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  // Reports rides the shared .app-scroll-region. Hide its scrollbar chrome
  // while Reports is mounted, mirroring Matters/Home, and let the UserBubble
  // "Show scrollbars" toggle (data-show-scrollbars="1" on <html>) reveal it
  // on demand.
  useLayoutEffect(() => {
    const region = document.querySelector('.app-scroll-region') as HTMLElement | null;
    if (!region) return;
    region.classList.add('reporting-scroll-region');
    return () => {
      region.classList.remove('reporting-scroll-region');
    };
  }, []);

  useEffect(() => {
    if (!isLocalReportsSurface) {
      setReportingStructure(null);
      setReportingStructureStatus('idle');
      return;
    }

    const controller = new AbortController();
    setReportingStructureStatus('loading');
    fetch('/api/dev/reporting-structure', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Reporting structure failed (${response.status})`);
        }
        const payload = await response.json() as { ok?: boolean } & ReportingStructureSnapshot;
        if (!payload.ok) {
          throw new Error('Reporting structure unavailable');
        }
        setReportingStructure(payload);
        setReportingStructureStatus('ready');
      })
      .catch((error) => {
        if ((error as Error).name === 'AbortError') return;
        debugWarn('Reporting structure load failed:', error);
        setReportingStructureStatus('error');
      });

    return () => controller.abort();
  }, [isLocalReportsSurface]);
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
  const [slimManagementHeaderHovered, setSlimManagementHeaderHovered] = useState(false);
  const [slimManagementFooterHovered, setSlimManagementFooterHovered] = useState(false);
  const [slimHoveredSecondaryReportKey, setSlimHoveredSecondaryReportKey] = useState<string | null>(null);
  const [hoveredRangeEstimate, setHoveredRangeEstimate] = useState<{ ownerKey: string; rangeKey: ReportRangeKey } | null>(null);
  
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
  const [processingRailRequests, setProcessingRailRequests] = useState<ProcessingRailRequest[]>([]);
  const [activeProcessingPanelReportKey, setActiveProcessingPanelReportKey] = useState<string | null>(null);
  const [activeProcessingPanelFolded, setActiveProcessingPanelFolded] = useState(false);
  const [activeProcessingPanelForcedOpen, setActiveProcessingPanelForcedOpen] = useState(false);
  const [activeProcessingPanelManualFolded, setActiveProcessingPanelManualFolded] = useState<boolean | null>(null);
  const [receptionReportSnapshot, setReceptionReportSnapshot] = useState<{
    rangeKey: ReportShellRangeKey;
    range: { start: Date; end: Date };
    from: string;
    to: string;
    data: ReceptionKpisResponse;
    loadedAt: number;
  } | null>(null);
  const [receptionReportStatus, setReceptionReportStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const receptionReportRequestIdRef = useRef(0);
  const [simulatedProcessingPanelVisible, setSimulatedProcessingPanelVisible] = useState(false);

  const requestProcessingRailReport = useCallback((reportKey: string) => {
    setActiveProcessingPanelReportKey(reportKey);
    setProcessingRailRequests((current) => {
      const nextRequest: ProcessingRailRequest = { reportKey, requestedAt: Date.now(), settled: false, failed: false };
      return [...current.filter((request) => request.reportKey !== reportKey), nextRequest];
    });
  }, []);

  const settleProcessingRailReport = useCallback((reportKey: string, ready: boolean) => {
    setProcessingRailRequests((current) => current.map((request) => (
      request.reportKey === reportKey
        ? { ...request, settled: true, failed: !ready }
        : request
    )));
  }, []);

  const clearProcessingRailReport = useCallback((reportKey: string) => {
    setProcessingRailRequests((current) => current.filter((request) => request.reportKey !== reportKey));
    setActiveProcessingPanelReportKey((current) => current === reportKey ? null : current);
  }, []);

  const hideSimulatedProcessingPanel = useCallback(() => {
    setSimulatedProcessingPanelVisible(false);
  }, []);

  const hideActiveProcessingPanel = useCallback(() => {
    setActiveProcessingPanelReportKey(null);
  }, []);

  const simulatedProcessingPanelItem: ReportProcessingRailItem = {
    key: 'simulated-report-processing',
    title: 'Refreshing Marketing',
    subtitle: 'Preview panel for report refresh work.',
    status: 'loading',
    rows: [
      { key: 'googleAnalytics', label: 'Google Analytics', status: 'loading', detail: 'Fetching latest daily rows' },
      { key: 'googleAds', label: 'Google Ads', status: 'ready', detail: 'Spend and conversion rows loaded' },
      { key: 'enquiries', label: 'Enquiries', status: 'ready', detail: 'Outcome data available' },
      { key: 'allMatters', label: 'Matters', status: 'idle', detail: 'Waiting for revenue match' },
    ],
    ctaLabel: 'Hide preview',
    onCta: hideSimulatedProcessingPanel,
    detail: 'Session preview only. No refresh has been run.',
    elapsedLabel: 'Preview',
    visualIcon: 'Sync',
  };

  const [resumeNotice, setResumeNotice] = useState<{ message: string; startedAt: number } | null>(null);
  const resumeNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Test mode - only available in local development
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [testMode, setTestMode] = useState(() => demoModeEnabled);
  // (Removed marketing data settings state; always fetch 24 months)

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const showPanel = () => setSimulatedProcessingPanelVisible(true);
    try {
      if (window.sessionStorage.getItem(REPORT_PROCESSING_PANEL_PREVIEW_STORAGE_KEY) === '1') {
        window.sessionStorage.removeItem(REPORT_PROCESSING_PANEL_PREVIEW_STORAGE_KEY);
        showPanel();
      }
    } catch { /* ignore storage errors */ }
    window.addEventListener(REPORT_PROCESSING_PANEL_PREVIEW_EVENT, showPanel);
    return () => window.removeEventListener(REPORT_PROCESSING_PANEL_PREVIEW_EVENT, showPanel);
  }, []);

  useEffect(() => {
    if (!navigationRequest) {
      return;
    }

    setActiveView(navigationRequest.view);
    onNavigationRequestHandled?.(navigationRequest.requestedAt);
  }, [navigationRequest, onNavigationRequestHandled]);
  
  // Memoize handlers to prevent recreation on every render
  const handleBackToOverview = useCallback(() => {
    if (dedicatedDataHub) {
      setActiveView('dataCentre');
      return;
    }
    setActiveView('overview');
  }, [dedicatedDataHub]);

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

      // The GA4 route returns `{ success, data: [...], dateRange, source }`.
      // Older callers expected a bare array, so accept either shape.
      const payload = await response.json();
      if (Array.isArray(payload)) {
        return payload as GoogleAnalyticsData[];
      }
      if (Array.isArray((payload as { data?: GoogleAnalyticsData[] })?.data)) {
        return (payload as { data: GoogleAnalyticsData[] }).data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching Google Analytics data:', error);
      throw error;
    }
  }, []);

  const prepareReceptionReport = useCallback(async (rangeKey: ReportRangeKey): Promise<boolean> => {
    const { range, from, to } = getReceptionReportWindow(rangeKey);
    if (
      receptionReportStatus === 'ready'
      && receptionReportSnapshot?.from === from
      && receptionReportSnapshot?.to === to
    ) {
      return receptionReportHasData(receptionReportSnapshot.data);
    }

    const requestId = receptionReportRequestIdRef.current + 1;
    receptionReportRequestIdRef.current = requestId;
    setReceptionReportStatus('loading');

    try {
      const response = await fetchWithRetry(`/api/reporting/reception-kpis?from=${from}&to=${to}`, RECEPTION_REPORT_FETCH_OPTIONS);
      if (!response.ok) {
        throw new Error(`Reception KPIs request failed (${response.status})`);
      }
      const payload = await response.json() as ReceptionKpisResponse;
      if (receptionReportRequestIdRef.current !== requestId) {
        return false;
      }
      const loadedAt = Date.now();
      setReceptionReportSnapshot({
        rangeKey: 'custom',
        range,
        from,
        to,
        data: payload,
        loadedAt,
      });
      setReceptionReportStatus('ready');
      return receptionReportHasData(payload);
    } catch (error) {
      if (receptionReportRequestIdRef.current === requestId) {
        setReceptionReportStatus('error');
        showToast({
          message: 'Reception report could not be prepared. Try again from the card.',
          type: 'error',
          duration: 6000,
        });
      }
      debugWarn('ReportingHome: Failed to prepare Reception report', error);
      return false;
    }
  }, [receptionReportSnapshot, receptionReportStatus, showToast]);

  const prepareSeoReport = useCallback((rangeKey: ReportRangeKey): boolean => {
    setSeoReportPreparedRangeKey(rangeKey);
    return true;
  }, []);

  const prepareMarketingReport = useCallback((rangeKey: ReportRangeKey): boolean => {
    setMarketingReportPreparedRangeKey(rangeKey);
    return true;
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

      const payload = (await response.json()) as GoogleAdsApiResponse | GoogleAdsData[];
      if (Array.isArray(payload)) {
        return payload;
      }
      if (Array.isArray(payload?.data)) {
        return payload.data;
      }
      return [];
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
    annualLeave: cachedData.annualLeave,
    metaMetrics: cachedData.metaMetrics,
    googleAnalytics: cachedData.googleAnalytics,
    googleAds: cachedData.googleAds,
    deals: cachedData.deals,
    instructions: cachedData.instructions,
    emailLists: cachedData.emailLists,
    dubberCalls: cachedData.dubberCalls,
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
  const [externalDatasetActivity, setExternalDatasetActivity] = useState<ReportingDatasetActivitySnapshot>(() => getReportingDatasetActivitySnapshot());
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number | null>(cachedTimestamp);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [showReportingOpsModal, setShowReportingOpsModal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState<boolean>(() => {
    const cacheState = getCacheState();
    // If we have valid cached data AND the persistent flag says we've fetched before, honor it
    return Boolean(cachedTimestamp) && cacheState.hasFetchedOnce;
  });
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null);
  const prevIsFetchingRef = useRef<boolean>(false);
  const primaryUser = propUserData?.[0] ?? null;
  // Phase D rollout (dev-preview-and-view-as): Reports tab access goes through
  // the effective-permissions hook so the dev-owner "View as" override flips
  // the modal visibility along with everything else. The enquiry-ledger view
  // is now prod-tier (visible to every reports user) per the 2026-04-30
  // directive that locked the prod surface to Management Dashboard, Enquiries
  // Report, and Enquiry Ledger.
  const effective = useEffectivePermissions(primaryUser);
  const isLocalReportsHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  // Enquiry ledger is now a prod-tier report alongside Management Dashboard
  // and Enquiries Report (per directive 2026-04-30). It rides the same
  // canAccessReports check as the rest of the Reports tab.
  const canViewEnquiryLedger = useMemo(
    () => Boolean(primaryUser) && effective.canAccessReports,
    [primaryUser, effective.canAccessReports],
  );
  // Dev-preview audience for not-yet-prod reports (Annual Leave Report, Matters,
  // Meta Ads, SEO, PPC, Calls). When false we hide those tiles, drop their
  // datasets from the cold-load streaming pull, and trim them from the visible
  // "feeds ready" strip. This keeps the Reports entry surface focused on what
  // works in production and prevents flaky third-party endpoints (Meta / GA4 /
  // Google Ads / Dubber) from slowing or blocking everyone else.
  const isReportsDevPreview = useMemo(
    () => canSeeReportsDevPreview(primaryUser),
    [primaryUser],
  );
  const canAccessReportingOps = useMemo(
    () => Boolean(primaryUser) && effective.canAccessReports,
    [primaryUser, effective.canAccessReports]
  );
  // Data Hub is a production-tier surface; limit visibility to the prod
  // audience (Emma / Luke / Alex) so only they see the Data Centre entry in Reports.
  const canAccessDataHub = useMemo(() => {
    if (!primaryUser) return false;
    const initials = String(primaryUser.Initials ?? '').toUpperCase().trim();
    return initials === 'LZ' || initials === 'AC' || initials === 'EA';
  }, [primaryUser]);

  useEffect(() => {
    if (!canAccessReportingOps) {
      setShowReportingOpsModal(false);
    }
  }, [canAccessReportingOps]);

  useEffect(() => {
    if (activeView === 'enquiryLedger' && !canViewEnquiryLedger) {
      setActiveView('overview');
    }
  }, [activeView, canViewEnquiryLedger]);

  useEffect(() => {
    if (activeView === 'dataCentre' && !canAccessDataHub) {
      setActiveView('overview');
    }
  }, [activeView, canAccessDataHub]);

  const reportingOpsRows = useMemo(() => {
    const priority: Record<DatasetStatusValue, number> = {
      loading: 0,
      error: 1,
      ready: 2,
      idle: 3,
    };

    return DATASETS
      .filter((dataset) => dataset.key !== 'annualLeave')
      .map((dataset) => {
        const meta = datasetStatus[dataset.key];
        return {
          key: dataset.key,
          label: dataset.name,
          status: meta?.status ?? 'idle',
          updatedAt: meta?.updatedAt ?? null,
        };
      })
      .sort((a, b) => priority[a.status] - priority[b.status]);
  }, [datasetStatus]);

  // Show global toast notifications for data loading
  useEffect(() => {
    const wasFetching = prevIsFetchingRef.current;
    prevIsFetchingRef.current = isFetching;

    if (isFetching && !wasFetching) {
      // Inline morphing cards and the dashboard prep state now own the loading
      // surface. Just clear any orphaned toast from a previous instance.
      if (loadingToastIdRef.current) {
        hideToast(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
    } else if (!isFetching && wasFetching) {
      // Finished fetching - hide loading toast and show success
      if (loadingToastIdRef.current) {
        hideToast(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
      const reportSpecificPanelActive = activeProcessingPanelReportKey !== null || processingRailRequests.length > 0;
      const slimRangeLabel = slimDashboardRangeToastLabelRef.current;
      if (slimRangeLabel) {
        // Dashboard range refresh now uses the processing rail panel instead of a toast.
        slimDashboardRangeToastLabelRef.current = null;
        return;
      }
      if (!reportSpecificPanelActive) {
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
      slimDashboardRangeToastLabelRef.current = null;
    }

    // Cleanup when unmounting - only hide toast if fetching completed
    // If still fetching, let it persist so user knows data is loading in background
    return () => {
      if (loadingToastIdRef.current && !isFetching) {
        hideToast(loadingToastIdRef.current);
        loadingToastIdRef.current = null;
      }
    };
  }, [activeProcessingPanelReportKey, isFetching, processingRailRequests.length, showToast, hideToast]);

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
      annualLeave: [],
      metaMetrics: [],
      googleAnalytics: [],
      googleAds: [],
      deals: [],
      instructions: [],
      emailLists: [],
      dubberCalls: [],
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

  // Demo mode used to seed Reports with empty stub datasets. Reports now
  // sources live data even in demo so the Management Dashboard renders real
  // figures during walkthroughs. The period range stays a deliberate user
  // invoke; we only apply a fallback at open-dashboard click time.
  const ppcIncomeMetrics = useMemo<PpcIncomeMetrics | null>(() => {
    const enquiries = datasetData.enquiries;
    const matters = datasetData.allMatters;
    const recovered = datasetData.recoveredFees;
    const instructions = datasetData.instructions;

    if (!Array.isArray(enquiries) || !Array.isArray(matters) || !Array.isArray(recovered)) {
      return null;
    }

    const MAX_UNMATCHED_PREVIEW = 25;
    const MS_IN_DAY = 1000 * 60 * 60 * 24;

    const ppcEnquiries = enquiries.filter((enquiry) => {
      try {
        return getNormalizedEnquirySource(enquiry).key === 'google_ads' || hasPpcEnquirySignal(enquiry);
      } catch (err) {
        debugWarn('ReportingHome: Failed to normalise enquiry source for PPC detection', {
          enquiryId: enquiry.ID,
          error: err instanceof Error ? err.message : err,
        });
        return hasPpcEnquirySignal(enquiry);
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

    const instructionsIndex = new Map<string, InstructionRecord[]>();
    const pushInstruction = (key: string, instruction: InstructionRecord) => {
      if (!key) {
        return;
      }
      const bucket = instructionsIndex.get(key) ?? [];
      bucket.push(instruction);
      instructionsIndex.set(key, bucket);
    };

    (Array.isArray(instructions) ? instructions : []).forEach((instruction) => {
      extractInstructionAssociationKeys(instruction).forEach((key) => {
        pushInstruction(key, instruction);
      });
    });

    const getAssociatedInstructions = (matter: Matter, identifiers: ReturnType<typeof extractMatterIdentifiers>): InstructionRecord[] => {
      const seen = new Set<string>();
      const matches: InstructionRecord[] = [];

      extractMatterAssociationKeys(matter, identifiers).forEach((key) => {
        const bucket = instructionsIndex.get(key);
        if (!bucket) {
          return;
        }
        bucket.forEach((instruction) => {
          const instructionKey = normaliseKey(
            instruction.InstructionRef
            || instruction.MatterId
            || instruction.ClientId
            || `${instruction.Email ?? ''}-${instruction.Stage ?? instruction.Status ?? ''}`
          );
          if (instructionKey && !seen.has(instructionKey)) {
            seen.add(instructionKey);
            matches.push(instruction);
          }
        });
      });

      return matches;
    };

    const candidateMatters = matters
      .map((matter) => {
        const identifiers = extractMatterIdentifiers(matter);
        const displayKey = normaliseKey(identifiers.displayNumber);
        const matchesSource = isPpcSourceLabel((matter as any).Source || (matter as any).source);
        const hasLinkedEnquiry = displayKey && enquiriesByMatterRef.has(displayKey);
        const associatedInstructions = getAssociatedInstructions(matter, identifiers);
        const hasInstructionMatterRefMatch = associatedInstructions.some((instruction) => {
          const candidateKeys = [instruction.MatterId, instruction.InstructionRef, (instruction as any).matter_ref];
          return candidateKeys.some((key) => {
            const normalised = normaliseKey(key);
            return Boolean(normalised) && enquiriesByMatterRef.has(normalised);
          });
        });
        const hasInstructionEmailMatch = associatedInstructions.some((instruction) => {
          const emailKey = normaliseKey(instruction.Email);
          return Boolean(emailKey) && enquiriesByEmail.has(emailKey);
        });
        if (!matchesSource && !hasLinkedEnquiry && !hasInstructionMatterRefMatch && !hasInstructionEmailMatch) {
          return null;
        }
        return { matter, identifiers, displayKey, associatedInstructions };
      })
      .filter((entry): entry is { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string; associatedInstructions: InstructionRecord[] } => Boolean(entry));

    if (candidateMatters.length === 0 && ppcEnquiries.length === 0) {
      return null;
    }

    const idToMatter = new Map<string, { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string; associatedInstructions: InstructionRecord[] }>();
    candidateMatters.forEach((entry) => {
      entry.identifiers.variants.forEach((variant) => {
        if (variant) {
          idToMatter.set(variant, entry);
        }
      });
    });

    const selectLinkedEnquiry = (entry: { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string; associatedInstructions: InstructionRecord[] }): { enquiry?: Enquiry; matchKind: PpcMatchKind } => {
      if (entry.displayKey && enquiriesByMatterRef.has(entry.displayKey)) {
        return { enquiry: enquiriesByMatterRef.get(entry.displayKey)?.[0], matchKind: 'direct' };
      }

      for (const instruction of entry.associatedInstructions) {
        const directKeys = [instruction.MatterId, instruction.InstructionRef, (instruction as any).matter_ref];
        for (const key of directKeys) {
          const normalised = normaliseKey(key);
          if (normalised && enquiriesByMatterRef.has(normalised)) {
            return { enquiry: enquiriesByMatterRef.get(normalised)?.[0], matchKind: 'direct' };
          }
        }
      }

      for (const instruction of entry.associatedInstructions) {
        const emailKey = normaliseKey(instruction.Email);
        if (emailKey && enquiriesByEmail.has(emailKey)) {
          return { enquiry: enquiriesByEmail.get(emailKey)?.[0], matchKind: 'email' };
        }
      }

      const emailCandidate = (entry.matter as any).ClientEmail
        || (entry.matter as any)['Client Email']
        || (entry.matter as any).client_email
        || (entry.matter as any).clientEmail;
      const emailKey = normaliseKey(emailCandidate);
      if (emailKey && enquiriesByEmail.has(emailKey)) {
        return { enquiry: enquiriesByEmail.get(emailKey)?.[0], matchKind: 'email' };
      }
      return { matchKind: isPpcSourceLabel((entry.matter as any).Source || (entry.matter as any).source) ? 'source_only' : 'unknown' };
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

      let matchedEntry: { matter: Matter; identifiers: ReturnType<typeof extractMatterIdentifiers>; displayKey: string; associatedInstructions: InstructionRecord[] } | undefined;
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
          enquiryId: linkedEnquiry.enquiry?.ID,
          enquiryDate: linkedEnquiry.enquiry?.Touchpoint_Date,
          enquirySource: linkedEnquiry.enquiry?.Ultimate_Source,
          enquiryMoc: linkedEnquiry.enquiry?.Method_of_Contact,
          matchKind: linkedEnquiry.matchKind,
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
        enquiryId: linkedEnquiry.enquiry?.ID,
        enquiryDate: linkedEnquiry.enquiry?.Touchpoint_Date,
        enquirySource: linkedEnquiry.enquiry?.Ultimate_Source,
        enquiryMoc: linkedEnquiry.enquiry?.Method_of_Contact,
        matchKind: linkedEnquiry.matchKind,
      });
    });

    const breakdownList = Array.from(breakdownMap.values()).sort((a, b) => b.totalCollected - a.totalCollected);
    const breakdownByEnquiryId = new Map<string, PpcIncomeMetrics['breakdown'][number]>();
    breakdownList.forEach((record) => {
      if (record.enquiryId != null) {
        breakdownByEnquiryId.set(String(record.enquiryId), record);
      }
    });

    const enquirySnapshots = ppcEnquiries.map((enquiry) => {
      const linkedBreakdown = enquiry.ID != null ? breakdownByEnquiryId.get(String(enquiry.ID)) : undefined;
      return {
        enquiryId: enquiry.ID,
        enquiryDate: enquiry.Touchpoint_Date,
        source: enquiry.Ultimate_Source,
        methodOfContact: enquiry.Method_of_Contact,
        linkedToMatter: Boolean(linkedBreakdown),
        linkedMatterId: linkedBreakdown?.matterId,
        linkedDisplayNumber: linkedBreakdown?.displayNumber,
        clientName: linkedBreakdown?.clientName,
        matchKind: linkedBreakdown?.matchKind,
      };
    });

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
      enquirySnapshots,
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

  // Prepare list of datasets to stream (stable identity across re-renders).
  // For non-dev-preview users we drop datasets that only feed dev-preview
  // reports so the cold load doesn't pay the third-party fan-out.
  const streamableDatasets = useMemo<StreamingDatasetKey[]>(
    () => isReportsDevPreview
      ? GLOBAL_STREAM_DATASETS
      : GLOBAL_STREAM_DATASETS.filter((key) => !DEV_PREVIEW_ONLY_DATASETS.has(key as DatasetKey)),
    [isReportsDevPreview]
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

  useEffect(() => subscribeReportingDatasetActivity(setExternalDatasetActivity), []);

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
    if (activeView !== 'ppcReport' && activeView !== 'marketingPerformance') {
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
        recordReportingDatasetActivity({ key: 'googleAds', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
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

  // Fetch Google Analytics data for enquiries range when opening SEO or Marketing report
  useEffect(() => {
    if (activeView !== 'seoReport' && activeView !== 'marketingPerformance') {
      return undefined;
    }

    const existingGoogleAnalyticsRows = datasetData.googleAnalytics ?? cachedData.googleAnalytics;
    if (
      Array.isArray(existingGoogleAnalyticsRows)
      && existingGoogleAnalyticsRows.length > 0
      && datasetStatus.googleAnalytics?.status === 'ready'
    ) {
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
        recordReportingDatasetActivity({ key: 'googleAnalytics', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
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
        console.error('ReportingHome: Failed to fetch Google Analytics data for website analytics report', error);
        setDatasetStatus(prev => ({
          ...prev,
          googleAnalytics: { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeView, datasetData.googleAnalytics, datasetStatus.googleAnalytics?.status, fetchGoogleAnalyticsData]);

  const marketingEnquiriesRefreshKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeView !== 'marketingPerformance') return;

    const rangeKey = marketingReportPreparedRangeKey ?? slimMarketingRangeKey ?? '12m';
    const range = computeRangeWindowByKey(rangeKey);
    const refreshKey = `${rangeKey}:${range.start.toISOString()}:${range.end.toISOString()}`;
    if (marketingEnquiriesRefreshKeyRef.current === refreshKey) return;
    marketingEnquiriesRefreshKeyRef.current = refreshKey;

    setStatusesFor(['enquiries'], 'loading');
    startStreamingWithMemo({
      datasets: ['enquiries'],
      bypassCache: true,
      queryParams: buildEnquiriesRangeParams(range),
    });
  }, [activeView, marketingReportPreparedRangeKey, setStatusesFor, slimMarketingRangeKey, startStreamingWithMemo]);

  useEffect(() => {
    if (activeView === 'overview') {
      setContent(
        <NavigatorDetailBar
          onBack={handleBackToOverview}
          showBackButton={false}
          staticLabel="Reporting workspace"
        />,
      );
      // Intentionally no cleanup that calls setContent(null): when this tab
      // unmounts (e.g. switching to Matters), the next active tab's
      // useLayoutEffect has already written its own navigator content. A
      // cleanup here would race with that write and blank the shared bar.
      return;
    }

    // dataCentre manages its own NavigatorDetailBar internally
    if (activeView === 'dataCentre') {
      return;
    }

    // Utility views (logMonitor, etc.) that sit outside the main report tabs
    const isTabView = REPORT_NAV_TABS.some(t => t.key === activeView);
    const utilityLabels: Record<string, string> = {
      logMonitor: 'Log Monitor',
      cacheMonitor: 'Cache Monitor',
    };

    // Draft tabs: visible locally, and SEO remains visible to the Reports dev-preview audience in prod view.
    const isLocalNow = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isViewingAsProd = Boolean(featureToggles?.viewAsProd);
    const initials = extractUserInitials(propUserData);
    // Prod-tier nav tabs (visible to every reports user). Mirrors
    // AVAILABLE_REPORTS entries marked tier: 'prod'.
    const PROD_TAB_KEYS = isReportsDevPreview
      ? ['dashboard', 'receptionReport']
      : ['dashboard', 'receptionReport'];
    const visibleTabs = REPORT_NAV_TABS.filter((tab) => {
      if (tab.key === 'receptionReport' && !canSeeReceptionReport(initials)) {
        return false;
      }
      if (tab.key === 'enquiryLedger') {
        return canViewEnquiryLedger;
      }
      if (isLocalNow && !isViewingAsProd) {
        return true;
      }
      return PROD_TAB_KEYS.includes(tab.key as string);
    });

    setContent(
      <NavigatorDetailBar
        onBack={handleBackToOverview}
        backLabel="Back"
        tabs={isTabView ? visibleTabs.map(t => ({ key: t.key, label: t.draft ? `${t.label} \u1D30` : t.label, draft: t.draft })) : undefined}
        activeTab={activeView}
        onTabChange={(key) => setActiveView(key as ActiveViewType)}
        staticLabel={!isTabView ? (utilityLabels[activeView] || activeView) : undefined}
      />,
    );

    // No cleanup: see comment above about avoiding the navigator-clear race
    // when this tab unmounts during a tab switch.
  }, [activeView, canViewEnquiryLedger, handleBackToOverview, isDarkMode, setContent, propUserData, featureToggles, isReportsDevPreview]);

  const fetchAnnualLeaveDataset = useCallback(async (forceRefresh: boolean, options: AnnualLeaveFetchOptions = {}): Promise<AnnualLeaveFetchResult> => {
    const endpoint = forceRefresh ? '/api/attendance/getAnnualLeave?forceRefresh=true' : '/api/attendance/getAnnualLeave';
    const initials = extractUserInitials(propUserData);
    const timeoutMs = options.timeoutMs ?? 45000;
    const retries = options.retries ?? 2;
    const retryDelay = options.retryDelay ?? 2000;

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
        timeout: timeoutMs,
        retries,
        retryDelay,
        retryStatuses: [429, 500, 502, 503, 504],
      });
    } catch (networkError) {
      throw new Error(networkError instanceof Error ? networkError.message : 'Network error while fetching annual leave data');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Annual leave fetch failed: ${response.status} ${response.statusText}${text ? ` â€“ ${text.slice(0, 160)}` : ''}`);
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
  // Annual leave is excluded from the streaming pipeline (see GLOBAL_STREAM_DATASETS)
  // and only fetched when the dashboard is opened or the user clicks a refresh
  // button. Without this mount-time fetch its source dot stays idle (white)
  // forever on Reporting Home, even though the endpoint is a fast cached
  // ~50ms call. Fire once on mount, quietly — no toast, no isFetching flip,
  // no error escalation. If it fails the dot just stays idle, same as today.
  const annualLeaveBootstrappedRef = useRef(false);
  useEffect(() => {
    if (annualLeaveBootstrappedRef.current) return;
    if (testMode && !demoModeEnabled) return;
    if (datasetStatus.annualLeave?.status === 'ready' || datasetStatus.annualLeave?.status === 'loading') return;
    annualLeaveBootstrappedRef.current = true;
    setDatasetStatus(prev => ({
      ...prev,
      annualLeave: { status: 'loading', updatedAt: prev.annualLeave?.updatedAt ?? null },
    }));
    void fetchAnnualLeaveDataset(false)
      .then((result) => {
        const now = Date.now();
        setDatasetData(prev => ({
          ...prev,
          annualLeave: result.records,
          ...(result.team.length > 0 && (!prev.teamData || prev.teamData.length === 0)
            ? { teamData: result.team }
            : {}),
        }));
        setDatasetStatus(prev => ({
          ...prev,
          annualLeave: { status: 'ready', updatedAt: now },
        }));
      })
      .catch(() => {
        setDatasetStatus(prev => ({
          ...prev,
          annualLeave: { status: 'error', updatedAt: prev.annualLeave?.updatedAt ?? null },
        }));
      });
  }, [datasetStatus.annualLeave?.status, fetchAnnualLeaveDataset, testMode, demoModeEnabled]);

  const fetchMetaMetrics = useCallback(async (daysBack: number = DEFAULT_META_DAYS, bypassCache = false): Promise<MarketingMetrics[]> => {
    try {
      const safeDays = Math.max(Math.floor(daysBack), 7);
      const url = `/api/marketing-metrics?daysBack=${safeDays}${bypassCache ? '&bypassCache=true' : ''}`;
      
      const response = await fetchWithRetry(url, {
        timeout: 30000,
        retries: 2,
        retryDelay: 1000,
      });
      
      if (!response.ok) {
        throw new Error(`Meta metrics fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) return [];
      
      const dailyMetrics = result.data;
      if (!Array.isArray(dailyMetrics)) return [];
      
      return dailyMetrics;
      
    } catch (error) {
      // Return empty array on error to prevent blocking the dashboard
      return [];
    }
  }, []);

  // Enhanced refresh function with streaming support and better throttling
  const performStreamingRefresh = useCallback(async (forceRefresh: boolean, options?: RefreshOptions) => {
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
      debugLog('ðŸŒŠ Starting streaming with datasets:', streamingTargets);
      debugLog('ðŸŒŠ EntraID for streaming:', propUserData?.[0]?.EntraID);
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
      // Meta is off across the Reports tab — force-skip the fetch regardless of
      // cache freshness. Existing cachedData.metaMetrics (if any) is preserved
      // but never refreshed.
      const shouldFetchMeta = false;
      const shouldFetchGA = includeMarketingFeeds && (forceRefresh || !cachedData.googleAnalytics || (nowTs - lastGA) > thirtyMinutes);
      const shouldFetchGAds = includeMarketingFeeds && (forceRefresh || !cachedData.googleAds || (nowTs - lastGAds) > thirtyMinutes);

      let annualLeaveData: AnnualLeaveRecord[] = cachedData.annualLeave || [];
      let metaMetricsData: MarketingMetrics[] = cachedData.metaMetrics || [];
      let googleAnalyticsData: GoogleAnalyticsData[] = cachedData.googleAnalytics || [];
      let googleAdsData: GoogleAdsData[] = cachedData.googleAds || [];
      let refreshedTeamData: TeamData[] | undefined;
      let settledErrors: string[] = [];
      let softErrors: string[] = [];

      if (shouldFetchAnnualLeave || shouldFetchMeta || shouldFetchGA || shouldFetchGAds) {
        setDatasetStatus(prev => ({
          ...prev,
          ...(shouldFetchGA && { googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null } }),
          ...(shouldFetchGAds && { googleAds: { status: 'loading', updatedAt: prev.googleAds?.updatedAt ?? null } }),
        }));

        // Use Promise.allSettled so one dataset failure doesn't kill the others
        const [annualLeaveSettled, metaSettled, gaSettled, gAdsSettled] = await Promise.allSettled([
          shouldFetchAnnualLeave ? fetchAnnualLeaveDataset(forceRefresh, { timeoutMs: 18000, retries: 1, retryDelay: 1200 }) : Promise.resolve<AnnualLeaveFetchResult | null>(null),
          shouldFetchMeta ? fetchMetaMetrics(effectiveMetaDaysBack) : Promise.resolve(metaMetricsData),
          shouldFetchGA ? fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]) : Promise.resolve(googleAnalyticsData),
          shouldFetchGAds ? fetchGoogleAdsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]) : Promise.resolve(googleAdsData),
        ]);

        // settledErrors is declared in outer scope so setDatasetStatus can read it after the if-block

        if (annualLeaveSettled.status === 'fulfilled') {
          const annualLeaveResult = annualLeaveSettled.value;
          if (shouldFetchAnnualLeave && annualLeaveResult) {
            annualLeaveData = annualLeaveResult.records;
            if (annualLeaveResult.team.length > 0) {
              refreshedTeamData = annualLeaveResult.team;
            }
          }
        } else if (shouldFetchAnnualLeave) {
          softErrors.push('annualLeave');
          annualLeaveData = datasetData.annualLeave || cachedData.annualLeave || [];
          debugWarn('Annual leave fetch failed independently:', annualLeaveSettled.reason);
        }

        if (metaSettled.status === 'fulfilled') {
          if (shouldFetchMeta) {
            metaMetricsData = Array.isArray(metaSettled.value) ? metaSettled.value : [];
          }
        } else if (shouldFetchMeta) {
          settledErrors.push('metaMetrics');
          debugWarn('Meta metrics fetch failed independently:', metaSettled.reason);
        }

        if (gaSettled.status === 'fulfilled') {
          if (shouldFetchGA) {
            googleAnalyticsData = Array.isArray(gaSettled.value) ? gaSettled.value : [];
          }
        } else if (shouldFetchGA) {
          settledErrors.push('googleAnalytics');
          debugWarn('Google Analytics fetch failed independently:', gaSettled.reason);
        }

        if (gAdsSettled.status === 'fulfilled') {
          if (shouldFetchGAds) {
            googleAdsData = Array.isArray(gAdsSettled.value) ? gAdsSettled.value : [];
          }
        } else if (shouldFetchGAds) {
          settledErrors.push('googleAds');
          debugWarn('Google Ads fetch failed independently:', gAdsSettled.reason);
        }

        // Show a warning toast if some (but not all) datasets failed
        const warningErrors = [...softErrors, ...settledErrors];
        if (warningErrors.length > 0) {
          showToast({
            message: `Some datasets failed to load: ${warningErrors.join(', ')}. Other data loaded successfully.`,
            type: 'warning',
            duration: 7000,
          });
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
        annualLeave: { status: 'ready', updatedAt: softErrors.includes('annualLeave') ? (prev.annualLeave?.updatedAt ?? nowTs) : (shouldFetchAnnualLeave ? nowTs : (prev.annualLeave?.updatedAt ?? nowTs)) },
        ...(includeMarketingFeeds && {
          metaMetrics: settledErrors.includes('metaMetrics')
            ? { status: 'error', updatedAt: prev.metaMetrics?.updatedAt ?? null }
            : { status: 'ready', updatedAt: shouldFetchMeta ? nowTs : (prev.metaMetrics?.updatedAt ?? nowTs) },
          googleAnalytics: settledErrors.includes('googleAnalytics')
            ? { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null }
            : { status: 'ready', updatedAt: shouldFetchGA ? nowTs : (prev.googleAnalytics?.updatedAt ?? nowTs) },
          googleAds: settledErrors.includes('googleAds')
            ? { status: 'error', updatedAt: prev.googleAds?.updatedAt ?? null }
            : { status: 'ready', updatedAt: shouldFetchGAds ? nowTs : (prev.googleAds?.updatedAt ?? nowTs) },
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
      // Mark all non-streaming datasets as 'error' so they don't stay stuck in 'loading'
      setDatasetStatus(prev => {
        const next = { ...prev };
        const nonStreamKeys: DatasetKey[] = ['annualLeave', 'metaMetrics', 'googleAnalytics', 'googleAds', 'emailLists'];
        nonStreamKeys.forEach(key => {
          if (next[key]?.status === 'loading') {
            next[key] = { status: 'error', updatedAt: next[key]?.updatedAt ?? null };
          }
        });
        return next;
      });
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
  ]);

  // Data is NOT auto-fetched on entry. Users trigger loads via:
  // 1. Clicking a report card â†’ handleReportCardClick lazy-loads that report's datasets
  // 2. Clicking "Refresh all" â†’ refreshDatasetsWithStreaming
  // This avoids unnecessary compute and network traffic on every tab visit.


  // Enhanced throttling to prevent excessive refresh triggers
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);
  
  const refreshDatasetsWithStreaming = useCallback(async () => {
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
  }, [performStreamingRefresh, showToast]);

  // Scoped refreshers for specific reports with enhanced throttling
  const refreshCollectedFeesOnly = useCallback(async () => {
    if (isFetching) {
      showToast({
        message: 'A refresh is already running. Please wait for it to finish.',
        type: 'info',
        duration: 4000,
      });
      return;
    }
    setActiveView('dataCentre');
    showToast({
      message: 'Refreshing collected time data...',
      type: 'info',
      duration: 4000,
    });
    await performStreamingRefresh(true, {
      streamTargets: ['recoveredFees'],
      statusTargets: ['recoveredFees'],
    });
  }, [isFetching, performStreamingRefresh, showToast]);

  const refreshAnnualLeaveOnly = useCallback(async () => {
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
  }, [fetchAnnualLeaveDataset, setStatusesFor, isFetching, datasetStatus.annualLeave, showToast]);

  const refreshMetaMetricsOnly = useCallback(async () => {
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
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
    if (lastUpdate && lastUpdate > twoMinutesAgo) {
      debugLog('Meta metrics data is recent, skipping refresh');
      showToast({
        message: 'Meta metrics already fresh. Try again in a minute.',
        type: 'info',
        duration: 3000,
      });
      return;
    }

    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    setStatusesFor(['metaMetrics'], 'loading');
    try {
      const metrics = await fetchMetaMetrics(metaDaysBack, true);
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
  }, [fetchMetaMetrics, setStatusesFor, isFetching, datasetStatus.metaMetrics, showToast, metaDaysBack]);

  const refreshGoogleAnalyticsOnly = useCallback(async (rangeKey: ReportRangeKey = enquiriesRangeKey) => {
    if (datasetStatus.googleAnalytics?.status === 'loading') {
      showToast({
        message: 'GA4 refresh already running. We are still pulling the latest website analytics data.',
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
      const rows = await fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[rangeKey]);
      if (googleAnalyticsRequestIdRef.current !== requestId) {
        return;
      }
      const data = rows || [];
      setDatasetData(prev => ({ ...prev, googleAnalytics: data }));
      const now = Date.now();
      recordReportingDatasetActivity({ key: 'googleAnalytics', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
      setDatasetStatus(prev => ({
        ...prev,
        googleAnalytics: { status: 'ready', updatedAt: now },
      }));
      cachedData = { ...cachedData, googleAnalytics: data };
      cachedTimestamp = now;
      updateRefreshTimestamp(now, setLastRefreshTimestamp);
      showToast({
        message: `Website analytics updated - loaded ${data.length} GA4 rows`,
        type: 'success',
        duration: 5000,
      });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        // Request was aborted, no notification needed
        return;
      }
      console.error('ReportingHome: Failed to refresh website analytics data', error);
      setDatasetStatus(prev => ({
        ...prev,
        googleAnalytics: { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
      }));
      setError(error instanceof Error ? error.message : 'Failed to refresh Google Analytics data');
      showToast({
        message: `Website analytics refresh failed: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        type: 'error',
        duration: 7000,
      });
    }
  }, [datasetStatus.googleAnalytics?.status, enquiriesRangeKey, fetchGoogleAnalyticsData, showToast]);

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
      recordReportingDatasetActivity({ key: 'googleAds', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
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

  const refreshPpcReport = useCallback(async () => {
    if (isFetching || datasetStatus.googleAds?.status === 'loading') {
      showToast({
        message: 'PPC refresh already running. Spend and attribution inputs are still updating.',
        type: 'info',
        duration: 4000,
      });
      return;
    }

    setPpcGoogleAdsData(null);
    setPpcGoogleAdsUpdatedAt(null);

    await performStreamingRefresh(true, {
      rangeOverrides: {
        enquiriesRangeKey,
        mattersRangeKey: mattersWipRangeKey,
      },
      streamTargets: ['enquiries', 'deals', 'instructions', 'allMatters', 'recoveredFees'],
      statusTargets: ['enquiries', 'deals', 'instructions', 'allMatters', 'recoveredFees', 'googleAds'],
      scope: 'all',
    });
  }, [datasetStatus.googleAds?.status, enquiriesRangeKey, isFetching, mattersWipRangeKey, performStreamingRefresh, showToast]);

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
      if (datasetState.status === 'ready') {
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

          // eslint-disable-next-line no-console
          console.info('ðŸ“Š WIP merge diagnosis:', {
            baseWipCount: baseWip.length,
            clioStatus: clioState?.status ?? 'absent',
            clioActivitiesCount: clioActivities?.length ?? 0,
            dbCurrentStatus: dbCurrentState?.status ?? 'absent',
            dbCurrentCount: dbCurrentActivities?.length ?? 0,
            mergeSource: (clioActivities && clioActivities.length > 0) ? 'clio' : (dbCurrentActivities && dbCurrentActivities.length > 0 ? 'db' : 'none'),
            activitiesToMergeCount: activitiesToMerge.length,
          });

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
            // Persist merged result so remounted components get current-week data
            cachedData = { ...cachedData, wip: merged };
          } else {
            setDatasetData(prev => ({
              ...prev,
              wip: baseWip,
            }));
            cachedData = { ...cachedData, wip: baseWip };
          }
        } else {
          // Debug: log when recoveredFees is received
          if (datasetName === 'recoveredFees') {
            const feesData = Array.isArray(datasetState.data) ? datasetState.data : [];
            const latestDates = feesData.slice(0, 10).map((f: any) => f.payment_date);
            console.log('ðŸ’° recoveredFees received:', {
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

        // Update cache (wip is handled specially above to preserve the merge)
        if (datasetName !== 'wip') {
          cachedData = { ...cachedData, [datasetName]: datasetState.data };
        }
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
      debugLog('ðŸ”— Merged current-week activities into WIP (streaming):', {
        base: baseWip.length,
        added: merged.length - baseWip.length,
        total: merged.length,
      });
      // Persist merged result so remounted components get current-week data
      cachedData = { ...cachedData, wip: merged };
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
  }, [isStreamingComplete, isStreamingConnected]);

  // Safety timeout: if streaming takes longer than 10 minutes, forcefully clear the loading state
  // This prevents the UI from getting stuck in a loading state if something goes wrong
  useEffect(() => {
    if (!isFetching || !refreshStartedAt) {
      return;
    }

    const timeout = setTimeout(() => {
      const elapsed = Date.now() - refreshStartedAt;
      const maxWait = 3 * 60 * 1000; // 3 minutes (was 10 â€” too long for non-streaming fetch failures)
      
      if (elapsed > maxWait) {
        debugWarn('ReportingHome: Refresh timeout exceeded (3 minutes). Forcing clear of loading state.');
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
      debugLog(`âœ… Using cached data (${cacheAgeSeconds}s old, <30min) - instant load`);
      return;
    }

    if (preheatInFlightRef.current) {
      debugLog('ðŸ”„ Cache preheat already running, skipping duplicate preheat request');
      return;
    }

    const lastPreheatTs = getLastPreheatTimestamp();
    if (lastPreheatTs && (now - lastPreheatTs) < CACHE_PREHEAT_INTERVAL) {
      const elapsedSeconds = Math.round((now - lastPreheatTs) / 1000);
      const remainingSeconds = Math.max(0, Math.round((CACHE_PREHEAT_INTERVAL - (now - lastPreheatTs)) / 1000));
      debugLog(`â³ Cache preheated ${elapsedSeconds}s ago, skipping background load (retry in ${remainingSeconds}s)`);
      return;
    }

    const commonDatasets = ['teamData', 'userData', 'enquiries', 'allMatters'];
    const cacheAgeSeconds = cacheState.lastCacheTime ? Math.round((now - cacheState.lastCacheTime) / 1000) : null;
    debugLog(`ðŸ”„ Cache refresh needed: ${!hasFetchedOnce ? 'first load' : `cache age: ${cacheAgeSeconds}s (>30min)`}`);
    debugLog('ReportingHome: Preloading common reporting datasets on tab access:', commonDatasets);

    preheatInFlightRef.current = true;
    try {
      const preheatUser = propUserData?.[0];
      await fetch('/api/cache-preheater/preheat', {
        method: 'POST',
        headers: buildRequestAuthHeaders({
          'Content-Type': 'application/json',
          ...(preheatUser?.Email ? { 'x-user-email': String(preheatUser.Email) } : {}),
          ...(preheatUser?.Initials ? { 'x-helix-initials': String(preheatUser.Initials) } : {}),
          ...(preheatUser?.EntraID ? { 'x-helix-entra-id': String(preheatUser.EntraID) } : {}),
        }),
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
  const refreshSpecificDatasets = useCallback(async (datasets: DatasetKey[], reportName: string, options?: SpecificRefreshOptions) => {
    const now = Date.now();
    const timeSinceGlobalRefresh = now - globalLastRefresh;
    const effectiveEnquiriesKey = options?.rangeOverrides?.enquiriesRangeKey ?? enquiriesRangeKey;
    const effectiveMattersKey = options?.rangeOverrides?.mattersRangeKey ?? mattersWipRangeKey;
    const effectiveEnquiriesRange = computeRangeWindowByKey(effectiveEnquiriesKey);
    const effectiveMattersRange = computeMattersRangeWindow(effectiveMattersKey);
    const effectiveMetaDaysBack = computeMetaDaysBackForRange(effectiveEnquiriesKey);
    const streamingRangeOverride = {
      ...buildMattersRangeParams(effectiveMattersRange),
      ...buildEnquiriesRangeParams(effectiveEnquiriesRange),
      ...buildMetaRangeParams(effectiveEnquiriesKey),
    };
    
    // Check global cooldown
    if (!options?.bypassCooldown && timeSinceGlobalRefresh < GLOBAL_REFRESH_COOLDOWN) {
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
        MANAGEMENT_DATASET_KEYS.includes(key) && key !== 'annualLeave' && key !== 'metaMetrics' && key !== 'googleAnalytics' && key !== 'googleAds' && key !== 'emailLists'
      );
      const specialDatasets = datasets.filter(key => !MANAGEMENT_DATASET_KEYS.includes(key) || ['annualLeave', 'metaMetrics', 'googleAnalytics', 'googleAds', 'emailLists'].includes(key));

      // Start streaming for supported datasets
      if (supportedStreamingDatasets.length > 0) {
        startStreamingWithMemo({ datasets: supportedStreamingDatasets, bypassCache: true, queryParams: streamingRangeOverride });
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
            const metrics = await fetchMetaMetrics(effectiveMetaDaysBack);
            setDatasetData(prev => ({ ...prev, metaMetrics: metrics }));
            setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, metaMetrics: metrics };
          } else if (datasetKey === 'googleAnalytics') {
            const data = await fetchGoogleAnalyticsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]);
            setDatasetData(prev => ({ ...prev, googleAnalytics: data }));
            recordReportingDatasetActivity({ key: 'googleAnalytics', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
            setDatasetStatus(prev => ({ ...prev, googleAnalytics: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, googleAnalytics: data };
          } else if (datasetKey === 'googleAds') {
            const data = await fetchGoogleAdsData(RANGE_MONTH_LOOKUP[effectiveEnquiriesKey]);
            setDatasetData(prev => ({ ...prev, googleAds: data }));
            recordReportingDatasetActivity({ key: 'googleAds', status: 'ready', updatedAt: now, count: data.length, source: 'reports' });
            setDatasetStatus(prev => ({ ...prev, googleAds: { status: 'ready', updatedAt: now } }));
            cachedData = { ...cachedData, googleAds: data };
          } else if (datasetKey === 'emailLists') {
            setDatasetStatus(prev => ({ ...prev, emailLists: { status: 'idle', updatedAt: prev.emailLists?.updatedAt ?? null } }));
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
        return false;
      } else {
        // Intentionally no success toast here. The slim card already shows
        // a Loading pill and per-feed status dots, and the report opens
        // immediately after this resolves. Firing a 'data updated' toast at
        // this point is misleading because most reports kick off further,
        // in-report loads on mount (e.g. SEO dimensions), which the user then
        // sees as a separate loading state. Keep the surface joined up:
        // status lives on the card, then in the report itself.
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
  }, [datasetStatus, enquiriesRangeKey, mattersWipRangeKey, setStatusesFor, startStreamingWithMemo, fetchAnnualLeaveDataset, fetchMetaMetrics, fetchGoogleAnalyticsData, fetchGoogleAdsData, showToast]);

  const refreshDataHubDatasets = useCallback(async (keys: ReportingDatasetKey[]) => {
    if (keys.length === 0) return false;
    return refreshSpecificDatasets(keys as DatasetKey[], 'Data Hub', { bypassCooldown: true });
  }, [refreshSpecificDatasets]);

  // ─── Trust gate (Phase B — visible to all users) ───
  // See docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md
  // Rationale: the gate IS the resolution to the Clio-vs-Hub mismatch problem.
  // Hiding it behind a dev preview defeats the purpose — users need to see, every
  // time they open MD, whether the underlying data is trustworthy. Admins keep
  // an override; everyone else is told to retry or open Data Hub if blocked.
  const userInitialsForGate = useMemo(() => {
    const raw = propUserData?.[0]?.Initials;
    return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  }, [propUserData]);
  useEffect(() => registerManagementBlockerSimulationControls(userInitialsForGate), [userInitialsForGate]);
  const canSimulateBlocker = demoModeEnabled && userInitialsForGate === 'LZ';
  const [simulatedBlockerActive, setSimulatedBlockerActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('helix:reporting:managementBlockerSimulation') !== null; } catch { return false; }
  });
  const handleToggleSimulatedBlocker = useCallback(() => {
    if (!canSimulateBlocker) return;
    if (simulatedBlockerActive) {
      clearManagementBlockerSimulation();
      setSimulatedBlockerActive(false);
      showToast({ type: 'success', title: 'Simulated blocker cleared', message: 'Real readiness state restored.' });
    } else {
      simulateManagementBlocker({
        checkId: 'wipWtd',
        reason: 'Simulated broken load (demo mode)',
        message: 'Demo: the WIP feed failed to refresh. This is a simulated blocker.',
      });
      setSimulatedBlockerActive(true);
      showToast({ type: 'warning', title: 'Simulated broken load applied', message: 'Dashboard entry is now blocked by a simulated WIP failure.' });
    }
  }, [canSimulateBlocker, simulatedBlockerActive, showToast]);
  const trustGateEnabled = true;
  const isAdminForGate = useMemo(() => {
    const u = propUserData?.[0];
    return u ? isAdminUser(u) : false;
  }, [propUserData]);
  // Shared readiness payload — feeds both the aggregate trust gate (via
  // ManagementAccessIndicator's own poll) and the per-source trust dots on
  // the report cards. The hook is module-scoped/cached so multiple consumers
  // share a single 5-minute poller.
  const { payload: trustReadinessPayload } = useReportingReadiness(true);
  const [trustGateOverall, setTrustGateOverall] = useState<ReadinessOverall>('ready');
  const [trustGateOverridden, setTrustGateOverridden] = useState(false);
  const blockingPressureTestCheck = useMemo(() => (
    trustReadinessPayload?.checks.find((check) => (
      MANAGEMENT_ENTRY_CHECK_IDS.includes(check.id)
      && check.blocking
      && check.status === 'blocked'
      && check.reason !== 'no-snapshot'
      && check.reason !== 'snapshot-missing-scope'
    )) ?? null
  ), [trustReadinessPayload]);
  const trustGateBlockerDetail = useMemo(
    () => formatReadinessBlockerDetail(blockingPressureTestCheck),
    [blockingPressureTestCheck]
  );
  const handleTrustGateChange = useCallback((overall: ReadinessOverall) => {
    setTrustGateOverall(overall);
  }, []);
  const handleTrustGateOverride = useCallback(() => {
    setTrustGateOverridden(true);
    showToast({
      type: 'warning',
      title: 'Trust gate overridden',
      message: 'Opening Management Dashboard with possibly stale data — recorded for audit.',
    });
  }, [showToast]);
  const trustGateBlocksEntry = trustGateEnabled && !trustGateOverridden && trustGateOverall === 'blocked';
  // Trust gate has not yet returned a 'ready' verdict — used to keep the slim
  // CTA visually disabled until backend signals are confirmed green.
  const trustGateNotReady = trustGateEnabled && !trustGateOverridden && trustGateOverall !== 'ready';

  // Slim Reports surface: everyone outside the Reports dev-preview audience sees
  // the stripped-back workspace. LZ and AC stay on the full report surface by
  // default so dev-preview reports can be tested, but flipping the session-tools
  // View as Prod toggle simulates the slim surface for them too. Their card
  // whitelist (including SEO) still applies, so the SEO tile keeps showing up
  // in the slim secondary reports strip.
  const isSlimReports = !isReportsDevPreview || Boolean(featureToggles?.viewAsProd);
  const showLegacyReportsChrome = !isSlimReports && !isLocalReportsSurface;

  const { state: slimRemediateState, remediate: slimRemediate } = useReadinessRemediate('collectedMtd');
  const slimRemediateFiredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSlimReports) return;
    if (!trustGateBlocksEntry || blockingPressureTestCheck?.id !== 'collectedMtd') {
      slimRemediateFiredForRef.current = null;
      return;
    }
    // Fire once per blocked transition. Server-side teamsEscalation handles
    // the Luke DM after attempts hit the ceiling.
    const stamp = trustReadinessPayload?.generatedAt || 'blocked';
    if (slimRemediateFiredForRef.current === stamp) return;
    if (slimRemediateState.status === 'running') return;
    slimRemediateFiredForRef.current = stamp;
    void slimRemediate();
  }, [blockingPressureTestCheck?.id, isSlimReports, trustGateBlocksEntry, trustReadinessPayload?.generatedAt, slimRemediate, slimRemediateState.status]);
  const slimNotifiedLuke = slimRemediateState.status === 'escalated' || slimRemediateState.status === 'persisted';

  // More conservative auto-refresh logic to prevent excessive refreshing
  const handleOpenDashboard = useCallback(() => {
    // Trust gate (Phase B): block entry if dev preview user has unresolved blocking checks.
    // Demo mode normally bypasses the gate so walkthroughs always open into live data,
    // but a Luke-triggered simulated blocker must always take effect so the failure UX
    // can be exercised on demand.
    if (trustGateBlocksEntry && (!demoModeEnabled || simulatedBlockerActive)) {
      debugLog('Trust gate blocked - refusing to open Management Dashboard');
      showToast({
        type: 'error',
        title: 'Reports access paused',
        message: trustGateBlockerDetail || 'Use the indicator next to the Management Dashboard tile to refresh and retry.',
      });
      return;
    }

    // Immediately show loading state for better UX
    setActiveView('dashboard');
    
    // In test mode, skip data refresh entirely (demo mode still pulls live data).
    if (testMode && !demoModeEnabled) {
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
  }, [hasFetchedOnce, isFetching, isStreamingConnected, refreshDatasetsWithStreaming, testMode, trustGateBlocksEntry, trustGateBlockerDetail, simulatedBlockerActive, showToast, demoModeEnabled, slimSelectedRangeKey]);

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
      if (Array.isArray(propUserData) && propUserData.length > 0) {
        setDatasetStatus((prev) => ({
          ...prev,
          userData: { status: 'ready', updatedAt: prev.userData?.updatedAt ?? Date.now() },
        }));
      }
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
      if (Array.isArray(propTeamData) && propTeamData.length > 0) {
        setDatasetStatus((prev) => ({
          ...prev,
          teamData: { status: 'ready', updatedAt: prev.teamData?.updatedAt ?? Date.now() },
        }));
      }
    }
  }, [propTeamData]);

  // Memoize expensive dataset summaries computation with better dependency tracking
  const datasetSummaries = useMemo(() => {
    const visibleDatasets = isReportsDevPreview
      ? DATASETS
      : DATASETS.filter((dataset) => !DEV_PREVIEW_ONLY_DATASETS.has(dataset.key));
    return visibleDatasets.map((dataset) => {
      // Check if this dataset is being streamed
      const streamingState = streamingDatasets[dataset.key];
      const useStreamingState = streamingState && (isStreamingConnected || streamingState.status !== 'idle');

      const value = useStreamingState ? streamingState.data : datasetData[dataset.key];
      const meta = useStreamingState 
        ? { status: streamingState.status, updatedAt: streamingState.updatedAt }
        : datasetStatus[dataset.key];

      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
      const localStatus: DatasetStatusValue = meta.status === 'loading'
        ? 'loading'
        : hasValue
          ? 'ready'
          : meta.status;
      const localCount = useStreamingState ? (streamingState.count || 0) : (Array.isArray(value) ? value.length : hasValue ? 1 : 0);
      const externalActivity = externalDatasetActivity[dataset.key];
      const activityIsNewer = Boolean(externalActivity && externalActivity.updatedAt >= (meta.updatedAt ?? 0));
      const status: DatasetStatusValue = activityIsNewer && externalActivity ? externalActivity.status : localStatus;
      const count = activityIsNewer && externalActivity ? Math.max(localCount, externalActivity.count) : localCount;
      const cached = activityIsNewer && externalActivity ? externalActivity.cached : (useStreamingState ? streamingState.cached : false);
      
      return {
        definition: dataset,
        status,
        updatedAt: activityIsNewer && externalActivity ? externalActivity.updatedAt : meta.updatedAt,
        count,
        cached,
      };
    });
  }, [datasetData, datasetStatus, externalDatasetActivity, streamingDatasets, isStreamingConnected, isReportsDevPreview]);

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
  // Heavy datasets (recoveredFees, wip) get up to 10min; light datasets get 2min
  useEffect(() => {
    if (!refreshStartedAt || !isFetching) return;
    
    const timeoutHandle = setInterval(() => {
      const elapsedMs = Date.now() - refreshStartedAt;
      
      datasetSummaries.forEach(summary => {
        if (summary.status === 'loading') {
          // Heavy datasets get more time (10 min / 600s)
          const isHeavy = ['recoveredFees', 'wip'].includes(summary.definition.key);
          const timeoutMs = isHeavy ? 600000 : 120000; // 10min vs 2min
          
          if (elapsedMs > timeoutMs) {
            const timeoutSec = Math.round(timeoutMs / 1000);
            console.warn(`âš ï¸ Dataset ${summary.definition.key} stuck loading for ${Math.round(elapsedMs / 1000)}s (timeout: ${timeoutSec}s) - marking as error`);
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
    return phase?.label ?? 'Finalising reporting data...';
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
  const entrySnapshotDateKey = format(currentTime, 'yyyy-MM-dd');
  const showEntrySnapshot = isLocalReportsSurface && !Boolean(featureToggles?.viewAsProd);
  const entrySnapshot = useMemo<EntrySnapshotModel>(() => {
    const anchor = new Date(`${entrySnapshotDateKey}T12:00:00`);
    const elapsedDays = Math.max(1, anchor.getDate());
    const currentPeriod = buildEntryMonthPeriod(anchor, 0, elapsedDays);
    const previousPeriod = buildEntryMonthPeriod(anchor, -1, elapsedDays);

    const getEnquiryDate = (row: Enquiry) => parseDateLoose(row.Date_Created || row.Touchpoint_Date);
    const getMatterDate = (row: Matter) => parseDateLoose(
      row.OpenDate
      || (row as any)['Open Date']
      || (row as any).openDate
      || (row as any).open_date
      || (row as any).DateOpened
    );
    const getInstructionDate = (row: InstructionRecord) => parseDateLoose(row.SubmissionDate || row.CreatedDate);
    const getWipDate = (row: WIP) => parseDateLoose(row.date || row.created_at);
    const getRecoveredDate = (row: RecoveredFee) => parseDateLoose(row.payment_date);

    const enquiriesCurrent = sumEntriesForPeriod(datasetData.enquiries, currentPeriod, getEnquiryDate);
    const enquiriesPrevious = sumEntriesForPeriod(datasetData.enquiries, previousPeriod, getEnquiryDate);
    const mattersCurrent = sumEntriesForPeriod(datasetData.allMatters, currentPeriod, getMatterDate);
    const mattersPrevious = sumEntriesForPeriod(datasetData.allMatters, previousPeriod, getMatterDate);
    const instructionsCurrent = sumEntriesForPeriod(datasetData.instructions, currentPeriod, getInstructionDate);
    const instructionsPrevious = sumEntriesForPeriod(datasetData.instructions, previousPeriod, getInstructionDate);
    const wipCurrent = sumEntriesForPeriod(datasetData.wip, currentPeriod, getWipDate, (row) => toNumberSafe(row.total));
    const wipPrevious = sumEntriesForPeriod(datasetData.wip, previousPeriod, getWipDate, (row) => toNumberSafe(row.total));
    const collectedCurrent = sumEntriesForPeriod(datasetData.recoveredFees, currentPeriod, getRecoveredDate, (row) => isCollectedFeeRow(row) ? toNumberSafe(row.payment_allocated) : 0);
    const collectedPrevious = sumEntriesForPeriod(datasetData.recoveredFees, previousPeriod, getRecoveredDate, (row) => isCollectedFeeRow(row) ? toNumberSafe(row.payment_allocated) : 0);

    const makeMetric = (
      key: EntrySnapshotMetricKey,
      label: string,
      kind: EntrySnapshotMetricKind,
      current: number,
      previous: number,
      note: string,
      conversionNote?: string,
    ): EntrySnapshotMetric => {
      const delta = current - previous;
      const deltaPercent = previous > 0 ? (delta / previous) * 100 : current === 0 ? 0 : null;
      const projected = (current / currentPeriod.elapsedDays) * currentPeriod.daysInMonth;
      return { key, label, kind, current, previous, delta, deltaPercent, projected, note, conversionNote };
    };

    const formatConversion = (value: number, base: number, suffix: string) => (
      base > 0 ? `${((value / base) * 100).toFixed(0)}% ${suffix}` : `No ${suffix.replace('of ', '')} base yet`
    );

    const currentCollectedDaily = buildDailySeries(datasetData.recoveredFees, currentPeriod.start, currentPeriod.daysInMonth, getRecoveredDate, (row) => isCollectedFeeRow(row) ? toNumberSafe(row.payment_allocated) : 0);
    const previousCollectedDailyRaw = buildDailySeries(datasetData.recoveredFees, previousPeriod.start, previousPeriod.daysInMonth, getRecoveredDate, (row) => isCollectedFeeRow(row) ? toNumberSafe(row.payment_allocated) : 0);
    const previousCollectedDaily = Array.from({ length: currentPeriod.daysInMonth }, (_, index) => previousCollectedDailyRaw[index] ?? 0);
    const currentActualValues = cumulativeSeries(currentCollectedDaily, currentPeriod.elapsedDays).slice(0, currentPeriod.elapsedDays);
    const currentTotal = currentActualValues.at(-1) ?? 0;
    const dailyAverage = currentTotal / currentPeriod.elapsedDays;
    const projectedValues = Array.from({ length: currentPeriod.daysInMonth }, (_, index) => (
      index < currentPeriod.elapsedDays
        ? currentActualValues[index] ?? currentTotal
        : currentTotal + (dailyAverage * (index + 1 - currentPeriod.elapsedDays))
    ));
    const previousValues = cumulativeSeries(previousCollectedDaily);
    const maxValue = Math.max(1, ...currentActualValues, ...projectedValues, ...previousValues);
    const currentLine = buildSnapshotLine(currentActualValues, maxValue, 420, 16, 118, currentPeriod.daysInMonth);
    const previousLine = buildSnapshotLine(previousValues, maxValue, 420, 16, 118, currentPeriod.daysInMonth);
    const projectionLine = buildSnapshotLine(projectedValues, maxValue, 420, 16, 118, currentPeriod.daysInMonth);

    const readyFeeds = (['enquiries', 'allMatters', 'instructions', 'wip', 'recoveredFees'] as DatasetKey[])
      .filter((key) => datasetStatus[key]?.status === 'ready' || (Array.isArray(datasetData[key]) && (datasetData[key] as unknown[]).length > 0))
      .length;

    return {
      currentLabel: currentPeriod.label,
      previousLabel: `${previousPeriod.label} to day ${previousPeriod.elapsedDays}`,
      elapsedDays: currentPeriod.elapsedDays,
      daysInMonth: currentPeriod.daysInMonth,
      pipeline: [
        makeMetric('enquiries', 'Enquiries', 'count', enquiriesCurrent, enquiriesPrevious, `${currentPeriod.elapsedDays}/${currentPeriod.daysInMonth} days in`, 'Entry volume'),
        makeMetric('matters', 'Matters', 'count', mattersCurrent, mattersPrevious, 'Opened matters', formatConversion(mattersCurrent, enquiriesCurrent, 'of enquiries')),
        makeMetric('instructions', 'Instructions', 'count', instructionsCurrent, instructionsPrevious, 'Confirmed outcomes', formatConversion(instructionsCurrent, mattersCurrent, 'of matters')),
      ],
      money: [
        makeMetric('wip', 'WIP', 'currency', wipCurrent, wipPrevious, 'Recorded value'),
        makeMetric('collected', 'Collected', 'currency', collectedCurrent, collectedPrevious, 'Cash recovered'),
      ],
      collectedChart: {
        currentLine,
        previousLine,
        projectionLine,
        currentArea: buildSnapshotArea(currentLine),
        maxValue,
      },
      readyCount: readyFeeds,
      totalFeeds: 5,
    };
  }, [datasetData.allMatters, datasetData.enquiries, datasetData.instructions, datasetData.recoveredFees, datasetData.wip, datasetStatus, entrySnapshotDateKey]);
  
  // Reports are always clickable â€” handleReportCardClick lazy-loads datasets on demand
  const canUseReports = true;

  // Function to handle report card clicks with loading feedback
  const handleReportCardClick = async (
    reportKey: string,
    action: () => void | Promise<void>,
    dependencies: string[],
    prepareReport?: () => boolean | Promise<boolean>,
    options?: SpecificRefreshOptions & { forceRefresh?: boolean },
  ) => {
    const isCurrentlyLoading = reportProgressStates[reportKey]?.isLoading || reportLoadingStates[reportKey as keyof typeof reportLoadingStates];
    
    if (isCurrentlyLoading) {
      return; // Don't allow clicks while loading
    }

    const reportName = AVAILABLE_REPORTS.find(r => r.key === reportKey)?.name || reportKey;
    const shouldQueueReport = Boolean(REPORT_DATASET_REQUIREMENTS[reportKey]);
    if (shouldQueueReport) requestProcessingRailReport(reportKey);

    // Check if data needs to be refreshed
    // 'loading' is NOT treated as needing a new refresh â€” it means a fetch is already in progress.
    // Only 'idle', 'error', or missing status triggers a fresh load.
    const needsRefresh = Boolean(options?.forceRefresh) || dependencies.some(dep => {
      const status = datasetStatus[dep as keyof typeof datasetStatus];
      return !status || status.status === 'idle' || status.status === 'error';
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
        const success = await refreshSpecificDatasets(dependencies as DatasetKey[], reportName, {
          rangeOverrides: options?.rangeOverrides,
          bypassCooldown: options?.forceRefresh,
        });
        
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
          if (shouldQueueReport) settleProcessingRailReport(reportKey, false);
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
        if (shouldQueueReport) settleProcessingRailReport(reportKey, false);
        return; // Don't execute the action if there was an error
      }
    }

    // Execute the action (navigate to report or open dashboard)
    if (typeof action === 'function') {
      // Wait briefly for streaming datasets to settle to 'ready' before
      // navigating, so reports don't open empty and "lag till read". We poll
      // datasetStatusRef every 250ms up to 60s. Any dataset that ends in
      // 'error' lets the user in anyway with a toast warning so they aren't
      // stuck behind a broken feed.
      if (dependencies.length > 0) {
        setReportProgressStates((prev) => ({
          ...prev,
          [reportKey]: {
            ...(prev[reportKey] || { isLoading: true, progress: 50, startTime: Date.now() }),
            isLoading: true,
            stage: 'Waiting for feeds…',
          },
        }));

        const waitStart = Date.now();
        const waitTimeoutMs = 60000;
        const allReady = await new Promise<boolean>((resolve) => {
          const tick = () => {
            const current = datasetStatusRef.current;
            const ready = dependencies.every((dep) => current[dep as DatasetKey]?.status === 'ready');
            const errored = dependencies.some((dep) => current[dep as DatasetKey]?.status === 'error');
            if (ready) { resolve(true); return; }
            if (errored) { resolve(false); return; }
            if (Date.now() - waitStart > waitTimeoutMs) { resolve(false); return; }
            setTimeout(tick, 250);
          };
          tick();
        });

        let reportReady = allReady;
        if (allReady && prepareReport) {
          setReportProgressStates((prev) => ({
            ...prev,
            [reportKey]: {
              ...(prev[reportKey] || { isLoading: true, progress: 75, startTime: Date.now() }),
              isLoading: true,
              stage: 'Preparing report window...',
            },
          }));
          try {
            reportReady = await prepareReport();
          } catch {
            reportReady = false;
          }
        }

        if (shouldQueueReport) settleProcessingRailReport(reportKey, reportReady);

        setReportProgressStates((prev) => {
          const newState = { ...prev };
          delete newState[reportKey];
          return newState;
        });

        return;
      }

      if (shouldQueueReport) {
        settleProcessingRailReport(reportKey, true);
        return;
      }

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
      marketingPerformance: datasetStatus.googleAnalytics?.status === 'loading',
      receptionReport: receptionReportStatus === 'loading',
      ppcReport: datasetStatus.googleAds?.status === 'loading' || ppcLoading,
    };
  }, [
    isReportLoading,
    datasetStatus.annualLeave?.status,
    datasetStatus.metaMetrics?.status,
    datasetStatus.googleAnalytics?.status,
    receptionReportStatus,
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
      return `Elapsed ${formatDurationMs(refreshElapsedMs)}${refreshPhaseLabel ? ` | ${refreshPhaseLabel}` : ''}`;
    }
    if (isStreamingConnected) {
      return `Elapsed ${formatDurationMs(refreshElapsedMs)} | Progress: ${Math.round(streamingProgress.percentage)}% | Redis caching active`;
    }
    return 'Preparing data sources...';
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
    `${formattedDate} | ${formattedTime}`,
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
    return initials.length > 0 ? initials.join(' | ') : null;
  }, [datasetData.userData]);

  const renderAvailableReportCards = () => {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    // Cards that show as live in production (and stay un-greyed on localhost).
    // Mirrors AVAILABLE_REPORTS entries marked tier: 'prod'.
    const PROD_REPORT_KEYS = isReportsDevPreview
      ? ['dashboard', 'receptionReport', 'enquiries']
      : ['dashboard', 'receptionReport', 'enquiries'];
    const decorateLocalPpcCard = (card: ReportCard) => {
      if (!isLocal || card.key !== 'ppc') {
        return card;
      }
      return {
        ...card,
        disabled: false,
        development: true,
        status: 'Local dev preview',
      };
    };
    const isLocalPpcCard = (card: ReportCard) => isLocal && card.key === 'ppc';

    const rcProps = {
      isDarkMode,
      testMode,
      expandedReportCards,
      activePrimaryCard,
      reportProgressStates,
      reportLoadingStates,
      isActivelyLoading,
      onExpandedCardsChange: setExpandedReportCards,
      onActivePrimaryCardChange: setActivePrimaryCard,
      onOpenDashboard: handleLaunchDashboard,
      onNavigateToReport: navigateToReport as (view: string) => void,
      onCardClick: handleReportCardClick,
      refreshDatasetsWithStreaming,
      refreshAnnualLeaveOnly,
      refreshMattersScoped,
      refreshEnquiriesScoped,
      refreshMetaMetricsOnly,
      refreshGoogleAnalyticsOnly,
      refreshGoogleAdsOnly,
      managementSliderValue,
      managementSliderHasPendingChange,
      managementRangeIsRefreshing,
      onManagementSliderChange: handleManagementSliderValueChange,
      onApplyManagementRange: handleApplyManagementRange,
      mattersWipRangeKey,
      pendingMattersRangeKey,
      mattersRangeSliderValue,
      sliderHasPendingChange,
      wipRangeIsRefreshing,
      onMattersSliderChange: handleMattersSliderValueChange,
      onApplyPendingMattersRange: handleApplyPendingMattersRange,
      enquiriesRangeKey,
      pendingEnquiriesRangeKey,
      enquiriesRangeSliderValue,
      enquiriesSliderHasPendingChange,
      enquiriesRangeIsRefreshing,
      onEnquiriesSliderChange: handleEnquiriesSliderValueChange,
      onApplyPendingEnquiriesRange: handleApplyPendingEnquiriesRange,
      describeRangeKey,
      describeMattersRange,
    };

    const isViewingAsProd = Boolean(featureToggles?.viewAsProd);
    const visibleCards = reportCards.filter((card) => {
      if (card.key === 'receptionReport' && !canSeeReceptionReport(userInitialsForGate)) {
        return false;
      }
      if (card.key === 'enquiryLedger') {
        return canViewEnquiryLedger;
      }
      if (isLocal && !isViewingAsProd) {
        return true;
      }
      return PROD_REPORT_KEYS.includes(card.key);
    }).map(decorateLocalPpcCard);

    // Hero: dashboard stands alone
    const heroCard = visibleCards.find(card => card.key === 'dashboard');
    // Split remaining into active vs disabled
    const activeCards = visibleCards.filter(card => card.key !== 'dashboard' && !card.disabled && !card.development);
    const developmentCards = visibleCards.filter(card => card.development && !card.disabled);
    const disabledCards = visibleCards.filter(card => card.disabled);
    const productionSecondaryCards = activeCards.filter(card => PROD_REPORT_KEYS.includes(card.key));
    const localActiveCards = activeCards.filter(card => !PROD_REPORT_KEYS.includes(card.key));
    const hasLocalWorkspace = isLocalReportsSurface && !isViewingAsProd && (
      localActiveCards.length > 0
      || developmentCards.length > 0
      || disabledCards.length > 0
      || reportingStructureStatus !== 'idle'
    );

    // Locally: keep unreleased draft cards visually muted, but allow explicitly-enabled draft tools through.
    const isGreyedOut = (key: string) => isLocal && !PROD_REPORT_KEYS.includes(key) && key !== 'enquiryLedger' && key !== 'ppc';
    const getCardShellStyle = (card: ReportCard) => {
      if (isLocalPpcCard(card)) {
        return { position: 'relative' as const };
      }
      return isGreyedOut(card.key)
        ? { opacity: 0.4, pointerEvents: 'none' as const, filter: 'grayscale(0.6)' }
        : undefined;
    };
    const ppcDevBadge = (card: ReportCard) => isLocalPpcCard(card) ? (
      <>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 2,
            padding: '3px 8px',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colours.orange,
            background: isDarkMode ? `${colours.orange}14` : `${colours.orange}12`,
            border: `1px solid ${isDarkMode ? `${colours.orange}55` : `${colours.orange}33`}`,
            borderRadius: 0,
            pointerEvents: 'none',
          }}
        >
          Dev
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 10,
            zIndex: 1,
            border: `1.5px dotted ${colours.orange}`,
            borderRadius: 0,
            pointerEvents: 'none',
            opacity: isDarkMode ? 0.85 : 0.75,
          }}
        />
      </>
    ) : null;

    const renderStructurePanel = () => {
      if (!isLocalReportsSurface) return null;
      const formatCount = (value: number) => value.toLocaleString('en-GB');
      const panelBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
      const moduleRows = reportingStructure?.modules.slice(0, 6) ?? [];
      const fileRows = reportingStructure?.largestFiles.slice(0, 8) ?? [];
      return (
        <div
          data-helix-region="reports/local-structure"
          style={{
            marginTop: 16,
            border: `1px solid ${panelBorder}`,
            backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
            borderRadius: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '14px 16px',
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
            borderBottom: `1px solid ${panelBorder}`,
          }}>
            <span style={{ display: 'block', minWidth: 0 }}>
              <span style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: colours.cta,
              }}>
                Local Reports structure
              </span>
              <span style={{
                display: 'block',
                marginTop: 4,
                fontSize: 12,
                lineHeight: 1.4,
                color: isDarkMode ? '#d1d5db' : '#374151',
              }}>
                Dynamic file and module counts from src/tabs/Reporting.
              </span>
            </span>
            <span style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              fontWeight: 800,
              color: isDarkMode ? colours.dark.text : colours.light.text,
            }}>
              {reportingStructureStatus === 'loading'
                ? 'Counting files'
                : reportingStructureStatus === 'error'
                  ? 'Count unavailable'
                  : reportingStructure
                    ? `${formatCount(reportingStructure.totals.files)} files, ${formatCount(reportingStructure.totals.lines)} lines`
                    : 'Waiting'}
            </span>
          </div>

          {reportingStructure && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.05fr)', gap: 0 }}>
              <div style={{ padding: 16, borderRight: `1px solid ${panelBorder}` }}>
                <span style={{
                  display: 'block',
                  marginBottom: 10,
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}>
                  Modules
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {moduleRows.map((row) => (
                    <div key={row.module} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }} title={row.module}>
                        {row.module.replace('src/tabs/Reporting', 'Reporting')}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                        {formatCount(row.files)} files / {formatCount(row.lines)} lines
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <span style={{
                  display: 'block',
                  marginBottom: 10,
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}>
                  Largest files
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fileRows.map((row) => (
                    <div key={row.path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }} title={row.path}>
                        {row.path.replace('src/tabs/Reporting/', '')}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: row.lines >= 3000 ? colours.cta : (isDarkMode ? '#d1d5db' : '#374151') }}>
                        {formatCount(row.lines)} lines
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Slim Reports surface: keep Management Dashboard as the primary path,
    // then show live secondary reports underneath it. Development and disabled
    // sections stay dropped so the workspace remains focused in production.
    if (isSlimReports || isLocalReportsSurface) {
      if (!heroCard) return null;
      const slimNeedsRange = !slimRangeInvoked || slimSelectedRangeKey === null;
      const slimRangeRefreshing = enquiriesRangeIsRefreshing || isActivelyLoading;
      const slimDashboardFeedCues = MANAGEMENT_DASHBOARD_STATUS_TARGETS.map((datasetKey) => {
        const summary = datasetSummaries.find((entry) => entry.definition.key === datasetKey);
        const definition = DATASETS.find((entry) => entry.key === datasetKey);
        const status = summary?.status ?? datasetStatus[datasetKey]?.status ?? 'idle';
        const badge = STATUS_BADGE_COLOURS[status];
        return {
          key: datasetKey,
          name: definition?.name ?? datasetKey,
          status,
          label: badge.label,
          dot: badge.dot,
          backgroundColor: isDarkMode ? badge.darkBg : badge.lightBg,
          updatedAt: summary?.updatedAt ?? datasetStatus[datasetKey]?.updatedAt ?? null,
          detail: status === 'ready'
            ? 'Feed is ready for the current dashboard window.'
            : status === 'loading'
              ? 'This feed is refreshing in the background now.'
              : status === 'error'
                ? 'This feed failed to load and needs a retry.'
                : 'This feed has not been loaded yet for this range.',
        };
      });
      const slimShowFeedState = slimRangeInvoked && !slimNeedsRange;
      const slimDashboardFeedsReady = slimShowFeedState && slimDashboardFeedCues.length > 0 && slimDashboardFeedCues.every((cue) => cue.status === 'ready');
      const slimDashboardFeedsFailed = slimShowFeedState && slimDashboardFeedCues.some((cue) => cue.status === 'error');
      const slimDashboardFeedsLoading = slimShowFeedState && slimDashboardFeedCues.some((cue) => cue.status === 'loading');
      const slimReadyFeedCount = slimDashboardFeedCues.filter((cue) => cue.status === 'ready').length;
      const slimRefreshingFeedCount = slimDashboardFeedCues.filter((cue) => cue.status === 'loading').length;
      const slimIssueFeedCount = slimDashboardFeedCues.filter((cue) => cue.status === 'error').length;
      const slimFeedSummary = slimDashboardFeedsReady
        ? `${slimDashboardFeedCues.length} feeds ready`
        : [
          `${slimReadyFeedCount}/${slimDashboardFeedCues.length} ready`,
          slimRefreshingFeedCount > 0 ? `${slimRefreshingFeedCount} refreshing` : null,
          slimIssueFeedCount > 0 ? `${slimIssueFeedCount} issue${slimIssueFeedCount === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(', ');
      const slimActiveRangeLabel = slimSelectedRangeKey ? describeRangeKey(slimSelectedRangeKey) : null;
      const slimActiveRangeSummary = slimActiveRangeLabel ? `Active pull: ${slimActiveRangeLabel.toLowerCase()}.` : null;
      const slimOpenDisabled = slimNeedsRange || !slimShowFeedState || !slimDashboardFeedsReady || isActivelyLoading || ((!demoModeEnabled || simulatedBlockerActive) && trustGateNotReady);
      const slimStatusColour = !slimShowFeedState
        ? colours.highlight
        : slimDashboardFeedsFailed
          ? colours.cta
        : isActivelyLoading
          ? colours.highlight
        : slimDashboardFeedsLoading || !slimDashboardFeedsReady || trustGateNotReady
          ? colours.highlight
        : trustGateBlocksEntry
          ? colours.cta
          : colours.green;
      const slimCtaDetail = slimNeedsRange
        ? 'Select a range to load feeds.'
        : slimDashboardFeedsFailed
          ? `${slimActiveRangeSummary ?? 'Active pull needs attention.'} One or more feeds need a retry.`
        : isActivelyLoading || slimDashboardFeedsLoading
          ? null
        : !slimDashboardFeedsReady
          ? null
        : trustGateBlocksEntry
          ? trustGateBlockerDetail || 'The data gate has not cleared yet.'
          : trustGateNotReady
          ? 'The dashboard opens when the data checks pass.'
          : null;
      const slimHeroTitle = 'Management dashboard';
      const slimHeroDescription = slimNeedsRange
        ? 'Firm-wide reporting with feed readiness and management controls in one view.'
        : slimDashboardFeedsFailed
          ? 'A feed needs attention before the dashboard can open.'
        : slimRangeRefreshing
          ? `Loading the dashboard feeds for ${slimActiveRangeLabel?.toLowerCase() ?? 'the selected window'}.`
        : !slimDashboardFeedsReady
          ? `Waiting for the remaining dashboard feeds for ${slimActiveRangeLabel?.toLowerCase() ?? 'the selected window'}.`
        : `Dashboard data is loaded for ${slimActiveRangeLabel?.toLowerCase() ?? 'the selected window'}.`;
      const slimTrayTitle = !slimShowFeedState
        ? 'Dashboard feeds'
        : slimDashboardFeedsFailed
          ? 'Feed issue'
        : slimRangeRefreshing || slimDashboardFeedsLoading
          ? 'Loading dashboard data'
        : slimDashboardFeedsReady
          ? 'Ready'
          : 'Preparing';
      const slimTrayDetail = !slimShowFeedState
        ? 'Pick the window you want to use.'
        : slimDashboardFeedsFailed
          ? `${slimActiveRangeSummary ?? 'Active pull needs attention.'} Check the feeds before opening the dashboard.`
        : slimRangeRefreshing || slimDashboardFeedsLoading
          ? [slimActiveRangeSummary, slimFeedSummary].filter(Boolean).join(' ')
        : slimDashboardFeedsReady
          ? `${slimActiveRangeSummary ?? 'Active pull is ready.'} Open when ready.`
          : [slimActiveRangeSummary, slimFeedSummary].filter(Boolean).join(' ');
      const slimHoveredRangeDetail = hoveredRangeEstimate?.ownerKey === 'dashboard'
        ? `${REPORT_RANGE_OPTIONS.find((option) => option.key === hoveredRangeEstimate.rangeKey)?.shortLabel ?? describeRangeKey(hoveredRangeEstimate.rangeKey)} refresh est. ${getRangeRefreshEstimate(hoveredRangeEstimate.rangeKey, 'dashboard')}`
        : null;
      const slimManagementFooterIsBlue = slimManagementFooterHovered || slimRangeRefreshing || slimDashboardFeedsLoading || Boolean(slimHoveredRangeDetail);
      const getSlimSecondaryReportDetail = (card: ReportCard) => {
        if (card.key === 'seo') {
          return card.description || 'Organic search performance, attributable enquiries, matters, and fee outcome across the selected window.';
        }
        if (card.key === 'receptionReport') {
          return 'Review reception calls, conversion, notes clarity, and open follow-up work.';
        }
        if (card.key === 'marketingPerformance') {
          return 'Website, SEO, PPC, and internal outcome metrics from the selected data window.';
        }
        return 'Open this live report separately from the dashboard period pull.';
      };
      const handleSlimSecondaryRangeSelect = (cardKey: string, nextKey: ReportRangeKey) => {
        if (cardKey === 'receptionReport') {
          setSlimReceptionRangeKey(nextKey);
          clearProcessingRailReport(cardKey);
          return;
        }
        if (cardKey === 'marketingPerformance') {
          setSlimMarketingRangeKey(nextKey);
          clearProcessingRailReport(cardKey);
          return;
        }
        if (cardKey === 'seo') {
          setSlimSeoRangeKey(nextKey);
          clearProcessingRailReport(cardKey);
        }
      };
      const handleSlimRangeSelect = (nextKey: ReportRangeKey) => {
        const nextMattersKey = nextKey as MattersWipRangeKey;
        const nextLabel = describeRangeKey(nextKey).toLowerCase();
        slimDashboardRangeToastLabelRef.current = nextLabel;
        setSlimRangeInvoked(true);
        setSlimSelectedRangeKey(nextKey);
        requestProcessingRailReport('dashboard');
        applyManagementRangeAndRefresh(nextKey, nextMattersKey, true);
      };
      const railCards = [heroCard, ...productionSecondaryCards].filter(Boolean) as ReportCard[];
      const buildReportRailItem = (
        card: ReportCard,
        request: ProcessingRailRequest | undefined,
        opts: { embedded?: boolean; hasData?: boolean; reportReady?: boolean } = {},
      ): ReportProcessingRailItem => {
        const rows = card.dependencies.map((dep): ReportProcessingRailRow => ({
          key: dep.key,
          label: dep.name,
          status: request?.settled && !request.failed ? 'ready' : toProcessingRailStatus(dep.status),
          detail: dep.status === 'ready'
            ? 'Loaded'
            : dep.status === 'loading'
              ? 'Refreshing now'
              : dep.status === 'error'
                ? 'Needs retry'
                : dep.range || 'Waiting',
        }));
        const rawStatus = rows.length > 0 ? summariseProcessingRailStatus(rows) : 'ready';
        const itemStatus: ReportProcessingRailStatus = request?.failed
          ? 'error'
          : request?.settled
            ? rawStatus === 'idle' ? 'ready' : rawStatus
            : request
              ? (rawStatus === 'error' ? 'error' : 'loading')
              : rawStatus;
        const allDepsReady = card.dependencies.length === 0 || card.dependencies.every((dep) => dep.status === 'ready');
        const dataMissing = opts.hasData === false;
        const reportReadyBlocked = opts.reportReady === false;
        const reportOutputPending = reportReadyBlocked && !request;
        const canOpen = dataMissing
          ? false
          : reportReadyBlocked
            ? false
          : request
            ? Boolean(request.settled && !request.failed && itemStatus === 'ready')
            : (allDepsReady && itemStatus !== 'error');
        const elapsedSeconds = request ? Math.max(0, Math.round((Date.now() - request.requestedAt) / 1000)) : 0;
        const visualIcon = card.key === 'seoReport' ? 'AnalyticsReport' : 'Sync';
        const title = canOpen
          ? `${card.name} is ready`
          : dataMissing
            ? `${card.name} has no data`
            : reportOutputPending
              ? card.name
            : request
              ? `Loading ${card.name}`
              : itemStatus === 'error'
                ? `${card.name} needs a retry`
                : itemStatus === 'loading'
                  ? `Loading ${card.name}`
                  : card.name;
        const ctaLabel = canOpen
          ? `Open ${card.name}`
          : dataMissing
            ? 'No data yet'
            : reportOutputPending
              ? 'Load report data'
            : request?.failed
              ? 'Retry'
              : itemStatus === 'loading'
                ? 'Loading data'
                : 'Load report data';
        const onOpen = () => {
          if (request) clearProcessingRailReport(card.key);
          navigateToReport(card.action as ActiveViewType);
        };
        const onPrepare = () => {
          const selectedRangeKey = card.key === 'receptionReport'
            ? slimReceptionRangeKey
            : card.key === 'seo'
              ? slimSeoRangeKey
              : card.key === 'marketingPerformance'
                ? slimMarketingRangeKey
              : null;
          const cardAction = card.action === 'dashboard'
            ? handleLaunchDashboard
            : () => navigateToReport(card.action as ActiveViewType);
          const selectedReceptionWindow = selectedRangeKey && card.key === 'receptionReport'
            ? getReceptionReportWindow(selectedRangeKey)
            : null;
          const forceRefresh = selectedRangeKey
            ? card.key === 'receptionReport'
              ? receptionReportSnapshot?.from !== selectedReceptionWindow?.from || receptionReportSnapshot?.to !== selectedReceptionWindow?.to
              : card.key === 'seo'
                ? seoReportPreparedRangeKey !== selectedRangeKey
                : card.key === 'marketingPerformance'
                  ? marketingReportPreparedRangeKey !== selectedRangeKey
                : false
            : false;
          void handleReportCardClick(
            card.key,
            cardAction,
            card.dependencies.map((dep) => dep.key),
            card.key === 'receptionReport' && selectedRangeKey
              ? () => prepareReceptionReport(selectedRangeKey)
              : card.key === 'seo' && selectedRangeKey
                ? () => prepareSeoReport(selectedRangeKey)
                : card.key === 'marketingPerformance' && selectedRangeKey
                  ? () => prepareMarketingReport(selectedRangeKey)
                : undefined,
            selectedRangeKey
              ? {
                forceRefresh,
                rangeOverrides: {
                  enquiriesRangeKey: selectedRangeKey,
                  mattersRangeKey: selectedRangeKey as MattersWipRangeKey,
                },
              }
              : undefined,
          );
        };
        const ctaDisabled = canOpen ? false : dataMissing ? true : itemStatus === 'loading';
        const onCta = canOpen ? onOpen : ctaDisabled ? undefined : onPrepare;
        const subtitle = opts.embedded
          ? 'Feed status is shown here while the report loads.'
          : 'Feed status is shown here until the report can open.';
        const detail = canOpen
          ? 'Feeds are aligned. Open the report from here when you are ready.'
          : dataMissing
            ? 'Feeds completed but returned no rows. Check the upstream connection, then retry.'
            : reportOutputPending
          ? `Load ${card.name} data to check the feeds.`
            : request?.failed
              ? 'One or more feeds did not complete. Retry to re-queue the report.'
              : itemStatus === 'loading'
                ? 'Loading the feeds now. You can open the report when they are ready.'
          : 'Load the report data to check the feeds.';
        const resolvedStatus: ReportProcessingRailStatus = reportOutputPending ? 'idle' : dataMissing ? 'warn' : itemStatus;
        return {
          key: card.key,
          title,
          subtitle,
          status: resolvedStatus,
          rows,
          ctaLabel,
          ctaDisabled,
          onCta,
          detail,
          elapsedLabel: elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : null,
          visualIcon,
        };
      };
      return (
        <div
          data-helix-region="reports/slim-management"
          style={{
            width: '100%',
            margin: '0 0 22px',
          }}
        >
          <div style={{ marginTop: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                  border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                  borderRadius: 0,
                  boxShadow: isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.35)' : '0 18px 42px rgba(6, 23, 51, 0.10)',
                  overflow: 'hidden',
                }}
              >
            <div style={{
              display: 'block',
              padding: '28px 24px',
              position: 'relative',
              backgroundColor: isDarkMode ? colours.dark.sectionBackground : 'transparent',
              opacity: trustGateNotReady ? 0.68 : 1,
              transition: 'opacity 0.25s ease',
              overflow: 'hidden',
            }}
              onMouseEnter={() => setSlimManagementHeaderHovered(true)}
              onMouseLeave={() => setSlimManagementHeaderHovered(false)}
            >
              <img
                src={isDarkMode ? markWhite : markDark}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  width: 92,
                  height: 92,
                  objectFit: 'contain',
                  transform: `translateY(-50%) scale(${slimManagementHeaderHovered ? 1.04 : 1})`,
                  transformOrigin: 'center',
                  opacity: slimManagementHeaderHovered
                    ? (isDarkMode ? 0.12 : 0.1)
                    : (isDarkMode ? 0.05 : 0.04),
                  filter: isDarkMode ? 'none' : 'saturate(0.8)',
                  mixBlendMode: isDarkMode ? 'screen' as const : 'multiply' as const,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  transition: 'opacity 220ms ease, transform 260ms ease',
                }}
              />
              <div>
                <h2 style={{
                  margin: '0 0 10px',
                  fontFamily: 'Raleway, sans-serif',
                  fontSize: 28,
                  lineHeight: 1.16,
                  fontWeight: 800,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                }}>
                  {slimHeroTitle}
                </h2>
                <p style={{
                  margin: 0,
                  maxWidth: 560,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: isDarkMode ? '#d1d5db' : '#374151',
                }}>
                  {slimHeroDescription}
                </p>
              </div>
            </div>

            <div className={`reports-management-card-footer reports-hover-range-slot reports-liquid-fill${slimManagementFooterIsBlue ? ' is-filling' : ''}${!slimOpenDisabled ? ' is-ready' : ''}`} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              padding: '16px 18px 16px 24px',
              backgroundColor: isDarkMode ? colours.websiteBlue : colours.grey,
              borderTop: `1px solid ${slimManagementFooterIsBlue
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.55)' : 'rgba(54, 144, 206, 0.62)')
                : (isDarkMode ? 'rgba(54, 144, 206, 0.34)' : 'rgba(54, 144, 206, 0.24)')}`,
              boxShadow: slimManagementFooterIsBlue && isDarkMode ? `inset 3px 0 0 ${colours.highlight}` : undefined,
              transition: 'border-top-color 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 300ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
              onMouseEnter={() => setSlimManagementFooterHovered(true)}
              onMouseLeave={() => setSlimManagementFooterHovered(false)}
            >
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 44,
                  minWidth: 0,
                  flex: '1 1 auto',
                  opacity: 1,
                  transition: 'opacity 0.22s ease, transform 0.22s ease',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 3,
                    height: 34,
                    flex: '0 0 auto',
                    backgroundColor: slimStatusColour,
                    boxShadow: slimShowFeedState ? `0 0 16px ${slimStatusColour}44` : 'none',
                  }}
                />
                <span style={{ display: 'block', minWidth: 0 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    transition: 'color 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}>
                    {(slimRangeRefreshing || slimDashboardFeedsLoading) && (
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          border: `2px solid ${colours.highlight}`,
                          borderTopColor: 'transparent',
                          animation: 'helix-period-spin 0.8s linear infinite',
                        }}
                      />
                    )}
                    {slimTrayTitle}
                    {slimShowFeedState && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {slimDashboardFeedCues.map((cue) => (
                          <span
                            key={cue.key}
                            aria-label={`${cue.name}: ${cue.label}`}
                            title={`${cue.name}: ${cue.label}`}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: cue.dot,
                              boxShadow: `0 0 0 2px ${cue.backgroundColor}`,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                  <span
                    className={`reports-range-status-copy${slimHoveredRangeDetail ? ' is-previewing' : ''}`}
                    style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 12,
                    color: slimHoveredRangeDetail ? colours.highlight : (isDarkMode ? '#d1d5db' : '#374151'),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'color 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}>
                    {slimHoveredRangeDetail ?? slimCtaDetail ?? slimTrayDetail}
                  </span>
                </span>
              </div>
              <span className="reports-management-range-action" data-helix-region="reports/slim-management/dashboard-period">
                {!slimOpenDisabled ? (
                  <button
                    type="button"
                    className="reports-range-cue is-ready is-action"
                    onClick={handleLaunchDashboard}
                    aria-label="Open Management Dashboard"
                  >
                    Ready: open dashboard
                  </button>
                ) : (
                  <span
                    className="reports-range-cue"
                    aria-hidden="true"
                    style={slimManagementFooterIsBlue ? undefined : {
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      background: isDarkMode ? `${colours.dark.cardBackground}88` : colours.light.cardBackground,
                      borderColor: isDarkMode ? colours.dark.borderColor : colours.highlightNeutral,
                      transition: 'background-color 260ms cubic-bezier(0.22, 1, 0.36, 1), border-color 260ms cubic-bezier(0.22, 1, 0.36, 1), color 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  >
                    {slimRangeRefreshing ? 'Refreshing' : slimRangeInvoked ? 'Change period' : 'Choose period'}
                  </span>
                )}
                <span
                  className={`reports-management-range-buttons reports-hover-range-buttons${slimHoveredRangeDetail ? ' is-previewing' : ''}`}
                  role="radiogroup"
                  aria-label="Management Dashboard data window"
                >
                  {REPORT_RANGE_OPTIONS.map((option) => {
                    const selected = slimRangeInvoked && slimSelectedRangeKey === option.key;
                    const previewed = hoveredRangeEstimate?.ownerKey === 'dashboard' && hoveredRangeEstimate.rangeKey === option.key;
                    const showPulse = selected && slimRangeRefreshing;
                    return (
                      <button
                        key={option.key}
                        className={`reports-management-range-option${previewed ? ' is-previewed' : ''}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-busy={showPulse || undefined}
                        onClick={() => handleSlimRangeSelect(option.key)}
                        onMouseEnter={() => setHoveredRangeEstimate({ ownerKey: 'dashboard', rangeKey: option.key })}
                        onMouseLeave={() => setHoveredRangeEstimate((current) => current?.ownerKey === 'dashboard' && current.rangeKey === option.key ? null : current)}
                        onFocus={() => setHoveredRangeEstimate({ ownerKey: 'dashboard', rangeKey: option.key })}
                        onBlur={() => setHoveredRangeEstimate((current) => current?.ownerKey === 'dashboard' && current.rangeKey === option.key ? null : current)}
                        disabled={slimRangeRefreshing}
                        title={getRangeOptionTitle(option.key, 'dashboard')}
                        style={{
                          color: previewed
                            ? (isDarkMode ? '#d8efff' : '#0f4f79')
                            : selected
                            ? (isDarkMode ? '#8ed1ff' : colours.helixBlue)
                            : (isDarkMode ? '#cbd5e1' : colours.light.text),
                          backgroundColor: previewed
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.42)' : 'rgba(54, 144, 206, 0.18)')
                            : selected
                            ? (isDarkMode ? 'rgba(20, 73, 116, 0.92)' : colours.highlightBlue)
                            : (isDarkMode ? 'rgba(10, 26, 45, 0.78)' : colours.grey),
                          borderColor: previewed
                            ? (isDarkMode ? 'rgba(121, 197, 246, 0.78)' : 'rgba(54, 144, 206, 0.42)')
                            : selected
                            ? (isDarkMode ? 'rgba(85, 170, 229, 0.84)' : colours.helixBlue)
                            : (isDarkMode ? 'rgba(62, 88, 116, 0.62)' : colours.highlightNeutral),
                          boxShadow: 'none',
                        }}
                      >
                        <span className="reports-range-label-full">{option.label}</span>
                        <span className="reports-range-label-compact" aria-hidden="true">{option.shortLabel}</span>
                      </button>
                    );
                  })}
                </span>
              </span>
            </div>
          </div>


          {productionSecondaryCards.length > 0 && (
            <>
            {showEntrySnapshot && (
              <section
                className="reports-kpi-placeholder reports-entry-snapshot"
                data-helix-region="reports/slim-management/entry-snapshot"
                aria-label="Local reports entry snapshot"
                style={{
                  ['--kpi-shell-bg' as string]: isDarkMode ? `${colours.dark.sectionBackground}d9` : 'rgba(255, 255, 255, 0.74)',
                  ['--kpi-shell-border' as string]: isDarkMode ? colours.dark.borderColor : 'rgba(54, 144, 206, 0.24)',
                  ['--kpi-surface-bg' as string]: isDarkMode ? `${colours.dark.cardBackground}d9` : '#ffffff',
                  ['--kpi-surface-border' as string]: isDarkMode ? colours.dark.borderColor : colours.highlightNeutral,
                  ['--kpi-text-label' as string]: isDarkMode ? colours.subtleGrey : colours.greyText,
                  ['--kpi-text-value' as string]: isDarkMode ? colours.dark.text : colours.light.text,
                  ['--kpi-text-note' as string]: isDarkMode ? '#d1d5db' : '#374151',
                } as CSSProperties}
              >
                <div className="reports-kpi-placeholder__head reports-entry-snapshot__head">
                  <span className="reports-kpi-placeholder__title">Entry snapshot</span>
                  <span className="reports-kpi-placeholder__subtitle">
                    {entrySnapshot.currentLabel} day {entrySnapshot.elapsedDays} of {entrySnapshot.daysInMonth} compared with {entrySnapshot.previousLabel} | {entrySnapshot.readyCount}/{entrySnapshot.totalFeeds} feeds ready
                  </span>
                </div>
                <div className="reports-kpi-placeholder__layout reports-entry-snapshot__layout">
                  <div className="reports-entry-snapshot__left">
                    <div className="reports-entry-snapshot__group" aria-label="Conversion pipeline">
                      <div className="reports-entry-snapshot__group-head">
                        <span>Conversion pipeline</span>
                        <span>Month to date</span>
                      </div>
                      <div className="reports-entry-snapshot__pipeline">
                        {entrySnapshot.pipeline.map((metric) => (
                          <article key={metric.key} className="reports-entry-snapshot__metric reports-entry-snapshot__metric--pipeline">
                            <span className="reports-entry-snapshot__metric-label">{metric.label}</span>
                            <strong className="reports-entry-snapshot__metric-value">{formatSnapshotMetricValue(metric)}</strong>
                            <span className="reports-entry-snapshot__metric-note">{metric.conversionNote || metric.note}</span>
                            <span className={`reports-entry-snapshot__delta${metric.delta >= 0 ? ' is-positive' : ' is-negative'}`}>{formatSnapshotDelta(metric)}</span>
                            <span className="reports-entry-snapshot__projection">{formatSnapshotProjection(metric)}</span>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="reports-entry-snapshot__group" aria-label="WIP and collected values">
                      <div className="reports-entry-snapshot__group-head">
                        <span>Value movement</span>
                        <span>WIP to collected</span>
                      </div>
                      <div className="reports-entry-snapshot__money">
                        {entrySnapshot.money.map((metric) => (
                          <article key={metric.key} className="reports-entry-snapshot__metric reports-entry-snapshot__metric--money">
                            <span className="reports-entry-snapshot__metric-label">{metric.label}</span>
                            <strong className="reports-entry-snapshot__metric-value">{formatSnapshotMetricValue(metric)}</strong>
                            <span className="reports-entry-snapshot__metric-note">{metric.note}</span>
                            <span className={`reports-entry-snapshot__delta${metric.delta >= 0 ? ' is-positive' : ' is-negative'}`}>{formatSnapshotDelta(metric)}</span>
                            <span className="reports-entry-snapshot__projection">{formatSnapshotProjection(metric)}</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="reports-kpi-placeholder__chart reports-entry-snapshot__chart">
                    <div className="reports-kpi-placeholder__chart-head reports-entry-snapshot__chart-head">
                      <span className="reports-kpi-placeholder__chart-title">Collected</span>
                      <span className="reports-kpi-placeholder__chart-caption">Actual, previous month, projection</span>
                    </div>
                    <svg viewBox="0 0 420 132" role="img" aria-label="Collected month to date compared with previous month">
                      <defs>
                        <linearGradient id="entry-snapshot-collected-gradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(54, 144, 206, 0.28)" />
                          <stop offset="100%" stopColor="rgba(54, 144, 206, 0.03)" />
                        </linearGradient>
                      </defs>
                      <g className="reports-kpi-placeholder__chart-grid">
                        <line x1="0" y1="24" x2="420" y2="24" />
                        <line x1="0" y1="52" x2="420" y2="52" />
                        <line x1="0" y1="80" x2="420" y2="80" />
                        <line x1="0" y1="108" x2="420" y2="108" />
                      </g>
                      {entrySnapshot.collectedChart.currentArea && (
                        <path d={entrySnapshot.collectedChart.currentArea} fill="url(#entry-snapshot-collected-gradient)" />
                      )}
                      {entrySnapshot.collectedChart.previousLine && (
                        <polyline points={entrySnapshot.collectedChart.previousLine} className="reports-entry-snapshot__chart-line reports-entry-snapshot__chart-line--previous" />
                      )}
                      {entrySnapshot.collectedChart.projectionLine && (
                        <polyline points={entrySnapshot.collectedChart.projectionLine} className="reports-entry-snapshot__chart-line reports-entry-snapshot__chart-line--projection" />
                      )}
                      {entrySnapshot.collectedChart.currentLine && (
                        <polyline points={entrySnapshot.collectedChart.currentLine} className="reports-entry-snapshot__chart-line reports-entry-snapshot__chart-line--current" />
                      )}
                    </svg>
                    <div className="reports-entry-snapshot__legend" aria-hidden="true">
                      <span><i className="is-current" /> This month</span>
                      <span><i className="is-previous" /> Previous month</span>
                      <span><i className="is-projection" /> Run-rate projection</span>
                    </div>
                  </div>
                </div>
              </section>
            )}
            <section
              style={{
                marginTop: 20,
                padding: 16,
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                borderRadius: 0,
                boxShadow: isDarkMode
                  ? `0 18px 44px ${colours.websiteBlue}33`
                  : `0 16px 36px ${colours.helixBlue}0f`,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 14,
                paddingLeft: 10,
                borderLeft: `2px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                }}>
                  Focused reports
                </span>
              </div>

              <div
                className="reports-secondary-grid"
              >
                {productionSecondaryCards.map((card, index) => {
                  const cardAction = card.action === 'dashboard'
                    ? handleLaunchDashboard
                    : () => navigateToReport(card.action as ActiveViewType);
                  const railRequest = processingRailRequests.find((request) => request.reportKey === card.key);
                  const railRequestReady = Boolean(railRequest?.settled && !railRequest.failed);
                  const railRequestFailed = Boolean(railRequest?.settled && railRequest.failed);
                  const cardIsBusy = Boolean(reportProgressStates[card.key]?.isLoading || (railRequest && !railRequest.settled));
                  const cardReady = card.readiness === 'ready' || testMode;
                  const cardStatusColour = cardIsBusy
                    ? colours.highlight
                    : railRequestReady
                      ? colours.green
                      : railRequestFailed
                        ? colours.cta
                        : cardReady
                          ? colours.green
                          : colours.highlight;
                  const cardProgressStage = reportProgressStates[card.key]?.stage;
                  const cardElapsedSecs = reportProgressStates[card.key]?.startTime
                    ? Math.max(0, Math.round((Date.now() - (reportProgressStates[card.key]!.startTime as number)) / 1000))
                    : 0;
                  const cardReadyDeps = card.dependencies.filter((d) => d.status === 'ready').length;
                  const cardTotalDeps = card.dependencies.length;
                  const cardStatusLabel = cardIsBusy
                    ? (cardTotalDeps > 0
                      ? `${cardProgressStage || 'Preparing'} • ${cardReadyDeps}/${cardTotalDeps} feeds${cardElapsedSecs > 0 ? ` • ${cardElapsedSecs}s` : ''}`
                      : (cardProgressStage || 'Opening report'))
                    : railRequestReady
                      ? 'Ready to open'
                      : railRequestFailed
                        ? 'Feed check needs a retry'
                    : cardReady
                      ? (card.tier === 'devPreview' ? 'Ready to open' : (card.status || 'Live today'))
                      : 'Refresh data to unlock';
                  const cardDisabled = !card.action || (card.disabled && !testMode) || cardIsBusy;
                  const cardButtonLabel = cardIsBusy
                    ? 'Preparing'
                    : railRequestReady
                      ? 'Ready: open report'
                      : railRequestFailed
                        ? 'Retry'
                        : 'Load report data';
                  const cardButtonColour = cardIsBusy
                    ? colours.highlight
                    : railRequestReady
                      ? colours.green
                      : railRequestFailed
                        ? colours.cta
                        : (isDarkMode ? colours.dark.cardHover : colours.light.cardBackground);
                  const cardButtonTextColour = cardIsBusy || railRequestReady || railRequestFailed
                    ? colours.dark.text
                    : (isDarkMode ? colours.dark.text : colours.light.text);
                  if (card.action === 'seoReport' || card.action === 'receptionReport' || card.action === 'marketingPerformance') {
                    const selectedReportRangeKey = card.key === 'receptionReport'
                      ? slimReceptionRangeKey
                      : card.key === 'marketingPerformance'
                        ? slimMarketingRangeKey
                        : slimSeoRangeKey;
                    const datasetKey: 'googleAnalytics' | 'dubberCalls' = card.action === 'receptionReport' ? 'dubberCalls' : 'googleAnalytics';
                    const liveRows = (datasetData as any)?.[datasetKey];
                    const cachedRows = (cachedData as any)?.[datasetKey];
                    const rowCount = Array.isArray(liveRows)
                      ? liveRows.length
                      : Array.isArray(cachedRows)
                        ? cachedRows.length
                        : 0;
                    const depsAllReady = card.dependencies.length === 0 || card.dependencies.every((dep) => dep.status === 'ready');
                    const selectedReceptionWindow = card.key === 'receptionReport' && selectedReportRangeKey
                      ? getReceptionReportWindow(selectedReportRangeKey)
                      : null;
                    const receptionRangePrepared = card.key === 'receptionReport'
                      && Boolean(selectedReceptionWindow)
                      && receptionReportStatus === 'ready'
                      && Boolean(receptionReportSnapshot)
                      && receptionReportSnapshot?.from === selectedReceptionWindow?.from
                      && receptionReportSnapshot?.to === selectedReceptionWindow?.to;
                    const seoRangePrepared = card.key === 'seo' && Boolean(selectedReportRangeKey) && seoReportPreparedRangeKey === selectedReportRangeKey;
                    const marketingRangePrepared = card.key === 'marketingPerformance' && Boolean(selectedReportRangeKey) && marketingReportPreparedRangeKey === selectedReportRangeKey;
                    const receptionSnapshotHasData = receptionReportHasData(receptionReportSnapshot?.data);
                    const reportReady = card.key === 'receptionReport'
                      ? receptionRangePrepared && receptionSnapshotHasData
                      : card.key === 'marketingPerformance'
                        ? depsAllReady && marketingRangePrepared ? rowCount > 0 : false
                      : depsAllReady && seoRangePrepared ? rowCount > 0 : false;
                    const hasData = card.key === 'receptionReport'
                      ? receptionRangePrepared ? receptionSnapshotHasData : true
                      : card.key === 'marketingPerformance'
                        ? depsAllReady && marketingRangePrepared ? rowCount > 0 : true
                      : depsAllReady && seoRangePrepared ? rowCount > 0 : true;
                    const cardHoveredRangeDetail = hoveredRangeEstimate?.ownerKey === card.key
                      ? `${REPORT_RANGE_OPTIONS.find((option) => option.key === hoveredRangeEstimate.rangeKey)?.shortLabel ?? describeRangeKey(hoveredRangeEstimate.rangeKey)} refresh est. ${getRangeRefreshEstimate(hoveredRangeEstimate.rangeKey, card.key)}`
                      : null;
                    const quietStatusLabel = cardIsBusy
                      ? (cardTotalDeps > 0
                        ? `${cardProgressStage || 'Preparing'} (${cardReadyDeps}/${cardTotalDeps})${cardElapsedSecs > 0 ? ` / ${cardElapsedSecs}s` : ''}`
                        : (cardProgressStage || 'Opening report'))
                      : railRequestFailed
                        ? 'Feed check needs a retry'
                        : reportReady || railRequestReady
                          ? 'Ready to open'
                      : cardHoveredRangeDetail
                        ? cardHoveredRangeDetail
                          : hasData
                            ? 'Select a range to refresh'
                            : 'No data returned';
                    const cardIsDevPreview = card.tier === 'devPreview';
                    const cardRangeBarIsBlue = cardIsBusy || slimHoveredSecondaryReportKey === card.key;
                    const handleRangeOptionSelect = (nextRangeKey: ReportRangeKey) => {
                      handleSlimSecondaryRangeSelect(card.key, nextRangeKey);
                      void handleReportCardClick(
                        card.key,
                        cardAction,
                        card.dependencies.map((dep) => dep.key),
                        card.key === 'receptionReport'
                          ? () => prepareReceptionReport(nextRangeKey)
                          : card.key === 'seo'
                            ? () => prepareSeoReport(nextRangeKey)
                            : card.key === 'marketingPerformance'
                              ? () => prepareMarketingReport(nextRangeKey)
                              : undefined,
                        {
                          forceRefresh: true,
                          rangeOverrides: {
                            enquiriesRangeKey: nextRangeKey,
                            mattersRangeKey: nextRangeKey as MattersWipRangeKey,
                          },
                        },
                      );
                    };
                    return (
                      <div
                        key={card.key}
                        className={`reports-secondary-report-card${cardIsBusy ? ' is-preparing' : ''}${cardIsDevPreview ? ' is-dev-preview' : ''}`}
                        data-helix-region={`reports/slim-management/embedded/${card.key}`}
                        style={{
                          animation: 'helix-card-land 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both',
                          animationDelay: `${(index + 1) * 0.08}s`,
                          minHeight: 132,
                          minWidth: 0,
                          backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                          borderRadius: 0,
                          boxShadow: isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.24)' : '0 16px 36px rgba(6, 23, 51, 0.07)',
                          ['--reports-dev-preview-accent' as string]: cardIsDevPreview ? colours.cta : undefined,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          title={`Select a date range to refresh ${card.name}`}
                          style={{
                            display: 'grid',
                            gridTemplateRows: '1fr auto',
                            width: '100%',
                            minHeight: 132,
                            padding: 0,
                            textAlign: 'left' as const,
                            cursor: 'default',
                            fontFamily: 'Raleway, sans-serif',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                            border: 'none',
                            borderRadius: 0,
                            boxShadow: 'none',
                            overflow: 'hidden',
                            opacity: cardDisabled ? 0.72 : 1,
                            transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, opacity 0.18s ease',
                          }}
                          onMouseEnter={(event) => {
                            setSlimHoveredSecondaryReportKey(card.key);
                          }}
                          onMouseLeave={(event) => {
                            setSlimHoveredSecondaryReportKey((current) => current === card.key ? null : current);
                          }}
                        >
                            <span style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 14,
                              padding: '20px 22px 18px',
                              backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.cardBackground,
                              borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.24)' : colours.highlightNeutral}`,
                            }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 38,
                                height: 38,
                                flex: '0 0 auto',
                                color: cardStatusColour,
                                backgroundColor: isDarkMode ? colours.dark.cardHover : colours.grey,
                                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                borderRadius: 0,
                              }}>
                                {card.action === 'receptionReport'
                                  ? <FaPhoneAlt size={15} />
                                  : card.action === 'marketingPerformance'
                                    ? <FaChartArea size={16} />
                                    : <FaChartLine size={16} />}
                              </span>
                              <span style={{ display: 'block', minWidth: 0 }}>
                                <span style={{
                                  display: 'block',
                                  marginBottom: 7,
                                  fontSize: 18,
                                  lineHeight: 1.22,
                                  fontWeight: 800,
                                  color: isDarkMode ? colours.dark.text : colours.light.text,
                                }}>
                                  {card.name}
                                </span>
                                <span style={{
                                  display: 'block',
                                  maxWidth: 520,
                                  fontSize: 13,
                                  lineHeight: 1.5,
                                  fontWeight: 500,
                                  color: isDarkMode ? '#d1d5db' : '#374151',
                                }}>
                                  {getSlimSecondaryReportDetail(card)}
                                </span>
                              </span>
                            </span>

                            <div className={`reports-secondary-range-bar reports-hover-range-slot reports-liquid-fill${cardRangeBarIsBlue ? ' is-filling' : ''}${reportReady || railRequestReady ? ' is-ready' : ''}`} style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              padding: '13px 18px 13px 22px',
                              backgroundColor: isDarkMode ? colours.websiteBlue : colours.grey,
                              borderTop: `1px solid ${cardRangeBarIsBlue
                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.55)' : 'rgba(54, 144, 206, 0.62)')
                                : (isDarkMode ? 'rgba(54, 144, 206, 0.34)' : 'rgba(54, 144, 206, 0.24)')}`,
                              boxShadow: cardRangeBarIsBlue && isDarkMode ? `inset 3px 0 0 ${colours.highlight}` : undefined,
                              transition: 'border-top-color 220ms ease, box-shadow 260ms ease',
                            }}>
                              <span style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 14,
                              }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  minWidth: 0,
                                }}>
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 3,
                                      height: 28,
                                      flex: '0 0 auto',
                                      backgroundColor: cardStatusColour,
                                      boxShadow: `0 0 14px ${cardStatusColour}33`,
                                      animation: cardIsBusy ? 'shimmer 1.4s ease-in-out infinite' : undefined,
                                    }}
                                  />
                                  <span
                                    className={`reports-range-status-copy${cardHoveredRangeDetail ? ' is-previewing' : ''}`}
                                    style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: cardHoveredRangeDetail && !cardIsBusy && !railRequestFailed && !reportReady && !railRequestReady
                                      ? colours.highlight
                                      : (isDarkMode ? colours.dark.text : colours.light.text),
                                    transition: 'color 180ms ease',
                                  }}>
                                    {quietStatusLabel}
                                  </span>
                                </span>
                                  <span className="reports-secondary-action-slot">
                                    {reportReady || railRequestReady ? (
                                      <button
                                        type="button"
                                        className="reports-range-cue is-ready is-action"
                                        onClick={() => {
                                          if (railRequestReady) clearProcessingRailReport(card.key);
                                          navigateToReport(card.action as ActiveViewType);
                                        }}
                                        aria-label={`Open ${card.name}`}
                                      >
                                        Ready: open report
                                      </button>
                                    ) : (
                                      <span
                                        className="reports-range-cue"
                                        aria-hidden="true"
                                        style={cardRangeBarIsBlue ? undefined : {
                                          color: isDarkMode ? colours.dark.text : colours.light.text,
                                          background: isDarkMode ? `${colours.dark.cardBackground}88` : colours.light.cardBackground,
                                          borderColor: isDarkMode ? colours.dark.borderColor : colours.highlightNeutral,
                                          transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
                                        }}
                                      >
                                        {cardIsBusy ? 'Refreshing' : selectedReportRangeKey ? 'Change period' : 'Choose period'}
                                      </span>
                                    )}
                                  <span
                                      className={`reports-secondary-range-buttons reports-hover-range-buttons${cardHoveredRangeDetail ? ' is-previewing' : ''}`}
                                    role="radiogroup"
                                    aria-label={`${card.name} data range`}
                                  >
                                    {REPORT_RANGE_OPTIONS.map((option) => {
                                      const selected = selectedReportRangeKey === option.key;
                                      const previewed = hoveredRangeEstimate?.ownerKey === card.key && hoveredRangeEstimate.rangeKey === option.key;
                                      return (
                                        <button
                                          key={option.key}
                                          className={`reports-secondary-range-option${previewed ? ' is-previewed' : ''}`}
                                          type="button"
                                          role="radio"
                                          aria-checked={selected}
                                          onClick={() => handleRangeOptionSelect(option.key)}
                                          onMouseEnter={() => setHoveredRangeEstimate({ ownerKey: card.key, rangeKey: option.key })}
                                          onMouseLeave={() => setHoveredRangeEstimate((current) => current?.ownerKey === card.key && current.rangeKey === option.key ? null : current)}
                                          onFocus={() => setHoveredRangeEstimate({ ownerKey: card.key, rangeKey: option.key })}
                                          onBlur={() => setHoveredRangeEstimate((current) => current?.ownerKey === card.key && current.rangeKey === option.key ? null : current)}
                                          disabled={cardDisabled}
                                          title={getRangeOptionTitle(option.key, card.key)}
                                          style={{
                                            ['--reports-range-index' as string]: REPORT_RANGE_OPTIONS.indexOf(option),
                                            color: previewed
                                              ? (isDarkMode ? '#d8efff' : '#0f4f79')
                                              : selected
                                              ? (isDarkMode ? '#8ed1ff' : colours.helixBlue)
                                              : (isDarkMode ? '#cbd5e1' : colours.light.text),
                                            backgroundColor: previewed
                                              ? (isDarkMode ? 'rgba(54, 144, 206, 0.42)' : 'rgba(54, 144, 206, 0.18)')
                                              : selected
                                              ? (isDarkMode ? 'rgba(20, 73, 116, 0.92)' : colours.highlightBlue)
                                              : (isDarkMode ? 'rgba(10, 26, 45, 0.78)' : colours.grey),
                                            borderColor: previewed
                                              ? (isDarkMode ? 'rgba(121, 197, 246, 0.78)' : 'rgba(54, 144, 206, 0.42)')
                                              : selected
                                              ? (isDarkMode ? 'rgba(85, 170, 229, 0.84)' : colours.helixBlue)
                                              : (isDarkMode ? 'rgba(62, 88, 116, 0.62)' : colours.highlightNeutral),
                                            boxShadow: 'none',
                                          }}
                                        >
                                          <span className="reports-range-label-full">{option.label}</span>
                                          <span className="reports-range-label-compact" aria-hidden="true">{option.shortLabel}</span>
                                        </button>
                                      );
                                    })}
                                  </span>
                                </span>
                              </span>
                            </div>
                          </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => {
                        if (cardDisabled) {
                          return;
                        }
                        if (railRequestReady) {
                          clearProcessingRailReport(card.key);
                          navigateToReport(card.action as ActiveViewType);
                          return;
                        }
                        void handleReportCardClick(card.key, cardAction, card.dependencies.map((dependency) => dependency.key));
                      }}
                      disabled={cardDisabled}
                      style={{
                        appearance: 'none',
                        display: 'grid',
                        gridTemplateRows: '1fr auto',
                        minHeight: 132,
                        padding: 0,
                        textAlign: 'left' as const,
                        cursor: cardDisabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'Raleway, sans-serif',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                        borderRadius: 0,
                        boxShadow: isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.28)' : '0 16px 36px rgba(6, 23, 51, 0.08)',
                        overflow: 'hidden',
                        opacity: cardDisabled ? 0.72 : 1,
                        animation: 'fadeInUp 0.35s ease forwards',
                        animationDelay: `${(index + 1) * 0.06}s`,
                        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, opacity 0.18s ease',
                      }}
                      onMouseEnter={(event) => {
                        if (cardDisabled) return;
                        event.currentTarget.style.borderColor = colours.highlight;
                        event.currentTarget.style.boxShadow = isDarkMode ? '0 16px 38px rgba(0, 3, 25, 0.36)' : '0 18px 40px rgba(6, 23, 51, 0.12)';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
                        event.currentTarget.style.boxShadow = isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.28)' : '0 16px 36px rgba(6, 23, 51, 0.08)';
                      }}
                    >
                      <span style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: '20px 22px 18px',
                      }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 38,
                          height: 38,
                          flex: '0 0 auto',
                          color: colours.highlight,
                          backgroundColor: isDarkMode ? colours.dark.cardHover : colours.highlightBlue,
                          border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                          borderRadius: 0,
                        }}>
                          {(() => {
                            const cardAction = card.action as AvailableReport['action'];
                            switch (cardAction) {
                              case 'calls':
                                return <FaPhoneAlt size={15} />;
                              case 'ppcReport':
                                return <FaSearchDollar size={15} />;
                              case 'marketingPerformance':
                                return <FaChartArea size={16} />;
                              case 'enquiries':
                              case 'enquiryLedger':
                                return <FaInbox size={15} />;
                              case 'matters':
                                return <FaFolderOpen size={15} />;
                              case 'annualLeave':
                                return <FaClipboardList size={15} />;
                              default:
                                return <FaChartLine size={16} />;
                            }
                          })()}
                        </span>
                        <span style={{ display: 'block', minWidth: 0 }}>
                          <span style={{
                            display: 'block',
                            marginBottom: 7,
                            fontSize: 18,
                            lineHeight: 1.22,
                            fontWeight: 800,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                          }}>
                            {card.name}
                          </span>
                          <span style={{
                            display: 'block',
                            maxWidth: 520,
                            fontSize: 13,
                            lineHeight: 1.5,
                            fontWeight: 500,
                            color: isDarkMode ? '#d1d5db' : '#374151',
                          }}>
                            {getSlimSecondaryReportDetail(card)}
                          </span>
                        </span>
                      </span>

                      <span style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '13px 18px 13px 22px',
                        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                        borderTop: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                      }}>
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 14,
                        }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 10,
                            minWidth: 0,
                          }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 3,
                                height: 28,
                                flex: '0 0 auto',
                                backgroundColor: cardStatusColour,
                                boxShadow: `0 0 14px ${cardStatusColour}33`,
                                animation: cardIsBusy ? 'shimmer 1.4s ease-in-out infinite' : undefined,
                              }}
                            />
                            <span style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 12,
                              fontWeight: 800,
                              color: isDarkMode ? colours.dark.text : colours.light.text,
                            }}>
                              {cardStatusLabel}
                            </span>
                          </span>
                          <span style={{
                            flex: '0 0 auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '9px 14px',
                            fontSize: 12,
                            fontWeight: 800,
                            color: cardIsBusy
                              ? colours.dark.text
                              : (cardDisabled ? (isDarkMode ? colours.subtleGrey : colours.greyText) : cardButtonTextColour),
                            backgroundColor: cardDisabled ? (isDarkMode ? colours.dark.border : colours.light.disabledBackground) : cardButtonColour,
                            border: `1px solid ${cardDisabled ? (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral) : (railRequestReady ? colours.green : railRequestFailed ? colours.cta : colours.highlightNeutral)}`,
                            borderRadius: 0,
                          }}>
                            {cardIsBusy && (
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 10,
                                  height: 10,
                                  border: '2px solid rgba(255,255,255,0.45)',
                                  borderTopColor: '#ffffff',
                                  borderRadius: '50%',
                                  animation: 'spin 0.9s linear infinite',
                                }}
                              />
                            )}
                            {cardButtonLabel}
                          </span>
                        </span>
                        {cardIsBusy && cardTotalDeps > 0 && (
                          <span
                            data-helix-region={`reports/slim-management/feed-progress/${card.key}`}
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              columnGap: 14,
                              rowGap: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: 0,
                              textTransform: 'none' as const,
                              color: isDarkMode ? colours.subtleGrey : colours.greyText,
                              fontFamily: 'Raleway, sans-serif',
                              animation: 'fadeIn 220ms ease-out',
                            }}
                          >
                            {card.dependencies.map((dep) => {
                              const depStatus = dep.status;
                              const depColour = depStatus === 'ready'
                                ? colours.green
                                : depStatus === 'error'
                                  ? colours.cta
                                  : depStatus === 'loading'
                                    ? colours.highlight
                                    : colours.subtleGrey;
                              const isLoading = depStatus === 'loading';
                              return (
                                <span
                                  key={dep.key}
                                  title={`${dep.name}: ${depStatus}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'color 200ms ease',
                                    color: depStatus === 'ready'
                                      ? (isDarkMode ? colours.dark.text : colours.light.text)
                                      : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      backgroundColor: depColour,
                                      flexShrink: 0,
                                      boxShadow: isLoading ? `0 0 0 0 ${depColour}66` : undefined,
                                      animation: isLoading ? 'helix-pulse-dot 1.4s ease-in-out infinite' : undefined,
                                    }}
                                  />
                                  {dep.name}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            </>
          )}

          {hasLocalWorkspace && (
            <div
              className="reporting-local-workspace-frame"
              data-helix-region="reports/local-workspace"
              style={{
                marginTop: 24,
                padding: 18,
                backgroundColor: isDarkMode ? 'rgba(6, 23, 51, 0.56)' : 'rgba(255, 255, 255, 0.76)',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
                paddingLeft: 10,
                borderLeft: `2px solid ${colours.cta}`,
              }}>
                <span style={{ display: 'block' }}>
                  <span style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    color: colours.cta,
                  }}>
                    Local workspace
                  </span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                    Draft and localhost-only Reports work lives here until it is promoted into the production box above.
                  </span>
                </span>
              </div>

              {canSimulateBlocker && (
                <div
                  data-helix-region="reports/local-workspace/simulate-blocker"
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    border: `1px dashed ${simulatedBlockerActive ? colours.cta : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                    borderRadius: 0,
                  }}
                >
                  <span style={{ display: 'block', minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.08em',
                      color: simulatedBlockerActive ? colours.cta : (isDarkMode ? colours.dark.text : colours.light.text),
                    }}>
                      {simulatedBlockerActive ? 'Simulated blocker active' : 'Demo controls (Luke only)'}
                    </span>
                    <span style={{
                      display: 'block',
                      marginTop: 3,
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: isDarkMode ? '#d1d5db' : '#374151',
                    }}>
                      {simulatedBlockerActive
                        ? 'A simulated WIP failure is blocking dashboard entry. Clear it to restore the real readiness state.'
                        : 'Invoke a simulated WIP failure to demo a blocked dashboard entry for the selected period.'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSimulatedBlocker}
                    style={{
                      appearance: 'none',
                      flex: '0 0 auto',
                      minHeight: 36,
                      cursor: 'pointer',
                      padding: '0 14px',
                      fontFamily: 'Raleway, sans-serif',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                      color: simulatedBlockerActive ? colours.dark.text : (isDarkMode ? colours.dark.text : colours.light.text),
                      backgroundColor: simulatedBlockerActive ? colours.cta : 'transparent',
                      borderStyle: 'solid',
                      borderWidth: 1,
                      borderColor: simulatedBlockerActive ? colours.cta : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral),
                      borderRadius: 0,
                      transition: 'background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease',
                    }}
                  >
                    {simulatedBlockerActive ? 'Clear simulated blocker' : 'Simulate broken load'}
                  </button>
                </div>
              )}

              {localActiveCards.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                    gap: 10,
                  }}>
                    {localActiveCards.map((card, index) => (
                      <div key={card.key} style={getCardShellStyle(card)}>
                        {ppcDevBadge(card)}
                        <ReportCard card={card} animationIndex={productionSecondaryCards.length + index + 1} {...rcProps} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {developmentCards.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                    gap: 10,
                  }}>
                    {developmentCards.map((card, index) => (
                      <div key={card.key} style={getCardShellStyle(card)}>
                        {ppcDevBadge(card)}
                        <ReportCard card={card} animationIndex={productionSecondaryCards.length + localActiveCards.length + index + 1} {...rcProps} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {disabledCards.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                    gap: 10,
                  }}>
                    {disabledCards.map((card, index) => (
                      <div key={card.key} style={getCardShellStyle(card)}>
                        {ppcDevBadge(card)}
                        <ReportCard card={card} animationIndex={productionSecondaryCards.length + localActiveCards.length + developmentCards.length + index + 1} {...rcProps} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {renderStructurePanel()}
            </div>
          )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* â”€â”€ Hero: Management Dashboard â”€â”€ */}
        {heroCard && (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
                paddingLeft: 10,
                borderLeft: `2px solid ${isDarkMode ? colours.subtleGrey : colours.greyText}`,
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
              }}>
                Production
              </span>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: colours.green,
                display: 'inline-block',
              }} />
              <span style={{ marginLeft: 'auto' }} id="management-trust-gate">
                <ManagementAccessIndicator
                  enabled={trustGateEnabled}
                  isDarkMode={isDarkMode}
                  onChange={handleTrustGateChange}
                  initials={userInitialsForGate || null}
                  isAdmin={isAdminForGate}
                  onAdminOverride={handleTrustGateOverride}
                />
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
            }}>
              <ReportCard card={heroCard} isPrimary animationIndex={0} {...rcProps} />
            </div>
          </div>
        )}

        {/* â”€â”€ Active reports â”€â”€ */}
        {productionSecondaryCards.length > 0 && (
          <div style={{
            position: 'relative' as const,
            padding: '4px 0 0',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `2px solid ${isDarkMode ? colours.subtleGrey : colours.greyText}`,
            }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
              }}>
                Reports
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {productionSecondaryCards.map((card, index) => <ReportCard key={card.key} card={card} animationIndex={index + 1} {...rcProps} />)}
            </div>
          </div>
        )}

        {hasLocalWorkspace && (
          <div
            className="reporting-local-workspace-frame"
            data-helix-region="reports/local-workspace"
            style={{
              marginTop: 24,
              padding: 18,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `2px solid ${colours.cta}`,
            }}>
              <span style={{ display: 'block' }}>
                <span style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: colours.cta,
                }}>
                  Local workspace
                </span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                  Draft and localhost-only Reports work lives below this line until it is promoted.
                </span>
              </span>
            </div>

            {localActiveCards.length > 0 && (
              <div style={{ position: 'relative' as const, padding: '4px 0 0' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                  gap: 10,
                }}>
                  {localActiveCards.map((card, index) => (
                    <div key={card.key} style={getCardShellStyle(card)}>
                      {ppcDevBadge(card)}
                      <ReportCard card={card} animationIndex={productionSecondaryCards.length + index + 1} {...rcProps} />
                    </div>
                  ))}
                </div>
              </div>
            )}

        {/* â”€â”€ Development â”€â”€ */}
        {developmentCards.length > 0 && (
          <div style={{
            position: 'relative' as const,
            padding: '4px 0 0',
            marginTop: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `2px solid ${isDarkMode ? colours.green : colours.green}`,
            }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: isDarkMode ? colours.green : colours.green,
              }}>
                Draft
              </span>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: colours.green,
                display: 'inline-block',
                animation: 'pulse 2s ease-in-out infinite',
              }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                gap: 10,
              }}
            >
              {developmentCards.map((card, index) => (
                <div key={card.key} style={getCardShellStyle(card)}>
                  {ppcDevBadge(card)}
                  <ReportCard card={card} animationIndex={productionSecondaryCards.length + localActiveCards.length + index + 1} {...rcProps} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* â”€â”€ Disabled / coming soon â”€â”€ */}
        {disabledCards.length > 0 && (
          <div style={{
            position: 'relative' as const,
            padding: '4px 0 0',
            marginTop: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `2px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(107, 107, 107, 0.2)'}`,
            }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: isDarkMode ? 'rgba(160, 160, 160, 0.5)' : 'rgba(107, 107, 107, 0.5)',
              }}>
                Draft
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(max(260px, calc(33.333% - 10px)), 1fr))',
                gap: 10,
              }}
            >
              {disabledCards.map((card, index) => (
                <div key={card.key} style={getCardShellStyle(card)}>
                  {ppcDevBadge(card)}
                  <ReportCard card={card} animationIndex={productionSecondaryCards.length + localActiveCards.length + developmentCards.length + index + 1} {...rcProps} />
                </div>
              ))}
            </div>
          </div>
        )}

            {renderStructurePanel()}
          </div>
        )}
      </>
    );
  };

  const handleLaunchDashboard = useCallback(() => {
    void handleReportCardClick(
      'dashboard',
      handleOpenDashboard,
      REPORT_DATASET_REQUIREMENTS.dashboard ?? [],
    );
  }, [handleOpenDashboard, handleReportCardClick]);

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

  const applyManagementRangeAndRefresh = useCallback((nextEnquiriesKey: ReportRangeKey, nextMattersKey: MattersWipRangeKey, forceRefresh = false) => {
    if (!forceRefresh && nextEnquiriesKey === enquiriesRangeKey && nextMattersKey === mattersWipRangeKey) {
      return;
    }
    setSlimRangeInvoked(true);
    setSlimSelectedRangeKey(nextEnquiriesKey);
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

  useEffect(() => {
    const dashboardRequest = processingRailRequests.find((request) => request.reportKey === 'dashboard' && !request.settled);
    if (!dashboardRequest) {
      return;
    }

    if (Date.now() - dashboardRequest.requestedAt < 180) {
      return;
    }

    const dashboardDependencies = REPORT_DATASET_REQUIREMENTS.dashboard ?? [];
    const dependencyStatuses = dashboardDependencies.map((key) => datasetStatus[key]?.status ?? 'idle');
    const hasError = dependencyStatuses.some((status) => status === 'error');
    if (hasError) {
      settleProcessingRailReport('dashboard', false);
      return;
    }

    const allReady = dependencyStatuses.length > 0 && dependencyStatuses.every((status) => status === 'ready');
    if (allReady) {
      settleProcessingRailReport('dashboard', true);
    }
  }, [datasetStatus, processingRailRequests, settleProcessingRailReport]);

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
      const receptionPreviewRangeKey = reportKey === 'receptionReport' && datasetKey !== 'teamData'
        ? slimReceptionRangeKey
        : null;
      const marketingPreviewRangeKey = reportKey === 'marketingPerformance'
        ? slimMarketingRangeKey
        : null;
      const seoPreviewRangeKey = reportKey === 'seo'
        ? slimSeoRangeKey
        : null;

      const previewRangeKey =
        globalPreviewRangeKey ||
        mattersPreviewRangeKey ||
        enquiriesPreviewRangeKey ||
        managementPreviewRangeKey ||
        receptionPreviewRangeKey ||
        marketingPreviewRangeKey ||
        seoPreviewRangeKey;

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
        annualLeave: 'Current year',
        metaMetrics: describeRangeKey(enquiriesRangeKey),
        googleAnalytics: describeRangeKey(enquiriesRangeKey),
        googleAds: describeRangeKey(enquiriesRangeKey),
        deals: describeRangeKey(enquiriesRangeKey),
        instructions: describeRangeKey(enquiriesRangeKey),
        emailLists: 'Not connected',
        dubberCalls: 'All',
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
      slimMarketingRangeKey,
      slimReceptionRangeKey,
      slimSeoRangeKey,
    ]
  );

  const reportCards = useMemo<ReportCard[]>(() => {
    const visibleReports = isReportsDevPreview
      ? AVAILABLE_REPORTS
      : AVAILABLE_REPORTS.filter((report) => report.tier !== 'devPreview');
    return visibleReports.map((report) => {
        const dependencies = report.requiredDatasets.map<ReportDependency>((datasetKey) => {
        const dataset = DATASETS.find((definition) => definition.key === datasetKey);
        const status = datasetStatus[datasetKey]?.status ?? 'idle';
        const trustCheckId = getTrustCheckId(report.key, datasetKey);
        const trustCheck = findTrustCheck(trustReadinessPayload, trustCheckId);
        const preflightTrust = Boolean(
          trustCheck && (trustCheck.reason === 'no-snapshot' || trustCheck.reason === 'snapshot-missing-scope')
        );
        const trust = preflightTrust
          ? 'unsupported'
          : deriveTrustState(trustReadinessPayload, trustCheckId, status);
        return {
          key: datasetKey,
          name: dataset?.name ?? datasetKey,
          status,
            range: getDatasetDateRange(datasetKey, report.key),
          trust,
          trustReason: preflightTrust ? null : (trustCheck?.message ?? trustCheck?.reason ?? null),
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
  }, [datasetStatus, getDatasetDateRange, getButtonState, isReportsDevPreview, trustReadinessPayload]);

  const activeProcessingPanelItem = useMemo<ReportProcessingRailItem | null>(() => {
    const request = activeProcessingPanelReportKey
      ? processingRailRequests.find((candidate) => candidate.reportKey === activeProcessingPanelReportKey)
      : null;
    if (!request) return null;

    const card = reportCards.find((candidate) => candidate.key === request.reportKey);
    if (!card) return null;

    const rows = card.dependencies.map((dep): ReportProcessingRailRow => ({
      key: dep.key,
      label: dep.name,
      status: request.settled && !request.failed ? 'ready' : toProcessingRailStatus(dep.status),
      detail: dep.status === 'ready'
        ? 'Loaded'
        : dep.status === 'loading'
          ? 'Refreshing now'
          : dep.status === 'error'
            ? 'Needs retry'
            : dep.range || 'Waiting',
    }));
    const rawStatus = rows.length > 0 ? summariseProcessingRailStatus(rows) : 'ready';
    const itemStatus: ReportProcessingRailStatus = request.failed
      ? 'error'
      : request.settled
        ? rawStatus === 'idle' ? 'ready' : rawStatus
        : rawStatus === 'error'
          ? 'error'
          : 'loading';
    const canOpen = Boolean(request.settled && !request.failed && itemStatus === 'ready');
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - request.requestedAt) / 1000));
    const openReport = () => {
      clearProcessingRailReport(card.key);
      if (card.key === 'dashboard') {
        handleOpenDashboard();
        return;
      }
      navigateToReport(card.action as ActiveViewType);
    };
    const openBreakdown = () => {
      setActiveProcessingPanelManualFolded(false);
      setActiveProcessingPanelFolded(false);
      setActiveProcessingPanelForcedOpen(true);
    };

    return {
      key: `active-${card.key}`,
      title: canOpen
        ? `${card.name} is ready`
        : request.failed
          ? `${card.name} needs a retry`
          : `Refreshing ${card.name}`,
      subtitle: canOpen
        ? 'Feed check completed. Open the report or inspect the completed breakdown.'
        : 'Feed status is shown here while the report prepares.',
      status: itemStatus,
      rows,
      ctaLabel: canOpen ? `Open ${card.name}` : request.failed ? 'Hide panel' : 'Preparing report',
      ctaDisabled: !canOpen && !request.failed,
      onCta: canOpen ? openReport : request.failed ? hideActiveProcessingPanel : undefined,
      secondaryCtaLabel: canOpen ? 'Open breakdown' : undefined,
      onSecondaryCta: canOpen ? openBreakdown : undefined,
      detail: canOpen
        ? 'Feeds are aligned. You can open the report now or reopen the full feed breakdown from this panel.'
        : request.failed
          ? 'One or more feeds did not complete. Retry from the report card.'
          : 'Refreshing the feeds now. This panel will stay with the report request.',
      elapsedLabel: elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : null,
      visualIcon: 'Sync',
    };
  }, [activeProcessingPanelReportKey, clearProcessingRailReport, handleOpenDashboard, hideActiveProcessingPanel, navigateToReport, processingRailRequests, reportCards]);

  const activeProcessingPanelHasAttention = useMemo(() => {
    if (!activeProcessingPanelItem) return false;
    return ['error', 'blocked', 'warn'].includes(activeProcessingPanelItem.status)
      || activeProcessingPanelItem.rows.some((row) => ['error', 'blocked', 'warn'].includes(row.status));
  }, [activeProcessingPanelItem]);

  useEffect(() => {
    if (!activeProcessingPanelItem) {
      setActiveProcessingPanelFolded(false);
      setActiveProcessingPanelForcedOpen(false);
      setActiveProcessingPanelManualFolded(null);
      return;
    }

    if (activeProcessingPanelManualFolded !== null) {
      setActiveProcessingPanelFolded(activeProcessingPanelManualFolded);
      setActiveProcessingPanelForcedOpen(!activeProcessingPanelManualFolded);
      return;
    }

    if (activeProcessingPanelHasAttention) {
      setActiveProcessingPanelFolded(false);
      setActiveProcessingPanelForcedOpen(true);
      return;
    }

    setActiveProcessingPanelFolded(false);
    setActiveProcessingPanelForcedOpen(false);
    const timeout = window.setTimeout(() => {
      setActiveProcessingPanelFolded(true);
    }, 3800);
    return () => window.clearTimeout(timeout);
  }, [activeProcessingPanelHasAttention, activeProcessingPanelItem?.key, activeProcessingPanelItem?.status, activeProcessingPanelManualFolded]);

  useEffect(() => {
    setActiveProcessingPanelManualFolded(null);
  }, [activeProcessingPanelItem?.key]);

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

  const resumeProcessingPanelItem = useMemo<ReportProcessingRailItem | null>(() => {
    if (!resumeNotice) {
      return null;
    }
    return {
      key: 'resumed-refresh-notice',
      title: 'Refresh resumed',
      subtitle: 'You can keep working while the refresh finalises.',
      status: 'loading',
      rows: [
        { key: 'resume', label: 'Feeds', status: isStreamingConnected ? 'loading' : 'warn', detail: resumeNotice.message },
        { key: 'progress', label: 'Progress', status: isFetching ? 'loading' : 'ready', detail: progressDetailText },
      ],
      ctaLabel: 'Dismiss',
      onCta: dismissResumeNotice,
      detail: progressDetailText,
      elapsedLabel: 'Resumed',
      visualIcon: 'SyncStatus',
    };
  }, [dismissResumeNotice, isFetching, isStreamingConnected, progressDetailText, resumeNotice]);

  const floatingProcessingPanelItem = activeProcessingPanelItem
    ?? resumeProcessingPanelItem
    ?? (simulatedProcessingPanelVisible ? simulatedProcessingPanelItem : null);
  const floatingProcessingPanelKind = activeProcessingPanelItem
    ? 'real'
    : resumeProcessingPanelItem
      ? 'resume'
      : simulatedProcessingPanelVisible
        ? 'preview'
        : null;
  const floatingProcessingPanelIsReal = floatingProcessingPanelKind === 'real';
  const floatingProcessingPanelFolded = Boolean(
    floatingProcessingPanelIsReal
    && activeProcessingPanelFolded
    && !activeProcessingPanelForcedOpen
  );

  const renderFloatingProcessingPanel = () => {
    if (!floatingProcessingPanelItem) {
      return null;
    }
    return (
      <aside
        className={`reports-floating-processing-panel${floatingProcessingPanelFolded ? ' is-folded' : ''}`}
        data-helix-region={floatingProcessingPanelKind === 'real'
          ? 'reports/floating-processing-panel'
          : floatingProcessingPanelKind === 'resume'
            ? 'reports/floating-processing-resume'
            : 'reports/floating-processing-preview'}
        aria-label={floatingProcessingPanelKind === 'real'
          ? 'Report refresh processing panel'
          : floatingProcessingPanelKind === 'resume'
            ? 'Report refresh resumed panel'
            : 'Report refresh processing preview'}
      >
        {floatingProcessingPanelIsReal && (
          <button
            type="button"
            className="reports-floating-processing-panel__fold"
            onClick={(event) => {
              event.stopPropagation();
              if (floatingProcessingPanelFolded) {
                setActiveProcessingPanelManualFolded(false);
                setActiveProcessingPanelFolded(false);
                setActiveProcessingPanelForcedOpen(true);
                return;
              }
              setActiveProcessingPanelManualFolded(true);
              setActiveProcessingPanelFolded(true);
              setActiveProcessingPanelForcedOpen(false);
            }}
            aria-label={floatingProcessingPanelFolded ? 'Open feed breakdown' : 'Fold feed breakdown'}
            aria-expanded={!floatingProcessingPanelFolded}
          >
            <FontIcon iconName={floatingProcessingPanelFolded ? 'ChevronUp' : 'ChevronDown'} />
          </button>
        )}
        <button
          type="button"
          className="reports-floating-processing-panel__close"
          onClick={floatingProcessingPanelKind === 'real'
            ? hideActiveProcessingPanel
            : floatingProcessingPanelKind === 'resume'
              ? dismissResumeNotice
              : hideSimulatedProcessingPanel}
          aria-label={floatingProcessingPanelKind === 'real'
            ? 'Hide report processing panel'
            : floatingProcessingPanelKind === 'resume'
              ? 'Dismiss resumed refresh panel'
              : 'Hide report processing preview'}
        >
          <FontIcon iconName="Cancel" />
        </button>
        <ReportProcessingRailItemCard
          isDarkMode={isDarkMode}
          item={floatingProcessingPanelItem}
          embedded
          compact={floatingProcessingPanelFolded}
          onSurfaceClick={floatingProcessingPanelFolded ? () => {
            setActiveProcessingPanelManualFolded(false);
            setActiveProcessingPanelFolded(false);
            setActiveProcessingPanelForcedOpen(true);
          } : undefined}
          surfaceTitle={floatingProcessingPanelFolded ? 'Open feed breakdown' : undefined}
        />
      </aside>
    );
  };

  if (activeView === 'dashboard') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <ManagementDashboard
            enquiries={datasetData.enquiries}
            allMatters={datasetData.allMatters}
            wip={datasetData.wip}
            recoveredFees={datasetData.recoveredFees}
            teamData={datasetData.teamData}
            userData={datasetData.userData}
              annualLeave={datasetData.annualLeave}
              triggerRefresh={refreshDatasetsWithStreaming}
              lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
              isFetching={isFetching}
              dataWindowDays={managementRangeDays}
            />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'annualLeave') {
    return (
      <>
      {renderFloatingProcessingPanel()}
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
      </>
    );
  }

  if (activeView === 'matters') {
    return (
      <>
      {renderFloatingProcessingPanel()}
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
      </>
    );
  }

  if (activeView === 'enquiries') {
    return (
      <>
      {renderFloatingProcessingPanel()}
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
      </>
    );
  }

  if (activeView === 'enquiryLedger') {
    return (
      <>
        {renderFloatingProcessingPanel()}
        <EnquiryLedgerReport
          enquiries={datasetData.enquiries}
          deals={datasetData.deals}
          instructions={datasetData.instructions}
          teamData={datasetData.teamData}
          isFetching={isFetching}
          lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
          triggerRefresh={refreshEnquiriesScoped}
        />
      </>
    );
  }

  if (activeView === 'metaMetrics') {
    // Meta is off across the Reports tab. If anything tries to navigate to it
    // (stale persisted view, deep link, etc.), silently fall back to overview.
    return null;
  }

  if (activeView === 'seoReport') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <SeoReport
            cachedGa4Data={(datasetData.googleAnalytics ?? cachedData.googleAnalytics) || []}
            cachedEnquiries={(datasetData.enquiries ?? cachedData.enquiries) || []}
            cachedAllMatters={(datasetData.allMatters ?? cachedData.allMatters) || []}
            triggerRefresh={refreshGoogleAnalyticsOnly}
            lastRefreshTimestamp={datasetStatus.googleAnalytics?.updatedAt ?? undefined}
            isFetching={isFetching || datasetStatus.googleAnalytics?.status === 'loading'}
            initialRangeKey="custom"
            initialCustomDateRange={computeRangeWindowByKey(seoReportPreparedRangeKey ?? slimSeoRangeKey ?? '12m')}
          />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'marketingPerformance') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <AccessMatrixConnector isDarkMode={isDarkMode} surface="marketing" />
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <MarketingPerformanceReport
            cachedGa4Data={(datasetData.googleAnalytics ?? cachedData.googleAnalytics) || []}
            cachedGoogleAdsData={(ppcGoogleAdsData ?? datasetData.googleAds ?? cachedData.googleAds) || []}
            cachedEnquiries={(datasetData.enquiries ?? cachedData.enquiries) || []}
            ppcIncomeMetrics={ppcIncomeMetrics}
            isDarkMode={isDarkMode}
            isFetching={isFetching || datasetStatus.googleAnalytics?.status === 'loading'}
            lastRefreshTimestamp={datasetStatus.googleAnalytics?.updatedAt ?? undefined}
            googleAdsLastRefreshTimestamp={googleAdsLastRefreshTimestamp ?? undefined}
            triggerRefresh={refreshGoogleAnalyticsOnly}
            triggerPaidSearchRefresh={refreshGoogleAdsOnly}
            initialRangeKey="custom"
            initialCustomDateRange={computeRangeWindowByKey(marketingReportPreparedRangeKey ?? slimMarketingRangeKey ?? '12m')}
          />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'ppcReport') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <PpcReport 
              triggerRefresh={refreshPpcReport}
              cachedGoogleAdsData={(ppcGoogleAdsData ?? datasetData.googleAds ?? cachedData.googleAds) || []}
              ppcIncomeMetrics={ppcIncomeMetrics}
              isFetching={isFetching || ppcLoading}
              lastRefreshTimestamp={googleAdsLastRefreshTimestamp ?? undefined}
            />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'logMonitor') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <LogMonitor onBack={handleBackToOverview} />
      </div>
      </>
    );
  }

  if (activeView === 'syncHistory') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <SyncHistory onBack={handleBackToOverview} />
      </div>
      </>
    );
  }

  if (activeView === 'cacheMonitor') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <CacheMonitor onBack={handleBackToOverview} />
      </div>
      </>
    );
  }

  if (activeView === 'agedDebts') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <AgedDebtsReport onBack={handleBackToOverview} />
      </div>
      </>
    );
  }

  if (activeView === 'calls') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <CallsReport
            dubberCalls={datasetData.dubberCalls}
            teamData={datasetData.teamData}
            isFetching={isFetching}
            lastRefreshTimestamp={lastRefreshTimestamp ?? undefined}
            triggerRefresh={refreshDatasetsWithStreaming}
          />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'receptionReport') {
    if (!canSeeReceptionReport(userInitialsForGate)) {
      return (
        <>
        {renderFloatingProcessingPanel()}
        <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
          <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={{ padding: 24 }}>
            <div
              role="alert"
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                maxWidth: 520,
                margin: '40px auto',
                padding: 24,
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.10)'}`,
                background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(247,249,252,0.85)',
                color: isDarkMode ? '#e9ecf1' : '#061733',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--helix-highlight, #3690CE)' }}>
                Reception report
              </span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Locked</h2>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                This report is limited to LZ, AC, JW, and KW. Speak to one of them if you need a copy of the figures.
              </p>
              <div>
                <button
                  type="button"
                  onClick={handleBackToOverview}
                  style={{
                    appearance: 'none',
                    border: `1px solid var(--helix-highlight, #3690CE)`,
                    background: 'transparent',
                    color: 'var(--helix-highlight, #3690CE)',
                    fontFamily: 'Raleway, sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    padding: '6px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Back to Reports
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
      );
    }
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <ReceptionReport
            initialData={receptionReportSnapshot?.data ?? null}
            initialLoadedAt={receptionReportSnapshot?.loadedAt}
            initialRangeKey={receptionReportSnapshot?.rangeKey ?? RECEPTION_REPORT_DEFAULT_RANGE_KEY}
            initialCustomDateRange={receptionReportSnapshot?.range ?? null}
          />
        </div>
      </div>
      </>
    );
  }

  if (activeView === 'dataCentre') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div
        className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}
        style={{
          ...fullScreenWrapperStyle(isDarkMode),
          padding: 0,
          background: isDarkMode ? colours.dark.background : colours.light.background,
          color: isDarkMode ? colours.dark.text : colours.light.text,
        }}
      >
        {
          // When the production preview flag is active (toggled via Command Deck / Hub Tools),
          // restrict datasets shown in the Data Centre to reconciled ledgers and the
          // production-facing operational datasets only.
        }
        {(() => {
          const isProductionPreview = Boolean(featureToggles?.viewAsProd);
          const datasetsForDataCentre = isProductionPreview
            ? datasetSummariesSorted.filter((s) => (
              (s.definition.provider.category === 'reconciled-ledger') ||
              s.definition.key === 'enquiries' ||
              s.definition.key === 'allMatters' ||
              s.definition.key === 'emailLists'
            ))
            : datasetSummariesSorted;

          return (
            <DataCentre
              onBack={handleBackToOverview}
              onRefreshAll={refreshDatasetsWithStreaming}
              onRefreshDatasets={refreshDataHubDatasets}
              onRefreshCollected={refreshCollectedFeesOnly}
              isRefreshing={isActivelyLoading}
              progressPercent={streamingProgress.percentage}
              phaseLabel={refreshPhaseLabel}
              elapsedLabel={formatDurationMs(refreshElapsedMs)}
              datasets={datasetsForDataCentre}
              userName={propUserData?.[0]?.FullName || propUserData?.[0]?.Initials}
              userInitials={userInitialsForGate}
              userEmail={propUserData?.[0]?.Email}
              showProdAudienceBadge={!isLocalReportsHost}
              isDedicatedPage={dedicatedDataHub}
              demoModeEnabled={demoModeEnabled}
            />
          );
        })()}
      </div>
      </>
    );
  }

  if (activeView === 'responseTime') {
    return (
      <>
      {renderFloatingProcessingPanel()}
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <ResponseTimeReport enquiries={datasetData.enquiries} />
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <style>{spinnerStyle}</style>

      <div className="reporting-home-container" style={containerStyle(isDarkMode)}>
        {renderFloatingProcessingPanel()}
        <section style={{
          padding: 0,
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
        }}>
          <div style={{ display: showLegacyReportsChrome ? 'flex' : 'none', alignItems: 'center', justifyContent: 'flex-end', marginBottom: showLegacyReportsChrome ? 18 : 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Slim users get the big preset row + joined Open Dashboard
                  button below the header instead of the small toolbar. */}
              {showLegacyReportsChrome && (
              <>
              {/* Primary CTA */}
              <PrimaryButton
                text='Open dashboard'
                onClick={handleLaunchDashboard}
                styles={{
                  root: {
                    borderRadius: 0,
                    padding: '0 20px',
                    height: 34,
                    background: colours.cta,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    fontFamily: 'Raleway, sans-serif',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    marginRight: 6,
                  },
                  rootHovered: {
                    background: '#b94736',
                    boxShadow: 'none',
                  },
                  rootDisabled: {
                    background: isDarkMode ? 'rgba(75, 85, 99, 0.12)' : `${colours.subtleGrey}22`,
                  },
                  icon: {
                    color: '#ffffff',
                    fontSize: 14,
                  },
                }}
                disabled={isActivelyLoading}
                iconProps={{ iconName: 'Forward' }}
              />

              {/* Utility toolbar â€” icon-only with tooltips */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderLeft: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(6, 23, 51, 0.05)'}`,
                paddingLeft: 8,
              }}>
                <TooltipHost content={isActivelyLoading ? 'Refreshing...' : 'Refresh all datasets'}>
                  <IconButton
                    ariaLabel="Refresh all datasets"
                    iconProps={{ iconName: 'Sync' }}
                    onClick={refreshDatasetsWithStreaming}
                    disabled={isActivelyLoading}
                    styles={{
                      root: {
                        width: 32,
                        height: 32,
                        borderRadius: 0,
                        border: 'none',
                        background: 'transparent',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        animation: isActivelyLoading ? 'spin 1s linear infinite' : 'none',
                      },
                      rootHovered: {
                        background: isDarkMode ? 'rgba(75, 85, 99, 0.12)' : 'rgba(75, 85, 99, 0.06)',
                        color: isDarkMode ? colours.dark.text : colours.greyText,
                      },
                      icon: { fontSize: 14 },
                    }}
                  />
                </TooltipHost>
                <TooltipHost content="Data window settings">
                  <span ref={refreshRangeButtonRef}>
                    <IconButton
                      ariaLabel="Adjust data window"
                      iconProps={{ iconName: 'Settings' }}
                      onClick={handleToggleRefreshRangeCallout}
                      styles={{
                        root: {
                          width: 32,
                          height: 32,
                          borderRadius: 0,
                          border: 'none',
                          background: 'transparent',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        },
                        rootHovered: {
                          background: isDarkMode ? 'rgba(75, 85, 99, 0.12)' : 'rgba(75, 85, 99, 0.06)',
                          color: isDarkMode ? colours.dark.text : colours.greyText,
                        },
                        icon: { fontSize: 14 },
                      }}
                    />
                  </span>
                </TooltipHost>
                {canAccessReportingOps && showLegacyReportsChrome && (
                  <TooltipHost content="View reporting activity feed">
                    <IconButton
                      ariaLabel="Open reporting activity"
                      iconProps={{ iconName: 'Health' }}
                      onClick={() => setShowReportingOpsModal(true)}
                      styles={{
                        root: {
                          width: 32,
                          height: 32,
                          borderRadius: 0,
                          border: 'none',
                          background: 'transparent',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        },
                        rootHovered: {
                          background: isDarkMode ? 'rgba(75, 85, 99, 0.12)' : 'rgba(75, 85, 99, 0.06)',
                          color: isDarkMode ? colours.dark.text : colours.greyText,
                        },
                        icon: { fontSize: 14 },
                      }}
                    />
                  </TooltipHost>
                )}
              </div>
              </>
              )}
            </div>
          </div>

          {showLegacyReportsChrome && <ReportingPulseStrip isDarkMode={isDarkMode} />}

          {isRefreshRangeCalloutOpen && refreshRangeButtonRef.current && (
            <Callout
              target={refreshRangeButtonRef.current}
              onDismiss={handleCloseRefreshRangeCallout}
              setInitialFocus
              styles={{
                root: {
                  width: 360,
                  borderRadius: 0,
                  boxShadow: isDarkMode 
                    ? '0 4px 16px rgba(0, 0, 0, 0.2)' 
                    : '0 4px 16px rgba(6, 23, 51, 0.08)',
                  border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)'}`,
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(24px) saturate(1.6)',
                  padding: 0,
                },
                calloutMain: {
                  borderRadius: 0,
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  padding: 0,
                },
                beak: {
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                  border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)'}`,
                  boxShadow: 'none',
                },
                beakCurtain: {
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                  borderRadius: 0,
                },
              }}
            >
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, color: isDarkMode ? colours.subtleGrey : colours.greyText, opacity: isDarkMode ? 0.8 : 0.7 }}>
                    Reporting data window
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, marginTop: 4 }}>
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
                          background: isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(75, 85, 99, 0.5)',
                        },
                      },
                    },
                    activeSection: {
                      background: brandSignal(isDarkMode),
                      boxShadow: 'none',
                    },
                    thumb: {
                      borderColor: brandSignal(isDarkMode),
                      background: brandSignal(isDarkMode),
                      boxShadow: 'none',
                    },
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {REPORT_RANGE_OPTIONS.map((option, index) => {
                    const isSelected = enquiriesRangeSliderValue === index;
                    return (
                      <span
                        key={option.key}
                        title={getRangeOptionTitle(option.key, 'enquiries')}
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected
                            ? (isDarkMode ? colours.blue : colours.highlight)
                            : (isDarkMode ? colours.subtleGrey : colours.greyText),
                          padding: '4px 12px',
                          borderRadius: 2,
                          border: isSelected
                            ? `1px solid ${brandSignal(isDarkMode)}`
                            : `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(75, 85, 99, 0.14)'}`,
                          background: isSelected
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.14)')
                            : (isDarkMode ? 'rgba(107, 107, 107, 0.25)' : 'rgba(244, 244, 246, 0.9)'),
                          transition: 'all 0.2s ease',
                          cursor: 'default',
                        }}
                      >
                        <span className="reports-range-label-full">{option.label}</span>
                        <span className="reports-range-label-compact" aria-hidden="true">{option.shortLabel}</span>
                      </span>
                    );
                  })}
                </div>
                {(enquiriesCoverageEntriesForDisplay.length > 0 || mattersCoverageEntriesForDisplay.length > 0) && (
                  <div style={{
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(214, 232, 255, 0.4)',
                    borderRadius: 0,
                    padding: '12px 14px',
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    border: `0.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.12)'}`,
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
                            color: isDarkMode ? colours.subtleGrey : colours.light.text,
                            paddingBottom: 6,
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(54, 144, 206, 0.1)'}`,
                          }}
                        >
                          <span>{entry.label}</span>
                          <span style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{entry.range}</span>
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
          <AccessMatrixConnector isDarkMode={isDarkMode} surface="reports" compact={isSlimReports} />

          {renderAvailableReportCards()}

          {/* ── Activity Monitor — not a report, a utility tool ── */}
          {canAccessReportingOps && showLegacyReportsChrome && (
            <div
              onClick={() => navigateToReport('logMonitor')}
              style={{
                marginTop: 18,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderRadius: 0,
                border: `0.5px solid ${subtleStroke(isDarkMode)}`,
                background: isDarkMode ? 'rgba(10, 28, 50, 0.35)' : 'rgba(244, 244, 246, 0.35)',
                backdropFilter: 'blur(12px) saturate(1.3)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: 0.78,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.36)' : 'rgba(6, 23, 51, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.78';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 14,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  <FontIcon iconName="Health" style={{ fontSize: 14 }} />
                </span>
                <div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    Activity monitor
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: isDarkMode ? 'rgba(75, 85, 99, 0.7)' : 'rgba(107, 107, 107, 0.8)',
                    marginLeft: 10,
                  }}>
                    {'Real-time hub logs \u00B7 Application Insights level'}
                  </span>
                </div>
              </div>
              <FontIcon
                iconName="ChevronRight"
                style={{
                  fontSize: 10,
                  color: isDarkMode ? colours.greyText : colours.subtleGrey,
                }}
              />
            </div>
          )}

          {/* â”€â”€ Sync History â€” scheduler tier timeline â”€â”€ */}
          {canAccessReportingOps && showLegacyReportsChrome && (
            <div
              onClick={() => navigateToReport('syncHistory')}
              style={{
                marginTop: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderRadius: 0,
                border: `0.5px solid ${subtleStroke(isDarkMode)}`,
                background: isDarkMode ? 'rgba(10, 28, 50, 0.35)' : 'rgba(244, 244, 246, 0.35)',
                backdropFilter: 'blur(12px) saturate(1.3)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: 0.78,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.36)' : 'rgba(6, 23, 51, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.78';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 14,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  <FontIcon iconName="Sync" style={{ fontSize: 14 }} />
                </span>
                <div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    Sync history
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: isDarkMode ? 'rgba(75, 85, 99, 0.7)' : 'rgba(107, 107, 107, 0.8)',
                    marginLeft: 10,
                  }}>
                    {'Scheduler tiers \u00B7 last runs \u00B7 next fires'}
                  </span>
                </div>
              </div>
              <FontIcon
                iconName="ChevronRight"
                style={{
                  fontSize: 10,
                  color: isDarkMode ? colours.greyText : colours.subtleGrey,
                }}
              />
            </div>
          )}

          {/* â”€â”€ Cache Monitor â€” only for LZ/AC in prod, everyone locally â”€â”€ */}
          {(() => {
            const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            const canSeeCacheMonitor = (isLocal || canSeePrivateHubControls(primaryUser)) && showLegacyReportsChrome;
            if (!canSeeCacheMonitor) return null;
            return (
              <div
                onClick={() => navigateToReport('cacheMonitor')}
                style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderRadius: 0,
                  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
                  background: isDarkMode ? 'rgba(10, 28, 50, 0.35)' : 'rgba(244, 244, 246, 0.35)',
                  backdropFilter: 'blur(12px) saturate(1.3)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  opacity: 0.78,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.36)' : 'rgba(6, 23, 51, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.78';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 14,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <FontIcon iconName="Database" style={{ fontSize: 14 }} />
                  </span>
                  <div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      fontFamily: 'Raleway, sans-serif',
                    }}>
                      Cache monitor
                    </span>
                    <span style={{
                      fontSize: 10,
                      color: isDarkMode ? 'rgba(75, 85, 99, 0.7)' : 'rgba(107, 107, 107, 0.8)',
                      marginLeft: 10,
                    }}>
                      {'Redis state \u00B7 TTL \u00B7 hit rates \u00B7 staleness'}
                    </span>
                  </div>
                </div>
                <FontIcon
                  iconName="ChevronRight"
                  style={{
                    fontSize: 10,
                    color: isDarkMode ? colours.greyText : colours.subtleGrey,
                  }}
                />
              </div>
            );
          })()}
        </section>

      </div>

      {canAccessReportingOps && (
        <Modal
          isOpen={showReportingOpsModal}
          onDismiss={() => setShowReportingOpsModal(false)}
          isBlocking={false}
          styles={{
            main: {
              width: 560,
              maxWidth: 'calc(100vw - 40px)',
              borderRadius: 0,
              background: isDarkMode ? 'rgba(6, 23, 51, 0.96)' : 'rgba(255, 255, 255, 0.96)',
              border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.32)' : 'rgba(6, 23, 51, 0.08)'}`,
              boxShadow: isDarkMode ? '0 6px 20px rgba(0, 0, 0, 0.42)' : '0 6px 20px rgba(6, 23, 51, 0.14)',
            },
          }}
        >
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight }}>
                  Loading Reporting Data
                </span>
                <span style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.4 }}>
                  Fetching latest data. You can continue browsing - we'll notify you when it's ready.
                </span>
              </div>
              <IconButton
                ariaLabel="Close reporting activity"
                iconProps={{ iconName: 'Cancel' }}
                onClick={() => setShowReportingOpsModal(false)}
                styles={{ root: { width: 28, height: 28, borderRadius: 0, color: isDarkMode ? colours.subtleGrey : colours.greyText } }}
              />
            </div>

            <div style={{
              border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.26)' : 'rgba(6, 23, 51, 0.08)'}`,
              background: isDarkMode ? 'rgba(2, 6, 23, 0.75)' : 'rgba(244, 244, 246, 0.75)',
              minHeight: 210,
              maxHeight: 280,
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontFamily: 'Consolas, Monaco, monospace',
            }}>
              {reportingOpsRows.length === 0 && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  {isFetching ? 'Waiting for reporting activity...' : 'No recent reporting activity.'}
                </span>
              )}
              {reportingOpsRows.map((entry) => (
                <div key={entry.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11, lineHeight: 1.35 }}>
                  <span style={{ minWidth: 95, color: isDarkMode ? 'rgba(160, 160, 160, 0.9)' : 'rgba(107, 107, 107, 0.9)' }}>
                    {entry.label}
                  </span>
                  <span style={{ color: isDarkMode ? 'rgba(243, 244, 246, 0.92)' : 'rgba(6, 23, 51, 0.9)', wordBreak: 'break-word' }}>
                    {entry.status.toUpperCase()}
                    {entry.updatedAt ? ` | ${new Date(entry.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                Restricted to operations/admin access.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <DefaultButton
                  text="Open Activity Monitor"
                  onClick={() => {
                    setShowReportingOpsModal(false);
                    navigateToReport('logMonitor');
                  }}
                  styles={subtleButtonStyles(isDarkMode)}
                />
                <PrimaryButton
                  text="Close"
                  onClick={() => setShowReportingOpsModal(false)}
                  styles={primaryButtonStyles(isDarkMode)}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ReportingHome;
