import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import type { Enquiry, Matter, NormalizedMatter, UserData } from '../../app/functionality/types';
import type { InstructionData } from '../../app/functionality/types';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import { colours } from '../../app/styles/colours';
import type { DateRange } from '../Reporting/hooks/useReportRange';
import type { DubberCallRecord } from '../Reporting/dataSources';
import { useStreamingDatasets } from '../../hooks/useStreamingDatasets';
import MarketingHydrationChrome from './parts/MarketingHydrationChrome';
import MarketingPerformanceWorkspace from './parts/MarketingPerformanceWorkspace';
import AccessMatrixConnector from '../Reporting/components/AccessMatrixConnector';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../Reporting/styles/reportingFoundation';

interface MarketingHomeProps {
  userData?: UserData[] | null;
  instructionData?: InstructionData[] | null;
  enquiries?: Enquiry[] | null;
  matters?: Array<Matter | NormalizedMatter> | null;
}

const panelStyle = (isDarkMode: boolean): React.CSSProperties => ({
  border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
  background: reportingPanelBackground(isDarkMode),
  padding: '20px 22px',
  boxShadow: reportingPanelShadow(isDarkMode),
});

type MarketingPitchRow = {
  id: string;
  sortTs: number;
  enquiryRef: string;
  client: string;
  service: string;
  status: 'OPEN' | 'CLOSED' | 'CHECKOUT_LINK';
  owner: string;
  sentAt: string;
  amountLabel: string;
  detail: string;
  match?: MarketingLedgerMatch;
};

type MarketingLedgerMatch = {
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

type MarketingLedgerKey = 'calls' | 'enquiries' | 'pitches' | 'instructions' | 'matters' | 'collectedTime' | 'seo' | 'ppc';

type MarketingLedgerRow = {
  id: string;
  sortTs: number;
  primary: string;
  secondary: string;
  status: string;
  owner: string;
  timestamp: string;
  value: string;
  detail: string;
  match?: MarketingLedgerMatch;
};

type MarketingStreamRow = Record<string, any>;

type MarketingFeedStatus = 'idle' | 'loading' | 'ready' | 'error';

type MarketingDealCandidate = {
  deal: any;
  fromReportingStream: boolean;
  fromPitchOnlyInstruction: boolean;
};

const marketingLedgerTabs: Array<{ key: MarketingLedgerKey; label: string; datasetLabel: string }> = [
  { key: 'calls', label: 'Calls', datasetLabel: 'dubberCalls' },
  { key: 'enquiries', label: 'Enquiries', datasetLabel: 'enquiries' },
  { key: 'pitches', label: 'Pitches', datasetLabel: 'deals' },
  { key: 'instructions', label: 'Instructions', datasetLabel: 'instructions' },
  { key: 'matters', label: 'Matters', datasetLabel: 'allMatters' },
  { key: 'collectedTime', label: 'Collected time', datasetLabel: 'recoveredFees' },
];

const marketingFeedTabs: Array<{ key: MarketingLedgerKey; label: string; datasetLabel: string }> = [
  { key: 'seo', label: 'SEO', datasetLabel: 'googleAnalytics' },
  { key: 'ppc', label: 'PPC', datasetLabel: 'googleAds' },
  ...marketingLedgerTabs,
];

const marketingLedgerStreamDatasets = ['dubberCalls', 'recoveredFees', 'deals', 'instructions', 'enquiries', 'allMatters', 'googleAnalytics', 'googleAds'] as const;

const pitchStatusHints = ['pitch', 'checkout', 'sent'];

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const compactDate = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) {
    const parsed = new Date(`${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function combineDateAndTime(dateValue: unknown, timeValue?: unknown): Date | null {
  const date = toDateOrNull(dateValue);
  if (!date) return null;
  if (!timeValue) return date;

  const combined = new Date(date);
  if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
    combined.setHours(timeValue.getHours(), timeValue.getMinutes(), timeValue.getSeconds(), 0);
    return combined;
  }

  const timeText = String(timeValue ?? '').trim();
  const match = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return date;
  combined.setHours(Number(match[1]), Number(match[2]), Number(match[3] ?? 0), 0);
  return combined;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatPitchTimestamp(date: Date | null): string {
  if (!date) return 'Unknown';
  const day = pad2(date.getDate());
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function formatPitchAmount(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'GBP 0';
  return `GBP ${Math.round(amount).toLocaleString('en-GB')}`;
}

function formatLedgerMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return '-';
  return `GBP ${Math.round(amount).toLocaleString('en-GB')}`;
}

function formatLedgerDuration(value: unknown): string {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function getStringValue(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function optionalStringValue(...values: unknown[]): string | undefined {
  const value = getStringValue(...values);
  return value || undefined;
}

function sourceChannelFromValue(value: unknown): MarketingLedgerMatch['sourceChannel'] {
  const source = String(value ?? '').trim().toLowerCase();
  if (source === 'organic search') return 'seo';
  if (source === 'paid search') return 'ppc';
  if (source.includes('email')) return 'email';
  return source ? 'other' : undefined;
}

function asMarketingRecord(value: unknown): MarketingStreamRow | null {
  return value && typeof value === 'object' ? value as MarketingStreamRow : null;
}

function unwrapMarketingRows(input: unknown): MarketingStreamRow[] {
  if (Array.isArray(input)) return input.filter((row): row is MarketingStreamRow => Boolean(asMarketingRecord(row)));
  const record = asMarketingRecord(input);
  if (!record) return [];
  if (Array.isArray(record.data)) return unwrapMarketingRows(record.data);
  if (Array.isArray(record.rows)) return unwrapMarketingRows(record.rows);
  if (Array.isArray(record.items)) return unwrapMarketingRows(record.items);
  return [record];
}

function getMarketingMetricRecord(row: MarketingStreamRow, nestedKey: 'googleAnalytics' | 'googleAds'): MarketingStreamRow {
  return asMarketingRecord(row[nestedKey]) ?? row;
}

function getDealPitchDateValue(deal: any): unknown {
  return deal?.PitchedDate
    ?? deal?.pitchedDate
    ?? deal?.pitched_date
    ?? deal?.PitchedAt
    ?? deal?.pitchedAt
    ?? deal?.CreatedDate
    ?? deal?.createdDate
    ?? deal?.CreatedAt
    ?? deal?.createdAt
    ?? null;
}

function getDealPitchTimeValue(deal: any): unknown {
  return deal?.PitchedTime
    ?? deal?.pitchedTime
    ?? deal?.pitched_time
    ?? null;
}

function isDateInRange(date: Date | null, range: DateRange): boolean {
  if (!date) return false;
  const ts = date.getTime();
  return Number.isFinite(ts) && ts >= range.start.getTime() && ts <= range.end.getTime();
}

function sortLedgerRowsByTimestamp(a: MarketingLedgerRow, b: MarketingLedgerRow): number {
  if (a.sortTs !== b.sortTs) return b.sortTs - a.sortTs;
  return a.id.localeCompare(b.id);
}

function getLedgerCountLabel(status: unknown, rowCount: number): string {
  if ((status === 'loading' || status === 'idle') && rowCount === 0) return '...';
  if (status === 'error' && rowCount === 0) return '!';
  return rowCount.toLocaleString('en-GB');
}

function isTerminalFeedStatus(status: MarketingFeedStatus): boolean {
  return status === 'ready' || status === 'error';
}

function isGoogleAdsConfigError(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase();
  return text.includes('missing google ads configuration');
}

function getLedgerColumnLabels(key: MarketingLedgerKey): { record: string; status: string; value: string; owner: string; evidence: string } {
  if (key === 'ppc') {
    return { record: 'Campaign', status: 'Channel', value: 'Spend', owner: 'Source', evidence: 'Performance' };
  }
  if (key === 'seo') {
    return { record: 'Channel', status: 'Source', value: 'Events', owner: 'Source', evidence: 'Engagement' };
  }
  if (key === 'collectedTime') {
    return { record: 'Record', status: 'Type', value: 'Collected', owner: 'Owner', evidence: 'Evidence' };
  }
  return { record: 'Record', status: 'Status', value: 'Value', owner: 'Owner', evidence: 'Evidence' };
}

function mapDealStatusToPitchStatus(value: unknown): MarketingPitchRow['status'] {
  const status = String(value ?? '').trim().toLowerCase();
  if (!status) return 'OPEN';
  if (['closed', 'instructed', 'completed', 'paid', 'won'].includes(status)) return 'CLOSED';
  if (['pitched', 'open', 'sent', 'active', 'pending', 'poid'].includes(status)) return 'CHECKOUT_LINK';
  return 'OPEN';
}

type MarketingPageRangeKey = 'lastWeek' | 'month' | 'threeMonths' | 'financialYearToDate';

const marketingRangeFloor = new Date(2026, 3, 1, 0, 0, 0, 0);
const lockedMarketingRangeKey: MarketingPageRangeKey = 'financialYearToDate';

const marketingPageRanges: Array<{ key: MarketingPageRangeKey; label: string; shortLabel: string; disabled?: boolean; disabledReason?: string }> = [
  { key: 'lastWeek', label: 'Current week', shortLabel: 'Current week' },
  { key: 'month', label: 'Current Month', shortLabel: 'Current Month' },
  { key: 'threeMonths', label: 'Last month', shortLabel: 'Last month' },
  { key: 'financialYearToDate', label: 'Financial year to date', shortLabel: 'FYTD' },
];

function formatWireDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const sectionHeadingStyle = (isDarkMode: boolean): React.CSSProperties => ({
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: isDarkMode ? colours.dark.text : colours.darkBlue,
});

function computeMarketingPageRange(key: MarketingPageRangeKey): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (key) {
    case 'lastWeek':
      start.setDate(now.getDate() - 6);
      break;
    case 'month':
      start.setDate(1);
      break;
    case 'threeMonths':
      start.setMonth(start.getMonth() - 5, 1);
      break;
    case 'financialYearToDate':
      if (now.getMonth() >= 3) {
        start.setFullYear(now.getFullYear(), 3, 1);
      } else {
        start.setFullYear(now.getFullYear() - 1, 3, 1);
      }
      break;
    default:
      break;
  }

  if (start < marketingRangeFloor) {
    return { start: new Date(marketingRangeFloor), end };
  }

  return { start, end };
}

function formatRangeWindow(range: DateRange): string {
  const fmt = (value: Date) => value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(range.start)} to ${fmt(range.end)}`;
}

const MARKETING_READY_STORAGE_PREFIX = 'helix:marketing:ready-range:v1';

function marketingReadyStorageKey(range: DateRange): string {
  return `${MARKETING_READY_STORAGE_PREFIX}:${formatWireDate(range.start)}:${formatWireDate(range.end)}`;
}

function readMarketingReadySeen(range: DateRange): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(marketingReadyStorageKey(range)) === 'ready';
  } catch {
    return false;
  }
}

