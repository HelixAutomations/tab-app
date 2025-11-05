import React from 'react';
import { FiTrendingUp, FiTarget, FiUsers, FiCheckCircle } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';

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
}

const EnquiryMetricsV2: React.FC<EnquiryMetricsV2Props> = ({ metrics, isDarkMode, headerActions, title }) => {
  const [mounted, setMounted] = React.useState(false);
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

  // Count-up animation for primary numbers
  const useCountUp = (target: number, durationMs: number = 700): number => {
    const [value, setValue] = React.useState(0);
    React.useEffect(() => {
      if (!Number.isFinite(target)) { setValue(0); return; }
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(target * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      setValue(0);
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target, durationMs]);
    return value;
  };

  const AnimatedValueWithEnabled: React.FC<{ value: number; formatter: (n: number) => string; enabled: boolean; style?: React.CSSProperties }>
    = ({ value, formatter, enabled, style }) => {
      const animated = useCountUp(enabled ? value : 0);
      const toRender = enabled ? animated : value;
      return <span style={style}>{formatter(toRender)}</span>;
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
          ? 'linear-gradient(135deg, #0B1224 0%, #0F1B33 100%)'
          : colours.light.cardBackground,
        borderRadius: '12px',
        border: isDarkMode 
          ? `1px solid ${colours.dark.border}` 
          : `1px solid ${colours.light.border}`,
        boxShadow: isDarkMode
          ? '0 4px 6px rgba(0, 0, 0, 0.3)'
          : '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
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
          <h2 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            letterSpacing: '-0.025em',
          }}>
            {title || 'Enquiry & Conversion Metrics'}
          </h2>
          {headerActions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {headerActions}
            </div>
          )}
        </div>
        
        {/* Metrics Content */}
        <div style={{
          padding: '0 16px 16px 16px',
        }}>
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
              const trend = getTrendDirection(currentValue, prevValue);
              const trendColor = getTrendColor(trend);

              return (
                <div
                  key={metric.title}
                  style={{
                    background: isDarkMode 
                      ? 'linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%)'
                      : colours.light.cardBackground,
                    borderRadius: '8px',
                    padding: '20px',
                    border: isDarkMode 
                      ? `1px solid ${colours.dark.border}`
                      : `1px solid ${colours.light.border}`,
                    boxShadow: isDarkMode
                      ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                      : '0 1px 3px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease',
                    cursor: 'default',
                    ...staggerStyle(index),
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = isDarkMode
                      ? '0 8px 25px rgba(0, 0, 0, 0.4)'
                      : '0 8px 25px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isDarkMode
                      ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                      : '0 1px 3px rgba(0, 0, 0, 0.1)';
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
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
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
                    {trend !== 'neutral' && (
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
                        <span>{formatTrendValue(currentValue, prevValue, metric.isPercentage || false)}</span>
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

                  {/* Main value */}
                  <div style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isDarkMode ? '#F9FAFB' : '#111827',
                    letterSpacing: '-0.025em',
                    fontVariantNumeric: 'tabular-nums',
                    marginBottom: '8px',
                  }}>
                    <AnimatedValueWithEnabled
                      value={getCurrentValue(metric)}
                      formatter={(n) => metric.isPercentage ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString()}
                      enabled={enableAnimationThisMount}
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
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min((metric.percentage || 0), 100)}%`,
                          height: '100%',
                          background: (metric.percentage || 0) >= 80 
                            ? `linear-gradient(90deg, ${colours.green} 0%, rgba(32, 178, 108, 0.8) 100%)`
                            : isDarkMode
                            ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                            : colours.highlight,
                          borderRadius: '3px',
                          transition: enableAnimationThisMount ? 'width 0.3s ease' : 'none',
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
                const trend = getTrendDirection(currentValue, prevValue);
                const trendColor = getTrendColor(trend);

                return (
                  <div
                    key={metric.title}
                    style={{
                      background: isDarkMode 
                        ? 'linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%)'
                        : colours.light.cardBackground,
                      borderRadius: '8px',
                      padding: '20px',
                      border: isDarkMode 
                        ? `1px solid ${colours.dark.border}`
                        : `1px solid ${colours.light.border}`,
                      boxShadow: isDarkMode
                        ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                        : '0 1px 3px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.2s ease',
                      cursor: 'default',
                      ...staggerStyle(index + 3),
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
                          {metric.title}
                        </span>
                      </div>
                      {trend !== 'neutral' && (
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

                          <span>{formatTrendValue(currentValue, prevValue, metric.isPercentage || false)}</span>
                        </div>
                      )}
                    </div>

                    {/* Main value */}
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontVariantNumeric: 'tabular-nums',
                      marginBottom: '8px',
                    }}>
                      <AnimatedValueWithEnabled
                        value={getCurrentValue(metric)}
                        formatter={(n) => metric.isPercentage ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString()}
                        enabled={enableAnimationThisMount}
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
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${Math.min((metric.percentage || 0), 100)}%`,
                            height: '100%',
                            background: (metric.percentage || 0) >= 80 
                              ? `linear-gradient(90deg, ${colours.green} 0%, rgba(32, 178, 108, 0.8) 100%)`
                              : isDarkMode
                              ? `linear-gradient(90deg, ${colours.highlight} 0%, ${colours.accent} 100%)`
                              : colours.highlight,
                            borderRadius: '3px',
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
        </div>
      </div>
    </div>
  );
};

export default EnquiryMetricsV2;