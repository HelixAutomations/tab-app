# CCL Legal Document Production Hardening

> **Purpose of this document.** This is a self-contained brief for the CCL document production hardening pass. It locks the scope agreed on 2026-05-11 so the work does not dilute into generic CCL refactoring.
>
> **How to use it.** Read the whole document once. Ship Phase A first. Phase B and Phase C should be picked up only after A is verified. Add a [logs/changelog.md](../../logs/changelog.md) entry per shipped phase.
>
> **Verified:** 2026-05-11 against branch `main`. If reading this more than 30 days later, re-verify file references before executing.

---

## 1. Why this exists (user intent)

The user wants confidence that a generated Client Care Letter is a formal legal artefact, not just a successful AI response. The key concern is defensibility: if the document is later inspected by a client, court, opponent, regulator, or another person looking for weakness, Helix should be able to show that the produced DOCX had sane structure, metadata, formatting, and no hidden prompt or placeholder leakage.

User wording: "where this will be used possibly by people in court etc i want to sit here confident that the document has been produced in a quality way, with the right meta data and underlying structure if someone was to take an interest in all this in efforts to hurt us."

This is not a request to rewrite the legal wording wholesale. Keep legal content stable unless a verified placeholder, formatting, or production-quality issue requires a small correction.

---

## 2. Current State: Verified Findings

### 2.1 Staging CCL run is broken by runtime template loading

- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) loads the canonical CCL template by reading `src/tabs/instructions/templates/cclTemplate.ts` from `process.cwd()`.
- Staging App Insights for failed `POST /api/ccl/service/run` requests on 2026-05-11 showed `ENOENT: no such file or directory, open 'C:\home\site\wwwroot\src\tabs\instructions\templates\cclTemplate.ts'`.
- [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1) and [build-and-deploy.ps1](../../build-and-deploy.ps1) copy built frontend assets, server files, prompts, data, CCL schema, signature images, and changelog, but do not copy the CCL template source file that `wordGenerator` currently reads at runtime.

### 2.2 Generated DOCX is controlled by code, not the checked-in DOCX template

- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) creates a `docx` `Document` in code, sets light metadata (`creator`, `title`, `description`), builds header tables, parses plain text into headings and bullet paragraphs, builds the action table, then writes the Packer output.
- [templates/cclTemplate.docx](../../templates/cclTemplate.docx) exists, but the current CCL route uses `generateWordFromJson()` from [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js), so the checked-in DOCX template is not the source of the generated output.
- The current generator configures a first-page footer only. It does not currently assert page footer behaviour for following pages, page break policy, heading keep rules, comments, tracked changes, hidden text, or full core metadata.

### 2.3 Source template variants are not identical

- [src/tabs/instructions/templates/cclTemplate.ts](../../src/tabs/instructions/templates/cclTemplate.ts) exports `DEFAULT_CCL_TEMPLATE` as a TypeScript template string.
- [templates/cclTemplate.txt](../../templates/cclTemplate.txt) exists, but a read-only comparison on 2026-05-11 showed it is not identical to the TypeScript source (`txtLength=16391`, `tsLength=14966`, `equal=False`). Do not silently switch runtime source to the txt file without reviewing wording differences.

### 2.4 Prospect document counts has a demo-id guard bug

- [server/routes/prospect-documents.js](../../server/routes/prospect-documents.js) accepts `POST /counts` with `enquiryIds` and maps those IDs through `Deals.ProspectId`.
- Staging App Insights showed intermittent 500s where the batch included `DEMO-ENQ-0003`, causing SQL conversion failure from nvarchar to int. The route should initialise non-database IDs to zero and exclude them from the SQL lookup.

### 2.5 Nearby CCL ops work to preserve

- Another agent shipped `POST /api/todo/stream` plus `hubTodoLog` broadcasts and CCL card reconciliation blocks in [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js). Preserve all `reconcileAllByRef({ kind: 'review-ccl', ... })` blocks in upload-nd, upload-clio, mark-sent, and send-to-client.
- Preserve the send-to-client email opening paragraph: `This client care letter has been approved internally. Please now open the matter in NetDocuments, finalise the document, and send it to the client.`
- In [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx), the CCL review version-history strip is intentionally gated to LZ and AC only. This pass should not widen it.

---

## 3. Plan

