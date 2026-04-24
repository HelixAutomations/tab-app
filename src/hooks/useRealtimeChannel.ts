import { useEffect, useRef, useState, useCallback } from 'react';
import { trackClientEvent, trackClientError } from '../utils/telemetry';
import { disposeOnHmr } from '../utils/devHmr';

export type RealtimeChannelStatus = 'connecting' | 'open' | 'closed';

// ────────────────────────────────────────────────────────────────────────────
// Shared EventSource registry — one connection per URL, shared across all hook
// instances. Chrome caps HTTP/1.1 EventSource at 6 per origin; the Home tab
// opens 10+ distinct stream URLs plus several duplicates before this registry
// was added. On page refresh the surplus stalled until prior TCP sockets
// released, causing 2-3s skeleton hang. See .github/instructions/dev-experience.
// ────────────────────────────────────────────────────────────────────────────

type StatusListener = (status: RealtimeChannelStatus, meta?: { msToConnect?: number }) => void;

interface SharedConnection {
  es: EventSource | null;
  refCount: number;
  /** Event name → set of listeners (raw EventListeners). */
  eventListeners: Map<string, Set<EventListener>>;
  statusListeners: Set<StatusListener>;
  /** Per-url bound handlers so we can removeEventListener on close. */
  boundHandlers: Map<string, EventListener>;
  connectStart: number;
  status: RealtimeChannelStatus;
}

const connections = new Map<string, SharedConnection>();

function notifyStatus(conn: SharedConnection, status: RealtimeChannelStatus, meta?: { msToConnect?: number }) {
  conn.status = status;
  for (const listener of conn.statusListeners) {
    try { listener(status, meta); } catch { /* swallow */ }
  }
}

function ensureConnection(url: string): SharedConnection {
  let conn = connections.get(url);
  if (conn) return conn;

  conn = {
    es: null,
    refCount: 0,
    eventListeners: new Map(),
    statusListeners: new Set(),
    boundHandlers: new Map(),
    connectStart: Date.now(),
    status: 'closed',
  };
  connections.set(url, conn);
  return conn;
}

function openConnection(url: string, conn: SharedConnection) {
  if (conn.es) return;
  try {
    conn.connectStart = Date.now();
    conn.status = 'connecting';
    const es = new EventSource(url);
    conn.es = es;

    // Re-attach any event listeners already registered by subscribers.
    for (const [eventName, listeners] of conn.eventListeners.entries()) {
      const bound: EventListener = (evt) => {
        for (const l of listeners) {
          try { l(evt); } catch { /* swallow */ }
        }
      };
      conn.boundHandlers.set(eventName, bound);
      es.addEventListener(eventName, bound);
    }

    // 'connected' is a server-side event. Fan out to status listeners.
    const connectedBound: EventListener = () => {
      notifyStatus(conn, 'open', { msToConnect: Date.now() - conn.connectStart });
    };
    conn.boundHandlers.set('connected', connectedBound);
    es.addEventListener('connected', connectedBound);

    es.onopen = () => notifyStatus(conn, 'open');
    es.onerror = () => {
      // Browser auto-retries; flag as connecting.
      notifyStatus(conn, 'connecting');
    };
  } catch (err) {
    console.warn(`[useRealtimeChannel] Failed to connect ${url}:`, err);
    notifyStatus(conn, 'closed');
  }
}

function closeConnection(url: string, conn: SharedConnection) {
  if (conn.es) {
    try {
      for (const [eventName, bound] of conn.boundHandlers.entries()) {
        try { conn.es.removeEventListener(eventName, bound); } catch { /* ignore */ }
      }
      conn.es.close();
    } catch { /* ignore */ }
    conn.es = null;
    conn.boundHandlers.clear();
  }
  conn.status = 'closed';
  connections.delete(url);
}

/** Subscribe to one event on a shared EventSource. Returns an unsubscribe fn. */
function subscribe(
  url: string,
  eventName: string,
  handler: EventListener,
  statusListener: StatusListener,
): () => void {
  const conn = ensureConnection(url);
  conn.refCount += 1;

  let bucket = conn.eventListeners.get(eventName);
  if (!bucket) {
    bucket = new Set();
    conn.eventListeners.set(eventName, bucket);
    // Attach on the live EventSource, if open.
    if (conn.es) {
      const bound: EventListener = (evt) => {
        const listeners = conn.eventListeners.get(eventName);
        if (!listeners) return;
        for (const l of listeners) {
          try { l(evt); } catch { /* swallow */ }
        }
      };
      conn.boundHandlers.set(eventName, bound);
      conn.es.addEventListener(eventName, bound);
    }
  }
  bucket.add(handler);

  conn.statusListeners.add(statusListener);
  // Replay current status to new subscriber.
  try { statusListener(conn.status); } catch { /* swallow */ }

  if (!conn.es) {
    openConnection(url, conn);
  }

  return () => {
    const c = connections.get(url);
    if (!c) return;
    const b = c.eventListeners.get(eventName);
    if (b) {
      b.delete(handler);
      if (b.size === 0) c.eventListeners.delete(eventName);
    }
    c.statusListeners.delete(statusListener);
    c.refCount -= 1;
    if (c.refCount <= 0) {
      closeConnection(url, c);
    }
  };
}

