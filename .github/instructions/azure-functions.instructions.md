---
applyTo: "api/src/**/*.ts,decoupled-functions/**/*.ts"
---
- Use @azure/functions v4 style with app.http and a separate typed handler.
- Always return proper CORS headers and handle OPTIONS preflight.
- Read configuration from environment variables first; fall back to Key Vault via DefaultAzureCredential.
- Parameterize SQL queries; never concatenate user input.
- Log at info/warn/error levels; never log secrets or PII.
