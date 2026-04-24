// src/tabs/roadmap/parts/SideRail.tsx — stackable context layers (presence + sessions + api heat + scheduler)
//
// Click-aware: presence rows + session chips drill into the Trace lens for that user via
// ActivityContext. Layer visibility is driven by the `layers` prop (from useActivityLayout).

import React, { useMemo } from 'react';
import { colours } from '../../../app/styles/colours';
import { useOptionalActivityContext } from '../ActivityContext';
import type { LayerKey } from '../hooks/useActivityLayout';
import type {
  PresenceData,
  SessionsData,
  RequestEntry,
  PulseData,
  SchedulerData,
  SessionTraceData,
} from './ops-pulse-types';

interface SideRailProps {
  isDarkMode: boolean;
  presence: PresenceData | null;
  sessions: SessionsData | null;
  requests: RequestEntry[];
  pulse: PulseData | null;
  scheduler?: SchedulerData | null;
  sessionTraces?: SessionTraceData | null;
  connected: boolean;
  layers?: LayerKey[];
}

function tabLabel(key: string): string {
  const labels: Record<string, string> = {
    home: 'Home',
    enquiries: 'Enquiries',
    matters: 'Matters',
    instructions: 'Instructions',
    reporting: 'Reporting',
    roadmap: 'Activity',
    blueprints: 'Blueprints',
    resources: 'Resources',
    forms: 'Forms',
  };
  return labels[key] || key;
}

