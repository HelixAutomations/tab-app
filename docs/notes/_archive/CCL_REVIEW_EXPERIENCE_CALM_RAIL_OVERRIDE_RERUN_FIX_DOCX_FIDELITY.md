# CCL review experience — calm rail, override-rerun fix, docx fidelity

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During CCL demo prep the user said:

> *"this button [Override Draft Version → Compare and replace with v6…] does nothing. its also really noisy, and warning like. remember this is overwhelming to users. and the document itself needs pressure testing, because theres still some jolting and formatting im not confident about etc. scope all this aswell."*

Three distinct problems, one brief because they all live in the same surface (the CCL review rail + its output):

1. **Bug**: the override-rerun button doesn't fire (or appears not to).
2. **UX**: the override card uses CTA red + warning tone, which overwhelms users in a context where it should feel like a calm, reversible operation.
3. **Quality**: the generated `.docx` has visible jolting and formatting issues the user doesn't trust yet.

The user is **not** asking to redesign the whole rail or to swap the AI model. Just calm the surface, make the button work reliably, and make the output something a fee earner is comfortable signing off.

---

## 2. Current state — verified findings

### 2.1 Override-rerun wiring (suspected bug)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8649 — "Compare and replace with v6…" button: `onClick={() => setCclOverrideConfirmMatter(cclLetterModal)}`.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8622 — `showOverrideConfirm = cclOverrideConfirmMatter === cclLetterModal && canOfferOverrideRerun`.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8667 — modal renders when `showOverrideConfirm` is true.
- File: [src/components/modern/ccl/CclOverrideRerunModal.tsx](../../src/components/modern/ccl/CclOverrideRerunModal.tsx) L64 — modal calls `fetchCclRerunPreview(matterId)` on mount; renders confirm/cancel.
- File: [src/components/modern/ccl/CclOverrideRerunModal.tsx](../../src/components/modern/ccl/CclOverrideRerunModal.tsx) L311 — confirm button calls `onConfirm` → `runHomeCclAiAutofill(cclLetterModal, { overrideExisting: true })`.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L2640 — `runHomeCclAiAutofill` early-returns if `cclAiFillingMatter === matterId`. **This is the suspected silent no-op**: a stale `cclAiFillingMatter` flag from a previous run blocks the new one.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9280, L9638 — `overrideSummaryCard` is rendered in TWO slots (showSummaryLanding + remaining-points sidebar). Same JSX value used twice — the modal portals to body so duplication is harmless, but the two button instances both call the same setter.

**Most likely root cause:** `cclAiFillingMatter` not cleared when the previous run errored or was cancelled. Visible button state is correct but the click no-ops in `runHomeCclAiAutofill`. Adding a console.log + checking telemetry will confirm.

### 2.2 Override card visual tone

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8631 — card uses `border: '1px solid rgba(214, 85, 65, 0.22)'` (CTA red) and `background: 'rgba(214, 85, 65, 0.07)'` (CTA tinted background).
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8635 — heading colour `colours.cta` (red) with uppercase "OVERRIDE DRAFT VERSION" — alarm framing.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8648 — confirm button uses `background: colours.cta` (red).

Per style guide: `colours.cta` is the **sole** CTA pop per view, reserved for warm urgency. Override-rerun is a routine operation, not an urgent one. This is a misuse of the CTA token.

### 2.3 docx generation — known fidelity issues

