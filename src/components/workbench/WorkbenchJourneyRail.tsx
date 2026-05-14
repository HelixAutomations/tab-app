import React from 'react';
import { FaCheck } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import '../../tabs/enquiries/styles/ProspectOverview.css';

export type WorkbenchJourneyStageStatus = 'complete' | 'current' | 'review' | 'warning' | 'pending' | 'processing' | 'neutral' | 'disabled';

export interface WorkbenchJourneyStage {
  key: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  status: WorkbenchJourneyStageStatus;
  isActive?: boolean;
  onClick?: () => void;
  toneColor?: string;
}

interface WorkbenchJourneyRailProps {
  stages: WorkbenchJourneyStage[];
  isDarkMode: boolean;
  compact?: boolean;
  hierarchy?: 'primary' | 'secondary';
  showLeadingArrow?: boolean;
  railStyle?: React.CSSProperties;
}

export const WorkbenchJourneyRail: React.FC<WorkbenchJourneyRailProps> = ({
  stages,
  isDarkMode,
  compact = false,
  hierarchy = 'primary',
  showLeadingArrow = false,
  railStyle,
}) => {
  const isSecondary = hierarchy === 'secondary';

  return (
    <div
      className="prospect-pipeline-rail"
      role="tablist"
      aria-label="Workbench stages"
      data-hierarchy={hierarchy}
      style={{
        padding: 0,
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        gap: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        ...railStyle,
      }}
    >
      {stages.map((stage, idx) => {
        const isDisabled = !stage.onClick;

        const semanticTone = stage.status === 'complete'
          ? colours.green
          : stage.status === 'review'
            ? colours.cta
            : stage.status === 'warning'
              ? colours.orange
            : stage.status === 'current' || stage.status === 'processing'
              ? (isDarkMode ? colours.accent : colours.highlight)
              : stage.status === 'disabled'
                ? (isDarkMode ? colours.dark.border : colours.light.border)
              : colours.subtleGrey;

        const selectionTone = stage.toneColor || semanticTone;

        const pillTextColour = stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : (isDarkMode ? colours.dark.text : colours.light.text);

        const iconColour = stage.status === 'pending' || stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : semanticTone;

        return (
          <button
            key={stage.key}
            type="button"
            className="prospect-pipeline-node"
            role="tab"
            aria-selected={stage.isActive ? 'true' : 'false'}
            data-disabled={isDisabled ? 'true' : undefined}
            data-active={stage.isActive ? 'true' : undefined}
            data-status={stage.status}
            data-hierarchy={hierarchy}
            title={stage.label}
            onClick={isDisabled ? undefined : stage.onClick}
            style={{
              '--pill-index': idx,
              '--pipeline-node-underline': selectionTone,
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: compact || isSecondary ? 'flex-start' : 'center',
              gap: compact ? 5 : isSecondary ? 8 : 8,
              minWidth: 'max-content',
              flex: '1 0 max-content',
              padding: compact
                ? (isSecondary ? '8px 10px' : '10px 12px')
                : (isSecondary ? '8px 12px' : '12px 16px'),
              borderRadius: 0,
              border: 'none',
              borderRight: isSecondary
                ? 'none'
                : idx === stages.length - 1
                ? 'none'
                : `1px solid ${isDarkMode
                    ? (isSecondary ? 'rgba(75, 85, 99, 0.22)' : 'rgba(75, 85, 99, 0.34)')
                    : (isSecondary ? 'rgba(160, 160, 160, 0.12)' : 'rgba(160, 160, 160, 0.18)')}`,
              color: pillTextColour,
              fontFamily: "'Raleway', 'Segoe UI', sans-serif",
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: stage.status === 'disabled' ? 0.72 : 1,
              transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease, transform 0.15s ease',
              marginBottom: 0,
              position: 'relative',
              zIndex: 1,
              textAlign: compact || isSecondary ? 'left' : 'center',
              overflow: 'hidden',
            } as React.CSSProperties}
          >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: compact || isSecondary ? 'flex-start' : 'center', gap: compact ? 4 : isSecondary ? 8 : 6, minWidth: 0, width: '100%', flex: compact ? '0 1 auto' : '1 1 auto' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: iconColour,
                    flexShrink: 0,
                    lineHeight: 1,
                    width: isSecondary ? 16 : undefined,
                  }}
                >
                  {stage.icon}
                </span>

                <span
                  className="prospect-pipeline-label"
                  data-active={stage.isActive ? 'true' : undefined}
                  style={{
                    fontSize: compact ? 9 : isSecondary ? 9 : 10,
                    fontWeight: stage.isActive ? (isSecondary ? 600 : 700) : (isSecondary ? 500 : 600),
                    color: pillTextColour,
                    lineHeight: compact ? 1 : 1.15,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.1px',
                    minWidth: 0,
                    overflow: compact ? 'hidden' : 'visible',
                    textOverflow: compact ? 'ellipsis' : 'clip',
                    maxWidth: compact ? '100%' : 'none',
                    textAlign: compact || isSecondary ? 'left' : 'center',
                  }}
                >
                  {stage.shortLabel}
                </span>
              </span>

              {stage.status === 'complete' && !compact && (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colours.green,
                    marginLeft: 'auto',
                    flexShrink: 0,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: isDarkMode
                      ? 'rgba(0, 0, 0, 0.28)'
                      : 'rgba(6, 23, 51, 0.06)',
                    boxShadow: isDarkMode
                      ? 'inset 0 1px 1.5px rgba(0, 0, 0, 0.55), inset 0 -1px 0 rgba(255, 255, 255, 0.04)'
                      : 'inset 0 1px 1.5px rgba(6, 23, 51, 0.16), inset 0 -1px 0 rgba(255, 255, 255, 0.85)',
                  }}
                >
                  <FaCheck size={8} />
                </span>
              )}
            </button>
        );
      })}
    </div>
  );
};

export default WorkbenchJourneyRail;