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
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { debugLog, debugWarn } from '../../utils/debug';
import './ManagementDashboard.css';

// Ensure Fluent UI icons are available (fixes warnings for 'target', 'trendingup', etc.)
initializeIcons();

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
  if (num < 1000) return num.toString();
  if (num < 1000000) return `${(num / 1000).toFixed(1)}k`;
  return `${(num / 1000000).toFixed(1)}m`;
};

const formatFullNumber = (num: number): string => {
  return num.toLocaleString('en-US');
};

const formatPercentage = (num: number): string => {
  return `${num.toFixed(1)}%`;
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
}) => {
  const { isDarkMode } = useTheme();
  const [{ start: rangeStart, end: rangeEnd }, setRangeState] = useState(() => computeRange('all'));
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  
  // Ensure googleAdsData is always an array and transform the data structure
  const [googleAdsData] = useState<GoogleAdsRow[]>(() => {
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
  const transformed = rawArray.map(item => {
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
      } else {
        // Already in correct format
        debugLog('PpcReport: using direct GoogleAdsRow format:', item);
        return item as GoogleAdsRow;
      }
    });
    
    debugLog('PpcReport: transformed googleAdsData:', transformed);
    return transformed;
  });

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
      averageImpressionsPerDay: daysBetween > 0 ? totalImpressions / daysBetween : 0,
      averageClicksPerDay: daysBetween > 0 ? totalClicks / daysBetween : 0,
      averageCostPerDay: daysBetween > 0 ? totalCost / daysBetween : 0,
      averageConversionsPerDay: daysBetween > 0 ? totalConversions / daysBetween : 0,
    };
    
    debugLog('PpcReport: calculated summary metrics:', result);
    return result;
  }, [filteredGoogleAdsData, daysBetween]);

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
      <div className="filter-toolbar">
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
              {googleAdsData && googleAdsData.length > 0 && (
                <DefaultButton
                  text={showPreview ? 'Hide preview' : 'Preview data'}
                  iconProps={{ iconName: showPreview ? 'Hide3' : 'View' }}
                  onClick={() => setShowPreview(v => !v)}
                  styles={subtleActionButtonStyles(isDarkMode)}
                />
              )}
              {/* Daily breakdown toggle moved to collapsible card header below */}
            </div>
          </div>
        </div>
        {showPreview && (
          <div style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(248,250,252,0.85)',
            border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.18)'}`,
          }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
              <div>
                <span style={{ opacity: 0.7 }}>Rows (all): </span>
                <strong>{googleAdsData.length}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>Rows (filtered): </span>
                <strong>{filteredGoogleAdsData.length}</strong>
              </div>
              {googleAdsData.length > 0 && (
                <div>
                  <span style={{ opacity: 0.7 }}>Dates: </span>
                  {(() => {
                    const dates = googleAdsData
                      .map(r => new Date(r.date))
                      .sort((a, b) => a.getTime() - b.getTime());
                    const first = dates[0]?.toLocaleDateString('en-GB');
                    const last = dates[dates.length - 1]?.toLocaleDateString('en-GB');
                    return <strong>{first} → {last}</strong>;
                  })()}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon iconName="Info" />
                <span>Sample rows (first {Math.min(5, filteredGoogleAdsData.length || 5)}):</span>
              </div>
              <pre style={{
                margin: 0,
                maxHeight: 180,
                overflow: 'auto',
                padding: 8,
                background: isDarkMode ? 'rgba(2,6,23,0.5)' : 'rgba(255,255,255,0.8)',
                border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.16)'}`,
                borderRadius: 6,
              }}>
{JSON.stringify(filteredGoogleAdsData.slice(0, 5), null, 2)}
              </pre>
            </div>
          </div>
        )}

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

      {/* Data Source System Stamp + Params - moved to top */}
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
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            fontSize: 11, opacity: 0.75
          }}>
            <span>
              {(() => {
                if (rangeKey === 'all' && googleAdsData.length > 0) {
                  const dates = googleAdsData
                    .map(r => new Date(r.date))
                    .sort((a, b) => a.getTime() - b.getTime());
                  const first = dates[0];
                  const last = dates[dates.length - 1];
                  return `${first.toLocaleDateString('en-GB')} → ${last.toLocaleDateString('en-GB')}`;
                }
                return `${(startDate ?? rangeStart)?.toLocaleDateString('en-GB') || 'auto'} → ${(endDate ?? rangeEnd)?.toLocaleDateString('en-GB') || 'auto'}`;
              })()}
            </span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>{daysBetween} days</span>
          </div>
        </div>
      </div>

      {/* Key KPI Cards - Focus on Spend and Income */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: 20, 
        marginBottom: 24 
      }}>
        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="Money" style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Total Ad Spend</span>
          </div>
          <span style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>
            {formatCurrency(summaryMetrics.totalCost)}
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {formatCurrency(summaryMetrics.averageCostPerDay)}/day avg • {Math.round(summaryMetrics.totalConversions)} conversions
          </span>
        </div>

        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <Icon iconName="TrendingUp" style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Revenue Tracking</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 400, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
            Not Configured
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            Connect revenue data to track actual income vs spend
          </span>
        </div>
      </div>

      {/* Supporting Metrics Table */}
      <div style={{
        background: isDarkMode
          ? 'rgba(15, 23, 42, 0.4)'
          : 'rgba(248, 250, 252, 0.6)',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 32
      }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 600, 
          opacity: 0.8, 
          marginBottom: 12,
          color: isDarkMode ? '#E2E8F0' : colours.missedBlue
        }}>
          Performance Overview
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 16,
          fontSize: 11
        }}>
          <div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Impressions</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{formatNumber(summaryMetrics.totalImpressions)}</div>
            <div style={{ opacity: 0.6, fontSize: 10 }}>{formatNumber(summaryMetrics.averageImpressionsPerDay)}/day</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Clicks</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: colours.highlight }}>{formatNumber(summaryMetrics.totalClicks)}</div>
            <div style={{ opacity: 0.6, fontSize: 10 }}>{formatNumber(summaryMetrics.averageClicksPerDay)}/day</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Click-through Rate</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{formatPercentage(summaryMetrics.averageCtr)}</div>
            <div style={{ opacity: 0.6, fontSize: 10 }}>average CTR</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Cost per Click</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(summaryMetrics.averageCpc)}</div>
            <div style={{ opacity: 0.6, fontSize: 10 }}>average CPC</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Conversion Rate</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{formatPercentage(summaryMetrics.conversionRate)}</div>
            <div style={{ opacity: 0.6, fontSize: 10 }}>of clicks convert</div>
          </div>
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
                      {metaEnquiryCount > 0 && (
                        <div style={{
                          background: colours.highlight,
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 600
                        }}>
                          {metaEnquiryCount} Meta {metaEnquiryCount === 1 ? 'Enquiry' : 'Enquiries'}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '12px 16px' }}>
                      {row ? (
                        <div style={{ 
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                          gap: 12,
                          fontSize: 12
                        }}>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>Impressions</div>
                            <div style={{ fontWeight: 600 }}>{formatFullNumber(row.impressions || 0)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>Clicks</div>
                            <div style={{ fontWeight: 600, color: colours.highlight }}>{row.clicks || 0}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>Cost</div>
                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(row.cost || 0)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>Conversions</div>
                            <div style={{ fontWeight: 600, color: colours.highlight }}>{Math.round(row.conversions || 0)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>CTR</div>
                            <div style={{ fontWeight: 600 }}>{formatPercentage(row.ctr || 0)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>CPC</div>
                            <div style={{ fontWeight: 600 }}>{formatCurrency(row.cpc || 0)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 2 }}>CPA</div>
                            <div style={{ fontWeight: 600 }}>{row.cpa && row.cpa > 0 ? formatCurrency(row.cpa) : '—'}</div>
                          </div>
                        </div>
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