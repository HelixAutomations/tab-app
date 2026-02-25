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
  missedBlue: '#0D2F60',  // @deprecated — legacy alias for helixBlue. Migrate to helixBlue over time (~50 refs).
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

  // ── Dark-mode surface depth ladder (215° hue) ──────────────
  //
  //  Level   Token               Hex       Lightness
  //  0       dark.background     #020617   ~5%    Page canvas
  //  1       dark.sectionBg      #051525   ~8%    Section containers
  //  2       dark.cardBg         #081c30   ~11%   Card surfaces
  //  3       dark.cardHover      #0c2440   ~14%   Hover lift
  //
  //  Interactive controls should use darkBlue (#061733) as resting surface,
  //  not dark.cardBackground, to avoid greenish tint on certain displays.

  dark: {
    background: '#020617',
    sectionBackground: '#051525',
    text: '#f3f4f6',
    subText: '#3690CE',
    border: '#374151',
    cardBackground: '#081c30',
    cardHover: '#0c2440',
    iconColor: '#f3f4f6',
    inputBackground: '#374151',
    previewBackground: '#374151',
    highlight: '#3690CE',
    grey: '#374151',

    // Button / interaction tokens
    buttonBackground: '#0078d4', // @deprecated — low usage (1 ref). Use blue or helixBlue instead.
    buttonText: '#ffffff',       // @deprecated — low usage (2 refs). Just use '#ffffff'.
    hoverBackground: '#005a9e',  // @deprecated — low usage (2 refs in src). Submodules still reference.

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

    // Button / interaction tokens
    buttonBackground: '#0078d4',
    buttonText: '#ffffff',
    hoverBackground: '#005a9e',

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
  secondaryButtonBackground: '#F4F4F6', // @deprecated — same as grey. Prefer colours.grey.

  // ── Reporting (light-mode table styling) ────────────────────
  reporting: {
    tableHeaderBackground: '#F4F4F6',
  },
};
