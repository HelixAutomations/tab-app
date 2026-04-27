# Risk Assessment and Proof-of-ID Clio upload plus Home To-Do evidence card

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-21 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

Operations has flagged: *"there is no risk assessment on file"*. Today the Risk Assessment is captured in the Instructions DB (`RiskAssessment` table) via the Inline Workbench, but **nothing uploads to Clio when the matter opens**. Proof-of-ID / EID verification has a partial path (PDF persisted to the Instructions DB `Documents` table), but it also does not reach Clio. Both are compliance artefacts Ops needs to see on the Clio matter.

The user asked for three things to land together so the work compounds rather than fragmenting:
1. Close the compliance gap: generate a Risk Assessment document and push both risk + proof-of-ID to Clio as part of matter opening.
2. Add a CTA in the Risk Assessment tab of the Inline Workbench so the user can (re-)generate / (re-)upload on demand.
3. Surface outstanding items on Home via a single To-Do card that takes the user to the same remediation surface. Verbatim: *"a home to do card where items need to be actioned for users to pick up from there too. taking the user to the workbench so we maintain one method or a subtle pop up modal"* — resolved as: a modal that renders the **same React component** as the Workbench tab. One implementation, two mount points.

**What the user is *not* asking for** in this brief:
- No EID orchestration redesign (existing EID trigger stays as-is).
- No full demo-mode hardening (stays in `demo-mode-hardening-production-presentable-end-to-end`). Only the minimum needed to test this flow safely.
- No NetDocuments mirror for risk (CCL already uses NetDocs; risk is Clio + Instructions DB only here).
- No rework of the CCL upload chain — it's the reference pattern; only the shared upload primitive is factored out.
- No InlineWorkbench carve-up (stays in `inline-workbench-carve-up-and-ux-simplification`). New component is placed so it relocates cleanly when that carve-up runs.

---

## 2. Current state — verified findings

### 2.1 Matter opening pipeline (21+ steps)

- File: [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) — master `processingActions[]` array (~L152–L950).
- Step 15 (~L404): `POST /api/clio-contacts` — creates/updates Clio contact.
- Step 18 (~L478): `POST /api/clio-matters` — opens the Clio matter, returns `matter.id` + `matter.display_number`.
- Step 19 (~L537): `POST /api/sync-instruction-client/link-client` — writes Clio matter back to Instructions DB; patches matter request (~L564).
- Step 20 (~L615): Portal space init.
- Step 22 (~L705): `POST /api/ccl/service/run` — CCL doc generation.
- Step 23 (~L756): `POST /api/ccl-ops/upload-nd` / `upload-clio` — **the only doc upload to Clio today**.
- **Gap:** no proof-of-ID upload; no risk-assessment document at all. Anything added should live after step 19 (matter exists in Clio) and be **non-fatal** so matter opening still completes if Clio rejects the upload — a To-Do card must still catch the gap.
- Observer/telemetry: steps emit a `matterTraceId` header on each instrumented fetch for the admin diagnostics observer (~L112–L127).

### 2.2 Clio document upload (reference implementation)

- File: [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — `POST /api/ccl-ops/upload-clio` (~L700–L750).
- 3-step Clio upload: create upload session `POST /api/v4/documents` → chunk upload via presigned URL → confirm `PATCH /api/v4/documents/{docId}`.
- Returns `clioDocumentId` on success.
- Telemetry already present: `CCL.Upload.Clio.Completed|Failed` + `CCL.Upload.ND.Completed|Failed` with `matterId`, `clioMatterId`, `clioDocumentId`, `durationMs`, `fileSizeBytes`.
- **This is the pattern to mirror.** Factor out into a shared helper rather than duplicating.

### 2.3 EID / proof-of-ID flow (partial today)

- File: [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx):
  - `handleTriggerEid()` ~L1564 — calls `onTriggerEID(instructionRef)` (delegated to parent).
  - Auto-refresh via `onRefreshData()` ~L1577.
  - ~2s later, `persistRawRecordPdfRef.current('auto')` ~L1588 — fire-and-forget PDF persistence to Instructions DB `Documents` table (raw-record renderer).
  - `persistRawRecordPdfRef` hook mounted ~L217.
  - `loadVerificationDetails()` ~L1504–L1560 — reads `/api/verification-details/${instructionRef}`.
- **Gap:** the persisted PDF row has no Clio document id; it never leaves the Instructions DB.

### 2.4 Risk Assessment (capture + persistence)

- Client inline edit + compute: [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) ~L2353–L2577.
  - Risk status computed (~L2358–L2377): `riskScore`, `riskComplete`, `isHighRisk`, `isMediumRisk`, `riskLevel`, `riskAssessor`, `sourceOfFunds`, etc.
  - Inline form state (~L2431–L2515): `inlineRiskCore`, `inlineLimitationDate`, checkboxes.
  - `handleInlineRiskSubmit()` (~L2517–L2577) — `POST /api/risk-assessments`.
- Standalone page (used when tab = 'risk'): [src/tabs/instructions/RiskAssessmentPage.tsx](../../src/tabs/instructions/RiskAssessmentPage.tsx) — props `{ onBack, instructionRef, riskAssessor, existingRisk, onSave }`.
- Shared form: [src/components/RiskAssessment.tsx](../../src/components/RiskAssessment.tsx) — 8 `QuestionCard`s + compliance flags + `RiskAssessmentResult` (Low/Medium/High).
- Server route: [server/routes/riskAssessments.js](../../server/routes/riskAssessments.js) — `POST /api/risk-assessments` MERGE upsert; emits `risk.assessed` event.
- Fetcher: [server/routes/instructions.js](../../server/routes/instructions.js) ~L313–L401 attaches `inst.riskAssessments` array (~L387).
- SQL table (Instructions DB): [submodules/instruct-pitch/docs/database-schema.sql](../../submodules/instruct-pitch/docs/database-schema.sql) ~L264–L290:
  - 25 columns, PK `MatterId`, includes 7 risk-factor pairs (`<Factor>` + `<Factor>_Value`), 4 compliance flags, `RiskAssessmentResult`, `RiskScore`, `TransactionRiskLevel`, `ComplianceDate`, `ComplianceExpiry`.
- **Gap:** no PDF generator for risk, no Clio upload, no "generate doc" CTA in the workbench.

### 2.5 Home To-Do infrastructure (built but unplugged)

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — imports `ImmediateActionsBar` (~L73) but does **not** render it yet. `demoModeEnabled`, `useLocalData`, `hideAsanaAndTransactions`, `replacePipelineAndMatters` state already exist.
- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) — surface for actionable cards.
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — `ToDoCard` discriminated union. Today: `'review-ccl'`, `'annual-leave'`, `'snippet-edits'`. `enrichImmediateActions()` enriches DB records into cards.
- [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) — grouped card rendering.
- [src/components/modern/todo/TodoItemExpandedPane.tsx](../../src/components/modern/todo/TodoItemExpandedPane.tsx) — expanded detail pane for a single card.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) ~L740–L760 — already accepts `hidePipelineAndMatters`, `todoSlot`, `todoCount` (Phase A of `home-todo-single-pickup-surface`).
- Deep-link pattern: [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx) ~L171 emits `openHomeCclReview` event; listener [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) ~L4232; App entry [src/app/App.tsx](../../src/app/App.tsx) ~L827.

### 2.6 Overlap scan — stashed briefs that interact with this work

