// src/tabs/matters/AreaCountCard.tsx

import React from 'react';
import { Stack, Text, Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface AreaCountCardProps {
  area: string;
  count: number;
  monthlyCounts: { month: string; count: number }[];
  icon: string;
  color: string;
  animationDelay?: number;
}

const AreaCountCard: React.FC<AreaCountCardProps> = ({
  area,
  count,
  monthlyCounts,
  icon,
  color,
  animationDelay = 0,
}) => {
  const { isDarkMode } = useTheme();

  const cardStyle = mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255,255,255,0.1)'
      : '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.3s',
    ':hover': {
      transform: 'scale(1.02)',
      boxShadow: isDarkMode
        ? '0 4px 16px rgba(255,255,255,0.2)'
        : '0 4px 16px rgba(0,0,0,0.2)',
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
    animation: `fadeIn 0.5s ease-in-out ${animationDelay}s forwards`,
    opacity: 0,
  });

  return (
    <div className={cardStyle}>
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
        <Icon iconName={icon} styles={{ root: { fontSize: 24, color } }} />
        <Text
          variant="large"
          styles={{
            root: {
              fontWeight: '600',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          {area}
        </Text>
      </Stack>
      <Text
        variant="xLarge"
        styles={{
          root: {
            fontWeight: '700',
            color: isDarkMode ? colours.dark.text : colours.light.text,
            marginTop: '10px',
          },
        }}
      >
        {count}
      </Text>
      {/* Optional: Add charts or additional details here */}
    </div>
  );
};

export default AreaCountCard;
