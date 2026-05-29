/**
 * Per-source trust layer for Reporting Home report cards.
 *
 * Layered on top of the existing dataset fetch state (idle/loading/ready/error),
 * trust state asks: "did the data we fetched also pass its pressure-test
 * (server-side readiness check)?". Most sources have no check yet — they fall
 * through as `unsupported` and the card behaves exactly as before.
 *
 * Wired against the existing `/api/reporting/management-readiness` endpoint
 * and `ReadinessCheckId` taxonomy in `readiness.types.ts` — no new server work.
 *
 * Narrow first slice: only the Management Dashboard card maps its sources to
 * checks. Promote other reports by adding entries to `REPORT_SOURCE_TRUST_MANIFEST`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ReadinessCheck,
  ReadinessCheckId,
  ReadinessPayload,
} from './readiness.types';

const READINESS_SIMULATION_STORAGE_KEY = 'helix:reporting:managementBlockerSimulation';
export const READINESS_SIMULATION_CHANGED_EVENT = 'helix:reporting-readiness-simulation-changed';
let simulationControlInitials: string | null = null;

export interface SimulatedManagementBlockerOptions {
  checkId?: ReadinessCheckId;
  message?: string;
  reason?: string;
  retryAfterSeconds?: number;
}

interface ReportingSimulationApi {
  simulateManagementBlocker: (options?: SimulatedManagementBlockerOptions) => ReadinessPayload | null;
  clearManagementBlockerSimulation: () => void;
}

declare global {
  interface Window {
    helixReporting?: ReportingSimulationApi;
    __helix__?: Record<string, unknown>;
  }
}

export type TrustState =
  /** No readiness check exists for this source (today's behaviour). */
  | 'unsupported'
  /** Awaiting first readiness payload, or fetch still in flight. */
  | 'checking'
  /** Server check returned `ok` against the underlying signal. */
  | 'passed'
  /** Server check returned `warn` (drift / mild staleness). */
  | 'stale'
  /** Server check returned `blocked` (failed evidence). */
  | 'failed'
  /** Operator-triggered remediation in flight. */
  | 'repairing';

/**
 * Maps `report.key` → `requiredDataset key` → `ReadinessCheckId`.
 *
 * Only sources backed by a true cross-system pressure test (SQL ↔ Clio drift
 * comparison) appear here. Freshness/presence checks like `enquiriesFresh`,
 * `mattersFresh`, `teamData`, `userData`, `annualLeave` are deliberately
 * excluded — they are watermark sanity checks, not pressure tests, and
 * surfacing them as ring states would over-claim trust scope.
 *
 * Sources not present render as `unsupported` (today's plain dot).
 */
export const REPORT_SOURCE_TRUST_MANIFEST: Record<string, Partial<Record<string, ReadinessCheckId>>> = {
  dashboard: {
    wip: 'wipWtd',
    recoveredFees: 'collectedMtd',
  },
};

export const MANAGEMENT_PRESSURE_TEST_CHECK_IDS: ReadonlyArray<ReadinessCheckId> = Object.values(
  REPORT_SOURCE_TRUST_MANIFEST.dashboard,
).filter((checkId): checkId is ReadinessCheckId => Boolean(checkId));

export const MANAGEMENT_ENTRY_CHECK_IDS: ReadonlyArray<ReadinessCheckId> = [
  ...MANAGEMENT_PRESSURE_TEST_CHECK_IDS,
  'dataOpsScheduler',
];

const isLukeInitials = (initials?: string | null): boolean => (
  typeof initials === 'string' && initials.trim().toUpperCase() === 'LZ'
);

const getCurrentInitials = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem('__currentUserInitials')?.trim().toUpperCase() || '';
  } catch {
    return '';
  }
};

const canUseManagementBlockerSimulation = (initials?: string | null): boolean => (
  isLukeInitials(initials) || isLukeInitials(simulationControlInitials) || getCurrentInitials() === 'LZ'
);

