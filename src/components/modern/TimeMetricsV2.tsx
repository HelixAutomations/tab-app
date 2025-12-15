import React from 'react';
import { FiClock, FiTrendingUp, FiTarget } from 'react-icons/fi';
import { FaMoneyBillWave } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import EnquiryMetricsV2 from './EnquiryMetricsV2';

// Inject keyframes for spin animation
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
}

interface TimeMetricsV2Props {
  metrics: TimeMetric[];
  enquiryMetrics?: EnquiryMetric[];
  isDarkMode: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

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

const TimeMetricsV2: React.FC<TimeMetricsV2Props> = ({ metrics, enquiryMetrics, isDarkMode, onRefresh, isRefreshing }) => {
  const [showEnquiryMetrics, setShowEnquiryMetrics] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  
  // Auto-refresh countdown state
  const [countdown, setCountdown] = React.useState(AUTO_REFRESH_INTERVAL);
  const [toast, setToast] = React.useState<{ message: string; type: 'info' | 'success' | 'error'; visible: boolean } | null>(null);
  const countdownRef = React.useRef<NodeJS.Timeout | null>(null);
  const wasRefreshingRef = React.useRef(false);
  
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
      showToast('Updated', 'success', 1800);
      // Trigger refresh animation on all metric values
      setRefreshAnimationKey(prev => prev + 1);
    }
    wasRefreshingRef.current = !!isRefreshing;
  }, [isRefreshing, showToast]);
  
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

  const calculateProgress = (metric: TimeMetric): number => {
    if (metric.showDial && metric.dialTarget) {
      const current = metric.isTimeMoney ? (metric.hours || 0) : (metric.count || 0);
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

  const getDisplaySpec = (metric: TimeMetric): { value: number; formatter: (n: number) => string } => {
    if (metric.isMoneyOnly) {
      return { value: metric.money || 0, formatter: (n) => formatCurrency(Math.round(n)) };
    }
    if (metric.isTimeMoney) {
      return { value: metric.hours || 0, formatter: (n) => formatHours(n) };
    }
    return { value: metric.count || 0, formatter: (n) => Math.round(n).toString() };
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
    try { return sessionStorage.getItem('tmv2_animated') !== 'true'; } catch { return true; }
  });
  
  // Track when the stagger animation is fully complete
  const [animationComplete, setAnimationComplete] = React.useState(!enableAnimationThisMount);
  
  React.useEffect(() => {
    if (enableAnimationThisMount) {
      setMounted(false);
      const t = setTimeout(() => {
        setMounted(true);
        try { sessionStorage.setItem('tmv2_animated', 'true'); } catch {}
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
              border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
              background: showEnquiryMetrics 
                ? colours.highlight
                : (isDarkMode ? '#111827' : '#FFFFFF'),
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
              border: `1px solid ${isDarkMode ? '#4B5563' : '#E5E7EB'}`,
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
          headerActions={headerActions}
          title={'Conversion Metrics'}
          refreshAnimationKey={refreshAnimationKey}
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
      {/* Unified Time Metrics Container with integrated header (match SectionCard visuals) */}
      <div style={{
        background: isDarkMode 
          ? 'linear-gradient(135deg, #0B1224 0%, #0F1B33 100%)'
          : colours.light.cardBackground,
        borderRadius: '2px',
        border: isDarkMode 
          ? `1px solid ${colours.dark.border}` 
          : `1px solid ${colours.light.border}`,
        boxShadow: isDarkMode
          ? '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.08)'
          : '0 2px 8px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.01)',
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Header inside the container */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: isDarkMode 
            ? `1px solid ${colours.dark.border}` 
            : `1px solid ${colours.light.border}`,
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
            {onRefresh && (
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
                border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
                background: showEnquiryMetrics 
                  ? colours.highlight
                  : (isDarkMode ? '#111827' : '#FFFFFF'),
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
                border: `1px solid ${isDarkMode ? '#4B5563' : '#E5E7EB'}`,
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
          const progress = isTimeMetric(metric) ? calculateProgress(metric) : 0;
          const trend = getTrendDirection(currentValue, prevValue);
          const trendColor = getTrendColor(trend);

          return (
            <div
              key={`${metric.title}-${refreshAnimationKey}`}
              style={{
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%)'
                  : colours.light.cardBackground,
                borderRadius: '2px',
                padding: '20px',
                border: isDarkMode 
                  ? `1px solid ${colours.dark.border}`
                  : `1px solid ${colours.light.border}`,
                boxShadow: isDarkMode
                  ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                  : '0 1px 3px rgba(0, 0, 0, 0.1)',
                transition: 'box-shadow 0.15s ease',
                cursor: 'default',
                // Natural card styling that sits on the page background
                ...staggerStyle(index),
                // Apply refresh animation when refreshAnimationKey changes
                animation: refreshAnimationKey > 0 ? `metricRefresh 0.4s ease ${index * 0.05}s both` : undefined,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = isDarkMode
                  ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = isDarkMode
                  ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                  : '0 1px 3px rgba(0, 0, 0, 0.1)';
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '2px',
                  background: isDarkMode 
                    ? 'rgba(135, 243, 243, 0.1)'
                    : 'rgba(54, 144, 206, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDarkMode ? colours.accent : colours.highlight,
                }}>
                  <Icon size={14} />
                </div>
                {prevValue > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
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
                  </div>
                )}
              </div>

              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '13px',
                fontWeight: 500,
                color: isDarkMode ? '#9CA3AF' : '#6B7280',
                lineHeight: '1.2',
              }}>
                {metric.title}
              </h3>

              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                marginBottom: (isTimeMetric(metric) && metric.showDial) ? '16px' : '0',
              }}>
                <AnimatedValueWithEnabled
                  value={getDisplaySpec(metric).value}
                  formatter={getDisplaySpec(metric).formatter}
                  enabled={enableAnimationThisMount}
                  style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isDarkMode ? '#F9FAFB' : '#111827',
                    letterSpacing: '-0.025em',
                  }}
                />
                {isTimeMetric(metric) && metric.isTimeMoney && (metric.money ?? 0) > 0 && (
                  <AnimatedValueWithEnabled
                    value={metric.money || 0}
                    formatter={(n) => formatCurrency(Math.round(n))}
                    enabled={enableAnimationThisMount}
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: isDarkMode ? '#10B981' : '#059669',
                    }}
                  />
                )}
              </div>

              {isTimeMetric(metric) && metric.showDial && metric.dialTarget && (
                <div style={{
                  position: 'relative',
                  marginTop: '12px',
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
              const progress = isTimeMetric(metric) ? calculateProgress(metric) : 0;
              const trend = getTrendDirection(currentValue, prevValue);
              const trendColor = getTrendColor(trend);

              return (
                <div
                  key={`${metric.title}-${refreshAnimationKey}`}
                  style={{
                    background: isDarkMode 
                      ? 'linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%)'
                      : colours.light.cardBackground,
                    borderRadius: '2px',
                    padding: '20px',
                    border: isDarkMode 
                      ? `1px solid ${colours.dark.border}`
                      : `1px solid ${colours.light.border}`,
                    boxShadow: isDarkMode
                      ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                      : '0 1px 3px rgba(0, 0, 0, 0.1)',
                    transition: 'box-shadow 0.15s ease',
                    cursor: 'default',
                    ...staggerStyle(index + 3),
                    // Apply refresh animation when refreshAnimationKey changes
                    animation: refreshAnimationKey > 0 ? `metricRefresh 0.4s ease ${(index + 3) * 0.05}s both` : undefined,
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
                        {metric.title}
                      </span>
                    </div>
                    {/* Only show trend indicator if prevValue exists and is greater than 0 */}
                    {prevValue > 0 && (
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
                        {trend === 'neutral' && '→'}
                        <span>
                          {trend === 'up' && '+'}
                          {Math.abs(((currentValue - prevValue) / prevValue) * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    marginBottom: '8px',
                  }}>
                    <AnimatedValueWithEnabled
                      value={getDisplaySpec(metric as TimeMetric).value}
                      formatter={getDisplaySpec(metric as TimeMetric).formatter}
                      enabled={enableAnimationThisMount}
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
                  {isTimeMetric(metric) && metric.isMoneyOnly && prevValue > 0 && metric.secondary === undefined && (
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      marginBottom: '8px',
                    }}>
                      Last month: {formatCurrency(prevValue)}
                    </div>
                  )}

                  {isTimeMetric(metric) && metric.isTimeMoney && (metric.money ?? 0) > 0 && (
                    <div style={{
                      fontSize: '12px',
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      marginBottom: '12px',
                    }}>
                      <AnimatedValueWithEnabled
                        value={metric.money || 0}
                        formatter={(n) => `£${Math.round(n).toLocaleString()}`}
                        enabled={enableAnimationThisMount}
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
        </div> {/* Close metrics content padding */}
      </div> {/* Close unified Time Metrics container */}
    </div>
  );
};

export default TimeMetricsV2;