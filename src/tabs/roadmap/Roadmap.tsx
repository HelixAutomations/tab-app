// src/tabs/roadmap/Roadmap.tsx — Activity dashboard (live ops + changelog)

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { UserData } from '../../app/functionality/types';
import { isDevGroupOrHigher } from '../../app/admin';
import HomeBootMonitor from './HomeBootMonitor';
import ActivityFeedSection from './parts/ActivityFeedSection';
import ActivityCardLabPanel from './parts/ActivityCardLabPanel';
import PlatformPulseStrip from './parts/PlatformPulseStrip';
import SyncTimelineSection from './parts/SyncTimelineSection';
import ErrorStreamSection from './parts/ErrorStreamSection';
import SessionsPanel from './parts/SessionsPanel';
import PresencePanel from './parts/PresencePanel';
import ApiHeatSection from './parts/ApiHeatSection';
import { useOpsPulse } from './hooks/useOpsPulse';
import { ActivityFeedItem } from './parts/types';
import './Activity.css';

interface ActivityProps {
  userData: UserData[] | null;
  showBootMonitor?: boolean;
  isLocalDev?: boolean;
}

type ReleaseCategory = 'feature' | 'improvement' | 'fix' | 'ops';

type ReleaseEntry = {
  date: string;
  title: string;
  details?: string;
  category: ReleaseCategory;
  idx: number;
};

type ReleaseGroup = {
  label: string;
  version: string;
  monthKey: string;
  entries: ReleaseEntry[];
};

const CATEGORY_KEYWORDS: Record<Exclude<ReleaseCategory, 'feature'>, RegExp> = {
  fix: /\bfix(ed|es|ing)?\b|\bbug\b|\bpatch\b|\bharden(ed|ing)?\b|\bfallback\b|\bstabil/i,
  ops: /\btelemetry\b|\bapp\s*insights\b|\bscheduler\b|\bdeploy\b|\bops\b|\bmigrat/i,
  improvement: /\boptimis|refactor|clean|performance|simplif|redesign|improv|enrich|enhanc|inline|converge|consolidat/i,
};

function detectCategory(title: string, details?: string): ReleaseCategory {
  const hay = `${title} ${details || ''}`;
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<ReleaseCategory, 'feature'>, RegExp][]) {
    if (re.test(hay)) return cat;
  }
  return 'feature';
}

const CATEGORY_META: Record<ReleaseCategory, { label: string; colour: string; darkColour: string }> = {
  feature: { label: 'New', colour: colours.green, darkColour: colours.green },
  improvement: { label: 'Improved', colour: colours.highlight, darkColour: colours.accent },
  fix: { label: 'Fixed', colour: colours.orange, darkColour: colours.orange },
  ops: { label: 'Under the hood', colour: colours.greyText, darkColour: colours.subtleGrey },
};

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
  for (const entry of entries) {
    const monthKey = entry.date.slice(0, 7);
    (map.get(monthKey) ?? (map.set(monthKey, []), map.get(monthKey)!)).push(entry);
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
  return keys.map((key) => {
    const [year, month] = key.split('-');
    return {
      monthKey: key,
      version: `v${year}.${parseInt(month, 10)}`,
      label: `${months[parseInt(month, 10) - 1]} ${year}`,
      entries: map.get(key) || [],
    };
  });
}

function formatDate(iso: string): string {
  try {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}



const containerStyles = (isDarkMode: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: '100%',
  padding: '32px 40px',
  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
  fontFamily: 'Raleway, sans-serif',
  transition: 'background-color 0.2s',
});

const headerStyles = (isDarkMode: boolean): React.CSSProperties => ({
  marginBottom: 28,
  paddingBottom: 20,
  borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
});

const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  colour: string;
  isDarkMode: boolean;
  onClick: () => void;
}> = ({ label, count, active, colour, isDarkMode, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 12px',
      borderRadius: 0,
      border: `1px solid ${active ? colour : isDarkMode ? colours.dark.border : colours.light.border}`,
      background: active ? `${colour}30` : 'transparent',
      color: active ? colour : isDarkMode ? colours.subtleGrey : colours.greyText,
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.15s',
      letterSpacing: '0.2px',
      fontFamily: 'Raleway, sans-serif',
    }}
  >
    {label}
    <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{count}</span>
  </button>
);

