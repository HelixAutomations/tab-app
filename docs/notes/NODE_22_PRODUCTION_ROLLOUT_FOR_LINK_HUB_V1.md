# Node 22 production rollout for link-hub-v1

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-26 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user asked to use Azure CLI to confirm whether the App Service was affected by the Node.js support notice, and whether the runtime upgrade could be handled directly. After staging was upgraded successfully, the user stopped the production step with: "stash that task im not sure thats for now befoer i deloy there im afraid old code might break".

This brief is only for the deferred production runtime rollout on `link-hub-v1`. It is not a request to widen the audit to every Azure app in the tenant, and it is not a request to fix unrelated application bugs unless they directly block the production Node 22 cutover.

The current repo/runtime prep is already partly done in this session: root/server runtime declarations were updated to `20 || 22`, CI now uses Node 22, and the `staging` slot was moved to Node 22 and smoke-tested successfully. What remains is the production cutover and short post-change observation.

---

## 2. Current state — verified findings

### 2.1 Repo runtime declarations already moved forward

- Root package now declares Node `20 || 22`: [package.json](../../package.json#L3-L5).
- Deployed server package now declares Node `20 || 22`: [server/package.json](../../server/package.json#L4-L6).
- CI now runs on Node 22 in the PR gate: [.github/workflows/ci.yml](../../.github/workflows/ci.yml#L17-L21).

### 2.2 Deploy and smoke-test surfaces

- The staging deploy script already guards against silent build failures by checking both `build/index.html` and `build/static/` after `npm run build`: [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1#L17-L35).
- Staging code deploys go straight to the existing staging slot with `az webapp deploy --slot staging`: [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1#L91).
- Production deploys still go directly to the production app, with no slot swap in the script: [build-and-deploy.ps1](../../build-and-deploy.ps1#L83).
- `GET /api/team-data` is intentionally bootstrap-safe for anonymous callers and is suitable as a production smoke endpoint: [server/routes/teamData.js](../../server/routes/teamData.js#L8-L9).
- `/api/dev/health` is explicitly dev-only and should not be used as the production health probe: [server/routes/devHealth.js](../../server/routes/devHealth.js#L2-L12), [server/routes/devHealth.js](../../server/routes/devHealth.js#L26).

### 2.3 Live Azure verification from this session

- Azure CLI context used: subscription `Helix Automations` (`57414284-bf79-487f-9317-7a4f9e37dfdf`), resource group `main`, App Service `link-hub-v1`, Windows code app on P1v3.
- Initial read-only inspection showed both production and staging were on Node 18 (`nodeVersion: ~18`, `windowsFxVersion: NODE|18-lts`).
- Staging was then switched to Node 22 with an Azure CLI `--generic-configurations` JSON payload, restarted, and read back successfully as `nodeVersion: ~22`, `windowsFxVersion: NODE|22-lts`.
- Post-change staging smoke succeeded against the real slot hostname: root returned `200` with `ROOT_LEN:5483`, and `/api/team-data` returned `200` with `TEAM_LEN:3939`.
- The later production runtime command was cancelled by the user before it completed. Treat production as unchanged until it is re-read live immediately before cutover.

---

## 3. Plan

### Phase A — Re-validate and cut over production runtime

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Re-read live production runtime | Azure CLI | Confirm production still reports `~18` / `NODE|18-lts` before touching it. |
| A2 | Run pre-cutover smoke | [server/routes/teamData.js](../../server/routes/teamData.js#L8-L9) | Hit prod root and `/api/team-data` so there is a baseline before restart. |
| A3 | Switch production to Node 22 | Azure CLI | Use the same JSON-payload `az webapp config set --generic-configurations` path that worked for staging, then restart the app. |
| A4 | Run post-cutover smoke | Azure CLI + HTTP | Confirm runtime readback is `~22` / `NODE|22-lts`, then re-hit prod root and `/api/team-data`. |

**Phase A acceptance:** production reports Node 22 in Azure config, prod root returns `200`, prod `/api/team-data` returns `200`, and there is no immediate boot failure spike after restart.

### Phase B — Observe, close out, and only then archive the stash

#### B1. Observation window

Watch App Service / Application Insights long enough to catch a bad cold start, missing dependency, or boot-loop that a single smoke request would miss.

#### B2. Close the loop

If production stays healthy, add a `logs/changelog.md` entry for the production cutover, then run `node tools/stash-close.mjs node-22-production-rollout-for-link-hub-v1` and `node tools/stash-status.mjs`.

---

## 4. Step-by-step execution order

1. **A1** — Set Azure CLI subscription to `57414284-bf79-487f-9317-7a4f9e37dfdf` and run `az webapp config show -g main -n link-hub-v1 --query "{nodeVersion:nodeVersion,windowsFxVersion:windowsFxVersion,appCommandLine:appCommandLine}" -o json`.
2. **A2** — Hit `https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net` and `https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net/api/team-data`; record HTTP status and payload length.
3. **A3** — Create a temp JSON file containing `{"windowsFxVersion":"NODE|22-lts","nodeVersion":"~22"}` and run `az webapp config set -g main -n link-hub-v1 --generic-configurations "@<tempfile>"`, then `az webapp restart -g main -n link-hub-v1`.
4. **A4** — Re-run the production config show query and the two HTTP smoke checks.
5. **B1** — Watch the App Service and App Insights for a short soak window after the restart.
6. **B2** — If healthy, add the changelog entry, close the stash, and rebuild `docs/notes/INDEX.md`.

---

## 5. Verification checklist

**Phase A:**
- [ ] `az webapp config show -g main -n link-hub-v1` returns `nodeVersion: ~22` and `windowsFxVersion: NODE|22-lts`.
- [ ] `Invoke-WebRequest https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net` returns `200`.
- [ ] `Invoke-WebRequest https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net/api/team-data` returns `200`.
- [ ] Staging still returns `200` on both root and `/api/team-data` after prod cutover.

**Phase B:**
- [ ] No obvious new startup-loop or 5xx spike appears in the App Service / App Insights observation window.
- [ ] `node tools/stash-close.mjs node-22-production-rollout-for-link-hub-v1` completes.
- [ ] `node tools/stash-status.mjs` rebuilds the index cleanly.
- [ ] `logs/changelog.md` records the production runtime cutover.

---

## 6. Open decisions (defaults proposed)

1. **When to cut production** — Default: **do it in the same session as the intended next prod deploy, after a quick re-smoke of staging**. Rationale: the user's concern is that older prod code may behave differently; keeping runtime cutover adjacent to the deploy validation window reduces that risk.
2. **Whether to widen this to the separate `api/` TeamsFx Functions package** — Default: **no**. Rationale: that slice was not validated under Node 22 in this session and is not required to finish the `link-hub-v1` App Service cutover.

---

## 7. Out of scope

- Fixing unrelated frontend build issues that surfaced during Node 22 validation, including the `TeamInsight.tsx` JSX parse error and existing ESLint import-order warnings.
- Reworking deployment architecture (slot swap, run-from-package, or broader Azure hosting changes).

---

## 8. File index (single source of truth)

Client:
- [package.json](../../package.json) — root runtime declaration already updated to `20 || 22`
- [package-lock.json](../../package-lock.json) — root lockfile metadata aligned with the runtime declaration
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — CI runtime now pinned to Node 22

Server:
- [server/package.json](../../server/package.json) — deployed server package runtime declaration already updated to `20 || 22`
- [server/package-lock.json](../../server/package-lock.json) — server lockfile metadata aligned with the runtime declaration
- [server/routes/teamData.js](../../server/routes/teamData.js) — production-safe smoke endpoint
- [server/routes/devHealth.js](../../server/routes/devHealth.js) — dev-only route that should not be used for prod verification

Scripts / docs:
- [build-and-deploy.ps1](../../build-and-deploy.ps1) — direct production deploy script, no slot swap
- [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1) — staging deploy script and build artefact verification guardrails
- [docs/notes/NODE_22_PRODUCTION_ROLLOUT_FOR_LINK_HUB_V1.md](../../docs/notes/NODE_22_PRODUCTION_ROLLOUT_FOR_LINK_HUB_V1.md) — this brief
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: node-22-production-rollout-for-link-hub-v1                          # used in INDEX cross-refs
verified: 2026-04-26
branch: main
touches:
  client:
    - build-and-deploy.ps1
    - build-and-deploy-staging.ps1
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with: []              # ids that touch the same files but don't block
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

- For this Windows code app, the successful Azure CLI path was `az webapp config set --generic-configurations "@<json>"` with a temp JSON file containing `{"windowsFxVersion":"NODE|22-lts","nodeVersion":"~22"}`. The earlier attempts using `--windows-fx-version` were wrong for this hosting model and also ran into PowerShell pipe parsing.
- `craco build` under Node 22 can print severe-looking diagnostics while still returning exit code `0`. In this session, a CI-style build emitted existing ESLint ordering warnings and a `TeamInsight.tsx` JSX parse error but still exited `0`. Trust the artefact checks in [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1#L17-L35), not the process exit code alone.
- The production runtime change itself did not happen in this session. The user cancelled that command, so do not assume any prod drift beyond the earlier read-only observation that it was still on Node 18.
