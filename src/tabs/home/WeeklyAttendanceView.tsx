import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { debugLog } from '../../utils/debug';
import { Icon, Text, DefaultButton } from '@fluentui/react';
import { mergeStyles, keyframes } from '@fluentui/react/lib/Styling';
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
  currentUserConfirmed?: boolean;
  onConfirmAttendance?: () => void;
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

// Helper to get "Today" label with Monday date if weekend
const getTodayLabel = (): string => {
  const today = new Date();
  const dayIndex = today.getDay(); // 0=Sun, 6=Sat
  
  if (dayIndex === 0 || dayIndex === 6) {
    // Weekend - show next Monday's date with ordinal suffix
    const monday = new Date(today);
    const daysUntilMonday = dayIndex === 0 ? 1 : 2; // Sunday=1 day, Saturday=2 days
    monday.setDate(today.getDate() + daysUntilMonday);
    const day = monday.getDate();
    
    // Add ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
    const getOrdinal = (n: number): string => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `Monday (${getOrdinal(day)})`;
  }
  
  return 'Today';
};

const WEEK_FILTER_OPTIONS = [
  { key: 'today', label: getTodayLabel(), icon: 'CalendarDay' },
  { key: 'current', label: 'This Week', icon: 'CalendarWeek' },
  { key: 'next', label: 'Next Week', icon: 'CalendarWeek' }
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
  onDayUpdate,
  currentUserConfirmed = true,
  onConfirmAttendance
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
  
  // Filters state - week is single selection, others are multi-select
  const [selectedWeek, setSelectedWeek] = useState<WeekFilterKey>('today');
  const [selectedDays, setSelectedDays] = useState<DayFilterKey[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilterKey[]>([]);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null); // initials of member being edited
  const [editingDay, setEditingDay] = useState<DayFilterKey | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null); // initials of member with week editor open
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, string>>>({}); // { initials: { day: status } }
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [optimisticAttendance, setOptimisticAttendance] = useState<Record<string, string>>({});

  // Clear optimistic overrides only when server data matches what we optimistically set
  // This prevents the UI from reverting while the server is still returning stale data
  useEffect(() => {
    setOptimisticAttendance((prev) => {
      const next: Record<string, string> = {};
      for (const [initials, optimisticValue] of Object.entries(prev)) {
        const serverRecord = attendanceRecords.find(r => r.Initials === initials);
        const serverValue = serverRecord?.Attendance_Days || serverRecord?.Status || '';
        // Keep optimistic value if server hasn't caught up yet
        if (serverValue !== optimisticValue) {
          next[initials] = optimisticValue;
        }
        // If server matches optimistic, drop it (server is now authoritative)
      }
      return next;
    });
  }, [attendanceRecords]);
  
  // Drag and drop state
  const [draggedMember, setDraggedMember] = useState<{ initials: string; name: string; currentStatus: string } | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // Normalize helpers for reliable matching
  const normalizeEmail = (email?: string) => (email ? email.toLowerCase().trim() : '');
  const getMemberEmail = (member: any) =>
    normalizeEmail(member?.Email)
      || normalizeEmail(member?.email)
      || normalizeEmail(member?.Mail)
      || normalizeEmail(member?.mail)
      || normalizeEmail(member?.UserPrincipalName)
      || normalizeEmail(member?.userPrincipalName)
      || normalizeEmail(member?.UPN)
      || normalizeEmail(member?.upn)
      || normalizeEmail(member?.WorkEmail)
      || normalizeEmail(member?.workEmail);

  // Check if current user is admin (based on Level in teamData)
  const userInitials = userData?.displayName?.match(/\b\w/g)?.join('').toUpperCase() || 
                       userData?.mail?.substring(0, 2).toUpperCase() || 'UN';
  const userEmail = normalizeEmail(userData?.mail) || normalizeEmail(userData?.userPrincipalName);
  const adminLevels = new Set([
    'director',
    'partner',
    'admin',
    'manager',
    'team lead',
    'teamlead',
    'lead',
    'owner',
    'principal',
    'head',
    'supervisor'
  ]);

  const currentUserTeamRecord = teamData.find(t => {
    const memberInitials = (t?.Initials || '').toString().trim().toUpperCase();
    const memberEmail = getMemberEmail(t);
    return (userEmail && memberEmail && memberEmail === userEmail) || memberInitials === userInitials;
  });

  const memberLevel = (currentUserTeamRecord?.Level || '').toString().trim().toLowerCase();
  const memberRole = (currentUserTeamRecord?.Role || currentUserTeamRecord?.role || '').toString().trim().toLowerCase();

  const isAdmin = adminLevels.has(memberLevel)
    || adminLevels.has(memberRole)
    || currentUserTeamRecord?.IsAdmin === true
    || currentUserTeamRecord?.isAdmin === true
    || userData?.isAdmin === true
    || (Array.isArray(userData?.roles) && userData.roles.some((r: any) => adminLevels.has((r || '').toString().toLowerCase())));

  // Get week start date for a given week offset
  const getWeekStartDate = (weekOffset: 0 | 1): string => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (weekOffset * 7));
    return monday.toISOString().split('T')[0];
  };
  
  // Check if user can drag a member (admin can drag anyone, users can drag themselves)
  const canDragMember = (_memberInitials: string): boolean => {
    return isEditMode;
  };
  
  // Handle drag start
  const handleDragStart = (e: React.DragEvent, initials: string, name: string, currentStatus: string) => {
    if (!canDragMember(initials)) {
      e.preventDefault();
      return;
    }
    setDraggedMember({ initials, name, currentStatus });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', initials);
  };
  
  // Handle drag over a status group
  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatus !== status) {
      setDragOverStatus(status);
    }
  };
  
  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the container, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStatus(null);
    }
  };
  
  // Handle drop - immediately save to database
  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    
    if (!draggedMember || draggedMember.currentStatus === newStatus) {
      setDraggedMember(null);
      return;
    }
    
    const { initials, name } = draggedMember;
    const member = processedTeamData.find(m => m.Initials === initials);
    if (!member) {
      setDraggedMember(null);
      setSaveError(`Could not find ${name}'s attendance record`);
      setTimeout(() => setSaveError(null), 4000);
      return;
    }
    setDraggedMember(null);
    setSaveError(null);
    setSaveSuccess(null);
    
    // Get the current day's key for today view
    const today = new Date();
    const todayIndex = today.getDay();
    const dayKeys: DayFilterKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const todayDayKey = todayIndex >= 1 && todayIndex <= 5 ? dayKeys[todayIndex - 1] : 'monday';
    
    const weekOffset = selectedWeek === 'next' ? 1 : 0;
    const weekStart = getWeekStartDate(weekOffset);
    
    // Get current attendance pattern for this user
    const currentPattern = getDailyAttendance(member, weekOffset);
    const previousAttendance = member.attendanceDays; // Save for rollback
    
    // Build new pattern - for "Today" view, only change today's status
    const newPattern = [...currentPattern];
    if (selectedWeek === 'today') {
      const dayIndex = DAY_INDEX_MAP[todayDayKey];
      newPattern[dayIndex] = newStatus as any;
    } else {
      // For week view, change all days to new status
      for (let i = 0; i < 5; i++) {
        newPattern[i] = newStatus as any;
      }
    }
    
    const attendanceDays = newPattern.join(',');
    
    // OPTIMISTIC UPDATE: Move the chip immediately before API call
    setOptimisticAttendance((prev) => ({ ...prev, [initials]: attendanceDays }));
    
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/attendance/updateAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initials, weekStart, attendanceDays })
      });
      
      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }
      
      if (!response.ok || (result && result.success === false)) {
        throw new Error(result?.error || `Failed to update attendance for ${name}`);
      }
      
      const statusLabelMap: Record<string, string> = {
        office: 'Office',
        wfh: 'Working From Home',
        away: 'Away',
        'off-sick': 'Off Sick',
        'out-of-office': 'Out of Office'
      };

      // Calmer reassurance message
      setSaveSuccess(`${name} updated to ${statusLabelMap[newStatus] || newStatus}.`);
      setTimeout(() => setSaveSuccess(null), 2000);

      // Notify parent of the update
      if (onAttendanceUpdated) {
        const updatedRecord = {
          Attendance_ID: member.Attendance_ID ?? 0,
          Entry_ID: member.Entry_ID ?? 0,
          First_Name: member.First || member.name || name,
          Initials: initials,
          Level: member.Level ?? '',
          Week_Start: weekStart,
          Week_End: weekStart,
          ISO_Week: member.ISO_Week ?? 0,
          Attendance_Days: attendanceDays,
          Confirmed_At: null,
        } as AttendanceRecord;
        onAttendanceUpdated([updatedRecord]);
      }
      
    } catch (error: any) {
      console.error('Error updating attendance via drag-drop:', error);
      // ROLLBACK: Revert optimistic update on error
      setOptimisticAttendance((prev) => {
        const next = { ...prev };
        if (previousAttendance) {
          next[initials] = previousAttendance;
        } else {
          delete next[initials];
        }
        return next;
      });
      setSaveError(error.message || 'Failed to update attendance');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle drag end (cleanup)
  const handleDragEnd = () => {
    setDraggedMember(null);
    setDragOverStatus(null);
  };

  // Handle immediate single-day status change (used by week editor)
  const handleSingleDayChange = async (initials: string, day: DayFilterKey, newStatus: string) => {
    const member = processedTeamData.find(m => m.Initials === initials);
    if (!member) return;

    const weekOffset = selectedWeek === 'next' ? 1 : 0;
    const weekStart = getWeekStartDate(weekOffset);
    const currentPattern = getDailyAttendance(member, weekOffset);
    const previousAttendance = member.attendanceDays;
    
    // Build new pattern with just this day changed
    const newPattern = [...currentPattern];
    const dayIndex = DAY_INDEX_MAP[day];
    newPattern[dayIndex] = newStatus as any;
    const attendanceDays = newPattern.join(',');
    
    // Optimistic update
    setOptimisticAttendance((prev) => ({ ...prev, [initials]: attendanceDays }));
    
    try {
      const response = await fetch('/api/attendance/updateAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initials, weekStart, attendanceDays })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update');
      }
      
      setSaveSuccess(`Updated ${member.First || initials}'s ${day}`);
      setTimeout(() => setSaveSuccess(null), 1500);
      
    } catch (error) {
      // Rollback
      setOptimisticAttendance((prev) => {
        const next = { ...prev };
        if (previousAttendance) {
          next[initials] = previousAttendance;
        } else {
          delete next[initials];
        }
        return next;
      });
      setSaveError('Failed to update');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  // Handle status change for a specific day (legacy - adds to pending changes)
  const handleStatusChange = (initials: string, day: DayFilterKey, newStatus: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [initials]: {
        ...(prev[initials] || {}),
        [day]: newStatus
      }
    }));
    setEditingDay(null);
    setEditingMember(null);
  };

  // Save pending changes to the server
  const savePendingChanges = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    
    try {
      const weekOffset = selectedWeek === 'next' ? 1 : 0;
      const weekStart = getWeekStartDate(weekOffset);
      
      // Process each user's changes
      for (const [initials, dayChanges] of Object.entries(pendingChanges)) {
        // Get current attendance pattern for this user
        const member = processedTeamData.find(m => m.Initials === initials);
        if (!member) {
          console.warn('Missing team member for attendance save', initials);
          continue;
        }
        const currentPattern = getDailyAttendance(member, weekOffset);
        
        // Build new pattern by applying changes
        const newPattern = [...currentPattern];
        for (const [day, status] of Object.entries(dayChanges)) {
          const dayIndex = DAY_INDEX_MAP[day as DayFilterKey];
          if (dayIndex >= 0 && dayIndex < 5) {
            newPattern[dayIndex] = status as any;
          }
        }
        
        // Convert pattern to comma-separated string
        const attendanceDays = newPattern.join(',');
        
        const response = await fetch('/api/attendance/updateAttendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initials, weekStart, attendanceDays })
        });
        
        let result: any = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        
        if (!response.ok || (result && result.success === false)) {
          throw new Error(result?.error || `Failed to save attendance for ${initials}`);
        }
      }
      
      setPendingChanges({});
      setSaveSuccess('Attendance saved successfully!');
      setTimeout(() => setSaveSuccess(null), 3000);
      
      // Refresh attendance data
      if (onAttendanceUpdated) {
        onAttendanceUpdated([]);
      }
      
    } catch (error: any) {
      console.error('Error saving attendance:', error);
      setSaveError(error.message || 'Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel editing and clear pending changes
  const cancelEditing = () => {
    setIsEditMode(false);
    setEditingMember(null);
    setEditingDay(null);
    setPendingChanges({});
    setSaveError(null);
    setOptimisticAttendance({});
  };

  // Check if user can edit a specific member's attendance
  const canEditMember = (memberInitials: string): boolean => {
    return isAdmin || memberInitials === userInitials;
  };

  // Helper function to check if someone is on leave for a specific week
  const getLeaveStatusForWeek = useCallback((
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
  }, [annualLeaveRecords, futureLeaveRecords]);

  // Helper to normalize date strings for comparison (extract YYYY-MM-DD)
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    return dateStr.substring(0, 10);
  };

  // Helper function to get daily attendance pattern for a specific week
  const getDailyAttendance = useCallback((member: any, weekOffset: 0 | 1 = 0): ('wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office')[] => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    // Get the week start date for this offset
    const targetWeekStart = getWeekStartDate(weekOffset);
    
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
    
    // Find the attendance record for this specific week by matching both Initials AND Week_Start
    const weekRecord = attendanceRecords.find(
      r => r.Initials === member.Initials && normalizeDate(r.Week_Start) === targetWeekStart
    );
    
    let attendanceDays: string = weekRecord?.Attendance_Days || weekRecord?.Status || '';
    
    // Debug: Check what data we actually have
    debugLog(`DEBUG: getDailyAttendance for ${member.Initials || member.First}:`, {
      weekOffset,
      targetWeekStart,
      foundRecord: !!weekRecord,
      attendanceDays,
      allRecordsForInitials: attendanceRecords.filter(r => r.Initials === member.Initials).map(r => ({ Week_Start: r.Week_Start, Attendance_Days: r.Attendance_Days }))
    });

    // Normalize string
    const normalized = (attendanceDays || '').toString().trim();
    const normalizedLower = normalized.toLowerCase();

    // If attendance is just a status string (single token), apply to all days
    const validStatuses = ['wfh', 'office', 'away', 'off-sick', 'out-of-office'];
    if (validStatuses.includes(normalizedLower)) {
      const statusValue = normalizedLower as 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office';
      return Array(5).fill(statusValue);
    }
    
    // If no attendance days specified, default to working from home
    if (!normalized) {
      return ['wfh', 'wfh', 'wfh', 'wfh', 'wfh'];
    }
    
    // Otherwise, parse a comma-separated list
    const tokens = normalized
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean);

    // NEW: Positional status format (e.g. "office,wfh,office,wfh,wfh")
    // If we have exactly 5 tokens and all are valid statuses, treat them positionally
    if (tokens.length === 5 && tokens.every(t => validStatuses.includes(t))) {
      return tokens as ('wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office')[];
    }

    return days.map((day, idx) => {
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
        }, [attendanceRecords, getLeaveStatusForWeek]);

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
    // Get week start dates for current and next week
    const currentWeekStart = getWeekStartDate(0);
    const nextWeekStart = getWeekStartDate(1);
    
    return teamData.map(member => {
      // Match by email if available, fallback to initials
      const memberEmail = getMemberEmail(member);
      const initialsMatch = (member.Initials || '').toString().trim().toUpperCase() === userInitials;
      const isCurrentUser = userEmail
        ? memberEmail === userEmail || initialsMatch
        : initialsMatch;
      
      // Find attendance records for current week AND next week by matching both Initials AND Week_Start
      const currentWeekRecord = attendanceRecords.find(
        (rec) => rec.Initials === member.Initials && normalizeDate(rec.Week_Start) === currentWeekStart
      );
      const nextWeekRecord = attendanceRecords.find(
        (rec) => rec.Initials === member.Initials && normalizeDate(rec.Week_Start) === nextWeekStart
      );

      // For current week: prefer optimistic, then record, then fallback
      const attendanceDays = optimisticAttendance[member.Initials]
        || currentWeekRecord?.Attendance_Days 
        || currentWeekRecord?.Status 
        || (member as any).Status 
        || '';
      
      // For next week
      const nextWeekAttendanceDays = nextWeekRecord?.Attendance_Days 
        || nextWeekRecord?.Status 
        || '';
      
  debugLog('processedTeamData debug:', {
        memberInitials: member.Initials,
        currentWeekStart,
        nextWeekStart,
        currentWeekRecord: currentWeekRecord ? { Week_Start: currentWeekRecord.Week_Start, Attendance_Days: currentWeekRecord.Attendance_Days } : null,
        nextWeekRecord: nextWeekRecord ? { Week_Start: nextWeekRecord.Week_Start, Attendance_Days: nextWeekRecord.Attendance_Days } : null,
        attendanceDays,
        nextWeekAttendanceDays
      });
      
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
        nextWeekAttendanceDays,
        isConfirmed: Boolean(currentWeekRecord?.Confirmed_At),
        isConfirmedCurrentWeek: Boolean(currentWeekRecord?.Confirmed_At),
        isConfirmedNextWeek: Boolean(nextWeekRecord?.Confirmed_At),
        isUser: isCurrentUser,
        isOnLeaveCurrentWeek: Boolean(leaveStatusCurrentWeek),
        isOnLeaveNextWeek: Boolean(leaveStatusNextWeek),
        currentWeekLeaveStatus: leaveStatusCurrentWeek,
        nextWeekLeaveStatus: leaveStatusNextWeek,
      };
    });
  }, [teamData, attendanceRecords, userData, annualLeaveRecords, futureLeaveRecords, userInitials, userEmail, optimisticAttendance, getWeekStartDate, getLeaveStatusForWeek]);

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
      : `1px solid ${isDark ? 'rgba(125, 211, 252, 0.24)' : colours.light.border}`,
    borderRadius: '2px',
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
      borderRadius: '2px',
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
    border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.light.border)}`,
    color: isActive ? (isDarkMode ? '#E9F5FF' : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text),
    borderRadius: '2px',
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
    borderRadius: '2px',
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(30,64,175,0.14) 0%, rgba(2,132,199,0.10) 100%)'
      : 'linear-gradient(135deg, rgba(191,219,254,0.35) 0%, rgba(219,234,254,0.30) 100%)',
    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(54,144,206,0.25)'}`
  });

  const viewToggleButtonStyle = (isActive: boolean) => mergeStyles({
    minWidth: '70px',
    padding: '2px 14px',
    height: '26px',
    fontSize: '11px',
    fontWeight: 600,
    background: isActive
      ? (isDarkMode
        ? 'linear-gradient(135deg, rgba(135,243,243,0.20) 0%, rgba(135,243,243,0.12) 100%)'
        : 'linear-gradient(135deg, rgba(191,219,254,0.55) 0%, rgba(191,219,254,0.35) 100%)')
      : 'transparent',
    color: isActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text),
    border: `1px solid ${isActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(148,163,184,0.26)' : 'rgba(6,23,51,0.14)')}`,
    borderRadius: '2px',
    lineHeight: 1.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: isActive
      ? (isDarkMode
        ? '0 6px 14px rgba(135,243,243,0.20)'
        : '0 6px 14px rgba(54,144,206,0.20)')
      : 'none',
    '&:hover': {
      background: isActive
        ? (isDarkMode
          ? 'linear-gradient(135deg, rgba(135,243,243,0.28) 0%, rgba(135,243,243,0.18) 100%)'
          : 'linear-gradient(135deg, rgba(191,219,254,0.65) 0%, rgba(191,219,254,0.42) 100%)')
        : (isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.10)')
    }
  });

  const filterBarStyle = mergeStyles({
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(30,41,59,0.55) 0%, rgba(15,23,42,0.55) 100%)'
      : colours.light.cardBackground,
    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(6,23,51,0.08)'}`,
    borderRadius: '2px',
    padding: '10px',
    boxShadow: isDarkMode
      ? '0 8px 18px rgba(0,0,0,0.28)'
      : '0 8px 18px rgba(6,23,51,0.10)'
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
    borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.25)'}`
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
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  });

  const selectWeek = (week: WeekFilterKey) => {
    setSelectedWeek(week);
    // When selecting "Today", clear day and status filters since they don't apply
    if (week === 'today') {
      setSelectedDays([]);
      setSelectedStatuses([]);
    }
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
    const weekOffset = selectedWeek === 'next' ? 1 : 0; // 'today' and 'current' both use current week

    return processedTeamData.filter(member => {
      const isConfirmedForSelectedWeek = selectedWeek === 'next'
        ? Boolean((member as any).isConfirmedNextWeek)
        : Boolean((member as any).isConfirmedCurrentWeek);

      const isOnLeaveForSelectedWeek = selectedWeek === 'next'
        ? Boolean((member as any).isOnLeaveNextWeek)
        : Boolean((member as any).isOnLeaveCurrentWeek);

      // Only show "actual" attendance: confirmed records (and explicit leave) for the selected week.
      if (!isConfirmedForSelectedWeek && !isOnLeaveForSelectedWeek) {
        return false;
      }

      const weekAttendance = getDailyAttendance(member, weekOffset);

      if (selectedDays.length > 0) {
        // Require every selected day to satisfy the status filter (if any)
        return selectedDays.every(day => {
          const index = DAY_INDEX_MAP[day];
          if (index < 0) {
            return false;
          }
          const status = weekAttendance[index];
          if (!status) {
            return false;
          }
          return selectedStatuses.length === 0 || selectedStatuses.includes(status);
        });
      }

      // No specific days selected – include everyone unless a status filter eliminates them
      if (selectedStatuses.length === 0) {
        return true;
      }

      return weekAttendance.some(status => status && selectedStatuses.includes(status));
    });
  }, [processedTeamData, selectedWeek, selectedDays, selectedStatuses, getDailyAttendance]);

  const orderedSelectedDays = useMemo(() => {
    return DAY_ORDER.filter(day => selectedDays.includes(day));
  }, [selectedDays]);

  const getStatusForActiveFilters = (member: any): StatusFilterKey => {
    const weekOffset = selectedWeek === 'next' ? 1 : 0; // 'today' and 'current' both use current week
    
    // For 'today' view, return only TODAY's specific status, not a weekly average
    if (selectedWeek === 'today') {
      const todayStatus = getTodayAttendance(member) as StatusFilterKey;
      return todayStatus || 'wfh';
    }
    
    const attendance = getDailyAttendance(member, weekOffset);

    const statusesInWeek = attendance.filter((status): status is StatusFilterKey => Boolean(status)) as StatusFilterKey[];

    if (statusesInWeek.length === 0) {
      return 'wfh';
    }

    if (selectedStatuses.length > 0) {
      for (const status of selectedStatuses) {
        if (statusesInWeek.includes(status)) {
          return status;
        }
      }
    }

    const counts: Record<StatusFilterKey, number> = {
      office: 0,
      wfh: 0,
      away: 0,
      'off-sick': 0,
      'out-of-office': 0,
    };

    statusesInWeek.forEach(status => {
      counts[status] = (counts[status] ?? 0) + 1;
    });

    const preference: StatusFilterKey[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];
    let best: StatusFilterKey = 'wfh';
    let bestCount = -1;
    for (const status of preference) {
      const count = counts[status] ?? 0;
      if (count > bestCount) {
        best = status;
        bestCount = count;
      }
    }

    return best;
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Filter Controls */}
      <div className={filterBarStyle}>
        {/* Top Row: Week Toggle + Confirm Attendance button */}
        <div className={viewClusterStyle} style={{ justifyContent: 'space-between', width: '100%' }}>
          <div className={viewToggleRowStyle}>
            <div className={segmentedControlStyle}>
              {WEEK_FILTER_OPTIONS.map(option => (
                <DefaultButton
                  key={option.key}
                  text={option.label}
                  iconProps={{ iconName: option.icon }}
                  onClick={() => selectWeek(option.key)}
                  styles={{ root: viewToggleButtonStyle(selectedWeek === option.key) }}
                />
              ))}
            </div>
          </div>
          
          {/* Confirm Attendance button - only show when user hasn't confirmed */}
          {!currentUserConfirmed && onConfirmAttendance && (
            <DefaultButton
              text="Confirm Attendance"
              iconProps={{ iconName: 'Calendar' }}
              onClick={onConfirmAttendance}
              styles={{
                root: {
                  height: '26px',
                  padding: '0 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: isDarkMode
                    ? `linear-gradient(135deg, ${colours.cta}30 0%, ${colours.cta}20 100%)`
                    : `linear-gradient(135deg, ${colours.cta}25 0%, ${colours.cta}15 100%)`,
                  border: `1px solid ${colours.cta}`,
                  color: isDarkMode ? '#fff' : colours.cta,
                  borderRadius: '2px',
                  animationName: keyframes({
                    '0%, 100%': { boxShadow: `0 0 0 0 ${colours.cta}40`, transform: 'scale(1)' },
                    '50%': { boxShadow: `0 0 12px 4px ${colours.cta}30`, transform: 'scale(1.02)' }
                  }),
                  animationDuration: '2s',
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                  transition: 'background 0.2s ease, transform 0.15s ease',
                },
                rootHovered: {
                  background: isDarkMode
                    ? `linear-gradient(135deg, ${colours.cta}45 0%, ${colours.cta}30 100%)`
                    : `linear-gradient(135deg, ${colours.cta}35 0%, ${colours.cta}25 100%)`,
                  transform: 'scale(1.05)',
                  animationPlayState: 'paused'
                }
              }}
            />
          )}
          
          {/* Edit Mode Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isEditMode && Object.keys(pendingChanges).length > 0 && (
              <>
                <DefaultButton
                  text={isSaving ? 'Saving...' : 'Save Changes'}
                  iconProps={{ iconName: 'Save' }}
                  disabled={isSaving}
                  onClick={savePendingChanges}
                  styles={{
                    root: {
                      height: '26px',
                      padding: '0 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: isDarkMode
                        ? `linear-gradient(135deg, ${colours.green}30 0%, ${colours.green}20 100%)`
                        : `linear-gradient(135deg, ${colours.green}25 0%, ${colours.green}15 100%)`,
                      border: `1px solid ${colours.green}`,
                      color: isDarkMode ? '#fff' : colours.green,
                      borderRadius: '2px',
                    },
                    rootHovered: {
                      background: isDarkMode
                        ? `linear-gradient(135deg, ${colours.green}45 0%, ${colours.green}30 100%)`
                        : `linear-gradient(135deg, ${colours.green}35 0%, ${colours.green}25 100%)`,
                    }
                  }}
                />
                <DefaultButton
                  text="Cancel"
                  iconProps={{ iconName: 'Cancel' }}
                  onClick={cancelEditing}
                  styles={{
                    root: {
                      height: '26px',
                      padding: '0 10px',
                      fontSize: '11px',
                      background: 'transparent',
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(6,23,51,0.15)'}`,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      borderRadius: '2px',
                    }
                  }}
                />
              </>
            )}
            <DefaultButton
              text={isEditMode ? 'Exit Edit' : 'Edit'}
              iconProps={{ iconName: isEditMode ? 'ChromeClose' : 'Edit' }}
              onClick={() => {
                if (isEditMode) {
                  cancelEditing();
                } else {
                  setIsEditMode(true);
                  setSaveError(null);
                  setSaveSuccess(null);
                }
              }}
              styles={{
                root: {
                  height: '26px',
                  padding: '0 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: isEditMode
                    ? (isDarkMode ? `${colours.highlight}25` : `${colours.highlight}15`)
                    : 'transparent',
                  border: `1px solid ${isEditMode ? colours.highlight : (isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(6,23,51,0.15)')}`,
                  color: isEditMode ? colours.highlight : (isDarkMode ? colours.dark.text : colours.light.text),
                  borderRadius: '2px',
                },
                rootHovered: {
                  background: isDarkMode
                    ? `${colours.highlight}30`
                    : `${colours.highlight}20`,
                  borderColor: colours.highlight
                }
              }}
            />
          </div>
        </div>
        
        {/* Edit Mode Status Messages */}
        {(saveError || saveSuccess) && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '8px',
            borderRadius: '2px',
            fontSize: '12px',
            background: saveError
              ? (isDarkMode ? `${colours.cta}20` : `${colours.cta}10`)
              : (isDarkMode ? `${colours.green}20` : `${colours.green}10`),
            border: `1px solid ${saveError ? colours.cta : colours.green}`,
            color: saveError ? colours.cta : colours.green
          }}>
            <Icon iconName={saveError ? 'ErrorBadge' : 'CheckMark'} style={{ marginRight: '8px' }} />
            {saveError || saveSuccess}
          </div>
        )}
        
        {/* Edit Mode Helper */}
        {isEditMode && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '8px',
            borderRadius: '2px',
            fontSize: '11px',
            background: isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(6,23,51,0.04)',
            border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(6,23,51,0.08)'}`,
            color: isDarkMode ? colours.dark.subText : colours.light.subText,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap'
          }}>
            <Icon iconName="Info" style={{ fontSize: '12px' }} />
            <span>
              <strong>Edit mode:</strong> Drag to move • Click to edit week
            </span>
            {isSaving && (
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: colours.highlight }}>
                <Icon iconName="Sync" style={{ marginRight: '4px', animation: 'spin 1s linear infinite' }} />
                Saving...
              </span>
            )}
            {draggedMember && (
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: colours.orange }}>
                Moving {draggedMember.name}...
              </span>
            )}
          </div>
        )}

        {/* Bottom Row: Status + Days */}
        {selectedWeek !== 'today' && (
          <div className={filtersClusterStyle}>
            <div className={combinedFilterStyle}>
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
            </div>
          </div>
        )}
      </div>

      {/* Summary Bar - Quick glance at totals */}
      {selectedWeek === 'today' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '12px',
          padding: '10px 14px',
          background: isDarkMode
            ? 'linear-gradient(135deg, rgba(30,41,59,0.45) 0%, rgba(15,23,42,0.45) 100%)'
            : 'linear-gradient(135deg, rgba(248,250,252,0.9) 0%, rgba(241,245,249,0.9) 100%)',
          borderRadius: '2px',
          border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(6,23,51,0.06)'}`,
          flexWrap: 'wrap'
        }}>
          {(() => {
            // Calculate totals for today
            const statusCounts = filteredData.reduce((acc, member) => {
              const status = getStatusForActiveFilters(member);
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            const summaryItems = [
              { status: 'office', label: 'Office', color: isDarkMode ? colours.blue : colours.missedBlue },
              { status: 'wfh', label: 'WFH', color: colours.green },
              { status: 'away', label: 'Away', color: colours.subtleGrey },
              { status: 'off-sick', label: 'Sick', color: colours.cta },
              { status: 'out-of-office', label: 'OOO', color: colours.orange }
            ].filter(item => statusCounts[item.status] > 0);

            // Find current user's status
            const currentUser = filteredData.find(m => m.isUser);
            const userStatus = currentUser ? getStatusForActiveFilters(currentUser) : null;
            const userStatusLabel = userStatus ? {
              office: 'In Office',
              wfh: 'Working From Home',
              away: 'Away',
              'off-sick': 'Off Sick',
              'out-of-office': 'Out Of Office'
            }[userStatus] : null;

            return (
              <>
                {/* Current user status highlight */}
                {currentUser && userStatus && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: isDarkMode
                      ? `linear-gradient(135deg, ${getDayColor(userStatus as any)}25 0%, ${getDayColor(userStatus as any)}15 100%)`
                      : `linear-gradient(135deg, ${getDayColor(userStatus as any)}18 0%, ${getDayColor(userStatus as any)}08 100%)`,
                    borderRadius: '2px',
                    border: `1px solid ${getDayColor(userStatus as any)}50`,
                  }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isDarkMode ? colours.dark.subText : colours.light.subText
                    }}>
                      You:
                    </span>
                    <StatusIcon
                      status={userStatus as any}
                      size="10px"
                      color={getDayColor(userStatus as any)}
                    />
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: getDayColor(userStatus as any)
                    }}>
                      {userStatusLabel}
                    </span>
                  </div>
                )}
                
                {/* Divider */}
                {currentUser && (
                  <div style={{
                    width: '1px',
                    height: '20px',
                    background: isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(6,23,51,0.1)'
                  }} />
                )}
                
                {/* Status counts */}
                {summaryItems.map((item, idx) => (
                  <div 
                    key={item.status}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <StatusIcon
                      status={item.status as any}
                      size="10px"
                      color={item.color}
                    />
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: item.color
                    }}>
                      {statusCounts[item.status]}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: isDarkMode ? colours.dark.subText : colours.light.subText
                    }}>
                      {item.label}
                    </span>
                    {idx < summaryItems.length - 1 && (
                      <span style={{
                        margin: '0 4px',
                        color: isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(6,23,51,0.15)'
                      }}>
                        •
                      </span>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Weekly Attendance Grid */}
      <div style={{ marginBottom: '12px' }}>
        {/* Team member grid with multiple columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '8px',
          maxWidth: '100%'
        }}>
          {selectedWeek === 'today' ? (
            /* Today/Monday view: Status-grouped cards for single day */
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {(() => {
                // Group people by status for today
                const statusGroups = filteredData.reduce((groups, member) => {
                  const representativeStatus = getStatusForActiveFilters(member);
                  if (!groups[representativeStatus]) {
                    groups[representativeStatus] = [];
                  }
                  groups[representativeStatus].push(member);
                  return groups;
                }, {} as Record<string, typeof filteredData>);

                // Define status order and labels - Office first, then WFH, then away statuses
                const statusOrder = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];
                const statusLabels = {
                  office: 'In Office',
                  wfh: 'Working From Home',
                  away: 'Away',
                  'off-sick': 'Off Sick',
                  'out-of-office': 'Out Of Office'
                };

                return statusOrder
                  .filter(status => {
                    const hasMembers = statusGroups[status]?.length > 0;
                    const passesFilter = selectedStatuses.length === 0 || selectedStatuses.includes(status as StatusFilterKey);
                    // Show empty groups when dragging to provide drop targets
                    const showForDragging = draggedMember && draggedMember.currentStatus !== status && isEditMode;
                    return (hasMembers && passesFilter) || showForDragging;
                  })
                  .map(status => {
                    // Get subtle tinted background for each status
                    const statusColor = getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office');
                    const tintedBackground = isDarkMode
                      ? `linear-gradient(135deg, ${statusColor}08 0%, rgba(15,23,42,0.70) 100%)`
                      : `linear-gradient(135deg, ${statusColor}06 0%, ${colours.light.cardBackground} 100%)`;
                    
                    // Sort members to put current user first
                    const membersForStatus = statusGroups[status] || [];
                    const sortedMembers = [...membersForStatus].sort((a, b) => {
                      if (a.isUser && !b.isUser) return -1;
                      if (!a.isUser && b.isUser) return 1;
                      return 0;
                    });
                    const isDropTarget = dragOverStatus === status;
                    const isValidDropTarget = isEditMode && draggedMember && draggedMember.currentStatus !== status;
                    
                    // Close expanded member when clicking on the status group background
                    const handleGroupClick = (e: React.MouseEvent) => {
                      if (e.target === e.currentTarget) {
                        setExpandedMember(null);
                      }
                    };
                    
                    return (
                    <div 
                      key={status}
                      onClick={handleGroupClick}
                      onDragOver={(e) => isEditMode && handleDragOver(e, status)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => isEditMode && handleDrop(e, status)}
                      style={{
                        background: isDropTarget && isValidDropTarget
                          ? (isDarkMode 
                              ? `linear-gradient(135deg, ${statusColor}25 0%, rgba(15,23,42,0.85) 100%)`
                              : `linear-gradient(135deg, ${statusColor}20 0%, ${colours.light.cardBackground} 100%)`)
                          : tintedBackground,
                        border: isDropTarget && isValidDropTarget
                          ? `2px dashed ${statusColor}`
                          : `1px solid ${isDarkMode ? `${statusColor}20` : `${statusColor}15`}`,
                        borderRadius: '2px',
                        padding: '16px',
                        minWidth: '280px',
                        flex: '1',
                        boxShadow: isDropTarget && isValidDropTarget
                          ? `0 0 20px ${statusColor}40`
                          : (isDarkMode ? '0 10px 24px rgba(0,0,0,0.35)' : '0 10px 24px rgba(6,23,51,0.10)'),
                        transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease, border 0.2s ease',
                        cursor: 'default',
                        transform: isDropTarget && isValidDropTarget ? 'scale(1.02)' : 'none'
                      }}
                    >
                      {/* Status Header */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: `1px solid ${isDarkMode ? `${statusColor}18` : `${statusColor}12`}`
                      }}>
                        <div 
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '2px',
                            backgroundColor: `${getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')}1c`,
                            border: `1px solid ${getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office')}85`,
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
                            color: isDarkMode ? colours.accent : colours.blue
                          }}>
                            {membersForStatus.length} {membersForStatus.length === 1 ? 'person' : 'people'}
                          </div>
                        </div>
                      </div>

                      {/* People Grid */}
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '6px',
                        minHeight: sortedMembers.length === 0 ? '60px' : 'auto'
                      }}>
                        {sortedMembers.length === 0 && draggedMember && (
                          <div style={{
                            gridColumn: '1 / -1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px',
                            color: isDarkMode ? colours.dark.subText : colours.light.subText,
                            fontSize: '12px',
                            fontStyle: 'italic'
                          }}>
                            Drop here to set status
                          </div>
                        )}
                        {sortedMembers.map((member: any) => {
                          const nextWorkday = getNextWorkdayAttendance(member);
                          const nextWorkdayDifferent = nextWorkday.status !== status && nextWorkday.label !== '';
                          const statusColor = getDayColor(status as 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office');
                          // User can drag themselves OR admin can drag anyone
                          const canDrag = isEditMode;
                          
                          // Get today's day key for pending changes and editing state
                          const today = new Date();
                          const todayIndex = today.getDay();
                          const dayKeys: DayFilterKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
                          const todayDayKey = todayIndex >= 1 && todayIndex <= 5 ? dayKeys[todayIndex - 1] : 'monday';
                          const isEditingThisMember = editingMember === member.Initials && editingDay === todayDayKey;
                          const isExpandedMember = expandedMember === member.Initials;
                          const hasPendingChange = !!pendingChanges[member.Initials]?.[todayDayKey];
                          const isDraggingThisMember = draggedMember?.initials === member.Initials;
                          const memberWeekPattern = getDailyAttendance(member, 0); // Today view always uses current week
                          
                          return (
                            <div 
                              key={member.Initials}
                              draggable={canDrag && !isExpandedMember}
                              onDragStart={(e) => {
                                if (canDrag && !isExpandedMember) {
                                  handleDragStart(e, member.Initials, member.Name || member.First || member.Initials, status);
                                }
                              }}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canDrag && !draggedMember) {
                                  // Toggle week editor on click
                                  if (isExpandedMember) {
                                    setExpandedMember(null);
                                  } else {
                                    setExpandedMember(member.Initials);
                                    setEditingMember(null);
                                    setEditingDay(null);
                                  }
                                }
                              }}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: member.isUser ? '8px 8px 8px 8px' : '8px',
                                borderRadius: '2px',
                                background: member.isUser
                                  ? (isDarkMode ? `${statusColor}18` : `${statusColor}12`)
                                  : (isDarkMode ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)'),
                                border: hasPendingChange
                                  ? `2px dashed ${colours.orange}`
                                  : isExpandedMember
                                    ? `2px solid ${colours.highlight}`
                                    : isEditingThisMember
                                      ? `2px solid ${colours.blue}`
                                      : member.isUser
                                        ? `2px solid ${statusColor}60`
                                        : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(6,23,51,0.06)'}`,
                                gap: '4px',
                                position: 'relative',
                                boxShadow: isExpandedMember
                                  ? `0 4px 16px ${colours.highlight}50`
                                  : isEditingThisMember
                                    ? `0 4px 12px ${colours.blue}40`
                                    : member.isUser
                                      ? (isDarkMode ? `0 2px 8px ${statusColor}25` : `0 2px 8px ${statusColor}20`)
                                      : 'none',
                                cursor: canDrag ? (draggedMember ? 'grabbing' : 'pointer') : 'default',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                                transform: isExpandedMember ? 'scale(1.02)' : isEditingThisMember ? 'scale(1.05)' : 'none',
                                opacity: isDraggingThisMember ? 0.5 : 1,
                                userSelect: 'none'
                              }}
                            >
                              {/* "You" badge for current user */}
                              {member.isUser && (
                                <div style={{
                                  position: 'absolute',
                                  top: '-6px',
                                  right: '-6px',
                                  background: statusColor,
                                  color: '#fff',
                                  fontSize: '8px',
                                  fontWeight: 700,
                                  padding: '2px 5px',
                                  borderRadius: '2px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}>
                                  You
                                </div>
                              )}
                              
                              {/* Edit indicator */}
                              {canDrag && !isEditingThisMember && (
                                <div style={{
                                  position: 'absolute',
                                  top: '-4px',
                                  left: '-4px',
                                  background: isDarkMode ? '#1e293b' : '#fff',
                                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(6,23,51,0.15)'}`,
                                  borderRadius: '50%',
                                  width: '14px',
                                  height: '14px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: 0.7
                                }}>
                                  <Icon iconName="Edit" style={{ fontSize: '8px', color: isDarkMode ? colours.dark.subText : colours.light.subText }} />
                                </div>
                              )}
                              
                              <span style={{
                                fontSize: '13px',
                                fontWeight: member.isUser ? '700' : '400',
                                color: member.isUser ? statusColor : (isDarkMode ? colours.dark.text : colours.light.text),
                                textAlign: 'center'
                              }}>
                                {member.Nickname || member.First || member.Initials}
                              </span>
                              
                              {/* (Temporarily hidden) Tomorrow marker */}
                              
                              {/* Week Editor - shows all days when expanded */}
                              {isExpandedMember && (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginBottom: '6px',
                                    background: isDarkMode ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : '#fff',
                                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(6,23,51,0.12)'}`,
                                    borderRadius: '6px',
                                    boxShadow: isDarkMode ? '0 -8px 32px rgba(0,0,0,0.6)' : '0 -8px 32px rgba(0,0,0,0.18)',
                                    zIndex: 1000,
                                    padding: '10px',
                                    minWidth: '220px'
                                  }}
                                >
                                  {/* Header */}
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '10px',
                                    paddingBottom: '8px',
                                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(6,23,51,0.08)'}`
                                  }}>
                                    <span style={{
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: isDarkMode ? colours.dark.text : colours.light.text
                                    }}>
                                      {member.First || member.Initials}'s Week
                                    </span>
                                    <div
                                      onClick={() => setExpandedMember(null)}
                                      style={{
                                        cursor: 'pointer',
                                        padding: '2px',
                                        borderRadius: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                    >
                                      <Icon iconName="Cancel" style={{ fontSize: '10px', color: isDarkMode ? colours.dark.subText : colours.light.subText }} />
                                    </div>
                                  </div>
                                  
                                  {/* Days Grid */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {DAY_FILTER_OPTIONS.map((dayOption, dayIdx) => {
                                      const dayStatus = memberWeekPattern[dayIdx];
                                      const dayColor = getDayColor(dayStatus);
                                      const isToday = todayIndex >= 1 && todayIndex <= 5 && dayIdx === todayIndex - 1;
                                      
                                      return (
                                        <div 
                                          key={dayOption.key}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '6px 8px',
                                            borderRadius: '4px',
                                            background: isToday 
                                              ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
                                              : 'transparent',
                                            border: isToday 
                                              ? `1px solid ${colours.highlight}40`
                                              : '1px solid transparent'
                                          }}
                                        >
                                          {/* Day label */}
                                          <span style={{
                                            fontSize: '11px',
                                            fontWeight: isToday ? 600 : 400,
                                            color: isToday ? colours.highlight : (isDarkMode ? colours.dark.subText : colours.light.subText),
                                            width: '32px'
                                          }}>
                                            {dayOption.label}
                                            {isToday && <span style={{ fontSize: '8px', marginLeft: '2px' }}>•</span>}
                                          </span>
                                          
                                          {/* Status buttons */}
                                          <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
                                            {STATUS_FILTER_OPTIONS.map(statusOption => {
                                              const isActive = dayStatus === statusOption.key;
                                              const btnColor = getDayColor(statusOption.key as any);
                                              
                                              return (
                                                <div
                                                  key={statusOption.key}
                                                  onClick={() => handleSingleDayChange(member.Initials, dayOption.key, statusOption.key)}
                                                  title={statusOption.label}
                                                  style={{
                                                    width: '26px',
                                                    height: '22px',
                                                    borderRadius: '3px',
                                                    background: isActive 
                                                      ? btnColor 
                                                      : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                                    border: isActive 
                                                      ? `1px solid ${btnColor}` 
                                                      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(6,23,51,0.08)'}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    opacity: isActive ? 1 : 0.6
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    if (!isActive) {
                                                      (e.currentTarget as HTMLElement).style.opacity = '1';
                                                      (e.currentTarget as HTMLElement).style.background = `${btnColor}30`;
                                                    }
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    if (!isActive) {
                                                      (e.currentTarget as HTMLElement).style.opacity = '0.6';
                                                      (e.currentTarget as HTMLElement).style.background = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                                                    }
                                                  }}
                                                >
                                                  <StatusIcon
                                                    status={statusOption.key as any}
                                                    size="10px"
                                                    color={isActive ? '#fff' : btnColor}
                                                  />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                  });
              })()}
            </div>
          ) : (selectedWeek === 'current' || selectedWeek === 'next') ? (
            /* This Week/Next Week view: Compact grid of person cards */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px',
              width: '100%'
            }}>
              {(() => {
                // Show only selected days, or all days if none selected
                const daysToRender = orderedSelectedDays.length > 0 ? orderedSelectedDays : DAY_ORDER;
                return filteredData
                  .sort((a, b) => {
                    if (a.isUser && !b.isUser) return -1;
                    if (!a.isUser && b.isUser) return 1;
                    return (a.First || a.Initials).localeCompare(b.First || b.Initials);
                  })
                  .map(member => {
                    // Use appropriate week offset based on selected week
                    const weekOffset = selectedWeek === 'next' ? 1 : 0;
                    const weekAttendance = getDailyAttendance(member, weekOffset);
                    
                    return (
                      <div 
                        key={member.Initials}
                        style={{
                          background: isDarkMode
                            ? 'linear-gradient(135deg, rgba(2,6,23,0.62) 0%, rgba(15,23,42,0.68) 100%)'
                            : colours.light.cardBackground,
                          border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.16)' : 'rgba(6,23,51,0.08)'}`,
                          borderRadius: '2px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: isDarkMode ? '0 8px 18px rgba(0,0,0,0.30)' : '0 8px 18px rgba(6,23,51,0.08)'
                        }}
                      >
                        <div style={{
                          fontWeight: member.isUser ? '700' : '500',
                          color: member.isUser ? colours.blue : (isDarkMode ? colours.dark.text : colours.light.text),
                          fontSize: '13px',
                          marginBottom: '4px'
                        }}>
                          {member.Nickname || member.First || member.Initials}
                        </div>
                        
                        <div style={{ 
                          display: 'flex', 
                          gap: '4px',
                          flexWrap: 'wrap',
                          justifyContent: 'flex-start'
                        }}>
                          {daysToRender.map(dayKey => {
                            const index = DAY_INDEX_MAP[dayKey];
                            const dayStatusRaw = weekAttendance[index];
                            // Check for pending change first
                            const pendingStatus = pendingChanges[member.Initials]?.[dayKey];
                            const dayStatus = (pendingStatus || dayStatusRaw || 'wfh') as StatusFilterKey;
                            const label = dayKey.charAt(0).toUpperCase() + dayKey.slice(1, 3);
                            const canEdit = isEditMode && canEditMember(member.Initials);
                            const isEditing = editingMember === member.Initials && editingDay === dayKey;
                            const hasPendingChange = !!pendingStatus;

                            return (
                              <div
                                key={dayKey}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '3px',
                                  position: 'relative'
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    color: isDarkMode ? colours.dark.subText : colours.light.subText
                                  }}
                                >
                                  {label}
                                </div>
                                <div
                                  onClick={() => {
                                    if (canEdit) {
                                      if (isEditing) {
                                        setEditingMember(null);
                                        setEditingDay(null);
                                      } else {
                                        setEditingMember(member.Initials);
                                        setEditingDay(dayKey);
                                      }
                                    }
                                  }}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '2px',
                                    backgroundColor: `${getDayColor(dayStatus)}1c`,
                                    border: hasPendingChange
                                      ? `2px dashed ${colours.orange}`
                                      : isEditing
                                        ? `2px solid ${colours.blue}`
                                        : `1px solid ${getDayColor(dayStatus)}85`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: canEdit ? 'pointer' : 'default',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    transform: isEditing ? 'scale(1.1)' : 'none',
                                    boxShadow: isEditing ? `0 2px 8px ${colours.blue}40` : 'none'
                                  }}
                                  title={canEdit ? `Click to change ${label}: ${dayStatus}` : `${label}: ${dayStatus}`}
                                >
                                  <StatusIcon
                                    status={dayStatus}
                                    size="16px"
                                    color={getDayColor(dayStatus)}
                                  />
                                </div>
                                
                                {/* Status Picker Dropdown */}
                                {isEditing && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginTop: '4px',
                                    background: isDarkMode ? '#1e293b' : '#fff',
                                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(6,23,51,0.12)'}`,
                                    borderRadius: '4px',
                                    boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    minWidth: '100px',
                                    overflow: 'hidden'
                                  }}>
                                    {STATUS_FILTER_OPTIONS.map(option => (
                                      <div
                                        key={option.key}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(member.Initials, dayKey, option.key);
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '8px 12px',
                                          cursor: 'pointer',
                                          background: option.key === dayStatus
                                            ? (isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(6,23,51,0.08)')
                                            : 'transparent',
                                          transition: 'background 0.15s ease',
                                          borderBottom: option.key !== 'out-of-office' ? `1px solid ${isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(6,23,51,0.05)'}` : 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (option.key !== dayStatus) {
                                            (e.target as HTMLElement).style.background = isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(6,23,51,0.05)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (option.key !== dayStatus) {
                                            (e.target as HTMLElement).style.background = 'transparent';
                                          }
                                        }}
                                      >
                                        <div style={{
                                          width: '18px',
                                          height: '18px',
                                          borderRadius: '2px',
                                          backgroundColor: `${getDayColor(option.key as StatusFilterKey)}25`,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}>
                                          <StatusIcon
                                            status={option.key as StatusFilterKey}
                                            size="10px"
                                            color={getDayColor(option.key as StatusFilterKey)}
                                          />
                                        </div>
                                        <span style={{
                                          fontSize: '11px',
                                          fontWeight: option.key === dayStatus ? 600 : 400,
                                          color: isDarkMode ? colours.dark.text : colours.light.text
                                        }}>
                                          {option.label}
                                        </span>
                                        {option.key === dayStatus && (
                                          <Icon iconName="CheckMark" style={{ fontSize: '10px', marginLeft: 'auto', color: colours.green }} />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>
          ) : null}
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: isDarkMode ? colours.dark.subText : colours.light.subText
        }}>
          <Icon iconName="Search" style={{ fontSize: '24px', marginBottom: '8px' }} />
          <Text>No team members match the selected filters</Text>
        </div>
      ) : null}
    </div>
  );
};

export default WeeklyAttendanceView;