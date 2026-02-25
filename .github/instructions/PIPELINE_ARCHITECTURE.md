# Pipeline Architecture — Prospect to Portal

> The end-to-end product pipeline. How a website visitor becomes a managed matter with a client-facing portal. Every space, every handshake, every data table that bridges them.

---

## Spaces (Tabs)

Hub has five main tabs. Three carry the pipeline:

| Tab key | User-facing label | Icon | Purpose |
|---------|------------------|------|---------|
| `enquiries` | **Prospects** | `FaInbox` | Inbound enquiries — claim, pitch, qualify |
| `instructions` | **Clients** | `FaClipboardList` | Compliance + onboarding — ID, payment, risk, matter opening |
| `matters` | **Matters** | `FaFolderOpen` | Live matter visibility — WIP, CCL, pipeline review |

Also: `home` (dashboard), `reporting` (Reports — admin), `forms` (disabled), `resources` (disabled).

Tab routing lives in [src/app/App.tsx](src/app/App.tsx) `renderContent()` (~line 910). The `activeTab` state drives which space renders. Cross-tab navigation uses localStorage keys (e.g. `PROSPECTS_INSTRUCTION_REF_KEY`) and `pendingMatterId` prop for deep-linking after matter opening.

---

## The Pipeline — Stage by Stage

### Stage 1: Prospect Arrives

**Trigger**: Website CTA form → `enquiry-processing-v2` (.NET 8, Azure App Service).

**What happens**:
1. `CtaController` receives form POST (contact details, Q&A, documents)
2. `EnquiryService.CreateEnquiryAsync()`:
   - **Writes** to `enquiries` table (Core Data DB)
   - **Posts Adaptive Card** to Teams channel (routed by area of work + triage rules)
   - Syncs to ActiveCampaign
3. Teams card shows **Claim and Respond** + **Manage** buttons

**Hub side**: `/api/enquiries-unified` merges both DBs (Instructions + Core Data), deduplicates, normalises. Supports SSE streaming and pulse checks for real-time updates.

**Key files**:
- Submodule: `submodules/enquiry-processing-v2/Controllers/CtaController.cs`
- Server route: `server/routes/enquiries-unified.js`
- Normaliser: `src/utils/normalizeEnquiry.ts`

---

### Stage 2: Claim and Qualify (Prospects Space)

**Component hierarchy**:
```
Enquiries.tsx (~11,349 lines — "Prospects" container)
├── SegmentedControl: Claimed | Claimable | Triaged
├── FilterBanner / IconAreaFilter / SearchBox
├── AreaCountCard (area-of-work breakdown)
├── [Claimed view]
│   └── ClaimedEnquiryCard.tsx
│       ├── EnquiryBadge, TeamsLinkWidget, PitchScenarioBadge
│       ├── PitchBuilder (inline pitch composition)
│       └── InlineWorkbench ← bridges into Instructions pipeline
├── [Claimable view]
│   └── UnclaimedEnquiries.tsx → NewUnclaimedEnquiryCard.tsx
│       └── Claim button (useClaimEnquiry hook)
├── [Selected detail panel]
│   ├── EnquiryOverview.tsx (rating, client history)
│   ├── EnquiryDetails.tsx (full editable form)
│   ├── EnquiryTimeline.tsx (activity ledger + timeline)
│   └── PitchBuilder.tsx
```

**Claim flow** (two paths, same outcome):
- **Teams card**: Fee earner clicks Claim → `BotController.HandleMessagebackAction()` → updates SQL (`Point_of_Contact`, `Claim`, `Stage`) + updates card visually + DM notification
- **Hub UI**: `useClaimEnquiry` → `POST /api/claim-enquiry` → Hub server calls `POST ${ENQUIRY_PLATFORM_BASE_URL}/api/hub-claim` → same SQL + Teams card update

**Key state**: `activeState` toggle (`'Claimed' | 'Claimable' | 'Triaged'`). Claimed = filtered to current user (or all in admin mode). Unclaimed = `Point_of_Contact === 'team@helix-law.com'`.