const readSimulationOptions = (): SimulatedManagementBlockerOptions | null => {
  if (typeof window === 'undefined' || !canUseManagementBlockerSimulation()) return null;
  try {
    const raw = window.localStorage.getItem(READINESS_SIMULATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SimulatedManagementBlockerOptions;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const notifySimulationChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(READINESS_SIMULATION_CHANGED_EVENT));
};

const simulatedCheckLabel = (checkId: ReadinessCheckId): string => {
  switch (checkId) {
    case 'wipWtd': return 'WIP WTD parity';
    case 'collectedMtd': return 'Collected MTD parity';
    default: return 'Management readiness';
  }
};

const defaultSimulationMessage = (checkId: ReadinessCheckId): string => {
  switch (checkId) {
    case 'wipWtd': return 'WIP parity check is paused after a source limit. Retry once the source window clears.';
    case 'collectedMtd': return 'Collected fees parity needs a fresh source check before the dashboard opens.';
    default: return 'A reporting source check needs attention before the dashboard opens.';
  }
};

const buildSimulatedCheck = (options: SimulatedManagementBlockerOptions): ReadinessCheck => {
  const checkId = options.checkId || 'wipWtd';
  return {
    id: checkId,
    label: simulatedCheckLabel(checkId),
    status: 'blocked',
    blocking: true,
    ageSeconds: 0,
    lastGoodAt: null,
    source: 'inferred',
    measured: {
      simulated: 'true',
      retryAfterSeconds: typeof options.retryAfterSeconds === 'number' ? options.retryAfterSeconds : 60,
    },
    threshold: null,
    reason: options.reason || 'simulated-blocker',
    message: options.message || defaultSimulationMessage(checkId),
    remediation: 'retry',
  };
};

export function getReadinessRetryHint(check: ReadinessCheck | null | undefined): string | null {
  if (!check) return null;
  const measuredRetry = Number(check.measured?.retryAfterSeconds ?? check.measured?.retryInSeconds ?? check.measured?.retrySeconds);
  if (Number.isFinite(measuredRetry) && measuredRetry > 0) {
    if (measuredRetry < 90) return `Retry in about ${Math.round(measuredRetry)}s`;
    return `Retry in about ${Math.ceil(measuredRetry / 60)}m`;
  }
  const retryMatch = typeof check.message === 'string'
    ? check.message.match(/retry\s+in\s+(\d+)\s+seconds?/i)
    : null;
  if (retryMatch) {
    const seconds = Number(retryMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds < 90 ? `Retry in about ${seconds}s` : `Retry in about ${Math.ceil(seconds / 60)}m`;
    }
  }
  return null;
}

export function formatReadinessBlockerDetail(check: ReadinessCheck | null | undefined): string | null {
  if (!check) return null;
  const reason = check.message || check.label || 'A reporting source check needs attention.';
  const retryHint = getReadinessRetryHint(check);
  const alreadyHasRetryWindow = /retry\s+in\s+\d+\s+seconds?/i.test(reason);
  return retryHint && !alreadyHasRetryWindow ? `${reason} ${retryHint}.` : reason;
}

export function applyReadinessSimulation(payload: ReadinessPayload | null): ReadinessPayload | null {
  const options = readSimulationOptions();
  if (!options) return payload;
  const simulatedCheck = buildSimulatedCheck(options);
  const base = payload ?? {
    generatedAt: new Date().toISOString(),
    overall: 'ready' as const,
    buildMs: 0,
    fromCache: false,
    checks: [],
  };
  const checks = base.checks.filter((check) => check.id !== simulatedCheck.id);
  return {
    ...base,
    generatedAt: new Date().toISOString(),
    overall: 'blocked',
    fromCache: false,
    checks: [simulatedCheck, ...checks],
  };
}

export function simulateManagementBlocker(options: SimulatedManagementBlockerOptions = {}): ReadinessPayload | null {
  if (typeof window === 'undefined' || !canUseManagementBlockerSimulation()) return null;
  const safeOptions: SimulatedManagementBlockerOptions = {
    checkId: options.checkId || 'wipWtd',
    message: options.message,
    reason: options.reason,
    retryAfterSeconds: typeof options.retryAfterSeconds === 'number' ? options.retryAfterSeconds : 60,
  };
  try {
    window.localStorage.setItem(READINESS_SIMULATION_STORAGE_KEY, JSON.stringify(safeOptions));
  } catch {
    return null;
  }
  notifySimulationChanged();
  return applyReadinessSimulation(sharedState.payload);
}

export function clearManagementBlockerSimulation(): void {
  if (typeof window === 'undefined' || !canUseManagementBlockerSimulation()) return;
  try {
    window.localStorage.removeItem(READINESS_SIMULATION_STORAGE_KEY);
  } catch {
    return;
  }
  notifySimulationChanged();
}

export function registerManagementBlockerSimulationControls(initials?: string | null): () => void {
  if (typeof window === 'undefined' || !canUseManagementBlockerSimulation(initials)) return () => undefined;
  simulationControlInitials = initials || null;
  const api: ReportingSimulationApi = {
    simulateManagementBlocker,
    clearManagementBlockerSimulation,
  };
  window.helixReporting = api;
  if (window.__helix__) {
    window.__helix__.simulateManagementBlocker = simulateManagementBlocker;
    window.__helix__.clearManagementBlockerSimulation = clearManagementBlockerSimulation;
  }
  return () => {
    if (window.helixReporting === api) {
      delete window.helixReporting;
    }
    if (window.__helix__?.simulateManagementBlocker === simulateManagementBlocker) {
      delete window.__helix__.simulateManagementBlocker;
    }
    if (window.__helix__?.clearManagementBlockerSimulation === clearManagementBlockerSimulation) {
      delete window.__helix__.clearManagementBlockerSimulation;
    }
    if (simulationControlInitials === initials) {
      simulationControlInitials = null;
    }
  };
}

/**
 * Resolve the readiness check that backs a (report, dataset) pair, or null
 * when no check has been wired up.
 */
export function getTrustCheckId(
  reportKey: string,
  datasetKey: string,
): ReadinessCheckId | null {
  return REPORT_SOURCE_TRUST_MANIFEST[reportKey]?.[datasetKey] ?? null;
}

/**
 * Derive the visible trust state for a single source from:
 *   - the readiness payload (may be absent during initial load)
 *   - the wired-up checkId (null = unsupported)
 *   - the source's current fetch status (idle/loading/ready/error)
 */
export function deriveTrustState(
  payload: ReadinessPayload | null,
  checkId: ReadinessCheckId | null,
  fetchStatus: 'idle' | 'loading' | 'ready' | 'error',
): TrustState {
  if (!checkId) return 'unsupported';
  // Don't claim trust before the data has been fetched at least once.
  if (fetchStatus !== 'ready') return 'checking';
  if (!payload) return 'checking';
  const check = payload.checks.find((c) => c.id === checkId);
  if (!check) return 'unsupported';
  if (
    (check.status === 'unknown' || check.status === 'warn') &&
    (check.reason === 'no-snapshot' || check.reason === 'snapshot-missing-scope')
  ) {
    return 'unsupported';
  }
  switch (check.status) {
    case 'ok': return 'passed';
    case 'warn': return 'stale';
    case 'blocked': return 'failed';
    default: return 'checking';
  }
}

/**
 * Look up the raw check object for a source — handy when the UI needs the
 * `message` / `reason` for tooltip copy.
 */
export function findTrustCheck(
  payload: ReadinessPayload | null,
  checkId: ReadinessCheckId | null,
): ReadinessCheck | null {
  if (!payload || !checkId) return null;
  return payload.checks.find((c) => c.id === checkId) ?? null;
}

/* ─── Shared readiness payload hook ─────────────────────────────────────
 *
 * Multiple consumers (ManagementAccessIndicator, the per-source trust dots,
 * the future trust rail) all want the same payload. To avoid each component
 * polling independently we keep a tiny module-level cache + subscriber list.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const STALE_REPOLL_MS = 90 * 1000;

interface SharedState {
  payload: ReadinessPayload | null;
  loading: boolean;
  error: string | null;
}

let sharedState: SharedState = { payload: null, loading: false, error: null };
let inFlight: AbortController | null = null;
let pollTimer: number | null = null;
let lastFetchAt = 0;
const subscribers = new Set<(s: SharedState) => void>();

function notify(): void {
  for (const fn of subscribers) {
    try { fn(sharedState); } catch { /* swallow subscriber errors */ }
  }
}

