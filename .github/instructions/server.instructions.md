---
applyTo: "server/**"
---

# Server Rules (auto-attached)

Last verified: 2026-05-23

## Application Insights telemetry (non-negotiable)

Every server-side process MUST emit telemetry. If a sync fails silently, App Insights is the only way to know what happened.

**How it works:**
- SDK initialised in `server/index.js` (before Express) via `server/utils/appInsights.js`.
- Auto-detects `APPLICATIONINSIGHTS_CONNECTION_STRING` in Azure; no-op locally.
- HTTP requests, exceptions, console output, and dependencies are auto-tracked.
- Custom events/metrics added at key lifecycle points.

**When adding or modifying any server-side process:**

```javascript
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

// On start
trackEvent('Component.Entity.Started', { operation, triggeredBy, ...context });

// On success
trackEvent('Component.Entity.Completed', { operation, triggeredBy, durationMs, rowCount, ...context });
trackMetric('Component.Entity.Duration', durationMs, { operation });

// On failure (MOST IMPORTANT, always track both exception AND event)
trackException(error, { operation, phase: 'whatWasHappening', entity: 'WhatEntity' });
trackEvent('Component.Entity.Failed', { operation, error: error.message, ...context });
```

**Naming convention:** `Component.Entity.Lifecycle`, e.g. `DataOps.CollectedTime.Completed`, `Scheduler.Wip.Hot.Failed`.

**Rules:**
1. Track BOTH success and failure. Failure paths are most valuable.
2. Always include `operation`, `triggeredBy`, and date range in properties.
3. Use `trackException` in every catch block. This is how Azure Alerts find failures.
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

## SQL access (CRITICAL — prefer the helper)

**Default for new code:** import from `server/utils/db.js`, do not import `mssql` directly.

```javascript
const { withRequest, getPool, sql } = require('../utils/db');

// Simple query
const rows = await withRequest(process.env.SQL_CONNECTION_STRING, async (request, sql) => {
  request.input('id', sql.Int, id);
  const result = await request.query('SELECT * FROM enquiries WHERE ID = @id');
  return result.recordset;
});
```

`db.js` gives you: pooled connection reuse, built-in retry, consistent error shape, one place for App Insights instrumentation. Always parameterise (`request.input('name', sql.NVarChar, value)`). Never concatenate user input into SQL strings.

### Drive-by consolidation rule (compounding hygiene)

There are ~39 legacy sites under `server/` that still do `const sql = require('mssql')` and `await sql.connect(...)` directly. They work fine, but they bypass the helper. **When you are already editing a file that does this**, migrate it to `withRequest` / `getPool` as part of the same change. Do not open a separate PR just to refactor; do not skip the migration just because the file "works". The rule:

- If you touch a function that already calls `sql.connect(...)`, convert that function to `withRequest` before you leave the file.
- If the file's top imports `mssql` but no longer needs it after your edit, drop the import.
- If you add a new SQL query anywhere under `server/`, it MUST go through `db.js`. Do not introduce new direct `require('mssql')` sites.

Known legacy sites (audit 2026-05-23, not exhaustive): `server/operatorActions/*-lookup.js`, `server/operatorActions/tiller-verify.js`, `server/operatorActions/matter-oneoff-replay.js`, `server/routes/access.js`, `server/routes/ccl.js`, `server/routes/ccl-ai.js`, `server/routes/counsel.js`, `server/routes/dubberCalls.js`, `server/routes/receptionKpis.js`.

## Key Vault / secrets (CRITICAL — prefer the helper)

**Default for new code:** import from `server/utils/getSecret.js`, do not import `@azure/keyvault-secrets` or `@azure/identity` directly.

```javascript
const { getSecret } = require('../utils/getSecret');
const apiKey = await getSecret('clio-api-key');
```

`getSecret.js` gives you: 7-day dev cache (`.secrets-cache.json`), inflight dedupe, `DefaultAzureCredential` reuse, consistent error logging. Same drive-by consolidation rule applies — when editing a file that imports `@azure/keyvault-secrets` directly, migrate it.

## Error handling
- Every Express route must have a try/catch that calls `trackException` and returns a proper status code.
- Never swallow errors silently — at minimum log + track.

## Environment
- Secrets come from env vars or Key Vault (`DefaultAzureCredential`). Never hardcode.
- CORS headers and OPTIONS preflight must be handled when adding new API routes.

## Local dev CORS (critical)

- In dev, do not assume the browser always comes from `http://localhost:3000`. Teams/local shells and ad-hoc localhost hosts can call Express on `:8080` directly.
- If a local browser flow can hit Express cross-origin, allow `http(s)://localhost:*` and `http(s)://127.0.0.1:*` in dev CORS.
- If the route relies on `userContextMiddleware`, include `x-user-email`, `x-helix-initials`, and `x-helix-entra-id` in `allowedHeaders` or the browser flow can fail while `curl` still succeeds.
- When debugging a "route works in curl but hangs in UI" report, validate from the browser origin before changing route internals.

## Deployment & Dependencies (CRITICAL — read before adding require())

### Two separate dependency trees
The app has **two** `package.json` files with **separate** `node_modules`:

| File | Installed by | Deployed to staging/prod |
|------|-------------|------------------------|
| `package.json` (root) | `npm install` (dev) | **NO** — root `node_modules` is never deployed |
| `server/package.json` | `npm ci --prefix server` (deploy scripts) | **YES** — `server/node_modules` is copied into the deploy zip |

