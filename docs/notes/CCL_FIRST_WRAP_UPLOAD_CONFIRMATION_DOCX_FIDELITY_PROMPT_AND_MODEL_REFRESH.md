# CCL first wrap — upload confirmation, docx fidelity, prompt and model refresh

> **Purpose of this document.** Self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below. This is *the* CCL "first wrap" brief — when this is shipped, the CCL surface is production-confident end-to-end.
>
> **How to use it.** Read the whole document once. Phases are independently shippable but the recommended order (W1 → 2D → 2B → 2A + 2C) is in §4. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-27 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User verbatim (2026-04-27):

> *"is the CCL production ready now? can we ship?"*
>
> *"for one — we need to add upload confirmation to the end of the ccl review then no? […] the docx bit still needs alot of work tbh, i am going to want to change the header and footer and we will hve to focus on the prompt sent to the ai, updating its version from gpt 5.1 to latest if we can via foundry, and tweaking the prompt and checing output. so theres quite alot of lifting still and we need to bring this up to a confident point today."*
>
> *"scope all of these little outstanding gap filling oil so it runs like a well oiled machine instead of some old dog with no cartilage left!"*
>
> *"stash this last comprehensive sprint and i want this to be the first CCL wrap. by the end of it the content should be good enough."*

Three things were already shipped (verified 2026-04-27, see §2.0) so this brief intentionally **does not** re-do them:
- The silent `CCL_AUTO_UPLOAD_ND` chain is already a no-op (`server/routes/ccl.js` L1410, comment "no-op since 2026-04-24").
- The non-flagged pressure-test score leak is already fixed in `CclReviewFieldHeader.tsx` (`isFlagged = pressureTest?.flag === true`, L86; `showSafetyNetTag = isFlagged && …`, L88).
- The approval-action extraction has shipped as `useCclReviewApprovalFlow.ts`.

What this brief *is* asking for: turn the remaining "soft seams" into deliberate ceremonies and bring the generated `.docx` itself up to a confident standard, including a model bump and prompt refinement so we can iterate fast.

What this brief is **not** asking for: a redesign of the field-focus rail (that's the open `ccl-review-wrap-up…` Phase B), a learning loop on top of prompt versions (that's `ccl-prompt-feedback-loop…`), or any new CCL feature surface beyond the upload/send ceremony.

---

## 2. Current state — verified findings

### 2.0 Already shipped — DO NOT redo

- **Silent ND auto-upload removed.** [server/routes/ccl.js](../../server/routes/ccl.js) L1407–L1414 — env flag retained for backwards compat but the branch is a `trackEvent('CCL.NdUpload.Skipped.AwaitingApproval')` no-op. Comment in code: *"CCL_AUTO_UPLOAD_ND is a no-op since 2026-04-24; upload requires solicitor click."*
- **PT score leak gated.** [src/components/modern/CclReviewFieldHeader.tsx](../../src/components/modern/CclReviewFieldHeader.tsx) L86 (`const isFlagged = pressureTest?.flag === true;`), L88 (`const showSafetyNetTag = isFlagged && typeof pressureTest?.score === 'number';`), L116–139 (the chip + context block render gated on `showSafetyNetTag` / `whyParagraph`).
- **Approval action extracted.** [src/components/modern/ccl/useCclReviewApprovalFlow.ts](../../src/components/modern/ccl/useCclReviewApprovalFlow.ts) — full chain `approveCcl` → `uploadToNetDocuments` (silent) → `sendCclToClient` is in a dedicated factory.

### 2.1 Approval flow today — silent ND step inside the chain (Workstream 1)

- File: [src/components/modern/ccl/useCclReviewApprovalFlow.ts](../../src/components/modern/ccl/useCclReviewApprovalFlow.ts) L46–L100.
- One Approve click currently runs three things in series with no further confirmation:
  1. `approveCcl(matterId, 'approved')` (L46) → on success, optimistic `cclMap` patch to `reviewed`.
  2. `uploadToNetDocuments({ matterId, matterDisplayNumber, fields })` (L71) inside a `try { … } catch (ndErr) { console.warn(…) }` — failure is **silent**, only a console warn.
  3. `sendCclToClient({ matterId })` (L81) → guarded internal-only send (Luke + fee earner; client excluded by guard).
