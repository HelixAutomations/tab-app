# Email Reference

Consolidates: EMAIL_SYSTEM_QUICK_REFERENCE, EMAIL_V2_INTEGRATION_GUIDE.

## Email V2 overview

- Single API entrypoint: `POST /api/sendEmail`.
- Graph API is the primary sender.
- Supports attachments and HTML templates.

## Required payload (summary)

- `toRecipients`: list of recipients.
- `subject`: email subject.
- `body`: HTML or text content.
- Optional: CC/BCC support where implemented.

## Deal capture emails

- Must include `lz@helix-law.com`.

## Environment flags

- Feature flags for Email V2 are configured via env (see `.env.email-v2`).
- Use Key Vault or App Service config for secrets in production.

## Failure handling

- Return structured errors from `/api/sendEmail`.
- Log Graph API failures with safe metadata only.

## Templates and rendering

- Keep HTML templates in server-side helpers.
- Ensure all PII is masked in logs.

## Notes

- Ensure any future integration keeps `/api/sendEmail` as the unified entrypoint.
- Update tests or fixtures if template fields change.
