// src/app/styles/CustomTabs.tsx

import React from 'react';
import { Pivot, PivotItem, IPivotStyles } from '@fluentui/react';
import { colours } from './colours';
import './CustomTabs.css'; // Import the CSS file for custom styles
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface CustomTabsProps {
  selectedKey: string;
  onLinkClick: (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => void;
  tabs: { key: string; text: string }[];
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

  return (
    <Pivot
      selectedKey={selectedKey}
      onLinkClick={onLinkClick}
      aria-label={ariaLabel || 'Custom Tabs'}
      styles={customPivotStyles(isDarkMode)}
      className="customPivot" // Add custom class here
    >
      {tabs.map((tab) => (
        <PivotItem
          headerText={tab.text}
          itemKey={tab.key}
          key={tab.key}
          // Removed inline styles for animation
        />
      ))}
    </Pivot>
  );
};

export default CustomTabs;
