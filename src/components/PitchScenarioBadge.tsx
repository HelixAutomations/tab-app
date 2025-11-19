import React from 'react';
import { Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { useTheme } from '../app/functionality/ThemeContext';
import { SCENARIOS } from '../tabs/enquiries/pitch-builder/scenarios';

interface PitchScenarioBadgeProps {
  scenarioId?: string | null;
  size?: 'small' | 'medium';
  className?: string;
}

/**
 * Maps scenario IDs to their display icons
 */
function getScenarioIcon(scenarioId?: string | null): { iconName: string; tooltip: string } {
  if (!scenarioId) {
    return { iconName: 'Send', tooltip: 'Pitch sent' };
  }

  switch (scenarioId) {
    case 'before-call-call':
      return { iconName: 'Phone', tooltip: 'Before call — Call' };
    case 'before-call-no-call':
      return { iconName: 'Mail', tooltip: 'Before call — No call' };
    case 'after-call-probably-cant-assist':
      return { iconName: 'Cancel', tooltip: 'After call — Probably can\'t assist' };
    case 'after-call-want-instruction':
      return { iconName: 'CheckMark', tooltip: 'After call — Want the instruction' };
    case 'cfa':
      return { iconName: 'Scales', tooltip: 'CFA' };
    default:
      return { iconName: 'Send', tooltip: 'Pitch sent' };
  }
}

/**
 * Get the scenario name from ID
 */
function getScenarioName(scenarioId?: string | null): string {
  if (!scenarioId) return 'Pitch';
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  return scenario?.name || scenarioId;
}

/**
 * Get color for scenario type
 */
function getScenarioColor(scenarioId?: string | null): string {
  if (!scenarioId) {
    return '#60a5fa'; // Blue for generic pitch
  }

  switch (scenarioId) {
    case 'before-call-call':
      return '#3690ce'; // Blue
    case 'before-call-no-call':
      return '#f59e0b'; // Amber/Yellow
    case 'after-call-probably-cant-assist':
      return '#ef4444'; // Red
    case 'after-call-want-instruction':
      return '#10b981'; // Green
    case 'cfa':
      return '#a855f7'; // Purple
    default:
      return '#60a5fa'; // Blue
  }
}

const PitchScenarioBadge: React.FC<PitchScenarioBadgeProps> = ({
  scenarioId,
  size = 'small',
  className
}) => {
  const { isDarkMode } = useTheme();
  const { iconName, tooltip } = getScenarioIcon(scenarioId);
  const scenarioName = getScenarioName(scenarioId);
  const color = getScenarioColor(scenarioId);
  const isSmall = size === 'small';

  const widgetStyle = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: isSmall ? 3 : 4,
    padding: isSmall ? '4px 8px' : '4px 10px',
    borderRadius: 6,
    background: isDarkMode 
      ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.12)`
      : `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.08)`,
    border: `1px solid ${isDarkMode ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.25)` : `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.15)`}`,
    cursor: 'default',
    transition: 'all 0.2s ease',
    fontSize: isSmall ? 10 : 11,
    fontWeight: 600,
    color: isDarkMode ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.9)` : color,
    textDecoration: 'none',
    userSelect: 'none',
    position: 'relative' as const,
  });

  const iconStyle = mergeStyles({
    fontSize: isSmall ? 11 : 13,
    color: isDarkMode ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.9)` : color,
  });

  return (
    <div
      className={`${widgetStyle} ${className || ''}`}
      title={`${tooltip}${scenarioId ? ` - ${scenarioName}` : ''}`}
    >
      <Icon iconName={iconName} className={iconStyle} />
    </div>
  );
};

export default PitchScenarioBadge;
