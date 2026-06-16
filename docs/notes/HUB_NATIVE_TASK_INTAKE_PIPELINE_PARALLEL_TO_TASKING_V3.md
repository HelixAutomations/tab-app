# Hub-native task intake pipeline (parallel to tasking-v3)

> **Purpose of this document.** Self-contained brief that any future agent can pick up cold. Captures the why, the current state of tasking-v3, the schema we are introducing in Hub, the intake + processor + state-machine surface area, and the cutover plan. Phases are independently shippable; do not skip ahead.
>
> **Verified:** 2026-06-04 against branch `main`.

---

## 1. Why this exists (user intent)

User quote (2026-06-04): "the idea was to stand up a hub backed system, using the same asana boards so that it doesnt change anything in that way, but the intake and processing can come into hub. you see? as a parallel. this includes the tables and things - should be future proof and include other forms in hub as tasks since users can create tasks via forms and things, you see that?"

Addendum (2026-06-16): this project now starts as a top-level `Tasks` tab rather than a System subpage. The first user-facing loop is deliberately narrow: Tech Idea and Tech Problem intake lands on a Hub-owned tasking page, with one later AI mode that checks whether the ticket already exists, is open, or is similar to existing tech ideas/problems. The privacy gate belongs before the AI call in the form experience as a visible team reminder not to include client details. The route must not rely on post-hoc sanitisation because by then content has already crossed the boundary. Asana remains in the page as mirror and controls, but Hub owns the lifecycle once proven. Home To Do receives only human pickup actions such as triage, test, review, or verify, not the whole backlog.

Current first slice (2026-06-16):
- New top-level `tasks` tab in the app shell.
- New `src/tabs/tasks/TasksHome.tsx` page showing recent Tech Idea and Tech Problem rows from `/api/tech-tickets/ledger`.
- Reuses the existing Asana board mirror and Asana task inspector as adapter panels.
- System Projects promotes this brief as the Hub Tasks project so the context is visible from System > Projects.
- No DB-backed Hub task schema has been created yet. The durable `OpsTaskRequests` direction below remains the next major phase.

What this is:
- A Hub-owned intake + processor pipeline that mirrors the workflow contract of `submodules/tasking-v3/` end-to-end (team lookup, optional Clio task on matter, Asana task in the right project with followers + approver, Teams adaptive card to assignee, email notification, state transitions for approval / claim / request-type changes).
- Same Asana boards continue to be the board of record. Same `team` table is the source of identity. We do not move data away from Asana or Clio.
- Forms-agnostic: the bench composer is one intake source; the Cognito tasking form is another; future Hub-native forms (CCL request, ops request, complaints, undertakings) become additional adapters that all land in the same `task_request` table and pass through the same processor.

What this is NOT:
- Not a rewrite of tasking-v3 in place. Tasking-v3 remains live and untouched until cutover. We run Hub pipeline in shadow / dev-preview first.
- Not a migration of historical tasks. Pipeline owns new requests from go-live forward. Historical data stays where it is.
- Not a UI overhaul of the System Tasks bench. Bench gains modest affordances (request-type, assignee picker, request state drawer) but its visual shell stays.

---

## 2. Current state — verified findings

### 2.1 tasking-v3 (Azure Functions, C#) — the existing workflow

