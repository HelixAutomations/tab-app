import React, { useEffect, useMemo, useState } from 'react';
import { Modal, IconButton, Spinner, Pivot, PivotItem } from '@fluentui/react';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

type ChangelogEntry = {
  date: string;
  title: string;
  details?: string;
  raw: string;
  idx: number;
};

function parseChangelogLines(markdown: string): ChangelogEntry[] {
  const lines = markdown.split('\n');
  const entries: ChangelogEntry[] = [];

  lines.forEach((line, idx) => {
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*([^/]+?)(?:\s*\/\s*(.*))?\s*$/);
    if (!match) return;
    const date = match[1];
    const title = (match[2] || '').trim();
    const details = (match[3] || '').trim();
    if (!title) return;
    entries.push({ date, title, details: details || undefined, raw: line.trim(), idx });
  });

  // Newest first by date; preserve file order within a day.
  entries.sort((a, b) => (a.date === b.date ? a.idx - b.idx : a.date < b.date ? 1 : -1));
  return entries;
}

const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose, isDarkMode = false }) => {
  const [activeTab, setActiveTab] = useState<'changelog' | 'ideas'>('changelog');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchChangelog = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/release-notes');
        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          const suffix = bodyText ? `: ${bodyText.slice(0, 300)}` : '';
          throw new Error(`Failed to load changelog (HTTP ${response.status})${suffix}`);
        }
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load changelog');
        console.error('Changelog load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChangelog();
  }, [isOpen]);

  const entries = useMemo(() => parseChangelogLines(content), [content]);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? entries
      : entries.filter((e) => {
        const hay = `${e.title} ${e.details || ''}`.toLowerCase();
        return hay.includes(query);
      });

    const byDate = new Map<string, ChangelogEntry[]>();
    filtered.forEach((e) => {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    });

    const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return dates.map((date) => ({ date, items: byDate.get(date) ?? [] }));
  }, [entries, search]);

  useEffect(() => {
    if (!isOpen) return;
    if (!grouped.length) return;
    const newest = grouped[0]?.date;
    if (!newest) return;
    setOpenDates((prev) => (Object.keys(prev).length ? prev : { [newest]: true }));
  }, [grouped, isOpen]);

  const bg = isDarkMode ? '#1e293b' : '#ffffff';
  const text = isDarkMode ? '#f1f5f9' : '#0f172a';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const border = isDarkMode ? '#334155' : '#e2e8f0';
  const bgCode = isDarkMode ? '#0f172a' : '#f8fafc';
  const ideaCardBg = isDarkMode ? 'rgba(15, 23, 42, 0.65)' : '#ffffff';
  const accent = isDarkMode ? '#60a5fa' : '#3690CE';

  type IdeaPocket = {
    id: string;
    title: string;
    subtitle: string;
    bullets: string[];
    tags: string[];
    notes?: string[];
  };

  const ideaPockets: IdeaPocket[] = useMemo(() => ([
    {
      id: 'ai-reporting',
      title: 'AI-powered reporting (safe + auditable)',
      subtitle: 'Natural language → structured report recipe → preview → confirm → export.',
      tags: ['Reporting', 'AI', 'Audit'],
      bullets: [
        'Report “recipes” (parameters + SQL/view sources) rather than free-form querying.',
        'Preview definitions: invoiced vs collected; fees-only vs incl. disbursements.',
        'Audit log every run: who, when, inputs, outputs.',
      ],
      notes: [
        'Start with a tiny fixed set of recipes (no free-form SQL).',
        'Make every export inspectable (inputs + output metadata).',
      ],
    },
    {
      id: 'release-notes-automation',
      title: 'Move away from manual maintenance',
      subtitle: 'Changelog works now; longer term we curate proper Release Notes.',
      tags: ['Ops', 'Content'],
      bullets: [
        'Auto-generate candidate release notes from PR descriptions and tagged changes.',
        'Attach screenshots/metrics for major UX changes.',
        'Store releases as data (not a file) when ready.',
      ],
      notes: [
        'Keep “Changelog” as the raw feed; add a curated view later.',
        'Aim for draft → approve → publish flow (not auto-publish).',
      ],
    },
    {
      id: 'copilot-patterns',
      title: 'Operational “Copilot” patterns',
      subtitle: 'AI as planner/validator calling fixed capabilities.',
      tags: ['Ops', 'Safety'],
      bullets: [
        'Intent → confirm → execute (never execute destructive actions silently).',
        'Guardrails: RBAC, environment limits, rate limiting, PII redaction.',
        'Make outputs inspectable: links, queries, parameters, diffs.',
      ],
      notes: [
        'Keep capabilities explicit + testable; no hidden “magic”.',
      ],
    },
    {
      id: 'semantic-layer',
      title: 'Reporting “semantic layer”',
      subtitle: 'Canonical definitions so every export is consistent.',
      tags: ['Reporting', 'Definitions'],
      bullets: [
        'Central mapping of practice areas → commercial/property groupings.',
        'Financial definitions shared across dashboards + CSV exports.',
        'One place to decide if disbursements are included.',
      ],
      notes: [
        'Start file-first (fast), migrate to DB when stable.',
      ],
    },
  ]), []);

  const IdeaPocketCard: React.FC<{ pocket: IdeaPocket }> = ({ pocket }) => {
    return (
      <div style={{
        padding: 14,
        border: `1px solid ${border}`,
        borderRadius: 10,
        background: ideaCardBg,
        boxShadow: isDarkMode ? '0 12px 28px rgba(0,0,0,0.25)' : '0 10px 24px rgba(15, 23, 42, 0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{pocket.title}</span>
              {['idea', ...pocket.tags].slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase' as const,
                    letterSpacing: 0.6,
                    padding: '3px 7px',
                    borderRadius: 999,
                    border: `1px solid ${border}`,
                    color: textMuted,
                    background: bgCode,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ color: textMuted, fontSize: 12, marginBottom: 10 }}>{pocket.subtitle}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: text, lineHeight: 1.7 }}>
              {pocket.bullets.map((b, idx) => <li key={idx}>{b}</li>)}
            </ul>

            {pocket.notes?.length ? (
              <div style={{ marginTop: 10, color: textMuted, fontSize: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6, color: textMuted }}>Notes</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  {pocket.notes.map((n, idx) => <li key={idx}>{n}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      isBlocking={false}
      styles={{
        main: {
          width: '92vw',
          height: '90vh',
          maxWidth: '1200px',
          maxHeight: '900px',
          padding: 0,
          background: bg,
          borderRadius: '8px',
          overflow: 'hidden',
        },
        scrollableContent: {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={text} strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
              <path d="M20 2H6.5A2.5 2.5 0 0 0 4 4.5v15" />
              <path d="M8 6h8" />
              <path d="M8 10h8" />
              <path d="M8 14h6" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, color: text }}>Changelog</h2>
                <div style={{ fontSize: 11, color: textMuted }}>
                  Admin-only. Pulls from logs/changelog.md. <span style={{ color: accent, fontWeight: 700 }}>Planned:</span> cleaner Release Notes view.
                </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pivot
              selectedKey={activeTab}
              onLinkClick={(item) => {
                const key = (item?.props.itemKey || 'changelog') as 'changelog' | 'ideas';
                setActiveTab(key);
              }}
              styles={{
                root: { marginRight: 4 },
                link: { fontSize: 12, fontWeight: 600, color: textMuted },
                linkIsSelected: { color: isDarkMode ? '#60a5fa' : '#3690CE' },
              }}
            >
              <PivotItem itemKey="changelog" headerText="Changelog" />
              <PivotItem itemKey="ideas" headerText="Ideas" />
            </Pivot>

            <IconButton
              iconProps={{ iconName: 'ChromeClose' }}
              onClick={onClose}
              styles={{
                root: {
                  color: textMuted,
                  ':hover': { background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                }
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px' }}>
          {activeTab === 'changelog' && (
            loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                <Spinner label="Loading changelog..." />
              </div>
            ) : error ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#ef4444',
                background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                borderRadius: '6px'
              }}>
                {error}
              </div>
            ) : (
              <div>
                {entries.length === 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: textMuted, fontSize: 12 }}>
                      Couldn’t parse entries from changelog yet — showing raw changelog:
                    </div>
                    <pre style={{
                      margin: 0,
                      padding: 14,
                      background: bgCode,
                      border: `1px solid ${border}`,
                      borderRadius: 8,
                      color: text,
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {content || 'Changelog is empty.'}
                    </pre>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      padding: 12,
                      border: `1px solid ${border}`,
                      borderRadius: 10,
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255,255,255,0.7)',
                    }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: textMuted,
                        marginRight: 6,
                      }}>
                        View
                      </div>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search changes…"
                        style={{
                          flex: 1,
                          minWidth: 220,
                          padding: '9px 10px',
                          borderRadius: 8,
                          border: `1px solid ${border}`,
                          background: bg,
                          color: text,
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                      <div style={{ fontSize: 12, color: textMuted }}>
                        {grouped.reduce((acc, g) => acc + g.items.length, 0)} item(s)
                      </div>
                    </div>

                    <div style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${border}`,
                      background: isDarkMode ? 'rgba(96,165,250,0.08)' : 'rgba(54,144,206,0.08)',
                      color: text,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}>
                      This is the raw <strong>changelog</strong> (dense, developer-oriented). A curated <strong>Release Notes</strong> view is planned.
                    </div>

                    {grouped.slice(0, 60).map((g) => {
                      const isOpenDay = !!openDates[g.date];
                      return (
                        <div key={g.date} style={{
                          border: `1px solid ${border}`,
                          borderRadius: 12,
                          overflow: 'hidden',
                          background: bgCode,
                        }}>
                          <button
                            onClick={() => setOpenDates((prev) => ({ ...prev, [g.date]: !prev[g.date] }))}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '12px 14px',
                              border: 'none',
                              background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255,255,255,0.7)',
                              color: text,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: accent, flexShrink: 0 }} />
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: text }}>
                                  {g.date}
                                </div>
                                <div style={{ fontSize: 11, color: textMuted }}>
                                  {g.items.length} change(s)
                                </div>
                              </div>
                            </div>
                            <div style={{ color: textMuted, fontSize: 12, fontWeight: 800 }}>
                              {isOpenDay ? 'Hide' : 'Show'}
                            </div>
                          </button>

                          {isOpenDay && (
                            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                              {g.items.slice(0, 200).map((e, i) => (
                                <div
                                  key={`${e.date}:${e.idx}:${i}`}
                                  style={{
                                    padding: '12px 12px',
                                    background: isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.8)',
                                    border: `1px solid ${border}`,
                                    borderRadius: 10,
                                    borderLeft: `3px solid ${accent}`,
                                    display: 'grid',
                                    gap: 6,
                                  }}
                                  title={e.raw}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 800, color: text, lineHeight: 1.35 }}>
                                    {e.title}
                                  </div>
                                  {e.details ? (
                                    <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                                      {e.details}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'ideas' && (
            <div style={{ color: text, fontSize: 13, lineHeight: 1.65, maxWidth: 980 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Idea pockets</div>

              <div style={{ color: textMuted, fontSize: 12, marginBottom: 16 }}>
                Lightweight “flagged ideas” only — no implied decisions, scope, or requirements.
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {ideaPockets.map((p) => <IdeaPocketCard key={p.id} pocket={p} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ReleaseNotesModal;
