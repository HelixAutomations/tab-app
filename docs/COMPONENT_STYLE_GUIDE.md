# Component Style Guide

The canonical look-and-feel reference for Helix Hub. **UserBubble.tsx is the living reference implementation** — every visual decision should trace back here. When UserBubble changes, this doc and downstream components follow.

**Do not guess** the look and feel from other components. Many pre-date the standard and carry off-brand colours, Tailwind defaults, Material Design tokens, or inconsistent icon sets.

Colour palette: `src/app/styles/colours.ts` — never invent hex values.
Instruction-form tokens: `src/app/styles/componentTokens.ts`.
Brand rules: `.github/copilot-instructions.md` → Brand Colour Palette.

---

## 1. Design Foundations

| Rule | Value | Notes |
|------|-------|-------|
| Border radius | `0` everywhere | `999` for pills/dots, `'50%'` for circular indicators only |
| Font | **Raleway** | All headings and UI text |
| CTA colour | `colours.cta` (#D65541) | One pop per view — never compete with multiple warm colours |
| Accent | `colours.accent` (#87F3F3) | Sparingly at structural anchor points only |
| Dark text | `colours.dark.text` primary, `subtleGrey` secondary, `greyText` tertiary | |
| Minimum body text | **13px** | Readability for all users. Labels: 12px+. Section titles: 11px uppercase. |

## 1b. Text Hierarchy & "Blue on Blue" Rule (CRITICAL)

Body text inside panels and modals MUST use **neutral colours**, not brand blue. `colours.dark.subText` (`#3690CE`) is the highlight blue — it is for links, active indicators, and accents only. Using it for body copy on navy/dark backgrounds creates the "blue on blue" anti-pattern: low contrast, hard to read, visually muddy.

### The correct text hierarchy inside dark-mode panels

| Role | Colour | Value | Use |
|------|--------|-------|-----|
| **labelText** | `colours.dark.text` | `#f3f4f6` | Headings, active option labels, input values |
| **bodyText** | `#d1d5db` (warm grey) | n/a | Paragraphs, descriptions, sublabels — high contrast on navy |
| **helpText** | `colours.subtleGrey` | `#A0A0A0` | Tertiary guidance, inactive sublabels, timestamps |
| **sectionAccent** | `colours.accent` | `#87F3F3` | Section titles (uppercase), radio dots, active borders — anchor points only |
| **errorColour** | `colours.cta` | `#D65541` | Validation messages, required asterisks |
| **successColour** | `colours.green` | `#20b26c` | Confirmation toggles, copied states |

### Light-mode equivalents

| Role | Colour | Value |
|------|--------|-------|
| **labelText** | `colours.light.text` | `#061733` |
| **bodyText** | `#374151` | warm dark grey |
| **helpText** | `colours.greyText` | `#6B6B6B` |
| **sectionAccent** | `colours.highlight` | `#3690CE` |

### Anti-patterns (never do these)

- `colour: colours.dark.subText` on dark backgrounds — blue on blue
- `colour: colours.highlight` for paragraph text in light mode on blue-tinted surfaces
- `colour: accent` for body copy — accent is for anchor points only
- Using any brand blue as the primary text colour in panels/modals

> **Rule of thumb**: if you're writing more than 3 words, it should be `bodyText` (neutral grey) or `labelText` (white), never a brand colour. Brand colours are for _structure_ — section titles, dots, borders, icons.

## 1c. Readability & Accessibility

The platform is used by people of all ages including senior staff. Design for clarity:

- **Minimum 13px** for body text, descriptions, option labels, input values
- **Minimum 12px** for field labels, sublabels, helper text
- **11px** ONLY for uppercase section titles and micro labels
- **Line height** ≥ 1.4 for multi-line text, ≥ 1.35 for single-line labels
- **Letter spacing** 0.2-0.5px on uppercase labels for legibility
- **Icon cues** alongside text options — 16×16 minimum, strokeWidth 1.8 for clarity
- **Gap** between interactive rows: 8px minimum, 12px inside stacked groups
- **Padding** on interactive rows: 12px 14px minimum (not 10px 12px)
- **Toggle switches**: 40×20 (not 36×18) with 16×16 knobs

### Icon cue pattern

Every option in a radio group or toggle list should have a leading icon to aid visual scanning. Icons use the same stroke colour as the text they accompany (helpText when inactive, sectionAccent when active):

```tsx
// Active: icon matches section accent
<svg stroke={isActive ? sectionAccent : helpText} strokeWidth="1.8" .../>
// Toggle on: icon matches toggle colour
<svg stroke={isOn ? sectionAccent : helpText} strokeWidth="1.8" .../>
```

Recommended icon set (Feather-style inline SVGs, 24×24 viewBox):
- Send/pitch: `<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`
- Lightning/instant: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`
- ID card: `<rect x="2" y="5" width="20" height="14" rx="2"/>` + detail lines
- Shield/confirm: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>`
- Warning: triangle with exclamation
- Link: chain-link paths
- Document: file with fold corner
- Clock: circle with hands

## 2. Dark-Mode Surface Depth Ladder

All dark surfaces sit on a 215° hue ramp. Moving "up" in the stack means higher lightness. Never skip levels — start from page and work up.

| Level | Token | Hex | Lightness | Use |
|-------|-------|-----|-----------|-----|
| 0 – Page | `dark.background` | `#020617` | ~5% | Page canvas |
| 1 – Section | `dark.sectionBackground` | `#051525` | ~8% | Section containers, column backgrounds |
| 2 – Card | `dark.cardBackground` | `#081c30` | ~11% | Card surfaces, panels |
| 3 – Hover/Elevated | `dark.cardHover` | `#0c2440` | ~14% | Hover lift, elevated panels |
| 4 – Brand fill | `darkBlue` | `#061733` | ~10% | Control rows, resting interactive elements |
| 5 – Brand hover | `helixBlue` | `#0D2F60` | ~19% | Hover state for brand-filled rows |

> **Key insight**: `darkBlue` (#061733) is the correct resting surface for interactive controls (toggles, action rows, profile fields). It avoids the greenish tint that `dark.cardBackground` (#081c30) carries in certain displays.

## 3. Interactive Row Pattern (Reference: UserBubble)

Every clickable row — toggle, action button, profile field — follows the same motion system. This is the house style.

### 3a. Resting state

```ts
const controlRowBg = isDarkMode ? colours.darkBlue : bgTertiary;

const rowBaseBackground = isDarkMode
    ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
    : controlRowBg;

const rowBaseShadow = isDarkMode
    ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)'
    : 'none';
```

The subtle left-edge gradient (highlight blue at 10% opacity fading out by 42%) gives depth without competing with content. The inset shadow provides barely-visible structure.

### 3b. Hover state

```ts
const rowHoverBackground = isDarkMode
    ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${bgHover}`
    : bgHover;

const rowHoverShadow = isDarkMode
    ? '0 8px 18px rgba(0, 3, 25, 0.42)'
    : '0 4px 12px rgba(6, 23, 51, 0.08)';
```

### 3c. Hover helpers

```ts
const applyRowHover = (element: HTMLElement) => {
    element.style.borderColor = borderMedium;
    element.style.background = rowHoverBackground;
    element.style.transform = 'translateY(-1px)';
    element.style.boxShadow = rowHoverShadow;
};

const resetRowHover = (element: HTMLElement) => {
    element.style.borderColor = borderLight;
    element.style.background = rowBaseBackground;
    element.style.transform = 'translateY(0)';
    element.style.boxShadow = rowBaseShadow;
};
```

### 3d. CSS transition

All interactive rows use this transition string for consistent motion:

```
transition: background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease
```

The transform is slightly faster (0.18s) than the colour transitions (0.2s) to feel snappy without being jarring.

### 3e. Row style objects

```ts
// Toggle row (full-width, with switch)
const toggleRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px',
    background: rowBaseBackground,
    border: `1px solid ${borderLight}`,
    borderRadius: '2px',
    cursor: 'pointer',
    boxShadow: rowBaseShadow,
    transform: 'translateY(0)',
    transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
};

// Action button (full-width, icon + label)
const actionBtn: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: rowBaseBackground,
    color: textSecondary,
    border: `1px solid ${borderLight}`,
    borderRadius: '2px',
    fontSize: 11, fontWeight: 500,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    boxShadow: rowBaseShadow,
    transform: 'translateY(0)',
    transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
};
```

## 4. Toggle Switch

Square-edged to match `borderRadius: 0` brand rule. `2px` radius is the maximum.

```ts
const toggleSwitch = (on: boolean): React.CSSProperties => ({
    width: 36, height: 18,
    background: on ? accentPrimary : borderMedium,
    borderRadius: '2px',
    position: 'relative',
    transition: 'all 0.2s ease',
    flexShrink: 0
});

const toggleKnob = (on: boolean): React.CSSProperties => ({
    width: 14, height: 14,
    background: '#fff',
    borderRadius: '1px',
    position: 'absolute', top: 2,
    left: on ? 20 : 2,
    transition: 'all 0.2s ease',
    boxShadow: shadowSm
});
```

## 5. Toast Feedback System

Inline toasts provide confirmation for user actions. They auto-dismiss after 1800ms and are non-blocking.

### 5a. Tones

| Tone | Border | Text colour | Use |
|------|--------|-------------|-----|
| `success` | `rgba(32, 178, 108, 0.65)` | `#20b26c` | Completed actions (copy, save) |
| `warning` | `rgba(214, 85, 65, 0.6)` | `#D65541` | Failures, destructive confirmations |
| `info` | `rgba(54, 144, 206, 0.55)` | `#3690CE` | State changes (toggles, mode switches) |

### 5b. Animation

```css
@keyframes userBubbleToastIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

Entry: 0.16s ease. Subtle upward slide + scale. No exit animation — opacity drops on unmount.

### 5c. Positioning

Absolute-positioned within the modal container, `top: 12px; right: 12px`, with `pointer-events: none` so it doesn't block interaction.

## 6. Section Titles

Uppercase micro-labels that separate groups of controls.

```ts
const sectionTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600,
    color: textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 6
};
```

## 7. Modal / Overlay Pattern

Centre-screen modal with backdrop blur. Used by UserBubble command centre.

```css
@keyframes commandCenterIn {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

- Backdrop: `rgba(0, 3, 25, 0.6)` + `backdrop-filter: blur(8px)`
- Modal: `max-width: 600px`, `border: 1px solid` + `dark.borderColor`
- Animation: 0.22s ease — slightly longer than row hovers to feel substantial

## 8. Status Colours

| State | Token | Hex |
|-------|-------|-----|
| Ready / success | `green` | `#20b26c` |
| Active / loading | `blue` | `#3690CE` |
| Warning / construction | `orange` | `#FF8C00` |
| Error / urgency | `cta` | `#D65541` |
| Idle / neutral | `subtleGrey` | `#A0A0A0` |

## 9. Accent & Highlight Usage

Two accent tokens provide emphasis without introducing new colours:

### `accent` (#87F3F3) — dark-mode interactive highlight

The dark-mode counterpart of `highlight` (#3690CE). Pair them:

```ts
const activeColour = isDarkMode ? colours.accent : colours.highlight;
```

**Where to use:**
- Active sort column headers (table views)
- Selected borders, active tab underlines
- Filter chips (selected state)
- Section title bars (sparingly, structural anchor points only)

**Where NOT to use:**
- Body text, paragraph content
- Widespread background fills
- Multiple elements competing in the same view

### `highlightBlue` (#d6e8ff) — light-mode surface highlight

The lightest brand blue. Used for:
- Hover row backgrounds (light mode)
- Selected row fills
- Badge backgrounds, chip fills
- Info banner backgrounds

### Readiness dot pattern

Small circular indicators for connection/integration status:
```ts
// Connected / ready
{ width: 5, height: 5, borderRadius: '50%', background: colours.green, boxShadow: `0 0 4px ${colours.green}60` }

// Warning / degraded
{ width: 5, height: 5, borderRadius: '50%', background: colours.orange }

// Error / disconnected
{ width: 5, height: 5, borderRadius: '50%', background: colours.cta }
```

## 10. Area of Work Visual System

Areas of Work appear across enquiries, instructions, matters, and reporting. All must use the canonical tokens.

### Colours (mandatory)

| Area | Token | Hex | Fallback |
|------|-------|-----|----------|
| Commercial | `colours.blue` | `#3690CE` | — |
| Construction | `colours.orange` | `#FF8C00` | — |
| Property | `colours.green` | `#20b26c` | — |
| Employment | `colours.yellow` | `#ffd54f` | — |
| Misc/Other/Unsure | `colours.greyText` | `#6B6B6B` | `colours.greyText` (not `cta`, not `blue`) |

### Icons (canonical set — Fluent UI)

| Area | Icon name | Notes |
|------|-----------|-------|
| Commercial | `CityNext` | — |
| Construction | `ConstructionCone` | — |
| Property | `Home` | — |
| Employment | `People` | — |
| Misc/Other | `Help` | — |

> **Known inconsistency:** 4 different icon sets exist across the codebase (emoji, 3 Fluent sets). Canonical set above should be used in all new code. Legacy components can be migrated over time. See `.github/copilot-instructions.md` → Area of Work colours for the full violations list.

### `getAreaColor` pattern

15 copies exist with inconsistent fallbacks. Canonical implementation:

```ts
const getAreaColor = (area: string): string => {
    const a = (area || '').toLowerCase();
    if (a.includes('commercial')) return colours.blue;
    if (a.includes('construction')) return colours.orange;
    if (a.includes('property') || a.includes('conveyancing') || a.includes('real estate')) return colours.green;
    if (a.includes('employment')) return colours.yellow;
    return colours.greyText; // canonical fallback — never cta, never blue
};
```

## 11. Instruction Form Tokens

Extracted from the original instruction/CCL forms. Import:

```ts
import { componentTokens } from '../styles/componentTokens';
```

| Token | Description |
|-------|-------------|
| `stepHeader.base` | Default accordion header background, text, radius |
| `stepHeader.active` | Expanded step colours |
| `stepHeader.lockedOpacity` | Disabled step opacity |
| `stepContent.borderColor` | Panel border |
| `stepContent.boxShadow` | Open panel shadow |
| `stepContent.completedBorderColor` | Completion highlight border |
| `toggleButton.base/hover/active` | Choice button states |
| `summaryPane.base/collapsed` | Right-side summary container |
| `infoBanner` | Highlighted banner above form sections |
| `accordion` | Secondary accordion (FAQ) base |

## 12. Command Centre Anatomy

The UserBubble modal follows a strict layout order. New sections slot into the correct position — don't reorder.

| Order | Section | Purpose |
|-------|---------|---------|
| 0 | Header | Avatar, name, role badge, close button |
| 1 | Environment ribbon | Env badge (Local/Staging/Production) + host + session elapsed |
| 2 | Active state warnings | Amber strip when demo mode, production view, or user-switch active |
| 3 | Quick Navigate | 4-column grid of tab jump cards (Enquiries, Instructions, Matters, Reporting) |
| 4 | Admin controls | User switch, release notes, demo mode, dev dashboard (admin-only) |
| 5 | Local controls | Rate tracker, loading debug, error tracker, view as prod, replay, todo |
| 6 | Appearance + Palette | Dark/light toggle + Core Brand, Dark Mode, Light Mode, Status swatch rows (click-to-copy) |
| 7 | Session filters | Areas of work checkboxes with canonical emoji icons |
| 8 | Quick stats | Rate, role cards |
| 9 | Profile fields | Curated user details |
| 10 | Footer actions | Refresh data, return to admin |

### Environment ribbon

- Sits between header and content (outside scroll area).
- Compact `6px 20px` padding, `fontSize: 10`.
- Environment badge: colour-coded (`blue` for Local, `orange` for Staging, `green` for Production) with pulsing dot for non-production.
- Session timer: clock icon + elapsed duration, ticks every 30s while modal is open.

### Active state warnings

- Only renders when at least one altered state is active (demo mode, production view, user switch).
- Amber-toned strip with warning triangle icon.
- Multiple states joined with `·` separator.

### Quick Navigate cards

- 4-column grid using `rowBaseBackground` gradient, `applyRowHover`/`resetRowHover` motion.
- Each card dispatches a `CustomEvent` (e.g. `navigateToEnquiries`), closes the modal, and shows an info toast.
- Icon + label layout, `fontSize: 9`, `fontWeight: 600`.

## 13. Known Brand Violations

These are documented so agents prioritise fixing them when touching these files:

| Issue | File(s) | Fix |
|-------|---------|-----|
| RGB values for AoW colours instead of tokens | InlineWorkbench.tsx | Use `colours.blue/orange/green/yellow` |
| Raw hex for 5 AoW colours, 4/5 off-palette | MattersReport.tsx | Use colour tokens |
| `#FFB74D` / `#E65100` (Material oranges) | Matters.tsx, AnnualLeaveModal.tsx, AnnualLeaveBookings.tsx, PersonalAttendanceConfirm.tsx | Use `colours.orange` |
| `#0ea5e9` button, borderRadius: 12 | RefreshDataModal.tsx | Use `colours.blue`, borderRadius: 0 |
| `#60a5fa`, `#10b981`, `#f59e0b`, `#8b5cf6` (Tailwind) | ReleaseNotesModal.tsx | Map to brand tokens |
| `#22c55e` (Tailwind green) | ConflictConfirmationCard.tsx | Use `colours.green` |
| `#ef4444` (Tailwind red) | IdentityConfirmationCard.tsx | Use `colours.cta` |
| `#E53935` for Other/Unsure | Enquiries.tsx | Use `colours.greyText` |
| `#0078d4` (Fluent blue) | MattersReport.tsx, colours.ts deprecated tokens | Use `colours.blue` |
| 15x `getAreaColor` with inconsistent fallbacks | See §10 | Canonical fallback = `colours.greyText` |

## 14. When Building New Components

1. **Start from the surface ladder** — pick the right depth level for your context.
2. **Use `rowBaseBackground` gradient** for every clickable surface in dark mode.
3. **Wire `applyRowHover`/`resetRowHover`** for consistent motion on all interactive rows.
4. **Add toast feedback** for any action that changes state.
5. **Use section titles** to group related controls.
6. **Test in both dark and light mode** — the gradient system is designed for dark; light mode falls back to flat fills.
7. **Never invent colours** — if a token doesn't exist in `colours.ts`, the colour shouldn't be used.
8. **Use accent/highlight pair** — `isDarkMode ? colours.accent : colours.highlight` for interactive emphasis.
9. **AoW colours from the canonical table** — never guess, never use RGB literals.
10. **New command centre sections** — slot into the anatomy table above. Keep the order.
11. **Check the violations list** — if you touch a file with a known violation, fix it.
