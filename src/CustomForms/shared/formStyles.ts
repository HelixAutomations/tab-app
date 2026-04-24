// src/CustomForms/shared/formStyles.ts
// Shared styling constants for bespoke forms — the single Helix form design language.
// Every bespoke form must consume these helpers; no inline one-offs.

import { colours } from '../../app/styles/colours';

// ============================================================================
// FONT CONSTANT — enforce Raleway everywhere
// ============================================================================

export const formFont = "'Raleway', 'Segoe UI', sans-serif";

// ============================================================================
// FORM CONTAINER STYLES
// ============================================================================

export const getFormContainerStyle = (isDarkMode: boolean): React.CSSProperties => ({
  background: 'var(--surface-section)',
  color: 'var(--text-primary)',
  padding: '1.5rem',
  paddingTop: '2rem',
  fontFamily: formFont,
  minHeight: '100%',
  boxSizing: 'border-box',
});

export const getFormScrollContainerStyle = (isDarkMode: boolean): React.CSSProperties => ({
  ...getFormContainerStyle(isDarkMode),
  maxHeight: 'calc(100vh - 60px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingBottom: '3rem',
});

// ============================================================================
// FORM CARD STYLES
// ============================================================================

export const getFormCardStyle = (isDarkMode: boolean, accentColor?: string): React.CSSProperties => ({
  background: 'var(--surface-card)',
  border: '1px solid var(--home-card-border)',
  borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
  borderRadius: 0,
  overflow: 'hidden',
  maxWidth: '900px',
  margin: '0 auto',
  boxShadow: 'var(--home-card-shadow)',
});

// ============================================================================
// FORM HEADER STYLES
// ============================================================================

export const getFormHeaderStyle = (isDarkMode: boolean, accentColor?: string): React.CSSProperties => ({
  background: 'var(--home-strip-bg)',
  borderBottom: '1px solid var(--home-strip-border)',
  borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
  padding: '1rem 1.5rem',
});

export const getFormHeaderTitleStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontWeight: 600,
  color: 'var(--text-primary)',
});

export const getFormHeaderSubtitleStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontSize: '13px',
  color: 'var(--text-body)',
  marginTop: '2px',
});

// ============================================================================
// FORM CONTENT STYLES
// ============================================================================

export const getFormContentStyle = (isDarkMode: boolean): React.CSSProperties => ({
  padding: '1.5rem',
});

// ============================================================================
// FORM SECTION STYLES
// ============================================================================

export const getFormSectionStyle = (isDarkMode: boolean, accentColor?: string): React.CSSProperties => ({
  background: 'var(--home-tile-bg)',
  border: '1px solid var(--home-tile-border)',
  borderRadius: 0,
  padding: '1.25rem',
  marginBottom: '1.25rem',
});

export const getFormSectionHeaderStyle = (isDarkMode: boolean, accentColor?: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '1rem',
  paddingBottom: '0.75rem',
  borderBottom: '1px solid var(--home-row-border)',
  color: accentColor || 'var(--text-primary)',
  fontWeight: 600,
  fontSize: '14px',
});

// ============================================================================
// INFO BOX STYLES
// ============================================================================

export const getInfoBoxStyle = (isDarkMode: boolean, variant: 'info' | 'warning' | 'success' | 'neutral' = 'info'): React.CSSProperties => {
  const colors = {
    info: { light: colours.highlight, dark: colours.accent },
    warning: { light: colours.orange, dark: colours.orange },
    success: { light: colours.green, dark: colours.green },
    neutral: { light: colours.highlight, dark: colours.highlight },
  };
  
  const color = isDarkMode ? colors[variant].dark : colors[variant].light;
  
  return {
    background: isDarkMode 
      ? `rgba(${hexToRgb(color)}, 0.1)` 
      : `rgba(${hexToRgb(color)}, 0.06)`,
    border: `1px solid ${isDarkMode 
      ? `rgba(${hexToRgb(color)}, 0.2)` 
      : `rgba(${hexToRgb(color)}, 0.15)`}`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 0,
    padding: '1rem',
    marginBottom: '1.25rem',
  };
};

export const getInfoBoxTextStyle = (isDarkMode: boolean): React.CSSProperties => ({
  color: isDarkMode ? '#f3f4f6' : '#374151',
  fontSize: '13px',
  lineHeight: 1.5,
});

// ============================================================================
// INPUT STYLES
// ============================================================================

