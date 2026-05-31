import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
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
  start?: string;
  end?: string;
  value: number;
  rowCount: number;
}

interface MonthlyHoverState {
  key: string;
  left: number;
  top: number;
  placement: 'above' | 'below';
  title: string;
  metricLabel: string;
  formattedValue: string;
  basis: string;
  period: string;
  rowSummary: string;
}

interface DrillYearData {
  fy: number;
  fyLabel: string;
  months: MonthlyPoint[];
}

interface YearOverYearComparisonProps {
  anchorDate?: Date;
  collectedUserIds?: string[];
  includeDisbursements?: boolean;
  currentCollectedOverride?: number;
  currentCollectedDisplayOverride?: string;
  currentCollectedBasisLabel?: string;
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
const samePeriodRangeLabel = (anchorLabel: string): string => `1 Apr to ${anchorLabel}`;

const YearOverYearComparison: React.FC<YearOverYearComparisonProps> = ({
  anchorDate,
  collectedUserIds,
  includeDisbursements,
  currentCollectedOverride,
  currentCollectedDisplayOverride,
  currentCollectedBasisLabel,
}) => {
  const { isDarkMode } = useTheme();
  const hasAutoLoadedRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [yearsBack, setYearsBack] = useState(3);
  const [activeMetric, setActiveMetric] = useState<MetricKey>('wip');
  const [showMonthlyProfile, setShowMonthlyProfile] = useState(true);
  const [data, setData] = useState<YoYResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthlyPhase, setMonthlyPhase] = useState<MonthlyPhase>('idle');
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthlyCache, setMonthlyCache] = useState<Partial<Record<MetricKey, DrillYearData[]>>>({});
  const [monthlyHover, setMonthlyHover] = useState<MonthlyHoverState | null>(null);

  const accent = colours.highlight;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const labelText = isDarkMode ? colours.dark.text : colours.darkBlue;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const cardBackground = isDarkMode ? 'rgba(6, 23, 51, 0.58)' : 'rgba(255, 255, 255, 0.72)';
  const elevatedBackground = isDarkMode ? 'rgba(13, 47, 96, 0.48)' : 'rgba(244, 244, 246, 0.72)';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.34)' : 'rgba(6, 23, 51, 0.10)';
  const softBorder = isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(6, 23, 51, 0.07)';
  const gridLine = isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(107, 107, 107, 0.08)';
  const axisLine = isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(107, 107, 107, 0.15)';
  const tickStyle = { fontSize: 9, fill: muted, fontFamily: 'Raleway, sans-serif' };
  const tooltipLabelColour = isDarkMode ? '#f3f4f6' : '#061733';
  const tooltipItemColour = isDarkMode ? '#d1d5db' : '#374151';
  const anchorMonth = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate.getMonth() + 1 : null;
  const anchorDay = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate.getDate() : null;
  const anchorKey = anchorMonth && anchorDay ? `${anchorMonth}-${anchorDay}` : 'today';
  const collectedUserIdsKey = useMemo(() => (
    collectedUserIds && collectedUserIds.length > 0
      ? [...collectedUserIds].sort().join(',')
      : ''
  ), [collectedUserIds]);
  const collectedBasisKey = `${includeDisbursements === false ? 'fees-only' : 'all-collected'}-${collectedUserIdsKey || 'all-users'}`;
  const validCollectedOverride = typeof currentCollectedOverride === 'number' && Number.isFinite(currentCollectedOverride)
    ? currentCollectedOverride
    : null;
  const tooltipStyle: CSSProperties = {
    background: isDarkMode ? 'rgba(6, 23, 51, 0.95)' : 'rgba(255, 255, 255, 0.96)',
    border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(107, 107, 107, 0.15)'}`,
    borderRadius: 0,
    fontSize: 11,
    fontFamily: 'Raleway, sans-serif',
    color: tooltipItemColour,
    boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 3px 8px rgba(6,23,51,0.08)',
    padding: '6px 10px',
  };

  const showMonthlyBucketTooltip = (
    event: React.MouseEvent<HTMLDivElement> | React.FocusEvent<HTMLDivElement>,
    detail: Omit<MonthlyHoverState, 'left' | 'top' | 'placement'>
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = typeof window === 'undefined' ? rect.left + rect.width : window.innerWidth;
    const left = Math.min(Math.max(rect.left + rect.width / 2, 140), viewportWidth - 140);
    const placement: MonthlyHoverState['placement'] = rect.top < 130 ? 'below' : 'above';
    setMonthlyHover({
      ...detail,
      left,
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      placement,
    });
  };

  const hideMonthlyBucketTooltip = (key: string): void => {
    setMonthlyHover((current) => (current?.key === key ? null : current));
  };

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
      detail: currentCollectedBasisLabel ?? 'Paid fees',
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
  }), [currentCollectedBasisLabel]);

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
    hasAutoLoadedRef.current = `${requestedYears}-${anchorKey}-${collectedBasisKey}`;
    setPhase('loading');
    setError(null);
    setMonthlyError(null);
    setMonthlyPhase('idle');
    setMonthlyCache({});

    try {
      const params = new URLSearchParams({
        yearsBack: String(requestedYears),
        ytd: 'true',
      });
      if (anchorMonth && anchorDay) {
        params.set('anchorMonth', String(anchorMonth));
        params.set('anchorDay', String(anchorDay));
      }
      if (typeof includeDisbursements === 'boolean') {
        params.set('includeDisbursements', String(includeDisbursements));
      }
      if (collectedUserIdsKey) {
        params.set('collectedUserIds', collectedUserIdsKey);
      }
      const response = await fetch(`/api/yoy-comparison?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const nextData = await response.json() as YoYResponse;
      setData(nextData);
      setPhase('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [anchorDay, anchorKey, anchorMonth, collectedBasisKey, collectedUserIdsKey, includeDisbursements, yearsBack]);

  useEffect(() => {
    const autoLoadKey = `${yearsBack}-${anchorKey}-${collectedBasisKey}`;
    if (hasAutoLoadedRef.current === autoLoadKey) return;
    void loadComparison();
  }, [anchorKey, collectedBasisKey, loadComparison, yearsBack]);

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
        const params = new URLSearchParams({
          fy: String(year.fy),
          metric,
        });
        if (metric === 'collected') {
          if (typeof includeDisbursements === 'boolean') {
            params.set('includeDisbursements', String(includeDisbursements));
          }
          if (collectedUserIdsKey) {
            params.set('collectedUserIds', collectedUserIdsKey);
          }
        }
        const response = await fetch(`/api/yoy-comparison/monthly?${params.toString()}`);
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
  }, [activeMetric, collectedUserIdsKey, data, includeDisbursements, monthlyCache]);

  useEffect(() => {
    if (!data?.years.length) return;
    if (monthlyCache[activeMetric]) return;
    if (monthlyPhase === 'loading') return;
    void loadMonthly(activeMetric);
  }, [data, activeMetric, monthlyCache, monthlyPhase, loadMonthly]);

  const years = useMemo(() => {
    const sourceYears = data?.years ?? [];
    if (!sourceYears.length || validCollectedOverride === null) return sourceYears;
    const latestFy = sourceYears[sourceYears.length - 1]?.fy;
    return sourceYears.map((year) => (
      year.fy === latestFy
        ? { ...year, collected: validCollectedOverride }
        : year
    ));
  }, [data, validCollectedOverride]);
  const latestYear = years[years.length - 1] ?? null;
  const previousYear = years[years.length - 2] ?? null;
  const activeConfig = metricConfig[activeMetric];
  const anchorLabel = data?.anchorDate ? formatDate(data.anchorDate) : formatDate(new Date().toISOString().slice(0, 10));
  const comparisonModeLabel = data?.ytd ? 'Same-period year-to-date' : 'Full financial year';
  const comparisonPeriodLabel = data?.ytd ? samePeriodRangeLabel(anchorLabel) : '1 Apr to 31 Mar';
  const comparisonBasis = data?.ytd
    ? `Each bar totals ${comparisonPeriodLabel} within its own financial year.`
    : 'Each bar totals the full financial year.';
  const generatedLabel = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const metricSummaries = useMemo(() => METRIC_KEYS.map((metric) => {
    const config = metricConfig[metric];
    const current = latestYear ? config.value(latestYear) : 0;
    const previous = previousYear ? config.value(previousYear) : null;
    const delta = deltaPercent(current, previous);
    const currentDisplay = metric === 'collected' && currentCollectedDisplayOverride
      ? currentCollectedDisplayOverride
      : config.compact(current);
    return { metric, config, current, currentDisplay, delta };
  }), [currentCollectedDisplayOverride, latestYear, metricConfig, previousYear]);

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
            Load the current financial year-to-date and compare the same 1 Apr to today window in previous financial years.
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
              {comparisonModeLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: bodyText, fontSize: 12 }}>
            <span>{years.length} financial years</span>
            <span style={{ color: muted }}>{comparisonPeriodLabel} in each FY</span>
            <span style={{ color: muted }}>{availabilitySummary.ready}/{availabilitySummary.total} feeds available</span>
            {generatedLabel && <span style={{ color: muted }}>Updated {generatedLabel}</span>}
          </div>
          <div style={{ color: bodyText, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>
            {comparisonBasis} Prior years are not full-year totals in this view.
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, color: muted, fontSize: 11 }}>
        <span style={{ color: muted, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current comparison window</span>
        <span style={{ color: labelText, fontSize: 13, fontWeight: 900 }}>{latestYear.label}</span>
        <span aria-hidden style={{ color: muted }}>{'\u00B7'}</span>
        <span style={{ color: bodyText }}>{yearRangeLabel(latestYear)}</span>
        <span aria-hidden style={{ color: muted }}>{'\u00B7'}</span>
        {renderAvailabilitySummary(latestYear)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        {metricSummaries.map(({ metric, config, currentDisplay, delta }) => (
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
            <div style={{ color: labelText, fontSize: 20, fontWeight: 900, marginTop: 8 }}>{currentDisplay}</div>
            <div style={{ color: bodyText, fontSize: 11, marginTop: 3 }}>{config.detail}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, alignItems: 'stretch' }}>
        {METRIC_KEYS.map((metric) => {
          const config = metricConfig[metric];
          const chartData = years.map((year) => ({
            label: year.label,
            fy: year.fy,
            value: config.value(year),
            period: yearRangeLabel(year),
            basis: data.ytd ? 'Same-period YTD' : 'Full FY',
            hasData: config.available(year),
            isLatest: year.fy === latestYear.fy,
          }));
          const isActive = activeMetric === metric;
          return (
            <button
              key={metric}
              type="button"
              onClick={() => setActiveMetric(metric)}
              style={{
                background: cardBackground,
                border: `1px solid ${isActive ? 'rgba(54, 144, 206, 0.38)' : border}`,
                borderRadius: 0,
                padding: '14px 12px 8px',
                fontFamily: 'Raleway, sans-serif',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isActive ? `inset 2px 0 0 ${colours.highlight}` : 'none',
              }}
            >
              <div style={{ color: config.colour, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                {config.label}
              </div>
              <div style={{ color: bodyText, fontSize: 10, fontWeight: 700, marginTop: -6, marginBottom: 8 }}>
                {comparisonPeriodLabel} in each FY
              </div>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 8, left: 4, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridLine} vertical={false} />
                    <XAxis dataKey="label" tick={{ ...tickStyle, fontWeight: 600 }} axisLine={{ stroke: axisLine }} tickLine={false} />
                    <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(value: number) => config.compact(value)} width={50} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: tooltipLabelColour, fontWeight: 700, marginBottom: 3 }}
                      itemStyle={{ color: tooltipItemColour }}
                      labelFormatter={(label) => `${label} ${comparisonModeLabel}`}
                      formatter={(value, _name, item) => {
                        const numericValue = typeof value === 'number' ? value : Number(value) || 0;
                        const period = typeof item?.payload?.period === 'string' ? item.payload.period : null;
                        const basis = typeof item?.payload?.basis === 'string' ? item.payload.basis : comparisonModeLabel;
                        const formattedValue = metric === 'collected' && item?.payload?.isLatest && currentCollectedDisplayOverride
                          ? currentCollectedDisplayOverride
                          : config.format(numericValue);
                        return [formattedValue, period ? `${config.label}, ${basis}, ${period}` : config.label];
                      }}
                      cursor={{ fill: isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.03)' }}
                    />
                    <Bar dataKey="value" maxBarSize={36}>
                      {chartData.map((entry, idx) => (
                        <Cell
                          key={entry.fy}
                          fill={entry.hasData ? config.colour : (isDarkMode ? 'rgba(75,85,99,0.18)' : 'rgba(107,107,107,0.10)')}
                          opacity={entry.hasData ? (0.5 + ((idx + 1) / chartData.length) * 0.5) : 0.3}
                          stroke={isActive && entry.isLatest ? colours.highlight : 'none'}
                          strokeWidth={isActive && entry.isLatest ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: showMonthlyProfile ? 'block' : 'none', marginTop: 12, background: cardBackground, border: `1px solid ${border}`, borderRadius: 0, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: monthlyData ? 12 : 0 }}>
          <div>
            <div style={{ color: activeConfig.colour, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Monthly profile
            </div>
            <div style={{ color: bodyText, fontSize: 11, marginTop: 3 }}>
              Fiscal-month shape for {activeConfig.label.toLowerCase()}. The comparison view above uses {comparisonPeriodLabel} for every FY.
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
                    const bucketKey = `${year.fy}-${label}`;
                    const bucketPeriod = point.start && point.end ? `${formatDate(point.start)} to ${formatDate(point.end)}` : point.label;
                    const rowSummary = activeMetric === 'mattersOpened'
                      ? `${formatCount(point.rowCount)} matters opened`
                      : `${formatCount(point.rowCount)} source rows`;
                    const hoverDetail = {
                      key: bucketKey,
                      title: `${year.fyLabel} ${point.label}`,
                      metricLabel: activeConfig.label,
                      formattedValue: activeConfig.format(point.value),
                      basis: data.ytd ? `Same-period YTD view: ${comparisonPeriodLabel} in each FY` : 'Full financial year view',
                      period: point.start && point.end ? `Bucket period: ${bucketPeriod}` : `Bucket: ${bucketPeriod}`,
                      rowSummary,
                    };
                    const isBucketHovered = monthlyHover?.key === bucketKey;
                    return (
                      <div
                        key={bucketKey}
                        tabIndex={0}
                        aria-label={`${year.fyLabel} ${point.label}: ${activeConfig.label} ${activeConfig.format(point.value)}, ${bucketPeriod}, ${rowSummary}`}
                        onMouseEnter={(event) => showMonthlyBucketTooltip(event, hoverDetail)}
                        onMouseMove={(event) => showMonthlyBucketTooltip(event, hoverDetail)}
                        onFocus={(event) => showMonthlyBucketTooltip(event, hoverDetail)}
                        onMouseLeave={() => hideMonthlyBucketTooltip(bucketKey)}
                        onBlur={() => hideMonthlyBucketTooltip(bucketKey)}
                        style={{
                          height: 42,
                          display: 'flex',
                          alignItems: 'end',
                          justifyContent: 'center',
                          background: isDarkMode ? 'rgba(0, 3, 25, 0.34)' : 'rgba(6, 23, 51, 0.035)',
                          border: `1px solid ${isBucketHovered ? activeConfig.colour : softBorder}`,
                          boxShadow: isBucketHovered ? `0 0 0 1px ${activeConfig.colour}` : 'none',
                          cursor: 'default',
                          outline: 'none',
                        }}
                      >
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

        {monthlyHover && typeof document !== 'undefined' && createPortal((
          <div
            role="tooltip"
            style={{
              ...tooltipStyle,
              position: 'fixed',
              left: monthlyHover.left,
              top: monthlyHover.top,
              transform: monthlyHover.placement === 'above' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              zIndex: 10000,
              minWidth: 220,
              maxWidth: 270,
              pointerEvents: 'none',
              lineHeight: 1.35,
              textAlign: 'left',
            }}
          >
            <div style={{ color: tooltipLabelColour, fontWeight: 800, marginBottom: 5 }}>{monthlyHover.title}</div>
            <div style={{ color: tooltipItemColour, fontWeight: 800 }}>{monthlyHover.metricLabel}: {monthlyHover.formattedValue}</div>
            <div style={{ color: tooltipItemColour, marginTop: 4 }}>{monthlyHover.basis}</div>
            <div style={{ color: tooltipItemColour, marginTop: 2 }}>{monthlyHover.period}</div>
            <div style={{ color: muted, marginTop: 5 }}>{monthlyHover.rowSummary}</div>
          </div>
        ), document.body)}
      </div>
    </div>
  );
};

export default YearOverYearComparison;