- Toast on success says *"Internal copy sent"* (L106). There is no toast and no UI feedback for the ND step at all.
- Approval label on the panel surface ([src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) L121, the approve button block) is the only entry point besides the summary footer ([src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L11805).
- Status taxonomy lives in `src/components/modern/ccl/cclStatus.ts` — current stages relevant here: `reviewed`, `sent` (with `sentChannel: 'internal-guarded'`). There is **no** explicit `nd-uploaded` or `client-sent` stage; ND success is invisible and "sent" conflates internal-guarded with client send.

### 2.2 Word generator + template (Workstream 2A)

- Generator: [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — uses docxtemplater. No baseline regression test exists. No "fidelity rules" applied to incoming JSON (line breaks, smart quotes, list indents).
- Template files in [templates/](../../templates/):
  - `cclTemplate.docx` (live)
  - `cclTemplate.backup.docx` (pre-edit safety copy)
  - `cclTemplate.txt` and `template-text-snapshot.txt` (text snapshots — useful as regression baselines)
  - `DRAFT Client Care Letter (AC Example).docx` and `DRAFT Client Care Letter.docx` (reference originals)
- User-reported behaviour: *"jolting and formatting"* on output. Root cause not yet diagnosed. Suspected: paragraph break conventions (`\n` vs `\r\n` vs paragraph markers), smart-quote drift from the AI, list/indent inconsistencies, header/footer continuation-page differences.
- Header/footer: user explicitly wants to redesign — *"i am going to want to change the header and footer"*.

### 2.3 Model deployment (Workstream 2B)

- File: [server/utils/aiClient.js](../../server/utils/aiClient.js) L21 — `const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.1';`.
- Comment at L10: *"AZURE_OPENAI_DEPLOYMENT – model deployment name (default: gpt-5.1, matching enquiry-processing-v2)"*.
- Model is env-driven; a swap is one Foundry deployment + one env var. No code change required.
- App Insights already records the deployment name on every CCL run ([server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) L1008, L1052, L1064, L1089, L1105, L1116, L1170, L1255, L1384, L1398, L1407).

### 2.4 Prompt source + version pinning (Workstream 2C)

- Generator system prompt: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `SYSTEM_PROMPT` constant near top of file.
- Pressure-test system prompt: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `PRESSURE_TEST_SYSTEM_PROMPT` constant.
- Voice / brand layer: [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js) — pre-pended to CCL prompts (per file header comment, L5–L6).
- Prompt version constant: [server/routes/ccl.js](../../server/routes/ccl.js) — `CCL_PROMPT_VERSION` (also `CCL_TEMPLATE_VERSION`). Persisted on every run via [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) L409–L466 (`SystemPrompt`, `UserPrompt`, `UserPromptLength` columns on `CclContent`).
- Reference docs: [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — the canonical source for "what the prompt does"; needs a "fidelity rules" section after Workstream 2C.

### 2.5 No comparison harness (Workstream 2D)

- There is currently no surface that lets us run the same matter through two `(template_version, prompt_version, model)` triples and compare outputs side-by-side.
- Without it, Workstreams 2A/2B/2C are guesswork — the only way to compare is download two `.docx` files and eyeball them.
- Existing CCL endpoints all write through to live state. We need a "dry-run" route that returns the rendered `.docx` and the structured AI fields without persisting or sending anything.

---

## 3. Plan

Four workstreams, sequenced in §4. Each is independently shippable.

### Workstream 1 (W1) — Upload confirmation as a deliberate ceremony

| # | Change | File | Detail |
|---|--------|------|--------|
| W1.1 | Split the approval flow into discrete stages | [src/components/modern/ccl/useCclReviewApprovalFlow.ts](../../src/components/modern/ccl/useCclReviewApprovalFlow.ts) | Stage 1 (current click): `approveCcl` → status `reviewed` + guarded internal send. Stage 2 (new explicit click): "Upload to NetDocuments" button on success card. Remove the silent `try { upload } catch (warn)` block from stage 1. |
| W1.2 | Add an explicit "Upload to NetDocuments" affordance on the post-approval success card | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) (success-card render around the `cclJustApproved` flow), [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) | Disabled-while-in-flight, success toast on completion (with ND doc id when returned), error toast with retry on failure. |
| W1.3 | Add `nd-uploaded` and `client-sent` to the status taxonomy | `src/components/modern/ccl/cclStatus.ts` | Today the chain collapses ND-upload-success and internal-guarded-send into the existing `sent` state with `sentChannel: 'internal-guarded'`. Promote ND upload to its own stage so the funnel is visible. Keep the existing `sent` semantics for internal-guarded; add `client-sent` as the explicit terminal once the day-N "Send to client" guard is lifted. |
| W1.4 | Telemetry | [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js), [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) | Emit `CCL.Approval.Stage1.Completed`, `CCL.NdUpload.Manual.{Started,Completed,Failed}`, `CCL.ClientSend.{Confirmed,Sent,Failed}`. |
| W1.5 | Changelog entry + INDEX rebuild | [logs/changelog.md](../../logs/changelog.md) | One line per phase. |

**W1 acceptance:**
- Three discrete user clicks for three distinct outcomes (Approve → Upload to ND → Send to client).
- Each click has a before/after toast and a status dot in the rail.
- ND upload failure is visible and retryable (no `console.warn`-only path).
- App Insights records all five new events.

### Workstream 2D — Dry-run comparison harness (build before 2A/2B/2C)

| # | Change | File | Detail |
|---|--------|------|--------|
| 2D.1 | New POST `/api/ccl/dry-run` returning `{ aiFields, docxBase64, model, promptVersion, templateVersion, durationMs }` | NEW route file or extend [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) | Reuses the generator path but writes nothing to `CclContent` and never queues the autopilot chain. Accepts `{ matterId, overrides: { promptVersion?, templateVersion?, model? } }`. |
| 2D.2 | New dev-only diff page rendering side-by-side preview | NEW `src/tabs/dev/CclDiff.tsx` | Behind `canSeePrivateHubControls()` (LZ + AC). Two columns: each is a triple `(template, prompt, model)`. Click "Run" on each column → shows AI fields, raw text diff, downloadable docx. |
| 2D.3 | Wire into resources/dev surface | route registration | Register the page in the dev-tools sidebar; do not surface to non-dev users. |

**2D acceptance:**
- Picking any matter, any two triples, runs both in parallel and renders the two outputs without writing to prod state.
- Embedded preview or single-click download of each `.docx`.
- AI field diff column highlights deltas.

### Workstream 2B — Model upgrade (gpt-5.1 → latest via Foundry)

| # | Change | File | Detail |
|---|--------|------|--------|
| 2B.1 | Identify the latest GA model in the Foundry workspace | (Azure Foundry portal) | Mirror the deployment naming convention used by `enquiry-processing-v2`. |
| 2B.2 | Provision new deployment in the Azure OpenAI resource | (Azure portal / azd) | Same resource so existing key/endpoint work. |
| 2B.3 | Set `AZURE_OPENAI_DEPLOYMENT` in **staging** env | [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1) or App Service env settings | Staging-only first. |
| 2B.4 | Run a fixed test set of 10 representative matters via Workstream 2D | (operator) | Compare `CclPressureTest` scores side-by-side with gpt-5.1. |
| 2B.5 | Promote to prod **or** explicit hold | env settings + [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) | If improvements/parity → promote. If regression → hold and record why. |

**2B acceptance:**
- One-line note in `docs/CCL_PROMPT_ENGINEERING.md` recording which model is live and the comparison summary that drove the call.
- App Insights `model` property on `CCL.AutoFill.Completed` reflects the new deployment.
- Rollback is one env var flip.

### Workstream 2C — Prompt refinement

| # | Change | File | Detail |
|---|--------|------|--------|
| 2C.1 | Cold-read `SYSTEM_PROMPT` and `PRESSURE_TEST_SYSTEM_PROMPT` against the current field schema | [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) | Identify any fields that exist in schema but are not described in the prompt (= AI guesses). |
| 2C.2 | Add a "fidelity rules" block to the generator prompt | [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) `SYSTEM_PROMPT` | Paragraph-break convention (single `\n` per paragraph, no `\r\n`, no smart quotes, no em-dashes inside numeric/cost fields, list-bullet convention, currency formatting). |
| 2C.3 | Refresh the Helix voice block if needed | [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js) | Only if the cold-read surfaces drift. |
| 2C.4 | Bump `CCL_PROMPT_VERSION` | [server/routes/ccl.js](../../server/routes/ccl.js) | The version is already persisted to `CclContent`; the bump is the audit trail. |
| 2C.5 | Re-run the test set via 2D | (operator) | Score deltas. |
| 2C.6 | Append a "Fidelity rules" section + delta-report to the engineering doc | [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) | Capture what changed and why. |

**2C acceptance:**
- New `CCL_PROMPT_VERSION` reflected on the `CclContent` row of every fresh run.
- PT score average for the 10-matter test set ≥ baseline.
- `docs/CCL_PROMPT_ENGINEERING.md` updated.

### Workstream 2A — docx fidelity (template + generator)

| # | Change | File | Detail |
|---|--------|------|--------|
| 2A.1 | Audit current `cclTemplate.docx` headers/footers | [templates/cclTemplate.docx](../../templates/cclTemplate.docx) | Letterhead, page number format, SRA reg footer placement, first-page vs continuation-page header difference. Capture text-form snapshot diff in `template-text-snapshot.txt` as the regression baseline. |
| 2A.2 | Redesign header + footer in Word | `templates/cclTemplate.docx` | New letterhead + footer per the firm brand. Keep the docxtemplater placeholder names unchanged so the generator does not need updating. |
| 2A.3 | Audit docxtemplater paragraph/list/line-break behaviour | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) | Determine what produces the "jolting" — likely `\n` vs `\r\n` mismatches between the AI output and the template's expected break style. |
| 2A.4 | Pre-clean AI-supplied values before docxtemplater render | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) | Normalise: smart quotes → straight, `\r\n` → `\n`, trailing whitespace, double blank lines → single, optional list-marker normalisation. |
| 2A.5 | Run new template through 2D harness | (operator) | Visual + text diff against pre-change baseline. |
| 2A.6 | Bump `CCL_TEMPLATE_VERSION` | [server/routes/ccl.js](../../server/routes/ccl.js) | Audit trail on `CclContent`. |

