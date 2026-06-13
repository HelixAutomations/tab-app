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

type LedgerSortKey = 'date' | 'matterRef';
type LedgerDirection = 'asc' | 'desc';

// Column definitions for the matters table
const MATTERS_TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'date', label: 'Opened', defaultVisible: true },
  { key: 'matterRef', label: 'Matter', defaultVisible: true },
  { key: 'instructionRef', label: 'Instruction', defaultVisible: true },
  { key: 'client', label: 'Client', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'practiceArea', label: 'Practice Area', defaultVisible: true },
  { key: 'approxValue', label: 'Value', defaultVisible: true },
  { key: 'responsibleSolicitor', label: 'Responsible', defaultVisible: true },
  { key: 'originatingSolicitor', label: 'Originating', defaultVisible: false },
  { key: 'referrer', label: 'Referrer', defaultVisible: false },
  { key: 'methodOfContact', label: 'Method', defaultVisible: true },
  { key: 'source', label: 'Source', defaultVisible: true },
  { key: 'enquiryId', label: 'Enquiry ID', defaultVisible: true },
];

type MattersSourceLedgerProps = {
  isDarkMode: boolean;
  presentation?: 'embedded' | 'fullPage';
};

const SKELETON_ROW_COUNT = 6;
const MATTERS_LEDGER_ENDPOINT = '/api/matters-unified';
const MATTERS_ENQUIRY_LINKAGE_WRITE_ENDPOINT = '/api/matters/enquiry-linkage/write';
const MATTERS_CLIENT_NAME_RESOLVE_ENDPOINT = '/api/matters/client-name/resolve';
const MATTERS_ROW_UPDATE_ENDPOINT = '/api/matters/row-update';

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

