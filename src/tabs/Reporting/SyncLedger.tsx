/**
 * Management Dashboard sync ledger.
 *
 * Per the user's direction — high-level by default, juice on click:
 *   "make the sync history less noisy and showing more high level
 *    understanding, only if user clicks in they get the juice but at the
 *    higher level no need to be so detailed, infact the ticks work better,
 *    simpler and more reassuring. but it needs to be clear with timestamps"
 *
 * Each row collapsed = green tick + scope + window + clear timestamp.
 * Expanded = the full detail (status text, rows touched, duration, message,
 * trigger).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { disposeOnHmr, onServerBounced } from '../../utils/devHmr';

interface RecentRun {
  id: string;
  ts: number;
  entity: 'collected' | 'wip';
  operation: string;
  status: string;
  triggeredBy: string;
  modeLabel?: string | null;
  invokedBy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  windowLabel?: string | null;
  resultLabel?: string | null;
  durationMs?: number | null;
  deletedRows?: number | null;
  insertedRows?: number | null;
  message?: string | null;
}

interface SyncHistoryPayload {
  persisted?: { recentRuns?: RecentRun[] };
}

const POLL_MS = 90 * 1000;
const ROW_LIMIT = 6;

const formatTime = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelative = (ms: number): string => {
  const diff = Date.now() - ms;
  if (!Number.isFinite(diff) || diff < 0) return '';
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const formatDuration = (ms: number | null | undefined): string => {
  if (!Number.isFinite(ms ?? NaN) || (ms ?? 0) < 0) return '—';
  const seconds = Math.round((ms ?? 0) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const statusKind = (status: string): 'ok' | 'warn' | 'error' | 'idle' => {
  switch ((status || '').toLowerCase()) {
    case 'completed': return 'ok';
    case 'started':
    case 'queued':
    case 'running': return 'warn';
    case 'skipped': return 'idle';
    case 'error':
    case 'timeout': return 'error';
    default: return 'idle';
  }
};

const statusColour = (status: string): string => {
  switch (statusKind(status)) {
    case 'ok': return colours.green;
    case 'warn': return colours.blue;
    case 'error': return colours.cta;
    case 'idle': return colours.subtleGrey;
  }
};

const entityLabel = (entity: 'collected' | 'wip'): string =>
  entity === 'collected' ? 'Collected fees' : 'Recorded time';

interface Props {
  isDarkMode: boolean;
}

const SyncLedger: React.FC<Props> = ({ isDarkMode }) => {
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
      const list = payload.persisted?.recentRuns ?? [];
      setRuns(list.slice(0, ROW_LIMIT));
      setLoaded(true);
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

  // Re-render every 30s so relative timestamps stay current.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const surface = isDarkMode ? 'rgba(8, 28, 48, 0.4)' : 'rgba(244, 244, 246, 0.55)';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.22)' : '#e6ebf2';
  const subText = isDarkMode ? '#8794a4' : '#6b7785';
  const labelText = isDarkMode ? '#cdd6e1' : '#1a2a3d';
  const headerText = isDarkMode ? '#7c8898' : '#7c8898';

  if (!loaded && runs.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 18,
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 0,
        padding: '10px 14px 12px 14px',
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          color: headerText,
          marginBottom: 8,
        }}
      >
        Sync ledger
      </div>
      {runs.length === 0 ? (
        <div style={{ fontSize: 11, color: subText }}>
          No recent syncs recorded.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {runs.map((r) => {
            const isOpen = !!expanded[r.id];
            const colour = statusColour(r.status);
            const kind = statusKind(r.status);
            const headlineRight = `${formatTime(r.ts)} · ${formatRelative(r.ts)}`;
            return (
              <li
                key={r.id}
                style={{
                  borderTop: `1px solid ${border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: '7px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: colour, flex: '0 0 auto',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {kind === 'ok' && (
                      <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden focusable="false">
                        <path d="M1.6 5.2 L4 7.6 L8.6 2.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {kind === 'error' && (
                      <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden focusable="false">
                        <path d="M2.5 2.5 L7.5 7.5 M7.5 2.5 L2.5 7.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: labelText, whiteSpace: 'nowrap' }}>
                    {entityLabel(r.entity)}
                  </span>
                  <span style={{ fontSize: 11, color: subText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                    {r.windowLabel || ''}
                  </span>
                  <span style={{ fontSize: 11, color: subText, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {headlineRight}
                  </span>
                  <span aria-hidden style={{ fontSize: 10, color: subText, marginLeft: 4, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: '4px 4px 10px 28px',
                      fontSize: 11,
                      color: subText,
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      columnGap: 12,
                      rowGap: 3,
                    }}
                  >
                    <span style={{ color: headerText, fontWeight: 600 }}>Status</span>
                    <span style={{ color: labelText }}>{r.resultLabel || r.status}</span>

                    <span style={{ color: headerText, fontWeight: 600 }}>Trigger</span>
                    <span style={{ color: labelText }}>
                      {r.modeLabel || r.triggeredBy || 'automatic'}
                      {r.invokedBy ? ` · ${r.invokedBy}` : ''}
                    </span>

                    {(r.insertedRows != null || r.deletedRows != null) && (
                      <>
                        <span style={{ color: headerText, fontWeight: 600 }}>Rows</span>
                        <span style={{ color: labelText, fontVariantNumeric: 'tabular-nums' }}>
                          {r.insertedRows != null ? `+${r.insertedRows.toLocaleString('en-GB')} inserted` : ''}
                          {r.insertedRows != null && r.deletedRows != null ? ' · ' : ''}
                          {r.deletedRows != null ? `−${r.deletedRows.toLocaleString('en-GB')} replaced` : ''}
                        </span>
                      </>
                    )}

                    <span style={{ color: headerText, fontWeight: 600 }}>Duration</span>
                    <span style={{ color: labelText, fontVariantNumeric: 'tabular-nums' }}>
                      {formatDuration(r.durationMs)}
                    </span>

                    {r.message && (
                      <>
                        <span style={{ color: headerText, fontWeight: 600 }}>Note</span>
                        <span style={{ color: labelText }}>{r.message}</span>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SyncLedger;