- Entry: [submodules/tasking-v3/EntryEndpoint.cs](../../submodules/tasking-v3/EntryEndpoint.cs) L49 to L141. HTTP POST anonymous. Cognito Forms posts the IncomingPayload. Switch on `taskItem.TaskType` routes to one of: `redirectindividual`, `redirectteam`, `redirectapproval` (also for `Request Approval`).
- Payload shape: same file L143 to L243. `Task[]` (one entry per task), each with `Assignee`, `Task`, `TaskType`. Notable fields: `AssigneeFirstName`, `AssigneeTeam`, `AssigneeLevel`, `ApproverFirstName`, `Collaborators[]`, `TaskName`, `TaskDescription`, `MatterLookup{Id,Label}`, `DueDate`, `TimeEstimate`, `Priority`, `IsYourApprovalRequiredBeforeTheTaskIsMarkedAsComplete`, `Attachments[]`.
- Per-type redirect: [submodules/tasking-v3/RedirectIndividual.cs](../../submodules/tasking-v3/RedirectIndividual.cs) is the reference. Steps:
  1. Pull secrets from Key Vault `helix-keys`: `sql-databaseserver-password`, `clio-mattersv1-clientid`, `clio-mattersv1-secret`, `clio-mattersv1-refreshtoken`.
  2. Lookup assignee in `helix-core-data.team` by `First` for `Clio ID`, `ASANA_ID`, `ASANATeam_ID`, `ASANAPending_ID`, `ASANAUser_ID`, `Initials`, `Email`.
  3. Lookup assignor in `team` for `ASANAClient_ID`, `ASANASecret`, `ASANARefreshToken`, `ASANAUser_ID`, `ASANA_ID` (assignor's personal project).
  4. Approver currently overridden to assignor (note in source). Collaborators looked up to Asana user ids.
  5. If matter_label present: refresh generic Clio token, search matter, refresh assignee-specific Clio token (`<initials>-clio-v1-clientid/secret/refreshtoken`), create Clio task on matter assigned to assignee.
  6. Create Asana task in assignor's project, assigned to assignee, followers include collaborators + approver, due_on + priority + notes.
  7. Persist mapping in `helix-project-data` (table not fully traced; assume one row per request linking asana_task_id + clio_task_id + state).
  8. Email helper (`EmailHelper` via DI) sends notification.
- Updates: [submodules/tasking-v3/UpdateEndpoint.cs](../../submodules/tasking-v3/UpdateEndpoint.cs), plus `Update-Approval.cs`, `Update-Claim.cs`, `UpdateATY-CWO.cs`, `UpdateBRBO-C.cs`, `UpdateCWO-BRBO.cs`. State-machine transitions invoked from Teams adaptive card actions handled by `BotHandler.cs` / `MessagesFunction.cs`.
- Teams bot wiring: `BotHandler.cs`, `MessagesFunction.cs`, `Workspace.cs` for adaptive card delivery + button callbacks.
- Email path: `EmailHelper.cs` + `EMAIL_INTEGRATION_GUIDE.md`, `EMAIL_QUICK_REFERENCE.md`, `EMAIL_SETUP.md`, `EMAIL_IMPLEMENTATION_SUMMARY.md`.
- Submodule is read-only for us. Helix incorporation date passcode would be required to mutate. We do not modify tasking-v3 in this project.

### 2.2 Hub bench (Phase 1 already shipped)

- Reader + write-through routes: [server/routes/system-tasks.js](../../server/routes/system-tasks.js). Dev-preview gated (LZ + AC). Telemetry `SystemTasks.Asana.<Op>.{Started,Completed,Failed}`. POST routes already shipped for comment, complete/uncomplete, move, rename, due, notify, and (newest) `POST /asana/task` bare create.
- Mirror: [server/utils/asanaTasksMirror.js](../../server/utils/asanaTasksMirror.js). Synthetic operator `system-tasks-mirror-sync`. Default project gid `1204962032378888` (Tech & Automations).
- Asana wrapper: [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js). `resolveAsanaAccessToken({initials})` uses `SQL_CONNECTION_STRING` against helix-core-data team table.
- Bench UI: [src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx) has a name + due composer per column. No assignee, no workflow type, no matter. This is the surface that grows into the bench-intake adapter.
- Content guard: [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js) + [.github/instructions/asana-task-content-guard.instructions.md](../../.github/instructions/asana-task-content-guard.instructions.md). All readers go through `assertOperatorReadConsent({operatorConsent, operatorActor}, '<callerLabel>')`. Logs use `safeTaskSummary` only.

### 2.3 Cognito tasking form (today's user-facing intake)

- Iframe: [src/CustomForms/Tasking.tsx](../../src/CustomForms/Tasking.tsx) uses `https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/90`.
- Home quick action: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) at the "Create a Task" entry.
- Cognito posts to `https://tasking-v3.azurewebsites.net/api/EntryEndpoint` (anonymous Function trigger). Keep that pointer until Phase D cutover.

