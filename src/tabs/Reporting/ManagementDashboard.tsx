import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  DatePicker,
  DayOfWeek,
  DefaultButton,
  IButtonStyles,
  IDatePickerStyles,
  PrimaryButton,
  Spinner,
  Stack,
  Icon,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import type { Enquiry, Matter, POID, TeamData, UserData } from '../../app/functionality/types';
import { useToast } from '../../components/feedback/ToastProvider';
import type { AnnualLeaveRecord } from './AnnualLeaveReport';
import { debugLog, debugWarn } from '../../utils/debug';
import './ManagementDashboard.css';

interface RecoveredFee {
  payment_date: string;
  payment_allocated: number;
  user_id: number;
  kind?: string; // 'Service', 'Expense', or 'Product'
}

export interface WIP {
  date?: string; // YYYY-MM-DD format date field from Clio/SQL
  created_at: string;
  total?: number;
  quantity_in_hours?: number;
  user_id?: number;
  // When sourced from Clio API, user is nested
  user?: { id?: number | string };
}

interface ManagementDashboardProps {
  enquiries?: Enquiry[] | null;
  allMatters?: Matter[] | null;
  wip?: WIP[] | null | undefined;
  recoveredFees?: RecoveredFee[] | null;
  teamData?: TeamData[] | null;
  userData?: UserData[] | null;
  poidData?: POID[] | null;
  annualLeave?: AnnualLeaveRecord[] | null;
  triggerRefresh?: () => void;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
  dataWindowDays?: number;
}

type RangeKey = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'last90Days' | 'quarter' | 'yearToDate' | 'year' | 'custom';

interface RangeOption {
  key: RangeKey;
  label: string;
}

interface MemberMetrics {
  initials: string;
  displayName: string;
  enquiries: number;
  matters: number;
  wipHours: number;
  wipValue: number;
  collected: number;
  targetHours?: number;
  trendDirection?: 'up' | 'down' | 'neutral' | 'away';
}

type SortColumn = 'displayName' | 'enquiries' | 'matters' | 'wipHours' | 'wipValue' | 'collected';
type SortDirection = 'asc' | 'desc';

const RANGE_OPTIONS: RangeOption[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last90Days', label: 'Last 90 Days' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'yearToDate', label: 'Year To Date' },
  { key: 'year', label: 'Current Year' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
  const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
  const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
  const focusBorder = isDarkMode ? '#87ceeb' : colours.highlight;
  const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
  const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

  return {
    root: { 
      maxWidth: 220,
      '.ms-DatePicker': {
        fontFamily: 'Raleway, sans-serif !important',
      }
    },
    textField: {
      root: {
        fontFamily: 'Raleway, sans-serif !important',
        width: '100% !important',
      },
      fieldGroup: {
        height: '36px !important',
        borderRadius: '8px !important',
        border: `1px solid ${baseBorder} !important`,
        background: `${backgroundColour} !important`,
        padding: '0 14px !important',
        boxShadow: isDarkMode 
          ? '0 2px 4px rgba(0, 0, 0, 0.2) !important' 
          : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
        transition: 'all 0.2s ease !important',
        selectors: {
          ':hover': {
            border: `1px solid ${hoverBorder} !important`,
            background: `${hoverBackground} !important`,
            boxShadow: isDarkMode 
              ? '0 4px 8px rgba(0, 0, 0, 0.25) !important' 
              : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
            transform: 'translateY(-1px) !important',
          },
          ':focus-within': {
            border: `1px solid ${focusBorder} !important`,
            background: `${focusBackground} !important`,
            boxShadow: isDarkMode 
              ? `0 0 0 3px rgba(135, 206, 235, 0.1), 0 4px 12px rgba(0, 0, 0, 0.25) !important`
              : `0 0 0 3px rgba(54, 144, 206, 0.1), 0 2px 8px rgba(15, 23, 42, 0.15) !important`,
            transform: 'translateY(-1px) !important',
          }
        }
      },
      field: {
        fontSize: '14px !important',
        color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
        fontFamily: 'Raleway, sans-serif !important',
        fontWeight: '500 !important',
        background: 'transparent !important',
        lineHeight: '20px !important',
        border: 'none !important',
        outline: 'none !important',
      },
    },
    icon: {
      color: `${isDarkMode ? colours.highlight : colours.missedBlue} !important`,
      fontSize: '16px !important',
      fontWeight: 'bold !important',
    },
    callout: {
      fontSize: '14px !important',
      borderRadius: '12px !important',
      border: `1px solid ${baseBorder} !important`,
      boxShadow: isDarkMode 
        ? '0 8px 24px rgba(0, 0, 0, 0.4) !important' 
        : '0 6px 20px rgba(15, 23, 42, 0.15) !important',
    },
    wrapper: { 
      borderRadius: '12px !important',
    },
  };
};

const getRangeButtonStyles = (isDarkMode: boolean, active: boolean, disabled: boolean = false): IButtonStyles => {
  const activeBackground = colours.highlight;
  const inactiveBackground = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent';

  const resolvedBackground = disabled
    ? (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent')
    : active ? activeBackground : inactiveBackground;

  const resolvedBorder = active
    ? `1px solid ${isDarkMode ? 'rgba(135, 176, 255, 0.5)' : 'rgba(13, 47, 96, 0.32)'}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const resolvedColor = disabled
    ? (isDarkMode ? '#E2E8F0' : colours.missedBlue)
    : active
      ? '#ffffff'
      : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

  return {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      borderRadius: 999,
      border: resolvedBorder,
  padding: '0 12px',
  minHeight: 32,
  height: 32,
  fontWeight: 600,
      fontSize: 13,
      color: resolvedColor,
      background: resolvedBackground,
  boxShadow: active && !disabled ? '0 2px 8px rgba(54, 144, 206, 0.25)' : 'none',
      fontFamily: 'Raleway, sans-serif',
      cursor: disabled ? 'default' : 'pointer',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#2f7cb3'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(54, 144, 206, 0.12)'),
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#266795'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(54, 144, 206, 0.16)'),
    },
  };
};

const getTeamButtonStyles = (isDarkMode: boolean, active: boolean, hasWorked: boolean, isInactive?: boolean): IButtonStyles => {
  const activeBackground = active 
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent');
  
  const activeBorder = active
    ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  // Greyed out styling when member hasn't worked
  const greyedOut = !hasWorked;
  const opacity = greyedOut ? 0.4 : 1;
  const textColor = active
    ? '#ffffff'
    : greyedOut
      ? (isDarkMode ? '#64748B' : '#94A3B8')
      : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

  return {
    root: {
      borderRadius: 999,
      minHeight: 32,
      height: 32,
      padding: '0 8px',
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      border: activeBorder,
      borderStyle: isInactive ? 'dashed' : undefined,
      background: activeBackground,
      color: textColor,
      opacity: isInactive ? opacity * 0.78 : opacity,
      boxShadow: active 
        ? (isDarkMode ? '0 2px 8px rgba(54, 144, 206, 0.3)' : '0 2px 8px rgba(54, 144, 206, 0.25)')
        : 'none',
      fontFamily: 'Raleway, sans-serif',
      fontStyle: isInactive ? 'italic' : 'normal',
      transform: active ? 'translateY(-1px)' : 'none',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: active 
        ? `linear-gradient(135deg, #2f7cb3 0%, #266795 100%)` 
        : (isDarkMode ? 'rgba(15, 23, 42, 0.86)' : 'rgba(54, 144, 206, 0.1)'),
      transform: 'translateY(-1px)',
      boxShadow: active 
        ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.4)' : '0 4px 12px rgba(54, 144, 206, 0.35)')
        : (isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(15, 23, 42, 0.05)'),
    },
    rootPressed: {
      background: active 
        ? `linear-gradient(135deg, #266795 0%, #1e5a7a 100%)` 
        : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(54, 144, 206, 0.14)'),
      transform: 'translateY(0)',
    },
  };
};

const getRoleButtonStyles = (isDarkMode: boolean, active: boolean): IButtonStyles => {
  const activeBackground = active 
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent');
  
  const activeBorder = active
    ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

  const textColor = active ? '#ffffff' : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

  return {
    root: {
      borderRadius: 999,
      minHeight: 32,
      height: 32,
      padding: '0 12px',
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      border: activeBorder,
      background: activeBackground,
      color: textColor,
      boxShadow: active 
        ? (isDarkMode ? '0 2px 8px rgba(54, 144, 206, 0.3)' : '0 2px 8px rgba(54, 144, 206, 0.25)')
        : 'none',
      fontFamily: 'Raleway, sans-serif',
      transform: active ? 'translateY(-1px)' : 'none',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: active 
        ? `linear-gradient(135deg, #2f7cb3 0%, #266795 100%)` 
        : (isDarkMode ? 'rgba(15, 23, 42, 0.86)' : 'rgba(54, 144, 206, 0.1)'),
      transform: 'translateY(-1px)',
      boxShadow: active 
        ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.4)' : '0 4px 12px rgba(54, 144, 206, 0.35)')
        : (isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(15, 23, 42, 0.05)'),
    },
    rootPressed: {
      background: active 
        ? `linear-gradient(135deg, #266795 0%, #1e5a7a 100%)` 
        : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(54, 144, 206, 0.14)'),
      transform: 'translateY(0)',
    },
  };
};

const summaryChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: 0,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : '#ffffff',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : '#e2e8f0'}`,
  boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
  textAlign: 'center' as const,
  rowGap: 6,
  width: '100%',
  transition: 'all 0.25s ease',
  cursor: 'default',
});

const summaryChipLabelStyle = (): CSSProperties => ({
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  opacity: 0.65,
});

const dateStampButtonStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '6px 12px',
  borderRadius: 0,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(13, 47, 96, 0.14)'}`,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
  color: isDarkMode ? '#e2e8f0' : '#0d2f60',
  minWidth: 132,
  gap: 2,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: 'Raleway, sans-serif',
  whiteSpace: 'nowrap',
  lineHeight: 1.3,
});

const clearAllTimeButtonStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  height: 58,
  borderRadius: 0,
  border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
  background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(254, 242, 242, 0.9)',
  color: isDarkMode ? '#fca5a5' : '#dc2626',
  gap: 8,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: 'Raleway, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  whiteSpace: 'nowrap',
});

const clearFilterButtonStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  height: 32,
  borderRadius: 0,
  border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)'}`,
  background: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.85)',
  color: isDarkMode ? '#fca5a5' : '#dc2626',
  gap: 6,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: 'Raleway, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: 'nowrap',
});

