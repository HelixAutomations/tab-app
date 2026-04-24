# Home conversion panel — rebalance alongside To Do

> **Purpose of this document.** Self-contained brief that any agent can pick up cold and execute. Every file path, line ref, and decision is captured below.
>
> **How to use it.** Read once. Implement Phase A first (visual rebalance). Phase B (structural simplification) only after A ships and the team has eyes on the new balance for a week.
>
> **Verified:** 2026-04-20 against branch `main`. Re-verify line refs if opened >30 days later.

---

## 1. Why this exists (user intent)

User has just taken delivery of the ToDo slot (`replacePipelineAndMatters` toggle) which renders To Do at 50/50 width with the Conversion panel. The moment the pipeline+matters stack is swapped for a simpler list-style column, the Conversion panel looks unbalanced — too tall, too data-dense, competing with the calmer To Do list rather than partnering it.

Verbatim:
> "now that the approach to this space changed, i want the conversion box scoped a rework also, since it doesn't quite go/work well in tandem with the new to do list. needs to be balanced."

What the user **is** asking for:
- A Conversion panel that reads as a peer of the ToDo panel, not a dashboard-within-a-dashboard.
- Restored visual balance at the 1fr : 1fr split introduced by `todoSlot`.
- This brief **scoped**, ready to action next.

What the user is **not** asking for:
- Removing Conversion functionality.
- Changing Conversion when the toggle is **off** (legacy 1fr : 2fr pipeline layout stays).
- Rewriting the chart library or the Conversion data model.

---

## 2. Current state — verified findings

### 2.1 Conversion panel — where it lives

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
- Pipeline-row grid: L5278 — `gridTemplateColumns: isNarrow ? '1fr' : (hidePipelineAndMatters ? (todoSlot ? '1fr 1fr' : '1fr') : '1fr 2fr')`.
- Conversion column header + card: L5281–L5298.
- Experimental Conversion body (the one that renders today when `useExperimentalConversion` is true): L5318–L5479.
- Legacy Conversion body (shown only when experiment is off): L5480–L5529+ (tile grid with Today/This Week/This Month + sub-percentage).

### 2.2 Current density of the experimental body

- **Row tabs** (Today / Week / Month / Quarter) — 4 pill buttons, 10/12px padding. L5320–L5353.
- **Hero KPI block** — 36px number, comparison copy line, previous/current sub-boxes (two stat tiles). L5361–L5390.
- **Chart block** — legend row + chart (`renderConversionChart`) + conditional AoW mix stack underneath (progress bar + up to 4 legend chips). L5391–L5460.
- **Narrow-screen AoW mix block** — duplicated footer when `isNarrow`. L5483–L5516.

Net effect at 1fr : 1fr: a tall, multi-section surface on the left vs a quiet list on the right. Height is forced to `primaryRailMinHeight = 520` (L3444) — the Conversion panel fills this comfortably; the ToDo panel, even with `minHeight: primaryRailMinHeight` applied, carries mostly whitespace unless there are many items.

### 2.3 Height contract

- `primaryRailMinHeight` — [OperationsDashboard.tsx L3444](../../src/components/modern/OperationsDashboard.tsx) — `isNarrow ? undefined : (useExperimentalConversion ? 440 : 520)`.
- Skeleton matches this via `.home-dashboard-skeleton-conversion { min-height: 520px; }` and the new `.home-dashboard-skeleton-todo { min-height: 520px; }` — see [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) L110–L140.
- Live ToDo column already has `minHeight: primaryRailMinHeight` applied after the sibling HOME_TODO brief delivery.

### 2.4 What "imbalance" actually looks like

- Conversion carries **3 visual rows of content** (tabs, hero, chart+mix). ToDo carries **N list rows**. When N < ~6 the right column feels empty next to Conversion.
- Conversion's hero KPI at 36px reads as the dominant element on the home page — heavier than the billing rail it's supposed to complement.
- The AoW mix footer in the chart block is the third "tier" of information; at 1fr : 1fr it now competes visually with the ToDo list rather than sitting under a sibling pipeline column.

### 2.5 Companion surfaces (do not break)

- **Billing rail** above this row — [OperationsDashboard.tsx L4345](../../src/components/modern/OperationsDashboard.tsx). Its density should remain the lightness benchmark. The reworked Conversion should feel closer to the billing rail than to a standalone report tile.
- **ImmediateActionsBar** — rendered inside the ToDo slot (via `todoSlot` prop) — [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) right column L5551-ish (the block added in the HOME_TODO_SINGLE_PICKUP_SURFACE brief). Density baseline for the right column.
- **HomeDashboardSkeleton** — [src/tabs/home/HomeSkeletons.tsx L317](../../src/tabs/home/HomeSkeletons.tsx) — already handles the `hidePipelineAndMatters` prop. Any density/height change in the live Conversion panel **must** be mirrored in this skeleton so first paint doesn't pop.

---

## 3. Plan

Two phases. A is visual rebalance with no structural changes. B is a deeper simplification that can wait until A has been observed.

### Phase A — Visual rebalance (ship first, low risk)

