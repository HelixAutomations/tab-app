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

  /* Mobile responsive grids */
  @media (max-width: 640px) {
    .metricsGridThree {
      grid-template-columns: 1fr !important;
    }
    .metricsGridTwo {
      grid-template-columns: 1fr !important;
    }
    .tmv2-header {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 10px !important;
    }
    .tmv2-header-right {
      width: 100% !important;
      justify-content: space-between !important;
    }
    .tmv2-metric-card {
      padding: 14px !important;
    }
    .tmv2-metric-value {
      font-size: 24px !important;
    }
  }
  @media (min-width: 641px) and (max-width: 900px) {
    .metricsGridThree {
      grid-template-columns: repeat(2, 1fr) !important;
    }
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
        ? `linear-gradient(90deg, rgba(6, 23, 51, 0.25) 0%, rgba(6, 23, 51, 0.45) 50%, rgba(6, 23, 51, 0.25) 100%)`
        : 'rgba(6, 23, 51, 0.35)')
      : (animate
        ? 'linear-gradient(90deg, rgba(148, 163, 184, 0.15) 0%, rgba(148, 163, 184, 0.25) 50%, rgba(148, 163, 184, 0.15) 100%)'
        : 'rgba(148, 163, 184, 0.2)'),
    backgroundSize: animate ? '200% 100%' : undefined,
    animation: animate ? 'shimmer 1.5s ease-in-out infinite' : 'none',
    ...style,
  }} />
);

