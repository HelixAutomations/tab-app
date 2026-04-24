# Home animation order and demo-insert fidelity

> **Purpose.** Self-contained brief. Sets out how to make Home's animation choreography feel intentional now that the data layer is fast, AND how to make toggling demo mode produce a genuine "new event landed" feel rather than a silent re-render.
>
> **Verified:** 2026-04-19 against `main`. Re-verify refs if picked up >30 days later.

---

## 1. Why this exists (user intent)

User verbatim (2026-04-19):

> *"when i turn on demo mode, i dont get any of that new insertion of new events ie demo prospect/matter in the boxes, it all just retriggers. please investigate this and them also consider a more thoughtful order of animations and things in the home page now that we have reall optimised the data flow and performance efficiencies. do this next."*

Two linked problems:

**Problem 1 — demo-insert fidelity.** Toggling demo mode on should feel like a fresh prospect/matter "landing" in the tiles (slide-in, pulse, freshness marker). Today it's a re-render: the `recentMatters` useMemo in Home.tsx re-computes and the demo row appears, but with no entry animation and no freshness marker distinguishing it from the rest of the list. KPI cards have a sessionStorage guard (`home_metric_animated_<title>`) that prevents entry-animation replay — so the cards neither re-animate nor show the injected item as "new".

**Problem 2 — animation choreography.** The Home page has many animated tiles (hero, KPI cluster, matters, immediate actions, ancillary boxes, activity feed, etc.) and each handles its own entrance animation independently. With the data layer now fast (skeleton-on-enquiries, deferred fetches, InstructionsInboxCard, etc.), there's scope to choreograph a more thoughtful sequence rather than having everything fade-in roughly at once. The user wants the premium feel to match the snappy data.

A quick-win patch was shipped on 2026-04-19 so that toggling demo mode on fires `demoRealtimePulse` + the four `helix:*Changed` CustomEvents. This drives the existing staggered pulse wave across tiles. It's a cosmetic cue — not a full solution. The full solution is below.

---

## 2. Current state — verified findings

### 2.1 Demo-mode activation flow

- [src/app/App.tsx](../../src/app/App.tsx) L1061 `dispatchDemoModeActivation` — as of 2026-04-19 dispatches `selectTestEnquiry` (100ms delay) then `demoRealtimePulse` + `helix:enquiriesChanged` + `helix:mattersChanged` + `helix:outstandingBalancesChanged` + `helix:opsQueueChanged` (200ms delay).
- L1069 `handleShowTestEnquiry` — sets localStorage + state, conditionally dispatches.
- L1084 `handleToggleDemoMode` — routes ON through `handleShowTestEnquiry`, OFF just clears state.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) L3110 `ensureDemoEnquiryPresent` — injects three demo enquiries (DEMO-ENQ-0001/0002/0003) into `displayEnquiries`, `allEnquiries`, `teamWideEnquiries`, plus enrichment map.
- L3326 `handleSelectTestEnquiry` listener — runs `ensureDemoEnquiryPresent` + shows `DemoOverlay` for 2.6s.

### 2.2 Home demo matter injection

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L1963 `demoModeActive` useMemo — checks prop `demoModeEnabled` OR localStorage `demoModeEnabled`.
- L1971–2077 `recentMatters` useMemo — when demo active AND no existing demo matter in list, injects:
  ```
  matterId: 'DEMO-3311402'
  displayNumber: 'HELIX01-01'
  clientName: 'Helix administration'
  practiceArea: 'Commercial'
  openDate: today
  ```
- **Gap:** no `data-fresh` attribute, no entry-animation replay, no freshness set tracking this row.

### 2.3 Pulse nonces (already wired)

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L1203–1219 — state for `dataOpsPulseNonce`, `opsQueuePulseNonce`, `outstandingBalancesPulseNonce`, `mattersPulseNonce`, `docWorkspacePulseNonce`, `enquiriesPulseNonce`, `annualLeavePulseNonce`, `attendanceRealtimePulseNonce`, `futureBookingsRealtimePulse`.
- L2360 `demoRealtimePulse` listener — staggers all nonce bumps 120ms apart.
- Each nonce-consuming tile flashes a glow/pulse ring when the nonce changes. **This is cosmetic** — it does NOT mark list rows as fresh, does NOT re-animate list entries.

