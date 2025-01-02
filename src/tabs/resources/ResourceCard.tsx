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
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/ResourceCard.css';

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
  onToggleFavorite: (resource: Resource) => void;
  onGoTo: (url: string) => void;
  onSelect: () => void;
  animationDelay?: number;
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
    alignItems: 'center',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
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
    zIndex: 2,
  });

const resourceTitleStyle = mergeStyles({
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
    zIndex: 2,
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

const ResourceCard: React.FC<ResourceCardProps> = React.memo(
  ({ resource, isFavorite, onCopy, onToggleFavorite, onGoTo, onSelect, animationDelay = 0 }) => {
    const { isDarkMode } = useTheme();

    const isCustomIcon = resource.icon.endsWith('.svg');

    // Determine the grey color based on the theme
    const backdropGreyColor = isDarkMode ? colours.dark.grey : colours.grey;

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
          {resource.icon && (
            isCustomIcon ? (
              <img
                src={resource.icon}
                alt={`${resource.title} icon backdrop`}
                className="backdropIcon"
              />
            ) : (
              <Icon
                iconName={resource.icon}
                className="backdropIcon"
                styles={{
                  root: {
                    fontSize: '80px', // Matches the height of custom SVG icons
                    color: '#ccc', // Maintain consistent colour for backdrop
                    opacity: 0.2,
                    position: 'absolute',
                    top: '50%',
                    right: '140px',
                    transform: 'translateY(-50%)',
                    zIndex: 1,
                    filter: 'grayscale(100%) brightness(0.6)',
                    pointerEvents: 'none',
                  },
                }}
              />
            )
          )}

          <div className={mainContentStyle(isDarkMode)}>
            {resource.icon && (
              isCustomIcon ? (
                <img
                  src={resource.icon}
                  alt={`${resource.title} icon`}
                  style={{
                    width: '32px',
                    height: '32px',
                    filter: isDarkMode
                      ? 'invert(1) brightness(0.8)'
                      : 'brightness(0) saturate(100%) invert(26%) sepia(92%) saturate(6218%) hue-rotate(182deg) brightness(96%) contrast(93%)',
                  }}
                />
              ) : (
                <Icon
                  iconName={resource.icon}
                  styles={{ root: { fontSize: 32, color: colours.highlight } }}
                />
              )
            )}
            <Text className={resourceTitleStyle}>{resource.title}</Text>
          </div>

          <div className={separatorStyle(isDarkMode)} />

          <div className={actionsContainerStyle(isDarkMode)}>
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
                  onToggleFavorite(resource);
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>

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
