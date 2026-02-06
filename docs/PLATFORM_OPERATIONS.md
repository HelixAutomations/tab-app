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

## Submodule changes

Submodules are read-only here. Pending upstream changes are tracked in ROADMAP.
