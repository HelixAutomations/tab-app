// src/tabs/home/ActionSection.tsx

import React from 'react';
import {
  mergeStyles,
  Stack,
  Text,
  PrimaryButton,
} from '@fluentui/react';
import { sharedPrimaryButtonStyles } from '../../app/styles/ButtonStyles';
import { colours } from '../../app/styles/colours';

//////////////////////
// Interfaces
//////////////////////

interface Action {
  category: string;
  title: string;
  onClick: () => void;
}

interface ActionSectionProps {
  actions: Action[];
  isDarkMode: boolean;
}

//////////////////////
// Styles
//////////////////////

// Container for the entire ActionSection
const sectionContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: 'transparent', // No fill
    border: `2px solid ${colours.cta}`, // CTA red border
    borderRadius: '12px', // Maintain rounded corners
    padding: '20px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`, // Optional shadow for better visibility
    transition: 'background-color 0.3s, box-shadow 0.3s',
    width: '100%',
  });

// Header style for each category
const categoryHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '700',
    fontSize: '18px',
    marginBottom: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

// Grid layout for actions
const actionsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '15px',
});

// Individual action item container
const actionItemStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 2px 6px rgba(255, 255, 255, 0.1)`
      : `0 2px 6px rgba(0, 0, 0, 0.1)`,
    padding: '10px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60px',
  });

// Pulsing animation style
const pulsingStyle = mergeStyles({
  animation: 'redPulse 2s infinite',
});

// Button style to prevent text wrapping
const buttonStyle = mergeStyles({
  whiteSpace: 'nowrap',
});

//////////////////////
// ActionSection Component
//////////////////////

const ActionSection: React.FC<ActionSectionProps> = ({ actions, isDarkMode }) => {
  // Group actions by category
  const groupedActions = actions.reduce<Record<string, Action[]>>((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {});

  return (
    <div className={sectionContainerStyle(isDarkMode)}>
      <Stack tokens={{ childrenGap: 20 }}>
        {Object.entries(groupedActions).map(([category, actionsArray]) => (
          <div key={category}>
            {/* Removed the category header */}
            <div className={actionsGridStyle}>
              {actionsArray.map((action, index) => (
                <div key={index} className={actionItemStyle(isDarkMode)}>
                  <PrimaryButton
                    text={action.title}
                    onClick={action.onClick}
                    styles={sharedPrimaryButtonStyles}
                    className={`${pulsingStyle} ${buttonStyle}`}
                    ariaLabel={action.title}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </Stack>
    </div>
  );
};

export default ActionSection;