| Stash id | Nature of overlap |
|---|---|
| `home-todo-single-pickup-surface` | **Coordinates.** This brief delivers the first real domain card (`matter-opening-evidence`) into that stash's registry. Card contract extension belongs here; toggle + slot wiring stays there. |
| `inline-workbench-carve-up-and-ux-simplification` | **Coordinates.** New `<MatterOpeningEvidencePanel>` mounts into the Risk tab region (~L2353). When the carve-up ships, relocate under `src/tabs/instructions/workbench/risk/`. Touches the same giant file — merge awareness only; no mutually exclusive regions. |
| `compactmatterwizard-split-by-wizardmode` | **No overlap.** Pipeline lives in `processingActions.ts`, not the wizard. |
| `demo-mode-hardening-production-presentable-end-to-end` | **Coordinates.** This brief consumes the `CLIO_DRY_RUN_FOR_DEMO_REFS` flag defined there and seeds one test instruction; remaining demo work stays in that brief. |
| `ccl-backend-chain-silent-autopilot-service` | **Coordinates.** The refactor of the Clio upload 3-step into a shared helper benefits both. Agree on `server/services/clioDocumentUpload.js` contract with that brief's author before ripping from `ccl-ops.js`. |
| `ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity` | **No direct conflict** — only touches CCL upload indirectly via the shared helper. |
| `call-centre-external-attendance-note-and-clio-mirror` | **Coordinates.** Also needs a Clio write path. Same shared helper applies. |
| `clio-token-refresh-shared-primitive` / `clio-token-refresh-architecture-audit` | **Depends.** New upload helper MUST use the primitive from that stash once it lands. Until then, reuse whatever `ccl-ops.js` uses today and leave a `TODO(clio-token-refresh-shared-primitive)` marker. |
| `forms-ia-ld-undertaking-complaint-flow` / `bespoke-forms-on-mount-readiness-pulse-universal-persistence` | **Coordinates.** Future card kinds (undertaking, complaint) will join the same registry; the pattern set here should make their addition trivial. |

---

## 3. Plan

### Phase A — Shared remediation surface + Clio upload primitive (small, self-contained)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Extract shared Clio upload helper (3-step) | `server/services/clioDocumentUpload.js` **(NEW)** | Inputs `{ clioMatterId, filename, contentType, buffer, category }`. Outputs `{ clioDocumentId, bytesUploaded, durationMs }`. Honours `CLIO_DRY_RUN_FOR_DEMO_REFS` env flag from demo-mode stash. Refactor [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) so existing `POST /api/ccl-ops/upload-clio` calls the helper (zero-behaviour refactor). |
| A2 | New thin upload route | `server/routes/clioDocuments.js` **(NEW)** | `POST /api/clio-documents/upload` wraps A1. Accepts multipart or `{ documentId }` reference to a row in Instructions DB `Documents`. Writes back `ClioDocumentId` onto the `Documents` row. Telemetry: `Clio.Document.Upload.Started|Completed|Failed` with `category`, `matterId`, `clioMatterId`, `documentId`, `durationMs`. |
| A3 | Risk Assessment PDF generator | `server/services/riskAssessmentPdf.js` **(NEW)** | Fetch `RiskAssessment` row + instruction/deal context; render to PDF. **Open decision** at top of file — try to reuse the EID raw-record renderer (`persistRawRecordPdfRef` path in `InlineWorkbench.tsx`) before introducing pdfkit. Telemetry: `Docs.RiskAssessment.Pdf.Generated|Failed` with `instructionRef`, `matterId`, `durationMs`, `bytes`. |
| A4 | Risk PDF endpoints | [server/routes/riskAssessments.js](../../server/routes/riskAssessments.js) | Add `GET /api/risk-assessments/:instructionRef/pdf` (stream) + `POST /api/risk-assessments/:instructionRef/pdf/persist` (writes to Instructions DB `Documents` table, returns `documentId`). Telemetry: `Docs.RiskAssessment.Pdf.Persisted|Failed`. |
| A5 | Shared component | `src/components/matter-evidence/MatterOpeningEvidencePanel.tsx` **(NEW)** | Props `{ instructionRef, matterId?, riskAssessment, eidStatus, documents, onRefresh, variant: 'workbench' \| 'modal' }`. Three status pills + three CTAs: **Generate Risk PDF**, **Upload Risk to Clio**, **Upload Proof-of-ID to Clio**. Uses `helix-panel` / `helix-btn-primary` tokens, dark + light. **One code path, two instances.** |
| A6 | Mount in Workbench Risk tab | [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) ~L2353 | Render `<MatterOpeningEvidencePanel variant="workbench" … />` above the existing inline risk form. Do NOT touch existing form logic or `handleInlineRiskSubmit`. |

