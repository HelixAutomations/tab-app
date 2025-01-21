// src/CustomForms/AnnualLeaveForm.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Stack, Text, DefaultButton, TextField, Icon, TooltipHost } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { FormField } from './BespokeForms';
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import { addDays, eachDayOfInterval, format } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';
// The grey helix mark is imported but not used in this version.
import GreyHelixMark from '../assets/grey helix mark.png';
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
  totals: { standard: number; unpaid: number; purchase: number }; // Days already taken from DB
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
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
  padding: '20px',
  borderRadius: '4px',
  animation: 'dropIn 0.3s ease forwards',
  marginBottom: '20px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  marginBottom: '5px',
  color: colours.highlight,
};

const valueStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 400,
  color: colours.light.text,
};

/**
 * Filters out weekends (Sat=6, Sun=0). Also accounts for halfDayStart and halfDayEnd,
 * reducing by 0.5 if those days are weekdays.
 */
function calculateWorkingDays(range: DateRangeSelection): number {
  const allDays = eachDayOfInterval({ start: range.startDate, end: range.endDate });
  let workingDays = 0;
  allDays.forEach((day) => {
    const dayOfWeek = day.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays += 1;
    }
  });
  if (range.halfDayStart) {
    const dayOfWeek = range.startDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays -= 0.5;
    }
  }
  if (range.halfDayEnd) {
    const dayOfWeek = range.endDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays -= 0.5;
    }
  }
  return workingDays;
}

/** 
 * Determines if an interval has overlap with an annual leave record's interval 
 * and returns the set of overlapping days.
 */
function getOverlapDates(leave: AnnualLeaveRecord, range: DateRangeSelection): string[] {
  const selStart = range.startDate;
  const selEnd = range.endDate;
  const leaveStart = new Date(leave.start_date);
  const leaveEnd = new Date(leave.end_date);
  const overlapStart = leaveStart < selStart ? selStart : leaveStart;
  const overlapEnd = leaveEnd > selEnd ? selEnd : leaveEnd;
  if (overlapStart > overlapEnd) return [];
  return eachDayOfInterval({ start: overlapStart, end: overlapEnd }).map((d) =>
    format(d, 'yyyy-MM-dd')
  );
}

