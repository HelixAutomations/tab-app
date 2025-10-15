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
import HomePreview from './HomePreview';
import EnquiriesReport, { MarketingMetrics } from './EnquiriesReport';
import { useStreamingDatasets } from '../../hooks/useStreamingDatasets';

// Persist streaming progress across navigation
const STREAM_SNAPSHOT_KEY = 'reporting_stream_snapshot_v1';
const CACHE_STATE_KEY = 'reporting_cache_state_v1';

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

interface RecoveredFee {
  payment_date: string;
  payment_allocated: number;
  user_id: number;
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
}

// (Removed TIME_RANGE_OPTIONS and settings state)

const DATASETS = [
  { key: 'userData', name: 'People' },
  { key: 'teamData', name: 'Teams' },
  { key: 'enquiries', name: 'Enquiries' },
  { key: 'allMatters', name: 'Matters' },
  { key: 'wip', name: 'WIP' },
  { key: 'recoveredFees', name: 'Collected Fees' },
  { key: 'poidData', name: 'ID Submissions' },
  { key: 'annualLeave', name: 'Annual Leave' },
  { key: 'metaMetrics', name: 'Meta Metrics' },
  { key: 'googleAnalytics', name: 'Google Analytics' },
  { key: 'googleAds', name: 'Google Ads' },
] as const;

type DatasetDefinition = typeof DATASETS[number];
type DatasetKey = DatasetDefinition['key'];
type DatasetStatusValue = 'idle' | 'loading' | 'ready' | 'error';

interface DatasetMeta {
  status: DatasetStatusValue;
  updatedAt: number | null;
}

type DatasetStatus = Record<DatasetKey, DatasetMeta>;

interface AvailableReport {
  key: string;
  name: string;
  status: string;
  action?: 'dashboard' | 'annualLeave' | 'enquiries' | 'metaMetrics' | 'seoReport' | 'ppcReport';
}

const AVAILABLE_REPORTS: AvailableReport[] = [
  {
    key: 'management',
    name: 'Management dashboard',
    status: 'Live today',
    action: 'dashboard',
  },
  {
    key: 'enquiries',
    name: 'Enquiries report',
    status: 'Live today',
    action: 'enquiries',
  },
  {
    key: 'annualLeave',
    name: 'Annual leave report',
    status: 'Live today',
    action: 'annualLeave',
  },
  {
    key: 'metaMetrics',
    name: 'Meta metrics',
    status: 'Live today',
    action: 'metaMetrics',
  },
  // Only show SEO report if not in production
  ...((process.env.NODE_ENV !== 'production') ? [{
    key: 'seo',
    name: 'SEO report',
    status: 'Live today',
    action: 'seoReport' as const,
  }] : []),
  // Only show PPC report if not in production
  ...((process.env.NODE_ENV !== 'production') ? [{
    key: 'ppc',
    name: 'PPC report',
    status: 'Live today',
    action: 'ppcReport' as const,
  }] : []),
  {
    key: 'matters',
    name: 'Matters snapshot',
    status: 'Matters tab',
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
    lightBg: 'rgba(34, 197, 94, 0.16)',
    darkBg: 'rgba(34, 197, 94, 0.28)',
    dot: '#22c55e',
    label: 'Ready',
    icon: 'CheckMark',
  },
  loading: {
    lightBg: 'rgba(59, 130, 246, 0.18)',
    darkBg: 'rgba(59, 130, 246, 0.32)',
    dot: '#60a5fa',
    label: 'Refreshing',
  },
  error: {
    lightBg: 'rgba(248, 113, 113, 0.18)',
    darkBg: 'rgba(248, 113, 113, 0.32)',
    dot: '#f87171',
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
  sectionSurfaceStyle(isDarkMode, { gap: 14, padding: '22px 24px' })
);

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

const primaryButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 12,
    padding: '0 20px',
    height: 38,
    background: colours.highlight,
    color: '#ffffff',
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'background 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: '#2f7cb3',
  },
  rootPressed: {
    background: '#266795',
  },
});

const subtleButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 12,
    padding: '0 18px',
    height: 38,
    background: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent',
    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(13, 47, 96, 0.22)'}`,
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'background 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(54, 144, 206, 0.12)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(54, 144, 206, 0.18)',
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
  // PPC-specific Google Ads data (24 months)
  const [ppcGoogleAdsData, setPpcGoogleAdsData] = useState<GoogleAdsData[] | null>(null);
  const [ppcLoading, setPpcLoading] = useState<boolean>(false);
  // Feed-row preview toggles (keyed by dataset key)
  const [feedPreviewOpen, setFeedPreviewOpen] = useState<Record<string, boolean>>({});
  const toggleFeedPreview = useCallback((key: string) => {
    setFeedPreviewOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Add debounced state updates to prevent excessive re-renders
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const pendingStatusUpdatesRef = useRef<Map<DatasetKey, { status: DatasetStatusValue; updatedAt: number | null }>>(new Map());

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

  // Restore in-progress streaming state on mount and auto-resume if not complete
  useEffect(() => {
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
      // Only auto-resume if the session was incomplete AND it's recent (within 5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const hadStream: boolean = Boolean(snap?.hadStream);
      if (snap && hadStream && snap.isComplete === false && snap.ts > fiveMinutesAgo) {
        debugLog('ReportingHome: Resuming incomplete streaming session from', new Date(snap.ts).toLocaleTimeString());
        setIsFetching(true);
        setRefreshStartedAt(Date.now());
        // Ensure non-streaming datasets also refresh once during resume
        // Mark them as loading if not present
        setDatasetStatus(prev => ({
          ...prev,
          annualLeave: { status: 'loading', updatedAt: prev.annualLeave?.updatedAt ?? null },
          metaMetrics: { status: 'loading', updatedAt: prev.metaMetrics?.updatedAt ?? null },
        }));
        // Kick off non-streaming fetchers in parallel
        (async () => {
          try {
            const [annualLeaveResponse, meta] = await Promise.all([
              fetch('/api/attendance/annual-leave-all', {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json' },
              }),
              fetchMetaMetrics(),
            ]);

            let annualLeaveData: AnnualLeaveRecord[] = [];
            if (annualLeaveResponse.ok) {
              try {
                const payload = await annualLeaveResponse.json();
                if (payload.success && payload.all_data) {
                  annualLeaveData = payload.all_data.map((record: any) => ({
                    request_id: record.request_id,
                    fe: record.person,
                    start_date: record.start_date,
                    end_date: record.end_date,
                    reason: record.reason,
                    status: record.status,
                    days_taken: record.days_taken,
                    leave_type: record.leave_type,
                    rejection_notes: record.rejection_notes,
                    hearing_confirmation: record.hearing_confirmation,
                    hearing_details: record.hearing_details,
                  }));
                }
              } catch {/* ignore parse errors */}
            }

            const now = Date.now();
            setDatasetData(prev => ({
              ...prev,
              annualLeave: annualLeaveData,
              metaMetrics: meta,
            }));
            setDatasetStatus(prev => ({
              ...prev,
              annualLeave: { status: 'ready', updatedAt: now },
              metaMetrics: { status: 'ready', updatedAt: now },
            }));
            cachedData = { ...cachedData, annualLeave: annualLeaveData, metaMetrics: meta };
            cachedTimestamp = now;
            updateRefreshTimestamp(now, setLastRefreshTimestamp);
          } catch {/* ignore resume fetch errors */}
        })();
        startStreaming();
      } else if (snap && snap.isComplete === false) {
        // Clear stale incomplete session
        debugLog('ReportingHome: Clearing stale streaming session from', new Date(snap.ts).toLocaleTimeString());
        sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
      }
    } catch {/* ignore */}
  // startStreaming is stable from hook; using it is intentional
  }, [startStreaming]);

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
        const snapshot = {
          statuses,
          isComplete: isStreamingComplete,
          hadStream: true,
          ts: Date.now(),
        };
        sessionStorage.setItem(STREAM_SNAPSHOT_KEY, JSON.stringify(snapshot));
      }
      if (isStreamingComplete) {
        // Clear snapshot once complete to avoid stale resumes later
        sessionStorage.removeItem(STREAM_SNAPSHOT_KEY);
      }
    } catch {/* ignore */}
  }, [streamingDatasets, isStreamingComplete, isStreamingConnected, refreshStartedAt]);

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
          if (!cancelled) setPpcGoogleAdsData(rows || []);
        })
        .catch(() => {/* ignore, will fallback to cached */})
        .finally(() => { if (!cancelled) setPpcLoading(false); });
    }
    return () => { cancelled = true; };
  }, [activeView, fetchGoogleAdsData]);

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
          <span style={dashboardNavigatorTitleStyle(isDarkMode)}>Meta metrics report</span>
        </div>,
      );
    } else {
      setContent(null);
    }

    return () => {
      setContent(null);
    };
  }, [activeView, handleBackToOverview, isDarkMode, setContent]);

  // Marketing metrics fetching function
  const fetchMetaMetrics = useCallback(async (): Promise<MarketingMetrics[]> => {
    debugLog('ReportingHome: fetchMetaMetrics called');
    
    try {
      // Use our Express server route for live Facebook data with daily breakdown
      const url = `/api/marketing-metrics?daysBack=30`; // Get last 30 days of daily data
      debugLog('ReportingHome: Fetching meta metrics from:', url);
      
      const response = await fetch(url);
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
      console.error('ReportingHome: Meta metrics fetch error:', error);
      debugWarn('ReportingHome: Failed to fetch meta metrics:', error);
      // Return empty array on error to prevent blocking the dashboard
      return [];
    }
  }, []);

  // Enhanced refresh function with streaming support
  const refreshDatasetsWithStreaming = useCallback(async () => {
    debugLog('ReportingHome: refreshDatasetsWithStreaming called');
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
      // Start streaming for main datasets
  console.log('🌊 Starting streaming with datasets:', streamableDatasets);
      console.log('🌊 EntraID for streaming:', propUserData?.[0]?.EntraID);
      startStreaming();

      // Only fetch annual leave and meta metrics if stale (>10 minutes) or missing
      const nowTs = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      const lastAL = datasetStatus.annualLeave?.updatedAt ?? 0;
      const lastMeta = datasetStatus.metaMetrics?.updatedAt ?? 0;
      const lastGA = datasetStatus.googleAnalytics?.updatedAt ?? 0;
      const lastGAds = datasetStatus.googleAds?.updatedAt ?? 0;
      
      const shouldFetchAnnualLeave = !cachedData.annualLeave || (nowTs - lastAL) > tenMinutes;
      const shouldFetchMeta = !cachedData.metaMetrics || (nowTs - lastMeta) > tenMinutes;
      const shouldFetchGA = !cachedData.googleAnalytics || (nowTs - lastGA) > tenMinutes;
      const shouldFetchGAds = !cachedData.googleAds || (nowTs - lastGAds) > tenMinutes;

      let annualLeaveData: AnnualLeaveRecord[] = cachedData.annualLeave || [];
      let metaMetricsData: MarketingMetrics[] = cachedData.metaMetrics || [];
      let googleAnalyticsData: GoogleAnalyticsData[] = cachedData.googleAnalytics || [];
      let googleAdsData: GoogleAdsData[] = cachedData.googleAds || [];

      if (shouldFetchAnnualLeave || shouldFetchMeta || shouldFetchGA || shouldFetchGAds) {
        // Update status for datasets being fetched
        setDatasetStatus(prev => ({
          ...prev,
          ...(shouldFetchGA && { googleAnalytics: { status: 'loading', updatedAt: prev.googleAnalytics?.updatedAt ?? null } }),
          ...(shouldFetchGAds && { googleAds: { status: 'loading', updatedAt: prev.googleAds?.updatedAt ?? null } }),
        }));

        const [annualLeaveResponse, metaMetrics, gaData, gAdsData] = await Promise.all([
          shouldFetchAnnualLeave
            ? fetch('/api/attendance/annual-leave-all', {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json' },
              })
            : Promise.resolve(null as unknown as Response),
          shouldFetchMeta ? fetchMetaMetrics() : Promise.resolve(metaMetricsData),
          shouldFetchGA ? fetchGoogleAnalyticsData(24) : Promise.resolve(googleAnalyticsData),
          shouldFetchGAds ? fetchGoogleAdsData(24) : Promise.resolve(googleAdsData),
        ]);

        if (shouldFetchAnnualLeave && annualLeaveResponse && annualLeaveResponse.ok) {
          try {
            const annualLeavePayload = await annualLeaveResponse.json();
            if (annualLeavePayload.success && annualLeavePayload.all_data) {
              annualLeaveData = annualLeavePayload.all_data.map((record: any) => ({
                request_id: record.request_id,
                fe: record.person,
                start_date: record.start_date,
                end_date: record.end_date,
                reason: record.reason,
                status: record.status,
                days_taken: record.days_taken,
                leave_type: record.leave_type,
                rejection_notes: record.rejection_notes,
                hearing_confirmation: record.hearing_confirmation,
                hearing_details: record.hearing_details,
              }));
            }
          } catch {/* ignore parse errors */}
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

      // Update non-streaming datasets
      setDatasetData(prev => ({
        ...prev,
        annualLeave: annualLeaveData,
        metaMetrics: metaMetricsData,
        googleAnalytics: googleAnalyticsData,
        googleAds: googleAdsData,
      }));

      // Update status for non-streaming datasets
      setDatasetStatus(prev => ({
        ...prev,
        annualLeave: { status: 'ready', updatedAt: shouldFetchAnnualLeave ? nowTs : (prev.annualLeave?.updatedAt ?? nowTs) },
        metaMetrics: { status: 'ready', updatedAt: shouldFetchMeta ? nowTs : (prev.metaMetrics?.updatedAt ?? nowTs) },
        googleAnalytics: { status: 'ready', updatedAt: shouldFetchGA ? nowTs : (prev.googleAnalytics?.updatedAt ?? nowTs) },
        googleAds: { status: 'ready', updatedAt: shouldFetchGAds ? nowTs : (prev.googleAds?.updatedAt ?? nowTs) },
      }));

      cachedData = { ...cachedData, annualLeave: annualLeaveData, metaMetrics: metaMetricsData, googleAnalytics: googleAnalyticsData, googleAds: googleAdsData };
      cachedTimestamp = nowTs;
      updateRefreshTimestamp(nowTs, setLastRefreshTimestamp);

    } catch (fetchError) {
      debugWarn('Failed to refresh non-streaming datasets:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
    }
    // Note: Don't set isFetching(false) here - let the streaming completion handler do it
    // This ensures we don't clear the loading state while streaming is still active
  }, [startStreaming, fetchMetaMetrics, streamableDatasets, fetchGoogleAnalyticsData, fetchGoogleAdsData]);

  // Scoped refreshers for specific reports
  const refreshAnnualLeaveOnly = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    setStatusesFor(['annualLeave'], 'loading');
    try {
      const resp = await fetch('/api/attendance/annual-leave-all', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      let annualLeaveData: AnnualLeaveRecord[] = [];
      if (resp.ok) {
        const payload = await resp.json();
        if (payload.success && payload.all_data) {
          annualLeaveData = payload.all_data.map((record: any) => ({
            request_id: record.request_id,
            fe: record.person,
            start_date: record.start_date,
            end_date: record.end_date,
            reason: record.reason,
            status: record.status,
            days_taken: record.days_taken,
            leave_type: record.leave_type,
            rejection_notes: record.rejection_notes,
            hearing_confirmation: record.hearing_confirmation,
            hearing_details: record.hearing_details,
          }));
        }
      }
      setDatasetData(prev => ({ ...prev, annualLeave: annualLeaveData }));
      const now = Date.now();
      setDatasetStatus(prev => ({ ...prev, annualLeave: { status: 'ready', updatedAt: now } }));
      cachedData = { ...cachedData, annualLeave: annualLeaveData };
      cachedTimestamp = now;
  updateRefreshTimestamp(now, setLastRefreshTimestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh annual leave');
      setStatusesFor(['annualLeave'], 'error');
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [setStatusesFor]);

  const refreshMetaMetricsOnly = useCallback(async () => {
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
  }, [fetchMetaMetrics, setStatusesFor]);

  const refreshEnquiriesScoped = useCallback(async () => {
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());
    // Only the datasets this report needs
    const needed: DatasetKey[] = ['enquiries', 'teamData'];
    setStatusesFor(needed, 'loading');
    try {
      // Start streaming just the needed datasets
      startStreaming({ datasets: needed, bypassCache: true });
      // Refresh auxiliary non-streaming data in parallel
      const [annualLeave, meta] = await Promise.all([
        fetch('/api/attendance/annual-leave-all', {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }).then(async r => {
          if (!r.ok) return [] as AnnualLeaveRecord[];
          const j = await r.json();
          if (j.success && j.all_data) {
            return j.all_data.map((record: any) => ({
              request_id: record.request_id,
              fe: record.person,
              start_date: record.start_date,
              end_date: record.end_date,
              reason: record.reason,
              status: record.status,
              days_taken: record.days_taken,
              leave_type: record.leave_type,
              rejection_notes: record.rejection_notes,
              hearing_confirmation: record.hearing_confirmation,
              hearing_details: record.hearing_details,
            }));
          }
          return [] as AnnualLeaveRecord[];
        }),
        fetchMetaMetrics(),
      ]);
      setDatasetData(prev => ({ ...prev, annualLeave, metaMetrics: meta }));
      const now = Date.now();
      setDatasetStatus(prev => ({
        ...prev,
        annualLeave: { status: 'ready', updatedAt: now },
        metaMetrics: { status: 'ready', updatedAt: now },
      }));
      cachedData = { ...cachedData, annualLeave, metaMetrics: meta };
      cachedTimestamp = now;
  updateRefreshTimestamp(now, setLastRefreshTimestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh datasets');
      setStatusesFor(needed, 'error');
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, [fetchMetaMetrics, setStatusesFor, startStreaming]);

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
    debugLog('ReportingHome: refreshDatasets called');
    setHasFetchedOnce(true);
    setCacheState(true); // Persist the fetch state
    setIsFetching(true);
    setError(null);
    setRefreshStartedAt(Date.now());

    setDatasetStatus((prev) => {
      const next: DatasetStatus = { ...prev };
      MANAGEMENT_DATASET_KEYS.forEach((key) => {
        const previousMeta = prev[key];
        next[key] = { status: 'loading', updatedAt: previousMeta?.updatedAt ?? null };
      });
      return next;
    });

    try {
      // Fetch both management datasets, annual leave data, and marketing metrics in parallel
      debugLog('ReportingHome: Starting parallel fetch calls...');
      const [managementResponse, annualLeaveResponse, metaMetrics] = await Promise.all([
        (async () => {
          const url = new URL(REPORTING_ENDPOINT, window.location.origin);
          // Include current week Clio data in addition to standard datasets
          // Exclude userData from fetch (we get it from props) and annualLeave (fetched separately)
          const allDatasets = [
            ...MANAGEMENT_DATASET_KEYS.filter(key => key !== 'annualLeave' && key !== 'userData'), 
            'wipClioCurrentWeek'
          ];
          debugLog('ReportingHome: Requesting datasets:', allDatasets);
          url.searchParams.set('datasets', allDatasets.join(','));
          
          // Management Dashboard needs all team data, not user-specific data
          // Don't pass entraId to get team-wide WIP data instead of filtered user data
          
          // Force a fresh fetch when user clicks Refresh
          url.searchParams.set('bypassCache', 'true');

          return fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
        })(),
        // Fetch annual leave data
        fetch('/api/attendance/annual-leave-all', {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }),
        // Fetch marketing metrics
        fetchMetaMetrics()
      ]);

      if (!managementResponse.ok) {
        const text = await managementResponse.text().catch(() => '');
        throw new Error(`Failed to fetch datasets: ${managementResponse.status} ${managementResponse.statusText}${text ? ` – ${text.slice(0, 160)}` : ''}`);
      }

      const managementContentType = managementResponse.headers.get('content-type') || '';
      if (!managementContentType.toLowerCase().includes('application/json')) {
        const body = await managementResponse.text().catch(() => '');
        throw new Error(`Unexpected response (not JSON). Content-Type: ${managementContentType || 'unknown'} – ${body.slice(0, 160)}`);
      }

      const managementPayload = (await managementResponse.json()) as Partial<DatasetMap> & { 
        errors?: Record<string, string>;
        wipClioCurrentWeek?: any;
        wipCurrentAndLastWeek?: any;
      };

      // Handle annual leave response
      let annualLeaveData: AnnualLeaveRecord[] = [];
      if (annualLeaveResponse.ok) {
        try {
          const annualLeavePayload = await annualLeaveResponse.json();
          if (annualLeavePayload.success && annualLeavePayload.all_data) {
            annualLeaveData = annualLeavePayload.all_data.map((record: any) => ({
              request_id: record.request_id,
              fe: record.person,
              start_date: record.start_date,
              end_date: record.end_date,
              reason: record.reason,
              status: record.status,
              days_taken: record.days_taken,
              leave_type: record.leave_type,
              rejection_notes: record.rejection_notes,
              hearing_confirmation: record.hearing_confirmation,
              hearing_details: record.hearing_details,
            }));
          }
        } catch (annualLeaveError) {
          debugWarn('Failed to parse annual leave data:', annualLeaveError);
        }
      }

      // Merge current week Clio data with historical WIP data
      let mergedWip = managementPayload.wip ?? cachedData.wip;
      // wipClioCurrentWeek now returns { current_week: { activities: [...] }, last_week: {...} }
      const clioCurrentWeek = managementPayload.wipClioCurrentWeek;
      
      // Check if we have a merged wipCurrentAndLastWeek from backend that includes current-week activities
      const hasCurrentWeekMerged = managementPayload.wipCurrentAndLastWeek?.current_week?.activities?.length > 0;
      
      debugLog('🔍 Frontend merge debug:', {
        hasCurrentWeekMerged,
        currentWeekActivitiesCount: managementPayload.wipCurrentAndLastWeek?.current_week?.activities?.length || 0,
        clioCurrentWeekActivitiesCount: clioCurrentWeek?.current_week?.activities?.length || 0,
        historicalWipCount: mergedWip?.length || 0
      });
      
      if (hasCurrentWeekMerged) {
        // Use the merged current and last week data from backend (includes current-week activities)
        const currentWeekActivities = managementPayload.wipCurrentAndLastWeek.current_week.activities;
        debugLog('📊 Using backend-merged current week data:', { 
          currentWeekEntries: currentWeekActivities.length,
          historicalWip: mergedWip?.length || 0
        });
        
        // Merge current week activities with historical WIP
        if (mergedWip && Array.isArray(mergedWip)) {
          mergedWip = [...mergedWip, ...currentWeekActivities];
        } else {
          mergedWip = currentWeekActivities;
        }
        
        debugLog('📊 Final merged WIP count:', mergedWip ? mergedWip.length : 0);
      } else if (clioCurrentWeek?.current_week?.activities && Array.isArray(clioCurrentWeek.current_week.activities) && mergedWip && Array.isArray(mergedWip)) {
        // Fallback to old merge logic if backend merge wasn't available
        const clioWipEntries = clioCurrentWeek.current_week.activities;
        
        debugLog('📊 Fallback: Merging Clio current week into WIP:', { 
          clioEntries: clioWipEntries.length, 
          historicalWip: mergedWip.length,
          clioWipSample: clioWipEntries.slice(0, 3).map((e: any) => ({ 
            date: e.date, 
            user_id: e.user_id, 
            hours: e.quantity_in_hours 
          }))
        });
        
        // Merge raw activities (with user_id preserved) into WIP array
        mergedWip = [...mergedWip, ...clioWipEntries];
      }

      const nextData: DatasetMap = {
        userData: propUserData ?? cachedData.userData, // Use prop, not fetched data
        teamData: managementPayload.teamData ?? cachedData.teamData,
        enquiries: managementPayload.enquiries ?? cachedData.enquiries,
        allMatters: managementPayload.allMatters ?? cachedData.allMatters,
        wip: mergedWip,
        recoveredFees: managementPayload.recoveredFees ?? cachedData.recoveredFees,
        poidData: managementPayload.poidData ?? cachedData.poidData,
        annualLeave: annualLeaveData,
        metaMetrics: metaMetrics, // Use fetched meta metrics
        googleAnalytics: cachedData.googleAnalytics, // Will be updated separately
        googleAds: cachedData.googleAds, // Will be updated separately
      };

      const now = Date.now();
      cachedData = nextData;
      cachedTimestamp = now;

      setDatasetData(nextData);
      setDatasetStatus((prev) => {
        const next: DatasetStatus = { ...prev };
        MANAGEMENT_DATASET_KEYS.forEach((key) => {
          const value = nextData[key];
          const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
          next[key] = { status: hasValue ? 'ready' : 'ready', updatedAt: now };
        });
        return next;
      });
      updateRefreshTimestamp(now, setLastRefreshTimestamp);

      if (managementPayload.errors && Object.keys(managementPayload.errors).length > 0) {
        setError('Some datasets were unavailable.');
      }
    } catch (fetchError) {
      debugWarn('Failed to refresh reporting datasets:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
      setDatasetStatus((prev) => {
        const next: DatasetStatus = { ...prev };
        MANAGEMENT_DATASET_KEYS.forEach((key) => {
          const previous = prev[key];
          next[key] = { status: 'error', updatedAt: previous?.updatedAt ?? null };
        });
        return next;
      });
    } finally {
      setIsFetching(false);
      setRefreshStartedAt(null);
    }
  }, []);

  // Predictive cache loading - preload commonly needed datasets when Reports tab is accessed
  const preloadReportingCache = useCallback(async () => {
    // Check if we have recent cached data to avoid unnecessary preheating
    const cacheState = getCacheState();
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    // Only preload if we haven't fetched recently AND cache is stale
    const shouldPreheat = !hasFetchedOnce || 
                          !cacheState.lastCacheTime || 
                          cacheState.lastCacheTime < fiveMinutesAgo;
    
    if (shouldPreheat) {
      const commonDatasets = ['teamData', 'userData', 'enquiries', 'allMatters'];
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
      debugLog('ReportingHome: Skipping cache preheat - recent data available');
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

  // Add immediate visual feedback for better perceived performance
  const handleOpenDashboard = useCallback(() => {
    // Immediately show loading state for better UX
    setActiveView('dashboard');
    
    // Check if we have recent enough data or need a fresh fetch
    const cacheState = getCacheState();
    const now = Date.now();
    const tenMinutesAgo = now - (10 * 60 * 1000); // Allow 10 minutes before forcing refresh
    
    const needsFresh = !hasFetchedOnce || 
                       !cacheState.lastCacheTime || 
                       cacheState.lastCacheTime < tenMinutesAgo;
    
    if (needsFresh && !isFetching && !isStreamingConnected) {
      debugLog('ReportingHome: Opening dashboard with fresh data fetch');
      void refreshDatasetsWithStreaming(); // Use streaming version
    } else {
      debugLog('ReportingHome: Opening dashboard with cached data');
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
          />
        </div>
      </div>
    );
  }

  return (
    <div className="reporting-home-container" style={containerStyle(isDarkMode)}>
      <section style={heroSurfaceStyle(isDarkMode)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: 'Raleway, sans-serif' }}>Reporting workspace</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
        </div>
        <div style={heroMetaRowStyle}>
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
        {(isActivelyLoading || isStreamingConnected) && (
          <div style={refreshProgressPanelStyle(isDarkMode)}>
            <div style={refreshProgressHeaderStyle(isDarkMode)}>
              <Spinner size={SpinnerSize.small} />
              <span>
                {isStreamingConnected 
                  ? `Streaming datasets… (${streamingProgress.completed}/${streamingProgress.total})`
                  : 'Refreshing reporting datasets…'
                }
              </span>
            </div>
            <span style={refreshProgressDetailStyle(isDarkMode)}>
              {progressDetailText}
            </span>
            <div style={refreshProgressDatasetListStyle()}>
              {datasetSummaries.map(({ definition, status }) => {
                const palette = STATUS_BADGE_COLOURS[status];
                const iconName = palette.icon;
                const streamState = streamingDatasets[definition.key as keyof typeof streamingDatasets];
                const elapsed = streamState?.elapsedMs;
                const cached = streamState?.cached;
                return (
                  <div key={definition.key} style={refreshProgressDatasetRowStyle(isDarkMode)}>
                    <span style={refreshProgressDatasetLabelStyle(isDarkMode)}>
                      {status === 'loading' ? (
                        <Spinner size={SpinnerSize.xSmall} style={{ width: 16, height: 16 }} />
                      ) : iconName ? (
                        <FontIcon iconName={iconName} style={statusIconStyle(isDarkMode)} />
                      ) : (
                        <span style={statusDotStyle(palette.dot)} />
                      )}
                      {definition.name}
                    </span>
                    <span style={refreshProgressDatasetStatusStyle(isDarkMode)}>
                      {cached && (
                        <FontIcon
                          iconName="Database"
                          style={{ ...statusIconStyle(isDarkMode), marginRight: 6 }}
                          title="Cached"
                        />
                      )}
                      {palette.label}
                      {typeof elapsed === 'number' && elapsed >= 0 && (
                        <span style={{ marginLeft: 8, opacity: 0.8 }}>
                          {formatElapsedTime(elapsed)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: isDarkMode ? 'rgba(248, 113, 113, 0.22)' : 'rgba(248, 113, 113, 0.18)',
            color: isDarkMode ? '#fecaca' : '#b91c1c',
            fontSize: 12,
            boxShadow: surfaceShadow(isDarkMode),
            border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.32)' : 'rgba(248, 113, 113, 0.32)'}`,
          }}>
            {error}
          </div>
        )}
      </section>

      <section style={sectionSurfaceStyle(isDarkMode)}>
        <h2 style={sectionTitleStyle}>Available today</h2>
        <ul style={reportsListStyle()}>
          {AVAILABLE_REPORTS.map((report) => (
            <li key={report.key} style={reportRowStyle(isDarkMode)}>
              <div style={reportRowHeaderStyle(isDarkMode)}>
                <span style={reportNameStyle}>{report.name}</span>
                <span style={reportStatusStyle(isDarkMode)}>{report.status}</span>
              </div>
              {report.action === 'dashboard' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.dashboard ? 'Preparing…' : 'Open dashboard'}
                    onClick={handleOpenDashboard}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.dashboard}
                  />
                  <DefaultButton
                    text="Refresh data"
                    onClick={refreshDatasetsWithStreaming}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.dashboard}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
              {report.action === 'annualLeave' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.annualLeave ? 'Preparing…' : 'Open annual leave report'}
                    onClick={() => setActiveView('annualLeave')}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.annualLeave}
                  />
                  <DefaultButton
                    text="Refresh leave data"
                    onClick={refreshAnnualLeaveOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.annualLeave}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
              {report.action === 'enquiries' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.enquiries ? 'Preparing…' : 'Open enquiries report'}
                    onClick={() => setActiveView('enquiries')}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.enquiries}
                  />
                  <DefaultButton
                    text="Refresh enquiries data"
                    onClick={refreshEnquiriesScoped}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.enquiries}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
              {report.action === 'metaMetrics' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.metaMetrics ? 'Preparing…' : 'Open Meta metrics'}
                    onClick={() => setActiveView('metaMetrics')}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.metaMetrics}
                  />
                  <DefaultButton
                    text="Refresh Meta data"
                    onClick={refreshMetaMetricsOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.metaMetrics}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
              {report.action === 'seoReport' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.seoReport ? 'Preparing…' : 'Open SEO report'}
                    onClick={() => setActiveView('seoReport')}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.seoReport}
                  />
                  <DefaultButton
                    text="Refresh SEO data"
                    onClick={refreshMetaMetricsOnly} // SEO report uses Meta metrics data
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.seoReport}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
              {report.action === 'ppcReport' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    text={reportLoadingStates.ppcReport ? 'Preparing…' : 'Open PPC report'}
                    onClick={() => setActiveView('ppcReport')}
                    styles={primaryButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.ppcReport}
                  />
                  <DefaultButton
                    text="Refresh PPC data"
                    onClick={refreshMetaMetricsOnly} // PPC report uses marketing metrics data
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.ppcReport}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Marketing Data Settings removed (always using 24 months for GA4 and Google Ads) */}

      {!isActivelyLoading && !isStreamingConnected && (
      <section style={sectionSurfaceStyle(isDarkMode)}>
        <h2 style={sectionTitleStyle}>Data feeds powering the dashboard</h2>
        <div style={dataFeedListStyle()}>
          {datasetSummaries.map(({ definition, status, updatedAt, count, cached }) => {
            const palette = STATUS_BADGE_COLOURS[status];
            const details: string[] = [count > 0 ? `${count.toLocaleString()} record${count === 1 ? '' : 's'}` : 'No data'];
            if (cached) {
              details.push('cached');
            }
            if (updatedAt) {
              details.push(formatTimestamp(updatedAt));
            }
            return (
              <div key={definition.key} style={feedRowStyle(isDarkMode)}>
                <div style={feedLabelGroupStyle}>
                  <span style={feedLabelStyle}>{definition.name}</span>
                  <span style={feedMetaStyle}>{details.join(' • ')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={statusPillStyle(palette, isDarkMode)}>
                    {status === 'loading' ? (
                      <Spinner size={SpinnerSize.xSmall} style={{ width: 14, height: 14 }} />
                    ) : palette.icon ? (
                      <FontIcon iconName={palette.icon} style={statusIconStyle(isDarkMode)} />
                    ) : (
                      <span style={statusDotStyle(palette.dot)} />
                    )}
                    {cached && (
                      <FontIcon
                        iconName="Database"
                        style={{ ...statusIconStyle(isDarkMode), marginLeft: 6 }}
                        title="Cached"
                      />
                    )}
                    {palette.label}
                  </span>
                  {status === 'ready' && (
                    <DefaultButton
                      text={feedPreviewOpen[definition.key] ? 'Hide preview' : 'Preview'}
                      onClick={() => toggleFeedPreview(definition.key)}
                      styles={subtleButtonStyles(isDarkMode)}
                      disabled={isActivelyLoading}
                      iconProps={{ iconName: feedPreviewOpen[definition.key] ? 'ChevronUp' : 'View'}}
                    />
                  )}
                </div>
                {feedPreviewOpen[definition.key] && (
                  <div style={{
                    marginTop: 8,
                    gridColumn: '1 / -1',
                    borderRadius: 10,
                    padding: '10px 12px',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(100, 116, 139, 0.18)'}`,
                    background: isDarkMode ? 'rgba(30, 41, 59, 0.55)' : 'rgba(248, 250, 252, 0.72)',
                  }}>
                    {(() => {
                      const key = definition.key as DatasetKey;
                      const data = (datasetData as any)[key] as unknown[] | null | undefined;
                      const rows = Array.isArray(data) ? data : [];
                      const sample = rows.slice(0, 5);
                      return (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>
                              {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
                            </span>
                            <span style={{ fontSize: 12, opacity: 0.6 }}>
                              Showing first {sample.length} entr{sample.length === 1 ? 'y' : 'ies'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {sample.map((row, idx) => (
                              <div key={idx} style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                fontSize: 11.5,
                                padding: '6px 8px',
                                borderRadius: 8,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.55)' : 'rgba(241, 245, 249, 0.7)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.18)'}`,
                                overflowX: 'auto',
                              }}>
                                {formatPreviewRow(row)}
                              </div>
                            ))}
                            {sample.length === 0 && (
                              <div style={{ fontSize: 12, opacity: 0.7 }}>No data available</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      )}

      <section style={sectionSurfaceStyle(isDarkMode)}>
        <h2 style={sectionTitleStyle}>Quick metrics snapshot</h2>
        <HomePreview
          enquiries={datasetData.enquiries}
          allMatters={datasetData.allMatters}
          wip={datasetData.wip}
          recoveredFees={datasetData.recoveredFees}
        />
      </section>
    </div>
  );
};

export default ReportingHome;