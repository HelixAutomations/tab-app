# Quick Actions Rework — empty-state expansion

> **Purpose of this document.** Self-contained brief. Pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read once. Ship Phase A first (purely visual, no behaviour change). Phase B (empty-state expansion) only after A is settled. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-27 against branch `main`.

---

## 1. Why this exists (user intent)

Verbatim from the user:

> "scope a rework of the quick actions because they feel quite small for what they are now. possibly, when to do list is low, or empty, we can creep in a set of actions as clean spacious/breathable boxes with subtle icons where on hover it lights up and becomes less opaque with an animated indicator as to what will happen with a subtle cue 'Request a matter opening for existing or new client' etc."

Two things:

1. **Quick actions chips feel undersized** for the weight of what they now do (e.g. "New Matter" launches a multi-stage chain; "Request Annual Leave" submits a real ops request). The 30–32px chip rendered in the navigator was sized for trivial filters, not for primary entry points.
2. **The empty-state of the to-do list is wasted real estate.** When the immediate actions list is short or empty, the user wants the quick actions to "breathe" — surfacing as larger, hoverable cards with subtle icons, opacity lift on hover, and a one-line cue describing what each does (`"Request a matter opening for existing or new client"`).

Not asking for: a sidebar redesign, navigator restructure, or any new actions beyond the existing set. Just a **size / affordance / context-sensitive layout** treatment of what's already there.

---

## 2. Current state — verified findings

### 2.1 Quick actions data flow

- Order map: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L372 `quickActionOrder` (`Record<string, number>`)
- Static list: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L404 `quickActions: QuickLink[]`
- Computed list per render: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L7292 `normalQuickActions = useMemo(...)` — filters by initials, conditionally pushes localhost-only "New Matter" (L7303–7305), then sorts by `quickActionOrder`.
- Click dispatch: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L6334+ `handleActionClick(action)` — early-return per `action.title`.

### 2.2 Quick actions presentation (current chip)

- Component: [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx)
  - Chip sizing: L208–209 `padding: isCompact ? '4px 10px' : '4px 12px'`, `minHeight: isCompact ? 30 : 32`.
  - Skeleton: L46–58 `SkeletonChip` (height 22px).
  - Icon mapping table: L65 `iconMap` — small Fluent + react-icons set, single-colour.
  - Title shortener: L80 `getShortTitle()` — strips long titles down to ~2 words for chip display. **Reverse this for empty-state cards** (we want the long form back).
- Mounting: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L7321–7340 — `<QuickActionsBar ... seamless ... loading={!quickActionsReady} />` is written into the shared **navigator slot** via `setContent(...)` inside a `useLayoutEffect`.
- The bar is rendered in the global navigator (top of every Home/Prospects/Enquiries view), NOT inside the Home body. This is the constraint Phase B has to work around: the bigger card layout cannot live in the navigator — it has to render in the Home body when the to-do area has slack.

### 2.3 To-do / immediate actions state

- Primary list: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L6894 `immediateActionsList: Action[] = useMemo(...)`.
- Secondary list: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L7147 `secondaryImmediateActions = useMemo<HomeImmediateAction[]>(...)`.
- Combined: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L7278–7281 `displayImmediateActionsList = [...immediateActionsList, ...secondaryImmediateActions]`.
- Parent notification: L7283–7288 `onImmediateActionsChange(immediateActionsList.length > 0)`.
- The combined length is the canonical signal Phase B should react to. Threshold for "empty/low" needs deciding (open decision §6).

### 2.4 Where the empty-state cards would render

- Home grid is in [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) (paired-card layout — Conversion + To Do, with measured height sync per the 2026-04-27 changelog entry).
- The To Do card is the right home for an in-card "low" state (compact card list); the empty state could occupy the same footprint OR slot in below the card. Phase B decides (open decision §6).

### 2.5 Style tokens to consume

