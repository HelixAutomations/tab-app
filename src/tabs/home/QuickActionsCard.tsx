// src/tabs/home/QuickActionsCard.tsx

import React from 'react';
import { mergeStyles, Icon, Text } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import '../../app/styles/QuickActionsCard.css';

interface QuickActionsCardProps {
  title: string;
  icon: string;
  isDarkMode: boolean;
  onClick: () => void;
  iconColor?: string;
  confirmed?: boolean;
}

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  title,
  icon,
  isDarkMode,
  onClick,
  iconColor,
  confirmed,
}) => {
  // Base card style for a horizontal bar without circular icon backgrounds,
  // with increased size (approx. 20% larger)
  const baseCardStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '7px 12px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    boxShadow: isDarkMode
      ? `0 2px 4px ${colours.dark.border}`
      : `0 2px 4px ${colours.light.border}`,
    cursor: 'pointer',
    transition: 'background-color 0.3s, box-shadow 0.3s',
    selectors: {
      ':hover': {
        backgroundColor: colours.grey, // Updated hover colour
        boxShadow: isDarkMode
          ? `0 2px 4px ${colours.dark.border}`
          : `0 2px 4px ${colours.light.border}`,
      },
    },
  });

  // No extra custom style for the card container for attendance.
  const customStyle = {};

  const combinedCardStyle = mergeStyles(baseCardStyle, customStyle);

  // Base icon style with increased size
  let attendanceIconName = icon;
  let attendanceIconStyle = mergeStyles({
    fontSize: '19px',
    color: iconColor || colours.highlight,
    marginRight: '4px',
  });

  // For the Confirm Attendance quick action, override the icon and styling.
  if (title === 'Confirm Attendance') {
    if (confirmed) {
      // Show blue tick when confirmed (using the same size and blue as other quick actions)
      attendanceIconName = 'Accept';
      attendanceIconStyle = mergeStyles(attendanceIconStyle, { color: iconColor || colours.highlight });
    } else {
      // Show red cross when not confirmed, with a red inner pulse effect.
      attendanceIconName = 'Cancel';
      attendanceIconStyle = mergeStyles(attendanceIconStyle, {
        color: 'red',
        animation: 'redPulse 2s infinite',
        boxShadow: 'inset 0 0 5px rgba(255,0,0,0.5)',
      });
    }
  }

  // Text style with increased size
  const textStyle = mergeStyles({
    fontWeight: 600,
    fontSize: '14px',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      className={`quickActionCard ${combinedCardStyle}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      <Icon iconName={attendanceIconName} className={attendanceIconStyle} />
      <Text variant="small" styles={{ root: textStyle }}>
        {title}
      </Text>
    </div>
  );
};

export default QuickActionsCard;
