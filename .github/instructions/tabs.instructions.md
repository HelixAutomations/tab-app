---
applyTo: "src/tabs/**"
---

# Tab Rules (auto-attached)

## Structure
- Each tab lives in `src/tabs/<name>/` with an index component and supporting files.
- Tabs over **3,000 lines** must be decomposed. Use `parts/` or co-located sub-components.
- Keep data-fetching hooks separate from rendering where possible.

## UX bar
- Every interaction must feel snappy and intentional. Stale counts, layout jank, and flickering are bugs.
- Use structural loading (skeletons matching settled layout) — never spinners that shift content.
- Long-running operations must surface progress to the user (SSE events → status strip).

## Data scope
- Use `isDevOwner()` for data-scope decisions (fetch all vs fetch mine). Never `isAdminUser()`.
- Use `isAdminUser()` for feature gating (show/hide UI). Never for data scope.
- Dev preview features: gate behind `isLzOrAc` inline check until ready for wider rollout.

## Dark mode
- Body text: use `#d1d5db` (warm grey), never `colours.dark.subText` (#3690CE) which is blue-on-blue.
- Surface depth: follow the dark-mode ladder in `colours.ts` (`dark.background` → `dark.sectionBackground` → `dark.cardBackground` → `dark.cardHover`).
