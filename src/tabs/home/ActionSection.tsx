// src/tabs/home/ActionSection.tsx

import React from 'react';
import {
  mergeStyles,
  PrimaryButton,
  concatStyleSets,
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

// Outer container that includes the border
const sectionContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    // Force full width and override any maxWidth from outside
    width: '100% !important',
    maxWidth: 'none !important',

    backgroundColor: 'transparent',
    border: `2px solid ${colours.cta}`,
    borderRadius: '12px',
    padding: '20px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
  });

// Child container for actions
const actionsFlexStyle = mergeStyles({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '15px',
  justifyContent: 'flex-start',
  alignItems: 'center',
});

//////////////////////
// ActionSection Component
//////////////////////

const ActionSection: React.FC<ActionSectionProps> = ({ actions, isDarkMode }) => {
  return (
    <div className={sectionContainerStyle(isDarkMode)}>
      <div className={actionsFlexStyle}>
        {actions.map((action, index) => (
          <PrimaryButton
            key={index}
            text={action.title}
            onClick={action.onClick}
            styles={concatStyleSets(sharedPrimaryButtonStyles, {
              root: {
                animation: 'redPulse 2s infinite',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                minWidth: '150px',
              },
            })}
            ariaLabel={action.title}
          />
        ))}
      </div>
    </div>
  );
};

export default ActionSection;
