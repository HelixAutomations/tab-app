import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import { getApiUrl } from '../../../utils/getApiUrl';
import { useColumnVisibility, type ColumnDefinition } from '../hooks/useColumnVisibility';
import { ColumnSelector } from './ColumnSelector';

// ─── Types ────────────────────────────────────────────────────────────────────

type CallsLedgerRow = {
  id: string | null;
  fromParty: string;
  fromLabel: string;
  toParty: string;
  toLabel: string;
  callType: string;
  durationSeconds: number | null;
  startTime: string | null;
  teamInitials: string;
  sentiment: string;
  status: string;
  channel: string;
};

type CallsLedgerSortKey = 'date' | 'duration' | 'type' | 'initials';
type CallsLedgerDirection = 'asc' | 'desc';
type CallsLedgerColumnKey = 'date' | 'type' | 'from' | 'to' | 'duration' | 'initials' | 'sentiment' | 'channel' | 'status';
type CallTypeFilter = 'all' | 'inbound' | 'outbound';
type CallsDatePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-quarter' | 'year-to-date';

// ─── Constants ────────────────────────────────────────────────────────────────

const CALLS_LEDGER_ENDPOINT = '/api/dubberCalls/ledger';
const CALLS_LEDGER_PAGE_SIZE = 200;

const CALLS_LEDGER_COLUMNS: ColumnDefinition[] = [
  { key: 'date', label: 'Date / Time', defaultVisible: true },
  { key: 'type', label: 'Type', defaultVisible: true },
  { key: 'from', label: 'From', defaultVisible: true },
  { key: 'to', label: 'To', defaultVisible: true },
  { key: 'duration', label: 'Duration', defaultVisible: true },
  { key: 'initials', label: 'Team', defaultVisible: true },
  { key: 'sentiment', label: 'Sentiment', defaultVisible: true },
  { key: 'channel', label: 'Channel', defaultVisible: false },
  { key: 'status', label: 'Status', defaultVisible: false },
];

const CALLS_LEDGER_COLUMN_WEIGHTS: Record<CallsLedgerColumnKey, number> = {
  date: 11,
  type: 7,
  from: 14,
  to: 14,
  duration: 7,
  initials: 6,
  sentiment: 9,
  channel: 10,
  status: 8,
};

const CALLS_DATE_PRESETS: Array<{ key: CallsDatePreset; label: string }> = [
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'This quarter' },
  { key: 'year-to-date', label: 'Year to date' },
];

const CALL_TYPE_FILTERS: Array<{ key: CallTypeFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
];

const SORTABLE_COLUMNS: Array<{ key: CallsLedgerSortKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'duration', label: 'Duration' },
  { key: 'type', label: 'Type' },
  { key: 'initials', label: 'Team' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function padSeg(n: number): string { return String(n).padStart(2, '0'); }

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${padSeg(d.getMonth() + 1)}-${padSeg(d.getDate())}`;
}

function startOfLocalDay(d: Date): Date {
  const next = new Date(d); next.setHours(0, 0, 0, 0); return next;
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d); next.setDate(next.getDate() + days); return next;
}

function getCallsDatePresetRange(preset: CallsDatePreset, now = new Date()): { startDate: string; endDate: string } {
  const today = startOfLocalDay(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisWeekStart = addLocalDays(today, -mondayOffset);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisQuarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const fyStart = today.getMonth() >= 3
    ? new Date(today.getFullYear(), 3, 1)
    : new Date(today.getFullYear() - 1, 3, 1);
  if (preset === 'last-week') {
    const s = addLocalDays(thisWeekStart, -7);
    return { startDate: formatDateOnly(s), endDate: formatDateOnly(addLocalDays(thisWeekStart, -1)) };
  }
  if (preset === 'last-month') {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { startDate: formatDateOnly(s), endDate: formatDateOnly(addLocalDays(thisMonthStart, -1)) };
  }
  if (preset === 'this-month') return { startDate: formatDateOnly(thisMonthStart), endDate: formatDateOnly(today) };
  if (preset === 'this-quarter') return { startDate: formatDateOnly(thisQuarterStart), endDate: formatDateOnly(today) };
  if (preset === 'year-to-date') return { startDate: formatDateOnly(fyStart), endDate: formatDateOnly(today) };
  return { startDate: formatDateOnly(thisWeekStart), endDate: formatDateOnly(today) };
}

function formatDisplayDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDisplayTime(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${padSeg(s)}`;
}

