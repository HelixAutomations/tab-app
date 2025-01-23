// src/app/styles/ButtonStyles.ts

import { IButtonStyles } from '@fluentui/react';
import { colours } from './colours';

// Shared Primary Button Styles
export const sharedPrimaryButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: colours.cta,
    border: 'none',
    height: '40px',
    fontWeight: '600',
    color: '#ffffff',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    // Ensure no default focus ring:
    ':focus': {
      outline: 'none !important',
      border: 'none !important',
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.cta} !important`,
    boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootPressed: {
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 100%), ${colours.cta} !important`,
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

// Shared Default Button Styles
export const sharedDefaultButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px', // match the primary button padding
    borderRadius: '4px',
    backgroundColor: colours.secondaryButtonBackground,
    border: 'none',
    height: '40px', // match the primary button height
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
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), ${colours.secondaryButtonBackground} !important`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15) !important', /* Enhanced shadow on hover */
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootPressed: {
    background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.secondaryButtonBackground} !important`,
    boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  rootFocused: {
    backgroundColor: `${colours.secondaryButtonBackground} !important`,
    transform: 'none !important',
    outline: 'none !important',
    border: 'none !important',
  },
  label: {
    color: '#000000 !important',
    fontWeight: 'normal !important', /* Ensure label font weight is normal */
  },
};

// Shared Draft Confirmed Button Styles
export const sharedDraftConfirmedButtonStyles: IButtonStyles = {
  root: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: 'transparent', // No background to emphasize border and icon
    border: `2px solid ${colours.green} !important`, // Green border with !important to override defaults
    height: '40px',
    fontWeight: '600',
    color: `${colours.green} !important`, // Green label
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.2)', // Inner shadow for pressed effect
    transition: 'background 0.3s ease, box-shadow 0.3s ease, border 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    // Ensure no default focus ring and maintain styles on focus:
    ':focus': {
      outline: 'none !important',
      border: `2px solid ${colours.green} !important`,
      transform: 'none !important',
    },
  },
  rootHovered: {
    background: `${colours.green}cc !important`, // Slightly lighter green on hover
    boxShadow: 'inset 0 0 5px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
    // Border remains green as defined in root
  },
  rootPressed: {
    background: `${colours.green}b3 !important`, // Even lighter green on press
    boxShadow: 'inset 0 0 8px rgba(0,0,0,0.3) !important',
    transform: 'none !important',
    outline: 'none !important',
    // Border remains green as defined in root
  },
  rootFocused: {
    backgroundColor: 'transparent !important', // Maintain transparent background
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
    color: `${colours.green} !important`, // Green icon
  },
  label: {
    color: `${colours.green} !important`, // Green label
  },
  iconDisabled: {
    color: `${colours.green} !important`, // Green icon when disabled
  },
  labelDisabled: {
    color: `${colours.green} !important`, // Green label when disabled
  },
};
