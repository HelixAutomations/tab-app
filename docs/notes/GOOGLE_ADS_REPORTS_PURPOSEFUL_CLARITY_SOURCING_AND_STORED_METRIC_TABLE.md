# Google Ads Reports — purposeful clarity, sourcing, and stored metric table

> **Purpose of this document.** Self-contained brief any future agent can pick up cold and execute without prior context. Every relevant file path, line, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-30 against branch `main`. Re-verify file/line refs if reading more than 30 days later.

---

## 1. Why this exists (user intent)

Direct quote (2026-04-30): *"google ads we must resolve and get some more thoughtful and purposeful clarity around whats shown and how its sourced and maybe we write some of that info into a table etc. scope this out."*

Context: the Reports tab currently exposes Google Ads data through three half-baked surfaces (PPC report, SEO report, Enquiries report), each pulling live from `/api/marketing-metrics/google-ads` with no caching, no shared schema, and no clear answer to "what are we actually trying to measure?". Meta has just been turned off entirely (see [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) `AVAILABLE_REPORTS`); Google Ads is the next dev-preview surface to either resolve or retire.

The user is **not** asking us to ship a new Google Ads report today. The ask is: define what Google Ads insight is actually worth surfacing, where it should come from (live API vs. stored daily metric table), and produce a stored-table design we can act on.

---

## 2. Current state — verified findings

### 2.1 Server route

- File: [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js)
  - `router.get('/google-ads')` at L704 — OAuth refresh-token flow against Google Ads REST `googleAds:search`. Returns daily aggregated metrics: `impressions`, `clicks`, `cost` (GBP), `conversions`, derived `ctr`/`cpc`/`cpa`. Pulls a single `customer` row, no segmentation by campaign / ad group / keyword / landing page.
  - GAQL query (L835–L846): `segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date BETWEEN <start> AND <end>`.
  - Credentials: `GOOGLE_ADS_*` env vars or matching Key Vault secrets via `getSecretFromAnySource`. `loginCustomerId` is the manager account, `customerId` is the target.
  - Now bounded (this session, see changelog 2026-04-30 marketing-metrics aggregator entry): OAuth `getAccessToken()` capped at 5s, GAQL search capped at 15s. So a stalled upstream returns 504 or empty fast.
  - **No caching. No persistence. Every consumer call refetches.**

### 2.2 Client consumers

- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) L1750 `fetchGoogleAdsData(months)` — fetches `?startDate=&endDate=`, returns `GoogleAdsData[]` (interface at L597). Cached in `cachedData.googleAds` and `datasetData.googleAds`.
- [src/tabs/Reporting/PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) — receives `cachedGoogleAdsData` prop. `GoogleAdsData` interface duplicated (L98). Adds local fetch of `/api/reporting-stream?dataset=metaMetrics` (L627) for "meta enquiries" — currently dead path now that Meta is off.
- [src/tabs/Reporting/SeoReport.tsx](../../src/tabs/Reporting/SeoReport.tsx) — receives `cachedGa4Data` only; Google Ads is in its `requiredDatasets` (see [ReportingHome](../../src/tabs/Reporting/ReportingHome.tsx) `AVAILABLE_REPORTS` `seo` entry) but the report itself doesn't render any Google Ads data (TODO comments at the call site, around the SEO render block).
- Enquiries report — `googleAds` is **not** in `ENQUIRIES_REPORT_DATASETS`. So in practice Enquiries does not consume Google Ads data today.

### 2.3 Tile / nav status

- AVAILABLE_REPORTS: `seo` and `ppc` are both `tier: 'devPreview'` and `disabled: true`. Visible only to LZ/AC, both non-clickable.
- REPORT_NAV_TABS: `ppcReport` and `seoReport` rendered as `draft: true` (visually muted but clickable) for dev preview audience.

### 2.4 Storage today

- No `marketing_*` tables in either Core Data DB or Instructions DB. Confirmed by absence of any `INSERT INTO marketing` or `FROM google_ads` references across [server/](../../server) and [scripts/](../../scripts).
- Redis only — see `redisClient.cacheWrapper` usage in `marketing-metrics.js` L120 (Facebook aggregator). The `/google-ads` sub-route does **not** cache to Redis.

### 2.5 Current cost of leaving it like this

- Every Reports cold load for LZ/AC pays a Google OAuth refresh + Google Ads GAQL round-trip (now bounded to 20s worst case but typically 1.5–3s).
- Zero historical data: if Google rate-limits or rotates credentials, all trend visibility evaporates immediately. No way to spot a week-on-week regression without the live API.
- No source-of-truth: each report defines its own schema (see duplicated `GoogleAdsData` interface in PpcReport vs ReportingHome).

---

## 3. Plan

### Phase A — Define purpose & retire dead surfaces

Decide what Google Ads insight matters to the firm before writing a single new line of fetch code. Recommended scope for Phase A (the user can override any of these in §6):

