/**
 * Management Dashboard collected-fees pressure-test rail.
 *
 * Phase A — honest rolling verifier:
 *   • Reports parity across the rolling 6-month window (configurable server-side).
 *   • Never blocks dashboard refresh and never auto-remediates. The user said:
 *       "i dont want the resolution of it to fire automateically, just the
 *        pressure test SQL data against source clio, effectively fully relying
 *        on the syncs"
 *   • When a drift is detected, surfaces the worst month and exposes a
 *     "Show breakdown" affordance. The drill-down (Phase B) will wire per-month
 *     resync; for now the breakdown is read-only and shows the per-month deltas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { disposeOnHmr, onServerBounced } from '../../utils/devHmr';
import type {
  ParityFinding,
  ReadinessCheck,
  ReadinessOverall,
  ReadinessPayload,
} from './readiness.types';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const TICK_INTERVAL_MS = 15 * 1000;

export interface ManagementDashboardTrustRailProps {
  isDarkMode: boolean;
  /** Reports the verdict to the parent so it can apply the degradation veil. */
  onVerdict?: (overall: ReadinessOverall, payload: ReadinessPayload | null) => void;
}

interface RailState {
  loading: boolean;
  error: string | null;
  payload: ReadinessPayload | null;
  fetchedAt: number;
}

const initialState: RailState = {
  loading: true,
  error: null,
  payload: null,
  fetchedAt: 0,
};

const verdictColour = (overall: ReadinessOverall): string => {
  switch (overall) {
    case 'ready': return colours.green;
    case 'warn': return colours.orange;
    case 'blocked': return colours.cta;
  }
};

const getCollectedCheck = (payload: ReadinessPayload | null): ReadinessCheck | null => (
  payload?.checks.find((check) => check.id === 'collectedMtd') ?? null
);

const isPreflightCollected = (check: ReadinessCheck | null): boolean => (
  !!check && (check.reason === 'no-snapshot' || check.reason === 'snapshot-missing-scope')
);

const scopedCollectedVerdict = (check: ReadinessCheck | null, hasError: boolean): ReadinessOverall => {
  if (hasError) return 'warn';
  if (!check || isPreflightCollected(check)) return 'ready';
  if (check.status === 'blocked') return 'blocked';
  if (check.status === 'warn' || check.status === 'unknown') return 'warn';
  return 'ready';
};

const collectedDotColour = (check: ReadinessCheck | null, overall: ReadinessOverall, hasError: boolean): string => {
  if (hasError) return colours.orange;
  if (!check || isPreflightCollected(check)) return colours.subtleGrey;
  return verdictColour(overall);
};

const formatCurrency = (value: unknown): string => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getFindings = (check: ReadinessCheck | null): ParityFinding[] => {
  const raw = check?.measured?.findings;
  return Array.isArray(raw) ? raw : [];
};

const collectedHeadline = (check: ReadinessCheck | null, hasError: boolean, findings: ParityFinding[]): string => {
  if (hasError) return 'Collected fees check unavailable';
  if (!check || isPreflightCollected(check)) return 'Not pressure-tested yet';
  const differing = findings.filter((f) => f.status !== 'ok' && !f.isCurrent);
  if (check.status === 'ok') {
    const closed = findings.filter((f) => !f.isCurrent);
    if (closed.length > 0) {
      return `Verified across last ${closed.length} closed months`;
    }
    return 'Verified against Clio';
  }
  if (differing.length === 1) {
    const f = differing[0];
    return `${f.label || f.month} differs (Δ ${formatCurrency(Math.abs(Number(f.delta) || 0))})`;
  }
  if (differing.length > 1) {
    return `${differing.length} months differ`;
  }
  if (check.reason === 'snapshot-stale') return 'Pressure test is stale';
  if (check.reason === 'minor-drift-aged-snapshot') return 'Refresh pressure test';
  return 'Review collected fees';
};

