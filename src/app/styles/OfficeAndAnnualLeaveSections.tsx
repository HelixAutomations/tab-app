// src/components/OfficeAndAnnualLeaveSections.tsx

import React, { useMemo } from 'react';
import {
  Stack,
  Text,
  Icon,
  TooltipHost,
  mergeStyles,
} from '@fluentui/react';

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

interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

interface OfficeAndAnnualLeaveSectionsProps {
  attendanceRecords: AttendanceRecord[];
  teamData: TeamMember[];
  annualLeaveRecords: AnnualLeaveRecord[];
}

// Grid container for both sections
const gridContainerStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '16px',
  paddingTop: '8px',
});

// Section header style
const sectionHeaderStyle = mergeStyles({
  marginBottom: '8px',
  fontWeight: '600',
});

// Avatar style
const avatarStyle = mergeStyles({
  borderRadius: '50%',
  width: '60px',
  height: '60px',
  lineHeight: '60px',
  textAlign: 'center',
  backgroundColor: '#fafafa',
  border: '2px solid #0078d4',
  display: 'inline-block',
  position: 'relative',
});

// Container style for each card
const cardContainerStyle = mergeStyles({
  position: 'relative',
  textAlign: 'center',
  cursor: 'pointer',
  padding: '8px',
});

// Badge for attendance status – green for in office, blue for WFH
const statusBadgeStyle = (isOffice: boolean) =>
  mergeStyles({
    marginTop: '4px',
    padding: '2px 4px',
    borderRadius: '4px',
    backgroundColor: isOffice ? '#28a745' : '#0078d4',
    color: '#fff',
    fontSize: '10px',
  });

// Badge for annual leave details
const annualLeaveBadgeStyle = mergeStyles({
  marginTop: '4px',
  padding: '2px 4px',
  borderRadius: '4px',
  backgroundColor: '#e81123',
  color: '#fff',
  fontSize: '10px',
});

// Overlay icon style for annual leave
const overlayIconStyle = mergeStyles({
  position: 'absolute',
  bottom: '4px',
  right: '4px',
  backgroundColor: '#fff',
  borderRadius: '50%',
  padding: '2px',
});

// Office Attendance Card Component
const OfficeAttendanceCard: React.FC<{
  teamMember: TeamMember;
  record: AttendanceRecord;
}> = ({ teamMember, record }) => {
  // Dummy tooltip that lists other days the person is attending in the week.
  // In a production scenario, this data would be provided by the backend.
  const tooltipText = record.attendingToday
    ? 'Attending in office: Mon, Wed, Fri'
    : 'Working from home: Tue, Thu';
  const statusText = record.attendingToday ? 'In Office' : 'WFH';

  return (
    <TooltipHost content={tooltipText}>
      <div className={cardContainerStyle}>
        <div className={avatarStyle}>
          <Text variant="xLarge">{teamMember.Nickname.charAt(0)}</Text>
        </div>
        <div>
          <Text variant="small">{teamMember.Nickname}</Text>
        </div>
        <div className={statusBadgeStyle(record.attendingToday)}>
          <Text variant="small">{statusText}</Text>
        </div>
      </div>
    </TooltipHost>
  );
};

// Annual Leave Card Component
const AnnualLeaveCard: React.FC<{
  teamMember: TeamMember;
  leave: AnnualLeaveRecord;
}> = ({ teamMember, leave }) => {
  const start = new Date(leave.start_date);
  const end = new Date(leave.end_date);
  const leavePeriod = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;

  return (
    <TooltipHost content={`${leave.reason} (${leave.status})`}>
      <div className={cardContainerStyle}>
        <div className={avatarStyle}>
          <Icon iconName="Airplane" styles={{ root: { fontSize: 24, color: '#e81123' } }} />
          <div className={overlayIconStyle}>
            <Text variant="small">AL</Text>
          </div>
        </div>
        <div>
          <Text variant="small">{teamMember.Nickname}</Text>
        </div>
        <div className={annualLeaveBadgeStyle}>
          <Text variant="small">{leavePeriod}</Text>
        </div>
      </div>
    </TooltipHost>
  );
};

const OfficeAndAnnualLeaveSections: React.FC<OfficeAndAnnualLeaveSectionsProps> = ({
  attendanceRecords,
  teamData,
  annualLeaveRecords,
}) => {
  // Map attendance records to team members by matching name (ignoring case)
  const officePersons = useMemo(() => {
    return teamData
      .map((member) => {
        const record = attendanceRecords.find(
          (r) => r.name.toLowerCase() === member.First.toLowerCase()
        );
        return record ? { member, record } : null;
      })
      .filter((item) => item !== null) as { member: TeamMember; record: AttendanceRecord }[];
  }, [attendanceRecords, teamData]);

  // Map annual leave records to team members by matching initials or beginning of name
  const annualLeavePersons = useMemo(() => {
    return annualLeaveRecords
      .map((leave) => {
        const member = teamData.find(
          (m) =>
            m.Initials.toLowerCase() === leave.person.toLowerCase() ||
            m.First.toLowerCase().startsWith(leave.person.toLowerCase())
        );
        return member ? { member, leave } : null;
      })
      .filter((item) => item !== null) as { member: TeamMember; leave: AnnualLeaveRecord }[];
  }, [annualLeaveRecords, teamData]);

  return (
    <Stack tokens={{ childrenGap: 32 }}>
      <Stack>
        <Text variant="large" className={sectionHeaderStyle}>
          In the Office Today
        </Text>
        <div className={gridContainerStyle}>
          {officePersons.map(({ member, record }, idx) => (
            <OfficeAttendanceCard key={idx} teamMember={member} record={record} />
          ))}
        </div>
      </Stack>
      <Stack>
        <Text variant="large" className={sectionHeaderStyle}>
          Out or On Annual Leave Today
        </Text>
        <div className={gridContainerStyle}>
          {annualLeavePersons.map(({ member, leave }, idx) => (
            <AnnualLeaveCard key={idx} teamMember={member} leave={leave} />
          ))}
        </div>
      </Stack>
    </Stack>
  );
};

export default OfficeAndAnnualLeaveSections;
