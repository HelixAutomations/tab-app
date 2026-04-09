import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { FontIcon } from '@fluentui/react/lib/Icon';
import type { Enquiry, TeamData } from '../../app/functionality/types';
import {
  buildEnquiryMutationPayload,
  enquiryReferencesId,
  resolveEnquiryProcessingIdentity,
} from '../../app/functionality/enquiryProcessingModel';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { getAreaGlyphMeta, renderAreaOfWorkGlyph } from '../../components/filter/areaGlyphs';
import type { DealRecord, InstructionRecord } from './dataSources';
import ReportShell from './components/ReportShell';
import { useReportRange } from './hooks/useReportRange';
import './EnquiryLedgerReport.css';

interface EnquiryLedgerReportProps {
  enquiries: Enquiry[] | null;
  deals: DealRecord[] | null;
  instructions: InstructionRecord[] | null;
  teamData?: TeamData[] | null;
  isFetching?: boolean;
  lastRefreshTimestamp?: number;
  triggerRefresh?: () => void;
}

type SourceFilter = 'all' | 'new' | 'legacy';
type PipelineFilter = 'all' | 'pitched' | 'instructed' | 'matter' | 'claimed' | 'unclaimed';
type SortKey = 'touchpoint' | 'created' | 'name' | 'value' | 'aow' | 'source';
type SortDir = 'asc' | 'desc';
type ToastTone = 'success' | 'error';

type EditableFieldKey = keyof Enquiry;

interface EnquiryLedgerRow {
  id: string;
  enquiry: Enquiry;
  displayName: string;
  ownerLabel: string;
  sourceLabel: 'New' | 'Legacy';
  pitchCount: number;
  instructionCount: number;
  pitched: boolean;
  instructed: boolean;
  matter: boolean;
  instructionRef: string | null;
  matterId: string | null;
  createdAtMs: number;
  touchpointAtMs: number;
  valueAmount: number;
  searchText: string;
  unclaimed: boolean;
}

interface FieldDefinition {
  key: EditableFieldKey;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  options?: string[];
  span?: 1 | 2;
}

interface FieldSection {
  title: string;
  fields: FieldDefinition[];
}

const FIELD_SECTIONS: FieldSection[] = [
  {
    title: 'Identity',
    fields: [
      { key: 'Title', label: 'Title' },
      { key: 'First_Name', label: 'First name' },
      { key: 'Last_Name', label: 'Last name' },
      { key: 'DOB', label: 'Date of birth' },
      { key: 'Email', label: 'Email', type: 'email' },
      { key: 'Phone_Number', label: 'Phone number', type: 'tel' },
      { key: 'Secondary_Phone', label: 'Secondary phone', type: 'tel' },
      { key: 'Company', label: 'Company' },
      { key: 'Website', label: 'Website' },
      { key: 'pocname', label: 'POC name' },
    ],
  },
  {
    title: 'Workflow',
    fields: [
      { key: 'Date_Created', label: 'Date created' },
      { key: 'Touchpoint_Date', label: 'Touchpoint date' },
      { key: 'Area_of_Work', label: 'Area of work' },
      { key: 'Type_of_Work', label: 'Type of work' },
      { key: 'Method_of_Contact', label: 'Method of contact' },
      { key: 'Point_of_Contact', label: 'Point of contact' },
      { key: 'Rating', label: 'Rating', type: 'select', options: ['', 'Good', 'Neutral', 'Poor'] },
      { key: 'Shared_With', label: 'Shared with' },
      { key: 'shared_with', label: 'Shared with (legacy)' },
      { key: 'Matter_Ref', label: 'Matter ref' },
    ],
  },
  {
    title: 'Commercial',
    fields: [
      { key: 'Value', label: 'Value' },
      { key: 'Call_Taker', label: 'Call taker' },
      { key: 'Ultimate_Source', label: 'Ultimate source' },
      { key: 'Contact_Referrer', label: 'Contact referrer' },
      { key: 'Referring_Company', label: 'Referring company' },
      { key: 'Other_Referrals', label: 'Other referrals' },
      { key: 'Referral_URL', label: 'Referral URL' },
      { key: 'Campaign', label: 'Campaign' },
      { key: 'Ad_Group', label: 'Ad group' },
      { key: 'Search_Keyword', label: 'Search keyword' },
      { key: 'GCLID', label: 'GCLID' },
      { key: 'Gift_Rank', label: 'Gift rank' },
    ],
  },
  {
    title: 'Address',
    fields: [
      { key: 'Unit_Building_Name_or_Number', label: 'Unit / building' },
      { key: 'Mailing_Street', label: 'Street 1' },
      { key: 'Mailing_Street_2', label: 'Street 2' },
      { key: 'Mailing_Street_3', label: 'Street 3' },
      { key: 'City', label: 'City' },
      { key: 'Mailing_County', label: 'County' },
      { key: 'Postal_Code', label: 'Postcode' },
      { key: 'Country', label: 'Country' },
    ],
  },
  {
    title: 'Notes',
    fields: [
      { key: 'Initial_first_call_notes', label: 'Initial call notes', type: 'textarea', span: 2 },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      { key: 'Tags', label: 'Tags', type: 'textarea', span: 2 },
    ],
  },
  {
    title: 'Compliance and forms',
    fields: [
      { key: 'Do_not_Market', label: 'Do not market' },
      { key: 'IP_Address', label: 'IP address' },
      { key: 'TDMY', label: 'TDMY' },
      { key: 'TDN', label: 'TDN' },
      { key: 'Employment', label: 'Employment' },
      { key: 'Divorce_Consultation', label: 'Divorce consultation' },
      { key: 'Web_Form', label: 'Web form' },
    ],
  },
];

