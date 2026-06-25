import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import { getNormalizedEnquirySourceLabel, hasGoogleAdsPaidSignal } from '../../../utils/enquirySource';
import { getApiUrl } from '../../../utils/getApiUrl';
import { ReportProcessingRailItemCard } from './ReportProcessingRail';
import { useColumnVisibility, type ColumnDefinition } from '../hooks/useColumnVisibility';
import { ColumnSelector } from './ColumnSelector';
import type { ReportProcessingRailItem, ReportProcessingRailRow, ReportProcessingRailStatus } from './ReportProcessingRail';
import './EnquirySourceLedger.css';

type SourceOption = {
  value: string;
  count: number;
};

type SourceLedgerRow = {
  id: number | null;
  acid: string | null;
  datetime: string | null;
  aow: string | null;
  moc: string | null;
  poc: string | null;
  phone: string | null;
  campaign: string | null;
  keyword: string | null;
  source: string | null;
  url: string | null;
  gclid: string | null;
  matterDisplayNumber?: string | null;
};

type EditableSelectField = 'aow' | 'moc' | 'poc' | 'source';
type EditableInputField = 'acid' | 'datetime' | 'phone' | 'campaign' | 'keyword' | 'url' | 'gclid';
type EditableLedgerField = EditableInputField | EditableSelectField;
type RowDrafts = Record<string, Partial<Record<EditableLedgerField, string>>>;
type FieldOptions = Record<EditableSelectField, SourceOption[]>;
type SourceLedgerAttributionColumns = { campaign: boolean; keyword: boolean };

type LedgerSortKey = 'date' | 'id' | 'aow' | 'moc' | 'poc' | 'campaign' | 'keyword' | 'source';
type LedgerDirection = 'asc' | 'desc';

type SourceLedgerColumnKey = 'select' | 'date' | 'id' | 'aow' | 'moc' | 'poc' | 'phone' | 'campaign' | 'keyword' | 'source' | 'url' | 'gclid' | 'tags' | 'matter';

type CallRailInspectionRow = {
  startTime: string;
  source: string;
  medium: string;
  campaign: string;
  keywords: string;
  landingPageUrl: string;
  referringUrl: string;
  lastRequestedUrl: string;
  direction: string;
  answered: boolean;
  gclid: string;
};

type CallRailSignal = 'paid' | 'organic' | 'unknown';

type CallRailDecisionSummary = {
  recommendation: string;
  suggestedSource: string | null;
  suggestionReason: string;
  paidSignals: number;
  organicSignals: number;
  unknownSignals: number;
  latestMatchedCall: CallRailInspectionRow | null;
  total: number;
};

type EnquirySourceLedgerProps = {
  isDarkMode: boolean;
  presentation?: 'embedded' | 'fullPage';
};

const SKELETON_ROW_COUNT = 6;
const FULL_PAGE_LEDGER_RENDER_LIMIT = 80;
const SOURCE_LEDGER_PAGE_SIZE = 200;
const EDITABLE_LEDGER_FIELDS: EditableLedgerField[] = ['acid', 'datetime', 'aow', 'moc', 'poc', 'phone', 'campaign', 'keyword', 'source', 'url', 'gclid'];
const EDITABLE_SELECT_FIELDS: EditableSelectField[] = ['aow', 'moc', 'poc', 'source'];
const SOURCE_OPTIONS_ENDPOINT = '/api/enquiries-unified/source/options';
const SOURCE_LEDGER_ENDPOINT = '/api/enquiries-unified/source/ledger';
const SOURCE_ROW_UPDATE_ENDPOINT = '/api/enquiries-unified/source/row-update';

const SOURCE_LEDGER_TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'select', label: 'Select', defaultVisible: true },
  { key: 'date', label: 'Date', defaultVisible: true },
  { key: 'id', label: 'ID / ACID', defaultVisible: true },
  { key: 'aow', label: 'Area of Work', defaultVisible: true },
  { key: 'moc', label: 'MOC', defaultVisible: true },
  { key: 'poc', label: 'POC', defaultVisible: true },
  { key: 'phone', label: 'Phone', defaultVisible: true },
  { key: 'campaign', label: 'Campaign', defaultVisible: true },
  { key: 'keyword', label: 'Keyword', defaultVisible: true },
  { key: 'source', label: 'Source', defaultVisible: true },
  { key: 'url', label: 'Landing URL', defaultVisible: true },
  { key: 'gclid', label: 'GCLID', defaultVisible: false },
  { key: 'tags', label: 'Tags', defaultVisible: true },
  { key: 'matter', label: 'Matter', defaultVisible: false },
];

const SOURCE_LEDGER_COLUMN_WEIGHTS: Record<SourceLedgerColumnKey, number> = {
  select: 2.2,
  date: 7.8,
  id: 8,
  aow: 10.4,
  moc: 8.2,
  poc: 8,
  phone: 9.6,
  campaign: 12,
  keyword: 12,
  source: 13,
  url: 12,
  gclid: 11,
  tags: 7,
  matter: 8,
};

type LedgerChannelFilter = 'all' | 'calls' | 'web-forms';
type ActiveLedgerCell = { rowKey: string; field: EditableLedgerField } | null;
type SourceReviewFilter = 'all' | 'needs-review' | 'classified';
type SourceDatePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-quarter' | 'year-to-date';

const SOURCE_REVIEW_FILTERS: Array<{ key: SourceReviewFilter; label: string }> = [
  { key: 'all', label: 'All sources' },
  { key: 'needs-review', label: 'Hide organic/paid' },
  { key: 'classified', label: 'Organic/paid only' },
];

const SOURCE_DATE_PRESETS: Array<{ key: SourceDatePreset; label: string }> = [
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'This quarter' },
  { key: 'year-to-date', label: 'Year to date' },
];

function createEmptyFieldOptions(): FieldOptions {
  return {
    aow: [],
    moc: [],
    poc: [],
    source: [],
  };
}

