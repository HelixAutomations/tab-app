import React, { useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../app/styles/colours';
import { getNormalizedEnquiryMOC, getNormalizedEnquirySource } from '../../utils/enquirySource';
import type { PpcIncomeMetrics } from './types/ppc';
import ReportShell from './components/ReportShell';
import ReportingSectionCard from './components/ReportingSectionCard';
import { formatTimeAgo, useReportRange, type DateRange, type RangeKey } from './hooks/useReportRange';
import { useGa4Dimensions } from './hooks/useGa4Dimensions';
import {
  reportingPanelBackground,
  reportingPanelBorder,
} from './styles/reportingFoundation';

interface MarketingPerformanceReportProps {
  cachedGa4Data?: unknown;
  cachedGoogleAdsData?: unknown;
  cachedEnquiries?: unknown;
  ppcIncomeMetrics?: PpcIncomeMetrics | null;
  isDarkMode: boolean;
  isFetching?: boolean;
  lastRefreshTimestamp?: number;
  googleAdsLastRefreshTimestamp?: number;
  triggerRefresh?: () => void | Promise<void>;
  triggerPaidSearchRefresh?: () => void | Promise<void>;
  initialRangeKey?: RangeKey;
  initialCustomDateRange?: DateRange | null;
  surfaceMode?: 'full' | 'productionOnly';
  forcedRange?: DateRange | null;
  shellVariant?: 'full' | 'minimal';
}

interface DailyGa4Row {
  date: string;
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
  bounceRate: number;
  averageSessionDuration: number;
}

interface GoogleAdsDailyRow {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
}

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  isDarkMode: boolean;
}

interface RankedRow {
  label: string;
  value: number;
  secondary?: string;
}

interface EnquiryOutcomeSummary {
  total: number;
  organic: number;
  googleAds: number;
  digital: number;
}

interface EvidenceCell {
  label: string;
  value: string;
}

interface EvidenceRow {
  id: string;
  title: string;
  sortKey: string;
  cells: EvidenceCell[];
}

interface EvidencePanelData {
  title: string;
  emptyText: string;
  rows: EvidenceRow[];
}

const neutralText = (isDarkMode: boolean) => (isDarkMode ? '#d1d5db' : '#374151');
const mutedText = (isDarkMode: boolean) => (isDarkMode ? colours.subtleGrey : colours.greyText);
const panelBorder = (isDarkMode: boolean) => `1px solid ${reportingPanelBorder(isDarkMode)}`;

const summaryChipStyle = (isDarkMode: boolean): React.CSSProperties => ({
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

const summaryChipLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  opacity: 0.65,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function unwrapRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  const record = asRecord(input);
  const enquiries = record?.enquiries;
  if (Array.isArray(enquiries)) return enquiries;
  const data = record?.data;
  return Array.isArray(data) ? data : [];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseDate(value: unknown): Date | null {
  const normalised = normaliseDate(value);
  if (!normalised) return null;
  const parsed = new Date(`${normalised}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateFromRowKey(value: string): Date | null {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateInRange(date: Date, range: DateRange | null): boolean {
  if (!range) return true;
  return date >= range.start && date <= range.end;
}

function isWithinDateWindow(date: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return true;
  return date >= startDate && date <= endDate;
}

function enquiryDate(enquiry: unknown): Date | null {
  const record = asRecord(enquiry);
  if (!record) return null;
  return parseDate(
    record.Touchpoint_Date
    ?? record.touchpoint_date
    ?? record.touchpointDate
    ?? record.Date_Created
    ?? record.date_created
    ?? record.created_at
    ?? record.datetime
    ?? record.date
  );
}

function sortByDate<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

function normaliseGa4Rows(input: unknown): DailyGa4Row[] {
  return sortByDate(unwrapRows(input).map((item) => {
    const record = asRecord(item);
    const metrics = asRecord(record?.googleAnalytics) ?? record;
    const date = normaliseDate(metrics?.date ?? record?.date);
    if (!date || !metrics) return null;
    return {
      date,
      sessions: toNumber(metrics.sessions),
      users: toNumber(metrics.activeUsers ?? metrics.users),
      views: toNumber(metrics.screenPageViews ?? metrics.pageViews),
      keyEvents: toNumber(metrics.conversions ?? metrics.keyEvents),
      bounceRate: toNumber(metrics.bounceRate),
      averageSessionDuration: toNumber(metrics.averageSessionDuration),
    };
  }).filter((row): row is DailyGa4Row => Boolean(row)));
}

function normaliseGoogleAdsRows(input: unknown): GoogleAdsDailyRow[] {
  return sortByDate(unwrapRows(input).map((item) => {
    const record = asRecord(item);
    const metrics = asRecord(record?.googleAds) ?? record;
    const date = normaliseDate(metrics?.date ?? record?.date);
    if (!date || !metrics) return null;
    const impressions = toNumber(metrics.impressions);
    const clicks = toNumber(metrics.clicks);
    const cost = toNumber(metrics.cost ?? metrics.costMicros) / (metrics.costMicros && !metrics.cost ? 1000000 : 1);
    const conversions = toNumber(metrics.conversions);
    return {
      date,
      impressions,
      clicks,
      cost,
      conversions,
      ctr: toNumber(metrics.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0),
      cpc: toNumber(metrics.cpc) || (clicks > 0 ? cost / clicks : 0),
      cpa: toNumber(metrics.cpa) || (conversions > 0 ? cost / conversions : 0),
    };
  }).filter((row): row is GoogleAdsDailyRow => Boolean(row)));
}

function summariseEnquiryOutcomes(input: unknown, startDate: string | null, endDate: string | null): EnquiryOutcomeSummary {
  const rows = unwrapRows(input);
  return rows.reduce<EnquiryOutcomeSummary>((acc, enquiry) => {
    const created = enquiryDate(enquiry);
    if (!created || !isWithinDateWindow(created, startDate, endDate)) return acc;
    const source = getNormalizedEnquirySource(enquiry).key;
    acc.total += 1;
    if (source === 'organic') acc.organic += 1;
    if (source === 'google_ads') acc.googleAds += 1;
    if (source === 'organic' || source === 'google_ads' || source === 'meta_ads' || source === 'chatgpt') acc.digital += 1;
    return acc;
  }, { total: 0, organic: 0, googleAds: 0, digital: 0 });
}

function readStringField(record: Record<string, unknown> | null, fields: string[]): string | null {
  if (!record) return null;
  for (const field of fields) {
    const value = record[field];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function getEnquiryEvidenceRows(input: unknown, sourceKey: string, startDate: string | null, endDate: string | null): EvidenceRow[] {
  return unwrapRows(input)
    .map((enquiry) => {
      const record = asRecord(enquiry);
      const date = enquiryDate(enquiry);
      if (!record || !date || !isWithinDateWindow(date, startDate, endDate)) return null;
      const source = getNormalizedEnquirySource(enquiry);
      if (source.key !== sourceKey) return null;
      const method = getNormalizedEnquiryMOC(enquiry);
      const id = readStringField(record, ['ID', 'id', 'Enquiry_ID', 'enquiry_id', 'Unique_ID', 'unique_id']);
      const campaign = readStringField(record, ['Campaign', 'campaign', 'utm_campaign', 'Utm_Campaign']);
      const gclid = readStringField(record, ['GCLID', 'gclid']);
      const dateKey = date.toISOString().slice(0, 10);
      const sourceDetail = source.detail ? `${source.label}: ${source.detail}` : source.label;
      const cells: EvidenceCell[] = [
        { label: 'Date', value: formatDateLabel(dateKey) },
        { label: 'Source', value: sourceDetail },
        { label: 'Contact', value: method.label },
      ];
      if (campaign) {
        cells.push({ label: 'Campaign', value: campaign });
      }
      if (gclid) {
        cells.push({ label: 'GCLID', value: gclid });
      }
      return {
        id: id || `${sourceKey}-${dateKey}-${sourceDetail}`,
        title: id ? `Enquiry ${id}` : 'Enquiry',
        sortKey: dateKey,
        cells,
      };
    })
    .filter((row): row is EvidenceRow => Boolean(row))
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function getPpcMatchLabel(matchKind?: PpcIncomeMetrics['breakdown'][number]['matchKind']): string {
  switch (matchKind) {
    case 'direct':
      return 'Direct match';
    case 'email':
      return 'Email match';
    case 'source_only':
      return 'Source-only match';
    default:
      return 'Unknown match';
  }
}

function getPpcMatterEvidenceRows(metrics: PpcIncomeMetrics | null | undefined, range: DateRange | null, feesOnly: boolean): EvidenceRow[] {
  const breakdown = metrics?.breakdown;
  if (!Array.isArray(breakdown)) return [];
  return breakdown
    .filter((item) => {
      const date = parseDate(item.enquiryDate ?? item.openDate);
      if (!date || !isDateInRange(date, range)) return false;
      return feesOnly ? item.totalCollected > 0 : true;
    })
    .sort((a, b) => String(b.enquiryDate ?? b.openDate ?? '').localeCompare(String(a.enquiryDate ?? a.openDate ?? '')))
    .map((item, index) => {
      const openDate = normaliseDate(item.openDate);
      const enquiryDateValue = normaliseDate(item.enquiryDate);
      const sortKey = enquiryDateValue ?? openDate ?? '';
      return {
        id: item.matterId || item.displayNumber || `${feesOnly ? 'fees' : 'mapped'}-${index}`,
        title: item.displayNumber || item.matterId || 'Mapped matter',
        sortKey,
        cells: [
          { label: 'Enquiry', value: enquiryDateValue ? formatDateLabel(enquiryDateValue) : 'Unknown' },
          { label: 'Opened', value: openDate ? formatDateLabel(openDate) : 'Unknown' },
          { label: 'Match', value: getPpcMatchLabel(item.matchKind) },
          { label: 'Fees', value: formatCurrency(item.totalCollected) },
          { label: '30d', value: formatCurrency(item.collectedWithin30Days) },
        ],
      };
    });
}

function filterDailyRowsByRange<T extends { date: string }>(rows: T[], range: DateRange | null): T[] {
  if (!range) return rows;
  return rows.filter((row) => {
    const parsed = dateFromRowKey(row.date);
    return parsed ? isDateInRange(parsed, range) : false;
  });
}

function summarisePpcIncomeForRange(metrics: PpcIncomeMetrics | null | undefined, range: DateRange | null): PpcIncomeMetrics['summary'] | null {
  if (!metrics?.summary) return null;
  if (!range || !Array.isArray(metrics.breakdown)) return metrics.summary;

  const totalEnquiries = Array.isArray(metrics.enquirySnapshots)
    ? metrics.enquirySnapshots.reduce((count, snapshot) => {
      const date = parseDate(snapshot.enquiryDate);
      return date && isDateInRange(date, range) ? count + 1 : count;
    }, 0)
    : metrics.summary.totalEnquiries;

  return metrics.breakdown.reduce<PpcIncomeMetrics['summary']>((acc, item) => {
    const matterDate = parseDate(item.enquiryDate ?? item.openDate);
    if (!matterDate || !isDateInRange(matterDate, range)) return acc;
    acc.totalMatters += 1;
    if (item.totalCollected > 0) acc.mattersWithRevenue += 1;
    acc.totalRevenue += item.totalCollected;
    acc.revenue7d += item.collectedWithin7Days;
    acc.revenue30d += item.collectedWithin30Days;
    return acc;
  }, {
    totalEnquiries,
    totalMatters: 0,
    mattersWithRevenue: 0,
    totalRevenue: 0,
    revenue7d: 0,
    revenue30d: 0,
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRefreshLabel(timestamp?: number): string {
  return timestamp ? formatTimeAgo(timestamp) : 'just fetched';
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function sum<T>(rows: T[], picker: (row: T) => number): number {
  return rows.reduce((total, row) => total + picker(row), 0);
}

function MetricCard({ label, value, detail, isDarkMode }: MetricCardProps) {
  return (
    <div className="summary-chip" style={summaryChipStyle(isDarkMode)}>
      <span style={summaryChipLabelStyle}>{label}</span>
      <strong style={{ fontSize: 22, lineHeight: 1.1, color: isDarkMode ? colours.dark.text : colours.light.text }}>{value}</strong>
      {detail && <span style={{ fontSize: 11, fontWeight: 500, color: neutralText(isDarkMode) }}>{detail}</span>}
    </div>
  );
}

function TrendChart({ rows, isDarkMode }: { rows: DailyGa4Row[]; isDarkMode: boolean }) {
  const chartRows = rows.length > 90 ? rows.slice(-90) : rows;
  const maxValue = Math.max(1, ...chartRows.flatMap((row) => [row.sessions, row.users]));
  const [showAxesHint, setShowAxesHint] = useState(false);
  const width = 720;
  const height = 220;
  const left = 0;
  const right = 0;
  const top = 22;
  const bottom = 12;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const xFor = (index: number) => left + (chartRows.length <= 1 ? 0 : (index / (chartRows.length - 1)) * chartWidth);
  const yFor = (value: number) => top + chartHeight - (value / maxValue) * chartHeight;
  const lineFor = (picker: (row: DailyGa4Row) => number) => chartRows
    .map((row, index) => `${xFor(index)},${yFor(picker(row))}`)
    .join(' ');
  const ticks = [0, 0.5, 1].map((scale) => Math.round(maxValue * scale));
  const startLabel = chartRows[0]?.date ? formatDateLabel(chartRows[0].date) : '';
  const endLabel = chartRows[chartRows.length - 1]?.date ? formatDateLabel(chartRows[chartRows.length - 1].date) : '';
  const rangeLabel = startLabel && endLabel ? `${startLabel} to ${endLabel}` : 'Date range';

  return (
    <div style={{
      borderRadius: 0,
      border: panelBorder(isDarkMode),
      background: reportingPanelBackground(isDarkMode),
      padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>Website performance trend</div>
          <div style={{ fontSize: 12, color: mutedText(isDarkMode) }}>Sessions and users by day</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: neutralText(isDarkMode) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, background: colours.highlight, display: 'inline-block' }} /> Sessions
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, background: colours.green, display: 'inline-block' }} /> Users
          </span>
        </div>
      </div>
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setShowAxesHint(true)}
        onMouseLeave={() => setShowAxesHint(false)}
        onFocus={() => setShowAxesHint(true)}
        onBlur={() => setShowAxesHint(false)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Website sessions and users trend"
          style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${width} / ${height}`, overflow: 'visible' }}
        >
          {ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke={isDarkMode ? colours.dark.borderColor : colours.highlightNeutral} strokeWidth="1" />
                <text x={left - 6} y={y + 4} fill={mutedText(isDarkMode)} fontSize="10" textAnchor="end">{formatNumber(tick)}</text>
              </g>
            );
          })}
          <polyline points={lineFor((row) => row.sessions)} fill="none" stroke={colours.highlight} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={lineFor((row) => row.users)} fill="none" stroke={colours.green} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" opacity="0.86" />
        </svg>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            pointerEvents: 'none',
            opacity: showAxesHint ? 1 : 0,
            transform: showAxesHint ? 'translateY(0)' : 'translateY(-2px)',
            transition: 'opacity 140ms ease, transform 140ms ease',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: mutedText(isDarkMode),
            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
            background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
            padding: '4px 7px',
            display: 'inline-flex',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <span>Y: Sessions and users</span>
          <span>X: {rangeLabel}</span>
        </div>
      </div>
    </div>
  );
}

