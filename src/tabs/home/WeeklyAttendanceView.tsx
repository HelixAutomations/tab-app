import React, { useState, useMemo } from 'react';
import { debugLog } from '../../utils/debug';
import { Icon, Text, DefaultButton } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { FaUmbrellaBeach } from 'react-icons/fa';

interface AttendanceRecord {
  Attendance_ID: number;
  Entry_ID: number;
  First_Name: string;
  Initials: string;
  Level: string;
  Week_Start: string;
  Week_End: string;
  ISO_Week: number;
  Attendance_Days: string;
  Confirmed_At: string | null;
  status?: string;
  isConfirmed?: boolean;
  isOnLeave?: boolean;
  // Some backends provide a comma-separated weekday list here
  Status?: string;
  // Some leave feeds might also attach dates here
  Leave_Start?: string;
  Leave_End?: string;
}

interface WeeklyAttendanceViewProps {
  isDarkMode: boolean;
  attendanceRecords: AttendanceRecord[];
  teamData: any[];
  userData: any;
  annualLeaveRecords: any[];
  futureLeaveRecords: any[];
  onAttendanceUpdated?: (updatedRecords: AttendanceRecord[]) => void;
  onOpenModal?: () => void;
  onDayUpdate?: (initials: string, day: string, status: 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office', week: 'current' | 'next') => void;
}

// Custom icon component to handle both FluentUI icons and custom images
const StatusIcon: React.FC<{ 
  status: 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office';
  size: string;
  color: string;
}> = ({ status, size, color }) => {
  if (status === 'office') {
    return (
      <svg
        viewBox="0 0 57.56 100"
        aria-label="Helix Office"
        role="img"
        style={{ width: size, height: size, display: 'block', color }}
      >
        <g>
          <path fill="currentColor" d="M57.56,13.1c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1C6.4,39.77,0,41.23,0,48.5v-13.1C0,28.13,6.4,26.68,11.19,24.74c4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.09h0Z" />
          <path fill="currentColor" d="M57.56,38.84c0,7.27-7.6,10.19-11.59,11.64s-29.98,11.16-34.78,13.1c-4.8,1.94-11.19,3.4-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.46,11.59-4.37,11.59-11.64v13.09h0Z" />
          <path fill="currentColor" d="M57.56,64.59c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1-4.8,1.94-11.19,3.39-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.1h0Z" />
        </g>
      </svg>
    );
  }
  
  if (status === 'away') {
    return (
      <FaUmbrellaBeach
        style={{
          color,
          fontSize: size
        }}
      />
    );
  }
  
  const iconName = status === 'off-sick' ? 'Health' :
                   status === 'out-of-office' ? 'Suitcase' :
                   status === 'wfh' ? 'Home' : 'Help';
  
  return (
    <Icon 
      iconName={iconName}
      style={{ 
        color: color, 
        fontSize: size 
      }} 
    />
  );
};

const WEEK_FILTER_OPTIONS = [
  { key: 'current', label: 'This Week' },
  { key: 'next', label: 'Next Week' }
] as const;

const DAY_FILTER_OPTIONS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' }
] as const;

const STATUS_FILTER_OPTIONS = [
  { key: 'office', label: 'Office' },
  { key: 'wfh', label: 'WFH' },
  { key: 'away', label: 'Away' },
  { key: 'off-sick', label: 'Sick' },
  { key: 'out-of-office', label: 'OOO' }
] as const;

type WeekFilterKey = typeof WEEK_FILTER_OPTIONS[number]['key'];
type DayFilterKey = typeof DAY_FILTER_OPTIONS[number]['key'];
type StatusFilterKey = typeof STATUS_FILTER_OPTIONS[number]['key'];

const DAY_ORDER: DayFilterKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_INDEX_MAP: Record<DayFilterKey, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4
};

