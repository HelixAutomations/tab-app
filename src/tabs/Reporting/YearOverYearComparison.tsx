/**
 * YearOverYearComparison - Demand-loaded bar chart comparison of WIP,
 * Collected, Matters across up to 5 financial years (Apr->Mar), YTD-scoped.
 *
 * Modes: split (3 separate charts) or combined (grouped bars on one chart).
 * Click a bar -> monthly drill-down. Dormant until user triggers load.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import {
  reportingPanelBackground, reportingPanelBorder, reportingPanelShadow,
} from './styles/reportingFoundation';

// -- Types --

interface YoYYearData {
  fy: number; label: string; startDate: string; endDate: string;
  wip: number; wipHours: number; wipRowCount: number;
  collected: number; collectedRowCount: number; mattersOpened: number;
  dataAvailability: { wip: boolean; collected: boolean; matters: boolean;
    wipMinDate: string | null; wipMaxDate: string | null;
    collectedMinDate: string | null; collectedMaxDate: string | null; };
}
interface YoYResponse { generatedAt: string; anchorDate: string | null; ytd: boolean; years: YoYYearData[]; }
type MetricKey = 'wip' | 'collected' | 'mattersOpened';
interface MonthlyPoint { label: string; value: number; rowCount: number; }
interface DrillYearData { fy: number; fyLabel: string; months: MonthlyPoint[]; }
interface DrillDown { metric: MetricKey; years: DrillYearData[]; }
type Phase = 'idle' | 'loading' | 'loaded' | 'error';
type ChartMode = 'combined' | 'split';

// -- Brand constants (Helix palette only — no generic green/orange) --

const METRIC_CFG: Record<MetricKey, { label: string; shortLabel: string; darkColour: string; lightColour: string; format: (v: number) => string }> = {
  wip:            { label: 'WIP',       shortLabel: 'WIP',       darkColour: colours.highlight, lightColour: colours.helixBlue,  format: v => v >= 1000 ? `${'\u00A3'}${(v/1000).toFixed(0)}k` : `${'\u00A3'}${v.toFixed(0)}` },
  collected:      { label: 'Collected', shortLabel: 'Collected', darkColour: colours.accent,    lightColour: colours.highlight, format: v => v >= 1000 ? `${'\u00A3'}${(v/1000).toFixed(0)}k` : `${'\u00A3'}${v.toFixed(0)}` },
  mattersOpened:  { label: 'Matters',   shortLabel: 'Matters',   darkColour: colours.cta,       lightColour: colours.cta,       format: v => v.toFixed(0) },
};

const fmtCurrency = (v: number) => `${'\u00A3'}${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtCount = (v: number) => v.toLocaleString('en-GB');

// -- Component --

const YearOverYearComparison: React.FC = () => {
  const { isDarkMode } = useTheme();
  const dm = isDarkMode;

  // Resolve mode-aware metric colours from Helix palette
  const metrics = useMemo(() => {
    const resolve = (mk: MetricKey) => {
      const cfg = METRIC_CFG[mk];
      return { ...cfg, colour: dm ? cfg.darkColour : cfg.lightColour };
    };
    return { wip: resolve('wip'), collected: resolve('collected'), mattersOpened: resolve('mattersOpened') } as Record<MetricKey, { label: string; shortLabel: string; colour: string; format: (v: number) => string }>;
  }, [dm]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [data, setData] = useState<YoYResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearsBack, setYearsBack] = useState(3);
  const [chartMode, setChartMode] = useState<ChartMode>('split');
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // -- Fetchers --

  const fetchData = useCallback(async (years?: number) => {
    const yb = years ?? yearsBack;
    setPhase('loading');
    setError(null);
    setDrillDown(null);
    try {
      const res = await fetch(`/api/yoy-comparison?yearsBack=${yb}&ytd=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setPhase('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [yearsBack]);

  const fetchMonthly = useCallback(async (fy: number, metric: MetricKey) => {
    if (drillDown?.metric === metric) { setDrillDown(null); return; }
    if (!data?.years?.length) return;
    setDrillLoading(true);
    try {
      const results = await Promise.all(
        data.years.map(async (yr) => {
          const res = await fetch(`/api/yoy-comparison/monthly?fy=${yr.fy}&metric=${metric}`);
          if (!res.ok) return null;
          const json = await res.json();
          return { fy: json.fy as number, fyLabel: json.fyLabel as string, months: json.months as MonthlyPoint[] };
        })
      );
      const valid = results.filter((r): r is DrillYearData => r !== null);
      if (valid.length) setDrillDown({ metric, years: valid });
      else setDrillDown(null);
    } catch { setDrillDown(null); }
    finally { setDrillLoading(false); }
  }, [drillDown, data]);

  // -- Derived data --

  const hasGaps = useMemo(() => {
    if (!data?.years) return false;
    return data.years.some(yr => !yr.dataAvailability.wip || !yr.dataAvailability.collected || !yr.dataAvailability.matters);
  }, [data]);

  const combinedChartData = useMemo(() => {
    if (!data?.years) return [];
    return data.years.map(yr => ({
      label: yr.label, fy: yr.fy,
      wip: yr.wip, collected: yr.collected, mattersOpened: yr.mattersOpened,
      hasWip: yr.dataAvailability.wip, hasCollected: yr.dataAvailability.collected,
      hasMatters: yr.dataAvailability.matters,
    }));
  }, [data]);

  // -- Shared styles --

  const panel: React.CSSProperties = {
    background: reportingPanelBackground(dm),
    border: `0.5px solid ${reportingPanelBorder(dm)}`,
    boxShadow: reportingPanelShadow(dm),
    borderRadius: 0, padding: '20px 24px', fontFamily: 'Raleway, sans-serif',
  };
  const accent   = dm ? colours.accent : colours.highlight;
  const muted    = dm ? colours.subtleGrey : colours.greyText;
  const bodyText = dm ? '#d1d5db' : '#374151';
  const gridLine = dm ? 'rgba(75, 85, 99, 0.2)' : 'rgba(107, 107, 107, 0.08)';
  const axisLine = dm ? 'rgba(75, 85, 99, 0.3)' : 'rgba(107, 107, 107, 0.15)';
  const cardBg   = dm ? 'rgba(6, 23, 51, 0.5)' : 'rgba(244, 244, 246, 0.6)';
  const cardBdr  = dm ? 'rgba(75, 85, 99, 0.25)' : 'rgba(107, 107, 107, 0.1)';

  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 10, fontWeight: active ? 700 : 500, padding: '3px 10px', cursor: 'pointer',
    borderRadius: 0, transition: 'all 0.15s ease',
    border: `0.5px solid ${active ? (dm ? `${colours.highlight}40` : `${colours.highlight}30`) : (dm ? 'rgba(75,85,99,0.3)' : 'rgba(107,107,107,0.15)')}`,
    background: active ? (dm ? `${colours.highlight}12` : `${colours.highlight}0a`) : 'transparent',
    color: active ? (dm ? colours.highlight : colours.helixBlue) : muted,
  });

  const tooltipStyle = {
    background: dm ? 'rgba(6, 23, 51, 0.95)' : 'rgba(255, 255, 255, 0.96)',
    border: `0.5px solid ${dm ? 'rgba(75, 85, 99, 0.4)' : 'rgba(107, 107, 107, 0.15)'}`,
    borderRadius: 0, fontSize: 11, fontFamily: 'Raleway, sans-serif',
    color: dm ? '#f3f4f6' : '#061733',
    boxShadow: dm ? '0 4px 12px rgba(0,0,0,0.4)' : '0 3px 8px rgba(6,23,51,0.08)',
    padding: '6px 10px',
  };

  const tickStyle = { fontSize: 9, fill: muted, fontFamily: 'Raleway, sans-serif' };

  // -- Change indicator --

  const changeTag = (current: number, previous: number) => {
    if (!previous) return null;
    const pct = ((current - previous) / previous) * 100;
    const up = pct >= 0;
    return (
      <span style={{ fontSize: 10, fontWeight: 600, color: up ? colours.green : colours.cta, marginLeft: 6 }}>
        {up ? '\u25B2' : '\u25BC'} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  // ===========================================================
  // IDLE
  // ===========================================================

  if (phase === 'idle') {
    return (
      <div style={panel}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: accent, marginBottom: 12 }}>
          Year-over-Year Comparison
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
          {[3, 4, 5].map(n => (
            <span key={n} style={pill(yearsBack === n)} onClick={() => setYearsBack(n)}>{n}y</span>
          ))}
          <span
            onClick={() => fetchData()}
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 16px', cursor: 'pointer',
              borderRadius: 0, background: dm ? colours.highlight : colours.helixBlue,
              color: '#fff', border: 'none', marginLeft: 4,
            }}
          >
            Load
          </span>
          <span style={{ fontSize: 10, color: muted, marginLeft: 4 }}>
            WIP {'\u00B7'} Collected {'\u00B7'} Matters {'\u2014'} {yearsBack} financial years, YTD to {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    );
  }

  // ===========================================================
  // LOADING
  // ===========================================================

  if (phase === 'loading') {
    return (
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner size={1} label="Querying comparison data..." />
        </div>
      </div>
    );
  }

  // ===========================================================
  // ERROR
  // ===========================================================

  if (phase === 'error') {
    return (
      <div style={panel}>
        <div style={{ fontSize: 12, color: colours.cta }}>{error}</div>
        <span style={{ fontSize: 10, color: muted, cursor: 'pointer', marginTop: 8, display: 'inline-block' }} onClick={() => fetchData()}>Retry</span>
      </div>
    );
  }

  if (!data) return null;
  const years = data.years;
  const anchorLabel = data.anchorDate ? new Date(data.anchorDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  const currentFY = years[years.length - 1];
  const prevFY = years.length > 1 ? years[years.length - 2] : null;

  // ===========================================================
  // LOADED
  // ===========================================================

  return (
    <div style={panel}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: accent }}>
          Year-over-Year{data.ytd && anchorLabel ? ` ${'\u00B7'} YTD to ${anchorLabel}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[3, 4, 5].map(n => (
            <span key={n} style={pill(yearsBack === n)} onClick={() => { setYearsBack(n); fetchData(n); }}>{n}y</span>
          ))}
          <span style={{ width: 1, height: 14, background: dm ? 'rgba(75,85,99,0.3)' : 'rgba(107,107,107,0.15)', margin: '0 2px' }} />
          <span style={pill(chartMode === 'combined')} onClick={() => setChartMode('combined')}>
            <Icon iconName="BarChart4" style={{ fontSize: 10, marginRight: 2 }} />Combined
          </span>
          <span style={pill(chartMode === 'split')} onClick={() => setChartMode('split')}>
            <Icon iconName="TripleColumn" style={{ fontSize: 10, marginRight: 2 }} />Split
          </span>
          <span style={{ width: 1, height: 14, background: dm ? 'rgba(75,85,99,0.3)' : 'rgba(107,107,107,0.15)', margin: '0 2px' }} />
          <span style={{ fontSize: 10, color: muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }} onClick={() => fetchData()} title="Refresh">
            <Icon iconName="Refresh" style={{ fontSize: 10 }} />
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' as const }}>
        {(['wip', 'collected', 'mattersOpened'] as MetricKey[]).map(mk => {
          const cfg = metrics[mk];
          const cur = mk === 'wip' ? currentFY.wip : mk === 'collected' ? currentFY.collected : currentFY.mattersOpened;
          const prev = prevFY ? (mk === 'wip' ? prevFY.wip : mk === 'collected' ? prevFY.collected : prevFY.mattersOpened) : 0;
          return (
            <div key={mk} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: cfg.colour }}>{cfg.shortLabel}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: dm ? colours.dark.text : colours.light.text }}>
                {mk === 'mattersOpened' ? fmtCount(cur) : fmtCurrency(cur)}
              </span>
              {prevFY && changeTag(cur, prev)}
            </div>
          );
        })}
        {hasGaps && (
          <span style={{ fontSize: 9, color: colours.orange, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Icon iconName="Warning" style={{ fontSize: 10 }} /> Some years have data gaps
          </span>
        )}
      </div>

      {/* Combined chart */}
      {chartMode === 'combined' && (
        <div style={{ background: cardBg, border: `0.5px solid ${cardBdr}`, borderRadius: 0, padding: '16px 12px 8px' }}>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedChartData} margin={{ top: 5, right: 12, left: 8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} vertical={false} />
                <XAxis dataKey="label" tick={{ ...tickStyle, fontWeight: 600, fontSize: 10 }} axisLine={{ stroke: axisLine }} tickLine={false} />
                <YAxis yAxisId="money" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={metrics.wip.format} width={55} />
                <YAxis yAxisId="count" orientation="right" tick={tickStyle} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 700, marginBottom: 3 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'mattersOpened') return [fmtCount(value), 'Matters'];
                    return [`${'\u00A3'}${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, name === 'wip' ? 'WIP' : 'Collected'];
                  }}
                  cursor={{ fill: dm ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.03)' }}
                />
                <Bar yAxisId="money" dataKey="wip" name="wip" fill={metrics.wip.colour} maxBarSize={28} cursor="pointer"
                  onClick={(_d: Record<string, unknown>, idx: number) => { const yr = years[idx]; if (yr) fetchMonthly(yr.fy, 'wip'); }} />
                <Bar yAxisId="money" dataKey="collected" name="collected" fill={metrics.collected.colour} maxBarSize={28} cursor="pointer"
                  onClick={(_d: Record<string, unknown>, idx: number) => { const yr = years[idx]; if (yr) fetchMonthly(yr.fy, 'collected'); }} />
                <Bar yAxisId="count" dataKey="mattersOpened" name="mattersOpened" fill={metrics.mattersOpened.colour} maxBarSize={28} cursor="pointer"
                  onClick={(_d: Record<string, unknown>, idx: number) => { const yr = years[idx]; if (yr) fetchMonthly(yr.fy, 'mattersOpened'); }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            {(['wip', 'collected', 'mattersOpened'] as MetricKey[]).map(mk => (
              <span key={mk} style={{ fontSize: 9, color: muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, background: metrics[mk].colour, display: 'inline-block' }} />
                {metrics[mk].shortLabel}
              </span>
            ))}
            <span style={{ fontSize: 9, color: muted }}>{'\u00B7'} Click a bar for monthly detail</span>
          </div>
        </div>
      )}

      {/* Split charts */}
      {chartMode === 'split' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
          {(['wip', 'collected', 'mattersOpened'] as MetricKey[]).map(metric => {
            const cfg = metrics[metric];
            const mData = years.map(yr => ({
              label: yr.label, fy: yr.fy,
              value: metric === 'wip' ? yr.wip : metric === 'collected' ? yr.collected : yr.mattersOpened,
              hasData: metric === 'wip' ? yr.dataAvailability.wip : metric === 'collected' ? yr.dataAvailability.collected : yr.dataAvailability.matters,
            }));
            return (
              <div key={metric} style={{ background: cardBg, border: `0.5px solid ${cardBdr}`, borderRadius: 0, padding: '14px 12px 8px', flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: cfg.colour, marginBottom: 10 }}>{cfg.label}</div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mData} margin={{ top: 5, right: 8, left: 4, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridLine} vertical={false} />
                      <XAxis dataKey="label" tick={{ ...tickStyle, fontWeight: 600 }} axisLine={{ stroke: axisLine }} tickLine={false} />
                      <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={cfg.format} width={50} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 700, marginBottom: 3 }}
                        formatter={(v: number) => metric === 'mattersOpened' ? [fmtCount(v), 'Matters'] : [`${'\u00A3'}${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, cfg.label]}
                        cursor={{ fill: dm ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.03)' }}
                      />
                      <Bar dataKey="value" maxBarSize={36} cursor="pointer"
                        onClick={(_d: Record<string, unknown>, idx: number) => { const yr = years[idx]; if (yr) fetchMonthly(yr.fy, metric); }}
                      >
                        {mData.map((entry, idx) => {
                          const isSelected = drillDown?.metric === metric;
                          return (
                            <Cell key={idx}
                              fill={entry.hasData ? cfg.colour : (dm ? 'rgba(75,85,99,0.15)' : 'rgba(107,107,107,0.08)')}
                              opacity={entry.hasData ? (0.5 + ((idx + 1) / mData.length) * 0.5) : 0.3}
                              stroke={isSelected ? accent : 'none'}
                              strokeWidth={isSelected ? 2 : 0}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drill-down */}
      {drillLoading && (
        <div style={{ marginTop: 12, padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={1} label="Loading monthly..." />
        </div>
      )}
      {drillDown && !drillLoading && (() => {
        const { metric, years: ddYears } = drillDown;
        const cfg = metrics[metric];
        // Build grouped data: one row per month, one key per FY year
        const MONTH_LABELS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
        const grouped = MONTH_LABELS.map((label, mi) => {
          const row: Record<string, unknown> = { label };
          ddYears.forEach(yr => {
            const pt = yr.months[mi];
            row[yr.fyLabel] = pt ? pt.value : 0;
          });
          return row;
        });
        // Opacity graduation: oldest year lightest, newest boldest
        const opacities = ddYears.map((_, i) => 0.35 + ((i + 1) / ddYears.length) * 0.65);

        return (
          <div style={{ marginTop: 12, background: cardBg, border: `0.5px solid ${cardBdr}`, borderRadius: 0, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: cfg.colour }}>
                {cfg.label}
                <span style={{ fontWeight: 600, color: bodyText, marginLeft: 6, textTransform: 'none' as const, letterSpacing: 0 }}>
                  Monthly comparison
                </span>
              </span>
              <span onClick={() => setDrillDown(null)} style={{ fontSize: 9, color: muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Icon iconName="ChromeClose" style={{ fontSize: 9 }} /> Close
              </span>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grouped} margin={{ top: 5, right: 12, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridLine} vertical={false} />
                  <XAxis dataKey="label" tick={{ ...tickStyle, fontWeight: 600 }} axisLine={{ stroke: axisLine }} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={cfg.format} width={50} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 700, marginBottom: 3 }}
                    formatter={(v: number, name: string) => {
                      const formatted = metric === 'mattersOpened' ? fmtCount(v) : fmtCurrency(v);
                      return [formatted, name];
                    }}
                    cursor={{ fill: dm ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.03)' }}
                  />
                  {ddYears.map((yr, yi) => (
                    <Bar key={yr.fy} dataKey={yr.fyLabel} fill={cfg.colour} opacity={opacities[yi]} maxBarSize={24} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend + totals */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' as const }}>
              {ddYears.map((yr, yi) => {
                const total = yr.months.reduce((s, m) => s + m.value, 0);
                return (
                  <span key={yr.fy} style={{ fontSize: 9, color: bodyText, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: cfg.colour, opacity: opacities[yi], display: 'inline-block' }} />
                    {yr.fyLabel}
                    <span style={{ fontWeight: 700, marginLeft: 2 }}>
                      {metric === 'mattersOpened' ? fmtCount(total) : fmtCurrency(total)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div style={{ fontSize: 8, color: muted, marginTop: 10, textAlign: 'right' as const }}>
        {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
      </div>
    </div>
  );
};

export default YearOverYearComparison;