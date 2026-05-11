# PPC report — does paid acquisition actually pay

> **Purpose of this document.** Self-contained brief. A future agent (or LZ on a different day) can pick this up cold and execute without prior context.
>
> **How to use it.** Read once. Ship Phase A. Phase B onwards only after A lands. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-01 against branch `main`. Re-verify file/line refs if reading >30 days later.

---

## 1. Why this exists (user intent)

User, verbatim:

> *"consider the purpose of a ppc report and what we have. the gap is massive. consider yourself the expert we hired and paid 15x the industry standard for quality work. this doesnt mean complicated work, it means bang on what we need work. you know our brand and understand how to translate design in code to results. scope an implementation to actually stand up a ppc report that lands."*

A PPC report at Helix has **one job**: answer, on demand, *"for every £ we spent on Google Ads, how many enquiries, how many instructions, and how much fee revenue did it produce — and is that getting better or worse?"* Everything else is decoration.

The current `PpcReport.tsx` surface renders Google Ads daily metric rows next to a list of PPC-attributed matters and a revenue total. That is **operationally interesting and strategically silent.** It does not give LZ a verdict, does not show payback, does not show trend, does not separate spend that worked from spend that didn't.

This brief is a **scope, not an implementation.** Output: a focused, brand-correct, server-backed report that pays for the cost of building it within one quarter of LZ trusting it.

What the user is **not** asking for: a marketing analytics dashboard, campaign/keyword drilldown, a bid management tool, or anything Meta/Bing/SEO related.

---

## 2. Current state — verified findings

### 2.1 Existing PPC surface

- File: [src/tabs/Reporting/PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) — renders day-grouped Google Ads rows (`impressions`, `clicks`, `cost`, `conversions`, `ctr`, `cpc`, `cpa`) and an income panel sourced from `ppcIncomeMetrics` passed down from `ReportingHome`. After the recent Phase A2 strip, no Meta overlay remains; refresh button is wired to real `triggerRefresh`.
- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx)
  - `fetchGoogleAdsData` (~L1750): hits `/api/marketing-metrics/google-ads`, unwraps the envelope to a `GoogleAdsData[]` array.
  - `ppcIncomeMetrics` useMemo (~L1998–L2242): computes the PPC funnel **client-side** by joining `datasetData.enquiries` (filtered with `getNormalizedEnquirySource` + `isPpcSourceLabel`) → `datasetData.allMatters` (matched via `extractMatterIdentifiers`) → `datasetData.recoveredFees` (7d/30d/all-time revenue). Surfaces matched/unmatched lists and a debug breakdown.
  - `refreshGoogleAdsOnly` (~L3399): re-runs the Google Ads fetch only.
  - `renderAvailableReportCards` (~L4594): card grid; PPC card is locally exempt from the grey-out wrapper and rendered with an orange dotted border + DEV badge in dev only. Prod gating: `tier: 'devPreview'`.

### 2.2 Server route

- File: [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) — `/google-ads` route at L704. Returns `{ success, data: [{ date, googleAds: { impressions, clicks, cost, conversions, ctr, cpc, cpa } }], dateRange, source }`. Cost in GBP. Hardened with `withTimeout`/`raceTimeout`. **Live only in prod** (Google Ads env config absent locally).

### 2.3 Upstream brief this depends on

- File: [docs/notes/GOOGLE_ADS_REPORTS_PURPOSEFUL_CLARITY_SOURCING_AND_STORED_METRIC_TABLE.md](./GOOGLE_ADS_REPORTS_PURPOSEFUL_CLARITY_SOURCING_AND_STORED_METRIC_TABLE.md) — Phase A retires dead Meta/SEO surfaces (A2 done); Phase B introduces `marketing_google_ads_daily` SQL table + nightly sync at 03:00 Europe/London with `Marketing.GoogleAds.DailySync.*` telemetry. **This brief assumes Phase B of that brief is in place** before Phase B of *this* brief begins.

### 2.4 The actual gap

| Question LZ would ask | Current answer | Required answer |
|---|---|---|
| Is this week's spend producing more or fewer instructions than the 4-week median? | Not visible | Verdict tile: green / amber / red |
| What did one instruction cost us last week? | Not computed | CPI (Cost Per Instruction), weekly |
| What did one *qualified* enquiry cost us? | Not computed | CPL (Cost Per qualified Lead), weekly |
| How long until paid spend pays itself back? | Not visible | Payback window: revenue collected within 30/90 days vs spend in source week |
| What % of PPC enquiries actually map to a matter? | Computed but buried in debug | First-class attribution-confidence chip |
| Should we keep spending at this level next week? | No view takes a position | Plain-English verdict line under the headline |
| Is this trending? | Daily rows only, no trend | 13-week sparklines on CPL + CPI |

