# System Tasks Hub-side mirror (read replacement + write-through)

> **Purpose.** Self-contained brief any future agent can pick up cold. Phase 1 is the snappiness foundation (SQL-backed reads + write-through). Phases 2-4 are independent layers on top of it.
>
> **Verified:** 2026-06-04 against branch `main`.

---

## 1. Why this exists (user intent)

The System > Tasks board editor ("bench") is the front door of the Hub-owned write surface over Asana. Writes go Hub UI -> Hub server -> Asana, but reads still hit Asana live via `/api/dev-console/asana/tech-automations` with a 120s in-memory cache. Every fresh board load incurs Asana RTT (~500-1500ms).

User quote: "lets make a start on that ... instructions db ... we want close to realtime please, the faster and snappier the better. i want something truly next level snappy and clean and to the point."

This brief stands up a Hub-side SQL mirror so:
- Reads come from our own DB (~10-30ms vs 500-1500ms today).
- Hub mutations write-through to the mirror so an operator's own changes feel instant.
- A short-interval background sync catches edits made directly in Asana by someone else.

Out of scope: AsanaProjectMirror in the Roadmap tab, mirroring stories/subtasks, Hub-only fields, SSE push, Asana webhooks, widening beyond LZ+AC dev preview.

---

## 2. Current state - verified findings

### 2.1 Read path (Asana live + in-memory cache)

