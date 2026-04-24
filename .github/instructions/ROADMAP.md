# Roadmap

Tracked priorities for future sessions. Any agent can pick these up.

Use this file to park improvements discovered while delivering a request, when they are not directly adjacent to the work at hand. For code style/pattern guidance, see `WORKSPACE_OPTIMIZATION.md` (same folder) — that file covers preferred patterns; this file tracks actionable work items only.

---

## March 2026 Rework Baseline

This section captures the current cross-app review baseline for the performance and usability rework. Treat it as the implementation anchor. Do not re-litigate these assumptions unless code or Azure state changes.

### Product Objective

- Make the app fast enough that users move through work without waiting for the system to catch up.
- Reduce workflow complexity in the UI. Luke's visual model can stay rich, but user-facing paths must bias toward "get the thing done".
- Favour architectural fixes over localised loading tweaks when the lag is caused by duplicated contracts or over-fetching.

### Three-App Contract

| Surface | Role | Rule |
|--------|------|------|
| `enquiry-processing-v2` | Primary enquiry capture, routing, Teams-card workflow, response handling | Source of truth for new enquiry-writing semantics |
| `tab-app` | Internal command centre and operational workspace | Must read/write against the new enquiry flow instead of preserving legacy-first behaviour |
| `instruct-pitch` | Client onboarding, checkout, instruction continuation, portal | Must stay aligned with the same prospect/instruction lifecycle, not drift into a separate model |

### Source-of-Truth Rules

- `enquiry-processing-v2` is now the primary enquiry-writing system.
- Legacy enquiries data still matters, but as a compatibility bridge, not as the default semantic model.
- `ID` vs `acid` differences are bridge mechanics. They are not a reason to keep legacy-centric read paths in `tab-app`.
- When Home, Prospects, or any Hub workflow disagree, prefer new-space semantics first and then preserve legacy behaviour explicitly.

### What The Review Established

#### 1. Home and Prospects are still running different contracts

- Prospects uses the heavier unified path (`/api/enquiries-unified`) with team inbox, collaborator, and merge semantics.
- Home still uses narrower `/api/home-enquiries` and `/api/home-enquiries/details` contracts.
- This is why users can see "real" live work in Prospects while Home panels appear sparse or stale.

#### 2. Performance work has been too route-local

- Several recent gains improved first paint and reduced wasted calls, but the larger bottleneck remains contract duplication.
- Making split read paths faster is not enough if Home, Prospects, and downstream actions still disagree on what state a record is in.

#### 3. Team Hub identity is operationally misnamed and partly reserved

- `Team Hub` app registration (`bee758ec-919c-45b2-9cdf-540c6419561f`) is the main Teams app identity in `appPackage/manifest.json`.
- The same identity is also treated as attached to Tasking-v3 bot usage, which makes it effectively "taken" and unsuitable as a free app ID for new bot work until that is cleaned up.
- `Team-Hub-Notification-Handler` (`3d935d23-349e-4502-a9c0-6f5ca48d5d33`) is already the notification-side app used by Team Hub server code.
- Team Hub now carries minimal bot groundwork for `Team-Hub-Notification-Handler`: `POST /api/messages` exists in both server entrypoints and `appPackage/manifest.json` declares the bot for personal scope. Full outbound DM orchestration and persisted card-state tracking are still pending.
- Activity is now the Luke-first operations lane for card traffic: the tab stays private to dev owner/local for now, `/api/activity-feed` merges `teams.bot` op-log events with recent `TeamsBotActivityTracking` rows, and the release-notes feed remains in the same surface.
- `Aiden` (`bb3357f0-dca3-4fef-9c4d-e58f69dde46c`) remains the enquiry-processing bot identity and live Azure Bot resource.

#### 4. Submodule work must leave this repo as briefs, not commits

- Do not edit or push `submodules/enquiry-processing-v2` or `submodules/instruct-pitch` from this workspace.
- When another repo needs action, create a very brief implementation brief for the owning repo/agent.

### Implementation Streams

#### Stream A — Tab-app speed and usability rework

Owner: this repo

Status: **Stream A complete as of 17 March 2026.** All 7 workstream items delivered. Remaining optimisation (Prospects decomposition, dead code) tracked separately below.

**Core architecture (completed 16 Mar):**
- Home + Prospects both project from shared unified enquiries model — no more separate Home-only read path.
- SSE consolidated: app shell is sole owner of `/api/enquiries-unified/stream`. Enquiries subscribes via callback. Halves SSE connections.
- Shell boot snapshot (sessionStorage, 15-min TTL) for stale-first paint. Live fetches overwrite in background.
- Home parallel fetch deduped. Team-data fetch hoisted to fire alongside user-data (no serial dependency).

**Speed and UX pass (completed 16–17 Mar):**
- **Tab keep-alive**: Home always-mounted, Enquiries stays mounted once visited. Instant CSS display toggle with scroll position save/restore.
- **Aggressive caching**: Shell snapshot 15min, Home metrics snapshot 5min, in-memory 10min. Cache preheater at 20s. Idle chunk preloading.
- **Prospects loading surface**: Skeleton queue → batched row reveal → live queue. Filter compound redesigned.
- **Progressive immediate actions**: Chips render immediately; skeletons only when genuinely empty.
- **Steady loading geometry**: All skeletons reserve final footprint. No layout shift. Navigator opacity-fades instead of null-rendering.
- **Snapshot-to-live hardening**: 8min expiry, never blank on failure, explicit snapshot-vs-live tracking. Tab-return auto-refresh with cooldown.
- **Home comparison rail**: Experimental conversion-vs-pipeline rail (dev-gated) with today/yesterday, week/month, AOW filters, combo charts.
- **Home unclaimed panel**: Single-action "take one now" model with immediate claim feedback, period tabs, AOW filters, stale-age cues.

**Infrastructure hardening (completed 17 Mar):**
- **Dev console** (`server/utils/devConsole.js`): Structured local dev output with startup banner, connection status, colour-coded request logging, cache-source badges (MEM/RDS/SQL/CLO/OLD). 10 hot routes annotated.
- **Activity Monitor production fix**: logs-stream + release-notes routes registered in production server. SSE hardened for Azure (req.setTimeout(0), 15s heartbeat, immediate flush). Client retry resets on confirmed data only.
- **SQL startup race fix**: `app.listen()` gated behind Key Vault hydration promise.
- **Annual leave routing fix**: Server computes approvers from team AOW data.
- **Hybrid theme states fix**: Declarative hover/press styling in CustomTabs and command-centre sections.

**Control plane restructure (completed 17 Mar):**
- **UserBubble refactor**: 2065-line monolith → lean orchestrator (~480 lines) + 5 sub-components + shared tokens. CSS 238→88 lines.
- **Hub Tools chip** (`src/components/HubToolsChip.tsx`): Private floating bottom-right ops surface for Luke/Alex/local dev. Separate `canSeePrivateHubControls` gating (not broad `isAdminUser`). Hosts AdminControls, LocalDev, refresh/admin actions, local-only modals.
- **Reporting utility routing**: Hub Tools → Activity Monitor and Data Centre via typed `ReportingNavigationRequest` handoff.

**Operations dashboard micro-clarity follow-ups (parked 26 Mar):**
- Add a compact in-panel jump rail for Pipeline, Bank, Transactions, Debts, Recent, and CCL so the queue reads as a purpose-built operational console rather than one long stack.
- Add a shared action summary strip above the sections so users can read “needs action now” before scanning cards.
- Tighten completion separation: completed/recent items should visually step back harder than action-required items.
- Normalise status grammar across payments, transactions, debts, and CCL so action ownership is readable from the same vocabulary.
- Calls/Time Entries follow-up: keep the Home split at 50/50 and add left-side telephone attendance controls once the current Power Automate flow is handed over, including matter confirmation from the enquiry link and optional Clio unit capture for matter-linked calls.

**Bundle cleanup follow-ups (parked 2 Apr):**
- `InlineWorkbench` now lazy-loads `PitchComposer`; keep other optional tabs honest and avoid reintroducing eager imports for pitch-only flows.
- `react-quill` has been removed from the root package because there is no live editor path using it. Keep it out unless a real editor path returns.
- Treat `docx` / `docx-templates` as server-install footprint work, not browser bundle work. Current CCL and attendance doc generation paths are server-side.
- Defer `axios` 1.x until root server routes and `api/` Azure Functions are audited together; current call sites assume existing error shapes and header defaults.
- Fluent UI v8 migration needs a staged inventory-first pass. Start with high-fanout primitives (`Button`, `Text`, `Stack`, `Icon`, `Modal`, `Styling`) before touching feature-specific components.

