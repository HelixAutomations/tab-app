# OperationsDashboard carve-up by section

> **Purpose of this document.** Structural anchor brief for splitting the ~11.5k-line `OperationsDashboard.tsx` into per-section components so downstream briefs (CCL review, Home To Do, chat tab removal, visual alignment) can mutate one section without touching a 10k-line file. Captures concrete section boundaries that already exist in the source as comment markers, so any future agent can carve along known seams.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-21 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User has repeatedly hit the edges of `OperationsDashboard.tsx`: sluggish UI when state changes propagate through the whole file, inability for downstream briefs to touch isolated sections without merge risk, and a zoom/resize lag that was already patched at the state layer (coarse bands + rAF) but whose structural root is that every re-render rebuilds every section.

Most recent trigger (2026-04-21): after memoising the Conversion panel sparkline SVGs, the remaining per-minute `liveNowMs` tick still causes the full dashboard to re-render every 60s. Isolating that reliably requires each section (Billing / Conversion / Pipeline / Activity / Matters / To Do) to be its own mounted component with its own memo boundary. The user is **not** asking for a visual redesign here — that is the sibling brief `operationsdashboard-sections-visual-alignment`. This brief is purely structural: move code, preserve behaviour, add memo boundaries, add per-row date leaf components where the live clock lands.

---

## 2. Current state — verified findings

### 2.1 File scale and section markers

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
- Total size: ~11.5k lines (grep confirmed section markers up to L11457). Exceeds the 3000-line split rule in `.github/instructions/components.instructions.md`.
- Section boundaries already exist as `{/* ── <name> ── */}` JSX comments. Confirmed via grep on 2026-04-21:

| Section | Comment marker line | Header text |
|---|---|---|
| Billing rail | L5655 | `{/* ── Billing rail ── */}` |
| Pipeline 3-column layout shell | L5906 | `{/* ── Pipeline: 3-column layout ── */}` |
| Conversion (col 1) | L5918 | `{/* ── Left: Conversion ── */}` |
| Pipeline (col 3 A) | L6306 | `{/* ── Right: Pipeline ── */}` |
| Recent Activity (col 2) | L6351 | `{/* ── Column 2: Recent Activity (tabbed) ── */}` |
| Matters (col 3 B) | L6816 | `{/* ── Column 3: Matters ── */}` |
| CCL stages (inside col 2) | L7347 / L7382 / L7425 | Generate / Review / Upload |
| To Do (replaces Pipeline when toggled) | L7480 | `{/* ── Right: ToDo (replaces Pipeline when toggled) ── */}` |
| Calls & Attendance Notes | L7548 | `{/* ── Calls & Attendance Notes ── */}` |
| Modals (Conversion stream, Follow-up, CCL detail, CCL fields, Live stream, AI Trace, CCL preview, Billing insight, CCL document preview) | L7551, L7569, L7715, L7985, L8208, L8349, L8460, L11124, L11457 | — |

### 2.2 Live clock (the reason a carve-up is valuable)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
- `liveNowMs` state: L1278
- `tick` function: L1369
- `setInterval(tick, 60000)` with wall-minute alignment + visibility gate: L1376
- Consumers (friendly dates, "x minutes ago", etc.):
  - `useMemo` dep at L2469
  - Inline `friendlyDateParts(…, liveNowMs)` at L6499, L6912, and throughout row render paths

Because `liveNowMs` is top-level state, every minute tick re-renders the full dashboard. Per-row leaf components that consume `liveNowMs` directly would isolate this — but only if the file has been carved up so the render graph has intermediate memo boundaries.

### 2.3 Existing memo boundaries (post perf ship)

- `conversionSparklines` (L3588) memoises the Conversion SVG build on `(selectedConversionItem, conversionLayout.breakpoint, isDarkMode)`. Added 2026-04-21. Proves the memo pattern works; need to extend to the other sections.
- `conversionLayout` (L1276) — coarse band state (`xs`/`sm`/`md`/`lg`) already landed 2026-04-20.
- `useContainerWidth` hook (now just `resolveBreakpoint`): [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts) — pure function.

### 2.4 Existing imports / couplings

