// src/CustomForms/shared/formStyles.ts
// Shared styling constants for bespoke forms - clean design matching FormsModal/ResourcesModal

import { colours } from '../../app/styles/colours';

// ============================================================================
// FORM CONTAINER STYLES
// ============================================================================

export const getFormContainerStyle = (isDarkMode: boolean): React.CSSProperties => ({
  background: isDarkMode ? '#0f172a' : '#fafafa',
  padding: '1.5rem',
  paddingTop: '2rem',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
  background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
  borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
  borderRadius: 0,
  overflow: 'hidden',
  maxWidth: '900px',
  margin: '0 auto',
  boxShadow: isDarkMode 
    ? '0 4px 16px rgba(0, 0, 0, 0.25)' 
    : '0 4px 16px rgba(0, 0, 0, 0.04)',
});

// ============================================================================
// FORM HEADER STYLES
// ============================================================================

export const getFormHeaderStyle = (isDarkMode: boolean, accentColor?: string): React.CSSProperties => ({
  background: isDarkMode ? '#1e293b' : '#f8fafc',
  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
  borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
  padding: '1rem 1.5rem',
});

export const getFormHeaderTitleStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontWeight: 600,
  color: isDarkMode ? '#f1f5f9' : '#1e293b',
});

export const getFormHeaderSubtitleStyle = (isDarkMode: boolean): React.CSSProperties => ({
  fontSize: '13px',
  color: isDarkMode ? '#94a3b8' : '#64748b',
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
  background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
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
  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
  color: accentColor || (isDarkMode ? '#f1f5f9' : '#1e293b'),
  fontWeight: 600,
  fontSize: '14px',
});

// ============================================================================
// INFO BOX STYLES
// ============================================================================

export const getInfoBoxStyle = (isDarkMode: boolean, variant: 'info' | 'warning' | 'success' = 'info'): React.CSSProperties => {
  const colors = {
    info: { light: colours.cta, dark: colours.cta },
    warning: { light: '#dc3545', dark: '#f87171' },
    success: { light: '#16a34a', dark: '#4ade80' },
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
  color: isDarkMode ? '#e2e8f0' : '#374151',
  fontSize: '13px',
  lineHeight: 1.5,
});

// ============================================================================
// INPUT STYLES
// ============================================================================

export const getInputStyles = (isDarkMode: boolean) => ({
  fieldGroup: {
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
    minHeight: '44px',
  },
  field: {
    background: 'transparent',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '14px',
    '::placeholder': {
      color: isDarkMode ? '#64748b' : '#94a3b8',
    },
  },
  label: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    marginBottom: '6px',
  },
  errorMessage: {
    color: isDarkMode ? '#f87171' : '#dc2626',
  },
});

export const getDropdownStyles = (isDarkMode: boolean) => ({
  dropdown: {
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
    height: '44px',
    minHeight: '44px',
  },
  title: {
    background: 'transparent',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '14px',
    lineHeight: '42px',
    height: '42px',
    borderRadius: 0,
    border: 'none',
  },
  caretDownWrapper: {
    color: isDarkMode ? '#94a3b8' : '#64748b',
    lineHeight: '42px',
    height: '42px',
  },
  label: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    marginBottom: '6px',
    padding: 0,
  },
  callout: {
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    background: isDarkMode ? '#1e293b' : '#ffffff',
    boxShadow: isDarkMode 
      ? '0 8px 24px rgba(0, 0, 0, 0.4)' 
      : '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  dropdownItems: {
    background: isDarkMode ? '#1e293b' : '#ffffff',
  },
  dropdownItem: {
    background: isDarkMode ? '#1e293b' : '#ffffff',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '14px',
    minHeight: '36px',
  },
  dropdownItemSelected: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
  },
  dropdownItemSelectedAndDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.05)',
    color: isDarkMode ? '#94a3b8' : '#9ca3af',
  },
  dropdownItemHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.04)',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
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
    backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#64748b' : '#94a3b8',
  },
});

export const getFormDefaultButtonStyles = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: 'transparent',
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    borderRadius: 0,
    minHeight: '40px',
    padding: '0 24px',
  },
  rootHovered: {
    backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.04)',
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(0, 0, 0, 0.2)',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
  },
  rootPressed: {
    backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.06)',
  },
  rootDisabled: {
    backgroundColor: 'transparent',
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    color: isDarkMode ? '#475569' : '#cbd5e1',
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
    backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#64748b' : '#94a3b8',
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
    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : colours.grey,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
    height: '70px',
    minWidth: '220px',
    fontWeight: 600 as const,
    fontSize: '18px',
    color: isDarkMode ? '#e2e8f0' : colours.greyText,
    transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
    boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 6px rgba(0,0,0,0.1)',
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
    backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
    borderColor: '#22c55e',
    color: '#22c55e',
    borderRadius: 0,
    minHeight: '36px',
    padding: '0 16px',
    fontWeight: 600 as const,
  },
  rootHovered: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
    color: '#ffffff',
  },
  rootPressed: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
    color: '#ffffff',
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#64748b' : '#94a3b8',
  },
});

export const getFormRejectButtonStyles = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
    color: '#ef4444',
    borderRadius: 0,
    minHeight: '36px',
    padding: '0 16px',
    fontWeight: 600 as const,
  },
  rootHovered: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
    color: '#ffffff',
  },
  rootPressed: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
    color: '#ffffff',
  },
  rootDisabled: {
    backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#64748b' : '#94a3b8',
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
    color: isDarkMode ? '#e2e8f0' : '#374151', 
    marginBottom: '8px' 
  },
  root: {
    selectors: {
      '.ms-ChoiceField': {
        marginTop: 0,
      },
      '.ms-ChoiceField-field': {
        color: isDarkMode ? '#e2e8f0' : '#374151',
        fontWeight: 500 as const,
      },
      '.ms-ChoiceField-field::before': {
        borderColor: isDarkMode ? '#64748b' : '#9ca3af',
        borderWidth: '2px',
        background: isDarkMode ? '#1e293b' : '#ffffff',
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
        color: isDarkMode ? '#e2e8f0' : '#374151',
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
    borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    color: isDarkMode ? '#475569' : '#cbd5e1',
  },
});

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
    background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(0, 0, 0, 0.04)',
    borderRadius: '6px',
    marginBottom: '16px',
    width: 'fit-content',
  } as React.CSSProperties,
  option: (isActive: boolean, isDisabled: boolean) => ({
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    background: isActive 
      ? colours.cta
      : 'transparent',
    color: isActive 
      ? '#ffffff' 
      : (isDisabled 
        ? (isDarkMode ? '#475569' : '#94a3b8')
        : (isDarkMode ? '#94a3b8' : '#64748b')),
    border: 'none',
    opacity: isDisabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties),
});