function storeMarketingReadySeen(range: DateRange): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(marketingReadyStorageKey(range), 'ready');
  } catch {
    // Ignore restricted storage contexts.
  }
}

function getRangeMonths(range: DateRange): number {
  const startYear = range.start.getFullYear();
  const startMonth = range.start.getMonth();
  const endYear = range.end.getFullYear();
  const endMonth = range.end.getMonth();
  const monthSpan = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  return Math.max(1, Math.min(24, monthSpan));
}

const MarketingHome: React.FC<MarketingHomeProps> = ({ userData = [], instructionData = [], enquiries = [], matters = [] }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const selectedRange = lockedMarketingRangeKey;
  const localPreviewWithoutData = false;
  const [activeLedgerTab, setActiveLedgerTab] = useState<MarketingLedgerKey>('enquiries');
  const [localHydrationDismissed, setLocalHydrationDismissed] = useState(false);
  const [marketingUnlockToastVisible, setMarketingUnlockToastVisible] = useState(false);
  const previousReportingWindowSettledRef = useRef(false);
  const isBlueprintMode = !selectedRange && !localPreviewWithoutData;
  const effectiveRangeKey = lockedMarketingRangeKey;
  const activeRange = useMemo(() => computeMarketingPageRange(effectiveRangeKey), [effectiveRangeKey]);
  const deferredRange = useDeferredValue(activeRange);
  const isRangeSwitching = deferredRange !== activeRange;
  const selectedRangeLabel = marketingPageRanges.find((item) => item.key === effectiveRangeKey)?.label ?? 'Selected';
  const [marketingReadySeen, setMarketingReadySeen] = useState(() => readMarketingReadySeen(activeRange));
  const ledgerStreamDatasetList = useMemo(() => [...marketingLedgerStreamDatasets], []);
  const reportingLedgerQueryParams = useMemo(() => ({
    enquiriesRangeStart: formatWireDate(deferredRange.start),
    enquiriesRangeEnd: formatWireDate(deferredRange.end),
    dealsRangeStart: formatWireDate(deferredRange.start),
    dealsRangeEnd: formatWireDate(deferredRange.end),
    instructionsRangeStart: formatWireDate(deferredRange.start),
    instructionsRangeEnd: formatWireDate(deferredRange.end),
    recoveredRangeStart: formatWireDate(deferredRange.start),
    recoveredRangeEnd: formatWireDate(deferredRange.end),
    gaRangeStart: formatWireDate(deferredRange.start),
    gaRangeEnd: formatWireDate(deferredRange.end),
    googleAdsRangeStart: formatWireDate(deferredRange.start),
    googleAdsRangeEnd: formatWireDate(deferredRange.end),
    gaMonths: getRangeMonths(deferredRange),
    googleAdsMonths: getRangeMonths(deferredRange),
  }), [deferredRange.end, deferredRange.start]);
  const {
    datasets: ledgerDatasets,
    isConnected: ledgerStreamConnected,
    isComplete: ledgerStreamComplete,
    start: startLedgerStream,
    stop: stopLedgerStream,
    progress: ledgerStreamProgress,
  } = useStreamingDatasets({
    datasets: ledgerStreamDatasetList,
    entraId: userData?.[0]?.EntraID,
    bypassCache: false,
    autoStart: false,
    maxConcurrent: 3,
    queryParams: reportingLedgerQueryParams,
  });

  useEffect(() => {
    if (!selectedRange) return undefined;
    startLedgerStream({
      datasets: ledgerStreamDatasetList,
      queryParams: reportingLedgerQueryParams,
    });
    return () => stopLedgerStream({ resetComplete: false });
  }, [ledgerStreamDatasetList, reportingLedgerQueryParams, selectedRange, startLedgerStream, stopLedgerStream]);

  useEffect(() => {
    if (!selectedRange) return;
    setLocalHydrationDismissed(false);
  }, [selectedRange]);

  const streamedDeals = useMemo(() => (
    Array.isArray(ledgerDatasets.deals?.data) ? ledgerDatasets.deals.data : []
  ), [ledgerDatasets.deals?.data]);
  const streamedInstructions = useMemo(() => (
    Array.isArray(ledgerDatasets.instructions?.data) ? ledgerDatasets.instructions.data : []
  ), [ledgerDatasets.instructions?.data]);
  const streamedEnquiries = useMemo(() => (
    Array.isArray(ledgerDatasets.enquiries?.data) ? ledgerDatasets.enquiries.data : []
  ), [ledgerDatasets.enquiries?.data]);
  const streamedMatters = useMemo(() => (
    Array.isArray(ledgerDatasets.allMatters?.data) ? ledgerDatasets.allMatters.data : []
  ), [ledgerDatasets.allMatters?.data]);
  const streamedCalls = useMemo<DubberCallRecord[]>(() => (
    Array.isArray(ledgerDatasets.dubberCalls?.data) ? ledgerDatasets.dubberCalls.data : []
  ), [ledgerDatasets.dubberCalls?.data]);
  const streamedRecoveredFees = useMemo(() => (
    Array.isArray(ledgerDatasets.recoveredFees?.data) ? ledgerDatasets.recoveredFees.data : []
  ), [ledgerDatasets.recoveredFees?.data]);
  const streamedGoogleAnalytics = useMemo<MarketingStreamRow[]>(() => (
    unwrapMarketingRows(ledgerDatasets.googleAnalytics?.data)
  ), [ledgerDatasets.googleAnalytics?.data]);
  const streamedGoogleAds = useMemo<MarketingStreamRow[]>(() => (
    unwrapMarketingRows(ledgerDatasets.googleAds?.data)
  ), [ledgerDatasets.googleAds?.data]);

  const googleAnalyticsRowsByDateRange = useMemo<MarketingStreamRow[]>(() => {
    if (!selectedRange) return [];
    return streamedGoogleAnalytics.filter((entry: MarketingStreamRow) => {
      const metrics = getMarketingMetricRecord(entry, 'googleAnalytics');
      const date = toDateOrNull(metrics.date ?? entry.date ?? entry.Date ?? entry.day);
      return isDateInRange(date, deferredRange);
    });
  }, [selectedRange, streamedGoogleAnalytics, deferredRange]);

  const googleAdsRowsByDateRange = useMemo<MarketingStreamRow[]>(() => {
    if (!selectedRange) return [];
    return streamedGoogleAds.filter((entry: MarketingStreamRow) => {
      const metrics = getMarketingMetricRecord(entry, 'googleAds');
      const date = toDateOrNull(metrics.date ?? entry.date ?? entry.Date ?? entry.day);
      return isDateInRange(date, deferredRange);
    });
  }, [selectedRange, streamedGoogleAds, deferredRange]);

  const livePitchRows = useMemo<MarketingPitchRow[]>(() => {
    const source = Array.isArray(instructionData) ? instructionData : [];
    const wrappedDeals: MarketingDealCandidate[] = source.flatMap((entry) => {
      const lowerDeals = Array.isArray(entry?.deals) ? entry.deals : [];
      const upperDeals = Array.isArray((entry as any)?.Deals) ? (entry as any).Deals : [];
      const entryDeals = lowerDeals.length > 0 && upperDeals.length > 0
        ? [...lowerDeals, ...upperDeals]
        : lowerDeals.length > 0 ? lowerDeals : upperDeals;
      const fromPitchOnlyInstruction = Array.isArray(entry?.instructions) && entry.instructions.length === 0;
      return entryDeals.map((deal: any) => ({ deal, fromReportingStream: false, fromPitchOnlyInstruction }));
    });
    const flattenedDeals: MarketingDealCandidate[] = [
      ...wrappedDeals,
      ...streamedDeals.map((deal: any) => ({ deal, fromReportingStream: true, fromPitchOnlyInstruction: false })),
    ];
    const rangeStartTs = deferredRange.start.getTime();
    const rangeEndTs = deferredRange.end.getTime();
    const pitchedDeals = flattenedDeals
      .map(({ deal, fromReportingStream, fromPitchOnlyInstruction }: MarketingDealCandidate, index): MarketingPitchRow | null => {
        const pitchedBy = String(deal?.PitchedBy ?? deal?.pitchedBy ?? deal?.pitched_by ?? '').trim();
        const pitchedDateRaw = getDealPitchDateValue(deal);
        const pitchedTimeRaw = getDealPitchTimeValue(deal);
        const scenarioId = String(deal?.ScenarioId ?? deal?.scenarioId ?? deal?.scenario_id ?? '').trim();
        const statusRaw = String(deal?.Status ?? deal?.status ?? '').trim();
        const statusLower = statusRaw.toLowerCase();
        const dealId = String(deal?.DealId ?? deal?.dealId ?? '').trim();
        const instructionRef = String(deal?.InstructionRef ?? deal?.instructionRef ?? '').trim();
        const hasPitchEvidence = Boolean(
          fromReportingStream
          || fromPitchOnlyInstruction
          || dealId
          || instructionRef
          || pitchedBy
          || pitchedDateRaw
          || pitchedTimeRaw
          || scenarioId
          || pitchStatusHints.some((hint) => statusLower.includes(hint)),
        );
        if (!hasPitchEvidence) return null;

          const combinedDate = combineDateAndTime(pitchedDateRaw, pitchedTimeRaw);
          const sortTs = combinedDate?.getTime() ?? (fromReportingStream || fromPitchOnlyInstruction ? rangeEndTs : 0);
        const clientEmail = String(deal?.LeadClientEmail ?? deal?.leadClientEmail ?? '').trim();
        const prospectId = optionalStringValue(deal?.ProspectId, deal?.prospectId, deal?.prospect_id, deal?.ACID, deal?.acid);
        const serviceDescription = String(deal?.ServiceDescription ?? deal?.serviceDescription ?? '').trim();
        const areaOfWork = String(deal?.AreaOfWork ?? deal?.areaOfWork ?? '').trim();
        const status = mapDealStatusToPitchStatus(statusRaw);
        const amountLabel = formatPitchAmount(deal?.Amount ?? deal?.amount);
        const client = instructionRef || clientEmail || `Deal ${dealId || 'Unknown'}`;
        const service = serviceDescription || areaOfWork || 'General matter';
        return {
          sortTs,
          id: dealId || instructionRef || `${client}-${scenarioId || pitchedBy || index}`,
          enquiryRef: instructionRef || `Deal ${dealId || '-'}`,
          client,
          service,
          status,
          owner: pitchedBy || 'Unknown',
          sentAt: formatPitchTimestamp(combinedDate ?? (fromReportingStream || fromPitchOnlyInstruction ? deferredRange.end : null)),
          amountLabel,
          detail: `Status: ${statusRaw || 'Open'}${scenarioId ? ` | Scenario ${scenarioId}` : ''}`,
          match: {
            dealId: optionalStringValue(dealId),
            prospectId,
            acid: prospectId,
            instructionRef: optionalStringValue(instructionRef),
            email: optionalStringValue(clientEmail),
          },
        };
      })
      .filter((row): row is (MarketingPitchRow & { sortTs: number }) => Boolean(row));

    if (pitchedDeals.length === 0) return [];

    const deduped = new Map<string, MarketingPitchRow & { sortTs: number }>();
    for (const row of pitchedDeals) {
      if (!deduped.has(row.id)) deduped.set(row.id, row);
    }

    return [...deduped.values()]
      .sort((a, b) => {
        if (a.sortTs !== b.sortTs) return b.sortTs - a.sortTs;
        return b.id.localeCompare(a.id);
      })
      .filter((row) => row.sortTs > 0 && row.sortTs >= rangeStartTs && row.sortTs <= rangeEndTs)
      ;
  }, [deferredRange.end, deferredRange.start, instructionData, streamedDeals]);

  const ledgerRowsByTab = useMemo<Record<MarketingLedgerKey, MarketingLedgerRow[]>>(() => {
    const source = Array.isArray(instructionData) ? instructionData : [];
    const wrappedInstructions = source.flatMap((entry) => (Array.isArray(entry?.instructions) ? entry.instructions : []));
    const wrappedMatters = source.flatMap((entry) => {
      const matterList = Array.isArray(entry?.matters) ? entry.matters : [];
      return entry?.matter ? [...matterList, entry.matter] : matterList;
    });
    const enquirySource = streamedEnquiries.length > 0 ? streamedEnquiries : (Array.isArray(enquiries) ? enquiries : []);
    const instructionSource = streamedInstructions.length > 0 ? streamedInstructions : wrappedInstructions;
    const matterSource = streamedMatters.length > 0 ? streamedMatters : [
      ...(Array.isArray(matters) ? matters : []),
      ...wrappedMatters,
    ];

    const callsRows = streamedCalls
      .map((call, index): MarketingLedgerRow | null => {
        if (call.is_internal) return null;
        const date = toDateOrNull(call.start_time_utc);
        if (!isDateInRange(date, deferredRange)) return null;
        const isInbound = String(call.call_type ?? '').toLowerCase().includes('inbound');
        return {
          id: call.recording_id || `call-${index}`,
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(call.resolved_name, isInbound ? call.from_label : call.to_label, call.from_label, call.to_label, call.recording_id),
          secondary: `${getStringValue(call.from_label, call.from_party, 'Unknown')} -> ${getStringValue(call.to_label, call.to_party, 'Unknown')}`,
          status: call.is_internal ? 'Internal' : getStringValue(call.call_type, 'External'),
          owner: getStringValue(call.matched_team_initials, call.matched_team_email, 'Unmatched'),
          timestamp: formatPitchTimestamp(date),
          value: formatLedgerDuration(call.duration_seconds),
          detail: getStringValue(call.enquiry_ref, call.area_of_work, call.summary_text, call.channel, call.status),
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const enquiryRows = enquirySource
      .map((enquiry: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(enquiry.Touchpoint_Date ?? enquiry.Date_Created ?? enquiry.datetime);
        if (!isDateInRange(date, deferredRange)) return null;
        const name = getStringValue(
          [enquiry.First_Name, enquiry.Last_Name].filter(Boolean).join(' '),
          enquiry.Company,
          enquiry.Email,
          enquiry.ID,
        );
        const sourceValue = getStringValue(enquiry.Ultimate_Source, enquiry.source, 'Unknown source');
        const enquiryId = optionalStringValue(enquiry.ID, enquiry.id, `enquiry-${index}`);
        const acid = optionalStringValue(enquiry.acid, enquiry.ACID, enquiry.pitchEnquiryId, enquiry.processingEnquiryId, enquiry.legacyEnquiryId, enquiry.ID, enquiry.id);
        return {
          id: getStringValue(enquiryId, `enquiry-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: name,
          secondary: `${getStringValue(enquiry.Area_of_Work, enquiry.aow, 'Unknown area')} | ${getStringValue(enquiry.Method_of_Contact, enquiry.moc, 'Unknown contact')}`,
          status: sourceValue,
          owner: getStringValue(enquiry.Call_Taker, enquiry.rep, enquiry.Point_of_Contact, enquiry.poc, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(enquiry.Value, enquiry.value, '-'),
          detail: getStringValue(enquiry.Campaign, enquiry.GCLID, enquiry.Type_of_Work, enquiry.notes, enquiry.Initial_first_call_notes),
          match: {
            sourceChannel: sourceChannelFromValue(sourceValue),
            sourceValue,
            enquiryId,
            acid,
            pitchEnquiryId: optionalStringValue(enquiry.pitchEnquiryId, enquiry.pitch, enquiry.PitchEnquiryId),
            legacyEnquiryId: optionalStringValue(enquiry.legacyEnquiryId, enquiry.ID),
            processingEnquiryId: optionalStringValue(enquiry.processingEnquiryId, enquiry.id),
            email: optionalStringValue(enquiry.Email, enquiry.email),
          },
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const pitchRows: MarketingLedgerRow[] = livePitchRows.map((row) => ({
      id: row.id,
      sortTs: row.sortTs,
      primary: row.client,
      secondary: `${row.enquiryRef} | ${row.service}`,
      status: row.status === 'CHECKOUT_LINK' ? 'Checkout link' : row.status,
      owner: row.owner,
      timestamp: row.sentAt,
      value: row.amountLabel,
      detail: row.detail,
      match: row.match,
    }));

    const instructionRows = instructionSource
      .map((instruction: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(instruction.CreatedDate ?? instruction.SubmissionDate ?? instruction.createdAt ?? instruction.Date_Created);
        if (!isDateInRange(date, deferredRange)) return null;
        const instructionRef = optionalStringValue(instruction.InstructionRef, instruction.instructionRef);
        const matterRef = optionalStringValue(instruction.MatterId, instruction.MatterID, instruction.matterId, instruction.matter_id);
        return {
          id: getStringValue(instructionRef, instruction.ProspectId, instruction.id, `instruction-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(instructionRef, instruction.Email, instruction.ClientName, `Instruction ${index + 1}`),
          secondary: `${getStringValue(instruction.Stage, instruction.workflow, 'Workflow')} | ${getStringValue(matterRef, 'No matter')}`,
          status: getStringValue(instruction.Status, instruction.Stage, 'Open'),
          owner: getStringValue(instruction.Owner, instruction.ResponsibleSolicitor, instruction.AssignedTo, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(instruction.ClientId, instruction.ProspectId, '-'),
          detail: getStringValue(instruction.ServiceDescription, instruction.AreaOfWork, instruction.workflow, instruction.Email),
          match: {
            instructionRef,
            matterRef,
            matterId: matterRef,
            prospectId: optionalStringValue(instruction.ProspectId, instruction.prospectId, instruction.id, instruction.acid),
            clientId: optionalStringValue(instruction.ClientId, instruction.clientId),
            email: optionalStringValue(instruction.Email, instruction.email),
          },
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const matterRows = matterSource
      .map((matter: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(matter.OpenDate ?? matter.openDate ?? matter.CreatedDate ?? matter.mod_stamp);
        if (!isDateInRange(date, deferredRange)) return null;
        const matterId = optionalStringValue(matter.MatterID, matter.matterId, matter.UniqueID, matter.id);
        const displayNumber = optionalStringValue(matter.DisplayNumber, matter.displayNumber);
        const instructionRef = optionalStringValue(matter.InstructionRef, matter.instructionRef);
        return {
          id: getStringValue(matterId, displayNumber, `matter-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(displayNumber, matterId, `Matter ${index + 1}`),
          secondary: getStringValue(matter.PracticeArea, matter.practiceArea, 'Unknown area'),
          status: getStringValue(matter.Status, matter.status, matter.CloseDate ? 'Closed' : 'Active'),
          owner: getStringValue(matter.ResponsibleSolicitor, matter.OriginatingSolicitor, matter.responsibleSolicitor, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(matter.ApproxValue, matter.value, '-'),
          detail: getStringValue(matter.OriginatingSolicitor, matter.originatingSolicitor, matter.ResponsibleSolicitor, matter.responsibleSolicitor, 'Unassigned'),
          match: {
            matterId,
            matterRef: displayNumber,
            instructionRef,
            clientId: optionalStringValue(matter.ClientID, matter.clientId),
            email: optionalStringValue(matter.ClientEmail, matter.clientEmail),
          },
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const collectedRows = streamedRecoveredFees
      .map((fee: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(fee.payment_date ?? fee.date ?? fee.created_at);
        if (!isDateInRange(date, deferredRange)) return null;
        const matterId = optionalStringValue(fee.matter_id, fee.matterId, fee.MatterID);
        return {
          id: getStringValue(fee.bill_id, fee.id, `${fee.payment_date}-${fee.matter_id}-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(fee.description, fee.matter_id ? `Matter ${fee.matter_id}` : '', `Collected item ${index + 1}`),
          secondary: getStringValue(fee.kind, fee.type, fee.activity_type, 'Collected fee'),
          status: getStringValue(fee.kind, fee.type, 'Collected'),
          owner: getStringValue(fee.user_name, fee.user_id, 'Unknown'),
          timestamp: formatPitchTimestamp(date),
          value: formatLedgerMoney(fee.payment_allocated ?? fee.amount ?? fee.total),
          detail: getStringValue(fee.activity_type, fee.bill_id ? `Bill ${fee.bill_id}` : '', fee.matter_id ? `Matter ${fee.matter_id}` : ''),
          match: {
            matterId,
            billId: optionalStringValue(fee.bill_id, fee.billId),
          },
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const seoRows = streamedGoogleAnalytics
      .map((entry: MarketingStreamRow, index: number): MarketingLedgerRow | null => {
        const metrics = getMarketingMetricRecord(entry, 'googleAnalytics');
        const date = toDateOrNull(metrics.date ?? entry.date ?? entry.Date ?? entry.day);
        if (!isDateInRange(date, deferredRange)) return null;
        return {
          id: getStringValue(metrics.date, entry.date, entry.Date, `seo-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(metrics.source, metrics.channel, 'Organic search'),
          secondary: `${getStringValue(metrics.sessions, metrics.Sessions, '0')} sessions | ${getStringValue(metrics.activeUsers, metrics.users, metrics.Users, '0')} users`,
          status: 'SEO',
          owner: 'GA4',
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(metrics.keyEvents, metrics.conversions, metrics.screenPageViews, metrics.pageViews, metrics.pageviews, '-'),
          detail: getStringValue(metrics.page, metrics.channelGrouping, metrics.bounceRate != null ? `Bounce ${metrics.bounceRate}%` : ''),
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const ppcRows = streamedGoogleAds
      .map((entry: MarketingStreamRow, index: number): MarketingLedgerRow | null => {
        const metrics = getMarketingMetricRecord(entry, 'googleAds');
        const date = toDateOrNull(metrics.date ?? entry.date ?? entry.Date ?? entry.day);
        if (!isDateInRange(date, deferredRange)) return null;
        const costMicros = Number(metrics.costMicros ?? metrics.cost_micros ?? 0);
        const cost = metrics.cost == null && Number.isFinite(costMicros) && costMicros > 0 ? costMicros / 1000000 : metrics.cost;
        return {
          id: getStringValue(metrics.date, entry.date, entry.Date, `ppc-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(metrics.campaign, metrics.Campaign, 'Google Ads'),
          secondary: `${getStringValue(metrics.impressions, metrics.Impressions, '0')} impressions | ${getStringValue(metrics.clicks, metrics.Clicks, '0')} clicks`,
          status: 'PPC',
          owner: 'Google Ads',
          timestamp: formatPitchTimestamp(date),
          value: formatLedgerMoney(cost),
          detail: getStringValue(metrics.conversions != null ? `Conversions ${metrics.conversions}` : '', metrics.ctr != null ? `CTR ${metrics.ctr}%` : '', metrics.cpc != null ? `CPC ${metrics.cpc}` : ''),
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    return {
      calls: callsRows,
      enquiries: enquiryRows,
      pitches: pitchRows,
      instructions: instructionRows,
      matters: matterRows,
      collectedTime: collectedRows,
      seo: seoRows,
      ppc: ppcRows,
    };
  }, [deferredRange, enquiries, instructionData, livePitchRows, matters, streamedCalls, streamedEnquiries, streamedGoogleAds, streamedGoogleAnalytics, streamedInstructions, streamedMatters, streamedRecoveredFees]);

  // Do not expose ledger rows until a reporting window (range) is selected.
  const activeLedgerRows = !selectedRange ? [] : (ledgerRowsByTab[activeLedgerTab] ?? []);
  const activeLedgerMeta = marketingLedgerTabs.find((tab) => tab.key === activeLedgerTab) ?? marketingLedgerTabs[0];
  const activeLedgerColumnLabels = getLedgerColumnLabels(activeLedgerMeta.key);
  const activeDatasetState = ledgerDatasets[activeLedgerMeta.datasetLabel];
  const activeDatasetStatus = !selectedRange
    ? 'idle'
    : activeLedgerMeta.key === 'pitches' && livePitchRows.length > 0
    ? 'ready'
    : activeDatasetState?.status ?? (activeLedgerRows.length > 0 ? 'ready' : 'idle');
  const getFeedStatus = (datasetLabel: string): MarketingFeedStatus => {
    const datasetState = ledgerDatasets[datasetLabel];
    return !selectedRange ? 'idle' : (datasetState?.status ?? (ledgerStreamComplete ? 'error' : 'loading'));
  };
  const googleAnalyticsFeedStatus = getFeedStatus('googleAnalytics');
  const googleAdsFeedStatus = getFeedStatus('googleAds');
  const googleAdsFeedError = ledgerDatasets.googleAds?.error;
  const googleAdsConfigAttention = googleAdsFeedStatus === 'error' && isGoogleAdsConfigError(googleAdsFeedError);
  const datasetFeedRows = marketingFeedTabs.map((tab) => {
    const datasetState = ledgerDatasets[tab.datasetLabel];
    const status = getFeedStatus(tab.datasetLabel);
    const detail = status === 'error'
      ? (tab.datasetLabel === 'googleAds' && isGoogleAdsConfigError(datasetState?.error) ? 'Config needed' : 'Retry needed')
      : undefined;
    return {
      key: tab.datasetLabel,
      label: tab.label,
      status,
      detail,
    } as const;
  });
  const datasetFeedTotal = datasetFeedRows.length;
  const datasetFeedCompleted = datasetFeedRows.filter((feed) => feed.status === 'ready' || feed.status === 'error').length;
  const datasetFeedErrors = datasetFeedRows.filter((feed) => feed.status === 'error').length;
  const blockingDatasetFeedErrors = datasetFeedRows.filter((feed) => feed.status === 'error' && !(feed.key === 'googleAds' && googleAdsConfigAttention)).length;
  const marketingHasHydrationAttention = datasetFeedErrors > 0;
  const marketingHasHydrationErrors = blockingDatasetFeedErrors > 0;
  const marketingHydrationPending = Boolean(selectedRange) && (isRangeSwitching || !ledgerStreamComplete || datasetFeedRows.some((feed) => feed.status === 'loading' || feed.status === 'idle'));
  const marketingHydrationVisible = Boolean(selectedRange) && (marketingHydrationPending || marketingHasHydrationAttention);
  const feedSyncLabel = datasetFeedCompleted > 0 ? `${datasetFeedCompleted}/${datasetFeedTotal} feeds syncing` : 'feeds syncing';
  const marketingHydrationPhaseLabel = marketingHasHydrationErrors
    ? 'Marketing pull needs a retry'
    : isRangeSwitching
      ? `Preparing ${selectedRangeLabel.toLowerCase()}`
      : ledgerStreamConnected
        ? `Pulling ${datasetFeedCompleted} of ${datasetFeedTotal} feeds`
        : 'Connecting marketing feeds';
  const marketingHydrationProgressLabel = marketingHasHydrationErrors
    ? `${datasetFeedErrors} feed${datasetFeedErrors === 1 ? '' : 's'} need attention`
    : ledgerStreamConnected
      ? `${datasetFeedCompleted} of ${datasetFeedTotal} reporting feeds settled`
      : 'Opening the reporting stream for this financial year';
  const hasSelectedRange = Boolean(selectedRange);
  const isReportingWindowSettled = localPreviewWithoutData || (hasSelectedRange && !marketingHydrationPending && !marketingHasHydrationErrors);
  const coreChannelTelemetrySettled = isTerminalFeedStatus(googleAnalyticsFeedStatus) && isTerminalFeedStatus(googleAdsFeedStatus);
  const hasCoreChannelTelemetryData = googleAnalyticsRowsByDateRange.length > 0 || googleAdsRowsByDateRange.length > 0;
  const marketingWorkspaceIsPreparing = hasSelectedRange && !coreChannelTelemetrySettled && !hasCoreChannelTelemetryData;
  const marketingWorkspaceIsRefreshing = hasSelectedRange && marketingHydrationPending && !marketingWorkspaceIsPreparing && !marketingHasHydrationErrors;
  const [marketingReadyCueVisible, setMarketingReadyCueVisible] = useState(false);
  const marketingReadyRailVisible = marketingReadyCueVisible && isReportingWindowSettled && !localHydrationDismissed;
  const shouldSurfaceHydrationPanel = marketingHydrationVisible && (marketingHydrationPending || !marketingReadySeen || marketingHasHydrationErrors);
  const marketingHydrationPanelVisible = (shouldSurfaceHydrationPanel || marketingReadyRailVisible) && !localHydrationDismissed;
  const shouldShowMarketingWorkspace = hasSelectedRange || localPreviewWithoutData;
  const reportingStreamStatusLabel = marketingWorkspaceIsPreparing
    ? (ledgerStreamConnected && ledgerStreamProgress.completed > 0 ? `${ledgerStreamProgress.completed}/${ledgerStreamProgress.total}` : 'syncing')
    : ledgerStreamComplete
      ? 'ready'
      : ledgerStreamConnected
        ? `${ledgerStreamProgress.completed}/${ledgerStreamProgress.total}`
        : 'warming';
  const lockedWindowStatusText = localPreviewWithoutData
    ? 'Local preview: no data loaded'
    : `${formatRangeWindow(activeRange)} | ${marketingHasHydrationErrors
      ? 'feed retry needed'
      : googleAdsConfigAttention
        ? 'PPC config needed'
      : marketingWorkspaceIsPreparing
        ? feedSyncLabel
        : marketingWorkspaceIsRefreshing
          ? `${feedSyncLabel} in background`
          : 'feeds settled'}`;
  const lockedWindowStateClass = marketingHasHydrationErrors
    ? 'marketing-locked-window--attention'
    : googleAdsConfigAttention
      ? 'marketing-locked-window--attention'
    : marketingWorkspaceIsPreparing
      ? 'marketing-locked-window--syncing'
      : marketingWorkspaceIsRefreshing
        ? 'marketing-locked-window--refreshing'
        : 'marketing-locked-window--settled';
  const lockedWindowRailColour = marketingHasHydrationErrors
    ? colours.cta
    : googleAdsConfigAttention
      ? colours.cta
    : marketingWorkspaceIsPreparing || marketingWorkspaceIsRefreshing
      ? colours.highlight
      : colours.green;
  const lockedWindowSurface = isDarkMode ? 'rgba(10, 26, 45, 0.92)' : 'rgba(255, 255, 255, 0.96)';
  const lockedWindowBorder = isDarkMode ? 'rgba(142, 209, 255, 0.22)' : 'rgba(13, 47, 96, 0.14)';
  const lockedWindowAccent = isDarkMode ? '#8ed1ff' : colours.helixBlue;
  const lockedWindowSubTextColor = isDarkMode ? '#d1d5db' : '#4b5563';
  const marketingTimelineStatusLabel = marketingHasHydrationErrors
    ? `${blockingDatasetFeedErrors} feed${blockingDatasetFeedErrors === 1 ? '' : 's'} need retry`
    : googleAdsConfigAttention
      ? 'PPC config needed'
    : marketingWorkspaceIsPreparing
      ? feedSyncLabel
      : marketingWorkspaceIsRefreshing
        ? 'background refresh'
        : 'timeline settled';
  const marketingUnlockToastDetail = googleAdsConfigAttention
    ? `${selectedRangeLabel} landed with PPC config attention.`
    : `${selectedRangeLabel} feeds settled.`;

  useEffect(() => {
    if (marketingHydrationPending) setLocalHydrationDismissed(false);
  }, [marketingHydrationPending]);

  useEffect(() => {
    setMarketingReadySeen(readMarketingReadySeen(activeRange));
    setMarketingReadyCueVisible(false);
    setLocalHydrationDismissed(false);
  }, [activeRange]);

  useEffect(() => {
    setContent(
      <NavigatorDetailBar
        onBack={() => {}}
        showBackButton={false}
        staticLabel="Marketing workspace"
      />,
    );
    // No cleanup to avoid navigator race with the next tab writing its own content.
  }, [setContent]);

  useEffect(() => {
    if (marketingHasHydrationAttention) setLocalHydrationDismissed(false);
  }, [marketingHasHydrationAttention]);

  useEffect(() => {
    const wasSettled = previousReportingWindowSettledRef.current;
    previousReportingWindowSettledRef.current = isReportingWindowSettled;

    if (!hasSelectedRange || marketingHydrationPending) {
      setMarketingUnlockToastVisible(false);
      setMarketingReadyCueVisible(false);
      return undefined;
    }

    if (isReportingWindowSettled && !wasSettled) {
      const wasAlreadySeen = marketingReadySeen;
      storeMarketingReadySeen(activeRange);
      setMarketingReadySeen(true);
      setMarketingReadyCueVisible(true);
      setMarketingUnlockToastVisible(!wasAlreadySeen);
      if (wasAlreadySeen) return undefined;
      const timeout = window.setTimeout(() => setMarketingUnlockToastVisible(false), 3200);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [activeRange, hasSelectedRange, isReportingWindowSettled, marketingHydrationPending, marketingReadySeen]);

  const handleReturnToMarketingMasthead = () => {
    setMarketingReadyCueVisible(false);
    setLocalHydrationDismissed(true);
    if (typeof document === 'undefined') return;
    document.querySelector('[data-helix-region="marketing/intent-strip"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // Marketing rides the shared .app-scroll-region. Hide scrollbar chrome by
  // default and let UserBubble's show-scrollbars toggle reveal it on demand.
  useLayoutEffect(() => {
    const region = document.querySelector('.app-scroll-region') as HTMLElement | null;
    if (!region) return;
    region.classList.add('marketing-scroll-region');
    return () => {
      region.classList.remove('marketing-scroll-region');
    };
  }, []);

  return (
    <div
      data-helix-region="tab/marketing"
      className={marketingWorkspaceIsPreparing ? 'marketing-workspace-processing' : 'marketing-workspace-ready'}
      style={{
        minHeight: 'calc(100vh - 140px)',
        padding: '0 22px 32px',
        background: isDarkMode ? colours.dark.background : colours.grey,
        display: 'grid',
        gap: 16,
        position: 'relative',
      }}
    >
      <AccessMatrixConnector isDarkMode={isDarkMode} surface="marketing" />
      {shouldShowMarketingWorkspace && (
      <section data-helix-region="marketing/intent-strip" style={{ padding: '14px 0 0' }}>
        <div
          className={`marketing-locked-window ${lockedWindowStateClass}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            padding: '11px 14px 11px 16px',
            background: lockedWindowSurface,
            border: `1px solid ${lockedWindowBorder}`,
            boxShadow: isDarkMode ? '0 12px 28px rgba(0, 3, 25, 0.20)' : '0 12px 26px rgba(6, 23, 51, 0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 40,
              minWidth: 0,
              flex: '1 1 auto',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 4,
                height: 28,
                flex: '0 0 auto',
                backgroundColor: lockedWindowRailColour,
                borderRadius: 999,
                boxShadow: `0 0 0 1px rgba(255, 255, 255, 0.10), 0 0 16px ${lockedWindowRailColour}33`,
              }}
            />
            <span style={{ display: 'block', minWidth: 0 }}>
              <span style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: lockedWindowAccent,
              }}>
                Financial year to date live
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  color: lockedWindowSubTextColor,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {lockedWindowStatusText}
              </span>
            </span>
          </div>

          <div
            data-helix-region="marketing/reporting-window/actions"
            style={{
              flex: '0 0 auto',
              minWidth: 0,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <span
              aria-label="Marketing financial year to date status"
              style={{
                minHeight: 34,
                padding: '0 13px',
                borderRadius: 0,
                border: `1px solid ${lockedWindowBorder}`,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(13, 47, 96, 0.06)',
                color: lockedWindowAccent,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              FYTD locked
            </span>
          </div>
        </div>
      </section>
      )}

      {marketingUnlockToastVisible && (
        <div
          data-helix-region="marketing/unlock-toast"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: 22,
            bottom: 22,
            zIndex: 2098,
            display: 'grid',
            gap: 3,
            minWidth: 260,
            padding: '12px 14px',
            border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.46)' : 'rgba(32, 178, 108, 0.36)'}`,
            background: isDarkMode ? 'rgba(6, 23, 51, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            boxShadow: isDarkMode ? '0 16px 36px rgba(0, 3, 25, 0.38)' : '0 16px 36px rgba(6, 23, 51, 0.14)',
            color: isDarkMode ? colours.dark.text : colours.darkBlue,
            animation: 'marketing-unlock-toast 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: colours.green }}>
            Marketing workspace ready
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#374151' }}>
            {marketingUnlockToastDetail}
          </span>
        </div>
      )}

      {shouldShowMarketingWorkspace ? (
      <div
        data-helix-region="marketing/production-frame"
        className="marketing-production-frame marketing-production-frame--unlocked"
        aria-busy={marketingHydrationPending}
        style={{ display: 'grid', gap: 18, position: 'relative' }}
      >
        <div data-helix-region="marketing/performance" style={{ display: 'grid', gap: 12 }}>
          <div
            data-helix-region="marketing/performance/live-workspace"
            style={{
              overflow: 'hidden',
              position: 'relative',
              minHeight: 360,
            }}
          >
            <div style={{ opacity: 1, transition: 'opacity 180ms ease' }}>
              <MarketingPerformanceWorkspace
                isDarkMode={isDarkMode}
                googleAnalyticsRows={localPreviewWithoutData ? [] : googleAnalyticsRowsByDateRange}
                googleAdsRows={localPreviewWithoutData ? [] : googleAdsRowsByDateRange}
                ledgerRowsByTab={localPreviewWithoutData ? {} : ledgerRowsByTab}
                isBlueprintMode={isBlueprintMode || marketingWorkspaceIsPreparing}
                timelineRangeLabel={formatRangeWindow(activeRange)}
                timelineRangeStartTs={activeRange.start.getTime()}
                timelineRangeEndTs={activeRange.end.getTime()}
                timelineStatusLabel={marketingTimelineStatusLabel}
                timelineIsProcessing={marketingWorkspaceIsPreparing || marketingWorkspaceIsRefreshing}
              />
            </div>
          </div>
        </div>

        <section
          data-helix-region="marketing/source-ledgers"
          className="marketing-source-ledgers"
          style={{
            ...panelStyle(isDarkMode),
            display: 'grid',
            gap: 12,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <h2 style={{ ...sectionHeadingStyle(isDarkMode), fontSize: 15 }}>Evidence ledgers</h2>
              <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#4b5563' }}>
                {marketingWorkspaceIsPreparing
                  ? 'Preparing source ledgers'
                  : `${activeLedgerMeta.label} | ${getLedgerCountLabel(activeDatasetStatus, activeLedgerRows.length)} rows | ${activeDatasetStatus}`}
              </span>
            </div>
            <span
              role="status"
              aria-live="polite"
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: ledgerStreamConnected || ledgerStreamComplete ? (isDarkMode ? '#9de7c2' : '#0f6c4c') : (isDarkMode ? colours.subtleGrey : colours.greyText),
              }}
            >
              Reporting stream {reportingStreamStatusLabel}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Marketing source ledger"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
              gap: 0,
              border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
              background: isDarkMode ? 'rgba(10, 26, 45, 0.82)' : 'rgba(255, 255, 255, 0.78)',
            }}
          >
            {marketingLedgerTabs.map((tab) => {
              const selected = activeLedgerTab === tab.key;
              const rowCount = marketingWorkspaceIsPreparing ? 0 : (selectedRange ? (ledgerRowsByTab[tab.key]?.length ?? 0) : 0);
              const datasetStatus = marketingWorkspaceIsPreparing
                ? 'loading'
                : !selectedRange
                ? 'idle'
                : (tab.key === 'pitches' && rowCount > 0
                  ? 'ready'
                  : ledgerDatasets[tab.datasetLabel]?.status ?? (rowCount > 0 ? 'ready' : 'idle'));
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveLedgerTab(tab.key)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 6,
                    alignItems: 'center',
                    border: 'none',
                    borderRight: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                    borderBottom: selected ? `2px solid ${isDarkMode ? '#8ed1ff' : colours.helixBlue}` : '2px solid transparent',
                    padding: '7px 9px 6px',
                    background: selected
                      ? (isDarkMode ? 'rgba(20, 73, 116, 0.72)' : colours.highlightBlue)
                      : 'transparent',
                    color: selected
                      ? (isDarkMode ? '#d8efff' : colours.helixBlue)
                      : (isDarkMode ? '#d1d5db' : '#374151'),
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tab.label}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.68, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {datasetStatus}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>
                    {marketingWorkspaceIsPreparing ? 'Syncing' : getLedgerCountLabel(datasetStatus, rowCount)}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            data-helix-region={`marketing/source-ledgers/${activeLedgerTab}`}
            style={{
              border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
              background: reportingPanelBackground(isDarkMode, 'elevated'),
              display: 'grid',
              minHeight: 250,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.45fr) minmax(86px, 0.42fr) minmax(110px, 0.48fr) minmax(90px, 0.42fr) minmax(0, 0.95fr)',
                gap: 8,
                padding: '7px 10px 6px',
                borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
              }}
            >
              <span>{activeLedgerColumnLabels.record}</span>
              <span>{activeLedgerColumnLabels.status}</span>
              <span>{activeLedgerColumnLabels.value}</span>
              <span>{activeLedgerColumnLabels.owner}</span>
              <span>{activeLedgerColumnLabels.evidence}</span>
            </div>

              <div className="marketing-scroll-chrome" style={{ maxHeight: 380, overflowY: 'auto' }}>
              {marketingWorkspaceIsPreparing || !selectedRange ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`skeleton-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.45fr) minmax(86px, 0.42fr) minmax(110px, 0.48fr) minmax(90px, 0.42fr) minmax(0, 0.95fr)',
                      gap: 8,
                      padding: '12px 10px',
                      borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                      alignItems: 'center',
                    }}
                  >
                    <span className="marketing-skeleton-line" style={{ height: 16, width: '60%' }} />
                    <span className="marketing-skeleton-line" style={{ height: 12, width: 80 }} />
                    <span className="marketing-skeleton-line" style={{ height: 14, width: 70 }} />
                    <span className="marketing-skeleton-line" style={{ height: 14, width: 70 }} />
                    <span className="marketing-skeleton-line" style={{ height: 12, width: '40%' }} />
                  </div>
                ))
              ) : (
                activeLedgerRows.map((row, index) => {
                  const isLast = index === activeLedgerRows.length - 1;
                  return (
                  <div
                    key={row.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.45fr) minmax(86px, 0.42fr) minmax(110px, 0.48fr) minmax(90px, 0.42fr) minmax(0, 0.95fr)',
                      gap: 8,
                      padding: '7px 10px 6px',
                      borderBottom: isLast ? 'none' : `1px solid ${reportingPanelBorder(isDarkMode)}`,
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.darkBlue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.primary}
                      </span>
                      <span style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.timestamp} | {row.secondary}
                      </span>
                    </span>
                    <span
                      style={{
                        justifySelf: 'start',
                        display: 'inline-flex',
                        alignItems: 'center',
                        maxWidth: '100%',
                        padding: '2px 6px',
                        border: `1px solid ${isDarkMode ? 'rgba(84, 169, 228, 0.42)' : 'rgba(54, 144, 206, 0.24)'}`,
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.08)',
                        color: isDarkMode ? '#8ed1ff' : colours.helixBlue,
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.status}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.darkBlue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.value}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.owner}
                    </span>
                    <span style={{ fontSize: 10, lineHeight: 1.35, color: isDarkMode ? '#d1d5db' : '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.detail || '-'}
                    </span>
                  </div>
                  );
                })
              )}
            </div>

            {!marketingWorkspaceIsPreparing && activeLedgerRows.length === 0 && (
              <div style={{ padding: '14px 10px', fontSize: 11, color: isDarkMode ? '#d1d5db' : '#4b5563' }}>
                {activeDatasetStatus === 'loading' || activeDatasetStatus === 'idle'
                  ? (!selectedRange
                    ? 'Choose a reporting window to load these evidence ledgers.'
                    : `Loading ${activeLedgerMeta.label.toLowerCase()} from the shared reporting feed...`)
                  : activeDatasetStatus === 'error'
                    ? `${activeLedgerMeta.label} feed is unavailable from the shared reporting stream.`
                    : `No ${activeLedgerMeta.label.toLowerCase()} records in this date range yet.`}
              </div>
            )}
          </div>
        </section>
      </div>
      ) : null}

      <MarketingHydrationChrome
        isDarkMode={isDarkMode}
        visible={marketingHydrationPanelVisible}
        blocked={false}
        dismissible={Boolean(selectedRange) && marketingHydrationPending}
        rangeLabel={`${selectedRangeLabel}: ${formatRangeWindow(activeRange)}`}
        phaseLabel={marketingHydrationPhaseLabel}
        progressLabel={marketingHydrationProgressLabel}
        completed={datasetFeedCompleted}
        total={datasetFeedTotal}
        feeds={datasetFeedRows}
        hasErrors={marketingHasHydrationErrors}
        isComplete={isReportingWindowSettled}
        onReturnToMarketing={handleReturnToMarketingMasthead}
        onDismiss={() => setLocalHydrationDismissed(true)}
        onRetry={() => startLedgerStream({
          datasets: ledgerStreamDatasetList,
          queryParams: reportingLedgerQueryParams,
        })}
      />

      <style>{`
        .app-scroll-region.marketing-scroll-region {
          scrollbar-width: none;
        }

        .marketing-scroll-chrome {
          scrollbar-width: none;
        }

        .app-scroll-region.marketing-scroll-region::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .marketing-scroll-chrome::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        html[data-show-scrollbars="1"] .app-scroll-region.marketing-scroll-region {
          scrollbar-width: thin;
          scrollbar-color: rgba(54, 144, 206, 0.55) transparent;
          scrollbar-gutter: stable;
        }

        html[data-show-scrollbars="1"] .marketing-scroll-chrome {
          scrollbar-width: thin;
          scrollbar-color: rgba(54, 144, 206, 0.55) transparent;
          scrollbar-gutter: stable;
        }

        html[data-show-scrollbars="1"] .app-scroll-region.marketing-scroll-region::-webkit-scrollbar {
          width: 10px !important;
          height: 10px !important;
          display: block;
        }

        html[data-show-scrollbars="1"] .marketing-scroll-chrome::-webkit-scrollbar {
          width: 8px !important;
          height: 8px !important;
          display: block;
        }

        html[data-show-scrollbars="1"] .app-scroll-region.marketing-scroll-region::-webkit-scrollbar-thumb {
          background-color: rgba(54, 144, 206, 0.55);
          border-radius: 999px;
        }

        html[data-show-scrollbars="1"] .marketing-scroll-chrome::-webkit-scrollbar-thumb {
          background-color: rgba(54, 144, 206, 0.55);
          border-radius: 999px;
        }

        html[data-show-scrollbars="1"] .app-scroll-region.marketing-scroll-region::-webkit-scrollbar-thumb:hover {
          background-color: rgba(54, 144, 206, 0.8);
        }

        html[data-show-scrollbars="1"] .marketing-scroll-chrome::-webkit-scrollbar-thumb:hover {
          background-color: rgba(54, 144, 206, 0.8);
        }

        .marketing-production-frame--unlocked {
          animation: marketing-production-unlock 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .marketing-workspace-processing .marketing-performance-workspace,
        .marketing-workspace-processing .marketing-source-ledgers {
          animation: marketing-skeleton-settle 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .marketing-workspace-ready .marketing-locked-window {
          animation: marketing-ready-soft-pop 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .marketing-locked-window--syncing::after,
        .marketing-locked-window--refreshing::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(54, 144, 206, 0.92), transparent);
          animation: marketing-window-progress 1500ms ease-in-out infinite;
        }

        .marketing-locked-window--settled::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          background: rgba(32, 178, 108, 0.58);
        }

        .marketing-processing-panel {
          transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, width 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .marketing-processing-panel.is-folded {
          transform: translateY(4px) scale(0.985);
        }

        .marketing-skeleton-line {
          display: block;
          position: relative;
          overflow: hidden;
          border-radius: 2px;
          background: ${isDarkMode ? 'rgba(209, 213, 219, 0.11)' : 'rgba(13, 47, 96, 0.075)'};
        }

        .marketing-skeleton-line::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, ${isDarkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.44)'}, transparent);
          animation: marketing-skeleton-sheen 1800ms ease-in-out infinite;
        }

        @keyframes marketing-production-unlock {
          from {
            opacity: 0;
            transform: translateY(12px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes marketing-unlock-toast {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes marketing-skeleton-settle {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes marketing-ready-soft-pop {
          from {
            box-shadow: 0 0 0 rgba(32, 178, 108, 0);
          }

          to {
            box-shadow: ${isDarkMode ? '0 12px 28px rgba(0, 3, 25, 0.20)' : '0 12px 26px rgba(6, 23, 51, 0.08)'};
          }
        }

        @keyframes marketing-skeleton-sheen {
          0% {
            transform: translateX(-100%);
          }

          52%, 100% {
            transform: translateX(100%);
          }
        }

        @keyframes marketing-window-progress {
          0% {
            transform: translateX(-100%);
          }

          52%, 100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
};

export default MarketingHome;