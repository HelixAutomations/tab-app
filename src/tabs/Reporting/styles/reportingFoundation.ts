import { colours } from '../../../app/styles/colours';

export const reportingShellBackground = (isDarkMode: boolean): string => (
  isDarkMode
    ? `linear-gradient(140deg, ${colours.dark.background} 0%, ${colours.dark.sectionBackground} 45%, ${colours.dark.cardBackground} 100%)`
    : `linear-gradient(140deg, ${colours.light.cardBackground} 0%, ${colours.grey} 45%, ${colours.highlightNeutral} 100%)`
);

export const reportingPanelBackground = (isDarkMode: boolean, emphasis: 'base' | 'elevated' = 'base'): string => {
  if (isDarkMode) {
    // base ~11% lightness (card level), elevated ~14% (hover level)
    return emphasis === 'elevated' ? 'rgba(14, 36, 62, 0.95)' : 'rgba(10, 28, 50, 0.95)';
  }
  return emphasis === 'elevated' ? 'rgba(255, 255, 255, 0.98)' : `rgba(244, 244, 246, 0.96)`;
};

export const reportingPanelBorder = (isDarkMode: boolean, emphasis: 'base' | 'strong' = 'base'): string => {
  if (isDarkMode) {
    // Visible edges — doubled alpha from previous
    return emphasis === 'strong' ? `rgba(75, 85, 99, 0.55)` : `rgba(75, 85, 99, 0.38)`;
  }
  return emphasis === 'strong' ? `rgba(107, 107, 107, 0.22)` : `rgba(107, 107, 107, 0.14)`;
};

export const reportingPanelShadow = (isDarkMode: boolean): string => (
  isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 3px 10px rgba(6, 23, 51, 0.08)'
);
