# Helix Hub

Internal operations platform for Helix Law. Every change compounds.

## Foundation

Compounding context. Each interaction deposits a fragment — a rule, a preference, a decision. Small alone; over time they stack, reinforce, and the system sharpens without re-teaching.

## Request Filter (Always Apply)

Every user request is filtered through this, in order:

1) **Deliver the request** (primary outcome). Do exactly what was asked.
2) **Compound without clutter** (secondary outcome). While touching the same area, make small, safe improvements that reduce future friction (types, dead code, confusing naming, brittle scripts, stale guidance).
3) **Avoid scope creep**. If an improvement is not directly adjacent, park it in `.github/instructions/ROADMAP.md` instead of doing it now.

## Database Access (CRITICAL)

When user says "check X database" or "look up in Y table":

**DON'T** trial-and-error connections. **DO** use these exact patterns:

```javascript
// Instructions DB (Deals, Instructions tables)
import { config } from 'dotenv'; import sql from 'mssql'; config();
const pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);

// Core Data DB (enquiries, matters tables)  
const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);

// Query format: const result = await pool.request().query('SELECT ...');
```

**INSTANT LOOKUPS - Use these one-liners:**

```bash
# Universal lookup script (FASTEST)
node tools/instant-lookup.mjs passcode 37693
node tools/instant-lookup.mjs enquiry 12345  
node tools/instant-lookup.mjs deal 898
node tools/instant-lookup.mjs instruction HLX-00898-37693
node tools/instant-lookup.mjs person "Luke Test"
node tools/instant-lookup.mjs pipeline HLX-00898-37693
node tools/instant-lookup.mjs --plan person "Luke Test"

# Matter opening one-off replay (API endpoint chain)
node tools/run-matter-oneoff.mjs HLX-30038-73942 RCH --fee-earner "Ryan Choi" --originating "Ryan Choi" --supervising "Alex"
node tools/run-matter-oneoff.mjs HLX-30038-73942 RCH --dry-run

# The instant-lookup script auto-resolves Key Vault passwords (no flags) and fails fast if auth hangs.

# Raw one-liners (if script unavailable)
node -e "import('dotenv').then(d=>d.config());import('mssql').then(sql=>sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING).then(p=>p.request().query('SELECT * FROM Instructions WHERE InstructionRef LIKE \"%PASSCODE%\" OR ProspectId=PASSCODE').then(r=>console.log(JSON.stringify(r.recordset,null,2)))))"

node -e "import('dotenv').then(d=>d.config());import('mssql').then(sql=>sql.connect(process.env.SQL_CONNECTION_STRING).then(p=>p.request().query('SELECT * FROM enquiries WHERE ID=ENQUIRY_ID').then(r=>console.log(JSON.stringify(r.recordset,null,2)))))"

**Name lookups (critical):**

- If the user asks for a *pipeline* (legacy space / end-to-end chain), ALWAYS use `pipeline` (e.g., `node tools/instant-lookup.mjs pipeline "Robert Bedwell"` or `node tools/instant-lookup.mjs pipeline HLX-00898-37693`).
- If the user asks to find a *person/enquiry record* by name (Core Data / enquiries tables), use `person` (e.g., `node tools/instant-lookup.mjs person "Luke Test"`).
- Do NOT run ad-hoc `node -e` SQL for name searches.
- Only run the specific lookup requested. Do NOT expand to deals/instructions unless explicitly asked.

**Confirm before running commands (chat-first):**

- In chat, confirm the intended lookup first.
- Default: after chat confirmation, run the real command directly (no `--plan`).
- Use `--plan` only when the user explicitly asks for a dry-run preview, or when the operation is unusually risky/expensive.

**Node ESM note (prevents `sql.connect is not a function`)**

When using `node -e` with `import('mssql')`, default export may be nested. Use:
```js
const m = await import('mssql');
const sql = m.default || m;
const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
```

**AVOID `node -e` for complex commands (CRITICAL)**

PowerShell escaping breaks `node -e` commands with backticks, nested quotes, or template literals. Symptoms: `SyntaxError: Invalid or unexpected token`.

**Instead, create a temp script:**
```bash
# 1. Create script file (scripts/ is gitignored)
# 2. Run it: node scripts/temp-task.mjs
# 3. Delete it: Remove-Item scripts/temp-task.mjs
```

Use `node -e` only for trivial one-liners. For anything with SQL, Key Vault, or async chains, write a temp file.
```

**SCHEMA KNOWLEDGE** (no discovery needed):