1. ~~Unify Home and Prospects around one operational enquiry contract.~~ ✅
2. ~~Collapse duplicate boot and dashboard fetch logic.~~ ✅
3. ~~Introduce snapshot-first paint with background reconciliation.~~ ✅
4. ~~Move heavy enrichment behind staged hydration.~~ ✅
5. ~~Replace "system is busy" UX with progressive, task-oriented surfaces.~~ ✅
6. ~~Harden production infrastructure (routes, SSE, SQL race, dev console).~~ ✅
7. ~~Restructure control plane (UserBubble split, Hub Tools chip, Reporting routing).~~ ✅

#### Stream B — Enquiry-processing alignment brief

Owner: `HelixAutomations/enquiry-processing-v2`

1. Keep bot, Teams-card, and claim flows aligned with the primary enquiries schema.
2. Remove query drift where new-space flows still use legacy column assumptions.
3. Expose clearer state signals back to Hub where claim/channel/card state changes.
4. **Dubber sync freshness**: `DubberSyncService.cs` calls `GET /accounts/helixlaw/recordings` with no `since`/pagination params, which may cause today's most recent calls to appear late. Investigate adding a `since` parameter or reducing the sync interval below 60s to improve call freshness in the Home journey feed.

#### Stream C — Instruct-pitch alignment brief

Owner: `HelixAutomations/instruct-pitch`

1. Keep payment, instruction, and portal flows aligned with shared operational state.
2. Remove contract drift where backend-wide operational modes are not reflected in the client.
3. Preserve a lightweight client experience while staying tied to the same lifecycle model as Hub.

#### Stream D — Realtime architecture, Azure alignment, and resource management

Owner: this repo (tab-app) — cross-app implications managed via Streams B and C briefs.

**Core principle**: Cache is acceleration, not truth. Every operational surface must know whether it is showing a snapshot, reconciling, or live-confirmed. The app must never silently serve stale data as if it were current.

Status: **In progress — started 17 March 2026.** *(R7 of UX Realtime Programme — 2026-04-19 — shipped the SSE plumbing: 9 server stream channels, broadcast on every Hub-side mutation, unified `LivePulse` cue, `useRealtimeChannel` hook with App Insights telemetry. See [docs/notes/UX_REALTIME_NAVIGATION_PROGRAMME.md §1a](../../docs/notes/UX_REALTIME_NAVIGATION_PROGRAMME.md). The freshness-truth model below — D1 — is what closes the loop on top of that plumbing.)*

##### D1. Cache-vs-live truth layer (NOT STARTED)
- [ ] Define a freshness state model: every data-bearing component tracks `snapshot | reconciling | live-confirmed`.
- [ ] Add visible freshness indicators so users and devs can see what they're looking at (subtle badge, not intrusive).
- [x] Replace page-owned SSE scatter with one app-owned live event layer. *(R7 + home-realtime-channel-migration shipped 2026-04-19: 9 channels live, 7 hub-side Home.tsx effects migrated to `useRealtimeChannel` hook, enquiries already shell-relayed. Remaining surface: extend hook adoption to other tabs as they grow live data.)*
- [ ] Every mutation (claim, assign, stage change, instruction completion, payment result, matter open) must emit an event AND clear the exact affected cache slice. *(R7 done for Hub-side mutations on 9 channels. External-edit gap (Clio web UI) parked as [clio-webhook-bridge](../../docs/notes/CLIO_WEBHOOK_BRIDGE.md).)*
- [ ] Redis is useful for warm snapshots — but the app must never treat a Redis hit as truth when a live signal has invalidated it.

##### D2. Cross-app event contract (NOT STARTED)
- [ ] Define the event shape all 3 apps use: `{ eventType, entityId, entityType, source, timestamp, payload }`.
- [ ] `enquiry-processing-v2` emits events on: enquiry create, claim, reassign, card state change, stage transition.
- [ ] `instruct-pitch` emits events on: payment result, instruction completion, CFA status change, portal entry.
- [ ] `tab-app` consumes events and drives: cache invalidation, SSE fan-out to connected clients, optimistic UI updates.
- [ ] Decide mechanism: SQL-backed polling (simplest), Azure Service Bus (decoupled), or Azure Web PubSub (realtime fan-out). Start with SQL polling + SSE fan-out for simplicity; upgrade path to Web PubSub if latency matters.

##### D3. Azure resource alignment (NOT STARTED)
- [ ] Audit current Azure resource state: App Services, Function Apps, Key Vault, SQL, Redis, Storage, Bot Services.
- [ ] Finish retiring local Azure Functions boot dependency: audit remaining `proxyToAzureFunctions` callers (`getUserData`, `getTeamData`, snippet edit flows, roadmap, transactions update paths), move them to Express/local routes, then remove `func start` from default dev boot.
- [ ] Enable `WEBSITE_RUN_FROM_PACKAGE=1` on link-hub-v1 (zip mount, ~2 min deploy vs 30 min).
- [ ] Wire staging slot swap into deployment script (slot already exists).
- [ ] Evaluate Azure Web PubSub or SignalR for cross-app event fan-out.
- [ ] App Service Always On + run-from-package + slot swap for hot serving.
- [ ] Resolve Azure identity conflict: `bee758ec` is shared between Team Hub tab and Tasking-v3 bot (see Azure Identity section below).

##### D4. Hub Tools consolidation (IN PROGRESS)
- [x] Private floating Hub Tools chip created with separate access gating.
- [x] Reporting utility routing (Activity Monitor, Data Centre) wired into chip.
- [x] Cache Monitor view added to Reports tab (`CacheMonitor.tsx`) — shows Redis connection state, per-key status/TTL/age/size, hit rate, expiration distribution. Gated via `canSeePrivateHubControls` in prod, everyone locally. Auto-polls every 8s.
- [ ] Pull remaining Reporting-only ops controls (cache invalidation modals in ReportingHome) into Hub Tools.
- [ ] Extend Cache Monitor or add separate panel for: SQL pool health, Clio auth status, scheduler tier status.
- [ ] Add enquiry freshness state visibility: snapshot age, SSE connection status, last event timestamp.
- [ ] Add cross-app status: instruct-pitch server reachable, enquiry-processing-v2 last heartbeat.

