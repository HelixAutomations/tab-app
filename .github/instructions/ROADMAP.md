# Roadmap

Tracked priorities for future sessions. Any agent can pick these up.

Use this file to park improvements discovered while delivering a request, when they are not directly adjacent to the work at hand.

---

## High Priority

- [ ] **Refresh Clio PBI token** - Re-authenticate Power BI Clio integration and update `clio-pbi-refreshtoken` secret in Azure Key Vault (helix-keys). Currently using user fallback (lz/jw/ac credentials). See `docs/FIX_REPORTING_CLIO_TOKEN_EXPIRED.md` for instructions.
- [ ] **Containerise deployment** - Current `build-and-deploy.ps1` is slow and error-prone. Move to Docker containers for consistent, fast deploys. Investigate Azure Container Apps or AKS.
- [ ] **Enquiry-processing claim → Hub realtime** - In `HelixAutomations/enquiry-processing-v2`, ensure the claim flow that updates SQL + Teams card also persists `TeamsBotActivityTracking.ClaimedBy/ClaimedAt/UpdatedAt` consistently (and/or emits a webhook/event). Hub now watches this table to drive realtime claim state.

## Medium Priority

- [ ] **Transition: Instructions/Clients → Prospects + Client Matters** - Move instruction workspace concepts (chips/ID/PAY/DOCS/MATTER/workbench) into the Enquiries/Prospect space; rename “Instructions/Clients” to “Client Matters” and retire the separate Matters tab. Seed notes: `prompts.txt` ("matters tab disappears") + `docs/PROSPECT_DOCUMENT_MANAGEMENT_SPEC.md` (journey links enquiry → deal → instruction → matter).
- [ ] **Metric details modal redesign** - Replace current horizontal-bar card layout with InlineWorkbench-style structure: `borderRadius: 0`, grid layout (`40px 1fr`), hero value centred, 8px uppercase section headers, compact AOW chips. Remove "Value Type" and "Caching" rows. See InlineWorkbench.tsx for reference patterns.
- [ ] **Audit docs/ folder** - 113 files, mostly stale. Sift through, keep useful ones, delete rest
- [ ] **Dead code cleanup sweep** - Use ESLint unused-vars inventory (`.tmp/eslint-unused-vars.txt`) + reference searches to remove genuinely unused helpers/components across `src/**` (skip hook-deps changes initially; avoid submodules).
- [ ] **Consolidate duplicate SQL patterns** - Multiple files do similar DB queries differently
- [ ] **Standardise error handling** - Mix of patterns across server routes
- [ ] **Clean console.logs** - Replace with proper logging where needed
- [ ] **Realtime: POID + outstanding balances** - Identify the handful of cross-user actions that currently rely on cached reads and manual refresh; for each, add either an SSE notification + refetch or targeted cache invalidation.

## Low Priority

- [ ] **Audit decoupled-functions/** - Only 2 of ~15 functions actually used (fetchInstructionData, recordRiskAssessment). Consider migrating to server routes or deleting unused
- [ ] **Remove commented-out code** - Scattered across codebase
- [ ] **Consistent naming conventions** - snake_case vs camelCase inconsistency
- [ ] **Submodule header CSS compat warning** - `-webkit-overflow-scrolling: touch;` in `submodules/enquiry-processing-v2/wwwroot/components/header.html` triggers Edge Tools compat warning; submodules are read-only here, so fix upstream (remove the property or accept warning).

---

## Completed

- [x] 2025-12-30: Agent infrastructure (sync-context, session-start, validate-instructions)
- [x] 2025-12-30: 2025 rate update (both databases)
- [x] 2025-12-30: Root cleanup (removed temp files)
- [x] 2025-12-30: Archived one-off scripts
- [x] 2026-01-11: Realtime: future bookings (SSE + cache invalidation)

---

*Update this file when priorities shift or items complete.*
