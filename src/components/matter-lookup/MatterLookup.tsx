// invisible change
//
// Shared matter-lookup primitive.
//
// Promoted from the four inline copies scattered across the app
// (BundleForm, NotableCaseInfoForm, TransactionIntake, CallsAndNotes).
// Supports two modes:
//   • `matters` prop — filter a pre-fetched list locally (forms use case).
//   • `fetcher` prop — async live lookup with 300ms debounce and abort
//     on subsequent keystrokes (call-centre / AttendanceNoteBox use case).
//
// Default fetcher hits `/api/matters-unified?search=<q>&limit=20`, the same
// endpoint CallsAndNotes already uses. The primitive intentionally stays
// styleable via props (no hard theming) so each consumer can keep its own
// look while sharing the search + dropdown behaviour.
//
// Follow-ups (tracked in CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md):
//   - Swap the four inline copies over to this primitive.
//   - Keep `matter_ref = 'call:<dubberCallId>'` convention in consumers.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';

export interface MatterLookupOption {
  key: string;
  displayNumber: string;
  clientName?: string;
  description?: string;
  matterId?: string;
  source?: 'current' | 'legacy';
  // Raw payload so consumers can recover fields we haven't surfaced.
  raw?: unknown;
}

export interface MatterLookupProps {
  value: string;
  onChange: (term: string) => void;
  onSelect: (option: MatterLookupOption) => void;
  /** Local-filter mode: filter this list by displayNumber/clientName/description. */
  matters?: MatterLookupOption[];
  /** Async mode: called after `minChars` chars with 300ms debounce. */
  fetcher?: (q: string, signal: AbortSignal) => Promise<MatterLookupOption[]>;
  placeholder?: string;
  disabled?: boolean;
  isDarkMode?: boolean;
  minChars?: number;
  debounceMs?: number;
  maxResults?: number;
  /** Override endpoint when using the default fetcher. */
  endpoint?: string;
  /** Style overrides so each surface keeps its look. */
  inputStyle?: React.CSSProperties;
  dropdownStyle?: React.CSSProperties;
  rowStyle?: React.CSSProperties;
  className?: string;
}

const currentMattersEndpoint = '/api/matter-operations/search';
const legacyMattersEndpoint = '/api/outstanding-balances/matter-search';

function normalizeApiMatter(m: any): MatterLookupOption {
  return {
    key: m.displayNumber || m.display_number || m.matterId || m['Unique ID'] || '',
    displayNumber: m.displayNumber || m.display_number || m['Display Number'] || '',
    clientName: m.clientName || m.client_name || m['Client Name'] || '',
    description: m.description || m['Description'] || '',
    matterId: m.matterId || m['Unique ID'] || undefined,
    raw: m,
  };
}

async function defaultFetcher(q: string, signal: AbortSignal, endpoint: string, limit: number): Promise<MatterLookupOption[]> {
  const url = `${endpoint}?search=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = (data?.matters || data || []);
  return (Array.isArray(raw) ? raw : []).slice(0, limit).map(normalizeApiMatter);
}

function normalizeCurrentMatter(m: any): MatterLookupOption {
  return {
    key: m.DisplayNumber || m.displayNumber || m.display_number || m.MatterID || m.matterId || '',
    displayNumber: m.DisplayNumber || m.displayNumber || m.display_number || '',
    clientName: m.ClientName || m.clientName || m.client_name || '',
    description: m.Description || m.description || '',
    matterId: String(m.MatterID || m.matterId || m.matter_id || ''),
    source: 'current',
    raw: m,
  };
}

function normalizeLegacyMatter(m: any): MatterLookupOption {
  return {
    key: m.displayNumber || m.display_number || m.matterId || m.matter_id || '',
    displayNumber: m.displayNumber || m.display_number || '',
    clientName: m.clientName || m.client_name || '',
    description: m.description || '',
    matterId: String(m.matterId || m.matter_id || ''),
    source: 'legacy',
    raw: m,
  };
}

async function fetchCurrentMatters(q: string, signal: AbortSignal, endpoint: string, limit: number): Promise<MatterLookupOption[]> {
  const url = `${endpoint}?term=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = Array.isArray(data?.matters) ? data.matters : [];
  return raw.slice(0, limit).map(normalizeCurrentMatter).filter((item: MatterLookupOption) => item.displayNumber);
}

