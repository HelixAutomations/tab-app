# Vault room — developer hygiene, HMR, dev performance, and AI-clutter guardrails

> **Purpose.** A cold-start brief for the multi-phase programme to bring this
> repo to "vault room" condition: pristine, observable, and resistant to
> AI-coding clutter as it grows. Pick this up when there is a dedicated
> dev-experience window — it's not a one-shot fix.
>
> **How to use it.** Read fully once. Phases are independently shippable; do
> them in order. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-21 against branch `main`.

---

## 1. Why this exists (user intent)

Direct user quote (2026-04-21):

> "im also having to restart the terminal npm run dev:all and http://localhost:3000/ over and over to see changes. i thought we had already wired in seamless hot reload? … in fact something in the app that's running prevents me from just reloading the browser window i have to redo it close it down start >Simple Browser: Show again. … in prod the app benefits from the web app's resource and ram, and locally its a bit slower, which i get but it undermines how efficient the app really is. it does a lot of things but came along way and has been vibe coded. i want to increasingly move away from it by having modern agents pick up opportunities where spotted to bring the app to real pristine state, imagine a container where everything inside is pristinely taken care of, like a server room or a vault room, air pressurised and what not — i want that for this repo, where atm i envision it more like an esports house. you know what i mean? with ai clutter and what not. help me scope this and dissect this mess of a prompt so that we can truly implement this and stand up guardrails so that it gets taken care of as we go too"

The mental model is **vault room vs. esports house**: every artefact has a
defined purpose, dead code is removed not deferred, dev loop is fast and
predictable, and there is a small set of automated guardrails that make
regressing the cleanliness obvious during normal development.

The user is **not** asking for a rewrite. They want compounding hygiene plus
the immediate dev-loop pain killed.

**Already shipped this session (2026-04-21) as Phase 0 quick wins** — see
changelog. The remaining work below is the structural programme.

---

## 2. Current state — verified findings

### 2.1 Dev pipeline architecture

- [package.json](../../package.json) — `dev:all` → `node tools/dev-all-with-logs.mjs`. Spawns two children: backend (`npm run start:server:watch` → nodemon on `server/**`, restart on `js/json` changes, 200ms delay) and frontend (`npm run start:dev` → `craco start`).
- [server.js](../../server.js) — root entry is a one-liner `require('./server/index')`.
- [server/index.js](../../server/index.js) — Express listens on `process.env.PORT || 8080`.
- Frontend (CRA + craco) listens on 3000. CRA proxy ([src/setupProxy.js](../../src/setupProxy.js)) forwards `/api` and `/ccls` to `http://localhost:8080`, with `timeout: 0, proxyTimeout: 0` for SSE durability (necessary; means hung connections never auto-die).
- [craco.config.js](../../craco.config.js) — Phase 0 (this session) added: filesystem cache (`config.cache.type='filesystem'`), faster source maps (`devtool='eval-cheap-module-source-map'`). `ForkTsCheckerWebpackPlugin` was already filtered out in dev.
- [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) L177-186 — Phase 0 added: `BROWSER=none` and `FAST_REFRESH=true` injected only into the frontend child env.
- ~~`config-overrides.js`~~ — **deleted in Phase 0** (was dead — craco never read it; its `poll: 2000` setting would have *harmed* HMR if applied).

### 2.2 HMR / Fast Refresh — why it doesn't always feel "live"

- `react-refresh` (0.17) and `@pmmmwh/react-refresh-webpack-plugin` (0.6.1) are in [package.json](../../package.json) devDependencies. CRA 5.x enables Fast Refresh by default. So Fast Refresh **is** wired — but Fast Refresh requires every module on the changed file's boundary to export *only* React components for state preservation. If a file exports anything else (helper, hook, type, default-export non-component, top-level side effect), Fast Refresh **falls back to a full reload of that subtree**.
- [src/index.tsx](../../src/index.tsx) is **2,301 lines / ~104KB**. It mixes the React `App`, top-level effects, EventSource setup (L1373), helpers, and module-level state. Almost every edit anywhere in its dependency chain causes a full reload, not a hot patch.
- Many tabs (e.g. `OperationsDashboard.tsx`, `Home.tsx`) follow the same pattern. The "feels broken" perception is largely Fast Refresh giving up because the boundaries aren't clean, not the toolchain itself failing.

