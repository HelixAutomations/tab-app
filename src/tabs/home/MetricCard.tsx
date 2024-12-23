// src/tabs/home/MetricCard.tsx

import React, { useState } from 'react';
import { Text, mergeStyles, TooltipHost, DirectionalHint } from '@fluentui/react';
import CountUp from 'react-countup';
import { colours } from '../../app/styles/colours';
import '../../app/styles/MetricCard.css'; // Import the CSS file

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
  isMoneyOnly?: boolean; // Added prop
  animationDelay?: number; // Add this prop
}

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
    height: '150px',
    flex: '1 1 30%',
    minWidth: '300px',
    maxWidth: '500px',
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
  isMoneyOnly = false, // Default to false
  animationDelay = 0, // Default delay
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const calculateChange = (current: number, previous: number) => {
    const change = current - previous;
    const percentage = previous !== 0 ? (change / previous) * 100 : 0;
    return { change, percentage };
  };

  const countChange =
    count !== undefined && prevCount !== undefined
      ? calculateChange(count, prevCount)
      : null;

  const moneyChange =
    money !== undefined && prevMoney !== undefined
      ? calculateChange(money, prevMoney)
      : null;

  const hoursChange =
    hours !== undefined && prevHours !== undefined
      ? calculateChange(hours, prevHours)
      : null;

  let overallChange: boolean | null = null;
  if (isTimeMoney) {
    if (moneyChange && hoursChange) {
      overallChange = moneyChange.change >= 0;
    } else if (moneyChange) {
      overallChange = moneyChange.change >= 0;
    } else if (hoursChange) {
      overallChange = hoursChange.change >= 0;
    }
  } else if (countChange) {
    overallChange = countChange.change >= 0;
  }

  const tooltipContent = () => {
    if (isMoneyOnly) {
      return (
        <div>
          <strong>Fees Recovered:</strong> £
          {money !== undefined
            ? money > 1000
              ? (money / 1000).toFixed(2) + 'k'
              : (money / 1000).toFixed(0) + 'k'
            : '0k'}
        </div>
      );
    }
    if (isTimeMoney) {
      return (
        <>
          {moneyChange && (
            <div>
              <strong>Money:</strong> £{Math.abs(moneyChange.change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (
              {Math.abs(Number(moneyChange.percentage.toFixed(2)))}%{' '}
              {moneyChange.change >= 0 ? '↑' : '↓'})
            </div>
          )}
          {hoursChange && (
            <div>
              <strong>Hours:</strong> {Math.abs(hoursChange.change).toFixed(2)} hrs (
              {Math.abs(Number(hoursChange.percentage.toFixed(2)))}%{' '}
              {hoursChange.change >= 0 ? '↑' : '↓'})
            </div>
          )}
        </>
      );
    } else if (countChange) {
      return (
        <div>
          <strong>Change:</strong> {Math.abs(countChange.change).toLocaleString()} (
          {Math.abs(Number(countChange.percentage.toFixed(2)))}%{' '}
          {countChange.change >= 0 ? '↑' : '↓'} )
        </div>
      );
    }
    return '';
  };

  return (
    <TooltipHost content={tooltipContent()} directionalHint={DirectionalHint.topCenter}>
      <div
        className={`metricCard ${mergeStyles(cardStyle(isDarkMode, isHovered ? overallChange : null))}`}
        style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={`${title} metric card`}
      >
        <Text className={metricTitleStyle}>{title}</Text>
        {isMoneyOnly ? (
          <Text className={mergeStyles({ fontSize: '24px', fontWeight: '700', color: colours.highlight })}>
            £
            <CountUp
              start={0}
              end={money ? parseFloat((money > 1000 ? money / 1000 : money / 1000).toFixed(money > 1000 ? 2 : 0)) : 0}
              duration={2.5}
              decimals={money && money > 1000 ? 2 : 0}
              separator=","
              suffix="k"
            />
          </Text>
        ) : isTimeMoney ? (
          <Text className={mergeStyles({ display: 'flex', alignItems: 'center' })}>
            <span className={moneyStyle}>
              £
              <CountUp
                start={0}
                end={Number(money) || 0}
                duration={2.5}
                separator=","
                decimals={2}
              />
            </span>
            <span className={pipeStyle}>|</span>
            <span className={hoursStyle}>
              <CountUp
                start={0}
                end={Number(hours) || 0}
                duration={2.5}
                separator=","
                decimals={2}
              />{' '}
              hrs
            </span>
          </Text>
        ) : (
          <Text className={mergeStyles({ fontSize: '24px', fontWeight: '700', color: colours.highlight })}>
            {count !== undefined ? <CountUp start={0} end={Number(count)} duration={2.5} separator="," /> : ''}
          </Text>
        )}

        {isHovered && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', justifyContent: 'space-between' }}>
            {isMoneyOnly ? (
              <div style={{ display: 'flex', flexDirection: 'row', gap: '5px', alignItems: 'center' }}>
                <Text className={changeStyle(moneyChange ? moneyChange.change >= 0 : true)}>
                  £{money !== undefined ? (money > 1000 ? (money / 1000).toFixed(2) : (money / 1000).toFixed(0)) : '0'}k
                </Text>
              </div>
            ) : isTimeMoney ? (
              <>
                {moneyChange && (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: '5px', alignItems: 'center' }}>
                    <Text className={changeStyle(moneyChange.change >= 0)}>
                      £{Math.abs(moneyChange.change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </Text>
                    <Text className={changeStyle(moneyChange.change >= 0)}>
                      ({Math.abs(Number(moneyChange.percentage.toFixed(2)))}%{' '}
                      {moneyChange.change >= 0 ? '↑' : '↓'} )
                    </Text>
                  </div>
                )}
                {hoursChange && (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: '5px', alignItems: 'center' }}>
                    <Text className={changeStyle(hoursChange.change >= 0)}>
                      {Math.abs(hoursChange.change).toFixed(2)} hrs
                    </Text>
                    <Text className={changeStyle(hoursChange.change >= 0)}>
                      ({Math.abs(Number(hoursChange.percentage.toFixed(2)))}%{' '}
                      {hoursChange.change >= 0 ? '↑' : '↓'} )
                    </Text>
                  </div>
                )}
              </>
            ) : (
              countChange && (
                <div style={{ display: 'flex', flexDirection: 'row', gap: '5px', alignItems: 'center' }}>
                  <Text className={changeStyle(countChange.change >= 0)}>
                    {Math.abs(countChange.change).toLocaleString()}
                  </Text>
                  <Text className={changeStyle(countChange.change >= 0)}>
                    ({Math.abs(Number(countChange.percentage.toFixed(2)))}%{' '}
                    {countChange.change >= 0 ? '↑' : '↓'} )
                  </Text>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </TooltipHost>
  );
};

export default React.memo(MetricCard);