1. **Single question we want to answer:** *"Is our Google Ads spend producing qualified enquiries that turn into instructions, and how is that trending week-on-week?"*
2. **Two views worth keeping:**
   - **Spend → enquiry → instruction funnel** (last 12 weeks) — joins Google Ads `cost` + `clicks` against `enquiries` (where `Source` ≈ Google Ads / paid search) and `Instructions` (downstream conversion). One chart, one table.
   - **Daily metric table** — raw stored daily metrics for ad-hoc lookup and auditability. No charting layer; just a dense table behind a date filter.
3. **Retire SEO report from the nav** — it never used Google Ads data, and the GA4 layer is better surfaced inside the Enquiries report's source breakdown. Move it from `tier: 'devPreview'` to a hidden dev-only state OR delete the route entirely. Decision in §6.
4. **Reshape PPC report into the funnel view** above. Drop the Meta-enquiries side fetch (dead since Meta off).

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Lock the "one question" above into the brief and confirm with user | this doc | gates everything else |
| A2 | Drop the now-dead `/api/reporting-stream?dataset=metaMetrics` fetch in PPC report | [src/tabs/Reporting/PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) L619–L660 | Meta is off; remove `metaEnquiries` state and effect |
| A3 | Decide SEO report's fate (hide / delete / keep) | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) AVAILABLE_REPORTS + REPORT_NAV_TABS | see §6 |
| A4 | Consolidate the duplicated `GoogleAdsData` interface | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) L597 + [PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) L98 | export from a shared `types/marketing.ts` |

**Phase A acceptance:**
- One report (PPC, renamed if helpful) is the single Google Ads surface; SEO report's status is decided.
- No dead Meta references in the marketing reports.
- One canonical `GoogleAdsData` type.

### Phase B — Stored daily-metric table (the "table" the user asked about)

Persist one row per day per `customerId` so every Reports load reads from SQL, not Google. Live API fetch becomes a backfill / nightly sync job, not a per-page-load dependency.

#### B1. Schema (Core Data DB)

```sql
CREATE TABLE marketing_google_ads_daily (
  metric_date         DATE          NOT NULL,
  customer_id         VARCHAR(20)   NOT NULL,   -- e.g. '1234567890' (no dashes)
  account_label       VARCHAR(100)  NULL,       -- human-readable, populated from a small lookup
  impressions         BIGINT        NOT NULL DEFAULT 0,
  clicks              BIGINT        NOT NULL DEFAULT 0,
  cost_micros         BIGINT        NOT NULL DEFAULT 0,  -- store raw, derive GBP at read time
  cost_gbp            DECIMAL(12,2) NOT NULL DEFAULT 0,  -- denorm for fast charting
  conversions         DECIMAL(12,2) NOT NULL DEFAULT 0,
  ctr_pct             DECIMAL(8,4)  NOT NULL DEFAULT 0,
  cpc_gbp             DECIMAL(10,4) NOT NULL DEFAULT 0,
  cpa_gbp             DECIMAL(10,4) NOT NULL DEFAULT 0,
  source              VARCHAR(20)   NOT NULL DEFAULT 'google_ads_api',
  source_query_hash   CHAR(40)      NULL,       -- SHA1 of GAQL used; lets us detect schema drift
  fetched_at          DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  refreshed_at        DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk_marketing_google_ads_daily PRIMARY KEY (metric_date, customer_id)
);

CREATE INDEX ix_marketing_google_ads_daily_date ON marketing_google_ads_daily (metric_date DESC);
```

Notes on the schema choice:
- `cost_micros` stored raw + `cost_gbp` denormalised. Denorm makes charting one-shot; raw lets us re-derive if FX or rounding ever changes.
- `source` + `source_query_hash` lets a future agent answer "where did this row come from" without inspecting code archaeology — addresses the user's "more thoughtful and purposeful clarity around how it's sourced".
- `account_label` populated from a tiny `marketing_google_ads_accounts` lookup (`customer_id`, `label`, `is_primary`, `notes`) — keeps the human label out of the per-day row but still queryable in one join.

#### B2. Sync job

- **Where:** new `server/jobs/syncGoogleAdsDaily.js`, registered in [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) on the existing scheduler.
- **Frequency:** once per day at 03:00 Europe/London. Backfills the last 7 days each run (Google Ads metrics for "yesterday" can move for ~72 hours as conversions attribute).
- **Telemetry (mandatory per `.github/copilot-instructions.md` §App Insights):** emit `Marketing.GoogleAds.DailySync.Started/Completed/Failed` events with `customerId`, `dateRange`, `rowsUpserted`, `durationMs`, plus `trackException` on failure.
- **Upsert pattern:** `MERGE` on `(metric_date, customer_id)`. Update `refreshed_at` on every touch; `fetched_at` only on first insert.

#### B3. Read API

- Replace `router.get('/google-ads')` body with: read from `marketing_google_ads_daily` for the requested date range. If a requested day is missing AND `?live=true`, fall back to the existing GAQL fetch and persist on the way out.
- Default behaviour is **table-only**, so the Reports tab cold load never touches Google.

