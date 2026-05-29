# Agent ratings and reminders system

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-23 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User asked, verbatim: *"maybe some kind of user rating mechanism that persists in a light file like changelog so we can easily see which prompts or tasks from experience felt a breeze and the agent will sort of figure out itself what was good? what do you think? just by user saying wow that was excellent or that was a breeze etc."*

Follow-up extension, verbatim: *"matter of fact this suggests another idea, repo reminders. reminders to users via the chat tab in teams etc. and a way for them to be asked to be reminded / so a reminder intake. you see? scope this in system for now for luke etc. but this is a great idea... we will need a table to persist these I think, and there might be overlap later re reminders specific to Clio and things so this will need to be future proof so we dont double up."*

Three separable but tightly coupled needs:

1. **Capture honest agent-task ratings** in a lightweight append-only log triggered by natural user phrases (no extra UI). Over time produce a readout that exposes which kinds of tasks consistently feel great vs which need scaffolding, and feeds back into how the agent works on those areas.
2. **Agent-side reminders surface** so the user does not have to remember scheduled chores. Seed entry: run `tools/instruction-impact-snapshot.mjs --compare` next Friday and report the diff for the colleague who triggered this whole programme.
3. **Team-facing reminders** persisted in SQL, surfaced inside the Hub (Teams chat tab) with an intake (the user can request a reminder from chat or UI). Starts with LZ and the dev tier; designed so future Clio-sourced reminders (matter follow-ups, AML review windows, RTI dates) land in the same table without duplicates.

User is NOT asking for a multi-tenant scheduler, a calendar replacement, or push notifications outside Teams. Stays inside the existing Hub surfaces and the operator CLI.

---

## 2. Current state - verified findings

### 2.1 Existing instruction impact snapshot tool (already shipped this session)

- File: [tools/instruction-impact-snapshot.mjs](../../tools/instruction-impact-snapshot.mjs) - captures always-on context size, validator status, estate volume, changelog cadence, stash queue health. Supports `--save` and `--compare`.
- Baseline snapshot: `logs/instruction-impact/2026-05-23T12-54-20-744Z.json`.
- This is the thing the Friday reminder needs to invoke.

### 2.2 Session start and sync plumbing (where reminders should land)

- [tools/sync-context.mjs](../../tools/sync-context.mjs) - generates `.github/instructions/REALTIME_CONTEXT.md`. The natural place to inject due reminders so the agent sees them on session start.
- [tools/session-start.mjs](../../tools/session-start.mjs) - heavier session init path.
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) `## Session Start` section - currently silent on open; rules need a new line so the agent surfaces due reminders as the first reply of the session.

### 2.3 Changelog and logs conventions

- [logs/changelog.md](../../logs/changelog.md) - reserved for behaviour changes. **Do not** dump ratings here. Ratings get their own file.
- `logs/instruction-impact/` already exists with snapshot JSONs. Same parent directory will host `logs/agent-ratings.jsonl` and the report output.

### 2.4 Stash routine touchpoints

- [tools/stash-precheck.mjs](../../tools/stash-precheck.mjs), [tools/stash-new.mjs](../../tools/stash-new.mjs), [tools/stash-status.mjs](../../tools/stash-status.mjs) - existing routines this brief follows.
- This brief's metadata declares coordination with two open briefs that also touch `.github/copilot-instructions.md` (see metadata block below).

---

## 3. Plan

### Phase A - Reminders (smallest independently shippable correction)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New data file | `data/agent-reminders.json` (NEW) | Array of `{ id, due (YYYY-MM-DD), message, recurring?: "weekly"\|"monthly", createdAt, createdBy?: "agent"\|"user" }`. Start with one seed entry for 2026-05-29 to run the snapshot compare. |
| A2 | New script | `tools/reminder-add.mjs` (NEW) | Usage: `node tools/reminder-add.mjs --due 2026-05-29 --message "..." [--recurring weekly]`. Appends to the JSON file. Auto-generates id from message slug + due. |
| A3 | New script | `tools/reminder-check.mjs` (NEW) | Prints due-and-overdue reminders. Exit code 0 always. Output format matches the REALTIME_CONTEXT block style. Supports `--mark-done <id>` to remove a non-recurring reminder and `--bump <id>` to advance a recurring one. |
| A4 | Wire into sync | [tools/sync-context.mjs](../../tools/sync-context.mjs) | At the end of REALTIME_CONTEXT.md generation, append a `## Due reminders` section by shelling out to `reminder-check.mjs`. Section is omitted entirely if nothing is due. |
| A5 | Instruction rule | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) `## Session Start` | Add: "On session start, if REALTIME_CONTEXT.md contains a `## Due reminders` block, surface it as the first message of the session (one line per reminder, with the action and a y/n prompt). Trigger phrases for adding new reminders: `remind me on <date>`, `remind me weekly`, `set a reminder for`." |
| A6 | Seed reminder | `data/agent-reminders.json` | Insert: `{ id: "snapshot-friday-2026-05-29", due: "2026-05-29", message: "Run \`node tools/instruction-impact-snapshot.mjs --compare\` and report the diff for Jonathan.", recurring: null, createdAt: "2026-05-23", createdBy: "agent" }`. |

