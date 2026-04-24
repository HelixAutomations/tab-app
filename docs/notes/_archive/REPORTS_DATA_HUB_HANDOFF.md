# Reports Data Hub Handoff

## Purpose

This brief is for the next agent who will explore and implement the next phase of the Reports Data Hub work.

Primary target:
- Stand up a Data Hub backed path for outstanding balances so Reports and adjacent metrics do not depend on a live Clio call at render time.

Secondary context only:
- Disbursement invoice handling is adjacent and should inform the Data Hub design, but it is not the first implementation target in this slice.

Do not drift into:
- Broad portal/admin journey work.
- Full invoice/disbursement implementation.
- Unrelated instruct-pitch route clean-up.

## Why This Exists

The live outstanding balances route is not large in payload size, but it is operationally fragile because it is still a live Clio dependency.

Current live characteristics:
- Payload is small enough: about 27 KB, 140 rows, about 194 bytes per row.
- The real issue is external dependency risk: Clio token expiry, upstream latency, and route failure under Home/Reports usage.

The Reports space already has the right conceptual home for this work:
- user-invoked Data Hub loading
- reconciliation surfaces
- saved-table versus source comparisons
- operational status and log monitoring

## Current Anchors

### Reports shell and navigation

- [src/app/App.tsx](src/app/App.tsx)
  Loads the Reports tab and routes navigation requests into `ReportingHome`.

- [src/tabs/Reporting/ReportingHome.tsx](src/tabs/Reporting/ReportingHome.tsx)
  High-level reporting composition. This is also where recovered fee logic already excludes disbursements to mirror Management Dashboard totals.

- [src/tabs/Reporting/ManagementDashboard.tsx](src/tabs/Reporting/ManagementDashboard.tsx)
  Existing reporting behaviour around disbursement inclusion/exclusion. This is the clearest existing reference for the disbursement invoice concern.

### Data Hub / reconciliation surface

- [src/tabs/Reporting/DataCentre.tsx](src/tabs/Reporting/DataCentre.tsx)
  The key implementation anchor for this handoff.

Relevant behaviour already present:
- user-invoked `loadDataHub()`
- ops status and ops log loading
- `runReportingAudit()` invoking `/api/data-operations/reconciliation-snapshot`
- reconciliation UI that compares source, report, and saved table

Important note from repo instructions:
- [src/tabs/Reporting/DataCentre.tsx](src/tabs/Reporting/DataCentre.tsx) is not the visual source of truth for new reporting UI. It is still the correct implementation anchor for the Data Hub logic and reconciliation workflow.

### Outstanding balances live path

- [server/routes/outstandingBalances.js](server/routes/outstandingBalances.js)
  Current live API for firm-wide and user-scoped outstanding balances.

- [server/utils/clioAuth.js](server/utils/clioAuth.js)
  Shared Clio token management.

- [server/routes/home-metrics-stream.js](server/routes/home-metrics-stream.js)
  Streams `outstandingBalances` into Home metrics.

Current state:
- Route fetches from Clio.
- Route uses Redis cache.
- Route now retries once on Clio `401` after clearing cached token.
- There is still no materialised table behind it.

### Disbursement / invoice adjacent anchors

- [src/tabs/Reporting/ManagementDashboard.tsx](src/tabs/Reporting/ManagementDashboard.tsx)
  `includeDisbursements` toggle and fee filtering already encode the current product rule.

- [src/tabs/Reporting/ReportingHome.tsx](src/tabs/Reporting/ReportingHome.tsx)
  Recovered fee logic skips `Expense` and `Product` rows to mirror Management Dashboard totals.

- [server/routes/dataOperations.js](server/routes/dataOperations.js)
  Collected time reconciliation and deep validation already use Clio `invoice_payments_v2` reports.

This matters because the Data Hub design should not be outstanding-balances-only in shape if we already know invoice and disbursement lanes are next.

## Scope For The Next Agent

### In scope

1. Design and implement a materialised Data Hub path for outstanding balances.
2. Make Reports/Data Hub the operational home for inspecting this dataset and reconciling source versus saved state.
3. Propose the table shape, sync pattern, and read path changes needed to remove the live Clio dependency from normal render-time use.
4. Keep the design extensible enough that disbursement invoice data can follow the same pattern next.

### Not in scope for the first implementation pass

1. Full disbursement invoice ingestion or reconciliation build-out.
2. Portal/admin entry journey work.
3. End-to-end instruct-pitch exploration.
4. New reporting visual redesign.

## Recommended Direction

### Storage location

Do not stand this up in Instructions.

Reason:
- Outstanding balances are an operational finance snapshot from Clio, not instruction lifecycle data.
- Instructions is the wrong domain boundary for this dataset.
- Reports/Data Hub and reconciliation are tab-app operational concerns, not client onboarding/instruction concerns.

Preferred location:
- Core Data database or another operational reporting table set owned by tab-app.

### Suggested data model

Minimum viable split:

1. `outstanding_balances_current`
   Stores the latest materialised view for the firm.

Suggested columns:
- `balance_id` or Clio object id
- `contact_id`
- `contact_name`
- `total_outstanding_balance`
- `last_payment_date`
- `associated_matter_ids_raw`
- `source_synced_at`
- `source_status`
- `source_hash` or checksum

