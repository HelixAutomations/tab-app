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
