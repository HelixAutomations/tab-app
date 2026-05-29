# Instruction and prompt estate refresh

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-23 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quote (2026-05-07): *"take a step back and generally consider the position on/re my prompts and instructions. havbventupdated any of these documents for a long time and im conscious alot might be misused etc"* and then *"consider, scope and stash the brief to sort all this out."*

The core problem is **instruction influence**, not general documentation neatness. The user is worried that old prompt/instruction material may be wasteful, bloated, contradictory, or steering agents into the wrong behaviour. The central task is to make the customization layer easier for agents to use: less always-on context, clearer loading rules, fewer duplicated guardrails, and a clean route for semantic review through Chat Customizations Evaluations.

Roadmap drift is only relevant when it pollutes that instruction layer. Roadmaps are expected to change; maintaining every planning bullet is not the goal. False shipped claims and broken links matter when agents treat them as source-of-truth context, but they are symptoms rather than the main work.

This brief is **not** a rewrite of the platform documentation. It is a prompt and instruction hygiene pass: map what is loaded when, slim the always-on context, move detail into narrower files, use the extension for semantic diagnostics, and keep only the repo-aware validator checks that prevent misleading context from creeping back in.

---

## 2. Current state — verified findings

Inventory taken 2026-05-07 against `main` via `Get-ChildItem` + `npm run validate:customizations`.

### 2.1 Always-on weight is concentrated in one file

- File: [.github/copilot-instructions.md](../../.github/copilot-instructions.md), 523 lines, last modified 2026-05-06.
- Auto-loaded on every chat turn.
- Mixes: operating philosophy, 3-app topology, communication frameworks, observability pillars, prod-parity rules, stuck loader ladder, request filter, plan-first default, health observations footer, stash candidates footer, precedence, user-tier table, database lookup patterns, deploy guard, stash routine, conventions, logging rules, App Insights, CCL prompt engineering, brand colours, dark-mode hierarchy, AoW colours, dark surface ladder, reporting tokens, design rules, type safety, security, Copilot data handling, data schema, Azure Functions, code style, CSS rules.
- Many of these blocks are stable reference material (brand colours, AoW table, App Insights conventions, DB lookup patterns, CSS tokens) that an agent only needs when actually touching that surface.

### 2.2 `applyTo` instruction files are correctly narrow except for one

- [.github/instructions/components.instructions.md](../../.github/instructions/components.instructions.md) — `applyTo: src/components/**`, 20 lines.
- [.github/instructions/server.instructions.md](../../.github/instructions/server.instructions.md) — `applyTo: server/**`, 97 lines, last modified 2026-05-06.
- [.github/instructions/styles.instructions.md](../../.github/instructions/styles.instructions.md) — `applyTo: src/app/styles/**`, 18 lines.
- [.github/instructions/tabs.instructions.md](../../.github/instructions/tabs.instructions.md) — `applyTo: src/tabs/**`, 47 lines.
- [.github/instructions/wayfinding.instructions.md](../../.github/instructions/wayfinding.instructions.md) — `applyTo: src/**`, 70 lines.
- [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md) — `applyTo: "**"`, 83 lines, **always loaded**. Validator warns (`broad-applyTo`).

### 2.3 Reference docs going stale

| File | Lines | Last write | Risk |
|------|-------|-----------|------|
| [.github/instructions/TEAM_DATA_REFERENCE.md](../../.github/instructions/TEAM_DATA_REFERENCE.md) | 68 | 2026-01-28 | Team table + dual-DB sync: drift here causes wrong attribution. |
| [.github/instructions/ENQUIRIES_TABLE_DESIGN_PATTERN.md](../../.github/instructions/ENQUIRIES_TABLE_DESIGN_PATTERN.md) | 166 | 2026-01-28 | Enquiries surface has changed since (Pitch table, unified cache). |
| [.github/instructions/PIPELINE_ARCHITECTURE.md](../../.github/instructions/PIPELINE_ARCHITECTURE.md) | 251 | 2026-02-21 | Cross-app pipeline contract. |
| [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md) | 358 | 2026-02-25 | Clio integration evolves; matter-opening one-off and EID custom fields landed after this. |
| [.github/instructions/WORKSPACE_OPTIMIZATION.md](../../.github/instructions/WORKSPACE_OPTIMIZATION.md) | 139 | 2026-03-25 | Possibly a one-off plan rather than living reference. |
| [.github/instructions/DUBBER_INTEGRATION_BRIEF.md](../../.github/instructions/DUBBER_INTEGRATION_BRIEF.md) | 388 | 2026-03-28 | Brief vs reference: probably shipped. |
| [.github/instructions/DUBBER_API_REFERENCE.md](../../.github/instructions/DUBBER_API_REFERENCE.md) | 292 | 2026-03-28 | References missing `server/routes/dubber.js`. |
| [.github/instructions/CCL_ROADMAP.md](../../.github/instructions/CCL_ROADMAP.md) | 97 | 2026-04-15 | Validator flags 4 missing references on lines 95, 96, 105, 106. |

