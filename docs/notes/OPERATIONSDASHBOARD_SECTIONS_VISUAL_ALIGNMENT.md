# OperationsDashboard sections — visual alignment with new design language

> **Purpose of this document.** Pure UX brief: re-style the OperationsDashboard sections (Billing rail, Conversion panel, Pipeline panel, Recent Activity, Matters, To Do, Calls & Attendance) so they share the visual language of the newer Home surfaces (UserBubble, the recent To Do experience, the Conversion panel rebalance work). No structural carve-up, no behavioural change. Should be implemented **after** `operationsdashboard-carve-up-by-section` lands so each section can be re-skinned in its own file without touching the 11k-line monolith.
>
> **How to use it.** Read once. Implement section-by-section. Add a `logs/changelog.md` entry per section.
>
> **Verified:** 2026-04-21 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs (especially since the carve-up brief will change the underlying file layout).

---

## 1. Why this exists (user intent)

User: *"i will want a rwork of the ops bits so its consistent with the new design of the sections above."*

Translated: the upper surfaces of the Home page (UserBubble command centre, the new To Do affordance, the Conversion panel rebalance) have established a refreshed visual language — Helix dark surface ladder (`websiteBlue` → `darkBlue` → `helixBlue`), Raleway, `borderRadius: 0`, accent (`#87F3F3`) at structural anchor points only, brand tokens via `colours.ts` / `design-tokens.css`. The Operations Dashboard sections were built in earlier rounds and carry residual off-brand colours (Material Design oranges, Tailwind sky/blue-400 shades), inconsistent section-header treatment, mismatched row hover/lift behaviour, and 11/12px text in places where the canonical body minimum is 13px.

The user is **not** asking for new functionality, new sections, or changes to data flow. This is a re-skin against the canonical style guide ([docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md)) and the brand palette section of `.github/copilot-instructions.md`. Reference implementation is `src/components/UserBubble.tsx`.

---

## 2. Current state — verified findings

### 2.1 Section headers (inconsistent)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
- Three different patterns are in use:
  - L5659 `<span className="home-section-header"><TbCurrencyPound size={11} … />Billing</span>` — span + 11px icon
  - L5920 `<div className="home-section-header" style={{ animation: 'opsDashFadeIn 0.25s ease both' }}><FiTrendingUp size={10} … />Conversion</div>` — div + 10px icon + inline animation
  - L6309 / L7483 `<div className="home-section-header" style={{ minHeight: 18 }}>` — div + minHeight override
- Style guide §1c specifies "Section titles: 11px uppercase". Some headers comply, others don't. Icon size jitters between 10/11/12px.

### 2.2 Off-brand colour residue

Likely violations to audit (verify each before changing):
- Any inline `#FFB74D`, `#FF9800`, `#E65100` (Material Design orange) → must become `colours.orange` (`#FF8C00`).
- Any `#0078d4`, `#0ea5e9`, `#60a5fa` (Tailwind / generic) → must become `colours.blue` / `colours.highlight` (`#3690CE`).
- Any `#22c55e`, `#10b981`, `#4ade80` → must become `colours.green` (`#20b26c`).
- Any sub-13px body text (style guide §1b minimum). Particularly likely in matter row metadata, billing rail subtotals.

### 2.3 Row hover / lift (mismatched)

Reference implementation: `src/components/UserBubble.tsx` and `src/app/styles/Prospects.css` `.prospect-row` — interactive rows lift on hover with shadow + gradient (the `applyRowHover` / `resetRowHover` helpers). OperationsDashboard rows currently use a mix of:
- Plain `:hover { background-color }` (legacy)
- No hover at all (some Matters rows)
- Custom inline transitions (Conversion list)

### 2.4 borderRadius drift

Style guide rule: **borderRadius 0 everywhere**. Exceptions: 999 for pills/dots, 50% for circular status indicators only. OperationsDashboard has ad-hoc `borderRadius: 4 | 6 | 8 | 12` in several places — needs a sweep.

### 2.5 CSS class adoption

`design-tokens.css` provides `helix-panel`, `helix-input`, `helix-label`, `helix-btn-primary`, `helix-section-title`, `helix-body`, `helix-help`. Reference: `BrandingSettingsPanel.tsx` (fully migrated). OperationsDashboard sections still use inline `style={{ background: colours.dark.cardBackground, … }}` everywhere — should use `var(--surface-card)` via class or inline custom-property reference.

### 2.6 Area of Work colours

Confirm each AoW indicator on the dashboard maps to the canonical table:
- Commercial → `colours.blue` / dark `colours.accent`
- Construction → `colours.orange`
- Property → `colours.green`
- Employment → `colours.yellow`
- Misc/Other/Unsure → `colours.greyText`

There are 15 copies of `getAreaColor` across the codebase with inconsistent fallbacks (per copilot-instructions.md). The dashboard's copy must match the canonical fallback (`colours.greyText`).

