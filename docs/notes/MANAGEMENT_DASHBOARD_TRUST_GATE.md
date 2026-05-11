# Management Dashboard Trust Gate

> **Purpose of this document.** Self-contained brief any future agent can pick up cold. Implements an animated readiness gate in front of the Management Dashboard so users cannot enter on stale or source-mismatched numbers, a persistent trust rail inside the dashboard that stays live while open, and a one-click self-heal loop that morphs values in place when the user remedies a flagged check.
>
> **How to use it.** Read once, then ship Phase A (server endpoint, no UI). Phase B (gate UI). Phase C (trust rail + degradation veil). Phase D (one-click remediation + value morph + Teams escalation on persistent failure). One `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-29 against branch `main`.

---

## 1. Why this exists (user intent)

User direction (verbatim): *"i want indicators for all critical moving parts as the dashboard loads so that its evident, the underlying infra makes it evident, when something works and doesnt... i enter, the refreshing strip + entry into md shows indicators for week to date time, collected figures and presssure test against right here right now clio figure. enquiries checked for recent stamp, same for matters. freshness age. cleanly, animating into the board settling once evrything is good. otherwise, prompt the user, that they cant proceed bc we cant guarnatee good data."*

Trigger: Alex Cook colleague thread surfaced a £121k vs £174k Clio mismatch on Management Dashboard. Today, MD only checks **datasets fetched without throwing** — not whether the numbers match the live source of record (Clio for time/fees, SQL mirrors for enquiries/matters), not whether the sync that produced them was recent or successful.

User is **not** asking for: a reconciliation engine or a redesign of MD KPIs. Just a trust gate — and (per follow-up direction) a single-click *user-initiated* remedy when a check is flagged, with the corrected value morphing into place; if the remedy fails twice, an Adaptive Card escalates to LZ in Teams and entry stays blocked.

Follow-up direction (verbatim): *"where user loads but collected specifically (lets strt small) doesnt match clio, add subtle, 'sync' option with realtime ui morph into the new rerfeshed value... whole cycle this way - identified problem, allow user to one click remedy, if fail again, auto teams card to luke, access refused. otherwise the new update and toats and the board lands."*

---

## 2. Current state — verified findings

### 2.1 Reporting Home (entry shell)

- File: [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx)
- `requiredDatasets` for Management hero card: line ~702 — `['enquiries', 'allMatters', 'wip', 'recoveredFees', 'teamData', 'userData', 'annualLeave']`.
- Hero card render: line ~4494.
- `getButtonState`: line ~4355. `areRequiredDatasetsReady`: line ~4346 — only checks fetch state (idle/loading/ready/error), not freshness or parity.
- Live current-week WIP merge already wired: line ~3538 merges `wipClioCurrentWeek` (live Clio pull) with `wipDbCurrentWeek` (SQL). This is the **only existing source-side parity check** in the system. Collected/enquiries/matters have no equivalent.
- Animation primitives already present: `feedDotReady`, `fadeInUp` keyframes — reuse for the gate's settling animation.

### 2.2 Card UI

- File: [src/tabs/Reporting/ReportCard.tsx](../../src/tabs/Reporting/ReportCard.tsx)
- States: neutral / warming / ready / disabled. Renders dependency dots + chips. **Reflects load state only**, not freshness or parity. Visual vocabulary reusable for the trust tiles, but the data contract is not.

### 2.3 Management Dashboard

- File: [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx)
- Receives raw datasets via props. No trust payload. No degradation handling. Top of file is the natural mount point for a persistent trust rail.

### 2.4 Server reporting routes

- [server/routes/reporting.js](../../server/routes/reporting.js) — fetchEnquiries, fetchAllMatters, fetchRecoveredFees return rows with no watermark/age metadata.
- [server/routes/reporting-stream.js](../../server/routes/reporting-stream.js) — `wipClioCurrentWeek` is the existing live Clio summary check (line ~395–620). Pattern to copy for collected MTD parity.

### 2.5 Persisted scheduler history (just shipped 2026-04-29)

- `dataOpsLog` SQL table now contains tier lifecycle for collected/WIP syncs.
- Routes: `/api/data-operations/scheduler-status`, `/api/data-operations/sync-history`.
- Use this for check #5 (data-ops scheduler freshness). Do NOT recompute — query the table.

### 2.6 Existing readiness reveal pattern

- See `/memories/repo/home-boot-performance.md` — `homeDataReady` coordinated reveal gate. Mirror that pattern conceptually so the MD gate feels native.

---

## 3. Plan

### Phase A — Server readiness endpoint (no UI)

Ship the route behind `HELIX_TRUST_GATE_READ_ONLY=1` so it can be observed in staging without changing UX. Validate cost, latency, and accuracy for ~24 h.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New route `GET /api/reporting/management-readiness` | [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) (NEW) | Per-check executor with 60 s in-memory cache, 4 s per-check timeout, App Insights events. |
| A2 | Lightweight Clio summary helpers | [server/utils/clioSummary.js](../../server/utils/clioSummary.js) (NEW) | `getCollectedMtdSummary()`, `getWipWtdSummary()` — Clio summary-field calls only, never full pulls. Target < 800 ms total wall-clock. |
| A3 | Shared TS types (mirror server contract) | [src/tabs/Reporting/readiness.types.ts](../../src/tabs/Reporting/readiness.types.ts) (NEW) | `ReadinessCheck`, `ReadinessPayload`. |
| A4 | Register route | [server/index.js](../../server/index.js) | One line, after existing reporting registrations. |
| A5 | App Insights | reportingReadiness.js | `Reporting.Readiness.Check.{Started,Completed,Failed}` per check, `Reporting.Readiness.Overall.{Ready,Warn,Blocked}`, metric `Reporting.Readiness.Check.Duration` with `checkId` dim. |

**Response shape (locked contract):**

```json
{
  "generatedAt": "ISO8601",
  "overall": "blocked" | "warn" | "ready",
  "checks": [
    {
      "id": "collectedMtd",
      "label": "Collected MTD parity",
      "status": "ok" | "warn" | "blocked" | "unknown",
      "blocking": true,
      "ageSeconds": 47,
      "lastGoodAt": "ISO8601",
      "measured": { "sql": 174320.55, "clio": 174180.00, "drift": 140.55, "driftPct": 0.08 },
      "threshold": { "absolute": 500, "pct": 1 },
      "reason": null,
      "remediation": null
    }
  ]
}
```

**Phase A acceptance:**
- Endpoint returns 200 in < 1.5 s on warm cache, < 3 s cold.
- Concurrent requests within 60 s share one upstream Clio call (verify via App Insights dependency count).
- `Reporting.Readiness.Overall.*` event visible in App Insights for every call.
- Manually staling SQL `dataOpsLog` flips `dataOpsScheduler` check to `blocked` with correct reason.

### Phase B — Reporting Home gate UI

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | New gate component | [src/tabs/Reporting/ReportingReadinessGate.tsx](../../src/tabs/Reporting/ReportingReadinessGate.tsx) (NEW) | Mounted inside Management hero card. Tiles per blocking check with `feedDotReady`/`fadeInUp` settling animation. Warn-class as sub-strip. `Open Management Dashboard` button gated on `overall === 'ready'`. |
| B2 | Wire gate to hero card | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | When user clicks Management hero, mount gate inside card; hijack navigation until ready or admin override. |
| B3 | ~~Dev preview lock~~ — **REMOVED.** Gate ships visible to all users from day one. The gate IS the resolution to the Clio-vs-Hub mismatch the user keeps surfacing; hiding it defeats the entire purpose. Admins keep an audited override; everyone else is told to retry or open Data Hub. | n/a | |

**Blocked-state copy:** *"We can't guarantee this data is current. {reason}. Retry or contact ops."* — `Retry` button + `Open Data Hub → Reconciliation` deep-link.

**Admin override:** `Proceed anyway` visible only to `isAdminUser()`. Records `Reporting.Readiness.OverrideUsed` with initials, red check ids, timestamp.

**Phase B acceptance:**
- Clicking Management hero shows the strip animating in for **every user** (not gated).
- All-green state ends in `Open Management Dashboard` enabled within 2 s on warm cache.
- Forced-blocked state (manually edit `dataOpsLog`) prevents entry, shows reason.
- Admin override records audit event and opens MD with persistent red rail.

### Phase C — Persistent trust rail inside MD

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | New trust rail | [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx) (NEW) | Compact 8-dot strip with tooltips + ticking `ageSeconds`. Auto-refreshes every 5 min via cached endpoint. |
| C2 | Mount rail + degradation veil | [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx) | Render rail at top. On `ok→blocked` transition while open, apply soft veil over KPIs with "Data confidence dropped — refresh" CTA. KPIs not removed, just marked unsafe. |

**Phase C acceptance:**
- Rail visible and ticking on every MD open.
- Forcing a blocking transition mid-session veils KPIs without unmounting them.
### Phase D — One-click remediation + value morph + Teams escalation

Layered on top of B/C. Starts with **`collectedMtd` only** (per direction: *"lets strt small"*). The same primitive then becomes the pattern for any other check that gains a one-click fix.

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Remediate route | [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) (extend) | `POST /api/reporting/management-readiness/remediate` body `{ checkId }`. Routes to per-check remediator. For `collectedMtd`: trigger month-scoped collected sync (reuses `syncCollectedTime`), force a fresh reconciliation snapshot, re-evaluate that single check, return `{ check, attempt, escalated }`. Per-user, per-check attempt counter (in-memory, 30-min TTL). Idempotent under spam-clicks via in-flight Promise dedup. |
| D2 | Teams escalation helper | [server/utils/teamsEscalation.js](../../server/utils/teamsEscalation.js) (NEW) | Single function `escalateTrustGateFailure({ checkId, measured, attempts, triggeredBy, lastError })`. Posts an Adaptive Card to LZ via existing Graph chat sender (reuse — do NOT invent). Idempotent per `(checkId, triggeredBy)` per 30 min so retries don't spam. Telemetry `Reporting.Readiness.Escalation.{Sent,Suppressed,Failed}`. |
| D3 | Remediate hook | [src/tabs/Reporting/useReadinessRemediate.ts](../../src/tabs/Reporting/useReadinessRemediate.ts) (NEW) | `useReadinessRemediate(checkId)` → `{ run, status, attempt, fromValue, toValue, error }`. Wraps POST + holds previous `measured` for the morph. |
| D4 | Value morph component | [src/tabs/Reporting/ValueMorph.tsx](../../src/tabs/Reporting/ValueMorph.tsx) (NEW) | `<ValueMorph from={old} to={new} format={fmtCurrency} durationMs={600} />`. Counts up/down with ease-out, fades drift indicator out as it lands. No layout shift — reserves max width up-front. Respects `prefers-reduced-motion` (instant swap). |
| D5 | Wire remedy into gate | [src/tabs/Reporting/ReportingReadinessGate.tsx](../../src/tabs/Reporting/ReportingReadinessGate.tsx) (extend) | When `collectedMtd` is `blocked`: render subtle ghost-button "Sync now" inline with the tile (accent underline, no big CTA). On click: call hook, swap drift figure for `<ValueMorph>`. Toast on resolved. Lock to one in-flight remedy at a time. |
| D6 | Escalated state UI | ReportingReadinessGate.tsx | After 2 failed attempts: tile hardens to `blocked`, message becomes *"Access paused — Luke notified"*, button replaced by "View in Teams" deep-link. No retry until either snapshot age renews or LZ clears the escalation lock (manual `POST /api/reporting/management-readiness/clear-escalation` admin route). |
| D7 | Telemetry | reportingReadiness.js | `Reporting.Readiness.Remediate.{Started,Resolved,Persisted,Failed}` with `checkId`, `attempt`, `triggeredBy`, `driftBefore`, `driftAfter`, `durationMs`. Metric `Reporting.Readiness.Remediate.Duration` dim `checkId`. |

**Outcome contract (single user click):**

| Outcome | Server result | UI |
|---|---|---|
| **Resolved** (drift now within threshold after sync) | `{ check.status: 'ok', attempt: 1, escalated: false }` | Value morphs old → new, drift indicator fades, green toast "Collected MTD reconciled — drift £X → £Y". Gate flips ready → MD opens. |
| **Persisted** (sync ran, drift remains) on attempt 1 | `{ check.status: 'blocked', attempt: 1, escalated: false }` | Tile re-renders, attempts counter visible ("1/2"), button label becomes "Try once more". |
| **Persisted** on attempt 2 | `{ check.status: 'blocked', attempt: 2, escalated: true }` | Tile hardens, button replaced by "View in Teams". Toast: "Drift persists — Luke notified". |
| **Sync failed** (Clio error / timeout) on either attempt | `{ check.status: 'unknown', attempt: n, escalated: n>=2 }` | Same hardened state on attempt 2; message: "Sync failed — Luke notified". |

**Phase D acceptance:**
- Ghost "Sync now" appears only on `collectedMtd` blocked state (Phase D1 scope).
- Single click: drift value morphs in place ≤ 1 s after sync completes; layout does not shift.
- Two failed remedies fire exactly **one** Adaptive Card to LZ (verify suppression suppresses third concurrent click).
- App Insights shows full `Remediate.Started` → `Resolved`/`Persisted`/`Failed` chain with attempt numbers.
- `prefers-reduced-motion` skips the morph (instant swap).
---

## 4. Critical moving parts (the inventory the gate enforces)

| # | Check id | Source of truth | Method | Class | Stale threshold |
|---|---|---|---|---|---|
| 1 | `collectedMtd` | Clio bills/payments | Clio summary call vs SQL aggregate | **Blocking** | drift > £500 OR > 1% |
| 2 | `wipWtd` | Clio activities | Existing `wipClioCurrentWeek` vs `wipDbCurrentWeek`, formalised | **Blocking** | drift > £500 OR > 1% |
| 3 | `enquiriesFresh` | `enquiries` SQL | max(`Touchpoint_Date`) vs now | **Blocking** | > 90 min business hours, > 6 h overnight |
| 4 | `mattersFresh` | `matters` SQL | max(matter sync stamp) vs now | **Blocking** | > 90 min business hours |
| 5 | `dataOpsScheduler` | `dataOpsLog` (just shipped) | Last successful Hot tier per entity within cadence | **Blocking** | last hot run > 2× cadence, or last = error |
| 6 | `teamData` | team table | row count + last sync | **Warn** | > 24 h |
| 7 | `userData` | auth context | loaded + initials resolved | **Warn** | n/a |
| 8 | `annualLeave` | AL table | last refresh | **Warn** | > 24 h |

Blocking = no MD entry. Warn = banner only.

---

## 5. Failure modes (explicit handling)

| Failure | Behaviour |
|---|---|
| Readiness route 5xx | Gate shows `unknown` strip with retry. Does NOT hard-block (cannot gate on our own outage). MD opens with banner: "Trust checks unavailable — proceed with care." Audited. |
| Single Clio check timeout | Tile = `unknown` + reason. Others continue. Overall = `warn` if it's the only failure. |
| Clio 429 | Last cached value with stale age. If cached age > 10 min, downgrade to `warn`. |
| Drift detected (real blocking case) | Gate stays red. Reason copy includes drift figure. Deep-link to Reconciliation. |
| Non-admin + blocked | No `Proceed anyway`. Only `Retry` and `Open Reconciliation`. |
| Admin override | Audit event + persistent red rail in MD. |

---

## 6. Step-by-step execution order

1. **A1+A2+A3+A4** — server endpoint, helpers, types, registration. One PR.
2. **A5** — telemetry verification in staging for 24 h with `HELIX_TRUST_GATE_READ_ONLY=1`.
3. **B1+B2** — gate UI **visible to all users from day one** (dev preview lock dropped: the gate IS the answer to the Clio-vs-Hub mismatch problem; hiding it would defeat the purpose). Verify against deliberately-staled data.
4. **C1+C2** — trust rail + degradation veil.
5. **D1–D7** — remediation loop, starting with `collectedMtd` only. Other checks remain detect-only until each gains a remediator.
6. Promote dev-preview → admin → all MD viewers (one week per stage).
7. Changelog entry per phase.

---

## 7. Verification checklist

**Phase A:**
- [ ] `curl /api/reporting/management-readiness` returns full payload with all 8 checks.
- [ ] Warm-cache latency < 1.5 s.
- [ ] App Insights: `Reporting.Readiness.Overall.*` event per call, `Reporting.Readiness.Check.Duration` metric per check.
- [ ] Manually clearing recent `dataOpsLog` rows flips `dataOpsScheduler` to `blocked`.

**Phase B:**
- [ ] Management hero in dev preview mounts gate, tiles animate.
- [ ] All-green path enables CTA in < 2 s on warm cache.
- [ ] Forced-blocked path prevents entry and surfaces correct reason copy.
- [ ] Admin override records `Reporting.Readiness.OverrideUsed`.

**Phase C:**
- [ ] Rail renders at top of MD with ticking ages.
- [ ] Mid-session degradation veils KPIs without unmounting.

---

## 8. Open decisions (defaults proposed)

1. **Drift thresholds** — Default: **£500 / 1%** on collected and WIP. Rationale: catches the £53k Alex Cook case comfortably; tighter (£100 / 0.5%) risks noisy gates from rounding. User may want tighter — confirm before A2.
2. **Admin override** — Default: **allowed for `isAdminUser()`**, audited. Rationale: ops needs an escape hatch when Clio is degraded but firm needs the dashboard. Alternative: no override, force ops to fix first.
3. **Enquiries/matters watermark column** — Default: **`Touchpoint_Date` for enquiries, matter `OpenDate`/sync stamp for matters**. Confirm against schema reference before A1; if a `LastSyncedAt` column exists prefer that.
4. **Phase 1 data delivery** — Default: **poll-on-mount + manual retry + 5-min auto refresh in MD**. SSE deferred to phase 2.

---

## 9. Out of scope

- **Automatic** resync on drift detection — the remedy is always **user-initiated** (Phase D). The system never silently re-fetches and reconciles without a human click; this preserves the audit trail and avoids hiding source-of-truth drift.
- Remediators for checks other than `collectedMtd` in Phase D — added per-check later, each one its own small extension.
- Changes to reporting maths or KPI definitions.
- Replacing the persisted scheduler history surfacing in Data Hub (stays as diagnostic view).
- Gating non-Management report cards (phase 2 candidate).
- New design tokens — reuse existing `green`/`orange`/`cta`/`subtleGrey` and `feedDotReady`/`fadeInUp` keyframes.

---

## 10. File index (single source of truth)

Client (NEW unless noted):
- [src/tabs/Reporting/ReportingReadinessGate.tsx](../../src/tabs/Reporting/ReportingReadinessGate.tsx) — entry strip + remediate UI (Phase D)
- [src/tabs/Reporting/ManagementDashboardTrustRail.tsx](../../src/tabs/Reporting/ManagementDashboardTrustRail.tsx) — persistent rail
- [src/tabs/Reporting/readiness.types.ts](../../src/tabs/Reporting/readiness.types.ts) — shared types
- [src/tabs/Reporting/useReadinessRemediate.ts](../../src/tabs/Reporting/useReadinessRemediate.ts) — Phase D hook
- [src/tabs/Reporting/ValueMorph.tsx](../../src/tabs/Reporting/ValueMorph.tsx) — Phase D in-place value tween
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) — modify hero card
- [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx) — mount rail + veil

Server (NEW unless noted):
- [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js) — readiness route + remediate route (Phase D)
- [server/utils/clioSummary.js](../../server/utils/clioSummary.js) — lightweight Clio summary helpers (deferred — Phase A reuses cached reconciliation snapshot instead)
- [server/utils/teamsEscalation.js](../../server/utils/teamsEscalation.js) — Phase D Adaptive Card escalation helper (reuses existing Graph sender)
- [server/index.js](../../server/index.js) — register route

Untouched (deliberately):
- [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) — reconciliation panel becomes deep-link target only
- [src/tabs/Reporting/SyncHistory.tsx](../../src/tabs/Reporting/SyncHistory.tsx)
- [server/routes/reporting.js](../../server/routes/reporting.js), [server/routes/reporting-stream.js](../../server/routes/reporting-stream.js), [server/routes/dataOperations.js](../../server/routes/dataOperations.js)

Logs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: management-dashboard-trust-gate
verified: 2026-04-29
branch: main
touches:
  client:
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/ManagementDashboard.tsx
    - src/tabs/Reporting/ReportingReadinessGate.tsx
    - src/tabs/Reporting/ManagementDashboardTrustRail.tsx
    - src/tabs/Reporting/readiness.types.ts
  server:
    - server/routes/reportingReadiness.js
    - server/utils/clioSummary.js
    - server/utils/teamsEscalation.js
    - server/index.js
  submodules: []
depends_on: []
coordinates_with:
  - clio-token-refresh-shared-primitive
  - clio-token-refresh-architecture-audit
  - realtime-delta-merge-upgrade
  - retire-helix-keys-proxy-and-add-form-route-preflight
conflicts_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - clio-webhook-reconciliation-and-selective-rollout
  - forms-preflight-matrix-in-activity-tab
  - realtime-multi-replica-safety
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
```

---

## 11. Gotchas appendix

- **`wipClioCurrentWeek` is the only existing source-side parity check.** Copy its shape for `collectedMtd` — same Clio summary technique, same merge pattern. Do NOT invent a new pattern.
- **Sync success ≠ parity.** The just-shipped persisted scheduler history (`dataOpsLog`) confirms a sync ran; it does NOT confirm the result matches Clio now. Both checks are needed (`dataOpsScheduler` + `collectedMtd`/`wipWtd`).
- **Don't gate on the gate.** If `/management-readiness` itself 5xx's, MD must open with a degraded banner — never trap users behind our own outage.
- **Cache before Clio.** 60 s in-memory cache + per-check 4 s timeout is non-negotiable. Without it, a Clio rate-limit makes the dashboard unopenable.
- **Reuse `feedDotReady` / `fadeInUp`.** Already in `ReportingHome.tsx`. The "settling" animation the user described maps directly to these.
- **NOT in `DataCentre.tsx`.** That's the diagnostic surface (just shipped). The trust gate is the preventative surface — separate file, separate mental model.
- **Admin override audit is mandatory.** If the override exists without an audit trail, it becomes a silent bypass. `Reporting.Readiness.OverrideUsed` is the contract.
- **Remedy is always user-initiated (Phase D).** Never auto-trigger a sync from the readiness route. The click is the audit event. Without it, drift can be silently masked by background re-fetches.
- **Two attempts then escalate.** Hard ceiling. Three would just feel broken. Counter is per `(user, checkId)` with 30-min TTL — long enough to prevent reload abuse, short enough that LZ clearing the escalation isn't required for normal recovery.
- **Teams escalation must be idempotent.** Reuse the existing Graph chat sender; suppress duplicate cards within 30 min for the same `(checkId, triggeredBy)`. Spamming LZ destroys the signal.
- **Value morph reserves width up-front.** Otherwise the surrounding tile re-flows mid-tween. Measure the longer of `from`/`to` formatted strings, lock min-width, then animate. `prefers-reduced-motion` → instant swap, no animation.
- **Phase D depends on Phase B.** The morph and ghost-button live inside the gate strip. Don't try to ship D without B's gate component existing first.
- **Phase A intentionally does NOT call Clio live.** It reads from the cached reconciliation snapshot. The original brief proposed `clioSummary.js`; investigation showed Clio reports are 30–60 s polled flows unsuitable for a 1.5 s gate. Live pressure-tests are revisited in Phase D as part of the remedy (the post-sync re-evaluation), not as a per-load probe.
- **Drift thresholds are tunable but the comparison maths must be locked.** Compare current fiscal month (collected) and current week Mon-Sun (WIP) — same windows the dashboard renders. Mismatched windows = false positives.
- **`server/index.js` registration line** clashes with 7 other stashed briefs. Just route registration — coordinate, don't conflict. If those ship first, follow their pattern; if this ships first, leave a clear marker.
