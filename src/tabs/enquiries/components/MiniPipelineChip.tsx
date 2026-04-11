import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { BiLogoMicrosoftTeams } from 'react-icons/bi';
import { FaExchangeAlt, FaPoundSign, FaRegCreditCard } from 'react-icons/fa';
import { colours } from '../../../app/styles/colours';

export const renderPipelineIcon = (iconName: string, color: string, size: number = 14) => {
  if (iconName === 'TeamsLogo') {
    return <BiLogoMicrosoftTeams size={size} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'PaymentCard') {
    return <FaRegCreditCard size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'Bank') {
    return <FaExchangeAlt size={size - 2} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'CurrencyPound') {
    return <FaPoundSign size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  return <Icon iconName={iconName === 'PitchScenario' ? 'Send' : iconName} styles={{ root: { fontSize: size, color } }} />;
};

export interface MiniChipProps {
  shortLabel: string;
  fullLabel: string;
  done: boolean;
  inProgress?: boolean;
  color: string;
  title: string;
  iconName: string;
  statusText?: string;
  subtitle?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isNextAction?: boolean;
  details?: { label: string; value: string }[];
  showConnector?: boolean;
  prevDone?: boolean;
  isDarkMode: boolean;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

const MiniPipelineChip: React.FC<MiniChipProps> = ({
  shortLabel,
  fullLabel,
  done,
  inProgress,
  color,
  title,
  iconName,
  statusText,
  subtitle,
  onClick,
  isNextAction,
  details,
  showConnector,
  prevDone,
  isDarkMode,
  onMouseEnter,
  onMouseMove,
  onMouseLeave
}) => {
  const isActiveChip = Boolean(done || inProgress || isNextAction);
  const inactiveColor = isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)';
  const activeColor = (inProgress || isNextAction) ? colours.greyText : color;
  const iconColor = (done || inProgress || isNextAction) ? activeColor : inactiveColor;
  
  const connectorDone = prevDone && done;
  const connectorClass = `pipeline-connector${connectorDone ? ' connector-done' : ''}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`pipeline-chip pipeline-chip-reveal${(isNextAction || inProgress) ? ' next-action-subtle-pulse' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 24,
        height: 'auto',
        padding: 0,
        borderRadius: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {showConnector && (
        <span className={connectorClass} />
      )}
      <span className="pipeline-chip-box">
        {renderPipelineIcon(iconName, iconColor, 14)}
        <span
          className="pipeline-chip-label"
          style={{ color: iconColor }}
        >
          {shortLabel}
        </span>
      </span>
    </button>
  );
};

export default MiniPipelineChip;
