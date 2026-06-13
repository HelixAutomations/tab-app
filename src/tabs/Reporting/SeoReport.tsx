/**
 * SeoReport: analytical GA4 + commercial cross-section.
 *
 * Data sources:
 *  - cachedGa4Data: daily rows from GET /api/marketing-metrics/ga4
 *  - useGa4Dimensions: GET /api/marketing-metrics/ga4/{channels|source-medium|landing-pages|devices|geo}
 *    (Organic-only toggle reuses each route's `organicOnly` flag.)
 *  - cachedEnquiries (Enquiry.Date_Created) and cachedAllMatters (Matter.OpenDate)
 *    for the "Performance vs commercial outcomes" cross-join.
 *
 * Layout parity with ReceptionReport: ReportShell toolbar + dashboard-kpi-summary
 * strip + vertically stacked ReportingSectionCards. No header strip, no coverage
 * card. Headline KPIs carry deltas vs the previous equal-length window.
 *
 * Cross-join caveat: GA4 conversions are not the same population as our
 * enquiries/matters. The cross-join section presents Sessions / Enquiries /
 * Matters indexed to day 1 = 100 as a triangulation view, not a per-session
 * attribution model.
 */

import React, { useMemo, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import type { Enquiry, Matter } from '../../app/functionality/types';
import ReportShell from './components/ReportShell';
import ReportingSectionCard from './components/ReportingSectionCard';
import { useReportRange, type DateRange, type RangeKey } from './hooks/useReportRange';
import { useGa4Dimensions } from './hooks/useGa4Dimensions';
import { getNormalizedEnquirySource } from '../../utils/enquirySource';
import './ManagementDashboard.css';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Ga4Row {
  date: string;
  sessions?: number;
  activeUsers?: number;
  screenPageViews?: number;
  bounceRate?: number;
  averageSessionDuration?: number;
  conversions?: number;
}

interface Ga4Envelope {
  date: string;
  googleAnalytics?: Ga4Row;
}

interface SeoReportProps {
  triggerRefresh?: () => void | Promise<void>;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
  cachedGa4Data?: Array<Ga4Row | Ga4Envelope> | null;
  cachedEnquiries?: Enquiry[] | null;
  cachedAllMatters?: Matter[] | null;
  initialRangeKey?: RangeKey;
  initialCustomDateRange?: DateRange | null;
}

type NormalisedRow = Ga4Row & { _date: Date };

// ─── Date / number helpers ────────────────────────────────────────────────

function parseGa4Date(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw);
  if (/^\d{8}$/.test(s)) {
    return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  }
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function normaliseRows(input: SeoReportProps['cachedGa4Data']): NormalisedRow[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      const inner = (row as Ga4Envelope)?.googleAnalytics ?? (row as Ga4Row);
      const dt = parseGa4Date(inner?.date ?? (row as { date?: unknown })?.date);
      if (!dt || !inner) return null;
      return { ...inner, _date: dt };
    })
    .filter((r): r is NormalisedRow => r !== null)
    .sort((a, b) => a._date.getTime() - b._date.getTime());
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('en-GB');
}

function formatPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(digits)}%`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function safeDiv(num: number, denom: number): number {
  return denom > 0 ? num / denom : NaN;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Aggregation ──────────────────────────────────────────────────────────

interface AggMetrics {
  sessions: number;
  users: number;
  pageViews: number;
  conversions: number;
  days: number;
  weightedBounce: number;
  weightedDuration: number;
  conversionRate: number;
  usersPerSession: number;
  viewsPerSession: number;
  sessionsPerDay: number;
}

function aggregate(rows: NormalisedRow[]): AggMetrics {
  const sessions = rows.reduce((s, r) => s + (r.sessions || 0), 0);
  const users = rows.reduce((s, r) => s + (r.activeUsers || 0), 0);
  const pageViews = rows.reduce((s, r) => s + (r.screenPageViews || 0), 0);
  const conversions = rows.reduce((s, r) => s + (r.conversions || 0), 0);
  const days = rows.length;
  const weightedBounce = sessions > 0
    ? rows.reduce((s, r) => s + (r.bounceRate || 0) * (r.sessions || 0), 0) / sessions
    : NaN;
  const weightedDuration = sessions > 0
    ? rows.reduce((s, r) => s + (r.averageSessionDuration || 0) * (r.sessions || 0), 0) / sessions
    : NaN;
  return {
    sessions, users, pageViews, conversions, days,
    weightedBounce, weightedDuration,
    conversionRate: safeDiv(conversions, sessions),
    usersPerSession: safeDiv(users, sessions),
    viewsPerSession: safeDiv(pageViews, sessions),
    sessionsPerDay: safeDiv(sessions, days),
  };
}

function deltaPct(current: number, prev: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return NaN;
  return (current - prev) / prev;
}

function renderDelta(value: number, opts: { invert?: boolean; isDarkMode: boolean }): React.ReactNode {
  if (!Number.isFinite(value)) {
    return <span style={{ fontSize: 11, opacity: 0.55 }}>no prior period</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  const good = opts.invert ? value < 0 : value > 0;
  const colour = flat
    ? (opts.isDarkMode ? colours.subtleGrey : colours.greyText)
    : good ? colours.green : colours.cta;
  const sign = value > 0 ? '+' : '';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: colour }}>
      <Icon
        iconName={flat ? 'StatusCircleRing' : up ? 'CaretUpSolid8' : 'CaretDownSolid8'}
        style={{ fontSize: 9, marginRight: 3 }}
      />
      {sign}{formatPercent(value, 1)} vs prev
    </span>
  );
}

// ─── KPI chip ─────────────────────────────────────────────────────────────

const summaryChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '12px 16px',
  borderRadius: 0,
  background: isDarkMode ? colours.darkBlue : '#ffffff',
  border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
  boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  textAlign: 'left',
  rowGap: 6,
  width: '100%',
});

const summaryChipLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  opacity: 0.65,
};

interface KpiChipProps {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  valueColour?: string;
  isDarkMode: boolean;
}

const KpiChip: React.FC<KpiChipProps> = ({ label, value, meta, valueColour, isDarkMode }) => (
  <div className="summary-chip" style={summaryChipStyle(isDarkMode)}>
    <span style={summaryChipLabelStyle}>{label}</span>
    <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: valueColour ?? (isDarkMode ? colours.dark.text : colours.light.text) }}>{value}</span>
    {meta && <span style={{ fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>{meta}</span>}
  </div>
);

// ─── Trend chart: sessions line + conversions bars ────────────────────────

const OverlayChart: React.FC<{ rows: NormalisedRow[]; height?: number; isDarkMode: boolean; }> = ({ rows, height = 140, isDarkMode }) => {
  if (rows.length < 2) return null;
  const width = 720;
  const sessions = rows.map((r) => r.sessions || 0);
  const conversions = rows.map((r) => r.conversions || 0);
  const sMax = Math.max(...sessions, 1);
  const cMax = Math.max(...conversions, 1);
  const stepX = width / (rows.length - 1);
  const padTop = 6;
  const padBot = 18;
  const inner = height - padTop - padBot;

  const pts = sessions.map((v, i) => {
    const x = i * stepX;
    const y = padTop + (1 - v / sMax) * inner;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const sessionLine = `M ${pts.join(' L ')}`;
  const sessionArea = `${sessionLine} L ${width.toFixed(1)},${(height - padBot).toFixed(1)} L 0,${(height - padBot).toFixed(1)} Z`;

  const barWidth = Math.max(2, stepX * 0.55);
  const sessionColour = colours.highlight;
  const sessionFill = isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)';
  const conversionColour = colours.cta;
  const gridColour = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6, 23, 51, 0.06)';
  const axisLabel = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        <span style={{ color: sessionColour }}>Sessions max {formatNumber(sMax)}</span>
        <span style={{ color: conversionColour }}>Conversions max {formatNumber(cMax)}</span>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Sessions and conversions trend"
        style={{ display: 'block' }}
      >
        <line x1={0} y1={height - padBot} x2={width} y2={height - padBot} stroke={gridColour} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {conversions.map((c, i) => {
          const h = c > 0 ? (c / cMax) * inner : 0;
          const x = i * stepX - barWidth / 2;
          const y = height - padBot - h;
          return <rect key={i} x={x} y={y} width={barWidth} height={h} fill={conversionColour} opacity={0.55} />;
        })}
        <path d={sessionArea} fill={sessionFill} />
        <path d={sessionLine} fill="none" stroke={sessionColour} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

// ─── Indexed comparison chart (sessions vs enquiries vs matters) ──────────

const IndexedChart: React.FC<{
  series: { label: string; colour: string; daily: Record<string, number>; dash?: string }[];
  dayKeys: string[];
  height?: number;
  isDarkMode: boolean;
}> = ({ series, dayKeys, height = 160, isDarkMode }) => {
  if (dayKeys.length < 2) return null;
  const width = 720;
  const indexed = series.map((s) => {
    const raw = dayKeys.map((k) => s.daily[k] || 0);
    let cum = 0;
    const cumArr = raw.map((v) => (cum += v));
    const firstNon = cumArr.find((v) => v > 0) ?? 0;
    return { ...s, points: firstNon > 0 ? cumArr.map((v) => (v / firstNon) * 100) : cumArr.map(() => 100) };
  });

  const allPoints = indexed.flatMap((s) => s.points);
  const max = Math.max(...allPoints, 100);
  const min = Math.min(...allPoints, 100);
  const range = max - min || 1;
  const stepX = width / (dayKeys.length - 1);
  const padTop = 10;
  const padBot = 22;
  const inner = height - padTop - padBot;
  const gridColour = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6, 23, 51, 0.06)';
  const axisLabel = isDarkMode ? colours.subtleGrey : colours.greyText;

  const yFor100 = padTop + (1 - (100 - min) / range) * inner;
  const baselinePct = (yFor100 / height) * 100;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Sessions vs enquiries vs matters, indexed to day 1 = 100"
        style={{ display: 'block' }}
      >
        <line x1={0} y1={height - padBot} x2={width} y2={height - padBot} stroke={gridColour} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={yFor100} x2={width} y2={yFor100} stroke={gridColour} strokeDasharray="2 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {indexed.map((s) => {
          const path = s.points.map((v, i) => {
            const x = i * stepX;
            const y = padTop + (1 - (v - min) / range) * inner;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ');
          return <path key={s.label} d={path} fill="none" stroke={s.colour} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <span
        style={{
          position: 'absolute',
          left: 4,
          top: `calc(${baselinePct.toFixed(2)}% - 14px)`,
          fontSize: 10,
          color: axisLabel,
          pointerEvents: 'none',
          fontWeight: 600,
        }}
      >
        = 100 (day 1)
      </span>
    </div>
  );
};

// ─── Dimension table with bar-in-cell ─────────────────────────────────────

type SortDir = 'asc' | 'desc';

interface DimensionTableProps<R> {
  rows: R[];
  totalSessions: number;
  nameColumn: { header: string; get: (r: R) => string };
  numericColumns: Array<{
    key: string;
    header: string;
    get: (r: R) => number;
    format?: (v: number) => string;
    bar?: boolean;
  }>;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  topN?: number;
  isDarkMode: boolean;
  emptyMessage?: string;
}

function DimensionTable<R>({
  rows, totalSessions, nameColumn, numericColumns,
  defaultSortKey, defaultSortDir = 'desc', topN = 25, isDarkMode,
  emptyMessage = 'No data for the selected range.',
}: DimensionTableProps<R>) {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? numericColumns[0]?.key ?? '');
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const sorted = useMemo(() => {
    const col = numericColumns.find((c) => c.key === sortKey);
    if (!col) return rows.slice(0, topN);
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const aSafe = Number.isFinite(av) ? av : -Infinity;
      const bSafe = Number.isFinite(bv) ? bv : -Infinity;
      return sortDir === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
    return copy.slice(0, topN);
  }, [rows, sortKey, sortDir, numericColumns, topN]);

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText, padding: '6px 0' }}>
        {emptyMessage}
      </div>
    );
  }

  const headerColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6, 23, 51, 0.06)';
  const barBg = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.10)';
  const cellColour = isDarkMode ? colours.dark.text : colours.light.text;

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'Raleway, sans-serif', color: cellColour }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${rowBorder}` }}>
            <th style={{ textAlign: 'left', padding: '8px 8px', color: headerColour, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{nameColumn.header}</th>
            {numericColumns.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                style={{
                  textAlign: 'right', padding: '8px 8px', color: headerColour,
                  fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                {c.header}
                {sortKey === c.key && (
                  <Icon iconName={sortDir === 'asc' ? 'SortUp' : 'SortDown'} style={{ fontSize: 9, marginLeft: 4 }} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const barCol = numericColumns.find((c) => c.bar);
            const barVal = barCol ? barCol.get(r) : 0;
            const share = totalSessions > 0 ? barVal / totalSessions : 0;
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${rowBorder}` }}>
                <td style={{ padding: '8px 8px', position: 'relative', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nameColumn.get(r)}>
                  {barCol && share > 0 && (
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(share * 100, 100)}%`, background: barBg, pointerEvents: 'none' }} />
                  )}
                  <span style={{ position: 'relative' }}>{nameColumn.get(r) || '(not set)'}</span>
                </td>
                {numericColumns.map((c) => {
                  const v = c.get(r);
                  return (
                    <td key={c.key} style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.format ? c.format(v) : formatNumber(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > topN && (
        <div style={{ marginTop: 6, fontSize: 11, color: headerColour }}>
          Showing top {topN} of {rows.length}.
        </div>
      )}
    </div>
  );
}

// ─── Devices usage strip ──────────────────────────────────────────────────

const DEVICE_COLOURS: Record<string, string> = {
  desktop: colours.highlight,
  mobile: colours.cta,
  tablet: colours.orange,
};

const DeviceBar: React.FC<{
  devices: Array<{ device: string; sessions: number; conversions: number }>;
  isDarkMode: boolean;
  loading?: boolean;
}> = ({ devices, isDarkMode, loading = false }) => {
  const total = devices.reduce((s, d) => s + d.sessions, 0);
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderColour = isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.10)';
  const trackColour = isDarkMode ? colours.dark.cardBackground : colours.light.inputBackground;
  const sorted = [...devices].sort((a, b) => b.sessions - a.sessions);
  const skeletonRows = ['desktop', 'mobile', 'tablet'];
  const showSkeleton = loading && total === 0;
  const visibleRows = showSkeleton
    ? skeletonRows.map((device) => ({ device, sessions: 0, conversions: 0 }))
    : sorted;
  const hasDeviceData = total > 0 && !showSkeleton;
  return (
    <div
      data-helix-region="reports/seo/device-usage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '8px 2px 9px',
        borderTop: `0.5px solid ${borderColour}`,
        borderBottom: `0.5px solid ${borderColour}`,
      }}
    >
      <style>{`
        @keyframes seo-device-segment-fill {
          0% { transform: scaleX(0); opacity: 0.48; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes seo-device-value-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: textColour, fontWeight: 800 }}>
          Devices
        </span>
        {showSkeleton ? (
          <span className="skeleton-shimmer" style={{ display: 'inline-block', width: 148, height: 12 }} />
        ) : (
          <span style={{ fontSize: 11, color: mutedColour, fontVariantNumeric: 'tabular-nums' }}>
            {total > 0 ? `${formatNumber(total)} sessions by device` : 'No device data yet'}
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={total > 0 ? `${formatNumber(total)} sessions by device` : 'Device mix pending'}
        style={{ display: 'flex', gap: 2, height: 10, backgroundColor: trackColour, overflow: 'hidden' }}
      >
        {showSkeleton ? (
          [58, 34, 8].map((width, index) => (
            <span
              key={width}
              className="skeleton-shimmer"
              style={{ display: 'block', flex: `0 0 ${width}%`, height: '100%', opacity: 0.8 - index * 0.12 }}
            />
          ))
        ) : hasDeviceData ? (
          visibleRows.map((d, index) => {
            const pct = (d.sessions / total) * 100;
            if (pct <= 0) return null;
            const colour = DEVICE_COLOURS[(d.device || '').toLowerCase()] || colours.greyText;
            return (
              <span
                key={`${d.device}-${d.sessions}`}
                title={`${d.device || 'Unknown'}: ${formatNumber(d.sessions)} sessions (${pct.toFixed(1)}%)`}
                style={{
                  display: 'block',
                  flex: `0 0 ${Math.max(pct, 1)}%`,
                  height: '100%',
                  backgroundColor: colour,
                  transformOrigin: 'left center',
                  animation: `seo-device-segment-fill 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${0.08 + index * 0.06}s both`,
                }}
              />
            );
          })
        ) : null}
      </div>
      <div role="list" aria-label="Sessions by device" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', alignItems: 'center', gap: 8, minHeight: 18 }}>
        {showSkeleton ? (
          skeletonRows.map((device, index) => (
            <span key={device} role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span className="skeleton-shimmer" style={{ display: 'inline-block', width: 7, height: 7, flex: '0 0 auto' }} />
              <span className="skeleton-shimmer" style={{ display: 'inline-block', width: index === 0 ? 128 : index === 1 ? 116 : 96, maxWidth: '100%', height: 11 }} />
            </span>
          ))
        ) : hasDeviceData ? (
          visibleRows.map((d, index) => {
            const pct = (d.sessions / total) * 100;
            const colour = DEVICE_COLOURS[(d.device || '').toLowerCase()] || colours.greyText;
            return (
              <span
                key={`${d.device}-${d.sessions}-label`}
                role="listitem"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  minWidth: 0,
                  fontSize: 11,
                  color: mutedColour,
                  animation: `seo-device-value-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${0.12 + index * 0.06}s both`,
                }}
              >
                <span style={{ width: 7, height: 7, backgroundColor: colour, display: 'inline-block', flex: '0 0 auto' }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 800, color: textColour, textTransform: 'capitalize' }}>{d.device || 'Unknown'}</span>{' '}
                  <span style={{ fontWeight: 800, color: textColour, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(d.sessions)}</span>{' '}
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>({pct.toFixed(1)}%)</span>
                </span>
              </span>
            );
          })
        ) : (
          <span style={{ fontSize: 11, color: mutedColour }}>
            Device mix will appear once GA4 dimension data lands.
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────

const SeoReport: React.FC<SeoReportProps> = ({
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false,
  cachedGa4Data = [],
  cachedEnquiries = [],
  cachedAllMatters = [],
  initialRangeKey = 'last90Days',
  initialCustomDateRange = null,
}) => {
  const { isDarkMode } = useTheme();
  const range = useReportRange({ defaultKey: initialRangeKey, defaultCustomDateRange: initialCustomDateRange ?? undefined });
  const [organicOnly, setOrganicOnly] = useState<boolean>(false);
  const [dimensionTab, setDimensionTab] = useState<'channels' | 'sourceMedium' | 'landingPages' | 'geo'>('channels');

  const rows = useMemo(() => normaliseRows(cachedGa4Data), [cachedGa4Data]);

  const rowCoverage = useMemo(() => {
    if (rows.length === 0) return null;
    let start = rows[0]._date;
    let end = rows[0]._date;
    rows.forEach((row) => {
      if (row._date < start) start = row._date;
      if (row._date > end) end = row._date;
    });
    const coverageStart = new Date(start);
    coverageStart.setHours(0, 0, 0, 0);
    const coverageEnd = new Date(end);
    coverageEnd.setHours(23, 59, 59, 999);
    return { start: coverageStart, end: coverageEnd };
  }, [rows]);

  const isPresetAvailable = useCallback(
    (_key: RangeKey, candidateRange: DateRange | null) => {
      if (!candidateRange || !rowCoverage) return true;
      return candidateRange.start >= rowCoverage.start && candidateRange.end <= rowCoverage.end;
    },
    [rowCoverage],
  );

  const { filtered, previous } = useMemo(() => {
    if (!range.range) return { filtered: rows, previous: [] as NormalisedRow[] };
    const { start, end } = range.range;
    const cur = rows.filter((r) => r._date >= start && r._date <= end);
    const lenMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start.getTime() - 1 - lenMs);
    const prev = rows.filter((r) => r._date >= prevStart && r._date <= prevEnd);
    return { filtered: cur, previous: prev };
  }, [rows, range.range]);

  const metrics = useMemo(() => aggregate(filtered), [filtered]);
  const prevMetrics = useMemo(() => aggregate(previous), [previous]);

  const dims = useGa4Dimensions({ range: range.range, organicOnly, enabled: true });

  const hasData = filtered.length > 0;
  const hasAnyData = rows.length > 0;
  const totalSessionsCh = useMemo(() => dims.channels.reduce((s, c) => s + c.sessions, 0), [dims.channels]);
  const totalSessionsSm = useMemo(() => dims.sourceMedium.reduce((s, c) => s + c.sessions, 0), [dims.sourceMedium]);
  const totalSessionsLp = useMemo(() => dims.landingPages.reduce((s, c) => s + c.sessions, 0), [dims.landingPages]);
  const totalSessionsGeo = useMemo(() => dims.geo.reduce((s, c) => s + c.sessions, 0), [dims.geo]);

  const crossJoin = useMemo(() => {
    if (!range.range) {
      return {
        enquiriesInWindow: 0,
        mattersInWindow: 0,
        dayKeys: [] as string[],
        sessionsByDay: {} as Record<string, number>,
        enquiriesByDay: {} as Record<string, number>,
        organicEnquiriesByDay: {} as Record<string, number>,
        mattersByDay: {} as Record<string, number>,
        enquirySourceMix: [] as Array<{ key: string; label: string; count: number; isDigital: boolean }>,
        digitalEnquiries: 0,
        organicEnquiries: 0,
      };
    }
    const { start, end } = range.range;
    const sessionsByDay: Record<string, number> = {};
    filtered.forEach((r) => {
      const k = dayKey(r._date);
      sessionsByDay[k] = (sessionsByDay[k] || 0) + (r.sessions || 0);
    });

    const enquiriesByDay: Record<string, number> = {};
    const organicEnquiriesByDay: Record<string, number> = {};
    const sourceCounts = new Map<string, { label: string; count: number }>();
    const DIGITAL_KEYS = new Set(['organic', 'google_ads', 'meta_ads', 'chatgpt']);
    let enquiriesInWindow = 0;
    let digitalEnquiries = 0;
    let organicEnquiries = 0;
    (cachedEnquiries || []).forEach((e) => {
      const raw = e?.Date_Created ?? e?.Touchpoint_Date ?? (e as any).datetime ?? (e as any).date_created;
      if (!raw) return;
      const d = new Date(raw);
      if (!Number.isFinite(d.getTime())) return;
      if (d < start || d > end) return;
      enquiriesInWindow += 1;
      const k = dayKey(d);
      enquiriesByDay[k] = (enquiriesByDay[k] || 0) + 1;
      const src = getNormalizedEnquirySource(e);
      const bucketKey = DIGITAL_KEYS.has(src.key) ? src.key : (src.key.startsWith('referral') ? 'referral' : (src.key || 'not_recorded'));
      const bucketLabel = DIGITAL_KEYS.has(src.key) ? src.label : (src.key.startsWith('referral') ? 'Referral' : src.label);
      const entry = sourceCounts.get(bucketKey) || { label: bucketLabel, count: 0 };
      entry.count += 1;
      sourceCounts.set(bucketKey, entry);
      if (DIGITAL_KEYS.has(src.key)) digitalEnquiries += 1;
      if (src.key === 'organic') {
        organicEnquiries += 1;
        organicEnquiriesByDay[k] = (organicEnquiriesByDay[k] || 0) + 1;
      }
    });
    const enquirySourceMix = Array.from(sourceCounts.entries())
      .map(([key, v]) => ({ key, label: v.label, count: v.count, isDigital: DIGITAL_KEYS.has(key) }))
      .sort((a, b) => b.count - a.count);

    const mattersByDay: Record<string, number> = {};
    let mattersInWindow = 0;
    (cachedAllMatters || []).forEach((m) => {
      const raw = m?.OpenDate;
      if (!raw) return;
      const d = new Date(raw);
      if (!Number.isFinite(d.getTime())) return;
      if (d < start || d > end) return;
      mattersInWindow += 1;
      const k = dayKey(d);
      mattersByDay[k] = (mattersByDay[k] || 0) + 1;
    });

    const dayKeys: string[] = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cur <= last) {
      dayKeys.push(dayKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return { enquiriesInWindow, mattersInWindow, dayKeys, sessionsByDay, enquiriesByDay, organicEnquiriesByDay, mattersByDay, enquirySourceMix, digitalEnquiries, organicEnquiries };
  }, [range.range, filtered, cachedEnquiries, cachedAllMatters]);

  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textHelp = isDarkMode ? colours.subtleGrey : colours.greyText;

  const handleRefresh = () => {
    if (isFetching) return;
    if (triggerRefresh) void triggerRefresh();
    dims.refresh();
  };

  const organicToggle = (
    <button
      type="button"
      onClick={() => setOrganicOnly((v) => !v)}
      className="filter-icon-button filter-tool-button toolbar-control"
      title={organicOnly ? 'Showing organic search only. Click to include all channels.' : 'Showing all channels. Click to limit to organic search.'}
      aria-pressed={organicOnly}
      style={{
        background: organicOnly ? (isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.10)') : undefined,
        borderColor: organicOnly ? colours.highlight : undefined,
        color: organicOnly ? colours.highlight : undefined,
      }}
    >
      <Icon iconName={organicOnly ? 'CheckMark' : 'Search'} style={{ fontSize: 14 }} />
      <span className="filter-tool-button__label">{organicOnly ? 'Organic only' : 'All channels'}</span>
    </button>
  );

  const renderKpiStrip = () => {
    const dSessions = deltaPct(metrics.sessions, prevMetrics.sessions);
    const dUsers = deltaPct(metrics.users, prevMetrics.users);
    const dViews = deltaPct(metrics.pageViews, prevMetrics.pageViews);
    const dConv = deltaPct(metrics.conversions, prevMetrics.conversions);
    const dCvr = deltaPct(metrics.conversionRate, prevMetrics.conversionRate);
    const dBounce = deltaPct(metrics.weightedBounce, prevMetrics.weightedBounce);
    return (
      <div
        className="dashboard-kpi-summary"
        role="list"
        aria-label="SEO KPIs"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}
      >
        <KpiChip isDarkMode={isDarkMode} label="Sessions" value={formatNumber(metrics.sessions)} meta={renderDelta(dSessions, { isDarkMode })} />
        <KpiChip isDarkMode={isDarkMode} label="Active users" value={formatNumber(metrics.users)} meta={renderDelta(dUsers, { isDarkMode })} />
        <KpiChip isDarkMode={isDarkMode} label="Page views" value={formatNumber(metrics.pageViews)} meta={renderDelta(dViews, { isDarkMode })} />
        <KpiChip isDarkMode={isDarkMode} label="Conversions" value={formatNumber(metrics.conversions)} valueColour={colours.highlight} meta={renderDelta(dConv, { isDarkMode })} />
        <KpiChip isDarkMode={isDarkMode} label="Conv. rate" value={formatPercent(metrics.conversionRate)} meta={renderDelta(dCvr, { isDarkMode })} />
        <KpiChip isDarkMode={isDarkMode} label="Bounce rate" value={formatPercent(metrics.weightedBounce)} meta={renderDelta(dBounce, { isDarkMode, invert: true })} />
      </div>
    );
  };

  const sectionLoadingBadge = dims.loading ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: textHelp }}>
      <Spinner size={SpinnerSize.xSmall} /> loading
    </span>
  ) : undefined;

  return (
    <ReportShell
      range={range}
      isFetching={isFetching || dims.loading}
      lastRefreshTimestamp={lastRefreshTimestamp}
      onRefresh={triggerRefresh ? handleRefresh : undefined}
      isPresetAvailable={isPresetAvailable}
      toolbarExtras={organicToggle}
      toolbarDensity="compact"
      allowAllRange={false}
    >
      <div
        data-helix-region="reports/seo"
        style={{
          // order: 2 keeps this content beneath the ReportShell filter-toolbar
          // (order 1) inside the management-dashboard-container flex parent.
          order: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontFamily: 'Raleway, sans-serif',
          color: textPrimary,
        }}
      >
        <DeviceBar isDarkMode={isDarkMode} devices={dims.devices} loading={isFetching || dims.loading} />

        {!hasData && !isFetching && !dims.loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
              background: isDarkMode ? 'rgba(10, 28, 50, 0.6)' : '#ffffff',
              color: textBody,
              fontSize: 12,
            }}
          >
            <Icon iconName="Info" style={{ fontSize: 14, color: colours.highlight }} />
            <span>
              {hasAnyData
                ? 'No GA4 rows fall inside the selected range. Try a wider preset, or hit Refresh in the toolbar to pull a longer window.'
                : 'No GA4 data cached yet. Hit Refresh in the toolbar to pull the latest 90 days.'}
            </span>
          </div>
        )}

        <ReportingSectionCard
          id="seo-trend"
          title="Sessions and conversions"
          animationDelay={0.05}
        >
          {filtered.length > 1 ? (
            <div data-helix-region="reports/seo/trend" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <OverlayChart rows={filtered} isDarkMode={isDarkMode} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textHelp }}>
                <span>{filtered[0]?._date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                <span>{metrics.days} day{metrics.days === 1 ? '' : 's'} in range</span>
                <span>{filtered[filtered.length - 1]?._date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              </div>
              {renderKpiStrip()}
              {metrics.conversions === 0 && (
                <div style={{ fontSize: 11, color: textHelp }}>
                  No conversions recorded for this window. Check key events are configured in GA4 (Admin &gt; Events &gt; mark as key event).
                </div>
              )}
            </div>
          ) : isFetching || dims.loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', color: textBody, fontSize: 12 }}>
              <Spinner size={SpinnerSize.xSmall} />
              <span>Loading GA4 trend...</span>
            </div>
          ) : !hasAnyData ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', color: textBody, fontSize: 12 }}>
              <Icon iconName="Info" style={{ fontSize: 14, color: colours.highlight }} />
              No GA4 data cached yet. Hit Refresh in the toolbar to pull the latest 90 days.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', color: textBody, fontSize: 12 }}>
              <Icon iconName="Info" style={{ fontSize: 14, color: colours.highlight }} />
              Not enough days in the selected range to draw a trend. Try a wider preset from the toolbar.
            </div>
          )}
        </ReportingSectionCard>

        <ReportingSectionCard
          id="seo-cross-join"
          title="SEO traffic and organic enquiries"
          animationDelay={0.08}
        >
          <div data-helix-region="reports/seo/cross-join" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {crossJoin.dayKeys.length > 1 ? (
              <>
                <IndexedChart
                  isDarkMode={isDarkMode}
                  dayKeys={crossJoin.dayKeys}
                  series={[
                    { label: 'Sessions', colour: colours.highlight, daily: crossJoin.sessionsByDay },
                    { label: 'Organic enquiries', colour: colours.highlight, daily: crossJoin.organicEnquiriesByDay, dash: '5 3' },
                  ]}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <KpiChip isDarkMode={isDarkMode} label="Sessions" value={formatNumber(metrics.sessions)} />
                  <KpiChip isDarkMode={isDarkMode} label="Unique users" value={formatNumber(metrics.users)} />
                  <KpiChip isDarkMode={isDarkMode} label="Organic enquiries" value={formatNumber(crossJoin.organicEnquiries)} valueColour={colours.highlight} />
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: textBody, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 2, background: colours.highlight, display: 'inline-block' }} /> Sessions
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 0, borderTop: `2px dashed ${colours.highlight}`, display: 'inline-block' }} /> Organic enquiries
                  </span>
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KpiChip isDarkMode={isDarkMode} label="Sessions" value={formatNumber(metrics.sessions)} />
                <KpiChip isDarkMode={isDarkMode} label="Unique users" value={formatNumber(metrics.users)} />
                <KpiChip isDarkMode={isDarkMode} label="Organic enquiries" value={formatNumber(crossJoin.organicEnquiries)} valueColour={colours.highlight} />
              </div>
            )}
          </div>
        </ReportingSectionCard>

        <ReportingSectionCard
          id="seo-dimensions"
          title="Audience breakdown"
          subtitle={organicOnly
            ? 'Organic search only. Switch tabs to slice the same window by channel, source, landing page, or country.'
            : 'Slice the same window by channel, source, landing page, or country.'}
          animationDelay={0.10}
          actions={sectionLoadingBadge}
        >
          {(() => {
            const tabs: Array<{
              key: typeof dimensionTab;
              label: string;
              count: number;
            }> = [
              { key: 'channels', label: 'Channels', count: dims.channels.length },
              { key: 'sourceMedium', label: 'Source / medium', count: dims.sourceMedium.length },
              { key: 'landingPages', label: 'Landing pages', count: dims.landingPages.length },
              { key: 'geo', label: 'Geography', count: dims.geo.length },
            ];
            const tabBarBorder = isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.10)';
            return (
              <div data-helix-region="reports/seo/dimensions" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  role="tablist"
                  aria-label="Audience breakdown tabs"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0,
                    borderBottom: `1px solid ${tabBarBorder}`,
                  }}
                >
                  {tabs.map((t) => {
                    const active = dimensionTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDimensionTab(t.key)}
                        style={{
                          appearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: `2px solid ${active ? colours.highlight : 'transparent'}`,
                          padding: '8px 14px',
                          marginBottom: -1,
                          cursor: 'pointer',
                          fontFamily: 'Raleway, sans-serif',
                          fontSize: 12,
                          fontWeight: active ? 700 : 600,
                          letterSpacing: '0.02em',
                          color: active
                            ? colours.highlight
                            : (isDarkMode ? colours.dark.text : colours.light.text),
                          transition: 'color 0.15s ease, border-color 0.15s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {t.label}
                        {t.count > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 0,
                              background: active
                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)')
                                : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6, 23, 51, 0.06)'),
                              color: active ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText),
                            }}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {dimensionTab === 'channels' && (
                  <DimensionTable
                    isDarkMode={isDarkMode}
                    rows={dims.channels}
                    totalSessions={totalSessionsCh}
                    nameColumn={{ header: 'Channel', get: (r) => r.channel }}
                    numericColumns={[
                      { key: 'sessions', header: 'Sessions', get: (r) => r.sessions, bar: true },
                      { key: 'share', header: 'Share', get: (r) => safeDiv(r.sessions, totalSessionsCh), format: (v) => formatPercent(v) },
                      { key: 'conversions', header: 'Conv.', get: (r) => r.conversions },
                      { key: 'cvr', header: 'Conv. rate', get: (r) => safeDiv(r.conversions, r.sessions), format: (v) => formatPercent(v) },
                    ]}
                    defaultSortKey="sessions"
                    topN={25}
                    emptyMessage={dims.error ? `Failed to load channels: ${dims.error}` : 'No channel data for the selected range.'}
                  />
                )}

                {dimensionTab === 'sourceMedium' && (
                  <DimensionTable
                    isDarkMode={isDarkMode}
                    rows={dims.sourceMedium}
                    totalSessions={totalSessionsSm}
                    nameColumn={{ header: 'Source / medium', get: (r) => r.sourceMedium }}
                    numericColumns={[
                      { key: 'sessions', header: 'Sessions', get: (r) => r.sessions, bar: true },
                      { key: 'share', header: 'Share', get: (r) => safeDiv(r.sessions, totalSessionsSm), format: (v) => formatPercent(v) },
                      { key: 'conversions', header: 'Conv.', get: (r) => r.conversions },
                      { key: 'cvr', header: 'Conv. rate', get: (r) => safeDiv(r.conversions, r.sessions), format: (v) => formatPercent(v) },
                    ]}
                    defaultSortKey="sessions"
                    topN={25}
                    emptyMessage={dims.error ? `Failed to load source/medium: ${dims.error}` : 'No source/medium data for the selected range.'}
                  />
                )}

                {dimensionTab === 'landingPages' && (
                  <DimensionTable
                    isDarkMode={isDarkMode}
                    rows={dims.landingPages}
                    totalSessions={totalSessionsLp}
                    nameColumn={{ header: 'Landing page', get: (r) => r.landingPage }}
                    numericColumns={[
                      { key: 'sessions', header: 'Sessions', get: (r) => r.sessions, bar: true },
                      { key: 'share', header: 'Share', get: (r) => safeDiv(r.sessions, totalSessionsLp), format: (v) => formatPercent(v) },
                      { key: 'conversions', header: 'Conv.', get: (r) => r.conversions },
                      { key: 'cvr', header: 'Conv. rate', get: (r) => safeDiv(r.conversions, r.sessions), format: (v) => formatPercent(v) },
                    ]}
                    defaultSortKey="sessions"
                    topN={25}
                    emptyMessage={dims.error ? `Failed to load landing pages: ${dims.error}` : 'No landing-page data for the selected range.'}
                  />
                )}

                {dimensionTab === 'geo' && (
                  <DimensionTable
                    isDarkMode={isDarkMode}
                    rows={dims.geo}
                    totalSessions={totalSessionsGeo}
                    nameColumn={{ header: 'Country', get: (r) => r.country }}
                    numericColumns={[
                      { key: 'sessions', header: 'Sessions', get: (r) => r.sessions, bar: true },
                      { key: 'share', header: 'Share', get: (r) => safeDiv(r.sessions, totalSessionsGeo), format: (v) => formatPercent(v) },
                      { key: 'conversions', header: 'Conv.', get: (r) => r.conversions },
                      { key: 'cvr', header: 'Conv. rate', get: (r) => safeDiv(r.conversions, r.sessions), format: (v) => formatPercent(v) },
                    ]}
                    defaultSortKey="sessions"
                    topN={10}
                    emptyMessage={dims.error ? `Failed to load geo: ${dims.error}` : 'No geo data for the selected range.'}
                  />
                )}
              </div>
            );
          })()}
        </ReportingSectionCard>

        <div style={{ fontSize: 11, color: textHelp, padding: '4px 2px 0' }}>
          Avg session length in range: {formatDuration(metrics.weightedDuration)} (session-weighted).
        </div>
      </div>
    </ReportShell>
  );
};

export default React.memo(SeoReport);
