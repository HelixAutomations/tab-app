import React from 'react';
// invisible change
import { Text, TooltipHost, Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { reportCardClass } from './componentTokens';

interface Report {
  title: string;
  description: string;
  path: string;
  icon: string;
  isReady: boolean;
}

interface ReportCardProps {
  report: Report;
  onGoTo: (title: string) => void;
  animationDelay?: number;
}

const cardStyle = (isDarkMode: boolean, isReady: boolean) =>
  mergeStyles(
    reportCardClass,
    {
      background: isDarkMode
        ? `linear-gradient(90deg, ${colours.dark.sectionBackground} 0%, ${colours.dark.cardBackground} 100%)`
        : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
      border: `1px solid ${isDarkMode ? `${colours.highlight}2B` : `${colours.highlight}1A`}`,
      transition: 'box-shadow 0.3s ease, transform 0.3s ease, filter 0.3s ease, opacity 0.3s ease',
      cursor: isReady ? 'pointer' : 'not-allowed',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '180px',
      width: '100%',
      filter: isReady ? 'none' : 'grayscale(100%)',
      opacity: isReady ? 1 : 0.6,
      position: 'relative',
      overflow: 'hidden',
      ':hover': isReady
        ? {
            boxShadow: isDarkMode
              ? `0 10px 28px ${colours.dark.background}CC`
              : '0 10px 28px rgba(15, 23, 42, 0.10)',
            transform: 'translateY(-3px)',
          }
        : {},
    }
  );

const contentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    position: 'relative', // Ensure content stays above backdrop
    zIndex: 1, // Layer content above backdrop icon
  });

const titleRowStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '12px',
  });

const titleStyle = (isDarkMode: boolean, isReady: boolean) =>
  mergeStyles({
    fontSize: '20px',
    fontWeight: '600',
    color: isReady ? (isDarkMode ? colours.dark.text : colours.light.text) : (isDarkMode ? `${colours.dark.text}80` : '#999'),
    margin: '0',
  });

const descriptionStyle = (isDarkMode: boolean, isReady: boolean) =>
  mergeStyles({
    fontSize: '14px',
    color: isReady ? (isDarkMode ? `${colours.dark.text}B3` : '#4b5354') : (isDarkMode ? `${colours.dark.text}80` : '#999'),
    margin: '0',
    lineHeight: '1.4',
  });

const launchLinkStyle = (isReady: boolean) =>
  mergeStyles({
    fontSize: '14px',
    color: isReady ? colours.highlight : '#999',
    textDecoration: 'none',
    fontWeight: '500',
    cursor: isReady ? 'pointer' : 'not-allowed',
    ':hover': isReady ? {
      textDecoration: 'underline',
    } : {},
  });

const backdropIconStyle = (isDarkMode: boolean) => mergeStyles({
  position: 'absolute',
  bottom: '10px',
  right: '10px',
  fontSize: '80px',
  color: isDarkMode ? colours.dark.borderColor : colours.grey,
  opacity: 0.3,
  transition: 'opacity 0.3s ease',
  zIndex: 0,
});

const ReportCard: React.FC<ReportCardProps> = React.memo(({ report, onGoTo, animationDelay = 0 }) => {
  const { isDarkMode } = useTheme();

  return (
    <TooltipHost content={report.isReady ? `Launch ${report.title}` : `${report.title} is not ready yet`}>
      <div
        className={`reportCard ${cardStyle(isDarkMode, report.isReady)}`}
        style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
        onClick={report.isReady ? () => onGoTo(report.title) : undefined}
        role="button"
        tabIndex={0}
        onKeyPress={(e) => {
          if (e.key === 'Enter' && report.isReady) {
            onGoTo(report.title);
          }
        }}
        aria-label={report.isReady ? `Launch ${report.title}` : `${report.title} is not ready yet`}
      >
        {/* Backdrop Icon */}
        <Icon
          iconName={report.icon}
          className={backdropIconStyle(isDarkMode)}
        />

        {/* Foreground Content */}
        <div className={contentStyle(isDarkMode)}>
          <div className={titleRowStyle(isDarkMode)}>
            <Icon
              iconName={report.icon}
              style={{
                fontSize: '24px',
                color: report.isReady ? colours.highlight : '#999',
              }}
            />
            <Text className={titleStyle(isDarkMode, report.isReady)}>{report.title}</Text>
          </div>
          <Text className={descriptionStyle(isDarkMode, report.isReady)}>{report.description}</Text>
        </div>

        <div>
          <span
            className={launchLinkStyle(report.isReady)}
            onClick={(e) => {
              if (report.isReady) {
                e.stopPropagation();
                onGoTo(report.title);
              }
            }}
            style={{ pointerEvents: report.isReady ? 'auto' : 'none' }}
          >
            Launch report
          </span>
        </div>

        <style>{`
          .reportCard {
            animation: fadeIn 0.5s ease-in-out;
            animation-delay: var(--animation-delay, 0s);
            animation-fill-mode: both;
          }
          .reportCard:hover .${backdropIconStyle} {
            opacity: ${report.isReady ? 1 : 0.5}; // 100% opacity on hover if ready
          }
        `}</style>
      </div>
    </TooltipHost>
  );
});

export default ReportCard;