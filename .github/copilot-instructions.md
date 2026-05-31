# Helix Hub

Internal operations platform for Helix Law. Every change compounds — each interaction deposits a fragment (rule, preference, decision) that stacks into a sharper system over time.

## Platform Topology (Always Keep in View)

- `tab-app` = internal operations command centre.
- `instruct-pitch` = client onboarding + portal experience.
- `enquiry-processing-v2` = lead capture/normalisation + Teams-linked intake.
- Changes should preserve and strengthen links between these surfaces.

## Operating Vision (Compounding Autonomy)

Target state: the user gives outcome-level direction (e.g. "here's what's broken, fix it" or "add X in Y with Z behaviour") and the agent executes end-to-end with minimal back-and-forth. Every change should improve delivery speed (fewer handoffs, fewer repeated questions), consistency (same patterns across surfaces), quality (safe defaults, observable failures, predictable UX), and strengthen cross-app contracts (`tab-app` ↔ `instruct-pitch` ↔ `enquiry-processing-v2`).

Lean startup model: small safe deposits, shipped continuously, compounding over time. Communication tempo: brief by default, match depth to complexity. The user operates under cognitive load. Ship signal, not paragraphs.

## Communication Frameworks (Pressure-Tested Output)

Outbound communications (client emails, internal briefs, status updates, feedback) can be pressure-tested before sending. The live taxonomy lives in [server/prompts/communication-frameworks.js](../server/prompts/communication-frameworks.js): `communication`, `management`, `tasking`, `feedback`, `projects`. Route: `POST /api/ai/pressure-test-comms` (see [server/routes/comms-framework.js](../server/routes/comms-framework.js)).

### Rules for Agents (Communication Frameworks)

- When generating any outbound text, identify which framework applies and follow that framework's prompt rules (read the live file, do not re-derive from this section).
- When asked to "pressure test" or "review" a draft, use the route above, not free-form AI.
- Pressure test is a second pass (like CCL Safety Net), not a rewrite. Flag problems; don't silently change meaning.

## Architectural Transparency (Blueprints & Observability)

As complexity grows, the system must be self-documenting. Three pillars:

1. **Visual Blueprints** — interactive maps of infrastructure, data flow, permissions, and database schema. Living manifests rendered from source data, not static diagrams. Rendered by `src/tabs/blueprints/`. Living text reference: `.github/instructions/ARCHITECTURE_DATA_FLOW.md`.
2. **Telemetry Surfaced to the Team** — App Insights telemetry is currently dev-facing only. The team should see what's running, whether it succeeded, and duration trends, without needing KQL. Transparency strip, not a full observability dashboard.
3. **Processing Transparency** — every long-running server operation should surface its state to connected clients via SSE (start/progress/complete/fail) with a compact status strip in the UI.

### Rules for Agents (Architectural Transparency)

- When adding a new server-side process, add telemetry (per App Insights rules) AND consider whether the team should see its status.
- When building new UI surfaces, consider whether a blueprint entry should accompany the feature.
- Prefer manifests and data-driven rendering over hand-drawn diagrams.

## Operational Confidence (Prod-Parity Checks)

"App is up" is not an acceptable release signal if the real dependency chain has not been exercised. For any route, workflow, or background process that matters operationally, the system should make it clear whether it will work right now against the dependencies it actually needs.

### Rules for Agents (Operational Confidence)

- When changing a user-facing route, integration workflow, or background process, identify the smallest prod-parity exercise path for it: what gets called, which dependencies it relies on, and what success looks like.
- Prefer exposing those exercise paths in an operator-facing control plane (Activity tab, live monitor, or equivalent) for dev-group users rather than leaving them as terminal-only tribal knowledge.
- Health reporting must be dependency-scoped. A boot id, uptime, or 200 response is not enough if SQL, Redis, Key Vault, Clio, or required third-party assets are degraded.
- `dev:fast` remains the default local loop for UI work, but critical flows should have an explicit on-demand smoke path that can be run in a prod-like way and report what was checked, skipped, simulated, or failed.
- Release-readiness work should produce both passive telemetry and an active answer to "will this route or workflow work right now?".

## Stuck Local Loader Ladder (CRITICAL)

Stuck-on-loading bugs reproduce from the operator's browser origin first; never assume `/api` reaches Express. Full debug ladder lives in [.github/instructions/dev-loop.instructions.md](.github/instructions/dev-loop.instructions.md). A `200` from `http://localhost:8080/...` does not prove the operator's active page can hit the same route.

