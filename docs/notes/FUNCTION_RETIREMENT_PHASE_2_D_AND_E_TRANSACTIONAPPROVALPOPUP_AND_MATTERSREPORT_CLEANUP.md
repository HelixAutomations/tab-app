# Function retirement Phase 2 D and E TransactionApprovalPopup and MattersReport cleanup

> **Purpose of this document.** Self-contained brief that any future agent can pick up cold. Captures the remaining two pieces of the Phase 2 helix-keys-proxy / Function retirement cleanup (parts D and E) after parts A + B + C shipped in the 2026-05-16 session.
>
> **Verified:** 2026-05-16 against branch `main`. Re-verify file/line refs if executed more than 30 days later.

---

## 1. Why this exists (user intent)

The Phase 2 Function-retirement cleanup ran across snippets (C), TransactionApprovalPopup (D) and MattersReport detail panel (E). User shipped A (helix-keys-proxy retirement), B (api/ shell + FUNC_* env), and C (snippet edit / approval implementation removed). D and E remain. User said: "stash both in one".

Goal of this brief: retire or decommission TransactionApprovalPopup and the MattersReport detail panel cleanly. Both are dead or near-dead surfaces that referenced retired Azure Functions or no-longer-wired data sources. They still mount in production and clutter Home + Reports.

Out of scope: changing approver semantics (`APPROVERS`, `isApprover`, annual-leave approvals) which share the same gate but are alive and must be preserved.

---

## 2. Current state — verified findings

### 2.1 TransactionApprovalPopup (Phase D)

- Component: [src/tabs/transactions/TransactionApprovalPopup.tsx](../../src/tabs/transactions/TransactionApprovalPopup.tsx) (408 lines). Modal that displayed a pending Clio transaction for approve / reject, posting via a retired Function endpoint.
- Mounted twice:
  - [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L106 (import), L8575 (render block — see surrounding JSX for trigger state).
  - [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) L13 (import), L250 (render).
- The popup's submit path used the helix-keys-proxy / Function URL that was retired in Phase A. No replacement server route exists. Re-verify by grepping for the prop callback names (`onApprove`, `onReject`) and tracing where the network call actually goes.
- No telemetry currently emitted from this surface.

### 2.2 MattersReport detail panel (Phase E)

- Component: [src/tabs/Reporting/MattersReport.tsx](../../src/tabs/Reporting/MattersReport.tsx) (5525 lines, default-exported as `React.memo(MattersReport)`).
- Mounted by [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) L25 (import), L6034 (render under the Reports tab).
- Detail panel inside MattersReport relies on per-matter enrichment that was previously hydrated by a Function; the call returns nothing in prod and the panel either shows skeletons forever or empty rows. Re-verify by opening Reports tab as an admin with `canAccessReports()` and clicking a matter row.
- Listed in the brand colour palette doc as a known violation (raw hex off-palette). Irrelevant to retirement but worth noting if rebuilding.

### 2.3 Adjacent code that MUST be preserved

- `APPROVERS = ['AC', 'JW', 'LZ', 'KW']` and `isApprover` in `Home.tsx` are shared with annual leave approvals. Do not delete.
- `canAccessReports()` and the Reports tab itself remain. Only the matter detail panel inside `MattersReport` is in scope, not the whole Reports tab.

---

## 3. Plan

### Phase D — TransactionApprovalPopup

Decision: **delete** (preferred) vs **redirect** (keep UI, repoint at a new server route).

If delete (recommended, since back end is gone and no operator workflow depends on it):

| # | Change | File |
|---|--------|------|
| D1 | Remove import + render block | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L106, L8575 |
| D2 | Remove import + render block | [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) L13, L250 |
| D3 | Remove any feeding state (pending transactions list, open/close booleans, fetch effect). Trace from D1/D2 outward | Home.tsx, ActionSection.tsx |
| D4 | Delete the component file | [src/tabs/transactions/TransactionApprovalPopup.tsx](../../src/tabs/transactions/TransactionApprovalPopup.tsx) |
| D5 | Delete the `transactions/` folder if it becomes empty | `src/tabs/transactions/` |
| D6 | Grep for any related server route, telemetry, or unused types and remove | server/, src/ |

If redirect: skip D4 and instead repoint the submit handler at an existing approvals server route. Not recommended without an explicit operator request.

**Phase D acceptance:**
- `grep -ri TransactionApprovalPopup src/ server/` returns no matches.
- Home tab and Action Section render with no console warnings.
- `npm run build` clean. Babel parses Home.tsx (the lesson from C: Babel is the truth, not TS LSP).

### Phase E — MattersReport detail panel

Decision: **hide** (preferred, fast) vs **rebuild** (keep panel, repoint at a current data source).

If hide (recommended):

| # | Change | File |
|---|--------|------|
| E1 | Identify the detail-panel render block inside MattersReport. Search for the matter-row `onClick` that opens it and the panel JSX | [src/tabs/Reporting/MattersReport.tsx](../../src/tabs/Reporting/MattersReport.tsx) |
| E2 | Gate the click handler behind a `false` constant (or remove it entirely) so rows are non-interactive | MattersReport.tsx |
| E3 | Remove the detail-panel JSX block and its supporting state (`selectedMatter`, `isDetailOpen`, fetch effects targeting the retired Function) | MattersReport.tsx |
| E4 | If the panel is the only consumer of a hook / helper / type defined in the same file, remove those too | MattersReport.tsx |
| E5 | Leave the table itself intact. Reports tab still shows the list view | MattersReport.tsx, ReportingHome.tsx |

If rebuild: keep the panel shell, repoint the enrichment fetch at the current matters API, and add telemetry per the App Insights contract. Larger scope. Only do this if operator confirms the detail view is wanted.

**Phase E acceptance:**
- Reports tab → Matters list still renders for admins with `canAccessReports()`.
- Clicking a matter row does nothing (or row is visually non-interactive).
- No skeletons or empty panels mounted to the right.
- `npm run build` clean.

---

## 4. Step-by-step execution order

1. **D1 + D2** in one pass. Remove both mount sites; remove imports.
2. **D3** clean up unused state and fetch effects feeding the popup.
3. **D4 + D5** delete the component file (and folder if empty).
4. Run a Babel parse on Home.tsx (the TS LSP missed a similar orphan in Phase C).
5. **E1** locate the detail-panel block in MattersReport.
6. **E2 + E3 + E4** remove handler, JSX, and supporting state.
7. **E5** verify the table still renders.
8. Changelog entry per phase. Lessons-learned reminder: `grep` is not enough; run a Babel parse after removing JSX blocks from Home.tsx.

---

## 5. Verification checklist

**Phase D:**
- [ ] Zero references to `TransactionApprovalPopup` in `src/` and `server/`.
- [ ] Home tab and ActionSection mount without console errors.
- [ ] `npm run build` clean.
- [ ] Babel parse of Home.tsx succeeds.

**Phase E:**
- [ ] Reports tab → Matters list still renders.
- [ ] Clicking a matter row no longer opens a panel.
- [ ] No fetches against retired Function endpoints from this surface (Network tab).
- [ ] `npm run build` clean.

---

## 6. Open decisions (defaults proposed)

1. **Delete vs redirect TransactionApprovalPopup.** Default: **delete**. Rationale: back end is gone; no operator workflow depends on the surface; redirect adds scope without value.
2. **Hide vs rebuild MattersReport detail panel.** Default: **hide**. Rationale: detail data source is gone; rebuilding is a separate product decision and should be a new brief if wanted.
3. **Whether to also retire the `transactions/` folder.** Default: **yes** if folder is empty after D4.

---

## 7. Out of scope

- `APPROVERS` / `isApprover` in Home.tsx (shared with annual leave approvals).
- The Reports tab itself and `canAccessReports()`.
- MattersReport list view and column logic.
- Any other dead Function-era surfaces beyond D and E (track separately).
- Brand-token violations inside MattersReport (separate cleanup if the panel is rebuilt).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/transactions/TransactionApprovalPopup.tsx](../../src/tabs/transactions/TransactionApprovalPopup.tsx) popup component (DELETE in D4)
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) mount site (L106 import, L8575 render); also defines preserved APPROVERS / isApprover
- [src/tabs/home/ActionSection.tsx](../../src/tabs/home/ActionSection.tsx) second mount site (L13 import, L250 render)
- [src/tabs/Reporting/MattersReport.tsx](../../src/tabs/Reporting/MattersReport.tsx) detail panel lives here
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) mounts MattersReport (L25, L6034)

