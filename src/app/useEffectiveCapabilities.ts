// src/app/useEffectiveCapabilities.ts
//
// Phase Access.D — frontend bridge to the resolver.
//
// Calls GET /api/access/effective once per session, caches the resulting
// capability map at module scope, and exposes a tiny React hook so gates can
// be data-driven without a redeploy. Granting `feature:activity-tab` →
// `user:KW` via the Access panel makes this hook return true for KW on next
// load (or immediately if `helix:access-changed` is dispatched).
//
// Falls back to a caller-supplied default if the fetch fails or has not
// returned yet — so LZ-by-default behaviour is preserved when SQL is cold.

import { useEffect, useState } from 'react';
import { buildRequestAuthHeaders } from '../utils/requestAuthContext';

type CapEntry = { allowed?: boolean } | boolean | null | undefined;
type CapMap = Record<string, CapEntry>;

function isAllowed(entry: CapEntry): boolean {
  if (entry == null) return false;
  if (typeof entry === 'boolean') return entry;
  return !!entry.allowed;
}

let cache: CapMap | null = null;
let inflight: Promise<CapMap> | null = null;
let lastFetchedAt = 0;

const SUBSCRIBERS = new Set<(map: CapMap) => void>();

function notify(map: CapMap) {
  cache = map;
  lastFetchedAt = Date.now();
  SUBSCRIBERS.forEach((fn) => {
    try { fn(map); } catch { /* noop */ }
  });
}

async function fetchEffective(): Promise<CapMap> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/access/effective', { credentials: 'include', headers: buildRequestAuthHeaders() });
      if (!res.ok) throw new Error(`effective ${res.status}`);
      const json = await res.json();
      const map = (json && json.capabilities) || {};
      notify(map);
      return map;
    } catch {
      // Leave cache as-is; callers fall back to their hardcoded defaults.
      return cache || {};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hook variant — returns boolean for one capability, with a fallback used
 * until the resolver responds (or if the call fails).
 */
export function useCapability(key: string, fallback = false): boolean {
  const [allowed, setAllowed] = useState<boolean>(() => {
    if (cache && key in cache) return isAllowed(cache[key]);
    return fallback;
  });

  useEffect(() => {
    let active = true;

    const apply = (map: CapMap) => {
      if (!active) return;
      setAllowed(key in map ? isAllowed(map[key]) : fallback);
    };

    SUBSCRIBERS.add(apply);

    if (!cache || Date.now() - lastFetchedAt > 60_000) {
      fetchEffective().then(apply);
    } else {
      apply(cache);
    }

    const onChange = () => { fetchEffective().then(apply); };
    window.addEventListener('helix:access-changed', onChange);

    return () => {
      active = false;
      SUBSCRIBERS.delete(apply);
      window.removeEventListener('helix:access-changed', onChange);
    };
  }, [key, fallback]);

  return allowed;
}

/** Force a refresh (call after a successful grant/revoke mutation). */
export function refreshEffectiveCapabilities(): void {
  fetchEffective();
}
