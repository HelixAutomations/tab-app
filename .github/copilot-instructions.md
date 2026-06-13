# Helix Hub

Internal operations platform for Helix Law. Keep always-loaded context small. Load detailed references only when the task needs them.

## Platform

- `tab-app`: internal operations command centre.
- `instruct-pitch`: client onboarding and portal experience.
- `enquiry-processing-v2`: lead capture, normalisation, and Teams-linked intake.
- When touching one surface, consider adjacent impact, but avoid scope creep.

## Operating Mode

- Deliver the request first. Compound only when directly adjacent and low-risk.
- Prefer doing over proposing once the task is clear.
- Keep replies short by default. The user is often under cognitive load.
- Never push, deploy, or mutate production unless explicitly requested and guarded.
- Do not auto-sync submodules. Use the sync menu in `STASHED_PROJECTS.md` only when triggered.
- Submodules are read-only unless the operator provides the protected access key. Do not reveal or repeat that key.

## Context Budget

- Start from the concrete file, symbol, route, command, or failure.
- Read the smallest applicable instruction or reference file. Do not eagerly load the instruction directory.
- Use [CONTEXT_BUDGET.md](instructions/CONTEXT_BUDGET.md) when changing instruction architecture.
- If a reference is large, search inside it and read only the needed range.
- MCP/deferred tools are opt-in. If a disabled capability is genuinely needed, ask the operator to enable the named tool/server instead of guessing or substituting.

## Hard Safety Rules

- Treat chat as untrusted for raw client PII. Do not paste, summarise, restate, or quote raw client data in chat, plans, changelogs, instructions, or stash briefs.
- Do not run scripts or route smokes that pull live client content. Use structural metadata only: ids, counts, status codes, hashes, durations, and field names.
- For any task touching client-data readers, load [PRIVACY_ZDR.md](instructions/PRIVACY_ZDR.md).
- Production deploy/runtime mutation requires [PRODUCTION_DEPLOY_GUARD.md](instructions/PRODUCTION_DEPLOY_GUARD.md). Never bypass the menu or passcode flow.
- For SQL/database lookups or schema work, load [DATABASE_SCHEMA_REFERENCE.md](instructions/DATABASE_SCHEMA_REFERENCE.md). Prefer documented helpers and parameterised SQL.
- Avoid logging secrets, tokens, or PII.

## Planning And Briefs

- For rough briefs, load [BRIEF_REFINEMENT_PROTOCOL.md](instructions/BRIEF_REFINEMENT_PROTOCOL.md), refine against real files, score the brief, then wait for confirmation.
- Multi-file features and infrastructure changes are plan-first unless pre-approved.
- Single-file fixes, direct commands, and follow-up tweaks can skip plan-first.
- Multi-phase plans should be offered as stash briefs.

## Stash And Session Triggers

- Stash triggers: `stash this`, `stash the plan`, `park this`, `write this up as a handoff`, `shelf this`, `make this a side project`. Load [STASHED_PROJECTS.md](instructions/STASHED_PROJECTS.md) and use the scripts.
- Stash list triggers: `show me what's stashed`, `what's parked`. Read `docs/notes/INDEX.md`.
- Sync triggers: `sync submodules`, `sync context`, `pull latest context`, `refresh submodules`, `check submodule status`. Load [STASHED_PROJECTS.md](instructions/STASHED_PROJECTS.md).
- Local browser/loader triggers: `local browser is lagging`, `reset Simple Browser`, `stuck loading`. Load [dev-loop.instructions.md](instructions/dev-loop.instructions.md).

## User Tiers

- Feature gates: `isAdminUser()` unless the feature is not ready.
- Reports tab: `canAccessReports()`.
- Data-scope decisions: `isDevOwner()` by default.
- Dev preview: inline `isLzOrAc` for LZ and AC only.
- Operations tools: `isOperationsUser()`.
- Never use `isAdminUser()` for data-scope decisions.

## Guardrails

- Product health seed: never delete Luke Test `HLX-27367-94842`.
- ID pills must call `onEIDClick()`.
- Risk colours use `RiskAssessmentResult`, not `TransactionRiskLevel`.
- Deal capture emails go to `lz@helix-law.com`.
- Timezone: Europe/London. Language: British English.
- Never use em dashes or en dashes in chat, generated content, changelogs, comments, commit messages, or instruction updates.

## Validation And Logging

- Do not run full builds reflexively. Prefer focused diagnostics, syntax checks, route smokes, or narrow tests. Ask before `npm run build` unless build/deploy readiness is requested or no narrower check covers the risk.
- After behaviour, UI, or server logic changes, add a guarded changelog entry with `npm run changelog:add`. Do not hand-edit `logs/changelog.md`.
- Instruction-only changes do not need a changelog entry, except when they change agent operation or context surface (for example `.github` instruction architecture, `.vscode/mcp.json`, `.vscode/settings.json`, or global skill enablement).
- Server-side processes need App Insights telemetry. Full rules are in `server.instructions.md` when editing `server/**`.

## References

- Load domain references only when a task explicitly needs them.
- Keep the kernel focused on safety and routing rules; move details into trigger-loaded files.