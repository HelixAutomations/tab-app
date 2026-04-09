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
