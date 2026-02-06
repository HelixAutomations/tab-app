import React from 'react';
import { FiClock, FiTrendingUp, FiTarget } from 'react-icons/fi';
import { FaMoneyBillWave } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import EnquiryMetricsV2 from './EnquiryMetricsV2';
import MetricDetailsModal, { MetricDetails } from './MetricDetailsModal';

// Inject keyframes for spin animation
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes spinReverse {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-4px); }
  }
  @keyframes metricPulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  @keyframes metricRefresh {
    0% { opacity: 0.6; transform: scale(0.98); }
    100% { opacity: 1; transform: scale(1); }
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
  @keyframes progressFill {
    0% { width: 0%; }
    100% { width: var(--progress-width); }
  }
  @keyframes valuePopIn {
    0% { opacity: 0; transform: translateY(8px) scale(0.9); }
    60% { opacity: 1; transform: translateY(-2px) scale(1.02); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('time-metrics-spin-keyframes')) {
  const style = document.createElement('style');
  style.id = 'time-metrics-spin-keyframes';
  style.textContent = spinKeyframes;
  document.head.appendChild(style);
}

// Auto-refresh interval in seconds (5 minutes)
const AUTO_REFRESH_INTERVAL = 5 * 60;

interface TimeMetric {
  title: string;
  isTimeMoney?: boolean;
  isMoneyOnly?: boolean;
  money?: number;
  hours?: number;
  prevMoney?: number;
  prevHours?: number;
  // Secondary comparator for "Time Today" when viewing Previous.
  yesterdayMoney?: number;
  yesterdayHours?: number;
  showDial?: boolean;
  dialTarget?: number;
  count?: number;
  prevCount?: number;
  secondary?: number;
}

interface EnquiryMetric {
  title: string;
  count?: number;
  prevCount?: number;
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

interface TimeMetricsV2Props {
  metrics: TimeMetric[];
  enquiryMetrics?: EnquiryMetric[];
  enquiryMetricsBreakdown?: unknown;
  isDarkMode: boolean;
  userEmail?: string;
  userInitials?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean; // New: show skeleton state for time metrics
  isLoadingEnquiryMetrics?: boolean; // Separate loading state for enquiry metrics
  /** When true (viewing as production), hide dev features like metric details modal */
  viewAsProd?: boolean;
}

// Skeleton shimmer component for loading states
const SkeletonBox: React.FC<{ width: string; height: string; isDarkMode: boolean; style?: React.CSSProperties; animate?: boolean }> = 
  ({ width, height, isDarkMode, style, animate = true }) => (
  <div style={{
    width,
    height,
    borderRadius: '4px',
    background: isDarkMode 
      ? (animate
        ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.15) 50%, rgba(54, 144, 206, 0.08) 100%)'
        : 'rgba(54, 144, 206, 0.12)')
      : (animate
        ? 'linear-gradient(90deg, rgba(148, 163, 184, 0.15) 0%, rgba(148, 163, 184, 0.25) 50%, rgba(148, 163, 184, 0.15) 100%)'
        : 'rgba(148, 163, 184, 0.2)'),
    backgroundSize: animate ? '200% 100%' : undefined,
    animation: animate ? 'shimmer 1.5s ease-in-out infinite' : 'none',
    ...style,
  }} />
);

// Skeleton metric card for initial loading state
const SkeletonMetricCard: React.FC<{ isDarkMode: boolean; index: number; showDial?: boolean }> = 
  ({ isDarkMode, index, showDial = false }) => (
  <div
    style={{
      background: isDarkMode 
        ? 'linear-gradient(90deg, rgba(14, 22, 38, 0.98) 0%, rgba(24, 34, 52, 0.95) 100%)'
        : 'linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
      borderRadius: '2px',
      padding: '18px',
      border: isDarkMode 
        ? '1px solid rgba(54, 144, 206, 0.15)'
        : '1px solid rgba(148, 163, 184, 0.12)',
      boxShadow: isDarkMode
        ? '0 2px 8px rgba(0, 0, 0, 0.3)'
        : '0 1px 4px rgba(0, 0, 0, 0.06)',
      opacity: 1,
      animation: `fadeIn 0.3s ease ${index * 50}ms both`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <SkeletonBox width="32px" height="32px" isDarkMode={isDarkMode} style={{ borderRadius: '2px' }} animate={false} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <SkeletonBox width="30px" height="12px" isDarkMode={isDarkMode} animate={false} />
        <SkeletonBox width="24px" height="12px" isDarkMode={isDarkMode} animate={false} />
      </div>
    </div>
    {/* Title */}
    <SkeletonBox width="60%" height="14px" isDarkMode={isDarkMode} style={{ marginBottom: '10px' }} animate={false} />
    {/* Value */}
    <SkeletonBox width="45%" height="28px" isDarkMode={isDarkMode} style={{ marginBottom: '8px' }} />
    <SkeletonBox width="32%" height="12px" isDarkMode={isDarkMode} style={{ marginBottom: showDial ? '16px' : '0' }} animate={false} />
    {/* Progress bar if showDial */}
    {showDial && (
      <div style={{ marginTop: '8px' }}>
        <SkeletonBox width="100%" height="6px" isDarkMode={isDarkMode} style={{ borderRadius: '3px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <SkeletonBox width="20px" height="10px" isDarkMode={isDarkMode} animate={false} />
          <SkeletonBox width="30px" height="10px" isDarkMode={isDarkMode} animate={false} />
        </div>
      </div>
    )}
  </div>
);

// Toast notification component - positioned inside section header
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
        animation: visible ? 'fadeIn 0.2s ease' : 'fadeOut 0.2s ease forwards',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {type === 'success' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {type === 'info' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )}
      {message}
    </div>
  );
};

type MetricDeltaInfoProps = {
  text: string;
  isDarkMode: boolean;
};

const MetricDeltaInfo = React.memo(function MetricDeltaInfo({ text, isDarkMode }: MetricDeltaInfoProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <span
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '999px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 700,
          lineHeight: 1,
          color: isDarkMode ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
          background: 'transparent',
          cursor: 'default',
          userSelect: 'none',
        }}
        aria-label="Info"
      >
        i
      </span>
      <span
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          zIndex: 5,
          minWidth: '220px',
          maxWidth: '280px',
          padding: '8px 10px',
          borderRadius: '10px',
          fontSize: '11px',
          lineHeight: 1.35,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          background: isDarkMode ? 'rgba(6, 10, 20, 0.96)' : 'rgba(255,255,255,0.96)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(148, 163, 184, 0.18)'}`,
          boxShadow: isDarkMode ? '0 10px 30px rgba(0,0,0,0.45)' : '0 10px 30px rgba(0,0,0,0.10)',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 140ms ease, transform 140ms ease',
          pointerEvents: 'none',
          whiteSpace: 'normal',
        }}
      >
        {text}
      </span>
    </span>
  );
});

const TimeMetricsV2: React.FC<TimeMetricsV2Props> = ({ metrics, enquiryMetrics, enquiryMetricsBreakdown, isDarkMode, userEmail, userInitials, onRefresh, isRefreshing, isLoading, isLoadingEnquiryMetrics, viewAsProd = false }) => {
  const isSessionStorageAvailable = React.useMemo(() => {
    try {
      const key = '__tmv2_storage_test__';
      sessionStorage.setItem(key, '1');
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }, []);
  const [showEnquiryMetrics, setShowEnquiryMetrics] = React.useState(false);
  const [showPreviousPeriod, setShowPreviousPeriod] = React.useState<boolean>(false);
  const [metricDetails, setMetricDetails] = React.useState<MetricDetails | null>(null);
  const [isMetricDetailsOpen, setIsMetricDetailsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  
  // Show details feature only in local dev when NOT viewing as production
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const showDetailsFeature = isLocalhost && !viewAsProd;
  
  // Track data landing state for smooth transitions
  const [dataLanded, setDataLanded] = React.useState(false);
  const prevLoadingRef = React.useRef(isLoading);
  
  // Auto-refresh countdown state
  const [countdown, setCountdown] = React.useState(AUTO_REFRESH_INTERVAL);
  const [toast, setToast] = React.useState<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean } | null>(null);
  const countdownRef = React.useRef<NodeJS.Timeout | null>(null);
  const wasRefreshingRef = React.useRef(false);

  // Header status badge (morph Syncing → Updated in-place)
  const [showHeaderUpdatedBadge, setShowHeaderUpdatedBadge] = React.useState(false);
  const headerUpdatedTimerRef = React.useRef<number | null>(null);
  
  // Animation key to trigger refresh animation on metric values
  const [refreshAnimationKey, setRefreshAnimationKey] = React.useState(0);
  
  // Format countdown as mm:ss
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Show toast notification
  const showToast = React.useCallback((message: string, type: 'info' | 'success' | 'error', duration: number = 2500) => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(prev => prev ? { ...prev, visible: false } : null);
      setTimeout(() => setToast(null), 200);
    }, duration);
  }, []);
  
  // Detect data landing (loading → not loading transition)
  React.useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      setDataLanded(true);
      setShowHeaderUpdatedBadge(true);
      if (headerUpdatedTimerRef.current) window.clearTimeout(headerUpdatedTimerRef.current);
      headerUpdatedTimerRef.current = window.setTimeout(() => setShowHeaderUpdatedBadge(false), 1800);
      // Reset after animation completes
      const timer = setTimeout(() => setDataLanded(false), 600);
      return () => clearTimeout(timer);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, showToast]);

  React.useEffect(() => {
    return () => {
      if (headerUpdatedTimerRef.current) window.clearTimeout(headerUpdatedTimerRef.current);
    };
  }, []);
  
  // Handle manual refresh - resets countdown
  const handleRefresh = React.useCallback(() => {
    if (onRefresh && !isRefreshing) {
      setCountdown(AUTO_REFRESH_INTERVAL); // Reset countdown on manual refresh
      showToast('Refreshing metrics...', 'info', 1500);
      onRefresh();
    }
  }, [onRefresh, isRefreshing, showToast]);
  
  // Auto-refresh countdown effect
  React.useEffect(() => {
    if (!onRefresh) return;
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger auto-refresh
          if (!isRefreshing) {
            showToast('Auto-refreshing...', 'info', 1500);
            onRefresh();
          }
          return AUTO_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [onRefresh, isRefreshing, showToast]);
  
  // Track refresh completion for success toast and trigger metric animation
  React.useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      setShowHeaderUpdatedBadge(true);
      if (headerUpdatedTimerRef.current) window.clearTimeout(headerUpdatedTimerRef.current);
      headerUpdatedTimerRef.current = window.setTimeout(() => setShowHeaderUpdatedBadge(false), 1800);
      // Trigger refresh animation on all metric values
      setRefreshAnimationKey(prev => prev + 1);
    }
    wasRefreshingRef.current = !!isRefreshing;
  }, [isRefreshing, showToast]);

  const PeriodToggle = (
    <div
      role="group"
      aria-label="Metric period"
      style={{
        display: 'flex',
        alignItems: 'center',
        borderRadius: '10px',
        overflow: 'hidden',
        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(148, 163, 184, 0.22)'}`,
        background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(248, 250, 252, 0.7)',
      }}
    >
        <button
          type="button"
          onClick={() => setShowPreviousPeriod(false)}
          aria-pressed={!showPreviousPeriod}
          style={{
            border: 'none',
            background: !showPreviousPeriod
              ? (isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(54, 144, 206, 0.16)')
              : 'transparent',
            color: !showPreviousPeriod
              ? (isDarkMode ? colours.dark.text : colours.light.text)
              : (isDarkMode ? colours.dark.subText : colours.light.subText),
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Current
        </button>
        <button
          type="button"
          onClick={() => setShowPreviousPeriod(true)}
          aria-pressed={showPreviousPeriod}
          style={{
            border: 'none',
            background: showPreviousPeriod
              ? (isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(54, 144, 206, 0.16)')
              : 'transparent',
            color: showPreviousPeriod
              ? (isDarkMode ? colours.dark.text : colours.light.text)
              : (isDarkMode ? colours.dark.subText : colours.light.subText),
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Previous
        </button>
      </div>
  );
  
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatHours = (hours: number): string => {
    return `${hours.toFixed(1)}h`;
  };

  const getDisplayTitle = (rawTitle: string): string => {
    if (!showPreviousPeriod) return rawTitle;
    if (rawTitle.includes('Today')) return rawTitle.replace('Today', 'Same Day Last Week');
    if (rawTitle.includes('This Week')) return rawTitle.replace('This Week', 'Last Week (to date)');
    if (rawTitle.includes('This Month')) return rawTitle.replace('This Month', 'Last Month (to date)');
    return rawTitle;
  };

  const getPreviousComparatorText = (rawTitle: string): string => {
    if (rawTitle.includes('Today')) return 'Compared to: same weekday last week.';
    if (rawTitle.includes('This Week')) return 'Compared to: last week-to-date (same elapsed workdays).';
    if (rawTitle.includes('This Month')) return 'Compared to: last month-to-date (same day-of-month / same elapsed days).';
    return 'Compared to: previous period.';
  };

  const detailsChipStyle: React.CSSProperties = React.useMemo(() => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.10)'}`,
    background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.7)',
    padding: '3px 8px',
    borderRadius: 999,
    lineHeight: 1,
  }), [isDarkMode]);

  const openTimeMetricDetails = React.useCallback((metric: TimeMetric | EnquiryMetric) => {
    // Only show details modal when feature is enabled
    if (!showDetailsFeature) return;

    const isTime = isTimeMetric(metric);
    const rows: MetricDetails['rows'] = [
      {
        label: 'Period',
        value: showPreviousPeriod ? getDisplayTitle(metric.title) : metric.title,
      },
      {
        label: 'Includes',
        value: isTime
          ? ((metric as TimeMetric).isTimeMoney ? 'Hours and value totals.' : (metric as TimeMetric).isMoneyOnly ? 'Value total.' : 'Hours/count total.')
          : ((metric as EnquiryMetric).isPercentage ? 'Percentage.' : 'Count.'),
      },
      {
        label: 'Comparator',
        value: showPreviousPeriod ? 'Not shown in Previous view.' : getPreviousComparatorText(metric.title),
      },
    ];

    if (showPreviousPeriod && isTime && metric.title === 'Time Today') {
      rows.push({
        label: 'Note',
        value: 'Previous view may also show Yesterday as a secondary reference when available.',
      });
    }

    setMetricDetails({
      title: getDisplayTitle(metric.title),
      subtitle: 'What this metric includes and how its comparison is defined.',
      rows,
    });
    setIsMetricDetailsOpen(true);
  }, [showDetailsFeature, getDisplayTitle, getPreviousComparatorText, showPreviousPeriod]);

  const calculateProgress = (metric: TimeMetric, usePrev: boolean = false): number => {
    if (metric.showDial && metric.dialTarget) {
      const current = metric.isTimeMoney
        ? (usePrev ? (metric.prevHours || 0) : (metric.hours || 0))
        : (usePrev ? (metric.prevCount || 0) : (metric.count || 0));
      return Math.min((current / metric.dialTarget) * 100, 100);
    }
    return 0;
  };

  const getTrendDirection = (current: number, previous: number): 'up' | 'down' | 'neutral' => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'neutral';
  };

  const getTrendColor = (direction: 'up' | 'down' | 'neutral'): string => {
    switch (direction) {
      case 'up': return '#10B981'; // Green
      case 'down': return '#EF4444'; // Red
      default: return isDarkMode ? colours.accent : '#6B7280'; // Accent cyan in dark mode for visibility
    }
  };

  const getIcon = (metric: TimeMetric | EnquiryMetric) => {
    if (metric.title.toLowerCase().includes('outstanding')) return FaMoneyBillWave;
    if (metric.title.toLowerCase().includes('fees')) return FaMoneyBillWave;
    if (metric.title.toLowerCase().includes('time')) return FiClock;
    if (metric.title.toLowerCase().includes('enquir')) return FiTarget;
    if (metric.title.toLowerCase().includes('matter')) return FiTarget;
    if (metric.title.toLowerCase().includes('conversion')) return FiTarget;
    return FiTarget;
  };

  // Count-up animation hook
  const useCountUp = (target: number, durationMs: number = 700, animateOnce: boolean = false): number => {
    const [value, setValue] = React.useState(0);
    const previousTargetRef = React.useRef(0);
    const hasAnimatedRef = React.useRef(false);
    const rafRef = React.useRef<number | null>(null);
    const initialTargetRef = React.useRef<number | null>(null);

    // One-time animation on initial mount
    React.useEffect(() => {
      if (!animateOnce || hasAnimatedRef.current) return;

      const initial = Number.isFinite(target) ? target : 0;
      initialTargetRef.current = initial;
      hasAnimatedRef.current = true; // Mark as started so rapid updates won't restart animation

      const startValue = previousTargetRef.current; // typically 0
      const delta = initial - startValue;
      const startTime = performance.now();

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(startValue + delta * eased);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          previousTargetRef.current = initial;
          rafRef.current = null;
        }
      };

      setValue(startValue);
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
      // Intentionally exclude `target` to avoid restarting during first animation
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animateOnce, durationMs]);

    // After first animation, apply new targets instantly without animation
    React.useEffect(() => {
      if (!animateOnce) return; // handled by the non-animateOnce effect below
      if (!hasAnimatedRef.current) return; // initial animation path handles its own value
      const next = Number.isFinite(target) ? target : 0;
      previousTargetRef.current = next;
      setValue(next);
    }, [animateOnce, target]);

    // Standard animated updates when not in animate-once mode
    React.useEffect(() => {
      if (animateOnce) return;
      const next = Number.isFinite(target) ? target : 0;
      const startValue = previousTargetRef.current;
      const delta = next - startValue;
      const startTime = performance.now();
      let raf: number | null = null;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(startValue + delta * eased);
        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          previousTargetRef.current = next;
          raf = null;
        }
      };

      setValue(startValue);
      raf = requestAnimationFrame(tick);

      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    }, [target, durationMs, animateOnce]);

    return value;
  };

  const AnimatedValue: React.FC<{ value: number; formatter: (n: number) => string; className?: string; style?: React.CSSProperties }>
    = ({ value, formatter, className, style }) => {
      const animated = useCountUp(value);
      return <span className={className} style={style}>{formatter(animated)}</span>;
    };
    const AnimatedValueWithEnabled: React.FC<{ value: number; formatter: (n: number) => string; enabled: boolean; className?: string; style?: React.CSSProperties }>
      = ({ value, formatter, enabled, className, style }) => {
        // When enabled, animate once per component instance, then apply new values instantly
        const animated = useCountUp(enabled ? value : 0, 700, enabled);
        const toRender = enabled ? animated : value;
        return <span className={className} style={style}>{formatter(toRender)}</span>;
      };

  const getDisplaySpec = (metric: TimeMetric, usePrev: boolean = false): { value: number; formatter: (n: number) => string } => {
    if (metric.isMoneyOnly) {
      const value = usePrev ? (metric.prevMoney || 0) : (metric.money || 0);
      return { value, formatter: (n) => formatCurrency(Math.round(n)) };
    }
    if (metric.isTimeMoney) {
      const value = usePrev ? (metric.prevHours || 0) : (metric.hours || 0);
      return { value, formatter: (n) => formatHours(n) };
    }
    const value = usePrev ? (metric.prevCount || 0) : (metric.count || 0);
    return { value, formatter: (n) => Math.round(n).toString() };
  };

  // Type guards
  const isTimeMetric = (metric: TimeMetric | EnquiryMetric): metric is TimeMetric => {
    return 'isTimeMoney' in metric || 'isMoneyOnly' in metric || 'money' in metric || 'hours' in metric;
  };

  const isEnquiryMetric = (metric: TimeMetric | EnquiryMetric): metric is EnquiryMetric => {
    return 'isPercentage' in metric || 'percentage' in metric;
  };

  // Determine which metrics to display
  const currentMetrics = showEnquiryMetrics ? (enquiryMetrics || []) : metrics;
  // Run entrance/count-up animations only once per session/tab refresh
  const [enableAnimationThisMount] = React.useState<boolean>(() => {
    if (!isSessionStorageAvailable) return false;
    try { return sessionStorage.getItem('tmv2_animated') !== 'true'; } catch { return false; }
  });
  
  // Track when the stagger animation is fully complete
  const [animationComplete, setAnimationComplete] = React.useState(!enableAnimationThisMount);
  
  React.useEffect(() => {
    if (enableAnimationThisMount) {
      setMounted(false);
      const t = setTimeout(() => {
        setMounted(true);
        if (isSessionStorageAvailable) {
          try { sessionStorage.setItem('tmv2_animated', 'true'); } catch {}
        }
      }, 0);
      return () => clearTimeout(t);
    }
    setMounted(true);
  }, [enableAnimationThisMount]);

  // Mark animation as complete after all cards have finished animating
  React.useEffect(() => {
    if (enableAnimationThisMount && mounted && !animationComplete) {
      // Wait for the longest animation to complete (last card: 300ms + 4 * 80ms = 620ms, add buffer)
      const completeTimer = setTimeout(() => {
        setAnimationComplete(true);
      }, 800);
      return () => clearTimeout(completeTimer);
    }
  }, [enableAnimationThisMount, mounted, animationComplete]);

  const staggerStyle = (index: number): React.CSSProperties => {
    // Once animation is complete, always return static styles (no transitions)
    if (animationComplete) {
      return {
        opacity: 1,
        transform: 'translateY(0)',
        transition: 'none',
      };
    }
    
    // During animation phase
    if (enableAnimationThisMount) {
      return {
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 300ms ease, transform 300ms ease',
        transitionDelay: `${index * 80}ms`,
      };
    }
    
    // No animation needed
    return {
      opacity: 1,
      transform: 'translateY(0)',
      transition: 'none',
    };
  };
  

  // Helper function to get current value
  const getCurrentValue = (metric: TimeMetric | EnquiryMetric): number => {
    if (isTimeMetric(metric)) {
      return metric.isMoneyOnly ? (metric.money || 0) : 
             metric.isTimeMoney ? (metric.hours || 0) : (metric.count || 0);
    } else {
      return metric.isPercentage ? (metric.percentage || 0) : (metric.count || 0);
    }
  };

  // Helper function to get previous value
  const getPrevValue = (metric: TimeMetric | EnquiryMetric): number => {
    if (isTimeMetric(metric)) {
      return metric.isMoneyOnly ? (metric.prevMoney || 0) : 
             metric.isTimeMoney ? (metric.prevHours || 0) : (metric.prevCount || 0);
    } else {
      return metric.isPercentage ? (metric.prevPercentage || 0) : (metric.prevCount || 0);
    }
  };

  // Helper function to format value display
  const formatValue = (metric: TimeMetric | EnquiryMetric): string => {
    if (isTimeMetric(metric)) {
      return metric.isMoneyOnly ? formatCurrency(metric.money || 0) :
             metric.isTimeMoney ? formatHours(metric.hours || 0) :
             (metric.count || 0).toString();
    } else {
      return metric.isPercentage ? `${(metric.percentage || 0)}%` : (metric.count || 0).toString();
    }
  };

  // If showing enquiry metrics, render the EnquiryMetricsV2 component instead
  if (showEnquiryMetrics && enquiryMetrics) {
    const headerActions = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Toast notification - inline in header */}
        {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}

        {PeriodToggle}
        
        {/* Toggle switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '13px',
            color: isDarkMode ? '#E5E7EB' : '#111827',
            fontWeight: showEnquiryMetrics ? 400 : 700,
          }}>
            Time
          </span>
          <button
            onClick={() => setShowEnquiryMetrics(!showEnquiryMetrics)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : '#CBD5E1'}`,
              background: showEnquiryMetrics 
                ? colours.highlight
                : (isDarkMode ? 'rgba(7, 16, 32, 0.9)' : '#FFFFFF'),
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'inset 0 0 0 1px rgba(0,0,0,0.02)'
            }}
            aria-label="Toggle Time/Enquiries"
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: isDarkMode ? '#E5E7EB' : '#FFFFFF',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.4)' : '#E5E7EB'}`,
              position: 'absolute',
              top: '1px',
              left: showEnquiryMetrics ? '24px' : '2px',
              transition: 'all 0.2s ease',
              boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
            }} />
          </button>
          <span style={{
            fontSize: '13px',
            color: isDarkMode ? '#E5E7EB' : '#111827',
            fontWeight: showEnquiryMetrics ? 700 : 400,
          }}>
            Conversion
          </span>
        </div>
      </div>
    );

    return (
      <div style={{ padding: '0', margin: '0', position: 'relative', background: 'transparent' }}>
        <EnquiryMetricsV2 
          metrics={enquiryMetrics} 
          isDarkMode={isDarkMode} 
          userEmail={userEmail}
          userInitials={userInitials}
          headerActions={headerActions}
          title={'Conversion Metrics'}
          refreshAnimationKey={refreshAnimationKey}
          isLoading={isLoadingEnquiryMetrics ?? isLoading}
          breakdown={enquiryMetricsBreakdown}
          showPreviousPeriod={showPreviousPeriod}
        />
      </div>
    );
  }

  return (
    <div style={{
      padding: '0 16px',
      margin: '0',
      position: 'relative',
      background: 'transparent',
    }}>
      {/* Unified Time Metrics Container with integrated header (ops dashboard style) */}
      <div style={{
        background: isDarkMode 
          ? 'linear-gradient(90deg, rgba(6, 10, 20, 0.98) 0%, rgba(10, 16, 28, 0.98) 100%)'
          : 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '2px',
        border: isDarkMode 
          ? '1px solid rgba(54, 144, 206, 0.15)' 
          : '1px solid rgba(148, 163, 184, 0.15)',
        boxShadow: isDarkMode
          ? '0 4px 24px rgba(0,0,0,0.4)'
          : '0 2px 16px rgba(0,0,0,0.05)',
        marginBottom: '16px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Accent gradient line at top */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: isDarkMode 
            ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.5) 0%, rgba(135, 243, 243, 0.3) 50%, rgba(54, 144, 206, 0.5) 100%)'
            : 'linear-gradient(90deg, rgba(54, 144, 206, 0.3) 0%, rgba(54, 144, 206, 0.5) 50%, rgba(54, 144, 206, 0.3) 100%)',
        }} />
        {/* Header inside the container */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: isDarkMode 
            ? '1px solid rgba(54, 144, 206, 0.12)' 
            : '1px solid rgba(148, 163, 184, 0.12)',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              letterSpacing: '-0.025em',
            }}>
              Time Metrics
            </h2>
            {/* Status badge slot: Syncing → Updated (morph in-place) */}
            {(isLoading || showHeaderUpdatedBadge) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '12px',
                background: isLoading
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
                  : (isDarkMode ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.10)'),
                border: `1px solid ${isLoading
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)')
                  : (isDarkMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.22)')}`,
                transition: 'background 180ms ease, border-color 180ms ease',
              }}>
                {isLoading ? (
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke={colours.highlight}
                    strokeWidth="2"
                    style={{ animation: 'spinReverse 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 500, 
                  color: isLoading ? colours.highlight : colours.green,
                  transition: 'color 180ms ease',
                }}>
                  {isLoading ? 'Syncing Clio...' : 'Updated'}
                </span>
              </div>
            )}
            {onRefresh && !isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: isRefreshing ? 'default' : 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    opacity: isRefreshing ? 0.5 : 0.6,
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => { if (!isRefreshing) e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { if (!isRefreshing) e.currentTarget.style.opacity = '0.6'; }}
                  aria-label="Refresh time metrics"
                  title={`Refresh time metrics (auto-refresh in ${formatCountdown(countdown)})`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isDarkMode ? colours.dark.text : colours.light.text}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                    }}
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                </button>
                {/* Subtle countdown timer */}
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                    color: isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                    transition: 'color 0.15s ease',
                    minWidth: '32px',
                  }}
                  title={`Auto-refresh in ${formatCountdown(countdown)}`}
                >
                  {formatCountdown(countdown)}
                </span>
              </div>
            )}
          </div>
          
          {/* Right side: Toast notification + Toggle Switch */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            {/* Toast notification - inline in header */}
            {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}

            {PeriodToggle}
            
            {/* Toggle Switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
            <span style={{ fontSize: '13px', color: isDarkMode ? '#E5E7EB' : '#111827', fontWeight: showEnquiryMetrics ? 400 : 700 }}>Time</span>
            <button
              onClick={() => setShowEnquiryMetrics(!showEnquiryMetrics)}
              style={{
                width: '50px',
                height: '26px',
                borderRadius: '13px',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : '#CBD5E1'}`,
                background: showEnquiryMetrics 
                  ? colours.highlight
                  : (isDarkMode ? 'rgba(7, 16, 32, 0.9)' : '#FFFFFF'),
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'inset 0 0 0 1px rgba(0,0,0,0.02)'
              }}
              aria-label="Toggle Time/Enquiries"
            >
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: isDarkMode ? '#E5E7EB' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.4)' : '#E5E7EB'}`,
                position: 'absolute',
                top: '1px',
                left: showEnquiryMetrics ? '24px' : '2px',
                transition: 'all 0.2s ease',
                boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
              }} />
            </button>
            <span style={{ fontSize: '13px', color: isDarkMode ? '#E5E7EB' : '#111827', fontWeight: showEnquiryMetrics ? 700 : 400 }}>Conversion</span>
            </div>
          </div>
        </div>
        
        {/* Metrics content with padding */}
        <div style={{
          padding: '0 16px 16px 16px',
        }}>
          {/* Skeleton loading state */}
          {isLoading && (
            <div className="metricsGridThree" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
            }}>
              <SkeletonMetricCard isDarkMode={isDarkMode} index={0} showDial={true} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={1} showDial={true} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={2} showDial={false} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={3} showDial={false} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={4} showDial={false} />
            </div>
          )}
          
          {/* Data loaded state */}
          {!isLoading && (
          <>
          {/* Match original metricsGridThree layout */}
          <div className="metricsGridThree" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginBottom: currentMetrics.length > 3 ? '16px' : '0',
          }}>
            {/* First row - first 3 metrics */}
            {currentMetrics.slice(0, 3).map((metric, index) => {
          const Icon = getIcon(metric);
          const currentValue = getCurrentValue(metric);
          const prevValue = getPrevValue(metric);
          const displayValue = showPreviousPeriod ? prevValue : currentValue;
          const progress = isTimeMetric(metric) ? calculateProgress(metric as TimeMetric, showPreviousPeriod) : 0;
          const trend = getTrendDirection(currentValue, prevValue);
          const trendColor = getTrendColor(trend);

          return (
            <div
              key={metric.title}
              style={{
                background: isDarkMode 
                  ? 'linear-gradient(90deg, rgba(14, 22, 38, 0.98) 0%, rgba(24, 34, 52, 0.95) 100%)'
                  : 'linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
                borderRadius: '2px',
                padding: '18px',
                border: isDarkMode 
                  ? '1px solid rgba(54, 144, 206, 0.2)'
                  : '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: isDarkMode
                  ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                  : '0 1px 4px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                position: 'relative',
                ...staggerStyle(index),
                animation: dataLanded 
                  ? `dataLanded 0.5s ease ${index * 0.06}s both`
                  : refreshAnimationKey > 0 
                    ? `metricRefresh 0.4s ease ${index * 0.05}s both` 
                    : undefined,
              }}
              role="button"
              tabIndex={0}
              onClick={() => openTimeMetricDetails(metric)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openTimeMetricDetails(metric);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = isDarkMode
                  ? 'rgba(54, 144, 206, 0.2)'
                  : 'rgba(54, 144, 206, 0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                const icon = e.currentTarget.querySelector('[data-metric-icon]') as HTMLElement;
                if (icon) icon.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDarkMode
                  ? 'rgba(54, 144, 206, 0.12)'
                  : 'rgba(148, 163, 184, 0.12)';
                e.currentTarget.style.transform = 'translateY(0)';
                const icon = e.currentTarget.querySelector('[data-metric-icon]') as HTMLElement;
                if (icon) icon.style.transform = 'scale(1)';
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}>
                <div 
                  data-metric-icon
                  style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '2px',
                  background: isDarkMode 
                    ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.2) 0%, rgba(135, 243, 243, 0.12) 100%)'
                    : 'linear-gradient(135deg, rgba(54, 144, 206, 0.15) 0%, rgba(54, 144, 206, 0.08) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDarkMode ? colours.accent : colours.highlight,
                  transition: 'transform 0.12s ease',
                  boxShadow: isDarkMode ? '0 2px 6px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                }}>
                  <Icon size={15} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!showPreviousPeriod && (prevValue > 0 || metric.title === 'Time Today') && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}>
                      <span style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>
                        Last:
                      </span>
                      <span style={{ color: trendColor, fontWeight: 600 }}>
                        {isTimeMetric(metric) && metric.isMoneyOnly 
                          ? formatCurrency(prevValue)
                          : isTimeMetric(metric) && metric.isTimeMoney
                          ? formatHours(prevValue)
                          : prevValue.toFixed(0)}
                      </span>
                      <FiTrendingUp 
                        size={12} 
                        style={{ 
                          transform: trend === 'down' ? 'rotate(180deg)' : 'none',
                          color: trendColor,
                        }} 
                      />
                      <MetricDeltaInfo isDarkMode={isDarkMode} text={getPreviousComparatorText(metric.title)} />
                    </div>
                  )}
                  {showDetailsFeature && <span style={detailsChipStyle}>Details</span>}
                </div>
              </div>

              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '13px',
                fontWeight: 500,
                color: isDarkMode ? '#9CA3AF' : '#6B7280',
                lineHeight: '1.2',
              }}>
                {getDisplayTitle(metric.title)}
              </h3>

              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                marginBottom: (isTimeMetric(metric) && metric.showDial) ? '16px' : '0',
              }}>
                <AnimatedValueWithEnabled
                  value={getDisplaySpec(metric as TimeMetric, showPreviousPeriod).value}
                  formatter={getDisplaySpec(metric as TimeMetric, showPreviousPeriod).formatter}
                  enabled={enableAnimationThisMount && !showPreviousPeriod}
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: isDarkMode ? '#F9FAFB' : '#0f172a',
                    letterSpacing: '-0.03em',
                    textShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                  }}
                />
                {isTimeMetric(metric) && metric.isTimeMoney && ((showPreviousPeriod ? (metric.prevMoney ?? 0) : (metric.money ?? 0)) > 0) && (
                  <AnimatedValueWithEnabled
                    value={showPreviousPeriod ? (metric.prevMoney || 0) : (metric.money || 0)}
                    formatter={(n) => formatCurrency(Math.round(n))}
                    enabled={enableAnimationThisMount && !showPreviousPeriod}
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: isDarkMode ? '#10B981' : '#059669',
                    }}
                  />
                )}
              </div>

              {showPreviousPeriod &&
                isTimeMetric(metric) &&
                metric.title === 'Time Today' &&
                (((metric.yesterdayHours ?? 0) > 0) || ((metric.yesterdayMoney ?? 0) > 0)) && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontWeight: 500,
                  }}>
                    Yesterday: {formatHours(metric.yesterdayHours || 0)}
                    {metric.isTimeMoney && (metric.yesterdayMoney || 0) > 0 && (
                      <span> · {formatCurrency(Math.round(metric.yesterdayMoney || 0))}</span>
                    )}
                  </div>
                )}

              {isTimeMetric(metric) && metric.showDial && metric.dialTarget && (
                <div style={{
                  position: 'relative',
                  marginTop: '14px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}>
                    <span style={{
                      fontSize: '11px',
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      fontWeight: 500,
                    }}>
                      Progress
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      fontWeight: 500,
                    }}>
                      Target: {metric.dialTarget}
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.15)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    boxShadow: isDarkMode ? 'inset 0 1px 2px rgba(0,0,0,0.2)' : 'inset 0 1px 2px rgba(0,0,0,0.05)',
                  }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: progress >= 100 
                        ? `linear-gradient(90deg, ${colours.green} 0%, #34d399 100%)`
                        : isDarkMode
                        ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                        : `linear-gradient(90deg, ${colours.highlight} 0%, #60a5fa 100%)`,
                      borderRadius: '4px',
                      transition: enableAnimationThisMount ? 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                      boxShadow: isDarkMode ? '0 0 8px rgba(54, 144, 206, 0.4)' : '0 0 6px rgba(54, 144, 206, 0.3)',
                    }} />
                  </div>
                  <div style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    color: isDarkMode ? '#6B7280' : '#9CA3AF',
                    textAlign: 'right',
                  }}>
                    {progress.toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>
        
        {/* Second row - remaining metrics if any */}
        {currentMetrics.length > 3 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '16px',
            marginTop: '16px',
          }}>
            {currentMetrics.slice(3).map((metric, index) => {
              const Icon = getIcon(metric);
              const currentValue = getCurrentValue(metric);
              const prevValue = getPrevValue(metric);
              const displayValue = showPreviousPeriod ? prevValue : currentValue;
              const progress = isTimeMetric(metric) ? calculateProgress(metric as TimeMetric, showPreviousPeriod) : 0;
              const trend = getTrendDirection(currentValue, prevValue);
              const trendColor = getTrendColor(trend);

              return (
                <div
                  key={metric.title}
                  style={{
                    background: isDarkMode 
                      ? 'rgba(15, 23, 42, 0.6)'
                      : 'rgba(255, 255, 255, 0.8)',
                    borderRadius: '2px',
                    padding: '16px',
                    border: isDarkMode 
                      ? '1px solid rgba(54, 144, 206, 0.12)'
                      : '1px solid rgba(148, 163, 184, 0.12)',
                    boxShadow: isDarkMode
                      ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                      : '0 1px 4px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.12s ease',
                    cursor: 'pointer',
                    ...staggerStyle(index + 3),
                    animation: dataLanded 
                      ? `dataLanded 0.5s ease ${(index + 3) * 0.06}s both`
                      : refreshAnimationKey > 0 
                        ? `metricRefresh 0.4s ease ${(index + 3) * 0.05}s both` 
                        : undefined,
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTimeMetricDetails(metric)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openTimeMetricDetails(metric);
                    }
                  }}
                >
                  {/* Same card content structure */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <Icon size={16} style={{
                        color: isDarkMode ? colours.accent : colours.highlight,
                      }} />
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: isDarkMode ? colours.accent : colours.highlight,
                      }}>
                        {getDisplayTitle(metric.title)}
                      </span>
                    </div>
                    {/* Only show trend indicator if prevValue exists and is greater than 0 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {!showPreviousPeriod && prevValue > 0 && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          color: trendColor,
                          fontWeight: 600,
                        }}>
                          {trend === 'up' && '↗'}
                          {trend === 'down' && '↘'}
                          {trend === 'neutral' && '→'}
                          <span>
                            {trend === 'up' && '+'}
                            {Math.abs(((currentValue - prevValue) / prevValue) * 100).toFixed(0)}%
                          </span>
                          <MetricDeltaInfo isDarkMode={isDarkMode} text={getPreviousComparatorText(metric.title)} />
                        </div>
                      )}
                      {showDetailsFeature && <span style={detailsChipStyle}>Details</span>}
                    </div>
                  </div>

                  <div style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    marginBottom: '8px',
                  }}>
                    <AnimatedValueWithEnabled
                      value={getDisplaySpec(metric as TimeMetric, showPreviousPeriod).value}
                      formatter={getDisplaySpec(metric as TimeMetric, showPreviousPeriod).formatter}
                      enabled={enableAnimationThisMount && !showPreviousPeriod}
                    />
                  </div>

                  {/* Show firm total for metrics with secondary value */}
                  {isTimeMetric(metric) && metric.secondary !== undefined && (
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      marginBottom: '8px',
                    }}>
                      Firm total: {formatCurrency(metric.secondary)}
                    </div>
                  )}

                  {/* Show previous month value for money-only metrics without secondary */}
                  {isTimeMetric(metric) && metric.isMoneyOnly && !showPreviousPeriod && prevValue > 0 && metric.secondary === undefined && (
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      marginBottom: '8px',
                    }}>
                      Last month: {formatCurrency(prevValue)}
                    </div>
                  )}

                  {isTimeMetric(metric) && metric.isTimeMoney && ((showPreviousPeriod ? (metric.prevMoney ?? 0) : (metric.money ?? 0)) > 0) && (
                    <div style={{
                      fontSize: '12px',
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      marginBottom: '12px',
                    }}>
                      <AnimatedValueWithEnabled
                        value={showPreviousPeriod ? (metric.prevMoney || 0) : (metric.money || 0)}
                        formatter={(n) => `£${Math.round(n).toLocaleString()}`}
                        enabled={enableAnimationThisMount && !showPreviousPeriod}
                      />
                    </div>
                  )}

                  {/* Progress bar */}
                  {isTimeMetric(metric) && metric.showDial && (
                    <div style={{
                      marginTop: '12px',
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}>
                        <span style={{
                          fontSize: '11px',
                          color: isDarkMode ? '#9CA3AF' : '#6B7280',
                          fontWeight: 500,
                        }}>
                          Progress
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: isDarkMode ? '#9CA3AF' : '#6B7280',
                          fontWeight: 500,
                        }}>
                          Target: {isTimeMetric(metric) ? metric.dialTarget : 0}
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                        borderTopLeftRadius: '6px',
                        borderBottomRightRadius: '6px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${progress}%`,
                          height: '100%',
                          background: progress >= 100 
                            ? `linear-gradient(90deg, ${colours.green} 0%, rgba(32, 178, 108, 0.8) 100%)`
                            : isDarkMode
                            ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                            : colours.highlight,
                          borderTopLeftRadius: '6px',
                          borderBottomRightRadius: '6px',
                          transition: enableAnimationThisMount ? 'width 0.3s ease' : 'none',
                        }} />
                      </div>
                      <div style={{
                        marginTop: '4px',
                        fontSize: '10px',
                        color: isDarkMode ? '#6B7280' : '#9CA3AF',
                        textAlign: 'right',
                      }}>
                        {progress.toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>  
        )}
        </div> {/* Close metrics content padding */}
      </div> {/* Close unified Time Metrics container */}

      <MetricDetailsModal
        isOpen={isMetricDetailsOpen}
        onClose={() => setIsMetricDetailsOpen(false)}
        isDarkMode={isDarkMode}
        details={metricDetails}
      />
    </div>
  );
};

export default TimeMetricsV2;