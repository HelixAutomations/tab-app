import React, {
// invisible change 2
    useMemo,
    forwardRef,
    useImperativeHandle,
    useState,
    useRef,
} from 'react';
import { Icon, TooltipHost, mergeStyles, DefaultButton } from '@fluentui/react';
import { sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';
import { colours } from '../../app/styles/colours';
import { cardStyles } from '../instructions/componentTokens';
import { componentTokens } from '../../app/styles/componentTokens';
import AttendanceConfirmPanel from './AttendanceConfirmPanel';
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
    isLoadingAttendance: boolean;
    isLoadingAnnualLeave: boolean;
    attendanceError: string | null;
    annualLeaveError: string | null;
    attendanceRecords: AttendanceRecord[];
    teamData: any[];
    annualLeaveRecords: AnnualLeaveRecord[];
    futureLeaveRecords: AnnualLeaveRecord[];
    userData: any;
    onAttendanceUpdated?: (updatedRecords: AttendanceRecord[]) => void;
}

// Lightweight collapsible section reused from Attendance.tsx
const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [collapsed, setCollapsed] = React.useState(false);
    const toggleCollapse = () => setCollapsed(!collapsed);

    return (
        <div
            style={{
                marginBottom: '20px',
                boxShadow: (cardStyles.root as React.CSSProperties).boxShadow,
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderBottomLeftRadius: (cardStyles.root as React.CSSProperties).borderRadius,
                borderBottomRightRadius: (cardStyles.root as React.CSSProperties).borderRadius,
                overflow: 'hidden',
            }}
        >
            <div
                onClick={toggleCollapse}
                style={{
                    backgroundColor: colours.darkBlue,
                    color: '#ffffff',
                    border: `1px solid ${colours.light.border}`,
                    padding: '6px 10px',
                    minHeight: '30px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '16px',
                    borderRadius: componentTokens.stepHeader.base.borderRadius,
                }}
            >
                <span style={{ fontWeight: 600 }}>{title}</span>
                <Icon
                    iconName="ChevronDown"
                    styles={{
                        root: {
                            fontSize: '16px',
                            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                            transition: 'transform 0.3s ease',
                        },
                    }}
                />
            </div>
            <div
                style={{
                    padding: componentTokens.summaryPane.base.padding,
                    backgroundColor: colours.light.sectionBackground,
                    boxShadow: componentTokens.summaryPane.base.boxShadow,
                    borderBottomLeftRadius: (cardStyles.root as React.CSSProperties).borderRadius,
                    borderBottomRightRadius: (cardStyles.root as React.CSSProperties).borderRadius,
                    maxHeight: collapsed ? 0 : '2000px',
                    opacity: collapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease, opacity 0.3s ease',
                }}
            >
                {children}
            </div>
        </div>
    );
};

const avatarStyle = mergeStyles({
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '10px',
    color: '#ffffff',
});

const groupContainer = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    alignItems: 'flex-start',
});

const snakeGroup = (isDark: boolean) =>
    mergeStyles({
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        alignItems: 'center',
        minHeight: '40px',
        padding: '4px 8px',
        borderRadius: '20px',
        border: `1px solid ${isDark ? 'rgba(125, 211, 252, 0.24)' : colours.light.border}`,
        backgroundColor: isDark ? 'rgba(54,144,206,0.2)' : colours.highlightBlue,
    });

const snakeContainer = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    });

const AttendanceCompact = forwardRef<
    { focusTable: () => void; setWeek: (week: 'current' | 'next') => void },
    AttendanceProps
