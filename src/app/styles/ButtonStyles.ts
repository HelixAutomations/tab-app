// invisible change 3
// src/app/styles/ButtonStyles.ts
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { colours } from './colours';

// Helper function for creating a consistent radial gradient overlay
const createRadialGradient = (baseColor: string) =>
  `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${baseColor} !important`;

// Shared Primary Button Styles
export const sharedPrimaryButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    backgroundColor: colours.cta,
    border: 'none',
    height: '40px',
    fontWeight: '600',
    color: '#ffffff',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    ':focus': {
      outline: 'none !important',
      border: 'none !important',
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: createRadialGradient(colours.cta),
    boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootPressed: {
    background: createRadialGradient(colours.cta),
    boxShadow: '0 0 8px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootFocused: {
    backgroundColor: `${colours.cta} !important`,
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  label: {
    color: '#ffffff !important',
  },
};

// Shared Default Button Styles (unchanged)
export const sharedDefaultButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: colours.grey,
    border: 'none',
    height: '40px',
    fontWeight: 'normal',
    color: '#000000',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    ':focus': {
      outline: 'none !important',
      border: 'none !important',
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), ${colours.grey} !important`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootPressed: {
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.grey} !important`,
    boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootFocused: {
    backgroundColor: `${colours.grey} !important`,
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  label: {
    color: '#000000 !important',
    fontWeight: 'normal !important',
  },
};

// Shared Draft Confirmed Button Styles (unchanged)
export const sharedDraftConfirmedButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: `2px solid ${colours.green} !important`,
    height: '40px',
    fontWeight: '600',
    color: `${colours.green} !important`,
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.2)',
    transition: 'background 0.3s ease, box-shadow 0.3s ease, border 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    ':focus': {
      outline: 'none !important',
      border: `2px solid ${colours.green} !important`,
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: `${colours.green}cc !important`,
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
  },
  rootPressed: {
    background: `${colours.green}b3 !important`,
    boxShadow: 'inset 0 0 8px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
  },
  rootFocused: {
    backgroundColor: 'transparent !important',
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.2) !important',
    border: `2px solid ${colours.green} !important`,
    transform: 'none !important',
    outline: 'none !important',
  },
  rootDisabled: {
    backgroundColor: 'transparent !important',
    border: `2px solid ${colours.green} !important`,
    color: `${colours.green} !important`,
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.2) !important',
  },
  icon: {
    color: `${colours.green} !important`,
  },
  label: {
    color: `${colours.green} !important`,
  },
  iconDisabled: {
    color: `${colours.green} !important`,
  },
  labelDisabled: {
    color: `${colours.green} !important`,
  },
};

// Updated Shared Decision Button Styles using consistent gradient function
export const sharedDecisionButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: colours.highlight,
    border: 'none',
    height: '40px',
    fontWeight: '600',
    color: '#ffffff',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    ':focus': {
      outline: 'none !important',
      border: 'none !important',
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: createRadialGradient(colours.highlight),
    boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootPressed: {
    background: createRadialGradient(colours.highlight),
    boxShadow: '0 0 8px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootFocused: {
    backgroundColor: `${colours.highlight} !important`,
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  label: {
    color: '#ffffff !important',
  },
  // Added disabled state for consistency
  rootDisabled: {
    backgroundColor: colours.highlight,
    border: 'none !important',
    color: '#ffffff !important',
    opacity: 0.6,
    boxShadow: 'none !important',
  },
};


// Button style for inline option selections inside the editor
export const inlineOptionButtonStyles = (
  isSelected: boolean,
  isDarkMode: boolean
): IButtonStyles => ({
  root: {
    padding: '6px 8px',
    margin: '2px 0',
    borderRadius: 2,
    minWidth: '140px',
    width: '100%',
    transition: 'background-color 0.2s ease',
    backgroundColor: isSelected
      ? isDarkMode
        ? colours.dark.grey
        : colours.grey
      : 'transparent',
    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'flex-start',
    selectors: {
      ':focus': {
        outline: `2px solid ${colours.highlight}`,
      },
    },
  },
  rootHovered: {
    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
  },
  rootPressed: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
  },
});