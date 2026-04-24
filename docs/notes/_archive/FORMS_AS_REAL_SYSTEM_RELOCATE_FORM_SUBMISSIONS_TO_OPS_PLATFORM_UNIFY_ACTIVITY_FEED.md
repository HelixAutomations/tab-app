# Forms-as-real-system: relocate `form_submissions` to ops platform + unify Activity feed

> **Purpose.** Move the `form_submissions` audit table off legacy `helix-core-data` and onto the new `helix-operations` platform DB (where `ai_proposals` already lives), then surface both into the Activity tab so the team sees "AI suggested → user submitted → side-effects landed" as a single timeline.
>
> **Verified:** 2026-04-21 against branch `main`. **Status:** ✅ shipped same day. Kept as the reference doc for the cross-cutting change.

---

## 1. Why this exists (user intent)

The new `helix-operations` DB was stood up as the shared "audit / utility / cross-app workflow" platform. `dbo.ai_proposals` was its first table. `dbo.form_submissions` belongs in the same bucket: cross-cutting, audit-shaped (per-form business tables — Undertakings, Complaints, tech_ideas — stay where they are), cheap to lose, wants kill-switch + serverless-pause economics, and will be read by future surfaces (Activity tab, ⌘K, Recruitment app).

User instruction (verbatim): *"at the same time yeah. implement in full, stay focused and dont get distracted. track as a brief if required to refenrence"*.

Not in scope: per-form retrigger handlers (already work; just point at the helper, which now reads ops); authn changes; Activity-tab UI changes (backend-only — existing item shape covers the new sources).

---

## 2. Current state — verified findings

### 2.1 `form_submissions` lives on legacy DB

- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) L36–38: `getConnStr()` returns `process.env.SQL_CONNECTION_STRING` (= `helix-core-data`).
- [server/routes/processHub.js](../../server/routes/processHub.js) L91–98: `getConnectionString()` reads `SQL_CONNECTION_STRING` for the rail SELECT.
- [scripts/migrate-add-form-submissions.mjs](../../scripts/migrate-add-form-submissions.mjs) L29–32: original migration targets `helix-core-data`.

### 2.2 `ai_proposals` already on ops platform

- [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js) L46–51: `getConnStr()` two-stage gate (`OPS_PLATFORM_ENABLED=true` + `OPS_SQL_CONNECTION_STRING`).
- Lives in `helix-operations.dbo.ai_proposals` since 2026-04-21.

### 2.3 Activity feed sees neither

- [server/routes/activity-feed.js](../../server/routes/activity-feed.js) aggregates: `teams.bot`, `tracked-card` (Instructions DB), `cardlab.send`, `card.send`, `bot.action`, `dm.send`, `ccl.autopilot`. No `form_submissions`. No `ai_proposals`.

---

## 3. Plan (as shipped)

### Phase A — relocate `form_submissions`

| # | Change | File |
|---|--------|------|
| A1 | New ops-side migration (gated on `OPS_PLATFORM_ENABLED`) | `scripts/migrate-add-form-submissions-ops.mjs` (NEW) |
| A2 | Repoint helper `getConnStr()` to two-stage ops gate | [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) |
| A3 | Backfill rows from core-data → ops | `scripts/backfill-form-submissions-to-ops.mjs` (NEW) |
| A4 | Repoint rail reader to ops connection string | [server/routes/processHub.js](../../server/routes/processHub.js) |

### Phase B — unify Activity feed

| # | Change | File |
|---|--------|------|
| B1 | Read recent `form_submissions` rows + map to Activity items | [server/routes/activity-feed.js](../../server/routes/activity-feed.js) |
| B2 | Read recent `ai_proposals` rows + map (LEFT JOIN to surface "AI-assisted" link) | same file |

Both new feeds tolerate `OPS_PLATFORM_ENABLED=false` (return `[]`, never throw).

---

## 4. Verification (as run on 2026-04-21)

- [x] `node scripts/migrate-add-form-submissions-ops.mjs` → table + indexes created on `helix-operations`.
- [x] `node scripts/backfill-form-submissions-to-ops.mjs` → row-count match between source and dest.
- [x] `node tools/ops-platform-control.mjs status` → DB still online, both tables present.
- [x] FormsHub right rail still loads (now reading from ops DB).
- [x] Activity tab shows form submissions + AI proposals interleaved with existing card/bot events.
- [x] Kill switch verified: `OPS_PLATFORM_ENABLED=false` makes the rail go quiet (no errors), Activity tab keeps working without form/proposal items.

---

## 5. Rollback

1. Set `FORM_SUBMISSIONS_USE_LEGACY=true` → `processHub.js` reads from core-data again.
2. Set `OPS_PLATFORM_ENABLED=false` → all ops writes/reads go dark.
3. Legacy `helix-core-data.dbo.form_submissions` is left intact for 30 days post-cutover, then dropped.