The current surface has all the *raw* data and most of the *joins* (`ppcIncomeMetrics` is half the work). The gap is **a verdict**, **a trend window**, and **a server-backed weekly rollup** so the answer is the same in every browser and survives a refresh without rerunning a 5,000-row client-side reduce.

---

## 3. Plan

### Phase A — minimum viable verdict (ships against current data path)

Independently shippable. Uses the existing `/api/marketing-metrics/google-ads` route + existing `ppcIncomeMetrics` computation. No new SQL. Goal: make the current PPC surface *say something* a human can act on.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Verdict tile (header) | `PpcReport.tsx` | Render headline strip: this-week CPI vs 4-week median CPI. Green if better, amber within ±15%, red if worse. One line of plain English under the number ("Spending more per instruction than 4-week median — review before increasing budget."). |
| A2 | Funnel strip | `PpcReport.tsx` | Single horizontal strip: Spend → Clicks → PPC enquiries → Qualified (= matched to matter) → Instructions (= matter created) → Revenue 30d → Revenue all. Each step shows count + drop-off %. Brand: zero-radius pills, dark ladder, accent for active step boundary. |
| A3 | Attribution-confidence chip | `PpcReport.tsx` | Surface `ppcIncomeMetrics.debug` matched/unmatched ratio as a first-class chip ("82% of PPC enquiries linked to a matter"). Click expands the unmatched list (already exists, just promote it). |
| A4 | 13-week trend sparkline | `PpcReport.tsx` | Two stacked sparklines (CPL, CPI) over the last 13 weeks. Reuses the chart primitive used by Home/Reporting. Computed client-side from existing daily Google Ads array + week-bucketed `ppcIncomeMetrics`. |
| A5 | Drilldown table | `PpcReport.tsx` | One row per week (newest first): week_start, spend, clicks, ppc_enquiries, qualified, instructions, revenue_30d, CPL, CPI. Expand-row reveals the matters from that week (already in `ppcIncomeMetrics.matched`). |
| A6 | Wayfinding regions | `PpcReport.tsx` | `data-helix-region` on outer + each block: `reports/ppc`, `reports/ppc/verdict`, `reports/ppc/funnel`, `reports/ppc/trend`, `reports/ppc/drilldown`. |
| A7 | Brand pass | `PpcReport.tsx` | Audit colours against `colours.ts`: green = `colours.green`, amber = `colours.orange`, red = `colours.cta`, body text `#d1d5db` dark / `#374151` light, zero-radius surfaces, no ad-hoc hex. |

**Phase A acceptance:**

- LZ opens the PPC tab and within 3 seconds reads a one-line verdict.
- Funnel strip totals reconcile to existing `ppcIncomeMetrics` numbers (no double counting).
- 13-week trend renders even when current week has zero spend.
- Type-check clean. No new server endpoints. No SQL changes.

### Phase B — server-backed weekly rollup (durable, multi-user-coherent)

Picked up only after Phase A is shipped and after the upstream `marketing_google_ads_daily` table from the Google Ads brief exists.

#### B1. SQL table — `reporting_ppc_weekly`

```sql
CREATE TABLE reporting_ppc_weekly (
  week_start            DATE        NOT NULL PRIMARY KEY,  -- Monday, Europe/London
  spend_gbp             DECIMAL(10,2) NOT NULL,
  clicks                INT         NOT NULL,
  impressions           INT         NOT NULL,
  ppc_enquiries         INT         NOT NULL,
  qualified_enquiries   INT         NOT NULL,  -- matched to a matter
  instructions          INT         NOT NULL,  -- matters created from PPC enquiries
  revenue_30d_gbp       DECIMAL(12,2) NOT NULL, -- recovered fees within 30d of enquiry
  revenue_all_gbp       DECIMAL(12,2) NOT NULL,
  cpl_gbp               DECIMAL(10,2) NULL,    -- spend / qualified_enquiries
  cpi_gbp               DECIMAL(10,2) NULL,    -- spend / instructions
  attribution_pct       DECIMAL(5,2) NULL,     -- qualified / ppc_enquiries
  computed_at           DATETIME2   NOT NULL,
  reviewed_by           NVARCHAR(8) NULL,      -- initials
  reviewed_at           DATETIME2   NULL
);
```

#### B2. Server route — `GET /api/reporting/ppc-summary?weeks=13`

- New file: `server/routes/reporting/ppc-summary.js`.
- Reads from `reporting_ppc_weekly` (Core Data DB). Returns last N weeks newest-first plus a `verdict` block (this-week-vs-4-week-median CPI delta + plain-English line).
- POST sub-route: `POST /api/reporting/ppc-summary/:week_start/review` writes `reviewed_by`/`reviewed_at` for the LZ trust gate.
- App Insights: `Reporting.Ppc.Summary.Started/Completed/Failed`, `Reporting.Ppc.Summary.Duration` metric.