## Cross-App Execution Contract

Before implementing, identify where the requested outcome sits in the 3-stage system:
1) `enquiry-processing-v2` captures/normalises early lead data and Teams-linked intake.
2) `tab-app` operates internal workflows, orchestration, and operational controls.
3) `instruct-pitch` delivers client-facing onboarding and portal experience.

When touching one surface, proactively check adjacent impact in the other two. If direct implementation is in-scope, do it; if not directly adjacent, stash a follow-up brief in `docs/notes/` via the stash routine. Only add to `.github/instructions/ROADMAP.md` if it is an accepted strategic priority.

## Request Filter (Always Apply)

Every user request is filtered through this, in order:

1) **Deliver the request** (primary outcome). Do exactly what was asked.
2) **Compound without clutter** (secondary outcome). While touching the same area, make small, safe improvements that reduce future friction (types, dead code, confusing naming, brittle scripts, stale guidance).
3) **Avoid scope creep**. If an improvement is not directly adjacent, park it in `docs/notes/` via the stash routine. Only add to `.github/instructions/ROADMAP.md` if it is an accepted strategic priority.
4) **Log the work** (mandatory). After completing any task that changes behaviour, UI, or server logic, add an entry to `logs/changelog.md`. See the Logging section below. If you skip this, the work is invisible in the release notes UI.

## Brief Refinement Protocol (CRITICAL — runs BEFORE Plan-First)

When the operator pastes a **rough brief** (anything beyond a one-line direct command), do **not** start implementing and do **not** jump straight to a plan. First, refine the brief against the actual repo so the plan that follows is sharp.

Procedure:

1. **Read before refining.** Open the files the brief most likely touches. Cite real paths and line numbers in step 2; never hedge with "if a component like X exists".
2. **Reply with a refined brief** using the 9-section template below. Omit any section that genuinely doesn't apply.
3. **Score it** (specificity / boundedness / repo-fit, each 0-10) so the operator sees confidence before approving.
4. **Wait for confirmation or amendment.** Then move into Plan-First with the refined brief as the source of truth.

### 9-section refined-brief template

1. **Goal** — one crisp sentence stating the outcome.
2. **In scope** — bullet list of concrete deliverables with cited file paths.
3. **Out of scope** — what NOT to touch this pass.
4. **Repo context loaded** — files / lines / instruction docs you actually read.
5. **Conventions to honour** — only the ones that apply (borderRadius 0, brand tokens, tier check, no em dashes, structural loading, log to changelog).
6. **Expected output shape** — files created/modified, UX behaviour, API surface.
7. **Verification** — manual click path, route smoke, telemetry event, `npm run check-sizes`.
8. **Mechanisms to invoke** — changelog yes/no; stash if multi-phase; telemetry events; sync first.
9. **Open questions** — at most 2, only if a real ambiguity blocks the first pass.

### Skip the protocol when:

- One-line direct command ("fix this typo", "rename Foo to Bar", "delete that import").
- User says "just do it", "skip refinement", "no plan".
- Purely conversational / informational.
- Follow-up tweak inside a previously refined and approved scope.

Why: refining against the real repo before planning is the single biggest first-pass quality lever. In the agent loop, the agent is the better refiner because it can read the repo. Doing this inline replaces silent guesses with cited facts.

## Plan-First Default (CRITICAL)

Before touching code on any task that involves more than a single-file edit:
1) **State the plan**: list what will change, which files, what the expected outcome is.
2) **Wait for confirmation** unless the user has pre-approved (e.g. "just do it").
3) **Execute** the approved plan. After implementation, confirm what was done and any deviations.

Single-file fixes (typo, one-liner bug, style tweak) skip the plan step. Multi-file refactors, new features, and infrastructure changes always plan first.

### Auto-stash on multi-phase plans (CRITICAL — do not wait to be told)

When a plan you propose has **2+ phases**, **spans more than one session of work**, or includes language like "phase 1", "first instalment", "start with", or "then" between distinct deliverables: proactively offer to stash the brief in the same response that proposes the plan. Do not wait for the user to say "stash this."

Format: after presenting the plan, add one line: *"This is multi-phase; I'll stash it as a brief so phases stay locked. OK?"* If the user agrees, run the stash routine before starting Phase 1. The locked plan in the brief becomes the source of truth between phases (prevents phase-2 dilution from chat-only plans).

