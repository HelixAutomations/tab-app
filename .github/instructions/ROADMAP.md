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
- [ ] **Containerise deployment** — Current `build-and-deploy.ps1` is slow and error-prone. Move to Docker containers for consistent, fast deploys. Investigate Azure Container Apps or AKS.
- [ ] **Enquiry-processing claim → Hub realtime** — In `HelixAutomations/enquiry-processing-v2`, ensure the claim flow that updates SQL + Teams card also persists `TeamsBotActivityTracking.ClaimedBy/ClaimedAt/UpdatedAt` consistently (and/or emits a webhook/event). Hub now watches this table to drive realtime claim state.

## Medium Priority

- [ ] **Opponent pipeline tracking** — Add opponent completion status to pipeline chips and workbench. Backend: include `Opponents` table data (via `Matters.OpponentID`/`OpponentSolicitorID` FK) in the instruction/pipeline data fetch. Frontend: add pipeline chip (states: pending/partial/complete) between Risk and Matter chips. Workbench: add opponent tab/section for post-opening completion of missing fields (contact, address). `Opponents` table schema already supports this. Also see `src/utils/opponentDataTracker.ts` for client-side field tracking. Server route: `server/routes/opponents.js` already has standalone `POST /api/opponents` endpoint.
- [ ] **Transition: Instructions/Clients → Prospects + Client Matters** — Move instruction workspace concepts (chips/ID/PAY/DOCS/MATTER/workbench) into the Enquiries/Prospect space; rename "Instructions/Clients" to "Client Matters" and retire the separate Matters tab.
  - [x] EID runs inline in prospects (Feb 2026)
  - [x] Risk assessment inline in prospects (Feb 2026)
  - [x] ID review inline in prospects (Feb 2026)
  - [x] Matter opening inline in prospects (Feb 2026)
- [ ] **Resource-group auth broker** — Centralise token acquisition + caching per resource group. At least 3 route files (`dataOperations.js`, `matter-audit.js`, `matter-metrics.js`) each define their own `tokenCache = new Map()` + identical `getAccessToken`. Extract shared helper to `server/utils/tokenBroker.js`.
- [ ] **Metric details modal redesign** — Replace current horizontal-bar card layout in `MetricDetailsModal.tsx` with InlineWorkbench-style structure. See `InlineWorkbench.tsx` for reference patterns.
- [ ] **Upstream instruct-pitch changes** — Apply pending changes in `HelixAutomations/instruct-pitch` (CC/BCC support in sendEmail, payment fetch in fetchInstructionData, logging config updates).
- [ ] **Dead code cleanup sweep** — Generate ESLint unused-vars inventory, then use reference searches to remove genuinely unused helpers/components across `src/**` (skip hook-deps changes initially; avoid submodules).
- [ ] **Consolidate duplicate SQL patterns** — Multiple files do similar DB queries differently. Standardise around `withRequest` from `server/utils/db.js`.
- [ ] **Standardise error handling** — Mix of patterns across server routes. Adopt consistent try/catch with structured JSON error responses.
- [ ] **Clean console.logs** — Replace debug `console.log` with proper logging where needed; remove in production paths.
- [ ] **Realtime: POID + outstanding balances** — Identify cross-user actions that rely on cached reads and manual refresh; add SSE notification + refetch or targeted cache invalidation.

## Low Priority

- [ ] **Audit decoupled-functions/** — Only 2 of ~15 functions actually used (fetchInstructionData, recordRiskAssessment). Consider migrating to server routes or deleting unused.
- [ ] **Remove commented-out code** — Scattered across codebase.
- [ ] **Consistent naming conventions** — snake_case vs camelCase inconsistency.
- [ ] **Remove unused routes** — Grep server route registrations against actual frontend `fetch()` calls to identify dead endpoints.
- [ ] **Submodule header CSS compat warning** — `-webkit-overflow-scrolling: touch;` in `submodules/enquiry-processing-v2/wwwroot/components/header.html` triggers Edge Tools compat warning; fix upstream.

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
