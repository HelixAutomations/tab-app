// Attendance.tsx

import React from 'react';
import { mergeStyles, Icon, TooltipHost, Text } from '@fluentui/react';

//
// Interfaces for our props and data types
//
interface LeaveRecord {
  request_id: number;
  person: string;
  start_date: string; // ISO date string
  end_date: string;
  reason: string;
  status: string;
  days_taken: number;
  leave_type: string;
  rejection_notes?: string | null;
  AOW?: string;
  approvers?: string[];
}

interface AttendanceRecord {
  name: string;
  confirmed: boolean;
  attendingToday: boolean;
}

interface TeamMember {
  First: string;
  Initials: string;
  Nickname: string;
}

interface AttendanceProps {
  attendance: AttendanceRecord[];
  team: TeamMember[];
  annualLeave: LeaveRecord[];
  futureLeave: LeaveRecord[];
  /**
   * Optional: the starting date (Monday) of the week to display.
   * If not provided, the component will calculate the current week’s Monday.
   */
  weekStart?: Date;
}

//
// The Attendance component builds a table view for Monday–Friday.
//
const Attendance: React.FC<AttendanceProps> = ({
  attendance,
  team,
  annualLeave,
  futureLeave,
  weekStart,
}) => {
  // Helper to compute the Monday of the week given a date
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday (0)
    return new Date(date.setDate(diff));
  };

  // Determine the Monday for the week to display.
  const monday = weekStart ? new Date(weekStart) : getMonday(new Date());

  // Build an array for the five workdays (Monday–Friday)
  const weekDays: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  // Helper function: given a team member’s initials and a date,
  // check if they are on leave (from either annual or future leave).
  const isOnLeave = (initials: string, date: Date): boolean => {
    // Combine annual and future leave records, and only consider booked leave.
    const allLeave = [...annualLeave, ...futureLeave].filter(leave => leave.status === 'booked');
    return allLeave.some(leave => {
      if (leave.person.toLowerCase() !== initials.toLowerCase()) return false;
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      // If the date falls between start and end (inclusive), then the member is on leave.
      return date >= start && date <= end;
    });
  };

  // Get a default status for a team member based on today’s attendance record.
  // (If not found, we assume “Office”.)
  const getDefaultStatus = (member: TeamMember): 'Office' | 'WFH' => {
    const record = attendance.find(rec => rec.name.toLowerCase() === member.First.toLowerCase());
    return record ? (record.attendingToday ? 'Office' : 'WFH') : 'Office';
  };

  // For each team member and for each day, determine their status.
  // If they are on leave, status is “Out”. Otherwise, for the current day
  // we use the actual attendance record; for other days we use the default.
  const getStatusForDay = (member: TeamMember, date: Date): 'Office' | 'WFH' | 'Out' => {
    if (isOnLeave(member.Initials, date)) {
      return 'Out';
    }
    // Check if this day is today
    const today = new Date();
    if (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    ) {
      const record = attendance.find(rec => rec.name.toLowerCase() === member.First.toLowerCase());
      return record ? (record.attendingToday ? 'Office' : 'WFH') : getDefaultStatus(member);
    }
    return getDefaultStatus(member);
  };

  // Basic styling for the table
  const tableClass = mergeStyles({
    width: '100%',
    borderCollapse: 'collapse',
  });

  const thClass = mergeStyles({
    borderBottom: '2px solid #ccc',
    padding: '8px',
    textAlign: 'left',
    backgroundColor: '#f3f3f3',
  });

  const tdClass = mergeStyles({
    borderBottom: '1px solid #eee',
    padding: '8px',
    textAlign: 'center',
  });

  // Returns an icon (with color) for the given status.
  const getStatusIcon = (status: 'Office' | 'WFH' | 'Out') => {
    switch (status) {
      case 'Office':
        return <Icon iconName="OfficeApps" style={{ color: 'green' }} />;
      case 'WFH':
        return <Icon iconName="Home" style={{ color: 'blue' }} />;
      case 'Out':
        return <Icon iconName="Airplane" style={{ color: 'red' }} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <Text variant="xLarge" styles={{ root: { marginBottom: '16px' } }}>
        Weekly Attendance
      </Text>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Team Member</th>
            {weekDays.map((day, index) => (
              <th key={index} className={thClass}>
                {day.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {team.map(member => (
            <tr key={member.Initials}>
              <td className={tdClass} style={{ textAlign: 'left' }}>
                {member.Nickname || member.First}
              </td>
              {weekDays.map((day, index) => {
                const status = getStatusForDay(member, day);
                const tooltipContent =
                  status === 'Office'
                    ? 'In Office'
                    : status === 'WFH'
                    ? 'Work From Home'
                    : 'Out on Leave';
                return (
                  <td key={index} className={tdClass}>
                    <TooltipHost content={tooltipContent}>
                      {getStatusIcon(status)}
                    </TooltipHost>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Attendance;
