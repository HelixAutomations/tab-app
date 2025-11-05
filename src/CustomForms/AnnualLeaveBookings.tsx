import React, { useState } from 'react';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
// invisible change
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
import { useTheme } from '../app/functionality/ThemeContext';

export interface BookingEntry {
  id: string;
  request_id?: number;
  person: string;
  start_date: string;
  end_date: string;
  status: string; // "approved", "rejected", "booked", "discarded", etc.
  days_taken?: number;
  reason?: string; // General reason for leave
  rejection_notes?: string; // Specific rejection notes
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

// Compact card styles for better information density
const compactBookingCardStyle = (isDarkMode: boolean, status: string) => {
  const statusLower = status.toLowerCase();
  const borderColor = statusLower === 'rejected' 
    ? colours.red 
    : statusLower === 'requested' 
      ? colours.orange 
      : colours.green;
  
  return mergeStyles({
    background: isDarkMode ? colours.dark.cardBackground : '#FFFFFF',
    border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #E5E7EB',
    borderLeft: `4px solid ${borderColor}`,
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '12px',
    boxShadow: isDarkMode 
      ? '0 2px 6px rgba(0, 0, 0, 0.3)' 
      : '0 2px 6px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s ease',
    ':hover': {
      boxShadow: isDarkMode 
        ? '0 3px 10px rgba(0, 0, 0, 0.4)' 
        : '0 3px 10px rgba(0, 0, 0, 0.1)',
    },
  });
};

const bookingHeaderStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
  gap: '12px',
  flexWrap: 'wrap',
});

