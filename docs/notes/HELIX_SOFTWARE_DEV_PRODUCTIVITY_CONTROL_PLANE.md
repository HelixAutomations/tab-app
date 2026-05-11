# Helix Software Dev Productivity Control Plane

> **Purpose of this document.** This is the full sharpen-the-saw scope for making Helix software help build Helix software. It exists so the phases can be checked off deliberately instead of becoming another chat-only idea.
>
> **How to use it.** Read the whole document once. Phase A.0 has already shipped as the System Forge seed. Pick the next unchecked phase, re-run `node tools/stash-precheck.mjs --draft docs/notes/HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md`, implement only that phase, validate, add a `logs/changelog.md` entry, then update this brief if the checklist changes.
>
> **Verified:** 2026-05-03 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.
>
> **Reshape note (2026-05-03).** Phase A2 was originally scoped as a stash dependency graph. After A1 shipped, the user redirected: A2 should be a **private personal roadmap whiteboard** that the dev-owner returns to daily to patch items, drag them between days, and see today's cut. The stash graph is preserved as the lighter A4. A new Phase F covers the longer arc into pull-culture collaboration and the eventual tasking-system move into the hub. Earlier phase numbering for B-E is unchanged; only A2 was reshaped and A4 / Phase F were added.

---

## 1. Why this exists (user intent)

The user asked to "stash this so we can keep referring back and making sure we're checking things off correctly" after a strategic scoping pass on Helix dev productivity. The brief is not asking for a new product feature. It is asking for a control plane around the mechanisms that already help Helix development compound: stash briefs, changelog learning, Activity checks, Health Observations, repo memory, local-loop tools, generated-file hygiene, telemetry, and cross-app contract awareness.

The framing is: one canonical surface per concern, every observation as a first-class artefact, and a weekly review cadence that answers what shipped, what is stuck, what is getting slower, and what should be picked up next. The implementation should stay phased, reversible, and grounded in existing System/Activity surfaces rather than creating another parallel admin area.

---

## 2. Current state - verified findings

### 2.1 Phase A.0 Forge seed already exists

- File: [server/routes/dev-console.js](../../server/routes/dev-console.js) - read-only dev-owner API for System > Forge.
- Notable line refs: L14-L27 gates access to LZ/dev owner, L85-L105 parses and summarises `logs/changelog.md`, L114-L151 summarises stashed briefs, L153-L163 returns the local toolbelt, L165-L200 lists next upgrade candidates, L202-L237 serves `GET /summary` with App Insights events and metrics.
- File: [server/index.js](../../server/index.js) - registers the route.
- Notable line refs: L434 requires `./routes/dev-console`, L764 mounts it at `/api/dev-console`.
- File: [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) - renders the Forge panel.
- Notable line refs: L130 fetches `/api/dev-console/summary`, L155/L175/L182 stamp `data-helix-region="system/forge"`, L199 renders "Next deposits", L254 renders generated artefacts.
- File: [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) - maps the `forge` lens to `DevConsolePanel`.
- Notable line refs: L10 imports the panel, L80-L82 renders it.
- File: [src/tabs/roadmap/hooks/useActivityLayout.ts](../../src/tabs/roadmap/hooks/useActivityLayout.ts) - includes `forge` in persisted valid lenses.
- Notable line refs: L9 defines `VALID_LENSES` including `forge`.

### 2.2 Activity checks are route/workflow-ready, but not universal yet

- File: [src/tabs/roadmap/parts/RouteChecksPanel.tsx](../../src/tabs/roadmap/parts/RouteChecksPanel.tsx) - existing System checks UI.
- Notable line refs: L104 loads `/api/ops-checks/catalog`, L132-L160 runs individual checks via `/api/ops-checks/run/:id`, L175 stamps `data-helix-region="activity/checks"`.
- File: [server/routes/ops-checks.js](../../server/routes/ops-checks.js) - server route for the checks catalogue and runs.
- Notable line refs: L20-L28 serves the catalogue, L41-L67 tracks started/completed run telemetry, L79-L103 tracks failure telemetry and pushes summaries into ops-pulse.
- File: [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) - catalogue and check execution logic.
- Notable line refs: L163-L178 normalises declared input schemas, L230-L263 defines route checks for ops pulse/release notes/cache/team data, L274-L331 defines dependency checks, L336-L411 defines the Home core bootstrap dry-run workflow, L422-L433 exposes check metadata.

