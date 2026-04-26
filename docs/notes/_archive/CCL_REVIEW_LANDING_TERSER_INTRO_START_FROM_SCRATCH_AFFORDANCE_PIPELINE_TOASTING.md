# CCL review landing — terser intro, Start from scratch affordance, pipeline toasting

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

While walking through the CCL review modal, the user flagged several things in the intro-landing state (the panel that greets you before you click `Start review (N)`):

> *"CCL Review — 9 points to check — 9 points to set. Safety Net is verifying the rest.*
> *i dont like the little status chain*
>
> *in this one;*
> *CCL Review — 10 points to check — 9 fields to set, 1 surfaced by Safety Net for fee-earner review. Work through the remaining points with the draft open beside you. Replace draft with a fresh run (v4)… Draft prepared in 9.1s — Start review (10)*
>
> *layout this line better: "9 fields to set, 1 surfaced by Safety Net for fee-earner review". otherwise it blends and is hard to get*
>
> *remove this: "Work through the remaining points with the draft open beside you." its obvious*
>
> *instead of "Replace draft with a fresh run (v4)… / Draft prepared in 9.1s", show below the Start review: "Start from scratch". this will show current v being replaced by the new, whatever that is, and will invoke.*
>
> *the workflow is good now it feels, but theres still opportunity to improve on the toasting and responsive updates as the process goes through the pipeline.*

Four distinct items, all on the same surface, so one brief:

1. **Status chain (the dot-line-dot "flow strip")** feels cluttered and the user dislikes it.
2. **The one-liner detail** (`9 fields to set, 1 surfaced by Safety Net for fee-earner review`) runs together and is hard to scan.
3. **Redundant subtitle** (`Work through the remaining points with the draft open beside you.`) — obvious, delete it.
4. **Replace the awkward "Replace draft with a fresh run (v4)…" link + "Draft prepared in 9.1s" duration chip** with a single secondary "Start from scratch" affordance *below* the Start review button. On click it should surface the version bump (current v → next v) and invoke the same override-rerun flow.
5. **Pipeline toasting / responsiveness** — the workflow feels right now; next opportunity is tighter toast / status feedback as generate → stream → pressure-test → handoff progresses.

The user is **not** asking to redesign the rail, change the review fields, retouch the review workspace after `Start review`, or alter the override-rerun backend. This is cosmetic + a minor affordance relocation + toast polish.

---

## 2. Current state — verified findings

All findings verified 2026-04-19 against `src/components/modern/OperationsDashboard.tsx`.

### 2.1 The "little status chain" (setupFlowStrip)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8365–8392 — `setupFlowStrip` JSX: horizontal row of `launchSteps.map(...)` rendering dot + label + thin connector line per step. Active dot uses `cclLaunchDotPulse` keyframe (L1950).
- Rendered into the rail header body when `showSetupInDefaultView` is true. Green for done, accent pulsing for active, CTA red on error, subtleGrey pending.
- User dislikes this chain specifically on the settled review-ready state; it adds visual weight when the setup is already complete.

### 2.2 Intro headline + detail copy

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8748–8766 — `introHeadline` (`Review ready` / `Draft open` / `Preparing your review`) and `introBody` (the one-liner the user wants restructured).
- Current `introBody` for the "ready" path (L8755–8766):
  - If `setWordingCount > 0 && verifyCount > 0`: ``${setWordingCount} field${s} to set, ${verifyCount} surfaced by Safety Net for fee-earner review.``
  - If only verify: ``${verifyCount} field${s} surfaced by Safety Net for review. The rest aligned with source evidence.``
  - Pressure-test pending: ``${setWordingCount} point${s} to set. Safety Net is verifying the rest.``
  - PT complete, no flags: ``${setWordingCount} point${s} to set. All other fields passed Safety Net.``
  - Fallback: ``${visibleReviewFieldCount} point${s} still need${s} sign-off.``
- Currently rendered as a single `<div>` with one run of plain text — no emphasis on the split between "to set" and "Safety Net surfaced". Blends visually.