### 2.4 Existing reusable Hub primitives

- Teams DM helper: `sendCardToDM` in [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js) (used today by `POST /api/system-tasks/asana/task/:gid/notify`).
- Clio token refresh: search for `clio-v1-refreshtoken` in `server/utils/**`. There is an existing helper for per-user Clio access tokens to be reused, not re-implemented.
- Mail: existing Graph mail helpers in `server/utils/mail*` and `server/routes/mail*`. Reuse for the email leg.
- SQL helpers: `server/utils/sql*.js`. Project-data writes use `SQL_PROJECT_CONNECTION_STRING` (verify name on first read).

---

## 3. Plan

### Phase A: schema + canonical intake contract (foundation, ship first)

Goal: stand up the `task_request` table and a write-only Hub-owned ingress that captures intake without yet fanning out side effects. Dev-preview only. No Asana / Clio / Teams / email writes yet.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New tables in `helix-project-data` | `scripts/init-task-intake-tables.mjs` (NEW) | DDL for `task_request`, `task_request_state_transition`, `task_request_attachment`, `task_request_external_ref`. See section 3.A DDL. Idempotent. |
| A2 | Canonical intake route | [server/routes/task-intake.js](../../server/routes/task-intake.js) (NEW) | `POST /api/tasks/intake`. Validates payload, writes `task_request` row + attachments + initial state transition, returns `{request_id}`. Dev-preview gated. Telemetry `Tasks.Intake.<source>.{Started,Completed,Failed}` + Duration. |
| A3 | Mount route | [server.js](../../server.js) | Register the new router. |
| A4 | Replay-safe read | same file as A2 | `GET /api/tasks/intake/:request_id` returns the row + transitions + external refs. Dev-preview gated. |
| A5 | Bench composer + Cognito form continue to work unchanged | n/a | No-op for end users. Both still go through their existing pipes. |

Phase A acceptance:
- `POST /api/tasks/intake` accepts a synthetic dev payload from curl and writes one `task_request` row + one `task_request_state_transition` (status `received`).
- `GET /api/tasks/intake/:id` reads it back.
- No tasking-v3 behaviour changed.
- App Insights shows `Tasks.Intake.synthetic.{Started,Completed}`.

### Phase B: processor + adapters (fan-out, dev-preview only)

Goal: when a `task_request` lands, optionally run the same fan-out tasking-v3 does, gated by an opt-in flag so existing Cognito traffic is still owned by tasking-v3. Bench composer becomes the first adapter that opts in.

B1. Team lookup helper

`server/utils/teamLookup.js` (NEW). Pure function: given a first name, returns `{clioId, asanaId, asanaTeamId, asanaPendingId, asanaUserId, initials, email}` from `helix-core-data.team`. Cached for 5 minutes. Reused by every processor leg.

B2. Clio task helper

`server/utils/clioTasks.js` (NEW). `createClioTaskOnMatter({assigneeInitials, matterLabel, taskName, description, dueAt, priority})` returns `{clioTaskId, matterId}` or `{skipped: true, reason}` if no matter. Wraps the two-token-refresh dance from `RedirectIndividual.cs`. Reuses existing per-user Clio token helper (see 2.4).

B3. Processor

`server/processors/taskIntakeProcessor.js` (NEW). Single entry point `processTaskRequest({requestId, logger})` that:
1. Loads `task_request` row.
2. Calls team lookup for assignee, assignor, approver, collaborators.
3. If `matter_label`: calls B2, records `clio_task_id` in `task_request_external_ref`.
4. Calls Asana createTask in assignor's project with followers, records `asana_task_id` + section.
5. Sends Teams adaptive card to assignee via `sendCardToDM` with claim / decline / approve verbs.
6. Sends email via existing Graph mail helper.
7. Each leg writes its own `task_request_state_transition` row with `leg`, `outcome`, `error_message`, `duration_ms`.
8. Telemetry per leg `Tasks.Processor.<Leg>.{Started,Completed,Failed}`.
9. Each leg is independently retryable.