const collectedDetail = (check: ReadinessCheck | null, hasError: boolean, findings: ParityFinding[]): string => {
  if (hasError) return 'Could not load the collected-fees confidence check.';
  if (!check || isPreflightCollected(check)) {
    return 'Checking SQL against Clio for the rolling collected-fees window.';
  }
  const differing = findings.filter((f) => f.status !== 'ok' && !f.isCurrent);
  if (check.status === 'ok' && findings.length > 0) {
    const closed = findings.filter((f) => !f.isCurrent).length;
    return `SQL and Clio aligned within threshold across ${closed} closed months.`;
  }
  if (differing.length > 0) {
    const worst = [...differing].sort((a, b) =>
      Math.abs(Number(b.delta) || 0) - Math.abs(Number(a.delta) || 0)
    )[0];
    return `Worst: ${worst.label || worst.month} · SQL ${formatCurrency(worst.sql)} · Clio ${formatCurrency(worst.clio)}.`;
  }
  return check.message || 'Collected-fees confidence needs review before relying on these figures.';
};

const formatLiveAge = (ageSeconds: number | null, sinceFetchSeconds: number): string => {
  if (ageSeconds == null) return '—';
  const live = ageSeconds + sinceFetchSeconds;
  if (live < 60) return `${live}s`;
  const mins = Math.round(live / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const ManagementDashboardTrustRail: React.FC<ManagementDashboardTrustRailProps> = ({
  isDarkMode,
  onVerdict,
}) => {
  const [state, setState] = useState<RailState>(initialState);
  // `tick` exists purely to force re-render every 15s so the displayed
  // age advances between polls. The value itself is never consumed.
  const [, setTick] = useState(0);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const inFlightRef = useRef<AbortController | null>(null);
  const autoSnapshotAttemptedRef = useRef(false);
  const [snapshotRunning, setSnapshotRunning] = useState(false);

  const fetchReadiness = useCallback(async () => {
    inFlightRef.current?.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;
    try {
      const res = await fetch('/api/reporting/management-readiness', {
        signal: ctrl.signal,
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Readiness check failed (${res.status})`);
      const payload = (await res.json()) as ReadinessPayload;
      setState({ loading: false, error: null, payload, fetchedAt: Date.now() });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message || 'Could not load readiness',
        fetchedAt: Date.now(),
      }));
    }
  }, []);

  useEffect(() => {
    void fetchReadiness();
    const id = window.setInterval(() => { void fetchReadiness(); }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      inFlightRef.current?.abort();
    };
  }, [fetchReadiness]);

  // Local ticker so the displayed age advances between polls.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Re-fetch whenever a collected sync lands. The rail is passive — the
  // user drives sync activity from the controls below; the rail just
  // reflects the latest parity result.
  useEffect(() => {
    let es: EventSource | null = null;
    const open = () => {
      try {
        es = new EventSource('/api/data-operations/stream');
        es.addEventListener('dataOps.synced', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.dataset === 'collectedTime') {
              void fetchReadiness();
            }
          } catch {
            void fetchReadiness();
          }
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
      void fetchReadiness();
    });
    return () => {
      try { es?.close(); } catch { /* ignore */ }
      undoHmr();
      undoBounce();
    };
  }, [fetchReadiness]);

  // Report verdict.
  useEffect(() => {
    const check = getCollectedCheck(state.payload);
    onVerdict?.(scopedCollectedVerdict(check, Boolean(state.error)), state.payload);
  }, [state.payload, state.error, onVerdict]);

  const collectedCheck = getCollectedCheck(state.payload);
  const findings = useMemo(() => getFindings(collectedCheck), [collectedCheck]);
  const overall = scopedCollectedVerdict(collectedCheck, Boolean(state.error));
  const preflight = isPreflightCollected(collectedCheck);
  const dotColour = collectedDotColour(collectedCheck, overall, Boolean(state.error));
  const headline = collectedHeadline(collectedCheck, Boolean(state.error), findings);
  const detail = collectedDetail(collectedCheck, Boolean(state.error), findings);
  const differingCount = findings.filter((f) => f.status !== 'ok' && !f.isCurrent).length;
  const hasFindings = findings.length > 0;

  const sinceFetchSeconds = state.fetchedAt
    ? Math.round((Date.now() - state.fetchedAt) / 1000)
    : 0;

  const subText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const surface = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  const border = isDarkMode ? colours.dark.border : '#e5e7eb';

  const runCollectedSnapshot = useCallback(async () => {
    if (snapshotRunning) return;
    setSnapshotRunning(true);
    try {
      await fetch('/api/data-operations/reconciliation-snapshot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'collected' }),
      });
    } finally {
      setSnapshotRunning(false);
      void fetchReadiness();
    }
  }, [fetchReadiness, snapshotRunning]);

  useEffect(() => {
    if (state.loading || state.error || !state.payload || snapshotRunning) return;
    if (!preflight) return;
    if (autoSnapshotAttemptedRef.current) return;
    autoSnapshotAttemptedRef.current = true;
    void runCollectedSnapshot();
  }, [preflight, runCollectedSnapshot, snapshotRunning, state.error, state.loading, state.payload]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 0,
        marginBottom: 10,
        background: surface,
        border: `1px solid ${border}`,
        borderLeft: `2px solid ${dotColour}`,
        borderRadius: 0,
        fontSize: 11,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' }}>
        <span
          aria-hidden
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColour,
            animation: state.loading ? 'pulse 1.4s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.05em', fontSize: 10,
        }}>
          Collected fees check
        </span>

        <span style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
        }}>
          <span style={{ fontWeight: 700 }}>{headline}</span>
          <span style={{ color: subText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail}
          </span>
        </span>

        {hasFindings && (
          <button
            type="button"
            onClick={() => setBreakdownOpen((v) => !v)}
            aria-expanded={breakdownOpen}
            style={{
              padding: '4px 9px',
              borderRadius: 0,
              border: `1px solid ${border}`,
              background: 'transparent',
              color: subText,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {breakdownOpen ? 'Hide breakdown' : `Show breakdown${differingCount > 0 ? ` (${differingCount})` : ''}`}
          </button>
        )}

        {state.payload && (
          <span style={{ color: subText, fontSize: 10 }}>
            Updated {formatLiveAge(0, sinceFetchSeconds)} ago{state.payload.fromCache ? ' · cached' : ''}
          </span>
        )}
      </div>

      {breakdownOpen && hasFindings && (
        <div
          style={{
            borderTop: `1px solid ${border}`,
            padding: '6px 10px 8px 10px',
            background: isDarkMode ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
          }}
        >
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: subText, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px 3px 0', fontWeight: 600 }}>Month</th>
                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>SQL</th>
                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Clio</th>
                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Δ</th>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const colour = f.status === 'ok' ? colours.green : f.status === 'warn' ? colours.orange : colours.cta;
                const isCurrent = f.isCurrent === true;
                return (
                  <tr key={f.month} style={isCurrent ? { background: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.05)' } : undefined}>
                    <td style={{ padding: '3px 6px 3px 0' }}>
                      {f.label || f.month}
                      {isCurrent && (
                        <span style={{ marginLeft: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', color: subText, fontWeight: 600 }}>
                          in progress
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(f.sql)}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(f.clio)}</td>
                    <td style={{
                      padding: '3px 6px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: f.status === 'ok' ? subText : colour,
                      fontWeight: f.status === 'ok' ? 400 : 600,
                    }}>{formatCurrency(Math.abs(Number(f.delta) || 0))}</td>
                    <td style={{ padding: '3px 6px' }}>
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                          background: isCurrent ? colours.subtleGrey : colour, marginRight: 6,
                        }}
                      />
                      {isCurrent ? 'Partial' : (f.status === 'ok' ? 'OK' : 'Drift')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 10, color: subText }}>
            Use the sync controls below to re-pull a month from Clio when a drift appears — the parity check will refresh automatically once the sync lands.
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementDashboardTrustRail;