- Route: [server/routes/dev-console.js](../../server/routes/dev-console.js#L466) `GET /api/dev-console/asana/tech-automations`, gate `requireForgeReader` (LZ + AC).
- Cache: `asanaProjectMirrorCache` Map, 120s TTL, key `${initials}::${projectId}` (around L365).
- Response shape (around L509-566):
  - `{ success, projectId, projectName, teamName, tasks[], sections[], generatedAt, cached? }`
  - task: `{ gid, name, assignee, dueOn, createdAt, url, sectionGid, section }` (no `completed` because tasks are fetched with `completed_since=now`).
  - section: `{ gid, name, count }`, plus a synthetic `{ gid: 'unsectioned' }` row when any task has no membership.
- Asana fetch: `fetchAsanaCollection(...)` paginates up to 20 pages of 100 tasks.
- Client caller: [src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx#L232) - fetches on mount, refetches after every mutation via `refetchToken`.

### 2.2 Write surface (Hub passthrough)

- Routes: [server/routes/system-tasks.js](../../server/routes/system-tasks.js), gate `requireDevPreview` (LZ + AC).
- Telemetry pattern: `SystemTasks.Asana.<Op>.<Lifecycle>` via `withAsana(req, res, op, handler)` at L54-71.
- Five mutations:
  - POST `/asana/task/:gid/section` (L91) -> `moveTaskToSection` (MoveSection)
  - POST `/asana/task/:gid/complete` (L104) -> `setTaskCompleted` (SetCompleted)
  - PATCH `/asana/task/:gid` (L115) -> `updateTaskFields` (UpdateFields)
  - POST `/asana/task/:gid/comment` (L125) -> `addCommentToTask` (AddComment)
  - POST `/asana/task/:gid/notify` (L253) -> composite getTask + Teams DM (NotifyDM)

### 2.3 Asana helper + content guard

- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) - `normaliseTask` (L164-210), `getTask`, all reads guarded by `assertOperatorReadConsent`.
- [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js) - `assertOperatorReadConsent({ operatorConsent, operatorActor }, label)` throws 403 if missing. `safeTaskSummary(task)` returns structural-only `{ gid, sectionGid, projectGid, assigneeGid, followerCount, dueOn, completed, hasName, hasNotes }` - the only representation safe to log.
- Bypass env (never commit set): `ASANA_DEV_BYPASS_TASK_GUARD=1`.

### 2.4 DB connection pattern

- Pool factory: [server/utils/db.js](../../server/utils/db.js#L488) exports `{ sql, getPool, withRequest }`.
- Instructions DB connection string env: `INSTRUCTIONS_SQL_CONNECTION_STRING`. Local dev uses `<REDACTED>` placeholder resolved from Key Vault (`helix-keys` / secret `instructions-sql-password`). See [scripts/init-events-table.mjs](../../scripts/init-events-table.mjs) for the canonical `resolveConnectionString` pattern.
- Migration precedent: [scripts/init-events-table.mjs](../../scripts/init-events-table.mjs) and [scripts/init-access-grants-tables.mjs](../../scripts/init-access-grants-tables.mjs) - idempotent `IF NOT EXISTS` blocks, `--dry-run` flag.

### 2.5 Scheduler boot wiring

- [server/index.js](../../server/index.js#L1066) - after `_hydrationReady`, gate `skipBackground = NODE_ENV !== 'production' && HELIX_LAZY_INIT === '1'`. This is what `dev:fast` toggles. The block that calls `startDataOperationsScheduler()` + `startEventPoller()` (L1095) is where the mirror sync timer should also live.
- Status banner already prints `scheduler` + `eventPoller`; this brief adds a `tasksMirror` line.

### 2.6 Boards in scope

- Default project: `ASANA_TECH_AUTOMATIONS_PROJECT_ID` (`1204962032378888`) in [server/utils/asana.js](../../server/utils/asana.js#L11).
- The board switcher lets a dev pick any project they can see in the workspace via `GET /api/dev-console/asana/projects`. Phase 1 mirrors only the default project plus any project the bench is currently viewing (lazy registration on first read).

### 2.7 Overlapping stash briefs (coordinate, do not block)

`tools/stash-precheck.mjs` flagged six briefs that touch overlapping files. None block this work; this brief should be referenced when those are picked up:

- `forge-control-room-with-asana-mirror-and-system-tab-library-and-comms`
- `tasks-board-editor-birdseye-asana-control`
- `hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes`
- `operator-god-mode-system-tab-pressure-release-valve`
- `hub-system-errors-repair-queue`
- `helix-software-dev-productivity-control-plane`

---

## 3. Plan

### Phase 1 - Read replacement + write-through (this stash)

Snappiness recipe: SQL-backed reads, write-through on Hub mutations, 30s drift sync (dev:all only).

#### 1.1 Tables (Instructions DB)

```sql
CREATE TABLE [dbo].[OpsAsanaProjects] (
  ProjectGid    NVARCHAR(64)   NOT NULL PRIMARY KEY,
  Name          NVARCHAR(255)  NOT NULL,
  TeamName      NVARCHAR(255)  NULL,
  LastSyncAt    DATETIME2      NULL,
  LastStatus    NVARCHAR(20)   NULL,    -- 'ok' | 'failed'
  LastError     NVARCHAR(400)  NULL,
  TaskCount     INT            NOT NULL DEFAULT 0,
  SectionCount  INT            NOT NULL DEFAULT 0,
  CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE [dbo].[OpsAsanaSections] (
  ProjectGid    NVARCHAR(64)  NOT NULL,
  SectionGid    NVARCHAR(64)  NOT NULL,
  Name          NVARCHAR(255) NOT NULL,
  SortOrder     INT           NOT NULL DEFAULT 0,
  MirroredAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_OpsAsanaSections PRIMARY KEY (ProjectGid, SectionGid)
);

CREATE TABLE [dbo].[OpsAsanaTasks] (
  ProjectGid    NVARCHAR(64)  NOT NULL,
  TaskGid       NVARCHAR(64)  NOT NULL,
  SectionGid    NVARCHAR(64)  NULL,
  Name          NVARCHAR(500) NOT NULL,
  AssigneeName  NVARCHAR(255) NULL,
  DueOn         DATE          NULL,
  AsanaCreated  DATETIME2     NULL,
  Url           NVARCHAR(500) NULL,
  Completed     BIT           NOT NULL DEFAULT 0,
  MirroredAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  DeletedAt     DATETIME2     NULL,
  CONSTRAINT PK_OpsAsanaTasks PRIMARY KEY (ProjectGid, TaskGid)
);

CREATE NONCLUSTERED INDEX IX_OpsAsanaTasks_BoardRead
  ON [dbo].[OpsAsanaTasks] (ProjectGid, DeletedAt, Completed)
  INCLUDE (TaskGid, SectionGid, Name, AssigneeName, DueOn, AsanaCreated, Url);
```

Owned by new script: `scripts/init-asana-tasks-mirror.mjs` (mirror `init-events-table.mjs`).

#### 1.2 Mirror helper (`server/utils/asanaTasksMirror.js`, NEW)

Exports:
- `syncProject({ projectGid, trigger })` - full board snapshot. Same Asana endpoints as the dev-console route. Upserts sections, MERGEs tasks (sets `DeletedAt = SYSUTCDATETIME()` for rows missing from the snapshot, clears `DeletedAt` for rows that reappear). Telemetry: `SystemTasks.Mirror.Sync.{Started,Completed,Failed}`.
- `refreshTask({ projectGid, taskGid, trigger })` - single-task write-through after a Hub mutation. `getTask` then upsert one row. Telemetry: `SystemTasks.Mirror.WriteThrough.{Started,Completed,Failed}`.
- `tombstoneTask({ projectGid, taskGid })` - for completed tasks; sets `Completed = 1, DeletedAt = SYSUTCDATETIME()`.
- `readBoard({ projectGid })` - single round trip joining projects + sections + open tasks. Returns the EXACT shape the dev-console route returns so the client swap is one line.
- `startMirrorSync()` / `stopMirrorSync()` - interval registration, 30s default (`HELIX_TASKS_MIRROR_INTERVAL_MS` override).

Content-guard rules:
- All Asana reads inside the mirror run with `{ operatorConsent: true, operatorActor: 'system-tasks-mirror-sync' }`.
- All telemetry properties use `safeTaskSummary` only - never `name` or `notes` strings.

#### 1.3 New read route

`GET /api/system-tasks/board/:projectGid` in `server/routes/system-tasks.js`:
- Gate `requireDevPreview`.
- Returns `readBoard({ projectGid })`.
- If row missing in `OpsAsanaProjects`, kicks off `syncProject({ trigger: 'on-demand-register' })`, awaits it, then returns. Telemetry: `SystemTasks.Mirror.Read.{Hit,Miss,Stale}` (Stale = LastSyncAt older than 2x interval).

#### 1.4 Write-through hooks

Every mutation in `server/routes/system-tasks.js` calls `refreshTask` (or `tombstoneTask` for complete=true) AFTER the Asana call succeeds, BEFORE responding. Failure of the refresh logs `SystemTasks.Mirror.WriteThrough.Failed` but does NOT fail the operator's mutation - the next 30s sync reconciles.

#### 1.5 Boot wiring

[server/index.js](../../server/index.js#L1095) - inside the `!skipBackground` branch, after `startEventPoller()`, call `startMirrorSync()`. Add `tasksMirror: !skipBackground` to the banner block.

#### 1.6 Client swap

[src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx#L232) - change `/api/dev-console/asana/tech-automations` to `/api/system-tasks/board/${projectId}`. Identical response shape.

#### 1.7 Mirror reader guard instruction

New `.github/instructions/system-tasks-mirror.instructions.md` (applyTo `server/utils/asanaTasksMirror*,server/routes/system-tasks*`): codifies operatorActor name, safe-summary rule for logs, and reminds readers that the mirror's "system-tasks-mirror-sync" actor is the only place the guard runs without a real operator.

### Phase 2 - Live push to bench clients

- SSE topic `system-tasks.board.<projectGid>` published by `syncProject` and `refreshTask` whenever a row changes.
- Client subscribes while the bench is open; on `change`, re-fetches or applies the patch directly.
- Removes the client refetch after its own mutation (saves a round trip).

### Phase 3 - Asana webhooks (true push from external edits)

- Register an Asana webhook per mirrored project against the Hub public endpoint.
- Implement HMAC verification (`X-Hook-Secret` handshake on register, `X-Hook-Signature` on delivery).
- On `changed` -> `refreshTask`; on `removed` -> `tombstoneTask`. Drop the 30s drift poll once webhooks are stable.

### Phase 4 - Hub-only fields

- Extend `OpsAsanaTasks` with Hub-only columns: `InternalPriority`, `InternalNotes`, `LinkedMatterRef`, `OwnerInitials`.
- Sync only touches Asana-sourced columns; Hub-only columns are never overwritten.
- New PATCH `/api/system-tasks/board/:projectGid/task/:gid/hub`.

---

## 4. Step-by-step execution order (Phase 1)

1. Create `scripts/init-asana-tasks-mirror.mjs`; run against Instructions DB twice to verify idempotency.
2. Create `server/utils/asanaTasksMirror.js`.
3. Add `GET /board/:projectGid` to `server/routes/system-tasks.js`.
4. Wire write-through into the five mutation handlers.
5. Register sync timer in `server/index.js`.
6. Add `.github/instructions/system-tasks-mirror.instructions.md`.
7. Swap the bench fetch URL.
8. Single changelog entry: "System Tasks mirror phase 1 - read from Hub SQL".

---

## 5. Verification checklist

**Phase 1:**
- [ ] `node scripts/init-asana-tasks-mirror.mjs` succeeds; second run is a no-op.
- [ ] `node scripts/init-asana-tasks-mirror.mjs --dry-run` prints SQL without connecting.
- [ ] Bench Network shows `/api/system-tasks/board/<gid>` returning ~10-50ms after warmup.
- [ ] Move a card; refetch reflects new section immediately (no 120s wait).
- [ ] Edit a task name directly in Asana; bench reflects the change within 30s.
- [ ] App Insights: `SystemTasks.Mirror.Sync.Completed`, `SystemTasks.Mirror.Read.Hit`, `SystemTasks.Mirror.WriteThrough.Completed`.
- [ ] SQL spot check: `SELECT TOP 5 ProjectGid, TaskGid, SectionGid, MirroredAt, DeletedAt FROM dbo.OpsAsanaTasks ORDER BY MirroredAt DESC`.
- [ ] No task `Name` or `Notes` values in any App Insights property.
- [ ] `dev:fast` boot does NOT start the mirror sync; banner shows `tasksMirror: false`.
- [ ] `dev:all` boot starts the sync; banner shows `tasksMirror: 30`.

---

## 6. Open decisions (defaults proposed)

1. **Sync cadence** - Default: **30s**. Override via `HELIX_TASKS_MIRROR_INTERVAL_MS`. Phase 3 will let us drop or extend this.
2. **Scope** - Default: **only the projects the bench has opened** (lazy registration). Default Tech & Automations project is registered at boot.
3. **DeletedAt behaviour** - Default: **soft-delete** so the next sync can resurrect a row if Asana brings it back (e.g. uncomplete). Hard purge after 30 days via a future cleanup brief.

---

## 7. Out of scope

- AsanaProjectMirror in the Roadmap tab.
- Stories, subtasks, attachments, custom fields.
- Hub-only fields (Phase 4).
- SSE push to clients (Phase 2).
- Asana webhooks (Phase 3).
- Widening beyond LZ + AC.
- Cross-board search / filter UI.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx](../../src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx) - switch fetch URL.

Server:
- [server/routes/system-tasks.js](../../server/routes/system-tasks.js) - add GET /board route + write-through hooks.
- [server/utils/asanaTasksMirror.js](../../server/utils/asanaTasksMirror.js) (NEW) - sync, refresh, read, start/stop.
- [server/utils/db.js](../../server/utils/db.js) - reuse `getPool`.
- [server/utils/asanaTasks.js](../../server/utils/asanaTasks.js) - reuse `getTask`, `normaliseTask`.
- [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js) - reuse `safeTaskSummary`, `assertOperatorReadConsent`.
- [server/index.js](../../server/index.js) - boot wiring for the sync timer.

Scripts / docs:
- `scripts/init-asana-tasks-mirror.mjs` (NEW) - idempotent migration.
- `.github/instructions/system-tasks-mirror.instructions.md` (NEW) - content-guard rules for the mirror reader.
- [logs/changelog.md](../../logs/changelog.md) - one entry per phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: system-tasks-hub-side-mirror-read-replacement-write-through
verified: 2026-06-04
branch: main
touches:
  client:
    - src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx
  server:
    - server/routes/system-tasks.js
    - server/utils/asanaTasksMirror.js
    - server/index.js
    - scripts/init-asana-tasks-mirror.mjs
    - .github/instructions/system-tasks-mirror.instructions.md
  submodules: []
depends_on: []
coordinates_with:
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - tasks-board-editor-birdseye-asana-control
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - operator-god-mode-system-tab-pressure-release-valve
  - hub-system-errors-repair-queue
  - helix-software-dev-productivity-control-plane
  # server/index.js boot-order neighbours (no logical conflict, just same file)
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - agent-suggestions-inbox-in-my-helix
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - dev-loop-cold-boot-performance-overhaul
  - forms-preflight-matrix-in-activity-tab
  - local-llm-zdr-inference-gateway
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - resources-hub-forms-pattern-rebuild
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- Dev-console live route fetches `?completed_since=now`, so completed tasks never appear. The mirror MUST do the same on sync, AND the client behaviour `removeTask` on complete should be matched by `tombstoneTask` in write-through, otherwise a completed task briefly reappears on the next read until the 30s sync runs.
- Asana sections do not carry `sort_order` from the API. The dev-console route preserves the order Asana returns them in; mirror upserts with `SortOrder = arrayIndex` and `readBoard` returns ORDER BY SortOrder.
- Tasks with no section membership render as a synthetic `{ gid: 'unsectioned' }` row. Mirror stores `SectionGid = NULL` and `readBoard` emits the same synthetic row.
- `withAsana` wraps mutations with telemetry + token resolution; do NOT call `refreshTask` outside the `try` block of the handler or a refresh failure masks the original Asana success.
- `getPool` returns a `mssql.ConnectionPool` from a cached map. Do NOT call `pool.close()` after each query - the pool is shared.
- Boot order: `server/index.js` listens immediately but holds `/api/*` behind a hydration gate. `_hydrationReady.then(...)` is the only safe place to start the sync timer.
- `HELIX_LAZY_INIT=1` (set by `dev:fast`) skips the scheduler; mirror sync MUST sit under the same gate or it will pin Asana API quota on every nodemon restart.
- `safeTaskSummary` returns `hasName: boolean`, never the name itself. Logging "moved task 'Foo'" is a guard violation; log `{ taskGid, fromSection, toSection }` only.