B4. Bench composer to intake adapter

- [server/routes/system-tasks.js](../../server/routes/system-tasks.js): change `POST /asana/task` so that when the request body includes `useIntake: true` (sent by the bench), it POSTs to `/api/tasks/intake` internally then triggers `processTaskRequest` synchronously. When `useIntake` is false, behaviour stays as-is (bare Asana create).
- [src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx): composer grows minimal additional fields: workflow_type select (default `Task an Individual`), assignee first-name input (with later autocomplete), matter label (optional). Defaults send `useIntake: true`.
- An "Open via Tasking form" link kept alongside, pointing to the Cognito form, for any operator who wants the full form.

B5. workflow_type adapters

Inside the processor, `workflow_type` drives behaviour:
- `Task an Individual`: full fan-out as above.
- `Task a Team`: followers expanded to team members; assignee left null until claim.
- `Approval Task` / `Request Approval`: approver receives card, assignee is informed.
- Future request-type transitions (ATY to CWO, etc.) live as separate `PATCH /api/tasks/:id/transition` route in Phase C.

Phase B acceptance:
- Bench composer "create" with `workflow_type=Task an Individual`, assignee `Luke`, no matter, produces: one `task_request` row, one Asana task in LZ's personal project assigned to Luke, one Teams card to Luke, one email to Luke, four `task_request_state_transition` rows (received, asana_created, teams_sent, email_sent).
- Same again with a real matter label produces a Clio task on that matter.
- Cognito form traffic unchanged (still flows to tasking-v3).

### Phase C: request-state surface + transitions

- `PATCH /api/tasks/:request_id/transition` accepting `{action: 'claim'|'approve'|'decline'|'reassign'|'request_type_change', ...}`. Writes transition row, updates Asana (move section / assign), updates Clio (status), notifies via Teams + email.
- Bench gains a request drawer: shows intake source, all external refs (Asana / Clio / Teams card link), state log, manual retry button per failed leg.
- Teams adaptive card POSTs back to this endpoint with operator consent context.

### Phase D: Cognito cutover

- Add a Hub-hosted intake endpoint that Cognito can post to (validates Cognito signature).
- Flip Cognito form's webhook from `tasking-v3.azurewebsites.net/api/EntryEndpoint` to `<hub>/api/tasks/intake/cognito`.
- Run for a defined burn-in window with both pipelines monitored.
- Retire tasking-v3 functions (leave submodule for read-only history).

### Phase E: multi-form adapter pattern

- Generic adapter contract: a Hub form registers itself with `registerTaskIntakeForm({id, workflow_type, assigneeResolver, attachmentExtractor})`.
- First additional forms wired: CCL request, ops request, complaints, undertakings.

---

## 3.A Phase A DDL (helix-project-data)

