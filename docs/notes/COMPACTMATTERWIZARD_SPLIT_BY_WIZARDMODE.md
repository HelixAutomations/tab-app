# CompactMatterWizard split by wizardMode

> **Purpose.** Self-contained brief. A future agent can execute cold.
>
> **How to use.** Read once. Phase A is zero-behaviour, ship first. Phases B/C can parallelise.
>
> **Verified:** 2026-04-20 against `main`.

---

## 1. Why this exists (user intent)

Verbatim from the user (2026-04-20): *"yes please stash the candidates, add to scope general workbench clean up and simplification of both design and actions/information shown etc."*

[src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx) is **2,523 lines** — approaching the 3,000-line threshold from `.github/copilot-instructions.md`. The component holds one `wizardMode` state (L342: `'form' | 'processing' | 'error' | 'confirm' | 'success'`) and renders four completely distinct screens inline, each wrapped in the same `wizardSurfaceRef` shell. Editing any one screen forces the agent (and the user) to page through 2,000+ lines to find the right branch.

The user's same request covers UX simplification: each screen currently shows too many inline affordances and metadata rows. Split + trim in the same initiative.

---

## 2. Current state — verified findings

### 2.1 State machine

- Declared at L342: `const [wizardMode, setWizardMode] = useState<'form' | 'processing' | 'error' | 'confirm' | 'success'>('form');`
- Transitions:
  - Form → Confirm: `setWizardMode('confirm')` L963
  - Confirm → Processing: `setWizardMode('processing')` L983
  - Processing → Success: `setWizardMode('success')` L1087, L1177
  - Processing → Error: `setWizardMode('error')` L1192
  - Error → Form (retry): `setWizardMode('form')` L1901
  - Confirm → Form (back): `setWizardMode('form')` L1502
  - Alt processing entry: `setWizardMode('processing')` L1142

### 2.2 Render branches

All four branches check `wizardMode` and early-return. Each wraps JSX in `wizardSurfaceRef`.

| Branch | Early-return line | Approx end | Notes |
|--------|------------------|-----------|-------|
| Confirm | L1255 `if (wizardMode === 'confirm')` | ~L1531 | Title changes for demo mode (recent 2026-04-20 edit) |
| Success | L1533 `if (wizardMode === 'success')` | ~L1713 | Now renders `<MatterOpenedHandoff>` (2026-04-20) — preserve |
| Processing/Error | L1715 `if (wizardMode === 'processing' \|\| wizardMode === 'error')` | ~L1980 | Shares L1737–L1772 header, branches on `wizardMode === 'error'` |
| Form | (falls through) | L2523 | The `return (` for the form is the final JSX |

### 2.3 Shared shell + props

- `wizardSurfaceRef` mounted inside every branch — move the shell to a parent wrapper.
- `DemoModeStripe` mounted at the top of each branch (2026-04-20 edit) — keep in the wrapper, gated on `demoModeEnabled`.
- `mappedStage` memo at L415–L419 maps `wizardMode` → breadcrumb stage — keep in parent.
- `matterId.current` + `handoffMatterId` derivation in success branch — specific to Success.

### 2.4 Recent additions to preserve

- `MatterOpenedHandoff` mounted in the Success branch (replaces old demo CCL chip + "Continue to Matter Record" button).
- `DemoModeStripe` mounted at top of all four branches.
- Confirm title prefix `'Demo simulation — confirm details'` when `demoModeEnabled`.

### 2.5 UX friction

- Success screen still carries multiple ghost fallbacks (Close + onGoToMatter). Audit whether both are needed.
- Confirm screen has two back routes (reset to form vs close entirely). Confirm both are wired.
- Processing screen has an inline progress breakdown that renders each step with its own colour pill — the palette is partly hex-literal (L1772 uses `colours.cta` / `colours.highlight` correctly, but other rows may not). Audit for off-brand hex.

---

## 3. Plan

### Phase A — zero-behaviour split into four branch components

