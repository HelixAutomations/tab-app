# Activity route live checks and prod parity surface

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-25 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quotes from this session:

> "everything should be testable as if in prod to avoid surprises"

> "i want a scope and brief stashed for a lightweight tool that can do this in the Activity' space/tab for dev group users to have control and visibility/almost a 'come alive' check where i can choose which route to test and see if it works. one click button, with a what would happen breakdown, and action to fire the test live."

The ask is not another terminal-only script or a generic ping page. The ask is a lightweight control-plane surface inside Activity where a dev-group user can choose a curated route or workflow check, see exactly what will happen, run it live, and get a dependency-specific answer instead of a vague "server is up" signal.

This should complement the existing passive observability work, not replace it. App Insights, ops pulse, and the dev boot route stay valuable. The missing layer is an active "will this route or workflow work right now?" operator check that can be run on demand before release or while debugging a live issue.

---

## 2. Current state - verified findings

### 2.1 Activity already has the right audience and shell

- [../../src/tabs/roadmap/Roadmap.tsx#L212](../../src/tabs/roadmap/Roadmap.tsx#L212) gates the live monitor with `isDevGroupOrHigher(primaryUser)`.
- [../../src/tabs/roadmap/Roadmap.tsx#L216](../../src/tabs/roadmap/Roadmap.tsx#L216) wires `useOpsPulse(showLiveMonitor)` into the Activity tab.
- [../../src/app/admin.ts#L100](../../src/app/admin.ts#L100) defines `isDevGroupOrHigher(user)`.
- [../../src/app/admin.ts#L105](../../src/app/admin.ts#L105) makes Activity visible to that same dev-group-or-higher tier.

Conclusion: the requested audience already exists. Activity is the right host surface.

### 2.2 Activity has passive lenses, but no active checks lens

- [../../src/tabs/roadmap/parts/ActivityHero.tsx#L7](../../src/tabs/roadmap/parts/ActivityHero.tsx#L7) defines the current lens union as `all | forms | matters | sync | errors | trace | briefs`.
- [../../src/tabs/roadmap/parts/FocalSurface.tsx#L35](../../src/tabs/roadmap/parts/FocalSurface.tsx#L35), [../../src/tabs/roadmap/parts/FocalSurface.tsx#L58](../../src/tabs/roadmap/parts/FocalSurface.tsx#L58), and [../../src/tabs/roadmap/parts/FocalSurface.tsx#L77](../../src/tabs/roadmap/parts/FocalSurface.tsx#L77) branch between forms, sync, errors, trace, briefs, matters, and the default live stream only.

Conclusion: there is no first-class `checks` lens or panel yet.

### 2.3 Ops Pulse is a strong passive foundation

- [../../server/routes/ops-pulse.js#L54](../../server/routes/ops-pulse.js#L54) uses an inline server-side dev-group gate.
- [../../server/routes/ops-pulse.js#L71](../../server/routes/ops-pulse.js#L71) exposes `/api/ops-pulse/snapshot`.
- [../../server/routes/ops-pulse.js#L107](../../server/routes/ops-pulse.js#L107) exposes `/api/ops-pulse/stream`.
- [../../src/tabs/roadmap/hooks/useOpsPulse.ts#L39](../../src/tabs/roadmap/hooks/useOpsPulse.ts#L39) fetches the snapshot before connecting.
- [../../src/tabs/roadmap/hooks/useOpsPulse.ts#L75](../../src/tabs/roadmap/hooks/useOpsPulse.ts#L75) opens the EventSource stream.
- [../../src/tabs/roadmap/hooks/useOpsPulse.ts#L180](../../src/tabs/roadmap/hooks/useOpsPulse.ts#L180) and [../../src/tabs/roadmap/hooks/useOpsPulse.ts#L187](../../src/tabs/roadmap/hooks/useOpsPulse.ts#L187) already handle HMR/server-bounce cleanup.

Conclusion: Activity already has a live control-plane feed, but it is read-only. It reports what the app is doing, not whether a selected route or workflow will complete successfully right now.

### 2.4 Current dev health is too shallow

- [../../server/index.js#L725](../../server/index.js#L725) mounts `/api/dev/health` only outside production.
- [../../server/routes/devHealth.js#L4](../../server/routes/devHealth.js#L4) documents the response shape as `{ bootId, uptime, pid, lazyInit, nodeEnv }`.
- [../../server/routes/devHealth.js#L29](../../server/routes/devHealth.js#L29) and [../../server/routes/devHealth.js#L32](../../server/routes/devHealth.js#L32) confirm the route reports boot metadata only.

Conclusion: this route is useful for detecting restarts, but it cannot answer whether SQL, Redis, Key Vault, Clio, or external browser dependencies are healthy for a specific route/workflow.

### 2.5 There is already a diagnostics-panel pattern to copy

- [../../src/tabs/Reporting/CacheMonitor.tsx#L37](../../src/tabs/Reporting/CacheMonitor.tsx#L37) polls on a fixed interval.
- [../../src/tabs/Reporting/CacheMonitor.tsx#L76](../../src/tabs/Reporting/CacheMonitor.tsx#L76) and [../../src/tabs/Reporting/CacheMonitor.tsx#L77](../../src/tabs/Reporting/CacheMonitor.tsx#L77) call paired diagnostics/analytics endpoints.
- [../../server/routes/cache-preheater.js#L102](../../server/routes/cache-preheater.js#L102) and [../../server/routes/cache-preheater.js#L121](../../server/routes/cache-preheater.js#L121) expose the server-side analytics and diagnostics routes that power it.

Conclusion: the repo already has a precedent for a compact operator panel that fronts diagnostics endpoints. The new checks surface should reuse that pattern rather than inventing a separate tool surface.

### 2.6 `dev:fast` already exists, but prod-parity exercise paths do not

- [../../tools/dev-fast.mjs#L12](../../tools/dev-fast.mjs#L12) explicitly keeps all HTTP routes, App Insights, and SSE available.
- [../../tools/dev-fast.mjs#L37](../../tools/dev-fast.mjs#L37) sets `HELIX_LAZY_INIT=1`.
- [../../tools/dev-fast.mjs#L40](../../tools/dev-fast.mjs#L40) sets `FORCE_BOOT_WARMUPS=false`.
- [../../tools/dev-fast.mjs#L42](../../tools/dev-fast.mjs#L42) sets `BROWSER=none`.

Conclusion: `dev:fast` is already the correct loop for UI work, but there is no first-class, on-demand prod-parity smoke path that tells the operator what was actually exercised.

### 2.7 Some important runtime dependencies sit outside the visible health model

- [../../public/index.html#L5](../../public/index.html#L5) preconnects to Google Fonts.
- [../../public/index.html#L11](../../public/index.html#L11) pulls SharePoint Fabric CSS from `static2.sharepointonline.com`.
- [../../src/app/styles/index.css#L5](../../src/app/styles/index.css#L5) imports Raleway from Google Fonts.
- [../../src/tabs/home/Home.tsx#L2810](../../src/tabs/home/Home.tsx#L2810) fetches GOV.UK bank holidays.

Conclusion: a route or page can fail for browser/runtime dependency reasons even when the Express process is technically healthy. The checks model must distinguish those failures from core backend blockers.

### 2.8 There is an access mismatch to resolve up front

- [../../src/app/admin.ts#L100](../../src/app/admin.ts#L100) and [../../src/app/admin.ts#L105](../../src/app/admin.ts#L105) define Activity visibility for `devGroupOrHigher`.
- [../../server/routes/ops-pulse.js#L54](../../server/routes/ops-pulse.js#L54) still hard-codes the server-side gate to `['LZ', 'AC']`.

Conclusion: any new checks API must choose a canonical server-side dev-group guard. If this mismatch is left in place, the UI can expose a checks surface to users who still get blocked by the backend.

---

## 3. Plan

### Phase A - curated checks lens inside Activity

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add a manifest-driven check catalog | `server/utils/opsCheckCatalog.js` (NEW) | Create a curated list of safe route/workflow checks. Each entry should declare `id`, `label`, `group`, `risk`, `method`, `target`, `dependencies`, `whatWillHappen`, `successCriteria`, `timeoutMs`, and `run(context)`. Start with read-only/idempotent checks only. |
| A2 | Add server routes to list and run checks | `server/routes/ops-checks.js` (NEW), [../../server/index.js](../../server/index.js) | Add `GET /api/ops-checks/catalog` and `POST /api/ops-checks/run/:id`. The runner should return status, duration, dependency results, redacted evidence, and operator-readable failure reasons. Track `OpsChecks.Run.Started`, `OpsChecks.Run.Completed`, and `OpsChecks.Run.Failed` in App Insights. |
| A3 | Add an Activity checks lens | [../../src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx), [../../src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx), `src/tabs/roadmap/parts/RouteChecksPanel.tsx` (NEW), [../../src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) | Extend `ActivityLens` with `checks`, add a lens chip, and render a new panel that shows each check's declared dependencies, "what will happen" breakdown, last result, and a `Run live check` action. |

**Phase A acceptance:**
- A dev-group user can open Activity and see a `Checks` lens.
- Each check card explains what will happen before anything is run.
- Clicking `Run live check` returns a pass/warn/fail result with status code, duration, and dependency-specific failure detail.
- No destructive route is available in Phase A.
- App Insights records `OpsChecks.Run.*` events for every invocation.

#### Phase A catalog defaults

Seed the first catalog with low-risk checks only:

- `ops-pulse-snapshot` -> `GET /api/ops-pulse/snapshot`
- `release-notes` -> `GET /api/release-notes`
- `cache-preheater-diagnostics` -> `GET /api/cache-preheater/diagnostics`
- `dev-health` -> `GET /api/dev/health`
- `home-bank-holidays` -> server-side fetch/probe of the GOV.UK dependency used by Home
- `brand-assets` -> probe the Google Fonts and SharePoint Fabric asset dependencies as explicit browser/runtime checks

Do not add arbitrary free-text URL execution. This should stay curated and manifest-driven.

### Phase B - scenario packs and dependency semantics

#### B1. Add workflow scenario packs

Extend `server/utils/opsCheckCatalog.js` so checks can declare an optional input schema and run mode:

```ts
type OpsCheckRunMode = 'safe' | 'requires-confirmation' | 'dry-run-only';

type OpsCheck = {
  id: string;
  label: string;
  group: 'route' | 'workflow' | 'dependency';
  risk: 'safe' | 'observe' | 'mutation';
  runMode: OpsCheckRunMode;
  dependencies: string[];
  whatWillHappen: string[];
  inputSchema?: Array<{
    key: string;
    label: string;
    required: boolean;
    kind: 'text' | 'instruction-ref' | 'passcode' | 'initials';
  }>;
  run: (context: OpsCheckContext) => Promise<OpsCheckResult>;
};
```

This is where route checks can expand into real workflow probes that need operator input, but only when the side effects are explicit and guarded.

#### B2. Add dependency severity semantics

Normalise dependency results as `blocking`, `degraded`, or `noise`.

- `blocking`: route/workflow cannot be trusted (for example SQL, Redis for the target flow, Key Vault, Clio auth).
- `degraded`: route works but with reduced confidence or missing telemetry.
- `noise`: external assets or optional data sources that should be visible without being confused for a core outage.

This prevents browser asset timeouts from reading as the same class of failure as an Instructions SQL outage.

#### B3. Feed latest summaries back into Activity pulse

Once individual runs work, add a lightweight latest-summary payload so Activity can surface a red/amber count without forcing the user to open the panel first. This likely touches [../../server/routes/ops-pulse.js](../../server/routes/ops-pulse.js), [../../src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts), and the ops-pulse type definitions.

**Phase B acceptance:**
- Scenario checks can collect explicit operator input when needed.
- Every dependency result is tagged `blocking`, `degraded`, or `noise`.
- Activity can show the latest failing-check count without re-running checks.

### Phase C - persisted run history and release-readiness reuse

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Persist run history | `server/routes/ops-checks.js`, optional `ops_check_runs` table | Keep the last N runs with status, duration, operator, and dependency outcomes so the panel is useful across restarts and handoffs. |
| C2 | Add release-readiness packs | `server/utils/opsCheckCatalog.js`, Activity UI | Support named packs such as `home-core`, `ccl-review`, or `matter-opening-prereqs` so the same catalog can answer "are we release-ready?" without separate scripts. |

**Phase C acceptance:**
- Recent runs survive a server restart.
- A named pack can run multiple checks and report one combined result.
- Release-readiness uses the same control surface as day-to-day debugging.

---

## 4. Step-by-step execution order

1. **A1** - create `server/utils/opsCheckCatalog.js` with the initial safe checks and the shared result shape.
2. **A2** - add `server/routes/ops-checks.js`, mount it in [../../server/index.js](../../server/index.js), and instrument `OpsChecks.Run.*` telemetry.
3. **A3** - add the `checks` lens and build `RouteChecksPanel.tsx` in Activity.
4. **Phase A validation** - run each seeded safe check locally from the panel and confirm the response is dependency-specific.
5. **B1** - add input-aware scenario packs only after the safe route checks are stable.
6. **B2** - normalise dependency severities and separate blocking issues from noise.
7. **B3** - expose latest failing-check summaries into the existing Activity live monitor.
8. **C1/C2** - add persistence and pack-level release-readiness only if the lightweight Phase A/B loop proves useful.

Each phase should ship independently with its own changelog entry.

---

## 5. Verification checklist

**Phase A:**
- [ ] `GET /api/ops-checks/catalog` returns only curated checks with `whatWillHappen`, dependency list, and risk metadata.
- [ ] `POST /api/ops-checks/run/:id` returns pass/warn/fail, duration, status code, and dependency breakdown for each seeded check.
- [ ] Activity shows a `Checks` lens only to the intended audience.
- [ ] A failed check clearly names the failing dependency instead of returning a generic 500/timeout message.
- [ ] App Insights events `OpsChecks.Run.Started`, `OpsChecks.Run.Completed`, and `OpsChecks.Run.Failed` are visible.
- [ ] No mutation-capable workflow is runnable in Phase A.

**Phase B:**
- [ ] Scenario checks can request operator input without exposing raw PII in the UI or telemetry.
- [ ] Dependency severities render distinctly as `blocking`, `degraded`, and `noise`.
- [ ] Activity can show the latest failing-check count or summary without forcing a manual refresh loop.

**Phase C:**
- [ ] Recent runs survive restarts or handoff.
- [ ] A named pack can run multiple checks and return one combined readiness answer.
- [ ] Release-readiness consumes the same catalog as ad-hoc debugging.

---

## 6. Open decisions (defaults proposed)

1. **Catalog location** - Default: **server-side manifest file**. Rationale: one curated source of truth, no client/server drift.
2. **Audience gate** - Default: **dev-group-or-higher in both UI and API**. Rationale: matches the stated user request and the Activity tab contract.
3. **Phase A check set** - Default: **safe GET/idempotent checks only**. Rationale: ship the control plane first without accidental side effects.
4. **Dependency model** - Default: **every check declares its dependencies explicitly**. Rationale: hidden dependencies are the current problem.
5. **Progress transport** - Default: **synchronous JSON response first, SSE later only for multi-step checks**. Rationale: smallest shippable slice.
6. **Run history** - Default: **do not persist in Phase A**. Rationale: lightweight first, persistence only after the core UX proves valuable.
7. **External asset checks** - Default: **include them, but classify as `noise` or `degraded` unless they block a named user flow**. Rationale: visible without drowning out core backend blockers.

---

## 7. Out of scope

- Building a generic arbitrary-URL runner.
- Replacing App Insights, ops-pulse, or `/api/dev/health`.
- Fixing the underlying SQL, Key Vault, Clio, or browser dependency failures in this brief.
- Expanding Activity access beyond the existing dev-group-or-higher audience.
- Standing up a heavyweight E2E suite or browser automation framework.

---

## 8. File index (single source of truth)

Client:
- [../../src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) - Activity shell and current live-monitor wiring.
- [../../src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) - lens union and chip definitions.
- [../../src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) - lens-to-panel routing.
- `src/tabs/roadmap/parts/RouteChecksPanel.tsx` (NEW) - control-plane panel for curated checks.
- [../../src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts) - existing passive pulse hook; optional latest-summary integration point.

Server:
- [../../server/index.js](../../server/index.js) - route mount point for the new checks API.
- [../../server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) - existing passive snapshot/stream surface.
- [../../server/routes/devHealth.js](../../server/routes/devHealth.js) - current shallow dev-only boot signal.
- [../../server/routes/cache-preheater.js](../../server/routes/cache-preheater.js) - precedent diagnostics routes.
- `server/routes/ops-checks.js` (NEW) - curated checks catalog + run endpoints.
- `server/utils/opsCheckCatalog.js` (NEW) - manifest of route/workflow checks.

Reference surfaces:
- [../../src/tabs/Reporting/CacheMonitor.tsx](../../src/tabs/Reporting/CacheMonitor.tsx) - example operator panel pattern.
- [../../tools/dev-fast.mjs](../../tools/dev-fast.mjs) - fast local loop context.
- [../../public/index.html](../../public/index.html) - external asset dependencies to surface.
- [../../src/app/styles/index.css](../../src/app/styles/index.css) - external font import.
- [../../src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) - explicit GOV.UK dependency.
- [../../logs/changelog.md](../../logs/changelog.md) - add one entry per shipped phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: activity-route-live-checks-and-prod-parity-surface
verified: 2026-04-25
branch: main
touches:
  client:
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/ActivityHero.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/hooks/useOpsPulse.ts
    - src/tabs/Reporting/CacheMonitor.tsx
  server:
    - server/index.js
    - server/routes/ops-pulse.js
    - server/routes/devHealth.js
    - server/routes/cache-preheater.js
    - server/routes/ops-checks.js
    - server/utils/opsCheckCatalog.js
  submodules: []
depends_on: []
coordinates_with:
  - resources-tab-restructure-with-templates-section
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - clio-webhook-reconciliation-and-selective-rollout
  - realtime-multi-replica-safety
conflicts_with: []
```

---

## 9. Gotchas appendix

- The Activity client gate and the existing `ops-pulse` server gate are not the same rule. Align the new checks API with a canonical server-side dev-group guard before wiring the UI, or the feature will look available and then 403.
- `useOpsPulse` already owns reconnect/HMR cleanup. Do not bolt active check execution onto that EventSource unless Phase B genuinely needs streaming progress; Phase A should stay request/response.
- `dev:fast` already keeps the HTTP surface available, so the new checks panel should work there. Do not make this feature depend on `dev:all` for basic operation.
- External browser dependencies should be surfaced as a separate class of failure. If Google Fonts or SharePoint CSS time out, that should not read like an Instructions SQL outage.
