# Stashed Projects — protocol

The "stash" routine lets the user park a fully-scoped piece of work as a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. It exists because the user is often mid-flow on something else when a new architectural piece surfaces — the routine captures the work without forcing a context switch.

## Trigger phrases (CRITICAL — recognise any of these)

### A) Stash the current scope
**Canonical:** `stash this`

**Aliases:**
- `stash this for later`
- `stash the plan`
- `park this for another agent`
- `write this up as a handoff`
- `shelf this`
- `make this a side project`

**Behaviour:** write a self-contained brief to `docs/notes/<TITLE>.md` using the [_HANDOFF_TEMPLATE.md](../../docs/notes/_HANDOFF_TEMPLATE.md), update [docs/notes/INDEX.md](../../docs/notes/INDEX.md), do **not** implement.

If the request is ambiguous (e.g. just "save this"), confirm with one short question: *"Stash as a handoff brief in `docs/notes/`?"*

### B) List the stash queue
**Canonical:** `show me what's stashed`

**Aliases:**
- `what's in the stash`
- `list stashed work`
- `what's parked`

**Behaviour:** read `docs/notes/INDEX.md` and surface open and stale items with their next actions. Useful when the user is picking work for a low-energy session.

### C) Sync submodules (gated)
**Canonical:** `sync submodules`

**Aliases:**
- `sync context`
- `pull latest context`
- `refresh submodules`
- `check submodule status` (maps to choice 4 — check only, no sync)

**Behaviour:** run the existing 0–4 sync menu (see Session Start in `copilot-instructions.md`). **Do not** run this menu unprompted on session start — only when a trigger phrase fires.

### D) Check stash overlap (manual or automatic)
**Canonical:** `check stash overlap`

**Aliases:**
- `check stash dependencies`
- `is this safe to stash`
- `does this clash with anything stashed`

**Automatic invocation:** before writing any new brief in response to a `stash this` trigger, agents MUST run this scan first and surface the result to the user before the file is written.

**Behaviour — use the scripts, don't hand-prose this:**

```bash
# When drafting a new brief, after you've filled in the metadata block:
node tools/stash-precheck.mjs --draft docs/notes/MY_NEW_BRIEF.md

# Or before you have a draft, just check what a list of files would clash with:
node tools/stash-precheck.mjs --touches "src/foo.ts,server/bar.js"
```

The script reads every brief's `Stash metadata` block, compares the touches, and prints:
- **Declared coordinations** — already cross-referenced, no action needed
- **Coordinates** — same directory, no shared file, low risk
- **Potential conflicts** — shared file, NOT declared in metadata; you must add `coordinates_with` or `conflicts_with` and re-run
- **Submodule freshness** — flags stale `REALTIME_CONTEXT.md` if any touch is under `submodules/**`

Exit codes: `0` independent · `1` coordinations only · `2` undeclared conflicts. The script is the source of truth — surface its output to the user verbatim before writing.

**Staleness check (manual reminder, not in the script):** if picking up an existing brief whose `verified` date is >30 days old, INDEX will already mark it ⚪ Stale — re-verify file/line refs before executing.

## Tooling — the four scripts

The routine is now mechanical. Agents don't hand-write INDEX or eyeball overlap — they run scripts.

| Script | Purpose | When to run |
|--------|---------|-------------|
| `node tools/stash-new.mjs "Title"` | Scaffold a new brief from `_HANDOFF_TEMPLATE.md` with date/id/branch pre-filled | At the moment of a `stash this` trigger |
| `node tools/stash-precheck.mjs --draft <file>` | Trigger D — overlap scan against all open briefs | Before writing a new brief; before picking one up |
| `node tools/stash-lint.mjs` | Validate every brief's metadata block (required keys, unique ids, valid date, references resolve) | After any brief edit; in CI later |
| `node tools/stash-status.mjs` | Auto-generate `INDEX.md` from metadata blocks (also `--check` to fail if drift, `--print` for dry-run) | After stashing, after closing |
| `node tools/stash-close.mjs <id>` | Mark shipped, move to `_archive/`, re-run dependency scan, list ripple effects | When a brief is fully delivered |

**Standard new-stash workflow:**