**2A acceptance:**
- Generated docx matches the new firm letterhead, no jolting on continuation pages, lists indented correctly.
- `template-text-snapshot.txt` regenerated and committed as the new baseline.
- `CCL_TEMPLATE_VERSION` bumped.

---

## 4. Step-by-step execution order

1. **W1.1–W1.5** — Upload confirmation. Smallest deposit, removes the last silent step. Half a day.
2. **2D.1–2D.3** — Dry-run harness. Without it, 2A/2B/2C are guesswork. ~half a day.
3. **2B.1–2B.5** — Model swap on staging, validate via 2D, promote. ~hour of agent work + waiting on Foundry provision.
4. **2C.1–2C.6 in parallel with 2A.1–2A.6** — Prompt and template iterate together via the harness. The harness is the loop.
5. Update [docs/notes/INDEX.md](INDEX.md) on each phase via `node tools/stash-status.mjs`.
6. When the brief is fully delivered, run `node tools/stash-close.mjs ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh`.

---

## 5. Verification checklist

**Workstream 1:**
- [ ] Approve click no longer triggers ND upload. Status moves to `reviewed`.
- [ ] "Upload to NetDocuments" button appears on the success card and is the only path to ND.
- [ ] ND failure surfaces a retryable error toast (not a console warn).
- [ ] App Insights events: `CCL.Approval.Stage1.Completed`, `CCL.NdUpload.Manual.{Started,Completed,Failed}`, `CCL.ClientSend.{Confirmed,Sent,Failed}`.
- [ ] SQL spot check: `SELECT TOP 5 Status, Stage, SentChannel, FinalizedAt FROM Instructions..CclContent ORDER BY FinalizedAt DESC` shows the new `nd-uploaded` / `client-sent` stages flowing through.