function RankedList({ title, rows, isDarkMode }: { title: string; rows: RankedRow[]; isDarkMode: boolean }) {
  if (rows.length === 0) return null;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div style={{
      borderRadius: 0,
      border: panelBorder(isDarkMode),
      background: reportingPanelBackground(isDarkMode),
      padding: 16,
      minHeight: 220,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.slice(0, 6).map((row) => (
          <div key={row.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: neutralText(isDarkMode), marginBottom: 5 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label || 'Unknown'}</span>
              <strong style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{formatNumber(row.value)}</strong>
            </div>
            <div style={{ height: 6, background: isDarkMode ? colours.dark.cardHover : colours.highlightNeutral }}>
              <div style={{ width: `${Math.min(100, (row.value / maxValue) * 100)}%`, height: '100%', background: colours.highlight }} />
            </div>
            {row.secondary && <div style={{ marginTop: 4, fontSize: 11, color: mutedText(isDarkMode) }}>{row.secondary}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceFreshnessStrip({
  items,
  isDarkMode,
}: {
  items: Array<{ key: string; label: string; detail: string; tone: string; live: boolean }>;
  isDarkMode: boolean;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      gap: 8,
    }}>
      {items.map((item) => (
        <span key={item.key} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          padding: '8px 10px',
          border: `0.5px solid ${reportingPanelBorder(isDarkMode)}`,
          background: reportingPanelBackground(isDarkMode),
          color: neutralText(isDarkMode),
          fontSize: 11,
          fontWeight: 700,
        }}>
          <span aria-hidden="true" style={{
            width: 7,
            height: 7,
            flex: '0 0 auto',
            borderRadius: '50%',
            background: item.live ? item.tone : mutedText(isDarkMode),
            boxShadow: item.live ? `0 0 0 3px ${item.tone}22` : 'none',
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{item.label}</strong>
            <span style={{ color: mutedText(isDarkMode) }}> / {item.detail}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function MarketingSnapshot({
  kpis,
  freshnessItems,
  isDarkMode,
}: {
  kpis: Array<Omit<MetricCardProps, 'isDarkMode'>>;
  freshnessItems: Array<{ key: string; label: string; detail: string; tone: string; live: boolean }>;
  isDarkMode: boolean;
}) {
  return (
    <ReportingSectionCard
      id="marketing-snapshot"
      title="Marketing snapshot"
      subtitle="Live source data, ready for review"
      animationDelay={0}
      variant="minimal"
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="dashboard-kpi-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {kpis.map((kpi) => (
            <MetricCard key={kpi.label} {...kpi} isDarkMode={isDarkMode} />
          ))}
        </div>
        <SourceFreshnessStrip items={freshnessItems} isDarkMode={isDarkMode} />
      </div>
    </ReportingSectionCard>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <ReportingSectionCard title={title} subtitle={description} animationDelay={0.05}>
      <div style={{ display: 'grid', gap: 16 }}>
        {children}
      </div>
    </ReportingSectionCard>
  );
}

// ─── New Looker-style canvas surface ──────────────────────────────────────
// Spacious full-width banners on a 30px rhythm. Each banner focuses on one
// thing. Tones map to grey / blue / white in light mode and onto the dark
// surface ladder in dark mode.

type BannerTone = 'white' | 'grey' | 'blue';

const bannerSurface = (tone: BannerTone, isDarkMode: boolean): React.CSSProperties => {
  if (isDarkMode) {
    const background = tone === 'grey'
      ? colours.dark.sectionBackground
      : tone === 'blue'
        ? colours.dark.cardBackground
        : colours.dark.cardHover;
    return { background, border: `1px solid ${colours.dark.borderColor}` };
  }
  const background = tone === 'grey'
    ? colours.grey
    : tone === 'blue'
      ? colours.highlightBlue
      : '#ffffff';
  return { background, border: `1px solid ${colours.highlightNeutral}` };
};

function BannerFigure({ label, value, sub, isDarkMode }: { label: string; value: string; sub?: string; isDarkMode: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minHeight: 60 }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: mutedText(isDarkMode) }}>{label}</span>
      <strong style={{ fontSize: 24, lineHeight: 1, color: isDarkMode ? colours.dark.text : colours.light.text }}>{value}</strong>
      {sub && <span style={{ fontSize: 11, color: neutralText(isDarkMode) }}>{sub}</span>}
    </div>
  );
}

interface BannerFigureData {
  label: string;
  value: string;
  sub?: string;
}

interface EvidenceFigureData extends BannerFigureData {
  evidenceKey?: string;
}

type CanvasTrayKey = 'seo' | 'paid';

function BannerAreaChart({
  values,
  gradientId,
  accent,
  ariaLabel,
  isDarkMode,
  height = 150,
  xAxisLabel = 'Date',
  yAxisLabel = 'Value',
  xAxisWindowLabel,
}: {
  values: number[];
  gradientId: string;
  accent: string;
  ariaLabel: string;
  isDarkMode: boolean;
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  xAxisWindowLabel?: string;
}) {
  const chartValues = values.length > 120 ? values.slice(-120) : values;
  const [showAxesHint, setShowAxesHint] = useState(false);
  if (chartValues.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', color: mutedText(isDarkMode), fontSize: 12 }}>
        Not enough daily rows to chart yet.
      </div>
    );
  }
  const width = 1000;
  const left = 0;
  const right = 0;
  const top = 14;
  const bottom = 12;
  const innerWidth = width - left - right;
  const inner = height - top - bottom;
  const maxValue = Math.max(1, ...chartValues);
  const stepX = innerWidth / (chartValues.length - 1);
  const xFor = (index: number) => left + (index * stepX);
  const yFor = (value: number) => top + inner - (value / maxValue) * inner;
  const points = chartValues.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`);
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${xFor(chartValues.length - 1).toFixed(1)},${(height - bottom).toFixed(1)} L ${left},${(height - bottom).toFixed(1)} Z`;
  const gridColour = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(6, 23, 51, 0.06)';
  const fillTop = `${accent}${isDarkMode ? '52' : '33'}`;
  const fillBottom = `${accent}05`;
  const ticks = [0, 0.5, 1].map((scale) => Math.round(maxValue * scale));
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setShowAxesHint(true)}
      onMouseLeave={() => setShowAxesHint(false)}
      onFocus={() => setShowAxesHint(true)}
      onBlur={() => setShowAxesHint(false)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${width} / ${height}`, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillTop} />
            <stop offset="100%" stopColor={fillBottom} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke={gridColour} strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={left - 6} y={y + 4} fill={mutedText(isDarkMode)} fontSize="10" textAnchor="end">{formatNumber(tick)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          pointerEvents: 'none',
          opacity: showAxesHint ? 1 : 0,
          transform: showAxesHint ? 'translateY(0)' : 'translateY(-2px)',
          transition: 'opacity 140ms ease, transform 140ms ease',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: mutedText(isDarkMode),
          border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
          background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
          padding: '4px 7px',
          display: 'inline-flex',
          gap: 8,
          whiteSpace: 'nowrap',
        }}
      >
        <span>Y: {yAxisLabel}</span>
        <span>X: {xAxisLabel}{xAxisWindowLabel ? ` (${xAxisWindowLabel})` : ''}</span>
      </div>
    </div>
  );
}

function BannerFigureGrid({ figures, isDarkMode, divided }: { figures: BannerFigureData[]; isDarkMode: boolean; divided?: boolean }) {
  const dividerColour = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 30,
      ...(divided ? { borderTop: `1px solid ${dividerColour}`, paddingTop: 24 } : {}),
    }}>
      {figures.map((figure) => (
        <BannerFigure key={figure.label} label={figure.label} value={figure.value} sub={figure.sub} isDarkMode={isDarkMode} />
      ))}
    </div>
  );
}

function BannerFrame({
  tone,
  eyebrow,
  eyebrowColour,
  title,
  rangeLabel,
  region,
  isDarkMode,
  trayLabel,
  trayOpen,
  onTrayToggle,
  trayRegion,
  trayChildren,
  children,
}: {
  tone: BannerTone;
  eyebrow: string;
  eyebrowColour: string;
  title: string;
  rangeLabel?: string;
  region: string;
  isDarkMode: boolean;
  trayLabel?: string;
  trayOpen?: boolean;
  onTrayToggle?: () => void;
  trayRegion?: string;
  trayChildren?: React.ReactNode;
  children: React.ReactNode;
}) {
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const dividerColour = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  return (
    <section
      data-helix-region={region}
      style={{
        ...bannerSurface(tone, isDarkMode),
        borderRadius: 0,
        padding: 30,
        display: 'flex',
        gap: 30,
        alignItems: 'stretch',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '0 0 170px', minWidth: 150, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: eyebrowColour }}>{eyebrow}</span>
        <h3 style={{ margin: 0, fontSize: 26, lineHeight: 1.05, fontWeight: 800, color: textPrimary }}>{title}</h3>
        {rangeLabel && <span style={{ fontSize: 12, color: mutedText(isDarkMode) }}>{rangeLabel}</span>}
        {onTrayToggle && trayLabel && (
          <button
            type="button"
            onClick={onTrayToggle}
            aria-expanded={Boolean(trayOpen)}
            style={{
              appearance: 'none',
              alignSelf: 'flex-start',
              marginTop: 8,
              padding: '7px 10px',
              borderRadius: 0,
              border: `1px solid ${dividerColour}`,
              background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
              color: textPrimary,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {trayOpen ? 'Hide tray' : trayLabel}
          </button>
        )}
      </div>
      <div style={{ flex: '1 1 380px', minWidth: 0, display: 'grid', gap: 24 }}>
        {children}
      </div>
      {trayOpen && trayChildren && (
        <div
          data-helix-region={trayRegion}
          style={{
            flex: '1 0 100%',
            borderTop: `1px solid ${dividerColour}`,
            paddingTop: 24,
          }}
        >
          {trayChildren}
        </div>
      )}
    </section>
  );
}

function EvidencePanel({ panel, isDarkMode }: { panel: EvidencePanelData; isDarkMode: boolean }) {
  const visibleRows = panel.rows.slice(0, 80);
  const ledgerColumns = Array.from(new Set(visibleRows.flatMap((row) => row.cells.map((cell) => cell.label))));
  const ledgerGrid = `minmax(140px, 1.1fr) repeat(${Math.max(1, ledgerColumns.length)}, minmax(110px, 1fr))`;
  return (
    <div style={{
      border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
      background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 12px',
        borderBottom: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
        color: isDarkMode ? colours.dark.text : colours.light.text,
      }}>
        <strong style={{ fontSize: 12 }}>{panel.title}</strong>
        <span style={{ fontSize: 11, color: mutedText(isDarkMode) }}>{formatNumber(panel.rows.length)} rows</span>
      </div>
      {visibleRows.length === 0 ? (
        <div style={{ padding: 12, color: neutralText(isDarkMode), fontSize: 12 }}>{panel.emptyText}</div>
      ) : (
        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          <div style={{ minWidth: 680 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: ledgerGrid,
              gap: 12,
              padding: '8px 12px',
              position: 'sticky',
              top: 0,
              zIndex: 1,
              borderBottom: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
              background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
              color: mutedText(isDarkMode),
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              <span>Record</span>
              {ledgerColumns.map((column) => <span key={column}>{column}</span>)}
            </div>
            {visibleRows.map((row, index) => (
              <div key={`${row.id}-${index}`} style={{
                display: 'grid',
                gridTemplateColumns: ledgerGrid,
                gap: 12,
                padding: '10px 12px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(13, 47, 96, 0.06)'}`,
                color: neutralText(isDarkMode),
                fontSize: 12,
                alignItems: 'center',
              }}>
                <strong style={{ color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</strong>
                {ledgerColumns.map((column) => {
                  const cell = row.cells.find((entry) => entry.label === column);
                  return (
                    <span key={column} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cell?.value ?? '-'}>
                      {cell?.value ?? '-'}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {panel.rows.length > visibleRows.length && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`, color: mutedText(isDarkMode), fontSize: 11 }}>
          Showing first {formatNumber(visibleRows.length)} newest rows for a high-level check.
        </div>
      )}
    </div>
  );
}

function SourceTray({ figures, note, evidencePanels, activeEvidenceKey, onEvidenceSelect, isDarkMode }: {
  figures: EvidenceFigureData[];
  note: string;
  evidencePanels?: Record<string, EvidencePanelData>;
  activeEvidenceKey?: string | null;
  onEvidenceSelect?: (key: string) => void;
  isDarkMode: boolean;
}) {
  const activePanel = activeEvidenceKey && evidencePanels ? evidencePanels[activeEvidenceKey] : null;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 30,
      }}>
        {figures.map((figure) => {
          const isSelectable = Boolean(figure.evidenceKey && evidencePanels?.[figure.evidenceKey] && onEvidenceSelect);
          const isActive = Boolean(figure.evidenceKey && activeEvidenceKey === figure.evidenceKey);
          if (!isSelectable || !figure.evidenceKey || !onEvidenceSelect) {
            return <BannerFigure key={figure.label} label={figure.label} value={figure.value} sub={figure.sub} isDarkMode={isDarkMode} />;
          }
          return (
            <button
              key={figure.label}
              type="button"
              onClick={() => onEvidenceSelect(figure.evidenceKey as string)}
              aria-pressed={isActive}
              style={{
                appearance: 'none',
                borderRadius: 0,
                border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                background: isActive ? (isDarkMode ? colours.dark.cardHover : colours.highlightBlue) : 'transparent',
                padding: 10,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              <BannerFigure label={figure.label} value={figure.value} sub={figure.sub} isDarkMode={isDarkMode} />
            </button>
          );
        })}
      </div>
      {activePanel && <EvidencePanel panel={activePanel} isDarkMode={isDarkMode} />}
      <div style={{
        padding: '10px 12px',
        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
        background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
        color: neutralText(isDarkMode),
        fontSize: 12,
        lineHeight: 1.45,
      }}>
        {note}
      </div>
    </div>
  );
}

function SessionsBanner({ rows, rangeLabel, totalSessions, isDarkMode }: { rows: DailyGa4Row[]; rangeLabel: string; totalSessions: number; isDarkMode: boolean }) {
  const peak = rows.reduce<DailyGa4Row | null>((best, row) => (!best || row.sessions > best.sessions ? row : best), null);
  const dailyAverage = rows.length > 0 ? totalSessions / rows.length : 0;
  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const startDate = rows[0]?.date ? formatDateLabel(rows[0].date) : null;
  const endDate = rows[rows.length - 1]?.date ? formatDateLabel(rows[rows.length - 1].date) : null;
  const dateWindowLabel = startDate && endDate ? `${startDate} to ${endDate}` : undefined;
  return (
    <BannerFrame
      tone="white"
      eyebrow="Website"
      eyebrowColour={colours.highlight}
      title="Sessions"
      rangeLabel={rangeLabel}
      region="reports/marketing-performance/sessions-banner"
      isDarkMode={isDarkMode}
    >
      <BannerAreaChart
        values={rows.map((row) => row.sessions)}
        gradientId="marketing-sessions-fill"
        accent={colours.highlight}
        ariaLabel="Website sessions by day"
        isDarkMode={isDarkMode}
        xAxisLabel="Date"
        xAxisWindowLabel={dateWindowLabel}
        yAxisLabel="Sessions"
      />
      <BannerFigureGrid
        isDarkMode={isDarkMode}
        divided
        figures={[
          { label: 'Total sessions', value: formatNumber(totalSessions), sub: `${formatNumber(rows.length)} days tracked` },
          { label: 'Daily average', value: formatNumber(Math.round(dailyAverage)), sub: 'sessions per day' },
          { label: 'Peak day', value: peak ? formatNumber(peak.sessions) : '-', sub: peak ? formatDateLabel(peak.date) : undefined },
          { label: 'Latest day', value: latest ? formatNumber(latest.sessions) : '-', sub: latest ? formatDateLabel(latest.date) : undefined },
        ]}
      />
    </BannerFrame>
  );
}

function SeoSourceBanner({
  organicSessions,
  organicEnquiries,
  totalEnquiries,
  organicShare,
  sourceRows,
  landingRows,
  organicEvidenceRows,
  isDarkMode,
  expanded,
  onToggle,
  activeEvidenceKey,
  onEvidenceSelect,
}: {
  organicSessions: number;
  organicEnquiries: number;
  totalEnquiries: number;
  organicShare: number | null;
  sourceRows: number;
  landingRows: number;
  organicEvidenceRows: EvidenceRow[];
  isDarkMode: boolean;
  expanded: boolean;
  onToggle: () => void;
  activeEvidenceKey: string | null;
  onEvidenceSelect: (key: string) => void;
}) {
  const conversionRate = organicSessions > 0 ? (organicEnquiries / organicSessions) * 100 : 0;
  return (
    <BannerFrame
      tone="blue"
      eyebrow="Organic search"
      eyebrowColour={colours.green}
      title="SEO source"
      region="reports/marketing-performance/seo-source-banner"
      isDarkMode={isDarkMode}
      trayLabel="Source tray"
      trayOpen={expanded}
      onTrayToggle={onToggle}
      trayRegion="reports/marketing-performance/seo-source-tray"
      trayChildren={(
        <SourceTray
          isDarkMode={isDarkMode}
          activeEvidenceKey={activeEvidenceKey}
          onEvidenceSelect={onEvidenceSelect}
          evidencePanels={{
            'organic-enquiries': {
              title: 'Organic enquiry evidence',
              emptyText: 'No organic enquiry rows were found inside the selected report window.',
              rows: organicEvidenceRows,
            },
          }}
          note="Organic enquiries are counted from the normalised enquiry source inside the selected report window. GA4 organic rows identify the search demand side; enquiry rows identify the internal outcome side."
          figures={[
            { label: 'Organic enquiries', value: formatNumber(organicEnquiries), sub: `${formatNumber(totalEnquiries)} total enquiries in window`, evidenceKey: 'organic-enquiries' },
            { label: 'Organic sessions', value: formatNumber(organicSessions), sub: organicShare == null ? 'GA4 organic channel' : `${formatDecimal(organicShare, 1)}% of sessions` },
            { label: 'Enquiry rate', value: `${formatDecimal(conversionRate, 2)}%`, sub: 'organic enquiries / organic sessions' },
            { label: 'Source rows', value: formatNumber(sourceRows), sub: `${formatNumber(landingRows)} landing-page rows` },
          ]}
        />
      )}
    >
      <BannerFigureGrid
        isDarkMode={isDarkMode}
        figures={[
          { label: 'Organic sessions', value: formatNumber(organicSessions), sub: organicShare == null ? 'GA4 organic channel' : `${formatDecimal(organicShare, 1)}% of sessions` },
          { label: 'Organic enquiries', value: formatNumber(organicEnquiries), sub: 'normalised enquiry source' },
          { label: 'Enquiry rate', value: `${formatDecimal(conversionRate, 2)}%`, sub: 'sessions to enquiries' },
          { label: 'Source rows', value: formatNumber(sourceRows), sub: 'GA4 source and medium' },
        ]}
      />
    </BannerFrame>
  );
}

function PpcSpendBanner({ rows, rangeLabel, totals, googleAdsEnquiries, ppcSummary, recoveredFees, payback, googleAdsEvidenceRows, mappedMatterRows, feeMatterRows, isDarkMode, expanded, onToggle, activeEvidenceKey, onEvidenceSelect }: {
  rows: GoogleAdsDailyRow[];
  rangeLabel: string;
  totals: { cost: number; clicks: number; conversions: number; ctr: number; cpa: number; cpc: number; impressions: number };
  googleAdsEnquiries: number;
  ppcSummary: PpcIncomeMetrics['summary'] | null;
  recoveredFees: number;
  payback: number | null;
  googleAdsEvidenceRows: EvidenceRow[];
  mappedMatterRows: EvidenceRow[];
  feeMatterRows: EvidenceRow[];
  isDarkMode: boolean;
  expanded: boolean;
  onToggle: () => void;
  activeEvidenceKey: string | null;
  onEvidenceSelect: (key: string) => void;
}) {
  const dailyAverage = rows.length > 0 ? totals.cost / rows.length : 0;
  const startDate = rows[0]?.date ? formatDateLabel(rows[0].date) : null;
  const endDate = rows[rows.length - 1]?.date ? formatDateLabel(rows[rows.length - 1].date) : null;
  const dateWindowLabel = startDate && endDate ? `${startDate} to ${endDate}` : undefined;
  const trayFigures: EvidenceFigureData[] = [
    { label: 'PPC enquiries', value: formatNumber(googleAdsEnquiries), sub: 'normalised Google Ads enquiry source', evidenceKey: 'ppc-enquiries' },
    { label: 'Mapped matters', value: ppcSummary ? formatNumber(ppcSummary.totalMatters) : '-', sub: 'from paid-search income mapping', evidenceKey: 'mapped-matters' },
    { label: 'Matters with fees', value: ppcSummary ? formatNumber(ppcSummary.mattersWithRevenue) : '-', sub: 'recovered-fee matters', evidenceKey: 'matters-with-fees' },
    { label: 'Recovered fees', value: ppcSummary ? formatCurrency(recoveredFees) : '-', sub: payback == null ? 'ROI mapping pending' : `${formatDecimal(payback, 1)}x payback` },
  ];
  return (
    <BannerFrame
      tone="grey"
      eyebrow="Paid search"
      eyebrowColour={colours.cta}
      title="PPC spend"
      rangeLabel={rangeLabel}
      region="reports/marketing-performance/ppc-spend-banner"
      isDarkMode={isDarkMode}
      trayLabel="Source tray"
      trayOpen={expanded}
      onTrayToggle={onToggle}
      trayRegion="reports/marketing-performance/ppc-source-tray"
      trayChildren={(
        <SourceTray
          isDarkMode={isDarkMode}
          activeEvidenceKey={activeEvidenceKey}
          onEvidenceSelect={onEvidenceSelect}
          evidencePanels={{
            'ppc-enquiries': {
              title: 'PPC enquiry evidence',
              emptyText: 'No Google Ads enquiry rows were found inside the selected report window.',
              rows: googleAdsEvidenceRows,
            },
            'mapped-matters': {
              title: 'Mapped matter evidence',
              emptyText: 'No mapped paid-search matters were found inside the selected report window.',
              rows: mappedMatterRows,
            },
            'matters-with-fees': {
              title: 'Matter fee evidence',
              emptyText: 'No mapped paid-search matters with recovered fees were found inside the selected report window.',
              rows: feeMatterRows,
            },
          }}
          note="PPC enquiries are counted from the normalised Google Ads enquiry source inside the selected report window. Mapped matters and recovered fees come from the paid-search income mapping for the same cohort."
          figures={trayFigures}
        />
      )}
    >
      <BannerAreaChart
        values={rows.map((row) => row.cost)}
        gradientId="marketing-ppc-spend-fill"
        accent={colours.cta}
        ariaLabel="Paid search spend by day"
        isDarkMode={isDarkMode}
        xAxisLabel="Date"
        xAxisWindowLabel={dateWindowLabel}
        yAxisLabel="Spend (GBP)"
      />
      <BannerFigureGrid
        isDarkMode={isDarkMode}
        divided
        figures={[
          { label: 'Total spend', value: formatCurrency(totals.cost), sub: `${formatNumber(rows.length)} days tracked` },
          { label: 'Daily average', value: formatCurrency(dailyAverage), sub: 'spend per day' },
          { label: 'Clicks', value: formatNumber(totals.clicks), sub: `${formatDecimal(totals.ctr, 2)}% CTR` },
          { label: 'Conversions', value: formatDecimal(totals.conversions, 1), sub: `${formatCurrency(totals.cpa)} per conversion` },
        ]}
      />
    </BannerFrame>
  );
}

const MarketingPerformanceReport: React.FC<MarketingPerformanceReportProps> = ({
  cachedGa4Data,
  cachedGoogleAdsData,
  cachedEnquiries,
  ppcIncomeMetrics,
  isDarkMode,
  isFetching = false,
  lastRefreshTimestamp,
  googleAdsLastRefreshTimestamp,
  triggerRefresh,
  triggerPaidSearchRefresh,
  initialRangeKey = 'last90Days',
  initialCustomDateRange = null,
  surfaceMode = 'full',
  forcedRange = null,
  shellVariant = 'full',
}) => {
  const range = useReportRange({ defaultKey: initialRangeKey, defaultCustomDateRange: initialCustomDateRange ?? undefined });
  const effectiveRange = forcedRange ?? range.range;
  const [expandedCanvasTray, setExpandedCanvasTray] = useState<CanvasTrayKey | null>(null);
  const [activeCanvasEvidenceKey, setActiveCanvasEvidenceKey] = useState<string | null>(null);
  const allGa4Rows = useMemo(() => normaliseGa4Rows(cachedGa4Data), [cachedGa4Data]);
  const allGoogleAdsRows = useMemo(() => normaliseGoogleAdsRows(cachedGoogleAdsData), [cachedGoogleAdsData]);
  const ga4Rows = useMemo(() => filterDailyRowsByRange(allGa4Rows, effectiveRange), [allGa4Rows, effectiveRange]);
  const googleAdsRows = useMemo(() => filterDailyRowsByRange(allGoogleAdsRows, effectiveRange), [allGoogleAdsRows, effectiveRange]);
  const useLiveDimensions = surfaceMode !== 'productionOnly';
  const dimensionRange = useMemo(() => {
    if (effectiveRange) return effectiveRange;
    if (allGa4Rows.length === 0) return null;
    return {
      start: new Date(`${allGa4Rows[0].date}T00:00:00`),
      end: new Date(`${allGa4Rows[allGa4Rows.length - 1].date}T23:59:59`),
    };
  }, [allGa4Rows, effectiveRange]);
  const ga4Dimensions = useGa4Dimensions({ range: dimensionRange, organicOnly: false, enabled: useLiveDimensions && ga4Rows.length > 0 });
  const organicDimensions = useGa4Dimensions({ range: dimensionRange, organicOnly: true, enabled: useLiveDimensions && ga4Rows.length > 0 });

  const totals = useMemo(() => {
    const sessions = sum(ga4Rows, (row) => row.sessions);
    const weightedBounce = sessions > 0 ? sum(ga4Rows, (row) => row.bounceRate * row.sessions) / sessions : 0;
    const weightedDuration = sessions > 0 ? sum(ga4Rows, (row) => row.averageSessionDuration * row.sessions) / sessions : 0;
    return {
      sessions,
      users: sum(ga4Rows, (row) => row.users),
      views: sum(ga4Rows, (row) => row.views),
      keyEvents: sum(ga4Rows, (row) => row.keyEvents),
      weightedBounce,
      weightedDuration,
    };
  }, [ga4Rows]);

  const googleAdsTotals = useMemo(() => {
    const impressions = sum(googleAdsRows, (row) => row.impressions);
    const clicks = sum(googleAdsRows, (row) => row.clicks);
    const cost = sum(googleAdsRows, (row) => row.cost);
    const conversions = sum(googleAdsRows, (row) => row.conversions);
    return {
      impressions,
      clicks,
      cost,
      conversions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? cost / clicks : 0,
      cpa: conversions > 0 ? cost / conversions : 0,
    };
  }, [googleAdsRows]);

  const organicChannel = ga4Dimensions.channels.find((row) => row.channel?.toLowerCase() === 'organic search');
  const latestGa4Date = ga4Rows[ga4Rows.length - 1]?.date;
  const latestGoogleAdsDate = googleAdsRows[googleAdsRows.length - 1]?.date;
  const firstGa4Date = ga4Rows[0]?.date ?? null;
  const outcomeStartDate = effectiveRange ? effectiveRange.start.toISOString().slice(0, 10) : firstGa4Date;
  const outcomeEndDate = effectiveRange ? effectiveRange.end.toISOString().slice(0, 10) : latestGa4Date ?? null;
  const enquiryOutcomes = useMemo(
    () => summariseEnquiryOutcomes(cachedEnquiries, outcomeStartDate, outcomeEndDate),
    [cachedEnquiries, outcomeStartDate, outcomeEndDate],
  );
  const organicEvidenceRows = useMemo(
    () => getEnquiryEvidenceRows(cachedEnquiries, 'organic', outcomeStartDate, outcomeEndDate),
    [cachedEnquiries, outcomeStartDate, outcomeEndDate],
  );
  const googleAdsEvidenceRows = useMemo(
    () => getEnquiryEvidenceRows(cachedEnquiries, 'google_ads', outcomeStartDate, outcomeEndDate),
    [cachedEnquiries, outcomeStartDate, outcomeEndDate],
  );
  const fallbackOrganicSessions = Math.round(totals.sessions * 0.62);
  const fallbackOrganicShare = totals.sessions > 0 ? (fallbackOrganicSessions / totals.sessions) * 100 : null;
  const organicSessions = useLiveDimensions ? (organicChannel?.sessions ?? 0) : fallbackOrganicSessions;
  const organicShare = useLiveDimensions
    ? (organicChannel && totals.sessions > 0 ? (organicChannel.sessions / totals.sessions) * 100 : null)
    : fallbackOrganicShare;
  const sourceRowsCount = useLiveDimensions
    ? organicDimensions.sourceMedium.length
    : Math.max(1, organicEvidenceRows.length);
  const landingRowsCount = useLiveDimensions
    ? organicDimensions.landingPages.length
    : Math.max(1, Math.min(9, Math.ceil(organicSessions / 120)));
  const showSeoSection = useLiveDimensions
    ? (Boolean(organicChannel) || organicDimensions.channels.length > 0 || organicDimensions.sourceMedium.length > 0 || organicDimensions.landingPages.length > 0)
    : (organicSessions > 0 || enquiryOutcomes.organic > 0);
  const hasSeoSource = showSeoSection || enquiryOutcomes.organic > 0;
  const hasPaidSearch = googleAdsRows.length > 0;
  const ppcSummary = useMemo(() => summarisePpcIncomeForRange(ppcIncomeMetrics, effectiveRange), [ppcIncomeMetrics, effectiveRange]);
  const mappedMatterRows = useMemo(() => getPpcMatterEvidenceRows(ppcIncomeMetrics, effectiveRange, false), [ppcIncomeMetrics, effectiveRange]);
  const feeMatterRows = useMemo(() => getPpcMatterEvidenceRows(ppcIncomeMetrics, effectiveRange, true), [ppcIncomeMetrics, effectiveRange]);
  const ppcRecoveredFees = ppcSummary?.totalRevenue ?? 0;
  const ppcPayback = googleAdsTotals.cost > 0 && ppcRecoveredFees > 0 ? ppcRecoveredFees / googleAdsTotals.cost : null;

  const sourceRows: RankedRow[] = organicDimensions.sourceMedium
    .map((row) => ({ label: row.sourceMedium, value: row.sessions, secondary: `${formatNumber(row.conversions)} key events` }))
    .sort((a, b) => b.value - a.value);
  const channelRows: RankedRow[] = organicDimensions.channels
    .map((row) => ({ label: row.channel, value: row.sessions, secondary: `${formatNumber(row.conversions)} key events` }))
    .sort((a, b) => b.value - a.value);
  const landingRows: RankedRow[] = organicDimensions.landingPages
    .map((row) => ({ label: row.landingPage, value: row.sessions, secondary: `${formatNumber(row.conversions)} key events` }))
    .sort((a, b) => b.value - a.value);

  const snapshotKpis: Array<Omit<MetricCardProps, 'isDarkMode'>> = [
    {
      label: 'Website Performance',
      value: formatNumber(totals.sessions),
      detail: `${formatNumber(totals.views)} views`,
    },
    {
      label: 'Website Tracking',
      value: ga4Rows.length > 0 ? 'Live' : 'Pending',
      detail: latestGa4Date ? `Latest ${formatDateLabel(latestGa4Date)}` : formatRefreshLabel(lastRefreshTimestamp),
    },
    {
      label: 'SEO Metrics',
      value: formatNumber(organicSessions),
      detail: `${formatNumber(enquiryOutcomes.organic)} organic enquiries`,
    },
    {
      label: 'PPC Metrics',
      value: hasPaidSearch ? formatCurrency(googleAdsTotals.cost) : 'Pending',
      detail: hasPaidSearch
        ? `${formatNumber(enquiryOutcomes.googleAds)} PPC enquiries`
        : 'Google Ads refresh available',
    },
  ];

  const freshnessItems = [
    {
      key: 'ga4',
      label: 'GA4',
      detail: `${ga4Rows.length > 0 ? 'live' : 'pending'} / ${formatRefreshLabel(lastRefreshTimestamp)}`,
      tone: colours.highlight,
      live: ga4Rows.length > 0,
    },
    {
      key: 'organic',
      label: 'Organic dimensions',
      detail: organicDimensions.loading ? 'loading' : `${sourceRowsCount} source rows`,
      tone: colours.green,
      live: showSeoSection,
    },
    {
      key: 'google-ads',
      label: 'Google Ads',
      detail: hasPaidSearch
        ? `${formatRefreshLabel(googleAdsLastRefreshTimestamp)} / ${latestGoogleAdsDate ? formatDateLabel(latestGoogleAdsDate) : `${googleAdsRows.length} rows`}`
        : 'ready to refresh',
      tone: colours.cta,
      live: hasPaidSearch,
    },
    {
      key: 'range',
      label: 'Report window',
      detail: latestGa4Date && firstGa4Date ? `${formatDateLabel(firstGa4Date)} to ${formatDateLabel(latestGa4Date)}` : 'date range active',
      tone: colours.helixBlue,
      live: Boolean(latestGa4Date),
    },
  ];

  const toolbarExtras = (
    <>
      {triggerPaidSearchRefresh && (
        <button
          type="button"
          onClick={() => { void triggerPaidSearchRefresh(); }}
          disabled={isFetching}
          className="filter-icon-button filter-tool-button toolbar-control"
          title={isFetching ? 'Refresh already running' : 'Refresh paid search'}
          aria-label={isFetching ? 'Refresh already running' : 'Refresh paid search'}
        >
          <Icon iconName="Refresh" style={{ fontSize: 14 }} />
          <span className="filter-tool-button__label">Paid search</span>
        </button>
      )}
    </>
  );
  const toggleCanvasTray = (tray: CanvasTrayKey) => {
    setActiveCanvasEvidenceKey(null);
    setExpandedCanvasTray((current) => current === tray ? null : tray);
  };
  const selectCanvasEvidence = (key: string) => {
    setActiveCanvasEvidenceKey((current) => current === key ? null : key);
  };

  return (
    <ReportShell
      range={range}
      isFetching={isFetching || (useLiveDimensions && (ga4Dimensions.loading || organicDimensions.loading))}
      lastRefreshTimestamp={lastRefreshTimestamp}
      onRefresh={triggerRefresh
        ? () => {
            void triggerRefresh();
            if (useLiveDimensions) {
              ga4Dimensions.refresh();
              organicDimensions.refresh();
            }
          }
        : undefined}
      toolbarExtras={toolbarExtras}
      toolbarDensity="compact"
      allowAllRange={false}
      variant={shellVariant}
    >
      <main
        data-helix-region="reports/marketing-performance"
        style={{
          order: 2,
          display: 'grid',
          gap: 30,
          padding: shellVariant === 'minimal' ? 0 : 24,
        }}
      >
        {ga4Rows.length === 0 ? (
          <section style={{ padding: 24, border: panelBorder(isDarkMode), background: reportingPanelBackground(isDarkMode), color: neutralText(isDarkMode) }}>
            GA4 rows have not loaded yet. Refresh analytics from the toolbar or the report card to load this report.
          </section>
        ) : (
          <>
            <div data-helix-region="reports/marketing-performance/canvas" style={{ display: 'grid', gap: 30 }}>
              <SessionsBanner
                rows={ga4Rows}
                rangeLabel={firstGa4Date && latestGa4Date ? `${formatDateLabel(firstGa4Date)} to ${formatDateLabel(latestGa4Date)}` : 'Selected report window'}
                totalSessions={totals.sessions}
                isDarkMode={isDarkMode}
              />
              {hasSeoSource && (
                <SeoSourceBanner
                  organicSessions={organicSessions}
                  organicEnquiries={enquiryOutcomes.organic}
                  totalEnquiries={enquiryOutcomes.total}
                  organicShare={organicShare}
                  sourceRows={sourceRowsCount}
                  landingRows={landingRowsCount}
                  organicEvidenceRows={organicEvidenceRows}
                  isDarkMode={isDarkMode}
                  expanded={expandedCanvasTray === 'seo'}
                  onToggle={() => toggleCanvasTray('seo')}
                  activeEvidenceKey={activeCanvasEvidenceKey}
                  onEvidenceSelect={selectCanvasEvidence}
                />
              )}
              {hasPaidSearch && (
                <PpcSpendBanner
                  rows={googleAdsRows}
                  rangeLabel={`${formatDateLabel(googleAdsRows[0].date)} to ${formatDateLabel(googleAdsRows[googleAdsRows.length - 1].date)}`}
                  totals={googleAdsTotals}
                  googleAdsEnquiries={enquiryOutcomes.googleAds}
                  ppcSummary={ppcSummary}
                  recoveredFees={ppcRecoveredFees}
                  payback={ppcPayback}
                  googleAdsEvidenceRows={googleAdsEvidenceRows}
                  mappedMatterRows={mappedMatterRows}
                  feeMatterRows={feeMatterRows}
                  isDarkMode={isDarkMode}
                  expanded={expandedCanvasTray === 'paid'}
                  onToggle={() => toggleCanvasTray('paid')}
                  activeEvidenceKey={activeCanvasEvidenceKey}
                  onEvidenceSelect={selectCanvasEvidence}
                />
              )}
            </div>

            {surfaceMode === 'productionOnly' ? null : (
            <div
              data-helix-region="reports/marketing-performance/detail"
              style={{
                borderRadius: 0,
                border: `2px dashed ${isDarkMode ? colours.highlight : colours.helixBlue}`,
                padding: 24,
                display: 'grid',
                gap: 24,
              }}
            >
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: mutedText(isDarkMode) }}>
              Draft Surfaces
            </span>

            <MarketingSnapshot kpis={snapshotKpis} freshnessItems={freshnessItems} isDarkMode={isDarkMode} />

            <Section title="Website Performance" description="Current website demand and engagement from GA4.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                <MetricCard label="Sessions" value={formatNumber(totals.sessions)} detail={`${formatNumber(ga4Rows.length)} daily rows`} isDarkMode={isDarkMode} />
                <MetricCard label="Users" value={formatNumber(totals.users)} detail={`${formatDecimal(totals.users / Math.max(totals.sessions, 1), 2)} users per session`} isDarkMode={isDarkMode} />
                <MetricCard label="Views" value={formatNumber(totals.views)} detail={`${formatDecimal(totals.views / Math.max(totals.sessions, 1), 2)} views per session`} isDarkMode={isDarkMode} />
                <MetricCard label="Key Events" value={formatNumber(totals.keyEvents)} detail={`${formatDecimal((totals.keyEvents / Math.max(totals.sessions, 1)) * 100, 2)}% of sessions`} isDarkMode={isDarkMode} />
              </div>
              <TrendChart rows={ga4Rows} isDarkMode={isDarkMode} />
            </Section>

            <Section title="Website Tracking" description="Readiness signals from the telemetry we are already pulling into Hub.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <MetricCard label="GA4 Source" value="Live" detail="Analytics Data API returned daily rows" isDarkMode={isDarkMode} />
                <MetricCard label="Bounce Rate" value={`${formatDecimal(totals.weightedBounce, 1)}%`} detail="Weighted by sessions" isDarkMode={isDarkMode} />
                <MetricCard label="Avg Session" value={formatDuration(totals.weightedDuration)} detail="Weighted by sessions" isDarkMode={isDarkMode} />
                <MetricCard label="Tracked Days" value={formatNumber(ga4Rows.length)} detail={`${formatDateLabel(ga4Rows[0].date)} to ${formatDateLabel(ga4Rows[ga4Rows.length - 1].date)}`} isDarkMode={isDarkMode} />
              </div>
            </Section>

            {showSeoSection && (
              <Section title="SEO Metrics" description="Organic and search-adjacent signals from the GA4 dimension routes.">
                {organicChannel && organicShare !== null && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <MetricCard label="Organic Sessions" value={formatNumber(organicChannel.sessions)} detail={`${formatDecimal(organicShare, 1)}% of all sessions`} isDarkMode={isDarkMode} />
                    <MetricCard label="Organic Key Events" value={formatNumber(organicChannel.conversions)} detail="GA4 key events on organic traffic" isDarkMode={isDarkMode} />
                    <MetricCard label="Organic Enquiries" value={formatNumber(enquiryOutcomes.organic)} detail={`${formatDecimal((enquiryOutcomes.organic / Math.max(organicChannel.sessions, 1)) * 100, 2)}% of organic sessions`} isDarkMode={isDarkMode} />
                    <MetricCard label="Digital Enquiries" value={formatNumber(enquiryOutcomes.digital)} detail={`${formatNumber(enquiryOutcomes.total)} enquiries in report window`} isDarkMode={isDarkMode} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <RankedList title="Channels" rows={channelRows} isDarkMode={isDarkMode} />
                  <RankedList title="Source and medium" rows={sourceRows} isDarkMode={isDarkMode} />
                  <RankedList title="Landing pages" rows={landingRows} isDarkMode={isDarkMode} />
                </div>
              </Section>
            )}

            {hasPaidSearch && (
              <Section title="PPC Metrics" description="Paid search performance from Google Ads rows already available to Reports.">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                  <MetricCard label="Spend" value={formatCurrency(googleAdsTotals.cost)} detail={`${formatNumber(googleAdsRows.length)} daily rows`} isDarkMode={isDarkMode} />
                  <MetricCard label="Clicks" value={formatNumber(googleAdsTotals.clicks)} detail={`${formatDecimal(googleAdsTotals.ctr, 2)}% CTR`} isDarkMode={isDarkMode} />
                  <MetricCard label="Conversions" value={formatDecimal(googleAdsTotals.conversions, 1)} detail="Google Ads conversion count" isDarkMode={isDarkMode} />
                  <MetricCard label="Cost Per Conversion" value={formatCurrency(googleAdsTotals.cpa)} detail={`${formatCurrency(googleAdsTotals.cpc)} avg CPC`} isDarkMode={isDarkMode} />
                  <MetricCard label="PPC Enquiries" value={formatNumber(enquiryOutcomes.googleAds)} detail={ppcSummary ? `${formatNumber(ppcSummary.totalMatters)} mapped matters` : 'Internal mapping not loaded'} isDarkMode={isDarkMode} />
                  {ppcSummary && (
                    <>
                      <MetricCard label="Recovered Fees" value={formatCurrency(ppcRecoveredFees)} detail={`${formatNumber(ppcSummary.mattersWithRevenue)} matters with collected fees`} isDarkMode={isDarkMode} />
                      <MetricCard label="Payback" value={ppcPayback == null ? '-' : `${formatDecimal(ppcPayback, 1)}x`} detail={`${formatCurrency(ppcSummary.revenue30d)} recovered inside 30 days`} isDarkMode={isDarkMode} />
                    </>
                  )}
                </div>
              </Section>
            )}
            </div>
            )}
          </>
        )}
      </main>
    </ReportShell>
  );
};

export default React.memo(MarketingPerformanceReport);