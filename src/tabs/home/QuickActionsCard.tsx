// src/tabs/home/QuickActionsCard.tsx

import React from 'react';
import { mergeStyles, Icon, IconButton, Text } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import '../../app/styles/QuickActionsCard.css'; // Import the CSS file

interface QuickActionsCardProps {
  title: string;
  icon: string;
  isDarkMode: boolean;
  onClick: () => void;
  iconColor: string;
}

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  title,
  icon,
  isDarkMode,
  onClick,
  iconColor,
}) => {
  // Define styles for the card
  const cardStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '15px 20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    cursor: 'pointer',
    transition: 'background-color 0.3s, box-shadow 0.3s',
    ':hover': {
      backgroundColor: colours.highlight, // Fill with blue on hover
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
    },
  });

  // Define styles for the icon bubble
  const iconBubbleStyle = mergeStyles({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: `2px solid ${colours.highlight}`, // Blue outline
    backgroundColor: 'transparent',
    color: colours.highlight, // Blue icon initially
    flexShrink: 0,
    transition: 'background-color 0.3s, color 0.3s',
    selectors: {
      ':hover &': {
        backgroundColor: colours.highlight, // Fill blue on hover
        color: '#ffffff', // Icon turns white on hover
      },
    },
  });

  return (
    <div
      className={`quickActionCard ${cardStyle}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      <div className={iconBubbleStyle}>
        <Icon iconName={icon} />
      </div>
      <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
        {title}
      </Text>
      <IconButton
        iconProps={{ iconName: 'ChevronRight' }}
        ariaLabel="Go to action"
        styles={{
          root: {
            marginLeft: 'auto',
            color: isDarkMode ? colours.dark.text : colours.light.text,
          },
          icon: {
            fontSize: 16,
          },
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      />
    </div>
  );
};

export default QuickActionsCard;