>(
    (
        {
            isDarkMode,
            isLoadingAttendance,
            attendanceError,
            annualLeaveError,
            attendanceRecords,
            teamData,
            annualLeaveRecords,
            futureLeaveRecords,
            userData,
            onAttendanceUpdated,
        },
        ref
    ) => {
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const londonNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const afterFiveThirty =
            londonNow.getHours() > 17 || (londonNow.getHours() === 17 && londonNow.getMinutes() >= 30);
        const nextDay = new Date(londonNow);
        if (afterFiveThirty) nextDay.setDate(londonNow.getDate() + 1);

        const targetDayLabel = weekDays[nextDay.getDay()];

        const formatDateLocal = (d: Date): string => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const targetDayStr = formatDateLocal(nextDay);

        const [panelOpen, setPanelOpen] = useState(false);
        const attendanceRef = useRef<{ focusTable: () => void; setWeek: (week: 'current' | 'next') => void }>(null);

        const getMondayOfCurrentWeek = (): Date => {
            const now = new Date();
            const day = now.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            return monday;
        };

        const currentWeekStart = formatDateLocal(getMondayOfCurrentWeek());
        const nextWeekStart = formatDateLocal(new Date(getMondayOfCurrentWeek().setDate(getMondayOfCurrentWeek().getDate() + 7)));
        const useNextWeek =
            (londonNow.getDay() === 5 && afterFiveThirty) ||
            londonNow.getDay() === 6 ||
            londonNow.getDay() === 0;
        const weekStartToUse = useNextWeek ? nextWeekStart : currentWeekStart;

        const isConfirmedForWeek = (weekStart: string) =>
            attendanceRecords.some(
                (rec) =>
                    rec.Initials === (userData?.[0]?.Initials || '') &&
                    rec.Week_Start === weekStart &&
                    rec.Confirmed_At !== null
            );

        const currentConfirmed = isConfirmedForWeek(currentWeekStart);

        const openConfirmationPanel = () => {
            setPanelOpen(true);
            setTimeout(() => attendanceRef.current?.setWeek('current'), 0);
        };

        useImperativeHandle(ref, () => ({
            focusTable: () => {
                setPanelOpen(true);
                setTimeout(() => attendanceRef.current?.focusTable(), 0);
            },
            setWeek: (week: 'current' | 'next') => {
                setPanelOpen(true);
                setTimeout(() => attendanceRef.current?.setWeek(week), 0);
            },
            confirmRelevantWeek: openConfirmationPanel,
        }));

        const combinedLeaveRecords = useMemo(
            () => [...annualLeaveRecords, ...futureLeaveRecords],
            [annualLeaveRecords, futureLeaveRecords]
        );

        const userInitials = userData?.[0]?.Initials || '';
        const useLocalData =
            process.env.REACT_APP_USE_LOCAL_DATA === 'true' ||
            window.location.hostname === 'localhost';

        const saveAttendance = async (weekStart: string, attendanceDays: string) => {
            const firstName = teamData.find((t) => t.Initials === userInitials)?.First || 'Unknown';

            if (useLocalData) {
                const newRecord = {
                    Attendance_ID: 0,
                    Entry_ID: 0,
                    First_Name: firstName,
                    Initials: userInitials,
                    Level: teamData.find((t) => t.Initials === userInitials)?.Level || '',
                    Week_Start: weekStart,
                    Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6))
                        .toISOString()
                        .split('T')[0],
                    ISO_Week: getISOWeek(new Date(weekStart)),
                    Attendance_Days: attendanceDays,
                    Confirmed_At: new Date().toISOString(),
                } as AttendanceRecord;
                onAttendanceUpdated && onAttendanceUpdated([newRecord]);
                return;
            }

            try {
                const response = await fetch(
                    `/api/attendance/updateAttendance`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ initials: userInitials, weekStart, attendanceDays }),
                    }
                );
                if (!response.ok) throw new Error(`Failed to save attendance: ${response.status}`);
                const json = await response.json();
                if (onAttendanceUpdated && json && json.success && json.record) {
                    const rec = json.record;
                    const newRecord = {
                        Attendance_ID: rec.Attendance_ID ?? 0,
                        Entry_ID: rec.Entry_ID ?? 0,
                        First_Name: rec.First_Name || firstName,
                        Initials: rec.Initials || userInitials,
                        Level: teamData.find((t) => t.Initials === (rec.Initials || userInitials))?.Level || '',
                        Week_Start: rec.Week_Start || weekStart,
                        Week_End: rec.Week_End || new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6))
                            .toISOString()
                            .split('T')[0],
                        ISO_Week: rec.ISO_Week ?? getISOWeek(new Date(rec.Week_Start || weekStart)),
                        Attendance_Days: rec.Attendance_Days || attendanceDays,
                        Confirmed_At: rec.Confirmed_At || new Date().toISOString(),
                    } as AttendanceRecord;
                    onAttendanceUpdated([newRecord]);
                }
            } catch (error) {
                console.error('Error saving attendance:', error);
                if (process.env.REACT_APP_ATTENDANCE_FALLBACK_LOCAL === 'true') {
                    console.warn('⚠️ Falling back to local attendance update');
                    const newRecord = {
                        Attendance_ID: 0,
                        Entry_ID: 0,
                        First_Name: firstName,
                        Initials: userInitials,
                        Level: teamData.find((t) => t.Initials === userInitials)?.Level || '',
                        Week_Start: weekStart,
                        Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6))
                            .toISOString()
                            .split('T')[0],
                        ISO_Week: getISOWeek(new Date(weekStart)),
                        Attendance_Days: attendanceDays,
                        Confirmed_At: new Date().toISOString(),
                    } as AttendanceRecord;
                    onAttendanceUpdated && onAttendanceUpdated([newRecord]);
                } else {
                    alert('Failed to save attendance');
                }
            }
        };

        const getMemberWeek = (initials: string): string => {
            const records = attendanceRecords.filter(
                (rec) => rec.Initials === initials && rec.Week_Start === weekStartToUse
            );
            return (
                records
                    .map((rec) => rec.Attendance_Days || '')
                    .filter(Boolean)
                    .join(',') || 'None'
            );
        };

        const getStatus = (
            personAttendance: string,
            initials: string
        ): 'office' | 'home' | 'away' => {
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
            };
            const attendedDays = personAttendance
                ? personAttendance
                    .split(',')
                    .map((s) => dayMap[s.trim()] || s.trim())
                : [];
            return attendedDays.includes(targetDayLabel) ? 'office' : 'home';
        };

        const groups = useMemo(() => {
            const group = { office: [] as any[], home: [] as any[], away: [] as any[] };
            teamData.forEach((teamMember) => {
                const records = attendanceRecords.filter(
                    (rec) =>
                        rec.Initials === teamMember.Initials &&
                        rec.Week_Start === weekStartToUse
                );
                const attendanceDays = records
                    .map((rec) => rec.Attendance_Days || '')
                    .filter(Boolean)
                    .join(',');
                const status = getStatus(attendanceDays, teamMember.Initials);
                if (status === 'office') group.office.push(teamMember);
                else if (status === 'home') group.home.push(teamMember);
                else group.away.push(teamMember);
            });
            return group;
        }, [attendanceRecords, teamData, getStatus, weekStartToUse, targetDayLabel, targetDayStr]);

        const renderAvatar = (member: any, status: 'office' | 'home' | 'away') => {
            let background = colours.grey;
            if (status === 'office') background = colours.blue;
            else if (status === 'home') background = colours.highlight;
            else background = colours.greyText;
            const week = getMemberWeek(member.Initials);
            return (
                <TooltipHost content={week} key={`tt-${member.Initials}`}>
                    <div
                        key={member.Initials} // Inner key kept for clarity though outer TooltipHost has key
                        className={avatarStyle}
                        style={{ background }}
                        title={member.Nickname || member.First}
                    >
                        {member.Initials.toUpperCase()}
                    </div>
                </TooltipHost>
            );
        };

        const renderGroup = (
            members: any[],
            status: 'office' | 'home' | 'away',
            icon: string
        ) => {
            const perRow = 6;
            const rows = [] as any[];
            for (let i = 0; i < members.length; i += perRow) {
                rows.push(members.slice(i, i + perRow));
            }
            return (
                <div className={snakeGroup(isDarkMode)}>
                    <Icon iconName={icon} styles={{ root: { fontSize: 20, marginRight: 4 } }} />
                    <div className={snakeContainer}>
                        {rows.map((row, idx) => {
                            const rowKey = `${status}-row-${idx}-${row.map((m: any) => m.Initials).join('-')}`;
                            return (
                                <div
                                    key={rowKey}
                                    style={{ display: 'flex', flexDirection: idx % 2 ? 'row-reverse' : 'row' }}
                                >
                                    {row.map((m: any) => renderAvatar(m, status))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        };

        return (
            <>
            <CollapsibleSection title="Attendance">
                {isLoadingAttendance ? (
                    <div>Loading...</div>
                ) : attendanceError || annualLeaveError ? (
                    <div>{attendanceError || annualLeaveError}</div>
                ) : (
                            <>
                                <div className={groupContainer}>
                                        {renderGroup(groups.office, 'office', 'CityNext')}
                                    {renderGroup(groups.home, 'home', 'Home')}
                                    {renderGroup(groups.away, 'away', 'Airplane')}
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '12px', color: colours.greyText }}>
                                        Showing: {targetDayLabel}
                                    </div>
                                    {!currentConfirmed && (
                                        <div style={{ marginTop: '8px' }}>
                                            <DefaultButton text="Confirm Attendance" onClick={openConfirmationPanel} styles={sharedDefaultButtonStyles} />
                                        </div>
                                    )}
                            </>
                )}
            </CollapsibleSection>
            <BespokePanel
            isOpen={panelOpen}
            onClose={() => setPanelOpen(false)}
            title="Confirm Attendance"
        >
            <AttendanceConfirmPanel
                isDarkMode={isDarkMode}
                attendanceRecords={attendanceRecords}
                teamData={teamData}
                annualLeaveRecords={annualLeaveRecords}
                futureLeaveRecords={futureLeaveRecords}
                userData={userData}
                onSave={saveAttendance}
            />
        </BespokePanel>
        </>
        );
    });

export default AttendanceCompact;

function getISOWeek(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return Math.round(((d.getTime() - week1.getTime()) / 86400000 + 1) / 7) + 1;
}
