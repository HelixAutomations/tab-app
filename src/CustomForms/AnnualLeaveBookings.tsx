import React, { useState } from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  Icon,
  Persona,
  PersonaSize
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
  reason?: string; // Rejection notes (if applicable)
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

  const getNickname = (initials: string) => {
    const member = team.find(m => m.Initials.toLowerCase() === initials.toLowerCase());
    return member?.Nickname || initials;
  };

  const BookingCard: React.FC<{ entry: BookingEntry }> = ({ entry }) => {
    const recordId = entry.request_id ? String(entry.request_id) : entry.id;
    const [updated, setUpdated] = useState(false);
    const [confirmationMessage, setConfirmationMessage] = useState('');

    const localHandleAction = async () => {
      try {
        if (entry.status.toLowerCase() === 'rejected') {
          await updateAnnualLeave(recordId, 'acknowledged', null);
          setUpdated(true);
          setConfirmationMessage('Acknowledged successfully');
          console.log(`Leave ${recordId} acknowledged after rejection.`);
        } else {
          await updateAnnualLeave(recordId, 'booked', null);
          setUpdated(true);
          setConfirmationMessage('Booked successfully');
          console.log(`Leave ${recordId} booked successfully.`);
        }
      } catch (error) {
        console.error(`Error processing leave ${recordId}:`, error);
      }
    };

    const localHandleDiscardAction = async () => {
      try {
        await updateAnnualLeave(recordId, 'discarded', null);
        setUpdated(true);
        setConfirmationMessage('Request discarded successfully');
        console.log(`Leave ${recordId} discarded.`);
      } catch (error) {
        console.error(`Error discarding leave ${recordId}:`, error);
      }
    };

    return (
      <Stack key={recordId} tokens={{ childrenGap: 15 }}>
        <div className={mergeStyles(
          entry.status.toLowerCase() === 'approved' ? approvedBackdropStyle : rejectedBackdropStyle,
          updated && { backgroundColor: '#f0f0f0', border: '2px solid #009900' }
        )}>
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

        <Stack horizontal tokens={{ childrenGap: 10 }}>
          <DefaultButton
            text={entry.status.toLowerCase() === 'rejected' ? 'Acknowledge' : 'Book to Confirm'}
            onClick={localHandleAction}
            styles={sharedDefaultButtonStyles}
            iconProps={{
              iconName: entry.status.toLowerCase() === 'rejected' ? 'Check' : 'CompletedSolid',
              styles: { root: { color: entry.status.toLowerCase() === 'rejected' ? '#0000FF' : '#009900' } }
            }}
            style={{ alignSelf: 'flex-start', maxWidth: 'auto' }}
          />
          {entry.status.toLowerCase() !== 'rejected' && (
            <DefaultButton
              text="No Longer Needed"
              onClick={localHandleDiscardAction}
              styles={sharedDefaultButtonStyles}
              iconProps={{
                iconName: 'Cancel',
                styles: { root: { color: '#cc0000' } }
              }}
              style={{ alignSelf: 'flex-start', maxWidth: 'auto' }}
            />
          )}
        </Stack>
        {confirmationMessage && (
          <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#009900' }}>{confirmationMessage}</Text>
        )}
        {entry.status.toLowerCase() === 'rejected' && entry.reason && (
          <Stack tokens={{ childrenGap: 5 }} styles={{ root: { marginTop: 10 } }}>
            <Text style={{ fontWeight: 600, color: colours.light.text }}>
              Rejection Notes:
            </Text>
            <Text style={{ color: colours.light.text }}>
              {entry.reason}
            </Text>
          </Stack>
        )}
      </Stack>
    );
  };

  return (
    <div className={formContainerStyle}>
      <Stack tokens={{ childrenGap: 20 }}>
        {bookings.length === 0 ? (
          <Text style={{ fontSize: 20, color: colours.light.text }}>
            No approved or rejected leave requests.
          </Text>
        ) : (
          bookings.map(entry => (
            <BookingCard key={entry.request_id ? String(entry.request_id) : entry.id} entry={entry} />
          ))
        )}
      </Stack>
    </div>
  );
};

export default AnnualLeaveBookings;