const WeeklyAttendanceView: React.FC<WeeklyAttendanceViewProps> = ({
  isDarkMode,
  attendanceRecords,
  teamData,
  userData,
  annualLeaveRecords,
  futureLeaveRecords,
  onAttendanceUpdated,
  onOpenModal,
  onDayUpdate
}) => {
  debugLog('WeeklyAttendanceView received data:', {
    attendanceRecordsCount: attendanceRecords?.length,
    teamDataCount: teamData?.length,
    sampleAttendanceRecord: attendanceRecords?.[0],
    sampleTeamMember: teamData?.[0],
    annualLeaveCount: annualLeaveRecords?.length,
    futureLeaveCount: futureLeaveRecords?.length,
    allAttendanceInitials: attendanceRecords?.map(r => r.Initials) || [],
    allTeamInitials: teamData?.map(t => t.Initials) || []
  });
  
  // State for view mode
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  
  // Filters state
  const [selectedWeeks, setSelectedWeeks] = useState<WeekFilterKey[]>(['current']);
  const [selectedDays, setSelectedDays] = useState<DayFilterKey[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilterKey[]>([]);

  // Helper function to check if someone is on leave for a specific week
  const getLeaveStatusForWeek = (
    initials: string,
    weekOffset: 0 | 1 = 0
  ): 'away' | 'out-of-office' | null => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    if (weekOffset === 1) {
      startOfWeek.setDate(startOfWeek.getDate() + 7);
    }
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday
    
    const leaveRecords = weekOffset === 0 ? annualLeaveRecords : futureLeaveRecords;
    
    // Helper to extract possible date fields with varying keys
    const getDate = (obj: any, keys: string[]): Date | null => {
      for (const k of keys) {
        const v = obj[k];
        if (v) {
          const d = new Date(v);
          if (!isNaN(d.getTime())) return d;
        }
      }
      return null;
    };

    for (const leave of leaveRecords) {
      const leaveInitials = (leave.Initials || leave.person || leave.Person || leave.initials || '').toString().trim().toUpperCase();
      if (leaveInitials !== initials.toString().trim().toUpperCase()) {
        continue;
      }
      
      // Check status is booked
      const leaveStatus = (leave.status || '').toString().toLowerCase();
      if (leaveStatus !== 'booked') {
        continue;
      }
      
      const leaveStart = getDate(leave, ['start_date', 'Leave_Start', 'Start', 'From', 'StartDate', 'start', 'leaveStart']);
      const leaveEnd = getDate(leave, ['end_date', 'Leave_End', 'End', 'To', 'EndDate', 'end', 'leaveEnd']);
      if (!leaveStart || !leaveEnd) {
        continue;
      }
      
      // Check if leave period overlaps with the week
      const overlaps = leaveStart <= endOfWeek && leaveEnd >= startOfWeek;
      
      // Debug log
      if (overlaps) {
  debugLog(`DEBUG: ${initials} is on leave for week ${weekOffset}:`, {
          leaveStart: leaveStart.toDateString(),
          leaveEnd: leaveEnd.toDateString(),
          weekStart: startOfWeek.toDateString(),
          weekEnd: endOfWeek.toDateString(),
          status: leaveStatus
        });
      }

      if (!overlaps) {
        continue;
      }

      const leaveReasonTokens = [
        leave.reason,
        leave.Reason,
        leave.leave_reason,
        leave.leaveReason,
        leave.type,
        leave.Type,
        leave.leave_type,
        leave.category,
        leave.Category
      ]
        .map((token) => (token ? token.toString().toLowerCase() : ''))
        .filter(Boolean);

      const reasonText = leaveReasonTokens.join(' ');
      const normalizedReason = reasonText.replace(/\s+/g, ' ').trim();
      const isExplicitOutOfOffice = /\b(out[-\s]?of[-\s]?office|ooo)\b/.test(normalizedReason);

      return isExplicitOutOfOffice ? 'out-of-office' : 'away';
    }

    return null;
  };

  // Helper function to get daily attendance pattern for a specific week
  const getDailyAttendance = (member: any, weekOffset: 0 | 1 = 0): ('wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office')[] => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    // Check if on leave for this specific week (from leave arrays)
    const leaveStatusForWeek = getLeaveStatusForWeek(member.Initials, weekOffset);
    if (leaveStatusForWeek) {
      return [
        leaveStatusForWeek,
        leaveStatusForWeek,
        leaveStatusForWeek,
        leaveStatusForWeek,
        leaveStatusForWeek
      ];
    }

    // Fallback: trust member-level flags from attendance API
    const memberAwayFlag = weekOffset === 0 && (member.isOnLeave === true || member.IsOnLeave === true);
    if (memberAwayFlag) {
      return ['away', 'away', 'away', 'away', 'away'];
    }
    
    // For next week (weekOffset = 1), we might have different data structure
    const attendanceKey = weekOffset === 0 ? 'attendanceDays' : 'nextWeekAttendanceDays';
    let attendanceDays: string = member[attendanceKey]
      || member.attendanceDays
      || member.Attendance_Days
      || member.Status
      || '';
    
    // Debug: Check what data we actually have
  debugLog(`DEBUG: getDailyAttendance for ${member.Initials || member.First}:`, {
      weekOffset,
      attendanceKey,
      attendanceDays,
      memberStatus: member.Status,
      memberKeys: Object.keys(member)
    });
    
    // If still empty, try to find a matching attendance record by initials
    if (!attendanceDays || attendanceDays.toString().trim() === '') {
      const rec = attendanceRecords.find(r => r.Initials === member.Initials);
      if (rec) {
        attendanceDays = rec.Attendance_Days || rec.Status || '';
      }
    }

    // Normalize string
    const normalized = (attendanceDays || '').toString().trim();
    const normalizedLower = normalized.toLowerCase();

    // If attendance is just a status string (single token), apply to all days
    if (['wfh', 'office', 'away', 'off-sick', 'out-of-office'].includes(normalizedLower)) {
      const statusValue = normalizedLower as 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office';
      return Array(5).fill(statusValue);
    }
    
    // If no attendance days specified, default to working from home
    if (!normalized) {
      return ['wfh', 'wfh', 'wfh', 'wfh', 'wfh'];
    }
    
    // Otherwise, parse a comma-separated list of weekdays
    const tokens = normalized
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean);

    return days.map((day) => {
      // Parse status from format like "Mon:office,Tue:wfh" or just office days like "Mon,Tue"
      const dayStatus = tokens.find(token => token.includes(':') && token.startsWith(day.slice(0, 3).toLowerCase()));
      if (dayStatus) {
        const [, status] = dayStatus.split(':');
        return status as 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office';
      }
      
      // Legacy format - if day is mentioned, assume office, otherwise wfh
      const isInOffice = tokens.includes(day.toLowerCase())
        || tokens.includes(day.slice(0, 3).toLowerCase());
      const status = isInOffice ? 'office' : 'wfh';
      return status;
    });
  };

  const getDayIcon = (status: 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office') => {
    switch (status) {
      case 'office': return 'helix-logo'; // Custom Helix logo for office
      case 'wfh': return 'Home';
      case 'away': return 'Vacation'; // Palm tree icon for away
      case 'off-sick': return 'Health';
      case 'out-of-office': return 'Suitcase';
      default: return 'Help';
    }
  };

  const getDayColor = (status: 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office') => {
    switch (status) {
      case 'office': return isDarkMode ? colours.blue : colours.missedBlue;  // Accent in dark mode
      case 'wfh': return colours.green;       // WFH - Helix Green  
      case 'away': return colours.subtleGrey; // Away - Subtle Grey
      case 'off-sick': return colours.cta;  // Off Sick - CTA Red
      case 'out-of-office': return colours.orange; // Out-Of-Office - Orange
      default: return colours.grey;
    }
  };

  // Process team data
  const processedTeamData = useMemo(() => {
    return teamData.map(member => {
      const userInitials = userData?.displayName?.match(/\b\w/g)?.join('').toUpperCase() || 
                          userData?.mail?.substring(0, 2).toUpperCase() || 'UN';
                          
      const attendanceRecord = attendanceRecords.find(
        (rec) => rec.Initials === member.Initials
      );

      // Prefer Attendance_Days; fall back to backend Status or team member Status
      const attendanceDays = attendanceRecord?.Attendance_Days 
        || attendanceRecord?.Status 
        || (member as any).Status 
        || '';
      
  debugLog('processedTeamData debug - ONE TIME ONLY:', {
        memberInitials: member.Initials,
        attendanceRecord,
        attendanceDays,
        attendanceRecordsCount: attendanceRecords.length,
        allAttendanceInitials: attendanceRecords.map(r => r.Initials),
        foundMatch: !!attendanceRecord
      });
      
      // Only log once by checking if this is the first member
      if (member.Initials === teamData[0]?.Initials) {
  debugLog('FULL ATTENDANCE RECORDS:', attendanceRecords);
  debugLog('FULL TEAM DATA:', teamData);
      }
      
      const leaveStatusCurrentWeek = getLeaveStatusForWeek(member.Initials, 0);
      const leaveStatusNextWeek = getLeaveStatusForWeek(member.Initials, 1);

      // Determine overall status for filtering purposes
      let status = 'unknown';
      if (leaveStatusCurrentWeek) {
        status = leaveStatusCurrentWeek;
      } else if (attendanceDays.includes('Monday') || attendanceDays.includes('Tuesday') || 
                 attendanceDays.includes('Wednesday') || attendanceDays.includes('Thursday') || 
                 attendanceDays.includes('Friday')) {
        status = 'office';
      } else {
        status = 'home';
      }

      return {
        ...member,
        status,
        attendanceDays,
        isConfirmed: attendanceRecord?.Confirmed_At !== null,
        isUser: member.Initials === userInitials,
        isOnLeaveCurrentWeek: Boolean(leaveStatusCurrentWeek),
        isOnLeaveNextWeek: Boolean(leaveStatusNextWeek),
        currentWeekLeaveStatus: leaveStatusCurrentWeek,
        nextWeekLeaveStatus: leaveStatusNextWeek,
      };
    });
  }, [teamData, attendanceRecords, userData, annualLeaveRecords, futureLeaveRecords]);

  // Styles
  const containerStyle = (isDark: boolean) => mergeStyles({
    padding: 0,
    background: 'transparent',
    color: isDark ? colours.dark.text : colours.light.text,
    borderRadius: 0,
  });

  const weeklyCardStyle = (isDark: boolean, isUser: boolean) => mergeStyles({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '12px 16px',
    margin: '1px 0',
    background: isUser 
      ? (isDark ? `linear-gradient(135deg, ${colours.blue}20 0%, ${colours.dark.cardBackground} 100%)` : `linear-gradient(135deg, ${colours.missedBlue}12 0%, ${colours.light.cardBackground} 100%)`)
      : (isDark ? colours.dark.cardBackground : colours.light.cardBackground),
    border: isUser 
      ? `3px solid ${isDark ? colours.blue : colours.missedBlue}` 
      : `1px solid ${isDark ? colours.dark.border : colours.light.border}`,
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    minHeight: '70px',
    position: 'relative',
    gap: '12px',
    boxShadow: isUser 
      ? (isDark ? `0 4px 16px rgba(49, 130, 206, 0.35)` : `0 4px 16px rgba(13, 47, 96, 0.2)`)
      : 'none',
    
    '&:hover': {
      background: isUser
        ? (isDark ? `linear-gradient(135deg, ${colours.blue}35 0%, ${colours.dark.sectionBackground} 100%)` : `linear-gradient(135deg, ${colours.missedBlue}18 0%, ${colours.light.sectionBackground} 100%)`)
        : (isDark ? colours.dark.sectionBackground : colours.light.sectionBackground),
      transform: isUser ? 'translateY(-2px)' : 'none',
      boxShadow: isUser 
        ? (isDark ? `0 8px 24px rgba(49, 130, 206, 0.45)` : `0 8px 24px rgba(13, 47, 96, 0.25)`)
        : (isDark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)')
    },
    
    '&::before': isUser ? {
      content: '""',
      position: 'absolute',
      left: '-3px',
      top: '-3px',
      right: '-3px',
      bottom: '-3px',
      borderRadius: '8px',
      background: `linear-gradient(135deg, ${isDark ? colours.blue : colours.missedBlue} 0%, ${colours.blue} 100%)`,
      zIndex: -1,
      opacity: 0.6
    } : {}
  });

  const nameStyle = (isDark: boolean, isUser: boolean) => mergeStyles({
    fontSize: '13px',
    fontWeight: isUser ? '700' : '500',
    color: isUser 
      ? (isDark ? colours.blue : colours.missedBlue)
      : (isDark ? colours.dark.text : colours.light.text),
    minWidth: '90px',
    maxWidth: '90px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textShadow: isUser ? (isDark ? '0 1px 2px rgba(49, 130, 206, 0.35)' : '0 1px 2px rgba(13, 47, 96, 0.3)') : 'none'
  });

  const weekIconsStyle = mergeStyles({
    display: 'flex',
    gap: '3px',
    alignItems: 'center'
  });

  const dayIconStyle = (status: 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office') => mergeStyles({
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: getDayColor(status) + '20',
    border: `1px solid ${getDayColor(status)}`,
    fontSize: '9px',
    color: getDayColor(status),
    transition: 'all 0.15s ease'
  });

  const filterButtonStyle = (isActive: boolean) => mergeStyles({
    minWidth: '54px',
    height: '24px',
    padding: '0 10px',
    fontSize: '11px',
    fontWeight: 500,
    background: isActive
      ? (isDarkMode
        ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.35) 0%, rgba(27, 91, 136, 0.26) 100%)'
        : 'linear-gradient(135deg, rgba(54, 144, 206, 0.20) 0%, rgba(118, 184, 228, 0.16) 100%)')
      : 'transparent',
    border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? colours.dark.border : colours.light.border)}`,
    color: isActive ? (isDarkMode ? '#E9F5FF' : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text),
    borderRadius: '6px',
    lineHeight: 1.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: isActive
      ? (isDarkMode
        ? '0 4px 6px rgba(42, 116, 168, 0.38)'
        : '0 4px 6px rgba(54, 144, 206, 0.22)')
      : 'none',
    '&:hover': {
      background: isActive
        ? (isDarkMode
          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.42) 0%, rgba(27, 91, 136, 0.32) 100%)'
          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.26) 0%, rgba(118, 184, 228, 0.22) 100%)')
        : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)')
    }
  });

  const segmentedControlStyle = mergeStyles({
    display: 'flex',
    gap: '4px',
    padding: '2px',
    borderRadius: '8px',
    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.26)' : 'rgba(54, 144, 206, 0.22)'}`
  });

  const viewToggleButtonStyle = (isActive: boolean) => mergeStyles({
    minWidth: '70px',
    padding: '2px 14px',
    height: '26px',
    fontSize: '11px',
    fontWeight: 600,
    background: isActive
      ? (isDarkMode
        ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.32) 0%, rgba(26, 100, 152, 0.24) 100%)'
        : 'linear-gradient(135deg, rgba(54, 144, 206, 0.18) 0%, rgba(93, 170, 226, 0.14) 100%)')
      : 'transparent',
    color: isActive ? (isDarkMode ? '#E9F5FF' : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text),
    border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? colours.dark.border : colours.light.border)}`,
    borderRadius: '6px',
    lineHeight: 1.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: isActive
      ? (isDarkMode
        ? '0 4px 7px rgba(37, 122, 184, 0.26)'
        : '0 4px 7px rgba(54, 144, 206, 0.18)')
      : 'none',
    '&:hover': {
      background: isActive
        ? (isDarkMode
          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.42) 0%, rgba(26, 100, 152, 0.32) 100%)'
          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(93, 170, 226, 0.2) 100%)')
        : (isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(54, 144, 206, 0.1)')
    }
  });

  const filterBarStyle = mergeStyles({
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  });

  const viewClusterStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '6px',
    flex: '0 1 auto'
  });

  const viewToggleRowStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  });

  const filtersClusterStyle = mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%'
  });

  const combinedFilterStyle = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    rowGap: '6px',
    alignItems: 'flex-start',
    padding: '4px 0 0 0',
    borderTop: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`
  });

  const filterSectionBaseStyle = mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '0'
  });

  const filterSectionAutoStyle = mergeStyles(filterSectionBaseStyle, {
    flex: '0 0 auto'
  });

  const filterSectionGrowStyle = mergeStyles(filterSectionBaseStyle, {
    flex: '1 1 280px'
  });

  const chipRowStyle = mergeStyles({
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap'
  });

  const filterLabelStyle = mergeStyles({
    fontSize: '10px',
    fontWeight: 600,
    color: isDarkMode ? '#E2E8F0' : '#1E3A8A',
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  });

  const toggleWeekSelection = (week: WeekFilterKey) => {
    setSelectedWeeks(prev => {
      if (prev.includes(week)) {
        return prev.length === 1 ? prev : prev.filter(item => item !== week);
      }
      return [...prev, week];
    });
  };

  const toggleDaySelection = (day: DayFilterKey) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(item => item !== day) : [...prev, day]);
  };

  const toggleStatusSelection = (status: StatusFilterKey) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(item => item !== status) : [...prev, status]);
  };

  // Get today's attendance status for a member
  const getTodayAttendance = (member: any): string => {
    const today = new Date();
    const dayIndex = today.getDay();
    
    // Convert Sunday (0) to Monday-based index (0-4 for Mon-Fri)
    const mondayBasedIndex = dayIndex === 0 ? -1 : dayIndex - 1;
    
    // Debug info
  debugLog(`DEBUG: getTodayAttendance for ${member.Initials || member.First}:`, {
      today: today.toDateString(),
      dayIndex,
      mondayBasedIndex,
      isWeekend: mondayBasedIndex < 0 || mondayBasedIndex > 4
    });
    
    // For weekends, use Friday's status as the "current" status
    if (mondayBasedIndex < 0 || mondayBasedIndex > 4) {
      const currentWeekAttendance = getDailyAttendance(member, 0);
      const fridayStatus = currentWeekAttendance[4]; // Friday is index 4
      return fridayStatus || member.status || 'wfh';
    }
    
    const currentWeekAttendance = getDailyAttendance(member, 0);
    const todayStatus = currentWeekAttendance[mondayBasedIndex] || member.status || 'wfh';
    
  debugLog(`DEBUG: Today status for ${member.Initials || member.First}:`, {
      currentWeekAttendance,
      mondayBasedIndex,
      todayStatus
    });
    
    return todayStatus;
  };

  // Get next workday's attendance status for a member  
  const getNextWorkdayAttendance = (member: AttendanceRecord): { status: string; label: string; day: string } => {
    const today = new Date();
    const todayIndex = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // If it's weekend (Saturday=6 or Sunday=0), show Monday
    if (todayIndex === 0 || todayIndex === 6) {
      const currentWeekAttendance = getDailyAttendance(member, 0);
      const nextWeekAttendance = getDailyAttendance(member, 1);
      
      // If today is Saturday, Monday is next week. If today is Sunday, Monday is today's week.
      const mondayAttendance = todayIndex === 6 ? nextWeekAttendance : currentWeekAttendance;
      const mondayStatus = mondayAttendance[0]; // Monday is index 0
      
      return {
        status: mondayStatus || member.status || 'wfh',
        label: 'Monday:',
        day: 'Monday'
      };
    }
    
    // For weekdays, show tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIndex = tomorrow.getDay();
    
    // Convert Sunday (0) to Monday-based index (0-4 for Mon-Fri)
    const mondayBasedIndex = tomorrowIndex === 0 ? -1 : tomorrowIndex - 1;
    
    // If tomorrow is weekend, don't show anything
    if (mondayBasedIndex < 0 || mondayBasedIndex > 4) {
      return {
        status: member.status || 'wfh',
        label: '',
        day: ''
      };
    }
    
    // Check if tomorrow is next week
    const isNextWeek = tomorrow.getDate() < today.getDate() || 
                      (tomorrow.getDate() - today.getDate()) >= 7 ||
                      tomorrow.getMonth() !== today.getMonth();
    
    const weekOffset = isNextWeek ? 1 : 0;
    const weekAttendance = getDailyAttendance(member, weekOffset);
    const tomorrowStatus = weekAttendance[mondayBasedIndex] || member.status || 'wfh';
    
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const dayName = dayNames[mondayBasedIndex] || 'Tomorrow';
    
    return {
      status: tomorrowStatus,
      label: 'tomorrow:',
      day: dayName
    };
  };

  const filteredData = useMemo(() => {
    const weekSelections = selectedWeeks.length > 0 ? selectedWeeks : ['current'];

    return processedTeamData.filter(member => {
      let matchesCurrent = false;
      let matchesNext = false;

      if (weekSelections.includes('current')) {
        const currentWeekAttendance = getDailyAttendance(member, 0);
        const matchesDay = selectedDays.length === 0
          ? currentWeekAttendance.some(Boolean)
          : selectedDays.some(day => {
              const index = DAY_INDEX_MAP[day];
              return index >= 0 && currentWeekAttendance[index] !== undefined;
            });

        const matchesStatus = selectedStatuses.length === 0
          ? true
          : currentWeekAttendance.some((status, index) => {
              if (!status) {
                return false;
              }
              if (selectedDays.length === 0) {
                return selectedStatuses.includes(status);
              }
              const dayKey = DAY_ORDER[index];
              return selectedDays.includes(dayKey) && selectedStatuses.includes(status);
            });

        matchesCurrent = matchesDay && matchesStatus;
      }

      if (weekSelections.includes('next')) {
        const nextWeekAttendance = getDailyAttendance(member, 1);
        const matchesDay = selectedDays.length === 0
          ? nextWeekAttendance.some(Boolean)
          : selectedDays.some(day => {
              const index = DAY_INDEX_MAP[day];
              return index >= 0 && nextWeekAttendance[index] !== undefined;
            });

        const matchesStatus = selectedStatuses.length === 0
          ? true
          : nextWeekAttendance.some((status, index) => {
              if (!status) {
                return false;
              }
              if (selectedDays.length === 0) {
                return selectedStatuses.includes(status);
              }
              const dayKey = DAY_ORDER[index];
              return selectedDays.includes(dayKey) && selectedStatuses.includes(status);
            });

        matchesNext = matchesDay && matchesStatus;
      }

      return matchesCurrent || matchesNext;
    });
  }, [processedTeamData, selectedWeeks, selectedDays, selectedStatuses]);

  const validStatuses: StatusFilterKey[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];

  const getStatusForActiveFilters = (member: any): StatusFilterKey => {
    const weekPreference: WeekFilterKey[] = selectedWeeks.length > 0 ? selectedWeeks : ['current'];
    
    // If specific days are selected (daily filter is active), show attendance for ONLY those days
    if (selectedDays.length > 0) {
      for (const week of weekPreference) {
        const attendance = getDailyAttendance(member, week === 'current' ? 0 : 1);

        for (const day of selectedDays) {
          const index = DAY_INDEX_MAP[day];
          if (index < 0) {
            continue;
          }
          const status = attendance[index];
          if (!status) {
            continue;
          }
          if (selectedStatuses.length === 0 || selectedStatuses.includes(status)) {
            return status;
          }
        }
      }
      
      // If no status found for selected days, return a fallback based on the first selected day
      const firstDay = selectedDays[0];
      const index = DAY_INDEX_MAP[firstDay];
      if (index >= 0) {
        const attendance = getDailyAttendance(member, weekPreference.includes('current') ? 0 : 1);
        return (attendance[index] || 'wfh') as StatusFilterKey;
      }
    }
    
    // If no specific days are selected, use today's attendance for daily view
    const today = new Date();
    const dayIndex = today.getDay();
    const isWeekend = dayIndex === 0 || dayIndex === 6; // Sunday or Saturday
    
    if (isWeekend) {
      const todayStatus = getTodayAttendance(member as AttendanceRecord);
      if (validStatuses.includes(todayStatus as StatusFilterKey)) {
        return todayStatus as StatusFilterKey;
      }
    } else {
      // For weekdays, show today's attendance
      const todayStatus = getTodayAttendance(member as AttendanceRecord);
      if (validStatuses.includes(todayStatus as StatusFilterKey)) {
        return todayStatus as StatusFilterKey;
      }
    }

    // Fallback to first available status
    const fallbackWeek = getDailyAttendance(member, 0);
    const fallback = fallbackWeek.find(status => validStatuses.includes(status as StatusFilterKey));
    return (fallback || 'wfh') as StatusFilterKey;
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Filter Controls */}
      <div className={filterBarStyle}>
        <div className={viewClusterStyle}>
          <div className={viewToggleRowStyle}>
            <div className={segmentedControlStyle}>
              <DefaultButton
                text="Daily"
                iconProps={{ iconName: 'CalendarDay' }}
                onClick={() => setViewMode('daily')}
                styles={{ root: viewToggleButtonStyle(viewMode === 'daily') }}
              />
              <DefaultButton
                text="Weekly"
                iconProps={{ iconName: 'CalendarWeek' }}
                onClick={() => setViewMode('weekly')}
                styles={{ root: viewToggleButtonStyle(viewMode === 'weekly') }}
              />
            </div>
          </div>
        </div>

        <div className={filtersClusterStyle}>
          <div className={combinedFilterStyle}>
            <div className={filterSectionAutoStyle}>
              <Text className={filterLabelStyle}>Week</Text>
              <div className={chipRowStyle}>
                {WEEK_FILTER_OPTIONS.map(option => (
                  <DefaultButton
                    key={option.key}
                    text={option.label}
                    onClick={() => toggleWeekSelection(option.key)}
                    styles={{ root: filterButtonStyle(selectedWeeks.includes(option.key)) }}
                  />
                ))}
              </div>
            </div>

            <div className={filterSectionGrowStyle}>
              <Text className={filterLabelStyle}>Days</Text>
              <div className={chipRowStyle}>
                {DAY_FILTER_OPTIONS.map(option => (
                  <DefaultButton
                    key={option.key}
                    text={option.label}
                    onClick={() => toggleDaySelection(option.key)}
                    styles={{ root: filterButtonStyle(selectedDays.includes(option.key)) }}
                  />
                ))}
              </div>
            </div>

            <div className={filterSectionGrowStyle}>
              <Text className={filterLabelStyle}>Status</Text>
              <div className={chipRowStyle}>
                {STATUS_FILTER_OPTIONS.map(option => (
                  <DefaultButton
                    key={option.key}
                    text={option.label}
                    onClick={() => toggleStatusSelection(option.key)}
                    styles={{ root: filterButtonStyle(selectedStatuses.includes(option.key)) }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Attendance Grid */}
      <div style={{ marginBottom: '12px' }}>
        {/* Team member grid with multiple columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '8px',
          maxWidth: '100%'
        }}>
          {viewMode === 'daily' ? (
            // Daily Summary View - Group by status
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {(() => {
                // Group people by today's status
                const statusGroups = filteredData.reduce((groups, member) => {
                  const representativeStatus = getStatusForActiveFilters(member);
                  if (!groups[representativeStatus]) {
                    groups[representativeStatus] = [];
                  }
                  groups[representativeStatus].push(member);
                  return groups;
                }, {} as Record<string, typeof filteredData>);

                // Define status order and labels
                const statusOrder = ['wfh', 'office', 'away', 'off-sick', 'out-of-office'];
                const statusLabels = {
                  office: 'In Office',
                  wfh: 'Working From Home',
                  away: 'Away',
                  'off-sick': 'Off Sick',
                  'out-of-office': 'Out Of Office'
                };

                return statusOrder
                  .filter(status => statusGroups[status]?.length > 0)
                  .map(status => (
                    <div 
                      key={status}
                      style={{
                        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        borderRadius: '8px',
                        padding: '16px',
                        minWidth: '280px',
                        flex: '1',
                        boxShadow: isDarkMode ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.07)',
                        transition: 'background 0.2s ease, box-shadow 0.2s ease',
                        cursor: 'default'
                      }}
                    >
                      {/* Status Header */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
                      }}>
                        <div 
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            backgroundColor: `${getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')}20`, // Light fill - 20% opacity
                            border: `1px solid ${getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')}`, // Full opacity border
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <StatusIcon
                            status={status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office'}
                            size="12px"
                            color={getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')}
                          />
                        </div>
                        <div>
                          <div style={{ 
                            fontWeight: '600', 
                            fontSize: '14px',
                            color: isDarkMode ? colours.dark.text : colours.light.text
                          }}>
                            {statusLabels[status as keyof typeof statusLabels]}
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            color: isDarkMode ? colours.dark.subText : colours.light.subText
                          }}>
                            {statusGroups[status].length} {statusGroups[status].length === 1 ? 'person' : 'people'}
                          </div>
                        </div>
                      </div>

                      {/* People List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {statusGroups[status].map((member: any) => {
                          const nextWorkday = getNextWorkdayAttendance(member);
                          const nextWorkdayDifferent = nextWorkday.status !== status && nextWorkday.label !== '';
                          
                          return (
                            <div 
                              key={member.Initials}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: member.isUser 
                                  ? (isDarkMode ? 'rgba(74, 155, 79, 0.1)' : 'rgba(74, 155, 79, 0.05)')
                                  : (isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
                              }}
                            >
                              <span style={{
                                fontSize: '13px',
                                fontWeight: member.isUser ? '700' : '400',
                                color: member.isUser ? colours.missedBlue : (isDarkMode ? colours.dark.text : colours.light.text)
                              }}>
                                {member.First || member.Initials}
                                {member.isUser && (
                                  <span style={{ 
                                    fontSize: '9px', 
                                    color: colours.missedBlue,
                                    marginLeft: '4px',
                                    fontWeight: '600',
                                    background: `${colours.missedBlue}15`,
                                    padding: '1px 4px',
                                    borderRadius: '3px'
                                  }}>
                                    (you)
                                  </span>
                                )}
                              </span>
                              
                              {/* Next workday indicator - only show if different */}
                              {nextWorkdayDifferent && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.6 }}>
                                  <span style={{ 
                                    fontSize: '8px', 
                                    color: isDarkMode ? colours.dark.subText : colours.light.subText
                                  }}>
                                    {nextWorkday.label}
                                  </span>
                                  <div 
                                    style={{
                                      width: '12px',
                                      height: '12px',
                                      borderRadius: '2px',
                                      backgroundColor: getDayColor(nextWorkday.status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office'),
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                    title={`${nextWorkday.day}: ${nextWorkday.status}`}
                                  >
                                    <StatusIcon
                                      status={nextWorkday.status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office'}
                                      size="6px"
                                      color="white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
              })()}
            </div>
          ) : (
            // Weekly View - Multi-column grid
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '6px',
              width: '100%'
            }}>
              {filteredData
              .sort((a, b) => {
                // User first, then alphabetical by first name
                if (a.isUser && !b.isUser) return -1;
                if (!a.isUser && b.isUser) return 1;
                return (a.First || a.Initials).localeCompare(b.First || b.Initials);
              })
              .map(member => {
                // Weekly View - Full two weeks
                const currentWeekAttendance = getDailyAttendance(member, 0);
                const nextWeekAttendance = getDailyAttendance(member, 1);
                
                return (
                  <div 
                    key={member.Initials}
                    style={{
                      background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      borderRadius: '6px',
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      minHeight: '32px',
                      width: '100%',
                      boxSizing: 'border-box',
                      boxShadow: isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.2)' : '0 2px 4px rgba(0, 0, 0, 0.05)'
                    }}
                  >
                    {/* Name - Compact width for alignment */}
                    <div style={{
                      minWidth: '65px',
                      maxWidth: '65px',
                      fontWeight: member.isUser ? '700' : '500',
                      color: member.isUser ? colours.missedBlue : (isDarkMode ? colours.dark.text : colours.light.text),
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {member.First || member.Initials}
                      {member.isUser && (
                        <span style={{ 
                          fontSize: '9px', 
                          color: colours.missedBlue,
                          marginLeft: '4px',
                          fontWeight: '600',
                          background: `${colours.missedBlue}15`,
                          padding: '1px 4px',
                          borderRadius: '3px'
                        }}>
                          (you)
                        </span>
                      )}
                    </div>                    {/* Current Week Icons */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {currentWeekAttendance.map((dayStatus: any, index: any) => {
                        const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][index];
                        const isOnLeave = dayStatus === 'out-of-office';
                        const isClickable = member.isUser && onDayUpdate && !isOnLeave;
                        
                        return (
                          <div 
                            key={`current-${index}`}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '2px',
                              backgroundColor: `${getDayColor(dayStatus)}20`, // Light fill - 20% opacity
                              border: `1px solid ${getDayColor(dayStatus)}`, // Full opacity border
                              cursor: isClickable ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '8px'
                            }}
                            title={isOnLeave ? `${dayName}: On Annual Leave` : `${dayName}: ${dayStatus}`}
                            onClick={isClickable ? (e) => {
                              e.stopPropagation();
                              const statusCycle: ('office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')[] = ['wfh', 'office', 'away', 'off-sick', 'out-of-office'];
                              const currentIndex = statusCycle.indexOf(dayStatus as any);
                              const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
                              onDayUpdate(member.Initials, dayName, nextStatus, 'current');
                            } : undefined}
                          >
                            <StatusIcon
                              status={dayStatus}
                              size="8px"
                              color={getDayColor(dayStatus)}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Divider */}
                    <div style={{
                      width: '1px',
                      height: '16px',
                      backgroundColor: isDarkMode ? '#4A5568' : '#E2E8F0'
                    }} />

                    {/* Next Week Icons */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {nextWeekAttendance.map((dayStatus: any, index: any) => {
                        const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][index];
                        const isOnLeave = dayStatus === 'out-of-office';
                        const isClickable = member.isUser && onDayUpdate && !isOnLeave;
                        
                        return (
                          <div 
                            key={`next-${index}`}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '2px',
                              backgroundColor: `${getDayColor(dayStatus)}20`, // Light fill - 20% opacity
                              border: `1px solid ${getDayColor(dayStatus)}`, // Full opacity border
                              cursor: isClickable ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '7px',
                              opacity: 0.8 // Slightly faded to distinguish from current week
                            }}
                            title={`Next ${dayName}: ${dayStatus}`}
                            onClick={isClickable ? (e) => {
                              e.stopPropagation();
                              const statusCycle: ('office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')[] = ['wfh', 'office', 'away', 'off-sick', 'out-of-office'];
                              const currentIndex = statusCycle.indexOf(dayStatus as any);
                              const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
                              onDayUpdate(member.Initials, dayName, nextStatus, 'next');
                            } : undefined}
                          >
                            <StatusIcon
                              status={dayStatus}
                              size="8px"
                              color={getDayColor(dayStatus)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {filteredData.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: isDarkMode ? colours.dark.subText : colours.light.subText
        }}>
          <Icon iconName="Search" style={{ fontSize: '24px', marginBottom: '8px' }} />
          <Text>No team members match the selected filters</Text>
        </div>
      )}
    </div>
  );
};

export default WeeklyAttendanceView;