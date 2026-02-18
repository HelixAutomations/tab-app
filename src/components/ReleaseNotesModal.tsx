import React, { useEffect, useMemo, useState } from 'react';
import { Modal, IconButton, Spinner } from '@fluentui/react';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

/* --- Types --- */

type ReleaseEntry = {
  date: string;
  title: string;
  details?: string;
  category: 'feature' | 'improvement' | 'fix' | 'ops';
  idx: number;
};

type ReleaseGroup = {
  label: string;
  version: string;
  monthKey: string;
  entries: ReleaseEntry[];
};

/* --- Category detection --- */

const CATEGORY_KEYWORDS: Record<Exclude<ReleaseEntry['category'], 'feature'>, RegExp> = {
  fix: /\bfix(ed|es|ing)?\b|\bbug\b|\bpatch\b|\bharden(ed|ing)?\b|\bfallback\b|\bstabil/i,
  ops: /\btelemetry\b|\bapp\s*insights\b|\bscheduler\b|\bdeploy\b|\bops\b|\bmigrat/i,
  improvement: /\boptimis|refactor|clean|performance|simplif|redesign|improv|enrich|enhanc|inline|converge|consolidat/i,
};

function detectCategory(title: string, details?: string): ReleaseEntry['category'] {
  const hay = `${title} ${details || ''}`;
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<ReleaseEntry['category'], 'feature'>, RegExp][]) {
    if (re.test(hay)) return cat;
  }
  return 'feature';
}

const CATEGORY_META: Record<ReleaseEntry['category'], { label: string; colour: string }> = {
  feature:     { label: 'New',             colour: '#10b981' },
  improvement: { label: 'Improved',        colour: '#60a5fa' },
  fix:         { label: 'Fixed',           colour: '#f59e0b' },
  ops:         { label: 'Under the hood',  colour: '#8b5cf6' },
};

/* --- Parser --- */

function parseChangelog(markdown: string): ReleaseEntry[] {
  const lines = markdown.split('\n');
  const entries: ReleaseEntry[] = [];

  lines.forEach((line, idx) => {
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*([^/]+?)(?:\s*\/\s*(.*))?\s*$/);
    if (!match) return;
    const date = match[1];
    const title = (match[2] || '').trim();
    const details = (match[3] || '').trim() || undefined;
    if (!title) return;
    entries.push({ date, title, details, category: detectCategory(title, details), idx });
  });

  entries.sort((a, b) => (a.date === b.date ? a.idx - b.idx : a.date < b.date ? 1 : -1));
  return entries;
}

function groupByMonth(entries: ReleaseEntry[]): ReleaseGroup[] {
  const map = new Map<string, ReleaseEntry[]>();
  for (const e of entries) {
    const monthKey = e.date.slice(0, 7);
    const list = map.get(monthKey) ?? [];
    list.push(e);
    map.set(monthKey, list);
  }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
  return keys.map(k => {
    const [y, m] = k.split('-');
    const version = `v${y}.${parseInt(m, 10)}`;
    return { monthKey: k, version, label: `${MONTHS[parseInt(m, 10) - 1]} ${y}`, entries: map.get(k) ?? [] };
  });
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

/* --- Theme helper --- */

type Theme = {
  bg: string; surface: string; text: string;
  muted: string; border: string; accent: string; hover: string;
};

/* --- Sub-components --- */

const FilterChip: React.FC<{
  label: string; count: number; active: boolean; colour: string;
  theme: Theme; onClick: () => void;
}> = ({ label, count, active, colour, theme, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 10px',
      borderRadius: 999,
      border: `1px solid ${active ? colour : theme.border}`,
      background: active ? `${colour}18` : 'transparent',
      color: active ? colour : theme.muted,
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.15s',
      letterSpacing: '0.2px',
    }}
  >
    {label}
    <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{count}</span>
  </button>
);

