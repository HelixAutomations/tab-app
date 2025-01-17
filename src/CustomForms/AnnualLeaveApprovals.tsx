// src/CustomForms/AnnualLeaveApprovals.tsx

import React, { useState } from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  TextField,
  Persona,
  PersonaSize,
  Label
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { eachDayOfInterval, isWeekend, format } from 'date-fns';
import { colours } from '../app/styles/colours';
import { formContainerStyle, inputFieldStyle } from './BespokeForms';
import { sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';

export interface ApprovalEntry {
  id: string;
  person: string; // holds initials
  start_date: string;
  end_date: string;
  reason?: string;
  status: string;
  days_taken?: number;
}

export interface TeamMember {
  Initials: string;
  Nickname?: string;
  First: string;
  imageUrl?: string;
}

export interface AnnualLeaveApprovalsProps {
  approvals: ApprovalEntry[];
  onClose: () => void;
  team: TeamMember[];
  totals: { standard: number; unpaid: number; purchase: number };
  holidayEntitlement: number;
}

const Badge: React.FC<{ children: React.ReactNode; badgeStyle?: React.CSSProperties }> = ({
  children,
  badgeStyle,
}) => (
  <span style={{ padding: '4px 8px', borderRadius: '12px', fontWeight: 600, ...badgeStyle }}>
    {children}
  </span>
);

const containerEntryStyle = mergeStyles({
  border: `1px solid ${colours.light.border}`,
  padding: '20px',
  borderRadius: '8px',
  backgroundColor: '#fff',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
});

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

const calculateWorkingDays = (startStr: string, endStr: string): number => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const days = eachDayOfInterval({ start, end });
  return days.filter(day => !isWeekend(day)).length;
};

const formatDateRange = (startStr: string, endStr: string) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  return `${format(start, 'd MMM yyyy')} - ${format(end, 'd MMM yyyy')}`;
};

const AnnualLeaveApprovals: React.FC<AnnualLeaveApprovalsProps> = ({
  approvals,
  onClose,
  team,
  totals,
  holidayEntitlement,
}) => {
  const [rejectionReason, setRejectionReason] = useState<{ [id: string]: string }>({});

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

  const handleApprove = async (id: string) => {
    try {
      await updateAnnualLeave(id, 'approved', null);
      console.log(`Leave ${id} approved successfully.`);
    } catch (error) {
      console.error(`Error approving leave ${id}:`, error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const reason = rejectionReason[id] || '';
      await updateAnnualLeave(id, 'rejected', reason);
      console.log(`Leave ${id} rejected with reason: ${reason}`);
    } catch (error) {
      console.error(`Error rejecting leave ${id}:`, error);
    }
  };

  const handleRejectionReasonChange = (id: string, newVal: string) => {
    setRejectionReason(prev => ({ ...prev, [id]: newVal }));
  };

  const getNickname = (initials: string) => {
    const member = team.find(m => m.Initials.toLowerCase() === initials.toLowerCase());
    return member?.Nickname || initials;
  };

  const totalBookedDays = totals.standard;

  return (
    <div className={formContainerStyle}>
      {approvals.length === 0 ? (
        <Text style={{ fontSize: 20, color: colours.light.text }}>No items to approve.</Text>
      ) : (
        <Stack tokens={{ childrenGap: 20 }}>
          {approvals.map(entry => {
            const workingDays = calculateWorkingDays(entry.start_date, entry.end_date);
            const daysRemaining = holidayEntitlement - totalBookedDays - workingDays;
            const availableSell = 5 - totals.purchase;
            return (
              <div key={entry.id} className={containerEntryStyle}>
                <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="start">
                  <Persona
                    imageUrl={HelixAvatar}
                    text={getNickname(entry.person)}
                    size={PersonaSize.size48}
                    styles={{ primaryText: { fontWeight: 'bold', fontSize: '18px' } }}
                  />
                  <Stack tokens={{ childrenGap: 20 }} styles={{ root: { flex: 1 } }}>
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
                          <Label className={labelStyleText}>Requested Dates:</Label>
                          <Text className={valueStyleText}>
                            {formatDateRange(entry.start_date, entry.end_date)}
                          </Text>
                        </Stack>
                        <Stack>
                          <Label className={labelStyleText}>Total Number of Days Requested:</Label>
                          <Text className={valueStyleText}>
                            {workingDays} {workingDays !== 1 ? 'days' : 'day'}
                          </Text>
                        </Stack>
                      </Stack>
                      <Stack>
                        <Label className={labelStyleText}>Notes:</Label>
                        <Text className={valueStyleText}>
                          {entry.reason && entry.reason.trim() !== ''
                            ? entry.reason
                            : `${getNickname(entry.person)} hasn't left a note.`}
                        </Text>
                      </Stack>
                    </Stack>
                    <Stack
                      horizontal
                      tokens={{ childrenGap: 40 }}
                      styles={{
                        root: {
                          border: `1px solid ${colours.light.border}`,
                          borderRadius: '4px',
                          padding: '12px',
                          backgroundColor: colours.light.grey,
                        },
                      }}
                    >
                      <Stack>
                        <Label className={labelStyleText}>Days taken so far this year:</Label>
                        <Text className={valueStyleText}>
                          {totalBookedDays} {totalBookedDays !== 1 ? 'days' : 'day'}
                        </Text>
                      </Stack>
                      <Stack>
                        <Label className={labelStyleText}>Days remaining this year:</Label>
                        <Text className={valueStyleText}>
                          {daysRemaining} {daysRemaining !== 1 ? 'days' : 'day'}
                        </Text>
                      </Stack>
                      <Stack>
                        <Label className={labelStyleText}>Available days to sell:</Label>
                        <Text className={valueStyleText}>
                          {availableSell} {availableSell !== 1 ? 'days' : 'day'}
                        </Text>
                      </Stack>
                    </Stack>
                  </Stack>
                </Stack>
                <Stack
                  horizontal
                  tokens={{ childrenGap: 10 }}
                  styles={{ root: { marginTop: 10, alignItems: 'center' } }}
                >
                  {entry.status.toLowerCase() === 'approved' ? (
                    <Badge badgeStyle={{ backgroundColor: '#e6ffe6', color: '#009900' }}>
                      Approved
                    </Badge>
                  ) : entry.status.toLowerCase() === 'rejected' ? (
                    <Badge badgeStyle={{ backgroundColor: '#fff9e6', color: '#cc0000' }}>
                      Rejected
                    </Badge>
                  ) : null}
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: 10, paddingBottom: 10 } }}>
                  <DefaultButton
                    text="Approve"
                    onClick={() => handleApprove(entry.id)}
                    styles={sharedDefaultButtonStyles}
                    iconProps={{ iconName: 'CompletedSolid', styles: { root: { color: '#009900' } } }}
                  />
                  <DefaultButton
                    text="Reject"
                    onClick={() => handleReject(entry.id)}
                    styles={sharedDefaultButtonStyles}
                    iconProps={{ iconName: 'Cancel', styles: { root: { color: '#cc0000' } } }}
                  />
                </Stack>
                <TextField
                  placeholder="Enter rejection notes"
                  value={rejectionReason[entry.id] || ''}
                  onChange={(e, val) => handleRejectionReasonChange(entry.id, val || '')}
                  styles={{ fieldGroup: inputFieldStyle }}
                  multiline
                  rows={3}
                />
              </div>
            );
          })}
        </Stack>
      )}
    </div>
  );
};

export default AnnualLeaveApprovals;