### 2.3 Redundant subtitle "Work through the remaining points…"

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9328–9344 — `showSummaryLanding` block. Renders a `<div>` with:
  - L9331–9336: ternary showing `'Work through the remaining points with the draft open beside you.'` OR `'The draft is ready for a final read-through.'`.
  - L9337: `{overrideSummaryCard}` (collapsed disclosure link when cleaner Phase B4 ran — see §2.4)
  - L9338–9342: conditional `aiRes.durationMs` chip: `Draft prepared in N.Ns`
  - L9346–9357: the big `Start review (N)` accent-blue button
- User wants: remove the "Work through…" line and the "Draft prepared in…" chip from this slot.

### 2.4 Override-rerun affordance (current collapsed link)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L8710–8735 — `overrideSummaryCard` collapsed state. When `cclOverrideCardExpandedMatter !== cclLetterModal`, renders a text-only button: ``Replace draft with a fresh run (v${replacementDraftVersion})…``. Click → `setCclOverrideCardExpandedMatter(cclLetterModal)` and fires `CCL.OverrideRerun.Expanded` telemetry. Expanding reveals the full comparison card → confirm button → `runHomeCclAiAutofill(cclLetterModal, { overrideExisting: true })`.
- Context: this collapsed affordance was landed 2026-04-19 as Phase B4 of [CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md](CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md) (see [logs/changelog.md](../../logs/changelog.md) L8). The new ask moves the trigger further down and re-frames the copy.
- `overrideSummaryCard` is rendered in two slots: L9337 (summary landing) and L9638 (remaining-points sidebar). Both slots point at the same JSX so any rewording happens once.

### 2.5 The Start review button

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9346–9357 — primary accent-blue CTA. Label: ``Start review (${visibleReviewFieldCount})`` or `Open review workspace` if zero fields. `onClick={beginReviewFromIntro}`.
- Currently nothing sits below it; the "Start from scratch" link needs to live here.

### 2.6 "Draft prepared in N.Ns" duration chip — three call sites

- L9272 — inside the setup/streaming container body.
- L9341 — inside `showSummaryLanding` (the target the user wants removed).
- L9416 — inside the review-rail header when `showSetupInDefaultView` is true.
- The user's complaint is specifically about the summary-landing instance (L9341). L9272 and L9416 fire during setup/streaming and are fine.

### 2.7 Pipeline toasting — current state

- Toasts fire via `notify(...)` (see `src/components/toast/` and `src/app/functions/ToastProvider.tsx`). Current CCL pipeline toast coverage (grep `notify(` inside the CCL flow):
  - `runHomeCclAiAutofill` (`OperationsDashboard.tsx` around L2640): success/failure toasts on generate completion.
  - Pressure-test runner (`cclPressureTest*` helpers): toasts on verify failure; limited progress feedback.
  - Override-rerun confirm flow (`CclOverrideRerunModal.tsx`): toasts on start + failure.
  - Handoff (docx save/upload): separate toast coverage in [src/components/modern/ccl/CclFinalisePanel.tsx](../../src/components/modern/ccl/CclFinalisePanel.tsx) (to verify).
- Gaps: transitions between phases (generate → stream complete → PT started → PT complete → review handoff) rely on the rail's status copy. No micro-toasts for phase hand-offs. No single consolidated "journey" toast that the user can glance at.
- Telemetry already exists (`CCL.AiAutofill.*`, `CCL.PressureTest.*`, `CCL.OverrideRerun.*`) so we have the hook points.

---

## 3. Plan

