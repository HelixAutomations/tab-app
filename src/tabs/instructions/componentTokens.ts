import { IStackTokens, IStackStyles } from '@fluentui/react';
// invisible change 2.1
//
import { colours } from '../../app/styles/colours';

export const dashboardTokens: IStackTokens = {
  // Reduce vertical gap between stacked sections to reclaim space
  childrenGap: 12,
};

export const cardTokens: IStackTokens = {
  childrenGap: 8,
};

export const cardStyles: IStackStyles = {
  root: {
    padding: 20,
    borderRadius: 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    backgroundColor: colours.light.sectionBackground,
  },
};

export const statusColors = {
  pending: colours.orange,
  completed: colours.green,
  awaiting: colours.yellow,
  notStarted: colours.greyText,
};