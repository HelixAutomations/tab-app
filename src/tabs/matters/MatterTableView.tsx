import React, { useMemo, useState, useCallback } from 'react';
import { Icon } from '@fluentui/react';
import { format, parseISO } from 'date-fns';
import { colours } from '../../app/styles/colours';
import { NormalizedMatter } from '../../app/functionality/types';
import clioIcon from '../../assets/clio.svg';

interface MatterTableViewProps {
  matters: NormalizedMatter[];
  isDarkMode: boolean;
  onRowClick?: (matter: NormalizedMatter) => void;
  loading?: boolean;
}

const MatterTableView: React.FC<MatterTableViewProps> = ({
  matters,
  isDarkMode,
  onRowClick,
  loading = false,
}) => {
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [hoveredDayGroupKey, setHoveredDayGroupKey] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<'matterRef' | 'clientName' | 'description' | 'practiceArea' | 'responsible' | 'openDate'>('openDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy to clipboard handler
  const handleCopy = useCallback(async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const shouldGroupByDate = sortColumn === 'openDate';

  const sortedMatters = useMemo(() => {
    const next = [...matters];
    const getSortValue = (matter: NormalizedMatter): string | number => {
      switch (sortColumn) {
        case 'matterRef':
          return (matter.displayNumber || matter.matterId || '').toString().toLowerCase();
        case 'clientName':
          return (matter.clientName || '').toLowerCase();
        case 'description':
          return (matter.description || '').toLowerCase();
        case 'practiceArea':
          return (matter.practiceArea || '').toLowerCase();
        case 'responsible':
          return (matter.responsibleSolicitor || '').toLowerCase();
        case 'openDate':
        default: {
          if (!matter.openDate) return 0;
          const parsed = Date.parse(matter.openDate);
          return Number.isNaN(parsed) ? 0 : parsed;
        }
      }
    };

    next.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (av === bv) return 0;
      if (sortDirection === 'asc') return av > bv ? 1 : -1;
      return av < bv ? 1 : -1;
    });

    return next;
  }, [matters, sortColumn, sortDirection]);

  const groupedByDate = useMemo<Array<[string, NormalizedMatter[]]>>(() => {
    if (!shouldGroupByDate) {
      return [['All', sortedMatters]];
    }

    const grouped = new Map<string, NormalizedMatter[]>();
    const order: string[] = [];

    sortedMatters.forEach(matter => {
      const dateStr = matter.openDate || 'No Date';
      let dayKey = 'No Date';

      if (dateStr !== 'No Date') {
        try {
          const date = parseISO(dateStr);
          dayKey = format(date, 'yyyy-MM-dd');
        } catch {
          dayKey = 'Invalid Date';
        }
      }

      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
        order.push(dayKey);
      }
      grouped.get(dayKey)!.push(matter);
    });

    return order.map((key) => [key, grouped.get(key)!]);
  }, [sortedMatters, shouldGroupByDate]);

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === 'openDate' ? 'desc' : 'asc');
  };

  const renderSortIndicator = (column: typeof sortColumn) => {
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
              ? (isDarkMode ? colours.highlight : colours.highlight)
              : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`),
            transition: 'opacity 0.15s ease',
          },
        }}
      />
    );
  };

  const toggleDay = (dayKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  const sanitizePhoneForTel = (raw: string): string => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    const hasPlus = trimmed.startsWith('+');
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    return hasPlus ? `+${digitsOnly}` : digitsOnly;
  };

  // Format day separator label (compact by default, full on hover; include year only if not current)
  const formatDaySeparatorLabel = (dayKey: string, isHovered: boolean): string => {
    if (dayKey === 'No Date' || dayKey === 'Invalid Date') return dayKey;
    try {
      const date = parseISO(dayKey);
      const now = new Date();
      const isSameYear = date.getFullYear() === now.getFullYear();

      if (isHovered) {
        return isSameYear
          ? format(date, 'EEEE d MMMM')
          : format(date, 'EEEE d MMMM yyyy');
      }

      return isSameYear ? format(date, 'dd.MM') : format(date, 'dd.MM.yyyy');
    } catch {
      return dayKey;
    }
  };

  const getPracticeAreaLineColor = (area: string): string => {
    const normalised = (area || '').toLowerCase();
    if (normalised.includes('commercial')) return colours.blue;
    if (normalised.includes('construction')) return colours.orange;
    if (normalised.includes('property')) return colours.green;
    if (normalised.includes('employment')) return colours.yellow;
    if (normalised.includes('other') || normalised.includes('unsure')) return colours.greyText;
    return isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`;
  };

  const tableSurface = isDarkMode ? colours.dark.background : colours.grey;
  const headerSurface = isDarkMode ? colours.darkBlue : 'rgba(255, 255, 255, 0.98)';
  const strongBorder = isDarkMode ? colours.dark.borderColor : 'rgba(160, 160, 160, 0.35)';
  const rowBorder = isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(54, 144, 206, 0.12)';
  const rowHover = isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(214, 232, 255, 0.6)';
  const rowGroupHover = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(214, 232, 255, 0.35)';
  const rowEven = isDarkMode ? 'rgba(54, 144, 206, 0.022)' : 'rgba(54, 144, 206, 0.035)';
  const rowOdd = 'transparent';

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        color: isDarkMode ? colours.dark.subText : colours.light.subText,
      }}>
        Loading matters...
      </div>
    );
  }

  if (matters.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        color: isDarkMode ? colours.dark.subText : colours.light.subText,
      }}>
        <Icon iconName="StatusCircleQuestionMark" style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>No matters found</div>
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: tableSurface,
        overflow: 'hidden',
        fontFamily: 'Raleway, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Table Container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        gap: 0,
        paddingBottom: 0,
        background: 'transparent',
        transition: 'background-color 0.3s',
      }}>
        {/* Header Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 180px minmax(auto, 220px) minmax(auto, 350px) 140px 140px 120px 92px',
          gap: '12px',
          alignItems: 'center',
          padding: '0 16px',
          height: 44,
          boxSizing: 'border-box',
          background: headerSurface,
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          flexShrink: 0,
          fontFamily: 'Raleway, "Segoe UI", sans-serif',
          fontSize: 11,
          fontWeight: 600,
          color: isDarkMode ? colours.grey : colours.highlight,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          boxShadow: isDarkMode
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}>
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
                  color: isDarkMode ? colours.grey : colours.highlight,
                  opacity: 0.7,
                },
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => handleSort('matterRef')}
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
            }}
          >
            Matter
            {renderSortIndicator('matterRef')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('clientName')}
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
            }}
          >
            Client
            {renderSortIndicator('clientName')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('description')}
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
            }}
          >
            Description
            {renderSortIndicator('description')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('practiceArea')}
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
            }}
          >
            Worktype
            {renderSortIndicator('practiceArea')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('responsible')}
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
            }}
          >
            Responsible
            {renderSortIndicator('responsible')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('openDate')}
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
              justifyContent: 'flex-end',
              textAlign: 'right',
            }}
          >
            Open Date
            {renderSortIndicator('openDate')}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            textAlign: 'right',
            opacity: 0.9,
          }}>
            Actions
          </div>
        </div>

        {/* Grouped Rows */}
        {groupedByDate.map(([dayKey, dayMatters]) => {
          const isCollapsed = collapsedDays.has(dayKey);
          const isGroupHovered = hoveredDayGroupKey === dayKey;

          return (
            <div key={dayKey}>
              {/* Day Separator */}
              {shouldGroupByDate && (
                <div
                  onClick={() => toggleDay(dayKey)}
                  onMouseEnter={() => {
                    setHoveredDayKey(dayKey);
                    setHoveredDayGroupKey(dayKey);
                  }}
                  onMouseLeave={() => {
                    setHoveredDayKey((prev) => (prev === dayKey ? null : prev));
                    setHoveredDayGroupKey((prev) => (prev === dayKey ? null : prev));
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 120px',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: 'transparent',
                  }}
                >
                  <div style={{
                    position: 'relative',
                    height: '100%',
                    minHeight: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {/* Vertical line - only below the dot */}
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      bottom: 0,
                      width: '1px',
                      transform: 'translateX(-50%)',
                      background:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.highlight : colours.highlight)
                          : (isDarkMode ? `${colours.highlight}4d` : `${colours.highlight}40`),
                      opacity: hoveredDayKey === dayKey ? 0.9 : 1,
                    }} />
                    {/* Timeline dot - absolutely positioned to align with line */}
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.highlight : colours.highlight)
                          : (isDarkMode ? `${colours.highlight}99` : `${colours.highlight}80`),
                      border: `2px solid ${isDarkMode ? colours.dark.background : 'rgb(255, 255, 255)'}`,
                      zIndex: 1,
                    }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: hoveredDayKey === dayKey ? 800 : 700,
                      color:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.grey : colours.highlight)
                          : (isDarkMode ? `${colours.subtleGrey}b3` : `${colours.greyText}b3`),
                      textTransform: hoveredDayKey === dayKey ? 'none' : 'uppercase',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                    }}>
                      {formatDaySeparatorLabel(dayKey, hoveredDayKey === dayKey)}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 500,
                      color: isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}8c`,
                      whiteSpace: 'nowrap',
                    }}>
                      {dayMatters.length}
                    </span>
                  </div>
                  {/* Chevron and collapsed indicator - aligned right */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'flex-end',
                    gap: 4,
                  }}>
                    {isCollapsed && (
                      <Icon
                        iconName="Hide3"
                        styles={{
                          root: {
                            fontSize: 12,
                            color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`,
                          },
                        }}
                        title={`${dayMatters.length} items hidden`}
                      />
                    )}
                    <Icon
                      iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
                      styles={{
                        root: {
                          fontSize: 10,
                          color: isDarkMode ? `${colours.subtleGrey}73` : `${colours.greyText}66`,
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Matter Rows */}
              {(!shouldGroupByDate || !isCollapsed) && dayMatters.map((matter, idx) => (
                <div
                  key={matter.matterId}
                  onClick={() => onRowClick?.(matter)}
                  onMouseEnter={() => {
                    setHoveredRowId(matter.matterId);
                    setHoveredDayKey(dayKey);
                  }}
                  onMouseLeave={() => {
                    setHoveredRowId(null);
                    setHoveredDayKey((prev) => (prev === dayKey ? null : prev));
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 180px minmax(auto, 220px) minmax(auto, 350px) 140px 140px 120px 92px',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: hoveredRowId === matter.matterId
                      ? rowHover
                      : (isGroupHovered
                        ? rowGroupHover
                        : (isDarkMode 
                          ? (idx % 2 === 0 ? rowEven : rowOdd)
                          : (idx % 2 === 0 ? rowEven : rowOdd))),
                    borderBottom: `1px solid ${rowBorder}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                    fontSize: 13,
                  }}
                >
                  {/* Timeline cell - vertical line only */}
                  <div style={{
                    position: 'relative',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      transform: 'translateX(-50%)',
                      background: getPracticeAreaLineColor(matter.practiceArea || ''),
                      opacity: hoveredDayKey === dayKey ? 1 : 0.9,
                      transition: 'background 0.15s ease, opacity 0.15s ease',
                    }} />
                  </div>

                  {/* Matter Ref with Clio icon - clickable to open in Clio */}
                  {(() => {
                    const matterCopyKey = `matter-${matter.matterId}`;
                    const isMatterCopied = copiedKey === matterCopyKey;
                    const isV2 = matter.dataSource === 'vnet_direct';
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <a
                          href={`https://eu.app.clio.com/nc/#/matters/${matter.matterId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            textDecoration: 'none',
                            cursor: 'pointer',
                          }}
                          title="Open matter in Clio"
                          onMouseEnter={(e) => {
                            const span = e.currentTarget.querySelector('span');
                            if (span) span.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={(e) => {
                            const span = e.currentTarget.querySelector('span');
                            if (span) span.style.textDecoration = 'none';
                          }}
                        >
                          <div style={{ position: 'relative', display: 'inline-flex' }}>
                            <img
                              src={clioIcon}
                              alt="Clio"
                              style={{
                                width: 14,
                                height: 14,
                                opacity: matter.status?.toLowerCase() === 'open' ? 1 : 0.5,
                                filter: isV2
                                  ? (isDarkMode ? 'invert(1) brightness(1.2) drop-shadow(0 0 3px rgba(135, 243, 243, 0.8))' : 'drop-shadow(0 0 3px rgba(54, 144, 206, 0.6))')
                                  : (isDarkMode ? 'invert(1) brightness(1.2)' : 'none'),
                                transition: 'opacity 0.15s ease, filter 0.15s ease',
                              }}
                            />
                            {isV2 && (
                              <span style={{
                                position: 'absolute',
                                top: -4,
                                right: -8,
                                fontSize: 7,
                                fontWeight: 700,
                                color: isDarkMode ? colours.accent : colours.highlight,
                                textTransform: 'uppercase',
                                letterSpacing: 0.3,
                              }}>
                                v2
                              </span>
                            )}
                          </div>
                          <span style={{
                            fontWeight: 500,
                            color: colours.highlight,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {matter.displayNumber || matter.matterId}
                          </span>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopy(matter.displayNumber || matter.matterId, matterCopyKey);
                          }}
                          title={isMatterCopied ? 'Copied' : 'Copy matter ref'}
                          aria-label="Copy matter ref"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 18,
                            height: 18,
                            flexShrink: 0,
                            borderRadius: 0,
                            border: isMatterCopied
                              ? `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.38)'}`
                              : `1px solid ${isDarkMode ? `${colours.dark.border}26` : 'rgba(100, 116, 139, 0.12)'}`,
                            background: isMatterCopied
                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)')
                              : 'transparent',
                            color: isMatterCopied
                              ? colours.green
                              : (isDarkMode ? `${colours.subtleGrey}80` : 'rgba(71, 85, 105, 0.55)'),
                            cursor: 'pointer',
                            padding: 0,
                            opacity: isMatterCopied ? 1 : 0.5,
                            transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, background 160ms ease',
                          }}
                          onMouseEnter={(e) => {
                            if (isMatterCopied) return;
                            e.currentTarget.style.opacity = '0.9';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}59` : 'rgba(100, 116, 139, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            if (isMatterCopied) return;
                            e.currentTarget.style.opacity = '0.5';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}26` : 'rgba(100, 116, 139, 0.12)';
                          }}
                        >
                          <Icon
                            iconName={isMatterCopied ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: isMatterCopied ? colours.green : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Client - clickable to open in Clio with copy button */}
                  {(() => {
                    const clientCopyKey = `client-${matter.matterId}`;
                    const isClientCopied = copiedKey === clientCopyKey;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <a
                          href={`https://eu.app.clio.com/nc/#/contacts/${matter.clientId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontWeight: 500,
                            color: colours.highlight,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            transition: 'text-decoration 0.15s ease',
                          }}
                          title="Open client in Clio"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                        >
                          {matter.clientName || 'Unknown Client'}
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopy(matter.clientName || '', clientCopyKey);
                          }}
                          title={isClientCopied ? 'Copied' : 'Copy client name'}
                          aria-label="Copy client name"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 18,
                            height: 18,
                            flexShrink: 0,
                            borderRadius: 0,
                            border: isClientCopied
                              ? `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.38)'}`
                              : `1px solid ${isDarkMode ? `${colours.dark.border}26` : 'rgba(100, 116, 139, 0.12)'}`,
                            background: isClientCopied
                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)')
                              : 'transparent',
                            color: isClientCopied
                              ? colours.green
                              : (isDarkMode ? `${colours.subtleGrey}80` : 'rgba(71, 85, 105, 0.55)'),
                            cursor: 'pointer',
                            padding: 0,
                            opacity: isClientCopied ? 1 : 0.5,
                            transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, background 160ms ease',
                          }}
                          onMouseEnter={(e) => {
                            if (isClientCopied) return;
                            e.currentTarget.style.opacity = '0.9';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}59` : 'rgba(100, 116, 139, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            if (isClientCopied) return;
                            e.currentTarget.style.opacity = '0.5';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}26` : 'rgba(100, 116, 139, 0.12)';
                          }}
                        >
                          <Icon
                            iconName={isClientCopied ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: isClientCopied ? colours.green : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Description */}
                  <div style={{
                    color: isDarkMode ? '#d1d5db' : 'rgba(71, 85, 105, 0.8)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.description || 'No description'}
                  </div>

                  {/* Practice Area */}
                  <div style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.practiceArea || 'No Area'}
                  </div>

                  {/* Responsible Solicitor */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.responsibleSolicitor || 'Unassigned'}
                  </div>

                  {/* Open Date */}
                  <div style={{
                    fontSize: 12,
                    color: isDarkMode ? `${colours.subtleGrey}cc` : `${colours.greyText}cc`,
                    textAlign: 'right',
                  }}>
                    {matter.openDate ? format(parseISO(matter.openDate), 'd MMM yyyy') : 'No date'}
                  </div>

                  {/* Actions: Call + Email */}
                  {(() => {
                    const phoneRaw = (matter.clientPhone || '').toString().trim();
                    const emailRaw = (matter.clientEmail || '').toString().trim();
                    const tel = sanitizePhoneForTel(phoneRaw);
                    const hasPhone = Boolean(tel);
                    const hasEmail = Boolean(emailRaw);

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <button
                          type="button"
                          disabled={!hasPhone}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!tel) return;
                            window.open(`tel:${tel}`, '_self');
                          }}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : 'rgba(160, 160, 160, 0.2)'}`,
                            background: isDarkMode ? colours.darkBlue : 'rgba(244, 244, 246, 0.5)',
                            color: isDarkMode ? '#d1d5db' : 'rgba(71, 85, 105, 0.8)',
                            opacity: hasPhone ? 1 : 0.3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: hasPhone ? 'pointer' : 'default',
                            transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (!hasPhone) return;
                            e.currentTarget.style.background = isDarkMode ? colours.helixBlue : 'rgba(214, 232, 255, 0.6)';
                            e.currentTarget.style.borderColor = colours.highlight;
                            e.currentTarget.style.color = colours.highlight;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? colours.darkBlue : 'rgba(244, 244, 246, 0.5)';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}40` : 'rgba(160, 160, 160, 0.2)';
                            e.currentTarget.style.color = isDarkMode ? '#d1d5db' : 'rgba(71, 85, 105, 0.8)';
                          }}
                          title={hasPhone ? `Call ${phoneRaw}` : 'No phone number'}
                        >
                          <Icon iconName="Phone" styles={{ root: { fontSize: 11 } }} />
                        </button>

                        <button
                          type="button"
                          disabled={!hasEmail}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!emailRaw) return;
                            window.open(`mailto:${emailRaw}`, '_blank');
                          }}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : 'rgba(160, 160, 160, 0.2)'}`,
                            background: isDarkMode ? colours.darkBlue : 'rgba(244, 244, 246, 0.5)',
                            color: isDarkMode ? '#d1d5db' : 'rgba(71, 85, 105, 0.8)',
                            opacity: hasEmail ? 1 : 0.3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: hasEmail ? 'pointer' : 'default',
                            transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (!hasEmail) return;
                            e.currentTarget.style.background = isDarkMode ? colours.helixBlue : 'rgba(214, 232, 255, 0.6)';
                            e.currentTarget.style.borderColor = colours.highlight;
                            e.currentTarget.style.color = colours.highlight;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? colours.darkBlue : 'rgba(244, 244, 246, 0.5)';
                            e.currentTarget.style.borderColor = isDarkMode ? `${colours.dark.border}40` : 'rgba(160, 160, 160, 0.2)';
                            e.currentTarget.style.color = isDarkMode ? '#d1d5db' : 'rgba(71, 85, 105, 0.8)';
                          }}
                          title={hasEmail ? `Email ${emailRaw}` : 'No email address'}
                        >
                          <Icon iconName="Mail" styles={{ root: { fontSize: 11 } }} />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MatterTableView;