### The silent-failure trap
When developing locally, Node.js resolves `require('foo')` by climbing directories — so a module in root `node_modules` satisfies a `require()` in `server/`. This means **missing `server/package.json` entries don't crash locally** but **crash in staging/production** with `Cannot find module 'foo'` → iisnode error 500.1001.

### Rules
1. **Every `require('pkg')` in any file under `server/` must have a corresponding entry in `server/package.json`.** Not just root `package.json`.
2. When adding a new npm package to a server route or util, run `cd server && npm install pkg-name --save`.
3. Transitive deps (e.g. `tedious` via `mssql`, `uuid` via `mssql`) happen to resolve but are fragile — if the parent package drops them, the server crashes. Add explicit entries for anything directly imported.
4. **Validation command** (run before deploy to catch missing deps):
   ```bash
   node -e "const fs=require('fs'),path=require('path');const pkg=JSON.parse(fs.readFileSync('server/package.json','utf8'));const deps=new Set(Object.keys(pkg.dependencies||{}).concat(Object.keys(pkg.devDependencies||{})));const builtins=new Set(require('module').builtinModules.flatMap(m=>[m,'node:'+m]));const files=[];function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(f==='node_modules'||f==='.git')continue;const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(f.endsWith('.js'))files.push(p)}}walk('server');const missing=new Set();for(const f of files){const c=fs.readFileSync(f,'utf8');const m=c.matchAll(/require\(['\x22]([^./][^'\x22]*)['\x22]\)/g);for(const[,mod]of m){const top=mod.split('/')[0].startsWith('@')?mod.split('/').slice(0,2).join('/'):mod.split('/')[0];if(!builtins.has(top)&&!deps.has(top))missing.add(top+' <-- '+path.relative('server',f))}}if(missing.size){console.error('MISSING from server/package.json:');for(const m of[...missing].sort())console.error(' ',m);process.exit(1)}else console.log('All server deps OK')"
   ```
5. The deploy scripts (`build-and-deploy.ps1`, `build-and-deploy-staging.ps1`) run `npm ci --prefix server --only=prod` and copy `server/node_modules` into the deploy zip. They do **not** copy root `node_modules`.

### Known history
- `zod` was missing → staging 500 crash (April 2026, envSchema.js)
- `activity-card-lab/catalog` was missing → staging 500 crash (April 2026, directory not copied)
- `stripe`, `compression` were missing from `server/package.json` but resolved via root `node_modules` locally

### Deploy structure (flat)
In the deploy zip, `server/index.js` is copied as `server.js` at the root. IISNode routes all requests through it. The structure is:
```
server.js          (copied from server/index.js)
web.config         (from server/web.config)
package.json       (from server/package.json)
node_modules/      (from server/node_modules — production only)
routes/            (from server/routes/)
utils/             (from server/utils/)
middleware/        (from server/middleware/)
activity-card-lab/ (from server/activity-card-lab/)
operatorActions/  (from server/operatorActions/)
prompts/           (from server/prompts/)
index.html         (CRA build output)
static/            (CRA build output)
```

## Middleware order (`server/index.js`)
- Middleware order matters. The current high-level stack before route registration is:
   - compression skip-wrapper for SSE routes
   - `/api` hydration gate while Key Vault secrets are loading
   - `helmet(...)`
   - prod-only global rate limiter on `/api/`
   - prod-only AI rate limiter on `/api/ccl-ai` and `/api/ai`
   - operations request logger (`opAppend` start/finish)
   - `cors(...)`
   - dev-only `devMiddleware`
   - `/api/stripe/webhook` raw-body router before JSON parsing
   - `express.json(...)`
   - `express.urlencoded(...)`
   - `requestTrackerMiddleware`
   - `userContextMiddleware`
   - `requireUser`
- Do not move `requireUser` ahead of `userContextMiddleware`, and do not move the Stripe webhook behind `express.json()`.

## SSE map
- Long-lived SSE routes are intentionally excluded from compression and from the global rate limiter skip path. When adding a new SSE route, update the compression skip-wrapper in `server/index.js`.
- Known SSE routes used by live UI surfaces:
   - `/api/home-metrics/stream` → `server/routes/home-metrics-stream.js` — progressive Home metric hydration (`futureBookings`, `outstandingBalances`; `transactions` only on explicit request)
   - `/api/ops-pulse/stream` → `server/routes/ops-pulse.js` — Helix Eye realtime pulse, scheduler, errors, sessions, requests; additionally gated to dev group (`LZ`, `AC`)
   - `/api/enquiries-unified/stream` → attached in `server/routes/enquiries-unified.js` — lightweight “enquiries changed” refresh events
   - `/api/attendance/attendance/stream` and `/api/attendance/annual-leave/stream` → attached in `server/routes/attendance.js` — attendance and leave refresh events
   - `/api/future-bookings/stream` → attached in `server/routes/futureBookings.js` — future booking refresh events
   - `/api/data-operations/stream` → attached in `server/routes/dataOperations.js` — long-running sync/progress events
   - `/api/logs/stream` → `server/routes/logs-stream.js` — live ops log tail
   - `/api/ccl-date/...` streaming endpoints → `server/routes/ccl-date.js` — CCL date fix progress
   - `/api/reporting-stream/...` → reporting SSE surface; keep excluded from compression
- Auth model:
   - Most SSE routes rely on the global `requireUser` middleware.
   - `ops-pulse` has an extra route-level dev-group gate on top of that.
   - `telemetry`, `messages`, `teams-notify`, `stripe`, and `health` are the notable `requireUser` bypasses; do not copy those exceptions onto new SSE routes casually.
