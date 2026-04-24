/**
 * Interaction Tracker — Phase 0 of the UX Realtime Navigation Programme.
 *
 * Lightweight wrapper around `performance.mark`/`performance.measure` that:
 *   1. Records the duration of named user interactions (tab switch, hover, modal open…).
 *   2. Forwards each measurement to the existing `/api/telemetry` pipeline as
 *      `Client.UX.{name}` events (which Application Insights auto-promotes
 *      to a `Client.UX.{name}.Duration` metric — see server/routes/telemetry.js).
 *   3. Holds the last N measurements in an in-memory ring so the dev-only
 *      `DebugLatencyOverlay` can render a live read-out without re-fetching.
 *
 * Design notes:
 *   - Zero overhead in production for users not subscribed to the ring.
 *   - Always-on telemetry (cheap; piggybacks on existing pipeline). Use a
 *     throttle key for very chatty interactions.
 *   - No PII — `name` and optional `data` keys must be safe to log.
 *
 * Usage:
 *   const handle = startInteraction('nav.tabSwitch', { from, to });
 *   // …work…
 *   handle.end();             // measures + sends + records
 *
 *   // Or one-shot:
 *   measureInteraction('hover.row', () => doWork(), { rowId });
 */

import { trackClientEvent } from './telemetry';

export interface InteractionRecord {
  /** Stable interaction name, e.g. `nav.tabSwitch`. */
  name: string;
  /** Duration in milliseconds (rounded to 0.1ms). */
  durationMs: number;
  /** When the measurement completed (epoch ms). */
  at: number;
  /** Caller-supplied context (sanitised by the telemetry pipeline). */
  data?: Record<string, unknown>;
}

export interface InteractionHandle {
  /** End the interaction, record, and (unless `silent`) report telemetry. */
  end: (extraData?: Record<string, unknown>) => InteractionRecord | null;
  /** Cancel without recording (e.g. user navigated away mid-flight). */
  cancel: () => void;
}

interface StartOptions {
  /** Suppress telemetry post (still records to ring). */
  silent?: boolean;
  /** Cooldown key — drops repeated measurements within `cooldownMs`. */
  throttleKey?: string;
  cooldownMs?: number;
}

const RING_LIMIT = 50;
const ring: InteractionRecord[] = [];
const subscribers = new Set<(records: InteractionRecord[]) => void>();
const lastSentAt = new Map<string, number>();

function hasPerf(): boolean {
  return typeof performance !== 'undefined' && typeof performance.now === 'function';
}

function pushRecord(record: InteractionRecord) {
  ring.push(record);
  if (ring.length > RING_LIMIT) ring.shift();
  if (subscribers.size > 0) {
    const snapshot = ring.slice();
    subscribers.forEach((fn) => {
      try {
        fn(snapshot);
      } catch {
        // Subscribers are dev-only UI — never let one break the app.
      }
    });
  }
}

function shouldThrottle(opts?: StartOptions): boolean {
  if (!opts?.throttleKey || !opts.cooldownMs || opts.cooldownMs <= 0) return false;
  const now = Date.now();
  const last = lastSentAt.get(opts.throttleKey) || 0;
  if (now - last < opts.cooldownMs) return true;
  lastSentAt.set(opts.throttleKey, now);
  return false;
}

/**
 * Begin measuring a named interaction. Call `end()` on the returned handle
 * when the interaction is visually complete (e.g. tab content rendered).
 */
export function startInteraction(
  name: string,
  data?: Record<string, unknown>,
  opts?: StartOptions,
): InteractionHandle {
  if (!hasPerf()) {
    return { end: () => null, cancel: () => {} };
  }
  const startMark = `helix:${name}:start:${Math.random().toString(36).slice(2, 8)}`;
  let cancelled = false;
  let ended = false;
  try {
    performance.mark(startMark);
  } catch {
    // ignore — fall through to time fallback below
  }
  const startTime = performance.now();

  return {
    end(extraData) {
      if (cancelled || ended) return null;
      ended = true;
      const endTime = performance.now();
      const durationMs = Math.max(0, Math.round((endTime - startTime) * 10) / 10);
      const merged = extraData ? { ...(data || {}), ...extraData } : data;
      try {
        performance.measure(`helix:${name}`, startMark);
      } catch {
        // measurement is best-effort
      }
      const record: InteractionRecord = {
        name,
        durationMs,
        at: Date.now(),
        data: merged,
      };
      pushRecord(record);

      if (!opts?.silent && !shouldThrottle(opts)) {
        trackClientEvent('UX', name, merged || {}, { duration: durationMs });
      }
      return record;
    },
    cancel() {
      cancelled = true;
    },
  };
}

/**
 * Measure a synchronous function call. Returns whatever the function returned.
 */
export function measureInteraction<T>(
  name: string,
  fn: () => T,
  data?: Record<string, unknown>,
  opts?: StartOptions,
): T {
  const handle = startInteraction(name, data, opts);
  try {
    const result = fn();
    handle.end();
    return result;
  } catch (err) {
    handle.cancel();
    throw err;
  }
}

/** Subscribe to ring updates (returns unsubscribe). Dev overlay only. */
export function subscribeInteractions(fn: (records: InteractionRecord[]) => void): () => void {
  subscribers.add(fn);
  fn(ring.slice());
  return () => {
    subscribers.delete(fn);
  };
}

/** Snapshot of the most recent measurements (newest last). */
export function getRecentInteractions(): InteractionRecord[] {
  return ring.slice();
}

/** Aggregate stats across the ring for a given name. */
export function getStats(name?: string): { count: number; p50: number; p95: number; max: number } {
  const subset = name ? ring.filter((r) => r.name === name) : ring;
  if (subset.length === 0) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = subset.map((r) => r.durationMs).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    count: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}
