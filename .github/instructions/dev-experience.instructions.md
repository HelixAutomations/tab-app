---
applyTo: "**"
---

# Dev Experience (snappy local loop)

This file codifies the local development workflow that was rolled out as part
of the Vault Room dev hygiene programme. The intent: the operator should rarely
need to reload the server or close + reopen Simple Browser to see changes.

## Two boot modes

| Script | What it boots | Use when |
|--------|---------------|----------|
| `npm run dev:all` | Full server (scheduler, event poller, warmups gated by `FORCE_BOOT_WARMUPS`) + frontend | Working on schedulers, sync logic, Clio polling, anything timer-driven |
| `npm run dev:fast` | Server with `HELIX_LAZY_INIT=1` (skips scheduler + event poller), frontend, no aggressive warmups | Working on UI, AI prompts, route handlers — the default fast loop |

`dev:fast` is implemented in [tools/dev-fast.mjs](tools/dev-fast.mjs). It just sets a few env flags and re-uses `dev-all-with-logs.mjs`.

## Local origin reality

`http://localhost:3000` is the happy-path dev shell because CRA proxies `/api` to `http://localhost:8080` via [src/setupProxy.js](src/setupProxy.js).

Not every local shell has that proxy. Teams/local hosts, browser fixtures, ad-hoc localhost ports, and some Simple Browser sessions can be on `localhost` while still sending `/api/...` to the wrong place or nowhere at all.

Rules:

1. If a feature must work outside CRA, make its local API base origin-aware instead of assuming relative `/api` is enough.
2. When a loader is stuck, reproduce from the operator's actual browser origin first. A `curl` to `:8080` only proves the route works there; it does not prove the active page can reach it.
3. If `:3000` works but another localhost origin does not, check local API base selection, proxy wiring, and dev CORS before touching SQL or route logic.

## Env flags (dev only — ignored in production)

| Flag | Effect |
|------|--------|
| `HELIX_LAZY_INIT=1` | Server skips `startDataOperationsScheduler()` + `startEventPoller()` on boot. Banner shows `eventPoller: skipped (HELIX_LAZY_INIT)`. |
| `FORCE_BOOT_WARMUPS=true` | Force the prod-style warmup chain even in dev (use rarely, e.g. when reproducing a warmup-related bug). |
| `BROWSER=none` | Don't auto-open a browser tab when CRA finishes compiling. Already the default for `dev:fast`. |

Production safety contract: every gate is checked behind `process.env.NODE_ENV !== 'production'`. The flags do nothing in a deployed build.

## Local browser snappiness reset

Use this when the operator says things like `refresh local browser session`,
`make local browser snappier`, `make Simple Browser snappier`, `reset Simple
Browser`, or `Simple Browser is laggy`.

Goal: refresh the VS Code Simple Browser/webview session and clear local dev
clutter without touching app logic or spawning duplicate servers.

Recommended ladder:

1. Run `npm run dev:clean -- --dry-run` first. Report the recoverable size and
   the largest bucket. This is read-only and usually shows whether webpack/log
   clutter is part of the lag.
2. If the user asked for a full snappiness reset, or recoverable clutter is
   large (roughly 500MB+), run `npm run dev:clean -- --yes`. This clears
   `node_modules/.cache`, stale CRA build output, and dev logs. Tell the user
   the next webpack compile will be cold once.
3. If the dev stack is still running and a full cache wipe is not needed, prefer
   the cheaper `npm run dev:clean:logs`.
4. Reset the embedded browser state. Prefer VS Code `Developer: Reload Webviews`
   when available; otherwise tell the operator to close and reopen the Simple
   Browser tab. A hard reload (`Ctrl+Shift+R`) is the lightest manual fallback.
5. Reopen the happy-path shell at `http://localhost:3000`. If the dev stack is
   stopped, restart with `npm run dev:fast`. If ports `3000`/`8080` are already
   occupied, do not start another stack; use the existing one or stop it first.

Do not add a changelog entry for this cleanup-only routine. If the lag turns
out to be caused by app code, route behaviour, or UI regressions, treat that as
a normal debugging task and log any resulting behavioural change.

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
3. Never assume the `bootId` is the same one you saw at mount — react to changes only.

## Rules for new server-side background work

1. If it starts at boot (timers, pollers, queue subscribers), gate it behind `process.env.HELIX_LAZY_INIT === '1'` in dev so `dev:fast` can skip it.
2. Always emit App Insights `Server.Boot.<Component>.Started` / `Completed` / `Skipped` events (see `.github/instructions/server.instructions.md` for the convention).
3. Do not introduce new boot-time SQL / Clio calls without a feature flag.

## Why this matters

Each unnecessary full reload costs ~10–15 seconds of context loss. With ~20 reloads a day, that's 5 minutes; over a year, several days. Compounding investment: every new SSE site that adopts `disposeOnHmr` + `onServerBounced` makes the loop a little tighter.