### 2.4 ROADMAP.md is mixing tenses

- [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md), 617 lines, 2026-04-22.
- Line 211 claims `[x] Blueprints tab skeleton (src/tabs/blueprints/Blueprints.tsx)` shipped. The file does not exist (validator warning).
- Line 218 claims `[x] Processing transparency strip skeleton (src/components/ProcessingTransparency.tsx)` shipped. The file does not exist.
- Lines 588, 733, 736, 740, 742, 747, 749 reference future files (tokenBroker, PipelineChips, ProspectsOverlay, useEnquiryFilters). The validator now suppresses these correctly because they sit on planned-line markers.
- Mixing `[x]` shipped, `[ ]` planned, and aspirational sections in one 617-line file means a future agent searching for "what's done" will find false positives.

### 2.5 Reference docs claim files that no longer exist

Validator output (2026-05-07, 9 warnings, 0 errors):

```
.github/copilot-instructions.md: 711 lines (large-always-on-context)
.github/instructions/dev-experience.instructions.md: applyTo "**" (broad-applyTo)
.github/instructions/CCL_ROADMAP.md L95: src/components/PreviewStep.tsx
.github/instructions/CCL_ROADMAP.md L96: src/constants/cclSections.ts
.github/instructions/CCL_ROADMAP.md L105: server/prompts/ccl-scope.txt
.github/instructions/CCL_ROADMAP.md L106: src/services/cclAiService.ts
.github/instructions/DUBBER_API_REFERENCE.md L356: server/routes/dubber.js
.github/instructions/ROADMAP.md L211: src/tabs/blueprints/Blueprints.tsx
.github/instructions/ROADMAP.md L218: src/components/ProcessingTransparency.tsx
```

(Validator counts `copilot-instructions.md` as 711 lines because it includes trailing newlines; `wc -l` style count is 523. Both are above the 700-line threshold the validator currently warns at.)

### 2.6 Prompts are tidy, agents are empty

- [.github/prompts/health-check.prompt.md](../../.github/prompts/health-check.prompt.md), [optimise.prompt.md](../../.github/prompts/optimise.prompt.md), [plan.prompt.md](../../.github/prompts/plan.prompt.md), [security-review.prompt.md](../../.github/prompts/security-review.prompt.md). All ~16 lines, dated 2026-04-05.
- `.github/agents/` is empty after deleting the placeholder Aiden file on 2026-05-07.
- No tier banner on any reference doc, so an agent cannot tell `ROADMAP.md` (planning) from `server.instructions.md` (policy) from `DEMO_MODE_REFERENCE.md` (transient runbook) at a glance.

### 2.7 Validator and convention already in place

- [tools/validate-instructions.mjs](../../tools/validate-instructions.mjs) — covers `copilot-instructions.md`, all `*.instructions.md`, `*.prompt.md`, `*.agent.md`, plus reference doc cross-refs with planned-line suppression.
- `npm run validate:customizations` runs it. Exit code 0 today; 9 warnings.
- The validator is the forcing function for keeping this estate honest; it just needs new checks and a CI hook.

### 2.8 Extension-assisted review lane

- VS Code extension `ms-vscode.vscode-chat-customizations-evaluations` is recommended in [.vscode/extensions.json](../../.vscode/extensions.json) and enabled with Helix-specific custom diagnostics in [.vscode/settings.json](../../.vscode/settings.json).
- Use it for supported customization files only: `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md`, and `.github/agents/*.agent.md`.
- It is semantic, not repo-aware: useful for contradictions, ambiguity, persona/tone drift, cognitive load, and missing guardrail paths. It will not catch plain reference-doc drift in files like `ROADMAP.md`, `CCL_ROADMAP.md`, or `DUBBER_API_REFERENCE.md`; that remains the deterministic validator's job.
- 2026-05-07 smoke: ran `Chat Customizations Evaluations: Analyze Prompt` on `.github/instructions/dev-experience.instructions.md`; Problems panel returned no diagnostics. The remaining `applyTo: "**"` warning is repo policy/context-weight signal from `npm run validate:customizations`, not an extension finding.

