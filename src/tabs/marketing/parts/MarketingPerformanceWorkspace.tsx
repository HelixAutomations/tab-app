import React, { useMemo, useState } from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
} from '../../Reporting/styles/reportingFoundation';
import { getNormalizedEnquiryMOC } from '../../../utils/enquirySource';
import MarketingTimelineWorkbench, { type MarketingTimelineDay, type MarketingTimelineMonth, type MarketingTimelineTotals, type MarketingTimelineWeek } from './MarketingTimelineWorkbench';

type MarketingWorkspaceMatch = {
  sourceChannel?: 'seo' | 'ppc' | 'email' | 'other';
  sourceValue?: string;
  enquiryId?: string;
  acid?: string;
  pitchEnquiryId?: string;
  legacyEnquiryId?: string;
  processingEnquiryId?: string;
  dealId?: string;
  prospectId?: string;
  instructionRef?: string;
  matterRef?: string;
  matterId?: string;
  clientId?: string;
  email?: string;
  billId?: string;
};

export type MarketingWorkspaceRow = {
  id: string;
  sortTs: number;
  primary: string;
  secondary: string;
  status: string;
  owner: string;
  timestamp: string;
  value: string;
  detail: string;
  match?: MarketingWorkspaceMatch;
};

type MarketingPerformanceWorkspaceProps = {
  isDarkMode: boolean;
  googleAnalyticsRows: unknown[];
  googleAdsRows: unknown[];
  ledgerRowsByTab: Partial<Record<string, MarketingWorkspaceRow[]>>;
  isBlueprintMode?: boolean;
  timelineRangeLabel?: string;
  timelineRangeStartTs: number;
  timelineRangeEndTs: number;
  timelineStatusLabel?: string;
  timelineIsProcessing?: boolean;
};

type ChannelMetric = {
  label: string;
  value: string;
  detail: string;
};

type GoogleAnalyticsTotals = {
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
  rows: number;
};

type GoogleAdsTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  rows: number;
};

type MarketingChannelKey = 'seo' | 'ppc';

type MarketingChannelLaneKey = MarketingChannelKey | 'email';

type IntakeFilterKey = keyof IntakeBreakdown;

type IntakeFilterSelection = IntakeFilterKey | 'all';

type SourceAttributionCounts = Record<MarketingChannelKey | 'other', number>;

type JourneyMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
  basis: string;
};

type IntakeBreakdown = {
  calls: number;
  forms: number;
  email: number;
  other: number;
};

type DownstreamMatchSummary = {
  anchorCount: number;
  pitches: MarketingWorkspaceRow[];
  instructions: MarketingWorkspaceRow[];
  matters: MarketingWorkspaceRow[];
  collectedRows: MarketingWorkspaceRow[];
  collected: number;
};

type JourneyMatchSummary = {
  selectedIntakeLabel: string;
  sourceEnquiries: number;
  filteredEnquiries: number;
  anchorCount: number;
  instructionRefCount: number;
  matterRefCount: number;
  matterIdCount: number;
  matchedPitches: number;
  matchedInstructions: number;
  matchedMatters: number;
  matchedCollectedRows: number;
  chainNotes: string[];
};

type MarketingJourneyBanner = {
  key: MarketingChannelLaneKey;
  label: string;
  sourceLabel: string;
  headline: string;
  liveLabel: string;
  subline: string;
  attribution: string;
  evidence: string;
  status: 'live' | 'off';
  enabled: boolean;
  accent: string;
  enquiryCount: number;
  enquiryDetail: string;
  intake: IntakeBreakdown;
  stages: JourneyMetric[];
  matchSummary: JourneyMatchSummary;
};

const intakeFilterOrder: IntakeFilterKey[] = ['calls', 'forms', 'email', 'other'];

const intakeFilterMeta: Record<IntakeFilterKey, { label: string; iconName: string }> = {
  calls: { label: 'Call', iconName: 'Phone' },
  forms: { label: 'Form', iconName: 'FormLibrary' },
  email: { label: 'Email', iconName: 'Mail' },
  other: { label: 'Other', iconName: 'More' },
};

const journeyStageIconName: Record<string, string> = {
  pitches: 'PageList',
  instructions: 'TextDocument',
  matters: 'WorkItem',
  collected: 'Money',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function parseMoneyLabel(value: string): number {
  return toNumber(value);
}

function normaliseText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isUnclassifiedSource(row: MarketingWorkspaceRow): boolean {
  const source = normaliseText(row.status);
  return !source || source.includes('unknown') || source.includes('unassigned') || source.includes('not set');
}

function isFormEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  const haystack = normaliseText(`${row.secondary} ${row.detail}`);
  return method.includes('form') || method.includes('web') || method.includes('website') || haystack.includes('form submission');
}

function isCallEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  return method.includes('call') || method.includes('phone') || method.includes('telephone');
}

function isPitchOutstanding(row: MarketingWorkspaceRow): boolean {
  const status = normaliseText(row.status);
  return !status.includes('closed') && !status.includes('won') && !status.includes('instructed') && !status.includes('lost');
}

function readAreaOfWork(row: MarketingWorkspaceRow): string {
  const fromSecondary = String(row.secondary || '').split('|')[0]?.trim() || '';
  if (fromSecondary && normaliseText(fromSecondary) !== 'unknown area') return fromSecondary;
  const fallback = normaliseText(`${row.secondary} ${row.detail}`);
  if (fallback.includes('employment')) return 'Employment';
  if (fallback.includes('family') || fallback.includes('divorce') || fallback.includes('children')) return 'Family';
  if (fallback.includes('property') || fallback.includes('convey') || fallback.includes('real estate')) return 'Property';
  if (fallback.includes('immigration')) return 'Immigration';
  if (fallback.includes('corporate') || fallback.includes('commercial') || fallback.includes('company')) return 'Corporate';
  if (fallback.includes('litigation') || fallback.includes('dispute') || fallback.includes('injury')) return 'Litigation';
  return 'General';
}