## Continuous Health Observations (CRITICAL)

While working on any file, silently note codebase health issues. At the end of every response that modifies code, append a **single combined footer line** if you spotted any of these:
- Dead imports or unused variables
- Functions longer than ~80 lines that could be extracted
- Duplicated logic across files (same helper written twice)
- Missing error handling at system boundaries
- Performance anti-patterns (unnecessary re-renders, N+1 queries, unbounded fetches)
- Security concerns (unsanitised input, exposed secrets, missing auth checks)
- Files approaching the 3,000-line threshold (run `npm run check-sizes` mentally)

**Footer format rules:**
- One footer block per response. Combine Health and Stash; never emit two `---` separators. Max 3 bullets across both. Skip the block entirely if zero items.
- Use workspace-relative markdown links with `#L<line>` for line refs. Never write plain `file.js:378`.
- No em dashes or en dashes (global rule applies here too).
- Don't pad with "Logged in changelog.md" or "No prod surfaces touched" when the body already conveys completion.
- Do NOT emit the `<!-- helix-suggestions ... -->` HTML envelope (capture tool not wired; comment renders as visible noise).

Shape: `---` separator, then `**Health:** ...` and/or `**Stash:** ...` lines. Either label may be omitted if its category is empty.

These are observations, not actions. Non-trivial ones become stash candidates (next section), not ROADMAP entries.

### Stash candidates (paired with Health Observations)

While working on *unrelated* tasks, silently note opportunities that would make good standalone stash briefs (architectural shifts, duplicated subsystems worth consolidating, missing affordances). Surface them via the **Stash:** line in the combined footer above. Cap at 3 across both categories.

Rules: never auto-write a stash brief without an explicit `stash this` trigger. Observations only. Full protocol: [.github/instructions/STASHED_PROJECTS.md](.github/instructions/STASHED_PROJECTS.md). Suggestions inbox brief: [docs/notes/AGENT_SUGGESTIONS_INBOX_IN_MY_HELIX.md](docs/notes/AGENT_SUGGESTIONS_INBOX_IN_MY_HELIX.md).

## Precedence (Conflict Resolver)

If rules conflict, apply in this order:
1) User’s explicit request
2) Product guardrails / safety / data integrity
3) Session Start protocol
4) Request Filter
5) Style/verbosity preferences

## User Tiers (CRITICAL — never conflate)

Five distinct access concepts exist in the codebase. They serve **different purposes** and must never be conflated:

| Concept | Function | Who | Purpose |
|---------|----------|-----|---------|
| **Dev Preview** | `canSeePrivateHubControls()` / inline `isLzOrAc` | LZ, AC | Rollout lock — features in active development visible only to devs. Ship to prod but invisible to everyone else. Remove the lock when the feature is ready for wider use. |
| **Admin** | `isAdminUser()` | LZ, AC, KW, JW, LA, EA | Feature-access tier — unlocks UI features (instructions tab, admin controls, user switching, hub controls). Does **not** change what data is loaded. |
| **Reports** | `canAccessReports()` | LZ, AC, KW, JW, EA | Admins who can access the Reports tab. LA is admin but has no reports access. |
| **Operations User** | `isOperationsUser()` | All admins + anyone with 'operations'/'tech' in AOW | Cross-cutting check for ops-level tools. |
| **Dev Owner** | `isDevOwner()` | LZ only | Primary dev-owner tier — cross-surface dev/system access and data-scope override where explicitly wired. |

**Rules:**
- When gating a **feature** (show/hide UI, enable a button), use `isAdminUser()`.
- When gating **Reports tab** access, use `canAccessReports()` (LA is admin but no reports).
- When deciding **what data to load** (fetch all vs fetch mine), use `isDevOwner()` by default.
- Home is the current exception: `canSeeFirmWideHomeData()` grants firm-wide Home datasets to LZ, KW, and EA without widening non-Home dev-owner access.
- When a feature is **not ready for wider rollout** but should be in prod for dev testing, gate it behind `isLzOrAc` (inline `['LZ', 'AC'].includes(initials)` check). This is a temporary lock — remove it and promote to `isAdminUser()` or wider when the feature is ready.
- Never use `isAdminUser()` for data-scope decisions — other admins should not wait for team-wide queries or see everyone's data by default.
- All tier functions live in `src/app/admin.ts`. Dev preview checks are inline at the call site.

