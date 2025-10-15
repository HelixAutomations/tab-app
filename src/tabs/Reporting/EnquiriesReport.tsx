import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DatePicker,
  DayOfWeek,
  DefaultButton,
  Icon,
  type IButtonStyles,
  type IDatePickerStyles,
  MessageBar,
  MessageBarType,
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  TextField,
} from '@fluentui/react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
} from 'recharts';
import { useTheme } from '../../app/functionality/ThemeContext';
import type { Enquiry, TeamData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import './ManagementDashboard.css';
import { getNormalizedEnquirySourceLabel, getNormalizedEnquiryMOCLabel } from '../../utils/enquirySource';
import { findMatches, type OldEnquiry, type NewEnquiry } from '../../utils/enquiryCrossReference';
import type { AnnualLeaveRecord } from './AnnualLeaveReport';

// Marketing Metrics Interfaces
interface GoogleAnalyticsMetrics {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  conversionRate: number;
  organicTraffic: number;
  paidTraffic: number;
}

interface GoogleAdsMetrics {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number; // Click-through rate
  cpc: number; // Cost per click
  cpa: number; // Cost per acquisition
  qualityScore: number;
}

interface MetaAdsMetrics {
  date: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpm: number; // Cost per mille
  cpc: number; // Cost per click
  frequency: number;
}

interface MarketingMetrics {
  date: string;
  googleAnalytics?: GoogleAnalyticsMetrics;
  googleAds?: GoogleAdsMetrics;
  metaAds?: MetaAdsMetrics;
}

interface EnquiriesReportProps {
  enquiries: Enquiry[] | null;
  teamData?: TeamData[] | null;
  annualLeave?: AnnualLeaveRecord[] | null;
  metaMetrics?: MarketingMetrics[] | null;
  triggerRefresh?: () => void;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
}

const EMPTY_DAY_FILTER = { name: '', poc: '', taker: '', status: '' } as const;

type RangeKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'lastWeek'
  | 'month'
  | 'lastMonth'
  | 'last90Days'
  | 'quarter'
  | 'yearToDate'
  | 'year'
  | 'custom';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
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

const ROLE_OPTIONS = [
  { key: 'Partner', label: 'Partner' },
  { key: 'Associate Solicitor', label: 'Associate' },
  { key: 'Solicitor', label: 'Solicitor' },
  { key: 'Paralegal', label: 'Paralegal' },
  { key: 'Ops', label: 'Ops' },
  { key: 'Inactive', label: 'Inactive' },
] as const;

interface TeamMember {
  initials: string;
  display: string;
  role?: string;
  isActive: boolean;
  record: TeamData;
  email?: string;
  normalizedName: string;
}

interface EnrichedEnquiry {
  enquiry: Enquiry;
  member?: TeamMember;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const candidate = new Date(String(value));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function getInitials(input: string): string {
  const s = (input || '').trim();
  if (!s) return '?';
  let tokens: string[] = [];
  if (s.includes('@')) {
    const local = s.split('@')[0] || '';
    tokens = local.split(/[^a-zA-Z]+/).filter(Boolean);
  } else {
    tokens = s.split(/\s+/).filter(Boolean);
  }
  if (tokens.length === 0) return '?';
  const first = tokens[0][0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : tokens[0][1] || '';
  const initials = (first + last).toUpperCase();
  return initials || '?';
}

const NAME_MAP: Record<string, string> = {
  'Samuel Packwood': 'Sam Packwood',
  'Bianca ODonnell': "Bianca O'Donnell",
};

// Helix brand-based color palette using actual brand colors
const PIE_COLORS = [
  colours.blue,           // #3690CE - Primary brand blue
  colours.darkBlue,       // #061733 - Dark brand blue
  colours.websiteBlue,    // #000319 - Website blue
  colours.missedBlue,     // #0d2f60 - Missed blue
  colours.accent,         // #87F3F3 - Brand accent
  colours.highlight,      // #3690CE - Highlight (same as blue)
  colours.dark.subText,   // #3690CE - Sub text blue
  colours.dark.highlight, // #3690CE - Dark mode highlight
  colours.highlightBlue,  // #d6e8ff - Light highlight blue
  colours.greyText,       // #6B6B6B - Professional gray
  colours.subtleGrey,     // #A0A0A0 - Subtle gray
  colours.dark.border,    // #374151 - Dark border
  colours.dark.grey,      // #374151 - Dark gray
  colours.light.border,   // #F4F4F6 - Light border
  colours.dark.cardHover, // #374151 - Card hover
];

interface PieChartData {
  name: string;
  value: number;
  color: string;
}

const CustomPieLabel = ({ 
  cx, cy, midAngle, innerRadius, outerRadius, name, percent, isDarkMode 
}: any) => {
  if (percent < 0.05) return null; // Don't show labels for segments < 5%
  
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 25; // Position labels outside the pie
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text 
      x={x} 
      y={y} 
      fill={isDarkMode ? colours.accent : colours.greyText}
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      fontSize={10}
      fontFamily="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      fontWeight={500}
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const PieChartComponent: React.FC<{
  data: PieChartData[];
  title: string;
  isDarkMode: boolean;
  type: 'source' | 'moc' | 'poc';
  activeFilter?: string | null;
  onSliceClick: (value: string) => void;
}> = ({ data, title, isDarkMode, type, activeFilter, onSliceClick }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [displayData, setDisplayData] = useState<PieChartData[]>([]);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setDisplayData(data);
      setIsLoading(false);
    }, 150); // Small delay for smooth transition

    return () => clearTimeout(timer);
  }, [data]);

  const handleSliceClick = (data: any, index: number) => {
    if (data && data.name) {
      onSliceClick(data.name);
    }
  };

  if (data.length === 0) {
    return (
      <div style={{ 
        height: 220, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        opacity: 0.7,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        transition: 'all 0.3s ease-in-out'
      }}>
        No data in range.
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'relative',
      height: 220,
      transition: 'opacity 0.3s ease-in-out',
      opacity: isLoading ? 0.5 : 1
    }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          color: isDarkMode ? colours.accent : colours.blue,
          fontSize: '12px',
          fontWeight: 500
        }}>
          Loading...
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={displayData}
            cx="50%"
            cy="50%"
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
            label={(props) => <CustomPieLabel {...props} isDarkMode={isDarkMode} />}
            labelLine={false}
            stroke={isDarkMode ? '#1f2937' : '#ffffff'}
            strokeWidth={1}
            animationBegin={0}
            animationDuration={800}
            animationEasing="ease-out"
            onClick={handleSliceClick}
            cursor="pointer"
          >
            {displayData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                stroke={activeFilter === entry.name ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? '#1f2937' : '#ffffff')}
                strokeWidth={activeFilter === entry.name ? 3 : 2}
                style={{
                  opacity: activeFilter && activeFilter !== entry.name ? 0.4 : 1,
                  transition: 'all 0.3s ease-in-out',
                  cursor: 'pointer'
                }}
              />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              borderRadius: '8px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '12px',
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
              transition: 'all 0.2s ease-in-out'
            }}
            formatter={(value, name) => [value, name]}
            labelStyle={{
              color: isDarkMode ? colours.dark.text : colours.light.text
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {activeFilter && (
        <div style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          fontSize: '10px',
          color: isDarkMode ? colours.accent : colours.highlight,
          backgroundColor: isDarkMode ? 'rgba(135, 206, 255, 0.1)' : 'rgba(54, 144, 206, 0.1)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
          cursor: 'pointer'
        }}
        onClick={() => onSliceClick(activeFilter)}
        title="Click to clear filter">
          Filtered: {activeFilter} ×
        </div>
      )}
    </div>
  );
};

const toStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

const normalizeName = (name?: string | null): string =>
  typeof name === 'string' ? name.replace(/[^a-zA-Z]/g, '').toLowerCase() : '';

const mapNameIfNeeded = (name?: string | null): string => {
  if (!name) return '';
  return NAME_MAP[name] ?? name;
};

const displayName = (record?: TeamData | null): string => {
  if (!record) return 'Unknown';
  return (
    record['Nickname'] ||
    record['Full Name'] ||
    record['First'] ||
    record['Last'] ||
    record['Initials'] ||
    'Unknown'
  );
};

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
      },
    },
    textField: {
      root: {
        fontFamily: 'Raleway, sans-serif !important',
        width: '100% !important',
      },
      fieldGroup: {
        height: '36px !important',
        borderRadius: '8px !important',
        border: `1px solid ${baseBorder} !important`,
        background: `${backgroundColour} !important`,
        padding: '0 14px !important',
        boxShadow: isDarkMode
          ? '0 2px 4px rgba(0, 0, 0, 0.2) !important'
          : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
        transition: 'all 0.2s ease !important',
        selectors: {
          ':hover': {
            border: `1px solid ${hoverBorder} !important`,
            background: `${hoverBackground} !important`,
            boxShadow: isDarkMode
              ? '0 4px 8px rgba(0, 0, 0, 0.25) !important'
              : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
          },
          ':focus-within': {
            border: `1px solid ${focusBorder} !important`,
            background: `${focusBackground} !important`,
            boxShadow: isDarkMode
              ? '0 2px 4px rgba(135, 206, 255, 0.12) !important'
              : '0 2px 6px rgba(54, 144, 206, 0.15) !important',
          },
        },
      },
      field: {
        fontSize: '14px !important',
        fontFamily: 'Raleway, sans-serif !important',
        fontWeight: '500 !important',
        background: 'transparent !important',
        lineHeight: '20px !important',
        border: 'none !important',
        outline: 'none !important',
      },
    },
    icon: {
      color: `${isDarkMode ? colours.highlight : colours.missedBlue} !important`,
      fontSize: '16px !important',
      fontWeight: 'bold !important',
    },
    callout: {
      fontSize: '14px !important',
      borderRadius: '12px !important',
      border: `1px solid ${baseBorder} !important`,
      boxShadow: isDarkMode
        ? '0 8px 24px rgba(0, 0, 0, 0.4) !important'
        : '0 6px 20px rgba(15, 23, 42, 0.15) !important',
    },
    wrapper: {
      borderRadius: '12px !important',
    },
  };
};

const getRangeButtonStyles = (
  isDarkMode: boolean,
  active: boolean,
  disabled: boolean = false,
): IButtonStyles => {
  const activeBackground = colours.highlight;
  const inactiveBackground = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent';

  const resolvedBackground = disabled
    ? isDarkMode
      ? 'rgba(15, 23, 42, 0.8)'
      : 'transparent'
    : active
      ? activeBackground
      : inactiveBackground;

  const resolvedBorder = active
    ? `1px solid ${isDarkMode ? 'rgba(135, 176, 255, 0.5)' : 'rgba(13, 47, 96, 0.32)'}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const resolvedColor = disabled
    ? isDarkMode
      ? '#E2E8F0'
      : colours.missedBlue
    : active
      ? '#ffffff'
      : isDarkMode
        ? '#E2E8F0'
        : colours.missedBlue;

  return {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      borderRadius: 999,
      border: resolvedBorder,
      padding: '0 12px',
      minHeight: 32,
      height: 32,
      fontWeight: 600,
      fontSize: 13,
      color: resolvedColor,
      background: resolvedBackground,
      boxShadow: active && !disabled ? '0 2px 8px rgba(54, 144, 206, 0.25)' : 'none',
      fontFamily: 'Raleway, sans-serif',
      cursor: disabled ? 'default' : 'pointer',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#2f7cb3'
          : isDarkMode
            ? 'rgba(148, 163, 184, 0.24)'
            : 'rgba(54, 144, 206, 0.12)',
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#266795'
          : isDarkMode
            ? 'rgba(148, 163, 184, 0.3)'
            : 'rgba(54, 144, 206, 0.16)',
    },
  };
};

const getTeamButtonStyles = (
  isDarkMode: boolean,
  active: boolean,
  hasEnquiries: boolean = true,
): IButtonStyles => {
  const activeBackground = active
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : isDarkMode
      ? 'rgba(15, 23, 42, 0.8)'
      : 'transparent';

  const activeBorder = active
    ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const greyedOut = !hasEnquiries;
  const opacity = greyedOut ? 0.4 : 1;
  const textColor = active
    ? '#ffffff'
    : greyedOut
      ? isDarkMode
        ? '#64748B'
        : '#94A3B8'
      : isDarkMode
        ? '#E2E8F0'
        : colours.missedBlue;

  return {
    root: {
      borderRadius: 999,
      minHeight: 32,
      height: 32,
      padding: '0 8px',
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      border: activeBorder,
      background: activeBackground,
      color: textColor,
      opacity,
      boxShadow: active
        ? isDarkMode
          ? '0 2px 8px rgba(54, 144, 206, 0.3)'
          : '0 2px 8px rgba(54, 144, 206, 0.25)'
        : 'none',
      fontFamily: 'Raleway, sans-serif',
      transform: active ? 'translateY(-1px)' : 'none',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: active
        ? 'linear-gradient(135deg, #2f7cb3 0%, #266795 100%)'
        : isDarkMode
          ? 'rgba(15, 23, 42, 0.86)'
          : 'rgba(54, 144, 206, 0.1)',
      transform: 'translateY(-1px)',
      boxShadow: active
        ? isDarkMode
          ? '0 4px 12px rgba(54, 144, 206, 0.4)'
          : '0 4px 12px rgba(54, 144, 206, 0.35)'
        : isDarkMode
          ? '0 2px 4px rgba(0, 0, 0, 0.1)'
          : '0 2px 4px rgba(15, 23, 42, 0.05)',
    },
    rootPressed: {
      background: active
        ? 'linear-gradient(135deg, #266795 0%, #1e5a7a 100%)'
        : isDarkMode
          ? 'rgba(15, 23, 42, 0.9)'
          : 'rgba(54, 144, 206, 0.14)',
      transform: 'translateY(0)',
    },
  };
};

const getRoleButtonStyles = (isDarkMode: boolean, active: boolean, hasData: boolean = true): IButtonStyles => {
  const activeBackground = active
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : isDarkMode
      ? 'rgba(15, 23, 42, 0.8)'
      : 'transparent';

  const activeBorder = active
    ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const textColor = active
    ? '#ffffff'
    : hasData
      ? (isDarkMode ? '#E2E8F0' : colours.missedBlue)
      : (isDarkMode ? '#64748B' : '#94A3B8');
  const opacity = hasData ? 1 : 0.55;

  return {
    root: {
      borderRadius: 999,
      minHeight: 32,
      height: 32,
      padding: '0 12px',
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      border: activeBorder,
      background: activeBackground,
      color: textColor,
      opacity,
      boxShadow: active
        ? isDarkMode
          ? '0 2px 8px rgba(54, 144, 206, 0.3)'
          : '0 2px 8px rgba(54, 144, 206, 0.25)'
        : 'none',
      fontFamily: 'Raleway, sans-serif',
      transform: active ? 'translateY(-1px)' : 'none',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: active
        ? 'linear-gradient(135deg, #2f7cb3 0%, #266795 100%)'
        : isDarkMode
          ? 'rgba(15, 23, 42, 0.86)'
          : 'rgba(54, 144, 206, 0.1)',
      transform: hasData ? 'translateY(-1px)' : 'none',
      opacity: hasData ? 1 : opacity,
      boxShadow: active
        ? isDarkMode
          ? '0 4px 12px rgba(54, 144, 206, 0.4)'
          : '0 4px 12px rgba(54, 144, 206, 0.35)'
        : isDarkMode
          ? '0 2px 4px rgba(0, 0, 0, 0.1)'
          : '0 2px 4px rgba(15, 23, 42, 0.05)',
    },
    rootPressed: {
      background: active
        ? 'linear-gradient(135deg, #266795 0%, #1e5a7a 100%)'
        : isDarkMode
          ? 'rgba(15, 23, 42, 0.9)'
          : 'rgba(54, 144, 206, 0.14)',
      transform: hasData ? 'translateY(0)' : 'none',
    },
  };
};

const clearFilterButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  height: 32,
  borderRadius: 8,
  border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)'}`,
  background: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.85)',
  color: isDarkMode ? '#fca5a5' : '#dc2626',
  gap: 6,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: 'Raleway, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: 'nowrap',
});

const dateStampButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 2,
  padding: '8px 12px',
  borderRadius: 10,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  minWidth: 120,
  transition: 'all 0.2s ease',
  cursor: 'pointer',
});

const computeRange = (range: RangeKey): { start: Date; end: Date } => {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      start.setTime(yesterday.getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(yesterday.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      const day = now.getDay();
      const diff = (day + 6) % 7;
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'lastWeek': {
      const day = now.getDay();
      const diff = (day + 6) % 7;
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - diff);
      thisWeekStart.setHours(0, 0, 0, 0);

      start.setTime(thisWeekStart.getTime());
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);

      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth': {
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last90Days':
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    case 'quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStart, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearToDate': {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      if (currentMonth >= 3) {
        start.setFullYear(currentYear, 3, 1);
      } else {
        start.setFullYear(currentYear - 1, 3, 1);
      }
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
      start.setFullYear(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      return { start: new Date(now), end: new Date(now) };
    case 'all':
    default:
      return { start: new Date(0), end };
  }

  return { start, end };
};

const normalizeRange = (input: { start: Date; end: Date }): { start: Date; end: Date } => {
  const start = new Date(input.start);
  const end = new Date(input.end);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const quickRanges: Array<{ key: RangeKey; label: string; get: () => { start: Date; end: Date } | null }> = [
  { key: 'all', label: 'All', get: () => null },
  ...RANGE_OPTIONS.map(({ key, label }) => ({
    key,
    label,
    get: () => normalizeRange(computeRange(key)),
  })),
];

const isWithin = (value: Date | null, start: Date, end: Date): boolean => {
  if (!value) return false;
  const time = value.getTime();
  return time >= start.getTime() && time <= end.getTime();
};

const formatDateForPicker = (date?: Date | null): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const parseDatePickerInput = (value?: string | null): Date | null =>
  value ? parseDate(value) : null;

const formatDateTag = (date: Date | null): string => {
  if (!date) return 'n/a';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const workingDaysBetween = (start: Date, end: Date): number => {
  if (!start || !end) return 1;
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(23, 59, 59, 999);

  while (cursor <= endCopy) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
};

const formatTimeAgo = (timestamp?: number): string => {
  if (!timestamp) return 'Not refreshed yet';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const formatDayHeaderLabel = (isoDate: string): string => {
  const parsed = parseDate(isoDate);
  if (!parsed) return isoDate;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const startOfWeek = new Date(today);
  const dayIndex = (startOfWeek.getDay() + 6) % 7; // Monday as start of week
  startOfWeek.setDate(startOfWeek.getDate() - dayIndex);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  if (target >= startOfWeek && target <= endOfWeek) {
    return target.toLocaleDateString('en-GB', { weekday: 'long' });
  }

  return target.toLocaleDateString('en-GB');
};

// Triaged POC identifiers and patterns (case-insensitive)
function isTriagedPoc(value: string): boolean {
  const v = (value || '').trim().toLowerCase();
  if (!v) return false;
  if (v === 'property@helix-law.com' || v === 'commercial@helix-law.com' || v === 'construction@helix-law.com') return true;
  const local = v.includes('@') ? v.split('@')[0] : v;
  if (local === 'commercial' || local === 'construction' || local === 'property') return true;
  return false;
}

const getPocRaw = (entry: unknown): string => {
  if (!entry || typeof entry !== 'object') return '';
  const candidate = entry as Record<string, unknown>;
  const poc = candidate.Point_of_Contact ?? candidate.poc;
  return typeof poc === 'string' ? poc.trim() : '';
};

function containerStyle(isDark: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: 'transparent',
    padding: 0,
    minHeight: '100%',
  };
}

function surface(isDark: boolean, overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: isDark ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
    borderRadius: 12,
    border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
    boxShadow: isDark ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)',
    padding: 16,
    ...overrides,
  };
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, 1fr)',
  gap: 12,
};

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
};

function sectionTitle(): React.CSSProperties {
  return { fontSize: 16, fontWeight: 600, margin: 0 };
}