Mechanical extraction. No behaviour change.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create directory | `src/tabs/instructions/MatterOpening/wizard/` | New folder |
| A2 | Extract Confirm screen | `wizard/ConfirmScreen.tsx` | L1255–~L1531 JSX + handlers (back, acknowledge, submit). Props: `{ isDarkMode, demoModeEnabled, confirmAcknowledge, onAcknowledge, onBack, onConfirm, /* payload fields */ }` |
| A3 | Extract Success screen | `wizard/SuccessScreen.tsx` | L1533–~L1713. Props include `{ openedMatterId, matterOpenSucceeded, isDarkMode, onGoToMatter, onDismiss }` to match `MatterOpenedHandoff`. |
| A4 | Extract Processing/Error screen | `wizard/ProcessingScreen.tsx` | L1715–~L1980. Props: `{ wizardMode, processingSteps, onRetry, errorDetails }` |
| A5 | Extract Form screen | `wizard/FormScreen.tsx` | L~1985–EOF. Biggest branch — likely 500+ lines by itself. |
| A6 | Parent file becomes a dispatcher | `CompactMatterWizard.tsx` | Owns `wizardMode` state, `wizardSurfaceRef`, `DemoModeStripe` mount, breadcrumb mapping. Renders one of the four child components based on `wizardMode`. |

**Phase A acceptance:** `CompactMatterWizard.tsx` < 500 lines. Each child < 600 lines. `npm run tsc` clean. Smoke test: real instruction end-to-end + `DEMO-ENQ-0001` end-to-end.

### Phase B — shared types + helpers

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Types file | `wizard/types.ts` | `WizardMode`, `ProcessingStep`, any confirm/success/form-specific value objects |
| B2 | Shared surface wrapper | `wizard/WizardSurface.tsx` | Shell currently inlined in each branch. Props: `{ demoModeEnabled, isDarkMode, children }`. Mounts `DemoModeStripe` + `wizardSurfaceRef`. |

**Phase B acceptance:** Duplication of shell JSX reduced to one place.

### Phase C — UX simplification (per branch)

| # | Branch | Change | Detail |
|---|--------|--------|--------|
| C1 | Confirm | Reduce to 3 groups | Client identity, Matter specifics, Final ack. Collapse the rest behind disclosure. |
| C2 | Processing | Collapse step log | Active step + last 2 messages only. Full log behind a "Show full log" disclosure. |
| C3 | Success | Single primary CTA | `<MatterOpenedHandoff>` is primary. Close becomes a ghost link. Remove duplicate affordances. |
| C4 | Form | Audit field density | Above-the-fold: essential fields only (matter type, fee earner, originating, supervising, practice area). Everything else in a disclosure group. |

**Phase C acceptance:** Each screen has **one** clear next action above the fold, no off-brand hex values, all colours trace to `colours.ts`.

---

## 4. Step-by-step execution order

1. **A1–A6** — mechanical split first (one PR).
2. **B1–B2** — shared types + wrapper.
3. *(parallel across developers)* **C1** Confirm, **C2** Processing, **C3** Success, **C4** Form — each its own PR.

---

## 5. Verification checklist

**Phase A:**
- [ ] `CompactMatterWizard.tsx` < 500 lines.
- [ ] Each `wizard/*Screen.tsx` < 600 lines.
- [ ] `npm run tsc` clean.
- [ ] Smoke: real instruction → form → confirm → processing → success.
- [ ] Smoke: `DEMO-ENQ-0001` → demo stripe visible across all four screens → success lands on modern Home CCL modal.

**Phase B:**
- [ ] `DemoModeStripe` mount appears only once in the parent-wrapper file.
- [ ] `wizardSurfaceRef` declared only once.

**Phase C:**
- [ ] Zero inline hex colours across the four screens.
- [ ] Above-the-fold check at 1440×900 — each screen has one visually obvious next step.
- [ ] Processing log collapsed by default.

---

## 6. Open decisions (defaults proposed)

1. **Directory name** — Default: `src/tabs/instructions/MatterOpening/wizard/`. Sibling to existing `DemoModeStripe.tsx`.
2. **State location** — Default: `wizardMode` stays in `CompactMatterWizard.tsx` parent. Children are presentational. Rationale: simpler; avoids prop-drilling setState.
3. **Form extraction granularity** — Default: one `FormScreen.tsx` file. If it exceeds 800 lines after Phase A, split into `FormFields/` subdirectory in a follow-up.
4. **Shared surface component (Phase B)** — Default: ship in Phase B not Phase A. Rationale: Phase A is purely extraction; introducing a new wrapper during the move risks regressions.
5. **C4 aggressiveness** — Default: hide behind disclosure, don't delete fields. User can confirm field-by-field in a follow-up.

