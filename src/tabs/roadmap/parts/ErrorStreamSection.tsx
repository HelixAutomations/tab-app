// src/tabs/roadmap/parts/ErrorStreamSection.tsx — live error feed for Helix Eye

import React, { useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import type { ErrorEntry } from './ops-pulse-types';

interface Props {
  errors: ErrorEntry[];
  isDarkMode: boolean;
  highlightedTs?: number | null;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusBadge(status: number) {
  const bg = status >= 500 ? colours.cta : colours.orange;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 0, background: `${bg}22`, color: bg }}>
      {status}
    </span>
  );
}

const ErrorStreamSection: React.FC<Props> = ({ errors, isDarkMode, highlightedTs }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const [pathFilter, setPathFilter] = useState('');
  const filtered = useMemo(() => {
    const term = pathFilter.trim().toLowerCase();
    if (!term) return errors;
    return errors.filter(
      (e) =>
        (e.path || '').toLowerCase().includes(term) ||
        (e.message || '').toLowerCase().includes(term),
    );
  }, [errors, pathFilter]);
  const freshIds = useFreshIds(filtered, (err) => `${err.ts}-${err.path || ''}-${err.message}`);

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          Error Stream
        </span>
        {errors.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: `${colours.cta}25`, color: colours.cta, fontFamily: 'monospace' }}>
            {filtered.length}{filtered.length !== errors.length ? ` / ${errors.length}` : ''}
          </span>
        )}
        {errors.length > 0 && (
          <input
            type="search"
            value={pathFilter}
            onChange={(e) => setPathFilter(e.target.value)}
            placeholder="Filter by path or message"
            aria-label="Filter errors"
            style={{
              marginLeft: 'auto',
              minWidth: 180,
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'Raleway, sans-serif',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              background: isDarkMode ? 'rgba(255,255,255,0.04)' : '#fff',
              border: `1px solid ${borderCol}`,
              borderRadius: 0,
              outline: 'none',
            }}
          />
        )}
      </div>

      {errors.length === 0 ? (
        <div style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No errors — clean stream
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No errors match “{pathFilter}”.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
          {filtered.map((err, i) => {
            const freshKey = `${err.ts}-${err.path || ''}-${err.message}`;
            const highlighted = highlightedTs != null && err.ts === highlightedTs;
            return (
            <div
              key={`${err.ts}-${i}`}
              data-fresh={freshIds.has(freshKey) ? 'true' : undefined}
              data-highlighted={highlighted ? 'true' : undefined}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
                background: isDarkMode ? `${colours.cta}0D` : `${colours.cta}08`,
                borderLeft: `2px solid ${err.status >= 500 ? colours.cta : colours.orange}`,
                outline: highlighted ? `2px solid ${colours.cta}` : 'none',
                outlineOffset: highlighted ? -2 : 0,
              }}
            >
              {statusBadge(err.status)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {err.message}
                </div>
                <div style={{ fontSize: 10, color: colours.subtleGrey, marginTop: 2, fontFamily: 'monospace' }}>
                  {err.path || '—'}
                  {err.user && <span> · {err.user}</span>}
                  <span> · {timeAgo(err.ts)}</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ErrorStreamSection;