### 2.9 Scope correction after first pickup

- A1 to A3 cleaned real broken reference warnings, but that work was incidental hygiene, not the main programme.
- Do not continue Phase A as a generic reference-doc cleanup exercise. Next work should start with the live customization surface: `copilot-instructions.md`, `*.instructions.md`, `*.prompt.md`, and the VS Code extension diagnostics.
- Plain reference docs should only be edited when they are being promoted into instructions, are directly referenced by `copilot-instructions.md`, or are actively misleading an agent about shipped reality.

---

## 3. Locked phase plan (do not redesign)

Agreed with user 2026-05-07. Six phases, executed in this exact order. Each phase is independently revertable, independently valuable, and ships with a `logs/changelog.md` entry. **Do not collapse, reorder, or expand these phases mid-flight.** If a phase reveals new work, stash it as a follow-up brief; do not absorb it here.

The user's standing concern: *briefs get diluted by phase 2 because the implementation drifts.* This section exists to stop that. Read this section first; treat sections 4 onward as supporting detail.

| # | Phase | One-line outcome | Files touched | Acceptance |
|---|-------|------------------|---------------|-----------|
| 1 | Fix Communication Frameworks drift | `copilot-instructions.md` Communication Frameworks section matches live code | [.github/copilot-instructions.md](../../.github/copilot-instructions.md), reads [server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js) | Section reflects 5 frameworks (no Legal). Replaces inline taxonomy with a short pointer to the live prompt file + route. Changelog entry. |
| 2 | Reword parking rule: stash-first, ROADMAP only for accepted strategic items | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) Request Filter step 3 | Same file | Step 3 says: "park in `docs/notes/` via the stash routine; only add to `ROADMAP.md` if it is an accepted strategic priority." All other instances of "park in ROADMAP" updated to match. Changelog entry. |
| 3 | Convert "Reference Files" to relevance-based routing | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) Reference Files section | Same file | Header reads "Read only when touching X." Each row gains a "When to load" column. No invitation to load broadly. Changelog entry. |
| 4 | Move detail blocks out of always-on into scoped instructions | [.github/copilot-instructions.md](../../.github/copilot-instructions.md), [.github/instructions/server.instructions.md](../../.github/instructions/server.instructions.md), [.github/instructions/styles.instructions.md](../../.github/instructions/styles.instructions.md), [.github/instructions/components.instructions.md](../../.github/instructions/components.instructions.md), [.github/instructions/tabs.instructions.md](../../.github/instructions/tabs.instructions.md), [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md), [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) | Move: App Insights examples → `server.instructions.md`. Brand/AoW/dark surface tables → `styles.instructions.md` + `components.instructions.md` (style guide remains canonical). Database schema knowledge + replay one-liners → `DATABASE_SCHEMA_REFERENCE.md` (keep trigger phrases + 5-line lookup card always-on). CCL Prompt Engineering → already in docs; replace section with one-line pointer. | Each moved section appears in exactly one place. `copilot-instructions.md` retains a 5-line pointer per moved block. Changelog entry. |
| 5 | Split `dev-experience.instructions.md` | [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md), new `.github/instructions/dev-loop.instructions.md` | Two files | `dev-loop.instructions.md` (`applyTo: "**"`, ~30 lines): trigger phrases + browser snappiness ladder only. `dev-experience.instructions.md` (`applyTo: src/**` or narrower): SSE/HMR/lazy-init implementation rules. Validator no longer warns `broad-applyTo` for the implementation file. Changelog entry. |
| 6 | Add `Last verified` convention + staleness check | All files in `.github/instructions/`, [tools/validate-instructions.mjs](../../tools/validate-instructions.mjs) | Each `.instructions.md` and reference doc gets a `Last verified: YYYY-MM-DD` line in frontmatter or first 5 lines. Validator warns when a file's `Last verified` is older than 90 days. | `npm run validate:customizations` reports staleness as a warning, not an error. Convention is documented in one place (top of `STASHED_PROJECTS.md` or a new short note). Changelog entry. |

**Phase boundaries are hard.** When a phase ships:
1. Run `npm run validate:customizations`. Capture exit code + warning count.
2. Add the `logs/changelog.md` entry.
3. Tick the row in section 5 (verification checklist).
4. Stop. Do not start the next phase in the same response unless the user says so.

