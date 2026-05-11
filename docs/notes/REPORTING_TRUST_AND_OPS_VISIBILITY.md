# Reporting Trust And Ops Visibility

> **Purpose.** Split the Reporting page's currently-conflated "trust" rail into three honest surfaces: a top **Automated Operations** strip (always visible cadence + last/next runs), a per-report **Trust bar** (read-only parity check across last 6 months, never blocks refresh, click-to-drill), and a bottom **Sync Ledger** (subtle list of recent ops events). Replace the auto-firing "Sync collected month" remediation with explicit per-month resync inside a drill-down flyout.
>
> **Verified:** 2026-05-01 against branch `main`. Re-verify file/line refs if reading >30 days later.

---

## 1. Why this exists (user intent)

The current `ManagementDashboardTrustRail` shows `Verified within threshold: SQL £0.00 · Clio £0.00 · Drift £0.00`. The £0/£0 is technically correct (May 2026 just started, both Hub and Clio are legitimately empty) but uninformative. £374,192.77 of April collected fees sits next to the test, never being asserted on. The verifier is checking the emptiest possible window.

User direction (verbatim):
- *"i think it needs to not block the report refreshing but at the top in the trust bar, confirm its processing the validation. only where it's off, and the range has been pressure tested and source as in clio shows the same figure for that, then this is where it says and breaks down whats different, but behind a behaviour cue that needs to be invoked"*
- *"i dont want the resolution of it to fire automateically, just the pressure test SQL data against source clio, effectively fully relying on the syncs"*
- *"automated operations, at the top so its clear, and with a subtle ledger at the bottom. of the page, sop spparate from the signals at the top"*
- *"drill down to find the discrepancy? make it super simple. then it finds which month, and suggests the user simple resyncs"*

NOT asking for: changes to the schedulers themselves (cadence is already as the user wants), new sync engines, automatic remediation, blocking refresh on parity failure.

---

## 2. Current state — verified findings

### 2.1 Trust rail (frontend)

- File: [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx)
- Scoped to single `collectedMtd` check.
- Auto-runs `runCollectedSnapshot()` on first preflight render (POST `/api/data-operations/reconciliation-snapshot` with `scope:'collected'`).
- Renders `Verified against Clio: SQL £x · Clio £y · Drift £z` when `check.measured` present.
- **Issue:** measured values come from a single representative parity row — currently only current-month, hence £0/£0.
- Blocked-state action calls `useReadinessRemediate('collectedMtd').remediate()` which fires `syncCollectedTime`. **User wants this removed**; resync must be explicit per-month inside drill-down.

### 2.2 Reconciliation snapshot (backend)

- File: [server/routes/dataOperations.js](../../server/routes/dataOperations.js)
- `buildReconciliationSnapshot(scope)` — emits parity rows keyed:
  - `collected-current-month-ui-vs-clio`
  - `collected-current-month-sql-vs-clio`
  - `collected-previous-month-ui-vs-clio`
  - `collected-previous-month-sql-vs-clio`
  - `wip-historical-*`
- `buildNumericParityCheck()` (~L352–372) returns `{ status, value, description, actual, expected, delta }`.
- Snapshot held in module-private `latestReconciliationSnapshot`. Refreshed via `refreshReconciliationSnapshot(scope)` after each successful sync (already wired by scheduler).
- **Gap:** only current + previous month are checked. April (£374k) is checked, but earlier closed months (Mar, Feb, Jan, Dec, Nov) are not — drift in those months is invisible.

### 2.3 Readiness contract (backend)

- File: [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) (~L120–225)
- `evaluateParityFromSnapshot({ id, label, scope, sourceCheckKeys })` filters snapshot rows and reduces to a single `ReadinessCheck`. Builds `measured` from a representative scoped row even when ok.
- **Gap:** no `findings[]` array — drill-down has nowhere to surface per-month results.

### 2.4 Scheduler (already correct)