### 2.3 Stash is structured, but the graph is invisible

- File: [docs/notes/INDEX.md](INDEX.md) - generated register of parked work.
- Notable line refs: L1-L8 declare it as auto-generated from stash metadata and show the status legend.
- File: [tools/stash-new.mjs](../../tools/stash-new.mjs) - scaffolds new briefs.
- Notable line refs: L47-L50 print the required precheck/lint/status next steps after creating a brief.
- File: [tools/stash-precheck.mjs](../../tools/stash-precheck.mjs) - overlap scanner.
- Notable line refs: L31 prints usage, L45-L52 extracts draft metadata, L97-L121 classifies shared-file conflicts versus same-directory coordinates, L142-L166 prints required metadata fixes.
- File: [tools/stash-status.mjs](../../tools/stash-status.mjs) - rebuilds `INDEX.md`.
- Notable line refs: L41 writes the generated-register header, L80 warns if the index is out of date in `--check` mode.
- File: [server/utils/stashMeta.js](../../server/utils/stashMeta.js) - server mirror of stash metadata parsing used by Forge.
- Notable line refs: L1-L3 state it mirrors CLI parsing, L8-L10 define notes/index files, L11-L13 define required metadata keys, L106-L128 loads all open briefs.

### 2.4 Changelog is disciplined, but still mostly write-only

- File: [logs/changelog.md](../../logs/changelog.md) - release-note source of truth.
- Notable line refs: L1-L2 currently contain the latest dev-productivity and bugfix entries.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js) - current read-back is only simple counts/categories.
- Notable line refs: L85-L105 returns total, last-14-days count, category counts, and latest eight entries; L168-L176 already names a future "Changelog inspector" candidate.

### 2.5 Health Observations exist only as response discipline

- File: [.github/copilot-instructions.md](../../.github/copilot-instructions.md) - defines the footer convention.
- Notable line refs: L140-L159 describe Health Observations, L161-L179 describe paired Stash candidates.
- File: [server/routes/dev-console.js](../../server/routes/dev-console.js) - Forge names this gap but does not yet persist observations.
- Notable line refs: L192-L197 lists "Lessons ledger" as a next deposit because health observations and repo memories are scattered.

### 2.6 Generated-file convention is partial

- File: [.gitattributes](../../.gitattributes) - currently only normalises `.gitignore` line endings.
- Notable line refs: L1 is the only current rule; there is no generated-file convention here yet.
- File: [tools/sync-context.mjs](../../tools/sync-context.mjs) - emits generated realtime context.
- Notable line refs: L231 begins the generated `REALTIME_CONTEXT.md` content with `Auto-generated: ...`, but there is no standard marker contract shared across generated artefacts.
- File: [tools/stash-status.mjs](../../tools/stash-status.mjs) - emits an explicit auto-generated header for `docs/notes/INDEX.md`.
- Notable line refs: L41 writes "This file is auto-generated".

### 2.7 Cross-app contract principle exists, but no registry exists

- File: [.github/copilot-instructions.md](../../.github/copilot-instructions.md) - defines the three-surface platform topology.
- Notable line refs: L11-L13 name `tab-app`, `instruct-pitch`, and `enquiry-processing-v2`; L24 says changes should strengthen cross-app contracts; L116-L118 define the execution contract across those three stages.
- File search: no `docs/CROSS_APP_CONTRACTS.md` file exists as of this brief. Any implementation should create it from read-only scans, not by mutating submodules.

### 2.8 Wayfinding is already available as the inspection substrate

- File: [src/utils/devWayfinding.ts](../../src/utils/devWayfinding.ts) - debug API and build stamp.
- Notable line refs: L73 enumerates `[data-helix-region]`, L88 stamps `data-helix-build`, L97-L133 registers `window.__helix__` help methods and the Ctrl+Shift+H hint.
- File: [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) - Forge already uses this convention.
- Notable line refs: L155/L175/L182 use `data-helix-region="system/forge"`.

---

## 3. Plan

### Phase A - Gel the existing surfaces

