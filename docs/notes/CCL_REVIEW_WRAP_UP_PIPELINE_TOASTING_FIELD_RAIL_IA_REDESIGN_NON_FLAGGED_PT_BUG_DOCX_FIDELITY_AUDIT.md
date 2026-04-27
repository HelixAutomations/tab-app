# CCL review wrap-up — field-rail IA redesign + non-flagged PT bug, docx fidelity audit

> **Note (2026-04-24):** Phase C (pipeline toasting + `useCclPipelineToasts` hook) was **dropped from this brief** — the hook landed on 2026-04-23 as part of `ccl-polish-workbench-chip-toast-dedupe-pipeline-latency` (now archived). Live at `src/hooks/useCclPipelineToasts.ts`. This brief now covers Phase A (non-flagged PT score leak), Phase B (field-rail IA redesign), and Phase D (docx fidelity audit) only.

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-24 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

Over the past two weeks the CCL review surface has been through several rounds of focused polish — copy, layout, override-rerun bug fixes, the pipeline strip redesign, the handoff ceremony walker, the "Start again" gating for fresh runs, and the unification of the "Preparing" and "Pressure testing" panels so the strip carries continuously across both phases.

This wraps up the genuinely outstanding CCL items into one final brief so the surface can be parked. The remaining work is the rump of previous briefs that have now been archived:

- `ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting` (closed) — the field-rail IA redesign + non-flagged PT score bug were never picked up. Pipeline toasting landed separately via `ccl-polish-workbench-chip-toast-dedupe-pipeline-latency` on 2026-04-23.
- `ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity` (closed) — the docx fidelity audit was never picked up.

These pieces are independent and can be shipped in any order, but together they are everything that's left to bring the CCL review surface to "done" before moving on.

The user is **not** asking to redesign the rail again, change the AI model, swap the docxtemplater engine, or touch the autopilot/backend chain. This is the close-out punch list.

---

## 2. Current state — verified findings

### 2.1 Pipeline toasting — gaps

The pipeline phases are well instrumented for telemetry but emit **no toasts at phase transitions**. Once the user navigates away from a long-running CCL pipeline (generate → stream → pressure-test → handoff) they have no way of knowing it finished without coming back to the modal.

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — `runHomeCclAiAutofill` (around L2935) calls `trackClientEvent` for every state transition (`CCL.AutoFill.Started`, `CCL.AutoFill.Completed`, `CCL.AutoFill.Failed`, `CCL.PressureTest.*`, `CCL.OverrideRerun.*`) but does not invoke the toast helper.
- File: [src/app/functionality/ToastProvider.tsx](../../src/app/functionality/ToastProvider.tsx) (verify path — grep `ToastProvider`) — site-wide notify helper available.
- File: [src/components/modern/ccl/CclFinalisePanel.tsx](../../src/components/modern/ccl/CclFinalisePanel.tsx) — handoff/upload toasts already exist (verify by grep `notify(` inside the file). This sets the precedent for what tone + layout the new pipeline toasts should match.
- The recent strip redesign + handoff walker (changelog 2026-04-24) means the **rail itself is now extremely clear** while the modal is open. So toasts are only valuable for the "user is elsewhere" case.

### 2.2 Field-focus rail — information architecture

The field-focus rail (the right-hand panel that opens when you click into a single field from the review summary) carries 17 distinct UI elements. Most are redundant or misplaced — the textarea, which is the entire point of the surface, sits below five other labels and helpers.

- File: [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) — header. Currently renders `getActionLabel`, field title, group label, signal title, signal body, back button, plus an `Evidence aligned · N/10` block whenever `pressureTest` is defined (regardless of `flag`).
- File: [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) — decision panel. Currently renders the `Decision` section label, an `Adjust the wording directly…` helper, branch chips with stacked help text, a `Wording going into the letter` label, an `Edit the wording directly…` helper, the textarea, save button, and a `Saving this point keeps…` footer helper.
- File: [src/components/modern/ccl-modern-panel.css](../../src/components/modern/ccl-modern-panel.css) (verify path — grep `ccl-review-field-header__`) — selectors for the existing layout.

The full element-by-element audit and proposed redesign live in §3 (Phase B) below.

### 2.3 Non-flagged PT score leak (small bug, ship first)

Independent of the IA redesign, the rail leaks the pressure-test score into the UI on `set-wording` fields where the score is fine (e.g. 8/10, non-flagged). The user sees `Evidence aligned · 8/10` next to a field that has no source — the score is internal metadata, not a user-facing signal.

- File: [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) L24–34 — renders `Evidence aligned · N/10` whenever `pressureTest` is defined, regardless of `flag`.
- File: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) L1766 — backend canonical: `const flag = score <= 7;`.
- File: [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) L101 — flag threshold documented.

**Fix:** gate every PT render on `pressureTest?.flag === true`. After fix, on `set-wording` fields the score is invisible; on `verify` fields the orange `Safety Net · N/10` tag plus the PT reason render verbatim.

### 2.4 docx fidelity — known issues, undiagnosed

User reported "jolting and formatting" issues with the generated `.docx` output. Has not been audited yet.

- File: [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — generates `.docx` from JSON via docxtemplater. No structural diagnostic has been done.
- File: [templates/](../../templates/) — Word template source. Track-changes / paragraph-spacing / list-indent / font-fallback inconsistencies suspected but unverified.
- File: [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js) (verify path) — prompt may emit inconsistent line-break conventions (`\n` vs `\r\n` vs paragraph markers) that surface as "jolting" on rendering.
- File: [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — current prompt + field schema reference; should grow a "fidelity rules" section once Phase D lands.

No baseline / regression test exists for docx output.

---

## 3. Plan

Three phases, each independently shippable. Recommended order: A (smallest, single-line bug fix) → B (the IA redesign, biggest) → D (docx fidelity audit, longest).

### Phase A — Non-flagged PT score leak (smallest, ships alone)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Gate every PT render on `pressureTest?.flag === true` | [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) L24–34 (and any sibling render sites — grep `pressureTest` inside the file) | Replace `if (pressureTest)` style guards with `if (pressureTest?.flag === true)`. |
| A2 | Same gate in any rail/summary render that surfaces score-style language | grep `pressureTest?.score`, `Evidence aligned`, `Safety Net` across `src/components/modern/` | Audit and apply the same gate uniformly. |

**Phase A acceptance:**
- A `set-wording` field with PT score 8/10 shows **no** `Evidence aligned` / `Safety Net` signal anywhere.
- A `verify` field (PT flagged) still shows `Safety Net · N/10` in orange + the PT reason verbatim.
- `get_errors` clean on touched files.

### Phase B — Field-focus rail IA redesign

The rail is a one-question confirmation surface: the autopilot has stopped here because it needs a fee-earner sentence. Every element on screen should either (a) identify *which* point we're on, (b) say *why* the human is being asked, or (c) be the answer mechanism. Everything else is friction.

#### B1. Element audit (current rail)

| # | Element | Verdict |
|---|---------|---------|
| 1 | `1 of 10` count | ✅ orientation |
| 2 | `Set wording` action pill | ✅ identifies what's being asked |
| 3 | `Realistic Timescale` field title | ✅ identifies the point |
| 4 | `Section 3 · Next steps` group | ✅ locates it in the letter |
| 5 | `No source found — set manually.` decision reason | ✅ the "why" |
| 6 | `Evidence aligned · 8/10` signal title | ❌ Phase A removes this for non-flagged |
| 7 | Signal body paragraph (PT reason) | ⚠️ only useful when PT flagged |
| 8 | `Back` button | ⚠️ peer-weighted with Save |
| 9 | `Decision` section label | ❌ meaningless — whole rail is the decision |
| 10 | `Adjust the wording directly…` helper | ❌ the textarea itself conveys this |
| 11 | Branch choice buttons (conditional) | ✅ when present, they are the answer |
| 12 | `Wording going into the letter` label | ⚠️ restates the obvious |
| 13 | `Edit the wording directly…` helper | ❌ universally understood |
| 14 | Textarea / preview | ✅ the answer mechanism |
| 15 | `Save and open next point` button | ✅ the commit |
| 16 | `Saving this point keeps…` footer helper | ❌ button label already says this |
| 17 | `Reopen this point` alt label | ⚠️ edge case |

**9 of 17 elements are redundant or misplaced.** Target: 17 → 6 (plus optional chip picker).

#### B2. Redesigned rail structure (top to bottom)

1. **Orientation strip** (one line, 11px, subtle grey):
   `3 / 10 · Realistic Timescale · Section 3 — Next steps`
   Field title folds into the locator line, not a standalone heading.

2. **The ask** (largest type, 16–17px, white):
   - `set-wording` path → **"Set the wording for this point."**
   - `verify` path (PT-flagged) → **"Confirm this wording fits the evidence."**

3. **The why** (single paragraph, 12px, body text):
   - `set-wording` + no source → *"The source material didn't give us this detail. Your wording goes straight into the draft."*
   - `set-wording` + unknown confidence → *"The AI wasn't confident enough to auto-fill this. Your call."*
   - `verify` (PT flagged) → renders the PT `reason` verbatim.
   - When PT-flagged, a small inline tag above the paragraph: `Safety Net · N/10` in `colours.orange`. (Already gated to flagged-only by Phase A — confirms this is safe.)

4. **Branch picker** *(only when `choiceConfig` exists)*:
   Chips/radio cards directly above the textarea — same container, not a separate "Decision" section. `option.help` becomes a tooltip, not stacked under every chip. Preview line stays.

5. **The answer** (the textarea — tallest element, no label above):
   - Placeholder becomes the lightweight guidance: *"Type the wording that should appear in the letter."*
   - Auto-grows (already does). Focus ring: `colours.highlight`.

6. **Commit row** (one row, right-aligned primary, left-aligned back):
   - **Left:** `← Back` as a chevron + text ghost button. When `currentDecisionNumber === 1`, label becomes `← Summary`.
   - **Right:** primary button with dynamic label:
     - `hasNextDecision` → `Save · next point`
     - `!hasNextDecision && canApprove` → `Save · review complete`
     - `selectedFieldIsReviewed` → `Reopen`
     - else → `Save`
   - No footer helper sentence.

7. **Approve button** *(only when `canApprove && !hasNextDecision`)*: renders inline with the save button as a secondary accent.

#### B3. Implementation map

| File | Change |
|------|--------|
| [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) | Collapse eyebrow + title + group into a single `orientation-strip`. Replace signal block with **the-ask** + **the-why** blocks. Drop the separate `Back` button (moves to decision panel commit row). New prop: `onBack` forwarded down. Delete `getActionLabel`. Rewrite `getSignalTitle` / `getSignalBody` to match new copy set, or fold into parent and delete this file if it becomes thin. |
| [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) | Delete `Decision` section label + `section-help` paragraph + `Wording going into the letter` label + its `section-help`. Move textarea/preview to sit directly under the branch picker (or at the top of the panel when no choiceConfig). Delete `footer` helper sentence. Restructure `actions` container to host back-button + save-button in one row. Update `completeLabel` cases. |
| [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Pass `onBack` through to the decision panel (not just the header). |
| [src/components/modern/ccl-modern-panel.css](../../src/components/modern/ccl-modern-panel.css) *(verify path)* | Tighten gaps (24 → 14). Drop `.ccl-review-field-header__title` as a standalone heading. Add `.ccl-review-field-header__ask` (16–17px) + `.ccl-review-field-header__why` (12px). Add `.ccl-review-decision__commit-row`. Delete rules for `section-label`, `section-help`, `footer`. |

#### B4. Canonical copy register

Single source of truth so implementation + design + QA agree on wording:

```ts
const FIELD_RAIL_COPY = {
  setWording: {
    ask: 'Set the wording for this point.',
    whyNoSource: 'The source material didn\u2019t give us this detail. Your wording goes straight into the draft.',
    whyLowConfidence: 'The AI wasn\u2019t confident enough to auto-fill this. Your call.',
    placeholder: 'Type the wording that should appear in the letter.',
  },
  verify: {
    ask: 'Confirm this wording fits the evidence.',
    // `why` is the PT reason verbatim
    tag: (score: number) => `Safety Net \u00b7 ${score}/10`,
    placeholder: 'Edit if needed, or save as-is.',
  },
  commit: {
    nextPoint: 'Save \u00b7 next point',
    reviewComplete: 'Save \u00b7 review complete',
    singlePoint: 'Save',
    reopen: 'Reopen',
  },
  back: {
    toSummary: '\u2190 Summary',
    toPrev: '\u2190 Back',
  },
};
```

#### B5. Telemetry

- Verify `CCL.Review.FieldFocused` already fires with `{ fieldKey, fieldType, hasPtFlag }`. If missing, add.
- Add `CCL.Review.FieldSaved` on save click with `{ fieldKey, wordingChanged: boolean, choiceSelected?: string }`.
- No new events for the redesign itself — existing rail events are sufficient.

#### B6. Out of scope (park as follow-ups, not in Phase B)

- Inline diff preview (show what the wording will replace in the draft).
- Per-field confidence dots in the left sidebar.
- Keyboard shortcuts (J/K next/prev, Cmd+Enter save) — add after the IA settles.

**Phase B acceptance:**
- First line of the rail is a single 11px strip: `3 / 10 · Realistic Timescale · Section 3 — Next steps`.
- Second element is the bold ask sentence in 16–17px.
- Third element is the "why" paragraph (PT reason verbatim on verify path, or one of the two fallback sentences on set-wording path).
- Textarea is the largest interactive element on the rail, with no label directly above it.
- No occurrences in the rail of: `Decision`, `Wording going into the letter`, `Adjust the wording directly`, `Edit the wording directly`, `Saving this point keeps`.
- Back + Save sit in one commit row; Back is a chevron+text ghost, Save is the primary button with dynamic label per B4.
- Approve button still renders inline when `canApprove && !hasNextDecision`.
- `get_errors` clean on touched files.

### Phase D — docx fidelity audit

#### D1. Diagnostic capture

Generate 5 representative CCLs against demo matters (one per practice area minimum, plus one Construction matter — longest, most table-heavy template). Open each in Word + LibreOffice. Catalogue every formatting quirk:

- Paragraph spacing variance
- Line-height jolts
- List indentation
- Table cell padding
- Font fallback (Helvetica vs Calibri vs Arial)
- Footer/header inheritance
- Track-changes residue
- Smart-quote / em-dash drift from Word autocorrect into `{{token}}` syntax

Write findings to `docs/notes/_workings/ccl-docx-fidelity-audit.md` (working file, not a brief).

#### D2. Template normalisation

For each catalogued issue, fix in [templates/](../../templates/) source. Re-run the 5 CCLs. Confirm fixed. Iterate until 0 quirks remain. Always verify template edits in raw XML, not the Word UI — autocorrect can re-introduce smart quotes that break docxtemplater's `{{token}}` syntax.

#### D3. Style snapshot test

New script `scripts/cclSnapshotTest.mjs` — generates the 5 reference CCLs, hashes the docx XML structure (not byte-for-byte — tolerates harmless metadata variance), compares against a committed baseline. Catches regressions in template edits.

#### D4. Pressure-test the prompt against fidelity

Cross-check: does the prompt emit text with consistent line-break conventions? Inconsistent `\n` vs `\r\n` vs paragraph markers explains "jolting". Update prompt to enforce a single convention.

**Phase D acceptance:**
- 5 reference CCLs generate identically across Word + LibreOffice.
- No paragraph-spacing or line-height jolts visible.
- Snapshot test passes after template edits.
- Prompt enforces consistent line-break convention.
- `docs/CCL_PROMPT_ENGINEERING.md` grows a "Fidelity rules" section.

---

## 4. Step-by-step execution order

1. **A1+A2** — Gate non-flagged PT signal everywhere. Smallest, ships alone, removes the visible bug.
2. **B1+B2+B3+B4** — Field-rail IA redesign + canonical copy register. Largest scope.
3. **B5** — Telemetry add (`CCL.Review.FieldSaved`).
4. **D1** — Diagnostic capture (1 day of testing).
5. **D2** — Template fixes (iterate).
6. **D3** — Snapshot test.
7. **D4** — Prompt-side fidelity tightening.

Phases A, B, D are independent — they can be picked off one at a time over multiple sessions.

---

## 5. Verification checklist

**Phase A:**
- [ ] `set-wording` field with PT score 8/10 shows **no** `Evidence aligned` / `Safety Net` signal anywhere.
- [ ] `verify` field (PT flagged) still shows `Safety Net · N/10` + reason verbatim.
- [ ] grep `pressureTest` in `src/components/modern/` returns no ungated render sites.

**Phase B:**
- [ ] Rail first line is the single 11px orientation strip.
- [ ] Bold ask sentence is the second element.
- [ ] "Why" paragraph is the third element.
- [ ] Textarea is the largest interactive element with no label above.
- [ ] No occurrences in the rail of: `Decision`, `Wording going into the letter`, `Adjust the wording directly`, `Edit the wording directly`, `Saving this point keeps`.
- [ ] Commit row hosts both Back and Save with dynamic Save label per copy register.
- [ ] App Insights events: `CCL.Review.FieldSaved` visible.

**Phase D:**
- [ ] 5 reference CCLs generate identically across Word + LibreOffice.
- [ ] No paragraph-spacing or line-height jolts visible.
- [ ] Snapshot test passes.
- [ ] `docs/CCL_PROMPT_ENGINEERING.md` updated with fidelity rules.

---

## 6. Open decisions (defaults proposed)

1. **Phase A scope** — Default: **gate every PT render, not just the field header**. Rationale: avoids the leak resurfacing in any sibling render site.
2. **Field-rail header file (B3)** — Default: **inline into the parent and delete `CclReviewFieldHeader.tsx`** if it becomes a thin shell. Rationale: avoids a half-empty component.
3. **docx audit corpus (D1)** — Default: **5 reference CCLs across all 4 practice areas, including one Construction (table-heavy) and one Property (clause-heavy)**. Rationale: catches area-specific quirks.
4. **Snapshot format (D3)** — Default: **hash docx XML structure, not byte-for-byte**. Rationale: tolerates harmless metadata variance.

---

## 7. Out of scope

- Replacing docxtemplater with another engine.
- Changing the AI model.
- Multi-language CCL support.
- Rebuilding the autopilot/backend chain (already closed — solicitor-approval lockdown shipped 2026-04-24).
- Pipeline toasting (shipped 2026-04-23 via `useCclPipelineToasts` hook).
- Inline diff preview in the field rail.
- Per-field confidence dots in the left sidebar.
- Keyboard shortcuts in the field rail.

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) — Phase A + B
- [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) — Phase B
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — Phase B (prop wiring)
- [src/components/modern/ccl-modern-panel.css](../../src/components/modern/ccl-modern-panel.css) — Phase B (CSS)

Server:
- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — Phase D
- [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js) (verify path) — Phase D
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — Phase A (canonical flag threshold reference)

Scripts / docs:
- `scripts/cclSnapshotTest.mjs` (NEW) — Phase D
- `docs/notes/_workings/ccl-docx-fidelity-audit.md` (NEW, working file) — Phase D
- [templates/](../../templates/) — Phase D
- [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — flag threshold reference (Phase A) + fidelity rules update (Phase D)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
verified: 2026-04-24
branch: main
touches:
  client:
    - src/components/modern/CclReviewFieldHeader.tsx
    - src/components/modern/CclReviewDecisionPanel.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/ccl-modern-panel.css
  server:
    - server/utils/wordGenerator.js
    - server/prompts/cclSystemPrompt.js
    - templates/
  submodules: []
depends_on: []
coordinates_with:
  - operationsdashboard-carve-up-by-section
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - resources-tab-restructure-with-templates-section
  - docs-transfer-review-ccl-review-fixes
conflicts_with: []
```

---

## 9. Gotchas appendix

- The PT score leak (Phase A / §2.3) is purely cosmetic — backend `flag` is correct (`score <= 7`). Don't chase server changes.
- `CclReviewFieldHeader.tsx` may end up thin enough after Phase B to inline into the parent — see open decision 2.
- The CSS file path for `.ccl-review-field-header__*` is suspected to be `src/components/modern/ccl-modern-panel.css` but verify with `grep -r 'ccl-review-field-header__' src/` before editing.
- `OperationsDashboard.tsx` is past the 3,000-line threshold and a separate stash brief (`operationsdashboard-carve-up-by-section`) covers carving it up. Do not enlarge it further during Phase B prop wiring.
- The "fresh run gating" for the override-rerun affordance landed 2026-04-24 (see changelog) — it suppresses `canOfferOverrideRerun` while `cclFreshRunInSessionRef.current.has(matterId)`. If you touch `closeCclLetterModal`, preserve the `cclFreshRunInSessionRef.current.delete(cclLetterModal)` cleanup or the rerun affordance will stay hidden across sessions.
- The pipeline strip + handoff walker landed 2026-04-24 — `setupFlowStrip` is now driven by `cclHandoffStepIdx` during the handoff overlay. It's deliberately paced (600ms tick / 2700ms close). Don't touch it.
- Pipeline toasting is already live via `src/hooks/useCclPipelineToasts.ts` (shipped 2026-04-23, brief `ccl-polish-workbench-chip-toast-dedupe-pipeline-latency`). Don't re-implement.
- `colours.cta` is appropriate for the "unresolved placeholders blocking upload" warning — that IS urgent. Don't strip it from there if you audit colour usage during Phase B.
- Word's autocorrect can re-introduce smart quotes / em-dashes that break docxtemplater's `{{token}}` syntax. Always verify template edits in raw XML during Phase D, not the Word UI.
