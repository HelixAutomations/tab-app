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
  TooltipHost,
  DirectionalHint,
  ITooltipProps,
} from '@fluentui/react';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { debugLog, debugWarn } from '../../utils/debug';
import './ManagementDashboard.css';

// Ensure Fluent UI icons are available (fixes warnings for 'target', 'trendingup', etc.)
initializeIcons();

export interface PpcIncomePayment {
  paymentDate: string;
  amount: number;
  kind?: string;
  description?: string;
}

export interface PpcIncomeBreakdown {
  matterId?: string;
  displayNumber?: string;
  clientName?: string;
  source?: string;
  openDate?: string;
  totalCollected: number;
  collectedWithin7Days: number;
  collectedWithin30Days: number;
  payments: PpcIncomePayment[];
  enquiryId?: string;
  enquiryDate?: string;
  enquirySource?: string;
  enquiryMoc?: string;
}

export interface PpcIncomeMetrics {
  generatedAt: string;
  summary: {
    totalEnquiries: number;
    totalMatters: number;
    mattersWithRevenue: number;
    totalRevenue: number;
    revenue7d: number;
    revenue30d: number;
  };
  breakdown: PpcIncomeBreakdown[];
  unmatchedPayments?: Array<{
    matterId?: string;
    paymentDate?: string;
    amount: number;
    kind?: string;
    description?: string;
  }>;
  debug?: {
    unmatchedCount?: number;
    matchedPaymentCount?: number;
    candidateMatterCount?: number;
  };
  notes?: string[];
}

type AugmentedIncomeRow = PpcIncomeBreakdown & {
  totalInRange?: number;
  paymentsInRange?: PpcIncomePayment[];
};

interface GoogleAdsRow {
  date: string;
  impressions?: number;
  clicks?: number;
  cost?: number; // Already in GBP
  conversions?: number;
  ctr?: number; // Already as percentage
  cpc?: number;
  cpa?: number;
}

// Define the structure that comes from the marketing metrics API
interface GoogleAdsData {
  date: string;
  googleAds?: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpa: number;
  };
}

interface GoogleAdsApiResponse {
  success?: boolean;
  data?: (GoogleAdsRow | GoogleAdsData)[];
  dateRange?: { start: string; end: string; daysIncluded?: number };
  source?: string;
}

interface MetaEnquiry {
  id?: string;
  date: string;
  source?: string;
  cost?: number;
  enquiries?: number;
  clientName?: string;
  poc?: string;
  status?: string;
}