##### D5. Resource creation and management (NOT STARTED)
- [ ] Identify which Azure resources need creating, updating, or reconfiguring as part of this rework.
- [ ] Document resource requirements in a manifest (what exists, what's needed, what needs changing).
- [ ] Plan any new infrastructure (Web PubSub, Service Bus, additional Function Apps) with IaC or CLI scripts.

##### D6. R7 residuals — beyond notification-only SSE (PARKED — both items briefed)
*(Captured 2026-04-19 after R7 wrap. R7 shipped notification-style SSE — "something changed, refresh" — across 9 channels. The items below are the next-tier upgrades that turn that into truth-bearing realtime. Both architectural items now have full self-contained stash briefs ready to pick up cold.)*

- [ ] **Notification → delta-merge.** See [docs/notes/REALTIME_DELTA_MERGE_UPGRADE.md](../../docs/notes/REALTIME_DELTA_MERGE_UPGRADE.md). Phase A targets opsQueue end-to-end as proof; Phase B fans out to 7 remaining channels; Phase C cache coherency. Highest-leverage realtime work left (~300ms→<50ms perceived latency by eliminating the post-broadcast HTTP refetch).
- [ ] **Multi-replica cache + broadcast safety.** See [docs/notes/REALTIME_MULTI_REPLICA_SAFETY.md](../../docs/notes/REALTIME_MULTI_REPLICA_SAFETY.md). **Dormant** — do not start until user confirms App Service will scale to ≥2 instances. Recommends Redis pub/sub over Service Bus / Web PubSub. Coordinates with delta-merge brief (sequence: delta-merge first).
- [x] ~~**Doc-workspace coverage gap.**~~ Audited 2026-04-19: [server/routes/doc-workspace.js](../../server/routes/doc-workspace.js) only exposes `/upload` as a mutation route (others are GET). Single broadcast on `/upload` success is full coverage. No move/delete routes exist server-side.
- [x] ~~**OpsQueue multi-mutation parity.**~~ Audited 2026-04-19: all 3 mutation routes (`/approve` L213, `/ccl-date-confirm` L310, `/transaction-approve` L412) call `invalidateOpsCache()`, which broadcasts. Parity confirmed.
- [x] ~~**`useRealtimePulse` convenience wrapper missing `name` option.**~~ Fixed 2026-04-19 — [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) `useRealtimePulse` now accepts optional `name` and forwards it to `useRealtimeChannel`.

##### D7. Bundle + dead-weight cleanup (DONE — shipped 2026-04-19)
- [x] ~~Audit Home.tsx for orphaned `useState` nonces / handlers once home-realtime-channel-migration ships.~~ Verified clean — no orphans after the migration.
- [x] ~~Sweep `.github/instructions/` for stale references to retired routes/components.~~ Fixed 2 stale line refs in [ARCHITECTURE_DATA_FLOW.md](./ARCHITECTURE_DATA_FLOW.md) attendance section.
- [x] ~~Look for the duplicated Clio token-refresh logic flagged during R7.~~ Audit found 6+ call sites split across two architectures: per-user simple cache (matter-audit + matter-metrics — verbatim duplicates, consolidated into [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js)) vs team-hub-v1 with Redis + abort + Key Vault rotation (reporting + home-wip + matter-operations — materially different, parked for separate audit, not folded in).

#### Stream E — Frameworks, Blueprints, and Telemetry Transparency

Owner: this repo (tab-app)

Status: **In progress — started 2 April 2026.**

##### E1. Communication Frameworks + Pressure Test (IN PROGRESS)
- [x] Cultural pillar added to `copilot-instructions.md` — Communication Frameworks and Architectural Transparency sections.
- [x] Framework prompt templates created (`server/prompts/communication-frameworks.js`) — 6 frameworks: management, tasking, feedback, projects, communication, legal.
- [x] Server route `POST /api/ai/pressure-test-comms` with App Insights telemetry.
- [x] Frontend `CommsFrameworkPanel.tsx` — standalone pressure-test panel, admin-gated.
- [x] PitchBuilder integration — "Pressure Test" button in email composer toolbar.
- [ ] Framework prompt iteration — refine based on real usage feedback.
- [ ] Editable frameworks in-app (Phase 2.5) — move from hardcoded prompts to DB-stored templates.

##### E2. Blueprints Tab (IN PROGRESS)
- [x] Blueprints tab skeleton (`src/tabs/blueprints/Blueprints.tsx`) — admin-gated, lazy-loaded.
- [ ] Infrastructure blueprint — Azure resource map from static manifest, upgrade to live API.
- [ ] Data flow blueprint — visual ARCHITECTURE_DATA_FLOW.md rendering.
- [ ] Permissions & security blueprint — AAD app registrations, network topology.
- [ ] Database schema blueprint — visual DATABASE_SCHEMA_REFERENCE.md rendering.

##### E3. Telemetry Transparency (IN PROGRESS)
- [x] Processing transparency strip skeleton (`src/components/ProcessingTransparency.tsx`).
- [ ] Wire to live SSE or `/api/processing-status` endpoint.
- [ ] Team-facing telemetry dashboard — simplified App Insights view, admin-gated.
- [ ] Responsive design pass at 768px and 480px breakpoints.

### First Delivery Order

1. ~~Fix the Hub architecture first: shared enquiry semantics, faster boot, progressive landing, less contradictory state.~~ ✅ Stream A complete.
2. In parallel, issue repo briefs for `enquiry-processing-v2` and `instruct-pitch` where the review found contract drift. *(Briefs written below — not yet executed by owning repos.)*
3. **Stream D active**: Cache-vs-live truth layer → cross-app event contract → Azure resource alignment. This is the "next level" work that brings it all together.
4. After the event contract is stable, tighten Teams notification/app-registration design so posting approaches can expand cleanly.

### Repo Briefs

#### Brief: enquiry-processing-v2

Objective: align the Teams/bot workflow with the primary enquiries schema and make Hub integration cleaner.

- Verify and fix claim/DM lookup paths that query new enquiries using legacy column names.
- Audit bot/card workflows for any remaining legacy-schema assumptions in new-space paths.
- Keep `Aiden` as the enquiry-processing bot identity unless explicitly changed at the Azure layer.
- Return a concise note on any webhook/event signal Hub can rely on for claim state, card state, and assignment changes.

Implementation brief for owning repo/agent:

- Treat the instructions/new-space enquiry record as the primary processing identity for claim, assignment, and card lifecycle actions. Legacy/Core Data identifiers remain bridge metadata only.
- Audit `CtaController`, claim handlers, and Teams card action handlers for any path that still resolves by legacy-only fields when the new-space enquiry row already exists.
- Standardise the write-back payload for claim events so Hub can trust one shape for: `processingEnquiryId`, `processingSource`, `claimedBy`, `claimedAt`, `stage`, `channelId`, `activityId`, `cardType`.
- Ensure `TeamsBotActivityTracking` is updated consistently for claim/reassign/card-refresh flows, including `ClaimedBy`, `ClaimedAt`, `UpdatedAt`, active card stage, and channel linkage.
- When Hub claims from the Home recent-enquiry row, make sure the refreshed Teams card/deep link is stable immediately after claim, or document the exact tracking fields Hub should poll while the card refresh catches up.
- Confirm whether the repo can emit a lightweight outbound signal for Hub consumption on claim/create/reassign/card-stage changes. If webhook/event work is too heavy, return the exact table/column contract Hub should poll instead.
- Preserve existing user-facing Teams behaviour. This brief is about schema/state alignment, not redesigning card UX.

#### Brief: instruct-pitch

Objective: keep instruction/payment/client continuation flows aligned with operational state from Hub.

- Make backend-wide payment-disabled state part of the real client contract instead of a backend-only flag.
- Audit any portal or checkout flows that can diverge from shared instruction/prospect lifecycle state.
- Preserve lightweight UX; avoid adding heavy blocking initialisation to the client.

Implementation brief for owning repo/agent:

- Make the portal/client app consume the same lifecycle truth that Hub now expects: prospect/enquiry → pitch/deal → instructed/compliance → matter/portal.
- Promote payment availability/disablement into the explicit client contract returned to the frontend so the UI does not infer operational state from missing behaviour.
- Audit continuation/resume flows, success pages, and portal entry points for places where portal state can drift from `Instructions`, `Deals`, or `Matters` status held by Hub.
- Ensure client-visible labels and states match Hub semantics for payment, ID, risk, instruction completion, and matter-opened progression.
- Keep client boot lightweight: prefer a thin lifecycle payload over multiple blocking requests or duplicated state reconstruction in the browser.
- Return a concise note describing any remaining places where instruct-pitch must intentionally diverge from Hub semantics, and why.

## Vision: Helix CRM

This platform is evolving into **Helix CRM** — the single source of truth for every dataset, workflow, and validation at Helix Law. Not a tab app. Not a reporting dashboard. A platform that owns its data, explains itself, and increasingly runs without babysitting.

**Core principles:**
- **Transparency** — every sync, validation, and mutation is logged with who invoked it, when, and what the result was
- **Autonomy** — the system validates its own data after every sync, surfaces drift, and alerts when something is off
- **Audit trail** — full attribution: `triggeredBy` (scheduler/manual), `invokedBy` (user name or system), `validated` status with count/sum confirmation
- **Compounding intelligence** — each iteration makes the platform more self-aware and self-correcting

---

## High Priority

- [x] **Staged app boot + deep-link routing plan** — ✅ Completed 16–17 Mar 2026. Shell boot snapshot (15min TTL, stale-first paint), tab keep-alive (Home always-mounted, Enquiries stays mounted), SSE consolidation to single app-shell owner, progressive immediate actions, steady loading geometry, snapshot-to-live hardening, `navigateToEnquiry` CustomEvent replacing localStorage. Remaining future item: full route-state layer for tab + entity + subview (e.g. prospects workbench + pipeline pill).
- [ ] **Prospects component optimisation** — `src/tabs/enquiries/Enquiries.tsx` is 11,349 lines with 222+ hooks. Decompose in safe, incremental stages. See dedicated section below: **[Prospects Optimisation Plan](#prospects-optimisation-plan)**.
- [ ] **Data Centre → Helix CRM Control Plane** — The Data Centre is the operational backbone. Current state: 3-layer OperationValidator, audit trail with user attribution, post-sync auto-validation. **Next steps**:
  - [ ] Drift alerts — compare today's sums against yesterday's and flag anomalies
  - [ ] Scheduled integrity sweeps — monthly full-range validation with report
  - [ ] Per-user drill-down in explain panel
  - [x] WIP validator card (matching collected time pattern) — Feb 2026: full 3-layer OperationValidator with type/kind breakdown, hours, dedup, spot checks, data source labels
  - [ ] Cross-dataset reconciliation (collectedTime vs WIP vs matters)
- [ ] **Refresh Clio PBI token** — Re-authenticate Power BI Clio integration and update `clio-pbi-refreshtoken` secret in Azure Key Vault (helix-keys). Currently using user fallback (lz/jw/ac credentials). See `docs/INTEGRATIONS_REFERENCE.md` for instructions.
- [ ] **CFA-specific email templates** — CFA completion currently reuses ID-only email templates (`sendClientIdOnlySuccessEmail` / `sendFeeEarnerIdOnlyEmail`). Add dedicated CFA templates with appropriate "no win no fee" wording, fee arrangement details, and CFA-specific client care letter references. Also: CFA success page messaging in instruct-pitch (currently shows generic "Identity Verified" — should say "Instructed (CFA)" or similar).
- [ ] **Containerise deployment** — Current `build-and-deploy.ps1` is slow and error-prone. Move to Docker containers for consistent, fast deploys. Investigate Azure Container Apps or AKS.
- [ ] **Enquiry-processing claim → Hub realtime** — In `HelixAutomations/enquiry-processing-v2`, ensure the claim flow that updates SQL + Teams card also persists `TeamsBotActivityTracking.ClaimedBy/ClaimedAt/UpdatedAt` consistently (and/or emits a webhook/event). Hub now watches this table to drive realtime claim state.
- [ ] **Deploy speed: run-from-package + staging swap** — Enable `WEBSITE_RUN_FROM_PACKAGE=1` on link-hub-v1 (Azure mounts zip, no 30k file extraction → ~2 min vs 30 min). Add `az webapp deployment slot swap` to `build-and-deploy-staging.ps1`. Staging slot already exists and is running. See Feb 2026 session notes below.

---

## Azure Identity & Teams Notifications — Strategy (Feb 2026)

### Current State (audited Feb 2026)

**AAD App Registrations:**

| Display Name | App ID | Purpose | Notes |
|-------------|--------|---------|-------|
| **Team Hub** (renamed from "Aiden") | `bee758ec-919c-45b2-9cdf-540c6419561f` | Team Hub SSO + tab auth | Used in `appPackage/manifest.json` → `webApplicationInfo`. Has ~50 Graph permissions already approved. Also registered as bot for Tasking-v3 (blocker — see below). |
| **Aiden** | `bb3357f0-dca3-4fef-9c4d-e58f69dde46c` | Enquiry-processing bot | Used by Bot Service "Aiden" in Main RG. Endpoint: `helixlaw-enquiry-processing.azurewebsites.net/api/messages`. |
| **linkhub003-aad** | `84e5e9b1-78a1-4461-9634-504671bfaf15` | Teams Toolkit local dev scaffolding | Redirect URI: `localhost:53000`. Identifier: `api://localhost:53000/...`. Probably unused in production. Candidate for cleanup. |

**Bot Service Resources:**

| Name | Resource Group | App ID | Endpoint |
|------|---------------|--------|----------|
| **Aiden** | Main | `bb3357f0` | `helixlaw-enquiry-processing.azurewebsites.net/api/messages` |
| **Tasking-v3** | Tasking | `bee758ec` ⚠️ | `tasking-v3.azurewebsites.net/api/messages` |

**Key problem**: `bee758ec` (Team Hub's app) is also registered as the Tasking-v3 bot. An app ID can only belong to one Bot Service. This blocks creating a TeamHub-Bot using the same app ID.

### Plan: Azure Identity Cleanup

**Phase 1 — Unblock Team Hub bot (requires Tasking migration)**
1. Create a **new AAD app reg** for Tasking (e.g. "Tasking Bot", new app ID)
2. Create a **new Bot Service** for Tasking using the new app ID
3. Update Tasking-v3's code/config to use the new app ID + password
4. **Delete** the old Tasking-v3 Bot Service (frees `bee758ec`)
5. Create **TeamHub-Bot** Bot Service using `bee758ec` with endpoint `link-hub-v1.../api/messages`

**Phase 2 — Team Hub notifications**
1. Add `bots` array to `appPackage/manifest.json` referencing `bee758ec`
2. Add `activities.activityTypes` to manifest (e.g. `newActionItem`, `enquiryAssigned`, `matterUpdate`)
3. Add minimal `/api/messages` endpoint to Express server (acknowledge bot install/uninstall)
4. Add `/api/send-notification` route that calls Graph API `sendActivityNotification`
5. Add `TeamsActivity.Send` application permission to `bee758ec` (may need admin consent — but app already has 50+ permissions approved, so likely smooth)
6. Redeploy Teams app package to org

**Phase 3 — Unified notification system (future)**
- Enquiry-processing (Aiden) continues owning channel Adaptive Cards for enquiry distribution
- Team Hub owns personal activity feed notifications: action items, matter updates, pipeline progress
- Asana connector integration for task-level notifications
- Dedicated Tasking platform app with its own bot identity, separated cleanly from both Team Hub and enquiry-processing
- Consider: should Aiden and Team Hub merge into a single Teams app with both tab + bot? Or stay separate? Decision depends on whether users benefit from seeing them as one app.

### Deployment Improvements (ready to implement now)

These are independent of the bot work and can be done immediately:

1. **`WEBSITE_RUN_FROM_PACKAGE=1`** — One Azure CLI command. Deploys drop from ~30 min to ~2 min. No code changes.
   ```powershell
   az webapp config appsettings set --resource-group Main --name link-hub-v1 --settings WEBSITE_RUN_FROM_PACKAGE=1
   ```

2. **Staging slot swap** — Add to `build-and-deploy-staging.ps1`:
   ```powershell
   az webapp deployment slot swap --resource-group Main --name link-hub-v1 --slot staging --target-slot production
   ```
   Zero-downtime deployment. Staging slot already exists at `link-hub-v1-staging-etd3hhg9fhb7fsdv.uksouth-01.azurewebsites.net`.

3. **Test staging in Teams** — The staging URL can be loaded in a browser with the passcode guard. For full Teams testing, temporarily update the manifest `contentUrl` to the staging URL, or use `?inTeams=1` query param (existing escape hatch in `isInTeams()`).

## Command Centre — Hub Controls the Portal (Feb 2026)

Hub is the internal command centre. The Matter Portal (instruct-pitch submodule) is the client surface. Both read from the same `Matters` + `Instructions` tables. The pipeline is ~90% read-path complete — the gap is **write-path UI** from Hub that flows through to the portal.

Full pipeline architecture documented in `.github/instructions/PIPELINE_ARCHITECTURE.md`.

### Phase 1 — Wire existing routes (no new server code)

- [ ] **Matter edit panel in MatterOverview** — `PUT /api/matter-operations/matter/:matterId` already supports status, description, practiceArea, solicitor, value, closeDate. Wire an inline edit form in the InlineWorkbench `matter` tab within `MatterOverview.tsx`. This is the lowest-friction win — the route exists, just needs UI.
- [ ] **Pipeline write actions from Matters** — The InlineWorkbench in Matters is read-only. Add action buttons (e.g. "Reassign solicitor", "Update practice area") that call existing routes.

### Phase 2 — New routes for portal-visible data

- [ ] **CurrentSnapshot editor** — Add `PATCH /api/matter-operations/matter/:matterId/snapshot` to update `Matters.CurrentSnapshot`. Wire a text editor in InlineWorkbench. This is the narrative "Current Position" visible to clients in the portal's `.mp-snapshot-block`.
- [ ] **MatterChecklist CRUD** — Add `GET/POST/PATCH` routes for `MatterChecklist` table. Wire interactive checkboxes in InlineWorkbench. Checklist completion updates flow to portal's `ChecklistSection`.
- [ ] **RecoveryStage control** — Add route to update `Matters.RecoveryStage` (or derive from checklist). Wire dropdown in InlineWorkbench.

### Phase 3 — Document and branding management

- [ ] **Hub-side document management** — Mirror portal's blob routes (`instruction-files` container) in Hub server. Wire file list + upload in InlineWorkbench `documents` tab. Both Hub and portal share the same blob paths.
- [ ] **ClientBranding CRUD** — Routes for managing portal brand assets (logo, colours) per client. Wire in a settings panel accessible from matter detail.

### Phase 4 — Automation and bulk operations

- [ ] **Auto-create portal space on matter opening** — Extend `processingActions.ts` step 12 (or add step) to ensure checklist rows and default snapshot are created alongside the `Matters` INSERT. Portal should work immediately after opening.
- [ ] **Bulk matter operations** — Batch status updates, batch solicitor reassignment from MatterTableView.
- [ ] **Opponent post-creation edits** — `UPDATE` route for `Opponents` table, wired from InlineWorkbench.

---

## Operations Queue — Unified Ops Hub (Mar 2026)

**Status**: Production-ready (gated to ops/tech roles + LZ/AC). Five sections: bank transfer approvals, CCL date confirmations, transaction approvals, Stripe payments, Asana accounts pipeline.

### Current state (updated 25 Mar 2026)

- Server: `server/routes/opsQueue.js` — 10 routes across 4 data sources (Core Data DB, Instructions DB, Stripe, Asana API).
- Client: `src/components/modern/OperationsQueue.tsx` — inline row rendering with in-place expansion, payment lookup, Asana pipeline grid. Helix dark surface styling. V1/V2 transaction toggle (V2 default for LZ+AC).
- Auth utilities: `server/utils/asana.js` — shared Asana credential resolution (env token → per-user OAuth refresh from team table).
- CCL date confirm calls Clio API (PATCH custom field 381463) + SQL UPDATE matters.CCL_date. Helpers reused from `server/routes/ccl-date.js`.
- Transaction approve updates Core Data `transactions` table status (leave_in_client / transfer / transfer_custom).
- Asana integration: live API fetch from Accounts project (project `1203336124217593`), 5-min server-side cache, matter ref extraction from task names.

**Route inventory:**

| Method | Endpoint | Source | Purpose |
|--------|----------|--------|---------|
| GET | `/pending` | Core Data DB | Bank transfers awaiting approval |
| GET | `/recent` | Core Data DB | Recent approvals/actions |
| POST | `/approve` | Core Data DB | Approve a bank transfer |
| GET | `/ccl-dates-pending` | Core Data DB | CCL dates awaiting confirmation |
| POST | `/ccl-date-confirm` | Core Data + Clio API | Confirm a CCL date (stamps Clio + SQL) |
| GET | `/transactions-pending` | Core Data DB | Transactions by date range |
| POST | `/transaction-approve` | Core Data DB | Approve a transaction |
| GET | `/payment-lookup` | Instructions DB | Look up payment by ID or payment_intent_id |
| GET | `/stripe-recent` | Instructions DB | Last 14 days of Stripe payments |
| GET | `/asana-account-tasks` | Asana API (live) | Accounts project sections + tasks |

### Asana integration (IMPLEMENTED — live API, not DB-backed)

The original plan (below) proposed a DB-backed `OpsAsanaTasks` table. The actual implementation uses **live Asana API calls** with server-side caching (5 min TTL). This is simpler and avoids sync drift, but means data is only as fresh as the cache window.

**Implementation:**
- [x] `server/utils/asana.js` — shared auth: env `ASANA_ACCESS_TOKEN` → per-user OAuth refresh from `team` table (Core Data DB)
- [x] `GET /api/ops-queue/asana-account-tasks` — fetches sections + incomplete tasks from Asana Accounts project
- [x] Client renders pipeline grid (section counts) + Asana labels on matching transaction rows
- [x] Asana labels are clickable `<a>` tags opening task in Asana

**Asana Accounts Project:**
- Project GID: `1203336124217593`
- Workspace GID: `1203336123398249`
- 7 sections: Requested, Set up on IPortal, Unclaimed Client funds, Write offs, Paid by AC/JW, Added to Clio/Xero, Rejected

**Matter ref extraction from task names:**
- Task names follow pattern: `AMIN11036-00001 - Transfer Request` or `HLX-12345-67890 - Description`
- Regex: `/^([A-Z]+\d*-\d+-\d+)/i` — captures `LETTERS[DIGITS]-DIGITS-DIGITS` format
- Extracted `matterRef` is matched against transaction `matter_ref` to show Asana stage on transaction rows

**Known issue (outstanding):** The current regex `^([A-Z]+-\d+-\d+)` requires a hyphen between letters and first digit group, which misses refs like `AMIN11036-00001`. Fix: change to `^([A-Z]+\d+-\d+)` to make the hyphen after letters optional.

### Phase 1 — DB-backed task layer (FUTURE — deferred in favour of live API)

The DB-backed approach below remains a valid upgrade path if: (a) Asana API latency becomes a problem, (b) we need historical task tracking, or (c) we need to correlate tasks across multiple Asana projects.

**Data model** — new table `OpsAsanaTasks` in Instructions DB:

| Column | Type | Purpose |
|--------|------|---------|
| `Id` | uniqueidentifier PK | Internal row ID |
| `AsanaTaskGid` | nvarchar(50) | Asana task GID (external key) |
| `AsanaProjectGid` | nvarchar(50) | Asana project GID |
| `TaskName` | nvarchar(500) | Cached task name |
| `Assignee` | nvarchar(100) | Cached assignee name |
| `AssigneeInitials` | nvarchar(10) | Mapped to Helix team initials |
| `DueDate` | date | Cached due date |
| `Status` | nvarchar(50) | `not_started` / `in_progress` / `completed` |
| `Priority` | nvarchar(20) | `low` / `medium` / `high` / `urgent` |
| `Category` | nvarchar(100) | Ops category: `comms`, `admin`, `compliance`, `finance`, `it` |
| `InstructionRef` | nvarchar(50) nullable | Linked instruction if applicable |
| `MatterRef` | nvarchar(50) nullable | Linked matter if applicable |
| `LastSyncedAt` | datetime2 | Last Asana API sync timestamp |
| `CreatedAt` | datetime2 | Row created |
| `CompletedAt` | datetime2 nullable | When marked done |
| `Notes` | nvarchar(max) nullable | Cached task notes/description |

**Sync mechanism** (deferred):
- [ ] Server route `GET /api/ops-queue/asana-tasks` — reads from `OpsAsanaTasks` table, returns pending tasks grouped by category
- [ ] Server route `POST /api/ops-queue/asana-task-complete` — marks task done in Asana API + updates local row
- [ ] Server route `POST /api/ops-queue/asana-sync` — pulls tasks from configured Asana projects, upserts into `OpsAsanaTasks`. Triggered manually or by scheduler.
- [ ] Migration script: `scripts/init-ops-asana-table.mjs` to create `OpsAsanaTasks` table

**Asana project mapping** (to configure):
- Operations board → `comms`, `admin`, `compliance`, `finance` categories
- Tech board → `it` category
- Each project maps to a set of categories; sync pulls incomplete tasks from these projects

### Phase 2 — Communications and updates

- [ ] Add `OpsComms` table — tracks client/team communications that need sending or follow-up
- [ ] Surface "comms due" items in the operations queue (e.g. "Client X needs a status update", "Fee earner Y hasn't updated matter Z in 14 days")
- [ ] Asana tasks tagged `comms` auto-appear in a dedicated Communications section of the ops queue
- [ ] Action: "Mark sent" stamps completion in Asana + local DB, with who/when attribution
- [ ] Drift detection: matters with no activity entries in Clio for >N days surface as "needs attention"

### Phase 3 — Task hub surface

- [ ] Dedicated Tasks tab in Hub (not just ops queue on Home) — full Asana board view with filters, search, assignee grouping
- [ ] Two-way sync: create tasks from Hub → Asana, complete in either direction
- [ ] Link tasks to instructions/matters/enquiries — clicking a task shows the linked pipeline context
- [ ] Personal task queue: "my tasks" view filtered by logged-in user's initials
- [ ] Task creation from ops queue actions: completing an ops item can auto-create follow-up Asana tasks

### Phase 4 — Insights and reporting

- [ ] Ops throughput metrics: items processed per day/week, average time-to-action, queue depth trends
- [ ] Per-person ops load: who is actioning what, balance across team
- [ ] Asana completion rates by category, with trend charts
- [ ] Surface bottlenecks: items sitting unactioned for >N hours get escalation styling
- [ ] Weekly ops digest: auto-generated summary of what was actioned, by whom, what's overdue

### Dependencies

- Asana PAT already in use via `server/routes/techTickets.js` — reuse auth pattern
- Instructions DB connection — already available in opsQueue.js
- Team data reference — map Asana assignees to Helix initials via `TEAM_DATA_REFERENCE.md`
- Future: ties into Stream D2 (cross-app event contract) when task events need to flow between apps

### Read vs Write — Two-Surface Architecture

The operations queue is the **write/action** surface (ops team). It needs a companion **read/visibility** surface for fee earners. Same underlying data, different intent.

#### Write surface (Ops Queue — ops team only)

What ops sees and actions:
- Bank transfer confirmations (Stripe webhook → PaymentOperations → ops confirms)
- CCL date confirmations (stamp Clio custom field 381463 + SQL)
- Transaction requests (transfer/leave from financial forms via Asana)
- Asana task items from operations/admin/compliance boards
- Communications due (follow-ups, status updates, client chase)

Data sources: PaymentOperations (Instructions DB), matters (Core Data), transactions (Core Data), OpsAsanaTasks (Instructions DB — planned), Clio outstanding balances API.

#### Read surface (My Finances — per fee earner)

What each fee earner sees for their own matters:
- **Payment lifecycle**: Deal pitched → Client received link → Stripe payment pending → Payment succeeded → Bank transfer confirmed by ops. Shows which stage each payment is at.
- **Outstanding balances**: Bills unpaid, overdue days, last payment date. Already served by `/api/outstanding-balances/user/:entraId` (Clio API, 30min cache).
- **Transfer/payment request status**: "I submitted a transfer request at 10am — has ops actioned it?" Requires Asana task status lookup or local DB mirror.
- **Matter funds**: Client account balance per matter. Already served by MatterOverview KPI banner.
- **WIP**: Current week vs last week hours/value. Already served by `/api/home-wip?entraId=`.

No action buttons. Read-only. Transparency surface.

#### Data flow connecting them

```
Fee earner submits financial form (Transfer Request / Payment Request)
    ↓
Asana task created (existing BespokeForm → Asana form submission)
    ↓
Ops queue Asana sync pulls task into OpsAsanaTasks table
    ↓
Ops sees item in write surface → actions it → marks complete
    ↓
Status update flows back: OpsAsanaTasks.Status → 'completed', CompletedAt stamped
    ↓
Fee earner's read surface shows "Transfer processed · completed by AC · 14:30"
```

```
Client pays via Stripe (instruct-pitch checkout)
    ↓
Stripe webhook → /api/stripe/webhook → Payments table updated (payment_status='succeeded')
    ↓
Bank transfer → PaymentOperations table → ops queue write surface
    ↓
Ops confirms → payment_status='confirmed', internal_status='paid'
    ↓
Fee earner's read surface shows "Payment confirmed · £2,400 · 23 Mar"
```

#### Implementation notes

- Read surface component: `MyFinancesPanel.tsx` — renders on Home for all users (not just ops)
- Aggregates from 3 existing endpoints (outstanding-balances, home-wip, payments) + new OpsAsanaTasks lookup
- Transaction request status requires either: (a) Asana API lookup by task_id on Transaction record, or (b) local OpsAsanaTasks table mirror (preferred — avoids per-user Asana API calls)
- Payment lifecycle needs a thin projection endpoint: `/api/my-finances/payments?initials=XX` → returns Payments + PaymentOperations status for that fee earner's instructions
- Outstanding balances endpoint already exists and filters by Entra ID
- No new tables needed for read surface — it projects from existing data + OpsAsanaTasks

---

## Medium Priority

- [ ] **Inspector cue for agent-opened surfaces** — Explore an "inspector" design treatment for agent-opened browser windows/panels: a subtle bordered cue that makes AI-opened surfaces feel intentional and trackable without looking noisy. Reference the bordered rainbow-style browser affordance seen in VS Code/Copilot as the interaction idea to adapt for Helix workflows later.
- [ ] **Retire mixed matters fallback after new-space backfill** — Home and the default Matters path now read from `/api/matters-new-space`, with `/api/matters-unified` left as an admin-only fallback inside Matters. Follow-up: verify remaining legacy-only matters are hydrated into new-space/Clio, then remove the temporary fallback switch and the dead mixed-route client helpers from `src/index.tsx` without disturbing Reporting/allMatters consumers.
- [ ] **Year Comparison Report** — New report tab: 5-year financial-year bar charts for WIP, Collected, and Matters Opened. Compares same date window (1 Apr → today's equivalent) across current FY + 4 prior. Needs: (1) confirm historical WIP data source in SQL (current Clio API only serves live week), (2) server endpoint `/api/reporting/year-comparison` querying collected_time, wip, matters tables with FY date bounds, (3) React component `YearComparisonReport.tsx` with 3 grouped bar charts + date-range picker. Add as `draft: true` tab in `REPORT_NAV_TABS` until validated with real data.
- [ ] **Matter one-off hardening** — Prevent repeat failures where `Deals.AreaOfWork` bucket values (e.g. `construction`) are not valid Clio `PRACTICE_AREAS` labels. Add canonical mapping layer before `/api/clio-matters`, and add server-side guard to refuse creating a new `MatterRequest` placeholder when an unresolved one already exists for the same instruction.
- [ ] **Opponent pipeline tracking** — Add opponent completion status to pipeline chips and workbench. Backend: include `Opponents` table data (via `Matters.OpponentID`/`OpponentSolicitorID` FK) in the instruction/pipeline data fetch. Frontend: add pipeline chip (states: pending/partial/complete) between Risk and Matter chips. Workbench: add opponent tab/section for post-opening completion of missing fields (contact, address). `Opponents` table schema already supports this. Also see `src/utils/opponentDataTracker.ts` for client-side field tracking. Server route: `server/routes/opponents.js` already has standalone `POST /api/opponents` endpoint.
- [ ] **Transition: Instructions/Clients → Prospects + Client Matters** — Move instruction workspace concepts (chips/ID/PAY/DOCS/MATTER/workbench) into the Enquiries/Prospect space; rename "Instructions/Clients" to "Client Matters" and retire the separate Matters tab.
  - [x] EID runs inline in prospects (Feb 2026)
  - [x] Risk assessment inline in prospects (Feb 2026)
  - [x] ID review inline in prospects (Feb 2026)
  - [x] Matter opening inline in prospects (Feb 2026)
  - [ ] Remove remaining `navigateToInstructions` dependencies (`Home` quick actions + prospects document preview deep-link) by replacing them with native Prospects Overview actions.
  - [x] Shared workbench status/types extraction complete in tab-app (Apr 2026).
  - [ ] Remove InlineWorkbench monolith drift in tab-app (shell/action/state).
  - [ ] Establish the cross-app event contract for claim, stage-transition, and payment updates so instruct-pitch and enquiry-processing-v2 stay in sync with tab-app.
- [ ] **Resource-group auth broker** — Centralise token acquisition + caching per resource group. At least 3 route files (`dataOperations.js`, `matter-audit.js`, `matter-metrics.js`) each define their own `tokenCache = new Map()` + identical `getAccessToken`. Extract shared helper to `server/utils/tokenBroker.js`.
- [ ] **Metric details modal redesign** — Replace current horizontal-bar card layout in `MetricDetailsModal.tsx` with InlineWorkbench-style structure. See `InlineWorkbench.tsx` for reference patterns.
- [ ] **Upstream instruct-pitch changes** — Apply pending changes in `HelixAutomations/instruct-pitch` (CC/BCC support in sendEmail, payment fetch in fetchInstructionData, logging config updates).
- [ ] **Dead code cleanup sweep** — Generate ESLint unused-vars inventory, then use reference searches to remove genuinely unused helpers/components across `src/**` (skip hook-deps changes initially; avoid submodules).
- [ ] **Retire Home CCL demo surfaces** — `src/components/modern/OperationsDashboard.tsx` still carries unreachable inspector/letter-preview/demo-AI CCL code after the Mar 2026 backend-workbench refactor. Remove the old modal/state stack once Matter-side workbench validation is complete so Home stays visibility-only.
- [ ] **Consolidate duplicate SQL patterns** — Multiple files do similar DB queries differently. Standardise around `withRequest` from `server/utils/db.js`.
- [ ] **Standardise error handling** — Mix of patterns across server routes. Adopt consistent try/catch with structured JSON error responses.
- [x] **Clean console.logs** — Removed `[MATTER-DEBUG]` production logs from EnquiryTimeline.tsx (Mar 2026). Further cleanup may be needed in other files.
- [ ] **Realtime: POID + outstanding balances** — Identify cross-user actions that rely on cached reads and manual refresh; add SSE notification + refetch or targeted cache invalidation.

## Low Priority

- [ ] **AML annual review automation** — The SRA AML Firm-Wide Risk Assessment is annual (Feb–Feb cycle). Current process: run `scripts/amlReview12Months.mjs` for aggregated stats, then `scripts/amlReviewFollowUp.mjs` for PEP names + high-risk country details, then manually look up matter descriptions in Clio. Consider: (1) a combined "AML annual report" script that does everything in one pass including Clio lookups, (2) a Hub UI panel in Data Centre that generates the report on demand, (3) recording AML data differently at source so extraction is simpler (Kanchel's suggestion). See `docs/AML_REVIEW_12_MONTH_REPORT_RUNBOOK.md` for full methodology and gotchas.
- [ ] **Remove commented-out code** — Scattered across codebase.

---

## April 2026 — Realignment call parked items (Stream 6)

Parked intentionally from the Apr 2026 realignment scoping. Each is a deliberate deferral, not a dropped idea — they will re-enter scope once the five stashed streams (`home-todo-single-pickup-surface`, `call-centre-external-attendance-note-and-clio-mirror`, `ccl-review-pickup-via-todo-and-addressee-fix`, `forms-ia-ld-undertaking-complaint-flow`, `chat-tab-removal-retain-infra`) have shipped and bedded in.

- [ ] **Resources / side-projects consolidation** — Transcript: *"I want to bring side projects and forms into a single item. If we were to have a better resources section. I'm gonna call it resources"*. Coordinate with existing stash `resources-tab-restructure-with-templates-section`; defer until forms-IA (Stream 5) is live and LZ has validated the new flow.
- [ ] **Garden mode** — Transcript: *"things like annual leave. I actually want that to be an independent experience called Garden mode that sits at the top right of the screen"*. Out of current scope; revisit after the To Do registry (Stream 2) settles.
- [ ] **Semantic search across the tool** — Transcript: *"I need to have this and a semantic search across the tool"*. Likely Azure AI Search backed. Scope separately once data classification of what's safe to index is agreed.
- [ ] **User-facing Helix-voice panel** — Transcript: *"kind of a Helix voice panel... so that it influences our content"*. Not visible to all users yet; stays a server-side prompt asset ([server/prompts/helixVoice.js](../../server/prompts/helixVoice.js)). Re-open when a user-facing voice governance surface is needed.
- [ ] **Pitch builder** — Transcript: *"I also need a pitch builder... much more dynamic... driving off the to-do list"*. Parked: requires prior delivery of To Do registry + forms-IA + matter-lookup primitive.
- [ ] **Deep-link URLs to every workflow** — Transcript: *"we should have URLs and links that get to exactly where you need to be"*. Partial support exists via `App.tsx` deep-link handlers; full coverage is a separate compounding pass.
- [ ] **Teams tab splitting** — Transcript: *"each one of these sections can be a teams tab"*. Architectural; needs manifest strategy + auth per-tab. Park until platform topology is stable.
- [ ] **Asana tasks ingestion** — Transcript: *"I use Asana for everything that's not hub-originating"*. Explicitly out of the To Do registry (Stream 2). If cross-surface pickup later becomes desirable, scope with Asana API permissions review.


- [ ] **Consistent naming conventions** — snake_case vs camelCase inconsistency.
- [ ] **Remove unused routes** — Grep server route registrations against actual frontend `fetch()` calls to identify dead endpoints.
- [ ] **Submodule header CSS compat warning** — `-webkit-overflow-scrolling: touch;` in `submodules/enquiry-processing-v2/wwwroot/components/header.html` triggers Edge Tools compat warning; fix upstream.
- [ ] **Command centre CSS class extraction** — 15+ inline hover patterns (`rgba(54,144,206,0.06)`) across AppearanceSection, LocalDevSection, ProfileSection, SystemStatusSection could be `.cmd-section-hover` CSS class. Also: collapsible header pattern (5 sections), card surface pattern (8 occurrences). See April 2026 audit.
- [ ] **Command centre StatusDot component** — ~20 inline `<span style={{ width: 4, height: 4, borderRadius: 999 }}>` across CommandDeck and SystemStatusSection. Extract to reusable `<StatusDot colour size aria />`.
- [ ] **LocalDevSection keyboard accessibility** — Mouse-only toggle interactions. Convert `onMouseEnter/onMouseLeave` style mutations to CSS `:hover`/`:focus-within` classes with `role="switch"` and `aria-checked`.
- [ ] **Full command-centre WCAG 2.1 AA pass** — 10+ interactive elements missing `aria-label`, focus order not managed, no keyboard nav in some sections. Schedule with axe-core or Wave audit.

---

## Cognito → Bespoke Form Conversion Plan

**Goal**: Replace all 9 remaining Cognito-embedded forms with bespoke React components. This eliminates the external Cognito dependency, gives us full control over styling/validation/submission, enables the form health check system, and lets us pre-fill user context (initials, name, matter refs) automatically.

**Current state**: 6 bespoke forms already exist (`BundleForm`, `NotableCaseInfoForm`, `TechIdeaForm`, `TechProblemForm`, `CounselRecommendationForm`, `ExpertRecommendationForm`). Financial forms use the generic `BespokeForm` field renderer. The shared form infrastructure (`formStyles.ts`, `AreaWorkTypeDropdown`, `FormHealthCheck`) is mature.

**Pattern to follow**: Each conversion creates a new `src/CustomForms/XxxForm.tsx` file using the established form style helpers (`getFormScrollContainerStyle`, `getFormCardStyle`, `getFormSectionStyle`, `getInputStyles`, etc.) from `shared/formStyles.ts`. A matching server route in `server/routes/` handles submission.

### Priority Order

Prioritised by usage frequency and value of replacing the Cognito embed. Forms that benefit most from matters/user context pre-fill come first.

#### Tier 1 — High-frequency, high-value (convert first)

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 1 | **Tel. Attendance Note** | 41 | General | Matter ref (dropdown), caller name, phone, attendance type, notes, follow-up date | Clio activity entry or Asana task | Medium — needs matter dropdown + Clio API |
| 2 | **Tasks** | 90 | General | Assignee (team dropdown), matter ref, due date, priority, description | Asana task creation (existing pattern in `techTickets.js`) | Medium — reuse Asana integration |
| 3 | **Call Handling** | 98 | Operations | Caller name, phone, company, enquiry type, area of work, urgency, notes, fee earner to notify | Email notification or Asana task | Low-Medium |

#### Tier 2 — Moderate frequency

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 4 | **Office Attendance** | 109 | General | Date, location (Brighton/Remote/Other), time in/out | SQL insert to attendance table (route exists: `server/routes/attendance.js`) | Low |
| 5 | **Incoming Post** | 108 | Operations | Recipient (team dropdown), sender, item type, matter ref, notes | Email to recipient or Asana task | Low |
| 6 | **Transaction Intake** | 58 | Operations | Property address, client name, transaction type, price, solicitor, key dates | SQL insert + email to property team | Medium |

#### Tier 3 — Lower frequency or being superseded

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 7 | **Proof of Identity** | 60 | General | Client name, matter ref, ID type, file upload, verification status | Already partially superseded by inline EID in Prospects. May keep as standalone for ops team. | Medium — file upload |
| 8 | **Open a Matter** | 9 | General | Client details, matter type, fee earner, area/worktype | **Already superseded** by `FlatMatterOpening.tsx` in Prospects. Remove from Forms page or redirect. | N/A — retire |
| 9 | **CollabSpace Requests** | 44 | General | Matter ref, participants, purpose | Email to ops or Asana task | Low |

### Per-form conversion checklist

Each conversion should follow this checklist:

1. [ ] **Audit Cognito form** — Open the Cognito URL, screenshot/document all fields, validation rules, conditional logic, and submission action (email? webhook? Zapier?)
2. [ ] **Create server route** — `server/routes/xxxForm.js` with POST handler. Use `withRequest()` for SQL, or Asana/email for task-based forms. Add App Insights telemetry.
3. [ ] **Create React component** — `src/CustomForms/XxxForm.tsx` using shared form styles. Props: `{ users, userData, currentUser, matters, onBack }`. Pre-fill user initials/name from `currentUser`.
4. [ ] **Register in formsData.ts** — Replace `embedScript` with `component: XxxForm`. Keep `url` as fallback link.
5. [ ] **Add to health check** — Add GET probe in `server/routes/formHealthCheck.js`.
6. [ ] **Test** — Open form from Forms page, fill fields, submit. Verify submission arrives at destination (Asana/SQL/email). Check health check reports healthy.
7. [ ] **Remove Cognito embed** — Delete `embedScript` entry and Cognito URL from `formsData.ts`.

### Infrastructure notes

- **Cognito script loader** can be removed from `FormDetails.tsx` once all 9 forms are converted. Currently at lines 85–130, ~45 lines of dead code post-conversion.
- **Form mode toggle** (Cognito/Bespoke buttons in `FormDetails.tsx`) can also be removed.
- **`BespokeForm` generic renderer** stays — it powers the Financial forms which use field definitions rather than custom components.

### Conversion log

| Form | Status | Date | Notes |
|------|--------|------|-------|
| Open a Matter | Superseded | Feb 2026 | `FlatMatterOpening.tsx` in Prospects handles this. Consider removing from Forms page. |
| *Others* | Not started | — | — |

---

## Prospects Optimisation Plan

**Target**: `src/tabs/enquiries/Enquiries.tsx` — 11,349 lines, 78 `useState`, 48 `useEffect`, 54 `useCallback`, 27 `useMemo`.

**Constraint**: No route changes, no API changes, no visual regressions. Each step is independently deployable. Test after each step by opening Prospects in all views (Mine/Claimed, Mine/Claimable, All, Triaged) and confirming identical behaviour.

**Autonomy note**: Each task below contains enough context for an agent to execute it without further clarification. Line numbers are approximate — always grep for the specific code patterns described rather than relying on exact line numbers, as prior tasks will shift them.

### Phase 1 — Safe extractions (no behaviour change)

Each task is a standalone change. Do them in order. Confirm the build compiles and Prospects loads correctly after each.

- [x] **1a. Extract `normalizeEnquiry()` utility** *(done — `src/utils/normalizeEnquiry.ts`, includes `source` field bug fix, `NormalizedEnquiry` type alias replaces all inline `Enquiry & { __sourceType }` patterns)*
- [x] **1b. Extract `detectSourceType()` to module scope** *(done — lives in `normalizeEnquiry.ts`)*

- [ ] **1c. Convert `displayEnquiries` from `useState` to `useMemo`** *(deferred — 13 `setDisplayEnquiries` call sites, 3 handlers skip `setTeamWideEnquiries`. Requires careful audit.)*
  - Find `const [displayEnquiries, setDisplayEnquiries] = useState<(Enquiry & { __sourceType:`.
  - Find the syncing `useEffect` — search for the comment `// Apply dataset toggle to derive display list`. It contains the derivation logic (~30 lines).
  - Replace with: `const displayEnquiries = useMemo(() => { ... }, [allEnquiries, teamWideEnquiries, showMineOnly, userData])`.
  - Move the exact logic from the `useEffect` body into the `useMemo`, returning the result instead of calling `setDisplayEnquiries`.
  - Handle the empty-allEnquiries case (return `[]`).
  - Remove the `useEffect` and all `setDisplayEnquiries` calls. Grep to find them all — there's one in the prop normalisation `useEffect` that clears to `[]` when `enquiries` is null. That case should be handled by the `useMemo` checking `allEnquiries.length === 0`.
  - **Why**: Eliminates 1 wasted render cycle per data/filter change.
  - **Test**: Switch between Mine/All views. Confirm enquiry counts match. Claimed view still shows claimed items.

- [x] **1d. Consolidate toast state** ✅ Done — 4 useState → 1 + showToast() helper with auto-dismiss timer ref. All 15 call sites + JSX reads updated.

- [x] **1e. Consolidate demo overlay state** ✅ Done — 3 useState → 1 object. Write site + JSX reads updated.

### Phase 2 — Component extraction (visual structure unchanged)

Each sub-component is `React.memo`-wrapped and receives only the props it needs. This prevents the parent's 78 `useState` changes from re-rendering child rows.

- [ ] **2a. Extract `ProspectTableRow` component**
  - Target: the table row JSX block. Search for the `{(viewMode === 'table'` render section and find the per-enquiry `.map()` that renders each row.
  - Contains: inline styles, IIFEs for pipeline chips, hover handlers, click handlers, enrichment badges. Approximately 2,200 lines.
  - New file: `src/tabs/enquiries/components/ProspectTableRow.tsx`.
  - Props: the enquiry data, handler callbacks (`onClaim`, `onReassign`, `onEnquiryClick`, etc.), theme/colours, feature flags.
  - Wrap in `React.memo` with a custom comparator that checks enquiry ID + key fields (claim state, stage, POC, `__sourceType`).
  - **Test**: All row interactions (click, hover, claim, reassign, pipeline chips, grouping expand/collapse) work identically.

- [ ] **2b. Extract `PipelineChips` component**
  - Target: the pipeline chip rendering. Search for the IIFE or block that renders POC → EID → Risk → Matter → Docs → Pay chips.
  - Currently duplicated inline for main rows and child rows within grouped mode.
  - New file: `src/tabs/enquiries/components/PipelineChips.tsx`.
  - `React.memo`-wrapped.
  - **Test**: Pipeline chips render correctly in both grouped and flat views, in all states.

- [ ] **2c. Extract `ProspectsOverlay` component**
  - Target: Loading/processing overlay + toast + demo overlay. Search for the comment `{/* Processing overlay`.
  - New file: `src/tabs/enquiries/components/ProspectsOverlay.tsx`.
  - **Test**: Overlay shows during view transitions and initial load.

### Phase 3 — Structural improvements (careful)

- [ ] **3a. Extract filter pipeline into `useEnquiryFilters` hook**
  - Target: the `filteredEnquiries` useMemo. Search for `const filteredEnquiries = useMemo`. It's ~350 lines.
  - New file: `src/tabs/enquiries/hooks/useEnquiryFilters.ts`.
  - Break into composable filter functions: `filterByClaimed()`, `filterByArea()`, `filterBySearch()`, `filterByPipeline()`.
  - The area-matching logic is duplicated 3 times within the current useMemo — unify into a single `matchesAreaFilter()` function.
  - **Test**: All filter combinations (Claimed/Claimable/Triaged × area × search × pipeline stage) produce identical results.

- [ ] **3b. Memoize or extract inline styles**
  - The render section has ~200+ inline style objects created per render.
  - For styles that depend only on `isDarkMode` / `colours`, move to `useMemo` at the top of the component or to a shared styles module.
  - Prioritise the table row styles (they're rendered per-row, so N×200 objects per render).
  - **Test**: Visual appearance unchanged.

---

## File Splitting Targets (Codebase Health)

Six mega-files exceed or approach the 3,000-line threshold. Each blocks maintainability, slows IDE performance, and makes merge conflicts more likely. Track decomposition here.

Run `npm run check-sizes` to see current line counts.

| File | Lines | Priority | Decomposition strategy |
|------|-------|----------|----------------------|
| `src/tabs/instructions/InlineWorkbench.tsx` | ~10,900 | High | Extract editor panels, preview, toolbar, state hooks |
| `src/tabs/enquiries/Enquiries.tsx` | ~10,500 | High | Extract filter bar, table columns, detail panel, action modals into `parts/` |
| `src/components/modern/OperationsDashboard.tsx` | ~10,100 | High | Extract each panel (pipeline, lifecycle, stats, activity feed) into co-located components |
| `src/tabs/enquiries/EnquiryTimeline.tsx` | ~8,500 | High | Extract timeline renderers, event types, detail views |
| `src/tabs/instructions/Instructions.tsx` | ~8,200 | High | Extract table, detail drawer, filter logic, bulk actions |
| `src/tabs/Reporting/ReportingHome.tsx` | ~6,900 | Medium | Extract individual report cards, filter controls |
| `src/tabs/home/Home.tsx` | ~6,700 | Medium | Extract data-fetching hooks, panel components, action handlers |
| `src/tabs/Reporting/MattersReport.tsx` | ~5,600 | Medium | Extract chart panels, table sections |
| `src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx` | ~5,500 | Medium | Extract form sections, validation, step components |
| `src/tabs/Reporting/EnquiriesReport.tsx` | ~5,400 | Medium | Extract chart panels, filter controls |
| `src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx` | ~5,300 | Medium | Extract block types, editor toolbar, template picker |
| `src/tabs/enquiries/PitchBuilder.tsx` | ~5,100 | Medium | Extract step components, preview panel |
| `src/tabs/matters/ccl/PreviewStep.tsx` | ~4,400 | Low | Extract field groups, preview renderer |
| `src/components/modern/OperationsQueue.tsx` | ~4,100 | Low | Extract queue item renderers, filter controls |
| `server/routes/dataOperations.js` | ~3,100 | Low | Extract sync handlers into separate route modules |

**Rules for splitting:**
1. Extract one logical section at a time — never rewrite entirely.
2. Each extraction must be independently revertable and independently testable.
3. Maintain the same prop interface — the parent file should import and render, nothing else changes externally.
4. After each extraction, run `npm run check-sizes` to confirm line count reduced.
5. Co-locate extracted pieces in a `parts/` sub-folder next to the parent file.

---

## Completed

- [x] 2025-12-30: Agent infrastructure (sync-context, session-start, validate-instructions)
- [x] 2025-12-30: 2025 rate update (both databases)
- [x] 2025-12-30: Root cleanup (removed temp files)
- [x] 2025-12-30: Archived one-off scripts
- [x] 2026-01-11: Realtime: future bookings (SSE + cache invalidation)
- [x] 2026-02-06: EID inline in prospects — no navigation to Clients, processing overlay + toasts + auto-refresh
- [x] 2026-02-08: Audit docs/ folder — reduced from 113 to ~13 files
- [x] 2026-02-08: Data Centre — split allocation transparency, 3-layer OperationValidator, post-sync auto-validation, audit trail, timeline validation, count mismatch fix, "Last Sync: Never" fix, collectedTime documented, "dupes"→"split allocations"
- [x] 2026-02-09: normalizeEnquiry extraction (Phase 1a+1b) — `src/utils/normalizeEnquiry.ts`, NormalizedEnquiry type, source field bug fix
- [x] 2026-02-09: Pipeline filter cycle fix — buttons now loop (none→has→missing→clear), dot indicators, descriptive tooltips
- [x] 2026-02-09: WIP non_billable — added `non_billable BIT` to wip table (293,811 rows migrated), Clio Activities API fields updated, batch+fallback INSERT updated
- [x] 2026-02-09: WIP validator enriched — dedup CTE, SUM(total), SUM(hours), type breakdown (TimeEntry/ExpenseEntry), spot checks, data source labels ("via Activities API")
- [x] 2026-02-09: Post-sync log breakdown — audit trail messages now include kind/type splits with £ totals and hours
- [x] 2026-02-09: 12m monthly totals — per-month kind/type breakdown with sub-rows in UI, hours for WIP months
- [x] 2026-02-09: Collected time coverage — batch INSERT (100 rows), dedup CTE fix (£41,541 in 681 duplicates), staging route registration

---

*Update this file when priorities shift or items complete.*

---

## Verification Check (Tiller) � follow-ups

- [ ] PDF report download � proxy through the TillerManual Azure Function (`https://tillermanual.azurewebsites.net/api/PDF`) via a new server endpoint that streams the PDF. Surface in the form Result section (button currently disabled with tooltip).
- [ ] Auto-upload verification report to Clio/NetDocuments against the matched matter when the instruction already has a matter reference.
- [ ] Auto-detect Clio matter for a given `instructionRef` inside the form � show a linked-matter chip and a quick-open button so operators don't context-switch to find the file.
