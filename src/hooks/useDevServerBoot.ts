/**
 * Dev-only hook: polls /api/dev/health to detect when the local backend
 * (nodemon) has restarted, then dispatches `helix:server-bounced` on the
 * window so SSE consumers can reconnect cleanly.
 *
 * Without this, after a nodemon restart the page's open EventSource handles
 * stay in their proxy-induced limbo for several seconds, and the user often
 * has to close + reopen Simple Browser to see anything live again.
 *
 * Production safety: the entire effect bails immediately when
 * `process.env.NODE_ENV === 'production'`. The `/api/dev/health` route is
 * also only mounted on the server in dev, so this would 404 in prod even if
 * accidentally enabled — but we never get there.
 */
import { useEffect } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

export function useDevServerBoot(intervalMs: number = 3000): void {
  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;

    let cancelled = false;
    let lastBootId: string | null = null;
    let timer: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/dev/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { bootId?: string };
        const bootId = typeof data?.bootId === 'string' ? data.bootId : null;
        if (!bootId) return;

        if (lastBootId === null) {
          lastBootId = bootId;
        } else if (bootId !== lastBootId) {
          // Backend bounced. Surface to listeners and stamp the new id.
          lastBootId = bootId;
          try {
            window.dispatchEvent(new CustomEvent('helix:server-bounced', { detail: { bootId } }));
          } catch {
            /* ignore */
          }
        }
      } catch {
        // Server might be mid-restart — that's exactly when we want to keep polling.
      }
    };

    // Initial probe + interval.
    void poll();
    timer = window.setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [intervalMs]);
}
