# Tasks Board Editor Birdseye Asana Control

> **Purpose of this document.** This is a self-contained brief that any future agent or the user on a different day can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B and onwards should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-06-03 against branch `main`. If you are reading this more than 30 days later, re-verify file and line refs before executing.

---

## 1. Why this exists (user intent)

The user wants the System > Tasks board selector to become a real control surface, not just another Asana mirror. Verbatim: "if i click on a name i want to open a little 'Edit Tasks' view where i can see a birds eye of the board i clicked with sections /little farm plots with the different sectgions and their tasks, with real functionality to manipulate the boards in this way, like puppets. obviously steady and letting things time to lock in etc."

The intent is a bespoke Hub-side task cockpit over Asana: visibility into boards, sections, tasks, edge cases, and eventually Clio/task notes, with careful mutation behaviour. It is acceptable that this duplicates Asana because the product direction is a higher-quality internal integration, not a generic embedded Asana clone.

The user explicitly asked to scope and stash this first. Do not implement from this brief until it is picked up deliberately. The next context-gathering step should inspect the Azure Function App `tasking-v3` so the new board editor does not ignore the existing tasking system.

---

## 2. Current state - verified findings

### 2.1 System Tasks page

- File: [src/tabs/roadmap/system/SystemTasksView.tsx](../../src/tabs/roadmap/system/SystemTasksView.tsx#L47) renders the current System Tasks monitor component.
- File: [src/tabs/roadmap/system/SystemTasksView.tsx](../../src/tabs/roadmap/system/SystemTasksView.tsx#L80) mounts the Asana board panel and passes `boardTeamName="Team Tasks"`, `preferBoardTeam`, and `showBoardSelector` into `AsanaProjectMirror`.
- File: [src/tabs/roadmap/system/SystemTasksView.tsx](../../src/tabs/roadmap/system/SystemTasksView.tsx#L91) keeps the task lookup panel as a separate read-only probe via `AsanaTaskInspector`.

### 2.2 Board selector and mirror

- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L82) owns the current board selector, selected project state, project fetch, task fetch, and rendered section grouping.
- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L122) fetches visible Asana projects from `/api/dev-console/asana/projects`.
- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L153) fetches one selected board through `/api/dev-console/asana/tech-automations`, passing `projectId` when selected.
- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L180) groups tasks by section for display.
- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L211) currently fan-outs extra read requests to count tasks for each visible board option.
- File: [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx#L277) renders the board selector cards.

### 2.3 Current CSS surface

- File: [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css#L1744) styles the bespoke board selector.
- File: [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css#L1771) lays out the selector grid.
- File: [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css#L1785) styles each board option card.

### 2.4 Existing read-only Asana routes

- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L399) exposes `GET /api/dev-console/asana/projects`, gated by `requireForgeReader`, with App Insights events.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L426) requests Asana project fields including `team.name`, which is what the Team Tasks selector uses.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L466) exposes `GET /api/dev-console/asana/tech-automations`, despite the route name now being a generic project mirror via `projectId`.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L510) fetches sections for the selected project.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L525) fetches incomplete tasks for each section.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js#L557) returns `{ projectName, teamName, tasks, sections }` for the selected board.

### 2.5 Existing Asana helper capabilities

- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L17) parses Asana task gids from urls or bare ids.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L62) can add a comment to a task.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L76) can create a task in a section.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L130) can fetch a single task.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L139) can fetch task stories.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L149) can fetch subtasks.
- File: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js#L284) exports the helpers used by routes and operator actions.

### 2.6 Azure `tasking-v3` discovery

