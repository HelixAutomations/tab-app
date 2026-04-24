# Enquiries live-feed freshness wiring

> **Purpose of this document.** Self-contained brief for wiring the existing `useFreshIds` append-only animation primitive into the Enquiries tab. Deferred from the cross-app rollout shipped 2026-04-19 because [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) is ~5,000 lines with multiple list/group rendering layers and warranted a focused slice.
>
> **How to use it.** Read in full. Implement Phase A first (single list path). Phase B (mixed-display + grouped + shared-history) only after A ships and is observed clean.
>
> **Verified:** 2026-04-19 against branch `main`.

---

## 1. Why this exists (user intent)

The user asked to "scope this across the app where we can have a live feed being appended to with a subtle, consistent animation where new data is pulled, without rerendering everything." The cross-app rollout (changelog 2026-04-19 "Append-only live-feed animation primitive") wired 10 surfaces using a shared [src/hooks/useFreshIds.ts](../../src/hooks/useFreshIds.ts) hook + a single `[data-fresh="true"]` CSS rule in [src/app/styles/animations.css](../../src/app/styles/animations.css).

Enquiries was deliberately deferred — too many overlapping render paths to wire safely in the same slice. This brief picks that up.

The user is **not** asking to refactor Enquiries' data flow or the SSE subscription. The contract is: when a new enquiry arrives via the existing app-shell SSE stream, the new card subtly fades/translates in; existing cards stay still. No state churn, no key changes, no layout shifts.

---

## 2. Current state — verified findings

### 2.1 Shared primitive (already shipped — do not modify)

- [src/hooks/useFreshIds.ts](../../src/hooks/useFreshIds.ts) — `useFreshIds<T>(items, getId, ttlMs=600): Set<string>`. Skips first render (no bulk animate on mount), per-id setTimeout cleanup, returns empty set when `prefers-reduced-motion: reduce`.
- [src/app/styles/animations.css](../../src/app/styles/animations.css) — `[data-fresh="true"] { animation: fadeInUp 220ms ease-out both; }`.

### 2.2 Enquiries data flow

- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) L1657–1660 — subscribes to the app-shell's single SSE stream (no duplicate EventSource). Appends/patches into `enquiries` state.
- L1164 — initial fetch via `/api/enquiries-unified`.
- L2655 — `sortedEnquiries` useMemo.
- L3861 — `filteredEnquiries` useMemo (downstream of sortedEnquiries).
- L4184 — `filteredEnquiriesWithSharedHistory` useMemo (augments with shared-prospect rows).
- L4378 — `getMixedEnquiryDisplay([...filteredEnquiriesWithSharedHistory])` builds the final display list (interleaved/grouped).

### 2.3 Render layers (the reason this was deferred)

The list does NOT render `filteredEnquiries.map(...)` directly in one place. Instead the display list is built by `getMixedEnquiryDisplay` and rendered through three card components depending on item kind:

- [src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx](../../src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx) — unclaimed leads.
- [src/tabs/enquiries/ClaimedEnquiryCard.tsx](../../src/tabs/enquiries/ClaimedEnquiryCard.tsx) — claimed leads.
- [src/tabs/enquiries/GroupedEnquiryCard.tsx](../../src/tabs/enquiries/GroupedEnquiryCard.tsx) — grouped/shared-prospect rows; renders MULTIPLE inner enquiries.

Each card already accepts standard props from its parent map. None currently support `data-fresh`. The wrapping `<div>`/root element of each card needs to either accept `isFresh: boolean` and apply `data-fresh` itself, OR the parent wraps each card in a `<div data-fresh=...>` (cleaner — no card edits needed for the simple cases, but breaks layout if cards rely on being direct grid/flex children).

**Decision needed (see §6):** wrapper-div vs prop drill.

### 2.4 ID surface

Enquiries records have a stable `getRecordKey(enquiry)` helper used at L4191 — same key the existing diff/dedup logic uses. Use this verbatim for `useFreshIds`.