### Phase A — Intro-landing copy + layout (smallest, ships alone)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Remove `'Work through the remaining points with the draft open beside you.'` subtitle | [OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9331–9336 | Keep the `'The draft is ready for a final read-through.'` fallback for the zero-fields branch. When `visibleReviewFieldCount > 0`, render nothing in this slot — `introBody` already carries the count. |
| A2 | Remove the `Draft prepared in N.Ns` chip from the summary-landing slot | L9338–9342 | Delete this block only. Leave the L9272 and L9416 instances (setup/streaming + rail header during setup) alone. |
| A3 | Restructure the `introBody` "to set, surfaced by Safety Net" line for scannability | L8755–8766 | Change the `setWordingCount > 0 && verifyCount > 0` branch from one flat sentence to a two-line structure via JSX (not string concat). Render as a `<div>` with two lines: line 1 `<strong>{setWordingCount}</strong> to set` and line 2 `<strong style={{ color: colours.orange }}>{verifyCount}</strong> surfaced by Safety Net for review`. Keep the other branches single-line but elevate the numerals via `<strong style={{ color: '#f3f4f6' }}>`. See precedent at L9629 which already uses `<strong>` for the same counts in another slot — port that pattern up. |
| A4 | Hide the `setupFlowStrip` on the ready state | L8365–8392, usage site to locate | Grep `setupFlowStrip` — strip is currently rendered while `showSetupInDefaultView` is true. Verify whether it still shows after the review is ready; if yes, gate render on `launchPressureRunning \|\| launchIsStreamingNow \|\| launchTraceLoading` — hide once settled. If it was already hidden on ready, no-op and remove the todo. |

**Phase A acceptance:**
- Ready-state landing shows: headline (`Review ready`) + two-line scannable count + override disclosure link + `Start review (N)` button. No "Work through…", no duration chip, no dot-chain.
- Safety-Net count is visually distinct from the to-set count (colour + weight).
- Setup state (generating / pressure-testing) is unchanged — status chain and duration chip still show there.
- `get_errors` clean on `OperationsDashboard.tsx`.
- App Insights still emits `CCL.OverrideRerun.Expanded` when the disclosure link is clicked.

### Phase B — "Start from scratch" affordance below Start review

#### B1. Move the override disclosure link

Relocate the collapsed `overrideSummaryCard` from *above* the Start review button (L9337) to a new slot *below* it. Keep the expanded card (the full comparison UI with cancel + confirm) anchored where it is today so mid-flow state isn't lost — only the collapsed single-line disclosure moves.

- When collapsed: render a secondary link/button below `Start review (N)` with copy `Start from scratch`. Hover/focus expands via the same `setCclOverrideCardExpandedMatter` setter.
- When expanded: existing full card renders in the original slot (L8693–8709) as today. The Phase B4 `cclOverrideCardExpandedMatter` state already handles this.
- Visual weight: use `colours.subtleGrey` for the label, with `colours.accent` (dark) / `colours.highlight` (light) on hover. Smaller font than the link currently at L8732 — 10.5px, letterSpacing 0.04em, uppercase.

#### B2. Surface the version bump in the link itself

The new link should communicate "current v → next v" inline so users understand what will happen. Pattern:

```tsx
`Start from scratch — v${currentDraftVersion} → v${replacementDraftVersion}`
```

`currentDraftVersion` derivation: grep near L8655 for existing `draftVersion` / `replacementDraftVersion` sources; they're already available in scope via the CCL draft state.

Fallback when versions unknown: render `Start from scratch` alone.

#### B3. Confirm modal unchanged

`CclOverrideRerunModal.tsx` (confirm/cancel modal) already shows the comparison in full detail — no changes needed.

#### B4. Keep a single affordance source of truth

The current code renders `overrideSummaryCard` twice (L9337 summary landing + L9638 remaining-points sidebar). After B1 moves the collapsed form down, audit: the sidebar render at L9638 may still want the *original* copy style since it's a different context. Decision default: keep sidebar copy as-is (`Replace draft with a fresh run (vN)…`) and only reword the landing one. Rationale: the sidebar appears when some fields are set and some pending, and the user's feedback was specifically about the pre-review landing state.

**Phase B acceptance:**
- Ready-state landing vertical order: headline → two-line count → `Start review (N)` button → `Start from scratch — vN → vN+1` link.
- Clicking the link expands the full comparison card in its original position (not below the Start review button); focus moves into the card.
- `Start from scratch` link honours keyboard nav (tab order, Enter to activate, Escape to collapse).
- App Insights: `CCL.OverrideRerun.Expanded` still fires; telemetry `source: 'landing-below-start-review'` added to the event props so we can measure affordance discovery vs. the older position.

