import { useEffect, useRef } from 'react';
import { startInteraction } from './interactionTracker';

type Handle = ReturnType<typeof startInteraction>;

/**
 * Fires `hydrate.{name}` interaction exactly once, when `ready` first becomes true.
 *
 * Used to capture the moment a tab transitions from "loading skeleton" to
 * "first paint with real data". The clock starts at hook-mount time.
 */
export function useFirstHydration(
  name: string,
  ready: boolean,
  extra?: Record<string, unknown>,
): void {
  const handleRef = useRef<Handle | null>(null);
  const firedRef = useRef(false);
  const startedRef = useRef(false);
  const rafIdsRef = useRef<number[]>([]);

  if (!startedRef.current && !firedRef.current) {
    startedRef.current = true;
    handleRef.current = startInteraction(`hydrate.${name}`, extra);
  }

  useEffect(() => {
    if (firedRef.current || !ready || !handleRef.current) return;
    firedRef.current = true;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        handleRef.current?.end(extra);
        handleRef.current = null;
      });
      rafIdsRef.current.push(raf2);
    });
    rafIdsRef.current.push(raf1);
  }, [ready, extra, name]);

  useEffect(() => () => {
    rafIdsRef.current.forEach((id) => cancelAnimationFrame(id));
    rafIdsRef.current = [];
    if (handleRef.current && !firedRef.current) {
      handleRef.current.cancel();
      handleRef.current = null;
    }
  }, []);
}

export default useFirstHydration;