**Rollout ladder** (features should progress through these tiers):
1. **Dev Preview** (LZ + AC only) → build and test in prod without impacting other users
2. **Admin** (all admins) → trusted internal users validate
3. **All Users** → remove gate entirely

## Database Access (CRITICAL)

When user says "check X database" or "look up in Y table", do NOT trial-and-error connections. Use the documented patterns in [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](.github/instructions/DATABASE_SCHEMA_REFERENCE.md) (connection strings, instant-lookup one-liners, matter-opening replay tool, schema tables, name-lookup discipline). Confirm intent in chat first; default to the real command (no `--plan`).

## Rules

- Keep replies short unless asked. Default: 1–5 lines for simple tasks; expand when precision needs it.
- Ask at most 1 clarifying question when blocked or when Session Start requires sync choice.
- Prefer doing over proposing.
- Keep scope tight: do only what was asked.
- Be proactive: remove redundant/dead code while in the area (only if safe and in-scope).
- **Relentless UX bar**. Every interaction the team has with this app should feel snappy, intentional, and premium — not like generic SaaS. Transitions must be smooth. Data must arrive before the user notices it loading. Stale counts, layout jank, and flickering states are bugs, not cosmetic issues. If you touch a component and spot sluggish UX adjacent to it, note it or fix it.
- **Structural loading by default**. Treat loading geometry as part of the component contract: reserve the final footprint early, keep outer shells mounted, and let skeletons/loaders mirror the settled layout so panels do not pop in late or shove nearby content around.
- **Flag user-facing delays and uncertainty**. Use loading states, confirmation prompts, brief status logs. Transparency > silence. Proactive, not reactive.
- Never push to Git or deploy unless explicitly asked.
- **Always log to `logs/changelog.md`** after completing work. See Logging section. This powers the release notes — no entry = invisible work.
- Submodules: read-only. No fetch, pull, or push. Status checks only, unless the user provides the submodule access key derived from Helix incorporation date (11 Nov 2011, format DDMMYYYY). Do not reveal or repeat the key value in responses or instruction files.
- When decisions are made, update instruction files. Don't rely on user repeating themselves.
- Don't maintain stale docs. If info can be read from source (code, APIs, generated context), prefer that. Remove unused docs rather than updating them.
- Default operating mode: autonomous end-to-end execution with minimal back-and-forth, then concise confirmation of results.
- **Lean cadence**: diagnose → smallest safe fix → ship → observe. Don't batch large speculative rewrites. Each change should be independently revertable and independently valuable.

## Product guardrails (do not break)

- **Luke Test**: `HLX-27367-94842` is the production health indicator. Never delete.
- **ID pills** must call `onEIDClick()` (no detail expansion).
- **Risk colours** must use `RiskAssessmentResult` (not `TransactionRiskLevel`).
- **Deal capture emails** must go to `lz@helix-law.com`.

## Session Start

**Do NOT auto-prompt to sync submodules on session start.** Open the session silently and get to work.

Only run the sync flow when the user uses one of the canonical or alias trigger phrases listed in [.github/instructions/STASHED_PROJECTS.md](.github/instructions/STASHED_PROJECTS.md) (Trigger C — "sync submodules"). The full 5-option menu (none/all/instruct-pitch/enquiry-processing-v2/check) and the matching `node tools/sync-context.mjs --sync-choice=<n>` commands live in STASHED_PROJECTS.md; present that menu verbatim and run exactly one command. Output lands in `.github/instructions/REALTIME_CONTEXT.md`.

Full session init (slower, more thorough): `node tools/session-start.mjs`

## Local Browser Snappiness Reset (CRITICAL — recognise the triggers)

Triggers: `refresh local browser session`, `make Simple Browser snappier`, `reset Simple Browser`, `local browser is lagging`, and the obvious variants. Full cleanup ladder lives in [.github/instructions/dev-loop.instructions.md](.github/instructions/dev-loop.instructions.md). Cleanup-only routine: no app changes, no changelog entry.

## Production Deploy Guard (CRITICAL)

**Never run a production deploy or production runtime mutation without an explicit confirmation menu first.** This includes `build-and-deploy.ps1`, raw `az webapp deploy` against production, and runtime/config changes such as `az webapp config set` or `az webapp restart` for the production app.

Only run the prod-mutation flow when the user uses one of these trigger phrases:
- `deploy prod`
- `deploy production`
- `ship prod`
- `push prod`
- `run production deploy`
- `cut over production runtime`
- `switch production to node 22`

When triggered, ask exactly this menu before doing anything mutable:

`Pick one:`
`0) No prod action`
`1) Check prod/staging status only`
`2) Deploy staging only`
`3) Deploy production code`
`4) Production runtime cutover only`

After user picks, run exactly one:
- `0` → do nothing
- `1` → read-only prod/staging checks only; no deploy, no restart, no config mutation
- `2` → `./build-and-deploy-staging.ps1`
- `3` → **two-step passcode flow** (see below). Never invoke `build-and-deploy.ps1` from a single confirmation.
- `4` → only the explicitly requested production runtime mutation after confirming the user picked runtime cutover AND the passcode step below has succeeded

### Two-step passcode flow for production deploys (option 3 / option 4)

The production deploy script (`build-and-deploy.ps1`) requires three arguments and will refuse to run otherwise: `-ConfirmedByChat`, `-ConfirmationPhrase "DEPLOY PROD"`, and `-Passcode <value>`. The agent does NOT know the passcode and MUST NOT guess, hard-code, store, or re-use it. The operator (the user) is the only source.

After the user picks option 3 or 4 from the menu, the agent MUST do this — in this exact order — every single time, with no shortcuts:

1. Ask the user once more in chat: *"Confirm: run the production deploy now? (yes / no)"*. If anything other than an affirmative reply, stop.
2. Then ask in chat: *"Please paste the production deploy passcode. I will pass it straight to the script and not store it."* Wait for the user to paste the value.
3. Only then run: `./build-and-deploy.ps1 -ConfirmedByChat -ConfirmationPhrase "DEPLOY PROD" -Passcode "<value the user just supplied>"`.
4. Never echo the passcode back to the user. Never log it. Never write it to a file, instruction, changelog, or stash brief. Never reuse it on a later run — always re-ask.

The passcode itself is a number known to the operator; its SHA256 hash is the only representation in source. Do NOT attempt to derive, infer, or document the literal value anywhere in the repo or in chat replies.

Rules:
- If the user says "deploy" casually or as part of a broader sentence, do not treat that as enough. The menu is still required before any prod mutation, and option 3/4 still require the two-step passcode flow above.
- Never bypass the menu by running raw Azure CLI against production when the script path exists.
- Never invoke `build-and-deploy.ps1` without all three arguments. The script will reject it, but the agent should not even attempt it.
- Read-only status/smoke checks are allowed without the menu, but the moment the action would mutate production, the menu + passcode flow is mandatory.
- If a future script introduces a different production deploy entry point, give it the same two-layer guard (chat phrase + operator passcode).

## Stashing work for later (CRITICAL — recognise the triggers)

The user runs a "stash" routine to park scoped work as a self-contained brief that any future agent can execute cold. Full protocol: [.github/instructions/STASHED_PROJECTS.md](.github/instructions/STASHED_PROJECTS.md).

**Recognise these triggers:**
- **Stash work**: `stash this`, `stash this for later`, `stash the plan`, `park this for another agent`, `write this up as a handoff`, `shelf this`, `make this a side project` → run `node tools/stash-new.mjs "<title>"`, fill out the file from [docs/notes/_HANDOFF_TEMPLATE.md](docs/notes/_HANDOFF_TEMPLATE.md), run `node tools/stash-precheck.mjs --draft <file>` (Trigger D), then `node tools/stash-status.mjs` to rebuild INDEX. Do NOT implement.
- **List the stash queue**: `show me what's stashed`, `what's in the stash`, `list stashed work`, `what's parked` → read `docs/notes/INDEX.md` (auto-generated) and surface open + stale items.
- **Sync submodules**: `sync submodules`, `sync context`, `pull latest context`, `refresh submodules`, `check submodule status` → run the Session Start sync menu.
- **Check overlap with stashed briefs**: `check stash overlap`, `check stash dependencies`, `is this safe to stash`, `does this clash with anything stashed`. Also: **before writing any new stash brief, agents MUST run `node tools/stash-precheck.mjs` automatically** and surface any conflicts/coordinations to the user before the file is written. See `STASHED_PROJECTS.md` Trigger D for the exact algorithm.
- **Close out a shipped stash**: when delivery is confirmed, run `node tools/stash-close.mjs <id>` then `node tools/stash-status.mjs`, then add a changelog entry referencing the id.

