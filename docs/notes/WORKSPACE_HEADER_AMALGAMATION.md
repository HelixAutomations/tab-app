# Workspace Header Amalgamation

> **Status:** 🟡 Maybe / low priority — parked for a low-energy session. Not committed for delivery.
>
> **Purpose of this document.** Self-contained brief that any future agent can pick up cold and execute without prior context. Every relevant file path, line number, and current-state finding is captured below.
>
> **Verified:** 2026-05-21 against branch `main`. If reading more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

Quoting the user:

> "scope the learning and development, conversion, external calls, and call filing workspace headers. the labels, above their components. there are labels, and each has a filter on the right. we are amalgamating them, so that they are clearly header like components, but with a built in toggle. so that we dont double up and meanwhile they are clearer. it was one of the requirements in the demo. to make the l&d label larger but we will do something better."

> "where there is width, have Learning & Development and not L&D. only wrap where necessarily smoothly."

Today the four Home workspaces are inconsistent: External Calls and Call Filing already use an amalgamated `renderAttachedHeader` (icon + title + count + inline controls); the To Do / L&D right panel header has controls but uses the abbreviation "L&D"; the Conversion header is a bare label with no controls slot. Goal: unify the four into one "section-header-with-built-in-toggle" pattern, prefer the full "Learning & Development" wording, and only fall back to "L&D" when width forces a wrap.

User is NOT asking for: data scope changes, card body restyling, changes to billing/pipeline/matters headers, or a new RegistersWorkspace toggle.

---

## 2. Current state — verified findings

### 2.1 External Calls / Call Filing (reference pattern — already done)

- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — `renderAttachedHeader({ icon, title, count?, detail?, controls?, rightCell? })` helper defined at L3044, used at L3095 (External Calls + scope + refresh) and L3096 (Call Filing Workspace + filing target control).
- Narrow-mode behaviour: stacks vertically (`flexDirection: 'column'`), 48 vs 40 min-height, wraps controls under the title.
- Secondary "Call Filing Workspace" label still appears at L4090 inside the body — candidate for removal once the header owns the label.

### 2.2 Conversion header (label only, no controls)

- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L5985 — `<div className="home-section-header" style={{ height: pairedConversionHeaderHeight, ... }}><FiTrendingUp size={10} className="home-section-header-icon" />Conversion</div>`.
- No controls slot. Period / comparison toggles live inside the card body, not the header.

### 2.3 To Do / Learning & Development right-panel header

- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L7678 — header strip already accepts a `todoScopeSlot` (controls slot).
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L8502 — `todoScopeSlot` is composed of `firmWideAdminToggle`, `todoScopeToggle`, and the segmented `rightPanelToggle`.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L8275 — `rightPanelToggle` segmented control ("TO DO | L&D"). The "L&D" abbreviation is hard-coded at L8293: `const label = opt === 'todo' ? 'To Do' : 'L&D';`.
- L8466 — `rightPanelLabel={effectiveRightPanel === 'ldRecord' ? 'Learning & Development' : 'To Do'}` is already the full name when fed back to OperationsDashboard, so the inconsistency is purely inside the toggle pill.

### 2.4 Shared header styling

- [src/tabs/home/home-tokens.css](../../src/tabs/home/home-tokens.css) L166 — `.home-section-header`: 11px / 700 / uppercase / 0.3px letter-spacing. Used by all four sites.

---

## 3. Plan

### Phase A — Promote "Learning & Development" wording

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Render "Learning & Development" by default; only show "L&D" when the segmented pill is below a width threshold | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L8293 | Replace the static `'L&D'` with a ResizeObserver-driven label OR a CSS-only approach: render the full string with `whiteSpace: nowrap` and let a container query collapse to "L&D" under ~220px. Container queries preferred; ResizeObserver is the fallback if container queries don't suit the React tree. |
| A2 | Make the L&D segment visibly weightier so it reads as a header label, not just toggle text | same | Bump pill height + segment font from 10px to 11px to match `.home-section-header`. Keep uppercase + 0.08em letter-spacing. |

**Phase A acceptance:** "Learning & Development" appears in full on desktop and mid-width; "L&D" only appears in narrow embeds (Teams panel ≤ 480px) and Conversion column is unaffected.

### Phase B — Shared `SectionHeader` primitive

#### B1. Lift `renderAttachedHeader` out of CallsAndNotes

Create `src/components/modern/SectionHeader.tsx` exporting a small component:

```tsx
interface SectionHeaderProps {
  icon: React.ReactNode;
  title: React.ReactNode;       // accept node so we can render responsive label
  count?: number;
  detail?: React.ReactNode;
  controls?: React.ReactNode;
  rightCell?: boolean;          // when true, paints a left divider for paired headers
  isNarrow?: boolean;
  isDarkMode?: boolean;
}
```