interface PpcReportProps {
  triggerRefresh?: () => Promise<void>;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
  cachedGoogleAdsData?: (GoogleAdsRow | GoogleAdsData)[] | GoogleAdsApiResponse | null;
  ppcIncomeMetrics?: PpcIncomeMetrics | null;
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
            transform: 'translateY(-1px) !important',
          },
          ':focus-within': {
            border: `1px solid ${focusBorder} !important`,
            background: `${focusBackground} !important`,
            boxShadow: isDarkMode 
              ? `0 0 0 3px rgba(135, 206, 235, 0.1), 0 4px 12px rgba(0, 0, 0, 0.25) !important`
              : `0 0 0 3px rgba(54, 144, 206, 0.1), 0 2px 8px rgba(15, 23, 42, 0.15) !important`,
            transform: 'translateY(-1px) !important',
          }
        }
      },
      field: {
        fontSize: '14px !important',
        color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
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

const getRangeButtonStyles = (isDarkMode: boolean, active: boolean, disabled: boolean = false): IButtonStyles => {
  const activeBackground = colours.highlight;
  const inactiveBackground = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent';

  const resolvedBackground = disabled
    ? (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent')
    : active ? activeBackground : inactiveBackground;

  const resolvedBorder = active
    ? `1px solid ${isDarkMode ? 'rgba(135, 176, 255, 0.5)' : 'rgba(13, 47, 96, 0.32)'}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const resolvedColor = disabled
    ? (isDarkMode ? '#E2E8F0' : colours.missedBlue)
    : active
      ? '#ffffff'
      : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

  return {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap' as const,
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
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: 10,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : '#ffffff',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : '#e2e8f0'}`,
  boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
  textAlign: 'center' as const,
  rowGap: 6,
  width: '100%',
});

const subtleActionButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    height: 28,
    borderRadius: 14,
    fontSize: 12,
    padding: '0 10px',
    background: 'transparent',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.18)'}`,
    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
    minWidth: 'unset',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.12)',
  },
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
      const diff = (day + 6) % 7; // Monday as start
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'lastWeek': {
      const day = now.getDay();
      const diff = (day + 6) % 7; // Monday as start
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
    case 'last90Days': {
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStart, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearToDate': {
      // Financial year: 1 April to 31 March
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11 (0 = January)

      if (currentMonth >= 3) { // April onwards (month 3+)
        // We're in the financial year that started this calendar year
        start.setFullYear(currentYear, 3, 1); // 1 April this year
      } else {
        // We're in Jan/Feb/Mar - still in the financial year that started last calendar year
        start.setFullYear(currentYear - 1, 3, 1); // 1 April last year
      }
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year': {
      // Calendar year: 1 January to 31 December
      const currentYear = now.getFullYear();
      start.setFullYear(currentYear, 0, 1);
      start.setHours(0, 0, 0, 0);

      end.setFullYear(currentYear, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'custom':
      // For custom ranges, return current date as both start and end
      // The actual dates will be controlled by the DatePicker components
      return { start: new Date(now), end: new Date(now) };
    case 'all':
    default:
      return { start: new Date(0), end };
  }

  return { start, end };
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
  if (num < 1000) return Math.round(num).toString();
  if (num < 1000000) return `${Math.round(num / 1000)}k`;
  return `${(num / 1000000).toFixed(1)}m`;
};

const formatFullNumber = (num: number): string => {
  return num.toLocaleString('en-US');
};

const formatPercentage = (num: number): string => {
  return `${num.toFixed(1)}%`;
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

const formatDateForPicker = (date?: Date | null): string => {
  if (!date) {
    return '';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const parseDatePickerInput = (value?: string | null): Date | null => (
  value ? new Date(value) : null
);

const formatDateTag = (date: Date | null): string => {
  if (!date) {
    return 'n/a';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const clearFilterButtonStyle = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    height: 36,
    borderRadius: 18,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(54, 144, 206, 0.3)'}`,
    background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
    color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
    fontFamily: 'Raleway, sans-serif',
    fontWeight: 600,
    fontSize: 13,
    padding: '0 16px',
    minWidth: 'unset',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(248, 250, 252, 1)',
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(54, 144, 206, 0.4)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(51, 65, 85, 0.9)' : 'rgba(241, 245, 249, 1)',
  },
});

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

const PpcReport: React.FC<PpcReportProps> = ({
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false,
  cachedGoogleAdsData = [],
  ppcIncomeMetrics = null,
}) => {
  const { isDarkMode } = useTheme();
  const [{ start: rangeStart, end: rangeEnd }, setRangeState] = useState(() => computeRange('all'));
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [showIncomePreview, setShowIncomePreview] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedMatters, setExpandedMatters] = useState<Set<string>>(new Set());
  const lastSyncLabel = useMemo(() => formatRelativeTime(lastRefreshTimestamp), [lastRefreshTimestamp]);

  useEffect(() => {
    if (ppcIncomeMetrics) {
      debugLog('PpcReport: received PPC income metrics summary', ppcIncomeMetrics.summary);
      if (ppcIncomeMetrics.debug?.unmatchedCount) {
        debugLog('PpcReport: unmatched PPC payment preview', ppcIncomeMetrics.unmatchedPayments?.slice(0, 5));
      }
    }
  }, [ppcIncomeMetrics]);
  
  // Ensure googleAdsData is always an array and transform the data structure
  const googleAdsData = useMemo<GoogleAdsRow[]>(() => {
    debugLog('PpcReport: cachedGoogleAdsData received:', cachedGoogleAdsData);

    // Unwrap if the data is nested in an API response object
    const maybeResponse = cachedGoogleAdsData as GoogleAdsApiResponse | (GoogleAdsRow | GoogleAdsData)[] | null | undefined;
    const rawArray: (GoogleAdsRow | GoogleAdsData)[] = Array.isArray(maybeResponse)
      ? maybeResponse
      : (maybeResponse && typeof maybeResponse === 'object' && 'data' in maybeResponse && Array.isArray((maybeResponse as GoogleAdsApiResponse).data))
        ? (maybeResponse as GoogleAdsApiResponse).data!
        : [];

    if (!Array.isArray(rawArray)) {
      debugWarn('PpcReport: google ads data is not an array after unwrap');
      return [];
    }

    // Transform data from GoogleAdsData to GoogleAdsRow format
    const transformed = rawArray.map((item) => {
      // Handle both direct GoogleAdsRow format and nested googleAds format
      if ('googleAds' in item && item.googleAds) {
        const gadsData = item as GoogleAdsData;
        debugLog('PpcReport: transforming nested googleAds data:', gadsData);
        return {
          date: gadsData.date,
          impressions: gadsData.googleAds?.impressions || 0,
          clicks: gadsData.googleAds?.clicks || 0,
          cost: gadsData.googleAds?.cost || 0,
          conversions: gadsData.googleAds?.conversions || 0,
          ctr: gadsData.googleAds?.ctr || 0,
          cpc: gadsData.googleAds?.cpc || 0,
          cpa: gadsData.googleAds?.cpa || 0,
        };
      }

      // Already in correct format
      debugLog('PpcReport: using direct GoogleAdsRow format:', item);
      return item as GoogleAdsRow;
    });

    debugLog('PpcReport: transformed googleAdsData:', transformed);
    return transformed;
  }, [cachedGoogleAdsData]);

  // Meta enquiry data state
  const [metaEnquiries, setMetaEnquiries] = useState<MetaEnquiry[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  // Fetch Meta enquiry data
  useEffect(() => {
    const fetchMetaEnquiries = async () => {
      setIsLoadingMeta(true);
      try {
        const response = await fetch('/api/reporting-stream?dataset=metaMetrics');
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data)) {
            // Transform Meta data to enquiry format grouped by date
            const enquiriesMap = new Map<string, MetaEnquiry>();
            data.forEach((item: any) => {
              if (item.date && item.metaAds && item.metaAds.enquiries > 0) {
                const existingEnquiry = enquiriesMap.get(item.date);
                const enquiries = item.metaAds.enquiries || 0;
                const cost = item.metaAds.spend || 0;
                
                if (existingEnquiry) {
                  existingEnquiry.enquiries = (existingEnquiry.enquiries || 0) + enquiries;
                  existingEnquiry.cost = (existingEnquiry.cost || 0) + cost;
                } else {
                  enquiriesMap.set(item.date, {
                    date: item.date,
                    source: 'Meta Ads',
                    enquiries,
                    cost,
                    status: 'generated'
                  });
                }
              }
            });
            setMetaEnquiries(Array.from(enquiriesMap.values()));
          }
        }
      } catch (error) {
        console.error('Failed to fetch Meta enquiries:', error);
      } finally {
        setIsLoadingMeta(false);
      }
    };

    fetchMetaEnquiries();
  }, []);

  const activeStart = useMemo(() => startDate ?? rangeStart, [startDate, rangeStart]);
  const activeEnd = useMemo(() => endDate ?? rangeEnd, [endDate, rangeEnd]);

  // Compute days between range
  const daysBetween = useMemo(() => {
    if (rangeKey === 'all') {
      // For 'all' range, calculate days based on actual data span
      if (googleAdsData.length === 0) return 1;
      
      const dates = googleAdsData.map(row => 
        new Date(typeof row.date === 'string' ? row.date : row.date)
      ).sort((a, b) => a.getTime() - b.getTime());
      
      const earliestDate = dates[0];
      const latestDate = dates[dates.length - 1];
      const timeDiff = latestDate.getTime() - earliestDate.getTime();
      return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    }
    
    const timeDiff = activeEnd.getTime() - activeStart.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  }, [activeStart, activeEnd, rangeKey, googleAdsData]);

  // Handle range selection
  const handleRangeSelect = (key: RangeKey) => {
    setRangeKey(key);
    if (key === 'custom') {
      return;
    }

    const newRange = computeRange(key);
    setRangeState(newRange);
    if (key === 'all') {
      setStartDate(undefined);
      setEndDate(undefined);
    } else {
      setStartDate(newRange.start);
      setEndDate(newRange.end);
    }
  };

  const initialiseCustomDates = () => {
    const today = new Date();
    const fallbackStart = (!activeStart || rangeKey === 'all' || activeStart.getFullYear() < 1980)
      ? (() => {
          const start = new Date(today);
          start.setDate(today.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          return start;
        })()
      : new Date(activeStart);

    const fallbackEnd = (!activeEnd || rangeKey === 'all')
      ? (() => {
          const end = new Date(today);
          end.setHours(23, 59, 59, 999);
          return end;
        })()
      : new Date(activeEnd);

    setStartDate(fallbackStart);
    setEndDate(fallbackEnd);
  };

  const handleActivateCustomRange = () => {
    if (rangeKey === 'custom') {
      return;
    }
    initialiseCustomDates();
    setRangeKey('custom');
  };

  // Handle custom date selection
  const handleCustomDateChange = (start?: Date, end?: Date) => {
    if (start && end && start <= end) {
      const adjustedStart = new Date(start);
      adjustedStart.setHours(0, 0, 0, 0);
      
      const adjustedEnd = new Date(end);
      adjustedEnd.setHours(23, 59, 59, 999);
      
      setRangeState({ start: adjustedStart, end: adjustedEnd });
      setRangeKey('custom');
      setStartDate(adjustedStart);
      setEndDate(adjustedEnd);
    }
  };

  // Refresh functionality
  const [refreshIndicatorKey, setRefreshIndicatorKey] = useState(0);
  
  const refresh = () => {
    setRefreshIndicatorKey(prev => prev + 1);
    // Trigger data refresh logic here if needed
  };

  // Filter cached data based on current date range
  const filteredGoogleAdsData = useMemo(() => {
    debugLog('PpcReport: filtering data, rangeKey:', rangeKey, 'activeStart:', activeStart, 'activeEnd:', activeEnd);
    
    // For 'all' range, return all data without filtering
    if (rangeKey === 'all') {
      debugLog('PpcReport: using all data, count:', googleAdsData.length);
      return googleAdsData;
    }
    
    const filtered = googleAdsData.filter(row => {
      const rowDate = typeof row.date === 'string' ? new Date(row.date) : new Date(row.date);
      const isInRange = rowDate >= activeStart && rowDate <= activeEnd;
      if (!isInRange) {
        debugLog('PpcReport: filtering out date:', row.date, 'not in range', activeStart.toISOString().split('T')[0], 'to', activeEnd.toISOString().split('T')[0]);
      }
      return isInRange;
    });
    
    debugLog('PpcReport: filtered data count:', filtered.length, 'from total:', googleAdsData.length);
    return filtered;
  }, [googleAdsData, activeStart, activeEnd, rangeKey]);

  // Calculate summary metrics from filtered data
  const summaryMetrics = useMemo(() => {
    debugLog('PpcReport: calculating summary metrics from filtered data:', filteredGoogleAdsData);
    
    const totalImpressions = filteredGoogleAdsData.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalClicks = filteredGoogleAdsData.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const totalCost = filteredGoogleAdsData.reduce((sum, row) => sum + (row.cost || 0), 0);
    const totalConversions = filteredGoogleAdsData.reduce((sum, row) => sum + (row.conversions || 0), 0);
    
    // Calculate working days (days with actual spend)
    const workingDays = filteredGoogleAdsData.filter(row => (row.cost || 0) > 0).length;
    const effectiveDays = workingDays > 0 ? workingDays : daysBetween;
    
    const averageCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const averageCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const averageCpa = totalConversions > 0 ? totalCost / totalConversions : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    const roas = totalCost > 0 ? (totalConversions * 100) / totalCost : 0; // Assuming £100 per conversion value

    const result = {
      totalImpressions,
      totalClicks,
      totalCost,
      totalConversions,
      averageCtr,
      averageCpc,
      averageCpa,
      conversionRate,
      roas,
      averageImpressionsPerDay: effectiveDays > 0 ? totalImpressions / effectiveDays : 0,
      averageClicksPerDay: effectiveDays > 0 ? totalClicks / effectiveDays : 0,
      averageCostPerDay: effectiveDays > 0 ? totalCost / effectiveDays : 0,
      averageConversionsPerDay: effectiveDays > 0 ? totalConversions / effectiveDays : 0,
      workingDays,
    };
    
    debugLog('PpcReport: calculated summary metrics:', result);
    return result;
  }, [filteredGoogleAdsData, daysBetween]);

  // Calculate all-time metrics for KPI cards consistency with income when rangeKey === 'all'
  const allTimeMetrics = useMemo(() => {
    debugLog('PpcReport: calculating all-time metrics from full data:', googleAdsData);
    
    const totalImpressions = googleAdsData.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalClicks = googleAdsData.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const totalCost = googleAdsData.reduce((sum, row) => sum + (row.cost || 0), 0);
    const totalConversions = googleAdsData.reduce((sum, row) => sum + (row.conversions || 0), 0);
    
    // Calculate working days (days with actual spend) from all data
    const workingDays = googleAdsData.filter(row => (row.cost || 0) > 0).length;
    const totalDays = googleAdsData.length;
    const effectiveDays = workingDays > 0 ? workingDays : totalDays;
    
    const result = {
      totalImpressions,
      totalClicks,
      totalCost,
      totalConversions,
      averageImpressionsPerDay: effectiveDays > 0 ? totalImpressions / effectiveDays : 0,
      averageClicksPerDay: effectiveDays > 0 ? totalClicks / effectiveDays : 0,
      averageCostPerDay: effectiveDays > 0 ? totalCost / effectiveDays : 0,
      averageConversionsPerDay: effectiveDays > 0 ? totalConversions / effectiveDays : 0,
      workingDays,
    };
    
    debugLog('PpcReport: calculated all-time metrics:', result);
    return result;
  }, [googleAdsData]);

  const performanceMetrics = useMemo(() => ([
    {
      key: 'impressions',
      label: 'Impressions',
      value: formatNumber(summaryMetrics.totalImpressions),
      subLabel: `${formatNumber(summaryMetrics.averageImpressionsPerDay)}/day`,
    },
    {
      key: 'clicks',
      label: 'Clicks',
      value: formatNumber(summaryMetrics.totalClicks),
      subLabel: `${formatNumber(summaryMetrics.averageClicksPerDay)}/day`,
    },
    {
      key: 'cost',
      label: 'Cost',
      value: formatCurrency(summaryMetrics.totalCost),
      valueColor: colours.red,
      subLabel: `${formatCurrency(summaryMetrics.averageCostPerDay)}/day`,
    },
    {
      key: 'conversions',
      label: 'Conversions',
      value: formatNumber(summaryMetrics.totalConversions),
      subLabel: `${formatPercentage(summaryMetrics.conversionRate)} rate`,
    },
    {
      key: 'ctr',
      label: 'CTR',
      value: formatPercentage(summaryMetrics.averageCtr),
      subLabel: 'avg',
    },
    {
      key: 'cpc',
      label: 'CPC',
      value: formatCurrency(summaryMetrics.averageCpc),
      subLabel: 'avg',
    },
    {
      key: 'cpa',
      label: 'CPA',
      value: formatCurrency(summaryMetrics.averageCpa),
      subLabel: 'avg',
    },
  ]), [summaryMetrics]);

  const incomeRangeSummary = useMemo(() => {
    if (!ppcIncomeMetrics) {
      return null;
    }
    const start = rangeKey === 'all' ? null : new Date(activeStart.getTime());
    if (start) {
      start.setHours(0, 0, 0, 0);
    }
    const end = rangeKey === 'all' ? null : new Date(activeEnd.getTime());
    if (end) {
      end.setHours(23, 59, 59, 999);
    }

    const breakdown: AugmentedIncomeRow[] = ppcIncomeMetrics.breakdown.map((item) => {
      const paymentsInRange = item.payments.filter((payment) => {
        if (!payment.paymentDate) {
          return false;
        }
        const paymentDate = new Date(payment.paymentDate);
        if (Number.isNaN(paymentDate.getTime())) {
          return false;
        }
        if (!start || !end) {
          return true;
        }
        return paymentDate >= start && paymentDate <= end;
      });

      const totalInRange = paymentsInRange.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      return {
        ...item,
        paymentsInRange,
        totalInRange,
      };
    });

    const totalRevenue = breakdown.reduce((sum, item) => sum + (item.totalInRange || 0), 0);
    const mattersWithRevenue = breakdown.filter((item) => (item.totalInRange || 0) > 0).length;

    return {
      breakdown,
      totalRevenue,
      mattersWithRevenue,
    };
  }, [ppcIncomeMetrics, rangeKey, activeStart, activeEnd]);

  useEffect(() => {
    if (incomeRangeSummary) {
      debugLog('PpcReport: filtered PPC income summary', {
        rangeKey,
        totalRevenue: incomeRangeSummary.totalRevenue,
        mattersWithRevenue: incomeRangeSummary.mattersWithRevenue,
      });
    }
  }, [incomeRangeSummary, rangeKey]);

  const effectiveIncomeBreakdown: AugmentedIncomeRow[] = useMemo(() => {
    if (incomeRangeSummary?.breakdown) {
      return incomeRangeSummary.breakdown;
    }
    if (ppcIncomeMetrics?.breakdown) {
      return ppcIncomeMetrics.breakdown;
    }
    return [];
  }, [incomeRangeSummary, ppcIncomeMetrics]);

  const topIncomeRows = useMemo(() => {
    return [...effectiveIncomeBreakdown]
      .sort((a, b) => {
        const aTotal = typeof a.totalInRange === 'number' ? a.totalInRange : a.totalCollected;
        const bTotal = typeof b.totalInRange === 'number' ? b.totalInRange : b.totalCollected;
        return bTotal - aTotal;
      })
      .slice(0, 5);
  }, [effectiveIncomeBreakdown]);

  const allTimeTooltipContent = useMemo(() => {
    if (!ppcIncomeMetrics) {
      return null;
    }
    const { summary } = ppcIncomeMetrics;
    return (
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : '#ffffff',
          boxShadow: isDarkMode
            ? '0 6px 18px rgba(0, 0, 0, 0.35)'
            : '0 8px 24px rgba(15, 23, 42, 0.12)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.18)'}`,
          maxWidth: 260,
          fontSize: 11.5,
          color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          All-time • {summary.mattersWithRevenue}/{summary.totalMatters} matters with revenue
        </span>
        <span>
          All-time {formatCurrency(summary.totalRevenue)} • ≤7d {formatCurrency(summary.revenue7d)} • ≤30d {formatCurrency(summary.revenue30d)}
        </span>
      </div>
    );
  }, [ppcIncomeMetrics, isDarkMode]);

  const allTimeTooltipProps = useMemo<ITooltipProps | undefined>(() => {
    if (!allTimeTooltipContent) {
      return undefined;
    }
    return {
      directionalHint: DirectionalHint.bottomCenter,
      onRenderContent: () => allTimeTooltipContent,
      calloutProps: {
        isBeakVisible: false,
        gapSpace: 8,
        setInitialFocus: false,
      },
    };
  }, [allTimeTooltipContent]);

  const selectedRangeRevenue = incomeRangeSummary?.totalRevenue ?? ppcIncomeMetrics?.summary.totalRevenue ?? 0;
  const selectedMattersWithRevenue = incomeRangeSummary?.mattersWithRevenue ?? ppcIncomeMetrics?.summary.mattersWithRevenue ?? 0;
  const totalMattersTracked = ppcIncomeMetrics?.summary.totalMatters ?? 0;
  const totalIncomeAllTime = ppcIncomeMetrics?.summary.totalRevenue ?? 0;
  const incomeWithin7Days = ppcIncomeMetrics?.summary.revenue7d ?? 0;
  const incomeWithin30Days = ppcIncomeMetrics?.summary.revenue30d ?? 0;
  
  // Use consistent metrics for ROAS calculation - both revenue and spend from same period
  const relevantSpend = rangeKey === 'all' ? allTimeMetrics.totalCost : summaryMetrics.totalCost;
  const roasActual = relevantSpend > 0 ? selectedRangeRevenue / relevantSpend : 0;
  
  const unmatchedCount = ppcIncomeMetrics?.debug?.unmatchedCount ?? ppcIncomeMetrics?.unmatchedPayments?.length ?? 0;

  const isCustomRange = rangeKey === 'custom';
  const activePresetKey = rangeKey !== 'custom' ? rangeKey : null;
  const formattedFromLabel = formatDateTag(rangeStart);
  const formattedToLabel = formatDateTag(rangeEnd);

  const dashboardThemeClass = isDarkMode ? 'dark-theme' : 'light-theme';

  return (
    <div style={{ 
      padding: 0, 
      background: 'transparent',
      minHeight: '100vh'
    }}>
      {/* Data Source System Stamp + Params - positioned above date ranges */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          padding: 8,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: '100%',
          background: isDarkMode
            ? 'rgba(15,23,42,0.4)'
            : 'rgba(248,250,252,0.6)',
          border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.12)'}`,
          fontSize: 11,
          opacity: 0.8
        }}>
          <div style={{
            flex: '0 0 auto', width: 18, height: 18, borderRadius: 4, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDarkMode ? 'rgba(2,6,23,0.4)' : 'rgba(241,245,249,0.6)'
          }}>
            <img src={require('../../assets/grey helix mark.png')} alt="Helix" style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.7 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)'
            }} />
            <span style={{ fontWeight: 600, opacity: 0.9 }}>Google Ads</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span style={{ opacity: 0.7 }}>774-810-8809</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span style={{ opacity: 0.7 }}>googleapis/adwords</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{
            display: 'flex', alignItems: 'center',
            fontSize: 11, opacity: 0.75
          }}>
            <span style={{ opacity: 0.8 }}>sync {lastSyncLabel}</span>
          </div>
        </div>
      </div>

  <div className="filter-toolbar" style={{ marginBottom: 28 }}>
        <div className="filter-toolbar__top">
          <div className="filter-toolbar__date-inputs">
            {isCustomRange ? (
              <div className="date-pickers">
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={startDate}
                  onSelectDate={(date) => handleCustomDateChange(date ?? undefined, endDate)}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={(date) => date?.toLocaleDateString('en-GB') || ''}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={endDate}
                  onSelectDate={(date) => handleCustomDateChange(startDate, date ?? undefined)}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={(date) => date?.toLocaleDateString('en-GB') || ''}
                />
              </div>
            ) : (
              <div className="date-stamp-group">
                {rangeKey === 'all' ? (
                  <button
                    type="button"
                    className="date-stamp-button"
                    style={dateStampButtonStyle(isDarkMode)}
                    onClick={handleActivateCustomRange}
                    title="Click to customise the date range"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>Range</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>All Time</span>
                  </button>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </div>

          <div className="filter-toolbar__actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DefaultButton
                text={isFetching ? 'Refreshing…' : 'Refresh data'}
                iconProps={{ iconName: 'Refresh' }}
                onClick={refresh}
                disabled={isFetching}
                styles={subtleActionButtonStyles(isDarkMode)}
              />
            </div>
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

  {/* Key KPI Cards - Spend and Income */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: 20, 
        marginBottom: 24 
      }}>
        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Ad Spend</span>
          </div>
          <span style={{ fontSize: 32, fontWeight: 700, color: colours.red }}>
            {formatCurrency(rangeKey === 'all' ? allTimeMetrics.totalCost : summaryMetrics.totalCost)}
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {rangeKey === 'all' 
              ? `${formatCurrency(allTimeMetrics.averageCostPerDay)}/day avg across ${allTimeMetrics.workingDays} working ${allTimeMetrics.workingDays === 1 ? 'day' : 'days'} (all-time)`
              : `${formatCurrency(summaryMetrics.averageCostPerDay)}/day avg across ${summaryMetrics.workingDays} working ${summaryMetrics.workingDays === 1 ? 'day' : 'days'}`
            }
          </span>
        </div>




        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="TrendingUp" style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Income</span>
          </div>
          {ppcIncomeMetrics === null ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
              <Spinner size={SpinnerSize.medium} label="Loading income data..." labelPosition="bottom" />
            </div>
          ) : ppcIncomeMetrics ? (
            <>
              <span style={{ fontSize: 32, fontWeight: 700, color: colours.highlight }}>
                {formatCurrency(selectedRangeRevenue)}
              </span>
              <span style={{ fontSize: 12, opacity: 0.65 }}>
                {rangeKey === 'all' ? 'All-time' : 'Selected range'} • {selectedMattersWithRevenue}/{totalMattersTracked} matters with revenue
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 24, fontWeight: 400, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                No Data
              </span>
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Revenue tracking unavailable
              </span>
            </>
          )}
        </div>
      </div>

      {/* Compact Metrics Banner */}
      <div style={{
        background: isDarkMode
          ? 'rgba(15, 23, 42, 0.4)'
          : 'rgba(248, 250, 252, 0.6)',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
        borderRadius: 8,
        padding: '14px 18px',
        marginBottom: 32
      }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 90px 95px 95px',
            columnGap: 24,
            rowGap: 16,
          }}
        >
          {performanceMetrics.map((metric, index) => {
            const isEndOfRow = (index % 4) === 3;
            const showDivider = !isEndOfRow && (index < performanceMetrics.length - 1);
            return (
              <div
                key={metric.key}
                style={{
                  position: 'relative',
                  paddingRight: showDivider ? 12 : 0,
                }}
              >
                <div style={{ opacity: 0.6, fontSize: 9, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {metric.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: metric.valueColor }}>
                  {metric.value}
                </div>
                <div style={{ opacity: 0.5, fontSize: 9 }}>
                  {metric.subLabel}
                </div>
                {showDivider && (
                  <div
                    style={{
                      position: 'absolute',
                      right: -12,
                      top: 0,
                      width: 1,
                      height: 36,
                      background: isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.15)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Performance Table (collapsible card) */}
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
        <div
          role="button"
          aria-expanded={showDaily}
          onClick={() => setShowDaily(v => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDaily(v => !v); } }}
          tabIndex={0}
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            margin: showDaily ? '0 0 16px 0' : '0 0 0 0', cursor: 'pointer', minHeight: 32,
            transition: 'margin 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon iconName="BarChartVertical" style={{ fontSize: 16, color: colours.highlight }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: isDarkMode ? '#E2E8F0' : colours.missedBlue }}>
              Daily Performance Breakdown
            </span>
            <span style={{ 
              fontSize: 11, opacity: showDaily ? 0 : 0.65, fontWeight: 500,
              transition: 'opacity 0.3s ease',
              overflow: 'hidden',
              maxWidth: showDaily ? '0px' : '300px',
              whiteSpace: 'nowrap'
            }}>
              {(() => {
                if (filteredGoogleAdsData.length === 0) return 'No data';
                
                // Filter to working days (days with cost > 0)
                const workingDays = filteredGoogleAdsData.filter(r => (r.cost || 0) > 0);
                const workingDayCount = workingDays.length;
                
                if (workingDayCount === 0) return `${filteredGoogleAdsData.length} days • No spend`;
                
                const totalCost = workingDays.reduce((sum, r) => sum + (r.cost || 0), 0);
                const avgDailySpend = totalCost / workingDayCount;
                
                return `${workingDayCount} working days • ${formatCurrency(avgDailySpend)} avg daily spend`;
              })()}
            </span>
          </div>
          <Icon iconName={showDaily ? 'ChevronUp' : 'ChevronRight'} style={{ fontSize: 16, opacity: 0.85 }} />
        </div>

        {showDaily && (() => {
          // Build a map of daily income from effective breakdown
          const dailyIncomeMap = new Map<string, number>();
          if (effectiveIncomeBreakdown && effectiveIncomeBreakdown.length > 0) {
            effectiveIncomeBreakdown.forEach((item) => {
              const paymentsToAggregate = Array.isArray(item.paymentsInRange) && item.paymentsInRange.length > 0
                ? item.paymentsInRange
                : item.payments;
              
              paymentsToAggregate.forEach((payment) => {
                if (payment.paymentDate && payment.amount) {
                  const paymentDate = new Date(payment.paymentDate);
                  if (!Number.isNaN(paymentDate.getTime())) {
                    const dateKey = paymentDate.toISOString().split('T')[0];
                    const current = dailyIncomeMap.get(dateKey) || 0;
                    dailyIncomeMap.set(dateKey, current + payment.amount);
                  }
                }
              });
            });
          }

          // Create day groups combining Google Ads data and Meta enquiries
          const dayGroupsMap = new Map<string, { 
            date: string; 
            googleAds?: GoogleAdsRow; 
            metaEnquiries: MetaEnquiry[]; 
          }>();

          // Add Google Ads data
          filteredGoogleAdsData.forEach(row => {
            dayGroupsMap.set(row.date, { 
              date: row.date, 
              googleAds: row, 
              metaEnquiries: [] 
            });
          });

          // Add Meta enquiries to corresponding dates
          metaEnquiries.forEach(enquiry => {
            const existing = dayGroupsMap.get(enquiry.date);
            if (existing) {
              existing.metaEnquiries.push(enquiry);
            } else {
              dayGroupsMap.set(enquiry.date, { 
                date: enquiry.date, 
                metaEnquiries: [enquiry] 
              });
            }
          });

          // Convert to sorted array (newest first)
          const dayGroups = Array.from(dayGroupsMap.values())
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 50); // Limit to 50 days for performance

          return dayGroups.length > 0 ? (
            <div style={{ paddingTop: 20 }}>
              {dayGroups.map((dayGroup, index) => {
                const row = dayGroup.googleAds;
                const metaEnquiryCount = dayGroup.metaEnquiries.reduce((sum, e) => sum + (e.enquiries || 0), 0);
                const dayIncome = dailyIncomeMap.get(dayGroup.date) || 0;
                const formattedDate = new Date(dayGroup.date).toLocaleDateString('en-GB', { 
                  day: '2-digit', 
                  month: 'short',
                  year: 'numeric'
                });
                const weekday = new Date(dayGroup.date).toLocaleDateString('en-GB', { weekday: 'short' });

                return (
                  <div key={dayGroup.date} style={{ 
                    marginBottom: 16,
                    borderRadius: 8,
                    background: isDarkMode ? 'linear-gradient(135deg, #0B1220 0%, #141C2C 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                    border: isDarkMode ? '1px solid rgba(148,163,184,0.14)' : '1px solid rgba(13,47,96,0.06)',
                    overflow: 'hidden'
                  }}>
                    {/* Day Header */}
                    <div style={{ 
                      padding: '12px 16px',
                      background: isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(13,47,96,0.03)',
                      borderBottom: isDarkMode ? '1px solid rgba(148,163,184,0.12)' : '1px solid rgba(13,47,96,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ 
                        fontWeight: 600,
                        fontSize: 13,
                        color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <Icon iconName="Calendar" style={{ fontSize: 12, opacity: 0.7 }} />
                        <span>{formattedDate}</span>
                        <span style={{ opacity: 0.6, fontSize: 11 }}>({weekday})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {dayIncome > 0 && (
                          <div style={{
                            background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                            border: `1.5px solid ${isDarkMode ? colours.green : colours.highlight}`,
                            color: isDarkMode ? colours.green : colours.highlight,
                            padding: '4px 12px',
                            borderRadius: 14,
                            fontSize: 11,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: isDarkMode 
                              ? '0 2px 6px rgba(32, 178, 108, 0.2)' 
                              : '0 2px 6px rgba(54, 144, 206, 0.15)'
                          }}>
                            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, opacity: 0.9 }}>INCOME</span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{formatCurrency(dayIncome)}</span>
                          </div>
                        )}
                        {metaEnquiryCount > 0 && (
                          <div style={{
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                            color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 600
                          }}>
                            {metaEnquiryCount} Meta {metaEnquiryCount === 1 ? 'Enquiry' : 'Enquiries'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '12px 16px' }}>
                      {row ? (
                        <>
                          {(() => {
                            const dayMetrics = [
                              {
                                key: 'impressions',
                                label: 'Impressions',
                                value: formatFullNumber(row.impressions || 0),
                              },
                              {
                                key: 'clicks',
                                label: 'Clicks',
                                value: formatFullNumber(row.clicks || 0),
                              },
                              {
                                key: 'cost',
                                label: 'Cost',
                                value: formatCurrency(row.cost || 0),
                                valueColor: colours.red,
                              },
                              {
                                key: 'conversions',
                                label: 'Conversions',
                                value: formatFullNumber(Math.round(row.conversions || 0)),
                              },
                              {
                                key: 'ctr',
                                label: 'CTR',
                                value: formatPercentage(row.ctr || 0),
                              },
                              {
                                key: 'cpc',
                                label: 'CPC',
                                value: formatCurrency(row.cpc || 0),
                              },
                              {
                                key: 'cpa',
                                label: 'CPA',
                                value: row.cpa && row.cpa > 0 ? formatCurrency(row.cpa) : '—',
                              },
                            ];

                            return (
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '110px 90px 95px 95px',
                                  columnGap: 24,
                                  rowGap: 12,
                                  fontSize: 12,
                                  marginBottom: expandedDays.has(dayGroup.date) ? 16 : 0,
                                }}
                              >
                                {dayMetrics.map((metric, metricIndex) => {
                                  const isEndOfRow = (metricIndex % 4) === 3;
                                  const showDivider = !isEndOfRow && (metricIndex < dayMetrics.length - 1);
                                  return (
                                    <div
                                      key={metric.key}
                                      style={{
                                        position: 'relative',
                                        paddingRight: showDivider ? 12 : 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                      }}
                                    >
                                      <div style={{ opacity: 0.7, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                        {metric.label}
                                      </div>
                                      <div style={{ fontWeight: 600, color: metric.valueColor }}>
                                        {metric.value}
                                      </div>
                                      {showDivider && (
                                        <div
                                          style={{
                                            position: 'absolute',
                                            right: -12,
                                            top: 0,
                                            width: 1,
                                            height: 32,
                                            background: isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.15)',
                                          }}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Expandable income breakdown */}
                          {dayIncome > 0 && (
                            <>
                              <div style={{
                                marginTop: 12,
                                paddingTop: 12,
                                borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(13,47,96,0.06)'}`,
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedDays);
                                    if (newExpanded.has(dayGroup.date)) {
                                      newExpanded.delete(dayGroup.date);
                                    } else {
                                      newExpanded.add(dayGroup.date);
                                    }
                                    setExpandedDays(newExpanded);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: 8,
                                    background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                                    border: `1.5px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(54, 144, 206, 0.25)'}`,
                                    color: isDarkMode ? colours.green : colours.highlight,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.14)' : 'rgba(54, 144, 206, 0.12)';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(54, 144, 206, 0.35)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(54, 144, 206, 0.06)';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(54, 144, 206, 0.25)';
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon iconName="BulletedList" style={{ fontSize: 14 }} />
                                    <span>Income Breakdown</span>
                                    <span style={{ 
                                      fontSize: 10, 
                                      fontWeight: 600, 
                                      opacity: 0.8,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(54, 144, 206, 0.15)',
                                    }}>
                                      {(() => {
                                        const dayMatters = effectiveIncomeBreakdown.filter((item) => {
                                          const paymentsToCheck = Array.isArray(item.paymentsInRange) && item.paymentsInRange.length > 0
                                            ? item.paymentsInRange
                                            : item.payments;
                                          return paymentsToCheck.some((payment) => {
                                            if (!payment.paymentDate) return false;
                                            const paymentDate = new Date(payment.paymentDate);
                                            if (Number.isNaN(paymentDate.getTime())) return false;
                                            const paymentDateKey = paymentDate.toISOString().split('T')[0];
                                            return paymentDateKey === dayGroup.date;
                                          });
                                        });
                                        return `${dayMatters.length} ${dayMatters.length === 1 ? 'matter' : 'matters'}`;
                                      })()}
                                    </span>
                                  </span>
                                  <Icon iconName={expandedDays.has(dayGroup.date) ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 14 }} />
                                </button>
                              </div>

                              {expandedDays.has(dayGroup.date) && (() => {
                                // Filter matters with payments on this day
                                const dayMatters = effectiveIncomeBreakdown
                                  .map((item) => {
                                    const paymentsToCheck = Array.isArray(item.paymentsInRange) && item.paymentsInRange.length > 0
                                      ? item.paymentsInRange
                                      : item.payments;
                                    const dayPayments = paymentsToCheck.filter((payment) => {
                                      if (!payment.paymentDate) return false;
                                      const paymentDate = new Date(payment.paymentDate);
                                      if (Number.isNaN(paymentDate.getTime())) return false;
                                      const paymentDateKey = paymentDate.toISOString().split('T')[0];
                                      return paymentDateKey === dayGroup.date;
                                    });
                                    if (dayPayments.length === 0) return null;
                                    const dayTotal = dayPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                                    return {
                                      ...item,
                                      dayPayments,
                                      dayTotal,
                                    };
                                  })
                                  .filter(Boolean)
                                  .sort((a, b) => (b?.dayTotal || 0) - (a?.dayTotal || 0));

                                return (
                                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {dayMatters.map((matter, idx) => {
                                      if (!matter) return null;
                                      const matterKey = `${dayGroup.date}-${matter.matterId || matter.displayNumber || matter.clientName || matter.enquiryId || `matter-${idx}`}`;
                                      const isExpanded = expandedMatters.has(matterKey);
                                      
                                      return (
                                        <div
                                          key={matterKey}
                                          style={{
                                            borderRadius: 6,
                                            background: isDarkMode ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.9)',
                                            border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.18)'}`,
                                            overflow: 'hidden',
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newExpanded = new Set(expandedMatters);
                                              if (newExpanded.has(matterKey)) {
                                                newExpanded.delete(matterKey);
                                              } else {
                                                newExpanded.add(matterKey);
                                              }
                                              setExpandedMatters(newExpanded);
                                            }}
                                            style={{
                                              width: '100%',
                                              padding: '10px 12px',
                                              background: 'transparent',
                                              border: 'none',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              gap: 12,
                                              textAlign: 'left',
                                              transition: 'background 0.15s ease',
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.04)' : 'rgba(148,163,184,0.03)';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = 'transparent';
                                            }}
                                          >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontWeight: 600, fontSize: 13 }}>
                                                {matter.displayNumber || matter.matterId || 'Matter'}
                                              </div>
                                              {matter.clientName && (
                                                <div style={{ opacity: 0.6, marginTop: 2, fontSize: 11, fontWeight: 500 }}>
                                                  {matter.clientName}
                                                </div>
                                              )}
                                            </div>
                                            <div style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: 10,
                                              flexShrink: 0,
                                            }}>
                                              <div style={{ fontWeight: 700, color: isDarkMode ? colours.green : colours.highlight, fontSize: 14 }}>
                                                {formatCurrency(matter.dayTotal)}
                                              </div>
                                              {matter.dayPayments.length > 1 && (
                                                <>
                                                  <div style={{ 
                                                    fontSize: 10, 
                                                    fontWeight: 600, 
                                                    opacity: 0.6,
                                                    padding: '2px 5px',
                                                    borderRadius: 3,
                                                    background: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.08)',
                                                  }}>
                                                    {matter.dayPayments.length}
                                                  </div>
                                                  <Icon 
                                                    iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'} 
                                                    style={{ fontSize: 12, opacity: 0.5 }} 
                                                  />
                                                </>
                                              )}
                                            </div>
                                          </button>
                                          
                                          {isExpanded && matter.dayPayments.length > 0 && (
                                            <div style={{ 
                                              padding: '0 12px 10px 12px',
                                              borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.08)'}`,
                                            }}>
                                              <div style={{ 
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 6,
                                                marginTop: 8,
                                              }}>
                                                {matter.dayPayments.map((payment, pidx) => (
                                                  <div key={pidx} style={{ 
                                                    fontSize: 11, 
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'flex-start',
                                                    gap: 12,
                                                    paddingLeft: 8,
                                                  }}>
                                                    <div style={{ opacity: 0.7, flex: 1 }}>
                                                      {payment.description || 'Payment'}
                                                    </div>
                                                    <div style={{ fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>
                                                      {formatCurrency(payment.amount)}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </>
                      ) : (
                        <div style={{ 
                          opacity: 0.6, 
                          fontSize: 11, 
                          fontStyle: 'italic',
                          textAlign: 'center',
                          padding: 8
                        }}>
                          No Google Ads data for this day
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: 40, 
              opacity: 0.6,
              fontSize: 14
            }}>
              No data available for the selected date range
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default PpcReport;