| #  | Change | File | Detail |
|----|--------|------|--------|
| A1 | Conversion density gate on `hidePipelineAndMatters` | [OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | When `hidePipelineAndMatters && todoSlot`, compute `conversionCompact = true`. Use this to reduce: hero KPI size 36px → 28px; outer padding 14/12 → 10/10; chart min-height reduced so the chart+mix block is ~85% of current. |
| A2 | Drop hero delta pill weight when compact | L5365–L5371 | Keep the delta label but downgrade font weight 700→600 and letter-spacing tighter. Dashboard already has 36px KPI; in compact the delta should not compete with the number. |
| A3 | Fold AoW mix into single-row legend when compact | L5418–L5459 | In `conversionCompact` mode, hide the progress bar; render only the 3-chip legend row inline under the chart. Recovers ~40px. |
| A4 | Sub-period comparison block | L5381–L5390 | In `conversionCompact`, collapse `grid-template-columns: 1fr 1fr` two-tile block into a single one-line breakdown: `"{currentLabel} · {n} enq · {m} mat | {previousLabel} · {n} · {m}"`. |
| A5 | `primaryRailMinHeight` recalibration | L3444 | Add branch: `hidePipelineAndMatters && todoSlot ? 420 : (useExperimentalConversion ? 440 : 520)`. Lowers the shared floor to match reduced Conversion footprint. Update `conversionRailMinHeight` callers. |
| A6 | Skeleton mirror | [EnhancedHome.css L116 + L125](../../src/tabs/home/EnhancedHome.css) | Add `.home-dashboard-skeleton-main--todo .home-dashboard-skeleton-conversion { min-height: 420px; }` and `.home-dashboard-skeleton-main--todo .home-dashboard-skeleton-todo { min-height: 420px; }`. Prevents skeleton→live pop in todo mode. |
| A7 | Verify ImmediateActionsBar fills 420px | [src/components/modern/ImmediateActionsBar.tsx](../../src/components/modern/ImmediateActionsBar.tsx) | Check its root has `height: 100%` and `flex: 1` so list scrolls rather than leaving dead whitespace when items are sparse. If not, add. |

**Phase A acceptance:**
- With `replacePipelineAndMatters` toggled on, Conversion + ToDo panels read as peers — same visual weight, same height, same density budget.
- With the toggle **off**, Conversion renders identically to today (no regression on the 1fr : 2fr layout).
- Skeleton → live transition shows no height pop and no column-width pop in either mode.

### Phase B — Structural simplification (only after A has run in prod for a week)

#### B1. Extract `ConversionPanel` component

Currently the Conversion body is ~200 lines inline in OperationsDashboard. Extract to `src/components/modern/ConversionPanel.tsx` with props:

```ts
type ConversionPanelProps = {
  items: ConversionItem[];
  selectedKey: ConversionKey;
  onSelect: (key: ConversionKey) => void;
  isDarkMode: boolean;
  compact: boolean;            // drives Phase A density tier
  aowMix: AowMixEntry[];
  onOpenInsight: (target: InsightTarget) => void;
  insightTarget: InsightTarget | null;
  loading: boolean;
  renderChart: (item: ConversionItem) => React.ReactNode;
};
```

Benefits:
- Removes ~200 lines from OperationsDashboard.
- Makes the `compact` prop an explicit contract rather than inline conditionals.
- Enables a future "sparkline only" variant without touching the dashboard shell.

#### B2. Consolidate duplicated AoW mix blocks

Lines 5418–5459 (chart footer) and 5483–5516 (narrow-screen footer) render the **same** AoW mix UI. Extract to an `AowMixStrip` sub-component that accepts `variant: 'inline' | 'footer' | 'compact-legend-only'`.

#### B3. Retire the legacy (non-experimental) Conversion body

Lines 5480–5529+ render the old tile grid only when `useExperimentalConversion` is false. If telemetry confirms the experiment is the default everywhere, delete the legacy branch and simplify the `renderConversionSkeleton`/`showExperimentalConversionSkeleton` split. Track with Application Insights event `Conversion.Experiment.RollbackRequested` before deletion.

---

### Phase C — Chart integration + enquiry/matter clarity + prospect chip baskets (scoped 2026-04-20)

> Added after A scoped. Driven by user follow-up:
> > "id like the chart to be more integrated into the component as a subtle supporting graphic thats easily understood, and not confusing or heavy/overwhelming."
> > "id also like it to be clearer in whats its showing as in when enquiries and when matters. possibly even removing the enquiry mix and working a new version of the mix into both the enquiry and matter sections, to show each user, their recent enquiries for the selected period? almost like a little basket of little prospect chips with the names or something subtle to distinguish them, and show a subtle colour for the area of work so the user can see the order and the colours etc. cleanly in each section."

C is the deepest of the three phases. It changes the **information architecture** of the Conversion panel, not just the density. Ship A first; run B1 (extract) to unblock C.

#### C1. Restructure: two banded sections instead of hero + chart + mix

Today the panel is: `[tabs] → [hero KPI + comparison line + 2 sub-tiles] → [chart with legend] → [AoW mix footer]`. Four visual tiers competing for attention. Swap to two **banded sections**, each one showing a metric + a subtle supporting graphic + a prospect-chip basket:

```
┌─ Conversion (card header) ──────────────────────┐
│  Today · Week · Month · Quarter  (tabs)         │
├─────────────────────────────────────────────────┤
│  ENQUIRIES                                      │
│  28          ▁▂▄▆▇▆▅▃▁   (inline sparkline)     │
│  from last week                                 │
│  [AB]Smith  [CD]Jones  [LZ]Patel  +5 more       │
├─────────────────────────────────────────────────┤
│  MATTERS                                        │
│  6 · 21%     ▁▁▂▃▄▄▃   (inline sparkline)       │
│  from last week                                 │
│  [AB]Smith  [LZ]Patel  +2 more                  │
└─────────────────────────────────────────────────┘
```

Each section has:
- **Label** — `ENQUIRIES` / `MATTERS` uppercase 9–10px (removes ambiguity about what's being counted).
- **Big number** — 24px, bold. Matters row also shows conversion %.
- **Inline sparkline** — 60–80px wide, 16–20px tall, sits to the right of the number. Supporting graphic, not hero.
- **Comparison copy** — 10px muted, single line ("from last week", "vs. prior period" etc.).
- **Prospect-chip basket** — horizontal row of chip pills, each showing the fee-earner initials or the prospect's short name, tinted by AoW colour. Click → opens Unclaimed/matter drilldown.

The standalone AoW mix footer (progress bar + legend) is **removed**. AoW colour shows up *inside* each chip, so the mix is visible by observation of the basket rather than summarised separately.

#### C2. Chart redesign — from feature to supporting graphic

The current chart uses `renderConversionChart(item)` which renders a full-height SVG with axes, dual-line (enquiries solid + enquiries dashed previous) and stacked bar (matters current + matters previous). It dominates the panel.

Replace with **two tiny sparklines**, one per section, each showing only that metric's current-period time series:

| Aspect | Current | New |
|---|---|---|
| Height | chart fills ~120–180px | sparkline 16–20px |
| Axes | Y tick labels + X labels | none |
| Comparison series | previous period dashed line + previous matter bars | omit from sparkline; dash the last 1–2 points if current period still running |
| Legend | separate row above chart | implicit (which section owns it) |
| Colour | brand `colours.blue` for enquiries, `colours.highlight` bar for matters | same colours, but `strokeWidth: 1.25`, `opacity: 0.7`, no fill under the line |
| Hover | full tooltip | title attribute only ("20 Apr: 3 enquiries") |

`renderConversionChart` stays usable for the current wide-screen drilldown surface (billing insight modal etc.) but the Conversion panel itself uses `renderConversionSparkline(item, 'enquiries' | 'matters')` — a new sibling renderer. Extract sparkline generation to a pure function so it's trivially testable.

#### C3. Prospect-chip basket (new component)

New component: `src/components/modern/ConversionProspectBasket.tsx`.

```ts
type ConversionProspectBasketProps = {
  items: ProspectChipItem[];        // already filtered to section (enquiries or matters) and period
  section: 'enquiries' | 'matters';
  maxVisible?: number;              // default 6; overflow shows "+N more"
  isDark: boolean;
  onOpenProspect?: (id: string) => void;
  onOpenAll?: () => void;           // clicking "+N more" or the basket container
};

type ProspectChipItem = {
  id: string;
  displayName: string;              // short label — "Smith", "J. Patel", or initials fallback
  feeEarnerInitials?: string;       // optional initial-avatar prefix
  aow: string;                      // drives colour via `aowColor(aow)`
  matterOpened?: boolean;           // matters section: true; enquiries: false
};
```

Chip design:
- 22–24px tall pill, `borderRadius: 2` (not 999 — aligns with Helix 0-radius rule; pills only in specific cases).
- Left 2–3px accent strip in `aowColor(aow)` (same pattern as `PanelActionRow`).
- Text 10–11px, initials 9px bolded if rendered.
- Hover: lift 0.5px, border brightens to `aowColor(aow)` at 0.5 alpha.
- Max ~6 visible; overflow `+N more` pill opens the existing Unclaimed/Insight drilldown.

The basket row scrolls horizontally on overflow with no scrollbar chrome (`overflow-x: auto; scrollbar-width: none`) — matches existing chip row patterns elsewhere.

#### C4. Data contract — what the panel needs

The existing `ConversionComparisonItem` provides aggregates only (`currentEnquiries`, `currentMatters`, `currentAowMix`). For the chip basket it needs per-item lists. Options:

**Option A (preferred): extend `ConversionComparisonItem` server-side.**
```ts
interface ConversionComparisonItem {
  // ...existing...
  currentEnquiryProspects?: ProspectChipItem[];   // enquiries in the period, capped to ~20
  currentMatterProspects?: ProspectChipItem[];    // matters opened in the period, capped to ~20
}
```
Cap at ~20 each; anything over becomes `+N more`. Keep payload lean.

**Option B: reuse existing unclaimed / insight endpoints.**
`openInsight('today'|'weekToDate'|'monthToDate')` already fetches per-enquiry records. Use the same cached data to derive the basket. Downside: no data for the "Quarter" tab (no `quarter` insight target today); would need to add `'quarter'` to `InsightPeriod` + the fetcher.

Recommend **Option A** — single payload, single render path. Flag for backend ticket: `GET /api/conversion/comparison` returns `currentEnquiryProspects` + `currentMatterProspects` for each item.

Data source: enquiries table (enquiries) joined to Matters (matter-open flag + AoW). Reuse the same AoW bucket logic as `currentAowMix` (`aowColor(key)` resolves via existing utility).

**Privacy note:** prospect chip text must default to **last name + initial** (`"J. Smith"`), not full name. Luke Test appears as `"L. Test"`. This matches the communication-framework privacy posture — no PII broadcast in a dashboard surface.

#### C5. Motion + ordering

- Chips animate in with a 25ms staggered fade (reuse `iabChipIn` keyframe).
- Order: most recent first (sort by `createdAt` descending). Tied records fall back to AoW alpha order so the same basket renders the same colour sequence on repeated views.
- Matters section shows chips in order of matter open date (not enquiry date) so the "latest win" is leftmost.

#### C6. Loading + empty states

- Skeleton: two banded sections, each with a grey 24px number block + 60×18 sparkline rectangle + 3 shimmer chips. Mirror in `HomeDashboardSkeleton`.
- Empty enquiries ("No enquiries this period"): big number renders `0`, sparkline hidden, basket replaced with a single muted line "No enquiries yet".
- Empty matters + non-zero enquiries: matters row shows `0 · 0%`, "No matters opened yet", no basket.
- Both empty: render a single compact empty state (matches `EmptyState` pattern in ImmediateActionsBar).

#### C7. Files touched

| File | Change |
|---|---|
| [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Replace inline Conversion body with new 2-section structure (or consume the extracted `ConversionPanel` from B1). Remove chart + AoW mix block. |
| [src/components/modern/ConversionPanel.tsx](../../src/components/modern/ConversionPanel.tsx) (NEW from B1) | Implements the new 2-section layout. |
| [src/components/modern/ConversionProspectBasket.tsx](../../src/components/modern/ConversionProspectBasket.tsx) (NEW) | The chip basket row. |
| `src/components/modern/conversionSparkline.ts` (NEW) | Pure function returning an inline SVG path for a metric series. ~40 lines. |
| `server/routes/conversion.js` (or wherever `/api/conversion/comparison` lives) | Extend payload with `currentEnquiryProspects` + `currentMatterProspects`. Apply Application Insights event `Conversion.Prospects.Attached` on success. |
| Server type contract (shared enum / d.ts if any) | Add `ProspectChipItem` type. |
| [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) | New skeleton layout matching the 2-section design. |
| [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) | Tokens for basket scroll area + sparkline viewport. |
| [logs/changelog.md](../../logs/changelog.md) | Entry referencing brief id. |

#### C8. Acceptance criteria

- [ ] Two clearly labelled sections ("ENQUIRIES", "MATTERS") — never ambiguous what the number refers to.
- [ ] Chart replaced with inline sparkline per section; sparkline is ≤22px tall and sits beside the number, not below it.
- [ ] Old AoW mix progress bar + legend removed entirely.
- [ ] Prospect chip basket renders in each section with up to 6 chips + "+N more" overflow.
- [ ] Chip colour = AoW colour (left accent strip), same `aowColor(key)` tokens used elsewhere.
- [ ] Names redacted to "J. Smith" format; no full names on the surface.
- [ ] Clicking a chip opens the existing prospect/matter drilldown; clicking "+N more" opens the full insight.
- [ ] Skeleton mirrors the new layout — no first-paint pop.
- [ ] Toggle **off** (legacy 1fr:2fr pipeline) still renders the old Conversion exactly as today.
- [ ] Narrow-screen (`isNarrow`) still stacks the two sections vertically.
- [ ] App Insights event `Conversion.Prospects.Clicked` fires on chip click, `Conversion.Prospects.OverflowOpened` on "+N more".
- [ ] No console errors when the payload returns without `currentEnquiryProspects` (graceful fallback to section without a basket).

#### C9. Dependencies + phasing

- **Do B1 first** — extract `ConversionPanel`. C is far easier against a standalone component than against the inline body.
- **Do C in a feature flag** — introduce `useConversionBaskets` as an admin-only flag (`canSeePrivateHubControls()`) for one iteration, then promote to `isAdminUser()` once the server payload ships, then remove the flag.
- **Backend ticket first.** Don't implement the frontend until `/api/conversion/comparison` returns the prospect lists.

  > **Correction post-implementation (2026-04-20):** no server route for `/api/conversion/comparison` exists — the payload is built client-side in `src/tabs/home/Home.tsx` inside the `liveConversionComparison` memo (L4104). The prospect lists are collected there directly from `userEnquiries` + `userMatters`. Phase C shipped without a backend ticket; this note supersedes "backend ticket first".
- **Coordinates with** `home-todo-single-pickup-surface` (shared panel surface contract) and `home-animation-order-and-demo-insert-fidelity` (for chip fade-in sequencing).

#### C10. Open questions (flag to user before building)

1. Should "user" in "show each user their recent enquiries" mean **fee-earner initials** on the chip (to read as "who owns this") or the **prospect's own name** (to read as "who came in")? Default assumption: **prospect name**, with fee-earner initials as a small prefix avatar — so you see both.
2. Is there a hard cap on chip count? Default: **6 visible + overflow pill**. Raises to 8 if the payload typically exceeds 6 for "Quarter".
3. Should a matter chip visually distinguish from an enquiry chip (e.g. a tiny tick icon)? Default: **yes**, a 10px check icon in the top-right corner of matter chips only.
4. Privacy posture on chip text. Default: **last name + initial** (`J. Smith`). Confirm — if full names are fine on an internal surface, drop the redaction.

---

### Phase D — Post-C refinement (observed regressions + missing cues)

> **Added 2026-04-20** after Phase C shipped. User feedback: chips too loud, sparklines too quiet, conversion ratio cue lost from the surface, panel feels like "basic sections with text" not a "dashboard pocket", and ToDo panel now over-tall relative to the shorter Conversion.

**Verbatim:**
> "the names need to be more subtle than that. the purpose is to indicate a summary of the recent stream for that user, and not enable new chips for yet another space to keep/see enquiries."
>
> "the charts also almost fully disappeared. …the supplementing trend is good also but it gets lost in the view. come up with something in between."
>
> "when hovering over the sections, reveal a subtle chevron, which indicates theres an action the user can invoke. this will show a subtle summary modal reference of the underlying data making this up, but subtly, and almost read only. no real action to be taken other than the user being able to click through to a specific spot in that enquiry."
>
> "since the conversion box no longer needs too much height, the to do space should respond to that, and cap evenly to it so it works together."
>
> "theres no bit about conversion, in the left tho. there used to be a separate conversion cue thats almost under/account for both enquiries and matters."

#### D1. Demote the prospect chip strip to a "trail"

**Intent:** the bottom row of each section should read as a *summary trail of recent activity*, not a clickable index of enquiries. No action rides on the individual items. A user glances at it, clocks the rhythm/colour/volume, and moves on.

Changes to `ConversionProspectBasket.tsx`:

| Aspect | Current (Phase C) | Phase D target |
|---|---|---|
| Chip fill | filled pill with 2.5px AoW accent strip | **no fill**; just a 5–6px AoW-coloured dot + 1 word (`Smith`, or initials only) |
| Font size | 10–11px | 9.5px, letter-spacing `0.02em`, opacity `0.75` (dark) / `0.65` (light) |
| Fee-earner initials prefix | visible on every chip | **removed** — too much signal; the section already tells you whose stream this is |
| Hover state | row hover + lift | none (not interactive) |
| Click handler | opens drilldown | **removed** — trail is decorative/summary only |
| Matter tick glyph | 10px green tick | kept but shrunk to 7px and inlined before the dot |
| Overflow | `+5 more` pill, clickable | `+5` plain muted text, non-interactive |
| Animation | 25ms stagger `convProspectChipIn` | keep; reduces eye-jump |
| Empty state | "No enquiries yet" line | unchanged |

Implementation notes:
- Rename the component *internally* to keep the same file (`ConversionProspectBasket.tsx`) — the public contract still emits a "summary strip", just with a different visual weight. The `onOpenProspect` / `onOpenAll` callbacks become optional and unused from the panel path (leave them in the prop type for future re-use).
- Remove the per-chip focus ring and `role="button"`; the strip is `aria-hidden` and the section header's hover chevron (D3) carries the interaction.

#### D2. Bring the chart back — as a "pocket chart", not a hero

The sparkline was the right instinct but too subtle on its own. Restore visible signal by giving each section a **pocket-sized layered mini-chart**, not a full-height chart.

New renderer: `renderConversionPocketChart(item, metric)` (replaces the current inline `buildConversionSparklineSVG` call in `OperationsDashboard.tsx` rendering path).

Spec:
- Dimensions: **140–180px wide × 38–44px tall** per section (was 72×18). Sits to the right of the number group; pushes the prospect trail to its own row below.
- **Layers:**
  - Faint gradient area fill under the current-period line (opacity `0.12–0.18`, colour = section colour).
  - Current-period line: 1.5px stroke, full-opacity section colour (`colours.blue` enquiries, `colours.highlight` or a tuned matter tone).
  - Previous-period line: 1px dashed stroke, opacity `0.4`, same hue — restores the "vs last" signal without the legend row.
  - Last-point dot: 3px filled circle (eye anchor).
  - X-axis baseline: 1px `rowBorder`, opacity `0.3`. No tick labels. Three vertical grid lines at the 25/50/75% marks, opacity `0.08` (quiet structure).
- **Title attribute** only for tooltip (hover text); no full tooltip component.
- **Flat-data fallback**: if the whole series is zero, render a single 1px dashed baseline with a small `—` glyph centred — the absence of activity is itself signal.

The prior `conversionSparkline.ts` stays (still useful for micro-contexts) but the panel path switches to the pocket-chart renderer.

#### D3. Section hover chevron → read-only preview modal

Each section (ENQUIRIES, MATTERS) gains a **hover affordance**: a subtle chevron (`ChevronRight` 12px, `muted` colour, opacity `0.4` at rest, `0.85` on hover) in the top-right of the section header. Section background lifts `2–3%` on hover (using `rowHover`/`tileHover` util) to echo the pattern used elsewhere.

**Click anywhere on the section** → opens a **read-only preview modal** summarising the underlying stream for that section/period. The modal is *not* the existing Unclaimed drilldown; it's a new, lighter surface.

New component: `src/components/modern/ConversionStreamPreview.tsx`.

Shape (read-only; no bulk action, no filters, no edit):

```
┌──────────────────────────────────────────────────┐
│  Enquiries · This week                        ✕  │
├──────────────────────────────────────────────────┤
│  28 enquiries · 6 converted (21%)                │
│  [ pocket chart, scaled up to ~80px tall ]       │
├──────────────────────────────────────────────────┤
│  AoW mix                                         │
│  ● Commercial 12  ● Property 9  ● Construction 4 │
├──────────────────────────────────────────────────┤
│  Recent stream (20 most recent)                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ 20 Apr 14:03  Smith        Commercial   →  │ │
│  │ 20 Apr 11:47  J. Patel     Property     →  │ │
│  │ 19 Apr 16:20  Jones        Commercial   →  │ │
│  │ …                                          │ │
│  └─────────────────────────────────────────────┘ │
│   Click a row to open the enquiry.               │
└──────────────────────────────────────────────────┘
```

Rules:
- Backdrop: `rgba(0, 3, 25, 0.6)` with blur 6px (matches existing modal convention).
- Container: borderRadius `0`, border `1px solid rowBorder`, panel surface `dark.cardBackground` / `light.background`.
- Each row is a `button` that dispatches the existing route used by the matter/enquiry drilldown — for enquiries: `openInsight({ kind: 'enquiry', id })` routing to the unclaimed detail surface; for matters: the matter drilldown. **The modal itself carries no write actions.** No CTA button. Close via `✕` or backdrop click.
- Keyboard: ESC closes, ↑/↓ moves row focus, Enter opens the focused enquiry/matter.
- Data comes from the same `currentEnquiryProspects` / `currentMatterProspects` arrays already populated on `ConversionComparisonItem` — unredacted variant needed for this modal. **Add a second field `currentEnquiryProspectsFull` / `currentMatterProspectsFull`** carrying `{ id, displayName, feeEarnerInitials, aow, opened: Date, matterOpened }` without redaction, since the modal is the permitted surface for full names. The trail row (D1) continues to use the redacted list.
- Track `Conversion.Stream.Opened` + `Conversion.Stream.RowClicked` in App Insights.

#### D4. Restore a compact conversion-rate cue on the left

The old panel carried a standalone conversion % that read across both enquiries and matters (the "under/account for both" cue). It's gone from Phase C. Restore it as a single **sub-header strip** between the section tabs and the two sections:

```
│  Today · Week · Month · Quarter  (tabs)         │
├─────────────────────────────────────────────────┤
│  Conversion  21%   ↑ 3pts vs last week          │ ← new strip, 9–10px label + 13px %
├─────────────────────────────────────────────────┤
│  ENQUIRIES  …                                   │
│  MATTERS    …                                   │
```

Spec:
- Single row, `10px 14px` padding, `1px solid rowBorder` bottom divider.
- Label uppercase 9.5px muted; `%` 13–14px, weight 600, colour `text`.
- Delta pill (if previous basis exists): 9.5px, colour `colours.green` / `colours.cta`, `↑`/`↓` prefix.
- Caveat acknowledged: multi-matter-per-client skews the ratio. Do **not** attempt to de-dupe on client here — the user has explicitly said they're not precious about that. Render `currentPct` straight from the existing payload.
- Clicking the strip opens the same read-only preview modal as MATTERS section (it's the conversion lens).

#### D5. Height rebalance — ToDo follows Conversion

Phase C's new Conversion body is shorter (no chart dominance, no AoW footer). The ToDo column still floors at `primaryRailMinHeight = 440` and visibly over-reaches.

Target: **both panels read the same measured height and cap together.**

Approach:
- Introduce `useLayoutEffect` in `OperationsDashboard.tsx` that measures the rendered Conversion card height (via a ref) and writes it to a local state `conversionMeasuredHeight`.
- Apply `maxHeight: conversionMeasuredHeight` (or `height`) to the ToDo column's outer container when `hidePipelineAndMatters && todoSlot` and `!isNarrow`.
- Drop `primaryRailMinHeight` floor to `360` when `hidePipelineAndMatters && todoSlot` — the measured-height contract owns the height, the floor just prevents collapse during skeleton.
- Update `.home-dashboard-skeleton-conversion` and `.home-dashboard-skeleton-todo` to `min-height: 360px`.
- Narrow-screen (`isNarrow`): each panel still free-flows; no measured linking.

The ToDo column's inner list gets `overflow-y: auto` so longer todo lists scroll inside the matched height rather than pushing the row taller.

#### D6. Verification checklist

- [ ] Chips in both sections read as a quiet trail — no hover, no click, dot + 1 word, ≤ opacity 0.75.
- [ ] Pocket chart visible at-a-glance (~140×40), with previous-period dashed line, flat-data fallback renders a baseline + `—`.
- [ ] Hover on a section reveals a chevron; click opens the read-only stream preview modal.
- [ ] Stream preview modal lists up to 20 rows, each opens the full enquiry/matter drilldown; no write actions in the modal.
- [ ] Conversion sub-strip shows `%` and delta vs previous period; click opens the matters stream preview.
- [ ] ToDo column height matches Conversion card height at 1fr:1fr. Longer todo lists scroll inside the column.
- [ ] Skeleton mirrors the new heights — no first-paint pop.
- [ ] App Insights events fire: `Conversion.Stream.Opened`, `Conversion.Stream.RowClicked`, `Conversion.SubHeader.Clicked`.
- [ ] Toggle off (legacy) path unchanged.

#### D7. Files touched

| File | Change |
|---|---|
| `src/components/modern/OperationsDashboard.tsx` | Rework experimental Conversion body: add sub-strip (D4), replace sparkline call with `renderConversionPocketChart` (D2), add section hover/chevron + modal dispatch (D3), height measurement for ToDo matching (D5). |
| `src/components/modern/conversionPocketChart.ts` (new) | Pure renderer — area fill + current line + dashed previous line + last-point dot. |
| `src/components/modern/ConversionProspectBasket.tsx` | Demote to trail: remove fills, hover, click, fee-earner prefix; dot+word rendering (D1). |
| `src/components/modern/ConversionStreamPreview.tsx` (new) | Read-only modal surface (D3). |
| `src/tabs/home/Home.tsx` | Add unredacted `currentEnquiryProspectsFull` / `currentMatterProspectsFull` arrays alongside redacted ones (D3). |
| `src/tabs/home/EnhancedHome.css` | Reduce skeleton min-heights to 360px (D5); add `.home-conversion-section:hover` chevron reveal rule. |
| `src/tabs/home/HomeSkeletons.tsx` | Mirror new layout: sub-strip skeleton + two sections each with pocket-chart skeleton + trail skeleton. |

---

### Phase E — ToDo item actions reuse the displaced enquiry/matter content

> **Added 2026-04-20.** User observation:
> *"we changed the to do space on the right, which i love btw, but it just means we lost from view the work we did on/re the enquiries and matters. btu thats ok, because we can use that for the actions of the to do for that specific to do item, do you see?"*

**Intent:** the rich enquiries/matters work that used to live in the left column (pipeline + matters stack) now has a natural second life as the *per-item action surface* for a ToDo card. When the user interacts with a ToDo item, its relevant enquiry/matter context surfaces inline as the action pane.

#### E1. Contract

Each ToDo item already carries (or can trivially carry) one or more of:
- `enquiryId` — if the todo stems from an enquiry
- `matterId` — if it stems from a matter
- `prospectId` — for upstream deal surfaces

The action pane is a **read-then-act surface** opened *from* the ToDo item — either on hover-reveal of a chevron (mirroring D3's pattern), or on click of a secondary affordance on the card.

#### E2. Surface options (decide in build)

**Option A — inline expansion** (preferred). Clicking the item expands the card in place, revealing a mini enquiry/matter summary (status, key dates, next step, fee-earner, AoW, short description) + 1–3 quick actions (e.g. "Mark followed up", "Open in Unclaimed", "Convert to matter"). The expansion matches the card width, animates height, and collapses on click-elsewhere. Other items in the list shift down smoothly.

**Option B — side-sheet** (fallback if list cramps too easily). Clicking the item opens a right-side sheet ~360px wide anchored to the ToDo column's right edge; list rows stay put. Less preferred because it fights the existing 1fr:1fr split, but cleaner visually if items are dense.

Default: **A for enquiry/matter context**, **E3 actions as inline buttons inside the expansion**.

#### E3. Minimum viable actions

For enquiry-backed ToDos:
- "Open enquiry" → routes to Unclaimed detail (same drilldown as D3 modal rows use)
- "Mark followed up" → writes follow-up timestamp via existing endpoint
- "Snooze until…" (optional)

For matter-backed ToDos:
- "Open matter" → Clio matter deep link
- "Log quick time" (optional, Phase F)

#### E4. Files touched

| File | Change |
|---|---|
| `src/components/modern/ImmediateActionsBar.tsx` | Add expansion state per item + render expanded pane. |
| `src/components/modern/todo/TodoItemExpandedPane.tsx` (new) | Renders the enquiry/matter summary + action buttons. |
| `src/components/modern/OperationsDashboard.tsx` | Pass enquiry/matter lookup maps into `todoSlot` (already available via `deferredEnquiries`/`normalizedMatters`). |

#### E5. Dependency on D

E depends on D5 being shipped first — otherwise the ToDo column's height isn't stable and the inline expansion will push the panel taller than Conversion, re-breaking the balance.

#### E6. Verification checklist

- [x] Clicking a ToDo item's chevron expands it in place with enquiry/matter context.
- [x] Actions route to the same drilldowns used by D3 modal rows (single drilldown surface, many entry points).
- [x] Expansion doesn't push the ToDo column taller than Conversion (`overflow-y: auto` already on list wrapper from D5).
- [ ] Keyboard: Enter expands/collapses, Tab cycles actions. *(Partial — Enter on main button still fires primary `onClick`; chevron is focusable and Enter-togglable.)*
- [x] App Insights: `Todo.Item.Expanded`, `Todo.Item.Collapsed`, `Todo.Item.ActionInvoked` emitted via `/api/telemetry` with throttle.

**Status: SHIPPED 2026-04-20.** Scaffolding lives in `TodoExpansion` interface on `HomeImmediateAction`, `TodoItemExpandedPane.tsx`, and `PanelActionRow`. First wired item is **Allocate Documents** (enquiry-backed). Future items opt in by populating `expansion` on their `HomeImmediateAction` shape.

---

### D+E execution order (recommended)

1. **D5 first** — measure + match heights. Data-only change, lets the panel stabilise before the bigger reworks land.
2. **D1** — demote the chip strip to a trail. Quick, removes the visual noise the user flagged.
3. **D2** — pocket-chart renderer. Biggest visual lift; brings the dashboard feel back.
4. **D4** — conversion sub-strip. Small, restores the missing cue.
5. **D3** — stream preview modal. Largest new surface in D; lands last so the panel is already stable.
6. **E** — ToDo item actions. After D is shipped and heights are stable.

Each step is independently revertible and independently valuable.

---

## 4. Step-by-step execution order

1. **A5** — recalibrate `primaryRailMinHeight` first (data-only change; sets the floor).
2. **A6** — mirror in skeleton CSS (keeps first paint aligned).
3. **A1** — add `conversionCompact` flag inside the experimental body.
4. **A2, A3, A4** — apply compact variants to the three visual blocks (parallel — all inside the same IIFE return).
5. **A7** — verify ImmediateActionsBar growth.
6. Manual QA with `replacePipelineAndMatters` toggled on **and** off. Screenshots before/after.
7. Changelog entry referencing brief id.
8. **B1** — extract `ConversionPanel`. Unblocks C.
9. **B2, B3** — consolidate `AowMixStrip`, retire legacy body (optional, only if C doesn't supersede them — C deletes the AoW mix entirely, which likely moots B2 and accelerates B3).
10. **Backend** — extend `/api/conversion/comparison` to include `currentEnquiryProspects` + `currentMatterProspects` (Phase C prerequisite). Ship behind feature flag if needed; client handles absence gracefully.
11. **C1–C6** — behind `useConversionBaskets` admin flag: new 2-section layout, sparklines, prospect chip basket, new skeleton.
12. Manual QA of Phase C (flag on + off). Resolve C10 open questions with user before building.
13. Promote flag to admins, then remove flag after one iteration.

---

## 5. Verification checklist

**Phase A:**
- [ ] Toggle OFF: Conversion panel pixel-identical to current production (visual diff clean).
- [ ] Toggle ON: Conversion height matches ToDo height at 420px floor.
- [ ] Toggle ON: Conversion hero KPI reads at 28px, not 36px.
- [ ] Toggle ON: No AoW mix progress bar; 3-chip legend only.
- [ ] Toggle ON: Sub-period comparison is a single line, not a 2-tile grid.
- [ ] Skeleton → live transition: no visible height/width pop in either mode (record a 5-second screen capture, eyeball).
- [ ] `tsc` clean for OperationsDashboard.tsx, HomeSkeletons.tsx, Home.tsx.

**Phase B:**
- [ ] `ConversionPanel` file exists, OperationsDashboard imports it, no behaviour change.
- [ ] `AowMixStrip` file exists, both call sites use it.
- [ ] App Insights event `Conversion.ExperimentalRender` still firing (if we track it).
- [ ] Legacy branch deletion: diff removes L5480–L5529 cleanly; no orphan references to `useExperimentalConversion`.

**Phase C:**
- See §3 Phase C8 acceptance criteria above.

---

## 6. Open decisions (defaults proposed)

1. **Compact hero KPI size** — Default: **28px**. Rationale: one step down from 36px, still dominant vs the 11–13px body but not shouting.
2. **`primaryRailMinHeight` in compact mode** — Default: **420px**. Rationale: matches the typical 5–7-row ImmediateActionsBar height; avoids excessive whitespace in ToDo without cramping Conversion.
3. **Drop AoW mix progress bar in compact** — Default: **yes**. Rationale: chip legend is sufficient; progress bar is the tallest single element in the footer.
4. **Retain legacy Conversion body** — Default: **yes for now**. Rationale: Phase B-3 gated on experiment rollout telemetry; don't delete without evidence.
5. **Narrow-screen behaviour** — Default: **unchanged**. Rationale: `isNarrow` already collapses to 1fr; compact tier is for side-by-side, not narrow.

---

## 7. Phase F — Section layout upgrade + Week-chart truthfulness (2026-04-20 addendum)

### Context / triggers

User observations after shipping Phase D/E:

1. **Week view shows only one dot on the pocket chart.** On a Monday (or any day early in the working week), future working days are marked `isFuture: true / currentAvailable: false`. The pocket chart filter `rows = buckets.filter(b => b.currentAvailable !== false)` drops them, collapsing the series to a single point. With `count === 1` the renderer centres one dot and no line. Reads as **misleading** — there's no visual cue that Tue–Fri will fill in.

2. **Left-hand width is under-used in the paired layout.** Each section is a vertical stack (header row → big number + sparkline right-aligned → copy → AoW dot trail). With ToDo pinned on the right at ~50% width, the Conversion column has generous horizontal real estate — but the chart is squeezed right of the number on row 2, and the AoW trail sits tight against the number/copy above it. Room to:
   - Move the pocket chart **up into the header row** (right of the section label), giving it the full right-hand runway to grow — and bringing it closer to the "title" it relates to.
   - Let row 2 (the big number row) reclaim the space, with the number + delta + secondary metric left-aligned and the description copy flowing beneath cleanly.
   - Add real breathing space between row 2/copy and the AoW trail so the eye reads them as distinct strata.

3. **"Dots" don't carry enough signal.** The 5×5 AoW dot next to each name is a quiet tint — fine as a rhythm indicator, but wasted width given the space reclaimed above. User wants an **AoW-icon roulette trail** — small bezels, each showing the canonical AoW icon + short label, scrolling horizontally like a reel of recent runs. Keeps the privacy-redacted trail but upgrades the density-to-signal ratio.

4. **Must remain responsive.** The pocket chart needs to grow/shrink with container width; the roulette trail must continue to overflow-scroll cleanly; narrow-mode (`isNarrow`) layout stays unchanged.

### Phase F1 — Ghost-future buckets (Week-chart truthfulness) — **SCOPE**

**Problem:** [src/components/modern/conversionPocketChart.ts](../../src/components/modern/conversionPocketChart.ts) filters out `currentAvailable === false` buckets before plotting. When the current period is partially elapsed (Mon of Week, early hours of Day, early weeks of Month), the series collapses and the chart lies about density.

**Fix:** retain full bucket count for x-positioning. Plot the current-series line only across available buckets, but render:
- **Future buckets as baseline tick marks** — tiny 2×2 dots (or 3px dashes) on the baseline at their x-position, in `gridStroke` tone at 0.35 opacity. Signals "this slot is waiting".
- **Previous-period line continues across all x-positions** (it's already complete — user wants to see "where last week finished vs where we are now").
- **Current-period line + area + terminal dot stay** anchored to the last *available* x-position.
- **Vertical "today" rule** — optional 1px dashed vertical at the current endpoint, in `stroke` tone at 0.3 opacity. Makes "we are here" legible without text.

**Implementation notes:**
- Refactor `buildConversionPocketChartSVG` to compute `xPositions` from the **full** bucket array, then only draw the current-line path across the available-prefix.
- Add `futureBucketMarker: boolean` option (default `true`) so Phase D banded layout opts in, legacy/other callers default preserved.
- Edge case: zero available buckets (all future) — render only previous line + all future ticks. No terminal dot. No area fill.
- Edge case: single available bucket with no previous data — render the one point as a filled dot (current behaviour) plus future ticks. Don't attempt a path.

**Files touched:** `conversionPocketChart.ts` only. All callers get the fix automatically; opt-out via `futureBucketMarker: false` for any caller that wants the old compressed look.

**Acceptance:**
- [ ] On a Monday, Week view shows Mon dot + terminal marker, Tue–Fri as 4 ghost ticks on baseline, previous line continuous across all 5 positions.
- [ ] On hourly (Today) view mid-morning, shows current-series up to the current hour + ghost ticks for remaining hours + previous line fully drawn.
- [ ] On a completed period (Last month), no ghost ticks; identical to current render.
- [ ] Previous-line dashed rendering unchanged (still at 0.55 opacity with existing stroke-dasharray).

### Phase F2 — Section row repartition (header carries the chart) — **SCOPE**

**Current per-section layout** (inside [`OperationsDashboard.tsx`](../../src/components/modern/OperationsDashboard.tsx) `renderSection`):

```
┌─ row 1 (header) ────────────────────────────────────────┐
│ ENQUIRIES                             vs last wk · ›    │
├─ row 2 (big number + chart) ───────────────────────────┤
│ 18  secondary  +2                       [pocket-chart]  │
├─ row 3 (copy) ─────────────────────────────────────────┤
│ 18 this week · was 16 last week                         │
├─ row 4 (AoW trail) ─────────────────────────────────────┤
│ • Smith  • Patel  • Holloway  +3                        │
└─────────────────────────────────────────────────────────┘
```

**New layout:**

```
┌─ row 1 (header + chart) ────────────────────────────────┐
│ ENQUIRIES     ┌─────────────── pocket chart (flex) ──┐  │
│               └──────────────────────────────────────┘  │
│                                      vs last wk · ›     │
├─ row 2 (big number + delta + secondary) ──────────────┤
│ 18     +2     was 16 last week                          │
├─ row 3 (description copy) ─────────────────────────────┤
│ 18 this week · was 16 last week                         │
│                                                         │
│                   (gap — 12–14px)                       │
│                                                         │
├─ row 4 (AoW roulette trail) ───────────────────────────┤
│ [🏢 Smith] [🏗 Patel] [🏠 Holloway] [💼 Nguyen]  +3    │
└─────────────────────────────────────────────────────────┘
```

Key changes:
- **Pocket chart moves to header row.** Right of the label, takes `flex: 1` with a max-width (e.g. 220px) so it grows when space allows but doesn't dominate on narrow. Chevron + comparison label shift below chart (or stay right-aligned on a second header line depending on width).
- **Row 2 becomes purely numeric.** Big number + delta badge + small "was X" comparison — left-aligned. No sparkline competing for width.
- **Row 3 (description)** sits under row 2 with tight line-height, kept for accessibility parity.
- **Explicit `margin-top: 12px` between copy and AoW trail** — creates the "breathing room" the user asked for without gesture tricks.
- **Section still uses `display: grid; gap: 6px`** — we just retune the child gaps.

**Implementation notes:**
- `renderSection` function in OperationsDashboard.tsx — rewrite the JSX. Preserves current props and animation delays.
- The chart's `width` option is currently hard-coded `140`. Replace with a container-driven width (measure via `ResizeObserver` in a dedicated `<ConversionSectionChart>` subcomponent, or render at a max width inside a `flex-basis: min(220px, 40%)` box and re-render the SVG on resize). Prefer the container approach — zero state machinery.
- Heights: pocket chart grows to 44–52px (was 40) now that the header row has space. SVG already scales via viewBox.

**Responsive rules:**
- Container width ≥ 420px: chart takes 200–220px on the right of the label.
- Container width 320–419px: chart shrinks to ~140px (Phase D size).
- Container width < 320px: chart hides entirely (row 1 collapses to label + comparison only, same as today when `hasChart === false`).

**Acceptance:**
- [ ] Paired mode at standard desktop width (sidebar + 2-column main): chart visibly larger (≥180px) and horizontally centred against the band.
- [ ] Row 2 big number stays at 26px, left-aligned; no sparkline inline.
- [ ] 12px gap visible between description copy and AoW trail.
- [ ] Narrow-mode (isNarrow) render unchanged — still single-column stack.
- [ ] Resizing the window live: chart re-renders at new width within 1 frame, no layout jank.

### Phase F3 — AoW roulette trail — **SCOPE**

**Current:** [ConversionProspectBasket.tsx](../../src/components/modern/ConversionProspectBasket.tsx) — each item is `[optional ✓ tick] [5×5 AoW dot] [Lastname]` in a gap-10 horizontally scrolling flex row.

**New:** same horizontal-scroll shell, but each item becomes a **roulette bezel**:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ [🏢]  Smith │  │ [🏗]  Patel │  │ [🏠] Holloway│ ... +3
└─────────────┘  └─────────────┘  └─────────────┘
```

- Bezel = 1px border in `aowColor(item.aow)` at 0.28 alpha, background same colour at 0.06 alpha, `borderRadius: 0` per design system.
- Inside: 14×14 icon (canonical AoW icon from the Brand Colour Palette table — Commercial = work/briefcase, Construction = hardhat, Property = home, Employment = people, Misc = ellipsis) stroked in `aowColor()` at full, then the redacted lastname label in body tint.
- Height: 22–24px. Comfortable scan size, still restrained.
- Matter tick (when `matterOpened === true` or `section === 'matters'`): small green checkmark glyph positioned top-right of the bezel or just before the label — **keep current affordance, reposition**.
- Hover: bezel lifts (2px translateY + shadow token per style guide). Still non-interactive in trail mode (aria-hidden retained).

**Implementation notes:**
- Extend `ConversionProspectChipItem` with optional `aow` (already present) — no type changes needed.
- Add AoW → icon mapping inside `ConversionProspectBasket.tsx`:
  - Import from `react-icons/fi` (already in use elsewhere): Commercial → `FiBriefcase`, Construction → `FiTool` or `FiHardDrive` (canonical needs confirming with existing AoW icon table in code — search `aowIcon` or `areaOfWorkIcon`).
  - Fallback = `FiCircle` or the 5×5 dot preserved.
- Icon imports kept lazy/static (tree-shaken by esbuild).
- Overflow chip `+N` keeps current style.

**Search for existing canonical AoW icon resolver before inventing new one** — there will be one (`getAreaOfWorkIcon` or similar) used elsewhere (MattersReport / Pipeline). Reuse it so icons stay consistent across the app.

**Responsive rules:**
- Full bezel (icon + label) when container width ≥ 360px.
- Icon-only bezels (tooltip label) when container width < 360px.
- Scroll-snap on touch (existing webkit-scrollbar hidden styles retained).

**Acceptance:**
- [ ] Each trail item visible as a bezel with AoW icon + redacted surname.
- [ ] Colour set matches canonical AoW palette (no off-brand hex).
- [ ] Matter-opened tick still present and unambiguous.
- [ ] Horizontal scroll works on narrow / touch.
- [ ] Dark/light parity — icons and bezels readable in both.
- [ ] Zero layout reflow when items animate in (each still animates `convProspectTrailIn`).

### Phase F4 — Global responsiveness sweep — **SCOPE**

As Phase F2 introduces container-aware chart width and Phase F3 has two bezel modes, add a single resize observer at the panel level that publishes a width breakpoint enum (`narrow | standard | wide`) via React context to both the section header and the trail. Single source of truth.

**Breakpoints** (panel container width, not viewport):
- `narrow`: <320px → hide chart, icon-only bezels.
- `standard`: 320–479px → 140px chart, full bezels.
- `wide`: ≥480px → 180–220px chart, full bezels, increased copy line-height.

**Implementation:**
- Single `useContainerWidth(ref)` hook in `src/components/modern/hooks/useContainerWidth.ts` (new file, ~30 lines, no deps beyond ResizeObserver).
- `ConversionPanel` (or the paired render block inside OperationsDashboard) owns the ref + provides via context.
- Section + Basket consume via `useContext`.

**Acceptance:**
- [ ] Drag browser window narrow-to-wide: single render per breakpoint change (no per-frame layout thrash).
- [ ] Breakpoints trigger at panel width, not viewport — matters when ToDo is pinned wider/narrower via feature toggles.

### Phase F5 — Skeleton parity (both surfaces) — **SCOPE**

Phase D/E skeleton (both `HomeSkeletons.tsx` `HomeDashboardSkeleton` paired branch and `OperationsDashboard.renderConversionSkeleton` paired branch) currently mirror the **old** section layout (chart right of big number). Update both to mirror the Phase F2 layout:
- Chart shimmer moves to header row (right of label shimmer), 180×44 box.
- Row 2 number shimmer left-aligned, no chart placeholder.
- Row 4 trail — 4 roulette-bezel shimmers (22×80 boxes with 12×12 icon square inside) instead of dot+name.

Must ship in the **same commit** as Phase F2/F3 so live vs skeleton don't diverge.

### Phase F6 — Verification checklist (all F phases)

- [ ] Week view on a Monday: chart shows Mon real line + Tue–Fri ghost ticks + previous-week full dashed line.
- [ ] Today view mid-morning: chart shows current-series up to current hour + future-hour ghosts.
- [ ] Month view on day 3: chart shows Week 1 partial + Weeks 2–4 ghosts.
- [ ] Paired mode at standard desktop: chart visibly larger and in header row.
- [ ] AoW trail renders as roulette bezels with canonical icons.
- [ ] Both skeletons match the new layout.
- [ ] Resize window: layout re-lays at breakpoints; no jank.
- [ ] Narrow mode: chart hidden, icon-only bezels, no overflow.
- [ ] `tsc` clean.
- [ ] App Insights `Conversion.Experiment.Render` events continue firing.

### Files in scope

| Path | Change |
|------|--------|
| [src/components/modern/conversionPocketChart.ts](../../src/components/modern/conversionPocketChart.ts) | F1: ghost-future buckets. |
| [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | F2: `renderSection` rewrite. F4: consume `useContainerWidth`. F5: paired branch of `renderConversionSkeleton`. |
| [src/components/modern/ConversionProspectBasket.tsx](../../src/components/modern/ConversionProspectBasket.tsx) | F3: roulette bezels + AoW icon resolver. |
| [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts) | F4: new hook (creates). |
| [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) | F5: paired-branch Conversion skeleton. |
| [logs/changelog.md](../../logs/changelog.md) | one entry per F phase at close. |

### Rollout order (recommended)

1. **F1 first** (isolated, no layout change) — ship and observe for a day to catch any drawing edge cases (zero-data, all-future, single-bucket).
2. **F4 hook** (no visible change on its own) — lands the container-width context wiring.
3. **F2 + F5 together** (section repartition + skeleton) — **must ship atomically** so skeleton doesn't flash old layout.
4. **F3 last** (trail upgrade) — easiest to roll back if user prefers the dot aesthetic.

Each phase independently revertable, each independently valuable — matches the lean cadence in copilot-instructions.

### Open questions (to resolve before F2 implementation)

1. **Chart max-width** at `wide` breakpoint: 180 or 220? Default proposed: 200.
2. **Comparison label + chevron** in header row: does it stay right-aligned *above* the chart (row 1a + 1b), or drop to just below the chart? Default proposed: flex-wrap — right of chart on wide, below on standard.
3. **Roulette bezel corner**: sharp (`borderRadius: 0`) per design system, or allow 2px? Default proposed: 0. Brand rule.
4. **Ghost tick glyph**: 2×2 dot or 3×0.5 dash? Default proposed: dot — matches existing terminal-dot vocabulary.



---

## 7. Out of scope

- Changing the Conversion data model, metrics, or chart library.
- Adding new Conversion periods or removing existing ones (Today/Week/Month/Quarter stays).
- Touching the billing rail above the row.
- Touching the legacy 1fr : 2fr pipeline layout when toggle is off.
- ImmediateActionsBar content changes (separate brief HOME_TODO_SINGLE_PICKUP_SURFACE covers this).

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — Conversion panel inline body + `primaryRailMinHeight` calc.
- [src/components/modern/ImmediateActionsBar.tsx](../../src/components/modern/ImmediateActionsBar.tsx) — ToDo content; verify `height: 100%` + `flex: 1`.
- [src/components/modern/ConversionPanel.tsx](../../src/components/modern/ConversionPanel.tsx) (NEW — Phase B1) — extracted panel.
- [src/components/modern/AowMixStrip.tsx](../../src/components/modern/AowMixStrip.tsx) (NEW — Phase B2) — shared AoW mix renderer (likely superseded by Phase C).
- [src/components/modern/ConversionProspectBasket.tsx](../../src/components/modern/ConversionProspectBasket.tsx) (NEW — Phase C3) — prospect chip basket per section.
- `src/components/modern/conversionSparkline.ts` (NEW — Phase C2) — inline SVG sparkline generator.
- [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) — `HomeDashboardSkeleton` already toggle-aware; Phase C adds 2-section skeleton.
- [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) — `.home-dashboard-skeleton-main--todo` variants + Phase C basket/sparkline tokens.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — no changes expected in this brief.

Server:
- `server/routes/conversion.js` (or wherever `/api/conversion/comparison` lives) — Phase C data-contract extension (`currentEnquiryProspects`, `currentMatterProspects`).

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.
- [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](./HOME_TODO_SINGLE_PICKUP_SURFACE.md) — sibling brief this one coordinates with.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: home-conversion-panel-rebalance
shipped: true
shipped_on: 2026-04-20
verified: 2026-04-20
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/ImmediateActionsBar.tsx
    - src/tabs/home/HomeSkeletons.tsx
    - src/tabs/home/EnhancedHome.css
  server:
    - server/routes/conversion.js  # Phase C: payload extension for currentEnquiryProspects + currentMatterProspects
  submodules: []
depends_on:
  - home-todo-single-pickup-surface  # ToDo slot + skeleton contract must be in place
coordinates_with:
  - home-animation-order-and-demo-insert-fidelity
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - demo-mode-hardening-production-presentable-end-to-end
  - home-skeletons-aligned-cascade
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Two AoW mix blocks exist.** L5418–L5459 is the chart-footer block (wide screens); L5483–L5516 is the standalone footer used when `isNarrow` is true. Any compact-mode change that touches the first must either leave the second alone or apply the same treatment — otherwise narrow-screen users see a different Conversion than wide-screen.
- **`selectedConversionInsightTarget`** drives hover + click on the whole KPI+chart block (L5356–L5360). Do not restructure the grid inside that div in a way that breaks the click target or you'll break insight modals.
- **`useExperimentalConversion`** is a feature flag. If the experiment is off, none of the compact work is visible — all changes must live inside the experimental branch, with the legacy branch untouched unless Phase B3 is executed.
- **`primaryRailMinHeight` is also read by the fallback skeleton** via CSS `min-height: 520px`. The recalibration must update both the JS value (L3444) and the CSS class (EnhancedHome.css L116, L125) together — mismatched values produce a skeleton-to-live pop.
- **`renderConversionSkeleton()`** is a separate internal skeleton shown when `enableConversionComparison && !useExperimentalConversion`. It is **not** the Suspense fallback — do not confuse with `HomeDashboardSkeleton`.
- **Previous imbalance attempts** — search commit history for `conversionCompact` or `conversion-narrow` before implementing; a half-started attempt may already exist that should be either finished or cleanly removed.