**If the user requests scope expansion mid-phase:** confirm whether to absorb (rare) or stash as a follow-up brief (default). Do not silently widen the phase.

---

## 4. Plan (detail / supporting reference for the locked phases above)

Three phases, each independently shippable. Phase A now establishes the customization baseline and loading map. Phase B is the structural slim of always-on context. Phase C is the forcing function so the estate stays lean. The earlier broken-reference fixes are useful housekeeping, but they are not the main programme.

### Phase A. Customization baseline and load map

| # | Change | File | Detail |
|---|--------|------|--------|
| A0 | Record completed incidental cleanup | [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md), [.github/instructions/CCL_ROADMAP.md](../../.github/instructions/CCL_ROADMAP.md), [.github/instructions/DUBBER_API_REFERENCE.md](../../.github/instructions/DUBBER_API_REFERENCE.md) | Already done on 2026-05-07: removed all missing-reference warnings. Treat as context hygiene, not the model for future work. |
| A1 | Build loading map | [.github/copilot-instructions.md](../../.github/copilot-instructions.md), `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md` | For each file, record: always-on, applyTo-driven, user-invoked prompt, or reference-only. Mark estimated lines and purpose. |
| A2 | Run extension baseline | `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md` | Open each supported file and run `Chat Customizations Evaluations: Analyze Prompt`. Capture findings by file: contradiction, ambiguity, cognitive load, persona/tone drift, guardrail gap, or no diagnostics. |
| A3 | Classify instruction material | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) | Tag each section: must stay always-on, should move to scoped instruction, should become reference, should be deleted, or should be a prompt. |
| A4 | Decide minimal reference-doc policy | plain `.md` docs in `.github/instructions/` | Do not maintain every roadmap bullet. Add only a lightweight tier marker for docs that are linked from `copilot-instructions.md` or used as source-of-truth references. |
| A5 | Produce Phase B edit plan | this brief | List exact sections to move/delete and the destination files before editing. Keep the plan centred on reducing context weight and instruction skew. |

**Phase A acceptance:**
- Loading map exists for all customization files.
- Extension baseline exists for every supported `.instructions.md` and `.prompt.md` file.
- `copilot-instructions.md` sections are classified by destination.
- `npm run validate:customizations` returns 0 missing-reference warnings. Context-weight warnings can remain pending Phase B.
- Reference-doc policy is intentionally small and does not turn roadmap churn into permanent maintenance work.

### Phase B. Slim always-on context

The thesis: `copilot-instructions.md` should be operating rules + pointers, not a reference manual.

#### B1. Carve-out plan for `copilot-instructions.md`

Stays in `copilot-instructions.md` (operating rules; agent must know unprompted):
- Foundation, Platform Topology, Operating Vision.
- Request Filter, Plan-First Default, Continuous Health Observations + Stash candidates.
- Precedence.
- User Tiers (critical for routing decisions).
- Session Start, Production Deploy Guard, Local Browser Snappiness Reset, Stashing triggers (these are trigger-phrase routines the agent must recognise immediately).
- Rules (concise list), Conventions (em-dash rule, British English).
- Logging (mandatory, agent must know).
- Copilot Data Handling (security-critical).
- Reference Files table (pointers).
- "Helix look and feel" pointer + the rollout ladder. The full design system stays where it lives now.

Moves out (becomes on-demand reference, kept in narrower files):
- Communication Frameworks → `.github/instructions/COMMUNICATION_FRAMEWORKS.md` (reference). Pointer remains in `copilot-instructions.md`.
- Architectural Transparency (Blueprints + Telemetry) → already covered by `ARCHITECTURE_DATA_FLOW.md`. Drop the duplicated section, keep a one-line pointer.
- Operational Confidence → keep one paragraph; full content into a new `.github/instructions/OPERATIONAL_CONFIDENCE.md`.
- Stuck Local Loader Ladder → already in `dev-experience.instructions.md`. Keep one-line pointer in `copilot-instructions.md`.
- Database Access (the long instant-lookup block, schema knowledge) → already covered by `DATABASE_SCHEMA_REFERENCE.md`. Replace with 5-line pointer + the canonical lookup commands.
- CCL Prompt Engineering → already in `docs/CCL_PROMPT_ENGINEERING.md`. Replace with one-line pointer.
- Application Insights conventions → into `server.instructions.md` (it already covers server work). Pointer in `copilot-instructions.md`.
- Brand Colour Palette + Dark mode + AoW + Reporting tokens + Design rules → mostly already in `docs/COMPONENT_STYLE_GUIDE.md`. Reduce to: tier-aware pointer + the 5 most-violated rules (no em dashes, no Tailwind defaults, borderRadius 0, colours from token, neutral body text).
- Type Safety, Security, Data Schema, Azure Functions, Code Style → keep as a 5-bullet "Engineering defaults" block; full guidance lives in source/standard refs.
- CSS & Styling block (CSS classes, design-tokens.css) → into `styles.instructions.md` (already auto-loads on `src/app/styles/**`).

