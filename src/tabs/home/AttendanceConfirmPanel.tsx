import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { DefaultButton, mergeStyles, Icon, TooltipHost } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { componentTokens } from '../../app/styles/componentTokens';
import { cardStyles } from '../instructions/componentTokens';

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

interface AttendanceProps {
    isDarkMode: boolean;
    attendanceRecords: AttendanceRecord[];
    teamData: any[];
    annualLeaveRecords: AnnualLeaveRecord[];
    futureLeaveRecords: AnnualLeaveRecord[];
    userData: any;
    onSave: (weekStart: string, days: string) => Promise<void>;
}

const sectionStyle = mergeStyles({
    marginBottom: '20px',
    boxShadow: (cardStyles.root as React.CSSProperties).boxShadow,
    borderRadius: componentTokens.stepHeader.base.borderRadius,
    overflow: 'hidden',
});

const headerStyle = (isDark: boolean) => ({
    backgroundColor: colours.darkBlue,
    color: '#ffffff',
    padding: '6px 10px',
    border: `1px solid ${colours.light.border}`,
    display: 'flex',
    alignItems: 'center',
    height: 32,
    fontWeight: 600,
} as React.CSSProperties);

const contentStyle = (isDark: boolean) => ({
    padding: componentTokens.summaryPane.base.padding,
    backgroundColor: isDark ? colours.dark.sectionBackground : colours.light.sectionBackground,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
} as React.CSSProperties);

const summaryGrid = mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
    marginBottom: 16,
});

const avatarStyle = mergeStyles({
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 10,
    color: '#fff',
});

const avatarRow = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
});

const AttendanceConfirmPanel = forwardRef<
    { setWeek: (week: 'current' | 'next') => void; focusTable: () => void },
    AttendanceProps