**Phase A acceptance:**
- `node tools/reminder-add.mjs --due 2026-05-29 --message "test"` appends valid JSON, idempotent on identical ids.
- `node tools/reminder-check.mjs` on 2026-05-29 prints the snapshot reminder.
- Running the sync flow on 2026-05-29 surfaces the reminder in REALTIME_CONTEXT.md.
- New copilot-instructions rule is under 8 lines, no em dashes, sits inside `## Session Start`.

### Phase B - Ratings capture

#### B1. Storage

- File: `logs/agent-ratings.jsonl` (append-only JSON Lines).
- Row shape:
  ```jsonc
  {
    "ts": "2026-05-23T12:30:00Z",
    "score": 9,                      // 1-10 inferred from trigger or parsed from explicit /rate
    "sentiment": "positive",         // positive | negative | neutral
    "trigger": "first try",          // exact phrase that fired the capture
    "summary": "<agent 1-liner>",    // agent's own description of the task just completed
    "files": ["src/foo.ts"],         // files touched in the rated task
    "turns": 4,                      // user turns in the rated task
    "tools": ["replace_string","subagent"],
    "tags": ["ui","ccl"]
  }
  ```

#### B2. Tools

- `tools/rating-log.mjs` (NEW) - append a row. Usage: `node tools/rating-log.mjs --score 9 --trigger "first try" --summary "..." --files "a.ts,b.ts" --turns 4 --tools "x,y" --tags "ui,ccl"`. Validates JSON, refuses duplicate ts within 60s window (debounce against accidental double-log).
- `tools/rating-report.mjs` (NEW) - reads the JSONL and prints:
  - Top 5 tags by avg score (n >= 3)
  - Files appearing in score >= 8 work vs score <= 4 work
  - 7-day / 30-day average score trend
  - Tool combinations correlated with high scores
  - `--since YYYY-MM-DD` to scope the window
  - `--export-md path/to/report.md` for sharing

#### B3. Trigger phrase taxonomy (lives in copilot-instructions.md)

- **Strong positive (+2 sentiment, score 9-10)**: `"that was a breeze"`, `"nailed it"`, `"first try"`, `"perfect"`, `"wow excellent"`, `"exactly what I wanted"`.
- **Positive (+1, score 7-8)**: `"smooth"`, `"good"`, `"nice"`, `"love it"`, `"great work"`.
- **Negative (-1, score 3-4)**: `"painful"`, `"too long"`, `"missed the point"`, `"frustrating"`.
- **Strong negative (-2, score 1-2)**: `"completely wrong"`, `"had to repeat myself"`, `"useless"`.
- **Explicit override**: `/rate <1-10> [tag]` or `rate that <1-10>` - parses score directly, ignores phrase-based inference.

#### B4. Agent rules (additions to copilot-instructions.md)

- On detecting a trigger phrase in a user turn, append exactly one row to `logs/agent-ratings.jsonl` via `tools/rating-log.mjs`. One row per user turn maximum. Silent capture (no inline acknowledgement unless the user used `/rate`).
- Summary = the agent's own 1-line description of the *task just completed in the prior turn*, not the praise turn itself.
- Never write rows the user did not trigger. Never self-score. Never edit existing rows.
- If multiple positive phrases appear in one turn, the strongest wins; do not double-log.

#### B5. Readout integration

- `tools/sync-context.mjs` - on each run, also surface a one-line summary in REALTIME_CONTEXT.md: `Ratings: avg score last 7d = X.X (n=N).` Skip if no rows in window.

