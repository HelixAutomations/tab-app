/**
 * Hook for the Phase D remediation flow on the Management Dashboard
 * trust gate. Owns the per-check "Sync now" lifecycle: started → resolved
 * | persisted | escalated | failed.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReadinessCheckId } from './readiness.types';

export type RemediateStatus =
  | 'idle'
  | 'running'
  | 'resolved'
  | 'persisted'
  | 'escalated'
  | 'failed';

export interface RemediateState {
  status: RemediateStatus;
  attempts: number;
  attemptsRemaining: number | null;
  durationMs: number | null;
  error: string | null;
  /** Server returns a small slice on success. */
  result: {
    deletedRows: number | null;
    insertedRows: number | null;
    syncDurationMs: number | null;
    noData: boolean;
  } | null;
}

const initialState: RemediateState = {
  status: 'idle',
  attempts: 0,
  attemptsRemaining: null,
  durationMs: null,
  error: null,
  result: null,
};

export interface UseReadinessRemediate {
  state: RemediateState;
  /** Kicks off remediation. Resolves when server returns. */
  remediate: () => Promise<RemediateState>;
  reset: () => void;
}

export function useReadinessRemediate(checkId: ReadinessCheckId): UseReadinessRemediate {
  const [state, setState] = useState<RemediateState>(initialState);
  const stateRef = useRef<RemediateState>(initialState);
  stateRef.current = state;
  const inFlightRef = useRef<AbortController | null>(null);

  const remediate = useCallback(async (): Promise<RemediateState> => {
    inFlightRef.current?.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;

    setState((prev) => ({ ...prev, status: 'running', error: null }));

    try {
      const res = await fetch('/api/reporting/management-readiness/remediate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));

      // Map server response onto local state.
      let next: RemediateState;
      if (res.ok && data.ok) {
        next = {
          status: 'resolved',
          attempts: 1,
          attemptsRemaining: null,
          durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
          error: null,
          result: data.result || null,
        };
      } else if (data.status === 'escalated') {
        next = {
          status: 'escalated',
          attempts: typeof data.attempts === 'number' ? data.attempts : 2,
          attemptsRemaining: 0,
          durationMs: null,
          error: data.error || 'Remediation escalated',
          result: null,
        };
      } else if (data.status === 'persisted') {
        next = {
          status: 'persisted',
          attempts: typeof data.attempts === 'number' ? data.attempts : 1,
          attemptsRemaining: typeof data.attemptsRemaining === 'number' ? data.attemptsRemaining : null,
          durationMs: null,
          error: data.error || 'Remediation did not resolve the signal',
          result: null,
        };
      } else {
        next = {
          status: 'failed',
          attempts: 0,
          attemptsRemaining: null,
          durationMs: null,
          error: data.error || `Remediation request failed (${res.status})`,
          result: null,
        };
      }
      setState(next);
      return next;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return stateRef.current;
      const next: RemediateState = {
        status: 'failed',
        attempts: 0,
        attemptsRemaining: null,
        durationMs: null,
        error: (err as Error).message || 'Network error',
        result: null,
      };
      setState(next);
      return next;
    }
  }, [checkId]);

  const reset = useCallback(() => setState(initialState), []);

  return { state, remediate, reset };
}
