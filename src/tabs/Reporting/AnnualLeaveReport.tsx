import React, { useCallback, useEffect, useMemo, useState } from "react";
import { 
  DatePicker, 
  DefaultButton, 
  Icon,
  type IDatePickerStyles, 
  type IButtonStyles,
  DayOfWeek
} from "@fluentui/react";
import { colours } from "../../app/styles/colours";
import { useTheme } from "../../app/functionality/ThemeContext";
import { TeamData } from "../../app/functionality/types";
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
  rejection_notes?: string;
  hearing_confirmation?: boolean;
  hearing_details?: string;
}

interface Props {
  data: AnnualLeaveRecord[];
  teamData: TeamData[];
  triggerRefresh?: () => void;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
}

const UNPAID_LEAVE_CAP = 5;

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

const ROLE_OPTIONS = [
  { key: 'Partner', label: 'Partner' },
  { key: 'Associate Solicitor', label: 'Associate' },
  { key: 'Solicitor', label: 'Solicitor' },
  { key: 'Paralegal', label: 'Paralegal' },
  { key: 'Ops', label: 'Ops' },
  { key: 'Inactive', label: 'Inactive' },
] as const;

interface TeamMember {
  initials: string;
  display: string;
  role?: string;
  isActive: boolean;
  email?: string;
  holidayEntitlement: number;
}

const NAME_MAP: Record<string, string> = {
  'Samuel Packwood': 'Sam Packwood',
  'Bianca ODonnell': "Bianca O'Donnell",
};

const mapNameIfNeeded = (name?: string | null): string => {
  if (!name) return '';
  return NAME_MAP[name] ?? name;
};

const getInitials = (input: string): string => {
  const s = (input || '').trim();
  if (!s) return '?';
  let tokens: string[] = [];
  if (s.includes('@')) {
    const local = s.split('@')[0] || '';
    tokens = local.split(/[^a-zA-Z]+/).filter(Boolean);
  } else {
    tokens = s.split(/\s+/).filter(Boolean);
  }
  if (tokens.length === 0) return '?';
  const first = tokens[0][0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : tokens[0][1] || '';
  const initials = (first + last).toUpperCase();
  return initials || '?';
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
      },
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
          },
          ':focus-within': {
            border: `1px solid ${focusBorder} !important`,
            background: `${focusBackground} !important`,
            boxShadow: isDarkMode
              ? '0 2px 4px rgba(135, 206, 255, 0.12) !important'
              : '0 2px 6px rgba(54, 144, 206, 0.15) !important',
          },
        },
      },
      field: {
        fontSize: '14px !important',
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

const getRangeButtonStyles = (
  isDarkMode: boolean,
  active: boolean,
  hasData: boolean = true,
): IButtonStyles => {
  const resolvedBackground = !hasData
    ? isDarkMode
      ? 'rgba(100, 116, 139, 0.2)'
      : 'rgba(203, 213, 225, 0.35)'
    : active
      ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
      : isDarkMode
        ? 'rgba(15, 23, 42, 0.8)'
        : 'transparent';

  const disabled = !hasData;

  return {
    root: {
      minWidth: 48,
      height: 32,
      fontSize: 12,
      fontWeight: 600,
      borderRadius: 8,
      border: '1px solid',
      borderColor: active
        ? '#2f7cb3'
        : isDarkMode
          ? 'rgba(148, 163, 184, 0.24)'
          : 'rgba(148, 163, 184, 0.4)',
      background: resolvedBackground,
      color: disabled
        ? isDarkMode
          ? 'rgba(148, 163, 184, 0.55)'
          : 'rgba(100, 116, 139, 0.8)'
        : active
          ? '#fff'
          : isDarkMode
            ? '#e2e8f0'
            : '#1e293b',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      fontFamily: 'Raleway, sans-serif',
      padding: '0 12px',
      transition: 'all 0.2s ease',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#2f7cb3'
          : isDarkMode
            ? 'rgba(148, 163, 184, 0.24)'
            : 'rgba(54, 144, 206, 0.12)',
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? 'linear-gradient(135deg, #266795 0%, #1e5a7a 100%)'
          : isDarkMode
            ? 'rgba(15, 23, 42, 0.9)'
            : 'rgba(54, 144, 206, 0.14)',
    },
  };
};

const getRoleButtonStyles = (
  isDarkMode: boolean,
  active: boolean,
  hasRole: boolean = true,
): IButtonStyles => {
  const resolvedBackground = !hasRole
    ? isDarkMode
      ? 'rgba(100, 116, 139, 0.4)'
      : 'rgba(203, 213, 225, 0.6)'
    : active
      ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
      : isDarkMode
        ? 'rgba(15, 23, 42, 0.8)'
        : 'transparent';

  const disabled = !hasRole;

  return {
    root: {
      minWidth: 40,
      height: 28,
      fontSize: 11,
      fontWeight: 600,
      border: '1px solid',
      borderColor: active
        ? '#2f7cb3'
        : isDarkMode
          ? 'rgba(148, 163, 184, 0.3)'
          : 'rgba(203, 213, 225, 0.7)',
      borderRadius: 4,
      color: disabled
        ? isDarkMode
          ? 'rgba(148, 163, 184, 0.6)'
          : 'rgba(100, 116, 139, 0.7)'
        : active
          ? '#fff'
          : isDarkMode
            ? '#e2e8f0'
            : '#475569',
      background: resolvedBackground,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      padding: '0 10px',
      fontFamily: 'Raleway, sans-serif',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#2f7cb3'
          : isDarkMode
            ? 'rgba(148, 163, 184, 0.24)'
            : 'rgba(54, 144, 206, 0.12)',
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? '#266795'
          : isDarkMode
            ? 'rgba(148, 163, 184, 0.3)'
            : 'rgba(54, 144, 206, 0.16)',
    },
  };
};

const getTeamButtonStyles = (
  isDarkMode: boolean,
  active: boolean,
  hasLeave: boolean = true,
): IButtonStyles => {
  const activeBackground = active
    ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
    : isDarkMode
      ? 'rgba(15, 23, 42, 0.8)'
      : 'transparent';

  const activeBorder = active
    ? `1px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

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
      color: active ? '#ffffff' : (isDarkMode ? '#E2E8F0' : colours.missedBlue),
      boxShadow: active
        ? (isDarkMode ? '0 2px 8px rgba(54, 144, 206, 0.3)' : '0 2px 8px rgba(54, 144, 206, 0.25)')
        : 'none',
      fontFamily: 'Raleway, sans-serif',
      transform: active ? 'translateY(-1px)' : 'none',
      transition: 'all 0.2s ease',
      opacity: hasLeave ? 1 : 0.55,
      cursor: hasLeave ? 'pointer' : 'default',
    },
    rootHovered: {
      background: active
        ? `linear-gradient(135deg, #2f7cb3 0%, #266795 100%)`
        : (isDarkMode ? 'rgba(15, 23, 42, 0.86)' : 'rgba(54, 144, 206, 0.1)'),
      transform: hasLeave ? 'translateY(-1px)' : 'none',
      boxShadow: hasLeave
        ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.4)' : '0 4px 12px rgba(54, 144, 206, 0.35)')
        : 'none',
    },
    rootPressed: {
      background: active
        ? `linear-gradient(135deg, #266795 0%, #1e5a7a 100%)`
        : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(54, 144, 206, 0.14)'),
      transform: hasLeave ? 'translateY(0)' : 'none',
    },
  };
};

const clearFilterButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  height: 32,
  borderRadius: 8,
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

const dateStampButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 2,
  padding: '8px 12px',
  borderRadius: 10,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
  color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
  minWidth: 120,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
});

const containerStyle = (isDarkMode: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  background: 'transparent',
  padding: 0,
  minHeight: '100%',
});

const surface = (isDarkMode: boolean, overrides: React.CSSProperties = {}): React.CSSProperties => ({
  background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
  borderRadius: 12,
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
  boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)',
  padding: 16,
  ...overrides,
});

const workingDaysBetween = (start: Date, end: Date): number => {
  if (!start || !end) return 1;
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(23, 59, 59, 999);

  while (cursor <= endCopy) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
};

const formatTimeAgo = (timestamp?: number): string => {
  if (!timestamp) return 'Not refreshed yet';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const computeRange = (key: RangeKey): { start: Date; end: Date } => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (key) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(start.getDate());
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start.setDate(now.getDate() - now.getDay() + 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastWeek':
      start.setDate(now.getDate() - now.getDay() - 6);
      end.setDate(start.getDate() + 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last90Days':
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    case 'quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStart, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'yearToDate': {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      if (currentMonth >= 3) {
        start.setFullYear(currentYear, 3, 1);
      } else {
        start.setFullYear(currentYear - 1, 3, 1);
      }
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
      start.setFullYear(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      return { start: new Date(now), end: new Date(now) };
    case 'all':
    default:
      return { start: new Date(0), end };
  }

  return { start, end };
};

const normalizeRange = (input: { start: Date; end: Date }): { start: Date; end: Date } => {
  const start = new Date(input.start);
  const end = new Date(input.end);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const quickRanges: Array<{ key: RangeKey; label: string; get: () => { start: Date; end: Date } | null }> = [
  { key: 'all', label: 'All', get: () => null },
  ...RANGE_OPTIONS.map(({ key, label }) => ({
    key,
    label,
    get: () => normalizeRange(computeRange(key)),
  })),
];

const isWithin = (value: Date | null, start: Date, end: Date): boolean => {
  if (!value) return false;
  const time = value.getTime();
  return time >= start.getTime() && time <= end.getTime();
};

function getFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const start = new Date(date);
  if (date.getMonth() < 3) {
    start.setFullYear(year - 1, 3, 1);
  } else {
    start.setFullYear(year, 3, 1);
  }
  const end = new Date(start);
  end.setFullYear(start.getFullYear() + 1);
  end.setMonth(2, 31);
  return { start, end };
}

const AnnualLeaveReport: React.FC<Props> = ({
  data,
  teamData,
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching,
}) => {
  const { isDarkMode } = useTheme();
  const [rangeKey, setRangeKey] = useState<RangeKey>("yearToDate");
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [showRoleFilter, setShowRoleFilter] = useState(false);
  const [showDatasetInfo, setShowDatasetInfo] = useState(false);
  const [expandedUserDetails, setExpandedUserDetails] = useState<string | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastRefreshTimestamp) {
      setTimeElapsed(0);
    }
  }, [lastRefreshTimestamp]);

  const getRefreshIndicatorColor = useCallback((): string => {
    const maxSeconds = 15 * 60;
    const progress = Math.min(timeElapsed / maxSeconds, 1);
    const r = Math.round(34 + (59 - 34) * progress);
    const g = Math.round(197 + (130 - 197) * progress);
    const b = Math.round(94 + (246 - 94) * progress);
    return `rgb(${r}, ${g}, ${b})`;
  }, [timeElapsed]);

  const range = useMemo(() => {
    if (rangeKey === "custom") {
      if (!customDateRange || !customDateRange.start || !customDateRange.end) {
        return null;
      }
      return normalizeRange({ start: customDateRange.start, end: customDateRange.end });
    }
    const preset = quickRanges.find((entry) => entry.key === rangeKey);
    return preset?.get() ?? null;
  }, [rangeKey, customDateRange]);

  const showCustomPickers = rangeKey === "custom";
  const customStartValue = customDateRange?.start ?? null;
  const customEndValue = customDateRange?.end ?? null;
  const displayRangeStart = range?.start ?? (showCustomPickers ? customStartValue : null);
  const displayRangeEnd = range?.end ?? (showCustomPickers ? customEndValue : null);

  const fromLabel = rangeKey === "all"
    ? "All time"
    : displayRangeStart
      ? formatDateTag(displayRangeStart)
      : "Select start";
  const toLabel = rangeKey === "all"
    ? "Latest"
    : displayRangeEnd
      ? formatDateTag(displayRangeEnd)
      : "Select end";
  const currentRangeLabel = rangeKey === "custom"
    ? "Custom"
    : quickRanges.find((entry) => entry.key === rangeKey)?.label ?? "All";

  const workingDaysCount = useMemo(
    () => (range ? workingDaysBetween(range.start, range.end) : undefined),
    [range],
  );

  const teamMembers = useMemo<TeamMember[]>(() => {
    if (!teamData || teamData.length === 0) return [];
    return teamData
      .map((record) => {
        const display = mapNameIfNeeded(displayName(record));
        const initialsRaw = (record["Initials"] || "").trim().toUpperCase();
        const initials = initialsRaw || getInitials(display);
        const status = (record.status || "").toLowerCase();
        return {
          initials,
          display,
          role: record["Role"]?.trim(),
          isActive: status !== "inactive",
          email: record["Email"]?.trim(),
          holidayEntitlement: record.holiday_entitlement ?? 25,
        } satisfies TeamMember;
      })
      .filter((member) => member.initials && member.initials !== "?")
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [teamData]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, TeamMember>();
    teamMembers.forEach((member) => {
      map.set(member.initials, member);
    });
    return map;
  }, [teamMembers]);

  const filteredLeave = useMemo(() => {
    const entries = data ?? [];
    return entries.filter((row) => {
      const statusMatch = (row.status || "").toLowerCase() === "booked";
      if (!statusMatch) {
        return false;
      }
      const initials = (row.fe || "").trim().toUpperCase();
      const member = memberLookup.get(initials);
      if (!member || !member.isActive) {
        return false;
      }
      if (selectedTeams.size > 0 && !selectedTeams.has(initials)) {
        return false;
      }
      if (selectedRoles.size > 0) {
        const roleKey = member.role?.trim();
        if (!roleKey || !selectedRoles.has(roleKey)) {
          return false;
        }
      }
      if (range) {
        const leaveStart = parseDate(row.start_date);
        const leaveEnd = parseDate(row.end_date) ?? leaveStart;
        if (!leaveStart && !leaveEnd) return false;
        const withinStart = leaveStart ? isWithin(leaveStart, range.start, range.end) : false;
        const withinEnd = leaveEnd ? isWithin(leaveEnd, range.start, range.end) : false;
        if (!withinStart && !withinEnd) {
          return false;
        }
      }
      return true;
    });
  }, [data, range, selectedTeams, selectedRoles, memberLookup]);

  const leaveByMember = useMemo(() => {
    const map = new Map<string, AnnualLeaveRecord[]>();
    filteredLeave.forEach((row) => {
      const initials = (row.fe || "").trim().toUpperCase();
      if (!map.has(initials)) {
        map.set(initials, []);
      }
      map.get(initials)!.push(row);
    });
    return map;
  }, [filteredLeave]);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLeave.forEach((row) => {
      const initials = (row.fe || "").trim().toUpperCase();
      counts.set(initials, (counts.get(initials) || 0) + 1);
    });
    return counts;
  }, [filteredLeave]);

  const leaveEntriesForDisplay = useMemo(() => {
    return filteredLeave
      .map((row) => {
        const initials = (row.fe || "").trim().toUpperCase();
        const member = memberLookup.get(initials);
        const start = parseDate(row.start_date);
        const end = parseDate(row.end_date) ?? start;
        const formattedStart = formatDateForPicker(start ?? null);
        const formattedEnd = formatDateForPicker(end ?? null);
        const dateLabel = formattedStart && formattedEnd
          ? formattedStart === formattedEnd
            ? formattedStart
            : `${formattedStart} – ${formattedEnd}`
          : formattedStart || formattedEnd || "Unknown";
        return {
          id: row.request_id ?? `${initials}-${row.start_date}-${row.end_date}`,
          initials,
          name: member?.display ?? (initials || "Unknown"),
          start,
          end,
          dateLabel,
          daysTaken: row.days_taken ?? 0,
          leaveType: row.leave_type || "Standard",
          status: row.status || "Unknown",
          reason: row.reason || "",
        };
      })
      .sort((a, b) => {
        const aTime = a.start?.getTime() ?? 0;
        const bTime = b.start?.getTime() ?? 0;
        return bTime - aTime;
      });
  }, [filteredLeave, memberLookup]);

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLeave.forEach((row) => {
      const initials = (row.fe || "").trim().toUpperCase();
      const roleKey = memberLookup.get(initials)?.role?.trim();
      if (!roleKey) return;
      counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
    });
    return counts;
  }, [filteredLeave, memberLookup]);

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      if (!member.isActive) return false;
      const includeTeam = selectedTeams.size === 0 || selectedTeams.has(member.initials);
      const includeRole = selectedRoles.size === 0 || (member.role && selectedRoles.has(member.role));
      return includeTeam && includeRole;
    });
  }, [teamMembers, selectedTeams, selectedRoles]);

  const leaveData = useMemo(() => {
    return filteredMembers.map((member) => {
      const personLeave = leaveByMember.get(member.initials) ?? [];
      const standardTaken = personLeave
        .filter((l) => (l.leave_type || "").toLowerCase() === "standard")
        .reduce((sum, l) => sum + (l.days_taken || 0), 0);
      const unpaidTaken = personLeave
        .filter((l) => (l.leave_type || "").toLowerCase() === "unpaid")
        .reduce((sum, l) => sum + (l.days_taken || 0), 0);
      const standardRemaining = Math.max(0, member.holidayEntitlement - standardTaken);
      const unpaidRemaining = Math.max(0, UNPAID_LEAVE_CAP - unpaidTaken);
      const totalTaken = standardTaken + unpaidTaken;

      return {
        initials: member.initials,
        fullName: member.display,
        entitlement: member.holidayEntitlement,
        standardTaken,
        standardRemaining,
        unpaidTaken,
        unpaidRemaining,
        totalTaken,
      };
    });
  }, [filteredMembers, leaveByMember]);

  const totals = useMemo(() => {
    return leaveData.reduce(
      (acc, row) => ({
        entitlement: acc.entitlement + row.entitlement,
        standardTaken: acc.standardTaken + row.standardTaken,
        standardRemaining: acc.standardRemaining + row.standardRemaining,
        unpaidTaken: acc.unpaidTaken + row.unpaidTaken,
        unpaidRemaining: acc.unpaidRemaining + row.unpaidRemaining,
        totalTaken: acc.totalTaken + row.totalTaken,
      }),
      { entitlement: 0, standardTaken: 0, standardRemaining: 0, unpaidTaken: 0, unpaidRemaining: 0, totalTaken: 0 },
    );
  }, [leaveData]);

  const datasetSummary = useMemo(() => {
    const total = data.length;
    const booked = data.filter((row) => (row.status || "").toLowerCase() === "booked").length;
    const uniquePeople = new Set(data.map((row) => (row.fe || "").trim().toUpperCase()).filter(Boolean)).size;
    return { total, booked, uniquePeople };
  }, [data]);

  const lastRefreshLabel = useMemo(() => formatTimeAgo(lastRefreshTimestamp), [lastRefreshTimestamp]);
  const footerTimestamp = useMemo(() => (lastRefreshTimestamp ? new Date(lastRefreshTimestamp) : new Date()), [lastRefreshTimestamp]);

  const handleRangeSelect = useCallback((key: RangeKey) => {
    if (key === "custom") {
      setCustomDateRange((prev) => {
        if (prev && prev.start && prev.end) {
          return prev;
        }
        const { start, end } = getFinancialYear();
        return { start, end };
      });
    } else {
      setCustomDateRange(null);
    }
    setRangeKey(key);
  }, []);

  const handleCustomDateChange = useCallback(
    (position: "start" | "end") => (date?: Date | null) => {
      setCustomDateRange((prev) => {
        const next = prev ? { ...prev } : { start: null as Date | null, end: null as Date | null };
        next[position] = date ? new Date(date) : null;
        return next;
      });
      setRangeKey("custom");
    },
    [],
  );

  const handleTeamToggle = useCallback((initials: string) => {
    const key = initials.toUpperCase();
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleClearTeams = useCallback(() => {
    setSelectedTeams(new Set());
  }, []);

  const handleRoleToggle = useCallback((roleKey: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleKey)) {
        next.delete(roleKey);
      } else {
        next.add(roleKey);
      }
      return next;
    });
  }, []);

  const handleClearRoles = useCallback(() => {
    setSelectedRoles(new Set());
  }, []);

  const handleToggleRoles = useCallback(() => {
    setShowRoleFilter((prev) => !prev);
  }, []);

  const handleToggleInfo = useCallback(() => {
    setShowDatasetInfo((prev) => !prev);
  }, []);

  const handleUserClick = useCallback((initials: string) => {
    setExpandedUserDetails((prev) => prev === initials ? null : initials);
  }, []);

  const handleRefresh = useCallback(() => {
    if (triggerRefresh && !isFetching) {
      triggerRefresh();
      setTimeElapsed(0);
    }
  }, [triggerRefresh, isFetching]);

  const getLeaveBreakdown = useCallback(
    (personInitials: string, leaveType?: "taken" | "remaining" | "unpaid" | "total") => {
      const entries = leaveByMember.get(personInitials) ?? [];
      const member = teamMembers.find((p) => p.initials === personInitials);
      if (!member) return "";

      const standardLeave = entries.filter((l) => (l.leave_type || "").toLowerCase() === "standard");
      const unpaidLeave = entries.filter((l) => (l.leave_type || "").toLowerCase() === "unpaid");
      const standardTaken = standardLeave.reduce((sum, l) => sum + (l.days_taken || 0), 0);
      const unpaidTaken = unpaidLeave.reduce((sum, l) => sum + (l.days_taken || 0), 0);

      switch (leaveType) {
        case "taken":
          if (standardLeave.length === 0) return "No standard leave taken";
          return `Standard Leave Taken:\n${standardLeave.map((l) => {
            const start = parseDate(l.start_date);
            const end = parseDate(l.end_date);
            const startLabel = start ? start.toLocaleDateString("en-GB") : "?";
            const endLabel = end ? end.toLocaleDateString("en-GB") : startLabel;
            return `• ${startLabel} - ${endLabel}: ${l.days_taken} days (${l.reason || "n/a"})`;
          }).join("\n")}`;
        case "remaining": {
          const remaining = Math.max(0, member.holidayEntitlement - standardTaken);
          return `Remaining Leave:\n• Entitlement: ${member.holidayEntitlement} days\n• Taken: ${standardTaken} days\n• Remaining: ${remaining} days`;
        }
        case "unpaid":
          if (unpaidLeave.length === 0) return "No unpaid leave taken";
          return `Unpaid Leave:\n${unpaidLeave.map((l) => {
            const start = parseDate(l.start_date);
            const end = parseDate(l.end_date);
            const startLabel = start ? start.toLocaleDateString("en-GB") : "?";
            const endLabel = end ? end.toLocaleDateString("en-GB") : startLabel;
            return `• ${startLabel} - ${endLabel}: ${l.days_taken} days (${l.reason || "n/a"})`;
          }).join("\n")}\n• Unpaid cap: ${UNPAID_LEAVE_CAP} days`;
        case "total":
          return `Total Leave Taken:\n• Standard: ${standardTaken} days\n• Unpaid: ${unpaidTaken} days\n• Total: ${standardTaken + unpaidTaken} days`;
        default:
          return `${member.display}\n• Entitlement: ${member.holidayEntitlement} days\n• Standard taken: ${standardTaken} days\n• Unpaid taken: ${unpaidTaken} days`;
      }
    },
    [leaveByMember, teamMembers],
  );

  const filteredUserEntries = useMemo(() => {
    if (!expandedUserDetails) return [];
    return leaveEntriesForDisplay.filter(entry => entry.initials === expandedUserDetails);
  }, [leaveEntriesForDisplay, expandedUserDetails]);

  const datasetInfoItems = useMemo(
    () => [
      { label: "Rows available", value: datasetSummary.total.toLocaleString() },
      { label: "Booked requests", value: datasetSummary.booked.toLocaleString() },
      { label: "People with leave", value: datasetSummary.uniquePeople.toLocaleString() },
      { label: "Current range", value: currentRangeLabel },
      { label: "Filters applied", value: `${selectedRoles.size} roles · ${selectedTeams.size} team` },
      { label: "Working days", value: workingDaysCount ? workingDaysCount.toString() : "All time" },
    ],
    [datasetSummary, currentRangeLabel, selectedRoles.size, selectedTeams.size, workingDaysCount],
  );

  return (
    <div style={containerStyle(isDarkMode)}>
      <div style={surface(isDarkMode)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            {showCustomPickers ? (
              <div style={{ display: "flex", gap: 8 }}>
                <DatePicker
                  label="From"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={customStartValue || undefined}
                  onSelectDate={handleCustomDateChange("start")}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
                <DatePicker
                  label="To"
                  styles={getDatePickerStyles(isDarkMode)}
                  value={customEndValue || undefined}
                  onSelectDate={handleCustomDateChange("end")}
                  allowTextInput
                  firstDayOfWeek={DayOfWeek.Monday}
                  formatDate={formatDateForPicker}
                  parseDateFromString={parseDatePickerInput}
                />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => handleRangeSelect("custom")}
                  title="Click to customise the start date"
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>From</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{fromLabel}</span>
                </button>
                <button
                  type="button"
                  style={dateStampButtonStyle(isDarkMode)}
                  onClick={() => handleRangeSelect("custom")}
                  title="Click to customise the end date"
                >
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>To</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{toLabel}</span>
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${isFetching ? (isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(148, 163, 184, 0.25)") : getRefreshIndicatorColor()}`,
                  background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.95)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDarkMode ? "#E2E8F0" : colours.missedBlue,
                  transition: "border-color 1s ease",
                }}
                title={
                  isFetching
                    ? "Refreshing data..."
                    : `Next auto-refresh in ${Math.max(0, Math.floor((15 * 60 - timeElapsed) / 60))}m ${Math.max(0, (15 * 60 - timeElapsed) % 60)}s`
                }
              >
                {isFetching ? (
                  <>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: isDarkMode ? "rgba(148, 163, 184, 0.6)" : "rgba(13, 47, 96, 0.5)",
                      }}
                    />
                    Refreshing
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: getRefreshIndicatorColor(),
                        transition: "background 1s ease",
                      }}
                    />
                    {lastRefreshLabel}
                  </>
                )}
              </div>

              {triggerRefresh && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(13, 47, 96, 0.16)"}`,
                    background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.95)",
                    color: isDarkMode ? "#E2E8F0" : colours.missedBlue,
                    cursor: isFetching ? "default" : "pointer",
                    opacity: isFetching ? 0.6 : 1,
                    transition: "all 0.2s ease",
                  }}
                  title={isFetching ? "Refreshing data..." : "Refresh datasets (auto-refreshes every 15 min)"}
                  aria-label={isFetching ? "Refreshing data" : "Refresh datasets"}
                >
                  <Icon
                    iconName="Refresh"
                    style={{
                      fontSize: 16,
                      animation: isFetching ? "spin 1s linear infinite" : "none",
                    }}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleRoles}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(13, 47, 96, 0.16)"}`,
                  background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.95)",
                  color: showRoleFilter ? (isDarkMode ? "#60a5fa" : colours.highlight) : (isDarkMode ? "rgba(148, 163, 184, 0.6)" : "rgba(13, 47, 96, 0.5)"),
                  cursor: "pointer",
                  transform: showRoleFilter ? "translateY(-1px)" : "translateY(0)",
                  transition: "all 0.2s ease",
                }}
                title={showRoleFilter ? "Hide role filter" : "Show role filter"}
                aria-label={showRoleFilter ? "Hide role filter" : "Show role filter"}
              >
                <Icon iconName="People" style={{ fontSize: 16 }} />
              </button>

              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={handleToggleInfo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(13, 47, 96, 0.16)"}`,
                    background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.95)",
                    color: isDarkMode ? "#60a5fa" : colours.highlight,
                    cursor: "pointer",
                    transform: showDatasetInfo ? "translateY(-1px)" : "translateY(0)",
                    transition: "all 0.2s ease",
                  }}
                  title="Dataset information"
                  aria-label="Dataset information"
                >
                  <Icon iconName="Info" style={{ fontSize: 16 }} />
                </button>

                {showDatasetInfo && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 8,
                      padding: "10px 12px",
                      background: isDarkMode ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
                      border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(148, 163, 184, 0.25)"}`,
                      borderRadius: 8,
                      boxShadow: isDarkMode ? "0 8px 16px rgba(0, 0, 0, 0.4)" : "0 4px 12px rgba(0, 0, 0, 0.15)",
                      fontSize: 11,
                      lineHeight: 1.5,
                      width: 260,
                      zIndex: 1000,
                      color: isDarkMode ? "#e2e8f0" : "#334155",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: isDarkMode ? "#60a5fa" : colours.highlight }}>
                      Dataset information
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {datasetInfoItems.map((item) => (
                        <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <span style={{ opacity: 0.75 }}>{item.label}:</span>
                          <span style={{ fontWeight: 600 }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.3)"}`,
                        fontSize: 11,
                        opacity: 0.7,
                        fontStyle: "italic",
                      }}
                    >
                      Data is limited to booked annual leave captured in Dynamics.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: isDarkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(13, 47, 96, 0.04)",
              border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.16)" : "rgba(13, 47, 96, 0.08)"}`,
              fontSize: 12,
              color: isDarkMode ? "rgba(226, 232, 240, 0.85)" : "rgba(13, 47, 96, 0.75)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, opacity: 0.7 }}>Range</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRangeLabel}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, opacity: 0.7 }}>Working days</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{workingDaysCount ? workingDaysCount : "All time"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, opacity: 0.7 }}>Active filters</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {selectedRoles.size === 0 && selectedTeams.size === 0 ? "None" : `${selectedRoles.size} roles · ${selectedTeams.size} team`}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, opacity: 0.7 }}>Entries in view</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{filteredLeave.length.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {quickRanges.map((rangeOption) => {
                const active = rangeOption.key === rangeKey;
                return (
                  <DefaultButton
                    key={rangeOption.key}
                    text={rangeOption.label}
                    onClick={() => handleRangeSelect(rangeOption.key)}
                    styles={getRangeButtonStyles(isDarkMode, active, true)}
                  />
                );
              })}
              {rangeKey !== "all" && (
                <button
                  onClick={() => handleRangeSelect("all")}
                  style={clearFilterButtonStyle(isDarkMode)}
                  title="Clear date range filter"
                >
                  <span style={{ fontSize: 16 }}>×</span>
                  Clear
                </button>
              )}
            </div>

            {showRoleFilter && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {ROLE_OPTIONS.map(({ key, label }) => (
                    <DefaultButton
                      key={key}
                      text={label}
                      onClick={() => handleRoleToggle(key)}
                      styles={getRoleButtonStyles(isDarkMode, selectedRoles.has(key), (roleCounts.get(key) || 0) > 0)}
                    />
                  ))}
                  {selectedRoles.size > 0 && (
                    <button
                      onClick={handleClearRoles}
                      style={clearFilterButtonStyle(isDarkMode)}
                      title="Clear role filter"
                    >
                      <span style={{ fontSize: 16 }}>×</span>
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {teamMembers
                    .filter((member) => member.isActive)
                    .map((member) => {
                      const count = memberCounts.get(member.initials) || 0;
                      const isSelected = selectedTeams.has(member.initials);
                      return (
                        <DefaultButton
                          key={member.initials}
                          text={member.initials}
                          onClick={() => handleTeamToggle(member.initials)}
                          title={`${member.display}${count ? ` (${count} entries)` : ""}`}
                          styles={getTeamButtonStyles(isDarkMode, isSelected, count > 0 || isSelected)}
                        />
                      );
                    })}
                  {selectedTeams.size > 0 && (
                    <button
                      onClick={handleClearTeams}
                      style={clearFilterButtonStyle(isDarkMode)}
                      title="Clear team filter"
                    >
                      <span style={{ fontSize: 16 }}>×</span>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {!showRoleFilter && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {teamMembers
                  .filter((member) => member.isActive)
                  .map((member) => {
                    const count = memberCounts.get(member.initials) || 0;
                    const isSelected = selectedTeams.has(member.initials);
                    return (
                      <DefaultButton
                        key={member.initials}
                        text={member.initials}
                        onClick={() => handleTeamToggle(member.initials)}
                        styles={getTeamButtonStyles(isDarkMode, isSelected, count > 0 || isSelected)}
                        title={`${member.display}${count ? ` (${count} entries)` : ""}`}
                      />
                    );
                  })}
                {selectedTeams.size > 0 && (
                  <button
                    onClick={handleClearTeams}
                    style={clearFilterButtonStyle(isDarkMode)}
                    title="Clear team filter"
                  >
                    <span style={{ fontSize: 16 }}>×</span>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={surface(isDarkMode, { padding: 0 })}>
        <div className="metrics-table">
          <div className="metrics-table-header">
            <span title="Employee name and overview (click to view details)">Employee</span>
            <span title="Annual leave entitlement in days">Entitlement</span>
            <span title="Standard annual leave taken (hover rows for details)">Taken</span>
            <span title="Standard annual leave remaining">Remaining</span>
            <span title="Unpaid leave taken (hover rows for details)">Unpaid</span>
            <span title="Total leave taken (standard + unpaid)">Total</span>
          </div>
          {leaveData.length === 0 && (
            <div className="metrics-table-row animate-table-row">
              <span>No team members selected</span>
              <span>0</span>
              <span>0</span>
              <span>0</span>
              <span>0</span>
              <span>0</span>
            </div>
          )}
          {leaveData.map((row, index) => (
            <div
              key={`${row.initials}-${displayRangeStart?.getTime() ?? "na"}-${displayRangeEnd?.getTime() ?? "na"}-${index}`}
              className="metrics-table-row animate-table-row"
              style={{ 
                animationDelay: `${Math.min(index * 0.05, 0.5)}s`,
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => handleUserClick(row.initials)}
              title={`Click to view detailed leave entries for ${row.fullName}`}
            >
              <span title={getLeaveBreakdown(row.initials)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {row.fullName}
                <Icon 
                  iconName={expandedUserDetails === row.initials ? "ChevronDown" : "ChevronRight"} 
                  style={{ 
                    fontSize: 12, 
                    opacity: 0.6,
                    transition: 'transform 0.2s ease'
                  }} 
                />
              </span>
              <span title={`Annual leave entitlement: ${row.entitlement} days`}>{row.entitlement}</span>
              <span
                style={{ color: row.standardTaken > row.entitlement ? "#dc2626" : "inherit" }}
                title={getLeaveBreakdown(row.initials, "taken")}
              >
                {row.standardTaken}
              </span>
              <span
                style={{ color: row.standardRemaining <= 5 ? "#f59e0b" : "#059669" }}
                title={getLeaveBreakdown(row.initials, "remaining")}
              >
                {row.standardRemaining}
              </span>
              <span
                style={{ color: row.unpaidTaken > 0 ? "#dc2626" : "inherit" }}
                title={getLeaveBreakdown(row.initials, "unpaid")}
              >
                {row.unpaidTaken}
              </span>
              <span
                style={{ fontWeight: 600 }}
                title={getLeaveBreakdown(row.initials, "total")}
              >
                {row.totalTaken}
              </span>
            </div>
          ))}
          <div
            className="metrics-table-row animate-table-row"
            style={{ animationDelay: `${Math.min(leaveData.length * 0.05, 0.5)}s` }}
          >
            <span title="Summary totals for all selected team members">Total</span>
            <span title={`Total entitlement: ${totals.entitlement} days across ${leaveData.length} team members`}>{totals.entitlement}</span>
            <span title={`Total standard leave taken: ${totals.standardTaken} days`}>{totals.standardTaken}</span>
            <span title={`Total standard leave remaining: ${totals.standardRemaining} days`}>{totals.standardRemaining}</span>
            <span title={`Total unpaid leave taken: ${totals.unpaidTaken} days`}>{totals.unpaidTaken}</span>
            <span title={`Total leave taken: ${totals.totalTaken} days (standard + unpaid)`}>{totals.totalTaken}</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "8px 12px",
            fontSize: 12,
            opacity: 0.7,
            fontWeight: 500,
          }}
        >
          Last refreshed: {footerTimestamp.toLocaleDateString("en-GB")} {footerTimestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {expandedUserDetails && (
        <div style={surface(isDarkMode)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Leave entries for {leaveData.find(d => d.initials === expandedUserDetails)?.fullName || expandedUserDetails}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{filteredUserEntries.length} entries</span>
              <button
                onClick={() => setExpandedUserDetails(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  border: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(13, 47, 96, 0.16)"}`,
                  background: "transparent",
                  color: isDarkMode ? "#E2E8F0" : colours.missedBlue,
                  cursor: "pointer",
                  fontSize: 16,
                }}
                title="Close details"
              >
                ×
              </button>
            </div>
          </div>

          {filteredUserEntries.length === 0 ? (
            <div
              style={{
                padding: "16px 20px",
                borderRadius: 8,
                border: `1px dashed ${isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(13, 47, 96, 0.2)"}`,
                color: isDarkMode ? "rgba(226, 232, 240, 0.75)" : "rgba(13, 47, 96, 0.7)",
                fontSize: 13,
              }}
            >
              No leave entries found for this user in the current date range and filters.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 680,
                }}
              >
                <thead>
                  <tr
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      fontSize: 11,
                      color: isDarkMode ? "rgba(226, 232, 240, 0.7)" : "rgba(15, 23, 42, 0.66)",
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Dates</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Days</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Type</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Status</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUserEntries.map((entry, index) => {
                    const zebra = index % 2 === 1;
                    return (
                      <tr
                        key={entry.id}
                        style={{
                          background: zebra
                            ? isDarkMode
                              ? "rgba(148, 163, 184, 0.06)"
                              : "rgba(248, 250, 252, 0.8)"
                            : "transparent",
                          color: isDarkMode ? "#e2e8f0" : "#1f2937",
                        }}
                      >
                        <td style={{ padding: "10px 12px" }}>{entry.dateLabel}</td>
                        <td style={{ padding: "10px 12px" }}>{entry.daysTaken}</td>
                        <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{entry.leaveType.toLowerCase()}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background: entry.status.toLowerCase() === "booked"
                                ? (isDarkMode ? "rgba(16, 185, 129, 0.18)" : "rgba(16, 185, 129, 0.16)")
                                : (isDarkMode ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.18)"),
                              color: entry.status.toLowerCase() === "booked"
                                ? (isDarkMode ? "#34d399" : "#047857")
                                : (isDarkMode ? "#e2e8f0" : "#0f172a"),
                            }}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 280, whiteSpace: "normal", lineHeight: 1.4 }}>
                          {entry.reason || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={surface(isDarkMode)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>All leave entries in view</h3>
          <span style={{ fontSize: 12, opacity: 0.65 }}>{leaveEntriesForDisplay.length} entries</span>
        </div>

        {leaveEntriesForDisplay.length === 0 ? (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 8,
              border: `1px dashed ${isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(13, 47, 96, 0.2)"}`,
              color: isDarkMode ? "rgba(226, 232, 240, 0.75)" : "rgba(13, 47, 96, 0.7)",
              fontSize: 13,
            }}
          >
            No leave entries match the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                minWidth: 680,
              }}
            >
              <thead>
                <tr
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    fontSize: 11,
                    color: isDarkMode ? "rgba(226, 232, 240, 0.7)" : "rgba(15, 23, 42, 0.66)",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Person</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Dates</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Days</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Type</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Status</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${isDarkMode ? "rgba(148, 163, 184, 0.24)" : "rgba(203, 213, 225, 0.8)"}` }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {leaveEntriesForDisplay.map((entry, index) => {
                  const zebra = index % 2 === 1;
                  return (
                    <tr
                      key={entry.id}
                      style={{
                        background: zebra
                          ? isDarkMode
                            ? "rgba(148, 163, 184, 0.06)"
                            : "rgba(248, 250, 252, 0.8)"
                          : "transparent",
                        color: isDarkMode ? "#e2e8f0" : "#1f2937",
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span>{entry.name}</span>
                          <span style={{ fontSize: 11, opacity: 0.6 }}>{entry.initials}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{entry.dateLabel}</td>
                      <td style={{ padding: "10px 12px" }}>{entry.daysTaken}</td>
                      <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{entry.leaveType.toLowerCase()}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: entry.status.toLowerCase() === "booked"
                              ? (isDarkMode ? "rgba(16, 185, 129, 0.18)" : "rgba(16, 185, 129, 0.16)")
                              : (isDarkMode ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.18)"),
                            color: entry.status.toLowerCase() === "booked"
                              ? (isDarkMode ? "#34d399" : "#047857")
                              : (isDarkMode ? "#e2e8f0" : "#0f172a"),
                          }}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: 280, whiteSpace: "normal", lineHeight: 1.4 }}>
                        {entry.reason || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


export default AnnualLeaveReport;