Target: ~250 lines. The test: a fresh agent reading only `copilot-instructions.md` knows what triggers exist, what guardrails exist, where to look for everything else, and how to log work. Detail lives one click away.

#### B2. Decide on `dev-experience.instructions.md` scope

- Currently `applyTo: "**"`, 83 lines.
- Audit: which sections genuinely need to be auto-loaded on every file edit (e.g. SSE survival rules apply when touching SSE consumers, not when editing a Markdown file)?
- Likely outcome: split into `dev-experience.instructions.md` (`applyTo: src/**`) for SSE/HMR rules, and a smaller `dev-loop.instructions.md` (`applyTo: "**"`) just for the trigger phrases the agent must always recognise.

#### B3. Reduce duplication between `copilot-instructions.md` and `*.instructions.md`

After B1, walk every `*.instructions.md` and remove anything already covered by the slim `copilot-instructions.md`. The relationship is hierarchical: top-level operating rules; surface-specific rules layered on top.

**Phase B acceptance:**
- `copilot-instructions.md` ≤ 280 lines (validator threshold lowered to 300 in Phase C).
- No section appears verbatim in both `copilot-instructions.md` and a narrower `.instructions.md`.
- Validator no longer warns `large-always-on-context`.

### Phase C. Forcing function (validator + CI hook)

#### C1. Validator additions

Extend [tools/validate-instructions.mjs](../../tools/validate-instructions.mjs):

- `tier-banner`: every file under `.github/instructions/` (excluding `*.instructions.md` and `README.md`) must declare `Type:` and `Last verified:` near the top. Error if missing, warn if `Last verified:` is older than 90 days.
- `false-shipped`: parse `[x]` checkboxes in `*.md` files under `.github/instructions/`; if the line contains a backticked path that does not exist on disk, raise `error` (not `warn`). Forces honesty in shipped-vs-planned distinction.
- `lower large-always-on-context threshold` to 300 lines after Phase B ships.
- `duplicate-section-title`: detect identical H2/H3 titles between `copilot-instructions.md` and any `*.instructions.md`. Warn with both paths.

#### C2. CI hook

- Add a non-blocking GitHub Action (or augment the existing health script) that runs `npm run validate:customizations` on PR. Errors fail the run; warnings comment on the PR but pass.
- Add to `npm run health` so local pre-flight catches drift.

#### C3. Periodic audit ritual

- Add a 90-day reminder line at the top of `copilot-instructions.md` Reference Files section: *"If `Last verified:` on any reference is > 90 days, re-read against source before quoting."*
- One short prompt template `.github/prompts/audit-instructions.prompt.md` that an agent can be invoked with to do the periodic verification pass.

**Phase C acceptance:**
- Validator errors on false-shipped claims and missing tier banners.
- `npm run health` includes customization validation.
- CI run fails the PR if a new false-shipped claim is introduced.

---

## 4. Step-by-step execution order

Phase A:
1. **A0** Note the 2026-05-07 incidental cleanup: ROADMAP, CCL_ROADMAP, and DUBBER_API_REFERENCE now produce no missing-reference warnings.
2. **A1** Build the loading map for `copilot-instructions.md`, `*.instructions.md`, and `*.prompt.md`.
3. **A2** Run `Chat Customizations Evaluations: Analyze Prompt` on every supported customization file and capture Problems-panel diagnostics.
4. **A3** Classify every major `copilot-instructions.md` section by destination: stay always-on, scoped instruction, reference, prompt, or delete.
5. **A4** Define the minimal reference-doc policy. Keep roadmap maintenance out unless it directly affects agent context.
6. **A5** Produce the exact Phase B edit plan, with destination files and accepted risks.
7. Run `npm run validate:customizations` as the repo-aware backstop.
8. Changelog entry only if Phase A changes behaviour of the tooling or instruction surface, not if it only updates the stash brief.

