/**
 * Management Dashboard Trust Gate — entry strip (Phase B).
 *
 * Mounts above the Management hero card. Polls /api/reporting/management-readiness,
 * renders a tile per blocking check, and surfaces a non-blocking warn strip for
 * advisory checks. While the overall verdict is `blocked`, the parent should
 * disable the "Open Management Dashboard" CTA — this component reports its
 * verdict via `onChange` for that wiring.
 *
 * Phase B does NOT include remediation buttons or the in-place value morph;
 * those land in Phase D. See docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import type {
  ReadinessCheck,
  ReadinessOverall,
  ReadinessPayload,
  ReadinessStatus,
} from './readiness.types';
import { useReadinessRemediate } from './useReadinessRemediate';
import ValueMorph from './ValueMorph';

const POLL_INTERVAL_MS = 5 * 60 * 1000;     // refresh every 5 min
const RETRY_COOLDOWN_MS = 4 * 1000;          // throttle manual retry
const SETTLE_DELAY_MS = 1200;                // collapse delay after all-green
const MAX_AGE_BEFORE_REPOLL_MS = 90 * 1000;  // refetch if returned cache > 90s

export interface ReportingReadinessGateProps {
  /** When false the gate is invisible and reports `ready` immediately so existing flow is unchanged. */
  enabled: boolean;
  isDarkMode: boolean;
  /** Verdict reporter — parent uses this to gate the Open Dashboard button. */
  onChange?: (overall: ReadinessOverall, payload: ReadinessPayload | null) => void;
  /** Initials for telemetry (admin override + audit). */
  initials?: string | null;
  /** True if the current user is an admin and may use the override. */
  isAdmin?: boolean;
  /** Called when an admin clicks Proceed anyway. Records audit + fires `onChange('ready')` from the gate. */
  onAdminOverride?: (payload: ReadinessPayload | null) => void;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  payload: ReadinessPayload | null;
  fetchedAt: number;
}

const initialState: FetchState = {
  loading: true,
  error: null,
  payload: null,
  fetchedAt: 0,
};

// ─── visual helpers ───

const statusDotColour = (status: ReadinessStatus): string => {
  switch (status) {
    case 'ok': return colours.green;
    case 'warn': return colours.orange;
    case 'blocked': return colours.cta;
    case 'unknown':
    default: return colours.subtleGrey;
  }
};

const statusLabel = (status: ReadinessStatus): string => {
  switch (status) {
    case 'ok': return 'Ready';
    case 'warn': return 'Warning';
    case 'blocked': return 'Blocked';
    case 'unknown':
    default: return 'Unknown';
  }
};

