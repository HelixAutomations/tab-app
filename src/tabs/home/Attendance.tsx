// src/tabs/home/Attendance.tsx

import React, { useMemo } from 'react';
import {
  mergeStyles,
  Text,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  Persona,
  Icon,
} from '@fluentui/react';
import { PersonaPresence, PersonaSize } from '@fluentui/react/lib/Persona';
import InAttendanceImg from '../../assets/in_attendance.png';
import WfhImg from '../../assets/wfh.png';
import OutImg from '../../assets/outv2.png';

import { colours } from '../../app/styles/colours';

// ---------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------

interface AttendanceProps {
  isDarkMode: boolean;
  isLoadingAttendance: boolean;
  isLoadingAnnualLeave: boolean;
  attendanceError: string | null;
  annualLeaveError: string | null;
  attendanceRecords: any[];
  teamData: any[];

  // If you have a dedicated type for these, use it here.
  annualLeaveRecords: AnnualLeaveRecord[];
  futureLeaveRecords: AnnualLeaveRecord[];
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

// ---------------------------------------------------
// Attendance Component
// ---------------------------------------------------

const Attendance: React.FC<AttendanceProps> = ({
  isDarkMode,
  isLoadingAttendance,
  isLoadingAnnualLeave,
  attendanceError,
  annualLeaveError,
  attendanceRecords,
  teamData,
  annualLeaveRecords,
  futureLeaveRecords,
}) => {
  // -------------------------------------------
  // Utility: Combine annual leave arrays
  // -------------------------------------------
  const combinedLeaveRecords = useMemo(() => {
    return [...annualLeaveRecords, ...futureLeaveRecords];
  }, [annualLeaveRecords, futureLeaveRecords]);

  // -------------------------------------------
  // Utility: Get Monday of current week
  // -------------------------------------------
  const getMondayOfCurrentWeek = (): Date => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Sunday-> -6, Monday-> 0, Tuesday-> -1, etc.
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  };

  // -------------------------------------------
  // Utility: Build a key for the current week
  // -------------------------------------------
  const getCurrentWeekKey = (): string => {
    const monday = getMondayOfCurrentWeek();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const mondayStr = monday.toLocaleDateString('en-GB', options);
    const sundayStr = sunday.toLocaleDateString('en-GB', options);

    const mondayName = monday.toLocaleDateString('en-GB', { weekday: 'long' });
    const sundayName = sunday.toLocaleDateString('en-GB', { weekday: 'long' });

    return `${mondayName}, ${mondayStr} - ${sundayName}, ${sundayStr}`;
  };

  const currentWeekKey = getCurrentWeekKey();
  const currentWeekMonday = getMondayOfCurrentWeek();
  const todayStr = new Date().toISOString().split('T')[0];

