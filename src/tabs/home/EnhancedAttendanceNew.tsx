import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { Icon, Text, DefaultButton, MessageBar, MessageBarType } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import WeeklyAttendanceView from './WeeklyAttendanceView';
import BespokePanel from '../../app/functionality/BespokePanel';

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
}

interface EnhancedAttendanceProps {
  isDarkMode: boolean;
  isLoadingAttendance: boolean;
  isLoadingAnnualLeave: boolean;
  attendanceError: string | null;
  annualLeaveError: string | null;
  attendanceRecords: AttendanceRecord[];
  teamData: any[];
  annualLeaveRecords: any[];
  futureLeaveRecords: any[];
  userData: any;
  onAttendanceUpdated?: (updatedRecords: AttendanceRecord[]) => void;
  currentUserConfirmed?: boolean;
  onConfirmAttendance?: () => void;
}

export interface EnhancedAttendanceRef {
  focusTable: () => void;
  setWeek: (week: 'current' | 'next') => void;
}

const EnhancedAttendance = forwardRef<EnhancedAttendanceRef, EnhancedAttendanceProps>((props, ref) => {
  const {
    isDarkMode,
    isLoadingAttendance,
    isLoadingAnnualLeave,
    attendanceError,
    annualLeaveError,
    attendanceRecords,
    teamData,
    annualLeaveRecords,
    futureLeaveRecords,
    userData,
    onAttendanceUpdated,
    currentUserConfirmed,
    onConfirmAttendance,
  } = props;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'next'>('current');
  const [localAttendance, setLocalAttendance] = useState<{ [key: string]: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const userInitials = userData?.displayName?.match(/\b\w/g)?.join('').toUpperCase() || 
                      userData?.mail?.substring(0, 2).toUpperCase() || 'UN';

  // Quick update function for status changes
  const quickUpdate = async (status: 'home' | 'office' | 'out-of-office') => {
    try {
      // Use Monday as start of week (consistent with Home.tsx and server)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStartStr = monday.toISOString().split('T')[0];

      const response = await fetch('/api/attendance/updateAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          weekStart: weekStartStr,
          attendanceDays: status
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update attendance');
      }

      // Show confirmation
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 2000);

      // Refresh data by fetching updated attendance records
      if (onAttendanceUpdated) {
        try {
          const attendanceResponse = await fetch('/api/attendance/getAttendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (attendanceResponse.ok) {
            const attendanceResult = await attendanceResponse.json();
            if (attendanceResult.success && attendanceResult.attendance) {
              // Transform API response to AttendanceRecord shape expected by Home.handleAttendanceUpdated
              const transformedRecords = attendanceResult.attendance.map((member: any) => ({
                Attendance_ID: 0,
                Entry_ID: 0,
                First_Name: member.First,
                Initials: member.Initials,
                Level: member.Level || '',
                Week_Start: member.Week_Start,
                Week_End: member.Week_End,
                ISO_Week: typeof member.iso === 'number' ? member.iso : 0,
                Attendance_Days: member.Status || '',
                Confirmed_At: member.Confirmed_At ?? null,
                status: member.Status,
                isConfirmed: Boolean(member.Confirmed_At),
                isOnLeave: member.IsOnLeave
              }));
              onAttendanceUpdated(transformedRecords);
            }
          }
        } catch (refreshError) {
          console.error('Error refreshing attendance data:', refreshError);
          // Fallback: still call with empty array if refresh fails
          onAttendanceUpdated([]);
        }
      }
    } catch (error) {
      console.error('Error updating attendance:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to update attendance');
    }
  };

  // Modal functions
  const openModal = () => {
    setIsModalOpen(true);
    // Initialize local attendance state
    setLocalAttendance({
      Monday: false,
      Tuesday: false,
      Wednesday: false,
      Thursday: false,
      Friday: false,
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSaveError(null);
  };

  const toggleDay = (day: string) => {
    setLocalAttendance(prev => ({
      ...prev,
      [day]: !prev[day]
    }));
  };

  const handleDayUpdate = async (initials: string, day: string, status: 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office', week: 'current' | 'next') => {
    if (initials !== userInitials) return; // Only allow user to edit their own attendance
    
    try {
      const weekStart = getWeekStart(week);
      const response = await fetch('/api/attendance/updateAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials,
          weekStart,
          day: day.toLowerCase(),
          status
        })
      });

      if (!response.ok) throw new Error('Failed to update attendance');
      
      // Trigger data refresh
      onAttendanceUpdated?.([]);
      
      // Show brief confirmation
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 2000);
      
    } catch (error) {
      console.error('Error updating attendance:', error);
      // Could add error state/toast here
    }
  };

  const getMondayOfCurrentWeek = (): Date => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return monday;
  };

  const getWeekStart = (week: 'current' | 'next'): string => {
    const monday = getMondayOfCurrentWeek();
    if (week === 'next') {
      monday.setDate(monday.getDate() + 7);
    }
    return monday.toISOString().split('T')[0];
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const weekStartStr = getWeekStart(selectedWeek);
      
      // For weekly updates, we'll send the week's attendance pattern
      // Convert selected days to attendance pattern
      const attendancePattern = Object.keys(localAttendance).filter(day => localAttendance[day]).join(',') || 'office';

      await fetch('/api/attendance/updateAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          weekStart: weekStartStr,
          attendanceDays: attendancePattern
        }),
      });

      // Refresh attendance data
      if (onAttendanceUpdated) {
        try {
          const attendanceResponse = await fetch('/api/attendance/getAttendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (attendanceResponse.ok) {
            const attendanceResult = await attendanceResponse.json();
            if (attendanceResult.success && attendanceResult.attendance) {
              // Transform API response to AttendanceRecord shape expected by Home.handleAttendanceUpdated
              const transformedRecords = attendanceResult.attendance.map((member: any) => ({
                Attendance_ID: 0,
                Entry_ID: 0,
                First_Name: member.First,
                Initials: member.Initials,
                Level: member.Level || '',
                Week_Start: member.Week_Start,
                Week_End: member.Week_End,
                ISO_Week: typeof member.iso === 'number' ? member.iso : 0,
                Attendance_Days: member.Status || '',
                Confirmed_At: member.Confirmed_At ?? null,
                status: member.Status,
                isConfirmed: Boolean(member.Confirmed_At),
                isOnLeave: member.IsOnLeave
              }));
              onAttendanceUpdated(transformedRecords);
            }
          }
        } catch (refreshError) {
          console.error('Error refreshing attendance data:', refreshError);
          // Fallback: still call with empty array if refresh fails
          onAttendanceUpdated([]);
        }
      }

      closeModal();
    } catch (error) {
      console.error('Error saving attendance:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    focusTable: openModal,
    setWeek: (week: 'current' | 'next') => {
      setSelectedWeek(week);
      openModal();
    },
  }));

  // Styles
  const containerStyle = (isDark: boolean) => mergeStyles({
    padding: '16px',
    background: isDark ? colours.dark.background : colours.light.background,
    color: isDark ? colours.dark.text : colours.light.text,
    borderRadius: '2px',
  });

  const modalContentStyle = mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '8px',
  });

  const weekSelectorStyle = (isDark: boolean) => mergeStyles({
    display: 'flex',
    gap: '0px',
    border: `1px solid ${isDark ? 'rgba(125, 211, 252, 0.24)' : colours.light.border}`,
    borderRadius: '4px',
    overflow: 'hidden',
  });

  const weekOptionStyle = (isDark: boolean, selected: boolean) => mergeStyles({
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    fontSize: '13px',
    fontWeight: '500',
    background: selected ? colours.blue : (isDark ? colours.dark.cardBackground : colours.light.cardBackground),
    color: selected ? '#fff' : (isDark ? colours.dark.text : colours.light.text),
    border: 'none',
    borderRight: selected ? 'none' : `1px solid ${isDark ? 'rgba(125, 211, 252, 0.24)' : colours.light.border}`,

    '&:last-child': {
      borderRight: 'none',
    },

    '&:hover': {
      background: selected ? colours.blue : (isDark ? colours.dark.sectionBackground : colours.light.sectionBackground),
    }
  });

  const dayGridStyle = mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px',
  });

  const dayCardStyle = (isDark: boolean, selected: boolean, isWeekend: boolean) => mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
    border: `2px solid ${selected ? colours.blue : (isDark ? 'rgba(125, 211, 252, 0.24)' : colours.light.border)}`,
    borderRadius: '8px',
    cursor: isWeekend ? 'not-allowed' : 'pointer',
    background: selected 
      ? colours.blue + '20' 
      : (isDark ? colours.dark.cardBackground : colours.light.cardBackground),
    transition: 'all 0.2s ease',
    opacity: isWeekend ? 0.5 : 1,

    '&:hover': {
      ...(isWeekend ? {} : {
        background: selected 
          ? colours.blue + '30' 
          : (isDark ? colours.dark.sectionBackground : colours.light.sectionBackground),
        transform: 'translateY(-1px)',
        boxShadow: isDark 
          ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
          : '0 2px 8px rgba(0, 0, 0, 0.1)',
      })
    }
  });

  const dayLabelStyle = (isDark: boolean) => mergeStyles({
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '4px',
    color: isDark ? colours.dark.text : colours.light.text,
  });

  const dayIconStyle = (selected: boolean) => mergeStyles({
    fontSize: '16px',
    color: selected ? colours.blue : colours.grey,
  });

  // Error state
  if (attendanceError || annualLeaveError) {
    return (
      <div className={containerStyle(isDarkMode)}>
        <MessageBar messageBarType={MessageBarType.error}>
          {attendanceError || annualLeaveError}
        </MessageBar>
      </div>
    );
  }

  // Loading state - show skeleton with spinner overlay
  const isLoading = isLoadingAttendance || isLoadingAnnualLeave;

  return (
    <div style={{ position: 'relative' }}>
      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: isDarkMode 
              ? 'rgba(15, 23, 42, 0.85)' 
              : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(2px)',
            borderRadius: '2px',
            zIndex: 10,
            transition: 'opacity 0.3s ease',
          }}
        >
          <Icon
            iconName="Sync"
            style={{
              fontSize: '18px',
              color: colours.blue,
              animation: 'spin 1s linear infinite',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
            }}
          >
            Loading...
          </span>
        </div>
      )}
      
      <div style={{ 
        opacity: isLoading ? 0.4 : 1, 
        transition: 'opacity 0.3s ease',
        pointerEvents: isLoading ? 'none' : 'auto'
      }}>
        <WeeklyAttendanceView
          isDarkMode={isDarkMode}
          attendanceRecords={attendanceRecords}
          teamData={teamData}
          userData={userData}
          annualLeaveRecords={annualLeaveRecords}
          futureLeaveRecords={futureLeaveRecords}
          onAttendanceUpdated={onAttendanceUpdated}
          onDayUpdate={handleDayUpdate}
          currentUserConfirmed={currentUserConfirmed}
          onConfirmAttendance={onConfirmAttendance}
        />
      </div>

      {/* Confirmation feedback */}
      {showConfirmation && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: colours.green,
          color: 'white',
          padding: '12px 20px',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: '500'
        }}>
          ✓ Attendance updated successfully
        </div>
      )}

      {/* Enhanced Modal */}
      <BespokePanel
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Confirm Your Attendance"
        width="500px"
      >
        <div className={modalContentStyle}>
          {saveError && (
            <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setSaveError(null)}>
              {saveError}
            </MessageBar>
          )}

          {/* Week Selector */}
          <div>
            <Text style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
              Select Week
            </Text>
            <div className={weekSelectorStyle(isDarkMode)}>
              <div 
                className={weekOptionStyle(isDarkMode, selectedWeek === 'current')}
                onClick={() => setSelectedWeek('current')}
              >
                This Week
              </div>
              <div 
                className={weekOptionStyle(isDarkMode, selectedWeek === 'next')}
                onClick={() => setSelectedWeek('next')}
              >
                Next Week
              </div>
            </div>
          </div>

          {/* Day Selection */}
          <div style={{ marginBottom: '16px' }}>
            <Text style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
              Days in Office
            </Text>
            <div className={dayGridStyle}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => {
                const isSelected = localAttendance[day] || false;
                const isWeekend = false; // Monday-Friday are not weekends
                
                return (
                  <div 
                    key={day}
                    className={dayCardStyle(isDarkMode, isSelected, isWeekend)}
                    onClick={() => toggleDay(day)}
                  >
                    <Text className={dayLabelStyle(isDarkMode)}>{day.slice(0, 3)}</Text>
                    <Icon 
                      iconName={isSelected ? 'CityNext' : 'Home'} 
                      className={dayIconStyle(isSelected)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <DefaultButton 
              text="Cancel" 
              onClick={closeModal}
              disabled={isSaving}
            />
            <DefaultButton 
              text={isSaving ? "Saving..." : "Confirm Attendance"}
              primary
              onClick={handleSave}
              disabled={isSaving}
              styles={{
                root: {
                  background: colours.blue,
                  borderColor: colours.blue,
                },
                rootHovered: {
                  background: colours.blue + 'CC',
                  borderColor: colours.blue + 'CC',
                },
                rootDisabled: {
                  background: colours.grey,
                  color: '#fff',
                  borderColor: colours.grey,
                },
              }}
            />
          </div>
        </div>
      </BespokePanel>
    </div>
  );
});

export default EnhancedAttendance;