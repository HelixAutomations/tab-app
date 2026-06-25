# Marketing reporting tab expansion

> **Purpose of this document.** Park the agreed scope for the Marketing SEO surface so implementation can continue without re-litigating direction in chat.
>
> **How to use it.** Start with Phase A and keep scope strict: the Marketing SEO card/page gets a ClickUp snapshot lane alongside existing SEO analytics evidence. Do not branch into Reports rework, PPC rebuild, or Email in this brief.
>
> **Verified:** 2026-06-24 against branch `main`.

---

## 1. Why this exists (user intent)

The immediate ask is to scope the SEO page inside Marketing so it can show ClickUp snapshot data for SEO/content work. ClickUp remains the operational source of truth. Hub should use a cheap browser crawl, or a pasted crawl result, to surface the current shape of the work without building a new workflow system.

Requested shape:
- Marketing remains the primary masthead for this work.
- SEO is the immediate channel page to finish.
- The SEO card/page should show ClickUp snapshot data: list/project structure, status counts, headline totals, and visible task context where available.
- Existing SEO analytics/charts from the Reports marketing performance surface remain useful evidence and should support the Marketing SEO page rather than be replaced.
- No new local persistence is required for the first slice. ClickUp stays live source; Hub shows the latest crawl snapshot.

Not requested in this scope:
- A full Reports tab rebuild.
- A PPC rebuild. PPC remains paid-search analytics unless explicitly changed.
- Email work.
- Full automation of every ClickUp detail on day one.
- Broad Marketing redesign beyond the SEO ClickUp snapshot lane.

---

## 2. Current state - verified findings

### 2.1 Marketing tab composition

- File: [src/tabs/marketing/MarketingHome.tsx](../../src/tabs/marketing/MarketingHome.tsx) - Marketing uses streamed datasets and routes into `MarketingPerformanceWorkspace`.
- File: [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) - page keys are currently scoped to `seo`, `ppc`, and `email` via `MarketingWorkspacePageKey`.

### 2.2 SEO and channel analytics footing

- File: [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) - timeline and value-sheet logic already aggregate SEO and PPC metrics; SEO spend estimate is currently modelled in-code (`SEO_MONTHLY_COST`, `SEO_MONTHS_INCLUDED`).
- File: [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) - existing analytics feeds exist for GA4 and Google Ads and are already used by reporting/stream surfaces.
- File: [src/tabs/Reporting/MarketingPerformanceReport.tsx](../../src/tabs/Reporting/MarketingPerformanceReport.tsx) - the Reports marketing performance surface already has `SeoSourceBanner`, organic sessions, organic enquiries, enquiry rate, source rows, landing-page rows, and GA4 website performance charts. Marketing SEO should borrow this evidence shape rather than invent a separate analytics story.

### 2.3 Marketing SEO entry path

- File: [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) - `channelJourneyBanners` defines SEO, PPC, and Email entry cards. `renderMarketingChannelEntries` opens the SEO/PPC channel pages by setting `activePage` to `seo` or `ppc`.
- File: [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) - `effectiveChannelPage` already switches the channel page between SEO and PPC, so the ClickUp snapshot lane belongs in the SEO branch of this existing channel surface.

### 2.4 ClickUp snapshot proof from browser crawl

The user shared the current ClickUp All Tasks page for SwishDM. The crawl proved that the All Tasks view exposes enough structural data through the DOM/accessibility tree for repeatable snapshot extraction.

Project totals from the current snapshot:

| ClickUp list | Total | Visible status breakdown |
|---|---:|---|
| Helix Content | 382 | published this month 45; scheduled 3; approved/complete 6; waiting approval 6; update/editing required 7; In progress 9; planning 10; order content 3; pipeline 293 |
| Helix Tasks | 30 | client approval 1; in review 5; waiting 1; In progress 1; todo 16; planning 6 |
| Helix Dev | 1 | in review 1; ideas 0 |
| Helix Reports | 1 | ideas 1 |
| DPR Coverage Tracker | 4 | to do 4 |

The SEO page story is therefore: analytics show demand and outcomes; ClickUp shows effort in motion. The stakeholder headline is 382 content items, 293 in pipeline, 45 published this month, 30 broader SEO tasks, plus related Dev, Reports, and DPR work.

### 2.5 Behavioural gaps to lock

- SEO report confusion exists when legacy report expectations persist. Direction is to keep SEO experience in Marketing and avoid jump-outs to Reports for the primary user path.
- The ClickUp snapshot should be shown as point-in-time operational context, not as a Hub-owned workflow or a synced database.
- Task names and assignees are useful later, but list/status totals are the first reliable crawl contract. Assignees may be avatar-only in the DOM and should not block Phase A.

