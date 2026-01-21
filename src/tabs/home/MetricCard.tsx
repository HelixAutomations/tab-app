import React from 'react';
// invisible change 2
import { Text, mergeStyles, TooltipHost, DirectionalHint, Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import '../../app/styles/MetricCard.css'; // Import the CSS file

// NEW: Import the circular progress bar
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

interface MetricCardProps {
  title: string;
  count?: number;
  prevCount?: number;
  hours?: number;
  prevHours?: number;
  money?: number | string;
  prevMoney?: number;
  isDarkMode: boolean;
  isTimeMoney?: boolean;
  isMoneyOnly?: boolean;
  animationDelay?: number;
  showDial?: boolean;
  dialTarget?: number;
  dialValue?: number;
  highlightDial?: boolean;
  dialSuffix?: string;
}

const formatNumber = (value: number, decimals: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  durationMs?: number;
  animate?: boolean;
  prefix?: string;
  suffix?: string;
  onDone?: () => void;
}

const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 0,
  durationMs = 2500,
  animate = true,
  prefix = '',
  suffix = '',
  onDone,
}) => {
  const [display, setDisplay] = React.useState(() => (animate ? 0 : value));
  const hasAnimatedRef = React.useRef(false);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!Number.isFinite(value)) {
      setDisplay(0);
      return;
    }
    if (!animate || hasAnimatedRef.current) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        hasAnimatedRef.current = true;
        setDisplay(value);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, durationMs, onDone, value]);

  return <>{`${prefix}${formatNumber(display, decimals)}${suffix}`}</>;
};

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '12px 16px 12px 20px',
    borderLeft: `4px solid ${colours.highlight}`,
    borderRadius: 0,
    boxShadow: isDarkMode ? '0 2px 6px rgba(0, 0, 0, 0.3)' : `0 2px 6px ${colours.light.border}`,
    transition: 'background-color 0.2s, box-shadow 0.2s, transform 0.2s, border 0.2s',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: 'auto',
    minHeight: '90px',
    width: '100%',
    flex: '1 1 auto',
    minWidth: 0,
    cursor: 'pointer',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: isDarkMode ? '0 4px 8px rgba(0, 0, 0, 0.4)' : `0 4px 8px ${colours.light.border}`,
    },
    position: 'relative',
  });

const metricTitleStyle = mergeStyles({
  fontSize: '14px',
  fontWeight: '600',
  marginBottom: '6px',
});

const moneyStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '16px',
    fontWeight: '700',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const pipeStyle = mergeStyles({
  fontSize: '16px',
  fontWeight: '500',
  color: colours.greyText,
  margin: '0 8px',
});

const hoursStyle = mergeStyles({
  fontSize: '16px',
  fontWeight: '500',
  color: colours.greyText,
});

const changeStyle = mergeStyles({
  fontSize: '12px',
  fontWeight: '600',
  color: colours.greyText,
  marginTop: '6px',
  whiteSpace: 'nowrap',
});

const changeTextStyle = (change: number) =>
  mergeStyles(changeStyle, {
    color:
      change > 0
        ? colours.green
        : change < 0
        ? colours.red
        : colours.greyText,
  });

const changeContainerStyle = mergeStyles({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
});

const percentageStyle = (percentage: number) =>
  mergeStyles({
    fontSize: '12px',
    fontWeight: '600',
    color:
      percentage > 0
        ? colours.green
        : percentage < 0
        ? colours.red
        : colours.greyText,
    marginLeft: '4px',
    textAlign: 'center',
  });
  
