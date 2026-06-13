# Reports Data Hub Dataset Provider Migration

> **Purpose of this document.** This is a self-contained brief that any future agent can pick up cold and execute without prior chat context. It captures the user intent, the verified current implementation, the first shippable slice, and the larger direction.
>
> **How to use it.** Read the whole document once. Implement Phase A first. Treat Phase B and Phase C as follow-on phases only after A ships and is validated. Add a changelog entry per shipped phase.
>
> **Verified:** 2026-06-08 against branch `main`. If reading this more than 30 days later, re-verify file refs before executing.

---

## 1. Why this exists (user intent)

The user wants Data Hub to become the provider and control plane for reporting datasets, with reports mapping onto datasets instead of each report hiding its own fetch and readiness rules. Current wording: "i want data hub to be the provider of all of the data sets and then we map them to the reports etc. all in one place".

The immediate pain is that WIP and collected fees are clear because Data Hub has reconciliation and sync tooling for them, while marketing datasets are unclear. The first target is SEO / GA4. SEO is different in purpose: it is an external analytics telemetry dataset used to explain organic traffic and enquiry relationship, not a ledger that should be reconciled like WIP or collected fees.

The goal is not to redesign every report at once. The first shippable slice should make Google Analytics visible, testable, and understandable in Data Hub, while keeping SEO report rendering intact and production Reports chrome clean.

---

## 2. Current state - verified findings

### 2.1 Dataset definitions and report mapping are embedded in Reporting Home

- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) defines `DatasetMap`, `DATASETS`, and `DatasetKey` near lines 777 to 810.
- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) defines `AVAILABLE_REPORTS` near lines 886 to 965. The SEO report entry has key `seo`, action `seoReport`, and required datasets `googleAnalytics`, `enquiries`, and `allMatters` near lines 900 to 905.
- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) defines `DEV_PREVIEW_ONLY_DATASETS` near lines 966 to 975. `googleAnalytics`, `googleAds`, `metaMetrics`, and `dubberCalls` are stripped from the normal production surface to avoid third-party endpoint failures blocking the rest of the firm.

### 2.2 Data Hub already groups datasets, but it does not own provider semantics

- File: [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) defines local `DatasetSummary` shape near lines 22 to 33.
- File: [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) defines feed groups near lines 1755 to 1774. The current `Ads & traffic` group lists `metaMetrics`, `googleAnalytics`, and `googleAds`, but it does not explain provider source, report usage, freshness expectations, or test actions.
- File: [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) has deeper operational tooling for WIP and collected fees. That makes those two datasets understandable, but the marketing group is comparatively opaque.

### 2.3 SEO / GA4 fetch ownership is split across Reporting Home, server routes, and stream helpers

- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) defines `fetchGoogleAnalyticsData` near lines 2047 to 2081. It calls `/api/marketing-metrics/ga4` with start and end dates derived from a month range.
- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) auto-fetches GA4 when `activeView === 'seoReport'` near lines 3167 to 3223.
- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) also refreshes non-streaming marketing feeds inside the larger refresh path near lines 3440 to 3615.
- File: [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) exposes `GET /api/marketing-metrics/ga4` near lines 584 to 710. It reads GA4 credentials from env, path, or Key Vault, requests daily metrics, maps GA4 `keyEvents` back to frontend `conversions`, and returns aggregate daily rows.
- File: [server/routes/reporting-stream.js](../../server/routes/reporting-stream.js) supports `googleAnalytics` as a streaming dataset near lines 401 to 404, using `fetchGoogleAnalyticsData` near lines 951 to 1005 to proxy the GA4 route.

### 2.4 SEO report is a presentation surface, not the right place for provider ownership

- File: [src/tabs/Reporting/SeoReport.tsx](../../src/tabs/Reporting/SeoReport.tsx) is labelled as an analytical GA4 plus commercial cross-section at line 2.
- File: [src/tabs/Reporting/SeoReport.tsx](../../src/tabs/Reporting/SeoReport.tsx) normalises GA4 rows near lines 77 to 81 and renders SEO regions such as trend, cross-join, and dimensions near lines 832 to 968.
- SEO should consume a prepared `googleAnalytics` dataset and explain the report. Data Hub should explain and operate the provider.

### 2.5 Known GA4 edge case