**Phase B acceptance:**
- A test row written via `rating-log.mjs --score 9 ...` lands in the JSONL.
- `rating-report.mjs` produces sensible output on a hand-crafted 10-row fixture.
- Trigger phrase rule is under 15 lines in copilot-instructions.md and references this brief's id.
- Silent capture verified: a positive-phrase chat reply does NOT mention the logging in the agent's response.

### Phase C - Team-facing reminders (SQL-backed, future-proofed for Clio)

Phase A's JSON file stays as the agent's own scratch surface (session-scoped, dev-only). Phase C is the persistent shared surface, scoped at first to LZ and the dev tier but with a schema that scales to all users and to external sources.

#### C1. Table: `dbo.reminders` (Instructions DB)

Operational data, not legal, so it sits in the Instructions DB next to `hub_todo` and the other ops tables (see [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) for the connection pattern and `scripts/migrate-add-hub-todo.mjs` for a precedent migration to mirror).

```sql
CREATE TABLE dbo.reminders (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  source          NVARCHAR(32)  NOT NULL,  -- 'user' | 'agent' | 'clio' | 'system' | 'asana'
  source_ref      NVARCHAR(128) NULL,      -- opaque external id (clio matter id, asana task id, etc.)
  dedupe_key      NVARCHAR(256) NULL,      -- UNIQUE per (source, source_ref, kind) to stop double-adds from sync jobs
  kind            NVARCHAR(64)  NOT NULL,  -- 'snapshot' | 'matter_followup' | 'aml_review' | 'custom' | ...
  target_user     NVARCHAR(32)  NOT NULL,  -- initials (LZ, AC, ...); future: 'team:operations' for group reminders
  target_channel  NVARCHAR(32)  NOT NULL DEFAULT 'hub',  -- 'hub' | 'teams_chat' | 'email' | 'agent_only'
  subject_type    NVARCHAR(32)  NULL,      -- 'matter' | 'instruction' | 'enquiry' | 'deal' | NULL
  subject_id      NVARCHAR(64)  NULL,      -- soft FK (matter id, InstructionRef, enquiry id)
  title           NVARCHAR(256) NOT NULL,
  message         NVARCHAR(MAX) NULL,
  due_at          DATETIME2(0)  NOT NULL,
  recurring       NVARCHAR(16)  NULL,      -- 'daily' | 'weekly' | 'monthly' | NULL
  status          NVARCHAR(16)  NOT NULL DEFAULT 'open',  -- 'open' | 'snoozed' | 'done' | 'dismissed'
  snoozed_until   DATETIME2(0)  NULL,
  last_shown_at   DATETIME2(0)  NULL,
  created_by      NVARCHAR(64)  NOT NULL,  -- 'agent' | 'LZ' | 'clio-sync' | ...
  created_at      DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  done_at         DATETIME2(0)  NULL,
  done_by         NVARCHAR(64)  NULL,
  metadata        NVARCHAR(MAX) NULL       -- JSON sidecar (deep link, related ids, etc.)
);

CREATE UNIQUE INDEX UX_reminders_dedupe ON dbo.reminders (source, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IX_reminders_due  ON dbo.reminders (target_user, status, due_at) INCLUDE (kind, title);
CREATE INDEX IX_reminders_subj ON dbo.reminders (subject_type, subject_id);
```

Anti-double-up: every sync source (Clio, Asana, future) MUST construct a stable `dedupe_key` (e.g. `clio:matter:12345:aml_review_due`). Upsert semantics on that key mean re-running a sync never creates duplicate rows.

#### C2. Migration script

- `scripts/migrate-add-reminders.mjs` (NEW). Follows the pattern of [scripts/migrate-add-hub-todo.mjs](../../scripts/migrate-add-hub-todo.mjs): idempotent (`IF NOT EXISTS`), connects via the standard helper, logs via App Insights `Migration.Reminders.{Started,Completed,Failed}`.

#### C3. Server routes