### Phase C — Pipeline toasting + responsive status updates

#### C1. Map the pipeline phases

Catalogue the CCL pipeline phases in order:

1. **Generate start** — `CCL.AiAutofill.Started`.
2. **Stream progress** — per-field `CCL.AiAutofill.FieldStreamed` (verify exists; otherwise add).
3. **Stream complete** — `CCL.AiAutofill.Completed`.
4. **Pressure-test start** — `CCL.PressureTest.Started`.
5. **Pressure-test per-field** — `CCL.PressureTest.FieldScored`.
6. **Pressure-test complete** — `CCL.PressureTest.Completed`.
7. **Handoff** — draft becomes `Review ready`. Emit `CCL.Review.HandoffReady` (new).
8. **Save + upload** — covered by `CclFinalisePanel` path.

#### C2. Decide toast vs rail-status responsibility

Rail already shows live status (headline + body + flow strip). Toasts should fire only on **phase transitions the user cares about when their attention is elsewhere** — specifically:

- Generate complete (`Draft ready — N points to check`)
- Pressure-test complete (`Safety Net finished — N surfaced for review`)
- Handoff ready (suppressed — rail already says `Review ready` big and clear)
- Any failure at any phase (`CCL pipeline failed at <phase>`)

All other per-field progress stays on the rail.

#### C3. Responsive updates — latency audit

Two observed gaps (verify before fixing):
- Between stream-complete and pressure-test-start, the rail can sit on "N fields generated" for up to ~400ms before flipping to "Pressure testing N fields". Fix by flipping `launchPressureRunning` optimistically the moment stream completes, even before the first PT request flies.
- `aiState.detail` updates on SSE events; confirm no debounce is swallowing the final event.

#### C4. Consolidate notify call sites

Extract a tiny helper `useCclPipelineToasts(matterId)` (new file `src/components/modern/ccl/useCclPipelineToasts.ts`) that subscribes to the existing telemetry/status stream and fires the four toasts above. Keeps `OperationsDashboard.tsx` clean.

**Phase C acceptance:**
- User leaves the page during a long generate → returns → sees a toast (within last 60s) saying the draft is ready.
- Pressure-test failures surface a toast that links back to the affected field.
- No duplicate toasts between the pipeline hook and existing per-step handlers.
- Rail status updates feel instant at each phase transition (no "stuck" status).

### Phase D — Field-focus rail: rebuild the information architecture

User (2026-04-20) pushed back on the earlier densification scope:

> *"its not about just removing these bits, the page needs to feel intuitive in terms of whats being shown and asked. scope the implementation purposefully."*

Prior framing (2026-04-20): *"this is a backend service, and this is only a review process when required."*

The field-focus rail is not a workflow tab. It is a **one-question confirmation surface**: the autopilot has stopped here because it needs a fee-earner sentence. Every element on screen should either (a) identify *which* point we're on, (b) say *why* the human is being asked, or (c) be the answer mechanism. Everything else is friction.

#### D0. Audit — what the rail currently asks of the reader

Counting distinct UI elements the user has to parse before they can act ([CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) + [CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx)):

| # | Element | Purpose served |
|---|---------|----------------|
| 1 | `1 of 10` count | ✅ orientation |
| 2 | `Set wording` action pill | ✅ identifies what's being asked |
| 3 | `Realistic Timescale` field title | ✅ identifies the point |
| 4 | `Section 3 · Next steps` group | ✅ locates it in the letter |
| 5 | `No source found — set manually.` decision reason | ✅ the "why" |
| 6 | `Evidence aligned · 8/10` signal title | ❌ bug: shouldn't render on non-flagged |
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
| 17 | `Reopen this point` alt label | ⚠️ edge case, rarely needed |

**9 of 17 elements are either redundant, misplaced, or rendered incorrectly.** The textarea — which is the *entire point of the page* — sits below five other labels and helpers.