---

## 3. Plan

### Phase A — header + class adoption sweep (mechanical)

| # | Section | File | Detail |
|---|---------|------|--------|
| A1 | Billing rail | `BillingRailSection.tsx` (post-carve-up) | Standardise `<header>` to use `helix-section-title`; resize all section icons to 11px; remove inline `minHeight` overrides where the class already handles it. |
| A2 | Conversion panel | `ConversionPanel.tsx` | Same. Remove the inline `animation: opsDashFadeIn` if duplicated by class; keep if it's the only entry animation. |
| A3 | Pipeline panel | `PipelinePanel.tsx` | Same. |
| A4 | Recent Activity | `RecentActivityPanel.tsx` | Same. CCL stage labels must use `helix-label` not bespoke spans. |
| A5 | Matters | `MattersPanel.tsx` | Same. Filter chips → use accent-on-dark for active. |
| A6 | To Do | `ToDoPanel.tsx` | Same. Coordinate with `home-todo-single-pickup-surface`. |
| A7 | Calls & Attendance | `CallsAttendanceSection.tsx` | Same. |

**Phase A acceptance:**
- All section headers render at the same height.
- All icons are 11px.
- Visual diff is minimal but consistent — no hex changes yet.

### Phase B — colour token sweep

For each new section file, grep for inline hex values and replace with `colours.*` tokens or CSS custom properties. Do **not** introduce new hex values; if a needed shade is missing, add it to `src/app/styles/colours.ts` first (per copilot-instructions.md).

| # | Action |
|---|--------|
| B1 | grep each section file for `#[0-9a-fA-F]{3,8}` — for each match decide: token exists → swap; no token → add to `colours.ts` then swap. |
| B2 | grep for `style={{ background: colours.dark.` and migrate to CSS class + `var(--surface-*)` where the design token covers it. |
| B3 | Replace any non-canonical AoW colour calls with the canonical table (§2.6). |
| B4 | borderRadius sweep: any value not 0/999/'50%' must justify itself or change to 0. |

**Phase B acceptance:**
- Zero inline hex codes outside of `colours.ts` for the seven sections.
- Section files import from `colours.ts` only (no other colour modules).

### Phase C — interactive row consistency

| # | Action |
|---|--------|
| C1 | Standardise row hover/lift across all rows: import the `applyRowHover` / `resetRowHover` helpers used by `Prospects.css` / UserBubble, OR create a `helix-row-interactive` class in `design-tokens.css` and apply it. |
| C2 | Body text minimum 13px audit per §1b. Field labels 12px, section titles 11px. Lift any 11/12px body copy. |
| C3 | Toggle switches → 40×20 with 16×16 knobs (style guide §1c). |
| C4 | Interactive row padding minimum 12px 14px. |

**Phase C acceptance:**
- Hover behaviour identical across Matters / Conversion / Recent Activity / To Do rows.
- Body text passes the 13px minimum.
- Toggles match style guide dimensions.

### Phase D — text hierarchy fix (blue-on-blue defence)

