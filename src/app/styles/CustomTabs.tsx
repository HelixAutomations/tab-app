// src/app/styles/CustomTabs.tsx

import React from 'react';
import { Pivot, PivotItem, IPivotStyles, initializeIcons } from '@fluentui/react';
import { colours } from './colours';
import './CustomTabs.css'; // Import the CSS file for custom styles
import { useTheme } from '../../app/functionality/ThemeContext';
import { Tab } from '../functionality/types'; // Import from shared types

initializeIcons(); // Initialize Fluent UI icons

interface CustomTabsProps {
  selectedKey: string;
  onLinkClick: (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => void;
  tabs: Tab[]; // Use the shared Tab interface
  ariaLabel?: string;
}

const customPivotStyles = (isDarkMode: boolean): Partial<IPivotStyles> => ({
  root: {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderRadius: '8px',
    padding: '5px',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.3s',
  },
  link: {
    fontSize: '16px',
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    backgroundColor: 'transparent',
    padding: '10px 20px',
    borderRadius: '4px',
    transition: 'background-color 0.3s, color 0.3s',
    selectors: {
      '::after': {
        content: '"|"',
        position: 'absolute',
        right: '-10px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: isDarkMode ? '#555' : '#ccc',
      },
      ':last-child::after': {
        content: '""',
      },
      ':hover': {
        backgroundColor: isDarkMode
          ? colours.dark.cardHover
          : colours.light.cardHover,
      },
    },
  },
  linkIsSelected: {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    transform: 'scale(1.05)',
    boxShadow: isDarkMode
      ? '0 4px 8px rgba(255,255,255,0.2)'
      : '0 4px 8px rgba(0,0,0,0.2)',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    selectors: {
      '::after': {
        content: '""',
      },
    },
  },
});

const CustomTabs: React.FC<CustomTabsProps> = ({ selectedKey, onLinkClick, tabs, ariaLabel }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

  // Handle link clicks, preventing disabled tabs from being selected
  const handleLinkClick = (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
    const clickedTab = tabs.find(tab => tab.key === item?.props.itemKey);
    if (clickedTab?.disabled) {
      ev?.preventDefault(); // Prevent the default action
      return;
    }
    onLinkClick(item, ev);
  };

  return (
    <Pivot
      selectedKey={selectedKey}
      onLinkClick={handleLinkClick} // Use the custom handler
      aria-label={ariaLabel || 'Custom Tabs'}
      styles={customPivotStyles(isDarkMode)}
      className="customPivot" // Add custom class here
    >
      {tabs.map((tab, index) => (
        <PivotItem
          itemKey={tab.key}
          key={tab.key}
          headerText={tab.text}
          itemIcon={tab.key === 'reporting' ? 'Lock' : undefined} // Add lock icon only for "Reporting"
          headerButtonProps={{
            className: tab.disabled ? 'disabledTab' : '', // Apply disabled class
            style: { '--animation-delay': `${index * 0.1}s` } as React.CSSProperties, // Dynamic delay
            'aria-disabled': tab.disabled ? 'true' : undefined, // Accessibility
          }}
        />
      ))}
    </Pivot>
  );
};

export default CustomTabs;
