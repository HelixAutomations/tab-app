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

// Shared Styles for SearchBox
export const sharedSearchBoxStyle = (isDarkMode: boolean) => ({
  root: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff', // Consistent background
    border: 'none', // Remove border
    boxShadow: 'none', // Remove box-shadow
    borderRadius: '8px', // Rounded corners
    padding: '0',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
    height: '32px', // Match SearchBox height
  },
  field: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    padding: '0 12px',
    height: '100%', // Ensure the input fills the container height
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    '::placeholder': {
      color: isDarkMode ? '#aaaaaa' : '#888888',
      opacity: 1,
    },
    outline: 'none',
  },
  icon: {
    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
    fontSize: '16px',
    marginLeft: '8px',
  },
  clearButton: {
    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
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
    height: '32px', // Match SearchBox height
  },
  dropdown: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    border: 'none', // Remove border
    boxShadow: 'none', // Remove box-shadow
    borderRadius: '8px',
    padding: '0',
    height: '32px', // Match SearchBox height
    lineHeight: '32px', // Vertically center the text
  },
  dropdownItem: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    height: '32px', // Match SearchBox height
    lineHeight: '32px', // Vertically center the text
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? colours.dark.cardHover : '#f3f2f1',
      },
      ':focus': {
        backgroundColor: isDarkMode ? colours.dark.cardHover : '#f3f2f1',
      },
    },
  },
  title: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    paddingLeft: '12px',
    paddingRight: '12px',
    borderRadius: '8px',
    height: '32px', // Match SearchBox height
    display: 'flex',
    alignItems: 'center',
    lineHeight: '32px', // Vertically center the text
  },
  caretDown: {
    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
    fontSize: '16px',
    top: '50%', // Vertically center the caret
    transform: 'translateY(-50%)', // Vertically center the caret
  },
  dropdownItemSelected: {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#eaeaea',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: '600',
  },
});