export interface UseRealtimeChannelOptions<TPayload = unknown> {
  /** SSE event name to listen for (e.g. 'futureBookings.changed'). */
  event: string;
  /**
   * Called once per debounce window after one or more events fire.
   * Receives the most recent parsed payload (last-write-wins).
   */
  onChange?: (payload: TPayload | null) => void | Promise<void>;
  /** Gate the connection. Defaults to true. */
  enabled?: boolean;
  /** Coalesce burst events. Default 350ms. */
  debounceMs?: number;
  /** Optional payload reducer — last call wins. Useful to capture metadata. */
  reducePayload?: (prev: TPayload | null, incoming: TPayload | null) => TPayload | null;
  /**
   * Optional channel label (e.g. 'opsQueue'). When provided, fires telemetry:
   * `Realtime.{name}.connected` (once per session, throttled), `Realtime.{name}.firstUpdate`
   * (once per mount), and `Realtime.{name}.error` (throttled).
   */
  name?: string;
}

export interface UseRealtimeChannelResult<TPayload = unknown> {
  /** Monotonically incrementing nonce. Increments once per debounce flush. */
  nonce: number;
  /** Most recent payload after the debounce flush. */
  lastPayload: TPayload | null;
  /** Connection status. */
  status: RealtimeChannelStatus;
}

/**
 * useRealtimeChannel — single shared SSE consumer hook.
 *
 * Wraps the boilerplate currently duplicated for each EventSource in Home.tsx
 * (connect, listen, debounce-coalesce, parse, refresh, cleanup). Returns a
 * monotonic nonce that components pass straight to <LivePulse nonce={...} />.
 *
 * Notes:
 *  - EventSource is auto-reconnect by browser; we do not poll.
 *  - The 'connected' event from server is used to flip status to 'open'.
 *  - Pass `enabled={isActive && homeDataReady && isPageVisible}` to defer
 *    until after the critical first render.
 */
export function useRealtimeChannel<TPayload = unknown>(
  url: string,
  opts: UseRealtimeChannelOptions<TPayload>
): UseRealtimeChannelResult<TPayload> {
  const {
    event,
    onChange,
    enabled = true,
    debounceMs = 350,
    reducePayload,
    name,
  } = opts;

  const [nonce, setNonce] = useState(0);
  const [lastPayload, setLastPayload] = useState<TPayload | null>(null);
  const [status, setStatus] = useState<RealtimeChannelStatus>('closed');

  // Stable refs so we don't re-open the connection on every render.
  const onChangeRef = useRef(onChange);
  const reduceRef = useRef(reducePayload);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { reduceRef.current = reducePayload; }, [reducePayload]);

  useEffect(() => {
    if (!enabled || !url) return;

    let refreshTimer: number | null = null;
    let pendingPayload: TPayload | null = null;
    let connectStart = Date.now();
    let firstUpdateFired = false;

    setStatus('connecting');

    const flush = () => {
      const payload = pendingPayload;
      pendingPayload = null;
      setLastPayload(payload);
      setNonce((n) => n + 1);
      if (name && !firstUpdateFired) {
        firstUpdateFired = true;
        trackClientEvent('Realtime', `${name}.firstUpdate`, {
          msSinceConnect: Date.now() - connectStart,
        }, { throttleKey: `realtime:${name}:firstUpdate`, cooldownMs: 60000 });
      }
      try {
        const result = onChangeRef.current?.(payload);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch(() => { /* swallow */ });
        }
      } catch {
        /* swallow */
      }
    };

    const handleEvent: EventListener = (evt) => {
      let parsed: TPayload | null = null;
      try {
        const messageEvent = evt as MessageEvent;
        const raw = typeof messageEvent.data === 'string' ? messageEvent.data : '';
        parsed = raw ? (JSON.parse(raw) as TPayload) : null;
      } catch {
        parsed = null;
      }

      if (reduceRef.current) {
        pendingPayload = reduceRef.current(pendingPayload, parsed);
      } else {
        pendingPayload = parsed;
      }

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(flush, debounceMs);
    };

    const handleStatus: StatusListener = (next, meta) => {
      setStatus(next);
      if (next === 'open' && name && meta?.msToConnect !== undefined) {
        trackClientEvent('Realtime', `${name}.connected`, {
          msToConnect: meta.msToConnect,
        }, { throttleKey: `realtime:${name}:connected`, cooldownMs: 60000 });
      }
      if (next === 'connecting' && name) {
        // treat as error retry (mirrors prior behaviour)
        trackClientError('Realtime', `${name}.error`, 'eventsource-error',
          { url },
          { throttleKey: `realtime:${name}:error`, cooldownMs: 30000 });
      }
    };

    connectStart = Date.now();
    const unsubscribe = subscribe(url, event, handleEvent, handleStatus);
    const undoHmr = disposeOnHmr(() => unsubscribe());

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      unsubscribe();
      undoHmr();
      setStatus('closed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, event, enabled, debounceMs]);

  return { nonce, lastPayload, status };
}

/**
 * Convenience: returns just the nonce (for components that only need the cue,
 * not the payload). Triggers `onChange` to re-fetch on every event.
 *
 * Pass `name` to enable Phase D telemetry (`Realtime.{name}.connected` etc.).
 */
export function useRealtimePulse(
  url: string,
  event: string,
  onChange: () => void | Promise<void>,
  enabled: boolean = true,
  name?: string
): number {
  const stable = useCallback(onChange, [onChange]);
  const { nonce } = useRealtimeChannel(url, { event, onChange: stable, enabled, name });
  return nonce;
}
