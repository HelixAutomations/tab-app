// src/tabs/matters/PracticeAreaCountCard.tsx
import React from 'react';
import { Text, Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTheme } from '../../app/functionality/ThemeContext';

interface MonthlyCount {
  month: string;
  count: number;
}

interface PracticeAreaCountCardProps {
  practiceArea: string;
  count: number;
  monthlyCounts: MonthlyCount[];
  icon: string;
  color: string;
  animationDelay?: number;
}

const chartContainerClass = mergeStyles({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 1,
  opacity: 0.5,
  pointerEvents: 'none',
  transition: 'opacity 0.3s ease-in-out',
});

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    flex: '1 1 0',
    width: '100%',
    minHeight: '200px',
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.background : '#ffffff',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? '0 4px 16px rgba(255, 255, 255, 0.1)'
      : '0 4px 16px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    fontFamily: 'Raleway, sans-serif',
  });

const iconStyle = mergeStyles({
  fontSize: '32px',
  marginRight: '10px',
});

const contentStyle = mergeStyles({
  zIndex: 2,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
});

const PracticeAreaCountCard: React.FC<PracticeAreaCountCardProps> = ({
  practiceArea,
  count,
  monthlyCounts,
  icon,
  color,
  animationDelay = 0,
}) => {
  const { isDarkMode } = useTheme();

  const safeMonthlyCounts = monthlyCounts.length > 0 ? monthlyCounts : [{ month: 'N/A', count: 0 }];

  return (
    <div
      className={cardStyle(isDarkMode)}
      style={{ animationDelay: `${animationDelay}s` }}
      aria-label={`${practiceArea} count card`}
    >
      <div className={chartContainerClass}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={safeMonthlyCounts} margin={{ top: 25, right: 25, left: 25, bottom: 25 }}>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#fff',
                border: `1px solid ${isDarkMode ? colours.dark.border : '#ccc'}`,
                color: isDarkMode ? colours.dark.text : '#000',
                fontFamily: 'Raleway, sans-serif',
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={color}
              strokeWidth={3}
              dot={{ fill: color, r: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ zIndex: 2, display: 'flex', alignItems: 'center' }}>
        <Icon iconName={icon} className={mergeStyles(iconStyle, { color })} />
        <div className={contentStyle}>
          <Text variant="large" styles={{ root: { fontWeight: 600, color: isDarkMode ? '#fff' : '#333', fontFamily: 'Raleway, sans-serif' } }}>
            {practiceArea}
          </Text>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 800, color: isDarkMode ? '#fff' : '#000', fontFamily: 'Raleway, sans-serif' } }}>
            {count}
          </Text>
        </div>
      </div>
    </div>
  );
};

export default PracticeAreaCountCard;