### 2.4 MetricCard animation guard

- [src/tabs/home/MetricCard.tsx](../../src/tabs/home/MetricCard.tsx) L296–306 — `sessionStorage.getItem('home_metric_animated_${title}')`. Once animated, never replays unless sessionStorage cleared.
- Consequence: toggling demo mode does not re-animate KPI card entry.

### 2.5 Freshness pattern available but not used on Home

- [src/hooks/useFreshIds.ts](../../src/hooks/useFreshIds.ts) — detects newly-appeared IDs vs previous render, marks fresh for N ms.
- Used in: Roadmap `UnifiedStream`, `SessionTraceSection`, `FormsStreamPanel`, `ErrorStreamSection`. Drives a pulse CSS animation on the specific row.
- **Not used in any Home tile.** Home tiles rely on first-mount CSS animations only.

### 2.6 Tile entrance animation pattern today

Most Home tiles use a fade/slide-in CSS animation with an `animation-delay` offset based on tile position. These only run once per mount. There's no global choreography coordinator — each tile hard-codes its own delay.

There's also `homeBootEvent` (L1332) dispatched once on first Home mount, which some consumers listen to.

---

## 3. Plan

### Phase A — demo-insert fidelity (the concrete fix)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add a `freshMatterIds` set in Home, feed it when `demoModeActive` flips true | [Home.tsx](../../src/tabs/home/Home.tsx) near L1963 | Track transition from false→true; when it flips, populate set with `['DEMO-3311402']` for ~3s then auto-clear. |
| A2 | Apply `data-fresh` attribute to the demo matter row | [Home.tsx](../../src/tabs/home/Home.tsx) recent matters render | Use a small CSS class `home-matter-row--fresh` with a slide-in-from-left + brief teal glow pulse. Reuse the freshness pulse keyframes used by Roadmap `SessionTraceSection`. |
| A3 | Same pattern on the enquiry list | [Home.tsx](../../src/tabs/home/Home.tsx) immediate-actions/recent-enquiries render | Track the DEMO-ENQ-0001/0002/0003 ids in a freshness set; apply `data-fresh` to their rows when demo just activated. |
| A4 | Clear MetricCard `sessionStorage` guards on demo toggle so KPI cards re-animate | [Home.tsx](../../src/tabs/home/Home.tsx) demo-active transition effect | On `demoModeActive` false→true (and also on an explicit `replayHomeAnimations` event if we keep it), walk sessionStorage and remove keys matching `home_metric_animated_`. |
| A5 | Introduce a single `demoJustActivated` nonce — bump on demo on/off transitions | [Home.tsx](../../src/tabs/home/Home.tsx) | Consumers (MetricCard, matter rows, enquiry rows) take a prop and re-animate when it changes. |

**Phase A acceptance:**
- [ ] Toggle demo on from any tab → navigate to Home → see demo matter slide in with a brief teal pulse, distinct from other rows.
- [ ] KPI cards re-animate on demo toggle (one-off, not every render).
- [ ] Enquiries tab — demo enquiries arrive with freshness pulse on the list rows.
- [ ] Existing real-time pulse wave from 2026-04-19 patch still runs (overlay glow on tiles).
- [ ] No flicker on subsequent non-demo renders (freshness auto-clears after ~3s).

### Phase B — animation choreography (the premium-feel pass)

#### B1. Define the choreography order

Target sequence for first Home mount (data arrives fast now, so stagger short):

1. **Hero greeting + QuickActionsBar** — 0 ms
2. **KPI cluster** (MetricCards) — 80 ms, stagger 40 ms per card
3. **Matters tile + Immediate actions tile** — 220 ms, parallel
4. **Secondary row** (Outstanding balances, Ops queue, Doc workspace) — 340 ms, stagger 60 ms
5. **Tertiary row** (Attendance, Annual leave, Future bookings) — 460 ms, stagger 60 ms
6. **Activity feed** — 600 ms (after everything else settled)

Rationale: user's eye should move from greeting → numbers → primary workload → secondary metrics → peripheral context.

#### B2. Centralise the delays

Create `src/tabs/home/animationOrder.ts` exporting an `ANIMATION_DELAYS` object. Each tile imports its delay rather than hard-coding. Single source of truth; easy to re-tune.

#### B3. One-off boot vs re-animate signal

- First mount = use `ANIMATION_DELAYS` for choreography.
- On `demoJustActivated` nonce change = re-run the sequence with half the delays (snappier). 
- On tab switch back to Home (already mounted) = no re-animation. Mount state persists.

#### B4. Respect `prefers-reduced-motion`

Tile animations already fade; keep that fallback intact.

Phase B files:
- [Home.tsx](../../src/tabs/home/Home.tsx) — wire centralised delays.
- `src/tabs/home/animationOrder.ts` (NEW) — single source of truth for delays.
- Individual tile components (MetricCard, matters tile, immediate-actions tile, etc.) — accept an `animationDelayMs` prop instead of hard-coding.

### Phase C — extras (optional, only if time)

- Convert the demo-insert slide-in into a view-transitions API animation where supported (progressive enhancement).
- Add a tiny `aria-live="polite"` announcement when demo activates so screen readers hear "Demo prospect added to your pipeline".

### Phase D — Home shell propagation investigation

User-observed symptom (2026-04-21): even after the carve-up + memo work on `OperationsDashboard`, transitions into the Home shell still feel like the dashboard "settles" rather than arrives. Hypothesis: the outer `.home-stable-shell` container loses its layout/paint isolation under certain mounts, causing the shell itself to redraw when child sections mount.

Investigate, in order:

1. **Confirm `.home-stable-shell { contain: layout paint }` is set in production CSS** and not being overridden by a more-specific selector. Use Chrome DevTools "Computed" tab on the live shell.
2. **`LivePulse` key-remount audit** — if the pulse component remounts (key change) on every Home enter, it cascades a paint up the tree. Verify the key is stable across navigations.
3. **Suspense boundary placement** — the dashboard appears to be inside a single Suspense boundary; consider per-section boundaries so individual lazy chunks don't fall back to the parent fallback (which causes a full shell repaint).
4. **`.home-stable-shell-dashboard { min-height: 700px }`** — confirm this reservation is still correct after the carve-up. If sections render shorter than the reservation, scrollbar / page chrome can re-layout once the real content arrives.
5. **Repeat the React Profiler test** described in Phase B of `operationsdashboard-carve-up-by-section` while navigating Home → Matters → Home; capture the render of each shell wrapper, not just the sections.

This phase is intentionally exploratory — the deliverable is a written diagnosis (added back into this brief or as a follow-up brief if it grows), not necessarily code. Coordinates closely with `operationsdashboard-carve-up-by-section` (Phase B) and `home-skeletons-aligned-cascade`.

---

## 4. Execution order

1. A1+A2+A3 — freshness set + data-fresh attribute on matters and enquiries.
2. A4+A5 — sessionStorage clear + demoJustActivated nonce wiring.
3. CSS — add `home-matter-row--fresh` keyframes matching existing SessionTrace pulse.
4. *ship Phase A, changelog.*
5. B2 — create `animationOrder.ts`.
6. B1 — wire tiles to import delays.
7. B3 — re-animate signal on demoJustActivated.
8. *ship Phase B, changelog.*
9. C — optional polish.

---

## 5. Verification checklist

**Phase A:**
- [ ] Demo ON → injected rows visibly slide/pulse in, distinct from surrounding rows.
- [ ] KPI cards re-animate once.
- [ ] No flicker after freshness window (3s).
- [ ] Demo OFF → injected rows removed cleanly, no ghost animation.

**Phase B:**
- [ ] First Home mount feels choreographed — hero → KPI → primary → secondary → tertiary → feed.
- [ ] No element animates into an unstable layout (geometry reserved early).
- [ ] `prefers-reduced-motion: reduce` → no animation, just fade.
- [ ] Toggling tabs away and back does NOT re-run entrance animations.
- [ ] `animationOrder.ts` is the only place delays are defined.

