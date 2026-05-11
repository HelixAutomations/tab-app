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
    recoveredFees: 'collectedMtd',
  },
};

export const MANAGEMENT_PRESSURE_TEST_CHECK_IDS: ReadonlyArray<ReadinessCheckId> = Object.values(
  REPORT_SOURCE_TRUST_MANIFEST.dashboard,
).filter((checkId): checkId is ReadinessCheckId => Boolean(checkId));

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
    const payload = (await res.json()) as ReadinessPayload;
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

    return () => {
      subscribers.delete(sub);
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
