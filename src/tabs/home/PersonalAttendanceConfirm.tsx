import React, { useState, useMemo, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Icon, DefaultButton, Spinner, SpinnerSize } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { addDays, format, startOfWeek, isSameDay } from 'date-fns';

interface TeamMember {
    First: string;
    Initials: string;
    Nickname?: string;
    Level?: string;
}

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
    demoModeEnabled?: boolean;
    isAdmin?: boolean;
    attendanceRecords: AttendanceRecord[];
    annualLeaveRecords: AnnualLeaveRecord[];
    futureLeaveRecords: AnnualLeaveRecord[];
    userData: any;
    teamData?: TeamMember[];
    onSave: (weekStart: string, days: string, initials?: string) => Promise<void>;
    onClose: () => void;
    onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning', details?: string) => void;
}

type StatusType = 'office' | 'wfh' | 'away' | 'sick' | 'ooo' | 'unset';

const STATUS_CONFIG: Record<StatusType, { label: string; shortLabel: string; color: string; icon: string; darkColor: string }> = {
    office: { label: 'In Office', shortLabel: 'Office', color: colours.missedBlue, darkColor: colours.highlight, icon: 'CityNext' },
    wfh: { label: 'Work From Home', shortLabel: 'WFH', color: colours.green, darkColor: colours.green, icon: 'Home' },
    away: { label: 'Away / Leave', shortLabel: 'Away', color: '#9CA3AF', darkColor: '#9CA3AF', icon: 'Airplane' },
    sick: { label: 'Off Sick', shortLabel: 'Sick', color: colours.cta, darkColor: colours.cta, icon: 'Health' },
    ooo: { label: 'Out of Office', shortLabel: 'OOO', color: colours.cta, darkColor: colours.cta, icon: 'Clock' },
    unset: { label: 'Not Set', shortLabel: 'Select', color: '#6B7280', darkColor: '#6B7280', icon: 'More' },
};

interface DayStatus {
    status: StatusType;
    isLeave: boolean;
}

const PersonalAttendanceConfirm = forwardRef<
    { setWeek: (week: 'current' | 'next') => void; focusTable: () => void },
    PersonalAttendanceConfirmProps