### Phase A: Staging unblock and low-risk guards

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Make runtime template available in deploy packages | [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1), [build-and-deploy.ps1](../../build-and-deploy.ps1) | Copy `src/tabs/instructions/templates/cclTemplate.ts` into the deployed `src/tabs/instructions/templates` path expected by [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js). This keeps current wording stable while unblocking staging. |
| A2 | Guard demo and non-numeric enquiry IDs | [server/routes/prospect-documents.js](../../server/routes/prospect-documents.js) | Initialise all requested ids to `0`, send only numeric database IDs into the `Deals.ProspectId` SQL lookup, and return zeros if there are no SQL-eligible IDs. |
| A3 | Add changelog | [logs/changelog.md](../../logs/changelog.md) | Log the staging CCL unblock and document-count guard. |

**Phase A acceptance:**

- Staging deploy package includes `src/tabs/instructions/templates/cclTemplate.ts` under the deployed root.
- `POST /api/ccl/service/run` no longer fails with `ENOENT` for the CCL template.
- `POST /api/prospect-documents/counts` returns `0` for demo IDs rather than 500ing the full batch.
- No changes are made to [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) reconcile blocks or send-to-client opening paragraph.

### Phase B: Legal-grade DOCX production QA

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Add post-generation DOCX QA helper | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) or a new adjacent utility | Validate generated DOCX zip parts for no unresolved placeholders, no prompt/provenance leakage, no comments, no tracked changes, no hidden text runs, expected core properties, and readable document XML. |
| B2 | Return and persist QA metadata | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js), [server/routes/ccl.js](../../server/routes/ccl.js) | Include QA status in generation metadata returned from `generateWordFromJson()`. Persist operational QA facts in DB/provenance, not as visible or hidden DOCX content. |
| B3 | Emit telemetry | [server/routes/ccl.js](../../server/routes/ccl.js) | Track `CCL.DocumentQa.Completed` and `CCL.DocumentQa.Failed` with matter id, unresolved count, blocked reason, and duration. |

**Phase B acceptance:**

- A malformed generated DOCX fails closed before upload or response success.
- QA errors are visible in App Insights and do not leak sensitive content.
- The client-facing DOCX contains legal content only, not AI prompts, provenance JSON, internal trace ids, or audit notes.

### Phase C: Formatting and structure hardening

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Replace brittle body split | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) | Stop using `resolvedText.indexOf('Thank you for your instructions')` as the body boundary. Use explicit template regions or structured assembly. |
| C2 | Improve Word pagination rules | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) | Add heading keep-with-next, avoid orphaned headings, stabilise action table row splitting, and define footer behaviour across pages. |
| C3 | Set defensible core properties | [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) | Add subject/category/company/lastModifiedBy style metadata where supported by `docx`, without embedding internal prompts or client-sensitive audit detail. |
| C4 | Generate and inspect sample | Local generated output only | Produce a sample DOCX, unzip package parts, inspect `docProps` and `word/document.xml`, and visually review in Word or LibreOffice if available. |

**Phase C acceptance:**

- Sample has professional visible layout, footer behaviour across pages, stable section headings, and no odd table/page breaks in the action section.
- DOCX package inspection confirms metadata is deliberate and no hidden internal material is present.

---

## 4. Step-by-Step Execution Order

1. Re-check `git status --short` and preserve any unrelated user changes.
2. Verify the four CCL ops reconcile blocks and send-to-client opening paragraph are present before editing any adjacent CCL code.
3. Ship Phase A only: deploy package copy plus prospect-document demo-id guard plus changelog.
4. Run targeted local checks for deploy-copy paths and the prospect-document ID filter behaviour.
5. Run `node tools/stash-precheck.mjs --draft docs/notes/CCL_LEGAL_DOCUMENT_PRODUCTION_HARDENING.md`, then `node tools/stash-status.mjs`.
6. Only after Phase A is clean, implement Phase B QA helper and telemetry.
7. Only after QA is clean, implement Phase C pagination and metadata improvements.
8. Generate a local sample DOCX and inspect package structure before any staging deploy.

---

## 5. Verification Checklist

**Phase A:**

- [ ] Deploy package script creates or copies `src/tabs/instructions/templates/cclTemplate.ts`.
- [ ] Non-numeric enquiry IDs do not enter the SQL `Deals.ProspectId` query.
- [ ] Existing numeric enquiry IDs still return counts.
- [ ] Changelog entry added.

**Phase B:**

