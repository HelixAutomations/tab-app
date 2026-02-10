# InlineWorkbench Pipeline Audit

> **Created**: 4 February 2026  
> **Purpose**: Track pipeline functionality migration from Clients space to InlineWorkbench  
> **Status**: 🔄 In Progress

---

## Executive Summary

The pipeline experience has been consolidated from a separate "Clients" space into `InlineWorkbench.tsx`. This document tracks what's implemented, what's missing, and outstanding work items.

**File**: `src/tabs/instructions/InlineWorkbench.tsx` (6055 lines)

---

## ✅ Implemented Features

### Pipeline Navigation

| Feature | Status | Notes |
|---------|--------|-------|
| Timeline Stage Chips | ✅ Complete | Enquiry → Pitch → Instructed → ID → Pay → Risk → Matter → Docs |
| Context Stage Switching | ✅ Complete | Click Enquiry/Pitch/Instructed to toggle view |
| Tab Stage Navigation | ✅ Complete | Click ID/Pay/Risk/Matter/Docs to switch tabs |
| Stage Completion Indicators | ✅ Complete | Green lit connector when previous stage complete |
| External Enquiry Navigation | ✅ Complete | Dispatches `navigateToEnquiries` event |

### Tabs

| Tab | Status | Key Features |
|-----|--------|--------------|
| **Details** | ✅ Complete | Context-aware: shows Enquiry/Pitch/Instructed views based on active stage |
| **Identity** | ✅ Complete | EID results, trigger verification, approve/request docs modals |
| **Payment** | ✅ Complete | Payment records, bank confirmation, Stripe link (localhost only) |
| **Risk** | ✅ Complete | Risk display, embedded RiskAssessmentPage modal |
| **Matter** | ✅ Complete | Matter data bar, client/description section, Clio MatterID |
| **Documents** | ✅ Partial | Document list with preview — no upload capability |

### Modals

| Modal | Status | Trigger |
|-------|--------|---------|
| EID Action Picker | ✅ Implemented | Click EID result with review/failed status |
| Approve Verification | ✅ Implemented | "Approve" button in action picker |
| Request Documents | ✅ Implemented | "Request Documents" button — drafts email |
| Trigger EID Confirm | ✅ Implemented | "Run ID Verification" button |
| Risk Assessment | ✅ Implemented | "Complete Assessment" button — embeds RiskAssessmentPage |
| Matter Opening | ✅ Implemented | "Open Matter" button — embeds FlatMatterOpening wizard via portal |
| Payment Link | ✅ Implemented | "Create payment link" — localhost only |

### Callback Props

| Prop | Status | Purpose |
|------|--------|---------|
| `onDocumentPreview` | ✅ Wired | Preview document from Documents tab |
| `onOpenRiskAssessment` | ⚠️ No-op | Not used — risk handled locally via portal modal |
| `onOpenMatter` | ⚠️ No-op | Not used — matter handled locally via portal modal (FlatMatterOpening) |
| `onTriggerEID` | ✅ Wired | Starts EID verification flow |
| `onOpenIdReview` | ⚠️ Prop exists | Available for external ID review modal |
| `onConfirmBankPayment` | ✅ Wired | Confirms bank transfer with date |
| `onClose` | ✅ Wired | Closes workbench |
| `onRiskAssessmentSave` | ✅ Wired | Callback after risk saved |

---

## ⚠️ Partial Implementations

### Payment Link (Production Gated)

**Location**: Lines 1696-1710  
**Issue**: Payment link creation only available when `window.location.hostname` is `localhost` or `127.0.0.1`

```typescript
const isLocalEnv = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
```

**Decision**: Intentional — Stripe test mode safety guard. Enable for production when ready.

---

### Request Documents Email Override

**Location**: Line 4590  
**Issue**: TODO comment indicates email override values captured but not passed to API

```typescript
// TODO: Pass toEmail and emailOverrideCc to the API
```

**Action Required**: Update API call to include `toEmail` and `emailOverrideCc` state values.

---

## ❌ Gaps / Missing Features

### 1. Document Upload

**Current State**: Documents tab only shows preview capability  
**Missing**: No upload functionality in InlineWorkbench  
**Location**: Lines 4950-5070  
**Priority**: Medium — users may expect to upload docs inline

---

### 2. "Open in Clio" CTA

**Current State**: Matter tab shows Clio MatterID but no deep-link  
**Missing**: Button to open matter directly in Clio  
**Location**: Lines 5350-5530  
**Priority**: Low — easy add, nice UX improvement

---

### 3. IDVerificationReviewModal Override Feature

**Current State**: Inline Identity tab has Approve/Request Docs  
**Missing**: Full `onOverride` capability from IDVerificationReviewModal  
**Details**: The full modal (1619 lines) has individual check override; inline only has bulk approve  
**Priority**: Low — most cases covered by current flow

---

