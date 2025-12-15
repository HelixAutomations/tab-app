import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { CSSProperties } from 'react';
import { DefaultButton, Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import helixLogo from '../../assets/dark blue mark.svg';
import { FaUmbrellaBeach } from 'react-icons/fa';

interface StatusConfig {
    readonly icon: 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office';
    readonly color: string;
    readonly label: string;
    readonly bgColor: string;
    readonly darkBg: string;
}

const getPanelContainerStyle = (isDarkMode: boolean): CSSProperties => ({
    background: isDarkMode
        ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    borderRadius: '16px',
    padding: '24px',
        boxShadow: isDarkMode
            ? '0 20px 44px rgba(2, 6, 17, 0.72)'
            : '0 16px 40px rgba(13, 47, 96, 0.18)',
        border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.26)' : 'rgba(148, 163, 184, 0.16)'}`,
    width: '100%',
    maxWidth: '920px',
    margin: '0 auto',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
});

const getWeekCardStyle = (isDarkMode: boolean): CSSProperties => ({
    background: isDarkMode
        ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 55%, rgba(10, 39, 72, 0.8) 100%)'
        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: isDarkMode
        ? '0 18px 32px rgba(2, 6, 17, 0.58)'
        : '0 12px 28px rgba(13, 47, 96, 0.12)',
    backdropFilter: 'blur(12px)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
});

const getQuickSelectButtonStyle = (isDarkMode: boolean, accent: string): CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '6px',
    border: `1px solid ${accent}`,
    background: isDarkMode
        ? `linear-gradient(135deg, ${accent}40 0%, rgba(8, 23, 42, 0.75) 100%)`
        : `linear-gradient(135deg, #FFFFFF 0%, ${accent}1f 100%)`,
    color: isDarkMode ? '#E9F5FF' : accent,
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    boxShadow: isDarkMode
        ? '0 6px 16px rgba(0, 0, 0, 0.35)'
        : '0 6px 16px rgba(13, 47, 96, 0.12)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
});

