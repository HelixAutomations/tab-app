import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface YoYYearData {
  fy: number;
  label: string;
  startDate: string;
  endDate: string;
  wip: number;
  wipHours: number;
  wipRowCount: number;
  collected: number;
  collectedRowCount: number;
  mattersOpened: number;
  dataAvailability: {
    wip: boolean;
    collected: boolean;
    matters: boolean;
    wipMinDate: string | null;
    wipMaxDate: string | null;
    collectedMinDate: string | null;
    collectedMaxDate: string | null;
  };
}

interface YoYResponse {
  generatedAt: string;
  anchorDate: string | null;
  ytd: boolean;
  years: YoYYearData[];
}

type MetricKey = 'wip' | 'collected' | 'mattersOpened';
type Phase = 'idle' | 'loading' | 'loaded' | 'error';
type MonthlyPhase = 'idle' | 'loading' | 'loaded' | 'error';

interface MetricConfig {
  label: string;
  detail: string;
  colour: string;
  value: (year: YoYYearData) => number;
  available: (year: YoYYearData) => boolean;
  format: (value: number) => string;
  compact: (value: number) => string;
}

interface MonthlyPoint {
  label: string;
  value: number;
  rowCount: number;
}

interface DrillYearData {
  fy: number;
  fyLabel: string;
  months: MonthlyPoint[];
}