Behaviour mirrors today's `renderAttachedHeader` (L3044 in CallsAndNotes.tsx). Visual contract: `.home-section-header` class for the title span so the existing CSS tokens still apply.

#### B2. Adopt in CallsAndNotes

Replace the local `renderAttachedHeader` definition with `<SectionHeader …/>` at L3095 / L3096. Remove the duplicate "Call Filing Workspace" body label at L4090 (now redundant with the header).

#### B3. Adopt in OperationsDashboard

- Conversion (L5985): wrap in `<SectionHeader icon={<FiTrendingUp/>} title="Conversion" />`. Controls slot empty unless Open Decision 1 lands a period toggle.
- Right panel (L7678): wrap in `<SectionHeader icon={…} title={rightPanelLabel ?? 'To Do'} count={todoCount} controls={todoScopeSlot} />`. Move count pill rendering into the component.

### Phase C (optional polish)

- Audit the rest of Home for `home-section-header` usages (Billing, Pipeline) and decide whether to migrate or leave alone. Out of scope unless the user asks.

---

## 4. Step-by-step execution order

1. **A1** — Implement responsive Learning & Development / L&D label.
2. **A2** — Bump segment typography to match section-header weight.
3. **B1** — Create `SectionHeader.tsx` from current `renderAttachedHeader` body. Add storybook-style sanity render in dev if helpful.
4. **B2** — Swap CallsAndNotes call sites. Verify External Calls + Call Filing render identically. Remove L4090 duplicate.
5. **B3** — Swap Conversion + Right Panel headers. Confirm `pairedConversionHeaderHeight` measurement still works (component must expose the same outer DOM dimensions, or measurement target needs to point at the new ref).
6. Changelog entry per phase.

---

## 5. Verification checklist

**Phase A:**
- [ ] At ≥ 900px window width, the right-panel toggle shows "TO DO | LEARNING & DEVELOPMENT".
- [ ] At ≤ 480px (Teams panel), the toggle gracefully collapses to "TO DO | L&D" without wrapping mid-word.
- [ ] No layout shift in the To Do card height.

**Phase B:**
- [ ] External Calls + Call Filing headers visually unchanged (pixel diff acceptable).
- [ ] Conversion header gains the same icon spacing / uppercase weight rhythm as External Calls.
- [ ] `pairedConversionHeaderHeight` (the measurement that aligns Conversion + ToDo cards) still resolves to a non-zero value and ToDo card height matches Conversion rail height.
- [ ] No regression in narrow / Teams embed mode.
- [ ] `npm run check-sizes` passes; no file crosses the 3000-line warning.

---

## 6. Open decisions (defaults proposed)

1. **Conversion controls** — Default: **label only**. The Conversion card already exposes period / comparison controls in the body; keep the header purely structural for now.
2. **Shared component location** — Default: **`src/components/modern/SectionHeader.tsx`**. Co-locates with OperationsDashboard and CallsAndNotes, no new folder.
3. **Responsive label mechanism** — Default: **container query CSS** with a JS fallback. Avoid ResizeObserver if a `@container` rule suffices.

---

## 7. Out of scope

- Card body restyling (Conversion KPI tiles, ToDo list, call rows).
- Data scope changes (`ldScope`, `firmWideAdminToggle` semantics).
- RegistersWorkspace L&D tab.
- Billing / Pipeline / Matters / Attendance headers.
- New telemetry events.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — `rightPanelToggle` + `todoScopeSlot` composition (L8275 / L8502).
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — Conversion + Right Panel headers (L5985 / L7678).
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — `renderAttachedHeader` helper (L3044), External Calls + Call Filing call sites (L3095/L3096), redundant body label (L4090).
- `src/components/modern/SectionHeader.tsx` (NEW) — shared primitive.
- [src/tabs/home/home-tokens.css](../../src/tabs/home/home-tokens.css) — `.home-section-header` class (L166).

Server: none.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase when picked up.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: workspace-header-amalgamation
verified: 2026-05-21
branch: main
status: maybe
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/CallsAndNotes.tsx
    - src/components/modern/SectionHeader.tsx
    - src/tabs/home/home-tokens.css
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - app-wide-ux-improvement-proof-programme
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-action-extraction
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - clio-webhook-reconciliation-and-selective-rollout
  - docs-transfer-review-ccl-review-fixes
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - function-retirement-phase-2-d-and-e-transactionapprovalpopup-and-mattersreport-cleanup
  - helix-rehearsal-record-luke-test-as-firm-seed
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - hub-rollout-training-and-confidence-recovery
  - operationsdashboard-carve-up-by-section
  - quick-actions-rework-empty-state
  - realtime-delta-merge-upgrade
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - staging-walkthrough-call-2026-05-11-to-do-strip-realtime-focus-plus-parked-items
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---
