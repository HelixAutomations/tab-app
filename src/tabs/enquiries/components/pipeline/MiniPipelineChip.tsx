/**
 * MiniPipelineChip — compact pipeline stage indicator for the prospects table.
 *
 * Displays an icon + optional short label inside a pill that expands on row hover
 * (via the CSS cascade `.pipeline-row-hover-ready .pipeline-chip-box`).
 *
 * Design tokens: none inline — all colours come from `colours.ts` and the
 * CSS classes defined in `Prospects.css` / `design-tokens.css`.
 */
import React from 'react';
import { colours } from '../../../../app/styles/colours';
import { renderPipelineIcon } from './renderPipelineIcon';
import type { MiniChipProps } from './types';

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
  onMouseLeave,
}) => {
  const isActiveChip = Boolean(done || inProgress || isNextAction);
  const inactiveColor = isDarkMode
    ? `${colours.subtleGrey}8c`
    : `${colours.greyText}80`;

  // Pending / next-action chips use neutral grey; completed chips use the stage colour.
  const activeColor =
    inProgress || isNextAction ? (isDarkMode ? colours.accent : colours.highlight) : color;
  const iconColor =
    done || inProgress || isNextAction ? activeColor : inactiveColor;

  // Connector is green only when *both* previous and current chip are done.
  const connectorDone = prevDone && done;
  const connectorClass = `pipeline-connector${connectorDone ? ' connector-done' : ''}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`pipeline-chip pipeline-chip-reveal${
        isNextAction || inProgress ? ' next-action-subtle-pulse' : ''
      }`}
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
      {/* Connector dash to the previous chip */}
      {showConnector && <span className={connectorClass} />}

      <span className="pipeline-chip-box">
        {renderPipelineIcon(iconName, iconColor, 14)}
        <span className="pipeline-chip-label" style={{ color: iconColor }}>
          {shortLabel}
        </span>
      </span>
    </button>
  );
};

export default MiniPipelineChip;