**Cross-space bridge**: `ClaimedEnquiryCard` embeds `InlineWorkbench` when an instruction is linked. This means the Prospects space already shows instruction pipeline status (ID, payment, risk, matter) without switching tabs.

---

### Stage 3: Instruct and Comply (Clients Space)

**Component hierarchy**:
```
Instructions.tsx (~8,682 lines — "Clients" container)
├── FilterBanner / SegmentedControl / TwoLayerFilter
├── [Tab: Clients] (default)
│   ├── InstructionTableView.tsx (~2,607 lines — table with inline expansion)
│   │   └── InlineWorkbench.tsx (~6,286 lines — the core detail panel)
│   └── InstructionCard.tsx (~3,269 lines — card layout alt)
├── [Tab: Pitches]
│   └── DealCard.tsx (~618 lines)
├── [Tab: Risk] (localhost only)
│   └── RiskComplianceCard.tsx
├── Sub-pages
│   ├── FlatMatterOpening.tsx (~5,673 lines)
│   ├── RiskAssessmentPage.tsx, EIDCheckPage.tsx
│   └── DocumentsV3.tsx / DocumentEditorPage.tsx (CCL drafting)
```

**InlineWorkbench** is the nerve centre of this space. 6 tabs:

| Tab | Purpose | Data source |
|-----|---------|-------------|
| `details` | Client info, context stage switching (enquiry/pitch/instructed) | Instructions, Deals, enquiries |
| `identity` | EID verification (Tiller), approve/request docs | `/api/verification-details`, IdVerifications table |
| `payment` | Payment tracking, bank transfer confirmation, payment link creation | Instructions.InternalStatus, payment records |
| `risk` | Risk assessment (7 dimensions), compliance checkboxes | RiskAssessmentResult field |
| `matter` | Matter opening wizard (FlatMatterOpening) | Clio API, Matters table |
| `documents` | CCL drafting (DocumentsV3) | CclDrafts table, templates |

**Context stage switching**: The workbench has 3 context chips: `enquiry | pitch | instructed`. Each switches the field resolution source so the same panel can show the enquiry data, the pitch/deal data, or the instruction data for the same person.

**Pipeline chips** (tracked per instruction in `InstructionTableView`):

| Chip | Complete when | Review when |
|------|--------------|-------------|
| ID | `EIDOverallResult` = passed/approved | failed/rejected |
| Payment | `InternalStatus === 'paid'` or succeeded payments | processing |
| Risk | `RiskAssessmentResult` = low/pass/approved | any other value |
| Matter | `MatterId` exists or `matters[]` populated | — |
| Documents | Document count > 0 | — |

**Deals**: A `Deal` is a pitched opportunity (Deals table). Fields: `DealId`, `ProspectId`, `Passcode`, `Amount`, `ServiceDescription`, `InstructionRef`. The Pitches tab shows these.

---

### Stage 4: Matter Opening (21-Step Pipeline)

Triggered from InlineWorkbench's `matter` tab. `FlatMatterOpening.tsx` runs a multi-step wizard then executes 21 sequential API actions:

| # | Action | Creates/Updates |
|---|--------|-----------------|
| 1–2 | ActiveCampaign auth | Token retrieval + refresh |
| 3–6 | Clio auth | Client ID, secret, refresh token, access token (per-user from Key Vault) |
| 7–10 | Asana auth | Client ID, secret, refresh token, access token (from userData) |
| 11 | Opponent details | → INSERT `Opponents` table |
| 12 | Matter request | → INSERT `Matters` table (Status=`MatterRequest`, placeholder UUID) + INSERT opponents |
| 13–14 | Stubs | AC contact sync + DB sync (placeholder/future) |
| 15 | Clio contact | → CREATE/UPDATE Clio contact (Person + Company) → `clientIdCallback` |
| 16–17 | Stubs | NetDocuments workspace + DB sync (placeholder/future) |
| 18 | **Clio matter** | → CREATE Clio matter, link contacts → returns `matterId` + `displayNumber` |
| 19 | **DB sync** | → UPDATE `Instructions` with `ClientId`/`MatterId` + PATCH `Matters` row with real Clio IDs |
| 20 | CCL AI fill | → POST `/api/ccl-ai/fill` → AI-populates CCL fields |
| 21 | Draft CCL | → POST `/api/ccl` → generates draft .docx → returns URL |