---

## 7. Out of scope

- `InlineWorkbench.tsx` carve-up — sister brief `inline-workbench-carve-up-and-ux-simplification`.
- `MatterOpenedHandoff` internals (already shipped 2026-04-20).
- `DemoModeStripe` internals (already shipped 2026-04-20).
- Server-side matter-opening pipeline (`/api/matter-requests`, `/api/clio-contacts`, `/api/clio-matters`).
- CCL review modal plumbing.
- Renaming `CompactMatterWizard` — keep the symbol and default export.
- Changing the state machine itself (transitions, valid states).

---

## 8. File index (single source of truth)

Client (existing, to be modified):
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx) — becomes a dispatcher
- [src/tabs/instructions/MatterOpening/DemoModeStripe.tsx](../../src/tabs/instructions/MatterOpening/DemoModeStripe.tsx) — imported by parent wrapper
- [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx) — consumed by `SuccessScreen.tsx`, no changes expected

Client (NEW):
- `src/tabs/instructions/MatterOpening/wizard/ConfirmScreen.tsx` (A2)
- `src/tabs/instructions/MatterOpening/wizard/SuccessScreen.tsx` (A3)
- `src/tabs/instructions/MatterOpening/wizard/ProcessingScreen.tsx` (A4)
- `src/tabs/instructions/MatterOpening/wizard/FormScreen.tsx` (A5)
- `src/tabs/instructions/MatterOpening/wizard/types.ts` (B1)
- `src/tabs/instructions/MatterOpening/wizard/WizardSurface.tsx` (B2)

Docs / logs:
- [logs/changelog.md](../../logs/changelog.md) — one entry per phase referencing stash id

### Stash metadata (REQUIRED)

```yaml
# Stash metadata
id: compactmatterwizard-split-by-wizardmode
verified: 2026-04-20
branch: main
touches:
  client:
    - src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx
    - src/tabs/instructions/MatterOpening/wizard/ConfirmScreen.tsx
    - src/tabs/instructions/MatterOpening/wizard/SuccessScreen.tsx
    - src/tabs/instructions/MatterOpening/wizard/ProcessingScreen.tsx
    - src/tabs/instructions/MatterOpening/wizard/FormScreen.tsx
    - src/tabs/instructions/MatterOpening/wizard/types.ts
    - src/tabs/instructions/MatterOpening/wizard/WizardSurface.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - inline-workbench-carve-up-and-ux-simplification
  - demo-mode-hardening-production-presentable-end-to-end
conflicts_with: []
```

---

## 9. Gotchas appendix

- The four render branches each **early-return** (they check `wizardMode` and return their own JSX). The dispatcher pattern must preserve that — don't try to render all four and conditionally hide.
- `wizardSurfaceRef` must remain one DOM node — `InlineWorkbench` scrolls to it. If the parent wrapper switches children, the ref must be attached on the wrapper element, not on each child.
- `mappedStage` at L415 is consumed by a breadcrumb in `InlineWorkbench` via callback. Keep the parent wrapper responsible for emitting it — don't move to children.
- `setWizardMode('form')` is called from **both** the Confirm back button (L1502) AND the Error retry button (L1901). `FormScreen.tsx` must not assume fresh state — preserve the existing `setProcessingSteps(initialSteps)` reset at L1901 and `setConfirmAcknowledge(false)` at L1502.
- `matterId.current` (ref, not state) and the demo-prefix strip (`handoffMatterId`) in the Success branch must move to `SuccessScreen.tsx` or be passed in as a prop.
- `DemoModeStripe` is mounted at the top of each branch today. Centralising it in `WizardSurface.tsx` (Phase B) means the stripe will render ONCE per render cycle instead of four times — verify no layout side effects.
- The Processing branch handles **both** `'processing'` and `'error'` states. Don't split into two files — one `ProcessingScreen.tsx` handling both is cleaner.
- `FaCheck` is used by Success screen — do not remove during import pruning. `FaFileAlt` was removed 2026-04-20; don't re-add.
- `continueToMatterView` was renamed to `goToMatterView` 2026-04-20 — preserve the new name.
