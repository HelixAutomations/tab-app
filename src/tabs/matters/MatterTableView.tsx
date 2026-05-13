import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { colours, withAlpha } from '../../app/styles/colours';
import { NormalizedMatter } from '../../app/functionality/types';
import {
  formatFullDateTime,
  getAreaOfWorkIcon,
  getAreaOfWorkLineColor,
  getStackedDateDisplay,
} from '../enquiries/components/prospectDisplayUtils';
import '../../app/styles/Prospects.css';
import clioIcon from '../../assets/clio.svg';

interface MatterTableViewProps {
  matters: NormalizedMatter[];
  isDarkMode: boolean;
  showCclColumns?: boolean;
  cclStatusByMatterId?: Map<string, { stage: string; label: string }>;
  onRowClick?: (matter: NormalizedMatter) => void;
  /**
   * Invoked when the CCL status pill is clicked for a matter whose CCL is
   * in an actionable stage (draft/generated/reviewed). Consumers typically
   * wire this to dispatch the `openHomeCclReview` CustomEvent so the review
   * modal opens on the target matter. When omitted the pill stays visual-only.
   */
  onOpenCclReview?: (matterId: string) => void;
  loading?: boolean;
  arrivalTrackingKey?: string;
  suppressArrivalAnimations?: boolean;
}

type SortColumn = 'openDate' | 'matterRef' | 'clientName' | 'practiceArea' | 'feeEarner' | 'description';
type SortDirection = 'asc' | 'desc';

export function getMatterGridTemplateColumns(showCclColumns: boolean): string {
  const baseColumns = [
    'clamp(20px, 4vw, 36px)',                            // timeline
    'minmax(clamp(28px, 5vw, 60px), 0.45fr)',             // date
    'minmax(clamp(110px, 18vw, 240px), 1.6fr)',           // matter (ref + client stacked)
    'minmax(clamp(60px, 11vw, 124px), 0.9fr)',            // worktype
    'minmax(clamp(54px, 10vw, 96px), 0.72fr)',            // FE
  ];

  if (showCclColumns) {
    baseColumns.push(
      'minmax(clamp(72px, 12vw, 118px), 0.9fr)',          // CCL Status
      'minmax(clamp(58px, 10vw, 102px), 0.78fr)'          // CCL Date
    );
  }

  baseColumns.push('minmax(clamp(150px, 26vw, 420px), 2.6fr)'); // summary

  return baseColumns.join(' ');
}

interface MatterTableLoadingSkeletonProps {
  isDarkMode: boolean;
  showCclColumns?: boolean;
  variant?: 'blocking' | 'inline';
  exiting?: boolean;
  rowCount?: number;
}

