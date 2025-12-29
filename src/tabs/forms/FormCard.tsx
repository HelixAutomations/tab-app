import React from 'react';
import {
  Text,
  Icon,
  TooltipHost,
  Stack,
} from '@fluentui/react';
import ActionIconButton from '../../components/ActionIconButton';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { componentTokens } from '../../app/styles/componentTokens';
import { FormItem } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/FormCard.css'; // Ensure this has your .backdropIcon CSS
import { cardTokens, cardStyles as instructionsCardStyles } from '../instructions/componentTokens';

// invisible change
const iconButtonStyles = (iconColor: string, isDarkMode: boolean) => ({
  root: {
    marginBottom: '8px',
    color: iconColor,
    background: 'transparent',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        borderColor: colours.cta,
        color: '#ffffff',
        transform: 'scale(1.05)',
      },
      ':focus': {
        backgroundColor: colours.cta,
        borderColor: colours.cta,
        color: '#ffffff',
        outline: `2px solid ${colours.cta}40`,
        outlineOffset: '2px',
      },
    },
    height: '32px',
    width: '32px',
    padding: '4px',
    boxShadow: isDarkMode
      ? '0 2px 4px rgba(0, 0, 0, 0.2)'
      : '0 2px 4px rgba(15, 23, 42, 0.04)',
  },
  icon: {
    fontSize: '16px',
    lineHeight: '20px',
    color: iconColor,
  },
});

interface FormCardProps {
  link: FormItem;
  isFavorite: boolean;
  onCopy?: (url: string, title: string) => void;
  onToggleFavorite: () => void;
  onGoTo?: () => void;
  onSelect: () => void;
  animationDelay?: number;
  description?: string;
}

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '16px 20px',
    background: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : 'rgba(255, 255, 255, 0.95)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
    borderRadius: 12,
    boxShadow: 'none',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
    marginBottom: '8px',
    selectors: {
      ':hover': {
        borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(15, 23, 42, 0.12)',
        boxShadow: isDarkMode ? '0 4px 12px rgba(0, 0, 0, 0.2)' : '0 4px 12px rgba(15, 23, 42, 0.08)',
        transform: 'translateY(-1px)',
      },
    },
  });

const mainContentStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  flex: 1,
});

const textContentStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  marginLeft: '10px',
});

const linkTitleStyle = (isDarkMode: boolean) => mergeStyles({
  fontSize: '16px',
  fontWeight: '600',
  color: isDarkMode ? '#ffffff' : '#334155',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  letterSpacing: '-0.025em',
  lineHeight: 1.4,
  marginBottom: '4px',
  display: 'block',
});

const descriptionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '13px',
    color: isDarkMode ? 'rgba(204, 204, 204, 0.9)' : 'rgba(100, 116, 139, 0.9)',
    lineHeight: 1.4,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });

const actionsContainerStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  zIndex: 2, // Ensure buttons are above the backdrop icon
});

const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    height: '60%',
    margin: '0 12px',
    alignSelf: 'center',
    zIndex: 2,
  });

const FormCard: React.FC<FormCardProps> = React.memo(
  ({
    link,
    isFavorite,
    onCopy,
    onToggleFavorite,
    onGoTo,
    onSelect,
    animationDelay = 0,
  }) => {
    const { isDarkMode } = useTheme();

    return (
      <TooltipHost content={`View details for ${link.title}`}>
        <div
          className={`formCard ${cardStyle(isDarkMode)}`}
          style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              onSelect();
            }
          }}
          aria-label={`View details for ${link.title}`}
        >
          {/* Backdrop Icon (subtle) */}
          {link.icon && (
            <Icon
              iconName={link.icon}
              className="backdropIcon" // Make sure .backdropIcon positions/filters it in FormCard.css
            />
          )}

          {/* Left: Main Icon + Text */}
          <div className={mainContentStyle}>
            {link.icon && link.icon.endsWith('.svg') ? (
              // If it's an SVG, render <img> with a filter to approximate #0C6D8F
              <img
                src={link.icon}
                alt={link.title}
                style={{
                  width: '32px',
                  height: '32px',
                  // Filter approximating a darker teal (#0C6D8F).
                  filter:
                    'invert(16%) sepia(47%) saturate(1652%) hue-rotate(166deg) brightness(93%) contrast(90%)',
                }}
              />
            ) : (
              // Otherwise, render Fluent UI icon in #0C6D8F
              <Icon
                iconName={link.icon}
                styles={{
                  root: {
                    fontSize: 32,
                    color: '#0C6D8F',
                  },
                }}
              />
            )}
            <div className={textContentStyle}>
              <Text className={linkTitleStyle(isDarkMode)}>{link.title}</Text>
              {link.description && (
                <Text className={descriptionStyle(isDarkMode)}>
                  {link.description}
                </Text>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className={`separator ${separatorStyle(isDarkMode)}`} />

          {/* Right: Action Buttons */}
          <div className={`actionsContainer ${actionsContainerStyle}`}>
            {/* Only show Copy button if there's a URL to copy */}
            {link.url && onCopy && (
              <TooltipHost
                content={`Copy link for ${link.title}`}
                id={`tooltip-copy-${link.title}`}
              >
                <ActionIconButton
                  outlineIcon="Copy"
                  filledIcon="Copy"
                  title="Copy Link"
                  ariaLabel="Copy Link"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onCopy(link.url!, link.title);
                  }}
                  styles={iconButtonStyles(colours.cta, isDarkMode)}
                />
              </TooltipHost>
            )}

            <TooltipHost
              content={
                isFavorite ? 'Remove from Favourites' : 'Add to Favourites'
              }
              id={`tooltip-fav-${link.title}`}
            >
              <ActionIconButton
                outlineIcon={isFavorite ? 'FavoriteStarFill' : 'FavoriteStar'}
                filledIcon="FavoriteStarFill"
                title="Toggle Favourite"
                ariaLabel="Toggle Favourite"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                styles={iconButtonStyles(colours.cta, isDarkMode)}
              />
            </TooltipHost>

            {/* Only show Go To button if there's a URL or external action */}
            {(link.url || link.component) && (
              <TooltipHost
                content={link.component ? `Open ${link.title}` : `Go to ${link.title}`}
                id={`tooltip-go-${link.title}`}
              >
                <ActionIconButton
                  outlineIcon="ChevronRight"
                  filledIcon="ChevronRight"
                  title={link.component ? "Open" : "Go To"}
                  ariaLabel={link.component ? "Open" : "Go To"}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    if (onGoTo) {
                      onGoTo();
                    } else {
                      onSelect();
                    }
                  }}
                  styles={iconButtonStyles(colours.cta, isDarkMode)}
                />
              </TooltipHost>
            )}
          </div>
        </div>
      </TooltipHost>
    );
  }
);

export default FormCard;
