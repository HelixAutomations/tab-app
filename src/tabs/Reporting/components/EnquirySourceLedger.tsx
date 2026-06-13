import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import { getNormalizedEnquirySourceLabel, hasGoogleAdsPaidSignal } from '../../../utils/enquirySource';
import { getApiUrl } from '../../../utils/getApiUrl';
import { ReportProcessingRailItemCard } from './ReportProcessingRail';
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
  source: string | null;
  url: string | null;
  matterDisplayNumber?: string | null;
};

type EditableSelectField = 'aow' | 'moc' | 'poc' | 'source';
type EditableInputField = 'acid' | 'datetime' | 'phone' | 'url';
type EditableLedgerField = EditableInputField | EditableSelectField;
type RowDrafts = Record<string, Partial<Record<EditableLedgerField, string>>>;
type FieldOptions = Record<EditableSelectField, SourceOption[]>;

type LedgerSortKey = 'date' | 'id' | 'aow' | 'moc' | 'poc' | 'source';
type LedgerDirection = 'asc' | 'desc';

type CallRailInspectionRow = {
  startTime: string;
  source: string;
  medium: string;
  campaign: string;
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
const EDITABLE_LEDGER_FIELDS: EditableLedgerField[] = ['acid', 'datetime', 'aow', 'moc', 'poc', 'phone', 'source', 'url'];
const EDITABLE_SELECT_FIELDS: EditableSelectField[] = ['aow', 'moc', 'poc', 'source'];
const SOURCE_OPTIONS_ENDPOINT = '/api/enquiries-unified/source/options';
const SOURCE_LEDGER_ENDPOINT = '/api/enquiries-unified/source/ledger';
const SOURCE_REASSIGN_ENDPOINT = '/api/enquiries-unified/source/reassign';
const SOURCE_ROW_UPDATE_ENDPOINT = '/api/enquiries-unified/source/row-update';

type LedgerChannelFilter = 'all' | 'calls' | 'web-forms';

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

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normaliseEvidenceString(value: string): string {
  return String(value || '').trim().toLowerCase();
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
  const compactFontSize = isFullPage ? 8 : 10;
  const compactInputPadding = isFullPage ? '1px 4px' : '5px 7px';
  const compactCellPadding = isFullPage ? '2px 0' : '6px 0';
  const compactShellMinHeight = isFullPage ? 18 : 28;
  const [options, setOptions] = React.useState<SourceOption[]>([]);
  const [fieldOptions, setFieldOptions] = React.useState<FieldOptions>(createEmptyFieldOptions);
  const [rows, setRows] = React.useState<SourceLedgerRow[]>([]);
  const [optionsLoading, setOptionsLoading] = React.useState(true);
  const [rowsLoading, setRowsLoading] = React.useState(true);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [rowsError, setRowsError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<LedgerSortKey>('date');
  const [direction, setDirection] = React.useState<LedgerDirection>('desc');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState<LedgerChannelFilter>('all');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [rowDrafts, setRowDrafts] = React.useState<RowDrafts>({});
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<Record<string, boolean>>({});
  const [bulkTargets, setBulkTargets] = React.useState<Record<string, string>>({});
  const [activeBulkOptionKey, setActiveBulkOptionKey] = React.useState<string | null>(null);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [sourceSelectorsUnlocked, setSourceSelectorsUnlocked] = React.useState(false);
  const [callRailProcessingKey, setCallRailProcessingKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
    loading: false,
    error: null,
    rows: [],
  });
  const processingTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

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

  React.useEffect(() => {
    if (!isFullPage) return;
    setSourceSelectorsUnlocked(false);
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
      const currentValue = normaliseComparableFieldValue(field, getCurrentFieldValue(row, field));
      const draftedValue = normaliseComparableFieldValue(field, getDraftedFieldValue(row, rowKey, field));
      if (currentValue !== draftedValue) {
        acc[field] = normaliseFieldUpdateValue(field, draftedValue);
      }
      return acc;
    }, {} as Partial<Record<EditableLedgerField, string | null>>);
  }, [getCurrentFieldValue, getDraftedFieldValue, normaliseComparableFieldValue, normaliseFieldUpdateValue]);

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
  }, [rows, getRowKey]);

  const sourceChoices = React.useMemo(() => (
    Array.from(new Set(fieldOptions.source.map((option) => option.value).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [fieldOptions]);

  const getSelectChoices = React.useCallback((field: EditableSelectField, row: SourceLedgerRow, rowKey: string): string[] => {
    return Array.from(new Set([
      getCurrentFieldValue(row, field),
      getDraftedFieldValue(row, rowKey, field),
      ...fieldOptions[field].map((option) => option.value),
    ].filter((value) => String(value || '').trim()))).sort((a, b) => a.localeCompare(b));
  }, [fieldOptions, getCurrentFieldValue, getDraftedFieldValue]);

  const filteredRows = React.useMemo(() => {
    const query = (deferredSearchTerm || '').trim().toLowerCase();
    return rows.filter((row) => {
      // Ensure channelFilter is a string
      if (channelFilter === 'calls' && !isCallChannel(row.moc || '')) return false;
      if (channelFilter === 'web-forms' && !isWebFormChannel(row.moc || '')) return false;

      const idText = String(row.id ?? '');
      const acidText = String(row.acid || '');
      if (!query) return true;

      const haystack = [idText, acidText, row.aow, row.moc, row.poc, row.phone, row.source, row.url]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, deferredSearchTerm, channelFilter]);

  const isSearchPending = searchTerm !== deferredSearchTerm;

  React.useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
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
        setOptions(nextFieldOptions.source);
      } catch (fetchError) {
        if (!isMounted || controller.signal.aborted) return;
        setOptionsError('Could not load ledger field options.');
      } finally {
        if (isMounted) setOptionsLoading(false);
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
          limit: '200',
          sort,
          direction,
        });
        const response = await fetch(getApiUrl(`${SOURCE_LEDGER_ENDPOINT}?${params.toString()}`), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`ledger_${response.status}`);
        const payload = await response.json();
        if (!isMounted) return;
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const mappedRows = nextRows.map((entry: any) => ({
          id: entry?.id == null ? null : Number(entry.id),
          acid: String(entry?.acid || ''),
          datetime: entry?.datetime ? String(entry.datetime) : null,
          aow: String(entry?.aow || ''),
          moc: String(entry?.moc || ''),
          poc: String(entry?.poc || ''),
          phone: String(entry?.phone || ''),
          source: String(entry?.source || ''),
          matterDisplayNumber: String(entry?.matterDisplayNumber || ''),
        }));
        setRows(mappedRows);
        if (isFullPage) {
          setProcessingPanel(buildPanelItem(
            'enquiries-page-load',
            'Enquiries data ready',
            `${mappedRows.length.toLocaleString('en-GB')} rows loaded`,
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
  }, [sort, direction, refreshKey, isFullPage, buildPanelItem, clearProcessingTimers]);

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
        border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.18) : withAlpha(colours.highlight, 0.2)}`,
        background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.45) : withAlpha(colours.light.cardHover, 0.62),
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

  const postSourceReassign = React.useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(getApiUrl(SOURCE_REASSIGN_ENDPOINT), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || 'Source reassignment failed'));
    }
    return payload as { rowsAffected?: number };
  }, []);

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
      setRefreshKey((prev) => prev + 1);
    }

    if (failCount > 0) {
      setFeedback({ type: 'error', message: `Saved ${updatedById.size.toLocaleString('en-GB')} row edits, ${failCount.toLocaleString('en-GB')} failed. Please retry.` });
    } else {
      setFeedback({ type: 'success', message: `Saved ${updatedById.size.toLocaleString('en-GB')} row edits (${rowsAffected.toLocaleString('en-GB')} rows affected).` });
    }

    setSavingKey(null);
  }, [selectedChangedRows, changedRows, postRowUpdate]);

  const handleBulkSourceSave = React.useCallback(async (option: SourceOption, optionKey: string) => {
    const chosenTarget = String(bulkTargets[optionKey] || '').trim();
    const nextSource = chosenTarget;
    const currentSource = String(option.value || '').trim();
    if (!nextSource || nextSource.toLowerCase() === currentSource.toLowerCase()) return;
    const currentLabel = currentSource || 'Not set';
    const confirmed = window.confirm(`Move ${option.count.toLocaleString('en-GB')} enquiries from "${currentLabel}" to "${nextSource}"?`);
    if (!confirmed) return;
    setSavingKey(`bulk:${optionKey}`);
    setFeedback(null);
    try {
      const payload = await postSourceReassign({ from: option.value, to: nextSource });
      setBulkTargets((prev) => {
        const next = { ...prev };
        delete next[optionKey];
        return next;
      });
      setActiveBulkOptionKey(null);
      setFeedback({ type: 'success', message: `Reassigned ${Number(payload.rowsAffected || 0).toLocaleString('en-GB')} rows.` });
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Bulk reassignment failed.' });
    } finally {
      setSavingKey(null);
    }
  }, [bulkTargets, postSourceReassign]);

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
          campaign: typeof call?.campaign === 'string' ? call.campaign : '',
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

      if (shouldSuggestChange) {
        setRowDrafts((prev) => ({
          ...prev,
          [rowKey]: {
            ...(prev[rowKey] || {}),
            source: suggestedSource,
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
        rows: sanitizedRows,
      }));
    } catch (error) {
      setCallRailModal((prev) => ({
        ...prev,
        loading: false,
        checkedAt: new Date().toISOString(),
        open: true,
        queuedSource: null,
        error: error instanceof Error ? error.message : 'CallRail lookup failed.',
      }));
    } finally {
      setCallRailProcessingKey(null);
    }
  }, []);

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
    color: isDarkMode ? colours.accent : colours.helixBlue,
  };

  const countPillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.34) : withAlpha(colours.highlight, 0.32)}`,
    background: isDarkMode ? withAlpha(colours.accent, 0.1) : withAlpha(colours.highlight, 0.08),
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
    border: `1px solid ${active
      ? (isDarkMode ? withAlpha(colours.accent, 0.58) : withAlpha(colours.highlight, 0.56))
      : (isDarkMode ? withAlpha(colours.blue, 0.22) : withAlpha(colours.highlight, 0.22))}`,
    background: active
      ? (isDarkMode ? withAlpha(colours.accent, 0.16) : withAlpha(colours.highlight, 0.14))
      : 'transparent',
    color: active
      ? (isDarkMode ? colours.accent : colours.helixBlue)
      : (isDarkMode ? colours.greyText : colours.subtleGrey),
    padding: '5px 8px',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'transform 160ms ease, border-color 160ms ease, background 160ms ease',
    transform: active ? 'translateY(-1px)' : 'translateY(0)',
  });

  const changedCellStyle: React.CSSProperties = {
    boxShadow: isDarkMode
      ? 'inset 0 0 0 1px rgba(122, 203, 255, 0.32), inset 3px 0 0 rgba(122, 203, 255, 0.7)'
      : 'inset 0 0 0 1px rgba(13, 47, 96, 0.18), inset 3px 0 0 rgba(13, 47, 96, 0.6)',
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
          ? (isDarkMode ? withAlpha(colours.accent, 0.42) : withAlpha(colours.highlight, 0.38))
          : (isDarkMode ? withAlpha(colours.blue, 0.14) : withAlpha(colours.highlight, 0.16))}`,
    background: (isFullPage && !forceBoxInFullPage)
      ? 'transparent'
      : (isDarkMode ? withAlpha(colours.dark.cardBackground, 0.54) : withAlpha(colours.light.cardBackground, 0.76)),
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

  const fieldCaptionStyle: React.CSSProperties = {
    fontSize: isFullPage ? 8 : 9,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: isDarkMode ? colours.greyText : colours.subtleGrey,
    display: isFullPage ? 'none' : 'block',
  };

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.24) : withAlpha(colours.highlight, 0.28)}`,
    background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.78) : withAlpha(colours.light.cardBackground, 0.9),
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };

  const primaryCardStyle: React.CSSProperties = {
    ...cardStyle,
    border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.38) : withAlpha(colours.highlight, 0.4)}`,
    boxShadow: isDarkMode ? '0 0 0 1px rgba(122, 203, 255, 0.08) inset' : '0 0 0 1px rgba(13, 47, 96, 0.08) inset',
    order: 1,
  };

  const secondaryCardStyle: React.CSSProperties = {
    ...cardStyle,
    border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.16) : withAlpha(colours.highlight, 0.2)}`,
    background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.68) : withAlpha(colours.light.cardBackground, 0.82),
    order: 2,
  };

  const tableHeaderButtonStyle = (isActive: boolean): React.CSSProperties => ({
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    padding: 0,
    color: isActive
      ? (isDarkMode ? colours.accent : colours.helixBlue)
      : (isDarkMode ? colours.greyText : colours.subtleGrey),
    fontSize: isFullPage ? 8 : 11,
    letterSpacing: isFullPage ? '0.03em' : undefined,
    textTransform: isFullPage ? 'uppercase' : undefined,
    fontWeight: 700,
  });

  const allSelectableRowKeys = React.useMemo(
    () => rows.filter((row) => row.id != null).map((row, index) => getRowKey(row, index)),
    [rows, getRowKey],
  );

  const allRowsSelected = allSelectableRowKeys.length > 0 && allSelectableRowKeys.every((key) => selectedRowKeys[key]);
  const someRowsSelected = allSelectableRowKeys.some((key) => selectedRowKeys[key]);

  return (
    <section
      className={`enquiry-source-ledger${isFullPage ? ' enquiry-source-ledger--fullpage' : ''}${isDarkMode ? ' enquiry-source-ledger--dark' : ' enquiry-source-ledger--light'}`}
      data-helix-region="reports/data-hub/enquiry-source"
      style={{
        marginTop: isFullPage ? 0 : 12,
        border: isFullPage ? 'none' : `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.25) : withAlpha(colours.highlight, 0.25)}`,
        background: isFullPage ? '#ffffff' : (isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.65) : withAlpha(colours.light.sectionBackground, 0.92)),
        padding: isFullPage ? 0 : 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
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
              background: '#ffffff',
              padding: '6px 8px 0',
            }
          : primaryCardStyle}
      >
        {rowsError && renderError(rowsError)}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isFullPage ? 6 : 8,
            marginBottom: isFullPage ? 10 : 12,
            flexWrap: 'wrap',
            border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.36) : withAlpha(colours.helixBlue, 0.36)}`,
            background: isDarkMode ? withAlpha(colours.accent, 0.14) : withAlpha(colours.helixBlue, 0.1),
            padding: isFullPage ? '4px 6px' : '6px 8px',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', flex: '1 1 280px', minWidth: 180 }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search enquiry ID or ACID"
              style={{
                minWidth: 0,
                width: '100%',
                border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.45) : withAlpha(colours.highlight, 0.45)}`,
                background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.86) : '#ffffff',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                padding: isFullPage ? '3px 6px' : '5px 8px',
                fontSize: isFullPage ? 9 : 10,
                fontWeight: 600,
                borderRadius: 0,
                lineHeight: 1.1,
              }}
            />
          </label>

          <div style={{ display: 'inline-flex', border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.34) : withAlpha(colours.highlight, 0.34)}` }}>
            {[
              { key: 'all' as LedgerChannelFilter, label: 'All' },
              { key: 'calls' as LedgerChannelFilter, label: 'Calls' },
              { key: 'web-forms' as LedgerChannelFilter, label: 'Web forms' },
            ].map((option) => {
              const active = channelFilter === option.key;
              return (
                <button
                  key={`ledger-filter-${option.key}`}
                  type="button"
                  onClick={() => setChannelFilter(option.key)}
                  style={{
                    border: 'none',
                    borderRight: option.key === 'web-forms' ? 'none' : `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.2) : withAlpha(colours.highlight, 0.2)}`,
                    background: active
                      ? (isDarkMode ? withAlpha(colours.accent, 0.18) : withAlpha(colours.highlight, 0.16))
                      : 'transparent',
                    color: active
                      ? (isDarkMode ? colours.accent : colours.helixBlue)
                      : (isDarkMode ? colours.greyText : colours.subtleGrey),
                    padding: isFullPage ? '3px 6px' : '5px 8px',
                    fontSize: isFullPage ? 9 : 10,
                    fontWeight: 800,
                    fontFamily: 'Raleway, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {searchTerm.trim() && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.34) : withAlpha(colours.highlight, 0.34)}`,
                background: 'transparent',
                color: isDarkMode ? colours.greyText : colours.subtleGrey,
                padding: isFullPage ? '3px 6px' : '5px 8px',
                fontSize: isFullPage ? 9 : 10,
                fontWeight: 800,
                fontFamily: 'Raleway, sans-serif',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Clear
            </button>
          )}

          {isSearchPending && <span style={compactPillStyle}>Filtering</span>}
          {Object.keys(selectedRowKeys).length > 0 && (
            <span style={compactPillStyle}>
              {Object.keys(selectedRowKeys).length.toLocaleString('en-GB')} selected
            </span>
          )}
          {changedRows.length > 0 && (
            <span style={compactPillStyle}>
              {changedRows.length.toLocaleString('en-GB')} changed
            </span>
          )}
        </div>
        <div className="enquiry-source-ledger-scroll" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isFullPage ? 'calc(100vh - 210px)' : '66vh' }}>
          <table className="enquiry-source-ledger-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, minWidth: isFullPage ? '100%' : 780 }}>
            <colgroup>
              <col style={{ width: isFullPage ? '2.2%' : '3%' }} />
              <col style={{ width: isFullPage ? '8.8%' : '12%' }} />
              <col style={{ width: isFullPage ? '8.8%' : '11%' }} />
              <col style={{ width: isFullPage ? '11.8%' : '13%' }} />
              <col style={{ width: isFullPage ? '10.2%' : '12%' }} />
              <col style={{ width: isFullPage ? '10%' : '11%' }} />
              <col style={{ width: isFullPage ? '14.4%' : '18%' }} />
              <col style={{ width: isFullPage ? '34.4%' : '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  className="enquiry-source-ledger-headcell"
                  style={{
                    borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.25) : withAlpha(colours.highlight, 0.28)}`,
                    padding: '0 0 6px 0',
                    textAlign: 'left',
                    background: '#ffffff',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  {sourceSelectorsUnlocked ? (
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
                          allSelectableRowKeys.forEach((key) => {
                            next[key] = true;
                          });
                          return next;
                        });
                      }}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSourceSelectorsUnlocked(true)}
                      aria-label="Unlock source selectors"
                      title="Unlock source selectors"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        margin: 0,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isDarkMode ? colours.greyText : colours.subtleGrey,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                        <rect x="2" y="5" width="8" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                        <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </th>
                {[
                  { key: 'date' as LedgerSortKey, label: 'Date' },
                  { key: 'id' as LedgerSortKey, label: 'ID / ACID' },
                  { key: 'aow' as LedgerSortKey, label: 'Area of Work' },
                  { key: 'moc' as LedgerSortKey, label: 'MOC' },
                  { key: 'poc' as LedgerSortKey, label: 'POC' },
                ].map((column) => {
                  const isActive = sort === column.key;
                  const marker = isActive ? (direction === 'desc' ? ' desc' : ' asc') : '';
                  return (
                    <th
                      key={`source-ledger-head-${column.key}`}
                      className="enquiry-source-ledger-headcell"
                      style={{
                        borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.25) : withAlpha(colours.highlight, 0.28)}`,
                        padding: '0 0 6px 0',
                        textAlign: 'left',
                        background: '#ffffff',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                      }}
                    >
                      <button
                        type="button"
                        style={tableHeaderButtonStyle(isActive)}
                        onClick={() => handleSort(column.key)}
                        aria-sort={isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {column.label}{marker}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th
                  className="enquiry-source-ledger-headcell"
                  style={{
                    borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.25) : withAlpha(colours.highlight, 0.28)}`,
                    padding: '0 0 6px 0',
                    textAlign: 'left',
                    fontSize: 11,
                    color: isDarkMode ? colours.greyText : colours.subtleGrey,
                    fontWeight: 700,
                    background: '#ffffff',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Phone</span>
                </th>
                {(() => {
                  const isActive = sort === 'source';
                  const marker = isActive ? (direction === 'desc' ? ' desc' : ' asc') : '';
                  return (
                    <th
                      className="enquiry-source-ledger-headcell"
                      style={{
                        borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.25) : withAlpha(colours.highlight, 0.28)}`,
                        padding: '0 0 6px 0',
                        textAlign: 'left',
                        background: '#ffffff',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                      }}
                    >
                      <button
                        type="button"
                        style={tableHeaderButtonStyle(isActive)}
                        onClick={() => handleSort('source')}
                        aria-sort={isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Source{marker}
                        </span>
                      </button>
                    </th>
                  );
                })()}
              </tr>
            </thead>
            <tbody>
              {!isFullPage && rowsLoading && Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                <tr key={`source-ledger-skeleton-${index}`}>
                  {Array.from({ length: 8 }).map((__, innerIndex) => (
                    <td
                      key={`source-ledger-skeleton-cell-${index}-${innerIndex}`}
                      style={{
                        borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.12) : withAlpha(colours.highlight, 0.12)}`,
                        padding: compactCellPadding,
                      }}
                    >
                      <div
                        style={{
                          height: 12,
                          width: '86%',
                          background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.62) : withAlpha(colours.light.cardHover, 0.7),
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}

              {!rowsLoading && filteredRows.map((row, index) => (
                (() => {
                  const rowKey = getRowKey(row, index);
                  const rowFieldDrafts = rowDrafts[rowKey] || {};
                  const isSelected = Boolean(selectedRowKeys[rowKey]);
                  const isChanged = changedRowKeys.has(rowKey);
                  const rowUpdateCount = Object.keys(rowFieldDrafts).length;
                  const isWebFormRow = isWebFormChannel(getDraftedFieldValue(row, rowKey, 'moc'));
                  const rowBackground = isChanged
                    ? (isDarkMode ? withAlpha(colours.accent, 0.16) : withAlpha(colours.highlight, 0.14))
                    : isSelected
                      ? (isDarkMode ? withAlpha(colours.blue, 0.14) : withAlpha(colours.highlight, 0.08))
                      : 'transparent';
                  const rowCellStyle: React.CSSProperties = {
                    borderBottom: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.1) : withAlpha(colours.highlight, 0.1)}`,
                    padding: compactCellPadding,
                    background: rowBackground,
                    transition: 'background 120ms ease',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                    textAlign: 'left',
                  };

                  return (
                <tr className="enquiry-source-ledger-row" key={`source-ledger-row-${row.id ?? row.datetime ?? index}`}>
                  <td style={rowCellStyle}>
                    {sourceSelectorsUnlocked ? (
                      <input
                        className="enquiry-source-ledger-checkbox"
                        type="checkbox"
                        aria-label={`Select row ${row.id ?? index}`}
                        checked={isSelected}
                        disabled={savingKey === 'rows:save-multi' || !row.id}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedRowKeys((prev) => {
                            const next = { ...prev };
                            if (checked) next[rowKey] = true;
                            else delete next[rowKey];
                            return next;
                          });
                        }}
                        style={{ cursor: row.id ? 'pointer' : 'default', margin: 0 }}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isDarkMode ? withAlpha(colours.blue, 0.28) : withAlpha(colours.highlight, 0.24),
                        }}
                      />
                    )}
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {isFullPage ? (
                      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatDate(row.datetime)}>
                        <span style={{ fontSize: 8, fontWeight: 500, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatDateCompact(row.datetime)}
                        </span>
                        <span style={{ fontSize: 8, color: isDarkMode ? colours.greyText : colours.subtleGrey, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatTimeCompact(row.datetime)}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span style={fieldCaptionStyle}>
                          When
                        </span>
                        <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(144, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'datetime'))}>
                          <input
                            type="datetime-local"
                            value={getDraftedFieldValue(row, rowKey, 'datetime')}
                            onChange={(event) => setRowFieldDraft(row, rowKey, 'datetime', event.target.value)}
                            disabled={!row.id || savingKey === 'rows:save-multi'}
                            style={{ ...fieldInputStyle, color: isDarkMode ? colours.dark.text : colours.light.text, fontSize: isFullPage ? 8 : 9, padding: isFullPage ? '0 3px' : '3px 5px' }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: isFullPage ? 0 : 4 }}>
                      {!isFullPage && row.id != null && <span style={{ fontWeight: 700 }}>#{row.id}</span>}
                      <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(108, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'acid'))}>
                        <input
                          type="text"
                          value={getDraftedFieldValue(row, rowKey, 'acid')}
                          onChange={(event) => setRowFieldDraft(row, rowKey, 'acid', event.target.value)}
                          placeholder="ACID"
                          disabled={!row.id || savingKey === 'rows:save-multi'}
                          style={{ ...fieldInputStyle, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        />
                      </div>
                    </div>
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(150, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'aow'))}>
                      <select
                        className="enquiry-source-ledger-select"
                        value={getDraftedFieldValue(row, rowKey, 'aow')}
                        onChange={(event) => setRowFieldDraft(row, rowKey, 'aow', event.target.value)}
                        disabled={!row.id || savingKey === 'rows:save-multi'}
                        style={{ ...fieldSelectStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}
                      >
                        <option value="">Not set</option>
                        {getSelectChoices('aow', row, rowKey).map((choice) => (
                          <option key={`row-aow-choice-${row.id ?? index}-${choice}`} value={choice}>{choice}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(132, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'moc'))}>
                      <select
                        className="enquiry-source-ledger-select"
                        value={getDraftedFieldValue(row, rowKey, 'moc')}
                        onChange={(event) => setRowFieldDraft(row, rowKey, 'moc', event.target.value)}
                        disabled={!row.id || savingKey === 'rows:save-multi'}
                        style={{ ...fieldSelectStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}
                      >
                        <option value="">Not set</option>
                        {getSelectChoices('moc', row, rowKey).map((choice) => (
                          <option key={`row-moc-choice-${row.id ?? index}-${choice}`} value={choice}>{choice}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(122, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'poc'))}>
                      <select
                        className="enquiry-source-ledger-select"
                        value={getDraftedFieldValue(row, rowKey, 'poc')}
                        onChange={(event) => setRowFieldDraft(row, rowKey, 'poc', event.target.value)}
                        disabled={!row.id || savingKey === 'rows:save-multi'}
                        style={{ ...fieldSelectStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}
                      >
                        <option value="">Not set</option>
                        {getSelectChoices('poc', row, rowKey).map((choice) => (
                          <option key={`row-poc-choice-${row.id ?? index}-${choice}`} value={choice}>{formatTeamInitialsLabel(choice)}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td style={{ ...rowCellStyle, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    <div style={{ display: 'grid', gap: isFullPage ? 0 : 4 }}>
                      <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(122, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'phone'))}>
                        <input
                          type="text"
                          value={getDraftedFieldValue(row, rowKey, 'phone')}
                          onChange={(event) => setRowFieldDraft(row, rowKey, 'phone', event.target.value)}
                          placeholder={isWebFormRow ? 'Web form contact' : 'Phone'}
                          disabled={!row.id || savingKey === 'rows:save-multi'}
                          style={{ ...fieldInputStyle, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        />
                      </div>
                      {!isFullPage && isWebFormRow && (
                        <div className="enquiry-source-ledger-field-shell" style={fieldShellStyle(188, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'url'))}>
                          <input
                            type="url"
                            value={getDraftedFieldValue(row, rowKey, 'url')}
                            onChange={(event) => setRowFieldDraft(row, rowKey, 'url', event.target.value)}
                            placeholder="Landing URL"
                            disabled={!row.id || savingKey === 'rows:save-multi'}
                            style={{ ...fieldInputStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={rowCellStyle}>
                    <div style={{ display: 'flex', gap: isFullPage ? 4 : 6, alignItems: 'center', flexWrap: isFullPage ? 'nowrap' : 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'stretch', width: '100%', maxWidth: isFullPage ? 260 : 320, minWidth: 0 }}>
                        <div className="enquiry-source-ledger-field-shell" style={{ ...fieldShellStyle(164, Object.prototype.hasOwnProperty.call(rowFieldDrafts, 'source'), true), flex: 1, minWidth: 0 }}>
                          <select
                            className="enquiry-source-ledger-select"
                            value={getDraftedFieldValue(row, rowKey, 'source')}
                            onChange={(event) => {
                              const nextSource = event.target.value;
                              const draftedPhone = getDraftedFieldValue(row, rowKey, 'phone');
                              setRowFieldDraft(row, rowKey, 'source', nextSource);
                              if (draftedPhone && !callRailProcessingKey && savingKey !== 'rows:save-multi') {
                                void handleCallRailInspect({
                                  ...row,
                                  phone: draftedPhone,
                                  source: nextSource,
                                }, rowKey);
                              }
                            }}
                            disabled={!row.id || savingKey === 'rows:save-multi'}
                            style={{ ...fieldSelectStyle, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                          >
                            <option value="">Not set</option>
                            {getSelectChoices('source', row, rowKey).map((choice) => (
                              <option key={`row-source-choice-${row.id ?? index}-${choice}`} value={choice}>{choice}</option>
                            ))}
                          </select>
                        </div>
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
                            border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.24) : withAlpha(colours.highlight, 0.24)}`,
                            borderLeft: 'none',
                            background: callRailProcessingKey === rowKey
                              ? (isDarkMode ? withAlpha(colours.accent, 0.18) : withAlpha(colours.highlight, 0.16))
                              : (isDarkMode ? withAlpha(colours.dark.cardBackground, 0.5) : withAlpha(colours.light.cardBackground, 0.72)),
                            color: isDarkMode ? colours.accent : colours.helixBlue,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: !getDraftedFieldValue(row, rowKey, 'phone') || Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi' ? 'default' : 'pointer',
                            opacity: !getDraftedFieldValue(row, rowKey, 'phone') || Boolean(callRailProcessingKey) || savingKey === 'rows:save-multi' ? 0.55 : 1,
                            padding: 0,
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
                      {String(row.matterDisplayNumber || '').trim() && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.24) : withAlpha(colours.highlight, 0.24)}`,
                            background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.38) : withAlpha(colours.light.cardBackground, 0.62),
                            color: isDarkMode ? colours.greyText : colours.subtleGrey,
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
                            color: isDarkMode ? colours.greyText : colours.subtleGrey,
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
                </tr>
                  );
                })()
              ))}

              {!rowsLoading && filteredRows.length === 0 && !rowsError && (
                <tr>
                  <td colSpan={8} style={{ padding: compactCellPadding }}>
                    {renderEmpty('No lean ledger rows found in Instructions.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <details
        open={!isFullPage}
        style={isFullPage
          ? {
              border: `1px solid ${withAlpha(colours.highlight, 0.18)}`,
              background: '#ffffff',
              margin: '0 10px 10px',
              padding: '6px 8px 8px',
            }
          : {}}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            marginBottom: 8,
          }}
        >
          Source Palette
        </summary>
        <div style={secondaryCardStyle}>
          <h4 style={{ ...headingStyle, fontSize: 13, opacity: 0.9 }}>Source Palette</h4>
          <p style={{ margin: 0, fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            Secondary summary surface. Use Reassign cohort only when you intentionally want to move a full source group.
          </p>
          {optionsError && renderError(optionsError)}
          {optionsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`palette-skeleton-${index}`}
                  style={{
                    height: 54,
                    background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.64) : withAlpha(colours.light.cardHover, 0.7),
                    border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.18) : withAlpha(colours.highlight, 0.2)}`,
                  }}
                />
              ))}
            </div>
          ) : options.length === 0 && !optionsError ? (
            renderEmpty('No source values found in Instructions.')
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {options.map((option) => {
                const sourceLabel = option.value || 'Not set';
                const bucketLabel = getNormalizedEnquirySourceLabel({ source: option.value });
                const optionKey = option.value || '__not_set__';
                const bulkTarget = bulkTargets[optionKey] || '';
                const isBulkSaving = savingKey === `bulk:${optionKey}`;
                const bulkActionOpen = activeBulkOptionKey === optionKey;
                return (
                  <div
                    key={`source-option-${sourceLabel}`}
                    style={{
                      border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.2) : withAlpha(colours.highlight, 0.2)}`,
                      background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.82) : withAlpha(colours.light.cardBackground, 0.92),
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {sourceLabel}
                    </span>
                    <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                      Bucket: {bucketLabel}
                    </span>
                    <span style={{ fontSize: 11, color: isDarkMode ? colours.accent : colours.helixBlue, fontWeight: 700 }}>
                      {option.count.toLocaleString('en-GB')} rows
                    </span>
                    {!bulkActionOpen ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setActiveBulkOptionKey(optionKey)}
                          style={{
                            border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.38) : withAlpha(colours.highlight, 0.38)}`,
                            background: 'transparent',
                            color: isDarkMode ? colours.greyText : colours.subtleGrey,
                            padding: '4px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'Raleway, sans-serif',
                            cursor: 'pointer',
                          }}
                        >
                          Reassign cohort
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <select
                          className="enquiry-source-ledger-select enquiry-source-ledger-select--bulk"
                          value={bulkTarget}
                          onChange={(event) => setBulkTargets((prev) => ({ ...prev, [optionKey]: event.target.value }))}
                          style={{
                            minWidth: 0,
                            flex: '1 1 auto',
                            border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.28) : withAlpha(colours.highlight, 0.28)}`,
                            background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            padding: '5px 7px',
                            fontSize: 11,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        >
                          <option value="">Reassign all to...</option>
                          {sourceChoices
                            .filter((choice) => choice.toLowerCase() !== String(option.value || '').trim().toLowerCase())
                            .map((choice) => (
                              <option key={`bulk-source-choice-${optionKey}-${choice}`} value={choice}>{choice}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setActiveBulkOptionKey(null)}
                          style={{
                            border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.32) : withAlpha(colours.highlight, 0.32)}`,
                            background: 'transparent',
                            color: isDarkMode ? colours.greyText : colours.subtleGrey,
                            padding: '5px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'Raleway, sans-serif',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isBulkSaving || !bulkTarget.trim() || bulkTarget.trim().toLowerCase() === String(option.value || '').trim().toLowerCase()}
                          onClick={() => handleBulkSourceSave(option, optionKey)}
                          style={{
                            border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.45) : withAlpha(colours.highlight, 0.45)}`,
                            background: isBulkSaving ? 'transparent' : (isDarkMode ? withAlpha(colours.accent, 0.12) : withAlpha(colours.highlight, 0.12)),
                            color: isDarkMode ? colours.accent : colours.helixBlue,
                            padding: '5px 7px',
                            fontSize: 10,
                            fontWeight: 800,
                            fontFamily: 'Raleway, sans-serif',
                            cursor: isBulkSaving ? 'wait' : 'pointer',
                            opacity: isBulkSaving || !bulkTarget.trim() ? 0.55 : 1,
                          }}
                        >
                          {isBulkSaving ? 'Saving' : 'Apply'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
      {changedRows.length > 0 && (
        <div
          className="enquiry-source-ledger-savebar"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 1100,
            border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.45) : withAlpha(colours.highlight, 0.45)}`,
            background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.95) : '#ffffff',
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
              border: `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.45) : withAlpha(colours.highlight, 0.45)}`,
              background: savingKey === 'rows:save-multi' ? 'transparent' : (isDarkMode ? withAlpha(colours.accent, 0.14) : withAlpha(colours.highlight, 0.12)),
              color: isDarkMode ? colours.accent : colours.helixBlue,
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
            border: `1px solid ${callRailModal.error ? withAlpha(colours.cta, 0.5) : callRailModal.queuedSource ? withAlpha(colours.green, 0.52) : (isDarkMode ? withAlpha(colours.blue, 0.32) : withAlpha(colours.highlight, 0.34))}`,
            background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.98) : '#ffffff',
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
                    : callRailModal.queuedSource
                      ? `Source staged: ${callRailModal.queuedSource}`
                      : 'No source change suggested'}
              </span>
              <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                {callRailModal.error
                  ? callRailModal.error
                  : callRailModal.rows.length === 0
                    ? `${formatLookupSuffix(callRailModal.phone)}. Nothing changed.`
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
                  border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.2) : withAlpha(colours.highlight, 0.2)}`,
                  background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.32) : withAlpha(colours.light.cardHover, 0.72),
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
                  border: `1px solid ${isDarkMode ? withAlpha(colours.blue, 0.2) : withAlpha(colours.highlight, 0.2)}`,
                  background: isDarkMode ? withAlpha(colours.dark.cardHover, 0.32) : withAlpha(colours.light.cardHover, 0.72),
                  padding: 9,
                  display: 'grid',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>Matched call</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Source {callRailDecision.latestMatchedCall.source || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Medium {callRailDecision.latestMatchedCall.medium || 'Not set'}</span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Campaign {callRailDecision.latestMatchedCall.campaign || 'Not set'}</span>
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
