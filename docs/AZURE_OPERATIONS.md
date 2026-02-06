# Azure Operations Reference

Consolidates: AZURE_CONFIG_REFERENCE, AZURE_CREDENTIALS_MAPPING, AZURE_SECURITY_BRIEF, INSTRUCTIONS_VNET (Azure portions).

## Key Vault and secrets

- Store secrets in Key Vault and reference via App Service settings.
- Use managed identity for App Service and Functions.
- Avoid local secrets in production.

## App registrations (summary)

- Use dedicated app registrations for Graph and other integrations.
- Apply least-privilege permissions and audit regularly.

## VNet Functions

- Production SQL access requires VNet-enabled Functions.
- Local dev should call VNet Functions via Express proxy.

## Teams mobile ECONNRESET tuning

Baseline App Service settings:
- `SQL_MAX_CONCURRENT_REQUESTS=25`
- `SQL_POOL_MAX=25`
- `SQL_POOL_MIN=2`
- `SQL_REQUEST_TIMEOUT_MS=60000`
- `SQL_CONNECTION_TIMEOUT_MS=15000`
- `SQL_POOL_ACQUIRE_TIMEOUT_MS=10000`
- `SQL_POOL_IDLE_TIMEOUT_MS=30000`
- `SQL_QUEUE_TIMEOUT_MS=30000`
- `SQL_HEALTH_CHECK_INTERVAL_MS=120000`

## Security notes

- Rotate passwords on exposure.
- Restrict Key Vault secret access to managed identities only.
- Prefer Entra ID auth for Redis where supported.
