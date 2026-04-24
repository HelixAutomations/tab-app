# Docs transfer review + CCL review fixes

> **Purpose.** Self-contained brief to ship two paired changes:
>
> 1. A new **"Transfer documents to matter"** Home ToDo surface that lets a solicitor approve moving enquiry / pitch / instruction-stage documents into the NetDocuments *Documents → Client* folder for a newly-opened matter.
> 2. A **pair of CCL review fixes** — the intro-skip on pickup (already shipped this session — verify + keep) + make the ND upload explicitly solicitor-approved rather than silent-chain.
>
> **Hard constraint from user:** *"dont action the auto transfer right now, lets gate it behind users decision so that nothing goes to the nd matter without the solicitor knowing."* → No background ND writes for either CCL or docs-transfer. Every upload must go through an explicit approval click.
>
> **How to use.** Read once. Ship Phase A (CCL review lockdown). Then Phase B (docs transfer scaffold → todo → modal → approve endpoint). Log each phase in `logs/changelog.md`.
>
> **Verified:** 2026-04-24 against branch `main`. Re-verify file/line refs if picked up >30 days later.

---

## 1. Why this exists (user intent)

User verbatim: *"for the allocate documents option, this will also happen automatically where documents will be moved to ND and uploaded into documents > client folder but atm the allocate documents doesnt have a ui for this for when this doesn't trigger automatically and the user needs to approve the transfer. infact this might be the case when we get instructions because the matter opening needs to happen first before we can transfer the documents. so this needs to be an option after matter opening like the ccl but also picked up from the home to do surface where it doesnt get picked up in the main way."*

And: *"dont action the auto transfer right now, lets gate it behind users decision so that nothing goes to the nd matter without the solicitor knowing."*

The existing "Allocate Documents" immediate-action only surfaces **enquiry-stage** holding docs (blob scan) and links to the enquiry workspace. It does not talk to NetDocuments at all. The new surface is distinct: it fires **after matter opening**, lists the enquiry/pitch/instruction-stage documents that still need to land in the matter's ND `Documents > Client` folder, and does nothing until the solicitor approves.