const formatAge = (ageSeconds: number | null): string => {
  if (ageSeconds == null) return '—';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const mins = Math.round(ageSeconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const formatGeneratedAge = (generatedAt: string | null | undefined): string | null => {
  if (!generatedAt) return null;
  const ts = new Date(generatedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return formatAge(Math.max(0, Math.round((Date.now() - ts) / 1000)));
};

const shortenText = (text: string, maxLength = 42): string => {
  const compact = text.replace(/^Check failed:\s*/i, '').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
};

const compactCheckMessage = (check: ReadinessCheck): string => {
  if (check.status === 'ok') return formatAge(check.ageSeconds);

  if (check.reason === 'check-error') return 'Check unavailable';
  if (check.reason === 'no-snapshot') return 'No recent parity check';
  if (check.reason === 'snapshot-missing-scope') return 'Not checked yet';
  if (check.reason === 'snapshot-stale') return 'Refresh to verify';
  if (check.reason === 'minor-drift-aged-snapshot') return 'Refresh to confirm';
  if (check.reason === 'drift-exceeds-absolute' || check.reason === 'drift-exceeds-pct') return 'Drift vs Clio';
  if (check.reason === 'current-fill-failed') return 'WIP or collected fill failed';
  if (check.reason === 'current-fill-overdue') return 'WIP or collected fill overdue';
  if (check.reason === 'no-current-fill') return 'No recent WIP or collected fill';
  if (check.reason === 'hot-failed') return 'Scheduler failed';
  if (check.reason === 'hot-overdue') return 'Scheduler overdue';
  if (check.reason === 'no-hot-run') return 'No recent run';

  switch (check.id) {
    case 'collectedMtd':
      return 'Collected parity needs refresh';
    case 'wipWtd':
      return 'WIP parity needs refresh';
    case 'enquiriesFresh':
      return 'Enquiries feed looks stale';
    case 'mattersFresh':
      return 'Matters feed looks stale';
    case 'dataOpsScheduler':
      return 'Scheduler needs attention';
    case 'teamData':
      return 'Team data stale';
    case 'annualLeave':
      return 'Annual leave check stale';
    default:
      return shortenText(check.message || statusLabel(check.status));
  }
};

const compactStateLabel = (check: ReadinessCheck): string => {
  const message = compactCheckMessage(check);
  return `${check.label} · ${message}`;
};

// ─── component ───

const ReportingReadinessGate: React.FC<ReportingReadinessGateProps> = ({
  enabled,
  isDarkMode,
  onChange,
  initials,
  isAdmin = false,
  onAdminOverride,
}) => {
  const [state, setState] = useState<FetchState>(initialState);
  const [hasManualRefresh, setHasManualRefresh] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchReadiness = useCallback(async () => {
    if (!enabled) return;
    inFlightRef.current?.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/reporting/management-readiness', {
        signal: ctrl.signal,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Readiness check failed (${res.status})`);
      }
      const payload = (await res.json()) as ReadinessPayload;
      setState({ loading: false, error: null, payload, fetchedAt: Date.now() });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        loading: false,
        error: (err as Error).message || 'Could not load readiness',
        payload: null,
        fetchedAt: Date.now(),
      });
    }
  }, [enabled]);

  // Initial + polled fetch
  useEffect(() => {
    if (!enabled) return;
    void fetchReadiness();
    const id = window.setInterval(() => {
      void fetchReadiness();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      inFlightRef.current?.abort();
    };
  }, [enabled, fetchReadiness]);

  // Refetch if the server returned a stale cache
  useEffect(() => {
    if (!state.payload?.fromCache) return;
    const generatedAt = new Date(state.payload.generatedAt).getTime();
    if (Date.now() - generatedAt > MAX_AGE_BEFORE_REPOLL_MS) {
      void fetchReadiness();
    }
  }, [state.payload, fetchReadiness]);

  // Report verdict upward.
  useEffect(() => {
    if (!enabled) {
      onChange?.('ready', null);
      return;
    }
    if (state.error) {
      // Per failure-mode contract: don't hard-block on our own outage.
      onChange?.('warn', null);
      return;
    }
    if (state.payload) {
      onChange?.(hasManualRefresh ? state.payload.overall : 'warn', state.payload);
    }
  }, [enabled, state.payload, state.error, hasManualRefresh, onChange]);

  // Auto-collapse when all-green has been stable for SETTLE_DELAY_MS.
  useEffect(() => {
    if (!enabled) return;
    if (hasManualRefresh && state.payload?.overall === 'ready') {
      const id = window.setTimeout(() => setCollapsed(true), SETTLE_DELAY_MS);
      return () => window.clearTimeout(id);
    }
    setCollapsed(false);
  }, [enabled, hasManualRefresh, state.payload?.overall]);

  const handleRetry = useCallback(() => {
    const now = Date.now();
    if (now < retryAt) return;
    setHasManualRefresh(true);
    setRetryAt(now + RETRY_COOLDOWN_MS);
    // Force-clear server cache then refetch.
    fetch('/api/reporting/management-readiness/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .catch(() => { /* swallow — server may be degraded; still try the GET */ })
      .finally(() => {
        void fetchReadiness();
      });
  }, [retryAt, fetchReadiness]);

  const handleOverride = useCallback(() => {
    if (!isAdmin) return;
    // Audit hook — fire-and-forget telemetry endpoint if available.
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event: 'Reporting.Readiness.OverrideUsed',
          properties: {
            initials: initials || 'unknown',
            blockedChecks: (state.payload?.checks || [])
              .filter((c) => c.status === 'blocked')
              .map((c) => c.id)
              .join(','),
            overall: state.payload?.overall || 'unknown',
            generatedAt: state.payload?.generatedAt || '',
          },
        }),
      });
    } catch { /* no-op */ }
    onAdminOverride?.(state.payload);
  }, [isAdmin, initials, state.payload, onAdminOverride]);

  const checks = state.payload?.checks || [];
  const blockingChecks = useMemo(() => checks.filter((c) => c.blocking), [checks]);
  const blockingProblemChecks = useMemo(() => blockingChecks.filter((c) => c.status !== 'ok'), [blockingChecks]);
  const warnChecks = useMemo(() => checks.filter((c) => !c.blocking && c.status !== 'ok'), [checks]);
  const overall: ReadinessOverall = state.error
    ? 'warn'
    : state.payload?.overall || 'warn';
  const payloadAge = formatGeneratedAge(state.payload?.generatedAt);
  const issueCount = checks.filter((c) => c.status !== 'ok').length;
  const preflightDot = state.loading && !state.payload
    ? colours.highlight
    : state.error
      ? colours.orange
      : colours.subtleGrey;

  if (!enabled) return null;

  if (!hasManualRefresh) {
    const lastRunLabel = state.payload
      ? issueCount === 0
        ? 'Last run clear'
        : `${issueCount} issue${issueCount === 1 ? '' : 's'} last run`
      : state.error
        ? 'Checks unavailable'
        : null;

    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
          borderStyle: 'solid',
          borderWidth: 1,
          borderLeftWidth: 3,
          borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
          borderRadius: 0,
          animation: 'fadeInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: preflightDot,
              animation: state.loading ? 'pulse 1.4s ease-in-out infinite' : 'none',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            }}
          >
            {state.loading && !state.payload ? 'Loading trust state' : 'Refresh trust checks'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleRetry}
            disabled={state.loading || Date.now() < retryAt}
            style={{
              background: 'transparent',
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontSize: 11,
              padding: '4px 10px',
              cursor: state.loading ? 'wait' : 'pointer',
              opacity: state.loading || Date.now() < retryAt ? 0.5 : 1,
              borderRadius: 0,
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {payloadAge && (
            <span style={{
              fontSize: 10,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              padding: '2px 8px',
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
            }}>
              Last check {payloadAge}
            </span>
          )}
          {lastRunLabel && (
            <span style={{
              fontSize: 10,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              padding: '2px 8px',
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
            }}>
              {lastRunLabel}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Once all-green has settled, render a tiny confirmation chip instead of the whole strip.
  if (collapsed && overall === 'ready') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', marginBottom: 10,
          fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText,
          animation: 'fadeIn 0.4s ease-out',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: colours.green,
            animation: 'feedDotReady 1.4s ease-out',
          }}
        />
        <span>Trust checks passed · {checks.length} signals current</span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            color: 'inherit', textDecoration: 'underline',
            cursor: 'pointer', fontSize: 11, opacity: 0.8,
          }}
        >
          Show
        </button>
      </div>
    );
  }

  const surface = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const border = overall === 'blocked'
    ? colours.cta
    : overall === 'warn'
      ? colours.orange
      : isDarkMode ? colours.dark.border : '#e5e7eb';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        background: surface,
        borderStyle: 'solid',
        borderWidth: 1,
        borderLeftWidth: 3,
        borderColor: border,
        borderRadius: 0,
        animation: 'fadeInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusDotColour(overall === 'ready' ? 'ok' : overall === 'warn' ? 'warn' : 'blocked'),
            animation: state.loading
              ? 'pulse 1.4s ease-in-out infinite'
              : overall === 'ready' ? 'feedDotReady 1.4s ease-out' : 'none',
          }}
        />
        <span
          style={{
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: isDarkMode ? colours.dark.text : colours.light.text,
          }}
        >
          {state.loading && !state.payload ? 'Refreshing trust'
            : overall === 'ready' ? 'Trust current'
              : overall === 'warn' ? 'Check trust'
                : 'Hold entry'}
        </span>
        <span style={{ flex: 1 }} />
        {state.payload && (
          <span style={{
            fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText,
          }}>
            Built {state.payload.buildMs}ms · {state.payload.fromCache ? 'cached' : 'fresh'}
          </span>
        )}
        <button
          type="button"
          onClick={handleRetry}
          disabled={state.loading || Date.now() < retryAt}
          style={{
            background: 'transparent',
            border: `1px solid ${isDarkMode ? colours.dark.border : '#e5e7eb'}`,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            fontSize: 11, padding: '4px 10px',
            cursor: state.loading ? 'wait' : 'pointer',
            opacity: state.loading || Date.now() < retryAt ? 0.5 : 1,
            borderRadius: 0,
          }}
        >
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Error state — gate degrades to warn so MD still opens. */}
      {state.error && (
        <div style={{
          fontSize: 12, lineHeight: 1.4,
          color: isDarkMode ? '#d1d5db' : '#374151',
        }}>
          Trust checks unavailable. Refresh again or open Data Hub.
        </div>
      )}

      {/* Tiles for blocking checks */}
      {blockingProblemChecks.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 8,
        }}>
          {blockingProblemChecks.map((c, i) => (
            c.id === 'collectedMtd' ? (
              <RemediableCheckTile
                key={c.id}
                check={c}
                isDarkMode={isDarkMode}
                animationDelayMs={i * 60}
                onResolved={() => { void fetchReadiness(); }}
              />
            ) : (
              <CheckTile
                key={c.id}
                check={c}
                isDarkMode={isDarkMode}
                animationDelayMs={i * 60}
              />
            )
          ))}
        </div>
      )}

      {/* Warn-class strip */}
      {warnChecks.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          {warnChecks.map((c) => (
            <span key={c.id} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              lineHeight: 1.3,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              padding: '3px 8px',
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
            }}>
              <span aria-hidden style={{
                width: 5, height: 5, borderRadius: '50%',
                background: statusDotColour(c.status),
              }} />
              {compactStateLabel(c)}
            </span>
          ))}
        </div>
      )}

      {/* Blocked footer — admin override + reconciliation deep-link */}
      {overall === 'blocked' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: 8,
          borderTopStyle: 'solid',
          borderTopWidth: 1,
          borderTopColor: isDarkMode ? colours.dark.border : '#e5e7eb',
          fontSize: 10,
          color: isDarkMode ? colours.subtleGrey : colours.greyText,
        }}>
          <span style={{ flex: 1 }}>Issues remain after refresh.</span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleOverride}
              style={{
                background: 'transparent',
                borderStyle: 'solid',
                borderWidth: 1,
                borderColor: colours.cta,
                color: colours.cta,
                fontSize: 11, padding: '4px 10px',
                cursor: 'pointer', borderRadius: 0,
              }}
              title="Proceed anyway"
            >
              Proceed anyway
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── tile ───

interface CheckTileProps {
  check: ReadinessCheck;
  isDarkMode: boolean;
  animationDelayMs: number;
}

const CheckTile: React.FC<CheckTileProps> = ({ check, isDarkMode, animationDelayMs }) => {
  const dot = statusDotColour(check.status);
  const labelColour = isDarkMode ? colours.dark.text : colours.light.text;
  const subColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const tileBg = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';

  return (
    <div
      style={{
        padding: '8px 10px',
        background: tileBg,
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
        borderRadius: 0,
        opacity: 0,
        animation: `fadeInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${animationDelayMs}ms forwards`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
      title={check.message || statusLabel(check.status)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 7, height: 7, borderRadius: '50%', background: dot,
            animation: check.status === 'ok' ? 'feedDotReady 1.4s ease-out' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 11, fontWeight: 600, color: labelColour,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {check.label}
        </span>
      </div>
      <div style={{ fontSize: 10, color: subColour, lineHeight: 1.4 }}>
        {compactCheckMessage(check)}
      </div>
      {check.measured && check.measured.drift != null && Number(check.measured.drift) > 0 && (
        <div style={{ fontSize: 10, color: dot, fontWeight: 600 }}>
          Drift £{Number(check.measured.drift).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
          {check.measured.driftPct != null ? ` · ${Number(check.measured.driftPct).toFixed(2)}%` : ''}
        </div>
      )}
    </div>
  );
};

// ─── remediable tile (Phase D) ───────────────────────────────────────────
// Wraps the standard CheckTile with a ghost "Sync now" button. On success
// we morph the drift figure to £0 and ask the parent to refetch readiness;
// on persistent failure we surface "Access paused — Luke notified". The
// 2-attempt ceiling is enforced server-side, not here.

interface RemediableCheckTileProps extends CheckTileProps {
  onResolved: () => void;
}

const RemediableCheckTile: React.FC<RemediableCheckTileProps> = ({
  check, isDarkMode, animationDelayMs, onResolved,
}) => {
  const { state, remediate } = useReadinessRemediate(check.id);
  const dot = statusDotColour(check.status);
  const labelColour = isDarkMode ? colours.dark.text : colours.light.text;
  const subColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const tileBg = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  const initialDrift = useRef<number | null>(
    check.measured && check.measured.drift != null ? Number(check.measured.drift) : null,
  );

  const handleClick = useCallback(async () => {
    const result = await remediate();
    if (result.status === 'resolved') {
      window.setTimeout(() => onResolved(), 700);
    }
  }, [remediate, onResolved]);

  const isRunning = state.status === 'running';
  const isResolved = state.status === 'resolved';
  const isEscalated = state.status === 'escalated';
  const isPersisted = state.status === 'persisted';
  const isFailed = state.status === 'failed';

  const driftNow = isResolved ? 0 : (initialDrift.current ?? 0);
  const showMorph = initialDrift.current != null && initialDrift.current > 0;

  return (
    <div
      style={{
        padding: '8px 10px',
        background: tileBg,
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: isDarkMode ? colours.dark.border : '#e5e7eb',
        borderRadius: 0,
        opacity: 0,
        animation: `fadeInUp 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${animationDelayMs}ms forwards`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
      title={check.message || statusLabel(check.status)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isResolved ? colours.green : dot,
            animation: isResolved
              ? 'feedDotReady 1.4s ease-out'
              : (isRunning ? 'pulse 1.2s ease-in-out infinite' : 'none'),
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 11, fontWeight: 600, color: labelColour,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {check.label}
        </span>
      </div>
      <div style={{ fontSize: 10, color: subColour, lineHeight: 1.4 }}>
        {isResolved
          ? 'Refreshing…'
          : isRunning
            ? 'Syncing Clio…'
            : compactCheckMessage(check)}
      </div>
      {showMorph && (
        <div style={{ fontSize: 10, color: isResolved ? colours.green : dot, fontWeight: 600 }}>
          Drift £
          <ValueMorph
            from={initialDrift.current!}
            to={driftNow}
            durationMs={600}
          />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {!isEscalated && !isResolved && (
          <button
            type="button"
            onClick={handleClick}
            disabled={isRunning}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 0,
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: isRunning ? subColour : colours.highlight,
              background: 'transparent',
              color: isRunning ? subColour : colours.highlight,
              cursor: isRunning ? 'progress' : 'pointer',
              fontWeight: 600,
            }}
          >
            {isRunning ? 'Syncing…' : (isPersisted || isFailed) ? 'Try again' : 'Sync now'}
          </button>
        )}
        {isPersisted && state.attemptsRemaining != null && (
          <span style={{ fontSize: 10, color: subColour }}>
            {state.attemptsRemaining} attempt{state.attemptsRemaining === 1 ? '' : 's'} left before escalation
          </span>
        )}
        {isEscalated && (
          <span style={{ fontSize: 10, color: colours.cta, fontWeight: 600 }}>
            Access paused — Luke notified
          </span>
        )}
        {isFailed && state.error && (
          <span style={{ fontSize: 10, color: subColour }}>
            {state.error}
          </span>
        )}
      </div>
    </div>
  );
};

export default ReportingReadinessGate;