---

## 6. Open decisions (defaults proposed)

1. **Freshness window duration** — Default: **3000 ms**. Long enough to notice, short enough to not linger.
2. **Fresh-row visual** — Default: **reuse SessionTrace pulse keyframes** (teal `#87F3F3` glow + slide from left). Don't invent new keyframes.
3. **Re-animate on toggle OFF too?** — Default: **No**. Only on ON transition — avoids distracting animation when turning demo off.
4. **Choreography timing** — Default: **the ladder in B1**. Tunable later.
5. **Centralised vs per-tile delays** — Default: **centralised** via `animationOrder.ts`.

---

## 7. Out of scope

- Activity feed tile internals (has its own freshness via realtime channels).
- Re-architecting the real-time channel plumbing.
- Non-Home tabs animation (Enquiries has its own freshness work).
- Replacing the CSS animation system with a JS framework (Framer Motion etc.).
- Accessibility audit of the full Home tab (separate brief).

---

## 8. File index

Client:
- [src/app/App.tsx](../../src/app/App.tsx) — demo activation flow (already patched 2026-04-19).
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — primary file for all Phase A + B changes.
- [src/tabs/home/MetricCard.tsx](../../src/tabs/home/MetricCard.tsx) — sessionStorage guard (A4), accept `animationDelayMs` prop (B1).
- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) — part of choreography (B1).
- [src/tabs/home/animationOrder.ts](../../src/tabs/home/animationOrder.ts) — NEW, single source of truth for delays (B2).
- [src/hooks/useFreshIds.ts](../../src/hooks/useFreshIds.ts) — reuse pattern or hook directly.
- [src/tabs/roadmap/parts/SessionTraceSection.tsx](../../src/tabs/roadmap/parts/SessionTraceSection.tsx) — reference for freshness pulse CSS.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — no Home change, but demo-insert fidelity for enquiries tab belongs in A3 scope.

Server: none.

Docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata

```yaml
id: home-animation-order-and-demo-insert-fidelity
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/tabs/home/MetricCard.tsx
    - src/tabs/home/QuickActionsBar.tsx
    - src/tabs/home/animationOrder.ts
    - src/tabs/enquiries/Enquiries.tsx
    - src/app/App.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - demo-mode-hardening-production-presentable-end-to-end
  - ccl-backend-chain-silent-autopilot-service
  - enquiries-live-feed-freshness-wiring
  - realtime-delta-merge-upgrade
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - ux-realtime-navigation-programme
  - home-skeletons-aligned-cascade
conflicts_with: []
```

---

## 9. Gotchas

- The 2026-04-19 quick-win in `dispatchDemoModeActivation` already dispatches `demoRealtimePulse` + four `helix:*Changed` events. Phase A must NOT double-fire them — build on the existing dispatch, add freshness-ID tracking on top.
- MetricCard's `sessionStorage.home_metric_animated_<title>` guard exists because cards were RE-animating on every re-render (real bug). Don't remove the guard — just clear relevant keys on demo toggle.
- `recentMatters` useMemo in Home (L1971) injects the demo matter as derived state. Don't mutate the input arrays — keep the injection in the memo, pair it with a separate `freshMatterIds` state that tracks transition.
- The `useFreshIds` hook compares previous render's IDs vs current. On *first* render the prev set is empty → everything looks fresh. Guard against first-mount false-positive by initialising with current IDs OR by only flagging fresh after demo toggles.
- `DemoOverlay` in Enquiries.tsx L3331 already shows a 2.6s toast when demo activates. Don't add a second toast on Home — use the list-row pulse instead for visual confirmation.
- `homeBootEvent` is dispatched once on first mount and consumed by some sub-components. Don't re-fire it on demo toggle — add `demoJustActivated` as its own signal.
- CSS animations inside Home respect `prefers-reduced-motion` at the file level via `@media (prefers-reduced-motion: reduce)` media queries. New keyframes must also.
- Layout jank warning — freshness glow must be box-shadow / pseudo-element, NOT an outline that shifts layout. Test with rows at the top vs bottom of the list.