const EDITABLE_FIELD_KEYS: EditableFieldKey[] = FIELD_SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

const normaliseText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const parseDateMs = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** True when the raw DB string has no meaningful time component (date-only or midnight). */
const isDateOnlyString = (raw: string): boolean => /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z?)?$/.test(raw.trim());

/** London-aware stacked date: { top, bottom }. Detects midnight (no real time). */
const getLedgerDateDisplay = (value: unknown): { top: string; bottom: string } => {
  const raw = String(value ?? '');
  const ms = parseDateMs(raw);
  if (!ms) return { top: '—', bottom: '' };
  const d = new Date(ms);

  const londonFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = new Date();
  const todayKey = londonFmt.format(now);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = londonFmt.format(yesterday);
  const dateKey = londonFmt.format(d);

  const hasTime = !isDateOnlyString(raw);

  const timePart = hasTime
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' })
    : '';

  if (dateKey === todayKey) return { top: hasTime ? `Today ${timePart}` : 'Today', bottom: '' };
  if (dateKey === yesterdayKey) return { top: hasTime ? `Yest ${timePart}` : 'Yesterday', bottom: '' };

  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return { top: datePart, bottom: hasTime ? timePart : '' };
};

const formatOwner = (email: string | undefined, teamData: TeamData[] | null | undefined): string => {
  const normalisedEmail = normaliseText(email);
  if (!normalisedEmail) return 'Unassigned';
  const teamMember = (teamData || []).find((member) => normaliseText((member as unknown as Record<string, unknown>).Email) === normalisedEmail);
  if (teamMember) {
    return String((teamMember as unknown as Record<string, unknown>)['Full Name'] || teamMember.First || teamMember.Email || email);
  }
  return email || 'Unassigned';
};

