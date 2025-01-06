import React from 'react';
import {
  Text,
  Icon,
  IconButton,
  TooltipHost,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { FormItem } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/FormCard.css'; // Ensure this has your .backdropIcon CSS

const iconButtonStyles = (iconColor: string) => ({
  root: {
    marginBottom: '8px',
    color: iconColor,
    backgroundColor: 'transparent',
    border: 'none',
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
      ':focus': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
    },
    height: '24px',
    width: '24px',
    padding: '0px',
    boxShadow: 'none',
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
  onCopy: (url: string, title: string) => void;
  onToggleFavorite: () => void;
  onGoTo: () => void;
  onSelect: () => void;
  animationDelay?: number;
  description?: string;
}

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode
      ? colours.dark.sectionBackground
      : colours.light.sectionBackground,
    border: `1px solid ${
      isDarkMode ? colours.dark.border : colours.light.border
    }`,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255, 255, 255, 0.1)'
      : '0 2px 8px rgba(0, 0, 0, 0.1)',
    transition: 'box-shadow 0.3s, transform 0.3s, background-color 0.3s',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative', // Important for backdropIcon positioning
    ':hover': {
      boxShadow: isDarkMode
        ? '0 4px 16px rgba(255, 255, 255, 0.2)'
        : '0 4px 16px rgba(0, 0, 0, 0.2)',
      transform: 'translateY(-5px)',
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

const linkTitleStyle = mergeStyles({
  fontSize: '18px',
  fontWeight: '600',
  color: 'inherit',
  cursor: 'pointer',
  marginTop: '0px',
});

const descriptionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '14px',
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    marginTop: '8px',
  });

const actionsContainerStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  zIndex: 2, // Ensure buttons are above the backdrop icon
});

const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    height: '60%',
    margin: '0 15px',
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
              <Text className={linkTitleStyle}>{link.title}</Text>
              {link.description && (
                <Text className={descriptionStyle(isDarkMode)}>
                  {link.description}
                </Text>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className={separatorStyle(isDarkMode)} />

          {/* Right: Action Buttons */}
          <div className={actionsContainerStyle}>
            <TooltipHost
              content={`Copy link for ${link.title}`}
              id={`tooltip-copy-${link.title}`}
            >
              <IconButton
                iconProps={{ iconName: 'Copy' }}
                title="Copy Link"
                ariaLabel="Copy Link"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onCopy(link.url, link.title);
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

            <TooltipHost
              content={
                isFavorite ? 'Remove from Favourites' : 'Add to Favourites'
              }
              id={`tooltip-fav-${link.title}`}
            >
              <IconButton
                iconProps={{
                  iconName: isFavorite ? 'FavoriteStarFill' : 'FavoriteStar',
                }}
                title="Toggle Favourite"
                ariaLabel="Toggle Favourite"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

            <TooltipHost
              content={`Go to ${link.title}`}
              id={`tooltip-go-${link.title}`}
            >
              <IconButton
                iconProps={{ iconName: 'ChevronRight' }}
                title="Go To"
                ariaLabel="Go To"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onGoTo();
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>
          </div>
        </div>
      </TooltipHost>
    );
  }
);

export default FormCard;