>(function PersonalAttendanceConfirm({
    isDarkMode,
    demoModeEnabled = false,
    isAdmin = false,
    attendanceRecords,
    annualLeaveRecords,
    futureLeaveRecords,
    userData,
    teamData = [],
    onSave,
    onClose,
    onShowToast,
}, ref) {
    const safeAttendanceRecords: AttendanceRecord[] = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const safeAnnualLeaveRecords: AnnualLeaveRecord[] = Array.isArray(annualLeaveRecords) ? annualLeaveRecords : [];
    const safeFutureLeaveRecords: AnnualLeaveRecord[] = Array.isArray(futureLeaveRecords) ? futureLeaveRecords : [];

    // Admin mode state - only used when isAdmin is true
    const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

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

    const toIsoDate = (value: unknown): string | null => {
        if (!value) return null;
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) return null;
            return value.toISOString().slice(0, 10);
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
            const parsed = new Date(trimmed);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
            return null;
        }
        const coerced = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(coerced)) return coerced.slice(0, 10);
        const parsed = new Date(coerced);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        return null;
    };

    const currentWeekStart = formatDateLocal(getMondayOfCurrentWeek());
    const nextWeekMonday = new Date(getMondayOfCurrentWeek());
    nextWeekMonday.setDate(nextWeekMonday.getDate() + 7);
    const nextWeekStart = formatDateLocal(nextWeekMonday);

    const ownInitials = (userData?.[0]?.Initials || '').toString().toUpperCase() || 
                        (userData?.displayName?.match(/\b\w/g)?.join('') || '').toUpperCase() || 
                        (userData?.mail?.substring(0, 2) || '').toUpperCase();

    // Employee list for admin mode
    const employeeList = useMemo(() => {
        if (!teamData || teamData.length === 0) return [];
        return [...teamData]
            .filter(m => m.Initials && m.First)
            .sort((a, b) => (a.First || '').localeCompare(b.First || ''));
    }, [teamData]);

    // Active initials - either selected employee or own
    const activeInitials = selectedEmployee || ownInitials;

    const combinedLeaveRecords = useMemo(() => [...safeAnnualLeaveRecords, ...safeFutureLeaveRecords], [safeAnnualLeaveRecords, safeFutureLeaveRecords]);

    // Normalize status from various formats to our simplified format
    const normalizeStatus = (status: string): StatusType => {
        const s = status.toLowerCase().trim();
        if (s === 'office' || s === 'in office') return 'office';
        if (s === 'wfh' || s === 'home' || s === 'work from home') return 'wfh';
        if (s === 'away' || s === 'leave') return 'away';
        if (s === 'sick' || s === 'off-sick' || s === 'off sick') return 'sick';
        if (s === 'ooo' || s === 'out-of-office' || s === 'out of office') return 'ooo';
        return 'unset'; // default to unset for unknown statuses
    };

    // Convert our format back to storage format
    const toStorageStatus = (status: StatusType): string => {
        switch (status) {
            case 'office': return 'office';
            case 'wfh': return 'wfh';
            case 'away': return 'away';
            case 'sick': return 'off-sick';
            case 'ooo': return 'out-of-office';
            case 'unset': return 'wfh'; // save unset as wfh when submitting
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
        
        const filteredRecords = safeAttendanceRecords.filter((r) => r.Initials === activeInitials);
        filteredRecords.forEach((rec) => {
            const weekKey = toIsoDate(rec.Week_Start);
            if (!weekKey || !state[weekKey]) return;
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
        
        // Default unconfirmed days to 'unset' (neutral state)
        [currentWeekStart, nextWeekStart].forEach(weekStart => {
            weekDays.forEach(day => {
                if (!state[weekStart][day]) {
                    state[weekStart][day] = 'unset';
                }
            });
        });
        
        return state;
    }, [safeAttendanceRecords, activeInitials, currentWeekStart, nextWeekStart]);

    const [localAttendance, setLocalAttendance] = useState<Record<string, Record<string, StatusType>>>(initialState);
    const [saving, setSaving] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{week: string; day: string} | null>(null);

    // Reset attendance data when selected employee changes
    useEffect(() => {
        setLocalAttendance(initialState);
    }, [selectedEmployee, initialState]);

    useImperativeHandle(ref, () => ({
        setWeek: () => { },
        focusTable: () => { },
    }));

    // Check if a user is on leave for a specific day
    const isOnLeave = useCallback((weekStart: string, dayIndex: number): boolean => {
        const weekStartDate = new Date(weekStart + 'T00:00:00');
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + dayIndex);
        const iso = formatDateLocal(date);

        return combinedLeaveRecords.some(
            (leave) => {
                if (leave.status !== 'booked') return false;
                const person = String((leave as any)?.person ?? '').trim().toLowerCase();
                if (!person) return false;
                const start = String((leave as any)?.start_date ?? '').trim();
                const end = String((leave as any)?.end_date ?? '').trim();
                if (!start || !end) return false;
                return person === activeInitials.toLowerCase() && iso >= start && iso <= end;
            }
        );
    }, [combinedLeaveRecords, activeInitials]);

    // Build 14-day calendar view (2 weeks)
    const calendarDays = useMemo(() => {
        const monday = getMondayOfCurrentWeek();
        const days: Array<{
            date: Date;
            dateStr: string;
            dayName: string;
            dayAbbr: string;
            weekStart: string;
            isWeekend: boolean;
            isLeave: boolean;
            status: StatusType;
        }> = [];

        for (let i = 0; i < 14; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dateStr = formatDateLocal(date);
            const dayIdx = date.getDay();
            const isWeekend = dayIdx === 0 || dayIdx === 6;
            
            // Determine which week this belongs to
            const weekStart = i < 7 ? currentWeekStart : nextWeekStart;
            const dayOfWeek = (dayIdx === 0 ? 6 : dayIdx - 1); // Monday = 0, Sunday = 6
            const dayName = weekDays[dayOfWeek];
            
            const status = localAttendance[weekStart]?.[dayName] || 'wfh';
            const isLeave = isOnLeave(weekStart, dayOfWeek);

            days.push({
                date,
                dateStr,
                dayName,
                dayAbbr: dayAbbr[dayOfWeek],
                weekStart,
                isWeekend,
                isLeave,
                status: isLeave ? 'away' : status
            });
        }

        return days;
    }, [currentWeekStart, nextWeekStart, localAttendance, isOnLeave]);

    const setDayStatus = (weekStart: string, day: string, status: StatusType) => {
        setLocalAttendance((prev) => ({
            ...prev,
            [weekStart]: {
                ...prev[weekStart],
                [day]: status
            }
        }));
        setSelectedCell(null); // Close selector after selection
    };

    const toggleDaySelector = (weekStart: string, day: string) => {
        if (selectedCell?.week === weekStart && selectedCell?.day === day) {
            setSelectedCell(null);
        } else {
            setSelectedCell({ week: weekStart, day });
        }
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
        console.log('[PersonalAttendanceConfirm] Saving for:', selectedEmployee ? `employee ${activeInitials}` : 'self');
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
                console.log('[PersonalAttendanceConfirm] Calling onSave with:', weekStart, days, selectedEmployee ? activeInitials : undefined);
                await onSave(weekStart, days, selectedEmployee ? activeInitials : undefined);
                console.log('[PersonalAttendanceConfirm] onSave completed for:', weekStart);
            }
            if (onShowToast) {
                if (demoModeEnabled) {
                    onShowToast('Demo mode: attendance not saved', 'info', 'Changes are preview-only while demo mode is enabled.');
                } else {
                    const emp = employeeList.find(e => e.Initials === selectedEmployee);
                    const msg = selectedEmployee 
                        ? `Attendance saved for ${emp?.First || selectedEmployee}`
                        : 'Attendance saved';
                    onShowToast(msg, 'success', 'Schedule has been updated');
                }
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

    // Styles matching Annual Leave Modal
    const containerStyle: CSSProperties = {
        background: 'transparent',
        width: '100%',
    };

    const calendarGridStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '4px',
        marginBottom: '20px',
    };

    const dayHeaderStyle: CSSProperties = {
        padding: '10px 8px',
        textAlign: 'center',
        fontSize: '11px',
        fontWeight: 600,
        color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    };

    const getDayCardStyle = (status: StatusType, isLeave: boolean, isWeekend: boolean, isToday: boolean): CSSProperties => {
        const config = STATUS_CONFIG[status];
        const statusColor = isLeave ? '#9CA3AF' : (isDarkMode ? config.darkColor : config.color);
        
        let bgColor = isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(255, 255, 255, 0.5)';
        let textColor = isDarkMode ? '#F3F4F6' : '#374151';
        
        if (isWeekend) {
            bgColor = isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.03)';
        } else if (!isLeave) {
            bgColor = isDarkMode ? `rgba(${hexToRgb(statusColor)}, 0.15)` : `rgba(${hexToRgb(statusColor)}, 0.1)`;
        }

        return {
            padding: '8px',
            background: bgColor,
            border: `1px solid ${isToday ? (isDarkMode ? colours.highlight : colours.highlight) : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)')}`,
            borderLeft: isWeekend ? undefined : `3px solid ${statusColor}`,
            borderRadius: 0,
            textAlign: 'center',
            cursor: isWeekend || isLeave ? 'default' : 'pointer',
            opacity: isWeekend ? 0.4 : isLeave ? 0.6 : 1,
            position: 'relative',
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: '0.1s',
        };
    };

    const dateNumberStyle: CSSProperties = {
        fontSize: '16px',
        fontWeight: 700,
        color: isDarkMode ? '#F3F4F6' : '#374151',
        marginBottom: '4px',
    };

    const statusBadgeStyle = (status: StatusType): CSSProperties => {
        const config = STATUS_CONFIG[status];
        const statusColor = isDarkMode ? config.darkColor : config.color;
        return {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '4px 8px',
            fontSize: '10px',
            fontWeight: 600,
            color: statusColor,
            background: isDarkMode ? `rgba(${hexToRgb(statusColor)}, 0.2)` : `rgba(${hexToRgb(statusColor)}, 0.15)`,
            borderRadius: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
        };
    };

    const statusSelectorStyle: CSSProperties = {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        background: isDarkMode ? colours.dark.sectionBackground : '#FFFFFF',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#E5E7EB'}`,
        borderRadius: '4px',
        boxShadow: isDarkMode ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.12)',
        zIndex: 10,
        marginTop: '4px',
        padding: '4px',
    };

    const statusOptionStyle = (status: StatusType, isSelected: boolean): CSSProperties => {
        const config = STATUS_CONFIG[status];
        return {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            cursor: 'pointer',
            borderRadius: '2px',
            background: isSelected 
                ? (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)')
                : 'transparent',
            color: isDarkMode ? '#E5E7EB' : '#374151',
            fontSize: '12px',
            fontWeight: 500,
        };
    };

    // Helper to convert hex to RGB for rgba usage
    const hexToRgb = (hex: string): string => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        return '148, 163, 184';
    };

    const quickActionsStyle: CSSProperties = {
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center',
    };

    const quickButtonStyle = (color: string): CSSProperties => ({
        height: '24px',
        minWidth: '100px',
        padding: '0 14px',
        borderRadius: 0,
        border: `1px solid ${color}`,
        background: isDarkMode ? `rgba(${hexToRgb(color)}, 0.1)` : `rgba(${hexToRgb(color)}, 0.1)`,
        color: color,
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
    });

    const footerStyle: CSSProperties = {
        display: 'flex',
        gap: '10px',
        justifyContent: 'flex-end',
        marginTop: '24px',
        paddingTop: '20px',
        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
    };

    return (
        <div style={containerStyle}>
            {/* Admin Mode - Employee Selection (only shown when isAdmin is true) */}
            {isAdmin && teamData && teamData.length > 0 && (
                <div style={{
                    padding: '12px 14px',
                    marginBottom: '16px',
                    background: isDarkMode ? 'rgba(255, 183, 77, 0.06)' : 'rgba(255, 152, 0, 0.06)',
                    border: `1px solid ${isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.2)'}`,
                    borderRadius: 4,
                }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            background: isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.15)',
                            borderRadius: 3,
                            fontSize: '9px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: isDarkMode ? '#FFB74D' : '#E65100',
                        }}>
                            <Icon iconName="Shield" style={{ fontSize: '10px' }} />
                            Admin
                        </div>
                        <span style={{ 
                            fontSize: '11px', 
                            color: isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)' 
                        }}>
                            Select employee to confirm their attendance
                        </span>
                    </div>

                    {/* Employee chips */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        padding: '2px 0',
                    }}>
                        {/* "Me" chip */}
                        <button
                            type="button"
                            onClick={() => setSelectedEmployee(null)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                background: !selectedEmployee 
                                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                                    : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                border: `1px solid ${!selectedEmployee 
                                    ? colours.highlight
                                    : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
                                borderRadius: 3,
                                fontSize: '11px',
                                fontWeight: !selectedEmployee ? 600 : 500,
                                color: !selectedEmployee 
                                    ? colours.highlight 
                                    : (isDarkMode ? '#F3F4F6' : '#061733'),
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <Icon iconName="Contact" style={{ fontSize: '10px' }} />
                            Me ({ownInitials})
                        </button>

                        {/* Employee chips */}
                        {employeeList.filter(e => e.Initials !== ownInitials).map((emp) => {
                            const isSelected = selectedEmployee === emp.Initials;
                            return (
                                <button
                                    key={emp.Initials}
                                    type="button"
                                    onClick={() => setSelectedEmployee(emp.Initials || null)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        background: isSelected 
                                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                                            : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                        border: `1px solid ${isSelected 
                                            ? colours.highlight
                                            : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
                                        borderRadius: 3,
                                        fontSize: '11px',
                                        fontWeight: isSelected ? 600 : 500,
                                        color: isSelected 
                                            ? colours.highlight 
                                            : (isDarkMode ? '#F3F4F6' : '#061733'),
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>{emp.Initials}</span>
                                    <span style={{ opacity: 0.7 }}>{emp.First || emp.Nickname}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected employee info bar */}
                    {selectedEmployee && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginTop: '10px',
                            padding: '8px 10px',
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                            borderRadius: 3,
                            fontSize: '11px',
                        }}>
                            <span style={{ color: isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)' }}>
                                Confirming attendance for: <strong style={{ color: isDarkMode ? '#F3F4F6' : '#061733' }}>
                                    {employeeList.find(e => e.Initials === selectedEmployee)?.First || selectedEmployee}
                                </strong>
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Calendar Header - only show when not in admin-selecting mode */}
            {!selectedEmployee && (
                <div style={{
                    marginBottom: '16px',
                    padding: '10px 14px',
                    background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: 4,
                }}>
                    <div style={{ fontSize: '11px', color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.6)' }}>
                        Click any day to change your status
                    </div>
                </div>
            )}

            {/* Day Headers */}
            <div style={calendarGridStyle}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                    <div key={day} style={dayHeaderStyle}>
                        {day}
                    </div>
                ))}

                {/* Calendar Days */}
                {calendarDays.filter(d => !d.isWeekend).map((dayInfo, idx) => {
                    const isToday = isSameDay(dayInfo.date, new Date());
                    const config = STATUS_CONFIG[dayInfo.status];
                    const isFirstWeek = idx < 5;
                    const isSelected = selectedCell?.week === dayInfo.weekStart && selectedCell?.day === dayInfo.dayName;

                    return (
                        <div
                            key={idx}
                            onClick={() => !dayInfo.isLeave && toggleDaySelector(dayInfo.weekStart, dayInfo.dayName)}
                            style={getDayCardStyle(dayInfo.status, dayInfo.isLeave, false, isToday)}
                            onMouseEnter={(e) => {
                                if (!dayInfo.isLeave) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)';
                                    e.currentTarget.style.borderColor = isDarkMode ? colours.highlight : colours.highlight;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!dayInfo.isLeave) {
                                    const originalStyle = getDayCardStyle(dayInfo.status, dayInfo.isLeave, false, isToday);
                                    e.currentTarget.style.background = originalStyle.background as string;
                                    e.currentTarget.style.borderColor = (originalStyle.border as string).split(' ')[2];
                                }
                            }}
                        >
                            <div>
                                <div style={{ 
                                    fontSize: '9px', 
                                    fontWeight: 600, 
                                    color: isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.3px',
                                    marginBottom: '2px'
                                }}>
                                    {dayInfo.dayAbbr}
                                </div>
                                <div style={dateNumberStyle}>
                                    {dayInfo.date.getDate()}
                                </div>
                            </div>

                            {dayInfo.isLeave ? (
                                <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500 }}>
                                    On Leave
                                </div>
                            ) : (
                                <div style={statusBadgeStyle(dayInfo.status)}>
                                    <Icon iconName={config.icon} style={{ fontSize: '10px' }} />
                                    {config.shortLabel}
                                </div>
                            )}

                            {/* Status Selector Dropdown */}
                            {isSelected && !dayInfo.isLeave && (
                                <div style={statusSelectorStyle} onClick={(e) => e.stopPropagation()}>
                                    {(['office', 'wfh', 'away', 'sick', 'ooo'] as StatusType[]).map(status => {
                                        const statusConfig = STATUS_CONFIG[status];
                                        const statusColor = isDarkMode ? statusConfig.darkColor : statusConfig.color;
                                        const isCurrentStatus = dayInfo.status === status;
                                        return (
                                            <div
                                                key={status}
                                                onClick={() => setDayStatus(dayInfo.weekStart, dayInfo.dayName, status)}
                                                style={statusOptionStyle(status, isCurrentStatus)}
                                                onMouseEnter={(e) => {
                                                    if (!isCurrentStatus) {
                                                        e.currentTarget.style.background = isDarkMode ? 'rgba(55, 65, 81, 0.6)' : '#F3F4F6';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isCurrentStatus) {
                                                        e.currentTarget.style.background = 'transparent';
                                                    }
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '3px',
                                                    backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    <Icon iconName={statusConfig.icon} style={{ fontSize: '11px', color: statusColor }} />
                                                </div>
                                                <span>{statusConfig.shortLabel}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div style={quickActionsStyle}>
                {(['office', 'wfh', 'away', 'sick', 'ooo'] as StatusType[]).map(status => {
                    const config = STATUS_CONFIG[status];
                    const color = isDarkMode ? config.darkColor : config.color;
                    return (
                        <button
                            key={status}
                            type="button"
                            onClick={() => {
                                setAllDays(currentWeekStart, status);
                                setAllDays(nextWeekStart, status);
                            }}
                            style={quickButtonStyle(color)}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            <Icon iconName={config.icon} style={{ fontSize: '10px' }} />
                            All {config.shortLabel}
                        </button>
                    );
                })}
            </div>

            {/* Footer Buttons */}
            <div style={footerStyle}>
                <DefaultButton 
                    text={saving ? 'Saving...' : 'Submit'}
                    onClick={handleSave} 
                    disabled={saving}
                    iconProps={saving ? undefined : { iconName: 'Send' }}
                    styles={{
                        root: {
                            height: '24px',
                            minWidth: '90px',
                            borderRadius: 0,
                            border: isDarkMode ? `1px solid ${colours.highlight}` : 'none',
                            backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : colours.highlight,
                            color: isDarkMode ? colours.highlight : '#ffffff',
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '0 12px',
                            transition: 'all 0.2s ease',
                        },
                        rootHovered: {
                            backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : colours.highlight,
                            borderColor: isDarkMode ? colours.highlight : 'transparent',
                            color: isDarkMode ? colours.highlight : '#ffffff',
                            opacity: isDarkMode ? 1 : 0.85,
                        },
                        rootDisabled: {
                            backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(0, 0, 0, 0.3)',
                            border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : 'none',
                        },
                        label: {
                            fontWeight: 600,
                        }
                    }}
                >
                    {saving && <Spinner size={SpinnerSize.xSmall} style={{ marginRight: '8px' }} />}
                </DefaultButton>
                <DefaultButton 
                    text="Clear" 
                    onClick={onClose}
                    styles={{
                        root: {
                            height: '24px',
                            minWidth: '90px',
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            color: isDarkMode ? 'rgba(203, 213, 225, 0.6)' : 'rgba(71, 85, 105, 0.6)',
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '0 12px',
                            transition: 'all 0.2s ease',
                        },
                        rootHovered: {
                            backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(241, 245, 249, 0.9)',
                        },
                        label: {
                            fontWeight: 600,
                        }
                    }}
                />
            </div>
        </div>
    );
});

export default PersonalAttendanceConfirm;