>(({
    isDarkMode,
    attendanceRecords,
    teamData,
    annualLeaveRecords,
    futureLeaveRecords,
    userData,
    onSave,
}, ref) => {
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    const nextWeekStart = formatDateLocal(new Date(getMondayOfCurrentWeek().setDate(getMondayOfCurrentWeek().getDate() + 7)));

    const userInitials = userData?.[0]?.Initials || '';

    const combinedLeaveRecords = useMemo(() => [...annualLeaveRecords, ...futureLeaveRecords], [annualLeaveRecords, futureLeaveRecords]);

    const initialState: Record<string, string[]> = useMemo(() => {
        const state: Record<string, string[]> = {
            [currentWeekStart]: [],
            [nextWeekStart]: [],
        };
        const dayMap: Record<string, string> = {
            Mon: 'Monday',
            Tue: 'Tuesday',
            Wed: 'Wednesday',
            Thu: 'Thursday',
            Fri: 'Friday',
            Sat: 'Saturday',
            Sun: 'Sunday',
        };
        attendanceRecords
            .filter((r) => r.Initials === userInitials)
            .forEach((rec) => {
                state[rec.Week_Start] = rec.Attendance_Days
                    ? rec.Attendance_Days.split(',').map((d) => dayMap[d.trim()] || d.trim())
                    : [];
            });
        return state;
    }, [attendanceRecords, userInitials, currentWeekStart, nextWeekStart]);

    const [localAttendance, setLocalAttendance] = useState<Record<string, string[]>>(initialState);
    const [saving, setSaving] = useState(false);

    const weekDaysFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const londonNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
    const afterFiveThirty = londonNow.getHours() > 17 || (londonNow.getHours() === 17 && londonNow.getMinutes() >= 30);
    const nextDay = new Date(londonNow);
    if (afterFiveThirty) nextDay.setDate(londonNow.getDate() + 1);
    const targetDayLabel = weekDaysFull[nextDay.getDay()];
    const targetDayStr = formatDateLocal(nextDay);
    const useNextWeek = (londonNow.getDay() === 5 && afterFiveThirty) || londonNow.getDay() === 6 || londonNow.getDay() === 0;
    const weekStartToUse = useNextWeek ? nextWeekStart : currentWeekStart;

    const getMemberWeek = (initials: string): string => {
        const records = attendanceRecords.filter(
            (rec) => rec.Initials === initials && rec.Week_Start === weekStartToUse
        );
        return records.map((rec) => rec.Attendance_Days || '').filter(Boolean).join(',');
    };

    const getStatus = (personAttendance: string, initials: string): 'office' | 'home' | 'away' => {
        const isOnLeave = combinedLeaveRecords.some(
            (leave) =>
                leave.status === 'booked' &&
                leave.person.trim().toLowerCase() === initials.trim().toLowerCase() &&
                targetDayStr >= leave.start_date &&
                targetDayStr <= leave.end_date
        );
        if (isOnLeave) return 'away';
        const dayMap: Record<string, string> = {
            Mon: 'Monday',
            Tue: 'Tuesday',
            Wed: 'Wednesday',
            Thu: 'Thursday',
            Fri: 'Friday',
            Sat: 'Saturday',
            Sun: 'Sunday',
        };
        const attendedDays = personAttendance
            ? personAttendance.split(',').map((s) => dayMap[s.trim()] || s.trim())
            : [];
        return attendedDays.includes(targetDayLabel) ? 'office' : 'home';
    };

    const groups = useMemo(() => {
        const group = { office: [] as any[], home: [] as any[], away: [] as any[] };
        teamData.forEach((teamMember) => {
            const attendance = getMemberWeek(teamMember.Initials);
            const status = getStatus(attendance, teamMember.Initials);
            if (status === 'office') group.office.push(teamMember);
            else if (status === 'home') group.home.push(teamMember);
            else group.away.push(teamMember);
        });
        return group;
    }, [attendanceRecords, teamData, combinedLeaveRecords, targetDayLabel, targetDayStr, weekStartToUse]);

    useImperativeHandle(ref, () => ({
        setWeek: () => { },
        focusTable: () => { },
    }));


    const toggleDay = (weekStart: string, day: string) => {
        setLocalAttendance((prev) => {
            const days = prev[weekStart] || [];
            const exists = days.includes(day);
            const updated = exists ? days.filter((d) => d !== day) : [...days, day];
            return { ...prev, [weekStart]: updated };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        for (const weekStart of [currentWeekStart, nextWeekStart]) {
            const days = localAttendance[weekStart]?.join(',') || '';
            await onSave(weekStart, days);
        }
        setSaving(false);
    };

    const renderWeek = (label: string, weekStart: string) => {
        const weekStartDate = new Date(weekStart + 'T00:00:00');
        const attendanceMap: Record<string, string[]> = {};
        const dayMap: Record<string, string> = {
            Mon: 'Monday',
            Tue: 'Tuesday',
            Wed: 'Wednesday',
            Thu: 'Thursday',
            Fri: 'Friday',
            Sat: 'Saturday',
            Sun: 'Sunday',
        };
        attendanceRecords
            .filter((r) => r.Week_Start === weekStart)
            .forEach((rec) => {
                attendanceMap[rec.Initials] = rec.Attendance_Days
                    ? rec.Attendance_Days.split(',').map((d) => dayMap[d.trim()] || d.trim())
                    : [];
            });

        const cellStyle = {
            width: 32,
            height: 32,
            textAlign: 'center' as const,
            border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.light.border}`,
        };

        return (
            <div className={sectionStyle} key={weekStart}>
                <div style={headerStyle(isDarkMode)}>{label}</div>
                <div style={contentStyle(isDarkMode)}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                            <tr>
                                <th></th>
                                {weekDays.map((d) => (
                                    <th key={d} style={{ ...cellStyle, fontSize: 12 }}>{d.slice(0, 3)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {teamData.map((member) => (
                                <tr key={member.Initials}>
                                    <td style={{ ...cellStyle, fontWeight: 600 }}>{member.Initials}</td>
                                    {weekDays.map((day, idx) => {
                                        const date = new Date(weekStartDate);
                                        date.setDate(date.getDate() + idx);
                                        const iso = formatDateLocal(date);
                                        const onLeave = combinedLeaveRecords.some(
                                            (leave) =>
                                                leave.status === 'booked' &&
                                                leave.person.trim().toLowerCase() === member.Initials.toLowerCase() &&
                                                iso >= leave.start_date &&
                                                iso <= leave.end_date
                                        );
                                        if (onLeave) {
                                            return (
                                                <td key={day} style={cellStyle}>
                                                    <Icon iconName="Airplane" />
                                                </td>
                                            );
                                        }
                                        if (member.Initials === userInitials) {
                                            const checked = localAttendance[weekStart]?.includes(day);
                                            const icon = checked ? 'CityNext' : 'Home';
                                            return (
                                                <td
                                                    key={day}
                                                    style={{ ...cellStyle, cursor: 'pointer', backgroundColor: checked ? `${colours.highlight}22` : undefined }}
                                                    onClick={() => toggleDay(weekStart, day)}
                                                >
                                                    <Icon iconName={icon} />
                                                </td>
                                            );
                                        }
                                        const days = attendanceMap[member.Initials] || [];
                                        const icon = days.includes(day) ? 'CityNext' : 'Home';
                                        return (
                                            <td key={day} style={cellStyle}>
                                                <Icon iconName={icon} />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className={summaryGrid}>
                <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon iconName="CityNext" /> Office
                    </div>
                    <div className={avatarRow}>
                        {groups.office.map((m) => (
                            <TooltipHost key={m.Initials} content={getMemberWeek(m.Initials)}>
                                <div className={avatarStyle} style={{ background: colours.blue }} title={m.Nickname || m.First}>
                                    {m.Initials.toUpperCase()}
                                </div>
                            </TooltipHost>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon iconName="Home" /> WFH
                    </div>
                    <div className={avatarRow}>
                        {groups.home.map((m) => (
                            <TooltipHost key={m.Initials} content={getMemberWeek(m.Initials)}>
                                <div className={avatarStyle} style={{ background: colours.highlight }} title={m.Nickname || m.First}>
                                    {m.Initials.toUpperCase()}
                                </div>
                            </TooltipHost>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon iconName="Airplane" /> Away
                    </div>
                    <div className={avatarRow}>
                        {groups.away.map((m) => (
                            <TooltipHost key={m.Initials} content={getMemberWeek(m.Initials)}>
                                <div className={avatarStyle} style={{ background: colours.greyText }} title={m.Nickname || m.First}>
                                    {m.Initials.toUpperCase()}
                                </div>
                            </TooltipHost>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ fontSize: 12, color: colours.greyText, marginBottom: 8 }}>Showing: {targetDayLabel}</div>
            {renderWeek('This Week', currentWeekStart)}
            {renderWeek('Next Week', nextWeekStart)}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
                <DefaultButton text={saving ? 'Saving...' : 'Save'} onClick={handleSave} disabled={saving} />
            </div>
        </div>
    );
});

export default AttendanceConfirmPanel;