const EnquiriesReport: React.FC<EnquiriesReportProps> = ({ 
  enquiries, 
  teamData, 
  annualLeave, 
  metaMetrics,
  triggerRefresh, 
  lastRefreshTimestamp, 
  isFetching 
}) => {
  const { isDarkMode } = useTheme();
  
  // Add CSS animations for smooth loading
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0); // Time since last refresh in seconds
  const [showRoleFilter, setShowRoleFilter] = useState<boolean>(false);
  const [showDatasetInfo, setShowDatasetInfo] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [mocFilter, setMocFilter] = useState<string | null>(null);
  const [pocFilter, setPocFilter] = useState<string | null>(null);
  
  // Modal state for showing underlying data
  const [modalData, setModalData] = useState<{
    isOpen: boolean;
    title: string;
    items: any[];
    type: 'source' | 'moc' | 'poc';
    filterValue: string;
  }>({
    isOpen: false,
    title: '',
    items: [],
    type: 'source',
    filterValue: ''
  });
  
  // Function to open modal with filtered data
  const openModal = (type: 'source' | 'moc' | 'poc', filterValue: string) => {
    let filteredItems: any[] = [];
    let title = '';
    
    switch (type) {
      case 'source':
        filteredItems = filteredEntries.filter(({ enquiry }) => 
          getNormalizedEnquirySourceLabel(enquiry) === filterValue
        );
        title = `Enquiries from: ${filterValue}`;
        break;
      case 'moc':
        filteredItems = filteredEntries.filter(({ enquiry }) => 
          getNormalizedEnquiryMOCLabel(enquiry) === filterValue
        );
        title = `Enquiries via: ${filterValue}`;
        break;
      case 'poc':
        filteredItems = filteredEntries.filter(({ enquiry }) => {
          const poc = toStr(enquiry.Point_of_Contact || (enquiry as any).point_of_contact).trim();
          return poc === filterValue;
        });
        title = `Enquiries handled by: ${filterValue}`;
        break;
    }
    
    setModalData({
      isOpen: true,
      title,
      items: filteredItems,
      type,
      filterValue
    });
  };
  
  const closeModal = () => {
    setModalData(prev => ({ ...prev, isOpen: false }));
  };
  
  // Reassignment functionality
  const [reassignmentDropdown, setReassignmentDropdown] = useState<{ enquiryId: string; x: number; y: number } | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignmentMessage, setReassignmentMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Auto-refresh tracking - Update elapsed time every second
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset timer when manual refresh happens
  React.useEffect(() => {
    if (lastRefreshTimestamp) {
      setTimeElapsed(0);
    }
  }, [lastRefreshTimestamp]);

  // Calculate color based on elapsed time (green → blue over 15 minutes)
  const getRefreshIndicatorColor = (): string => {
    const maxSeconds = 15 * 60; // 15 minutes
    const progress = Math.min(timeElapsed / maxSeconds, 1); // 0 to 1

    // Green (start): rgb(34, 197, 94)
    // Blue (end): rgb(59, 130, 246)
    const r = Math.round(34 + (59 - 34) * progress);
    const g = Math.round(197 + (130 - 197) * progress);
    const b = Math.round(94 + (246 - 94) * progress);

    return `rgb(${r}, ${g}, ${b})`;
  };
  const range = useMemo(() => {
    if (rangeKey === 'custom') {
      if (!customDateRange || !customDateRange.start || !customDateRange.end) {
        return null;
      }
      return normalizeRange({ start: customDateRange.start, end: customDateRange.end });
    }
    const preset = quickRanges.find((entry) => entry.key === rangeKey);
    const base = preset?.get();
    return base ?? null;
  }, [rangeKey, customDateRange]);

  const teamMembers = useMemo<TeamMember[]>(() => {
    if (!teamData || teamData.length === 0) return [];
    return teamData
      .map((record) => {
        const display = mapNameIfNeeded(displayName(record));
        const initialsRaw = (record['Initials'] || '').trim();
        const initials = initialsRaw || getInitials(display);
        const normalizedName = normalizeName(display);
        const role = record['Role']?.trim();
        const status = (record.status || '').toLowerCase();
        const email = record['Email']?.trim();
        return {
          initials,
          display,
          role,
          isActive: status !== 'inactive',
          record,
          email,
          normalizedName,
        } satisfies TeamMember;
      })
  .filter((member) => Boolean(member.initials) && member.initials !== '?')
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [teamData]);

  const enrichedEnquiries = useMemo<EnrichedEnquiry[]>(() => {
    const list = enquiries || [];
    if (list.length === 0) return [];

    const byNormalizedName = new Map<string, TeamMember>();
    const byInitials = new Map<string, TeamMember>();

    teamMembers.forEach((member) => {
      if (member.normalizedName) {
        byNormalizedName.set(member.normalizedName, member);
      }
      byInitials.set(member.initials.toLowerCase(), member);
      if (member.email) {
        const local = member.email.split('@')[0] || '';
        const normalizedLocal = normalizeName(local);
        if (normalizedLocal) {
          byNormalizedName.set(normalizedLocal, member);
        }
      }
    });

    return list.map((enquiry) => {
      const candidate = (enquiry.Point_of_Contact || (enquiry as any).poc || (enquiry as any).pocname || '').trim();
      const mapped = mapNameIfNeeded(candidate);
      const normalized = normalizeName(mapped);
      let member = normalized ? byNormalizedName.get(normalized) : undefined;

      if (!member && mapped) {
        const initials = getInitials(mapped).toLowerCase();
        if (initials) {
          member = byInitials.get(initials);
        }
      }

      if (!member) {
        const taker = (enquiry.Call_Taker || (enquiry as any).call_taker || '').trim();
        const takerNormalized = normalizeName(mapNameIfNeeded(taker));
        if (takerNormalized) {
          member = byNormalizedName.get(takerNormalized) ?? byInitials.get(getInitials(taker).toLowerCase());
        }
      }

      return { enquiry, member };
    });
  }, [enquiries, teamMembers]);

  // Bespoke: local cross-reference map to drive migration indicator without changing global data
  const migrationOverrides = useMemo(() => {
    const overrides = new Map<string, { status: 'migrated' | 'partial' | 'not-migrated' | 'sync-pending' | 'instructions-only' | 'unknown'; instructionsId?: number; matchScore?: number }>();

    // Prefer server-provided union of enquiries if available (richer), else fall back to prop
    const global = (window as any)?.migrationData;
    const all: any[] = Array.isArray(global?.allEnquiries) ? global.allEnquiries : (Array.isArray(enquiries) ? enquiries as any[] : []);
    if (!all || all.length === 0) return overrides;

    // Heuristic partition of legacy vs new records
    const oldArr: OldEnquiry[] = [];
    const newArr: NewEnquiry[] = [];
    for (const x of all) {
      const hasLegacyShape = typeof x?.ID !== 'undefined' || typeof x?.Date_Created !== 'undefined' || typeof x?.Point_of_Contact !== 'undefined';
      const hasNewShape = typeof x?.id !== 'undefined' || typeof x?.datetime !== 'undefined' || typeof x?.poc !== 'undefined';
      if (hasLegacyShape && !hasNewShape) {
        oldArr.push({
          ID: String(x.ID ?? ''),
          Date_Created: String(x.Date_Created ?? x.Touchpoint_Date ?? ''),
          Email: String(x.Email ?? ''),
          First_Name: String(x.First_Name ?? x.first ?? ''),
          Last_Name: String(x.Last_Name ?? x.last ?? ''),
          Company: x.Company,
          Point_of_Contact: String(x.Point_of_Contact ?? ''),
          Matter_Ref: x.Matter_Ref,
        });
      } else if (hasNewShape) {
        newArr.push({
          id: Number(x.id ?? 0),
          datetime: String(x.datetime ?? x.Date_Created ?? x.Touchpoint_Date ?? ''),
          first: String(x.first ?? x.First_Name ?? ''),
          last: String(x.last ?? x.Last_Name ?? ''),
          email: String(x.email ?? x.Email ?? ''),
          poc: String(x.poc ?? x.Point_of_Contact ?? ''),
          stage: x.stage,
          claim: x.claim,
        });
      }
    }

    if (oldArr.length === 0 || newArr.length === 0) return overrides;

    // Build overrides by best match
    for (const oldItem of oldArr) {
      const match = findMatches(oldItem, newArr);
      if (match.migrationStatus === 'migrated' || match.migrationStatus === 'partial' || match.migrationStatus === 'sync-pending') {
        overrides.set(oldItem.ID, {
          status: match.migrationStatus,
          instructionsId: match.newId,
          matchScore: match.matchScore,
        });
      } else {
        overrides.set(oldItem.ID, { status: 'not-migrated' });
      }
    }

    return overrides;
  }, [enquiries]);

  // Calculate actual date range from available data
  const dataDateRange = useMemo(() => {
    if (!enquiries || enquiries.length === 0) return null;
    
    const dates = enquiries
      .map(e => parseDate((e as any).Touchpoint_Date))
      .filter(d => d !== null) as Date[];
    
    if (dates.length === 0) return null;
    
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    
    return { earliest, latest };
  }, [enquiries]);

  // Debug: Check what data we're receiving
  React.useEffect(() => {
    console.log('[EnquiriesReport] Received enquiries:', {
      isNull: enquiries === null,
      isArray: Array.isArray(enquiries),
      length: Array.isArray(enquiries) ? enquiries.length : 0,
      sample: Array.isArray(enquiries) && enquiries.length > 0 ? enquiries[0] : null
    });
  }, [enquiries]);

  const filteredEntries = useMemo(() => {
    return enrichedEnquiries.filter(({ enquiry, member }) => {
      if (range) {
        const date = parseDate((enquiry as any).Touchpoint_Date || (enquiry as any).Date_Created);
        if (!date || !isWithin(date, range.start, range.end)) {
          return false;
        }
      }

      if (selectedTeams.size > 0) {
        const memberInitials = member?.initials;
        if (!memberInitials || !selectedTeams.has(memberInitials)) {
          return false;
        }
      }

      if (selectedRoles.size > 0) {
        const memberRole = member?.role?.trim();
        if (!memberRole || !selectedRoles.has(memberRole)) {
          return false;
        }
      }

      // Source filter
      if (sourceFilter) {
        const enquirySource = getNormalizedEnquirySourceLabel(enquiry);
        if (enquirySource !== sourceFilter) {
          return false;
        }
      }

      // MOC filter
      if (mocFilter) {
        const enquiryMOC = getNormalizedEnquiryMOCLabel(enquiry);
        if (enquiryMOC !== mocFilter) {
          return false;
        }
      }

      // POC filter
      if (pocFilter) {
        const poc = toStr(enquiry.Point_of_Contact || (enquiry as any).point_of_contact).trim();
        if (poc !== pocFilter) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedEnquiries, range, selectedRoles, selectedTeams, sourceFilter, mocFilter, pocFilter]);

  const filtered = useMemo(() => filteredEntries.map((entry) => entry.enquiry), [filteredEntries]);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredEntries.forEach(({ member }) => {
      if (member) {
        counts.set(member.initials, (counts.get(member.initials) || 0) + 1);
      }
    });
    return counts;
  }, [filteredEntries]);

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredEntries.forEach(({ member }) => {
      const roleKey = member?.role?.trim();
      if (!roleKey) return;
      counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
    });
    return counts;
  }, [filteredEntries]);

  const lastRefreshLabel = useMemo(() => formatTimeAgo(lastRefreshTimestamp), [lastRefreshTimestamp]);
  const showCustomPickers = rangeKey === 'custom';
  const customStartValue = customDateRange?.start ?? null;
  const customEndValue = customDateRange?.end ?? null;
  const displayRangeStart = range?.start ?? (showCustomPickers ? customStartValue : null);
  const displayRangeEnd = range?.end ?? (showCustomPickers ? customEndValue : null);
  const fromLabel = rangeKey === 'all'
    ? 'All time'
    : displayRangeStart
      ? formatDateTag(displayRangeStart)
      : 'Select start';
  const toLabel = rangeKey === 'all'
    ? 'Latest'
    : displayRangeEnd
      ? formatDateTag(displayRangeEnd)
      : 'Select end';
  const currentRangeLabel = rangeKey === 'custom'
    ? 'Custom'
    : quickRanges.find((entry) => entry.key === rangeKey)?.label ?? 'All';

  const stats = useMemo(() => {
    const total = filtered.length;
    const bySource = new Map<string, number>();
    const byMOC = new Map<string, number>();
    const byPoc = new Map<string, number>();
    let claimed = 0;
    let unclaimed = 0;

    const getSource = (e: any): string => getNormalizedEnquirySourceLabel(e);
    const getMOC = (e: any): string => getNormalizedEnquiryMOCLabel(e);

    const isClaimed = (pocRaw: string): boolean => {
      const v = pocRaw.toLowerCase();
      if (!v) return false;
      // Treat team inbox and placeholders as unclaimed
      if (v === 'team@helix-law.com' || v === 'team' || v === 'anyone' || v === 'unassigned' || v === 'unknown' || v === 'n/a') return false;
      // Triaged are not considered claimed
      if (isTriagedPoc(v)) return false;
      return true;
    };

    filtered.forEach((e: any) => {
      const src = getSource(e);
      const moc = getMOC(e);
      bySource.set(src, (bySource.get(src) || 0) + 1);
      byMOC.set(moc, (byMOC.get(moc) || 0) + 1);

      const pocRaw = getPocRaw(e);
      const claimedFlag = isClaimed(pocRaw);
      let pocKey: string;
      if (claimedFlag) pocKey = pocRaw;
      else if (isTriagedPoc(pocRaw)) pocKey = 'Triaged';
      else pocKey = 'Unassigned';
      byPoc.set(pocKey, (byPoc.get(pocKey) || 0) + 1);
      if (claimedFlag) claimed++; else unclaimed++;
    });
    const wdRaw = range ? workingDaysBetween(range.start, range.end) : workingDaysBetween(new Date(2000,0,1), new Date());
    const wdForRate = Math.max(1, wdRaw); // avoid divide-by-zero; do not alter displayed badge count
    const perDay = total / wdForRate;
    return { total, perDay, bySource, byMOC, byPoc, workingDays: wdRaw, claimed, unclaimed };
  }, [filtered, range]);

  const workingDaysLabel = range
    ? `${stats.workingDays} working days in selected range`
    : 'All data (working days not applicable)';

  // Group recent enquiries by day for progressive loading (timeline style)
  const dayGroups = useMemo(() => {
    const groupsMap = new Map<string, any[]>();
    for (const e of filtered) {
      const d0 = parseDate((e as any).Touchpoint_Date);
      if (!d0 || isNaN(d0.getTime())) continue;
      const y = d0.getFullYear();
      const m = String(d0.getMonth() + 1).padStart(2, '0');
      const day = String(d0.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const arr = groupsMap.get(key) || [];
      arr.push(e);
      groupsMap.set(key, arr);
    }
    return Array.from(groupsMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ date, items }));
  }, [filtered]);
  // Infinite scroll over date groups
  const [visibleGroupCount, setVisibleGroupCount] = useState<number>(3);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    setVisibleGroupCount(3);
  }, [rangeKey, dayGroups.length]);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting) {
        setVisibleGroupCount((n) => Math.min(dayGroups.length, n + 3));
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [dayGroups.length]);

  const topSources = useMemo(() => Array.from(stats.bySource.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6), [stats.bySource]);
  const topMOCs = useMemo(() => Array.from(stats.byMOC.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6), [stats.byMOC]);
  const topPocs = useMemo(() => Array.from(stats.byPoc.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10), [stats.byPoc]);
  
  // Pie chart data
  const sourcesPieData: PieChartData[] = useMemo(() => 
    topSources.map(([name, value], index) => ({
      name,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length]
    })), [topSources]);
    
  const mocsPieData: PieChartData[] = useMemo(() => 
    topMOCs.map(([name, value], index) => ({
      name,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length]
    })), [topMOCs]);
    
  const pocsPieData: PieChartData[] = useMemo(() => 
    topPocs.map(([name, value], index) => ({
      name,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length]
    })), [topPocs]);

  // Line chart data - dynamic aggregation based on time range
  const lineChartData = useMemo(() => {
    if (!filtered || filtered.length === 0) return [];
    
    // Determine aggregation level based on rangeKey
    const getAggregationConfig = (range: RangeKey) => {
      // Calculate actual date span for the filtered data
      const getActualDateSpan = () => {
        if (!filtered || filtered.length === 0) return 0;
        
        const dates = filtered
          .map(e => parseDate(e.Date_Created))
          .filter(Boolean)
          .sort((a, b) => a!.getTime() - b!.getTime());
          
        if (dates.length < 2) return 0;
        
        const startDate = dates[0]!;
        const endDate = dates[dates.length - 1]!;
        return Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      };
      
      const actualDays = getActualDateSpan();
      
      switch (range) {
        case 'today':
        case 'yesterday':
        case 'week':
        case 'lastWeek':
        case 'month':
        case 'lastMonth':
          return { level: 'daily', format: { day: '2-digit', month: 'short' } as const };
        case 'last90Days':
          // If actual span is less than 14 days, use daily
          return actualDays < 14 
            ? { level: 'daily', format: { day: '2-digit', month: 'short' } as const }
            : { level: 'weekly', format: { day: '2-digit', month: 'short' } as const };
        case 'quarter':
          // If actual span is less than 14 days, use daily aggregation
          return actualDays < 14 
            ? { level: 'daily', format: { day: '2-digit', month: 'short' } as const }
            : { level: 'weekly', format: { day: '2-digit', month: 'short' } as const };
        case 'yearToDate':
        case 'year':
          // If actual span is less than 14 days, use daily
          return actualDays < 14 
            ? { level: 'daily', format: { day: '2-digit', month: 'short' } as const }
            : { level: 'monthly', format: { month: 'short', year: '2-digit' } as const };
        case 'custom':
          // For custom ranges, determine based on date span
          if (customDateRange?.start && customDateRange?.end) {
            const daysDiff = Math.abs(customDateRange.end.getTime() - customDateRange.start.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff < 14) return { level: 'daily', format: { day: '2-digit', month: 'short' } as const };
            if (daysDiff <= 90) return { level: 'weekly', format: { day: '2-digit', month: 'short' } as const };
            return { level: 'monthly', format: { month: 'short', year: '2-digit' } as const };
          }
          return { level: 'daily', format: { day: '2-digit', month: 'short' } as const };
        default:
          return { level: 'daily', format: { day: '2-digit', month: 'short' } as const };
      }
    };

    const { level, format } = getAggregationConfig(rangeKey);
    
    // Group enquiries by aggregation level
    const aggregatedGroups = new Map<string, { count: number; startDate: Date; endDate: Date; isWeekend?: boolean }>();
    
    filtered.forEach(enquiry => {
      const createdDate = parseDate(enquiry.Date_Created);
      if (!createdDate) return;
      
      let aggregationKey: string;
      let startDate: Date;
      let endDate: Date;
      let isWeekend = false;
      
      if (level === 'daily') {
        aggregationKey = createdDate.toISOString().split('T')[0];
        startDate = endDate = new Date(createdDate);
        const dayOfWeek = createdDate.getDay();
        isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      } else if (level === 'weekly') {
        // Get start of week (Monday)
        const monday = new Date(createdDate);
        monday.setDate(createdDate.getDate() - ((createdDate.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        aggregationKey = monday.toISOString().split('T')[0];
        startDate = monday;
        endDate = sunday;
      } else { // monthly
        const firstDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), 1);
        const lastDay = new Date(createdDate.getFullYear(), createdDate.getMonth() + 1, 0);
        
        aggregationKey = `${createdDate.getFullYear()}-${(createdDate.getMonth() + 1).toString().padStart(2, '0')}`;
        startDate = firstDay;
        endDate = lastDay;
      }
      
      const existing = aggregatedGroups.get(aggregationKey);
      aggregatedGroups.set(aggregationKey, {
        count: (existing?.count || 0) + 1,
        startDate: existing?.startDate || startDate,
        endDate: existing?.endDate || endDate,
        isWeekend: level === 'daily' ? isWeekend : undefined
      });
    });
    
    // Convert to chart data format
    const chartData = Array.from(aggregatedGroups.entries())
      .map(([key, data]) => {
        let formattedDate: string;
        
        if (level === 'daily') {
          formattedDate = data.startDate.toLocaleDateString('en-GB', format);
        } else if (level === 'weekly') {
          const startFormatted = data.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const endFormatted = data.endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          formattedDate = `${startFormatted} - ${endFormatted}`;
        } else {
          formattedDate = data.startDate.toLocaleDateString('en-GB', format);
        }
        
        return {
          date: key,
          count: data.count,
          formattedDate,
          isWeekend: data.isWeekend,
          aggregationLevel: level,
          startDate: data.startDate,
          endDate: data.endDate
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return chartData;
  }, [filtered, rangeKey, customDateRange]);

  // Function to check if a team member is on annual leave for a specific date
  const isOnAnnualLeave = useCallback((memberInitials: string, checkDate: string): boolean => {
    if (!annualLeave) return false;
    
    const checkDateObj = new Date(checkDate);
    const memberLeave = annualLeave.filter(record => 
      record.fe === memberInitials || 
      record.fe?.toLowerCase().includes(memberInitials.toLowerCase())
    );
    
    return memberLeave.some(record => {
      const startDate = new Date(record.start_date);
      const endDate = new Date(record.end_date);
      return checkDateObj >= startDate && checkDateObj <= endDate;
    });
  }, [annualLeave]);

  // Daily summary calculations for collapsible sections
  const dailySummaries = useMemo(() => {
    const summaries = new Map<string, {
      unclaimed: number;
      claimed: number;
      triaged: number;
      topClaimers: Array<{ initials: string; count: number; display: string }>;
      nonClaimers: Array<{ initials: string; display: string; onLeave: boolean }>;
      totalEnquiries: number;
    }>();

    // Get all active team members for non-claimer analysis
    const activeTeamMembers = teamMembers.filter((member: TeamMember) => member.isActive);

    dayGroups.forEach(({ date, items }) => {
      let unclaimed = 0;
      let claimed = 0;
      let triaged = 0;
      const claimerCounts = new Map<string, { count: number; display: string }>();

      // Analyze each enquiry in the day
      items.forEach((enquiry: any) => {
        const poc = enquiry.Point_of_Contact?.trim();
        const status = enquiry.Status?.toLowerCase();
        const callTaker = enquiry.Call_Taker?.trim();

        // Count as triaged if it has a clear status indicating processing
        if (status && ['completed', 'closed', 'resolved', 'triaged', 'processed'].includes(status)) {
          triaged++;
        }

        // Count as claimed if assigned to someone (POC or Call Taker)
        if (poc || callTaker) {
          claimed++;
          
          // Track who claimed it (prefer POC over Call Taker)
          const claimer = poc || callTaker;
          if (claimer) {
            const initials = getInitials(claimer);
            const member = teamMembers.find((m: TeamMember) => 
              m.initials === initials || 
              m.email?.toLowerCase() === claimer.toLowerCase() ||
              m.normalizedName.includes(claimer.toLowerCase())
            );
            
            if (member) {
              const existing = claimerCounts.get(member.initials) || { count: 0, display: member.display };
              claimerCounts.set(member.initials, { 
                count: existing.count + 1, 
                display: member.display 
              });
            }
          }
        } else {
          unclaimed++;
        }
      });

      // Get top 3 claimers for this day
      const topClaimers = Array.from(claimerCounts.entries())
        .map(([initials, data]) => ({ initials, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // Find non-claimers (active team members who didn't claim any enquiries)
      const claimerInitials = new Set(claimerCounts.keys());
      const nonClaimers = activeTeamMembers
        .filter((member: TeamMember) => !claimerInitials.has(member.initials))
        .map((member: TeamMember) => ({
          initials: member.initials,
          display: member.display,
          onLeave: isOnAnnualLeave(member.initials, date)
        }));

      summaries.set(date, {
        unclaimed,
        claimed,
        triaged,
        topClaimers,
        nonClaimers,
        totalEnquiries: items.length
      });
    });

    return summaries;
  }, [dayGroups, teamMembers]);

  // Function to toggle day collapse state
  const toggleDayCollapse = useCallback((date: string) => {
    setCollapsedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  }, []);

  // Hover highlight for fee earner within a day group
  const [hoverHighlight, setHoverHighlight] = useState<{ date: string; poc: string } | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [dayFilters, setDayFilters] = useState<Record<string, { name: string; poc: string; taker: string; status: string }>>({});
  
  // Collapsible day sections - track which days are collapsed (default: all collapsed)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Initialize all days as collapsed by default
  const initializeCollapsedDays = useCallback(() => {
    const allDays = new Set<string>();
    dayGroups.forEach(group => {
      allDays.add(group.date);
    });
    setCollapsedDays(allDays);
  }, [dayGroups]);

  // Initialize collapsed state when dayGroups change
  useEffect(() => {
    initializeCollapsedDays();
  }, [initializeCollapsedDays]);

  // Migration modal state (bespoke, report-local)
  type DraftEnquiry = {
    aow: string;
    moc: string;
    first: string;
    last: string;
    email: string;
    phone?: string;
    notes?: string;
    tow?: string;
    rep?: string;
    poc?: string;
    value?: string;
    rating?: string;
    rank?: string;
    contact_referrer?: string;
    company_referrer?: string;
    gclid?: string;
    source?: string;
    url?: string;
    // Missing fields from new schema
    stage?: string;
    claim?: string; // datetime as string
    pitch?: string; // int as string for form input
    acid?: string;
    card_id?: string;
  };
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [migrationLegacy, setMigrationLegacy] = useState<any | null>(null);
  const [migrationDraft, setMigrationDraft] = useState<DraftEnquiry | null>(null);
  const [migrationSubmitting, setMigrationSubmitting] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [manualMigrationOverrides, setManualMigrationOverrides] = useState<Map<string, { status: 'migrated' | 'partial' | 'not-migrated'; instructionsId?: number }>>(new Map());

  const buildDraftFromLegacy = useCallback((raw: any): DraftEnquiry => {
    const pick = (obj: any, keys: string[]): string => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v != null && String(v).trim().length > 0) return String(v).trim();
      }
      return '';
    };

    // Clean up Source vs Method of Contact confusion
    const cleanSourceAndMOC = (rawSource: string, rawMOC: string) => {
      const source = rawSource?.toLowerCase() || '';
      const moc = rawMOC?.toLowerCase() || '';
      
      // Define pure marketing sources
      const marketingSources = [
        'organic search', 'google ads', 'facebook lead ads', 'facebook ads',
        'linkedin ads', 'instagram ads', 'youtube ads', 'bing ads',
        'referral', 'direct', 'social media', 'email marketing',
        'seo', 'ppc', 'affiliate', 'partnership'
      ];
      
      // Define pure contact methods
      const contactMethods = [
        'phone call', 'phone', 'telephone', 'call',
        'email', 'website form', 'contact form', 'online form',
        'live chat', 'chatgpt', 'chat', 'in-person', 'walk-in'
      ];
      
      // If source looks like a contact method, move it to MOC
      let cleanedSource = source;
      let cleanedMOC = moc;
      
      if (contactMethods.some(method => source.includes(method))) {
        cleanedMOC = source;
        cleanedSource = moc || 'direct';
      }
      
      // Handle website form specifically (could be both)
      if (source.includes('website form') || source.includes('contact form')) {
        cleanedMOC = 'website form';
        cleanedSource = cleanedSource.replace(/website form|contact form/gi, '').trim() || 'direct';
      }
      
      // Handle ChatGPT specifically
      if (source.includes('chatgpt') || source.includes('chat')) {
        cleanedMOC = 'live chat';
        cleanedSource = cleanedSource.replace(/chatgpt|chat/gi, '').trim() || 'direct';
      }
      
      // Default fallbacks
      if (!cleanedSource) cleanedSource = 'direct';
      if (!cleanedMOC) cleanedMOC = 'website form';
      
      return {
        source: cleanedSource,
        moc: cleanedMOC
      };
    };

    const rawSource = pick(raw, ['Ultimate_Source', 'source', 'Source']);
    const rawMOC = pick(raw, ['Method_of_Contact', 'moc', 'Method', 'Channel']);
    const { source, moc } = cleanSourceAndMOC(rawSource, rawMOC);
    
    const aow = pick(raw, ['Area_of_Work', 'aow', 'Service', 'Area', 'Practice']);
    const first = pick(raw, ['First_Name', 'first', 'First']);
    const last = pick(raw, ['Last_Name', 'last', 'Last']);
    const email = pick(raw, ['Email', 'email', 'Email_Address']);
    const phone = pick(raw, ['Phone_Number', 'Secondary_Phone', 'Phone', 'Telephone', 'phone', 'tel']);
    const notes = pick(raw, ['Initial_first_call_notes', 'Notes', 'Description', 'Message', 'notes']);
    const tow = pick(raw, ['Type_of_Work', 'tow']);
    const rep = pick(raw, ['Call_Taker', 'rep']);
    const poc = pick(raw, ['Point_of_Contact', 'poc']);
    const value = pick(raw, ['Value', 'value']);
    const rating = pick(raw, ['Rating', 'rating']);
    const rank = pick(raw, ['Gift_Rank', 'rank']);
    const contact_referrer = pick(raw, ['Contact_Referrer', 'contact_referrer']);
    const company_referrer = pick(raw, ['Referring_Company', 'company_referrer']);
    const gclid = pick(raw, ['GCLID', 'gclid']);
    const url = pick(raw, ['Referral_URL', 'Website', 'url']);
    
    // Extract missing fields
    const stage = pick(raw, ['Stage', 'status', 'stage']) || 'pending'; // default stage
    const claim = pick(raw, ['Claim_Date', 'claim']); // datetime field
    const pitch = pick(raw, ['Pitch', 'pitch']) || '0'; // int field
    const acid = pick(raw, ['ID', 'id', 'ACID', 'acid']); // Legacy ID maps to acid
    const card_id = pick(raw, ['Card_ID', 'card_id', 'CardID']);
    
    // Enhance notes with additional legacy data that doesn't have direct mapping
    let enhancedNotes = notes;
    const additionalInfo = [];
    
    // Add data cleaning info if source/MOC were corrected
    if (rawSource !== source || rawMOC !== moc) {
      additionalInfo.push(`Data cleaned: Original Source="${rawSource}", Original MOC="${rawMOC}"`);
    }
    
    // Add company/title if present
    if (raw.Company) additionalInfo.push(`Company: ${raw.Company}`);
    if (raw.Title) additionalInfo.push(`Title: ${raw.Title}`);
    if (raw.Website && !url) additionalInfo.push(`Website: ${raw.Website}`);
    
    // Add address information if present
    const addressParts = [
      raw.Unit_Building_Name_or_Number,
      raw.Mailing_Street,
      raw.Mailing_Street_2,
      raw.Mailing_Street_3,
      raw.City,
      raw.Mailing_County,
      raw.Postal_Code,
      raw.Country
    ].filter(Boolean);
    if (addressParts.length > 0) {
      additionalInfo.push(`Address: ${addressParts.join(', ')}`);
    }
    
    // Add marketing/campaign info if present
    if (raw.Campaign) additionalInfo.push(`Campaign: ${raw.Campaign}`);
    if (raw.Ad_Group) additionalInfo.push(`Ad Group: ${raw.Ad_Group}`);
    if (raw.Search_Keyword) additionalInfo.push(`Keywords: ${raw.Search_Keyword}`);
    if (raw.Tags) additionalInfo.push(`Tags: ${raw.Tags}`);
    if (raw.Do_not_Market) additionalInfo.push(`Do Not Market: ${raw.Do_not_Market}`);
    if (raw.DOB) additionalInfo.push(`DOB: ${raw.DOB}`);
    if (raw.Matter_Ref) additionalInfo.push(`Matter Ref: ${raw.Matter_Ref}`);
    
    if (additionalInfo.length > 0) {
      enhancedNotes = enhancedNotes ? 
        `${enhancedNotes}\n\n--- Legacy Data ---\n${additionalInfo.join('\n')}` :
        `--- Legacy Data ---\n${additionalInfo.join('\n')}`;
    }
    
    return { 
      aow, moc, first, last, email, phone, 
      notes: enhancedNotes, tow, rep, poc, value, rating, rank,
      contact_referrer, company_referrer, gclid, source, url,
      stage, claim, pitch, acid, card_id
    };
  }, []);

  const openMigrationModal = useCallback((legacy: any) => {
    setMigrationLegacy(legacy);
    setMigrationDraft(buildDraftFromLegacy(legacy));
    setMigrationError(null);
    setMigrationModalOpen(true);
  }, [buildDraftFromLegacy]);

  const closeMigrationModal = useCallback(() => {
    setMigrationModalOpen(false);
    setMigrationLegacy(null);
    setMigrationDraft(null);
    setMigrationSubmitting(false);
    setMigrationError(null);
  }, []);

  const submitMigration = useCallback(async () => {
    if (!migrationDraft) return;
    setMigrationSubmitting(true);
    setMigrationError(null);
    try {
      const resp = await fetch('/processEnquiry?source=migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(migrationDraft),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `HTTP ${resp.status}`);
      }
      // Mark as migrated locally for immediate feedback
      const legacyId = migrationLegacy?.ID ? String(migrationLegacy.ID) : undefined;
      if (legacyId) {
        setManualMigrationOverrides((prev) => {
          const next = new Map(prev);
          next.set(legacyId, { status: 'migrated' });
          return next;
        });
      }
      closeMigrationModal();
    } catch (e: any) {
      setMigrationError(e?.message ? String(e.message) : 'Migration failed');
    } finally {
      setMigrationSubmitting(false);
    }
  }, [migrationDraft, migrationLegacy, closeMigrationModal]);

  // Role and team filters
  const handleRoleToggle = (role: string) => {
    const updated = new Set(selectedRoles);
    if (updated.has(role)) updated.delete(role);
    else updated.add(role);
    setSelectedRoles(updated);
  };

  const handleTeamToggle = (team: string) => {
    const updated = new Set(selectedTeams);
    if (updated.has(team)) updated.delete(team);
    else updated.add(team);
    setSelectedTeams(updated);
  };

  const updateDayFilter = useCallback((date: string, key: 'name' | 'poc' | 'taker' | 'status', value: string) => {
    setDayFilters((prev) => {
      const current = prev[date] ?? EMPTY_DAY_FILTER;
      const next = { ...current, [key]: value };
      const hasAny = Object.values(next).some((v) => v.trim().length > 0);
      if (!hasAny) {
        const { [date]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [date]: next };
    });
  }, []);

  const handleRangeSelect = (key: RangeKey) => {
    if (key === 'custom') {
      setCustomDateRange((prev) => {
        if (prev && prev.start && prev.end) {
          return prev;
        }
        const fallbackStart = range ? new Date(range.start) : new Date();
        const fallbackEnd = range ? new Date(range.end) : new Date();
        return { start: fallbackStart, end: fallbackEnd };
      });
    } else {
      setCustomDateRange(null);
    }
    setRangeKey(key);
  };

  // Helper for range button active state
  const isActive = (key: string) => rangeKey === key;

  const handleCustomDateChange = (position: 'start' | 'end') => (date?: Date | null) => {
    setCustomDateRange((prev) => {
      const next = prev ? { ...prev } : { start: null as Date | null, end: null as Date | null };
      next[position] = date ? new Date(date) : null;
      return next;
    });
    setRangeKey('custom');
  };

  const handleClearTeams = () => {
    setSelectedTeams(new Set());
  };

  const handleClearRoles = () => {
    setSelectedRoles(new Set());
  };

  // Refresh data manually
  const handleRefresh = () => {
    if (triggerRefresh) {
      triggerRefresh();
      setTimeElapsed(0); // Reset timer on manual refresh
    }
  };

  // Reassignment functionality
  const teamMemberOptions = useMemo(() => {
    return teamMembers
      .filter(member => member.isActive)
      .map(member => ({
        value: member.email || member.display,
        text: `${member.display} (${member.initials})`,
        initials: member.initials,
        email: member.email
      }));
  }, [teamMembers]);

  const handleReassignClick = useCallback((enquiryId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setReassignmentDropdown({
      enquiryId,
      x: rect.left,
      y: rect.bottom + 5
    });
  }, []);

  const handleReassignmentSelect = useCallback(async (selectedValue: string) => {
    if (!selectedValue || !reassignmentDropdown) return;
    
    const selectedOption = teamMemberOptions.find(option => option.value === selectedValue);
    if (!selectedOption) return;
    
    setIsReassigning(true);
    setReassignmentMessage(null);
    
    try {
      const response = await fetch('/api/updateEnquiryPOC', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ID: reassignmentDropdown.enquiryId,
          Point_of_Contact: selectedValue
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setReassignmentMessage({ 
          type: 'success', 
          text: `Successfully reassigned to ${selectedOption.text}` 
        });
        
        // Update the local data to reflect the change immediately
        if (triggerRefresh) {
          setTimeout(() => triggerRefresh(), 500); // Small delay to allow DB update
        }
      } else {
        throw new Error(result.message || 'Failed to reassign enquiry');
      }
    } catch (error) {
      console.error('Error reassigning enquiry:', error);
      setReassignmentMessage({ 
        type: 'error', 
        text: `Failed to reassign: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    } finally {
      setIsReassigning(false);
      setReassignmentDropdown(null);
      
      // Clear message after 3 seconds
      setTimeout(() => setReassignmentMessage(null), 3000);
    }
  }, [reassignmentDropdown, triggerRefresh, teamMemberOptions]);

  const closeReassignmentDropdown = useCallback(() => {
    setReassignmentDropdown(null);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reassignmentDropdown) {
        const target = event.target as Element;
        if (!target.closest('.reassignment-dropdown')) {
          closeReassignmentDropdown();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reassignmentDropdown, closeReassignmentDropdown]);

  return (
    <div style={containerStyle(isDarkMode)}>
      {/* Active Filters Indicator */}
      {(sourceFilter || mocFilter || pocFilter) && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          backgroundColor: isDarkMode ? 'rgba(135, 206, 255, 0.1)' : 'rgba(54, 144, 206, 0.1)',
          borderLeft: `4px solid ${isDarkMode ? colours.accent : colours.highlight}`,
          borderRadius: '0 8px 8px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '14px',
          color: isDarkMode ? colours.dark.text : colours.light.text
        }}>
          <span style={{ fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight }}>
            Active Filters:
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sourceFilter && (
              <span style={{
                padding: '4px 8px',
                backgroundColor: isDarkMode ? 'rgba(135, 206, 255, 0.2)' : 'rgba(54, 144, 206, 0.2)',
                borderRadius: '4px',
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                cursor: 'pointer'
              }}
              onClick={() => setSourceFilter(null)}
              title="Click to remove filter">
                Source: {sourceFilter} ×
              </span>
            )}
            {mocFilter && (
              <span style={{
                padding: '4px 8px',
                backgroundColor: isDarkMode ? 'rgba(135, 206, 255, 0.2)' : 'rgba(54, 144, 206, 0.2)',
                borderRadius: '4px',
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                cursor: 'pointer'
              }}
              onClick={() => setMocFilter(null)}
              title="Click to remove filter">
                Contact: {mocFilter} ×
              </span>
            )}
            {pocFilter && (
              <span style={{
                padding: '4px 8px',
                backgroundColor: isDarkMode ? 'rgba(135, 206, 255, 0.2)' : 'rgba(54, 144, 206, 0.2)',
                borderRadius: '4px',
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                cursor: 'pointer'
              }}
              onClick={() => setPocFilter(null)}
              title="Click to remove filter">
                Fee Earner: {pocFilter} ×
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSourceFilter(null);
              setMocFilter(null);
              setPocFilter(null);
            }}
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
              borderRadius: '4px',
              color: isDarkMode ? colours.accent : colours.highlight,
              cursor: 'pointer',
              fontSize: '12px'
            }}
            title="Clear all filters"
          >
            Clear All
          </button>
        </div>
      )}
      <div style={surface(isDarkMode)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            {showCustomPickers ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={customStartValue || undefined}
                  onSelectDate={handleCustomDateChange('start')}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={customEndValue || undefined}
                  onSelectDate={handleCustomDateChange('end')}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => handleRangeSelect('custom')}
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
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{fromLabel}</span>
                </button>
                <button
                  type="button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => handleRangeSelect('custom')}
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
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{toLabel}</span>
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${isFetching ? (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)') : getRefreshIndicatorColor()}`,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                  transition: 'border-color 1s ease',
                }}
                title={
                  isFetching 
                    ? 'Refreshing data...' 
                    : `Next auto-refresh in ${Math.floor((15 * 60 - timeElapsed) / 60)}m ${(15 * 60 - timeElapsed) % 60}s`
                }
              >
                {isFetching ? (
                  <>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(13, 47, 96, 0.5)',
                    }} />
                    Refreshing
                  </>
                ) : (
                  <>
                    <div 
                      style={{ 
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: getRefreshIndicatorColor(),
                        transition: 'background 1s ease',
                      }}
                    />
                    {lastRefreshLabel}
                  </>
                )}
              </div>

              {triggerRefresh && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                    cursor: isFetching ? 'default' : 'pointer',
                    opacity: isFetching ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  title={isFetching ? 'Refreshing data...' : 'Refresh datasets (auto-refreshes every 15 min)'}
                  aria-label={isFetching ? 'Refreshing data' : 'Refresh datasets'}
                  onMouseEnter={(e) => {
                    if (!isFetching) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isFetching) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                    }
                  }}
                >
                  <Icon 
                    iconName="Refresh" 
                    style={{ 
                      fontSize: 16,
                      animation: isFetching ? 'spin 1s linear infinite' : 'none'
                    }} 
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowRoleFilter(!showRoleFilter)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                  color: showRoleFilter 
                    ? (isDarkMode ? '#60a5fa' : colours.highlight)
                    : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(13, 47, 96, 0.5)'),
                  cursor: 'pointer',
                  transform: showRoleFilter ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'all 0.2s ease',
                }}
                title={showRoleFilter ? 'Hide role filter' : 'Show role filter'}
                aria-label={showRoleFilter ? 'Hide role filter' : 'Show role filter'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = showRoleFilter ? 'translateY(-1px)' : 'translateY(0)';
                  e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                }}
              >
                <Icon iconName="People" style={{ fontSize: 16 }} />
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onMouseEnter={() => setShowDatasetInfo(true)}
                  onMouseLeave={() => setShowDatasetInfo(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                    color: isDarkMode ? '#60a5fa' : colours.highlight,
                    cursor: 'pointer',
                    transform: showDatasetInfo ? 'translateY(-1px)' : 'translateY(0)',
                    transition: 'all 0.2s ease',
                  }}
                  title="Dataset information"
                  aria-label="Dataset information"
                >
                  <Icon iconName="Info" style={{ fontSize: 16 }} />
                </button>

                {showDatasetInfo && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                    borderRadius: 8,
                    boxShadow: isDarkMode ? '0 8px 16px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    width: 240,
                    zIndex: 1000,
                    color: isDarkMode ? '#e2e8f0' : '#334155',
                    textAlign: 'left',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: isDarkMode ? '#60a5fa' : colours.highlight }}>
                      Dataset Information
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ opacity: 0.8 }}>Enquiries:</span>
                        <span style={{ fontWeight: 600 }}>Last 24 months</span>
                      </div>
                    </div>
                    <div style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                      fontSize: 11,
                      opacity: 0.7,
                      fontStyle: 'italic'
                    }}>
                      Data outside this range won't appear in metrics
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {dataDateRange && (
            <div style={{ 
              padding: '8px 12px',
              borderRadius: 8,
              background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(13, 47, 96, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(13, 47, 96, 0.08)'}`,
              fontSize: 12,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(13, 47, 96, 0.75)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12
            }}>
              <span>
                Available data: {dataDateRange.earliest.toLocaleDateString()} to {dataDateRange.latest.toLocaleDateString()} 
                ({enquiries?.length.toLocaleString()} total)
              </span>
              <span>{workingDaysLabel}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {quickRanges.map(r => {
              const active = isActive(r.key);
              return (
                <DefaultButton
                  key={r.key}
                  text={r.label}
                  onClick={() => handleRangeSelect(r.key)}
                  styles={getRangeButtonStyles(isDarkMode, active, false)}
                />
              );
            })}
            {rangeKey !== 'all' && (
              <button
                onClick={() => handleRangeSelect('all')}
                style={clearFilterButtonStyle(isDarkMode)}
                title="Clear date range filter"
              >
                <span style={{ fontSize: 16 }}>×</span>
                Clear
              </button>
            )}
          </div>

          {showRoleFilter && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {ROLE_OPTIONS.map(({ key, label }) => (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRoleToggle(key)}
                    styles={getRoleButtonStyles(isDarkMode, selectedRoles.has(key))}
                  />
                ))}
                {selectedRoles.size > 0 && (
                  <button
                    onClick={handleClearRoles}
                    style={clearFilterButtonStyle(isDarkMode)}
                    title="Clear role filter"
                  >
                    <span style={{ fontSize: 16 }}>×</span>
                    Clear
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {teamMembers
                  .filter((member) => memberCounts.has(member.initials))
                  .map((member) => {
                    const count = memberCounts.get(member.initials) || 0;
                    const isSelected = selectedTeams.has(member.initials);
                    return (
                      <DefaultButton
                        key={member.initials}
                        text={member.initials}
                        onClick={() => handleTeamToggle(member.initials)}
                        title={`${member.display} (${count} enquiries)`}
                        styles={getTeamButtonStyles(isDarkMode, isSelected, count > 0)}
                      />
                    );
                  })}
                {selectedTeams.size > 0 && (
                  <button
                    onClick={handleClearTeams}
                    style={clearFilterButtonStyle(isDarkMode)}
                    title="Clear team filter"
                  >
                    <span style={{ fontSize: 16 }}>×</span>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Reassignment status message */}
        {reassignmentMessage && (
          <MessageBar
            messageBarType={reassignmentMessage.type === 'success' ? MessageBarType.success : MessageBarType.error}
            onDismiss={() => setReassignmentMessage(null)}
            styles={{
              root: {
                marginTop: 12,
                borderRadius: 8,
              }
            }}
          >
            {reassignmentMessage.text}
          </MessageBar>
        )}

        {/* Show data status */}
        {enquiries === null && (
          <div style={{ 
            marginTop: 12, 
            padding: 16, 
            borderRadius: 12, 
            background: isDarkMode ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)',
            border: isDarkMode ? '1px solid rgba(248,113,113,0.28)' : '1px solid rgba(220,38,38,0.18)',
            color: isDarkMode ? '#fda4af' : '#b91c1c',
            fontSize: 14
          }}>
            ⚠️ No enquiry data loaded. Click refresh or check console for errors.
          </div>
        )}
        {enquiries && enquiries.length === 0 && (
          <div style={{ 
            marginTop: 12, 
            padding: 16, 
            borderRadius: 12, 
            background: isDarkMode ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.08)',
            border: isDarkMode ? '1px solid rgba(251,191,36,0.28)' : '1px solid rgba(251,191,36,0.18)',
            color: isDarkMode ? '#fcd34d' : '#d97706',
            fontSize: 14
          }}>
            ℹ️ No enquiries found in database for the last 24 months. Check server logs or database.
          </div>
        )}
        {enquiries && enquiries.length > 0 && filtered.length === 0 && (
          <div style={{ 
            marginTop: 12, 
            padding: 16, 
            borderRadius: 12, 
            background: isDarkMode ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.08)',
            border: isDarkMode ? '1px solid rgba(251,191,36,0.28)' : '1px solid rgba(251,191,36,0.18)',
            color: isDarkMode ? '#fcd34d' : '#d97706',
            fontSize: 14
          }}>
            ℹ️ {enquiries.length} enquiries loaded, but none match the selected date range "{currentRangeLabel}". Try "All" to see all data.
          </div>
        )}

        {/* Dashboard-style stat cards */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
          {/* Total Enquiries */}
          <div style={{
            borderRadius: 12,
            padding: 16,
            background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #141C2C 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
            border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Enquiries</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: isDarkMode ? '#E2E8F0' : colours.missedBlue }}>
              {filtered.length.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>~ {Math.round(stats.perDay)} per working day</div>
          </div>

          {/* Claimed */}
          <div style={{
            borderRadius: 12,
            padding: 16,
            background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #12263A 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
            border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Claimed</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: isDarkMode ? '#E2E8F0' : colours.missedBlue }}>
              {stats.claimed.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
              {filtered.length ? Math.round((stats.claimed / filtered.length) * 100) : 0}% of total
            </div>
          </div>

          {/* Unclaimed */}
          <div style={{
            borderRadius: 12,
            padding: 16,
            background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #2A1B1B 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
            border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Unclaimed</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: isDarkMode ? '#E2E8F0' : colours.missedBlue }}>
              {stats.unclaimed.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
              {filtered.length ? Math.round((stats.unclaimed / filtered.length) * 100) : 0}% of total
            </div>
          </div>
        </div>

        {/* Enquiries Over Time Line Chart */}
        <div style={{
          marginTop: 24,
          borderRadius: 12,
          padding: 20,
          background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #141C2C 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
          border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: 18,
            fontWeight: 700,
            color: isDarkMode ? colours.accent : colours.blue,
          }}>
            Enquiries Over Time
            <span style={{ 
              fontSize: 12, 
              fontWeight: 400, 
              opacity: 0.7, 
              marginLeft: 8 
            }}>
              ({lineChartData[0]?.aggregationLevel === 'daily' ? 'Daily' : 
                lineChartData[0]?.aggregationLevel === 'weekly' ? 'Weekly' : 'Monthly'})
            </span>
          </h3>
          
          {lineChartData.length === 0 ? (
            <div style={{ 
              height: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              opacity: 0.7
            }}>
              No data in selected range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke={isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.1)'} 
                />
                
                {/* Weekend highlighting - only for daily view */}
                {lineChartData[0]?.aggregationLevel === 'daily' && (() => {
                  const weekendBlocks: JSX.Element[] = [];
                  let weekendStart: number | null = null;
                  
                  lineChartData.forEach((dataPoint, index) => {
                    if (dataPoint.isWeekend && weekendStart === null) {
                      // Start of weekend
                      weekendStart = index;
                    } else if (!dataPoint.isWeekend && weekendStart !== null) {
                      // End of weekend
                      weekendBlocks.push(
                        <ReferenceArea
                          key={`weekend-${weekendStart}-${index}`}
                          x1={lineChartData[weekendStart].formattedDate}
                          x2={lineChartData[index - 1].formattedDate}
                          fill={isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'}
                          fillOpacity={1}
                        />
                      );
                      weekendStart = null;
                    }
                  });
                  
                  // Handle case where data ends on a weekend
                  if (weekendStart !== null) {
                    weekendBlocks.push(
                      <ReferenceArea
                        key={`weekend-${weekendStart}-end`}
                        x1={lineChartData[weekendStart].formattedDate}
                        x2={lineChartData[lineChartData.length - 1].formattedDate}
                        fill={isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'}
                        fillOpacity={1}
                      />
                    );
                  }
                  
                  return weekendBlocks;
                })()}
                
                <XAxis 
                  dataKey="formattedDate"
                  stroke={isDarkMode ? colours.dark.text : colours.light.text}
                  fontSize={11}
                  fontFamily="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                  tick={{ fill: isDarkMode ? colours.dark.text : colours.light.text }}
                />
                <YAxis 
                  stroke={isDarkMode ? colours.dark.text : colours.light.text}
                  fontSize={11}
                  fontFamily="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                  tick={{ fill: isDarkMode ? colours.dark.text : colours.light.text }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: '8px',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                  }}
                  labelFormatter={(label: any) => {
                    // Find the data point from the chart data
                    const dataPoint = lineChartData.find(d => d.formattedDate === label);
                    if (!dataPoint) return label;
                    
                    const aggregationLabel = dataPoint.aggregationLevel === 'daily' ? 'Date' :
                                           dataPoint.aggregationLevel === 'weekly' ? 'Week' : 'Month';
                    const weekendLabel = dataPoint.isWeekend ? ' (Weekend)' : '';
                    return `${aggregationLabel}: ${label}${weekendLabel}`;
                  }}
                  formatter={(value: any, name: any) => [value, 'Enquiries']}
                />
                
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke={colours.blue} 
                  strokeWidth={3}
                  connectNulls={false}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    const isDaily = payload?.aggregationLevel === 'daily';
                    const isWeekend = payload?.isWeekend;
                    
                    // Check if this point is part of a weekend transition
                    let isWeekendTransition = false;
                    if (isDaily && typeof index === 'number' && lineChartData[index]) {
                      const currentDate = new Date(lineChartData[index].date);
                      const currentDay = currentDate.getDay();
                      
                      // Check connection to previous point
                      if (index > 0) {
                        const prevDate = new Date(lineChartData[index - 1].date);
                        const prevDay = prevDate.getDay();
                        isWeekendTransition = (prevDay === 5 && currentDay === 6) || (prevDay === 0 && currentDay === 1);
                      }
                      
                      // Check connection to next point
                      if (!isWeekendTransition && index < lineChartData.length - 1) {
                        const nextDate = new Date(lineChartData[index + 1].date);
                        const nextDay = nextDate.getDay();
                        isWeekendTransition = (currentDay === 5 && nextDay === 6) || (currentDay === 0 && nextDay === 1);
                      }
                    }
                    
                    return (
                      <g>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isDaily ? 4 : 5}
                          fill={isDaily && isWeekend ? colours.greyText : colours.blue}
                          stroke={isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground}
                          strokeWidth={2}
                          opacity={isWeekendTransition ? 0.7 : 1}
                        />
                        {/* Add a subtle indicator for weekend transitions */}
                        {isWeekendTransition && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isDaily ? 6 : 7}
                            fill="none"
                            stroke={isDarkMode ? 'rgba(135, 206, 255, 0.3)' : 'rgba(54, 144, 206, 0.3)'}
                            strokeWidth={1}
                            strokeDasharray="2 2"
                          />
                        )}
                      </g>
                    );
                  }}
                  activeDot={{ 
                    r: 6, 
                    fill: colours.accent,
                    stroke: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                    strokeWidth: 2
                  }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Migration Status Summary - Transition Management */}
        {(() => {
          const migrationData = (window as any).migrationData;
          if (!migrationData?.stats) return null;
          
          const { stats } = migrationData;
          return (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, 
              background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.8)',
              border: isDarkMode ? '1px solid rgba(148,163,184,0.15)' : '1px solid rgba(13,47,96,0.08)',
              boxShadow: 'none'
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: isDarkMode ? '#cbd5e1' : '#475569', opacity: 0.8 }}>
                Data Migration Status
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 11 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#86efac' : '#22c55e' }}>
                    {stats.migrated || 0}
                  </div>
                  <div style={{ opacity: 0.6 }}>● Synced</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#fcd34d' : '#d97706' }}>
                    {stats.partial || 0}
                  </div>
                  <div style={{ opacity: 0.6 }}>◐ Partial</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                    {stats.notMigrated || 0}
                  </div>
                  <div style={{ opacity: 0.6 }}>○ Legacy</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#c4b5fd' : '#8b5cf6' }}>
                    {stats.instructionsOnly || 0}
                  </div>
                  <div style={{ opacity: 0.6 }}>● New Only</div>
                </div>
              </div>
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 10, opacity: 0.5 }}>
                Sync Rate: {stats.migrationRate || '0.0%'} • {stats.total || 0} enquiries analyzed
              </div>
            </div>
          );
        })()}
      </div>

      {/* Marketing Metrics Section */}
      {metaMetrics && metaMetrics.length > 0 && (
        <div style={surface(isDarkMode)}>
          <h3 style={sectionTitle()}>Marketing Performance</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: 20, 
            marginTop: 16 
          }}>
            {/* Google Analytics Card */}
            <div style={{
              background: isDarkMode ? 'rgba(66, 165, 245, 0.1)' : 'rgba(66, 165, 245, 0.05)',
              border: `1px solid ${isDarkMode ? 'rgba(66, 165, 245, 0.3)' : 'rgba(66, 165, 245, 0.2)'}`,
              borderRadius: 12,
              padding: 16
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                color: '#42a5f5'
              }}>
                <Icon iconName="BarChart4" style={{ fontSize: 16 }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Google Analytics</span>
              </div>
              {(() => {
                const latest = metaMetrics[metaMetrics.length - 1]?.googleAnalytics;
                if (!latest) return <div style={{ fontSize: 12, opacity: 0.6 }}>No data available</div>;
                
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.sessions.toLocaleString()}
                      </div>
                      <div style={{ opacity: 0.7 }}>Sessions</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.users.toLocaleString()}
                      </div>
                      <div style={{ opacity: 0.7 }}>Users</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.conversions}
                      </div>
                      <div style={{ opacity: 0.7 }}>Conversions</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {(latest.conversionRate * 100).toFixed(1)}%
                      </div>
                      <div style={{ opacity: 0.7 }}>Conv. Rate</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Google Ads Card */}
            <div style={{
              background: isDarkMode ? 'rgba(76, 175, 80, 0.1)' : 'rgba(76, 175, 80, 0.05)',
              border: `1px solid ${isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.2)'}`,
              borderRadius: 12,
              padding: 16
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                color: '#4caf50'
              }}>
                <Icon iconName="Money" style={{ fontSize: 16 }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Google Ads</span>
              </div>
              {(() => {
                const latest = metaMetrics[metaMetrics.length - 1]?.googleAds;
                if (!latest) return <div style={{ fontSize: 12, opacity: 0.6 }}>No data available</div>;
                
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        £{latest.cost.toFixed(0)}
                      </div>
                      <div style={{ opacity: 0.7 }}>Spend</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.clicks.toLocaleString()}
                      </div>
                      <div style={{ opacity: 0.7 }}>Clicks</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.conversions}
                      </div>
                      <div style={{ opacity: 0.7 }}>Conversions</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        £{latest.cpa.toFixed(0)}
                      </div>
                      <div style={{ opacity: 0.7 }}>Cost/Conv</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Meta Ads Card */}
            <div style={{
              background: isDarkMode ? 'rgba(59, 89, 152, 0.1)' : 'rgba(59, 89, 152, 0.05)',
              border: `1px solid ${isDarkMode ? 'rgba(59, 89, 152, 0.3)' : 'rgba(59, 89, 152, 0.2)'}`,
              borderRadius: 12,
              padding: 16
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                color: '#3b5998'
              }}>
                <Icon iconName="People" style={{ fontSize: 16 }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Meta Ads</span>
              </div>
              {(() => {
                const latest = metaMetrics[metaMetrics.length - 1]?.metaAds;
                if (!latest) return <div style={{ fontSize: 12, opacity: 0.6 }}>No data available</div>;
                
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        £{latest.spend.toFixed(0)}
                      </div>
                      <div style={{ opacity: 0.7 }}>Spend</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {(latest.reach / 1000).toFixed(1)}k
                      </div>
                      <div style={{ opacity: 0.7 }}>Reach</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {latest.conversions}
                      </div>
                      <div style={{ opacity: 0.7 }}>Conversions</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        {(latest.ctr * 100).toFixed(1)}%
                      </div>
                      <div style={{ opacity: 0.7 }}>CTR</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div style={grid}>
        <div style={{ gridColumn: 'span 4' }}>
          <div style={surface(isDarkMode)}>
            <h3 style={sectionTitle()}>Top sources</h3>
            <div style={{ 
              display: 'flex', 
              flexDirection: window.innerWidth < 1200 ? 'column' : 'row',
              gap: 20, 
              marginTop: 16 
            }}>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                minHeight: 220
              }}>
                <PieChartComponent 
                  data={sourcesPieData} 
                  title="Top sources" 
                  isDarkMode={isDarkMode}
                  type="source"
                  activeFilter={sourceFilter}
                  onSliceClick={(value) => openModal('source', value)}
                />
              </div>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12, 
                justifyContent: 'center',
                minHeight: 180,
                marginTop: window.innerWidth < 1200 ? 16 : 0,
                transition: 'all 0.3s ease-in-out'
              }}>
                {topSources.map(([name, count], index) => (
                  <div key={name} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`, 
                    padding: '8px 0',
                    fontSize: '14px',
                    opacity: 0,
                    animation: `fadeInUp 0.4s ease-out ${index * 0.1}s forwards`
                  }}>
                    <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{name}</span>
                    <span style={{ 
                      fontWeight: 600,
                      color: colours.blue,
                      minWidth: '40px',
                      textAlign: 'right'
                    }}>{count}</span>
                  </div>
                ))}
                {topSources.length === 0 && (
                  <span style={{ 
                    opacity: 0.7,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    textAlign: 'center',
                    padding: '20px 0'
                  }}>No data in range.</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={{ gridColumn: 'span 4' }}>
          <div style={surface(isDarkMode)}>
            <h3 style={sectionTitle()}>Contact methods</h3>
            <div style={{ 
              display: 'flex', 
              flexDirection: window.innerWidth < 1200 ? 'column' : 'row',
              gap: 20, 
              marginTop: 16 
            }}>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                minHeight: 220
              }}>
                <PieChartComponent 
                  data={mocsPieData} 
                  title="Contact methods" 
                  isDarkMode={isDarkMode}
                  type="moc"
                  activeFilter={mocFilter}
                  onSliceClick={(value) => openModal('moc', value)}
                />
              </div>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12, 
                justifyContent: 'center',
                minHeight: 180,
                marginTop: window.innerWidth < 1200 ? 16 : 0,
                transition: 'all 0.3s ease-in-out'
              }}>
                {topMOCs.map(([name, count], index) => (
                  <div key={name} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`, 
                    padding: '8px 0',
                    fontSize: '14px',
                    opacity: 0,
                    animation: `fadeInUp 0.4s ease-out ${index * 0.1}s forwards`
                  }}>
                    <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{name}</span>
                    <span style={{ 
                      fontWeight: 600,
                      color: colours.blue,
                      minWidth: '40px',
                      textAlign: 'right'
                    }}>{count}</span>
                  </div>
                ))}
                {topMOCs.length === 0 && (
                  <span style={{ 
                    opacity: 0.7,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    textAlign: 'center',
                    padding: '20px 0'
                  }}>No data in range.</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={{ gridColumn: 'span 4' }}>
          <div style={surface(isDarkMode)}>
            <h3 style={sectionTitle()}>By fee earner</h3>
            <div style={{ 
              display: 'flex', 
              flexDirection: window.innerWidth < 1200 ? 'column' : 'row',
              gap: 20, 
              marginTop: 16 
            }}>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                minHeight: 220
              }}>
                <PieChartComponent 
                  data={pocsPieData} 
                  title="By fee earner" 
                  isDarkMode={isDarkMode}
                  type="poc"
                  activeFilter={pocFilter}
                  onSliceClick={(value) => openModal('poc', value)}
                />
              </div>
              <div style={{ 
                flex: window.innerWidth < 1200 ? 'none' : 1,
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12, 
                justifyContent: 'center',
                minHeight: 180,
                marginTop: window.innerWidth < 1200 ? 16 : 0,
                transition: 'all 0.3s ease-in-out'
              }}>
                {topPocs.map(([name, count], index) => (
                  <div key={name} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`, 
                    padding: '8px 0',
                    fontSize: '14px',
                    opacity: 0,
                    animation: `fadeInUp 0.4s ease-out ${index * 0.1}s forwards`
                  }}>
                    <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{name}</span>
                    <span style={{ 
                      fontWeight: 600,
                      color: colours.blue,
                      minWidth: '40px',
                      textAlign: 'right'
                    }}>{count}</span>
                  </div>
                ))}
                {topPocs.length === 0 && (
                  <span style={{ 
                    opacity: 0.7,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    textAlign: 'center',
                    padding: '20px 0'
                  }}>No data in range.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={surface(isDarkMode)}>
        <h3 style={sectionTitle()}>Recent enquiries</h3>
        {dayGroups.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No enquiries in the selected range.</div>
        ) : (
          <div>
            {dayGroups.slice(0, visibleGroupCount).map((grp, gIdx) => {
              const isHovered = hoveredDay === grp.date;
              const dateLabel = formatDayHeaderLabel(grp.date);
              const dateTooltip = new Date(grp.date).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              });
              // Connector accent: brand accent in dark mode (higher alpha), standard blue in light mode
              const accent = isDarkMode ? 'rgba(135, 243, 243, 0.55)' : colours.missedBlue;
              const connectorStyle: React.CSSProperties = {
                position: 'absolute',
                left: 10,
                top: gIdx === 0 ? '20px' : 0,
                bottom: gIdx === visibleGroupCount - 1 ? '50%' : 0,
                width: 2,
                background: accent,
                opacity: 1,
                zIndex: 1,
              };
              const nodeStyle: React.CSSProperties = {
                position: 'absolute',
                left: 6,
                top: 16,
                width: 10,
                height: 10,
                borderRadius: 5,
                background: isDarkMode ? 'rgba(255,255,255,0.15)' : '#fff',
                border: `2px solid ${accent}`,
                zIndex: 2,
              };
              const blockStyle: React.CSSProperties = {
                borderRadius: 12,
                padding: 12,
                background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #141C2C 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                boxShadow: isHovered
                  ? (isDarkMode ? '0 6px 16px rgba(15,23,42,0.45)' : '0 10px 24px rgba(15,23,42,0.12)')
                  : (isDarkMode ? '0 2px 6px rgba(0,0,0,0.25)' : '0 2px 6px rgba(15,23,42,0.04)'),
                border: isDarkMode
                  ? `1px solid ${isHovered ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.14)'}`
                  : `1px solid ${isHovered ? 'rgba(13,47,96,0.18)' : 'rgba(13,47,96,0.06)'}`,
                opacity: isHovered ? 1 : 0.6,
                filter: isHovered ? 'none' : 'grayscale(0.12)',
                transition: 'all 0.24s ease'
              };
              const filters = dayFilters[grp.date] ?? EMPTY_DAY_FILTER;
              const filterName = filters.name.trim().toLowerCase();
              const filterPoc = filters.poc.trim().toLowerCase();
              const filterTaker = filters.taker.trim().toLowerCase();
              const filterStatus = filters.status.trim().toLowerCase();
              const hasFilters = Boolean(filterName || filterPoc || filterTaker || filterStatus);

              const filteredItems = grp.items.filter((raw: any) => {
                const nameCandidate = (raw.Client_Name || raw.Description || raw.Client || `${raw.First_Name || ''} ${raw.Last_Name || ''}`.trim() || '-').toLowerCase();
                if (filterName && !nameCandidate.includes(filterName)) return false;

                const pocCandidateRaw = getPocRaw(raw) || '';
                const pocCandidate = pocCandidateRaw.toLowerCase();
                if (filterPoc && !pocCandidate.includes(filterPoc)) return false;

                const takerCandidate = (raw.Call_Taker || '').toString().toLowerCase();
                if (filterTaker && !takerCandidate.includes(filterTaker)) return false;

                if (filterStatus) {
                  const statusLabel = isTriagedPoc(pocCandidateRaw)
                    ? 'triaged'
                    : (!pocCandidateRaw || pocCandidate === 'team@helix-law.com' ? 'unclaimed' : 'claimed');
                  if (statusLabel !== filterStatus) return false;
                }

                return true;
              });

              const displayItems = filteredItems;
              const headerPillStyle: React.CSSProperties = {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(13,47,96,0.05)',
                border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)',
                fontWeight: 700,
                marginBottom: 8,
              };
              const subtleBadge: React.CSSProperties = {
                display: 'inline-block',
                padding: '1px 6px',
                borderRadius: 999,
                background: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(13,47,96,0.05)',
                border: isDarkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(13,47,96,0.08)',
                fontSize: 11,
                fontWeight: 600,
              };
              return (
                <div
                  key={grp.date}
                  style={{ position: 'relative', paddingLeft: 24, marginBottom: 18, transition: 'opacity 0.2s ease' }}
                  onMouseEnter={() => setHoveredDay(grp.date)}
                  onMouseLeave={() => setHoveredDay((prev) => (prev === grp.date ? null : prev))}
                  onFocus={() => setHoveredDay(grp.date)}
                  onBlur={() => setHoveredDay((prev) => (prev === grp.date ? null : prev))}
                >
                  {/* Accent connector and node */}
                  <div style={connectorStyle} />
                  <div style={nodeStyle} />
                  {/* Block container */}
                  <div style={blockStyle}>
                    {/* Date header pill - clickable to toggle collapse */}
                    <div 
                      style={{ 
                        ...headerPillStyle, 
                        justifyContent: 'space-between', 
                        width: '100%',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                      onClick={() => toggleDayCollapse(grp.date)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon 
                          iconName={collapsedDays.has(grp.date) ? 'ChevronRight' : 'ChevronDown'} 
                          style={{ 
                            fontSize: 10, 
                            opacity: 0.7,
                            transition: 'transform 0.2s ease',
                            transform: collapsedDays.has(grp.date) ? 'rotate(0deg)' : 'rotate(0deg)'
                          }} 
                        />
                        <span title={dateTooltip}>{dateLabel}</span>
                      </div>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {displayItems.length} shown
                        {hasFilters ? ` · filtered from ${grp.items.length}` : ` · total ${grp.items.length}`}
                      </span>
                    </div>

                    {/* Conditional rendering: collapsed summary or expanded view */}
                    {collapsedDays.has(grp.date) ? (
                      /* Collapsed Summary View */
                      (() => {
                        const summary = dailySummaries.get(grp.date);
                        if (!summary) return null;
                        
                        return (
                          <div style={{ 
                            padding: '12px 0', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px' 
                          }}>
                            {/* Summary Metrics */}
                            <div style={{ 
                              display: 'grid', 
                              gridTemplateColumns: 'repeat(3, 1fr)', 
                              gap: '12px' 
                            }}>
                              <div style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                                border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'}`,
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
                                  {summary.unclaimed}
                                </div>
                                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>
                                  Unclaimed
                                </div>
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
                                border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)'}`,
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>
                                  {summary.claimed}
                                </div>
                                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>
                                  Claimed
                                </div>
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                                border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'}`,
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>
                                  {summary.triaged}
                                </div>
                                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>
                                  Triaged
                                </div>
                              </div>
                            </div>

                            {/* Top Claimers and Non-claimers */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              {/* Top Claimers */}
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px', opacity: 0.8 }}>
                                  Top Claimers
                                </div>
                                {summary.topClaimers.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {summary.topClaimers.map((claimer, idx) => (
                                      <div key={claimer.initials} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '10px',
                                        padding: '4px 8px',
                                        background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                        borderRadius: '4px'
                                      }}>
                                        <span style={{ fontWeight: 500 }}>{claimer.initials}</span>
                                        <span style={{ 
                                          fontSize: '9px', 
                                          color: colours.blue, 
                                          fontWeight: 600 
                                        }}>
                                          {claimer.count}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '10px', opacity: 0.5, fontStyle: 'italic' }}>
                                    No claims
                                  </div>
                                )}
                              </div>

                              {/* Non-claimers */}
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px', opacity: 0.8 }}>
                                  Non-claimers
                                </div>
                                {summary.nonClaimers.length > 0 ? (
                                  <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(40px, 1fr))',
                                    gap: '3px'
                                  }}>
                                    {summary.nonClaimers.map((nonClaimer) => (
                                      <div key={nonClaimer.initials} style={{
                                        fontSize: '9px',
                                        padding: '3px 4px',
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        borderRadius: '3px',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        opacity: nonClaimer.onLeave ? 0.4 : 0.8,
                                        border: nonClaimer.onLeave ? `1px dashed ${colours.greyText}` : 'none'
                                      }}>
                                        <span style={{ fontWeight: 500 }}>{nonClaimer.initials}</span>
                                        {nonClaimer.onLeave && (
                                          <span style={{ 
                                            fontSize: '7px', 
                                            color: colours.greyText,
                                            fontStyle: 'italic',
                                            lineHeight: 1
                                          }}>
                                            leave
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '10px', opacity: 0.5, fontStyle: 'italic' }}>
                                    All claimed
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* Expanded View - Existing enquiry list */
                      <>
                        {/* Column filters */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(220px, 1fr) 220px 160px 120px',
                            gap: 8,
                            margin: '6px 0 10px',
                            opacity: isHovered ? 0.8 : 0.45,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <input
                            value={filters.name}
                            onChange={(event) => updateDayFilter(grp.date, 'name', event.target.value)}
                            placeholder="Filter name / description"
                            style={{
                              fontSize: 11,
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: isDarkMode ? '1px solid rgba(148,163,184,0.22)' : '1px solid rgba(15,23,42,0.14)',
                              background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)',
                              color: isDarkMode ? '#e2e8f0' : '#1f2937'
                            }}
                          />
                          <input
                            value={filters.poc}
                            onChange={(event) => updateDayFilter(grp.date, 'poc', event.target.value)}
                            placeholder="Filter point of contact"
                            style={{
                              fontSize: 11,
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: isDarkMode ? '1px solid rgba(148,163,184,0.22)' : '1px solid rgba(15,23,42,0.14)',
                              background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)',
                              color: isDarkMode ? '#e2e8f0' : '#1f2937'
                            }}
                          />
                          <input
                            value={filters.taker}
                            onChange={(event) => updateDayFilter(grp.date, 'taker', event.target.value)}
                            placeholder="Filter call taker"
                            style={{
                              fontSize: 11,
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: isDarkMode ? '1px solid rgba(148,163,184,0.22)' : '1px solid rgba(15,23,42,0.14)',
                              background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)',
                              color: isDarkMode ? '#e2e8f0' : '#1f2937'
                            }}
                          />
                          <select
                            value={filters.status}
                            onChange={(event) => updateDayFilter(grp.date, 'status', event.target.value)}
                            style={{
                              fontSize: 11,
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: isDarkMode ? '1px solid rgba(148,163,184,0.22)' : '1px solid rgba(15,23,42,0.14)',
                              background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)',
                              color: isDarkMode ? '#e2e8f0' : '#1f2937'
                            }}
                          >
                        <option value="">All statuses</option>
                        <option value="claimed">Claimed</option>
                        <option value="unclaimed">Unclaimed</option>
                        <option value="triaged">Triaged</option>
                      </select>
                    </div>

                    {/* Group rows: Name | Point of contact | Call taker | Status */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 220px 160px 120px', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>Name</div>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>Point of contact</div>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>Call taker</div>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.55 }}>Status</div>
                      {displayItems.length === 0 && (
                        <div style={{ gridColumn: '1 / span 4', fontSize: 11, opacity: 0.6, padding: '8px 0' }}>
                          No enquiries match the filters for this day.
                        </div>
                      )}
                      {displayItems.map((e: any, idx2: number) => {
                        const name = e.Client_Name || e.Description || e.Client || `${e.First_Name || ''} ${e.Last_Name || ''}`.trim() || '-';
                        const stageStr = typeof e.stage === 'string' ? e.stage.toLowerCase() : (typeof (e as any).Stage === 'string' ? (e as any).Stage.toLowerCase() : '');
                        const statusStr = typeof (e as any).Status === 'string' ? (e as any).Status.toLowerCase() : (typeof (e as any).status === 'string' ? (e as any).status.toLowerCase() : '');
                        // Heuristics to identify Deal vs Instruction
                        const instructionRefField = (e as any).InstructionRef || (e as any).instruction_ref || (e as any).instructionRef;
                        const rRefField = instructionRefField || (e as any).RRef || (e as any).rref || (e as any).Rref;
                        const dealIdRaw = (e as any).DealId ?? (e as any).deal_id ?? (e as any).dealId;
                        const prospectIdRaw = (e as any).ProspectId ?? (e as any).prospect_id ?? (e as any).prospectId;
                        const dealIdNum = typeof dealIdRaw === 'string' ? parseInt(dealIdRaw, 10) : (typeof dealIdRaw === 'number' ? dealIdRaw : NaN);
                        const prospectIdNum = typeof prospectIdRaw === 'string' ? parseInt(prospectIdRaw, 10) : (typeof prospectIdRaw === 'number' ? prospectIdRaw : NaN);
                        const hasInstruction = Boolean(
                          instructionRefField ||
                          (e as any).Matter_Ref || (e as any).matter_ref || (e as any).MatterRef || (e as any).matterRef ||
                          (e as any).MatterId || (e as any).MatterID || (e as any).matterId || (e as any).matterID ||
                          statusStr === 'closed' || statusStr === 'instructed' ||
                          (stageStr && stageStr.includes('instruct'))
                        );
                        const hasDeal = Boolean(
                          (e as any).pitch === true ||
                          (e as any).Pitched === true ||
                          Boolean((e as any).PitchedDate) ||
                          (stageStr && (stageStr.includes('deal') || stageStr.includes('pitch'))) ||
                          statusStr === 'pitched' ||
                          // If we have an RRef-like value but no confirmed instruction, treat as deal
                          (!!rRefField && !hasInstruction) ||
                          (Number.isFinite(dealIdNum) && dealIdNum > 0) ||
                          (Number.isFinite(prospectIdNum) && prospectIdNum > 0)
                        );
                        const pocRaw = (e.Point_of_Contact || '').trim().toLowerCase();
                        const isUnclaimed = !pocRaw || pocRaw === 'team@helix-law.com';
                        const isTriaged = isTriagedPoc(pocRaw);
                        const isClaimedEntry = !isUnclaimed && !isTriaged;
                        const isHighlightActive = !!hoverHighlight && hoverHighlight.date === grp.date;
                        const isRowHighlighted = isHighlightActive && hoverHighlight!.poc === pocRaw;
                        const highlightedCellStyle: React.CSSProperties = isRowHighlighted
                          ? (isDarkMode
                              ? { background: 'rgba(135, 243, 243, 0.12)', outline: '1px solid rgba(135, 243, 243, 0.38)', borderRadius: 6 }
                              : { background: 'rgba(13, 47, 96, 0.06)', outline: '1px solid rgba(13, 47, 96, 0.18)', borderRadius: 6 })
                          : {};
                        
                        // Migration status indicators for transition management (with local override)
                        let migrationStatus = (e as any).migrationStatus || 'unknown';
                        let matchScore = (e as any).matchScore || 0;
                        let instructionsId = (e as any).instructionsId;
                        // If this looks like a legacy entry and we have a local override, apply it
                        const legacyId = (e as any).ID ? String((e as any).ID) : null;
                        if (legacyId && migrationOverrides.has(legacyId)) {
                          const o = migrationOverrides.get(legacyId)!;
                          migrationStatus = o.status || migrationStatus;
                          if (typeof o.matchScore === 'number') matchScore = o.matchScore;
                          if (typeof o.instructionsId !== 'undefined') instructionsId = o.instructionsId as any;
                        }
                        
                        const getMigrationIndicator = (status: string) => {
                          switch (status) {
                            case 'migrated':
                              return { icon: '●', color: isDarkMode ? '#86efac' : '#22c55e', label: 'Synced', title: `Synced to new system (ID: ${instructionsId})` };
                            case 'partial':
                              return { icon: '◐', color: isDarkMode ? '#fcd34d' : '#d97706', label: 'Partial', title: `Partially synced (Score: ${matchScore})` };
                            case 'not-migrated':
                              return { icon: '○', color: isDarkMode ? '#94a3b8' : '#64748b', label: 'Legacy', title: 'Legacy system only' };
                            case 'sync-pending':
                              return { icon: '◒', color: isDarkMode ? '#93c5fd' : '#3b82f6', label: 'Pending', title: 'Sync pending' };
                            case 'instructions-only':
                              return { icon: '●', color: isDarkMode ? '#c4b5fd' : '#8b5cf6', label: 'New', title: 'New system only' };
                            default:
                              return { icon: '○', color: isDarkMode ? '#64748b' : '#94a3b8', label: 'Unknown', title: 'Migration status unknown' };
                          }
                        };
                        
                        const migrationIndicator = getMigrationIndicator(migrationStatus);
                        const migrationBadge: React.CSSProperties = {
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 4,
                          padding: '1px 4px', 
                          borderRadius: 6, 
                          fontSize: 9, 
                          fontWeight: 500,
                          background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.7)',
                          border: `1px solid ${migrationIndicator.color}30`,
                          color: migrationIndicator.color,
                          marginLeft: 4,
                          opacity: 0.9,
                          cursor: 'pointer'
                        };
                        const pocLabel = isUnclaimed ? 'Unclaimed' : (isTriaged ? 'Triaged' : (e.Point_of_Contact as string));
                        const pocStyle: React.CSSProperties = (isUnclaimed || isTriaged)
                          ? {
                              ...subtleBadge,
                              background: isTriaged
                                ? (isDarkMode ? 'rgba(71,85,105,0.18)' : 'rgba(100,116,139,0.12)') // dark grey for Triaged
                                : (isDarkMode ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)'),
                              border: isTriaged
                                ? (isDarkMode ? '1px solid rgba(148,163,184,0.35)' : '1px solid rgba(100,116,139,0.28)')
                                : (isDarkMode ? '1px solid rgba(248,113,113,0.28)' : '1px solid rgba(220,38,38,0.18)'),
                              color: isTriaged
                                ? (isDarkMode ? '#CBD5E1' : '#334155')
                                : (isDarkMode ? '#fda4af' : '#b91c1c'),
                            }
                          : {};
                        const taker = (e.Call_Taker || '').trim();
                        const takerLabel = taker.toLowerCase() === 'operations' ? 'Internal' : 'External';
                        const takerStyle: React.CSSProperties = subtleBadge;
                        const claimedBadge: React.CSSProperties = isDarkMode
                          ? { ...subtleBadge, background: 'rgba(32,178,108,0.12)', border: '1px solid rgba(32,178,108,0.28)', color: '#86efac', marginRight: 6 }
                          : { ...subtleBadge, background: 'rgba(32,178,108,0.08)', border: '1px solid rgba(32,178,108,0.18)', color: colours.green, marginRight: 6 };
                        // Claimed status: clear text instead of confusing dots
                        const rowDim: React.CSSProperties = {};
                        const nameCellExtra: React.CSSProperties = {};
                        const statusPrimary = isUnclaimed ? 'Unclaimed' : (isTriaged ? 'Triaged' : 'Claimed');
                        const statusPrimaryBadge: React.CSSProperties = (() => {
                          if (isUnclaimed) {
                            return isDarkMode
                              ? { ...subtleBadge, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.28)', color: '#fca5a5' }
                              : { ...subtleBadge, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.18)', color: '#b91c1c' };
                          }
                          if (isTriaged) {
                            return isDarkMode
                              ? { ...subtleBadge, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.28)', color: '#93c5fd' }
                              : { ...subtleBadge, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.18)', color: '#1d4ed8' };
                          }
                          return { ...claimedBadge, marginRight: 0 };
                        })();
                        const tagBase: React.CSSProperties = {
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                          marginLeft: 8
                        };
                        // Align with Instructions module semantics and colours: Pitched (blue), Instructed (green)
                        const dealTag: React.CSSProperties = isDarkMode
                          ? { ...tagBase, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(147,197,253,0.28)', color: '#93c5fd' }
                          : { ...tagBase, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)', color: '#1e40af' };
                        const instructionTag: React.CSSProperties = isDarkMode
                          ? { ...tagBase, background: 'rgba(32,178,108,0.12)', border: '1px solid rgba(32,178,108,0.28)', color: '#86efac' }
                          : { ...tagBase, background: 'rgba(32,178,108,0.08)', border: '1px solid rgba(32,178,108,0.18)', color: colours.green };
                        const initialsPillStyle: React.CSSProperties = {
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: 999, fontSize: 10, fontWeight: 800,
                          color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                          background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #12263A 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                          border: isDarkMode ? '1px solid rgba(148,163,184,0.35)' : '1px solid rgba(13,47,96,0.18)',
                          boxShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.35)' : '0 1px 2px rgba(15,23,42,0.08)',
                          marginRight: 8, cursor: 'pointer'
                        };
                        return (
                          <React.Fragment key={idx2}>
                            <div style={{ ...rowDim, ...nameCellExtra, ...highlightedCellStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{name}</span>
                              <span 
                                title={migrationIndicator.title}
                                style={migrationBadge}
                                onClick={() => openMigrationModal(e)}
                              >
                                {migrationIndicator.icon}
                              </span>
                            </div>
                            <div
                              style={{ ...rowDim, ...highlightedCellStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                              onMouseEnter={() => { if (isClaimedEntry) setHoverHighlight({ date: grp.date, poc: pocRaw }); }}
                              onMouseLeave={() => { if (isRowHighlighted) setHoverHighlight(null); }}
                            >
                              {isClaimedEntry && (
                                <span
                                  title={`${pocLabel} - Click to reassign`}
                                  aria-label={`${pocLabel} - Click to reassign`}
                                  style={{
                                    ...initialsPillStyle,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    position: 'relative'
                                  }}
                                  onClick={(event) => handleReassignClick((e as any).ID || (e as any).id || `${gIdx}-${idx2}`, event)}
                                  onMouseEnter={() => setHoverHighlight({ date: grp.date, poc: pocRaw })}
                                  onMouseLeave={() => { if (isRowHighlighted) setHoverHighlight(null); }}
                                >
                                  {getInitials(e.Point_of_Contact as string)}
                                  <Icon 
                                    iconName="Edit" 
                                    style={{ 
                                      fontSize: 8, 
                                      position: 'absolute', 
                                      bottom: -2, 
                                      right: -2,
                                      background: isDarkMode ? colours.dark.background : colours.light.background,
                                      borderRadius: '50%',
                                      padding: 1,
                                      opacity: 0.7
                                    }} 
                                  />
                                </span>
                              )}
                              {(isUnclaimed || isTriaged) && (
                                <span 
                                  style={{
                                    ...pocStyle,
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'all 0.2s ease'
                                  }}
                                  title={`${pocLabel} - Click to assign`}
                                  onClick={(event) => handleReassignClick((e as any).ID || (e as any).id || `${gIdx}-${idx2}`, event)}
                                >
                                  {pocLabel}
                                  <Icon 
                                    iconName="AddFriend" 
                                    style={{ 
                                      fontSize: 8, 
                                      marginLeft: 4,
                                      opacity: 0.7
                                    }} 
                                  />
                                </span>
                              )}
                            </div>
                            <div style={{ ...rowDim, ...highlightedCellStyle }}><span style={takerStyle}>{takerLabel}</span></div>
                            <div style={{ ...rowDim, ...highlightedCellStyle, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={statusPrimaryBadge}>{statusPrimary}</span>
                              {hasInstruction && <span title="Instructed" aria-label="Instructed" style={instructionTag}>Instructed</span>}
                              {!hasInstruction && hasDeal && <span title="Pitched" aria-label="Pitched" style={dealTag}>Pitched</span>}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Sentinel for infinite scroll */}
            {visibleGroupCount < dayGroups.length && <div ref={sentinelRef} style={{ height: 1 }} />}
          </div>
        )}
      </div>

      {/* Migration modal */}
      <Dialog
        hidden={!migrationModalOpen}
        onDismiss={closeMigrationModal}
        dialogContentProps={{
          type: DialogType.largeHeader,
          title: 'Migrate Legacy Enquiry',
          subText: 'Review and adjust field mappings before creating the new enquiry record.'
        }}
        minWidth={900}
        maxWidth={1100}
        styles={{
          main: {
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            borderRadius: 12,
            boxShadow: isDarkMode 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.8)' 
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '85vh',
            height: 'auto'
          }
        }}
      >
        {migrationLegacy && migrationDraft && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '420px 1fr', 
            gap: 20,
            padding: 16,
            maxHeight: '65vh',
            overflow: 'hidden'
          }}>
            {/* Legacy preview */}
            <div style={{
              backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              borderRadius: 8,
              padding: 16,
              overflow: 'auto',
              maxHeight: '65vh'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
              }}>
                <Icon iconName="Database" style={{ 
                  fontSize: 14, 
                  color: isDarkMode ? colours.dark.subText : colours.light.subText
                }} />
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: 14,
                  color: isDarkMode ? colours.dark.text : colours.light.text
                }}>Legacy Record</div>
                <div style={{ 
                  fontSize: 10, 
                  opacity: 0.7,
                  backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontFamily: 'monospace'
                }}>
                  ID: {String(migrationLegacy.ID ?? 'unknown')}
                </div>
              </div>

              {/* Contact Information Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.blue,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Contact" style={{ fontSize: 11 }} />
                  Contact Information
                </div>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 16, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Name:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {(migrationLegacy.First_Name || '') + ' ' + (migrationLegacy.Last_Name || '') || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Email:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Email || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Phone:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Phone_Number || migrationLegacy.Secondary_Phone || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Company:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Company || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Title:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Title || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Website:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', fontSize: 10 }}>
                      {migrationLegacy.Website || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Business Details Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.green,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Work" style={{ fontSize: 11 }} />
                  Business Details
                </div>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 16, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Area of Work:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Area_of_Work || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Type of Work:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Type_of_Work || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Contact Method:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Method_of_Contact || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Value:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Value || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Rating:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Rating || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Gift Rank:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Gift_Rank || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attribution Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.yellow,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Ringer" style={{ fontSize: 11 }} />
                  Attribution & Source
                </div>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 16, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Source:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Ultimate_Source || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Contact Referrer:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Contact_Referrer || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Referring Company:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Referring_Company || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Campaign:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                      {migrationLegacy.Campaign || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>GCLID:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', fontFamily: 'monospace', fontSize: 10 }}>
                      {migrationLegacy.GCLID || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Internal Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.red,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="People" style={{ fontSize: 11 }} />
                  Internal Details
                </div>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 16, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Point of Contact:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Point_of_Contact || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Call Taker:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Call_Taker || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Matter Ref:</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                      {migrationLegacy.Matter_Ref || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Full Notes Display */}
              {migrationLegacy.Initial_first_call_notes && (
                <div style={{ 
                  marginTop: 16,
                  padding: 12,
                  backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                  borderRadius: 6,
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
                }}>
                  <div style={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    color: colours.blue,
                    marginBottom: 6
                  }}>
                    Full Notes:
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    lineHeight: 1.4,
                    maxHeight: 120,
                    overflow: 'auto',
                    color: isDarkMode ? colours.dark.text : colours.light.text
                  }}>
                    {migrationLegacy.Initial_first_call_notes}
                  </div>
                </div>
              )}
            </div>
            {/* New record editable */}
            <div style={{
              backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              borderRadius: 8,
              padding: 16,
              overflow: 'auto',
              maxHeight: '65vh'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
              }}>
                <Icon iconName="EditCreate" style={{ 
                  fontSize: 14, 
                  color: colours.blue
                }} />
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: 14,
                  color: isDarkMode ? colours.dark.text : colours.light.text
                }}>New Record</div>
                <div style={{ 
                  fontSize: 10, 
                  opacity: 0.8,
                  backgroundColor: colours.blue,
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 500
                }}>
                  EDITABLE
                </div>
              </div>

              {/* Contact Information Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.blue,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Contact" style={{ fontSize: 11 }} />
                  Contact Information
                  <span style={{ 
                    fontSize: 9, 
                    color: colours.red,
                    fontWeight: 700 
                  }}>*</span>
                </div>
                <div style={{ display: 'grid', gap: 8, paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="First name" 
                      value={migrationDraft.first}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, first: v || '' } : d)}
                      required
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Last name" 
                      value={migrationDraft.last}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, last: v || '' } : d)}
                      required
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                  <TextField 
                    label="Email" 
                    value={migrationDraft.email}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, email: v || '' } : d)}
                    required
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="Phone" 
                      value={migrationDraft.phone || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, phone: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Point of contact (poc)" 
                      value={migrationDraft.poc || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, poc: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Business Details Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.green,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Work" style={{ fontSize: 11 }} />
                  Business Details
                  <span style={{ 
                    fontSize: 9, 
                    color: colours.red,
                    fontWeight: 700 
                  }}>*</span>
                </div>
                <div style={{ display: 'grid', gap: 8, paddingLeft: 4 }}>
                  <TextField 
                    label="Area of work (aow)" 
                    value={migrationDraft.aow}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, aow: v || '' } : d)}
                    required
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <TextField 
                    label="Type of work (tow)" 
                    value={migrationDraft.tow || ''}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, tow: v || '' } : d)}
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <TextField 
                    label="Method of contact (moc)" 
                    value={migrationDraft.moc}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, moc: v || '' } : d)}
                    required
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="Value" 
                      value={migrationDraft.value || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, value: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Rating" 
                      value={migrationDraft.rating || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, rating: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Attribution Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.yellow,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Ringer" style={{ fontSize: 11 }} />
                  Attribution & Source
                </div>
                <div style={{ display: 'grid', gap: 8, paddingLeft: 4 }}>
                  <TextField 
                    label="Source" 
                    value={migrationDraft.source || ''}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, source: v || '' } : d)}
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <TextField 
                    label="Contact referrer" 
                    value={migrationDraft.contact_referrer || ''}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, contact_referrer: v || '' } : d)}
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <TextField 
                    label="Company referrer" 
                    value={migrationDraft.company_referrer || ''}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, company_referrer: v || '' } : d)}
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 12,
                        padding: '6px 8px'
                      },
                      fieldGroup: { height: 28 }
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="URL" 
                      value={migrationDraft.url || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, url: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="GCLID" 
                      value={migrationDraft.gclid || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, gclid: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px',
                          fontFamily: 'monospace'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Internal Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.red,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="People" style={{ fontSize: 11 }} />
                  Internal Details
                </div>
                <div style={{ display: 'grid', gap: 8, paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="Representative (rep)" 
                      value={migrationDraft.rep || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, rep: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Rank" 
                      value={migrationDraft.rank || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, rank: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Operational Fields Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.blue,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="Settings" style={{ fontSize: 11 }} />
                  Operational Fields
                </div>
                <div style={{ display: 'grid', gap: 8, paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="Stage" 
                      value={migrationDraft.stage || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, stage: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Claim Date" 
                      value={migrationDraft.claim || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, claim: v || '' } : d)}
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <TextField 
                      label="Pitch" 
                      value={migrationDraft.pitch || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, pitch: v || '' } : d)}
                      placeholder="0"
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="ACID" 
                      value={migrationDraft.acid || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, acid: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                    <TextField 
                      label="Card ID" 
                      value={migrationDraft.card_id || ''}
                      onChange={(_, v) => setMigrationDraft(d => d ? { ...d, card_id: v || '' } : d)}
                      styles={{
                        field: {
                          backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          fontSize: 12,
                          padding: '6px 8px'
                        },
                        fieldGroup: { height: 28 }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              <div>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: colours.yellow,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Icon iconName="FileComment" style={{ fontSize: 11 }} />
                  Notes & Additional Info
                </div>
                <div style={{ paddingLeft: 4 }}>
                  <TextField 
                    label="Notes" 
                    multiline 
                    rows={3} 
                    value={migrationDraft.notes || ''}
                    onChange={(_, v) => setMigrationDraft(d => d ? { ...d, notes: v || '' } : d)}
                    styles={{
                      field: {
                        backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        fontSize: 11,
                        lineHeight: 1.4,
                        padding: '8px'
                      }
                    }}
                  />
                </div>
              </div>

              {migrationError && (
                <div style={{ marginTop: 16 }}>
                  <MessageBar messageBarType={MessageBarType.error}>
                    {migrationError}
                  </MessageBar>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter styles={{
          actions: {
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end'
          }
        }}>
          <PrimaryButton 
            text={migrationSubmitting ? 'Migrating...' : 'Confirm & Create'}
            iconProps={migrationSubmitting ? { iconName: 'Sync' } : { iconName: 'CloudUpload' }}
            onClick={submitMigration} 
            disabled={migrationSubmitting}
            styles={{
              root: {
                backgroundColor: colours.blue,
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontWeight: 600,
                fontSize: 12,
                height: 28,
                minWidth: 110
              },
              rootHovered: {
                backgroundColor: colours.blue,
                opacity: 0.9
              },
              rootPressed: {
                backgroundColor: colours.blue,
                opacity: 0.8
              },
              rootDisabled: {
                backgroundColor: isDarkMode ? colours.dark.disabledBackground : colours.light.disabledBackground,
                opacity: 0.6
              }
            }}
          />
          <DefaultButton 
            text="Cancel" 
            onClick={closeMigrationModal} 
            disabled={migrationSubmitting}
            styles={{
              root: {
                backgroundColor: 'transparent',
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontWeight: 500,
                fontSize: 12,
                height: 28,
                minWidth: 60,
                color: isDarkMode ? colours.dark.text : colours.light.text
              },
              rootHovered: {
                backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground
              }
            }}
          />
        </DialogFooter>
      </Dialog>

      {/* Reassignment Dropdown */}
      {reassignmentDropdown && (
        <div
          className="reassignment-dropdown"
          style={{
            position: 'fixed',
            left: reassignmentDropdown.x,
            top: reassignmentDropdown.y,
            zIndex: 9999,
            minWidth: 250,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: 8,
            boxShadow: isDarkMode ? '0 8px 24px rgba(0, 0, 0, 0.4)' : '0 6px 20px rgba(15, 23, 42, 0.15)',
            padding: 16,
          }}
        >
          <div style={{ 
            fontSize: 14, 
            fontWeight: 600, 
            marginBottom: 12,
            color: isDarkMode ? '#e2e8f0' : '#334155'
          }}>
            Reassign to:
          </div>
          <select
            value=""
            onChange={(event) => handleReassignmentSelect(event.target.value)}
            disabled={isReassigning}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
              background: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
              color: isDarkMode ? '#e2e8f0' : '#334155',
              fontSize: 14,
              fontFamily: 'Raleway, sans-serif',
              cursor: isReassigning ? 'default' : 'pointer',
              outline: 'none'
            }}
          >
            <option value="" disabled>Select team member...</option>
            {teamMemberOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.text}
              </option>
            ))}
          </select>
          {isReassigning && (
            <div style={{ 
              marginTop: 8, 
              fontSize: 12, 
              color: isDarkMode ? '#94a3b8' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <Icon iconName="Loading" style={{ animation: 'spin 1s linear infinite' }} />
              Reassigning...
            </div>
          )}
          <div style={{ 
            marginTop: 12, 
            fontSize: 11, 
            color: isDarkMode ? '#64748b' : '#94a3b8',
            fontStyle: 'italic'
          }}>
            Click outside to cancel
          </div>
        </div>
      )}
      
      {/* Data Modal */}
      {modalData.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={closeModal}>
          <div style={{
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '80vw',
            maxHeight: '80vh',
            overflow: 'hidden',
            boxShadow: isDarkMode ? '0 20px 60px rgba(0,0,0,0.4)' : '0 20px 60px rgba(0,0,0,0.15)',
            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            display: 'flex',
            flexDirection: 'column',
            minWidth: '600px'
          }}
          onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
            }}>
              <h3 style={{
                margin: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '18px',
                fontWeight: 600
              }}>
                {modalData.title}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: '14px',
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  fontWeight: 500
                }}>
                  {modalData.items.length} enquir{modalData.items.length === 1 ? 'y' : 'ies'}
                </span>
                <button
                  onClick={closeModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              paddingRight: '8px',
              marginRight: '-8px'
            }}>
              {modalData.items.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: isDarkMode ? colours.dark.subText : colours.light.subText
                }}>
                  No enquiries found
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {modalData.items.map(({ enquiry, member }, index) => {
                    const createdDate = parseDate((enquiry as any).Touchpoint_Date || enquiry.Date_Created);
                    const firstName = toStr(enquiry.First_Name || (enquiry as any).first || '');
                    const lastName = toStr(enquiry.Last_Name || (enquiry as any).last || '');
                    const fullName = `${firstName} ${lastName}`.trim() || 'Unknown';
                    const email = toStr(enquiry.Email || (enquiry as any).email || '');
                    const phone = toStr(enquiry.Phone_Number || (enquiry as any).phone || '');
                    const aow = toStr(enquiry.Area_of_Work || (enquiry as any).aow || '');
                    const notes = toStr(enquiry.Initial_first_call_notes || (enquiry as any).notes || '').substring(0, 80);
                    
                    return (
                      <div key={index} style={{
                        padding: '8px 12px',
                        backgroundColor: index % 2 === 0 ? 
                          (isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') : 
                          'transparent',
                        borderRadius: '4px',
                        fontSize: '13px',
                        lineHeight: '1.4'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px'
                        }}>
                          <div style={{
                            fontWeight: 600,
                            color: isDarkMode ? colours.dark.text : colours.light.text
                          }}>
                            {fullName}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: isDarkMode ? colours.dark.subText : colours.light.subText
                          }}>
                            {createdDate ? formatDateForPicker(createdDate) : 'Unknown date'}
                          </div>
                        </div>
                        
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '8px 16px',
                          fontSize: '11px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText
                        }}>
                          {email && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500 }}>Email:</span>
                              <span>{email}</span>
                            </div>
                          )}
                          {phone && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500 }}>Phone:</span>
                              <span>{phone}</span>
                            </div>
                          )}
                          {aow && (
                            <div style={{ display: 'flex', alignItems: 'center', gridColumn: '1 / -1' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500 }}>Area:</span>
                              <span>{aow}</span>
                            </div>
                          )}
                          {modalData.type === 'source' && (
                            <div style={{ display: 'flex', alignItems: 'center', gridColumn: '1 / -1' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500, color: colours.blue }}>Source:</span>
                              <span style={{ color: colours.blue }}>{getNormalizedEnquirySourceLabel(enquiry)}</span>
                            </div>
                          )}
                          {modalData.type === 'moc' && (
                            <div style={{ display: 'flex', alignItems: 'center', gridColumn: '1 / -1' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500, color: colours.blue }}>Contact:</span>
                              <span style={{ color: colours.blue }}>{getNormalizedEnquiryMOCLabel(enquiry)}</span>
                            </div>
                          )}
                          {modalData.type === 'poc' && (
                            <div style={{ display: 'flex', alignItems: 'center', gridColumn: '1 / -1' }}>
                              <span style={{ minWidth: '40px', fontWeight: 500, color: colours.blue }}>Handler:</span>
                              <span style={{ color: colours.blue }}>{toStr(enquiry.Point_of_Contact || (enquiry as any).point_of_contact).trim()}</span>
                            </div>
                          )}
                        </div>
                        
                        {notes && (
                          <div style={{
                            fontSize: '10px',
                            color: isDarkMode ? colours.dark.subText : colours.light.subText,
                            fontStyle: 'italic',
                            marginTop: '4px',
                            opacity: 0.8
                          }}>
                            "{notes}..."
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <button
                onClick={() => {
                  // Apply filter and close modal
                  if (modalData.type === 'source') {
                    setSourceFilter(sourceFilter === modalData.filterValue ? null : modalData.filterValue);
                  } else if (modalData.type === 'moc') {
                    setMocFilter(mocFilter === modalData.filterValue ? null : modalData.filterValue);
                  } else if (modalData.type === 'poc') {
                    setPocFilter(pocFilter === modalData.filterValue ? null : modalData.filterValue);
                  }
                  closeModal();
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: colours.blue,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Filter by {modalData.filterValue}
              </button>
              <button
                onClick={closeModal}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export type { MarketingMetrics, GoogleAnalyticsMetrics, GoogleAdsMetrics, MetaAdsMetrics };
export default EnquiriesReport;
