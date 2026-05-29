---
applyTo: "src/**"
---

# Dev Experience (auto-attached for src/**)

Last verified: 2026-05-23

Boot-mode detail, SSE survival, and HMR rules. Trigger phrases and the local browser snappiness reset ladder live in [dev-loop.instructions.md](dev-loop.instructions.md) (always-on).

## Two boot modes

**Default loop: `npm run dev:fast`.** It boots faster, skips scheduler + event poller, and uses the built-in `node --watch-path=server` reloader (no nodemon) so server restarts on cold filesystem cache are seconds, not tens of seconds. Only reach for `dev:all` when you are actively working on scheduler / poller / warmup behaviour.

| Script | What it boots | Use when |
|--------|---------------|----------|
| `npm run dev:fast` | Server with `HELIX_LAZY_INIT=1` (skips scheduler + event poller), frontend, no aggressive warmups | **Default.** UI work, AI prompts, route handlers, anything that isn't timer-driven |
| `npm run dev:all` | Full server (scheduler, event poller, warmups gated by `FORCE_BOOT_WARMUPS`) + frontend | Working on schedulers, sync logic, Clio polling, anything timer-driven |

`dev:fast` is implemented in [tools/dev-fast.mjs](tools/dev-fast.mjs). It just sets a few env flags and re-uses `dev-all-with-logs.mjs`.

The backend watcher is `node --watch-path=server --watch-path=server.js server/index.js` (see [package.json](package.json) `start:server:watch`). It uses Node's built-in watch mode (stable since Node 18.11+, so safe on local Node 20, staging Node 22, and prod Node 18) rather than nodemon, which saves ~40s of cold-start spawn overhead. There is no `nodemon.json` and `nodemon` is no longer a devDependency.

Routes are lazy-mounted via `lazyRouter()` in [server/index.js](server/index.js): each route module's `require()` is deferred until the first request hits its mount point. That keeps cold listen-ready under ~2s in warm cache. Four imports stay eager: `openAnotherMatter` (top-level `setInterval`), `ccl` (exports `CCL_DIR` consumed by `express.static`), and the two middleware (`userContext`, `errorHandler`). If you add a new route that needs eager evaluation (side effects at module load, top-level timers, named exports consumed outside handlers), add it to the eager block, not the lazy list.

## Local origin reality

`http://localhost:3000` is the happy-path dev shell because CRA proxies `/api` to `http://localhost:8080` via [src/setupProxy.js](src/setupProxy.js).

Not every local shell has that proxy. Teams/local hosts, browser fixtures, ad-hoc localhost ports, and some Simple Browser sessions can be on `localhost` while still sending `/api/...` to the wrong place or nowhere at all.

Rules:

1. If a feature must work outside CRA, make its local API base origin-aware instead of assuming relative `/api` is enough.
2. When a loader is stuck, reproduce from the operator's actual browser origin first. A `curl` to `:8080` only proves the route works there; it does not prove the active page can reach it.
3. If `:3000` works but another localhost origin does not, check local API base selection, proxy wiring, and dev CORS before touching SQL or route logic.

## Env flags (dev only, ignored in production)

| Flag | Effect |
|------|--------|
| `HELIX_LAZY_INIT=1` | Server skips `startDataOperationsScheduler()` + `startEventPoller()` on boot. Banner shows `eventPoller: skipped (HELIX_LAZY_INIT)`. |
| `FORCE_BOOT_WARMUPS=true` | Force the prod-style warmup chain even in dev (use rarely, e.g. when reproducing a warmup-related bug). |
| `BROWSER=none` | Don't auto-open a browser tab when CRA finishes compiling. Already the default for `dev:fast`. |

Production safety contract: every gate is checked behind `process.env.NODE_ENV !== 'production'`. The flags do nothing in a deployed build.

## SSE survival across restarts

Long-lived `EventSource` connections are the most common source of "is the page broken?" friction in dev. Two helpers solve this:

### `disposeOnHmr(fn)`

Imported from [src/utils/devHmr.ts](src/utils/devHmr.ts). Registers `fn` to run when webpack hot-replaces the calling module, so the EventSource is closed BEFORE the new module instance opens its own. Production no-op.

```ts
useEffect(() => {
  const es = new EventSource(url);
  // ...wire handlers...
  const undoHmr = disposeOnHmr(() => { try { es.close(); } catch {} });
  return () => { try { es.close(); } catch {}; undoHmr(); };
}, [url]);
```

### `onServerBounced(fn)`

Imported from the same module. The dev-only `useDevServerBoot()` hook polls `/api/dev/health` every 3s. When the backend's `bootId` changes (= nodemon restart), it dispatches `helix:server-bounced` on `window`. Subscribers reconnect immediately:

```ts
const undoBounce = onServerBounced(() => {
  try { es.close(); } catch {}
  // re-create the EventSource here
});
```

Both are no-ops in production.

## Rules for new SSE consumers

1. Always pair the React `useEffect` cleanup with a `disposeOnHmr` registration.
2. If the subscription has a stable `connect()` function, also register an `onServerBounced` handler that re-runs it.
3. Never assume the `bootId` is the same one you saw at mount, react to changes only.

## Rules for new server-side background work

1. If it starts at boot (timers, pollers, queue subscribers), gate it behind `process.env.HELIX_LAZY_INIT === '1'` in dev so `dev:fast` can skip it.
2. Always emit App Insights `Server.Boot.<Component>.Started` / `Completed` / `Skipped` events (see `.github/instructions/server.instructions.md` for the convention).
3. Do not introduce new boot-time SQL / Clio calls without a feature flag.

## Why this matters

Each unnecessary full reload costs ~10 to 15 seconds of context loss. With ~20 reloads a day, that's 5 minutes; over a year, several days. Compounding investment: every new SSE site that adopts `disposeOnHmr` + `onServerBounced` makes the loop a little tighter.