The dashboard currently declares hundreds of local `useState`, `useMemo`, derived value chains, modal open-state flags, and handlers. Any carve-up must either:

1. Hoist shared state to a **context provider** wrapping the six sections, or
2. Pass props down explicitly from a thin `OperationsDashboard.tsx` shell into the section components.

Preferred: **option 2** for Billing / Matters / Conversion (state is localisable). **Option 1** only for cross-cutting state (`liveNowMs`, `isDarkMode`, `isActive`, selected filters, the CCL pipeline stage machine that spans col 2 + right column).

---

## 3. Plan

### Phase A — mechanical extraction along existing section seams

Move JSX + the state/memo/handler closure it uses into sibling files under `src/components/modern/operations/`. No behaviour change. No styling change. No new memoisation beyond what is already in place.

| # | Change | File (NEW) | Extracted from |
|---|--------|------------|----------------|
| A1 | Billing rail section | `src/components/modern/operations/BillingRailSection.tsx` | L5655–L5905 of OperationsDashboard.tsx |
| A2 | Conversion panel | `src/components/modern/operations/ConversionPanel.tsx` | L5918–L6305 (Left column) — consumes the already-memoised `conversionSparklines` |
| A3 | Pipeline panel (col 3 A) | `src/components/modern/operations/PipelinePanel.tsx` | L6306–L6350 (Right column) |
| A4 | Recent Activity panel (col 2) | `src/components/modern/operations/RecentActivityPanel.tsx` | L6351–L6815 |
| A5 | Matters panel (col 3 B) | `src/components/modern/operations/MattersPanel.tsx` | L6816–L7479 |
| A6 | To Do panel | `src/components/modern/operations/ToDoPanel.tsx` | L7480–L7547 (note: this coordinates heavily with `home-todo-single-pickup-surface` — DO NOT mutate behaviour here, extraction only) |
| A7 | Calls & Attendance Notes | `src/components/modern/operations/CallsAttendanceSection.tsx` | L7548–L7550 shell + follow-up modal if local |

**Phase A acceptance:**
- `OperationsDashboard.tsx` shrinks to < 5,000 lines (top-level orchestration + modals only).
- `npm run build` passes.
- No visual diff in dev — spot-check Home page, zoom in/out, toggle CCL stages, open each modal.
- `get_errors` clean on every new file.

### Phase B — add memo boundaries + per-row date leaves

#### B1. Per-row date leaf component

Create `src/components/modern/operations/LiveDate.tsx`:

```tsx
interface LiveDateProps { iso: string; nowMs: number; format?: 'relative' | 'short'; }
export const LiveDate = React.memo(function LiveDate({ iso, nowMs, format }: LiveDateProps) {
  const parts = React.useMemo(() => friendlyDateParts(iso, nowMs), [iso, nowMs]);
  return <span className="live-date">{format === 'short' ? parts.short : parts.relative}</span>;
});
```

Replace every inline `friendlyDateParts(iso, liveNowMs)` call in row-level JSX with `<LiveDate iso={iso} nowMs={liveNowMs} />`. Because each leaf is `React.memo`, React will only re-execute the ones whose `iso` or `nowMs` props actually changed — and since leaves only mount inside already-memoised sections (Phase A), the parent tree no longer has to re-render.

#### B2. `OperationsDashboardContext`

Hoist the cross-cutting state (`liveNowMs`, `isActive`, `isDarkMode`, filters, CCL stage machine) into a context. Each section component subscribes only to the slices it actually reads.

```tsx
interface OpsDashContext {
  liveNowMs: number;
  isActive: boolean;
  isDarkMode: boolean;
  selectedFiltersRef: MutableRefObject<Filters>;
  cclStage: 'generate' | 'review' | 'upload' | null;
  setCclStage: (s: 'generate' | 'review' | 'upload' | null) => void;
}
```

Sections that don't consume `liveNowMs` (Billing, Matters filters, Pipeline legend) will not re-render on minute ticks at all.

#### B3. Wrap each section in `React.memo`

Default export each section file as `React.memo(SectionName)`. Combined with the context slicing in B2, this closes the loop: parent state changes that don't touch a section's props don't touch the section.

