// src/tabs/roadmap/parts/DoubledApiSection.tsx — `/api/api/*` regression feed
//
// Sibling to ErrorStreamSection. Renders the time-bounded buffer maintained by
// `server/routes/ops-pulse.js` (createOpsPulseChannel). Surfaces the originating
// page (referer) so the operator can trace which client built the bad URL —
// the natural root-cause question when this regression class fires.

import React from 'react';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import type { DoubledApiHit } from './ops-pulse-types';

interface Props {
  hits: DoubledApiHit[];
  isDarkMode: boolean;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function refererLabel(referer: string): string {
  if (!referer) return '';
  try {
    const u = new URL(referer);
    return u.pathname + (u.hash || '');
  } catch {
    return referer.slice(0, 60);
  }
}

const DoubledApiSection: React.FC<Props> = ({ hits, isDarkMode }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const freshIds = useFreshIds(hits, (h) => `${h.ts}-${h.originalPath}`);

  // Aggregate by originating page — answers "which client component built the bad URL?"
  const topReferers = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) {
      const key = refererLabel(h.referer) || '(unknown)';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [hits]);

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          Doubled /api/api/ hits
        </span>
        {hits.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: `${colours.cta}25`, color: colours.cta, fontFamily: 'monospace' }}>
            {hits.length}
          </span>
        )}
        <span style={{ fontSize: 10, color: muted, fontFamily: 'Raleway, sans-serif', marginLeft: 'auto' }}>
          15 min window
        </span>
      </div>

      {hits.length === 0 ? (
        <div style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No regressions — proxy guard quiet
        </div>
      ) : (
        <>
          {topReferers.length > 0 && (
            <div style={{ marginBottom: 8, padding: '6px 8px', background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', fontSize: 11, fontFamily: 'Raleway, sans-serif', color: muted }}>
              <span style={{ fontWeight: 700, marginRight: 6 }}>Top sources:</span>
              {topReferers.map(([page, count], i) => (
                <span key={page} style={{ marginRight: 10 }}>
                  {i > 0 && <span style={{ marginRight: 10, opacity: 0.4 }}>·</span>}
                  <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'monospace' }}>{page}</span>
                  <span style={{ marginLeft: 4, color: colours.cta, fontWeight: 700 }}>×{count}</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
            {hits.map((hit, i) => {
              const freshKey = `${hit.ts}-${hit.originalPath}`;
              return (
                <div
                  key={`${hit.ts}-${i}`}
                  data-fresh={freshIds.has(freshKey) ? 'true' : undefined}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
                    background: isDarkMode ? `${colours.cta}0D` : `${colours.cta}08`,
                    border: `1px solid ${colours.cta}33`,
                    borderRadius: 0,
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '1px 5px', background: `${colours.cta}22`, color: colours.cta }}>
                    {hit.method}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {hit.originalPath}
                    </div>
                    <div style={{ fontSize: 10, color: muted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>→ {hit.suggestedPath}</span>
                      {hit.referer && <span>· from {refererLabel(hit.referer)}</span>}
                      <span>· {timeAgo(hit.ts)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default DoubledApiSection;