const buildCandidateIds = (enquiry: Enquiry): string[] => {
  return Array.from(
    new Set(
      [enquiry.ID, enquiry.pitchEnquiryId, enquiry.processingEnquiryId, enquiry.legacyEnquiryId]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );
};

const buildRecordKey = (enquiry: Enquiry): string => {
  const [primary] = buildCandidateIds(enquiry);
  return primary || `${String(enquiry.Email || '').trim().toLowerCase()}::${String(enquiry.Date_Created || '').trim()}`;
};

const isUnclaimedPoc = (value: unknown): boolean => {
  const s = String(value ?? '').trim().toLowerCase();
  return !s || s === 'team@helix-law.com' || s === 'team' || s === 'team inbox' || s === 'anyone' || s === 'unassigned' || s === 'unknown' || s === 'n/a';
};

const dedupeByKey = <T,>(records: T[], getKey: (record: T, index: number) => string): T[] => {
  const seen = new Set<string>();
  return records.filter((record, index) => {
    const key = getKey(record, index);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildProspectIndex = <T extends { ProspectId?: number | string }>(records: T[]): Map<string, T[]> => {
  const index = new Map<string, T[]>();
  records.forEach((record) => {
    const key = String(record.ProspectId ?? '').trim();
    if (!key) return;
    const bucket = index.get(key) || [];
    bucket.push(record);
    index.set(key, bucket);
  });
  return index;
};

const buildEmailIndex = <T extends { Email?: string }>(records: T[]): Map<string, T[]> => {
  const index = new Map<string, T[]>();
  records.forEach((record) => {
    const key = normaliseText(record.Email);
    if (!key) return;
    const bucket = index.get(key) || [];
    bucket.push(record);
    index.set(key, bucket);
  });
  return index;
};

const getFieldValue = (enquiry: Enquiry, fieldKey: EditableFieldKey): string => String(enquiry[fieldKey] ?? '');

const EnquiryLedgerReport: React.FC<EnquiryLedgerReportProps> = ({
  enquiries,
  deals,
  instructions,
  teamData,
  isFetching = false,
  lastRefreshTimestamp,
  triggerRefresh,
}) => {
  const range = useReportRange({ defaultKey: 'last90Days' });
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('touchpoint');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Partial<Record<EditableFieldKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [optimisticEdits, setOptimisticEdits] = useState<Record<string, Partial<Enquiry>>>({});
  const deferredSearch = useDeferredValue(search);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useTheme();

  const handleHeaderSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir(key === 'name' || key === 'aow' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  // Auto-dismiss toast after 4s
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((tone: ToastTone, message: string) => {
    setToast({ tone, message });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);



  const dealIndex = useMemo(() => buildProspectIndex(deals || []), [deals]);
  const instructionIndex = useMemo(() => buildProspectIndex(instructions || []), [instructions]);
  const instructionEmailIndex = useMemo(() => buildEmailIndex(instructions || []), [instructions]);

  const rows = useMemo<EnquiryLedgerRow[]>(() => {
    return (enquiries || []).map((enquiry) => {
      const candidateIds = buildCandidateIds(enquiry);
      const matchedDeals = dedupeByKey(
        candidateIds.flatMap((id) => dealIndex.get(id) || []),
        (record, index) => String(record.DealId ?? record.InstructionRef ?? index),
      );
      const matchedInstructions = dedupeByKey(
        [
          ...candidateIds.flatMap((id) => instructionIndex.get(id) || []),
          ...(instructionEmailIndex.get(normaliseText(enquiry.Email)) || []),
        ],
        (record, index) => String(record.InstructionRef ?? record.MatterId ?? index),
      );
      const mergedEnquiry = { ...enquiry, ...(optimisticEdits[buildRecordKey(enquiry)] || {}) };
      const createdAtMs = parseDateMs(mergedEnquiry.Date_Created);
      const touchpointAtMs = parseDateMs(mergedEnquiry.Touchpoint_Date) || createdAtMs;
      const valueAmount = Number(String(mergedEnquiry.Value ?? '').replace(/[^\d.-]/g, '')) || 0;
      const displayName = [mergedEnquiry.First_Name, mergedEnquiry.Last_Name].filter(Boolean).join(' ').trim() || mergedEnquiry.Email || mergedEnquiry.ID;
      const sourceLabel = mergedEnquiry.processingSource === 'legacy' ? 'Legacy' : 'New';
      const instructionRef = matchedInstructions[0]?.InstructionRef || matchedDeals[0]?.InstructionRef || null;
      const matterId = matchedInstructions[0]?.MatterId || null;
      const searchText = normaliseText([
        mergedEnquiry.ID,
        mergedEnquiry.Email,
        mergedEnquiry.First_Name,
        mergedEnquiry.Last_Name,
        mergedEnquiry.Company,
        mergedEnquiry.Area_of_Work,
        mergedEnquiry.Type_of_Work,
        mergedEnquiry.Point_of_Contact,
        mergedEnquiry.Phone_Number,
        mergedEnquiry.Value,
        instructionRef,
        matterId,
      ].join(' '));

      return {
        id: buildRecordKey(enquiry),
        enquiry: mergedEnquiry,
        displayName,
        ownerLabel: formatOwner(mergedEnquiry.Point_of_Contact, teamData),
        sourceLabel,
        pitchCount: matchedDeals.length,
        instructionCount: matchedInstructions.length,
        pitched: matchedDeals.length > 0,
        instructed: matchedInstructions.length > 0,
        matter: Boolean(matterId),
        instructionRef,
        matterId,
        createdAtMs,
        touchpointAtMs,
        valueAmount,
        searchText,
        unclaimed: isUnclaimedPoc(mergedEnquiry.Point_of_Contact),
      };
    });
  }, [dealIndex, enquiries, instructionEmailIndex, instructionIndex, optimisticEdits, teamData]);

  const filteredRows = useMemo(() => {
    const searchTerm = normaliseText(deferredSearch);

    const nextRows = rows.filter((row) => {
      if (range.range) {
        const timestamp = row.touchpointAtMs || row.createdAtMs;
        if (timestamp < range.range.start.getTime() || timestamp > range.range.end.getTime()) {
          return false;
        }
      }

      if (sourceFilter !== 'all' && normaliseText(row.sourceLabel) !== sourceFilter) {
        return false;
      }

      if (pipelineFilter === 'pitched' && !row.pitched) return false;
      if (pipelineFilter === 'instructed' && !row.instructed) return false;
      if (pipelineFilter === 'matter' && !row.matter) return false;
      if (pipelineFilter === 'claimed' && row.unclaimed) return false;
      if (pipelineFilter === 'unclaimed' && !row.unclaimed) return false;

      if (searchTerm && !row.searchText.includes(searchTerm)) {
        return false;
      }

      return true;
    });

    const cmp = (a: number, b: number) => sortDir === 'asc' ? a - b : b - a;
    const strCmp = (a: string, b: string) => sortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);

    nextRows.sort((left, right) => {
      if (sortKey === 'name') return strCmp(left.displayName, right.displayName);
      if (sortKey === 'created') return cmp(left.createdAtMs, right.createdAtMs);
      if (sortKey === 'value') return cmp(left.valueAmount, right.valueAmount);
      if (sortKey === 'aow') return strCmp(left.enquiry.Area_of_Work || '', right.enquiry.Area_of_Work || '');
      if (sortKey === 'source') return strCmp(left.sourceLabel, right.sourceLabel);
      return cmp(left.touchpointAtMs, right.touchpointAtMs);
    });

    return nextRows;
  }, [deferredSearch, pipelineFilter, range.range, rows, sortKey, sortDir, sourceFilter]);

  const activeRow = useMemo(() => filteredRows.find((row) => row.id === editingRowId) || rows.find((row) => row.id === editingRowId) || null, [editingRowId, filteredRows, rows]);

  useEffect(() => {
    if (!activeRow) {
      setDraftValues({});
      return;
    }
    const nextValues = EDITABLE_FIELD_KEYS.reduce<Partial<Record<EditableFieldKey, string>>>((acc, key) => {
      acc[key] = getFieldValue(activeRow.enquiry, key);
      return acc;
    }, {});
    setDraftValues(nextValues);
  }, [activeRow]);


  const handleDraftValueChange = useCallback((field: EditableFieldKey, value: string) => {
    setDraftValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleCloseModal = useCallback(() => {
    if (isSaving) return;
    setEditingRowId(null);
  }, [isSaving]);

  const handleSave = useCallback(async () => {
    if (!activeRow) return;

    const original = (enquiries || []).find((enquiry) => enquiryReferencesId(enquiry, activeRow.enquiry.ID));
    const target = original || activeRow.enquiry;

    const updates = EDITABLE_FIELD_KEYS.reduce<Record<string, unknown>>((acc, key) => {
      const nextValue = String(draftValues[key] ?? '');
      const previousValue = getFieldValue(target, key);
      if (nextValue !== previousValue) {
        acc[key] = nextValue;
      }
      return acc;
    }, {});

    if (Object.keys(updates).length === 0) {
      showToast('success', 'No changes to save.');
      setEditingRowId(null);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnquiryMutationPayload(target, updates)),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update enquiry');
      }

      setOptimisticEdits((prev) => ({
        ...prev,
        [activeRow.id]: {
          ...(prev[activeRow.id] || {}),
          ...(updates as Partial<Enquiry>),
        },
      }));
      showToast('success', `Saved ${activeRow.displayName}`);
      setEditingRowId(null);
      triggerRefresh?.();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to save enquiry.');
    } finally {
      setIsSaving(false);
    }
  }, [activeRow, draftValues, enquiries, showToast, triggerRefresh]);

  const activeRowContext = useMemo(() => {
    if (!activeRow) return [];
    const processingIdentity = resolveEnquiryProcessingIdentity(activeRow.enquiry);
    return [
      { label: 'Record ID', value: activeRow.enquiry.ID },
      { label: 'Processing ID', value: processingIdentity.enquiryId || '—' },
      { label: 'Processing source', value: processingIdentity.source === 'legacy' ? 'Legacy' : 'New' },
      { label: 'Instruction ref', value: activeRow.instructionRef || '—' },
      { label: 'Matter', value: activeRow.matterId || 'Not opened' },
      { label: 'Pitches', value: String(activeRow.pitchCount) },
      { label: 'Instructions', value: String(activeRow.instructionCount) },
      { label: 'Owner', value: activeRow.ownerLabel },
    ];
  }, [activeRow]);

  const GRID_TEMPLATE = 'clamp(4px, 0.5vw, 6px) minmax(68px, 0.7fr) 32px minmax(160px, 2fr) minmax(140px, 1.8fr) 72px 44px';

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  /* Toolbar extras — search + filters rendered inside ReportShell toolbar */
  const toolbarExtras = useMemo(() => (
    <>
      <select className="helix-input enquiry-ledger-controls__select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
        <option value="all">All sources</option>
        <option value="new">New only</option>
        <option value="legacy">Legacy only</option>
      </select>
      <select className="helix-input enquiry-ledger-controls__select" value={pipelineFilter} onChange={(event) => setPipelineFilter(event.target.value as PipelineFilter)}>
        <option value="all">All stages</option>
        <option value="claimed">Claimed</option>
        <option value="unclaimed">Unclaimed</option>
        <option value="pitched">Pitched</option>
        <option value="instructed">Instructed</option>
        <option value="matter">Matter opened</option>
      </select>
    </>
  ), [sourceFilter, pipelineFilter]);

  const toolbarBottom = useMemo(() => (
    <div className="enquiry-ledger-controls">
      <input
        className="helix-input enquiry-ledger-controls__search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, email, company, work type, owner, ID…"
      />
      <span className="enquiry-ledger-controls__count">{filteredRows.length} / {rows.length}</span>
    </div>
  ), [search, filteredRows.length, rows.length]);

  return (
    <div className="enquiry-ledger-report">
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastRefreshTimestamp} onRefresh={triggerRefresh} variant="full" toolbarExtras={toolbarExtras} toolbarBottom={toolbarBottom}>

        {/* ── Toast ── */}
        {toast && (
          <div className={`enquiry-ledger-toast ${toast.tone === 'error' ? 'helix-toast-error' : 'helix-toast-success'}`}>
            {toast.message}
          </div>
        )}

        {/* ── Scroll container with sticky header + grid rows ── */}
        <div className="enquiry-ledger-scroll" ref={scrollRef}>
          <div className="enquiry-ledger-grid-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
            <span></span>
            <span className="enquiry-ledger-sortable" data-active={sortKey === 'touchpoint' || undefined} onClick={() => handleHeaderSort('touchpoint')}>Date{sortArrow('touchpoint')}</span>
            <span></span>
            <span className="enquiry-ledger-sortable" data-active={sortKey === 'name' || undefined} onClick={() => handleHeaderSort('name')}>Prospect{sortArrow('name')}</span>
            <span className="enquiry-ledger-sortable" data-active={sortKey === 'aow' || undefined} onClick={() => handleHeaderSort('aow')}>Pipeline{sortArrow('aow')}</span>
            <span className="enquiry-ledger-sortable" data-active={sortKey === 'source' || undefined} onClick={() => handleHeaderSort('source')}>Status{sortArrow('source')}</span>
            <span></span>
          </div>

          {filteredRows.length === 0 ? (
            <div className="enquiry-ledger-empty">No enquiries match the current filters.</div>
          ) : (
            filteredRows.map((row) => {
              const aow = getAreaGlyphMeta(row.enquiry.Area_of_Work || '');
              const dateDisplay = getLedgerDateDisplay(row.enquiry.Touchpoint_Date || row.enquiry.Date_Created);
              return (
                <div key={row.id} className="enquiry-ledger-row" data-unclaimed={row.unclaimed || undefined} style={{ gridTemplateColumns: GRID_TEMPLATE }} onClick={() => setEditingRowId(row.id)}>
                  {/* Timeline strip */}
                  <div className="enquiry-ledger-timeline" style={{ ['--aow-color' as string]: aow.color }}>
                    <div className="enquiry-ledger-timeline__line" />
                  </div>
                  {/* Date */}
                  <div className="enquiry-ledger-date">
                    <span className="enquiry-ledger-date__top">{dateDisplay.top}</span>
                    <span className="enquiry-ledger-date__bottom">{dateDisplay.bottom || '\u00A0'}</span>
                  </div>
                  {/* AoW icon */}
                  <div className="enquiry-ledger-aow-icon">
                    {renderAreaOfWorkGlyph(row.enquiry.Area_of_Work || '', aow.color, 'glyph', 15)}
                  </div>
                  {/* Prospect */}
                  <div className="enquiry-ledger-cell">
                    <span className="enquiry-ledger-cell__primary">{row.displayName}</span>
                    <span className="enquiry-ledger-cell__secondary">{row.enquiry.Company || row.enquiry.Email || '\u00A0'}</span>
                  </div>
                  {/* Pipeline */}
                  <div className="enquiry-ledger-cell">
                    <span className="enquiry-ledger-cell__primary">{row.ownerLabel}</span>
                    <div className="enquiry-ledger-pill-rail">
                      <span className="enquiry-ledger-claim-label" data-claim={row.unclaimed ? 'unclaimed' : 'claimed'}>{row.unclaimed ? 'Unclaimed' : 'Claimed'}</span>
                      {row.pitched && <span className="enquiry-ledger-pill" style={{ ['--ledger-pill-tone' as string]: colours.highlight }}>Pitched</span>}
                      {row.instructed && <span className="enquiry-ledger-pill" style={{ ['--ledger-pill-tone' as string]: colours.green }}>Instructed</span>}
                      {row.matter && <span className="enquiry-ledger-pill" style={{ ['--ledger-pill-tone' as string]: colours.cta }}>Matter</span>}
                    </div>
                  </div>
                  {/* Status */}
                  <div className="enquiry-ledger-status">
                    <span className="enquiry-ledger-source-badge" data-source={row.sourceLabel.toLowerCase()}>
                      {row.sourceLabel}
                    </span>
                  </div>
                  {/* Action */}
                  <div className="enquiry-ledger-cell enquiry-ledger-cell--action">
                    <FontIcon iconName="Edit" className="enquiry-ledger-edit-icon" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ReportShell>

      {/* ── Edit modal ── */}
      <Modal
        isOpen={Boolean(activeRow)}
        onDismiss={handleCloseModal}
        isBlocking={isSaving}
        styles={{ main: { width: 'min(1180px, calc(100vw - 24px))', maxWidth: '1180px', background: 'transparent', boxShadow: 'none' } }}
      >
        {activeRow && (
          <div className="enquiry-ledger-modal">
            <div className="enquiry-ledger-modal__header">
              <h2 className="enquiry-ledger-modal__title">Edit {activeRow.displayName}</h2>
              <div className="enquiry-ledger-modal__meta-strip">
                {activeRowContext.map((item) => (
                  <span key={item.label} className="enquiry-ledger-meta-tag">
                    <span className="enquiry-ledger-meta-tag__label">{item.label}</span> {item.value}
                  </span>
                ))}
              </div>
              <button type="button" className="enquiry-ledger-close-btn" onClick={handleCloseModal} aria-label="Close">
                <FontIcon iconName="Cancel" />
              </button>
            </div>

            <div className="enquiry-ledger-modal__body">
              {FIELD_SECTIONS.map((section) => (
                <section key={section.title} className="enquiry-ledger-form-section">
                  <div className="enquiry-ledger-form-section__title">{section.title}</div>
                  <div className="enquiry-ledger-form-grid">
                    {section.fields.map((field) => (
                      <label key={field.key} className={`enquiry-ledger-field${field.span === 2 ? ' enquiry-ledger-field--span-2' : ''}`}>
                        <span className="helix-label">{field.label}</span>
                        {field.type === 'textarea' ? (
                          <textarea className="helix-input enquiry-ledger-textarea" value={draftValues[field.key] ?? ''} onChange={(event) => handleDraftValueChange(field.key, event.target.value)} />
                        ) : field.type === 'select' ? (
                          <select className="helix-input" value={draftValues[field.key] ?? ''} onChange={(event) => handleDraftValueChange(field.key, event.target.value)}>
                            {(field.options || []).map((option) => (
                              <option key={option || 'blank'} value={option}>{option || 'Not set'}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="helix-input" type={field.type || 'text'} value={draftValues[field.key] ?? ''} onChange={(event) => handleDraftValueChange(field.key, event.target.value)} />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}

              <div className="enquiry-ledger-modal__footer">
                <div className="enquiry-ledger-modal__actions">
                  <button type="button" className="enquiry-ledger-secondary-btn" onClick={handleCloseModal} disabled={isSaving}>Cancel</button>
                  <button type="button" className="helix-btn-primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save changes'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EnquiryLedgerReport;