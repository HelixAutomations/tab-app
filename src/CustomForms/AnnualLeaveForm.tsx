// src/CustomForms/AnnualLeaveForm.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Stack, Text, DefaultButton, TextField, Icon } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { FormField } from './BespokeForms';
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import { addDays, differenceInCalendarDays, eachDayOfInterval, format } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';
import '../app/styles/personas.css';

interface TeamMember {
  First: string;
  Initials: string;
  'Entra ID': string;
  Nickname?: string;
}

export interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

interface AnnualLeaveFormProps {
  futureLeave: AnnualLeaveRecord[];
  team: TeamMember[];
  userData: any; // adjust type as needed
  totals: { standard: number; unpaid: number; purchase: number }; // New totals property
}

interface DateRangeSelection {
  startDate: Date;
  endDate: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

const initialFormFields: FormField[] = [];

const buttonStylesFixedWidth = {
  root: {
    ...(sharedPrimaryButtonStyles.root as object),
    width: '150px',
  },
  rootHovered: {
    ...(sharedPrimaryButtonStyles.rootHovered as object),
  },
  rootPressed: {
    ...(sharedPrimaryButtonStyles.rootPressed as object),
  },
};

const buttonStylesFixedWidthSecondary = {
  root: {
    ...(sharedDefaultButtonStyles.root as object),
    width: '150px',
  },
  rootHovered: {
    ...(sharedDefaultButtonStyles.rootHovered as object),
  },
  rootPressed: {
    ...(sharedDefaultButtonStyles.rootPressed as object),
  },
};

const textFieldStyles = {
  fieldGroup: {
    borderRadius: '4px',
    border: `1px solid ${colours.light.border}`,
    backgroundColor: colours.light.inputBackground,
    selectors: {
      ':hover': {
        borderColor: colours.light.cta,
      },
      ':focus': {
        borderColor: colours.light.cta,
      },
    },
  },
};

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: colours.light.grey,
  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
  padding: "20px",
  borderRadius: "4px",
  animation: "dropIn 0.3s ease forwards",
  marginBottom: "20px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  marginBottom: "5px",
  color: colours.highlight,
};

const valueStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: colours.light.text,
};

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return eachDayOfInterval({ start: startDate, end: endDate }).map((date) =>
    format(date, 'dd/MM')
  );
};

const getOverlapDates = (leave: AnnualLeaveRecord, range: DateRangeSelection) => {
  const selStart = range.startDate;
  const selEnd = range.endDate;
  const leaveStart = new Date(leave.start_date);
  const leaveEnd = new Date(leave.end_date);
  const overlapStart = leaveStart < selStart ? selStart : leaveStart;
  const overlapEnd = leaveEnd > selEnd ? selEnd : leaveEnd;
  if (overlapStart > overlapEnd) return [];
  return eachDayOfInterval({ start: overlapStart, end: overlapEnd }).map((date) =>
    format(date, 'yyyy-MM-dd')
  );
};

