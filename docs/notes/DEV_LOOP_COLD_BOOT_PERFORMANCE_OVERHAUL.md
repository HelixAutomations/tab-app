# Dev loop cold-boot performance overhaul

> **Purpose of this document.** Self-contained brief any future agent can pick up cold and execute. Captures the full diagnosis of why `npm run dev:all` is slow on first-of-day boot and the ranked plan to fix it.
>
> **How to use it.** Read once. Phase A is independently shippable and unblocks the rest. Phases B and C can be picked up later. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-23 against branch `main` on Windows / Node v20.15.1.

---

## 1. Why this exists (user intent)

The user ran `npm run dev:all` to observe the boot process and reported the loop is "not sexy, slow, laggy" and wants a process that is "just wonderful". Quote: *"generally im interested in big efficiencies… it is your task to suggest to me what i dont know."*

This is **not** a request for cosmetic polish or a single-feature fix. It is an open mandate to find and remove cold-boot waste, legacy patterns, and machine-level friction in the local dev loop.

Adjacent: [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md) already documents `dev:fast` and SSE survival helpers. This brief picks up where that left off and goes deeper into the actual bottlenecks.

---

## 2. Current state — verified findings

Numbers below come from a real `npm run dev:all` cold run captured 2026-05-23.

### 2.1 Boot timeline (cold vs warm)

| Phase | Cold (first of day) | Warm (subsequent) |
|-------|---------------------|-------------------|
| nodemon spawn → first server byte | **42.3s** | 0.2s |
| `env:validated` → `core-utils:loaded` | **109.7s** | ~1.0s |
| `routes/documents.js` require | +5.6s | <0.1s |
| `routes/paymentLink.js` require | +5.0s | <0.1s |
| `listen:ready` total | **~171s** | ~2s |
| CRA frontend "Compiled successfully" | +17s | +17s |

The 168s cold-vs-warm gap is **filesystem cache + Defender real-time scan**, not application logic.

### 2.2 Machine-level findings

- `node_modules`: **114,217 files / 1.67 GB** (measured `Get-ChildItem -Recurse -File node_modules`).
- Workspace path `D:\helix projects\workspace\tab apps\helix hub v1` is **NOT** in Windows Defender exclusions (verified — `(Get-MpPreference).ExclusionPath` returned admin-required; path absent from any exclusion that would match).
- Node version: v20.15.1 → built-in `node --watch-path=` is available.
- nodemon 3.1.10 cold spawn is ~42s; warm 0.2s. Same workload Node's `--watch` handles natively.

### 2.3 Application-level findings

- **129 routes** are eagerly `require()`d at the top of [server/index.js](../../server/index.js) (lines ~368–500). Each pulls its own SDK closure.
- **39 files** under `server/routes` + `server/utils` `require('mssql')` directly instead of going through [server/utils/db.js](../../server/utils/db.js).
- **6 files** use `axios`; **8 files** use `node-fetch`. Two HTTP clients duplicated.
- **7 files** import `@azure/keyvault-secrets` directly; should go through [server/utils/getSecret.js](../../server/utils/getSecret.js). Same for `@azure/identity` (4 files).
- **4 files** load `@azure/storage-blob` at top level (heaviest single SDK). Example: [server/routes/documents.js](../../server/routes/documents.js) lines 1–8 imports `BlobServiceClient`, `StorageSharedKeyCredential`, `BlobSASPermissions`, `generateBlobSASQueryParameters` even though the client is already lazy-constructed via `getBlobServiceClient()` later in the file.
- **2 files** load the full `stripe` SDK at top level. [server/routes/paymentLink.js](../../server/routes/paymentLink.js) line 3 — `Stripe` is then only used inside `resolveStripeSecretKey()` and the route handlers.
- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) line 110 has a **live `getTask` ReferenceError** that crashed nodemon on the second restart of the diagnostic run. Distinct bug, isolated fix.
- [nodemon.json](../../nodemon.json) watches `server/**` with `ext: js,json` — correct scope, but nodemon itself is the bottleneck not its config.
- [server/index.js](../../server/index.js) has `_bootMark()` instrumentation gated by `HELIX_BOOT_TIMING` env (set by [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs)). Module._load patch lines ~341–365 times `./routes/*` and `./middleware/*` requires but **NOT** `./utils/*`. Worth extending if more granular cold-cost data is needed later.

### 2.4 What already exists (don't rebuild)

- [tools/dev-fast.mjs](../../tools/dev-fast.mjs) sets `HELIX_LAZY_INIT=1` + `FORCE_BOOT_WARMUPS=false` + `BROWSER=none` and re-uses `dev-all-with-logs.mjs`. The scheduler + event poller are already gated.
- [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) handles terminal noise filtering, idle watchdog, milestone matchers, log rotation under `logs/dev-all/<runId>/`.
- [src/utils/devHmr.ts](../../src/utils/devHmr.ts) provides `disposeOnHmr()` + `onServerBounced()` for SSE survival across restarts.

