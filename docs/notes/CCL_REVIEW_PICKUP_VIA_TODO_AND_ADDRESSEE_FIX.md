# CCL review — pickup via To Do + addressee fix + autopilot refinements

> **Purpose.** Route CCL review pickup through the Home To Do registry (Stream 2) instead of the matters-box row. Fix the addressee defect where client-care letters drop the client's name. Lift autopilot prompt quality per live feedback ("getting better" but still hit-and-miss). This brief is the CCL-side delta on top of the already-stashed backend-chain/autopilot brief.
>
> **Verified:** 2026-04-20 against branch `main`.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/notes/realignmentcall_scope.md](realignmentcall_scope.md)):

- *"I considered home to be the place users pick up client care reviews from"*
- *"dropping the name of the person it's addressed to... came out saying 'Dear, blank'... no name in the dear section"* → bug.
- *"a real kind of key thing that keeps coming up... this needs to really work properly"*
- *"in general the content of the CCL is getting better"*
- *"there is a step missing... the intro still needs a bit of work... I'm building on the understanding of... what we're trying to deliver for the client"*
- *"I want it to be a stereo output... so that's stereo kind of in both headphones"*
- *"the fee earner doesn't want to keep repeating instructions... what we've done to that point"*
- On PT rigour: *"the pressure testing gives me comfort"* — keep it; compensates for prompt limits.

Out of scope: revisiting CCL_PROMPT_VERSION (retain `ccl-ai-v3-voice`). No rewrite of Safety Net scoring rubric. No changes to Helix voice outside of the intro paragraph.

---

## 2. Current state — verified findings

### 2.1 Pickup surface (today)