### 2.3 Browser-reload blocker (Simple Browser stuck)

- 7 long-lived `EventSource` (SSE) consumers found:
  - [src/index.tsx](../../src/index.tsx) L1373 — `/api/enquiries-unified/stream`
  - [src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts) — `/api/ops-pulse/stream`
  - [src/hooks/useStreamingDatasets.ts](../../src/hooks/useStreamingDatasets.ts)
  - [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts)
  - [src/tabs/Reporting/LogMonitor.tsx](../../src/tabs/Reporting/LogMonitor.tsx) — `/api/logs/stream`
  - [src/hooks/useHomeMetricsStream.ts](../../src/hooks/useHomeMetricsStream.ts)
  - [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — `/api/data-operations/stream`
- All have proper cleanup in their `useEffect` returns. The likely Simple Browser pain isn't a leak — it's that closing 6+ open SSE connections during webview reload is slow because the proxy holds them with `timeout: 0`. The webview can stall waiting for `unload`.
- No `beforeunload` handlers and no service worker registered (verified by grep — only hits are inside `submodules/`).

### 2.4 Server-side dev restart cost

- [nodemon.json](../../nodemon.json) — watches `server/**`, ignores `build`, `node_modules`, `api`. Restart on every `.js`/`.json` change with 200ms debounce. Cold restart of `server/index.js` is heavy because it eagerly initialises App Insights, both SQL pools, the scheduler, the SSE channels, and the warmup tier (Tier 1 at port-listen, Tier 2 after 3s).
- A single typo in a server file therefore feels like a 2–4s blackout to the UI.

### 2.5 AI-clutter / hygiene surface

Spotted while inventorying for this brief — *not exhaustive*:

- **Dead config**: `config-overrides.js` (now removed). Likely more — needs a sweep.
- **Top-level temp files in repo root**: `temp_build_check.txt`, `temp_head_opsdash_utf8.txt`, `temp_head_opsdash.txt`, `temp_read.txt`, `temp_tsc_err.txt`, `temp_tsc.txt`, `temp.txt`, `tsc-check.txt`, `tsc-err.txt`, `tsc-errors.txt`, `tsc-out.txt`, `tsc-out2.txt`, `prompts.txt`. All look like one-shot AI scratchpads that shipped into the repo.
- **`temp_build_check/` and `temp-staging-logs/`** directories at repo root.
- **Duplicate / parallel paths**: `build/` and `deploy-staging/` both contain copies of `server.js`, asset manifests, html. Some intentional, some residue.
- **Massive files** that block Fast Refresh and human comprehension: `src/index.tsx` (2,301 lines), `src/components/modern/OperationsDashboard.tsx` (6,000+ lines), several tabs near the 3,000-line `check-sizes` threshold.
- **15 copies of `getAreaColor` with inconsistent fallbacks** — already noted in `.github/copilot-instructions.md`.
- **No `.gitignore` rule for `temp*.txt` / `tsc-*.txt`** at repo root — they will keep recurring as long as agents drop scratch output there.

### 2.6 Existing infrastructure to lean on

- [tools/check-file-sizes.mjs](../../tools/check-file-sizes.mjs) — surfaces files near the 3,000-line ceiling.
- `.github/workflows/ci.yml` — lint/test/build gate on PRs. Hookable.
- App Insights instrumentation pattern is mature — trivial to add per-phase telemetry.
- Stash + INDEX system already governs scoped projects.

---

## 3. Plan

### Phase 0 — Quick wins (DONE 2026-04-21)

| # | Change | File |
|---|--------|------|
| 0a | Filesystem webpack cache + `eval-cheap-module-source-map` in dev | [craco.config.js](../../craco.config.js) |
| 0b | `BROWSER=none` + `FAST_REFRESH=true` for the frontend child only | [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) |
| 0c | Delete dead `config-overrides.js` | repo root |

**Acceptance:** rebuilds after first warm build noticeably faster; no second browser tab opens on `dev:all`; no misleading config file in repo root.

### Phase A — Kill the reload pain

> **Status (2026-04-21):** A3 and A4 shipped. A1 (scratch cleanup) and A2 (Simple Browser docs) still open.
>
> What landed: `disposeOnHmr` + `onServerBounced` helpers in [src/utils/devHmr.ts](../../src/utils/devHmr.ts), retrofitted across all 7 SSE sites. New `npm run dev:fast` skips scheduler + event poller via `HELIX_LAZY_INIT=1`. Dev-only `/api/dev/health` surfaces a stable `bootId`; [src/hooks/useDevServerBoot.ts](../../src/hooks/useDevServerBoot.ts) polls it and dispatches `helix:server-bounced` so SSE consumers reconnect immediately after a nodemon restart. Codified in [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md).

A1. **Repo-root scratch cleanup.** Move every `temp_*.txt`, `temp.txt`, `tsc-*.txt`, `tsc-out*.txt`, `prompts.txt`, `temp_build_check/`, `temp-staging-logs/` into a `.gitignore`'d `scratch/` (or delete if dead). Add `.gitignore` rules: `temp*.txt`, `tsc-*.txt`, `scratch/`. Goal: `git status` after a fresh clone shows zero "agent litter".

A2. **Document the Simple Browser reload workflow.** Two-line section in `.github/instructions/` plus an optional `tools/dev-soft-reload.mjs` — when Simple Browser stalls, the recovery is `Ctrl+Shift+P → Developer: Reload Webview`, not "kill server + restart". Reduces perceived pain even before the deeper fix.

A3. **SSE soft-disconnect on Fast Refresh.** Add an `if (module.hot) { module.hot.dispose(() => es.close()); }` guard to each of the 7 EventSource sites in §2.3. Means SSE connections close cleanly when HMR replaces the module, instead of dangling until full unload.

A4. **Dev-only server restart announcement.** When nodemon restarts the backend, the SSE proxy 502s for ~1s. Surface this as a small toast/strip in the UI in dev only (read off a `/api/dev/health` heartbeat) so the user knows *why* a refresh is briefly broken.

**Acceptance:** `git status` clean immediately after clone; Simple Browser reloads in <1s without "Show again" workaround in 9 of 10 attempts; SSE-related console errors during HMR drop to zero.

### Phase B — Fast Refresh boundaries

B1. **Carve `src/index.tsx`** (2,301 lines) into:
   - `src/index.tsx` — bootstrap only (render, providers).
   - `src/app/AppShell.tsx` — the App component.
   - `src/app/streams/enquiriesStream.ts` — the SSE setup currently at L1373.
   - `src/app/bootstrap/*` — top-level effects.
   This alone restores Fast Refresh state preservation for ~90% of edits.

B2. **`react-refresh/only-export-components` ESLint rule** in dev. Surfaces every Fast Refresh boundary break as a warning *as it's introduced*. The guardrail that keeps B1 from regressing.

B3. **Component-file size budget.** CI check: warn at 1,500 lines, fail at 2,500. Existing `tools/check-file-sizes.mjs` does the underlying scan — extend or wire into CI.

**Acceptance:** edits to a leaf component update in-place without full reload in the common case; ESLint surfaces any new boundary break in PR review.

### Phase C — Backend dev-loop cost

> **Status (2026-04-21):** C1 (partial) and C3 shipped. C2 (selective nodemon restarts) still open.
>
> What landed: scheduler + event poller now skipped on boot when `HELIX_LAZY_INIT=1` (the `dev:fast` script sets this); banner reflects the skipped state. Aggressive warmups were already gated by `FORCE_BOOT_WARMUPS` (verified). C2 deferred — the file/route split is non-trivial and not blocking the day-to-day loop now that the schedulers are off the critical path.

C1. **Lazy-init heavy server subsystems** in dev. Defer App Insights, scheduler, SSE channels, and warmup tiers behind a `process.env.HELIX_LAZY_INIT === '1'` flag (default off in prod). Cuts cold-restart from ~3s to <1s.

C2. **Selective nodemon restarts.** Today every `server/**` change restarts everything. Either split routes into a hot-swappable router, or accept the limit and document it.

C3. **`/api/dev/health` endpoint** for the heartbeat in A4.

**Acceptance:** server cold restart <1.5s in dev; route-only edits hot-swap without losing in-memory state in the common case.

### Phase D — Vault-room guardrails (compounding)

D1. **`tools/vault-audit.mjs`** — single command that prints a one-screen hygiene report:
   - Files >2,500 lines
   - Top-level repo files matching scratch patterns
   - Dead config files (compare against active toolchain)
   - Inline brand-colour violations (off-palette hex literals)
   - Inline-style violations in new components
   - Orphan stash briefs (verified date >30 days)
   Hook into `npm run check-sizes` family.

D2. **`docs/HYGIENE_BUDGET.md`** — short, numbered. Each entry is a "we keep this clean because…" rule with the tool that enforces it. Linked from `copilot-instructions.md`. Agents read this before committing.

D3. **Dead-file detector.** Script that finds `.ts`/`.tsx`/`.js` files with zero imports in the active build graph and lists them. Manual review, not auto-delete.

D4. **Submodule status banner** in dev only. Submodules are a known source of confusion; surface their HEAD + dirty state in a corner of the dev UI so it's never invisible.

D5. **Inline-style auditor.** Per `.github/instructions/styles.instructions.md`, new components must use CSS classes from `design-tokens.css`. Add an ESLint rule or audit that warns when a new file in `src/components/` exceeds N inline-style entries.

**Acceptance:** `npm run vault-audit` produces a screen-sized signal-rich report; running it in CI gates merges that worsen the score.

### Phase E — AI-clutter prevention

E1. **`AGENTS.md` at repo root** (or extend `copilot-instructions.md`) with explicit "do not commit" patterns: scratch files, debug `console.log`, ad-hoc temp scripts in repo root (use gitignored `scripts/`), giant unrelated refactors smuggled into a small fix.

E2. **`.gitignore` lockdown.** Comprehensive scratch patterns. Anything an agent writes in a hurry should land in an ignored path by default.

E3. **PR template** with hygiene checklist (per the `Health Observations` and `Stash candidates` patterns already in `copilot-instructions.md`). Every PR ticks: no new `>1,500` line files, no new inline-style components, changelog entry added.

### Phase F — Wayfinding (DONE 2026-04-21)

> **Status:** shipped as a sibling to Phase A. Compounding investment in agent-co-piloting.

F1. **`data-helix-region` HTML attribute convention.** Every addressable surface (panels, tabs, modals, records) carries a stable dot-delimited region name. Inert in production. Codified in [.github/instructions/wayfinding.instructions.md](../../.github/instructions/wayfinding.instructions.md).

F2. **`window.__helix__` debug API** (dev only). `.regions()`, `.currentRegion()`, `.tabs()`, `.build()`, `.help()` — registered at boot from [src/utils/devWayfinding.ts](../../src/utils/devWayfinding.ts).

F3. **Wayfinding overlay.** `Ctrl+Shift+H` toggles a translucent overlay outlining every `[data-helix-region]` element with its name. Lives at [src/components/dev/WayfindingOverlay.tsx](../../src/components/dev/WayfindingOverlay.tsx); lazy-loaded only in dev.

F4. **`<html data-helix-build>` stamp.** Every screenshot, page source, or HAR capture now includes the build the operator is currently seeing.

**Open follow-on:** seed `data-helix-region` attributes on the major shells (App header, each top-level tab, the home panels, modals). Currently only `app/root` is seeded automatically. Each future PR that touches a panel should add its region name as a one-line cost.

E4. **Recurring vault sweep cadence.** Once a fortnight: run `vault-audit`, triage the top 3 items, ship as a single hygiene PR. Calendar reminder, not an agent task.

**Acceptance:** rate of new clutter introduced per PR drops measurably (audit score holds or improves week over week).

---

## 4. Step-by-step execution order

1. **Phase 0** — DONE.
2. **A1, A2** — same PR; pure cleanup + docs, no risk.
3. **A3** — small, low-risk. Ship before B.
4. **B1** — biggest single dev-experience improvement; needs care.
5. **B2, B3** — guardrails for B1; ship in same PR or immediately after.
6. **A4** + **C1** + **C3** — bundle (they share the heartbeat endpoint).
7. **C2** — only if C1 doesn't sufficiently solve the perceived pain.
8. **D1–D5** — sequence flexible; D1 first as it scaffolds the rest.
9. **E1–E4** — once D1 exists, the agent rules can reference its output.

---

## 5. Verification checklist

**Phase A:**
- [ ] `git status` clean immediately after `git clone`.
- [ ] Simple Browser reload works without "Show again" workaround consistently.
- [ ] No SSE / EventSource errors logged during a HMR cycle.
- [ ] User can edit a chip colour in `OperationsDashboard.tsx` and see the change without restarting `dev:all`.

**Phase B:**
- [ ] `src/index.tsx` ≤ 200 lines.
- [ ] `eslint-plugin-react-refresh` reports clean across `src/`.
- [ ] CI fails when a new `*.tsx` exceeds 2,500 lines.

**Phase C:**
- [ ] Cold `npm run start:server` to "ready" in <1.5s in dev.
- [ ] Route edit doesn't restart the scheduler.
- [ ] `/api/dev/health` returns boot timestamp + uptime + nodemon-restart count.

**Phase D / E:**
- [ ] `npm run vault-audit` exits non-zero when score regresses below baseline.
- [ ] CI surfaces audit diff on every PR.
- [ ] Agents reference `HYGIENE_BUDGET.md` in commit reasoning.

---

## 6. Open decisions (defaults proposed)

1. **CRA → Vite migration.** Default: **defer**. Improvement-scope memory already deferred this; Phase B1 + Phase C deliver most of the same wins without the migration risk. Revisit only if Phase B doesn't move the needle.
2. **Scratch-file landing zone.** Default: **`scratch/`** (gitignored). Recommend keeping `scripts/` (already gitignored) for runnable tools and `scratch/` for `*.txt` outputs.
3. **`eslint-plugin-react-refresh` strictness.** Default: **warn, not error**, for first 2 weeks; flip to error after the index-tsx carve-up.
4. **Dev-only restart strip UI.** Default: **off behind `localStorage.helixDevToolsEnabled === '1'`** to avoid distracting the user when not debugging the dev loop.
5. **Submodule status banner placement.** Default: **bottom-right corner, dev-only, collapsible**.

---

## 7. Out of scope

- Replacing CRA with Vite or Turbopack (parked — see decision 1).
- Rewriting submodules (read-only per repo rules).
- Production performance tuning (this is the *dev* loop programme).
- Any new product feature.
- Dependency upgrades (handle separately).
- Test framework migration.

---

## 8. File index (single source of truth)

Client (likely touch points):
- [src/index.tsx](../../src/index.tsx) — Phase B1 split
- [src/setupProxy.js](../../src/setupProxy.js) — referenced for §2.1, no edit planned
- All 7 `EventSource` files listed in §2.3 — Phase A3 HMR dispose
- [craco.config.js](../../craco.config.js) — Phase 0 done; further dev-only tweaks possible

Server:
- [server/index.js](../../server/index.js) — Phase C1 lazy-init, C3 health endpoint
- [nodemon.json](../../nodemon.json) — Phase C2 selective watch

Tools:
- [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) — Phase 0 done
- `tools/vault-audit.mjs` (NEW) — Phase D1
- [tools/check-file-sizes.mjs](../../tools/check-file-sizes.mjs) — Phase B3 extend
- `tools/dev-soft-reload.mjs` (NEW, optional) — Phase A2

Docs / governance:
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — Phase E1 reference
- `docs/HYGIENE_BUDGET.md` (NEW) — Phase D2
- `AGENTS.md` (NEW or merged into copilot-instructions.md) — Phase E1
- `.gitignore` — Phase A1 + E2
- `.github/workflows/ci.yml` — Phase D + E gating
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
verified: 2026-04-21
branch: main
touches:
  client:
    - src/index.tsx
    - src/setupProxy.js
    - src/hooks/useStreamingDatasets.ts
    - src/hooks/useRealtimeChannel.ts
    - src/hooks/useHomeMetricsStream.ts
    - src/tabs/roadmap/hooks/useOpsPulse.ts
    - src/tabs/Reporting/LogMonitor.tsx
    - src/components/modern/CallsAndNotes.tsx
    - craco.config.js
  server:
    - server/index.js
    - nodemon.json
  submodules: []
depends_on: []
coordinates_with:
  - home-skeletons-aligned-cascade
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - demo-mode-hardening-production-presentable-end-to-end
  - call-centre-external-attendance-note-and-clio-mirror   # shares src/components/modern/CallsAndNotes.tsx — Phase A3 only adds an HMR dispose hook, no logic changes
  - realtime-multi-replica-safety                          # shares server/index.js — Phase C1/C3 touches boot/init, separate from replica-safety scope
  - session-probing-activity-tab-visibility-and-persistence # shares server/index.js — same boot/init region; sequence by date of pickup
  - ux-realtime-navigation-programme                       # shares src/index.tsx — Phase B1 carve-up; coordinate with whoever lands first
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Don't enable `poll`-based watching.** The deleted `config-overrides.js` set `poll: 2000` and `liveReload: false`. Polling at 2s is the *opposite* of what we want — webpack's native fs.watch on Windows is fine; polling adds latency and CPU.
- **`timeout: 0` on the SSE proxy is intentional.** Don't "fix" it — SSE connections are long-lived by design. The browser-stall pain is solved by closing connections cleanly on HMR (Phase A3), not by capping proxy timeouts.
- **`ForkTsCheckerWebpackPlugin` is intentionally disabled in dev** ([craco.config.js](../../craco.config.js)). Re-enabling it would block webpack-dev-server. The IDE handles type-checking. Do not "restore" this plugin under "improvements".
- **`server.js` at root is just `require('./server/index')`** — don't move logic into it; it exists so `node server.js` works as a single entry for IISNode in production.
- **App Insights init in `server/index.js` MUST happen before Express imports** — Phase C1 lazy-init must respect this ordering; lazy = "deferred warmup", not "deferred SDK boot".
- **The `module.hot` calls in `PitchBuilder.tsx` and `EditorAndTemplateBlocks.tsx` are intentional** dev-time hot-accept hooks for template scenario edits. Do not strip them when adding general HMR dispose handlers.
- **2,301-line `index.tsx` is the single biggest Fast Refresh blocker** — but it's also the bootstrap of the entire app. Carve it carefully: every export it currently has needs a new home, and the App component must remain the default export of `src/index.tsx` (or you'll break CRA's entry resolution unless you also retarget `react-scripts` config, which you can't without ejecting).
# Vault room — developer hygiene, HMR, dev performance, and AI-clutter guardrails

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-20 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