const EntryRow: React.FC<{
  entry: ReleaseEntry;
  isDarkMode: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ entry, isDarkMode, expanded, onToggle }) => {
  const meta = CATEGORY_META[entry.category];
  const [hovered, setHovered] = useState(false);
  const catColour = isDarkMode ? meta.darkColour : meta.colour;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={entry.details ? onToggle : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 0,
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
        transition: 'background 0.12s',
        cursor: entry.details ? 'pointer' : 'default',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: 999, background: catColour, marginTop: 6, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.4, letterSpacing: '-0.1px' }}>
          {entry.title}
        </div>
        <div style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
          <span>{formatDate(entry.date)}</span>
          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: catColour, opacity: 0.85 }}>
            {meta.label}
          </span>
          {entry.details && (
            <span style={{ fontSize: 9, opacity: 0.5, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>
              &#9654;
            </span>
          )}
        </div>
        {expanded && entry.details && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: isDarkMode ? colours.subtleGrey : colours.greyText, padding: '8px 0 4px', borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}` }}>
            {entry.details}
          </div>
        )}
      </div>
    </div>
  );
};

const Activity: React.FC<ActivityProps> = ({ userData, showBootMonitor = false, isLocalDev = false }) => {
  const { isDarkMode } = useTheme();
  const showLiveMonitor = isDevGroupOrHigher(Array.isArray(userData) ? userData[0] : null);
  const opsPulse = useOpsPulse(showLiveMonitor);
  const [content, setContent] = useState('');
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityFeedRefreshing, setActivityFeedRefreshing] = useState(false);
  const [activityFeedLastSyncAt, setActivityFeedLastSyncAt] = useState<number | null>(null);
  const [activityFeedUsingSnapshot, setActivityFeedUsingSnapshot] = useState(false);
  const [filter, setFilter] = useState<ReleaseCategory | 'all'>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showOpsDetail, setShowOpsDetail] = useState(false);
  const activityItemsRef = useRef<ActivityFeedItem[]>([]);

  // Coordinated reveal — flips once when initial data arrives, never resets
  const [dashReady, setDashReady] = useState(false);
  useEffect(() => {
    if (!loading && !dashReady) setDashReady(true);
  }, [loading, dashReady]);

  useEffect(() => {
    activityItemsRef.current = activityItems;
  }, [activityItems]);

  useEffect(() => {
    let disposed = false;

    const loadReleaseNotes = async () => {
      const releaseNotesRes = await fetch('/api/release-notes');
      if (!releaseNotesRes.ok) {
        throw new Error(`Release notes HTTP ${releaseNotesRes.status}`);
      }

      const nextContent = await releaseNotesRes.text();
      if (!disposed) {
        setContent(nextContent);
      }
    };

    const loadActivityFeed = async (background = false) => {
      if (!disposed && background) {
        setActivityFeedRefreshing(true);
      }

      try {
        const activityFeedRes = await fetch('/api/activity-feed?limit=24');
        if (!activityFeedRes.ok) {
          throw new Error(`Operational feed unavailable (${activityFeedRes.status})`);
        }

        const activityFeed = await activityFeedRes.json();
        if (disposed) return;

        setActivityItems(Array.isArray(activityFeed?.items) ? activityFeed.items : []);
        setActivityFeedLastSyncAt(Date.now());
        setActivityFeedUsingSnapshot(false);
        setActivityError(null);
      } catch (err) {
        if (disposed) return;

        const hasCurrentItems = activityItemsRef.current.length > 0;
        if (hasCurrentItems) {
          setActivityFeedUsingSnapshot(true);
          setActivityError('Live refresh unavailable. Showing the last known activity feed.');
          return;
        }

        setActivityItems([]);
        setActivityError(err instanceof Error ? err.message : 'Failed to load operational feed');
      } finally {
        if (!disposed) {
          setActivityFeedRefreshing(false);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadActivityFeed(true);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadActivityFeed(true);
      }
    }, 30000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setActivityError(null);
        await Promise.all([loadReleaseNotes(), loadActivityFeed(false)]);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load activity data');
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const allEntries = useMemo(() => parseChangelog(content), [content]);
  const filtered = useMemo(() => (filter === 'all' ? allEntries : allEntries.filter((entry) => entry.category === filter)), [allEntries, filter]);
  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  useEffect(() => {
    if (!groups.length) return;
    setExpandedMonths((prev) => {
      if (prev.size > 0) return prev;
      const initial = new Set<string>();
      groups.slice(0, 2).forEach((group) => initial.add(group.monthKey));
      return initial;
    });
  }, [groups]);

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleEntry = useCallback((entryKey: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  }, []);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { feature: 0, improvement: 0, fix: 0, ops: 0 };
    allEntries.forEach((entry) => counts[entry.category]++);
    return counts;
  }, [allEntries]);

  const recentCardLabItems = useMemo(() => activityItems.filter((item) => item.source === 'activity.cardlab' || item.source === 'activity.dm.send'), [activityItems]);

  const handleCardLabItemSent = useCallback((item: ActivityFeedItem) => {
    setActivityItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 24));
    setActivityFeedLastSyncAt(Date.now());
    setActivityFeedUsingSnapshot(false);
    setActivityError(null);
  }, []);

  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accentColour = isDarkMode ? colours.accent : colours.highlight;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const surfaceColour = isDarkMode ? 'rgba(255,255,255,0.06)' : colours.light.sectionBackground;

  return (
    <div style={containerStyles(isDarkMode)}>
      {/* ═══ Header — slim, data-rich ═══ */}
      <div style={headerStyles(isDarkMode)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: textColour, letterSpacing: '-0.3px', fontFamily: 'Raleway, sans-serif' }}>
            Activity
          </h1>
          {showLiveMonitor && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: opsPulse.connected ? colours.green : colours.cta, flexShrink: 0 }} />
          )}
        </div>

        {/* Metric strip (dev group) or subtitle (everyone else) */}
        {showLiveMonitor && opsPulse.connected ? (
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            {[
              { label: 'Online', value: opsPulse.presence?.online ?? 0, colour: colours.green },
              { label: 'Streams', value: opsPulse.sessions?.totalConnections ?? 0, colour: accentColour },
              { label: 'Errors', value: opsPulse.errors?.length ?? 0, colour: (opsPulse.errors?.length ?? 0) > 0 ? colours.cta : colours.green },
              { label: 'RPM', value: opsPulse.pulse?.requests?.rpm ?? 0, colour: accentColour },
            ].map((metric) => (
              <div key={metric.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: metric.colour, fontFamily: 'Raleway, sans-serif' }}>
                  {metric.value}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.3px', color: mutedColour, fontFamily: 'Raleway, sans-serif' }}>
                  {metric.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: mutedColour, marginTop: 4 }}>
            {`${activityItems.length > 0 ? `${activityItems.length} live signals` : ''}${activityItems.length > 0 && allEntries.length > 0 ? ' · ' : ''}${allEntries.length > 0 ? `${allEntries.length} updates` : 'Platform updates and improvements'}`}
          </div>
        )}
      </div>

      {/* ═══ Tier 1: Live Dashboard — 3-col grid (dev group) ═══ */}
      {showLiveMonitor && (
        <div className={dashReady ? 'activity-cascade-1' : 'activity-cascade-pending'} style={{ marginBottom: 28 }}>
          <PlatformPulseStrip pulse={opsPulse.pulse} connected={opsPulse.connected} isDarkMode={isDarkMode} />

          <div className="activity-live-grid">
            {/* Col 1 — Who's Here (hero) */}
            <PresencePanel presence={opsPulse.presence} isDarkMode={isDarkMode} />

            {/* Col 2 — Live Feed */}
            <ActivityFeedSection
              items={activityItems}
              isDarkMode={isDarkMode}
              isRefreshing={activityFeedRefreshing}
              isSnapshot={activityFeedUsingSnapshot}
              lastLiveSyncAt={activityFeedLastSyncAt}
              error={activityError}
            />

            {/* Col 3 — Health stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ErrorStreamSection errors={opsPulse.errors} isDarkMode={isDarkMode} />
              <SessionsPanel sessions={opsPulse.sessions} isDarkMode={isDarkMode} />
            </div>
          </div>

          {/* Collapsible Ops Detail */}
          <button
            onClick={() => setShowOpsDetail((prev) => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 0 8px', fontFamily: 'Raleway, sans-serif' }}
          >
            <span style={{ fontSize: 10, color: mutedColour, transform: showOpsDetail ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>
              &#9654;
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: textColour, fontFamily: 'Raleway, sans-serif' }}>
              Ops Detail
            </span>
          </button>

          {showOpsDetail && (
            <div className="activity-ops-detail-grid">
              <SyncTimelineSection scheduler={opsPulse.scheduler} isDarkMode={isDarkMode} />
              <ApiHeatSection requests={opsPulse.requests} isDarkMode={isDarkMode} />
            </div>
          )}

          {isLocalDev && (
            <ActivityCardLabPanel recentItems={recentCardLabItems} onItemSent={handleCardLabItemSent} />
          )}
        </div>
      )}

      {/* ═══ Activity Feed (non-dev users — full width hero) ═══ */}
      {!showLiveMonitor && !loading && !error && (
        <div className={dashReady ? 'activity-cascade-1' : 'activity-cascade-pending'} style={{ marginBottom: 28 }}>
          <ActivityFeedSection
            items={activityItems}
            isDarkMode={isDarkMode}
            isRefreshing={activityFeedRefreshing}
            isSnapshot={activityFeedUsingSnapshot}
            lastLiveSyncAt={activityFeedLastSyncAt}
            error={activityError}
          />
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <Spinner label="Loading activity..." />
        </div>
      )}
      {!loading && error && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: colours.cta, background: isDarkMode ? `${colours.cta}14` : `${colours.cta}0D` }}>
          {error}
        </div>
      )}

      {/* ═══ Tier 2: Release Notes (collapsed secondary) ═══ */}
      {!loading && !error && allEntries.length > 0 && (
        <div className={dashReady ? 'activity-cascade-2' : 'activity-cascade-pending'} style={{ marginBottom: 28 }}>
          <button
            onClick={() => setShowReleaseNotes((prev) => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontFamily: 'Raleway, sans-serif', width: '100%', textAlign: 'left' as const }}
          >
            <span style={{ fontSize: 10, color: mutedColour, transform: showReleaseNotes ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>
              &#9654;
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: textColour, letterSpacing: '-0.2px' }}>Release Notes</span>
            <span style={{ fontSize: 11, color: mutedColour, fontWeight: 600, padding: '2px 8px', borderRadius: 0, background: surfaceColour }}>{allEntries.length}</span>
          </button>

          {showReleaseNotes && (
            <>
              {/* Filter chips */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <FilterChip label="All" count={allEntries.length} active={filter === 'all'} colour={accentColour} isDarkMode={isDarkMode} onClick={() => setFilter('all')} />
                {(['feature', 'improvement', 'fix', 'ops'] as const).map((category) => (
                  <FilterChip
                    key={category}
                    label={CATEGORY_META[category].label}
                    count={catCounts[category]}
                    active={filter === category}
                    colour={isDarkMode ? CATEGORY_META[category].darkColour : CATEGORY_META[category].colour}
                    isDarkMode={isDarkMode}
                    onClick={() => setFilter(filter === category ? 'all' : category)}
                  />
                ))}
              </div>

              {/* Month groups */}
              {groups.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: mutedColour, fontSize: 13 }}>No updates found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 800 }}>
                  {groups.map((group) => {
                    const isExpanded = expandedMonths.has(group.monthKey);
                    return (
                      <div key={group.monthKey}>
                        <button
                          onClick={() => toggleMonth(group.monthKey)}
                          style={{ width: '100%', textAlign: 'left', padding: '12px 4px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: 'Raleway, sans-serif' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: mutedColour, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                              &#9654;
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: accentColour, padding: '1px 6px', borderRadius: 0, background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey, fontFamily: 'monospace', letterSpacing: '0.3px' }}>
                              {group.version}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: textColour, letterSpacing: '-0.2px' }}>{group.label}</span>
                          </div>
                          <span style={{ fontSize: 11, color: mutedColour, fontWeight: 600, padding: '2px 8px', borderRadius: 0, background: surfaceColour }}>
                            {group.entries.length}
                          </span>
                        </button>

                        {isExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 8, borderLeft: `2px solid ${borderColour}`, paddingLeft: 16, marginBottom: 12 }}>
                            {group.entries.map((entry, index) => {
                              const entryKey = `${entry.date}-${entry.idx}`;
                              return (
                                <EntryRow
                                  key={`${entryKey}-${index}`}
                                  entry={entry}
                                  isDarkMode={isDarkMode}
                                  expanded={expandedEntries.has(entryKey)}
                                  onToggle={() => toggleEntry(entryKey)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ HomeBootMonitor (dev tool, bottom of page) ═══ */}
      {showBootMonitor && (
        <div className={dashReady ? 'activity-cascade-3' : 'activity-cascade-pending'} style={{ marginTop: 16, borderTop: `1px solid ${borderColour}`, paddingTop: 16 }}>
          <HomeBootMonitor />
        </div>
      )}
    </div>
  );
};

export default Activity;