**Key files**:
- Wizard: `src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx`
- Actions: `src/tabs/instructions/MatterOpening/processingActions.ts`
- Config: `src/tabs/instructions/MatterOpening/config.ts` (StepKeys, practice areas, partners)
- Visual tracker: `src/tabs/instructions/MatterOpening/ProcessingSection.tsx`

**After completion**: `pendingMatterId` prop deep-links into the Matters tab.

---

### Stage 5: Matter Management (Matters Space)

**Component hierarchy**:
```
Matters.tsx (~1,525 lines — container)
├── StatusFilter (Open / Archived), RoleFilter (Responsible / Originating)
├── ScopeControl (Mine / All), AreaFilter, SearchBox
├── Pivot tabs: Overview | Activities* | Documents* | Comms* | Billing* (* disabled)
├── MatterTableView.tsx (~952 lines — sortable, date-grouped)
└── MatterOverview.tsx (~1,843 lines — detail panel when selected)
    ├── NextStepChip strip ("Prepare Client Care Letter")
    ├── PipelineSection → InlineWorkbench (8-stage pipeline, read-only)
    ├── Metrics grid: WIP | Outstanding | Client Funds | Total Hours
    ├── Time Breakdown (billable vs non-billable bar)
    ├── Matter Details (practice area, description, instruction ref, team)
    ├── Client sidebar (Clio contact data)
    └── CCLEditor overlay (3-step AI-driven CCL)
```

**Data sources**: Matters receive data as props from `App.tsx`. Two data sources via `dataSource` field:
- `legacy_all` / `legacy_user` — Clio API
- `vnet_direct` — VNet pipeline (instruction-linked)

Pipeline-linked matters (`vnet_direct` + valid `InstructionRef`) display the full InlineWorkbench with 8 stages.

**Enrichment**: `workbenchByInstructionRef` map (passed from App) provides instruction/deal/enquiry data for each matter. `mattersWithClient` memo enriches matters by looking up `InstructionRef`.

**Live metrics** (on-demand when matter selected):
- WIP: `GET /api/matter-metrics/wip` → billable/non-billable amounts + hours
- Funds: `GET /api/matter-metrics/funds` → client funds on account
- Outstanding: `GET /api/outstanding-balances/user/:entraId` → total outstanding

**Currently read-only**: The Matters tab displays but doesn't mutate. Server routes for updates exist (`PUT /api/matter-operations/matter/:matterId`) but no frontend calls them.

---

### Stage 6: Client Care Letters (Spans Instructions + Matters)

Two CCL editors exist, converging on the same backend:

| Feature | Instructions-side | Matters-side |
|---------|------------------|-------------|
| Component | `DocumentEditorPage.tsx` | `src/tabs/matters/ccl/CCLEditor.tsx` |
| Approach | Flat text editor + token insertion panel | 3-step structured: Questionnaire → Editor → Preview |
| AI fill | No | Yes (`/api/ccl-ai/fill` → Azure OpenAI) |
| Upload | Manual | Clio upload (3-step presigned URL), ND stub |
| Schema | `cclSchema.js` (legacy) | `cclSections.ts` (modern, 5 sections, ~35 fields) |
| Status | Older, used during/after opening | **Production flow** — admin sees NextStepChip |

**Backend pipeline** (5 route files):

| Route | Endpoints | Purpose |
|-------|-----------|---------|
| `ccl.js` | CRUD | Generate .docx, save/load drafts |
| `ccl-ai.js` | AI fill | 6 data sources → Azure OpenAI → filled fields |
| `ccl-ops.js` | Operations | Clio upload, ND stub, support tickets, version reconstruction |
| `ccl-admin.js` | Admin dashboard | Aggregate stats, trace history |
| `ccl-date.js` | Bulk update | Clio "CCL Date" custom field sync |

