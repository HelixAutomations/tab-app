// src/tabs/roadmap/parts/StashedBriefsTitlesPanel.tsx
//
// Slim briefs view used inside the Activity tab. Gated to the dev-owner
// (Luke) — defensive `isDevOwner` check inside the component so changes
// to upstream gating can't leak this surface.
//
// Shape:
//   - Header: count + "private to dev-owner" hint.
//   - Open briefs: title + status pill + age + branch + relationship counts
//     (depends/coordinates/conflicts). Click a row to expand and preview
//     the body (LZ-only — the whole panel is LZ-only).
//   - Archived footer: collapsed by default, titles + shipped_on only,
//     no body preview.
//
// What this deliberately does NOT do (vs the full StashedBriefsPanel):
//   - No edit dialog.
//   - No status-mutation buttons (verify/close).
//   - No "new brief" CTA.
// Those affordances live in the dedicated briefs panel surface, not in
// the always-on Activity tab.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';

interface Props {
  isDarkMode: boolean;
  initials: string | null;
  isDevOwner: boolean;
}

interface OpenBrief {
  id: string | null;
  title: string;
  status: string;
  ageDays: number | null;
  branch: string | null;
  depends_on: string[];
  coordinates_with: string[];
  conflicts_with: string[];
}

interface ArchivedBrief {
  id: string | null;
  title: string;
  shipped_on: string | null;
}

interface BriefDetail {
  id: string | null;
  title: string;
  content: string;
}

const STATUS_LABEL: Record<string, string> = {
  '🟡': 'Open',
  '⚪': 'Stale',
  '🟢': 'Done',
  '▶️': 'Ready',
};

const STATUS_COLOUR: Record<string, string> = {
  '🟡': colours.orange,
  '⚪': colours.greyText,
  '🟢': colours.green,
  '▶️': colours.highlight,
};