- Tokens: [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — use `--surface-section`, `--surface-card`, `--surface-card-hover`, `--text-body`, `--text-help`, `--border-base`, `--shadow-base`. Do NOT inline hex.
- Helix card pattern: see `BrandingSettingsPanel.tsx` for the canonical `helix-panel` + `helix-section-title` consumption.
- Hover pattern: `applyRowHover` / `resetRowHover` (search workspace) — interactive row gradient + lift + shadow used in Prospects rows; mirror this on the new card hover.

### 2.6 Behavioural / ordering knobs already in place

- View-as-Prod gate already wraps the localhost-only "New Matter" push (L7303). Phase B should leave this gate untouched.
- `quickActionsReady` controls skeleton vs. real chips ([src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — search for the assignment). Phase B's empty-state cards must respect the same loading flag.

---

## 3. Plan

### Phase A — Reweight existing chip (safe, navigator-only)

Goal: make the existing chip carry the visual weight its actions deserve, without changing the layout shape.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Chip height up to 36 (compact 32), padding `6px 14px` (compact `5px 12px`) | [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) L208–209 | Plus matching skeleton height bump L51. |
| A2 | Icon stroke up to 1.8px, icon size 14→16 | [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) L65 `iconMap` consumers | Fluent `Icon` already takes `style.fontSize`; react-icons take `size`. Audit each render site. |
| A3 | Hover treatment: opacity lift `0.85 → 1`, subtle `--shadow-base`, 120ms ease, no transform jank | [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) chip render | Use CSS class on chip; add `.helix-quick-action-chip:hover` to design tokens or local CSS file. |
| A4 | Active/current panel chip — replace existing highlight with `accent` underline (2px) instead of fill change | same file | Aligns with Helix tab-underline pattern in the style guide. |

**Phase A acceptance:**
- Chips visibly larger and easier to hit on touch (≥36px tall, ≥80px wide for "New Matter"-class titles).
- Hover is felt, not seen — opacity + shadow only, no movement.
- Skeleton shimmer matches the new chip footprint (no jank when real chips swap in).
- All existing behaviours unchanged: click handlers, ordering, visibility filters.

### Phase B — Empty-state expansion (in-Home body)

Goal: when `displayImmediateActionsList.length` is below the threshold, render a `QuickActionsEmptyExpansion` component inside the To Do card region with breathable cards.

#### B1. New component `QuickActionsEmptyExpansion.tsx`

- Path: `src/tabs/home/QuickActionsEmptyExpansion.tsx` (NEW)
- Props:
  ```ts
  interface QuickActionsEmptyExpansionProps {
    actions: QuickLink[];
    handleActionClick: (a: QuickLink) => void;
    isDarkMode: boolean;
    loading?: boolean;
    density?: 'comfortable' | 'compact';
  }
  ```
- Layout: CSS grid, `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`, `gap: 14px`.
- Card anatomy (per action):
  - Top row: 24×24 outline icon (left) + title (Raleway 14px, weight 600).
  - Body: one-line cue (12px, `--text-help`, e.g. `"Request a matter opening for existing or new client"`).
  - Footer (visible on hover): right-aligned chevron + a 1px animated underline expanding from left to right (200ms ease-out).
  - Default state: `opacity: 0.78`, `background: var(--surface-card)`, `border: 1px solid var(--border-base)`, `border-radius: 0`.
  - Hover: `opacity: 1`, `background: var(--surface-card-hover)`, `box-shadow: var(--shadow-base)`. No transform.
- Cue source: new map `quickActionCues: Record<string, string>` (top of `Home.tsx`, near `quickActionOrder`). Default fallback: empty cue (no second line) to keep it safe if a new action lacks copy.

#### B2. Threshold + mount in Home

- Decision logic in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) near L7278 (after `displayImmediateActionsList`):
  ```ts
  const QUICK_EXPANSION_THRESHOLD = 1; // tweak after dogfooding (open decision §6)
  const showQuickExpansion = quickActionsReady && displayImmediateActionsList.length <= QUICK_EXPANSION_THRESHOLD;
  ```
- Render slot: inside the To Do panel body, beneath the (empty/short) immediate-actions list. The To Do card lives in [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx); thread `showQuickExpansion` + `normalQuickActions` + `handleActionClick` down via the same prop chain that already feeds the immediate actions area.
- Density: pass `density='compact'` when the To Do card height drops below 360px (from the existing height-sync logic — see 2026-04-27 changelog entry). Otherwise `'comfortable'`.

#### B3. Cue copy (initial set — first pass, low risk)

| `action.title` | Suggested cue |
|----------------|----------------|
| `New Matter` | Request a matter opening for an existing or new client |
| `Request Annual Leave` | Submit a leave request to your supervisor |
| `Save Telephone Note` | Log a call with a prospect or client and attach to their record |
| `Confirm Attendance` | Confirm where you'll be working today |
| `Unclaimed Enquiries` | Pick up an enquiry that hasn't been assigned yet |

Treat these as drafts — operator (LZ) signs off before merge.

#### B4. Telemetry

- Track `Home.QuickActions.EmptyExpansion.Rendered` once per session render (debounced) with `{ count: actions.length, density }`.
- Track `Home.QuickActions.EmptyExpansion.Clicked` on each card click with `{ action: action.title }`.
- Use existing `trackEvent` from `src/utils/appInsights` (client side).

### Phase C (deferred — only if user asks) — Mobile / narrow

If the navigator collapses to a hamburger on narrow widths, the empty-state cards become the de-facto entry point. Phase C wires:
- Always render at narrow widths (<768px) regardless of immediate-actions length.
- Stack to single column.

---

## 4. Step-by-step execution order

1. **A1** — chip sizing + skeleton match. Visual diff in Simple Browser.
2. **A2** — icon weight pass.
3. **A3** — hover treatment (CSS).
4. **A4** — active/current chip underline. Verify panel-open state still readable.
5. *(land Phase A; pause for sign-off)*
6. **B1** — build `QuickActionsEmptyExpansion.tsx` standalone (dogfood behind a `?expand=1` query param).
7. **B3** — confirm cue copy with operator (one-liner Slack/Teams).
8. **B2** — wire threshold + mount; thread props through `OperationsDashboard`.
9. **B4** — telemetry.
10. *(parallel with 9)* localhost smoke: clear immediate-actions, verify expansion renders; add an immediate action, verify it collapses back.

---

## 5. Verification checklist

**Phase A:**
- [ ] Chips ≥ 36px tall in default density, ≥ 32px in compact.
- [ ] No layout shift when skeleton → real chips swap.
- [ ] Hover: opacity + shadow only (no transform), 120ms.
- [ ] Active panel state visible without filling the chip background.
- [ ] All existing handler routes still fire (`New Matter`, `Request Annual Leave`, `Save Telephone Note`, `Confirm Attendance`, `Unclaimed Enquiries`).

**Phase B:**
- [ ] When `displayImmediateActionsList.length <= QUICK_EXPANSION_THRESHOLD`, expansion renders in To Do card body.
- [ ] Cards: opacity 0.78 default → 1 on hover, animated underline footer.
- [ ] Each card click fires the same `handleActionClick(action)` that the navigator chip would.
- [ ] App Insights events: `Home.QuickActions.EmptyExpansion.{Rendered|Clicked}` visible.
- [ ] Loading state: cards show skeleton (3–4 ghost cards) until `quickActionsReady`.
- [ ] Density auto-shrinks below 360px card height.

---

## 6. Open decisions (defaults proposed)

1. **Threshold for "low/empty"** — Default: **`<= 1`** (renders when 0 or 1 immediate actions). Rationale: 0 alone leaves the To Do card visually empty most days; 1 keeps the expansion useful even when there's a single small task.
2. **Render slot** — Default: **inside the To Do card body** (replaces the empty-state strip currently shown). Alternative: a sibling card below — rejected because it disrupts the paired-card height sync.
3. **Cue copy ownership** — Default: **operator signs off the first set** (B3 table); future actions ship with cue copy or skip the cue line.
4. **Cards vs. tiles** — Default: **horizontal cards** (icon left, title + cue right). Alternative: square tiles — rejected because cue copy needs reading width.
5. **Animation in cards** — Default: **left-to-right underline + opacity fade only**, no chevron movement. Keeps "subtle cue" reading.

---

## 7. Out of scope

- Adding new quick actions.
- Restructuring the navigator slot itself.
- Touching `ImmediateActionsBar` or the Action / immediate-actions data model.
- Mobile behaviour (Phase C, deferred).
- Light-mode-specific tuning beyond design tokens (tokens already cover both modes).
- Replacing icons with a new icon set — keep current `iconMap`, just up the weight.

---

## 8. File index (single source of truth)

Client (changed):
- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) — Phase A chip resize, hover treatment, active underline
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — Phase B threshold + cue map + thread props
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — Phase B render slot inside To Do card