function AnnualLeaveForm({
  futureLeave,
  team,
  userData,
  totals,
}: AnnualLeaveFormProps) {
  const { isDarkMode } = useTheme();
  const [dateRanges, setDateRanges] = useState<DateRangeSelection[]>([]);
  const [totalDays, setTotalDays] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState<string>('');

  // Recalculate total days when dateRanges change.
  useEffect(() => {
    let total = 0;
    dateRanges.forEach((range) => {
      total += calculateWorkingDays(range);
    });
    setTotalDays(total);
  }, [dateRanges]);

  const handleAddDateRange = () => {
    setDateRanges((prev) => [
      ...prev,
      {
        startDate: new Date(),
        endDate: addDays(new Date(), 1),
      },
    ]);
  };

  // Allow removal of each date range.
  const handleRemoveDateRange = (index: number) => {
    setDateRanges((prev) => {
      const newRanges = [...prev];
      newRanges.splice(index, 1);
      return newRanges;
    });
  };

  // Clear button handler: resets date ranges and notes.
  const handleClear = () => {
    setDateRanges([]);
    setNotes('');
  };

  // Compute effective remaining leave.
  const holidayEntitlement = Number(userData?.[0]?.holiday_entitlement ?? 0);
  const effectiveRemaining = holidayEntitlement - totals.standard - totalDays;

  // Change: lock submit button if remaining days are 0 or negative.
  const isSubmitDisabled = effectiveRemaining <= 0;

  /**
   * Group "futureLeave" records that overlap with any chosen date ranges.
   * These will be shown as "Team Leave Conflicts."
   */
  const groupedLeave = useMemo(() => {
    const groups: Record<
      string,
      {
        nickname: string;
        dateRanges: { start_date: string; end_date: string }[];
        status: string;
      }
    > = {};
    futureLeave.forEach((leave) => {
      dateRanges.forEach((range) => {
        const overlaps = getOverlapDates(leave, range);
        if (overlaps.length > 0) {
          const teamMember = team.find(
            (m) => m.Initials.toLowerCase() === leave.person.toLowerCase()
          );
          const nickname = teamMember ? teamMember.Nickname || teamMember.First : leave.person;
          const leaveStatus = leave.status.toLowerCase();
          const newRange = {
            start_date: overlaps[0],
            end_date: overlaps[overlaps.length - 1],
          };
          if (!groups[leave.person]) {
            groups[leave.person] = {
              nickname,
              dateRanges: [newRange],
              status: leaveStatus,
            };
          } else {
            const alreadyExists = groups[leave.person].dateRanges.some(
              (dr) =>
                dr.start_date === newRange.start_date &&
                dr.end_date === newRange.end_date
            );
            if (!alreadyExists) {
              groups[leave.person].dateRanges.push(newRange);
            }
            if (groups[leave.person].status !== leaveStatus) {
              groups[leave.person].status = 'requested';
            }
          }
        }
      });
    });
    return Object.values(groups);
  }, [futureLeave, dateRanges, team]);

  /** 
   * Submits the form.
   * If the remaining leave is negative or zero, submission is prevented.
   */
  const handleSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    if (isSubmitDisabled) return;
    setIsSubmitting(true);
    try {
      const feeEarner = userData?.[0]?.Initials || 'XX';
      const formattedDateRanges = dateRanges.map((range) => ({
        start_date: range.startDate.toISOString().split('T')[0],
        end_date: range.endDate.toISOString().split('T')[0],
      }));
      const payload = {
        fe: feeEarner,
        dateRanges: formattedDateRanges,
        reason: notes,
        days_taken: totalDays,
        overlapDetails: groupedLeave,
      };
      console.log('Annual Leave Form Payload:', payload);
      const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_CODE}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const result = await response.json();
      console.log('Insert Annual Leave Successful:', result);
    } catch (error) {
      console.error('Error submitting Annual Leave Form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Renders the side panel showing leave totals.
   */
  function renderSidePanel() {
    const effectiveRemainingStyle = {
      color: effectiveRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text,
    };
    const defaultUnpaid = 5;
    const unpaidRemaining = defaultUnpaid - totals.unpaid;
    const unpaidStyle = {
      color: unpaidRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text,
    };
    const defaultBuy = 5;
    const buyRemaining = defaultBuy - totals.purchase;
    const buyStyle = {
      color: buyRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text,
    };

    return (
      <Stack
        tokens={{ childrenGap: 10 }}
        style={{
          minWidth: '300px',
          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          padding: '10px',
          borderRadius: '4px',
          backgroundColor: 'transparent',
        }}
      >
        <Text style={{ fontSize: '14px', fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
          Total Days Requested
        </Text>
        <Text style={{ fontSize: '18px', fontWeight: 400, color: isDarkMode ? colours.dark.text : colours.light.text }}>
          {totalDays} {totalDays !== 1 ? 'days' : 'day'}
        </Text>

        <Text style={{ fontSize: '14px', fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
          Days Remaining
        </Text>
        {userData?.[0]?.holiday_entitlement != null ? (
          <Text style={{ fontSize: '18px', fontWeight: 400, ...effectiveRemainingStyle }}>
            {effectiveRemaining} {effectiveRemaining !== 1 ? 'days' : 'day'}
          </Text>
        ) : (
          <Text style={{ fontSize: '18px', fontWeight: 400, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            N/A
          </Text>
        )}

        <div
          style={{
            borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            margin: '20px 0',
          }}
        />

        <Stack tokens={{ childrenGap: 5 }}>
          <Text style={labelStyle}>Days taken so far this year</Text>
          <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            {totals.standard} {totals.standard !== 1 ? 'days' : 'day'}
          </Text>

          <Text style={labelStyle}>Days remaining this year</Text>
          <Text style={{ ...valueStyle, ...unpaidStyle }}>
            {unpaidRemaining} {unpaidRemaining !== 1 ? 'days' : 'day'}
          </Text>

          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 5 }}>
            <Text style={labelStyle}>Available days to sell</Text>
            <TooltipHost
              content="Available days to sell if you wish to not take leave and be compensated per day pro rata to your salary."
            >
              <Icon iconName="Info" style={{ fontSize: '16px', cursor: 'default' }} />
            </TooltipHost>
          </Stack>
          <Text style={{ ...valueStyle, ...buyStyle }}>
            {buyRemaining} {buyRemaining !== 1 ? 'days' : 'day'}
          </Text>
        </Stack>
      </Stack>
    );
  }

  /**
   * Renders the "Team Leave Conflicts" block.
   */
  function renderTeamLeaveConflicts() {
    if (!groupedLeave.length) return null;
    return (
      <Stack tokens={{ childrenGap: 10 }} style={{ marginTop: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
          }}
        >
          {groupedLeave.map((item, idx) => {
            const formattedRanges = item.dateRanges
              .map((dr) => {
                const start = new Date(dr.start_date);
                const end = new Date(dr.end_date);
                const sameDay = dr.start_date === dr.end_date;
                return sameDay
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
                  minWidth: '150px',
                }}
              >
                <div className="persona-icon-container" style={{ backgroundColor: 'transparent' }}>
                  <img
                    src={HelixAvatar}
                    alt={item.nickname}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                    }}
                  />
                </div>
                <div style={{ marginTop: '5px', textAlign: 'center', width: '100%' }}>
                  <div
                    className="persona-name-text"
                    style={{ fontWeight: 600, fontSize: '16px', color: colours.light.text }}
                  >
                    {item.nickname}
                  </div>
                  <div
                    className="persona-range-text"
                    style={{
                      fontSize: '14px',
                      fontWeight: 400,
                      color: colours.light.text,
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
            color: isDarkMode ? colours.dark.text : colours.light.text,
          }}
        >
          Please note: There are other team members scheduled for leave during the dates you've chosen.
          This may affect the likelihood of automatic approval for your request. You can still submit your
          request, and we will notify you of the outcome once a decision has been reached.
        </Text>
      </Stack>
    );
  }

  return (
    <>
      {/* Inline CSS for animations and to hide the Cancel and default Submit button from BespokeForm */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes dropIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          /* Hide the last button (assumed to be Cancel) within our BespokeForm container */
          .bespokeFormContainer button.ms-Button.ms-Button--default:last-child {
            display: none !important;
          }
          /* Hide the built-in submit button so we can use our custom one */
          .bespokeFormContainer button.ms-Button.ms-Button--primary {
            display: none !important;
          }
        `}
      </style>
      <Stack tokens={{ childrenGap: 20 }}>
        <div className="bespokeFormContainer">
          <BespokeForm
            fields={initialFormFields}
            onSubmit={handleSubmit}
            onCancel={() => {}}
            isSubmitting={isSubmitting}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              {/* Left side: Date Ranges and Notes */}
              <Stack style={{ flex: 1 }} tokens={{ childrenGap: 10 }}>
                {dateRanges.map((range, index) => (
                  <Stack
                    key={index}
                    tokens={{ childrenGap: 5 }}
                    style={{
                      animation: 'fadeIn 0.5s ease forwards',
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
                          // Update this date range.
                          const updatedRanges = [...dateRanges];
                          updatedRanges[index] = newRange;
                          setDateRanges(updatedRanges);
                        }
                      }}
                      editableDateInputs
                      moveRangeOnFirstSelection={false}
                      months={1}
                      direction="horizontal"
                      rangeColors={[colours.highlight]}
                    />
                    {/* Allow removal of each date range */}
                    <DefaultButton
                      text="Remove Range"
                      onClick={() => handleRemoveDateRange(index)}
                      iconProps={{ iconName: 'Minus' }}
                      styles={buttonStylesFixedWidthSecondary}
                    />
                  </Stack>
                ))}
                {/* Add Holiday Button */}
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
                  onClick={handleAddDateRange}
                >
                  <Icon iconName="Add" style={{ fontSize: 24, color: '#ccc', marginRight: 8 }} />
                  <Text style={{ color: '#ccc', fontSize: '16px' }}>
                    {dateRanges.length === 0 ? 'Add Holiday' : 'Add Another Holiday'}
                  </Text>
                </div>
                {/* Notes Field */}
                <TextField
                  label="Notes (Optional)"
                  placeholder="Enter any additional notes"
                  value={notes}
                  onChange={(e, newVal) => setNotes(newVal || '')}
                  styles={textFieldStyles}
                  multiline
                  rows={3}
                />
                {/* Clear Button (will reset notes and date ranges) */}
                <DefaultButton
                  text="Clear"
                  onClick={handleClear}
                  styles={buttonStylesFixedWidthSecondary}
                />
              </Stack>
              {/* Right side: Totals side panel */}
              {renderSidePanel()}
            </div>
          </BespokeForm>
          {/* Custom Submit Button */}
          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <DefaultButton
              text={isSubmitDisabled ? 'Submit' : 'Submit'}
              disabled={isSubmitDisabled || isSubmitting}
              // Add a padlock icon if submission is locked.
              iconProps={isSubmitDisabled ? { iconName: 'Lock' } : {}}
              styles={buttonStylesFixedWidth}
              onClick={() => handleSubmit({})}
            />
          </div>
        </div>
        {/* Team Leave Conflicts (only shown if conflicts exist) */}
        {groupedLeave.length > 0 && (
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <div
              style={{
                ...infoBoxStyle,
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.grey,
              }}
            >
              <Icon
                iconName="Info"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: 10,
                  fontSize: 40,
                  opacity: 0.1,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                }}
              />
              <Stack tokens={{ childrenGap: 10 }}>
                <Text style={labelStyle}>Team Leave Conflicts</Text>
              </Stack>
              {renderTeamLeaveConflicts()}
            </div>
          </div>
        )}
      </Stack>
    </>
  );
}

export default AnnualLeaveForm;