**Workstream 2D:**
- [ ] `POST /api/ccl/dry-run` returns `{ aiFields, docxBase64, model, promptVersion, templateVersion }` without writing any rows.
- [ ] `src/tabs/dev/CclDiff.tsx` renders only for `canSeePrivateHubControls()` users.
- [ ] Two-column compare runs successfully on at least 3 matters.

**Workstream 2B:**
- [ ] `AZURE_OPENAI_DEPLOYMENT` set on staging to the new model name.
- [ ] App Insights `model` property reflects the new deployment.
- [ ] 10-matter test set PT scores recorded in the engineering doc.

**Workstream 2C:**
- [ ] `CCL_PROMPT_VERSION` bumped.
- [ ] `CclContent.PromptVersion` shows the new value on fresh runs.
- [ ] `docs/CCL_PROMPT_ENGINEERING.md` has a "Fidelity rules" section.

**Workstream 2A:**
- [ ] `templates/cclTemplate.docx` reflects the new header + footer.
- [ ] `template-text-snapshot.txt` regenerated.
- [ ] `CCL_TEMPLATE_VERSION` bumped.
- [ ] No "jolting" / formatting drift on a re-rendered known-good matter.

---

## 6. Open decisions (defaults proposed)

1. **Internal-guarded send keeps current Approve click semantics?** Default: **yes**. Rationale: stage 1 = "approved + internal copy" is a single fee-earner action; ND upload and client send are the new explicit second/third clicks. If the user wants stage 1 to *only* approve (no internal send), it is a one-line change.
2. **`client-sent` ceremony scope.** Default: **add the status + telemetry now, but keep the actual client-send button gated behind a future feature flag** (since the firm-wide guard excluding the client is still in place). Rationale: status taxonomy lands cleanly without enabling external email yet.
3. **Model swap — which target?** Default: **whatever is current GA in the Foundry workspace** (likely gpt-5.2 or gpt-6 family at the time of execution). Rationale: stay GA, not preview, for a production legal letter.
4. **Diff harness location.** Default: **new dev-only tab `src/tabs/dev/CclDiff.tsx`** behind `canSeePrivateHubControls`. Rationale: keeps it out of the operator surface and gives us a place to grow other CCL tooling.
5. **Prompt fidelity rules — placement.** Default: **append to existing `SYSTEM_PROMPT`** rather than create a separate prompt file. Rationale: the prompt is small enough; one source of truth is easier to evolve.

