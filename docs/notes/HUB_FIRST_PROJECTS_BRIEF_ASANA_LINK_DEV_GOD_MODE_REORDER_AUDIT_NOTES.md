# Hub-first projects: brief Asana link, dev god-mode reorder, audit notes

> **Purpose of this document.** Self-contained brief any future agent can pick up cold. Implements a Hub-first project model where stashed briefs link to Asana cards, dev-owners can reorder/relink across all items (not just new ones), and every change carries an auditable note explaining the *why*. Hub leads management; Asana follows for visibility.
>
> **How to use it.** Read once. Phase A is the smallest deposit that proves the link layer; later phases compound. Strict and messy initially is acceptable — the goal is to land a culture of pulling work into the open, then simplify the schema once usage shape is clear.
>
> **Verified:** 2026-05-03 against branch `main`.

---

## 1. Why this exists (user intent)

User (verbatim, 2026-05-03):
> "stashes now basically are going to link to cards, right? without adding too much complexity, lets scope a link between the asana projects which become hub first and asana second for management and visibility, and the briefs attachable to a project in that way. allow the dev user some god mode controls, editing and changing orders and links and things. generally across the existing items also not just the new elements. scope in also a notes functionality, where we can have an audit of the notes so users know what actions were taken and why etc. it becomes a sort of 'pulling' culture in discussing projects. this will be strict and messy initially but will simplify and land long term"

**Reading.** Three intertwined ideas:
1. **Hub-first projects.** A "project" is a Hub-side record. Asana is a *mirror surface* for visibility — the Hub holds the canonical state. The existing Tech & Automations Asana mirror at `/api/dev-console/asana/tech-automations` becomes the *secondary* read view of these Hub projects.
2. **Brief↔card linkage.** Stashed briefs in `docs/notes/` become attachable to a Hub project (and through it, to one or more Asana tasks). One brief can attach to one project; a project can carry many briefs. This is the connective tissue between strategy notes and live work.
3. **Dev god-mode + audit notes.** LZ (and any other dev-owner) can reorder, relink, retitle, and merge across **all existing items, not only new ones**. Every mutation drops an audit note (who / when / what changed / why), and discussion notes can be added without a code change. This is the "pulling" culture mechanism — the audit log is the reading material.

What the user is **not** asking for:
- A full project-management product. Asana stays. We are not rebuilding it.
- New permissions tiers. Use existing `requireDevOwner` / `requireForgeReader`.
- Migrating historical Asana cards into Hub. New projects + opt-in linkage of existing briefs only.

---

## 2. Current state — verified findings

### 2.1 Stash brief layer

- [docs/notes/INDEX.md](../../docs/notes/INDEX.md) — auto-generated register; rebuilt by [tools/stash-status.mjs](../../tools/stash-status.mjs).
- [docs/notes/_HANDOFF_TEMPLATE.md](../../docs/notes/_HANDOFF_TEMPLATE.md) — house template; YAML metadata block at the foot of every brief carries `id`, `verified`, `touches`, `depends_on`, `coordinates_with`, `conflicts_with`.
- [tools/stash-lint.mjs](../../tools/stash-lint.mjs) / [tools/stash-precheck.mjs](../../tools/stash-precheck.mjs) / [tools/stash-new.mjs](../../tools/stash-new.mjs) / [tools/stash-close.mjs](../../tools/stash-close.mjs) — read/write briefs as flat files. No central DB.
- 54 briefs currently in flight (precheck output 2026-05-03).

**Implication.** The linkage layer must read briefs by `id` from filesystem and not require briefs to round-trip through SQL.

### 2.2 Asana mirror layer