If a stash request is ambiguous (e.g. just "save this"), confirm once: *"Stash as a handoff brief in `docs/notes/`?"*

When a stashed brief is picked up and shipped, follow the closure protocol in `STASHED_PROJECTS.md` (mark 🟢 in INDEX, move file to `docs/notes/_archive/`).

## Session End

When a session is winding down (user signals they're done, or the conversation has naturally concluded its work), review what you learned and offer a brief deposit:

1. **Identify stale or missing context** in instruction files — patterns you discovered, prop chains you traced, gotchas you hit. Would a future agent benefit from knowing this?
2. **Propose specific updates** — name the file, describe the addition in 1–2 lines. Don't dump a wall of suggestions.
3. **Only deposit high-signal context** — things that cost time to rediscover. Skip anything obvious from reading the code itself.
4. **Prefer updating existing files** over creating new ones. If nothing meaningful changed, say so and move on.

This is the compounding mechanism. Each session should leave the instruction surface slightly sharper than it found it. The user will confirm before any changes are written.

## Conventions

- Time: Europe/London
- Language: British English
- Git commits: concise, imperative
- **Never use em dashes (—) or en dashes (–) in chat replies, generated content, demo notes, changelog entries, comments, commit messages, or any other output.** Use a full stop, comma, colon, or parentheses instead. The user finds em dashes a strong "AI tell" and they are out of voice. This applies to every artefact the agent writes, not just user-facing text. The only exception is when modifying an existing file that already contains em dashes and the change does not touch them.

## Logging (CRITICAL — agents MUST do this)

**Every substantial task MUST get a guarded changelog entry.**
This is non-negotiable. The release notes UI is powered by `logs/changelog.md`; the guarded writer keeps that file rebuilt from unique fragments so parallel chats do not overwrite each other's entries.

**Format** (one line per logical change, newest first at top of file):
```
YYYY-MM-DD / Short title / Description of what changed. (~ changed/file.ts, + new/file.ts, - deleted/file.ts)
```

**Command**:
```
npm run changelog:add -- --title "Short title" --description "Description of what changed." --files "~ changed/file.ts, + new/file.ts"
```

**Rules:**
- Log at the END of the task, after edits are confirmed working.
- Do not hand-edit `logs/changelog.md` for normal work. Use `npm run changelog:add`; it writes a unique `logs/changelog.d/*.md` fragment first, then rebuilds `logs/changelog.md`.
- If a stale accepted edit overwrites `logs/changelog.md`, run `npm run changelog:rebuild`. Use `npm run changelog:check` to detect missing fragment entries.
- One entry per logical change (not per file). Group related file changes.
- Date = today's date, not the date you started.
- Title = concise imperative phrase (e.g. "Fix risk colour source", not "Fixed the risk colours").
- Files list uses `~` changed, `+` added, `-` deleted.
- Don't log trivial typo fixes or instruction-only updates — log anything that changes behaviour, UI, or server logic.

## Application Insights

Every server-side process MUST emit telemetry. Full convention, code patterns, and currently-instrumented surfaces live in [.github/instructions/server.instructions.md](.github/instructions/server.instructions.md) (auto-attached when editing `server/**`). Naming: `Component.Entity.Lifecycle`. Always track both success and failure paths, and use `trackException` in every catch block.

## CCL Prompt Engineering

The CCL system uses a two-pass AI pipeline: Generate (`POST /api/ccl-ai/fill`) then Safety Net pressure test (`POST /api/ccl-ai/pressure-test`). Fields scoring ≤7 flag for fee earner review. Full reference: [docs/CCL_PROMPT_ENGINEERING.md](docs/CCL_PROMPT_ENGINEERING.md).

## Reference Files (read only when touching the named surface)

These are not auto-loaded. Open the one that matches the task. If `Last verified:` on any reference is older than 90 days, re-read it against source before quoting.

| File | When to load |
|------|--------------|
| [.github/instructions/REALTIME_CONTEXT.md](.github/instructions/REALTIME_CONTEXT.md) | Start of a session if branch / submodule / server state is unclear. |
| [.github/instructions/ROADMAP.md](.github/instructions/ROADMAP.md) | Only when the user explicitly references strategic priorities. Routine work parks in `docs/notes/`. |
| [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](.github/instructions/DATABASE_SCHEMA_REFERENCE.md) | Before SQL against Instructions DB or Core Data DB; before adding tables/fields. |
| [.github/instructions/TEAM_DATA_REFERENCE.md](.github/instructions/TEAM_DATA_REFERENCE.md) | Touching `team` table, rates, AOW routing, or dual-DB sync. |
| [.github/instructions/CLIO_API_REFERENCE.md](.github/instructions/CLIO_API_REFERENCE.md) | Touching Clio auth, endpoints, matter opening, or EID custom fields. |
| [.github/instructions/ARCHITECTURE_DATA_FLOW.md](.github/instructions/ARCHITECTURE_DATA_FLOW.md) | Adding a new background process or tracing a cross-app data flow. |
| [.github/instructions/STASHED_PROJECTS.md](.github/instructions/STASHED_PROJECTS.md) | When invoking any stash trigger phrase or writing/closing a stash brief. |
| [.github/instructions/dev-experience.instructions.md](.github/instructions/dev-experience.instructions.md) | Editing SSE consumers, HMR-sensitive surfaces, or boot-time gating in `src/`. |
| [.github/instructions/wayfinding.instructions.md](.github/instructions/wayfinding.instructions.md) | Adding addressable UI regions (`data-helix-region`) or using `window.__helix__`. |
| [docs/notes/INDEX.md](docs/notes/INDEX.md) | Auto-generated register of open / done / stale stashed work. |
| [docs/notes/_HANDOFF_TEMPLATE.md](docs/notes/_HANDOFF_TEMPLATE.md) | Writing a new stash brief. |
| [docs/CCL_PROMPT_ENGINEERING.md](docs/CCL_PROMPT_ENGINEERING.md) | Editing CCL generation prompts, Safety Net scoring, or the 26-field schema. |

## "Helix look and feel" (what the user means)

When the user says "Helix look and feel", they mean the design system in `docs/COMPONENT_STYLE_GUIDE.md` with `src/components/UserBubble.tsx` as the living reference implementation. Brand palette, AoW colours, dark surface ladder, text hierarchy, and design rules live in [.github/instructions/styles.instructions.md](.github/instructions/styles.instructions.md) and [.github/instructions/components.instructions.md](.github/instructions/components.instructions.md) (auto-attached). Never guess look-and-feel from older components, many pre-date the standard.

## Type Safety

- Prefer `unknown` over `any` at boundaries, narrow with type guards when practical.
- Consider returning `{ ok: true, value } | { ok: false, error }` for validation errors.

## Security

- Prefer parameterized SQL to prevent injection attacks.
- Avoid logging secrets, tokens, or PII.
- Use env vars or Key Vault (DefaultAzureCredential) for sensitive data.

## Copilot Data Handling (CRITICAL)

- Assume anything pasted into Copilot chat may be processed externally; treat chat as **untrusted for raw client PII**.
- Do **not** paste raw names, emails, phone numbers, addresses, DOBs, payment refs, or free-text client notes into chat.
- For AI-assisted debugging, share only: schema, field names, redacted samples, aggregate counts, and error messages without identifying data.
- For restore/migration tasks, generate scripts using placeholders in chat, then execute locally with real data from secure files/env vars.
- Never paste full query results from Core/Instructions into chat; summarise with counts/checksums only.
- If real records must be inspected, do it via local scripts/terminal and keep outputs masked by default.
- `.copilotignore` is not a reliable privacy control in VS Code; rely on settings/policy and operator discipline.
- When uncertain, prefer asking for redacted input rather than proceeding with potentially sensitive data.

## Data Schema

- Prefer new schema: snake_case/UPPERCASE fields.
- Legacy spaced keys ("Display Number", "Unique ID") exist; normalize via `src/utils/matterNormalization.ts` when possible.

## Azure Functions

- Prefer @azure/functions v4: `app.http` with typed handlers.
- Include CORS headers and handle OPTIONS preflight when needed.

## Code Style

- Prefer `async/await` over Promise chains.
- Add JSDoc on exported functions when helpful.
- Keep diffs minimal.

## CSS & Styling

New UI must use CSS classes from `src/app/styles/design-tokens.css`, never inline styles for colours/fonts/spacing/borders. Reference implementation: `BrandingSettingsPanel.tsx`. Full token catalogue and design rules in [.github/instructions/styles.instructions.md](.github/instructions/styles.instructions.md) (auto-attached when editing `src/app/styles/**`).