```sql
CREATE TABLE dbo.task_request (
  request_id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  source                NVARCHAR(64)    NOT NULL,
  source_external_id    NVARCHAR(128)   NULL,
  workflow_type         NVARCHAR(64)    NOT NULL,
  assignor_initials     NVARCHAR(8)     NULL,
  assignor_first_name   NVARCHAR(64)    NULL,
  assignee_first_name   NVARCHAR(64)    NULL,
  assignee_team         NVARCHAR(64)    NULL,
  assignee_level        NVARCHAR(64)    NULL,
  approver_first_name   NVARCHAR(64)    NULL,
  collaborators_csv     NVARCHAR(512)   NULL,
  matter_label          NVARCHAR(256)   NULL,
  task_name             NVARCHAR(256)   NOT NULL,
  task_description      NVARCHAR(MAX)   NULL,
  priority              NVARCHAR(32)    NULL,
  due_date              DATE            NULL,
  time_estimate_minutes INT             NULL,
  approval_required     BIT             NOT NULL DEFAULT 0,
  status                NVARCHAR(32)    NOT NULL DEFAULT 'received',
  created_at            DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at            DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by            NVARCHAR(64)    NOT NULL
);
CREATE INDEX IX_task_request_status ON dbo.task_request (status, created_at DESC);
CREATE INDEX IX_task_request_source ON dbo.task_request (source, created_at DESC);

CREATE TABLE dbo.task_request_state_transition (
  transition_id  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  request_id     UNIQUEIDENTIFIER     NOT NULL FOREIGN KEY REFERENCES dbo.task_request(request_id),
  leg            NVARCHAR(32)         NOT NULL,
  outcome        NVARCHAR(16)         NOT NULL,
  message        NVARCHAR(1024)       NULL,
  duration_ms    INT                  NULL,
  created_at     DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by     NVARCHAR(64)         NOT NULL
);
CREATE INDEX IX_task_request_transition_request ON dbo.task_request_state_transition (request_id, created_at DESC);

CREATE TABLE dbo.task_request_attachment (
  attachment_id  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  request_id     UNIQUEIDENTIFIER     NOT NULL FOREIGN KEY REFERENCES dbo.task_request(request_id),
  name           NVARCHAR(256)        NOT NULL,
  content_type   NVARCHAR(128)        NULL,
  size_bytes     BIGINT               NULL,
  external_url   NVARCHAR(1024)       NULL,
  created_at     DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.task_request_external_ref (
  ref_id         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  request_id     UNIQUEIDENTIFIER     NOT NULL FOREIGN KEY REFERENCES dbo.task_request(request_id),
  system         NVARCHAR(32)         NOT NULL,
  ref_type       NVARCHAR(64)         NOT NULL,
  ref_value      NVARCHAR(256)        NOT NULL,
  created_at     DATETIME2            NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_task_request_external_ref_request ON dbo.task_request_external_ref (request_id);
CREATE INDEX IX_task_request_external_ref_lookup  ON dbo.task_request_external_ref (system, ref_type, ref_value);
```

Status vocabulary: `received`, `processing`, `active`, `claimed`, `approved`, `declined`, `completed`, `failed`.
`leg` vocabulary: `intake`, `team_lookup`, `clio`, `asana`, `teams`, `email`, `transition`.
`outcome` vocabulary: `started`, `completed`, `failed`, `skipped`.
`system` / `ref_type` examples: `asana / task_gid | project_gid | section_gid`, `clio / clio_task_id | matter_id`, `teams / card_activity_id`, `email / message_id`.

---

## 4. Step-by-step execution order

1. A1: write `scripts/init-task-intake-tables.mjs`, run it against helix-project-data (dev). Verify table existence.
2. A2 + A3 + A4: implement intake route + mount + read-back. Add canonical payload validator. Telemetry. Content-guard discipline applies, never log raw `task_description`.
3. A5: smoke test the route with curl; confirm rows.
4. A changelog + commit.
5. B1: team lookup helper.
6. B2: Clio task helper (reuses existing per-user Clio token primitive).
7. B3: processor with the four legs (Asana, Clio, Teams, email). Each leg behind try/catch, each writes a state transition row.
8. B4: bench composer adapter (server + UI fields).
9. B5: workflow_type branching.
10. B changelog + commit. Run end-to-end with a real LZ to Luke "Task an Individual" inside dev-preview.
11. C: transitions route + bench drawer.
12. D: Cognito cutover (operator decision required).
13. E: additional form adapters.

---

## 5. Verification checklist

Phase A:
- [ ] `init-task-intake-tables.mjs` runs idempotently (second run = zero changes).
- [ ] `curl POST /api/tasks/intake` with synthetic dev payload returns `{request_id}`.
- [ ] Row visible via `GET /api/tasks/intake/:id` with one transition (`intake/started` + `intake/completed`).
- [ ] App Insights: `Tasks.Intake.synthetic.{Started,Completed}` + Duration.
- [ ] No regression to existing bench routes (smoke move/complete/comment/notify).
- [ ] Cognito form still works end-to-end through tasking-v3.

