# Non‑billable time (Clio) report — runbook

This documents exactly how we produced the month‑to‑date non‑billable time report (per fee earner) from Clio, aligned to the in‑app “wmetrics” logic.

## What you get

A per‑fee‑earner summary for a given date range:
- Non‑billable hours + £
- Billable hours + £
- Total hours

Output options:
- Console table (default)
- CSV (`--csv`)
- JSON (`--json`)

## Where it lives

- Script: `scripts/reportNonBillableTime.mjs`
- Reference logic (for alignment): `server/routes/matter-metrics.js`

## Prereqs (what must be available)

### 1) SQL access (fee earner list)

The script reads fee earners from Core Data SQL:
- Table: `[dbo].[team]`
- Columns used: `[Full Name]`, `[Initials]`, `[Clio ID]`, `[Rate]`, `[Role]`, `[status]`

Env expectations:
- `SQL_CONNECTION_STRING` must be set **or** resolvable via Key Vault fallback.

Key Vault fallback (automatic):
- If `SQL_CONNECTION_STRING` is missing/redacted OR SQL login fails, the script builds a SQL auth connection string using:
  - `SQL_SERVER_FQDN` (default: `helix-database-server.database.windows.net`)
  - `SQL_DATABASE_NAME` (default: `helix-core-data`)
  - `SQL_USER_NAME` (default: `helix-database-server`)
  - password secret name `SQL_PASSWORD_SECRET_NAME` / `SQL_SERVER_PASSWORD_KEY` (default: `sql-databaseserver-password`)

### 2) Key Vault access (Clio secrets)

For each fee earner, Clio access is via per‑initials OAuth refresh token secrets.

The script resolves these secrets via `server/utils/getSecret` (DefaultAzureCredential):
- `{initials}-clio-v1-clientid`
- `{initials}-clio-v1-clientsecret`
- `{initials}-clio-v1-refreshtoken`

### 3) Node

Run with Node (repo uses ESM scripts).

## How to run it

From repo root:

Plan/preview (shows which fee earners will be included, and the date window):
- `node scripts/reportNonBillableTime.mjs --plan`

Month‑to‑date (default behaviour):
- `node scripts/reportNonBillableTime.mjs`

Specific month:
- `node scripts/reportNonBillableTime.mjs --month 2026-01 --csv > exports/nonbillable-2026-01.csv`

Explicit date range:
- `node scripts/reportNonBillableTime.mjs --from 2026-01-01 --to 2026-01-31 --json`

## Exactly what it does (step‑by‑step)

1) Loads environment files (best effort)
- Tries (in order):
  - `env/.env.local.user`
  - `env/.env.local`
  - `env/.env.dev.user`
  - `env/.env.dev`
  - `.env`

2) Ensures it can connect to Core Data SQL
- If `SQL_CONNECTION_STRING` is missing or contains `<REDACTED>`, it resolves credentials from Key Vault and constructs a full SQL connection string.

3) Fetches the fee earner list from SQL
- Query:
  - `SELECT [Full Name], [Initials], [Clio ID], [Rate], [Role], [status] FROM [dbo].[team] ORDER BY [Full Name]`
- Filters:
  - status must be `active`
  - rate must be > 0
  - must have `Full Name`, `Initials`, and a valid numeric `Clio ID`

4) For each fee earner, fetches their Clio activities for the window
- Clio API: `GET /api/v4/activities.json`
- Filtered by `user_id` (the fee earner’s Clio ID)
- Date parameters:
  - `created_since` = window start
  - `created_before` = window end
- Fields requested:
  - `id,date,created_at,quantity_in_hours,total,non_billable,non_billable_total,billed,on_bill`
- Paging:
  - pulls pages of 200 until complete

5) Aggregates activities using the same flags as wmetrics
- An activity is treated as **non‑billable** if `non_billable === true`.
- Non‑billable amount uses `non_billable_total` first, then falls back to `total`.
- Everything else is treated as **billable**.

6) Outputs results
- Sorted by non‑billable hours (descending)
- Output modes:
  - default: `console.table(...)`
  - `--csv`: prints CSV to stdout (recommended to redirect to `exports/`)
  - `--json`: prints structured JSON (includes failures)

7) Hardens cleanup so the script exits cleanly
- Ensures SQL pool is closed in a `finally` block.
- This prevents the “script hangs after printing” issue.

## Failure handling (what happens if something breaks)

- If a fee earner’s Clio token refresh fails or Clio errors, the script:
  - continues with the next person
  - records the failure in the `failures` list
  - prints failures at the end (or to stderr when using `--csv`)

- If Key Vault lookups hang, they time out (default 8s, controlled by `KEY_VAULT_TIMEOUT_MS`).

## Output interpretation (quick guide)

- “Non‑billable (h/£)” = time entries explicitly marked non‑billable in Clio.
- “Billable (h/£)” = everything not marked non‑billable.
- This is intentionally aligned to the in‑app matter metrics approach so totals match what we’re showing in Helix Hub.

## Notes / gotchas

- Date filtering uses Clio’s `created_since` / `created_before` parameters (i.e. based on when the activity was created, not necessarily the activity’s `date`). This matches the existing in‑app approach we aligned to.
- The fee earner inclusion list is driven entirely by SQL `dbo.team`:
  - if someone is missing/incorrect, fix their `[status]`, `[Rate]`, or `[Clio ID]`.
- No secrets/tokens are printed.
