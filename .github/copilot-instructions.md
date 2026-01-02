# Helix Hub

Internal operations platform for Helix Law. Every change compounds.

## Foundation

Compounding context. Each interaction deposits a fragment — a rule, a preference, a decision. Small alone; over time they stack, reinforce, and the system sharpens without re-teaching.

## Rules

- Keep replies short unless asked. Default: 1–5 lines.
- Ask 1 question only if blocked.
- Prefer doing over proposing.
- Keep scope tight: do only what was asked.
- Be proactive: remove redundant/dead code while in the area (only if safe and in-scope).
- Never push to Git or deploy unless explicitly asked.
- Submodules: read-only. No fetch, pull, or push. Status checks only.
- When decisions are made, update instruction files. Don't rely on user repeating themselves.
- Don't maintain stale docs. If info can be read from source (code, APIs, generated context), prefer that. Remove unused docs rather than updating them.

## Session Start

On first interaction, run: `node scripts/sync-context.mjs`  
This generates `.github/instructions/REALTIME_CONTEXT.md` with current branch, submodule state, and server status.

Full session init (slower, more thorough): `node scripts/session-start.mjs`

## Conventions

- Time: Europe/London
- Language: British English
- Git commits: concise, imperative

## Logging

Log substantial tasks in `logs/changelog.md`. Format: Date / Request / What changed (+ files)

## Reference Files (read these)

| File | Purpose |
|------|---------|
| `.github/instructions/REALTIME_CONTEXT.md` | Current branch, submodules, server state |
| `.github/instructions/ROADMAP.md` | Tracked priorities and future work |
| `.github/instructions/DATABASE_SCHEMA_REFERENCE.md` | Tables, fields, query patterns |
| `.github/instructions/TEAM_DATA_REFERENCE.md` | Team table, rates, dual-DB sync |
| `.github/instructions/CLIO_API_REFERENCE.md` | Clio integration, auth, endpoints |
| `.github/instructions/ARCHITECTURE_DATA_FLOW.md` | System architecture, data flows |

## Type Safety

- Prefer `unknown` over `any` at boundaries, narrow with type guards when practical.
- Consider returning `{ ok: true, value } | { ok: false, error }` for validation errors.

## Security

- Prefer parameterized SQL to prevent injection attacks.
- Avoid logging secrets, tokens, or PII.
- Use env vars or Key Vault (DefaultAzureCredential) for sensitive data.

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