- [server/utils/asana.js](../../server/utils/asana.js) — exports `ASANA_BASE_URL`, `ASANA_WORKSPACE_ID`, `ASANA_ACCOUNTS_PROJECT_ID`, `ASANA_TECH_AUTOMATIONS_PROJECT_ID`, `resolveAsanaAccessToken({ email, initials, entraId })`. Project gids are hardcoded constants with optional env override; this is the canonical pattern.
- [server/routes/dev-console.js](../../server/routes/dev-console.js) — `GET /api/dev-console/asana/tech-automations` (gated `requireForgeReader`, 120s in-memory cache, telemetry namespace `DevConsole.Asana.TechAutomations.*`).
- [server/routes/techTickets.js](../../server/routes/techTickets.js) — uses `ASANA_TECH_AUTOMATIONS_PROJECT_ID` to create cards via `createAsanaTask`. Outbound write path exists.
- [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx) — read-only render of the cached task list.

**Implication.** We can already *read* Asana tasks for a project and *create* tasks programmatically. The missing piece is a Hub-side project record that holds the linkage and the audit trail.

### 2.3 Dev/Forge gates

- `requireDevOwner` in [server/routes/dev-roadmap.js](../../server/routes/dev-roadmap.js) and [server/routes/dev-console.js](../../server/routes/dev-console.js) — LZ only, mutations.
- `requireForgeReader` — LZ + AC, reads.
- `viewMode` (`dev` / `roadmap`) plumbed through `localStorage.helix.forge.viewMode` and `x-forge-view-mode` header. Established in [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx).

**Implication.** God-mode = `requireDevOwner`. Read = `requireForgeReader`. No new gate primitives needed.

### 2.4 Forge surface for stale briefs

- [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) renders the `Stale briefs` section from `data.stash.highRisk`. This is the natural place to fold project linkage in.

---

## 3. Plan

The schema and UI surface are intentionally minimal. We are buying optionality, not building a CRM.

### Phase A — minimum viable link layer (Hub-first)

A single Hub-side record per project, stored in the Instructions DB (operational data, not core financial). One row = one Hub project; that row carries an Asana gid (optional) and an array of brief ids. Audit notes live in a sibling table.

#### A1. Tables (Instructions DB)

```sql
CREATE TABLE [dbo].[ForgeProjects] (
  [Id]              INT IDENTITY(1,1) PRIMARY KEY,
  [Slug]            NVARCHAR(120) NOT NULL UNIQUE,         -- stable handle, e.g. 'ccl-feedback-loop'
  [Title]           NVARCHAR(240) NOT NULL,
  [Status]          NVARCHAR(32)  NOT NULL DEFAULT 'open', -- open | shipped | parked | merged
  [SortOrder]       INT           NOT NULL DEFAULT 1000,   -- gappy, lower = higher
  [AsanaTaskGid]    NVARCHAR(40)  NULL,                    -- single-card link to T&A board
  [AsanaProjectGid] NVARCHAR(40)  NULL,                    -- override default project per record
  [CreatedAt]       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  [CreatedBy]       NVARCHAR(10)  NOT NULL,
  [UpdatedAt]       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  [UpdatedBy]       NVARCHAR(10)  NOT NULL
);

CREATE TABLE [dbo].[ForgeProjectBriefs] (
  [Id]          INT IDENTITY(1,1) PRIMARY KEY,
  [ProjectId]   INT          NOT NULL FOREIGN KEY REFERENCES [dbo].[ForgeProjects]([Id]) ON DELETE CASCADE,
  [BriefId]     NVARCHAR(160) NOT NULL,                    -- matches docs/notes/INDEX.md id
  [SortOrder]   INT          NOT NULL DEFAULT 1000,
  [AddedAt]     DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
  [AddedBy]     NVARCHAR(10) NOT NULL,
  CONSTRAINT [UQ_ForgeProjectBriefs] UNIQUE ([ProjectId], [BriefId])
);

CREATE TABLE [dbo].[ForgeProjectNotes] (
  [Id]          INT IDENTITY(1,1) PRIMARY KEY,
  [ProjectId]   INT          NOT NULL FOREIGN KEY REFERENCES [dbo].[ForgeProjects]([Id]) ON DELETE CASCADE,
  [Kind]        NVARCHAR(24) NOT NULL,                     -- 'note' | 'audit'
  [Body]        NVARCHAR(MAX) NOT NULL,                    -- free text for note; structured JSON for audit
  [Author]      NVARCHAR(10)  NOT NULL,
  [CreatedAt]   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_ForgeProjectNotes_Project ON [dbo].[ForgeProjectNotes]([ProjectId], [CreatedAt] DESC);
CREATE INDEX IX_ForgeProjects_Status_Sort ON [dbo].[ForgeProjects]([Status], [SortOrder]);
```

