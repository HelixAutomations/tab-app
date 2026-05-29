/**
 * Management access indicator — Phase C entry-UX redesign.
 *
 * Replaces the prominent ReportingReadinessGate strip above the Management
 * Dashboard hero card with a single inline status dot. Clicking the dot opens
 * a compact popover with the most relevant blocked/warn reason and one button
 * (`Refresh and retry`) that fires the existing remediation endpoint.
 *
 * The full diagnostic rail still ships inside the dashboard via
 * ManagementDashboardTrustRail. This indicator is the entry-surface affordance
 * only — it must read like a normal first-class tab, not a debug page.
 *
 * Verdict reporting (`onChange`) is preserved so the parent can still refuse
 * to open the dashboard while `blocked` is true.
 *
 * See docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md §Phase C.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../app/styles/colours';
import type {
  ReadinessCheck,
  ReadinessOverall,
  ReadinessPayload,
} from './readiness.types';
import {
  MANAGEMENT_ENTRY_CHECK_IDS,
  READINESS_SIMULATION_CHANGED_EVENT,
  applyReadinessSimulation,
  formatReadinessBlockerDetail,
} from './reportTrust';
import { useReadinessRemediate } from './useReadinessRemediate';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_COOLDOWN_MS = 4 * 1000;
const MAX_AGE_BEFORE_REPOLL_MS = 90 * 1000;

export interface ManagementAccessIndicatorProps {
  enabled: boolean;
  isDarkMode: boolean;
  onChange?: (overall: ReadinessOverall, payload: ReadinessPayload | null) => void;
  initials?: string | null;
  isAdmin?: boolean;
  onAdminOverride?: (payload: ReadinessPayload | null) => void;
  /** Optional click handler so callers can scroll the in-dashboard trust rail into view. */
  onShowDetails?: () => void;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  payload: ReadinessPayload | null;
}

const initialState: FetchState = {
  loading: true,
  error: null,
  payload: null,
};

const getScopedChecks = (payload: ReadinessPayload | null): ReadinessCheck[] => (
  payload?.checks.filter((check) => MANAGEMENT_ENTRY_CHECK_IDS.includes(check.id)) ?? []
);

const isPreflightUnknown = (check: ReadinessCheck | null): boolean => {
  if (!check) return false;
  return check.reason === 'no-snapshot' || check.reason === 'snapshot-missing-scope';
};

const dotColour = (overall: ReadinessOverall, hasError: boolean, neutralUnknown: boolean): string => {
  if (hasError) return colours.orange;
  if (neutralUnknown) return colours.subtleGrey;
  switch (overall) {
    case 'ready': return colours.green;
    case 'warn': return colours.orange;
    case 'blocked': return colours.cta;
    default: return colours.subtleGrey;
  }
};

const compactReason = (check: ReadinessCheck): string => {
  if (check.reason === 'check-error') return 'Check unavailable';
  if (check.reason === 'no-snapshot') return 'Collected parity not checked yet';
  if (check.reason === 'snapshot-missing-scope') return 'Collected parity not checked yet';
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
    case 'collectedMtd': return 'Collected parity needs refresh';
    case 'wipWtd': return 'WIP parity needs refresh';
    case 'enquiriesFresh': return 'Enquiries feed looks stale';
    case 'mattersFresh': return 'Matters feed looks stale';
    case 'dataOpsScheduler': return 'Scheduler needs attention';
    case 'teamData': return 'Team data stale';
    case 'annualLeave': return 'Annual leave check stale';
    default: return check.message || 'Needs attention';
  }
};

const pickTopProblem = (payload: ReadinessPayload | null): ReadinessCheck | null => {
  if (!payload) return null;
  const checks = getScopedChecks(payload);
  // Prefer blocking-then-non-ok, then warn, then neutral preflight-unknown.
  const blockedFirst = checks.find((c) => c.blocking && !isPreflightUnknown(c) && c.status === 'blocked');
  if (blockedFirst) return blockedFirst;
  const warned = checks.find((c) => !isPreflightUnknown(c) && c.status !== 'ok');
  if (warned) return warned;
  return checks.find((c) => isPreflightUnknown(c)) || null;
};