function formatDisplayDate(dateStr: string): string {
  const [day, month] = dateStr.split('/');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`;
}

function isSequential(dates: string[]): boolean {
  if (dates.length === 0) return true;
  const parsed = dates.map(dateStr => {
    const [day, month] = dateStr.split('/');
    return new Date(2000, parseInt(month, 10) - 1, parseInt(day, 10));
  });
  for (let i = 1; i < parsed.length; i++) {
    const diff = differenceInCalendarDays(parsed[i], parsed[i - 1]);
    if (diff !== 1) {
      return false;
    }
  }
  return true;
}

function groupConsecutiveDates(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const sorted = dates.slice().sort((a, b) => {
    const [dayA, monthA] = a.split('/').map(Number);
    const [dayB, monthB] = b.split('/').map(Number);
    const dateA = new Date(2000, monthA - 1, dayA);
    const dateB = new Date(2000, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });
  const groups: string[][] = [];
  let currentGroup: string[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const [prevDay, prevMonth] = prev.split('/').map(Number);
    const [currDay, currMonth] = curr.split('/').map(Number);
    const prevDate = new Date(2000, prevMonth - 1, prevDay);
    const currDate = new Date(2000, currMonth - 1, currDay);
    const diff = differenceInCalendarDays(currDate, prevDate);
    if (diff === 1) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);
  return groups.map(group => {
    if (group.length === 1) return formatDisplayDate(group[0]);
    return `${formatDisplayDate(group[0])} - ${formatDisplayDate(group[group.length - 1])}`;
  });
}

const AnnualLeaveForm: React.FC<AnnualLeaveFormProps> = ({ futureLeave, team, userData, totals }) => {
  const { isDarkMode } = useTheme();
  const [dateRanges, setDateRanges] = useState<DateRangeSelection[]>([]);
  const [totalDays, setTotalDays] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState<string>('');

  const addDateRange = () => {
    setDateRanges([
      ...dateRanges,
      {
        startDate: new Date(),
        endDate: addDays(new Date(), 1),
      },
    ]);
  };

  const removeDateRange = (index: number) => {
    const newRanges = [...dateRanges];
    newRanges.splice(index, 1);
    setDateRanges(newRanges);
  };

  const updateDateRange = (index: number, range: DateRangeSelection) => {
    const newRanges = [...dateRanges];
    newRanges[index] = range;
    setDateRanges(newRanges);
  };

  useEffect(() => {
    // Calculate working days for each range, excluding weekends (Saturday=6, Sunday=0)
    let workingDaysTotal = 0;
    dateRanges.forEach((range) => {
      const allDays = eachDayOfInterval({ start: range.startDate, end: range.endDate });
      // Only count weekdays
      let workingDays = allDays.filter(day => {
        const d = day.getDay();
        return d !== 0 && d !== 6;
      }).length;
      // Apply half-day adjustments only if the start/end are working days
      if (range.halfDayStart && range.startDate.getDay() !== 0 && range.startDate.getDay() !== 6) {
        workingDays -= 0.5;
      }
      if (range.halfDayEnd && range.endDate.getDay() !== 0 && range.endDate.getDay() !== 6) {
        workingDays -= 0.5;
      }
      workingDaysTotal += workingDays;
    });
    setTotalDays(workingDaysTotal);
  }, [dateRanges]);

  // Compute overlapping leave details using futureLeave, dateRanges, and team.
  const groupedLeave = useMemo(() => {
    const groups: {
      [key: string]: {
        nickname: string;
        dateRanges: { start_date: string; end_date: string }[];
        status: string;
      }
    } = {};
    futureLeave.forEach((leave) => {
      dateRanges.forEach((range) => {
        const overlaps = getOverlapDates(leave, range);
        if (overlaps.length > 0) {
          const teamMember = team.find(
            (member) => member.Initials.toLowerCase() === leave.person.toLowerCase()
          );
          const nickname = teamMember ? teamMember.Nickname || teamMember.First : leave.person;
          const leaveStatus = leave.status.toLowerCase();
          const newRange = {
            start_date: overlaps[0],
            end_date: overlaps[overlaps.length - 1]
          };
          if (groups[leave.person]) {
            const exists = groups[leave.person].dateRanges.some(
              dr => dr.start_date === newRange.start_date && dr.end_date === newRange.end_date
            );
            if (!exists) {
              groups[leave.person].dateRanges.push(newRange);
            }
            if (groups[leave.person].status !== leaveStatus) {
              groups[leave.person].status = "requested";
            }
          } else {
            groups[leave.person] = { 
              nickname, 
              dateRanges: [newRange], 
              status: leaveStatus 
            };
          }
        }
      });
    });
    return Object.values(groups);
  }, [futureLeave, dateRanges, team]);

  const handleSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    setIsSubmitting(true);
    try {
      const feeEarner = userData && userData.length > 0 ? userData[0].Initials : "XX";

      const formattedDateRanges = dateRanges.map(range => ({
        start_date: range.startDate.toISOString().split("T")[0],
        end_date: range.endDate.toISOString().split("T")[0],
      }));

      const payload = {
        fe: feeEarner,
        dateRanges: formattedDateRanges,
        reason: notes,
        days_taken: totalDays,
        overlapDetails: groupedLeave
      };

      console.log("Annual Leave Form Payload:", payload);

      const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_CODE}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log("Insert Annual Leave Successful:", result);
    } catch (error) {
      console.error("Error submitting Annual Leave Form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    console.log('Annual Leave Form Cancelled');
  };

  return (
    <Stack tokens={{ childrenGap: 20 }}>
      {/* BespokeForm area with date range picker on left and a side panel for totals on the right */}
      <BespokeForm
        fields={initialFormFields}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
          <Stack style={{ flex: 1 }} tokens={{ childrenGap: 10 }}>
            {/* Date Ranges section - label removed */}
            {dateRanges.map((range, index) => (
              <Stack
                key={index}
                tokens={{ childrenGap: 5 }}
                style={{
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  padding: '10px',
                  borderRadius: '4px',
                }}
              >
                <DateRangePicker
                  ranges={[
                    {
                      startDate: range.startDate,
                      endDate: range.endDate,
                      key: `selection_${index}`,
                    },
                  ]}
                  onChange={(item: RangeKeyDict) => {
                    const selection = item[`selection_${index}`] as Range;
                    if (selection) {
                      const newRange: DateRangeSelection = {
                        startDate: selection.startDate || new Date(),
                        endDate: selection.endDate || new Date(),
                        halfDayStart: range.halfDayStart,
                        halfDayEnd: range.halfDayEnd,
                      };
                      updateDateRange(index, newRange);
                    }
                  }}
                  editableDateInputs
                  moveRangeOnFirstSelection={false}
                  months={1}
                  direction="horizontal"
                  rangeColors={[colours.highlight]}
                />
                <DefaultButton
                  text="Remove Range"
                  onClick={() => removeDateRange(index)}
                  iconProps={{ iconName: 'Minus' }}
                  styles={buttonStylesFixedWidthSecondary}
                />
              </Stack>
            ))}
            <div
              style={{
                border: '2px dashed #ccc',
                borderRadius: '4px',
                width: '100%',
                height: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={addDateRange}
            >
              <Icon iconName="Add" style={{ fontSize: 24, color: '#ccc', marginRight: 8 }} />
              <Text style={{ color: '#ccc', fontSize: '16px' }}>Add Date Range</Text>
            </div>
            <TextField
              label="Notes (Optional)"
              placeholder="Enter any additional notes"
              value={notes}
              onChange={(e, newVal) => setNotes(newVal || '')}
              styles={textFieldStyles}
              multiline
              rows={3}
            />
          </Stack>
          {/* Side panel displaying totals */}
          <Stack
            tokens={{ childrenGap: 10 }}
            style={{
              minWidth: '300px',
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: colours.light.grey,
            }}
          >
            <Text variant="xLarge" style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Total Days Requested
            </Text>
            <Text variant="xxLarge" style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {totalDays} {totalDays !== 1 ? 'days' : 'day'}
            </Text>

            <Text variant="xLarge" style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Days Remaining
            </Text>
            {userData && userData[0] && userData[0].holiday_entitlement != null ? (
              (() => {
                const entitlement = Number(userData[0].holiday_entitlement);
                // Days Remaining is computed as entitlement - Days Taken (from totals.standard)
                const remaining = entitlement - totals.standard;
                const remainingStyle = { color: remaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text };
                return (
                  <Text variant="xxLarge" style={remainingStyle}>
                    {remaining} {remaining !== 1 ? 'days' : 'day'}
                  </Text>
                );
              })()
            ) : (
              <Text variant="xxLarge" style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                N/A
              </Text>
            )}

            {/* Separator */}
            <div style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, margin: '20px 0' }}></div>

            <Stack tokens={{ childrenGap: 5 }}>
              <Text style={{ ...labelStyle }}>Days Taken</Text>
              <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {totals.standard} {totals.standard !== 1 ? 'days' : 'day'}
              </Text>
              <Text style={{ ...labelStyle }}>Unpaid Days Remaining</Text>
              {(() => {
                // Default unpaid allowance is 5; subtract totals.unpaid.
                const unpaidRemaining = 5 - totals.unpaid;
                const style = { color: unpaidRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text };
                return (
                  <Text style={{ ...valueStyle, ...style }}>
                    {unpaidRemaining} {unpaidRemaining !== 1 ? 'days' : 'day'}
                  </Text>
                );
              })()}
              <Text style={{ ...labelStyle }}>Available Days to 'Buy'</Text>
              {(() => {
                // Default to 5; subtract totals.purchase.
                const buyRemaining = 5 - totals.purchase;
                const style = { color: buyRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text };
                return (
                  <Text style={{ ...valueStyle, ...style }}>
                    {buyRemaining} {buyRemaining !== 1 ? 'days' : 'day'}
                  </Text>
                );
              })()}
            </Stack>
          </Stack>
        </div>
      </BespokeForm>

      <Stack tokens={{ childrenGap: 20 }}>
        {/* Team Leave Conflicts remains at the top */}
        <div style={{ position: 'relative', marginBottom: "20px" }}>
          <div
            style={{
              ...infoBoxStyle,
              backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.grey
            }}
          >
            <Icon
              iconName="Info"
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                fontSize: 80,
                opacity: 0.1,
                color: isDarkMode ? colours.dark.text : colours.light.text
              }}
            />
            <Stack tokens={{ childrenGap: 10 }}>
              <Text style={{ ...labelStyle }}>Team Leave Conflicts</Text>
            </Stack>
            {groupedLeave.length > 0 && (
              <Stack tokens={{ childrenGap: 10 }} style={{ marginTop: 20 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px'
                  }}
                >
                  {groupedLeave.map((item, idx) => {
                    const formattedRanges = item.dateRanges
                      .map(dr => {
                        const start = new Date(dr.start_date);
                        const end = new Date(dr.end_date);
                        return dr.start_date === dr.end_date
                          ? format(start, 'd MMM')
                          : `${format(start, 'd MMM')} - ${format(end, 'd MMM')}`;
                      })
                      .join(' | ');
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
                          animationDelay: `${idx * 0.1}s`,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: '#ffffff',
                          padding: '5px',
                          borderRadius: '4px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          minWidth: '150px'
                        }}
                      >
                        <div className="persona-icon-container" style={{ backgroundColor: 'transparent' }}>
                          <img
                            src={HelixAvatar}
                            alt={item.nickname}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%'
                            }}
                          />
                        </div>
                        <div style={{ marginTop: '5px', textAlign: 'center', width: '100%' }}>
                          <div className="persona-name-text" style={{ fontWeight: 600, fontSize: '16px', color: colours.light.text }}>
                            {item.nickname}
                          </div>
                          <div
                            className="persona-range-text"
                            style={{
                              fontSize: '14px',
                              fontWeight: 400,
                              color: colours.light.text
                            }}
                          >
                            {formattedRanges}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Text
                  style={{
                    fontStyle: 'italic',
                    marginTop: '10px',
                    color: isDarkMode ? colours.dark.text : colours.light.text
                  }}
                >
                  Please note: There are other team members scheduled for leave during the dates you've chosen. This may affect the likelihood of automatic approval for your request. You can still submit your request, and we will notify you of the outcome once a decision has been reached.
                </Text>
              </Stack>
            )}
          </div>
        </div>
      </Stack>
    </Stack>
  );
};

export default AnnualLeaveForm;