#### B4. Audit and add `useMemo` for expensive derived values inside each section

Each section currently pulls from several top-level `useMemo`s. After extraction, those memos should live **inside** the section so they are garbage-collected when the section unmounts and don't pollute the parent closure. Examples to move (verify line refs when executing):
- Conversion: `selectedConversionAowMix`, `selectedConversionItem`, `conversionSparklines` → move into `ConversionPanel.tsx`
- Matters: any matter-list derivations → move into `MattersPanel.tsx`
- Recent Activity: tabbed-feed aggregation → move into `RecentActivityPanel.tsx`

**Phase B acceptance:**
- React Profiler: a single wall-minute tick causes re-render only of components that contain a `LiveDate`. Billing rail, Pipeline legend, Matters filter chips show zero work.
- No user-facing visual diff.
- `get_errors` clean.

### Phase C — unblock downstream briefs

Once A + B are shipped, these briefs can mutate a single section file each, safely:
- `ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity` → `RecentActivityPanel.tsx` (CCL stages region)
- `ccl-review-pickup-via-todo-and-addressee-fix` → `RecentActivityPanel.tsx` + `ToDoPanel.tsx`
- `ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting` → `RecentActivityPanel.tsx`
- `home-todo-single-pickup-surface` A3/A4 → `ToDoPanel.tsx` (and deletion of `PipelinePanel.tsx` + `MattersPanel.tsx` if the brief proceeds as written)
- `chat-tab-removal-retain-infra` → top-level shell in `OperationsDashboard.tsx`
- `operationsdashboard-sections-visual-alignment` → per-section JSX, section by section

Phase C is coordination only — no code change here, just mark each downstream brief's `depends_on` to include `operationsdashboard-carve-up-by-section` when the downstream agent next picks it up.

---

## 4. Step-by-step execution order

1. **A1** — extract Billing rail (smallest, safest first — proves the extraction harness).
2. **A2** — Conversion (already has a memo; extraction is mostly moves).
3. **A3** — Pipeline (small).
4. **A4** — Recent Activity (largest extraction; includes CCL stages — touch nothing behavioural).
5. **A5** — Matters.
6. **A6** — To Do (coordinate with `home-todo-single-pickup-surface` owner before proceeding).
7. **A7** — Calls & Attendance shell.
8. Ship Phase A. Add changelog entry. Re-verify visually.
9. **B1** — `LiveDate` leaf + sweep row-level `friendlyDateParts` calls.
10. **B2** — `OperationsDashboardContext`.
11. **B3** — `React.memo` each section default export.
12. **B4** — move section-local `useMemo`s down into each section file.
13. Ship Phase B. Profiler check. Changelog entry.

---

## 5. Verification checklist

**Phase A:**
- [ ] `OperationsDashboard.tsx` line count dropped below 5000.
- [ ] All modals still open and close.
- [ ] CCL pipeline stages transition Generate → Review → Upload with no regression.
- [ ] Zoom / resize bands still resolve correctly (no flicker).
- [ ] Conversion sparkline still renders, still memoised.
- [ ] No `get_errors` on any touched file.
- [ ] Changelog entry added.

**Phase B:**
- [ ] React Profiler recording of a 2-minute window shows wall-minute ticks only re-rendering the leaves inside `RecentActivityPanel` / `MattersPanel` (the ones with `LiveDate`).
- [ ] Billing rail render count stays at 1 over that window.
- [ ] Pipeline legend render count stays at 1.
- [ ] No user-visible visual diff in dark mode or light mode.

---

## 6. Open decisions (defaults proposed)

1. **Folder name** — Default: `src/components/modern/operations/`. Rationale: mirrors `src/components/modern/` convention; keeps these files adjacent to `OperationsDashboard.tsx`.
2. **Shared state pattern** — Default: context for cross-cutting (`liveNowMs`, `isActive`, `isDarkMode`, CCL stage), props for panel-local. Rationale: sections like Billing truly don't need cross-cutting state; keep their prop surface minimal.
3. **CCL stage machine location** — Default: leave in context (B2). Rationale: it spans col 2 + col 3 in ways that make lifting into a single section awkward.
4. **Delete `PipelinePanel` / `MattersPanel` now or later?** — Default: **later**. `home-todo-single-pickup-surface` may supersede them, but this brief's job is extraction-only; deletion is the downstream brief's call.

