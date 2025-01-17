// src/CustomForms/AnnualLeaveBookings.tsx

import React from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  Icon,
  Persona,
  PersonaSize
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { format } from 'date-fns';
import { colours } from '../app/styles/colours';
import { formContainerStyle } from './BespokeForms';
import { sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';

export interface BookingEntry {
  id: string;
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
            const statusLower = entry.status.toLowerCase();
            const isApproved = statusLower === 'approved';
            const isRejected = statusLower === 'rejected';

            return (
              <Stack key={entry.id} tokens={{ childrenGap: 15 }}>
                <div className={isApproved ? approvedBackdropStyle : rejectedBackdropStyle}>
                  {isApproved ? (
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
                            {isRejected ? 'Rejected Dates:' : 'Approved Dates:'}
                          </Text>
                          <Text className={valueStyleText}>
                            {format(new Date(entry.start_date), 'd MMM yyyy')} -{' '}
                            {format(new Date(entry.end_date), 'd MMM yyyy')}
                          </Text>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Stack>
                </Stack>

                <DefaultButton
                  text={isRejected ? 'Acknowledge' : 'Book'}
                  onClick={() => handleAction(entry.id, entry.status)}
                  styles={sharedDefaultButtonStyles}
                  iconProps={{ iconName: 'CompletedSolid', styles: { root: { color: '#009900' } } }}
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
