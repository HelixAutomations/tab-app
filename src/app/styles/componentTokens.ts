// invisible change
// invisible change 3
import { colours } from './colours';

/**
 * Design tokens that capture the look and feel of common UI components.
 * These values are derived from the sample instruction form styles and can be
 * reused across the application to maintain visual consistency.
 * 
 * Enhanced with professional styling tokens for glass morphism and modern design patterns.
 */
export const componentTokens = {
  stepHeader: {
    base: {
      backgroundColor: colours.darkBlue,
      textColor: '#ffffff',
      borderRadius: '0px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    },
    active: {
      backgroundColor: colours.darkBlue,
      textColor: '#ffffff',
      borderColor: colours.darkBlue,
    },
    lockedOpacity: 0.5,
  },

  stepContent: {
    borderColor: 'rgba(211,211,211,0.5)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.09)',
    completedBorderColor: '#7DBB7D',
  },

  toggleButton: {
    base: {
      backgroundColor: colours.grey,
      color: colours.darkBlue,
      border: `2px solid ${colours.blue}`,
      borderRadius: '0px',
      padding: '10px 16px',
    },
    hover: {
      backgroundColor: '#e0e7ff',
    },
    active: {
      backgroundColor: colours.darkBlue,
      color: '#ffffff',
    },
  },

  summaryPane: {
    base: {
      backgroundColor: colours.grey,
      borderRadius: '0px',
      borderColor: '#e3e8ef',
      boxShadow: '0 2px 12px rgba(44,71,129,0.05)',
      padding: '1.5rem 1.2rem',
    },
    collapsed: {
      backgroundColor: '#f5fdf7',
      borderColor: '#49B670',
      padding: '0',
    },
  },

  infoBanner: {
    background: `linear-gradient(to right, #ffffff, ${colours.grey})`,
    borderLeft: `3px solid ${colours.cta}`,
    padding: '0.35rem 0.75rem',
  },

  /** Banner used for confirming deal closure */
  successBanner: {
    background: `linear-gradient(to right, #ffffff, ${colours.grey})`,
    borderLeft: `3px solid ${colours.green}`,
    padding: '0.35rem 0.75rem',
  },

  accordion: {
    header: {
      background: `linear-gradient(to right, #ffffff, ${colours.grey})`,
      padding: '0.35rem 0.75rem',
      fontWeight: 600,
      color: '#1f2937',
    },
    body: {
      backgroundColor: colours.grey,
      padding: '0.75rem',
      borderRadius: '0px',
    },
  },

  /** Generic card styles used for form tiles and quick actions */
  card: {
    base: {
      padding: '12px',
      borderRadius: '0px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    },
    hover: {
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      transform: 'translateY(-5px)',
    },
  },

  /** Professional styling tokens for modern UI components */
  professional: {
    glassMorphism: {
      light: {
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
      },
      dark: {
        background: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(148, 163, 184, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(148, 163, 184, 0.1)',
      },
    },
    gradients: {
      primary: 'linear-gradient(135deg, #3690CE 0%, #1e40af 100%)',
      primaryDark: 'linear-gradient(135deg, #1e40af 0%, #3730a3 100%)',
      success: 'linear-gradient(135deg, #16A34A, #15803d)',
      warning: 'linear-gradient(135deg, #F59E0B, #D97706)',
      error: 'linear-gradient(135deg, #DC2626, #B91C1C)',
      neutral: 'linear-gradient(135deg, #64748b, #475569)',
      text: {
        light: 'linear-gradient(135deg, #1a365d, #3690CE)',
        dark: 'linear-gradient(135deg, #e2e8f0, #60a5fa)',
      },
    },
    shadows: {
      subtle: '0 4px 6px rgba(0, 0, 0, 0.07)',
      medium: '0 8px 25px rgba(0, 0, 0, 0.12)',
      strong: '0 16px 48px rgba(0, 0, 0, 0.15)',
      glow: '0 0 20px rgba(54, 144, 206, 0.3)',
      dark: {
        subtle: '0 4px 6px rgba(0, 0, 0, 0.3)',
        medium: '0 8px 25px rgba(0, 0, 0, 0.4)',
        strong: '0 16px 48px rgba(0, 0, 0, 0.5)',
        glow: '0 0 20px rgba(54, 144, 206, 0.4)',
      },
    },
    transitions: {
      fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
      medium: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      slow: '0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    borderRadius: {
      small: '8px',
      medium: '12px',
      large: '16px',
      pill: '50px',
    },
  },
} as const;

export type ComponentTokens = typeof componentTokens;
