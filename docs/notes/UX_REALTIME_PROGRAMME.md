# UX Realtime Programme — Live Tracker

**Status:** Phase 0 in flight · **Brief:** [docs/notes/UX_REALTIME_NAVIGATION_PROGRAMME.md](./UX_REALTIME_NAVIGATION_PROGRAMME.md)

This is the live execution doc for the multi-phase UX/navigation overhaul. Update it after every PR. The brief defines *what* and *why*; this file tracks *what shipped, when, and what we measured*.

> The overlay (`?ux-debug=1` for LZ/AC) is the source of truth for in-flight measurements. Application Insights query: `customEvents | where name startswith "Client.UX." | summarize p50=percentile(toint(customMeasurements.durationMs),50), p95=percentile(toint(customMeasurements.durationMs),95), n=count() by name`.

---

## Phase Status

| Phase | Title | Status | Date | Notes |
|-------|-------|--------|------|-------|
| 0 | Instrumentation + tracker | � Shipped | 2026-04-19 | `interactionTracker` + `DebugLatencyOverlay` + `TabMountMeter` |
| 0.1 | Round 1 — per-tab mount metrics | 🟢 Shipped | 2026-04-19 | All 7 top-level tabs emit `nav.tabMount.{name}` || 0.2 | Round 2 — hydration metrics | 🟢 Shipped | 2026-04-19 | `useFirstHydration` + `hydrate.stream.{name}` in streaming hook || 1 | Cursor & motion layer | ⚪ Not started | — | — |
| 2 | Render discipline + hydration metrics | 🟡 Promoted | 2026-04-19 | Now top priority — baseline shows nav primitive is fast, hydration is slow |
| 3 | Bespoke navigation | ⚪ Not started | — | — |
| 4 | Polish & retire scaffolding | ⚪ Not started | — | — |

Legend: ⚪ not started · 🟡 in progress · 🟢 shipped · 🔴 blocked

---

## Phase 0 — Instrumentation + tracker

**Goal:** Establish ground truth on perceived latency so every later change has a numerical before/after.

### Shipped (this PR)
- [x] `src/utils/interactionTracker.ts` — `startInteraction`/`measureInteraction` with ring buffer + subscribers + stats.
- [x] `src/components/DebugLatencyOverlay.tsx` — bottom-right pill, last 3 + p95, expand for per-name p50/p95, dismiss-for-session, gated by `canSeePrivateHubControls()`.
- [x] `src/app/App.tsx` — `activateTab` now wraps `setActiveTab` with `nav.tabSwitch` measurement (ends after second rAF). Overlay mounted next to `HubToolsChip`.
- [x] Telemetry pipeline reuse: events flow through existing `/api/telemetry` → App Insights as `Client.UX.{name}` + `Client.UX.{name}.Duration` metric. **No server change required.**

### Pending
- [ ] **Baseline capture** — load app as LZ with `?ux-debug=1`, click through every top-level tab twice, record p50/p95 below.
- [ ] (Optional) Add hover instrumentation in Phase 1 entry — defer until then to avoid scope creep.

### Baseline metrics (capture before any UX change)

**Captured 2026-04-19, local dev (LZ), backend in 502-reconnect state, Chromium via VS Code browser tools.**

| Interaction | Samples | p50 (ms) | p95 (ms) | Max (ms) | Notes |
|-------------|---------|----------|----------|----------|-------|
| `nav.tabSwitch` | 5 | 21 | 71 | 71 | React state flip only — already snappy |
| `nav.tabMount.home` | 1 | 109 | 109 | 109 | Initial chunk + first effect (one-time per session) |
| `nav.tabMount.enquiries` | 1 | 38 | 38 | 38 | Lazy chunk load + first effect (first visit) |
| `nav.tabMount.matters` | 1 | 19 | 19 | 19 | Pre-warmed via keep-alive seed effect |
| `nav.tabMount.forms` | 1 | 42 | 42 | 42 | Mount/unmount tab — fires every visit |
| `nav.tabMount.instructions` | 0 | — | — | — | Not yet visited in baseline run |
| `nav.tabMount.reporting` | 0 | — | — | — | Not yet visited in baseline run |
| `nav.tabMount.roadmap` | 0 | — | — | — | Not yet visited in baseline run |

