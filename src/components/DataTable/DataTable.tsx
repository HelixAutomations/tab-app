import React, { useState, useMemo, useCallback } from 'react';
import { Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  width: string; // CSS grid width (e.g., '70px', '1fr', '0.5fr')
  sortable?: boolean;
  render?: (item: T, index: number) => React.ReactNode;
  tooltip?: string;
}

export interface TableConfig<T> {
  columns: TableColumn<T>[];
  defaultSort?: {
    column: keyof T | string;
    direction: 'asc' | 'desc';
  };
  showTimeline?: boolean;
  groupByDate?: boolean;
  dateField?: keyof T | string;
}

interface DataTableProps<T> {
  data: T[];
  config: TableConfig<T>;
  onRowClick?: (item: T, index: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

interface GroupedData<T> {
  date: string;
  items: T[];
  collapsed: boolean;
}

function DataTable<T extends Record<string, any>>({
  data,
  config,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  className = ''
}: DataTableProps<T>) {
  const { isDarkMode } = useTheme();
  const [sortColumn, setSortColumn] = useState<string | null>(
    config.defaultSort?.column as string || null
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    config.defaultSort?.direction || 'desc'
  );
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Generate grid template columns from config
  const gridTemplateColumns = useMemo(() => {
    return config.columns.map(col => col.width).join(' ');
  }, [config.columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      // Handle different data types
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        // Fallback to string comparison
        comparison = String(aVal || '').localeCompare(String(bVal || ''));
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [data, sortColumn, sortDirection]);

  // Group data by date if configured
  const groupedData = useMemo(() => {
    if (!config.groupByDate || !config.dateField) {
      return null;
    }

    const groups = new Map<string, T[]>();
    
    sortedData.forEach(item => {
      const dateValue = item[config.dateField!];
      const dateKey = dateValue 
        ? new Date(dateValue).toISOString().split('T')[0]
        : 'unknown';
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(item);
    });

    return Array.from(groups.entries())
      .map(([date, items]) => ({
        date,
        items,
        collapsed: collapsedDays.has(date)
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
  }, [sortedData, config.groupByDate, config.dateField, collapsedDays]);

  // Handle column sorting
  const handleSort = useCallback((columnKey: string) => {
    const column = config.columns.find(col => col.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('desc');
    }
  }, [sortColumn, config.columns]);

  // Toggle day collapse
  const toggleDayCollapse = useCallback((date: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (dateStr === 'unknown') return 'Unknown Date';
    
    const date = new Date(dateStr);
    
    // Format like "Thu, 20 Nov 2025" to match enquiries style
    return date.toLocaleDateString('en-GB', { 
      weekday: 'short',
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  // Theme styles
  const themeStyles = {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
    border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    text: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
    headerBg: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    headerText: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
    sortActive: isDarkMode ? '#60a5fa' : '#2563eb',
    separatorBg: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)',
    separatorBorder: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)',
    timelineLine: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)',
    timelineDot: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.5)',
    timelineDotBorder: isDarkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)',
    rowHover: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    rowBorder: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px',
        background: themeStyles.background,
        border: `1px solid ${themeStyles.border}`,
        borderRadius: '2px'
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          border: `2px solid ${themeStyles.headerText}`,
          borderTop: `2px solid ${themeStyles.sortActive}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px',
        background: themeStyles.background,
        border: `1px solid ${themeStyles.border}`,
        borderRadius: '2px',
        color: themeStyles.headerText
      }}>
        {emptyMessage}
      </div>
    );
  }

  const renderRows = (items: T[], showDaySeparators: boolean = false) => {
    return items.map((item, index) => {
      const isLast = index === items.length - 1;
      
      return (
        <div
          key={index}
          onClick={() => onRowClick?.(item, index)}
          style={{
            display: 'grid',
            gridTemplateColumns,
            gap: '12px',
            padding: '10px 16px 10px 32px',
            alignItems: 'center',
            borderBottom: isLast ? 'none' : `1px solid ${themeStyles.rowBorder}`,
            fontSize: '13px',
            color: themeStyles.text,
            background: index % 2 === 0 
              ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
              : 'transparent',
            cursor: onRowClick ? 'pointer' : 'default',
            transition: 'background-color 0.15s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (onRowClick) {
              e.currentTarget.style.backgroundColor = themeStyles.rowHover;
            }
          }}
          onMouseLeave={(e) => {
            if (onRowClick) {
              e.currentTarget.style.backgroundColor = index % 2 === 0 
                ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                : 'transparent';
            }
          }}
        >
          {/* Timeline line for grouped data */}
          {config.showTimeline && config.groupByDate && (
            <div style={{
              position: 'absolute',
              left: '-20px',
              top: 0,
              bottom: 0,
              width: '1px',
              background: themeStyles.timelineLine
            }} />
          )}
          
          {config.columns.map((column, colIndex) => (
            <div key={colIndex} style={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              overflow: 'hidden'
            }}>
              {column.render 
                ? column.render(item, index)
                : String(item[column.key] || '')
              }
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <div 
      className={className}
      style={{
        backgroundColor: themeStyles.background,
        border: `1px solid ${themeStyles.border}`,
        borderRadius: '2px',
        overflow: 'visible',
        paddingLeft: config.showTimeline && config.groupByDate ? '32px' : '0',
        fontFamily: 'Raleway, "Segoe UI", sans-serif'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns,
        gap: '12px',
        padding: '10px 16px 10px 32px',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: themeStyles.headerBg,
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${themeStyles.border}`,
        fontFamily: 'Raleway, "Segoe UI", sans-serif',
        fontSize: '10px',
        fontWeight: 500,
        color: themeStyles.headerText,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        boxShadow: isDarkMode 
          ? '0 2px 8px rgba(0, 0, 0, 0.3)'
          : '0 2px 8px rgba(0, 0, 0, 0.08)'
      }}>
        {config.columns.map((column, index) => (
          <div
            key={index}
            onClick={() => handleSort(column.key as string)}
            style={{
              cursor: column.sortable ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.15s ease',
              color: sortColumn === column.key ? themeStyles.sortActive : undefined,
              justifyContent: index === 0 ? 'flex-start' : 
                             index === 1 ? 'center' : 
                             index === config.columns.length - 1 ? 'flex-end' : 'flex-start'
            }}
            title={column.tooltip || (column.sortable ? `Sort by ${column.header.toLowerCase()}` : undefined)}
          >
            {column.header}
            {column.sortable && sortColumn === column.key && (
              <Icon 
                iconName={sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall'} 
                styles={{ root: { fontSize: '8px' } }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Data rows */}
      {groupedData ? (
        // Grouped by date
        groupedData.map((group) => (
          <React.Fragment key={group.date}>
            {/* Day separator */}
            <div
              onClick={() => toggleDayCollapse(group.date)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px 8px 32px',
                cursor: 'pointer',
                position: 'relative',
                background: themeStyles.separatorBg,
                borderBottom: `1px solid ${themeStyles.separatorBorder}`,
                borderTop: `1px solid ${themeStyles.separatorBorder}`
              }}
            >
              {/* Timeline line */}
              <div style={{
                position: 'absolute',
                left: '-20px',
                top: 0,
                bottom: 0,
                width: '1px',
                background: themeStyles.timelineLine
              }} />
              {/* Timeline dot */}
              <div style={{
                position: 'absolute',
                left: '-24px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: themeStyles.timelineDot,
                border: `2px solid ${themeStyles.timelineDotBorder}`,
                zIndex: 1
              }} />
              {/* Day label */}
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.95)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {formatDate(group.date)}
              </span>
              {/* Collapse indicator */}
              <Icon 
                iconName={group.collapsed ? 'ChevronRight' : 'ChevronDown'} 
                styles={{ 
                  root: { 
                    fontSize: 10, 
                    marginLeft: 6,
                    color: themeStyles.headerText
                  } 
                }} 
              />
            </div>
            
            {/* Group items */}
            {!group.collapsed && renderRows(group.items, true)}
          </React.Fragment>
        ))
      ) : (
        // Ungrouped data
        renderRows(sortedData)
      )}
    </div>
  );
}

export default DataTable;