---

## 3. Plan

### Phase A - SEO page completion with ClickUp snapshot lane

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Keep SEO click-through inside Marketing | [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) | Ensure SEO card to detail flow lands in Marketing SEO page, not Reports routing. |
| A2 | Add ClickUp SEO effort snapshot block | [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) | Add headline counters from ClickUp: Helix Content total, pipeline, published this month, waiting approval, in progress, plus Helix Tasks total and active task buckets. |
| A3 | Add related-work project strip | [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) | Show Helix Dev, Helix Reports, and DPR Coverage Tracker as small supporting tiles so the SEO page shows the full SwishDM structure behind the work. |
| A4 | Add snapshot provenance label | [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) | Include `last crawled`, `source: ClickUp All Tasks - #SwishDM`, and a note that ClickUp remains source of truth. |

**Phase A acceptance:**
- SEO detail view sits entirely in Marketing.
- SEO includes ClickUp effort evidence next to or under the existing analytics evidence.
- Snapshot is clearly marked as snapshot, not implied live sync.
- The visible numbers reconcile to the ClickUp list totals: Content 382, Tasks 30, Dev 1, Reports 1, DPR 4.

### Phase B - Cheap repeatable crawl, no Hub storage yet

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Preserve crawl runner instructions | [docs/notes/MARKETING_REPORTING_TAB_EXPANSION.md](./MARKETING_REPORTING_TAB_EXPANSION.md) | Keep the repeatable browser-crawl method in this brief until a script is promoted. |
| B2 | Define snapshot JSON shape | Future script or route | Shape should hold `capturedAt`, `sourceUrl`, `lists[]`, `statuses[]`, optional visible task samples, and extraction confidence. |
| B3 | Defer persistence | n/a | No table required for this slice; ClickUp remains live source and Hub can use the latest crawl result or pasted snapshot. |

**Phase B acceptance:**
- Crawl can be repeated from the same ClickUp All Tasks page and recreate the five-list status summary.
- The snapshot shape can be pasted into the UI or wired later without schema churn.
- No new database table is required for first release.

### Phase C - Granular extraction later

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Add task-level crawl detail | Future script | Only if useful: expand groups and collect task titles/owners where exposed. |
| C2 | Add persisted crawl history | Future server route/table | Only if trend-over-time is needed inside Hub. Until then, do not build storage just because it is possible. |

**Phase C acceptance:**
- The page can move from list/status totals to richer task samples without changing the top-level SEO card contract.

---

## 4. Step-by-step execution order

1. **A1** - lock SEO navigation to Marketing detail flow.
2. **A2** - add ClickUp SEO effort snapshot headline block.
3. **A3** - add supporting project tiles for Dev, Reports, and DPR.
4. **A4** - add snapshot provenance labels.
5. **B1** - preserve the browser crawl recipe below.
6. **B2** - define or wire a simple snapshot JSON shape.
7. **B3** - keep persistence out unless trend history becomes necessary.
8. **C1/C2** - only after the summary snapshot is useful, add task-level granularity or persisted history.

---

## 5. Verification checklist

**Phase A:**
- [ ] Clicking into SEO from Marketing remains inside Marketing surface.
- [ ] SEO page shows ClickUp snapshot cards: Content 382, Content pipeline 293, published this month 45, Tasks 30, DPR 4.
- [ ] Snapshot cards show `last crawled` provenance and `source: ClickUp All Tasks - #SwishDM`.
- [ ] Existing SEO analytics evidence remains visible: organic sessions, organic enquiries, enquiry rate/source rows, or their Marketing equivalents.

**Phase B:**
- [ ] Browser crawl can recreate all five list totals from the All Tasks view.
- [ ] Snapshot JSON reconciles status buckets to list totals.
- [ ] No new DB/table is required for first release.

**Phase C (optional):**
- [ ] Task-level samples can be collected where titles are exposed without navigating away.
- [ ] Any future persistence is explicitly justified by trend/history needs.

---

## 6. Open decisions (defaults proposed)

1. **Snapshot source for SEO content lane** - Default: **ClickUp All Tasks browser crawl**. Rationale: proven cheap and exposes the required project/status structure without client data.
2. **Where to persist** - Default: **do not persist in Hub for Phase A**. Rationale: ClickUp is the operational source of truth; Hub only needs a current snapshot for the Marketing SEO page.
3. **Granularity** - Default: **list/status totals first, task samples second**. Rationale: totals already answer the stakeholder question; task-level detail can follow.
4. **Ambiguous wording in call notes** - Default: **place this under SEO, not PPC**. Rationale: the source is SEO/content effort and supports the SEO report/organic evidence. PPC remains paid-search analytics unless explicitly changed.