**Phase A acceptance:**
- `POST /api/clio-documents/upload` works end-to-end against a sandbox Clio matter (or dry-run flag).
- CCL upload still passes its existing test + manual smoke (zero-behaviour refactor).
- Workbench Risk tab shows the new panel; three CTAs succeed; after success the `Documents` table row has a `ClioDocumentId`.
- No change to matter-opening pipeline yet — this is the surface + primitive only.

### Phase B — Pipeline auto-upload + Home To-Do card

#### B1. Pipeline steps 19a + 19b (non-fatal)

- File: [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) — insert after step 19 (link-client, ~L537), before step 20 (portal init, ~L615).
  - **Step 19a — "Proof-of-ID uploaded to Clio"**: find the most recent EID raw-record `Documents` row for `instructionRef`; call `POST /api/clio-documents/upload` with `{ documentId, category: 'proof-of-id' }`. Non-fatal on failure.
  - **Step 19b — "Risk Assessment generated + uploaded to Clio"**: call `POST /api/risk-assessments/:instructionRef/pdf/persist` then `POST /api/clio-documents/upload` with the new `documentId` and `category: 'risk-assessment'`. Non-fatal on failure.
- Both steps respect the existing `matterTraceId` observer and surface pass/fail in the admin diagnostics stream.
- Emit `Pipeline.Evidence.ProofOfId.Started|Completed|Failed` and `Pipeline.Evidence.RiskAssessment.Started|Completed|Failed` (per `Component.Entity.Lifecycle` naming in [copilot-instructions.md](../../.github/copilot-instructions.md)).

#### B2. Home To-Do card kind `matter-opening-evidence`

- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — extend `ToDoCard` union:
  ```ts
  | {
      kind: 'matter-opening-evidence';
      id: string;                    // e.g. `evidence:${instructionRef}`
      instructionRef: string;
      matterId?: string;
      missing: Array<'risk-complete' | 'risk-clio' | 'poi-clio'>;
      priority: 'high' | 'normal';   // high if matter >24h old and still missing
      createdAt: string;
    }
  ```
- `enrichImmediateActions()` derivation — given the instructions feed + documents per instruction, emit a card when any of:
  - `riskAssessments[0]?.RiskAssessmentResult` missing → `'risk-complete'`
  - risk row exists but no `Documents` row with `Category = 'risk-assessment'` has a `ClioDocumentId` → `'risk-clio'`
  - latest EID `Documents` row has no `ClioDocumentId` → `'poi-clio'`
  - Card suppressed when `missing.length === 0`.
- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) (or the renderer in [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx)) — clicking the card opens a Home-level modal mounting `<MatterOpeningEvidencePanel variant="modal" instructionRef=… matterId=… … />`.
- Modal styling: `borderRadius: 0`, backdrop `rgba(0, 3, 25, 0.6)` with blur, primary button `colours.highlight` — per Helix look and feel rules. Reuse an existing Home modal shell if available; otherwise minimal shell using design tokens. **Do not invent a new component library.**
- Secondary "Open in Workbench" button inside the modal reuses the `openHomeCclReview`-style event pattern but targets Workbench Risk tab. Keeps "one method" intact — the *component* is the one method; modal vs workbench are mount points.
- On success, call `onRefresh()` which re-evaluates enrichment and the card vanishes.

#### B3. Register the new card kind in the `home-todo-single-pickup-surface` stash

- Update [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](./HOME_TODO_SINGLE_PICKUP_SURFACE.md) — add `matter-opening-evidence` to the Phase B registry list with a link back to this brief. Do not mutate its scope beyond that note.

**Phase B acceptance:**
- Matter opening on a demo instruction triggers both 19a + 19b; both emit telemetry; both write `ClioDocumentId` onto the corresponding `Documents` rows (or fake ids under dry-run).
- Home renders the `matter-opening-evidence` card for an instruction with a risk row but no Clio upload.
- Clicking the card opens the modal with the same CTAs as the Workbench; success clears the card.
- Opening the Workbench on the same instruction shows the same panel with matching state — proof that one component serves both.

### Phase C — Demo-mode minimum (parallel with A/B)

