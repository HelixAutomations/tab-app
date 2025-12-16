import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { CSSProperties } from 'react';
import { Icon, PrimaryButton, DefaultButton, Dropdown, IDropdownOption } from '@fluentui/react';
import { colours } from '../../app/styles/colours';

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
    onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning', details?: string) => void;
}

type StatusType = 'office' | 'wfh' | 'away' | 'sick' | 'ooo';

const STATUS_CONFIG: Record<StatusType, { label: string; shortLabel: string; color: string; icon: string }> = {
    office: { label: 'In Office', shortLabel: 'Office', color: colours.missedBlue, icon: 'CityNext' },
    wfh: { label: 'Work From Home', shortLabel: 'WFH', color: colours.green, icon: 'Home' },
    away: { label: 'Away / Leave', shortLabel: 'Away', color: '#9CA3AF', icon: 'Airplane' },
    sick: { label: 'Off Sick', shortLabel: 'Sick', color: colours.cta, icon: 'Health' },
    ooo: { label: 'Out of Office', shortLabel: 'OOO', color: colours.orange, icon: 'Clock' },
};

const STATUS_ORDER: StatusType[] = ['office', 'wfh', 'away', 'sick', 'ooo'];

const STATUS_OPTIONS: IDropdownOption[] = STATUS_ORDER.map(status => ({
    key: status,
    text: STATUS_CONFIG[status].shortLabel,
}));

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
    onShowToast,
}, ref) => {
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

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

    const formatShortDate = (d: Date): string => {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const currentWeekStart = formatDateLocal(getMondayOfCurrentWeek());
    const nextWeekMonday = new Date(getMondayOfCurrentWeek());
    nextWeekMonday.setDate(nextWeekMonday.getDate() + 7);
    const nextWeekStart = formatDateLocal(nextWeekMonday);

    const userInitials = (userData?.[0]?.Initials || '').toString().toUpperCase() || 
                        (userData?.displayName?.match(/\b\w/g)?.join('') || '').toUpperCase() || 
                        (userData?.mail?.substring(0, 2) || '').toUpperCase();

    const combinedLeaveRecords = useMemo(() => [...annualLeaveRecords, ...futureLeaveRecords], [annualLeaveRecords, futureLeaveRecords]);

    // Normalize status from various formats to our simplified format
    const normalizeStatus = (status: string): StatusType => {
        const s = status.toLowerCase().trim();
        if (s === 'office' || s === 'in office') return 'office';
        if (s === 'wfh' || s === 'home' || s === 'work from home') return 'wfh';
        if (s === 'away' || s === 'leave') return 'away';
        if (s === 'sick' || s === 'off-sick' || s === 'off sick') return 'sick';
        if (s === 'ooo' || s === 'out-of-office' || s === 'out of office') return 'ooo';
        return 'wfh'; // default
    };

    // Convert our format back to storage format
    const toStorageStatus = (status: StatusType): string => {
        switch (status) {
            case 'office': return 'office';
            case 'wfh': return 'wfh';
            case 'away': return 'away';
            case 'sick': return 'off-sick';
            case 'ooo': return 'out-of-office';
            default: return 'wfh';
        }
    };

    const initialState: Record<string, Record<string, StatusType>> = useMemo(() => {
        const state: Record<string, Record<string, StatusType>> = {
            [currentWeekStart]: {},
            [nextWeekStart]: {},
        };
        const dayMap: Record<string, string> = {
            Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday',
        };
        
        const filteredRecords = attendanceRecords.filter((r) => r.Initials === userInitials);
        filteredRecords.forEach((rec) => {
            const weekKey = rec.Week_Start?.substring(0, 10);
            if (!state[weekKey]) return;
            if (!rec.Attendance_Days) return;

            const normalized = rec.Attendance_Days.toString().trim().toLowerCase();
            const isSingleStatus = ['office','wfh','away','off-sick','out-of-office','sick','ooo'].includes(normalized);

            if (isSingleStatus) {
                weekDays.forEach((day) => {
                    state[weekKey][day] = normalizeStatus(normalized);
                });
                return;
            }

            const dayStatuses = rec.Attendance_Days.split(',').map(d => d.trim());
            dayStatuses.forEach(dayStatus => {
                const [dayAbbr, status] = dayStatus.includes(':') ? dayStatus.split(':') : [dayStatus, 'office'];
                const dayName = dayMap[dayAbbr] || dayAbbr;
                if (weekDays.includes(dayName as typeof weekDays[number])) {
                    state[weekKey][dayName] = normalizeStatus(status || 'wfh');
                }
            });
        });
        
        // Default all days to WFH if not set
        [currentWeekStart, nextWeekStart].forEach(weekStart => {
            weekDays.forEach(day => {
                if (!state[weekStart][day]) {
                    state[weekStart][day] = 'wfh';
                }
            });
        });
        
        return state;
    }, [attendanceRecords, userInitials, currentWeekStart, nextWeekStart]);

    const [localAttendance, setLocalAttendance] = useState<Record<string, Record<string, StatusType>>>(initialState);
    const [saving, setSaving] = useState(false);

    useImperativeHandle(ref, () => ({
        setWeek: () => { },
        focusTable: () => { },
    }));

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

    const setDayStatus = (weekStart: string, day: string, status: StatusType) => {
        setLocalAttendance((prev) => ({
            ...prev,
            [weekStart]: {
                ...prev[weekStart],
                [day]: status
            }
        }));
    };

    const setAllDays = (weekStart: string, status: StatusType) => {
        setLocalAttendance((prev) => ({
            ...prev,
            [weekStart]: weekDays.reduce((acc, day) => ({ ...acc, [day]: status }), {} as Record<string, StatusType>)
        }));
    };

    const handleSave = async () => {
        console.log('[PersonalAttendanceConfirm] handleSave called');
        console.log('[PersonalAttendanceConfirm] localAttendance:', JSON.stringify(localAttendance));
        setSaving(true);
        try {
            for (const weekStart of [currentWeekStart, nextWeekStart]) {
                const dayStatuses = localAttendance[weekStart] || {};
                console.log('[PersonalAttendanceConfirm] weekStart:', weekStart, 'dayStatuses:', dayStatuses);
                const dayStrings = Object.entries(dayStatuses).map(([dayName, status]) => {
                    const dayMap: Record<string, string> = {
                        Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri',
                    };
                    const abbr = dayMap[dayName] || dayName;
                    return `${abbr}:${toStorageStatus(status)}`;
                });
                const days = dayStrings.join(',');
                console.log('[PersonalAttendanceConfirm] Calling onSave with:', weekStart, days);
                await onSave(weekStart, days);
                console.log('[PersonalAttendanceConfirm] onSave completed for:', weekStart);
            }
            if (onShowToast) {
                onShowToast('Attendance saved', 'success', 'Your schedule has been updated');
            }
            onClose();
        } catch (error) {
            console.error('[PersonalAttendanceConfirm] Error saving attendance:', error);
            if (onShowToast) {
                onShowToast('Failed to save', 'error', error instanceof Error ? error.message : 'Please try again');
            }
        } finally {
            setSaving(false);
        }
    };

    const getWeekDates = (weekStart: string): Date[] => {
        const start = new Date(weekStart + 'T00:00:00');
        return weekDays.map((_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    // Styles
    const containerStyle: CSSProperties = {
        background: isDarkMode ? '#111827' : '#FFFFFF',
        borderRadius: '12px',
        padding: '20px',
        width: '100%',
        color: isDarkMode ? '#F3F4F6' : '#111827',
    };

    const headerStyle: CSSProperties = {
        marginBottom: '16px',
        textAlign: 'center',
    };

    const titleStyle: CSSProperties = {
        margin: 0,
        fontSize: '18px',
        fontWeight: 600,
        color: isDarkMode ? '#FFFFFF' : '#111827',
    };

    const weekSectionStyle: CSSProperties = {
        marginBottom: '20px',
    };

    const weekHeaderStyle: CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`,
    };

    const weekTitleStyle: CSSProperties = {
        fontSize: '14px',
        fontWeight: 600,
        color: isDarkMode ? '#F3F4F6' : '#374151',
    };

    const weekDateStyle: CSSProperties = {
        fontSize: '12px',
        color: isDarkMode ? '#9CA3AF' : '#6B7280',
    };

    const daysGridStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '8px',
    };

    const getDayCardStyle = (status: StatusType, isLeave: boolean): CSSProperties => {
        const config = STATUS_CONFIG[status];
        return {
            padding: '10px 6px',
            borderRadius: '8px',
            borderLeft: `3px solid ${isLeave ? '#6B7280' : config.color}`,
            background: isDarkMode ? '#1F2937' : '#F9FAFB',
            textAlign: 'center' as const,
            opacity: isLeave ? 0.5 : 1,
        };
    };

    const dayLabelStyle: CSSProperties = {
        fontSize: '11px',
        fontWeight: 600,
        color: isDarkMode ? '#9CA3AF' : '#6B7280',
        marginBottom: '2px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    };

    const dayDateStyle: CSSProperties = {
        fontSize: '15px',
        fontWeight: 600,
        color: isDarkMode ? '#F3F4F6' : '#374151',
        marginBottom: '6px',
    };

    const getDropdownStyles = (status: StatusType) => ({
        dropdown: {
            width: '100%',
            minWidth: 0,
        },
        title: {
            backgroundColor: isDarkMode ? '#374151' : '#FFFFFF',
            borderColor: STATUS_CONFIG[status].color,
            borderWidth: '1px',
            borderRadius: '4px',
            color: isDarkMode ? '#F3F4F6' : '#374151',
            fontSize: '11px',
            height: '28px',
            lineHeight: '26px',
            padding: '0 24px 0 8px',
        },
        caretDown: {
            color: isDarkMode ? '#9CA3AF' : '#6B7280',
            fontSize: '10px',
        },
        dropdownItem: {
            fontSize: '12px',
            minHeight: '28px',
        },
        dropdownItemSelected: {
            backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
        },
    });

    const quickActionsStyle: CSSProperties = {
        display: 'flex',
        gap: '8px',
        marginTop: '12px',
        flexWrap: 'wrap',
    };

    const quickButtonStyle = (color: string): CSSProperties => ({
        padding: '6px 12px',
        borderRadius: '6px',
        border: `1px solid ${color}`,
        background: 'transparent',
        color: isDarkMode ? '#F3F4F6' : color,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    });

    const footerStyle: CSSProperties = {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`,
    };

    const renderWeek = (label: string, weekStart: string) => {
        const dates = getWeekDates(weekStart);
        const monday = dates[0];
        const friday = dates[4];
        const dateRange = `${formatShortDate(monday)} – ${formatShortDate(friday)}`;

        return (
            <div style={weekSectionStyle}>
                <div style={weekHeaderStyle}>
                    <span style={weekTitleStyle}>{label}</span>
                    <span style={weekDateStyle}>{dateRange}</span>
                </div>

                <div style={daysGridStyle}>
                    {weekDays.map((day, idx) => {
                        const status = localAttendance[weekStart]?.[day] || 'wfh';
                        const onLeave = isOnLeave(weekStart, idx);
                        const displayStatus = onLeave ? 'away' : status;

                        return (
                            <div
                                key={day}
                                style={getDayCardStyle(displayStatus, onLeave)}
                            >
                                <div style={dayLabelStyle}>{dayAbbr[idx]}</div>
                                <div style={dayDateStyle}>{dates[idx].getDate()}</div>
                                {onLeave ? (
                                    <div style={{ 
                                        fontSize: '11px', 
                                        color: '#9CA3AF',
                                        padding: '4px 0'
                                    }}>
                                        On Leave
                                    </div>
                                ) : (
                                    <Dropdown
                                        selectedKey={status}
                                        options={STATUS_OPTIONS}
                                        onChange={(_, option) => option && setDayStatus(weekStart, day, option.key as StatusType)}
                                        styles={getDropdownStyles(status)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={quickActionsStyle}>
                    <button
                        type="button"
                        onClick={() => setAllDays(weekStart, 'office')}
                        style={quickButtonStyle(colours.missedBlue)}
                    >
                        <Icon iconName="CityNext" style={{ fontSize: '12px' }} />
                        All Office
                    </button>
                    <button
                        type="button"
                        onClick={() => setAllDays(weekStart, 'wfh')}
                        style={quickButtonStyle(colours.green)}
                    >
                        <Icon iconName="Home" style={{ fontSize: '12px' }} />
                        All WFH
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div style={containerStyle}>
            {renderWeek('This Week', currentWeekStart)}
            {renderWeek('Next Week', nextWeekStart)}

            <div style={footerStyle}>
                <DefaultButton 
                    text="Cancel" 
                    onClick={onClose}
                    styles={{
                        root: {
                            borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                            backgroundColor: 'transparent',
                            color: isDarkMode ? '#D1D5DB' : '#374151',
                            minWidth: '80px',
                        },
                        rootHovered: {
                            backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                            borderColor: isDarkMode ? '#6B7280' : '#9CA3AF',
                        }
                    }}
                />
                <PrimaryButton 
                    text={saving ? 'Saving...' : 'Save'} 
                    onClick={handleSave} 
                    disabled={saving}
                    styles={{
                        root: {
                            backgroundColor: colours.missedBlue,
                            borderColor: colours.missedBlue,
                            minWidth: '100px',
                        },
                        rootHovered: {
                            backgroundColor: '#174a92',
                            borderColor: '#174a92',
                        },
                        rootPressed: {
                            backgroundColor: '#0a1f3d',
                            borderColor: '#0a1f3d',
                        },
                        rootDisabled: {
                            backgroundColor: isDarkMode ? '#374151' : '#E5E7EB',
                            borderColor: 'transparent',
                        }
                    }}
                />
            </div>
        </div>
    );
});

export default PersonalAttendanceConfirm;
