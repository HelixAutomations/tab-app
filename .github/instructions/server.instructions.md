---
applyTo: "server/**"
---

# Server Rules (auto-attached)

## Telemetry (non-negotiable)
Every server-side process must emit Application Insights telemetry:
- `trackEvent('Component.Entity.Started', { operation, triggeredBy })` on start
- `trackEvent('Component.Entity.Completed', { operation, durationMs })` on success
- `trackException(error, { operation, phase })` + `trackEvent('...Failed', ...)` on failure
- `trackMetric('Component.Entity.Duration', durationMs)` for anything worth graphing

Import from `../utils/appInsights`.

## SQL safety
- Always use parameterised queries (`pool.request().input('name', sql.NVarChar, value).query(...)`).
- Never concatenate user input into SQL strings.
- Use `const pool = await sql.connect(process.env.SQL_CONNECTION_STRING)` for Core Data, `INSTRUCTIONS_SQL_CONNECTION_STRING` for Instructions DB.

## Error handling
- Every Express route must have a try/catch that calls `trackException` and returns a proper status code.
- Never swallow errors silently — at minimum log + track.

## Environment
- Secrets come from env vars or Key Vault (`DefaultAzureCredential`). Never hardcode.
- CORS headers and OPTIONS preflight must be handled when adding new API routes.

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