- Ensure one demo instruction has a completed `RiskAssessment` row + an EID PDF in `Documents`. Add a one-off idempotent script `scripts/seed-demo-matter-evidence.mjs` if the existing demo data doesn't cover it.
- Confirm `CLIO_DRY_RUN_FOR_DEMO_REFS=1` short-circuits both A2 (upload route) and the new pipeline steps with fake `clioDocumentId` values. Add a unit test covering the flag.
- If the flag is not yet defined by `demo-mode-hardening…` at pickup time, declare it locally with a conservative default (**off** = real calls). Do not expand further.

---

## 4. Step-by-step execution order

1. **A1** — Extract shared Clio upload helper; refactor `ccl-ops.js` to consume it. Run existing tests.
2. **A2** — Add `POST /api/clio-documents/upload` route + telemetry.
3. **A3** — Decide renderer (reuse EID raw-record first). Build `riskAssessmentPdf.js`.
4. **A4** — Add stream + persist endpoints to `riskAssessments.js`.
5. *(parallel with 1–4)* **A5** — Build `MatterOpeningEvidencePanel.tsx` against stub endpoints.
6. **A6** — Mount panel in Workbench Risk tab. Verify.
7. **C (demo-mode minimum)** — Seed + verify dry-run flag short-circuits.
8. **B1** — Insert pipeline steps 19a + 19b in `processingActions.ts`. Run end-to-end dry-run.
9. **B2** — Extend `ImmediateActionModel.ts`, enrichment, modal mount, Home card render.
10. **B3** — Update `home-todo-single-pickup-surface` brief with new card kind.
11. Changelog entries per phase (A, B, C).

---

## 5. Verification checklist

**Phase A:**
- [ ] `node tools/stash-precheck.mjs --draft docs/notes/THIS.md` → exit 0 or 1 (no undeclared conflicts).
- [ ] CCL upload manual smoke still passes (refactor didn't regress).
- [ ] `POST /api/clio-documents/upload` succeeds against a sandbox matter; writes `ClioDocumentId` onto the target `Documents` row.
- [ ] Workbench Risk tab renders `MatterOpeningEvidencePanel` for a seeded instruction; CTAs succeed.
- [ ] App Insights: `Clio.Document.Upload.Completed`, `Docs.RiskAssessment.Pdf.Generated`, `Docs.RiskAssessment.Pdf.Persisted` visible.
- [ ] Unit tests for `clioDocumentUpload.js` (success, mid-flight failure, dry-run) pass.

**Phase B:**
- [ ] Matter opening on a demo instruction completes all 21+ steps; steps 19a + 19b visible in the trace observer.
- [ ] App Insights: `Pipeline.Evidence.ProofOfId.Completed`, `Pipeline.Evidence.RiskAssessment.Completed` visible.
- [ ] Instructions DB spot check:
  ```sql
  SELECT TOP 5 Id, InstructionRef, Category, ClioDocumentId
  FROM Documents
  WHERE Category IN ('risk-assessment','proof-of-id')
  ORDER BY Id DESC;
  ```
- [ ] Home shows `matter-opening-evidence` card for a degraded instruction; modal opens; success removes the card.
- [ ] Workbench + modal render identical state for the same `instructionRef` (same component proof).
- [ ] Failure scenario: break Clio credentials — matter still opens, card appears with correct `missing[]`, modal retries succeed once creds restored.

**Phase C:**
- [ ] With `CLIO_DRY_RUN_FOR_DEMO_REFS=1`, no real Clio traffic; fake `clioDocumentId` returned; dependent rows still written.
- [ ] Without the flag, a real upload happens (sandbox manual test — not prod).

---

## 6. Open decisions (defaults proposed)

1. **PDF renderer for risk assessment** — Default: **reuse the EID raw-record renderer**. Rationale: consistency with EID PDF and no new dependency. Fallback: pdfkit server-side template.
2. **Clio document category taxonomy** — Default: **two dedicated categories** (`risk-assessment`, `proof-of-id`). Rationale: easier Ops triage in Clio vs lumping under "Compliance". Requires one-time confirmation of Clio category ids with Ops (Cass) before first real upload; a generic fallback code path keeps the feature usable if categories aren't configured yet.
3. **Home → remediation surface** — Default: **modal rendering the shared `<MatterOpeningEvidencePanel>`**. Rationale: the user asked for "one method"; the *component* is the method, modal and Workbench are mount points. Secondary "Open in Workbench" button inside the modal preserves deep-link for power users.
4. **Card shape** — Default: **one `matter-opening-evidence` kind with `missing[]`**. Rationale: less Home noise vs three separate card kinds.
5. **Failure escalation** — Default: **visible failure on the card** with retry CTA. Rationale: transparency rule in `.github/copilot-instructions.md` — surface delays/uncertainty. Silent retry only as backoff *under* the visible state.
6. **Clio token refresh** — Default: **reuse whatever `ccl-ops.js` uses today** and leave `TODO(clio-token-refresh-shared-primitive)` markers. Rationale: that stash isn't shipped; don't block on it.

---

## 7. Out of scope

- EID orchestration redesign (button behaviour, re-run semantics, retry ladders).
- NetDocuments mirror for risk assessment.
- CCL flow changes beyond extracting the shared Clio upload helper.
- Inline Workbench carve-up (separate brief — just mount cleanly so relocate is trivial).
- CompactMatterWizard changes.
- Full demo-mode hardening.
- Risk score recomputation, new risk factors, new compliance flags.
- New Clio custom-field writes (uploading documents, not writing matter custom fields).
- Retry scheduling / background worker for failed uploads (card-driven manual retry is sufficient for v1).

---

## 8. File index (single source of truth)

**Client:**
- `src/components/matter-evidence/MatterOpeningEvidencePanel.tsx` (NEW) — shared remediation surface (workbench + modal variants).
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) — mount panel in Risk tab ~L2353.
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — new `matter-opening-evidence` card kind + enrichment.
- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) — render new card + open modal.
- [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) — card grouping pass-through.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — ensure `ImmediateActionsBar` is rendered (coordinate with `home-todo-single-pickup-surface` Phase A).
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) — insert steps 19a + 19b after ~L537.
- [src/components/modern/todo/TodoItemExpandedPane.tsx](../../src/components/modern/todo/TodoItemExpandedPane.tsx) — may host the modal content; confirm during implementation.