function readSecondarySegments(row: MarketingWorkspaceRow): string[] {
  return String(row.secondary || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readEnquiryMethod(row: MarketingWorkspaceRow): string {
  return readSecondarySegments(row)[1] || 'Unknown contact';
}

function readNormalizedEnquiryMethod(row: MarketingWorkspaceRow) {
  return getNormalizedEnquiryMOC({
    Method_of_Contact: readEnquiryMethod(row),
    Ultimate_Source: row.status,
  });
}

function readIntakeFilterKey(row: MarketingWorkspaceRow): IntakeFilterKey {
  const normalized = readNormalizedEnquiryMethod(row).key;
  if (normalized === 'phone' || isCallEnquiry(row)) return 'calls';
  if (normalized === 'web_form' || isFormEnquiry(row)) return 'forms';
  if (normalized === 'email') return 'email';
  return 'other';
}

function filterEnquiriesByIntake(rows: MarketingWorkspaceRow[], intakeKey: IntakeFilterSelection): MarketingWorkspaceRow[] {
  if (intakeKey === 'all') return rows;
  return rows.filter((row) => readIntakeFilterKey(row) === intakeKey);
}

function readStraightSourceChannel(row: MarketingWorkspaceRow): MarketingChannelKey | 'other' {
  const source = normaliseText(row.status);
  if (source === 'organic search') return 'seo';
  if (source === 'paid search') return 'ppc';
  return 'other';
}

function buildAttributionCounts(rows: MarketingWorkspaceRow[]): SourceAttributionCounts {
  return rows.reduce<SourceAttributionCounts>((acc, row) => {
    acc[readStraightSourceChannel(row)] += 1;
    return acc;
  }, { seo: 0, ppc: 0, other: 0 });
}

function buildIntakeBreakdown(rows: MarketingWorkspaceRow[]): IntakeBreakdown {
  return rows.reduce<IntakeBreakdown>((acc, row) => {
    acc[readIntakeFilterKey(row)] += 1;
    return acc;
  }, { calls: 0, forms: 0, email: 0, other: 0 });
}

function formatPercentage(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${formatNumber((part / whole) * 100, 1)}%`;
}

function formatConversion(current: number, previous: number): string {
  return previous > 0 ? `${formatPercentage(current, previous)} from previous stage` : 'No previous-stage base yet';
}

function normaliseMatchValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addMatchValue(values: Set<string>, value: unknown): void {
  const normalized = normaliseMatchValue(value);
  if (normalized.length < 4) return;
  if (['unknown', 'unknown area', 'unknown contact', 'unassigned', 'general', 'no ref', 'workflow'].includes(normalized)) return;
  values.add(normalized.replace(/^matter\s+/, ''));
}

function collectMatchValues(rows: MarketingWorkspaceRow[], fields: Array<keyof MarketingWorkspaceMatch>): Set<string> {
  const values = new Set<string>();
  rows.forEach((row) => {
    fields.forEach((field) => addMatchValue(values, row.match?.[field]));
  });
  return values;
}

function rowHasMatchValue(row: MarketingWorkspaceRow, fields: Array<keyof MarketingWorkspaceMatch>, values: Set<string>): boolean {
  if (values.size === 0) return false;
  return fields.some((field) => {
    const normalized = normaliseMatchValue(row.match?.[field]).replace(/^matter\s+/, '');
    return normalized.length >= 4 && values.has(normalized);
  });
}

function buildDownstreamMatchSummary(
  enquiryRows: MarketingWorkspaceRow[],
  pitches: MarketingWorkspaceRow[],
  instructions: MarketingWorkspaceRow[],
  matters: MarketingWorkspaceRow[],
  collectedRows: MarketingWorkspaceRow[],
): DownstreamMatchSummary {
  const enquiryAcids = collectMatchValues(enquiryRows, ['acid', 'pitchEnquiryId', 'legacyEnquiryId', 'processingEnquiryId', 'enquiryId']);
  const matchedPitches = pitches.filter((row) => rowHasMatchValue(row, ['prospectId', 'acid', 'pitchEnquiryId', 'enquiryId'], enquiryAcids));
  const instructionRefs = collectMatchValues(matchedPitches, ['instructionRef']);
  const matchedInstructions = instructions.filter((row) => rowHasMatchValue(row, ['instructionRef'], instructionRefs));
  const matterRefs = collectMatchValues(matchedInstructions, ['matterRef', 'matterId']);
  const matchedMatters = matters.filter((row) => rowHasMatchValue(row, ['matterRef', 'matterId'], matterRefs));
  const matterIds = collectMatchValues(matchedMatters, ['matterId', 'matterRef']);
  const matchedCollectedRows = collectedRows.filter((row) => rowHasMatchValue(row, ['matterId'], matterIds));
  return {
    anchorCount: enquiryAcids.size,
    pitches: matchedPitches,
    instructions: matchedInstructions,
    matters: matchedMatters,
    collectedRows: matchedCollectedRows,
    collected: matchedCollectedRows.reduce((sum, row) => sum + parseMoneyLabel(row.value), 0),
  };
}

function readMatterReference(row: MarketingWorkspaceRow): string {
  return String(row.primary || '').trim() || 'No ref';
}

function readOwnerInitials(row: MarketingWorkspaceRow): string {
  const raw = String(row.owner || '').trim();
  if (!raw || raw.toLowerCase() === 'unassigned') return '--';
  if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase();
  if (raw.includes('@')) {
    const local = raw.split('@')[0] || '';
    if (local && /^[A-Za-z]{2,3}$/.test(local)) return local.toUpperCase();
    if (local.includes('.')) {
      return local
        .split('.')
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 3)
        .toUpperCase() || '--';
    }
    return local.slice(0, 2).toUpperCase() || '--';
  }
  const tokens = raw
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '--';
  if (tokens.length === 1) {
    const compact = tokens[0].slice(0, 2).toUpperCase();
    return compact || '--';
  }
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase() || '--';
}

function readMatterResponsibleInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials(row);
}

function readMatterOriginatingInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials({ ...row, owner: row.detail });
}

function areaAccentColour(areaOfWork: string, isDarkMode: boolean): string {
  const area = normaliseText(areaOfWork);
  if (area.includes('employment')) return isDarkMode ? colours.yellow : colours.yellow;
  if (area.includes('family') || area.includes('divorce') || area.includes('children')) return colours.orange;
  if (area.includes('property') || area.includes('convey') || area.includes('real estate')) return colours.green;
  if (area.includes('immigration')) return colours.blue;
  if (area.includes('corporate') || area.includes('commercial') || area.includes('company')) return colours.helixBlue;
  if (area.includes('litigation') || area.includes('dispute') || area.includes('injury')) return colours.cta;
  return isDarkMode ? colours.blue : colours.helixBlue;
}

function metricRecord(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds'): Record<string, unknown> | null {
  const record = asRecord(row);
  if (!record) return null;
  return asRecord(record[nestedKey]) ?? record;
}

function buildGoogleAnalyticsTotals(rows: unknown[]): GoogleAnalyticsTotals {
  return rows.reduce<GoogleAnalyticsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAnalytics');
    if (!metrics) return acc;
    acc.sessions += toNumber(metrics.sessions);
    acc.users += toNumber(metrics.activeUsers ?? metrics.users);
    acc.views += toNumber(metrics.screenPageViews ?? metrics.pageViews ?? metrics.views);
    acc.keyEvents += toNumber(metrics.conversions ?? metrics.keyEvents);
    acc.rows += 1;
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0, rows: 0 });
}

function buildGoogleAdsTotals(rows: unknown[]): GoogleAdsTotals {
  return rows.reduce<GoogleAdsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAds');
    if (!metrics) return acc;
    const costMicros = toNumber(metrics.costMicros);
    acc.impressions += toNumber(metrics.impressions);
    acc.clicks += toNumber(metrics.clicks);
    acc.cost += metrics.cost == null && costMicros > 0 ? costMicros / 1000000 : toNumber(metrics.cost);
    acc.conversions += toNumber(metrics.conversions);
    acc.rows += 1;
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: 0 });
}

function buildSeoLedgerTotals(rows: MarketingWorkspaceRow[]): GoogleAnalyticsTotals {
  return rows.reduce<GoogleAnalyticsTotals>((acc, row) => {
    const segments = readSecondarySegments(row);
    acc.sessions += toNumber(segments[0]);
    acc.users += toNumber(segments[1]);
    acc.rows += 1;
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0, rows: 0 });
}

function buildPpcLedgerTotals(rows: MarketingWorkspaceRow[]): GoogleAdsTotals {
  return rows.reduce<GoogleAdsTotals>((acc, row) => {
    const segments = readSecondarySegments(row);
    acc.impressions += toNumber(segments[0]);
    acc.clicks += toNumber(segments[1]);
    acc.cost += parseMoneyLabel(row.value);
    acc.conversions += toNumber(row.detail);
    acc.rows += 1;
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: 0 });
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function toWeekStart(value: Date): Date {
  const weekStart = startOfDay(value);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
}

function formatTimelineDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatTimelineMonth(value: Date): string {
  return value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function createTimelineTotals(): MarketingTimelineTotals {
  return {
    seoSessions: 0,
    seoKeyEvents: 0,
    seoEnquiries: 0,
    seoRows: 0,
    ppcSpend: 0,
    ppcClicks: 0,
    ppcConversions: 0,
    ppcEnquiries: 0,
    ppcRows: 0,
  };
}

function addTimelineTotals(target: MarketingTimelineTotals, next: Partial<MarketingTimelineTotals>): void {
  target.seoSessions += next.seoSessions ?? 0;
  target.seoKeyEvents += next.seoKeyEvents ?? 0;
  target.seoEnquiries += next.seoEnquiries ?? 0;
  target.seoRows += next.seoRows ?? 0;
  target.ppcSpend += next.ppcSpend ?? 0;
  target.ppcClicks += next.ppcClicks ?? 0;
  target.ppcConversions += next.ppcConversions ?? 0;
  target.ppcEnquiries += next.ppcEnquiries ?? 0;
  target.ppcRows += next.ppcRows ?? 0;
}

function formatTimelineDay(value: Date): string {
  return value.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' });
}

function createTimelineDay(value: Date, parentWeekKey: string): MarketingTimelineDay {
  const day = startOfDay(value);
  return {
    ...createTimelineTotals(),
    key: `${parentWeekKey}-day-${dateKey(day)}`,
    label: formatTimelineDay(day),
    rangeLabel: formatTimelineDate(day),
    startTs: day.getTime(),
    endTs: day.getTime(),
  };
}

function createTimelineWeek(start: Date, end: Date, index: number, parentMonthKey: string): MarketingTimelineWeek {
  const key = `${parentMonthKey}-week-${dateKey(start)}`;
  const days: MarketingTimelineDay[] = [];
  let cursor = startOfDay(start);
  const endDay = startOfDay(end);
  while (cursor.getTime() <= endDay.getTime()) {
    days.push(createTimelineDay(cursor, key));
    cursor = addDays(cursor, 1);
  }

  return {
    ...createTimelineTotals(),
    key,
    label: `Week ${index + 1}`,
    rangeLabel: `${formatTimelineDate(start)} to ${formatTimelineDate(end)}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    days,
  };
}

function createTimelineMonth(start: Date, end: Date): MarketingTimelineMonth {
  const key = monthKey(start);
  const weeks: MarketingTimelineWeek[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const naturalWeekEnd = addDays(toWeekStart(cursor), 6);
    const weekEnd = minDate(naturalWeekEnd, end);
    weeks.push(createTimelineWeek(cursor, weekEnd, weeks.length, key));
    cursor = addDays(weekEnd, 1);
  }
  return {
    ...createTimelineTotals(),
    key,
    label: formatTimelineMonth(start),
    rangeLabel: `${formatTimelineDate(start)} to ${formatTimelineDate(end)}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    weeks,
  };
}

function getMetricDate(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds'): Date | null {
  const record = asRecord(row);
  const metrics = metricRecord(row, nestedKey);
  return toDateOrNull(metrics?.date ?? metrics?.Date ?? metrics?.day ?? record?.date ?? record?.Date ?? record?.day);
}

function addTimelineMetrics(monthsByKey: Map<string, MarketingTimelineMonth>, date: Date | null, totals: Partial<MarketingTimelineTotals>): void {
  if (!date) return;
  const dateTs = startOfDay(date).getTime();
  const month = monthsByKey.get(monthKey(date));
  const week = month?.weeks.find((item) => dateTs >= item.startTs && dateTs <= item.endTs);
  const day = week?.days.find((item) => dateTs >= item.startTs && dateTs <= item.endTs);
  if (!month || !week) return;
  addTimelineTotals(month, totals);
  addTimelineTotals(week, totals);
  if (day) addTimelineTotals(day, totals);
}

function buildMarketingTimelineMonths(
  rangeStartTs: number,
  rangeEndTs: number,
  googleAnalyticsRows: unknown[],
  googleAdsRows: unknown[],
  ledgerRowsByTab: Partial<Record<string, MarketingWorkspaceRow[]>>,
): MarketingTimelineMonth[] {
  const rangeStartDate = toDateOrNull(rangeStartTs);
  const rangeEndDate = toDateOrNull(rangeEndTs);
  if (!rangeStartDate || !rangeEndDate) return [];
  const rangeStart = startOfDay(rangeStartDate);
  const rangeEnd = startOfDay(rangeEndDate);
  if (rangeStart.getTime() > rangeEnd.getTime()) return [];

  const months: MarketingTimelineMonth[] = [];
  let cursor = startOfMonth(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    const monthStart = maxDate(cursor, rangeStart);
    const monthEnd = minDate(endOfMonth(cursor), rangeEnd);
    months.push(createTimelineMonth(monthStart, monthEnd));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const monthsByKey = new Map(months.map((month) => [month.key, month]));

  if (googleAnalyticsRows.length > 0) {
    googleAnalyticsRows.forEach((row) => {
      const metrics = metricRecord(row, 'googleAnalytics');
      if (!metrics) return;
      addTimelineMetrics(monthsByKey, getMetricDate(row, 'googleAnalytics'), {
        seoSessions: toNumber(metrics.sessions),
        seoKeyEvents: toNumber(metrics.conversions ?? metrics.keyEvents),
        seoRows: 1,
      });
    });
  } else {
    (ledgerRowsByTab.seo ?? []).forEach((row) => {
      const segments = readSecondarySegments(row);
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), {
        seoSessions: toNumber(segments[0]),
        seoKeyEvents: toNumber(row.value),
        seoRows: 1,
      });
    });
  }

  if (googleAdsRows.length > 0) {
    googleAdsRows.forEach((row) => {
      const metrics = metricRecord(row, 'googleAds');
      if (!metrics) return;
      const costMicros = toNumber(metrics.costMicros ?? metrics.cost_micros);
      addTimelineMetrics(monthsByKey, getMetricDate(row, 'googleAds'), {
        ppcClicks: toNumber(metrics.clicks),
        ppcSpend: metrics.cost == null && costMicros > 0 ? costMicros / 1000000 : toNumber(metrics.cost),
        ppcConversions: toNumber(metrics.conversions),
        ppcRows: 1,
      });
    });
  } else {
    (ledgerRowsByTab.ppc ?? []).forEach((row) => {
      const segments = readSecondarySegments(row);
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), {
        ppcClicks: toNumber(segments[1]),
        ppcSpend: parseMoneyLabel(row.value),
        ppcConversions: toNumber(row.detail),
        ppcRows: 1,
      });
    });
  }

  (ledgerRowsByTab.enquiries ?? []).forEach((row) => {
    const channel = readStraightSourceChannel(row);
    if (channel === 'seo') {
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), { seoEnquiries: 1 });
    } else if (channel === 'ppc') {
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), { ppcEnquiries: 1 });
    }
  });

  return months;
}

function hasGoogleAnalyticsTotals(value: GoogleAnalyticsTotals): boolean {
  return value.sessions > 0 || value.users > 0 || value.views > 0 || value.keyEvents > 0;
}

function hasGoogleAdsTotals(value: GoogleAdsTotals): boolean {
  return value.impressions > 0 || value.clicks > 0 || value.cost > 0 || value.conversions > 0;
}

const panelStyle = (isDarkMode: boolean): React.CSSProperties => ({
  border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
  background: reportingPanelBackground(isDarkMode, 'elevated'),
  padding: 12,
  display: 'grid',
  gap: 8,
  minWidth: 0,
});

const MarketingPerformanceWorkspace: React.FC<MarketingPerformanceWorkspaceProps> = ({
  isDarkMode,
  googleAnalyticsRows,
  googleAdsRows,
  ledgerRowsByTab,
  isBlueprintMode = false,
  timelineRangeLabel = 'Financial year to date',
  timelineRangeStartTs,
  timelineRangeEndTs,
  timelineStatusLabel = 'timeline settled',
  timelineIsProcessing = false,
}) => {
  const metrics = useMemo(() => {
    const enquiries = ledgerRowsByTab.enquiries ?? [];
    const calls = ledgerRowsByTab.calls ?? [];
    const pitches = ledgerRowsByTab.pitches ?? [];
    const instructions = ledgerRowsByTab.instructions ?? [];
    const matters = ledgerRowsByTab.matters ?? [];
    const seoRows = ledgerRowsByTab.seo ?? [];
    const ppcRows = ledgerRowsByTab.ppc ?? [];
    const websiteFromFeed = buildGoogleAnalyticsTotals(googleAnalyticsRows);
    const website = hasGoogleAnalyticsTotals(websiteFromFeed)
      ? websiteFromFeed
      : buildSeoLedgerTotals(seoRows);
    const paidFromFeed = buildGoogleAdsTotals(googleAdsRows);
    const paid = hasGoogleAdsTotals(paidFromFeed)
      ? paidFromFeed
      : buildPpcLedgerTotals(ppcRows);
    const collectedRows = ledgerRowsByTab.collectedTime ?? [];
    const collected = collectedRows.reduce((sum, row) => sum + parseMoneyLabel(row.value), 0);
    const sourceAttribution = buildAttributionCounts(enquiries);
    const classifiedEnquiries = enquiries.filter((row) => !isUnclassifiedSource(row)).length;
    const unclassifiedEnquiries = Math.max(0, enquiries.length - classifiedEnquiries);
    const intakeBreakdown = buildIntakeBreakdown(enquiries);
    const outstandingPitches = pitches.filter(isPitchOutstanding).length;
    const closedPitches = Math.max(0, pitches.length - outstandingPitches);
    const matterRowsWithValue = matters.filter((row) => parseMoneyLabel(row.value) > 0).length;
    const enquiryRate = website.sessions > 0 ? (enquiries.length / website.sessions) * 100 : 0;
    const pitchRate = enquiries.length > 0 ? (pitches.length / enquiries.length) * 100 : 0;
    const instructionRate = pitches.length > 0 ? (instructions.length / pitches.length) * 100 : 0;
    return {
      website,
      paid,
      enquiries,
      calls,
      pitches,
      instructions,
      matters,
      collectedRows,
      collected,
      sourceAttribution,
      classifiedEnquiries,
      unclassifiedEnquiries,
      intakeBreakdown,
      outstandingPitches,
      closedPitches,
      matterRowsWithValue,
      enquiryRate,
      pitchRate,
      instructionRate,
    };
  }, [googleAdsRows, googleAnalyticsRows, ledgerRowsByTab]);

  const [selectedMarketingChannel, setSelectedMarketingChannel] = useState<MarketingChannelKey>('seo');
  const [selectedIntakeByChannel, setSelectedIntakeByChannel] = useState<Record<MarketingChannelKey, IntakeFilterSelection>>({
    seo: 'all',
    ppc: 'all',
  });
  const [hoveredIntakeFilter, setHoveredIntakeFilter] = useState<string | null>(null);
  const selectedChannelLabel = selectedMarketingChannel === 'seo' ? 'SEO' : 'PPC';
  const seoChannelEnquiries = useMemo(() => metrics.enquiries.filter((row) => readStraightSourceChannel(row) === 'seo'), [metrics.enquiries]);
  const ppcChannelEnquiries = useMemo(() => metrics.enquiries.filter((row) => readStraightSourceChannel(row) === 'ppc'), [metrics.enquiries]);
  const selectedChannelIntake = selectedIntakeByChannel[selectedMarketingChannel] ?? 'all';
  const selectedChannelBaseEnquiries = selectedMarketingChannel === 'seo' ? seoChannelEnquiries : ppcChannelEnquiries;
  const selectedChannelEnquiries = filterEnquiriesByIntake(selectedChannelBaseEnquiries, selectedChannelIntake);

  const intakeSelectionLabel = (selection: IntakeFilterSelection): string => (
    selection === 'all' ? 'All contact methods' : intakeFilterMeta[selection].label
  );

  const buildJourneyForChannel = (
    channel: MarketingChannelKey,
    sourceValue: string,
    sourceEnquiries: MarketingWorkspaceRow[],
  ) => {
    const selectedIntake = selectedIntakeByChannel[channel] ?? 'all';
    const filteredEnquiries = filterEnquiriesByIntake(sourceEnquiries, selectedIntake);
    const downstream = buildDownstreamMatchSummary(
      filteredEnquiries,
      metrics.pitches,
      metrics.instructions,
      metrics.matters,
      metrics.collectedRows,
    );
    const anchorDetail = `${formatNumber(downstream.anchorCount)} main-value anchors`;
    const stages: JourneyMetric[] = [
      {
        key: 'pitches',
        label: 'Pitches',
        value: formatNumber(downstream.pitches.length),
        detail: `${formatNumber(metrics.pitches.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'instructions',
        label: 'Instructions',
        value: formatNumber(downstream.instructions.length),
        detail: `${formatNumber(metrics.instructions.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'matters',
        label: 'Matters',
        value: formatNumber(downstream.matters.length),
        detail: `${formatNumber(metrics.matters.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'collected',
        label: 'Collected',
        value: formatCurrency(downstream.collected),
        detail: `${formatNumber(downstream.collectedRows.length)} fee rows`,
        basis: `Matched from ${sourceValue}`,
      },
    ];
    const matchSummary: JourneyMatchSummary = {
      selectedIntakeLabel: intakeSelectionLabel(selectedIntake),
      sourceEnquiries: sourceEnquiries.length,
      filteredEnquiries: filteredEnquiries.length,
      anchorCount: downstream.anchorCount,
      instructionRefCount: collectMatchValues(downstream.pitches, ['instructionRef']).size,
      matterRefCount: collectMatchValues(downstream.instructions, ['matterRef', 'matterId']).size,
      matterIdCount: collectMatchValues(downstream.matters, ['matterId', 'matterRef']).size,
      matchedPitches: downstream.pitches.length,
      matchedInstructions: downstream.instructions.length,
      matchedMatters: downstream.matters.length,
      matchedCollectedRows: downstream.collectedRows.length,
      chainNotes: [
        `Enquiry: Ultimate_Source = ${sourceValue}`,
        `Pitch: enquiry ACID/ID -> Deals ProspectId (${formatNumber(downstream.anchorCount)} anchors -> ${formatNumber(downstream.pitches.length)} pitches)`,
        `Instruction: Deal InstructionRef -> Instructions InstructionRef (${formatNumber(collectMatchValues(downstream.pitches, ['instructionRef']).size)} refs -> ${formatNumber(downstream.instructions.length)} instructions)`,
        `Matter: Instruction MatterId/MatterID -> matter id/display ref (${formatNumber(collectMatchValues(downstream.instructions, ['matterRef', 'matterId']).size)} refs -> ${formatNumber(downstream.matters.length)} matters)`,
        `Collected: matter id -> collectedTime.matter_id (${formatNumber(collectMatchValues(downstream.matters, ['matterId', 'matterRef']).size)} matter ids -> ${formatNumber(downstream.collectedRows.length)} rows)`,
      ],
    };
    return { selectedIntake, filteredEnquiries, downstream, stages, matchSummary };
  };

  const seoJourney = buildJourneyForChannel('seo', 'Organic search', seoChannelEnquiries);
  const ppcJourney = buildJourneyForChannel('ppc', 'Paid search', ppcChannelEnquiries);
  const selectedJourney = selectedMarketingChannel === 'seo' ? seoJourney : ppcJourney;

  const emailPlaceholderStages: JourneyMetric[] = [
    { key: 'pitches', label: 'Pitches', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'instructions', label: 'Instructions', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'matters', label: 'Matters', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'collected', label: 'Collected', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
  ];

  const channelStatusStrip = [
    { key: 'seo', label: 'SEO', status: 'enabled' as const },
    { key: 'ppc', label: 'PPC', status: 'enabled' as const },
    { key: 'email', label: 'Email', status: 'off' as const },
  ];

  const channelJourneyBanners: MarketingJourneyBanner[] = [
    {
      key: 'seo',
      label: 'SEO',
      sourceLabel: 'Organic search',
      headline: formatNumber(metrics.website.sessions),
      liveLabel: 'SEO live view',
      subline: `${formatNumber(seoChannelEnquiries.length)} attributed enquiries`,
      attribution: 'Source field: Organic search',
      evidence: 'GA4 traffic + enquiry source value',
      status: 'live',
      enabled: true,
      accent: isDarkMode ? '#8ed1ff' : colours.helixBlue,
      enquiryCount: seoJourney.filteredEnquiries.length,
      enquiryDetail: seoJourney.selectedIntake === 'all' ? 'Organic search enquiries' : `${intakeSelectionLabel(seoJourney.selectedIntake)} enquiries from Organic search`,
      intake: buildIntakeBreakdown(seoChannelEnquiries),
      stages: seoJourney.stages,
      matchSummary: seoJourney.matchSummary,
    },
    {
      key: 'ppc',
      label: 'PPC',
      sourceLabel: 'Paid search',
      headline: formatNumber(metrics.paid.conversions, 1),
      liveLabel: 'PPC live view',
      subline: `${formatCurrency(metrics.paid.cost)} spend`,
      attribution: `${formatNumber(ppcChannelEnquiries.length)} attributed enquiries`,
      evidence: 'Google Ads telemetry + Paid search source value',
      status: 'live',
      enabled: true,
      accent: colours.green,
      enquiryCount: ppcJourney.filteredEnquiries.length,
      enquiryDetail: ppcJourney.selectedIntake === 'all' ? 'Paid search enquiries' : `${intakeSelectionLabel(ppcJourney.selectedIntake)} enquiries from Paid search`,
      intake: buildIntakeBreakdown(ppcChannelEnquiries),
      stages: ppcJourney.stages,
      matchSummary: ppcJourney.matchSummary,
    },
    {
      key: 'email',
      label: 'Email',
      sourceLabel: 'Email',
      headline: '-',
      liveLabel: 'Email channel',
      subline: 'Attribution lane not active',
      attribution: 'Email channel off',
      evidence: 'Reserved for email counts later',
      status: 'off',
      enabled: false,
      accent: isDarkMode ? 'rgba(209, 213, 219, 0.48)' : 'rgba(75, 85, 99, 0.56)',
      enquiryCount: 0,
      enquiryDetail: 'Email source not linked',
      intake: { calls: 0, forms: 0, email: 0, other: 0 },
      stages: emailPlaceholderStages,
      matchSummary: {
        selectedIntakeLabel: 'All contact methods',
        sourceEnquiries: 0,
        filteredEnquiries: 0,
        anchorCount: 0,
        instructionRefCount: 0,
        matterRefCount: 0,
        matterIdCount: 0,
        matchedPitches: 0,
        matchedInstructions: 0,
        matchedMatters: 0,
        matchedCollectedRows: 0,
        chainNotes: [
          'Enquiry: email source not linked yet',
          'Pitch: waiting for email attribution chain',
          'Instruction: waiting for pitch link',
          'Matter: waiting for instruction ref',
          'Collected: waiting for matter id',
        ],
      },
    },
  ];

  const toIntakeChips = (intake: IntakeBreakdown) => intakeFilterOrder.map((key) => ({
    key,
    label: intakeFilterMeta[key].label,
    iconName: intakeFilterMeta[key].iconName,
    value: intake[key],
  }));

  const selectedJourneyBanner = channelJourneyBanners.find((banner) => banner.key === selectedMarketingChannel);

  const evidenceCards: ChannelMetric[] = [
    {
      label: 'Source confidence',
      value: formatNumber(metrics.classifiedEnquiries),
      detail: `${formatNumber(metrics.unclassifiedEnquiries)} unclassified in this window`,
    },
    {
      label: 'Teams-visible intake',
      value: formatNumber(metrics.intakeBreakdown.calls + metrics.intakeBreakdown.forms),
      detail: `${formatNumber(metrics.intakeBreakdown.calls)} calls, ${formatNumber(metrics.intakeBreakdown.forms)} forms`,
    },
    {
      label: 'Pitch follow-up',
      value: formatNumber(metrics.outstandingPitches),
      detail: `${formatNumber(metrics.closedPitches)} pitches closed or instructed`,
    },
  ];

  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;
  const mutedColour = isDarkMode ? '#d1d5db' : '#4b5563';
  const selectedChannelAccent = selectedMarketingChannel === 'ppc'
    ? colours.green
    : (isDarkMode ? '#8ed1ff' : colours.helixBlue);
  const [rightPanelMode, setRightPanelMode] = useState<'enquiries' | 'matters'>('enquiries');
  const rightPanelRows = rightPanelMode === 'matters' ? selectedJourney.downstream.matters.slice(0, 6) : selectedChannelEnquiries.slice(0, 6);
  const splitSharedBorder = reportingPanelBorder(isDarkMode);
  const splitLeftSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitLeftBorder = splitSharedBorder;
  const splitLeftAccent = isDarkMode ? colours.blue : colours.helixBlue;
  const splitLeftText = textColour;
  const splitLeftMuted = mutedColour;
  const splitLeftLabel = isDarkMode ? colours.subtleGrey : colours.helixBlue;
  const splitRightSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitRightBorder = splitSharedBorder;
  const splitRightAccent = isDarkMode ? '#8ed1ff' : colours.blue;
  const splitRightText = textColour;
  const splitRightMuted = mutedColour;
  const splitRightLabel = isDarkMode ? '#8ed1ff' : colours.helixBlue;
  const toggleContainerBackground = isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(13, 47, 96, 0.04)';
  const splitPanelHeight = 240;
  const leftToggleButtonStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    width: '100%',
    minHeight: 24,
    padding: '0 8px',
    cursor: 'pointer',
    textAlign: 'center',
    lineHeight: 1,
  };
  const rightToggleButtonStyle: React.CSSProperties = {
    ...leftToggleButtonStyle,
  };
  const seoStatRows: ChannelMetric[] = [
    {
      label: 'Sessions',
      value: formatNumber(metrics.website.sessions),
      detail: `${formatNumber(metrics.website.rows)} tracked days`,
    },
    {
      label: 'Active users',
      value: formatNumber(metrics.website.users),
      detail: 'Google Analytics active users',
    },
    {
      label: 'Page views',
      value: formatNumber(metrics.website.views),
      detail: 'Screen/page views from GA4',
    },
    {
      label: 'Key events',
      value: formatNumber(metrics.website.keyEvents),
      detail: 'Tracked conversion/key events',
    },
  ];
  const ppcStatRows: ChannelMetric[] = [
    {
      label: 'Clicks',
      value: formatNumber(metrics.paid.clicks),
      detail: `${formatNumber(metrics.paid.rows)} tracked rows`,
    },
    {
      label: 'Impressions',
      value: formatNumber(metrics.paid.impressions),
      detail: 'Google Ads impressions',
    },
    {
      label: 'Spend',
      value: formatCurrency(metrics.paid.cost),
      detail: 'Total paid spend in range',
    },
    {
      label: 'Conversions',
      value: formatNumber(metrics.paid.conversions, 1),
      detail: 'Platform-reported conversions',
    },
  ];
  const leftPanelRows = selectedMarketingChannel === 'ppc' ? ppcStatRows : seoStatRows;
  const timelineMonths = useMemo<MarketingTimelineMonth[]>(() => (
    buildMarketingTimelineMonths(timelineRangeStartTs, timelineRangeEndTs, googleAnalyticsRows, googleAdsRows, ledgerRowsByTab)
  ), [googleAdsRows, googleAnalyticsRows, ledgerRowsByTab, timelineRangeEndTs, timelineRangeStartTs]);

  if (isBlueprintMode) {
    const blueprintSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
    const blueprintBorder = reportingPanelBorder(isDarkMode);

    return (
      <section data-helix-region="marketing/performance-workspace" className="marketing-performance-workspace" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {['SEO', 'PPC', 'Enquiries', 'Instructions'].map((label, index) => (
            <div key={label} style={{ ...panelStyle(isDarkMode), minHeight: 110, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                {label}
              </span>
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <div className="marketing-skeleton-line" style={{ width: `${70 - index * 4}%`, height: 14 }} />
                <div className="marketing-skeleton-line" style={{ width: `${52 + index * 5}%`, height: 22 }} />
                <div className="marketing-skeleton-line" style={{ width: `${82 - index * 3}%`, height: 10 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ ...panelStyle(isDarkMode), minHeight: 320, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="marketing-skeleton-line" style={{ width: '38%', height: 12 }} />
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10, alignItems: 'center' }}>
                    <div className="marketing-skeleton-line" style={{ height: 12 }} />
                    <div className="marketing-skeleton-line" style={{ height: 12 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...panelStyle(isDarkMode), minHeight: 320, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="marketing-skeleton-line" style={{ width: '44%', height: 12 }} />
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 54px 64px', gap: 10, alignItems: 'center' }}>
                    <div className="marketing-skeleton-line" style={{ height: 12 }} />
                    <div className="marketing-skeleton-line" style={{ height: 12 }} />
                    <div className="marketing-skeleton-line" style={{ height: 12 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-helix-region="marketing/performance-workspace"
      className="marketing-performance-workspace"
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <section
        data-helix-region="marketing/channel-workbench"
        style={{
          ...panelStyle(isDarkMode),
          gap: 0,
          padding: 0,
          overflow: 'hidden',
          borderTop: `2px solid ${selectedChannelAccent}`,
        }}
      >
        <div
          data-helix-region="marketing/channel-workbench/governor"
          style={{
            display: 'grid',
            gap: 10,
            padding: '12px 12px 10px',
            background: isDarkMode ? 'rgba(10, 26, 45, 0.62)' : 'rgba(255, 255, 255, 0.72)',
            borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: textColour }}>Marketing channel workbench</h2>
            <div
              data-helix-region="marketing/channel-status-strip"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {channelStatusStrip.map((channel) => {
                const enabled = channel.status === 'enabled';
                return (
                  <span
                    key={channel.key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      minHeight: 20,
                      padding: '0 7px',
                      border: `1px solid ${enabled ? (isDarkMode ? 'rgba(142, 209, 255, 0.32)' : 'rgba(13, 47, 96, 0.16)') : (isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.22)')}`,
                      background: enabled ? (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(13, 47, 96, 0.04)') : 'transparent',
                      color: enabled ? textColour : (isDarkMode ? 'rgba(209, 213, 219, 0.52)' : 'rgba(75, 85, 99, 0.56)'),
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: enabled ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(107, 114, 128, 0.34)'),
                      }}
                    />
                    {channel.label} {enabled ? 'Enabled' : 'Off'}
                  </span>
                );
              })}
            </div>
          </div>

        </div>

        <div
          id={`marketing-channel-panel-${selectedMarketingChannel}`}
          role="tabpanel"
          aria-label="Marketing channel journey lanes"
          data-helix-region={`marketing/channel-workbench/${selectedMarketingChannel}`}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: reportingPanelBackground(isDarkMode),
          }}
        >
          <div role="tablist" aria-label="Marketing channel journey lanes" style={{ display: 'grid', gap: 8 }}>
            {channelJourneyBanners.map((banner) => {
              const selected = banner.key === selectedMarketingChannel;
              const selectableChannel = banner.key === 'seo' || banner.key === 'ppc' ? banner.key : null;
              const canSelect = Boolean(selectableChannel);
              const activeIntakeKey = selectableChannel ? selectedIntakeByChannel[selectableChannel] ?? 'all' : 'all';
              const background = selected
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(13, 47, 96, 0.06)')
                : reportingPanelBackground(isDarkMode, 'elevated');
              const channelPrimaryLabel = banner.key === 'seo' ? 'Sessions' : (banner.key === 'ppc' ? 'Conversions' : 'Email');
              const channelSeparatorColour = isDarkMode ? 'rgba(148, 163, 184, 0.20)' : 'rgba(13, 47, 96, 0.13)';
              const channelFilterMetrics = toIntakeChips(banner.intake);
              return (
                <div
                  id={`marketing-channel-tab-${banner.key}`}
                  key={banner.key}
                  role="tab"
                  aria-selected={selected}
                  aria-disabled={!banner.enabled}
                  tabIndex={canSelect ? 0 : -1}
                  onClick={() => {
                    if (selectableChannel) setSelectedMarketingChannel(selectableChannel);
                  }}
                  onKeyDown={(event) => {
                    if (!canSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    if (selectableChannel) setSelectedMarketingChannel(selectableChannel);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(118px, 0.17fr) minmax(0, 1fr)',
                    gap: 0,
                    width: '100%',
                    minHeight: 134,
                    padding: 0,
                    border: `1px solid ${selected ? banner.accent : reportingPanelBorder(isDarkMode)}`,
                    borderLeft: `4px solid ${banner.accent}`,
                    background,
                    color: banner.enabled ? textColour : (isDarkMode ? 'rgba(209, 213, 219, 0.52)' : 'rgba(75, 85, 99, 0.62)'),
                    textAlign: 'left',
                    fontFamily: 'Raleway, sans-serif',
                    cursor: canSelect ? 'pointer' : 'not-allowed',
                    opacity: banner.enabled ? 1 : 0.76,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      alignContent: 'center',
                      gap: 7,
                      minWidth: 0,
                      padding: '12px 13px',
                      borderRight: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                      background: selected
                        ? (isDarkMode ? 'rgba(10, 26, 45, 0.48)' : 'rgba(255, 255, 255, 0.54)')
                        : (isDarkMode ? 'rgba(6, 23, 51, 0.26)' : 'rgba(244, 244, 246, 0.44)'),
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: banner.accent }}>
                      {banner.label}
                    </span>
                    <strong style={{ fontSize: 18, lineHeight: 1, fontWeight: 900, color: banner.enabled ? textColour : 'inherit' }}>
                      {banner.sourceLabel}
                    </strong>
                    <span style={{ fontSize: 9, lineHeight: 1.25, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      {banner.enabled ? 'Source field' : 'Reserved lane'}
                    </span>
                  </span>

                  <span style={{ display: 'grid', gridTemplateRows: 'auto auto', minWidth: 0 }}>
                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(148px, 0.72fr) 1px minmax(0, 1.85fr)',
                        minWidth: 0,
                        minHeight: 62,
                        borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                        background: isDarkMode ? 'rgba(255, 255, 255, 0.012)' : 'rgba(255, 255, 255, 0.34)',
                      }}
                    >
                      <span style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0, padding: '10px 15px' }}>
                        <strong style={{ fontSize: 25, lineHeight: 1, color: textColour }}>{banner.headline}</strong>
                        <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: banner.accent }}>
                          {channelPrimaryLabel}
                        </span>
                      </span>

                      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '12px 0', background: channelSeparatorColour }} />

                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', minWidth: 0, padding: '0 8px' }}>
                        {channelFilterMetrics.map((chip, index) => {
                          const chipHoverKey = `${banner.key}-${chip.key}`;
                          const isChipActive = activeIntakeKey === chip.key;
                          const isChipInteractive = canSelect && banner.enabled;
                          const isChipHovered = hoveredIntakeFilter === chipHoverKey && isChipInteractive;
                          return (
                            <button
                              key={`${banner.key}-filter-${chip.key}`}
                              type="button"
                              aria-pressed={isChipActive}
                              disabled={!canSelect}
                              title={`${isChipActive ? 'Clear' : 'Filter'} ${banner.label} by ${chip.label}`}
                              onMouseEnter={() => { if (isChipInteractive) setHoveredIntakeFilter(chipHoverKey); }}
                              onMouseLeave={() => { if (hoveredIntakeFilter === chipHoverKey) setHoveredIntakeFilter(null); }}
                              onFocus={() => { if (isChipInteractive) setHoveredIntakeFilter(chipHoverKey); }}
                              onBlur={() => { if (hoveredIntakeFilter === chipHoverKey) setHoveredIntakeFilter(null); }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!selectableChannel) return;
                                setSelectedMarketingChannel(selectableChannel);
                                setSelectedIntakeByChannel((previous) => ({
                                  ...previous,
                                  [selectableChannel]: previous[selectableChannel] === chip.key ? 'all' : chip.key,
                                }));
                              }}
                              style={{
                                position: 'relative',
                                display: 'grid',
                                gridTemplateColumns: 'auto minmax(0, 1fr)',
                                alignItems: 'center',
                                justifyItems: 'start',
                                columnGap: 8,
                                minWidth: 0,
                                padding: '10px 10px',
                                border: 'none',
                                borderRadius: 0,
                                background: isChipActive
                                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(13, 47, 96, 0.07)')
                                  : (isChipHovered ? (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(13, 47, 96, 0.05)') : 'transparent'),
                                boxShadow: isChipHovered ? `inset 0 -2px 0 ${banner.accent}` : 'none',
                                color: banner.enabled ? textColour : 'inherit',
                                fontFamily: 'Raleway, sans-serif',
                                cursor: canSelect ? 'pointer' : 'not-allowed',
                                transition: 'background 120ms ease, box-shadow 120ms ease',
                              }}
                            >
                              {index > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 1, background: channelSeparatorColour }} />}
                              <FontIcon iconName={chip.iconName} style={{ fontSize: 13, lineHeight: 1, color: isChipActive || isChipHovered ? banner.accent : (isDarkMode ? colours.subtleGrey : colours.greyText) }} />
                              <span style={{ display: 'grid', justifyItems: 'start', gap: 5, minWidth: 0 }}>
                                <strong style={{ fontSize: 18, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{formatNumber(chip.value)}</strong>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: isChipHovered ? banner.accent : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                                  {chip.label}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </span>
                    </span>

                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(148px, 0.72fr) 1px minmax(0, 1.85fr)',
                        gap: 0,
                        minWidth: 0,
                        minHeight: 72,
                      }}
                    >
                      <span style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0, padding: '10px 15px' }}>
                        <strong style={{ fontSize: 25, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{formatNumber(banner.enquiryCount)}</strong>
                        <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: banner.accent }}>
                          Enquiries
                        </span>
                      </span>

                      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '12px 0', background: channelSeparatorColour }} />

                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', minWidth: 0, padding: '0 8px' }}>
                        {banner.stages.map((stage, index) => {
                          const isCollected = stage.key === 'collected';
                          const stageAccent = banner.enabled ? (isCollected ? colours.green : banner.accent) : banner.accent;
                          const stageIconName = journeyStageIconName[stage.key] ?? 'PageList';
                          return (
                            <span
                              key={`${banner.key}-flow-${stage.key}`}
                              style={{
                                position: 'relative',
                                display: 'grid',
                                gridTemplateColumns: 'auto minmax(0, 1fr)',
                                alignItems: 'center',
                                justifyItems: 'start',
                                columnGap: 8,
                                minWidth: 0,
                                minHeight: 72,
                                padding: '9px 10px',
                              }}
                            >
                              {index > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 1, background: channelSeparatorColour }} />}
                              <FontIcon iconName={stageIconName} style={{ fontSize: 13, lineHeight: 1, color: stageAccent }} />
                              <span style={{ display: 'grid', justifyItems: 'start', gap: 5, minWidth: 0 }}>
                                <strong style={{ fontSize: isCollected ? 18 : 17, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{stage.value}</strong>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: stageAccent }}>
                                  {stage.label}
                                </span>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1.2, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                                  {stage.detail}
                                </span>
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {selectedJourneyBanner && (
            <div
              data-helix-region="marketing/channel-workbench/matching-dev"
              style={{
                display: 'grid',
                gap: 6,
                padding: '9px 10px',
                border: `1px dotted ${isDarkMode ? 'rgba(142, 209, 255, 0.42)' : 'rgba(13, 47, 96, 0.28)'}`,
                background: isDarkMode ? 'rgba(10, 26, 45, 0.30)' : 'rgba(255, 255, 255, 0.58)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: selectedChannelAccent }}>
                  Dev matching view
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: mutedColour }}>
                  {selectedJourneyBanner.matchSummary.selectedIntakeLabel}
                </span>
              </div>
              <span style={{ fontSize: 10, lineHeight: 1.45, color: mutedColour }}>
                {selectedJourneyBanner.label}: source enquiries {formatNumber(selectedJourneyBanner.matchSummary.sourceEnquiries)}, filtered enquiries {formatNumber(selectedJourneyBanner.matchSummary.filteredEnquiries)}.
              </span>
              <span style={{ display: 'grid', gap: 3 }}>
                {selectedJourneyBanner.matchSummary.chainNotes.map((note) => (
                  <span key={note} style={{ fontSize: 10, lineHeight: 1.35, color: mutedColour }}>
                    {note}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        <MarketingTimelineWorkbench
          isDarkMode={isDarkMode}
          rangeLabel={timelineRangeLabel}
          statusLabel={timelineStatusLabel}
          isProcessing={timelineIsProcessing}
          months={timelineMonths}
        />
      </section>

      <section data-helix-region="marketing/evidence-quality" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {evidenceCards.map((card) => (
          <div key={card.label} style={{ ...panelStyle(isDarkMode), borderTop: `2px solid ${isDarkMode ? '#8ed1ff' : colours.helixBlue}` }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              {card.label}
            </span>
            <strong style={{ fontSize: 22, lineHeight: 1, color: textColour }}>{card.value}</strong>
            <span style={{ fontSize: 11, fontWeight: 700, color: mutedColour }}>{card.detail}</span>
          </div>
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitLeftBorder}`,
            background: splitLeftSurface,
            borderTop: `2px solid ${splitLeftAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '5px 7px',
              marginBottom: 4,
              border: `1px solid ${splitLeftBorder}`,
              background: toggleContainerBackground,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: splitLeftLabel }}>
              {selectedChannelLabel} platform metrics
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: splitLeftMuted }}>
              Selected channel
            </span>
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {leftPanelRows.map((row, index) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: '6px 2px',
                  borderBottom: index === leftPanelRows.length - 1 ? 'none' : `1px solid ${splitLeftBorder}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: splitLeftLabel }}>
                    {row.label}
                  </span>
                  <strong style={{ fontSize: 14, lineHeight: 1, color: splitLeftText, flex: '0 0 auto' }}>{row.value}</strong>
                </div>
                <span style={{ fontSize: 9, color: splitLeftMuted }}>{row.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitRightBorder}`,
            background: splitRightSurface,
            borderTop: `2px solid ${splitRightAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0,
              padding: '1px',
              marginBottom: 4,
              border: `1px solid ${splitRightBorder}`,
              background: toggleContainerBackground,
            }}
          >
            {[
              { key: 'enquiries', label: `${selectedChannelLabel} ${selectedChannelIntake === 'all' ? '' : intakeSelectionLabel(selectedChannelIntake)} enquiries ${formatNumber(selectedChannelEnquiries.length)}`.replace(/\s+/g, ' ').trim() },
              { key: 'matters', label: `Matched matters ${formatNumber(selectedJourney.downstream.matters.length)}` },
            ].map((option) => {
              const isActive = rightPanelMode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRightPanelMode(option.key as 'enquiries' | 'matters')}
                  style={{
                    border: `1px solid ${isActive ? splitRightAccent : 'transparent'}`,
                    background: isActive
                      ? (isDarkMode ? 'rgba(64, 147, 255, 0.22)' : 'rgba(64, 147, 255, 0.12)')
                      : 'transparent',
                    color: isActive ? splitRightText : splitRightMuted,
                    ...rightToggleButtonStyle,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {rightPanelRows.map((row, index) => (
              <div
                key={`${rightPanelMode}-${row.id}-${index}`}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters') ? '6px 6px' : '6px 2px',
                  borderLeft: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters')
                    ? `3px solid ${areaAccentColour(readAreaOfWork(row), isDarkMode)}`
                    : 'none',
                  borderBottom: index === rightPanelRows.length - 1 ? 'none' : `1px solid ${splitRightBorder}`,
                }}
              >
                {rightPanelMode === 'enquiries' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.primary}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readOwnerInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readEnquiryMethod(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {row.status}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {readMatterReference(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterResponsibleInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterOriginatingInitials(row)}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {rightPanelRows.length === 0 && (
              <div style={{ padding: '8px 2px', fontSize: 10, color: splitRightMuted }}>
                {rightPanelMode === 'matters'
                  ? 'No matters in this reporting window yet.'
                  : 'No enquiries in this reporting window yet.'}
              </div>
            )}
          </div>
        </div>
      </div>

    </section>
  );
};

export default MarketingPerformanceWorkspace;