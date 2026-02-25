// src/tabs/resources/ResourceCard.tsx
// invisible change

import React from 'react';
import {
  Text,
  Icon,
  TooltipHost,
  IButtonStyles,
  DefaultButton,
} from '@fluentui/react';
import ActionIconButton from '../../components/ActionIconButton';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { Resource } from './Resources';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/ResourceCard.css';
import { sharedDefaultButtonStyles, sharedPrimaryButtonStyles } from '../../app/styles/ButtonStyles';

// Define button styles similar to LinkCard
const iconButtonStyles = (iconColor: string): IButtonStyles => ({
  root: {
    color: iconColor,
    backgroundColor: 'transparent',
    border: 'none',
    height: '32px',
    width: '32px',
    padding: '0px',
    borderRadius: 0,
    transition: 'all 0.15s ease',
    selectors: {
      ':hover': {
        backgroundColor: `${colours.blue}16`,
        color: colours.dark.text,
        transform: 'scale(1.05)',
      },
      ':focus': {
        backgroundColor: `${colours.blue}16`,
        color: colours.dark.text,
      },
    },
  },
  icon: {
    fontSize: '16px',
    lineHeight: '16px',
    color: 'inherit',
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
    padding: '16px',
    backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
    border: `0.5px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
    borderRadius: 0,
    boxShadow: 'none',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
      ':hover': {
        boxShadow: 'none',
        transform: 'translateY(-1px)',
        backgroundColor: isDarkMode ? colours.helixBlue : colours.light.cardHover,
        borderColor: isDarkMode ? colours.highlight : colours.blue,
      },
    },
  });

const leftSectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column', // Stack logo/label and tabs vertically
    alignItems: 'flex-start',
    flex: 1,
    transition: 'transform 0.3s ease', // For shifting on hover
  });

const logoLabelContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
    transition: 'transform 0.3s ease', // For smooth shifting
  });

const resourceTitleStyle = mergeStyles({
  fontSize: '18px',
  fontWeight: '600',
  color: 'inherit',
  cursor: 'pointer',
  marginTop: '0px',
  fontFamily: 'Raleway, sans-serif',
});

const tabsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles('tabsContainer', {
    display: 'flex',
    flexDirection: 'row', // Align tabs horizontally
    alignItems: 'center',
    gap: '8px', // Reduced spacing between tabs
    marginTop: '10px', // Space between label and tabs
    opacity: 0,
    transform: 'translateY(10px)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    pointerEvents: 'none', // Prevent interaction when hidden
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

// Mapping of resource titles to their respective tab texts
const resourceTabsMap: { [key: string]: string[] } = {
  Asana: ['Inbox', 'Task Board'],
  Nuclino: ['Home'],
  Clio: ['Contacts', 'Matters', 'Activities'],
  NetDocuments: ['Home'],
  ActiveCampaign: ['Contacts', 'Accounts'],
  BundleDocs: ['Home'],
  Leapsome: ['Home'],
  Harvey: ['Home'], // No tabs
  LexisNexis: ['Home'], // No tabs
  'Thompson Reuters': ['Home'], // No tabs
  'Land Registry': ['Home'], // No tabs
  'Companies House': ['Home', 'Company Search'],
};

const ResourceCard: React.FC<ResourceCardProps> = React.memo(
  ({
    resource,
    isFavorite,
    onCopy,
    onToggleFavorite,
    onGoTo,
    onSelect,
    animationDelay = 0,
  }) => {
    const { isDarkMode } = useTheme();
    const resourcesWithOperations = new Set(['Asana', 'Clio', 'Azure', 'NetDocuments']);
    const hasOperations = resourcesWithOperations.has(resource.title);

    const isCustomIcon = resource.icon.endsWith('.svg');

    // Determine if backdropIcon should be rendered
    const shouldRenderBackdropIcon = () => {
      if (resource.title === 'Companies House') {
        return false;
      }
      return isCustomIcon;
    };

    // Get tabs for the current resource
    const tabs = resourceTabsMap[resource.title] || [];

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
          {resource.icon && shouldRenderBackdropIcon() && (
            <img
              src={resource.icon}
              alt={`${resource.title} icon backdrop`}
              className="backdropIcon"
            />
          )}

          {/* Left Section: Logo, Label, Tabs */}
          <div className={leftSectionStyle(isDarkMode)}>
            <div className={logoLabelContainerStyle(isDarkMode)}>
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
                    styles={{ root: { fontSize: 32, color: colours.blue } }}
                  />
                )
              )}
              <Text className={resourceTitleStyle}>{resource.title}</Text>
              {hasOperations && (
                <TooltipHost content="Has operations" id={`tooltip-ops-${resource.title}`}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      borderRadius: 999,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      color: isDarkMode ? '#d1d5db' : '#374151',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      lineHeight: 1,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: colours.highlight,
                        boxShadow: 'none',
                      }}
                    />
                    Ops
                  </span>
                </TooltipHost>
              )}
            </div>

            {/* Tabs Container */}
            {tabs.length > 0 && (
              <div className={tabsContainerStyle(isDarkMode)}>
                {tabs.map((tabText, index) => (
                  <DefaultButton
                    key={index}
                    href={`/path/to/${tabText.toLowerCase().replace(' ', '-')}`}
                    text={tabText}
                    className="tab"
                    styles={sharedDefaultButtonStyles}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Separator */}
          <div className={separatorStyle(isDarkMode)} />

          {/* Right Section: Action Buttons */}
          <div className={actionsContainerStyle(isDarkMode)}>
            <TooltipHost
              content={`Copy link for ${resource.title}`}
              id={`tooltip-copy-${resource.title}`}
            >
              <ActionIconButton
                outlineIcon="Copy"
                filledIcon="Copy"
                title="Copy Link"
                ariaLabel="Copy Link"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onCopy(resource.url, resource.title);
                }}
                styles={iconButtonStyles(isDarkMode ? colours.dark.text : colours.darkBlue)}
              />
            </TooltipHost>

            <TooltipHost
              content={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              id={`tooltip-fav-${resource.title}`}
            >
              <ActionIconButton
                outlineIcon={isFavorite ? 'FavoriteStarFill' : 'FavoriteStar'}
                filledIcon="FavoriteStarFill"
                title="Toggle Favorite"
                ariaLabel="Toggle Favorite"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onToggleFavorite(resource);
                }}
                styles={iconButtonStyles(isFavorite ? colours.cta : (isDarkMode ? colours.dark.text : colours.darkBlue))}
              />
            </TooltipHost>

            <TooltipHost
              content={`Go to ${resource.title}`}
              id={`tooltip-go-${resource.title}`}
            >
              <ActionIconButton
                outlineIcon="ChevronRight"
                filledIcon="ChevronRight"
                title="Go To"
                ariaLabel="Go To"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onGoTo(resource.url);
                }}
                styles={iconButtonStyles(isDarkMode ? colours.dark.text : colours.darkBlue)}
              />
            </TooltipHost>
          </div>
        </div>
      </TooltipHost>
    );
  }
);

export default ResourceCard;