#### B3. Nightly rollup job — `syncPpcWeeklyRollup`

- New file: `server/jobs/syncPpcWeeklyRollup.js`.
- Joins `marketing_google_ads_daily` (spend) + `enquiries` (PPC source filter) + `matters` (matched via existing `extractMatterIdentifiers` logic, ported server-side) + `recovered_fees` (30d window).
- Recomputes the trailing 13 weeks every run (idempotent UPSERT on `week_start`). Revenue figures naturally backfill as fees are recovered.
- Schedule: 03:15 Europe/London (15 min after the Google Ads daily sync from the upstream brief).
- Wired into [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js).
- Telemetry: `DataOps.PpcWeeklyRollup.Started/Completed/Failed` + `weeksWritten` metric.

#### B4. Client cutover

- `ReportingHome.tsx`: replace client-side `ppcIncomeMetrics` consumption in PPC view with a fetch of `/api/reporting/ppc-summary?weeks=13`. Keep `ppcIncomeMetrics` for now — used by other surfaces.
- `PpcReport.tsx`: render straight off the server response. Verdict tile + funnel + trend + drilldown all pull from one payload.
- "Mark week reviewed" button on each drilldown row → POSTs to review sub-route, updates UI optimistically.

**Phase B acceptance:**

- Two browsers loading the PPC report on the same minute see identical numbers.
- Refreshing the page does not re-run the joins client-side.
- A historical week's revenue continues to grow as fees are recovered, without any code change.
- LZ can mark a week reviewed and the badge persists.

### Phase C — promotion (post-trust)

- C1. Promote PPC card from `tier: 'devPreview'` to `tier: 'prod'` for LZ + AC; everyone else still hidden until LZ signs off on a month of weeks.
- C2. Remove the local-only orange dotted border + DEV badge from `renderAvailableReportCards`.
- C3. Wire a `Server.Boot.Reporting.Ppc.Started/Completed` telemetry pair so the route shows up in the operator control plane.

---

## 4. Step-by-step execution order

1. **A1** — Verdict tile (compute median client-side from existing daily data).
2. **A2** — Funnel strip (pure render off `ppcIncomeMetrics`).
3. **A3** — Attribution chip.
4. **A4** — 13-week trend sparklines.
5. **A5** — Drilldown table.
6. **A6** — Wayfinding regions.
7. **A7** — Brand pass + type-check + changelog entry.
8. *(blocked until upstream Google Ads Phase B ships)* **B1** — `reporting_ppc_weekly` DDL.
9. **B3** — Rollup job (write before read).
10. **B2** — Read route.
11. **B4** — Client cutover.
12. **C1–C3** — Promotion.

---

## 5. Verification checklist

**Phase A:**
- [ ] Verdict tile renders a colour + a one-line sentence.
- [ ] Funnel reconciles: spend, clicks, ppc_enquiries match `ppcIncomeMetrics` totals.
- [ ] Attribution % matches `ppcIncomeMetrics.debug` ratio.
- [ ] 13-week trend renders with at least one zero week (no NaN).
- [ ] Drilldown row expand reveals matters list.
- [ ] No ad-hoc hex; all colours from `colours.ts`.
- [ ] Type-check clean.
- [ ] `data-helix-region` on every named block.

**Phase B:**
- [ ] `reporting_ppc_weekly` populated for last 13 weeks after first sync.
- [ ] `Reporting.Ppc.Summary.Completed` event visible in App Insights.
- [ ] `DataOps.PpcWeeklyRollup.Completed` event visible.
- [ ] Two browsers see identical CPI for current week.
- [ ] SQL spot check: `SELECT TOP 13 week_start, spend_gbp, instructions, cpi_gbp FROM reporting_ppc_weekly ORDER BY week_start DESC`.
- [ ] `reviewed_by`/`reviewed_at` round-trips on POST.

**Phase C:**
- [ ] PPC card visible to LZ + AC in prod without dev override.
- [ ] Local dev override removed.
- [ ] Operator control plane lists `/api/reporting/ppc-summary` with last-success timestamp.

---

## 6. Open decisions (defaults proposed)