function staleness(lastSeen: number): string {
  const ago = Math.floor((Date.now() - lastSeen) / 1000);
  if (ago < 10) return 'now';
  if (ago < 60) return `${ago}s`;
  return `${Math.floor(ago / 60)}m`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const RailPanel: React.FC<{
  title: string;
  badge?: { text: string; tone: string };
  isDarkMode: boolean;
  children: React.ReactNode;
}> = ({ title, badge, isDarkMode, children }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderCol}`,
        borderRadius: 0,
        padding: '12px 14px',
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: textColour,
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 6px',
              background: `${badge.tone}30`,
              color: badge.tone,
              fontFamily: 'monospace',
            }}
          >
            {badge.text}
          </span>
        )}
      </div>
      {children}
    </div>
  );
};

const PresenceRow: React.FC<{
  initials: string;
  name: string;
  email: string;
  tab: string;
  lastSeen: number;
  isDarkMode: boolean;
  onClick?: () => void;
}> = ({ initials, name, email, tab, lastSeen, isDarkMode, onClick }) => {
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const fresh = (Date.now() - lastSeen) < 30000;
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={interactive ? `Open trace for ${name}` : name}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto',
        alignItems: 'center',
        gap: 8,
        padding: '4px 6px',
        margin: '0 -6px',
        fontSize: 11,
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        textAlign: 'left',
        cursor: interactive ? 'pointer' : 'default',
        color: 'inherit',
        fontFamily: 'Raleway, sans-serif',
        width: 'calc(100% + 12px)',
      }}
      data-email={email}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: fresh ? accent : muted,
          color: '#fff',
          fontSize: 9,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        {initials}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name.split(' ')[0]}
        </div>
        <div style={{ fontSize: 10, color: muted }}>{tabLabel(tab)}</div>
      </div>
      <span style={{ fontSize: 10, color: muted, fontFamily: 'monospace' }}>
        {staleness(lastSeen)}
      </span>
    </button>
  );
};

const Sparkline: React.FC<{
  values: number[];
  colour: string;
  height?: number;
}> = ({ values, colour, height = 36 }) => {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 100;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2)}`)
    .join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={colour} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const SideRail: React.FC<SideRailProps> = ({
  isDarkMode,
  presence,
  sessions,
  requests,
  pulse,
  scheduler = null,
  sessionTraces = null,
  connected,
  layers,
}) => {
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const ctx = useOptionalActivityContext();

  const visibleLayers: LayerKey[] = layers ?? ['presence', 'sessions', 'apiHeat', 'scheduler'];
  const showLayer = (key: LayerKey) => visibleLayers.includes(key);

  const focusTraceForUser = (email: string) => {
    if (!ctx || !sessionTraces) return ctx?.focusLens('trace');
    const match = sessionTraces.list.find(
      (s) => s.user?.toLowerCase() === email.toLowerCase() || s.name?.toLowerCase() === email.toLowerCase(),
    );
    ctx.focusLens('trace', { sessionId: match?.sessionId ?? null });
  };

  const reqBuckets = useMemo(() => {
    if (!requests || requests.length === 0) return [];
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const bucketCount = 20;
    const bucketMs = windowMs / bucketCount;
    const buckets: number[] = Array(bucketCount).fill(0);
    requests.forEach((r) => {
      const age = now - r.ts;
      if (age < 0 || age > windowMs) return;
      const idx = Math.min(bucketCount - 1, Math.floor((windowMs - age) / bucketMs));
      buckets[idx] += 1;
    });
    return buckets;
  }, [requests]);

  const presenceList = presence?.list?.slice(0, 8) || [];
  const sessionUsers = sessions?.users?.slice(0, 6) || [];

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Who's Here */}
      {showLayer('presence') && (
      <RailPanel
        title="Who's Here"
        badge={presence ? { text: `${presence.online}`, tone: colours.green } : undefined}
        isDarkMode={isDarkMode}
      >
        {presenceList.length === 0 ? (
          <div style={{ fontSize: 11, color: muted, padding: '4px 0' }}>No one online</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {presenceList.map((p) => (
              <PresenceRow
                key={p.email}
                initials={p.initials}
                name={p.name}
                email={p.email}
                tab={p.tab}
                lastSeen={p.lastSeen}
                isDarkMode={isDarkMode}
                onClick={ctx ? () => focusTraceForUser(p.email) : undefined}
              />
            ))}
          </div>
        )}
      </RailPanel>
      )}

      {/* Sessions */}
      {showLayer('sessions') && (
      <RailPanel
        title="Sessions"
        badge={
          sessions
            ? { text: `${sessions.totalConnections} · ${sessions.uniqueUsers}`, tone: colours.green }
            : undefined
        }
        isDarkMode={isDarkMode}
      >
        {sessionUsers.length === 0 ? (
          <div style={{ fontSize: 11, color: muted, padding: '4px 0' }}>No active sessions</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sessionUsers.map((user) => {
              const count = sessions?.list?.filter((s) => s.user === user).length || 0;
              const interactive = Boolean(ctx);
              return (
                <button
                  type="button"
                  key={user}
                  onClick={interactive ? () => focusTraceForUser(user) : undefined}
                  disabled={!interactive}
                  title={interactive ? `Open trace for ${user}` : user}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    background: isDarkMode ? 'rgba(255,255,255,0.04)' : colours.grey,
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    fontSize: 10,
                    fontFamily: 'Raleway, sans-serif',
                    cursor: interactive ? 'pointer' : 'default',
                    color: 'inherit',
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: colours.green }} />
                  <span style={{ fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {user}
                  </span>
                  <span style={{ color: muted, fontFamily: 'monospace' }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </RailPanel>
      )}

      {/* API Heat */}
      {showLayer('apiHeat') && (
      <RailPanel
        title="API Heat (5m)"
        badge={
          pulse
            ? { text: `${pulse.requests.rpm} rpm`, tone: pulse.requests.errors5min > 0 ? colours.cta : accent }
            : undefined
        }
        isDarkMode={isDarkMode}
      >
        {reqBuckets.length === 0 || !pulse ? (
          <div style={{ fontSize: 11, color: muted, padding: '4px 0' }}>No requests yet</div>
        ) : (
          <>
            <Sparkline values={reqBuckets} colour={accent} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: muted,
                fontFamily: 'monospace',
                marginTop: 4,
              }}
            >
              <span>{pulse.requests.total5min} req</span>
              <span>p95 {pulse.requests.p95Ms}ms</span>
              <span style={{ color: pulse.requests.errors5min > 0 ? colours.cta : muted }}>
                {pulse.requests.errors5min} err
              </span>
            </div>
          </>
        )}
      </RailPanel>
      )}

      {/* Scheduler heartbeat */}
      {showLayer('scheduler') && scheduler && (
      <RailPanel
        title="Scheduler"
        badge={
          scheduler.mutex?.locked
            ? { text: 'busy', tone: colours.orange }
            : { text: 'idle', tone: colours.green }
        }
        isDarkMode={isDarkMode}
      >
        {(() => {
          const mutex = scheduler.mutex;
          const interactive = Boolean(ctx);
          const heldMs = mutex?.holder ? Date.now() - mutex.holder.startedAt : 0;
          const onClick = interactive ? () => ctx?.focusLens('sync') : undefined;
          return (
            <button
              type="button"
              onClick={onClick}
              disabled={!interactive}
              title={interactive ? 'Open Sync lens' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: interactive ? 'pointer' : 'default',
                color: 'inherit',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                <span style={{ fontWeight: 600 }}>{mutex?.holder?.name || 'no active job'}</span>
                <span style={{ fontFamily: 'monospace', color: muted }}>
                  {mutex?.holder ? `${Math.round(heldMs / 1000)}s` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, fontFamily: 'monospace' }}>
                <span>queue {mutex?.queueDepth ?? 0}</span>
                <span>{mutex?.recentHistory?.length ?? 0} recent</span>
              </div>
            </button>
          );
        })()}
      </RailPanel>
      )}

      {/* Uptime */}
      {pulse && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            border: `1px dashed ${isDarkMode ? colours.dark.border : colours.light.border}`,
            fontSize: 10,
            color: muted,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? colours.green : colours.cta,
                marginRight: 6,
              }}
            />
            {connected ? 'Connected' : 'Offline'}
          </span>
          <span style={{ fontFamily: 'monospace' }}>up {formatUptime(pulse.uptimeSeconds)}</span>
        </div>
      )}
    </aside>
  );
};

export default SideRail;