Server / scripts:
- [logs/changelog.md](../../logs/changelog.md) one entry per phase
- No new server routes needed for delete/hide path

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: function-retirement-phase-2-d-and-e-transactionapprovalpopup-and-mattersreport-cleanup
verified: 2026-05-16
branch: main
touches:
  client:
    - src/tabs/transactions/TransactionApprovalPopup.tsx
    - src/tabs/home/Home.tsx
    - src/tabs/home/ActionSection.tsx
    - src/tabs/Reporting/MattersReport.tsx
    - src/tabs/Reporting/ReportingHome.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - app-wide-ux-improvement-proof-programme
  - clio-webhook-reconciliation-and-selective-rollout
  - docs-transfer-review-ccl-review-fixes
  - helix-rehearsal-record-luke-test-as-firm-seed
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - quick-actions-rework-empty-state
  - realtime-delta-merge-upgrade
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - staging-walkthrough-call-2026-05-11-to-do-strip-realtime-focus-plus-parked-items
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - forms-ia-ld-undertaking-complaint-flow
  - ux-realtime-navigation-programme
  - annual-leave-modal-brand-rework
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - hub-rollout-training-and-confidence-recovery
  - management-dashboard-trust-gate
  - ppc-report-does-paid-acquisition-actually-pay
  - reporting-trust-and-ops-visibility
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Babel beats TS LSP on JSX-block removals.** During Phase C, `get_errors` returned "no errors" while Babel failed with `Unexpected token, expected "," (8645:1)` on Home.tsx. The fault was an orphan `useEffect(() => {` at L1846 left behind when the snippet effect was removed. Lesson: after removing any JSX or useEffect/useMemo block from Home.tsx, run a Babel parse before declaring done.
- **Home.tsx is ~8650 lines.** Bisecting parse errors is faster than reading. A 100-line-window remove-and-reparse loop pinpointed the fault in seconds. Keep this technique in mind.
- **`APPROVERS` and `isApprover` look removable but are not.** They are reused by annual leave approvals. Confirm any approver constant you touch is not referenced by leave logic before deletion.
- **TransactionApprovalPopup has two mount sites.** Don't stop at the first one. Home.tsx AND ActionSection.tsx both mount it.
- **MattersReport is `React.memo` exported.** If you delete state used only by the detail panel, double-check the memo comparator (if any) and ensure no remaining prop relies on the removed state shape.
- **Reports tab gating is `canAccessReports()`, not `isAdminUser()`.** LA is admin but has no reports access. Irrelevant for hiding the panel but worth knowing if you add new gating.
- **Phase A + B + C already shipped in the 2026-05-16 changelog entry.** Reference that entry for context on what helix-keys-proxy retirement removed.