const renderDialLayout = (
  title: string,
  money: number | string | undefined,
  value: number | undefined,
  isDarkMode: boolean,
  dialTarget: number | undefined,
  dialSuffix?: string,
  animate?: boolean,
  onAnimateDone?: () => void
) => {
  const progress = dialTarget && value ? Math.min((value / dialTarget) * 100, 100) : 0;
  return (
    <div
      className={mergeStyles({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'center',
      })}
    >
      <div
        className={mergeStyles({
          width: 60,
          minWidth: 60,
          height: 60,
          marginRight: 12,
          flexShrink: 0, // prevent the dial from shrinking when the text grows
        })}
      >
        <CircularProgressbar
          value={progress}
          text={`${value !== undefined ? value.toFixed(2) : '0'}${dialSuffix ? dialSuffix : ''}`}
          styles={buildStyles({
            textSize: '16px',
            pathTransitionDuration: 0.5,
            pathColor: colours.highlight,
            textColor: isDarkMode ? colours.dark.text : colours.light.text,
            trailColor: colours.grey,
            backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
          })}
        />
      </div>
      <div>
        <Text className={metricTitleStyle}>{title}</Text>
        {dialSuffix === "%" ? (
          <Text
            className={mergeStyles({
              display: 'flex',
              alignItems: 'center',
              fontSize: '18px',
              fontWeight: '700',
              color: colours.highlight,
            })}
          >
            <AnimatedNumber
              value={value ? Number(value) : 0}
              decimals={2}
              animate={!!animate}
              onDone={onAnimateDone}
            />
            {dialSuffix}
          </Text>
        ) : (
          <Text className={mergeStyles({ display: 'flex', alignItems: 'center' })}>
              <span className={moneyStyle(isDarkMode)}>
              £
              <AnimatedNumber
                value={typeof money === 'number' ? Number(money) : 0}
                decimals={typeof money === 'number' && money > 1000 ? 2 : 0}
                animate={!!animate}
                onDone={onAnimateDone}
              />
            </span>
            <span className={pipeStyle}>|</span>
            <span className={hoursStyle}>
              <AnimatedNumber
                value={value ? Number(value) : 0}
                decimals={2}
                animate={!!animate}
                onDone={onAnimateDone}
              />{' '}
              hrs
            </span>
          </Text>
        )}
      </div>
    </div>
  );
};

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
  isMoneyOnly = false,
  animationDelay = 0,
  showDial = false,
  dialTarget,
  dialValue,
  highlightDial,
  dialSuffix,
}) => {

  const animationKey = `home_metric_animated_${title}`;
  const [animateOnMount, setAnimateOnMount] = React.useState<boolean>(() => {
    try { return sessionStorage.getItem(animationKey) !== 'true'; } catch { return true; }
  });
  const animationDoneRef = React.useRef(false);
  const handleAnimationDone = React.useCallback(() => {
    if (animationDoneRef.current) return;
    animationDoneRef.current = true;
    try { sessionStorage.setItem(animationKey, 'true'); } catch {}
    setAnimateOnMount(false);
  }, [animationKey]);

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
    money !== undefined && typeof money === 'number' && prevMoney !== undefined
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
  
  // Force red for Outstanding balances (client or office)
  if (title === 'Outstanding Client Balances' || title === 'Outstanding Office Balances') {
    overallChange = false;
  }
  
  // Force green for Fees Recovered This Month (since fees recovered is good)
  if (title === 'Fees Recovered This Month') {
    overallChange = true;
  }

  let percentageChange: number | null = null;
  if (isMoneyOnly && moneyChange) {
    percentageChange = moneyChange.percentage;
  } else if (isTimeMoney) {
    if (moneyChange) {
      percentageChange = moneyChange.percentage;
    } else if (hoursChange) {
      percentageChange = hoursChange.percentage;
    }
  } else if (countChange) {
    percentageChange = countChange.percentage;
  }

  const tooltipContent = () => {
    if (isMoneyOnly) {
      const labelText =
        title === 'Outstanding Client Balances'
          ? 'Outstanding Client Balances:'
          : 'Fees Recovered:';
      return (
        <div>
          <strong>{labelText}</strong> £
          {typeof money === 'number'
            ? money > 1000
              ? (money / 1000).toFixed(2) + 'k'
              : money.toFixed(2)
            : money}
        </div>
      );
    }
    if (isTimeMoney) {
      return (
        <>
          {moneyChange && (
            <div>
              <strong>Money:</strong>{' '}
              <span style={{ color: moneyChange.change > 0 ? 'green' : moneyChange.change < 0 ? 'red' : colours.greyText }}>
                {moneyChange.change > 0 ? '+' : moneyChange.change < 0 ? '-' : ''}
                £{Math.abs(moneyChange.change).toLocaleString(undefined, {
                  minimumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0,
                  maximumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0,
                })}
              </span>{' '}
              <span style={{ color: moneyChange.change > 0 ? 'green' : moneyChange.change < 0 ? 'red' : colours.greyText }}>
                {moneyChange.change > 0 ? '+' : moneyChange.change < 0 ? '-' : ''}
                {Math.abs(Number(moneyChange.percentage.toFixed(2)))}%
              </span>
            </div>
          )}
          {hoursChange && (
            <div>
              <strong>Hours:</strong>{' '}
              <span style={{ color: hoursChange.change > 0 ? 'green' : hoursChange.change < 0 ? 'red' : colours.greyText }}>
                {hoursChange.change > 0 ? '+' : hoursChange.change < 0 ? '-' : ''}
                {Math.abs(hoursChange.change).toFixed(2)} hrs
              </span>{' '}
              <span style={{ color: hoursChange.change > 0 ? 'green' : hoursChange.change < 0 ? 'red' : colours.greyText }}>
                {hoursChange.change > 0 ? '+' : hoursChange.change < 0 ? '-' : ''}
                {Math.abs(Number(hoursChange.percentage.toFixed(2)))}%
              </span>
            </div>
          )}
        </>
      );
    } else if (countChange) {
      return (
        <div>
          <strong>Change:</strong>{' '}
          <span style={{ color: countChange.change > 0 ? 'green' : countChange.change < 0 ? 'red' : colours.greyText }}>
            {countChange.change > 0 ? '+' : countChange.change < 0 ? '-' : ''}
            {Math.abs(countChange.change).toLocaleString()}
          </span>{' '}
          <span style={{ color: countChange.change > 0 ? 'green' : countChange.change < 0 ? 'red' : colours.greyText }}>
            {countChange.change > 0 ? '+' : countChange.change < 0 ? '-' : ''}
            {Math.abs(Number(countChange.percentage.toFixed(2)))}%
          </span>
        </div>
      );
    }
    return '';
  };

  return (
    <TooltipHost content={tooltipContent()} directionalHint={DirectionalHint.topCenter}>
      <div
        className={`metricCard ${mergeStyles(cardStyle(isDarkMode))}`}
        style={{
          '--animation-delay': `${animationDelay}s`,
          '--outline-color': overallChange !== null ? (overallChange ? 'green' : 'red') : 'transparent',
        } as React.CSSProperties}
        aria-label={`${title} metric card`}
      >
        {showDial ? (
          renderDialLayout(
            title,
            money,
            dialValue !== undefined ? dialValue : hours,
            isDarkMode,
            dialTarget,
            dialSuffix,
            animateOnMount,
            handleAnimationDone
          )
        ) : (
          <>
            <Text className={metricTitleStyle}>{title}</Text>
              {(() => {
                if (isMoneyOnly) {
                  const valueEl = typeof money === 'string' ? (
                    <Text className={mergeStyles({ fontSize: '18px', fontWeight: '700', color: isDarkMode ? colours.dark.text : colours.light.text })}>£{money}</Text>
                  ) : (
                    <Text className={mergeStyles({ fontSize: '18px', fontWeight: '700', color: isDarkMode ? colours.dark.text : colours.light.text })}>
                      £
                      <AnimatedNumber
                        value={typeof money === 'number' ? Number(money) : 0}
                        decimals={typeof money === 'number' && money > 1000 ? 2 : 0}
                        animate={animateOnMount}
                        suffix={typeof money === 'number' && money > 1000 ? 'k' : ''}
                        onDone={handleAnimationDone}
                      />
                    </Text>
                  );
                  const showPrevMonth = prevMoney !== undefined && prevMoney > 0;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      {valueEl}
                      {showPrevMonth && (
                        <Text className={mergeStyles({ 
                          fontSize: '11px', 
                          fontWeight: '500', 
                          color: colours.greyText,
                          marginTop: '4px',
                        })}>
                          Last month: £{prevMoney > 1000 ? (prevMoney / 1000).toFixed(1) + 'k' : prevMoney.toLocaleString()}
                        </Text>
                      )}
                    </div>
                  );
                }
                if (isTimeMoney) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className={moneyStyle(isDarkMode)}>
                        £
                        <AnimatedNumber
                          value={typeof money === 'number' ? Number(money) : 0}
                          decimals={typeof money === 'number' && money > 1000 ? 2 : 0}
                          animate={animateOnMount}
                          onDone={handleAnimationDone}
                        />
                      </span>
                      <span className={pipeStyle}>|</span>
                      <span className={hoursStyle}>
                        <AnimatedNumber
                          value={hours ? Number(hours) : 0}
                          decimals={2}
                          animate={animateOnMount}
                          onDone={handleAnimationDone}
                        />{' '}
                        hrs
                      </span>
                      {percentageChange !== null && (
                        <Text className={percentageStyle(percentageChange)}>
                          {percentageChange > 0 ? '+' : percentageChange < 0 ? '-' : ''}{Math.abs(Number(percentageChange.toFixed(2)))}%
                        </Text>
                      )}
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text className={mergeStyles({ fontSize: '18px', fontWeight: '700', color: isDarkMode ? colours.dark.text : colours.light.text })}>
                      {count !== undefined ? (
                        <AnimatedNumber
                          value={Number(count)}
                          decimals={0}
                          animate={animateOnMount}
                          onDone={handleAnimationDone}
                        />
                      ) : ''}
                    </Text>
                  </div>
                );
              })()}
          </>
        )}


        <div
          className="hoverBar"
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '12px', // 12px wide bar
            backgroundColor: colours.grey, // grey bar
            borderTopRightRadius: '10px', // slightly less than the card's 12px to avoid excessive rounding
            borderBottomRightRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: (title === 'Outstanding Client Balances' || title === 'Outstanding Office Balances') ? 1 : 0,
            transition: 'opacity 0.3s'
          }}
        >
          <Icon iconName="ChevronRight" style={{ color: colours.light.text, fontSize: '12px' }} />
        </div>


        <div
          className="hoverDetails"
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '10px',
            justifyContent: 'space-between'
          }}
        >
            {isMoneyOnly ? (
            moneyChange && (
              <div className={changeContainerStyle}>
                <Text className={changeTextStyle(moneyChange.change)}>
                  {moneyChange.change > 0 ? '+' : moneyChange.change < 0 ? '-' : ''}
                  £{Math.abs(moneyChange.change).toLocaleString(undefined, {
                    minimumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0,
                    maximumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0
                  })}
                </Text>
                <Text className={changeTextStyle(moneyChange.change)}>
                  {moneyChange.change > 0 ? '+' : moneyChange.change < 0 ? '-' : ''}
                  {Math.abs(Number(moneyChange.percentage.toFixed(2)))}%
                </Text>
              </div>
            )
            ) : isTimeMoney ? (
              <>
                {moneyChange && (
                  <div className={changeContainerStyle}>
                    <Text className={changeTextStyle(moneyChange.change)}>
                      {moneyChange.change > 0 ? '+' : moneyChange.change < 0 ? '-' : ''}
                      £{Math.abs(moneyChange.change).toLocaleString(undefined, {
                        minimumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0,
                        maximumFractionDigits: typeof money === 'number' && money > 1000 ? 2 : 0
                      })}
                    </Text>
                  </div>
                )}
                {hoursChange && (
                  <div className={changeContainerStyle}>
                    <Text className={changeTextStyle(hoursChange.change)}>
                      {hoursChange.change > 0 ? '+' : hoursChange.change < 0 ? '-' : ''}
                      {Math.abs(hoursChange.change).toFixed(2)} hrs
                    </Text>
                  </div>
                )}
              </>
            ) : (
              countChange && (
                  <div className={changeContainerStyle}>
                    <Text className={changeTextStyle(countChange.change)}>
                      {countChange.change > 0 ? '+' : countChange.change < 0 ? '-' : ''}
                      {Math.abs(countChange.change).toLocaleString()}
                    </Text>
                    <Text className={changeTextStyle(countChange.change)}>
                      {countChange.change > 0 ? '+' : countChange.change < 0 ? '-' : ''}
                      {Math.abs(Number(countChange.percentage.toFixed(2)))}%
                    </Text>
                </div>
              )
            )}
          </div>
      </div>
    </TooltipHost>
  );
};

export default React.memo(MetricCard);
