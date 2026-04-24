import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { DayOfWeek } from '@fluentui/react/lib/Calendar';
import type { IDatePickerStyles } from '@fluentui/react/lib/DatePicker';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from "../../app/styles/colours";
import { useTheme } from "../../app/functionality/ThemeContext";
import { TeamData } from "../../app/functionality/types";
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from './styles/reportingFoundation';
import './ManagementDashboard.css';

export interface AnnualLeaveRecord {
  request_id: number;
  fe: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  days_taken: number;
  leave_type?: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
  rejection_notes?: string;
  hearing_confirmation?: boolean;
  hearing_details?: string;
  requested_at?: string;
  approved_at?: string;
  booked_at?: string;
  updated_at?: string;
}

interface Props {
  data: AnnualLeaveRecord[];
  teamData: TeamData[];
  triggerRefresh?: () => void;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
}

type RangeKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'lastWeek'
  | 'month'
  | 'lastMonth'
  | 'last90Days'
  | 'quarter'
  | 'yearToDate'
  | 'year'
  | 'custom';

type LeaveStatus = 'requested' | 'approved' | 'booked' | 'rejected' | 'other';
type LeaveTypeKey = 'standard' | 'purchase' | 'sale' | 'unpaid';

interface TeamMember {
  initials: string;
  display: string;
  role: string;
  isActive: boolean;
  holidayEntitlement: number;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface LeaveEntryModel {
  id: string;
  requestId: number;
  initials: string;
  personName: string;
  role: string;
  isActive: boolean;
  status: LeaveStatus;
  leaveType: LeaveTypeKey;
  startDate: Date;
  endDate: Date;
  recordedDays: number;
  daysInRange: number;
  reason: string;
  rejectionNotes?: string;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
  requestedAt?: string;
  approvedAt?: string;
  bookedAt?: string;
  updatedAt?: string;
}

interface MemberSummary {
  initials: string;
  fullName: string;
  role: string;
  entitlement: number;
  standardDays: number;
  purchaseDays: number;
  soldDays: number;
  unpaidDays: number;
  pendingDays: number;
  rejectedDays: number;
  committedDays: number;
  remainingDays: number;
  requestCount: number;
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
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

const STATUS_OPTIONS: Array<{ key: LeaveStatus; label: string }> = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'booked', label: 'Booked' },
  { key: 'rejected', label: 'Rejected' },
];

const LEAVE_TYPE_OPTIONS: Array<{ key: LeaveTypeKey; label: string }> = [
  { key: 'standard', label: 'Standard' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'sale', label: 'Sold' },
  { key: 'unpaid', label: 'Unpaid' },
];

const DEFAULT_STATUSES = new Set<LeaveStatus>(['requested', 'approved', 'booked', 'rejected']);
const DEFAULT_TYPES = new Set<LeaveTypeKey>(['standard', 'purchase', 'sale', 'unpaid']);

const NAME_MAP: Record<string, string> = {
  'Samuel Packwood': 'Sam Packwood',
  'Bianca ODonnell': "Bianca O'Donnell",
};

const roundValue = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const formatDayValue = (value: number): string => {
  const rounded = roundValue(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const candidate = new Date(String(value));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const formatDateForPicker = (date?: Date | null): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const parseDatePickerInput = (value?: string | null): Date | null =>
  value ? parseDate(value) : null;

const formatDateTag = (date: Date | null): string => {
  if (!date) return 'n/a';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const formatTimestampLabel = (value?: string): string => {
  if (!value) return '—';
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const mapNameIfNeeded = (name?: string | null): string => {
  if (!name) return '';
  return NAME_MAP[name] ?? name;
};

const getInitials = (input: string): string => {
  const value = String(input || '').trim();
  if (!value) return '?';
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const first = tokens[0][0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : tokens[0][1] || '';
  return (first + last).toUpperCase() || '?';
};

const displayName = (record?: TeamData | null): string => {
  if (!record) return 'Unknown';
  return (
    record['Nickname'] ||
    record['Full Name'] ||
    record['First'] ||
    record['Last'] ||
    record['Initials'] ||
    'Unknown'
  );
};

const normaliseStatus = (value: unknown): LeaveStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'requested' || normalized === 'approved' || normalized === 'booked' || normalized === 'rejected') {
    return normalized;
  }
  return 'other';
};

const normaliseLeaveType = (value: unknown): LeaveTypeKey => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'purchase' || normalized === 'sale' || normalized === 'unpaid') {
    return normalized;
  }
  return 'standard';
};

const formatLeaveTypeLabel = (value: LeaveTypeKey): string => {
  switch (value) {
    case 'purchase':
      return 'Purchase';
    case 'sale':
      return 'Sold';
    case 'unpaid':
      return 'Unpaid';
    case 'standard':
    default:
      return 'Standard';
  }
};

const formatStatusLabel = (value: LeaveStatus): string => {
  if (value === 'other') return 'Other';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const isCommittedStatus = (status: LeaveStatus): boolean => status === 'approved' || status === 'booked';

const startOfDay = (input: Date): Date => {
  const next = new Date(input);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (input: Date): Date => {
  const next = new Date(input);
  next.setHours(23, 59, 59, 999);
  return next;
};

const datesMatch = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const workingDaysBetween = (start: Date, end: Date): number => {
  let count = 0;
  const cursor = startOfDay(start);
  const finalDay = endOfDay(end);

  while (cursor <= finalDay) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
};

const calculateDaysInRange = (entry: AnnualLeaveRecord, range: DateRange | null): number => {
  const startDate = parseDate(entry.start_date);
  const endDate = parseDate(entry.end_date) ?? startDate;
  if (!startDate || !endDate) return 0;

  const fullDays = roundValue(entry.days_taken || 0);
  if (!range) return fullDays;

  const overlapStart = startOfDay(startDate > range.start ? startDate : range.start);
  const overlapEnd = endOfDay(endDate < range.end ? endDate : range.end);
  if (overlapStart > overlapEnd) return 0;

  const fullWorkingDays = workingDaysBetween(startDate, endDate);
  const overlapWorkingDays = workingDaysBetween(overlapStart, overlapEnd);

  let adjustedFull = fullWorkingDays;
  let adjustedOverlap = overlapWorkingDays;

  if (entry.half_day_start) {
    adjustedFull -= 0.5;
    if (datesMatch(startDate, overlapStart)) {
      adjustedOverlap -= 0.5;
    }
  }

  if (entry.half_day_end) {
    adjustedFull -= 0.5;
    if (datesMatch(endDate, overlapEnd)) {
      adjustedOverlap -= 0.5;
    }
  }

  adjustedFull = Math.max(0.5, adjustedFull);
  adjustedOverlap = Math.max(0, adjustedOverlap);

  if (adjustedOverlap <= 0) {
    return 0;
  }

  if (datesMatch(startDate, range.start) && datesMatch(endDate, range.end)) {
    return fullDays;
  }

  const prorated = fullDays > 0 ? fullDays * (adjustedOverlap / adjustedFull) : adjustedOverlap;
  return roundValue(prorated);
};

const computeRange = (key: RangeKey): DateRange => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (key) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case 'week': {
      const mondayOffset = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - mondayOffset);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case 'lastWeek': {
      const mondayOffset = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - mondayOffset - 7);
      end.setDate(start.getDate() + 6);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case 'month':
      start.setDate(1);
      return { start: startOfDay(start), end: endOfDay(now) };
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end.setMonth(start.getMonth() + 1, 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    case 'last90Days':
      start.setDate(now.getDate() - 89);
      return { start: startOfDay(start), end: endOfDay(now) };
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case 'year':
      start.setFullYear(now.getFullYear(), 0, 1);
      end.setFullYear(now.getFullYear(), 11, 31);
      return { start: startOfDay(start), end: endOfDay(end) };
    case 'all':
      return { start: new Date(0), end: endOfDay(now) };
    case 'custom':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yearToDate':
    default: {
      const currentYear = now.getFullYear();
      if (now.getMonth() < 3) {
        start.setFullYear(currentYear - 1, 3, 1);
      } else {
        start.setFullYear(currentYear, 3, 1);
      }
      return { start: startOfDay(start), end: endOfDay(now) };
    }
  }
};

const quickRanges: Array<{ key: RangeKey; label: string }> = [
  { key: 'all', label: 'All' },
  ...RANGE_OPTIONS,
];

const formatTimeAgo = (timestamp?: number): string => {
  if (!timestamp) return 'Not refreshed yet';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const chipStyle = (isDarkMode: boolean, active: boolean, muted = false): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  border: `1px solid ${active ? colours.highlight : reportingPanelBorder(isDarkMode, 'base')}`,
  background: active
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : reportingPanelBackground(isDarkMode, 'base'),
  color: active ? '#ffffff' : (isDarkMode ? colours.dark.text : colours.helixBlue),
  fontFamily: 'Raleway, sans-serif',
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  cursor: 'pointer',
  opacity: muted ? 0.55 : 1,
  transition: 'all 0.2s ease',
});

const actionButtonStyles = (isDarkMode: boolean) => ({
  root: {
    minHeight: 34,
    borderRadius: 0,
    background: reportingPanelBackground(isDarkMode, 'base'),
    border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
    color: isDarkMode ? colours.dark.text : colours.helixBlue,
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: reportingPanelBackground(isDarkMode, 'elevated'),
  },
});

const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => ({
  root: {
    maxWidth: 220,
    '.ms-DatePicker': {
      fontFamily: 'Raleway, sans-serif !important',
    },
  },
  textField: {
    root: {
      width: '100% !important',
      fontFamily: 'Raleway, sans-serif !important',
    },
    fieldGroup: {
      minHeight: '36px !important',
      borderRadius: '0 !important',
      border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')} !important`,
      background: `${reportingPanelBackground(isDarkMode, 'base')} !important`,
    },
    field: {
      color: `${isDarkMode ? colours.dark.text : colours.helixBlue} !important`,
      fontFamily: 'Raleway, sans-serif !important',
      background: 'transparent !important',
    },
  },
  icon: {
    color: `${isDarkMode ? colours.accent : colours.highlight} !important`,
  },
});

const getStatusTone = (isDarkMode: boolean, status: LeaveStatus): { color: string; background: string; border: string } => {
  if (status === 'booked' || status === 'approved') {
    return {
      color: colours.green,
      background: isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.1)',
      border: isDarkMode ? 'rgba(32, 178, 108, 0.34)' : 'rgba(32, 178, 108, 0.22)',
    };
  }
  if (status === 'requested') {
    return {
      color: colours.orange,
      background: isDarkMode ? `${colours.orange}1A` : `${colours.orange}14`,
      border: isDarkMode ? `${colours.orange}55` : `${colours.orange}33`,
    };
  }
  if (status === 'rejected') {
    return {
      color: colours.cta,
      background: isDarkMode ? 'rgba(214, 85, 65, 0.16)' : 'rgba(214, 85, 65, 0.1)',
      border: isDarkMode ? 'rgba(214, 85, 65, 0.36)' : 'rgba(214, 85, 65, 0.22)',
    };
  }
  return {
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.08)',
    border: isDarkMode ? 'rgba(148, 163, 184, 0.26)' : 'rgba(148, 163, 184, 0.18)',
  };
};

const getLeaveTypeTone = (isDarkMode: boolean, leaveType: LeaveTypeKey): { color: string; background: string; border: string } => {
  if (leaveType === 'sale') {
    return {
      color: colours.cta,
      background: isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)',
      border: isDarkMode ? 'rgba(214, 85, 65, 0.28)' : 'rgba(214, 85, 65, 0.18)',
    };
  }
  if (leaveType === 'purchase') {
    return {
      color: isDarkMode ? colours.accent : colours.highlight,
      background: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)',
      border: isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.22)',
    };
  }
  if (leaveType === 'unpaid') {
    return {
      color: colours.orange,
      background: isDarkMode ? `${colours.orange}18` : `${colours.orange}12`,
      border: isDarkMode ? `${colours.orange}40` : `${colours.orange}28`,
    };
  }
  return {
    color: colours.green,
    background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
    border: isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.18)',
  };
};

const csvEscape = (value: string | number): string => {
  const stringValue = String(value ?? '');
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const downloadCsv = (filename: string, rows: Array<Record<string, string | number>>, headers: string[]) => {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','));
  });

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  subtitle?: string;
  isDarkMode: boolean;
}> = ({ label, value, subtitle, isDarkMode }) => (
  <div
    style={{
      background: reportingPanelBackground(isDarkMode, 'base'),
      border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
      boxShadow: reportingPanelShadow(isDarkMode),
      padding: '14px 16px',
      minHeight: 98,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 8,
    }}
  >
    <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText, fontWeight: 700 }}>
      {label}
    </div>
    <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
      {value}
    </div>
    {subtitle ? (
      <div style={{ fontSize: 12, lineHeight: 1.4, color: isDarkMode ? '#d1d5db' : '#374151' }}>
        {subtitle}
      </div>
    ) : null}
  </div>
);

const AnnualLeaveReport: React.FC<Props> = ({
  data,
  teamData,
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false,
}) => {
  const { isDarkMode } = useTheme();
  const [rangeKey, setRangeKey] = useState<RangeKey>('yearToDate');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<LeaveStatus>>(new Set(DEFAULT_STATUSES));
  const [selectedLeaveTypes, setSelectedLeaveTypes] = useState<Set<LeaveTypeKey>>(new Set(DEFAULT_TYPES));
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const currentRange = useMemo<DateRange | null>(() => {
    if (rangeKey === 'custom') {
      if (!customDateRange?.start || !customDateRange?.end) {
        return null;
      }
      return { start: startOfDay(customDateRange.start), end: endOfDay(customDateRange.end) };
    }
    return computeRange(rangeKey);
  }, [rangeKey, customDateRange]);

  const showCustomPickers = rangeKey === 'custom';
  const displayRangeStart = currentRange?.start ?? customDateRange?.start ?? null;
  const displayRangeEnd = currentRange?.end ?? customDateRange?.end ?? null;

  const teamMembers = useMemo<TeamMember[]>(() => {
    const mapped = (teamData || [])
      .map((record) => {
        const display = mapNameIfNeeded(displayName(record));
        const initials = String(record['Initials'] || '').trim().toUpperCase() || getInitials(display);
        if (!initials || initials === '?') {
          return null;
        }
        return {
          initials,
          display,
          role: String(record['Role'] || '').trim() || 'Unassigned',
          isActive: String(record.status || '').trim().toLowerCase() !== 'inactive',
          holidayEntitlement: roundValue(record.holiday_entitlement ?? 25),
        } satisfies TeamMember;
      })
      .filter((record): record is TeamMember => Boolean(record))
      .sort((left, right) => left.display.localeCompare(right.display));

    return mapped;
  }, [teamData]);

  const teamLookup = useMemo(() => {
    const next = new Map<string, TeamMember>();
    teamMembers.forEach((member) => next.set(member.initials, member));
    return next;
  }, [teamMembers]);

  const normalizedEntries = useMemo<LeaveEntryModel[]>(() => {
    return (data || [])
      .map((entry) => {
        const initials = String(entry.fe || '').trim().toUpperCase();
        if (!initials) return null;

        const startDate = parseDate(entry.start_date);
        const endDate = parseDate(entry.end_date) ?? startDate;
        if (!startDate || !endDate) return null;

        const member = teamLookup.get(initials);
        const daysInRange = calculateDaysInRange(entry, currentRange);
        if (currentRange && daysInRange <= 0) {
          return null;
        }

        return {
          id: `${entry.request_id}-${initials}`,
          requestId: entry.request_id,
          initials,
          personName: member?.display || initials,
          role: member?.role || 'Unknown',
          isActive: member?.isActive ?? false,
          status: normaliseStatus(entry.status),
          leaveType: normaliseLeaveType(entry.leave_type),
          startDate,
          endDate,
          recordedDays: roundValue(entry.days_taken),
          daysInRange,
          reason: entry.reason || '',
          rejectionNotes: entry.rejection_notes,
          halfDayStart: entry.half_day_start,
          halfDayEnd: entry.half_day_end,
          requestedAt: entry.requested_at,
          approvedAt: entry.approved_at,
          bookedAt: entry.booked_at,
          updatedAt: entry.updated_at,
        } satisfies LeaveEntryModel;
      })
      .filter((entry): entry is LeaveEntryModel => Boolean(entry));
  }, [currentRange, data, teamLookup]);

  const availableMembers = useMemo<TeamMember[]>(() => {
    const byInitials = new Map<string, TeamMember>();
    teamMembers.forEach((member) => byInitials.set(member.initials, member));
    normalizedEntries.forEach((entry) => {
      if (!byInitials.has(entry.initials)) {
        byInitials.set(entry.initials, {
          initials: entry.initials,
          display: entry.personName,
          role: entry.role,
          isActive: entry.isActive,
          holidayEntitlement: 25,
        });
      }
    });
    return Array.from(byInitials.values()).sort((left, right) => left.display.localeCompare(right.display));
  }, [normalizedEntries, teamMembers]);

  const roleOptions = useMemo(() => {
    return Array.from(new Set(availableMembers.map((member) => member.role).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }, [availableMembers]);

  const entriesAfterMemberFilters = useMemo(() => {
    return normalizedEntries.filter((entry) => {
      if (selectedTeams.size > 0 && !selectedTeams.has(entry.initials)) {
        return false;
      }
      if (selectedRoles.size > 0 && !selectedRoles.has(entry.role)) {
        return false;
      }
      return true;
    });
  }, [normalizedEntries, selectedRoles, selectedTeams]);

  const displayEntries = useMemo(() => {
    return entriesAfterMemberFilters.filter((entry) => selectedStatuses.has(entry.status) && selectedLeaveTypes.has(entry.leaveType));
  }, [entriesAfterMemberFilters, selectedLeaveTypes, selectedStatuses]);

  const filteredMembers = useMemo(() => {
    return availableMembers.filter((member) => {
      if (selectedTeams.size > 0 && !selectedTeams.has(member.initials)) {
        return false;
      }
      if (selectedRoles.size > 0 && !selectedRoles.has(member.role)) {
        return false;
      }
      return member.isActive || entriesAfterMemberFilters.some((entry) => entry.initials === member.initials);
    });
  }, [availableMembers, entriesAfterMemberFilters, selectedRoles, selectedTeams]);

  const entriesByMember = useMemo(() => {
    const next = new Map<string, LeaveEntryModel[]>();
    displayEntries.forEach((entry) => {
      const current = next.get(entry.initials) || [];
      current.push(entry);
      next.set(entry.initials, current);
    });
    next.forEach((entries) => {
      entries.sort((left, right) => right.startDate.getTime() - left.startDate.getTime() || right.requestId - left.requestId);
    });
    return next;
  }, [displayEntries]);

  const memberSummaries = useMemo<MemberSummary[]>(() => {
    return filteredMembers.map((member) => {
      const memberEntries = entriesByMember.get(member.initials) || [];
      const committedEntries = memberEntries.filter((entry) => isCommittedStatus(entry.status));
      const standardDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'standard').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const purchaseDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'purchase').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const soldDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'sale').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const unpaidDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'unpaid').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const pendingDays = roundValue(memberEntries.filter((entry) => entry.status === 'requested').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const rejectedDays = roundValue(memberEntries.filter((entry) => entry.status === 'rejected').reduce((sum, entry) => sum + entry.daysInRange, 0));
      const committedDays = roundValue(committedEntries.reduce((sum, entry) => sum + entry.daysInRange, 0));
      const remainingDays = roundValue(member.holidayEntitlement - standardDays - soldDays);

      return {
        initials: member.initials,
        fullName: member.display,
        role: member.role,
        entitlement: member.holidayEntitlement,
        standardDays,
        purchaseDays,
        soldDays,
        unpaidDays,
        pendingDays,
        rejectedDays,
        committedDays,
        remainingDays,
        requestCount: memberEntries.length,
      } satisfies MemberSummary;
    });
  }, [entriesByMember, filteredMembers]);

  const summaryStats = useMemo(() => {
    const committedEntries = displayEntries.filter((entry) => isCommittedStatus(entry.status));
    const committedDays = roundValue(committedEntries.reduce((sum, entry) => sum + entry.daysInRange, 0));
    const pendingDays = roundValue(displayEntries.filter((entry) => entry.status === 'requested').reduce((sum, entry) => sum + entry.daysInRange, 0));
    const soldDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'sale').reduce((sum, entry) => sum + entry.daysInRange, 0));
    const purchaseDays = roundValue(committedEntries.filter((entry) => entry.leaveType === 'purchase').reduce((sum, entry) => sum + entry.daysInRange, 0));
    const rejectedRequests = displayEntries.filter((entry) => entry.status === 'rejected').length;
    const peopleWithLeave = new Set(displayEntries.map((entry) => entry.initials)).size;
    const upcomingCommitted = committedEntries.filter((entry) => startOfDay(entry.startDate) >= startOfDay(new Date())).length;
    return { committedDays, pendingDays, soldDays, purchaseDays, rejectedRequests, peopleWithLeave, upcomingCommitted };
  }, [displayEntries]);

  const teamCounts = useMemo(() => {
    const next = new Map<string, number>();
    entriesAfterMemberFilters.forEach((entry) => {
      next.set(entry.initials, (next.get(entry.initials) || 0) + 1);
    });
    return next;
  }, [entriesAfterMemberFilters]);

  const selectedMemberSummary = useMemo(() => {
    if (!expandedUser) return null;
    return memberSummaries.find((member) => member.initials === expandedUser) || null;
  }, [expandedUser, memberSummaries]);

  const filteredUserEntries = useMemo(() => {
    if (!expandedUser) return [];
    return entriesByMember.get(expandedUser) || [];
  }, [entriesByMember, expandedUser]);

  useEffect(() => {
    if (expandedUser && !filteredMembers.some((member) => member.initials === expandedUser)) {
      setExpandedUser(null);
    }
  }, [expandedUser, filteredMembers]);

  const currentRangeLabel = rangeKey === 'custom'
    ? 'Custom'
    : quickRanges.find((entry) => entry.key === rangeKey)?.label ?? 'All';

  const handleStatusToggle = useCallback((status: LeaveStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const handleTypeToggle = useCallback((leaveType: LeaveTypeKey) => {
    setSelectedLeaveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(leaveType)) {
        next.delete(leaveType);
      } else {
        next.add(leaveType);
      }
      return next;
    });
  }, []);

  const handleRoleToggle = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }, []);

  const handleTeamToggle = useCallback((initials: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(initials)) {
        next.delete(initials);
      } else {
        next.add(initials);
      }
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    if (triggerRefresh && !isFetching) {
      triggerRefresh();
    }
  }, [isFetching, triggerRefresh]);

  const handleExportSummary = useCallback(() => {
    const rows = memberSummaries.map((row) => ({
      Name: row.fullName,
      Initials: row.initials,
      Role: row.role,
      Entitlement: formatDayValue(row.entitlement),
      StandardDays: formatDayValue(row.standardDays),
      PurchasedDays: formatDayValue(row.purchaseDays),
      SoldDays: formatDayValue(row.soldDays),
      UnpaidDays: formatDayValue(row.unpaidDays),
      PendingDays: formatDayValue(row.pendingDays),
      RejectedDays: formatDayValue(row.rejectedDays),
      CommittedDays: formatDayValue(row.committedDays),
      RemainingDays: formatDayValue(row.remainingDays),
      Requests: row.requestCount,
    }));

    downloadCsv(
      'annual-leave-summary-current-filter.csv',
      rows,
      ['Name', 'Initials', 'Role', 'Entitlement', 'StandardDays', 'PurchasedDays', 'SoldDays', 'UnpaidDays', 'PendingDays', 'RejectedDays', 'CommittedDays', 'RemainingDays', 'Requests'],
    );
  }, [memberSummaries]);

  const handleExportGrouped = useCallback(() => {
    const rows: Array<Record<string, string | number>> = [];
    memberSummaries.forEach((summary) => {
      rows.push({
        RowType: 'SUMMARY',
        Name: summary.fullName,
        Initials: summary.initials,
        Role: summary.role,
        Entitlement: formatDayValue(summary.entitlement),
        StandardDays: formatDayValue(summary.standardDays),
        PurchasedDays: formatDayValue(summary.purchaseDays),
        SoldDays: formatDayValue(summary.soldDays),
        UnpaidDays: formatDayValue(summary.unpaidDays),
        PendingDays: formatDayValue(summary.pendingDays),
        RejectedDays: formatDayValue(summary.rejectedDays),
        CommittedDays: formatDayValue(summary.committedDays),
        RemainingDays: formatDayValue(summary.remainingDays),
        RequestId: '',
        Status: '',
        LeaveType: '',
        StartDate: '',
        EndDate: '',
        DaysInRange: '',
        RecordedDays: '',
        HalfDay: '',
        Reason: '',
        RequestedAt: '',
        ApprovedAt: '',
        BookedAt: '',
      });

      const entries = entriesByMember.get(summary.initials) || [];
      entries.forEach((entry) => {
        rows.push({
          RowType: 'ENTRY',
          Name: summary.fullName,
          Initials: summary.initials,
          Role: summary.role,
          Entitlement: '',
          StandardDays: '',
          PurchasedDays: '',
          SoldDays: '',
          UnpaidDays: '',
          PendingDays: '',
          RejectedDays: '',
          CommittedDays: '',
          RemainingDays: '',
          RequestId: entry.requestId,
          Status: formatStatusLabel(entry.status),
          LeaveType: formatLeaveTypeLabel(entry.leaveType),
          StartDate: entry.startDate.toISOString().slice(0, 10),
          EndDate: entry.endDate.toISOString().slice(0, 10),
          DaysInRange: formatDayValue(entry.daysInRange),
          RecordedDays: formatDayValue(entry.recordedDays),
          HalfDay: entry.halfDayStart && entry.halfDayEnd ? 'Starts PM / Ends AM' : entry.halfDayStart ? 'Starts PM' : entry.halfDayEnd ? 'Ends AM' : '',
          Reason: entry.reason,
          RequestedAt: formatTimestampLabel(entry.requestedAt),
          ApprovedAt: formatTimestampLabel(entry.approvedAt),
          BookedAt: formatTimestampLabel(entry.bookedAt),
        });
      });
    });

    downloadCsv(
      'annual-leave-grouped-breakdown-current-filter.csv',
      rows,
      ['RowType', 'Name', 'Initials', 'Role', 'Entitlement', 'StandardDays', 'PurchasedDays', 'SoldDays', 'UnpaidDays', 'PendingDays', 'RejectedDays', 'CommittedDays', 'RemainingDays', 'RequestId', 'Status', 'LeaveType', 'StartDate', 'EndDate', 'DaysInRange', 'RecordedDays', 'HalfDay', 'Reason', 'RequestedAt', 'ApprovedAt', 'BookedAt'],
    );
  }, [entriesByMember, memberSummaries]);

  const rangeDescription = `${displayRangeStart ? formatDateForPicker(displayRangeStart) : 'All time'}${displayRangeEnd ? ` to ${formatDateForPicker(displayRangeEnd)}` : ''}`;
  const refreshLabel = formatTimeAgo(lastRefreshTimestamp);

  if (isFetching && data.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} style={{ height: 98, border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: reportingPanelBackground(isDarkMode, 'base') }} className="skeleton-shimmer" />
          ))}
        </div>
        <div style={{ height: 84, border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: reportingPanelBackground(isDarkMode, 'base') }} className="skeleton-shimmer" />
        <div style={{ height: 320, border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: reportingPanelBackground(isDarkMode, 'base') }} className="skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, fontFamily: 'Raleway, sans-serif' }}>
      <div
        style={{
          background: reportingPanelBackground(isDarkMode, 'base'),
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
          boxShadow: reportingPanelShadow(isDarkMode),
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Annual Leave
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
              Leave overview
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
              {rangeDescription}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                background: reportingPanelBackground(isDarkMode, 'elevated'),
                color: isDarkMode ? colours.dark.text : colours.helixBlue,
                fontSize: 12,
                fontWeight: 600,
              }}
              title={`Current selected range: ${rangeDescription}`}
            >
              <Icon iconName="Calendar" style={{ fontSize: 13, color: isDarkMode ? colours.accent : colours.highlight }} />
              <span>{currentRangeLabel}</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                background: reportingPanelBackground(isDarkMode, 'elevated'),
                color: isDarkMode ? colours.dark.text : colours.helixBlue,
                fontSize: 12,
                fontWeight: 600,
              }}
              title={lastRefreshTimestamp ? new Date(lastRefreshTimestamp).toLocaleString('en-GB') : 'Not refreshed yet'}
            >
              <Icon iconName={isFetching ? 'Sync' : 'History'} style={{ fontSize: 13, color: isDarkMode ? colours.accent : colours.highlight }} />
              <span>{isFetching ? 'Refreshing…' : `Updated ${refreshLabel}`}</span>
            </div>

            <DefaultButton text="Refresh" onClick={handleRefresh} disabled={!triggerRefresh || isFetching} styles={actionButtonStyles(isDarkMode)} />
            <DefaultButton text="Export Summary" onClick={handleExportSummary} styles={actionButtonStyles(isDarkMode)} />
            <DefaultButton text="Export Grouped CSV" onClick={handleExportGrouped} styles={actionButtonStyles(isDarkMode)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <SummaryCard label="People" value={String(summaryStats.peopleWithLeave)} subtitle={`${displayEntries.length} requests`} isDarkMode={isDarkMode} />
          <SummaryCard label="Committed Days" value={formatDayValue(summaryStats.committedDays)} isDarkMode={isDarkMode} />
          <SummaryCard label="Pending Days" value={formatDayValue(summaryStats.pendingDays)} isDarkMode={isDarkMode} />
          <SummaryCard label="Upcoming" value={String(summaryStats.upcomingCommitted)} subtitle={`${summaryStats.rejectedRequests} rejected`} isDarkMode={isDarkMode} />
        </div>
      </div>

      <div
        style={{
          background: reportingPanelBackground(isDarkMode, 'base'),
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
          boxShadow: reportingPanelShadow(isDarkMode),
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Range
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quickRanges.map((option) => (
                <button key={option.key} type="button" style={chipStyle(isDarkMode, rangeKey === option.key)} onClick={() => setRangeKey(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Status
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUS_OPTIONS.map((option) => (
                <button key={option.key} type="button" style={chipStyle(isDarkMode, selectedStatuses.has(option.key))} onClick={() => handleStatusToggle(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Leave Type
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {LEAVE_TYPE_OPTIONS.map((option) => (
                <button key={option.key} type="button" style={chipStyle(isDarkMode, selectedLeaveTypes.has(option.key))} onClick={() => handleTypeToggle(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showCustomPickers && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <DatePicker
              label="From"
              styles={getDatePickerStyles(isDarkMode)}
              value={customDateRange?.start || undefined}
              onSelectDate={(date) => setCustomDateRange((prev) => ({ start: date || null, end: prev?.end || null }))}
              allowTextInput
              firstDayOfWeek={DayOfWeek.Monday}
              formatDate={formatDateForPicker}
              parseDateFromString={parseDatePickerInput}
            />
            <DatePicker
              label="To"
              styles={getDatePickerStyles(isDarkMode)}
              value={customDateRange?.end || undefined}
              onSelectDate={(date) => setCustomDateRange((prev) => ({ start: prev?.start || null, end: date || null }))}
              allowTextInput
              firstDayOfWeek={DayOfWeek.Monday}
              formatDate={formatDateForPicker}
              parseDateFromString={parseDatePickerInput}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Roles
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {roleOptions.map((role) => (
                <button key={role} type="button" style={chipStyle(isDarkMode, selectedRoles.has(role))} onClick={() => handleRoleToggle(role)}>
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Team
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 112, overflowY: 'auto', paddingRight: 4 }}>
              {availableMembers.map((member) => {
                const count = teamCounts.get(member.initials) || 0;
                return (
                  <button key={member.initials} type="button" style={chipStyle(isDarkMode, selectedTeams.has(member.initials), count === 0)} onClick={() => handleTeamToggle(member.initials)}>
                    {member.display} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: reportingPanelBackground(isDarkMode, 'base'),
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
          boxShadow: reportingPanelShadow(isDarkMode),
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px 10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Team Summary
            </div>
          </div>
          <div style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            {filteredMembers.length} people · {displayEntries.length} visible requests
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 980 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.4fr repeat(7, minmax(88px, 1fr))', padding: '10px 16px', gap: 12, borderTop: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, borderBottom: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              <span>Person</span>
              <span>Entitlement</span>
              <span>Standard</span>
              <span>Purchase</span>
              <span>Sold</span>
              <span>Unpaid</span>
              <span>Pending</span>
              <span>Remaining</span>
            </div>

            {memberSummaries.map((row) => {
              const isExpanded = expandedUser === row.initials;
              return (
                <button
                  key={row.initials}
                  type="button"
                  onClick={() => setExpandedUser((prev) => prev === row.initials ? null : row.initials)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '2.4fr repeat(7, minmax(88px, 1fr))',
                    gap: 12,
                    padding: '12px 16px',
                    alignItems: 'center',
                    border: 'none',
                    borderBottom: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                    background: isExpanded ? reportingPanelBackground(isDarkMode, 'elevated') : 'transparent',
                    color: isDarkMode ? colours.dark.text : colours.helixBlue,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 12, opacity: 0.7 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{row.fullName}</span>
                      <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{row.role} · {row.initials}</span>
                    </span>
                  </span>
                  <span>{formatDayValue(row.entitlement)}</span>
                  <span>{formatDayValue(row.standardDays)}</span>
                  <span>{formatDayValue(row.purchaseDays)}</span>
                  <span style={{ color: row.soldDays > 0 ? colours.cta : undefined }}>{formatDayValue(row.soldDays)}</span>
                  <span>{formatDayValue(row.unpaidDays)}</span>
                  <span style={{ color: row.pendingDays > 0 ? colours.orange : undefined }}>{formatDayValue(row.pendingDays)}</span>
                  <span style={{ color: row.remainingDays < 0 ? colours.cta : row.remainingDays <= 5 ? colours.orange : colours.green, fontWeight: 700 }}>{formatDayValue(row.remainingDays)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          background: reportingPanelBackground(isDarkMode, 'base'),
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
          boxShadow: reportingPanelShadow(isDarkMode),
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {selectedMemberSummary ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  Person Ledger
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
                  {selectedMemberSummary.fullName}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                  {selectedMemberSummary.role} · {selectedMemberSummary.initials} · {filteredUserEntries.length} visible requests
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={chipStyle(isDarkMode, true)}>
                  Remaining {formatDayValue(selectedMemberSummary.remainingDays)}
                </button>
                <button type="button" style={chipStyle(isDarkMode, true)}>
                  Committed {formatDayValue(selectedMemberSummary.committedDays)}
                </button>
                <button type="button" style={chipStyle(isDarkMode, true)}>
                  Pending {formatDayValue(selectedMemberSummary.pendingDays)}
                </button>
              </div>
            </div>

            {filteredUserEntries.length === 0 ? (
              <div style={{ fontSize: 13, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                No requests match the current filters for this person.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 900 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.85fr 0.85fr 0.9fr 2.1fr', gap: 12, padding: '10px 0', borderBottom: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    <span>Dates</span>
                    <span>Days</span>
                    <span>Type</span>
                    <span>Status</span>
                    <span>Reason</span>
                  </div>

                  {filteredUserEntries.map((entry) => {
                    const statusTone = getStatusTone(isDarkMode, entry.status);
                    const typeTone = getLeaveTypeTone(isDarkMode, entry.leaveType);
                    const timingLabel = entry.halfDayStart && entry.halfDayEnd
                      ? 'Starts PM / Ends AM'
                      : entry.halfDayStart
                        ? 'Starts PM'
                        : entry.halfDayEnd
                          ? 'Ends AM'
                          : 'Full day';
                    return (
                      <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.85fr 0.85fr 0.9fr 2.1fr', gap: 12, padding: '12px 0', borderBottom: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
                            {formatDateForPicker(entry.startDate)}{datesMatch(entry.startDate, entry.endDate) ? '' : ` – ${formatDateForPicker(entry.endDate)}`}
                          </span>
                          <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            Request #{entry.requestId}
                          </span>
                          <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            Req {formatTimestampLabel(entry.requestedAt)}
                          </span>
                          {(entry.approvedAt || entry.bookedAt) ? (
                            <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                              {entry.bookedAt ? `Booked ${formatTimestampLabel(entry.bookedAt)}` : `Approved ${formatTimestampLabel(entry.approvedAt)}`}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
                          <span>{formatDayValue(entry.daysInRange)}</span>
                          {roundValue(entry.recordedDays) !== roundValue(entry.daysInRange) ? (
                            <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                              of {formatDayValue(entry.recordedDays)} recorded
                            </div>
                          ) : null}
                          <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            {timingLabel}
                          </div>
                        </div>

                        <div>
                          <span style={{ display: 'inline-flex', padding: '4px 8px', border: `1px solid ${typeTone.border}`, background: typeTone.background, color: typeTone.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {formatLeaveTypeLabel(entry.leaveType)}
                          </span>
                        </div>

                        <div>
                          <span style={{ display: 'inline-flex', padding: '4px 8px', border: `1px solid ${statusTone.border}`, background: statusTone.background, color: statusTone.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {formatStatusLabel(entry.status)}
                          </span>
                        </div>

                        <div style={{ fontSize: 12, lineHeight: 1.5, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                          {entry.reason || 'No reason recorded'}
                          {entry.rejectionNotes ? (
                            <div style={{ marginTop: 4, color: colours.cta }}>
                              Rejection: {entry.rejectionNotes}
                            </div>
                          ) : null}
                          {entry.updatedAt ? (
                            <div style={{ marginTop: 4, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                              Updated {formatTimestampLabel(entry.updatedAt)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Person Ledger
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.helixBlue }}>
              Select a person from the team summary
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(AnnualLeaveReport);
