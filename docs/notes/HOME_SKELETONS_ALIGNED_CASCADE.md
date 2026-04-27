# Home skeletons — aligned microcopy + cascaded load-in

> **Purpose of this document.** Self-contained brief. Any future agent can execute this without prior context. Read once, then work Phase A before B.
>
> **Verified:** 2026-04-20 against branch `main`. Re-verify file/line refs if picking up >30 days later.

---

## 1. Why this exists (user intent)

Verbatim request:

> *"in the billing skeletons i see 'Billing warming up / Pulling WIP, recovered fees, and outstanding balances.' but in the others we dont. scope and stash a brief that will align all home skeletons at the time of review, skeletoning only the truly active bits and neatly cascading smooth and cohesive animations for the components that dont, labels and things so that we control the loading state a bit more. atm we're at the mercy of the data as it drops in."*

Two goals:

1. **Microcopy parity.** Only the Billing rail has a "warming up / pulling …" header. Conversion, Pipeline/Activity, Matters, and To Do skeletons are silent. Either all panels get a matching label, or Billing's label is removed. User's preference (to confirm in open decisions): keep the labels but spread them across every skeletonised panel so the system feels intentional, not patchy.
2. **Controlled cascade.** Right now each panel flips from skeleton → live as its own data promise resolves — order and rhythm is "at the mercy of the data". Replace with a deterministic cascade: skeletons animate in together, then fade out in a prescribed order (Billing → Conversion → Pipeline → Matters → Team) on a bounded timeline regardless of which fetch wins the race, as long as its own data is ready by the cascade slot. Panels whose data is still pending hold the skeleton; panels whose data landed early sit behind a hold-gate so the room reveals cohesively.

The user is **not** asking for:
- New fetch behaviour (data layer unchanged).
- New section designs — the live panel shapes stay exactly as-is.
- Skeletoning panels that are already instant (e.g. header toolbar, UserBubble bar).

---

## 2. Current state — verified findings

### 2.1 Billing skeleton (only panel with microcopy)

- File: [src/components/modern/BillingRailSkeleton.tsx](../../src/components/modern/BillingRailSkeleton.tsx)
- L48–L53: Header block with spinning `FiRefreshCw` + `"Billing warming up"` title + `"Pulling WIP, recovered fees, and outstanding balances."` sub-line.
- L55–L77: Metric tile grid (true active region — pulses).
- L79–L83: Footer chip row (pulses).
- L87–L111: Optional `withShell` mode wraps in the canonical section header + card so the shell fallback and live rail line up with no structural pop.

### 2.2 Other home skeletons (no microcopy)

- File: [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx)
- `HomeDashboardSkeleton` (L317) — owns the overall shell, renders `BillingRailSkeleton` + Conversion + Pipeline + Matters + To Do skeletons inside `home-stable-shell-panel`.
- `HomePipelineSkeletonCard` (L211) — Enquiries + Matters table skeletons. No header copy.
- `ConversionChartSkeleton` (L142) — chart-only skeleton. No header copy.
- `TeamInsightSectionSkeleton` (L44) — team tiles. No header copy.
- Conversion card skeleton body (L334–L493) — period tabs + hero KPI + chart + footer. No header copy.
- To Do skeleton body (L494+) — header strip + action rows. No header copy.

### 2.3 Animation primitives (already shared — reuse these)

- File: [src/tabs/home/home-tokens.css](../../src/tabs/home/home-tokens.css)
- L27–L29, L52, L81–L83, L106, L131–L133, L150: `--home-skel-fill` / `--home-skel-fill-weak` / `--home-skel-fill-faint` / `--home-skel-fill-medium` across light / highlight / dark themes.
- L191–L200: `@keyframes homeSkelPulse` (1.4s ease-in-out, opacity 1↔0.5) plus `prefers-reduced-motion` override. No fade-out/fade-in keyframe exists yet.
- L142–L143 (OperationsDashboard): `@keyframes opsDashSpin` used by the Billing header spinner.

### 2.4 How panels currently transition skeleton → live

- Each panel gates on its own `isLoading*` / `data` flag inside [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx). When that flag flips, the skeleton unmounts and the live panel mounts — no shared clock, no ordering, no cross-fade.
- This is what the user means by "at the mercy of the data as it drops in". Billing often resolves first and pops in while Conversion is still pulsing, giving a staggered/jittery reveal that feels uncontrolled.

---

## 3. Plan

### Phase A — Microcopy parity (small, independently shippable)

Factor the Billing header block into a reusable `SkeletonSectionLabel` component, then place it at the top of every home skeleton card. Each call site supplies its own title + sub-line + icon.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Extract `SkeletonSectionLabel` | NEW `src/components/modern/SkeletonSectionLabel.tsx` | Props: `{ icon: ReactNode; title: string; description: string; isDarkMode: boolean }`. Renders the exact DOM structure currently inline at `BillingRailSkeleton.tsx` L48–L53 (spinner + title + muted sub-line), at the same padding (`10px 16px 8px`), using the same `opsDashSpin` + colours. |
| A2 | Replace the inline header in Billing | [src/components/modern/BillingRailSkeleton.tsx](../../src/components/modern/BillingRailSkeleton.tsx) L48–L53 | Swap for `<SkeletonSectionLabel icon={<TbCurrencyPound …/>} title="Billing warming up" description="Pulling WIP, recovered fees, and outstanding balances." … />`. Visual output unchanged. |
| A3 | Add header to Conversion skeleton | [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) L334 (immediately after the period-tabs row, before hero content) | Title: `"Conversion warming up"`. Description: `"Pulling enquiries, matters, and area-of-work mix."`. Icon: `TbChartHistogram` (already used by live Conversion header, confirm symbol name before import). |
| A4 | Add header to Pipeline / Activity skeleton | [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) L221–L250 (above the tab bar) — or inside each `HomePipelineSkeletonCard` variant | `variant==='activity'`: title `"Pipeline warming up"`, description `"Pulling enquiries and unclaimed leads."`. `variant==='matters'`: title `"Matters warming up"`, description `"Pulling draft, generate, and upload progress."`. |
| A5 | Add header to To Do skeleton | [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) inside the `hidePipelineAndMatters` branch of `HomeDashboardSkeleton` (around L500 — the To Do card body), before the count badge strip | Title: `"To Do warming up"`. Description: `"Pulling pickups across the team."`. Icon: list icon matching live To Do header. |
| A6 | Add header to Team Insight skeleton | [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) `HomeTeamInsightSkeleton` (L536) | Title: `"Team warming up"`. Description: `"Pulling availability and workload."`. Icon: matches live Team header. |

**Phase A acceptance:**

- Every Home skeleton card shows a small, spinning icon + `"<Section> warming up"` + single-line description, in the exact same typography as the existing Billing header.
- Only actual data placeholders pulse (`homeSkelPulse`); header microcopy itself stays static (no opacity pulse on the label text).
- Light / dark / high-contrast themes all legible — use `colours.dark.text / colours.subtleGrey` as Billing currently does.
- `prefers-reduced-motion` still honoured (header spinner already respects CSS class; if it doesn't, pause `opsDashSpin` inside the same media query block as `homeSkelPulse`).

### Phase B — Cascaded, controlled reveal

Replace the per-panel "flip when data lands" behaviour with a shared cascade clock that the Home shell owns.

#### B1. The hold-gate hook

Create `useHomePanelReveal(panelId: HomePanelId, dataReady: boolean): boolean`.

- File: NEW `src/tabs/home/useHomePanelReveal.ts`.
- Maintains a single React context (`HomeRevealController`) instantiated at the `HomeDashboardSkeleton` / live dashboard boundary.
- The controller holds an ordered array of panels — default `['billing', 'conversion', 'pipeline', 'matters', 'todo', 'team']` — each with a "slot" (e.g. 0ms, 150ms, 300ms, 450ms, 600ms, 750ms from reveal-start).
- A panel becomes revealed when **both** are true: (a) `dataReady === true`, (b) its slot time has elapsed since the first `dataReady` across any panel (reveal-start).
- Panels whose data arrives late reveal as soon as their own data lands (no further queueing).
- Hook returns the boolean `shouldShowLive`. When `false`, the caller keeps its skeleton mounted.
- Respects `prefers-reduced-motion`: when set, all slots collapse to 0ms (instant reveal) so no extra delay is added for accessibility users.

#### B2. Fade-out / fade-in keyframes

Add to `home-tokens.css` (section after `homeSkelPulse`):

```css
@keyframes homeSkelFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes homeLivePanelFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes homeSkelFadeOut { from, to { opacity: 0; } }
  @keyframes homeLivePanelFadeIn { from, to { opacity: 1; transform: none; } }
}
```

Duration: 180ms ease-out for fade-out, 220ms ease-out for fade-in, slight 40ms overlap.

#### B3. Wire each panel through the hook

For each Home panel in [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) (Billing, Conversion, Pipeline, Matters, To Do, Team):

1. Compute a local `dataReady` boolean (already implicit in each panel's `isLoading` check).
2. Call `const show = useHomePanelReveal('<panelId>', dataReady);`.
3. Replace the direct `isLoading ? <Skeleton/> : <Live/>` ternary with a cross-fade wrapper: render both, one with `homeSkelFadeOut` and one with `homeLivePanelFadeIn`, driven by `show`. Use the pattern already established by `home-stable-shell-panel` (keep outer shell mounted — this is called out in `copilot-instructions.md` under "Structural loading by default").

#### B4. Cascade kickoff

The controller's reveal-start timer starts when **Billing** becomes `dataReady` (first-in-line anchor). If Billing takes unusually long (>6s), fall back to reveal-start = (first-ready panel time) so users aren't stuck on skeletons forever if the WIP fetch stalls.

---

## 4. Step-by-step execution order

1. **A1** — Extract `SkeletonSectionLabel`. Confirm visual diff against current Billing header is zero.
2. **A2** — Swap Billing header to use it. Commit + log.
3. **A3–A6** — Add labels to remaining skeletons (single commit).
4. **Ship Phase A and demo to user.** Adjust microcopy per feedback.
5. **B1** — Implement `useHomePanelReveal` + `HomeRevealController`. Unit-test the slot-arithmetic in isolation.
6. **B2** — Add keyframes to `home-tokens.css`.
7. **B3** — Wire panels one at a time, smallest first (Billing → Conversion → Pipeline → Matters → To Do → Team). After each, verify no flash/layout jank on slow-3G throttle in DevTools.
8. **B4** — Add the Billing anchor + 6s fallback; document in `ARCHITECTURE_DATA_FLOW.md` under "Home dashboard reveal cascade".
9. **Changelog entries** per phase.

---

## 5. Verification checklist

**Phase A:**
- [ ] Every Home skeleton card shows "warming up" microcopy with matching typography.
- [ ] No pulse animation on the microcopy itself — only the data placeholder bars pulse.
- [ ] `prefers-reduced-motion`: spinner + pulses halt; microcopy stays legible.
- [ ] Bundle size increase ≤ 1 kB (single new component, re-used strings).

**Phase B:**
- [ ] Throttle network to slow-3G; skeletons appear as one unit.
- [ ] Billing → Conversion → Pipeline → Matters → To Do → Team reveal in that order on a fast connection, with ~150ms between slots.
- [ ] On a slow fetch (e.g. Conversion 4s later than Billing), Conversion reveals instantly when its data lands — it does not wait for a slot that's already passed.
- [ ] No layout shift on reveal (outer shell kept mounted).
- [ ] `prefers-reduced-motion`: all panels reveal instantly as data lands (no timeline delay).
- [ ] No regression in To Do pickup flow — live data still keyboard-focusable immediately after reveal.

---

## 6. Open decisions (defaults proposed)

1. **Microcopy pattern** — Default: **keep Billing's "<Section> warming up / Pulling …" pattern** and extend it across all panels. Rationale: user implied they like the Billing copy ("I see it … but in the others we don't"), not that they want to remove it.
2. **Cascade ordering** — Default: **Billing → Conversion → Pipeline → Matters → To Do → Team**. Rationale: matches current visual reading order top-to-bottom, and Billing's numbers tend to resolve first.
3. **Slot spacing** — Default: **150ms between slots**. Small enough to feel responsive, large enough to register as a cascade.
4. **Anchor panel** — Default: **Billing anchors the cascade-start timer, with a 6s fallback to first-ready**. Rationale: Billing is the first-resolved panel in current production telemetry; anything stuck beyond 6s shouldn't block the room.
5. **Scope of labelling** — Default: **only the 6 Home dashboard panels listed above**. Rationale: avoid spreading this pattern across unrelated skeletons (e.g. matter-opening wizard) in this round.

---

## 7. Out of scope

- Changing any live data fetch, timeout, or retry behaviour.
- Adding skeletons to panels that don't currently have one.
- Changing the Billing microcopy wording itself (handled under Phase A only if user redirects).
- Redesigning the live Conversion / Pipeline / Matters cards (covered by `home-conversion-panel-rebalance` + `home-todo-single-pickup-surface`).
- Team Insight table content (the label goes on; table layout does not change).

---

## 8. File index (single source of truth)

Client (existing):
- [src/components/modern/BillingRailSkeleton.tsx](../../src/components/modern/BillingRailSkeleton.tsx) — lift header, keep body.
- [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) — add labels inside each sub-skeleton; wire hold-gate at shell level.
- [src/tabs/home/home-tokens.css](../../src/tabs/home/home-tokens.css) — add fade keyframes alongside `homeSkelPulse`.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — thread `useHomePanelReveal` into each panel's skeleton↔live junction.

Client (new):
- `src/components/modern/SkeletonSectionLabel.tsx` (NEW) — extracted header used across all Home skeletons.
- `src/tabs/home/useHomePanelReveal.ts` (NEW) — cascade controller + hook.

Docs / logs:
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) — add "Home dashboard reveal cascade" sub-section under rendering notes.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase (A, B1–B4).

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: home-skeletons-aligned-cascade
verified: 2026-04-20
branch: main
touches:
  client:
    - src/components/modern/BillingRailSkeleton.tsx
    - src/components/modern/SkeletonSectionLabel.tsx
    - src/tabs/home/HomeSkeletons.tsx
    - src/tabs/home/home-tokens.css
    - src/tabs/home/useHomePanelReveal.ts
    - src/components/modern/OperationsDashboard.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface
  - home-animation-order-and-demo-insert-fidelity
  - demo-mode-hardening-production-presentable-end-to-end
  - forms-ia-ld-undertaking-complaint-flow
  - realtime-delta-merge-upgrade
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with: []
```

Note on `OperationsDashboard.tsx` cross-hits reported by precheck (`call-centre-*`, `ccl-*`): those briefs mutate unrelated regions (call-centre attendance, CCL autopilot chain, CCL review experience). This brief only touches the Home dashboard skeleton↔live junctions. Left off `coordinates_with` to avoid noisy cross-references; declare explicit coordination only if a future edit of this brief expands into those regions.

---

## 9. Gotchas appendix

- **Keep the outer shell mounted.** Per `copilot-instructions.md` → "Structural loading by default" + `home-stable-shell-panel` class. Unmounting the shell under the skeleton causes a layout pop that defeats the cascade. Reveal via opacity/transform, not mount/unmount.
- **Billing has `withShell` mode** (L87–L111). After extracting `SkeletonSectionLabel`, verify the `withShell` wrapper still composes cleanly — the label sits *inside* the shell's card, not outside the section header.
- **`homeSkelPulse` is used by inline SVG `<rect>` animations too** (HomeSkeletons.tsx L171–L172). Don't rename the keyframe without updating those inline `style={{ animation: ... }}` strings.
- **Conversion period tabs row** (HomeSkeletons.tsx L334) is inside the Conversion card but mirrors the live tab bar. Place the new label **above** the tab bar, matching Billing's "header above tiles" rhythm.
- **To Do skeleton lives in `HomeDashboardSkeleton`'s `hidePipelineAndMatters` branch** (~L500), not in `HomePipelineSkeletonCard`. Don't add the To Do label inside the pipeline card by mistake.
- **The `FiRefreshCw` spinner uses `opsDashSpin`** defined in `OperationsDashboard.tsx` (search `@keyframes opsDashSpin`). If the new `SkeletonSectionLabel` lives outside that file's CSS reach, move the keyframe into `home-tokens.css` so every skeleton that uses the label still animates.
- **Slot arithmetic under React strict-mode double render**: the controller must be idempotent — use a `useRef` for reveal-start, not `useState` in the render body, otherwise slot timing drifts in dev.
- **Don't conflate with `home-animation-order-and-demo-insert-fidelity`**: that brief is about ordering *live* panel insertions in demo mode. This brief is about ordering *skeleton→live* transitions. They can co-exist; if both land, ensure the cascade controller respects the demo-mode playback timeline (likely by exposing an override hook).
