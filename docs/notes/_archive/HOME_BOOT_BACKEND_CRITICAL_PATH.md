# Home boot backend critical path

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user asked to "run the app and watch the boot" and explain where and why it hangs, then make the data/process flow more thoughtful so section reveal feels intentional. The traced Home boot showed that the visible UI becomes usable well before all backend work completes, but the slow band around attendance, annual leave, and WIP still dominates the first useful reveal.

This brief parks the larger server-side optimisation work so the current session can stay focused on smaller in-scope client fixes. It is not a request to change metric meaning or redesign Home wholesale; it is a request to shorten the backend critical path and align Home’s reveal cadence with the real availability of data.

---

## 2. Current state — verified findings

### 2.1 Local cold boot is serialised before the browser can even render Home

- File: [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs#L274) starts the backend first and waits for port `8080` before starting the frontend.
- File: [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs#L286) then waits separately for port `3000`, which means the local browser cannot start compiling until backend warm-up is already complete.

### 2.2 Home’s client boot contract depends on attendance and WIP

- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L1051) sets `dashboardSectionReady` from `hasStartedParallelFetch && !isLoadingWipClio`.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L1052) sets `teamSectionReady` from `hasStartedParallelFetch && !isLoadingAttendance`.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L1170) sets `immediateActionsReady` from attendance and annual leave readiness.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L1190) only flips `homeDataReady` after both attendance and WIP are finished.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L2715) starts attendance, annual leave, and WIP in parallel on Home boot.

### 2.3 Attendance and annual leave overlap on the server

- File: [server/routes/attendance.js](../../server/routes/attendance.js#L520) serves `/api/attendance/getAttendance` by loading attendance rows, loading the team roster, and also calling `checkAnnualLeave()` to overlay leave status.
- File: [server/routes/attendance.js](../../server/routes/attendance.js#L1175) serves `/api/attendance/getAnnualLeave` by separately loading current leave, future leave, all leave history, team data, and user totals.
- The Home boot therefore hits the leave domain twice on initial load: once indirectly through attendance, and once directly through the annual leave route.

### 2.4 Dev-owner WIP is expensive by design

- File: [server/routes/home-wip.js](../../server/routes/home-wip.js#L581) serves `/api/home-wip/team` for the dev-owner aggregate view.
- File: [server/routes/home-wip.js](../../server/routes/home-wip.js#L604) fetches all team members with Entra and Clio IDs.
- File: [server/routes/home-wip.js](../../server/routes/home-wip.js#L621) fans out per-user WIP fetches in chunks of 8, consulting per-user cache first and then hitting Clio when needed.
- This route can therefore remain the longest boot dependency even after the rest of Home is already visible.

### 2.5 Consequence

- The browser trace showed the useful Home shell and fast metrics appearing quickly, but attendance and annual leave both completed around the same late band, with team WIP landing slightly after. The main opportunity is not more client spinners; it is less duplicated server work and better pre-warming of expensive aggregate data.

---

## 3. Plan

### Phase A — Remove duplicated leave work from the critical path

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Define the minimum Home attendance payload | [server/routes/attendance.js](../../server/routes/attendance.js) | Decide what `/getAttendance` must return for Home versus what can remain in the dedicated annual leave route. |
| A2 | Reuse leave data instead of querying it twice | [server/routes/attendance.js](../../server/routes/attendance.js) | Make attendance consume the already-cached annual leave snapshot or fold the active leave overlay into a shared fetch path. |
| A3 | Keep Home’s client contract intact | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | Preserve current client state shape while the server contract is tightened underneath it. |

**Phase A acceptance:**
- Home no longer pays for two separate leave-domain fetch paths during first boot.
- Attendance and annual leave still populate the existing client state shape.

### Phase B — Pre-warm or soften the team WIP dependency

#### B1. Pre-warm team aggregate WIP

Use a scheduled or event-driven refresh so `/api/home-wip/team` is usually a cache hit for the dev-owner view instead of a fresh Clio fan-out during first Home load.

#### B2. Relax reveal dependence where appropriate

If team WIP is still the slowest source after pre-warm, revisit whether the main dashboard reveal should wait on it, or whether the shell should reveal with a clearly-marked progressive billing update.

---

## 4. Step-by-step execution order

1. **A1** — measure the exact overlap between `/getAttendance` and `/getAnnualLeave` using current telemetry or local timing logs.
2. **A2** — refactor the leave lookup so attendance does not independently re-query active leave during Home boot.
3. **A3** — validate Home still renders the team panel and immediate actions correctly.
4. **B1** — pre-warm team aggregate WIP or widen the cache/preload strategy.
5. **B2** — reassess Home reveal thresholds after server-side wins land.

---

## 5. Verification checklist

**Phase A:**
- [ ] Home attendance + annual leave boot time drops relative to the traced baseline.
- [ ] Home still shows correct attendance statuses, leave badges, and immediate actions.

**Phase B:**
- [ ] Dev-owner Home reaches usable billing state without waiting on a cold team-wide Clio fan-out in the common case.
- [ ] App Insights events/metrics are emitted for any new pre-warm or consolidated fetch path.
- [ ] `logs/changelog.md` records the shipped optimisation phase.

---

## 6. Open decisions (defaults proposed)

1. **Where to consolidate leave data** — Default: **keep the consolidation inside `server/routes/attendance.js` first**. Rationale: it already owns both Home attendance and Home annual leave routes.
2. **How to handle team WIP** — Default: **pre-warm the aggregate instead of weakening data quality**. Rationale: the dev-owner view still needs the team-wide number; it should just arrive from cache more often.

---

## 7. Out of scope

- The smaller client-side boot-monitor truthfulness fixes already addressed in the active session.
- Billing skeleton UI alignment.
- General webpack/local-dev frontend compile optimisation beyond noting the serial startup harness.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — Home reveal gates and boot dependencies.

Server:
- [server/routes/attendance.js](../../server/routes/attendance.js) — Home attendance and annual leave handlers plus leave overlay logic.
- [server/routes/home-wip.js](../../server/routes/home-wip.js) — individual and team aggregate Home WIP endpoints.

Scripts / docs:
- [tools/dev-all-with-logs.mjs](../../tools/dev-all-with-logs.mjs) — local startup harness showing the serial backend-then-frontend cold boot.
- [logs/changelog.md](../../logs/changelog.md) — entry per shipped phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: home-boot-backend-critical-path
shipped: true
shipped_on: 2026-04-19
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
  server:
    - server/routes/attendance.js
    - server/routes/home-wip.js
  submodules: []
depends_on: []
coordinates_with:
  - home-billing-skeleton-contract
conflicts_with: []
```

---

## 9. Gotchas appendix

- [server/routes/attendance.js](../../server/routes/attendance.js#L520) already has layered caching and a small in-memory fast path, so avoid adding a second overlapping cache without first simplifying the existing path.
- [server/routes/home-wip.js](../../server/routes/home-wip.js#L621) deliberately reuses per-user cache during team aggregation; preserve that de-duplication if you restructure the aggregate fetch.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L2715) already expects the current payload shapes, so any server consolidation should aim for compatibility first and only change the client contract when the backend win is proven.