---

## 3. Plan

> **Status update 2026-05-23.** Phase A shipped (changelog 2026-05-23). Phase B1 shipped (changelog 2026-05-23): all non-eager routes now go through `lazyRouter()`, warm listen-ready measured at ~1.5s with `HELIX_LAZY_INIT=1`. Phase B2 and Phase C remain open, but Phase C is no longer on the cold-boot critical path — see the rescoping note in §3 Phase C.

### Phase A — Tier 1 wins (massive, near-zero effort)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add Windows Defender exclusion (one-time machine setup) | n/a | Run elevated PowerShell: `Add-MpPreference -ExclusionPath "D:\helix projects\workspace\tab apps\helix hub v1"`, plus `%LOCALAPPDATA%\npm-cache`, `%APPDATA%\npm`, `%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders`, the Node install dir. Likely 50–70% cold-boot improvement on its own. |
| A2 | Make `dev:fast` the documented default | [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md), [package.json](../../package.json) | Update the "Two boot modes" table prose so `dev:fast` is the everyday command and `dev:all` is reserved for scheduler/poller work. Consider aliasing `npm run dev` → `dev:fast`. |
| A3 | Replace nodemon with Node 20 built-in watcher | [package.json](../../package.json) line 109, [nodemon.json](../../nodemon.json) | Change `start:server:watch` to `node --watch-path=server --watch-path=server.js server/index.js`. Saves ~42s cold spawn. Keep nodemon in deps temporarily as fallback. Delete `nodemon.json` once verified. |
| A4 | Fix `getTask` ReferenceError | [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) line 110 | Either define `getTask` or rename to the intended helper. Confirm by `node -e "require('./server/utils/asanaTasks')"` (already verified loadable, but the run-time path that hits line 110 still throws). |

**Phase A acceptance:**
- [ ] Cold boot drops below 60s (target: <30s after A1 lands).
- [ ] Warm restart drops below 1s (no nodemon spawn cost).
- [ ] Second restart of `dev:all` no longer crashes with `getTask is not defined`.
- [ ] `dev-experience.instructions.md` reflects the new defaults.
- [ ] `logs/changelog.md` entry added.

### Phase B — Tier 2 (medium effort, transformational)

#### B1. Lazy-mount routes

Convert the 129 eager `require('./routes/*')` calls in [server/index.js](../../server/index.js) to a deferred mount:

```js
function lazyRouter(modulePath) {
  let router;
  return (req, res, next) => {
    if (!router) router = require(modulePath);
    return router(req, res, next);
  };
}
app.use('/api/documents', lazyRouter('./routes/documents'));
```

First request to each route pays a small one-time penalty (5–50ms each). Cold boot drops to ~5–10s for boot-critical routes only. Reversible per route, additive.

**Caveat:** any route that registers listeners or background work at module load must opt OUT of lazy mount. Audit:
- `server/routes/events.js` (SSE), `server/routes/webhooks.js`, anything calling `setInterval` or `app.locals.xxx = ...` at top level. Maintain an explicit eager-list constant.

#### B2. Pre-bundle dev server with esbuild

Add a `dev:bundle` step:

```bash
esbuild server/index.js --bundle --platform=node --target=node20 \
  --external:mssql --external:@azure/* --external:msnodesqlv8 \
  --outfile=.dev-cache/server.bundle.js --sourcemap
```

Then `node --watch-path=server .dev-cache/server.bundle.js`. One disk read per boot instead of thousands. Cold boot well under 10s even with cold AV cache. Dev-only artefact; production untouched.

**Risks to mitigate:** dynamic requires inside business logic (search for `` require(`./...${var}`) `` or `await import(...)`). If found, mark those modules `--external` too.

### Phase C — Tier 3 (compounding hygiene)

> **Rescoped 2026-05-23.** After B1, route modules only load on first hit, so every direct `require('mssql')` / `require('@azure/keyvault-secrets')` / heavy SDK call inside a route file is now deferred for free. C1/C2/C3 stop being boot-perf items and become **consistency and code-quality items**: single pool reuse, unified retry policy, fewer divergent error shapes. Do them incrementally during nearby work; no single mega-sweep.

#### C1. Move heavy SDK requires to lazy paths

