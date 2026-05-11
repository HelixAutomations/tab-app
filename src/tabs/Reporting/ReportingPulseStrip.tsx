/**
 * Reporting workspace data-source pulse strip.
 *
 * Lives at the top of Reporting Home (applies across every report, not just
 * the Management Dashboard). Per the user's direction:
 *   "we dont need to see the seal confirmation there, just a really clean
 *    reassuring strip of animated ticks for the sources. we only have two
 *    right now. it shows as data refreshes"
 *
 * Two tiles only — the live data sources behind every report:
 *   • Collected fees  (collectedTime sync)
 *   • Recorded time   (WIP sync)
 *
 * Each tile shows a calm green tick with last-refresh timestamp. When an
 * SSE `dataOps.synced` event fires for that source the tick pulses briefly
 * to acknowledge the refresh, then settles back. No buttons, no cadence
 * jargon — just confidence.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { disposeOnHmr, onServerBounced } from '../../utils/devHmr';

interface RecentRun {
  ts: number;
  entity: 'collected' | 'wip';
  status: string;
  triggeredBy?: string | null;
  invokedBy?: string | null;
}

interface PersistedTier {
  lastRun: { ts: number; status: string } | null;
}

interface SyncHistoryPayload {
  scheduler?: { mutex?: { busy?: boolean; scope?: string | null; operation?: string | null } };
  persisted?: {
    tiers?: {
      collected?: { currentHourly?: PersistedTier; previousSeal?: PersistedTier };
      wip?: { currentHourly?: PersistedTier; previousSeal?: PersistedTier };
    };
    recentRuns?: RecentRun[];
  };
}

type Entity = 'collected' | 'wip';

interface SourceSpec {
  key: Entity;
  label: string;
  caption: string;
  /** Minute of the hour the scheduler fires this source (Europe/London). */
  scheduledMinute: number;
}

const SOURCES: SourceSpec[] = [
  { key: 'collected', label: 'Collected fees', caption: 'Clio collectedTime', scheduledMinute: 5 },
  { key: 'wip',       label: 'Recorded time', caption: 'Clio WIP',           scheduledMinute: 20 },
];

const POLL_MS = 90 * 1000;
const TICK_MS = 30 * 1000;
const PULSE_MS = 1600;

