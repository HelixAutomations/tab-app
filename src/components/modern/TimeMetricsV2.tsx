import React from 'react';
import { FiClock, FiTrendingUp, FiTarget } from 'react-icons/fi';
import { FaMoneyBillWave } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import clioIcon from '../../assets/clio.svg';
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
  @media (max-width: 420px) {
    .tmv2-metric-card {
      padding: 10px !important;
    }
    .tmv2-metric-value {
      font-size: 20px !important;
    }
    .tmv2-header {
      padding: 8px 10px !important;
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
  elapsedPrevCount?: number;
  secondary?: number;
  pitchedCount?: number;
  prevPitchedCount?: number;
}

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
  onOpenOutstandingBreakdown?: () => void;
  hasOutstandingBreakdown?: boolean;
  isOutstandingLoading?: boolean;
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

const TimeMetricsV2: React.FC<TimeMetricsV2Props> = ({ metrics, enquiryMetrics, enquiryMetricsBreakdown, isDarkMode, userEmail, userInitials, onRefresh, isRefreshing, isLoading, isLoadingEnquiryMetrics, viewAsProd = false, onOpenOutstandingBreakdown, hasOutstandingBreakdown = false, isOutstandingLoading = false }) => {
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
  // Previous period basis for progress calculations remains unchanged
  const showPreviousPeriod = false;
  // Dashboard tool: show/hide previous-period comparison rows (default hidden)
  const [showPreviousComparisons, setShowPreviousComparisons] = React.useState(false);
  const [metricDetails, setMetricDetails] = React.useState<MetricDetails | null>(null);
  const [isMetricDetailsOpen, setIsMetricDetailsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  
  // Show details feature only in local dev when NOT viewing as production
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const showDetailsFeature = isLocalhost && !viewAsProd;

  const sectionRailStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 244, 246, 0.96) 100%)',
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.08)' : `1px solid ${colours.highlightNeutral}`,
    padding: '3px',
  }), [isDarkMode]);

  const getAnimatedBlockStyle = React.useCallback((visible: boolean): React.CSSProperties => ({
    maxHeight: visible ? '120px' : '0px',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(-4px)',
    overflow: 'hidden',
    transition: 'max-height 240ms ease, opacity 220ms ease, transform 220ms ease',
    willChange: 'max-height, opacity, transform',
  }), []);

  const getAnimatedInlineStyle = React.useCallback((visible: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '10px',
    fontWeight: 500,
    opacity: visible ? 0.8 : 0,
    maxWidth: visible ? '120px' : '0px',
    transform: visible ? 'translateY(0)' : 'translateY(-2px)',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    fontVariantNumeric: 'tabular-nums',
    transition: 'max-width 220ms ease, opacity 180ms ease, transform 180ms ease',
    willChange: 'max-width, opacity, transform',
  }), []);

  const metricBlockStyle = React.useMemo<React.CSSProperties>(() => ({
    background: isDarkMode ? 'rgba(0, 3, 25, 0.28)' : colours.grey,
    border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.06)' : `1px solid ${colours.highlightBlue}`,
    borderLeft: 'none',
    borderRadius: '0',
    padding: '8px',
    boxShadow: 'none',
  }), [isDarkMode]);

  const sectionHeaderStyle = React.useMemo<React.CSSProperties>(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.6px',
    textTransform: 'uppercase' as const,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'var(--text-muted)',
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
  const [syncProgress, setSyncProgress] = React.useState(0);
  const syncProgressIntervalRef = React.useRef<number | null>(null);
  const syncProgressResetRef = React.useRef<number | null>(null);
  
  // Animation key to trigger refresh animation on metric values
  const [refreshAnimationKey, setRefreshAnimationKey] = React.useState(0);
  const [comparisonMode, setComparisonMode] = React.useState<'percent' | 'value'>('percent');
  const [enquiryComparisonModeByTitle, setEnquiryComparisonModeByTitle] = React.useState<Record<string, 'previous' | 'elapsed'>>({});

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
      if (syncProgressIntervalRef.current) window.clearInterval(syncProgressIntervalRef.current);
      if (syncProgressResetRef.current) window.clearTimeout(syncProgressResetRef.current);
    };
  }, []);

  const isSyncing = Boolean(isLoading || isRefreshing);

  React.useEffect(() => {
    if (isSyncing) {
      if (syncProgressResetRef.current) {
        window.clearTimeout(syncProgressResetRef.current);
        syncProgressResetRef.current = null;
      }
      setSyncProgress(prev => (prev > 6 ? prev : 8));
      if (!syncProgressIntervalRef.current) {
        syncProgressIntervalRef.current = window.setInterval(() => {
          setSyncProgress(prev => {
            if (prev >= 92) return prev;
            const increment = prev < 35 ? 7 : prev < 70 ? 3 : 1.5;
            return Math.min(92, prev + increment);
          });
        }, 260);
      }
      return;
    }

    if (syncProgressIntervalRef.current) {
      window.clearInterval(syncProgressIntervalRef.current);
      syncProgressIntervalRef.current = null;
    }

    setSyncProgress(prev => (prev > 0 ? 100 : 0));
    syncProgressResetRef.current = window.setTimeout(() => {
      setSyncProgress(0);
    }, 900);
  }, [isSyncing]);


  
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

  const headerChipShellStyle: React.CSSProperties = React.useMemo(() => ({
    borderRadius: '10px',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(0, 0, 0, 0.08)'}`,
    background: isDarkMode ? 'rgba(2, 6, 23, 0.30)' : colours.grey,
    minHeight: '24px',
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

  const isOutstandingMetric = React.useCallback((metric: TimeMetric | EnquiryMetric) => {
    return (metric.title || '').toLowerCase().includes('outstanding office balances');
  }, []);

  const handleMetricActivate = React.useCallback((metric: TimeMetric | EnquiryMetric) => {
    if (isTimeMetric(metric) && isOutstandingMetric(metric) && hasOutstandingBreakdown && onOpenOutstandingBreakdown) {
      onOpenOutstandingBreakdown();
      return;
    }
    openTimeMetricDetails(metric);
  }, [hasOutstandingBreakdown, onOpenOutstandingBreakdown, openTimeMetricDetails, isOutstandingMetric]);

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

  const getTimeCardComparisonRows = (metric: TimeMetric) => {
    if (!metric.isTimeMoney && !metric.isMoneyOnly) return null;

    const titleLower = (metric.title || '').toLowerCase();
    const isTodayCard = titleLower.includes('today');
    const isWeekCard = titleLower.includes('this week');
    const isMonthCard = titleLower.includes('this month');
    const currentPeriodLabel = isTodayCard
      ? 'Today'
      : isWeekCard
        ? 'This Week'
        : isMonthCard
          ? 'This Month'
          : 'Current';
    const previousPeriodLabel = isTodayCard
      ? 'Yesterday'
      : isWeekCard
        ? 'Last Week'
        : isMonthCard
          ? 'Last Month'
          : 'Previous';

    const currentHours = metric.hours || 0;
    const previousHours = metric.prevHours || 0;
    const currentMoney = metric.money || 0;
    const previousMoney = metric.prevMoney || 0;
    const hoursDelta = currentHours - previousHours;
    const moneyDelta = currentMoney - previousMoney;

    const formatSignedHours = (value: number) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}h`;
    const formatSignedMoney = (value: number) => `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(Math.round(value)))}`;
    const formatSignedPercent = (value: number | null) => {
      if (value === null || !Number.isFinite(value)) return '—';
      return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`;
    };

    const hoursPercent = previousHours > 0 ? (hoursDelta / previousHours) * 100 : null;
    const moneyPercent = previousMoney > 0 ? (moneyDelta / previousMoney) * 100 : null;

    const comparisonLabel = metric.isTimeMoney
      ? (comparisonMode === 'percent'
        ? `${formatSignedPercent(hoursPercent)} · ${formatSignedPercent(moneyPercent)}`
        : `${formatSignedHours(hoursDelta)} · ${formatSignedMoney(moneyDelta)}`)
      : (comparisonMode === 'percent'
        ? formatSignedPercent(moneyPercent)
        : formatSignedMoney(moneyDelta));

    const currentLabel = metric.isTimeMoney
      ? `${formatHours(metric.hours || 0)} · ${formatCurrency(metric.money || 0)}`
      : `${formatCurrency(metric.money || 0)}`;
    const previousLabel = metric.isTimeMoney
      ? `${formatHours(metric.prevHours || 0)} · ${formatCurrency(metric.prevMoney || 0)}`
      : `${formatCurrency(metric.prevMoney || 0)}`;

    return (
      <div style={{ marginTop: '7px', display: 'grid', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '1px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setComparisonMode(prev => prev === 'percent' ? 'value' : 'percent');
            }}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              border: 'none',
              background: 'transparent',
              color: isDarkMode ? 'rgba(135, 243, 243, 0.72)' : 'rgba(54, 144, 206, 0.82)',
              fontSize: '10px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              cursor: 'pointer',
              lineHeight: 1.2,
              padding: 0,
              opacity: 0.9,
              borderBottom: `1px dotted ${isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.45)'}`,
            }}
            aria-label="Toggle comparison mode"
            title={`Comparison (${comparisonMode === 'percent' ? '%' : 'value'}) — click to toggle`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
              <span>{comparisonLabel}</span>
              <span style={{ fontSize: '8px', fontWeight: 600, opacity: 0.5, letterSpacing: '0.1px' }} aria-hidden="true">
                ⇄
              </span>
            </span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            {currentPeriodLabel}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(15, 23, 42, 0.82)', fontVariantNumeric: 'tabular-nums' }}>
            {currentLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            {previousPeriodLabel}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.66)' : 'rgba(15, 23, 42, 0.74)', fontVariantNumeric: 'tabular-nums' }}>
            {previousLabel}
          </span>
        </div>
      </div>
    );
  };

  const getOutstandingComparisonRows = (metric: TimeMetric) => {
    const currentLabel = formatCurrency(Math.round(metric.money || 0));
    const firmLabel = formatCurrency(Math.round(metric.secondary || 0));

    return (
      <div style={{ marginTop: '7px', display: 'grid', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '1px' }}>
          <span
            aria-hidden="true"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              lineHeight: 1.2,
              visibility: 'hidden',
            }}
          >
            comparison
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            Current
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(15, 23, 42, 0.82)', fontVariantNumeric: 'tabular-nums' }}>
            {currentLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            Firm
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.66)' : 'rgba(15, 23, 42, 0.74)', fontVariantNumeric: 'tabular-nums' }}>
            {firmLabel}
          </span>
        </div>
      </div>
    );
  };

  const isEnquiryPeriodMetric = (metric: TimeMetric | EnquiryMetric) => {
    const title = (metric.title || '').toLowerCase();
    return title === 'enquiries today' || title === 'enquiries this week' || title === 'enquiries this month';
  };

  const getEnquiryComparisonRows = (metric: TimeMetric) => {
    const titleLower = (metric.title || '').toLowerCase();
    const titleKey = metric.title || '';
    const isTodayCard = titleLower === 'enquiries today';
    const isWeekCard = titleLower === 'enquiries this week';
    const isMonthCard = titleLower === 'enquiries this month';
    const canToggleElapsed = !isTodayCard && typeof metric.elapsedPrevCount === 'number';
    const mode = enquiryComparisonModeByTitle[titleKey] || 'previous';
    const previousValue = (canToggleElapsed && mode === 'elapsed')
      ? Math.round(metric.elapsedPrevCount || 0)
      : Math.round(metric.prevCount || 0);
    const currentLabel = isTodayCard ? 'Today' : isWeekCard ? 'This Week' : isMonthCard ? 'This Month' : 'Current';
    const previousLabel = isTodayCard
      ? 'Yesterday'
      : isWeekCard
        ? (canToggleElapsed && mode === 'elapsed' ? 'Last Week (to date)' : 'Last Week')
        : isMonthCard
          ? (canToggleElapsed && mode === 'elapsed' ? 'Last Month (to date)' : 'Last Month')
          : 'Previous';
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
            {Math.round(metric.count || 0)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.18px', color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)' }}>
            {previousLabel}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(255, 255, 255, 0.66)' : 'rgba(15, 23, 42, 0.74)', fontVariantNumeric: 'tabular-nums' }}>
            {previousValue}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      padding: '0',
      margin: '0',
      position: 'relative',
      background: 'transparent',
    }}>
      {/* Dashboard content — no container box */}
      <div style={{
        background: 'transparent',
        borderRadius: '0',
        border: 'none',
        boxShadow: 'none',
        marginBottom: '0',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* ─── Dashboard data rows ─── */}
        <div style={{ padding: '0 0 10px 0' }}>

          {/* Time section panel */}
          <div style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '0',
            padding: '0',
            marginTop: '0',
          }}>
            {/* Time heading with inline refresh/status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px 4px 12px',
            }}>
              <div style={sectionHeaderStyle}>
                <FiClock style={{ fontSize: 11, color: 'var(--text-accent)', strokeWidth: 2.2 }} />
                <span>Time</span>
                {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowPreviousComparisons(prev => !prev)}
                  style={{
                    ...headerChipShellStyle,
                    borderRadius: '10px',
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    opacity: 0.82,
                    color: isDarkMode ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.64)',
                  }}
                  title={showPreviousComparisons ? 'Hide previous-period comparisons' : 'Show previous-period comparisons'}
                  aria-label={showPreviousComparisons ? 'Hide previous-period comparisons' : 'Show previous-period comparisons'}
                >
                  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.08px' }}>
                    Previous {showPreviousComparisons ? 'On' : 'Off'}
                  </span>
                </button>
                {/* Status badge: Syncing with progress → Updated */}
                {(isSyncing || showHeaderUpdatedBadge) && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: isSyncing ? '126px' : '104px',
                    padding: '3px 8px',
                    ...headerChipShellStyle,
                    transition: 'border-color 180ms ease, background 180ms ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', justifyContent: 'space-between' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        {isSyncing ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? colours.subtleGrey : colours.highlight} strokeWidth="2" style={{ animation: 'spinReverse 1s linear infinite' }}>
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                          </svg>
                        ) : (
                          <span style={{
                            width: '13px',
                            height: '13px',
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isDarkMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.16)',
                            border: `1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.30)'}`,
                          }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          letterSpacing: '0.08px',
                          color: isSyncing ? (isDarkMode ? colours.subtleGrey : colours.highlight) : colours.green,
                          transition: 'color 180ms ease',
                        }}>
                          {isSyncing ? 'Syncing with Clio' : 'Sync complete'}
                        </span>
                      </span>
                      {isSyncing && (
                        <span style={{
                          fontSize: '8px',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                          color: isDarkMode ? 'rgba(255,255,255,0.46)' : 'rgba(15, 23, 42, 0.52)',
                          minWidth: '24px',
                          textAlign: 'right',
                        }}>
                          {Math.round(syncProgress)}%
                        </span>
                      )}
                    </div>
                    {isSyncing && (
                      <div style={{
                        width: '100%',
                        height: '2px',
                        background: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                        borderRadius: 0,
                        overflow: 'hidden',
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                      }}>
                        <div style={{
                          width: `${Math.max(6, Math.min(syncProgress, 100))}%`,
                          height: '100%',
                          background: isDarkMode
                            ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.55) 0%, rgba(135, 243, 243, 0.78) 100%)'
                            : colours.highlightBlue,
                          transition: 'width 240ms ease-out',
                        }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Refresh button + countdown badges */}
                {onRefresh && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <button
                    onClick={handleRefresh}
                    disabled={isSyncing}
                    style={{
                      ...headerChipShellStyle,
                      cursor: isSyncing ? 'default' : 'pointer',
                      padding: '3px 7px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      borderRadius: '10px',
                      opacity: isSyncing ? 0.6 : 0.75,
                      transition: 'opacity 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!isSyncing) e.currentTarget.style.opacity = '0.95'; }}
                    onMouseLeave={(e) => { if (!isSyncing) e.currentTarget.style.opacity = '0.75'; }}
                    aria-label="Refresh time metrics"
                    title={`Refresh time metrics (auto-refresh in ${formatCountdown(countdown)})`}
                  >
                    <img
                      src={clioIcon}
                      alt="Clio"
                      style={{
                        width: '11px',
                        height: '11px',
                        objectFit: 'contain',
                        opacity: isDarkMode ? 0.9 : 0.82,
                      }}
                    />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? colours.dark.text : colours.light.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      letterSpacing: '0.08px',
                      color: isDarkMode ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.64)',
                    }}>
                      Refresh
                    </span>
                  </button>
                  <span style={{
                    fontSize: '9px',
                    fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                    color: isDarkMode ? 'rgba(255,255,255,0.44)' : 'rgba(15,23,42,0.44)',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    minWidth: '44px',
                    height: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '0 6px',
                    lineHeight: 1,
                    ...headerChipShellStyle,
                  }} title={`Auto-refresh in ${formatCountdown(countdown)}`}>
                    {formatCountdown(countdown)}
                  </span>
                </div>
                )}
              </div>
            </div>

          {/* Time metric tiles — 3:2 dashboard grid */}
          {isLoading ? (
            <div style={{ padding: '0 12px 10px 12px' }}>
              {/* Skeleton row 1: 3 across */}
              <div style={sectionRailStyle}>
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    padding: '12px 12px',
                    borderRight: i < 2 ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'transparent'}` : 'none',
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
              <div style={{ height: '4px' }} />
              {/* Skeleton row 2: 2 across */}
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                {[0,1].map(i => (
                  <div key={i} style={{
                    padding: '12px 12px',
                    borderRight: i < 1 ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'transparent'}` : 'none',
                  }}>
                    <SkeletonBox width="90px" height="9px" isDarkMode={isDarkMode} animate={false} />
                    <div style={{ marginTop: '6px' }}>
                      <SkeletonBox width="65px" height="18px" isDarkMode={isDarkMode} />
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 12px 10px 12px' }}>
              <div style={sectionRailStyle}>
              {/* Row 1: first 3 metrics */}
              <div className="metricsGridThree" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {currentMetrics.slice(0, 3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const prevValue = getPrevValue(metric);
                  const progress = isTimeMetric(metric) ? calculateProgress(metric as TimeMetric, showPreviousPeriod) : 0;
                  const trend = getTrendDirection(currentValue, prevValue);
                  const trendColor = getTrendColor(trend);
                  const hasProgress = isTimeMetric(metric) && metric.showDial && metric.dialTarget;
                  const progressIndicatorColor = progress >= 100 ? colours.green : colours.accent;
                  const lightModeBorderColor = hasProgress ? `${progressIndicatorColor}66` : colours.highlightBlue;
                  const isOutstandingCard = isTimeMetric(metric) && isOutstandingMetric(metric);
                  const supportsDetailedComparisonRows = isTimeMetric(metric) && Boolean(metric.isTimeMoney || metric.isMoneyOnly) && !isOutstandingCard;
                  const showDetailedComparisonRows = showPreviousComparisons && supportsDetailedComparisonRows;
                  const spec = getDisplaySpec(metric as TimeMetric, false);
                  const showOutstandingLoadingCue = isOutstandingCard && isOutstandingLoading;

                  return (
                    <div
                      className="tmv2-metric-card"
                      key={metric.title}
                      style={{
                        padding: '12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey,
                        border: isDarkMode ? metricBlockStyle.border : `1px solid ${lightModeBorderColor}`,
                        borderLeft: isDarkMode ? metricBlockStyle.borderLeft : `1px solid ${lightModeBorderColor}`,
                        borderRight: isDarkMode
                          ? (index < 2 ? '1px solid rgba(54, 144, 206, 0.06)' : 'none')
                          : `1px solid ${lightModeBorderColor}`,
                        boxShadow: 'none',
                        cursor: (showDetailsFeature || (isTimeMetric(metric) && isOutstandingMetric(metric) && hasOutstandingBreakdown)) ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease',
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
                      onClick={() => handleMetricActivate(metric)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMetricActivate(metric); }
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
                        {isOutstandingCard && hasOutstandingBreakdown && (
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
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        {showOutstandingLoadingCue ? (
                          <>
                            <SkeletonBox width="86px" height="18px" isDarkMode={isDarkMode} />
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              color: isDarkMode ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.42)',
                              letterSpacing: '0.08px',
                            }}>
                              Loading balances…
                            </span>
                          </>
                        ) : (
                          <AnimatedValueWithEnabled
                            value={spec.value}
                            formatter={spec.formatter}
                            enabled={enableAnimationThisMount}
                            replayKey={replayKey}
                            className="tmv2-metric-value"
                            style={{
                              fontSize: '20px',
                              fontWeight: 700,
                              color: isDarkMode ? '#ffffff' : '#0f172a',
                              letterSpacing: '-0.03em',
                              fontVariantNumeric: 'tabular-nums',
                              lineHeight: 1.1,
                            }}
                          />
                        )}
                        {/* Money sub-value */}
                        {!showOutstandingLoadingCue && isTimeMetric(metric) && metric.isTimeMoney && ((metric.money ?? 0) > 0) && (
                          <AnimatedValueWithEnabled
                            value={metric.money || 0}
                            formatter={(n) => formatCurrency(Math.round(n))}
                            enabled={enableAnimationThisMount}
                            replayKey={replayKey}
                            style={{
                              fontSize: '18px',
                              fontWeight: 600,
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.72)' : 'rgba(15, 23, 42, 0.70)',
                              letterSpacing: '-0.02em',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        )}
                        {/* Previous period delta */}
                        {!showOutstandingLoadingCue && (prevValue > 0 || metric.title === 'Time Today') && !showDetailedComparisonRows && (
                          <span style={{
                            ...getAnimatedInlineStyle(showPreviousComparisons),
                            color: trend !== 'neutral' ? trendColor : (isDarkMode ? colours.subtleGrey : colours.greyText),
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

                      {isOutstandingCard && !showOutstandingLoadingCue && typeof metric.secondary === 'number' && getOutstandingComparisonRows(metric)}

                      {supportsDetailedComparisonRows && (
                        <div style={getAnimatedBlockStyle(showDetailedComparisonRows)}>
                          {getTimeCardComparisonRows(metric)}
                        </div>
                      )}

                      {/* Progress bar */}
                      {hasProgress && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            flex: 1, height: '3px',
                            background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.1)',
                            borderRadius: '2px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(progress, 100)}%`, height: '100%',
                              background: progress >= 100 ? 'var(--helix-green)' : 'var(--text-accent)',
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
              <div className="metricsGridTwo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginTop: '4px', borderTop: 'none' }}>
                {currentMetrics.slice(3).map((metric, index) => {
                  const currentValue = getCurrentValue(metric);
                  const prevValue = getPrevValue(metric);
                  const progress = isTimeMetric(metric) ? calculateProgress(metric as TimeMetric, showPreviousPeriod) : 0;
                  const trend = getTrendDirection(currentValue, prevValue);
                  const trendColor = getTrendColor(trend);
                  const hasProgress = isTimeMetric(metric) && metric.showDial && metric.dialTarget;
                  const progressIndicatorColor = progress >= 100 ? colours.green : colours.accent;
                  const lightModeBorderColor = hasProgress ? `${progressIndicatorColor}66` : colours.highlightBlue;
                  const isOutstandingCard = isTimeMetric(metric) && isOutstandingMetric(metric);
                  const isEnquiryPeriodCard = isTimeMetric(metric) && isEnquiryPeriodMetric(metric);
                  const supportsDetailedComparisonRows = isTimeMetric(metric) && Boolean(metric.isTimeMoney || metric.isMoneyOnly) && !isOutstandingCard && !isEnquiryPeriodCard;
                  const showDetailedComparisonRows = showPreviousComparisons && supportsDetailedComparisonRows;
                  const spec = getDisplaySpec(metric as TimeMetric, false);
                  const showOutstandingLoadingCue = isOutstandingCard && isOutstandingLoading;

                  return (
                    <div
                      className="tmv2-metric-card"
                      key={metric.title}
                      style={{
                        padding: '12px 12px',
                        background: isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.00) 60%), rgba(6, 23, 51, 0.45)'
                          : colours.grey,
                        border: isDarkMode ? metricBlockStyle.border : `1px solid ${lightModeBorderColor}`,
                        borderLeft: isDarkMode ? metricBlockStyle.borderLeft : `1px solid ${lightModeBorderColor}`,
                        borderRight: isDarkMode
                          ? (index < 1 ? '1px solid rgba(54, 144, 206, 0.06)' : 'none')
                          : `1px solid ${lightModeBorderColor}`,
                        boxShadow: 'none',
                        cursor: (showDetailsFeature || (isTimeMetric(metric) && isOutstandingMetric(metric) && hasOutstandingBreakdown)) ? 'pointer' : 'default',
                        transition: 'background 180ms ease, border-color 180ms ease',
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
                      onClick={() => handleMetricActivate(metric)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMetricActivate(metric); }
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
                        {isOutstandingCard && hasOutstandingBreakdown && (
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
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        {showOutstandingLoadingCue ? (
                          <>
                            <SkeletonBox width="86px" height="18px" isDarkMode={isDarkMode} />
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              color: isDarkMode ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.42)',
                              letterSpacing: '0.08px',
                            }}>
                              Loading balances…
                            </span>
                          </>
                        ) : (
                          <AnimatedValueWithEnabled
                            value={spec.value}
                            formatter={spec.formatter}
                            enabled={enableAnimationThisMount}
                            replayKey={replayKey}
                            className="tmv2-metric-value"
                            style={{
                              fontSize: '20px',
                              fontWeight: 700,
                              color: isDarkMode ? '#ffffff' : '#0f172a',
                              letterSpacing: '-0.03em',
                              fontVariantNumeric: 'tabular-nums',
                              lineHeight: 1.1,
                            }}
                          />
                        )}
                        {/* Previous period delta */}
                        {!showOutstandingLoadingCue && prevValue > 0 && !showDetailedComparisonRows && !isEnquiryPeriodCard && (
                          <span style={{
                            ...getAnimatedInlineStyle(showPreviousComparisons),
                            color: trend !== 'neutral' ? trendColor : (isDarkMode ? colours.subtleGrey : colours.greyText),
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

                      {isOutstandingCard && !showOutstandingLoadingCue && typeof metric.secondary === 'number' && getOutstandingComparisonRows(metric)}

                      {supportsDetailedComparisonRows && (
                        <div style={getAnimatedBlockStyle(showDetailedComparisonRows)}>
                          {getTimeCardComparisonRows(metric)}
                        </div>
                      )}

                      {isEnquiryPeriodCard && (
                        <div style={getAnimatedBlockStyle(showPreviousComparisons)}>
                          {getEnquiryComparisonRows(metric)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}
          </div>{/* Close Time section panel */}

          {/* Conversion section panel */}
          {enquiryMetrics && enquiryMetrics.length > 0 && (
            <div style={{
              background: isDarkMode ? 'transparent' : 'rgba(248, 250, 252, 0.7)',
              border: 'none',
              borderRadius: '0',
              padding: '0',
              marginTop: '4px',
            }}>
              <div style={{
                ...sectionHeaderStyle,
                padding: '8px 12px 4px 12px',
              }}>
                <FiTarget style={{ fontSize: 11, color: 'var(--text-accent)', strokeWidth: 2.2 }} />
                Conversion
              </div>
              <div style={{ padding: '0 0 8px 0' }}>
                <EnquiryMetricsV2 
                  metrics={enquiryMetrics} 
                  isDarkMode={isDarkMode} 
                  userEmail={userEmail}
                  userInitials={userInitials}
                  title={'Conversion Metrics'}
                  refreshAnimationKey={refreshAnimationKey}
                  isLoading={isLoadingEnquiryMetrics ?? isLoading}
                  breakdown={enquiryMetricsBreakdown}
                  showPreviousPeriod={showPreviousComparisons}
                  embedded
                />
              </div>
            </div>
          )}
        </div>
      </div> {/* Close dashboard wrapper */}

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