Client (new):
- `src/tabs/home/QuickActionsEmptyExpansion.tsx` (NEW) — empty-state card grid

Styles:
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — consume; add `.helix-quick-action-chip` + `.helix-quick-action-card` classes if not already present
- [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) — likely home for the new card grid styles (keep colocated with To Do card layout)

Docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: quick-actions-rework-empty-state
verified: 2026-04-27
branch: main
touches:
  client:
    - src/tabs/home/QuickActionsBar.tsx
    - src/tabs/home/Home.tsx
    - src/tabs/home/QuickActionsEmptyExpansion.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/home/EnhancedHome.css
    - src/app/styles/design-tokens.css
  server: []
  submodules: []
depends_on: []
coordinates_with:
  # Same dir, no shared file — low risk, listed for visibility
  - forms-ia-ld-undertaking-complaint-flow
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  # Shared file (Home.tsx / OperationsDashboard.tsx / QuickActionsBar.tsx / design-tokens.css)
  # — touch different regions; read each before merging if both ship close together.
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-action-extraction
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - clio-webhook-reconciliation-and-selective-rollout
  - demo-mode-hardening-production-presentable-end-to-end
  - docs-transfer-review-ccl-review-fixes
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface          # tightest overlap — both rework To Do card region
  - operationsdashboard-carve-up-by-section
  - operationsdashboard-sections-visual-alignment
  - realtime-delta-merge-upgrade
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates  # tightest overlap — empty/low state semantics
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Navigator vs. body rendering.** `QuickActionsBar` is mounted into the global navigator via `setContent(...)` inside a `useLayoutEffect` (Home L7321). The empty-state expansion CANNOT live there — it has to render in the Home body. Don't try to "extend" the bar; build a new component for the body.
- **Title shortener reversal.** `getShortTitle()` in `QuickActionsBar.tsx` L80 strips titles for chip display ("Create a Task" → "New Task"). The empty-state cards want the FULL title plus a separate cue line — pass the raw `action.title` straight in, don't reuse `getShortTitle`.
- **Height-sync paired cards.** The To Do and Conversion cards have a measured-height sync (see 2026-04-27 changelog "Fix Home Conversion and To Do height sync on load"). If the empty-state expansion grows the To Do card, re-run the measurement after layout settles or the Conversion card will lag a frame.
- **`quickActionsReady` is the canonical loading flag.** Don't add a new one. Both Phase A skeleton and Phase B card skeletons should gate on it.
- **Localhost-only "New Matter" push** at Home L7303–7305 is intentional — leave the gate untouched. The expansion just renders whatever `normalQuickActions` resolves to.
- **`borderRadius: 0` everywhere.** Don't reach for `12` on the cards. Helix style guide §1.
- **No new hex.** Use `var(--surface-card)`, `var(--surface-card-hover)`, `var(--text-body)`, `var(--text-help)`, `var(--border-base)`, `var(--shadow-base)`. The cards must look right in dark + light + high-contrast without per-mode branches.
- **Hover = opacity + shadow only.** No `translateY`, no scale. The user explicitly said "lights up and becomes less opaque" + "subtle". Movement breaks that.
- **Animated underline.** Implement via a `::after` pseudo-element with `transform: scaleX(0); transform-origin: left; transition: transform 200ms ease-out` flipped to `scaleX(1)` on `:hover`. Don't animate `width` (jank).
- **Telemetry debounce.** `EmptyExpansion.Rendered` will fire on every `displayImmediateActionsList` recompute if not debounced — wrap in a `useEffect` keyed off a stable `boolean` (e.g. `showQuickExpansion`).
