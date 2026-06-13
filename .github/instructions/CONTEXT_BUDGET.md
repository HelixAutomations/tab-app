# Context Budget Guide

Last verified: 2026-06-09

Purpose: keep the always-loaded agent context small. Load detail only when the task needs it.

## Tier 0: kernel

The root `.github/copilot-instructions.md` should stay under roughly 120 lines. It should contain only:

- project identity and topology
- hard safety rules
- short trigger routers for stash, production deploy, database access, local loader debug, and rough briefs
- links to reference files

Do not paste long protocols into the kernel. Put the detailed protocol in a named file and link to it.

## Tier 1: file-path rules

Use `.instructions.md` files with narrow `applyTo` patterns for rules needed while editing matching files.

Current intended auto-load files:

- `server.instructions.md` for `server/**`
- `tabs.instructions.md` for `src/tabs/**`
- `components.instructions.md` for `src/components/**`
- `styles.instructions.md` for `src/app/styles/**`
- `dev-experience.instructions.md` and `wayfinding.instructions.md` for `src/**`
- privileged data guards for their exact server/script surfaces only

Avoid `applyTo: "**"`. It burns context on every task.

## MCP and deferred tools

- Keep repo-level MCP servers disabled unless used in the current month or required by an active task.
- Global user skills unused in the month-to-date audit are quarantined under `C:\Users\lukew\.agents\skills.disabled-2026-06-09`.
- If an MCP/deferred capability is disabled and needed, stop and ask the operator to enable the named server or extension.
- If a quarantined skill is needed, ask before restoring only the named skill directory to `C:\Users\lukew\.agents\skills`.
- Do not work around a disabled tool with a less appropriate tool if that changes safety, scope, or data exposure.
- Re-audit transcripts before re-enabling broadly.

## Tier 2: trigger-loaded references

Use normal `.md` reference files for detailed workflows. Load them only when the trigger applies.

- `STASHED_PROJECTS.md`: stash, parked work, stash overlap, submodule sync
- `PRODUCTION_DEPLOY_GUARD.md`: production deploy or production runtime mutation
- `PRIVACY_ZDR.md`: client data, live database content, reader guards, safe summaries
- `BRIEF_REFINEMENT_PROTOCOL.md`: rough briefs and 9-section refinement
- `DATABASE_SCHEMA_REFERENCE.md`: SQL lookup or schema work
- `dev-loop.instructions.md`: local loader or Simple Browser lag

## Agent discipline

- Start from the concrete file, symbol, route, command, or failure.
- Read the smallest applicable instruction or reference file, not the whole instruction directory.
- Do not load roadmap, architecture, database, Clio, or stash references unless the task explicitly touches that surface.
- If a reference is over 200 lines, search within it first and read only the matching range.
- When adding new guidance, prefer a scoped instruction or trigger-loaded reference over the kernel.
- When changing context or capability surface (`.github` instruction architecture, `.vscode/mcp.json`, `.vscode/settings.json`, global skill enable/disable), add a guarded changelog entry with `npm run changelog:add`.