**Headline finding:** all measurements are well under the 250ms p95 target. The React navigation primitive is not the bottleneck. Perceived lag is downstream of mount: **data hydration** ("Loading matters…" spinners), **SSE settle time**, and **error/reconnect banners** stealing focus.

**Implication for the programme:** Phase 2 (render discipline + hydration metrics) is promoted ahead of Phase 1 (cursor/motion). Cursor polish is meaningless if the user is staring at a spinner.

### Round 2 — hydration baseline (2026-04-19)

Captured live with backend running (Key Vault → Core SQL → Instructions SQL → Clio creds all warmed). Cold reload from `/?ux-debug=1` as LZ.

| Interaction | p50 (ms) | p95 (ms) | Story |
|-------------|----------|----------|-------|
| `nav.tabMount.home` | 107 | 107 | React/chunk only — cheap |
| `hydrate.sse.connected` | 682 | 682 | EventSource handshake to live state |
| `nav.tabMount.matters` | 1212 | 1212 | First paint with real data (heavy useMemo chains) |
| `hydrate.enquiries` | 2333 | 2333 | Enquiries arrives via auth/streaming pipeline |
| `hydrate.matters` | **4141** | **4141** | **Worst offender — 4 seconds before user sees rows** |

**Diagnosis confirmed.** User clicks Home: tab mounts in 107ms, but they stare at "Loading…" for ~4s waiting on matters. The React navigation primitive accounts for <3% of perceived latency. The other 97% is data fetch waterfall.

**Round 3 target:** `hydrate.matters`. Likely culprits to investigate:
1. Sequential vs parallel fetches in the matters pipeline (vnet + legacy + workbench overrides)
2. Whether the matters response is paginated/streamed or single blob
3. Whether `mattersWithClient` `useMemo` chain blocks first paint (sourceMatters → effectiveMatters → mattersWithClient → fallbackCclStatusByMatterId → effectiveCclStatusByMatterId → filtered)
4. Whether `clio-batch-status` POST is on the critical path (it should be deferred)

### Round 3 — parallel matters fetch (2026-04-19)

**Investigation:**
- Server timing: `GET /api/matters-new-space?fullName=...` returns 125 rows / 62KB in **333–356ms** (cold + warm). Network is not the bottleneck.
- Source-traced the fetch path in `src/index.tsx` `primeUserDependentData()` and found the actual cause:
  - For `isDevOwner` users, matters fetch was **chained off `enquiriesRequest.finally()`** AND wrapped in `requestIdleCallback({timeout: 2500})`.
  - Path: user-data → enquiries (2333ms) → `.finally()` → idleCallback (~1450ms slack) → matters fetch (350ms) ≈ **4133ms**, matching observed 4141ms exactly.
- Original justification ("matters is heavy, defer it") no longer applies — server returns matters in 350ms.

**Fix:** Lifted the dev-owner matters fetch out of the enquiries `.finally()` block; now fires in parallel alongside enquiries (same pattern as team-data already uses). Removed the `requestIdleCallback` deferral entirely. Other paths (non-dev-owner) were already parallel and unchanged.

**Live before/after on cold reload:**

| Interaction | Before (Round 2) | After (Round 3) | Delta |
|-------------|------------------|------------------|-------|
| `hydrate.matters` | **4141ms** | **1678ms** | **−2463ms (−59%)** |
| `hydrate.sse.connected` | 682ms | 639ms | ≈ same |

`hydrate.matters` is now bottlenecked by user-data fetch + first React render, not the artificial chain. To go below ~1.5s we'd need to either start matters before user-data resolves (impossible — needs `fullName`) or warm the matters cache from the shell snapshot.