const scopedOverallFor = (payload: ReadinessPayload | null): ReadinessOverall => {
  const checks = getScopedChecks(payload);
  const actionableChecks = checks.filter((check) => !isPreflightUnknown(check));
  const blockedAny = actionableChecks.some((check) => check.blocking && check.status === 'blocked');
  const warnAny = actionableChecks.some((check) => check.status === 'warn' || (check.blocking && check.status === 'unknown'));
  return blockedAny ? 'blocked' : warnAny ? 'warn' : 'ready';
};

const headlineFor = (overall: ReadinessOverall, hasError: boolean, payload: ReadinessPayload | null): string => {
  if (hasError) return 'Trust checks unavailable';
  const top = pickTopProblem(payload);
  if (isPreflightUnknown(top)) return 'Collected parity not checked yet';
  switch (overall) {
    case 'ready': return 'All trust checks passing';
    case 'warn': {
      return top ? compactReason(top) : 'Minor advisory';
    }
    case 'blocked': {
      return top ? compactReason(top) : 'Access paused';
    }
    default: return 'Checking…';
  }
};

const ManagementAccessIndicator: React.FC<ManagementAccessIndicatorProps> = ({
  enabled,
  isDarkMode,
  onChange,
  initials,
  isAdmin = false,
  onAdminOverride,
  onShowDetails,
}) => {
  const [state, setState] = useState<FetchState>(initialState);
  const [open, setOpen] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const inFlightRef = useRef<AbortController | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { state: remediateState, remediate } = useReadinessRemediate('collectedMtd');

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
      if (!res.ok) throw new Error(`Readiness check failed (${res.status})`);
      const payload = applyReadinessSimulation((await res.json()) as ReadinessPayload);
      setState({ loading: false, error: null, payload });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        loading: false,
        error: (err as Error).message || 'Could not load readiness',
        payload: null,
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void fetchReadiness();
    const id = window.setInterval(() => { void fetchReadiness(); }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      inFlightRef.current?.abort();
    };
  }, [enabled, fetchReadiness]);

  useEffect(() => {
    if (!enabled) return;
    const handleSimulationChanged = () => { void fetchReadiness(); };
    window.addEventListener(READINESS_SIMULATION_CHANGED_EVENT, handleSimulationChanged);
    return () => window.removeEventListener(READINESS_SIMULATION_CHANGED_EVENT, handleSimulationChanged);
  }, [enabled, fetchReadiness]);

  // Refetch if the server returned a stale cache.
  useEffect(() => {
    if (!state.payload?.fromCache) return;
    const generatedAt = new Date(state.payload.generatedAt).getTime();
    if (Date.now() - generatedAt > MAX_AGE_BEFORE_REPOLL_MS) {
      void fetchReadiness();
    }
  }, [state.payload, fetchReadiness]);

  // Report verdict upward — trust the latest payload immediately (no manual-refresh gate).
  useEffect(() => {
    if (!enabled) {
      onChange?.('ready', null);
      return;
    }
    if (state.error) {
      onChange?.('warn', null);
      return;
    }
    if (state.payload) onChange?.(scopedOverallFor(state.payload), state.payload);
  }, [enabled, state.payload, state.error, onChange]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now < retryAt) return;
    setRetryAt(now + RETRY_COOLDOWN_MS);
    void fetch('/api/reporting/management-readiness/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .catch(() => { /* swallow — still try the GET */ })
      .finally(() => { void fetchReadiness(); });
  }, [retryAt, fetchReadiness]);

  const handleRunCollectedCheck = useCallback(() => {
    if (remediateState.status === 'running') return;
    void remediate().finally(() => { void fetchReadiness(); });
  }, [fetchReadiness, remediate, remediateState.status]);

  const handleOverride = useCallback(() => {
    if (!isAdmin) return;
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event: 'Reporting.Readiness.OverrideUsed',
          properties: {
            initials: initials || 'unknown',
            blockedChecks: getScopedChecks(state.payload)
              .filter((c) => c.status === 'blocked').map((c) => c.id).join(','),
            overall: scopedOverallFor(state.payload),
            generatedAt: state.payload?.generatedAt || '',
          },
        }),
      });
    } catch { /* no-op */ }
    onAdminOverride?.(state.payload);
    setOpen(false);
  }, [isAdmin, initials, state.payload, onAdminOverride]);

  const scopedChecks = useMemo(() => getScopedChecks(state.payload), [state.payload]);
  const topProblem = useMemo(() => pickTopProblem(state.payload), [state.payload]);
  const actionableSignalCount = useMemo(
    () => scopedChecks.filter((check) => check.status !== 'ok' && !isPreflightUnknown(check)).length,
    [scopedChecks],
  );
  const neutralUnknown = isPreflightUnknown(topProblem);
  const overall: ReadinessOverall = state.error ? 'warn' : scopedOverallFor(state.payload);
  const hasError = !!state.error;
  const colour = dotColour(overall, hasError, neutralUnknown);
  const headline = useMemo(() => headlineFor(overall, hasError, state.payload), [overall, hasError, state.payload]);
  const problemDetail = useMemo(() => formatReadinessBlockerDetail(topProblem), [topProblem]);
  const isLoading = state.loading && !state.payload;
  const showPing = !isLoading && !neutralUnknown && (overall === 'warn' || overall === 'blocked' || hasError);

  if (!enabled) return null;

  const subText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const labelText = isDarkMode ? colours.dark.text : colours.light.text;
  const surface = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const borderColor = isDarkMode ? colours.dark.border : '#e5e7eb';

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Reporting trust: ${overall}. ${headline}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={headline}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '2px 4px',
          margin: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 0,
          color: subText,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'relative',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: colour,
            boxShadow: showPing ? `0 0 0 0 ${colour}55` : 'none',
            animation: isLoading
              ? 'pulse 1.4s ease-in-out infinite'
              : showPing
                ? 'feedDotReady 1.6s ease-out infinite'
                : 'none',
            display: 'inline-block',
          }}
        />
        {overall !== 'ready' || hasError ? (
          <span style={{ color: colour }}>
            {hasError ? 'Check' : overall === 'blocked' ? 'Hold' : 'Review'}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Reporting trust details"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            left: 'auto',
            zIndex: 30,
            width: 'min(320px, calc(100vw - 24px))',
            minWidth: 240,
            maxWidth: 'calc(100vw - 24px)',
            padding: '10px 12px',
            background: surface,
            borderStyle: 'solid',
            borderWidth: 1,
            borderLeftWidth: 3,
            borderColor,
            borderLeftColor: colour,
            borderRadius: 0,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            animation: 'fadeInUp 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: labelText,
            lineHeight: 1.35,
          }}>
            {headline}
          </div>
          {state.payload && (
            <div style={{ fontSize: 10, color: subText }}>
              {problemDetail && !neutralUnknown
                ? problemDetail
                : neutralUnknown
                ? 'Pressure test not run yet.'
                : actionableSignalCount === 0
                  ? 'Collected parity is current.'
                  : `${actionableSignalCount} pressure-test signal${actionableSignalCount === 1 ? '' : 's'} need attention.`}
            </div>
          )}
          {(overall !== 'ready' || hasError || neutralUnknown) && (
            <button
              type="button"
              onClick={topProblem?.id === 'collectedMtd' ? handleRunCollectedCheck : handleRefresh}
              disabled={state.loading || remediateState.status === 'running' || Date.now() < retryAt}
              style={{
                background: colour,
                border: 'none',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 10px',
                cursor: state.loading || remediateState.status === 'running' ? 'wait' : 'pointer',
                opacity: state.loading || remediateState.status === 'running' || Date.now() < retryAt ? 0.6 : 1,
                borderRadius: 0,
                alignSelf: 'flex-start',
              }}
            >
              {remediateState.status === 'running'
                ? 'Running check…'
                : neutralUnknown
                  ? 'Run check now'
                  : topProblem?.id === 'collectedMtd'
                    ? 'Sync and retry'
                    : state.loading
                      ? 'Refreshing…'
                      : 'Refresh and retry'}
            </button>
          )}
          {overall === 'blocked' && isAdmin && (
            <button
              type="button"
              onClick={handleOverride}
              style={{
                background: 'transparent',
                borderStyle: 'solid',
                borderWidth: 1,
                borderColor: colours.cta,
                color: colours.cta,
                fontSize: 10,
                padding: '4px 8px',
                cursor: 'pointer',
                borderRadius: 0,
                alignSelf: 'flex-start',
                whiteSpace: 'nowrap',
              }}
              title="Proceed anyway (audit recorded)"
            >
              Proceed anyway
            </button>
          )}
          {onShowDetails && (
            <button
              type="button"
              onClick={() => { setOpen(false); onShowDetails(); }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: subText,
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: 10,
                alignSelf: 'flex-start',
              }}
            >
              View all checks
            </button>
          )}
        </div>
      )}
    </span>
  );
};

export default ManagementAccessIndicator;