**Storage**: `CclDrafts` (SQL) + `CclContent` (SQL, versioned) + `logs/ccl-drafts/` (file cache) + `logs/ccl-outputs/` (generated .docx).

**Template engine**: `src/shared/ccl/` re-exports from `src/tabs/instructions/templates/cclTemplate.ts` + `fieldMetadata.ts` + `templateUtils.ts`. Server uses `docx-templates` + Raleway font injection via `server/utils/wordGenerator.js`.

---

### Stage 7: Client-Facing Portal (instruct-pitch Submodule)

The Matter Portal at `submodules/instruct-pitch/apps/pitch/` is the **client surface** — what the end client sees.

**Frontend** (`MatterPortal.tsx`, ~2,154 lines):
- Overview mode: folder grid of all matters
- Detail mode: documents section + checklist section + contact modals
- `ChecklistSection`: 6 debt-recovery stages including "Letter of Claim" (litigation milestone, NOT CCL)
- `CurrentSnapshot` display: `.mp-snapshot-block` with "Current Position" heading + narrative text

**Backend** (`matter-portal.js`):
- Reads from **same `Instructions` DB** as Hub
- SQL: `SELECT m.*, i.FirstName, i.LastName, ... m.CurrentSnapshot` from `Matters JOIN Instructions`
- Blob storage: `instruction-files/matters/{passcode}/{matterId}/...`
- Self-service: `POST /matter-portal/new-instruction` → INSERT `Deals` (client requests new matter)

**Shared data tables** (Hub writes, Portal reads):

| Table | Hub writes | Portal reads | Portal writes |
|-------|-----------|-------------|---------------|
| `Matters` | INSERT (opening), UPDATE (Clio IDs, status, CCL dates) | All columns incl `CurrentSnapshot`, `RecoveryStage` | — |
| `Instructions` | UPDATE (`ClientId`, `MatterId`) | `FirstName`, `LastName`, `Email`, `CompanyName`, `Stage` | — |
| `Deals` | — | `Passcode`, `InstructionRef`, `PitchedBy`, `AreaOfWork` | INSERT (self-service) |
| `Opponents` | INSERT | `OpponentID`, names | — |
| `MatterChecklist` | — (migration script creates) | `StageKey`, `IsComplete`, `CompletedDate` | — |
| `IDVerifications` | — | `EIDOverallResult`, `EIDStatus`, `CheckExpiry` | — |
| Blob: `instruction-files` | Instruction-time uploads | Matter-phase documents | Client uploads |

---

## Cross-Space Connections

### Prospects ↔ Clients (continuous, not a handoff)

The InlineWorkbench appears in **both** spaces. A claimed enquiry card in Prospects shows the instruction pipeline status (ID/payment/risk/matter chips) without switching tabs. The `InstructionRef` is the shared key.

The Clients space doesn't go dormant after matter opening — it continues tracking **payment collection** and **ID expiry** for prospects still in the pipeline. It's for compliance + onboarding of the full client lifecycle, not just pre-matter work.

### Clients → Matters (matter opening is the bridge)

The 21-step pipeline in `FlatMatterOpening` creates the `Matters` row and Clio matter, then `pendingMatterId` deep-links into the Matters tab. But the InlineWorkbench in MatterOverview reaches **back** into instruction data to display the full journey. The CCL pipeline also spans both spaces.

### Matters → Portal (shared data, one-way currently)

Hub writes to `Matters` table → Portal reads. The `CurrentSnapshot` field is the narrative bridge — Hub can set it, Portal displays it as "Current Position." But **no Hub UI currently writes** to `CurrentSnapshot`, `MatterChecklist`, or `RecoveryStage`.

### Portal → Hub (self-service loop)

The portal's `POST /matter-portal/new-instruction` creates a new Deal — a self-service re-instruction. This deal then appears in Hub's Clients space Pitches tab, forming a loop.

---

## Command Centre Vision — The Gap

The architecture is **~90% read-path complete**. The main gap is **write-path UI** — server routes partially exist but no frontend calls them for inline editing.

