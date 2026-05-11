/**
 * Phase C — automated ops strip (top of Management Dashboard).
 *
 * Shows the four scheduled data-operation tiers as a compact row of dots.
 * Per the user's direction:
 *   "automated operations, at the top so its clear, and with a subtle ledger
 *    at the bottom. of the page, sop spparate from the signals at the top"
 *
 * Pure visibility — no buttons, no remediation. Reads:
 *   • GET /api/data-operations/sync-history (live mutex + persisted lastRun)
 *   • SSE  /api/data-operations/stream     (refresh on dataOps.synced)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { disposeOnHmr, onServerBounced } from '../../utils/devHmr';

interface TierLastRun {
  ts: number;
  status: string;
  message: string | null;
  triggeredBy: string | null;
}

interface TierData {
  lastRun: TierLastRun | null;
  schedule: string;
}

interface PersistedSnapshot {
  tiers: {
    collected: { currentHourly: TierData; previousSeal: TierData };
    wip: { currentHourly: TierData; previousSeal: TierData };
  };
  recentRuns?: unknown[];
}

interface MutexState {
  busy?: boolean;
  scope?: string | null;
  operation?: string | null;
}

interface SyncHistoryPayload {
  scheduler?: {
    mutex?: MutexState;
    nextFires?: Partial<Record<NextFireKey, { minsUntil: number | null; schedule: string }>>;
  };
  persisted?: PersistedSnapshot;
  serverTime?: number;
}

type Entity = 'collected' | 'wip';
type Tier = 'currentHourly' | 'previousSeal';
type NextFireKey = 'collectedCurrentHourly' | 'wipCurrentHourly' | 'collectedPreviousSeal' | 'wipPreviousSeal';

interface TileSpec {
  key: string;
  label: string;
  entity: Entity;
  tier: Tier;
  nextFireKey: NextFireKey;
  operation: string;
}

const TILES: TileSpec[] = [
  { key: 'col-cur', label: 'Collected · current', entity: 'collected', tier: 'currentHourly', nextFireKey: 'collectedCurrentHourly', operation: 'syncCollectedTimeCurrentHourly' },
  { key: 'wip-cur', label: 'WIP · current',       entity: 'wip',       tier: 'currentHourly', nextFireKey: 'wipCurrentHourly',       operation: 'syncWipCurrentHourly' },
  { key: 'col-prv', label: 'Collected · seal',    entity: 'collected', tier: 'previousSeal',  nextFireKey: 'collectedPreviousSeal',  operation: 'syncCollectedTimePreviousSeal' },
  { key: 'wip-prv', label: 'WIP · seal',          entity: 'wip',       tier: 'previousSeal',  nextFireKey: 'wipPreviousSeal',        operation: 'syncWipPreviousSeal' },
];

const POLL_MS = 60 * 1000;
const TICK_MS = 30 * 1000;

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

const formatNext = (mins: number | null): string => {
  if (mins == null) return 'scheduled';
  if (mins <= 0) return 'imminent';
  if (mins < 60) return `in ${mins}m`;
  const h = Math.round(mins / 60);
  return `in ${h}h`;
};

const tierColour = (
  running: boolean,
  lastStatus: string | null | undefined,
  lastTs: number | null,
): string => {
  if (running) return colours.blue;
  if (!lastTs) return colours.subtleGrey;
  if (lastStatus === 'completed') {
    // Stale > 6h on a current-hourly tier flips amber. We approximate by age only.
    const ageMs = Date.now() - lastTs;
    if (ageMs > 6 * 60 * 60 * 1000) return colours.orange;
    return colours.green;
  }
  if (lastStatus === 'error' || lastStatus === 'timeout') return colours.cta;
  if (lastStatus === 'skipped') return colours.subtleGrey;
  return colours.subtleGrey;
};

interface Props {
  isDarkMode: boolean;
}

const AutomatedOpsStrip: React.FC<Props> = ({ isDarkMode }) => {
  const [data, setData] = useState<SyncHistoryPayload | null>(null);
  const [, setTick] = useState(0);
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
    const poll = window.setInterval(() => { void fetchOnce(); }, POLL_MS);
    return () => {
      window.clearInterval(poll);
      inFlightRef.current?.abort();
    };
  }, [fetchOnce]);

  // Re-render every 30s so countdowns advance.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Refresh on data-ops SSE so a completed sync flips the tile colour live.
  useEffect(() => {
    let es: EventSource | null = null;
    const open = () => {
      try {
        es = new EventSource('/api/data-operations/stream');
        es.addEventListener('dataOps.synced', () => { void fetchOnce(); });
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
  const nextFires = data?.scheduler?.nextFires || {};
  const tiers = data?.persisted?.tiers;

  const surface = isDarkMode ? 'rgba(8, 28, 48, 0.95)' : '#fafbfd';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.45)' : '#dee5ee';
  const subText = isDarkMode ? '#9aa6b6' : '#5b6675';
  const labelText = isDarkMode ? '#e6ecf3' : '#1a2a3d';

  return (
    <div
      role="status"
      aria-label="Automated data operations status"
      style={{
        display: 'flex',
        gap: 0,
        marginBottom: 10,
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: subText,
          borderRight: `1px solid ${border}`,
          alignSelf: 'center',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        Automated ops
      </div>
      {TILES.map((tile, idx) => {
        const tier = tiers?.[tile.entity]?.[tile.tier];
        const lastRun = tier?.lastRun || null;
        const lastStatus = lastRun?.status || null;
        const lastTs = lastRun?.ts || null;
        const running = !!(
          mutex.busy &&
          (mutex.operation === tile.operation ||
            (mutex.scope === tile.entity && mutex.operation == null))
        );
        const colour = tierColour(running, lastStatus, lastTs);
        const ageLabel = lastTs ? formatAge(Date.now() - lastTs) : 'no run yet';
        const nextLabel = formatNext(nextFires?.[tile.nextFireKey]?.minsUntil ?? null);
        const titleParts: string[] = [tile.label];
        titleParts.push(`Schedule: ${tier?.schedule ?? '—'}`);
        if (lastRun?.status) titleParts.push(`Last: ${lastRun.status} (${ageLabel})`);
        if (lastRun?.triggeredBy) titleParts.push(`Triggered by: ${lastRun.triggeredBy}`);
        return (
          <div
            key={tile.key}
            title={titleParts.join('\n')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 10px',
              borderRight: idx < TILES.length - 1 ? `1px solid ${border}` : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: colour,
                flex: '0 0 auto',
                boxShadow: running ? `0 0 0 3px ${colour}33` : 'none',
                transition: 'box-shadow 0.2s ease',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: labelText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tile.label}
              </span>
              <span style={{ fontSize: 10, color: subText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {running ? 'Running now…' : `${ageLabel} · next ${nextLabel}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AutomatedOpsStrip;