function normaliseSearch(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function openBriefSearchText(brief: OpenBrief): string {
  return [
    brief.title,
    brief.id,
    brief.status,
    STATUS_LABEL[brief.status],
    brief.branch,
    ...brief.depends_on,
    ...brief.coordinates_with,
    ...brief.conflicts_with,
  ].filter(Boolean).join(' ');
}

function archivedBriefSearchText(brief: ArchivedBrief): string {
  return [brief.title, brief.id, brief.shipped_on].filter(Boolean).join(' ');
}

const StashedBriefsTitlesPanel: React.FC<Props> = ({ isDarkMode, initials, isDevOwner }) => {
  const [openBriefs, setOpenBriefs] = useState<OpenBrief[]>([]);
  const [archived, setArchived] = useState<ArchivedBrief[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, BriefDetail | { error: string } | 'loading'>>({});

  // Defensive gate. Upstream FocalSurface also checks but a second gate
  // means changes to upstream gating can't leak this surface.
  const allowed = isDevOwner;

  const auth = initials ? `?initials=${encodeURIComponent(initials)}` : '';
  const authHeaders: Record<string, string> = initials ? { 'x-user-initials': initials } : {};

  useEffect(() => {
    if (!allowed) return;
    let disposed = false;

    (async () => {
      try {
        setLoading(true);
        const [openRes, archRes] = await Promise.all([
          fetch(`/api/stash-briefs${auth}`, { headers: authHeaders }),
          fetch(`/api/stash-briefs/archived${auth}`, { headers: authHeaders }),
        ]);
        if (disposed) return;
        if (!openRes.ok) throw new Error(`Open briefs HTTP ${openRes.status}`);
        const openJson = await openRes.json();
        const archJson = archRes.ok ? await archRes.json() : { items: [] };
        if (disposed) return;
        type ListItem = {
          id: string | null;
          title: string;
          status: string;
          ageDays: number | null;
          branch?: string | null;
          depends_on?: string[];
          coordinates_with?: string[];
          conflicts_with?: string[];
        };
        setOpenBriefs(
          (openJson.items || []).map((b: ListItem) => ({
            id: b.id,
            title: b.title,
            status: b.status,
            ageDays: b.ageDays,
            branch: b.branch || null,
            depends_on: b.depends_on || [],
            coordinates_with: b.coordinates_with || [],
            conflicts_with: b.conflicts_with || [],
          })),
        );
        setArchived(archJson.items || []);
        setError(null);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Failed to load briefs');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, initials]);

  const toggleExpand = useCallback(
    (briefId: string | null) => {
      if (!briefId) return;
      setExpandedId((prev) => (prev === briefId ? null : briefId));
      // Lazy-load the body on first expand. Cached in `details` after.
      if (!details[briefId]) {
        setDetails((prev) => ({ ...prev, [briefId]: 'loading' }));
        (async () => {
          try {
            const res = await fetch(`/api/stash-briefs/${encodeURIComponent(briefId)}${auth}`, { headers: authHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as BriefDetail;
            setDetails((prev) => ({ ...prev, [briefId]: json }));
          } catch (err) {
            setDetails((prev) => ({ ...prev, [briefId]: { error: err instanceof Error ? err.message : 'Failed to load' } }));
          }
        })();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [details, auth, initials],
  );

  const searchTerm = normaliseSearch(searchQuery);
  const isSearching = searchTerm.length > 0;
  const filteredOpenBriefs = useMemo(
    () => (isSearching
      ? openBriefs.filter((brief) => normaliseSearch(openBriefSearchText(brief)).includes(searchTerm))
      : openBriefs),
    [isSearching, openBriefs, searchTerm],
  );
  const filteredArchived = useMemo(
    () => (isSearching
      ? archived.filter((brief) => normaliseSearch(archivedBriefSearchText(brief)).includes(searchTerm))
      : archived),
    [archived, isSearching, searchTerm],
  );
  const hasAnySearchMatch = filteredOpenBriefs.length > 0 || filteredArchived.length > 0;
  const showArchivedFooter = !loading && !error && archived.length > 0 && (!isSearching || filteredArchived.length > 0);
  const showArchivedRows = archivedExpanded || isSearching;

  if (!allowed) {
    return (
      <div
        style={{
          padding: 20,
          border: `1px dashed ${isDarkMode ? colours.dark.border : colours.light.border}`,
          color: isDarkMode ? colours.subtleGrey : colours.greyText,
          fontSize: 13,
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        Briefs are visible to the dev-owner only.
      </div>
    );
  }

  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const previewBg = isDarkMode ? 'rgba(0,0,0,0.25)' : '#fafbfc';

  return (
    <div
      data-helix-region="system/briefs"
      style={{
        padding: '14px 16px',
        background: bg,
        border: `1px solid ${borderCol}`,
        borderRadius: 0,
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: textColour,
          }}
        >
          Stashed briefs
        </span>
        {!loading && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 0,
              background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
              color: muted,
              fontFamily: 'monospace',
            }}
          >
            {openBriefs.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: muted, fontStyle: 'italic' }}>
          private — dev-owner only
        </span>
      </div>

      {!loading && !error && (openBriefs.length > 0 || archived.length > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 34,
            padding: '6px 10px',
            marginBottom: 10,
            border: `1px solid ${borderCol}`,
            background: isDarkMode ? 'rgba(255,255,255,0.03)' : colours.grey,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              color: isDarkMode ? colours.accent : colours.highlight,
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ⌕
          </span>
          <input
            type="search"
            aria-label="Search stashed briefs"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search briefs"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: textColour,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          />
          {isSearching && (
            <>
              <span style={{ fontSize: 10, color: muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {filteredOpenBriefs.length}/{openBriefs.length} open
                {filteredArchived.length > 0 ? ` + ${filteredArchived.length} archived` : ''}
              </span>
              <button
                type="button"
                aria-label="Clear brief search"
                title="Clear search"
                onClick={() => setSearchQuery('')}
                style={{
                  width: 22,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${borderCol}`,
                  background: 'transparent',
                  color: muted,
                  cursor: 'pointer',
                  borderRadius: 0,
                  fontFamily: 'Raleway, sans-serif',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}

      {loading && <div style={{ fontSize: 12, color: muted }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: colours.cta }}>{error}</div>}

      {!loading && !error && !isSearching && openBriefs.length === 0 && (
        <div style={{ fontSize: 12, color: muted, padding: '8px 0' }}>No open briefs.</div>
      )}

      {!loading && !error && isSearching && !hasAnySearchMatch && (
        <div style={{ fontSize: 12, color: muted, padding: '8px 0' }}>No briefs match "{searchQuery.trim()}".</div>
      )}

      {!loading && !error && filteredOpenBriefs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredOpenBriefs.map((b) => {
            const sCol = STATUS_COLOUR[b.status] || colours.subtleGrey;
            const expanded = expandedId === b.id;
            const detail = b.id ? details[b.id] : null;
            const hasRelations =
              b.depends_on.length > 0 || b.coordinates_with.length > 0 || b.conflicts_with.length > 0;

            return (
              <div key={b.id || b.title} style={{ borderTop: `1px solid ${borderCol}` }}>
                <button
                  type="button"
                  onClick={() => toggleExpand(b.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 10px',
                    width: '100%',
                    background: expanded
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.05)' : `${colours.highlightBlue}55`)
                      : 'transparent',
                    border: 'none',
                    cursor: b.id ? 'pointer' : 'default',
                    textAlign: 'left',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: muted,
                      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                      display: 'inline-block',
                      marginTop: 4,
                      opacity: b.id ? 0.7 : 0.2,
                      flexShrink: 0,
                    }}
                  >
                    ▶
                  </span>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: sCol,
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: textColour,
                        lineHeight: 1.4,
                        letterSpacing: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.title}
                    </div>
                    {/* Subtext: status / age / branch / relationship counts */}
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 10,
                        color: muted,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        fontFamily: 'monospace',
                      }}
                    >
                      <span
                        style={{
                          color: sCol,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                        }}
                      >
                        {STATUS_LABEL[b.status] || 'Open'}
                      </span>
                      {b.ageDays != null && <span>{b.ageDays}d old</span>}
                      {b.branch && (
                        <span>
                          branch: <span style={{ color: bodyText }}>{b.branch}</span>
                        </span>
                      )}
                      {hasRelations && (
                        <>
                          {b.depends_on.length > 0 && (
                            <span title={b.depends_on.join(', ')}>↳ depends ×{b.depends_on.length}</span>
                          )}
                          {b.coordinates_with.length > 0 && (
                            <span title={b.coordinates_with.join(', ')} style={{ color: colours.highlight }}>
                              ↔ coord ×{b.coordinates_with.length}
                            </span>
                          )}
                          {b.conflicts_with.length > 0 && (
                            <span title={b.conflicts_with.join(', ')} style={{ color: colours.cta, fontWeight: 700 }}>
                              ✕ conflict ×{b.conflicts_with.length}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {b.id && (
                    <span
                      style={{
                        fontSize: 9,
                        color: muted,
                        fontFamily: 'monospace',
                        flexShrink: 0,
                        opacity: 0.6,
                        marginTop: 4,
                      }}
                    >
                      {b.id}
                    </span>
                  )}
                </button>

                {expanded && b.id && (
                  <div
                    style={{
                      padding: '10px 14px 14px 33px',
                      background: previewBg,
                      borderTop: `1px solid ${borderCol}`,
                    }}
                  >
                    {detail === 'loading' && <div style={{ fontSize: 11, color: muted }}>Loading brief…</div>}
                    {detail && typeof detail === 'object' && 'error' in detail && (
                      <div style={{ fontSize: 11, color: colours.cta }}>{detail.error}</div>
                    )}
                    {detail && typeof detail === 'object' && 'content' in detail && (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: bodyText,
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 480,
                          overflow: 'auto',
                        }}
                      >
                        {detail.content}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Archived footer — collapsed by default, titles + shipped date only */}
      {showArchivedFooter && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${borderCol}` }}>
          <button
            type="button"
            onClick={() => setArchivedExpanded((v) => !v)}
            aria-expanded={showArchivedRows}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
              color: muted,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                fontSize: 9,
                opacity: 0.6,
                transform: showArchivedRows ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            >
              ▶
            </span>
            Archived
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
                color: muted,
                fontFamily: 'monospace',
              }}
            >
              {isSearching ? `${filteredArchived.length}/${archived.length}` : archived.length}
            </span>
          </button>

          {showArchivedRows && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 6 }}>
              {filteredArchived.map((b) => (
                <div
                  key={b.id || b.title}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderTop: `1px solid ${borderCol}`,
                    opacity: 0.75,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: colours.green,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: muted,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.title}
                  </span>
                  {b.shipped_on && (
                    <span style={{ fontSize: 10, color: muted, fontFamily: 'monospace', flexShrink: 0 }}>
                      {b.shipped_on}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StashedBriefsTitlesPanel;
