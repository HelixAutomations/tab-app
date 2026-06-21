import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import { getApiUrl } from '../../../utils/getApiUrl';
import { parseInstructionRef } from '../../matters/utils/formatters';
import { useToast } from '../../../components/feedback/ToastProvider';
import { ReportProcessingRailItemCard } from '../components/ReportProcessingRail';
import { useColumnVisibility, type ColumnDefinition } from '../hooks/useColumnVisibility';
import { ColumnSelector } from './ColumnSelector';
import type { ReportProcessingRailItem, ReportProcessingRailRow, ReportProcessingRailStatus } from '../components/ReportProcessingRail';
import './EnquirySourceLedger.css';

type MattersLedgerRow = {
  rowKey: string;
  uniqueId: string | null;
  clientId: string | null;
  clientName: string | null;
  matterRef: string;
  storedMatterRef: string | null;
  instructionRef: string;
  prospectId: string | null;
  openDate: string | null;
  description: string | null;
  practiceArea: string | null;
  approxValue: string | null;
  responsibleSolicitor: string | null;
  originatingSolicitor: string | null;
  source: string;
  referrer: string | null;
  methodOfContact: string;
  system: 'legacy' | 'new-space';
  linkedEnquiryId: string | null;
  storedEnquiryId: string | null;
  storedEnquirySource: string | null;
  linkedEnquirySource: string | null;
  sourceCheckStatus: 'completed' | 'pending' | 'unlinked';
};

type MattersDuplicateInfo = {
  isDuplicate: boolean;
  hasNewSpaceTwin: boolean;
  duplicateCount: number;
};

type MatterEditableField = 'description' | 'practiceArea' | 'approxValue' | 'responsibleSolicitor' | 'originatingSolicitor' | 'referrer' | 'methodOfContact' | 'source';
type MatterRowDrafts = Record<string, Partial<Record<MatterEditableField, string>>>;

type SearchAttributionSummary = {
  range: { from: string; to: string | null; matterOpenDateFiltered: boolean };
  unresolved: Array<{ sourceLabel: string; matters: number; missingEnquiryId: number }>;
  searchReady: { organicSearch: number; paidSearch: number; genericSearch: number };
};

type SearchAttributionValue = {
  searchEnquiries?: { organicSearch: number; paidSearch: number; totalSearch: number };
  searchMatters: { organicSearch: number; paidSearch: number; total: number };
  spendAssumption?: { ppcSpend: number; seoEstimate: number; totalEstimatedSearchSpend: number; seoBasis: string };
  collected: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { collected: number; payments: number; mattersWithCollected: number }>;
  upfrontPayments: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { amount: number; payments: number; mattersWithPayments: number }>;
  chargeableWip: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { amount: number; rows: number; mattersWithWip: number }>;
  combinedCollectedAndUpfront: Record<'organicSearch' | 'paidSearch' | 'totalSearch', number>;
  providerReadiness: Record<string, string>;
};

type SearchAttributionDryRun = {
  dryRunToken: string;
  planHash: string;
  expiresAt: string;
  summary: {
    scannedMatters: number;
    bridgeMatches: number;
    emailMatches: number;
    proposedMatterUpdates: number;
    sourceToSearchOrganic: number;
    sourceToSearchPpc: number;
    failures: number;
  };
  planPreview: Array<{ matterId: string; targetMatterSource: string; matchMethod: string; updateFields: string[] }>;
  planTruncated: number;
};

type LedgerSortKey = 'date' | 'matterRef';
type LedgerDirection = 'asc' | 'desc';

// Column definitions for the matters table
const MATTERS_TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'date', label: 'Opened', defaultVisible: true },
  { key: 'state', label: 'State', defaultVisible: true },
  { key: 'matterRef', label: 'Matter', defaultVisible: true },
  { key: 'instructionRef', label: 'Instruction', defaultVisible: true },
  { key: 'client', label: 'Client', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'practiceArea', label: 'Practice Area', defaultVisible: true },
  { key: 'approxValue', label: 'Value', defaultVisible: true },
  { key: 'responsibleSolicitor', label: 'Responsible', defaultVisible: true },
  { key: 'originatingSolicitor', label: 'Originating', defaultVisible: true },
  { key: 'referrer', label: 'Referrer', defaultVisible: true },
  { key: 'methodOfContact', label: 'Method', defaultVisible: true },
  { key: 'source', label: 'Source', defaultVisible: true },
  { key: 'enquiryId', label: 'Enquiry ID', defaultVisible: true },
];

const MATTERS_TABLE_COLUMN_WEIGHTS: Record<string, number> = {
  date: 5,
  state: 6,
  matterRef: 9,
  instructionRef: 8,
  client: 8,
  description: 8,
  practiceArea: 11,
  approxValue: 7,
  responsibleSolicitor: 5,
  originatingSolicitor: 8,
  referrer: 8,
  methodOfContact: 7,
  source: 8,
  enquiryId: 8,
};

const MATTER_DRAFT_FIELDS: MatterEditableField[] = ['description', 'practiceArea', 'approxValue', 'responsibleSolicitor', 'originatingSolicitor', 'referrer', 'methodOfContact', 'source'];
const MATTER_DROPDOWN_FIELDS: MatterEditableField[] = ['practiceArea', 'approxValue', 'responsibleSolicitor', 'originatingSolicitor', 'source', 'referrer', 'methodOfContact'];
const MATTER_DRAFT_API_FIELDS: Record<MatterEditableField, string> = {
  description: 'description',
  practiceArea: 'practiceArea',
  approxValue: 'approxValue',
  responsibleSolicitor: 'responsibleSolicitor',
  originatingSolicitor: 'originatingSolicitor',
  referrer: 'referrer',
  methodOfContact: 'method_of_contact',
  source: 'source',
};

type MattersSourceLedgerProps = {
  isDarkMode: boolean;
  presentation?: 'embedded' | 'fullPage';
};