---

## 7. Out of scope

- Field-focus rail IA redesign (covered by the open `ccl-review-wrap-up…` Phase B).
- The CCL prompt-feedback learning loop / `CclFieldEdits` table (covered by `ccl-prompt-feedback-loop-self-driving-template-improvement`).
- Docs-transfer-to-matter Home ToDo surface (covered by `docs-transfer-review-ccl-review-fixes` Phase B).
- Any change to the `CclContent` schema beyond what's already there.
- Any change to `cclAiService.ts` route contracts (`approveCcl`, `uploadToNetDocuments`, `sendCclToClient`) — stage decoupling happens in the calling code.
- Lifting the firm-wide guard that excludes the client from automated send (separate brief).

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/ccl/useCclReviewApprovalFlow.ts](../../src/components/modern/ccl/useCclReviewApprovalFlow.ts) — approval ceremony controller (W1.1, W1.2)
- `src/components/modern/ccl/cclStatus.ts` — status taxonomy (W1.3)
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — success card surface, summary footer button (W1.2)
- [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) — approve button block (W1.2)
- `src/tabs/dev/CclDiff.tsx` (NEW) — dry-run comparison harness (2D.2)

Server:
- [server/routes/ccl.js](../../server/routes/ccl.js) — `CCL_PROMPT_VERSION`, `CCL_TEMPLATE_VERSION` (2A.6, 2C.4)
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `SYSTEM_PROMPT`, `PRESSURE_TEST_SYSTEM_PROMPT` (2C.1, 2C.2); dry-run route candidate (2D.1)
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — `markCclUploaded`, telemetry (W1.4)
- [server/utils/aiClient.js](../../server/utils/aiClient.js) L21 — `DEPLOYMENT` (2B reference only; no code change)
- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) — generator + new pre-clean step (2A.3, 2A.4)
- [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) — `CclContent` writer (reference only)
- [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js) — voice layer (2C.3)

