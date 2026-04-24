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

const defaultEndpoint = '/api/matters-unified';

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
  endpoint = defaultEndpoint,
  inputStyle,
  dropdownStyle,
  rowStyle,
  className,
}: MatterLookupProps) {
  const [results, setResults] = useState<MatterLookupOption[]>([]);
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

  const resolvedFetcher = useMemo<MatterLookupProps['fetcher'] | null>(() => {
    if (fetcher) return fetcher;
    if (matters) return null; // local filter path
    return (q, signal) => defaultFetcher(q, signal, endpoint, maxResults);
  }, [fetcher, matters, endpoint, maxResults]);

  const runQuery = useCallback((q: string) => {
    latestQueryRef.current = q;
    if (!q || q.trim().length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }
    // Local-filter path.
    if (matters && !fetcher) {
      setResults(filterLocal(matters, q, maxResults));
      setLoading(false);
      return;
    }
    if (!resolvedFetcher) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    resolvedFetcher(q, controller.signal)
      .then(next => {
        // Late responses for stale queries: drop.
        if (latestQueryRef.current !== q) return;
        setResults(next);
      })
      .catch(() => { /* silent: abort or network */ })
      .finally(() => {
        if (latestQueryRef.current === q) setLoading(false);
      });
  }, [fetcher, matters, maxResults, minChars, resolvedFetcher]);

  const handleChange = useCallback((val: string) => {
    onChange(val);
    setOpen(true);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(val), debounceMs);
  }, [onChange, runQuery, debounceMs]);

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
      {open && (value || '').trim().length >= minChars && (loading || results.length > 0) && (
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
          {results.map((r, idx) => {
            const isActive = idx === activeIndex;
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
                <div style={{ fontWeight: 600, color: accent, fontSize: 12 }}>{r.displayNumber}</div>
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
