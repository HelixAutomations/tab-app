/**
 * Dev HMR helpers — used to keep long-lived resources (EventSource, timers,
 * websockets) tidy across webpack Hot Module Replacement boundaries.
 *
 * Production safety: every helper here is gated by `NODE_ENV !== 'production'`
 * AND by the presence of `module.hot`. In a production build, `module.hot` is
 * `undefined` and these helpers become no-ops with zero runtime cost.
 *
 * Why this exists: when CRA's React Refresh swaps a module that owns an
 * EventSource (or any long-lived handle), the old handle stays open until the
 * full page is reloaded. With many open SSE connections through the dev proxy
 * (which is configured `timeout: 0` for SSE durability), this slows down
 * Simple Browser reloads and produces dangling 502s after a server restart.
 *
 * Pair every `disposeOnHmr(...)` with a normal `useEffect` cleanup — the HMR
 * dispose only fires when webpack replaces the module, not on component
 * unmount. Both are needed.
 *
 * Convention:
 *   useEffect(() => {
 *     const es = new EventSource(url);
 *     // ...
 *     const undo = disposeOnHmr(() => { try { es.close(); } catch { } });
 *     return () => { try { es.close(); } catch { }; undo(); };
 *   }, []);
 */

type DisposeFn = () => void;

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Page-unload disposer registry. In dev we also want long-lived handles
 * (EventSource, websockets, timers) to be torn down when the browser is
 * reloading or the tab is closing. Without this, a hard Cmd+R leaves the
 * previous page's SSE sockets dangling on the server for ~30s until the
 * kernel times them out — which causes "stuck on reload" symptoms because
 * the new page races a backlog of half-dead sockets on the dev proxy.
 *
 * The registry fires once on `pagehide` (or `beforeunload` as a fallback)
 * and then clears itself. Every `disposeOnHmr(fn)` caller is automatically
 * enrolled, so existing SSE wiring benefits with zero code changes.
 */
const pageUnloadDisposers: Set<DisposeFn> = new Set();
let pageUnloadWired = false;

function firePageUnloadDisposers(): void {
  if (pageUnloadDisposers.size === 0) return;
  const snapshot = Array.from(pageUnloadDisposers);
  pageUnloadDisposers.clear();
  for (const fn of snapshot) {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[devHmr] page-unload disposer threw', err);
    }
  }
}

function ensurePageUnloadWired(): void {
  if (pageUnloadWired || typeof window === 'undefined') return;
  pageUnloadWired = true;
  // `pagehide` fires on both reloads and tab close. `beforeunload` is a
  // belt-and-braces fallback for older behaviours.
  window.addEventListener('pagehide', firePageUnloadDisposers);
  window.addEventListener('beforeunload', firePageUnloadDisposers);
}

/**
 * Register a function to run when webpack replaces (or removes) the calling
 * module via HMR. Returns an "undo" function that detaches the registration —
 * call it from your `useEffect` cleanup so a normal unmount doesn't leave a
 * stale dispose hook attached.
 *
 * The same function is ALSO run on page unload (reload / tab close) to close
 * long-lived sockets before the next navigation, preventing dev-proxy stalls.
 *
 * In production this returns a no-op `undo` and never fires.
 */
export function disposeOnHmr(fn: DisposeFn): DisposeFn {
  if (!isDev) return () => undefined;

  ensurePageUnloadWired();
  pageUnloadDisposers.add(fn);

  // Webpack injects `module.hot` into every module in dev. When the type
  // checker doesn't know about it (we're in a .ts file with no `module`
  // declaration), reach for it via the loose `any` cast — guarded above.
  const mod: any =
    typeof module !== 'undefined' ? (module as any) : undefined;
  const hot = mod && mod.hot;
  if (!hot || typeof hot.dispose !== 'function') {
    return () => {
      pageUnloadDisposers.delete(fn);
    };
  }

  let detached = false;
  const wrapped = (_data: unknown) => {
    if (detached) return;
    try {
      fn();
    } catch (err) {
      // Don't let a bad disposer break the HMR cycle.
      // eslint-disable-next-line no-console
      console.warn('[devHmr] disposer threw', err);
    }
  };

  hot.dispose(wrapped);

  return () => {
    detached = true;
    pageUnloadDisposers.delete(fn);
    // Webpack 5 doesn't expose a public "remove dispose handler" API. Detach
    // is enforced via the `detached` flag — the registered handler stays
    // wired but becomes a no-op once the React effect cleans up.
  };
}

/**
 * Subscribe to the `helix:server-bounced` window event, which is dispatched
 * by `useDevServerBoot` when the dev server's boot id changes (= nodemon
 * restarted the backend). Used by SSE consumers to immediately reconnect
 * instead of waiting for the browser's auto-retry.
 *
 * Returns an unsubscribe function. In production this is a no-op — the event
 * is only ever dispatched in dev.
 */
export function onServerBounced(fn: () => void): DisposeFn {
  if (!isDev || typeof window === 'undefined') return () => undefined;
  const handler = () => {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[devHmr] server-bounced handler threw', err);
    }
  };
  window.addEventListener('helix:server-bounced', handler);
  return () => window.removeEventListener('helix:server-bounced', handler);
}