- Azure lookup on 2026-06-03 found Function App `tasking-v3` in subscription `Helix Automations`, resource group `Tasking`, location `UK South`, state `Running`, default host `tasking-v3.azurewebsites.net`.
- Azure exposes function metadata for 13 HTTP-trigger functions: `EntryEndpoint`, `MessagesFunction`, `PostTimeEntry`, `RedirectApproval`, `RedirectIndividual`, `RedirectTeam`, `Update-Approval`, `UpdateATY-CWO`, `UpdateBRBO-C`, `UpdateClaim`, `UpdateCWO-BRBO`, `UpdateEndpoint`, and `Workspace`.
- The live app points all functions at compiled `tasking-v3.dll` entry points and is configured with package deployment settings. Azure is enough for metadata, routes, runtime, and deployment shape, but not enough for reliable source-code review of all functions.
- Deployment source metadata does not expose a GitHub repo URL for the live app. Use the local submodule for source review.
- App-setting names indicate Application Insights, AzureWebJobsStorage, Teams bot credentials, Clio timer credentials, and package deployment settings. Values were not inspected or recorded.

### 2.7 Local source copy

- Added `git@github.com:HelixAutomations/tasking-v3.git` as [submodules/tasking-v3](../../submodules/tasking-v3) at commit `3a4efa7216653c4c0e5e27c659ae24ac67363c62` on `main`.
- Local source files include `EntryEndpoint.cs`, `MessagesFunction.cs`, `StartClioTimer.cs`, `UpdateEndpoint.cs`, `Workspace.cs`, and the update/redirect function files matching the Azure metadata.
- The upstream repo tracks a `.env` file. Do not open, quote, or copy its contents into chat or docs. Treat any cleanup of that file as a separate repository-hygiene task.

### 2.8 `tasking-v3` system understood (cold read 2026-06-03)

