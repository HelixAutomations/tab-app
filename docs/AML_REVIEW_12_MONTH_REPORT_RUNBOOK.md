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

---

## Follow-up script: `scripts/amlReviewFollowUp.mjs`

The main script above produces **aggregated, no-PII stats**. When follow-up questions come (e.g. "who exactly was PEP-flagged?" or "what matters relate to high-risk countries?"), use this companion script.

### What it produces (contains PII — handle appropriately)

1. **PEP-flagged client names** from both systems (IDVerifications + periodic-compliance)
2. **High-risk country clients** with names, tie types, and linked matter descriptions (where available)
3. **Methodology explanation** for external compliance reviewers
4. **Sudan vs South Sudan clarification** (SD vs SS ISO codes)

### How to run

```bash
node scripts/amlReviewFollowUp.mjs --plan                              # preview
node scripts/amlReviewFollowUp.mjs                                     # default window (last 12 months)
node scripts/amlReviewFollowUp.mjs --from 2025-02-01 --to 2026-02-01  # explicit window
```

### Data sources and linkage

The follow-up queries **with names** by joining across tables:

| What | Tables | Join |
|------|--------|------|
| PEP names (new) | `IDVerifications` ← `Instructions` | `InstructionRef` |
| PEP names (legacy) | `periodic-compliance` ← `poid` | `ACID` |
| High-risk country clients | `poid` (Core Data) | `nationality_iso`, `country_code`, `company_country_code` |
| Matter descriptions | Via Clio API | Search by name/email, then `client_id` filter |

### Clio lookup for matter descriptions

The script gives you client names and tie types, but **matter descriptions** require a Clio API lookup. This was done manually in Feb 2026 using a temp script pattern:

1. Get POID emails: query `poid` table for `email` field filtered by high-risk country codes
2. Search Clio contacts: `GET /contacts.json?query={name}` (fall back to email if name not found)
3. Get matters: `GET /matters.json?client_id={contactId}` — use `client_id` not `contact_id`
4. For contacts found but with no matters as client, check `GET /relationships.json?contact_id={id}` (catches joint clients / related parties)

**Gotcha**: `contact_id` on `/matters.json` returns ALL matters visible to that contact (i.e. the firm's entire list). Always use `client_id` to get only matters where that person is the actual client.

### Headline count reconciliation

The original report counts **ties** (country appearances), not unique clients. One client can produce multiple ties:
- e.g. Afghan nationality + Afghan address = 2 ties but 1 unique client
- The follow-up script deduplicates to unique clients per country

### Known gaps (Feb 2026)

- **Alghunaim** and **Adjakotan** were not found in Clio — enquiry-only, never formally instructed.
- **Noorzai × 2** — contacts exist but no matters as direct client; found via `/relationships.json` as joint clients on NOORZ10359-00001.
- **Sergei Ismatov** — no matters as client; found via `/relationships.json` as related party on ISMAT10785-00001 (Irina Ismatova's matter).
- **Luke Johnson** — common name; POID email linked to company "The British Engineerium Trust Ltd" which had the actual matter.

### Annual recurrence

Kanchel flagged this is an **annual requirement** for the SRA AML Firm-Wide Risk Assessment. Emma Mason (external) reviews. Consider building a single combined script or Hub UI panel for future years to avoid ad-hoc work.

