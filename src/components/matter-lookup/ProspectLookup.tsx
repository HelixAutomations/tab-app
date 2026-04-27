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
import { createPortal } from 'react-dom';
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
  /** Optional recent enquiries to surface when the input is empty/short. */
  recents?: ProspectLookupOption[];
  recentsLabel?: string;
  recentsLimit?: number;
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

interface ProspectLookupResponse {
  results: ProspectLookupOption[];
  legacyAvailable: boolean;
}

async function fetchPeople(q: string, signal: AbortSignal, endpoint: string, limit: number, includeLegacy = false): Promise<ProspectLookupResponse> {
  const url = `${endpoint}?q=${encodeURIComponent(q)}&mode=staged&limit=${limit}${includeLegacy ? '&includeLegacy=true' : ''}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return { results: [], legacyAvailable: false };
  const data = await res.json();
  const raw: ApiResult[] = Array.isArray(data?.results) ? data.results : [];
  return {
    results: raw.map((r) => ({
      id: Number.parseInt(r.id, 10),
      firstName: r.first || '',
      lastName: r.last || '',
      email: r.email || '',
      phone: r.phone || '',
      aow: r.aow || '',
      source: r._src === 'legacy' ? 'legacy' as const : 'instructions' as const,
      raw: r,
    })).filter((r) => Number.isFinite(r.id) && r.id > 0),
    legacyAvailable: Boolean(data?.legacyAvailable),
  };
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
  recents,
  recentsLabel = 'Recent enquiries',
  recentsLimit = 6,
}: ProspectLookupProps) {
  const [results, setResults] = useState<ProspectLookupOption[]>([]);
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestQueryRef = useRef<string>('');

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const runQuery = useCallback((q: string, showLegacy = false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    latestQueryRef.current = q;
    setLoading(true);
    fetchPeople(q, ctrl.signal, endpoint, maxResults, showLegacy)
      .then((payload) => {
        if (latestQueryRef.current !== q) return;
        setResults(payload.results.slice(0, maxResults));
        setLegacyAvailable(payload.legacyAvailable);
      })
      .catch(() => {
        if (latestQueryRef.current !== q) return;
        setResults([]);
        setLegacyAvailable(false);
      })
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
      setLegacyAvailable(false);
      return;
    }
    debounceRef.current = setTimeout(() => runQuery(trimmed, false), debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, minChars, debounceMs, runQuery]);

  // Reset legacy visibility whenever the search term changes.
  useEffect(() => {
    setIncludeLegacy(false);
    setLegacyAvailable(false);
  }, [value]);

  const accent = isDarkMode ? '#87F3F3' : colours.highlight;
  const panelBg = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const panelBorder = isDarkMode ? `rgba(135, 243, 243, 0.22)` : `rgba(13, 47, 96, 0.22)`;
  const rowBorder = isDarkMode ? `rgba(135, 243, 243, 0.08)` : `rgba(13, 47, 96, 0.06)`;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const eyebrowBg = isDarkMode ? colours.darkBlue : colours.grey;
  const inputBg = isDarkMode ? 'rgba(5,21,37,0.9)' : '#ffffff';
  const inputBorder = isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(6,23,51,0.22)';
  const sourceChipBorder = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.14)';
  const sourceChipBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.03)';
  const dividerColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
  const recentsList = useMemo<ProspectLookupOption[]>(() => {
    if (!recents || recents.length === 0) return [];
    const seen = new Set<string>();
    const cleaned: ProspectLookupOption[] = [];
    for (const r of recents) {
      const key = `${r.source || 'instructions'}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(r);
      if (cleaned.length >= recentsLimit) break;
    }
    return cleaned;
  }, [recents, recentsLimit]);
  const trimmedValue = (value || '').trim();
  const showRecentsOnly = open && trimmedValue.length < minChars && recentsList.length > 0;
  const shouldRenderDropdown = (open && trimmedValue.length >= minChars) || showRecentsOnly;

  // Track input rect so the portalled dropdown follows the input.
  useEffect(() => {
    if (!shouldRenderDropdown) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchorRect({ top: r.bottom + 2, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [shouldRenderDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min((results.length - 1), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        handlePick(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleLegacyReveal = () => {
    const trimmed = value.trim();
    if (trimmed.length < minChars) return;
    setIncludeLegacy(true);
    setActiveIndex(-1);
    setOpen(true);
    runQuery(trimmed, true);
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
        ref={inputRef}
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
      {shouldRenderDropdown && anchorRect && typeof document !== 'undefined' && createPortal((
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: anchorRect.top,
            left: anchorRect.left,
            width: anchorRect.width,
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 10000,
            boxShadow: isDarkMode ? '0 12px 32px rgba(0, 3, 25, 0.55)' : '0 12px 32px rgba(13, 47, 96, 0.18)',
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          {showRecentsOnly && (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, background: eyebrowBg, borderBottom: `1px solid ${rowBorder}` }}>{recentsLabel}</div>
              {recentsList.map((opt) => {
                const fullName = `${opt.firstName} ${opt.lastName}`.trim() || '(unnamed)';
                return (
                  <div
                    key={`recent-${opt.source}:${opt.id}`}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); handlePick(opt); }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${rowBorder}`,
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr)',
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
                  </div>
                );
              })}
            </>
          )}
          {!showRecentsOnly && loading && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: muted }}>Searching…</div>
          )}
          {!showRecentsOnly && !loading && results.length === 0 && !legacyAvailable && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: muted }}>
              {includeLegacy ? 'No legacy enquiries found.' : 'No matches in current records.'}
            </div>
          )}
          {!showRecentsOnly && !loading && results.length === 0 && legacyAvailable && (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: muted }}>No matches in current records.</div>
              <button
                type="button"
                onClick={handleLegacyReveal}
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
          {!showRecentsOnly && !loading && results.map((opt, i) => {
            const active = i === activeIndex;
            const sourceLabel = opt.source === 'legacy' ? 'Legacy' : 'Current';
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
                <span
                  title={opt.source === 'legacy' ? 'From legacy enquiries database' : 'From current instructions enquiries'}
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    border: `1px solid ${sourceChipBorder}`,
                    background: sourceChipBg,
                    color: muted,
                    borderRadius: 0,
                    flexShrink: 0,
                  }}
                >
                  {sourceLabel}
                </span>
              </div>
            );
          })}
          {!showRecentsOnly && results.length > 0 && recentsList.length > 0 && (
            <>
              <div style={{ padding: '8px 12px 4px', marginTop: 4, borderTop: `1px solid ${dividerColor}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, background: eyebrowBg }}>{recentsLabel}</div>
              {recentsList.map((opt) => {
                const fullName = `${opt.firstName} ${opt.lastName}`.trim() || '(unnamed)';
                return (
                  <div
                    key={`recent-tail-${opt.source}:${opt.id}`}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); handlePick(opt); }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${rowBorder}`,
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr)',
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
                  </div>
                );
              })}
            </>
          )}
        </div>
      ), document.body)}
    </div>
  );
}
