import React from 'react';
import { FaCheck } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import '../../tabs/enquiries/styles/ProspectOverview.css';

export type WorkbenchJourneyStageStatus = 'complete' | 'current' | 'review' | 'pending' | 'processing' | 'neutral' | 'disabled';

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
  showLeadingArrow?: boolean;
  railStyle?: React.CSSProperties;
}

export const WorkbenchJourneyRail: React.FC<WorkbenchJourneyRailProps> = ({
  stages,
  isDarkMode,
  compact = false,
  showLeadingArrow = false,
  railStyle,
}) => {
  return (
    <div
      className="prospect-pipeline-rail"
      role="tablist"
      aria-label="Workbench stages"
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
        const isDisabled = stage.status === 'disabled' || !stage.onClick;

        const tone = stage.toneColor || (stage.status === 'complete'
          ? colours.green
          : stage.status === 'review'
            ? colours.cta
            : stage.status === 'current' || stage.status === 'processing'
              ? (isDarkMode ? colours.accent : colours.highlight)
              : stage.status === 'disabled'
                ? (isDarkMode ? colours.dark.border : colours.light.border)
                : colours.subtleGrey);

        const pillTextColour = stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : (isDarkMode ? colours.dark.text : colours.light.text);

        const iconColour = stage.status === 'pending' || stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : tone;

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
            title={stage.label}
            onClick={isDisabled ? undefined : stage.onClick}
            style={{
              '--pill-index': idx,
              '--pipeline-node-underline': tone,
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: compact ? 'flex-start' : 'center',
              gap: compact ? 5 : 8,
              minWidth: 'max-content',
              flex: compact ? '0 0 auto' : '1 0 max-content',
              padding: compact ? '10px 12px' : '12px 16px',
              borderRadius: 0,
              border: 'none',
              borderRight: idx === stages.length - 1 ? 'none' : `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.34)' : 'rgba(160, 160, 160, 0.18)'}`,
              background: 'transparent',
              color: pillTextColour,
              fontFamily: "'Raleway', 'Segoe UI', sans-serif",
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: stage.status === 'disabled' ? 0.72 : 1,
              transition: 'all 0.15s ease',
              marginBottom: 0,
              position: 'relative',
              zIndex: 1,
              textAlign: compact ? 'left' : 'center',
              overflow: 'hidden',
            } as React.CSSProperties}
          >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: compact ? 'flex-start' : 'center', gap: compact ? 4 : 6, minWidth: 0, width: '100%', flex: compact ? '0 1 auto' : '1 1 auto' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: iconColour,
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  {stage.icon}
                </span>

                <span
                  className="prospect-pipeline-label"
                  data-active={stage.isActive ? 'true' : undefined}
                  style={{
                    fontSize: compact ? 9 : 10,
                    fontWeight: stage.isActive ? 700 : 600,
                    color: pillTextColour,
                    lineHeight: compact ? 1 : 1.15,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.1px',
                    minWidth: 0,
                    overflow: compact ? 'hidden' : 'visible',
                    textOverflow: compact ? 'ellipsis' : 'clip',
                    maxWidth: compact ? '100%' : 'none',
                    textAlign: compact ? 'left' : 'center',
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
                  }}
                >
                  <FaCheck size={9} />
                </span>
              )}
            </button>
        );
      })}
    </div>
  );
};

export default WorkbenchJourneyRail;