- File: [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js)
- Cadence: current-month Collected hourly :05 / WIP hourly :20. Previous-month seal: Day 1 03:33/12:33/23:33 (collected) and :50 (WIP); Days 2–14 + Day 21 02:33/02:50; last day of month 23:33/23:50.
- Status endpoint: `GET /api/data-operations/scheduler-status`.
- SSE stream: `dataops-stream` with `started/progress/completed/validated/failed` events.
- Ring buffer `dataOpsLog` provides recent results.
- **Already producing everything Layer 1 + Layer 4 need. No backend changes for the strips.**

### 2.5 Reporting Home wiring

- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) (~L5180)
- Per-dependency trust override forces `trust:'unsupported'` for preflight reasons.
- File: [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx) (~L2257–2310)
- Hosts trust rail + degradation veil. Veil currently fires on `blocked`. **User wants veil removed for parity-blocked state** — never block refresh.

### 2.6 Manifest

- File: [src/tabs/Reporting/reportTrust.ts](../../src/tabs/Reporting/reportTrust.ts)
- `REPORT_SOURCE_TRUST_MANIFEST = { dashboard: { recoveredFees: 'collectedMtd' } }` — keep narrow.

---

## 3. Plan

### Phase A — Honest verifier (rolling 6-month parity + findings)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Extend snapshot builder to emit `collected-month-YYYY-MM-sql-vs-clio` rows for last 6 closed months | [server/routes/dataOperations.js](../../server/routes/dataOperations.js) | Helper that loops over last 6 months (excluding current). Each row calls existing `RecoveredFees` SQL + Clio Reports API for that month. Cache Clio response keyed `clio:collected:YYYY-MM` with TTL bound to last successful sync timestamp. |
| A2 | Aggregate `findings[]` in readiness | [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) | `evaluateParityFromSnapshot` builds `findings: [{ month: 'YYYY-MM', label: 'Apr 2026', sql, clio, delta, status }]` from all scoped rows. Overall status = ok only if every month within threshold; otherwise `error`. |
| A3 | Add `findings` to readiness type | [src/tabs/Reporting/readiness.types.ts](../../src/tabs/Reporting/readiness.types.ts) | Optional `findings?: ParityFinding[]` on `ReadinessCheck`. |
| A4 | Trust bar shows aggregate copy + drill-down CTA | [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx) | "Verified across last 6 months · drift within threshold" / "1 month differs: Mar 2026 (Δ £842.10)". Remove `remediate()` button. Add "Show breakdown" CTA. |
| A5 | Remove parity-blocked veil | [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx) | Veil only for true loading/error states, never for `blocked` parity verdict. |
| A6 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry. |

**Phase A acceptance:**
- Trust bar reads "Verified across last 6 months" with non-zero figures (April £374,192 visible in drill-down breakdown when expanded).
- No auto-sync. Blocked state has no action button — only "Show breakdown".
- Report refresh never blocked by parity verdict.

### Phase B — Drill-down flyout + per-month resync

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | New drill-down component | `src/tabs/Reporting/CollectedFeesDrillDown.tsx` (NEW) | Inline expand from Trust bar. Lists each month's `findings` row. SQL / Clio / Δ / status badge. `Resync <month>` button on mismatch rows. |
| B2 | Per-month resync wiring | [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx) | POST `/api/data-operations/sync-collected` with `{ startDate, endDate, mode:'replace', invokedBy:initials }` for that month's bounds. Stream progress via SSE. On completion, re-trigger snapshot for that month only. |
| B3 | Optional: per-month snapshot refresh route | [server/routes/dataOperations.js](../../server/routes/dataOperations.js) | If full snapshot rebuild is too heavy, add `?month=YYYY-MM` to refresh just that row. Otherwise reuse `scope:'collected'`. |
| B4 | Changelog | | |

**Phase B acceptance:**
- Click "Show breakdown" → table appears.
- Click "Resync March" on a mismatch row → SSE-driven progress strip appears, sync completes, row re-evaluates, status flips to ok.
- No auto-sync anywhere.