`audit` rows are *automatically written* on every mutation. `note` rows are typed by the user. The same table holds both because the audit log and the discussion thread should be read together — that's the pulling-culture mechanic.

Sample audit body:
```json
{ "action": "link.brief", "before": null, "after": "ccl-feedback-loop", "reason": "moved off Whiteboard A1" }
```

#### A2. Server routes

All under `/api/forge/projects` in a new file `server/routes/forge-projects.js`.

| Method | Path | Gate | Purpose |
|--------|------|------|---------|
| GET | `/` | `requireForgeReader` | List all projects + linked brief ids + last 3 notes |
| GET | `/:slug` | `requireForgeReader` | Full project detail incl. notes feed |
| POST | `/` | `requireDevOwner` | Create. Body: `{ slug, title, asanaTaskGid? }`. Auto-audit `created`. |
| PATCH | `/:slug` | `requireDevOwner` | Update. Body: any subset of fields + required `reason`. Auto-audit per changed field. |
| DELETE | `/:slug` | `requireDevOwner` | Soft-delete via `Status='parked'` + audit. Hard delete only by SQL. |
| POST | `/:slug/briefs` | `requireDevOwner` | Attach brief. Body: `{ briefId, reason }`. Auto-audit. Cascades a tag to the brief's metadata block (Phase B5). |
| DELETE | `/:slug/briefs/:briefId` | `requireDevOwner` | Detach. Body: `{ reason }`. |
| PATCH | `/:slug/briefs/order` | `requireDevOwner` | Reorder. Body: `{ briefIds: [...] }`. Single audit row. |
| PATCH | `/order` | `requireDevOwner` | Reorder projects. Body: `{ slugs: [...] }`. Single audit row. |
| POST | `/:slug/notes` | `requireDevOwner` | Discussion note. Body: `{ body }`. |
| POST | `/:slug/asana/sync` | `requireDevOwner` | One-shot push: ensure an Asana task exists for this project (uses `createAsanaTask` from techTickets pattern); store the resulting `AsanaTaskGid`. |

Telemetry namespace: `Forge.Projects.<Action>.{Started,Completed,Failed}`. Always include `actor`, `slug`, `viewMode`.

#### A3. Frontend — Forge dev surface only (LZ initially)

A new section in [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) above `Stale briefs`:

- `ProjectsBoard` — sortable list of project cards. Drag = reorder (PATCH `/order`). Click = expand into detail rail.
- Each card shows: title, count of linked briefs, count of unread notes, Asana mirror state (✓ linked / unlinked).
- Detail rail tabs: **Briefs** (sortable, attach/detach) | **Notes** (chronological feed, mixed audit + discussion, audit rows visually muted) | **Asana** (read-only mirror of the linked task + subtasks if any).
- Every mutation prompts a single-line "Why?" input — required for PATCH/DELETE, optional for POST. The string lands in the audit `reason` field.

Reuse drag/drop primitives from [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx) where possible.

#### A4. Brief-side breadcrumb (lightweight)

Extend the YAML stash metadata block with `forge_project: <slug>`. Touch [tools/stash-lint.mjs](../../tools/stash-lint.mjs) to accept the new key. This keeps briefs grep-able for project membership without a DB round-trip.

**Phase A acceptance:**
- LZ can create a project, attach 2 existing briefs to it, drag-reorder briefs and projects, write a discussion note.
- Every mutation produces an audit row visible in the Notes feed within the same view.
- AC sees the project list (read-only) in roadmap mode but cannot mutate.
- An optional one-shot push creates an Asana card for the project; the gid is stored; subsequent renders show "linked".