| # | Status | Change | File | Detail |
|---|--------|--------|------|--------|
| A0 | Done | Forge seed | [server/routes/dev-console.js](../../server/routes/dev-console.js), [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) | Already shipped: read-only dev-owner Forge summary with changelog, stash, toolbelt, artefact, and upgrade-candidate signals. |
| A1 | Done | Generated artefact convention | [.gitattributes](../../.gitattributes), [tools/stash-status.mjs](../../tools/stash-status.mjs), [tools/sync-context.mjs](../../tools/sync-context.mjs), [tools/lib/generated-marker.mjs](../../tools/lib/generated-marker.mjs) | Shipped: standard marker helper, generated output headers, `.gitattributes` generated hints, and Forge marker-status checks for listed artefacts. |
| A2 | Done | Personal Roadmap Whiteboard (MVP) | `data/roadmap-whiteboard.json`, [server/routes/dev-roadmap.js](../../server/routes/dev-roadmap.js), [server/index.js](../../server/index.js), [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx), [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx), [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css), [.gitignore](../../.gitignore) | Shipped: private dev-owner whiteboard inside Forge with Today / Next 7 / Later / Parked / Done lanes, quick-add, inline title/date/status/notes editing, HTML5 drag-reorder, file-backed persistence, soft-delete, pulse counts, and App Insights route telemetry. |
| A2.1 | Open | Whiteboard ↔ stash linkage | [server/utils/stashMeta.js](../../server/utils/stashMeta.js), `RoadmapWhiteboard.tsx` | When a whiteboard item references a stash brief id, render the brief status pill from `INDEX.md` data and surface stale/conflict warnings inline. Read-only — the brief stays the source of truth. |
| A3 | Open | Health Observation log seed | new `docs/notes/_observations.md`, optional `tools/dev-observe.mjs`, [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) | Persist observations with id/date/area/file/status so they stop evaporating after chat. Keep this file intentionally simple before any database work. |
| A4 | Open | Stash dependency graph | new `tools/stash-graph.mjs`, [server/routes/dev-console.js](../../server/routes/dev-console.js), [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) | Generate Mermaid graph from stash metadata (`depends_on`, `coordinates_with`, `conflicts_with`), expose graph JSON/text in Forge, render a compact cluster summary. Lower priority than the whiteboard; useful once the whiteboard surfaces brief ids. |

**Phase A acceptance:**
- [x] Forge lens exists in System and is dev-owner gated.
- [x] Every generated artefact Forge lists has a standard regeneration marker or is explicitly exempt.
- [x] Roadmap Whiteboard renders inside Forge for the dev-owner only and 403s for everyone else.
- [x] Items can be created, edited, dated, drag-reordered, and persisted across page reload and server restart.
- [x] A whiteboard item linked to a stash brief id shows the brief's current status without duplicating INDEX.md. A2.1 remains open for conflict/stale warnings and richer link editing.
- [ ] A one-line Health Observation can be recorded and surfaced back in Forge.
- [ ] `node tools/stash-graph.mjs --print` emits a Mermaid graph and exits 0 (A4).

### Phase A.3a - Roadmap Whiteboard scoping detail

This section exists because A2 is the most operator-facing change in the brief and needs to be unambiguous before any code lands.

**Intent (verbatim, condensed from user):** "a roadmap that only I will see, ordering by date that I can edit and control by dragging items into different orders. A sleeker whiteboard I return to frequently to patch an item in or see what's cut out for me for the day. Possibly expanding to collaboration with notes so we can manage roadmap items in a pulling culture. Possibly laying the groundwork for the tasking system move into the hub."

**Visibility & gating**
- Dev-owner only at MVP. Reuse the existing `isDevOwner` gate already used by `server/routes/dev-console.js`.
- No team visibility, no shared notes, no email/Teams integration in A2. Those land in Phase F.

**Surface**
- Render inside System > Forge as a new top section above "Next deposits". The whiteboard is the daily-return surface; everything else in Forge is supporting context.
- Stamp `data-helix-region="system/forge/whiteboard"` for wayfinding.
- Optional follow-up (not MVP): promote to its own lens `whiteboard` in `useActivityLayout.ts` once the section is too tall.

**Item shape**
```ts
interface WhiteboardItem {
  id: string;             // ulid or short nanoid
  title: string;          // <= 140 chars
  notes?: string;         // markdown, optional, lazy-loaded on expand
  scheduledDate: string;  // ISO yyyy-mm-dd, or 'parked' sentinel
  manualOrder: number;    // float, gap-insertion friendly (1024, 2048, ...)
  status: 'open' | 'in_progress' | 'done' | 'parked';
  briefId?: string;       // optional link to docs/notes/<id>.md
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
  createdBy: string;      // initials, defaults to 'LZ' at MVP
}
```

**Lanes / view model**
- **Today** — `scheduledDate === todayLondon` plus any overdue `open|in_progress` items (sorted by `manualOrder`).
- **Next 7** — dates within +1..+7 days, grouped by date.
- **Later** — dates beyond +7.
- **Parked** — `scheduledDate === 'parked'` or `status === 'parked'`.
- **Done** — collapsed by default; show last 14 days only.

**Drag behaviour**
- Drag within a lane: rewrite `manualOrder` (float midpoint between neighbours).
- Drag across lanes: rewrite `scheduledDate` to the destination date and reset `manualOrder` to the lane's tail.
- Drag onto Done: set `status='done'`, leave date untouched.
- Drag onto Parked: set `scheduledDate='parked'`, `status='parked'`.
- Use HTML5 DnD only at MVP. No new dependency. If the interaction proves clunky, evaluate `@dnd-kit/core` in a follow-up; do not bring it in for MVP.

**Persistence**
- MVP: flat JSON at `data/roadmap-whiteboard.json` with the standard generated marker disabled (this file is data, not generated). This path is now in `.gitignore`; treat it as private daily state once real items exist.
- Writes are last-write-wins per item; concurrent multi-tab editing is out of scope.
- A nightly archival pass (later) can roll completed items older than 30 days into `data/roadmap-whiteboard.archive.json`.

**API**
- `GET /api/dev-console/roadmap` → `{ items: WhiteboardItem[], serverTime, lanesHint }`.
- `POST /api/dev-console/roadmap` → create item, returns `{ item }`.
- `PATCH /api/dev-console/roadmap/:id` → partial update (title, notes, scheduledDate, manualOrder, status, briefId).
- `DELETE /api/dev-console/roadmap/:id` → soft-delete (move to `parked` with `deletedAt` stamp). Hard-delete only via CLI later.
- All endpoints gated by `isDevOwner`. Telemetry: `DevConsole.Roadmap.Get/Create/Update/Delete.{Started,Completed,Failed}` plus a duration metric.

**UI primitives**
- Lane component: header (lane name + count + add button), list of item cards, drop zone footer.
- Item card: title (inline editable on click), date pill, status dot, optional brief-id chip, expand toggle for notes.
- Quick-add: top-of-Today inline input. Enter = create with today's date and tail order. Shift-Enter for new line in notes.
- Keyboard: `j/k` to move selection, `space` to toggle status, `e` to edit, `n` for new.
- Empty states: each lane shows a short sentence ("Nothing scheduled for the next 7 days.") rather than a blank box.

**Telemetry / observability**
- Per-action App Insights events as above.
- Forge "Roadmap pulse" microline: "3 items today, 2 overdue, 12 in next 7". Helps the user judge load before opening it fully.

**Out of scope for A2**
- Multi-user editing, notes threads, mentions, assignment.
- Email / Teams notifications.
- Recurring items, templates, sub-tasks.
- Mobile-specific layout (desktop-first; mobile gracefully degrades to a stacked list with no DnD).

**Acceptance for A2**
- [x] Dev-owner can create, edit, drag-reorder, redate, complete, park, and soft-delete items.
- [x] Items survive a server restart (file-backed) and a browser reload.
- [x] Non-dev-owner browsers see no whiteboard surface and the API returns 403.
- [x] Forge "Roadmap pulse" microline reflects today/overdue/next-7 counts.
- [x] All API actions emit `DevConsole.Roadmap.*` telemetry.
- [ ] Drag interaction is smooth on a Today lane with 30+ items (no layout jank, no flicker). Needs browser stress pass after real usage or a seeded local fixture.
- [x] No new npm dependency added.

### Phase B - Close the learning loop

#### B1. Changelog inspector route

Add a permission-aware route, likely `POST /api/dev/changelog-inspect`, taking:

```json
{
  "from": "2026-04-26",
  "to": "2026-05-03",
  "lens": "themes|regressions|recurring-fixes|slowness|people"
}
```

Implementation notes:
- Prefer the existing server AI/OpenAI/Foundry helper pattern already used by CCL and comms routes rather than introducing a new client.
- Output should be operator-readable and <=200 words by default.
- LZ/dev-owner can inspect the full changelog. If widened later, admins should see only non-sensitive summaries.
- Track App Insights events: `DevConsole.ChangelogInspect.Started`, `.Completed`, `.Failed`, and a duration metric.

#### B2. Lessons ledger

Start with flat-file `_observations.md` in Phase A. Promote to a table only when the workflow proves useful.

Proposed eventual SQL shape if/when using the Instructions DB:

```sql
CREATE TABLE dbo.DevLessons (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  Area NVARCHAR(100) NOT NULL,
  Mistake NVARCHAR(500) NOT NULL,
  Fix NVARCHAR(500) NOT NULL,
  Prevention NVARCHAR(500) NULL,
  SourceType NVARCHAR(50) NOT NULL,
  SourceRef NVARCHAR(200) NULL,
  Status NVARCHAR(30) NOT NULL DEFAULT 'open'
);
```

#### B3. Retro trigger phrases

Teach future agents to recognise:
- `do a retro on last week`
- `retro on CCL`
- `retro on matter opening`

The flow should read changelog + observations/lessons + relevant repo memories, produce a dense review, and ask whether any finding should be promoted to instruction files.

**Phase B acceptance:**
- [ ] Route returns a useful <=200 word summary for a known changelog range.
- [ ] Failure paths are telemetry-backed and do not expose secrets/PII.
- [ ] Forge has a small "Inspect changelog" affordance or a clear command card for the route.
- [ ] At least one accepted lesson can be promoted from observation to persistent record.

### Phase C - Make observations first-class

| # | Change | Detail |
|---|--------|--------|
| C1 | `tools/dev-observe.mjs` | CLI helper: `node tools/dev-observe.mjs --severity medium --area ccl --file src/... "note"`. Appends to `_observations.md` with id/date/status. |
| C2 | Observation ageing | Add status (`open`, `accepted`, `fixed`, `dismissed`) and age. Forge sorts unresolved high-age observations above low-value ones. |
| C3 | Diff drain | Optional pre-commit or `npm run observe:drain` that lists observations against files in the current diff. Do not block commits initially; report only. |

**Phase C acceptance:**
- [ ] Observations can be listed by file and status.
- [ ] Forge highlights observations touching files changed in the last 14 days.
- [ ] No chat footer is required for an observation to survive the session.

### Phase D - Operator parity

| # | Change | Detail |
|---|--------|--------|
| D1 | Telemetry strip | Add a restrained one-line in-app strip showing last-60-second operational status for non-dev team users. Use reportingFoundation-style density and existing App Insights/ops-pulse sources where possible. |
| D2 | Checks become universal | Extend `opsCheckCatalog` beyond routes/dependencies/workflows to forms preflight, SSE consumers, AI prompts, and stash-readiness checks. |
| D3 | Prod-parity smoke paths | Each important route/workflow gets one explicit exercise path answering what was checked, skipped, simulated, or failed. |

**Phase D acceptance:**
- [ ] Team-visible status answers "is the system doing work right now?" without KQL.
- [ ] Checks catalogue includes at least one form preflight, one SSE consumer check, one AI prompt check, and one stash-readiness check.
- [ ] Every new check emits `OpsChecks.Run.*` telemetry via the existing route.

### Phase F - Pull culture & tasking groundwork (whiteboard arc)

Follow-on phases for the Roadmap Whiteboard. None of these begin until A2 has shipped and the user has used it for at least one full week.

| # | Change | Detail |
|---|--------|--------|
| F1 | Notes & comment threads | Per-item lightweight markdown notes plus an append-only comment thread. Still dev-owner only. Notes use the existing `data-helix-region` and `bodyText` typography rules. |
| F2 | Trusted-collaborator visibility | Allow specific admins (initially KW, AC) to **view** the whiteboard and **comment**, but not reorder. Read/comment is gated by `isAdminUser` plus an explicit allowlist. Reorder/edit stays dev-owner. |
| F3 | Pull-culture pickup | Items can be tagged "open for pickup". Trusted collaborators can claim a tagged item, which transfers `assignee` and stamps a pickup event. Whiteboard owner sees claims as a notification microline in Forge. |
| F4 | Tasking-system schema bridge | Generalise the item shape to support `assignee`, `dueDate`, `parentId`, and `links: { matterRef?, instructionRef?, enquiryId? }`. Migrate JSON → SQL once concurrent editing is real (likely Instructions DB to align with stash and matter context). Stays dev-internal until a full tasking surface is scoped. |
| F5 | Hub-wide tasking entry point | Only after F4 is stable: scope a separate brief that turns the schema into a hub-wide tasking experience (likely a new tab, not Forge). This phase is a **pointer**, not a plan — it ends with a new stash brief, not code. |

**Phase F acceptance:**
- [ ] F1: notes/comments persist alongside items and respect the dev-owner gate.
- [ ] F2: at least one non-dev admin can view the whiteboard read-only and comment.
- [ ] F3: a pickup event emits telemetry and updates the assignee atomically.
- [ ] F4: SQL migration script exists and round-trips JSON without data loss.
- [ ] F5: a fresh stash brief (`hub-tasking-system-*`) is created via `tools/stash-new.mjs` and linked from this brief's coordinates_with list.

**Phase F gotchas:**
- Do not let F2 widen Forge's overall visibility. The whiteboard surface gets its own visibility check; the rest of Forge stays dev-owner only.
- Do not move to SQL before F2/F3 prove the workflow. Premature schema work is the most likely way this arc dies.
- The hub-wide tasking system (F5) is a **separate product**, not a continuation of this brief. Keep this brief focused on the dev-owner whiteboard and its immediate collaboration extensions.

### Phase E - Self-improving session and cross-app contracts

| # | Change | Detail |
|---|--------|--------|
| E1 | Session journal | On explicit session end, write a 3-bullet journal to `/memories/session/_journal.md`: touched, learned, follow-up. Read it on next relevant continuation. |
| E2 | Contract registry | Create `docs/CROSS_APP_CONTRACTS.md` generated from read-only scans of `tab-app`, `instruct-pitch`, and `enquiry-processing-v2` route/payload references. |
| E3 | Contract drift checks | Add a Forge/Checks entry that highlights stale or unverified cross-app contracts. |

**Phase E acceptance:**
- [ ] `docs/CROSS_APP_CONTRACTS.md` exists with route/payload/owner/last-verified fields.
- [ ] Submodules are read only; no fetch/pull/push happens without the existing sync trigger flow.
- [ ] Forge can show at least one cross-app contract that has been verified by a script.

---

## 4. Step-by-step execution order

1. **Preflight** - run `node tools/stash-precheck.mjs --draft docs/notes/HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md` before each phase.
2. **A1** - Done. Generated marker helper/convention, `.gitattributes` hints, Forge marker reporting.
3. **A2 (Roadmap Whiteboard MVP)** - Done. JSON store + `/api/dev-console/roadmap` CRUD + `RoadmapWhiteboard.tsx` lane UI + drag interaction shipped inside Forge.
4. **A2.1 (stash linkage)** - light read-only enrichment: render richer brief status/conflict/stale warnings and add a proper brief-id picker for linked items.
5. **A3** - add `_observations.md` and a tiny append/list helper; show unresolved observations in Forge.
6. **A4** - build `tools/stash-graph.mjs --print` and a compact Forge cluster view. Optional, lower priority than B1.
7. **B1** - implement changelog inspector route; add telemetry and a Forge affordance.
8. **B2/B3** - only after the flat-file observation flow proves useful, add lessons promotion and retro trigger instructions.
9. **C** - add ageing and diff-drain behaviour.
10. **D** - generalise Checks catalogue and add the team telemetry strip.
11. **E** - add session journal and cross-app contract registry.
12. **F1→F5** - whiteboard collaboration arc. Each sub-phase is independently shippable; do not start F4 until F2/F3 are exercised. F5 ends in a new stash brief, not code.

Parallelisable bits:
- A3 observation seed can run in parallel with A2 whiteboard if the JSON schema doesn't share a file.
- A4 stash graph can run in parallel with B1 changelog inspector.
- F1 notes can prototype against the JSON store while F2 visibility design is being scoped.
- E2 contract registry should wait until the cross-app route/payload scan shape is clear.

---

## 5. Verification checklist

**Every phase:**
- [ ] `node tools/stash-precheck.mjs --draft docs/notes/HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md` has no undeclared shared-file conflicts.
- [ ] `node tools/stash-lint.mjs` exits 0.
- [ ] `node tools/stash-status.mjs` rebuilds `docs/notes/INDEX.md`.
- [ ] `npx tsc --noEmit --pretty false` exits 0 for client/server TypeScript where touched.
- [ ] `logs/changelog.md` gets one entry for behaviour/UI/server/tooling changes.

**Phase A:**
- [x] Roadmap Whiteboard renders inside Forge for the dev-owner only.
- [x] `/api/dev-console/roadmap` GET/POST/PATCH/DELETE all 403 for non-dev-owner.
- [x] Whiteboard items survive server restart and reload, and drag reorder persists.
- [x] `/api/dev-console/summary` still returns for LZ and 403s for non-dev-owner.
- [ ] (A4) `node tools/stash-graph.mjs --print` emits Mermaid text with no parser errors.

**Phase B:**
- [ ] `POST /api/dev/changelog-inspect` accepts a date range and returns <=200 words.
- [ ] App Insights events: `DevConsole.ChangelogInspect.Started/Completed/Failed` visible.
- [ ] Failure response is safe and does not leak raw client PII.

**Phase C:**
- [ ] `node tools/dev-observe.mjs list --status open` shows unresolved observations.
- [ ] Observations can be marked fixed/dismissed without hand-editing the file.

**Phase D:**
- [ ] Checks catalogue includes at least four non-route check types.
- [ ] Team-visible telemetry strip degrades quietly when data is unavailable.

**Phase E:**
- [ ] Contract registry generation is read-only against submodules.
- [ ] Cross-app drift check reports verified/skipped/stale states.

**Phase F:**
- [ ] F1 notes/comments persist and respect dev-owner gate.
- [ ] F2 read-only collaborators are gated by `isAdminUser` plus an explicit allowlist; reorder remains dev-owner.
- [ ] F3 pickup events emit `DevConsole.Roadmap.Pickup.*` telemetry and update assignee atomically.
- [ ] F4 SQL migration round-trips JSON without data loss.
- [ ] F5 produces a new `hub-tasking-system-*` stash brief and links it from this brief's `coordinates_with`.

---

## 6. Open decisions (defaults proposed)

1. **Location of the control plane** - Default: keep everything inside System > Forge. Rationale: Phase A already seeded this surface and avoids a second dev console.
2. **Observation storage** - Default: flat file first, SQL later. Rationale: fast, reversible, and proves value before schema work.
3. **Generated marker wording** - Default: `AUTO-GENERATED - do not edit. Regenerate with <command>`. Rationale: ASCII-safe and grep-friendly.
4. **Changelog inspector model** - Default: reuse the repo's existing AI route/client conventions. Rationale: no new AI abstraction unless existing helpers cannot support the task.
5. **Contract registry freshness** - Default: generated markdown plus an optional JSON manifest. Rationale: readable first, machine-readable when drift checks need it.

---

## 7. Out of scope

- Do not replace `docs/notes/INDEX.md`; it remains the stash source of truth.
- Do not mutate submodules while building the contract registry.
- Do not add production deploy or runtime mutation flows.
- Do not make the Forge surface visible to everyone until the data has been reviewed for sensitivity.
- Do not add a database table for lessons until the flat-file observation flow has shipped and been used.
- Do not build a generic analytics dashboard; this is a dev-productivity control plane.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) - System lens composition and KPIs.
- [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) - Forge/Checks visual treatment.
- [src/tabs/roadmap/hooks/useActivityLayout.ts](../../src/tabs/roadmap/hooks/useActivityLayout.ts) - persisted lens state.
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) - lens to panel routing.
- [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) - Forge UI.
- [src/tabs/roadmap/parts/RouteChecksPanel.tsx](../../src/tabs/roadmap/parts/RouteChecksPanel.tsx) - Checks UI.