### Phase C — Automated Ops strip (top) + Sync Ledger (bottom)

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Top strip | `src/tabs/Reporting/AutomatedOpsStrip.tsx` (NEW) | Always-visible row of tier dots: `Collected (current)` `WIP (current)` `Collected (seal)` `WIP (seal)`. Each shows last successful run time, duration, row count, next fire. Expanding shows full cadence. Live via SSE. Pure UI — uses `/api/data-operations/scheduler-status` + `dataops-stream`. |
| C2 | Bottom ledger | `src/tabs/Reporting/SyncLedger.tsx` (NEW) | Quiet 5–10 row list from `dataOpsLog`. Small text, no buttons. Just visibility. |
| C3 | Reporting Home layout | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | Mount `AutomatedOpsStrip` above the report grid; mount `SyncLedger` below. |
| C4 | Changelog | | |

**Phase C acceptance:**
- Top strip visible on every Reporting Home view, updates live during a sync.
- Bottom ledger lists last 5–10 ops events, refreshes via SSE.
- Both visually distinct from per-report Trust bar (different surface treatment).

---

## 4. Step-by-step execution order

1. **A1** — Backend snapshot builder: rolling 6-month parity rows + Clio response cache.
2. **A2** — Backend readiness aggregator: `findings[]`.
3. **A3** — Frontend type: `findings?` on `ReadinessCheck`.
4. **A4** — Trust bar copy + remove `remediate()` action.
5. **A5** — Remove parity-blocked veil.
6. **A6** — Changelog. Ship Phase A.
7. **B1** — Drill-down component.
8. **B2** — Per-month resync wiring (uses existing `/sync-collected` route + SSE).
9. **B3** — (Optional) per-month snapshot refresh.
10. **B4** — Changelog. Ship Phase B.
11. **C1** — Automated Ops strip.
12. **C2** — Sync Ledger.
13. **C3** — Reporting Home layout.
14. **C4** — Changelog. Ship Phase C.

---

## 5. Verification checklist

**Phase A:**
- [x] Trust bar shows "Verified across last 6 months · SQL £X · Clio £Y · Δ £0" with non-zero figures.
- [x] If a month differs, status flips to `error` and copy shows the worst-month delta.
- [x] Report refresh works regardless of parity verdict (no veil block).
- [x] No auto-sync triggered. `remediate()` button removed.
- [x] `node --check` passes for both backend files.
- [x] App Insights: `Reconciliation.Snapshot.Built` includes `monthsChecked: 6`.

**Phase B:**
- [x] Show breakdown reveals per-month rows.
- [x] Per-month Resync triggers SSE progress, completes, re-evaluates that month.
- [x] Other months' rows untouched during resync.

**Phase C:**
- [x] Top strip live-updates during 13:05 collected sync (state goes idle → running → idle).
- [x] Bottom ledger lists most recent dataOps events.
- [x] Both surfaces survive HMR (`disposeOnHmr`) and server bounce (`onServerBounced`).

---

## 6. Open decisions (defaults proposed)

1. **How many months back?** — Default: **6 closed months** (rolling). Rationale: balances Clio API cost vs visibility. Configurable via `RECONCILIATION_MONTHS_BACK` env, default 6.
2. **Threshold for "ok"** — Default: **reuse existing `DRIFT_ABS_THRESHOLD` / `DRIFT_PCT_THRESHOLD`** per month. Rationale: same definition of drift as today, just applied per-month.
3. **Clio cache TTL** — Default: **1 hour, invalidated on next successful sync for that scope**. Rationale: Clio Reports API is slow; closed-month figures don't change until a sync rewrites SQL.
4. **Resync UX during in-flight sync** — Default: **disable button + show "Sync in progress…"** with the live progress message from SSE. No queueing.
5. **Where does Trust bar live?** — Default: **inside the Recovered Fees report card header**, not at page top. Phase C's Automated Ops strip owns the page-top slot.

---

## 7. Out of scope