export const MatterTableLoadingSkeleton: React.FC<MatterTableLoadingSkeletonProps> = ({
  isDarkMode,
  showCclColumns = false,
  variant = 'inline',
  exiting = false,
  rowCount,
}) => {
  const resolvedRowCount = rowCount ?? (variant === 'blocking' ? 8 : 6);
  const skeletonBase = isDarkMode ? withAlpha(colours.subtleGrey, 0.12) : withAlpha(colours.darkBlue, 0.06);
  const skeletonStrong = isDarkMode ? withAlpha(colours.subtleGrey, 0.22) : withAlpha(colours.darkBlue, 0.12);
  const lineColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.24) : withAlpha(colours.greyText, 0.18);
  const rowBorderColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.16) : withAlpha(colours.subtleGrey, 0.12);
  const blockBorder = isDarkMode ? withAlpha(colours.subtleGrey, 0.18) : withAlpha(colours.darkBlue, 0.08);
  const headerSurface = isDarkMode ? 'transparent' : colours.light.cardBackground;
  const gridTemplateColumns = getMatterGridTemplateColumns(showCclColumns);

  const block = (width: number | string, height: number, strong = false): React.CSSProperties => ({
    width,
    height,
    background: strong ? skeletonStrong : skeletonBase,
    border: `1px solid ${blockBorder}`,
  });

  // Real matter-row geometry (sampled from .prospect-row inside MatterTableView):
  //   col1 ~36px timeline strip
  //   col2 date stack: top "DD MMM" (11px bold) + bottom "HH:MM" (9px)
  //   col3 matter ref (12px link) + Clio chip (~52x16 with icon) + client name (10px) below
  //   col4 AOW glyph 17x17 + practice area text (12px)
  //   col5 FE rectangular badge (min 26 wide x 20 tall, monospace)
  //   col6/7 (CCL) status pill 72x22 + CCL date stack
  //   last  summary single line (11px) ~70-83% wide
  const aowAccents = [colours.blue, colours.orange, colours.green, colours.yellow, colours.greyText, colours.blue];
  const matterRefWidths = [56, 64, 48, 60, 52, 68, 56, 50];
  const clientWidths = ['72%', '64%', '58%', '76%', '61%', '69%', '66%', '54%'];
  const worktypeWidths = ['58%', '46%', '62%', '54%', '48%', '60%', '52%', '44%'];
  const summaryPrimaryWidths = ['78%', '64%', '71%', '83%', '68%', '75%', '62%', '70%'];
  const dateTopWidths = [30, 28, 32, 26, 30, 28, 32, 26];
  const dateBottomWidths = [22, 24, 22, 26, 22, 24, 22, 26];

  return (
    <div
      className="matter-table-skeleton"
      style={{
        '--matter-skeleton-grid': gridTemplateColumns,
        '--matter-skeleton-base': skeletonBase,
        '--matter-skeleton-strong': skeletonStrong,
        '--matter-skeleton-line': lineColor,
        '--matter-skeleton-row-border': rowBorderColor,
        '--matter-skeleton-block-border': blockBorder,
        padding: 0,
      } as React.CSSProperties}
      data-variant={variant}
      data-exiting={exiting ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div
        className="matter-table-skeleton__header"
        style={{
          background: headerSurface,
          borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}`,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        <div className="matter-table-skeleton__head-cell matter-table-skeleton__head-cell--center">
          <div className="matter-table-skeleton__line-head" />
        </div>
        <div className="matter-table-skeleton__head-cell">
          <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(30, 8)} />
        </div>
        <div className="matter-table-skeleton__head-cell">
          <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(44, 8)} />
        </div>
        <div className="matter-table-skeleton__head-cell">
          <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(52, 8)} />
        </div>
        <div className="matter-table-skeleton__head-cell matter-table-skeleton__head-cell--center">
          <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(22, 8)} />
        </div>
        {showCclColumns && (
          <div className="matter-table-skeleton__head-cell">
            <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(54, 8)} />
          </div>
        )}
        {showCclColumns && (
          <div className="matter-table-skeleton__head-cell">
            <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(42, 8)} />
          </div>
        )}
        <div className="matter-table-skeleton__head-cell">
          <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(56, 8)} />
        </div>
      </div>

      {Array.from({ length: resolvedRowCount }, (_, idx) => {
        const rowDelay = idx * 0.05;
        const aowColor = aowAccents[idx % aowAccents.length];
        return (
          <div
            key={`${variant}-matter-skel-${idx}`}
            className="matter-table-skeleton__row"
            style={{
              borderBottom: `0.5px solid ${rowBorderColor}`,
              '--matter-skeleton-row-opacity': Math.max(0.56, 1 - idx * 0.07),
              '--matter-skeleton-row-delay': `${rowDelay}s`,
              padding: '5px 14px',
            } as React.CSSProperties}
          >
            {/* Col 1: Timeline strip */}
            <div className="matter-table-skeleton__timeline">
              <div className="matter-table-skeleton__timeline-line" style={{ opacity: 0.72 + (idx % 3) * 0.08 }} />
            </div>

            {/* Col 2: Date stack */}
            <div className="matter-table-skeleton__date">
              <div className="matter-table-skeleton__block matter-table-skeleton__block--strong" style={block(dateTopWidths[idx % dateTopWidths.length], 11, true)} />
              <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(dateBottomWidths[idx % dateBottomWidths.length], 9)} />
            </div>

            {/* Col 3: Matter ref + Clio chip on top, client name below */}
            <div className="matter-table-skeleton__matter">
              <div className="matter-table-skeleton__matter-head">
                <div className="matter-table-skeleton__block matter-table-skeleton__block--strong" style={block(matterRefWidths[idx % matterRefWidths.length], 12, true)} />
                <div
                  className="matter-table-skeleton__clio-chip"
                  style={{
                    border: `1px solid ${withAlpha(colours.highlight, isDarkMode ? 0.28 : 0.22)}`,
                    background: withAlpha(colours.highlight, isDarkMode ? 0.10 : 0.06),
                  }}
                />
              </div>
              <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(clientWidths[idx % clientWidths.length], 9)} />
            </div>

            {/* Col 4: AOW glyph 17x17 + practice area text */}
            <div className="matter-table-skeleton__worktype">
              <div
                className="matter-table-skeleton__aow-glyph"
                style={{
                  background: withAlpha(aowColor, isDarkMode ? 0.20 : 0.16),
                  border: `1px solid ${withAlpha(aowColor, isDarkMode ? 0.45 : 0.32)}`,
                }}
              />
              <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(worktypeWidths[idx % worktypeWidths.length], 10)} />
            </div>

            {/* Col 5: Fee earner badge (rectangle 26+ x 20) */}
            <div className="matter-table-skeleton__fee">
              <div
                className="matter-table-skeleton__fe-badge"
                style={{
                  border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(160, 160, 160, 0.22)'}`,
                  background: 'transparent',
                }}
              />
            </div>

            {showCclColumns && (
              <div className="matter-table-skeleton__ccl">
                <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(72, 22)} />
              </div>
            )}

            {showCclColumns && (
              <div className="matter-table-skeleton__date">
                <div className="matter-table-skeleton__block matter-table-skeleton__block--strong" style={block(idx % 2 === 0 ? 24 : 20, 11, true)} />
                <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(idx % 2 === 0 ? 28 : 24, 9)} />
              </div>
            )}

            {/* Last col: Summary single line */}
            <div className="matter-table-skeleton__summary">
              <div className="matter-table-skeleton__block matter-table-skeleton__block--base" style={block(summaryPrimaryWidths[idx % summaryPrimaryWidths.length], 11)} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

function getPersonInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '--';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

// 2026-04-24+: subtle "just-arrived" highlight for matters that appear via
// realtime refresh while the operator is already looking at the SAME table.
// First render, scope/search/user/view switches and other dataset reshapes
// are reseeded silently; only true live insertions get the pulse.
const JUST_ARRIVED_CLASS = 'prospect-row--new-arrival';
const JUST_ARRIVED_DURATION_MS = 1800;
const MAX_JUST_ARRIVED_COUNT = 3;

const MatterTableView: React.FC<MatterTableViewProps> = ({
  matters,
  isDarkMode,
  showCclColumns = false,
  cclStatusByMatterId,
  onRowClick,
  onOpenCclReview,
  loading = false,
  arrivalTrackingKey = 'default',
  suppressArrivalAnimations = false,
}) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('openDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Track ids we've already rendered so we can highlight any new ones the
  // server pushed in via SSE. seedRef guards the very first render so we
  // don't flash every row when the table mounts. `arrivalTrackingKey`
  // reseeds silently whenever the visible dataset identity changes.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const lastArrivalTrackingKeyRef = useRef<string>(arrivalTrackingKey);
  const [justArrivedIds, setJustArrivedIds] = useState<Set<string>>(() => new Set());
  const arrivalTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const shouldSuppressArrivalAnimations = loading || suppressArrivalAnimations;
    const clearArrivalPulseState = () => {
      arrivalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      arrivalTimersRef.current.clear();
      setJustArrivedIds((prev) => (prev.size === 0 ? prev : new Set()));
    };

    if (!matters || matters.length === 0) {
      lastArrivalTrackingKeyRef.current = arrivalTrackingKey;
      seenIdsRef.current = new Set();
      seededRef.current = false;
      clearArrivalPulseState();
      return;
    }

    const currentIds = new Set<string>();
    for (const m of matters) {
      const id = m.matterId || m.displayNumber || '';
      if (id) currentIds.add(id);
    }

    if (lastArrivalTrackingKeyRef.current !== arrivalTrackingKey) {
      lastArrivalTrackingKeyRef.current = arrivalTrackingKey;
      seenIdsRef.current = currentIds;
      seededRef.current = true;
      clearArrivalPulseState();
      return;
    }

    if (shouldSuppressArrivalAnimations) {
      seenIdsRef.current = currentIds;
      seededRef.current = true;
      clearArrivalPulseState();
      return;
    }

    if (!seededRef.current) {
      seenIdsRef.current = currentIds;
      seededRef.current = true;
      return;
    }

    const newcomers: string[] = [];
    currentIds.forEach((id) => {
      if (!seenIdsRef.current.has(id)) newcomers.push(id);
    });
    seenIdsRef.current = currentIds;
    if (newcomers.length === 0) return;
    if (newcomers.length > MAX_JUST_ARRIVED_COUNT) {
      clearArrivalPulseState();
      return;
    }
    setJustArrivedIds((prev) => {
      const next = new Set(prev);
      newcomers.forEach((id) => next.add(id));
      return next;
    });
    newcomers.forEach((id) => {
      const existing = arrivalTimersRef.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        arrivalTimersRef.current.delete(id);
        setJustArrivedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, JUST_ARRIVED_DURATION_MS);
      arrivalTimersRef.current.set(id, timer);
    });
  }, [arrivalTrackingKey, loading, matters, suppressArrivalAnimations]);

  useEffect(() => () => {
    arrivalTimersRef.current.forEach((t) => window.clearTimeout(t));
    arrivalTimersRef.current.clear();
  }, []);

  const sortedMatters = useMemo(() => {
    const next = [...matters];

    const getSortValue = (matter: NormalizedMatter): string | number => {
      switch (sortColumn) {
        case 'openDate': {
          if (!matter.openDate) return 0;
          const parsed = Date.parse(matter.openDate);
          return Number.isNaN(parsed) ? 0 : parsed;
        }
        case 'matterRef':
          return (matter.displayNumber || matter.matterId || '').toLowerCase();
        case 'clientName':
          return (matter.clientName || '').toLowerCase();
        case 'practiceArea':
          return (matter.practiceArea || '').toLowerCase();
        case 'feeEarner':
          return (matter.responsibleSolicitor || '').toLowerCase();
        case 'description':
          return `${matter.description || ''} ${matter.practiceArea || ''} ${matter.responsibleSolicitor || ''}`.toLowerCase();
        default: {
          return (matter.displayNumber || matter.matterId || '').toLowerCase();
        }
      }
    };

    next.sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      if (leftValue === rightValue) {
        return 0;
      }
      if (sortDirection === 'asc') {
        return leftValue > rightValue ? 1 : -1;
      }
      return leftValue < rightValue ? 1 : -1;
    });

    return next;
  }, [matters, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortColumn(column);
    setSortDirection(column === 'openDate' ? 'desc' : 'asc');
  };

  const renderSortIndicator = (column: SortColumn) => {
    const isActive = sortColumn === column;
    return (
      <Icon
        iconName={isActive ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'}
        styles={{
          root: {
            fontSize: 8,
            marginLeft: 4,
            opacity: isActive ? 1 : 0.35,
            color: isActive
              ? colours.highlight
              : (isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`),
            transition: 'opacity 0.15s ease',
          },
        }}
      />
    );
  };

  const headerTextColor = isDarkMode ? colours.dark.text : colours.light.text;
  const headerSurface = isDarkMode ? colours.darkBlue : colours.light.cardBackground;
  const rowBorder = isDarkMode ? 'rgba(var(--subtle-grey-rgb), 0.18)' : 'rgba(var(--subtle-grey-rgb), 0.12)';
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const mutedText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const gridTemplateColumns = useMemo(() => getMatterGridTemplateColumns(showCclColumns), [showCclColumns]);

  if (loading && matters.length === 0) {
    return <MatterTableLoadingSkeleton isDarkMode={isDarkMode} showCclColumns={showCclColumns} variant="inline" />;
  }

  if (matters.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          color: mutedText,
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        <Icon iconName="StatusCircleQuestionMark" style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>No matters found</div>
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: isDarkMode ? colours.dark.background : colours.grey,
        overflow: 'hidden',
        fontFamily: 'Raleway, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        className="prospect-table-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'grid',
          gridTemplateColumns,
          gap: 4,
          padding: '0 14px',
          height: 40,
          boxSizing: 'border-box',
          alignItems: 'center',
          flexShrink: 0,
          background: headerSurface,
          backdropFilter: 'none',
          borderTop: 'none',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.24)' : 'rgba(13, 47, 96, 0.06)'}`,
          fontSize: '11px',
          fontWeight: 600,
          color: headerTextColor,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          lineHeight: 1.05,
          boxShadow: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Timeline">
          <div style={{
            width: 1,
            height: 14,
            background: isDarkMode ? colours.accent : colours.highlight,
            opacity: 0.45,
            borderRadius: 0,
          }} />
        </div>

        <SortableHeader label="Date" column="openDate" onClick={handleSort} renderSortIndicator={renderSortIndicator} />
        <SortableHeader label="Matter" column="matterRef" onClick={handleSort} renderSortIndicator={renderSortIndicator} />
        <SortableHeader label="Worktype" column="practiceArea" onClick={handleSort} renderSortIndicator={renderSortIndicator} />
        <SortableHeader label="FE" column="feeEarner" onClick={handleSort} renderSortIndicator={renderSortIndicator} />
        {showCclColumns && <HeaderLabel label="CCL Status" />}
        {showCclColumns && <HeaderLabel label="CCL Date" />}
        <SortableHeader label="Summary" column="description" onClick={handleSort} renderSortIndicator={renderSortIndicator} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'transparent',
        }}
      >
        {sortedMatters.map((matter, idx) => {
          const { top, bottom } = getStackedDateDisplay(matter.openDate || null);
          const clientName = matter.clientName || 'Unknown client';
          const matterLabel = matter.displayNumber || matter.matterId || 'Unknown matter';
          const description = matter.description || 'No description';
          const originatingInitials = getPersonInitials(matter.originatingSolicitor || '');
          const responsibleInitials = getPersonInitials(matter.responsibleSolicitor || '');
          const cclDateDisplay = getStackedDateDisplay(matter.cclDate || null);
          const cclStatusSummary = matter.matterId
            ? cclStatusByMatterId?.get(matter.matterId)
            : undefined;
          const cclStatusStage = (cclStatusSummary?.stage || (matter.cclDate ? 'sent' : 'pending')).toLowerCase();
          const cclStatus = cclStatusSummary?.label || (matter.cclDate ? 'Sent' : 'Pending');
          const showResponsibleSplit = Boolean(
            matter.responsibleSolicitor &&
            matter.originatingSolicitor &&
            originatingInitials !== responsibleInitials
          );
          const feeTooltip = showResponsibleSplit
            ? `Originating: ${matter.originatingSolicitor || 'Unassigned'}\nResponsible: ${matter.responsibleSolicitor || 'Unassigned'}`
            : (matter.originatingSolicitor || matter.responsibleSolicitor || 'Unassigned');

          return (
            <div
              key={`${matter.matterId}-${matter.displayNumber}-${matter.clientId}`}
              className={`prospect-row${justArrivedIds.has(matter.matterId || matter.displayNumber || '') ? ` ${JUST_ARRIVED_CLASS}` : ''}`}
              data-row-parity={idx % 2 === 0 ? 'even' : 'odd'}
              onClick={() => onRowClick?.(matter)}
              style={{
                gridTemplateColumns,
                padding: '5px 14px',
                borderBottom: `0.5px solid ${rowBorder}`,
                '--row-index': Math.min(idx, 15),
              } as React.CSSProperties}
            >
              <div className="prospect-timeline-cell">
                <div
                  className="prospect-timeline-cell__line"
                  style={{
                    background: getAreaOfWorkLineColor(matter.practiceArea || '', isDarkMode, false),
                    opacity: 0.9,
                  }}
                />
              </div>

              <TooltipHost
                content={formatFullDateTime(matter.openDate || null)}
                styles={{ root: { display: 'flex', alignItems: 'center', height: '100%', paddingInline: 2 } }}
                calloutProps={{ gapSpace: 6 }}
              >
                <div className="prospect-date">
                  <span className="prospect-date__top">{top}</span>
                  <span className="prospect-date__bottom">{bottom}</span>
                </div>
              </TooltipHost>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: 2,
                  lineHeight: 1.3,
                  minWidth: 0,
                  paddingInline: 2,
                }}
              >
                {matter.matterId ? (
                  <a
                    href={`https://eu.app.clio.com/nc/#/matters/${matter.matterId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignSelf: 'stretch',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      width: '100%',
                      minWidth: 0,
                      color: colours.highlight,
                      textDecoration: 'none',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.2,
                    }}
                    title="Open matter in Clio"
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{matterLabel}</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        minHeight: 16,
                        padding: '0 4px',
                        border: `1px solid ${withAlpha(colours.highlight, isDarkMode ? 0.28 : 0.18)}` ,
                        background: withAlpha(colours.highlight, isDarkMode ? 0.1 : 0.06),
                        color: isDarkMode ? `${colours.subtleGrey}d9` : `${colours.greyText}d9`,
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={clioIcon}
                        alt=""
                        style={{ width: 9, height: 9, opacity: 0.72, flexShrink: 0, filter: isDarkMode ? 'brightness(0) invert(1)' : undefined }}
                      />
                      <span>Clio</span>
                      <Icon iconName="NavigateExternalInline" style={{ fontSize: 9, opacity: 0.7 }} />
                    </span>
                  </a>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {matterLabel}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: bodyText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.15,
                    maxWidth: '100%',
                  }}
                >
                  {clientName}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 }} title={matter.practiceArea || 'Unspecified'}>
                  {getAreaOfWorkIcon(matter.practiceArea || 'Unspecified')}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: bodyText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {matter.practiceArea || 'No area'}
                </span>
              </div>

              <TooltipHost
                content={feeTooltip}
                styles={{ root: { display: 'flex', alignItems: 'center', minWidth: 0 } }}
                calloutProps={{ gapSpace: 6 }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 26,
                    height: 20,
                    padding: '0 4px',
                    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(160, 160, 160, 0.22)'}`,
                    background: 'transparent',
                    color: mutedText,
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 12,
                      textAlign: 'center',
                      color: bodyText,
                    }}
                  >
                    {originatingInitials}
                  </span>
                  {showResponsibleSplit && (
                    <>
                      <span style={{ color: mutedText, opacity: 0.6 }}>/</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 12,
                          textAlign: 'center',
                          color: mutedText,
                        }}
                      >
                        {responsibleInitials}
                      </span>
                    </>
                  )}
                </div>
              </TooltipHost>

              {showCclColumns && (
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  {(() => {
                    const pillBorder = `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(160, 160, 160, 0.22)'}`;
                    const pillBackground = cclStatusStage === 'sent'
                      ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.1)')
                      : cclStatusStage === 'generated' || cclStatusStage === 'reviewed'
                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(214, 232, 255, 0.95)')
                        : 'transparent';
                    const pillColor = cclStatusStage === 'sent'
                      ? colours.green
                      : cclStatusStage === 'generated' || cclStatusStage === 'reviewed'
                        ? colours.highlight
                        : mutedText;
                    const pillTitle = cclStatusStage === 'sent'
                      ? `Tracked ${formatFullDateTime(matter.cclDate || null)}`
                      : cclStatusStage === 'reviewed'
                        ? 'Generated and reviewed'
                        : cclStatusStage === 'generated'
                          ? 'Generated and awaiting review'
                          : 'Not started yet';
                    // Actionable when a draft exists OR after review; `sent` reopens
                    // the sealed view. `pending` is not clickable ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â nothing to open.
                    const canOpenReview = !!onOpenCclReview && !!matter.matterId
                      && (cclStatusStage === 'draft'
                        || cclStatusStage === 'generated'
                        || cclStatusStage === 'reviewed'
                        || cclStatusStage === 'sent');
                    const pillSharedStyle: React.CSSProperties = {
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 72,
                      height: 22,
                      padding: '0 8px',
                      border: pillBorder,
                      background: pillBackground,
                      color: pillColor,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    };
                    if (canOpenReview) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (matter.matterId) onOpenCclReview!(matter.matterId);
                          }}
                          title={`${pillTitle} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â click to open review`}
                          style={{
                            ...pillSharedStyle,
                            cursor: 'pointer',
                            borderRadius: 0,
                            fontFamily: 'inherit',
                          }}
                        >
                          {cclStatus}
                        </button>
                      );
                    }
                    return (
                      <span style={pillSharedStyle} title={pillTitle}>
                        {cclStatus}
                      </span>
                    );
                  })()}
                </div>
              )}

              {showCclColumns && (
                <TooltipHost
                  content={formatFullDateTime(matter.cclDate || null)}
                  styles={{ root: { display: 'flex', alignItems: 'center', height: '100%', paddingInline: 2 } }}
                  calloutProps={{ gapSpace: 6 }}
                >
                  <div className="prospect-date" style={{ opacity: matter.cclDate ? 1 : 0.55 }}>
                    <span className="prospect-date__top">{cclDateDisplay.top}</span>
                    <span className="prospect-date__bottom">{cclDateDisplay.bottom}</span>
                  </div>
                </TooltipHost>
              )}

              <div style={{ minWidth: 0, paddingInline: 2 }}>
                <span
                  title={description}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: 11,
                    lineHeight: 1.2,
                    color: bodyText,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HeaderLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <span
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        letterSpacing: 'inherit',
        lineHeight: 1.05,
      }}
    >
      {label}
    </span>
  );
};

const SortableHeader: React.FC<{
  label: string;
  column: SortColumn;
  onClick: (column: SortColumn) => void;
  renderSortIndicator: (column: SortColumn) => React.ReactNode;
}> = ({ label, column, onClick, renderSortIndicator }) => {
  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        padding: 0,
        color: 'inherit',
        textTransform: 'inherit',
        font: 'inherit',
        lineHeight: 1.05,
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          lineHeight: 1.05,
        }}
      >
        {label}
      </span>
      {renderSortIndicator(column)}
    </button>
  );
};

export default MatterTableView;
