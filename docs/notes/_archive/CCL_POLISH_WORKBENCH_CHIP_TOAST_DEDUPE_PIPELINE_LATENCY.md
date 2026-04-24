# CCL polish — workbench chip, toast dedupe, pipeline latency

> **Purpose of this document.** Self-contained brief so any future agent can pick up the CCL-in-matter-opening polish work cold. Executes as a combined programme because the three phases overlap: the Workbench chip uses the same CCL status map the toasts consume, and extracting `useCclPipelineToasts` is the enabler for the toast dedupe. Phase D (App Insights workbook) is bolted on last because it only needs the telemetry events already shipped in Phase C1 (2026-04-23).
>
> **How to use it.** Read once. Ship phases in order A → B → C → D. Changelog entry per phase.
>
> **Verified:** 2026-04-23 against branch `main`. Re-verify file/line refs if reading more than 30 days later — OperationsDashboard.tsx is actively being carved up (see stash `operationsdashboard-carve-up-by-section`).

---

## 1. Why this exists (user intent)

User (verbatim): *"ccl should be a part of the matter opening and the whole workflow should now feel polished."*

Context: 2026-04-23 shipped end-to-end pickup of CCL autopilot review cards. Home's ImmediateActionsBar now surfaces `review-ccl` hub_todo cards; the Matters table's CCL Status pill is clickable and opens the review rail via `openHomeCclReview`. Both paths share OperationsDashboard's existing listener (L4535-4555).

What this brief adds on top:

1. **Workbench chip** — when matter opening in `InlineWorkbench.tsx` has fired the autopilot but the user has navigated away before the Safety-Net flags land (or before the autopilot finishes at all), the Workbench row should surface a "CCL queued" / "CCL ready to review" chip so the user sees the pickup point where they started the workflow, not only in Home/Matters.
2. **Toast dedupe (Phase C2)** — AutoFill and PressureTest currently both `upsertCclAiToast` with overlapping phases; when autopilot chains them, the user sees two toasts stacking for the same matter in quick succession. Single per-matter toast that mutates through phases is the right model.
3. **Hook extraction (Phase C4)** — `OperationsDashboard.tsx` hosts all toast plumbing inline; extract into `src/hooks/useCclPipelineToasts.ts` so both the dedupe logic and the Workbench chip share one source of truth for "is a CCL in flight for matter X?"
4. **Pipeline latency workbook (Phase C3)** — KQL saved search / Workbook consuming the `CCL.AutoFill.Completed/Failed` + `CCL.PressureTest.Completed/Failed` events shipped 2026-04-23 so the team can watch generation + PT latency + flag rate without ad-hoc queries.

User is **not** asking for: a rewrite of the review rail, touching server-side CCL generation, or moving the autopilot trigger away from matter opening.

---

## 2. Current state — verified findings

### 2.1 Matter opening → CCL autopilot

- File: [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx)
  - `optimisticMatterOpen` state: L251 — set when matter opening modal completes.
  - `matter` lookup: L537-550 — matches by InstructionRef / MatterId against the `matters` prop.
  - `hasMatter` composite: L2554.
  - `matterOpenDateRaw`: L1138 — falls back to optimistic open timestamp.
  - **Gap**: no CCL status reads here. After matter opens, the Workbench has no idea whether a CCL is queued/generated/flagged on the hub_todo side.

- File: [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx)
  - `inlineWorkbenchByEnquiryId` memo: L551.
  - Workbench render: L5193 passes `inlineWorkbenchItem` prop to the row.
  - **Gap**: `cclMap` (status by matterId) is owned by `OperationsDashboard.tsx` and never threaded through to Enquiries/Workbench. Need a lightweight alternative — either (a) expose via a React context, or (b) re-fetch the hub_todo registry in Workbench on its own poll, (c) consume via `/api/ccl/status/:matterId`.

### 2.2 CCL status source (existing)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
  - `cclMap` state: search for `setCclMap` — single source of CCL stage by matterId. Populated by `/api/ccl/status/:matterId` polls + mutations after generate/approve.
  - `openHomeCclReview` listener: L4535-4555 — accepts `{ matterId, openInspector, autoRunAi }` detail, resolves to a displayMatters entry, opens the appropriate modal (compile-only vs regular).
  - Review flow downstream of listener: L4565-4585 — `setExpandedCcl` + `setCclPreviewOpen` + `openCclLetterModal`/`openCclWorkflowModal`.

- File: [server/routes/ccl.js](../../server/routes/ccl.js)
  - `/api/ccl/service/run` creates `review-ccl` hub_todo card at L1097-1143 when PT flags fields.
  - Autopilot chain (ND upload + Teams DM + Activity feed rollup) at L1152-1268.
  - `/api/ccl/status/:matterId` returns the current stage.

### 2.3 Home pickup (shipped 2026-04-23)

- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx)
  - `FORMS_TODO_KINDS` at L259 includes `'review-ccl'`.
  - `review-ccl` branch in `formsTodoActions` useMemo — maps hub_todo cards to `HomeImmediateAction` with `Review CCL` title + `critical` tone when flaggedCount>0.
  - `openHomeCclReview(matterId?)` dispatcher at L3968-3980.
  - Registry fetch every 15s: `fetchTodoRegistryCards` at L2343-2372 via `/api/todo?owner=INITIALS`.

### 2.4 Matters pill (shipped 2026-04-23)

- Files: [src/tabs/matters/MatterTableView.tsx](../../src/tabs/matters/MatterTableView.tsx) (new `onOpenCclReview` prop, pill is a `<button>` for draft/generated/reviewed/sent stages), [src/tabs/matters/Matters.tsx](../../src/tabs/matters/Matters.tsx) at L1517 (dispatches `openHomeCclReview`).

### 2.5 Existing toasts (pre-dedupe state)

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
  - `upsertCclAiToast` is one function but AutoFill chains call it multiple times per matter with different phase strings (`retrieving-draft`, `compiling`, `generating`, `pressure-testing`, `complete`).
  - Behaviour today: each call with a different `matterId` key creates a new toast; calls with the same matterId mutate. **Not broken**, but stacked matters (e.g. open two in quick succession) produce two parallel toast trails rather than a compact list.
  - Telemetry (shipped 2026-04-23 Phase C1): `CCL.AutoFill.Completed/Failed` + `CCL.PressureTest.Started/Completed/Failed` with durationMs, flaggedCount, confidence.

### 2.6 Telemetry destination

- File: [src/utils/telemetry.ts](../../src/utils/telemetry.ts) — `trackClientEvent('operations-ccl', eventName, stringProps)` → server `/api/telemetry` → App Insights customEvents.

---

## 3. Plan

### Phase A — CCL status context (enabler, no user-visible change)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New context + hook | [src/contexts/CclStatusContext.tsx](../../src/contexts/CclStatusContext.tsx) NEW | `{ byMatterId: Record<string, CclStatus>, refresh }`. `useCclStatus(matterId?)` returns `{ status, flaggedCount, isQueued, isFlagged, isReady, refresh }`. Safe outside provider. |
| A2 | Provider at OperationsDashboard | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Wrap children with `<CclStatusContext.Provider value={{ byMatterId: cclMap, refresh }}>`. Memoise value. |

**Phase A acceptance:**
- [ ] No behaviour change.
- [ ] `useCclStatus('HLX-...')` matches what `cclMap[...]` exposes today.
- [ ] `get_errors` clean.

### Phase B — Workbench chip

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Read CCL status | [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) | Call `useCclStatus(matterClioId)` with fallback `inst?.MatterId \|\| matter?.MatterID \|\| optimisticMatterOpen?.matterId`. |
| B2 | Render chip | Same file, near L2554-2563 (the `hasMatter` block / `matterRef` render) | Pill, `borderRadius: 999`, colour from `colours` (green=sent, highlight=generated/reviewed, cta=flagged, subtleGrey=queued). Label: `CCL · <stage or "N to check">`. |
| B3 | Click → review rail | Same file | Dispatch `new CustomEvent('openHomeCclReview', { detail: { matterId, openInspector: true } })`. stopPropagation. |

**Phase B acceptance:**
- [ ] Matter in Workbench shows current CCL stage, or muted "CCL · pending" when undefined.
- [ ] Autopilot flagged → chip flips to `cta` with count.
- [ ] Click → review rail opens.
- [ ] No chip when matterClioId resolves to `'—'`.

### Phase C — Toast dedupe + hook extraction

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Extract hook | [src/hooks/useCclPipelineToasts.ts](../../src/hooks/useCclPipelineToasts.ts) NEW | Owns `cclAiToasts` state + `upsertCclAiToast` + `cclAiToastIdRef`. Returns `{ toasts, upsert, dismiss, activeMatterIds }`. |
| C2 | Cutover | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Replace local state. Keep `upsertCclAiToast` name at call sites to minimise diff. |
| C3 | Dedupe | [src/hooks/useCclPipelineToasts.ts](../../src/hooks/useCclPipelineToasts.ts) | Key by matterId; new phase for same matter mutates the existing entry. Keep last 3 matters visible, older compressed into `+N more` summary row. |
| C4 | Lifecycle | Same file | `complete`/`error` auto-dismiss 6–7s; intermediate phases persist. Honour most-recent non-null `persist` value. |

**Phase C acceptance:**
- [ ] Two matters in quick succession → one toast each, each mutating.
- [ ] AutoFill → PT transition updates the same toast.
- [ ] Error → single error toast, clears after 7s.
- [ ] No dangling toasts after modal close.

