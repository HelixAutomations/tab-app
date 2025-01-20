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
import { eachDayOfInterval, isWeekend, format, addDays } from 'date-fns';
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
  futureLeave: ApprovalEntry[];
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
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
  } else {
    return `${format(start, 'd MMM yyyy')} - ${format(end, 'd MMM yyyy')}`;
  }
};

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

const AnnualLeaveApprovals: React.FC<AnnualLeaveApprovalsProps> = ({
  approvals,
  futureLeave,
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

  const getAllConflicts = (currentEntry: ApprovalEntry): ApprovalEntry[] => {
    const conflictsFromApprovals = approvals.filter(
      other =>
        other.id !== currentEntry.id &&
        other.person !== currentEntry.person &&
        new Date(currentEntry.start_date) <= new Date(other.end_date) &&
        new Date(other.start_date) <= new Date(currentEntry.end_date)
    );
    const conflictsFromFuture = futureLeave.filter(
      other =>
        other.person !== currentEntry.person &&
        new Date(currentEntry.start_date) <= new Date(other.end_date) &&
        new Date(other.start_date) <= new Date(currentEntry.end_date)
    );
    return [...conflictsFromApprovals, ...conflictsFromFuture];
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
            const conflicts = getAllConflicts(entry);

            // Group conflicts by person with status handling
            const conflictsGrouped: {
              [person: string]: {
                nickname: string;
                dateRanges: { start_date: string; end_date: string }[];
                status: string;
              }
            } = {};
            conflicts.forEach(conflict => {
              const person = conflict.person;
              if (!conflictsGrouped[person]) {
                conflictsGrouped[person] = {
                  nickname: getNickname(person),
                  dateRanges: [],
                  status: conflict.status.toLowerCase(),
                };
              } else {
                if (conflictsGrouped[person].status !== conflict.status.toLowerCase()) {
                  conflictsGrouped[person].status = 'requested';
                }
              }
              conflictsGrouped[person].dateRanges.push({
                start_date: conflict.start_date,
                end_date: conflict.end_date,
              });
            });
            const groupedArray = Object.values(conflictsGrouped);

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
                    <Stack tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: 10 } }}>
                      <Label className={labelStyleText}>Team Conflicts:</Label>
                      {conflicts.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                          {groupedArray.map((item, idx) => {
                            const consolidated = consolidateRanges(item.dateRanges);
                            let borderColor = colours.cta;
                            if (item.status === 'approved') {
                              borderColor = colours.orange;
                            } else if (item.status === 'booked') {
                              borderColor = colours.green;
                            }
                            
                            return (
                              <div
                                key={idx}
                                className="persona-bubble"
                                style={{
                                  border: `1px solid ${borderColor}`,
                                  backgroundColor: '#ffffff',
                                  padding: '5px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  minWidth: '150px',
                                }}
                              >
                                <div className="persona-icon-container" style={{ backgroundColor: 'transparent' }}>
                                  <Persona
                                    imageUrl={HelixAvatar}
                                    text={item.nickname}
                                    size={PersonaSize.size48}
                                    styles={{ primaryText: { fontWeight: 'bold', fontSize: '16px' } }}
                                  />
                                </div>
                                <div style={{ marginTop: '5px', textAlign: 'center', width: '100%' }}>
                                  <div style={{ fontWeight: 600, fontSize: '16px', color: colours.light.text }}>
                                    {item.nickname}
                                  </div>
                                  <div style={{ fontSize: '14px', fontWeight: 400, color: colours.light.text }}>
                                    {consolidated.map((dr, index) =>
                                      dr.start_date === dr.end_date
                                        ? format(new Date(dr.start_date), 'd MMM')
                                        : `${format(new Date(dr.start_date), 'd MMM')} - ${format(new Date(dr.end_date), 'd MMM')}`
                                    ).map((line, index) => (
                                      <div key={index}>{line}</div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Text className={valueStyleText}>No Conflicts</Text>
                      )}
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