function formatLookupSuffix(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (!digits) return 'No lookup number';
  return `Lookup ending ${digits.slice(-4)}`;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Not set';
  return new Date(parsed).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateCompact(value: string | null): string {
  if (!value) return 'Not set';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Not set';
  return new Date(parsed).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

function formatTimeCompact(value: string | null): string {
  if (!value) return '--:--';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '--:--';
  return new Date(parsed).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTimeInputValue(value: string | null): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';
  const date = new Date(parsed);
  const pad = (segment: number) => String(segment).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizePhoneDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function normaliseLedgerToken(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function isCallChannel(value: string): boolean {
  const normalized = normaliseLedgerToken(value);
  return normalized.includes('call') || normalized.includes('phone');
}

function isWebFormChannel(value: string): boolean {
  const normalized = normaliseLedgerToken(value);
  return normalized.includes('web') || normalized.includes('form') || normalized.includes('website');
}

function normalizePhoneForLookup(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (!digits) return '';
  if (digits.startsWith('44') && digits.length >= 12) {
    return `0${digits.slice(2)}`;
  }
  return digits.startsWith('0') ? digits : digits;
}

function formatTeamInitialsLabel(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const atIndex = raw.indexOf('@');
  return atIndex > 0 ? raw.slice(0, atIndex) : raw;
}

function truncateLedgerUrl(value: string, maxLength = 58): string {
  const label = String(value || '').trim();
  if (!label) return '';
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function padDateSegment(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateOnly(value: Date): string {
  return `${value.getFullYear()}-${padDateSegment(value.getMonth() + 1)}-${padDateSegment(value.getDate())}`;
}

function startOfLocalDay(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getSourceDatePresetRange(preset: SourceDatePreset, now = new Date()): { startDate: string; endDate: string } {
  const today = startOfLocalDay(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisWeekStart = addLocalDays(today, -mondayOffset);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisQuarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const financialYearStart = today.getMonth() >= 3
    ? new Date(today.getFullYear(), 3, 1)
    : new Date(today.getFullYear() - 1, 3, 1);

  if (preset === 'last-week') {
    const start = addLocalDays(thisWeekStart, -7);
    return { startDate: formatDateOnly(start), endDate: formatDateOnly(addLocalDays(thisWeekStart, -1)) };
  }
  if (preset === 'last-month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { startDate: formatDateOnly(start), endDate: formatDateOnly(addLocalDays(thisMonthStart, -1)) };
  }
  if (preset === 'this-month') return { startDate: formatDateOnly(thisMonthStart), endDate: formatDateOnly(today) };
  if (preset === 'this-quarter') return { startDate: formatDateOnly(thisQuarterStart), endDate: formatDateOnly(today) };
  if (preset === 'year-to-date') return { startDate: formatDateOnly(financialYearStart), endDate: formatDateOnly(today) };
  return { startDate: formatDateOnly(thisWeekStart), endDate: formatDateOnly(today) };
}

function mapSourceLedgerRows(entries: any[]): SourceLedgerRow[] {
  return entries.map((entry: any) => ({
    id: entry?.id == null ? null : Number(entry.id),
    acid: String(entry?.acid || ''),
    datetime: entry?.datetime ? String(entry.datetime) : null,
    aow: String(entry?.aow || ''),
    moc: String(entry?.moc || ''),
    poc: String(entry?.poc || ''),
    phone: String(entry?.phone || ''),
    campaign: String(entry?.campaign || ''),
    keyword: String(entry?.keyword || ''),
    source: String(entry?.source || ''),
    url: String(entry?.url || ''),
    gclid: String(entry?.gclid || ''),
    matterDisplayNumber: String(entry?.matterDisplayNumber || ''),
  }));
}

function getSourceLedgerRowIdentity(row: SourceLedgerRow): string {
  if (row.id != null) return `id:${row.id}`;
  return `row:${row.datetime || ''}:${row.acid || ''}`;
}

function normaliseEvidenceString(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normaliseStagedCallRailValue(value: string): string {
  const trimmed = String(value || '').trim();
  const normalised = trimmed.toLowerCase();
  if (!trimmed || normalised === 'not set' || normalised === '(not set)') return '';
  return trimmed;
}

function pickStagedCallRailValue(...values: unknown[]): string {
  for (const value of values) {
    const staged = normaliseStagedCallRailValue(typeof value === 'string' ? value : '');
    if (staged) return staged;
  }
  return '';
}

function classifyCallSignal(entry: CallRailInspectionRow): CallRailSignal {
  const source = normaliseEvidenceString(entry.source);
  const medium = normaliseEvidenceString(entry.medium);
  const campaign = normaliseEvidenceString(entry.campaign);
  const hasPaidClue = hasGoogleAdsPaidSignal({ source, medium, campaign, gclid: entry.gclid });
  if (hasPaidClue) return 'paid';
  if (['organic', 'direct', 'referral'].some((token) => source.includes(token) || medium.includes(token))) return 'organic';
  return 'unknown';
}

function getSourceBucket(value: string): 'paid' | 'organic' | 'other' {
  const normalized = normaliseEvidenceString(value);
  if (
    normalized.includes('paid search')
    || normalized.includes('google ads')
    || normalized.includes('adwords')
    || normalized.includes('ppc')
    || normalized.includes('cpc')
  ) return 'paid';
  if (normalized.includes('organic')) return 'organic';
  return 'other';
}

function buildCallRailDecision(rows: CallRailInspectionRow[], currentSource: string): CallRailDecisionSummary {
  const currentSourceNormalized = normaliseEvidenceString(currentSource);
  if (!rows.length) {
    const fallbackSuggestedSource = currentSourceNormalized === 'google' ? 'organic search' : null;
    return {
      recommendation: fallbackSuggestedSource
        ? `Suggested source: ${fallbackSuggestedSource}`
        : 'No matching CallRail records found in lookup window.',
      suggestedSource: fallbackSuggestedSource,
      suggestionReason: fallbackSuggestedSource
        ? 'No CallRail match found and current source is google, defaulting to organic search.'
        : 'No call match found.',
      paidSignals: 0,
      organicSignals: 0,
      unknownSignals: 0,
      latestMatchedCall: null,
      total: 0,
    };
  }

  let paidSignals = 0;
  let organicSignals = 0;
  let unknownSignals = 0;
  for (const row of rows) {
    const signal = classifyCallSignal(row);
    if (signal === 'paid') paidSignals += 1;
    else if (signal === 'organic') organicSignals += 1;
    else unknownSignals += 1;
  }

  const latestMatchedCall = [...rows]
    .sort((a, b) => Date.parse(b.startTime || '') - Date.parse(a.startTime || ''))[0] || null;
  const currentBucket = getSourceBucket(currentSource);

  let suggestedSource: string | null = null;
  let suggestionReason = 'No source change required from matched calls.';

  if (paidSignals > 0) {
    suggestedSource = 'paid search';
    suggestionReason = `Matched calls include ${paidSignals} paid signal${paidSignals === 1 ? '' : 's'}.`;
  }

  if (!suggestedSource && latestMatchedCall) {
    const latestSource = normaliseEvidenceString(latestMatchedCall.source);
    const latestMedium = normaliseEvidenceString(latestMatchedCall.medium);
    const latestCampaign = normaliseEvidenceString(latestMatchedCall.campaign);
    const campaignNotSet = !latestCampaign || latestCampaign === 'not set' || latestCampaign === '(not set)';
    const looksLikeGoogleOrganic = (
      (latestSource.includes('google organic') || latestSource.includes('google'))
      && latestMedium.includes('organic')
      && campaignNotSet
    );

    if (looksLikeGoogleOrganic) {
      suggestedSource = 'organic search';
      suggestionReason = 'Latest matched call indicates Google Organic traffic.';
    }
  }

  if (!suggestedSource && currentBucket === 'paid' && organicSignals > 0) {
    suggestedSource = 'organic';
    suggestionReason = 'Current enquiry is paid search, but matched calls only show organic evidence.';
  }

  const recommendation = suggestedSource
    ? `Suggested source: ${suggestedSource}`
    : 'No source change suggested from this CallRail check.';

  return {
    recommendation,
    suggestedSource,
    suggestionReason,
    paidSignals,
    organicSignals,
    unknownSignals,
    latestMatchedCall,
    total: rows.length,
  };
}

const EnquirySourceLedger: React.FC<EnquirySourceLedgerProps> = ({ isDarkMode, presentation = 'embedded' }) => {
  const isFullPage = presentation === 'fullPage';
  const compactFontSize = isFullPage ? 8 : 9;
  const compactInputPadding = isFullPage ? '0 3px' : '3px 5px';
  const compactCellPadding = isFullPage ? '1px 0' : '4px 0';
  const compactShellMinHeight = isFullPage ? 16 : 24;
  const [fieldOptions, setFieldOptions] = React.useState<FieldOptions>(createEmptyFieldOptions);
  const [rows, setRows] = React.useState<SourceLedgerRow[]>([]);
  const [rowsLoading, setRowsLoading] = React.useState(true);
  const [rowsError, setRowsError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<LedgerSortKey>('date');
  const [direction, setDirection] = React.useState<LedgerDirection>('desc');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showAllRows, setShowAllRows] = React.useState(false);
  const [rowsHasMore, setRowsHasMore] = React.useState(false);
  const [rowsNextOffset, setRowsNextOffset] = React.useState(0);
  const [rowsLoadingMore, setRowsLoadingMore] = React.useState(false);
  const [sourceLedgerAttributionColumns, setSourceLedgerAttributionColumns] = React.useState<SourceLedgerAttributionColumns>({ campaign: true, keyword: true });
  const [channelFilter, setChannelFilter] = React.useState<LedgerChannelFilter>('all');
  const [sourceReviewFilter, setSourceReviewFilter] = React.useState<SourceReviewFilter>('needs-review');
  const [sourceDatePreset, setSourceDatePreset] = React.useState<SourceDatePreset>('this-month');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [rowDrafts, setRowDrafts] = React.useState<RowDrafts>({});
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<Record<string, boolean>>({});
  const [lastSelectedRowKey, setLastSelectedRowKey] = React.useState<string | null>(null);
  const [activeLedgerCell, setActiveLedgerCell] = React.useState<ActiveLedgerCell>(null);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [callRailProcessingKey, setCallRailProcessingKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [expandedRowKey, setExpandedRowKey] = React.useState<string | null>(null);
  const [processingPanel, setProcessingPanel] = React.useState<ReportProcessingRailItem | null>(null);
  const [processingPanelFolded, setProcessingPanelFolded] = React.useState(false);
  const [callRailModal, setCallRailModal] = React.useState<{
    open: boolean;
    rowId: string;
    enquiryId: string;
    enquiryAcid: string;
    enquiryDate: string | null;
    phone: string;
    source: string;
    checkedAt: string | null;
    queuedSource: string | null;
    queuedCampaign: string | null;
    queuedKeyword: string | null;
    queuedUrl: string | null;
    queuedGclid: string | null;
    loading: boolean;
    error: string | null;
    rows: CallRailInspectionRow[];
  }>({
    open: false,
    rowId: '',
    enquiryId: '',
    enquiryAcid: '',
    enquiryDate: null,
    phone: '',
    source: '',
    checkedAt: null,
    queuedSource: null,
    queuedCampaign: null,
    queuedKeyword: null,
    queuedUrl: null,
    queuedGclid: null,
    loading: false,
    error: null,
    rows: [],
  });
  const processingTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const {
    visibleColumns,
    handleToggleColumn,
    handleShowAll,
    handleHideAll,
    handleReset,
  } = useColumnVisibility('enquiry-source-ledger-v2', SOURCE_LEDGER_TABLE_COLUMNS);

  const isAttributionColumnAvailable = React.useCallback((columnKey: SourceLedgerColumnKey): boolean => {
    if (columnKey === 'campaign') return sourceLedgerAttributionColumns.campaign;
    if (columnKey === 'keyword') return sourceLedgerAttributionColumns.keyword;
    return true;
  }, [sourceLedgerAttributionColumns.campaign, sourceLedgerAttributionColumns.keyword]);

  const isColumnVisible = React.useCallback((columnKey: SourceLedgerColumnKey): boolean => (
    visibleColumns.has(columnKey) && isAttributionColumnAvailable(columnKey)
  ), [isAttributionColumnAvailable, visibleColumns]);

  const selectorColumns = React.useMemo(
    () => SOURCE_LEDGER_TABLE_COLUMNS.filter((column) => isAttributionColumnAvailable(column.key as SourceLedgerColumnKey)),
    [isAttributionColumnAvailable],
  );

  const visibleLedgerColumns = React.useMemo(
    () => SOURCE_LEDGER_TABLE_COLUMNS.filter((column) => isColumnVisible(column.key as SourceLedgerColumnKey)),
    [isColumnVisible],
  );

  const visibleLedgerColumnWeight = React.useMemo(
    () => visibleLedgerColumns.reduce((total, column) => total + (SOURCE_LEDGER_COLUMN_WEIGHTS[column.key as SourceLedgerColumnKey] ?? 8), 0) || 1,
    [visibleLedgerColumns],
  );

  const visibleLedgerColumnCount = Math.max(visibleLedgerColumns.length, 1);
  const ledgerTableMinWidth = Math.round(Math.max(isFullPage ? 900 : 780, visibleLedgerColumnWeight * (isFullPage ? 10.4 : 9.6)));

  const clearProcessingTimers = React.useCallback(() => {
    processingTimersRef.current.forEach(clearTimeout);
    processingTimersRef.current = [];
  }, []);

  const buildPanelItem = React.useCallback((
    key: string,
    title: string,
    subtitle: string,
    status: ReportProcessingRailStatus,
    rows: ReportProcessingRailRow[],
    icon: string,
  ): ReportProcessingRailItem => ({
    key,
    title,
    subtitle,
    status,
    visualIcon: icon,
    rows,
    ctaLabel: status === 'loading' ? 'Running...' : 'Dismiss',
    ctaDisabled: status === 'loading',
    onCta: () => setProcessingPanel(null),
  }), []);

  const callRailDecision = React.useMemo(
    () => buildCallRailDecision(callRailModal.rows, callRailModal.source),
    [callRailModal.rows, callRailModal.source],
  );

  const deferredSearchTerm = React.useDeferredValue(searchTerm);
  const sourceDateRange = React.useMemo(() => getSourceDatePresetRange(sourceDatePreset), [sourceDatePreset]);

  React.useEffect(() => {
    if (!isFullPage) return;
    setSelectedRowKeys({});
  }, [isFullPage]);

  React.useEffect(() => {
    if (!callRailModal.open || callRailModal.loading) return undefined;
    const timeout = window.setTimeout(() => {
      setCallRailModal((prev) => ({ ...prev, open: false }));
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [callRailModal.open, callRailModal.loading, callRailModal.checkedAt]);

  const getRowKey = React.useCallback((row: SourceLedgerRow, index: number): string => {
    if (row.id != null) return String(row.id);
    return `row:${row.datetime || 'no-date'}:${index}`;
  }, []);

  const getCurrentFieldValue = React.useCallback((row: SourceLedgerRow, field: EditableLedgerField): string => {
    if (field === 'datetime') {
      return formatDateTimeInputValue(row.datetime);
    }
    return String(row[field] ?? '');
  }, []);

  const getDraftedFieldValue = React.useCallback((row: SourceLedgerRow, rowKey: string, field: EditableLedgerField): string => {
    const draftValue = rowDrafts[rowKey]?.[field];
    return draftValue == null ? getCurrentFieldValue(row, field) : String(draftValue);
  }, [getCurrentFieldValue, rowDrafts]);

  const normaliseComparableFieldValue = React.useCallback((field: EditableLedgerField, value: string): string => {
    if (field === 'datetime') return String(value || '');
    return String(value || '').trim();
  }, []);

  const normaliseFieldUpdateValue = React.useCallback((field: EditableLedgerField, value: string): string | null => {
    if (field === 'datetime') {
      const candidate = String(value || '').trim();
      if (!candidate) return null;
      const parsed = new Date(candidate);
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
    return String(value || '').trim();
  }, []);

  const getRowUpdates = React.useCallback((row: SourceLedgerRow, rowKey: string): Partial<Record<EditableLedgerField, string | null>> => {
    return EDITABLE_LEDGER_FIELDS.reduce((acc, field) => {
      if (field === 'campaign' && !sourceLedgerAttributionColumns.campaign) return acc;
      if (field === 'keyword' && !sourceLedgerAttributionColumns.keyword) return acc;
      const currentValue = normaliseComparableFieldValue(field, getCurrentFieldValue(row, field));
      const draftedValue = normaliseComparableFieldValue(field, getDraftedFieldValue(row, rowKey, field));
      if (currentValue !== draftedValue) {
        acc[field] = normaliseFieldUpdateValue(field, draftedValue);
      }
      return acc;
    }, {} as Partial<Record<EditableLedgerField, string | null>>);
  }, [getCurrentFieldValue, getDraftedFieldValue, normaliseComparableFieldValue, normaliseFieldUpdateValue, sourceLedgerAttributionColumns.campaign, sourceLedgerAttributionColumns.keyword]);

  const setRowFieldDraft = React.useCallback((row: SourceLedgerRow, rowKey: string, field: EditableLedgerField, value: string) => {
    const currentValue = getCurrentFieldValue(row, field);
    setRowDrafts((prev) => {
      const next = { ...prev };
      const nextDraft = { ...(next[rowKey] || {}) };
      if (value === currentValue) {
        delete nextDraft[field];
      } else {
        nextDraft[field] = value;
      }
      if (Object.keys(nextDraft).length > 0) {
        next[rowKey] = nextDraft;
      } else {
        delete next[rowKey];
      }
      return next;
    });
  }, [getCurrentFieldValue]);

  const changedRows = React.useMemo(() => {
    return rows
      .map((row, index) => {
        const rowKey = getRowKey(row, index);
        const updates = getRowUpdates(row, rowKey);
        return { row, rowKey, updates, updateCount: Object.keys(updates).length };
      })
      .filter(({ row, updateCount }) => row.id != null && updateCount > 0);
  }, [rows, getRowKey, getRowUpdates]);

  const changedRowKeys = React.useMemo(
    () => new Set(changedRows.map(({ rowKey }) => rowKey)),
    [changedRows],
  );

  const selectedChangedRows = React.useMemo(
    () => changedRows.filter(({ rowKey }) => selectedRowKeys[rowKey]),
    [changedRows, selectedRowKeys],
  );

  React.useEffect(() => {
    const validKeys = new Set(rows.map((row, index) => getRowKey(row, index)));
    setSelectedRowKeys((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      Object.entries(prev).forEach(([key, value]) => {
        if (value && validKeys.has(key)) {
          next[key] = true;
        } else if (value) {
          changed = true;
        }
      });
      if (!changed && Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
    setActiveLedgerCell((current) => (current && validKeys.has(current.rowKey) ? current : null));
    setExpandedRowKey((current) => (current && validKeys.has(current) ? current : null));
  }, [rows, getRowKey]);

  const getSelectChoices = React.useCallback((field: EditableSelectField, row: SourceLedgerRow, rowKey: string): string[] => {
    return Array.from(new Set([
      getCurrentFieldValue(row, field),
      getDraftedFieldValue(row, rowKey, field),
      ...fieldOptions[field].map((option) => option.value),
    ].filter((value) => String(value || '').trim()))).sort((a, b) => a.localeCompare(b));
  }, [fieldOptions, getCurrentFieldValue, getDraftedFieldValue]);

  const filteredRows = React.useMemo(() => {
    const query = (deferredSearchTerm || '').trim().toLowerCase();
    return rows.filter((row, index) => {
      const rowKey = getRowKey(row, index);
      // Ensure channelFilter is a string
      if (channelFilter === 'calls' && !isCallChannel(row.moc || '')) return false;
      if (channelFilter === 'web-forms' && !isWebFormChannel(row.moc || '')) return false;
      const sourceBucket = getSourceBucket(getDraftedFieldValue(row, rowKey, 'source'));
      if (sourceReviewFilter === 'needs-review' && (sourceBucket === 'organic' || sourceBucket === 'paid')) return false;
      if (sourceReviewFilter === 'classified' && sourceBucket !== 'organic' && sourceBucket !== 'paid') return false;

      const idText = String(row.id ?? '');
      const acidText = String(row.acid || '');
      if (!query) return true;

      const haystack = [idText, acidText, row.aow, row.moc, row.poc, row.phone, row.campaign, row.keyword, row.source, row.url, row.gclid]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, deferredSearchTerm, channelFilter, sourceReviewFilter, getDraftedFieldValue, getRowKey]);

  React.useEffect(() => {
    setShowAllRows(false);
  }, [channelFilter, deferredSearchTerm, direction, refreshKey, sort, sourceDatePreset, sourceReviewFilter]);

  const visibleFilteredRows = React.useMemo(() => {
    if (!isFullPage || showAllRows) return filteredRows;
    return filteredRows.slice(0, FULL_PAGE_LEDGER_RENDER_LIMIT);
  }, [filteredRows, isFullPage, showAllRows]);

  const hiddenFilteredRowCount = Math.max(0, filteredRows.length - visibleFilteredRows.length);

  const isSearchPending = searchTerm !== deferredSearchTerm;

  React.useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadOptions = async () => {
      try {
        const response = await fetch(getApiUrl(SOURCE_OPTIONS_ENDPOINT), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`options_${response.status}`);
        const payload = await response.json();
        if (!isMounted) return;
        const nextFieldOptions = createEmptyFieldOptions();
        EDITABLE_SELECT_FIELDS.forEach((field) => {
          const entries = Array.isArray(payload?.fieldOptions?.[field])
            ? payload.fieldOptions[field]
            : (field === 'source' && Array.isArray(payload?.options) ? payload.options : []);
          nextFieldOptions[field] = entries.map((entry: any) => ({
            value: String(entry?.value || ''),
            count: Number(entry?.count || 0),
          }));
        });
        setFieldOptions(nextFieldOptions);
      } catch (fetchError) {
        if (!isMounted || controller.signal.aborted) return;
      }
    };

    loadOptions();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshKey]);

  React.useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadRows = async () => {
      setRowsLoading(true);
      setRowsError(null);
      setRowsHasMore(false);
      setRowsNextOffset(0);
      clearProcessingTimers();
      if (isFullPage) {
        const loadSteps = [
          { key: 'fetch', label: 'Fetch latest enquiries source ledger', status: 'loading' as const, detail: SOURCE_LEDGER_ENDPOINT },
          { key: 'hydrate', label: 'Hydrate and shape enquiry rows', status: 'idle' as const },
          { key: 'render', label: 'Render full-page table', status: 'idle' as const },
        ];
        setProcessingPanel(buildPanelItem(
          'enquiries-page-load',
          'Refreshing enquiries data',
          'Preparing the full enquiries ledger view',
          'loading',
          loadSteps,
          'Refresh',
        ));
        const hydrateTimer = setTimeout(() => {
          setProcessingPanel((prev) => {
            if (!prev || prev.key !== 'enquiries-page-load') return prev;
            return {
              ...prev,
              rows: [
                { key: 'fetch', label: 'Fetch latest enquiries source ledger', status: 'ready', detail: SOURCE_LEDGER_ENDPOINT },
                { key: 'hydrate', label: 'Hydrate and shape enquiry rows', status: 'loading', detail: 'Normalising row fields' },
                { key: 'render', label: 'Render full-page table', status: 'idle' },
              ],
            };
          });
        }, 650);
        processingTimersRef.current = [hydrateTimer];
      }
      try {
        const params = new URLSearchParams({
          limit: String(SOURCE_LEDGER_PAGE_SIZE),
          offset: '0',
          sort,
          direction,
          dateFrom: sourceDateRange.startDate,
          dateTo: sourceDateRange.endDate,
        });
        const response = await fetch(getApiUrl(`${SOURCE_LEDGER_ENDPOINT}?${params.toString()}`), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`ledger_${response.status}`);
        const payload = await response.json();
        if (!isMounted) return;
        const payloadColumns = payload?.columns && typeof payload.columns === 'object' ? payload.columns : {};
        setSourceLedgerAttributionColumns({
          campaign: payloadColumns.campaign !== false,
          keyword: payloadColumns.keyword !== false,
        });
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const mappedRows = mapSourceLedgerRows(nextRows);
        setRowsHasMore(Boolean(payload?.hasMore));
        setRowsNextOffset(Number.isFinite(Number(payload?.nextOffset)) ? Number(payload.nextOffset) : mappedRows.length);
        setRows(mappedRows);
        if (isFullPage) {
          setProcessingPanel(buildPanelItem(
            'enquiries-page-load',
            'Enquiries data ready',
            `${mappedRows.length.toLocaleString('en-GB')} rows loaded for ${sourceDateRange.startDate} to ${sourceDateRange.endDate}`,
            'ready',
            [
              { key: 'fetch', label: 'Fetch latest enquiries source ledger', status: 'ready', detail: SOURCE_LEDGER_ENDPOINT },
              { key: 'hydrate', label: 'Hydrate and shape enquiry rows', status: 'ready', detail: 'Rows normalised' },
              { key: 'render', label: 'Render full-page table', status: 'ready', detail: 'Table updated' },
            ],
            'Refresh',
          ));
          const dismissTimer = setTimeout(() => {
            setProcessingPanel((prev) => (prev?.key === 'enquiries-page-load' ? null : prev));
          }, 3200);
          processingTimersRef.current = [dismissTimer];
        }
      } catch (fetchError) {
        if (!isMounted || controller.signal.aborted) return;
        setRowsError('Could not load source ledger.');
        if (isFullPage) {
          const message = fetchError instanceof Error ? fetchError.message : 'Could not load source ledger.';
          setProcessingPanel(buildPanelItem(
            'enquiries-page-load',
            'Enquiries refresh failed',
            message,
            'error',
            [
              { key: 'fetch', label: 'Fetch latest enquiries source ledger', status: 'error', detail: message },
              { key: 'hydrate', label: 'Hydrate and shape enquiry rows', status: 'idle' },
              { key: 'render', label: 'Render full-page table', status: 'idle' },
            ],
            'Refresh',
          ));
        }
      } finally {
        if (isMounted) setRowsLoading(false);
      }
    };

    loadRows();

    return () => {
      isMounted = false;
      controller.abort();
      clearProcessingTimers();
    };
  }, [sort, direction, refreshKey, isFullPage, buildPanelItem, clearProcessingTimers, sourceDateRange.endDate, sourceDateRange.startDate]);

  const loadMoreRows = React.useCallback(async () => {
    if (!rowsHasMore || rowsLoadingMore) return;
    setRowsLoadingMore(true);
    setRowsError(null);
    try {
      const params = new URLSearchParams({
        limit: String(SOURCE_LEDGER_PAGE_SIZE),
        offset: String(rowsNextOffset),
        sort,
        direction,
        dateFrom: sourceDateRange.startDate,
        dateTo: sourceDateRange.endDate,
      });
      const response = await fetch(getApiUrl(`${SOURCE_LEDGER_ENDPOINT}?${params.toString()}`), {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(String(payload?.error || `ledger_${response.status}`));
      const payloadColumns = payload?.columns && typeof payload.columns === 'object' ? payload.columns : {};
      setSourceLedgerAttributionColumns({
        campaign: payloadColumns.campaign !== false,
        keyword: payloadColumns.keyword !== false,
      });
      const mappedRows = mapSourceLedgerRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setRows((current) => {
        const seen = new Set(current.map(getSourceLedgerRowIdentity));
        const nextRows = [...current];
        mappedRows.forEach((row) => {
          const identity = getSourceLedgerRowIdentity(row);
          if (seen.has(identity)) return;
          seen.add(identity);
          nextRows.push(row);
        });
        return nextRows;
      });
      setRowsHasMore(Boolean(payload?.hasMore));
      setRowsNextOffset(Number.isFinite(Number(payload?.nextOffset)) ? Number(payload.nextOffset) : rowsNextOffset + mappedRows.length);
      setShowAllRows(true);
    } catch (fetchError) {
      setRowsError('Could not load more source ledger rows.');
    } finally {
      setRowsLoadingMore(false);
    }
  }, [direction, rowsHasMore, rowsLoadingMore, rowsNextOffset, sort, sourceDateRange.endDate, sourceDateRange.startDate]);

  const dataHubBrandAccent = isDarkMode ? colours.accent : colours.highlight;
  const dataHubSurface = isDarkMode ? colours.dark.sectionBackground : withAlpha(colours.grey, 0.98);
  const dataHubCardSurface = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.98);
  const dataHubFooterSurface = isDarkMode ? colours.websiteBlue : colours.grey;
  const dataHubControlSurface = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.42) : withAlpha(colours.light.cardBackground, 0.82);
  const dataHubSelectedSurface = withAlpha(dataHubBrandAccent, isDarkMode ? 0.16 : 0.09);
  const dataHubBorder = isDarkMode ? withAlpha(colours.dark.borderColor, 0.38) : withAlpha(colours.greyText, 0.14);

  const renderError = (message: string) => (
    <div
      style={{
        border: `1px solid ${withAlpha(colours.cta, 0.45)}`,
        background: withAlpha(colours.cta, 0.12),
        color: isDarkMode ? colours.dark.text : colours.light.text,
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );

  const renderEmpty = (message: string) => (
    <div
      style={{
        border: `1px solid ${dataHubBorder}`,
        background: dataHubControlSurface,
        color: isDarkMode ? colours.greyText : colours.subtleGrey,
        padding: '10px 12px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );

  const handleSort = React.useCallback((nextSort: LedgerSortKey) => {
    if (nextSort === sort) {
      setDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSort(nextSort);
    setDirection('desc');
  }, [sort]);

  const postRowUpdate = React.useCallback(async (id: number, updates: Partial<Record<EditableLedgerField, string | null>>) => {
    const response = await fetch(getApiUrl(SOURCE_ROW_UPDATE_ENDPOINT), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ id, updates }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || 'Row update failed'));
    }
    return payload as { rowsAffected?: number; updatedFields?: string[] };
  }, []);

  const handleSaveChangedRows = React.useCallback(async (scope: 'selected' | 'all') => {
    const targets = scope === 'selected' ? selectedChangedRows : changedRows;
    if (!targets.length) return;

    setSavingKey('rows:save-multi');
    setFeedback(null);

    const updatedById = new Map<number, Partial<Record<EditableLedgerField, string | null>>>();
    const savedKeys = new Set<string>();
    let rowsAffected = 0;
    let failCount = 0;

    for (const target of targets) {
      try {
        const payload = await postRowUpdate(Number(target.row.id), target.updates);
        if (target.row.id != null) {
          updatedById.set(target.row.id, target.updates);
          savedKeys.add(target.rowKey);
        }
        rowsAffected += Number(payload.rowsAffected || 0);
      } catch (error) {
        failCount += 1;
      }
    }

    if (updatedById.size > 0) {
      setRows((prev) => prev.map((entry) => {
        if (entry.id == null) return entry;
        const nextUpdates = updatedById.get(entry.id);
        if (!nextUpdates) return entry;
        return {
          ...entry,
          ...nextUpdates,
          datetime: Object.prototype.hasOwnProperty.call(nextUpdates, 'datetime')
            ? (nextUpdates.datetime == null ? null : String(nextUpdates.datetime))
            : entry.datetime,
        };
      }));
      setRowDrafts((prev) => {
        const next = { ...prev };
        savedKeys.forEach((key) => {
          delete next[key];
        });
        return next;
      });
      setSelectedRowKeys((prev) => {
        const next = { ...prev };
        savedKeys.forEach((key) => {
          delete next[key];
        });
        return next;
      });
      setActiveLedgerCell((current) => (current && savedKeys.has(current.rowKey) ? null : current));
      setRefreshKey((prev) => prev + 1);
    }

    if (failCount > 0) {
      setFeedback({ type: 'error', message: `Saved ${updatedById.size.toLocaleString('en-GB')} row edits, ${failCount.toLocaleString('en-GB')} failed. Please retry.` });
    } else {
      setFeedback({ type: 'success', message: `Saved ${updatedById.size.toLocaleString('en-GB')} row edits (${rowsAffected.toLocaleString('en-GB')} rows affected).` });
    }

    setSavingKey(null);
  }, [selectedChangedRows, changedRows, postRowUpdate]);

  const handleCallRailInspect = React.useCallback(async (row: SourceLedgerRow, rowKey: string) => {
    const normalizedPhone = normalizePhoneForLookup(row.phone || '');
    if (!normalizedPhone) {
      setFeedback({ type: 'error', message: 'No phone number available for CallRail lookup.' });
      return;
    }

    setCallRailProcessingKey(rowKey);
    setCallRailModal({
      open: false,
      rowId: rowKey,
      enquiryId: row.id == null ? '' : String(row.id),
      enquiryAcid: String(row.acid || ''),
      enquiryDate: row.datetime || null,
      phone: normalizedPhone,
      source: String(row.source || ''),
      checkedAt: null,
      queuedSource: null,
      queuedCampaign: null,
      queuedKeyword: null,
      queuedUrl: null,
      queuedGclid: null,
      loading: true,
      error: null,
      rows: [],
    });

    try {
      await Promise.resolve();

      const response = await fetch(getApiUrl('/api/callrailCalls'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: normalizedPhone, maxResults: 50 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `CallRail lookup failed (${response.status})`));
      }

      const targetDigits = normalizePhoneDigits(normalizedPhone);
      const calls = Array.isArray(payload?.calls) ? payload.calls : [];
      const sanitizedRows = calls
        .filter((call: any) => {
          const customerDigits = normalizePhoneDigits(String(call?.customerPhoneNumber || ''));
          return !targetDigits || !customerDigits
            ? true
            : customerDigits.endsWith(targetDigits.slice(-10));
        })
        .slice(0, 20)
        .map((call: any): CallRailInspectionRow => ({
          startTime: typeof call?.startTime === 'string' ? call.startTime : '',
          source: typeof call?.source === 'string' ? call.source : '',
          medium: typeof call?.medium === 'string' ? call.medium : '',
          campaign: pickStagedCallRailValue(call?.campaign, call?.utmCampaign, call?.utm_campaign),
          keywords: pickStagedCallRailValue(call?.keywords, call?.utmTerm, call?.utm_term),
          landingPageUrl: pickStagedCallRailValue(call?.landingPageUrl, call?.landing_page_url),
          referringUrl: pickStagedCallRailValue(call?.referringUrl, call?.referring_url),
          lastRequestedUrl: pickStagedCallRailValue(call?.lastRequestedUrl, call?.last_requested_url),
          direction: typeof call?.direction === 'string' ? call.direction : '',
          answered: asBool(call?.answered),
          gclid: typeof call?.gclid === 'string' ? call.gclid : '',
        }));

      const decision = buildCallRailDecision(sanitizedRows, row.source || '');
      const suggestedSource = String(decision.suggestedSource || '').trim();
      const shouldSuggestChange = Boolean(
        decision.suggestedSource
        && suggestedSource
        && normaliseEvidenceString(suggestedSource) !== normaliseEvidenceString(row.source || ''),
      );
      const latestMatchedCall = decision.latestMatchedCall;
      const suggestedCampaign = normaliseStagedCallRailValue(latestMatchedCall?.campaign || '');
      const suggestedKeyword = normaliseStagedCallRailValue(latestMatchedCall?.keywords || '');
      const suggestedUrl = pickStagedCallRailValue(latestMatchedCall?.landingPageUrl, latestMatchedCall?.lastRequestedUrl, latestMatchedCall?.referringUrl);
      const suggestedGclid = normaliseStagedCallRailValue(latestMatchedCall?.gclid || '');
      const stagedUpdates: Partial<Record<EditableLedgerField, string>> = {};
      if (shouldSuggestChange) stagedUpdates.source = suggestedSource;
      if (sourceLedgerAttributionColumns.campaign && suggestedCampaign && normaliseEvidenceString(suggestedCampaign) !== normaliseEvidenceString(row.campaign || '')) {
        stagedUpdates.campaign = suggestedCampaign;
      }
      if (sourceLedgerAttributionColumns.keyword && suggestedKeyword && normaliseEvidenceString(suggestedKeyword) !== normaliseEvidenceString(row.keyword || '')) {
        stagedUpdates.keyword = suggestedKeyword;
      }
      if (suggestedUrl && normaliseEvidenceString(suggestedUrl) !== normaliseEvidenceString(row.url || '')) {
        stagedUpdates.url = suggestedUrl;
      }
      if (suggestedGclid && normaliseEvidenceString(suggestedGclid) !== normaliseEvidenceString(row.gclid || '')) {
        stagedUpdates.gclid = suggestedGclid;
      }
      const hasStagedUpdates = Object.keys(stagedUpdates).length > 0;

      if (hasStagedUpdates) {
        setRowDrafts((prev) => ({
          ...prev,
          [rowKey]: {
            ...(prev[rowKey] || {}),
            ...stagedUpdates,
          },
        }));
        setSelectedRowKeys((prev) => ({ ...prev, [rowKey]: true }));
        setFeedback(null);
      } else if (!sanitizedRows.length) {
        setFeedback(null);
      } else {
        setFeedback(null);
      }

      setCallRailModal((prev) => ({
        ...prev,
        open: true,
        loading: false,
        checkedAt: new Date().toISOString(),
        queuedSource: shouldSuggestChange ? suggestedSource : null,
        queuedCampaign: stagedUpdates.campaign || null,
        queuedKeyword: stagedUpdates.keyword || null,
        queuedUrl: stagedUpdates.url || null,
        queuedGclid: stagedUpdates.gclid || null,
        rows: sanitizedRows,
      }));
    } catch (error) {
      setCallRailModal((prev) => ({
        ...prev,
        loading: false,
        checkedAt: new Date().toISOString(),
        open: true,
        queuedSource: null,
        queuedCampaign: null,
        queuedKeyword: null,
        queuedUrl: null,
        queuedGclid: null,
        error: error instanceof Error ? error.message : 'CallRail lookup failed.',
      }));
    } finally {
      setCallRailProcessingKey(null);
    }
  }, [sourceLedgerAttributionColumns.campaign, sourceLedgerAttributionColumns.keyword]);

  const headingStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
  };

  const eyebrowStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: dataHubBrandAccent,
  };

  const countPillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: `1px solid ${dataHubBorder}`,
    background: dataHubControlSurface,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };

  const compactPillStyle: React.CSSProperties = {
    ...countPillStyle,
    padding: '4px 8px',
    fontSize: 10,
  };

  const filterChipStyle = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? withAlpha(dataHubBrandAccent, isDarkMode ? 0.58 : 0.44) : dataHubBorder}`,
    background: active ? dataHubSelectedSurface : dataHubControlSurface,
    color: active ? dataHubBrandAccent : (isDarkMode ? colours.greyText : colours.subtleGrey),
    padding: '5px 8px',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'transform 160ms ease, border-color 160ms ease, background 160ms ease',
    transform: active ? 'translateY(-1px)' : 'translateY(0)',
  });

  const changedCellStyle: React.CSSProperties = {
    boxShadow: `inset 0 0 0 1px ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.32 : 0.18)}, inset 3px 0 0 ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.7 : 0.6)}`,
    transform: 'translateY(-1px)',
  };

  const fieldShellStyle = (width: number, isChangedField: boolean, forceBoxInFullPage = false): React.CSSProperties => ({
    width: isFullPage ? '100%' : width,
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    minHeight: compactShellMinHeight,
    border: (isFullPage && !forceBoxInFullPage)
      ? 'none'
      : `1px solid ${isChangedField
          ? withAlpha(dataHubBrandAccent, isDarkMode ? 0.42 : 0.38)
          : dataHubBorder}`,
    background: (isFullPage && !forceBoxInFullPage)
      ? 'transparent'
      : dataHubControlSurface,
    boxShadow: (isFullPage && !forceBoxInFullPage) ? 'none' : (isChangedField ? changedCellStyle.boxShadow : 'none'),
    transition: 'border-color 140ms ease, box-shadow 140ms ease, background 140ms ease, transform 140ms ease',
  });

  const fieldInputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: compactInputPadding,
    fontSize: compactFontSize,
    fontWeight: isFullPage ? 500 : 600,
    fontFamily: 'Raleway, sans-serif',
    lineHeight: 1.1,
    textAlign: 'left',
  };

  const fieldSelectStyle: React.CSSProperties = {
    ...fieldInputStyle,
    fontWeight: isFullPage ? 500 : 600,
    cursor: 'pointer',
  };

  const renderReadOnlyValue = (value: string | number | null | undefined, fallback = 'Not set') => {
    const label = String(value ?? '').trim() || fallback;
    return (
      <span className="enquiry-source-ledger-readonly" title={label}>
        {label}
      </span>
    );
  };

  const isFieldDrafted = (rowFieldDrafts: Partial<Record<EditableLedgerField, string>>, field: EditableLedgerField) => (
    Object.prototype.hasOwnProperty.call(rowFieldDrafts, field)
  );

  const isCellEditing = (rowKey: string, field: EditableLedgerField, rowFieldDrafts: Partial<Record<EditableLedgerField, string>>) => (
    activeLedgerCell?.rowKey === rowKey && activeLedgerCell.field === field || isFieldDrafted(rowFieldDrafts, field)
  );

  const clearActiveCell = (rowKey: string, field: EditableLedgerField) => {
    setActiveLedgerCell((current) => (current?.rowKey === rowKey && current.field === field ? null : current));
  };

  const renderEditableReadOnlyValue = (
    row: SourceLedgerRow,
    rowKey: string,
    field: EditableLedgerField,
    value: string | number | null | undefined,
    fallback = 'Not set',
    content?: React.ReactNode,
  ) => {
    const label = String(value ?? '').trim() || fallback;
    if (!row.id || savingKey === 'rows:save-multi') return renderReadOnlyValue(value, fallback);
    return (
      <button
        type="button"
        className="enquiry-source-ledger-readonly-button"
        title={`Edit ${label}`}
        onClick={() => setActiveLedgerCell({ rowKey, field })}
      >
        {content || <span className="enquiry-source-ledger-readonly">{label}</span>}
      </button>
    );
  };

  const renderInputCell = (
    row: SourceLedgerRow,
    rowKey: string,
    rowFieldDrafts: Partial<Record<EditableLedgerField, string>>,
    field: EditableInputField,
    options: {
      width: number;
      type?: 'text' | 'url' | 'datetime-local';
      placeholder?: string;
      fallback?: string;
      displayValue?: string;
      readOnlyContent?: React.ReactNode;
      inputStyle?: React.CSSProperties;
      forceBoxInFullPage?: boolean;
    },
  ) => {
    const fieldDrafted = isFieldDrafted(rowFieldDrafts, field);
    const fieldActive = activeLedgerCell?.rowKey === rowKey && activeLedgerCell.field === field;
    const shouldEdit = fieldActive || fieldDrafted;
    const draftedValue = getDraftedFieldValue(row, rowKey, field);
    if (!shouldEdit) {
      return renderEditableReadOnlyValue(row, rowKey, field, options.displayValue ?? draftedValue, options.fallback, options.readOnlyContent);
    }
    return (
      <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(options.width, fieldDrafted, options.forceBoxInFullPage)}>
        <input
          autoFocus={fieldActive}
          type={options.type || 'text'}
          value={draftedValue}
          onChange={(event) => setRowFieldDraft(row, rowKey, field, event.target.value)}
          onBlur={() => clearActiveCell(rowKey, field)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              clearActiveCell(rowKey, field);
              event.currentTarget.blur();
            }
          }}
          placeholder={options.placeholder}
          disabled={!row.id || savingKey === 'rows:save-multi'}
          style={{ ...fieldInputStyle, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...options.inputStyle }}
        />
      </div>
    );
  };

  const renderSelectCell = (
    row: SourceLedgerRow,
    rowKey: string,
    rowFieldDrafts: Partial<Record<EditableLedgerField, string>>,
    field: EditableSelectField,
    options: {
      width: number;
      fallback?: string;
      displayValue?: string;
      formatChoice?: (value: string) => string;
      forceBoxInFullPage?: boolean;
      onChange?: (value: string) => void;
    },
  ) => {
    const fieldDrafted = isFieldDrafted(rowFieldDrafts, field);
    const fieldActive = activeLedgerCell?.rowKey === rowKey && activeLedgerCell.field === field;
    const draftedValue = getDraftedFieldValue(row, rowKey, field);
    const formatChoice = options.formatChoice || ((value: string) => value);
    if (!row.id || savingKey === 'rows:save-multi') return renderReadOnlyValue(options.displayValue ?? formatChoice(draftedValue), options.fallback);
    return (
      <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(options.width, fieldDrafted, options.forceBoxInFullPage)}>
        <select
          autoFocus={fieldActive}
          className="enquiry-source-ledger-select"
          value={draftedValue}
          onFocus={() => setActiveLedgerCell({ rowKey, field })}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (options.onChange) options.onChange(nextValue);
            else setRowFieldDraft(row, rowKey, field, nextValue);
          }}
          onBlur={() => clearActiveCell(rowKey, field)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              clearActiveCell(rowKey, field);
              event.currentTarget.blur();
            }
          }}
          disabled={!row.id || savingKey === 'rows:save-multi'}
          style={{ ...fieldSelectStyle, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
        >
          <option value="">Not set</option>
          {getSelectChoices(field, row, rowKey).map((choice) => (
            <option key={`row-${field}-choice-${row.id ?? rowKey}-${choice}`} value={choice}>{formatChoice(choice)}</option>
          ))}
        </select>
      </div>
    );
  };

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${dataHubBorder}`,
    background: dataHubCardSurface,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };

  const primaryCardStyle: React.CSSProperties = {
    ...cardStyle,
    border: `1px solid ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.38 : 0.32)}`,
    boxShadow: `0 0 0 1px ${withAlpha(dataHubBrandAccent, 0.08)} inset`,
    order: 1,
  };

  const tableHeaderButtonStyle = (isActive: boolean): React.CSSProperties => ({
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    padding: 0,
    width: '100%',
    color: isActive
      ? dataHubBrandAccent
      : (isDarkMode ? colours.greyText : colours.subtleGrey),
    fontSize: isFullPage ? 10 : 11,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    fontWeight: 700,
  });

  const allSelectableRowKeys = React.useMemo(
    () => visibleFilteredRows.filter((row) => row.id != null).map((row, index) => getRowKey(row, index)),
    [visibleFilteredRows, getRowKey],
  );

  const selectedRowsForCallRail = React.useMemo(() => (
    rows
      .map((row, index) => ({ row, rowKey: getRowKey(row, index) }))
      .filter(({ row, rowKey }) => row.id != null && selectedRowKeys[rowKey])
  ), [getRowKey, rows, selectedRowKeys]);

  const handleRowSelectionChange = React.useCallback((rowKey: string, checked: boolean, shiftKey: boolean) => {
    setSelectedRowKeys((prev) => {
      const next = { ...prev };
      const currentIndex = allSelectableRowKeys.indexOf(rowKey);
      const anchorIndex = lastSelectedRowKey ? allSelectableRowKeys.indexOf(lastSelectedRowKey) : -1;
      if (shiftKey && currentIndex > -1 && anchorIndex > -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        allSelectableRowKeys.slice(start, end + 1).forEach((key) => {
          if (checked) next[key] = true;
          else delete next[key];
        });
      } else if (checked) {
        next[rowKey] = true;
      } else {
        delete next[rowKey];
      }
      return next;
    });
    setLastSelectedRowKey(rowKey);
  }, [allSelectableRowKeys, lastSelectedRowKey]);

  const handleSelectedCallRailCheck = React.useCallback(async () => {
    if (!selectedRowsForCallRail.length || callRailProcessingKey || savingKey === 'rows:save-multi') return;
    let checkedCount = 0;
    let skippedCount = 0;
    setFeedback({ type: 'success', message: `Checking ${selectedRowsForCallRail.length.toLocaleString('en-GB')} selected enquiries with CallRail.` });
    for (const { row, rowKey } of selectedRowsForCallRail) {
      if (!normalizePhoneForLookup(row.phone || '')) {
        skippedCount += 1;
        continue;
      }
      await handleCallRailInspect(row, rowKey);
      checkedCount += 1;
    }
    if (checkedCount === 0) {
      setFeedback({ type: 'error', message: 'No selected enquiries had a phone number for CallRail lookup.' });
      return;
    }
    setFeedback({
      type: skippedCount > 0 ? 'error' : 'success',
      message: `CallRail checked ${checkedCount.toLocaleString('en-GB')} selected enquiries${skippedCount > 0 ? `, ${skippedCount.toLocaleString('en-GB')} skipped without phone numbers` : ''}. Review staged changes before saving.`,
    });
  }, [callRailProcessingKey, handleCallRailInspect, savingKey, selectedRowsForCallRail]);

  const allRowsSelected = allSelectableRowKeys.length > 0 && allSelectableRowKeys.every((key) => selectedRowKeys[key]);
  const someRowsSelected = allSelectableRowKeys.some((key) => selectedRowKeys[key]);
  const callRailQueuedFields = [
    callRailModal.queuedSource ? 'source' : null,
    callRailModal.queuedCampaign ? 'campaign' : null,
    callRailModal.queuedKeyword ? 'keyword' : null,
    callRailModal.queuedUrl ? 'url' : null,
    callRailModal.queuedGclid ? 'gclid' : null,
  ].filter(Boolean);
  const callRailHasQueuedFields = callRailQueuedFields.length > 0;
  const themeText = isDarkMode ? colours.dark.text : colours.light.text;
  const themeMutedText = isDarkMode ? colours.greyText : colours.subtleGrey;
  const fullPageSurface = dataHubSurface;
  const ledgerSurface = isFullPage ? fullPageSurface : dataHubSurface;
  const tablePanelSurface = dataHubCardSurface;
  const tableHeaderSurface = dataHubFooterSurface;
  const tableBorder = dataHubBorder;
  const toolbarBorder = dataHubBorder;
  const toolbarSurface = dataHubCardSurface;
  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: isFullPage ? 0 : 10,
    flexWrap: 'wrap',
    border: `1px solid ${toolbarBorder}`,
    backgroundColor: toolbarSurface,
    padding: isFullPage ? '8px 10px' : '10px 12px',
  };
  const toolbarControlStyle: React.CSSProperties = {
    minHeight: 30,
    border: `1px solid ${toolbarBorder}`,
    backgroundColor: dataHubControlSurface,
    color: themeText,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.02em',
    lineHeight: 1.1,
    borderRadius: 0,
    boxSizing: 'border-box',
  };
  const filterGroupStyle: React.CSSProperties = {
    display: 'inline-flex',
    minHeight: 30,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: toolbarBorder,
    backgroundColor: dataHubControlSurface,
  };
  const filterButtonStyle = (active: boolean, isLast: boolean): React.CSSProperties => ({
    borderWidth: `0 ${isLast ? 0 : 1}px 0 0`,
    borderStyle: 'solid',
    borderColor: toolbarBorder,
    backgroundColor: active
      ? dataHubSelectedSurface
      : 'transparent',
    color: active ? dataHubBrandAccent : themeMutedText,
    padding: isFullPage ? '0 9px' : '0 10px',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    textTransform: 'uppercase',
  });
  const headerCellStyle: React.CSSProperties = {
    borderBottom: `1px solid ${tableBorder}`,
    padding: isFullPage ? '8px 8px' : '9px 8px',
    textAlign: 'left',
    backgroundColor: tableHeaderSurface,
    color: themeMutedText,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    height: isFullPage ? 36 : 38,
    verticalAlign: 'middle',
  };

  const renderSortableHeader = (column: { key: LedgerSortKey; label: string }) => {
    const isActive = sort === column.key;
    const marker = isActive ? (direction === 'desc' ? ' desc' : ' asc') : '';
    return (
      <th key={`source-ledger-head-${column.key}`} className="enquiry-source-ledger-headcell" style={headerCellStyle}>
        <button
          type="button"
          style={tableHeaderButtonStyle(isActive)}
          onClick={() => handleSort(column.key)}
          aria-sort={isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}
        >
          <span style={{ display: 'flex', alignItems: 'center', minHeight: isFullPage ? 20 : 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {column.label}{marker}
          </span>
        </button>
      </th>
    );
  };

  const renderPlainHeader = (key: SourceLedgerColumnKey, label: string, content?: React.ReactNode) => (
    <th key={`source-ledger-head-${key}`} className="enquiry-source-ledger-headcell" style={{ ...headerCellStyle, fontSize: 11, fontWeight: 700 }}>
      {content || <span style={{ display: 'flex', alignItems: 'center', minHeight: isFullPage ? 20 : 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
    </th>
  );

  return (
    <section
      className={`enquiry-source-ledger${isFullPage ? ' enquiry-source-ledger--fullpage' : ''}${isDarkMode ? ' enquiry-source-ledger--dark' : ' enquiry-source-ledger--light'}`}
      data-helix-region="reports/data-hub/enquiry-source"
      style={{
        marginTop: isFullPage ? 0 : 12,
        border: isFullPage ? 'none' : `1px solid ${dataHubBorder}`,
        background: ledgerSurface,
        color: themeText,
        padding: isFullPage ? 0 : 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: isFullPage ? '100vh' : undefined,
        minHeight: isFullPage ? 0 : undefined,
        ['--enquiry-source-ledger-row-hover' as string]: dataHubSelectedSurface,
        ['--enquiry-source-ledger-cap-bg' as string]: dataHubControlSurface,
        ['--enquiry-source-ledger-cap-border' as string]: dataHubBorder,
        ['--enquiry-source-ledger-cap-text' as string]: isDarkMode ? '#d1d5db' : colours.subtleGrey,
        ['--enquiry-source-ledger-cap-action' as string]: dataHubBrandAccent,
      }}
    >
      {!isFullPage && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={eyebrowStyle}>Data Hub</p>
            <h3 style={headingStyle}>Enquiry Source Ledger</h3>
          </div>
          <span style={countPillStyle}>Instructions ledger</span>
        </div>
      )}
      {feedback && (
        <div
          style={{
            border: `1px solid ${feedback.type === 'success' ? withAlpha(colours.green, 0.45) : withAlpha(colours.cta, 0.45)}`,
            background: feedback.type === 'success' ? withAlpha(colours.green, 0.1) : withAlpha(colours.cta, 0.12),
            color: isDarkMode ? colours.dark.text : colours.light.text,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {feedback.message}
        </div>
      )}

      <div
        style={isFullPage
          ? {
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              border: 'none',
              background: tablePanelSurface,
              padding: '6px 8px 0',
              flex: '1 1 auto',
              minHeight: 0,
            }
          : primaryCardStyle}
      >
        {rowsError && renderError(rowsError)}
        <div
          style={toolbarStyle}
        >
          <label style={{ display: 'flex', alignItems: 'center', flex: '1 1 280px', minWidth: 180 }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search ID, ACID, source, campaign or keyword"
              style={{
                ...toolbarControlStyle,
                minWidth: 0,
                width: '100%',
                padding: '0 10px',
              }}
            />
          </label>

          <div style={filterGroupStyle}>
            {[
              { key: 'all' as LedgerChannelFilter, label: 'All' },
              { key: 'calls' as LedgerChannelFilter, label: 'Calls' },
              { key: 'web-forms' as LedgerChannelFilter, label: 'Web forms' },
            ].map((option, optionIndex, options) => {
              const active = channelFilter === option.key;
              return (
                <button
                  key={`ledger-filter-${option.key}`}
                  type="button"
                  onClick={() => setChannelFilter(option.key)}
                  style={filterButtonStyle(active, optionIndex === options.length - 1)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div style={filterGroupStyle}>
            {SOURCE_REVIEW_FILTERS.map((option, optionIndex, options) => {
              const active = sourceReviewFilter === option.key;
              return (
                <button
                  key={`ledger-source-review-${option.key}`}
                  type="button"
                  onClick={() => setSourceReviewFilter(option.key)}
                  style={filterButtonStyle(active, optionIndex === options.length - 1)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <select
            className="enquiry-source-ledger-select enquiry-source-ledger-select--bulk"
            aria-label="Enquiries date window"
            value={sourceDatePreset}
            onChange={(event) => setSourceDatePreset(event.target.value as SourceDatePreset)}
            style={{ ...toolbarControlStyle, color: themeText, minWidth: 132, padding: '0 22px 0 8px' }}
          >
            {SOURCE_DATE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>

          <span style={compactPillStyle}>{sourceDateRange.startDate} to {sourceDateRange.endDate}</span>

          <ColumnSelector
            columns={selectorColumns}
            visibleColumns={visibleColumns}
            onToggleColumn={handleToggleColumn}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
            onReset={handleReset}
            menuAlign="left"
          />

          {searchTerm.trim() && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                ...toolbarControlStyle,
                backgroundColor: dataHubControlSurface,
                color: themeMutedText,
                padding: '0 10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
              }}
            >
              Clear
            </button>
          )}

          {isSearchPending && <span style={compactPillStyle}>Filtering</span>}
          {rowsLoadingMore && <span style={compactPillStyle}>Loading more</span>}
          {Object.keys(selectedRowKeys).length > 0 && (
            <span style={compactPillStyle}>
              {Object.keys(selectedRowKeys).length.toLocaleString('en-GB')} selected
            </span>
          )}
          {selectedRowsForCallRail.length > 0 && (
            <button
              type="button"
              onClick={() => { void handleSelectedCallRailCheck(); }}
              disabled={Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi'}
              style={{
                ...toolbarControlStyle,
                backgroundColor: dataHubSelectedSurface,
                color: dataHubBrandAccent,
                padding: '0 10px',
                cursor: callRailProcessingKey || savingKey === 'rows:save-multi' ? 'wait' : 'pointer',
                opacity: callRailProcessingKey || savingKey === 'rows:save-multi' ? 0.58 : 1,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
              }}
            >
              {callRailProcessingKey ? 'Checking' : `Check selected (${selectedRowsForCallRail.length.toLocaleString('en-GB')})`}
            </button>
          )}
          {changedRows.length > 0 && (
            <span style={compactPillStyle}>
              {changedRows.length.toLocaleString('en-GB')} changed
            </span>
          )}
        </div>
        <div
          className="enquiry-source-ledger-scroll"
          style={{
            overflowX: 'auto',
            overflowY: 'auto',
            flex: isFullPage ? '1 1 auto' : undefined,
            minHeight: isFullPage ? 0 : undefined,
            maxHeight: isFullPage ? undefined : '66vh',
            paddingBottom: isFullPage ? 14 : undefined,
            background: tablePanelSurface,
          }}
        >
          <table className="enquiry-source-ledger-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, minWidth: ledgerTableMinWidth, background: tablePanelSurface, color: themeText }}>
            <colgroup>
              {visibleLedgerColumns.map((column) => (
                <col
                  key={`source-ledger-col-${column.key}`}
                  style={{ width: `${(((SOURCE_LEDGER_COLUMN_WEIGHTS[column.key as SourceLedgerColumnKey] ?? 8) / visibleLedgerColumnWeight) * 100).toFixed(4)}%` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visibleLedgerColumns.map((column) => {
                  const key = column.key as SourceLedgerColumnKey;
                  if (key === 'select') {
                    return renderPlainHeader('select', 'Select', (
                      <input
                        className="enquiry-source-ledger-checkbox"
                        type="checkbox"
                        aria-label="Select all ledger rows"
                        checked={allRowsSelected}
                        ref={(node) => {
                          if (node) node.indeterminate = !allRowsSelected && someRowsSelected;
                        }}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedRowKeys((prev) => {
                            if (!checked) return {};
                            const next: Record<string, boolean> = { ...prev };
                            allSelectableRowKeys.forEach((rowKey) => {
                              next[rowKey] = true;
                            });
                            return next;
                          });
                          setLastSelectedRowKey(null);
                        }}
                        style={{ cursor: 'pointer', margin: 0 }}
                      />
                    ));
                  }
                  if (key === 'date') return renderSortableHeader({ key: 'date', label: 'Date' });
                  if (key === 'id') return renderSortableHeader({ key: 'id', label: 'ID / ACID' });
                  if (key === 'aow') return renderSortableHeader({ key: 'aow', label: 'Area of Work' });
                  if (key === 'moc') return renderSortableHeader({ key: 'moc', label: 'MOC' });
                  if (key === 'poc') return renderSortableHeader({ key: 'poc', label: 'POC' });
                  if (key === 'campaign') return renderSortableHeader({ key: 'campaign', label: 'Campaign' });
                  if (key === 'keyword') return renderSortableHeader({ key: 'keyword', label: 'Keyword' });
                  if (key === 'source') return renderSortableHeader({ key: 'source', label: 'Source' });
                  if (key === 'url') return renderPlainHeader('url', 'Landing URL');
                  if (key === 'gclid') return renderPlainHeader('gclid', 'GCLID');
                  if (key === 'tags') return renderPlainHeader('tags', 'Tags');
                  if (key === 'matter') return renderPlainHeader('matter', 'Matter');
                  return renderPlainHeader(key, column.label);
                })}
              </tr>
            </thead>
            <tbody>
              {!isFullPage && rowsLoading && Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                <tr key={`source-ledger-skeleton-${index}`}>
                  {Array.from({ length: visibleLedgerColumnCount }).map((__, innerIndex) => (
                    <td
                      key={`source-ledger-skeleton-cell-${index}-${innerIndex}`}
                      style={{
                        borderBottom: `1px solid ${dataHubBorder}`,
                        padding: compactCellPadding,
                      }}
                    >
                      <div
                        style={{
                          height: 12,
                          width: '86%',
                          background: dataHubControlSurface,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}

              {!rowsLoading && visibleFilteredRows.map((row, index) => (
                (() => {
                  const rowKey = getRowKey(row, index);
                  const rowFieldDrafts = rowDrafts[rowKey] || {};
                  const isSelected = Boolean(selectedRowKeys[rowKey]);
                  const isExpanded = expandedRowKey === rowKey;
                  const isChanged = changedRowKeys.has(rowKey);
                  const rowUpdateCount = Object.keys(rowFieldDrafts).length;
                  const isWebFormRow = isWebFormChannel(getDraftedFieldValue(row, rowKey, 'moc'));
                  const sourceCellEditing = isCellEditing(rowKey, 'source', rowFieldDrafts);
                  const rowBackground = isChanged
                    ? dataHubSelectedSurface
                    : isSelected
                      ? dataHubSelectedSurface
                      : 'transparent';
                  const rowCellStyle: React.CSSProperties = {
                    borderBottom: `1px solid ${dataHubBorder}`,
                    padding: compactCellPadding,
                    background: rowBackground,
                    transition: 'background 120ms ease',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                    textAlign: 'left',
                  };

                  return (
                <React.Fragment key={`source-ledger-row-${row.id ?? row.datetime ?? index}`}>
                <tr
                  className="enquiry-source-ledger-row"
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('button,input,select,textarea,a,label')) return;
                    setExpandedRowKey((current) => (current === rowKey ? null : rowKey));
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {isColumnVisible('select') && (
                    <td style={rowCellStyle}>
                      <input
                        className="enquiry-source-ledger-checkbox"
                        type="checkbox"
                        aria-label={`Select row ${row.id ?? index}`}
                        checked={isSelected}
                        disabled={savingKey === 'rows:save-multi' || !row.id}
                        onChange={(event) => {
                          handleRowSelectionChange(rowKey, event.target.checked, event.nativeEvent instanceof MouseEvent ? event.nativeEvent.shiftKey : false);
                        }}
                        style={{ cursor: row.id ? 'pointer' : 'default', margin: 0 }}
                      />
                    </td>
                  )}
                  {isColumnVisible('date') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderInputCell(row, rowKey, rowFieldDrafts, 'datetime', {
                        width: 144,
                        type: 'datetime-local',
                        fallback: 'Not set',
                        displayValue: formatDate(row.datetime),
                        inputStyle: { fontSize: isFullPage ? 8 : 9, padding: isFullPage ? '0 3px' : '3px 5px' },
                        readOnlyContent: isFullPage ? (
                          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatDate(row.datetime)}>
                          <span style={{ fontSize: 8, fontWeight: 500, color: themeText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatDateCompact(row.datetime)}
                          </span>
                          <span style={{ fontSize: 8, color: themeMutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatTimeCompact(row.datetime)}
                          </span>
                          </span>
                        ) : undefined,
                      })}
                    </td>
                  )}
                  {isColumnVisible('id') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: isFullPage ? 0 : 4 }}>
                        {!isFullPage && row.id != null && <span style={{ fontWeight: 700 }}>#{row.id}</span>}
                        {renderInputCell(row, rowKey, rowFieldDrafts, 'acid', {
                          width: 108,
                          placeholder: 'ACID',
                          displayValue: row.acid || (row.id != null ? `#${row.id}` : ''),
                        })}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('aow') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderSelectCell(row, rowKey, rowFieldDrafts, 'aow', { width: 150 })}
                    </td>
                  )}
                  {isColumnVisible('moc') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderSelectCell(row, rowKey, rowFieldDrafts, 'moc', { width: 132 })}
                    </td>
                  )}
                  {isColumnVisible('poc') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderSelectCell(row, rowKey, rowFieldDrafts, 'poc', {
                        width: 122,
                        displayValue: formatTeamInitialsLabel(getDraftedFieldValue(row, rowKey, 'poc')),
                        formatChoice: formatTeamInitialsLabel,
                      })}
                    </td>
                  )}
                  {isColumnVisible('phone') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      <div style={{ display: 'grid', gap: isFullPage ? 0 : 4 }}>
                        {renderInputCell(row, rowKey, rowFieldDrafts, 'phone', {
                          width: 122,
                          placeholder: isWebFormRow ? 'Web form contact' : 'Phone',
                        })}
                        {!isColumnVisible('url') && !isFullPage && (isWebFormRow || isFieldDrafted(rowFieldDrafts, 'url')) && renderInputCell(row, rowKey, rowFieldDrafts, 'url', {
                          width: 188,
                          type: 'url',
                          placeholder: 'Landing URL',
                          fallback: 'Landing URL',
                        })}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('campaign') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderInputCell(row, rowKey, rowFieldDrafts, 'campaign', {
                        width: 136,
                        placeholder: 'Campaign',
                      })}
                    </td>
                  )}
                  {isColumnVisible('keyword') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderInputCell(row, rowKey, rowFieldDrafts, 'keyword', {
                        width: 136,
                        placeholder: 'Keyword',
                      })}
                    </td>
                  )}
                  {isColumnVisible('source') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      <div style={{ display: 'flex', gap: isFullPage ? 4 : 6, alignItems: 'center', flexWrap: isFullPage ? 'nowrap' : 'wrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'stretch', width: '100%', maxWidth: isFullPage ? 260 : 320, minWidth: 0 }}>
                          <span className="enquiry-source-ledger-source-readonly">
                            {renderSelectCell(row, rowKey, rowFieldDrafts, 'source', {
                              width: 164,
                              forceBoxInFullPage: true,
                              onChange: (nextSource) => {
                                const draftedPhone = getDraftedFieldValue(row, rowKey, 'phone');
                                setRowFieldDraft(row, rowKey, 'source', nextSource);
                                if (draftedPhone && !callRailProcessingKey && savingKey !== 'rows:save-multi') {
                                  void handleCallRailInspect({
                                    ...row,
                                    phone: draftedPhone,
                                    source: nextSource,
                                  }, rowKey);
                                }
                              },
                            })}
                          </span>
                          <button
                            type="button"
                            disabled={!getDraftedFieldValue(row, rowKey, 'phone') || Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi'}
                            onClick={() => {
                              void handleCallRailInspect({
                                ...row,
                                phone: getDraftedFieldValue(row, rowKey, 'phone'),
                                source: getDraftedFieldValue(row, rowKey, 'source'),
                              }, rowKey);
                            }}
                            aria-label="Check source with CallRail"
                            title={callRailProcessingKey === rowKey ? 'Checking CallRail...' : 'Check with CallRail'}
                            style={{
                              width: isFullPage ? 20 : 24,
                              minWidth: isFullPage ? 20 : 24,
                              border: `1px solid ${dataHubBorder}`,
                              background: callRailProcessingKey === rowKey ? dataHubSelectedSurface : dataHubControlSurface,
                              color: dataHubBrandAccent,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: !getDraftedFieldValue(row, rowKey, 'phone') || Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi' ? 'default' : 'pointer',
                              opacity: !getDraftedFieldValue(row, rowKey, 'phone') || Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi' ? 0.55 : 1,
                              padding: 0,
                              borderLeft: sourceCellEditing ? 'none' : `1px solid ${dataHubBorder}`,
                            }}
                          >
                            {callRailProcessingKey === rowKey ? (
                              <span className="enquiry-source-ledger-spinner" aria-hidden="true" />
                            ) : (
                              <svg width={isFullPage ? 11 : 12} height={isFullPage ? 11 : 12} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                                <path d="M2.2 9.6L4.8 8.9L9.7 4L8 2.3L3.1 7.2L2.2 9.6Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                                <path d="M7.4 2.9L9.1 4.6" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {!isColumnVisible('matter') && String(row.matterDisplayNumber || '').trim() && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              border: `1px solid ${dataHubBorder}`,
                              background: dataHubControlSurface,
                              color: themeMutedText,
                              padding: isFullPage ? '1px 5px' : '2px 6px',
                              fontSize: isFullPage ? 8 : 10,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              maxWidth: isFullPage ? 118 : 170,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`Linked matter ${String(row.matterDisplayNumber || '').trim()}`}
                          >
                            {String(row.matterDisplayNumber || '').trim()}
                          </span>
                        )}
                        {!isFullPage && isChanged && (
                          <span
                            className="enquiry-source-ledger-change-chip"
                            style={{
                              border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.5) : withAlpha(colours.highlight, 0.5)}`,
                              background: isDarkMode ? withAlpha(colours.accent, 0.18) : withAlpha(colours.highlight, 0.14),
                              color: isDarkMode ? colours.accent : colours.helixBlue,
                              padding: isFullPage ? '1px 4px' : '3px 6px',
                              fontSize: isFullPage ? 8 : 10,
                              fontWeight: 800,
                              lineHeight: 1,
                            }}
                          >
                            {rowUpdateCount.toLocaleString('en-GB')} edit{rowUpdateCount === 1 ? '' : 's'} staged
                          </span>
                        )}
                        {callRailProcessingKey === rowKey && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: isFullPage ? 2 : 5,
                              color: themeMutedText,
                              fontSize: isFullPage ? 8 : 10,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span className="enquiry-source-ledger-spinner" aria-hidden="true" />
                            Checking...
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {isColumnVisible('url') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {(() => {
                        const draftedUrl = getDraftedFieldValue(row, rowKey, 'url');
                        const truncatedUrl = truncateLedgerUrl(draftedUrl);
                        return renderInputCell(row, rowKey, rowFieldDrafts, 'url', {
                          width: 188,
                          type: 'url',
                          placeholder: 'Landing URL',
                          fallback: 'Landing URL',
                          displayValue: truncatedUrl,
                          forceBoxInFullPage: true,
                          readOnlyContent: (
                            <span
                              className="enquiry-source-ledger-readonly"
                              title={draftedUrl || 'Landing URL'}
                              style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {truncatedUrl || 'Landing URL'}
                            </span>
                          ),
                        });
                      })()}
                    </td>
                  )}
                  {isColumnVisible('gclid') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderInputCell(row, rowKey, rowFieldDrafts, 'gclid', {
                        width: 164,
                        placeholder: 'GCLID',
                      })}
                    </td>
                  )}
                  {isColumnVisible('tags') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeMutedText }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          border: `1px solid ${dataHubBorder}`,
                          background: dataHubControlSurface,
                          color: themeMutedText,
                          padding: isFullPage ? '0 5px' : '1px 6px',
                          fontSize: isFullPage ? 8 : 10,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                        title="Tags placeholder"
                      >
                        -
                      </span>
                    </td>
                  )}
                  {isColumnVisible('matter') && (
                    <td style={{ ...rowCellStyle, fontSize: 12, color: themeText }}>
                      {renderReadOnlyValue(row.matterDisplayNumber, 'Not linked')}
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <tr>
                    <td
                      colSpan={visibleLedgerColumnCount}
                      style={{
                        borderBottom: `1px solid ${dataHubBorder}`,
                        background: withAlpha(dataHubBrandAccent, isDarkMode ? 0.06 : 0.05),
                        padding: isFullPage ? '8px 10px' : '10px 12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: isFullPage ? 6 : 8,
                        }}
                      >
                        {[
                          ['ID', row.id == null ? 'Not set' : String(row.id)],
                          ['ACID', row.acid || 'Not set'],
                          ['Date Time', row.datetime || 'Not set'],
                          ['Area of Work', row.aow || 'Not set'],
                          ['MOC', row.moc || 'Not set'],
                          ['POC', row.poc || 'Not set'],
                          ['Phone', row.phone || 'Not set'],
                          ['Source', row.source || 'Not set'],
                          ['Campaign', row.campaign || 'Not set'],
                          ['Keyword', row.keyword || 'Not set'],
                          ['Landing URL', row.url || 'Not set'],
                          ['GCLID', row.gclid || 'Not set'],
                          ['Matter', row.matterDisplayNumber || 'Not linked'],
                          ['Tags', '-'],
                        ].map(([label, value]) => (
                          <div
                            key={`${rowKey}-${label}`}
                            style={{
                              border: `1px solid ${dataHubBorder}`,
                              background: dataHubControlSurface,
                              padding: isFullPage ? '6px 7px' : '7px 8px',
                              display: 'grid',
                              gap: 2,
                              minHeight: isFullPage ? 34 : 40,
                            }}
                          >
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: themeMutedText }}>
                              {label}
                            </span>
                            <span
                              style={{
                                fontSize: isFullPage ? 10 : 11,
                                fontWeight: 600,
                                color: themeText,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={String(value)}
                            >
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                  );
                })()
              ))}

              {!rowsLoading && (hiddenFilteredRowCount > 0 || rowsHasMore || rowsLoadingMore) && (
                <tr>
                  <td colSpan={visibleLedgerColumnCount} style={{ padding: isFullPage ? '8px 0' : compactCellPadding }}>
                    <div className="enquiry-source-ledger-render-cap">
                      <span>
                        Showing {visibleFilteredRows.length.toLocaleString('en-GB')} of {filteredRows.length.toLocaleString('en-GB')} loaded rows{rowsHasMore ? `, ${rows.length.toLocaleString('en-GB')} fetched so far` : ''}.
                      </span>
                      <span className="enquiry-source-ledger-render-cap__actions">
                        {hiddenFilteredRowCount > 0 && (
                          <button type="button" onClick={() => setShowAllRows(true)}>
                            Show all loaded
                          </button>
                        )}
                        {rowsHasMore && (
                          <button type="button" onClick={loadMoreRows} disabled={rowsLoadingMore}>
                            {rowsLoadingMore ? 'Loading' : 'Load more enquiries'}
                          </button>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {!rowsLoading && filteredRows.length === 0 && !rowsError && (
                <tr>
                  <td colSpan={visibleLedgerColumnCount} style={{ padding: compactCellPadding }}>
                    {renderEmpty('No lean ledger rows found in Instructions.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {changedRows.length > 0 && (
        <div
          className="enquiry-source-ledger-savebar"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 1100,
            border: `1px solid ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.45 : 0.36)}`,
            background: dataHubCardSurface,
            boxShadow: isDarkMode ? '0 10px 24px rgba(0, 0, 0, 0.4)' : '0 10px 24px rgba(13, 47, 96, 0.16)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backdropFilter: 'blur(10px)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            {changedRows.length.toLocaleString('en-GB')} pending change{changedRows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            disabled={savingKey === 'rows:save-multi'}
            onClick={() => handleSaveChangedRows(selectedChangedRows.length > 0 ? 'selected' : 'all')}
            style={{
              border: `1px solid ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.45 : 0.36)}`,
              background: savingKey === 'rows:save-multi' ? 'transparent' : dataHubSelectedSurface,
              color: dataHubBrandAccent,
              padding: '5px 8px',
              fontSize: 10,
              fontWeight: 800,
              fontFamily: 'Raleway, sans-serif',
              cursor: savingKey === 'rows:save-multi' ? 'wait' : 'pointer',
              opacity: savingKey === 'rows:save-multi' ? 0.55 : 1,
            }}
          >
            {savingKey === 'rows:save-multi'
              ? 'Saving...'
              : selectedChangedRows.length > 0
                ? `Save selected (${selectedChangedRows.length.toLocaleString('en-GB')})`
                : `Save all changed (${changedRows.length.toLocaleString('en-GB')})`}
          </button>
        </div>
      )}
      {callRailModal.open && (
        <div
          role="status"
          aria-live="polite"
          data-helix-region="reports/data-hub/callrail-result-toast"
          style={{
            position: 'fixed',
            right: 18,
            bottom: changedRows.length > 0 ? 82 : 18,
            zIndex: 1200,
            width: 'min(560px, calc(100vw - 36px))',
            border: `1px solid ${callRailModal.error ? withAlpha(colours.cta, 0.5) : callRailHasQueuedFields ? withAlpha(colours.green, 0.52) : withAlpha(dataHubBrandAccent, isDarkMode ? 0.32 : 0.28)}`,
            background: dataHubCardSurface,
            boxShadow: isDarkMode ? '0 14px 34px rgba(0, 0, 0, 0.42)' : '0 14px 34px rgba(13, 47, 96, 0.18)',
            padding: 12,
            display: 'grid',
            gap: 9,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                CALLRAIL CHECK COMPLETE
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {callRailModal.error
                  ? 'Lookup failed'
                  : callRailModal.rows.length === 0
                    ? 'No matching call found'
                    : callRailHasQueuedFields
                      ? `Attribution staged: ${callRailQueuedFields.join(', ')}`
                      : 'No source change suggested'}
              </span>
              <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                {callRailModal.error
                  ? callRailModal.error
                  : callRailModal.rows.length === 0
                    ? `${formatLookupSuffix(callRailModal.phone)}. Nothing changed.`
                    : callRailHasQueuedFields
                      ? `${callRailQueuedFields.join(', ')} added to pending row changes. Save the row to write them back.`
                      : `${callRailDecision.suggestionReason} Paid ${callRailDecision.paidSignals}, organic ${callRailDecision.organicSignals}.`}
              </span>
            </div>
            <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 800, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              5s
            </span>
          </div>
          <div className="enquiry-source-ledger-toast-timer" aria-hidden="true">
            <span />
          </div>
          {callRailDecision.latestMatchedCall && !callRailModal.error && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              <div
                style={{
                  border: `1px solid ${dataHubBorder}`,
                  background: dataHubControlSurface,
                  padding: 9,
                  display: 'grid',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>Enquiry</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>ID {callRailModal.enquiryId || 'n/a'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>ACID {callRailModal.enquiryAcid || 'n/a'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Source {callRailModal.source || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Time {formatDate(callRailModal.enquiryDate)}</span>
              </div>
              <div
                style={{
                  border: `1px solid ${dataHubBorder}`,
                  background: dataHubControlSurface,
                  padding: 9,
                  display: 'grid',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>Matched call</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Source {callRailDecision.latestMatchedCall.source || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Medium {callRailDecision.latestMatchedCall.medium || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Campaign {callRailDecision.latestMatchedCall.campaign || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Keyword {callRailDecision.latestMatchedCall.keywords || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>GCLID {callRailDecision.latestMatchedCall.gclid || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Time {formatDate(callRailDecision.latestMatchedCall.startTime || null)}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {processingPanel && (
        <aside className={`reports-floating-processing-panel${processingPanelFolded ? ' is-folded' : ''}`} data-helix-region="reports/data-hub/enquiries-processing">
          <button
            type="button"
            className="reports-floating-processing-panel__fold"
            onClick={() => setProcessingPanelFolded((prev) => !prev)}
            aria-label={processingPanelFolded ? 'Open feed breakdown' : 'Fold feed breakdown'}
            aria-expanded={!processingPanelFolded}
          >
            <FontIcon iconName={processingPanelFolded ? 'ChevronUp' : 'ChevronDown'} />
          </button>
          <button
            type="button"
            className="reports-floating-processing-panel__close"
            onClick={() => {
              setProcessingPanel(null);
              setProcessingPanelFolded(false);
            }}
            aria-label="Dismiss processing panel"
          >
            <FontIcon iconName="Cancel" />
          </button>
          <ReportProcessingRailItemCard
            isDarkMode={isDarkMode}
            item={processingPanel}
            embedded
            compact={processingPanelFolded}
            onSurfaceClick={processingPanelFolded ? () => setProcessingPanelFolded(false) : undefined}
            surfaceTitle={processingPanelFolded ? 'Open feed breakdown' : undefined}
          />
        </aside>
      )}
    </section>
  );
};

export default EnquirySourceLedger;
