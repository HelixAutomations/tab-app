// src/tabs/home/MetricCard.tsx

import React, { useState } from 'react';
import { Text, mergeStyles, TooltipHost, DirectionalHint } from '@fluentui/react';
import CountUp from 'react-countup';
import { colours } from '../../app/styles/colours';

interface MetricCardProps {
  title: string;
  count?: number;
  prevCount?: number;
  hours?: number;
  prevHours?: number;
  money?: number;
  prevMoney?: number;
  isDarkMode: boolean;
  isTimeMoney?: boolean;
}

// Update `cardStyle` to allow cards to take up the extra space by increasing the flex property.
const cardStyle = (isDarkMode: boolean, isPositive: boolean | null) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '20px',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s, transform 0.3s, border 0.3s',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '150px', // Increased height for better alignment
    flex: '1 1 30%', // Adjusted to make cards wider by default
    minWidth: '300px', // Increased minimum width
    maxWidth: '500px', // Added a maximum width
    cursor: 'pointer',
    border:
      isPositive !== null ? `2px solid ${isPositive ? 'green' : 'red'}` : '2px solid transparent',
    ':hover': {
      transform: 'translateY(-5px)',
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
    },
  });

const metricTitleStyle = mergeStyles({
  fontSize: '16px',
  fontWeight: '600',
  marginBottom: '8px',
});

const moneyStyle = mergeStyles({
  fontSize: '24px',
  fontWeight: '700',
  color: colours.highlight,
});

const pipeStyle = mergeStyles({
  fontSize: '24px',
  fontWeight: '500',
  color: colours.greyText,
  margin: '0 10px',
});

const hoursStyle = mergeStyles({
  fontSize: '24px',
  fontWeight: '500',
  color: colours.greyText,
});

const changeStyle = (isPositive: boolean) =>
  mergeStyles({
    fontSize: '14px',
    fontWeight: '600',
    color: isPositive ? 'green' : 'red',
    marginTop: '8px',
  });

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  count,
  prevCount,
  hours,
  prevHours,
  money,
  prevMoney,
  isDarkMode,
  isTimeMoney = false,
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Helper function to calculate change and percentage
  const calculateChange = (current: number, previous: number) => {
    const change = current - previous;
    const percentage = previous !== 0 ? (change / previous) * 100 : 0;
    return { change, percentage };
  };

  // Calculate changes based on props
  const countChange = count !== undefined && prevCount !== undefined
    ? calculateChange(count, prevCount)
    : null;

  const moneyChange = money !== undefined && prevMoney !== undefined
    ? calculateChange(money, prevMoney)
    : null;

  const hoursChange = hours !== undefined && prevHours !== undefined
    ? calculateChange(hours, prevHours)
    : null;

  // Determine if overall change is positive or negative for border color
  let overallChange: boolean | null = null;
  if (isTimeMoney) {
    if (moneyChange && hoursChange) {
      // If both changes exist, determine based on moneyChange
      overallChange = moneyChange.change >= 0;
    } else if (moneyChange) {
      overallChange = moneyChange.change >= 0;
    } else if (hoursChange) {
      overallChange = hoursChange.change >= 0;
    }
  } else if (countChange) {
    overallChange = countChange.change >= 0;
  }

  // Prepare tooltip content
  const tooltipContent = () => {
    if (isTimeMoney) {
      return (
        <>
          {moneyChange && (
            <div>
              <strong>Money:</strong> £{Math.abs(moneyChange.change).toLocaleString()} (
              {Math.abs(Number(moneyChange.percentage.toFixed(2)))}% {moneyChange.change >= 0 ? '↑' : '↓'})
            </div>
          )}
          {hoursChange && (
            <div>
              <strong>Hours:</strong> {Math.abs(hoursChange.change)} hrs (
              {Math.abs(Number(hoursChange.percentage.toFixed(2)))}% {hoursChange.change >= 0 ? '↑' : '↓'})
            </div>
          )}
        </>
      );
    } else if (countChange) {
      return (
        <div>
          <strong>Change:</strong> {Math.abs(countChange.change).toLocaleString()} (
          {Math.abs(Number(countChange.percentage.toFixed(2)))}% {countChange.change >= 0 ? '↑' : '↓'})
        </div>
      );
    }
    return ''; // Ensure this never returns null
  };

  return (
    <TooltipHost content={tooltipContent()} directionalHint={DirectionalHint.topCenter}>
      <div
        className={cardStyle(isDarkMode, isHovered ? overallChange : null)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={`${title} metric card`}
      >
        <Text className={metricTitleStyle}>{title}</Text>
        {isTimeMoney ? (
          <Text className={mergeStyles({ display: 'flex', alignItems: 'center' })}>
            <span className={moneyStyle}>
              £<CountUp start={0} end={Number(money) || 0} duration={2.5} separator="," />
            </span>
            <span className={pipeStyle}>|</span>
            <span className={hoursStyle}>
              <CountUp start={0} end={Number(hours) || 0} duration={2.5} separator="," /> hrs
            </span>
          </Text>
        ) : (
          <Text className={mergeStyles({ fontSize: '24px', fontWeight: '700', color: colours.highlight })}>
            {count !== undefined ? <CountUp start={0} end={Number(count)} duration={2.5} separator="," /> : ''}
          </Text>
        )}

        {/* Display change information when hovered */}
        {isHovered && (
          <div>
            {isTimeMoney ? (
              <>
                {moneyChange && (
                  <Text className={changeStyle(moneyChange.change >= 0)}>
                    £{Math.abs(moneyChange.change).toLocaleString()} ({Math.abs(Number(moneyChange.percentage.toFixed(2)))}% {moneyChange.change >= 0 ? '↑' : '↓'})
                  </Text>
                )}
                {hoursChange && (
                  <Text className={changeStyle(hoursChange.change >= 0)}>
                    {Math.abs(hoursChange.change)} hrs ({Math.abs(Number(hoursChange.percentage.toFixed(2)))}% {hoursChange.change >= 0 ? '↑' : '↓'})
                  </Text>
                )}
              </>
            ) : (
              countChange && (
                <Text className={changeStyle(countChange.change >= 0)}>
                  {Math.abs(countChange.change).toLocaleString()} ({Math.abs(Number(countChange.percentage.toFixed(2)))}% {countChange.change >= 0 ? '↑' : '↓'})
                </Text>
              )
            )}
          </div>
        )}
      </div>
    </TooltipHost>
  );
};

export default React.memo(MetricCard);
