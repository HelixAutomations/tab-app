import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  DatePicker,
  DayOfWeek,
  DefaultButton,
  IButtonStyles,
  IDatePickerStyles,
  PrimaryButton,
  Spinner,
  SpinnerSize,
  Stack,
  Icon,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { debugLog, debugWarn } from '../../utils/debug';
import { reportingPanelBackground, reportingPanelBorder, reportingPanelShadow, reportingShellBackground } from './styles/reportingFoundation';
import './ManagementDashboard.css';

interface Ga4Row {
  date: string; // YYYYMMDD
  sessions?: number;
  activeUsers?: number;
  screenPageViews?: number;
  bounceRate?: number;
  averageSessionDuration?: number;
  conversions?: number;
}

interface ChannelData {
  channel: string;
  sessions: number;
  conversions: number;
}

interface SourceMediumData {
  sourceMedium: string;
  sessions: number;
  conversions: number;
}

interface LandingPageData {
  landingPage: string;
  sessions: number;
  conversions: number;
}

interface DeviceData {
  device: string;
  sessions: number;
  conversions: number;
}

interface SeoReportProps {
  triggerRefresh?: () => Promise<void>;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
  cachedGa4Data?: Ga4Row[];
  cachedChannelData?: ChannelData[];
  cachedSourceMediumData?: SourceMediumData[];
  cachedLandingPageData?: LandingPageData[];
  cachedDeviceData?: DeviceData[];
}

type RangeKey = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'last90Days' | 'quarter' | 'yearToDate' | 'year' | 'custom';

interface RangeOption {
  key: RangeKey;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last90Days', label: 'Last 90 Days' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'yearToDate', label: 'Year To Date' },
  { key: 'year', label: 'Current Year' },
];

const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
  const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
  const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
  const focusBorder = isDarkMode ? '#87ceeb' : colours.highlight;
  const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
  const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

  return {
    root: { 
      maxWidth: 220,
      '.ms-DatePicker': {
        fontFamily: 'Raleway, sans-serif !important',
      }
    },
    textField: {
      fieldGroup: {
        border: `1px solid ${baseBorder}`,
        borderRadius: 10,
        background: backgroundColour,
        minHeight: 36,
        selectors: {
          ':hover': {
            borderColor: hoverBorder,
            background: hoverBackground,
          },
          ':focus-within': {
            borderColor: focusBorder,
            background: focusBackground,
          }
        }
      },
      field: {
        color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'Raleway, sans-serif',
        selectors: {
          '::placeholder': {
            color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(13, 47, 96, 0.5)',
          }
        }
      }
    },
    icon: {
      color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(13, 47, 96, 0.6)',
    }
  };
};

const getRangeButtonStyles = (isDarkMode: boolean, active: boolean, disabled: boolean = false): IButtonStyles => {
  const resolvedBackground = active
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent');

  const activeBorder = active
    ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const textColor = disabled
    ? (isDarkMode ? '#64748B' : '#94A3B8')
    : active
      ? '#ffffff'
      : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

  return {
    root: {
      borderRadius: 999,
      minHeight: 32,
      height: 32,
      padding: '0 8px',
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      border: activeBorder,
      background: resolvedBackground,
      color: textColor,
      boxShadow: active && !disabled ? '0 2px 8px rgba(54, 144, 206, 0.25)' : 'none',
      fontFamily: 'Raleway, sans-serif',
      cursor: disabled ? 'default' : 'pointer',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#2f7cb3'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(54, 144, 206, 0.12)'),
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#266795'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(54, 144, 206, 0.16)'),
    },
  };
};

const summaryChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 16px',
  borderRadius: 12,
  background: isDarkMode 
    ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)'
    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
  boxShadow: isDarkMode 
    ? '0 4px 12px rgba(0, 0, 0, 0.25)' 
    : '0 2px 8px rgba(0, 0, 0, 0.08)',
  fontFamily: 'Raleway, sans-serif',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  minWidth: 120,
  textAlign: 'center',
});