### 4. EIDCheckPage Manual Entry Mode

**Current State**: Inline only triggers EID from existing instruction data  
**Missing**: Manual identifier/email entry for edge cases  
**Location**: `src/tabs/instructions/EIDCheckPage.tsx` (standalone page)  
**Priority**: Low — edge case for manual ID entry

---

### 5. Joint Client Display

**Current State**: Single client display in Details tab  
**Component Exists**: `JointClientCard.tsx`  
**Missing**: Integration for joint purchase scenarios  
**Priority**: Low — only needed for joint purchases

---

## 🔍 Verification Checklist

Run these checks before marking complete:

- [ ] **Pipeline chips clickable at all stages** — Not just "next" stage
- [ ] **Enquiry stage navigates correctly** — Opens in Enquiries tab
- [ ] **Pitch stage shows pitch data** — Amount, service, status
- [ ] **Instructed stage shows instruction data** — Ref, dates, stage
- [ ] **Identity tab runs EID** — Trigger → Results → Approve/Request
- [ ] **Payment tab shows records** — Expand details, confirm bank
- [ ] **Risk tab opens assessment** — Complete → Edit → Save
- [ ] **Matter tab opens wizard** — Via onOpenMatter callback
- [ ] **Documents tab previews** — Via onDocumentPreview callback

---

## Related Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `InlineWorkbench` | `src/tabs/instructions/InlineWorkbench.tsx` | Main workbench (this file) |
| `FlatMatterOpening` | `src/tabs/instructions/FlatMatterOpening.tsx` | Matter opening wizard (5022 lines) |
| `EIDCheckPage` | `src/tabs/instructions/EIDCheckPage.tsx` | Standalone EID page with manual mode |
| `IDVerificationReviewModal` | `src/components/modals/IDVerificationReviewModal.tsx` | Full ID review modal (1619 lines) |
| `RiskAssessmentPage` | `src/tabs/instructions/RiskAssessmentPage.tsx` | Embedded risk form |
| `InstructionTableView` | `src/tabs/instructions/InstructionTableView.tsx` | Uses InlineWorkbench in expanded rows |

---

## Quick Wins

| Enhancement | Effort | Impact | Status |
|-------------|--------|--------|--------|
| Add "Open in Clio" button to Matter tab | 5 min | Better UX | ⬜ Not started |
| Visual tweak: incomplete stage chips more obviously clickable | 10 min | Clarifies navigation | ⬜ Not started |
| Fix email override TODO | 15 min | Complete feature | ⬜ Not started |
| Add inline IDVerificationReviewModal tray option | 30 min | Deeper ID review | ⬜ Not started |

---

## Product Guardrails (DO NOT BREAK)

| Rule | Description |
|------|-------------|
| **Luke Test** | `HLX-27367-94842` is production health indicator — never delete |
| **ID pills** | Must call `onEIDClick()` — no detail expansion |
| **Risk colours** | Must use `RiskAssessmentResult` — not `TransactionRiskLevel` |
| **Deal capture emails** | Must go to both `lz@helix-law.com` and `cb@helix-law.com` |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-04 | Initial audit document created | Copilot |
| 2026-02-04 | Matter tab redesigned (pitch-style layout) | Copilot |
| 2026-02-04 | Risk tab redesigned (chips + Q&A grid) | Copilot |
| 2026-02-04 | Fixed matters data flow from Matters table | Copilot |
| 2026-02-04 | Fixed pipeline chips always clickable (EnquiryTimeline.tsx) | Copilot |
| 2026-02-06 | EID runs inline in prospects — no navigation to Clients tab | Copilot |
| 2026-02-06 | Added processing state, readiness checklist, toasts, auto-refresh to EID flow | Copilot |
| 2026-02-06 | Portal fix for EID confirmation modal (was clipped by overflow/transform) | Copilot |
| 2026-02-06 | Risk assessment: portal-wrapped modal, auto-refresh via onRefreshData, processing pill state, parent toast on save | Copilot |
| 2026-02-06 | Removed navigation dispatch for onOpenRiskAssessment — risk stays inline in prospects | Copilot |
| 2026-02-06 | ID review: portal-wrapped EID action picker, approve, request docs modals; approve calls onRefreshData + toast; onOpenIdReview no-op'd | Copilot |
| 2026-02-06 | Demo mode: added DEMO-ENQ-0002 at proof-of-id (EID Refer), DEMO-ENQ-0003 fully complete; enriched EID records with realistic fields | Copilot |

---

## Notes

- "Clients" as a separate space doesn't exist — it was conceptual filtering of "instructed" stage items
- Pipeline navigation works via context stage chips (enquiry/pitch/instructed) + tab chips (id/pay/risk/matter/docs)
- Matter opening triggers full-page `FlatMatterOpening` wizard — not inline
- POID selection happens inside matter opening wizard, not as standalone page