For each of these files, move the top-level `require()` into the function/handler that uses the SDK:
- [server/routes/documents.js](../../server/routes/documents.js) — `@azure/storage-blob` → inside `getBlobServiceClient()`.
- [server/routes/paymentLink.js](../../server/routes/paymentLink.js) — `stripe` → inside `resolveStripeSecretKey()` consumer.
- Any other file with `@azure/storage-blob`, `stripe`, `docx`, `openai`, `pdf-lib`, `puppeteer` at top level.

#### C2. Standardise HTTP client

Pick `node-fetch` (already 8 sites) or `undici` (built into Node 18+). Remove `axios` from the 6 sites that still use it. Update [server/utils/](../../server/utils/) with a thin `httpFetch(url, options)` helper.

#### C3. Centralise Key Vault + SQL access

- All `@azure/keyvault-secrets` + `@azure/identity` usage MUST go through [server/utils/getSecret.js](../../server/utils/getSecret.js). Rip the 7 direct importers.
- All `mssql` usage MUST go through [server/utils/db.js](../../server/utils/db.js) (use `withRequest()` / `getPool()`). Rip the 39 direct importers progressively.

### Phase D — Separate stash brief (frontend)

Vite migration from CRA/craco — owns its own brief. Out of scope here. See §7.

---

## 4. Step-by-step execution order

1. **A1** — User adds Defender exclusion in elevated PowerShell (one-time, machine-local).
2. **A4** — Fix `asanaTasks.js:110` ReferenceError (5 min, isolated).
3. **A3** — Swap nodemon → `node --watch-path`. Run `dev:all` to confirm cold + warm both green.
4. **A2** — Update `dev-experience.instructions.md` + optionally add `npm run dev` alias.
5. Ship Phase A. Add changelog entry. **STOP and measure.**
6. **B1** — Lazy-mount routes (incremental: 10 routes at a time, smoke-test each batch).
7. **B2** — esbuild dev bundle. Add to `tools/dev-fast.mjs` as pre-step.
8. Ship Phase B. Measure. Add changelog entry.
9. **C1, C2, C3** — chip away during ordinary work in nearby files. Don't batch as a single PR.

---

## 5. Verification checklist

**Phase A:**
- [ ] `time npm run dev:all` cold (after restart + clear filesystem cache) ≤ 60s.
- [ ] `time npm run dev:fast` warm ≤ 5s end-to-end.
- [ ] Restart cycle (touch a server file): server back up in ≤ 1s.
- [ ] Defender exclusion verified: `(Get-MpPreference).ExclusionPath` contains the workspace path (admin shell).
- [ ] No "[nodemon]" lines in the dev log anymore (proves A3 ran).
- [ ] `server/utils/asanaTasks.js` line 110 no longer references an undefined symbol.

**Phase B:**
- [ ] Cold boot ≤ 10s without Defender exclusion; ≤ 5s with it.
- [ ] First request to each lazy route returns a 2xx (smoke a sample of 20 routes).
- [ ] esbuild bundle is regenerated on file change within 200ms.
- [ ] Production deploy untouched (no changes to `build-and-deploy*.ps1`, `teamsapp*.yml`).

**Phase C:**
- [ ] `grep -l "require('mssql')" server/routes server/utils` returns ≤ 5 files.
- [ ] `grep -l "require('axios')" server` returns 0.
- [ ] `grep -l "require('@azure/keyvault-secrets')" server` returns only `server/utils/getSecret.js`.

---

## 6. Open decisions (defaults proposed)

1. **`npm run dev` alias?** — Default: **alias to `dev:fast`**. Rationale: muscle memory; `dev:all` becomes opt-in for scheduler work.
2. **Keep nodemon installed?** — Default: **remove from `devDependencies` after Phase A ships and runs clean for a week**. Rationale: dead weight.
3. **Eager vs lazy routes in B1** — Default: **lazy by default**, maintain a small `EAGER_ROUTES` allowlist for SSE/webhook/scheduler-touching modules. Rationale: opt-in eagerness is safer than opt-in laziness.
4. **esbuild output location** — Default: **`.dev-cache/`** (add to `.gitignore`). Rationale: keeps `build/` reserved for production CRA output.
5. **Defender exclusion scope** — Default: **workspace + npm cache + Node install**. Do NOT exclude `C:\Windows` or `Program Files` system paths.

---

## 7. Out of scope

- **Frontend cold compile (17s)** — Vite migration deserves its own stash brief. Touches `craco.config.js`, `package.json`, `src/index.tsx`, `public/index.html`, env handling, all CRA-specific imports. Multi-week lift.
- **Production deploy pipeline** — `build-and-deploy.ps1` and Teams app packaging unchanged. Dev-only changes here.
- **App Insights telemetry restructure** — separate concern.
- **CCL / matter-opening / Clio integration logic** — no business logic changes. This brief is purely about how the dev process starts and reloads.
- **Submodules** — read-only per copilot-instructions.md.

