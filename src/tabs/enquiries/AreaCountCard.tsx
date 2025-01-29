// D:/helix projects/workspace/tab apps/helix hub v1/src/tabs/enquiries/AreaCountCard.tsx

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

interface AreaCountCardProps {
  area: string;
  count: number;
  monthlyCounts: MonthlyCount[];
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

  const safeMonthlyCounts = monthlyCounts.length > 0 ? monthlyCounts : [{ month: 'N/A', count: 0 }];

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

  const cardStyle = mergeStyles({
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
    selectors: {
      ':hover $chartContainer': {
        opacity: 1,
      },
    },
  });

  const iconStyle = mergeStyles({
    fontSize: '32px',
    color: color,
    marginRight: '10px',
  });

  const contentStyle = mergeStyles({
    zIndex: 2,
    display: 'flex',
    alignItems: 'flex-start',
    flexDirection: 'column',
  });

  return (
    <div
      className={cardStyle}
      style={{ animationDelay: `${animationDelay}s` }}
      aria-label={`${area} area count card`}
    >
      <div className={chartContainerClass}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={safeMonthlyCounts} margin={{ top: 25, right: 25, left: 25, bottom: 25 }}>
            
            {/* Remove CartesianGrid to eliminate background grid lines */}
            
            <XAxis dataKey="month" hide />
            
            <YAxis 
              hide 
              domain={['auto', 'auto']} 
            />
            
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
              stroke={colours.grey} 
              strokeWidth={3}  // Thicker stroke for better visibility
              opacity={1}  // Ensure full opacity
              dot={{ fill: colours.grey, r: 2 }}  // Slightly bigger dots for clarity
              activeDot={{ r: 6 }}  // Highlight dot on hover
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ zIndex: 2, display: 'flex', alignItems: 'center' }}>
        <Icon iconName={icon} className={iconStyle} />
        <div className={contentStyle}>
          <Text
            variant="large"
            styles={{
              root: {
                fontWeight: 600,
                color: '#333',
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
            {area}
          </Text>
          <Text
            variant="xxLarge"
            styles={{
              root: {
                fontWeight: 800,
                color: '#000',
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
            {count}
          </Text>
        </div>
      </div>
    </div>
  );
};

export default AreaCountCard;
