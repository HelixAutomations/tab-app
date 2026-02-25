/**
 * ProspectTableHeader — sticky header row for the prospects table.
 *
 * Contains sortable column headers (Date, AOW, ID/Value, Prospect)
 * and tri-state pipeline filter chips (POC, Pitch, Inst, EID, Pay, Risk, Matter).
 *
 * Migrated from Enquiries.tsx lines ~6920-7616.
 */
import React, { useCallback } from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import type {
  EnquiryPipelineStage,
  EnquiryPipelineStatus,
  PipelineChipLabelMode,
} from './pipeline/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortColumn = 'date' | 'aow' | 'id' | 'value' | 'contact' | 'pipeline' | null;
export type SortDirection = 'asc' | 'desc';

interface PocOption {
  email: string;
  label: string;
}

export interface ProspectTableHeaderProps {
  isDarkMode: boolean;

  // Grid layout
  gridTemplateColumns: string;
  gridGapPx: number;

  // Sort state
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSortClick: (column: SortColumn) => void;

  // Pipeline filters
  enquiryPipelineFilters: Map<EnquiryPipelineStage, EnquiryPipelineStatus>;
  onCyclePipelineFilter: (stage: EnquiryPipelineStage) => void;
  onClearAllFilters: () => void;

  // POC filter
  selectedPocFilter: string | null;
  onSelectPocFilter: (email: string | null) => void;
  isPocDropdownOpen: boolean;
  onTogglePocDropdown: () => void;
  pocOptions: PocOption[];
  currentUserEmail: string;
  currentUserInitials: string;
  showMineOnly: boolean;
  activeState: string; // 'Claimed' | 'Claimable' | 'Triaged' | ''

  // Pipeline carousel
  pipelineNeedsCarousel: boolean;
  visiblePipelineChipCount: number;
  pipelineChipMinWidthPx: number;
  pipelineScrollOffset: number;
  onAdvancePipelineScroll: () => void;

  // Actions
  areActionsEnabled: boolean;
  onToggleActions: () => void;

