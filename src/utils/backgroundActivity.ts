/**
 * Background activity tracker — shared, app-wide counter of in-flight
 * background refreshes. Any fetch that happens silently after first paint
 * (SSE-driven refreshes, idle-deferred initial loads, visibility refreshes)
 * can opt in by calling `markBackgroundActivityStart()` and the matching
 * `markBackgroundActivityEnd()` in a try/finally.
 *
 * The `<BackgroundActivityBar />` component subscribes to this and renders
 * a thin 2px shimmer at the top of the content region while count > 0.
 *
 * Phase 2B.5 (2026-04-27): introduced to surface a subtle visual cue while
 * background data is being refreshed, so silent state-swaps don't read as
 * "harsh rerenders" (the user can see why something is changing).
 */
import { useEffect, useState } from 'react';

const EVENT_NAME = 'helix:bg-activity';
let activeCount = 0;

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { count: activeCount } }));
  } catch {
    /* ignore */
  }
}

export function markBackgroundActivityStart(): void {
  activeCount += 1;
  emit();
}

export function markBackgroundActivityEnd(): void {
  if (activeCount > 0) activeCount -= 1;
  emit();
}

/**
 * Wrap an async function so it auto-marks start/end. Safe across throws.
 */
export async function trackBackgroundActivity<T>(fn: () => Promise<T>): Promise<T> {
  markBackgroundActivityStart();
  try {
    return await fn();
  } finally {
    markBackgroundActivityEnd();
  }
}

export function useBackgroundActivity(): boolean {
  const [active, setActive] = useState<boolean>(activeCount > 0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      setActive((detail?.count ?? 0) > 0);
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, []);
  return active;
}