- Intake: Cognito Forms POST to [EntryEndpoint.cs](../../submodules/tasking-v3/EntryEndpoint.cs) which normalises a `payload.Task[]` array and per-task HTTP-forwards to a sibling function based on `TaskType` (`Task an Individual` -> RedirectIndividual, `Task a Team` -> RedirectTeam, `Approval Task` / `Request Approval` -> RedirectApproval). Anonymous auth, synchronous in-process fan-out, no queue.
- Each `Redirect*` pulls secrets from Key Vault `helix-keys` (`sql-databaseserver-password`, `clio-mattersv1-*`, plus the assignor's personal Asana OAuth triple), reads `helix-core-data.team` for identity columns (`First, Email, Clio ID, ASANA_ID, ASANATeam_ID, ASANAPending_ID, ASANAUser_ID, Initials, ASANAClient_ID, ASANASecret, ASANARefreshToken`), refreshes the assignor's Asana token, creates the Asana task with assignee/collaborators/matter link/time estimate, then writes the row into `helix-project-data`.
- Notification side roads: [Workspace.cs](../../submodules/tasking-v3/Workspace.cs) posts an Adaptive Card into Teams via Graph using `graph-aidenteams-*` tokens, refreshes them on failure, and re-stores them in Key Vault. `EmailHelper` does Graph mail via `graph-pitchbuilderemailprovider-*`.
- Outbound: [UpdateEndpoint.cs](../../submodules/tasking-v3/UpdateEndpoint.cs) is the Asana webhook receiver. Handles `X-Hook-Secret` handshake and heartbeats, then routes events: task creation -> mark status `initial_assignment`, approval status change -> [Update-Approval.cs](../../submodules/tasking-v3/Update-Approval.cs), completion -> `UpdateBRBO-C`, section moves -> `UpdateATY-CWO` or `UpdateCWO-BRBO`, otherwise forward to a hard-coded Logic App URL with embedded signature.
- Lifecycle is encoded as Asana section transitions: AssignedToYou -> CurrentlyWorkingOn -> BeingReviewedByOthers -> Complete. `helix-project-data` mirrors that state.
- Time tracking: [StartClioTimer.cs](../../submodules/tasking-v3/StartClioTimer.cs) (`PostTimeEntry`) is a GET `?aid&mid&tid&role` redirect helper opened from Asana task links. Looks up `Initials` from team, loads that user's personal Clio creds from Key Vault (`{initials}-clio-v1-*`), refreshes their Clio token, posts a time entry, then 302s to the Clio matter activities page.
- Teams bot: [MessagesFunction.cs](../../submodules/tasking-v3/MessagesFunction.cs) routes Bot Framework activities to [BotHandler.cs](../../submodules/tasking-v3/BotHandler.cs); adaptive card invokes are forwarded to `Update-Claim`, which is currently a logging stub.
- Observations worth knowing (do not try to fix inside `tasking-v3`): all `Redirect*` and `Update*` HTTP triggers are `AuthorizationLevel.Anonymous`, secrets are pulled fresh per invocation, team-to-project gids are hard-coded (`Tech & Automation -> 1204962032378888` and a level mapping for solicitor/partner/etc.), and a Logic App URL with embedded signature is hard-coded in `UpdateEndpoint`.
- Implication: Asana is the universal truth that every other surface (SQL mirror, Teams card, Clio timer redirect) is reconciled against. That is the contract this brief preserves.

---

## 3. Plan

### 3.0 Architecture principle (parallel shadow, Asana is the edit substrate)

This is NOT an extension of `tasking-v3` and NOT a UI on top of `helix-project-data`. We build a parallel Hub-owned system that shadows the same Asana boards.

Invariants:
- Hub never reads or writes `helix-project-data` and never calls `tasking-v3` routes.
- All Hub mutations flow Hub UI -> Hub server -> Asana. Hub never speaks to its own mirror DB directly from the UI mutation path.
- Both `tasking-v3` and Hub subscribe to the same Asana webhooks. Asana supports multiple webhook subscribers, so the legacy mirror keeps working untouched while Hub builds its own mirror in parallel.
- "The edit from Asana will always be true" is the load-bearing invariant. Anything anyone changes (Hub, tasking-v3, legacy Cognito intake, the Asana web UI itself) fans out to every mirror. The cutover is therefore a matter of switching which mirror Hub reads from, not a data migration risk on the edit path.
- Cognito Forms intake stays on tasking-v3 in instalment 1. Re-pointing intake at a Hub-owned route is its own later instalment.

High-level shape:

```
Cognito ---> tasking-v3 EntryEndpoint ---> Asana ---> tasking-v3 UpdateEndpoint ---> helix-project-data  (legacy mirror, untouched)
                                                \
                                                 ---> Hub /api/system-tasks/asana-webhook ---> Hub-owned hub_tasks DB (NEW mirror)

Hub Edit Tasks UI ---> Hub server (asanaTasks.js + system-tasks routes) ---> Asana (mutation)
Hub Edit Tasks UI ---> Hub server reads ---> Hub-owned hub_tasks DB only
```

### Phase A - Hub-side discovery and Asana-as-truth contract

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Lock the cold-read of `tasking-v3` | this brief | Done on 2026-06-03 (sections 2.6 - 2.8). Refresh only if returning much later. |
| A2 | Pick the Hub mirror DB | new server config | Decide which Hub-controlled database hosts `hub_tasks` and friends. Default: Instructions DB (Hub already owns it). Explicitly NOT `helix-project-data`. |
| A3 | Lock the Asana ID model | this brief | Document the Asana ids Hub depends on: project gids per Team Tasks board, section gids per project, task gids, user gids. Hub does NOT hard-code team/level -> project gid mappings the way `tasking-v3` does; it always reads them live from the Asana API. |
| A4 | Decide identity source | new server util | Hub continues to use `team` (Instructions DB) for identity. Do NOT read `helix-core-data.team` from Hub; if a column is missing on the Hub side, add it on the Hub side. |
| A5 | Name the new write contract | new server route | Reserve `server/routes/system-tasks.js` for Hub writes. Telemetry naming convention: `SystemTasks.Asana.<Op>.{Started,Completed,Failed}` and `SystemTasks.Mirror.<Op>.{Started,Completed,Failed}`. |

Phase A acceptance:
- This brief names the Hub mirror DB and the Hub-owned table prefix.
- The Asana id model is documented at the brief level.
- The naming/telemetry contract is fixed before any code lands.

### Phase B - Board insight first (read-only Edit Tasks view, reads Asana directly)

No Hub mirror yet. The view exists to give us the bird's-eye board insight you want, while the parallel mirror catches up underneath in Phase C.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Open Edit Tasks from a board card | [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx) and [src/tabs/roadmap/system/SystemTasksView.tsx](../../src/tabs/roadmap/system/SystemTasksView.tsx) | Board card click opens the new editor for that board. Keep a way back to monitor view. |
| B2 | Add birds eye component | `src/tabs/roadmap/system/SystemTaskBoardEditorView.tsx` (NEW) | Sections render as plots. Task cards inside each plot. Read directly from the existing `/api/dev-console/asana/tech-automations?projectId=<gid>` payload until the Hub mirror lights up. |
| B3 | Structural loading and lock states | [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) | Plots reserve footprint, no layout jumps when switching boards. |

Phase B acceptance:
- Editor view opens from a board card, fully read-only.
- Every section renders, including empty ones, with task cards.
- No write controls visible yet.

### Phase C - Hub-owned Asana mirror (parallel shadow)

This is the foundation of the parallel system. After this phase, Hub has its own picture of the boards independently of `tasking-v3`.

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Create Hub mirror tables | new SQL migration | `hub_tasks`, `hub_task_sections`, `hub_task_events`, `hub_task_attachments`, `hub_task_links` in the Hub-owned DB chosen in A2. Schema follows Asana shape, not `helix-project-data` shape. |
| C2 | Add Hub Asana webhook receiver | new `server/routes/system-tasks.js` | `POST /api/system-tasks/asana-webhook` handles `X-Hook-Secret` handshake, heartbeats, task/section/story events. Writes only into `hub_tasks*`. Telemetry: `SystemTasks.Webhook.{Started,Completed,Failed}`. |
| C3 | Register Hub webhook against Asana boards | one-off operator script | Subscribe Hub URL to the same Team Tasks projects already mirrored by `tasking-v3`. Multiple subscribers are allowed; this does not disturb the legacy mirror. |
| C4 | Initial backfill | one-off operator script | For each registered project, pull current sections + incomplete tasks from Asana and seed `hub_tasks*`. Idempotent on `asana_task_gid`. |
| C5 | Switch editor reads | new editor component | Editor reads from `hub_tasks*` once the mirror catches up. Until then, fall back to the live Asana read used in Phase B. |

Phase C acceptance:
- Hub mirror tables exist in a Hub-owned DB, NOT in `helix-project-data`.
- The Hub webhook successfully completes handshake and persists at least task add, task update, section move, task complete.
- Editor view continues to render correctly when it switches its read source to the Hub mirror.
- `tasking-v3` is observed to be unaffected.

### Phase D - Hub-owned write controls (mutate Asana, watch the mirror catch up)

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Add Asana mutation helpers | [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) | Narrow helpers: `moveTaskToSection`, `updateTaskFields`, `setTaskCompleted`, `setTaskAssignee`, `setTaskDueDate`, `addTaskComment`. Each helper validates input, never accepts arbitrary Asana payloads. |
| D2 | Add Hub write endpoints | `server/routes/system-tasks.js` | One endpoint per operation. Dev-owner gated initially. Each endpoint emits `SystemTasks.Asana.<Op>.{Started,Completed,Failed}`. |
| D3 | UI mutation queue | new editor component | One in-flight mutation per task card. Card enters `pending` state, server calls Asana, server returns; UI does NOT optimistically reflect the change in the mirror. The webhook from Phase C is what surfaces the change. |
| D4 | Rollback and retry | new editor component | If Asana rejects, the pending visual reverts; if the webhook never catches up within a short window, surface a "did the change land?" affordance with a one-click refetch. |

Phase D acceptance:
- Move task between sections succeeds Hub -> Asana, and the Hub mirror reflects it via webhook (not via UI optimism).
- Failed Asana mutation rolls back visibly with a clear reason.
- Two users cannot stack writes on the same card; second attempt waits or is rejected.
- `tasking-v3` mirror remains in sync with Asana through the same edit (verifies the parallel-shadow contract).

### Phase E - Cutover and retirement of legacy mirror

Only after D has been stable for an agreed period.

| # | Change | Surface | Detail |
|---|--------|---------|--------|
| E1 | Move Cognito Forms intake | new Hub intake route | Add a Hub `POST /api/system-tasks/intake` that does today's `EntryEndpoint` job using Hub-owned identity. Re-point Cognito to it. |
| E2 | Unsubscribe `tasking-v3` from Asana | operator script | Remove `tasking-v3` webhook subscriptions once Hub is proven. |
| E3 | Deprecate `helix-project-data` mirror | data ops | Stop writing to `helix-project-data`. Decide retention/archival separately. |
| E4 | Retire `tasking-v3` Function App | Azure | Only after E1-E3, only with explicit go-ahead, only via the production deploy guard menu. |

Phase E acceptance:
- Cognito intake creates tasks in Asana via Hub, not via `tasking-v3`.
- `tasking-v3` no longer receives webhooks and no new rows land in `helix-project-data`.
- The legacy app is either disabled or removed under guardrails.

---

## 4. Step-by-step execution order

1. Phase A: lock the Hub mirror DB choice, the Asana id model, the identity source, and the write contract naming in this brief. No code.
2. Phase B: ship the read-only Edit Tasks view reading directly from the existing `/api/dev-console/asana/tech-automations?projectId=...` payload. Confirm it does not touch `helix-project-data`.
3. Phase C: add `hub_tasks*` migration, the `system-tasks.js` Asana webhook receiver, the one-off register-subscriptions script, and the backfill. Verify `tasking-v3` continues to see the same Asana events.
4. Phase D: add narrow Asana mutation helpers, dev-owner-gated Hub write endpoints, the UI mutation queue, and the rollback/retry path. Edit the same Asana board from Hub and confirm both mirrors update.
5. Phase E: only after D is stable, take over Cognito intake, unsubscribe `tasking-v3` from Asana, and retire the legacy app under the production deploy guard menu.
6. Log each shipped phase with `npm run changelog:add`. Do not promote between phases without confirmation that the prior phase's acceptance criteria are met.

---

## 5. Verification checklist

**Phase A:**
- [ ] `tasking-v3` functions and dependencies are listed without mutating Azure.
- [ ] Existing Asana write helpers and missing helpers are documented.
- [ ] Route permissions for read versus write are explicitly chosen.

**Phase B:**
- [ ] Clicking a System Tasks board card opens `Edit Tasks` for that board.
- [ ] The editor shows every section returned by `/api/dev-console/asana/tech-automations?projectId=...`, including empty sections.
- [ ] Task cards show name, assignee, due date, and a stable task gid or link affordance.
- [ ] Layout does not jump when task data loads or when the user switches boards.

**Phase C:**
- [ ] Moving a task to another section updates Asana and refreshes the board.
- [ ] Failed moves roll back visually and show the failure reason.
- [ ] Completing/reopening a task updates Asana and either removes or visibly marks the card according to product choice.
- [ ] App Insights events exist for every mutation: `SystemTasks.AsanaTaskMove.Started/Completed/Failed`, plus equivalents for create, update, complete, comment.
- [ ] Focused route smoke passes for read and one safe mutation path.

**Phase D:**
- [ ] Task detail shows stories, subtasks, warnings, and custom fields.
- [ ] Matter/Clio context displays found, missing, and error states distinctly.
- [ ] No raw PII is logged in telemetry or chat output.

---

## 6. Open decisions (defaults proposed)

1. **Where should write endpoints live?** Default: keep first write endpoints under `server/routes/dev-console.js` only while dev-owner gated. Promote to a dedicated `server/routes/system-tasks.js` once non-dev users are in scope.
2. **Drag/drop versus click-to-move first?** Default: implement click-to-move or menu move first, then drag/drop once the mutation queue is stable. If adding drag/drop, check existing dependencies before installing `@dnd-kit`.
3. **Source of truth?** Default: Asana remains the source of truth for task state in the first pass. Hub stores no task mirror table until latency, audit, or history requires it.
4. **Clio notes behaviour?** Default: show Clio/matter context read-only first. Any Clio note write or attachment flow needs a separate explicit approval path.
5. **Completed tasks visibility?** Default: keep the board scoped to incomplete tasks like the current mirror, with a later toggle for completed/history.

---

## 7. Out of scope

- Replacing Asana as the canonical task store in the first implementation.
- Production deploy or production runtime mutation.
- Mutating Azure Function App `tasking-v3` during discovery.
- Automatic background sync or scheduler work.
- Bulk task moves, bulk completion, or multi-card concurrent mutation in the first writable phase.
- Clio write-back until the detail/read path and edge cases are proven.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/system/SystemTasksView.tsx](../../src/tabs/roadmap/system/SystemTasksView.tsx) - Tasks page entry point and board selector mount.
- [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx) - Current board selector and read-only mirror. May be split once editor exists.
- `src/tabs/roadmap/system/SystemTaskBoardEditorView.tsx` (NEW) - Birds eye board editor view.
- [src/tabs/roadmap/parts/AsanaTaskInspector.tsx](../../src/tabs/roadmap/parts/AsanaTaskInspector.tsx) - Existing task detail payload consumer, likely reusable for side panel details.
- [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) - Current System Tasks, board selector, and Asana mirror styles.