const METRIC_KEYS: MetricKey[] = ['wip', 'collected', 'mattersOpened'];
const MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const formatCurrency = (value: number): string => `${'\u00A3'}${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

const formatCompactCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) return `${'\u00A3'}${(value / 1_000_000).toFixed(2)}m`;
  if (absValue >= 100_000) return `${'\u00A3'}${(value / 1_000).toFixed(0)}k`;
  if (absValue >= 10_000) return `${'\u00A3'}${(value / 1_000).toFixed(1)}k`;
  return formatCurrency(value);
};

const formatCount = (value: number): string => value.toLocaleString('en-GB', { maximumFractionDigits: 0 });

const formatHours = (value: number): string => `${Math.round(value).toLocaleString('en-GB')}h`;

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const deltaPercent = (current: number, previous: number | null): number | null => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

const yearRangeLabel = (year: YoYYearData): string => `${formatDate(year.startDate)} to ${formatDate(year.endDate)}`;

const YearOverYearComparison: React.FC = () => {
  const { isDarkMode } = useTheme();
  const hasAutoLoadedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [yearsBack, setYearsBack] = useState(3);
  const [activeMetric, setActiveMetric] = useState<MetricKey>('wip');
  const [showMonthlyProfile, setShowMonthlyProfile] = useState(false);
  const [data, setData] = useState<YoYResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthlyPhase, setMonthlyPhase] = useState<MonthlyPhase>('idle');
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthlyCache, setMonthlyCache] = useState<Partial<Record<MetricKey, DrillYearData[]>>>({});

  const accent = colours.highlight;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const labelText = isDarkMode ? colours.dark.text : colours.darkBlue;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const cardBackground = isDarkMode ? 'rgba(6, 23, 51, 0.58)' : 'rgba(255, 255, 255, 0.72)';
  const elevatedBackground = isDarkMode ? 'rgba(13, 47, 96, 0.48)' : 'rgba(244, 244, 246, 0.72)';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.34)' : 'rgba(6, 23, 51, 0.10)';
  const softBorder = isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(6, 23, 51, 0.07)';

  const metricConfig = useMemo<Record<MetricKey, MetricConfig>>(() => ({
    wip: {
      label: 'WIP',
      detail: 'Open value',
      colour: colours.highlight,
      value: (year) => year.wip,
      available: (year) => year.dataAvailability.wip,
      format: formatCurrency,
      compact: formatCompactCurrency,
    },
    collected: {
      label: 'Collected',
      detail: 'Paid fees',
      colour: colours.highlight,
      value: (year) => year.collected,
      available: (year) => year.dataAvailability.collected,
      format: formatCurrency,
      compact: formatCompactCurrency,
    },
    mattersOpened: {
      label: 'Matters',
      detail: 'Opened',
      colour: colours.highlight,
      value: (year) => year.mattersOpened,
      available: (year) => year.dataAvailability.matters,
      format: formatCount,
      compact: formatCount,
    },
  }), []);

  const panelStyle: CSSProperties = {
    background: 'transparent',
    border: `1px solid ${softBorder}`,
    boxShadow: 'none',
    borderRadius: 0,
    padding: 16,
    fontFamily: 'Raleway, sans-serif',
    color: labelText,
  };

  const tertiaryButtonStyle = (active: boolean): CSSProperties => ({
    height: 30,
    borderRadius: 0,
    border: `1px solid ${active ? 'rgba(54, 144, 206, 0.48)' : border}`,
    background: active ? (isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(214, 232, 255, 0.82)') : cardBackground,
    color: active ? labelText : muted,
    cursor: 'pointer',
    padding: '0 10px',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: active ? 800 : 700,
    letterSpacing: 0,
  });

  const primaryButtonStyle: CSSProperties = {
    height: 32,
    borderRadius: 0,
    border: '1px solid rgba(54, 144, 206, 0.42)',
    background: isDarkMode ? colours.highlight : colours.helixBlue,
    color: '#ffffff',
    cursor: 'pointer',
    padding: '0 14px',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0,
  };

  const loadComparison = useCallback(async (nextYearsBack?: number) => {
    const requestedYears = nextYearsBack ?? yearsBack;
    setPhase('loading');
    setError(null);
    setMonthlyError(null);
    setMonthlyPhase('idle');
    setShowMonthlyProfile(false);
    setMonthlyCache({});

    try {
      const response = await fetch(`/api/yoy-comparison?yearsBack=${requestedYears}&ytd=true`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const nextData = await response.json() as YoYResponse;
      setData(nextData);
      setPhase('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [yearsBack]);

  useEffect(() => {
    if (hasAutoLoadedRef.current) return;
    hasAutoLoadedRef.current = true;
    void loadComparison();
  }, [loadComparison]);

  const loadMonthly = useCallback(async (metric: MetricKey = activeMetric) => {
    if (!data?.years.length) return;
    if (monthlyCache[metric]) {
      setMonthlyPhase('loaded');
      return;
    }

    setMonthlyPhase('loading');
    setMonthlyError(null);

    try {
      const results = await Promise.all(data.years.map(async (year) => {
        const response = await fetch(`/api/yoy-comparison/monthly?fy=${year.fy}&metric=${metric}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json() as DrillYearData;
        return json;
      }));

      setMonthlyCache((current) => ({ ...current, [metric]: results }));
      setMonthlyPhase('loaded');
    } catch (err) {
      setMonthlyError(err instanceof Error ? err.message : String(err));
      setMonthlyPhase('error');
    }
  }, [activeMetric, data, monthlyCache]);

  const years = data?.years ?? [];
  const latestYear = years[years.length - 1] ?? null;
  const previousYear = years[years.length - 2] ?? null;
  const activeConfig = metricConfig[activeMetric];
  const anchorLabel = data?.anchorDate ? formatDate(data.anchorDate) : formatDate(new Date().toISOString().slice(0, 10));
  const generatedLabel = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const metricSummaries = useMemo(() => METRIC_KEYS.map((metric) => {
    const config = metricConfig[metric];
    const current = latestYear ? config.value(latestYear) : 0;
    const previous = previousYear ? config.value(previousYear) : null;
    const delta = deltaPercent(current, previous);
    return { metric, config, current, delta };
  }), [latestYear, metricConfig, previousYear]);

  const activeMetricMax = useMemo(() => {
    const maxValue = Math.max(...years.map((year) => activeConfig.value(year)), 0);
    return maxValue || 1;
  }, [activeConfig, years]);

  const availabilitySummary = useMemo(() => {
    const total = years.length * METRIC_KEYS.length;
    if (!total) return { ready: 0, total: 0 };
    const ready = years.reduce((count, year) => (
      count + METRIC_KEYS.filter((metric) => metricConfig[metric].available(year)).length
    ), 0);
    return { ready, total };
  }, [metricConfig, years]);

  const monthlyData = monthlyCache[activeMetric] ?? null;
  const monthlyPeak = useMemo(() => {
    if (!monthlyData) return 1;
    const peak = Math.max(...monthlyData.flatMap((year) => year.months.map((month) => month.value)), 0);
    return peak || 1;
  }, [monthlyData]);

  const renderDelta = (delta: number | null): JSX.Element => {
    if (delta === null) {
      return <span style={{ color: muted, fontSize: 10, fontWeight: 700 }}>baseline</span>;
    }

    const isPositive = delta >= 0;
    return (
      <span style={{ color: isPositive ? colours.highlight : colours.cta, fontSize: 10, fontWeight: 800 }}>
        {isPositive ? '+' : ''}{delta.toFixed(1)}%
      </span>
    );
  };

  const renderAvailabilitySummary = (year: YoYYearData): JSX.Element => {
    const ready = METRIC_KEYS.filter((metric) => metricConfig[metric].available(year)).length;
    return (
      <span style={{ color: muted, fontSize: 10, fontWeight: 700 }}>
        {ready}/{METRIC_KEYS.length} feeds ready
      </span>
    );
  };

  const renderIdle = (): JSX.Element => (
    <div style={panelStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Year on year
            </span>
          </div>
          <div style={{ color: bodyText, fontSize: 13, lineHeight: 1.45 }}>
            Load a YTD comparison across WIP, collected fees and matters for the current financial-year window.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[3, 4, 5].map((option) => (
            <button key={option} type="button" style={tertiaryButtonStyle(yearsBack === option)} onClick={() => setYearsBack(option)}>
              {option}y
            </button>
          ))}
          <button type="button" style={primaryButtonStyle} onClick={() => loadComparison()}>
            Load comparison
          </button>
        </div>
      </div>
    </div>
  );

  if (phase === 'idle') return renderIdle();

  if (phase === 'loading') {
    return (
      <div style={panelStyle}>
        <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={1} label="Querying year-on-year data..." />
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colours.cta, fontSize: 13, fontWeight: 800 }}>
          <Icon iconName="Warning" />
          Year-on-year comparison failed
        </div>
        <div style={{ color: bodyText, fontSize: 12, marginTop: 8 }}>{error}</div>
        <button type="button" style={{ ...primaryButtonStyle, marginTop: 14 }} onClick={() => loadComparison()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data || !latestYear) return renderIdle();

  return (
    <div style={panelStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Year on year
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: bodyText, fontSize: 12 }}>
            <span>{years.length} financial years</span>
            <span style={{ color: muted }}>YTD to {anchorLabel}</span>
            <span style={{ color: muted }}>{availabilitySummary.ready}/{availabilitySummary.total} feeds available</span>
            {generatedLabel && <span style={{ color: muted }}>Updated {generatedLabel}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {[3, 4, 5].map((option) => (
            <button
              key={option}
              type="button"
              style={tertiaryButtonStyle(yearsBack === option)}
              onClick={() => {
                setYearsBack(option);
                void loadComparison(option);
              }}
            >
              {option}y
            </button>
          ))}
          <button type="button" style={tertiaryButtonStyle(false)} onClick={() => loadComparison()}>
            <Icon iconName="Refresh" style={{ marginRight: 6 }} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ background: elevatedBackground, border: `1px solid ${border}`, padding: 12, borderRadius: 0 }}>
          <div style={{ color: muted, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Latest FY</div>
          <div style={{ color: labelText, fontSize: 18, fontWeight: 900 }}>{latestYear.label}</div>
          <div style={{ color: bodyText, fontSize: 11, marginTop: 4 }}>{yearRangeLabel(latestYear)}</div>
          <div style={{ marginTop: 10 }}>{renderAvailabilitySummary(latestYear)}</div>
        </div>
        {metricSummaries.map(({ metric, config, current, delta }) => (
          <button
            key={metric}
            type="button"
            onClick={() => setActiveMetric(metric)}
            style={{
              background: activeMetric === metric ? elevatedBackground : cardBackground,
              border: `1px solid ${activeMetric === metric ? 'rgba(54, 144, 206, 0.38)' : border}`,
              borderRadius: 0,
              padding: 12,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif',
              color: labelText,
              boxShadow: activeMetric === metric ? `inset 2px 0 0 ${colours.highlight}` : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ color: muted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {config.label}
              </span>
              {renderDelta(delta)}
            </div>
            <div style={{ color: labelText, fontSize: 20, fontWeight: 900, marginTop: 8 }}>{config.compact(current)}</div>
            <div style={{ color: bodyText, fontSize: 11, marginTop: 3 }}>{config.detail}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
        <div style={{ display: 'none', background: cardBackground, border: `1px solid ${border}`, borderRadius: 0, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: activeConfig.colour, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {activeConfig.label} trend
              </div>
              <div style={{ color: bodyText, fontSize: 11, marginTop: 3 }}>Relative scale across the loaded financial years.</div>
            </div>
            <div style={{ color: muted, fontSize: 10, fontWeight: 700 }}>{activeConfig.detail}</div>
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {years.map((year, index) => {
              const value = activeConfig.value(year);
              const previous = index > 0 ? activeConfig.value(years[index - 1]) : null;
              const delta = deltaPercent(value, previous);
              const width = clampPercent((value / activeMetricMax) * 100);
              const isLatest = year.fy === latestYear.fy;
              const available = activeConfig.available(year);

              return (
                <div key={year.fy} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 92px 64px', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ color: isLatest ? labelText : bodyText, fontSize: 12, fontWeight: isLatest ? 900 : 800 }}>{year.label}</div>
                    <div style={{ color: muted, fontSize: 9, marginTop: 2 }}>{available ? 'Ready' : 'Partial'}</div>
                  </div>
                  <div style={{ height: 30, background: isDarkMode ? 'rgba(0, 3, 25, 0.62)' : 'rgba(6, 23, 51, 0.05)', border: `1px solid ${softBorder}`, borderRadius: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${width}%`,
                        height: '100%',
                        background: available ? activeConfig.colour : muted,
                        opacity: isLatest ? 1 : 0.62 + (index / Math.max(years.length, 1)) * 0.24,
                      }}
                    />
                  </div>
                  <div style={{ color: labelText, fontSize: 12, fontWeight: 900, textAlign: 'right' }}>{activeConfig.compact(value)}</div>
                  <div style={{ textAlign: 'right' }}>{renderDelta(delta)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: cardBackground, border: `1px solid ${border}`, borderRadius: 0, padding: 14 }}>
          <div style={{ color: muted, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Financial year detail
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {years.slice().reverse().map((year) => (
              <div key={year.fy} style={{ background: elevatedBackground, border: `1px solid ${year.fy === latestYear.fy ? 'rgba(54, 144, 206, 0.42)' : softBorder}`, borderRadius: 0, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: labelText, fontSize: 12, fontWeight: 900 }}>{year.label}</span>
                  <span style={{ color: muted, fontSize: 10, fontWeight: 700 }}>{yearRangeLabel(year)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {METRIC_KEYS.map((metric) => {
                    const config = metricConfig[metric];
                    return (
                      <div key={metric}>
                        <div style={{ color: muted, fontSize: 9, fontWeight: 800 }}>{config.label}</div>
                        <div style={{ color: labelText, fontSize: 12, fontWeight: 900, marginTop: 2 }}>{config.compact(config.value(year))}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ color: muted, fontSize: 9, fontWeight: 700 }}>{formatHours(year.wipHours)}</span>
                  {renderAvailabilitySummary(year)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!showMonthlyProfile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" style={tertiaryButtonStyle(false)} onClick={() => setShowMonthlyProfile(true)}>
            Show monthly profile
          </button>
        </div>
      )}

      <div style={{ display: showMonthlyProfile ? 'block' : 'none', marginTop: 12, background: cardBackground, border: `1px solid ${border}`, borderRadius: 0, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: monthlyData ? 12 : 0 }}>
          <div>
            <div style={{ color: activeConfig.colour, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Monthly profile
            </div>
            <div style={{ color: bodyText, fontSize: 11, marginTop: 3 }}>
              Fiscal-month shape for {activeConfig.label.toLowerCase()}. Current FY stops at the anchor month.
            </div>
          </div>
          <button type="button" style={tertiaryButtonStyle(false)} onClick={() => loadMonthly(activeMetric)} disabled={monthlyPhase === 'loading'}>
            {monthlyPhase === 'loading' ? 'Loading...' : monthlyData ? 'Refresh monthly' : 'Load monthly'}
          </button>
        </div>

        {monthlyPhase === 'loading' && (
          <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner size={1} label="Loading monthly profile..." />
          </div>
        )}

        {monthlyPhase === 'error' && monthlyError && (
          <div style={{ color: colours.cta, fontSize: 12, fontWeight: 700, marginTop: 10 }}>{monthlyError}</div>
        )}

        {!monthlyData && monthlyPhase !== 'loading' && (
          <div style={{ color: muted, fontSize: 11, marginTop: 10 }}>
            Monthly data is kept on demand so the dashboard stays quick on first load.
          </div>
        )}

        {monthlyData && (
          <div style={{ display: 'grid', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '82px repeat(12, minmax(26px, 1fr)) 82px', gap: 5, color: muted, fontSize: 9, fontWeight: 800, minWidth: 560 }}>
              <span>FY</span>
              {MONTH_LABELS.map((month) => <span key={month} style={{ textAlign: 'center' }}>{month}</span>)}
              <span style={{ textAlign: 'right' }}>Profile</span>
            </div>
            {monthlyData.map((year) => {
              const total = year.months.reduce((sum, month) => sum + month.value, 0);
              return (
                <div key={year.fy} style={{ display: 'grid', gridTemplateColumns: '82px repeat(12, minmax(26px, 1fr)) 82px', gap: 5, alignItems: 'end', minWidth: 560 }}>
                  <span style={{ color: labelText, fontSize: 11, fontWeight: 900, paddingBottom: 4 }}>{year.fyLabel}</span>
                  {MONTH_LABELS.map((label, index) => {
                    const point = year.months[index] ?? { label, value: 0, rowCount: 0 };
                    const height = clampPercent((point.value / monthlyPeak) * 100);
                    return (
                      <div key={`${year.fy}-${label}`} title={`${year.fyLabel} ${label}: ${activeConfig.format(point.value)}`} style={{ height: 42, display: 'flex', alignItems: 'end', justifyContent: 'center', background: isDarkMode ? 'rgba(0, 3, 25, 0.34)' : 'rgba(6, 23, 51, 0.035)', border: `1px solid ${softBorder}` }}>
                        <span style={{ width: '100%', height: `${Math.max(6, height)}%`, background: activeConfig.colour, opacity: point.value > 0 ? 0.28 + (height / 100) * 0.62 : 0.12 }} />
                      </div>
                    );
                  })}
                  <span style={{ color: labelText, fontSize: 11, fontWeight: 900, textAlign: 'right', paddingBottom: 4 }}>{activeConfig.compact(total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default YearOverYearComparison;