- [ ] DOCX QA catches unresolved placeholders.
- [ ] DOCX QA checks `docProps/core.xml`, `word/document.xml`, comments, tracked changes, hidden text, and internal prompt/provenance leakage.
- [ ] App Insights events: `CCL.DocumentQa.Completed` and `CCL.DocumentQa.Failed` are emitted.

**Phase C:**

- [ ] Headings keep with their following paragraph where supported.
- [ ] First and following page footers are intentional.
- [ ] Action table rows stay readable across page breaks.
- [ ] Generated sample visually passes review.
- [ ] Generated sample package inspection passes.

---

## 6. Open Decisions (Defaults Proposed)

1. **Runtime template source after Phase A**: Default: keep the existing TypeScript source path copied into deploy packages for the unblock. Rationale: avoids unreviewed wording drift from [templates/cclTemplate.txt](../../templates/cclTemplate.txt).
2. **Where to store production QA evidence**: Default: DB/provenance and App Insights only, not hidden DOCX content. Rationale: defensible auditability without handing internal prompt traces to external readers.
3. **Whether to move to DOCX-template-first generation**: Default: not in Phase A. Revisit after QA confirms current generated structure gaps. Rationale: smaller staging fix first, then better document architecture with sample comparison.

---

## 7. Out of Scope

- Rewriting solicitor-approved legal wording wholesale.
- Changing CCL ops card reconciliation or Home realtime SSE behaviour.
- Deploying production.
- Adding raw AI prompts, hidden comments, or internal trace data into the client-facing DOCX.
- Widening dev-only CCL version-history UI beyond LZ and AC.

---

## 8. File Index (single source of truth)

Client:

- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) - nearby CCL review UI guard to preserve if encountered.

Server:

- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) - generated DOCX layout, metadata, footer, body parsing, and future QA hook.
- [server/utils/cclDocumentQa.js](../../server/utils/cclDocumentQa.js) - generated DOCX package inspection, QA telemetry, and fail-closed QA errors.
- [server/routes/ccl.js](../../server/routes/ccl.js) - CCL service run, persistence, generation metadata, and telemetry integration.
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) - nearby upload/send routes with reconcile blocks to preserve.
- [server/routes/prospect-documents.js](../../server/routes/prospect-documents.js) - document-count route requiring demo-id guard.

Scripts / docs:

- [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1) - staging package contents.
- [build-and-deploy.ps1](../../build-and-deploy.ps1) - production package contents, same package fix after staging.
- [src/tabs/instructions/templates/cclTemplate.ts](../../src/tabs/instructions/templates/cclTemplate.ts) - current canonical CCL template read by server runtime.
- [templates/cclTemplate.txt](../../templates/cclTemplate.txt) - alternate template text, not currently identical to canonical TypeScript source.
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped phase.

### Stash metadata (REQUIRED, used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-legal-document-production-hardening
verified: 2026-05-11
branch: main
touches:
  client: []
  server:
    - server/utils/wordGenerator.js
    - server/utils/cclDocumentQa.js
    - server/routes/ccl.js
    - server/routes/prospect-documents.js
    - build-and-deploy-staging.ps1
    - build-and-deploy.ps1
    - src/tabs/instructions/templates/cclTemplate.ts
    - templates/cclTemplate.txt
    - logs/changelog.md
  submodules: []
depends_on: []
coordinates_with:
  - app-wide-ux-improvement-proof-programme
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - docs-transfer-review-ccl-review-fixes
  - node-22-production-rollout-for-link-hub-v1
  - home-todo-single-pickup-surface
conflicts_with: []
```

---

## 9. Gotchas Appendix

- Do not use [templates/cclTemplate.txt](../../templates/cclTemplate.txt) as a silent replacement for [src/tabs/instructions/templates/cclTemplate.ts](../../src/tabs/instructions/templates/cclTemplate.ts). They differ today.
- [server/utils/wordGenerator.js](../../server/utils/wordGenerator.js) now extracts the body by stripping the leading `Dear...` line and matter heading. If the canonical template opening changes, re-check the generated visible header and first body paragraph together.
- [server/routes/ccl.js](../../server/routes/ccl.js) now runs Word generation and DOCX QA before CCL content/draft persistence. Keep that order so a QA failure fails closed without creating a fresh draft/content record for a document that was not produced.
- Keep AI/provenance facts out of the client-facing DOCX. The audit trail belongs in the DB/App Insights unless the user explicitly asks otherwise.
- If touching [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js), preserve all four `review-ccl` reconcile blocks and the send-to-client opening paragraph noted above.