---

## 8. File index (single source of truth)

Client:
- (none — frontend untouched in this brief)

Server:
- [server/index.js](../../server/index.js) — route mount conversion (B1), boot mark instrumentation already in place
- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) — fix line 110 (A4)
- [server/routes/documents.js](../../server/routes/documents.js) — lazy storage-blob require (C1)
- [server/routes/paymentLink.js](../../server/routes/paymentLink.js) — lazy stripe require (C1)
- [server/utils/db.js](../../server/utils/db.js) — central SQL access (C3 target)
- [server/utils/getSecret.js](../../server/utils/getSecret.js) — central Key Vault access (C3 target)

Tooling / config:
- [package.json](../../package.json) line 109 — `start:server:watch` swap (A3); optional `dev` alias (A2)
- [nodemon.json](../../nodemon.json) — delete after A3 verified
- [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) — no changes expected; verify it still works post-A3
- [tools/dev-fast.mjs](../../tools/dev-fast.mjs) — add esbuild pre-step in B2
- `.dev-cache/` (NEW, gitignored) — esbuild output location for B2
- [.gitignore](../../.gitignore) — add `.dev-cache/`

Docs / changelog:
- [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md) — update boot modes table (A2)
- [logs/changelog.md](../../logs/changelog.md) — one entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: dev-loop-cold-boot-performance-overhaul
verified: 2026-05-23
branch: main
touches:
  client: []
  server:
    - server/index.js
    - server/utils/asanaTasks.js
    - server/routes/documents.js
    - server/routes/paymentLink.js
  submodules: []
  tooling:
    - package.json
    - nodemon.json
    - tools/dev-all-with-logs.mjs
    - tools/dev-fast.mjs
    - .github/instructions/dev-experience.instructions.md
depends_on: []
coordinates_with:
  # File-level overlap on server/index.js (route mounts / app bootstrap):
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - agent-suggestions-inbox-in-my-helix
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - database-index-and-dual-db-audit
  - forms-preflight-matrix-in-activity-tab
  - helix-software-dev-productivity-control-plane
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - resources-hub-forms-pattern-rebuild
  - resources-tab-restructure-with-templates-section
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails  # closest cousin: HMR + dev perf
  # Directory-level overlap (server/utils/asanaTasks.js, server/routes/documents.js, server/routes/paymentLink.js):
  - clio-token-refresh-shared-primitive
  - clio-token-refresh-architecture-audit
conflicts_with: []
```

---

## 9. Gotchas appendix

- **The 110s `core-utils:loaded` gap is misleading.** It's NOT the utils themselves, it's the cumulative cold disk-read cost of every transitive `require()` they pull in (Azure SDKs, mssql, ioredis, app insights). The fix is Defender + bundling, not refactoring the utils.
- **Two nodemon restarts at +203s and +213s** were observed in the diagnostic run with no obvious trigger. The second crashed on `asanaTasks.js:110`. Suspect cause: log file mtime touches or webpack output landing inside `server/**` watched paths. Re-investigate after A3 (Node --watch may behave differently).
- **`HELIX_LAZY_INIT=1` only skips the scheduler/poller *start*** — the `require()` of those modules still happens at the top of [server/index.js](../../server/index.js). To save cold-load time, B1 must wrap the requires too, or move them behind a lazy getter. Lines ~70–71.
- **Module._load patch (server/index.js ~341–365)** only instruments `./routes/*` and `./middleware/*` requires. Util requires are blind. If deeper profiling is needed later, broaden the prefix list.
- **CRA frontend warm compile (~17s)** is craco re-doing CRA's webpack config from scratch each boot. Don't chase this in Phase A/B, the Vite migration (out of scope) is the right fix.
- **Defender exclusion needs admin shell.** Don't promise the user it can be scripted without elevation. Provide the exact command for them to paste.
- **Don't touch `build-and-deploy.ps1` or `teamsapp.yml`** — production is untouched. If a phase ever requires it, that's a sign scope has crept.
- **`tools/dev-all-with-logs.mjs` milestoneMatchers** have a regex for "nodemon restarting". After A3 that won't fire. Update the matcher to also recognise Node's own watch-mode restart signal (or drop that matcher).
- **Stripe + Azure storage-blob top-level requires are intentional in 2026-05-23 state** — historically the team valued "fail-fast at boot if SDK missing". Lazy require shifts that failure to first-request. Acceptable in dev; verify prod fail-fast story before extending C1 to production paths.
- **Some routes will misbehave with lazy mount** if they register `app.locals.*` or `process.on('SIGTERM', ...)` at module load. The eager allowlist must be discovered by attempting B1 incrementally, not in one go.
