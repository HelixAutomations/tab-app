# Deploy warning lint cleanup

> **Purpose of this document.** This is a self-contained brief that any future agent can pick up cold to remove the remaining deploy-time eslint warning noise without re-tracing this session.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-07 against branch `main`. If reading this more than 30 days later, re-run `npm run lint:deploy-warnings` and re-verify the line refs before editing.

---

## 1. Why this exists (user intent)

The user reported that deployments flood the terminal with eslint warnings and asked: "can you just run a check to see what needs cleaning up instead of this flooding my terminals each time i deploy". The immediate workflow fix has shipped: `npm run lint:deploy-warnings` now runs a focused summary against the current noisy files.

This brief parks the remaining cleanup. The user explicitly asked to "stash this for another time", so do not implement during the stash session. Future work should remove the warnings at source so deploys and the focused check both go quiet.

---

## 2. Current state - verified findings

### 2.1 Focused warning check exists

- [package.json](../../package.json) L128 wires `lint:deploy-warnings` to `node tools/check-deploy-warnings.mjs`.
- [tools/check-deploy-warnings.mjs](../../tools/check-deploy-warnings.mjs) L11-L15 scopes eslint to three files: `ClientLookupModal.tsx`, `RelatedClientsSection.tsx`, and `MatterOverview.tsx`.
- [tools/check-deploy-warnings.mjs](../../tools/check-deploy-warnings.mjs) L76-L105 groups eslint JSON output by file and rule so the user gets a short cleanup summary rather than raw deploy spam.

### 2.2 ClientLookupModal warnings

- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L5-L10 imports `TextField`, `PrimaryButton`, and `List`, but the focused lint check reports them as unused.
- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L19-L35 defines `mutedText`, `cardBackground`, and `textColor`; only `borderColour` and `hoverBackground` are used in the visible read around the search result row.
- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L70 keeps `setSearchPrimary` from `useState(true)`, but the primary search checkbox is read-only and the setter is unused.
- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L84-L96 runs a debounced search effect that calls `performSearch`, while [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L98-L126 declares `performSearch` outside the effect. React hooks lint flags the missing dependency.
- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L133-L136 calculates `initials` in `renderClientItem`, but the displayed `Persona` at [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L152-L158 does not use that value.

### 2.3 RelatedClientsSection warnings

- [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L8-L9 imports `PersonaPresence`, `Persona`, and `PersonaSize`, but the focused lint check reports all three as unused.
- [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L79-L87 calls `loadRelatedClients` from an effect before the function declaration at [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L149-L184. React hooks lint flags `loadRelatedClients` as a missing dependency.
- [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L89-L95 calls `loadMainClient` from an effect before the function declaration at [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L113-L146. React hooks lint flags `loadMainClient` as a missing dependency.

### 2.4 MatterOverview warnings

- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L5 imports `FaFolder`, `FaCheck`, and `FaExclamationTriangle`; the focused lint check reports those three icon imports as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L18-L23 imports `WorkbenchStageStatus`, which the focused lint check reports as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L31-L49 imports `detailSectionTitleStyle` and `cclStatusStyle`, both currently reported as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L221-L231 defines `getPracticeAreaColor`, [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L295-L299 defines `buildInitials`, and [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L302-L306 defines `summarizeContactChannel`. The focused lint check reports all three helpers as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L344-L385 derives `eidStatus`, `hasFailedPayment`, `riskComplete`, and `hasDocs`, but the focused lint check reports each as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L719 stores `detailViewMode` and `setDetailViewMode`, but the focused lint check reports both as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1015-L1022 derives `isLocalhost`, `hasWiredDetailData`, and `isWipReady`, but the focused lint check reports all three as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1218-L1233 contains an effect whose dependency list omits `matter.clientEmail`; hooks lint flags this.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1235-L1300 contains `matchedEnquiry` memo dependencies that include `baseWorkbenchItem` and `pipelineLink.prospectId`; hooks lint reports those as unnecessary.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1488 derives `workbenchMatterId`, and [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1568 derives `normalizedRiskResult`; both are reported as unused.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1724-L1803 defines several detail view style constants and helpers: `detailViewHeaderRowStyle`, `detailViewControlRailStyle`, `detailViewSmallToggleStyle`, `detailViewLargeToggleStyle`, `detailViewEndToggleStyle`, and `detailViewAllColumnsStyle`. The focused lint check reports each as unused.

### 2.5 Stash overlap

- `node tools/stash-precheck.mjs --touches "src/tabs/instructions/components/ClientLookupModal.tsx,src/tabs/instructions/components/RelatedClientsSection.tsx,src/tabs/matters/MatterOverview.tsx"` reported one shared-file coordination: `helix-rehearsal-record-luke-test-as-firm-seed` also touches [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx).
- The same precheck reported one informational same-directory coordinate with `clio-webhook-reconciliation-and-selective-rollout`; no shared file was reported for that item.

---

## 3. Plan

### Phase A - clean the two instruction components

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Remove unused imports and helpers | [ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) | Drop unused Fluent imports and unused theme helpers. Preserve the existing visual output unless a value is actually wired. |
| A2 | Stabilise search effect | [ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) | Either wrap `performSearch` in `useCallback` with the real dependencies, or move the async search body inside the debounced effect. Avoid stale `userInitials` or email type reads. |
| A3 | Remove unused `initials` calculation or pass it deliberately | [ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) | Default: delete the local calculation unless `Persona` needs custom `initialsText` after checking Fluent UI prop support. |
| A4 | Remove unused Persona imports | [RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) | Drop `PersonaPresence`, `Persona`, and `PersonaSize` if no later JSX uses them. |
| A5 | Stabilise client loading effects | [RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) | Prefer `useCallback` for `fetchClientCustomFields`, `loadMainClient`, and `loadRelatedClients`, then use those callbacks in effect dependencies. |

**Phase A acceptance:**
- [ ] `npm run lint:deploy-warnings` reports zero warnings for both instruction component files.
- [ ] Client lookup still searches the selected email type set and still includes the current `userInitials` in request URLs.
- [ ] Related client and main client fetches do not loop repeatedly after adding hook dependencies.

### Phase B - clean MatterOverview in a dedicated pass

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Remove dead imports | [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Drop unused icons, type imports, and style imports. Keep any imported style that is still used outside the verified snippets. |
| B2 | Remove or rewire dead helpers | [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Delete `getPracticeAreaColor`, `buildInitials`, and `summarizeContactChannel` only if full-file search confirms no usage. If these were intended for a collapsed detail rail, do not resurrect that UI as part of lint cleanup. |
| B3 | Remove dead derived state | [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Delete unused booleans and ids where they have no side effects. Be cautious around pipeline derivation values that may have been left for near-term UI restoration. |
| B4 | Fix hook dependency warnings | [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Add `matter.clientEmail` to the effect dependency list, and remove unnecessary memo dependencies only after confirming they are not read inside the memo body. |
| B5 | Remove unused detail view styles | [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Delete unused detail view style constants as dead code. Do not reintroduce the abandoned detail mode toggle unless separately requested. |

**Phase B acceptance:**
- [ ] `npm run lint:deploy-warnings` returns `Deploy warning summary: no issues in tracked files.`
- [ ] `npm run build` completes without reintroducing the warning wall for these three files.
- [ ] A manual matter overview smoke check still opens overview, pipeline rail, CCL entry, Clio link, NetDocuments panel, and copied email or phone affordance if available.

---

## 4. Step-by-step execution order

1. Run `npm run lint:deploy-warnings` and save the current grouped warning counts.
2. Implement Phase A in the two instruction components.
3. Run `npm run lint:deploy-warnings`; fix any instruction-component regressions before touching MatterOverview.
4. Run a local smoke check for the related-clients UI if the dev app is already running. Do not start duplicate dev servers.
5. Implement Phase B in [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx), keeping the changes mechanical and small.
6. Run `npm run lint:deploy-warnings` again.
7. Run `npm run build` because the original pain appears during deploy build output.
8. Add one `logs/changelog.md` entry for the warning cleanup phase that ships.
9. If all phases ship, close this stash with `node tools/stash-close.mjs deploy-warning-lint-cleanup` and then run `node tools/stash-status.mjs`.

---

## 5. Verification checklist

**Phase A:**
- [ ] `npm run lint:deploy-warnings` shows no `ClientLookupModal.tsx` warnings.
- [ ] `npm run lint:deploy-warnings` shows no `RelatedClientsSection.tsx` warnings.
- [ ] Client lookup still debounces and does not fire before a 3-character email-like input.
- [ ] Related client loading does not loop after hook dependency fixes.

**Phase B:**
- [ ] `npm run lint:deploy-warnings` reports no issues in tracked files.
- [ ] `npm run build` completes without the previous three-file warning wall.
- [ ] Matter Overview still renders with the overview, workbench, CCL, activity, documents, and portal affordances intact.

---

## 6. Open decisions (defaults proposed)

1. **Clean all 42 warnings in one pass or split it?** Default: split Phase A and Phase B. Rationale: the instruction components are small and low-risk; [MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) is larger and coordinates with another open stash.
2. **Delete unused code or preserve dormant UI pieces?** Default: delete unused code unless a full-file search finds a nearby in-progress UI path. Rationale: the user wants deploy noise gone, not dormant features resurrected.
3. **Keep `lint:deploy-warnings` after cleanup?** Default: keep it as a lightweight regression check. Rationale: it provides the exact pre-deploy loop the user asked for.

---

## 7. Out of scope

- Do not redesign Matter Overview.
- Do not refactor [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) beyond warning cleanup.
- Do not change deploy scripts unless warnings remain noisy after source cleanup.
- Do not edit submodules.
- Do not remove `npm run lint:deploy-warnings` unless the user explicitly asks.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) - small instruction client lookup warning cleanup.
- [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) - related-client warning cleanup and hook dependency stabilisation.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) - main warning hotspot, coordinate before editing.

Server:
- None.

Scripts / docs:
- [tools/check-deploy-warnings.mjs](../../tools/check-deploy-warnings.mjs) - verification command already created before this stash.
- [package.json](../../package.json) - `lint:deploy-warnings` script already created before this stash.
- [logs/changelog.md](../../logs/changelog.md) - add an entry when source cleanup ships.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: deploy-warning-lint-cleanup
verified: 2026-05-07
branch: main
touches:
  client:
    - src/tabs/instructions/components/ClientLookupModal.tsx
    - src/tabs/instructions/components/RelatedClientsSection.tsx
    - src/tabs/matters/MatterOverview.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - helix-rehearsal-record-luke-test-as-firm-seed
conflicts_with: []
```

---

## 9. Gotchas appendix

- [src/tabs/instructions/components/ClientLookupModal.tsx](../../src/tabs/instructions/components/ClientLookupModal.tsx) L98-L126 reads `searchPrimary`, `searchHome`, `searchOther`, and `userInitials`. If `performSearch` becomes a callback, those must be real dependencies or the search URL can go stale.
- [src/tabs/instructions/components/RelatedClientsSection.tsx](../../src/tabs/instructions/components/RelatedClientsSection.tsx) L98-L111, L113-L146, and L149-L184 form a dependency chain: custom field fetcher is called by both loader functions. Stabilise the lowest-level callback first to avoid hook dependency churn.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) coordinates with `helix-rehearsal-record-luke-test-as-firm-seed`. Before editing, run `node tools/stash-precheck.mjs --draft docs/notes/DEPLOY_WARNING_LINT_CLEANUP.md` and read that brief if MatterOverview has changed.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) L1724-L1803 looks like a partially removed detail-view toggle. Treat it as dead code only if no JSX below the verified read still references the constants.