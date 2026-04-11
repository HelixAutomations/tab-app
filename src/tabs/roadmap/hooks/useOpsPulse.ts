// src/tabs/roadmap/hooks/useOpsPulse.ts — SSE hook for the Helix Eye dashboard

import { useEffect, useRef, useCallback, useState } from 'react';
import type { OpsPulseState, PulseData, SchedulerData, ErrorEntry, SessionsData, RequestEntry } from '../parts/ops-pulse-types';

const INITIAL_STATE: OpsPulseState = {
  connected: false,
  pulse: null,
  scheduler: null,
  errors: [],
  sessions: null,
  requests: [],
};

/**
 * Connects to /api/ops-pulse/stream via SSE.
 * Returns typed state that updates in real-time.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useOpsPulse(enabled: boolean): OpsPulseState {
  const [state, setState] = useState<OpsPulseState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gaveUpRef = useRef(false);

  const connect = useCallback(() => {
    if (!enabled || gaveUpRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    // Probe auth first — EventSource doesn't expose HTTP status codes,
    // so a 401 would cause an infinite reconnect loop.
    fetch('/api/ops-pulse/snapshot', { credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          // Not authorised — stop trying
          gaveUpRef.current = true;
          setState((prev) => ({ ...prev, connected: false }));
          return;
        }

        const es = new EventSource('/api/ops-pulse/stream');
        esRef.current = es;

        es.onopen = () => {
          retryRef.current = 0;
          setState((prev) => ({ ...prev, connected: true }));
        };

        // Named events
        es.addEventListener('pulse', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as PulseData;
            setState((prev) => ({ ...prev, pulse: data }));
          } catch { /* ignore bad JSON */ }
        });

        es.addEventListener('scheduler', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as SchedulerData;
            setState((prev) => ({ ...prev, scheduler: data }));
          } catch { /* ignore */ }
        });

        es.addEventListener('errors', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as ErrorEntry[];
            setState((prev) => ({ ...prev, errors: data }));
          } catch { /* ignore */ }
        });

        es.addEventListener('error', (e: MessageEvent) => {
          // Single error pushed in real-time
          if (e.data) {
            try {
              const entry = JSON.parse(e.data) as ErrorEntry;
              setState((prev) => ({
                ...prev,
                errors: [entry, ...prev.errors].slice(0, 50),
              }));
            } catch { /* might be a connection error, not a data event */ }
          }
        });

        es.addEventListener('sessions', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as SessionsData;
            setState((prev) => ({ ...prev, sessions: data }));
          } catch { /* ignore */ }
        });

        es.addEventListener('requests', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as RequestEntry[];
            setState((prev) => ({ ...prev, requests: data }));
          } catch { /* ignore */ }
        });

        es.onerror = () => {
          setState((prev) => ({ ...prev, connected: false }));
          es.close();
          esRef.current = null;

          // Stop after 8 consecutive failures (~4 minutes of backoff)
          if (retryRef.current >= 8) {
            gaveUpRef.current = true;
            return;
          }

          // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
          const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
          retryRef.current++;
          timerRef.current = setTimeout(connect, delay);
        };
      })
      .catch(() => {
        // Network error on probe — retry with backoff
        if (retryRef.current >= 8) {
          gaveUpRef.current = true;
          return;
        }
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
        retryRef.current++;
        timerRef.current = setTimeout(connect, delay);
      });
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, connect]);

  return state;
}
