# Home billing skeleton contract

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During Home boot tracing, the user called out that "billing skeletons don't show a true reflection of the billing KPI metric cards almost in the home ui." The request was not to redesign billing logic; it was to make the loading contract structurally honest so the reveal feels deliberate and premium.

This brief parks the larger follow-up instead of mixing it into the smaller Home boot truthfulness pass. The outcome is a shared billing loading contract that matches the real KPI rail rather than a separate approximate placeholder that will keep drifting.

---

## 2. Current state — verified findings

### 2.1 Home shell fallback

- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L6133) mounts `HomeDashboardSkeleton` as the Suspense fallback for the unified Home dashboard before the live `OperationsDashboard` renders.
- The Home shell therefore treats [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) as the source of truth for pre-hydration structure, even though the real billing rail lives elsewhere.

### 2.2 Skeleton implementation diverges from live billing rail

- File: [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx#L314) hard-codes a four-cell billing grid under `HomeDashboardSkeleton`.
- File: [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx#L320) renders four identical skeleton cells with only label, primary number, and one muted row.
- File: [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx#L329) adds a generic footer row, but it does not mirror the live outstanding summary/footer contract.
- File: [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css#L110) fixes the skeleton billing grid to four columns on desktop and two on mobile, independently of the live component contract.

### 2.3 Live billing rail has richer structure and different grouping rules

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L3335) derives `billingMetrics` by filtering out the outstanding metric, which is then rendered separately.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L5114) renders the billing rail with a distinct loading state inside `OperationsDashboard`.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L5134) already contains a more faithful internal loading layout than the Home shell fallback.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L5160) renders live metric tiles with inline secondary values, previous-period rows, and progress bars.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L5206) renders outstanding as a separate footer strip with an optional "Open breakdown" affordance.

### 2.4 Consequence

- The user sees a Home loading placeholder that suggests a simpler layout than the one that actually appears. The mismatch is not a data bug; it is a duplicated UI contract split across Home and OperationsDashboard.

---

## 3. Plan

### Phase A — Extract a shared billing loading contract

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Extract billing loading component | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) or a new sibling component | Move the billing loading UI into a reusable component that can render both shell fallback and in-component loading from the same contract. |
| A2 | Replace Home shell placeholder | [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) | Stop hand-maintaining a second approximation of the billing rail. |
| A3 | Keep responsive layout shared | [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) and/or component-local styles | Remove any layout rules that only exist for the legacy skeleton if the shared component owns them. |

**Phase A acceptance:**
- The billing skeleton uses the same grouping rule as the live rail: core metrics in tiles, outstanding in a separate footer row.
- The placeholder shows the same structural cues as live billing: inline secondary slot, progress bar region, and previous-period row.
- Home shell fallback and in-dashboard loading no longer drift independently.

### Phase B — Tighten the contract between metric count and placeholder count

#### B1. Derive skeleton tile count from the same source as live metrics

Use the same filtered metric set that produces `billingMetrics` so the placeholder does not assume a fixed tile count when the live rail changes.

#### B2. Decide where the source of truth lives

Default: keep the source of truth with the live billing rail in `OperationsDashboard`, and let Home consume that contract rather than duplicating it in `HomeSkeletons`.

---

## 4. Step-by-step execution order

1. **A1** — identify the smallest reusable boundary for the billing loading UI.
2. **A2** — extract the shared loading component without changing live metric formatting.
3. **A3** — swap `HomeDashboardSkeleton` to that shared billing loader.
4. **B1** — derive placeholder tile count from the same filtered live metric set.
5. **B2** — remove legacy CSS/layout assumptions that only served the old Home-only skeleton.

---

## 5. Verification checklist

**Phase A:**
- [ ] Home loading shows a billing placeholder that matches the live rail structure instead of a simplified proxy.
- [ ] `OperationsDashboard` loading and Home shell fallback visibly match on desktop and mobile.

**Phase B:**
- [ ] Changing the billing metric grouping in `OperationsDashboard` does not require a second manual edit in `HomeSkeletons`.
- [ ] `logs/changelog.md` includes a user-facing note for the loading-contract change.

---

## 6. Open decisions (defaults proposed)

1. **Shared component home** — Default: **place it near `OperationsDashboard`**. Rationale: the live rail already defines the real contract.
2. **Count of visible billing tiles** — Default: **derive from filtered live metrics rather than hard-coding four cells**. Rationale: the placeholder should follow data contract changes automatically.

---

## 7. Out of scope

- Reworking the meaning or calculation of billing metrics.
- Home boot timing, server critical path, or SSE lifecycle changes.
- Conversion, pipeline, or team skeleton redesign outside the billing rail.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — mounts the Home shell fallback and live dashboard.
- [src/tabs/home/HomeSkeletons.tsx](../../src/tabs/home/HomeSkeletons.tsx) — current duplicated Home billing skeleton contract.
- [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css) — current Home-specific skeleton grid rules.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — live billing rail and its internal loading structure.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per shipped phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: home-billing-skeleton-contract
shipped: true
shipped_on: 2026-04-19
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/tabs/home/HomeSkeletons.tsx
    - src/tabs/home/EnhancedHome.css
    - src/components/modern/OperationsDashboard.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-boot-backend-critical-path
conflicts_with: []
```

---

## 9. Gotchas appendix

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L6133) uses Suspense fallback, so any extracted loading component needs to be cheap and self-contained.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx#L3335) deliberately splits `billingMetrics` from `outstandingMetric`; do not collapse outstanding back into the main tile row just to simplify the skeleton.
- [src/tabs/home/EnhancedHome.css](../../src/tabs/home/EnhancedHome.css#L110) currently encodes skeleton layout assumptions that may become dead CSS once the shared contract lands.