const computeRange = (key: RangeKey): { start: Date; end: Date } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (key) {
    case 'all':
      return { start: new Date(0), end: new Date(today) };
    case 'today':
      return { start: new Date(today), end: new Date(today) };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    }
    case 'week': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      return { start, end: new Date(today) };
    }
    case 'lastWeek': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end: new Date(today) };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start, end };
    }
    case 'last90Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      return { start, end: new Date(today) };
    }
    case 'quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), quarter * 3, 1);
      return { start, end: new Date(today) };
    }
    case 'yearToDate': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start, end: new Date(today) };
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { start, end };
    }
    default:
      return { start: new Date(0), end: new Date(today) };
  }
};

const formatCurrency = (amount: number): string => {
  if (amount === 0) return '£0';
  if (Math.abs(amount) < 1000) {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (Math.abs(amount) < 1000000) {
    return `£${(amount / 1000).toFixed(1)}k`;
  }
  return `£${(amount / 1000000).toFixed(2)}m`;
};

const formatNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  if (num < 1000000) return `${(num / 1000).toFixed(1)}k`;
  return `${(num / 1000000).toFixed(1)}m`;
};

const formatPercentage = (num: number): string => {
  return `${(num * 100).toFixed(1)}%`;
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const formatDateTag = (date: Date | null): string => {
  if (!date) {
    return 'n/a';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const formatRelativeTime = (timestamp?: number): string => {
  if (!timestamp) {
    return 'unknown';
  }

  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs)) {
    return 'unknown';
  }

  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const units: { ms: number; label: string }[] = [
    { ms: year, label: 'y' },
    { ms: month, label: 'mo' },
    { ms: week, label: 'w' },
    { ms: day, label: 'd' },
    { ms: hour, label: 'h' },
    { ms: minute, label: 'm' },
  ];

  for (const unit of units) {
    if (absMs >= unit.ms) {
      const value = Math.round(absMs / unit.ms);
      return diffMs >= 0 ? `${value}${unit.label} ago` : `in ${value}${unit.label}`;
    }
  }

  return 'just now';
};

const dateStampButtonStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '6px 12px',
  borderRadius: 10,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(13, 47, 96, 0.14)'}`,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
  color: isDarkMode ? '#e2e8f0' : '#0d2f60',
  minWidth: 132,
  gap: 2,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: 'Raleway, sans-serif',
  whiteSpace: 'nowrap',
  lineHeight: 1.3,
});

