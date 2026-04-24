// invisible change
//
// ProspectLookup — live dropdown for enquiry/prospect lookup, mirroring the
// look and feel of MatterLookup but driven by `/api/people-search`.
//
// Two-stage dual-DB flow (matches the "check new first, then legacy on
// confirm" rule from the call filing workspace):
//   1. Stage 1 shows only Instructions-DB results (`_src === 'instructions'`).
//   2. If Stage 1 returns nothing, render a subtle "Check legacy records?"
//      affordance under the empty state. Clicking it re-queries and shows
//      legacy rows with a muted "Legacy" chip.
//
// The component is presentational + self-contained; the host owns the
// selected option.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';

export interface ProspectLookupOption {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aow: string;
  /** 'instructions' (new DB) or 'legacy' (core-data enquiries). */
  source: 'instructions' | 'legacy';
  raw?: unknown;
}

export interface ProspectLookupProps {
  value: string;
  onChange: (term: string) => void;
  onSelect: (opt: ProspectLookupOption) => void;
  isDarkMode?: boolean;
  disabled?: boolean;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  minChars?: number;
  debounceMs?: number;
  maxResults?: number;
  endpoint?: string;
}

const defaultEndpoint = '/api/people-search';

interface ApiResult {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  aow: string;
  _src: 'instructions' | 'legacy';
}

async function fetchPeople(q: string, signal: AbortSignal, endpoint: string): Promise<ProspectLookupOption[]> {
  const url = `${endpoint}?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const raw: ApiResult[] = Array.isArray(data?.results) ? data.results : [];
  return raw.map((r) => ({
    id: Number.parseInt(r.id, 10),
    firstName: r.first || '',
    lastName: r.last || '',
    email: r.email || '',
    phone: r.phone || '',
    aow: r.aow || '',
    source: r._src === 'legacy' ? 'legacy' : 'instructions',
    raw: r,
  })).filter((r) => Number.isFinite(r.id) && r.id > 0);
}

export default function ProspectLookup({
  value,
  onChange,
  onSelect,
  isDarkMode = false,
  disabled = false,
  placeholder = 'Search by name, email or phone…',
  inputStyle,
  minChars = 2,
  debounceMs = 300,
  maxResults = 20,
  endpoint = defaultEndpoint,
}: ProspectLookupProps) {
  const [results, setResults] = useState<ProspectLookupOption[]>([]);
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestQueryRef = useRef<string>('');

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const runQuery = useCallback((q: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    latestQueryRef.current = q;
    setLoading(true);
    fetchPeople(q, ctrl.signal, endpoint)
      .then((rows) => {
        if (latestQueryRef.current !== q) return;
        setResults(rows.slice(0, maxResults));
      })
      .catch(() => { /* aborted or failed */ })
      .finally(() => {
        if (latestQueryRef.current === q) setLoading(false);
      });
  }, [endpoint, maxResults]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => runQuery(trimmed), debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, minChars, debounceMs, runQuery]);

  // Reset legacy visibility whenever the search term changes.
  useEffect(() => { setIncludeLegacy(false); }, [value]);

  const visible = useMemo(() => {
    if (includeLegacy) return results;
    return results.filter((r) => r.source === 'instructions');
  }, [results, includeLegacy]);

  const legacyAvailable = useMemo(
    () => !includeLegacy && !loading && results.some((r) => r.source === 'legacy') && visible.length === 0,
    [includeLegacy, loading, results, visible.length],
  );

  const accent = isDarkMode ? '#87F3F3' : colours.highlight;
  const panelBg = isDarkMode ? 'rgba(8,28,48,0.98)' : '#ffffff';
  const panelBorder = isDarkMode ? 'rgba(75,85,99,0.55)' : 'rgba(6,23,51,0.15)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)';
  const text = isDarkMode ? '#f3f4f6' : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? '#A0A0A0' : '#6B6B6B';
  const inputBg = isDarkMode ? 'rgba(5,21,37,0.9)' : '#ffffff';
  const inputBorder = isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(6,23,51,0.22)';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min((visible.length - 1), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < visible.length) {
        e.preventDefault();
        handlePick(visible[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handlePick = (opt: ProspectLookupOption) => {
    onSelect(opt);
    onChange(`${opt.firstName} ${opt.lastName}`.trim() || opt.email || String(opt.id));
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          width: '100%',
          fontSize: 13,
          padding: '9px 12px',
          background: inputBg,
          border: `1px solid ${inputBorder}`,
          color: text,
          fontFamily: 'Raleway, sans-serif',
          borderRadius: 0,
          outline: 'none',
          ...inputStyle,
        }}
      />
      {open && value.trim().length >= minChars && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 60,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: muted }}>Searching…</div>
          )}
          {!loading && visible.length === 0 && !legacyAvailable && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: muted }}>
              No matches in current records.
            </div>
          )}
          {!loading && visible.length === 0 && legacyAvailable && (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: muted }}>No matches in current records.</div>
              <button
                type="button"
                onClick={() => setIncludeLegacy(true)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '5px 10px',
                  background: 'transparent',
                  border: `1px solid ${inputBorder}`,
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
                Check legacy records?
              </button>
            </div>
          )}
          {!loading && visible.map((opt, i) => {
            const active = i === activeIndex;
            const isLegacy = opt.source === 'legacy';
            const fullName = `${opt.firstName} ${opt.lastName}`.trim() || '(unnamed)';
            return (
              <div
                key={`${opt.source}:${opt.id}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); handlePick(opt); }}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${rowBorder}`,
                  background: active ? (isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(13,47,96,0.05)') : 'transparent',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  columnGap: 8,
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: text, fontWeight: 600 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</span>
                    <span style={{ fontSize: 10, color: muted, fontWeight: 400 }}>#{opt.id}</span>
                  </div>
                  <div style={{ fontSize: 10, color: bodyText, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.aow || '—'}{opt.email ? ` · ${opt.email}` : ''}{!opt.email && opt.phone ? ` · ${opt.phone}` : ''}
                  </div>
                </div>
                {isLegacy && (
                  <span
                    title="From legacy enquiries database"
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      border: `1px solid ${muted}`,
                      color: muted,
                      borderRadius: 0,
                      flexShrink: 0,
                    }}
                  >
                    Legacy
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