```bash
node tools/stash-new.mjs "My new brief"
# fill out the file
node tools/stash-precheck.mjs --draft docs/notes/MY_NEW_BRIEF.md
node tools/stash-lint.mjs
node tools/stash-status.mjs
```

**Standard close-out workflow:**

```bash
node tools/stash-close.mjs <id>
node tools/stash-status.mjs
# add changelog entry referencing <id>
```

## Writing a brief — house standard

Every stash MUST follow [_HANDOFF_TEMPLATE.md](../../docs/notes/_HANDOFF_TEMPLATE.md). The skeleton:

1. **Why this exists** — user intent, verbatim where possible
2. **Current state — verified findings** — file paths + line numbers from a fresh read, never from memory
3. **Plan** — phased if it makes sense, each phase independently shippable
4. **Step-by-step execution order** — flag parallelisable bits
5. **Verification checklist** — per phase
6. **Open decisions** — with proposed defaults
7. **Out of scope** — explicit list
8. **File index + Stash metadata** — single source of truth for every touched path, plus the machine-readable metadata block (see below)
9. **Gotchas appendix** — the non-transferable residue: traps you only spot by tracing the code

Naming convention: `docs/notes/<UPPER_SNAKE_CASE_TITLE>.md`. Date the brief at the top with the verification date so future agents know how stale the file/line refs may be.

### Stash metadata block (REQUIRED)

Every brief MUST include this YAML-style block at the end of section 8 so the Trigger D dependency scan is mechanical, not prose-parsing:

```yaml
# Stash metadata
id: forms-stream-persistence            # short slug used in INDEX cross-refs
verified: 2026-04-18
branch: main
touches:
  client:
    - src/tabs/forms/FormsHub.tsx
    - src/tabs/forms/processStreamStore.ts
  server:
    - server/routes/processHub.js
  submodules: []                         # any path under submodules/** here
depends_on: []                           # ids that should ship FIRST
coordinates_with: []                     # ids that touch the same files but don't block
conflicts_with: []                       # ids that mutate the same regions — will need merge
```

## The register — `docs/notes/INDEX.md`

**Auto-generated** by `node tools/stash-status.mjs` from each brief's `Stash metadata` block. Do not hand-edit. Run the script after stashing or closing — it rewrites the table and recomputes status.

Status legend:
- 🟡 **Open** — active queue, ready to pick up
- ▶️ **Ready** — newly unblocked by a recent ship; re-run precheck before starting
- ⚪ **Stale** — `verified` >30 days old; file/line refs need re-checking before execution
- 🟢 **Done** — shipped (file moved to `docs/notes/_archive/`)

When a stashed brief is picked up and shipped:
1. Confirm in the response that the brief was followed (or note deviations).
2. Run `node tools/stash-close.mjs <id>` — marks the brief `shipped: true`, moves it to `_archive/`, and prints the closure ripple (which other briefs reference this one).
3. Run `node tools/stash-status.mjs` to rebuild INDEX.
4. Add a changelog entry referencing the brief id.

## Compounding mechanism — opportunity radar

While doing *other* work, agents silently note stashable opportunities. At the end of any response that touched code, if you spotted up to 3 candidates worth stashing later, append a footer alongside Health Observations:

```
---
**Stash candidates** (spotted, not actioned):
- `src/tabs/finance/PaymentApprovals.tsx`: approval queue lacks bulk-action affordance — worth a stash brief.
- `server/routes/clio.js`: token refresh logic duplicated 3 times — worth a stash brief for consolidation.
```

Rules:
- Cap at 3 candidates per response. If you spotted more, pick the highest-value.
- Never auto-write a brief without explicit "stash this" trigger from the user.
- These are observations, not actions. The user decides whether to promote any to a full stash.

## Why the routine exists (the compounding effect)

Three forces keep this alive without the user pushing:
1. **Trigger phrases** — low-friction invocation, becomes muscle memory.
2. **Opportunity radar** — agents surface candidates during *unrelated* work, so the queue grows organically.
3. **Closure loop in INDEX** — visible Open/Done/Stale status makes it obvious when something's been parked too long; reading the index becomes a mini planning session in itself.

The user's stated intent: *"I want to make this a habit, have a session and discuss and gather context, then in a house standard way, hand off. With a compounding effect where agents log implements as they spot them."*
