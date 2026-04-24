// src/hooks/useFreshIds.ts
//
// Track which list items are "freshly arrived" so live-feed surfaces can
// animate only the new rows instead of re-running an enter animation on
// every render.
//
// Usage:
//   const freshIds = useFreshIds(items, (item) => item.id);
//   <Row data-fresh={freshIds.has(item.id) || undefined} />
//
// CSS contract (see src/app/styles/animations.css):
//   [data-fresh="true"] { animation: fadeInUp 220ms ease-out both; }
//
// Honours `prefers-reduced-motion: reduce` — returns an empty set so no
// rows animate. Skips the very first render so a freshly mounted feed
// doesn't bulk-animate every row.

import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_TTL_MS = 600;

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

export function useFreshIds<T>(
    items: ReadonlyArray<T> | null | undefined,
    getId: (item: T) => string | number | null | undefined,
    ttlMs: number = DEFAULT_TTL_MS,
): Set<string> {
    const [fresh, setFresh] = useState<Set<string>>(() => new Set());
    const knownIdsRef = useRef<Set<string> | null>(null);
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Cheap stable signature so the effect only fires when ids actually change.
    const idSignature = useMemo(() => {
        if (!items || items.length === 0) return '';
        const parts: string[] = [];
        for (const item of items) {
            const id = getId(item);
            if (id === null || id === undefined) continue;
            parts.push(String(id));
        }
        return parts.join('|');
    }, [items, getId]);

    useEffect(() => {
        if (prefersReducedMotion()) {
            knownIdsRef.current = new Set(idSignature ? idSignature.split('|') : []);
            return;
        }

        const incoming = new Set<string>(idSignature ? idSignature.split('|') : []);

        // First pass: seed known set without flagging anything as fresh.
        if (knownIdsRef.current === null) {
            knownIdsRef.current = incoming;
            return;
        }

        const known = knownIdsRef.current;
        const newlyArrived: string[] = [];
        incoming.forEach((id) => {
            if (!known.has(id)) newlyArrived.push(id);
        });

        if (newlyArrived.length === 0) {
            knownIdsRef.current = incoming;
            return;
        }

        knownIdsRef.current = incoming;
        setFresh((prev) => {
            const next = new Set(prev);
            newlyArrived.forEach((id) => next.add(id));
            return next;
        });

        const timers = timersRef.current;
        newlyArrived.forEach((id) => {
            const existing = timers.get(id);
            if (existing) clearTimeout(existing);
            const handle = setTimeout(() => {
                timers.delete(id);
                setFresh((prev) => {
                    if (!prev.has(id)) return prev;
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }, ttlMs);
            timers.set(id, handle);
        });
    }, [idSignature, ttlMs]);

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((handle) => clearTimeout(handle));
            timers.clear();
        };
    }, []);

    return fresh;
}

export default useFreshIds;
