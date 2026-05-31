import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';

interface SystemActivityViewProps {
  viewerInitials: string | null;
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
}

interface ActivityItem {
  id: string;
  submissionId: string;
  formKey: string;
  actor: string | null;
  submittedAt: string;
  method: string | null;
  path: string;
  summary: string;
  status: string;
  statusCode: number | null;
  durationMs: number | null;
  lane: string | null;
  lastEvent: string | null;
  lastEventAt: string | null;
  retriggerCount: number;
  followUp: string[];
  hasFollowUp: boolean;
  steps: Array<{ name?: string; status?: string; at?: string; error?: string }>;
  payloadSummary: {
    query: unknown;
    body: unknown;
    referer: string | null;
    userAgent: string | null;
  } | null;
}

type StatusFilter = 'all' | 'failed' | 'success' | 'pending';

const HeaderButton: React.FC<{
  label: string;
  isDarkMode: boolean;
  accent?: string;
  onClick: () => void;
}> = ({ label, isDarkMode, accent, onClick }) => {
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = accent || (isDarkMode ? colours.dark.border : colours.light.border);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${borderColour}`,
        background: accent ? `${accent}1A` : 'transparent',
        color: accent || mutedColour,
        padding: '7px 10px',
        borderRadius: 0,
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </button>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  accent: string;
  isDarkMode: boolean;
  onClick: () => void;
  count?: number;
}> = ({ label, active, accent, isDarkMode, onClick, count }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      border: `1px solid ${active ? accent : isDarkMode ? colours.dark.border : colours.light.border}`,
      background: active ? `${accent}26` : 'transparent',
      color: active ? accent : isDarkMode ? colours.subtleGrey : colours.greyText,
      padding: '5px 10px',
      borderRadius: 0,
      cursor: 'pointer',
      fontFamily: 'Raleway, sans-serif',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.3px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    {label}
    {typeof count === 'number' ? <span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span> : null}
  </button>
);

function statusAccent(status: string, statusCode: number | null): string {
  if (status === 'failed' || (statusCode != null && statusCode >= 500)) return colours.cta;
  if (statusCode != null && statusCode >= 400) return colours.orange;
  if (status === 'complete') return colours.green;
  return colours.highlight;
}

function formatTime(value: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(value: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function groupByActorMinute(items: ActivityItem[]): Array<{ key: string; actor: string; minute: string; items: ActivityItem[] }> {
  const groups = new Map<string, { actor: string; minute: string; items: ActivityItem[] }>();
  for (const item of items) {
    const actor = item.actor || 'UNK';
    let minute = '';
    try {
      const d = new Date(item.submittedAt);
      minute = `${d.toISOString().slice(0, 16)}`;
    } catch {
      minute = '';
    }
    const key = `${actor}__${minute}`;
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { actor, minute, items: [item] });
  }
  return Array.from(groups.entries()).map(([key, group]) => ({ key, ...group }));
}

const SystemActivityView: React.FC<SystemActivityViewProps> = ({
  viewerInitials,
  isDarkMode,
  onBack,
  onOpenDashboard,
}) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const cardBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [followOnly, setFollowOnly] = useState(false);
  const [pathQuery, setPathQuery] = useState('');
  const [actorQuery, setActorQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!viewerInitials) {
      setError('Viewer initials unavailable.');
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams({ limit: '120', initials: viewerInitials });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (followOnly) params.set('follow', 'true');
      if (pathQuery.trim()) params.set('path', pathQuery.trim());
      if (actorQuery.trim()) params.set('actor', actorQuery.trim().toUpperCase());

      const res = await fetch(`/api/process-hub/activity?${params.toString()}`, {
        headers: { 'x-user-initials': viewerInitials },
      });
      if (!res.ok) throw new Error(`Activity HTTP ${res.status}`);
      const body = await res.json();
      setItems(Array.isArray(body?.items) ? body.items : []);
      setLastSyncAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [viewerInitials, statusFilter, followOnly, pathQuery, actorQuery]);

  useEffect(() => {
    setLoading(true);
    void load();
    const tick = window.setInterval(() => { void load(); }, 30000);
    return () => window.clearInterval(tick);
  }, [load]);

  const counts = useMemo(() => {
    const total = items.length;
    let failed = 0;
    let followUps = 0;
    let pending = 0;
    for (const item of items) {
      if (item.status === 'failed' || (item.statusCode != null && item.statusCode >= 400)) failed += 1;
      if (item.hasFollowUp) followUps += 1;
      if (['queued', 'processing', 'awaiting_human'].includes(item.status)) pending += 1;
    }
    return { total, failed, followUps, pending };
  }, [items]);

  const groups = useMemo(() => groupByActorMinute(items), [items]);

  return (
    <section data-helix-region="system/activity" style={{ color: textColour, fontFamily: 'Raleway, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
            System
          </div>
          <h1 style={{ margin: '3px 0 0', fontSize: 24, lineHeight: 1.2, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
            Activity
          </h1>
          <div style={{ fontSize: 12, color: mutedColour, marginTop: 6 }}>
            Generic mutating API activity captured by the Process Hub fallback audit. Who did what, when, and what came back.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HeaderButton label="Back" isDarkMode={isDarkMode} onClick={onBack} />
          <HeaderButton label="Dashboard" isDarkMode={isDarkMode} accent={colours.highlight} onClick={onOpenDashboard} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatTile label="Captured" value={counts.total} accent={colours.highlight} isDarkMode={isDarkMode} />
        <StatTile label="Failed" value={counts.failed} accent={colours.cta} isDarkMode={isDarkMode} />
        <StatTile label="Follow-up" value={counts.followUps} accent={colours.orange} isDarkMode={isDarkMode} />
        <StatTile label="Pending" value={counts.pending} accent={colours.blue} isDarkMode={isDarkMode} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Chip label="All" active={statusFilter === 'all'} accent={colours.highlight} isDarkMode={isDarkMode} onClick={() => setStatusFilter('all')} count={counts.total} />
        <Chip label="Failed" active={statusFilter === 'failed'} accent={colours.cta} isDarkMode={isDarkMode} onClick={() => setStatusFilter('failed')} count={counts.failed} />
        <Chip label="Pending" active={statusFilter === 'pending'} accent={colours.blue} isDarkMode={isDarkMode} onClick={() => setStatusFilter('pending')} count={counts.pending} />
        <Chip label="Success" active={statusFilter === 'success'} accent={colours.green} isDarkMode={isDarkMode} onClick={() => setStatusFilter('success')} />
        <Chip label="Follow-up only" active={followOnly} accent={colours.orange} isDarkMode={isDarkMode} onClick={() => setFollowOnly((v) => !v)} count={counts.followUps} />
        <input
          type="text"
          placeholder="Filter path or summary..."
          value={pathQuery}
          onChange={(e) => setPathQuery(e.target.value)}
          style={{
            background: 'transparent',
            border: `1px solid ${borderColour}`,
            color: textColour,
            padding: '6px 9px',
            fontFamily: 'Raleway, sans-serif',
            fontSize: 12,
            borderRadius: 0,
            minWidth: 200,
          }}
        />
        <input
          type="text"
          placeholder="Actor (e.g. LZ)"
          value={actorQuery}
          onChange={(e) => setActorQuery(e.target.value)}
          style={{
            background: 'transparent',
            border: `1px solid ${borderColour}`,
            color: textColour,
            padding: '6px 9px',
            fontFamily: 'Raleway, sans-serif',
            fontSize: 12,
            borderRadius: 0,
            width: 96,
            textTransform: 'uppercase',
          }}
        />
        <button
          type="button"
          onClick={() => { void load(); }}
          style={{
            border: `1px solid ${borderColour}`,
            background: 'transparent',
            color: mutedColour,
            padding: '6px 10px',
            fontFamily: 'Raleway, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            borderRadius: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}
        >
          Refresh
        </button>
        {lastSyncAt ? (
          <span style={{ fontSize: 11, color: mutedColour }}>Synced {formatTime(new Date(lastSyncAt).toISOString())}</span>
        ) : null}
      </div>

      {error ? (
        <div style={{ border: `1px solid ${colours.cta}`, background: `${colours.cta}1A`, color: colours.cta, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <ActivitySkeleton isDarkMode={isDarkMode} />
      ) : items.length === 0 ? (
        <div style={{ border: `1px solid ${borderColour}`, background: cardBg, padding: 20, textAlign: 'center', color: mutedColour, fontSize: 13 }}>
          No matching activity captured.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((group) => (
            <div key={group.key} style={{ border: `1px solid ${borderColour}`, background: cardBg }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${borderColour}` }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.3px', color: textColour }}>{group.actor}</span>
                <span style={{ fontSize: 11, color: mutedColour }}>
                  {formatDate(group.items[0]?.submittedAt || null)} · {formatTime(group.items[0]?.submittedAt || null)}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: mutedColour }}>{group.items.length} call{group.items.length === 1 ? '' : 's'}</span>
              </div>
              <div>
                {group.items.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    isDarkMode={isDarkMode}
                    expanded={expandedId === item.id}
                    onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const StatTile: React.FC<{ label: string; value: number; accent: string; isDarkMode: boolean }> = ({ label, value, accent, isDarkMode }) => {
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const cardBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  return (
    <div style={{ border: `1px solid ${borderColour}`, borderLeft: `3px solid ${accent}`, background: cardBg, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
};

const ActivityRow: React.FC<{
  item: ActivityItem;
  isDarkMode: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ item, isDarkMode, expanded, onToggle }) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const accent = statusAccent(item.status, item.statusCode);

  return (
    <div style={{ borderTop: `1px solid ${borderColour}` }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '10px 12px',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '70px 1fr auto',
          gap: 10,
          alignItems: 'center',
          color: textColour,
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        <span style={{
          fontSize: 10,
          fontWeight: 800,
          textAlign: 'center',
          padding: '3px 6px',
          borderRadius: 0,
          background: `${accent}26`,
          color: accent,
          letterSpacing: '0.3px',
        }}>
          {item.method || 'POST'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: textColour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.path}
          </div>
          <div style={{ fontSize: 11, color: mutedColour, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{formatTime(item.submittedAt)}</span>
            {item.statusCode != null ? <span style={{ color: accent, fontWeight: 700 }}>HTTP {item.statusCode}</span> : null}
            {item.durationMs != null ? <span>{item.durationMs}ms</span> : null}
            {item.retriggerCount > 0 ? <span>retriggered x{item.retriggerCount}</span> : null}
            {item.hasFollowUp ? <span style={{ color: colours.orange, fontWeight: 700 }}>follow-up: {item.followUp.join(', ')}</span> : null}
          </div>
        </div>
        <span style={{ fontSize: 10, color: mutedColour, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>&#9654;</span>
      </button>
      {expanded ? (
        <div style={{ padding: '8px 12px 14px 90px', borderTop: `1px dashed ${borderColour}`, fontSize: 12, color: mutedColour }}>
          <DetailRow label="Form key" value={item.formKey} />
          <DetailRow label="Lane" value={item.lane || '-'} />
          <DetailRow label="Last event" value={item.lastEvent ? `${item.lastEvent}${item.lastEventAt ? ` at ${formatTime(item.lastEventAt)}` : ''}` : '-'} />
          {item.payloadSummary?.referer ? <DetailRow label="Referer" value={item.payloadSummary.referer} /> : null}
          {item.payloadSummary?.query && Object.keys(item.payloadSummary.query as Record<string, unknown>).length > 0 ? (
            <DetailJson label="Query" value={item.payloadSummary.query} isDarkMode={isDarkMode} />
          ) : null}
          {item.payloadSummary?.body && Object.keys(item.payloadSummary.body as Record<string, unknown>).length > 0 ? (
            <DetailJson label="Body (redacted)" value={item.payloadSummary.body} isDarkMode={isDarkMode} />
          ) : null}
          {item.steps && item.steps.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: mutedColour, letterSpacing: '0.3px', marginBottom: 4 }}>Steps</div>
              {item.steps.map((step, idx) => (
                <div key={idx} style={{ fontSize: 12, color: textColour, paddingLeft: 8, borderLeft: `2px solid ${borderColour}`, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700 }}>{step.name || 'step'}</span>
                  <span style={{ marginLeft: 6, color: step.status === 'failed' ? colours.cta : colours.green }}>{step.status || ''}</span>
                  {step.at ? <span style={{ marginLeft: 6, color: mutedColour }}>{formatTime(step.at)}</span> : null}
                  {step.error ? <div style={{ color: colours.cta, fontSize: 11 }}>{step.error}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
    <span style={{ fontWeight: 700, minWidth: 90 }}>{label}</span>
    <span style={{ wordBreak: 'break-all' }}>{value}</span>
  </div>
);

const DetailJson: React.FC<{ label: string; value: unknown; isDarkMode: boolean }> = ({ label, value, isDarkMode }) => (
  <div style={{ marginTop: 6 }}>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>{label}</div>
    <pre style={{
      margin: 0,
      padding: '8px 10px',
      background: isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.04)',
      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
      fontSize: 11,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: 200,
      overflow: 'auto',
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

const ActivitySkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const cardBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ border: `1px solid ${borderColour}`, background: cardBg, minHeight: 100, opacity: 0.5 }} />
      ))}
    </div>
  );
};

export default SystemActivityView;