### Phase B — compound the surface

#### B1. Cross-tab project chips

Render a small "Project: <title>" chip wherever the brief is referenced (Activity tab, Forge whiteboard cards, Stale briefs section). Single source of truth via `forge_project` in YAML.

#### B2. Asana → Hub backflow (read-only)

When the dev-console mirror fetches Tech & Automations tasks, match each task by `AsanaTaskGid` to a Hub project. Render task notes/comments inside the Hub project Notes feed, marked `source: 'asana'`. No write-back from Asana yet.

#### B3. Bulk operations + history view

A "Forge audit log" KPI page (`/api/forge/projects/audit?since=…`) with timeline of all mutations across all projects. Useful for the pulling rhythm — answers *what changed this week and why* in one place.

#### B4. Closure path

When a brief is closed via `tools/stash-close.mjs`, auto-update the linked project's status to `shipped` if all linked briefs are closed. Audit row records the cascade.

#### B5. YAML stash-lint integration

`stash-lint.mjs` accepts `forge_project: <slug>`. `stash-precheck.mjs` surfaces sibling briefs sharing a project as a new "PROJECT-MATES" group, in addition to the existing COORDINATES/CONFLICTS groups.

#### B6. Note notifications

When a non-author dev-owner adds a note to a project, fire an App Insights `Forge.Project.Note.Posted` event with the actor + slug. Future: surface unread-count badge in the Forge tab. Out of scope for this brief.

---

## 4. Step-by-step execution order

1. **A1** — Run the three CREATE TABLE statements in Instructions DB (use a temp script in `scripts/`, not `node -e`). Hand-verify with `tools/instant-lookup.mjs` extension.
2. **A2** — Stand up `server/routes/forge-projects.js` with the table CRUD + audit middleware. Mount in `server/index.js`. Add telemetry. Smoke with `curl` against `:8080`.
3. **A3** — Build `ProjectsBoard` + detail rail in `DevConsolePanel.tsx`. Reuse drag-drop from `RoadmapWhiteboard`. Gate writes behind `isDevOwner`.
4. **A4** — Extend `stash-lint.mjs` + `_HANDOFF_TEMPLATE.md` to include `forge_project`. Add a one-time migration script to backfill the YAML key for already-attached briefs.
5. *(after A ships)* **B1** — render chips. Cheap.
6. **B2** — Asana backflow into Notes feed.
7. **B3** — Bulk audit log KPI page.
8. **B4** — closure cascade in `tools/stash-close.mjs`.
9. **B5** — `stash-precheck.mjs` PROJECT-MATES group.
10. **B6** — note notifications.

---

## 5. Verification checklist

**Phase A:**
- [ ] Three Instructions DB tables exist with the intended indexes; `SELECT TOP 1 * FROM ForgeProjects` returns empty result without error.
- [ ] `POST /api/forge/projects` creates a row + an audit note in one transaction; rollback on failure verified.
- [ ] `requireDevOwner` blocks AC; `requireForgeReader` permits AC on GETs.
- [ ] Reorder PATCH writes a single audit row, not one per item.
- [ ] AC sees list in roadmap mode without mutation controls.
- [ ] App Insights events: `Forge.Projects.Created.Completed`, `Forge.Projects.BriefAttached.Completed`, `Forge.Projects.Reordered.Completed`, `Forge.Projects.NotePosted.Completed`.
- [ ] SQL spot check: `SELECT TOP 5 Kind, Body, Author, CreatedAt FROM ForgeProjectNotes ORDER BY CreatedAt DESC` shows mixed `note`/`audit` rows.

**Phase B:**
- [ ] Project chip renders on every Activity surface that lists a brief belonging to a project.
- [ ] Closing the last brief on a project flips status to `shipped` and writes an audit row tagged `cascade=true`.
- [ ] `stash-precheck.mjs` reports a PROJECT-MATES group for any new draft sharing `forge_project`.

---

## 6. Open decisions (defaults proposed)

1. **Where does `ForgeProjects` live?** Default: **Instructions DB**. Rationale: same gate (`requireDevOwner`), already adjacent to existing operational tables, no new connection string. Alternative: helix_projects (would need migration tooling).
2. **Sort field type.** Default: **gappy `INT` (1000-step)** so reorders rewrite one row, not a whole list. Alternative: fractional indexing.
3. **Audit body format.** Default: **JSON in NVARCHAR(MAX)** — pragmatic, indexable in app code. Alternative: separate columns per field (rigid, hard to evolve).
4. **Required reason on writes.** Default: **required for PATCH/DELETE, optional for POST**. Rationale: creating is self-explanatory; mutating existing items is what the audit culture is for.
5. **Asana sync direction.** Default: **Hub → Asana on demand** (one-shot button). Rationale: keeps Hub canonical; avoids polling churn. B2 adds read-only backflow.
6. **Soft vs hard delete.** Default: **soft (status='parked')**. Hard delete via SQL only. Rationale: audit log is meaningless if rows can vanish.
7. **Brief reattachment to a different project.** Default: **allowed**, fires two audit rows (detach old, attach new) sharing a `txnId`. Rationale: prevents orphan briefs while preserving history.

---

## 7. Out of scope

- Migrating historical Asana tasks into Hub.
- A separate notifications inbox / unread badge UI (B6 is fire-and-track only).
- Permissions tiers beyond `requireDevOwner` / `requireForgeReader`.
- Public/client-facing project surfaces.
- Asana write-back (comments, status changes).
- Rebuilding the existing whiteboard or briefs INDEX system.
- A search index across notes (defer until the corpus justifies it).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) — host the new ProjectsBoard + detail rail
- [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx) — reuse drag/drop primitives
- [src/tabs/roadmap/parts/AsanaProjectMirror.tsx](../../src/tabs/roadmap/parts/AsanaProjectMirror.tsx) — Asana column inside detail rail (B2)
- [src/app/admin.ts](../../src/app/admin.ts) — `isDevOwner` already in place

Server:
- `server/routes/forge-projects.js` (NEW) — CRUD + audit
- [server/routes/dev-console.js](../../server/routes/dev-console.js) — surface project counts in `/summary`
- [server/utils/asana.js](../../server/utils/asana.js) — `ASANA_TECH_AUTOMATIONS_PROJECT_ID` reused for Hub→Asana sync
- [server/routes/techTickets.js](../../server/routes/techTickets.js) — model for `createAsanaTask`
- [server/index.js](../../server/index.js) — mount the new router

Scripts / docs:
- `scripts/migrate-forge-projects.sql` (NEW) — Instructions DB DDL
- `scripts/backfill-forge-project-yaml.mjs` (NEW) — one-time YAML key backfill
- [tools/stash-lint.mjs](../../tools/stash-lint.mjs) — accept `forge_project` key
- [tools/stash-precheck.mjs](../../tools/stash-precheck.mjs) — emit PROJECT-MATES group (B5)
- [tools/stash-close.mjs](../../tools/stash-close.mjs) — closure cascade (B4)
- [docs/notes/_HANDOFF_TEMPLATE.md](../../docs/notes/_HANDOFF_TEMPLATE.md) — add `forge_project` line
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
verified: 2026-05-03
branch: main
touches:
  client:
    - src/tabs/roadmap/parts/DevConsolePanel.tsx
    - src/tabs/roadmap/parts/RoadmapWhiteboard.tsx
    - src/tabs/roadmap/parts/AsanaProjectMirror.tsx
  server:
    - server/routes/forge-projects.js
    - server/routes/dev-console.js
    - server/index.js
    - server/utils/asana.js
    - tools/stash-lint.mjs
    - tools/stash-precheck.mjs
    - tools/stash-close.mjs
    - docs/notes/_HANDOFF_TEMPLATE.md
  submodules: []
depends_on: []
coordinates_with:
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - clio-token-refresh-architecture-audit
conflicts_with: []
```

---