export const getInputStyles = (isDarkMode: boolean) => ({
  fieldGroup: {
    borderRadius: 0,
    border: '1px solid var(--home-tile-border)',
    background: 'var(--surface-card)',
    minHeight: '44px',
  },
  field: {
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '14px',
    '::placeholder': {
      color: 'var(--text-muted)',
    },
  },
  label: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: 'var(--text-primary)',
    marginBottom: '6px',
  },
  errorMessage: {
    color: isDarkMode ? '#D65541' : '#D65541',
  },
});

export const getDropdownStyles = (isDarkMode: boolean) => ({
  dropdown: {
    borderRadius: 0,
    border: '1px solid var(--home-tile-border)',
    background: 'var(--surface-card)',
    height: '44px',
    minHeight: '44px',
  },
  title: {
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '14px',
    lineHeight: '42px',
    height: '42px',
    borderRadius: 0,
    border: 'none',
  },
  caretDownWrapper: {
    color: 'var(--text-muted)',
    lineHeight: '42px',
    height: '42px',
  },
  label: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: 'var(--text-primary)',
    marginBottom: '6px',
    padding: 0,
  },
  callout: {
    borderRadius: 0,
    border: '1px solid var(--home-card-border)',
    background: 'var(--surface-section)',
    boxShadow: 'var(--shadow-overlay)',
  },
  dropdownItems: {
    background: 'var(--surface-section)',
  },
  dropdownItem: {
    background: 'var(--surface-card)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    minHeight: '36px',
  },
  dropdownItemSelected: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)',
    color: isDarkMode ? '#f3f4f6' : '#061733',
  },
  dropdownItemSelectedAndDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.05)',
    color: isDarkMode ? '#A0A0A0' : '#A0A0A0',
  },
  dropdownItemHovered: {
    background: isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.04)',
    color: isDarkMode ? '#f3f4f6' : '#061733',
  },
});

// ============================================================================
// BUTTON STYLES (matching existing sharedButtonStyles)
// ============================================================================

export const getFormPrimaryButtonStyles = (isDarkMode: boolean, accentColor?: string) => ({
  root: {
    backgroundColor: accentColor || colours.highlight,
    borderColor: accentColor || colours.highlight,
    borderRadius: 0,
    minHeight: '40px',
    padding: '0 24px',
  },
  rootHovered: {
    backgroundColor: accentColor 
      ? adjustColor(accentColor, -10) 
      : adjustColor(colours.highlight, -10),
    borderColor: accentColor 
      ? adjustColor(accentColor, -10) 
      : adjustColor(colours.highlight, -10),
  },
  rootPressed: {
    backgroundColor: accentColor 
      ? adjustColor(accentColor, -20) 
      : adjustColor(colours.highlight, -20),
    borderColor: accentColor 
      ? adjustColor(accentColor, -20) 
      : adjustColor(colours.highlight, -20),
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    borderColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
});

export const getFormDefaultButtonStyles = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: 'transparent',
    borderColor: isDarkMode ? 'var(--home-tile-border-hover)' : 'var(--home-tile-border)',
    color: 'var(--text-primary)',
    borderRadius: 0,
    minHeight: '40px',
    padding: '0 24px',
  },
  rootHovered: {
    backgroundColor: isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.04)',
    borderColor: isDarkMode ? 'rgba(160, 160, 160, 0.4)' : 'rgba(0, 0, 0, 0.2)',
    color: isDarkMode ? '#f3f4f6' : '#061733',
  },
  rootPressed: {
    backgroundColor: isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.06)',
  },
  rootDisabled: {
    backgroundColor: 'transparent',
    borderColor: isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
});

// Decision/Selection button style - used when a button represents a selected option
export const getFormDecisionButtonStyles = (isDarkMode: boolean) => ({
  root: {
    padding: '0 16px',
    borderRadius: 0,
    backgroundColor: colours.highlight,
    border: 'none',
    minHeight: '40px',
    fontWeight: 600 as const,
    color: '#ffffff',
    transition: 'background 0.2s ease, box-shadow 0.2s ease',
  },
  rootHovered: {
    backgroundColor: adjustColor(colours.highlight, -10),
    boxShadow: '0 2px 8px rgba(54, 144, 206, 0.3)',
  },
  rootPressed: {
    backgroundColor: adjustColor(colours.highlight, -15),
    boxShadow: '0 2px 8px rgba(54, 144, 206, 0.4)',
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
  label: {
    color: '#ffffff',
  },
});

// Large selection/choice button style - used for initial choices like space type selection
export const getFormSelectionButtonStyles = (isDarkMode: boolean) => ({
  root: {
    padding: '16px 28px',
    borderRadius: 0,
    backgroundColor: isDarkMode ? 'var(--home-tile-bg)' : 'var(--surface-card)',
    border: '1px solid var(--home-tile-border)',
    height: '70px',
    minWidth: '220px',
    fontWeight: 600 as const,
    fontSize: '18px',
    color: 'var(--text-primary)',
    transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
    boxShadow: 'var(--home-card-shadow)',
  },
  rootHovered: {
    backgroundColor: colours.highlight,
    color: '#ffffff',
    borderColor: colours.highlight,
    boxShadow: '0 6px 16px rgba(54, 144, 206, 0.25)',
    transform: 'translateY(-2px)',
  },
  rootPressed: {
    backgroundColor: adjustColor(colours.highlight, -10),
    color: '#ffffff',
    borderColor: adjustColor(colours.highlight, -10),
    boxShadow: '0 2px 8px rgba(54, 144, 206, 0.3)',
    transform: 'translateY(0)',
  },
  icon: {
    marginRight: '12px',
    fontSize: '22px',
  },
  flexContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Approve/Reject action button styles
export const getFormApproveButtonStyles = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.08)',
    borderColor: colours.green,
    color: colours.green,
    borderRadius: 0,
    minHeight: '36px',
    padding: '0 16px',
    fontWeight: 600 as const,
  },
  rootHovered: {
    backgroundColor: colours.green,
    borderColor: colours.green,
    color: '#ffffff',
  },
  rootPressed: {
    backgroundColor: colours.green,
    borderColor: colours.green,
    color: '#ffffff',
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    borderColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
});

export const getFormRejectButtonStyles = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.08)',
    borderColor: colours.cta,
    color: colours.cta,
    borderRadius: 0,
    minHeight: '36px',
    padding: '0 16px',
    fontWeight: 600 as const,
  },
  rootHovered: {
    backgroundColor: colours.cta,
    borderColor: colours.cta,
    color: '#ffffff',
  },
  rootPressed: {
    backgroundColor: colours.cta,
    borderColor: colours.cta,
    color: '#ffffff',
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    borderColor: isDarkMode ? colours.dark.disabledBackground : '#f3f4f6',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
});

// ============================================================================
// CHOICE GROUP / RADIO BUTTON STYLES
// ============================================================================

export const getChoiceGroupStyles = (isDarkMode: boolean) => ({
  flexContainer: { 
    display: 'flex', 
    gap: '20px' 
  },
  label: { 
    fontWeight: 600 as const, 
    fontSize: '13px', 
    color: isDarkMode ? '#f3f4f6' : '#374151', 
    marginBottom: '8px' 
  },
  root: {
    selectors: {
      '.ms-ChoiceField': {
        marginTop: 0,
      },
      '.ms-ChoiceField-field': {
        color: 'var(--text-primary)',
        fontWeight: 500 as const,
      },
      '.ms-ChoiceField-field::before': {
        borderColor: 'var(--home-tile-border-hover)',
        borderWidth: '2px',
        background: 'var(--surface-card)',
      },
      '.ms-ChoiceField-field:hover::before': {
        borderColor: colours.highlight,
      },
      '.ms-ChoiceField-field.is-checked::before': {
        borderColor: colours.highlight,
      },
      '.ms-ChoiceField-field.is-checked::after': {
        backgroundColor: colours.highlight,
        borderColor: colours.highlight,
      },
      '.ms-ChoiceFieldLabel': {
        color: 'var(--text-primary)',
        fontWeight: 500 as const,
      },
    },
  },
});

// ============================================================================
// MESSAGE BAR STYLES
// ============================================================================

export const getMessageBarStyle = (isDarkMode: boolean): React.CSSProperties => ({
  marginBottom: '1rem',
  borderRadius: 0,
});

// ============================================================================
// ACCENT OUTLINE BUTTON STYLES (for accent-colored bordered buttons)
// ============================================================================

export const getFormAccentOutlineButtonStyles = (isDarkMode: boolean, width?: string) => ({
  root: {
    width: width || 'auto',
    backgroundColor: 'transparent',
    color: isDarkMode ? colours.accent : colours.highlight,
    borderColor: isDarkMode ? colours.accent : colours.highlight,
    borderWidth: '1.5px',
    borderRadius: 0,
    fontWeight: 600 as const,
    minHeight: '40px',
    padding: '0 20px',
  },
  rootHovered: {
    backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)',
    borderColor: isDarkMode ? colours.accent : colours.highlight,
    color: isDarkMode ? colours.accent : colours.highlight,
  },
  rootPressed: {
    backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.12)',
    borderColor: isDarkMode ? colours.accent : colours.highlight,
    color: isDarkMode ? colours.accent : colours.highlight,
  },
  rootDisabled: {
    backgroundColor: 'transparent',
    borderColor: isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    color: isDarkMode ? '#6B6B6B' : '#A0A0A0',
  },
});

// ============================================================================
// LABEL, HELPER TEXT, AND SYSTEM NOTE STYLES
// ============================================================================

/** Standard field label — 13px/600, primary colour. Use on every field. */
export const getFormLabelStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontFamily: formFont,
  fontWeight: 600,
  fontSize: '13px',
  color: 'var(--text-primary)',
  marginBottom: '6px',
  lineHeight: 1.3,
});

/** Helper text below a field — 12px, muted, instructional. Explains what
 *  happens next or what the system expects. Never salesy or generic. */
export const getFormHelperTextStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontFamily: formFont,
  fontSize: '12px',
  lineHeight: 1.4,
  color: 'var(--text-muted)',
  marginTop: '4px',
});

/** System note — a calm, branded info strip (not a generic alert).
 *  Uses left-accent border + translucent tint.  Guides the user without
 *  shouting.  variant controls colour: info (blue), success (green),
 *  warning (orange), neutral (grey). */
export const getFormSystemNoteStyle = (
  isDarkMode: boolean,
  variant: 'info' | 'success' | 'warning' | 'neutral' = 'info',
): React.CSSProperties => {
  const palette = {
    info:    isDarkMode ? colours.accent   : colours.highlight,
    success: colours.green,
    warning: colours.orange,
    neutral: isDarkMode ? '#A0A0A0' : '#6B6B6B',
  };
  const c = palette[variant];
  return {
    fontFamily: formFont,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 14px',
    marginBottom: '1rem',
    borderLeft: `3px solid ${c}`,
    background: isDarkMode
      ? `rgba(${hexToRgb(c)}, 0.08)`
      : `rgba(${hexToRgb(c)}, 0.05)`,
    border: `1px solid ${isDarkMode
      ? `rgba(${hexToRgb(c)}, 0.15)`
      : `rgba(${hexToRgb(c)}, 0.12)`}`,
    borderLeftWidth: '3px',
    borderLeftColor: c,
    fontSize: '12px',
    lineHeight: 1.5,
    color: isDarkMode ? '#d1d5db' : '#374151',
  };
};

/** Icon style for system note icon (left side). */
export const getFormSystemNoteIconStyle = (
  isDarkMode: boolean,
  variant: 'info' | 'success' | 'warning' | 'neutral' = 'info',
): React.CSSProperties => {
  const palette = {
    info:    isDarkMode ? colours.accent   : colours.highlight,
    success: colours.green,
    warning: colours.orange,
    neutral: isDarkMode ? '#A0A0A0' : '#6B6B6B',
  };
  return {
    fontSize: '14px',
    color: palette[variant],
    flexShrink: 0,
    marginTop: '1px',
  };
};

// ============================================================================
// TEXTAREA STYLES
// ============================================================================

/** Shared textarea field styles — borderRadius 0, token colours, rows-driven
 *  height. FluentUI's multiline TextField renders a `<textarea>` inside a
 *  wrapper div. The wrapper (`fieldGroup`) is where height lives; the textarea
 *  (`field`) fills it. Do NOT set `height` on `field` — FluentUI sizes the
 *  textarea via `height: 100%` internally and overriding it (even with `auto`)
 *  collapses the textarea to a single row, causing placeholder lines to stack
 *  on top of each other. Also keep `lineHeight` as an explicit CSS string:
 *  FluentUI serializes numeric values to px, so `1.5` becomes `1.5px` and
 *  multiline placeholder rows render on top of each other. */
export const getFormTextareaStyles = (isDarkMode: boolean, rows = 4) => {
  const lineHeightPx = 21; // 14px font × 1.5 line-height
  const verticalPaddingPx = 20; // 10px top + 10px bottom
  const computedMinHeight = Math.max(44, rows * lineHeightPx + verticalPaddingPx);
  return {
    fieldGroup: {
      borderRadius: 0,
      border: '1px solid var(--home-tile-border)',
      background: 'var(--surface-card)',
      minHeight: `${computedMinHeight}px`,
      height: `${computedMinHeight}px`,
      padding: 0,
    },
    field: {
      background: 'transparent',
      color: 'var(--text-primary)',
      fontSize: '14px',
      fontFamily: formFont,
      lineHeight: `${lineHeightPx}px`,
      resize: 'vertical' as const,
      padding: '10px 12px',
      boxSizing: 'border-box' as const,
      whiteSpace: 'pre-wrap' as const,
      overflowWrap: 'break-word' as const,
      selectors: {
        '&::placeholder': {
          color: 'var(--text-muted)',
          opacity: 0.72,
          transition: 'opacity 160ms ease, color 160ms ease',
        },
        '&:focus::placeholder': {
          opacity: 0,
          color: 'transparent',
        },
      },
    },
    label: {
      fontWeight: 600 as const,
      fontSize: '13px',
      fontFamily: formFont,
      color: 'var(--text-primary)',
      marginBottom: '6px',
    },
    errorMessage: {
      color: colours.cta,
    },
  };
};

// ============================================================================
// SUBMIT FEEDBACK STYLES
// ============================================================================

/** Consistent success / error / info feedback block shown after form submission.
 *  Renders as a horizontal strip with icon + message. */
export const getFormSubmitFeedbackStyle = (
  isDarkMode: boolean,
  status: 'success' | 'error' | 'info',
): React.CSSProperties => {
  const palette = {
    success: colours.green,
    error:   colours.cta,
    info:    colours.highlight,
  };
  const c = palette[status];
  return {
    fontFamily: formFont,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    borderLeft: `3px solid ${c}`,
    background: isDarkMode
      ? `rgba(${hexToRgb(c)}, 0.1)`
      : `rgba(${hexToRgb(c)}, 0.06)`,
    border: `1px solid ${isDarkMode
      ? `rgba(${hexToRgb(c)}, 0.2)`
      : `rgba(${hexToRgb(c)}, 0.15)`}`,
    borderLeftWidth: '3px',
    borderLeftColor: c,
    color: isDarkMode ? '#f3f4f6' : '#061733',
    fontSize: '13px',
    lineHeight: 1.5,
    marginTop: '1rem',
  };
};

export const getFormSubmitFeedbackIconStyle = (
  status: 'success' | 'error' | 'info',
): React.CSSProperties => {
  const palette = {
    success: colours.green,
    error:   colours.cta,
    info:    colours.highlight,
  };
  return {
    fontSize: '16px',
    color: palette[status],
    flexShrink: 0,
  };
};

// ============================================================================
// FIELD CONTAINER (consistent vertical spacing between fields)
// ============================================================================

/** Wrap each field row in this for consistent 16px vertical rhythm. */
export const formFieldGap = 16;

/** Standard Stack tokens for field layouts. */
export const formFieldTokens = { childrenGap: formFieldGap };

/** Standard Stack tokens for section-level spacing (24px). */
export const formSectionTokens = { childrenGap: 24 };

// ============================================================================
// ACCENT COLORS FOR FORMS - Consistent house styling
// ============================================================================

// All forms use consistent brand blue for house styling
// The form category color is only used for the grouping indicator in FormsModal header
export const formAccentColors = {
  techIdea: colours.highlight,           // Brand blue #3690CE
  techProblem: colours.highlight,        // Brand blue
  expert: colours.highlight,             // Brand blue
  counsel: colours.highlight,            // Brand blue
  bundle: colours.highlight,             // Brand blue
  attendance: colours.highlight,         // Brand blue
  leave: colours.highlight,              // Brand blue
  notableCase: colours.highlight,        // Brand blue
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// ============================================================================
// FORM MODE TOGGLE STYLES (Cognito/Bespoke Switcher)
// ============================================================================

export const getFormModeToggleStyles = (isDarkMode: boolean) => ({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px',
    background: 'var(--home-tile-bg)',
    border: '1px solid var(--home-tile-border)',
    borderRadius: 0,
    marginBottom: '16px',
    width: 'fit-content',
  } as React.CSSProperties,
  option: (isActive: boolean, isDisabled: boolean) => ({
    padding: '6px 14px',
    borderRadius: 0,
    fontSize: '12px',
    fontWeight: 500,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    background: isActive 
      ? (isDarkMode ? colours.accent : colours.highlight)
      : 'transparent',
    color: isActive 
      ? '#ffffff' 
      : (isDisabled 
        ? 'var(--text-muted)'
        : 'var(--text-primary)'),
    border: 'none',
    opacity: isDisabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties),
});
