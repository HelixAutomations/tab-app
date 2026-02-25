import React from 'react';
import { FiTrendingUp, FiTarget, FiUsers, FiCheckCircle } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import MetricDetailsModal, { MetricDetails } from './MetricDetailsModal';

interface EnquiryMetric {
  title: string;
  count?: number;
  prevCount?: number;
  elapsedPrevCount?: number;
  pitchedCount?: number;
  prevPitchedCount?: number;
  percentage?: number;
  prevPercentage?: number;
  isPercentage?: boolean;
  showTrend?: boolean;
  context?: {
    enquiriesMonthToDate?: number;
    mattersOpenedMonthToDate?: number;
    prevEnquiriesMonthToDate?: number;
  };
}

interface EnquiryMetricsV2Props {
  metrics: EnquiryMetric[];
  isDarkMode: boolean;
  userEmail?: string;
  userInitials?: string;
  /** Optional header actions rendered on the right side of the header (e.g., a toggle) */
  headerActions?: React.ReactNode;
  /** Optional title override; defaults to 'Enquiry & Conversion Metrics' */
  title?: string;
  /** Optional key that triggers refresh animation when changed */
  refreshAnimationKey?: number;
  /** Show skeleton loading state */
  isLoading?: boolean;
  /** Optional breakdown payload returned by /api/home-enquiries */
  breakdown?: unknown;
  /** When true, show previous period values instead of current period values */
  showPreviousPeriod?: boolean;
  /** When true (viewing as production), hide dev features like metric details modal */
  viewAsProd?: boolean;
  /** When true, skip outer container/header — render only the card grids (for embedding inside another panel) */
  embedded?: boolean;
}


// Animation keyframes for refresh and loading
const metricRefreshKeyframes = `
@keyframes metricRefresh {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
  100% { filter: brightness(1); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes dataLanded {
  0% { opacity: 0; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes fadeInToast {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOutToast {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-4px); }
}
`;

// Skeleton shimmer component for loading states
const SkeletonBox: React.FC<{ width: string; height: string; isDarkMode: boolean; style?: React.CSSProperties; animate?: boolean }> = 
  ({ width, height, isDarkMode, style, animate = true }) => (
  <div style={{
    width,
    height,
    borderRadius: '4px',
    background: isDarkMode 
      ? (animate
        ? 'linear-gradient(90deg, rgba(135, 243, 243, 0.06) 0%, rgba(135, 243, 243, 0.12) 50%, rgba(135, 243, 243, 0.06) 100%)'
        : 'rgba(135, 243, 243, 0.08)')
      : (animate
        ? 'linear-gradient(90deg, rgba(148, 163, 184, 0.15) 0%, rgba(148, 163, 184, 0.25) 50%, rgba(148, 163, 184, 0.15) 100%)'
        : 'rgba(148, 163, 184, 0.2)'),
    backgroundSize: animate ? '200% 100%' : undefined,
    animation: animate ? 'shimmer 1.5s ease-in-out infinite' : 'none',
    ...style,
  }} />
);

// Skeleton metric card for loading state
const SkeletonMetricCard: React.FC<{ isDarkMode: boolean; index: number; showProgress?: boolean }> = 
  ({ isDarkMode, index, showProgress = false }) => (
  <div
    style={{
      background: isDarkMode
        ? colours.websiteBlue
        : 'rgba(255, 255, 255, 0.66)',
      borderRadius: '0',
      padding: '8px',
      border: isDarkMode 
        ? '1px solid rgba(135, 243, 243, 0.1)'
        : '1px solid rgba(148, 163, 184, 0.12)',
      boxShadow: 'none',
      opacity: 1,
      animation: `fadeInToast 0.3s ease ${index * 50}ms both`,
    }}
  >
    {/* Title */}
    <SkeletonBox width="62%" height="11px" isDarkMode={isDarkMode} style={{ marginBottom: '6px' }} animate={false} />
    {/* Value */}
    <SkeletonBox width="46%" height="20px" isDarkMode={isDarkMode} style={{ marginBottom: '5px' }} />
    <SkeletonBox width="34%" height="10px" isDarkMode={isDarkMode} style={{ marginBottom: showProgress ? '6px' : '0' }} animate={false} />
    {/* Progress bar if needed */}
    {showProgress && (
      <div style={{ marginTop: '6px' }}>
        <SkeletonBox width="100%" height="3px" isDarkMode={isDarkMode} style={{ borderRadius: '2px' }} />
      </div>
    )}
  </div>
);

// Toast notification component
const Toast: React.FC<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean; isDarkMode: boolean }> = ({ message, type, visible, isDarkMode }) => {
  const bgColor = type === 'success' 
    ? (isDarkMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)') 
    : type === 'error' 
      ? (isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)') 
      : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)');
  const textColor = type === 'success' ? colours.green : type === 'error' ? colours.cta : colours.highlight;
  return (
    <div
      style={{
        padding: '4px 10px',
        borderRadius: '4px',
        background: bgColor,
        border: `1px solid ${type === 'success' ? colours.green : type === 'error' ? colours.cta : colours.highlight}`,
        color: textColor,
        fontSize: '11px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        animation: visible ? 'fadeInToast 0.2s ease' : 'fadeOutToast 0.2s ease forwards',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {type === 'success' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {message}
    </div>
  );
};

const EnquiryMetricsV2: React.FC<EnquiryMetricsV2Props> = ({ metrics, isDarkMode, userEmail, userInitials, headerActions, title, refreshAnimationKey, isLoading, breakdown, showPreviousPeriod = false, viewAsProd = false, embedded = false }) => {
  const isSessionStorageAvailable = React.useMemo(() => {
    try {
      const key = '__emv2_storage_test__';
      sessionStorage.setItem(key, '1');
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }, []);
  // Conversion metric breakdown should be available in normal use
  const showDetailsFeature = true;

  const sectionRailStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 244, 246, 0.96) 100%)',
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.08)' : `1px solid ${colours.highlightNeutral}`,
    padding: '3px',
  }), [isDarkMode]);

  const metricBlockStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(0, 3, 25, 0.28)' : colours.grey,
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.06)' : `1px solid ${colours.highlightBlue}`,
    borderLeft: 'none',
    borderRadius: '0',
    padding: '8px',
    boxShadow: 'none',
  }), [isDarkMode]);

  const animatedComparisonStyle = React.useCallback((visible: boolean): React.CSSProperties => ({
    maxHeight: visible ? '92px' : '0px',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(-4px)',
    overflow: 'hidden',
    transition: 'max-height 240ms ease, opacity 220ms ease, transform 220ms ease',
    willChange: 'max-height, opacity, transform',
  }), []);

  // Inject keyframes + responsive styles
  React.useEffect(() => {
    const styleId = 'enquiry-metrics-refresh-keyframes';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = metricRefreshKeyframes + `
        /* EnquiryMetricsV2 responsive (standalone, not dependent on TimeMetricsV2) */
        @media (max-width: 640px) {
          .metricsGridThree { grid-template-columns: 1fr !important; }
          .metricsGridTwo { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 641px) and (max-width: 900px) {
          .metricsGridThree { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);
  const [mounted, setMounted] = React.useState(false);
  
  // Track data landing state for smooth transitions
  const [dataLanded, setDataLanded] = React.useState(false);
  const prevLoadingRef = React.useRef(isLoading);

  // Refresh pulse (avoid remounting cards to restart animation)
  const [refreshPulse, setRefreshPulse] = React.useState(false);
  const refreshPulseTimerRef = React.useRef<number | null>(null);
  
  // Toast state
  const [toast, setToast] = React.useState<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean } | null>(null);

  // Hover help for what the delta compares against (only shown on Current view)
  const [hoveredTrendKey, setHoveredTrendKey] = React.useState<string | null>(null);
  const [enquiryComparisonModeByTitle, setEnquiryComparisonModeByTitle] = React.useState<Record<string, 'previous' | 'elapsed'>>({});

  const hasBreakdownData = React.useMemo(() => {
    if (!breakdown || typeof breakdown !== 'object') return false;
    const breakdownObj = breakdown as Record<string, unknown>;
    return ['today', 'weekToDate', 'monthToDate'].some((key) => {
      const periodObj = breakdownObj[key];
      return periodObj && typeof periodObj === 'object';
    });
  }, [breakdown]);

  const getDisplayTitle = React.useCallback((rawTitle: string): string => {
    return rawTitle;
  }, []);

  const getTrendHelpText = React.useCallback((rawTitle: string): string => {
    const titleLower = (rawTitle || '').toLowerCase();
    if (titleLower.includes('today')) return 'Change vs same weekday last week.';
    if (titleLower.includes('this week')) return 'Change vs last week-to-date (same elapsed days).';
    if (titleLower.includes('this month')) return 'Change vs last month-to-date (same day-of-month / same elapsed days).';
    return 'Change vs the previous period.';
  }, []);

  const [metricDetails, setMetricDetails] = React.useState<MetricDetails | null>(null);
  const [isMetricDetailsOpen, setIsMetricDetailsOpen] = React.useState(false);
  const [selectedMetric, setSelectedMetric] = React.useState<EnquiryMetric | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [detailsPayload, setDetailsPayload] = React.useState<{
    periodKey: 'today' | 'weekToDate' | 'monthToDate' | null;
    currentRange?: string;
    previousRange?: string;
    current?: Array<Record<string, unknown>>;
    previous?: Array<Record<string, unknown>>;
    filters?: Record<string, unknown>;
    limit?: number;
  } | null>(null);
  const detailsRequestRef = React.useRef(0);

  type AowTopItem = { key: string; count: number };

  const getPeriodKey = React.useCallback((rawTitle: string): 'today' | 'weekToDate' | 'monthToDate' | null => {
    const titleLower = (rawTitle || '').toLowerCase();
    if (titleLower.includes('today')) return 'today';
    if (titleLower.includes('this week')) return 'weekToDate';
    if (titleLower.includes('this month')) return 'monthToDate';
    return null;
  }, []);

  const canOpenMetricBreakdown = React.useCallback((metric: EnquiryMetric) => {
    if (!showDetailsFeature) return false;
    if (!getPeriodKey(metric.title)) return false;
    return hasBreakdownData || Boolean(userEmail || userInitials);
  }, [showDetailsFeature, getPeriodKey, hasBreakdownData, userEmail, userInitials]);

  const getAowTop = React.useCallback((periodKey: 'today' | 'weekToDate' | 'monthToDate' | null): AowTopItem[] => {
    if (!periodKey) return [];
    if (!breakdown || typeof breakdown !== 'object') return [];

    const breakdownObj = breakdown as Record<string, unknown>;
    const periodObj = breakdownObj[periodKey];
    if (!periodObj || typeof periodObj !== 'object') return [];

    const aowTop = (periodObj as Record<string, unknown>).aowTop;
    if (!Array.isArray(aowTop)) return [];

    const items: AowTopItem[] = [];
    for (const item of aowTop) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.key === 'string' && typeof obj.count === 'number') {
        items.push({ key: obj.key, count: obj.count });
      }
    }
    return items;
  }, [breakdown]);

  const formatTrendValue = (current: number, previous: number, isPercentage: boolean): string => {
    const diff = current - previous;
    const sign = diff > 0 ? '+' : '';
    if (isPercentage) {
      return `${sign}${diff.toFixed(1)}%`;
    }
    return `${sign}${diff}`;
  };

  const formatDateShort = React.useCallback((value: Date) =>
    value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), []);

  const getComparisonRange = React.useCallback((periodKey: 'today' | 'weekToDate' | 'monthToDate' | null, isPrevious: boolean): string | null => {
    if (!periodKey) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    if (periodKey === 'today') {
      const start = isPrevious ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) : today;
      const end = isPrevious ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999) : endOfToday;
      return `${formatDateShort(start)} – ${formatDateShort(end)}`;
    }

    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    if (periodKey === 'weekToDate') {
      const start = isPrevious ? new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000) : startOfWeek;
      const end = isPrevious ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) : endOfToday;
      end.setHours(23, 59, 59, 999);
      return `${formatDateShort(start)} – ${formatDateShort(end)}`;
    }

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (periodKey === 'monthToDate') {
      if (!isPrevious) {
        return `${formatDateShort(startOfMonth)} – ${formatDateShort(endOfToday)}`;
      }
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
      const prevMonthEnd = new Date(prevMonthStart);
      prevMonthEnd.setDate(Math.min(today.getDate(), prevMonthDays));
      prevMonthEnd.setHours(23, 59, 59, 999);
      return `${formatDateShort(prevMonthStart)} – ${formatDateShort(prevMonthEnd)}`;
    }

    return null;
  }, [formatDateShort]);

  const renderRecordList = React.useCallback((records: Array<Record<string, unknown>> | undefined, emptyLabel: string) => {
    if (!records || records.length === 0) {
      return (
        <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)' }}>
          {emptyLabel}
        </div>
      );
    }

    const visibleRecords = records.slice(0, 8);
    const hiddenCount = Math.max(0, records.length - visibleRecords.length);

    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {visibleRecords.map((row, index) => {
          const date = typeof row.date === 'string' ? row.date : '';
          const poc = typeof row.poc === 'string' ? row.poc : '';
          const aow = typeof row.aow === 'string' ? row.aow : '';
          const source = typeof row.source === 'string' ? row.source : '';
          const label = [date || '—', poc || '—'].filter(Boolean).join(' · ');
          return (
            <div key={`${source}-${index}`} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 12,
              padding: '8px 10px',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(15, 23, 42, 0.1)'}`,
              background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
            }}>
              <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.3, minWidth: 0, flex: 1 }}>
                {label}
              </span>
              <span style={{
                padding: '2px 6px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.12)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                whiteSpace: 'nowrap',
              }}>
                {aow || 'Other'}
              </span>
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: isDarkMode ? 'rgba(148, 163, 184, 0.78)' : 'rgba(100, 116, 139, 0.82)',
            textAlign: 'right',
          }}>
            +{hiddenCount} more records in this window
          </div>
        )}
      </div>
    );
  }, [isDarkMode]);

  // Show toast notification
  const showToast = React.useCallback((message: string, type: 'info' | 'success' | 'error', duration: number = 2500) => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(prev => prev ? { ...prev, visible: false } : null);
      setTimeout(() => setToast(null), 200);
    }, duration);
  }, []);

  const openMetricDetails = React.useCallback((metric: EnquiryMetric) => {
    if (!showDetailsFeature) return;

    const periodKey = getPeriodKey(metric.title);

    setSelectedMetric(metric);
    setDetailsPayload(null);
    setDetailsError(null);
    setDetailsLoading(Boolean(periodKey));
    setMetricDetails({
      title: getDisplayTitle(metric.title),
      subtitle: undefined,
      rows: [],
    });
    setIsMetricDetailsOpen(true);
    showToast('Loading enquiry breakdown…', 'info', 1200);

    if (!periodKey) return;
    const requestId = Date.now();
    detailsRequestRef.current = requestId;
    const email = (userEmail || '').trim().toLowerCase();
    const initials = (userInitials || '').trim();
    const query = new URLSearchParams({
      period: periodKey,
      limit: '50',
    });
    if (email) query.set('email', email);
    if (initials) query.set('initials', initials);

    fetch(`/api/home-enquiries/details?${query.toString()}`, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Details fetch failed (${res.status})`);
        return res.json();
      })
      .then((payload) => {
        if (detailsRequestRef.current !== requestId) return;
        const currentRecords = Array.isArray(payload?.current?.records) ? payload.current.records : [];
        const previousRecords = Array.isArray(payload?.previous?.records) ? payload.previous.records : [];
        setDetailsPayload({
          periodKey,
          currentRange: payload?.currentRange,
          previousRange: payload?.previousRange,
          current: currentRecords,
          previous: previousRecords,
          filters: payload?.filters || undefined,
          limit: payload?.limit,
        });
        setDetailsLoading(false);
        showToast(`Breakdown ready · ${currentRecords.length} current vs ${previousRecords.length} previous`, 'success', 2200);
      })
      .catch((err) => {
        if (detailsRequestRef.current !== requestId) return;
        setDetailsError(err?.message || 'Failed to load records.');
        setDetailsLoading(false);
        showToast('Could not load breakdown. Please retry.', 'error', 2600);
      });
  }, [showDetailsFeature, getDisplayTitle, getPeriodKey, userEmail, userInitials, showToast]);

  const detailsChipStyle: React.CSSProperties = React.useMemo(() => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
    border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(15, 23, 42, 0.10)'}`,
    background: isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(255, 255, 255, 0.7)',
    padding: '3px 8px',
    borderRadius: 999,
    lineHeight: 1,
  }), [isDarkMode]);

  React.useEffect(() => {
    if (!selectedMetric || !isMetricDetailsOpen) return;

    const metric = selectedMetric;
    const currentRecords = detailsPayload?.current || [];
    const previousRecords = detailsPayload?.previous || [];
    const currentCount = currentRecords.length;
    const previousCount = previousRecords.length;
    const delta = currentCount - previousCount;
    const deltaDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
    const isEnquiryCard = isEnquiryPeriodMetric(metric);
    const pitchedCount = Number(metric.pitchedCount || 0);
    const unpitchedCount = Math.max(0, Math.round(getCurrentValue(metric)) - Math.round(pitchedCount));
    const topAow = getAowTop(getPeriodKey(metric.title)).slice(0, 3);

    const pitchCue = isEnquiryCard
      ? (unpitchedCount > 0
        ? `${unpitchedCount} enquiry${unpitchedCount === 1 ? '' : 'ies'} have no recorded pitch in this window. Prioritise these first.`
        : 'All enquiries in this window have a recorded pitch. Focus on conversion follow-up.')
      : 'Use this breakdown to identify priority follow-up and conversion opportunities.';

    const rows: MetricDetails['rows'] = [
      {
        label: 'Snapshot',
        value: (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[{
                label: 'Current',
                value: String(currentCount),
                hint: detailsPayload?.currentRange || 'Current window',
              }, {
                label: 'Previous',
                value: String(previousCount),
                hint: detailsPayload?.previousRange || 'Previous window',
              }, {
                label: 'Delta',
                value: deltaText,
                hint: deltaDirection === 'up' ? 'Above previous' : deltaDirection === 'down' ? 'Below previous' : 'No change',
              }].map((item) => (
                <div key={item.label} style={{
                  border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(15, 23, 42, 0.1)'}`,
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                  padding: '10px 10px',
                }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.82)',
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 700,
                    color: item.label === 'Delta'
                      ? (deltaDirection === 'up' ? colours.green : deltaDirection === 'down' ? colours.cta : (isDarkMode ? colours.dark.text : colours.light.text))
                      : (isDarkMode ? colours.dark.text : colours.light.text),
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {item.value}
                  </div>
                  <div style={{
                    marginTop: 3,
                    fontSize: 10,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.78)' : 'rgba(100, 116, 139, 0.85)',
                  }}>
                    {item.hint}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        label: 'Pitch Cue',
        value: (
          <div style={{
            border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.22)' : 'rgba(54, 144, 206, 0.24)'}`,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
            padding: '10px 12px',
            display: 'grid',
            gap: 6,
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.35,
              textTransform: 'uppercase',
              color: isDarkMode ? colours.accent : colours.highlight,
            }}>
              Next Step
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              lineHeight: 1.45,
            }}>
              {pitchCue}
            </div>
            {isEnquiryCard && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}>
                <span style={detailsChipStyle}>Enquiries {Math.round(getCurrentValue(metric))}</span>
                <span style={detailsChipStyle}>Pitched {Math.round(pitchedCount)}</span>
                <span style={detailsChipStyle}>Awaiting pitch {unpitchedCount}</span>
              </div>
            )}
          </div>
        ),
      },
      {
        label: 'Area Focus',
        value: topAow.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topAow.map((item) => (
              <span key={item.key} style={detailsChipStyle}>
                {item.key} {item.count}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)' }}>
            No dominant area-of-work signal in this window yet.
          </div>
        ),
      },
      {
        label: 'Records',
        value: (
          <div style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
            {detailsLoading && (
              <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)' }}>
                Loading records…
              </div>
            )}
            {detailsError && (
              <div style={{ fontSize: 12, color: isDarkMode ? '#FCA5A5' : '#DC2626' }}>
                {detailsError}
              </div>
            )}
            {!detailsLoading && !detailsError && detailsPayload && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    Current window ({detailsPayload.currentRange || '—'})
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 6 }}>
                    {renderRecordList(detailsPayload.current, 'No records returned for this window.')}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    Previous window ({detailsPayload.previousRange || '—'})
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 6 }}>
                    {renderRecordList(detailsPayload.previous, 'No records returned for this window.')}
                  </div>
                </div>
              </div>
            )}
          </div>
        ),
      },
    ];

    setMetricDetails({
      title: getDisplayTitle(metric.title),
      subtitle: undefined,
      rows,
    });
  }, [selectedMetric, isMetricDetailsOpen, detailsLoading, detailsError, detailsPayload, getPeriodKey, getDisplayTitle, isDarkMode, renderRecordList, detailsChipStyle, getAowTop]);

  // No click-to-inspect breakdown or sidepane modals.
  
  // Detect data landing (loading → not loading transition)
  React.useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      setDataLanded(true);
      showToast('Conversion data synced', 'success', 2000);
      // Reset after animation completes
      const timer = setTimeout(() => setDataLanded(false), 600);
      return () => clearTimeout(timer);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, showToast]);

  // Trigger a short pulse animation whenever refreshAnimationKey changes.
  React.useEffect(() => {
    if (!refreshAnimationKey) return;
    setRefreshPulse(true);
    if (refreshPulseTimerRef.current) {
      window.clearTimeout(refreshPulseTimerRef.current);
    }
    refreshPulseTimerRef.current = window.setTimeout(() => setRefreshPulse(false), 450);
    return () => {
      if (refreshPulseTimerRef.current) {
        window.clearTimeout(refreshPulseTimerRef.current);
      }
    };
  }, [refreshAnimationKey]);
  
  // One-time animation per browser session
  const [enableAnimationThisMount] = React.useState<boolean>(() => {
    if (!isSessionStorageAvailable) return false;
    try { return sessionStorage.getItem('emv2_animated') !== 'true'; } catch { return false; }
  });
  React.useEffect(() => {
    if (enableAnimationThisMount) {
      setMounted(false);
      const t = setTimeout(() => {
        setMounted(true);
        if (isSessionStorageAvailable) {
          try { sessionStorage.setItem('emv2_animated', 'true'); } catch {}
        }
      }, 0);
      return () => clearTimeout(t);
    }
    setMounted(true);
  }, [enableAnimationThisMount]);

  const formatNumber = (value: number, decimals: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const AnimatedNumber: React.FC<{
    value: number;
    decimals?: number;
    durationMs?: number;
    animate?: boolean;
    suffix?: string;
    onDone?: () => void;
  }> = ({ value, decimals = 0, durationMs = 700, animate = true, suffix = '', onDone }) => {
    const [display, setDisplay] = React.useState(() => (animate ? 0 : value));
    const hasAnimatedRef = React.useRef(false);
    const doneRef = React.useRef(false);

    React.useEffect(() => {
      if (!Number.isFinite(value)) {
        setDisplay(0);
        return;
      }
      if (!animate || hasAnimatedRef.current) {
        setDisplay(value);
        return;
      }
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(value * eased);
        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          hasAnimatedRef.current = true;
          setDisplay(value);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [animate, durationMs, onDone, value]);

    return <>{`${formatNumber(display, decimals)}${suffix}`}</>;
  };

  const AnimatedMetricValue: React.FC<{
    storageKey: string;
    value: number;
    decimals: number;
    suffix?: string;
    enabled: boolean;
  }> = ({ storageKey, value, decimals, suffix, enabled }) => {
    const [shouldAnimate, setShouldAnimate] = React.useState<boolean>(() => {
      if (!isSessionStorageAvailable) return false;
      try { return sessionStorage.getItem(storageKey) !== 'true'; } catch { return false; }
    });
    const doneRef = React.useRef(false);

    const handleDone = React.useCallback(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (isSessionStorageAvailable) {
        try { sessionStorage.setItem(storageKey, 'true'); } catch {}
      }
      setShouldAnimate(false);
    }, [storageKey]);

    return (
      <AnimatedNumber
        value={value}
        decimals={decimals}
        animate={enabled && shouldAnimate}
        suffix={suffix}
        onDone={handleDone}
      />
    );
  };

  const staggerStyle = (index: number): React.CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 300ms ease, transform 300ms ease',
    transitionDelay: `${index * 80}ms`,
  });
  
  const getTrendDirection = (current: number, previous: number): 'up' | 'down' | 'neutral' => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'neutral';
  };

  const getTrendColor = (trend: 'up' | 'down' | 'neutral'): string => {
    switch (trend) {
      case 'up': return colours.green;
      case 'down': return colours.cta;
      default: return isDarkMode ? colours.subtleGrey : colours.light.subText;
    }
  };

  const getIcon = (metric: EnquiryMetric) => {
    if (metric.title.toLowerCase().includes('enquir')) return FiUsers;
    if (metric.title.toLowerCase().includes('matter')) return FiCheckCircle;
    if (metric.title.toLowerCase().includes('conversion')) return FiTarget;
    if (metric.title.toLowerCase().includes('response')) return FiTrendingUp;
    if (metric.title.toLowerCase().includes('satisfaction')) return FiCheckCircle;
    return FiTarget;
  };

  const getCurrentValue = (metric: EnquiryMetric): number => {
    return metric.isPercentage ? (metric.percentage || 0) : (metric.count || 0);
  };

  const getPrevValue = (metric: EnquiryMetric): number => {
    return metric.isPercentage ? (metric.prevPercentage || 0) : (metric.prevCount || 0);
  };

  const isEnquiryPeriodMetric = (metric: EnquiryMetric) => {
    const title = (metric.title || '').toLowerCase();
    return title === 'enquiries today' || title === 'enquiries this week' || title === 'enquiries this month';
  };

  const formatComparisonValue = (metric: EnquiryMetric, value: number): string => {
    if (metric.isPercentage) return `${value.toFixed(1)}%`;
    return `${Math.round(value)}`;
  };

  const renderComparisonRows = (metric: EnquiryMetric) => {
    const titleLower = (metric.title || '').toLowerCase();
    const titleKey = metric.title || '';
    const isTodayCard = titleLower === 'enquiries today';
    const isWeekCard = titleLower === 'enquiries this week';
    const isMonthCard = titleLower === 'enquiries this month';
    const isConversionRateCard = titleLower.includes('conversion rate');
    const canToggleElapsed = !isTodayCard && typeof metric.elapsedPrevCount === 'number';
    const mode = enquiryComparisonModeByTitle[titleKey] || 'previous';
    const previousValue = canToggleElapsed && mode === 'elapsed'
      ? Number(metric.elapsedPrevCount || 0)
      : Number(metric.isPercentage ? metric.prevPercentage : metric.prevCount);
    const hasPreviousValue = Number.isFinite(previousValue);
    const currentValue = Number(getCurrentValue(metric) || 0);
    const currentLabel = isTodayCard
      ? 'Today'
      : isWeekCard
        ? 'This Week'
        : isMonthCard
          ? 'This Month'
          : isConversionRateCard
            ? 'This Month'
            : 'Current';
    const previousLabel = isTodayCard
      ? 'Yesterday'
      : isWeekCard
        ? (canToggleElapsed && mode === 'elapsed' ? 'Last Week (to date)' : 'Last Week')
        : isMonthCard
          ? (canToggleElapsed && mode === 'elapsed' ? 'Last Month (to date)' : 'Last Month')
          : 'Previous';
    const conversionEnquiries = Number(metric.context?.enquiriesMonthToDate || 0);
    const conversionOpened = Number(metric.context?.mattersOpenedMonthToDate || 0);

    return (
      <div style={{ marginTop: '7px', display: 'grid', gap: '3px' }}>
        {canToggleElapsed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '1px' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEnquiryComparisonModeByTitle((prev) => ({
                  ...prev,
                  [titleKey]: (prev[titleKey] || 'previous') === 'previous' ? 'elapsed' : 'previous',
                }));
              }}
              onKeyDown={(e) => e.stopPropagation()}
              style={{
                border: 'none',
                background: 'transparent',
                color: isDarkMode ? 'rgba(135, 243, 243, 0.72)' : 'rgba(54, 144, 206, 0.82)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                lineHeight: 1.2,
                padding: 0,
                opacity: 0.9,
                borderBottom: `1px dotted ${isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.45)'}`,
              }}
              aria-label="Toggle enquiry comparison mode"
              title={`${isWeekCard ? 'Last Week' : 'Last Month'} comparison (${mode === 'previous' ? 'full period' : 'to date'}) — click to toggle`}
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
                <span>
                  {isWeekCard
                    ? (mode === 'previous' ? 'Last Week (full)' : 'Last Week (to date)')
                    : (mode === 'previous' ? 'Last Month (full)' : 'Last Month (to date)')}
                </span>
                <span style={{ fontSize: '8px', fontWeight: 600, opacity: 0.5, letterSpacing: '0.1px' }} aria-hidden="true">⇄</span>
              </span>
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            {currentLabel}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(15, 23, 42, 0.82)', fontVariantNumeric: 'tabular-nums' }}>
            {formatComparisonValue(metric, currentValue)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            {previousLabel}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.66)' : 'rgba(15, 23, 42, 0.74)', fontVariantNumeric: 'tabular-nums' }}>
            {hasPreviousValue ? formatComparisonValue(metric, previousValue) : '—'}
          </span>
        </div>
        {isConversionRateCard && (
          <div style={{
            marginTop: '2px',
            fontSize: '9px',
            fontWeight: 500,
            color: isDarkMode ? 'rgba(255, 255, 255, 0.46)' : 'rgba(15, 23, 42, 0.56)',
            letterSpacing: '0.06px',
          }}>
            This month: {conversionOpened} opened / {conversionEnquiries} enquiries
          </div>
        )}
      </div>
    );
  };

  const formatValue = (metric: EnquiryMetric): string => {
    if (metric.isPercentage) {
      return `${(metric.percentage || 0).toFixed(1)}%`;
    }
    return (metric.count || 0).toLocaleString();
  };

  return (
    <div style={embedded ? { width: '100%' } : {
      padding: '0',
      margin: '0',
      position: 'relative',
      background: 'transparent',
      width: '100%',
      boxSizing: 'border-box' as const,
    }}>
      <div style={embedded ? { width: '100%' } : {
        background: isDarkMode 
          ? 'transparent'
          : 'rgba(255, 255, 255, 0.98)',
        borderRadius: '0',
        border: 'none',
        boxShadow: 'none',
        marginBottom: '0',
        width: '100%',
        boxSizing: 'border-box' as const,
        overflow: 'hidden' as const,
        position: 'relative' as const,
      }}>
        {!embedded && (
          <>
            {/* Accent gradient line at top */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: colours.highlight,
            }} />
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: 'transparent',
              borderBottom: isDarkMode 
                ? '1px solid rgba(54, 144, 206, 0.08)' 
                : '1px solid rgba(148, 163, 184, 0.12)',
              marginBottom: '0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  letterSpacing: '-0.025em',
                }}>
                  {title || 'Enquiry & Conversion Metrics'}
                </h2>
                {isLoading && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                  }}>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke={colours.highlight}
                      strokeWidth="2"
                      style={{ animation: 'shimmer 1s linear infinite' }}
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 500, 
                      color: colours.highlight,
                    }}>
                      Loading...
                    </span>
                  </div>
                )}
                {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {headerActions}
              </div>
            </div>
          </>
        )}
        
        {/* Metrics Content — 3:2 dashboard grid */}
        <div style={{
          padding: embedded ? '0 12px 10px 12px' : '10px 10px 10px 10px',
        }}>
          {/* Skeleton loading state */}
          {isLoading && (
            <div style={sectionRailStyle}>
              {/* Skeleton row 1: 3 across */}
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    padding: '12px 12px',
                    borderRight: i < 2 ? `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'transparent'}` : 'none',
                  }}>
                    <SkeletonBox width="70px" height="9px" isDarkMode={isDarkMode} animate={false} />
                    <div style={{ marginTop: '6px' }}>
                      <SkeletonBox width="40px" height="18px" isDarkMode={isDarkMode} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ height: '4px' }} />
              {/* Skeleton row 2: 2 across */}
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                {[0,1].map(i => (
                  <div key={i} style={{
                    padding: '12px 12px',
                    borderRight: i < 1 ? `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'transparent'}` : 'none',
                  }}>
                    <SkeletonBox width="90px" height="9px" isDarkMode={isDarkMode} animate={false} />
                    <div style={{ marginTop: '6px' }}>
                      <SkeletonBox width="50px" height="18px" isDarkMode={isDarkMode} />
                    </div>
                    {i === 1 && (
                      <div style={{ marginTop: '8px' }}>
                        <SkeletonBox width="100%" height="3px" isDarkMode={isDarkMode} animate={false} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Data loaded state — 3:2 grid */}
          {!isLoading && (
            <div style={{ padding: '0' }}>
              <div style={sectionRailStyle}>
              {/* Row 1: first 3 metrics */}
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {metrics.slice(0, 3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const displayValue = currentValue;
                  const canOpenBreakdown = canOpenMetricBreakdown(metric);
                  const isEnquiryPeriodCard = isEnquiryPeriodMetric(metric);
                  const lightModeBorderColor = colours.highlightBlue;

                  return (
                    <div
                      key={`${metric.title}-${index}`}
                      style={{
                        padding: '12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey,
                        border: isDarkMode ? metricBlockStyle.border : `1px solid ${lightModeBorderColor}`,
                        borderLeft: isDarkMode ? metricBlockStyle.borderLeft : `1px solid ${lightModeBorderColor}`,
                        borderRight: isDarkMode
                          ? (index < 2 ? '1px solid rgba(135, 243, 243, 0.06)' : 'none')
                          : `1px solid ${lightModeBorderColor}`,
                        boxShadow: 'none',
                        cursor: canOpenBreakdown ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease',
                        borderRadius: '0',
                        animation: dataLanded 
                          ? `dataLanded 0.5s ease ${index * 0.06}s both`
                          : refreshPulse 
                            ? 'metricRefresh 0.4s ease' 
                            : undefined,
                        ...staggerStyle(index),
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!canOpenBreakdown) return;
                        openMetricDetails(metric);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && canOpenBreakdown) {
                          e.preventDefault();
                          openMetricDetails(metric);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.14) 0%, rgba(54, 144, 206, 0.02) 60%), rgba(6, 23, 51, 0.55)'
                          : colours.grey;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey;
                      }}
                    >
                      {/* Label */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <div style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(15, 23, 42, 0.50)',
                          whiteSpace: 'nowrap' as const,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                          flex: 1,
                        }}>
                          {getDisplayTitle(metric.title)}
                        </div>
                        {isEnquiryPeriodCard && typeof metric.pitchedCount === 'number' && (
                          <span style={{
                            fontSize: '8px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.34)' : 'rgba(15, 23, 42, 0.36)',
                            letterSpacing: '0.2px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            pitched {Math.max(0, Math.round(metric.pitchedCount || 0))}
                          </span>
                        )}
                        {canOpenBreakdown && (
                          <span style={{
                            fontSize: '8px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.34)' : 'rgba(15, 23, 42, 0.36)',
                            letterSpacing: '0.24px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            breakdown
                          </span>
                        )}
                      </div>

                      {/* Value row */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          color: isDarkMode ? '#ffffff' : '#0f172a',
                          letterSpacing: '-0.03em',
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.1,
                        }}>
                          <AnimatedMetricValue
                            storageKey={`emv2_metric_${metric.title}`}
                            value={displayValue}
                            decimals={0}
                            suffix=""
                            enabled={enableAnimationThisMount}
                          />
                        </span>
                      </div>

                      <div style={animatedComparisonStyle(showPreviousPeriod)}>
                        {renderComparisonRows(metric)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Row 2: last 2 metrics */}
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginTop: '4px', borderTop: 'none' }}>
                {metrics.slice(3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const displayValue = currentValue;
                  const displayPercentage = metric.percentage || 0;
                  const canOpenBreakdown = canOpenMetricBreakdown(metric);
                  const isEnquiryPeriodCard = isEnquiryPeriodMetric(metric);
                  const progressIndicatorColor = displayPercentage >= 80 ? colours.green : colours.accent;
                  const lightModeBorderColor = metric.isPercentage ? `${progressIndicatorColor}66` : colours.highlightBlue;

                  return (
                    <div
                      key={`${metric.title}-${index}`}
                      style={{
                        padding: '12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey,
                        border: isDarkMode ? metricBlockStyle.border : `1px solid ${lightModeBorderColor}`,
                        borderLeft: isDarkMode ? metricBlockStyle.borderLeft : `1px solid ${lightModeBorderColor}`,
                        borderRight: isDarkMode
                          ? (index < 1 ? '1px solid rgba(135, 243, 243, 0.06)' : 'none')
                          : `1px solid ${lightModeBorderColor}`,
                        boxShadow: 'none',
                        cursor: canOpenBreakdown ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease',
                        borderRadius: '0',
                        animation: dataLanded 
                          ? `dataLanded 0.5s ease ${(index + 3) * 0.06}s both`
                          : refreshPulse 
                            ? 'metricRefresh 0.4s ease' 
                            : undefined,
                        ...staggerStyle(index + 3),
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!canOpenBreakdown) return;
                        openMetricDetails(metric);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && canOpenBreakdown) {
                          e.preventDefault();
                          openMetricDetails(metric);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.14) 0%, rgba(54, 144, 206, 0.02) 60%), rgba(6, 23, 51, 0.55)'
                          : colours.grey;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey;
                      }}
                    >
                      {/* Label */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <div style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(15, 23, 42, 0.50)',
                          whiteSpace: 'nowrap' as const,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                          flex: 1,
                        }}>
                          {getDisplayTitle(metric.title)}
                        </div>
                        {isEnquiryPeriodCard && typeof metric.pitchedCount === 'number' && (
                          <span style={{
                            fontSize: '8px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.34)' : 'rgba(15, 23, 42, 0.36)',
                            letterSpacing: '0.2px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            pitched {Math.max(0, Math.round(metric.pitchedCount || 0))}
                          </span>
                        )}
                        {canOpenBreakdown && (
                          <span style={{
                            fontSize: '8px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.34)' : 'rgba(15, 23, 42, 0.36)',
                            letterSpacing: '0.24px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            breakdown
                          </span>
                        )}
                      </div>

                      {/* Value row */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          color: isDarkMode ? '#ffffff' : '#0f172a',
                          letterSpacing: '-0.03em',
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.1,
                        }}>
                          <AnimatedMetricValue
                            storageKey={`emv2_metric_${metric.title}`}
                            value={displayValue}
                            decimals={metric.isPercentage ? 1 : 0}
                            suffix={metric.isPercentage ? '%' : ''}
                            enabled={enableAnimationThisMount}
                          />
                        </span>
                      </div>

                      <div style={animatedComparisonStyle(showPreviousPeriod)}>
                        {renderComparisonRows(metric)}
                      </div>

                      {/* Progress bar (for percentage metrics) */}
                      {metric.isPercentage && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            flex: 1, height: '3px',
                            background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(148, 163, 184, 0.15)',
                            borderRadius: '2px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(displayPercentage, 100)}%`, height: '100%',
                              background: displayPercentage >= 80 ? 'var(--helix-green, #20b26c)' : 'var(--text-accent, #87F3F3)',
                              borderRadius: '2px',
                              transition: enableAnimationThisMount ? 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                            }} />
                          </div>
                          <span style={{
                            fontSize: '9px', fontWeight: 500,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            fontVariantNumeric: 'tabular-nums', minWidth: '24px', textAlign: 'right' as const,
                          }}>
                            {displayPercentage.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}

          <MetricDetailsModal
            isOpen={isMetricDetailsOpen}
            onClose={() => setIsMetricDetailsOpen(false)}
            isDarkMode={isDarkMode}
            details={metricDetails}
          />
        </div>
      </div>
    </div>
  );
};

export default EnquiryMetricsV2;