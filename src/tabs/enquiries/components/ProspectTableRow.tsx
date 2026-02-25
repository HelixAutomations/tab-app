/**
 * ProspectTableRow — renders a single enquiry row in the prospects table.
 *
 * Extracted from the ~1,400-line individual-row branch in Enquiries.tsx.
 * Composes: day separator, 7-column grid row (Timeline, Date, AOW, ID/Value,
 * Contact, PipelineCell, ActionsCell), and notes expansion.
 */

import React from 'react';
import { Icon, TooltipHost } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import PipelineCell from './PipelineCell';
import ActionsCell from './ActionsCell';
import {
  getAreaOfWorkIcon,
  getAreaOfWorkLineColor,
  getStackedDateDisplay,
  formatFullDateTime,
  formatDaySeparatorLabel,
  formatValueForDisplay,
  buildEnquiryIdentityKey,
} from './prospectDisplayUtils';
import type { Enquiry } from '../../../app/functionality/types';
import type { ProspectTableRowProps } from './rowTypes';

/** Grid template used by every row — must match ProspectTableHeader */
const TABLE_GRID_TEMPLATE_COLUMNS = '32px 90px 56px 90px 1.4fr 2.5fr 152px';
const ACTIONS_COLUMN_WIDTH_PX = 152;

const ProspectTableRow: React.FC<ProspectTableRowProps> = ({
  item,
  idx,
  isLast,
  displayedItems,
  isGroupedEnquiry,
  pipelineHandlers,
  actionHandlers,
  displayState,
  hoverHandlers,
  dataDeps,
}) => {
  const {
    isDarkMode,
    activeState,
    viewMode,
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
    collapsedDays,
  } = displayState;

  const { setHoveredRowKey, setHoveredDayKey, toggleDayCollapse } = hoverHandlers;
  const { handleSelectEnquiryToPitch, handleCopyName, setExpandedNotesInTable: setExpandedNotes } = actionHandlers;
  const { enrichmentMap, getEnquiryWorkbenchItem, isUnclaimedPoc, getRatingChipMeta, combineDateAndTime, claimerMap } = dataDeps;

  // ─── Derived row data ───────────────────────────────────────
  const pocLower = (item.Point_of_Contact || '').toLowerCase();
  const isUnclaimed = pocLower === 'team@helix-law.com';
  const contactName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unknown';
  const areaOfWork = item.Area_of_Work || 'Unspecified';
  const dateReceived = item.Touchpoint_Date || item.Date_Created || '';
  const rawValue: any = (item as any).Value ?? (item as any).value ?? '';
  const value = typeof rawValue === 'string' ? rawValue.replace(/^£\s*/, '').trim() : rawValue;
  const isFromInstructions = (item as any).source === 'instructions';
  const hasNotes = !!(item.Initial_first_call_notes && item.Initial_first_call_notes.trim().length > 0);
  const noteKey = buildEnquiryIdentityKey(item);
  const isNotesExpanded = expandedNotesInTable.has(noteKey);
  const nameCopyKey = `name-${noteKey}`;
  const isNameCopied = copiedNameKey === nameCopyKey;
  const inlineWorkbenchItem = getEnquiryWorkbenchItem(item);
  const hasInlineWorkbench = Boolean(inlineWorkbenchItem);
  const enrichmentDataKey = item.ID ?? (item as any).id ?? '';
  const enrichmentData = enrichmentDataKey ? enrichmentMap.get(String(enrichmentDataKey)) : undefined;
  const mainPocValue = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
  const isMainTeamInboxPoc = isUnclaimedPoc(mainPocValue);
  const mainShowClaimer = !!mainPocValue && activeState !== 'Triaged' && !isMainTeamInboxPoc;
  const accentColor = isDarkMode ? colours.accent : colours.highlight;

  // ─── Day separator logic ────────────────────────────────────
  const extractDateStr = (enq: any): string => {
    if (isGroupedEnquiry(enq)) return enq.latestDate || '';
    return (enq?.Touchpoint_Date || enq?.datetime || enq?.claim || enq?.Date_Created || '') as string;
  };
  const toDayKey = (s: string): string => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };
  const thisDateStr = extractDateStr(item as any);
  const prevItem: any = idx > 0 ? displayedItems[idx - 1] : null;
  const prevDateStr = prevItem ? extractDateStr(prevItem) : '';
  const showDaySeparator = viewMode === 'table' && (idx === 0 || toDayKey(thisDateStr) !== toDayKey(prevDateStr));
  const singleDayKey = toDayKey(thisDateStr);
  const nextItem: any = idx < displayedItems.length - 1 ? displayedItems[idx + 1] : null;
  const nextDateStr = nextItem ? extractDateStr(nextItem) : '';
  const isLastInDay = !nextItem || toDayKey(nextDateStr) !== singleDayKey;
  const isSingleDayCollapsed = collapsedDays.has(singleDayKey);
  const fullDateTooltip = formatFullDateTime(thisDateStr || dateReceived || null);
  const rowHoverKey = buildEnquiryIdentityKey(item);
  const showRowDetails = hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey;

  // Day count helper
  const dayCount = displayedItems.filter((enq) => {
    const enqDateStr = isGroupedEnquiry(enq)
      ? enq.latestDate
      : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
    return toDayKey(enqDateStr) === singleDayKey;
  }).length;

  return (
    <React.Fragment key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}>
      {/* ─── Day Separator ──────────────────────────────────── */}
      {showDaySeparator && (
        <div
          onClick={(e) => { e.stopPropagation(); toggleDayCollapse(singleDayKey); }}
          onMouseEnter={() => setHoveredDayKey(singleDayKey)}
          onMouseLeave={() => setHoveredDayKey((prev) => (prev === singleDayKey ? null : prev))}
          className="prospect-day-sep"
          style={{ gridTemplateColumns: `32px 1fr ${ACTIONS_COLUMN_WIDTH_PX}px` }}
        >
          <div className="prospect-day-sep__timeline">
            <div className="prospect-day-sep__line" />
            <div className="prospect-day-sep__dot" />
          </div>
          <div className="prospect-day-sep__label">
            <span className="prospect-day-sep__text">
              {formatDaySeparatorLabel(singleDayKey, hoveredDayKey === singleDayKey)}
            </span>
            <span className="prospect-day-sep__count">{dayCount}</span>
            <div className="prospect-day-sep__fade" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {isSingleDayCollapsed && (
              <Icon
                iconName="Hide3"
                styles={{
                  root: {
                    fontSize: 12,
                    color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`,
                  },
                }}
                title={`${dayCount} items hidden`}
              />
            )}
            <Icon
              iconName={isSingleDayCollapsed ? 'ChevronRight' : 'ChevronDown'}
              styles={{
                root: {
                  fontSize: 10,
                  color: isDarkMode ? `${colours.subtleGrey}73` : `${colours.greyText}66`,
                },
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Main Row ───────────────────────────────────────── */}
      {!isSingleDayCollapsed && (
        <div
          data-enquiry-id={item.ID ? String(item.ID) : undefined}
          data-row-parity={idx % 2 === 0 ? 'even' : 'odd'}
          style={{
            gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
            borderBottom: isLastInDay
              ? `1px solid ${isDarkMode ? 'rgba(55, 65, 81, 0.28)' : 'rgba(0, 0, 0, 0.06)'}`
              : 'none',
            opacity: 1,
          }}
          className={`prospect-row enquiry-row${(hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey) ? ' pipeline-row-hover' : ''}${(hoveredRowKeyReady === rowHoverKey || hoveredDayKeyReady === singleDayKey) ? ' pipeline-row-hover-ready' : ''}`}
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
          onClick={() => !isUnclaimed && handleSelectEnquiryToPitch(item)}
        >
          {/* Timeline cell */}
          <div className="prospect-timeline-cell">
            <div
              className="prospect-timeline-cell__line"
              style={{
                background: getAreaOfWorkLineColor(areaOfWork, isDarkMode, hoveredDayKey === singleDayKey),
                opacity: hoveredDayKey === singleDayKey ? 1 : 0.9,
              }}
            />
          </div>

          {/* Date column */}
          <TooltipHost
            content={fullDateTooltip}
            styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
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

          {/* Area of Work */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }} title={areaOfWork}>
              {getAreaOfWorkIcon(areaOfWork)}
            </span>
          </div>

          {/* ID / Value */}
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            lineHeight: 1.3,
            justifyContent: 'center',
          }}>
            <div style={{
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: '10px',
              fontWeight: 600,
              color: accentColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transform: showRowDetails ? 'translateY(-4px)' : 'translateY(0)',
              transition: 'transform 160ms ease',
            }}>
              {item.ID}
            </div>
            {(() => {
              const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : (typeof value === 'number' ? value : 0);
              const displayValue = formatValueForDisplay(value);
              if (!displayValue) return null;

              let textColor: string;
              if (numValue >= 50000) {
                textColor = accentColor;
              } else if (numValue >= 10000) {
                textColor = accentColor + 'bf';
              } else {
                textColor = accentColor + (isDarkMode ? '80' : '8c');
              }

              return (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: showRowDetails ? 1 : 0,
                  transform: showRowDetails ? 'translateY(4px)' : 'translateY(2px)',
                  transition: 'opacity 140ms ease, transform 160ms ease',
                  pointerEvents: 'none',
                }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: textColor,
                    whiteSpace: 'nowrap',
                  }}>
                    {displayValue}
                  </span>
                </div>
              );
            })()}
            {enrichmentData?.pitchData?.displayNumber && (
              <div style={{
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: '9px',
                color: isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}73`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {enrichmentData.pitchData.displayNumber}
              </div>
            )}
          </div>

          {/* Contact */}
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            lineHeight: 1.3,
            justifyContent: 'center',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transform: showRowDetails ? 'translateY(-4px)' : 'translateY(0)',
              transition: 'transform 160ms ease',
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              }}>
                {contactName}
              </span>
              <button
                type="button"
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
                  boxShadow: isNameCopied
                    ? `0 0 0 1px ${colours.green}26`
                    : 'none',
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

          {/* Pipeline */}
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
            handlers={pipelineHandlers}
            dataDeps={{
              claimerMap,
              isUnclaimedPoc,
              combineDateAndTime,
            }}
          />

          {/* Actions */}
          <ActionsCell
            item={item}
            isDarkMode={isDarkMode}
            areActionsEnabled={areActionsEnabled}
            mainShowClaimer={mainShowClaimer}
            isMainTeamInboxPoc={isMainTeamInboxPoc}
            hasNotes={hasNotes}
            hasInlineWorkbench={hasInlineWorkbench}
            isNotesExpanded={isNotesExpanded}
            noteKey={noteKey}
            contactName={contactName}
            getRatingChipMeta={getRatingChipMeta}
            handleRate={actionHandlers.handleRate}
            isHovered={showRowDetails}
            handleDeleteEnquiry={actionHandlers.handleDeleteEnquiry}
            setEditingEnquiry={actionHandlers.setEditingEnquiry}
            setShowEditModal={actionHandlers.setShowEditModal}
            setExpandedNotesInTable={setExpandedNotes}
          />
        </div>
      )}

      {/* ─── Notes Expansion ────────────────────────────────── */}
      {!isSingleDayCollapsed && isNotesExpanded && hasNotes && (
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
          {item.Initial_first_call_notes?.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}
        </div>
      )}
    </React.Fragment>
  );
};

export default React.memo(ProspectTableRow);