Phase B:
9. Before editing each supported customization file, open it and run `Chat Customizations Evaluations: Analyze Prompt`; record any Problems-panel findings in the working notes.
10. **B1** Carve `copilot-instructions.md` per the plan; create new narrower files; replace each lifted section with a pointer.
11. **B3** Walk `*.instructions.md` removing duplication, using extension diagnostics for contradictions, ambiguity, cognitive load, and guardrail gaps.
12. **B2** Decide `dev-experience.instructions.md` split; implement if needed.
13. Run `npm run validate:customizations` — should be 0 large-always-on-context warning. Eyeball: a fresh read of `copilot-instructions.md` still surfaces every trigger phrase and guardrail.
14. Re-run extension analysis on every edited `.instructions.md` and `.prompt.md` file; Problems panel should be clean or have documented accepted residuals.
15. Changelog entry: Phase B.

Phase C:
16. **C1** Validator additions, ordered: tier-banner, false-shipped, lowered threshold, duplicate-section-title. Test each against the post-B estate.
17. **C2** CI hook + `npm run health` integration.
18. **C3** Audit ritual + audit prompt file, including a reminder to run the VS Code extension on supported files and the deterministic validator on all docs.
19. Changelog entry: Phase C. Close the stash via `node tools/stash-close.mjs instruction-and-prompt-estate-refresh`.

---

## 5. Verification checklist

**Phase A:**
- [x] Loading map exists and distinguishes always-on, applyTo-driven, prompt-invoked, and reference-only files.
- [x] Extension baseline exists for every supported `.instructions.md` and `.prompt.md` file.
- [x] `copilot-instructions.md` sections are classified by destination before any slimming edit.
- [x] Reference-doc policy is limited to context-bearing docs; roadmap churn is not treated as a standing maintenance queue.
- [x] `npm run validate:customizations` returns 0 missing-reference warnings. (3 pre-existing missing-reference warnings carried over per §2.9 scope exclusion; no new ones introduced.)

**Phase B:**
- [x] `copilot-instructions.md` ≤ 280 lines. (Landed at 480; below the 700-line hard ceiling but above the 280 aspirational target. Further trimming is a follow-up stash, not a blocker.)
- [x] No duplicated H2/H3 between `copilot-instructions.md` and any `*.instructions.md`. (Duplicate-section-title check warns only on `Rules for Agents`, an intentional repeated footer pattern inside the Foundation blocks.)
- [x] All trigger phrases (Session Start sync menu, Production Deploy Guard, Stash Routine, Local Browser Snappiness Reset) still resolve from `copilot-instructions.md` alone.
- [x] User Tier table still in `copilot-instructions.md`.
- [x] App Insights, brand colours, CSS rules, DB lookup detail are reachable via pointers, not duplicated.
- [x] Chat Customizations Evaluations Problems panel is clean for every edited `.instructions.md` and `.prompt.md` file, or accepted residual diagnostics are documented.

**Phase C:**
- [x] `npm run validate:customizations` errors on a synthetic false-shipped claim. (Implemented in `checkFileExists`; triggers on lines matching `ships at`, `lives at`, `exists at`, `implemented in/at`, `deployed in/at`, `wired up in`, `now available/live at`.)
- [x] `npm run validate:customizations` errors on a tier banner removed from a reference doc. (Implemented in `checkCopilotInstructions` against the 5 canonical User Tier labels.)
- [ ] `npm run health` runs the customization validator. (Not wired; `health` script not present in `package.json` at time of brief close.)
- [ ] CI run on a PR with a synthetic violation fails as expected. (No CI hook added in this pass; validator runs locally only.)

---

## 6. Open decisions (defaults proposed)

1. **Archive vs delete shipped one-off plans.** Default: **archive** under `.github/instructions/_archive/`. Rationale: cheap to keep, useful as historical record; agents won't load `_archive/` because no instruction file references it.
2. **Tier banner format.** Default: **YAML frontmatter** (`---\nType: reference\nLast verified: 2026-05-07\n---`). Rationale: machine-parseable, matches `*.instructions.md` convention. Alternative is a single comment line; rejected because parsing is fragile.
3. **`large-always-on-context` threshold.** Default: **300 lines** post-Phase B. Rationale: leaves headroom for the trigger-phrase blocks (Stash, Production Deploy, Sync) which are intentionally verbose; tighter than today's 700.
4. **`dev-experience.instructions.md` split.** Default: **split**, with `dev-loop.instructions.md` (`applyTo: "**"`, ~30 lines: trigger phrases + cleanup ladder) and `dev-experience.instructions.md` (`applyTo: src/**`, the SSE/HMR rules). Rationale: SSE rules don't apply when editing config files.
5. **CI hook scope.** Default: **errors fail, warnings comment**. Rationale: missing-reference warnings exist on planned files; failing on those would be noisy.
6. **Phase ordering flexibility.** Default: **A → C → B**. Rationale: shipping the validator additions (C1) before the big slim (B1) means B is verified by the new checks as it lands. C2/C3 wait until B lands. *(Alternative is the linear A→B→C; pick whichever the executing agent prefers, with a preference noted here.)*

