# Home To Do — single pickup surface (replace pipeline + matters tiles)

> **Purpose.** Promote Home's existing immediate-actions surface into the primary pickup point for every hub-originating item. Retire the Pipeline + Matters tiles on Home (they still exist on their own tabs). The graph/conversion block stays. This brief is the anchor for Streams 1, 3 and 5 — each feeds cards into the To Do registry defined here.
>
> **Verified:** 2026-04-20 against branch `main`.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/notes/realignmentcall_scope.md](realignmentcall_scope.md)):

- *"amend this and not have these as two separate items... literally have the to do and keep it really simple"*
- *"not including Asana, but including things like... you need to do the risk assessment because this person's completed the ID. You need to open the file because... the person's completed the ID... and the risk assessment has been done, but you didn't click open file"*
- *"only for things originating out of Hub, not trying to join up all of the other processes"*
- *"how is this going to reconcile? If say we... create a call attendance note via the assigned Cognito... how is this going to know that I've done that"* → answer agreed: *"we would just have a HTTP branch in that workflow sending an API call to the event"*
- *"dim it with a tick to say that it's done or... include a button to say show me completed items"*
- *"I considered home... to be the place users pick up client care reviews from"*
- *"all of the like annual leave approval, we're going to the To Do List now"*
- Graph stays: *"I made sure that this is showing only essential data, no kind of distractions"*

Out of scope: Asana tasks, cross-app joins (enquiries / instructions feeds), chat surface.

---

## 2. Current state — verified findings

### 2.1 Home tiles

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — currently renders pipeline and matters tiles alongside the enquiries/matters/conversion graph. Pipeline data duplicates the Enquiries tab; matters duplicates the Matters tab.

### 2.2 Immediate-actions framework (the skeleton this brief promotes)

- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) — partial To Do bar, already live.
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — already declares kinds including `review-ccl`, `annual-leave`, `snippet-edits`. This is the contract we extend.
- [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) — grouped rendering.

### 2.3 CCL review deep-link (routed today via matters box)