Phase B:
- [ ] Bench composer with `Task an Individual` to `Luke` (no matter) creates Asana task in LZ project, Teams card, email, 4 transitions.
- [ ] Same with matter label also creates Clio task.
- [ ] Failed Clio leg leaves Asana/Teams/email intact and writes one failed transition + Telemetry `Tasks.Processor.Clio.Failed`.
- [ ] Bench composer with `useIntake=false` still does bare Asana create.

Phase C:
- [ ] Claim transition from Teams card moves Asana section + writes transition row.
- [ ] Request drawer shows all external refs + state log + retry button.

---

## 6. Open decisions (defaults proposed)

1. Where do tables live? **DECIDED (Phase A): Instructions DB** (alongside `OpsAsanaProjects`/`Sections`/`Tasks`), not `helix-project-data`. Rationale: Hub already houses operational state in Instructions DB; one connection + one backup story; no cross-DB joins needed because Asana/Clio/Teams/email are all external systems. Table names use the existing `Ops*` convention: `OpsTaskRequests`, `OpsTaskRequestTransitions`, `OpsTaskRequestAttachments`, `OpsTaskRequestExternalRefs`. tasking-v3 keeps writing to its own project-data tables in parallel; the two pipelines never read each other's state.
2. Synchronous vs queued processor? Default: synchronous in Phase B (process inside the intake request, return after fan-out). Rationale: simplest to reason about; bench creates are single-user; can move to queued in Phase C if latency hurts.
3. Auth model for the canonical intake route? Default: dev-preview gate (LZ + AC) for Phase A/B, plus a signed Cognito-only adapter in Phase D. Rationale: keep blast radius small until burn-in.
4. Bench composer fallback when `useIntake` fails? Default: fail closed, surface the error in the composer, do not silently fall back to bare Asana create. Rationale: silent fallback creates two divergent records of truth.
5. Approver-as-assignor override (current tasking-v3 behaviour). Default: preserve for parity in Phase B. Rationale: deliberate audit of approver logic belongs in Phase C, not now.

---

## 7. Out of scope

- Replacing the Cognito form UI with a Hub-native form (Phase E candidate).
- Migrating historical tasking-v3 records into `task_request`.
- Removing tasking-v3 submodule before Phase D burn-in passes.
- Touching tasking-v3 source code (submodule is read-only here without the access key).
- Adding new Teams adaptive card designs, reuse what tasking-v3 ships; if a redesign is needed, stash separately.
- Changing the System Tasks bench visual shell.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx): Phase B4: composer grows fields + sends `useIntake`.
- [src/CustomForms/Tasking.tsx](../../src/CustomForms/Tasking.tsx): Phase D pointer flip; otherwise untouched.

Server:
- [server/routes/system-tasks.js](../../server/routes/system-tasks.js): Phase B4 adapter.
- `server/routes/task-intake.js` (NEW Phase A): canonical ingress.
- `server/utils/teamLookup.js` (NEW Phase B1).
- `server/utils/clioTasks.js` (NEW Phase B2).
- `server/processors/taskIntakeProcessor.js` (NEW Phase B3).
- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js): reused.
- [server/utils/asanaTasksMirror.js](../../server/utils/asanaTasksMirror.js): reused (mirror refresh after Asana leg).
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js): reused for Teams leg.
- [server.js](../../server.js): Phase A3 mount.

Scripts / docs:
- `scripts/init-task-intake-tables.mjs` (NEW Phase A1): DDL bootstrap.
- [logs/changelog.md](../../logs/changelog.md): entry per phase.