- `server/routes/reminders.js` (NEW). All routes tier-gated (Phase C starts at admin tier; widen later via the same monotonic ladder used by Operator Actions; see [.github/instructions/server.instructions.md](../../.github/instructions/server.instructions.md) for telemetry contract).
  - `GET  /api/reminders?status=open&user=me` - list (defaults to caller's initials)
  - `POST /api/reminders` - create. Body `{ kind, title, due_at, message?, recurring?, subject_type?, subject_id?, target_user?, source?, source_ref?, dedupe_key? }`. `source` defaults to `'user'`, `target_user` defaults to caller's initials.
  - `POST /api/reminders/:id/done` - mark done. If recurring, advance `due_at` and reopen.
  - `POST /api/reminders/:id/snooze` - body `{ until }`.
  - `DELETE /api/reminders/:id` - dismiss (soft; status flips to 'dismissed').
- Telemetry: `Reminders.Create.{Started,Completed,Failed}`, `Reminders.Complete.*`, etc. Always-on, success AND failure paths.

#### C4. Hub UI surface

- Where: a Reminders strip / tile inside Hub home, plus a small inline composer (drawer or inline form). Implementation slot is open; recommend co-locating with the existing Hub Todo surface (see [src/tabs/](../../src/tabs/) for the area; check `hub` / `home` tiles already there before placing).
- Tier: gated to admin initially (`isAdminUser`); widen later.
- Loading: structural skeleton per the conventions in [.github/copilot-instructions.md](../../.github/copilot-instructions.md) "Relentless UX bar" / "Structural loading by default".
- SSE / refresh: poll on mount + after create/done; SSE only if it becomes laggy.

#### C5. Intake from chat (agent <-> table)

- Trigger phrases for the agent (added to copilot-instructions.md alongside the Phase A reminder triggers):
  - `"remind me to <thing> on <date>"`
  - `"remind me weekly to <thing>"`
  - `"remind LZ to <thing> on <date>"` (creates with `target_user='LZ'`)
  - `"add a reminder for matter HLX-12345: <thing>"` (sets `subject_type='matter'`, `subject_id='HLX-12345'`)
- The agent calls the create route (server-side validates and writes the row). Confirmation in chat: one short line citing id + due date.
- The Phase A JSON file `data/agent-reminders.json` stays for **agent-only ephemeral reminders** (per-session scheduling hints); anything user-facing routes through the SQL table from day one.

#### C6. Future Clio sync (out of scope for Phase C build, in scope for design)

When a future job pulls matter follow-up dates / AML review windows from Clio (see [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md)):
- Writes rows with `source='clio'`, `source_ref=<clio matter id>`, `dedupe_key='clio:matter:<id>:<kind>'`, `subject_type='matter'`, `subject_id=<matter id>`.
- Upsert on `(source, dedupe_key)` means re-running the sync is safe.
- The Hub UI groups by `subject_type` so Clio-originated reminders appear under their matter without colliding with user-created ones.

**Phase C acceptance:**
- Migration runs cleanly on a fresh DB and is idempotent on re-run.
- Create / list / done / snooze / dismiss routes all emit App Insights events on both success and failure paths.
- Agent can take `"remind me to X on 2026-06-01"` from chat, insert a row, and report id + due back.
- Hub UI lists open reminders for the caller with the structural loading pattern, no jank.
- Inserting the same `(source, dedupe_key)` twice fails on the unique index (proves the anti-double-up).
- Tier gating: non-admin cannot list or create.

---

## 4. Step-by-step execution order

1. **A1** - Create `data/agent-reminders.json` with the seed entry only.
2. **A2** - Build `tools/reminder-add.mjs`.
3. **A3** - Build `tools/reminder-check.mjs`.
4. **A4** - Wire reminder-check output into `tools/sync-context.mjs`.
5. **A5** - Add the Session Start rule to copilot-instructions.md.
6. **A6** - Verify the 2026-05-29 reminder fires via a date-overridden dry run.
7. **Ship Phase A** - changelog entry.
8. **B1** - Create empty `logs/agent-ratings.jsonl`.
9. **B2** - Build `tools/rating-log.mjs` then `tools/rating-report.mjs`.
10. **B3 + B4** - Add trigger phrase taxonomy and agent rules to copilot-instructions.md.
11. **B5** - Add the avg-score line to sync-context.
12. **Ship Phase B** - changelog entry.
13. **C1 + C2** - Author and run `scripts/migrate-add-reminders.mjs` against local Instructions DB; verify idempotency.
14. **C3** - Build `server/routes/reminders.js` with full telemetry; wire into the server route registry.
15. **C4** - Build the Hub UI strip / composer; structural loading required.
16. **C5** - Add the team-reminders trigger phrases to copilot-instructions.md (under the same Reminders section as Phase A).
17. **Ship Phase C** - changelog entry; flag that Clio sync (C6) is designed but not built.

---

## 5. Verification checklist

**Phase A:**
- [ ] `data/agent-reminders.json` exists and parses as valid JSON.
- [ ] `node tools/reminder-add.mjs --due 2030-01-01 --message "test"` appends and is idempotent.
- [ ] `node tools/reminder-check.mjs` returns 0 and prints due rows only.
- [ ] After a sync run on or after 2026-05-29, REALTIME_CONTEXT.md contains a `## Due reminders` section listing the snapshot reminder.
- [ ] copilot-instructions.md Session Start mentions due reminders surfacing.

**Phase B:**
- [ ] `logs/agent-ratings.jsonl` exists.
- [ ] `tools/rating-log.mjs` rejects malformed input and de-duplicates within 60s.
- [ ] `tools/rating-report.mjs` runs against a 10-row fixture and prints tag, file, and trend sections.
- [ ] Trigger phrase taxonomy is in copilot-instructions.md and cross-links this brief.
- [ ] On a chat turn containing only `"that was a breeze"`, the agent logs silently and replies with no mention of logging.

**Phase C:**
- [ ] `dbo.reminders` exists with all columns, indexes, and the unique dedupe index.
- [ ] Migration re-run is a no-op.
- [ ] `POST /api/reminders` writes a row and returns the id; `GET /api/reminders` lists it for the caller.
- [ ] App Insights events `Reminders.Create.{Started,Completed,Failed}` and `Reminders.Complete.*` visible.
- [ ] Duplicate `(source, dedupe_key)` insert fails on the unique index, not silently inserted.
- [ ] Hub UI mounts with structural skeleton, fades into the populated list, no layout jank.
- [ ] Non-admin caller receives 403 from list and create.
- [ ] Agent chat trigger `"remind me to X on 2026-06-01"` creates a row and replies with the id.

---

## 6. Open decisions (defaults proposed)

1. **Storage format** - Default: **JSONL** (append-only, grep-friendly, no merge conflicts on parallel runs). Rationale: same shape as App Insights drains; easy to migrate later.
2. **Trigger phrase set ownership** - Default: **lives in copilot-instructions.md, not in code**. Rationale: zero rebuild to evolve the taxonomy; agent reads it on every turn anyway.
3. **Score inference from phrases** - Default: **fixed mapping above**. Alternative considered (sentiment model) rejected as overkill for the signal density.
4. **Recurring reminders** - Default: **bump-on-fire semantics** (when a weekly reminder fires and is marked done, advance its `due` by 7 days). Avoids drift if the user is offline that day.
5. **Reminder visibility** - Default: **agent surfaces unread reminders once per session**, not on every turn. Tracked by a `lastShown` timestamp inside each reminder.
6. **Ratings privacy** - Default: **summary field must not contain client PII** (per Copilot Data Handling rule in copilot-instructions.md). Enforced by a deny-list of obvious patterns in `rating-log.mjs` (`/HLX-\d+/i` whitelisted because Luke Test is a deliberate health probe).
7. **Reminders DB location** - Default: **Instructions DB** (operational data, sits next to `hub_todo`). Rationale: same connection helper, same migration pattern, no cross-DB joins needed.
8. **Source discriminator** - Default: **mandatory `source` + optional `dedupe_key` on the table from day one**. Rationale: stops Clio / Asana / future syncs from racing or duplicating; cost of adding later is much higher than carrying it now.
9. **Agent JSON vs table** - Default: **keep `data/agent-reminders.json` for agent-only ephemera, route everything user-facing through the table**. Rationale: the JSON file is fine for `"snapshot on Friday"` style chores the agent owns; anything the human should see lives in SQL.
10. **Phase C tier gate** - Default: **admin** at launch, widened to all users only after one week of clean telemetry. Rationale: same staged rollout pattern used by Operator Actions Phase C.5.

---

## 7. Out of scope

**Phase A and B:**
- Any UI surface for ratings (no React component, no Reports tab entry).
- App Insights instrumentation for ratings (stay local until volume justifies it).
- Auto-classification by ML / sentiment model.
- Cross-session memory of which tasks scored well (next deposit once we have data).
- Backfilling historical ratings from changelog or transcripts.

**Phase C:**
- Push notifications outside the Hub UI (no email, SMS, Teams adaptive card push for now).
- The actual Clio sync job (C6 is *design only*; the build is a separate stash once the table is in production).
- Calendar / Outlook integration.
- Cross-user delegation flows ("remind AC instead of me") beyond the simple `target_user` field; no permission model yet for cross-user creation past admin tier.
- Mobile-specific surface (Hub responsive behaviour applies, nothing more).

---

## 8. File index (single source of truth)

Client:
- `src/tabs/.../RemindersStrip.tsx` (NEW, Phase C - location to be confirmed at build time, recommend co-locating with the Hub Todo surface)

Server:
- `server/routes/reminders.js` (NEW, Phase C)
- `scripts/migrate-add-reminders.mjs` (NEW, Phase C)

Scripts / data / instructions:
- `tools/reminder-add.mjs` (NEW) - Phase A
- `tools/reminder-check.mjs` (NEW) - Phase A
- [tools/sync-context.mjs](../../tools/sync-context.mjs) - Phase A (append reminders block); Phase B (append ratings summary line)
- `data/agent-reminders.json` (NEW) - Phase A seed
- `tools/rating-log.mjs` (NEW) - Phase B
- `tools/rating-report.mjs` (NEW) - Phase B
- `logs/agent-ratings.jsonl` (NEW) - Phase B append-only store
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) - Phase A (Session Start rule), Phase B (trigger taxonomy + capture rules). **Coordination required**, see metadata.
- [logs/changelog.md](../../logs/changelog.md) - one entry per phase

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: agent-ratings-and-reminders-system
verified: 2026-05-23
branch: main
touches:
  client:
    - src/tabs/  # Phase C Hub UI strip; exact path TBD at build time
  server:
    - tools/reminder-add.mjs
    - tools/reminder-check.mjs
    - tools/sync-context.mjs
    - tools/rating-log.mjs
    - tools/rating-report.mjs
    - data/agent-reminders.json
    - logs/agent-ratings.jsonl
    - .github/copilot-instructions.md
    - server/routes/reminders.js     # Phase C
    - scripts/migrate-add-reminders.mjs  # Phase C
  submodules: []