async function fetchLegacyMatters(q: string, signal: AbortSignal, limit: number): Promise<MatterLookupOption[]> {
  const url = `${legacyMattersEndpoint}?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = Array.isArray(data?.results) ? data.results : [];
  return raw.slice(0, limit).map(normalizeLegacyMatter).filter((item: MatterLookupOption) => item.displayNumber);
}

function filterLocal(matters: MatterLookupOption[], q: string, limit: number): MatterLookupOption[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return matters
    .filter(m =>
      (m.displayNumber || '').toLowerCase().includes(needle)
      || (m.clientName || '').toLowerCase().includes(needle)
      || (m.description || '').toLowerCase().includes(needle))
    .slice(0, limit);
}

export default function MatterLookup({
  value,
  onChange,
  onSelect,
  matters,
  fetcher,
  placeholder = 'Search matter by number, client, or description',
  disabled = false,
  isDarkMode = false,
  minChars = 2,
  debounceMs = 300,
  maxResults = 20,
  endpoint = currentMattersEndpoint,
  inputStyle,
  dropdownStyle,
  rowStyle,
  className,
}: MatterLookupProps) {
  const [results, setResults] = useState<MatterLookupOption[]>([]);
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestQueryRef = useRef<string>('');

  // Click-outside to close.
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Cleanup any in-flight fetch + timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    setIncludeLegacy(false);
    setLegacyAvailable(false);
  }, [value]);

  const resolvedFetcher = useMemo<MatterLookupProps['fetcher'] | null>(() => {
    if (fetcher) return fetcher;
    if (matters) return null; // local filter path
    return (q, signal) => defaultFetcher(q, signal, endpoint, maxResults);
  }, [fetcher, matters, endpoint, maxResults]);

  const runQuery = useCallback(async (q: string, options?: { includeLegacy?: boolean }) => {
    latestQueryRef.current = q;
    if (!q || q.trim().length < minChars) {
      setResults([]);
      setLoading(false);
      setLegacyAvailable(false);
      return;
    }
    const hasLocalMatters = Boolean(matters && !fetcher);
    if (hasLocalMatters) {
      const localResults = filterLocal(matters || [], q, maxResults);
      if (localResults.length > 0) {
        setResults(localResults);
        setLoading(false);
        setLegacyAvailable(false);
        return;
      }
    }
    if (hasLocalMatters && options?.includeLegacy !== true) {
      setResults([]);
      setLoading(false);
      setLegacyAvailable(true);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      if (fetcher && resolvedFetcher) {
        const next = await resolvedFetcher(q, controller.signal);
        if (latestQueryRef.current !== q) return;
        setResults(next);
        setLegacyAvailable(false);
        return;
      }

      if (!hasLocalMatters) {
        const currentResults = await fetchCurrentMatters(q, controller.signal, endpoint, maxResults);
        if (latestQueryRef.current !== q) return;
        if (currentResults.length > 0) {
          setResults(currentResults);
          setLegacyAvailable(false);
          return;
        }
      }

      const legacyResults = await fetchLegacyMatters(q, controller.signal, options?.includeLegacy ? maxResults : 1);
      if (latestQueryRef.current !== q) return;
      if (options?.includeLegacy) {
        setResults(legacyResults);
        setLegacyAvailable(false);
      } else {
        setResults([]);
        setLegacyAvailable(legacyResults.length > 0);
      }
    } catch {
      if (latestQueryRef.current !== q) return;
      setResults([]);
      setLegacyAvailable(false);
    } finally {
      if (latestQueryRef.current === q) setLoading(false);
    }
  }, [endpoint, fetcher, matters, maxResults, minChars, resolvedFetcher]);

  const handleChange = useCallback((val: string) => {
    onChange(val);
    setOpen(true);
    setActiveIndex(-1);
    setIncludeLegacy(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(val), debounceMs);
  }, [onChange, runQuery, debounceMs]);

  const handleLegacyReveal = useCallback(() => {
    const q = value.trim();
    if (!q || q.length < minChars) return;
    setIncludeLegacy(true);
    setOpen(true);
    setActiveIndex(-1);
    void runQuery(q, { includeLegacy: true });
  }, [minChars, runQuery, value]);

  const handleSelect = useCallback((option: MatterLookupOption) => {
    onSelect(option);
    onChange(option.displayNumber);
    setOpen(false);
    setActiveIndex(-1);
  }, [onSelect, onChange]);

  const handleKeyDown = useCallback((ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (ev.key === 'Enter' && activeIndex >= 0) {
      ev.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (ev.key === 'Escape') {
      setOpen(false);
    }
  }, [open, results, activeIndex, handleSelect]);

  const accent = isDarkMode ? '#87F3F3' : colours.highlight;
  const bg = isDarkMode ? 'rgba(8,28,48,0.92)' : '#ffffff';
  const border = isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(6,23,51,0.22)';
  const text = isDarkMode ? '#f3f4f6' : colours.light.text;
  const muted = isDarkMode ? '#A0A0A0' : '#6B6B6B';
  const rowHover = isDarkMode ? 'rgba(135,243,243,0.12)' : '#d6e8ff';
  const sourceChipBorder = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.14)';
  const sourceChipBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.03)';
  const shouldRenderDropdown = open && (value || '').trim().length >= minChars;
  const emptyMessage = includeLegacy ? 'No legacy matters found.' : 'No current matters found.';

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', fontFamily: 'Raleway, sans-serif' }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: bg,
          color: text,
          border: `1px solid ${border}`,
          borderRadius: 0,
          fontSize: 13,
          fontFamily: 'Raleway, sans-serif',
          outline: 'none',
          ...inputStyle,
        }}
      />
      {shouldRenderDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 1000,
            borderRadius: 0,
            ...dropdownStyle,
          }}
        >
          {loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: muted }}>Searching…</div>
          )}
          {!loading && results.length === 0 && legacyAvailable && (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: muted }}>No current matters found.</div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleLegacyReveal}
                style={{
                  alignSelf: 'flex-start',
                  padding: '5px 10px',
                  background: 'transparent',
                  border: `1px solid ${border}`,
                  color: accent,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'Raleway, sans-serif',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                Check legacy matters?
              </button>
            </div>
          )}
          {!loading && results.length === 0 && !legacyAvailable && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: muted }}>{emptyMessage}</div>
          )}
          {results.map((r, idx) => {
            const isActive = idx === activeIndex;
            const sourceLabel = r.source === 'legacy' ? 'Legacy' : 'Current';
            return (
              <div
                key={`${r.key}-${idx}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isActive ? rowHover : 'transparent',
                  borderTop: idx === 0 ? 'none' : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.06)'}`,
                  fontSize: 12,
                  color: text,
                  ...rowStyle,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: accent, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.displayNumber}</div>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      border: `1px solid ${sourceChipBorder}`,
                      background: sourceChipBg,
                      color: muted,
                      borderRadius: 0,
                    }}
                  >
                    {sourceLabel}
                  </span>
                </div>
                {(r.clientName || r.description) && (
                  <div style={{ fontSize: 11, color: muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.clientName}{r.clientName && r.description ? ' · ' : ''}{r.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