---

## 7. Out of scope

- Rebuilding the Reports tab information architecture.
- Implementing full real-time bi-directional sync to every external marketing system.
- Building Email in this slice.
- Large Marketing UI overhaul outside the SEO channel page.
- Production deployment actions in this brief.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/marketing/MarketingHome.tsx](../../src/tabs/marketing/MarketingHome.tsx) - Marketing tab mount and workspace wiring.
- [src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx](../../src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx) - SEO/PPC page orchestration and value/timeline surfaces.
- [src/tabs/Reporting/MarketingPerformanceReport.tsx](../../src/tabs/Reporting/MarketingPerformanceReport.tsx) - existing SEO source banner and analytics evidence shape to mirror/support.

Server:
- [server/routes/marketing-metrics.js](../../server/routes/marketing-metrics.js) - analytics inputs for SEO/PPC surfaces.

Docs:
- [docs/notes/MARKETING_REPORTING_TAB_EXPANSION.md](./MARKETING_REPORTING_TAB_EXPANSION.md) - this stash brief.
- [docs/notes/MARKETING_TIMELINE_ATTRIBUTION_WORKBENCH.md](./MARKETING_TIMELINE_ATTRIBUTION_WORKBENCH.md) - adjacent FYTD timeline direction.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: marketing-reporting-tab-expansion
verified: 2026-06-24
branch: main
touches:
  client:
    - src/tabs/marketing/MarketingHome.tsx
    - src/tabs/marketing/parts/MarketingPerformanceWorkspace.tsx
    - src/tabs/Reporting/MarketingPerformanceReport.tsx
  server:
    - server/routes/marketing-metrics.js
  submodules: []
depends_on: []
coordinates_with:
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - reports-data-hub-dataset-provider-migration
conflicts_with: []
```

---

## 9. Gotchas appendix

- SEO in this scope includes a ClickUp content/effort snapshot lane, but snapshot does not imply live integration. Keep that distinction visible in UI text.
- Stage and production drift has already occurred during this stream of work. Verify target environment before stakeholder walkthroughs.
- If a future agent sees the phrase "PPC space" in chat, check intent before moving this work under paid search. The current corrected scope is Marketing SEO.

### 9.1 Repeatable ClickUp browser crawl recipe

Use this when the operator has logged into ClickUp and shared the `All Tasks - #SwishDM` page. Do not open extra ClickUp pages for this first crawl. Stay on the shared All Tasks view.

1. Read the current page DOM/accessibility tree.
2. Identify the internal scroll container: `.cu-if-not-task-view-scroll` or the largest scrollable element with `scrollHeight > clientHeight`.
3. Extract list headers from elements whose class contains `list-group__heading`, `cu-list-group__name`, `group-by__heading`, `group-name`, or `list-name`.
4. Extract status groups as adjacent label/count pairs. Current proven sequence:
   - Helix Tasks: client approval 1; in review 5; waiting 1; In progress 1; todo 16; planning 6.
   - Helix Content: published this month 45; scheduled 3; approved/complete 6; waiting approval 6; update/editing required 7; In progress 9; planning 10; order content 3; pipeline 293.
   - Helix Dev: in review 1; ideas 0.
   - Helix Reports: ideas 1.
   - DPR Coverage Tracker: to do 4.
5. Reconcile each list total against the visible sidebar/list totals: Content 382, Tasks 30, Dev 1, Reports 1, DPR 4.
6. Treat task names and assignees as optional samples. Some task titles render in the DOM; assignees may be avatar-only and not reliably exposed without opening task details.

Useful Playwright DOM probes:

```js
const scrollInfo = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*'))
    .filter((el) => {
      const style = window.getComputedStyle(el);
      return ['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 40;
    })
    .map((el) => ({
      tag: el.tagName,
      className: String(el.className || '').slice(0, 120),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }));
});

const snapshot = await page.evaluate(() => {
  const structure = [];
  document.querySelectorAll('[class*="list-group__heading"], [class*="cu-list-group__name"], [class*="group-by__heading"], [class*="group-name"], [class*="list-name"]').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) structure.push({ type: 'list', text });
  });
  document.querySelectorAll('[class*="status-group"], [class*="cu-status-group"], [class*="group-header"]').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) structure.push({ type: 'status-or-count', text });
  });
  return structure;
});
```
