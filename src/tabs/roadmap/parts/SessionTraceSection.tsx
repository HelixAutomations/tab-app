import React, { useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import type { SessionTraceData, SessionTraceEntry, SessionTraceEvent } from './ops-pulse-types';

interface SessionTraceSectionProps {
  traces: SessionTraceData | null;
  isDarkMode: boolean;
  initialSessionId?: string | null;
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

  return labels[key] || key || 'Unknown';
}

function ago(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function kindColour(kind: SessionTraceEvent['kind']): string {
  if (kind === 'error') return colours.cta;
  if (kind === 'warning') return colours.orange;
  if (kind === 'success') return colours.green;
  return colours.highlight;
}

function healthColour(health: SessionTraceEntry['health']): string {
  if (health === 'error') return colours.cta;
  if (health === 'warning') return colours.orange;
  if (health === 'busy') return colours.highlight;
  return colours.green;
}

const SessionTraceSection: React.FC<SessionTraceSectionProps> = ({ traces, isDarkMode, initialSessionId }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null);
  const [healthFilter, setHealthFilter] = useState<'all' | 'busy' | 'degraded' | 'error'>('all');

  // External drill-in: when initialSessionId changes from the parent, sync.
  useEffect(() => {
    if (initialSessionId) setSelectedSessionId(initialSessionId);
  }, [initialSessionId]);

  const allTraces = traces?.list || [];
  const traceList = useMemo(() => {
    if (healthFilter === 'all') return allTraces;
    if (healthFilter === 'busy') return allTraces.filter((t) => t.health === 'busy');
    if (healthFilter === 'degraded') return allTraces.filter((t) => t.health === 'warning');
    if (healthFilter === 'error') return allTraces.filter((t) => t.health === 'error');
    return allTraces;
  }, [allTraces, healthFilter]);
  useEffect(() => {
    if (!traceList.length) {
      setSelectedSessionId(null);
      return;
    }

    if (!selectedSessionId || !traceList.some((trace) => trace.sessionId === selectedSessionId)) {
      setSelectedSessionId(traceList[0].sessionId);
    }
  }, [selectedSessionId, traceList]);

  const selectedTrace = useMemo(
    () => traceList.find((trace) => trace.sessionId === selectedSessionId) || traceList[0] || null,
    [selectedSessionId, traceList],
  );

  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const freshSessionIds = useFreshIds(traceList, (trace) => trace.sessionId);
  const recentEvents = selectedTrace?.recentEvents ?? [];
  const freshEventIds = useFreshIds(recentEvents, (event) => `${event.ts}-${event.source}-${event.type}`);

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: text, fontFamily: 'Raleway, sans-serif' }}>
          Session Trace
        </span>
        {traces && (
          <>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: `${colours.green}24`, color: colours.green, fontFamily: 'monospace' }}>
              {traces.active} active
            </span>
            {traces.busy > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: `${colours.highlight}24`, color: colours.highlight, fontFamily: 'monospace' }}>
                {traces.busy} busy
              </span>
            )}
            {traces.degraded > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: `${colours.orange}24`, color: colours.orange, fontFamily: 'monospace' }}>
                {traces.degraded} degraded
              </span>
            )}
          </>
        )}
        {/* Health filter chips */}
        {allTraces.length > 0 && (
          <div role="group" aria-label="Filter sessions by health" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {(['all', 'busy', 'degraded', 'error'] as const).map((option) => {
              const active = healthFilter === option;
              const tone =
                option === 'busy' ? colours.highlight :
                option === 'degraded' ? colours.orange :
                option === 'error' ? colours.cta :
                (isDarkMode ? colours.accent : colours.highlight);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHealthFilter(option)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: active ? 700 : 600,
                    fontFamily: 'Raleway, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    background: active ? `${tone}1F` : 'transparent',
                    color: active ? tone : muted,
                    border: `1px solid ${active ? tone : borderCol}`,
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!traces || traceList.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          Waiting for live client session events.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {traceList.map((trace) => {
              const selected = trace.sessionId === selectedTrace?.sessionId;
              const accent = healthColour(trace.health);

              return (
                <button
                  key={trace.sessionId}
                  data-fresh={freshSessionIds.has(trace.sessionId) ? 'true' : undefined}
                  onClick={() => setSelectedSessionId(trace.sessionId)}
                  style={{
                    textAlign: 'left',
                    background: selected ? (isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey) : 'transparent',
                    border: `1px solid ${selected ? accent : borderCol}`,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{trace.user}</span>
                    <span style={{ fontSize: 10, color: muted }}>{tabLabel(trace.tab)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: muted, fontFamily: 'monospace' }}>{ago(trace.lastSeen)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: text, marginBottom: 4 }}>{trace.lastEventLabel || 'No recent events'}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: muted, fontFamily: 'monospace' }}>
                    <span>{trace.pendingCount} pending</span>
                    <span>{trace.slowCount} slow</span>
                    <span>{trace.errorCount} errors</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ border: `1px solid ${borderCol}`, padding: '12px 14px', minHeight: 220 }}>
            {selectedTrace ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{selectedTrace.name || selectedTrace.user}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: `${healthColour(selectedTrace.health)}20`, color: healthColour(selectedTrace.health), fontFamily: 'monospace' }}>
                    {selectedTrace.health}
                  </span>
                  <span style={{ fontSize: 10, color: muted, fontFamily: 'monospace' }}>{selectedTrace.sessionId}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedTrace.recentEvents.length === 0 ? (
                    <div style={{ fontSize: 12, color: muted }}>No recent events for this session.</div>
                  ) : selectedTrace.recentEvents.map((event, index) => (
                    <div key={`${event.ts}-${index}`} data-fresh={freshEventIds.has(`${event.ts}-${event.source}-${event.type}`) ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: '56px minmax(140px, 220px) minmax(0, 1fr) auto', gap: 10, alignItems: 'start', fontSize: 11 }}>
                      <span style={{ color: muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{ago(event.ts)}</span>
                      <span style={{ color: kindColour(event.kind), fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={`${event.source}.${event.type}`}>{event.source}.{event.type}</span>
                      <span style={{ color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={event.label}>{event.label}</span>
                      <span style={{ color: muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {event.durationMs ? `${Math.round(event.durationMs)}ms` : event.error ? 'error' : ' '}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionTraceSection;