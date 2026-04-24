# UX Realtime Navigation Programme

> **Purpose of this document.** Self-contained brief any future agent can execute cold. Moves tab-app from "stuttery SaaS" to premium, Helix-native realtime feel. Every relevant file path, line ref, decision and guard-rail is captured below.
>
> **How to use it.** Read once end-to-end. Ship **Phase 0 first** (instrumentation — no UX changes yet). Phases 1–4 then run in order, each gated behind `canSeePrivateHubControls()` (LZ/AC) until stable. One `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If >30 days later, re-verify file/line refs.

---

## 1. Why this exists (user intent)

The user said, verbatim:

> "scope ux and navigation improvements across the app. id like the app to feel more realtime in terms of how it behaves and reacts to the cursor. the current experience is lag and frustration."

Scope confirmation from follow-up:
- Depth: **"i think 3, i want a real world industry standard snappy implementation. one that feels like a premium software. bespokely built for Helix."**
- Nav: **"3 but i dont want to break anything and this will need to be closely tracked so that we dont get lost."**

So: full programme (Quick Wins + SSE smoothing + Virtualization + IA rethink), bespoke Helix feel, zero regressions, tight tracking. **Not** in scope: CRA→Vite, mobile/touch pass, cross-app navigation (instruct-pitch / enquiry-processing-v2 stay read-only), offline/service-worker, unified search backend.

Target bar: **<100 ms hover/click feedback**, **<200 ms warm tab switch**, **<500 ms cold**, SSE/polling NEVER blocks input, layout reserved before content lands, Linear/Raycast-tier feel inside the Helix design system (no new colours, no new radii, UserBubble remains canonical).

### 1a. Status update — Round 7 wrap (2026-04-19)

Rounds 1–7 of the programme have shipped (see [logs/changelog.md](../../logs/changelog.md) entries dated 2026-04-19, "UX Realtime Programme — Round 1..7"). Highlights:

- **R1** per-tab mount metrics (TabMountMeter HOC) — cheap React state flip ~50 ms, well under target.
- **R2** hydration metrics + DebugLatencyOverlay (LZ/AC + `?ux-debug=1`).
- **R3** parallel matters fetch — `hydrate.matters` 4141 ms → 1678 ms (-59%).
- **R4** per-section Home hydration probes (12 new metrics).
- **R5** synchronous snapshot hydration on first paint — every Home tile now renders with cached data on mount, skeletons skipped when snapshot present.
- **R7 Phase A** unified live-update cue: `LivePulse` / `LivePulseDot` / `LiveIndicatorDot` + `useRealtimeChannel` hook + `realtimePulse.css` (border / dot / ring variants, dark `accent` / light `highlight`, honours `prefers-reduced-motion`).
- **R7 Phase B+C** full SSE coverage: 4 new server streams (`outstanding-balances-stream`, `ops-queue-stream`, `matters-stream`, `doc-workspace-stream`), all 9 channels broadcast on mutation, Home wraps OperationsDashboard / OperationsQueue / TeamInsight in `<LivePulse>`, app-shell relays `enquiries.changed` to a `helix:enquiriesChanged` window event for cross-tile pulse.
- **R7 Phase D** telemetry baked into `useRealtimeChannel` (`Realtime.{name}.connected`, `.firstUpdate`, `.error`, throttled).

**R7 residuals (parked as separate stash briefs):**

- `home-realtime-channel-migration` — migrate Home.tsx's 9 inline EventSource effects to `useRealtimeChannel` (-120 lines, centralises reconnect/telemetry).
- `clio-webhook-bridge` — `/api/clio/webhook` endpoint that re-broadcasts to matters/enquiries streams; closes the external-edit gap noted in the R7 changelog.
- **Notification-vs-delta SSE** — current channels emit "something changed, refresh" pings; only enquiries does true delta merging. Worth a Phase E if true splice-in is wanted on outstanding/ops/matters/doc tiles.
- **Multi-replica cache invalidation** — replica A's `invalidate*Cache()` does not bust replica B's Redis. Subscribe-to-own-broadcast pattern needed before scaling to >1 instance.
- **Doc-workspace coverage** — only `/upload` mutation broadcasts; holding-folder transitions (move-to-final, delete) do not.

**This brief now covers Phases 0–4 (the broader programme) and tracks R1–R7 as completed within it.** The remaining unshipped work below (Phase 1 cursor layer, Phase 2.4–2.7 virtualization/scroll restore, Phase 3 router shim/command palette, Phase 4 polish) is still open.

---

## 2. Current state — verified findings

### 2.1 Inline `style={{}}` literals everywhere (render thrash)

Every `style={{...}}` creates a new object → `React.memo` equality fails → memoised children re-render on every parent state change. Hottest offenders:

- [src/app/App.tsx](../../src/app/App.tsx) — tab header strip around L324 (`style={{ width: 120, height: 2, ... }}`); tab-router prop bundles L1499–L1530.
- [src/components/AdminDashboard.tsx](../../src/components/AdminDashboard.tsx) — ~30+ inline styles L462–L632; hover colour/opacity mutation L916–L941.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — table header/footer rebuilt each render L6059–L6095.
- [src/CustomForms/AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) — modal hover styles L1836–L1970, direct DOM writes L1964–L3162.

### 2.2 Direct `e.currentTarget.style.*` in hover handlers

Synchronous DOM writes force paint on hover; unmaintainable and, under load, reads as lag.

- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) L475–L481.
- [src/components/command-centre/AppearanceSection.tsx](../../src/components/command-centre/AppearanceSection.tsx) L176–L177 (`scale(1.25)` transform).
- [src/components/command-centre/SystemStatusSection.tsx](../../src/components/command-centre/SystemStatusSection.tsx) L90–L91 (`setIsHeaderHovered`).
- [src/components/command-centre/ProfileSection.tsx](../../src/components/command-centre/ProfileSection.tsx) L33–L34.
- [src/components/command-centre/LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx) L212–L213.
- [src/components/AdminDashboard.tsx](../../src/components/AdminDashboard.tsx) L916–L941.
- [src/CustomForms/AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) L1964–L3162.

### 2.3 Prospects table NOT virtualized

- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) L8434–L8600: `displayedItems.map((item, idx) => <ProspectTableRow ... />)`. 500+ rows ⇒ 500 DOM nodes regardless of viewport. Row is already memoised with custom equality (`areRowPropsEqual` in [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) L492–L530) — parent churn defeats it.
- Reference working pattern: [src/components/AdminDashboard.tsx](../../src/components/AdminDashboard.tsx) L597–L636 uses `react-window` `FixedSizeList`/`VariableSizeList`. Mirror it.
- Infinite-scroll loader at L8468–L8495 should move from `IntersectionObserver` to list `onItemsRendered`.

### 2.4 SSE handlers trigger whole-tree state updates

- [src/app/App.tsx](../../src/app/App.tsx) L1073–L1150: `patchInstructionState(setter)` does `setter(prev => prev.map(...))` on every `pipeline.changed` SSE event → new array ref → all children re-render.
- [src/index.tsx](../../src/index.tsx) L1367–L1409: SSE subscription / dispatch chain into App state.
- Compound effect: typing in search stutters while SSE events fire.
- **Fast-path required for `claimStateChanged`** (must remain immediate; only `pipelineChanged`/`enquiriesChanged` can be buffered).

### 2.5 Navigation is time-based, not route-based

- [src/app/App.tsx](../../src/app/App.tsx) L648–L683 has `warmNavigationChunks()` scheduled ~4 s after boot via `requestIdleCallback + 2.5s` timeout. No URL routing exists — tabs are local state only; browser back/forward doesn't work. Teams deep links rely on internal `setActiveTab` calls + `?tab=` query param.
- [src/components/Navigator.tsx](../../src/components/Navigator.tsx) L20–L23: 150 ms opacity transition on every tab content swap.
- **Known-good, from `/memories/repo/home-boot-performance.md`:** do **NOT** wrap `setActiveTab` in `startTransition()` — it pushed Home→Matters/Forms into multi-second delays. Tab activation stays synchronous.

### 2.6 Transition timing inconsistency

Grep `transition:` across `src/`:
- 80 ms — [src/components/HomePipelineStrip.css](../../src/components/HomePipelineStrip.css) L38 (good).
- 150 ms — command-centre sections (acceptable, can standardise).
- 200–300 ms — resource/client detail modals (too slow for interactive hover feedback).
- 600 ms — TodayStripSection progress bars (OK, decorative).

No motion tokens exist in [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css).

### 2.7 Baselines to measure in Phase 0

Don't guess. Capture via the Phase 0 overlay and record in the tracker (§8):
- `nav.tabSwitch` p50/p95 for Home↔Matters, Home↔Enquiries, Home↔Reporting.
- `hover.feedback` p95 on QuickActionsBar, command-centre rows, prospects table rows.
- `sse.inputBlock` p95 while typing in prospects search during a live pipeline update.
- Frame drop count during a 5-second scroll of prospects (≥200 rows loaded).

### 2.8 Already-known residuals (do NOT re-tackle)

From `/memories/repo/home-boot-performance.md`:
- `startTransition()` around `setActiveTab()` is forbidden.
- Enquiries chunk warming is intentionally delayed (respects boot budget).
- Non-critical Home metrics stream only when `isActive && homeDataReady`.
- Matters warm-up must not wait on Teams host context (current code is correct).

---

## 3. Plan

Five phases. Each independently revertable. Each lands behind a dev-preview gate (`canSeePrivateHubControls()` — LZ/AC) until observed stable, then promoted to admins, then all users.

### Phase 0 — Instrumentation & Tracker (ships first, no UX change)

| # | Change | File | Detail |
|---|--------|------|--------|
| 0.1 | `trackInteraction(name, ms, props)` helper | [server/utils/appInsights.js](../../server/utils/appInsights.js) | Thin wrapper — emits `UX.Interaction.Latency` via `trackEvent` + `trackMetric` (`UX.Interaction.Duration`). Client calls via existing `/api/telemetry`. |
| 0.2 | Client interaction tracker | `src/utils/interactionTracker.ts` (NEW) | `markInteractionStart(name)` / `markInteractionEnd(name)` wrappers using `performance.mark`/`performance.measure`. Debounced, batched every 5 s. |
| 0.3 | Debug overlay (LZ/AC only) | `src/components/DebugLatencyOverlay.tsx` (NEW) | Corner pill, last 3 interactions + rolling p95. Gated by `canSeePrivateHubControls()` AND `?ux-debug=1`. Mounted in [src/app/App.tsx](../../src/app/App.tsx). Dismissible per session. |
| 0.4 | Instrument hot interactions | [src/app/App.tsx](../../src/app/App.tsx), [src/components/Navigator.tsx](../../src/components/Navigator.tsx) | `nav.tabSwitch` on `setActiveTab`; `hover.feedback` via shared `useInteractionTiming()` hook on QuickActionsBar / command-centre. |
| 0.5 | Live tracker | `docs/notes/UX_REALTIME_PROGRAMME.md` (NEW) | Phase checklist, baseline slot, decisions log, deferrals. |
| 0.6 | Record baseline | tracker | Walk Home→Matters→Enquiries→Reporting ×3 with overlay on; paste numbers. |

**Phase 0 acceptance:**
- `customEvents | where name == "UX.Interaction.Latency"` returns events with sane `durationMs`.
- Overlay visible to LZ/AC with `?ux-debug=1`, invisible otherwise.
- Tracker doc exists with baselines filled.
- `logs/changelog.md` entry.

### Phase 1 — The Cursor Layer (hover, motion tokens, micro-interactions)

| # | Change | File | Detail |
|---|--------|------|--------|
| 1.1 | Motion tokens | [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) | `--motion-fast: 80ms`, `--motion-base: 140ms`, `--motion-emphasis: 220ms`, `--ease-helix: cubic-bezier(0.2, 0.8, 0.2, 1)`. Document in [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md). |
| 1.2 | Purge direct DOM hover writes | files in §2.2 | Replace `e.currentTarget.style.*` with `:hover`/`[data-hover]`. Where state is required, debounce enter 30 ms / leave 80 ms. |
| 1.3 | Transition timing pass | grep-driven | Interactive `transition:` >220 ms → `var(--motion-base)`. Decorative transitions keep current values. |
| 1.4 | Inline-style purge (hot cohort) | [src/app/App.tsx](../../src/app/App.tsx) L324, [src/components/Navigator.tsx](../../src/components/Navigator.tsx), [src/components/AdminDashboard.tsx](../../src/components/AdminDashboard.tsx), [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) | Static styles → CSS classes; dynamic-only values (computed widths, transforms) stay inline. |
| 1.5 | Active-state feedback | Navigator + tokens | Every clickable surface gets a 1-frame `:active` depth/scale cue using `--motion-fast`. |
| 1.6 | Navigator opacity | [src/components/Navigator.tsx](../../src/components/Navigator.tsx) L20–L23 | 150 ms → `var(--motion-fast)` (80 ms). |

**Phase 1 acceptance:**
- `hover.feedback` p95 <50 ms.
- `grep -r "e\.currentTarget\.style\." src/` empty (or commented with justification).
- Interactive `transition:` uses `var(--motion-*)` tokens only.
- Visual smoke across Home, Enquiries, Matters, Reports, UserBubble, AnnualLeaveModal — no Helix-look drift.

### Phase 2 — Render Discipline (SSE, lists, prop stability)

| # | Change | File | Detail |
|---|--------|------|--------|
| 2.1 | `useDeferredSSE` hook | `src/utils/useDeferredSSE.ts` (NEW) | Buffers events 120 ms, batches into one `setState`, wraps apply in `startTransition`. Fast-path bypass for `claimStateChanged`. |
| 2.2 | Wire SSE through deferred hook | [src/app/App.tsx](../../src/app/App.tsx) L1073–L1150, [src/index.tsx](../../src/index.tsx) L1367–L1409 | `patchInstructionState` receives coalesced batches. User-initiated state remains synchronous (see §2.5 warning). |
| 2.3 | Stable prop bundles | [src/app/App.tsx](../../src/app/App.tsx) tab-router L1499–L1530; Enquiries parent | `useMemo` objects/arrays; `useCallback` handlers. |
| 2.4 | Virtualize Prospects table | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) L8434–L8600 | `react-window` `VariableSizeList`. Pixel-identical rows required. Row height cache by id. |
| 2.5 | Infinite-scroll via list callback | same file L8468–L8495 | Replace `IntersectionObserver` with `onItemsRendered` trailing threshold. |
| 2.6 | Scroll restoration | `src/utils/useScrollRestore.ts` (NEW) | `Map<tabKey, offset>` — restore on tab re-entry. |
| 2.7 | Long-task budget | overlay extension | Log tasks >50 ms to overlay + `UX.LongTask` telemetry. |

**Phase 2 acceptance:**
- `sse.inputBlock` p95 = 0.
- Prospects scroll ≥55 fps @ 500 rows.
- Warm tab switch p95 <200 ms.
- Claim badges update instantly (fast-path verified).
- `UX.LongTask` near zero in normal loop.

### Phase 3 — Bespoke Navigation (IA rethink, behind `?nav-v2=1`)

All of Phase 3 gated via `?nav-v2=1` + LZ/AC preview. Legacy nav untouched.

| # | Change | File | Detail |
|---|--------|------|--------|
| 3.1 | Router shim | `src/app/router.tsx` (NEW) | `react-router` v6 `BrowserRouter` when `?nav-v2=1`. Legacy `setActiveTab` becomes `navigate()` shim. `?tab=` query param preserved for Teams deep links. |
| 3.2 | Primary routes | same | `/home`, `/enquiries`, `/enquiries/:id`, `/matters`, `/matters/:displayNumber`, `/reporting/:view`, `/forms`, `/instructions`. |
| 3.3 | Command Palette (⌘K / Ctrl+K) | `src/components/CommandPalette.tsx` (NEW) | Jump-to-tab · Recents (10) · Actions (new matter, find by passcode, find by InstructionRef, pressure-test draft, open Helix Eye) · federated search across enquiries/matters/instructions. Built in UserBubble visual language. |
| 3.4 | Command registry | `src/app/commands.ts` (NEW) | Declarative registry; `useRegisterCommands(commands)` hook per tab. |
| 3.5 | Persistent context strip | `src/components/ContextStrip.tsx` (NEW) | Thin breadcrumb: `Home › Enquiries › Luke Test (HLX-27367-94842)`. Clickable segments. Answers the "don't get lost" requirement. |
| 3.6 | Prefetch on hover | [src/app/App.tsx](../../src/app/App.tsx) nav items | `onMouseEnter` → 120 ms delay → dynamic `import()` of tab chunk if not loaded. |
| 3.7 | Keyboard shortcuts + cheat sheet | `src/components/ShortcutsCheatSheet.tsx` (NEW) | `g h` / `g e` / `g m` / `g r` / `/` (focus search) / `⌘K` / `?` / `Esc`. |
| 3.8 | Focus management | router `useEffect` | On route change, focus primary `<h1>` (a11y + perceived snappiness). |
| 3.9 | Tab switch motion | Navigator | Warm-to-warm = 80 ms cross-fade; warm-to-cold = instant + skeleton. |

**Phase 3 acceptance:**
- `?nav-v2=1` activates; `?nav-v2=0` or absent = legacy behaviour.
- All Teams deep links resolve.
- ⌘K opens <50 ms; recents render <100 ms.
- Browser back/forward navigates tabs; no state loss.
- End-to-end smoke (enquiry log → claim → pitch → checkout poll → matter open) intact.
- No Phase 0 baseline metric regresses.
- LZ/AC sign-off before admin promotion.

### Phase 4 — Polish & Sweep

| # | Change | File | Detail |
|---|--------|------|--------|
| 4.1 | Inline-style purge (remainder) | `src/components/**`, `src/CustomForms/**`, `src/tabs/finance/**`, `src/tabs/Reporting/**` | Static literals → CSS classes/tokens. |
| 4.2 | Skeleton parity audit | all tabs | Skeleton mirrors final footprint — no shift on data arrival. |
| 4.3 | Toast cadence audit | grep user actions | Every async user action has start + success/fail toast. |
| 4.4 | Loading vocabulary | [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) | Three shapes only: skeleton (initial), shimmer (refresh), spinner (in-flight). |
| 4.5 | Empty-state audit | all lists/tables | Helix-styled: icon + guidance line + primary action. |
| 4.6 | Promote nav-v2 | remove `?nav-v2=1` gate | Delete old shell code; `setActiveTab` shim stays. |
| 4.7 | Tracker close-out | `docs/notes/UX_REALTIME_PROGRAMME.md` → `docs/notes/_archive/` | Final metrics; programme summary entry in `logs/changelog.md`. |

**Phase 4 acceptance:**
- `grep -r "style={{" src/` returns only dynamic values.
- All Phase 0 targets met or exceeded; numbers in tracker.
- New agent + LZ can run smoke walk and confirm parity + improvement.

---

## 4. Step-by-step execution order

1. **0.1 → 0.6** — Phase 0 ships as a single PR. Instrumentation + tracker + baseline only.
2. **1.1** — motion tokens (prerequisite for later PRs).
3. **1.2 → 1.6** — cursor layer. Can split into 2 PRs (hover purge, then inline-style + timing).
4. **2.1 → 2.3** — SSE discipline (independent of virtualization — ships first).
5. **2.4 → 2.5** — Prospects virtualization. Dedicated PR behind dev-preview; side-by-side comparison before promotion.
6. **2.6 → 2.7** — scroll restore + long-task overlay.
7. **3.1 → 3.2** — router shim + primary routes under `?nav-v2=1`.
8. **3.3 → 3.4** — command palette + registry.
9. **3.5 → 3.9** — context strip, prefetch, shortcuts, focus, motion.
10. **4.1 → 4.7** — polish sweep, promote, archive.

Each numbered item triggers a `logs/changelog.md` entry at completion.

---

## 5. Verification checklist

**Phase 0:**
- [ ] App Insights: `UX.Interaction.Latency` events visible with `durationMs`.
- [ ] Overlay gated: LZ/AC + `?ux-debug=1` only.
- [ ] Tracker doc exists; baselines recorded.

**Phase 1:**
- [ ] `hover.feedback` p95 <50 ms.
- [ ] `grep -r "e\.currentTarget\.style\." src/` empty.
- [ ] Visual smoke: no Helix-look drift.

**Phase 2:**
- [ ] `sse.inputBlock` p95 = 0.
- [ ] Prospects scroll ≥55 fps @ 500 rows.
- [ ] Warm tab switch p95 <200 ms.
- [ ] Claim badges update instantly (fast-path).
- [ ] `UX.LongTask` near zero.

**Phase 3:**
- [ ] `?nav-v2=1` toggles cleanly; legacy intact.
- [ ] Teams deep links resolve.
- [ ] ⌘K opens <50 ms.
- [ ] Browser back/forward works.
- [ ] End-to-end smoke passes.
- [ ] No baseline regression.

**Phase 4:**
- [ ] Static inline styles gone.
- [ ] Skeletons mirror final layout.
- [ ] Toasts consistent across async actions.
- [ ] Loading vocabulary documented + applied.
- [ ] Tracker archived; summary entry in `logs/changelog.md`.

---

## 6. Open decisions (defaults proposed)

1. **Router library.** Default: **`react-router` v6**. Rationale: mature, tree-shakable, integrates with existing Suspense boundaries. Alt: thin custom History wrapper — reject unless bundle cost measurable.
2. **Command registry shape.** Default: **declarative `src/app/commands.ts`** + `useRegisterCommands(commands)` hook. Rationale: avoids palette edits when adding tabs.
3. **Debug overlay rollout.** Default: **LZ/AC only** through Phase 1; promote to admins once Phase 1 ships. Rationale: admins get the new bar as proof.
4. **Motion token source.** Default: **`design-tokens.css` only** — no per-component duration literals.
5. **Virtualization library.** Default: **`react-window` `VariableSizeList`** — already used in `AdminDashboard.tsx`.
6. **SSE coalescing window.** Default: **120 ms**. Below perception threshold; buffers typical bursts without starving UI.

---

## 7. Out of scope

- CRA → Vite migration (separate stash candidate).
- Cross-app navigation (tab-app → instruct-pitch deep links beyond existing).
- Federated search **backend** (Phase 3 palette searches per-DB; unified index is a future stash).
- Mobile / touch optimisation pass.
- Service Worker / offline mode.
- Any change to cross-app contracts (enquiry-processing-v2 `/api/hub-claim`, `dealCapture` Azure Function, instruct-pitch DB contract) — read-only.
- Redux removal, Docker, IaC, `any` cleanup (parked elsewhere).

---

## 8. File index (single source of truth)

**Client (modified):**
- [src/app/App.tsx](../../src/app/App.tsx) — tab shell, SSE plumbing, router mount, nav warm-up, `setActiveTab` shim.
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — motion tokens.
- [src/components/Navigator.tsx](../../src/components/Navigator.tsx) — transition timing, active-state feedback.
- [src/components/AdminDashboard.tsx](../../src/components/AdminDashboard.tsx) — inline-style + hover purge.
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — wire ⌘K trigger (Phase 3).
- [src/components/command-centre/AppearanceSection.tsx](../../src/components/command-centre/AppearanceSection.tsx), [SystemStatusSection.tsx](../../src/components/command-centre/SystemStatusSection.tsx), [ProfileSection.tsx](../../src/components/command-centre/ProfileSection.tsx), [LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx) — hover purge.
- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) — hover purge.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — virtualization, stable props, inline-style cleanup.
- [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) — keep memo; confirm props stable.
- [src/CustomForms/AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) — hover + inline-style purge.
- [src/index.tsx](../../src/index.tsx) — SSE subscription integration.

**Client (new):**
- `src/components/DebugLatencyOverlay.tsx` — LZ/AC debug pill.
- `src/components/CommandPalette.tsx` — ⌘K surface (Phase 3).
- `src/components/ContextStrip.tsx` — persistent breadcrumb (Phase 3).
- `src/components/ShortcutsCheatSheet.tsx` — `?` cheat sheet (Phase 3).
- `src/app/router.tsx` — react-router mount + legacy shim (Phase 3).
- `src/app/commands.ts` — command registry (Phase 3).
- `src/utils/interactionTracker.ts` — perf.mark/measure wrapper.
- `src/utils/useDeferredSSE.ts` — coalescing hook (Phase 2).
- `src/utils/useScrollRestore.ts` — per-tab scroll memory (Phase 2).

**Server:**
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — `trackInteraction` helper.
- Existing `/api/telemetry` route — consumes client interaction batches (no schema change expected).

**Scripts / docs:**
- `docs/notes/UX_REALTIME_PROGRAMME.md` (NEW) — live tracker, baselines, decisions, deferrals.
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — motion tokens, loading vocabulary, empty-state spec.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase (and each ≥1-day sub-step).
- `/memories/repo/ux-realtime-programme.md` — short repo memory, updated at each phase close.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ux-realtime-navigation-programme
verified: 2026-04-19
branch: main
touches:
  client:
    - src/app/App.tsx
    - src/app/styles/design-tokens.css
    - src/components/Navigator.tsx
    - src/components/AdminDashboard.tsx
    - src/components/UserBubble.tsx
    - src/components/command-centre/AppearanceSection.tsx
    - src/components/command-centre/SystemStatusSection.tsx
    - src/components/command-centre/ProfileSection.tsx
    - src/components/command-centre/LocalDevSection.tsx
    - src/tabs/home/QuickActionsBar.tsx
    - src/tabs/enquiries/Enquiries.tsx
    - src/tabs/enquiries/components/ProspectTableRow.tsx
    - src/CustomForms/AnnualLeaveModal.tsx
    - src/index.tsx
  server:
    - server/utils/appInsights.js
  submodules: []
depends_on: []
coordinates_with:
  - enquiries-live-feed-freshness-wiring   # same file (Enquiries.tsx), different regions: that brief wires useFreshIds at L1657/L4192–L4222 + card components; this programme virtualizes the prospects table L8434–L8600 and cleans inline styles L6059–L6095. Ship freshness wiring first if both are in flight — it keeps card props simple before virtualization. No region overlap.
  - forms-stream-persistence               # shared dir server/utils (appInsights.js); no shared file. Both extend telemetry helpers — coordinate on helper naming if shipped near-simultaneously.
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Never wrap `setActiveTab()` in `startTransition()`.** Documented in `/memories/repo/home-boot-performance.md` — it pushed Home→Matters/Forms into multi-second delays. Tab activation stays synchronous. `useDeferredSSE` uses `startTransition` only inside the SSE apply path, never on user-initiated state.
- **`claimStateChanged` SSE must bypass the 120 ms buffer.** Claim pills on pipeline cells are the highest-signal live indicator — delaying them reads as "stale/wrong".
- **ProspectTableRow equality already correct.** `areRowPropsEqual` in [ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) L492–L530 is custom; don't touch. The parent is what needs stabilising.
- **Virtualization footprint must match current rows pixel-identically.** Row heights vary (expanded vs collapsed) → use `VariableSizeList`, not `FixedSizeList`. Measure via ref callback on first render; cache heights by row id.
- **Teams deep links use `?tab=` query param.** Router must intercept this on first mount and convert to route. Do not break.
- **Home boot budget is fragile.** Enquiries chunk warm-up is intentionally delayed; Matters warm-up must not wait on Teams host context. Confirm both still behave after router shim lands.
- **No new colours, radii, or fonts.** Helix design system is fixed. Only motion tokens are additive. Visual regression checks must include UserBubble (the canonical reference).
- **Cross-app contracts are read-only.** `POST /api/hub-claim` (enquiry-processing-v2, x-api-key `2011`), `dealCapture` Azure Function, and the instruct-pitch DB contract must not change in any phase here.
- **Dev-preview gate = `canSeePrivateHubControls()`** (LZ + AC), not `isAdminUser()`. Rollout ladder: dev preview → admin → all users. Never use `isAdminUser()` to gate a feature still in development.
- **`style={{}}` is not always bad.** Dynamic values (runtime transforms, computed widths, animation keyframe hooks) stay inline. Only static colour/spacing/border literals move to CSS classes.
- **Overlay must be ignorable.** Collapsible; default hidden if user dismisses once in session. Don't let the measurement tool become the annoyance.
