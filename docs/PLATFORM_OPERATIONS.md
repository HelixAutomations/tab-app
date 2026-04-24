# Platform Operations Reference

Consolidates: ENV_SETUP_README, LOCAL_DEVELOPMENT_SETUP, DEPLOYMENT_CHECKLIST, SECURITY_FIX_CHECKLIST, REDIS_SECURITY_SETUP, LOGGING_ARCHITECTURE, SERVER_ROUTE_REGISTRATION_GUIDE, USER_SESSION_LOGGING, MAINTENANCE_GUIDELINES, AGENT_ONBOARDING_GUIDE.

## Quick start

```bash
npm install
cp .env.example .env
# Set REACT_APP_USE_LOCAL_DATA=false for production data access
npm run dev:all
```

## Environment essentials

- `REACT_APP_USE_LOCAL_DATA=false` to use production instruction data.
- `INSTRUCTIONS_FUNC_CODE` and `INSTRUCTIONS_FUNC_BASE_URL` for VNet function access.
- `KEY_VAULT_URL` + `USE_LOCAL_SECRETS=false` to use Key Vault.
- `SQL_CONNECTION_STRING` only for VNet functions (not local dev).

## Services and ports

- React dev server: 3000
- Express server: 8080 (single entrypoint for frontend)
- Decoupled Functions: 7071
- API Functions: 7072
- Azurite: 10000–10002

## Server route registration

- **Main server file:** `server/index.js`
- Add new routes to `server/routes/*` and register with `app.use('/api', router)`.
- Restart Express after adding routes.

## Logging standards (house style)

- Prefer structured logs with domain prefixes (DB, Cache, Clio, Auth, Enquiries, Matters, Payments).
- Log **errors/warnings/critical business events** only.
- Mask PII in logs (emails, tokens, names).
- Use operation names like `enquiry:claim`, `matter:open`.

## User session logging

Middleware attaches `req.user` and `req.requestId`, logs:
- Request initiation with user context
- Response timing
- Slow requests (>3s)

When adding route logs, include `req.requestId` and user initials.

## Security and secrets

- Use Key Vault references in app settings.
- Rotate any exposed passwords immediately.
- Run Key Vault setup script when rotating passwords:
  - `tools/setup-keyvault-secrets.ps1`

## Redis security

- Prefer Entra ID auth (managed identity) for Redis.
- Fall back to access keys only if necessary.

## Teams mobile ECONNRESET deployment (config)

App Service settings (production baseline):
- `SQL_MAX_CONCURRENT_REQUESTS=25`
- `SQL_POOL_MAX=25`
- `SQL_POOL_MIN=2`
- `SQL_REQUEST_TIMEOUT_MS=60000`
- `SQL_CONNECTION_TIMEOUT_MS=15000`
- `SQL_POOL_ACQUIRE_TIMEOUT_MS=10000`
- `SQL_POOL_IDLE_TIMEOUT_MS=30000`
- `SQL_QUEUE_TIMEOUT_MS=30000`
- `SQL_HEALTH_CHECK_INTERVAL_MS=120000`

## Product guardrails (do not break)

- Luke Test: `HLX-27367-94842` must never be deleted.
- ID pills must call `onEIDClick()` (no detail expansion).
- Risk colour must use `RiskAssessmentResult`, not `TransactionRiskLevel`.
- Deal capture emails must go to both `lz@helix-law.com` and `cb@helix-law.com`.

## CCL autopilot chain — KQL runbook

The CCL backend chain emits one rollup event per `/api/ccl/service/run` that reaches the background stage. Use these queries to monitor prod health without reading raw event streams.

**Event shape** (`CCL.AutopilotChain.Completed`):
- `matterId`, `triggeredBy`, `chainDurationMs`, `confidence`, `unresolvedCount`
- `persistStage` — always `succeeded` if event fired (fails short-circuit upstream and emit `CCL.Service.Run.Failed` instead)
- `ndStage` — `succeeded` | `skipped` | `failed`; `ndReason` explains skips/failures (`flag-disabled`, `unresolved-placeholders`, `unknown-failure`, etc.)
- `ndDocumentId` — populated when upload succeeded
- `notifyStage` — `succeeded` | `skipped` | `failed`; `notifyReason` explains skips (`flag-disabled`, `fallback-confidence`, `unresolved-placeholders`)
- `allGreen` — `true` when persist succeeded AND every enabled stage reached a terminal non-failed state

### Chain success rate over 24h

```kql
customEvents
| where timestamp > ago(24h)
| where name == "CCL.AutopilotChain.Completed"
| extend allGreen = tobool(tostring(customDimensions.allGreen))
| summarize total = count(), green = countif(allGreen == true) by bin(timestamp, 1h)
| extend successRate = round(100.0 * green / total, 1)
| order by timestamp desc
```

### Per-stage outcome breakdown (last 7 days)

```kql
customEvents
| where timestamp > ago(7d)
| where name == "CCL.AutopilotChain.Completed"
| extend ndStage = tostring(customDimensions.ndStage),
         notifyStage = tostring(customDimensions.notifyStage)
| summarize chains = count() by ndStage, notifyStage
| order by chains desc
```

### Failure drill-down — most recent failed stage

```kql
customEvents
| where timestamp > ago(24h)
| where name == "CCL.AutopilotChain.Completed"
| extend ndStage = tostring(customDimensions.ndStage),
         notifyStage = tostring(customDimensions.notifyStage),
         ndReason = tostring(customDimensions.ndReason),
         notifyReason = tostring(customDimensions.notifyReason),
         matterId = tostring(customDimensions.matterId),
         confidence = tostring(customDimensions.confidence)
| where ndStage == "failed" or notifyStage == "failed"
| project timestamp, matterId, confidence, ndStage, ndReason, notifyStage, notifyReason
| order by timestamp desc
| take 50
```

### Chain latency distribution

```kql
customEvents
| where timestamp > ago(24h)
| where name == "CCL.AutopilotChain.Completed"
| extend chainDurationMs = toint(tostring(customDimensions.chainDurationMs))
| summarize p50 = percentile(chainDurationMs, 50),
            p90 = percentile(chainDurationMs, 90),
            p99 = percentile(chainDurationMs, 99),
            max = max(chainDurationMs)
            by bin(timestamp, 1h)
| order by timestamp desc
```

### Drop-off — chain started but never completed

`CCL.AutopilotChain.Started` fires synchronously inside the route; `Completed` fires after ND+notify resolve. A gap implies the Node process crashed mid-chain.

```kql
let started = customEvents
    | where timestamp > ago(24h)
    | where name == "CCL.AutopilotChain.Started"
    | extend matterId = tostring(customDimensions.matterId);
let completed = customEvents
    | where timestamp > ago(24h)
    | where name == "CCL.AutopilotChain.Completed"
    | extend matterId = tostring(customDimensions.matterId);
started
| join kind=leftanti completed on matterId
| project timestamp, matterId, triggeredBy = tostring(customDimensions.triggeredBy)
| order by timestamp desc
```

### Alerting thresholds (suggested)

- **Chain success rate < 90% over 1h** → warning (some legitimate skips expected when flags are off)
- ~~`ndStage == "failed"` rate~~ obsolete since 2026-04-24: ND upload is solicitor-initiated (no silent chain). Watch `CCL.Upload.ND.Failed` on the explicit POST `/api/ccl-ops/upload-nd` instead; >5% over 1h → page on-call.
- **Drop-off query returns > 0 rows** → investigate (process crash or hang)

## Submodule changes

Submodules are read-only here. Pending upstream changes are tracked in ROADMAP.