- Deep-link dispatcher: [src/components/modern/matter-opening/MatterOpenedHandoff.tsx L171](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx#L171) — emits `openHomeCclReview`.
- Listener: [src/components/modern/OperationsDashboard.tsx L4232](../../src/components/modern/OperationsDashboard.tsx#L4232).
- Matters-box row: rendered in OperationsDashboard L8622 / L8649 area. Click → `openHomeCclReview`.
- App deep-link: [src/app/App.tsx L827](../../src/app/App.tsx#L827).

### 2.2 CCL generation + PT

- Route: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `CCL_PROMPT_VERSION = 'ccl-ai-v3-voice'`, `SYSTEM_PROMPT`, `PRESSURE_TEST_SYSTEM_PROMPT`, L653 fill, L1707 pressure-test.
- Voice: [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js), [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js).
- Field filler gathers matter context from Instructions DB + Deals + PitchContent + Core Data. Addressee fields are part of the 26-field schema.

### 2.3 Addressee defect — root cause (to confirm in Phase A1)

From transcript: the Dear line is sometimes rendered as "Dear," with no name. Likely causes (ordered by suspected likelihood):

1. Template fallback uses `${firstName}` and the field filler returns empty when `FirstName` is missing on `Instructions` but present on `Deals` (or vice versa).
2. Confidence = `fallback` gates out the addressee field in the review rail but the docx template still renders the empty slot.
3. Name concatenation `${salutation} ${firstName}` when `firstName=''` leaves `"Dear, "`.

### 2.4 Related briefs

- [CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md](CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md) — this brief amends pickup-surface section only; the backend-chain architecture is otherwise intact.
- [CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md](CCL_REVIEW_EXPERIENCE_CALM_RAIL_OVERRIDE_RERUN_FIX_DOCX_FIDELITY.md) — coordinates on review rail behaviour.
- [CCL_REVIEW_LANDING_TERSER_INTRO_START_FROM_SCRATCH_AFFORDANCE_PIPELINE_TOASTING.md](CCL_REVIEW_LANDING_TERSER_INTRO_START_FROM_SCRATCH_AFFORDANCE_PIPELINE_TOASTING.md) — coordinates on landing + intro.
- [HOME_TODO_SINGLE_PICKUP_SURFACE.md](HOME_TODO_SINGLE_PICKUP_SURFACE.md) — dependency. This brief wires CCL into that registry.

---

## 3. Plan

### Phase A — Addressee defect (ship first, standalone)

- **A1.** Reproduce. Script: run `scripts/ccl-addressee-repro.mjs` (NEW) against a known matter where the defect was observed (LZ to supply the display number). Capture the field-filler output and the docx render to isolate the stage.
- **A2.** Fix in **two** places:
  - Field filler: ensure addressee fields (`clientFirstName`, `clientLastName`, `clientFullName`, `salutation`) have a deterministic resolution order: `Instructions → Deals → Core Data enquiries`. Never return empty if any source has a value.
  - Docx template (`templates/ccl/*.docx` or wherever the "Dear" slot is — verify path in Phase A1): if `clientFirstName` is empty, render `"Dear Sir / Madam,"` as a last-resort fallback — and also **block the Safety Net auto-approval** on that field (score = 0).
- **A3.** Safety Net guardrail. In [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) `PRESSURE_TEST_SYSTEM_PROMPT`, add an explicit check: *"If clientFirstName or clientFullName is empty or contains placeholder text, score this field 0 and flag as critical."*
- **A4.** Telemetry: `Ccl.Addressee.Empty` event with matter ref + source path taken (so we can trend whether the fix is holding).

### Phase B — Pickup via To Do registry

- **B1.** Autopilot completion event (server-side) → `POST /api/todo/create` with `{kind: 'review-ccl', ownerInitials: <feeEarner>, matterRef, docType: 'Client Care Letter', stage: 'review', payload: {cclId, safetyNetFlagged: <count>}}`. Idempotent on `(kind, matterRef, ownerInitials)`.
- **B2.** Client-side, when autopilot finishes and PT returns flagged fields, `MatterOpenedHandoff.tsx` (L171) also dispatches `openHomeCclReview` with the `cclId` attached (existing behaviour). The To Do card's click handler fires the same custom event — both paths converge on the same review rail.
- **B3.** Remove the matters-box row pickup. Delete the CCL row in OperationsDashboard L8622/L8649. The matters box reverts to its matter-listing role. Retain the `openHomeCclReview` listener in OperationsDashboard L4232 — it's the review-opener contract.
- **B4.** On review Save / discard → `POST /api/todo/reconcile` to close the card.

### Phase C — Intro paragraph refinement

Keep `CCL_PROMPT_VERSION = 'ccl-ai-v3-voice'`. Targeted prompt tweak only.

- **C1.** Extend `SYSTEM_PROMPT` ([server/routes/ccl-ai.js](../../server/routes/ccl-ai.js)) with an **"Intro paragraph" sub-directive**:
  > *The intro paragraph must (a) acknowledge prior context by summarising the instruction in one clean sentence, (b) state what we understand the client wants us to do, and (c) commit to the scope in the next paragraph. Do not restate fee details in the intro.*
- **C2.** Add **"stereo output" guidance**: *"Where an existing pitch document has been produced and its summary is supplied, mirror its framing and terminology in this letter so the client sees a consistent voice across both documents."*
- **C3.** Safety Net scoring for intro: in `PRESSURE_TEST_SYSTEM_PROMPT`, add a rubric line scoring intro alignment with the pitch summary when one is supplied (0–10; flag at ≤7 as always).
- **C4.** Telemetry: `Ccl.IntroAlignment.Score` metric per run (for trend analysis).

### Phase D — Documentation + changelog

- **D1.** Update [docs/CCL_PROMPT_ENGINEERING.md](../CCL_PROMPT_ENGINEERING.md) with the intro sub-directive and stereo guidance; mark `ccl-ai-v3-voice` as superseded internally only if a future prompt-version bump happens.
- **D2.** [logs/changelog.md](../../logs/changelog.md) entry per phase.

---

## 4. Step-by-step execution order

1. **A1 → A4** — addressee defect lands standalone, independent of Stream 2. Safest; highest-value.
2. **C1 → C4** — prompt tweaks; run A/B with 20 historical matters before rolling out (temperature stays 0.2 for gen, 0.1 for PT).
3. **B1** — server emits To Do card on autopilot completion. Matters-box pickup remains live during migration.
4. **B2** — client dispatches card id + existing custom event; verify review rail opens from both surfaces.
5. **B3** — remove matters-box row; only after Stream 2 Phase A has shipped.
6. **B4** — reconcile on save/discard.

---

## 5. Verification checklist

**Phase A:**
- [ ] Repro matter now renders "Dear <FirstName>," correctly.
- [ ] A matter with no first name anywhere renders "Dear Sir / Madam,".
- [ ] Safety Net scores empty addressee = 0 and flags the field.
- [ ] `Ccl.Addressee.Empty` event not firing for happy-path generations.

**Phase B:**
- [ ] Autopilot completion creates a single `review-ccl` card in `hub_todo`.
- [ ] Clicking the card opens the same review rail as the old matters-box row did.
- [ ] Save / discard closes the card.
- [ ] Matters-box row removed (post-migration).

**Phase C:**
- [ ] Sampled 10 generated letters — intro paragraph references prior instruction context without repeating fee detail.
- [ ] When pitch summary supplied, intro vocabulary aligns.
- [ ] Safety Net intro score logged; average >7 across sample.

---

## 6. Open decisions (defaults proposed)

1. **Block Safety Net auto-approval on any flagged addressee?** Default: **Yes.** Addressee is high-visibility; never autopilot past it.
2. **Keep both matters-box row and To Do card live during migration?** Default: **Yes, for 1 week.** Remove matters-box after LZ signs off.
3. **Prompt-version bump?** Default: **No.** Stay on `ccl-ai-v3-voice` unless regression.
4. **Fallback salutation wording.** Default: **"Dear Sir / Madam,"** (UK formal). Could be "Dear Client," — LZ to confirm if Phase A1 repro reveals frequency.

---

## 7. Out of scope

- Full Helix voice rewrite.
- Review rail UX (covered by the calm-rail brief).
- Start-from-scratch affordance (covered by the landing brief).
- Bulk regeneration of historical CCLs.

---

## 8. File index

Client:
- [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx)
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — matters-box row removal
- [src/app/App.tsx](../../src/app/App.tsx)

Server:
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — system + PT prompts, addressee resolution, To Do emit
- [server/routes/ccl.js](../../server/routes/ccl.js) — if docx fallback sits here (L967, L1103, L1231)
- [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js)
- [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js)

Templates:
- `templates/ccl/*.docx` — confirm path in Phase A1

Docs:
- [docs/CCL_PROMPT_ENGINEERING.md](../CCL_PROMPT_ENGINEERING.md)

Scripts:
- `scripts/ccl-addressee-repro.mjs` (NEW)

### Stash metadata

```yaml
# Stash metadata
id: ccl-review-pickup-via-todo-and-addressee-fix
verified: 2026-04-20
branch: main
touches:
  client:
    - src/components/modern/matter-opening/MatterOpenedHandoff.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/app/App.tsx
  server:
    - server/routes/ccl-ai.js
    - server/routes/ccl.js
    - server/prompts/helixVoice.js
    - server/prompts/cclSystemPrompt.js
  submodules: []
depends_on:
  - home-todo-single-pickup-surface
coordinates_with:
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - chat-tab-removal-retain-infra
  - demo-mode-hardening-production-presentable-end-to-end
  - home-animation-order-and-demo-insert-fidelity
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with:
  - ccl-backend-chain-silent-autopilot-service
```

---

## 9. Gotchas appendix

- Do NOT duplicate the `openHomeCclReview` custom event — it's the review-opener contract shared across deep-link (App.tsx) and MatterOpenedHandoff and the new To Do click handler. Keep it; don't refactor into props-drilling.
- The field filler resolution order matters: Instructions is the canonical source for most matters, but company-client cases populate `FirstName` on `Deals` with the contact person's name. Don't reverse the priority or you'll clobber good data with `null`.
- `PRESSURE_TEST_SYSTEM_PROMPT` temperature is 0.1 — changes propagate deterministically. Retune via small, specific rubric lines; avoid rewriting the whole prompt.
- `ccl-ai-v3-voice` is referenced elsewhere for telemetry/analytics filtering. Don't rename it; bump the version when genuinely breaking the prompt contract.
- Matters-box CCL row removal must ship **after** Stream 2 Phase A — otherwise users will have no pickup surface at all for a window.
- Addressee telemetry `Ccl.Addressee.Empty` should fire even when the fallback saves the day (so we know the field filler hit its recovery branch). Use `source: 'instructions' | 'deals' | 'corecore' | 'fallback-sir-madam'`.
