import React from 'react';
import { FiTrendingUp, FiTarget, FiUsers, FiCheckCircle } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import MetricDetailsModal, { MetricDetails } from './MetricDetailsModal';

interface EnquiryMetric {
  title: string;
  count?: number;
  prevCount?: number;
  percentage?: number;
  prevPercentage?: number;
  isPercentage?: boolean;
  showTrend?: boolean;
}

interface EnquiryMetricsV2Props {
  metrics: EnquiryMetric[];
  isDarkMode: boolean;
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
const SkeletonBox: React.FC<{ width: string; height: string; isDarkMode: boolean; style?: React.CSSProperties }> = 
  ({ width, height, isDarkMode, style }) => (
  <div style={{
    width,
    height,
    borderRadius: '4px',
    background: isDarkMode 
      ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.15) 50%, rgba(54, 144, 206, 0.08) 100%)'
      : 'linear-gradient(90deg, rgba(148, 163, 184, 0.15) 0%, rgba(148, 163, 184, 0.25) 50%, rgba(148, 163, 184, 0.15) 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    ...style,
  }} />
);

// Skeleton metric card for loading state
const SkeletonMetricCard: React.FC<{ isDarkMode: boolean; index: number; showProgress?: boolean }> = 
  ({ isDarkMode, index, showProgress = false }) => (
  <div
    style={{
      background: isDarkMode 
        ? 'linear-gradient(90deg, rgba(14, 22, 38, 0.98) 0%, rgba(24, 34, 52, 0.95) 100%)'
        : 'linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
      borderRadius: '2px',
      padding: '20px',
      border: isDarkMode 
        ? '1px solid rgba(54, 144, 206, 0.15)'
        : '1px solid rgba(148, 163, 184, 0.12)',
      boxShadow: isDarkMode
        ? '0 2px 8px rgba(0, 0, 0, 0.3)'
        : '0 1px 4px rgba(0, 0, 0, 0.06)',
      opacity: 1,
      animation: `fadeInToast 0.3s ease ${index * 50}ms both`,
    }}
  >
    {/* Header row: icon + trend */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <SkeletonBox width="36px" height="36px" isDarkMode={isDarkMode} style={{ borderRadius: '2px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <SkeletonBox width="12px" height="12px" isDarkMode={isDarkMode} />
        <SkeletonBox width="32px" height="12px" isDarkMode={isDarkMode} />
      </div>
    </div>
    {/* Title */}
    <SkeletonBox width="70%" height="14px" isDarkMode={isDarkMode} style={{ marginBottom: '10px' }} />
    {/* Value */}
    <SkeletonBox width="50%" height="28px" isDarkMode={isDarkMode} style={{ marginBottom: showProgress ? '14px' : '0' }} />
    {/* Progress bar if needed */}
    {showProgress && (
      <div style={{ marginTop: '14px' }}>
        <SkeletonBox width="100%" height="8px" isDarkMode={isDarkMode} style={{ borderRadius: '4px' }} />
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

const EnquiryMetricsV2: React.FC<EnquiryMetricsV2Props> = ({ metrics, isDarkMode, headerActions, title, refreshAnimationKey, isLoading, breakdown, showPreviousPeriod = false, viewAsProd = false }) => {
  // Show details feature only in local dev when NOT viewing as production
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const showDetailsFeature = isLocalhost && !viewAsProd;

  // Inject keyframes
  React.useEffect(() => {
    const styleId = 'enquiry-metrics-refresh-keyframes';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = metricRefreshKeyframes;
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

  const getDisplayTitle = React.useCallback((rawTitle: string): string => {
    if (!showPreviousPeriod) return rawTitle;

    if (rawTitle.includes('Today')) return rawTitle.replace('Today', 'Same Day Last Week');
    if (rawTitle.includes('This Week')) return rawTitle.replace('This Week', 'Last Week (to date)');
    if (rawTitle.includes('This Month')) return rawTitle.replace('This Month', 'Last Month (to date)');
    return rawTitle;
  }, [showPreviousPeriod]);

  const getTrendHelpText = React.useCallback((rawTitle: string): string => {
    const titleLower = (rawTitle || '').toLowerCase();
    if (titleLower.includes('today')) return 'Change vs same weekday last week.';
    if (titleLower.includes('this week')) return 'Change vs last week-to-date (same elapsed days).';
    if (titleLower.includes('this month')) return 'Change vs last month-to-date (same day-of-month / same elapsed days).';
    return 'Change vs the previous period.';
  }, []);

  const [metricDetails, setMetricDetails] = React.useState<MetricDetails | null>(null);
  const [isMetricDetailsOpen, setIsMetricDetailsOpen] = React.useState(false);

  type AowTopItem = { key: string; count: number };

  const getPeriodKey = React.useCallback((rawTitle: string): 'today' | 'weekToDate' | 'monthToDate' | null => {
    const titleLower = (rawTitle || '').toLowerCase();
    if (titleLower.includes('today')) return 'today';
    if (titleLower.includes('this week')) return 'weekToDate';
    if (titleLower.includes('this month')) return 'monthToDate';
    return null;
  }, []);

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

  const openMetricDetails = React.useCallback((metric: EnquiryMetric) => {
    // Only show details modal when feature is enabled
    if (!showDetailsFeature) return;

    const periodKey = getPeriodKey(metric.title);
    const aowTop = getAowTop(periodKey);

    const rows: MetricDetails['rows'] = [
      {
        label: 'Period',
        value: showPreviousPeriod ? getDisplayTitle(metric.title) : metric.title,
      },
      {
        label: 'Value Type',
        value: metric.isPercentage ? 'Percentage' : 'Count',
      },
      {
        label: 'Comparator',
        value: showPreviousPeriod ? 'Not shown in Previous view.' : getTrendHelpText(metric.title),
      },
      {
        label: 'Caching',
        value: 'Cached briefly to keep Home fast (stale fallback on transient errors).',
      },
    ];

    if (aowTop.length > 0) {
      rows.splice(3, 0, {
        label: 'Top Areas of Work',
        value: (
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
            {aowTop.map((x) => (
              <span
                key={x.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                  background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.7)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  lineHeight: 1.2,
                }}
              >
                <span style={{ opacity: 0.9 }}>{x.key}</span>
                <span style={{ opacity: 0.7, fontWeight: 700 }}>{x.count}</span>
              </span>
            ))}
          </div>
        ),
      });
    }

    setMetricDetails({
      title: getDisplayTitle(metric.title),
      subtitle: 'What this metric includes and how its comparison is defined.',
      rows,
    });
    setIsMetricDetailsOpen(true);
  }, [showDetailsFeature, getAowTop, getDisplayTitle, getPeriodKey, getTrendHelpText, isDarkMode, showPreviousPeriod]);

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

  // No click-to-inspect breakdown or sidepane modals.
  
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
    try { return sessionStorage.getItem('emv2_animated') !== 'true'; } catch { return true; }
  });
  React.useEffect(() => {
    if (enableAnimationThisMount) {
      setMounted(false);
      const t = setTimeout(() => {
        setMounted(true);
        try { sessionStorage.setItem('emv2_animated', 'true'); } catch {}
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
      try { return sessionStorage.getItem(storageKey) !== 'true'; } catch { return false; }
    });
    const doneRef = React.useRef(false);

    const handleDone = React.useCallback(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      try { sessionStorage.setItem(storageKey, 'true'); } catch {}
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
      default: return isDarkMode ? colours.accent : colours.light.subText;
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

  const formatValue = (metric: EnquiryMetric): string => {
    if (metric.isPercentage) {
      return `${(metric.percentage || 0).toFixed(1)}%`;
    }
    return (metric.count || 0).toLocaleString();
  };

  const formatTrendValue = (current: number, previous: number, isPercentage: boolean): string => {
    const diff = current - previous;
    const sign = diff > 0 ? '+' : '';
    if (isPercentage) {
      return `${sign}${diff.toFixed(1)}%`;
    }
    return `${sign}${diff}`;
  };

  return (
    <div style={{
      padding: '0 16px',
      margin: '0',
      position: 'relative',
      background: 'transparent',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Unified Enquiry Metrics Container */}
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
        marginBottom: '20px',
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
            ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.6) 0%, rgba(135, 243, 243, 0.4) 50%, rgba(54, 144, 206, 0.6) 100%)'
            : 'linear-gradient(90deg, rgba(54, 144, 206, 0.4) 0%, rgba(54, 144, 206, 0.6) 50%, rgba(54, 144, 206, 0.4) 100%)',
        }} />
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: isDarkMode 
            ? '1px solid rgba(54, 144, 206, 0.12)' 
            : '1px solid rgba(148, 163, 184, 0.12)',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              letterSpacing: '-0.025em',
            }}>
              {title || 'Enquiry & Conversion Metrics'}
            </h2>
            {/* Loading indicator badge */}
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
            {/* Toast notification */}
            {toast && <Toast message={toast.message} type={toast.type} visible={toast.visible} isDarkMode={isDarkMode} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {headerActions}
          </div>
        </div>
        
        {/* Metrics Content */}
        <div style={{
          padding: '0 16px 16px 16px',
        }}>
          {/* Skeleton loading state */}
          {isLoading && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginBottom: '16px',
            }}>
              <SkeletonMetricCard isDarkMode={isDarkMode} index={0} showProgress={false} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={1} showProgress={false} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={2} showProgress={false} />
            </div>
          )}
          {isLoading && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <SkeletonMetricCard isDarkMode={isDarkMode} index={3} showProgress={false} />
              <SkeletonMetricCard isDarkMode={isDarkMode} index={4} showProgress={true} />
            </div>
          )}
          
          {/* Data loaded state */}
          {!isLoading && (
          <>
          {/* First row - first 3 metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginBottom: metrics.length > 3 ? '16px' : '0',
          }}>
            {metrics.slice(0, 3).map((metric, index) => {
              const Icon = getIcon(metric);
              const currentValue = getCurrentValue(metric);
              const prevValue = getPrevValue(metric);
              const displayValue = showPreviousPeriod ? prevValue : currentValue;
              const displayPercentage = showPreviousPeriod ? (metric.prevPercentage || 0) : (metric.percentage || 0);
              const trend = getTrendDirection(currentValue, prevValue);
              const trendColor = getTrendColor(trend);
              const trendKey = `${metric.title}-${index}`;

              return (
                <div
                  key={`${metric.title}-${index}`}
                  style={{
                    background: isDarkMode 
                      ? 'linear-gradient(90deg, rgba(14, 22, 38, 0.98) 0%, rgba(24, 34, 52, 0.95) 100%)'
                      : 'linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
                    borderRadius: '2px',
                    padding: '20px',
                    border: isDarkMode 
                      ? '1px solid rgba(54, 144, 206, 0.2)'
                      : `1px solid rgba(148, 163, 184, 0.18)`,
                    boxShadow: isDarkMode
                      ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                      : '0 1px 4px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    position: 'relative',
                    animation: dataLanded 
                      ? `dataLanded 0.5s ease ${index * 0.06}s both`
                      : refreshPulse 
                        ? 'metricRefresh 0.4s ease' 
                        : undefined,
                    ...staggerStyle(index),
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMetricDetails(metric)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openMetricDetails(metric);
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode
                      ? 'rgba(54, 144, 206, 0.25)'
                      : 'rgba(0, 0, 0, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    const icon = e.currentTarget.querySelector('[data-metric-icon]') as HTMLElement;
                    if (icon) icon.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode
                      ? 'rgba(54, 144, 206, 0.12)'
                      : colours.light.border;
                    e.currentTarget.style.transform = 'translateY(0)';
                    const icon = e.currentTarget.querySelector('[data-metric-icon]') as HTMLElement;
                    if (icon) icon.style.transform = 'scale(1)';
                  }}
                >
                  {/* No breakdown cue / click-to-open */}
                  {/* Header with icon and trend */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}>
                    <div 
                      data-metric-icon
                      style={{
                      width: '36px',
                      height: '36px',
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
                      <Icon size={16} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {!showPreviousPeriod && trend !== 'neutral' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: trendColor,
                          fontSize: '12px',
                          fontWeight: 500,
                        }}>
                          <FiTrendingUp 
                            size={12} 
                            style={{ 
                              transform: trend === 'down' ? 'rotate(180deg)' : 'none' 
                            }} 
                          />
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTrendValue(currentValue, prevValue, metric.isPercentage || false)}</span>

                          <span
                            onMouseEnter={() => setHoveredTrendKey(trendKey)}
                            onMouseLeave={() => setHoveredTrendKey(prev => (prev === trendKey ? null : prev))}
                            style={{
                              position: 'relative',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginLeft: 6,
                              width: 16,
                              height: 16,
                              borderRadius: 999,
                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.32)' : 'rgba(54, 144, 206, 0.28)'}`,
                              color: isDarkMode ? colours.accent : colours.highlight,
                              fontSize: 10,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            i
                            <span
                              style={{
                                position: 'absolute',
                                top: 20,
                                right: 0,
                                minWidth: 220,
                                maxWidth: 280,
                                padding: '8px 10px',
                                borderRadius: 8,
                                background: isDarkMode ? 'rgba(10, 16, 28, 0.96)' : 'rgba(255, 255, 255, 0.96)',
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                                boxShadow: isDarkMode ? '0 10px 24px rgba(0,0,0,0.45)' : '0 10px 22px rgba(0,0,0,0.12)',
                                color: isDarkMode ? colours.dark.text : colours.light.text,
                                fontSize: 12,
                                fontWeight: 500,
                                lineHeight: 1.35,
                                opacity: hoveredTrendKey === trendKey ? 1 : 0,
                                transform: hoveredTrendKey === trendKey ? 'translateY(0)' : 'translateY(-4px)',
                                transition: 'opacity 140ms ease, transform 140ms ease',
                                pointerEvents: 'none',
                                zIndex: 5,
                                whiteSpace: 'normal',
                              }}
                            >
                              {getTrendHelpText(metric.title)}
                            </span>
                          </span>
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

                  {/* Main value */}
                  <div style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: isDarkMode ? '#F9FAFB' : '#0f172a',
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                    marginBottom: '8px',
                    textShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                  }}>
                    <AnimatedMetricValue
                      storageKey={`emv2_metric_${metric.title}`}
                      value={displayValue}
                      decimals={metric.isPercentage ? 1 : 0}
                      suffix={metric.isPercentage ? '%' : ''}
                      enabled={enableAnimationThisMount && !showPreviousPeriod}
                    />
                  </div>

                  {/* Progress indicator for percentages */}
                  {metric.isPercentage && (
                    <div style={{
                      marginTop: '14px',
                    }}>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.15)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        boxShadow: isDarkMode ? 'inset 0 1px 2px rgba(0,0,0,0.2)' : 'inset 0 1px 2px rgba(0,0,0,0.05)',
                      }}>
                        <div style={{
                          width: `${Math.min(displayPercentage, 100)}%`,
                          height: '100%',
                          background: displayPercentage >= 80 
                            ? `linear-gradient(90deg, ${colours.green} 0%, #34d399 100%)`
                            : isDarkMode
                            ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                            : `linear-gradient(90deg, ${colours.highlight} 0%, #60a5fa 100%)`,
                          borderRadius: '4px',
                          transition: enableAnimationThisMount ? 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                          boxShadow: isDarkMode ? '0 0 8px rgba(54, 144, 206, 0.4)' : '0 0 6px rgba(54, 144, 206, 0.3)',
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Second row - remaining metrics if any */}
          {metrics.length > 3 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              {metrics.slice(3).map((metric, index) => {
                const Icon = getIcon(metric);
                const currentValue = getCurrentValue(metric);
                const prevValue = getPrevValue(metric);
                const displayValue = showPreviousPeriod ? prevValue : currentValue;
                const displayPercentage = showPreviousPeriod ? (metric.prevPercentage || 0) : (metric.percentage || 0);
                const trend = getTrendDirection(currentValue, prevValue);
                const trendColor = getTrendColor(trend);
                const trendKey = `${metric.title}-${index + 3}`;

                return (
                  <div
                    key={`${metric.title}-${index + 3}`}
                    style={{
                      background: isDarkMode 
                        ? 'rgba(15, 23, 42, 0.6)'
                        : colours.light.cardBackground,
                      borderRadius: '2px',
                      padding: '20px',
                      border: isDarkMode 
                        ? '1px solid rgba(54, 144, 206, 0.12)'
                        : `1px solid ${colours.light.border}`,
                      boxShadow: isDarkMode
                        ? '0 1px 2px rgba(0, 0, 0, 0.2)'
                        : '0 1px 3px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.12s ease',
                      cursor: 'pointer',
                      animation: dataLanded 
                        ? `dataLanded 0.5s ease ${(index + 3) * 0.06}s both`
                        : refreshPulse 
                          ? 'metricRefresh 0.4s ease' 
                          : undefined,
                      ...staggerStyle(index + 3),
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => openMetricDetails(metric)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMetricDetails(metric);
                      }
                    }}
                  >
                    {/* Header with icon and trend */}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!showPreviousPeriod && trend !== 'neutral' && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            color: trendColor,
                            fontWeight: 600,
                          }}>
                            {trend === 'up' && '↗'}
                            {trend === 'down' && '↘'}
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTrendValue(currentValue, prevValue, metric.isPercentage || false)}</span>

                            <span
                              onMouseEnter={() => setHoveredTrendKey(trendKey)}
                              onMouseLeave={() => setHoveredTrendKey(prev => (prev === trendKey ? null : prev))}
                              style={{
                                position: 'relative',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginLeft: 6,
                                width: 16,
                                height: 16,
                                borderRadius: 999,
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.32)' : 'rgba(54, 144, 206, 0.28)'}`,
                                color: isDarkMode ? colours.accent : colours.highlight,
                                fontSize: 10,
                                fontWeight: 700,
                                lineHeight: 1,
                              }}
                            >
                              i
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 20,
                                  right: 0,
                                  minWidth: 220,
                                  maxWidth: 280,
                                  padding: '8px 10px',
                                  borderRadius: 8,
                                  background: isDarkMode ? 'rgba(10, 16, 28, 0.96)' : 'rgba(255, 255, 255, 0.96)',
                                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                                  boxShadow: isDarkMode ? '0 10px 24px rgba(0,0,0,0.45)' : '0 10px 22px rgba(0,0,0,0.12)',
                                  color: isDarkMode ? colours.dark.text : colours.light.text,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  lineHeight: 1.35,
                                  opacity: hoveredTrendKey === trendKey ? 1 : 0,
                                  transform: hoveredTrendKey === trendKey ? 'translateY(0)' : 'translateY(-4px)',
                                  transition: 'opacity 140ms ease, transform 140ms ease',
                                  pointerEvents: 'none',
                                  zIndex: 5,
                                  whiteSpace: 'normal',
                                }}
                              >
                                {getTrendHelpText(metric.title)}
                              </span>
                            </span>
                          </div>
                        )}
                        <span style={detailsChipStyle}>Details</span>
                      </div>

                    </div>

                    {/* Main value */}
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontVariantNumeric: 'tabular-nums',
                      marginBottom: '8px',
                    }}>
                      <AnimatedMetricValue
                        storageKey={`emv2_metric_${metric.title}`}
                        value={displayValue}
                        decimals={metric.isPercentage ? 1 : 0}
                        suffix={metric.isPercentage ? '%' : ''}
                        enabled={enableAnimationThisMount && !showPreviousPeriod}
                      />
                    </div>

                    {/* Progress indicator for percentages */}
                    {metric.isPercentage && (
                      <div style={{
                        marginTop: '12px',
                      }}>
                        <div style={{
                          width: '100%',
                          height: '6px',
                          background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                          borderTopLeftRadius: '6px',
                          borderBottomRightRadius: '6px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${Math.min(displayPercentage, 100)}%`,
                            height: '100%',
                            background: displayPercentage >= 80 
                              ? `linear-gradient(90deg, ${colours.green} 0%, rgba(32, 178, 108, 0.8) 100%)`
                              : isDarkMode
                              ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                              : colours.highlight,
                            borderTopLeftRadius: '6px',
                            borderBottomRightRadius: '6px',
                            transition: enableAnimationThisMount ? 'width 0.3s ease' : 'none',
                          }} />
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