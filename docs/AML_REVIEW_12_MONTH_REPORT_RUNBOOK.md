# AML review (last 12 months) report — runbook

This documents exactly how we produced the AML review stats report (last 12 months) with:
- non‑UK “international ties” list
- PEP warning counts
- coverage-by-month to show gaps during the legacy→new transition

## What you get

A pasteable, no‑PII text report printed to stdout:
- Reporting window (“as at” + date range)
- Non‑UK countries + counts (combined + broken down)
- PEP warning counts (new + legacy) + raw breakdown
- Monthly coverage counts (to show patchiness)

## Where it lives

- Script: `scripts/amlReview12Months.mjs`

## Prereqs

### 1) SQL access (two databases)

The script queries **two** SQL databases:

**Core Data DB (legacy)**
- Connection: `SQL_CONNECTION_STRING` (or Key Vault fallback)
- Tables used:
  - `[dbo].[poid]`
  - `[dbo].[periodic-compliance]`

**Instructions DB (new space)**
- Connection: `INSTRUCTIONS_SQL_CONNECTION_STRING` (or Key Vault fallback)
- Table used:
  - `[dbo].[IDVerifications]`

### 2) Key Vault access (automatic fallback)

If the SQL connection strings are missing/redacted/stale, the script uses the same fast Key Vault fallback pattern as `tools/instant-lookup.mjs` via `server/utils/getSecret`.

Defaults used for fallback (unless overridden by env vars):

Core Data SQL:
- server: `helix-database-server.database.windows.net`
- db: `helix-core-data`
- user: `helix-database-server`
- password secret: `sql-databaseserver-password`

Instructions SQL:
- server: `instructions.database.windows.net`
- db: `instructions`
- user: `instructionsadmin`
- password secret: `instructions-sql-password`

Key Vault lookups time out quickly (4s) so the script fails fast rather than hanging.

## How to run it

From repo root:

Preview mode (shows what it will query + the window):
- `node scripts/amlReview12Months.mjs --plan`

Run with default window:
- `node scripts/amlReview12Months.mjs`

Run with explicit window:
- `node scripts/amlReview12Months.mjs --from 2025-02-01 --to 2026-02-01`

## Default date window (important)

Default behaviour is **last 12 full calendar months**, ending at the **start of next month** (UTC).

Example (as at 29/01/2026):
- Window: 01/02/2025 → 01/02/2026 (end exclusive)

This avoids date drift around month ends (e.g. 29th/30th/31st) and makes “last 12 months” stable.

## Exactly what it does

### Step 1) Loads env files (best effort)

It tries, in order:
- `env/.env.local.user`
- `env/.env.local`
- `env/.env.dev.user`
- `env/.env.dev`
- `.env`

### Step 2) Queries Core Data (legacy)

1) **International ties** source: `[dbo].[poid]`

Query (date filtered by `submission_date`):
- selects: `submission_date`, `country/country_code`, `nationality/nationality_iso`, `company_country/company_country_code`

Interpretation:
- “International tie” means a non‑UK country appearing in any of:
  - client address country
  - client nationality
  - company country

UK detection is intentionally a bit forgiving:
- `GB` / `UK`
- “United Kingdom”, “Great Britain”, and the home nations

2) **Legacy PEP** source: `[dbo].[periodic-compliance]`

Query (date filtered by `[Compliance Date]`):
- selects: `[PEP and Sanctions Check Result]`

### Step 3) Queries Instructions DB (new space)

**New PEP** source: `[dbo].[IDVerifications]`

Query (date filtered by `EIDCheckedDate`):
- selects: `PEPAndSanctionsCheckResult`

### Step 4) Classifies PEP results

The report produces:
- total checks
- flagged/warning count
- “passed/clear” count
- unknown/pending count
- raw breakdown list (so we can sanity-check the classification)

Classification rule (conservative):
- treat as **clear** if value is `pass/passed/clear/cleared/ok/false/no/none/0`
- treat as **unknown** if `pending/unknown/n/a/na`
- everything else is treated as **flagged/warning** (e.g. `review`)

### Step 5) Produces coverage-by-month

For each month in the window, it prints row counts for:
- POID rows
- IDVerifications rows
- periodic-compliance rows

This is there specifically to make the “transition gap” obvious (e.g. new space checks starting later).

## Notes / caveats (data quality)

- This is not a single source of truth — it’s a best-effort consolidation over a migration period.
- Some checks won’t exist in one system or the other depending on when the workflow changed.
- The monthly coverage section is the “proof” of where the gaps are.

## Safety

- No PII is printed (no names/emails/IDs); only aggregated counts and country names/codes.