const MattersSourceLedger: React.FC<MattersSourceLedgerProps> = ({ isDarkMode, presentation = 'embedded' }) => {
  const { showToast } = useToast();
  void showToast; // kept for compatibility — processing now uses the floating panel
  const isFullPage = presentation === 'fullPage';
  const fullPageSurface = '#ffffff';
  const fullPageText = '#111827';
  const fullPageMuted = '#6b7280';
  const tableCellFontSize = isFullPage ? 10 : 8;
  const tableCellPadding = isFullPage ? '6px 8px' : '3px 4px';
  const [rows, setRows] = React.useState<MattersLedgerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<LedgerSortKey>('date');
  const [direction, setDirection] = React.useState<LedgerDirection>('desc');
  const [processingRowKey, setProcessingRowKey] = React.useState<string | null>(null);
  const [processingClientRowKey, setProcessingClientRowKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editCell, setEditCell] = React.useState<{ rowKey: string; field: string; label: string; x: number; y: number } | null>(null);
  const [editInputValue, setEditInputValue] = React.useState('');
  const [processingPanel, setProcessingPanel] = React.useState<ReportProcessingRailItem | null>(null);
  const [rowDrafts, setRowDrafts] = React.useState<Record<string, Partial<Record<'source' | 'methodOfContact', string>>>>({});
  const [savingDrafts, setSavingDrafts] = React.useState(false);
  const processingTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  // Column visibility state
  const {
    visibleColumns,
    handleToggleColumn,
    handleShowAll,
    handleHideAll,
    handleReset,
  } = useColumnVisibility('matters-ledger', MATTERS_TABLE_COLUMNS);

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
          })
          .slice(0, 220);

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

  const sortedRows = React.useMemo(() => {
    const next = [...rows];
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
  }, [rows, sort, direction]);

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
    : `${rows.length.toLocaleString('en-GB')} recent matter rows`;

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

  const DROPDOWN_FIELDS = React.useMemo(() => new Set(['practiceArea', 'responsibleSolicitor', 'originatingSolicitor', 'source', 'referrer', 'methodOfContact']), []);

  const uniqueFieldValues = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const field of DROPDOWN_FIELDS) {
      const seen = new Set<string>();
      for (const r of rows) {
        const v = String((r as unknown as Record<string, unknown>)[field] ?? '').trim();
        if (v && v !== '—' && v !== 'Not set' && v !== 'Unassigned') seen.add(v);
      }
      map.set(field, Array.from(seen).sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' })));
    }
    return map;
  }, [rows, DROPDOWN_FIELDS]);

  const changedRows = React.useMemo(() => {
    return rows.filter((row) => {
      const draft = rowDrafts[row.rowKey];
      if (!draft) return false;
      const sourceDraft = draft.source;
      const methodDraft = draft.methodOfContact;
      return (sourceDraft != null && sourceDraft.trim() !== String(row.source || '').trim())
        || (methodDraft != null && methodDraft.trim() !== String(row.methodOfContact || '').trim());
    });
  }, [rowDrafts, rows]);

  const setRowDraft = React.useCallback((row: MattersLedgerRow, field: 'source' | 'methodOfContact', value: string) => {
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

  const getDraftedValue = React.useCallback((row: MattersLedgerRow, field: 'source' | 'methodOfContact') => {
    const draft = rowDrafts[row.rowKey]?.[field];
    return draft == null ? String((row as Record<string, unknown>)[field] ?? '').trim() : draft;
  }, [rowDrafts]);

  const openEditCell = React.useCallback((e: React.MouseEvent<HTMLElement>, row: MattersLedgerRow, field: keyof MattersLedgerRow, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 240;
    const popoverHeight = 150;
    const x = Math.min(rect.left, window.innerWidth - popoverWidth - 12);
    const y = Math.min(rect.bottom + 4, window.innerHeight - popoverHeight - 8);
    const rawVal = (row as unknown as Record<string, unknown>)[field];
    setEditInputValue(rawVal == null ? '' : String(rawVal));
    setEditCell({ rowKey: row.rowKey, field, label, x, y });
  }, []);

  const closeEditCell = React.useCallback(() => setEditCell(null), []);

  const confirmEditCell = React.useCallback(() => {
    if (!editCell) return;
    const field = editCell.field as keyof MattersLedgerRow;
    setRows((prev) => prev.map((r) => {
      if (r.rowKey !== editCell.rowKey) return r;
      return { ...r, [field]: editInputValue.trim() || null } as MattersLedgerRow;
    }));
    setEditCell(null);
  }, [editCell, editInputValue]);

  const handleSaveDraftedChanges = React.useCallback(async () => {
    if (!changedRows.length) return;
    setSavingDrafts(true);
    setFeedback(null);

    let successCount = 0;
    let failCount = 0;

    for (const row of changedRows) {
      const draft = rowDrafts[row.rowKey] || {};
      const updates: Record<string, string> = {};
      if (draft.source != null && draft.source.trim() !== String(row.source || '').trim()) updates.source = draft.source.trim();
      if (draft.methodOfContact != null && draft.methodOfContact.trim() !== String(row.methodOfContact || '').trim()) updates.method_of_contact = draft.methodOfContact.trim();
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
        return {
          ...row,
          source: draft.source != null ? draft.source.trim() : row.source,
          methodOfContact: draft.methodOfContact != null ? draft.methodOfContact.trim() : row.methodOfContact,
        };
      }));
      setRowDrafts({});
    }

    setFeedback({
      type: failCount > 0 ? 'error' : 'success',
      message: failCount > 0
        ? `Saved ${successCount.toLocaleString('en-GB')} change${successCount === 1 ? '' : 's'}; ${failCount.toLocaleString('en-GB')} failed.`
        : `Saved ${successCount.toLocaleString('en-GB')} change${successCount === 1 ? '' : 's'} across the matters ledger.`,
    });
    setSavingDrafts(false);
  }, [changedRows, rowDrafts]);

  React.useEffect(() => {
    if (!editCell) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditCell();
      if (e.key === 'Enter') confirmEditCell();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editCell, closeEditCell, confirmEditCell]);

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

      {/* Column selector toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8,
          padding: isFullPage ? '12px 16px' : '8px 10px',
          borderBottom: isFullPage ? `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.16)}` : 'none',
          background: isFullPage ? fullPageSurface : 'transparent',
        }}
      >
        <ColumnSelector
          columns={MATTERS_TABLE_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={handleToggleColumn}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
          onReset={handleReset}
        />
      </div>

      <div
        className="enquiry-source-ledger-scroll"
        style={{
          maxHeight: isFullPage ? 'calc(100vh - 2px)' : 300,
          height: isFullPage ? 'calc(100vh - 2px)' : undefined,
          overflow: 'auto',
          border: isFullPage ? 'none' : `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.18)}`,
          background: isFullPage
            ? fullPageSurface
            : (isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.7) : withAlpha(colours.light.sectionBackground, 0.9)),
        }}
      >
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              {[
                { key: 'date', label: 'Opened' },
                { key: 'matterRef', label: 'Matter' },
                { key: 'instructionRef', label: 'Instruction' },
                { key: 'client', label: 'Client' },
                { key: 'description', label: 'Description' },
                { key: 'practiceArea', label: 'Practice Area' },
                { key: 'approxValue', label: 'Value' },
                { key: 'responsibleSolicitor', label: 'Responsible' },
                { key: 'originatingSolicitor', label: 'Originating' },
                { key: 'referrer', label: 'Referrer' },
                { key: 'methodOfContact', label: 'Method' },
                { key: 'source', label: 'Source' },
                { key: 'id', label: 'Enquiry ID' },
              ]
                .filter((column) => visibleColumns.has(column.key))
                .map((column) => {
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
                      padding: tableCellPadding,
                      fontSize: isFullPage ? 9 : 8,
                      fontWeight: 700,
                      letterSpacing: 0,
                      textTransform: 'uppercase',
                      color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey),
                      background: isFullPage ? fullPageSurface : (isDarkMode ? withAlpha(colours.dark.cardBackground, 0.96) : withAlpha(colours.light.cardBackground, 0.96)),
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
                {Array.from({ length: visibleColumns.size }).map((__, cellIndex) => (
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

            {!loading && sortedRows.map((row) => (
              <tr key={row.rowKey}>
                {visibleColumns.has('date') && (
                  <td style={{ padding: tableCellPadding, fontSize: tableCellFontSize, color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text), borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap' }} title={`${formatDate(row.openDate)} ${formatTime(row.openDate)}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.0 }}>
                      <span>{formatDate(row.openDate)}</span>
                      <span style={{ fontSize: tableCellFontSize, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey) }}>{formatTime(row.openDate)}</span>
                    </div>
                  </td>
                )}
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
                  <td style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.clientName || ''}>
                    {row.clientName ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <span style={{ color: isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text), fontSize: tableCellFontSize, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                          {row.clientName}
                        </span>
                        <span style={{ fontSize: tableCellFontSize, color: isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey), overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.clientId || ''}</span>
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
                  const LABELS: Record<string, string> = { description: 'Description', practiceArea: 'Practice Area', approxValue: 'Value', responsibleSolicitor: 'Responsible', originatingSolicitor: 'Originating', source: 'Source', referrer: 'Referrer', methodOfContact: 'Method' };
                  const rawVal = (row as unknown as Record<string, unknown>)[field];
                  const displayVal = rawVal == null ? '' : String(rawVal);
                  const isEmpty = !displayVal || displayVal === 'Unassigned' || displayVal === 'Not set';
                  const isActive = editCell?.rowKey === row.rowKey && editCell?.field === field;

                  // Skip rendering if column is not visible
                  if (!visibleColumns.has(field)) {
                    return null;
                  }

                  if (field === 'source' || field === 'methodOfContact') {
                    const choices = uniqueFieldValues.get(field === 'source' ? 'source' : 'methodOfContact') || [];
                    const currentValue = getDraftedValue(row, field);
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
                    return (
                      <td
                        key={field}
                        style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        <select
                          value={effectiveValue}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (field === 'methodOfContact' && nextValue === '__new_method__') {
                              const typed = window.prompt('Enter new method of contact', effectiveValue || '');
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
                              ? '1px solid transparent'
                              : `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, isFullPage ? 0.12 : 0.24)}`,
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
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            backgroundImage: 'none',
                          }}
                        >
                          <option value="">--</option>
                          {effectiveValue && !hasCurrentInChoices && (
                            <option value={effectiveValue}>{effectiveValue}</option>
                          )}
                          {choices.map((choice) => (
                            <option key={`${row.rowKey}-${field}-${choice}`} value={choice}>{choice}</option>
                          ))}
                          {field === 'methodOfContact' && (
                            <option value="__new_method__">+ Add new value…</option>
                          )}
                        </select>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={field}
                      onClick={(e) => openEditCell(e, row, field, LABELS[field])}
                      style={{ padding: tableCellPadding, borderBottom: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.09)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', background: isActive ? withAlpha(colours.highlight, 0.1) : 'transparent' }}
                      title={displayVal || LABELS[field]}
                    >
                      <span style={{ fontSize: tableCellFontSize, color: isEmpty ? (isFullPage ? fullPageMuted : (isDarkMode ? colours.greyText : colours.subtleGrey)) : (isFullPage ? fullPageText : (isDarkMode ? colours.dark.text : colours.light.text)), overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                        {isEmpty ? '—' : displayVal}
                      </span>
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
                  colSpan={visibleColumns.size}
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

      {editCell && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 900 }}
            onClick={closeEditCell}
          />
          <div
            style={{
              position: 'fixed',
              left: editCell.x,
              top: editCell.y,
              zIndex: 901,
              width: 240,
              background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
              border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.28)}`,
              boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              {editCell.label}
            </span>
            <input
              type="text"
              list={`ecl-${editCell.field}`}
              value={editInputValue}
              onChange={(e) => setEditInputValue(e.target.value)}
              autoFocus
              style={{
                fontSize: 11,
                padding: '4px 7px',
                border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.28)}`,
                background: isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.95) : withAlpha(colours.light.sectionBackground, 0.95),
                color: isDarkMode ? colours.dark.text : colours.light.text,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            {DROPDOWN_FIELDS.has(editCell.field) && (
              <datalist id={`ecl-${editCell.field}`}>
                {(uniqueFieldValues.get(editCell.field) ?? []).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            )}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeEditCell}
                style={{ fontSize: 10, padding: '3px 10px', background: 'transparent', border: `1px solid ${withAlpha(isDarkMode ? colours.accent : colours.highlight, 0.2)}`, color: isDarkMode ? colours.greyText : colours.subtleGrey, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEditCell}
                style={{ fontSize: 10, padding: '3px 10px', background: withAlpha(colours.highlight, 0.16), border: `1px solid ${withAlpha(colours.highlight, 0.32)}`, color: isDarkMode ? colours.dark.text : colours.light.text, cursor: 'pointer', fontWeight: 700 }}
              >
                Apply
              </button>
            </div>
          </div>
        </>
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