Server:
- [server/routes/dev-console.js](../../server/routes/dev-console.js) - Existing read-only Asana project and mirror routes. Candidate for first guarded write routes.
- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) - Existing Asana task helper primitives and place for narrow move/update helpers.
- `server/routes/system-tasks.js` (OPTIONAL NEW) - Candidate route once this is promoted beyond dev-console.

Scripts / docs:
- [docs/notes/TASKS_BOARD_EDITOR_BIRDSEYE_ASANA_CONTROL.md](TASKS_BOARD_EDITOR_BIRDSEYE_ASANA_CONTROL.md) - This brief.
- [logs/changelog.md](../../logs/changelog.md) - Entry per shipped phase.

Azure to inspect next:
- Function App `tasking-v3` - read-only discovery target before finalising write semantics.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: tasks-board-editor-birdseye-asana-control
verified: 2026-06-03
branch: main
touches:
  client:
    - src/tabs/roadmap/system/SystemTasksView.tsx
    - src/tabs/roadmap/parts/AsanaProjectMirror.tsx
    - src/tabs/roadmap/parts/AsanaTaskInspector.tsx
    - src/tabs/roadmap/system/SystemTaskBoardEditorView.tsx
    - src/tabs/roadmap/Activity.css
  server:
    - server/routes/dev-console.js
    - server/utils/asanaTasks.js
    - server/routes/system-tasks.js
  submodules:
    - submodules/tasking-v3
depends_on: []
coordinates_with:
  - agent-suggestions-inbox-in-my-helix
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - dev-loop-cold-boot-performance-overhaul
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - helix-software-dev-productivity-control-plane
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
conflicts_with: []
```

---

## 9. Gotchas appendix

- The route name `/api/dev-console/asana/tech-automations` is now misleading. It accepts `projectId` and acts as a generic selected-project mirror. Do not design the new editor around Tech & Automations as a special board.
- `AsanaProjectMirror` currently does multiple read calls to count every board option. If the Team Tasks board list grows, move counts into a server summary endpoint rather than increasing client fan-out.
- Write controls must not use `requireForgeReader`. Keep read access broad enough for monitoring, but write access should start dev-owner gated and only widen after audit behaviour exists.
- Moving tasks between sections should wait for Asana confirmation before showing a settled state. Optimistic movement is fine only while visibly pending and reversible.
- The Azure `tasking-v3` function app may already encode task concepts that should shape naming, edge cases, and Clio linking. Inspect it before inventing a parallel model.