2. Optional: `outstanding_balances_snapshots`
   Only if historical audit/trend views are needed soon.

Suggested columns:
- all key business fields from current table
- `snapshot_at`
- `snapshot_batch_id`

### Suggested sync pattern

Use a scheduled or user-invoked sync path that:
- fetches Clio balances
- normalises and upserts current rows
- records sync metadata
- emits telemetry and reconciliation summary

Preferred cadence:
- 10 to 15 minute refresh for current-state table, or
- user-invoked refresh from Data Hub plus scheduled background refresh

### Suggested read-path outcome

Normal read path:
- Reports/Data Hub reads from saved table first.

Fallback path:
- Clio live fetch only for manual repair, validation, or backfill.

Desired end state:
- Home and Reports stop treating Clio as the primary runtime dependency for outstanding balances.

## Data Hub Expectations

The next agent should treat Data Hub as the control plane for this work, not just a diagnostic page.

Minimum expected additions:

1. A dedicated outstanding balances dataset card or lane in [src/tabs/Reporting/DataCentre.tsx](src/tabs/Reporting/DataCentre.tsx).
2. Visibility into:
- latest sync timestamp
- row count
- source freshness
- last error
- whether current view is table-backed or live-source-backed
3. A reconciliation action that compares:
- saved table total/count
- live Clio total/count
- optionally sampled row-level differences
4. Clear status strip/toast behaviour for sync start, success, drift, and failure.

This should align with the existing Data Centre patterns:
- ops log
- reconciliation snapshot
- saved table versus source language

## Disbursement Invoice Adjacency

This is context, not the first build target.

What we already know from the code:
- Reporting logic already distinguishes fee rows from disbursement-like rows.
- Management Dashboard has an explicit `includeDisbursements` control.
- Collected-time deep reconciliation already depends on Clio `invoice_payments_v2`.

What the next agent should do now:
- design the outstanding balances table/sync in a way that can be reused for invoice/disbursement materialisation later
- note where the invoice/disbursement lane should plug into Data Hub next
- avoid implementing that lane unless it naturally falls out of the same primitives

What the next agent should not do now:
- build a separate invoice reporting product
- re-litigate the fee versus disbursement business rule

## Feedback Context From Colleague

The feedback exchange provided these labels:

- No Passcode Entry
- Admin Entry
- Passcode Normal Entry
- Normal ID Only
- No live ID only deal found
- Normal Doc Only
- No live doc request deal found
- Normal Payment Only
- Success
- Expired
- Matter Portal
- Client Selector
- Payment Ops
- Admin Portal

Treat these as adjacent operational journey states, not as the primary build scope for this handoff.

Why they still matter:
- they suggest the Reports/Data Hub may eventually need to reconcile operational datasets against real portal/payment/admin states
- they are a useful external validation matrix for future reconciliation tooling

For this handoff, they should only appear as future-facing context. Do not let them drag the current implementation into portal/admin route work.

## Recommended Delivery Plan

### Phase 1

1. Confirm target DB location for the new table.
2. Add the table schema and a sync metadata model.
3. Add a server-side sync route or job for outstanding balances.
4. Switch `/api/outstanding-balances` to read table-first.
5. Add Data Hub visibility and reconciliation controls.

### Phase 2

1. Add drift reporting and row-level discrepancy summaries.
2. Add snapshot/history support if needed.
3. Extend the same pattern to invoice/disbursement materialisation.

## Files The Next Agent Should Read First

1. [src/tabs/Reporting/DataCentre.tsx](src/tabs/Reporting/DataCentre.tsx)
2. [server/routes/outstandingBalances.js](server/routes/outstandingBalances.js)
3. [server/routes/home-metrics-stream.js](server/routes/home-metrics-stream.js)
4. [src/tabs/Reporting/ManagementDashboard.tsx](src/tabs/Reporting/ManagementDashboard.tsx)
5. [src/tabs/Reporting/ReportingHome.tsx](src/tabs/Reporting/ReportingHome.tsx)
6. [server/routes/dataOperations.js](server/routes/dataOperations.js)

## Success Criteria

The handoff should be considered complete when another agent can implement against this brief and deliver:

1. Outstanding balances no longer rely on a live Clio call for normal reporting/runtime reads.
2. Data Hub shows saved-table status, freshness, and reconciliation for the dataset.
3. The implementation leaves a clear extension path for the disbursement invoice lane.
4. The work stays inside tab-app operational reporting scope and does not drift into broader portal/admin route work.

---

## Stash metadata

> **Note:** This brief predates the stash routine. Re-verify file/line refs before executing.

```yaml
# Stash metadata
id: reports-data-hub-outstanding-balances
shipped: true
shipped_on: 2026-04-18
verified: 2025-12-01      # approximate — predates routine
branch: unknown
stale: true
touches:
  client:
    - src/tabs/Reporting/DataCentre.tsx
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/ManagementDashboard.tsx
  server:
    - server/routes/outstandingBalances.js
    - server/routes/home-metrics-stream.js
    - server/routes/dataOperations.js
    - server/utils/clioAuth.js
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```