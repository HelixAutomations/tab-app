# CCL review — addressee fix + intro/stereo-output prompt refinements

> **Purpose.** Fix the addressee defect where client-care letters drop the client's name ("Dear, blank"). Lift autopilot intro-paragraph quality per live feedback ("getting better" but still hit-and-miss) with a `stereo output` prompt directive aligning the CCL intro with any prior pitch document framing.
>
> **Note.** Pickup-via-To-Do scope (previously Phase B) shipped 2026-04-23 via `HOME_TODO_SINGLE_PICKUP_SURFACE` + 2026-04-24 ND-solicitor-approval rewrite. This brief is now addressee + intro prompt only.
>
> **Verified:** 2026-04-20 against branch `main`. Rescoped 2026-04-24.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/notes/realignmentcall_scope.md](realignmentcall_scope.md)):

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

### 2.1 CCL generation + PT

- Route: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `CCL_PROMPT_VERSION = 'ccl-ai-v3-voice'`, `SYSTEM_PROMPT`, `PRESSURE_TEST_SYSTEM_PROMPT`, L653 fill, L1707 pressure-test.
- Voice: [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js), [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js).
- Field filler gathers matter context from Instructions DB + Deals + PitchContent + Core Data. Addressee fields are part of the 26-field schema.

### 2.2 Addressee defect — root cause (to confirm in Phase A1)

From transcript: the Dear line is sometimes rendered as "Dear," with no name. Likely causes (ordered by suspected likelihood):

1. Template fallback uses `${firstName}` and the field filler returns empty when `FirstName` is missing on `Instructions` but present on `Deals` (or vice versa).
2. Confidence = `fallback` gates out the addressee field in the review rail but the docx template still renders the empty slot.
3. Name concatenation `${salutation} ${firstName}` when `firstName=''` leaves `"Dear, "`.

---

## 3. Plan

### Phase A — Addressee defect (ship first, standalone)

- **A1.** Reproduce. Script: run `scripts/ccl-addressee-repro.mjs` (NEW) against a known matter where the defect was observed (LZ to supply the display number). Capture the field-filler output and the docx render to isolate the stage.
- **A2.** Fix in **two** places:
  - Field filler: ensure addressee fields (`clientFirstName`, `clientLastName`, `clientFullName`, `salutation`) have a deterministic resolution order: `Instructions → Deals → Core Data enquiries`. Never return empty if any source has a value.
  - Docx template (`templates/ccl/*.docx` or wherever the "Dear" slot is — verify path in Phase A1): if `clientFirstName` is empty, render `"Dear Sir / Madam,"` as a last-resort fallback — and also **block the Safety Net auto-approval** on that field (score = 0).
- **A3.** Safety Net guardrail. In [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) `PRESSURE_TEST_SYSTEM_PROMPT`, add an explicit check: *"If clientFirstName or clientFullName is empty or contains placeholder text, score this field 0 and flag as critical."*
- **A4.** Telemetry: `Ccl.Addressee.Empty` event with matter ref + source path taken (so we can trend whether the fix is holding).

### Phase B — Intro paragraph refinement

Keep `CCL_PROMPT_VERSION = 'ccl-ai-v3-voice'`. Targeted prompt tweak only.

- **B1.** Extend `SYSTEM_PROMPT` ([server/routes/ccl-ai.js](../../server/routes/ccl-ai.js)) with an **"Intro paragraph" sub-directive**:
  > *The intro paragraph must (a) acknowledge prior context by summarising the instruction in one clean sentence, (b) state what we understand the client wants us to do, and (c) commit to the scope in the next paragraph. Do not restate fee details in the intro.*
- **B2.** Add **"stereo output" guidance**: *"Where an existing pitch document has been produced and its summary is supplied, mirror its framing and terminology in this letter so the client sees a consistent voice across both documents."*
- **B3.** Safety Net scoring for intro: in `PRESSURE_TEST_SYSTEM_PROMPT`, add a rubric line scoring intro alignment with the pitch summary when one is supplied (0–10; flag at ≤7 as always).
- **B4.** Telemetry: `Ccl.IntroAlignment.Score` metric per run (for trend analysis).

### Phase C — Documentation + changelog

- **C1.** Update [docs/CCL_PROMPT_ENGINEERING.md](../CCL_PROMPT_ENGINEERING.md) with the intro sub-directive and stereo guidance; mark `ccl-ai-v3-voice` as superseded internally only if a future prompt-version bump happens.
- **C2.** [logs/changelog.md](../../logs/changelog.md) entry per phase.

---

## 4. Step-by-step execution order

1. **A1 → A4** — addressee defect lands standalone. Safest; highest-value.
2. **B1 → B4** — prompt tweaks; run A/B with 20 historical matters before rolling out (temperature stays 0.2 for gen, 0.1 for PT).
3. **C1 → C2** — docs + changelog.

---

## 5. Verification checklist

**Phase A:**
- [ ] Repro matter now renders "Dear <FirstName>," correctly.
- [ ] A matter with no first name anywhere renders "Dear Sir / Madam,".
- [ ] Safety Net scores empty addressee = 0 and flags the field.
- [ ] `Ccl.Addressee.Empty` event not firing for happy-path generations.

**Phase B:**
- [ ] Sampled 10 generated letters — intro paragraph references prior instruction context without repeating fee detail.
- [ ] When pitch summary supplied, intro vocabulary aligns.
- [ ] Safety Net intro score logged; average >7 across sample.

---

## 6. Open decisions (defaults proposed)

1. **Block Safety Net auto-approval on any flagged addressee?** Default: **Yes.** Addressee is high-visibility; never autopilot past it.
2. **Prompt-version bump?** Default: **No.** Stay on `ccl-ai-v3-voice` unless regression.
3. **Fallback salutation wording.** Default: **"Dear Sir / Madam,"** (UK formal). Could be "Dear Client," — LZ to confirm if Phase A1 repro reveals frequency.

---

## 7. Out of scope

- Full Helix voice rewrite.
- Review rail UX (shipped via the calm-rail brief).
- Start-from-scratch affordance (shipped via the landing brief).
- Pickup via To Do registry (shipped via `HOME_TODO_SINGLE_PICKUP_SURFACE` + 2026-04-24 ND-approval rewrite).
- Bulk regeneration of historical CCLs.

---

## 8. File index

Server:
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — system + PT prompts, addressee resolution
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
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-24
branch: main
touches:
  client: []
  server:
    - server/routes/ccl-ai.js
    - server/routes/ccl.js
    - server/prompts/helixVoice.js
    - server/prompts/cclSystemPrompt.js
  submodules: []
depends_on: []
coordinates_with:
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
conflicts_with: []
```

---