depends_on: []
coordinates_with:
  - activity-testing-security-and-operational-visibility-control-plane
  - instruction-and-prompt-estate-refresh
conflicts_with: []
```

---

## 9. Gotchas appendix

- `.github/copilot-instructions.md` is **always-on context** loaded every turn. It is currently 400 lines against a 400-line validator threshold ([tools/validate-instructions.mjs](../../tools/validate-instructions.mjs)). Any additions here must be matched by inline trims elsewhere, or the validator will warn on the next pass. Budget: keep both Phase A and Phase B additions combined under ~25 net new lines, claw back from anywhere overweight.
- Do not write rating rows during the praise turn's own response. The agent must call `rating-log.mjs` **before** composing the reply, otherwise the trigger phrase ends up duplicated in subsequent self-ratings.
- `data/agent-reminders.json` is in `data/` not `logs/` because reminders are inputs to behaviour, not historical records. `logs/agent-ratings.jsonl` is the opposite.
- `tools/sync-context.mjs` runs in multiple modes (`--sync-choice=0..4`). The reminders block must render in **all** modes (including choice 0 "no sync") because reminders are not gated by submodule activity.
- The no-em-dash rule in copilot-instructions.md applies to every agent-authored artefact. Whatever lands in copilot-instructions.md from this brief must be dash-clean, full stops only.
- Silent rating capture means the agent must **not** add a footer line like "Logged rating: 9". Users said the praise, they did not ask for a confirmation. Verify on first run.
- The Friday seed reminder hard-codes `2026-05-29`. If a future agent picks this up after that date without running it, the reminder is overdue, not missed; surface it anyway and let the user decide whether to still run the compare.
- Phase C lands `dedupe_key` on day one even though the launch only has `source='user'` rows. Do not skip this column thinking it can be added later: backfilling a partial-unique index across an active table is painful, and the Clio sync that needs it is the entire point of the design.
- `target_user` is stored as initials (LZ, AC) to match the rest of the platform; do NOT switch to email or Entra object id without coordinating with the `team` table conventions in [.github/instructions/TEAM_DATA_REFERENCE.md](../../.github/instructions/TEAM_DATA_REFERENCE.md).
- Phase A's `data/agent-reminders.json` and Phase C's SQL table are NOT a future migration target for each other. They serve different consumers (agent session ephemera vs human-facing). Keep both; do not collapse.