- Dispatcher: [src/components/modern/matter-opening/MatterOpenedHandoff.tsx L171](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx#L171) — emits `openHomeCclReview`.
- Listener: [src/components/modern/OperationsDashboard.tsx L4232](../../src/components/modern/OperationsDashboard.tsx#L4232).
- App deep-link: [src/app/App.tsx L827](../../src/app/App.tsx#L827) — `pendingShowCcl` + forward to `openHomeCclReview`.

### 2.4 Home-journey cache

- [server/routes/home-journey.js L842](../../server/routes/home-journey.js#L842) — cache key pattern `home-journey:*`. This will need invalidation alongside any new To Do registry.

### 2.5 Related existing briefs

- [CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md](CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md) currently assumes the **matters-box row** is the pickup surface. This brief supersedes that assumption. Update that brief's §2/§3 pickup-surface language when Phase B of this brief lands.
- [FORMS_STREAM_PERSISTENCE_PLAN.md](FORMS_STREAM_PERSISTENCE_PLAN.md) handles tray + retrigger mechanics for forms. Independent of the To Do emission this brief adds; they compose.

---

## 3. Plan

### Phase A — Swap Home layout to focus mode (To Do primary)

**Second-correction scope (2026-04-20, mid-implementation realignment):** User rejected the single-mode gate and specified **two independent toggles** instead. Enquiries/matters metric tiles + conversion chart inside `OperationsDashboard` stay visible always — they are Home's at-a-glance numbers. Only the pipeline+matters sub-columns and the separate ops-queue/transactions blocks are optional.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Two boolean toggle state | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | `hideAsanaAndTransactions` + `replacePipelineAndMatters`, each persisted to their own `localStorage` key (`helix.home.hideAsanaAndTransactions`, `helix.home.replacePipelineAndMatters`). Default both `false` in prod. Helpers `readBoolToggle`/`writeBoolToggle`. |
| A2 | Gate ops-queue + transactions | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | `OperationsQueue` wrapped in `{!hideAsanaAndTransactions && (...)}`. `Transactions & Balances` section wrapped `{useLocalData && !hideAsanaAndTransactions && (...)}`. Dashboard itself always rendered. |
| A3 | Thread `hidePipelineAndMatters` into OperationsDashboard | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | New optional prop on interface + destructured with default `false`. Consumed in the pipeline layout row: (a) `gridTemplateColumns` becomes `1fr 1fr` when a `todoSlot` is also provided (50/50 with Conversion), else collapses to `1fr`, (b) entire `── Right: Pipeline ──` column (~1170 lines: activity/unclaimed tabs, recent-matters table, HomePipelineStrip per-row) wrapped in `{!hidePipelineAndMatters && (...)}`. |
| A4 | `todoSlot` right-column (replaces pipeline column) | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) + [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | New `todoSlot?: React.ReactNode` prop on OperationsDashboard. When `hidePipelineAndMatters` is on AND `todoSlot` provided, a new right-column block renders under a matching `home-section-header` titled "To Do" (`FiCheckCircle`), visually symmetrical to the left Conversion panel. Home passes `<ImmediateActionsBar ... />` as `todoSlot` only when `replacePipelineAndMatters` is on — so ImmediateActions becomes the ToDo panel in-place of the pipeline (no duplicate render above the dashboard). |
| A5 | Toggle UI (dev-only surface) | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | Stacked checkbox panel at `bottom: 56, left: 16`, visible only when `useLocalData` is true OR user is LZ/AC. Two lines: *"Hide ops queue + transactions"*, *"Replace pipeline/matters with ToDo"*. Brand tokens, `borderRadius: 0`, Raleway, accent (dark) / highlight (light) on the tick. |
| A6 | "Show completed" affordance *(deferred)* | [ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) | Default: dim + tick on completed rows for 10 min, then hide. Header toggle reveals completed (last 20, per day). |
| A7 | `ImmediateActionsBar` rework *(deferred — user acknowledged "it will need a rework")* | [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) | Current bar was built for the app-level portal. As the inline ToDo box it needs visual rework: full-width panel footprint, section headers, skeleton-reserved layout, tighter density for Home context. Specifics TBD with user. |
| A8 | Conversion-on-left, ToDo-on-right 50/50 *(delivered via A3+A4)* | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Achieved by the `todoSlot` mechanism above — dashboard's own pipeline-row grid flips to `1fr 1fr` when the slot is provided, so Conversion and ToDo sit side-by-side at 50/50. No conversion-chart extraction was needed. |

**Phase A acceptance (A1-A5, delivered 2026-04-20):** In production, Home looks identical to today (both toggles default off). When `Replace pipeline/matters with ToDo` is on: dashboard's enquiries/matters metric tiles + conversion chart remain; the entire pipeline/matters right column is hidden; `ImmediateActionsBar` renders inline as the pickup surface. When `Hide ops queue + transactions` is on: the CCL/matter-opening queue and the transactions strip are hidden. Toggles are independently composable (either, both, or neither). No behaviour regression on existing `review-ccl` / `annual-leave` cards. No deletion of dashboard data-fetching code. Toggle chip only visible locally or for LZ/AC.

### Phase B — Card contract + registry

Formalise the card model so Streams 1, 3, 5 can plug in without re-inventing shape.

#### B1. Extend `ImmediateActionModel.ts`

Required fields on every To Do card:

```ts
interface ToDoCard {
  sourceId: string;              // uuid, idempotency key
  kind: ToDoKind;                // discriminated union below
  ownerInitials: string;         // which hub user this card is for
  createdAt: string;             // ISO
  completedAt?: string;
  completedVia?: 'hub' | 'cognito' | 'auto';
  // Contextual:
  matterRef?: string;            // display number (Clio)
  docType?: string;              // e.g. "Client Care Letter", "Attendance Note"
  stage?: 'compile' | 'draft' | 'test' | 'review' | 'upload';
  payload?: Record<string, unknown>; // per-kind detail for click handler
}

type ToDoKind =
  | 'review-ccl'              // existing
  | 'annual-leave'            // existing
  | 'snippet-edits'           // existing
  | 'call-attendance-note'    // Stream 1
  | 'open-file'               // ID verified + RA done, not opened
  | 'risk-assessment'         // ID verified, RA pending
  | 'undertaking-request'     // Stream 5
  | 'complaint-followup';     // Stream 5
```

#### B2. Card catalogue for this push

| Kind | Created when | Owner | Completes when |
|------|--------------|-------|-----------------|
| `review-ccl` | CCL autopilot PT returns any field <7 (Stream 3) | Fee earner of matter | Review rail Save or dismiss |
| `call-attendance-note` | External call arrives with no saved note (Stream 1) | Most senior internal attendee | `POST /api/todo/reconcile` fires (ND+Clio success **or** Cognito form submitted) |
| `open-file` | ID verified + RA done, matter not yet opened | Instructing fee earner | Matter opened event |
| `risk-assessment` | ID verified, RA not yet done | Instructing fee earner | RA form submitted |
| `undertaking-request` | Undertaking form submitted (Stream 5) | LZ | Manually ticked in register |
| `complaint-followup` | Complaint form submitted (Stream 5) | LZ | Manually ticked in register |
| `annual-leave` | Existing | Approver | Existing |

#### B3. Reconcile endpoint

**New:** `server/routes/todo.js`.

- `POST /api/todo/create` — `{kind, ownerInitials, matterRef?, docType?, stage?, payload?}` → creates card, returns `sourceId`. Idempotent on `(kind, matterRef, ownerInitials)` where applicable.
- `POST /api/todo/reconcile` — `{sourceId? | {kind, matterRef, ownerInitials}, completedVia}` → marks complete. Invalidates `home-journey:*` cache.
- `GET /api/todo?owner=XX&includeCompleted=0|1` — server-side source of truth; client merges with any client-derived derived cards (e.g. CCL autopilot in-flight).

Persistence: new `dbo.hub_todo` table on the **Helix Operations Platform DB** (`helix-operations`) — **NOT** Core Data. Aligns with `dbo.form_submissions` + `dbo.ai_proposals` already there. Same two-stage gate as other ops-DB helpers (`OPS_PLATFORM_ENABLED=true` + `OPS_SQL_CONNECTION_STRING`), emergency rollback via `HUB_TODO_USE_LEGACY=true`. See [docs/HELIX_OPERATIONS_PLATFORM.md](../HELIX_OPERATIONS_PLATFORM.md).

Schema (modelled on `form_submissions` for activity-feed compatibility):

```sql
CREATE TABLE dbo.hub_todo (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_hub_todo_id DEFAULT NEWID() PRIMARY KEY,
  kind NVARCHAR(50) NOT NULL,
  owner_initials NVARCHAR(16) NOT NULL,
  matter_ref NVARCHAR(50) NULL,
  doc_type NVARCHAR(100) NULL,
  stage NVARCHAR(32) NULL,
  payload_json NVARCHAR(MAX) NULL,
  summary NVARCHAR(400) NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_hub_todo_created DEFAULT SYSUTCDATETIME(),
  completed_at DATETIME2 NULL,
  completed_via NVARCHAR(32) NULL,
  last_event NVARCHAR(200) NULL
);
CREATE INDEX ix_hub_todo_owner_open ON dbo.hub_todo (owner_initials, completed_at);
CREATE INDEX ix_hub_todo_kind_matter_owner ON dbo.hub_todo (kind, matter_ref, owner_initials) WHERE matter_ref IS NOT NULL;
CREATE INDEX ix_hub_todo_created ON dbo.hub_todo (created_at DESC);
```

Column mapping for activity-feed: `hub.todo` source reuses `id`, `summary`, `created_at`, `completed_at`, `last_event` columns directly. One INSERT creates both a Home card and an Activity-feed row.

#### B4. Power Automate Cognito branch

Add an HTTP action in each Cognito → Power Automate flow that currently files an attendance note, calling `POST /api/todo/reconcile` with `{kind: 'call-attendance-note', matterRef, ownerInitials, completedVia: 'cognito'}`. This closes the ring for Stream 1 redundancy.

#### B5. Deep-link rerouting

- Update [MatterOpenedHandoff.tsx L171](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx#L171) and the server-side autopilot chain to create a card via `/api/todo/create` instead of (or in addition to — behind a flag during migration) the matters-box row.
- Preserve `openHomeCclReview` custom event so existing listener in [OperationsDashboard.tsx L4232](../../src/components/modern/OperationsDashboard.tsx#L4232) still works — the card's click handler dispatches it.

#### B6. Telemetry (per App Insights guidance)

- `Todo.Card.Created`, `Todo.Card.Completed`, `Todo.Reconcile.*`, `Todo.Fetch.Failed`. Properties: `kind`, `ownerInitials`, `matterRef`, `completedVia`.

---

## 4. Step-by-step execution order

1. **A1 → A4** (Phase A) — ship independently; no server changes. Verify Home shape with LZ on staging.
2. **B1** — extend `ImmediateActionModel.ts`; no behavioural change yet.
3. **B3** — server route + table migration script; deploy behind unused flag.
4. **B2** — wire existing `review-ccl` and `annual-leave` through the new registry (still works client-side if server 500s — graceful fallback).
5. **B5** — reroute CCL deep-link through the registry. Matters-box row path removed only after Stream 3 ships.
6. **B4** — Power Automate flow update (coordinate with LZ to edit the flow in Teams/Power Automate UI).
7. **B6** — telemetry throughout.

---

## 5. Verification checklist

**Phase A:**
- [ ] Home no longer shows pipeline or matters tiles.
- [ ] Graph/conversion block unchanged, same refresh behaviour.
- [ ] Existing `review-ccl` card still clickable and opens CCL rail.

**Phase B:**
- [ ] `POST /api/todo/create` with duplicate `(kind, matterRef, owner)` returns the existing `sourceId`, does not duplicate.
- [ ] Cognito flow edit calls `/reconcile` and corresponding `call-attendance-note` card dims + ticks within 5 s.
- [ ] Stream 1 save also reconciles; verified by triggering both paths in staging.
- [ ] "Show completed" toggle reveals last 20 completed items for today.
- [ ] Completed rows do not auto-fire their click handler.
- [ ] App Insights: `Todo.Card.Created` fires on every card creation.
- [ ] SQL spot check: `SELECT TOP 20 * FROM hub_todo ORDER BY created_at DESC;` shows sane payloads.

---

## 6. Open decisions (defaults proposed)

1. **Store dismissed-not-completed separately?** Default: **No.** Dismiss = complete with `completedVia='manual-dismiss'`. Simpler; audit retained.
2. **Per-user ownership swap mid-life?** Default: **Allow via `/api/todo/reassign`**. Handover cases exist (fee earner OOO).
3. **Retention of completed rows?** Default: **90 days in `hub_todo`**, then archived to `hub_todo_archive` by weekly job. Cheap enough; useful for audit.

---

## 7. Out of scope

- Asana task ingestion (transcript explicit: "not including Asana").
- Cross-app joins (enquiries/instructions live feeds). Each app retains its own surface.
- Tasks from Outlook / Teams. Hub-originating only.
- Chat-tab notifications (Stream 4 removes the chat surface; DM-send infra retained for future use but no card echoes into it this push).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx)
- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx)
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts)
- [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx)
- [src/app/App.tsx](../../src/app/App.tsx)
- [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx)
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)

Server:
- `server/routes/todo.js` (NEW)
- [server/routes/home-journey.js](../../server/routes/home-journey.js) — cache invalidation hook
- [server/routes/ccl.js](../../server/routes/ccl.js) — autopilot chain emits via `/api/todo/create`

Scripts / docs:
- `scripts/migrate-add-hub-todo.mjs` (NEW) — creates `hub_todo` table + index
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata

```yaml
# Stash metadata
id: home-todo-single-pickup-surface
shipped: true
shipped_on: 2026-04-21
verified: 2026-04-20
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/tabs/home/ImmediateActionsBar.tsx
    - src/tabs/home/ImmediateActionModel.ts
    - src/tabs/home/ActionSection.tsx
    - src/app/App.tsx
    - src/components/modern/matter-opening/MatterOpenedHandoff.tsx
    - src/components/modern/OperationsDashboard.tsx
  server:
    - server/routes/todo.js
    - server/routes/home-journey.js
    - server/routes/ccl.js
  submodules: []
depends_on: []
coordinates_with:
  - forms-stream-persistence
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-pickup-via-todo-and-addressee-fix
  - call-centre-external-attendance-note-and-clio-mirror
  - forms-ia-ld-undertaking-complaint-flow
  - chat-tab-removal-retain-infra
  - demo-mode-hardening-production-presentable-end-to-end
  - clio-token-refresh-shared-primitive
  - session-probing-activity-tab-visibility-and-persistence
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - home-animation-order-and-demo-insert-fidelity
  - realtime-delta-merge-upgrade
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with:
  - ccl-backend-chain-silent-autopilot-service
```

---

## 9. Gotchas appendix

- `ImmediateActionModel.ts` already has meta entries (`'review-ccl'`, `'annual-leave'`). Extend, don't replace — downstream components match on these kind values.
- The `openHomeCclReview` custom event is dispatched from both `MatterOpenedHandoff.tsx` and `App.tsx` (deep-link). Both must continue to produce a To Do card; do not refactor out this seam until Stream 3 has shipped.
- `home-journey:*` cache — any card creation that alters what a user sees on Home must invalidate this cache key or the graph/feed will lag.
- The `hub_todo` insert path must be idempotent on `(kind, matter_ref, owner_initials)` for all kinds where duplicate triggers are possible (CCL PT can re-run; Cognito retries). Otherwise we double-card.
- Matters-box row (CCL) is not removed by this brief — Stream 3 removes it. During the migration window both surfaces will show the CCL review; the matters-box must check the same `hub_todo` completion state to stay in sync (or simply be hidden when a Home card exists).
