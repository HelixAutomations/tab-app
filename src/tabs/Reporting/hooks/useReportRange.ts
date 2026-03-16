/**
 * useReportRange — shared date range hook for all reporting views.
 *
 * Extracts the range-key state, custom date range, computeRange logic, and
 * derived from/to labels that were previously duplicated across
 * ManagementDashboard, EnquiriesReport, and MetaMetricsReport.
 *
 * Usage:
 *   const range = useReportRange({ defaultKey: 'month' });
 *   // range.rangeKey, range.setRangeKey, range.from, range.to, ...
 */

import { useCallback, useMemo, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export type RangeKey =
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

export interface RangeOption {
  key: RangeKey;
  label: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UseReportRangeReturn {
  /** Current range key */
  rangeKey: RangeKey;
  /** Set the active range key (triggers recompute) */
  setRangeKey: (key: RangeKey) => void;
  /** Custom date range (only meaningful when rangeKey === 'custom') */
  customDateRange: { start: Date | null; end: Date | null };
  /** Update one side of the custom range */
  setCustomDate: (side: 'start' | 'end', date: Date | null) => void;
  /** Computed date window — null when rangeKey === 'all' */
  range: DateRange | null;
  /** Label for the "from" stamp */
  fromLabel: string;
  /** Label for the "to" stamp */
  toLabel: string;
  /** Whether the custom date pickers should be shown */
  showCustomPickers: boolean;
  /** Handler for selecting a range (handles 'custom' toggle) */
  handleRangeSelect: (key: RangeKey) => void;
  /** Quick-range presets with pre-computed getters */
  quickRanges: Array<{ key: RangeKey; label: string; get: () => DateRange | null }>;
  /** Check whether a given preset key matches the active selection */
  isActive: (key: RangeKey) => boolean;
}

// ─── Preset list (canonical order) ─────────────────────────────────────────

export const RANGE_OPTIONS: RangeOption[] = [
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

// ─── Pure helpers ──────────────────────────────────────────────────────────

export function computeRange(key: RangeKey): DateRange {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (key) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start.setTime(y.getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(y.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      const diff = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'lastWeek': {
      const diff = (now.getDay() + 6) % 7;
      const ws = new Date(now);
      ws.setDate(now.getDate() - diff);
      ws.setHours(0, 0, 0, 0);
      start.setTime(ws.getTime());
      start.setDate(start.getDate() - 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth':
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last90Days':
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(q, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearToDate': {
      const yr = now.getFullYear();
      const mo = now.getMonth();
      if (mo >= 3) {
        start.setFullYear(yr, 3, 1);
      } else {
        start.setFullYear(yr - 1, 3, 1);
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
}

export function normalizeRange(input: DateRange): DateRange {
  const s = new Date(input.start);
  const e = new Date(input.end);
  s.setHours(0, 0, 0, 0);
  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

export function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'Not refreshed yet';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function formatDateForPicker(date?: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTag(date: Date | null): string {
  if (!date) return 'n/a';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseReportRangeOptions {
  defaultKey?: RangeKey;
}

export function useReportRange(opts: UseReportRangeOptions = {}): UseReportRangeReturn {
  const { defaultKey = 'month' } = opts;

  const [rangeKey, setRangeKey] = useState<RangeKey>(defaultKey);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });

  const showCustomPickers = rangeKey === 'custom';

  const range = useMemo<DateRange | null>(() => {
    if (rangeKey === 'all') return null;
    if (rangeKey === 'custom') {
      if (customDateRange.start && customDateRange.end) {
        return normalizeRange({
          start: customDateRange.start,
          end: customDateRange.end,
        });
      }
      return null;
    }
    return normalizeRange(computeRange(rangeKey));
  }, [rangeKey, customDateRange]);

  const fromLabel = useMemo(() => {
    if (rangeKey === 'all') return 'All time';
    return range ? formatDateTag(range.start) : 'n/a';
  }, [rangeKey, range]);

  const toLabel = useMemo(() => {
    if (rangeKey === 'all') return 'Now';
    return range ? formatDateTag(range.end) : 'n/a';
  }, [rangeKey, range]);

  const handleRangeSelect = useCallback(
    (key: RangeKey) => {
      if (key === 'custom') {
        setRangeKey('custom');
        if (!customDateRange.start || !customDateRange.end) {
          const { start, end } = computeRange('month');
          setCustomDateRange({ start, end });
        }
      } else {
        setRangeKey(key);
      }
    },
    [customDateRange],
  );

  const setCustomDate = useCallback((side: 'start' | 'end', date: Date | null) => {
    setCustomDateRange((prev) => ({ ...prev, [side]: date }));
  }, []);

  const isActive = useCallback(
    (key: RangeKey) => rangeKey === key,
    [rangeKey],
  );

  const quickRanges = useMemo(
    () => [
      { key: 'all' as RangeKey, label: 'All', get: () => null as DateRange | null },
      ...RANGE_OPTIONS.map(({ key, label }) => ({
        key,
        label,
        get: (): DateRange | null => normalizeRange(computeRange(key)),
      })),
    ],
    [],
  );

  return {
    rangeKey,
    setRangeKey,
    customDateRange,
    setCustomDate,
    range,
    fromLabel,
    toLabel,
    showCustomPickers,
    handleRangeSelect,
    quickRanges,
    isActive,
  };
}
