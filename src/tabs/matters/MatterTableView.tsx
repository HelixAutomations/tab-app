import React, { useMemo, useState } from 'react';
import { Icon } from '@fluentui/react';
import { format, parseISO } from 'date-fns';
import { colours } from '../../app/styles/colours';
import { NormalizedMatter } from '../../app/functionality/types';
import InlineExpansionChevron from '../../components/InlineExpansionChevron';

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
    if (sortColumn !== column) return null;
    return (
      <Icon
        iconName={sortDirection === 'asc' ? 'SortUp' : 'SortDown'}
        style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}
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

  const formatDayLabel = (dayKey: string): string => {
    if (dayKey === 'No Date' || dayKey === 'Invalid Date') return dayKey;
    try {
      const date = parseISO(dayKey);
      return format(date, 'd MMM yyyy');
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
    return isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)';
  };

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
        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
        border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
        borderRadius: 2,
        overflow: 'hidden',
        fontFamily: 'Raleway, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 180px)',
      }}
    >
      {/* Table Container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        paddingBottom: 0,
        background: 'transparent',
        transition: 'background-color 0.3s',
      }}>
        {/* Header Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 140px 220px 1fr 140px 140px 120px',
          alignItems: 'center',
          height: 44,
          padding: '0 16px',
          background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          fontSize: 10,
          fontWeight: 500,
          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          boxShadow: isDarkMode
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}>
          <div></div>
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
            Matter Ref
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
            Area
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
            Opened
            {renderSortIndicator('openDate')}
          </button>
        </div>

        {/* Grouped Rows */}
        {groupedByDate.map(([dayKey, dayMatters]) => {
          const isCollapsed = collapsedDays.has(dayKey);
          const dayLabel = formatDayLabel(dayKey);
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
                    gridTemplateColumns: '32px 1fr auto',
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
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      bottom: 0,
                      width: '1px',
                      transform: 'translateX(-50%)',
                      background:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.accent : colours.highlight)
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'),
                      opacity: hoveredDayKey === dayKey ? 0.9 : 1,
                    }} />
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.accent : colours.highlight)
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.5)'),
                      border: `2px solid ${isDarkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)'}`,
                      zIndex: 1,
                    }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: hoveredDayKey === dayKey ? 800 : 700,
                      color:
                        hoveredDayKey === dayKey
                          ? (isDarkMode ? colours.accent : colours.highlight)
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.7)'),
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                    }}>
                      {dayLabel}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 500,
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)',
                      whiteSpace: 'nowrap',
                    }}>
                      {dayMatters.length}
                    </span>
                    <div style={{
                      height: 1,
                      flex: 1,
                      background: isDarkMode
                        ? 'linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.12), rgba(148,163,184,0))'
                        : 'linear-gradient(90deg, rgba(148,163,184,0.45), rgba(148,163,184,0.2), rgba(148,163,184,0))',
                    }} />
                    <Icon
                      iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
                      styles={{
                        root: {
                          fontSize: 10,
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)',
                        }
                      }}
                    />
                  </div>
                  <div />
                </div>
              )}

              {/* Matter Rows */}
              {(!shouldGroupByDate || !isCollapsed) && dayMatters.map((matter) => (
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
                    gridTemplateColumns: '32px 140px 220px 1fr 140px 140px 120px',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: hoveredRowId === matter.matterId
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                      : (isGroupHovered
                        ? (isDarkMode ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.04)')
                        : (isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.008)')),
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                    fontSize: 13,
                  }}
                >
                  {/* Icon */}
                  <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      position: 'absolute',
                      left: 6,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background: getPracticeAreaLineColor(matter.practiceArea || ''),
                      opacity: hoveredDayKey === dayKey ? 1 : 0.9,
                      transition: 'opacity 0.15s ease',
                    }} />
                    <Icon
                      iconName="FabricFolder"
                      style={{
                        fontSize: 16,
                        color: matter.status?.toLowerCase() === 'open'
                          ? (isDarkMode ? '#86efac' : '#22c55e')
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                      }}
                    />
                  </div>

                  {/* Matter Ref */}
                  <div style={{
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: isDarkMode ? colours.highlight : colours.blue,
                  }}>
                    {matter.displayNumber || matter.matterId}
                  </div>

                  {/* Client */}
                  <div style={{
                    fontWeight: 500,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.clientName || 'Unknown Client'}
                  </div>

                  {/* Description */}
                  <div style={{
                    color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.description || 'No description'}
                  </div>

                  {/* Practice Area */}
                  <div style={{
                    fontSize: 12,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)',
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
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                    textAlign: 'right',
                  }}>
                    {matter.openDate ? format(parseISO(matter.openDate), 'd MMM yyyy') : 'No date'}
                  </div>
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
