import React from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  Icon,
  Persona,
  PersonaSize,
  Label
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { eachDayOfInterval, isWeekend, format, addDays } from 'date-fns';
import { colours } from '../app/styles/colours';
import { formContainerStyle, inputFieldStyle } from './BespokeForms';
import { sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';

export interface BookingEntry {
  // The backend now returns a numeric request_id. If that exists, use it.
  id: string;
  request_id?: number;
  person: string; // holds initials
  start_date: string;
  end_date: string;
  status: string; // "approved" or "rejected"
  days_taken?: number;
}

export interface TeamMember {
  Initials: string;
  Nickname?: string;
  First: string;
  imageUrl?: string;
}

export interface AnnualLeaveBookingsProps {
  bookings: BookingEntry[];
  onClose: () => void;
  team: TeamMember[];
}

const labelStyleText = mergeStyles({
  fontSize: '14px',
  fontWeight: 600,
  color: colours.highlight,
  marginBottom: '5px',
});

const valueStyleText = mergeStyles({
  fontSize: '18px',
  color: colours.light.text,
  marginBottom: '10px',
});

const approvedBackdropStyle = mergeStyles({
  backgroundColor: '#e6ffe6',
  padding: '10px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '15px',
});

const rejectedBackdropStyle = mergeStyles({
  backgroundColor: '#fff9e6',
  padding: '10px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '15px',
});

const formatDateRange = (startStr: string, endStr: string) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
  } else {
    return `${format(start, 'd MMM yyyy')} - ${format(end, 'd MMM yyyy')}`;
  }
};

/**
 * Consolidates overlapping or consecutive date ranges.
 * If two ranges touch (e.g., end of first is one day before start of second),
 * they are merged into a single range.
 */
function consolidateRanges(ranges: { start_date: string; end_date: string }[]): { start_date: string; end_date: string }[] {
  if (!ranges.length) return [];
  const sorted = ranges
    .slice()
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    const curr = sorted[i];
    // If current range starts the day after or earlier than last end, merge
    if (new Date(curr.start_date) <= addDays(new Date(last.end_date), 1)) {
      if (new Date(curr.end_date) > new Date(last.end_date)) {
        last.end_date = curr.end_date;
      }
    } else {
      result.push(curr);
    }
  }
  return result;
}

const AnnualLeaveBookings: React.FC<AnnualLeaveBookingsProps> = ({ bookings, onClose, team }) => {
  const updateAnnualLeave = async (
    leaveId: string,
    newStatus: string,
    reason: string | null
  ): Promise<void> => {
    const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_CODE}`;
    const payload = { id: leaveId, newStatus, reason: reason || '' };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Update failed with status ${response.status}: ${response.statusText}`);
    }
  };

  const handleAction = async (id: string, status: string) => {
    try {
      if (status.toLowerCase() === 'rejected') {
        await updateAnnualLeave(id, 'acknowledged', null);
        console.log(`Leave ${id} acknowledged after rejection.`);
      } else {
        await updateAnnualLeave(id, 'booked', null);
        console.log(`Leave ${id} booked successfully.`);
      }
    } catch (error) {
      console.error(`Error processing leave ${id}:`, error);
    }
  };

  const getNickname = (initials: string) => {
    const member = team.find(m => m.Initials.toLowerCase() === initials.toLowerCase());
    return member?.Nickname || initials;
  };

  return (
    <div className={formContainerStyle}>
      <Stack tokens={{ childrenGap: 20 }}>
        {bookings.length === 0 ? (
          <Text style={{ fontSize: 20, color: colours.light.text }}>
            No approved or rejected leave requests.
          </Text>
        ) : (
          bookings.map(entry => {
            // Use record's request_id if available (converted to string), otherwise fallback to entry.id.
            const recordId = entry.request_id ? String(entry.request_id) : entry.id;

            return (
              <Stack key={recordId} tokens={{ childrenGap: 15 }}>
                <div className={entry.status.toLowerCase() === 'approved' ? approvedBackdropStyle : rejectedBackdropStyle}>
                  {entry.status.toLowerCase() === 'approved' ? (
                    <>
                      <Icon
                        iconName="CompletedSolid"
                        styles={{ root: { fontSize: 24, color: '#009900' } }}
                      />
                      <Text style={{ fontSize: 20, fontWeight: 700, color: colours.light.text }}>
                        Your Annual Leave Request has been Approved
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon
                        iconName="Cancel"
                        styles={{ root: { fontSize: 24, color: '#cc0000' } }}
                      />
                      <Text style={{ fontSize: 20, fontWeight: 700, color: colours.light.text }}>
                        Your Annual Leave Request has been Rejected
                      </Text>
                    </>
                  )}
                </div>

                <Stack horizontal tokens={{ childrenGap: 15 }} verticalAlign="center">
                  <Persona
                    imageUrl={HelixAvatar}
                    text={getNickname(entry.person)}
                    size={PersonaSize.size48}
                    styles={{ primaryText: { fontWeight: 'bold', fontSize: '18px' } }}
                  />
                  <Stack tokens={{ childrenGap: 10 }} style={{ flex: 1 }}>
                    <Stack
                      tokens={{ childrenGap: 10 }}
                      styles={{
                        root: {
                          border: `1px solid ${colours.light.border}`,
                          borderRadius: '4px',
                          padding: '12px',
                          backgroundColor: colours.light.grey,
                        },
                      }}
                    >
                      <Stack horizontal tokens={{ childrenGap: 40 }}>
                        <Stack>
                          <Text className={labelStyleText}>
                            {entry.status.toLowerCase() === 'rejected' ? 'Rejected Dates:' : 'Approved Dates:'}
                          </Text>
                          <Text className={valueStyleText}>
                            {formatDateRange(entry.start_date, entry.end_date)}
                          </Text>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Stack>
                </Stack>

                <DefaultButton
                  text={entry.status.toLowerCase() === 'rejected' ? 'Acknowledge' : 'Book'}
                  onClick={() => handleAction(recordId, entry.status)}
                  styles={sharedDefaultButtonStyles}
                  iconProps={{
                    iconName: entry.status.toLowerCase() === 'rejected' ? 'Acknowledge' : 'CompletedSolid',
                    styles: { root: { color: entry.status.toLowerCase() === 'rejected' ? '#0000FF' : '#009900' } } // Blue for Acknowledge, Green for Book
                  }}
                  style={{ alignSelf: 'flex-start', maxWidth: 'auto' }}
                />
              </Stack>
            );
          })
        )}
      </Stack>
    </div>
  );
};

export default AnnualLeaveBookings;