#### D1. Redesigned information architecture

Top to bottom, one focused column. Target: the user's eye lands on what to do within one scan.

1. **Orientation strip** (one line, 11px, subtle grey):
   `3 / 10 · Realistic Timescale · Section 3 — Next steps`
   The field title becomes part of the locator line, not a standalone heading. Group label folds in after an em-dash.

2. **The ask** (largest type on the rail, 16–17px, white):
   - `set-wording` path → **"Set the wording for this point."**
   - `verify` path (PT-flagged) → **"Confirm this wording fits the evidence."**
   - Nothing else. The fieldType and its verb *are* the ask — no separate action pill needed.

3. **The why** (single paragraph, 12px, body text):
   - `set-wording` + no source → *"The source material didn't give us this detail. Your wording goes straight into the draft."*
   - `set-wording` + unknown confidence → *"The AI wasn't confident enough to auto-fill this. Your call."*
   - `verify` (PT flagged) → renders the PT `reason` verbatim — that's the whole point of the flag, show it as-is.
   - Above the paragraph, a small inline tag when PT-flagged: `Safety Net · N/10` in orange. **Not rendered for non-flagged fields** (fixes the 8/10 bug — see D3).

4. **Branch picker** *(only when `choiceConfig` exists)*:
   Rendered as chips/radio cards directly above the textarea — same container, not a separate "Decision" section. Selecting a chip updates the textarea inline. Chip copy keeps `option.title` but the `option.help` moves to a tooltip, not stacked below every chip. Preview line stays (it *is* the content).

5. **The answer** (the textarea — tallest element, no label above):
   - Placeholder becomes the lightweight guidance: *"Type the wording that should appear in the letter."*
   - Auto-grows (already does).
   - Focus ring in `colours.highlight`.

6. **Commit row** (one row, right-aligned primary, left-aligned back):
   - **Left:** `← Back` as a chevron + text ghost button (not a filled peer of Save). When `currentDecisionNumber === 1`, label becomes `← Summary`.
   - **Right:** primary button, dynamic label:
     - hasNextDecision → `Save · next point`
     - !hasNextDecision && canApprove → `Save · review complete`
     - selectedFieldIsReviewed → `Reopen`
   - No footer helper sentence. The button label is the commit story.

7. **Approve button** *(only when `canApprove && !hasNextDecision`)*: renders inline with the save button as a secondary accent, unchanged from today.

**Net reduction:** 17 elements → 6 elements (plus the optional chip picker). Every remaining element answers one of: *which point, what's being asked, why, your answer, commit, escape*.

#### D2. Implementation shape

| File | Change |
|------|--------|
| [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) | Collapse eyebrow + title + group into a single `orientation-strip`. Replace signal block with **the-ask** + **the-why** blocks. Drop the separate `Back` button (moves to decision panel commit row). New prop: `onBack` forwarded down. Delete `getActionLabel`, rewrite `getSignalTitle`/`getSignalBody` to match new copy set (or fold into parent and delete this helper file if it becomes thin). |
| [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) | Delete `Decision` section label + `section-help` paragraph + `Wording going into the letter` label + its `section-help`. Move textarea/preview to sit directly under the branch picker (or at the top of the panel when no choiceConfig). Delete `footer` helper sentence. Restructure `actions` container to host back-button + save-button in one row. Update `completeLabel` cases: `Save · next point` / `Save · review complete` / `Save` / `Reopen`. |
| [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Pass `onBack` through to the decision panel (not just the header). If the header component becomes thin enough, inline it and delete the file. |
| [src/components/modern/ccl-modern-panel.css](../../src/components/modern/ccl-modern-panel.css) *(or wherever `.ccl-review-field-header__*` lives)* | Tighten gaps (24 → 14). Drop `.ccl-review-field-header__title` as a standalone heading. Add `.ccl-review-field-header__ask` (16–17px) + `.ccl-review-field-header__why` (12px). Add `.ccl-review-decision__commit-row`. Delete rules for `section-label`, `section-help`, `footer`. |

Verify the CSS file path before editing — grep `ccl-review-field-header__` to find the source file.

#### D3. Bug fix: non-flagged PT score leaks into the rail

Independent of the redesign, fix this first (small, safe):

- [CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) L24–34 currently renders `Evidence aligned · N/10` whenever `pressureTest` is defined, regardless of `flag`.
- Backend is correct: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) L1766 `const flag = score <= 7;`. Canonical threshold: [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) L101.
- The 8/10 seen by the user is on a `set-wording` field that happens to have PT data attached. PT data for non-flagged fields is internal metadata, not a user-facing signal.

**Fix:** gate every PT render on `pressureTest?.flag === true`. In the redesigned rail (D1) this becomes even cleaner: the `Safety Net · N/10` tag only appears on the `verify` path, where by definition `flag === true`.

#### D4. Copy register (canonical strings for review)

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

#### D5. Out of scope (park as follow-ups, not in Phase D)

- **Inline diff preview** (show what the wording will replace in the draft) — scope separately.
- **Per-field confidence dots in the left sidebar** — different brief.
- **Keyboard shortcuts** (J/K for next/prev, Cmd+Enter to save) — add after the IA settles.

#### D6. Telemetry

- Verify `CCL.Review.FieldFocused` already fires with `{ fieldKey, fieldType, hasPtFlag }`. If missing, add.
- Add `CCL.Review.FieldSaved` on save click with `{ fieldKey, wordingChanged: boolean, choiceSelected?: string }`.
- No new events for the redesign itself — existing rail events are sufficient.

#### D7. Acceptance

**Bug fix (D3):**
- [ ] `set-wording` field with PT score 8/10 (non-flagged) shows **no** `Evidence aligned` / `Safety Net` signal anywhere in the rail.
- [ ] `verify` field (PT flagged) shows `Safety Net · N/10` tag in orange + the PT reason verbatim.

**IA redesign (D1–D2, D4):**
- [ ] First line of the rail is a single 11px strip: `3 / 10 · Realistic Timescale · Section 3 — Next steps` — nothing else at that vertical position.
- [ ] Second element is the bold ask sentence in 16–17px (`Set the wording for this point.` or `Confirm this wording fits the evidence.`).
- [ ] Third element is the "why" paragraph (PT reason verbatim on verify path, or one of the two fallback sentences on set-wording path).
- [ ] Textarea is the largest interactive element on the rail, with no label directly above it.
- [ ] No occurrences in the rail of: `Decision`, `Wording going into the letter`, `Adjust the wording directly`, `Edit the wording directly`, `Saving this point keeps`.
- [ ] Back + Save sit in one commit row; Back is a chevron+text ghost, Save is the primary button with dynamic label per D4.
- [ ] Approve button still renders inline when `canApprove && !hasNextDecision`.
- [ ] `get_errors` clean on [OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx), [CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx), [CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx).
- [ ] On a real matter with 1 flagged field + 1 set-wording field, both paths are distinguishable within one second of looking at the rail.

---

## 4. Step-by-step execution order

1. ✅ **A1** — remove the `'Work through the remaining points…'` subtitle in the summary-landing block. *(shipped 2026-04-20)*
2. ✅ **A2** — remove the `Draft prepared in N.Ns` chip from the same block. *(shipped 2026-04-20)*
3. ✅ **A3** — restructure `introBody` to a JSX two-line layout with coloured `<strong>` emphasis on counts. *(shipped 2026-04-20)*
4. ✅ **A4** — verified `setupFlowStrip` is already gated to `showSetupInDefaultView`; no action needed. *(no-op 2026-04-20)*
5. **D3** — ship the bug fix first (gate PT signal on `flag === true`). Standalone, small, safe.
6. **D1 + D2 + D4** — rebuild the field-focus rail to the new 6-element IA. Touches `CclReviewFieldHeader.tsx`, `CclReviewDecisionPanel.tsx`, `OperationsDashboard.tsx`, CSS.
7. Ship Phase D, changelog entry.
10. **B1** — move collapsed `overrideSummaryCard` link below `Start review (N)`; keep expanded card in original slot.
11. **B2** — update link copy to include version bump (`v4 → v5`).
12. **B4** — audit the sidebar duplicate render; decide leave-as-is.
13. Ship Phase B, changelog entry.
14. **C1** — audit pipeline phases and existing telemetry.
15. **C3** — fix any rail-status latency gaps first (cheap wins before toasts).
16. **C4** — create `useCclPipelineToasts` hook and wire into the modal.
17. **C2** — restrict toasts to the four phase transitions the user cares about when attention is elsewhere.
18. Ship Phase C, changelog entry.

---

## 5. Verification checklist

**Phase A:** ✅ Shipped 2026-04-20.
- [x] On a matter with 9 to-set + 1 Safety-Net-surfaced field, ready-state landing shows only: headline, two-line scannable count (9 to set / 1 surfaced by Safety Net), Start review button.
- [x] "Work through the remaining points…" text does not appear anywhere.
- [x] "Draft prepared in N.Ns" chip does not appear below the Start review button.
- [x] Count numbers use `<strong>`, Safety-Net count coloured `colours.orange`.
- [x] `get_errors` clean on [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx).
- [x] Status chain (setupFlowStrip) already gated to setup state — no action needed.

**Phase D:** ✅ Shipped 2026-04-20.
- [x] PT signal never renders for non-flagged fields (D3 bug fix — now gated on `pressureTest?.flag === true` in [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx)).
- [x] Field-focus rail has 6 elements top-to-bottom: orientation strip → ask sentence → why paragraph → (optional chip picker) → textarea → commit row. Nothing else.
- [x] Ask sentence reads `Set the wording for this point.` or `Confirm this wording fits the evidence.` depending on path.
- [x] On `verify` path, `Safety Net · N/10` tag appears inline above the why paragraph in orange; on `set-wording` path, no tag.
- [x] Commit row: `← Back` (or `← Summary` on first point) ghost button left, primary save button right with dynamic label (`Save · next point` / `Save · review complete` / `Save`).
- [x] No occurrences of `Decision`, `Wording going into the letter`, `Adjust the wording directly`, `Edit the wording directly`, `Saving this point keeps`.
- [x] `get_errors` clean on all four touched files (header, decision panel, OperationsDashboard, design-tokens.css).
- [ ] **User to confirm**: eye lands on the textarea within one scan (visual check on next CCL review).

**Phase B:** ✅ Shipped 2026-04-20 (as part of Wave 1 v2 polish — see changelog).
- [x] Below `Start review (N)`: secondary link `Start again (v4 → v5)` with refresh icon (renamed from `Start from scratch`).
- [x] Clicking the link expands the full override-rerun card in its original slot (above the button).
- [ ] **User to confirm**: focus moves into the expanded card. Escape collapses back to the link.
- [ ] **User to confirm**: App Insights: `CCL.OverrideRerun.Expanded` events appear (existing event, no `source` discriminator added — both render sites share the same handler).
- [x] Sidebar override disclosure at L9638 still shows the legacy copy (unchanged — second render site at L9881 also adopted the new ghost link beneath action row).

**Phase C:**
- [ ] Backgrounded tab test: user switches away during generate → returns post-completion → sees a toast within 60s.
- [ ] Pressure-test complete emits a toast summarising surfaced count.
- [ ] Pipeline failures emit a toast with phase name.
- [ ] No double-toast from existing handlers + new hook.
- [ ] Rail status transitions have no visible stall between stream-complete and pressure-test-start.
- [ ] App Insights events: `CCL.AiAutofill.Started/Completed/Failed`, `CCL.PressureTest.Started/Completed/Failed`, `CCL.Review.HandoffReady` (new).

---

## 6. Open decisions (defaults proposed)