const EntryRow: React.FC<{ entry: ReleaseEntry; theme: Theme }> = ({ entry, theme }) => {
  const meta = CATEGORY_META[entry.category];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: hovered ? theme.hover : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <div style={{
        width: 7, height: 7, borderRadius: 999,
        background: meta.colour, marginTop: 5, flexShrink: 0,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: theme.text,
          lineHeight: 1.4, letterSpacing: '-0.1px',
        }}>
          {entry.title}
        </div>
        <div style={{
          fontSize: 11, color: theme.muted, marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>{formatDate(entry.date)}</span>
          <span style={{
            fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.4px', color: meta.colour, opacity: 0.85,
          }}>
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
};

/* --- Main component --- */

const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose, isDarkMode = false }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReleaseEntry['category'] | 'all'>('all');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/release-notes');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setContent(await res.text());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const allEntries = useMemo(() => parseChangelog(content), [content]);
  const filtered = useMemo(() => filter === 'all' ? allEntries : allEntries.filter(e => e.category === filter), [allEntries, filter]);
  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  // Auto-expand newest month
  useEffect(() => {
    if (!isOpen || !groups.length) return;
    setExpandedMonth(prev => prev || groups[0].monthKey);
  }, [groups, isOpen]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) { setFilter('all'); setExpandedMonth(null); }
  }, [isOpen]);

  const t: Theme = {
    bg:      isDarkMode ? '#0f172a' : '#ffffff',
    surface: isDarkMode ? '#1e293b' : '#f8fafc',
    text:    isDarkMode ? '#f1f5f9' : '#0f172a',
    muted:   isDarkMode ? '#94a3b8' : '#64748b',
    border:  isDarkMode ? '#334155' : '#e2e8f0',
    accent:  isDarkMode ? '#60a5fa' : '#3690CE',
    hover:   isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
  };

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { feature: 0, improvement: 0, fix: 0, ops: 0 };
    allEntries.forEach(e => c[e.category]++);
    return c;
  }, [allEntries]);

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      isBlocking={false}
      styles={{
        main: {
          width: '94vw', height: '90vh', maxWidth: 720, maxHeight: 860,
          padding: 0, background: t.bg, borderRadius: 12, overflow: 'hidden',
          boxShadow: isDarkMode ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(15,23,42,0.12)',
        },
        scrollableContent: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text, letterSpacing: '-0.3px' }}>
                Release Notes
              </h2>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>
                {groups.length > 0 ? `Latest: ${groups[0].version} · ${groups[0].label}` : 'Platform updates and improvements'}
              </div>
            </div>
            <IconButton
              iconProps={{ iconName: 'ChromeClose' }}
              onClick={onClose}
              styles={{
                root: { color: t.muted, width: 28, height: 28 },
                rootHovered: { background: t.hover },
              }}
            />
          </div>

          {/* Category filter chips */}
          {!loading && !error && allEntries.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              <FilterChip label="All" count={allEntries.length} active={filter === 'all'} colour={t.accent} theme={t} onClick={() => setFilter('all')} />
              {(['feature', 'improvement', 'fix', 'ops'] as const).map(cat => (
                <FilterChip
                  key={cat}
                  label={CATEGORY_META[cat].label}
                  count={catCounts[cat]}
                  active={filter === cat}
                  colour={CATEGORY_META[cat].colour}
                  theme={t}
                  onClick={() => setFilter(filter === cat ? 'all' : cat)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 22px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
              <Spinner label="Loading..." />
            </div>
          ) : error ? (
            <div style={{
              padding: 20, textAlign: 'center', color: '#ef4444', borderRadius: 8, fontSize: 13,
              background: isDarkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
            }}>
              {error}
            </div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted, fontSize: 13 }}>
              No updates found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groups.map(g => {
                const isExpanded = expandedMonth === g.monthKey;
                return (
                  <div key={g.monthKey}>
                    <button
                      onClick={() => setExpandedMonth(isExpanded ? null : g.monthKey)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 2px',
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10, color: t.muted,
                          transition: 'transform 0.15s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          display: 'inline-block',
                        }}>&#9654;</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: t.accent,
                          padding: '1px 6px', borderRadius: 4, background: `${t.accent}14`,
                          fontFamily: 'monospace', letterSpacing: '0.3px',
                        }}>
                          {g.version}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: '-0.2px' }}>
                          {g.label}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 11, color: t.muted, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 999, background: t.surface,
                      }}>
                        {g.entries.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 1,
                        marginLeft: 6, borderLeft: `2px solid ${t.border}`,
                        paddingLeft: 16, marginBottom: 8,
                      }}>
                        {g.entries.map((e, i) => (
                          <EntryRow key={`${e.date}-${e.idx}-${i}`} entry={e} theme={t} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ReleaseNotesModal;