async function fetchSharedReadiness(force = false): Promise<void> {
  if (!force && sharedState.loading) return;
  if (!force && Date.now() - lastFetchAt < 1000) return; // simple debounce
  inFlight?.abort();
  const ctrl = new AbortController();
  inFlight = ctrl;
  sharedState = { ...sharedState, loading: true, error: null };
  notify();
  try {
    const res = await fetch('/api/reporting/management-readiness', {
      signal: ctrl.signal,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Readiness check failed (${res.status})`);
    const payload = applyReadinessSimulation((await res.json()) as ReadinessPayload);
    sharedState = { payload, loading: false, error: null };
    lastFetchAt = Date.now();
    notify();
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    sharedState = {
      ...sharedState,
      loading: false,
      error: (err as Error).message || 'Could not load readiness',
    };
    notify();
  }
}

/**
 * Subscribe to the shared readiness payload. First mount triggers a fetch;
 * subsequent mounts share the cached payload + a single 5-minute poller.
 */
export function useReportingReadiness(enabled: boolean = true): {
  payload: ReadinessPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = useState<SharedState>(sharedState);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    const sub = (s: SharedState) => setSnapshot(s);
    subscribers.add(sub);

    // Trigger initial fetch if payload is missing or stale.
    const stale =
      !sharedState.payload ||
      Date.now() - lastFetchAt > STALE_REPOLL_MS;
    if (stale && !sharedState.loading) {
      void fetchSharedReadiness();
    } else {
      setSnapshot(sharedState);
    }

    // Single shared poller — only the first subscriber starts it.
    if (pollTimer === null && typeof window !== 'undefined') {
      pollTimer = window.setInterval(() => {
        if (subscribers.size > 0) void fetchSharedReadiness();
      }, POLL_INTERVAL_MS);
    }

    const handleSimulationChanged = () => { void fetchSharedReadiness(true); };
    if (typeof window !== 'undefined') {
      window.addEventListener(READINESS_SIMULATION_CHANGED_EVENT, handleSimulationChanged);
    }

    return () => {
      subscribers.delete(sub);
      if (typeof window !== 'undefined') {
        window.removeEventListener(READINESS_SIMULATION_CHANGED_EVENT, handleSimulationChanged);
      }
      // Tear down the poller when the last consumer unmounts to avoid
      // background fetches on tabs the user has navigated away from.
      if (subscribers.size === 0 && pollTimer !== null && typeof window !== 'undefined') {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, [enabled]);

  const refresh = useCallback(() => { void fetchSharedReadiness(true); }, []);

  return {
    payload: snapshot.payload,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh,
  };
}