- Repo memory `ga4-metrics-gotchas.md` states that GA4 must not request both `conversions` and `keyEvents` in the same `runReport` call. This property returns a duplicate metrics error. Keep requesting `keyEvents` and mapping it to the UI field `conversions`.

---

## 3. Plan

### Phase A - SEO / GA4 provider visibility in Data Hub

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add a shared reporting dataset registry | `src/tabs/Reporting/reportingDatasets.ts` (NEW) | New registry for dataset definitions, provider purpose, source route, freshness expectation, report usage, dev-preview flag, and refresh/test capability. Start with all existing `DATASETS`, but give rich metadata only to `googleAnalytics` in this phase. |
| A2 | Consume the registry from Data Hub | [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) | Replace the hard-coded marketing group semantics with registry-derived labels and add a Google Analytics / SEO provider panel. |
| A3 | Keep Reports mapping aligned | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | Keep the existing report cards and SEO flow working, but start reading dataset definitions from the shared registry where low-risk. Do not rewrite all refresh flow in this phase. |
| A4 | Add GA4 test/refresh affordance in Data Hub | [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) | Provide a local/operator action to run a short GA4 aggregate check using the existing route. Default to 7 days for the test to reduce latency and API load. |
| A5 | Preserve server behaviour | [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js), [server/routes/reporting-stream.js](../../server/routes/reporting-stream.js) | Avoid changing GA4 metrics unless necessary. If a server change is needed, add App Insights success/failure telemetry with structural metadata only. |

**Phase A acceptance:**
- Data Hub shows a distinct Google Analytics / SEO traffic provider panel.
- The panel explains source, purpose, reports using it, freshness, current row count, last updated time, and whether it is ready/loading/error/idle.
- Data Hub can trigger a short GA4 provider check without opening the SEO report.
- Opening SEO report still works and uses the same `googleAnalytics` dataset state.
- Production-shaped Reports overview remains clean. Data Hub remains in local/operator workspace, not top production chrome.

### Phase B - Move report-to-dataset mapping fully out of Reporting Home

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Move `AVAILABLE_REPORTS` or a derived requirements map into registry-owned code | `src/tabs/Reporting/reportingDatasets.ts`, [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | Make report requirements visible in one place without breaking rollout gates. |
| B2 | Add provider panels for Google Ads and Dubber calls | [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) | Do this after SEO, because PPC and calls have different provider semantics and rollout status. |
| B3 | Define provider categories | `src/tabs/Reporting/reportingDatasets.ts` | Suggested categories: `reconciled-ledger`, `operational-cache`, `external-analytics`, `communications-feed`, `reference-data`. |

### Phase C - Data Hub as the reporting provider control plane

- Make Data Hub the place to inspect all reporting provider readiness.
- Reports should ask the registry what they need, then request datasets through one controlled path.
- Avoid report-specific hidden fetches unless there is a documented reason.
- Add provider health/testing entries gradually, not as one risky rewrite.

---

## 4. Step-by-step execution order

1. **A1** - Create `reportingDatasets.ts` with typed dataset metadata. Include `googleAnalytics` metadata first-class. Keep shape conservative so it can be adopted incrementally.
2. **A2** - Import registry into Data Hub and render a focused SEO / GA4 provider panel under `Ads & traffic` or a new `Marketing providers` section.
3. **A4** - Wire the provider panel test action to the existing `/api/marketing-metrics/ga4` route with a 7-day default. Keep the UI structural and aggregate-only.
4. **A3** - Make the lowest-risk Reporting Home registry adoption, for example replacing duplicated label/source text, but do not pull apart the main refresh pipeline yet.
5. **A5** - If server code changes, add App Insights telemetry and run `node --check` on touched server files.
6. Validate diagnostics and manually check local Reports -> local workspace -> Data Hub -> SEO / GA4 provider panel -> SEO report.

Parallelisable after A1: A2 and A4 can be developed together because both live in Data Hub, but A3 should wait until the panel shape is stable.

---

## 5. Verification checklist

**Phase A:**
- [ ] Focused diagnostics clean for touched TS/TSX files.
- [ ] If server files change, `node --check server/routes/marketing-metrics.js` and/or `node --check server/routes/reporting-stream.js` pass.
- [ ] Data Hub local workspace still opens from Reports local box.
- [ ] Data Hub shows Google Analytics / SEO traffic provider with purpose, source, usage, status, freshness, and count.
- [ ] Provider test uses a short aggregate window and does not display client PII.
- [ ] SEO report still opens after GA4 is loaded.
- [ ] View-as-prod mode hides local workspace and Data Hub entry.
- [ ] Changelog entry added via `npm run changelog:add`.

**Phase B:**
- [ ] Report-to-dataset mapping can be read from one registry.
- [ ] Data Hub shows provider categories for all report datasets.
- [ ] Existing report cards keep their rollout gates.

---

## 6. Open decisions (defaults proposed)

1. **Where should SEO / GA4 provider panel be visible?** Default: local/operator Data Hub only for Phase A. Rationale: SEO is still dev-preview and the user explicitly wants production Reports kept clean.
2. **What should GA4 test mean?** Default: a 7-day aggregate provider check. Rationale: it proves credentials, route, property id, metric compatibility, and response shape without heavy API load.
3. **Should SEO get ledger-style reconciliation?** Default: no. Rationale: GA4 is telemetry. Validate availability, schema, row counts, freshness, and source dimensions instead.
4. **Should the first pass remove the hidden SEO auto-fetch?** Default: not immediately. Rationale: keep SEO stable while Data Hub provider ownership is introduced. Once Data Hub panel is working, move the SEO open path to use a shared provider request.

---

## 7. Out of scope

- Full rewrite of Reporting Home refresh orchestration.
- Full Data Hub redesign.
- Promotion of SEO to all Reports users.
- Meta Ads resurrection.
- Google Ads/PPC provider redesign beyond keeping the registry ready for it.
- Any live client data reads or raw PII display.
- Full build unless a narrower validation cannot cover the touched slice.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) - Data Hub surface. Add SEO / GA4 provider panel and provider test action.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) - Current dataset definitions, report mapping, refresh orchestration, and SEO GA4 fetch. Keep changes narrow in Phase A.
- `src/tabs/Reporting/reportingDatasets.ts` (NEW) - planned shared dataset registry.
- [src/tabs/Reporting/SeoReport.tsx](../../src/tabs/Reporting/SeoReport.tsx) - SEO report presentation. Avoid changing unless Data Hub provider shape requires a prop/status adjustment.

Server:
- [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) - GA4 aggregate route and source of provider test data.
- [server/routes/reporting-stream.js](../../server/routes/reporting-stream.js) - Existing streaming dataset path for `googleAnalytics`.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: reports-data-hub-dataset-provider-migration
verified: 2026-06-08
branch: main
touches:
  client:
    - src/tabs/Reporting/DataCentre.tsx
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/reportingDatasets.ts
    - src/tabs/Reporting/SeoReport.tsx
  server:
    - server/routes/marketing-metrics.js
    - server/routes/reporting-stream.js
  submodules: []
depends_on: []
coordinates_with:
  - function-retirement-phase-2-d-and-e-transactionapprovalpopup-and-mattersreport-cleanup
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - hub-rollout-training-and-confidence-recovery
  - management-dashboard-trust-gate
  - ppc-report-does-paid-acquisition-actually-pay
  - reception-performance-kpi-dashboard
  - reporting-trust-and-ops-visibility
conflicts_with: []
```

---

## 9. Gotchas appendix

- `src/tabs/Reporting/ReportingHome.tsx` is already very large and has several unrelated open stash co-ordinations. Keep Phase A changes to registry adoption and Data Hub handoff only.
- `googleAnalytics` currently has at least three client fetch paths: direct helper, SEO open effect, and broader non-streaming refresh. Do not create a fourth hidden path.
- GA4 must request `keyEvents`, not both `conversions` and `keyEvents`. Preserve the frontend `conversions` field by mapping from `keyEvents`.
- Data Hub provider checks must return aggregate structural data only: status, route, range, row count, freshness, source. Do not display raw enquiry or matter details.
- SEO uses `googleAnalytics` plus `enquiries` and `allMatters`. Data Hub should explain this as a report dependency map, not imply GA4 alone is the whole SEO report.
- View-as-prod mode should keep local workspace hidden. Do not reintroduce Data Hub or provider controls into the production-shaped Reports overview.