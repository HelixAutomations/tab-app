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
}

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  title,
  icon,
  isDarkMode,
  onClick,
  iconColor,
}) => {
  // Compact card style for a horizontal bar without circular icon backgrounds
  const cardStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '6px 10px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow: isDarkMode
      ? `0 2px 4px ${colours.dark.border}`
      : `0 2px 4px ${colours.light.border}`,
    cursor: 'pointer',
    transition: 'background-color 0.3s, box-shadow 0.3s',
    selectors: {
      ':hover': {
        backgroundColor: colours.highlight,
        boxShadow: isDarkMode
          ? `0 2px 4px ${colours.dark.border}`
          : `0 2px 4px ${colours.light.border}`,
      },
    },
  });

  // Now simply style the icon inline
  const iconStyle = mergeStyles({
    fontSize: '16px',
    color: iconColor || colours.highlight,
    marginRight: '4px',
  });

  const textStyle = mergeStyles({
    fontWeight: 600,
    fontSize: '12px',
    whiteSpace: 'nowrap',
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
      <Icon iconName={icon} className={iconStyle} />
      <Text variant="small" styles={{ root: textStyle }}>
        {title}
      </Text>
    </div>
  );
};

export default QuickActionsCard;