- File: [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — generates `.docx` from JSON via docxtemplater. Known issues from changelog:
  - 2026-03-07: CCL AI Fill steps could throw silently (fixed).
  - 2026-02-19: Empty practice_area submitted (fixed).
  - User-reported "jolting and formatting" not yet diagnosed — could be: line-height inconsistency, paragraph spacing, list indentation, table cell padding, font fallback.
- File: [templates/](../../templates/) — Word template source. Track-changes / styles may be inconsistent.
- File: [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — current prompt + field schema reference.

---

## 3. Plan

### Phase A — Fix the bug (independently shippable, smallest)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add temp diagnostic log on override button click | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8649 | `console.info('[ccl-override] click', { cclLetterModal, cclAiFillingMatter, canOfferOverrideRerun })`. Remove after diagnosis. |
| A2 | Reproduce and confirm root cause | local | Open a matter with existing draft, click override, observe console + App Insights. Expect: `cclAiFillingMatter` is stale. |
| A3 | Clear stale `cclAiFillingMatter` on modal close + on error paths | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L1709 `closeCclLetterModal` already clears; add cleanup to `runHomeCclAiAutofill` `catch` block | Defensive: always reset on terminal states. |
| A4 | Telemetry: `CCL.OverrideRerun.{Clicked,ConfirmedOpened,Confirmed,Skipped,Failed}` | new events | Lets us see if A1 reproduces in prod. |

**Phase A acceptance:**
- Override-rerun button always opens the comparison modal.
- Confirm button always either (a) starts a new run or (b) shows a clear error explaining why it can't.
- App Insights shows `CCL.OverrideRerun.Clicked` for every click.

### Phase B — Calm the rail (visual)

#### B1. Recolour the override card

Replace `colours.cta` red with neutral surface elevation (`colours.dark.cardBackground` border + accent dot). Heading goes from uppercase red "OVERRIDE DRAFT VERSION" to title-case neutral "Replace draft". Confirm button uses `colours.highlight` (#3690CE) not red. Cancel button is text-only.

#### B2. Soften copy

From: *"Working draft v5 can be replaced with a fresh service run saved as v6. Review the comparison — model, prompt and template versions — before confirming."*
To: *"Run again with the latest source data. The current draft (v5) will be archived; the new run becomes v6."*

#### B3. Audit other CTA-red instances on the rail

Grep for `colours.cta` in [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — confirm only true urgency uses it (e.g. "Cannot upload — unresolved fields" warning). Demote routine operations to neutral.

#### B4. Reduce the wall of cards

The summary landing currently shows: setup checklist + override card + duration + "begin review" CTA. That's a lot. Collapse override into a small text affordance ("Run again" link) that expands the card on click. Default-collapsed reduces visual noise.

### Phase C — docx fidelity audit

#### C1. Diagnostic capture

Generate 5 representative CCLs against demo matters. Open in Word + LibreOffice. Catalogue every formatting quirk:
- Paragraph spacing variance
- Line-height jolts
- List indentation
- Table cell padding
- Font fallback (Helvetica vs Calibri vs Arial)
- Footer/header inheritance
- Track-changes residue

Write findings to `docs/notes/_workings/ccl-docx-fidelity-audit.md` (working file, not a brief).

#### C2. Template normalisation

For each catalogued issue, fix in [templates/](../../templates/) source. Re-run the 5 CCLs. Confirm fixed. Iterate until 0 quirks remain.

#### C3. Style snapshot test

New script `scripts/cclSnapshotTest.mjs` — generates the 5 reference CCLs, hashes the docx XML structure, compares against a committed baseline. Catches regressions in template edits.

#### C4. Pressure-test the prompt against fidelity

Cross-check: does the prompt emit text with consistent line-break conventions? Inconsistent `\n` vs `\r\n` vs paragraph markers explains "jolting". Update prompt to enforce a single convention.

---

## 4. Step-by-step execution order

1. **A1+A2** — Diagnose the bug.
2. **A3+A4** — Fix and instrument.
3. **B1+B2** — Visual + copy calmness.
4. **B3** — Audit other CTA-red usages.
5. **B4** — Collapse override into link.
6. **C1** — Diagnostic capture (1 day of testing).
7. **C2** — Template fixes (iterate).
8. **C3** — Snapshot test.
9. **C4** — Prompt-side fidelity tightening.

---

## 5. Verification checklist

**Phase A:**
- [ ] Override-rerun button always opens modal.
- [ ] Confirm always either starts a run or shows a clear error.
- [ ] App Insights: `CCL.OverrideRerun.Clicked` and `.Confirmed` events visible.
- [ ] No silent no-op observed in 20 successive runs.

**Phase B:**
- [ ] No CTA red on the override card.
- [ ] Copy reads as a routine action, not an alarm.
- [ ] CTA-red audit confirms only true urgency uses the token.
- [ ] Override card defaults collapsed to a link.

**Phase C:**
- [ ] 5 reference CCLs generate identically across Word + LibreOffice.
- [ ] No paragraph-spacing or line-height jolts visible.
- [ ] Snapshot test passes after template edits.
- [ ] Prompt enforces consistent line-break convention.

---

## 6. Open decisions (defaults proposed)

1. **Bug fix scope** — Default: **defensive cleanup of `cclAiFillingMatter` in all terminal paths + telemetry, not a refactor**. Rationale: smallest possible change to unblock demo.
2. **Override card visual** — Default: **neutral card with accent dot, highlight-blue confirm button, default-collapsed**. Match UserBubble reference.
3. **CTA-red retention** — Default: **only "Cannot upload — unresolved fields" warning keeps red**. Everything else demoted.
4. **docx audit scope** — Default: **5 representative CCLs across all 4 practice areas**. Rationale: catches area-specific quirks.
5. **Snapshot test format** — Default: **hash docx XML structure, not byte-for-byte**. Rationale: tolerates harmless metadata variance.

---

## 7. Out of scope

- Replacing docxtemplater with another engine.
- Redesigning the review rail layout.
- Changing the AI model.
- Multi-language CCL support.

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — override card + button + handler (Phase A, B)
- [src/components/modern/ccl/CclOverrideRerunModal.tsx](../../src/components/modern/ccl/CclOverrideRerunModal.tsx) — modal (Phase B colour audit)

Server:
- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — docx output (Phase C2)
- [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js) — prompt fidelity (Phase C4)

Scripts / docs:
- [templates/](../../templates/) — Word template source (Phase C2)
- [scripts/cclSnapshotTest.mjs](../../scripts/cclSnapshotTest.mjs) (NEW) — Phase C3
- `docs/notes/_workings/ccl-docx-fidelity-audit.md` (NEW, working file) — Phase C1
- [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — update with fidelity rules
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-19
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/ccl/CclOverrideRerunModal.tsx
  server:
    - server/utils/wordGenerator.js
    - server/prompts/cclSystemPrompt.js
    - templates/
  submodules: []
depends_on: []
coordinates_with:
  - ccl-backend-chain-silent-autopilot-service
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ui-responsiveness-hover-scroll-and-tab-navigation
conflicts_with: []
```

---

## 9. Gotchas appendix

- `cclAiFillingMatter` is set in `runHomeCclAiAutofill` and cleared in the `finally`. If a `setState` somewhere else short-circuits the function (e.g. early `return` after the setter is committed but before `finally` runs), the flag stays stuck. Audit ALL early-return paths after `setCclAiFillingMatter(matterId)`.
- The override card is rendered TWICE in the same render cycle (L9280 + L9638). Both buttons share the same handler — adding logging in one place catches both. But if you change the visual treatment, change it in the variable definition (L8630), not the slots.
- `closeCclLetterModal` (L1709) clears stale flags — but only when the user explicitly closes the modal. If the user navigates away, the cleanup doesn't fire. Consider an unmount cleanup.
- `colours.cta` is appropriate for the "unresolved placeholders blocking upload" warning — that IS urgent. Don't strip it from there.
- Word's autocorrect can re-introduce smart quotes / em-dashes that break docxtemplater's `{{token}}` syntax. Always verify template edits in raw XML, not the Word UI.
- The 5-CCL audit must include at least one Construction matter (the longest, most table-heavy template) and one Property matter (heaviest on standard clauses).
