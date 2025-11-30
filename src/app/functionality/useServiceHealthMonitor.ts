import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ServiceHealthState {
  isUnavailable: boolean;
  lastStatus?: number;
  lastUrl?: string;
  lastError?: string;
  lastChecked?: Date;
  consecutiveFailures: number;
}

interface ServiceHealthOptions {
  enabled?: boolean;
  monitorStatuses?: number[];
  resetDelayMs?: number;
}

const DEFAULT_MONITORED_STATUSES = [502, 503, 504];
const DEFAULT_RESET_DELAY_MS = 8000;

export function useServiceHealthMonitor(options: ServiceHealthOptions = {}) {
  const { enabled = typeof window !== 'undefined', monitorStatuses = DEFAULT_MONITORED_STATUSES, resetDelayMs = DEFAULT_RESET_DELAY_MS } = options;
  const [state, setState] = useState<ServiceHealthState>({ isUnavailable: false, consecutiveFailures: 0 });
  const stateRef = useRef(state);
  const timerRef = useRef<number | null>(null);

  const monitoredKey = monitorStatuses.join(',');
  const normalizedStatuses = useMemo(() => monitorStatuses, [monitoredKey]);
  const monitoredStatusesRef = useRef(normalizedStatuses);

  useEffect(() => {
    monitoredStatusesRef.current = normalizedStatuses;
  }, [normalizedStatuses]);

  const updateState = useCallback((next: ServiceHealthState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearMaintenance = useCallback(() => {
    updateState({ isUnavailable: false, consecutiveFailures: 0 });
  }, [updateState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    const monitoredStatuses = new Set(monitoredStatusesRef.current);

    const recordHealthy = () => {
      if (!stateRef.current.isUnavailable) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (resetDelayMs > 0) {
        timerRef.current = window.setTimeout(() => {
          updateState({ isUnavailable: false, consecutiveFailures: 0 });
          timerRef.current = null;
        }, resetDelayMs);
      } else {
        updateState({ isUnavailable: false, consecutiveFailures: 0 });
      }
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string' ? input : (input as Request).url;
      try {
        const response = await originalFetch(input, init);
        if (monitoredStatuses.has(response.status)) {
          updateState({
            isUnavailable: true,
            lastStatus: response.status,
            lastUrl: requestUrl,
            lastError: response.statusText || `HTTP ${response.status}`,
            lastChecked: new Date(),
            consecutiveFailures: stateRef.current.consecutiveFailures + 1,
          });
        } else {
          recordHealthy();
        }
        return response;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') {
          throw err;
        }
        updateState({
          isUnavailable: true,
          lastUrl: requestUrl,
          lastError: err instanceof Error ? err.message : 'Network error',
          lastChecked: new Date(),
          consecutiveFailures: stateRef.current.consecutiveFailures + 1,
        });
        throw err;
      }
    };

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.fetch = originalFetch;
    };
  }, [enabled, monitoredKey, resetDelayMs, updateState]);

  return { state, dismiss: clearMaintenance } as const;
}
