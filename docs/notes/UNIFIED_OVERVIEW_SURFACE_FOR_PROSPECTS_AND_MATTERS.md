# Unified Overview surface for Prospects and Matters

> **Purpose.** Bring Prospect Overview and Matter Overview onto a single set of Overview primitives so a fee earner moves between them with no relearning, and so future surfaces inherit the pattern instead of forking.
>
> **Verified:** 2026-05-12 against branch `main`.

---

## 1. Why this exists (user intent)

User on 2026-05-12: *"in the header the acid email and phone and their icons and copy chips all start blending in with one another in that whole line. lets take a step back and take a look at the page as a whole. the fee earner enters, what do they need to see? how do they contact these people? workbench tabs dont see to be too responsive on smaller screens, and the whole page doesnt quite go together."*

Then: *"im talking about overview in prospects, but matter also is going to need an overhaul. now that i think about it its an opportunity to bring everything together and add some structure in that way."*

Then: *"implement in full"* — approving the 3-phase plan proposed in chat.

Not asked for:
- New Clio fields, schema or Clio API changes
- Cross-app surfaces (instruct-pitch, enquiry-processing-v2)
- Reflowing tabs other than Overview

---

## 2. Current state — verified findings

### 2.1 Matter Overview

- File: [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) — ~3,487 lines.
- Styles: [src/tabs/matters/styles/matterOverview.styles.ts](../../src/tabs/matters/styles/matterOverview.styles.ts) — `mergeStyles` based, `sectionCardStyle` is white-on-white in the left column. Right column uses `colours.grey` so cards visibly have edges. This is the "white boxes with no side borders" complaint.
- Header contact line (Client card): email + phone rendered as inline `<a>` + copy `<button>` rows, plus a second Quick Actions strip below with Phone/Mail icon buttons — two contact affordances competing.
- ACID + Enquiry ID + Clio Contact + Matter ID + Client ID + Passcode all stacked in the Reference card with no grouping or copy affordance.
- Pipeline rail uses `WorkbenchJourneyRail` with no overflow handling at narrow widths; collapse chevron sits to the right of the rail competing for space.

### 2.2 Prospect Overview

- File: [src/tabs/enquiries/EnquiryOverview.tsx](../../src/tabs/enquiries/EnquiryOverview.tsx) — uses `helix-panel` + `prospect-overview-*` classes from [src/tabs/enquiries/styles/ProspectOverview.css](../../src/tabs/enquiries/styles/ProspectOverview.css). Hero is structured (main + side aside with Call/Email/Edit notes/Scan 365 + rating).
- File: [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx) — `ProspectHeroHeader` is a *second* prospect header used inside the inline workbench shell. Two prospect heroes diverge.
- Pipeline rail: same `WorkbenchJourneyRail` consumed via `InlineWorkbench`. Same overflow gap.

### 2.3 Inline Workbench

- File: [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) — large component. Hosts the workbench tab strip both prospects and matters surface. Tab strip lives inside; responsive behaviour bespoke.

### 2.4 Style tokens & primitives that already exist

- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — `helix-panel`, `helix-input`, `helix-btn-*`, `--surface-*`, `--text-*`, `--border-*`, `--shadow-*`, `--spacing-*`. Canonical chrome system. Prospects uses it; Matters does not.
- [src/app/styles/colours.ts](../../src/app/styles/colours.ts) — palette source of truth.
- [src/components/workbench/WorkbenchJourneyRail.tsx](../../src/components/workbench/WorkbenchJourneyRail.tsx) — already shared. Will be wrapped (not replaced) for the responsive overflow fix.

---

## 3. Plan

### Phase A — Shared Overview primitives + Matter migration

