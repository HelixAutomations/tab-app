// src/tabs/home/ActionSection.tsx

import React from 'react';
import { mergeStyles, Stack, Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import ActionItem, { Action } from './ActionItem';

export type { Action };

export interface ActionSectionProps {
  actions: Action[];
}

const sectionWrapperStyle = mergeStyles({
  position: 'relative',
  marginBottom: '40px',
});

const backdropIconStyle = mergeStyles({
  position: 'absolute',
  top: '50%',
  left: '20px',
  transform: 'translateY(-50%)',
  opacity: 0.1,
  fontSize: '100px',
  zIndex: 0,
  pointerEvents: 'none',
  color: colours.cta,
});

const contentContainerStyle = mergeStyles({
  position: 'relative',
  zIndex: 1,
});

const actionsContainerStyle = mergeStyles({
  display: 'flex',
  gap: '10px',
});

const ActionSection: React.FC<ActionSectionProps> = ({ actions }) => {
  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div className={sectionWrapperStyle}>
      <Icon iconName="Warning" className={backdropIconStyle} aria-hidden="true" />
      <div className={contentContainerStyle}>
        <Stack horizontal tokens={{ childrenGap: 10 }} className={actionsContainerStyle}>
          {actions.map((action, index) => (
            <ActionItem key={index} title={action.title} iconName={action.iconName} onClick={action.onClick} />
          ))}
        </Stack>
      </div>
    </div>
  );
};

export default ActionSection;
