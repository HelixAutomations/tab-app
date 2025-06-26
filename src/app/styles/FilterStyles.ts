// src/app/styles/FilterStyles.ts

import { mergeStyles, IDropdownStyles } from '@fluentui/react';
import { colours } from './colours';

export const sharedSearchBoxContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
  });

export const sharedControlsContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 1,
  flexWrap: 'nowrap',
});

export const sharedSearchBoxStyle = (isDarkMode: boolean) => ({
  root: {
    position: 'relative' as const,
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '0',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
    height: '32px',
    outline: 'none',
    selectors: {
      ':focus': {
        outline: 'none',
        border: 'none',
        boxShadow: 'none',
      },
      ':focus-within': {
        outline: 'none',
        border: 'none',
        boxShadow: 'none',
      },
      '&::after': {
        content: '""',
        position: 'absolute' as const,
        left: '50%',
        bottom: '0',
        height: '1px',
        width: '100%',
        backgroundColor: isDarkMode ? colours.dark.highlight : colours.highlight,
        transform: 'translateX(-50%) scaleX(0)',
        transformOrigin: 'center',
        transition: 'transform 0.15s ease-out',
      },
      '&:hover::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
      '&:focus-within::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
    },
  },
  field: {
    backgroundColor: 'transparent',
    border: 'none',
    boxShadow: 'none !important',
    borderRadius: '8px 8px 0 0',
    padding: '0 12px',
    height: '100%',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    outline: 'none',
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

export const sharedDropdownContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    alignItems: 'center',
  });

export const sharedDropdownStyles = (isDarkMode: boolean): Partial<IDropdownStyles> => ({
  root: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '300px',
    height: '32px',
    outline: 'none',
    selectors: {
      '&::after': {
        content: '""',
        position: 'absolute' as const,
        left: '50%',
        bottom: '0',
        height: '1px',
        width: '100%',
        backgroundColor: isDarkMode ? colours.dark.highlight : colours.highlight,
        transform: 'translateX(-50%) scaleX(0)',
        transformOrigin: 'center',
        transition: 'transform 0.15s ease-out',
      },
      '&:hover::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
      '&:focus-within::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
    },
  },
  dropdown: {
    backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '0',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    backgroundColor: 'transparent',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '13px',
    height: '32px',
    paddingLeft: '12px',
    paddingRight: '36px',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    flexGrow: 1,
    justifyContent: 'space-between',
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

export const sharedToggleButtonStyle = (isDarkMode: boolean) => ({
  root: {
    padding: '6px 12px',
    borderRadius: '8px 8px 0 0',
    backgroundColor: '#ffffff',
    border: 'none',
    color: isDarkMode ? colours.dark.text : '#000000',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
    transform: 'none !important',
    outline: 'none !important',
    height: '32px',
    ':focus': {
      outline: 'none !important',
      border: 'none !important',
      transform: 'none !important',
    },
    selectors: {
      ':hover': {
        background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), #ffffff !important`,
        boxShadow: '0 0 8px rgba(0,0,0,0.1) !important',
        transform: 'none !important',
        outline: 'none !important',
        border: 'none !important',
      },
      ':active': {
        background: `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), #ffffff !important`,
        boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
        transform: 'none !important',
        outline: 'none !important',
        border: 'none !important',
      },
    },
  },
  label: {
    color: isDarkMode ? colours.dark.text : '#000000 !important',
    fontWeight: 'normal'
  },
});

// New Style Added
export const sharedEditorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    minHeight: '150px',
    padding: '20px 20px 110px 20px',
    borderRadius: '0',
    border: `1px solid ${isDarkMode ? colours.dark.cardHover : colours.light.cardHover}`,
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    outline: 'none',
    position: 'relative',
    selectors: {
      ':focus-visible': {
        border: `1px solid ${colours.cta}`,
        boxShadow: `inset 0 0 6px 3px ${colours.grey}`,
      },
      ':after': {
        content: '""',
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        backgroundImage: 'url("https://helix-law.co.uk/wp-content/uploads/2024/03/HLRblue72.png")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'left bottom',
        backgroundSize: '25%',
        opacity: 0.2,
        pointerEvents: 'none',
        width: 'calc(100% - 20px)',
        height: 'calc(100% - 20px)',
        zIndex: 0,
      },
    },
  });

// New Style for Template Block Dropdowns
export const sharedOptionsDropdownStyles = (isDarkMode: boolean): Partial<IDropdownStyles> => ({
  root: {
    position: 'relative',
    width: '100%',
    height: '32px',
    outline: 'none',
    selectors: {
      '&::after': {
        content: '""',
        position: 'absolute' as const,
        left: '50%',
        bottom: '0',
        height: '1px',
        width: '100%',
        backgroundColor: isDarkMode ? colours.dark.highlight : colours.highlight,
        transform: 'translateX(-50%) scaleX(0)',
        transformOrigin: 'center',
        transition: 'transform 0.15s ease-out',
      },
      '&:hover::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
      '&:focus-within::after': {
        transform: 'translateX(-50%) scaleX(1)',
      },
    },
  },
  dropdown: {
    backgroundColor: isDarkMode ? colours.dark.grey : colours.grey,
    border: 'none',
    boxShadow: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '0',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    backgroundColor: 'transparent',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '13px',
    height: '32px',
    paddingLeft: '12px',
    paddingRight: '36px',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    justifyContent: 'space-between',
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
