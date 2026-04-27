# Demo mode hardening — production-presentable end-to-end

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During CCL demo prep, the user said:

> *"scope a brief for the hardening of demo mode so it becomes truly useful, with this being the concept but you must expand to account for all the little things that make it possible in a production environment that I don't even know."*

Demo mode UI/UX is largely there. The data pipeline is the problem: incomplete EID/payment/evidence backfill, no Clio sandbox, no clean reset, ND uploads going to Luke's personal sandbox folder. The user can't reliably demo end-to-end today because too many "little things" silently fail.

This brief is the work programme to make demo mode something Cass or Alex could spin up in front of a client without prior agent intervention.

---

## 2. Current state — verified findings

### 2.1 Demo toggle and entry points

- File: [src/app/App.tsx](../../src/app/App.tsx) L212 — `demoModeEnabled` state, persisted to localStorage.
- File: [src/app/App.tsx](../../src/app/App.tsx) L1062 — `handleOpenDemoMatter()` sets `pendingMatterId = 'DEMO-3311402'` and navigates to matters tab.
- File: [src/components/command-centre/LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx) L231 — "Open Demo Matter" button (admin/dev only).
- File: UserBubble — "Demo mode" toggle persists `demoModeEnabled`.

### 2.2 Demo data sources are scattered

- File: [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts) L258 — `demoCases` (3 enquiries DEMO-ENQ-0001/0002/0003).
- File: [src/tabs/instructions/Instructions.tsx](../../src/tabs/instructions/Instructions.tsx) L3056 — `demoItem` (HLX-DEMO-00001 + deal + docs + EID).
- File: [src/tabs/instructions/Instructions.tsx](../../src/tabs/instructions/Instructions.tsx) ~L2900 — `effectiveIdVerificationOptions` with demo POID.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — `demoTimeMetrics` for WIP/fees/enquiry counts.
- File: [src/CustomForms/AnnualLeaveForm.tsx](../../src/CustomForms/AnnualLeaveForm.tsx) L493 — `demoLeaveRecords`.
- File: [src/tabs/reporting/ReportingHome.tsx](../../src/tabs/reporting/ReportingHome.tsx) — `buildDemoDatasets()`.
- File: [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — synthetic timeline.
- File: [src/components/modern/OperationsQueue.tsx](../../src/components/modern/OperationsQueue.tsx) — bank transfer + CCL date demo records.

### 2.3 Seed script exists but is incomplete

- File: [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) — seeds 3 cases across Instructions DB and Core Data DB. Coverage gaps:
  - Case 1 (DEMO-ENQ-0001): no `IdVerifications` record, no payment record.
  - Cases 1+2: no pitch emails, no call transcripts (CCL AI Fill has no evidence sources).
  - Demo Clio matter `3311402` exists in production Clio (not a sandbox).
  - ND uploads go to Luke's personal `4126-8772-0295` folder (shared dev workspace, not isolated).

### 2.4 `simulateDemoProcessing` bypasses Clio for opener but not for CCL

- File: [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx) L1845 — `simulateDemoProcessing()` runs all 22 processing steps with 100–300ms delays. Steps 11/12/15/17 (opponent, matter request, contact, matter creation) are simulated. **Steps 20/21/22 (CCL AI Fill, Draft CCL, ND upload) hit real endpoints against `DEMO-3311402`.**
- File: [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) — `isDemoRef()` guard handles HLX-DEMO-* and DEMO-3311402 inconsistently.

### 2.5 No reset mechanism

- No `?reset-demo=1` URL param exists.
- No "Reset Demo" button in command deck.
- Users must manually clear localStorage between demo runs.

### 2.6 Documentation hidden

- File: [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md) — exists but not linked from UI.

---

## 3. Plan

### Phase A — Data integrity (UNBLOCKER, ship first)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Complete seed script: EID for all 3 cases, payments, pitch emails, call transcripts | [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) | Idempotent (DELETE+INSERT or MERGE). Realistic field values: EID expiry > today, PEP/sanctions/address all `Pass` except deliberate Case 2 `Refer`. |
| A2 | Validation script | NEW [tools/db/validate-demo-data.mjs](../../tools/db/validate-demo-data.mjs) | Asserts every demo record has every field CCL pipeline needs. Exit 1 on missing. Run from CI + manually before demo. |
| A3 | Centralise demo fixtures | NEW [src/utils/demoData.ts](../../src/utils/demoData.ts) | Single source of `demoInstruction`, `demoPoids`, `demoDeals`, `demoCases`. All scattered consumers import from here. |
| A4 | Migration: scattered → centralised | various existing files | Rip out duplicate `demoCases`/`demoItem`/`effectiveIdVerificationOptions`, import from `demoData.ts`. |

**Phase A acceptance:**
- Validation script exits 0 against fresh seed.
- All 3 demo cases have full EID + payment + evidence backfill.
- Single source of truth for demo data; no duplicate copies.

### Phase B — Reset & state

#### B1. URL param reset

In [src/app/App.tsx](../../src/app/App.tsx) early useEffect: detect `?reset-demo=1`, clear localStorage keys (`demoModeEnabled`, `cclDraftCache.*`, all `helix.demo.*`), clear sessionStorage, then redirect to `?` (drop the param).

#### B2. Reset button in command deck

In [src/components/command-centre/LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx): add "Reset Demo State" button next to "Open Demo Matter". Clears localStorage + form drafts + cached CCL drafts for `DEMO-*` matterIds.

#### B3. Re-seed endpoint

New `POST /api/admin/demo/reseed` (admin-only) — runs `tools/db/seed-demo-matter.sql` server-side. Lets a non-dev admin reset DB state without SQL access.

### Phase C — Clio safety

#### C1. `CLIO_DRY_RUN_FOR_DEMO_REFS=1` flag

In [server/routes/clio-matters.js](../../server/routes/clio-matters.js) and [server/routes/clio-contacts.js](../../server/routes/clio-contacts.js): when flag set AND ref matches `^(HLX-DEMO|DEMO)-`, return synthetic Clio response without writing to real Clio. Telemetry: `Demo.Clio.WriteSkipped`.

#### C2. Pre-create labelled demo matter (manual one-off)

Document in runbook: create one Clio matter labelled "Helix Demo Matter — DO NOT EDIT" (different ID from production matter `3311402` which is Cass's real client). Demo writes go there. Lock down Clio permissions on it.

### Phase D — NetDocuments isolation

#### D1. Per-environment ND folders

Replace single `CCL_ND_UPLOAD_FOLDER` with `CCL_ND_UPLOAD_FOLDER_DEMO` and `CCL_ND_UPLOAD_FOLDER_PROD`. Demo refs route to `*_DEMO`. Document folder IDs in `docs/AZURE_OPERATIONS.md`.

#### D2. Per-user demo folders (optional)

Advanced: create one ND folder per admin user (LZ, AC, Cass) so concurrent demos don't collide. Defer until Phase D1 proves insufficient.

### Phase E — Discoverability

#### E1. Demo-mode chip in header

In [src/app/App.tsx](../../src/app/App.tsx) header: when `demoModeEnabled === true`, render a small "DEMO" chip next to user avatar. Click → opens demo controls.

#### E2. Walkthrough checklist

New component `src/tabs/home/DemoWalkthrough.tsx` — only renders when `demoModeEnabled`. Checklist: enquiry → matter open → CCL draft → ND upload → notification. Each step links to the right place.

#### E3. Link runbook from UI

Add "About Demo Mode" link in command deck pointing to [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md) (rendered via Hub markdown viewer).

### Phase F — Observability

- Telemetry events: `Demo.Mode.Enabled`, `Demo.Matter.Opened`, `Demo.Walkthrough.StepCompleted`, `Demo.Reset.Triggered`.
- KQL runbook entry: "Demo mode usage in last 30 days, by user".

---

## 4. Step-by-step execution order

1. **A1** (seed completion) — UNBLOCKER. Validates the demo can run at all.
2. **A2** (validation script) — runs against A1 output.
3. **A3+A4** (centralisation) — refactor, no behaviour change.
4. **B1+B2+B3** — reset mechanisms, all in one PR.
5. **C1** (Clio dry-run flag) — server-only.
6. **C2** (labelled demo matter) — manual ops task, document in runbook.
7. **D1** (env-split ND folders) — server-only.
8. **E1+E2+E3** — UI discoverability.
9. **F** — telemetry + runbook.

---

## 5. Verification checklist

**Phase A:**
- [ ] `node tools/db/validate-demo-data.mjs` exits 0 against fresh seed.
- [ ] All 3 demo cases pass full matter-opening pipeline including CCL generation.
- [ ] Grep finds no duplicate `demoCases`/`demoItem` definitions.

**Phase B:**
- [ ] `?reset-demo=1` clears state without page reload errors.
- [ ] Reset button in command deck restores fresh state.
- [ ] `POST /api/admin/demo/reseed` re-seeds DB successfully.

**Phase C:**
- [ ] With `CLIO_DRY_RUN_FOR_DEMO_REFS=1`, opening DEMO-* matter does not create Clio rows.
- [ ] Production Clio matter count unchanged after 5 demo runs.

**Phase D:**
- [ ] Demo CCLs land in `CCL_ND_UPLOAD_FOLDER_DEMO`, prod CCLs in `CCL_ND_UPLOAD_FOLDER_PROD`.

**Phase E:**
- [ ] DEMO chip visible when toggle on; hidden when off.
- [ ] Walkthrough checklist progresses correctly through all steps.
- [ ] Runbook link opens from command deck.

**Phase F:**
- [ ] All `Demo.*` events visible in App Insights.

---

## 6. Open decisions (defaults proposed)

1. **Demo Clio matter strategy** — Default: **C1 (dry-run flag) ships first; C2 (labelled real matter) is fallback if dry-run breaks Clio API contract validation**. Rationale: dry-run is reversible, labelled matter requires Clio coordination.
2. **Reset scope** — Default: **clears demo state only, never touches real user state**. Rationale: safety.
3. **Walkthrough mandatory?** — Default: **opt-in via toggle, hidden by default**. Don't force experienced users through it.
4. **DEMO chip placement** — Default: **header next to avatar, accent colour**. Visible without being intrusive.

---

## 7. Out of scope

- Replacing demo mode with feature-flag system (separate consideration).
- Negotiating Clio sandbox access (out of agent scope; ops decision).
- Multi-tenant demo (separate environments per demo session).
- Synthetic data generation via AI (use hand-curated fixtures for predictability).

---

## 8. File index (single source of truth)

Client:
- [src/app/App.tsx](../../src/app/App.tsx) — toggle, reset param (Phase B1, E1)
- [src/components/command-centre/LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx) — reset button (Phase B2)
- [src/utils/demoData.ts](../../src/utils/demoData.ts) (NEW) — centralised fixtures (Phase A3)
- [src/tabs/home/DemoWalkthrough.tsx](../../src/tabs/home/DemoWalkthrough.tsx) (NEW) — walkthrough (Phase E2)
- All scattered demo-data consumers (Phase A4)

Server:
- [server/routes/clio-matters.js](../../server/routes/clio-matters.js) — dry-run flag (Phase C1)
- [server/routes/clio-contacts.js](../../server/routes/clio-contacts.js) — dry-run flag (Phase C1)
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — env-split ND folders (Phase D1)
- [server/routes/admin/demo-reseed.js](../../server/routes/admin/demo-reseed.js) (NEW) — reseed endpoint (Phase B3)

Scripts / docs:
- [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) — Phase A1
- [tools/db/validate-demo-data.mjs](../../tools/db/validate-demo-data.mjs) (NEW) — Phase A2
- [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md) — runbook updates
- [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md) — ND folder env vars (Phase D1)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: demo-mode-hardening-production-presentable-end-to-end
verified: 2026-04-19
branch: main
touches:
  client:
    - src/app/App.tsx
    - src/components/command-centre/LocalDevSection.tsx
    - src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts
    - src/tabs/instructions/Instructions.tsx
    - src/tabs/home/Home.tsx
    - src/CustomForms/AnnualLeaveForm.tsx
    - src/tabs/reporting/ReportingHome.tsx
    - src/components/modern/CallsAndNotes.tsx
    - src/components/modern/OperationsQueue.tsx
    - src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx
    - src/tabs/instructions/MatterOpening/processingActions.ts
  server:
    - server/routes/clio-matters.js
    - server/routes/clio-contacts.js
    - server/routes/ccl-ops.js
  submodules: []
depends_on: []
coordinates_with:
  []
conflicts_with: []
```

---

## 9. Gotchas appendix

- The Luke Test instruction `HLX-27367-94842` is a **production health probe**, NOT a demo record. Never delete or modify it (per copilot-instructions.md).
- Matter `3311402` in production Clio is a real client matter that demo mode currently writes to. Do not delete or rename — coordinate with Cass before changing.
- The demo Clio matter ID is hardcoded in multiple places — search for `3311402` and `DEMO-3311402` before changing.
- `localStorage.clear()` would also wipe non-demo state (user prefs, recent items). Reset must use targeted `localStorage.removeItem` with explicit key list.
- The seed script uses `MERGE` in some places and `DELETE+INSERT` in others — make sure A1 keeps it idempotent throughout.
- Some demo data refs depend on each other (e.g. `effectiveIdVerificationOptions` references the demo prospect ID). Centralisation must preserve referential integrity.