Style guide is explicit: `colours.dark.subText` (#3690CE) is highlight blue and **must not** be used for body copy on navy backgrounds. Per `.github/copilot-instructions.md` "Text hierarchy inside panels":
- Primary headings → `colours.dark.text` (#f3f4f6)
- Body / paragraphs → `#d1d5db` (warm grey)
- Tertiary helpText → `colours.subtleGrey`
- Section accent only → `colours.accent`

| # | Action |
|---|--------|
| D1 | grep each new section file for `colours.dark.subText` used in body text and replace with `#d1d5db` or token if added. |
| D2 | Confirm anchor-point uses of `colours.accent` are sparing (section title bars, active sort header, selected filter chip — not widespread decoration). |

**Phase D acceptance:**
- No body prose rendered in `colours.dark.subText`.
- Accent appears only at structural anchor points.

---

## 4. Step-by-step execution order

Carve-up brief MUST ship first. Then per-section, each as its own atomic change:

1. **A1 + B1 + C1 + D1 on `BillingRailSection.tsx`** — ship section 1 end-to-end (smallest, lowest risk).
2. **Same on `ConversionPanel.tsx`** — coordinate with existing `home-conversion-panel-rebalance` work if still open.
3. **Same on `PipelinePanel.tsx`**.
4. **Same on `RecentActivityPanel.tsx`** — coordinate with `ccl-review-*` briefs.
5. **Same on `MattersPanel.tsx`**.
6. **Same on `ToDoPanel.tsx`** — coordinate with `home-todo-single-pickup-surface`.
7. **Same on `CallsAttendanceSection.tsx`**.
8. After all sections shipped, do a final cross-section walk: zoom 75 % → 200 %, dark mode + light mode, take a screenshot pass.

---

## 5. Verification checklist

Per section:
- [ ] No inline hex codes — all colours via `colours.ts` tokens or CSS custom props.
- [ ] Section header renders at the canonical 11px uppercase.
- [ ] All icons in the section are 11px (or 16×16 for radio cues per §1b).
- [ ] borderRadius is 0 or justified.
- [ ] Body text >= 13px; labels >= 12px.
- [ ] Hover/lift consistent with reference (`UserBubble`, `Prospects.css`).
- [ ] No `colours.dark.subText` used for body prose.
- [ ] Accent (`#87F3F3`) used only at structural anchor points.
- [ ] AoW colours match canonical table.
- [ ] No `get_errors`.
- [ ] Visual screenshot diff captured in PR description.

Final:
- [ ] All seven sections feel like they were designed at the same time as UserBubble.
- [ ] Switching between Home surfaces and OperationsDashboard sections has no jarring visual gear-change.

---

## 6. Open decisions (defaults proposed)

1. **Animation entry — keep or drop the `opsDashFadeIn` per section?** — Default: **keep**, but standardise duration / easing per the style guide. Rationale: removing all entry animations would feel abrupt; standardising avoids the current jitter.
2. **Where to store the `helix-row-interactive` class?** — Default: extend `design-tokens.css`. Rationale: keeps utility classes in one place.
3. **Light mode parity?** — Default: **yes, ship dark + light at the same time per section.** Rationale: cheaper than two passes; the user occasionally uses light mode.

---

## 7. Out of scope

- Structural carve-up → covered by `operationsdashboard-carve-up-by-section` (must ship first).
- Behavioural changes (filter logic, what data is shown) → out of scope.
- New sections, modals, or surfaces.
- Conversion panel rebalance (data layout) → covered by `home-conversion-panel-rebalance` if still open.

---

## 8. File index (single source of truth)

Client — mutated (post carve-up):
- `src/components/modern/operations/BillingRailSection.tsx`
- `src/components/modern/operations/ConversionPanel.tsx`
- `src/components/modern/operations/PipelinePanel.tsx`
- `src/components/modern/operations/RecentActivityPanel.tsx`
- `src/components/modern/operations/MattersPanel.tsx`
- `src/components/modern/operations/ToDoPanel.tsx`
- `src/components/modern/operations/CallsAttendanceSection.tsx`

Tokens / styles:
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — may add `helix-row-interactive` here
- [src/app/styles/colours.ts](../../src/app/styles/colours.ts) — add new tokens here only if a needed shade is missing

Reference (do not modify):
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md)
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — living reference implementation
- [src/components/BrandingSettingsPanel.tsx](../../src/components/BrandingSettingsPanel.tsx) — class-adoption reference

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per shipped section

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: operationsdashboard-sections-visual-alignment
verified: 2026-04-21
branch: main
touches:
  client:
    - src/components/modern/operations/BillingRailSection.tsx
    - src/components/modern/operations/ConversionPanel.tsx
    - src/components/modern/operations/PipelinePanel.tsx
    - src/components/modern/operations/RecentActivityPanel.tsx
    - src/components/modern/operations/MattersPanel.tsx
    - src/components/modern/operations/ToDoPanel.tsx
    - src/components/modern/operations/CallsAttendanceSection.tsx
    - src/app/styles/design-tokens.css
    - src/app/styles/colours.ts
  server: []
  submodules: []
depends_on:
  - operationsdashboard-carve-up-by-section
coordinates_with:
  - home-todo-single-pickup-surface
  - home-skeletons-aligned-cascade
  - home-animation-order-and-demo-insert-fidelity
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-pickup-via-todo-and-addressee-fix
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- **`colours.dark.subText` is a TRAP.** It's highlight blue (`#3690CE`), not a "dark mode subText" colour despite the name. Using it for body text on navy = unreadable. The style guide warns about this explicitly.
- **`highlightBlue` (`#d6e8ff`) is NOT the highlight colour.** It's a light-mode surface tint. Code that wants the canonical highlight blue must use `colours.blue` / `colours.highlight` (`#3690CE`).
- **There are 15 copies of `getAreaColor`** with inconsistent fallbacks (`cta`, `greyText`, `blue`). The canonical fallback per copilot-instructions.md is `colours.greyText`. Don't accidentally entrench another wrong copy.
- **Don't normalise hover behaviour by deleting it** — some Matters rows are intentionally non-interactive (read-only summaries). Apply the row class only where there's a real action.
- **`UserBubble.tsx` is the living reference.** When in doubt, copy patterns from there, not from older Home components.
- **borderRadius 0 includes modals.** If you find a modal in the dashboard with `borderRadius: 12`, that's a violation per copilot-instructions.md — fix to 0 or 2px max.
- **Order matters with the carve-up brief.** Doing this brief first means rewriting code that's about to be moved. Insist on the carve-up shipping first.
