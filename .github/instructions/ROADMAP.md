# Roadmap

Tracked priorities for future sessions. Any agent can pick these up.

Use this file to park improvements discovered while delivering a request, when they are not directly adjacent to the work at hand. For code style/pattern guidance, see `WORKSPACE_OPTIMIZATION.md` (same folder) — that file covers preferred patterns; this file tracks actionable work items only.

---

## Vision: Helix CRM

This platform is evolving into **Helix CRM** — the single source of truth for every dataset, workflow, and validation at Helix Law. Not a tab app. Not a reporting dashboard. A platform that owns its data, explains itself, and increasingly runs without babysitting.

**Core principles:**
- **Transparency** — every sync, validation, and mutation is logged with who invoked it, when, and what the result was
- **Autonomy** — the system validates its own data after every sync, surfaces drift, and alerts when something is off
- **Audit trail** — full attribution: `triggeredBy` (scheduler/manual), `invokedBy` (user name or system), `validated` status with count/sum confirmation
- **Compounding intelligence** — each iteration makes the platform more self-aware and self-correcting

---

## High Priority

- [ ] **Prospects component optimisation** — `src/tabs/enquiries/Enquiries.tsx` is 11,349 lines with 222+ hooks. Decompose in safe, incremental stages. See dedicated section below: **[Prospects Optimisation Plan](#prospects-optimisation-plan)**.
- [ ] **Data Centre → Helix CRM Control Plane** — The Data Centre is the operational backbone. Current state: 3-layer OperationValidator, audit trail with user attribution, post-sync auto-validation. **Next steps**:
  - [ ] Drift alerts — compare today's sums against yesterday's and flag anomalies
  - [ ] Scheduled integrity sweeps — monthly full-range validation with report
  - [ ] Per-user drill-down in explain panel
  - [x] WIP validator card (matching collected time pattern) — Feb 2026: full 3-layer OperationValidator with type/kind breakdown, hours, dedup, spot checks, data source labels
  - [ ] Cross-dataset reconciliation (collectedTime vs WIP vs matters)
- [ ] **Refresh Clio PBI token** — Re-authenticate Power BI Clio integration and update `clio-pbi-refreshtoken` secret in Azure Key Vault (helix-keys). Currently using user fallback (lz/jw/ac credentials). See `docs/INTEGRATIONS_REFERENCE.md` for instructions.
- [ ] **CFA-specific email templates** — CFA completion currently reuses ID-only email templates (`sendClientIdOnlySuccessEmail` / `sendFeeEarnerIdOnlyEmail`). Add dedicated CFA templates with appropriate "no win no fee" wording, fee arrangement details, and CFA-specific client care letter references. Also: CFA success page messaging in instruct-pitch (currently shows generic "Identity Verified" — should say "Instructed (CFA)" or similar).
- [ ] **Containerise deployment** — Current `build-and-deploy.ps1` is slow and error-prone. Move to Docker containers for consistent, fast deploys. Investigate Azure Container Apps or AKS.
- [ ] **Enquiry-processing claim → Hub realtime** — In `HelixAutomations/enquiry-processing-v2`, ensure the claim flow that updates SQL + Teams card also persists `TeamsBotActivityTracking.ClaimedBy/ClaimedAt/UpdatedAt` consistently (and/or emits a webhook/event). Hub now watches this table to drive realtime claim state.
- [ ] **Deploy speed: run-from-package + staging swap** — Enable `WEBSITE_RUN_FROM_PACKAGE=1` on link-hub-v1 (Azure mounts zip, no 30k file extraction → ~2 min vs 30 min). Add `az webapp deployment slot swap` to `build-and-deploy-staging.ps1`. Staging slot already exists and is running. See Feb 2026 session notes below.

---

## Azure Identity & Teams Notifications — Strategy (Feb 2026)

### Current State (audited Feb 2026)

**AAD App Registrations:**

| Display Name | App ID | Purpose | Notes |
|-------------|--------|---------|-------|
| **Team Hub** (renamed from "Aiden") | `bee758ec-919c-45b2-9cdf-540c6419561f` | Team Hub SSO + tab auth | Used in `appPackage/manifest.json` → `webApplicationInfo`. Has ~50 Graph permissions already approved. Also registered as bot for Tasking-v3 (blocker — see below). |
| **Aiden** | `bb3357f0-dca3-4fef-9c4d-e58f69dde46c` | Enquiry-processing bot | Used by Bot Service "Aiden" in Main RG. Endpoint: `helixlaw-enquiry-processing.azurewebsites.net/api/messages`. |
| **linkhub003-aad** | `84e5e9b1-78a1-4461-9634-504671bfaf15` | Teams Toolkit local dev scaffolding | Redirect URI: `localhost:53000`. Identifier: `api://localhost:53000/...`. Probably unused in production. Candidate for cleanup. |

**Bot Service Resources:**

| Name | Resource Group | App ID | Endpoint |
|------|---------------|--------|----------|
| **Aiden** | Main | `bb3357f0` | `helixlaw-enquiry-processing.azurewebsites.net/api/messages` |
| **Tasking-v3** | Tasking | `bee758ec` ⚠️ | `tasking-v3.azurewebsites.net/api/messages` |

**Key problem**: `bee758ec` (Team Hub's app) is also registered as the Tasking-v3 bot. An app ID can only belong to one Bot Service. This blocks creating a TeamHub-Bot using the same app ID.

### Plan: Azure Identity Cleanup

**Phase 1 — Unblock Team Hub bot (requires Tasking migration)**
1. Create a **new AAD app reg** for Tasking (e.g. "Tasking Bot", new app ID)
2. Create a **new Bot Service** for Tasking using the new app ID
3. Update Tasking-v3's code/config to use the new app ID + password
4. **Delete** the old Tasking-v3 Bot Service (frees `bee758ec`)
5. Create **TeamHub-Bot** Bot Service using `bee758ec` with endpoint `link-hub-v1.../api/messages`

**Phase 2 — Team Hub notifications**
1. Add `bots` array to `appPackage/manifest.json` referencing `bee758ec`
2. Add `activities.activityTypes` to manifest (e.g. `newActionItem`, `enquiryAssigned`, `matterUpdate`)
3. Add minimal `/api/messages` endpoint to Express server (acknowledge bot install/uninstall)
4. Add `/api/send-notification` route that calls Graph API `sendActivityNotification`
5. Add `TeamsActivity.Send` application permission to `bee758ec` (may need admin consent — but app already has 50+ permissions approved, so likely smooth)
6. Redeploy Teams app package to org

**Phase 3 — Unified notification system (future)**
- Enquiry-processing (Aiden) continues owning channel Adaptive Cards for enquiry distribution
- Team Hub owns personal activity feed notifications: action items, matter updates, pipeline progress
- Asana connector integration for task-level notifications
- Dedicated Tasking platform app with its own bot identity, separated cleanly from both Team Hub and enquiry-processing
- Consider: should Aiden and Team Hub merge into a single Teams app with both tab + bot? Or stay separate? Decision depends on whether users benefit from seeing them as one app.

### Deployment Improvements (ready to implement now)

These are independent of the bot work and can be done immediately:

1. **`WEBSITE_RUN_FROM_PACKAGE=1`** — One Azure CLI command. Deploys drop from ~30 min to ~2 min. No code changes.
   ```powershell
   az webapp config appsettings set --resource-group Main --name link-hub-v1 --settings WEBSITE_RUN_FROM_PACKAGE=1
   ```

2. **Staging slot swap** — Add to `build-and-deploy-staging.ps1`:
   ```powershell
   az webapp deployment slot swap --resource-group Main --name link-hub-v1 --slot staging --target-slot production
   ```
   Zero-downtime deployment. Staging slot already exists at `link-hub-v1-staging-etd3hhg9fhb7fsdv.uksouth-01.azurewebsites.net`.

3. **Test staging in Teams** — The staging URL can be loaded in a browser with the passcode guard. For full Teams testing, temporarily update the manifest `contentUrl` to the staging URL, or use `?inTeams=1` query param (existing escape hatch in `isInTeams()`).

## Command Centre — Hub Controls the Portal (Feb 2026)

Hub is the internal command centre. The Matter Portal (instruct-pitch submodule) is the client surface. Both read from the same `Matters` + `Instructions` tables. The pipeline is ~90% read-path complete — the gap is **write-path UI** from Hub that flows through to the portal.

Full pipeline architecture documented in `.github/instructions/PIPELINE_ARCHITECTURE.md`.

### Phase 1 — Wire existing routes (no new server code)

- [ ] **Matter edit panel in MatterOverview** — `PUT /api/matter-operations/matter/:matterId` already supports status, description, practiceArea, solicitor, value, closeDate. Wire an inline edit form in the InlineWorkbench `matter` tab within `MatterOverview.tsx`. This is the lowest-friction win — the route exists, just needs UI.
- [ ] **Pipeline write actions from Matters** — The InlineWorkbench in Matters is read-only. Add action buttons (e.g. "Reassign solicitor", "Update practice area") that call existing routes.

### Phase 2 — New routes for portal-visible data

- [ ] **CurrentSnapshot editor** — Add `PATCH /api/matter-operations/matter/:matterId/snapshot` to update `Matters.CurrentSnapshot`. Wire a text editor in InlineWorkbench. This is the narrative "Current Position" visible to clients in the portal's `.mp-snapshot-block`.
- [ ] **MatterChecklist CRUD** — Add `GET/POST/PATCH` routes for `MatterChecklist` table. Wire interactive checkboxes in InlineWorkbench. Checklist completion updates flow to portal's `ChecklistSection`.
- [ ] **RecoveryStage control** — Add route to update `Matters.RecoveryStage` (or derive from checklist). Wire dropdown in InlineWorkbench.

### Phase 3 — Document and branding management

- [ ] **Hub-side document management** — Mirror portal's blob routes (`instruction-files` container) in Hub server. Wire file list + upload in InlineWorkbench `documents` tab. Both Hub and portal share the same blob paths.
- [ ] **ClientBranding CRUD** — Routes for managing portal brand assets (logo, colours) per client. Wire in a settings panel accessible from matter detail.

### Phase 4 — Automation and bulk operations

- [ ] **Auto-create portal space on matter opening** — Extend `processingActions.ts` step 12 (or add step) to ensure checklist rows and default snapshot are created alongside the `Matters` INSERT. Portal should work immediately after opening.
- [ ] **Bulk matter operations** — Batch status updates, batch solicitor reassignment from MatterTableView.
- [ ] **Opponent post-creation edits** — `UPDATE` route for `Opponents` table, wired from InlineWorkbench.

---

## Medium Priority

- [ ] **Matter one-off hardening** — Prevent repeat failures where `Deals.AreaOfWork` bucket values (e.g. `construction`) are not valid Clio `PRACTICE_AREAS` labels. Add canonical mapping layer before `/api/clio-matters`, and add server-side guard to refuse creating a new `MatterRequest` placeholder when an unresolved one already exists for the same instruction.
- [ ] **Opponent pipeline tracking** — Add opponent completion status to pipeline chips and workbench. Backend: include `Opponents` table data (via `Matters.OpponentID`/`OpponentSolicitorID` FK) in the instruction/pipeline data fetch. Frontend: add pipeline chip (states: pending/partial/complete) between Risk and Matter chips. Workbench: add opponent tab/section for post-opening completion of missing fields (contact, address). `Opponents` table schema already supports this. Also see `src/utils/opponentDataTracker.ts` for client-side field tracking. Server route: `server/routes/opponents.js` already has standalone `POST /api/opponents` endpoint.
- [ ] **Transition: Instructions/Clients → Prospects + Client Matters** — Move instruction workspace concepts (chips/ID/PAY/DOCS/MATTER/workbench) into the Enquiries/Prospect space; rename "Instructions/Clients" to "Client Matters" and retire the separate Matters tab.
  - [x] EID runs inline in prospects (Feb 2026)
  - [x] Risk assessment inline in prospects (Feb 2026)
  - [x] ID review inline in prospects (Feb 2026)
  - [x] Matter opening inline in prospects (Feb 2026)
  - [ ] Remove remaining `navigateToInstructions` dependencies (`Home` quick actions + prospects document preview deep-link) by replacing them with native Prospects Overview actions.
- [ ] **Resource-group auth broker** — Centralise token acquisition + caching per resource group. At least 3 route files (`dataOperations.js`, `matter-audit.js`, `matter-metrics.js`) each define their own `tokenCache = new Map()` + identical `getAccessToken`. Extract shared helper to `server/utils/tokenBroker.js`.
- [ ] **Metric details modal redesign** — Replace current horizontal-bar card layout in `MetricDetailsModal.tsx` with InlineWorkbench-style structure. See `InlineWorkbench.tsx` for reference patterns.
- [ ] **Upstream instruct-pitch changes** — Apply pending changes in `HelixAutomations/instruct-pitch` (CC/BCC support in sendEmail, payment fetch in fetchInstructionData, logging config updates).
- [ ] **Dead code cleanup sweep** — Generate ESLint unused-vars inventory, then use reference searches to remove genuinely unused helpers/components across `src/**` (skip hook-deps changes initially; avoid submodules).
- [ ] **Consolidate duplicate SQL patterns** — Multiple files do similar DB queries differently. Standardise around `withRequest` from `server/utils/db.js`.
- [ ] **Standardise error handling** — Mix of patterns across server routes. Adopt consistent try/catch with structured JSON error responses.
- [ ] **Clean console.logs** — Replace debug `console.log` with proper logging where needed; remove in production paths.
- [ ] **Realtime: POID + outstanding balances** — Identify cross-user actions that rely on cached reads and manual refresh; add SSE notification + refetch or targeted cache invalidation.

## Low Priority

- [ ] **AML annual review automation** — The SRA AML Firm-Wide Risk Assessment is annual (Feb–Feb cycle). Current process: run `scripts/amlReview12Months.mjs` for aggregated stats, then `scripts/amlReviewFollowUp.mjs` for PEP names + high-risk country details, then manually look up matter descriptions in Clio. Consider: (1) a combined "AML annual report" script that does everything in one pass including Clio lookups, (2) a Hub UI panel in Data Centre that generates the report on demand, (3) recording AML data differently at source so extraction is simpler (Kanchel's suggestion). See `docs/AML_REVIEW_12_MONTH_REPORT_RUNBOOK.md` for full methodology and gotchas.
- [ ] **Audit decoupled-functions/** — Only 2 of ~15 functions actually used (fetchInstructionData, recordRiskAssessment). Consider migrating to server routes or deleting unused.
- [ ] **Remove commented-out code** — Scattered across codebase.
- [ ] **Consistent naming conventions** — snake_case vs camelCase inconsistency.
- [ ] **Remove unused routes** — Grep server route registrations against actual frontend `fetch()` calls to identify dead endpoints.
- [ ] **Submodule header CSS compat warning** — `-webkit-overflow-scrolling: touch;` in `submodules/enquiry-processing-v2/wwwroot/components/header.html` triggers Edge Tools compat warning; fix upstream.

---

## Cognito → Bespoke Form Conversion Plan

**Goal**: Replace all 9 remaining Cognito-embedded forms with bespoke React components. This eliminates the external Cognito dependency, gives us full control over styling/validation/submission, enables the form health check system, and lets us pre-fill user context (initials, name, matter refs) automatically.

**Current state**: 6 bespoke forms already exist (`BundleForm`, `NotableCaseInfoForm`, `TechIdeaForm`, `TechProblemForm`, `CounselRecommendationForm`, `ExpertRecommendationForm`). Financial forms use the generic `BespokeForm` field renderer. The shared form infrastructure (`formStyles.ts`, `AreaWorkTypeDropdown`, `FormHealthCheck`) is mature.

**Pattern to follow**: Each conversion creates a new `src/CustomForms/XxxForm.tsx` file using the established form style helpers (`getFormScrollContainerStyle`, `getFormCardStyle`, `getFormSectionStyle`, `getInputStyles`, etc.) from `shared/formStyles.ts`. A matching server route in `server/routes/` handles submission.

### Priority Order

Prioritised by usage frequency and value of replacing the Cognito embed. Forms that benefit most from matters/user context pre-fill come first.

#### Tier 1 — High-frequency, high-value (convert first)

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 1 | **Tel. Attendance Note** | 41 | General | Matter ref (dropdown), caller name, phone, attendance type, notes, follow-up date | Clio activity entry or Asana task | Medium — needs matter dropdown + Clio API |
| 2 | **Tasks** | 90 | General | Assignee (team dropdown), matter ref, due date, priority, description | Asana task creation (existing pattern in `techTickets.js`) | Medium — reuse Asana integration |
| 3 | **Call Handling** | 98 | Operations | Caller name, phone, company, enquiry type, area of work, urgency, notes, fee earner to notify | Email notification or Asana task | Low-Medium |

#### Tier 2 — Moderate frequency

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 4 | **Office Attendance** | 109 | General | Date, location (Brighton/Remote/Other), time in/out | SQL insert to attendance table (route exists: `server/routes/attendance.js`) | Low |
| 5 | **Incoming Post** | 108 | Operations | Recipient (team dropdown), sender, item type, matter ref, notes | Email to recipient or Asana task | Low |
| 6 | **Transaction Intake** | 58 | Operations | Property address, client name, transaction type, price, solicitor, key dates | SQL insert + email to property team | Medium |

#### Tier 3 — Lower frequency or being superseded

| # | Form | Cognito ID | Section | Fields needed | Backend action | Complexity |
|---|------|-----------|---------|---------------|----------------|------------|
| 7 | **Proof of Identity** | 60 | General | Client name, matter ref, ID type, file upload, verification status | Already partially superseded by inline EID in Prospects. May keep as standalone for ops team. | Medium — file upload |
| 8 | **Open a Matter** | 9 | General | Client details, matter type, fee earner, area/worktype | **Already superseded** by `FlatMatterOpening.tsx` in Prospects. Remove from Forms page or redirect. | N/A — retire |
| 9 | **CollabSpace Requests** | 44 | General | Matter ref, participants, purpose | Email to ops or Asana task | Low |

### Per-form conversion checklist

Each conversion should follow this checklist:

1. [ ] **Audit Cognito form** — Open the Cognito URL, screenshot/document all fields, validation rules, conditional logic, and submission action (email? webhook? Zapier?)
2. [ ] **Create server route** — `server/routes/xxxForm.js` with POST handler. Use `withRequest()` for SQL, or Asana/email for task-based forms. Add App Insights telemetry.
3. [ ] **Create React component** — `src/CustomForms/XxxForm.tsx` using shared form styles. Props: `{ users, userData, currentUser, matters, onBack }`. Pre-fill user initials/name from `currentUser`.
4. [ ] **Register in formsData.ts** — Replace `embedScript` with `component: XxxForm`. Keep `url` as fallback link.
5. [ ] **Add to health check** — Add GET probe in `server/routes/formHealthCheck.js`.
6. [ ] **Test** — Open form from Forms page, fill fields, submit. Verify submission arrives at destination (Asana/SQL/email). Check health check reports healthy.
7. [ ] **Remove Cognito embed** — Delete `embedScript` entry and Cognito URL from `formsData.ts`.

### Infrastructure notes

- **Cognito script loader** can be removed from `FormDetails.tsx` once all 9 forms are converted. Currently at lines 85–130, ~45 lines of dead code post-conversion.
- **Form mode toggle** (Cognito/Bespoke buttons in `FormDetails.tsx`) can also be removed.
- **`BespokeForm` generic renderer** stays — it powers the Financial forms which use field definitions rather than custom components.

### Conversion log

| Form | Status | Date | Notes |
|------|--------|------|-------|
| Open a Matter | Superseded | Feb 2026 | `FlatMatterOpening.tsx` in Prospects handles this. Consider removing from Forms page. |
| *Others* | Not started | — | — |

---

## Prospects Optimisation Plan

**Target**: `src/tabs/enquiries/Enquiries.tsx` — 11,349 lines, 78 `useState`, 48 `useEffect`, 54 `useCallback`, 27 `useMemo`.

**Constraint**: No route changes, no API changes, no visual regressions. Each step is independently deployable. Test after each step by opening Prospects in all views (Mine/Claimed, Mine/Claimable, All, Triaged) and confirming identical behaviour.

**Autonomy note**: Each task below contains enough context for an agent to execute it without further clarification. Line numbers are approximate — always grep for the specific code patterns described rather than relying on exact line numbers, as prior tasks will shift them.

### Phase 1 — Safe extractions (no behaviour change)

Each task is a standalone change. Do them in order. Confirm the build compiles and Prospects loads correctly after each.

- [x] **1a. Extract `normalizeEnquiry()` utility** *(done — `src/utils/normalizeEnquiry.ts`, includes `source` field bug fix, `NormalizedEnquiry` type alias replaces all inline `Enquiry & { __sourceType }` patterns)*
- [x] **1b. Extract `detectSourceType()` to module scope** *(done — lives in `normalizeEnquiry.ts`)*

- [ ] **1c. Convert `displayEnquiries` from `useState` to `useMemo`** *(deferred — 13 `setDisplayEnquiries` call sites, 3 handlers skip `setTeamWideEnquiries`. Requires careful audit.)*
  - Find `const [displayEnquiries, setDisplayEnquiries] = useState<(Enquiry & { __sourceType:`.
  - Find the syncing `useEffect` — search for the comment `// Apply dataset toggle to derive display list`. It contains the derivation logic (~30 lines).
  - Replace with: `const displayEnquiries = useMemo(() => { ... }, [allEnquiries, teamWideEnquiries, showMineOnly, userData])`.
  - Move the exact logic from the `useEffect` body into the `useMemo`, returning the result instead of calling `setDisplayEnquiries`.
  - Handle the empty-allEnquiries case (return `[]`).
  - Remove the `useEffect` and all `setDisplayEnquiries` calls. Grep to find them all — there's one in the prop normalisation `useEffect` that clears to `[]` when `enquiries` is null. That case should be handled by the `useMemo` checking `allEnquiries.length === 0`.
  - **Why**: Eliminates 1 wasted render cycle per data/filter change.
  - **Test**: Switch between Mine/All views. Confirm enquiry counts match. Claimed view still shows claimed items.

- [ ] **1d. Consolidate toast state**
  - Search for `const [toastVisible, setToastVisible]`.
  - Replace 4 separate `useState` calls (`toastVisible`, `toastMessage`, `toastDetails`, `toastType`) with:
    ```ts
    const [toast, setToast] = useState<{ visible: boolean; message: string; details: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    ```
  - Grep for `setToastVisible\|setToastMessage\|setToastDetails\|setToastType` to find all call sites. Replace multi-line set sequences with a single `setToast(...)` call.
  - Update reads: `toastVisible` → `toast?.visible`, `toastMessage` → `toast?.message || ''`, etc.
  - **Test**: Claim an enquiry, trigger a toast, confirm it renders.

- [ ] **1e. Consolidate demo overlay state**
  - Search for `const [demoOverlayVisible, setDemoOverlayVisible]`.
  - Same pattern as 1d: replace `demoOverlayVisible`, `demoOverlayMessage`, `demoOverlayDetails` with single object.
  - **Test**: Open a demo prospect, confirm overlay still works.

### Phase 2 — Component extraction (visual structure unchanged)

Each sub-component is `React.memo`-wrapped and receives only the props it needs. This prevents the parent's 78 `useState` changes from re-rendering child rows.

- [ ] **2a. Extract `ProspectTableRow` component**
  - Target: the table row JSX block. Search for the `{(viewMode === 'table'` render section and find the per-enquiry `.map()` that renders each row.
  - Contains: inline styles, IIFEs for pipeline chips, hover handlers, click handlers, enrichment badges. Approximately 2,200 lines.
  - New file: `src/tabs/enquiries/components/ProspectTableRow.tsx`.
  - Props: the enquiry data, handler callbacks (`onClaim`, `onReassign`, `onEnquiryClick`, etc.), theme/colours, feature flags.
  - Wrap in `React.memo` with a custom comparator that checks enquiry ID + key fields (claim state, stage, POC, `__sourceType`).
  - **Test**: All row interactions (click, hover, claim, reassign, pipeline chips, grouping expand/collapse) work identically.

- [ ] **2b. Extract `PipelineChips` component**
  - Target: the pipeline chip rendering. Search for the IIFE or block that renders POC → EID → Risk → Matter → Docs → Pay chips.
  - Currently duplicated inline for main rows and child rows within grouped mode.
  - New file: `src/tabs/enquiries/components/PipelineChips.tsx`.
  - `React.memo`-wrapped.
  - **Test**: Pipeline chips render correctly in both grouped and flat views, in all states.

- [ ] **2c. Extract `ProspectsOverlay` component**
  - Target: Loading/processing overlay + toast + demo overlay. Search for the comment `{/* Processing overlay`.
  - New file: `src/tabs/enquiries/components/ProspectsOverlay.tsx`.
  - **Test**: Overlay shows during view transitions and initial load.

### Phase 3 — Structural improvements (careful)

- [ ] **3a. Extract filter pipeline into `useEnquiryFilters` hook**
  - Target: the `filteredEnquiries` useMemo. Search for `const filteredEnquiries = useMemo`. It's ~350 lines.
  - New file: `src/tabs/enquiries/hooks/useEnquiryFilters.ts`.
  - Break into composable filter functions: `filterByClaimed()`, `filterByArea()`, `filterBySearch()`, `filterByPipeline()`.
  - The area-matching logic is duplicated 3 times within the current useMemo — unify into a single `matchesAreaFilter()` function.
  - **Test**: All filter combinations (Claimed/Claimable/Triaged × area × search × pipeline stage) produce identical results.

- [ ] **3b. Memoize or extract inline styles**
  - The render section has ~200+ inline style objects created per render.
  - For styles that depend only on `isDarkMode` / `colours`, move to `useMemo` at the top of the component or to a shared styles module.
  - Prioritise the table row styles (they're rendered per-row, so N×200 objects per render).
  - **Test**: Visual appearance unchanged.

---

## Completed

- [x] 2025-12-30: Agent infrastructure (sync-context, session-start, validate-instructions)
- [x] 2025-12-30: 2025 rate update (both databases)
- [x] 2025-12-30: Root cleanup (removed temp files)
- [x] 2025-12-30: Archived one-off scripts
- [x] 2026-01-11: Realtime: future bookings (SSE + cache invalidation)
- [x] 2026-02-06: EID inline in prospects — no navigation to Clients, processing overlay + toasts + auto-refresh
- [x] 2026-02-08: Audit docs/ folder — reduced from 113 to ~13 files
- [x] 2026-02-08: Data Centre — split allocation transparency, 3-layer OperationValidator, post-sync auto-validation, audit trail, timeline validation, count mismatch fix, "Last Sync: Never" fix, collectedTime documented, "dupes"→"split allocations"
- [x] 2026-02-09: normalizeEnquiry extraction (Phase 1a+1b) — `src/utils/normalizeEnquiry.ts`, NormalizedEnquiry type, source field bug fix
- [x] 2026-02-09: Pipeline filter cycle fix — buttons now loop (none→has→missing→clear), dot indicators, descriptive tooltips
- [x] 2026-02-09: WIP non_billable — added `non_billable BIT` to wip table (293,811 rows migrated), Clio Activities API fields updated, batch+fallback INSERT updated
- [x] 2026-02-09: WIP validator enriched — dedup CTE, SUM(total), SUM(hours), type breakdown (TimeEntry/ExpenseEntry), spot checks, data source labels ("via Activities API")
- [x] 2026-02-09: Post-sync log breakdown — audit trail messages now include kind/type splits with £ totals and hours
- [x] 2026-02-09: 12m monthly totals — per-month kind/type breakdown with sub-rows in UI, hours for WIP months
- [x] 2026-02-09: Collected time coverage — batch INSERT (100 rows), dedup CTE fix (£41,541 in 681 duplicates), staging route registration

---

*Update this file when priorities shift or items complete.*
