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
};

type MarketingStreamRow = Record<string, any>;

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

const marketingPageRanges: Array<{ key: MarketingPageRangeKey; label: string; shortLabel: string; disabled?: boolean; disabledReason?: string }> = [
  { key: 'lastWeek', label: 'Current week', shortLabel: 'Current week' },
  { key: 'month', label: 'Current Month', shortLabel: 'Current Month' },
  { key: 'threeMonths', label: 'Last month', shortLabel: 'Last month' },
  { key: 'financialYearToDate', label: '90 days', shortLabel: '90 days' },
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

function getMarketingRangeRefreshEstimate(key: MarketingPageRangeKey): string {
  switch (key) {
    case 'lastWeek':
      return '2-4s';
    case 'month':
      return '3-5s';
    case 'threeMonths':
      return '4-7s';
    case 'financialYearToDate':
      return '6-10s';
    default:
      return '3-5s';
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
  const [selectedRange, setSelectedRange] = useState<MarketingPageRangeKey | null>(null);
  const [localPreviewWithoutData, setLocalPreviewWithoutData] = useState(false);
  const [hoveredRange, setHoveredRange] = useState<MarketingPageRangeKey | null>(null);
  const [activeLedgerTab, setActiveLedgerTab] = useState<MarketingLedgerKey>('enquiries');
  const [localHydrationDismissed, setLocalHydrationDismissed] = useState(false);
  const [rangeRefreshNonce, setRangeRefreshNonce] = useState(0);
  const [marketingUnlockToastVisible, setMarketingUnlockToastVisible] = useState(false);
  const previousReportingWindowSettledRef = useRef(false);
  const canUseLocalPreviewWithoutData = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
  const isBlueprintMode = !selectedRange && !localPreviewWithoutData;
  const effectiveRangeKey = selectedRange ?? 'financialYearToDate';
  const activeRange = useMemo(() => computeMarketingPageRange(effectiveRangeKey), [effectiveRangeKey]);
  const deferredRange = useDeferredValue(activeRange);
  const isRangeSwitching = deferredRange !== activeRange;
  const selectedRangeLabel = marketingPageRanges.find((item) => item.key === effectiveRangeKey)?.label ?? 'Selected';
  const hoveredRangeDetail = hoveredRange
    ? `${marketingPageRanges.find((item) => item.key === hoveredRange)?.shortLabel ?? selectedRangeLabel} refresh est. ${getMarketingRangeRefreshEstimate(hoveredRange)}`
    : selectedRange
      ? null
      : 'Choose a reporting window before pulling marketing feeds';
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
  }, [ledgerStreamDatasetList, reportingLedgerQueryParams, rangeRefreshNonce, selectedRange, startLedgerStream, stopLedgerStream]);

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
      .map(({ deal, fromReportingStream, fromPitchOnlyInstruction }: MarketingDealCandidate, index) => {
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
        return {
          id: getStringValue(enquiry.ID, enquiry.id, `enquiry-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: name,
          secondary: `${getStringValue(enquiry.Area_of_Work, enquiry.aow, 'Unknown area')} | ${getStringValue(enquiry.Method_of_Contact, enquiry.moc, 'Unknown contact')}`,
          status: getStringValue(enquiry.Ultimate_Source, enquiry.source, 'Unknown source'),
          owner: getStringValue(enquiry.Call_Taker, enquiry.rep, enquiry.Point_of_Contact, enquiry.poc, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(enquiry.Value, enquiry.value, '-'),
          detail: getStringValue(enquiry.Campaign, enquiry.GCLID, enquiry.Type_of_Work, enquiry.notes, enquiry.Initial_first_call_notes),
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
    }));

    const instructionRows = instructionSource
      .map((instruction: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(instruction.CreatedDate ?? instruction.SubmissionDate ?? instruction.createdAt ?? instruction.Date_Created);
        if (!isDateInRange(date, deferredRange)) return null;
        return {
          id: getStringValue(instruction.InstructionRef, instruction.instructionRef, instruction.ProspectId, instruction.id, `instruction-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(instruction.InstructionRef, instruction.Email, instruction.ClientName, `Instruction ${index + 1}`),
          secondary: `${getStringValue(instruction.Stage, instruction.workflow, 'Workflow')} | ${getStringValue(instruction.MatterId, instruction.MatterID, 'No matter')}`,
          status: getStringValue(instruction.Status, instruction.Stage, 'Open'),
          owner: getStringValue(instruction.Owner, instruction.ResponsibleSolicitor, instruction.AssignedTo, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(instruction.ClientId, instruction.ProspectId, '-'),
          detail: getStringValue(instruction.ServiceDescription, instruction.AreaOfWork, instruction.workflow, instruction.Email),
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const matterRows = matterSource
      .map((matter: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(matter.OpenDate ?? matter.openDate ?? matter.CreatedDate ?? matter.mod_stamp);
        if (!isDateInRange(date, deferredRange)) return null;
        return {
          id: getStringValue(matter.MatterID, matter.matterId, matter.UniqueID, matter.DisplayNumber, `matter-${index}`),
          sortTs: date?.getTime() ?? 0,
          primary: getStringValue(matter.DisplayNumber, matter.MatterID, matter.matterId, `Matter ${index + 1}`),
          secondary: getStringValue(matter.PracticeArea, matter.practiceArea, 'Unknown area'),
          status: getStringValue(matter.Status, matter.status, matter.CloseDate ? 'Closed' : 'Active'),
          owner: getStringValue(matter.ResponsibleSolicitor, matter.OriginatingSolicitor, matter.responsibleSolicitor, 'Unassigned'),
          timestamp: formatPitchTimestamp(date),
          value: getStringValue(matter.ApproxValue, matter.value, '-'),
          detail: getStringValue(matter.OriginatingSolicitor, matter.originatingSolicitor, matter.ResponsibleSolicitor, matter.responsibleSolicitor, 'Unassigned'),
        };
      })
      .filter((row): row is MarketingLedgerRow => Boolean(row))
      .sort(sortLedgerRowsByTimestamp);

    const collectedRows = streamedRecoveredFees
      .map((fee: any, index): MarketingLedgerRow | null => {
        const date = toDateOrNull(fee.payment_date ?? fee.date ?? fee.created_at);
        if (!isDateInRange(date, deferredRange)) return null;
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
  const datasetFeedRows = marketingFeedTabs.map((tab) => {
    const datasetState = ledgerDatasets[tab.datasetLabel];
    const status = !selectedRange ? 'idle' : (datasetState?.status ?? (ledgerStreamComplete ? 'error' : 'loading'));
    return {
      key: tab.datasetLabel,
      label: tab.label,
      status,
    } as const;
  });
  const datasetFeedTotal = datasetFeedRows.length;
  const datasetFeedCompleted = datasetFeedRows.filter((feed) => feed.status === 'ready' || feed.status === 'error').length;
  const datasetFeedErrors = datasetFeedRows.filter((feed) => feed.status === 'error').length;
  const marketingHasHydrationErrors = datasetFeedErrors > 0;
  const marketingHydrationPending = Boolean(selectedRange) && (isRangeSwitching || !ledgerStreamComplete || datasetFeedRows.some((feed) => feed.status === 'loading' || feed.status === 'idle'));
  const marketingHydrationVisible = Boolean(selectedRange) && (marketingHydrationPending || marketingHasHydrationErrors);
  const marketingHydrationPanelVisible = marketingHydrationVisible && !localHydrationDismissed;
  const marketingHydrationPhaseLabel = marketingHasHydrationErrors
    ? 'Marketing pull needs a retry'
    : isRangeSwitching
      ? `Preparing ${selectedRangeLabel.toLowerCase()}`
      : ledgerStreamConnected
        ? `Pulling ${datasetFeedCompleted} of ${datasetFeedTotal} feeds`
        : selectedRange
          ? 'Connecting marketing feeds'
          : 'Choose a reporting window';
  const marketingHydrationProgressLabel = marketingHasHydrationErrors
    ? `${datasetFeedErrors} feed${datasetFeedErrors === 1 ? '' : 's'} need attention`
    : ledgerStreamConnected
      ? `${datasetFeedCompleted} of ${datasetFeedTotal} reporting feeds settled`
      : selectedRange
        ? 'Opening the reporting stream for this window'
        : 'No feeds will load until you choose a range';
  const hasSelectedRange = Boolean(selectedRange);
  const isReportingWindowSettled = localPreviewWithoutData || (hasSelectedRange && !marketingHydrationPending && !marketingHasHydrationErrors);
  const marketingEntryStatus = !hasSelectedRange
    ? 'Select a reporting window.'
    : marketingHasHydrationErrors
      ? 'Retry required.'
      : 'Preparing feeds.';
  const marketingEntryDetail = !hasSelectedRange
    ? 'No data pulled yet.'
    : `${datasetFeedCompleted} of ${datasetFeedTotal} reporting feeds settled.`;
  const lockedWindowSurface = isDarkMode ? 'rgba(10, 26, 45, 0.92)' : 'rgba(255, 255, 255, 0.96)';
  const lockedWindowBorder = isDarkMode ? 'rgba(142, 209, 255, 0.22)' : 'rgba(13, 47, 96, 0.14)';
  const lockedWindowAccent = isDarkMode ? '#8ed1ff' : colours.helixBlue;
  const lockedWindowSubTextColor = isDarkMode ? '#d1d5db' : '#4b5563';

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
    const wasSettled = previousReportingWindowSettledRef.current;
    previousReportingWindowSettledRef.current = isReportingWindowSettled;

    if (!hasSelectedRange || marketingHydrationPending) {
      setMarketingUnlockToastVisible(false);
      return undefined;
    }

    if (isReportingWindowSettled && !wasSettled) {
      setMarketingUnlockToastVisible(true);
      const timeout = window.setTimeout(() => setMarketingUnlockToastVisible(false), 3200);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [hasSelectedRange, isReportingWindowSettled, marketingHydrationPending]);

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
      style={{
        minHeight: 'calc(100vh - 140px)',
        padding: '0 22px 32px',
        background: isDarkMode ? colours.dark.background : colours.grey,
        display: 'grid',
        gap: 16,
        position: 'relative',
      }}
    >
      {isReportingWindowSettled && (
      <section data-helix-region="marketing/intent-strip" style={{ padding: '14px 0 0' }}>
        <div
          className="marketing-locked-window"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            padding: '11px 14px 11px 16px',
            background: lockedWindowSurface,
            border: `1px solid ${lockedWindowBorder}`,
            boxShadow: isDarkMode ? '0 12px 28px rgba(0, 3, 25, 0.20)' : '0 12px 26px rgba(6, 23, 51, 0.08)',
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
                backgroundColor: colours.green,
                borderRadius: 999,
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.10), 0 0 16px rgba(32, 178, 108, 0.18)',
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
                Reporting window locked
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
                {localPreviewWithoutData ? 'Local preview: no data loaded' : `${selectedRangeLabel}: ${formatRangeWindow(activeRange)}`}
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
            <button
              type="button"
              aria-label="Amend marketing reporting window"
              onClick={() => {
                setLocalHydrationDismissed(false);
                setMarketingUnlockToastVisible(false);
                setHoveredRange(null);
                setLocalPreviewWithoutData(false);
                setSelectedRange(null);
              }}
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
                cursor: 'pointer',
              }}
            >
              Amend
            </button>
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
            {selectedRangeLabel} feeds settled.
          </span>
        </div>
      )}

      {isReportingWindowSettled ? (
      <div
        data-helix-region="marketing/production-frame"
        className="marketing-production-frame marketing-production-frame--unlocked"
        aria-busy={false}
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
            <div style={{ opacity: marketingHydrationPending ? 0.74 : 1, transition: 'opacity 180ms ease' }}>
              <MarketingPerformanceWorkspace
                isDarkMode={isDarkMode}
                googleAnalyticsRows={localPreviewWithoutData ? [] : streamedGoogleAnalytics}
                googleAdsRows={localPreviewWithoutData ? [] : streamedGoogleAds}
                ledgerRowsByTab={localPreviewWithoutData ? {} : ledgerRowsByTab}
                isBlueprintMode={isBlueprintMode}
              />
            </div>
          </div>
        </div>

        <section
          data-helix-region="marketing/source-ledgers"
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
                {activeLedgerMeta.label} | {getLedgerCountLabel(activeDatasetStatus, activeLedgerRows.length)} rows | {activeDatasetStatus}
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
              Reporting stream {ledgerStreamComplete ? 'ready' : ledgerStreamConnected ? `${ledgerStreamProgress.completed}/${ledgerStreamProgress.total}` : 'warming'}
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
              // Hide actual counts until user selects a reporting range to avoid misleading ready states
              const rowCount = selectedRange ? (ledgerRowsByTab[tab.key]?.length ?? 0) : 0;
              const datasetStatus = !selectedRange
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
                    {getLedgerCountLabel(datasetStatus, rowCount)}
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
              {!selectedRange ? (
                // Render skeleton placeholders when no range selected
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
                      opacity: 0.65,
                    }}
                  >
                    <span style={{ display: 'block', height: 16, width: '60%', background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.06)', borderRadius: 2 }} />
                    <span style={{ display: 'block', height: 12, width: 80, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15, 23, 42, 0.04)', borderRadius: 2 }} />
                    <span style={{ display: 'block', height: 14, width: 70, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15, 23, 42, 0.04)', borderRadius: 2 }} />
                    <span style={{ display: 'block', height: 14, width: 70, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15, 23, 42, 0.04)', borderRadius: 2 }} />
                    <span style={{ display: 'block', height: 12, width: '40%', background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(15, 23, 42, 0.03)', borderRadius: 2 }} />
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

            {activeLedgerRows.length === 0 && (
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
      ) : (
        <section
          data-helix-region="marketing/entry"
          className="marketing-entry"
          aria-busy={Boolean(selectedRange) && !marketingHasHydrationErrors}
          style={{
            ...panelStyle(isDarkMode),
            display: 'grid',
            gap: 18,
            marginTop: 14,
            minHeight: 420,
            alignContent: 'center',
            justifyItems: 'center',
            textAlign: 'center',
            overflow: 'hidden',
            background: reportingPanelBackground(isDarkMode, 'elevated'),
            border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
          }}
        >
          <div style={{ display: 'grid', gap: 8, maxWidth: 520, justifyItems: 'center' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: 46,
                height: 46,
                border: `1px solid ${isDarkMode ? 'rgba(84, 169, 228, 0.44)' : 'rgba(54, 144, 206, 0.28)'}`,
                background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                boxShadow: selectedRange ? `inset 0 -3px 0 ${colours.green}` : `inset 0 -3px 0 ${colours.helixBlue}`,
              }}
            />
            <h2 style={{ ...sectionHeadingStyle(isDarkMode), margin: 0, fontSize: 18 }}>
              Prepare marketing data
            </h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.5 }}>
              {marketingEntryStatus}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              {marketingEntryDetail}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Marketing reporting window"
            data-helix-region="marketing/entry/range-strip"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 8,
              width: 'min(100%, 620px)',
              minWidth: 0,
            }}
          >
            {marketingPageRanges.map((item) => {
              const selected = selectedRange === item.key;
              const previewed = hoveredRange === item.key;
              const disabled = Boolean(item.disabled);
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`reports-management-range-option marketing-range-option${previewed ? ' is-previewed' : ''}`}
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={disabled}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setLocalHydrationDismissed(false);
                    setLocalPreviewWithoutData(false);
                    setSelectedRange(item.key);
                    setRangeRefreshNonce((current) => current + 1);
                  }}
                  onMouseEnter={() => {
                    if (disabled) return;
                    setHoveredRange(item.key);
                  }}
                  onMouseLeave={() => {
                    setHoveredRange((current) => current === item.key ? null : current);
                  }}
                  onFocus={() => {
                    if (disabled) return;
                    setHoveredRange(item.key);
                  }}
                  onBlur={() => {
                    setHoveredRange((current) => current === item.key ? null : current);
                  }}
                  title={disabled
                    ? (item.disabledReason ?? `${item.label} is temporarily unavailable.`)
                    : `${item.label}. Est. refresh ${getMarketingRangeRefreshEstimate(item.key)}.`}
                  aria-label={item.label}
                  style={{
                    minWidth: 0,
                    minHeight: 44,
                    display: 'grid',
                    alignContent: 'center',
                    justifyItems: 'center',
                    rowGap: 0,
                    textAlign: 'center',
                    padding: '10px 12px',
                    borderRadius: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    color: disabled
                      ? (isDarkMode ? 'rgba(203, 213, 225, 0.42)' : 'rgba(55, 65, 81, 0.42)')
                      : previewed || selected
                        ? '#ffffff'
                        : (isDarkMode ? '#cbd5e1' : colours.light.text),
                    backgroundColor: disabled
                      ? (isDarkMode ? 'rgba(10, 26, 45, 0.38)' : 'rgba(243, 244, 246, 0.92)')
                      : selected
                        ? 'rgba(54, 144, 206, 0.92)'
                        : previewed
                          ? 'rgba(54, 144, 206, 0.92)'
                          : (isDarkMode ? 'rgba(10, 26, 45, 0.78)' : colours.grey),
                    borderColor: disabled
                      ? (isDarkMode ? 'rgba(62, 88, 116, 0.28)' : 'rgba(156, 163, 175, 0.42)')
                      : selected || previewed
                        ? 'rgba(54, 144, 206, 0.92)'
                        : (isDarkMode ? 'rgba(62, 88, 116, 0.62)' : colours.highlightNeutral),
                    boxShadow: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.72 : 1,
                    transition: 'background-color 220ms ease, border-color 220ms ease, color 220ms ease, transform 180ms ease, box-shadow 180ms ease',
                  }}
                >
                  <span className="reports-range-label-full" style={{ display: 'block', fontSize: 12, fontWeight: 900, letterSpacing: '0.02em', lineHeight: 1.1 }}>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {canUseLocalPreviewWithoutData && !selectedRange && !localPreviewWithoutData && (
            <button
              type="button"
              data-helix-region="marketing/entry/load-without-data"
              onClick={() => {
                setHoveredRange(null);
                setLocalHydrationDismissed(true);
                setLocalPreviewWithoutData(true);
                setMarketingUnlockToastVisible(false);
              }}
              style={{
                minHeight: 34,
                padding: '0 13px',
                border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                background: isDarkMode ? 'rgba(10, 26, 45, 0.72)' : 'rgba(255, 255, 255, 0.74)',
                color: isDarkMode ? '#d1d5db' : colours.darkBlue,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Load without data
            </button>
          )}

          <div
            aria-hidden="true"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))',
              gap: 10,
              width: 'min(100%, 620px)',
              marginTop: 8,
            }}
          >
            {['SEO', 'PPC', 'Ledgers', 'Revenue'].map((label, index) => (
              <span
                key={label}
                style={{
                  display: 'grid',
                  gap: 8,
                  minHeight: 82,
                  padding: 10,
                  border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                  background: reportingPanelBackground(isDarkMode),
                  animation: `marketing-entry-breathe 1600ms ease-in-out ${index * 120}ms infinite alternate`,
                }}
              >
                <span style={{ height: 9, width: '54%', background: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.07)' }} />
                <span style={{ height: 18, width: '74%', background: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)' }} />
                <span style={{ height: 8, width: '42%', background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.04)' }} />
              </span>
            ))}
          </div>
        </section>
      )}

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

        .marketing-range-option {
          border: 1px solid rgba(54, 144, 206, 0.28);
          background: rgba(255, 255, 255, 0.86);
          box-shadow: none;
          transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }

        .marketing-range-option:last-child {
          border-right: 1px solid ${isDarkMode ? 'rgba(84, 169, 228, 0.36)' : 'rgba(54, 144, 206, 0.28)'} !important;
        }

        .marketing-range-option:hover:not(:disabled),
        .marketing-range-option:focus-visible:not(:disabled) {
          /* Use a stronger, high-contrast accent on hover so labels remain readable in light mode */
          background: rgba(54, 144, 206, 0.92) !important;
          border-color: rgba(54, 144, 206, 0.92) !important;
          color: #ffffff !important;
          box-shadow: none !important;
          transform: translateY(-1px);
        }

        .marketing-range-option.is-previewed:not(:disabled),
        .marketing-range-option[aria-checked="true"]:not(:disabled) {
          /* Selected/previewed state should also use high-contrast white text */
          background: rgba(54, 144, 206, 0.92) !important;
          border-color: rgba(54, 144, 206, 0.92) !important;
          color: #ffffff !important;
        }

        .marketing-range-option .reports-range-label-full {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .marketing-production-frame--unlocked {
          animation: marketing-production-unlock 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
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

        @keyframes marketing-entry-breathe {
          from {
            opacity: 0.58;
            transform: translateY(0);
          }

          to {
            opacity: 0.9;
            transform: translateY(-1px);
          }
        }
      `}</style>
    </div>
  );
};

export default MarketingHome;