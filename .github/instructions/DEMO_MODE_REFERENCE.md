# Demo Mode Reference

Last verified: 2026-05-23

Demo mode is a **developer/stakeholder testing tool** toggled via the user bubble. It seeds synthetic data across the entire platform so any surface can be previewed without live data.

## Purpose

- Visualise any corner of the app without real data
- Show features to stakeholders during walkthroughs
- Test edge cases (EID review, risk pending, completed pipeline)
- Validate new UI sections render correctly

## Toggle

User bubble → "Demo mode" switch → persists to `localStorage('demoModeEnabled')`.

## Two demo tiers (read this first)

The platform has **two coexisting demo concepts**. They serve different purposes — do not conflate them.

| Tier | Anchor | What it does | When to use |
|------|--------|--------------|-------------|
| **Rehearsal Record** (real-fire) | `HLX-27367-94842` ("Helix Demo") + company variant `HLX-27367-11112011` | Real Clio / SQL / NetDocuments writes against a single canonical client owned by the firm. Engineered so CCL generation + Safety Net produce showcase-quality output. | Live demos to stakeholders. End-to-end walkthroughs that should look + behave like production. |
| **Demo Mode toggle** (synthetic) | `localStorage.demoModeEnabled` + decorative fixtures | Seeds `Demo · ` labelled mocks across aggregate tiles (time metrics, leave, OperationsQueue) and adds matter-opening auto-skip behaviours (`DEMO-3311402`). Does not write to backends. | Previewing tile shapes / states without affecting real data. Walking the matter-opening wizard with a simulated EID outcome. |

Both can be on at once. The rehearsal record stays real even when Demo Mode is toggled.

Brief: [docs/notes/HELIX_REHEARSAL_RECORD_LUKE_TEST_AS_FIRM_SEED.md](../../docs/notes/HELIX_REHEARSAL_RECORD_LUKE_TEST_AS_FIRM_SEED.md).

## Reset Demo (CommandDeck → LZ/AC only, when Demo Mode is on)

The "Reset demo" chip in the CommandDeck strip:

1. Sets `demoModeEnabled = false` (so the next gesture plays the fresh-sweep anim).
2. Clears `localStorage` keys `demoModeEnabled`, `cclDraftCache.*`, `helix.demo.*`, plus matching `sessionStorage`.
3. Calls `POST /api/dev/reseed-rehearsal` — runs `scripts/seed-rehearsal-record-sql.mjs --confirm` server-side.
4. After the reseed, busts `unified:data:*` + `unified:enquiries:*` Redis caches and the in-process memory cache, then SSE-broadcasts `enquiries.changed { changeType: 'invalidate' }`. Connected clients refetch in ~400ms.
5. Toasts "Demo reset · seed reaffirmed".

If you ran the seed from a terminal instead of the chip, the script also pings `POST /api/dev/invalidate-enquiries` so the dev server's caches are busted the same way (silent no-op when the dev server is not running).

The "About demo mode" chip next to it opens this runbook via `GET /api/dev/demo-reference` (so it works without GitHub auth).

## Production-safety env flags

These gate the rehearsal/demo refs (`HLX-27367-*`, `DEMO-*`, `HLX-DEMO-*`) at the server boundary. Defined in `.env.example`.

| Flag | Default | Effect when truthy (`1`/`true`/`yes`/`on`) |
|------|---------|---------------------------------------------|
| `CLIO_DRY_RUN_FOR_REHEARSAL_REFS` | unset | `/api/clio-contacts` and `/api/clio-matters` short-circuit on rehearsal/demo refs and return synthetic `{ dryRun: true }` payloads. Emits `Demo.Clio.WriteSkipped` to App Insights. **Set to `1` locally for safe demos. Leave unset in production unless you really want demo refs muted.** |
| `CCL_ND_UPLOAD_FOLDER_REHEARSAL` | unset | Rehearsal/demo refs route CCL uploads here. Emits `Demo.ND.RouteSwitched` whenever used. |
| `CCL_ND_UPLOAD_FOLDER_PROD` | unset | Real-client refs route CCL uploads here. |
| `CCL_ND_UPLOAD_FOLDER` | unset | Legacy single-folder fallback if either of the above is missing (back-compat). |

Telemetry events to watch:

- `Demo.Mode.Enabled`, `Demo.Mode.Disabled`, `Demo.Reset.Triggered` — client-side, via `trackClientEvent('Demo', ...)`.
- `Demo.Clio.WriteSkipped`, `Demo.ND.RouteSwitched` — server-side.
- All rehearsal-ref telemetry carries `customDimensions.seed == 'rehearsal'` (Phase A8 middleware).

## What Demo Mode Seeds

| Surface | Source File | Data Seeded |
|---------|------------|-------------|
| Enquiry cards (3 cases) | `Enquiries.tsx` (line ~800) | 3 demo enquiries at different pipeline stages |
| Workbench (per case) | `Enquiries.tsx` (line ~850) | instruction, deal, payments, riskAssessments, documents, EID, clients, matters |
| Instruction card | `Instructions.tsx` (`demoItem`) | Full instruction with deal, payments, documents, risk, idVerifications, EID |
| Demo POID | `Instructions.tsx` (`effectiveIdVerificationOptions`) | Full POID with address, passport, DOB, nationality, EID results, check expiry |
| EID simulation | `Instructions.tsx` (`DemoEidSimConfig`) | Configurable outcome (pass/review/fail/manual-approved), PEP, address results |
| Timeline | `EnquiryTimeline.tsx` (line ~2924) | Full synthetic timeline with milestones, emails, calls |
| Enrichment | `Enquiries.tsx` (line ~3846) | Teams data + pitch data per case |
| Home metrics | `Home.tsx` (`demoTimeMetrics`) | WIP, fees, enquiry counts |
| Annual leave | `AnnualLeaveForm.tsx` (line ~481) | 5 demo leave records in various states |
| Reporting | `ReportingHome.tsx` (`buildDemoDatasets`) | Stub WIP + recovered fees |
| Attendance | `PersonalAttendanceConfirm.tsx` | Prevents real writes in demo |

## Demo Cases (Enquiries)

After Phase B (2026-05-06) the early-stage card is **the rehearsal record** itself; the mid/complete cards remain as decorative decoys (`Demo · ` labelled, never written to backends).

| Case | ID | Stage | EID | Risk | Payment | Documents |
|------|----|-------|-----|------|---------|-----------|
| 1 (real-fire) | `HLX-27367-94842` (Helix Demo) | from live SQL | Pass | Low–Medium | yes | yes |
| 2 (decoy) | `DEMO-ENQ-0002` · `Demo · Lease renewal` | proof-of-id | Refer/Review | none | no | 1 |
| 3 (decoy) | `DEMO-ENQ-0003` · `Demo · Employment tribunal` | matter-opened | Pass | Low Risk | yes | 3 |

## Demo Instruction (Instructions tab)

Phase B repointed the Matters tab `DEMO_MATTER` to resolve to the rehearsal record's real Clio matter when one exists, falling back to the synthetic `HLX-DEMO-00001` only if no real matter has been opened yet. The synthetic instruction (`HLX-DEMO-00001`) still ships as the offline / dev-disconnect fallback so previewing the Instructions tab without a server is still possible: Test Client, Demo Co Ltd, Commercial/Contract Dispute, full address, passport, payment (£2,500), 2 documents, Standard risk (score 12), EID configurable via `DemoEidSimConfig`.

## Demo POID

ID: `DEMO-POID-001`. Full fields: name, DOB, nationality, passport number, personal + company address, EID check result, PEP/sanctions, address verification, check expiry, terms acceptance, id_docs_folder.

## CRITICAL: Keeping Demo Data Current

**Every new feature that displays data on any surface must also update demo mode.**

When adding new fields or sections:

1. **Check if the field exists in demo data.** Search for `isDemo`, `demoItem`, `demoCases`, `DEMO-` in the relevant source files.
2. **Add the field to EVERY demo data source that feeds the surface.** A field on the review page needs data in: `demoItem` (Instructions.tsx), `effectiveIdVerificationOptions` (Instructions.tsx), and `demoCases` workbench (Enquiries.tsx).
3. **Use realistic values.** Demo data should look like production — real-format passport numbers, proper addresses, plausible dates.
4. **Test all 3 cases.** Case 1 (early/empty), Case 2 (mid/partial), Case 3 (complete/full) should each show appropriate states.
5. **Don't forget sub-arrays.** `payments`, `documents`, `riskAssessments`, `idVerifications` are nested arrays on the parent item, not the instruction sub-object.