const formatAge = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const formatExact = (ms: number | null): string => {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const pickLatestForEntity = (payload: SyncHistoryPayload | null, entity: Entity): { ts: number | null; status: string | null; triggeredBy: string | null; invokedBy: string | null } => {
  const tiers = payload?.persisted?.tiers?.[entity];
  const tierTs: number[] = [];
  const last = tiers?.currentHourly?.lastRun;
  if (last?.ts) tierTs.push(last.ts);
  const seal = tiers?.previousSeal?.lastRun;
  if (seal?.ts) tierTs.push(seal.ts);
  let bestTs = tierTs.length ? Math.max(...tierTs) : null;
  let bestStatus: string | null = null;
  if (last?.ts === bestTs) bestStatus = last.status;
  else if (seal?.ts === bestTs) bestStatus = seal.status;
  // Tiers don't carry triggeredBy/invokedBy — source those from recentRuns.
  let triggeredBy: string | null = null;
  let invokedBy: string | null = null;
  const runs = (payload?.persisted?.recentRuns || []).filter((r) => r.entity === entity);
  if (runs.length > 0) {
    // recentRuns is sorted newest-first by the server.
    const newest = runs[0];
    triggeredBy = newest.triggeredBy || null;
    invokedBy = newest.invokedBy || null;
    if (!bestTs) {
      bestTs = newest.ts;
      bestStatus = newest.status;
    }
  }
  return { ts: bestTs, status: bestStatus, triggeredBy, invokedBy };
};

/** Compute next scheduled run (Europe/London, hourly :MM cadence). */
const nextScheduled = (now: number, scheduledMinute: number): number => {
  const d = new Date(now);
  d.setSeconds(0, 0);
  if (d.getMinutes() >= scheduledMinute) {
    d.setHours(d.getHours() + 1);
  }
  d.setMinutes(scheduledMinute);
  return d.getTime();
};

const formatCountdown = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return 'imminent';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

const formatClock = (ms: number): string => {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const formatTrigger = (triggeredBy: string | null, invokedBy: string | null): string => {
  const t = (triggeredBy || '').toLowerCase();
  if (!t) return 'system';
  if (t === 'scheduler' || t === 'system' || t === 'boot' || t === 'boot-catchup') return 'system';
  if (t === 'manual' || t === 'user' || t === 'admin-route' || t === 'data-centre') {
    if (invokedBy) {
      // User initials or short id — keep compact.
      const trimmed = invokedBy.length > 12 ? invokedBy.slice(0, 12) + '…' : invokedBy;
      return trimmed;
    }
    return 'user';
  }
  return t;
};

interface Props {
  isDarkMode: boolean;
}

const ReportingPulseStrip: React.FC<Props> = ({ isDarkMode }) => {
  const [data, setData] = useState<SyncHistoryPayload | null>(null);
  const [, setTick] = useState(0);
  const [pulse, setPulse] = useState<Record<Entity, number>>({ collected: 0, wip: 0 });
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchOnce = useMemo(() => async () => {
    inFlightRef.current?.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;
    try {
      const res = await fetch('/api/data-operations/sync-history', {
        signal: ctrl.signal,
        credentials: 'include',
      });
      if (!res.ok) return;
      const payload = (await res.json()) as SyncHistoryPayload;
      setData(payload);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchOnce();
    const id = window.setInterval(() => { void fetchOnce(); }, POLL_MS);
    return () => {
      window.clearInterval(id);
      inFlightRef.current?.abort();
    };
  }, [fetchOnce]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // SSE — pulse the matching tile when a data-ops sync completes for it.
  useEffect(() => {
    let es: EventSource | null = null;
    const open = () => {
      try {
        es = new EventSource('/api/data-operations/stream');
        es.addEventListener('dataOps.synced', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data || '{}');
            const dataset: string | undefined = payload?.dataset;
            const entity: Entity | null =
              dataset === 'collectedTime' ? 'collected' :
              dataset === 'wip' ? 'wip' : null;
            if (entity) {
              setPulse((prev) => ({ ...prev, [entity]: Date.now() }));
            }
          } catch { /* ignore */ }
          void fetchOnce();
        });
      } catch {
        es = null;
      }
    };
    open();
    const undoHmr = disposeOnHmr(() => { try { es?.close(); } catch { /* ignore */ } });
    const undoBounce = onServerBounced(() => {
      try { es?.close(); } catch { /* ignore */ }
      open();
      void fetchOnce();
    });
    return () => {
      try { es?.close(); } catch { /* ignore */ }
      undoHmr();
      undoBounce();
    };
  }, [fetchOnce]);

  const mutex = data?.scheduler?.mutex || {};
  const surface = isDarkMode ? 'rgba(8, 28, 48, 0.55)' : 'rgba(255, 255, 255, 0.75)';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.32)' : '#e2e7ee';
  const subText = isDarkMode ? '#9aa6b6' : '#6b7785';
  const labelText = isDarkMode ? '#e6ecf3' : '#1a2a3d';

  const now = Date.now();

  return (
    <>
      <style>{`
        @keyframes helix-pulse-tick {
          0%   { transform: scale(1);   box-shadow: 0 0 0 0   ${colours.green}66; }
          40%  { transform: scale(1.18); box-shadow: 0 0 0 6px ${colours.green}00; }
          100% { transform: scale(1);   box-shadow: 0 0 0 0   ${colours.green}00; }
        }
        @keyframes helix-pulse-running {
          0%, 100% { box-shadow: 0 0 0 0 ${colours.blue}55; }
          50%      { box-shadow: 0 0 0 6px ${colours.blue}00; }
        }
      `}</style>
      <div
        role="status"
        aria-label="Reporting data sources"
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 14,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        {SOURCES.map((src, idx) => {
          const { ts, status, triggeredBy, invokedBy } = pickLatestForEntity(data, src.key);
          const running = !!(mutex.busy && mutex.scope === src.key);
          const ageLabel = ts ? formatAge(now - ts) : 'awaiting first sync';
          const exact = formatExact(ts);
          const errored = status === 'error' || status === 'timeout';
          const pulsing = pulse[src.key] && (now - pulse[src.key] < PULSE_MS);
          const dotColour = errored ? colours.cta : running ? colours.blue : ts ? colours.green : colours.subtleGrey;
          const animation = pulsing
            ? `helix-pulse-tick ${PULSE_MS}ms ease-out`
            : running
              ? 'helix-pulse-running 1.6s ease-in-out infinite'
              : 'none';
          const triggerLabel = ts ? formatTrigger(triggeredBy, invokedBy) : null;
          const nextTs = nextScheduled(now, src.scheduledMinute);
          const nextCountdown = formatCountdown(nextTs - now);
          const nextClock = formatClock(nextTs);
          const tooltipParts = [
            `${src.label} · ${src.caption}`,
            ts ? `Last refresh: ${exact}` : 'Awaiting first sync',
            triggerLabel ? `By ${triggerLabel}` : null,
            `Next scheduled: ${nextClock} (in ${nextCountdown})`,
          ].filter(Boolean);
          return (
            <div
              key={src.key}
              title={tooltipParts.join('\n')}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 14px',
                borderRight: idx < SOURCES.length - 1 ? `1px solid ${border}` : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: dotColour,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  animation,
                  color: '#fff',
                }}
              >
                {/* Tick glyph */}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
                  <path
                    d="M1.6 5.2 L4 7.6 L8.6 2.8"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: labelText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {src.label}
                </span>
                <span style={{ fontSize: 10, color: subText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {running
                    ? 'Refreshing now…'
                    : (
                      <>
                        Updated {ageLabel}
                        {triggerLabel && (
                          <> · by <span style={{ color: labelText, fontWeight: 600 }}>{triggerLabel}</span></>
                        )}
                        <> · next {nextClock} <span style={{ opacity: 0.75 }}>(in {nextCountdown})</span></>
                      </>
                    )
                  }
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ReportingPulseStrip;