---

## 6. File index

Server:
- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js)
- [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js)
- [server/routes/processHub.js](../../server/routes/processHub.js)
- [server/routes/activity-feed.js](../../server/routes/activity-feed.js)

Scripts / docs:
- `scripts/migrate-add-form-submissions-ops.mjs` (NEW)
- `scripts/backfill-form-submissions-to-ops.mjs` (NEW)
- [scripts/migrate-add-form-submissions.mjs](../../scripts/migrate-add-form-submissions.mjs) — original (legacy DB), kept for rollback reference
- [docs/HELIX_OPERATIONS_PLATFORM.md](../../docs/HELIX_OPERATIONS_PLATFORM.md) — runbook
- [docs/notes/FORMS_STREAM_PERSISTENCE_PLAN.md](FORMS_STREAM_PERSISTENCE_PLAN.md) — predecessor plan (B1–B5 shipped against legacy DB; this brief is its B7 relocation)

### Stash metadata

```yaml
# Stash metadata
id: forms-as-real-system-relocate-form-submissions-to-ops-platform-unify-activity-feed
shipped: true
shipped_on: 2026-04-21
verified: 2026-04-21
branch: main
status: shipped
touches:
  client: []
  server:
    - server/utils/formSubmissionLog.js
    - server/routes/processHub.js
    - server/routes/activity-feed.js
  submodules: []
depends_on:
  - helix-operations-platform-standup
coordinates_with:
  - forms-stream-persistence
conflicts_with: []
```

---

## 7. Gotchas appendix

- The `getConnStr()` helper in `formSubmissionLog.js` is intentionally called per request, not cached at module load — Key Vault resolution may not have finished at require-time. Preserve that pattern when editing.
- `processHub.js` `probeProcessHub()` builds the query string by concatenation around `whereClause`. The table name is `dbo.form_submissions` on both DBs, so SQL is unchanged — only the connection string changes.
- `activity-feed.js` items must have a `timestamp` parseable by `Date.parse`; missing values sort to the bottom (treated as 0). Map ISO strings, not raw `Date` objects.
- Backfill uses `MERGE` keyed on `id` (UNIQUEIDENTIFIER) so re-running is idempotent. Don't switch to `INSERT` or you'll break re-run safety.
# Forms-as-real-system: relocate form_submissions to ops platform + unify Activity feed

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-21 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

<1–3 short paragraphs. Quote the user verbatim where possible. State what the request is and what the user is *not* asking for.>

---

## 2. Current state — verified findings

<For every claim, cite a file path and line number. No memory-based assertions.>

### 2.1 <subsystem / area>

- File: [path/to/file.ts](../../path/to/file.ts) — what it currently does
- Notable line refs: L###, L###

### 2.2 <next subsystem>

…

---

## 3. Plan

### Phase A — <small, independently shippable correction>

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | … | [path](../../path) | … |
| A2 | … | … | … |

**Phase A acceptance:** <bullet list of observable outcomes>

### Phase B — <larger architectural piece>

#### B1. <component>

<DDL, function signatures, data flow — whatever a future agent needs>

#### B2. <next component>

…

---

## 4. Step-by-step execution order

1. **A1** — <action>
2. **A2** — <action>
3. *(parallel with 4)* **B1** — <action>
4. *(parallel with 3)* **B2** — <action>
5. …

---

## 5. Verification checklist

**Phase A:**
- [ ] <observable outcome>
- [ ] <observable outcome>

**Phase B:**
- [ ] <observable outcome>
- [ ] App Insights events: `<EventName.Started/Completed/Failed>` visible
- [ ] SQL spot check: `<query>`

---

## 6. Open decisions (defaults proposed)

1. **<decision>** — Default: **<recommended option>**. Rationale: <one line>.
2. **<decision>** — Default: **<recommended option>**.

---

## 7. Out of scope

- <item>
- <item>

---

## 8. File index (single source of truth)

Client:
- [path](../../path) — purpose

Server:
- [path](../../path) — purpose

Scripts / docs:
- `path` (NEW) — purpose
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: forms-as-real-system-relocate-form-submissions-to-ops-platform-unify-activity-feed                          # used in INDEX cross-refs
verified: 2026-04-21
branch: main
touches:
  client: []
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with: []              # ids that touch the same files but don't block
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

<The non-transferable residue. Things you only spot by tracing the code in this session. Examples:>

- `<file>` line N uses `event.stopPropagation()` on the inner Edit click — preserve that when restructuring or the parent row's onClick will fire.
- `<helper>` looks like a one-liner but has hidden side effects in <other file>.
- The `<seemingly-obvious-fix>` was tried before and reverted in commit `<sha>` because <reason>.
