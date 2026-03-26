# Integrations Reference

Consolidates: clio-contact-sync, token-refresh, tiller-integration, FACEBOOK_MARKETING_INTEGRATION, GOOGLE_ADS_SETUP, FIX_REPORTING_CLIO_TOKEN_EXPIRED.

## Clio contact sync

- Sync flow updates contacts between Hub and Clio.
- Prefer least-privilege access and token refresh patterns.

## Clio token refresh

- If reporting tokens expire, re-auth and update the Key Vault secret used by the reporting integration.
- Track this task in ROADMAP for ops execution.

## Tiller integration

- Payment capture integration; ensure proper status mapping and error logging.
- Use safe defaults and preserve payment audit trails.

## Marketing integrations

- Facebook and Google Ads integrations are configured via dedicated setup docs.
- Keep credentials in Key Vault or App Service configuration only.

## Guardrails

- Never log tokens or PII.
- Rotate secrets on exposure.
- Prefer managed identity where available.

## Asana integration

Hub connects to Asana for operations task tracking. Two distinct integration points exist:

### 1. Accounts project (Operations Queue)

- **Purpose**: Cross-reference financial transaction requests with Asana task lifecycle
- **Auth**: `server/utils/asana.js` — shared credential resolution (env `ASANA_ACCESS_TOKEN` → per-user OAuth refresh from `team` table)
- **Server route**: `GET /api/ops-queue/asana-account-tasks` → fetches sections + incomplete tasks from Asana project `1203336124217593`
- **Caching**: 5-min server-side in-memory cache (Asana API is 1.5–3s per call)
- **Client**: `OperationsQueue.tsx` shows pipeline section counts + Asana stage labels on matching transaction rows
- **Workspace GID**: `1203336123398249`

### 2. Tech tickets (Tech board)

- **Purpose**: Create and track tech support tickets in Asana
- **Auth**: PAT-based via `server/routes/techTickets.js`
- **Separate from accounts integration** — different project, different auth pattern

### Auth patterns

| Pattern | When to use | File |
|---------|-------------|------|
| Shared env token | Dev/staging (set `ASANA_ACCESS_TOKEN` in .env) | `server/utils/asana.js` |
| Per-user OAuth refresh | Production (credentials stored in `team` table: `asana_client_id`, `asana_client_secret`, `asana_refresh_token`) | `server/utils/asana.js` |
| Personal Access Token | Tech tickets only | `server/routes/techTickets.js` |

**Note**: Asana refresh tokens are single-use. Each successful token exchange returns a new refresh token that invalidates the previous one. The `resolveAsanaAccessToken` flow handles this automatically.
