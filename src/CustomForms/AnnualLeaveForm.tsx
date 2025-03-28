// src/CustomForms/AnnualLeaveForm.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Stack, Text, DefaultButton, TextField, Icon, TooltipHost, ChoiceGroup } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { FormField } from './BespokeForms';
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import { addDays, eachDayOfInterval, format } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles, sharedDecisionButtonStyles } from '../app/styles/ButtonStyles';
import HelixAvatar from '../assets/helix avatar.png';
import GreyHelixMark from '../assets/grey helix mark.png'; // Not currently used
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

// NEW: Add optional bankHolidays prop to exclude them from the day count
interface AnnualLeaveFormProps {
  futureLeave: AnnualLeaveRecord[];
  team: TeamMember[];
  userData: any; // adjust type as needed
  totals: { standard: number; unpaid: number; purchase: number };
  bankHolidays?: Set<string>; // <-- Only addition to the props
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
 * Filters out weekends (Sat=6, Sun=0). Also accounts for halfDayStart / halfDayEnd,
 * reducing by 0.5 if those days are weekdays. NEW: Skips bank holiday dates too.
 */
function calculateWorkingDays(range: DateRangeSelection, bankHolidays?: Set<string>): number {
  const allDays = eachDayOfInterval({ start: range.startDate, end: range.endDate });
  let workingDays = 0;

  allDays.forEach((day) => {
    const dayOfWeek = day.getDay();
    // Use day string to check against the bankHolidays set
    const dayStr = format(day, 'yyyy-MM-dd');

    // Skip if weekend OR bank holiday
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(dayStr)) {
      workingDays += 1;
    }
  });

  // Subtract half-day if start date is a weekday and not a bank holiday
  if (range.halfDayStart) {
    const dayOfWeek = range.startDate.getDay();
    const startStr = format(range.startDate, 'yyyy-MM-dd');
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(startStr)) {
      workingDays -= 0.5;
    }
  }

  // Subtract half-day if end date is a weekday and not a bank holiday
  if (range.halfDayEnd) {
    const dayOfWeek = range.endDate.getDay();
    const endStr = format(range.endDate, 'yyyy-MM-dd');
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(endStr)) {
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
  bankHolidays, // <-- Just passed to the local calc
}: AnnualLeaveFormProps) {
  const { isDarkMode } = useTheme();
  const [dateRanges, setDateRanges] = useState<DateRangeSelection[]>([]);
  const [totalDays, setTotalDays] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState<string>('');
  // New state for displaying a confirmation message after submission
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');

  // NEW: Leave type selection state (default: standard)
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('standard');
  const leaveTypeOptions: { key: string; text: string }[] = [
    { key: 'standard', text: 'Standard' },
    { key: 'unpaid', text: 'Unpaid' },
    { key: 'purchase', text: 'Purchase' },
  ];

  // NEW: Hearing confirmation state.
  // Value will be either "yes" or "no". Null indicates no selection yet.
  const [hearingConfirmation, setHearingConfirmation] = useState<string | null>(null);
  const [hearingDetails, setHearingDetails] = useState<string>('');

  // Recalculate total days whenever the dateRanges OR bankHolidays change
  useEffect(() => {
    let total = 0;
    dateRanges.forEach((range) => {
      total += calculateWorkingDays(range, bankHolidays);
    });
    setTotalDays(total);
  }, [dateRanges, bankHolidays]);

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
    setHearingConfirmation(null);
    setHearingDetails('');
  };

  // Compute effective remaining leave.
  // For standard leave, use the holiday entitlement minus the standard total.
  // For unpaid or purchase, the entitlement is hard-coded to 5.
  const holidayEntitlement = Number(userData?.[0]?.holiday_entitlement ?? 0);
  let effectiveRemaining = 0;
  if (selectedLeaveType === 'standard') {
    effectiveRemaining = holidayEntitlement - totals.standard - totalDays;
  } else if (selectedLeaveType === 'unpaid') {
    effectiveRemaining = 5 - totals.unpaid - totalDays;
  } else if (selectedLeaveType === 'purchase') {
    effectiveRemaining = 5 - totals.purchase - totalDays;
  }

  /**
   * Group "futureLeave" records that overlap with any chosen date ranges.
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
              (dr) => dr.start_date === newRange.start_date && dr.end_date === newRange.end_date
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
   * Submits the form (POST to server).
   */
  const handleSubmit = async () => {
    // Client-side validation to ensure required fields are present
    if (dateRanges.length === 0) {
      alert("Please add at least one date range for your leave.");
      return;
    }

    if (!notes.trim()) {
      // Set a default reason if empty
      setNotes("No additional reason provided.");
    }

    setIsSubmitting(true);
    try {
      const feeEarner = userData?.[0]?.Initials || 'XX';
      const formattedDateRanges = dateRanges.map((range) => ({
        start_date: format(range.startDate, 'yyyy-MM-dd'),
        end_date: format(range.endDate, 'yyyy-MM-dd'),
      }));

      const payload = {
        fe: feeEarner,
        dateRanges: formattedDateRanges,
        reason: notes || "No additional reason provided.",
        days_taken: totalDays,
        leave_type: selectedLeaveType,
        overlapDetails: groupedLeave,
        hearing_confirmation: hearingConfirmation,
        hearing_details: hearingConfirmation === 'no' ? hearingDetails : ''
      };
      console.log('Annual Leave Form Payload:', payload);

      const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_INSERT_ANNUAL_LEAVE_CODE}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed with status ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      console.log('Insert Annual Leave Successful:', result);
      // Set a confirmation message instead of using alert
      setConfirmationMessage("Your annual leave request has been submitted successfully.");
      // Optionally, reset the form after successful submission
      handleClear();
    } catch (error) {
      console.error('Error submitting Annual Leave Form:', error);
      alert(`Error submitting your request: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Renders the side panel showing leave totals.
   */
  function renderSidePanel() {
    if (selectedLeaveType === 'standard') {
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
          <div style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, margin: '20px 0' }} />
          <Stack tokens={{ childrenGap: 5 }}>
            <Text style={labelStyle}>Annual Holiday Entitlement</Text>
            {userData?.[0]?.holiday_entitlement != null ? (
              <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {userData[0].holiday_entitlement} {userData[0].holiday_entitlement !== 1 ? 'days' : 'day'}
              </Text>
            ) : (
              <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                N/A
              </Text>
            )}
            <Text style={labelStyle}>Days taken so far this year</Text>
            <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {totals.standard} {totals.standard !== 1 ? 'days' : 'day'}
            </Text>
            <Text style={labelStyle}>Days Remaining</Text>
            <Text style={{ ...valueStyle, color: effectiveRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text }}>
              {effectiveRemaining} {effectiveRemaining !== 1 ? 'days' : 'day'}
            </Text>
          </Stack>
        </Stack>
      );
    } else if (selectedLeaveType === 'unpaid') {
      const unpaidRemaining = 5 - totals.unpaid - totalDays;
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
            Total Unpaid Days Requested
          </Text>
          <Text style={{ fontSize: '18px', fontWeight: 400, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            {totalDays} {totalDays !== 1 ? 'days' : 'day'}
          </Text>
          <div style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, margin: '20px 0' }} />
          <Stack tokens={{ childrenGap: 5 }}>
            <Text style={labelStyle}>Unpaid Leave Entitlement</Text>
            <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              5 days
            </Text>
            <Text style={labelStyle}>Unpaid Days Taken so far</Text>
            <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {totals.unpaid} {totals.unpaid !== 1 ? 'days' : 'day'}
            </Text>
            <Text style={labelStyle}>Unpaid Days Remaining</Text>
            <Text style={{ ...valueStyle, color: unpaidRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text }}>
              {unpaidRemaining} {unpaidRemaining !== 1 ? 'days' : 'day'}
            </Text>
          </Stack>
        </Stack>
      );
    } else if (selectedLeaveType === 'purchase') {
      const purchaseRemaining = 5 - totals.purchase - totalDays;
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
            Total Purchase Days Requested
          </Text>
          <Text style={{ fontSize: '18px', fontWeight: 400, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            {totalDays} {totalDays !== 1 ? 'days' : 'day'}
          </Text>
          <div style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, margin: '20px 0' }} />
          <Stack tokens={{ childrenGap: 5 }}>
            <Text style={labelStyle}>Purchase Leave Entitlement</Text>
            <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              5 days
            </Text>
            <Text style={labelStyle}>Purchase Days Taken so far</Text>
            <Text style={{ ...valueStyle, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {totals.purchase} {totals.purchase !== 1 ? 'days' : 'day'}
            </Text>
            <Text style={labelStyle}>Purchase Days Remaining</Text>
            <Text style={{ ...valueStyle, color: purchaseRemaining < 0 ? colours.cta : isDarkMode ? colours.dark.text : colours.light.text }}>
              {purchaseRemaining} {purchaseRemaining !== 1 ? 'days' : 'day'}
            </Text>
          </Stack>
        </Stack>
      );
    }
    return null;
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
          .bespokeFormContainer button.ms-Button.ms-Button--primary {
            display: none !important;
          }
          .custom-submit-button {
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
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
            // IMPORTANT: Pass an empty array for matters (or replace [] with matter data if available)
            matters={[]}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <Stack style={{ flex: 1 }} tokens={{ childrenGap: 10 }}>
                {/* NEW: Leave Type Selector as three side-by-side toggle buttons */}
                <Stack horizontal tokens={{ childrenGap: 10 }} styles={{ root: { width: '100%' } }}>
                  {leaveTypeOptions.map((option) => {
                    const isSelected = selectedLeaveType === option.key;
                    return (
                      <DefaultButton
                        key={option.key}
                        text={option.text}
                        onClick={() => setSelectedLeaveType(option.key)}
                        // Use the decision button style when selected, and default style otherwise
                        styles={ isSelected ? sharedDecisionButtonStyles : sharedDefaultButtonStyles }
                      />
                    );
                  })}
                </Stack>
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
                    <DefaultButton
                      text="Remove Range"
                      onClick={() => handleRemoveDateRange(index)}
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
                  onClick={handleAddDateRange}
                >
                  <Icon iconName="Add" style={{ fontSize: 24, color: '#ccc', marginRight: 8 }} />
                  <Text style={{ color: '#ccc', fontSize: '16px' }}>
                    {dateRanges.length === 0 ? 'Add Holiday' : 'Add Another Holiday'}
                  </Text>
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
                {/* NEW: Hearing Confirmation Section */}
                <Stack tokens={{ childrenGap: 10 }}>
                  <Stack horizontal tokens={{ childrenGap: 5 }} verticalAlign="center">
                    <Text style={{ fontWeight: 600 }}>
                      I confirm there are no hearings during my planned absence on any of the matters I am responsible for or have worked on in the last 3 months
                    </Text>
                    <TooltipHost content="Usually leave will not be approved at a time when there is a hearing listed to take place and where you are the fee earner with day to day conduct. Where you have worked on a file and request leave a decision on any leave request for that period will be made on a case by case basis taking into account that as a starting point you might be required to attend that hearing and briefing someone else to attend might be disproportionate.">
                      <Icon iconName="Info" styles={{ root: { fontSize: 16, cursor: 'pointer' } }} />
                    </TooltipHost>
                  </Stack>
                  <ChoiceGroup
                    selectedKey={hearingConfirmation || undefined}
                    options={[
                      { key: 'yes', text: 'Yes' },
                      { key: 'no', text: 'No' },
                    ]}
                    onChange={(ev, option) => setHearingConfirmation(option?.key || null)}
                    label="Please select an option"
                  />
                  {hearingConfirmation === 'no' && (
                    <TextField
                      label="There are the following hearings taking place during this period of absence"
                      value={hearingDetails}
                      onChange={(e, newVal) => setHearingDetails(newVal || '')}
                      multiline
                      rows={3}
                    />
                  )}
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                  <DefaultButton
                    text="Clear"
                    onClick={handleClear}
                    styles={buttonStylesFixedWidthSecondary}
                  />
                  <DefaultButton
                    text="Submit"
                    className="custom-submit-button"
                    styles={buttonStylesFixedWidth}
                    onClick={handleSubmit}
                    disabled={isSubmitting || totalDays === 0}
                  />
                </Stack>
                {confirmationMessage && (
                  <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#009900' }}>
                    {confirmationMessage}
                  </Text>
                )}
              </Stack>
              {renderSidePanel()}
            </div>
          </BespokeForm>
        </div>
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