### Phase D — Pipeline latency workbook

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | KQL saved searches | [docs/KQL_CCL_PIPELINE.md](../../docs/KQL_CCL_PIPELINE.md) NEW | 4 queries: generation latency P50/P95/P99 over 24h, PT flag-rate per day, AutoFill failure rate per day, end-to-end autopilot success% per matter. |
| D2 | Workbook JSON | [docs/workbooks/ccl-pipeline.json](../../docs/workbooks/ccl-pipeline.json) NEW | Importable into App Insights. |
| D3 | Docs pointer | [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) | Link to workbook + KQL under "Application Insights Telemetry". |

**Phase D acceptance:**
- [ ] KQL queries run against production customEvents.
- [ ] Workbook imports without errors.
- [ ] Non-empty data after ≥1 autopilot run.

---

## 4. Step-by-step execution order

1. **A1 + A2** — context + provider.
2. **B1–B3** — Workbench chip (depends on A).
3. **C1 + C2** — extract hook (refactor only, no dedupe).
4. **C3 + C4** — dedupe logic.
5. **D1 → D2 → D3** — KQL + workbook + docs pointer.

Changelog entry per phase.

---

## 5. Verification checklist

**Phase A:**
- [ ] `useCclStatus(matterId)` matches the Matters pill stage for the same matter.

**Phase B:**
- [ ] Chip renders for any matter with a `cclMap` entry.
- [ ] Click opens review rail (same path as Home/Matters).
- [ ] Dark/light mode tokens honoured.

**Phase C:**
- [ ] One toast per matter, mutates through phases.
- [ ] No React "unmounted" warnings mid-pipeline modal close.
- [ ] Existing telemetry still fires.

**Phase D:**
- [ ] KQL returns rows for the latest 24h.
- [ ] Workbook renders in the Azure portal.

---

## 6. Open decisions (defaults proposed)

1. **Context vs. prop-drilling** — Default: **React context**. Rationale: three levels of drilling otherwise.
2. **Chip placement** — Default: **inline next to `matterRef` in the Workbench matter card header** (L2554-2563).
3. **Toast dedupe granularity** — Default: **one toast per matterId**, last 3 visible, older folded into summary row.
4. **Workbook location** — Default: **checked into `docs/workbooks/`**, imported manually in the portal.

---

## 7. Out of scope

- Changing how `/api/ccl/service/run` creates hub_todo cards.
- Server-side autopilot chain (ND upload / Teams DM / Activity feed).
- Pre-existing `operationsdashboard-carve-up-by-section` stash (this coordinates, does not supersede).

---

## 8. File index

Client:
- [src/contexts/CclStatusContext.tsx](../../src/contexts/CclStatusContext.tsx) (NEW)
- [src/hooks/useCclPipelineToasts.ts](../../src/hooks/useCclPipelineToasts.ts) (NEW)
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx)
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx)

Server: none.

Scripts / docs:
- [docs/KQL_CCL_PIPELINE.md](../../docs/KQL_CCL_PIPELINE.md) (NEW)
- [docs/workbooks/ccl-pipeline.json](../../docs/workbooks/ccl-pipeline.json) (NEW)
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md)
- [logs/changelog.md](../../logs/changelog.md)

### Stash metadata

```yaml
# Stash metadata
id: ccl-polish-workbench-chip-toast-dedupe-pipeline-latency
shipped: true
shipped_on: 2026-04-23
verified: 2026-04-23
branch: main
touches:
  client:
    - src/contexts/CclStatusContext.tsx
    - src/hooks/useCclPipelineToasts.ts
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/instructions/InlineWorkbench.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - operationsdashboard-carve-up-by-section
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-backend-chain-silent-autopilot-service
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - ccl-review-pickup-via-todo-and-addressee-fix
  - home-skeletons-aligned-cascade
  - home-todo-single-pickup-surface
  - inline-workbench-carve-up-and-ux-simplification
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - demo-mode-hardening-production-presentable-end-to-end
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- **`optimisticMatterOpen`** in InlineWorkbench L251 means `matterClioId` can resolve to the new matter id before `cclMap` has polled it. Chip should render a muted "CCL · pending" state when status is undefined, not hide entirely.
- **`openHomeCclReview` listener** at OperationsDashboard L4535-4555 falls back to the first matter with a CCL when `detail.matterId` doesn't match. Workbench dispatches should always pass explicit matterId.
- **Toast ref** `cclAiToastIdRef.current = null` is reset in the error-path catch ~L3056. Preserve this when extracting.
- **Phase C dedupe** must honour the last non-null `persist` value — auto-dismiss timer only arms on `complete`/`error`.
- **`colours.cta`** (#D65541) for flagged; `colours.highlight` for generated/reviewed — mirror the Matters pill branch.
- **Phase D KQL** — `customEvents` has `source='operations-ccl'` and `name=<EventName>`. Filter by both.