- Adding new schedulers or changing existing cadence (already as user wants).
- Pressure-testing WIP (only Collected fees in this brief — WIP is week-scoped, different shape; future brief).
- Pressure-testing Enquiries / Matters / Team Data (no Clio source-of-truth equivalent).
- Cross-firm parity (firm-wide only; per-fee-earner is a separate concern).
- Replacing the existing `dataOpsLog` with a persistent ledger (in-memory ring buffer is fine for this brief).

---

## 8. File index (single source of truth)

Client (existing):
- [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx) — A4, B2
- [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx) — A5
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) — C3
- [src/tabs/Reporting/reportTrust.ts](../../src/tabs/Reporting/reportTrust.ts) — manifest stays narrow
- [src/tabs/Reporting/readiness.types.ts](../../src/tabs/Reporting/readiness.types.ts) — A3

Client (NEW):
- `src/tabs/Reporting/CollectedFeesDrillDown.tsx` — B1
- `src/tabs/Reporting/AutomatedOpsStrip.tsx` — C1
- `src/tabs/Reporting/SyncLedger.tsx` — C2

Server (existing):
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js) — A1, B3
- [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) — A2
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) — read-only reference

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: reporting-trust-and-ops-visibility
verified: 2026-05-01
branch: main
touches:
  client:
    - src/tabs/Reporting/ManagementDashboardTrustRail.tsx
    - src/tabs/Reporting/ManagementDashboard.tsx
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/readiness.types.ts
    - src/tabs/Reporting/CollectedFeesDrillDown.tsx
    - src/tabs/Reporting/AutomatedOpsStrip.tsx
    - src/tabs/Reporting/SyncLedger.tsx
  server:
    - server/routes/dataOperations.js
    - server/routes/reportingReadiness.js
  submodules: []
depends_on: []
coordinates_with:
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table  # both touch ReportingHome.tsx, different sections
  - hub-rollout-training-and-confidence-recovery                            # touches ManagementDashboard / ReportingHome / reportingReadiness in adjacent regions
  - ppc-report-does-paid-acquisition-actually-pay                           # touches ReportingHome.tsx in PPC report region
  - clio-webhook-reconciliation-and-selective-rollout                       # touches dataOperations.js in Clio webhook region
  - management-dashboard-trust-gate                                         # this brief is the successor — supersedes the trust-gate first slice
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Clio Reports API is async.** `RecoveredFees`-equivalent calls go through queue/poll/download (see `syncCollectedTimeCustom_*` progress logs). Do not call inline from the request handler — reuse the existing helper that handles queueing, or pre-warm via the scheduler. For Phase A, the snapshot rebuild can be slower (already happens off-request).
- **`latestReconciliationSnapshot` is module-private.** Use the exported `refreshReconciliationSnapshot(scope)` and existing accessor — confirm name before A1.
- **Snapshot scope strings.** Existing scopes: `'collected' | 'wip' | 'pipeline' | 'all'`. Don't invent new ones for per-month — keep them as parity row keys inside `'collected'` scope.
- **Drift threshold lives in `dataOperations.js`.** `DRIFT_ABS_THRESHOLD` + `DRIFT_PCT_THRESHOLD`. Reuse, don't duplicate.
- **`useReadinessRemediate` returns `{ remediate, isRemediating }`.** Removing the button means we don't need this hook in the rail at all once Phase A lands. Don't accidentally orphan the import.
- **SSE survival.** Any new SSE consumer (Layer 1 strip, Layer 4 ledger) MUST register `disposeOnHmr` + `onServerBounced` per [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md).
- **The £0/£0 you saw on May 1st was correct, not a bug.** It was just useless. Phase A fixes the *uselessness* by widening the window, not the correctness.
- **Veil removal** — there's a `degradationVeil` flag in `ManagementDashboard.tsx` driven by `trustVerdict.state === 'blocked'`. Confirm no other consumer relies on it before removing the parity-blocked branch.
- **Brand colours only.** Status dots: `colours.green` (verified), `colours.orange` (mismatch), `colours.subtleGrey` (checking). Drill-down rows: hover with `applyRowHover` / `resetRowHover`. No Tailwind defaults.