---

## 7. Out of scope

- Visual redesign / alignment with new design language → covered by `operationsdashboard-sections-visual-alignment`.
- Removing the pipeline / matters columns in favour of To Do → covered by `home-todo-single-pickup-surface`.
- CCL stage UX changes → covered by `ccl-review-*` briefs.
- Modal extraction into their own files — possible future cleanup but not in this brief (modals don't cost minute-tick re-renders; they mount on demand).
- Changing behaviour of `setInterval` tick cadence — already correct (wall-aligned, visibility-gated).

---

## 8. File index (single source of truth)

Client — mutated:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — shell, reduced to ~3–5k lines post-A
- [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts) — no change expected

Client — NEW:
- `src/components/modern/operations/BillingRailSection.tsx` (A1)
- `src/components/modern/operations/ConversionPanel.tsx` (A2)
- `src/components/modern/operations/PipelinePanel.tsx` (A3)
- `src/components/modern/operations/RecentActivityPanel.tsx` (A4)
- `src/components/modern/operations/MattersPanel.tsx` (A5)
- `src/components/modern/operations/ToDoPanel.tsx` (A6)
- `src/components/modern/operations/CallsAttendanceSection.tsx` (A7)
- `src/components/modern/operations/LiveDate.tsx` (B1)
- `src/components/modern/operations/OperationsDashboardContext.tsx` (B2)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: operationsdashboard-carve-up-by-section
verified: 2026-04-21
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/operations/BillingRailSection.tsx
    - src/components/modern/operations/ConversionPanel.tsx
    - src/components/modern/operations/PipelinePanel.tsx
    - src/components/modern/operations/RecentActivityPanel.tsx
    - src/components/modern/operations/MattersPanel.tsx
    - src/components/modern/operations/ToDoPanel.tsx
    - src/components/modern/operations/CallsAttendanceSection.tsx
    - src/components/modern/operations/LiveDate.tsx
    - src/components/modern/operations/OperationsDashboardContext.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface
  - chat-tab-removal-retain-infra
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-pickup-via-todo-and-addressee-fix
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - ccl-backend-chain-silent-autopilot-service
  - operationsdashboard-sections-visual-alignment
  - home-animation-order-and-demo-insert-fidelity
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - session-probing-activity-tab-visibility-and-persistence
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - home-skeletons-aligned-cascade
  - demo-mode-hardening-production-presentable-end-to-end
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Do not touch CCL stage transition logic during A4.** The stages at L7347 / L7382 / L7425 contain a small state machine that is also referenced by `ccl-review-*` briefs. Move the JSX only.
- **`liveNowMs` is read in both `useMemo` dep lists and raw JSX.** When you sweep to `LiveDate`, also check L2469 — that `useMemo` dep may become narrowable (only recompute when the specific iso changes, not every minute).
- **`selectedConversionItem` at L3584 must stay above `conversionSparklines` at L3588** — the memo reads it. When A2 lifts this into `ConversionPanel.tsx`, lift both together.
- **The `isActive` gate at L1376** is how the interval pauses when the tab is backgrounded. Preserve this when moving to context — if you drop the gate you'll blow battery on laptops.
- **Section comment markers** (`{/* ── X ── */}`) are the authoritative seams. Prefer them over prettier boundaries.
- **ConversionProspectBasket.tsx** imports `type ConversionBreakpoint` from the hook file — type-only, safe. Don't break the export.
- **Previous carve-up pattern reference:** `compactmatterwizard-split-by-wizardmode` and `inline-workbench-carve-up-and-ux-simplification` both use the "shell stays top-level, sections live in a sibling folder" pattern. Mirror that structure.
- **Live clock is wall-minute aligned** (`60000 - (now % 60000)` at L1376). If you refactor the tick, keep alignment or row "x minutes ago" labels will drift up to 60s off the wall clock.
