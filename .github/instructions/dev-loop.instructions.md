---
applyTo: "**"
allowGlobalApplyTo: true
---

# Dev Loop (always-on)

Last verified: 2026-05-23

Trigger phrases and cleanup ladder for the local dev/browser loop. Boot-mode detail, SSE survival, and HMR rules live in [dev-experience.instructions.md](dev-experience.instructions.md) (auto-attached when editing `src/**`).

## Two boot modes (quick reference)

| Script | Use when |
|--------|----------|
| `npm run dev:fast` | **Default.** UI work, AI prompts, route handlers, anything not timer-driven. Skips scheduler + event poller. |
| `npm run dev:all` | Working on schedulers, sync logic, Clio polling, anything timer-driven. |

Both scripts route through `tools/dev-all-with-logs.mjs`, which now runs a pre-boot cleanup guard after confirming ports `3000` and `8080` are free. It clears old dev logs every boot and clears heavy webpack/build cache only when recoverable clutter exceeds 500MB. Use `--clean-full` or `HELIX_DEV_CLEAN_MODE=full` for a forced full wipe; use `--no-auto-clean` or `HELIX_DEV_AUTO_CLEAN=0` only when debugging the cleanup itself.

## Local browser snappiness reset

Trigger phrases: `refresh local browser session`, `refresh the local browser session`, `make local browser snappier`, `make the local browser snappier`, `make Simple Browser snappier`, `reset Simple Browser`, `refresh Simple Browser`, `local browser is lagging`, `Simple Browser is laggy`.

Goal: refresh the VS Code Simple Browser/webview session and clear local dev clutter without touching app logic or spawning duplicate servers.

Recommended ladder:

1. Run `npm run dev:clean -- --dry-run` first. Report the recoverable size and the largest bucket. Read-only.
2. If the user asked for a full snappiness reset, or recoverable clutter is large (roughly 500MB+), run `npm run dev:clean -- --yes`. Tell the user the next webpack compile will be cold once.
3. If the dev stack is still running and a full cache wipe is not needed, prefer the cheaper `npm run dev:clean:logs`.
4. Reset the embedded browser state. Prefer VS Code `Developer: Reload Webviews` when available; otherwise tell the operator to close and reopen the Simple Browser tab. `Ctrl+Shift+R` is the lightest fallback.
5. Reopen the happy-path shell at `http://localhost:3000`. If the dev stack is stopped, restart with `npm run dev:fast`. If ports `3000`/`8080` are already occupied, do not start another stack; use the existing one or stop it first.

Do not add a changelog entry for this cleanup-only routine. If the lag turns out to be caused by app code, route behaviour, or UI regressions, treat that as a normal debugging task and log any resulting behavioural change.

## Stuck local loader ladder (CRITICAL)

When the operator reports a local UI stuck on loading, debug in this order:

1. Reproduce from the operator's actual browser origin first (port + host matter).
2. Check the browser request path/host/port/status before assuming relative `/api` is reaching Express.
3. Compare that browser result with a direct route probe (`curl`, temp script, or browser fixture) to split origin/proxy issues from route failures.
4. If browser and direct route differ, inspect local API base selection, `src/setupProxy.js`, auth-context augmentation, and dev CORS before touching SQL or business logic.
5. Only once the request path is proven correct should you move inward to route logic, DB calls, or schema assumptions.

Rule of thumb: a `200` from `http://localhost:8080/...` does not prove the operator's active page can hit the same route.
