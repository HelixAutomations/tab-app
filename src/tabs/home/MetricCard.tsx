// src/tabs/home/MetricCard.tsx

import React, { useState } from 'react';
import {
  Text,
  mergeStyles,
  TooltipHost,
  DirectionalHint,
  ITooltipHostProps,
} from '@fluentui/react';
import CountUp from 'react-countup';
import { colours } from '../../app/styles/colours';
import '../../app/styles/MetricCard.css';

interface MetricCardProps {
  title: string;
  count?: number;
  prevCount?: number;
  hours?: number;
  prevHours?: number;
  money?: number;
  prevMoney?: number;
  value?: number;                // Allow passing a raw numeric value
  change?: number;               // Explicitly add 'change' prop
  icon?: string;                 // Icon name
  isMoney?: boolean;            // Used in some calls from Reporting
  currencySymbol?: string;       // e.g. '£'
  isDarkMode: boolean;
  isTimeMoney?: boolean;         // Existing logic for money+hours
  isMoneyOnly?: boolean;         // Only money to display
  animationDelay?: number;
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
  value,
  change,
  icon,
  isMoney,
  currencySymbol,
  isDarkMode,
  isTimeMoney = false,
  isMoneyOnly = false,
  animationDelay = 0,
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const calculateChange = (current: number, previous: number) => {
    const diff = current - previous;
    const percentage = previous !== 0 ? (diff / previous) * 100 : 0;
    return { change: diff, percentage };
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

  /**
   * overallChange determines the border color logic: 
   * true => green, false => red, null => no border
   */
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
  } else if (change !== undefined) {
    overallChange = change >= 0; // If directly passing 'change'
  }

  /**
   * Build tooltip content as a string 
   * to satisfy ITooltipHostProps.content = string.
   * If we need advanced rendering, use onRenderContent instead.
   */
  const buildTooltipString = (): string => {
    // 1) isMoneyOnly
    if (isMoneyOnly && money !== undefined) {
      return `Fees Recovered: £${money.toLocaleString()}`;
    }
    // 2) isTimeMoney
    if (isTimeMoney) {
      const moneyPart = moneyChange
        ? `Money: £${Math.abs(moneyChange.change).toLocaleString()} (${moneyChange.change >= 0 ? '↑' : '↓'} ${Math.abs(Number(moneyChange.percentage.toFixed(2)))}%)`
        : '';
      const hoursPart = hoursChange
        ? `Hours: ${Math.abs(hoursChange.change).toFixed(2)} (${hoursChange.change >= 0 ? '↑' : '↓'} ${Math.abs(Number(hoursChange.percentage.toFixed(2)))}%)`
        : '';
      return [moneyPart, hoursPart].filter(Boolean).join(' | ');
    }
    // 3) if 'value' + 'change'
    if (value !== undefined && change !== undefined) {
      const sign = change >= 0 ? '↑' : '↓';
      return `Value: ${value.toLocaleString()} ( ${sign} ${Math.abs(change)} )`;
    }
    // 4) else use 'count' if we have countChange
    if (countChange) {
      const sign = countChange.change >= 0 ? '↑' : '↓';
      const perc = Math.abs(Number(countChange.percentage.toFixed(2)));
      return `Change: ${sign} ${Math.abs(countChange.change)} (${perc}%)`;
    }
    // Fallback: empty
    return '';
  };

  const tooltipContent: string = buildTooltipString();

  return (
    <TooltipHost
      content={tooltipContent}
      directionalHint={DirectionalHint.topCenter}
    >
      <div
        className={mergeStyles(cardStyle(isDarkMode, isHovered ? overallChange : null))}
        style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={`${title} metric card`}
      >
        {icon && (
          <Text styles={{ root: { fontSize: '24px', marginBottom: '5px' } }}>
            {icon}
          </Text>
        )}
        <Text className={metricTitleStyle}>{title}</Text>

        {/* 
          Decide what to display as the main figure:
          1) isMoneyOnly
          2) isTimeMoney
          3) else if 'value' is provided 
          4) else fallback to 'count'
        */}
        {isMoneyOnly ? (
          <Text className={moneyStyle}>
            {currencySymbol || '£'}
            <CountUp start={0} end={money || 0} duration={2.5} separator="," />
          </Text>
        ) : isTimeMoney ? (
          <Text className={mergeStyles({ display: 'flex', alignItems: 'center' })}>
            <span className={moneyStyle}>
              {currencySymbol || '£'}
              <CountUp
                start={0}
                end={money || 0}
                duration={2.5}
                separator=","
              />
            </span>
            <span className={pipeStyle}>|</span>
            <span className={hoursStyle}>
              <CountUp
                start={0}
                end={hours || 0}
                duration={2.5}
                separator=","
                decimals={2}
              />{' '}
              hrs
            </span>
          </Text>
        ) : value !== undefined ? (
          <Text className={moneyStyle}>
            <CountUp start={0} end={value} duration={2.5} separator="," />
          </Text>
        ) : (
          <Text className={moneyStyle}>
            <CountUp start={0} end={count || 0} duration={2.5} separator="," />
          </Text>
        )}

        {/* Hover overlay with additional detail, if needed */}
        {isHovered && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: '8px',
              alignItems: 'center',
            }}
          >
            {/* 
              Example: we can show 'change' if provided
              In this snippet, we rely on tooltip primarily,
              but you can place more info here if you want.
            */}
            {change !== undefined && (
              <Text className={changeStyle(change >= 0)}>
                {change >= 0 ? '↑' : '↓'} {Math.abs(change).toLocaleString()}
              </Text>
            )}
          </div>
        )}
      </div>
    </TooltipHost>
  );
};

export default React.memo(MetricCard);