const SKELETON_ROW_COUNT = 6;
const MATTERS_LEDGER_INITIAL_RENDER_LIMIT = 260;
const MATTERS_LEDGER_FULLPAGE_INITIAL_RENDER_LIMIT = 520;
const MATTERS_LEDGER_RENDER_INCREMENT = 160;
const MATTERS_LEDGER_ENDPOINT = '/api/matters-unified';
const MATTERS_ENQUIRY_LINKAGE_WRITE_ENDPOINT = '/api/matters/enquiry-linkage/write';
const MATTERS_CLIENT_NAME_RESOLVE_ENDPOINT = '/api/matters/client-name/resolve';
const MATTERS_ROW_UPDATE_ENDPOINT = '/api/matters/row-update';
const SEARCH_ATTRIBUTION_SUMMARY_ENDPOINT = '/api/search-attribution/summary';
const SEARCH_ATTRIBUTION_VALUE_ENDPOINT = '/api/search-attribution/fy-value';
const SEARCH_ATTRIBUTION_DRY_RUN_ENDPOINT = '/api/search-attribution/dry-run';
const SEARCH_ATTRIBUTION_APPLY_ENDPOINT = '/api/search-attribution/apply';
const SEARCH_ATTRIBUTION_PPC_SPEND_ESTIMATE = 35100;
const SEARCH_ATTRIBUTION_SEO_MONTHLY_COST = 8400;
const SEARCH_ATTRIBUTION_SEO_MONTHS_INCLUDED = 3;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Not set';
  const date = new Date(parsed);
  const currentYear = new Date().getFullYear();
  return date.toLocaleDateString('en-GB', date.getFullYear() === currentYear
    ? {
        day: '2-digit',
        month: 'short',
      }
    : {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Date(parsed).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function toRow(record: Record<string, unknown>, index: number, system: 'legacy' | 'new-space'): MattersLedgerRow {
  const instructionRefRaw = String(record.InstructionRef ?? record.instructionRef ?? '').trim();
  const parsedRef = parseInstructionRef(instructionRefRaw);
  const matterRef = String(
    record.DisplayNumber
      ?? record.displayNumber
      ?? instructionRefRaw
      ?? record.MatterID
      ?? record.matterId
      ?? `Matter ${index + 1}`,
  ).trim();
  const openDate = normalizeDate(record.OpenDate ?? record.openDate ?? record.mod_stamp ?? record.datetime);
  const source = String(record.Source ?? record.source ?? '').trim() || 'Unassigned';
  const methodOfContact = String(record.method_of_contact ?? record.methodOfContact ?? '').trim() || 'Not set';
  const idPart = String(record.MatterID ?? record.matterId ?? record.UniqueID ?? record.uniqueId ?? `${system}-${index}`);
  const uniqueId = String(record.UniqueID ?? record['Unique ID'] ?? record.MatterID ?? record.matterId ?? record.id ?? '').trim() || null;
  const clientId = String(record.ClientID ?? record['Client ID'] ?? record.RelatedClientID ?? record.relatedClientId ?? record.clientId ?? '').trim() || null;
  const clientName = String(
    record.ClientName
      ?? record['Client Name']
      ?? record.clientName
      ?? record.CLIENTNAME
      ?? record['CLIENT NAME']
      ?? record.client_name
      ?? record.Client_Name
      ?? record['Client_Name']
      ?? ''
  ).trim() || null;
  const storedMatterRef = String(record.MatterRef ?? record.matterRef ?? '').trim() || null;
  const storedEnquiryId = String(record.EnquiryID ?? record.enquiryId ?? '').trim() || null;
  const storedEnquirySource = String(
    record.EnquirySource
      ?? record.enquirySource
      ?? record.LinkedEnquirySource
      ?? record.linkedEnquirySource
      ?? '',
  ).trim() || null;
  const description = String(record.Description ?? record.description ?? '').trim() || null;
  const practiceArea = String(record.PracticeArea ?? record['Practice Area'] ?? record.practice_area ?? record.practiceArea ?? '').trim() || null;
  const approxValue = String(record.ApproxValue ?? record['Approx. Value'] ?? record['Approx Value'] ?? record.approxValue ?? '').trim() || null;
  const responsibleSolicitor = String(record.ResponsibleSolicitor ?? record['Responsible Solicitor'] ?? record.responsibleSolicitor ?? '').trim() || null;
  const originatingSolicitor = String(record.OriginatingSolicitor ?? record['Originating Solicitor'] ?? record.originatingSolicitor ?? '').trim() || null;
  const referrer = String(record.Referrer ?? record.referrer ?? '').trim() || null;

  return {
    rowKey: `${system}:${idPart}:${index}`,
    uniqueId,
    clientId,
    clientName,
    matterRef,
    storedMatterRef,
    instructionRef: parsedRef.instructionRef || instructionRefRaw,
    prospectId: parsedRef.prospectId ?? null,
    openDate,
    description,
    practiceArea,
    approxValue,
    responsibleSolicitor,
    originatingSolicitor,
    source,
    referrer,
    methodOfContact,
    system,
    linkedEnquiryId: null,
    storedEnquiryId,
    storedEnquirySource,
    linkedEnquirySource: storedEnquirySource,
    sourceCheckStatus: 'unlinked',
  };
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, 'en-GB', { sensitivity: 'base', numeric: true });
}

function normalizeLedgerKey(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function getDuplicateKeys(row: MattersLedgerRow): string[] {
  return [row.uniqueId, row.matterRef, row.storedMatterRef]
    .map(normalizeLedgerKey)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function isBlankMatterValue(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return !normalized || normalized === 'not set' || normalized === 'unassigned' || normalized === '--' || normalized === '-';
}

function isMaskedMatterValue(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  return raw.length > 0 && /^[*\s]+$/.test(raw);
}

function getMatterAttentionReasons(row: MattersLedgerRow): string[] {
  const reasons: string[] = [];
  if (String(row.methodOfContact || '').toLowerCase().includes('clio-reconciliation')) reasons.push('Clio reconciliation row');
  if (isMaskedMatterValue(row.clientName)) reasons.push('Client name is masked');
  if (isBlankMatterValue(row.clientName)) reasons.push('Client name missing');
  if (isBlankMatterValue(row.approxValue)) reasons.push('Value missing');
  if (isBlankMatterValue(row.source)) reasons.push('Source missing');
  if (isBlankMatterValue(row.methodOfContact)) reasons.push('Method missing');
  if (!row.storedEnquiryId && row.system === 'new-space') reasons.push('No linked enquiry');
  return reasons;
}

const MattersSourceLedger: React.FC<MattersSourceLedgerProps> = ({ isDarkMode, presentation = 'embedded' }) => {
  const { showToast } = useToast();
  void showToast; // kept for compatibility — processing now uses the floating panel
  const isFullPage = presentation === 'fullPage';
  const fullPageSurface = isDarkMode ? colours.dark.background : colours.light.background;
  const fullPageText = isDarkMode ? colours.dark.text : colours.light.text;
  const fullPageMuted = isDarkMode ? colours.greyText : colours.subtleGrey;
  const tableHeaderSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const tableCellFontSize = isFullPage ? 10 : 9;
  const tableCellPadding = isFullPage ? '6px 8px' : '4px 6px';
  const tableHeaderPadding = isFullPage ? '9px 8px' : '8px 6px';
  const ledgerToolbarBorder = isDarkMode ? withAlpha(colours.accent, 0.28) : withAlpha(colours.highlight, 0.3);
  const ledgerToolbarSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const ledgerToolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: isFullPage ? '8px 10px' : '10px 12px',
    border: `1px solid ${ledgerToolbarBorder}`,
    backgroundColor: ledgerToolbarSurface,
    flexWrap: 'wrap',
    flex: '0 0 auto',
  };
  const ledgerToolbarButtonStyle = (active: boolean, tone: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    padding: '0 10px',
    border: `1px solid ${withAlpha(tone, active ? 0.42 : 0.3)}`,
    backgroundColor: withAlpha(tone, active ? (isDarkMode ? 0.14 : 0.1) : (isDarkMode ? 0.08 : 0.05)),
    color: tone,
    fontSize: 10,
    fontWeight: 800,
    cursor: 'pointer',
    textTransform: 'uppercase',
    fontFamily: 'Raleway, sans-serif',
  });
  const [rows, setRows] = React.useState<MattersLedgerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<LedgerSortKey>('date');
  const [direction, setDirection] = React.useState<LedgerDirection>('desc');
  const [processingRowKey, setProcessingRowKey] = React.useState<string | null>(null);
  const [processingClientRowKey, setProcessingClientRowKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hideLegacyDuplicates, setHideLegacyDuplicates] = React.useState(true);
  const [visibleRowLimit, setVisibleRowLimit] = React.useState(isFullPage ? MATTERS_LEDGER_FULLPAGE_INITIAL_RENDER_LIMIT : MATTERS_LEDGER_INITIAL_RENDER_LIMIT);
  const [activeEditCell, setActiveEditCell] = React.useState<{ rowKey: string; field: MatterEditableField } | null>(null);
  const [processingPanel, setProcessingPanel] = React.useState<ReportProcessingRailItem | null>(null);
  const [rowDrafts, setRowDrafts] = React.useState<MatterRowDrafts>({});
  const [savingDrafts, setSavingDrafts] = React.useState(false);
  const [searchAttributionSummary, setSearchAttributionSummary] = React.useState<SearchAttributionSummary | null>(null);
  const [searchAttributionValue, setSearchAttributionValue] = React.useState<SearchAttributionValue | null>(null);
  const [searchAttributionDryRun, setSearchAttributionDryRun] = React.useState<SearchAttributionDryRun | null>(null);
  const [searchAttributionBusy, setSearchAttributionBusy] = React.useState<'loading' | 'dry-run' | 'apply' | null>(null);
  const [searchAttributionError, setSearchAttributionError] = React.useState<string | null>(null);
  const [searchAttributionApplied, setSearchAttributionApplied] = React.useState<number | null>(null);
  const processingTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  // Column visibility state
  const {
    visibleColumns,
    handleToggleColumn,
    handleShowAll,
    handleHideAll,
    handleReset,
  } = useColumnVisibility('matters-ledger-v3', MATTERS_TABLE_COLUMNS);
  const visibleLedgerColumns = React.useMemo(
    () => MATTERS_TABLE_COLUMNS.filter((column) => visibleColumns.has(column.key)),
    [visibleColumns],
  );
  const visibleLedgerColumnWeight = React.useMemo(
    () => visibleLedgerColumns.reduce((total, column) => total + (MATTERS_TABLE_COLUMN_WEIGHTS[column.key] ?? 8), 0) || 1,
    [visibleLedgerColumns],
  );
  const visibleLedgerColumnCount = Math.max(visibleLedgerColumns.length, 1);

  const searchAttributionRequestBody = React.useMemo(() => ({
    from: '2026-04-01',
    currentSource: 'search',
    includePreRangeMatters: true,
    limit: 500,
  }), []);

  const clearProcessingTimers = React.useCallback(() => {
    processingTimersRef.current.forEach(clearTimeout);
    processingTimersRef.current = [];
  }, []);

  const loadSearchAttributionStatus = React.useCallback(async () => {
    setSearchAttributionBusy('loading');
    setSearchAttributionError(null);
    const params = new URLSearchParams({ from: searchAttributionRequestBody.from, includePreRangeMatters: String(searchAttributionRequestBody.includePreRangeMatters) });
    try {
      const [summaryResponse, valueResponse] = await Promise.all([
        fetch(getApiUrl(`${SEARCH_ATTRIBUTION_SUMMARY_ENDPOINT}?${params.toString()}`), { method: 'GET', credentials: 'include' }),
        fetch(getApiUrl(`${SEARCH_ATTRIBUTION_VALUE_ENDPOINT}?${params.toString()}`), { method: 'GET', credentials: 'include' }),
      ]);
      const summaryPayload = await summaryResponse.json().catch(() => ({} as any));
      const valuePayload = await valueResponse.json().catch(() => ({} as any));
      if (!summaryResponse.ok) throw new Error(String(summaryPayload?.message || summaryPayload?.error || 'Search attribution summary failed'));
      if (!valueResponse.ok) throw new Error(String(valuePayload?.message || valuePayload?.error || 'Search attribution value failed'));
      setSearchAttributionSummary(summaryPayload?.summary || null);
      setSearchAttributionValue(valuePayload?.value || null);
    } catch (statusError) {
      setSearchAttributionError(statusError instanceof Error ? statusError.message : 'Search attribution status failed');
    } finally {
      setSearchAttributionBusy(null);
    }
  }, [searchAttributionRequestBody]);

  React.useEffect(() => {
    void loadSearchAttributionStatus();
  }, [loadSearchAttributionStatus]);

  const runSearchAttributionDryRun = React.useCallback(async () => {
    setSearchAttributionBusy('dry-run');
    setSearchAttributionError(null);
    setSearchAttributionApplied(null);
    try {
      const response = await fetch(getApiUrl(SEARCH_ATTRIBUTION_DRY_RUN_ENDPOINT), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(searchAttributionRequestBody),
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(String(payload?.message || payload?.error || 'Search attribution dry-run failed'));
      setSearchAttributionDryRun(payload as SearchAttributionDryRun);
    } catch (dryRunError) {
      setSearchAttributionError(dryRunError instanceof Error ? dryRunError.message : 'Search attribution dry-run failed');
    } finally {
      setSearchAttributionBusy(null);
    }
  }, [searchAttributionRequestBody]);

  const applySearchAttributionDryRun = React.useCallback(async () => {
    if (!searchAttributionDryRun) return;
    setSearchAttributionBusy('apply');
    setSearchAttributionError(null);
    try {
      const response = await fetch(getApiUrl(SEARCH_ATTRIBUTION_APPLY_ENDPOINT), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRunToken: searchAttributionDryRun.dryRunToken, planHash: searchAttributionDryRun.planHash }),
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(String(payload?.message || payload?.error || 'Search attribution apply failed'));
      setSearchAttributionApplied(Number(payload?.updatedMatters || 0));
      setSearchAttributionDryRun(null);
      await loadSearchAttributionStatus();
    } catch (applyError) {
      setSearchAttributionError(applyError instanceof Error ? applyError.message : 'Search attribution apply failed');
    } finally {
      setSearchAttributionBusy(null);
    }
  }, [loadSearchAttributionStatus, searchAttributionDryRun]);

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
    ctaLabel: status === 'loading' ? 'Running…' : 'Dismiss',
    ctaDisabled: status === 'loading',
    onCta: () => setProcessingPanel(null),
  }), []);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      clearProcessingTimers();
      if (isFullPage) {
        const loadSteps = [
          { key: 'fetch', label: 'Fetch latest matters snapshot', status: 'loading' as const, detail: MATTERS_LEDGER_ENDPOINT },
          { key: 'hydrate', label: 'Hydrate and merge ledger rows', status: 'idle' as const },
          { key: 'render', label: 'Render full-page table', status: 'idle' as const },
        ];
        setProcessingPanel(buildPanelItem(
          'matters-page-load',
          'Refreshing matters data',
          'Preparing the full matters ledger view',
          'loading',
          loadSteps,
          'Refresh',
        ));
        const hydrateTimer = setTimeout(() => {
          setProcessingPanel((prev) => {
            if (!prev || prev.key !== 'matters-page-load') return prev;
            return {
              ...prev,
              rows: [
                { key: 'fetch', label: 'Fetch latest matters snapshot', status: 'ready', detail: MATTERS_LEDGER_ENDPOINT },
                { key: 'hydrate', label: 'Hydrate and merge ledger rows', status: 'loading', detail: 'Normalising matter records' },
                { key: 'render', label: 'Render full-page table', status: 'idle' },
              ],
            };
          });
        }, 650);
        processingTimersRef.current = [hydrateTimer];
      }
      try {
        const response = await fetch(getApiUrl(MATTERS_LEDGER_ENDPOINT), {
          method: 'GET',
          credentials: 'include',
        });
        const payload = await response.json() as {
          legacyAll?: unknown[];
          vnetAll?: unknown[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload?.error || `Matters ledger request failed (${response.status})`);
        }

        const legacyRows = Array.isArray(payload?.legacyAll)
          ? payload.legacyAll
              .map((entry, index) => {
                const record = asRecord(entry);
                return record ? toRow(record, index, 'legacy') : null;
              })
              .filter((entry): entry is MattersLedgerRow => Boolean(entry))
          : [];

        const newSpaceRows = Array.isArray(payload?.vnetAll)
          ? payload.vnetAll
              .map((entry, index) => {
                const record = asRecord(entry);
                return record ? toRow(record, index, 'new-space') : null;
              })
              .filter((entry): entry is MattersLedgerRow => Boolean(entry))
          : [];

        const merged = [...newSpaceRows, ...legacyRows]
          .sort((left, right) => {
            const leftTs = left.openDate ? Date.parse(left.openDate) : 0;
            const rightTs = right.openDate ? Date.parse(right.openDate) : 0;
            return rightTs - leftTs;
          });

        const hydrated: MattersLedgerRow[] = merged.map((row) => {
          const hasStoredId = Boolean(String(row.storedEnquiryId || '').trim());
          return {
            ...row,
            linkedEnquiryId: hasStoredId ? row.storedEnquiryId : null,
            linkedEnquirySource: hasStoredId ? row.storedEnquirySource : null,
            sourceCheckStatus: hasStoredId ? 'completed' : 'unlinked',
          };
        });

        if (!cancelled) {
          setRows(hydrated);
          if (isFullPage) {
            setProcessingPanel(buildPanelItem(
              'matters-page-load',
              'Matters data ready',
              `${hydrated.length.toLocaleString('en-GB')} rows loaded`,
              'ready',
              [
                { key: 'fetch', label: 'Fetch latest matters snapshot', status: 'ready', detail: MATTERS_LEDGER_ENDPOINT },
                { key: 'hydrate', label: 'Hydrate and merge ledger rows', status: 'ready', detail: 'Rows normalised' },
                { key: 'render', label: 'Render full-page table', status: 'ready', detail: 'Table updated' },
              ],
              'Refresh',
            ));
            const dismissTimer = setTimeout(() => {
              setProcessingPanel((prev) => (prev?.key === 'matters-page-load' ? null : prev));
            }, 3200);
            processingTimersRef.current = [dismissTimer];
          }
        }
      } catch (fetchError) {
        if (!cancelled) {
          setRows([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Could not load matters ledger');
          if (isFullPage) {
            const message = fetchError instanceof Error ? fetchError.message : 'Could not load matters ledger';
            setProcessingPanel(buildPanelItem(
              'matters-page-load',
              'Matters refresh failed',
              message,
              'error',
              [
                { key: 'fetch', label: 'Fetch latest matters snapshot', status: 'error', detail: message },
                { key: 'hydrate', label: 'Hydrate and merge ledger rows', status: 'idle' },
                { key: 'render', label: 'Render full-page table', status: 'idle' },
              ],
              'Refresh',
            ));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      clearProcessingTimers();
    };
  }, [buildPanelItem, clearProcessingTimers, isFullPage]);

  const duplicateInfoByRowKey = React.useMemo(() => {
    const groups = new Map<string, MattersLedgerRow[]>();
    for (const row of rows) {
      for (const key of getDuplicateKeys(row)) {
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
      }
    }
    const info = new Map<string, MattersDuplicateInfo>();
    for (const row of rows) {
      const related = new Map<string, MattersLedgerRow>();
      for (const key of getDuplicateKeys(row)) {
        for (const match of groups.get(key) ?? []) {
          related.set(match.rowKey, match);
        }
      }
      const relatedRows = Array.from(related.values());
      info.set(row.rowKey, {
        isDuplicate: relatedRows.length > 1,
        hasNewSpaceTwin: relatedRows.some((match) => match.system === 'new-space'),
        duplicateCount: relatedRows.length,
      });
    }
    return info;
  }, [rows]);

  const duplicateSummary = React.useMemo(() => {
    let duplicateRows = 0;
    let legacyDuplicates = 0;
    for (const row of rows) {
      const info = duplicateInfoByRowKey.get(row.rowKey);
      if (info?.isDuplicate) duplicateRows += 1;
      if (row.system === 'legacy' && info?.hasNewSpaceTwin) legacyDuplicates += 1;
    }
    return { duplicateRows, legacyDuplicates };
  }, [duplicateInfoByRowKey, rows]);

  const sortedRows = React.useMemo(() => {
    const visibleRows = hideLegacyDuplicates
      ? rows.filter((row) => !(row.system === 'legacy' && duplicateInfoByRowKey.get(row.rowKey)?.hasNewSpaceTwin))
      : rows;
    const next = [...visibleRows];
    const factor = direction === 'asc' ? 1 : -1;
    next.sort((left, right) => {
      if (sort === 'date') {
        const leftTs = left.openDate ? Date.parse(left.openDate) : 0;
        const rightTs = right.openDate ? Date.parse(right.openDate) : 0;
        return (leftTs - rightTs) * factor;
      }
      if (sort === 'matterRef') return compareStrings(left.matterRef, right.matterRef) * factor;
      return 0;
    });
    return next;
  }, [direction, duplicateInfoByRowKey, hideLegacyDuplicates, rows, sort]);
  const renderedRows = React.useMemo(() => sortedRows.slice(0, visibleRowLimit), [sortedRows, visibleRowLimit]);

  React.useEffect(() => {
    setVisibleRowLimit(isFullPage ? MATTERS_LEDGER_FULLPAGE_INITIAL_RENDER_LIMIT : MATTERS_LEDGER_INITIAL_RENDER_LIMIT);
  }, [direction, hideLegacyDuplicates, isFullPage, sort, visibleColumns]);

  const toggleSort = React.useCallback((nextSort: LedgerSortKey) => {
    setSort((current) => {
      if (current === nextSort) {
        setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return current;
      }
      setDirection('asc');
      return nextSort;
    });
  }, []);

  const summaryLabel = loading
    ? 'Loading matters ledger'
    : `${renderedRows.length.toLocaleString('en-GB')} rendered of ${sortedRows.length.toLocaleString('en-GB')} visible rows · ${rows.length.toLocaleString('en-GB')} loaded · ${duplicateSummary.legacyDuplicates.toLocaleString('en-GB')} legacy duplicate${duplicateSummary.legacyDuplicates === 1 ? '' : 's'}`;

  const handleResolveAndWrite = React.useCallback(async (row: MattersLedgerRow) => {
    if (row.system !== 'new-space') {
      setFeedback({ type: 'error', message: 'Only new-space matters can be updated from this ledger.' });
      return;
    }
    if (!row.uniqueId || !row.clientId) {
      setFeedback({ type: 'error', message: 'This row is missing Unique ID or Client ID.' });
      return;
    }

    setProcessingRowKey(row.rowKey);
    setFeedback(null);
    clearProcessingTimers();

    const step = (overrides: Partial<ReportProcessingRailRow>[]): ReportProcessingRailRow[] => [
      { key: 'clio', label: 'Fetch Clio email for client', status: 'idle', ...overrides[0] },
      { key: 'match', label: 'Match enquiry by email', status: 'idle', ...overrides[1] },
      { key: 'write', label: 'Write linkage to Matters', status: 'idle', ...overrides[2] },
    ];

    setProcessingPanel(buildPanelItem('enq-linkage', 'Checking matter linkage', `Resolving Enquiry ID for ${row.matterRef}`, 'loading',
      step([{ status: 'loading', detail: `ClientID ${row.clientId}` }, {}, {}]), 'Link'));

    const t1 = setTimeout(() => setProcessingPanel((prev) => prev ? { ...prev, rows: step([{ status: 'loading' }, { status: 'loading', detail: 'Searching enquiries by email' }, {}]) } : null), 900);
    const t2 = setTimeout(() => setProcessingPanel((prev) => prev ? { ...prev, rows: step([{ status: 'loading' }, { status: 'loading' }, { status: 'loading', detail: `Updating dbo.Matters` }]) } : null), 1800);
    processingTimersRef.current = [t1, t2];

    try {
      const response = await fetch(getApiUrl(MATTERS_ENQUIRY_LINKAGE_WRITE_ENDPOINT), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId: row.uniqueId, clientId: row.clientId, matterRef: row.matterRef, system: row.system }),
      });
      clearProcessingTimers();
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(String(payload?.error || 'Matter linkage write failed'));

      setRows((prev) => prev.map((entry) => {
        if (entry.rowKey !== row.rowKey) return entry;
        return {
          ...entry,
          storedEnquiryId: payload?.enquiryId ? String(payload.enquiryId) : null,
          storedEnquirySource: payload?.enquirySource ? String(payload.enquirySource) : entry.storedEnquirySource,
          linkedEnquiryId: payload?.enquiryId ? String(payload.enquiryId) : entry.linkedEnquiryId,
          linkedEnquirySource: payload?.enquirySource ? String(payload.enquirySource) : entry.linkedEnquirySource,
        };
      }));

      const matched = Boolean(payload?.enquiryId);
      setProcessingPanel(buildPanelItem('enq-linkage',
        matched ? 'Matter linkage written' : 'No enquiry match found',
        matched ? `Enquiry ID persisted for ${row.matterRef}` : `No enquiry was found for ${row.matterRef}`,
        matched ? 'ready' : 'warn',
        step([
          { status: 'ready', detail: 'Email resolved from Clio' },
          { status: matched ? 'ready' : 'warn', detail: matched ? `Enquiry ID ${payload.enquiryId}` : 'No matching enquiry' },
          { status: matched ? 'ready' : 'warn', detail: matched ? '1 row updated' : 'MatterRef stored, EnquiryID null' },
        ]), 'Link'));
      setTimeout(() => setProcessingPanel(null), 6000);
    } catch (resolveError) {
      clearProcessingTimers();
      const msg = resolveError instanceof Error ? resolveError.message : 'Matter linkage write failed.';
      setProcessingPanel(buildPanelItem('enq-linkage', 'Matter linkage failed', msg, 'error',
        step([{ status: 'error', detail: msg }, {}, {}]), 'Link'));
    } finally {
      setProcessingRowKey(null);
    }
  }, [buildPanelItem, clearProcessingTimers]);

  const handleResolveClientName = React.useCallback(async (row: MattersLedgerRow) => {
    if (!row.uniqueId) {
      setFeedback({ type: 'error', message: 'This row is missing a Unique ID.' });
      return;
    }
    setProcessingClientRowKey(row.rowKey);
    setFeedback(null);
    clearProcessingTimers();

    const step = (overrides: Partial<ReportProcessingRailRow>[]): ReportProcessingRailRow[] => [
      { key: 'lookup', label: 'Query instruction record', status: 'idle', ...overrides[0] },
      { key: 'resolve', label: 'Resolve name from fields', status: 'idle', ...overrides[1] },
      { key: 'write', label: 'Write ClientName to Matters', status: 'idle', ...overrides[2] },
    ];

    setProcessingPanel(buildPanelItem('client-name', 'Resolving client name', `Looking up instruction for ${row.matterRef}`, 'loading',
      step([{ status: 'loading', detail: `MatterID ${row.uniqueId}` }, {}, {}]), 'Contact'));

    const t1 = setTimeout(() => setProcessingPanel((prev) => prev ? { ...prev, rows: step([{ status: 'loading' }, { status: 'loading', detail: 'CompanyName / FirstName / LastName' }, {}]) } : null), 800);
    const t2 = setTimeout(() => setProcessingPanel((prev) => prev ? { ...prev, rows: step([{ status: 'loading' }, { status: 'loading' }, { status: 'loading', detail: 'Updating dbo.Matters' }]) } : null), 1600);
    processingTimersRef.current = [t1, t2];

    try {
      const response = await fetch(getApiUrl(MATTERS_CLIENT_NAME_RESOLVE_ENDPOINT), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId: row.uniqueId, matterRef: row.matterRef, system: row.system }),
      });
      clearProcessingTimers();
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(String(payload?.error || 'Client name resolve failed'));

      setRows((prev) => prev.map((entry) => {
        if (entry.rowKey !== row.rowKey) return entry;
        return { ...entry, clientName: payload?.clientName ? String(payload.clientName) : entry.clientName };
      }));

      setProcessingPanel(buildPanelItem('client-name', 'Client name resolved', `Name written for ${row.matterRef}`, 'ready',
        step([
          { status: 'ready', detail: 'Instruction record found' },
          { status: 'ready', detail: 'Name resolved from record' },
          { status: 'ready', detail: '1 row updated' },
        ]), 'Contact'));
      setTimeout(() => setProcessingPanel(null), 5000);
    } catch (resolveError) {
      clearProcessingTimers();
      const msg = resolveError instanceof Error ? resolveError.message : 'Client name resolve failed.';
      setProcessingPanel(buildPanelItem('client-name', 'Client name resolve failed', msg, 'error',
        step([{ status: 'error', detail: msg }, {}, {}]), 'Contact'));
      setFeedback({ type: 'error', message: msg });
    } finally {
      setProcessingClientRowKey(null);
    }
  }, [buildPanelItem, clearProcessingTimers]);

  const dropdownFields = React.useMemo(() => new Set<MatterEditableField>(MATTER_DROPDOWN_FIELDS), []);

  const uniqueFieldValues = React.useMemo(() => {
    const map = new Map<MatterEditableField, string[]>();
    for (const field of dropdownFields) {
      const seen = new Set<string>();
      for (const r of rows) {
        const v = String((r as unknown as Record<string, unknown>)[field] ?? '').trim();
        if (!isBlankMatterValue(v)) seen.add(v);
      }
      map.set(field, Array.from(seen).sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' })));
    }
    return map;
  }, [rows, dropdownFields]);

  const changedRows = React.useMemo(() => {
    return rows.filter((row) => {
      const draft = rowDrafts[row.rowKey];
      if (!draft) return false;
      return MATTER_DRAFT_FIELDS.some((field) => {
        const value = draft[field];
        return value != null && value.trim() !== String((row as Record<string, unknown>)[field] || '').trim();
      });
    });
  }, [rowDrafts, rows]);

  const setRowDraft = React.useCallback((row: MattersLedgerRow, field: MatterEditableField, value: string) => {
    setRowDrafts((prev) => {
      const next = { ...prev };
      const current = String((row as Record<string, unknown>)[field] ?? '').trim();
      const nextValue = value.trim();
      const existing = { ...(next[row.rowKey] || {}) };
      if (nextValue === current || (!nextValue && !current)) {
        delete existing[field];
      } else {
        existing[field] = nextValue;
      }
      if (Object.keys(existing).length > 0) next[row.rowKey] = existing;
      else delete next[row.rowKey];
      return next;
    });
  }, []);

  const getDraftedValue = React.useCallback((row: MattersLedgerRow, field: MatterEditableField) => {
    const draft = rowDrafts[row.rowKey]?.[field];
    return draft == null ? String((row as Record<string, unknown>)[field] ?? '').trim() : draft;
  }, [rowDrafts]);

  const handleSaveDraftedChanges = React.useCallback(async () => {
    if (!changedRows.length) return;
    setSavingDrafts(true);
    setFeedback(null);

    let successCount = 0;
    let failCount = 0;

    for (const row of changedRows) {
      const draft = rowDrafts[row.rowKey] || {};
      const updates: Record<string, string> = {};
      MATTER_DRAFT_FIELDS.forEach((field) => {
        const nextValue = draft[field];
        if (nextValue != null && nextValue.trim() !== String((row as Record<string, unknown>)[field] || '').trim()) {
          updates[MATTER_DRAFT_API_FIELDS[field]] = nextValue.trim();
        }
      });
      if (!Object.keys(updates).length) continue;

      try {
        const response = await fetch(getApiUrl(MATTERS_ROW_UPDATE_ENDPOINT), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ uniqueId: row.uniqueId, updates }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to update matter row'));
        successCount += 1;
      } catch (error) {
        failCount += 1;
      }
    }

    if (successCount > 0) {
      setRows((prev) => prev.map((row) => {
        const draft = rowDrafts[row.rowKey];
        if (!draft) return row;
        const updatedRow = { ...row } as MattersLedgerRow;
        MATTER_DRAFT_FIELDS.forEach((field) => {
          if (draft[field] == null) return;
          const nextValue = draft[field]?.trim() || null;
          if (field === 'source') updatedRow.source = nextValue || 'Unassigned';
          else if (field === 'methodOfContact') updatedRow.methodOfContact = nextValue || 'Not set';
          else updatedRow[field] = nextValue;
        });
        return updatedRow;
      }));
      setRowDrafts({});
      setActiveEditCell(null);
    }

    setFeedback({
      type: failCount > 0 ? 'error' : 'success',
      message: failCount > 0
        ? `Saved ${successCount.toLocaleString('en-GB')} change${successCount === 1 ? '' : 's'}; ${failCount.toLocaleString('en-GB')} failed.`
        : `Saved ${successCount.toLocaleString('en-GB')} change${successCount === 1 ? '' : 's'} across the matters ledger.`,
    });
    setSavingDrafts(false);
  }, [changedRows, rowDrafts]);

  const searchAttributionSpendAssumption = searchAttributionValue?.spendAssumption ?? {
    ppcSpend: SEARCH_ATTRIBUTION_PPC_SPEND_ESTIMATE,
    seoEstimate: SEARCH_ATTRIBUTION_SEO_MONTHLY_COST * SEARCH_ATTRIBUTION_SEO_MONTHS_INCLUDED,
    totalEstimatedSearchSpend: SEARCH_ATTRIBUTION_PPC_SPEND_ESTIMATE + (SEARCH_ATTRIBUTION_SEO_MONTHLY_COST * SEARCH_ATTRIBUTION_SEO_MONTHS_INCLUDED),
    seoBasis: 'GBP 8,400 per month for April, May, and June',
  };
  const searchAttributionTotalValue = (searchAttributionValue?.combinedCollectedAndUpfront.totalSearch ?? 0)
    + (searchAttributionValue?.chargeableWip.totalSearch.amount ?? 0);
  const searchAttributionEstimatedRoi = searchAttributionSpendAssumption.totalEstimatedSearchSpend > 0
    ? `${(searchAttributionTotalValue / searchAttributionSpendAssumption.totalEstimatedSearchSpend).toFixed(2)}x`
    : '0.00x';

  return (
    <section
      data-helix-region="reports/data-hub/matters-ledger"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isFullPage ? 0 : 8,
        padding: isFullPage ? 0 : '10px 10px',
        border: isFullPage ? 'none' : `1px solid ${isDarkMode ? withAlpha(colours.accent, 0.16) : withAlpha(colours.highlight, 0.18)}`,
        background: isFullPage
          ? fullPageSurface
          : (isDarkMode ? withAlpha(colours.dark.cardBackground, 0.86) : withAlpha(colours.light.cardBackground, 0.95)),
        minHeight: isFullPage ? '100vh' : undefined,
        height: isFullPage ? '100vh' : undefined,
      }}
    >
      {!isFullPage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Matters ledger
            </span>
            <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              {summaryLabel}
            </span>
          </div>
        </div>
      )}

      {error && (
        <span style={{ fontSize: 11, color: colours.cta }}>{error}</span>
      )}

      {feedback && (
        <span style={{ fontSize: 11, color: feedback.type === 'error' ? colours.cta : colours.green }}>
          {feedback.message}
        </span>
      )}

      <section
        data-helix-region="reports/data-hub/matters/search-attribution-control"
        style={{
          display: 'grid',
          gap: isFullPage ? 10 : 8,
          padding: isFullPage ? '10px 12px' : '9px 10px',
          border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.22)}`,
          background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.72) : withAlpha(colours.light.cardBackground, 0.95),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: isFullPage ? 12 : 11, fontWeight: 900, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Search attribution control
            </span>
            <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              Value activity from 1 Apr. SEO uses £8.4k/month for Apr-May-Jun.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={Boolean(searchAttributionBusy)}
              onClick={loadSearchAttributionStatus}
              style={ledgerToolbarButtonStyle(searchAttributionBusy === 'loading', colours.highlight)}
            >
              {searchAttributionBusy === 'loading' ? 'Refreshing...' : 'Refresh checks'}
            </button>
            <button
              type="button"
              disabled={Boolean(searchAttributionBusy)}
              onClick={runSearchAttributionDryRun}
              style={ledgerToolbarButtonStyle(searchAttributionBusy === 'dry-run', colours.orange)}
            >
              {searchAttributionBusy === 'dry-run' ? 'Matching...' : 'Dry-run repair'}
            </button>
            <button
              type="button"
              disabled={!searchAttributionDryRun || Boolean(searchAttributionBusy)}
              onClick={applySearchAttributionDryRun}
              style={{
                ...ledgerToolbarButtonStyle(Boolean(searchAttributionDryRun), colours.green),
                opacity: !searchAttributionDryRun || Boolean(searchAttributionBusy) ? 0.5 : 1,
              }}
            >
              {searchAttributionBusy === 'apply' ? 'Applying...' : 'Apply verified'}
            </button>
          </div>
        </div>

        {searchAttributionError && (
          <span style={{ fontSize: 10, fontWeight: 800, color: colours.cta }}>
            {searchAttributionError}
          </span>
        )}
        {searchAttributionApplied != null && (
          <span style={{ fontSize: 10, fontWeight: 800, color: colours.green }}>
            Applied {searchAttributionApplied.toLocaleString('en-GB')} verified matter update{searchAttributionApplied === 1 ? '' : 's'}.
          </span>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {[
            { label: 'Generic search', value: searchAttributionSummary?.searchReady.genericSearch ?? 0, tone: colours.orange },
            { label: 'Search enquiries', value: searchAttributionValue?.searchEnquiries?.totalSearch ?? 0, tone: colours.accent },
            { label: 'Organic matters', value: searchAttributionSummary?.searchReady.organicSearch ?? searchAttributionValue?.searchMatters.organicSearch ?? 0, tone: colours.green },
            { label: 'PPC matters', value: searchAttributionSummary?.searchReady.paidSearch ?? searchAttributionValue?.searchMatters.paidSearch ?? 0, tone: colours.highlight },
            { label: 'PPC spend', value: formatCurrency(searchAttributionSpendAssumption.ppcSpend), tone: colours.orange },
            { label: 'SEO estimate', value: formatCurrency(searchAttributionSpendAssumption.seoEstimate), tone: colours.orange },
            { label: 'Est. search spend', value: formatCurrency(searchAttributionSpendAssumption.totalEstimatedSearchSpend), tone: colours.cta },
            { label: 'Received', value: formatCurrency(searchAttributionValue?.combinedCollectedAndUpfront.totalSearch ?? 0), tone: colours.accent },
            { label: 'Chargeable WIP', value: formatCurrency(searchAttributionValue?.chargeableWip.totalSearch.amount ?? 0), tone: colours.green },
            { label: 'Est. ROI', value: searchAttributionEstimatedRoi, tone: colours.green },
          ].map((metric) => (
            <div
              key={metric.label}
              style={{
                display: 'grid',
                gap: 3,
                minHeight: isFullPage ? 58 : 50,
                padding: isFullPage ? '8px 9px' : '7px 8px',
                border: `1px solid ${withAlpha(metric.tone, 0.24)}`,
                background: withAlpha(metric.tone, isDarkMode ? 0.08 : 0.055),
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: metric.tone }}>{metric.label}</span>
              <span style={{ fontSize: isFullPage ? 16 : 14, fontWeight: 900, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {typeof metric.value === 'number' ? metric.value.toLocaleString('en-GB') : metric.value}
              </span>
            </div>
          ))}
        </div>

        {searchAttributionDryRun && (
          <div style={{ display: 'grid', gap: 8, border: `1px solid ${withAlpha(colours.orange, 0.26)}`, background: withAlpha(colours.orange, isDarkMode ? 0.09 : 0.06), padding: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                Dry-run ready: {searchAttributionDryRun.summary.proposedMatterUpdates.toLocaleString('en-GB')} proposed update{searchAttributionDryRun.summary.proposedMatterUpdates === 1 ? '' : 's'}
              </span>
              <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                Expires {new Date(searchAttributionDryRun.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: colours.green }}>{searchAttributionDryRun.summary.sourceToSearchOrganic.toLocaleString('en-GB')} organic</span>
              <span style={{ fontSize: 10, color: colours.highlight }}>{searchAttributionDryRun.summary.sourceToSearchPpc.toLocaleString('en-GB')} PPC</span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>{searchAttributionDryRun.summary.bridgeMatches.toLocaleString('en-GB')} bridge matches</span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>{searchAttributionDryRun.summary.emailMatches.toLocaleString('en-GB')} email matches</span>
            </div>
            {searchAttributionDryRun.planPreview.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                {searchAttributionDryRun.planPreview.slice(0, isFullPage ? 5 : 3).map((entry) => (
                  <div key={`${entry.matterId}:${entry.targetMatterSource}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 7px', border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.12)}`, background: isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.68) : withAlpha(colours.light.sectionBackground, 0.85) }}>
                    <span style={{ fontSize: 10, color: isDarkMode ? colours.dark.text : colours.light.text }}>{entry.matterId}</span>
                    <span style={{ fontSize: 10, color: entry.targetMatterSource.includes('ppc') ? colours.highlight : colours.green }}>{entry.targetMatterSource}</span>
                    <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>{entry.matchMethod} · {entry.updateFields.join(', ')}</span>
                  </div>
                ))}
                {searchAttributionDryRun.planTruncated > 0 && (
                  <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                    {searchAttributionDryRun.planTruncated.toLocaleString('en-GB')} additional structural updates hidden from preview.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <div
        style={ledgerToolbarStyle}
      >
        <ColumnSelector
          columns={MATTERS_TABLE_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={handleToggleColumn}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
          onReset={handleReset}
          menuAlign="left"
        />
        <button
          type="button"
          onClick={() => setHideLegacyDuplicates((current) => !current)}
          style={{
            ...ledgerToolbarButtonStyle(hideLegacyDuplicates, hideLegacyDuplicates ? colours.green : colours.orange),
          }}
          title={`${duplicateSummary.legacyDuplicates.toLocaleString('en-GB')} legacy duplicate rows have a new-space match`}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: hideLegacyDuplicates ? colours.green : colours.orange }} />
          {hideLegacyDuplicates ? 'Legacy duplicates hidden' : 'Legacy duplicates visible'}
        </button>
      </div>

      <div
        className="enquiry-source-ledger-scroll"
        style={{
          maxHeight: isFullPage ? undefined : 'min(78vh, 920px)',
          height: isFullPage ? undefined : 'min(78vh, 920px)',
          flex: isFullPage ? '1 1 auto' : '1 1 auto',
          minHeight: isFullPage ? 0 : 560,
          overflow: 'auto',
          border: isFullPage ? 'none' : `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.18)}`,
          background: isFullPage
            ? fullPageSurface
            : (isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.7) : withAlpha(colours.light.sectionBackground, 0.9)),
          paddingBottom: isFullPage ? 14 : undefined,
        }}
      >
        <table className="enquiry-source-ledger-table" style={{ width: '100%', minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }}>
          <colgroup>
            {visibleLedgerColumns.map((column) => (
              <col
                key={`matters-ledger-col-${column.key}`}
                style={{ width: `${(((MATTERS_TABLE_COLUMN_WEIGHTS[column.key] ?? 8) / visibleLedgerColumnWeight) * 100).toFixed(4)}%` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleLedgerColumns.map((column) => {
                const isActive = sort === column.key;
                const canSort = column.key === 'date' || column.key === 'matterRef';
                return (
                  <th
                    key={column.key}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      textAlign: 'left',
                      padding: tableHeaderPadding,
                      height: isFullPage ? 38 : 36,
                      verticalAlign: 'middle',
                      fontSize: isFullPage ? 10 : 9,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey),
                      backgroundColor: tableHeaderSurface,
                      borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.16)}`,
                      cursor: canSort ? 'pointer' : 'default',
                    }}
                    onClick={canSort ? () => toggleSort(column.key as LedgerSortKey) : undefined}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {column.label}
                      {isActive && canSort && <span>{direction === 'asc' ? '↑' : '↓'}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && !isFullPage && Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
              <tr key={`skeleton:${index}`}>
                {Array.from({ length: visibleLedgerColumns.length }).map((__, cellIndex) => (
                  <td
                    key={`skeleton:${index}:${cellIndex}`}
                    style={{
                      padding: tableCellPadding,
                      borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`,
                    }}
                  >
                    <div
                      style={{
                        height: 10,
                        width: `${58 + ((index + cellIndex) % 4) * 10}%`,
                        background: isDarkMode ? withAlpha(colours.accent, 0.12) : withAlpha(colours.highlight, 0.12),
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}

            {!loading && renderedRows.map((row) => (
              <tr key={row.rowKey}>
                {visibleColumns.has('date') && (
                  <td style={{ padding: tableCellPadding, fontSize: tableCellFontSize, color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text), borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap' }} title={`${formatDate(row.openDate)} ${formatTime(row.openDate)}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.0 }}>
                      <span>{formatDate(row.openDate)}</span>
                      <span style={{ fontSize: tableCellFontSize, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey) }}>{formatTime(row.openDate)}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.has('state') && (() => {
                  const duplicateInfo = duplicateInfoByRowKey.get(row.rowKey);
                  const attentionReasons = getMatterAttentionReasons(row);
                  const isLegacyDuplicate = row.system === 'legacy' && duplicateInfo?.hasNewSpaceTwin;
                  const tone = isLegacyDuplicate ? colours.orange : row.system === 'new-space' ? colours.green : (isFullPage ? fullPageMuted : colours.subtleGrey);
                  const label = isLegacyDuplicate
                    ? 'Legacy duplicate'
                    : duplicateInfo?.isDuplicate && row.system === 'new-space'
                      ? 'Migrated copy'
                      : duplicateInfo?.isDuplicate
                        ? 'Duplicate'
                      : row.system === 'new-space'
                        ? 'New-space'
                        : 'Legacy';
                  return (
                    <td style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${label}${duplicateInfo?.duplicateCount ? ` (${duplicateInfo.duplicateCount} linked rows)` : ''}${attentionReasons.length ? ` | Check: ${attentionReasons.join('; ')}` : ''}`}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '2px 5px', border: `1px solid ${withAlpha(tone, 0.28)}`, background: withAlpha(tone, isDarkMode ? 0.12 : 0.08), color: tone, fontSize: tableCellFontSize, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                      </span>
                      {attentionReasons.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 4, padding: '2px 4px', border: `1px solid ${withAlpha(colours.orange, 0.36)}`, background: withAlpha(colours.orange, isDarkMode ? 0.14 : 0.1), color: colours.orange, fontSize: tableCellFontSize, fontWeight: 900, verticalAlign: 'middle' }}>
                          Check
                        </span>
                      )}
                    </td>
                  );
                })()}
                {visibleColumns.has('matterRef') && (
                  <td style={{ padding: tableCellPadding, fontSize: tableCellFontSize, color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text), borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.matterRef}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <span style={{ lineHeight: 1.0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.matterRef}</span>
                      <span style={{ fontSize: tableCellFontSize, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey), overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.uniqueId || 'Not set'}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.has('instructionRef') && (
                  <td style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.instructionRef || 'Not set'}>
                    <span style={{
                      color: row.instructionRef
                        ? (isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text))
                        : (isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey)),
                      fontSize: tableCellFontSize,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}>
                      {row.instructionRef || 'Not set'}
                    </span>
                  </td>
                )}
                {visibleColumns.has('client') && (
                  <td style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: isMaskedMatterValue(row.clientName) ? withAlpha(colours.orange, isDarkMode ? 0.1 : 0.06) : 'transparent' }} title={row.clientName || 'Client name missing'}>
                    {row.clientName ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <span style={{ color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text), fontSize: tableCellFontSize, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                          {row.clientName}
                        </span>
                        <span style={{ fontSize: tableCellFontSize, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey), overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.clientId || ''}</span>
                        {isMaskedMatterValue(row.clientName) && (
                          <span style={{ alignSelf: 'flex-start', marginTop: 2, padding: '1px 4px', border: `1px solid ${withAlpha(colours.orange, 0.34)}`, background: withAlpha(colours.orange, isDarkMode ? 0.13 : 0.08), color: colours.orange, fontSize: tableCellFontSize, fontWeight: 900 }}>
                            Masked
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={row.system !== 'new-space' || !row.uniqueId || Boolean(processingClientRowKey) || Boolean(processingRowKey)}
                        onClick={() => handleResolveClientName(row)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          minWidth: 58,
                          padding: '2px 6px',
                          border: `1px solid ${withAlpha(colours.highlight, 0.28)}`,
                          background: processingClientRowKey === row.rowKey ? withAlpha(colours.highlight, 0.14) : withAlpha(colours.highlight, 0.06),
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 8,
                          cursor: row.system !== 'new-space' || !row.uniqueId || Boolean(processingClientRowKey) || Boolean(processingRowKey) ? 'default' : 'pointer',
                          opacity: row.system !== 'new-space' || !row.uniqueId || Boolean(processingClientRowKey) || Boolean(processingRowKey) ? 0.55 : 1,
                        }}
                      >
                        {processingClientRowKey === row.rowKey ? 'Checking...' : 'Check'}
                      </button>
                    )}
                  </td>
                )}
                {(['description', 'practiceArea', 'approxValue', 'responsibleSolicitor', 'originatingSolicitor', 'referrer', 'methodOfContact', 'source'] as const).map((field) => {
                  const LABELS: Record<MatterEditableField, string> = { description: 'Description', practiceArea: 'Practice Area', approxValue: 'Value', responsibleSolicitor: 'Responsible', originatingSolicitor: 'Originating', source: 'Source', referrer: 'Referrer', methodOfContact: 'Method' };
                  const currentValue = getDraftedValue(row, field);
                  const isDrafted = rowDrafts[row.rowKey]?.[field] != null;
                  const isActive = activeEditCell?.rowKey === row.rowKey && activeEditCell?.field === field;
                  const isEmpty = isBlankMatterValue(currentValue);
                  const hasUniqueId = Boolean(row.uniqueId);
                  const needsCheck = isEmpty && (field === 'approxValue' || field === 'source' || field === 'methodOfContact');
                  const cellBackground = isDrafted
                    ? withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.12)
                    : needsCheck
                      ? withAlpha(colours.orange, isDarkMode ? 0.1 : 0.06)
                      : (isActive ? withAlpha(colours.highlight, 0.08) : 'transparent');

                  // Skip rendering if column is not visible
                  if (!visibleColumns.has(field)) {
                    return null;
                  }

                  if (dropdownFields.has(field)) {
                    const choices = uniqueFieldValues.get(field) || [];
                    const normalizedCurrent = (currentValue || '').trim();
                    const normalizedCurrentLower = normalizedCurrent.toLowerCase();
                    const isPlaceholderValue = !normalizedCurrent
                      || normalizedCurrentLower === 'not set'
                      || normalizedCurrentLower === 'unassigned'
                      || normalizedCurrentLower === '—';
                    const effectiveValue = isPlaceholderValue ? '' : normalizedCurrent;
                    const hasCurrentInChoices = effectiveValue
                      ? choices.some((choice) => choice.trim().toLowerCase() === effectiveValue.toLowerCase())
                      : false;
                    const hasValue = effectiveValue.length > 0;
                    const newOptionValue = `__new_${field}__`;
                    return (
                      <td
                        key={field}
                        style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: cellBackground }}
                      >
                        <select
                          value={effectiveValue}
                          disabled={!hasUniqueId || savingDrafts}
                          title={hasUniqueId ? `${LABELS[field]}: ${effectiveValue || 'Not set'}` : 'This row is missing a stable matter id'}
                          onFocus={() => setActiveEditCell({ rowKey: row.rowKey, field })}
                          onBlur={() => setActiveEditCell((current) => (current?.rowKey === row.rowKey && current.field === field ? null : current))}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === newOptionValue) {
                              const typed = window.prompt(`Enter new ${LABELS[field].toLowerCase()}`, effectiveValue || '');
                              if (typed !== null) {
                                setRowDraft(row, field, typed);
                              }
                              return;
                            }
                            setRowDraft(row, field, nextValue);
                          }}
                          style={{
                            width: '100%',
                            border: hasValue
                              ? `1px solid ${isDrafted ? withAlpha(colours.highlight, 0.36) : 'transparent'}`
                              : `1px solid ${withAlpha(needsCheck ? colours.orange : (isDarkMode ? colours.accent : colours.highlight), isFullPage ? 0.22 : 0.3)}`,
                            background: hasValue
                              ? 'transparent'
                              : (isFullPage
                                  ? withAlpha('#111827', 0.02)
                                  : (isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.95) : withAlpha(colours.light.sectionBackground, 0.95))),
                            color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text),
                            padding: isFullPage ? '4px 6px' : '2px 4px',
                            fontSize: tableCellFontSize,
                            boxSizing: 'border-box',
                            borderRadius: 2,
                            cursor: hasUniqueId && !savingDrafts ? 'pointer' : 'default',
                            opacity: hasUniqueId ? 1 : 0.58,
                          }}
                        >
                          <option value="">--</option>
                          {effectiveValue && !hasCurrentInChoices && (
                            <option value={effectiveValue}>{effectiveValue}</option>
                          )}
                          {choices.map((choice) => (
                            <option key={`${row.rowKey}-${field}-${choice}`} value={choice}>{choice}</option>
                          ))}
                          <option value={newOptionValue}>+ Add new value...</option>
                        </select>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={field}
                      style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: cellBackground }}
                      title={currentValue || LABELS[field]}
                    >
                      <input
                        type="text"
                        value={currentValue}
                        disabled={!hasUniqueId || savingDrafts}
                        onFocus={() => setActiveEditCell({ rowKey: row.rowKey, field })}
                        onBlur={() => setActiveEditCell((current) => (current?.rowKey === row.rowKey && current.field === field ? null : current))}
                        onChange={(event) => setRowDraft(row, field, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setActiveEditCell(null);
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder="--"
                        style={{
                          width: '100%',
                          border: isDrafted ? `1px solid ${withAlpha(colours.highlight, 0.36)}` : '1px solid transparent',
                          background: isDrafted ? withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.08) : 'transparent',
                          color: isEmpty ? (isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey)) : (isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text)),
                          padding: isFullPage ? '4px 6px' : '2px 4px',
                          fontSize: tableCellFontSize,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          opacity: hasUniqueId ? 1 : 0.58,
                        }}
                      />
                    </td>
                  );
                })}
                {visibleColumns.has('enquiryId') && (
                  <td style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {row.storedEnquiryId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1.0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span
                        title={row.storedEnquiryId}
                        style={{
                          color: colours.green,
                          fontSize: tableCellFontSize,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                        }}
                      >
                        {row.storedEnquiryId}
                      </span>
                      {row.linkedEnquirySource && (
                        <span
                          title={row.linkedEnquirySource}
                          style={{
                            fontSize: tableCellFontSize,
                            color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey),
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                          }}
                        >
                          {`(${row.linkedEnquirySource})`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={row.system !== 'new-space' || !row.uniqueId || !row.clientId || Boolean(processingRowKey)}
                      onClick={() => handleResolveAndWrite(row)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        minWidth: 58,
                        padding: '2px 6px',
                        border: `1px solid ${withAlpha(colours.highlight, 0.28)}`,
                        background: processingRowKey === row.rowKey ? withAlpha(colours.highlight, 0.14) : withAlpha(colours.highlight, 0.06),
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: 8,
                        cursor: row.system !== 'new-space' || !row.uniqueId || !row.clientId || Boolean(processingRowKey) ? 'default' : 'pointer',
                        opacity: row.system !== 'new-space' || !row.uniqueId || !row.clientId || Boolean(processingRowKey) ? 0.55 : 1,
                      }}
                    >
                      {processingRowKey === row.rowKey ? 'Checking...' : 'Unlinked'}
                    </button>
                  )}
                  </td>
                )}
              </tr>
            ))}

            {!loading && !error && sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleLedgerColumnCount}
                  style={{
                    padding: '8px 8px',
                    textAlign: 'center',
                    fontSize: 10,
                    color: isDarkMode ? colours.greyText : colours.subtleGrey,
                  }}
                >
                  No matter rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && renderedRows.length < sortedRows.length && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: isFullPage ? '8px 16px' : '6px 2px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey) }}>
            Showing {renderedRows.length.toLocaleString('en-GB')} of {sortedRows.length.toLocaleString('en-GB')} visible rows.
          </span>
          <button
            type="button"
            onClick={() => setVisibleRowLimit((current) => Math.min(current + MATTERS_LEDGER_RENDER_INCREMENT, sortedRows.length))}
            style={{
              height: 28,
              padding: '0 10px',
              border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.28)}`,
              background: isFullPage ? fullPageSurface : (isDarkMode ? withAlpha(colours.dark.cardBackground, 0.92) : withAlpha(colours.light.cardBackground, 0.95)),
              color: isDarkMode ? colours.accent : colours.highlight,
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Show next {Math.min(MATTERS_LEDGER_RENDER_INCREMENT, sortedRows.length - renderedRows.length).toLocaleString('en-GB')}
          </button>
        </div>
      )}

      {changedRows.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            zIndex: 1100,
            border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.35)}`,
            background: isDarkMode ? withAlpha(colours.dark.cardBackground, 0.96) : '#ffffff',
            boxShadow: isDarkMode ? '0 12px 22px rgba(0, 0, 0, 0.35)' : '0 12px 22px rgba(13, 47, 96, 0.18)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            {changedRows.length.toLocaleString('en-GB')} pending change{changedRows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            disabled={savingDrafts}
            onClick={handleSaveDraftedChanges}
            style={{
              border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.35)}`,
              background: savingDrafts ? 'transparent' : withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.12),
              color: isDarkMode ? colours.accent : colours.helixBlue,
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 800,
              cursor: savingDrafts ? 'wait' : 'pointer',
            }}
          >
            {savingDrafts ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
      {processingPanel && (
        <aside className="reports-floating-processing-panel" data-helix-region="reports/data-hub/matters-processing">
          <button
            type="button"
            className="reports-floating-processing-panel__close"
            onClick={() => setProcessingPanel(null)}
            aria-label="Dismiss processing panel"
          >
            <FontIcon iconName="Cancel" />
          </button>
          <ReportProcessingRailItemCard
            isDarkMode={isDarkMode}
            item={processingPanel}
            embedded
          />
        </aside>
      )}
    </section>
  );
};

export default MattersSourceLedger;