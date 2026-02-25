import React from 'react';
import { Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { useTheme } from '../app/functionality/ThemeContext';
import { SCENARIOS } from '../tabs/enquiries/pitch-builder/scenarios';

interface PitchScenarioBadgeProps {
  scenarioId?: string | null;
  size?: 'small' | 'medium';
  className?: string;
  fullWidth?: boolean;
}

/**
 * Maps scenario IDs to their display icons
 */
function getScenarioIcon(scenarioId?: string | null): { iconName: string; tooltip: string } {
  if (!scenarioId) {
    return { iconName: 'CheckMark', tooltip: 'Pitch sent' };
  }

  switch (scenarioId) {
    case 'before-call-call':
      return { iconName: 'CheckMark', tooltip: 'Before call — Call' };
    case 'before-call-no-call':
      return { iconName: 'CheckMark', tooltip: 'Before call — No call' };
    case 'after-call-probably-cant-assist':
      return { iconName: 'CheckMark', tooltip: 'After call — Probably can\'t assist' };
    case 'after-call-want-instruction':
      return { iconName: 'CheckMark', tooltip: 'After call — Want the instruction' };
    case 'cfa':
      return { iconName: 'CheckMark', tooltip: 'CFA' };
    default:
      return { iconName: 'CheckMark', tooltip: 'Pitch sent' };
  }
}

/**
 * Get the scenario short code from ID (BCC, BCNC, ACPCA, ACWI, CFA)
 */
function getScenarioCode(scenarioId?: string | null): string {
  if (!scenarioId) return '';
  
  // Exact matches first
  switch (scenarioId) {
    case 'before-call-call':
      return 'BCC';
    case 'before-call-no-call':
      return 'BCNC';
    case 'after-call-probably-cant-assist':
      return 'ACPCA';
    case 'after-call-want-instruction':
      return 'ACWI';
    case 'cfa':
      return 'CFA';
  }
  
  // Fallback: check if scenarioId contains these patterns
  const lower = scenarioId.toLowerCase();
  if (lower.includes('before-call-call') || lower.includes('before_call_call')) return 'BCC';
  if (lower.includes('before-call-no-call') || lower.includes('before_call_no_call')) return 'BCNC';
  if (lower.includes('probably-cant-assist') || lower.includes('probably_cant_assist')) return 'ACPCA';
  if (lower.includes('want-instruction') || lower.includes('want_instruction')) return 'ACWI';
  if (lower.includes('cfa')) return 'CFA';
  
  return '';
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
export function getScenarioColor(scenarioId?: string | null): string {
  if (!scenarioId) {
    return '#3690CE'; // Brand highlight blue for generic pitch
  }

  switch (scenarioId) {
    case 'before-call-call':
      return '#3690CE'; // Brand highlight blue
    case 'before-call-no-call':
      return '#FF8C00'; // Brand orange (colours.orange)
    case 'after-call-probably-cant-assist':
      return '#D65541'; // Brand CTA red (colours.cta)
    case 'after-call-want-instruction':
      return '#20b26c'; // Brand green (colours.green)
    case 'after-call-email':
      return '#3690CE'; // Brand highlight blue
    case 'cfa':
      return '#a855f7'; // Purple (accepted accent)
    default:
      return '#3690CE'; // Brand highlight blue
  }
}

const PitchScenarioBadge: React.FC<PitchScenarioBadgeProps> = ({
  scenarioId,
  size = 'small',
  className,
  fullWidth = false,
}) => {
  const { isDarkMode } = useTheme();
  const { iconName, tooltip } = getScenarioIcon(scenarioId);
  const scenarioName = getScenarioName(scenarioId);
  const scenarioCode = getScenarioCode(scenarioId);
  const color = getScenarioColor(scenarioId);
  const isSmall = size === 'small';

  // Parse color for rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const widgetStyle = mergeStyles({
    display: fullWidth ? 'flex' : 'inline-flex',
    alignItems: 'center',
    justifyContent: fullWidth ? 'center' : undefined,
    gap: 4,
    padding: '0 6px',
    borderRadius: 0,
    // Match Mini chip opacity levels: dark 0.133 / light 0.086
    background: isDarkMode 
      ? `rgba(${r}, ${g}, ${b}, 0.133)`
      : `rgba(${r}, ${g}, ${b}, 0.086)`,
    // Match Mini chip solid border style
    border: `1px solid rgb(${r}, ${g}, ${b})`,
    cursor: 'default',
    transition: '0.2s',
    fontSize: 8,
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    // Match Mini chip text color (solid)
    color: `rgb(${r}, ${g}, ${b})`,
    textDecoration: 'none',
    userSelect: 'none',
    position: 'relative' as const,
    width: fullWidth ? '100%' : undefined,
    height: fullWidth ? 22 : (isSmall ? 22 : 26),
    whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit',
  });

  const iconStyle = mergeStyles({
    fontSize: 10,
    color: 'inherit',
  });

  return (
    <div
      className={`${widgetStyle} ${className || ''}`}
      title={tooltip}
    >
      <Icon iconName={iconName} className={iconStyle} />
      {scenarioCode && <span>{scenarioCode}</span>}
    </div>
  );
};

export default PitchScenarioBadge;