function formatParty(label: string, party: string): string {
  const l = label.trim();
  const p = party.trim();
  if (l) return l;
  return p || '--';
}

function normaliseSentiment(value: string): { label: string; tone: 'positive' | 'negative' | 'neutral' | 'none' } {
  const v = value.toLowerCase().trim();
  if (!v) return { label: '--', tone: 'none' };
  if (v.includes('positive')) return { label: 'Positive', tone: 'positive' };
  if (v.includes('negative')) return { label: 'Negative', tone: 'negative' };
  return { label: value, tone: 'neutral' };
}

// ─── Component ────────────────────────────────────────────────────────────────

type CallsLedgerProps = {
  isDarkMode: boolean;
  presentation?: 'embedded' | 'fullPage';
};

const CallsLedger: React.FC<CallsLedgerProps> = ({ isDarkMode, presentation = 'embedded' }) => {
  const isFullPage = presentation === 'fullPage';

  // ── State ──
  const [rows, setRows] = React.useState<CallsLedgerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<CallsLedgerSortKey>('date');
  const [direction, setDirection] = React.useState<CallsLedgerDirection>('desc');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [callTypeFilter, setCallTypeFilter] = React.useState<CallTypeFilter>('all');
  const [datePreset, setDatePreset] = React.useState<CallsDatePreset>('this-week');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextOffset, setNextOffset] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const {
    visibleColumns,
    handleToggleColumn,
    handleShowAll,
    handleHideAll,
    handleReset,
  } = useColumnVisibility('calls-ledger-v1', CALLS_LEDGER_COLUMNS);

  const isColumnVisible = React.useCallback(
    (key: CallsLedgerColumnKey) => visibleColumns.has(key),
    [visibleColumns],
  );

  const visibleCols = React.useMemo(
    () => CALLS_LEDGER_COLUMNS.filter((c) => isColumnVisible(c.key as CallsLedgerColumnKey)),
    [isColumnVisible],
  );

  const tableMinWidth = React.useMemo(() => {
    const totalWeight = visibleCols.reduce((s, c) => s + (CALLS_LEDGER_COLUMN_WEIGHTS[c.key as CallsLedgerColumnKey] ?? 8), 0) || 1;
    return Math.max(600, totalWeight * 9.6);
  }, [visibleCols]);

  const dateRange = React.useMemo(() => getCallsDatePresetRange(datePreset), [datePreset]);
  const deferredSearch = React.useDeferredValue(searchTerm);

  // ── Fetch ──
  React.useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setHasMore(false);
      setNextOffset(0);
      try {
        const params = new URLSearchParams({
          limit: String(CALLS_LEDGER_PAGE_SIZE),
          offset: '0',
          sort,
          direction,
          dateFrom: dateRange.startDate,
          dateTo: dateRange.endDate,
          callType: callTypeFilter,
          ...(deferredSearch ? { search: deferredSearch } : {}),
        });
        const response = await fetch(getApiUrl(`${CALLS_LEDGER_ENDPOINT}?${params}`), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`calls_ledger_${response.status}`);
        const payload = await response.json();
        if (!mounted) return;
        setRows(Array.isArray(payload?.rows) ? payload.rows : []);
        setHasMore(Boolean(payload?.hasMore));
        setNextOffset(Number.isFinite(Number(payload?.nextOffset)) ? Number(payload.nextOffset) : 0);
      } catch (err) {
        if (!mounted || controller.signal.aborted) return;
        setError('Could not load calls ledger.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; controller.abort(); };
  }, [sort, direction, refreshKey, dateRange.startDate, dateRange.endDate, callTypeFilter, deferredSearch]);

  const loadMore = React.useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(CALLS_LEDGER_PAGE_SIZE),
        offset: String(nextOffset),
        sort,
        direction,
        dateFrom: dateRange.startDate,
        dateTo: dateRange.endDate,
        callType: callTypeFilter,
        ...(deferredSearch ? { search: deferredSearch } : {}),
      });
      const response = await fetch(getApiUrl(`${CALLS_LEDGER_ENDPOINT}?${params}`), {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(String(payload?.error || 'load_more_failed'));
      const moreRows: CallsLedgerRow[] = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...moreRows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(Boolean(payload?.hasMore));
      setNextOffset(Number.isFinite(Number(payload?.nextOffset)) ? Number(payload.nextOffset) : nextOffset + moreRows.length);
    } catch {
      // non-blocking
    } finally {
      setLoadingMore(false);
    }
  }, [callTypeFilter, dateRange.endDate, dateRange.startDate, deferredSearch, direction, hasMore, loadingMore, nextOffset, sort]);

  // ── Theme tokens ──
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const surface = isDarkMode ? colours.dark.sectionBackground : withAlpha(colours.grey, 0.98);
  const cardSurface = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.98);
  const footerSurface = isDarkMode ? colours.websiteBlue : colours.grey;
  const controlSurface = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.42) : withAlpha(colours.light.cardBackground, 0.82);
  const selectedSurface = withAlpha(accent, isDarkMode ? 0.16 : 0.09);
  const border = isDarkMode ? withAlpha(colours.dark.borderColor, 0.38) : withAlpha(colours.greyText, 0.14);
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.greyText : colours.subtleGrey;

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    border: `1px solid ${border}`,
    backgroundColor: cardSurface,
    padding: '8px 10px',
  };

  const controlStyle: React.CSSProperties = {
    minHeight: 30,
    border: `1px solid ${border}`,
    backgroundColor: controlSurface,
    color: text,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.02em',
    lineHeight: 1.1,
    borderRadius: 0,
    boxSizing: 'border-box' as const,
  };

  const filterGroupStyle: React.CSSProperties = {
    display: 'inline-flex',
    minHeight: 30,
    border: `1px solid ${border}`,
    backgroundColor: controlSurface,
  };

  const filterBtnStyle = (active: boolean, last: boolean): React.CSSProperties => ({
    borderWidth: `0 ${last ? 0 : 1}px 0 0`,
    borderStyle: 'solid',
    borderColor: border,
    backgroundColor: active ? selectedSurface : 'transparent',
    color: active ? accent : muted,
    padding: '0 10px',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
  });

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    border: `1px solid ${border}`,
    background: controlSurface,
    color: text,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
  };

  const headerCellStyle: React.CSSProperties = {
    borderBottom: `1px solid ${border}`,
    padding: '8px 8px',
    textAlign: 'left',
    backgroundColor: footerSurface,
    color: muted,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    height: 36,
    verticalAlign: 'middle',
  };

  const headerBtnStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: active ? accent : muted,
    fontSize: 9,
    fontWeight: 800,
    fontFamily: 'Raleway, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    lineHeight: 1.1,
  });

  const cellStyle: React.CSSProperties = {
    padding: '7px 8px',
    fontSize: 10,
    fontWeight: 500,
    borderBottom: `1px solid ${withAlpha(border, 0.55)}`,
    verticalAlign: 'middle',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const handleSort = (key: CallsLedgerSortKey) => {
    if (key === sort) { setDirection((d) => d === 'desc' ? 'asc' : 'desc'); return; }
    setSort(key);
    setDirection('desc');
  };

  const renderSortHeader = (key: CallsLedgerSortKey, label: string) => {
    const active = sort === key;
    const marker = active ? (direction === 'desc' ? ' ↓' : ' ↑') : '';
    return (
      <th style={headerCellStyle}>
        <button type="button" style={headerBtnStyle(active)} onClick={() => handleSort(key)}>
          {label}{marker}
        </button>
      </th>
    );
  };

  const renderPlainHeader = (label: string) => (
    <th style={{ ...headerCellStyle, fontSize: 9, fontWeight: 800, fontFamily: 'Raleway, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {label}
    </th>
  );

  const sentimentDot = (s: ReturnType<typeof normaliseSentiment>) => {
    const colours_map = { positive: '#22c55e', negative: '#ef4444', neutral: '#9ca3af', none: '#9ca3af' };
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: colours_map[s.tone] }} />
        {s.label}
      </span>
    );
  };

  return (
    <section
      data-helix-region="reports/data-hub/calls-ledger"
      style={{
        marginTop: isFullPage ? 0 : 12,
        border: isFullPage ? 'none' : `1px solid ${border}`,
        background: surface,
        color: text,
        padding: isFullPage ? 0 : 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: isFullPage ? '100vh' : undefined,
        minHeight: isFullPage ? 0 : undefined,
      }}
    >
      {!isFullPage && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>Data Hub</p>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: text }}>Calls Ledger</h3>
          </div>
          <span style={pillStyle}>dubber_recordings</span>
        </div>
      )}

      {error && (
        <div style={{ border: `1px solid ${withAlpha(colours.cta, 0.45)}`, background: withAlpha(colours.cta, 0.12), color: text, padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div
        style={isFullPage
          ? { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 0, background: cardSurface, padding: '6px 8px 0' }
          : { display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${border}`, background: cardSurface, padding: 0, overflow: 'hidden' }}
      >
        {/* ── Toolbar ── */}
        <div style={toolbarStyle}>
          <label style={{ display: 'flex', alignItems: 'center', flex: '1 1 220px', minWidth: 140 }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, number, team"
              style={{ ...controlStyle, width: '100%', padding: '0 10px', minWidth: 0 }}
            />
          </label>

          <div style={filterGroupStyle}>
            {CALL_TYPE_FILTERS.map((opt, i, arr) => (
              <button
                key={opt.key}
                type="button"
                style={filterBtnStyle(callTypeFilter === opt.key, i === arr.length - 1)}
                onClick={() => setCallTypeFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as CallsDatePreset)}
            style={{ ...controlStyle, color: text, minWidth: 132, padding: '0 22px 0 8px' }}
          >
            {CALLS_DATE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>

          <span style={pillStyle}>{dateRange.startDate} to {dateRange.endDate}</span>

          <ColumnSelector
            columns={CALLS_LEDGER_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={handleToggleColumn}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
            onReset={handleReset}
            menuAlign="left"
          />

          {searchTerm.trim() && (
            <button type="button" onClick={() => setSearchTerm('')} style={{ ...controlStyle, padding: '0 10px', cursor: 'pointer', color: muted, textTransform: 'uppercase' }}>
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            style={{ ...controlStyle, padding: '0 10px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.55 : 1, color: accent, textTransform: 'uppercase' }}
          >
            {loading ? 'Loading' : 'Refresh'}
          </button>

          <span style={pillStyle}>{rows.length.toLocaleString('en-GB')} rows</span>
        </div>

        {/* ── Table ── */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: isFullPage ? '1 1 auto' : undefined, minHeight: isFullPage ? 0 : undefined, maxHeight: isFullPage ? undefined : '66vh', paddingBottom: 14, background: cardSurface }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, minWidth: tableMinWidth, background: cardSurface, color: text }}>
            <colgroup>
              {visibleCols.map((col) => (
                <col key={col.key} style={{ width: `${(CALLS_LEDGER_COLUMN_WEIGHTS[col.key as CallsLedgerColumnKey] / visibleCols.reduce((s, c) => s + CALLS_LEDGER_COLUMN_WEIGHTS[c.key as CallsLedgerColumnKey], 0)) * 100}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {isColumnVisible('date') && renderSortHeader('date', 'Date')}
                {isColumnVisible('type') && renderSortHeader('type', 'Type')}
                {isColumnVisible('from') && renderPlainHeader('From')}
                {isColumnVisible('to') && renderPlainHeader('To')}
                {isColumnVisible('duration') && renderSortHeader('duration', 'Duration')}
                {isColumnVisible('initials') && renderSortHeader('initials', 'Team')}
                {isColumnVisible('sentiment') && renderPlainHeader('Sentiment')}
                {isColumnVisible('channel') && renderPlainHeader('Channel')}
                {isColumnVisible('status') && renderPlainHeader('Status')}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {visibleCols.map((col) => (
                      <td key={col.key} style={{ ...cellStyle, background: withAlpha(border, 0.18) }}>
                        <span style={{ display: 'block', height: 10, width: '70%', background: withAlpha(border, 0.45), borderRadius: 2 }} />
                      </td>
                    ))}
                  </tr>
                ))
                : rows.map((row, i) => {
                  const sentimentInfo = normaliseSentiment(row.sentiment);
                  const callTypeColour = row.callType === 'inbound' ? (isDarkMode ? '#34d399' : '#059669') : row.callType === 'outbound' ? (isDarkMode ? '#60a5fa' : '#2563eb') : muted;
                  return (
                    <tr
                      key={row.id ?? `row-${i}`}
                      style={{ background: i % 2 === 0 ? cardSurface : withAlpha(border, 0.08) }}
                    >
                      {isColumnVisible('date') && (
                        <td style={cellStyle}>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 600 }}>{formatDisplayDate(row.startTime)}</span>
                            <span style={{ color: muted, fontSize: 9 }}>{formatDisplayTime(row.startTime)}</span>
                          </span>
                        </td>
                      )}
                      {isColumnVisible('type') && (
                        <td style={{ ...cellStyle, color: callTypeColour, fontWeight: 700, textTransform: 'capitalize' }}>
                          {row.callType || '--'}
                        </td>
                      )}
                      {isColumnVisible('from') && (
                        <td style={cellStyle} title={row.fromParty}>
                          {formatParty(row.fromLabel, row.fromParty)}
                        </td>
                      )}
                      {isColumnVisible('to') && (
                        <td style={cellStyle} title={row.toParty}>
                          {formatParty(row.toLabel, row.toParty)}
                        </td>
                      )}
                      {isColumnVisible('duration') && (
                        <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: row.durationSeconds != null && row.durationSeconds < 30 ? colours.cta : text }}>
                          {formatDuration(row.durationSeconds)}
                        </td>
                      )}
                      {isColumnVisible('initials') && (
                        <td style={{ ...cellStyle, fontWeight: 700, color: accent }}>
                          {row.teamInitials || '--'}
                        </td>
                      )}
                      {isColumnVisible('sentiment') && (
                        <td style={cellStyle}>
                          {sentimentDot(sentimentInfo)}
                        </td>
                      )}
                      {isColumnVisible('channel') && (
                        <td style={{ ...cellStyle, color: muted }}>
                          {row.channel || '--'}
                        </td>
                      )}
                      {isColumnVisible('status') && (
                        <td style={{ ...cellStyle, color: muted, textTransform: 'capitalize' }}>
                          {row.status || '--'}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {!loading && rows.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 12, fontWeight: 600, color: muted, border: `1px solid ${border}`, background: controlSurface }}>
              No calls found for this date range.
            </div>
          )}
        </div>

        {/* ── Load more ── */}
        {hasMore && !loading && (
          <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => { void loadMore(); }}
              disabled={loadingMore}
              style={{ ...controlStyle, padding: '0 14px', cursor: loadingMore ? 'wait' : 'pointer', opacity: loadingMore ? 0.55 : 1, color: accent, textTransform: 'uppercase' }}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
            <FontIcon iconName="ChevronDown" style={{ fontSize: 10, color: muted }} />
          </div>
        )}
      </div>
    </section>
  );
};

export default CallsLedger;