// Toast notification component - positioned inside section header
const Toast: React.FC<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean; isDarkMode: boolean }> = ({ message, type, visible, isDarkMode }) => {
  const bgColor = type === 'success' 
    ? (isDarkMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)') 
    : type === 'error' 
      ? (isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)') 
      : (isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(54, 144, 206, 0.1)');
  const textColor = type === 'success' ? colours.green : type === 'error' ? colours.cta : (isDarkMode ? colours.subtleGrey : colours.highlight);
  return (
    <div
      style={{
        padding: '4px 10px',
        borderRadius: '4px',
        background: bgColor,
        border: `1px solid ${type === 'success' ? colours.green : type === 'error' ? colours.cta : (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.highlight)}`,
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
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.22)'}`,
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
          background: isDarkMode ? 'rgba(6, 23, 51, 0.98)' : 'rgba(255,255,255,0.96)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.18)'}`,
          boxShadow: isDarkMode ? '0 10px 30px rgba(0, 3, 25, 0.45)' : '0 10px 30px rgba(0,0,0,0.10)',
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

// ─── Animation utilities (module-scope for stable component identity) ─────────
const ANIM_DURATION = 800;
const easeInOut = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * useCountUp — animate from 0 → target ONCE with ease-in-out, then instant-update forever.
 * replayKey: when incremented, resets and re-animates.
 */
function useCountUp(target: number, durationMs: number = ANIM_DURATION, shouldAnimate: boolean = true, replayKey: number = 0): number {
  const [value, setValue] = React.useState(shouldAnimate ? 0 : target);
  const hasAnimatedRef = React.useRef(false);
  const rafRef = React.useRef<number | null>(null);
  const prevReplayRef = React.useRef(replayKey);

  React.useEffect(() => {
    // Detect replay: reset animation state so the effect body re-animates
    if (prevReplayRef.current !== replayKey) {
      prevReplayRef.current = replayKey;
      hasAnimatedRef.current = false;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }

    const safe = Number.isFinite(target) ? target : 0;

    // After first animation (or if animation disabled), apply values instantly
    if (!shouldAnimate || hasAnimatedRef.current) {
      setValue(safe);
      return;
    }

    // Wait for real data before animating (don't animate to 0)
    if (safe === 0) return;

    hasAnimatedRef.current = true;
    setValue(0);
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      setValue(safe * easeInOut(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [shouldAnimate, target, durationMs, replayKey]);

  return value;
}

/** Animated number span — stable component identity (defined at module scope) */
const AnimatedValueWithEnabled: React.FC<{
  value: number; formatter: (n: number) => string; enabled: boolean; replayKey: number;
  className?: string; style?: React.CSSProperties;
}> = React.memo(({ value, formatter, enabled, replayKey, className, style }) => {
  const animated = useCountUp(value, ANIM_DURATION, enabled, replayKey);
  return <span className={className} style={style}>{formatter(animated)}</span>;
});

/** Animated progress bar — stable component identity (defined at module scope) */
const AnimatedProgressBar: React.FC<{
  progress: number; enabled: boolean; replayKey: number; isDarkMode: boolean;
  height?: number; radiusStyle?: 'round' | 'asymmetric';
  colourFn: (p: number) => string; trackBg: string;
  targetLabel?: string | number; trackShadow?: string; barShadow?: string;
}> = React.memo(({ progress, enabled, replayKey, isDarkMode, height = 3, radiusStyle = 'round', colourFn, trackBg, targetLabel, trackShadow, barShadow }) => {
  const animatedProgress = useCountUp(progress, ANIM_DURATION, enabled, replayKey);
  const borderRadius = radiusStyle === 'round' ? `${height / 2}px` : undefined;
  const borderTopLeftRadius = radiusStyle === 'asymmetric' ? '6px' : borderRadius;
  const borderBottomRightRadius = radiusStyle === 'asymmetric' ? '6px' : borderRadius;

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: isDarkMode ? '#9CA3AF' : '#6B7280', fontWeight: 500 }}>Progress</span>
        {targetLabel !== undefined && (
          <span style={{ fontSize: '11px', color: isDarkMode ? '#9CA3AF' : '#6B7280', fontWeight: 500 }}>Target: {targetLabel}</span>
        )}
      </div>
      <div style={{
        width: '100%', height: `${height}px`, background: trackBg,
        borderTopLeftRadius, borderBottomRightRadius,
        borderTopRightRadius: radiusStyle === 'round' ? borderRadius : undefined,
        borderBottomLeftRadius: radiusStyle === 'round' ? borderRadius : undefined,
        overflow: 'hidden', boxShadow: trackShadow,
      }}>
        <div style={{
          width: `${animatedProgress}%`, height: '100%',
          background: colourFn(animatedProgress),
          borderTopLeftRadius, borderBottomRightRadius,
          borderTopRightRadius: radiusStyle === 'round' ? borderRadius : undefined,
          borderBottomLeftRadius: radiusStyle === 'round' ? borderRadius : undefined,
          boxShadow: barShadow,
        }} />
      </div>
      <div style={{ marginTop: '4px', fontSize: '10px', color: isDarkMode ? '#6B7280' : '#9CA3AF', textAlign: 'right' }}>
        {animatedProgress.toFixed(0)}%
      </div>
    </div>
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
  // Previous period comparison is always visible
  const showPreviousPeriod = true;
  const [metricDetails, setMetricDetails] = React.useState<MetricDetails | null>(null);
  const [isMetricDetailsOpen, setIsMetricDetailsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  
  // Show details feature only in local dev when NOT viewing as production
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const showDetailsFeature = isLocalhost && !viewAsProd;

  const sectionRailStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(248, 250, 252, 0.68)',
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.08)' : '1px solid rgba(148, 163, 184, 0.16)',
    padding: '3px',
  }), [isDarkMode]);

  const metricBlockStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(0, 3, 25, 0.28)' : 'rgba(255, 255, 255, 0.66)',
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.06)' : '1px solid rgba(148, 163, 184, 0.12)',
    borderLeft: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.45)' : 'rgba(54, 144, 206, 0.55)'}`,
    borderRadius: '0',
    padding: '8px',
    boxShadow: 'none',
  }), [isDarkMode]);
  
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

  // Period toggle removed — previous values shown inline as faded comparison
  
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
    return rawTitle;
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
        value: getDisplayTitle(metric.title),
      },
      {
        label: 'Includes',
        value: isTime
          ? ((metric as TimeMetric).isTimeMoney ? 'Hours and value totals.' : (metric as TimeMetric).isMoneyOnly ? 'Value total.' : 'Hours/count total.')
          : ((metric as EnquiryMetric).isPercentage ? 'Percentage.' : 'Count.'),
      },
    ];

    if (isTime && metric.title === 'Time Today') {
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
  }, [showDetailsFeature, getDisplayTitle]);

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
      default: return isDarkMode ? colours.subtleGrey : '#6B7280';
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
  // useCountUp, AnimatedValueWithEnabled, AnimatedProgressBar — defined at module scope above

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

  // Time metrics are always displayed
  const currentMetrics = metrics;

  // Animation replay support — key forces re-mount of animated children
  const [replayKey, setReplayKey] = React.useState(0);

  // Run entrance/count-up animations only once per session/tab refresh
  const [enableAnimationThisMount, setEnableAnimationThisMount] = React.useState<boolean>(() => {
    if (!isSessionStorageAvailable) return false;
    try { return sessionStorage.getItem('tmv2_animated') !== 'true'; } catch { return false; }
  });

  // Listen for replay event (from UserBubble dev tools)
  React.useEffect(() => {
    const handler = () => {
      if (isSessionStorageAvailable) {
        try { sessionStorage.removeItem('tmv2_animated'); } catch {}
      }
      setEnableAnimationThisMount(true);
      setAnimationComplete(false);
      setMounted(false);
      setReplayKey(k => k + 1);
    };
    window.addEventListener('replayMetricAnimation', handler);
    return () => window.removeEventListener('replayMetricAnimation', handler);
  }, [isSessionStorageAvailable]);
  
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
  }, [enableAnimationThisMount, replayKey]);

  // Mark animation as complete after all cards have finished animating
  React.useEffect(() => {
    if (enableAnimationThisMount && mounted && !animationComplete) {
      // Wait for the longest animation to complete (ANIM_DURATION + stagger buffer)
      const completeTimer = setTimeout(() => {
        setAnimationComplete(true);
      }, ANIM_DURATION + 200);
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

  return (
    <div style={{
      padding: '0',
      margin: '0',
      position: 'relative',
      background: 'transparent',
    }}>
      {/* Unified dashboard container — flat motherboard surface */}
      <div style={{
        background: isDarkMode 
          ? colours.websiteBlue
          : 'rgba(255, 255, 255, 0.98)',
        borderRadius: '0',
        border: 'none',
        boxShadow: 'none',
        marginBottom: '0',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Top separator line — full-width highlight blue edge */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: colours.highlight,
        }} />
        {/* Header inside the container */}
        <div className="tmv2-header" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 10px',
          background: 'transparent',
          borderBottom: isDarkMode 
            ? '1px solid rgba(54, 144, 206, 0.08)'
            : '1px solid rgba(148, 163, 184, 0.12)',
          marginBottom: '0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{
              margin: 0,
              fontSize: '12px',
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
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '12px',
                background: isLoading
                  ? (isDarkMode ? 'rgba(6, 23, 51, 0.6)' : 'rgba(54, 144, 206, 0.1)')
                  : (isDarkMode ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.10)'),
                border: `1px solid ${isLoading
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.2)')
                  : (isDarkMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.22)')}`,
                transition: 'background 180ms ease, border-color 180ms ease',
              }}>
                {isLoading ? (
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke={isDarkMode ? colours.subtleGrey : colours.highlight}
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
                  fontSize: '10px', 
                  fontWeight: 500, 
                  color: isLoading ? (isDarkMode ? colours.subtleGrey : colours.highlight) : colours.green,
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
          
          {/* Right side: Toast notification */}
          <div className="tmv2-header-right" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}
          </div>
        </div>
        
        {/* ─── Dashboard data rows ─── */}
        <div style={{ padding: '0 10px 10px 10px' }}>

          {/* Time section panel */}
          <div style={{
            background: isDarkMode ? 'rgba(6, 23, 51, 0.28)' : 'rgba(248, 250, 252, 0.7)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.14)'}`,
            borderRadius: '0',
            padding: '0',
            marginTop: '6px',
          }}>
            {/* Time heading */}
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              padding: '8px 12px 4px 12px',
            }}>
              Time
            </div>

          {/* Time metric tiles — 3:2 dashboard grid */}
          {isLoading ? (
            <div style={{ padding: '0 12px 10px 12px' }}>
              {/* Skeleton row 1: 3 across */}
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    padding: '10px 10px',
                    borderRight: i < 2 ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(148, 163, 184, 0.08)'}` : 'none',
                  }}>
                    <SkeletonBox width="70px" height="9px" isDarkMode={isDarkMode} animate={false} />
                    <div style={{ marginTop: '6px' }}>
                      <SkeletonBox width="55px" height="18px" isDarkMode={isDarkMode} />
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <SkeletonBox width="100%" height="3px" isDarkMode={isDarkMode} animate={false} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(148, 163, 184, 0.08)'}` }} />
              {/* Skeleton row 2: 2 across */}
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0' }}>
                {[0,1].map(i => (
                  <div key={i} style={{
                    padding: '10px 10px',
                    borderRight: i < 1 ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(148, 163, 184, 0.08)'}` : 'none',
                  }}>
                    <SkeletonBox width="90px" height="9px" isDarkMode={isDarkMode} animate={false} />
                    <div style={{ marginTop: '6px' }}>
                      <SkeletonBox width="65px" height="18px" isDarkMode={isDarkMode} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '4px 8px 8px 8px' }}>
              {/* Row 1: first 3 metrics */}
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {currentMetrics.slice(0, 3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const prevValue = getPrevValue(metric);
                  const progress = isTimeMetric(metric) ? calculateProgress(metric as TimeMetric, showPreviousPeriod) : 0;
                  const trend = getTrendDirection(currentValue, prevValue);
                  const trendColor = getTrendColor(trend);
                  const hasProgress = isTimeMetric(metric) && metric.showDial && metric.dialTarget;
                  const spec = getDisplaySpec(metric as TimeMetric, false);

                  return (
                    <div
                      className="tmv2-metric-card"
                      key={metric.title}
                      style={{
                        padding: '10px 12px 12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.05) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.55)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(148, 163, 184, 0.16)'}`,
                        boxShadow: isDarkMode
                          ? 'inset 0 1px 0 rgba(54, 144, 206, 0.06), 0 1px 3px rgba(0, 3, 25, 0.20)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.04)',
                        cursor: showDetailsFeature ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
                        borderRadius: '0',
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
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimeMetricDetails(metric); }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.14) 0%, rgba(54, 144, 206, 0.02) 60%), rgba(6, 23, 51, 0.55)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.75)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.22)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 6px 16px rgba(0, 3, 25, 0.35)'
                          : '0 4px 12px rgba(6, 23, 51, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.05) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.55)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(148, 163, 184, 0.16)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? 'inset 0 1px 0 rgba(54, 144, 206, 0.06), 0 1px 3px rgba(0, 3, 25, 0.20)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.04)';
                      }}
                    >
                      {/* Label */}
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: isDarkMode ? 'rgba(243, 244, 246, 0.55)' : 'rgba(15, 23, 42, 0.50)',
                        marginBottom: '4px',
                        whiteSpace: 'nowrap' as const,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {getDisplayTitle(metric.title)}
                      </div>

                      {/* Value row */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <AnimatedValueWithEnabled
                          value={spec.value}
                          formatter={spec.formatter}
                          enabled={enableAnimationThisMount}
                          replayKey={replayKey}
                          className="tmv2-metric-value"
                          style={{
                            fontSize: '18px',
                            fontWeight: 700,
                            color: isDarkMode ? '#F9FAFB' : '#0f172a',
                            letterSpacing: '-0.03em',
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1.1,
                          }}
                        />
                        {/* Money sub-value */}
                        {isTimeMetric(metric) && metric.isTimeMoney && ((metric.money ?? 0) > 0) && (
                          <AnimatedValueWithEnabled
                            value={metric.money || 0}
                            formatter={(n) => formatCurrency(Math.round(n))}
                            enabled={enableAnimationThisMount}
                            replayKey={replayKey}
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: isDarkMode ? colours.green : '#059669',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        )}
                        {/* Previous period delta */}
                        {(prevValue > 0 || metric.title === 'Time Today') && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '2px',
                            fontSize: '10px', fontWeight: 500,
                            color: trend !== 'neutral' ? trendColor : (isDarkMode ? colours.subtleGrey : colours.greyText),
                            opacity: 0.8,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums',
                          }}>
                            {prevValue > 0 && trend !== 'neutral' && (
                              <FiTrendingUp size={9} style={{ transform: trend === 'down' ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                            )}
                            <span>
                              {isTimeMetric(metric) && metric.isMoneyOnly ? formatCurrency(prevValue)
                                : isTimeMetric(metric) && metric.isTimeMoney ? formatHours(prevValue)
                                : prevValue.toFixed(0)}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {hasProgress && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            flex: 1, height: '3px',
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(148, 163, 184, 0.15)',
                            borderRadius: '2px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(progress, 100)}%`, height: '100%',
                              background: progress >= 100 ? colours.green : colours.highlight,
                              borderRadius: '2px',
                              transition: enableAnimationThisMount ? 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                            }} />
                          </div>
                          <span style={{
                            fontSize: '9px', fontWeight: 500,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            fontVariantNumeric: 'tabular-nums', minWidth: '24px', textAlign: 'right' as const,
                          }}>
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Row 2: last 2 metrics */}
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginTop: '4px' }}>
                {currentMetrics.slice(3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const prevValue = getPrevValue(metric);
                  const trend = getTrendDirection(currentValue, prevValue);
                  const trendColor = getTrendColor(trend);
                  const spec = getDisplaySpec(metric as TimeMetric, false);

                  return (
                    <div
                      className="tmv2-metric-card"
                      key={metric.title}
                      style={{
                        padding: '10px 12px 12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.05) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.55)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(148, 163, 184, 0.16)'}`,
                        boxShadow: isDarkMode
                          ? 'inset 0 1px 0 rgba(54, 144, 206, 0.06), 0 1px 3px rgba(0, 3, 25, 0.20)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.04)',
                        cursor: showDetailsFeature ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
                        borderRadius: '0',
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
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimeMetricDetails(metric); }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.14) 0%, rgba(54, 144, 206, 0.02) 60%), rgba(6, 23, 51, 0.55)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.75)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.22)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 6px 16px rgba(0, 3, 25, 0.35)'
                          : '0 4px 12px rgba(6, 23, 51, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.05) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(255, 255, 255, 0.55)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(148, 163, 184, 0.16)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? 'inset 0 1px 0 rgba(54, 144, 206, 0.06), 0 1px 3px rgba(0, 3, 25, 0.20)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.04)';
                      }}
                    >
                      {/* Label */}
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        color: isDarkMode ? 'rgba(243, 244, 246, 0.55)' : 'rgba(15, 23, 42, 0.50)',
                        marginBottom: '4px',
                        whiteSpace: 'nowrap' as const,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {getDisplayTitle(metric.title)}
                      </div>

                      {/* Value row */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <AnimatedValueWithEnabled
                          value={spec.value}
                          formatter={spec.formatter}
                          enabled={enableAnimationThisMount}
                          replayKey={replayKey}
                          className="tmv2-metric-value"
                          style={{
                            fontSize: '18px',
                            fontWeight: 700,
                            color: isDarkMode ? '#F9FAFB' : '#0f172a',
                            letterSpacing: '-0.03em',
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1.1,
                          }}
                        />
                        {/* Previous period delta */}
                        {prevValue > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '2px',
                            fontSize: '10px', fontWeight: 500,
                            color: trend !== 'neutral' ? trendColor : (isDarkMode ? colours.subtleGrey : colours.greyText),
                            opacity: 0.8,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums',
                          }}>
                            {trend !== 'neutral' && (
                              <FiTrendingUp size={9} style={{ transform: trend === 'down' ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                            )}
                            <span>
                              {isTimeMetric(metric) && metric.isMoneyOnly ? formatCurrency(prevValue)
                                : isTimeMetric(metric) && metric.isTimeMoney ? formatHours(prevValue)
                                : prevValue.toFixed(0)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>{/* Close Time section panel */}

          {/* Conversion section panel */}
          {enquiryMetrics && enquiryMetrics.length > 0 && (
            <div style={{
              background: isDarkMode ? 'rgba(6, 23, 51, 0.28)' : 'rgba(248, 250, 252, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.14)'}`,
              borderRadius: '0',
              padding: '0',
              marginTop: '4px',
            }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                padding: '8px 12px 4px 12px',
              }}>
                Conversion
              </div>
              <div style={{ padding: '0 12px 8px 12px' }}>
                <EnquiryMetricsV2 
                  metrics={enquiryMetrics} 
                  isDarkMode={isDarkMode} 
                  userEmail={userEmail}
                  userInitials={userInitials}
                  title={'Conversion Metrics'}
                  refreshAnimationKey={refreshAnimationKey}
                  isLoading={isLoadingEnquiryMetrics ?? isLoading}
                  breakdown={enquiryMetricsBreakdown}
                  embedded
                />
              </div>
            </div>
          )}
        </div>
      </div> {/* Close unified container */}

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