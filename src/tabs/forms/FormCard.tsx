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
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme
import '../../app/styles/FormCard.css'; // Import the CSS file

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
  animationDelay?: number; // Add this prop
}

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
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
    ':hover': {
      boxShadow: isDarkMode
        ? '0 4px 16px rgba(255, 255, 255, 0.2)'
        : '0 4px 16px rgba(0, 0, 0, 0.2)',
      transform: 'translateY(-5px)',
    },
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
  });

const linkTitleStyle = mergeStyles({
  fontSize: '18px',
  fontWeight: '600',
  color: 'inherit',
  cursor: 'pointer',
  marginTop: '0px',
});

const actionsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  });

const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    height: '60%',
    margin: '0 15px',
    alignSelf: 'center',
  });

const FormCard: React.FC<FormCardProps> = React.memo(
  ({ link, isFavorite, onCopy, onToggleFavorite, onGoTo, onSelect, animationDelay = 0 }) => {
    const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

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
          {/* Left Side: Icon and Label */}
          <div className={mainContentStyle(isDarkMode)}>
            {link.icon && (
              <Icon
                iconName={link.icon}
                styles={{ root: { fontSize: 32, color: colours.highlight } }}
              />
            )}
            <Text className={linkTitleStyle}>{link.title}</Text>
          </div>

          {/* Separator */}
          <div className={separatorStyle(isDarkMode)} />

          {/* Right Side: Action Buttons */}
          <div className={actionsContainerStyle(isDarkMode)}>
            {/* Copy Button */}
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

            {/* Favorite Button */}
            <TooltipHost
              content={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              id={`tooltip-fav-${link.title}`}
            >
              <IconButton
                iconProps={{
                  iconName: isFavorite ? 'FavoriteStarFill' : 'FavoriteStar',
                }}
                title="Toggle Favorite"
                ariaLabel="Toggle Favorite"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

            {/* Go To Button */}
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
