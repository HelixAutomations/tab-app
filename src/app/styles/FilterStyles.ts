// src/sharedStyles.ts

import { mergeStyles, IDropdownStyles } from '@fluentui/react';
import { colours } from './colours';

// Shared Styles for SearchBox Container
export const sharedSearchBoxContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative', // To position the icon correctly
    width: '100%', // Make it responsive
    maxWidth: '300px', // Limit the max width
    display: 'flex',
    alignItems: 'center',
  });

export const sharedControlsContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 1, // Ensures items stretch evenly
  flexWrap: 'nowrap', // Prevent wrapping
});

// Shared Styles for SearchBox
export const sharedSearchBoxStyle = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '8px 8px 0 0', // Rounded corners only at the top
    padding: '0',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
    height: '32px',
    borderBottom: `2px solid ${isDarkMode ? colours.dark.border : '#dcdcdc'}`, // Default bottom border
    transition: 'border-color 0.3s', // Smooth transition
    ':focus-within': {
      borderBottom: `2px solid ${isDarkMode ? colours.highlight : colours.cta}`, // Highlight colour on focus
    },
  },
  field: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '0 12px',
    height: '100%',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    outline: 'none', // Remove default outline
    '::placeholder': {
      color: isDarkMode ? '#aaaaaa' : '#888888',
      opacity: 1,
    },
  },
  icon: {
    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
    fontSize: '16px',
    marginLeft: '8px',
  },
});

// Shared Styles for Toggle
export const sharedToggleStyle = (isDarkMode: boolean) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 0,
  },
  label: {
    marginRight: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  },
});

// Shared Styles for Dropdown Container
export const sharedDropdownContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
  });

// Shared Styles for Dropdown
export const sharedDropdownStyles = (isDarkMode: boolean): Partial<IDropdownStyles> => ({
  root: {
    width: '100%',
    maxWidth: '300px',
    height: '32px',
    borderBottom: `2px solid ${isDarkMode ? colours.dark.border : '#dcdcdc'}`, // Apply the border to the parent
    transition: 'border-color 0.3s', // Smooth transition
    ':focus-within': {
      borderBottom: `2px solid ${isDarkMode ? colours.highlight : colours.cta}`, // Highlight effect
    },
  },
  dropdown: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    border: 'none', // Ensure no border on the dropdown itself
    boxShadow: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '0',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    backgroundColor: 'transparent', // Ensure title background doesn't interfere
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    height: '32px',
    paddingLeft: '12px',
    paddingRight: '36px',
    display: 'flex',
    alignItems: 'center',
    border: 'none', // Remove any border on the title element
  },
  caretDown: {
    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
    fontSize: '16px',
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },
});
