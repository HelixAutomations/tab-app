# Unified signals inbox in System tab (formerly: Agent suggestions inbox)

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then continue from the first unchecked item. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-07 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quote (2026-05-07): *"as a dev i would love a little mechanism in my system tab that literally just streams me suggestions of the next item for me in that way... i work and when im free i look there and its just boom, heres what he agents suggested during your sessions. these can also surface in the prompt response at the bottom with the health observation, but this starts to clutter my view so make both the new and health observations compact."*

Follow-up scope (2026-05-07): *"scope existing tech problem and idea tables, maybe we can amalgamate all that into one process? ... so we dont break anything but we open the opportunity to store also bits for those forms if if we want to?"*

The compounding loop today loses signal across **four** intake silos:
1. `dbo.tech_problems` (helix_projects DB) — bug/problem submissions via Tech Problem form, BugReporter, CCL Report.
2. `dbo.tech_ideas` (helix_projects DB) — improvement ideas via Tech Idea form.
3. `data/roadmap-whiteboard.json` — dev-owner personal whiteboard for the System > Forge lens.
4. `docs/notes/INDEX.md` (+ `docs/notes/*.md`) — stash briefs (agent-authored).

Plus the new **agent footer envelope** (`<!-- helix-suggestions {...} -->`) emitted at the end of code-changing chat responses (Health Observations + Stash candidates).

Today, items in any one silo are invisible to the others. The user has to remember which surface holds which thread. The Suggestions Inbox is the unified read-view; `dbo.signals` is the unified write target.

**Hard constraint: additive mirror, not replacement.** Existing tables, forms, routes, and submission flows are untouched. Each source opts in by adding a single `recordSignal({...})` call after its successful primary write. Failure of the mirror call is logged-only and never blocks the original submission. No data migrated. No columns dropped. No breaking renames.

---

## 2. Current state — verified findings

### 2.1 Footer convention is already defined and compacted

- File: [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — Continuous Health Observations section (~L150) and Stash candidates section (~L168) emit the compact one-line footer + a hidden `<!-- helix-suggestions {"health":[...],"stash":[...]} -->` JSON envelope. (Edited 2026-05-07.)
- The envelope is the structured handoff to the inbox: a capture script can parse the comment without scraping markdown bullets.

### 2.2 System tab is the chosen surface

- File: [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) renders the System tab shell and lens chips.
- File: [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) switches between System lenses. The signals inbox now lives here as a dedicated `signals` lens.
- Rationale: the user explicitly asked for a mechanism in the System tab. Signals are operational/dev workflow items, not personal profile items, so System is cleaner than My Helix.

### 2.3 Existing intake surfaces — what mirrors and how

| Source | Storage today | Mirror call site | Mirror payload | Notes |
|---|---|---|---|---|
| Tech Problem form | `dbo.tech_problems` (helix_projects) | `server/routes/techTickets.js` after `INSERT INTO tech_problems` succeeds | `{ source: 'tech_problem', title: summary, sourceRecordId: <new id>, asanaTaskGid? }` | Asana lifecycle stays on the original table; mirror is read-only. |
| Tech Idea form | `dbo.tech_ideas` (helix_projects) | same route, idea handler | `{ source: 'tech_idea', title }` | |
| Roadmap whiteboard | `data/roadmap-whiteboard.json` | (no mirror — read on demand) | n/a | Already has its own ledger surface (Forge lens). Inbox can read it lazily in Phase 3. |
| Stash briefs | `docs/notes/*.md` + `docs/notes/INDEX.md` | (no mirror — read on demand) | n/a | INDEX is already the canonical ledger. Inbox can read it lazily. |
| Agent footer envelope | none today | `tools/capture-suggestions.mjs` parses transcript and POSTs to `/api/signals` | `{ source: 'agent_health' \| 'agent_stash', title: summary, fileRef: file }` | Manual paste in Phase 1; auto-capture decision in Phase 4. |

### 2.4 Existing unified ledger endpoint (precedent)

- `server/routes/techTickets.js` already exposes `GET /api/tech-tickets/ledger` that UNIONs `tech_ideas` + `tech_problems`. The unified-ledger pattern is established. The new `/api/signals` endpoint generalises it across more sources.

---

## 3. Plan

Four phases. Phase 1 is the spine (table + helper + ingest endpoint). Phase 2 is the UI. Phase 3 wires the existing forms (opt-in mirror). Phase 4 polishes auto-capture and roadmap/stash read-through.

### Phase 1 — Spine (SHIPPED 2026-05-07)

| # | Change | File | Status |
|---|--------|------|--------|
| 1.1 | Migration: `dbo.signals` on Instructions DB, idempotent. Indexes on `(status, created_at DESC)` and `(source, created_at DESC)`. | [scripts/migrate-add-signals.mjs](../../scripts/migrate-add-signals.mjs) | ✅ |
| 1.2 | Helper: `recordSignal()`, `listSignals()`, `updateSignalStatus()`. `INSTRUCTIONS_SQL_CONNECTION_STRING` gated. Best-effort, never throws. App Insights events `Signals.Recorded`, `Signals.Table.Missing`, `Signals.UnknownSource`, `Signals.StatusUpdated`. | [server/utils/signalsLog.js](../../server/utils/signalsLog.js) | ✅ |
| 1.3 | Route: `POST /api/signals` (single or batch), `GET /api/signals?status=&source=&limit=`, `PATCH /api/signals/:id`. Dev-group gate (LZ + AC). | [server/routes/signals.js](../../server/routes/signals.js) | ✅ |
| 1.4 | Mount in server. | [server/index.js](../../server/index.js) | ✅ |
| 1.5 | Run the migration in the current Instructions DB environment. | n/a | ✅ |

**Phase 1 acceptance:**
- `node scripts/migrate-add-signals.mjs` exits 0 (uses `INSTRUCTIONS_SQL_CONNECTION_STRING` or Key Vault fallback).
- `POST /api/signals` with `{ source: 'agent_health', title: 'smoke' }` returns 201 + id from a dev-group account; 403 from anyone else.
- `GET /api/signals` returns the inserted row.
- `PATCH /api/signals/<id>` with `{ status: 'dismissed' }` flips status.
- App Insights event `Signals.Recorded` visible.

### Phase 2 — Inbox UI in System tab

| # | Change | File | Detail |
|---|--------|------|--------|
| 2.1 | Build `SignalsInboxPanel.tsx` using existing System/Activity panel patterns | [src/tabs/roadmap/parts/SignalsInboxPanel.tsx](../../src/tabs/roadmap/parts/SignalsInboxPanel.tsx) | Compact list, source tag, one-line title, detail/path metadata, captured-at relative time, refresh button, dismiss button, structural placeholder rows, empty state. |
| 2.2 | Mount as a dedicated System lens | [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx), [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx), [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx), [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) | Dev-group only. Adds `signals` lens chip, open-count loader, KPI tile, and `data-helix-region="system/signals"`. |
| 2.3 | Manual capture script for agent footers | new `tools/capture-suggestions.mjs` | Reads a chat transcript file or stdin, finds `<!-- helix-suggestions ... -->` blocks, POSTs each item to `/api/signals`. |

**Phase 2 acceptance:** System shows a Signals lens with at least one seeded item per source. Dismiss removes from list and updates the lens/KPI count. `tools/capture-suggestions.mjs` can seed rows from a transcript.

### Phase 3 — Opt-in mirror from existing forms

| # | Change | File | Detail |
|---|--------|------|--------|
| 3.1 | Mirror `tech_problems` insert | [server/routes/techTickets.js](../../server/routes/techTickets.js) ~L283 | After successful `INSERT INTO tech_problems`, call `recordSignal({ source: 'tech_problem', title: summary, sourceRecordId, submittedBy, fileRef: system })` in try/catch. Log-only on failure. |
| 3.2 | Mirror `tech_ideas` insert | same file, idea handler | Same pattern, `source: 'tech_idea'`. |
| 3.3 | Mirror Asana-task-created event | same file, after Asana create succeeds | `updateSignalStatus(signalId, 'open', { promotedTo: `asana:${taskGid}` })` (signal stays open, but promoted_to is populated). |

**Phase 3 acceptance:** Submitting a Tech Problem in staging creates a `tech_problems` row AND a `signals` row visible in the Inbox. Form submission flow latency unchanged (mirror is non-blocking).

### Phase 4 — Polish

#### 4.1 Promote-to-stash action

Each row gets a "Stash this" button that POSTs to a thin `/api/signals/:id/stash` endpoint which runs `node tools/stash-new.mjs "<title>"` server-side, then `PATCH`es the signal with `status='promoted', promotedTo=<stash-id>`.

#### 4.2 Roadmap + INDEX read-through

`GET /api/signals` accepts `source=roadmap` and reads from `data/roadmap-whiteboard.json`; `source=stash` reads `docs/notes/INDEX.md`. No mirror writes; the inbox is the unified read view across persistent stores.

#### 4.3 Auto-capture decision

Choose between manual paste (current), VS Code extension hook scraping Copilot responses, or a local watcher on a chat-export folder. Default: manual paste until volume justifies tooling.

---

## 4. Step-by-step execution order

**Phase 1 (SHIPPED 2026-05-07):** migration, helper, route, mount.
**Phase 1.5 (operator):** run `node scripts/migrate-add-signals.mjs` in staging then prod (uses `INSTRUCTIONS_SQL_CONNECTION_STRING` or Key Vault fallback).
**Phase 2:** `SignalsInboxPanel.tsx` -> System `signals` lens -> `tools/capture-suggestions.mjs`.
**Phase 3:** add mirror calls in `techTickets.js` (problem insert → idea insert → asana-created update). Verify form latency unchanged.
**Phase 4:** promote-to-stash endpoint → roadmap/INDEX read-through → auto-capture decision.

---

## 5. Verification checklist

**Phase 1:**
- [x] `dbo.signals` table created with the column set in this brief.
- [x] `recordSignal()` returns `{ id }` on success and `{ id: null }` on no-op.
- [x] `POST /api/signals` returns 201 + ids; rejects non-dev-group with 403.
- [x] `GET /api/signals` returns recent rows newest-first.
- [x] `PATCH /api/signals/:id` with `{ status }` updates row and bumps `updated_at`.
- [x] App Insights events: `Signals.Recorded`, `Signals.StatusUpdated`, `Signals.Table.Missing` visible.
- [x] Migration applied in current Instructions DB environment.

**Phase 2:**
- [x] `SignalsInboxPanel` is mounted as a System lens for the dev group.
- [x] Dismiss button calls `PATCH /api/signals/:id` with `status='dismissed'` and removes from list locally.
- [x] System lens/KPI count reflects open signals.
- [ ] Browser smoke confirms the panel renders and dismisses against live API.
- [ ] `tools/capture-suggestions.mjs` parses a transcript and seeds the inbox.

**Phase 3:**
- [ ] Submitting a Tech Problem produces a `tech_problems` row AND a `signals` row with `source='tech_problem'`.
- [ ] Submitting a Tech Idea produces a `tech_ideas` row AND a `signals` row with `source='tech_idea'`.
- [ ] Failing the mirror call (e.g. Instructions DB unavailable) does NOT fail the form submission.
- [ ] App Insights event `Signals.Recorded` shows `source` distribution across silos.

**Phase 4:**
- [ ] "Stash this" promotes a signal to a brief via `tools/stash-new.mjs` and links them via `promoted_to`.
- [ ] `GET /api/signals?source=roadmap` returns whiteboard items.
- [ ] `GET /api/signals?source=stash` returns INDEX entries.

---

## 6. Open decisions (defaults proposed)

1. **DB choice** — DECIDED: **Instructions DB** short-term (existing connection, already wired through `withRequest`, no new infra). Long-term likely move to a dedicated helper DB once volume + access patterns are clearer; the helper isolates the connection so the move is a one-line change.
2. **Auth model** — Default: **dev-group only (LZ + AC)** for Phases 1-3; widen to all admins after one week of clean usage.
3. **Footer JSON envelope** — DECIDED: a single trailing HTML comment block: `<!-- helix-suggestions {"health":[...],"stash":[...]} -->`. Invisible in rendered markdown, trivial to parse.
4. **Manual vs auto capture** — Default: **manual paste** for Phase 2; revisit in Phase 4.
5. **Inbox position** — DECIDED: System tab, dedicated `signals` lens.
6. **Mirror failure mode** — DECIDED: log-only, never throw. Form submission flow must never be coupled to signals DB availability.

---

## 7. Out of scope

- Migrating historical `tech_problems` / `tech_ideas` rows into `signals`. They stay in their original tables; only new rows are mirrored.
- Replacing `/api/tech-tickets/ledger`. The existing endpoint and any UI it powers stay; `/api/signals` is additive.
- Capturing free-form agent prose. Only the structured `<!-- helix-suggestions ... -->` envelope.
- Cross-repo signals (instruct-pitch, enquiry-processing-v2). Each surface would post into its own ledger if/when adopted.
- Slack/Teams notifications. The inbox is pull-only by design.
- Exposing signals to non-dev-group users until Phase 4 grooming validates volume + quality.

---

## 8. File index (single source of truth)

Server (SHIPPED Phase 1):
- [server/utils/signalsLog.js](../../server/utils/signalsLog.js) (NEW) — helper: recordSignal, listSignals, updateSignalStatus.
- [server/routes/signals.js](../../server/routes/signals.js) (NEW) — POST/GET/PATCH handlers, dev-group gate.
- [server/index.js](../../server/index.js) — mount point at `/api/signals`.

Server (Phase 3 — opt-in mirrors):
- [server/routes/techTickets.js](../../server/routes/techTickets.js) — add `recordSignal()` after `tech_problems` and `tech_ideas` inserts and Asana create.

Client (Phase 2):
- [src/tabs/roadmap/parts/SignalsInboxPanel.tsx](../../src/tabs/roadmap/parts/SignalsInboxPanel.tsx) (NEW) — inbox UI.
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — signals open-count loader, lens chip, KPI tile, FocalSurface props.
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) — `signals` lens type.
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — render `SignalsInboxPanel` for the signals lens.
- [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) — row, loading, and button styles.

Scripts / docs:
- [scripts/migrate-add-signals.mjs](../../scripts/migrate-add-signals.mjs) (NEW) — table + index migration. Idempotent.
- `tools/capture-suggestions.mjs` (NEW, Phase 2) — manual transcript-to-DB seeding tool.
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — footer envelope convention (already shipped 2026-05-07).
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: agent-suggestions-inbox-in-my-helix
verified: 2026-05-07
branch: main
touches:
  client:
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/ActivityHero.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/parts/SignalsInboxPanel.tsx
    - src/tabs/roadmap/Activity.css
  server:
    - server/routes/signals.js
    - server/routes/techTickets.js
    - server/utils/signalsLog.js
    - server/index.js
  submodules: []
depends_on: []
coordinates_with:
  - instruction-and-prompt-estate-refresh   # phase 1 of that brief edits the same footer convention
conflicts_with: []
```

---

## 9. Gotchas appendix

<The non-transferable residue. Things you only spot by tracing the code in this session. Examples:>

- `<file>` line N uses `event.stopPropagation()` on the inner Edit click — preserve that when restructuring or the parent row's onClick will fire.
- `<helper>` looks like a one-liner but has hidden side effects in <other file>.
- The `<seemingly-obvious-fix>` was tried before and reverted in commit `<sha>` because <reason>.
