/**
 * ReportShell — shared reporting layout shell.
 *
 * Provides the consistent container, filter toolbar (date range presets,
 * custom pickers, from/to stamps), refresh indicator, and refresh button
 * that every reporting view uses.
 *
 * Reports render their own content as `children`; any report-specific
 * toolbar extras (role filters, dataset info, etc.) go in `toolbarExtras`.
 *
 * Usage:
 *   <ReportShell range={range} isFetching={isFetching} onRefresh={handleRefresh} ...>
 *     <MyReportContent />
 *   </ReportShell>
 */

import React, { useEffect, useState } from 'react';
import { DatePicker, DayOfWeek, DefaultButton, Icon } from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import type { UseReportRangeReturn } from '../hooks/useReportRange';
import { formatDateForPicker, formatTimeAgo } from '../hooks/useReportRange';
import {
  reportContainerStyle,
  getDatePickerStyles,
  getRangeButtonStyles,
  dateStampButtonStyle,
  clearFilterButtonStyle,
  getRefreshIndicatorColor,
} from '../styles/reportingStyles';
import '../ManagementDashboard.css';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ReportShellProps {
  /** Return value from useReportRange() */
  range: UseReportRangeReturn;

  /** Whether a data refresh is currently in progress */
  isFetching?: boolean;

  /** Unix-ms timestamp of last successful refresh */
  lastRefreshTimestamp?: number;

  /** Trigger a data refresh */
  onRefresh?: () => void;

  /** Extra controls rendered inside the toolbar after the action buttons */
  toolbarExtras?: React.ReactNode;

  /** Extra toolbar rows rendered below the preset row */
  toolbarBottom?: React.ReactNode;

  /** Auto-refresh interval in seconds (used for indicator colour) */
  autoRefreshIntervalSecs?: number;

  /** Report content */
  children: React.ReactNode;
}

// ─── Component ─────────────────────────────────────────────────────────────

const PRESET_GROUPS: number[][] = [
  [0, 1],  // All | Today/Yesterday
  [1, 3],  // Today, Yesterday
  [3, 5],  // This Week, Last Week
  [5, 7],  // This Month, Last Month
  [7, 9],  // Last 90 Days, This Quarter
  [9, 11], // Year To Date, Current Year
];

const ReportShell: React.FC<ReportShellProps> = ({
  range: r,
  isFetching = false,
  lastRefreshTimestamp,
  onRefresh,
  toolbarExtras,
  toolbarBottom,
  autoRefreshIntervalSecs = 900,
  children,
}) => {
  const { isDarkMode } = useTheme();
  const themeClass = isDarkMode ? 'dark-theme' : 'light-theme';

  // Elapsed-time tracker for refresh indicator
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTimeElapsed((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (lastRefreshTimestamp) setTimeElapsed(0);
  }, [lastRefreshTimestamp]);

  const refreshColor = getRefreshIndicatorColor(isDarkMode, timeElapsed, autoRefreshIntervalSecs);
  const lastRefreshLabel = formatTimeAgo(lastRefreshTimestamp);

  const handleRefresh = () => {
    if (onRefresh && !isFetching) onRefresh();
  };

  return (
    <div className={`management-dashboard-container ${themeClass}`} style={reportContainerStyle(isDarkMode)}>
      {/* ── Filter toolbar ── */}
      <div className="filter-toolbar">
        <div className="filter-toolbar__top">
          <span className="filter-section-label">Date range</span>
          <div className="filter-toolbar__date-inputs">
            {r.showCustomPickers ? (
              <div className="date-pickers">
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={r.customDateRange.start || undefined}
                  onSelectDate={(d) => r.setCustomDate('start', d || null)}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={r.customDateRange.end || undefined}
                  onSelectDate={(d) => r.setCustomDate('end', d || null)}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                />
              </div>
            ) : (
              <div className="date-stamp-group">
                <button
                  type="button"
                  className="date-stamp-button toolbar-control"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => r.handleRangeSelect('custom')}
                  title="Click to customise the start date"
                >
                  <span className="date-stamp-button__label">From</span>
                  <span className="date-stamp-button__value">{r.fromLabel}</span>
                </button>
                <button
                  type="button"
                  className="date-stamp-button toolbar-control"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => r.handleRangeSelect('custom')}
                  title="Click to customise the end date"
                >
                  <span className="date-stamp-button__label">To</span>
                  <span className="date-stamp-button__value">{r.toLabel}</span>
                </button>
              </div>
            )}
          </div>

          <div className="filter-toolbar__actions">
            <div
              className={`filter-status-chip toolbar-control ${isFetching ? 'is-refreshing' : ''}`}
              style={{
                borderColor: isFetching ? undefined : refreshColor,
                transition: 'border-color 1s ease',
              }}
              title={
                isFetching
                  ? 'Refreshing data…'
                  : `Next auto-refresh in ${Math.floor((autoRefreshIntervalSecs - timeElapsed) / 60)}m ${(autoRefreshIntervalSecs - timeElapsed) % 60}s`
              }
            >
              {isFetching ? (
                <>
                  <div className="filter-status-indicator" />
                  <span>Refreshing…</span>
                </>
              ) : (
                <>
                  <div
                    className="filter-status-indicator"
                    style={{ background: refreshColor, transition: 'background 1s ease' }}
                  />
                  <span>{lastRefreshLabel}</span>
                </>
              )}
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFetching}
                className="filter-icon-button toolbar-control"
                title={isFetching ? 'Refreshing data…' : 'Refresh datasets'}
                aria-label={isFetching ? 'Refreshing data' : 'Refresh datasets'}
              >
                <Icon
                  iconName="Refresh"
                  style={{
                    fontSize: 16,
                    animation: isFetching ? 'spin 1s linear infinite' : 'none',
                  }}
                />
              </button>
            )}

            {toolbarExtras}
          </div>
        </div>

        {/* ── Preset range buttons ── */}
        <div className="filter-toolbar__presets">
          <div className="filter-preset-group">
            {r.quickRanges.slice(0, 1).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            <div className="preset-separator">|</div>
            {r.quickRanges.slice(1, 3).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            <div className="preset-separator">|</div>
            {r.quickRanges.slice(3, 5).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            <div className="preset-separator">|</div>
            {r.quickRanges.slice(5, 7).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            <div className="preset-separator">|</div>
            {r.quickRanges.slice(7, 9).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            <div className="preset-separator">|</div>
            {r.quickRanges.slice(9, 11).map((q) => (
              <DefaultButton
                key={q.key}
                text={q.label}
                onClick={() => r.handleRangeSelect(q.key)}
                styles={getRangeButtonStyles(isDarkMode, r.isActive(q.key))}
              />
            ))}
            {r.rangeKey !== 'all' && (
              <button
                onClick={() => r.handleRangeSelect('all')}
                style={clearFilterButtonStyle(isDarkMode)}
                title="Clear date range filter"
              >
                <span style={{ fontSize: 16 }}>×</span>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Optional extra toolbar rows ── */}
        {toolbarBottom}
      </div>

      {/* ── Report content ── */}
      {children}
    </div>
  );
};

export default ReportShell;