const computeRange = (range: RangeKey): { start: Date; end: Date } => {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      start.setTime(yesterday.getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(yesterday.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      const day = now.getDay();
      const diff = (day + 6) % 7; // Monday as start
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'lastWeek': {
      const day = now.getDay();
      const diff = (day + 6) % 7; // Monday as start
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - diff);
      thisWeekStart.setHours(0, 0, 0, 0);

      start.setTime(thisWeekStart.getTime());
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);

      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth': {
      // Set to first day of last month
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      // Set end to last day of last month (day 0 of current month)
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last90Days': {
      // Set start to 90 days ago
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStart, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearToDate': {
      // Financial year: 1 April to 31 March
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11 (0 = January)

      if (currentMonth >= 3) { // April onwards (month 3+)
        // We're in the financial year that started this calendar year
        start.setFullYear(currentYear, 3, 1); // 1 April this year
      } else {
        // We're in Jan/Feb/Mar - still in the financial year that started last calendar year
        start.setFullYear(currentYear - 1, 3, 1); // 1 April last year
      }
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year': {
      // Calendar year: 1 January to 31 December
      const currentYear = now.getFullYear();
      start.setFullYear(currentYear, 0, 1);
      start.setHours(0, 0, 0, 0);

      end.setFullYear(currentYear, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'custom':
      // For custom ranges, return current date as both start and end
      // The actual dates will be controlled by the DatePicker components
      return { start: new Date(now), end: new Date(now) };
    case 'all':
    default:
      return { start: new Date(0), end };
  }

  return { start, end };
};

const computePreviousRange = (range: RangeKey, currentStart: Date, currentEnd: Date): { start: Date; end: Date } | null => {
  if (range === 'all' || range === 'custom') return null;

  const start = new Date();
  const end = new Date();

  switch (range) {
    case 'today': {
      // Previous working day
      const prevDay = new Date(currentStart);
      prevDay.setDate(prevDay.getDate() - 1);
      // Skip weekends
      while (prevDay.getDay() === 0 || prevDay.getDay() === 6) {
        prevDay.setDate(prevDay.getDate() - 1);
      }
      start.setTime(prevDay.getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(prevDay.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'yesterday': {
      // Day before yesterday
      const dayBeforeYesterday = new Date(currentStart);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);
      start.setTime(dayBeforeYesterday.getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(dayBeforeYesterday.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      // Previous week, accounting for partial weeks
      const currentDays = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const weekStart = new Date(currentStart);
      weekStart.setDate(weekStart.getDate() - 7);
      
      start.setTime(weekStart.getTime());
      end.setTime(weekStart.getTime());
      end.setDate(end.getDate() + currentDays - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'lastWeek': {
      // Week before last (full week)
      const previousWeekStart = new Date(currentStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      previousWeekStart.setHours(0, 0, 0, 0);

      const previousWeekEnd = new Date(previousWeekStart);
      previousWeekEnd.setDate(previousWeekEnd.getDate() + 6);
      previousWeekEnd.setHours(23, 59, 59, 999);

      start.setTime(previousWeekStart.getTime());
      end.setTime(previousWeekEnd.getTime());
      break;
    }
    case 'month': {
      // Previous month - get the full previous month
      const prevMonth = new Date(currentStart);
      prevMonth.setMonth(prevMonth.getMonth() - 1, 1); // Set to 1st of previous month
      start.setTime(prevMonth.getTime());
      start.setHours(0, 0, 0, 0);
      
      // End of previous month
      end.setTime(prevMonth.getTime());
      end.setMonth(end.getMonth() + 1, 0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'lastMonth': {
      // "Last Month" compares to the month before that
      const twoMonthsAgo = new Date(currentStart);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1, 1); // Set to 1st of two months ago
      start.setTime(twoMonthsAgo.getTime());
      start.setHours(0, 0, 0, 0);
      
      // End of two months ago
      end.setTime(twoMonthsAgo.getTime());
      end.setMonth(end.getMonth() + 1, 0); // Last day of two months ago
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last90Days': {
      // Use the length of the current range to ensure the comparison window matches exactly
  const dayInMs = 24 * 60 * 60 * 1000;
  const rangeLengthInDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / dayInMs) + 1);

      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousEnd.setHours(23, 59, 59, 999);

      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - (rangeLengthInDays - 1));
      previousStart.setHours(0, 0, 0, 0);

      start.setTime(previousStart.getTime());
      end.setTime(previousEnd.getTime());
      break;
    }
    case 'quarter': {
      // Previous quarter - get the full previous quarter
      const prevQuarter = new Date(currentStart);
      prevQuarter.setMonth(prevQuarter.getMonth() - 3, 1); // Set to 1st of quarter start month
      start.setTime(prevQuarter.getTime());
      start.setHours(0, 0, 0, 0);
      
      // End of previous quarter
      end.setTime(prevQuarter.getTime());
      end.setMonth(end.getMonth() + 3, 0); // Last day of previous quarter
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'yearToDate': {
      // Previous financial year
      const prevYear = new Date(currentStart);
      prevYear.setFullYear(prevYear.getFullYear() - 1);
      start.setTime(prevYear.getTime());
      start.setHours(0, 0, 0, 0);

      // End of previous financial year (day before current year starts)
      end.setTime(currentStart.getTime());
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'year': {
      // Previous calendar year
      const prevYearStart = new Date(currentStart);
      prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
      prevYearStart.setHours(0, 0, 0, 0);

      const prevYearEnd = new Date(currentEnd);
      prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
      prevYearEnd.setHours(23, 59, 59, 999);

      start.setTime(prevYearStart.getTime());
      end.setTime(prevYearEnd.getTime());
      break;
    }
    default:
      return null;
  }

  return { start, end };
};

// Helper function to format date range for display
const formatDateRange = (start: Date, end: Date): string => {
  const formatOptions: Intl.DateTimeFormatOptions = { 
    day: '2-digit', 
    month: 'short',
    year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined
  };
  
  const startStr = start.toLocaleDateString('en-GB', formatOptions);
  const endStr = end.toLocaleDateString('en-GB', formatOptions);
  
  if (startStr === endStr) return startStr;
  return `${startStr} - ${endStr}`;
};

// Helper function to get range label
const getRangeLabel = (range: RangeKey): string => {
  switch (range) {
  case 'today': return 'Today';
  case 'yesterday': return 'Yesterday';
  case 'week': return 'This Week';
  case 'lastWeek': return 'Last Week';
  case 'month': return 'This Month';
  case 'lastMonth': return 'Last Month';
  case 'last90Days': return 'Last 90 Days';
  case 'quarter': return 'This Quarter';
  case 'yearToDate': return 'Year To Date';
  case 'year': return 'Current Year';
  case 'all': return 'All Time';
    default: return 'Custom';
  }
};

// Helper function to get previous range label
const getPreviousRangeLabel = (range: RangeKey): string => {
  switch (range) {
  case 'today': return 'Previous Working Day';
  case 'yesterday': return 'Day Before Yesterday';
  case 'week': return 'Previous Week';
  case 'lastWeek': return 'Week Before Last';
  case 'lastMonth': return 'Two Months Ago';
  case 'last90Days': return 'Prior 90 Days';
  case 'month': return 'Previous Month';
  case 'quarter': return 'Previous Quarter';
  case 'yearToDate': return 'Previous Financial Year';
  case 'year': return 'Previous Year';
    default: return 'Previous Period';
  }
};

const parseDateValue = (input: unknown): Date | null => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return null;
  }
  const trimmed = input.trim();
  const normalised = trimmed.includes('/') && !trimmed.includes('T')
    ? (() => {
      const parts = trimmed.split('/');
      if (parts.length !== 3) {
        return trimmed;
      }
      const [day, month, year] = parts;
      return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    })()
    : trimmed;
  const candidate = new Date(normalised);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const safeNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
};

const formatDateForPicker = (date?: Date | null): string => {
  if (!date) {
    return '';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const parseDatePickerInput = (value?: string | null): Date | null => (
  value ? parseDateValue(value) : null
);

const matchesInitials = (value: unknown, initials: string): boolean => {
  if (!initials || typeof value !== 'string') {
    return false;
  }
  return value.toLowerCase().includes(initials.toLowerCase());
};

// Normalise a full name: letters only, lowercase
const normalizeName = (name?: string | null): string => (
  typeof name === 'string' ? name.replace(/[^a-zA-Z]/g, '').toLowerCase() : ''
);

// Known display name corrections from legacy data
const NAME_MAP: Record<string, string> = {
  'Samuel Packwood': 'Sam Packwood',
  'Bianca ODonnell': "Bianca O'Donnell",
};

const mapNameIfNeeded = (name?: string | null): string => {
  if (!name) return '';
  return NAME_MAP[name] ?? name;
};

const displayName = (record?: TeamData | null): string => {
  if (!record) {
    return 'Unknown';
  }
  return (
    record['Nickname']
    || record['Full Name']
    || record['First']
    || record['Last']
    || record['Initials']
    || 'Unknown'
  );
};

const formatHours = (hours: number): string => {
  if (hours <= 0) {
    return '0h';
  }
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes > 0 ? `${whole}h ${minutes}m` : `${whole}h`;
};

// Calculate working days between two dates (excluding weekends and basic UK bank holidays)
const calculateWorkingDays = (startDate: Date, endDate: Date): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let workingDays = 0;
  
  // Basic UK bank holidays for 2024-2025 (simplified - could be made more dynamic)
  const bankHolidays = [
    '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27', '2024-08-26', '2024-12-25', '2024-12-26',
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26'
  ];
  
  const bankHolidaySet = new Set(bankHolidays);
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();
    const dateString = date.toISOString().split('T')[0];
    
    // Skip weekends (0 = Sunday, 6 = Saturday) and bank holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidaySet.has(dateString)) {
      workingDays++;
    }
  }
  
  return workingDays;
};

// Determine trend direction based on actual vs target hours
const getTrendDirection = (actualHours: number, targetHours: number): 'up' | 'down' | 'neutral' => {
  if (targetHours === 0) return 'neutral';
  const performance = actualHours / targetHours;
  if (performance > 1.0) return 'up'; // Any amount above target
  if (performance < 1.0) return 'down'; // Any amount below target
  return 'neutral'; // Exactly at target (very rare)
};

// Get trend arrow and color
const getTrendArrow = (direction: 'up' | 'down' | 'neutral' | 'away'): string => {
  switch (direction) {
    case 'up': return '↗';
    case 'down': return '↘';
    case 'away': return '✈'; // Travel/away icon
    default: return '';
  }
};

const getTrendColor = (direction: 'up' | 'down' | 'neutral' | 'away', isDarkMode: boolean): string => {
  switch (direction) {
    case 'up': return '#10B981'; // Green
    case 'down': return '#EF4444'; // Red
    case 'away': return isDarkMode ? '#94A3B8' : '#64748B'; // Blue-gray for away
    default: return isDarkMode ? '#9CA3AF' : '#6B7280'; // Gray
  }
};

const formatCurrency = (amount: number): string => {
  if (amount === 0) {
    return '£0';
  }
  if (Math.abs(amount) < 1000) {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (Math.abs(amount) < 1000000) {
    return `£${(amount / 1000).toFixed(1)}k`;
  }
  return `£${(amount / 1000000).toFixed(2)}m`;
};

const formatDateTag = (date: Date | null): string => {
  if (!date) {
    return 'n/a';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const enquiriesHandledBy = (enquiry: Enquiry, initials: string): boolean => (
  matchesInitials(enquiry.Point_of_Contact, initials)
  || matchesInitials(enquiry.Call_Taker, initials)
);

const matterOwnedBy = (matter: Matter, initials: string): boolean => (
  matchesInitials(matter.ResponsibleSolicitor, initials)
  || matchesInitials(matter.OriginatingSolicitor, initials)
);

const ManagementDashboard: React.FC<ManagementDashboardProps> = ({
  enquiries: rawEnquiries,
  allMatters: rawMatters,
  wip: rawWip,
  recoveredFees: rawFees,
  teamData: rawTeam,
  userData: rawUsers,
  annualLeave: rawAnnualLeave,
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false,
  dataWindowDays,
}) => {
  // Add CSS animation for spinning refresh icon
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('refreshSpinAnimation')) {
      const style = document.createElement('style');
      style.id = 'refreshSpinAnimation';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const { isDarkMode } = useTheme();
  const { showToast } = useToast();
  const [{ start: rangeStart, end: rangeEnd }, setRangeState] = useState(() => computeRange('all'));
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [hoveredMetric, setHoveredMetric] = useState<{ type: string; x: number; y: number } | null>(null);
  const [processingModal, setProcessingModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    progress?: number;
  }>({ visible: false, title: '', message: '' });
  const [hoveredMember, setHoveredMember] = useState<{ 
    member: MemberMetrics; 
    previousData?: any; 
    x: number; 
    y: number 
  } | null>(null);
  const [showDatasetInfo, setShowDatasetInfo] = useState(false);
  const [showWipInfo, setShowWipInfo] = useState(false);
  const [showWipValueInfo, setShowWipValueInfo] = useState(false);
  const [showCollectedInfo, setShowCollectedInfo] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0); // Time since last refresh in seconds
  const effectiveDataWindowDays = useMemo(() => (
    typeof dataWindowDays === 'number' && dataWindowDays > 0 ? dataWindowDays : null
  ), [dataWindowDays]);

  const getRangeDurationDays = (key: RangeKey): number | null => {
    if (key === 'all' || key === 'custom') {
      return null;
    }
    const { start, end } = computeRange(key);
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diff / DAY_MS));
  };

  const isRangeDisabled = (key: RangeKey): boolean => {
    if (!effectiveDataWindowDays) {
      return false;
    }
    const duration = getRangeDurationDays(key);
    if (duration == null) {
      return false;
    }
    return duration > effectiveDataWindowDays;
  };

  // Auto-refresh configuration
  const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds
  const UPDATE_INTERVAL = 1000; // Update color every second

  // Auto-refresh effect - only runs when component is mounted (dashboard is open)
  useEffect(() => {
    if (!triggerRefresh) return; // No refresh function available

    // Timer to track elapsed time and update color
    const colorTimer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, UPDATE_INTERVAL);

    // Timer to trigger auto-refresh every 15 minutes
    const refreshTimer = setInterval(() => {
      debugLog('🔄 Auto-refresh triggered after 15 minutes');
      triggerRefresh();
      setTimeElapsed(0); // Reset elapsed time
    }, AUTO_REFRESH_INTERVAL);

    // Cleanup on unmount (when dashboard closes)
    return () => {
      clearInterval(colorTimer);
      clearInterval(refreshTimer);
    };
  }, [triggerRefresh]);

  // Reset timer when manual refresh happens
  useEffect(() => {
    if (lastRefreshTimestamp) {
      setTimeElapsed(0);
    }
  }, [lastRefreshTimestamp]);

  // Show success toast when refresh completes
  const prevIsFetchingRef = React.useRef(isFetching);
  useEffect(() => {
    if (prevIsFetchingRef.current && !isFetching) {
      setProcessingModal({ visible: false, title: '', message: '' });
      showToast({ type: 'success', message: 'Dashboard data refreshed' });
    }
    prevIsFetchingRef.current = isFetching;
  }, [isFetching, showToast]);

  // Calculate color based on elapsed time (green → blue over 15 minutes)
  const getRefreshIndicatorColor = () => {
    const maxSeconds = 15 * 60; // 15 minutes
    const progress = Math.min(timeElapsed / maxSeconds, 1); // 0 to 1

    // Green (start): rgb(34, 197, 94)
    // Blue (end): rgb(59, 130, 246)
    const r = Math.round(34 + (59 - 34) * progress);
    const g = Math.round(197 + (130 - 197) * progress);
    const b = Math.round(94 + (246 - 94) * progress);

    return `rgb(${r}, ${g}, ${b})`;
  };

  // Format timestamp as "X ago"
  const formatTimeAgo = (timestamp: number | undefined): string => {
    if (!timestamp) return 'Pending';
    
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000); // difference in seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 120) return '1 min ago';
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 7200) return '1 hour ago';
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 172800) return '1 day ago';
    return `${Math.floor(diff / 86400)} days ago`;
  };

  // Check if member was completely away during the period (for daily/weekly views)
  const wasCompletelyAway = (startDate: Date, endDate: Date, memberInitials: string): boolean => {
    if (!rawAnnualLeave) return false;
    
    const workingDays = calculateWorkingDays(startDate, endDate);
    if (workingDays === 0) return false; // No working days in period
    
    const memberLeave = rawAnnualLeave.filter(record => 
      record.fe === memberInitials && 
      (record.status.toLowerCase().includes('approved') || record.status.toLowerCase().includes('confirmed'))
    );
    
    let totalLeaveDays = 0;
    
    for (const leave of memberLeave) {
      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date);
      
      // Check if leave period overlaps with our date range
      const overlapStart = leaveStart > startDate ? leaveStart : startDate;
      const overlapEnd = leaveEnd < endDate ? leaveEnd : endDate;
      
      if (overlapStart <= overlapEnd) {
        // Calculate working days within the overlap period
        const overlapLeaveDays = calculateWorkingDays(overlapStart, overlapEnd);
        totalLeaveDays += overlapLeaveDays;
      }
    }
    
    // Return true if ALL working days in the period were leave days
    return totalLeaveDays >= workingDays;
  };

  // Calculate leave days for a team member within the specified date range
  const calculateLeaveDays = (startDate: Date, endDate: Date, memberInitials: string, rangeKey: RangeKey): number => {
    if (!rawAnnualLeave) return 0;
    
    // For daily and weekly views, don't subtract leave days if completely away
    // (we'll grey out the indicator instead)
    if ((rangeKey === 'today' || rangeKey === 'week') && wasCompletelyAway(startDate, endDate, memberInitials)) {
      return 0; // Don't reduce target, we'll handle this in trend calculation
    }
    
    // For longer periods (month, quarter, year), subtract actual leave days
    const memberLeave = rawAnnualLeave.filter(record => 
      record.fe === memberInitials && 
      (record.status.toLowerCase().includes('approved') || record.status.toLowerCase().includes('confirmed'))
    );
    
    let totalLeaveDays = 0;
    
    for (const leave of memberLeave) {
      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date);
      
      // Check if leave period overlaps with our date range
      const overlapStart = leaveStart > startDate ? leaveStart : startDate;
      const overlapEnd = leaveEnd < endDate ? leaveEnd : endDate;
      
      if (overlapStart <= overlapEnd) {
        // Calculate working days within the overlap period
        const overlapLeaveDays = calculateWorkingDays(overlapStart, overlapEnd);
        totalLeaveDays += overlapLeaveDays;
      }
    }
    
    return totalLeaveDays;
  };

  // Calculate target hours for a team member (6 hours per working day, minus leave days for longer periods)
  const calculateTargetHours = (startDate: Date, endDate: Date, memberInitials: string): number => {
    const workingDays = calculateWorkingDays(startDate, endDate);
    const leaveDays = calculateLeaveDays(startDate, endDate, memberInitials, rangeKey);
    const availableDays = Math.max(0, workingDays - leaveDays);
    const targetHours = availableDays * 6; // 6 hours per working day
    
    return targetHours;
  };

  // Role options - "Ops" combines Non-solicitor and Operations 1
  // "Inactive" includes all inactive team members
  const ROLE_OPTIONS = [
    { key: 'Partner', label: 'Partner' },
    { key: 'Senior Partner', label: 'Senior Partner' },
    { key: 'Associate Solicitor', label: 'Associate' },
    { key: 'Solicitor', label: 'Solicitor' },
    { key: 'Paralegal', label: 'Paralegal' },
    { key: 'Ops', label: 'Ops' },
    { key: 'Inactive', label: 'Inactive' },
  ] as const;

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showRoleFilter, setShowRoleFilter] = useState<boolean>(false);
  const [includeDisbursements, setIncludeDisbursements] = useState<boolean>(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('displayName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const enquiries = rawEnquiries ?? [];
  const matters = rawMatters ?? [];
  const wip = rawWip ?? [];
  const fees = rawFees ?? [];
  const team = rawTeam ?? [];

  const activeStart = useMemo(() => startDate ?? rangeStart, [startDate, rangeStart]);
  const activeEnd = useMemo(() => endDate ?? rangeEnd, [endDate, rangeEnd]);

  const withinRange = (value: Date | null): boolean => {
    if (!value) {
      return false;
    }
    const endOfDay = new Date(activeEnd);
    endOfDay.setHours(23, 59, 59, 999);
    return value >= activeStart && value <= endOfDay;
  };

  const filteredEnquiries = useMemo(() => {
    // First: Filter out placeholder emails that cause false duplicates (same ID reused for different people)
    const placeholderEmails = ['noemail@noemail.com', 'prospects@helix-law.com'];
    const validEnquiries = enquiries.filter((e) => {
      const email = ((e as any).Email || (e as any).email || '').toLowerCase();
      return !placeholderEmails.includes(email);
    });
    
    // Second: Filter by date range
    const filtered = validEnquiries.filter((entry) => withinRange(parseDateValue(entry.Touchpoint_Date)));
    
    // Third: Deduplicate by ID + Week (same person with enquiries in different weeks = different matters)
    // Multiple calls within same week = follow-ups, count as one enquiry
    const seen = new Set<string>();
    const deduped: typeof filtered = [];
    for (const e of filtered) {
      const id = String((e as any).ID || (e as any).id || '');
      const dateStr = (e.Touchpoint_Date || '').toString().split('T')[0];
      
      // Calculate ISO week number
      let weekKey = '';
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const dayOfWeek = d.getDay() || 7;
          const monday = new Date(d);
          monday.setDate(d.getDate() - dayOfWeek + 1);
          const weekNum = Math.ceil(((monday.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7);
          weekKey = `${year}-W${weekNum}`;
        }
      }
      
      const key = `${id}|${weekKey}`;
      if (!id || !seen.has(key)) {
        if (id) seen.add(key);
        deduped.push(e);
      }
    }
    return deduped;
  }, [enquiries, activeStart, activeEnd]);

  const filteredMatters = useMemo(() => (
    matters.filter((entry) => {
      const openDate = (entry as any)['Open Date'] ?? entry.OpenDate;
      const closeDate = (entry as any)['Close Date'] ?? entry.CloseDate;
      const dateToCheck = openDate ?? closeDate ?? '';
      const parsedDate = parseDateValue(dateToCheck);
      return withinRange(parsedDate);
    })
  ), [matters, activeStart, activeEnd]);

  const filteredWip = useMemo(() => {
    // Normalize a date-like input to a local-day Date at 00:00
    const toLocalDay = (input: unknown): Date | null => {
      if (typeof input !== 'string') {
        const d = input instanceof Date ? input : new Date(input as any);
        if (!Number.isNaN(d.getTime())) {
          return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        return null;
      }
      const s = input.trim();
      // Extract leading YYYY-MM-DD if present
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const da = Number(m[3]);
        return new Date(y, mo, da); // local midnight
      }
      // Fallback: parse and clamp to local midnight
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      return null;
    };

    const startTime = new Date(activeStart.getFullYear(), activeStart.getMonth(), activeStart.getDate()).getTime();
    const endOfDay = new Date(activeEnd);
    endOfDay.setHours(23, 59, 59, 999);
    const endTime = endOfDay.getTime();

    const filtered = wip.filter((entry) => {
      const when = toLocalDay(entry.date || entry.created_at || (entry as any).updated_at);
      if (!when) return false;
      const t = when.getTime();
      return t >= startTime && t <= endTime;
    });

    return filtered;
  }, [wip, activeStart, activeEnd, rangeKey]);

  const filteredFees = useMemo(() => {
    // Debug: log what we're filtering - show actual sample dates
    const sampleDates = fees.slice(0, 10).map(f => f.payment_date);
    console.log('💰 Fees filtering:', {
      totalFees: fees.length,
      activeStart: activeStart?.toISOString(),
      activeEnd: activeEnd?.toISOString(),
      latestPaymentDates: sampleDates,
      hasDataForToday: sampleDates.some(d => d === '2026-01-08'),
      includeDisbursements,
    });
    
    const filtered = fees.filter((entry) => {
      if (!includeDisbursements) {
        // Exclude disbursements - only count actual fees
        // If kind is 'Expense' or 'Product', exclude it
        // If kind is 'Service' or missing (legacy data), include it
        if (entry.kind === 'Expense' || entry.kind === 'Product') {
          return false;
        }
      }
      return withinRange(parseDateValue(entry.payment_date));
    });
    
    console.log('💰 Fees after filter:', filtered.length);
    return filtered;
  }, [fees, activeStart, activeEnd, includeDisbursements]);

  const teamMembers = useMemo(() => (
    team
      .filter((member) => {
        return Boolean(member['Initials']); // Include all team members with initials
      })
      .map((member) => {
        const statusValueRaw = typeof member.status === 'string'
          ? member.status
          : typeof (member as Record<string, unknown>)['Status'] === 'string'
            ? String((member as Record<string, unknown>)['Status'])
            : undefined;
        const isActive = statusValueRaw ? statusValueRaw.toLowerCase() === 'active' : false;
        
        const roleValueRaw = (member as Record<string, unknown>)['Role'] 
          ? String((member as Record<string, unknown>)['Role'])
          : undefined;
        
        // If inactive, role becomes "Inactive" regardless of original role
        if (!isActive) {
          return {
            initials: member['Initials'] ?? '',
            record: member,
            display: displayName(member),
            clioId: member['Clio ID'] ? String(member['Clio ID']) : undefined,
            role: 'Inactive',
            isActive: false,
          };
        }
        
        // Normalize role: map "Non-solicitor" and "Operations 1" to "Ops"
        let normalizedRole = roleValueRaw;
        if (roleValueRaw === 'Non-solicitor' || roleValueRaw === 'Operations 1') {
          normalizedRole = 'Ops';
        }
        
        return {
          initials: member['Initials'] ?? '',
          record: member,
          display: displayName(member),
          clioId: member['Clio ID'] ? String(member['Clio ID']) : undefined,
          role: normalizedRole,
          isActive: true,
        };
      })
      .sort((a, b) => a.display.localeCompare(b.display))
  ), [team]);

  // Filter displayable team members: hide Ops and Inactive unless their filters are selected
  const displayableTeamMembers = useMemo(() => {
    const showOps = selectedRoles.includes('Ops');
    const showInactive = selectedRoles.includes('Inactive');
    
    return teamMembers.filter((member) => {
      // Always show standard fee-earning roles
      if (member.role !== 'Ops' && member.role !== 'Inactive') {
        return true;
      }
      // Show Ops only if Ops filter is active
      if (member.role === 'Ops' && showOps) {
        return true;
      }
      // Show Inactive if Inactive role is enabled OR the specific inactive person is selected
      if (member.role === 'Inactive' && (showInactive || selectedTeams.includes(member.initials))) {
        return true;
      }
      return false;
    });
  }, [teamMembers, selectedRoles, selectedTeams]);

  const inactiveTeamMembers = useMemo(
    () => teamMembers.filter((member) => member.role === 'Inactive'),
    [teamMembers]
  );

  const visibleMembers = useMemo(() => {
    // Start with displayable members (excludes Ops and Inactive unless their filters are active)
    let filtered = displayableTeamMembers;
    
    // Filter by selected team members
    if (selectedTeams.length > 0) {
      filtered = filtered.filter((member) => selectedTeams.includes(member.initials));
    }
    
    // Filter by selected roles
    if (selectedRoles.length > 0) {
      filtered = filtered.filter((member) => {
        const role = member.role ?? '';
        if (selectedRoles.includes(role)) return true;
        if (role === 'Senior Partner' && selectedRoles.includes('Partner')) return true;
        return false;
      });
    }
    
    return filtered;
  }, [displayableTeamMembers, selectedTeams, selectedRoles]);

  // OPTIMIZATION: Pre-index all large datasets to avoid repeated filtering
  
  // Index WIP by Clio ID (156k+ entries)
  const wipByClioId = useMemo(() => {
    const index = new Map<string, typeof filteredWip>();
    filteredWip.forEach((record) => {
      const clioId = record.user_id != null 
        ? String(record.user_id) 
        : record.user?.id != null 
          ? String(record.user.id) 
          : null;
      if (clioId) {
        if (!index.has(clioId)) {
          index.set(clioId, []);
        }
        index.get(clioId)!.push(record);
      }
    });
    return index;
  }, [filteredWip]);

  // Index Fees by Clio ID
  const feesByClioId = useMemo(() => {
    const index = new Map<string, typeof filteredFees>();
    filteredFees.forEach((record) => {
      const clioId = String(record.user_id ?? '');
      if (clioId) {
        if (!index.has(clioId)) {
          index.set(clioId, []);
        }
        index.get(clioId)!.push(record);
      }
    });
    return index;
  }, [filteredFees]);

  const disbursementStats = useMemo(() => {
    const visibleIds = new Set<string>();
    visibleMembers.forEach((m) => {
      if (m.clioId) visibleIds.add(String(m.clioId));
    });

    let inRangeAllCount = 0;
    let inRangeAllTotal = 0;
    let inRangeVisibleCount = 0;
    let inRangeVisibleTotal = 0;

    for (const record of fees) {
      if (record.kind !== 'Expense' && record.kind !== 'Product') continue;
      if (!withinRange(parseDateValue(record.payment_date))) continue;

      const amount = safeNumber(record.payment_allocated);
      inRangeAllCount += 1;
      inRangeAllTotal += amount;

      const userId = record.user_id != null ? String(record.user_id) : '';
      if (userId && visibleIds.has(userId)) {
        inRangeVisibleCount += 1;
        inRangeVisibleTotal += amount;
      }
    }

    return {
      inRangeAllCount,
      inRangeAllTotal,
      inRangeVisibleCount,
      inRangeVisibleTotal,
    };
  }, [fees, visibleMembers, activeStart, activeEnd]);

  const collectedTooltipDetails = useMemo(() => {
    const showOps = selectedRoles.includes('Ops');
    const showInactive = selectedRoles.includes('Inactive');
    const hiddenOpsCount = teamMembers.filter((m) => m.role === 'Ops' && !showOps).length;
    const hiddenInactiveCount = teamMembers.filter((m) => m.role === 'Inactive' && !showInactive).length;

    return {
      selectedTeamsLabel: selectedTeams.length > 0 ? selectedTeams.join(', ') : 'All',
      selectedRolesLabel: selectedRoles.length > 0 ? selectedRoles.join(', ') : 'All',
      showOps,
      showInactive,
      hiddenOpsCount,
      hiddenInactiveCount,
      totalTeamMembers: teamMembers.length,
      visibleMembers: visibleMembers.length,
    };
  }, [selectedTeams, selectedRoles, teamMembers, visibleMembers]);

  // Index Enquiries by email and initials (1172 enquiries)
  const enquiriesByContact = useMemo(() => {
    const byEmail = new Map<string, typeof filteredEnquiries>();
    const byInitials = new Map<string, typeof filteredEnquiries>();
    
    filteredEnquiries.forEach((enquiry) => {
      // Index by email
      if (typeof enquiry.Point_of_Contact === 'string') {
        const email = enquiry.Point_of_Contact.toLowerCase();
        if (!byEmail.has(email)) {
          byEmail.set(email, []);
        }
        byEmail.get(email)!.push(enquiry);
      }
      
      // Index by initials (for fallback matching)
      const poc = String(enquiry.Point_of_Contact || '').toUpperCase();
      if (poc && poc.length <= 4) { // Likely initials
        if (!byInitials.has(poc)) {
          byInitials.set(poc, []);
        }
        byInitials.get(poc)!.push(enquiry);
      }
    });
    
    return { byEmail, byInitials };
  }, [filteredEnquiries]);

  // Index Matters by normalized solicitor name (5594 matters)
  // OPTIMIZED: Use more efficient Map operations with deduplication
  const mattersBySolicitor = useMemo(() => {
    const index = new Map<string, Map<string, typeof filteredMatters[0]>>();
    
    filteredMatters.forEach((matter) => {
      const rawOriginating = mapNameIfNeeded((matter as any)['Originating Solicitor'] ?? (matter as any).OriginatingSolicitor);
      const rawResponsible = mapNameIfNeeded((matter as any)['Responsible Solicitor'] ?? (matter as any).ResponsibleSolicitor);
      
      // Normalize once per matter (cached by normalizePersonName)
      const normalizedOriginating = normalizeName(rawOriginating);
      const normalizedResponsible = normalizeName(rawResponsible);
      
      // Use matter ID as unique key to prevent duplicates
      const matterId = (matter as any).matterId || (matter as any)['Unique ID'] || (matter as any).UniqueID || JSON.stringify(matter);
      
      // Index by originating solicitor - use deduplication map
      if (normalizedOriginating) {
        if (!index.has(normalizedOriginating)) {
          index.set(normalizedOriginating, new Map());
        }
        index.get(normalizedOriginating)!.set(matterId, matter);
      }
      
      // Index by responsible solicitor - use deduplication map
      if (normalizedResponsible) {
        if (!index.has(normalizedResponsible)) {
          index.set(normalizedResponsible, new Map());
        }
        index.get(normalizedResponsible)!.set(matterId, matter);
      }
    });
    
    // Convert back to arrays without duplicates
    const finalIndex = new Map<string, typeof filteredMatters>();
    index.forEach((matterMap, solicitor) => {
      finalIndex.set(solicitor, Array.from(matterMap.values()));
    });
    
    return finalIndex;
  }, [filteredMatters]);

  const metricsByMember: MemberMetrics[] = useMemo(() => (
    visibleMembers.map((member) => {
      const memberEmail = (member.record as Record<string, unknown>)['Email']
        ? String((member.record as Record<string, unknown>)['Email']).toLowerCase()
        : undefined;
      const memberFullName = (member.record as Record<string, unknown>)['Full Name']
        ? String((member.record as Record<string, unknown>)['Full Name'])
        : member.display;

      // OPTIMIZED: Use pre-indexed enquiries lookup
      let enquiriesForMember: typeof filteredEnquiries = [];
      if (memberEmail) {
        // Primary: lookup by email (O(1))
        enquiriesForMember = enquiriesByContact.byEmail.get(memberEmail) || [];
      } else {
        // Fallback: lookup by initials (O(1))
        enquiriesForMember = enquiriesByContact.byInitials.get(member.initials.toUpperCase()) || [];
      }

      // OPTIMIZED: Use pre-indexed matters lookup with normalized name (O(1))
      const normalizedMemberName = normalizeName(memberFullName);
      const mattersForMember = normalizedMemberName 
        ? (mattersBySolicitor.get(normalizedMemberName) || [])
        : [];

      // OPTIMIZED: Use pre-indexed lookups instead of filtering 156k+ entries
      const wipForMember = member.clioId ? (wipByClioId.get(member.clioId) || []) : [];
      const feesForMember = member.clioId ? (feesByClioId.get(member.clioId) || []) : [];
      const wipHours = wipForMember.reduce((total, record) => total + safeNumber(record.quantity_in_hours), 0);
      const targetHours = startDate && endDate ? calculateTargetHours(startDate, endDate, member.initials) : 0;
      
      // Check if member was completely away for daily/weekly views
      const completelyAway = startDate && endDate && 
        (rangeKey === 'today' || rangeKey === 'week') && 
        wasCompletelyAway(startDate, endDate, member.initials);
      
      // Check if member has 0 hours but had leave days (should be neutral, not penalized)
      const hadLeaveWithNoWork = wipHours === 0 && startDate && endDate && 
        rawAnnualLeave && rawAnnualLeave.some(record => {
          if (record.fe !== member.initials) return false;
          if (!(record.status.toLowerCase().includes('approved') || record.status.toLowerCase().includes('confirmed'))) return false;
          
          const leaveStart = new Date(record.start_date);
          const leaveEnd = new Date(record.end_date);
          
          // Check if leave period overlaps with our date range
          return leaveStart <= endDate && leaveEnd >= startDate;
        });
      
      let trendDirection: 'up' | 'down' | 'neutral' | 'away';
      if (completelyAway) {
        trendDirection = 'away';
      } else if (hadLeaveWithNoWork) {
        trendDirection = 'neutral';
      } else if (targetHours === 0 && wipHours > 0) {
        // If target calculation failed but they have work hours, show as above target
        trendDirection = 'up';
      } else {
        trendDirection = getTrendDirection(wipHours, targetHours);
      }
      
      return {
        initials: member.initials,
        displayName: member.display,
        enquiries: enquiriesForMember.length,
        matters: mattersForMember.length,
        wipHours,
        wipValue: wipForMember.reduce((total, record) => total + safeNumber(record.total), 0),
        collected: feesForMember.reduce((total, record) => total + safeNumber(record.payment_allocated), 0),
        targetHours,
        trendDirection,
      } as MemberMetrics;
    })
  ), [visibleMembers, enquiriesByContact, mattersBySolicitor, wipByClioId, feesByClioId]);

  // Sort the metrics by the selected column and direction
  const sortedMetricsByMember = useMemo(() => {
    const sorted = [...metricsByMember].sort((a, b) => {
      // First, separate active (has work) from inactive (no work) members
      const aHasWork = a.wipHours > 0;
      const bHasWork = b.wipHours > 0;
      
      // Active members always come before inactive members
      if (aHasWork && !bHasWork) return -1;
      if (!aHasWork && bHasWork) return 1;
      
      // Within the same group (active or inactive), sort by the selected column
      let aValue: string | number = a[sortColumn];
      let bValue: string | number = b[sortColumn];

      // For string comparison (displayName), use locale compare
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? result : -result;
      }

      // For numeric comparison
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const result = aValue - bValue;
        return sortDirection === 'asc' ? result : -result;
      }

      return 0;
    });
    return sorted;
  }, [metricsByMember, sortColumn, sortDirection]);

  const totals = useMemo(() => (
    sortedMetricsByMember.reduce(
      (acc, row) => ({
        enquiries: acc.enquiries + row.enquiries,
        matters: acc.matters + row.matters,
        wipHours: acc.wipHours + row.wipHours,
        wipValue: acc.wipValue + row.wipValue,
        collected: acc.collected + row.collected,
      }),
      { enquiries: 0, matters: 0, wipHours: 0, wipValue: 0, collected: 0 },
    )
  ), [sortedMetricsByMember]);

  const summaryTotals = useMemo(() => {
    const wipAggregates = filteredWip.reduce(
      (acc, record) => ({
        hours: acc.hours + safeNumber(record.quantity_in_hours),
        value: acc.value + safeNumber(record.total),
      }),
      { hours: 0, value: 0 },
    );

    const collectedTotal = filteredFees.reduce(
      (acc, record) => acc + safeNumber(record.payment_allocated),
      0,
    );

    return {
      enquiries: filteredEnquiries.length,
      matters: filteredMatters.length,
      wipHours: wipAggregates.hours,
      wipValue: wipAggregates.value,
      collected: collectedTotal,
    };
  }, [filteredEnquiries, filteredMatters, filteredWip, filteredFees]);

  // Calculate previous period metrics for comparison
  const previousRange = React.useMemo<{ start: Date; end: Date } | null>(
    () => computePreviousRange(rangeKey, startDate || rangeStart, endDate || rangeEnd),
    [rangeKey, startDate, endDate, rangeStart, rangeEnd]
  );
  
  // Debug logging for previous range
  debugLog('🔍 Previous Range Debug:', {
    rangeKey,
    currentStart: startDate || rangeStart,
    currentEnd: endDate || rangeEnd,
    previousRange,
    hasPreviousRange: !!previousRange
  });
  
  const previousMetrics = useMemo(() => {
    if (!previousRange) {
      debugLog('❌ No previous range calculated');
      return null;
    }

    debugLog('📊 Calculating previous metrics for range:', previousRange);

    const prevEnquiries = rawEnquiries?.filter((e: any) => {
      const date = parseDateValue(e.Touchpoint_Date);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevMatters = rawMatters?.filter((m: any) => {
      // Align with current-period filtering: prefer Open Date, fallback to Close Date
      const openDate = (m as any)['Open Date'] ?? m.OpenDate;
      const closeDate = (m as any)['Close Date'] ?? m.CloseDate;
      const dateToCheck = openDate ?? closeDate ?? '';
      const date = parseDateValue(dateToCheck);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevWip = rawWip?.filter((w: any) => {
      const date = parseDateValue(w.created_at);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevFees = rawFees?.filter((f: any) => {
      if (!includeDisbursements && (f.kind === 'Expense' || f.kind === 'Product')) {
        return false;
      }
      const date = parseDateValue(f.payment_date);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    return {
      enquiries: prevEnquiries.length,
      matters: prevMatters.length,
      wipHours: prevWip.reduce((total: number, record: any) => total + safeNumber(record.quantity_in_hours), 0),
      wipValue: prevWip.reduce((total: number, record: any) => total + safeNumber(record.total), 0),
      collected: prevFees.reduce((total: number, record: any) => total + safeNumber(record.payment_allocated), 0),
    };
  }, [previousRange, rawEnquiries, rawMatters, rawWip, rawFees, includeDisbursements]);

  // Calculate previous period metrics for individual team members
  const previousMemberMetrics = useMemo(() => {
    if (!previousRange || !teamMembers.length) return new Map();

    const prevEnquiries = rawEnquiries?.filter((e: any) => {
      const date = parseDateValue(e.Touchpoint_Date);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevMatters = rawMatters?.filter((m: any) => {
      // Align with current-period filtering: prefer Open Date, fallback to Close Date
      const openDate = (m as any)['Open Date'] ?? m.OpenDate;
      const closeDate = (m as any)['Close Date'] ?? m.CloseDate;
      const dateToCheck = openDate ?? closeDate ?? '';
      const date = parseDateValue(dateToCheck);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevWip = rawWip?.filter((w: any) => {
      const date = parseDateValue(w.created_at);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const prevFees = rawFees?.filter((f: any) => {
      if (!includeDisbursements && (f.kind === 'Expense' || f.kind === 'Product')) {
        return false;
      }
      const date = parseDateValue(f.payment_date);
      return date && date >= previousRange.start && date <= previousRange.end;
    }) || [];

    const memberMap = new Map();

    teamMembers.forEach((member) => {
      // Calculate previous period metrics for this member
      const prevEnquiriesForMember = prevEnquiries.filter((enquiry: any) => {
        const memberEmail = member.record.Email?.toLowerCase();
        if (memberEmail && enquiry.Point_of_Contact?.toLowerCase() === memberEmail) {
          return true;
        }
        return enquiriesHandledBy(enquiry, member.initials);
      });

      const prevMattersForMember = prevMatters.filter((matter: any) => 
        matterOwnedBy(matter, member.initials)
      );

      const prevWipForMember = prevWip.filter((wipEntry: any) => {
        if (!member.clioId) return false;
        const flat = wipEntry.user_id != null ? String(wipEntry.user_id) : undefined;
        const nested = wipEntry.user?.id != null ? String(wipEntry.user.id) : undefined;
        return flat === member.clioId || nested === member.clioId;
      });

      const prevFeesForMember = prevFees.filter((fee: any) => {
        return member.clioId ? String(fee.user_id ?? '') === member.clioId : false;
      });

      const prevWipHours = prevWipForMember.reduce((total: number, record: any) => 
        total + safeNumber(record.quantity_in_hours), 0
      );
      const prevWipValue = prevWipForMember.reduce((total: number, record: any) => 
        total + safeNumber(record.total), 0
      );
      const prevCollected = prevFeesForMember.reduce((total: number, record: any) => 
        total + safeNumber(record.payment_allocated), 0
      );

      memberMap.set(member.initials, {
        enquiries: prevEnquiriesForMember.length,
        matters: prevMattersForMember.length,
        wipHours: prevWipHours,
        wipValue: prevWipValue,
        collected: prevCollected,
      });

      // Temporary debug for matters - remove after testing
      if (member.initials === 'CH' && prevMattersForMember.length === 0) {
        debugLog('CH matters debug:', {
          totalPrevMatters: prevMatters.length,
          prevMattersForMember: prevMattersForMember.length,
          memberInitials: member.initials,
          sampleMatters: prevMatters.slice(0, 3).map((m: any) => ({
            DateOpened: m.DateOpened,
            ResponsibleSolicitor: m.ResponsibleSolicitor,
            OriginatingSolicitor: m.OriginatingSolicitor
          }))
        });
      }
    });

    return memberMap;
  }, [previousRange, rawEnquiries, rawMatters, rawWip, rawFees, teamMembers, includeDisbursements]);

  // Helper function to calculate percentage change
  const calculateChange = (current: number, previous: number): { percentage: number; direction: 'up' | 'down' | 'neutral' } => {
    // If both are zero, no change
    if (current === 0 && previous === 0) {
      return { percentage: 0, direction: 'neutral' };
    }
    
    // If previous is zero but current has value, that's a new addition (not 100% increase)
    if (previous === 0 && current > 0) {
      return { percentage: current, direction: 'up' };
    }
    
    // If current is zero but previous had value, that's a complete drop
    if (current === 0 && previous > 0) {
      return { percentage: 100, direction: 'down' };
    }
    
    // Normal percentage calculation
    const percentage = ((current - previous) / previous) * 100;
    return {
      percentage: Math.abs(percentage),
      direction: percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'neutral'
    };
  };

  // Helper function to render trend indicator
  const renderTrendIndicator = (current: number, previous: number | undefined, type: 'count' | 'currency' | 'hours' = 'count', metricName: string) => {
    if (!previousMetrics || previous === undefined) return null;

    const change = calculateChange(current, previous);
    if (change.direction === 'neutral') return null;

    const color = change.direction === 'up' 
      ? (isDarkMode ? '#22c55e' : '#16a34a') 
      : (isDarkMode ? '#ef4444' : '#dc2626');

    const arrow = change.direction === 'up' ? '↗' : '↘';
    
    // Different display logic based on type
    let displayText: string;
    
    if (type === 'currency') {
      // For currency, show actual amount difference
      const difference = current - previous;
      const absChange = Math.abs(difference);
      if (absChange >= 1000) {
        displayText = `£${(absChange / 1000).toFixed(0)}k`;
      } else {
        displayText = `£${absChange.toFixed(0)}`;
      }
    } else if (type === 'hours') {
      // For hours, show hour difference for small changes, percentage for large
      const difference = Math.abs(current - previous);
      if (difference < 10) {
        displayText = `${difference.toFixed(1)}h`;
      } else {
        displayText = `${change.percentage.toFixed(0)}%`;
      }
    } else {
      // For counts (enquiries, matters), show numbers for small changes, percentages for large
      const difference = Math.abs(current - previous);
      if (previous === 0 && current > 0) {
        displayText = `+${current}`;
      } else if (current === 0 && previous > 0) {
        displayText = `${difference}`;
      } else if (difference <= 5) {
        displayText = `${difference}`;
      } else {
        displayText = `${change.percentage.toFixed(0)}%`;
      }
    }

    return (
      <span 
        style={{
          fontSize: 10,
          fontWeight: 600,
          color,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          fontFamily: 'Raleway, sans-serif',
          letterSpacing: '0.02em',
          cursor: 'help',
          padding: '2px 4px',
          borderRadius: 4,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoveredMetric({
            type: metricName,
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          });
        }}
        onMouseLeave={() => setHoveredMetric(null)}
        title={`Compare ${getRangeLabel(rangeKey)} vs ${getPreviousRangeLabel(rangeKey)}`}
      >
        {arrow} {displayText}
      </span>
    );
  };

  const handleRangeSelect = (key: RangeKey) => {
    setRangeKey(key);
    if (key === 'custom') {
      return;
    }

    const newRange = computeRange(key);
    setRangeState(newRange);
    if (key === 'all') {
      setStartDate(undefined);
      setEndDate(undefined);
    } else {
      setStartDate(newRange.start);
      setEndDate(newRange.end);
    }
  };

  const initialiseCustomDates = () => {
    const today = new Date();
    const fallbackStart = (!activeStart || rangeKey === 'all' || activeStart.getFullYear() < 1980)
      ? (() => {
          const start = new Date(today);
          start.setDate(today.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          return start;
        })()
      : new Date(activeStart);

    const fallbackEnd = (!activeEnd || rangeKey === 'all')
      ? (() => {
          const end = new Date(today);
          end.setHours(23, 59, 59, 999);
          return end;
        })()
      : new Date(activeEnd);

    setStartDate(fallbackStart);
    setEndDate(fallbackEnd);
  };

  const handleActivateCustomRange = () => {
    if (isCustomRange) {
      return;
    }
    initialiseCustomDates();
    setRangeKey('custom');
  };

  const toggleTeamSelection = (initials: string) => {
    setSelectedTeams((prev) => (
      prev.includes(initials)
        ? prev.filter((item) => item !== initials)
        : [...prev, initials]
    ));
  };

  const toggleInactiveTeamSelection = (initials: string) => {
    setSelectedTeams((prev) => {
      const baseSelection = prev.length === 0
        ? displayableTeamMembers.map((m) => m.initials)
        : prev;

      return baseSelection.includes(initials)
        ? baseSelection.filter((item) => item !== initials)
        : [...baseSelection, initials];
    });
  };

  const toggleRoleSelection = (role: string) => {
    const isRoleCurrentlySelected = selectedRoles.includes(role);

    const roleGroup = (roleKey: string): string[] => {
      if (roleKey === 'Partner') return ['Partner', 'Senior Partner'];
      return [roleKey];
    };

    const roleMatchesSelection = (memberRole: string | undefined, roles: string[]): boolean => {
      if (!memberRole) return false;
      if (roles.includes(memberRole)) return true;
      if (memberRole === 'Senior Partner' && roles.includes('Partner')) return true;
      return false;
    };
    
    // Update role selection
    setSelectedRoles((prev) => (
      isRoleCurrentlySelected
        ? prev.filter((item) => item !== role)
        : [...prev, role]
    ));
    
    // Auto-select team members with this role (use teamMembers, not displayableTeamMembers)
    if (!isRoleCurrentlySelected) {
      // Adding role - select all members with this role
      const membersWithRole = teamMembers
        .filter(member => roleGroup(role).includes(member.role ?? ''))
        .map(member => member.initials);
      
      setSelectedTeams(prev => {
        const newSet = new Set([...prev, ...membersWithRole]);
        return Array.from(newSet);
      });
    } else {
      // Removing role - deselect members with ONLY this role
      // (keep members who also match other selected roles)
      const remainingRoles = selectedRoles.filter(r => r !== role);
      
      if (remainingRoles.length > 0) {
        // Keep members who have any of the remaining selected roles
        setSelectedTeams(prev => 
          prev.filter(initials => {
            const member = teamMembers.find(m => m.initials === initials);
            return member && roleMatchesSelection(member.role, remainingRoles);
          })
        );
      } else {
        // No other roles selected, clear team selection
        const membersWithRole = teamMembers
          .filter(member => roleGroup(role).includes(member.role ?? ''))
          .map(member => member.initials);
        
        setSelectedTeams(prev => prev.filter(initials => !membersWithRole.includes(initials)));
      }
    }
  };

  // Check if a team member has worked (has WIP hours) in the current date range
  const memberHasWorked = (memberInitials: string): boolean => {
    // Check WIP data directly for the member, not through metricsByMember
    // This ensures the visual state is independent of filters
    const member = teamMembers.find(m => m.initials === memberInitials);
    if (!member || !member.clioId) return false;
    
    const wipForMember = wipByClioId.get(member.clioId) || [];
    const wipHours = wipForMember.reduce((total, record) => total + safeNumber(record.quantity_in_hours), 0);
    return wipHours > 0;
  };

  const handleColumnSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn): JSX.Element => {
    const isActive = sortColumn === column;
    const iconStyle: React.CSSProperties = {
      marginLeft: '6px',
      fontSize: '10px',
      opacity: isActive ? 0.9 : 0.35,
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      fontWeight: 'normal',
      color: 'currentColor',
      display: 'inline-block',
      lineHeight: 1,
    };

    if (!isActive) {
      return (
        <span style={iconStyle}>▴</span>
      );
    }

    return (
      <span style={iconStyle}>
        {sortDirection === 'asc' ? '▴' : '▾'}
      </span>
    );
  };

  const dashboardThemeClass = isDarkMode ? 'dark-theme' : 'light-theme';
  const allTeamsSelected = selectedTeams.length === 0 || selectedTeams.length === displayableTeamMembers.length;
  const allRolesSelected = selectedRoles.length === 0 || selectedRoles.length === ROLE_OPTIONS.length;

  const handleSelectAllTeams = () => {
    if (allTeamsSelected) {
      return;
    }
    setSelectedTeams([]);
  };

  const handleSelectAllRoles = () => {
    if (allRolesSelected) {
      return;
    }
    setSelectedRoles([]);
    // Also clear team selections that were auto-selected by roles
    setSelectedTeams([]);
  };

  const isCustomRange = rangeKey === 'custom';
  const activePresetKey = RANGE_OPTIONS.some(option => option.key === rangeKey)
    ? rangeKey
    : undefined;
  const isAllPresetActive = rangeKey === 'all';
  const formattedFromLabel = rangeKey === 'all' ? 'All Time' : formatDateTag(activeStart);
  const formattedToLabel = formatDateTag(activeEnd);

  const handleClearAllTime = () => {
    handleRangeSelect('all');
  };

  return (
    <div className={`management-dashboard-container animate-dashboard ${dashboardThemeClass}`}>
      <div className="filter-toolbar">
        <div className="filter-toolbar__top">
          <div className="filter-toolbar__date-inputs">
            {isCustomRange ? (
              <div className="date-pickers">
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={startDate}
                  onSelectDate={(date) => {
                    setStartDate(date ?? undefined);
                    setRangeKey('custom');
                  }}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={endDate}
                  onSelectDate={(date) => {
                    setEndDate(date ?? undefined);
                    setRangeKey('custom');
                  }}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
              </div>
            ) : (
              <div className="date-stamp-group">
                <button
                  type="button"
                  className="date-stamp-button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={handleActivateCustomRange}
                  title="Click to customise the start date"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>From</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedFromLabel}</span>
                </button>
                <button
                  type="button"
                  className="date-stamp-button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={handleActivateCustomRange}
                  title="Click to customise the end date"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>To</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedToLabel}</span>
                </button>
              </div>
            )}
          </div>

          <div className="filter-toolbar__actions">
            <div 
              className="filter-status-chip"
              style={{
                borderColor: isFetching ? undefined : getRefreshIndicatorColor(),
                transition: 'border-color 1s ease',
              }}
              title={
                isFetching 
                  ? 'Refreshing data...' 
                  : `Next auto-refresh in ${Math.floor((15 * 60 - timeElapsed) / 60)}m ${(15 * 60 - timeElapsed) % 60}s`
              }
            >
              {isFetching ? (
                <>
                  <div className="filter-status-indicator" />
                  Refreshing
                </>
              ) : (
                <>
                  <div 
                    className="filter-status-indicator" 
                    style={{ 
                      background: getRefreshIndicatorColor(),
                      transition: 'background 1s ease',
                    }}
                  />
                  {formatTimeAgo(lastRefreshTimestamp)}
                </>
              )}
            </div>

            <DefaultButton
              text={includeDisbursements ? 'Disbursements: Included' : 'Disbursements: Excluded'}
              onClick={() => setIncludeDisbursements((v) => !v)}
              styles={{
                root: {
                  height: 36,
                  borderRadius: 10,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(13, 47, 96, 0.18)'}`,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.6)',
                  color: isDarkMode ? '#e2e8f0' : '#0f172a',
                },
                rootHovered: {
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)',
                  border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.4)' : 'rgba(54, 144, 206, 0.35)'}`,
                },
                rootPressed: {
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(248, 250, 252, 1)',
                },
              }}
              title={
                includeDisbursements
                  ? 'Currently including disbursements in Collected totals'
                  : 'Currently excluding disbursements from Collected totals'
              }
            />

            {triggerRefresh && (
              <button
                type="button"
                onClick={() => {
                  setProcessingModal({
                    visible: true,
                    title: 'Refreshing',
                    message: 'Fetching latest data from all sources…',
                  });
                  showToast({ type: 'loading', message: 'Refreshing dashboard data…' });
                  triggerRefresh();
                  setTimeElapsed(0); // Reset timer on manual refresh
                }}
                disabled={isFetching}
                className="filter-icon-button"
                title={isFetching ? 'Refreshing data...' : 'Refresh datasets (auto-refreshes every 15 min)'}
                aria-label={isFetching ? 'Refreshing data' : 'Refresh datasets'}
              >
                <Icon 
                  iconName="Refresh" 
                  style={{ 
                    fontSize: 16,
                    animation: isFetching ? 'spin 1s linear infinite' : 'none'
                  }} 
                />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRoleFilter(!showRoleFilter)}
              className="filter-icon-button"
              style={{
                color: showRoleFilter 
                  ? (isDarkMode ? '#60a5fa' : colours.highlight)
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(13, 47, 96, 0.5)'),
                transform: showRoleFilter ? 'translateY(-1px)' : 'translateY(0)'
              }}
              title={showRoleFilter ? 'Hide role filter' : 'Show role filter'}
              aria-label={showRoleFilter ? 'Hide role filter' : 'Show role filter'}
            >
              <Icon iconName="People" style={{ fontSize: 16 }} />
            </button>

            <div className="filter-icon-button-wrapper">
              <button
                type="button"
                onMouseEnter={() => setShowDatasetInfo(true)}
                onMouseLeave={() => setShowDatasetInfo(false)}
                className="filter-icon-button"
                style={{
                  color: isDarkMode ? '#60a5fa' : colours.highlight,
                  transform: showDatasetInfo ? 'translateY(-1px)' : 'translateY(0)'
                }}
                title="Dataset information"
                aria-label="Dataset information"
              >
                <Icon iconName="Info" style={{ fontSize: 16 }} />
              </button>

              {showDatasetInfo && (
                <div className="filter-dataset-tooltip">
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: isDarkMode ? '#60a5fa' : colours.highlight }}>
                    Dataset Date Ranges
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Enquiries:</span>
                      <span style={{ fontWeight: 600 }}>Last 24 months</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Matters:</span>
                      <span style={{ fontWeight: 600 }}>Last 24 months</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>WIP:</span>
                      <span style={{ fontWeight: 600 }}>Last 12 months</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Recovered Fees:</span>
                      <span style={{ fontWeight: 600 }}>Last 12 months</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Annual Leave:</span>
                      <span style={{ fontWeight: 600 }}>Current year</span>
                    </div>
                  </div>
                  <div style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                    fontSize: 11,
                    opacity: 0.7,
                    fontStyle: 'italic'
                  }}>
                    Data outside these ranges won't appear in metrics
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="filter-toolbar__middle">
          <div className="filter-toolbar__presets">
            <div className="filter-preset-group">
              {RANGE_OPTIONS.slice(0, 2).map(({ key, label }) => {
                const presetDisabled = isRangeDisabled(key);
                return (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRangeSelect(key)}
                    disabled={presetDisabled}
                    styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                  />
                );
              })}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(2, 4).map(({ key, label }) => {
                const presetDisabled = isRangeDisabled(key);
                return (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRangeSelect(key)}
                    disabled={presetDisabled}
                    styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                  />
                );
              })}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(4, 6).map(({ key, label }) => {
                const presetDisabled = isRangeDisabled(key);
                return (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRangeSelect(key)}
                    disabled={presetDisabled}
                    styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                  />
                );
              })}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(6, 8).map(({ key, label }) => {
                const presetDisabled = isRangeDisabled(key);
                return (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRangeSelect(key)}
                    disabled={presetDisabled}
                    styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                  />
                );
              })}
              <div className="preset-separator">|</div>
              {RANGE_OPTIONS.slice(8, 10).map(({ key, label }) => {
                const presetDisabled = isRangeDisabled(key);
                return (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => handleRangeSelect(key)}
                    disabled={presetDisabled}
                    styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                  />
                );
              })}
              {activePresetKey && activePresetKey !== 'all' && (
                <button
                  onClick={handleClearAllTime}
                  style={clearFilterButtonStyle(isDarkMode)}
                  title="Clear date range filter"
                >
                  <span style={{ fontSize: 16 }}>×</span>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="filter-toolbar__bottom">
          <div className="filter-group-container team-filter-container">
            <div className="team-slicer-buttons">
              {displayableTeamMembers.map((member) => (
                <DefaultButton
                  key={member.initials}
                  text={member.initials}
                  onClick={() => toggleTeamSelection(member.initials)}
                  title={memberHasWorked(member.initials) ? undefined : `${member.display || member.initials} has no WIP hours in this period`}
                  styles={getTeamButtonStyles(isDarkMode, selectedTeams.includes(member.initials), memberHasWorked(member.initials), member.role === 'Inactive')}
                />
              ))}
              {!allTeamsSelected && (
                <button
                  onClick={handleSelectAllTeams}
                  style={clearFilterButtonStyle(isDarkMode)}
                  title="Clear team filter"
                >
                  <span style={{ fontSize: 16 }}>×</span>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {showRoleFilter && (
          <div className="filter-toolbar__roles">
            <div className="filter-group-container role-filter-container">
              <div className="role-slicer-buttons">
                {ROLE_OPTIONS.map(({ key, label }) => (
                  <DefaultButton
                    key={key}
                    text={label}
                    onClick={() => toggleRoleSelection(key)}
                    styles={getRoleButtonStyles(isDarkMode, selectedRoles.includes(key))}
                  />
                ))}
                {!allRolesSelected && (
                  <button
                    onClick={handleSelectAllRoles}
                    style={clearFilterButtonStyle(isDarkMode)}
                    title="Clear role filter"
                  >
                    <span style={{ fontSize: 16 }}>×</span>
                    Clear
                  </button>
                )}
              </div>

                {inactiveTeamMembers.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: 0.75,
                      marginBottom: 6,
                    }}>
                      Inactive people
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {inactiveTeamMembers.map((member) => (
                        <DefaultButton
                          key={`inactive-${member.initials}`}
                          text={member.initials}
                          onClick={() => toggleInactiveTeamSelection(member.initials)}
                          title={`${member.display || member.initials} (Inactive)`}
                          styles={getTeamButtonStyles(
                            isDarkMode,
                            selectedTeams.includes(member.initials),
                            memberHasWorked(member.initials),
                            true
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <span style={summaryChipLabelStyle()}>Enquiries</span>
            {renderTrendIndicator(summaryTotals.enquiries, previousMetrics?.enquiries, 'count', 'enquiries')}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{summaryTotals.enquiries.toLocaleString('en-GB')}</span>
        </div>
        <div style={summaryChipStyle(isDarkMode)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <span style={summaryChipLabelStyle()}>Matters</span>
            {renderTrendIndicator(summaryTotals.matters, previousMetrics?.matters, 'count', 'matters')}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{summaryTotals.matters.toLocaleString('en-GB')}</span>
        </div>
        <div
          style={{
            ...summaryChipStyle(isDarkMode),
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={summaryChipLabelStyle()}>WIP Hours</span>
              <span
                onMouseEnter={() => setShowWipInfo(true)}
                onMouseLeave={() => setShowWipInfo(false)}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon
                  iconName="Info"
                  style={{
                    fontSize: 10,
                    opacity: 0.35,
                    cursor: 'help',
                  }}
                />
              </span>
            </div>
            {renderTrendIndicator(summaryTotals.wipHours, previousMetrics?.wipHours, 'hours', 'wipHours')}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{formatHours(summaryTotals.wipHours)}</span>

          {showWipInfo && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                padding: '10px 12px',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                borderRadius: 8,
                boxShadow: isDarkMode ? '0 8px 16px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                fontSize: 11,
                lineHeight: 1.5,
                width: 260,
                zIndex: 1000,
                color: isDarkMode ? '#e2e8f0' : '#334155',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12 }}>
                WIP totals (current view)
              </div>
              <div style={{ opacity: 0.85 }}>
                Includes non-chargeable time from Clio and SQL sources.
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            ...summaryChipStyle(isDarkMode),
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={summaryChipLabelStyle()}>WIP (£)</span>
              <span
                onMouseEnter={() => setShowWipValueInfo(true)}
                onMouseLeave={() => setShowWipValueInfo(false)}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon
                  iconName="Info"
                  style={{
                    fontSize: 10,
                    opacity: 0.35,
                    cursor: 'help',
                  }}
                />
              </span>
            </div>
            {renderTrendIndicator(summaryTotals.wipValue, previousMetrics?.wipValue, 'currency', 'wipValue')}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(summaryTotals.wipValue)}</span>

          {showWipValueInfo && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                padding: '10px 12px',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                borderRadius: 8,
                boxShadow: isDarkMode ? '0 8px 16px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                fontSize: 11,
                lineHeight: 1.5,
                width: 260,
                zIndex: 1000,
                color: isDarkMode ? '#e2e8f0' : '#334155',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12 }}>
                WIP totals (current view)
              </div>
              <div style={{ opacity: 0.85 }}>
                Includes non-chargeable time from Clio and SQL sources.
              </div>
            </div>
          )}
        </div>
        <div 
          style={{
            ...summaryChipStyle(isDarkMode),
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={summaryChipLabelStyle()}>Collected</span>
              <span
                onMouseEnter={() => setShowCollectedInfo(true)}
                onMouseLeave={() => setShowCollectedInfo(false)}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon 
                  iconName="Info" 
                  style={{ 
                    fontSize: 10, 
                    opacity: 0.35,
                    cursor: 'help'
                  }} 
                />
              </span>
            </div>
            {renderTrendIndicator(summaryTotals.collected, previousMetrics?.collected, 'currency', 'collected')}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(summaryTotals.collected)}</span>
          
          {showCollectedInfo && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                padding: '10px 12px',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                borderRadius: 8,
                boxShadow: isDarkMode ? '0 8px 16px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                fontSize: 11,
                lineHeight: 1.5,
                width: 280,
                zIndex: 1000,
                color: isDarkMode ? '#e2e8f0' : '#334155',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12 }}>
                Collected totals (current view)
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ opacity: 0.75 }}>Top card (all fee entries)</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(summaryTotals.collected)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                <span style={{ opacity: 0.75 }}>Table Total (visible members)</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(totals.collected)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                <span style={{ opacity: 0.75 }}>Difference (top − table)</span>
                <span style={{ fontWeight: 800 }}>{formatCurrency(summaryTotals.collected - totals.collected)}</span>
              </div>

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, opacity: 0.9 }}>
                  Active filters
                </div>
                <div style={{ opacity: 0.8 }}>
                  Teams: <span style={{ fontWeight: 600 }}>{collectedTooltipDetails.selectedTeamsLabel}</span>
                </div>
                <div style={{ opacity: 0.8 }}>
                  Roles: <span style={{ fontWeight: 600 }}>{collectedTooltipDetails.selectedRolesLabel}</span>
                </div>
                <div style={{ opacity: 0.8 }}>
                  Visible members: <span style={{ fontWeight: 600 }}>{collectedTooltipDetails.visibleMembers.toLocaleString('en-GB')}</span>
                  {' '} / {collectedTooltipDetails.totalTeamMembers.toLocaleString('en-GB')}
                </div>
                <div style={{ opacity: 0.75, marginTop: 4, fontSize: 10 }}>
                  Ops shown: {collectedTooltipDetails.showOps ? 'Yes' : 'No'}
                  {collectedTooltipDetails.hiddenOpsCount > 0 ? ` (${collectedTooltipDetails.hiddenOpsCount} hidden)` : ''}
                  {' · '}Inactive shown: {collectedTooltipDetails.showInactive ? 'Yes' : 'No'}
                  {collectedTooltipDetails.hiddenInactiveCount > 0 ? ` (${collectedTooltipDetails.hiddenInactiveCount} hidden)` : ''}
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                  fontSize: 10,
                  opacity: 0.75,
                }}
              >
                Disbursements: {includeDisbursements ? 'Included' : 'Excluded'}
                {disbursementStats.inRangeAllCount > 0
                  ? ` · In range: ${formatCurrency(disbursementStats.inRangeAllTotal)} (visible members: ${formatCurrency(disbursementStats.inRangeVisibleTotal)})`
                  : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="metrics-table">
        <div className="metrics-table-header">
          <span 
            onClick={() => handleColumnSort('displayName')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by team member"
          >
            Team {getSortIcon('displayName')}
          </span>
          <span 
            onClick={() => handleColumnSort('enquiries')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by enquiries"
          >
            Enquiries {getSortIcon('enquiries')}
          </span>
          <span 
            onClick={() => handleColumnSort('matters')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by matters"
          >
            Matters {getSortIcon('matters')}
          </span>
          <span 
            onClick={() => handleColumnSort('wipHours')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by WIP hours"
          >
            WIP (h) {getSortIcon('wipHours')}
          </span>
          <span 
            onClick={() => handleColumnSort('wipValue')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by WIP value"
          >
            WIP (£) {getSortIcon('wipValue')}
          </span>
          <span 
            onClick={() => handleColumnSort('collected')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to sort by collected fees"
          >
            Collected {getSortIcon('collected')}
          </span>
        </div>
        {sortedMetricsByMember.length === 0 && (
          <div className="metrics-table-row animate-table-row">
            <span>No team members selected</span>
            <span>0</span>
            <span>0</span>
            <span>0h</span>
            <span>£0</span>
            <span>£0</span>
          </div>
        )}
        {sortedMetricsByMember.map((row, index) => {
          const isInactive = row.wipHours === 0;
          const prevRow = index > 0 ? sortedMetricsByMember[index - 1] : null;
          const isFirstInactive = isInactive && (prevRow?.wipHours || 0) > 0;
          
          return (
            <React.Fragment key={`${row.initials}-${startDate?.getTime()}-${endDate?.getTime()}-${rangeKey}`}>
              {isFirstInactive && (
                <div className="metrics-table-row" style={{
                  opacity: 0.6,
                  fontSize: '11px',
                  fontStyle: 'italic',
                  background: isDarkMode ? 'rgba(71, 85, 105, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                  borderTop: `1px solid ${isDarkMode ? '#475569' : '#94A3B8'}`,
                  padding: '6px 12px',
                }}>
                  <span>— Inactive in this period —</span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
              <div 
                className="metrics-table-row animate-table-row" 
                style={{ 
                  animationDelay: `${Math.min(index * 0.05, 0.5)}s`,
                  opacity: isInactive ? 0.4 : 1,
                  background: isInactive ? (isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(148, 163, 184, 0.1)') : 'transparent',
                  borderLeft: isInactive ? `3px solid ${isDarkMode ? '#475569' : '#94A3B8'}` : 'none',
                  paddingLeft: isInactive ? '9px' : '12px',
                  filter: isInactive ? 'grayscale(20%)' : 'none',
                  color: isInactive ? (isDarkMode ? '#64748B' : '#94A3B8') : 'inherit'
                }}
              >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span 
                style={{ 
                  cursor: 'help',
                  padding: '2px 4px',
                  borderRadius: 4,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const previousData = previousMemberMetrics.get(row.initials);
                  setHoveredMember({
                    member: row,
                    previousData,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10
                  });
                }}
                onMouseLeave={() => setHoveredMember(null)}
              >
                {row.displayName}
              </span>
              {row.trendDirection && row.trendDirection !== 'neutral' && (
                <span 
                  style={{ 
                    color: getTrendColor(row.trendDirection, isDarkMode),
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                  title={
                    row.trendDirection === 'away' ? 'Away on leave' :
                    row.trendDirection === 'up' && (row.targetHours || 0) === 0 ? 'Above target (calculation issue)' :
                    row.trendDirection === 'up' ? `Performance: ${row.wipHours.toFixed(1)}h / ${(row.targetHours || 0).toFixed(1)}h target (${((row.wipHours / (row.targetHours || 1)) * 100).toFixed(1)}% of target)` :
                    row.trendDirection === 'down' ? `Performance: ${row.wipHours.toFixed(1)}h / ${(row.targetHours || 0).toFixed(1)}h target (${((row.wipHours / (row.targetHours || 1)) * 100).toFixed(1)}% of target)` :
                    `At target: ${row.wipHours.toFixed(1)}h / ${(row.targetHours || 0).toFixed(1)}h`
                  }
                >
                  {getTrendArrow(row.trendDirection)}
                  {row.trendDirection !== 'away' && row.targetHours && row.targetHours > 0 && (
                    <span style={{ 
                      fontSize: '9px', 
                      marginLeft: '2px',
                      opacity: 0.7,
                      fontWeight: 500
                    }}>
                      {((row.wipHours / row.targetHours) * 100).toFixed(0)}%
                    </span>
                  )}
                </span>
              )}
              {row.trendDirection === 'neutral' && row.wipHours === 0 && (
                <span 
                  style={{ 
                    color: getTrendColor('neutral', isDarkMode),
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                  title="No work due to leave"
                >
                  —
                </span>
              )}
            </span>
            <span>{row.enquiries.toLocaleString('en-GB')}</span>
            <span>{row.matters.toLocaleString('en-GB')}</span>
            <span 
              title={`WIP Hours: ${formatHours(row.wipHours)}\nTarget: ${formatHours(row.targetHours || 0)}\nDate Range: ${startDate?.toLocaleDateString('en-GB')} - ${endDate?.toLocaleDateString('en-GB')}\nPerformance: ${row.targetHours ? ((row.wipHours / row.targetHours) * 100).toFixed(1) : 'N/A'}% of target`}
            >
              {formatHours(row.wipHours)}
            </span>
            <span>{formatCurrency(row.wipValue)}</span>
            <span>{formatCurrency(row.collected)}</span>
          </div>
            </React.Fragment>
          );
        })}
        <div className="metrics-table-row animate-table-row" style={{ animationDelay: `${sortedMetricsByMember.length * 0.05}s` }}>
          <span>Total</span>
          <span>{totals.enquiries.toLocaleString('en-GB')}</span>
          <span>{totals.matters.toLocaleString('en-GB')}</span>
          <span>{formatHours(totals.wipHours)}</span>
          <span>{formatCurrency(totals.wipValue)}</span>
          <span>{formatCurrency(totals.collected)}</span>
        </div>
      </div>

      {/* Premium Hover Tooltip */}
      {hoveredMetric && previousRange && (
        <div
          style={{
            position: 'fixed',
            left: Math.max(20, Math.min(hoveredMetric.x, window.innerWidth - 300)), // Keep within screen bounds
            top: hoveredMetric.y - 20, // 20px above cursor
            transform: hoveredMetric.x > window.innerWidth - 140 ? 'translateX(-100%)' : 
                      hoveredMetric.x < 140 ? 'translateX(0%)' : 'translateX(-50%)', // Smart alignment
            zIndex: 10000,
            pointerEvents: 'none',
            maxWidth: 280,
          }}
        >
          <div style={{
            background: isDarkMode 
              ? 'linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
              : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 12,
            fontFamily: 'Raleway, sans-serif',
            boxShadow: isDarkMode 
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
            backdropFilter: 'blur(20px)',
            color: isDarkMode ? '#e2e8f0' : '#475569',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              Period Comparison
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ opacity: 0.7, fontWeight: 500 }}>{getRangeLabel(rangeKey)}:</span>
                <span style={{ fontWeight: 600 }}>
                  {hoveredMetric.type === 'enquiries' ? summaryTotals.enquiries.toLocaleString('en-GB') :
                   hoveredMetric.type === 'matters' ? summaryTotals.matters.toLocaleString('en-GB') :
                   hoveredMetric.type === 'wipHours' ? formatHours(summaryTotals.wipHours) :
                   hoveredMetric.type === 'wipValue' ? formatCurrency(summaryTotals.wipValue) :
                   hoveredMetric.type === 'collected' ? formatCurrency(summaryTotals.collected) : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ opacity: 0.7, fontWeight: 500 }}>{getPreviousRangeLabel(rangeKey)}:</span>
                <span style={{ fontWeight: 600 }}>
                  {hoveredMetric.type === 'enquiries' ? (previousMetrics?.enquiries || 0).toLocaleString('en-GB') :
                   hoveredMetric.type === 'matters' ? (previousMetrics?.matters || 0).toLocaleString('en-GB') :
                   hoveredMetric.type === 'wipHours' ? formatHours(previousMetrics?.wipHours || 0) :
                   hoveredMetric.type === 'wipValue' ? formatCurrency(previousMetrics?.wipValue || 0) :
                   hoveredMetric.type === 'collected' ? formatCurrency(previousMetrics?.collected || 0) : ''}
                </span>
              </div>
              <div style={{ 
                height: 1, 
                background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)', 
                margin: '6px 0' 
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <span style={{ opacity: 0.6 }}>{formatDateRange(startDate || rangeStart, endDate || rangeEnd)}</span>
                <span style={{ opacity: 0.6 }}>vs {formatDateRange(previousRange.start, previousRange.end)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Team Member Hover Tooltip */}
      {hoveredMember && previousRange && (
        <div
          style={{
            position: 'fixed',
            left: Math.max(20, Math.min(hoveredMember.x, window.innerWidth - 340)), // Keep within screen bounds
            top: hoveredMember.y - 20, // 20px above cursor
            transform: hoveredMember.x > window.innerWidth - 160 ? 'translateX(-100%)' : 
                      hoveredMember.x < 160 ? 'translateX(0%)' : 'translateX(-50%)', // Smart alignment
            zIndex: 10000,
            pointerEvents: 'none',
            maxWidth: 320,
          }}
        >
          <div style={{
            background: isDarkMode 
              ? 'linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
              : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 12,
            fontFamily: 'Raleway, sans-serif',
            boxShadow: isDarkMode 
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
            backdropFilter: 'blur(20px)',
            color: isDarkMode ? '#e2e8f0' : '#475569',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: isDarkMode ? '#f1f5f9' : '#334155' }}>
              {hoveredMember.member.displayName}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 16px', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, opacity: 0.8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Metric</div>
              <div style={{ fontWeight: 600, opacity: 0.8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>{getRangeLabel(rangeKey)}</div>
              <div style={{ fontWeight: 600, opacity: 0.8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>{getPreviousRangeLabel(rangeKey)}</div>
              
              <div style={{ 
                gridColumn: '1 / -1', 
                height: 1, 
                background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)', 
                margin: '4px 0' 
              }} />
              
              <div style={{ fontWeight: 500 }}>Enquiries</div>
              <div style={{ fontWeight: 600, textAlign: 'right' }}>{hoveredMember.member.enquiries}</div>
              <div style={{ fontWeight: 600, textAlign: 'right', opacity: 0.7 }}>{hoveredMember.previousData?.enquiries || 0}</div>
              
              <div style={{ fontWeight: 500 }}>Matters</div>
              <div style={{ fontWeight: 600, textAlign: 'right' }}>{hoveredMember.member.matters}</div>
              <div style={{ fontWeight: 600, textAlign: 'right', opacity: 0.7 }}>{hoveredMember.previousData?.matters || 0}</div>
              
              <div style={{ fontWeight: 500 }}>WIP Hours</div>
              <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatHours(hoveredMember.member.wipHours)}</div>
              <div style={{ fontWeight: 600, textAlign: 'right', opacity: 0.7 }}>{formatHours(hoveredMember.previousData?.wipHours || 0)}</div>
              
              <div style={{ fontWeight: 500 }}>WIP Value</div>
              <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatCurrency(hoveredMember.member.wipValue)}</div>
              <div style={{ fontWeight: 600, textAlign: 'right', opacity: 0.7 }}>{formatCurrency(hoveredMember.previousData?.wipValue || 0)}</div>
              
              <div style={{ fontWeight: 500 }}>Collected</div>
              <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatCurrency(hoveredMember.member.collected)}</div>
              <div style={{ fontWeight: 600, textAlign: 'right', opacity: 0.7 }}>{formatCurrency(hoveredMember.previousData?.collected || 0)}</div>
            </div>

            <div style={{ 
              marginTop: 12, 
              paddingTop: 12, 
              borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: 10, 
              opacity: 0.6 
            }}>
              <span>{formatDateRange(startDate || rangeStart, endDate || rangeEnd)}</span>
              <span>{formatDateRange(previousRange.start, previousRange.end)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing Modal Overlay */}
      {processingModal.visible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              background: isDarkMode
                ? 'linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))'
                : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98))',
              borderRadius: 0,
              padding: '32px 40px',
              minWidth: 300,
              maxWidth: 400,
              boxShadow: isDarkMode
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              animation: 'scaleIn 0.25s ease-out',
            }}
          >
            <Spinner size={2} />
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDarkMode ? '#94a3b8' : '#64748b',
              }}
            >
              {processingModal.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: isDarkMode ? '#e2e8f0' : '#475569',
                textAlign: 'center',
              }}
            >
              {processingModal.message}
            </div>
            {typeof processingModal.progress === 'number' && (
              <div
                style={{
                  width: '100%',
                  height: 4,
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: `${processingModal.progress}%`,
                    height: '100%',
                    background: colours.highlight,
                    transition: 'width 0.3s ease-out',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementDashboard;