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
  borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
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
    minHeight: '44px',
  },
  title: {
    background: 'transparent',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '14px',
    lineHeight: '44px',
    borderRadius: 0,
  },
  caretDownWrapper: {
    color: isDarkMode ? '#94a3b8' : '#64748b',
  },
  label: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    marginBottom: '6px',
  },
  callout: {
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    boxShadow: isDarkMode 
      ? '0 8px 24px rgba(0, 0, 0, 0.4)' 
      : '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  dropdownItem: {
    background: isDarkMode ? '#1e293b' : '#ffffff',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '14px',
  },
  dropdownItemSelected: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
  },
  dropdownItemHovered: {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.04)',
  },
});

// ============================================================================
// BUTTON STYLES (matching existing sharedButtonStyles)
// ============================================================================

export const getFormPrimaryButtonStyles = (isDarkMode: boolean, accentColor?: string) => ({
  root: {
    backgroundColor: accentColor || colours.cta,
    borderColor: accentColor || colours.cta,
    borderRadius: 0,
    minHeight: '40px',
    padding: '0 24px',
  },
  rootHovered: {
    backgroundColor: accentColor 
      ? adjustColor(accentColor, -10) 
      : colours.highlight,
    borderColor: accentColor 
      ? adjustColor(accentColor, -10) 
      : colours.highlight,
  },
  rootPressed: {
    backgroundColor: accentColor 
      ? adjustColor(accentColor, -20) 
      : colours.highlight,
    borderColor: accentColor 
      ? adjustColor(accentColor, -20) 
      : colours.highlight,
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

// ============================================================================
// MESSAGE BAR STYLES
// ============================================================================

export const getMessageBarStyle = (isDarkMode: boolean): React.CSSProperties => ({
  marginBottom: '1rem',
  borderRadius: 0,
});

// ============================================================================
// ACCENT COLORS FOR DIFFERENT FORM TYPES
// ============================================================================

export const formAccentColors = {
  techIdea: colours.cta,           // Blue - Ideas
  techProblem: '#dc3545',          // Red - Problems
  expert: colours.highlight,       // Green - Experts
  counsel: '#7c3aed',              // Purple - Counsel
  bundle: '#ea580c',               // Orange - Bundles
  attendance: '#0891b2',           // Teal - Attendance
  leave: '#16a34a',                // Green - Leave
  notableCase: '#8b5cf6',          // Violet - Notable cases
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