  // Measurement
  pipelineGridMeasureRef: React.RefObject<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Sub-component: Sortable column header label
// ---------------------------------------------------------------------------

const SortableLabel: React.FC<{
  label: string;
  column: SortColumn;
  currentSort: SortColumn;
  currentDirection: SortDirection;
  isDarkMode: boolean;
  onClick: (col: SortColumn) => void;
  style?: React.CSSProperties;
}> = ({ label, column, currentSort, currentDirection, isDarkMode, onClick, style }) => {
  const isActive = currentSort === column;
  const activeColor = isDarkMode ? colours.accent : colours.highlight;

  return (
    <div
      onClick={() => onClick(column)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'color 0.15s ease',
        color: isActive ? activeColor : undefined,
        ...style,
      }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <Icon
        iconName={
          isActive
            ? currentDirection === 'asc'
              ? 'ChevronUpSmall'
              : 'ChevronDownSmall'
            : 'ChevronDownSmall'
        }
        styles={{
          root: {
            fontSize: 8,
            marginLeft: 4,
            opacity: isActive ? 1 : 0.35,
            color: isActive
              ? activeColor
              : isDarkMode
                ? `${colours.subtleGrey}99`
                : `${colours.greyText}99`,
            transition: 'opacity 0.15s ease',
          },
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Pipeline filter button (tri-state)
// ---------------------------------------------------------------------------

const PipelineFilterButton: React.FC<{
  stage: EnquiryPipelineStage;
  label: string;
  filterState: EnquiryPipelineStatus | null;
  isDarkMode: boolean;
  onCycle: (stage: EnquiryPipelineStage) => void;
}> = ({ stage, label, filterState, isDarkMode, onCycle }) => {
  const hasFilter = filterState !== null;
  const filterColor = !filterState
    ? (isDarkMode ? colours.accent : colours.highlight)
    : filterState === 'yes'
      ? colours.green
      : colours.cta;

  const stateLabel =
    filterState === 'yes'
      ? `Has ${label.toLowerCase()}`
      : filterState === 'no'
        ? `No ${label.toLowerCase()}`
        : null;
  const nextState = !filterState ? 'has' : filterState === 'yes' ? 'missing' : 'clear filter';

  return (
    <button
      type="button"
      title={
        hasFilter
          ? `Showing: ${stateLabel} · Click → ${nextState}`
          : `Filter by ${label} · Click to toggle`
      }
      onClick={(e) => {
        e.stopPropagation();
        onCycle(stage);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 22,
        width: '100%',
        padding: '0 6px',
        background: hasFilter
          ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
          : 'transparent',
        border: hasFilter
          ? `1px solid ${filterColor}40`
          : `1px solid ${isDarkMode ? 'rgba(160,160,160,0.18)' : 'rgba(100,116,139,0.14)'}`,
        borderRadius: 0,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        opacity: hasFilter ? 1 : 0.85,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: filterColor,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {hasFilter && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: filterColor,
            flexShrink: 0,
            boxShadow: `0 0 4px ${filterColor}80`,
          }}
        />
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ProspectTableHeader: React.FC<ProspectTableHeaderProps> = ({
  isDarkMode,
  gridTemplateColumns,
  gridGapPx,
  sortColumn,
  sortDirection,
  onSortClick,
  enquiryPipelineFilters,
  onCyclePipelineFilter,
  onClearAllFilters,
  selectedPocFilter,
  onSelectPocFilter,
  isPocDropdownOpen,
  onTogglePocDropdown,
  pocOptions,
  currentUserEmail,
  currentUserInitials,
  showMineOnly,
  activeState,
  pipelineNeedsCarousel,
  visiblePipelineChipCount,
  pipelineChipMinWidthPx,
  pipelineScrollOffset,
  onAdvancePipelineScroll,
  areActionsEnabled,
  onToggleActions,
  pipelineGridMeasureRef,
}) => {
  const headerOffset = pipelineScrollOffset;
  const headerVisibleEnd = headerOffset + visiblePipelineChipCount;
  const headerHasMore =
    pipelineNeedsCarousel && headerOffset < 7 - visiblePipelineChipCount;
  const headerIsVisible = useCallback(
    (idx: number) =>
      !pipelineNeedsCarousel || (idx >= headerOffset && idx < headerVisibleEnd),
    [pipelineNeedsCarousel, headerOffset, headerVisibleEnd],
  );

  const getFilterState = useCallback(
    (stage: EnquiryPipelineStage) => enquiryPipelineFilters.get(stage) ?? null,
    [enquiryPipelineFilters],
  );

  const hasAnyFilter = enquiryPipelineFilters.size > 0 || !!selectedPocFilter;
  const activeColor = isDarkMode ? colours.accent : colours.highlight;
  const neutralBorder = isDarkMode ? 'rgba(75, 85, 99, 0.42)' : 'rgba(160, 160, 160, 0.3)';
  const softSurface = isDarkMode ? 'rgba(8, 28, 48, 0.95)' : 'rgba(244, 244, 246, 0.98)';
  const elevatedSurface = isDarkMode ? 'rgba(12, 36, 62, 0.98)' : 'rgba(255, 255, 255, 0.98)';
  const headerNavBorder = isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(160, 160, 160, 0.28)';
  const headerNavIdleBg = isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(244, 244, 246, 0.9)';
  const headerNavActiveBg = isDarkMode ? 'rgba(135, 243, 243, 0.14)' : 'rgba(54, 144, 206, 0.1)';
  const headerMutedText = isDarkMode ? `${colours.subtleGrey}b3` : `${colours.greyText}99`;

  // POC column helpers
  const isFiltered = !!selectedPocFilter;
  const isFilteredToMe = selectedPocFilter?.toLowerCase() === currentUserEmail;
  const getFilteredInitials = () => {
    if (!selectedPocFilter) return 'POC';
    if (selectedPocFilter.toLowerCase() === currentUserEmail)
      return currentUserInitials;
    return (
      selectedPocFilter.split('@')[0]?.slice(0, 2).toUpperCase() || 'POC'
    );
  };

  // Pipeline stage definitions for the loop
  const filterStages: {
    stage: EnquiryPipelineStage;
    label: string;
    chipIndex: number;
  }[] = [
    { stage: 'pitched', label: 'PITCH', chipIndex: 1 },
    { stage: 'instructed', label: 'INSTRUCTION', chipIndex: 2 },
    { stage: 'idcheck', label: 'EID CHECK', chipIndex: 3 },
    { stage: 'paid', label: 'PAYMENT', chipIndex: 4 },
    { stage: 'risk', label: 'RISK', chipIndex: 5 },
    { stage: 'matter', label: 'MATTER', chipIndex: 6 },
  ];

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'grid',
        gridTemplateColumns,
        gap: `${gridGapPx}px`,
        padding: '0 16px',
        height: 44,
        boxSizing: 'border-box',
        alignItems: 'center',
        flexShrink: 0,
        background: softSurface,
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(160, 160, 160, 0.2)'}`,
        borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.7)' : 'rgba(160, 160, 160, 0.35)'}`,
        fontFamily: 'Raleway, "Segoe UI", sans-serif',
        fontSize: '11px',
        fontWeight: 600,
        color: activeColor,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        boxShadow: isDarkMode
          ? '0 2px 8px rgba(0, 0, 0, 0.3)'
          : '0 2px 8px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Timeline icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Timeline"
      >
        <Icon
          iconName="TimelineProgress"
          styles={{
            root: {
              fontSize: 12,
              color: activeColor,
              opacity: 0.7,
            },
          }}
        />
      </div>

      {/* Date */}
      <SortableLabel
        label="DATE"
        column="date"
        currentSort={sortColumn}
        currentDirection={sortDirection}
        isDarkMode={isDarkMode}
        onClick={onSortClick}
        style={{ paddingLeft: 0 }}
      />

      {/* AOW */}
      <SortableLabel
        label="AOW"
        column="aow"
        currentSort={sortColumn}
        currentDirection={sortDirection}
        isDarkMode={isDarkMode}
        onClick={onSortClick}
        style={{ justifyContent: 'center' }}
      />

      {/* ID / Value */}
      <SortableLabel
        label="ID / VALUE"
        column="id"
        currentSort={sortColumn}
        currentDirection={sortDirection}
        isDarkMode={isDarkMode}
        onClick={onSortClick}
      />

      {/* Prospect */}
      <SortableLabel
        label="PROSPECT"
        column="contact"
        currentSort={sortColumn}
        currentDirection={sortDirection}
        isDarkMode={isDarkMode}
        onClick={onSortClick}
        style={{ minWidth: 0, overflow: 'hidden' }}
      />

      {/* ─── Pipeline header + filter buttons ─── */}
      <div
        ref={pipelineGridMeasureRef as any}
        style={{
          position: 'relative',
          height: '100%',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: pipelineNeedsCarousel
              ? `repeat(${visiblePipelineChipCount}, minmax(${pipelineChipMinWidthPx}px, 1fr)) 24px`
              : `repeat(7, minmax(${pipelineChipMinWidthPx}px, 1fr)) 24px`,
            columnGap: 8,
            width: '100%',
            height: '100%',
            minWidth: 0,
            alignItems: 'center',
          }}
        >
          {/* ── POC / Claimer (chip 0) ── */}
          {headerIsVisible(0) && (
            activeState === 'Claimable' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: 22,
                  width: '100%',
                  padding: '0 8px',
                  background: 'transparent',
                  border: `1px solid ${neutralBorder}`,
                  borderRadius: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: activeColor,
                    textTransform: 'uppercase',
                  }}
                >
                  CLAIMER
                </span>
              </div>
            ) : !showMineOnly ? (
              /* Full team POC dropdown */
              <div style={{ position: 'relative', width: '100%' }}>
                <button
                  type="button"
                  title={
                    isFiltered
                      ? `Filtering by ${getFilteredInitials()} – Click to change`
                      : 'Filter by POC (click to select)'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePocDropdown();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    height: 22,
                    width: '100%',
                    padding: '0 8px',
                    background: isFiltered
                      ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                      : 'transparent',
                    border: isFiltered
                      ? `1px solid ${colours.highlight}40`
                      : `1px solid ${neutralBorder}`,
                    borderRadius: 0,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    opacity: isFiltered ? 1 : 0.85,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: activeColor,
                      textTransform: 'uppercase',
                    }}
                  >
                    CLAIMER
                  </span>
                  <Icon
                    iconName="ChevronDown"
                    styles={{ root: { fontSize: 8, color: activeColor, marginLeft: 1 } }}
                  />
                </button>

                {isPocDropdownOpen && (
                  <div
                    className="poc-filter-dropdown"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      minWidth: 200,
                      background: elevatedSurface,
                      border: `1px solid ${neutralBorder}`,
                      borderRadius: 4,
                      boxShadow: isDarkMode
                        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                        : '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      maxHeight: 260,
                      overflowY: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Clear option */}
                    <button
                      type="button"
                      onClick={() => onSelectPocFilter(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '8px 12px',
                        background: !selectedPocFilter
                          ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                          : 'transparent',
                        border: 'none',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(160, 160, 160, 0.15)'}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 11,
                        color: isDarkMode
                          ? 'rgba(255, 255, 255, 0.7)'
                          : 'rgba(0, 0, 0, 0.6)',
                      }}
                    >
                      <Icon iconName="Clear" styles={{ root: { fontSize: 10 } }} />
                      <span>All POC</span>
                    </button>

                    {pocOptions.map((opt) => {
                      const isSelected =
                        selectedPocFilter?.toLowerCase() === opt.email;
                      return (
                        <button
                          key={opt.email}
                          type="button"
                          onClick={() => onSelectPocFilter(opt.email)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 12px',
                            background: isSelected
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                              : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 11,
                            color: isSelected
                              ? (isDarkMode ? colours.accent : colours.highlight)
                              : isDarkMode
                                ? 'rgba(255, 255, 255, 0.8)'
                                : 'rgba(0, 0, 0, 0.7)',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {opt.label || opt.email}
                          </span>
                          {isSelected && (
                            <Icon
                              iconName="Accept"
                              styles={{
                                root: { fontSize: 10, marginLeft: 'auto' },
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Mine-only toggle */
              <button
                type="button"
                title={
                  isFilteredToMe
                    ? `Filtering by your POC (${currentUserInitials}) – Click to clear`
                    : `Filter by your POC (${currentUserInitials})`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPocFilter(isFilteredToMe ? null : currentUserEmail);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: 22,
                  width: '100%',
                  padding: '0 8px',
                  background: isFilteredToMe
                    ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                    : 'transparent',
                  border: isFilteredToMe
                    ? `1px solid ${colours.highlight}40`
                    : `1px solid ${isDarkMode ? 'rgba(160,160,160,0.18)' : 'rgba(100,116,139,0.14)'}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  opacity: isFilteredToMe ? 1 : 0.85,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isFilteredToMe
                      ? colours.highlight
                      : activeColor,
                    textTransform: 'uppercase',
                  }}
                >
                  CLAIMER
                </span>
              </button>
            )
          )}

          {/* ── Pipeline filter stages (1-6) ── */}
          {filterStages
            .filter(({ chipIndex }) => headerIsVisible(chipIndex))
            .map(({ stage, label }) => (
              <PipelineFilterButton
                key={stage}
                stage={stage}
                label={label}
                filterState={getFilterState(stage)}
                isDarkMode={isDarkMode}
                onCycle={onCyclePipelineFilter}
              />
            ))}

          {/* ── Carousel nav or clear filters gutter ── */}
          {pipelineNeedsCarousel ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdvancePipelineScroll();
              }}
              title={
                headerHasMore
                  ? `View more stages (${7 - headerVisibleEnd} hidden)`
                  : 'Back to start'
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: 22,
                padding: 0,
                border: `1px solid ${headerNavBorder}`,
                borderRadius: 0,
                background: headerHasMore
                  ? headerNavActiveBg
                  : headerNavIdleBg,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                color: headerHasMore
                  ? activeColor
                  : headerMutedText,
              }}
            >
              <Icon
                iconName={headerHasMore ? 'ChevronRight' : 'Refresh'}
                styles={{
                  root: {
                    fontSize: headerHasMore ? 12 : 10,
                    color: 'inherit',
                    opacity: headerHasMore ? 1 : 0.7,
                  },
                }}
              />
            </button>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hasAnyFilter && (
                <button
                  type="button"
                  title="Clear all pipeline filters"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearAllFilters();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    background: isDarkMode
                      ? 'rgba(214, 85, 65, 0.15)'
                      : 'rgba(214, 85, 65, 0.1)',
                    border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.4)' : 'rgba(214, 85, 65, 0.3)'}`,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      isDarkMode
                        ? 'rgba(214, 85, 65, 0.25)'
                        : 'rgba(214, 85, 65, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      isDarkMode
                        ? 'rgba(214, 85, 65, 0.15)'
                        : 'rgba(214, 85, 65, 0.1)';
                  }}
                >
                  <Icon
                    iconName="Cancel"
                    styles={{ root: { fontSize: 8, color: colours.cta } }}
                  />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Actions header ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          minWidth: 0,
          width: '100%',
        }}
      >
        <span>Actions</span>
        <button
          type="button"
          onClick={onToggleActions}
          title={
            areActionsEnabled
              ? 'Disable row actions to prevent edits/deletes'
              : 'Enable row actions to edit or delete enquiries'
          }
          style={{
            width: 24,
            height: 24,
            minWidth: 22,
            minHeight: 22,
            borderRadius: '999px',
            border: `1px solid ${
              areActionsEnabled
                ? `${activeColor}66`
                : (isDarkMode ? 'rgba(75, 85, 99, 0.6)' : 'rgba(160, 160, 160, 0.35)')
            }`,
            background: areActionsEnabled
              ? (isDarkMode ? 'rgba(135, 243, 243, 0.14)' : 'rgba(54, 144, 206, 0.1)')
              : (isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(244, 244, 246, 0.9)'),
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            padding: 0,
          }}
          aria-pressed={areActionsEnabled}
        >
          <Icon
            iconName={areActionsEnabled ? 'UnlockSolid' : 'LockSolid'}
            styles={{
              root: {
                fontSize: '11px',
                color: areActionsEnabled
                  ? activeColor
                  : isDarkMode
                    ? `${colours.subtleGrey}d9`
                    : `${colours.greyText}d9`,
              },
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default ProspectTableHeader;