Server:
- [server/index.js](../../server/index.js) - route registration.
- [server/routes/dev-console.js](../../server/routes/dev-console.js) - Forge API and future changelog/graph/artefact summary expansion.
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js) - checks catalogue/run endpoints.
- [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) - check definitions and execution.
- [server/utils/stashMeta.js](../../server/utils/stashMeta.js) - server metadata parser mirror.

Scripts / docs:
- [tools/stash-new.mjs](../../tools/stash-new.mjs) - stash scaffold reference.
- [tools/stash-precheck.mjs](../../tools/stash-precheck.mjs) - overlap scanner.
- [tools/stash-status.mjs](../../tools/stash-status.mjs) - generated index writer and marker target.
- [tools/sync-context.mjs](../../tools/sync-context.mjs) - generated context writer and marker target.
- `src/tabs/roadmap/parts/RoadmapWhiteboard.tsx` (NEW, A2) - whiteboard UI.
- `server/routes/dev-roadmap.js` (NEW, A2) - whiteboard CRUD route, dev-owner gated.
- `data/roadmap-whiteboard.json` (NEW, A2) - JSON store for whiteboard items (decide gitignore vs commit at first write).
- `tools/stash-graph.mjs` (NEW, A4) - Mermaid graph generator.
- `tools/dev-observe.mjs` (NEW, A3/C1) - Health Observation recorder/list helper.
- `docs/notes/_observations.md` (NEW, A3) - persisted observation ledger.
- `docs/CROSS_APP_CONTRACTS.md` (NEW, E2) - generated cross-app registry.
- [.gitattributes](../../.gitattributes) - generated-file hints.
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: helix-software-dev-productivity-control-plane
verified: 2026-05-03
branch: main
touches:
  client:
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/Activity.css
    - src/tabs/roadmap/hooks/useActivityLayout.ts
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/parts/DevConsolePanel.tsx
    - src/tabs/roadmap/parts/RoadmapWhiteboard.tsx
    - src/tabs/roadmap/parts/RouteChecksPanel.tsx
  server:
    - server/index.js
    - server/routes/dev-console.js
    - server/routes/dev-roadmap.js
    - server/routes/ops-checks.js
    - server/utils/opsCheckCatalog.js
    - server/utils/stashMeta.js
  data:
    - data/roadmap-whiteboard.json
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - clio-webhook-reconciliation-and-selective-rollout
  - forms-preflight-matrix-in-activity-tab
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - resources-tab-restructure-with-templates-section
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- Phase A.0 already exists. Do not create a new top-level Dev Console tab; extend System > Forge unless the user explicitly changes the design.
- `server/utils/stashMeta.js` mirrors `tools/lib/stash-meta.mjs`; if stash metadata parsing changes, update both.
- `docs/notes/INDEX.md` is generated. Never hand-edit it; run `node tools/stash-status.mjs`.
- `RouteChecksPanel` already supports grouped checks and inputs. Universal checks should extend `opsCheckCatalog`, not invent a second checks framework.
- Submodules are read-only by instruction. The cross-app registry must scan, not mutate, `submodules/**`.
- The current `docs/notes/prompts.txt` is an unstructured ideas file, not a durable changelog-inspector spec. If resurrecting the deleted seed, put it in this brief or a proper `docs/ideas/` home, not repo-root scratch.
- **Whiteboard (A2):** the JSON store is private. If `data/roadmap-whiteboard.json` ever contains client names, matter refs, or anything beyond shorthand, gitignore it before committing. Treat the file like `.env` once it has real content.
- **Whiteboard (A2):** do not introduce `react-dnd` or `@dnd-kit` for MVP. HTML5 DnD is enough for one user on desktop. Re-evaluate only if F2 brings real concurrent editors.
- **Whiteboard (A2):** `manualOrder` is a float to make midpoint inserts cheap; do not use integer indexes that require re-stamping every neighbour on each drag.
- **Phase F:** F5 (hub-wide tasking) **must** spawn a new stash brief instead of growing this one. Resist the urge to keep extending this document past the dev-owner whiteboard arc.