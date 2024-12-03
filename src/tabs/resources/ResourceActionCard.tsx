// src/tabs/resources/ResourceActionCard.tsx

import React from 'react';
import {
  Stack,
  Text,
  Icon,
  IStackStyles,
  IStackTokens,
  mergeStyles,
  IStyle,
} from '@fluentui/react';
import { ResourceAction } from '../../app/customisation/ResourceActions';

// Define styles for the card
const cardStyles: IStyle = mergeStyles({
  backgroundColor: '#ffffff',
  border: '1px solid #e1e1e1',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  padding: '16px',
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  ':hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  ':focus': {
    outline: 'none',
    border: '1px solid #0078D4',
    boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.3)',
  },
});

// Define styles for the icon container
const iconContainerStyle: IStyle = mergeStyles({
  fontSize: '28px',
  color: '#0078D4',
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
  return (
    <Stack horizontal wrap tokens={stackTokens} styles={stackStyles}>
      {actions.map((action, index) => (
        <div
          key={index}
          className={cardStyles}
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
            <Icon iconName={action.icon} className={iconContainerStyle} />
            <Text variant="large" styles={{ root: { fontWeight: '600', color: '#333333' } }}>
              {action.label}
            </Text>
          </Stack>
        </div>
      ))}
    </Stack>
  );
};

export default ResourceActionCard;