---

## 3. Plan

### Phase A — Single render path (unclaimed + claimed, no grouping)

Goal: get visible animation working on the dominant card render path, validate behaviour, then expand.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Import `useFreshIds` and compute `freshIds` from the displayed list | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) | Place after `filteredEnquiriesWithSharedHistory` (L4222). Use the same `getRecordKey` helper as the dedup path. |
| A2 | Pass `isFresh` boolean into `NewUnclaimedEnquiryCard` and `ClaimedEnquiryCard` at the call site | Enquiries.tsx | At each `<Card ... />` in the display loop. |
| A3 | Add optional `isFresh?: boolean` prop to both card components and apply `data-fresh={isFresh ? 'true' : undefined}` to the card root element | [NewUnclaimedEnquiryCard.tsx](../../src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx), [ClaimedEnquiryCard.tsx](../../src/tabs/enquiries/ClaimedEnquiryCard.tsx) | Root `<div>` only. |

**Phase A acceptance:**
- New unclaimed enquiry arrives via SSE → its card fades in subtly (220ms), no other cards re-render or shift.
- Tab mount does NOT bulk-animate every visible card (the hook's first-render seeding handles this).
- `prefers-reduced-motion: reduce` → no animation anywhere on the tab.

### Phase B — Grouped cards + shared-history augmentations

Goal: handle the cards that wrap multiple enquiries.

#### B1. GroupedEnquiryCard

A grouped card represents N enquiries. Decision: the GROUP card animates if ANY of its inner enquiries are fresh. Extend `useFreshIds` consumer to compute `isFresh = group.enquiries.some(e => freshIds.has(getRecordKey(e)))`. Apply `data-fresh` to the group card root in [GroupedEnquiryCard.tsx](../../src/tabs/enquiries/GroupedEnquiryCard.tsx).

#### B2. Shared-prospect augmented rows

[Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) L4192–4221 inserts additional rows into `augmented` from `sharedProspectHistoryMap`. These are NOT new arrivals — they're surfaced existing records. They must NOT animate. Confirm `getRecordKey` of these augmented rows matches the existing freshness exclusion (they were already in `knownIdsRef` from the initial seed).

If it turns out shared-history rows have `getRecordKey` collisions with arriving enquiries, switch the freshness key to `${getRecordKey(e)}|${e.source ?? 'primary'}` to disambiguate.

---

## 4. Step-by-step execution order

1. **A1** — add hook import + `freshIds` computation in Enquiries.tsx after L4222.
2. **A3** — add `isFresh` prop to both single-record card components (low risk — purely additive prop).
3. **A2** — wire `isFresh={freshIds.has(getRecordKey(e))}` at the call sites in Enquiries.tsx.
4. **Validate Phase A** — run `npm run dev:all`, observe a fresh enquiry arrive (or trigger via test SSE), confirm only the new card animates, no jank, no layout shift.
5. **B1** — add `isFresh` to GroupedEnquiryCard and the group-level `.some()` check at the call site.
6. **B2** — verify shared-history rows do not flicker; if they do, apply the disambiguated key.
7. **get_errors** on all four files.
8. Add a single changelog entry: `2026-MM-DD / Wire append-only animation into Enquiries / Wired useFreshIds across the unclaimed, claimed, and grouped enquiry cards so newly arrived SSE enquiries fade in without re-rendering the list. (~ src/tabs/enquiries/Enquiries.tsx, ~ src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx, ~ src/tabs/enquiries/ClaimedEnquiryCard.tsx, ~ src/tabs/enquiries/GroupedEnquiryCard.tsx)`
9. `node tools/stash-close.mjs enquiries-live-feed-freshness-wiring && node tools/stash-status.mjs`.

---

## 5. Verification checklist

**Phase A:**
- [ ] Mounting Enquiries tab shows ZERO row animations (first-render seeded).
- [ ] Newly arrived enquiry (via SSE) animates exactly once, ~220ms fadeInUp.
- [ ] No surrounding cards reflow or restyle.
- [ ] DevTools "Highlight updates when components render" shows only the new card painting (not the whole list).
- [ ] `prefers-reduced-motion: reduce` (set via OS) → no animation.

**Phase B:**
- [ ] When a fresh enquiry lands inside an existing grouped card, the group card animates (single fade), inner items do not animate independently.
- [ ] Shared-history rows added by L4192–4221 never animate.

---

## 6. Open decisions (defaults proposed)

1. **Wrapper div vs `isFresh` prop on card** — Default: **`isFresh` prop on each card component**. Rationale: the card root element is what carries layout-relevant styles (grid placement, hover affordances). A wrapper div would break those contracts and risk shifting.
2. **Group-card freshness rule** — Default: **animate the group card if ANY inner enquiry is fresh**. Rationale: grouped cards visually represent the cluster; per-inner animation inside a single card is busy and inconsistent with the rest of the app.
3. **Freshness key** — Default: **`getRecordKey(e)` (existing helper)**. Rationale: matches the existing dedup contract; only switch to disambiguated form if §B2 surfaces a collision.

---

## 7. Out of scope

- Refactoring `getMixedEnquiryDisplay` or the shared-history augmentation logic.
- Changing `useFreshIds` itself or the global CSS rule.
- Pagination/infinite-scroll loading paths (`itemsToShow` increments at L4480) — those are existing records becoming visible, not arrivals; they should not animate. The hook's first-render seeding plus the sortedEnquiries ordering means they already won't.
- Enquiry detail pane / workbench layer — different render path, not user-visible as a "live feed".

---

## 8. File index (single source of truth)

Client:
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — orchestrator; `freshIds` computation + prop wiring.
- [src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx](../../src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx) — accept `isFresh`, apply `data-fresh`.
- [src/tabs/enquiries/ClaimedEnquiryCard.tsx](../../src/tabs/enquiries/ClaimedEnquiryCard.tsx) — same.
- [src/tabs/enquiries/GroupedEnquiryCard.tsx](../../src/tabs/enquiries/GroupedEnquiryCard.tsx) — same; group-level fresh derived via `.some()`.
- [src/hooks/useFreshIds.ts](../../src/hooks/useFreshIds.ts) — read-only, do not modify.
- [src/app/styles/animations.css](../../src/app/styles/animations.css) — read-only, the `[data-fresh="true"]` rule already exists.

Server:
- (none — purely client-side)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — single entry on completion.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: enquiries-live-feed-freshness-wiring
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/enquiries/Enquiries.tsx
    - src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx
    - src/tabs/enquiries/ClaimedEnquiryCard.tsx
    - src/tabs/enquiries/GroupedEnquiryCard.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```

---

## 9. Gotchas appendix

- The app-shell holds the SOLE SSE connection (Enquiries.tsx L1657–1660). Do not open another EventSource — the freshness signal is just "did this id appear in the displayed list since last render".
- `getMixedEnquiryDisplay` is order-sensitive: it interleaves grouped/individual cards. Compute `freshIds` from the FLAT input (`filteredEnquiriesWithSharedHistory`), not from the mixed output, so the key set is stable regardless of display strategy.
- The shared-history augmentation at L4192–4221 mutates `augmented` in place and returns it. Those inserted rows are pre-existing records — they were seeded into `knownIdsRef` on first render, so they will NOT trigger animation. If they do, the freshness key may be colliding (see §6 decision 3).
- `useFreshIds` returns a NEW Set instance on each batch of fresh ids. Do not memoize cards on `freshIds.has(...)` result alone — pass the boolean and let React's prop diff handle it.
- Reduced-motion is honoured at the hook level (returns empty set), NOT via a CSS media query. Do not add a `@media (prefers-reduced-motion)` override — it already works.
- `pulse` endpoint at L1739 (`/api/enquiries-unified/pulse`) is a separate health/staleness check, unrelated to row freshness. Ignore.