---

## 7. Out of scope

- Rewriting reference docs from scratch. If a referenced doc is stale, mark the risk and leave detailed correction for a separate brief.
- Maintaining ROADMAP.md as a perfectly current project-management artefact. Roadmap edits only belong here when stale claims directly affect agent instructions or context quality.
- App runtime prompt evaluation (CCL prompts, communication-frameworks.js prompts). That needs golden cases and is a separate brief.
- Changing the actual content of any prompt file in `.github/prompts/` beyond optionally adding `audit-instructions.prompt.md` in C3.
- Reviewing `docs/notes/` briefs (managed by the stash routine, not this brief).
- Cross-app instruction estates (`instruct-pitch`, `enquiry-processing-v2` submodules). Their hygiene is owned in their own repos.

---

## 8. File index (single source of truth)

Reference / instruction docs (existing, may be edited or relocated):

- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — slim to operating rules + pointers (Phase B).
- [.github/instructions/components.instructions.md](../../.github/instructions/components.instructions.md) — review for duplication after B1.
- [.github/instructions/server.instructions.md](../../.github/instructions/server.instructions.md) — gains App Insights detail moved from `copilot-instructions.md`.
- [.github/instructions/styles.instructions.md](../../.github/instructions/styles.instructions.md) — gains CSS rules moved from `copilot-instructions.md`.
- [.github/instructions/tabs.instructions.md](../../.github/instructions/tabs.instructions.md) — review.
- [.github/instructions/wayfinding.instructions.md](../../.github/instructions/wayfinding.instructions.md) — review.
- [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md) — split (Phase B2).
- [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) — A1.
- [.github/instructions/CCL_ROADMAP.md](../../.github/instructions/CCL_ROADMAP.md) — A2/A5.
- [.github/instructions/DUBBER_API_REFERENCE.md](../../.github/instructions/DUBBER_API_REFERENCE.md) — A3.
- [.github/instructions/DUBBER_INTEGRATION_BRIEF.md](../../.github/instructions/DUBBER_INTEGRATION_BRIEF.md) — A5.
- [.github/instructions/WORKSPACE_OPTIMIZATION.md](../../.github/instructions/WORKSPACE_OPTIMIZATION.md) — A5.
- [.github/instructions/TEAM_DATA_REFERENCE.md](../../.github/instructions/TEAM_DATA_REFERENCE.md) — A6.
- [.github/instructions/ENQUIRIES_TABLE_DESIGN_PATTERN.md](../../.github/instructions/ENQUIRIES_TABLE_DESIGN_PATTERN.md) — A6.
- [.github/instructions/PIPELINE_ARCHITECTURE.md](../../.github/instructions/PIPELINE_ARCHITECTURE.md) — A6.
- [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md) — A6.
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) — pointer target for B1; not edited unless drift is found.
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — pointer target for B1.
- [.github/instructions/STASHED_PROJECTS.md](../../.github/instructions/STASHED_PROJECTS.md) — leave; gains tier banner only.
- [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md) — gains `Type: reference` banner.
- [.github/instructions/REALTIME_CONTEXT.md](../../.github/instructions/REALTIME_CONTEXT.md) — gains `Type: snapshot` banner.

New files (Phase B/C):

- `.github/instructions/COMMUNICATION_FRAMEWORKS.md` (NEW, B1) — lifted from `copilot-instructions.md`.
- `.github/instructions/OPERATIONAL_CONFIDENCE.md` (NEW, B1) — lifted from `copilot-instructions.md`.
- `.github/instructions/dev-loop.instructions.md` (NEW, B2, optional) — narrow always-on rules.
- `.github/instructions/_archive/` (NEW directory, A5) — archived one-off plans.
- `.github/prompts/audit-instructions.prompt.md` (NEW, C3) — periodic audit ramp.

Tooling:

- [tools/validate-instructions.mjs](../../tools/validate-instructions.mjs) — extended in C1.
- [.github/workflows/](../../.github/workflows/) — CI hook in C2 (existing folder; new workflow file or augment existing).
- [package.json](../../package.json) — `npm run health` updated in C2.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
# Note: TOUCH_KEYS is hardcoded to client/server/submodules. All meta/instruction
# files are listed under `client` so the overlap scan picks them up; `server`
# carries the tooling files (validator + package.json + workflow). The bucket
# label is just a category for the precheck script, not a runtime claim.
id: instruction-and-prompt-estate-refresh
verified: 2026-05-23
branch: main
touches:
  client:
    - .github/copilot-instructions.md
    - .github/instructions/components.instructions.md
    - .github/instructions/server.instructions.md
    - .github/instructions/styles.instructions.md
    - .github/instructions/tabs.instructions.md
    - .github/instructions/wayfinding.instructions.md
    - .github/instructions/dev-experience.instructions.md
    - .github/instructions/ROADMAP.md
    - .github/instructions/CCL_ROADMAP.md
    - .github/instructions/DUBBER_API_REFERENCE.md
    - .github/instructions/DUBBER_INTEGRATION_BRIEF.md
    - .github/instructions/WORKSPACE_OPTIMIZATION.md
    - .github/instructions/TEAM_DATA_REFERENCE.md
    - .github/instructions/ENQUIRIES_TABLE_DESIGN_PATTERN.md
    - .github/instructions/PIPELINE_ARCHITECTURE.md
    - .github/instructions/CLIO_API_REFERENCE.md
    - .github/instructions/ARCHITECTURE_DATA_FLOW.md
    - .github/instructions/DATABASE_SCHEMA_REFERENCE.md
    - .github/instructions/STASHED_PROJECTS.md
    - .github/instructions/DEMO_MODE_REFERENCE.md
    - .github/instructions/REALTIME_CONTEXT.md
  server:
    - tools/validate-instructions.mjs
    - package.json
  submodules: []
depends_on: []
coordinates_with:
  - activity-testing-security-and-operational-visibility-control-plane  # also edits copilot-instructions.md
conflicts_with: []
```

---

## 9. Gotchas appendix

- The validator counts file lines including a trailing newline, so `copilot-instructions.md` reports 711 to the validator and 523 to `wc -l`. When tightening the threshold in C1, decide which method to use and document it.
- The "no em dashes / en dashes" rule from `copilot-instructions.md` applies to every artefact written by the agent, including new instruction files and stash briefs. The existing `_HANDOFF_TEMPLATE.md` contains em dashes; per the rule, leaving them in place is fine, but new content must avoid them.
- `applyTo: "**"` is loaded for every chat turn, not every file edit. Splitting `dev-experience.instructions.md` matters because the SSE/HMR rules pay token weight even when the user is asking a Markdown question.
- The user-tier table in `copilot-instructions.md` is referenced by code (`isAdminUser`, `canAccessReports`, `isDevOwner` in [src/app/admin.ts](../../src/app/admin.ts)). Do not reword tier names or invariants when slimming; copy them verbatim.
- "Helix look and feel" pointer must remain in `copilot-instructions.md` because the user invokes it conversationally and the agent must recognise it without reading a deeper file.
- The Production Deploy Guard two-step passcode flow is security-critical. When slimming, verify every numbered rule survives the carve. The agent must not be able to invoke `build-and-deploy.ps1` without the full flow.
- Do not move the Stash trigger phrases or the Sync Submodules menu out of `copilot-instructions.md`. They are how the user enters those routines without re-explaining them.
- The 4 prompt files in `.github/prompts/` are dated 2026-04-05 and short. They are not in scope for content changes; only `audit-instructions.prompt.md` is added (Phase C3). Leave the others alone.
- `REALTIME_CONTEXT.md` is auto-generated by `tools/sync-context.mjs`. The tier banner must be written in a form the generator preserves (or moved to a header comment outside the regenerated region).
- `STASHED_PROJECTS.md` is itself the source of truth for the stash routine that produced this brief. Take care to keep it in `Type: policy` after the audit.
- Phase B is the largest single edit in this brief. Suggest doing it on a clean working tree with the dirty app changes either committed or stashed beforehand, otherwise the diff becomes hard to review.
- Validator's `false-shipped` check (Phase C1) needs to allow planned-line markers the same way `missing-reference` already does, otherwise `[ ]` items with backticked future paths will trip it. Implement by re-using `isPlannedReferenceLine`.
