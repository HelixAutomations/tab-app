---
applyTo: "src/components/**"
---

# Component Rules (auto-attached)

Last verified: 2026-05-23

## Sizing & splitting
- Components over **3,000 lines** must be split. Run `npm run check-sizes` to check.
- Extract reusable sub-components into the same directory or a `parts/` sub-folder.

## Styling
- New components **must** use CSS classes from `src/app/styles/design-tokens.css`, not inline styles.
- Dynamic-only values (runtime calc, conditional opacity) are the sole exception for inline styles.
- Colours must come from `src/app/styles/colours.ts` tokens, never invent hex values.
- Full brand palette, AoW table, dark-surface ladder, and design rules live in [styles.instructions.md](styles.instructions.md).

## Performance
- Wrap expensive derived values in `useMemo` / `useCallback` with correct deps.
- Avoid anonymous closures in JSX `onClick` for list items, extract or memoize.
- Never fetch unbounded data without pagination or limits.

## Helix look and feel
- Reference implementation is `src/components/UserBubble.tsx` (the command centre modal). When UserBubble updates, downstream components follow.
- Full design system reference: `docs/COMPONENT_STYLE_GUIDE.md`.
- Do NOT guess look-and-feel from older components, many pre-date the standard.

## Patterns
- `borderRadius: 0` everywhere (999 for pills, 50% for dots only).
- Font: Raleway for all headings and UI text.
- Loading: structural skeletons that match the settled layout. No spinners that shift content.
- Toast feedback for every state change.
- Interactive row gradient + lift + shadow (applyRowHover / resetRowHover).
