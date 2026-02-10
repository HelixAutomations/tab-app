# Demo Mode Reference

Demo mode is a **developer/stakeholder testing tool** toggled via the user bubble. It seeds synthetic data across the entire platform so any surface can be previewed without live data.

## Purpose

- Visualise any corner of the app without real data
- Show features to stakeholders during walkthroughs
- Test edge cases (EID review, risk pending, completed pipeline)
- Validate new UI sections render correctly

## Toggle

User bubble → "Demo mode" switch → persists to `localStorage('demoModeEnabled')`.

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

| Case | ID | Stage | EID | Risk | Payment | Documents |
|------|----|-------|-----|------|---------|-----------|
| 1 (early) | `DEMO-ENQ-0001` | enquiry | pending | none | no | 0 |
| 2 (mid) | `DEMO-ENQ-0002` | proof-of-id | Refer/Review | none | no | 1 |
| 3 (complete) | `DEMO-ENQ-0003` | matter-opened | Pass | Low Risk | yes | 3 |

## Demo Instruction (Instructions tab)

Ref: `HLX-DEMO-00001`. Includes: Test Client, Demo Co Ltd, Commercial/Contract Dispute, full address, passport, payment (£2,500), 2 documents (Passport_Scan.pdf, Engagement_Letter_Signed.pdf), Standard risk (score 12), EID configurable via DemoEidSimConfig.

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
