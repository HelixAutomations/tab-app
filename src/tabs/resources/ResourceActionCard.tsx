// src/tabs/resources/ResourceActionCard.tsx
// invisible change

import React from 'react';
import {
  Stack,
  Text,
  Icon,
  IStackStyles,
  IStackTokens,
  mergeStyles,
} from '@fluentui/react';
import { ResourceAction } from '../../app/customisation/ResourceActions';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

const cardStyles = (isDarkMode: boolean): string =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
    border: `0.5px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
    borderRadius: 0,
    boxShadow: 'none',
    padding: '16px',
    cursor: 'pointer',
    transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease',
    ':hover': {
      transform: 'translateY(-1px)',
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
      borderColor: isDarkMode ? colours.highlight : colours.blue,
      boxShadow: 'none',
    },
    ':focus': {
      outline: 'none',
      border: `1px solid ${isDarkMode ? colours.highlight : colours.blue}`,
      boxShadow: 'none',
    },
  });

const iconContainerStyle = (isDarkMode: boolean): string =>
  mergeStyles({
    fontSize: '28px',
    color: isDarkMode ? colours.highlight : colours.blue,
  });

// Define stack styles
const stackStyles: IStackStyles = {
  root: {
    width: '100%',
  },
};

const stackTokens: IStackTokens = { childrenGap: 20 };

interface ResourceActionCardProps {
  actions: ResourceAction[];
  onSelectAction: (action: ResourceAction) => void;
}

const ResourceActionCard: React.FC<ResourceActionCardProps> = ({ actions, onSelectAction }) => {
  const { isDarkMode } = useTheme();

  return (
    <Stack horizontal wrap tokens={stackTokens} styles={stackStyles}>
      {actions.map((action, index) => (
        <div
          key={index}
          className={cardStyles(isDarkMode)}
          onClick={() => onSelectAction(action)}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onSelectAction(action);
            }
          }}
          aria-label={`Action: ${action.label}`}
        >
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 16 }}>
            <Icon iconName={action.icon} className={iconContainerStyle(isDarkMode)} />
            <Text variant="large" styles={{ root: { fontWeight: '600', color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {action.label}
            </Text>
          </Stack>
        </div>
      ))}
    </Stack>
  );
};

export default ResourceActionCard;