The CCL side exists because today `CCL_AUTO_UPLOAD_ND=1` can silently push a draft CCL into ND on the background autopilot chain ([server/routes/ccl.js L1154](server/routes/ccl.js#L1154)). Under the new constraint this must become opt-in via the Review CCL modal only.

---

## 2. Current state — verified findings

### 2.1 Existing "Allocate Documents" (enquiry-stage only, no ND)

- Server source: [server/routes/doc-workspace.js](server/routes/doc-workspace.js) L644–742 — `GET /pending-actions` scans blob container `enquiries/{id}/{passcode}/Holding/*` and returns `{ enquiryId, passcode, holdingCount, actionType: 'allocate_documents' }`. 3-minute in-memory cache (L652, `PENDING_ACTIONS_TTL_MS = 180_000`).
- Client consumer: [src/tabs/home/Home.tsx](src/tabs/home/Home.tsx#L1562) — `fetchPendingDocActions` polls the endpoint; immediate action built at [src/tabs/home/Home.tsx L6797–6855](src/tabs/home/Home.tsx#L6797). Click dispatches `navigateToEnquiry` with `{ enquiryId, timelineItem: 'doc-workspace' }`. **No NetDocuments involvement.**
- Model metadata: [src/tabs/home/ImmediateActionModel.ts L128](src/tabs/home/ImmediateActionModel.ts#L128) — `persistence: 'none'`, `notes: 'Navigation-only action; persistence occurs in destination workflow.'`

### 2.2 Home ToDo pickup pattern (CCL, already working)

- Whitelist: [src/tabs/home/Home.tsx L266](src/tabs/home/Home.tsx#L266) — `const FORMS_TODO_KINDS = new Set(['ld-review', 'undertaking-request', 'complaint-followup', 'review-ccl']);`
- Registry filter: [src/tabs/home/Home.tsx L2390](src/tabs/home/Home.tsx#L2390) — `setTodoRegistryCards(cards.filter((card: ToDoCard) => FORMS_TODO_KINDS.has(card.kind)));`
- Mapper: `formsTodoActions` + `openHomeCclReview` callback near Home.tsx L3996–4010 (summary reference). Each whitelisted kind gets a `HomeImmediateAction` with `onClick` dispatching a CustomEvent.
- Event listener: [src/components/modern/OperationsDashboard.tsx L4585](src/components/modern/OperationsDashboard.tsx#L4585) — `handleOpenHomeCclReview` opens the review rail; fixed this session so non-compile-stage matters pass `forceIntro: false` and land directly on the field-review step.
- Server emit: [server/routes/ccl.js L1097–1143](server/routes/ccl.js#L1097) — inserts `dbo.hub_todo` with `kind: 'review-ccl'` after a successful `POST /api/ccl/service/run`.
- Allowed kinds on the server: [server/utils/hubTodoLog.js L97](server/utils/hubTodoLog.js#L97) — includes `'review-ccl'`. **A new kind must be added here.**

### 2.3 CCL ND auto-upload (current silent chain)

- Flag check: [server/routes/ccl.js L1154](server/routes/ccl.js#L1154) — `const autoUploadEnabled = String(process.env.CCL_AUTO_UPLOAD_ND || '').trim() === '1';`
- Chain init: [server/routes/ccl.js L1147–1161](server/routes/ccl.js#L1147) — comment block "Background autopilot chain — ND upload → Teams notification → rollup telemetry."
- ND upload action: [server/routes/ccl-ops.js L800](server/routes/ccl-ops.js#L800) and L901 — `markCclUploaded(cclContentId, { nd: true, ndDocId, finalizedBy })`.
- Persistence helper: [server/utils/cclPersistence.js L216](server/utils/cclPersistence.js#L216) — `async function markCclUploaded(cclContentId, { clio, nd, clioDocId, ndDocId, finalizedBy }) {}`.
- The chain is background (`.catch(...)`) and non-blocking. If `CCL_AUTO_UPLOAD_ND=1`, ND receives the CCL **without any solicitor click**. The brief's Phase A removes this silent path.

### 2.4 Matter opening pipeline (where docs-transfer would be triggered)

- Client orchestration: [src/tabs/instructions/MatterOpening/processingActions.ts](src/tabs/instructions/MatterOpening/processingActions.ts) — current CCL NetDocuments auto-upload hook is located here (per 2026-03-24 changelog entry: "Auto-upload CCL to NetDocuments during matter opening"). Confirm via grep before adding the new step.
- `dbo.hub_todo` schema accepts arbitrary `kind` strings via `server/utils/hubTodoLog.js` — new kind `review-docs-transfer` needs to be added to the allow-list at L97 plus any downstream switch statements.

### 2.5 Doc-workspace approve path (possible reuse)

- [server/routes/doc-workspace.js](server/routes/doc-workspace.js) already owns the blob holding-area primitives. Adding a new `POST /api/doc-workspace/transfer-to-nd` sibling endpoint keeps the concern domain-adjacent.
- NetDocuments client wrapper already exists (see `server/services/netdocuments.js` via CCL ND upload — confirm the exact module during execution).

---

## 3. Plan

### Phase A — CCL review lockdown (no silent ND upload)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Remove the `CCL_AUTO_UPLOAD_ND` silent-chain branch; require explicit approve click from Review CCL modal | [server/routes/ccl.js](server/routes/ccl.js#L1147) | Keep Teams notify + rollup telemetry. Replace the ND-upload step with a trackEvent `CCL.NdUpload.Skipped.AwaitingApproval`. The existing explicit approve path (via `ccl-ops.js` endpoints) is the only way to trigger `markCclUploaded`. |
| A2 | Ensure Review CCL modal has an explicit "Upload to NetDocuments" action with solicitor confirmation (if missing) | `src/tabs/instructions/MatterOpening/...CclReview*.tsx` (locate via grep) | Button posts to the existing ccl-ops endpoint that calls `markCclUploaded`. Disable while in-flight; toast on success/fail. |
| A3 | Changelog entry + telemetry note | [logs/changelog.md](logs/changelog.md) | One line: "Gate CCL→ND upload behind explicit solicitor approval (no silent chain)." |

**Phase A acceptance:**
- With `CCL_AUTO_UPLOAD_ND=1` in env, generating a CCL no longer writes to ND. App Insights shows `CCL.NdUpload.Skipped.AwaitingApproval` for the run.
- Clicking "Upload to NetDocuments" in the review modal still succeeds end-to-end.
- `review-ccl` hub_todo still appears and opens directly on the field-review step (already fixed this session — regression-check only).

### Phase B — Docs transfer review surface (greenfield)

#### B1. Server — new `kind: 'review-docs-transfer'`

1. Add `'review-docs-transfer'` to the allow-list in [server/utils/hubTodoLog.js L97](server/utils/hubTodoLog.js#L97).
2. New module `server/routes/doc-workspace-transfer.js` (or extend `doc-workspace.js`):
   - `POST /api/doc-workspace/transfer/queue` — called by the matter-opening pipeline once `ClientId`/`MatterId` are written. Payload: `{ matterId, enquiryId, instructionRef, triggeredBy }`. Scans blob holding area + instruction docs table, writes a `hub_todo` row with kind `review-docs-transfer` and JSON payload `{ matterId, enquiryId, instructionRef, pending: [{ source: 'blob'|'instruction-doc', id, name, size, mimeType }] }`. **Does NOT upload anything.** Telemetry: `Docs.TransferReview.Queued`.
   - `GET /api/doc-workspace/transfer/:todoId` — returns the pending list hydrated with fresh status (so the modal reflects any files cleared in the meantime).
   - `POST /api/doc-workspace/transfer/approve` — payload: `{ todoId, approvedDocIds[] }`. Streams each to ND `Documents/Client` folder under the matter workspace. On 100% success → mark todo `completed`, emit `Docs.TransferReview.Completed`. Partial → keep todo open with remaining items, emit `Docs.TransferReview.Partial`. Each doc transfer emits `Docs.TransferReview.DocUploaded` or `Docs.TransferReview.DocFailed`.
3. `server/services/netdocuments.js` (or equivalent used by `markCclUploaded`) — reuse the existing ND client; add a `uploadToMatterClientFolder(matterRef, fileBuffer, metadata)` helper if one doesn't already exist.

#### B2. Matter-opening pipeline hook

- In [src/tabs/instructions/MatterOpening/processingActions.ts](src/tabs/instructions/MatterOpening/processingActions.ts), after the step that confirms ClientId + MatterId are persisted, fire `POST /api/doc-workspace/transfer/queue` (non-blocking; `.catch(...)` logs telemetry but never aborts matter opening).

#### B3. Client — Home ToDo pickup

1. Whitelist: [src/tabs/home/Home.tsx L266](src/tabs/home/Home.tsx#L266) — add `'review-docs-transfer'` to `FORMS_TODO_KINDS`.
2. Mapper branch in `formsTodoActions` (near the `review-ccl` branch, same file) — returns a `HomeImmediateAction`:
   - `title: 'Transfer documents to matter'`
   - `subtitle: '<matterRef> · <N> file(s) ready to approve'`
   - `icon: 'CloudUpload'` (or equivalent — match the sent-to-ND iconography used elsewhere)
   - `onClick` dispatches `CustomEvent('openDocsTransferReview', { detail: { todoId, matterId, enquiryId } })`.
   - `category: 'standard'`.
3. New callback `openHomeDocsTransferReview` on Home.tsx (pattern copy of `openHomeCclReview` L3996–4010).

#### B4. Client — modal + listener

1. New component `src/tabs/instructions/MatterOpening/DocsTransferReviewModal.tsx` (co-locate with existing CCL review artefacts). Shape:
   - Header: matter ref + client name + "Awaiting your approval".
   - List row per pending file: name, size, mimeType icon, reason badge (e.g. "enquiry holding", "instruction doc"), approve-checkbox (default **off** — user must opt in each file; explicit consent).
   - Footer: "Upload selected to NetDocuments" primary CTA (disabled until ≥1 selected; shows spinner while posting).
   - Close button marks todo dismissed only via explicit "Dismiss without transferring" secondary button (small, tertiary tone). Plain modal-close leaves todo open.
2. Listener in [src/components/modern/OperationsDashboard.tsx](src/components/modern/OperationsDashboard.tsx) (co-locate with `handleOpenHomeCclReview` L4585):
   - `handleOpenDocsTransferReview` — fetches `/api/doc-workspace/transfer/:todoId`, opens modal.

#### B5. Telemetry + changelog

- Per `.github/instructions/server.instructions.md`: `trackEvent('Docs.TransferReview.Started|Queued|Approved|Completed|Partial|Failed', { ... })` and `trackException` in every catch. Duration metric `Docs.TransferReview.Duration`.
- Changelog entry after each phase.

---

## 4. Step-by-step execution order

1. **A1** — ccl.js chain edit (remove silent ND branch, keep telemetry)
2. **A2** — verify/extend Review CCL modal approve button
3. **A3** — Phase A changelog entry
4. *(parallel with 5, 6)* **B1** — server endpoints + `hubTodoLog.js` allow-list
5. *(parallel with 4)* **B3** — Home.tsx whitelist + mapper
6. *(parallel with 4)* **B4a** — `DocsTransferReviewModal.tsx` (can scaffold with mocked data first)
7. **B2** — matter-opening pipeline hook (after B1 is deployable)
8. **B4b** — OperationsDashboard listener wire-up (after B1 + B4a)
9. **B5** — telemetry + changelog
10. End-to-end manual test: open a test matter with known holding docs → todo appears → modal shows files → approve one → ND receives it → todo updates to partial → approve remainder → todo completes.

---

## 5. Verification checklist

**Phase A:**
- [ ] `CCL_AUTO_UPLOAD_ND=1` no longer triggers ND upload on `POST /api/ccl/service/run`.
- [ ] App Insights: `CCL.NdUpload.Skipped.AwaitingApproval` event emitted for each eligible run.
- [ ] Review CCL modal "Upload to NetDocuments" button still works; `markCclUploaded` row written.
- [ ] `review-ccl` hub_todo opens directly on field-review step (regression check for this-session fix).

**Phase B:**
- [ ] `review-docs-transfer` kind accepted by `hubTodoLog` (SQL row lands without error).
- [ ] Matter opening completes even when `/transfer/queue` POST fails (non-blocking contract).
- [ ] Home renders "Transfer documents to matter" immediate action from the hub_todo row.
- [ ] Clicking it opens the modal with accurate file list.
- [ ] Approving ≥1 file streams to ND; todo updates; App Insights shows `Docs.TransferReview.Completed` (or `.Partial`).
- [ ] **No ND upload occurs without a solicitor click** — grep the server for any code path that writes to ND from docs-transfer without an `approvedDocIds` array being present; should return zero matches.
- [ ] SQL spot check: `SELECT kind, status, created_at FROM dbo.hub_todo WHERE kind IN ('review-ccl','review-docs-transfer') ORDER BY created_at DESC;`

---

## 6. Open decisions (defaults proposed)

1. **Default checkbox state in modal** — Default: **off (opt-in per file)**. Rationale: user's constraint is "nothing goes to the nd matter without the solicitor knowing"; opt-in enforces conscious approval.
2. **What to do with enquiry holding files after a successful ND transfer** — Default: **leave in blob, mark `transferred: true` via a new blob metadata tag or a sibling SQL row**. Rationale: avoids data loss if ND upload later turns out to be to the wrong folder; allows the existing enquiry-stage "Allocate Documents" to also de-dup.
3. **Instruction-stage document source** — Default: **read from existing Instructions DB doc tables (confirm table name in Gotchas)**, not from blob. Rationale: instruction docs are already referenced by SQL; don't re-scan blobs.
4. **`review-ccl` auto-approve path removal** — Default: **remove entirely, including the `CCL_AUTO_UPLOAD_ND` env flag**. Rationale: env-flagged silent paths invite config drift. Keep the flag commented out in `.env.example` if present with a deprecation note.

---

## 7. Out of scope

- Rebuilding the existing enquiry-stage "Allocate Documents" (holding-area → enquiry workspace navigation). That surface stays as-is.
- Clio document upload (this brief is ND-only).
- Background / timer-driven retransfer. Every upload is user-initiated.
- Migrating already-uploaded historical ND docs.
- Teams DM notifications for docs transfer (can be added later behind a flag; not required for MVP).

---

## 8. File index (single source of truth)

**Client:**
- [src/tabs/home/Home.tsx](src/tabs/home/Home.tsx) — `FORMS_TODO_KINDS` + `formsTodoActions` mapper branch (B3)
- [src/components/modern/OperationsDashboard.tsx](src/components/modern/OperationsDashboard.tsx) — new listener `handleOpenDocsTransferReview` (B4b)
- `src/tabs/instructions/MatterOpening/DocsTransferReviewModal.tsx` (NEW) — approval UI (B4a)
- [src/tabs/instructions/MatterOpening/processingActions.ts](src/tabs/instructions/MatterOpening/processingActions.ts) — queue trigger (B2)
- `src/tabs/instructions/MatterOpening/CclReview*.tsx` — verify explicit "Upload to ND" button exists (A2)

**Server:**
- [server/routes/ccl.js](server/routes/ccl.js) — remove silent ND branch L1147–1161 (A1)
- [server/routes/ccl-ops.js](server/routes/ccl-ops.js) — existing explicit upload path (regression check only)
- `server/routes/doc-workspace-transfer.js` (NEW) or extend [server/routes/doc-workspace.js](server/routes/doc-workspace.js) — `/transfer/queue`, `/:todoId`, `/approve` (B1)
- [server/utils/hubTodoLog.js](server/utils/hubTodoLog.js) — add `'review-docs-transfer'` at L97 (B1)
- `server/services/netdocuments.js` — reuse / extend for `uploadToMatterClientFolder` (B1)

**Scripts / docs:**
- [logs/changelog.md](logs/changelog.md) — entry per phase
- `docs/notes/INDEX.md` — auto-regenerated via `stash-status.mjs`

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: docs-transfer-review-ccl-review-fixes
verified: 2026-04-24
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/instructions/MatterOpening/DocsTransferReviewModal.tsx
    - src/tabs/instructions/MatterOpening/processingActions.ts
  server:
    - server/routes/ccl.js
    - server/routes/ccl-ops.js
    - server/routes/doc-workspace.js
    - server/routes/doc-workspace-transfer.js
    - server/utils/hubTodoLog.js
    - server/services/netdocuments.js
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface                 # parent framework — adds new kind
  - ccl-review-pickup-via-todo-and-addressee-fix    # same review rail area
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - ccl-polish-workbench-chip-toast-dedupe-pipeline-latency
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - call-centre-external-attendance-note-and-clio-mirror
  - forms-ia-ld-undertaking-complaint-flow
  - forms-stream-persistence
  - clio-token-refresh-architecture-audit
  - clio-token-refresh-shared-primitive
  - database-index-and-dual-db-audit
  - realtime-multi-replica-safety
  - session-probing-activity-tab-visibility-and-persistence
  - compactmatterwizard-split-by-wizardmode
  - demo-mode-hardening-production-presentable-end-to-end
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - operationsdashboard-carve-up-by-section
  - realtime-delta-merge-upgrade
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with:
  - ccl-backend-chain-silent-autopilot-service      # Phase A inverts its core assumption (ND auto-upload is a prerequisite for the Teams-notify chain). Resolving requires either: (a) gate the Teams-notify chain on the explicit-approve callback instead of the silent upload, or (b) drop Phase A and live with silent ND writes. Decision required before Phase A ships.
```

---

## 9. Gotchas appendix

- **`FORMS_TODO_KINDS` is a whitelist applied TWICE** — once at fetch-filter time ([Home.tsx L2390](src/tabs/home/Home.tsx#L2390)) and once in the mapper. Adding a kind requires both sites or the registry will silently drop it.
- **`hubTodoLog.js` allow-list is authoritative** — any insert with an unlisted `kind` is rejected at the DB helper layer. Adding the kind server-side is mandatory before the client can render anything.
- **ND upload runs under background `.catch(err => ...)`** in `ccl.js` — the chain never surfaces failure to the caller. Matching pattern for docs transfer: the queue-step must be background, but the approve-step must surface errors synchronously to the user via the modal (different contract).
- **Matter-opening non-blocking contract** — the 2026-03-24 changelog ("Auto-upload CCL to NetDocuments during matter opening") explicitly notes failures must not abort matter opening. Replicate the `.catch(() => trackException(...))` shape; never `throw` inside the queue step.
- **Blob path structure** `enquiries/{id}/{passcode}/Holding/{filename}` — see [server/routes/doc-workspace.js L673](server/routes/doc-workspace.js#L673). The passcode is required to resolve the file; preserve it in the `pending` payload so `/transfer/approve` can re-fetch.
- **3-minute cache TTL** on `/pending-actions` ([doc-workspace.js L653](server/routes/doc-workspace.js#L653) `PENDING_ACTIONS_TTL_MS = 180_000`). A successful transfer won't be reflected in the enquiry-stage Allocate Documents chip for up to 3 minutes unless the cache is invalidated. Acceptable for MVP; note for future.
- **Immediate-action metadata** ([ImmediateActionModel.ts L128](src/tabs/home/ImmediateActionModel.ts#L128)) categorises the existing "Allocate Documents" as `persistence: 'none'`. The new surface is `persistence: 'database'` + `realtime: 'manual-refresh'` — add a sibling branch, do not reuse.
- **Review CCL intro-skip fix** landed this session ([OperationsDashboard.tsx L4585](src/components/modern/OperationsDashboard.tsx#L4585)): `forceIntro: false` for non-compile-stage matters. Don't regress it when extending the listener file for `handleOpenDocsTransferReview`.
- **CCL explicit approve button may already exist** — before writing new UI in A2, grep `src/tabs/instructions/MatterOpening/` for `markCclUploaded` or `uploadToNd`. The pattern probably exists and just needs exposure in the review rail.
