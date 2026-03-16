import React from 'react';
import { FaArrowRight, FaCheck } from 'react-icons/fa';
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
      style={{
        padding: compact ? '6px 8px' : '8px 16px 8px',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: compact ? 4 : 8,
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        ...railStyle,
      }}
    >
      {showLeadingArrow && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: isDarkMode ? colours.subtleGrey : colours.greyText,
          fontSize: 10, lineHeight: 1, flexShrink: 0,
          opacity: 0.5, marginRight: 2,
        }}>
          <FaArrowRight size={8} />
        </span>
      )}

      {stages.map((stage, idx) => {
        const isLast = idx === stages.length - 1;
        const nextStage = !isLast ? stages[idx + 1] : null;
        const connectorFilled = stage.status === 'complete' && nextStage?.status === 'complete';
        const connectorActive = stage.status === 'complete' && nextStage && nextStage.status !== 'disabled';
        const isDisabled = stage.status === 'disabled' || !stage.onClick;

        const tone = stage.toneColor || (stage.status === 'complete'
          ? colours.green
          : stage.status === 'review'
            ? colours.cta
            : stage.status === 'current' || stage.status === 'processing'
              ? colours.subtleGrey
              : stage.status === 'disabled'
                ? (isDarkMode ? colours.dark.border : colours.light.border)
                : colours.subtleGrey);

        const pillBorder = stage.isActive
          ? tone
          : (isDarkMode ? `${colours.dark.border}90` : colours.highlightNeutral);

        const pillBackground = stage.isActive
          ? (isDarkMode ? colours.websiteBlue : '#ffffff')
          : 'transparent';

        const pillTextColour = stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : (isDarkMode ? colours.dark.text : colours.light.text);

        const iconColour = stage.status === 'pending' || stage.status === 'disabled'
          ? (isDarkMode ? colours.subtleGrey : colours.greyText)
          : tone;

        return (
          <React.Fragment key={stage.key}>
            <button
              type="button"
              className="prospect-pipeline-node"
              data-disabled={isDisabled ? 'true' : undefined}
              title={stage.label}
              onClick={isDisabled ? undefined : stage.onClick}
              style={{
                '--pill-index': idx,
                display: 'inline-flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: compact ? 5 : 8,
                minWidth: 0,
                padding: compact ? '4px 8px' : '6px 12px',
                borderRadius: 999,
                border: `1px solid ${pillBorder}`,
                background: pillBackground,
                color: pillTextColour,
                fontFamily: "'Raleway', sans-serif",
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: stage.status === 'disabled' ? 0.72 : 1,
                transition: 'all 0.15s ease',
              } as React.CSSProperties}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 6, minWidth: 0 }}>
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
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.1px',
                    minWidth: 0,
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

            {!isLast && (
              <div
                className="prospect-pipeline-connector"
                data-filled={connectorFilled ? 'true' : undefined}
                data-active={connectorActive ? 'true' : undefined}
                style={{
                  '--pill-index': idx,
                  width: compact ? 8 : 16,
                  minWidth: compact ? 8 : 16,
                  maxWidth: compact ? 8 : 16,
                  height: 1.5,
                  alignSelf: 'center',
                  marginTop: 0,
                  borderRadius: 999,
                  background: connectorFilled
                    ? colours.green
                    : connectorActive
                      ? (isDarkMode ? `${colours.dark.borderColor}` : `${colours.subtleGrey}`)
                      : (isDarkMode ? `${colours.dark.border}80` : `${colours.highlightNeutral}`),
                  flexShrink: 0,
                } as React.CSSProperties}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WorkbenchJourneyRail;