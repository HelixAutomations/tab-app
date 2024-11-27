// src/tabs/resources/ResourceCard.tsx

import React from 'react';
import {
  Text,
  Icon,
  IconButton,
  TooltipHost,
  IButtonStyles,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { Resource } from './Resources';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme
import '../../app/styles/ResourceCard.css'; // Import the CSS file

// Define button styles similar to LinkCard
const iconButtonStyles = (iconColor: string): IButtonStyles => ({
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

interface ResourceCardProps {
  resource: Resource;
  isFavorite: boolean;
  onCopy: (url: string, title: string) => void;
  onToggleFavorite: (title: string) => void;
  onGoTo: (url: string) => void;
  onSelect: () => void;
  animationDelay?: number; // Add this prop
}

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255, 255, 255, 0.1)'
      : '0 2px 8px rgba(0, 0, 0, 0.1)',
    transition: 'box-shadow 0.3s, transform 0.3s, background-color 0.3s',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center', // Center vertically
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
    gap: '10px', // Space between icon and title
    flex: 1, // Take up remaining space
  });

const resourceTitleStyle = mergeStyles({
  fontSize: '18px',
  fontWeight: '600',
  color: 'inherit',
  cursor: 'pointer',
  marginTop: '0px', // Remove top margin
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
    height: '60%', // Adjust height as needed
    margin: '0 15px', // Equal spacing on both sides
    alignSelf: 'center',
  });

const ResourceCard: React.FC<ResourceCardProps> = React.memo(
  ({ resource, isFavorite, onCopy, onToggleFavorite, onGoTo, onSelect, animationDelay = 0 }) => {
    const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

    return (
      <TooltipHost content={`View details for ${resource.title}`}>
        <div
          className={`resourceCard ${cardStyle(isDarkMode)}`}
          style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              onSelect();
            }
          }}
          aria-label={`View details for ${resource.title}`}
        >
          {/* Left Side: Icon and Label */}
          <div className={mainContentStyle(isDarkMode)}>
            {resource.icon && (
              <Icon
                iconName={resource.icon}
                styles={{ root: { fontSize: 32, color: colours.highlight } }}
              />
            )}
            <Text className={resourceTitleStyle}>{resource.title}</Text>
          </div>

          {/* Separator */}
          <div className={separatorStyle(isDarkMode)} />

          {/* Right Side: Action Buttons */}
          <div className={actionsContainerStyle(isDarkMode)}>
            {/* Copy Button */}
            <TooltipHost
              content={`Copy link for ${resource.title}`}
              id={`tooltip-copy-${resource.title}`}
            >
              <IconButton
                iconProps={{ iconName: 'Copy' }}
                title="Copy Link"
                ariaLabel="Copy Link"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onCopy(resource.url, resource.title);
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

            {/* Favorite Button */}
            <TooltipHost
              content={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              id={`tooltip-fav-${resource.title}`}
            >
              <IconButton
                iconProps={{
                  iconName: isFavorite ? 'FavoriteStarFill' : 'FavoriteStar',
                }}
                title="Toggle Favorite"
                ariaLabel="Toggle Favorite"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onToggleFavorite(resource.title);
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

            {/* Go To Button */}
            <TooltipHost
              content={`Go to ${resource.title}`}
              id={`tooltip-go-${resource.title}`}
            >
              <IconButton
                iconProps={{ iconName: 'ChevronRight' }}
                title="Go To"
                ariaLabel="Go To"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onGoTo(resource.url);
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

export default ResourceCard;