<1–3 short paragraphs. Quote the user verbatim where possible. State what the request is and what the user is *not* asking for.>

---

## 2. Current state — verified findings

<For every claim, cite a file path and line number. No memory-based assertions.>

### 2.1 <subsystem / area>

- File: [path/to/file.ts](../../path/to/file.ts) — what it currently does
- Notable line refs: L###, L###

### 2.2 <next subsystem>

…

---

## 3. Plan

### Phase A — <small, independently shippable correction>

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | … | [path](../../path) | … |
| A2 | … | … | … |

**Phase A acceptance:** <bullet list of observable outcomes>

### Phase B — <larger architectural piece>

#### B1. <component>

<DDL, function signatures, data flow — whatever a future agent needs>

#### B2. <next component>

…

---

## 4. Step-by-step execution order

1. **A1** — <action>
2. **A2** — <action>
3. *(parallel with 4)* **B1** — <action>
4. *(parallel with 3)* **B2** — <action>
5. …

---

## 5. Verification checklist

**Phase A:**
- [ ] <observable outcome>
- [ ] <observable outcome>

**Phase B:**
- [ ] <observable outcome>
- [ ] App Insights events: `<EventName.Started/Completed/Failed>` visible
- [ ] SQL spot check: `<query>`

---

## 6. Open decisions (defaults proposed)

1. **<decision>** — Default: **<recommended option>**. Rationale: <one line>.
2. **<decision>** — Default: **<recommended option>**.

---

## 7. Out of scope

- <item>
- <item>

---

## 8. File index (single source of truth)

Client:
- [path](../../path) — purpose

Server:
- [path](../../path) — purpose

Scripts / docs:
- `path` (NEW) — purpose
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails                          # used in INDEX cross-refs
verified: 2026-04-20
branch: main
touches:
  client: []
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with: []              # ids that touch the same files but don't block
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

<The non-transferable residue. Things you only spot by tracing the code in this session. Examples:>

- `<file>` line N uses `event.stopPropagation()` on the inner Edit click — preserve that when restructuring or the parent row's onClick will fire.
- `<helper>` looks like a one-liner but has hidden side effects in <other file>.
- The `<seemingly-obvious-fix>` was tried before and reverted in commit `<sha>` because <reason>.