**Round 4 target:** ~~`hydrate.enquiries`~~ → **expanded scope**: instrument every Home section so we can see which one settles last. User feedback: "home page still takes a long time before it settles. and the benches and activityi and operations stuff still takes ages. especially when the servers been running for some time already." This means the lag isn't just enquiries — it's a systemic Home settling problem visible even on warm servers (so not network/cold-cache).

### Round 4 — per-section Home hydration probes (2026-04-19)

**Approach:** Home.tsx already maintains a full boot-monitor status map (`isLoadingAttendance`, `isLoadingAnnualLeave`, `isLoadingWipClio`, `isLoadingEnquiryMetrics`, `isLoadingRecovered`, `isLoadingHomeMatters`, `pendingDocActionsLoading`, plus `outstandingBalancesData`, `futureBookings`, `snippetEdits`, `immediateActionsReady`, `homeDataReady`). Wired a `useFirstHydration` probe to each so we get one metric per section: `hydrate.home.{attendance|annualLeave|wipClio|enquiryMetrics|recoveredFees|matters|outstandingBalances|futureBookings|snippetEdits|pendingDocActions|immediateActions|dataReady}`.

**Measurement protocol** (warm-server, the regime user complained about):
1. Backend already running for a while (Hot tier scheduler has done at least one cycle).
2. Hard refresh the Home tab with `?ux-debug=1`.
3. Wait for everything visible to settle (~15s).
4. Open the latency overlay's per-name view; capture each `hydrate.home.*` p95.

The slowest 1-2 sections are the Round 5 targets. Hypotheses worth checking against the data:
- "Benches" = `futureBookings` (boardroom + soundproof) — comes via SSE stream `useHomeMetricsStream`, so latency = SSE handshake + first emit. Likely high if backend is cold-emitting.
- "Activity" = `immediateActions` — depends on attendance + annualLeave + snippetEdits + pendingDocActions all completing. Will be the max of those.
- "Operations" = `wipClio` + `enquiryMetrics` + `recoveredFees` (the metric tiles row) — each is its own fetch.
- `outstandingBalances` arrives via the same SSE stream as bookings — likely correlated.

**Status:** Probes shipped (Round 4 instrumentation only — no behaviour change). Awaiting warm-server baseline read from the live overlay before picking Round 5 targets.

### Targets (from brief §5)
- `nav.tabSwitch` p95 < 250ms (premium feel) · p99 < 500ms.
- Hover/cursor response < 16ms (60fps) — measured Phase 1.

### Verification
- [ ] Overlay does not render for non-LZ/AC users (test by switching user via `HubToolsChip`).
- [ ] Overlay does not render in Teams production for normal users (gate respected).
- [ ] Telemetry visible in App Insights: `customEvents | where name == "Client.UX.nav.tabSwitch" | take 5` returns rows after a few clicks.
- [ ] No regression to tab-switch behaviour: rapid clicks still feel responsive (no `startTransition` introduced, per `/memories/repo/home-boot-performance.md`).

---

## Phase 1 — Cursor & motion layer (planned)

> Will be filled in when Phase 1 starts. See brief §3.1.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-19 | Reuse existing `/api/telemetry` pipeline rather than adding `trackInteraction` to `appInsights.js` | Pipeline already converts client events to `Client.{source}.{type}` + `.Duration` metric. Zero server change. |
| 2026-04-19 | Measure end of `nav.tabSwitch` after two rAFs | Closest cheap signal for "user sees new tab content" without coupling to specific tab DOM. Will refine in Phase 2 if measurement proves too generous. |
| 2026-04-19 | Overlay opt-in via `?ux-debug=1` OR `localStorage.helixUxDebug=1` | Allows opt-in without URL surgery; auto-shows once interactions are recorded if explicit toggle set. |

---

## Out-of-band notes
- `interactionTracker` is intentionally synchronous and untyped at the boundary (`Record<string, unknown>`); the telemetry sanitiser will redact PII keys.
- If telemetry volume becomes an issue, set `silent: true` on `startInteraction` for high-frequency interactions and rely on the ring + overlay only.
