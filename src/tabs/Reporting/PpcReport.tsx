import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { debugLog, debugWarn } from '../../utils/debug';
import ReportShell from './components/ReportShell';
import type { DateRange as SharedDateRange, RangeKey as SharedRangeKey, UseReportRangeReturn } from './hooks/useReportRange';
import type {
  PpcIncomeBreakdown,
  PpcIncomeMetrics,
  PpcIncomePayment,
  PpcMatchKind,
} from './types/ppc';
import './ManagementDashboard.css';

const surface = (isDark: boolean, overrides: CSSProperties = {}): CSSProperties => ({
  background: isDark ? colours.darkBlue : '#ffffff',
  borderRadius: 0,
  border: `0.5px solid ${isDark ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
  boxShadow: isDark ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  padding: '12px 16px',
  ...overrides,
});

// Fluent UI icons are initialised once in src/index.tsx (initializeIcons()).
// Calling it again here triggered "Icon already registered" warnings on every
// PpcReport mount.

type AugmentedIncomeRow = PpcIncomeBreakdown & {
  totalInRange?: number;
  paymentsInRange?: PpcIncomePayment[];
};

interface PpcWeeklyPerformance {
  weekStart: string;
  weekEnd: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  enquiries: number;
  qualifiedEnquiries: number;
  instructions: number;
  verifiedInstructions: number;
  sourceOnlyInstructions: number;
  revenue30d: number;
  revenueAll: number;
  verifiedRevenue30d: number;
  sourceOnlyRevenue30d: number;
  verifiedRevenueAll: number;
  sourceOnlyRevenueAll: number;
  cpl: number | null;
  cpi: number | null;
  payback30d: number | null;
  paybackAll: number | null;
  attributionPct: number | null;
  matters: AugmentedIncomeRow[];
}

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

// Meta enquiry overlay removed 2026-04-30 — Meta surface gated off across Reports.
// See docs/notes/GOOGLE_ADS_REPORTS_PURPOSEFUL_CLARITY_SOURCING_AND_STORED_METRIC_TABLE.md.

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
      // The actual dates are controlled by the shared ReportShell toolbar.
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

const formatFullNumber = (num: number): string => {
  return num.toLocaleString('en-US');
};

const formatPercentage = (num: number): string => {
  return `${num.toFixed(1)}%`;
};

const formatCurrencyPrecise = (amount: number): string => (
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0)
);

const formatMultiple = (value: number | null | undefined): string => (
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}x` : '—'
);

const parseDateLoose = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const toDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isVerifiedPpcMatter = (record: AugmentedIncomeRow): boolean => (
  record.matchKind === 'direct' || record.matchKind === 'email'
);

const getMatchLabel = (matchKind?: PpcMatchKind): string => {
  switch (matchKind) {
    case 'direct':
      return 'Direct';
    case 'email':
      return 'Email';
    case 'source_only':
      return 'Source only';
    default:
      return 'Unknown';
  }
};

const getWeekStart = (value: Date): Date => {
  const start = new Date(value);
  const diff = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getWeekEnd = (value: Date): Date => {
  const end = new Date(value);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const formatWeekWindow = (weekStartKey: string, weekEndKey?: string): string => {
  const start = parseDateLoose(weekStartKey);
  const end = parseDateLoose(weekEndKey || weekStartKey);
  if (!start || !end) {
    return 'Unknown week';
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('en-GB', sameMonth
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short' });
  return `${startLabel} → ${endLabel}`;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
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

const formatDateTag = (date: Date | null): string => {
  if (!date) {
    return 'n/a';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

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
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
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

  const isPresetAvailable = useMemo(
    () => (_key: SharedRangeKey, candidateRange: SharedDateRange | null) => {
      if (!candidateRange || googleAdsData.length === 0) return true;
      return googleAdsData.some((row) => {
        const rowDate = parseDateLoose(row.date);
        return !!rowDate && rowDate >= candidateRange.start && rowDate <= candidateRange.end;
      });
    },
    [googleAdsData],
  );

  // Meta enquiry overlay removed 2026-04-30 — Meta surface gated off across Reports.

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
  const refresh = () => {
    if (!triggerRefresh) {
      return;
    }
    void triggerRefresh();
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

  const selectedRangeRevenue = incomeRangeSummary?.totalRevenue ?? ppcIncomeMetrics?.summary.totalRevenue ?? 0;
  const selectedMattersWithRevenue = incomeRangeSummary?.mattersWithRevenue ?? ppcIncomeMetrics?.summary.mattersWithRevenue ?? 0;
  const totalMattersTracked = ppcIncomeMetrics?.summary.totalMatters ?? 0;
  
  const unmatchedCount = ppcIncomeMetrics?.debug?.unmatchedCount ?? ppcIncomeMetrics?.unmatchedPayments?.length ?? 0;
  const selectedSpend = rangeKey === 'all' ? allTimeMetrics.totalCost : summaryMetrics.totalCost;
  const selectedClicks = rangeKey === 'all' ? allTimeMetrics.totalClicks : summaryMetrics.totalClicks;
  const selectedAdsConversions = rangeKey === 'all' ? allTimeMetrics.totalConversions : summaryMetrics.totalConversions;
  const netReturn = selectedRangeRevenue - selectedSpend;
  const roiPct = selectedSpend > 0 ? ((selectedRangeRevenue - selectedSpend) / selectedSpend) * 100 : null;
  const paybackMultiple = selectedSpend > 0 ? selectedRangeRevenue / selectedSpend : null;

  const isCustomRange = rangeKey === 'custom';
  const formattedFromLabel = formatDateTag(rangeStart);
  const formattedToLabel = formatDateTag(rangeEnd);
  const rangeSummaryLabel = rangeKey === 'all' ? 'All time' : `${formattedFromLabel} → ${formattedToLabel}`;

  const reportQuickRanges = useMemo<UseReportRangeReturn['quickRanges']>(() => ([
    { key: 'all' as RangeKey, label: 'All', get: () => null },
    ...RANGE_OPTIONS.map(({ key, label }) => ({
      key,
      label,
      get: () => computeRange(key),
    })),
  ]), []);

  const setReportCustomDate = useCallback<UseReportRangeReturn['setCustomDate']>((side, date) => {
    const nextStart = side === 'start' ? date ?? undefined : startDate;
    const nextEnd = side === 'end' ? date ?? undefined : endDate;
    if (side === 'start') {
      setStartDate(nextStart);
    } else {
      setEndDate(nextEnd);
    }
    if (nextStart && nextEnd && nextStart <= nextEnd) {
      handleCustomDateChange(nextStart, nextEnd);
    } else {
      setRangeKey('custom');
    }
  }, [endDate, startDate]);

  const reportRangeAdapter = useMemo<UseReportRangeReturn>(() => ({
    rangeKey,
    setRangeKey,
    customDateRange: {
      start: startDate ?? null,
      end: endDate ?? null,
    },
    setCustomDate: setReportCustomDate,
    range: rangeKey === 'all' ? null : { start: rangeStart, end: rangeEnd },
    fromLabel: rangeKey === 'all' ? 'All time' : formattedFromLabel,
    toLabel: rangeKey === 'all' ? 'Now' : formattedToLabel,
    showCustomPickers: isCustomRange,
    handleRangeSelect,
    quickRanges: reportQuickRanges,
    isActive: (key) => rangeKey === key,
  }), [endDate, formattedFromLabel, formattedToLabel, isCustomRange, rangeEnd, rangeKey, rangeStart, reportQuickRanges, setReportCustomDate, startDate]);

  const ppcWeeklyPerformance = useMemo<PpcWeeklyPerformance[]>(() => {
    const weeklyMap = new Map<string, {
      weekStart: string;
      weekEnd: string;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      enquiries: number;
      qualifiedEnquiries: number;
      instructions: number;
      verifiedInstructions: number;
      sourceOnlyInstructions: number;
      revenue30d: number;
      revenueAll: number;
      verifiedRevenue30d: number;
      sourceOnlyRevenue30d: number;
      verifiedRevenueAll: number;
      sourceOnlyRevenueAll: number;
      matters: AugmentedIncomeRow[];
    }>();

    const ensureWeekBucket = (value?: string | null) => {
      const parsed = parseDateLoose(value);
      if (!parsed) {
        return null;
      }
      const weekStart = getWeekStart(parsed);
      const weekEnd = getWeekEnd(weekStart);
      const weekKey = toDayKey(weekStart);
      let bucket = weeklyMap.get(weekKey);
      if (!bucket) {
        bucket = {
          weekStart: weekKey,
          weekEnd: toDayKey(weekEnd),
          impressions: 0,
          clicks: 0,
          spend: 0,
          conversions: 0,
          enquiries: 0,
          qualifiedEnquiries: 0,
          instructions: 0,
          verifiedInstructions: 0,
          sourceOnlyInstructions: 0,
          revenue30d: 0,
          revenueAll: 0,
          verifiedRevenue30d: 0,
          sourceOnlyRevenue30d: 0,
          verifiedRevenueAll: 0,
          sourceOnlyRevenueAll: 0,
          matters: [],
        };
        weeklyMap.set(weekKey, bucket);
      }
      return bucket;
    };

    googleAdsData.forEach((row) => {
      const bucket = ensureWeekBucket(row.date);
      if (!bucket) {
        return;
      }
      bucket.impressions += row.impressions || 0;
      bucket.clicks += row.clicks || 0;
      bucket.spend += row.cost || 0;
      bucket.conversions += row.conversions || 0;
    });

    (ppcIncomeMetrics?.enquirySnapshots || []).forEach((snapshot) => {
      const bucket = ensureWeekBucket(snapshot.enquiryDate);
      if (!bucket) {
        return;
      }
      bucket.enquiries += 1;
      if (snapshot.linkedToMatter) {
        bucket.qualifiedEnquiries += 1;
      }
    });

    effectiveIncomeBreakdown.forEach((record) => {
      const bucket = ensureWeekBucket(record.enquiryDate || record.openDate);
      if (!bucket) {
        return;
      }
      const revenue30d = record.collectedWithin30Days || 0;
      const revenueAll = typeof record.totalInRange === 'number' ? record.totalInRange : record.totalCollected;
      const verified = isVerifiedPpcMatter(record);

      bucket.instructions += 1;
      if (verified) {
        bucket.verifiedInstructions += 1;
        bucket.verifiedRevenue30d += revenue30d;
        bucket.verifiedRevenueAll += revenueAll;
      } else {
        bucket.sourceOnlyInstructions += 1;
        bucket.sourceOnlyRevenue30d += revenue30d;
        bucket.sourceOnlyRevenueAll += revenueAll;
      }
      bucket.revenue30d += revenue30d;
      bucket.revenueAll += revenueAll;
      bucket.matters.push(record);
    });

    const sorted = Array.from(weeklyMap.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((bucket) => ({
        ...bucket,
        cpl: bucket.qualifiedEnquiries > 0 ? bucket.spend / bucket.qualifiedEnquiries : null,
        cpi: bucket.verifiedInstructions > 0 ? bucket.spend / bucket.verifiedInstructions : null,
        payback30d: bucket.spend > 0 ? bucket.revenue30d / bucket.spend : null,
        paybackAll: bucket.spend > 0 ? bucket.revenueAll / bucket.spend : null,
        attributionPct: bucket.enquiries > 0 ? (bucket.qualifiedEnquiries / bucket.enquiries) * 100 : null,
        matters: [...bucket.matters].sort((a, b) => {
          const aRevenue = typeof a.totalInRange === 'number' ? a.totalInRange : a.totalCollected;
          const bRevenue = typeof b.totalInRange === 'number' ? b.totalInRange : b.totalCollected;
          return bRevenue - aRevenue;
        }),
      }));

    if (rangeKey === 'all') {
      return sorted;
    }

    const rangeStartBoundary = new Date(activeStart.getTime());
    rangeStartBoundary.setHours(0, 0, 0, 0);
    const rangeEndBoundary = new Date(activeEnd.getTime());
    rangeEndBoundary.setHours(23, 59, 59, 999);

    return sorted.filter((week) => {
      const weekStart = parseDateLoose(week.weekStart);
      const weekEnd = parseDateLoose(week.weekEnd);
      if (!weekStart || !weekEnd) {
        return false;
      }
      return weekEnd >= rangeStartBoundary && weekStart <= rangeEndBoundary;
    });
  }, [googleAdsData, ppcIncomeMetrics?.enquirySnapshots, effectiveIncomeBreakdown, rangeKey, activeStart, activeEnd]);

  const funnelSummary = useMemo(() => (
    ppcWeeklyPerformance.reduce((acc, week) => ({
      spend: acc.spend + week.spend,
      clicks: acc.clicks + week.clicks,
      impressions: acc.impressions + week.impressions,
      enquiries: acc.enquiries + week.enquiries,
      qualifiedEnquiries: acc.qualifiedEnquiries + week.qualifiedEnquiries,
      instructions: acc.instructions + week.instructions,
      verifiedInstructions: acc.verifiedInstructions + week.verifiedInstructions,
      sourceOnlyInstructions: acc.sourceOnlyInstructions + week.sourceOnlyInstructions,
      revenue30d: acc.revenue30d + week.revenue30d,
      revenueAll: acc.revenueAll + week.revenueAll,
      verifiedRevenue30d: acc.verifiedRevenue30d + week.verifiedRevenue30d,
      sourceOnlyRevenue30d: acc.sourceOnlyRevenue30d + week.sourceOnlyRevenue30d,
      verifiedRevenueAll: acc.verifiedRevenueAll + week.verifiedRevenueAll,
      sourceOnlyRevenueAll: acc.sourceOnlyRevenueAll + week.sourceOnlyRevenueAll,
    }), {
      spend: 0,
      clicks: 0,
      impressions: 0,
      enquiries: 0,
      qualifiedEnquiries: 0,
      instructions: 0,
      verifiedInstructions: 0,
      sourceOnlyInstructions: 0,
      revenue30d: 0,
      revenueAll: 0,
      verifiedRevenue30d: 0,
      sourceOnlyRevenue30d: 0,
      verifiedRevenueAll: 0,
      sourceOnlyRevenueAll: 0,
    })
  ), [ppcWeeklyPerformance]);

  const closedWeekKey = useMemo(() => toDayKey(getWeekStart(new Date())), []);

  const drilldownWeeks = useMemo(() => (
    [...ppcWeeklyPerformance].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 13)
  ), [ppcWeeklyPerformance]);

  const verdictModel = useMemo(() => {
    const completedWeeks = ppcWeeklyPerformance.filter((week) => week.weekStart < closedWeekKey && (week.spend > 0 || week.enquiries > 0 || week.verifiedInstructions > 0 || week.sourceOnlyInstructions > 0));
    const focusWeek = completedWeeks[completedWeeks.length - 1] ?? ppcWeeklyPerformance[ppcWeeklyPerformance.length - 1] ?? null;
    if (!focusWeek) {
      return {
        tone: 'neutral' as const,
        label: 'Awaiting signal',
        headline: 'No PPC cohort data yet',
        summary: 'Open the report after the first Google Ads sync and PPC-linked enquiry cohort arrives.',
        focusWeek: null,
        baselineCpi: null as number | null,
        deltaPct: null as number | null,
      };
    }

    const previousWeeks = completedWeeks
      .filter((week) => week.weekStart !== focusWeek.weekStart && typeof week.cpi === 'number' && week.spend > 0)
      .slice(-4);
    const baselineCpi = median(previousWeeks.map((week) => week.cpi as number));
    const deltaPct = baselineCpi && focusWeek.cpi != null
      ? ((focusWeek.cpi - baselineCpi) / baselineCpi) * 100
      : null;

    if (focusWeek.verifiedInstructions === 0 || focusWeek.cpi == null) {
      return {
        tone: 'neutral' as const,
        label: 'No verified CPI',
        headline: '—',
        summary: `${formatWeekWindow(focusWeek.weekStart, focusWeek.weekEnd)} has ${focusWeek.enquiries} PPC enquiries, ${focusWeek.verifiedInstructions} verified instructions and ${focusWeek.sourceOnlyInstructions} source-only matter${focusWeek.sourceOnlyInstructions === 1 ? '' : 's'}. CPI is withheld until a matter is tied back to a PPC enquiry.`,
        focusWeek,
        baselineCpi,
        deltaPct,
      };
    }

    if (baselineCpi == null) {
      return {
        tone: 'neutral' as const,
        label: 'Building baseline',
        headline: formatCurrencyPrecise(focusWeek.cpi),
        summary: `${formatWeekWindow(focusWeek.weekStart, focusWeek.weekEnd)} has ${focusWeek.verifiedInstructions} verified instruction${focusWeek.verifiedInstructions === 1 ? '' : 's'}. More verified weeks are needed before comparing CPI movement.`,
        focusWeek,
        baselineCpi,
        deltaPct,
      };
    }

    const deltaPctValue = deltaPct ?? 0;
    if (deltaPctValue <= -15) {
      return {
        tone: 'good' as const,
        label: 'Efficient',
        headline: formatCurrencyPrecise(focusWeek.cpi),
        summary: `${formatWeekWindow(focusWeek.weekStart, focusWeek.weekEnd)} is ${Math.abs(deltaPctValue).toFixed(0)}% below the 4-week verified CPI median.`,
        focusWeek,
        baselineCpi,
        deltaPct,
      };
    }

    if (deltaPctValue < 15) {
      return {
        tone: 'warn' as const,
        label: 'Stable',
        headline: formatCurrencyPrecise(focusWeek.cpi),
        summary: `${formatWeekWindow(focusWeek.weekStart, focusWeek.weekEnd)} is within ${Math.abs(deltaPctValue).toFixed(0)}% of the 4-week verified CPI median.`,
        focusWeek,
        baselineCpi,
        deltaPct,
      };
    }

    return {
      tone: 'bad' as const,
      label: 'Review',
      headline: formatCurrencyPrecise(focusWeek.cpi),
      summary: `${formatWeekWindow(focusWeek.weekStart, focusWeek.weekEnd)} is ${Math.abs(deltaPctValue).toFixed(0)}% above the 4-week verified CPI median.`,
      focusWeek,
      baselineCpi,
      deltaPct,
    };
  }, [ppcWeeklyPerformance, closedWeekKey]);

  const attributionConfidence = useMemo(() => {
    const ratio = funnelSummary.enquiries > 0 ? (funnelSummary.qualifiedEnquiries / funnelSummary.enquiries) * 100 : null;
    if (ratio == null) {
      return {
        tone: 'neutral' as const,
        label: 'Attribution pending',
        summary: 'No PPC enquiries in view.',
        ratio,
      };
    }
    if (ratio >= 80) {
      return {
        tone: 'good' as const,
        label: 'Attribution holding',
        summary: `${ratio.toFixed(0)}% of PPC enquiries link back to a matter.`,
        ratio,
      };
    }
    if (ratio >= 55) {
      return {
        tone: 'warn' as const,
        label: 'Attribution partial',
        summary: `${ratio.toFixed(0)}% of PPC enquiries link back to a matter.`,
        ratio,
      };
    }
    return {
      tone: 'bad' as const,
      label: 'Attribution weak',
      summary: `${ratio.toFixed(0)}% of PPC enquiries link back to a matter.`,
      ratio,
    };
  }, [funnelSummary]);

  const verdictAccent = verdictModel.tone === 'good'
    ? colours.green
    : verdictModel.tone === 'warn'
      ? colours.orange
      : verdictModel.tone === 'bad'
        ? colours.cta
        : (isDarkMode ? colours.accent : colours.highlight);

  const attributionAccent = attributionConfidence.tone === 'good'
    ? colours.green
    : attributionConfidence.tone === 'warn'
      ? colours.orange
      : attributionConfidence.tone === 'bad'
        ? colours.cta
        : (isDarkMode ? colours.accent : colours.highlight);

  return (
    <ReportShell
      range={reportRangeAdapter}
      isFetching={isFetching}
      lastRefreshTimestamp={lastRefreshTimestamp}
      onRefresh={refresh}
      isPresetAvailable={isPresetAvailable}
    >
      <div data-helix-region="reports/ppc" style={{
        padding: 0,
        background: 'transparent',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
        fontFamily: 'Raleway, sans-serif',
      }}>
      <div style={{
        ...surface(isDarkMode),
        marginBottom: 0,
        padding: '12px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.68, letterSpacing: 0.35 }}>
            PPC Report
          </span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            Google Ads spend, PPC enquiries, verified instructions and recovered fees.
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
            border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.4)' : 'rgba(32, 178, 108, 0.3)'}`,
            background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
            fontSize: 11,
            fontWeight: 600,
            color: colours.green,
          }}>
            Sync {lastSyncLabel}
          </span>
        </div>
      </div>

      <div data-helix-region="reports/ppc/roi" style={{ ...surface(isDarkMode, { padding: '16px 18px', marginBottom: 20 }) }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.accent : colours.highlight }}>ROI snapshot</div>
            <div style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151' }}>Spend in, paid-search enquiries through, recovered fees out.</div>
          </div>
          <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            Spend = Google Ads API • revenue = recovered fees • verified CPI excludes source-only matters
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {[
            {
              label: 'Spend',
              value: formatCurrency(selectedSpend),
              sub: `${formatFullNumber(selectedClicks)} clicks • ${formatFullNumber(selectedAdsConversions)} ads conversions`,
              accent: colours.cta,
            },
            {
              label: 'PPC enquiries',
              value: formatFullNumber(funnelSummary.enquiries),
              sub: funnelSummary.enquiries > 0 ? `${formatCurrencyPrecise(selectedSpend / funnelSummary.enquiries)} per enquiry` : 'No paid-search enquiries linked yet',
              accent: isDarkMode ? colours.accent : colours.highlight,
            },
            {
              label: 'Matter-linked',
              value: formatFullNumber(funnelSummary.qualifiedEnquiries),
              sub: funnelSummary.enquiries > 0 ? `${formatPercentage((funnelSummary.qualifiedEnquiries / funnelSummary.enquiries) * 100)} of PPC enquiries` : 'Attribution pending',
              accent: colours.orange,
            },
            {
              label: 'Verified instructions',
              value: formatFullNumber(funnelSummary.verifiedInstructions),
              sub: funnelSummary.verifiedInstructions > 0 ? `${formatCurrencyPrecise(selectedSpend / funnelSummary.verifiedInstructions)} verified CPI` : 'No verified CPI yet',
              accent: colours.green,
            },
            {
              label: 'Revenue',
              value: ppcIncomeMetrics ? formatCurrency(selectedRangeRevenue) : '—',
              sub: ppcIncomeMetrics ? `${selectedMattersWithRevenue}/${totalMattersTracked} matters with recovered fees` : 'Revenue mapping pending',
              accent: colours.green,
            },
            {
              label: 'Net return',
              value: ppcIncomeMetrics ? formatCurrency(netReturn) : '—',
              sub: ppcIncomeMetrics ? `${formatMultiple(paybackMultiple)} payback multiple` : 'Awaiting revenue mapping',
              accent: netReturn >= 0 ? colours.green : colours.orange,
            },
            {
              label: 'ROI',
              value: ppcIncomeMetrics && roiPct != null ? `${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(0)}%` : '—',
              sub: ppcIncomeMetrics ? verdictModel.label : 'Awaiting cohort data',
              accent: roiPct != null && roiPct >= 0 ? colours.green : colours.orange,
            },
            {
              label: 'Source-only',
              value: formatFullNumber(funnelSummary.sourceOnlyInstructions),
              sub: 'Shown below, excluded from verified CPI',
              accent: colours.orange,
            },
          ].map((metric) => (
            <div key={metric.label} style={{
              position: 'relative',
              padding: '14px 14px 16px',
              borderRadius: 0,
              background: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : 'rgba(248, 250, 252, 0.92)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(13, 47, 96, 0.08)'}`,
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: '0 auto auto 0', width: '100%', height: 2, background: metric.accent, opacity: 0.9 }} />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: metric.accent, marginBottom: 8 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, marginBottom: 4 }}>
                {metric.value}
              </div>
              <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.45 }}>
                {metric.sub}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{
            padding: '6px 10px',
            borderRadius: 0,
            background: isDarkMode ? `${verdictAccent}14` : `${verdictAccent}10`,
            border: `1px solid ${isDarkMode ? `${verdictAccent}44` : `${verdictAccent}24`}`,
            color: verdictAccent,
            fontSize: 11,
            fontWeight: 700,
          }}>
            Verified CPI {verdictModel.headline}
          </span>
          <span style={{
            padding: '6px 10px',
            borderRadius: 0,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(248, 250, 252, 0.92)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(13, 47, 96, 0.12)'}`,
            fontSize: 11,
            color: isDarkMode ? '#d1d5db' : '#374151',
          }}>
            {verdictModel.baselineCpi != null ? `4-week median ${formatCurrencyPrecise(verdictModel.baselineCpi)}` : 'Need more closed weeks for a CPI baseline'}
          </span>
          <span style={{
            padding: '6px 10px',
            borderRadius: 0,
            background: isDarkMode ? `${attributionAccent}14` : `${attributionAccent}10`,
            border: `1px solid ${isDarkMode ? `${attributionAccent}44` : `${attributionAccent}24`}`,
            color: attributionAccent,
            fontSize: 11,
            fontWeight: 700,
          }}>
            Attribution {attributionConfidence.ratio != null ? formatPercentage(attributionConfidence.ratio) : '—'}
          </span>
          <span style={{
            padding: '6px 10px',
            borderRadius: 0,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(248, 250, 252, 0.92)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(13, 47, 96, 0.12)'}`,
            fontSize: 11,
            color: isDarkMode ? '#d1d5db' : '#374151',
          }}>
            {unmatchedCount} unmatched payment{unmatchedCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div data-helix-region="reports/ppc/drilldown" style={{ ...surface(isDarkMode, { padding: '16px 18px', marginBottom: 24 }) }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.accent : colours.highlight }}>Weekly drilldown</div>
            <div style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151' }}>Weekly cohorts with match quality, CPI basis and recovered fees.</div>
          </div>
          <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            Showing {drilldownWeeks.length} week{drilldownWeeks.length === 1 ? '' : 's'}
          </div>
        </div>

        {drilldownWeeks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drilldownWeeks.map((week) => {
              const isExpanded = expandedWeeks.has(week.weekStart);
              return (
                <div key={week.weekStart} style={{
                  borderRadius: 0,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(13, 47, 96, 0.08)'}`,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.68)' : 'rgba(248, 250, 252, 0.9)',
                  overflow: 'hidden',
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedWeeks);
                      if (next.has(week.weekStart)) {
                        next.delete(week.weekStart);
                      } else {
                        next.add(week.weekStart);
                      }
                      setExpandedWeeks(next);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(136px, 1.3fr) repeat(7, minmax(76px, 1fr)) 22px', gap: 12, alignItems: 'center', minWidth: 880 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>{formatWeekWindow(week.weekStart, week.weekEnd)}</div>
                        <div style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151', opacity: 0.8 }}>
                          {week.verifiedInstructions} verified • {week.sourceOnlyInstructions} source-only
                        </div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend</div>
                        <div style={{ fontWeight: 700, color: colours.cta }}>{formatCurrencyPrecise(week.spend)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enquiries</div>
                        <div style={{ fontWeight: 700 }}>{formatFullNumber(week.enquiries)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matter-linked</div>
                        <div style={{ fontWeight: 700 }}>{formatFullNumber(week.qualifiedEnquiries)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified</div>
                        <div style={{ fontWeight: 700 }}>{formatFullNumber(week.verifiedInstructions)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source-only</div>
                        <div style={{ fontWeight: 700, color: week.sourceOnlyInstructions > 0 ? colours.orange : undefined }}>{formatFullNumber(week.sourceOnlyInstructions)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue 30d</div>
                        <div style={{ fontWeight: 700, color: colours.green }}>{formatCurrencyPrecise(week.revenue30d)}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ opacity: 0.6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified CPI</div>
                        <div style={{ fontWeight: 700 }}>{week.cpi != null ? formatCurrencyPrecise(week.cpi) : '—'}</div>
                      </div>
                      <Icon iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 14, opacity: 0.65 }} />
                    </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(13, 47, 96, 0.08)'}` }}>
                      {week.matters.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                          {week.matters.map((matter, index) => {
                            const matterRevenue = typeof matter.totalInRange === 'number' ? matter.totalInRange : matter.totalCollected;
                            const matchLabel = getMatchLabel(matter.matchKind);
                            const matchAccent = isVerifiedPpcMatter(matter)
                              ? colours.green
                              : matter.matchKind === 'source_only'
                                ? colours.orange
                                : (isDarkMode ? colours.subtleGrey : colours.greyText);
                            return (
                              <div key={`${week.weekStart}-${matter.matterId || matter.displayNumber || index}`} style={{
                                padding: '10px 12px',
                                borderRadius: 0,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.42)' : 'rgba(255, 255, 255, 0.72)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(13, 47, 96, 0.06)'}`,
                                display: 'grid',
                                gridTemplateColumns: 'minmax(180px, 1.5fr) repeat(4, minmax(70px, 1fr))',
                                gap: 10,
                                alignItems: 'center',
                                overflowX: 'auto',
                              }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>{matter.displayNumber || matter.matterId || 'Matter'}</div>
                                  <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', opacity: 0.82 }}>{matter.clientName || 'Unknown client'}</div>
                                  <div style={{ display: 'inline-flex', marginTop: 6, padding: '3px 7px', borderRadius: 999, border: `1px solid ${matchAccent}55`, color: matchAccent, fontSize: 10, fontWeight: 700 }}>
                                    {matchLabel}
                                  </div>
                                </div>
                                <div style={{ fontSize: 11 }}>
                                  <div style={{ opacity: 0.58, fontSize: 9, textTransform: 'uppercase' }}>Enquiry</div>
                                  <div style={{ fontWeight: 600 }}>{matter.enquiryDate ? formatDateTag(new Date(matter.enquiryDate)) : '—'}</div>
                                </div>
                                <div style={{ fontSize: 11 }}>
                                  <div style={{ opacity: 0.58, fontSize: 9, textTransform: 'uppercase' }}>Open</div>
                                  <div style={{ fontWeight: 600 }}>{matter.openDate ? formatDateTag(new Date(matter.openDate)) : '—'}</div>
                                </div>
                                <div style={{ fontSize: 11 }}>
                                  <div style={{ opacity: 0.58, fontSize: 9, textTransform: 'uppercase' }}>Revenue 30d</div>
                                  <div style={{ fontWeight: 700, color: colours.green }}>{formatCurrencyPrecise(matter.collectedWithin30Days)}</div>
                                </div>
                                <div style={{ fontSize: 11 }}>
                                  <div style={{ opacity: 0.58, fontSize: 9, textTransform: 'uppercase' }}>Revenue all</div>
                                  <div style={{ fontWeight: 700 }}>{formatCurrencyPrecise(matterRevenue)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 12, fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151', opacity: 0.8 }}>
                          No matter cohort entries for this week yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '16px 4px 6px', fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', opacity: 0.82 }}>
            No weekly PPC cohort data in the selected range yet. If you are on localhost, that usually means Google Ads config is absent in this shell.
          </div>
        )}
      </div>

      </div>
    </ReportShell>
  );
};

export default React.memo(PpcReport);