1. **Attribution source of truth** — Default: **`enquiries.Source` (PPC label) joined to matters**, *not* Google's `metrics.conversions`. Rationale: Google's conversion count is set by tag config and historically drifts; the enquiry table is the system of record for "this person actually came in." (Already aligned with §6 of the upstream Google Ads brief.)
2. **Payback window** — Default: **30 days primary, 90 days secondary**. Rationale: 30 days is short enough to read a weekly verdict; 90 days catches the long-tail commercial work without waiting a quarter.
3. **"Qualified" definition** — Default: **enquiry that became a matter** (i.e. matched in `ppcIncomeMetrics.matched`). Rationale: simplest defensible line; avoids depending on a "qualified" status that doesn't exist consistently across AoWs. Revisit once a uniform qualification signal lands.
4. **Week boundary** — Default: **Monday 00:00 Europe/London**. Rationale: matches existing weekly rollups elsewhere in Reporting.
5. **Verdict thresholds** — Default: **green if CPI ≤ 4-week median × 0.85, amber within ±15%, red if ≥ × 1.15**. Rationale: tight enough to react, loose enough to ignore noise.
6. **Audience** — Default: **LZ primary, AC secondary, finance-aware**. Rationale: this is a spend-gate, not a marketing dashboard. Wider rollout only after a month of weeks LZ has signed off on.
7. **Headline currency precision** — Default: **whole £ in headlines, two decimals in drilldown**. Rationale: headline numbers are read at a glance; precision goes in the table.

---

## 7. Out of scope

- Campaign-, ad-group-, or keyword-level breakdown.
- Bid management or budget editing from inside the report.
- Non-Google paid channels (Bing, Meta, LinkedIn).
- SEO / organic attribution.
- Any change to the underlying Google Ads ingestion (covered by the upstream brief).
- Multi-touch attribution. First-touch via `enquiries.Source` is enough for the verdict this report exists to deliver.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/Reporting/PpcReport.tsx](../../src/tabs/Reporting/PpcReport.tsx) — surface; gets verdict + funnel + trend + drilldown
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) — Phase B: swap client-side compute for `/api/reporting/ppc-summary` fetch in PPC view; Phase C: drop local dev override

Server:
- [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) — existing `/google-ads` route (no change in this brief)
- `server/routes/reporting/ppc-summary.js` (NEW, Phase B) — read route + review POST
- `server/jobs/syncPpcWeeklyRollup.js` (NEW, Phase B) — nightly rollup
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) — wire B3 into the scheduler

SQL:
- `reporting_ppc_weekly` table (NEW, Phase B) — DDL above

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [docs/notes/GOOGLE_ADS_REPORTS_PURPOSEFUL_CLARITY_SOURCING_AND_STORED_METRIC_TABLE.md](./GOOGLE_ADS_REPORTS_PURPOSEFUL_CLARITY_SOURCING_AND_STORED_METRIC_TABLE.md) — upstream dependency

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ppc-report-does-paid-acquisition-actually-pay
verified: 2026-05-01
branch: main
touches:
  client:
    - src/tabs/Reporting/PpcReport.tsx
    - src/tabs/Reporting/ReportingHome.tsx
  server:
    - server/routes/reporting/ppc-summary.js
    - server/jobs/syncPpcWeeklyRollup.js
    - server/utils/dataOperationsScheduler.js
  submodules: []
depends_on:
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
coordinates_with:
  - hub-rollout-training-and-confidence-recovery
  - management-dashboard-trust-gate
  - retire-helix-keys-proxy-and-add-form-route-preflight
conflicts_with: []
```

---

## 9. Gotchas appendix

- `ppcIncomeMetrics` (ReportingHome.tsx ~L1998) reduces over `datasetData.enquiries` × `datasetData.allMatters` × `datasetData.recoveredFees`. On full-firm datasets this is non-trivial — Phase A still does this client-side, which is acceptable for the dev-preview audience but is a primary reason Phase B exists.
- `extractMatterIdentifiers` is the exact join logic that must be ported server-side in B3. Do not re-invent — copy and parameterise.
- Google Ads `cost` is GBP already (server-side conversion in `marketing-metrics.js`). Do not multiply or divide by anything in the client.
- The `/google-ads` route returns an envelope `{success, data:[...]}`. `fetchGoogleAdsData` already unwraps. Anything new on the client must consume the array shape, not the envelope.
- Local dev: Google Ads env config is absent → route returns empty. Phase A surfaces must render an empty-state, not crash, when the data array is empty.
- The local-only orange dotted border + DEV badge in `renderAvailableReportCards` is gated by hostname (`localhost`/`127.0.0.1`). Phase C removes this — do not delete the wrapper without also flipping `tier` to `prod`.
- Verdict colours: `cta` (#D65541) is the **only** red — do not invent a darker red for "very bad". One CTA pop per view rule applies.
- `colours.subText` (#3690CE) is highlight blue, not body text. Body text in dark mode is `#d1d5db` (warm grey). Blue-on-blue is unreadable on the dark ladder — caught this in prior sessions.
- "Mark week reviewed" is per-LZ trust gate, not a workflow — keep it a single toggle, not a multi-step approval.
- The upstream Google Ads brief proposes `marketing_google_ads_daily` with the same schedule discipline. If that brief slips, Phase B of this brief reads directly from the `/google-ads` route's last cached response — degraded but functional. Document that fallback at B3 implementation time.