### Existing server routes with no frontend

| Route | Method | What it can do |
|-------|--------|----------------|
| `/api/matter-operations/matter/:matterId` | PUT | Update status, description, practiceArea, solicitor, value, closeDate |
| `/api/matter-operations/link-client` | POST | Update ClientID + ClientName on Matters |
| `/api/matter-requests/:matterId` | PATCH | Update InstructionRef, ClientID, DisplayNumber, MatterID |

### Missing routes + UI for command centre

| Capability | Server route | Frontend UI |
|-----------|-------------|-------------|
| Edit `CurrentSnapshot` (visible in portal) | **Missing** | **Missing** |
| Toggle `MatterChecklist` items | **Missing** | **Missing** |
| Set `RecoveryStage` | **Missing** | **Missing** |
| Manage matter documents from Hub | **Missing** (portal has blob routes) | **Missing** |
| Manage `ClientBranding` | **Missing** | **Missing** |
| Bulk matter operations | **Missing** | **Missing** |
| Update `Opponents` post-creation | **Missing** | **Missing** |

### Natural control surface

The `InlineWorkbench` in `MatterOverview` is the natural home for command-centre features. It already has 6 tabs (details, identity, payment, risk, matter, documents) with full read access. Adding write capabilities to these tabs — especially the `matter` and `documents` tabs — turns it from a pipeline viewer into a command panel. Changes made here flow through to the portal via shared data tables.

---

## Key Reference Table

| Concern | File / Location |
|---------|----------------|
| Tab routing | `src/app/App.tsx` → `renderContent()` (~line 910) |
| Prospects container | `src/tabs/enquiries/Enquiries.tsx` (~11,349 lines) |
| Enquiry timeline | `src/tabs/enquiries/EnquiryTimeline.tsx` (~10,016 lines) |
| Claimed card | `src/tabs/enquiries/ClaimedEnquiryCard.tsx` |
| Unclaimed card | `src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx` |
| Instructions container | `src/tabs/instructions/Instructions.tsx` (~8,682 lines) |
| InlineWorkbench | `src/tabs/instructions/InlineWorkbench.tsx` (~6,286 lines) |
| Instruction table | `src/tabs/instructions/InstructionTableView.tsx` (~2,607 lines) |
| Matter opening wizard | `src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx` (~5,673 lines) |
| Processing actions | `src/tabs/instructions/MatterOpening/processingActions.ts` (21 actions) |
| Matters container | `src/tabs/matters/Matters.tsx` (~1,525 lines) |
| Matter detail | `src/tabs/matters/MatterOverview.tsx` (~1,843 lines) |
| CCL editor (modern) | `src/tabs/matters/ccl/CCLEditor.tsx` + 9 supporting files |
| CCL editor (legacy) | `src/tabs/instructions/DocumentEditorPage.tsx` |
| CCL backend | `server/routes/ccl.js`, `ccl-ai.js`, `ccl-ops.js`, `ccl-admin.js`, `ccl-date.js` |
| CCL template engine | `src/shared/ccl/` → re-exports from `src/tabs/instructions/templates/` |
| Matter portal (client) | `submodules/instruct-pitch/apps/pitch/client/src/structure/MatterPortal.tsx` |
| Matter portal (server) | `submodules/instruct-pitch/apps/pitch/backend/matter-portal.js` |
| Enquiry processing | `submodules/enquiry-processing-v2/` (.NET 8) |
| Claim route | `server/routes/claimEnquiry.js` → calls enquiry-processing-v2 |
| Unified enquiries | `server/routes/enquiries-unified.js` (merges both DBs) |
| Matter operations | `server/routes/matter-operations.js` (CRUD + Clio) |
| Matter requests | `server/routes/matterRequests.js` (INSERT + PATCH Matters) |
| Colour tokens | `src/app/styles/colours.ts` |
| Style guide | `docs/COMPONENT_STYLE_GUIDE.md` |

---

*Last updated: 2026-02-20. This file compounds — update it as architecture evolves.*