**Instructions DB Tables:**
- `Instructions`: InstructionRef, Stage, ClientId, ProspectId, FirstName, LastName
- `Deals`: DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef

**Core Data DB Tables:**  
- `enquiries`: ID, First_Name, Last_Name, Email, Phone_Number, Area_of_Work, Company
- `matters`: [Display Number], [Unique ID], [Status], [Client Name]

**Key field names**: enquiries uses `First_Name`/`Last_Name`/`ID`. Instructions uses `InstructionRef`/`ProspectId`. NO discovery queries needed.
4) **Don’t work only on the machine**. The “machine” is the default lens, not a separate project; it should progress in small deposits alongside real feature/debug work.
5) **Prefer deletion over documentation sprawl**. Update existing instruction files; delete stale docs; avoid creating new docs unless there is genuinely no existing home.

## Rules

- Keep replies short unless asked. Default: 1–5 lines.
- Ask 1 question only if blocked.
- Prefer doing over proposing.
- Keep scope tight: do only what was asked.
- Be proactive: remove redundant/dead code while in the area (only if safe and in-scope).
- **Flag user-facing delays and uncertainty**. Use loading states, confirmation prompts, brief status logs. Transparency > silence. Proactive, not reactive.
- Never push to Git or deploy unless explicitly asked.
- Submodules: read-only. No fetch, pull, or push. Status checks only. Unless the user asks with the passcode 2011.
- When decisions are made, update instruction files. Don't rely on user repeating themselves.
- Don't maintain stale docs. If info can be read from source (code, APIs, generated context), prefer that. Remove unused docs rather than updating them.

## Product guardrails (do not break)

- **Luke Test**: `HLX-27367-94842` is the production health indicator. Never delete.
- **ID pills** must call `onEIDClick()` (no detail expansion).
- **Risk colours** must use `RiskAssessmentResult` (not `TransactionRiskLevel`).
- **Deal capture emails** must go to `lz@helix-law.com`.

## Session Start

On first interaction, run: `node tools/sync-context.mjs`  
This generates `.github/instructions/REALTIME_CONTEXT.md` with current branch, submodule state, and server status.

Full session init (slower, more thorough): `node tools/session-start.mjs`

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

## Logging

Log substantial tasks in `logs/changelog.md`. Format: Date / Request / What changed (+ files)

## Application Insights (CRITICAL — read before adding server-side features)

Every server-side process MUST emit telemetry to Application Insights. This is non-negotiable — if the server restarts or a sync fails silently, App Insights is the only way to know what happened.

**How it works:**
- SDK initialised in `server/index.js` (before Express) via `server/utils/appInsights.js`
- Auto-detects `APPLICATIONINSIGHTS_CONNECTION_STRING` in Azure; no-op locally
- HTTP requests, exceptions, console output, and dependencies are auto-tracked
- Custom events/metrics added at key lifecycle points

**When adding or modifying any server-side process:**
```javascript
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

// On start
trackEvent('Component.Entity.Started', { operation, triggeredBy, ...context });

// On success
trackEvent('Component.Entity.Completed', { operation, triggeredBy, durationMs, rowCount, ...context });
trackMetric('Component.Entity.Duration', durationMs, { operation });

// On failure (MOST IMPORTANT — always track both exception AND event)
trackException(error, { operation, phase: 'whatWasHappening', entity: 'WhatEntity' });
trackEvent('Component.Entity.Failed', { operation, error: error.message, ...context });
```

**Naming convention:** `Component.Entity.Lifecycle` — e.g. `DataOps.CollectedTime.Completed`, `Scheduler.Wip.Hot.Failed`

**Rules:**
1. Track BOTH success and failure. Failure paths are most valuable.
2. Always include `operation`, `triggeredBy`, and date range in properties.
3. Use `trackException` in every catch block — this is how Azure Alerts find failures.
4. Use `trackMetric` for anything you'd want to graph (durations, row counts, queue depths).
5. Properties must be strings (the helper auto-converts).
6. See `ARCHITECTURE_DATA_FLOW.md` → "Application Insights Telemetry" for KQL queries.

**Currently instrumented:**
- Data Operations: syncCollectedTime, syncWip (started/completed/validated/failed)
- Scheduler: all Hot/Warm/Cold tiers for both Collected and WIP
- Matter Opening Pipeline: opponents, matterRequests, clioContacts, clioMatters (started/completed/failed + duration metrics)
- Client-side Matter Opening: pre-validation failures, processing step failures, successful completions (via /api/telemetry → trackEvent)
- HTTP requests: auto-instrumented by SDK
- Console output: auto-captured as traces

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