**Server:**
- `server/services/clioDocumentUpload.js` (NEW) — 3-step Clio upload primitive extracted from `ccl-ops.js`.
- `server/services/riskAssessmentPdf.js` (NEW) — PDF generator.
- `server/routes/clioDocuments.js` (NEW) — `POST /api/clio-documents/upload`.
- [server/routes/riskAssessments.js](../../server/routes/riskAssessments.js) — add PDF stream + persist endpoints.
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — refactor to consume extracted helper; no behaviour change.

**Scripts / docs:**
- `scripts/seed-demo-matter-evidence.mjs` (NEW, idempotent) — ensures one demo instruction has a complete risk row + EID PDF.
- [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](./HOME_TODO_SINGLE_PICKUP_SURFACE.md) — append `matter-opening-evidence` to Phase B registry.
- [docs/notes/INLINE_WORKBENCH_CARVE_UP_AND_UX_SIMPLIFICATION.md](./INLINE_WORKBENCH_CARVE_UP_AND_UX_SIMPLIFICATION.md) — note new mount point at ~L2353 so relocate includes it.
- [docs/notes/DEMO_MODE_HARDENING_PRODUCTION_PRESENTABLE_END_TO_END.md](./DEMO_MODE_HARDENING_PRODUCTION_PRESENTABLE_END_TO_END.md) — note that this brief consumes `CLIO_DRY_RUN_FOR_DEMO_REFS`.
- [docs/notes/CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md](./CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md) — note the new shared helper; that brief should consume it.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
verified: 2026-04-21
branch: main
touches:
  client:
    - src/components/matter-evidence/MatterOpeningEvidencePanel.tsx
    - src/tabs/instructions/InlineWorkbench.tsx
    - src/tabs/instructions/MatterOpening/processingActions.ts
    - src/tabs/home/ImmediateActionModel.ts
    - src/tabs/home/ImmediateActionsBar.tsx
    - src/tabs/home/ActionSection.tsx
    - src/tabs/home/Home.tsx
    - src/components/modern/todo/TodoItemExpandedPane.tsx
  server:
    - server/services/clioDocumentUpload.js
    - server/services/riskAssessmentPdf.js
    - server/routes/clioDocuments.js
    - server/routes/riskAssessments.js
    - server/routes/ccl-ops.js
  submodules: []
