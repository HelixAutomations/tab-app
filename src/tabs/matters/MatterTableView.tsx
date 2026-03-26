import React, { useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { colours } from '../../app/styles/colours';
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
  loading?: boolean;
}

type SortColumn = 'openDate' | 'matterRef' | 'clientName' | 'practiceArea' | 'feeEarner' | 'description';
type SortDirection = 'asc' | 'desc';

function getMatterGridTemplateColumns(showCclColumns: boolean): string {
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

const MatterTableView: React.FC<MatterTableViewProps> = ({
  matters,
  isDarkMode,
  showCclColumns = false,
  cclStatusByMatterId,
  onRowClick,
  loading = false,
}) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('openDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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
  const rowBorder = isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(160, 160, 160, 0.12)';
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const mutedText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const gridTemplateColumns = useMemo(() => getMatterGridTemplateColumns(showCclColumns), [showCclColumns]);

  if (loading && matters.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          color: mutedText,
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        Loading matters...
      </div>
    );
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
          height: 44,
          boxSizing: 'border-box',
          alignItems: 'center',
          flexShrink: 0,
          background: headerSurface,
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
          fontSize: '11px',
          fontWeight: 500,
          color: headerTextColor,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          boxShadow: isDarkMode
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
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
              className="prospect-row"
              data-row-parity={idx % 2 === 0 ? 'even' : 'odd'}
              onClick={() => onRowClick?.(matter)}
              style={{
                gridTemplateColumns,
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                {matter.matterId ? (
                  <a
                    href={`https://eu.app.clio.com/nc/#/matters/${matter.matterId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      minWidth: 0,
                      color: isDarkMode ? colours.accent : colours.highlight,
                      textDecoration: 'none',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                    title="Open matter in Clio"
                  >
                    <img src={clioIcon} alt="" style={{ width: 12, height: 12, opacity: 0.75, flexShrink: 0, filter: isDarkMode ? 'brightness(0) invert(1)' : undefined }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matterLabel}</span>
                  </a>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {matterLabel}
                  </span>
                )}
                {matter.clientId ? (
                  <a
                    href={`https://eu.app.clio.com/nc/#/contacts/${matter.clientId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      color: bodyText,
                      textDecoration: 'none',
                      fontSize: 11,
                      fontWeight: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}
                    title="Open client in Clio"
                  >
                    {clientName}
                  </a>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 400, color: bodyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                    {clientName}
                  </span>
                )}
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
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 72,
                      height: 22,
                      padding: '0 8px',
                      border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(160, 160, 160, 0.22)'}`,
                      background: cclStatusStage === 'sent'
                        ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.1)')
                        : cclStatusStage === 'generated' || cclStatusStage === 'reviewed'
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(214, 232, 255, 0.95)')
                          : 'transparent',
                      color: cclStatusStage === 'sent'
                        ? colours.green
                        : cclStatusStage === 'generated' || cclStatusStage === 'reviewed'
                          ? colours.highlight
                          : mutedText,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                    title={cclStatusStage === 'sent'
                      ? `Tracked ${formatFullDateTime(matter.cclDate || null)}`
                      : cclStatusStage === 'reviewed'
                        ? 'Generated and reviewed'
                        : cclStatusStage === 'generated'
                          ? 'Generated and awaiting review'
                        : 'Not started yet'}
                  >
                    {cclStatus}
                  </span>
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

              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                    fontSize: 11,
                    lineHeight: 1.35,
                    color: bodyText,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
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
  return <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>;
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
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {renderSortIndicator(column)}
    </button>
  );
};

export default MatterTableView;
