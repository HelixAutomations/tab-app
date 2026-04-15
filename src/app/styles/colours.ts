// src/app/styles/colours.ts
//
// Canonical colour source for Helix Hub.
// Reference: docs/COMPONENT_STYLE_GUIDE.md
// Rules:
//   1. Never invent hex values outside this file.
//   2. New components should use brand tokens, not theme-specific ones.
//   3. Dark surface ladder: background → sectionBackground → cardBackground → cardHover (215° hue ramp).
//   4. See .github/copilot-instructions.md → Brand Colour Palette for design rules.

export const colours = {
  // ── Brand palette (6 canonical colours) ──────────────────────
  //
  //  Name              Hex       RGB              Role
  //  Website Blue      #000319   (0, 3, 25)       Deepest brand navy — page backgrounds
  //  Helix Dark Blue   #061733   (6, 23, 51)      Primary dark surface — control rows, headers
  //  Helix Blue        #0D2F60   (13, 47, 96)     Mid-depth navy — hover surfaces, light-mode headings
  //  Helix Highlight   #3690CE   (54, 144, 206)   Links, active states, loading indicators
  //  Helix CTA         #D65541   (214, 85, 65)    Action buttons, urgency — one pop per view
  //  Helix Grey        #F4F4F6   (244, 244, 246)  Light-mode surface fills
  //
  // ─────────────────────────────────────────────────────────────

  websiteBlue: '#000319',
  darkBlue: '#061733',
  helixBlue: '#0D2F60',
  blue: '#3690CE',
  highlight: '#3690CE',   // Alias for blue — both are valid
  accent: '#87F3F3',      // Teal accent — sparingly at anchor points only
  cta: '#D65541',
  grey: '#F4F4F6',

  // ── Text hierarchy ──────────────────────────────────────────
  greyText: '#6B6B6B',    // Secondary text (light mode), tertiary (dark mode)
  subtleGrey: '#A0A0A0',  // Tertiary text, muted labels, away status

  // ── Light-mode surfaces ─────────────────────────────────────
  sectionBackground: '#FFFFFF',
  highlightBlue: '#d6e8ff',    // Light tint surface token only (light-mode hovers/selected rows). Not the primary highlight blue.
  highlightYellow: '#ffefc1',  // Placeholder highlighting in pitch emails
  highlightNeutral: '#e1e1e1', // Neutral borders, light-mode backgrounds

  // ── Dark-mode surface depth ladder ──────────────────────────
  //
  //  Level   Token               Hex       Lightness
  //  0       dark.background     #020617   ~5%    Page canvas
  //  1       dark.sectionBg      #061733   ~9%    Section containers (= darkBlue, neutral)
  //  2       dark.cardBg         #0a2040   ~12%   Card surfaces
  //  3       dark.cardHover      #0d2850   ~15%   Hover lift
  //
  //  All levels derived from darkBlue (#061733) with white-alpha lifts.
  //  Aligned 1:1 with design-tokens.css --surface-* tokens.

  dark: {
    background: '#020617',
    sectionBackground: '#061733',
    text: '#f3f4f6',
    subText: '#3690CE',
    border: '#374151',
    cardBackground: '#0a2040',
    cardHover: '#0d2850',
    iconColor: '#f3f4f6',
    inputBackground: '#374151',
    previewBackground: '#374151',
    highlight: '#3690CE',
    grey: '#374151',

    // State tokens
    disabledBackground: '#374151',
    borderColor: '#4b5563',
  },

  light: {
    background: '#f0f2f5',
    sectionBackground: '#FFFFFF',
    text: '#061733',
    subText: '#3690CE',
    border: '#F4F4F6',
    footerBackground: '#f5f5f5',
    cardBackground: '#ffffff',
    cardHover: '#f9f9f9',
    iconColor: '#061733',
    inputBackground: '#F4F4F6',
    previewBackground: '#f9f9f9',
    highlight: '#3690CE',
    grey: '#F4F4F6',

    // State tokens
    disabledBackground: '#F4F4F6',
    borderColor: '#6B6B6B',
  },

  highContrast: {
    background: '#000000',
    sectionBackground: '#1a1a1a',
    text: '#ffffff',
    subText: '#ffff00',
    border: '#ffffff',
    cardBackground: '#1a1a1a',
    cardHover: '#333333',
    iconColor: '#ffffff',
    inputBackground: '#333333',
    previewBackground: '#1a1a1a',
    highlight: '#ffff00',
    cta: '#ff0000',

    disabledBackground: '#1a1a1a',
    borderColor: '#ffffff',
  },

  // ── Status / area-of-work colours ───────────────────────────
  orange: '#FF8C00',   // Warning, construction
  green: '#20b26c',    // Success, ready, property
  yellow: '#ffd54f',   // Employment
  red: '#D65541',      // Alias for cta — used semantically as error/high-risk

  // ── Component-specific ──────────────────────────────────────
  tagBackground: '#e1dfdd',

  // ── Reporting (light-mode table styling) ────────────────────
  reporting: {
    tableHeaderBackground: '#F4F4F6',
  },
};

/**
 * Convert a hex colour token to an rgba() string with the given alpha.
 * Accepts 3-, 4-, 6-, or 8-digit hex (with or without `#`).
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const full = h.length <= 4
    ? [...h].map(c => c + c).join('').slice(0, 6)
    : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
