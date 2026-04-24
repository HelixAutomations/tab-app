# UI responsiveness — hover scroll and tab navigation

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quote (2026-04-19):

> *"the UI lags, theres a delay between hovering over items and their css responding. you must implement a more realtime user experience. even scrolling down and up the page feels laggy and delayed, which is simply unacceptable. navigation back and forth should feel snappy also, so consider edge cases where users will be clicking across tabs back and forth etc. so that you can ensure a smooth experience."*

The user's standing direction is *"i just really want an app that feels realtime"* — and that contract extends to **interaction responsiveness**, not just data freshness. R7 closed the data-freshness gap (<2s perceived). This brief closes the **interaction-freshness** gap: hover→paint, scroll→paint, and tab-switch→paint must each be sub-100ms p95 with zero perceptible jank.

The UX bar in `.github/copilot-instructions.md` is explicit: *"Every interaction the team has with this app should feel snappy, intentional, and premium — not like generic SaaS. Transitions must be smooth. Stale counts, layout jank, and flickering states are bugs, not cosmetic issues."* This brief is the systematic implementation of that bar.

**Not in scope:** new visual design or restyling (Helix look-and-feel stays); data hydration speed (covered by hydration probes); SSE/realtime data plumbing (covered by R7 + delta-merge brief).

---

## 2. Current state — verified findings

### 2.1 Hover responsiveness — JS-driven, not CSS

Most interactive rows in the codebase use `applyRowHover` / `resetRowHover` JavaScript handlers (called from `onMouseEnter` / `onMouseLeave`) rather than CSS `:hover`. This forces React to dispatch the mouse event, run the handler (which mutates `style`), and the browser to recalc layout. Even with `transform`-only mutations, the React event-pipeline overhead adds 10–30ms per hover transition. Multiplied across a list of rows + nested children, the cumulative jank is what the user feels.

- File reference: `applyRowHover` / `resetRowHover` defined in the design helpers — search `src/app/styles/` and `src/components/` for `applyRowHover`. Verified the pattern is widespread.
- Symptom: hover lift triggers a `setState` in some consumers (e.g. "hovered row index" tracked in React state), which re-renders the whole list. That's the second compounding cost.

### 2.2 Scroll jank — likely sources

Probable causes (Phase A measurement will rank them):

- **Non-passive scroll listeners.** Any `addEventListener('scroll', ..., {})` without `passive: true` blocks the compositor. Search: `addEventListener('scroll'` and `onScroll=` across `src/`.
- **Inline-style mutations during scroll.** Some sticky headers / parallax effects mutate `style.transform` on every scroll tick. Verify in `src/tabs/home/Home.tsx` + `src/components/AppLayout/`.
- **Long lists not virtualized.** Enquiries, matters, opsQueue tables render every row. At 200+ rows, scroll redrawing the entire list every frame is the cost. Search for `react-window` / `react-virtualized` — likely zero hits.
- **Missing CSS `contain: layout paint`.** Tile boundaries don't tell the browser they're independent layout contexts, so any change inside one tile can invalidate the entire viewport.
- **Heavy re-renders triggered by SSE pulses.** `set*PulseNonce((n) => n + 1)` runs every realtime event. If consumers aren't memoized, the parent re-renders the entire tile tree.

### 2.3 Tab navigation — unmount/remount per switch

Verified pattern in [src/app/App.tsx](../../src/app/App.tsx): the tab router conditionally renders one `<Tab*>` component at a time. Switching tabs **unmounts** the previous one. That kills:

- Cached scroll position (user scrolls down on Matters, switches to Home, switches back — back at top).
- In-progress fetches (next mount re-fires them).
- Component-local state (filters, expanded rows, selected items).

The `TabMountMeter` HOC measures `nav.tabMount.{name}` — Round 1 baseline (changelog 2026-04-19) showed home 109ms, matters 19ms (pre-warmed). Pre-warmed means cached data; cold matters mount is much worse. The user feels this on every back-and-forth click.

### 2.4 React event-handler overhead

React 17/18 synthetic event delegation routes every event through a single root listener. For hover specifically, every `mouseenter` walks the React tree to find handlers, even for events on un-handled elements. Native `:hover` skips this entirely. The fix is structural: move hover *visual* state to CSS, keep only hover-triggered *behaviour* (e.g. tooltip popups) in React.

### 2.5 Existing measurement primitives

We already have:
- `TabMountMeter` HOC ([src/components/TabMountMeter.tsx](../../src/components/TabMountMeter.tsx)) — `nav.tabMount.{name}` events.
- `useFirstHydration` ([src/utils/useFirstHydration.ts](../../src/utils/useFirstHydration.ts)) — `hydrate.*` events.
- `DebugLatencyOverlay` (visible with `?ux-debug=1`) — surfaces both.
- App Insights `trackClientEvent` / `trackClientError` plumbing.

What we lack:
- INP (Interaction to Next Paint) probe — Chrome's official responsiveness metric.
- Hover-latency probe — `mouseenter` → next paint.
- Scroll-jank probe — long-task + dropped-frame counter during scroll.
- Tab-switch probe — separate from `nav.tabMount` (which measures cold mount). Need `nav.tabSwitch.{from}.{to}` measuring time-to-interactive on switch.

---

## 3. Plan

Three independently-shippable phases. Phase A is measurement (no UX change, lets us prove fixes worked). Phase B is the structural fixes. Phase C is tab-navigation persistence.

### Phase A — instrumentation deposit

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | INP probe via PerformanceObserver. | `src/utils/useInteractionLatency.ts` (NEW) | Wraps Chrome's `event` PerformanceObserver entry type. Emits `interaction.inp.{tabName}` with `value` + `interactionId` + `target` (sanitised). Throttled to one event per second per tab. Disabled in browsers that don't support `event` entries (Safari < 16.4). |
| A2 | Hover-paint probe. | `src/utils/useHoverLatency.ts` (NEW) | One-shot per session, attaches a single document-level `mouseover` capture listener that records `event.timeStamp` then `requestAnimationFrame` to capture next-paint timestamp. Reports p50/p95 to `interaction.hover.toPaint` event every 30s. |
| A3 | Scroll-jank probe. | `src/utils/useScrollJank.ts` (NEW) | LongTaskObserver-based: counts long tasks (>50ms) during scroll windows. Emits `interaction.scroll.longTasks` per scroll burst (debounced 1s). |
| A4 | Tab-switch probe. | [src/app/App.tsx](../../src/app/App.tsx) | Wrap the tab router so each switch records `nav.tabSwitch.{from}.{to}.{durationMs}` separately from cold mount. |
| A5 | Surface in DebugLatencyOverlay. | (existing overlay component) | Add 4 new rows: INP p95, Hover-paint p95, Scroll-jank count, TabSwitch p95. |
| A6 | Persist to backend. | (depends on companion brief — see [SESSION_PROBING_ACTIVITY_TAB_VISIBILITY_AND_PERSISTENCE.md](./SESSION_PROBING_ACTIVITY_TAB_VISIBILITY_AND_PERSISTENCE.md)) | Once the persistence table exists, `interaction.*` events get sent to `/api/telemetry/session-probe` so we can query per-user historical data without leaving the app. |

**Phase A acceptance:**
- [ ] All 4 probe types fire in DebugLatencyOverlay with `?ux-debug=1` on a real warm reload.
- [ ] App Insights `interaction.*` events visible with `customDimensions.userInitials`, `customDimensions.tabName`, `customDimensions.value`.
- [ ] Probes themselves cost <0.5ms per emission (verified by toggling them off and comparing INP).

### Phase B — high-leverage interaction fixes

Order by leverage (worst-first per the Phase A measurements). Working hypothesis below; A actually picks the order.

#### B1. Move hover from JS to CSS

For every component currently using `applyRowHover` / `resetRowHover`:

1. Add a CSS class `.helix-hover-row` (or extend existing `prospect-row` etc.) that uses `:hover` with `transform: translateY(-1px)` and the same shadow as today. Use CSS custom properties for the surface colour so dark/light mode swaps via the `[data-theme]` attribute (already in place per `design-tokens.css`).
2. Strip the `onMouseEnter` / `onMouseLeave` handlers from the component.
3. If the handler also did *behaviour* (e.g. preload next page, show overlay), keep that in JS but debounced — never on the synchronous mouseenter path.
4. Validate visually: hover lift identical to before, but no React event fired.

Expected outcome: hover-paint p95 falls from ~30ms to <8ms (CSS path). INP p95 improves materially because hover events stop blocking the main thread.

#### B2. Memoize tile components

Wrap top-level Home tile components in `React.memo` with custom `arePropsEqual` that ignores `pulseNonce` (the pulse should bump a CSS variable on a parent, not flow through props as a state change). For tiles that genuinely need to react to a pulse, isolate the pulse subscriber to a tiny child component so the tile body doesn't re-render.

#### B3. Virtualize long lists

Add `react-window` (or the more modern `@tanstack/react-virtual`) for any list that can exceed 50 rows: enquiries, matters, opsQueue, time-entries. Render only viewport+overscan rows. Measure with the scroll-jank probe before/after.

#### B4. CSS containment

Add `contain: layout paint` to every Home tile root and to every list-row root. Add `content-visibility: auto` to off-screen tiles (the browser skips painting them entirely). Verify no visual regression.

#### B5. Passive scroll listeners + RAF batching

Audit every `addEventListener('scroll')` and `onScroll`. Convert to `{ passive: true }`. Batch any state updates triggered by scroll into `requestAnimationFrame`.

#### B6. ResizeObserver → coarse bands + rAF (proven 2026-04-21)

The `OperationsDashboard` Conversion panel was rebuilt 2026-04-20 to use **coarse breakpoint bands** (`xs`/`sm`/`md`/`lg`) instead of raw pixel width state, with `ResizeObserver` callbacks coalesced through `requestAnimationFrame`. Result: zoom/resize operations no longer thrash component state on every observed pixel — only on band crossings. Pattern lives in [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts) (`resolveBreakpoint(width)`).

Apply the same pattern to remaining hot resize call sites:

| Site | Current | Action |
|---|---|---|
| [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) ~L97 | `ResizeObserver` setting raw width state on every callback | Resolve to a band, only `setState` on band change. Schedule via rAF. |
| [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) ~L116 | Same | Same. |
| [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) ~L975 | Same | Same. |

Define a small shared helper next to `resolveBreakpoint` so all three sites use the same banding API. The Conversion panel uses `narrow|standard|wide` (320 / 480 thresholds); for horizontal action bars consider `compact|normal|wide` with thresholds tuned to the bar's own collapse points.

**Acceptance:** zoom in/out across each surface produces at most one `setState` per band crossing (verified via React Profiler — flame chart should be flat between crossings, not a stack of 30+ frames).

### Phase C — tab navigation persistence

#### C1. Keep mounted, hide via CSS

Replace the tab router's conditional render with always-mount + CSS `display: none` for inactive tabs. This:
- Preserves scroll position natively.
- Preserves component-local state (filters, expanded rows, selected items).
- Eliminates remount cost on every back-switch (`nav.tabSwitch` becomes ~5ms regardless of tab).

Trade-off: memory grows by N×tab cost. Verify with Chrome DevTools heap snapshot — if Home + Matters + Enquiries together stay under 50MB heap, ship it. If they balloon, mount lazily on first visit but never unmount after.

#### C2. Inactive-tab fetch suspension

When a tab is `display: none`, its SSE consumers should pause (or downgrade to a longer-poll). Implement via a `TabVisibilityContext` + `useRealtimeChannel` honouring `enabled: visible`. Reduces background CPU when user is on Home but Matters has been mounted.

#### C3. Adjacent-tab data preload

On idle (`requestIdleCallback`), preload the most-likely-next tab's primary fetch. E.g. on Home, after first paint + 2s idle, fire the matters fetch in the background. Cached result is consumed instantly when the user clicks.

---

## 4. Step-by-step execution order

1. **A1–A5** in one PR. Bake in dev for 24h with `?ux-debug=1`. Capture baseline numbers in §9.
2. **A6** ships only after the companion persistence brief is done.
3. **B1** first — biggest leverage, smallest risk (CSS-only). One PR per ~10 components.
4. **B2** — incremental, one tile at a time.
5. **B3** — list at a time, biggest first (matters typically).
6. **B4** — global sweep, single PR.
7. **B5** — global sweep, single PR.
7a. **B6** — three sites in one PR (mirror the Conversion panel pattern).
8. **C1** — single PR, requires careful regression test (every tab, every state).
9. **C2** — depends on C1.
10. **C3** — last, optional.

Each Phase B/C item ships independently with its own changelog entry. Re-measure with Phase A probes before/after.

---

## 5. Verification checklist

**Phase A:**
- [ ] All 4 probe events appear in App Insights within 5 minutes of a real-user session.
- [ ] DebugLatencyOverlay shows the 4 new rows with live values.
- [ ] Probes-on vs probes-off INP delta < 1ms (probes are not making the problem worse).

**Phase B (per item):**
- [ ] B1 — hover-paint p95 drops below 10ms (was likely 25–40ms).
- [ ] B2 — Home tile re-render count per pulse drops to 1 (target tile only).
- [ ] B3 — scroll-jank long-task count per 1000-row scroll: <3 (currently likely 20+).
- [ ] B4 — paint area on hover/scroll reduced (Chrome Layers panel).
- [ ] B5 — no `[Violation] Added non-passive event listener` warnings in console.
- [ ] B6 — React Profiler flame chart for ImmediateActionsBar / QuickActionsBar / Enquiries shows at most one render per band crossing during zoom; no per-pixel render storm.

**Phase C:**
- [ ] C1 — `nav.tabSwitch` p95 drops to <20ms across all tab combinations.
- [ ] C1 — scroll position preserved on back-switch (manual test, every tab).
- [ ] C1 — heap snapshot under 50MB after visiting all tabs.
- [ ] C2 — Network panel shows zero SSE/poll activity for hidden tabs after 30s idle.
- [ ] C3 — second visit to a tab paints with cached data in <50ms.

---

## 6. Open decisions (defaults proposed)

1. **Probe sample rate** — Default: **all events in dev (`?ux-debug=1`); 10% sample in prod**. Rationale: full sampling in prod inflates App Insights cost; 10% is statistically sufficient for p95.
2. **Virtualization library** — Default: **`@tanstack/react-virtual`**. Rationale: hooks-based, modern, smaller bundle than react-window.
3. **Tab persistence model** — Default: **always-mount** if heap stays under threshold; **lazy-mount-and-keep** otherwise. Rationale: simplest UX wins; fall back if memory bites.
4. **Where to put the CSS hover class** — Default: **extend `design-tokens.css`** with a `.helix-row-hover` utility class that components opt into. Rationale: matches the CSS-classes-not-inline-styles rule already in place.
5. **Pulse-via-CSS-variable** — Default: **try it on opsQueue first** (one tile, well-isolated). If it works, fan out. Rationale: changes the `set*PulseNonce` contract; needs a proof point.

---

## 7. Out of scope

- Changing the visual design (look-and-feel stays).
- Replacing React with a different framework.
- Adding service workers / PWA caching.
- Changing data hydration strategy (covered by hydration probes).
- Bundle-size reduction (separate concern; the user's complaint is interaction lag, not first-load weight).

---

## 8. File index (single source of truth)

Client — Phase A:
- `src/utils/useInteractionLatency.ts` (NEW)
- `src/utils/useHoverLatency.ts` (NEW)
- `src/utils/useScrollJank.ts` (NEW)
- [src/app/App.tsx](../../src/app/App.tsx) — tab-switch probe wrapping
- DebugLatencyOverlay (find current location via grep) — 4 new rows

Client — Phase B:
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — `.helix-row-hover` class
- Many components currently using `applyRowHover` / `resetRowHover` — strip handlers, add class
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — tile memoization, pulse refactor
- Tables: `src/tabs/enquiries/`, `src/tabs/matters/`, `src/tabs/opsQueue/` — virtualization
- Global CSS sweep — `contain: layout paint` + `content-visibility: auto`

Client — Phase C:
- [src/app/App.tsx](../../src/app/App.tsx) — tab router rewrite
- New: `src/contexts/TabVisibilityContext.tsx`
- [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) — honour visibility

Server:
- (none — Phase A6 covered by companion persistence brief)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) — flag the new programme
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — once shipped, reinforce the "interaction freshness" rule alongside the existing "data freshness" one

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ui-responsiveness-hover-scroll-and-tab-navigation
verified: 2026-04-19
branch: main
touches:
  client:
    - src/utils/useInteractionLatency.ts
    - src/utils/useHoverLatency.ts
    - src/utils/useScrollJank.ts
    - src/app/App.tsx
    - src/app/styles/design-tokens.css
    - src/tabs/home/Home.tsx
    - src/hooks/useRealtimeChannel.ts
    - src/contexts/TabVisibilityContext.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - session-probing-activity-tab-visibility-and-persistence  # Phase A6 of this brief consumes that brief's persistence endpoint
  - realtime-delta-merge-upgrade                              # both touch src/hooks/useRealtimeChannel.ts and Home.tsx (different regions: this brief = visibility/memo; that brief = payload merge)
  - ux-realtime-navigation-programme                          # both touch src/app/App.tsx (tab router) and design-tokens.css
conflicts_with: []
```

---

## 9. Gotchas appendix

- **`applyRowHover` is imported in many places, not all of them rows.** Some tiles use it for the whole tile. Audit usage before stripping — a global find/replace will break things.
- **CSS `:hover` does not fire on touch devices.** If any current users are on tablets (Teams iPad client?), CSS-only hover degrades to no feedback. Solution: use `@media (hover: hover)` to scope the hover styles to pointer devices, and rely on tap-state for touch.
- **`React.memo` with a function `arePropsEqual` is a footgun.** If the comparison is wrong, components silently fail to update. Always include a console.log during development that fires when memo *blocks* a render — verify it only blocks the right cases.
- **`content-visibility: auto` breaks anchor links / find-in-page if mis-applied.** Browsers skip rendering the off-screen content; if a `<h2>` inside is the target of `#some-id`, scroll-into-view fails. Apply only to leaf-level tiles, not to containers with searchable text.
- **Passive scroll listeners cannot call `preventDefault`.** Anywhere we currently prevent default scroll (e.g. custom scroll-snap), keep that handler non-passive. Don't blanket-convert.
- **Always-mount tab persistence breaks mount-time side effects.** Some tabs do work in `useEffect(() => { /* boot */ }, [])` that assumes "this fires when the user opens the tab". After C1, that fires once at app boot. Audit + convert to visibility-based effects.
- **`requestIdleCallback` is not in Safari.** Use `requestIdleCallback || setTimeout(fn, 1)` shim — already exists in the codebase, search before re-creating.
- **React 18 automatic batching** can mask jank — multiple `setState` calls inside an event handler batch into one render, which is good. But inside `setTimeout` / Promise resolution, batching depends on `unstable_batchedUpdates` (or React 18's automatic). Verify the SSE consumers benefit; some use unstable_batchedUpdates explicitly.
- **The user reported scroll lag specifically.** Don't get distracted optimising things they didn't mention. Lead with hover (most concrete complaint), then scroll, then tab nav, in that order.