Reference (read-only):
- [submodules/tasking-v3/EntryEndpoint.cs](../../submodules/tasking-v3/EntryEndpoint.cs)
- [submodules/tasking-v3/RedirectIndividual.cs](../../submodules/tasking-v3/RedirectIndividual.cs)
- [submodules/tasking-v3/RedirectTeam.cs](../../submodules/tasking-v3/RedirectTeam.cs)
- [submodules/tasking-v3/RedirectApproval.cs](../../submodules/tasking-v3/RedirectApproval.cs)
- [submodules/tasking-v3/Update-Approval.cs](../../submodules/tasking-v3/Update-Approval.cs)
- [submodules/tasking-v3/Update-Claim.cs](../../submodules/tasking-v3/Update-Claim.cs)
- [submodules/tasking-v3/EmailHelper.cs](../../submodules/tasking-v3/EmailHelper.cs)

### Stash metadata (REQUIRED, used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-native-task-intake-pipeline-parallel-to-tasking-v3
verified: 2026-06-04
branch: main
touches:
  client:
    - src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx
    - src/CustomForms/Tasking.tsx
  server:
    - server/routes/task-intake.js
    - server/routes/system-tasks.js
    - server/processors/taskIntakeProcessor.js
    - server/utils/teamLookup.js
    - server/utils/clioTasks.js
    - server/utils/teamsNotificationClient.js
    - server/utils/asanaTasks.js
    - server/utils/asanaTasksMirror.js
    - server.js
    - scripts/init-task-intake-tables.mjs
  submodules: []
depends_on: []
coordinates_with:
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-ia-ld-undertaking-complaint-flow
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - clio-token-refresh-shared-primitive
  - server-mail-send-helper-extraction
  - retire-helix-keys-proxy-and-add-form-route-preflight
conflicts_with: []
```

---

## 9. Gotchas appendix

- Submodule is read-only. Never `git push` against `submodules/tasking-v3`. Read-only inspection only.
- Content guard discipline. Anything that fetches Asana / Clio / Teams / mail content for client matters must follow [.github/instructions/asana-task-content-guard.instructions.md](../../.github/instructions/asana-task-content-guard.instructions.md). Logs and telemetry use safe summaries only, never raw `task_description`, matter narrative, or attendee notes.
- No em or en dashes in any code, comment, changelog entry, or chat reply. Use full stops, commas, colons, or parentheses.
- `approver_first_name` override: `RedirectIndividual.cs` overrides approver to assignor regardless of input. Preserve for Phase B parity. Re-decide in Phase C.
- Per-user Clio tokens live in Key Vault as `<initials>-clio-v1-clientid/secret/refreshtoken`. There is already a Hub-side helper that knows how to refresh these. Find and reuse it before writing a second one (see stash brief `clio-token-refresh-shared-primitive`).
- `SQL_PROJECT_CONNECTION_STRING` vs `SQL_CONNECTION_STRING`: verify the env var name on first read; tasking-v3 builds the string from `sql-databaseserver-password`. Hub uses managed identity or connection string env var. Do not paste a raw password into the codebase.
- Bench "Unsectioned" pseudo-section: Asana refuses tasks created without a real section. The bench composer is already gated against `gid === 'unsectioned'`. Keep that gate when the composer grows new fields.
- Mirror refresh after Asana leg: when the processor creates the Asana task, call `refreshTask` from `asanaTasksMirror` before returning so the bench shows the new task on the next read without a full re-sync.
- Dev-preview gate: use `requireDevPreview` (LZ + AC initials or lz@/ac@helix-law.com emails) on every Phase A/B route. Do not loosen until after Phase D burn-in.
- State machine: `received` to `processing` to `active` to `claimed` to `approved`/`declined` to `completed` or `failed`. Failures land in `failed` with a row in `task_request_state_transition` describing which leg failed. Retries are explicit (Phase C button), not automatic.
- Telemetry: `Tasks.Intake.<source>.{Started,Completed,Failed}` for the intake route. `Tasks.Processor.<Leg>.{Started,Completed,Failed}` for each fan-out leg. Always emit Duration metric.
- Cognito payload differs per form: when wiring future forms, write an adapter that normalises into the canonical `task_request` shape; do not branch the processor on form id.
