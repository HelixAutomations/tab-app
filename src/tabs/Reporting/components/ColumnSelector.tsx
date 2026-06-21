import React, { useState } from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import type { ColumnDefinition } from '../hooks/useColumnVisibility';

interface ColumnSelectorProps {
  columns: ColumnDefinition[];
  visibleColumns: Set<string>;
  onToggleColumn: (columnKey: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onReset: () => void;
  menuAlign?: 'left' | 'right';
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  columns,
  visibleColumns,
  onToggleColumn,
  onShowAll,
  onHideAll,
  onReset,
  menuAlign = 'right',
}) => {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const visibleCount = visibleColumns.size;
  const totalCount = columns.length;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: 30,
          padding: '0 10px',
          border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          borderRadius: 0,
          cursor: 'pointer',
          transition: 'border-color 0.16s ease, background 0.16s ease, color 0.16s ease',
        }}
        title="Show/hide columns"
      >
        <FontIcon iconName="ViewAll" style={{ fontSize: 14 }} />
        Columns ({visibleCount}/{totalCount})
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            ...(menuAlign === 'left' ? { left: 0 } : { right: 0 }),
            marginTop: 4,
            zIndex: 1000,
            width: 'min(320px, calc(100vw - 24px))',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'min(400px, calc(100vh - 96px))',
            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
            borderRadius: 0,
            boxShadow: isDarkMode
              ? '0 8px 24px rgba(0, 0, 0, 0.3)'
              : '0 8px 24px rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              }}
            >
              Columns
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: isDarkMode ? colours.greyText : colours.subtleGrey,
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Column list */}
          <div
            style={{
              overflow: 'auto',
              flex: 1,
            }}
          >
            {columns.map((column) => (
              <label
                key={column.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode
                    ? 'rgba(54, 144, 206, 0.08)'
                    : 'rgba(54, 144, 206, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(column.key)}
                  onChange={() => onToggleColumn(column.key)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    flex: 1,
                  }}
                >
                  {column.label}
                </span>
              </label>
            ))}
          </div>

          {/* Footer with action buttons */}
          <div
            style={{
              padding: '8px 12px',
              borderTop: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onShowAll();
              }}
              style={{
                flex: 1,
                minWidth: 60,
                padding: '5px 8px',
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                color: colours.cta,
                borderRadius: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(54, 144, 206, 0.2)'
                  : 'rgba(54, 144, 206, 0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(54, 144, 206, 0.12)'
                  : 'rgba(54, 144, 206, 0.08)';
              }}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                onHideAll();
              }}
              style={{
                flex: 1,
                minWidth: 60,
                padding: '5px 8px',
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
                background: isDarkMode ? 'rgba(220, 38, 38, 0.12)' : 'rgba(220, 38, 38, 0.08)',
                color: colours.cta,
                borderRadius: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(220, 38, 38, 0.2)'
                  : 'rgba(220, 38, 38, 0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(220, 38, 38, 0.12)'
                  : 'rgba(220, 38, 38, 0.08)';
              }}
            >
              None
            </button>
            <button
              type="button"
              onClick={() => {
                onReset();
              }}
              style={{
                flex: 1,
                minWidth: 60,
                padding: '5px 8px',
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
                background: isDarkMode ? 'rgba(107, 114, 128, 0.12)' : 'rgba(107, 114, 128, 0.08)',
                color: colours.greyText,
                borderRadius: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(107, 114, 128, 0.2)'
                  : 'rgba(107, 114, 128, 0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(107, 114, 128, 0.12)'
                  : 'rgba(107, 114, 128, 0.08)';
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Overlay to close on click outside */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
        />
      )}
    </div>
  );
};