// Custom icon component to handle both FluentUI icons and custom images
const StatusIcon: React.FC<{ 
  status: 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office';
  size: string;
  color: string;
}> = ({ status, size, color }) => {
  if (status === 'office') {
    return (
      <img 
        src={helixLogo} 
        alt="Helix Office" 
        style={{ 
          width: size, 
          height: size,
          objectFit: 'contain',
          filter: `brightness(0) saturate(100%) invert(17%) sepia(41%) saturate(1344%) hue-rotate(195deg) brightness(95%) contrast(91%)` // Convert to missed blue #0d2f60
        }} 
      />
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
}

interface AnnualLeaveRecord {
    person: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: string;
    id: string;
    rejection_notes?: string;
    approvers?: string[];
}

interface PersonalAttendanceConfirmProps {
    isDarkMode: boolean;
    attendanceRecords: AttendanceRecord[];
    annualLeaveRecords: AnnualLeaveRecord[];
    futureLeaveRecords: AnnualLeaveRecord[];
    userData: any;
    onSave: (weekStart: string, days: string) => Promise<void>;
    onClose: () => void;
}

const PersonalAttendanceConfirm = forwardRef<
    { setWeek: (week: 'current' | 'next') => void; focusTable: () => void },
    PersonalAttendanceConfirmProps
>(({
    isDarkMode,
    attendanceRecords,
    annualLeaveRecords,
    futureLeaveRecords,
    userData,
    onSave,
    onClose,
}, ref) => {
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const getMondayOfCurrentWeek = (): Date => {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        return monday;
    };

    const formatDateLocal = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const currentWeekStart = formatDateLocal(getMondayOfCurrentWeek());
    const nextWeekMonday = new Date(getMondayOfCurrentWeek());
    nextWeekMonday.setDate(nextWeekMonday.getDate() + 7);
    const nextWeekStart = formatDateLocal(nextWeekMonday);

    const userInitials = (userData?.[0]?.Initials || '').toString().toUpperCase() || 
                        (userData?.displayName?.match(/\b\w/g)?.join('') || '').toUpperCase() || 
                        (userData?.mail?.substring(0, 2) || '').toUpperCase();

    const combinedLeaveRecords = useMemo(() => [...annualLeaveRecords, ...futureLeaveRecords], [annualLeaveRecords, futureLeaveRecords]);

    const initialState: Record<string, Record<string, string>> = useMemo(() => {
        const state: Record<string, Record<string, string>> = {
            [currentWeekStart]: {},
            [nextWeekStart]: {},
        };
        const dayMap: Record<string, string> = {
            Mon: 'Monday',
            Tue: 'Tuesday',
            Wed: 'Wednesday',
            Thu: 'Thursday',
            Fri: 'Friday',
        };
        const filteredRecords = attendanceRecords.filter((r) => r.Initials === userInitials);
        filteredRecords.forEach((rec) => {
            if (!rec.Attendance_Days) return;

            const normalized = rec.Attendance_Days.toString().trim().toLowerCase();
            const isSingleStatus = ['office','wfh','away','off-sick','out-of-office'].includes(normalized);

            if (isSingleStatus) {
                // Apply a single status to all weekdays for this week
                weekDays.forEach((day) => {
                    state[rec.Week_Start][day] = normalized;
                });
                return;
            }

            // Parse the attendance string - format: "Mon:office,Tue:home,Wed:out-of-office" or legacy "Mon,Tue"
            const dayStatuses = rec.Attendance_Days.split(',').map(d => d.trim());
            dayStatuses.forEach(dayStatus => {
                const [dayAbbr, status] = dayStatus.includes(':') ? dayStatus.split(':') : [dayStatus, 'office'];
                const dayName = dayMap[dayAbbr] || dayAbbr;
                if (weekDays.includes(dayName)) {
                    state[rec.Week_Start][dayName] = (status || 'wfh').toLowerCase();
                }
            });
        });
        
        // Ensure both weeks have default values for all weekdays if no data exists
        [currentWeekStart, nextWeekStart].forEach(weekStart => {
            weekDays.forEach(day => {
                if (!state[weekStart][day]) {
                    state[weekStart][day] = 'wfh'; // Default to WFH if no data
                }
            });
        });
        
        return state;
    }, [attendanceRecords, userInitials, currentWeekStart, nextWeekStart]);

    const [localAttendance, setLocalAttendance] = useState<Record<string, Record<string, string>>>(initialState);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useImperativeHandle(ref, () => ({
        setWeek: () => { },
        focusTable: () => { },
    }));

    // Define the 5 statuses and their cycle order
    const statuses = ['wfh', 'office', 'away', 'off-sick', 'out-of-office'];
    
    // Status display configuration
    const getStatusConfig = (status: string): StatusConfig => {
        switch (status) {
            case 'office':
                return { 
                    icon: 'office', 
                    color: colours.missedBlue, 
                    label: 'In Office',
                    bgColor: `${colours.missedBlue}20`,
                    darkBg: 'linear-gradient(135deg, rgba(13, 47, 96, 0.55) 0%, rgba(9, 25, 49, 0.68) 100%)'
                };
            case 'wfh':
                return { 
                    icon: 'wfh', 
                    color: colours.green, 
                    label: 'WFH',
                    bgColor: `${colours.green}20`,
                    darkBg: 'linear-gradient(135deg, rgba(32, 178, 108, 0.32) 0%, rgba(15, 63, 63, 0.55) 100%)'
                };
            case 'away':
                return { 
                    icon: 'away', 
                    color: colours.subtleGrey, 
                    label: 'Away',
                    bgColor: `${colours.subtleGrey}20`,
                    darkBg: 'linear-gradient(135deg, rgba(107, 114, 128, 0.38) 0%, rgba(55, 65, 81, 0.48) 100%)'
                };
            case 'off-sick':
                return { 
                    icon: 'off-sick', 
                    color: colours.cta, 
                    label: 'Off Sick',
                    bgColor: `${colours.cta}20`,
                    darkBg: 'linear-gradient(135deg, rgba(214, 85, 65, 0.3) 0%, rgba(127, 29, 29, 0.45) 100%)'
                };
            case 'out-of-office':
                return { 
                    icon: 'out-of-office', 
                    color: colours.orange, 
                    label: 'Out-Of-Office',
                    bgColor: `${colours.orange}20`,
                    darkBg: 'linear-gradient(135deg, rgba(255, 140, 0, 0.28) 0%, rgba(146, 64, 14, 0.45) 100%)'
                };
            default:
                return { 
                    icon: 'wfh', 
                    color: colours.green, 
                    label: 'WFH',
                    bgColor: `${colours.green}20`,
                    darkBg: 'linear-gradient(135deg, rgba(32, 178, 108, 0.32) 0%, rgba(15, 63, 63, 0.55) 100%)'
                };
        }
    };
    
    const toggleDay = (weekStart: string, day: string) => {
        setLocalAttendance((prev) => {
            const currentStatus = prev[weekStart]?.[day] || 'wfh';
            const currentIndex = statuses.indexOf(currentStatus);
            const nextIndex = (currentIndex + 1) % statuses.length;
            const nextStatus = statuses[nextIndex];
            
            const newState = {
                ...prev,
                [weekStart]: {
                    ...prev[weekStart],
                    [day]: nextStatus
                }
            };
            return newState;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            for (const weekStart of [currentWeekStart, nextWeekStart]) {
                const dayStatuses = localAttendance[weekStart] || {};
                const dayStrings = Object.entries(dayStatuses).map(([dayName, status]) => {
                    const dayMap: Record<string, string> = {
                        Monday: 'Mon',
                        Tuesday: 'Tue',
                        Wednesday: 'Wed',
                        Thursday: 'Thu',
                        Friday: 'Fri',
                    };
                    const dayAbbr = dayMap[dayName] || dayName;
                    return `${dayAbbr}:${status}`;
                });
                const days = dayStrings.join(',');
                await onSave(weekStart, days);
            }
            setSaveSuccess(true);
            // Show brief success feedback before closing
            setTimeout(() => {
                onClose();
            }, 700);
        } catch (error) {
            console.error('[PersonalAttendanceConfirm] Error saving attendance:', error);
            const message = error instanceof Error ? error.message : 'Failed to save attendance';
            setSaveError(message);
        } finally {
            setSaving(false);
        }
    };

    const isOnLeave = (weekStart: string, dayIndex: number): boolean => {
        const weekStartDate = new Date(weekStart + 'T00:00:00');
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + dayIndex);
        const iso = formatDateLocal(date);

        return combinedLeaveRecords.some(
            (leave) =>
                leave.status === 'booked' &&
                leave.person.trim().toLowerCase() === userInitials.toLowerCase() &&
                iso >= leave.start_date &&
                iso <= leave.end_date
        );
    };

    const getWeekDateRange = (weekStart: string): string => {
        const start = new Date(weekStart + 'T00:00:00');
        const end = new Date(start);
        end.setDate(start.getDate() + 4); // Friday
        
        const formatDate = (date: Date) => date.toLocaleDateString('en-GB', { 
            day: 'numeric', 
            month: 'short' 
        });
        
        return `${formatDate(start)} - ${formatDate(end)}`;
    };

    const renderWeek = (label: string, weekStart: string) => {
        return (
            <div key={weekStart} style={getWeekCardStyle(isDarkMode)}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '12px',
                    paddingBottom: '12px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)'}`
                }}>
                    <h3 style={{
                        margin: 0,
                        color: isDarkMode ? '#FFFFFF' : colours.light.text,
                        fontSize: '16px',
                        fontWeight: 600,
                        letterSpacing: '0.01em'
                    }}>
                        {label}
                    </h3>
                    <span style={{
                        fontSize: '12px',
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : colours.greyText
                    }}>
                        {getWeekDateRange(weekStart)}
                    </span>
                </div>

                {(saveError || saveSuccess) && (
                    <div style={{
                        marginBottom: '12px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${saveError ? colours.cta : colours.green}`,
                        background: saveError
                            ? (isDarkMode
                                ? 'linear-gradient(135deg, rgba(214, 85, 65, 0.22) 0%, rgba(127, 29, 29, 0.45) 100%)'
                                : `${colours.cta}10`)
                            : (isDarkMode
                                ? 'linear-gradient(135deg, rgba(32, 178, 108, 0.24) 0%, rgba(17, 99, 67, 0.4) 100%)'
                                : `${colours.green}10`),
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        boxShadow: isDarkMode
                            ? '0 6px 16px rgba(8, 23, 44, 0.35)'
                            : '0 6px 16px rgba(13, 47, 96, 0.1)'
                    }}>
                        {saveError ? 'Could not save attendance. Please try again.' : 'Attendance saved.'}
                    </div>
                )}

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    gap: '12px'
                }}>
                    {weekDays.map((day, dayIndex) => {
                        const currentStatus = localAttendance[weekStart]?.[day] || 'home';
                        const onLeave = isOnLeave(weekStart, dayIndex);
                        const statusConfig = getStatusConfig(currentStatus);
                        
                        return (
                            <div
                                key={day}
                                onClick={onLeave ? undefined : () => toggleDay(weekStart, day)}
                                style={{
                                    padding: '16px 10px',
                                    borderRadius: '10px',
                                    border: `2px solid ${
                                        onLeave
                                            ? 'rgba(148, 163, 184, 0.45)'
                                            : statusConfig.color
                                    }`,
                                    background: onLeave
                                        ? (isDarkMode
                                            ? 'linear-gradient(135deg, rgba(107, 114, 128, 0.24) 0%, rgba(55, 65, 81, 0.42) 100%)'
                                            : `${colours.greyText}20`)
                                        : (isDarkMode ? statusConfig.darkBg : statusConfig.bgColor),
                                    cursor: onLeave ? 'not-allowed' : 'pointer',
                                    textAlign: 'center',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                    opacity: onLeave ? 0.6 : 1,
                                    boxShadow: isDarkMode
                                        ? '0 8px 18px rgba(8, 23, 44, 0.35)'
                                        : '0 8px 18px rgba(13, 47, 96, 0.1)'
                                }}
                            >
                                <div style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: isDarkMode ? '#E9F5FF' : colours.light.text,
                                    marginBottom: '10px',
                                    letterSpacing: '0.05em'
                                }}>
                                    {day.substring(0, 3).toUpperCase()}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '26px'
                                }}>
                                    {onLeave ? (
                                        <Icon 
                                            iconName="Airplane" 
                                            style={{ 
                                                color: isDarkMode ? '#CBD5F5' : colours.greyText,
                                                fontSize: '18px'
                                            }} 
                                        />
                                    ) : (
                                        <StatusIcon
                                            status={currentStatus as 'wfh' | 'office' | 'away' | 'off-sick' | 'out-of-office'}
                                            size="18px"
                                            color={statusConfig.color}
                                        />
                                    )}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.light.subText,
                                    marginTop: '6px'
                                }}>
                                    {onLeave ? 'Away' : statusConfig.label}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '14px',
                    flexWrap: 'wrap'
                }}>
                    <button
                        type="button"
                        onClick={() => setLocalAttendance(prev => ({ 
                            ...prev, 
                            [weekStart]: weekDays.reduce((acc, day) => ({ ...acc, [day]: 'wfh' }), {})
                        }))}
                        style={getQuickSelectButtonStyle(isDarkMode, colours.green)}
                    >
                        All WFH
                    </button>
                    <button
                        type="button"
                        onClick={() => setLocalAttendance(prev => ({ 
                            ...prev, 
                            [weekStart]: weekDays.reduce((acc, day) => ({ ...acc, [day]: 'office' }), {})
                        }))}
                        style={getQuickSelectButtonStyle(isDarkMode, colours.missedBlue)}
                    >
                        All Office
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div style={getPanelContainerStyle(isDarkMode)}>
            <div style={{
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
            }}>
                <h2 style={{
                    margin: 0,
                    color: isDarkMode ? '#FFFFFF' : colours.light.text,
                    fontSize: '19px',
                    fontWeight: 600,
                    letterSpacing: '0.01em'
                }}>
                    Confirm Your Attendance
                </h2>
                <p style={{
                    margin: 0,
                    fontSize: '12px',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : colours.greyText
                }}>
                    Tap each day to cycle through Office, WFH, Away, Sick or OOO. We auto mark booked leave.
                </p>
            </div>

            {renderWeek('This Week', currentWeekStart)}
            {renderWeek('Next Week', nextWeekStart)}

            <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'flex-end',
                marginTop: '12px',
                paddingTop: '18px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.24)' : 'rgba(148, 163, 184, 0.24)'}`
            }}>
                <DefaultButton 
                    text="Cancel" 
                    onClick={onClose}
                    styles={{
                        root: {
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.45)' : colours.greyText}`,
                            backgroundColor: isDarkMode ? 'rgba(15, 35, 61, 0.6)' : 'transparent',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            transition: 'transform 0.15s ease, background-color 0.15s ease',
                        },
                        rootHovered: {
                            backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(54, 144, 206, 0.12)',
                            borderColor: colours.highlight,
                            color: colours.highlight,
                        }
                    }}
                />
                <DefaultButton 
                    text={saving ? 'Saving...' : 'Save Attendance'} 
                    onClick={handleSave} 
                    disabled={saving}
                    primary
                    styles={{
                        root: {
                            background: 'linear-gradient(135deg, #0d2f60 0%, #174a92 100%)',
                            border: '1px solid #174a92',
                            color: '#ffffff',
                            boxShadow: isDarkMode
                                ? '0 10px 28px rgba(8, 23, 44, 0.5)'
                                : '0 10px 24px rgba(13, 47, 96, 0.28)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        },
                        rootHovered: {
                            background: 'linear-gradient(135deg, #174a92 0%, #1c5fb8 100%)',
                            borderColor: '#1c5fb8',
                        },
                        rootPressed: {
                            background: 'linear-gradient(135deg, #123a78 0%, #174a92 100%)',
                            borderColor: '#123a78',
                        },
                        rootDisabled: {
                            backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                            borderColor: 'transparent',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(55, 65, 81, 0.5)',
                        }
                    }}
                />
            </div>
        </div>
    );
});

export default PersonalAttendanceConfirm;