Create `src/components/overview/` and migrate Matter Overview onto it. Visual-only; no new endpoints.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add primitives | `src/components/overview/OverviewShell.tsx` (NEW) | Page grid: main + sidebar, collapses to single column at <=1120px. Backplate uses `--surface-page`. |
| A2 | | `src/components/overview/OverviewHero.tsx` (NEW) | Title + subtitle + status badge + AoW accent stripe. Slot for trailing actions. |
| A3 | | `src/components/overview/ContactModule.tsx` (NEW) | Replaces blending email/phone/copy line. Two large action pills (Call, Email) with copy affordance built in. Optional address + company. |
| A4 | | `src/components/overview/LifecycleRail.tsx` (NEW) | Wraps `WorkbenchJourneyRail`. Adds `overflow-x: auto`, soft fade edge, breakpoint that swaps `label` -> `shortLabel` at <900px. Collapse chevron in title bar above. |
| A5 | | `src/components/overview/SystemPanel.tsx` (NEW) | Generic backend system panel (logo + title + body slot). Replaces `backendSystemPanelStyle` usage. |
| A6 | | `src/components/overview/IdentifiersDisclosure.tsx` (NEW) | Collapsed-by-default block listing IDs with per-row + bulk copy. |
| A7 | | `src/components/overview/NextStepRail.tsx` (NEW) | Lifts the `NextStepChip` row pattern. |
| A8 | Migrate Matter Overview | [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) | Replace bespoke header + Client card + Reference card + section wrappers with primitives. |
| A9 | Drop dead styles | [src/tabs/matters/styles/matterOverview.styles.ts](../../src/tabs/matters/styles/matterOverview.styles.ts) | Remove `sectionCardStyle`, `contactRowStyle`, `copyChipStyle`, etc., once nothing references them. |
| A10 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry. |

**Phase A acceptance:**
- Matter Overview renders identical data with new chrome
- Single contact module (no parallel Quick Actions strip)
- Workbench rail scrolls horizontally at narrow widths with shortLabel below 900px
- All cards have visible side borders (no white-on-white)
- Tier checks: `isAdminUser`, `canSeeCcl`, `isLzOrAc` preserved exactly
- Diagnostics clean; staging build succeeds

### Phase B — Prospect Overview migration

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Migrate prospect hero | [src/tabs/enquiries/EnquiryOverview.tsx](../../src/tabs/enquiries/EnquiryOverview.tsx) | Replace `prospect-overview-hero` with `<OverviewHero>` + `<ContactModule>`. Keep rating + scan 365 in trailing actions slot. |
| B2 | Migrate inline hero | [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx) (`ProspectHeroHeader`) | Same primitives. Two heroes converge to one. |
| B3 | Drop dead CSS | [src/tabs/enquiries/styles/ProspectOverview.css](../../src/tabs/enquiries/styles/ProspectOverview.css) | Remove `prospect-overview-hero`, `prospect-overview-actions`, etc., once nothing references them. |
| B4 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry. |

**Phase B acceptance:**
- Prospect Overview and Matter Overview render with identical region structure
- Both use `<ContactModule>`, `<OverviewHero>`, `<LifecycleRail>`
- No regressions in claim flow, rating, scan 365, edit notes

### Phase C — Snapshot panel + identifiers consolidation

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Server aggregate | `server/routes/overviewSnapshot.js` (NEW) | `GET /api/overview/:scope/:ref` returns `{ lastActivity, lastComm, nextDeadline, outstandingAsks }`. App Insights `Overview.Snapshot.Started/Completed/Failed`. |
| C2 | | `src/components/overview/SnapshotPanel.tsx` (NEW) | Renders the four facts. Skeleton geometry. |
| C3 | Wire on both surfaces | Matter + Prospect Overview | Mount under contact module, above lifecycle rail. |
| C4 | Identifiers consolidation | Both surfaces | Replace scattered ID rows with `<IdentifiersDisclosure>`. |
| C5 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry. |

**Phase C acceptance:**
- Snapshot panel populated on both surfaces in staging
- App Insights `Overview.Snapshot.Completed` visible
- Identifier sprawl gone; one disclosure with copy-all

---

## 4. Step-by-step execution order

1. **A1-A7** primitives in dependency order
2. **A8** Matter Overview migration
3. **A9** dead style cleanup (only after A8 lands and renders correctly)
4. **A10** changelog
5. *Stop. Validate in staging. Get user sign-off.*
6. **B1, B2** in parallel
7. **B3** dead CSS cleanup
8. **B4** changelog
9. *Stop. Validate.*
10. **C1** server aggregate first, with telemetry
11. **C2, C3, C4** UI changes
12. **C5** changelog

---

## 5. Verification checklist

**Phase A:**
- [ ] Matter Overview renders without console errors against `HLX-27367-94842` (Luke Test)
- [ ] Contact module: copy email and copy phone both work, single visual unit
- [ ] LifecycleRail scrolls on narrow viewport; shortLabel kicks in at <900px
- [ ] All `sectionCardStyle` consumers replaced or removed
- [ ] `npm run build` succeeds
- [ ] Babel TSX parse OK on changed files
- [ ] Staging deploy renders correctly for both pipeline-linked and legacy matters