### Checklist for New Features

```
□ Does this feature display data? → Add to demo sources
□ Is the data from POID? → Update demo POID in effectiveIdVerificationOptions
□ Is the data from instruction records? → Update demoItem in tableOverviewItems
□ Is the data from workbench? → Update demoCases in Enquiries.tsx
□ Is the data on Home/Reporting? → Update demoTimeMetrics/buildDemoDatasets
□ Does the feature have multiple states? → Ensure each case covers a different state
```

### Field Inventory (must stay in sync)

When these fields exist on real data, they MUST also exist on demo data:

**POID fields:** `poid_id`, `type`, `terms_acceptance`, `id_docs_folder`, `first`, `last`, `prefix`, `email`, `best_number`, `nationality`, `date_of_birth`, `gender`, `passport_number`, `drivers_license_number`, `house_building_number`, `street`, `city`, `county`, `post_code`, `country`, `company_name`, `company_number`, `stage`, `check_result`, `pep_sanctions_result`, `address_verification_result`, `check_expiry`, `check_id`, `submission_date`

**Instruction sub-arrays:** `payments[]` (payment_status, internal_status, amount, created_at, payment_id), `documents[]` (FileName, DocumentType, FileSizeBytes, UploadedAt), `riskAssessments[]` (RiskAssessmentResult, RiskScore, RiskAssessor, ComplianceDate, TransactionRiskLevel), `idVerifications[]` (IsLeadClient, EIDOverallResult, EIDCheckId, EIDStatus, PEPAndSanctionsCheckResult, AddressVerificationResult, CheckExpiry)

**Workbench client fields:** `Email`, `ClientEmail`, `FirstName`, `LastName`, `Nationality`, `DOB`, `Phone`, `PassportNumber`, `HouseNumber`, `Street`, `City`, `County`, `Postcode`, `Country`

---

## Matter Opening Demo Flow (Inline Workbench)

When `demoModeEnabled` is true and a matter opening form is rendered (either from Instructions tab or Enquiries tab), the following auto-behaviours kick in to create a zero-friction walkthrough.

### Prop Threading

`demoModeEnabled` must reach every component that has auto-behaviour. The chain:

```
Instructions.tsx / EnquiryTimeline.tsx
  → InlineWorkbench.tsx (demoModeEnabled prop)
    → FlatMatterOpening.tsx (demoModeEnabled prop)
      → OpponentDetailsStep.tsx (demoModeEnabled prop)
      → PoidSelectionStep.tsx (demoModeEnabled + onDemoEidResult props)
        → IdentityConfirmationCard.tsx (demoModeEnabled + onDemoEidResult props)
      → ConflictConfirmationCard.tsx (demoModeEnabled prop)
```

**Two entry paths** — Instructions tab wires it via `InstructionTableView → InlineWorkbench`; Enquiries tab wires it via `EnquiryTimeline → InlineWorkbench`. Both must pass the prop.

### Auto-behaviours

| Step | Component | What happens in demo | Mechanism |
|------|-----------|---------------------|-----------|
| Form prefill | `FlatMatterOpening` | All fields pre-populated (area, practice area, partner, dispute value, etc.) | Single `useEffect` on `[instructionRef, demoModeEnabled]` |
| Conflict check | `ConflictConfirmationCard` | Auto-confirms "no conflict" | `useEffect` calls `onConflictStatusChange(true)` |
| Opponent details | `OpponentDetailsStep` | Auto-selects "I'll add details later" | `useEffect` sets `enterOpponentNow(false)` + `opponentType('Company')` |
| EID verification | `IdentityConfirmationCard` | Shows inline Pass/Review/Fail buttons instead of opening modal | Conditional render when `demoModeEnabled && pending` |
| EID result overlay | `FlatMatterOpening` | `demoEidOverride` state overlays onto `displayPoidData` | `useMemo` merges override with `effectivePoidData` |

### Pattern for Adding New Auto-Skip Steps

If you add a new interactive step to matter opening that requires user confirmation:

1. Accept `demoModeEnabled` as a prop on the step component
2. Add a `useEffect` that auto-completes the step when `demoModeEnabled` is true
3. Ensure `FlatMatterOpening` passes `demoModeEnabled` to your component
4. Update this table