#### B4. Client wiring

- `fetchGoogleAdsData` in [ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) L1750 unchanged in shape; it just gets faster and offline-resilient.
- `cachedData.googleAds` strategy can drop the 30-min Redis TTL gate — the source of truth is now SQL.

---

## 4. Step-by-step execution order

1. **A1** — confirm the "one question" + funnel decision with the user. Gate Phase B on this.
2. **A2** — strip dead Meta fetch from PPC report.
3. **A3** — execute SEO retirement decision (hide or delete).
4. **A4** — extract `GoogleAdsData` to a shared types module.
5. **B1** — DDL deployed to Core Data DB (manual via SSMS or `scripts/migrations/`).
6. **B2** — sync job + scheduler registration + telemetry.
7. **B3** — server route swap with `?live=true` fallback for safety.
8. **B4** — client unchanged in shape; verify cold-load timings drop.

---

## 5. Verification checklist

**Phase A:**
- [ ] PPC report renders without any Meta references; no console errors.
- [ ] SEO report status decided and reflected in `AVAILABLE_REPORTS` + `REPORT_NAV_TABS`.
- [ ] `grep -r "GoogleAdsData" src/` returns one definition site.

**Phase B:**
- [ ] `SELECT TOP 30 * FROM marketing_google_ads_daily ORDER BY metric_date DESC` returns continuous days, no gaps.
- [ ] App Insights events: `Marketing.GoogleAds.DailySync.Started/Completed/Failed` visible.
- [ ] `GET /api/marketing-metrics/google-ads?startDate=...&endDate=...` responds in <300ms (table read) vs current 1.5–3s (live API).
- [ ] Pulling the network cable from the App Service → endpoint still returns historical rows.

---

## 6. Open decisions (defaults proposed)

1. **Funnel data source for "qualified enquiry" attribution** — Default: **`enquiries.Source = 'Google Ads'` joined to `Instructions.InstructionRef`**. Rationale: matches existing source taxonomy in `getNormalizedEnquirySource`. Alternative: ingest GA4 `sessionDefaultChannelGroup = 'Paid Search'` per-day totals into a sibling table; richer but doubles the integration surface.
2. **SEO report fate** — Default: **hide from nav, keep file for now** (re-evaluate once Google Ads is live). Rationale: SEO/GA4 may be the next surface to resolve and the component scaffolding is non-trivial. Alternative: delete entirely if there's no appetite for an SEO report this quarter.
3. **Customer-account scope** — Default: **single primary `GOOGLE_ADS_CUSTOMER_ID`**. Rationale: matches today's behaviour. Alternative: support multiple accounts via the lookup table from day one (small extra cost, future-proofs).
4. **Conversion definition for `cpa_gbp`** — Default: **`metrics.conversions` as Google Ads reports it**. Rationale: trust the platform. Alternative: redefine as `cost / count(distinct enquiries.ID where Source=Google Ads)` to align with our own funnel — more honest but couples the daily sync to the enquiries table.

---

## 7. Out of scope

- Campaign / ad-group / keyword breakdowns. (Possible Phase C; needs a separate `marketing_google_ads_daily_campaign` table.)
- Bid management / budget alerts.
- GA4 storage (separate brief if/when SEO report is resolved).
- Meta ads (turned off this session; not coming back without an explicit user request).
- Microsoft Ads / Bing.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) — reports surface, `AVAILABLE_REPORTS`, `REPORT_NAV_TABS`, `fetchGoogleAdsData`, `GoogleAdsData` interface
- [src/tabs/Reporting/PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) — current Google Ads consumer; Phase A2 + Phase B4
- [src/tabs/Reporting/SeoReport.tsx](../../src/tabs/Reporting/SeoReport.tsx) — current GA4 consumer; Phase A3 decision
- `src/tabs/Reporting/types/marketing.ts` (NEW, Phase A4) — shared types

Server:
- [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) — `/google-ads` route at L704; Phase B3 swaps body to SQL-first
- `server/jobs/syncGoogleAdsDaily.js` (NEW, Phase B2)
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) — register the new job (Phase B2)
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — telemetry helpers (existing)

Scripts / docs:
- `scripts/migrations/2026-XX-XX-marketing-google-ads-daily.sql` (NEW, Phase B1) — DDL above
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — append `marketing_google_ads_daily` row when B1 ships

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
verified: 2026-04-30
branch: main
touches:
  client:
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/PpcReport.tsx
    - src/tabs/Reporting/SeoReport.tsx
  server:
    - server/routes/marketing-metrics.js
    - server/utils/dataOperationsScheduler.js
  submodules: []
depends_on: []
coordinates_with:
  - hub-rollout-training-and-confidence-recovery   # both edit ReportingHome.tsx
  - management-dashboard-trust-gate                # same
conflicts_with: []
```

---
