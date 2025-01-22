// src/tabs/home/ActionItem.tsx

import React from 'react';
import { DefaultButton, mergeStyles } from '@fluentui/react';
import { colours } from '../../app/styles/colours';

export interface Action {
  title: string;
  iconName: string;
  onClick: () => void;
}

export interface ActionItemProps extends Action {}

const buttonStyles = {
  root: {
    backgroundColor: colours.cta,
    color: '#ffffff',
    borderRadius: '4px',
    padding: '6px 12px',
  },
  rootHovered: {
    backgroundColor: '#005a9e',
  },
  label: {
    fontWeight: '600',
  },
};

const ActionItem: React.FC<ActionItemProps> = ({ title, iconName, onClick }) => {
  return (
    <DefaultButton
      text={title}
      iconProps={{ iconName }}
      onClick={onClick}
      styles={buttonStyles}
    />
  );
};

export default ActionItem;