**Phase B:**
- [ ] Prospect Overview claim flow still works
- [ ] Rating still editable; Scan 365 still works
- [ ] No two heroes (only one shared primitive renders)

**Phase C:**
- [ ] App Insights `Overview.Snapshot.Completed` and `.Failed` visible
- [ ] SQL spot check: snapshot data matches direct Clio query for one matter

---

## 6. Open decisions (defaults proposed)

1. **Component location** Default: `src/components/overview/`. Rationale: cross-surface, not tab-scoped.
2. **Backplate colour** Default: `var(--surface-page)`. Rationale: matches current right-column treatment in matters.
3. **Snapshot endpoint scope** Default: one route, `:scope` discriminator (`prospect|matter`). Rationale: lets us add closed-matter recap later without forking.
4. **Pipeline rail breakpoints** Default: full label >=900px, shortLabel >=600px, icon-only <600px.

---

## 7. Out of scope

- Anything in `submodules/`
- Tabs other than Overview
- Inline Workbench tab strip refactor (separate concern)
- Schema or Clio API changes
- New Clio fields surfaced

---

## 8. File index (single source of truth)

Client:
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx)
- [src/tabs/matters/styles/matterOverview.styles.ts](../../src/tabs/matters/styles/matterOverview.styles.ts)
- [src/tabs/enquiries/EnquiryOverview.tsx](../../src/tabs/enquiries/EnquiryOverview.tsx)
- [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx)
- [src/tabs/enquiries/styles/ProspectOverview.css](../../src/tabs/enquiries/styles/ProspectOverview.css)
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx)
- [src/components/workbench/WorkbenchJourneyRail.tsx](../../src/components/workbench/WorkbenchJourneyRail.tsx)
- `src/components/overview/OverviewShell.tsx` (NEW)
- `src/components/overview/OverviewHero.tsx` (NEW)
- `src/components/overview/ContactModule.tsx` (NEW)
- `src/components/overview/LifecycleRail.tsx` (NEW)
- `src/components/overview/SystemPanel.tsx` (NEW)
- `src/components/overview/IdentifiersDisclosure.tsx` (NEW)
- `src/components/overview/NextStepRail.tsx` (NEW)
- `src/components/overview/SnapshotPanel.tsx` (NEW Phase C)
- `src/components/overview/overview.css` (NEW)

Server:
- `server/routes/overviewSnapshot.js` (NEW Phase C)

### Stash metadata (REQUIRED)

```yaml
# Stash metadata
id: unified-overview-surface-for-prospects-and-matters
verified: 2026-05-12
branch: main
touches:
  client:
    - src/tabs/matters/MatterOverview.tsx
    - src/tabs/matters/styles/matterOverview.styles.ts
    - src/tabs/enquiries/EnquiryOverview.tsx
    - src/tabs/enquiries/EnquiryTimeline.tsx
    - src/tabs/enquiries/styles/ProspectOverview.css
    - src/components/overview/**
  server:
    - server/routes/overviewSnapshot.js
  submodules: []
depends_on: []
coordinates_with:
  - deploy-warning-lint-cleanup
  - helix-rehearsal-record-luke-test-as-firm-seed
  - pitch-builder-header-rework-multi-pitch-identity
conflicts_with: []
```

---

## 9. Gotchas appendix

- `MatterOverview.tsx` `showDestinations` default — preserve any prop defaults when extracting the Client card.
- `ProspectHeroHeader` in `EnquiryTimeline.tsx` is NOT the same hero as `EnquiryOverview.tsx`. Both must migrate.
- `WorkbenchJourneyRail` is consumed in multiple places. Wrap, don't change its props.
- `helix-panel` CSS class already exists and is canonical do not invent a new one in `mergeStyles`.
- The right-column `colours.grey` background in matters is what gives those cards visible edges. Phase A keeps that backplate but extends it across the whole page.
- Tier checks in Matter Overview: `isAdminUser` (CCL editor button), `isCclUser` (CCL card visibility), `canSeeCcl` (rail stage). Preserve exactly.
- ACID column: only present on new-space enquiries with `acid` field. Do NOT fall back to `ID`/`id`.
- Demo matter `HLX-27367-94842` (Luke Test) is the smoke-test target; never delete.
- Don't introduce em or en dashes in any new code or comments.
