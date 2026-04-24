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

## Env flags (dev only — ignored in production)

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
3. Never assume the `bootId` is the same one you saw at mount — react to changes only.

## Rules for new server-side background work

1. If it starts at boot (timers, pollers, queue subscribers), gate it behind `process.env.HELIX_LAZY_INIT === '1'` in dev so `dev:fast` can skip it.
2. Always emit App Insights `Server.Boot.<Component>.Started` / `Completed` / `Skipped` events (see `.github/instructions/server.instructions.md` for the convention).
3. Do not introduce new boot-time SQL / Clio calls without a feature flag.

## Why this matters

Each unnecessary full reload costs ~10–15 seconds of context loss. With ~20 reloads a day, that's 5 minutes; over a year, several days. Compounding investment: every new SSE site that adopts `disposeOnHmr` + `onServerBounced` makes the loop a little tighter.