  // -------------------------------------------
  // Days of interest for attendance
  // -------------------------------------------
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // -------------------------------------------
  // Derive attendance per person for this week
  // -------------------------------------------
  const attendancePersons = useMemo(() => {
    if (!attendanceRecords || !Array.isArray(attendanceRecords)) return [];
    return attendanceRecords
      .map((rec: any) => {
        const teamMember = teamData.find(
          (member: any) => member.First.toLowerCase() === rec.name.toLowerCase()
        );
        return {
          name: rec.name,
          initials: teamMember ? teamMember.Initials : rec.name,
          nickname: teamMember ? teamMember.Nickname : rec.name,
          attendance: rec.weeks && rec.weeks[currentWeekKey] ? rec.weeks[currentWeekKey].attendance : '',
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [attendanceRecords, teamData, currentWeekKey]);

  // -------------------------------------------
  // Utility: For each cell, figure out in/out/wfh
  // -------------------------------------------
  const getCellStatus = (
    personAttendance: string,
    personInitials: string,
    day: string,
    cellDateStr: string
  ): 'in' | 'wfh' | 'out' => {
    // Check if user is out on annual leave
    const isOnLeave = combinedLeaveRecords.some(
      (leave) =>
        leave.status === 'booked' &&
        leave.person.trim().toLowerCase() === personInitials.trim().toLowerCase() &&
        cellDateStr >= leave.start_date &&
        cellDateStr <= leave.end_date
    );
    if (isOnLeave) {
      return 'out';
    }
    // Otherwise, check if 'day' is in the person's recorded attendance
    const attendedDays = personAttendance
      ? personAttendance.split(',').map((s: string) => s.trim())
      : [];
    if (attendedDays.includes(day)) {
      return 'in';
    }
    return 'wfh';
  };

  // -------------------------------------------
  // Sub-component: Table cell icon
  // -------------------------------------------
  const AttendanceCell: React.FC<{ status: 'in' | 'wfh' | 'out'; highlight?: boolean }> = ({
    status,
    highlight = false,
  }) => {
    let iconName = 'Home'; // fallback
    if (status === 'in') {
      iconName = 'Accept';
    } else if (status === 'out') {
      iconName = 'Airplane';
    }
    return (
      <Icon
        iconName={iconName}
        styles={{ root: { fontSize: '24px', color: highlight ? '#fff' : '#666' } }}
      />
    );
  };

  // -------------------------------------------
  // Sub-component: Persona header
  // -------------------------------------------
  const AttendancePersonaHeader: React.FC<{
    person: { name: string; initials: string; nickname: string; attendance: string };
  }> = ({ person }) => {
    // figure out person's status for "today"
    const now = new Date();
    let diffDays = Math.floor((now.getTime() - currentWeekMonday.getTime()) / (1000 * 3600 * 24));
    // default to Monday
    let todayWeekday = 'Monday';
    if (diffDays >= 0 && diffDays < 5) {
      todayWeekday = weekDays[diffDays];
    }
    const currentStatus = getCellStatus(person.attendance, person.initials, todayWeekday, todayStr);

    // pick an image
    let imageUrl = WfhImg;
    if (currentStatus === 'in') {
      imageUrl = InAttendanceImg;
    } else if (currentStatus === 'out') {
      imageUrl = OutImg;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <div
          style={{
            backgroundColor: isDarkMode ? colours.dark.grey || '#3a3a3a' : colours.light.grey || '#F4F4F6',
            padding: '4px 8px',
            borderRadius: '8px',
          }}
        >
          <Text
            variant="small"
            styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}
          >
            {person.nickname || person.name}
          </Text>
        </div>
        <Persona
          text=""
          imageUrl={imageUrl}
          size={PersonaSize.size40}
          hidePersonaDetails
          styles={{ root: { margin: '0 auto' } }}
        />
      </div>
    );
  };

  // -------------------------------------------
  // Subtle highlight colors for "today" row
  // -------------------------------------------
  const inHighlight = 'rgba(16,124,16,0.15)'; // subtle green tint
  const wfhHighlight = 'rgba(54,144,206,0.15)'; // subtle blue tint
  const outHighlight = 'rgba(214,85,65,0.15)'; // subtle red tint

  // -------------------------------------------
  // The main returned JSX
  // -------------------------------------------
  return (
    <div style={{ marginBottom: '40px' }}>
      <div
        className={mergeStyles({
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
          padding: '20px 20px 20px 20px',
          borderRadius: '12px',
          boxShadow: isDarkMode
            ? `0 4px 12px ${colours.dark.border}`
            : `0 4px 12px ${colours.light.border}`,
          position: 'relative',
          width: '100%',
        })}
      >
        {isLoadingAttendance || isLoadingAnnualLeave ? (
          <Spinner label="Loading attendance..." size={SpinnerSize.medium} />
        ) : attendanceError || annualLeaveError ? (
          <MessageBar messageBarType={MessageBarType.error}>
            {attendanceError || annualLeaveError}
          </MessageBar>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: '0',
              border: `1px solid ${
                isDarkMode ? colours.dark.border : colours.light.border
              }`,
              borderRadius: '8px',
              overflow: 'hidden',
              animation: 'fadeIn 0.5s ease-in-out',
            }}
          >
            <thead>
              <tr>
                <th style={{ border: '1px solid transparent', padding: '8px' }}></th>
                {attendancePersons.map((person) => (
                  <th
                    key={person.initials}
                    style={{
                      border: `1px solid ${
                        isDarkMode ? colours.dark.border : colours.light.border
                      }`,
                      padding: '8px',
                      textAlign: 'center',
                      backgroundColor: isDarkMode
                        ? colours.dark.sectionBackground
                        : colours.light.sectionBackground,
                    }}
                  >
                    <AttendancePersonaHeader person={person} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day, index) => {
                // figure out which date this "day" is
                const dayDate = new Date(currentWeekMonday);
                dayDate.setDate(currentWeekMonday.getDate() + index);
                const cellDateStr = dayDate.toISOString().split('T')[0];

                // is this the current day?
                const isCurrentDay = cellDateStr === todayStr;

                return (
                  <tr key={day} style={isCurrentDay ? { backgroundColor: '#f0f8ff' } : {}}>
                    <td
                      style={{
                        border: `1px solid ${
                          isDarkMode ? colours.dark.border : colours.light.border
                        }`,
                        padding: '8px',
                        fontWeight: 'bold',
                        backgroundColor: colours.reporting.tableHeaderBackground,
                      }}
                    >
                      {day}
                    </td>
                    {attendancePersons.map((person) => {
                      const status = getCellStatus(
                        person.attendance,
                        person.initials,
                        day,
                        cellDateStr
                      );
                      // highlight today's cell with tinted background
                      const cellBg = isCurrentDay
                        ? status === 'in'
                          ? inHighlight
                          : status === 'wfh'
                          ? wfhHighlight
                          : outHighlight
                        : isDarkMode
                        ? colours.dark.sectionBackground
                        : colours.light.sectionBackground;

                      return (
                        <td
                          key={person.initials}
                          style={{
                            border: `1px solid ${
                              isDarkMode ? colours.dark.border : colours.light.border
                            }`,
                            padding: '8px',
                            textAlign: 'center',
                            backgroundColor: cellBg,
                          }}
                        >
                          <AttendanceCell status={status} highlight={isCurrentDay} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Attendance;