depends_on:
  - clio-token-refresh-shared-primitive
coordinates_with:
  - home-todo-single-pickup-surface
  - inline-workbench-carve-up-and-ux-simplification
  - demo-mode-hardening-production-presentable-end-to-end
  - call-centre-external-attendance-note-and-clio-mirror
  - forms-ia-ld-undertaking-complaint-flow
  - ccl-prompt-feedback-loop-self-driving-template-improvement  # shared file: server/routes/ccl-ops.js (extract helper impacts both)
  - home-animation-order-and-demo-insert-fidelity               # shared file: src/tabs/home/Home.tsx (Home render order sensitive)
  - realtime-delta-merge-upgrade                                # shared file: src/tabs/home/Home.tsx
  - ui-responsiveness-hover-scroll-and-tab-navigation           # shared file: src/tabs/home/Home.tsx
conflicts_with: []
```

---

## 9. Gotchas appendix

- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) is ~10,300 lines. Keep the new mount to a single JSX block + a few props so when `inline-workbench-carve-up-and-ux-simplification` runs, the move is mechanical. Don't intermix new state into existing state bags.
- `persistRawRecordPdfRef.current('auto')` (~L1588) is fire-and-forget and runs ~2s after EID trigger. Do **not** synchronously await it from the Clio upload path — read the persisted row from `Documents` instead, with short retry/backoff if not yet written.
- Matter-opening steps use a `matterTraceId` header pattern (~L112–L127 in `processingActions.ts`). New steps MUST emit that header or the admin diagnostics observer will silently drop them.
- `RiskAssessment` table PK is `MatterId`, but risk is often captured **before** the Clio matter exists. Check for `InstructionRef` in addition when selecting the row (existing code at `server/routes/instructions.js` ~L387 already does this).
- Clio upload step 2 uses a presigned URL that can expire. Existing CCL code handles this; preserve the retry when extracting.
- `CLIO_DRY_RUN_FOR_DEMO_REFS` is declared by the `demo-mode-hardening…` stash but may not yet be implemented when this brief is picked up. If absent, default the dry-run gate to **off** (real calls) and add the flag here — small enough without expanding that brief's scope.
- Home modal styling: the user has strong opinions on Helix look and feel (see `.github/copilot-instructions.md` "Helix look and feel" section). Reference: `UserBubble.tsx`. `borderRadius: 0`, neutral body text greys, `colours.highlight` primary button. No Tailwind defaults, no Material, no off-palette hex.
- Existing `enrichImmediateActions()` may require changes to its input shape to receive documents + risk status per instruction. If the instructions payload doesn't already include this, extend it server-side in [server/routes/instructions.js](../../server/routes/instructions.js) ~L313–L401 rather than firing a second round-trip from Home — Home boot is already latency-sensitive (see `home-skeletons-aligned-cascade`, `home-animation-order-and-demo-insert-fidelity`).
- Telemetry naming: `Component.Entity.Lifecycle` per [copilot-instructions.md](../../.github/copilot-instructions.md) — `Clio.Document.Upload.*`, `Docs.RiskAssessment.Pdf.*`, `Pipeline.Evidence.*`. Use `trackException` AND `trackEvent` on the failure path (both required).
- `handleInlineRiskSubmit()` (~L2517) still saves the risk record to SQL — the new panel must **not** duplicate this. Panel CTAs are generate-PDF / upload-PDF only. Data capture stays in the existing form.
- Non-fatal pipeline behaviour: steps 19a/19b must return success to the pipeline runner even on upload failure, but record the failure so the Home card picks up the gap. This prevents matter-opening from blocking on Clio outages.
