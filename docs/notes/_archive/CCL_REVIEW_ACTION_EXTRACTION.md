# CCL review action extraction

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-24 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user asked to "scope both of the health observations" and then said "stash them but just so you dont get distracted and stay on course. youre implementing these now." This brief exists so the extraction scope is preserved as a cold-start handoff even though the work is being executed in the current session.

The concrete problem is local: the CCL review modal's approval/send behaviour is still orchestrated inside `OperationsDashboard.tsx`. The user is not asking for a broader CCL workflow rewrite, a new review IA, or prompt changes here. The ask is to carve the approval/send slice into a dedicated unit so retries, partial failures, and future send modes are easier to change safely.

---

## 2. Current state — verified findings

The current approval/send slice is concentrated in one large dashboard component and already spans state, orchestration, UI copy, and API sequencing.

### 2.1 Dashboard owns the full CCL review action chain

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L1475) — the dashboard owns a dense block of CCL-specific state, including `cclMap`, draft cache state, review-field selection, pressure-test state, approval progress, the guarded-send overlay text, and the modal-close success state.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L10089) — `handleApproveCurrentLetter` performs the whole sequence inline: approve status, optimistic `cclMap` patch to reviewed, NetDocuments upload, guarded internal send, toast decisions, field-selection cleanup, success overlay, and modal close.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L11707) — the review decision panel receives the raw approval callback and label directly from the dashboard render tree.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L11805) — the summary footer button also calls the same inline handler, so both entry points are coupled to the same closure state.

### 2.2 The decision panel is already presentation-led

- File: [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx#L12) — the panel API is intentionally narrow: booleans, labels, and callback props (`onApprove`, `onToggleReviewed`, `onNext`, `onPrevious`).
- File: [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx#L121) — the panel only renders the approve button when `canApprove && !hasNextDecision`, which means orchestration can move out without changing its role.

### 2.3 The API layer already exposes composable primitives

- File: [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts#L586) — `uploadToNetDocuments` is already a discrete client helper.
- File: [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts#L606) — `CclGuardedSendResponse` defines the guarded-send response shape that the UI currently patches into `cclMap` itself.
- File: [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts#L625) — `sendCclToClient` is already a dedicated client helper even though the sequencing still lives in the dashboard.
- File: [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts#L910) — `approveCcl` is separate as well, so a dedicated action hook/module can compose the three steps without inventing new transport code.

---

## 3. Plan

### Phase A — Extract the review approval/send controller

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create a dedicated review-actions unit | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Move the approve → upload → guarded-send sequencing into a focused hook/module with explicit progress/result handling instead of an inline closure. |
| A2 | Keep the panel presentational | [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) | Preserve the panel's narrow callback-driven contract; only change props if the extraction genuinely requires it. |
| A3 | Centralise optimistic status patching | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Move the `cclMap` patch rules for reviewed/sent into one place so resend and retry work can build on them later. |
| A4 | Preserve current transport helpers | [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts) | Reuse `approveCcl`, `uploadToNetDocuments`, and `sendCclToClient` rather than changing route contracts in the extraction slice. |

**Phase A acceptance:**
- Approval can still be triggered from both the side-panel button and the summary footer button.
- NetDocuments upload remains best-effort and non-blocking unless the user explicitly changes that behaviour.
- Guarded internal send still excludes the client and still updates local status to sent on success.
- The dashboard render tree no longer carries the full inline orchestration body.

### Phase B — Add explicit retry/resend behaviour on top of the extraction

#### B1. Action result model

Add an explicit result shape for approval/upload/send so the UI can distinguish:
- approval failed,
- approval succeeded but NetDocuments upload failed,
- approval and upload succeeded but guarded send failed,
- full success.

#### B2. Resend / retry affordance

Once the controller exists, add a small resend path for already-reviewed or already-sent letters without re-entering the whole approval flow.

---

## 4. Step-by-step execution order

1. **A1** — Identify the exact state and callbacks the extracted controller needs from the dashboard.
2. **A2** — Create the controller/hook and move the inline sequencing out of `handleApproveCurrentLetter`.
3. **A3** — Rewire both approval entry points to the extracted controller and preserve the existing overlay/toast copy.
4. **A4** — Run targeted diagnostics on the touched TS/TSX files.
5. **B1** — Add a richer result model once the extraction is stable.
6. **B2** — Add resend/retry affordances only after the controller boundary is proven.

---

## 5. Verification checklist

**Phase A:**
- [ ] Trigger approval from the review panel and confirm the step text still advances through finalise, ND upload, and guarded send.
- [ ] Trigger approval from the summary footer and confirm it uses the same extracted controller path.
- [ ] Editor diagnostics are clean for the touched dashboard / panel / service files.

**Phase B:**
- [ ] Retry/resend can be invoked without reopening the entire review state machine.
- [ ] Existing App Insights events for guarded send still fire through the refactor.
- [ ] Changelog entry added for the shipped extraction slice.

---

## 6. Open decisions (defaults proposed)

1. **Hook or plain module?** — Default: **a focused hook or local controller module beside the dashboard**. Rationale: the orchestration still needs access to React state setters and toast helpers, but it does not belong inline in the render scope.
2. **Should NetDocuments upload remain non-blocking?** — Default: **yes**. Rationale: the current behaviour already treats ND upload as best-effort, and changing that would alter the approval contract rather than just extracting it.

---

## 7. Out of scope

- Reworking the wider CCL review IA, queue order, or pressure-test UX.
- Changing server-side send policy, recipient rules, or Graph delivery behaviour.

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — current owner of the review modal, CCL state, and inline approval/send orchestration.
- [src/components/modern/CclReviewDecisionPanel.tsx](../../src/components/modern/CclReviewDecisionPanel.tsx) — presentational decision panel that should stay callback-driven.
- [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts) — transport helpers used by the extracted controller.

Server:
- None in this slice.

Scripts / docs:
- [docs/notes/CCL_REVIEW_ACTION_EXTRACTION.md](../../docs/notes/CCL_REVIEW_ACTION_EXTRACTION.md) — this brief.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-review-action-extraction                          # used in INDEX cross-refs
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-24
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/components/modern/CclReviewDecisionPanel.tsx
    - src/tabs/matters/ccl/cclAiService.ts
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with:
  - demo-mode-hardening-production-presentable-end-to-end
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with:
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - docs-transfer-review-ccl-review-fixes
  - home-skeletons-aligned-cascade
  - home-todo-single-pickup-surface
  - operationsdashboard-carve-up-by-section
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
```

---

## 9. Gotchas appendix

- `handleApproveCurrentLetter` currently patches `cclMap` to `reviewed` before the guarded send and then to `sent` after it succeeds. Preserve that split unless you deliberately want to change what the operator sees during partial failure.
- The success overlay copy now says the letter was sent internally to Luke and copied to Alex plus the fee earner. If the extracted controller changes step naming, keep the copy aligned with the actual behaviour.
- Both the side-panel approve action and the summary-footer approve button call the same handler today. If only one is rewired during extraction, the modal will drift into inconsistent behaviour.
