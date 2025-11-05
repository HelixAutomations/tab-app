import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  DefaultButton,
  PrimaryButton,
  Spinner,
  SpinnerSize,
  FontIcon,
  type IButtonStyles,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import type { Enquiry, Matter, POID, TeamData, UserData } from '../../app/functionality/types';
import ManagementDashboard, { WIP } from './ManagementDashboard';
import AnnualLeaveReport, { AnnualLeaveRecord } from './AnnualLeaveReport';
import MetaMetricsReport from './MetaMetricsReport';
import SeoReport from './SeoReport';
import PpcReport from './PpcReport';
import { debugLog, debugWarn } from '../../utils/debug';
import { getNormalizedEnquirySource } from '../../utils/enquirySource';
import HomePreview from './HomePreview';
import EnquiriesReport, { MarketingMetrics } from './EnquiriesReport';
import { useStreamingDatasets } from '../../hooks/useStreamingDatasets';
import { fetchWithRetry, fetchJSON } from '../../utils/fetchUtils';
import markWhite from '../../assets/markwhite.svg';
import type { PpcIncomeMetrics } from './PpcReport';

// Persist streaming progress across navigation
const STREAM_SNAPSHOT_KEY = 'reporting_stream_snapshot_v1';
const CACHE_STATE_KEY = 'reporting_cache_state_v1';

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
    sessionStorage.setItem(CACHE_STATE_KEY, JSON.stringify({ 
      hasFetchedOnce, 
      lastCacheTime: lastCacheTime ?? cachedTimestamp 
    }));
  } catch {/* ignore */}
};

// Helper to update both local state and persistence
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
    const fromNumber = new Date(input);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
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
  const candidate = new Date(normalised);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
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
      entry['Initials'] = initials.trim();
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
  // Additional GA4 metrics...
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

// (Removed time range settings; we always fetch 24 months for GA4 and Google Ads)

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
  deals: Deal[] | null;
  instructions: InstructionSummary[] | null;
}

interface AnnualLeaveFetchResult {
  records: AnnualLeaveRecord[];
  current: AnnualLeaveRecord[];
  future: AnnualLeaveRecord[];
  team: TeamData[];
  userDetails?: Record<string, unknown>;
}

// Meta Metrics Deal interface for tracking conversion funnel
interface Deal {
  DealId: number;
  ProspectId: number;
  InstructionRef?: string;
  ServiceDescription: string;
  Amount?: number;
  AreaOfWork?: string;
  PitchedBy?: string;
  PitchedDate?: string;
  PitchedTime?: string;
  Status: string;
  IsMultiClient?: boolean;
  LeadClientEmail?: string;
  FirstName?: string;
  LastName?: string;
  Phone?: string;
  isPitchedDeal?: boolean;
  CreatedDate?: string;
  ModifiedDate?: string;
  CloseDate?: string;
}

// Instruction summary for conversion tracking
interface InstructionSummary {
  InstructionRef: string;
  ProspectId?: number;
  Email?: string;
  Stage?: string;
  Status?: string;
  CreatedDate?: string;
  MatterId?: string;
  ClientId?: string;
  workflow?: string;
  payments?: any;
}

// (Removed TIME_RANGE_OPTIONS and settings state)

// Dataset groups for better organization and dependency tracking
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
  action?: 'dashboard' | 'annualLeave' | 'enquiries' | 'metaMetrics' | 'seoReport' | 'ppcReport';
  requiredDatasets: DatasetKey[]; // Dependencies for this report
  description?: string;
  disabled?: boolean; // Mark report as disabled/not ready
}

const AVAILABLE_REPORTS: AvailableReport[] = [
  {
    key: 'management',
    name: 'Management dashboard',
    status: 'Live today',
    action: 'dashboard',
    // Make ID Submissions (poidData) non-blocking: it's useful but not critical for initial dashboard render
    requiredDatasets: ['enquiries', 'allMatters', 'wip', 'recoveredFees', 'teamData', 'userData', 'annualLeave'],
  },
  {
    key: 'enquiries',
    name: 'Enquiries report',
    status: 'Live today',
    action: 'enquiries',
    requiredDatasets: ['enquiries', 'teamData', 'annualLeave', 'metaMetrics'],
  },
  {
    key: 'annualLeave',
    name: 'Annual leave report',
    status: 'Live today',
    action: 'annualLeave',
    requiredDatasets: ['annualLeave', 'teamData'],
  },
  {
    key: 'metaMetrics',
    name: 'Meta ads',
    status: 'Live today',
    action: 'metaMetrics',
    requiredDatasets: ['metaMetrics', 'enquiries'],
  },
  {
    key: 'seo',
    name: 'SEO report',
    status: 'ETA 1 day',
    action: 'seoReport' as const,
    requiredDatasets: ['googleAnalytics', 'googleAds'] as DatasetKey[],
    disabled: true, // Keep disabled for now
  },
  {
    key: 'ppc',
    name: 'PPC report',
    status: 'Ready',
    action: 'ppcReport' as const,
    requiredDatasets: ['googleAds', 'enquiries', 'allMatters', 'recoveredFees'] as DatasetKey[],
    disabled: false, // Enabled in production
  },
  {
    key: 'matters',
    name: 'Matters snapshot',
    status: 'Matters tab',
    requiredDatasets: ['allMatters'],
  },
];

const MANAGEMENT_DATASET_KEYS = DATASETS.map((dataset) => dataset.key);
const REPORTING_ENDPOINT = '/api/reporting/management-datasets';

const EMPTY_DATASET: DatasetMap = {
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

let cachedData: DatasetMap = { ...EMPTY_DATASET };
let cachedTimestamp: number | null = null;

const LIGHT_BACKGROUND_COLOUR = colours.light.background;
const DARK_BACKGROUND_COLOUR = colours.dark.background;
const LIGHT_SURFACE_COLOUR = colours.light.sectionBackground;
const DARK_SURFACE_COLOUR = colours.dark.sectionBackground;

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
    dot: '#22c55e', // Green dot for dark mode, will override for light mode in render
    label: 'Ready',
    icon: 'CheckMark',
  },
  loading: {
    lightBg: 'rgba(54, 144, 206, 0.18)', // Using highlight blue
    darkBg: 'rgba(54, 144, 206, 0.32)',
    dot: '#3690CE', // highlight blue
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
    ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 65%, #cbd5e1 100%)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  transition: 'background 0.3s ease, color 0.3s ease',
  fontFamily: 'Raleway, sans-serif',
});

const sectionSurfaceStyle = (isDarkMode: boolean, overrides: CSSProperties = {}): CSSProperties => ({
  background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
  borderRadius: 12,
  border: `1px solid ${subtleStroke(isDarkMode)}`,
  boxShadow: surfaceShadow(isDarkMode),
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  ...overrides,
});

const heroSurfaceStyle = (isDarkMode: boolean): CSSProperties => (
  sectionSurfaceStyle(isDarkMode, {
    gap: 14,
    padding: '22px 24px',
    position: 'relative',
    overflow: 'hidden',
  })
);

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
  // Make hover effect more subtle by reducing the delta and easing
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

const reportRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${subtleStroke(isDarkMode)}`,
  background: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : 'rgba(255, 255, 255, 0.95)',
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
  borderRadius: 8,
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
  fontSize: 16,
  fontWeight: 600,
  fontFamily: 'Raleway, sans-serif',
};

const heroMetaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  fontSize: 12,
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

const conditionalButtonStyles = (isDarkMode: boolean, state: ButtonState): IButtonStyles => ({
  root: {
    borderRadius: 8,
    padding: '0 16px',
    height: 34,
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
    fontWeight: 500,
    boxShadow: 'none',
    transition: 'all 0.2s ease',
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
    borderRadius: 8,
    padding: '0 16px',
    height: 34,
    background: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : '#061733',
    color: isDarkMode ? '#86efac' : '#ffffff',
    border: isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(6, 23, 51, 0.4)',
    fontWeight: 500,
    boxShadow: 'none',
    transition: 'all 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(34, 197, 94, 0.2)' : '#0d2f60',
    borderColor: isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(13, 47, 96, 0.6)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(34, 197, 94, 0.25)' : '#051a33',
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)',
    color: isDarkMode ? '#64748b' : '#94a3b8',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
  },
});

const subtleButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 8,
    padding: '0 14px',
    height: 34,
    background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.04)',
    color: isDarkMode ? '#cbd5e1' : '#64748b',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
    fontWeight: 500,
    boxShadow: 'none',
    transition: 'background 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.08)',
    color: isDarkMode ? '#cbd5e1' : '#64748b',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(148, 163, 184, 0.12)',
  },
});

const dashboardNavigatorStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
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
}

/**
 * Streamlined reporting landing page that centres on the Management Dashboard experience.
 */
const ReportingHome: React.FC<ReportingHomeProps> = ({ userData: propUserData, teamData: propTeamData }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [activeView, setActiveView] = useState<'overview' | 'dashboard' | 'annualLeave' | 'enquiries' | 'metaMetrics' | 'seoReport' | 'ppcReport'>('overview');
  const [heroHovered, setHeroHovered] = useState(false);
  const [isDataSourcesExpanded, setIsDataSourcesExpanded] = useState(false);
  // (Removed marketing data settings state; always fetch 24 months)
  
  // Memoize handlers to prevent recreation on every render
  const handleBackToOverview = useCallback(() => {
    setActiveView('overview');
  }, []);

  // Fetch Google Analytics data with time range
  const fetchGoogleAnalyticsData = useCallback(async (months: number): Promise<GoogleAnalyticsData[]> => {
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
  const fetchGoogleAdsData = useCallback(async (months: number): Promise<GoogleAdsData[]> => {
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
  const datasetStatusRef = useRef<DatasetStatus>(datasetStatus);
  const refreshStartedAtRef = useRef<number | null>(refreshStartedAt);
  const isStreamingConnectedRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(isFetching);
  // PPC-specific Google Ads data (24 months)
  const [ppcGoogleAdsData, setPpcGoogleAdsData] = useState<GoogleAdsData[] | null>(null);
  const [ppcLoading, setPpcLoading] = useState<boolean>(false);
  const [ppcGoogleAdsUpdatedAt, setPpcGoogleAdsUpdatedAt] = useState<number | null>(() => {
    const initial = datasetStatus.googleAds?.updatedAt;
    return typeof initial === 'number' && Number.isFinite(initial) ? initial : null;
  });
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
  const [feedPreviewOpen, setFeedPreviewOpen] = useState<Record<string, boolean>>({});
  const toggleFeedPreview = useCallback((key: string) => {
    setFeedPreviewOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

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
  const streamableDatasets = useMemo(
    () => {
      const base = MANAGEMENT_DATASET_KEYS.filter(key => key !== 'annualLeave'); // Keep metaMetrics in streaming
      // Ensure current-week WIP (Clio) and DB fallback are streamed so "This Week" metrics populate during streaming
      return [...base, 'wipClioCurrentWeek' as unknown as DatasetKey, 'wipDbCurrentWeek' as unknown as DatasetKey];
    },
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
  });

  useEffect(() => {
    datasetStatusRef.current = datasetStatus;
  }, [datasetStatus]);

  useEffect(() => {
    refreshStartedAtRef.current = refreshStartedAt;
  }, [refreshStartedAt]);

  useEffect(() => {
    isStreamingConnectedRef.current = isStreamingConnected;
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
          startStreaming();
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
          console.log('Persisted incomplete streaming session for resume');
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

  // Fetch 24 months of Google Ads data when opening PPC report
  useEffect(() => {
    let cancelled = false;
    if (activeView === 'ppcReport') {
      setPpcLoading(true);
      fetchGoogleAdsData(24)
        .then((rows) => {
          if (cancelled) {
            return;
          }
          setPpcGoogleAdsData(rows || []);
          setPpcGoogleAdsUpdatedAt(Date.now());
        })
        .catch(() => {/* ignore, will fallback to cached */})
        .finally(() => { if (!cancelled) setPpcLoading(false); });
    }
    return () => { cancelled = true; };
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

  // Fetch 24 months of Google Analytics data when opening SEO report
  useEffect(() => {
    let cancelled = false;
    if (activeView === 'seoReport') {
      // Optionally reflect loading in datasetStatus
      setDatasetStatus(prev => ({
        ...prev,
        googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
      }));
      fetchGoogleAnalyticsData(24)
        .then((rows) => {
          if (!cancelled) {
            setDatasetData(prev => ({ ...prev, googleAnalytics: rows || [] }));
            const now = Date.now();
            setDatasetStatus(prev => ({
              ...prev,
              googleAnalytics: { status: 'ready', updatedAt: now },
            }));
            cachedData = { ...cachedData, googleAnalytics: rows || [] };
            cachedTimestamp = now;
            updateRefreshTimestamp(now, setLastRefreshTimestamp);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDatasetStatus(prev => ({
              ...prev,
              googleAnalytics: { status: 'error', updatedAt: prev.googleAnalytics?.updatedAt ?? null },
            }));
          }
        });
    }
    return () => { cancelled = true; };
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
  const fetchMetaMetrics = useCallback(async (): Promise<MarketingMetrics[]> => {
    debugLog('ReportingHome: fetchMetaMetrics called');
    
    try {
      // Use our Express server route for live Facebook data with daily breakdown
      const url = `/api/marketing-metrics?daysBack=30`; // Get last 30 days of daily data
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
  const performStreamingRefresh = useCallback(async (forceRefresh: boolean) => {
    // Prevent triggering if already actively loading
    if (isFetching && (isStreamingConnected || refreshStartedAt !== null)) {
      console.log('Refresh already in progress, skipping');
      return;
    }
    
    debugLog('ReportingHome: refreshDatasetsWithStreaming called', { forceRefresh });
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());

    // Initialize all dataset statuses to loading
    setDatasetStatus((prev) => {
      const next: DatasetStatus = { ...prev };
      MANAGEMENT_DATASET_KEYS.forEach((key) => {
        const previousMeta = prev[key];
        next[key] = { status: 'loading', updatedAt: previousMeta?.updatedAt ?? null };
      });
      return next;
    });

    try {
      console.log('🌊 Starting streaming with datasets:', streamableDatasets);
      console.log('🌊 EntraID for streaming:', propUserData?.[0]?.EntraID);
      startStreaming(forceRefresh ? { bypassCache: true } : undefined);

      const nowTs = Date.now();
      const thirtyMinutes = 30 * 60 * 1000; // Extended intervals for auxiliary data
      const lastAL = datasetStatus.annualLeave?.updatedAt ?? 0;
      const lastMeta = datasetStatus.metaMetrics?.updatedAt ?? 0;
      const lastGA = datasetStatus.googleAnalytics?.updatedAt ?? 0;
      const lastGAds = datasetStatus.googleAds?.updatedAt ?? 0;

      const shouldFetchAnnualLeave = forceRefresh || !cachedData.annualLeave || (nowTs - lastAL) > thirtyMinutes;
      const shouldFetchMeta = forceRefresh || !cachedData.metaMetrics || (nowTs - lastMeta) > thirtyMinutes;
      const shouldFetchGA = forceRefresh || !cachedData.googleAnalytics || (nowTs - lastGA) > thirtyMinutes;
      const shouldFetchGAds = forceRefresh || !cachedData.googleAds || (nowTs - lastGAds) > thirtyMinutes;

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
          shouldFetchMeta ? fetchMetaMetrics() : Promise.resolve(metaMetricsData),
          shouldFetchGA ? fetchGoogleAnalyticsData(24) : Promise.resolve(googleAnalyticsData),
          shouldFetchGAds ? fetchGoogleAdsData(24) : Promise.resolve(googleAdsData),
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
        metaMetrics: metaMetricsData,
        googleAnalytics: googleAnalyticsData,
        googleAds: googleAdsData,
        ...(refreshedTeamData && refreshedTeamData.length > 0 && (!prev.teamData || prev.teamData.length === 0)
          ? { teamData: refreshedTeamData }
          : {}),
      }));

      setDatasetStatus(prev => ({
        ...prev,
        annualLeave: { status: 'ready', updatedAt: shouldFetchAnnualLeave ? nowTs : (prev.annualLeave?.updatedAt ?? nowTs) },
        metaMetrics: { status: 'ready', updatedAt: shouldFetchMeta ? nowTs : (prev.metaMetrics?.updatedAt ?? nowTs) },
        googleAnalytics: { status: 'ready', updatedAt: shouldFetchGA ? nowTs : (prev.googleAnalytics?.updatedAt ?? nowTs) },
        googleAds: { status: 'ready', updatedAt: shouldFetchGAds ? nowTs : (prev.googleAds?.updatedAt ?? nowTs) },
      }));

      cachedData = {
        ...cachedData,
        annualLeave: annualLeaveData,
        metaMetrics: metaMetricsData,
        googleAnalytics: googleAnalyticsData,
        googleAds: googleAdsData,
        ...(refreshedTeamData && refreshedTeamData.length > 0 ? { teamData: refreshedTeamData } : {}),
      };
      cachedTimestamp = nowTs;
      updateRefreshTimestamp(nowTs, setLastRefreshTimestamp);

    } catch (fetchError) {
      debugWarn('Failed to refresh non-streaming datasets:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
    }
    // Note: Don't set isFetching(false) here - let the streaming completion handler do it
  }, [
    startStreaming,
    fetchAnnualLeaveDataset,
    fetchMetaMetrics,
    streamableDatasets,
    fetchGoogleAnalyticsData,
    fetchGoogleAdsData,
    isFetching,
    isStreamingConnected,
    refreshStartedAt,
  ]);

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
      console.log(`Global refresh cooldown active: ${Math.round(timeSinceGlobalRefresh / 1000)}s since last global refresh`);
      return;
    }
    
    // Prevent multiple refresh requests within the minimum interval
    if (timeSinceLastRefresh < minRefreshInterval) {
      console.log(`Refresh throttled: only ${Math.round(timeSinceLastRefresh / 1000)}s since last refresh (min: 30s)`);
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
    
    lastRefreshRef.current = now;
    globalLastRefresh = now; // Update global refresh timestamp
    // Use cached server data by default for speed; full fresh is available via the global Refresh Data modal
    return performStreamingRefresh(false);
  }, [performStreamingRefresh]);

  // Scoped refreshers for specific reports with enhanced throttling
  const refreshAnnualLeaveOnly = useCallback(async () => {
    // Prevent retriggering if already loading or recently completed
    if (isFetching || (datasetStatus.annualLeave?.status === 'loading')) return;
    
    const lastUpdate = datasetStatus.annualLeave?.updatedAt;
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000); // Extended to 15 minutes
    if (lastUpdate && lastUpdate > fifteenMinutesAgo) {
      console.log('Annual leave data is recent, skipping refresh');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh annual leave');
      setStatusesFor(['annualLeave'], 'error');
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchAnnualLeaveDataset, setStatusesFor, isFetching, datasetStatus.annualLeave]);

  const refreshMetaMetricsOnly = useCallback(async () => {
    // Prevent retriggering if already loading or recently completed
    if (isFetching || (datasetStatus.metaMetrics?.status === 'loading')) return;
    
    const lastUpdate = datasetStatus.metaMetrics?.updatedAt;
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000); // Extended to 15 minutes
    if (lastUpdate && lastUpdate > fifteenMinutesAgo) {
      console.log('Meta metrics data is recent, skipping refresh');
      return;
    }
    
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    setStatusesFor(['metaMetrics'], 'loading');
    try {
      const metrics = await fetchMetaMetrics();
      setDatasetData(prev => ({ ...prev, metaMetrics: metrics }));
      const now = Date.now();
      setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'ready', updatedAt: now } }));
      cachedData = { ...cachedData, metaMetrics: metrics };
      cachedTimestamp = now;
  updateRefreshTimestamp(now, setLastRefreshTimestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh Meta metrics');
      setStatusesFor(['metaMetrics'], 'error');
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchMetaMetrics, setStatusesFor, isFetching, datasetStatus.metaMetrics]);

  const refreshEnquiriesScoped = useCallback(async () => {
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    // Only the datasets this report needs
    const needed: DatasetKey[] = ['enquiries', 'teamData'];
    setStatusesFor(needed, 'loading');
    
    const errors: string[] = [];
    
    try {
      // Start streaming just the needed datasets
      startStreaming({ datasets: needed, bypassCache: true });
      
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
      
      // Try to fetch meta metrics - non-blocking
      try {
        const meta = await fetchMetaMetrics();
        setDatasetData(prev => ({ ...prev, metaMetrics: meta }));
        setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'ready', updatedAt: now } }));
        cachedData = { ...cachedData, metaMetrics: meta };
      } catch (metaError) {
        errors.push('Meta metrics');
        console.error('Meta metrics fetch failed (non-blocking):', metaError);
        setDatasetStatus(prev => ({ ...prev, metaMetrics: { status: 'error', updatedAt: now } }));
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
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchAnnualLeaveDataset, fetchMetaMetrics, setStatusesFor, startStreaming]);

  // Sync streaming dataset updates with local state
  useEffect(() => {
    Object.entries(streamingDatasets).forEach(([datasetName, datasetState]) => {
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

    if (!activitiesToMerge || activitiesToMerge.length === 0) return;

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
      console.log('🔗 Merged current-week activities into WIP (streaming):', {
        base: baseWip.length,
        added: merged.length - baseWip.length,
        total: merged.length,
      });
      return { ...prev, wip: merged };
    });
  }, [streamingDatasets.wip, streamingDatasets.wipClioCurrentWeek, streamingDatasets.wipDbCurrentWeek]);

  // Handle streaming completion
  useEffect(() => {
    if (isStreamingComplete) {
      setIsFetching(false);
      setRefreshStartedAt(null);
      // Clear any pending refresh state
      debugLog('ReportingHome: Streaming completed, clearing fetch state');
      debugLog('ReportingHome: isStreamingConnected =', isStreamingConnected, 'isStreamingComplete =', isStreamingComplete);
    }
  }, [isStreamingComplete, isStreamingConnected]);

  const refreshDatasets = useCallback(async () => {
    debugLog('ReportingHome: refreshDatasets called (delegating to streaming)');
    await performStreamingRefresh(true);
  }, [performStreamingRefresh]);

  // Predictive cache loading - preload commonly needed datasets when Reports tab is accessed
  const preloadReportingCache = useCallback(async () => {
    // Check if we have recent cached data to avoid unnecessary preheating
    const cacheState = getCacheState();
    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000);
    
    // Only preload if we haven't fetched once OR cache is older than 30 minutes
    const shouldPreheat = !hasFetchedOnce || 
                          !cacheState.lastCacheTime || 
                          cacheState.lastCacheTime < thirtyMinutesAgo;
    
    if (shouldPreheat) {
      const commonDatasets = ['teamData', 'userData', 'enquiries', 'allMatters'];
      const cacheAgeSeconds = cacheState.lastCacheTime ? Math.round((now - cacheState.lastCacheTime) / 1000) : null;
      console.log(`🔄 Cache refresh needed: ${!hasFetchedOnce ? 'first load' : `cache age: ${cacheAgeSeconds}s (>30min)`}`);
      debugLog('ReportingHome: Preloading common reporting datasets on tab access:', commonDatasets);
      try {
        await fetch('/api/cache-preheater/preheat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            datasets: commonDatasets,
            entraId: propUserData?.[0]?.EntraID 
          }),
        });
        debugLog('ReportingHome: Cache preheating completed successfully');
      } catch (error) {
        debugWarn('Cache preload failed:', error);
      }
    } else {
      const cacheAgeSeconds = cacheState.lastCacheTime ? Math.round((now - cacheState.lastCacheTime) / 1000) : 0;
      console.log(`✅ Using cached data (${cacheAgeSeconds}s old, <30min) - instant load`);
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

  // More conservative auto-refresh logic to prevent excessive refreshing
  const handleOpenDashboard = useCallback(() => {
    // Immediately show loading state for better UX
    setActiveView('dashboard');
    
    // Check if we have recent enough data or need a fresh fetch
    const cacheState = getCacheState();
    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000); // Extended to 30 minutes before forcing refresh
    
    const needsFresh = !hasFetchedOnce || 
                       !cacheState.lastCacheTime || 
                       cacheState.lastCacheTime < thirtyMinutesAgo;
    
    if (needsFresh && !isFetching && !isStreamingConnected) {
      console.log('Dashboard needs fresh data (>30min old), triggering refresh');
      void refreshDatasetsWithStreaming(); // Use streaming version
    } else {
      console.log('Dashboard using cached data (fresh enough)');
    }
  }, [hasFetchedOnce, isFetching, isStreamingConnected, refreshDatasetsWithStreaming]);

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
    isFetching && (isStreamingConnected || refreshStartedAt !== null), 
    [isFetching, isStreamingConnected, refreshStartedAt]
  );
  
  const canUseReports = useMemo(() => 
    hasFetchedOnce && readyCount > 0, 
    [hasFetchedOnce, readyCount]
  );

  // Individual report loading states based on their specific data dependencies
  const reportLoadingStates = useMemo(() => {
    return {
      dashboard: isFetching && (!streamingDatasets.userData || streamingDatasets.userData.status !== 'ready' || 
                               !streamingDatasets.teamData || streamingDatasets.teamData.status !== 'ready' ||
                               !streamingDatasets.allMatters || streamingDatasets.allMatters.status !== 'ready'),
      annualLeave: false, // Annual leave is fetched separately and doesn't use streaming
      enquiries: isFetching && (!streamingDatasets.enquiries || streamingDatasets.enquiries.status !== 'ready'),
      metaMetrics: false, // Meta metrics has its own loading state 
      seoReport: false, // SEO uses separate Google Analytics fetch
      ppcReport: false, // PPC uses separate Google Ads fetch
    };
  }, [isFetching, streamingDatasets]);

  // Helper function to check if all required datasets are ready for a report
  const areRequiredDatasetsReady = useCallback((requiredDatasets: DatasetKey[]): boolean => {
    return requiredDatasets.every(key => {
      const status = datasetStatus[key];
      return status?.status === 'ready';
    });
  }, [datasetStatus]);

  // Helper function to get date range for datasets
  const getDatasetDateRange = useCallback((datasetKey: DatasetKey): string => {
    // For most datasets, show a general range based on typical data freshness
    const dateRanges: Record<DatasetKey, string> = {
      userData: 'Current',
      teamData: 'Current', 
      enquiries: 'Last 24 months',
      allMatters: 'Last 24 months',
      wip: 'Active matters',
      recoveredFees: 'Last 12 months',
      poidData: 'Last 24 months',
      annualLeave: 'Current year',
      metaMetrics: 'Last 90 days',
      googleAnalytics: 'Last 24 months',
      googleAds: 'Last 24 months', 
      deals: 'Last 12 months',
      instructions: 'Last 12 months',
    };
    
    return dateRanges[datasetKey] || '';
  }, []);

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

  // Safety: if streaming disconnected and nothing is loading, clear fetching flag
  useEffect(() => {
    const anyLoading = datasetSummaries.some(s => s.status === 'loading');
    if (!isStreamingConnected && !anyLoading && isFetching) {
      debugLog('ReportingHome: Clearing fetching state (no active loads and stream closed)');
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [isStreamingConnected, datasetSummaries, isFetching]);

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

  if (activeView === 'enquiries') {
    return (
      <div className={`management-dashboard-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`} style={fullScreenWrapperStyle(isDarkMode)}>
        <div className={`glass-report-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
          <EnquiriesReport 
            enquiries={datasetData.enquiries} 
            teamData={datasetData.teamData}
            annualLeave={datasetData.annualLeave}
            metaMetrics={datasetData.metaMetrics}
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

  return (
    <div className="reporting-home-container" style={containerStyle(isDarkMode)}>
      <section 
        style={heroSurfaceStyle(isDarkMode)}
        onMouseEnter={() => setHeroHovered(true)}
        onMouseLeave={() => setHeroHovered(false)}
      >
        <div style={heroRightMarkStyle(isDarkMode, heroHovered)} />
        <div style={heroRightOverlayStyle(isDarkMode)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', zIndex: 2 }}>
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(37, 99, 235, 0.12)',
              color: isDarkMode ? colours.light.text : colours.missedBlue,
              fontWeight: 600,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Restricted access
          </span>
          {Array.isArray(datasetData.userData) && datasetData.userData.length > 0 && (
            <span
              style={{
                fontSize: 9,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(13, 47, 96, 0.5)',
                fontWeight: 500,
                fontFamily: 'Raleway, sans-serif',
                letterSpacing: 0.2,
              }}
            >
              {datasetData.userData.map((user, idx) => {
                const initials = user.Initials || (user.FullName
                  ? user.FullName
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                  : '?');
                return (
                  <span key={user.Email || idx}>
                    {initials}
                    {idx < (datasetData.userData?.length ?? 0) - 1 && <span style={{ opacity: 0.6, margin: '0 4px' }}>•</span>}
                  </span>
                );
              })}
            </span>
          )}
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: 'Raleway, sans-serif' }}>Reporting workspace</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, position: 'relative', zIndex: 2 }}>
          <PrimaryButton
            text={isActivelyLoading ? 'Preparing…' : 'Open management dashboard'}
            onClick={handleOpenDashboard}
            styles={primaryButtonStyles(isDarkMode)}
            disabled={isActivelyLoading}
          />
          <DefaultButton
            text={isActivelyLoading ? 'Refreshing…' : 'Refresh data'}
            onClick={refreshDatasetsWithStreaming}
            styles={subtleButtonStyles(isDarkMode)}
            disabled={isActivelyLoading}
          />
          <DefaultButton
            text={reportLoadingStates.enquiries ? 'Refreshing enquiries…' : 'Refresh enquiries'}
            onClick={refreshEnquiriesScoped}
            styles={subtleButtonStyles(isDarkMode)}
            disabled={reportLoadingStates.enquiries}
            iconProps={{ iconName: 'BarChartVertical' }}
          />
        </div>
        <div style={{ ...heroMetaRowStyle, position: 'relative', zIndex: 2 }}>
          {heroMetaItems.map((item) => (
            <span
              key={item}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 999,
                background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                border: `1px solid ${subtleStroke(isDarkMode)}`,
                boxShadow: 'none',
                color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Quick metrics snapshot - Always visible */}
      <section style={sectionSurfaceStyle(isDarkMode)}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={sectionTitleStyle}>Live metrics</h2>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 12,
              background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
            }}>
              <FontIcon
                iconName="Info"
                style={{
                  fontSize: 10,
                  color: isDarkMode ? '#94a3b8' : colours.missedBlue,
                  opacity: 0.8,
                }}
              />
              <span style={{
                fontSize: 10,
                color: isDarkMode ? '#94a3b8' : colours.missedBlue,
                fontWeight: 500,
                opacity: 0.9,
              }}>
                Targets to be confirmed
              </span>
            </div>
          </div>
          
          {/* Date Range Selector */}
          <div style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}>
            <span style={{
              fontSize: 11,
              color: isDarkMode ? '#94a3b8' : colours.missedBlue,
              fontWeight: 500,
            }}>
              Range:
            </span>
            {(['7d', '30d', '3mo', '6mo', '12mo', '24mo'] as const).map((range) => (
              <button
                key={range}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${range === selectedDateRange 
                    ? (isDarkMode ? colours.accent : colours.highlight)
                    : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: range === selectedDateRange 
                    ? (isDarkMode ? `rgba(135, 243, 243, 0.15)` : `rgba(54, 144, 206, 0.08)`)
                    : (isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(148, 163, 184, 0.04)'),
                  color: range === selectedDateRange
                    ? (isDarkMode ? colours.accent : colours.highlight)
                    : (isDarkMode ? '#cbd5e1' : '#64748b'),
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget;
                  if (range !== selectedDateRange) {
                    btn.style.background = isDarkMode ? 'rgba(71, 85, 105, 0.25)' : 'rgba(148, 163, 184, 0.08)';
                    btn.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)';
                  }
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget;
                  if (range !== selectedDateRange) {
                    btn.style.background = isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(148, 163, 184, 0.04)';
                    btn.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                  }
                }}
                onClick={() => {
                  setSelectedDateRange(range);
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        
        {/* Top Row - WIP and Collected Time (Full Width) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}>
          {/* WIP - Selected Range */}
          <div style={{
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            borderRadius: 8,
            padding: 16,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background pattern */}
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  marginBottom: 4,
                }}>
                  WIP
                </h3>
                <div style={{
                  fontSize: 11,
                  color: isDarkMode ? '#94a3b8' : colours.missedBlue,
                  opacity: 0.9,
                }}>
                  Total value
                </div>
              </div>
              
              <span style={{
                fontSize: 9,
                color: isDarkMode ? '#64748b' : colours.missedBlue,
                fontWeight: 500,
              }}>
                {getActualDataRange(datasetData.wip || [], 'date')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontSize: 24,
                fontWeight: 600,
                color: isDarkMode ? colours.accent : colours.missedBlue,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {(() => {
                  if (!Array.isArray(datasetData.wip)) return '—';
                  const filtered = getFilteredDataByDateRange(datasetData.wip, 'date');
                  const total = filtered.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                  return formatCurrency(total);
                })()}
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
                flexGrow: 1,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Collected Time - Selected Range */}
          <div style={{
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            borderRadius: 8,
            padding: 16,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background pattern */}
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isDarkMode ? colours.accent : colours.missedBlue,
                    marginBottom: 4,
                  }}>
                    Collected Time
                  </h3>
                  <div style={{
                    fontSize: 11,
                    color: isDarkMode ? '#94a3b8' : colours.missedBlue,
                    opacity: 0.9,
                  }}>
                    Total collected
                  </div>
                </div>
                <div 
                  style={{
                    position: 'relative',
                    cursor: 'help',
                    marginTop: -2,
                  }}
                  title="Excludes disbursements (expenses)"
                >
                  <FontIcon
                    iconName="Info"
                    style={{
                      fontSize: 12,
                      color: isDarkMode ? '#64748b' : '#94a3b8',
                      opacity: 0.7,
                      transition: 'opacity 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.7';
                    }}
                  />
                </div>
              </div>
              <span style={{
                fontSize: 9,
                color: isDarkMode ? '#64748b' : colours.missedBlue,
                fontWeight: 500,
              }}>
                {getActualDataRange(datasetData.recoveredFees || [], 'payment_date')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontSize: 24,
                fontWeight: 600,
                color: isDarkMode ? colours.accent : colours.missedBlue,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {(() => {
                  if (!Array.isArray(datasetData.recoveredFees)) return '—';
                  const filtered = getFilteredDataByDateRange(datasetData.recoveredFees, 'payment_date');
                  // Exclude disbursements (kind = 'Expense') - only count actual fees, same as Management Dashboard
                  const feesOnly = filtered.filter(item => item.kind !== 'Expense' && item.kind !== 'Product');
                  const total = feesOnly.reduce((sum, item) => sum + (typeof item.payment_allocated === 'number' ? item.payment_allocated : (parseFloat(item.payment_allocated) || 0)), 0);
                  return formatCurrency(total);
                })()}
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
                flexGrow: 1,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Row - Core Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}>
          {/* Enquiries - Last 24 months */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(13, 47, 96, 0.3)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(13, 47, 96, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)';
          }}
          >
            {/* Background pattern */}
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  fontWeight: 600,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                }}>
                  Enquiries
                </span>
                <span style={{
                  fontSize: 9,
                  color: isDarkMode ? '#64748b' : colours.missedBlue,
                  fontWeight: 500,
                }}>
                  {getActualDataRange(datasetData.enquiries || [], 'Date_Created')}
                </span>
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: isDarkMode ? '#f1f5f9' : '#334155',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {(() => {
                  if (!Array.isArray(datasetData.enquiries)) return '—';
                  const filtered = getFilteredDataByDateRange(datasetData.enquiries, 'Date_Created');
                  return filtered.length.toLocaleString();
                })()}
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Pitches - Last 12 months */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(13, 47, 96, 0.3)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(13, 47, 96, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)';
          }}
          >
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  fontWeight: 600,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                }}>
                  Pitches
                </span>
                <span style={{
                  fontSize: 9,
                  color: isDarkMode ? '#64748b' : colours.missedBlue,
                  fontWeight: 500,
                }}>
                  {getActualDataRange(datasetData.deals || [], 'PitchedDate')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <div style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: isDarkMode ? '#f1f5f9' : '#334155',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  lineHeight: 1,
                }}>
                  {(() => {
                    if (!Array.isArray(datasetData.deals)) return '—';
                    const filtered = getFilteredDataByDateRange(datasetData.deals, 'PitchedDate');
                    return filtered.length > 0 ? filtered.length.toLocaleString() : '0';
                  })()}
                </div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  opacity: 0.9,
                }}>
                  {(() => {
                    if (!Array.isArray(datasetData.deals) || !Array.isArray(datasetData.enquiries)) return '';
                    const filteredDeals = getFilteredDataByDateRange(datasetData.deals, 'PitchedDate');
                    const filteredEnquiries = getFilteredDataByDateRange(datasetData.enquiries, 'Date_Created');
                    
                    if (filteredEnquiries.length === 0) return '0%';
                    
                    const conversionRate = (filteredDeals.length / filteredEnquiries.length) * 100;
                    return `${conversionRate.toFixed(1)}%`;
                  })()}
                </div>
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Instructions - Last 12 months */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(13, 47, 96, 0.3)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(13, 47, 96, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)';
          }}
          >
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  fontWeight: 600,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                }}>
                  Instructions
                </span>
                <span style={{
                  fontSize: 9,
                  color: isDarkMode ? '#64748b' : colours.missedBlue,
                  fontWeight: 500,
                }}>
                  {getActualDataRange(datasetData.instructions || [], 'SubmissionDate')}
                </span>
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: isDarkMode ? '#f1f5f9' : '#334155',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {(() => {
                  if (!Array.isArray(datasetData.instructions)) return '—';
                  const filtered = getFilteredDataByDateRange(datasetData.instructions, 'SubmissionDate');
                  return filtered.length > 0 ? filtered.length.toLocaleString() : '0';
                })()}
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Matters - Last 24 months */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(13, 47, 96, 0.3)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(13, 47, 96, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.15)';
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.06)';
          }}
          >
            <div style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: '80px',
              height: '80px',
              background: `linear-gradient(135deg, ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)'} 0%, transparent 70%)`,
              borderRadius: '50%',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.accent : colours.missedBlue,
                  fontWeight: 600,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                }}>
                  Matters
                </span>
                <span style={{
                  fontSize: 9,
                  color: isDarkMode ? '#64748b' : colours.missedBlue,
                  fontWeight: 500,
                }}>
                  {getActualDataRange(datasetData.allMatters || [], 'Open Date')}
                </span>
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: isDarkMode ? '#f1f5f9' : '#334155',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {(() => {
                  if (!Array.isArray(datasetData.allMatters)) return '—';
                  const filtered = getFilteredDataByDateRange(datasetData.allMatters, 'Open Date');
                  return filtered.length.toLocaleString();
                })()}
              </div>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(13, 47, 96, 0.2)',
                marginTop: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: '25%',
                  background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.missedBlue} 0%, ${isDarkMode ? colours.blue : colours.darkBlue} 100%)`,
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={sectionSurfaceStyle(isDarkMode)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Reporting & Data Hub</h2>
          
          {/* Global Refresh Status */}
          {(isActivelyLoading || isStreamingConnected) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
              border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
            }}>
              <Spinner 
                size={SpinnerSize.xSmall} 
                styles={{
                  root: {
                    width: 16,
                    height: 16,
                  },
                  circle: {
                    width: 16,
                    height: 16,
                    borderWidth: 2,
                    borderTopColor: isDarkMode ? '#94a3b8' : '#64748b',
                    borderLeftColor: isDarkMode ? '#94a3b8' : '#64748b',
                    borderBottomColor: 'transparent',
                    borderRightColor: 'transparent',
                  }
                }}
              />
              <span style={{
                fontSize: 13,
                color: isDarkMode ? '#94a3b8' : '#64748b',
                fontWeight: 500,
              }}>
                {isStreamingConnected 
                  ? `Refreshing datasets… (${streamingProgress.completed}/${streamingProgress.total})`
                  : 'Refreshing data…'
                }
              </span>
              <span style={{
                fontSize: 11,
                color: isDarkMode ? '#64748b' : '#64748b',
                opacity: 0.8,
              }}>
                {progressDetailText}
              </span>
            </div>
          )}
        </div>
        
        {/* Unified Reports and Datasets View */}
        <div style={{
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(100, 116, 139, 0.18)'}`,
          borderRadius: 12,
          overflow: 'hidden',
          background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.6)',
        }}>
          <div style={{ padding: 20 }}>
            {/* Data Sources - Collapsible section */}
            <div style={{
              marginBottom: 24,
            }}>
              <div 
                onClick={() => setIsDataSourcesExpanded(!isDataSourcesExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  padding: '8px 0',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: isDarkMode ? '#e2e8f0' : '#475569',
                  }}>
                    Data Sources
                  </h3>
                  <span style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 8,
                    background: isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(241, 245, 249, 0.8)',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    fontWeight: 500,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                  }}>
                    {DATASETS.length}
                  </span>
                </div>
                <span style={{
                  fontSize: 12,
                  color: isDarkMode ? '#94a3b8' : '#64748b',
                  transition: 'transform 0.2s',
                  transform: isDataSourcesExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>
                  ▼
                </span>
              </div>
              
              <div style={{
                maxHeight: isDataSourcesExpanded ? '2000px' : '0px',
                overflow: 'hidden',
                opacity: isDataSourcesExpanded ? 1 : 0,
                transition: 'all 0.3s ease-in-out',
                marginTop: isDataSourcesExpanded ? 8 : 0,
              }}>
              <div style={{ display: 'grid', gap: 6 }}>
                {DATASETS.map((definition) => {
                  const status = datasetStatus[definition.key];
                  const streamState = streamingDatasets[definition.key as keyof typeof streamingDatasets];
                  const data = (datasetData as any)[definition.key] as unknown[] | null | undefined;
                  const count = Array.isArray(data) ? data.length : 0;
                  
                  if (!status) return null;
                  
                  const palette = STATUS_BADGE_COLOURS[status.status];
                  const hasData = count > 0;
                  const elapsed = streamState?.elapsedMs;

                  return (
                    <div key={definition.key} style={{
                      borderRadius: 4,
                      background: isDarkMode ? 'rgba(51, 65, 85, 0.25)' : 'rgba(248, 250, 252, 0.6)',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.1)'}`,
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontWeight: 500,
                          color: isDarkMode ? '#f1f5f9' : '#334155',
                          fontSize: 12,
                        }}>
                          {definition.name}
                        </span>
                        <span style={{
                          fontSize: 9,
                          color: isDarkMode ? '#94a3b8' : '#64748b',
                          opacity: 0.7,
                          fontStyle: 'italic',
                        }}>
                          {getDatasetDateRange(definition.key)}
                        </span>
                        {hasData && (
                          <span style={{
                            fontSize: 10,
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                            opacity: 0.8,
                          }}>
                            {count.toLocaleString()} rows
                          </span>
                        )}
                        {streamState?.cached && (
                          <span style={{
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 2,
                            background: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                            color: isDarkMode ? '#86efac' : '#166534',
                          }}>
                            cached
                          </span>
                        )}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8,
                        height: '100%',
                        minHeight: 24,
                      }}>
                        <span style={{
                          fontSize: 10,
                          padding: '3px 7px',
                          borderRadius: 4,
                          background: isDarkMode ? palette.darkBg : palette.lightBg,
                          color: isDarkMode ? '#f1f5f9' : '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          height: 20,
                          lineHeight: 1,
                          fontWeight: 500,
                        }}>
                          {status.status === 'loading' ? (
                            <Spinner 
                              size={SpinnerSize.xSmall} 
                              styles={{
                                root: {
                                  width: 10,
                                  height: 10,
                                },
                                circle: {
                                  width: 10,
                                  height: 10,
                                  borderWidth: 1,
                                  borderTopColor: '#3690CE', // highlight blue
                                  borderLeftColor: '#3690CE',
                                  borderBottomColor: 'transparent',
                                  borderRightColor: 'transparent',
                                }
                              }}
                            />
                          ) : (
                            <span style={{
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: (status.status === 'ready' && !isDarkMode) ? '#0d2f60' : palette.dot,
                            }} />
                          )}
                          {palette.label}
                          {typeof elapsed === 'number' && elapsed >= 0 && (
                            <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 9 }}>
                              {formatElapsedTime(elapsed)}
                            </span>
                          )}
                        </span>
                        {status.status === 'ready' && hasData && (
                          <button
                            onClick={() => {
                              console.log('Preview button clicked for:', definition.key);
                              console.log('Current feedPreviewOpen state:', feedPreviewOpen);
                              console.log('Data for this dataset:', (datasetData as any)[definition.key]);
                              toggleFeedPreview(definition.key);
                            }}
                            disabled={isActivelyLoading}
                            style={{
                              width: 20,
                              height: 20,
                              padding: 0,
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`,
                              borderRadius: 4,
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.05)',
                              color: isDarkMode ? '#94a3b8' : '#64748b',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              transition: 'all 0.15s ease',
                              opacity: 0.8,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '0.7';
                              e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)';
                            }}
                          >
                            {feedPreviewOpen[definition.key] ? '▼' : '👁'}
                          </button>
                        )}
                      </div>
                      {feedPreviewOpen[definition.key] && (
                        <div style={{
                          marginTop: 6,
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)'}`,
                          background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.5)',
                          gridColumn: '1 / -1',
                        }}>
                          {(() => {
                            const key = definition.key as DatasetKey;
                            const data = (datasetData as any)[key] as unknown[] | null | undefined;
                            const rows = Array.isArray(data) ? data : [];
                            const sample = rows.slice(0, 2);
                            return (
                              <div>
                                <div style={{ marginBottom: 4 }}>
                                  <span style={{ fontSize: 10, opacity: 0.8 }}>
                                    Sample data ({rows.length.toLocaleString()} total)
                                  </span>
                                </div>
                                <div style={{ display: 'grid', gap: 3 }}>
                                  {sample.map((row, idx) => (
                                    <div key={idx} style={{
                                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                      fontSize: 9,
                                      padding: '3px 5px',
                                      borderRadius: 3,
                                      background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(241, 245, 249, 0.5)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.08)'}`,
                                      overflowX: 'auto',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {formatPreviewRow(row)}
                                    </div>
                                  ))}
                                  {sample.length === 0 && (
                                    <div style={{ fontSize: 10, opacity: 0.7 }}>No data available</div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>

            {/* Available Reports */}
            <div>
              <h3 style={{
                margin: '0 0 12px 0',
                fontSize: 15,
                fontWeight: 600,
                color: isDarkMode ? '#e2e8f0' : '#475569',
              }}>
                Available Reports
              </h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {AVAILABLE_REPORTS.map((report) => (
                  <div key={report.key} style={{
                    padding: '12px 14px',
                    borderRadius: 6,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.15)'}`,
                    background: (() => {
                      const reportState = getButtonState(report.requiredDatasets);
                      if (isDarkMode) {
                        return 'rgba(51, 65, 85, 0.4)';
                      }
                      // Add state-based background in light mode
                      switch (reportState) {
                        case 'ready':
                          return 'rgba(13, 47, 96, 0.06)'; // Subtle dark blue tint
                        case 'warming':
                          return 'rgba(13, 47, 96, 0.04)'; // Very subtle dark blue
                        case 'neutral':
                        default:
                          return 'rgba(255, 255, 255, 0.7)'; // Keep white
                      }
                    })(),
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontWeight: 500,
                          color: isDarkMode ? '#f1f5f9' : '#334155',
                          fontSize: 14,
                        }}>
                          {report.name}
                        </span>
                      </div>
                      
                      {/* Dataset Dependencies Badges - Far Right */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        {/* Vertical Separator */}
                        <div style={{
                          width: 1,
                          height: 20,
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.2)',
                          flexShrink: 0,
                        }} />
                        
                        {/* Badges - Allow wrapping */}
                        <div style={{ 
                          display: 'flex', 
                          flexWrap: 'wrap', 
                          gap: 4,
                          maxWidth: '300px',
                          justifyContent: 'flex-end',
                        }}>
                          {report.requiredDatasets.map(datasetKey => {
                            const dataset = DATASETS.find(d => d.key === datasetKey);
                            const currentDatasetStatus = dataset ? datasetStatus[datasetKey] : null;
                            const statusValue = currentDatasetStatus?.status || 'idle';
                            const palette = STATUS_BADGE_COLOURS[statusValue];
                            
                            return (
                              <span key={datasetKey} style={{
                                fontSize: 9,
                                padding: '2px 5px',
                                borderRadius: 3,
                                background: isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(241, 245, 249, 0.6)',
                                color: isDarkMode ? '#cbd5e1' : '#475569',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}>
                                <span style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: '50%',
                                  background: (statusValue === 'ready' && !isDarkMode) ? '#0d2f60' : palette.dot,
                                }} />
                                {dataset?.name || datasetKey}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Report Actions */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {report.action === 'dashboard' && (
                        <>
                          <PrimaryButton
                            text={(getButtonState(report.requiredDatasets) === 'ready') ? 'Open dashboard' : 'Preparing…'}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (isReady) handleOpenDashboard();
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready')
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={getButtonState(report.requiredDatasets) !== 'ready'}
                          />
                          <DefaultButton
                            text="Refresh data"
                            onClick={refreshDatasetsWithStreaming}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={reportLoadingStates.dashboard}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </>
                      )}
                      {report.action === 'annualLeave' && (
                        <>
                          <PrimaryButton
                            text={(getButtonState(report.requiredDatasets) === 'ready') ? 'Open annual leave' : 'Preparing…'}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (isReady) setActiveView('annualLeave');
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready')
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={getButtonState(report.requiredDatasets) !== 'ready'}
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
                      {report.action === 'enquiries' && (
                        <>
                          <PrimaryButton
                            text={(getButtonState(report.requiredDatasets) === 'ready') ? 'Open enquiries report' : 'Preparing…'}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (isReady) setActiveView('enquiries');
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready')
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={getButtonState(report.requiredDatasets) !== 'ready'}
                          />
                          <DefaultButton
                            text="Refresh enquiries data"
                            onClick={refreshEnquiriesScoped}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={reportLoadingStates.enquiries}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </>
                      )}
                      {report.action === 'metaMetrics' && (
                        <>
                          <PrimaryButton
                            text={(getButtonState(report.requiredDatasets) === 'ready') ? 'Open Meta ads' : 'Preparing…'}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (isReady) setActiveView('metaMetrics');
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready')
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={getButtonState(report.requiredDatasets) !== 'ready'}
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
                            text={report.disabled ? 'ETA 1 day' : ((getButtonState(report.requiredDatasets) === 'ready') ? 'Open SEO report' : 'Preparing…')}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (!report.disabled && isReady) setActiveView('seoReport');
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready')
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={report.disabled || (getButtonState(report.requiredDatasets) !== 'ready')}
                          />
                          <DefaultButton
                            text="Refresh SEO data"
                            onClick={refreshMetaMetricsOnly}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={report.disabled || reportLoadingStates.seoReport}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </>
                      )}
                      {report.action === 'ppcReport' && (
                        <>
                          <PrimaryButton
                            text={report.disabled ? 'ETA 1 day' : ((getButtonState(report.requiredDatasets) === 'ready') ? 'Open PPC report' : 'Preparing…')}
                            onClick={() => {
                              const isReady = getButtonState(report.requiredDatasets) === 'ready';
                              if (!report.disabled && isReady) setActiveView('ppcReport');
                            }}
                            styles={(getButtonState(report.requiredDatasets) === 'ready' && !report.disabled)
                              ? primaryButtonStyles(isDarkMode)
                              : {
                                  root: {
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    height: 34,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    border: `1px solid ${colours.highlight}`,
                                    fontWeight: 500,
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
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
                                }
                            }
                            disabled={report.disabled || (getButtonState(report.requiredDatasets) !== 'ready')}
                          />
                          <DefaultButton
                            text="Refresh PPC data"
                            onClick={refreshMetaMetricsOnly}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={report.disabled || reportLoadingStates.ppcReport}
                            iconProps={{ iconName: 'Refresh' }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Error Display with Retry */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(248, 113, 113, 0.22)' : 'rgba(248, 113, 113, 0.18)',
            color: isDarkMode ? '#fecaca' : '#b91c1c',
            fontSize: 12,
            boxShadow: surfaceShadow(isDarkMode),
            border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.32)' : 'rgba(248, 113, 113, 0.32)'}`,
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            {!isFetching && (
              <DefaultButton
                text="Retry"
                iconProps={{ iconName: 'Refresh' }}
                styles={{
                  root: {
                    height: 24,
                    minWidth: 60,
                    padding: '0 8px',
                    border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.42)' : 'rgba(248, 113, 113, 0.42)'}`,
                    background: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                  },
                  label: { fontSize: 11, fontWeight: 500, color: isDarkMode ? '#fecaca' : '#b91c1c' },
                  icon: { fontSize: 11, color: isDarkMode ? '#fecaca' : '#b91c1c' },
                }}
                onClick={() => {
                  setError(null);
                  void refreshDatasetsWithStreaming();
                }}
              />
            )}
          </div>
        )}
      </section>

      {/* Notes & Suggestions Box */}
      <section style={sectionSurfaceStyle(isDarkMode)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <FontIcon
            iconName="FeedbackRequestSolid"
            style={{
              fontSize: 14,
              color: isDarkMode ? colours.accent : colours.missedBlue,
            }}
          />
          <h2 style={sectionTitleStyle}>Feedback</h2>
        </div>
        
        <NotesAndSuggestionsBox isDarkMode={isDarkMode} />
      </section>

      {/* Marketing Data Settings removed (always using 24 months for GA4 and Google Ads) */}

    </div>
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
          <h3 style="color: #3690CE; margin-bottom: 16px;">Reporting Dashboard Feedback</h3>
          
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
          subject: `Reporting Dashboard Feedback - ${new Date().toLocaleDateString('en-GB')}`,
          from_email: 'automations@helix-law.com'
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
      background: isDarkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(248, 250, 252, 0.8)',
      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
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
          Sent! We'll probably ignore it, but thanks anyway.
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="How can we improve this page?"
        disabled={isSending}
        style={{
          width: '100%',
          minHeight: 80,
          padding: 12,
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
          borderRadius: 8,
          background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
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
          Delivered to automations@helix-law.com
        </span>
        
        <DefaultButton
          text={isSending ? 'Sending...' : 'Send Feedback'}
          onClick={handleSubmit}
          disabled={!canSubmit}
          iconProps={isSending ? undefined : { iconName: 'Send' }}
          styles={{
            root: {
              borderRadius: 8,
              padding: '0 16px',
              height: 32,
              background: canSubmit 
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)'),
              color: canSubmit 
                ? colours.accent 
                : (isDarkMode ? '#64748b' : '#94a3b8'),
              border: `1px solid ${canSubmit 
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(135, 243, 243, 0.2)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
              fontWeight: 500,
              fontSize: 12,
              boxShadow: 'none',
              transition: 'all 0.2s ease',
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