Templates / docs:
- [templates/cclTemplate.docx](../../templates/cclTemplate.docx) — live template (2A.1, 2A.2)
- [templates/cclTemplate.backup.docx](../../templates/cclTemplate.backup.docx) — pre-edit safety copy
- `templates/template-text-snapshot.txt` — regression baseline (2A.1, 2A.5)
- [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — engineering reference (2B.5, 2C.6)
- [logs/changelog.md](../../logs/changelog.md) — entry per workstream

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
verified: 2026-04-27
branch: main
touches:
  client:
    - src/components/modern/ccl/useCclReviewApprovalFlow.ts
    - src/components/modern/ccl/cclStatus.ts
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/CclReviewDecisionPanel.tsx
    - src/tabs/dev/CclDiff.tsx
  server:
    - server/routes/ccl.js
    - server/routes/ccl-ai.js
    - server/routes/ccl-ops.js
    - server/utils/aiClient.js
    - server/utils/wordGenerator.js
    - server/prompts/helixVoice.js
    - templates/cclTemplate.docx
    - templates/cclTemplate.txt
    - templates/template-text-snapshot.txt
    - docs/CCL_PROMPT_ENGINEERING.md
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - clio-token-refresh-architecture-audit
  - clio-token-refresh-shared-primitive
  - clio-webhook-reconciliation-and-selective-rollout
  - database-index-and-dual-db-audit
  - forms-ia-ld-undertaking-complaint-flow
  - forms-stream-persistence
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - realtime-delta-merge-upgrade
  - realtime-multi-replica-safety
  - session-probing-activity-tab-visibility-and-persistence
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - call-centre-external-attendance-note-and-clio-mirror
  - demo-mode-hardening-production-presentable-end-to-end
  - home-skeletons-aligned-cascade
  - home-todo-single-pickup-surface
  - operationsdashboard-carve-up-by-section
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - server-mail-send-helper-extraction
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
conflicts_with:
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-action-extraction
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - docs-transfer-review-ccl-review-fixes
```

---

## 9. Notes for the picking-up agent

- The three "blockers" listed in the previous CCL audit (silent ND, PT score leak, action extraction) **were already shipped** by the time this brief was written — see §2.0. Do not re-do them. If file references in §2.0 no longer compile, the codebase has drifted and §2 needs re-verifying before W1 begins.
- W1 is intentionally first because it's the smallest deposit *and* it removes the only remaining silent step in the chain. After W1, the operator-facing CCL surface is honest: every state transition is a click with a toast.
- 2D (the harness) **must** be built before 2A/2B/2C. Do not "save time" by skipping it — without side-by-side comparison, the prompt + template + model work is folklore.
- The CCL conflicts in metadata above (especially `ccl-review-wrap-up…` and `ccl-prompt-feedback-loop…`) overlap on the same files. If those briefs are picked up first, re-verify W1's file refs and the prompt-version constants before starting.
- When this brief ships, close it via `node tools/stash-close.mjs ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh`, then add a single changelog entry under the title "CCL first wrap shipped" listing all workstreams completed.
