/**
 * ProspectTableRow — renders a single enquiry row in the prospects table.
 *
 * Extracted from the ~1,400-line individual-row branch in Enquiries.tsx.
 * Composes: 6-column grid row (Timeline, Date, ID/Value,
 * Contact, PipelineCell, ActionsCell), and notes expansion.
 */

import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { colours } from '../../../app/styles/colours';
import type { Enquiry } from '../../../app/functionality/types';
import PipelineCell from './PipelineCell';
import ActionsCell from './ActionsCell';
import {
  getAreaOfWorkIcon,
  getAreaOfWorkLineColor,
  getStackedDateDisplay,
  formatFullDateTime,
  formatValueForDisplay,
  buildEnquiryIdentityKey,
} from './prospectDisplayUtils';
import type { ProspectTableRowProps } from './rowTypes';

const LOCKED_ACTIONS_COLUMN_WIDTH_PX = 56;
const UNLOCKED_ACTIONS_COLUMN_WIDTH_PX = 188;
const LOCKED_ACTIONS_COLUMN_WIDTH = `clamp(32px, 4vw, ${LOCKED_ACTIONS_COLUMN_WIDTH_PX}px)`;
const UNLOCKED_ACTIONS_COLUMN_WIDTH = `clamp(80px, 14vw, ${UNLOCKED_ACTIONS_COLUMN_WIDTH_PX}px)`;

/** Grid template used by every row — must match the live Enquiries table. */
const getTableGridTemplateColumns = (areActionsEnabled: boolean) => (
  `clamp(20px, 4vw, 36px) minmax(clamp(28px, 5vw, 60px), 0.45fr) minmax(clamp(44px, 7vw, 88px), 0.6fr) minmax(clamp(50px, 9vw, 140px), 1.1fr) minmax(clamp(60px, 15vw, 260px), 3.4fr) ${areActionsEnabled ? UNLOCKED_ACTIONS_COLUMN_WIDTH : LOCKED_ACTIONS_COLUMN_WIDTH}`
);

const ProspectTableRow: React.FC<ProspectTableRowProps> = ({
  item,
  idx,
  nextDateStr,
  pipelineHandlers,
  actionHandlers,
  displayState,
  hoverHandlers,
  dataDeps,
}) => {
  const {
    isDarkMode,
    activeState,
    areActionsEnabled,
    copiedNameKey,
    expandedNotesInTable,
    hoveredRowKey,
    hoveredDayKey,
    hoveredRowKeyReady,
    hoveredDayKeyReady,
    pipelineNeedsCarousel,
    visiblePipelineChipCount,
    PIPELINE_CHIP_MIN_WIDTH_PX,
    currentUserEmail,
  } = displayState;

  const { setHoveredRowKey, setHoveredDayKey } = hoverHandlers;
  const { handleSelectEnquiry, handleCopyName, setExpandedNotesInTable: setExpandedNotes } = actionHandlers;
  const { enrichmentMap, getEnquiryWorkbenchItem, isUnclaimedPoc, getRatingChipMeta, combineDateAndTime, claimerMap } = dataDeps;

  const pocLower = (item.Point_of_Contact || '').toLowerCase();
  const isUnclaimed = isUnclaimedPoc(pocLower);
  const inlineWorkbenchItem = getEnquiryWorkbenchItem(item);
  const hasInlineWorkbench = Boolean(inlineWorkbenchItem);
  const isConverted = Boolean(
    inlineWorkbenchItem?.instruction?.MatterId ||
    (inlineWorkbenchItem?.matters && inlineWorkbenchItem.matters.length > 0)
  );

  const contactName = (() => {
    const rawFirst = (item.First_Name || '').trim();
    const rawLast = (item.Last_Name || '').trim();
    if (!rawLast && inlineWorkbenchItem) {
      const instFirst = (inlineWorkbenchItem?.instruction?.FirstName || '').trim();
      const instLast = (inlineWorkbenchItem?.instruction?.LastName || '').trim();
      if (instFirst && instLast) return `${instFirst} ${instLast}`;
    }
    return `${rawFirst} ${rawLast}`.trim() || 'Unknown';
  })();

  const areaOfWork = item.Area_of_Work || 'Unspecified';
  const dateReceived = item.Touchpoint_Date || item.Date_Created || '';
  const rawValue: any = (item as any).Value ?? (item as any).value ?? '';
  const value = typeof rawValue === 'string' ? rawValue.replace(/^£\s*/, '').trim() : rawValue;
  const isFromInstructions = (item as any).source === 'instructions';
  const hasNotes = !!(item.Initial_first_call_notes && item.Initial_first_call_notes.trim().length > 0);
  const normalizedNotes = item.Initial_first_call_notes?.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || '';
  const noteKey = buildEnquiryIdentityKey(item);
  const isNotesExpanded = expandedNotesInTable.has(noteKey);
  const nameCopyKey = `name-${noteKey}`;
  const isNameCopied = copiedNameKey === nameCopyKey;
  const enrichmentDataKey = item.ID ?? (item as any).id ?? '';
  const enrichmentData = enrichmentDataKey ? enrichmentMap.get(String(enrichmentDataKey)) : undefined;
  const mainPocValue = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
  const isMainTeamInboxPoc = isUnclaimedPoc(mainPocValue);
  const mainShowClaimer = !!mainPocValue && activeState !== 'Triaged' && !isMainTeamInboxPoc;
  const accentColor = isDarkMode ? colours.accent : colours.highlight;
  const idTextColor = isConverted ? colours.green : (isDarkMode ? colours.dark.text : colours.light.text);
  const tableGridTemplateColumns = getTableGridTemplateColumns(areActionsEnabled);
  const isClaimableRow = activeState === 'Claimable' && isUnclaimed;
  const claimRail = isClaimableRow
    ? pipelineHandlers.renderClaimPromptChip({
        size: 'default',
        teamsLink: null,
        leadName: contactName,
        areaOfWork: item.Area_of_Work,
        enquiryId: String(item.ID ?? (item as any).id ?? ''),
        dataSource: isFromInstructions ? 'legacy' : 'new',
      })
    : null;

  const pipelineCellDataDeps = React.useMemo(() => ({
    claimerMap,
    isUnclaimedPoc,
    combineDateAndTime,
  }), [claimerMap, isUnclaimedPoc, combineDateAndTime]);

  const toDayKey = (s: string): string => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const thisDateStr = (item.Touchpoint_Date || (item as any).datetime || (item as any).claim || item.Date_Created || '') as string;
  const singleDayKey = toDayKey(thisDateStr);
  const isLastInDay = !nextDateStr || toDayKey(nextDateStr) !== singleDayKey;
  const fullDateTooltip = formatFullDateTime(thisDateStr || dateReceived || null);
  const rowHoverKey = buildEnquiryIdentityKey(item);
  const showRowDetails = hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey;

  return (
    <React.Fragment key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}>
      <div
        data-enquiry-id={item.ID ? String(item.ID) : undefined}
        data-row-parity={idx % 2 === 0 ? 'even' : 'odd'}
        style={{
          gridTemplateColumns: tableGridTemplateColumns,
          borderBottom: isLastInDay
            ? `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(0, 0, 0, 0.09)'}`
            : `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.10)' : 'rgba(160, 160, 160, 0.08)'}`,
          '--row-index': Math.min(idx, 15),
        } as React.CSSProperties}
        className={`prospect-row enquiry-row enquiry-row--enter${isConverted ? ' prospect-row--converted' : ''}${(hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey) ? ' pipeline-row-hover' : ''}${(hoveredRowKeyReady === rowHoverKey || hoveredDayKeyReady === singleDayKey) ? ' pipeline-row-hover-ready' : ''}`}
        onMouseEnter={(e) => {
          const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
          if (tooltip) tooltip.style.opacity = '1';
          setHoveredRowKey(rowHoverKey);
        }}
        onMouseLeave={(e) => {
          const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
          if (tooltip) tooltip.style.opacity = '0';
          setHoveredRowKey((prev) => (prev === rowHoverKey ? null : prev));
        }}
        onClick={() => !isUnclaimed && handleSelectEnquiry(item)}
      >
        <div className="prospect-timeline-cell">
          <div
            className="prospect-timeline-cell__line"
            style={{
              background: getAreaOfWorkLineColor(areaOfWork, isDarkMode, hoveredDayKey === singleDayKey),
              opacity: hoveredDayKey === singleDayKey ? 1 : 0.9,
            }}
          />
        </div>

        <TooltipHost
          content={fullDateTooltip}
          styles={{ root: { display: 'flex', alignItems: 'center', height: '100%', paddingInline: 2 } }}
          calloutProps={{ gapSpace: 6 }}
        >
          {(() => {
            const { top, bottom } = getStackedDateDisplay(dateReceived);
            return (
              <div className="prospect-date">
                <span className="prospect-date__top">{top}</span>
                <span className="prospect-date__bottom">{bottom}</span>
              </div>
            );
          })()}
        </TooltipHost>

        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          lineHeight: 1.3,
          paddingInline: 2,
          overflow: 'hidden',
        }}>
          {/* ID row — visible by default, fades out on hover when value exists */}
          {(() => {
            const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : (typeof value === 'number' ? value : 0);
            const displayValue = formatValueForDisplay(value);
            const hasValue = Boolean(displayValue);
            return (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: (showRowDetails && hasValue) ? 0 : 1,
                  transition: 'opacity 160ms ease',
                }}>
                  <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }} title={areaOfWork}>
                    {getAreaOfWorkIcon(areaOfWork)}
                  </span>
                  <span style={{
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: idTextColor,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>
                    {(item as any).acid || item.ID}
                  </span>
                </div>
                {hasValue && (
                  <div style={{
                    position: 'absolute',
                    left: 2,
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: showRowDetails ? 1 : 0,
                    transition: 'opacity 160ms ease',
                    pointerEvents: 'none',
                  }}>
                    <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, visibility: 'hidden' }}>
                      {getAreaOfWorkIcon(areaOfWork)}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: (() => {
                        if (numValue >= 50000) return accentColor;
                        if (numValue >= 10000) return `${accentColor}bf`;
                        return `${accentColor}${isDarkMode ? '80' : '8c'}`;
                      })(),
                      whiteSpace: 'nowrap',
                    }}>
                      {displayValue}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          lineHeight: 1.3,
          justifyContent: 'center',
          paddingInline: 2,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transform: showRowDetails ? 'translateY(-4px)' : 'translateY(0)',
            transition: 'transform 160ms ease',
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: isConverted ? colours.green : (isDarkMode ? colours.dark.text : colours.light.text),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: '1 1 auto',
            }}>
              {contactName}
            </span>
            {isConverted && (
              <Icon iconName="CompletedSolid" styles={{ root: { fontSize: 9, color: colours.green, opacity: 0.7, flexShrink: 0 } }} />
            )}
            <button
              type="button"
              className="prospect-copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyName(contactName, nameCopyKey);
              }}
              title={isNameCopied ? 'Copied' : 'Copy name'}
              aria-label="Copy name"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 'auto',
                flexShrink: 0,
                width: 18,
                height: 18,
                borderRadius: 0,
                border: isNameCopied
                  ? `1px solid ${colours.green}80`
                  : `1px solid ${isDarkMode ? `${colours.subtleGrey}26` : `${colours.greyText}1f`}`,
                background: isNameCopied
                  ? (isDarkMode ? `${colours.green}29` : `${colours.green}1f`)
                  : 'transparent',
                color: isNameCopied
                  ? colours.green
                  : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}8c`),
                cursor: 'pointer',
                padding: 0,
                opacity: isNameCopied ? 1 : 0.5,
                boxShadow: isNameCopied ? `0 0 0 1px ${colours.green}26` : 'none',
                transform: isNameCopied ? 'scale(1.06)' : 'scale(1)',
                transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
              }}
              onMouseEnter={(e) => {
                if (isNameCopied) return;
                e.currentTarget.style.opacity = '0.9';
                e.currentTarget.style.borderColor = isDarkMode ? `${colours.subtleGrey}59` : `${colours.greyText}4d`;
                e.currentTarget.style.color = isDarkMode ? `${colours.subtleGrey}cc` : `${colours.greyText}d9`;
              }}
              onMouseLeave={(e) => {
                if (isNameCopied) return;
                e.currentTarget.style.opacity = '0.5';
                e.currentTarget.style.borderColor = isDarkMode ? `${colours.subtleGrey}26` : `${colours.greyText}1f`;
                e.currentTarget.style.color = isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}8c`;
              }}
            >
              <Icon
                iconName={isNameCopied ? 'CompletedSolid' : 'Copy'}
                styles={{
                  root: {
                    fontSize: 10,
                    transform: isNameCopied ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 160ms ease, color 160ms ease',
                    color: isNameCopied ? colours.green : undefined,
                  },
                }}
              />
            </button>
          </div>
          <div style={{
            fontSize: '10px',
            color: isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}73`,
            display: 'flex',
            alignItems: 'center',
            gap: '0',
          }}>
            {item.Email && (
              <span style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: showRowDetails ? 1 : 0,
                transform: showRowDetails ? 'translateY(6px)' : 'translateY(3px)',
                transition: 'opacity 140ms ease, transform 160ms ease',
                pointerEvents: 'none',
              }}>
                {item.Email}
              </span>
            )}
          </div>
        </div>

        {isClaimableRow ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 0,
            paddingInline: 2,
            overflow: 'hidden',
          }}>
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {claimRail}
            </div>
            <div style={{
              minWidth: 0,
              flex: '1 1 auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 11,
                lineHeight: 1.35,
                color: isDarkMode ? '#d1d5db' : '#374151',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'normal',
              }} title={normalizedNotes || 'No first-call notes captured.'}>
                {normalizedNotes || 'No first-call notes captured.'}
              </div>
            </div>
          </div>
        ) : (
          <PipelineCell
            item={item}
            isDarkMode={isDarkMode}
            activeState={activeState}
            enrichmentData={enrichmentData}
            inlineWorkbenchItem={inlineWorkbenchItem}
            pipelineNeedsCarousel={pipelineNeedsCarousel}
            visiblePipelineChipCount={visiblePipelineChipCount}
            PIPELINE_CHIP_MIN_WIDTH_PX={PIPELINE_CHIP_MIN_WIDTH_PX}
            contactName={contactName}
            pocLower={pocLower}
            isFromInstructions={isFromInstructions}
            currentUserEmail={currentUserEmail}
            handlers={pipelineHandlers}
            dataDeps={pipelineCellDataDeps}
          />
        )}

        <ActionsCell
          item={item}
          isDarkMode={isDarkMode}
          areActionsEnabled={areActionsEnabled}
          mainShowClaimer={mainShowClaimer}
          isMainTeamInboxPoc={isMainTeamInboxPoc}
          hasNotes={isClaimableRow ? false : hasNotes}
          hasInlineWorkbench={hasInlineWorkbench}
          isNotesExpanded={isNotesExpanded}
          noteKey={noteKey}
          contactName={contactName}
          getRatingChipMeta={getRatingChipMeta}
          handleRate={actionHandlers.handleRate}
          isHovered={showRowDetails}
          handleDeleteEnquiry={actionHandlers.handleDeleteEnquiry}
          handleShareEnquiry={actionHandlers.handleShareEnquiry}
          setEditingEnquiry={actionHandlers.setEditingEnquiry}
          setShowEditModal={actionHandlers.setShowEditModal}
          setExpandedNotesInTable={setExpandedNotes}
        />
      </div>

      {isNotesExpanded && hasNotes && !isClaimableRow && (
        <div style={{
          gridColumn: '1 / -1',
          padding: '12px 60px 12px 32px',
          backgroundColor: isDarkMode ? 'rgba(12, 36, 62, 0.45)' : 'rgba(244, 244, 246, 0.72)',
          borderBottom: 'none',
          fontSize: '12px',
          lineHeight: '1.5',
          color: isDarkMode ? colours.dark.text : colours.light.text,
          whiteSpace: 'pre-line',
        }}>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
            marginBottom: '8px',
          }}>
            Notes
          </div>
          {normalizedNotes}
        </div>
      )}
    </React.Fragment>
  );
};

const getRowDayKey = (item: Enquiry): string => {
  const dateValue = (item.Touchpoint_Date || (item as any).datetime || (item as any).claim || item.Date_Created || '') as string;
  if (!dateValue) return '';
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
};

const areRowPropsEqual = (prev: ProspectTableRowProps, next: ProspectTableRowProps): boolean => {
  if (prev.item !== next.item) return false;
  if (prev.idx !== next.idx) return false;
  if (prev.nextDateStr !== next.nextDateStr) return false;
  if (prev.pipelineHandlers !== next.pipelineHandlers) return false;
  if (prev.actionHandlers !== next.actionHandlers) return false;
  if (prev.hoverHandlers !== next.hoverHandlers) return false;
  if (prev.dataDeps !== next.dataDeps) return false;

  const prevDisplay = prev.displayState;
  const nextDisplay = next.displayState;
  if (prevDisplay.isDarkMode !== nextDisplay.isDarkMode) return false;
  if (prevDisplay.activeState !== nextDisplay.activeState) return false;
  if (prevDisplay.areActionsEnabled !== nextDisplay.areActionsEnabled) return false;
  if (prevDisplay.pipelineNeedsCarousel !== nextDisplay.pipelineNeedsCarousel) return false;
  if (prevDisplay.visiblePipelineChipCount !== nextDisplay.visiblePipelineChipCount) return false;
  if (prevDisplay.PIPELINE_CHIP_MIN_WIDTH_PX !== nextDisplay.PIPELINE_CHIP_MIN_WIDTH_PX) return false;
  if (prevDisplay.currentUserEmail !== nextDisplay.currentUserEmail) return false;

  const rowKey = buildEnquiryIdentityKey(prev.item);
  const dayKey = getRowDayKey(prev.item);
  const noteKey = rowKey;
  const nameCopyKey = `name-${noteKey}`;
  const prevShowRowDetails = prevDisplay.hoveredRowKey === rowKey || prevDisplay.hoveredDayKey === dayKey;
  const nextShowRowDetails = nextDisplay.hoveredRowKey === rowKey || nextDisplay.hoveredDayKey === dayKey;
  if (prevShowRowDetails !== nextShowRowDetails) return false;
  const prevHoverReady = prevDisplay.hoveredRowKeyReady === rowKey || prevDisplay.hoveredDayKeyReady === dayKey;
  const nextHoverReady = nextDisplay.hoveredRowKeyReady === rowKey || nextDisplay.hoveredDayKeyReady === dayKey;
  if (prevHoverReady !== nextHoverReady) return false;
  const prevNotesExpanded = prevDisplay.expandedNotesInTable.has(noteKey);
  const nextNotesExpanded = nextDisplay.expandedNotesInTable.has(noteKey);
  if (prevNotesExpanded !== nextNotesExpanded) return false;
  const prevIsCopied = prevDisplay.copiedNameKey === nameCopyKey;
  const nextIsCopied = nextDisplay.copiedNameKey === nameCopyKey;
  if (prevIsCopied !== nextIsCopied) return false;

  return true;
};

export default React.memo(ProspectTableRow, areRowPropsEqual);
