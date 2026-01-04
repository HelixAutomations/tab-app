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

  // Group matters by date
  const groupedByDate = useMemo(() => {
    const grouped = new Map<string, NormalizedMatter[]>();
    
    matters.forEach(matter => {
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
      }
      grouped.get(dayKey)!.push(matter);
    });
    
    // Sort by date descending
    return new Map([...grouped.entries()].sort((a, b) => {
      if (a[0] === 'No Date' || a[0] === 'Invalid Date') return 1;
      if (b[0] === 'No Date' || b[0] === 'Invalid Date') return -1;
      return b[0].localeCompare(a[0]);
    }));
  }, [matters]);

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
    <div style={{
      width: '100%',
      background: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'rgba(236, 244, 251, 0.96)',
      backdropFilter: 'blur(12px)',
      minHeight: '100vh',
      boxSizing: 'border-box',
      color: isDarkMode ? colours.dark.text : colours.light.text,
      position: 'relative',
      borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.08)'}`,
    }}>
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
          background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          fontSize: 11,
          fontWeight: 600,
          color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(71, 85, 105, 0.7)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          <div></div>
          <div>Matter Ref</div>
          <div>Client</div>
          <div>Description</div>
          <div>Area</div>
          <div>Responsible</div>
          <div style={{ textAlign: 'right' }}>Opened</div>
        </div>

        {/* Grouped Rows */}
        {Array.from(groupedByDate.entries()).map(([dayKey, dayMatters]) => {
          const isCollapsed = collapsedDays.has(dayKey);
          const dayLabel = formatDayLabel(dayKey);

          return (
            <div key={dayKey}>
              {/* Day Separator */}
              <div
                onClick={() => toggleDay(dayKey)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.6)',
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}`,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.6)';
                }}
              >
                <InlineExpansionChevron 
                  isExpanded={!isCollapsed} 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDay(dayKey);
                  }}
                  isDarkMode={isDarkMode}
                  count={dayMatters.length}
                  itemType="client"
                />
                <span>{dayLabel}</span>
                <span style={{
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                }}>
                  {dayMatters.length}
                </span>
              </div>

              {/* Matter Rows */}
              {!isCollapsed && dayMatters.map((matter) => (
                <div
                  key={matter.matterId}
                  onClick={() => onRowClick?.(matter)}
                  onMouseEnter={() => setHoveredRowId(matter.matterId)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 140px 220px 1fr 140px 140px 120px',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: hoveredRowId === matter.matterId
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                      : (isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.5)'),
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                    fontSize: 13,
                  }}
                >
                  {/* Icon */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