1. **Sidebar override link copy** (L9638 render of `overrideSummaryCard`) — Default: **leave as `Replace draft with a fresh run (vN)…`**. Rationale: sidebar is a different context (mid-review), and the user's feedback was scoped to the pre-review landing.
2. **Hide status chain on ready state** (A4) — Default: **hide**. Rationale: user explicitly said they don't like it; on ready state the chain tells you nothing you can't see from the count line.
3. **"Start from scratch" link weight** — Default: **subtle** (10.5px, subtleGrey → accent on hover, no border, no background). Rationale: never the primary action on this screen; primary is Start review.
4. **Two-line count layout vs. badge+count** (A3) — Default: **two-line JSX with coloured `<strong>`**. Rationale: simplest, no new component, reuses L9629 precedent.
5. **Version-bump inline in link copy** (B2) — Default: **show when available, fall back to bare label**. Rationale: useful signal without being noisy; guards against nullish version state.
6. **Pipeline toasts scope** (C2) — Default: **only on phase transitions user cares about when attention is elsewhere** (generate-complete, PT-complete, any failure). Rationale: avoid toast spam when rail already shows live status.

---

## 7. Out of scope

- The review workspace layout *after* `Start review (N)` is clicked — this brief is about the landing only.
- The override-rerun backend flow (`runHomeCclAiAutofill({ overrideExisting: true })`) — owned by [CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md](CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md) Phase A.
- docx fidelity / template polish — owned by the same brief's Phase C.
- Prompt + field schema changes — owned by [CCL_PROMPT_FEEDBACK_LOOP_SELF_DRIVING_TEMPLATE_IMPROVEMENT.md](CCL_PROMPT_FEEDBACK_LOOP_SELF_DRIVING_TEMPLATE_IMPROVEMENT.md).
- Silent / autopilot CCL generation — owned by [CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md](CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md).
- Any change to the CCL review **rail header** once a field is focused (`CclReviewFieldHeader`) — unrelated to landing.
- Extending toasts into the finalise/upload step — already covered elsewhere.

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — the CCL letter modal, intro landing, summary-landing block, setupFlowStrip, introBody derivation, passes props into the field-focus rail.
- [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) — Phase D rebuild: collapse eyebrow/title/group into orientation strip; replace signal block with ask + why; gate PT render on `flag === true`.
- [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) — Phase D rebuild: drop "Decision" / "Wording going into the letter" section labels + helpers + footer; merge back button into commit row.
- [src/components/modern/ccl/CclOverrideRerunModal.tsx](../../src/components/modern/ccl/CclOverrideRerunModal.tsx) — confirm/cancel modal (unchanged by this brief, referenced for context).
- [src/components/modern/ccl/CclFinalisePanel.tsx](../../src/components/modern/ccl/CclFinalisePanel.tsx) — finalise/upload toast coverage (verify only in Phase C).
- CSS (grep `ccl-review-field-header__` / `ccl-review-decision__` to find the source file) — Phase D: tighten gaps, add `.ask` / `.why` / `.commit-row` classes, delete section-label / section-help / footer rules.

New files (Phase C):
- `src/components/modern/ccl/useCclPipelineToasts.ts` (NEW) — consolidated toast hook.

Server:
- None for Phases A and B. Phase C may add a `CCL.Review.HandoffReady` App Insights event from the existing telemetry utility in [server/utils/appInsights.js](../../server/utils/appInsights.js) if the event doesn't already exist — verify before adding.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — one entry per phase.
- [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — read-only reference for pipeline phases.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-19
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/CclReviewFieldHeader.tsx
    - src/components/modern/ccl/useCclPipelineToasts.ts
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-backend-chain-silent-autopilot-service
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - demo-mode-hardening-production-presentable-end-to-end
conflicts_with: []
```

---

## 9. Gotchas appendix

<The non-transferable residue. Things you only spot by tracing the code in this session. Examples:>

- `<file>` line N uses `event.stopPropagation()` on the inner Edit click — preserve that when restructuring or the parent row's onClick will fire.
- `<helper>` looks like a one-liner but has hidden side effects in <other file>.
- The `<seemingly-obvious-fix>` was tried before and reverted in commit `<sha>` because <reason>.
