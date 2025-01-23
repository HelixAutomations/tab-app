// src/tabs/home/ActionItem.tsx

import React from 'react';
import { mergeStyles, Text, Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';

interface ActionItemProps {
  title: string;
  iconName: string;
  onClick: () => void;
  isDarkMode: boolean;
  animationDelay?: number;
}

const ActionItem: React.FC<ActionItemProps> = ({ title, iconName, onClick, isDarkMode, animationDelay = 0 }) => {
  const actionItemStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 2px 6px rgba(255, 255, 255, 0.1)`
      : `0 2px 6px rgba(0, 0, 0, 0.1)`,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '200px',
    height: '150px',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.3s, box-shadow 0.3s',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: 'fadeInUp 0.3s ease forwards',
    animationDelay: `${animationDelay}s`,
    ':hover': {
      transform: 'translateY(-5px)',
      boxShadow: isDarkMode
        ? `0 4px 12px ${colours.dark.border}`
        : `0 4px 12px ${colours.light.border}`,
    },
  });

  const iconStyle = mergeStyles({
    fontSize: '40px',
    color: '#ccc',
    marginBottom: '10px',
  });

  const titleStyle = mergeStyles({
    fontWeight: '600',
    fontSize: '16px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  });

  return (
    <div className={actionItemStyle} onClick={onClick} aria-label={title}>
      <Icon iconName={iconName} className={iconStyle} />
      <Text className={titleStyle}>{title}</Text>
    </div>
  );
};

export default ActionItem;
