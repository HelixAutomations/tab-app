---
applyTo: "src/app/styles/**"
---

# Styles Rules (auto-attached)

Last verified: 2026-05-23

## Canonical source
- `colours.ts` is the single source of truth for all colour tokens. Never invent hex values.
- `design-tokens.css` provides CSS custom properties and utility classes. New components must use these.

## Brand palette (6 canonical colours)

| Brand name | Token | Hex | Role |
|------------|-------|-----|------|
| Website Blue | `websiteBlue` | `#000319` | Deepest brand navy, page-level backgrounds |
| Helix Dark Blue | `darkBlue` | `#061733` | Primary dark surface, sections, headers |
| Helix Blue | `helixBlue` | `#0D2F60` | Mid-depth navy, elevated panels, light-mode headings |
| Helix Highlight | `blue` / `highlight` | `#3690CE` | Links, active states, loading indicators |
| Helix CTA | `cta` | `#D65541` | Sole strong colour pop, action buttons, urgency |
| Helix Grey | `grey` | `#F4F4F6` | Light-mode surface fills |

Legacy alias: `missedBlue` = `helixBlue` (#0D2F60). Prefer `helixBlue` in new code.

## Supplementary tokens

| Token | Hex | Role |
|-------|-----|------|
| `highlightBlue` | `#d6e8ff` | Lightest blue tint, light-mode surface fill only. Not the primary highlight colour. |
| `accent` | `#3690CE` | Alias for Helix Highlight. Active states, sort headers, selected borders. |
| `green` | `#20b26c` | Success, ready, connected, Property AoW |
| `orange` | `#FF8C00` | Warnings, Construction AoW. The only orange. Never `#FFB74D`, `#E65100`, `#f59e0b`, `#FF9800`. |
| `yellow` | `#ffd54f` | Employment AoW |
| `greyText` | `#6B6B6B` | Secondary text (light mode), Misc/Other AoW fallback |
| `subtleGrey` | `#A0A0A0` | Tertiary text, muted labels |

## Area of Work colours (canonical)

Every AoW indicator MUST use these exact tokens. No RGB literals, no Material Design, no Tailwind.

| Area | Colour token | Hex | Dark-mode accent | Fallback |
|------|-------------|-----|-------------------|----------|
| Commercial | `colours.blue` | `#3690CE` | `colours.accent` | , |
| Construction | `colours.orange` | `#FF8C00` | `colours.orange` | , |
| Property | `colours.green` | `#20b26c` | `colours.green` | , |
| Employment | `colours.yellow` | `#ffd54f` | `colours.yellow` | , |
| Misc/Other/Unsure | `colours.greyText` | `#6B6B6B` | `colours.subtleGrey` | `colours.greyText` |

Known violations (to fix over time): InlineWorkbench uses RGB values; MattersReport uses raw hex off-palette; 15 copies of `getAreaColor` have inconsistent fallbacks. Canonical fallback is `colours.greyText`.

## Dark mode surface ladder (215° hue, tightly spaced)

| Token | Hex | Lightness | Role |
|-------|-----|-----------|------|
| `dark.background` | `#020617` | ~5% | Page canvas |
| `dark.sectionBackground` | `#051525` | ~8% | Section containers |
| `dark.cardBackground` | `#081c30` | ~11% | Card surfaces |
| `dark.cardHover` | `#0c2440` | ~14% | Hover lift |
| `dark.border` | `#374151` | , | Border base |
| `dark.borderColor` | `#4b5563` | , | Stronger border |

## Reporting panel tokens (`reportingFoundation.ts`)

| Token | Value | Purpose |
|-------|-------|---------|
| Panel base | `rgba(10, 28, 50, 0.95)` | ~11% lightness, card-level |
| Panel elevated | `rgba(14, 36, 62, 0.95)` | ~14% lightness, hover-level |
| Border base | `rgba(75, 85, 99, 0.38)` | Subtle edge |
| Border strong | `rgba(75, 85, 99, 0.55)` | Visible edge |
| Shadow | `0 4px 16px rgba(0, 0, 0, 0.4)` | Drop shadow |

## Text hierarchy inside panels (CRITICAL, prevents blue-on-blue)

Body text in dark-mode panels MUST use neutral greys, never brand blue. `colours.dark.subText` (#3690CE) is highlight blue, for links and interactive highlights only.

| Role | Dark mode | Light mode | Use |
|------|-----------|------------|-----|
| labelText | `colours.dark.text` (#f3f4f6) | `colours.light.text` (#061733) | Headings, active labels, input values |
| bodyText | `#d1d5db` (warm grey) | `#374151` (warm dark grey) | Paragraphs, descriptions, always neutral |
| helpText | `colours.subtleGrey` (#A0A0A0) | `colours.greyText` (#6B6B6B) | Tertiary guidance, timestamps |
| sectionAccent | `colours.accent` / `colours.highlight` (#3690CE) | `colours.highlight` (#3690CE) | Section titles only, anchor points |

If writing more than ~3 words, use `bodyText` or `labelText`. Brand colours are for structure (titles, dots, icons), not prose.

## Design rules

- `borderRadius: 0` everywhere. Only exceptions: `999` for pills/dots, `'50%'` for circular status indicators.
- Font: Raleway for all headings and UI text.
- One CTA pop per view. `cta` (#D65541) is the sole warm colour. Don't compete with multiple strong colours.
- `accent` and `highlight` both resolve to `#3690CE`. Use for active sort headers, selected borders, filter chips, tab underlines. Do not reintroduce the old teal/cyan accent.
- Accent sparingly at anchor points (section title bars, key structural elements). Never for widespread decoration or body text.
- `highlightBlue` (#d6e8ff) for light-mode surfaces only (hover backgrounds, selected rows, badge fills).
- True "highlight blue" naming: use `colours.blue` / `colours.highlight` (`#3690CE`). Do NOT substitute `highlightBlue` (`#d6e8ff`), which is a light surface tint only.
- No ad-hoc blue shades. If a needed blue is missing, update `colours.ts` first; never inline a new hex.
- Mixed comparison charts: use lines or line-plus-stems for flow metrics, bars for completed outcomes, reserve filled areas for single-series charts only.
- Status colours: ready/success `green`, loading `blue`, warning `orange`, error `cta`, idle/neutral `subtleGrey`.
- All modals: `borderRadius: 0` or `2px`. Backdrop `rgba(0, 3, 25, 0.6)` with blur. Primary buttons `colours.highlight`. Never `borderRadius: 12`.
- Readability minimums: body 13px, field labels 12px, section titles 11px uppercase, line height ≥ 1.4.

## CSS classes and tokens (new components)

New components MUST use CSS classes from `design-tokens.css`, NOT inline styles.

- `design-tokens.css` provides CSS custom properties (`--helix-*`, `--surface-*`, `--text-*`, `--border-*`, `--shadow-*`, `--spacing-*`) and utility classes (`helix-panel`, `helix-input`, `helix-label`, `helix-btn-primary`, `helix-btn-danger`, `helix-toast-success`, `helix-toast-error`, `helix-dropzone`, `helix-section-title`, `helix-body`, `helix-help`, `helix-spin`).
- Prospects table elements use classes from `src/app/styles/Prospects.css` (`.prospect-row`, `.prospect-day-sep`, `.prospect-pipeline`, etc.).
- Reference implementation: `BrandingSettingsPanel.tsx`, fully refactored to use CSS classes.
- Inline styles allowed only for truly dynamic values (runtime calculations, conditional opacity, animation transforms). Never for colours, fonts, spacing, or borders.
- Use `var(--surface-section)` not `colours.dark.sectionBackground` for backgrounds. Use `var(--text-body)` not hardcoded `#d1d5db`.
- All tokens resolve via `[data-theme]` attribute, dark/light/high-contrast automatically.

## Off-brand violations to watch
- Tailwind defaults: `#0ea5e9`, `#60a5fa`, `#22c55e`, `#4ade80`, `#f59e0b`
- Material Design: `#FFB74D`, `#E65100`, `#FF9800`
- Other: `#10b981`, `#8b5cf6`, `#ef4444`, `#E53935`, `#0078d4` (use `colours.blue`)
- The only orange is `#FF8C00` (`colours.orange`). The only green is `#20b26c` (`colours.green`).