const SeoReport: React.FC<SeoReportProps> = ({
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false,
  cachedGa4Data = [],
  cachedChannelData = [],
  cachedSourceMediumData = [],
  cachedLandingPageData = [],
  cachedDeviceData = [],
}) => {
  const { isDarkMode } = useTheme();
  const lastSyncLabel = useMemo(() => formatRelativeTime(lastRefreshTimestamp), [lastRefreshTimestamp]);
  const [{ start: rangeStart, end: rangeEnd }, setRangeState] = useState(() => computeRange('all'));
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  // Use cached data instead of fetching - ensure all data is arrays
  const [ga4Data] = useState<Ga4Row[]>(Array.isArray(cachedGa4Data) ? cachedGa4Data : []);
  const [channelData] = useState<ChannelData[]>(Array.isArray(cachedChannelData) ? cachedChannelData : []);
  const [sourceMediumData] = useState<SourceMediumData[]>(Array.isArray(cachedSourceMediumData) ? cachedSourceMediumData : []);
  const [landingPageData] = useState<LandingPageData[]>(Array.isArray(cachedLandingPageData) ? cachedLandingPageData : []);
  const [deviceData] = useState<DeviceData[]>(Array.isArray(cachedDeviceData) ? cachedDeviceData : []);

  // Compute days between range
  const daysBetween = useMemo(() => {
    if (rangeKey === 'all') {
      if (!ga4Data || ga4Data.length === 0) return 1;
      const dates = ga4Data
        .map(r => new Date(typeof r.date === 'string' ? r.date : (r.date as any)))
        .sort((a, b) => a.getTime() - b.getTime());
      const first = dates[0];
      const last = dates[dates.length - 1];
      const diff = last.getTime() - first.getTime();
      return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)) + 1);
    }
    const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  }, [rangeKey, ga4Data, rangeStart, rangeEnd]);

  // Handle range selection
  const handleRangeSelect = (key: RangeKey) => {
    const { start, end } = computeRange(key);
    setRangeState({ start, end });
    setRangeKey(key);
    setStartDate(undefined);
    setEndDate(undefined);
  };

  // Handle custom date selection
  const handleCustomDateChange = (start?: Date, end?: Date) => {
    if (start && end) {
      setRangeState({ start, end });
      setRangeKey('custom');
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Handle activating custom range
  const handleActivateCustomRange = () => {
    if (rangeKey === 'custom') {
      return;
    }
    setStartDate(rangeStart);
    setEndDate(rangeEnd);
    setRangeKey('custom');
  };

  // Filter cached data based on current date range
  const filteredGa4Data = useMemo(() => {
    if (rangeKey === 'all') {
      return ga4Data;
    }
    return ga4Data.filter(row => {
      const rowDate = typeof row.date === 'string' ? new Date(row.date) : (row.date as any as Date);
      return rowDate >= rangeStart && rowDate <= rangeEnd;
    });
  }, [ga4Data, rangeKey, rangeStart, rangeEnd]);

  // Calculate summary metrics from filtered data
  const summaryMetrics = useMemo(() => {
    const totalSessions = filteredGa4Data.reduce((sum, row) => sum + (row.sessions || 0), 0);
    const totalUsers = filteredGa4Data.reduce((sum, row) => sum + (row.activeUsers || 0), 0);
    const totalPageViews = filteredGa4Data.reduce((sum, row) => sum + (row.screenPageViews || 0), 0);
    const totalConversions = filteredGa4Data.reduce((sum, row) => sum + (row.conversions || 0), 0);
    
    const avgBounceRate = filteredGa4Data.length > 0 
      ? filteredGa4Data.reduce((sum, row) => sum + (row.bounceRate || 0), 0) / filteredGa4Data.length 
      : 0;
    
    const avgSessionDuration = filteredGa4Data.length > 0 
      ? filteredGa4Data.reduce((sum, row) => sum + (row.averageSessionDuration || 0), 0) / filteredGa4Data.length 
      : 0;
    
    const conversionRate = totalSessions > 0 ? totalConversions / totalSessions : 0;

    return {
      totalSessions,
      totalUsers,
      totalPageViews,
      totalConversions,
      avgBounceRate,
      avgSessionDuration,
      conversionRate,
      averageSessionsPerDay: filteredGa4Data.length > 0 ? totalSessions / filteredGa4Data.length : 0,
    };
  }, [filteredGa4Data]);

  const isCustomRange = rangeKey === 'custom';
  const activePresetKey = rangeKey !== 'custom' ? rangeKey : null;
  const formattedFromLabel = formatDateTag(rangeStart);
  const formattedToLabel = formatDateTag(rangeEnd);
  const rangeSummaryLabel = rangeKey === 'all' ? 'All time' : `${formattedFromLabel} → ${formattedToLabel}`;

  return (
    <div style={{ padding: '0', minHeight: '100vh', background: reportingShellBackground(isDarkMode) }}>
      <div style={{
        marginBottom: 16,
        borderRadius: 12,
        padding: '12px 14px',
        background: reportingPanelBackground(isDarkMode, 'base'),
        border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
        boxShadow: reportingPanelShadow(isDarkMode),
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.68, letterSpacing: 0.35 }}>
            SEO Report
          </span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            Organic search traffic and conversion performance
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(13, 47, 96, 0.14)'}`,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.92)',
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.9,
          }}>
            Range: {rangeSummaryLabel}
          </span>
          <span style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
            background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(16, 185, 129, 0.08)',
            fontSize: 11,
            fontWeight: 600,
            color: isDarkMode ? '#86efac' : colours.green,
          }}>
            Sync {lastSyncLabel}
          </span>
        </div>
      </div>

      {/* Date Range Controls */}
      <div className="filter-toolbar" style={{ marginBottom: 24 }}>
        <div className="filter-toolbar__top">
          <div className="filter-toolbar__date-inputs">
            {isCustomRange ? (
              <div className="date-pickers">
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={startDate}
                  onSelectDate={(date) => {
                    setStartDate(date ?? undefined);
                    setRangeKey('custom');
                  }}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={(date) => date?.toLocaleDateString('en-GB') || ''}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={endDate}
                  onSelectDate={(date) => {
                    setEndDate(date ?? undefined);
                    setRangeKey('custom');
                  }}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={(date) => date?.toLocaleDateString('en-GB') || ''}
                />
              </div>
            ) : (
              <div className="date-stamp-group">
                <button
                  type="button"
                  className="date-stamp-button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={handleActivateCustomRange}
                  title="Click to customise the start date"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>From</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedFromLabel}</span>
                </button>
                <button
                  type="button"
                  className="date-stamp-button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={handleActivateCustomRange}
                  title="Click to customise the end date"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>To</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedToLabel}</span>
                </button>
              </div>
            )}
          </div>

          <div className="filter-toolbar__actions">
            {triggerRefresh && (
              <DefaultButton
                text={isFetching ? 'Refreshing...' : 'Refresh Data'}
                iconProps={{ iconName: 'Refresh' }}
                onClick={triggerRefresh}
                disabled={isFetching}
              />
            )}
          </div>
        </div>

        <div className="filter-toolbar__middle">
          <div className="filter-toolbar__presets">
            <div className="filter-preset-group">
              {RANGE_OPTIONS.slice(0, 2).map(({ key, label }) => (
                <DefaultButton
                  key={key}
                  text={label}
                  onClick={() => handleRangeSelect(key)}
                  styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, false)}
                />
              ))}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(2, 4).map(({ key, label }) => (
                <DefaultButton
                  key={key}
                  text={label}
                  onClick={() => handleRangeSelect(key)}
                  styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, false)}
                />
              ))}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(4, 6).map(({ key, label }) => (
                <DefaultButton
                  key={key}
                  text={label}
                  onClick={() => handleRangeSelect(key)}
                  styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, false)}
                />
              ))}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(6, 8).map(({ key, label }) => (
                <DefaultButton
                  key={key}
                  text={label}
                  onClick={() => handleRangeSelect(key)}
                  styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, false)}
                />
              ))}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(8, 10).map(({ key, label }) => (
                <DefaultButton
                  key={key}
                  text={label}
                  onClick={() => handleRangeSelect(key)}
                  styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, false)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: 16, 
        marginBottom: 32 
      }}>
        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="Search" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Organic Sessions</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{formatNumber(summaryMetrics.totalSessions)}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {formatNumber(summaryMetrics.averageSessionsPerDay)}/day avg
          </span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="People" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Unique Users</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{formatNumber(summaryMetrics.totalUsers)}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {formatPercentage(summaryMetrics.totalUsers / summaryMetrics.totalSessions)} of sessions
          </span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="Page" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Page Views</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{formatNumber(summaryMetrics.totalPageViews)}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {(summaryMetrics.totalPageViews / summaryMetrics.totalSessions).toFixed(1)} per session
          </span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="Trophy2" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Conversions</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, color: colours.highlight }}>
            {summaryMetrics.totalConversions}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {formatPercentage(summaryMetrics.conversionRate)} rate
          </span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="Timer" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Avg. Duration</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            {formatDuration(summaryMetrics.avgSessionDuration)}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>per session</span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="BoxPlaySolid" style={{ fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Bounce Rate</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            {formatPercentage(summaryMetrics.avgBounceRate)}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>single page visits</span>
        </div>
      </div>

      {/* Detailed Breakdowns */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
        gap: 24,
        marginBottom: 32 
      }}>
        {/* Traffic Sources */}
        <div style={{
          background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
          borderRadius: 12,
          padding: 20,
          boxShadow: isDarkMode 
            ? '0 4px 12px rgba(0, 0, 0, 0.25)' 
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: 16, 
            fontWeight: 600,
            color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Icon iconName="Globe" style={{ fontSize: 16, color: colours.highlight }} />
            Top Search Engines
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sourceMediumData.slice(0, 8).map((source, index) => (
              <div key={source.sourceMedium} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
                borderRadius: 8,
                fontSize: 13
              }}>
                <span style={{ 
                  fontWeight: 500,
                  color: isDarkMode ? '#E2E8F0' : colours.missedBlue
                }}>
                  {source.sourceMedium.split(' / ')[0]}
                </span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: colours.highlight }}>
                    {formatNumber(source.sessions)}
                  </span>
                  <span style={{ 
                    fontSize: 11, 
                    opacity: 0.7,
                    minWidth: 40,
                    textAlign: 'right'
                  }}>
                    {source.conversions} conv
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Landing Pages */}
        <div style={{
          background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
          borderRadius: 12,
          padding: 20,
          boxShadow: isDarkMode 
            ? '0 4px 12px rgba(0, 0, 0, 0.25)' 
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: 16, 
            fontWeight: 600,
            color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Icon iconName="WebAppBuilderFragment" style={{ fontSize: 16, color: colours.highlight }} />
            Top Landing Pages
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {landingPageData.slice(0, 8).map((page, index) => (
              <div key={page.landingPage} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
                borderRadius: 8,
                fontSize: 13
              }}>
                <span style={{ 
                  fontWeight: 500,
                  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 240
                }}>
                  {page.landingPage === '/' ? 'Home Page' : page.landingPage.slice(0, 50)}
                  {page.landingPage.length > 50 && '...'}
                </span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: colours.highlight }}>
                    {formatNumber(page.sessions)}
                  </span>
                  <span style={{ 
                    fontSize: 11, 
                    opacity: 0.7,
                    minWidth: 40,
                    textAlign: 'right'
                  }}>
                    {page.conversions} conv
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device Breakdown */}
      <div style={{
        background: isDarkMode 
          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: isDarkMode 
          ? '0 4px 12px rgba(0, 0, 0, 0.25)' 
          : '0 2px 8px rgba(0, 0, 0, 0.08)',
        marginBottom: 32
      }}>
        <h3 style={{ 
          margin: '0 0 16px 0', 
          fontSize: 16, 
          fontWeight: 600,
          color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <Icon iconName="Devices4" style={{ fontSize: 16, color: colours.highlight }} />
          Device Breakdown
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: 16 
        }}>
          {deviceData.map((device) => (
            <div key={device.device} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 16,
              background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
              borderRadius: 8,
              textAlign: 'center'
            }}>
              <Icon 
                iconName={device.device === 'desktop' ? 'Computer' : device.device === 'mobile' ? 'CellPhone' : 'Tablet'} 
                style={{ fontSize: 24, color: colours.highlight, marginBottom: 8 }} 
              />
              <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize', marginBottom: 4 }}>
                {device.device}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: colours.highlight, marginBottom: 2 }}>
                {formatNumber(device.sessions)}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {formatPercentage(device.sessions / summaryMetrics.totalSessions)} of traffic
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                {device.conversions} conversions
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Quality Note */}
      <div style={{
        padding: 16,
        background: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
        border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)'}`,
        borderRadius: 8,
        fontSize: 12,
        color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
        opacity: 0.8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon iconName="Info" style={{ fontSize: 12, color: colours.highlight }} />
          <span style={{ fontWeight: 600 }}>Data Source</span>
        </div>
        <div>
          All data is sourced from Google Analytics 4 and filtered to show organic search traffic only. 
          Conversions include form submissions, enquiries, and goal completions as configured in GA4.
        </div>
      </div>
    </div>
  );
};

export default SeoReport;
