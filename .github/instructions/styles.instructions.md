---
applyTo: "src/app/styles/**"
---

# Styles Rules (auto-attached)

## Canonical source
- `colours.ts` is the single source of truth for all colour tokens. Never invent hex values.
- `design-tokens.css` provides CSS custom properties and utility classes. New components must use these.

## Adding colours
- If a needed colour is missing, add it to `colours.ts` first, then consume the token. Never inline a new hex.
- Area of Work colours are canonical — see the table in `copilot-instructions.md`. No substitutions.

## Off-brand violations to watch
- Tailwind defaults: `#0ea5e9`, `#60a5fa`, `#22c55e`, `#4ade80`, `#f59e0b`
- Material Design: `#FFB74D`, `#E65100`, `#FF9800`
- Other: `#10b981`, `#8b5cf6`, `#ef4444`, `#E53935`, `#0078d4`
- The only orange is `#FF8C00` (`colours.orange`). The only green is `#20b26c` (`colours.green`).

## Theme support
- All tokens resolve via `[data-theme]` attribute — dark/light/high-contrast automatically.
- Use `var(--surface-section)` not `colours.dark.sectionBackground` in new CSS.