const bookingActionsStyle = mergeStyles({
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
  '@media (max-width: 600px)': {
    flexDirection: 'column',
  },
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
  const { isDarkMode } = useTheme();
  
  // Add example booking for testing in localhost only
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const examplePendingBooking: BookingEntry = {
    id: 'pending-example-123',
    request_id: 999,
    person: bookings.length > 0 ? bookings[0].person : 'Luke',
    start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    end_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
    status: 'requested',
    days_taken: 3,
    reason: 'Family holiday'
  };
  
  // Only show example in localhost
  const displayBookings = isLocalhost && bookings.length === 0 
    ? [examplePendingBooking] 
    : bookings;
  
  const updateAnnualLeave = async (
    leaveId: string,
    newStatus: string,
    reason: string | null
  ): Promise<void> => {
  const url = `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_CODE}`;
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
        // If status is 'rejected', allow user to 'Acknowledge'
        if (entry.status.toLowerCase() === 'rejected') {
          await updateAnnualLeave(recordId, 'acknowledged', null);
          setUpdated(true);
          setConfirmationMessage('✓ Acknowledged');
          console.log(`Leave ${recordId} acknowledged after rejection.`);
        } else {
          // Otherwise, if 'approved' or other "approvable" statuses, set it to 'booked'
          await updateAnnualLeave(recordId, 'booked', null);
          setUpdated(true);
          setConfirmationMessage('✓ Leave Booked!');
          console.log(`Leave ${recordId} booked successfully.`);
        }
        // Auto-dismiss confirmation after 2.5 seconds
        setTimeout(() => setConfirmationMessage(''), 2500);
      } catch (error) {
        console.error(`Error processing leave ${recordId}:`, error);
        setConfirmationMessage('❌ Error');
        setTimeout(() => setConfirmationMessage(''), 3000);
      }
    };

    const localHandleDiscardAction = async () => {
      try {
        await updateAnnualLeave(recordId, 'discarded', null);
        setUpdated(true);
        setConfirmationMessage('✓ Discarded');
        console.log(`Leave ${recordId} discarded.`);
        // Auto-dismiss confirmation after 2.5 seconds
        setTimeout(() => setConfirmationMessage(''), 2500);
      } catch (error) {
        console.error(`Error discarding leave ${recordId}:`, error);
        setConfirmationMessage('❌ Error');
        setTimeout(() => setConfirmationMessage(''), 3000);
      }
    };

    const status = entry.status.toLowerCase();
    const isRejected = status === 'rejected';
    const isPending = status === 'requested';
    const isApproved = status === 'approved';
    const [showRejectionNotes, setShowRejectionNotes] = useState(false);

    // Format compact date range
    const compactDateRange = (() => {
      const start = new Date(entry.start_date);
      const end = new Date(entry.end_date);
      if (start.getTime() === end.getTime()) return format(start, 'd MMM yyyy');
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
      }
      return `${format(start, 'd MMM yyyy')} - ${format(end, 'd MMM yyyy')}`;
    })();

    // Pipeline visualization component
    const PipelineStage: React.FC<{ iconName: string; label: string; isActive: boolean; isCompleted: boolean }> = 
      ({ iconName, label, isActive, isCompleted }) => (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '4px',
          flex: 1,
          opacity: isCompleted || isActive ? 1 : 0.4
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
            backgroundColor: isCompleted 
              ? colours.green 
              : isActive 
                ? isDarkMode ? colours.dark.cardBackground : colours.highlight
                : isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            color: isCompleted || isActive ? '#FFFFFF' : isDarkMode ? '#9ca3af' : colours.greyText,
            border: isActive 
              ? isDarkMode ? `2px solid ${colours.accent}` : `2px solid ${colours.highlight}`
              : isCompleted 
                ? 'none'
                : isDarkMode ? `1px solid ${colours.dark.border}` : `1px solid rgba(0, 0, 0, 0.1)`,
            boxShadow: isActive 
              ? isDarkMode ? `0 0 0 3px ${colours.accent}25` : `0 0 0 3px ${colours.highlight}40`
              : undefined,
            transition: 'all 0.3s ease'
          }}>
            <Icon 
              iconName={iconName}
              styles={{ 
                root: { 
                  fontSize: 14,
                  color: isCompleted 
                    ? '#FFFFFF !important' 
                    : isActive 
                      ? isDarkMode ? `${colours.accent} !important` : '#FFFFFF !important'
                      : isDarkMode ? '#9ca3af !important' : `${colours.greyText} !important`
                } 
              }}
            />
          </div>
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: isCompleted 
              ? colours.green 
              : isActive 
                ? isDarkMode ? colours.accent : colours.highlight
                : isDarkMode ? '#9ca3af' : colours.greyText
          }}>
            {label}
          </div>
        </div>
      );

    const PipelineConnector: React.FC<{ isCompleted: boolean }> = ({ isCompleted }) => (
      <div style={{
        flex: 1,
        height: '2px',
        backgroundColor: isCompleted ? colours.green : isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        margin: '0 8px',
        alignSelf: 'center',
        marginTop: '-20px',
        transition: 'all 0.3s ease'
      }} />
    );

    return (
      <div className={compactBookingCardStyle(isDarkMode, entry.status)} key={recordId}>
        {/* Compact Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <Persona
              imageUrl={HelixAvatar}
              text={getNickname(entry.person)}
              size={PersonaSize.size24}
              styles={{ primaryText: { 
                fontWeight: 600, 
                fontSize: '13px', 
                color: isDarkMode ? colours.dark.text : colours.light.text 
              } }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: 600, 
                color: isDarkMode ? colours.dark.text : colours.light.text 
              }}>
                {compactDateRange}
              </div>
              {entry.days_taken && (
                <div style={{ 
                  fontSize: '12px', 
                  color: isDarkMode ? colours.dark.subText : colours.greyText 
                }}>
                  {entry.days_taken} {entry.days_taken === 1 ? 'day' : 'days'}
                </div>
              )}
            </div>
          </div>
          
          {/* Status Badge */}
          <div style={{ 
            padding: '4px 12px', 
            borderRadius: '6px', 
            fontSize: '11px', 
            fontWeight: 700, 
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            backgroundColor: isRejected 
              ? isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
              : isPending 
                ? isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)'
                : isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            color: isRejected ? colours.red : isPending ? (isDarkMode ? colours.accent : colours.highlight) : colours.green,
            border: `1px solid ${isRejected ? colours.red : isPending ? (isDarkMode ? colours.accent : colours.highlight) : colours.green}40`
          }}>
            {isRejected ? 'Rejected' : isPending ? 'Pending' : updated ? 'Booked' : 'Approved'}
          </div>
        </div>

        {/* Rejection Notes */}
        {isRejected && entry.rejection_notes && (
          <div style={{ 
            marginTop: '12px',
            padding: '10px 12px', 
            borderRadius: '6px', 
            backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)', 
            border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.15)'}`, 
            fontSize: '12px', 
            color: isDarkMode ? colours.dark.text : colours.light.text
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: colours.red }}>Rejection reason:</div>
            {entry.rejection_notes}
          </div>
        )}

        {/* Confirmation Message */}
        {confirmationMessage && (
          <div style={{ 
            marginTop: '12px',
            padding: '10px 12px', 
            borderRadius: '6px', 
            fontSize: '12px', 
            fontWeight: 600, 
            backgroundColor: confirmationMessage.includes('Error') 
              ? isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.1)'
              : isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.1)', 
            color: confirmationMessage.includes('Error') ? colours.red : colours.green,
            border: `1px solid ${confirmationMessage.includes('Error') ? colours.red : colours.green}40`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Icon iconName={confirmationMessage.includes('Error') ? 'ErrorBadge' : 'CheckMark'} />
            {confirmationMessage}
          </div>
        )}

        <div className={bookingActionsStyle}>
          {!updated && !isPending && (
            <>
              <DefaultButton
                text={isRejected ? 'Acknowledge' : '✓ Book Leave'}
                onClick={localHandleAction}
                styles={sharedDefaultButtonStyles}
                style={{ 
                  flex: 1, 
                  minWidth: 0, 
                  padding: '8px 16px', 
                  height: '36px', 
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: isRejected ? undefined : colours.orange,
                  borderColor: isRejected ? undefined : colours.orange,
                  color: isRejected ? undefined : '#FFFFFF'
                }}
              />
              {!isRejected && (
                <DefaultButton
                  text="✗ Discard"
                  onClick={localHandleDiscardAction}
                  styles={sharedDefaultButtonStyles}
                  style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    padding: '8px 16px', 
                    height: '36px', 
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={formContainerStyle}
      style={{
        backgroundColor: isDarkMode ? colours.dark.background : colours.light.sectionBackground,
        border: isDarkMode ? '1px solid ' + colours.dark.border : undefined
      }}
    >
      <Stack tokens={{ childrenGap: 20 }}>
        {displayBookings.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: isDarkMode ? colours.dark.text : colours.light.text
          }}>
            <Icon 
              iconName="Vacation" 
              styles={{ 
                root: { 
                  fontSize: 64, 
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  marginBottom: '16px'
                } 
              }} 
            />
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: '8px' }}>
              No leave requests
            </div>
            <div style={{ 
              fontSize: 14, 
              color: isDarkMode ? colours.dark.subText : colours.greyText 
            }}>
              No pending, approved, or rejected leave requests at this time.
            </div>
          </div>
        ) : (
          displayBookings.map(entry => (
            <BookingCard
              key={entry.request_id ? String(entry.request_id) : entry.id}
              entry={entry}
            />
          ))
        )}
      </Stack>
    </div>
  );
};

export default AnnualLeaveBookings;
