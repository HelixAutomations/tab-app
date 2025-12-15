// src/CustomForms/AnnualLeaveForm.tsx
// invisible change
import React, { useState, useEffect, useMemo } from 'react';
import { Stack, Text, DefaultButton, TextField, Icon, TooltipHost, ChoiceGroup, DetailsList, IColumn, SelectionMode, DetailsListLayoutMode } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { FormField } from './BespokeForms';
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import { addDays, eachDayOfInterval, format } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import '../app/styles/CustomDateRange.css';
import { getFormDefaultButtonStyles, getFormDecisionButtonStyles, getFormAccentOutlineButtonStyles, getChoiceGroupStyles } from './shared/formStyles';
import HelixAvatar from '../assets/helix avatar.png';
import GreyHelixMark from '../assets/grey helix mark.png'; // Not currently used
import '../app/styles/personas.css';
import { TeamData, AnnualLeaveRecord } from '../app/functionality/types';
// Note: Use relative Express API path for attendance endpoints to avoid double `/api` in production

interface AnnualLeaveFormProps {
  futureLeave: AnnualLeaveRecord[];
  team: TeamData[];
  userData: any;
  totals: { standard: number; unpaid: number; sale: number }; // Updated to match Azure Function
  bankHolidays?: Set<string>;
  allLeaveRecords: AnnualLeaveRecord[];
}

interface DateRangeSelection {
  startDate: Date;
  endDate: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

const initialFormFields: FormField[] = [];

const infoBoxStyle = (isDarkMode: boolean): React.CSSProperties => ({
  backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
  boxShadow: isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.04)',
  padding: '1.25rem',
  borderRadius: 0,
  animation: 'dropIn 0.3s ease forwards',
  marginBottom: '1.25rem',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
  borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
});

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  marginBottom: '5px',
  color: colours.highlight,
};

const valueStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 400,
  // Note: color is applied contextually based on theme
};

// Compact columns for the historical leave list
const getHistoryColumns = (isDarkMode: boolean): IColumn[] => [
  {
    key: 'dates',
    name: 'Dates',
    fieldName: 'dates',
    minWidth: 140,
    maxWidth: 180,
    isResizable: false,
    onRender: (item: AnnualLeaveRecord) => (
      <Text style={{ fontSize: '13px', color: isDarkMode ? colours.dark.text : colours.light.text }}>
        {format(new Date(item.start_date), 'd MMM')} - {format(new Date(item.end_date), 'd MMM yyyy')}
      </Text>
    ),
  },
  {
    key: 'days_taken',
    name: 'Days',
    fieldName: 'days_taken',
    minWidth: 50,
    maxWidth: 60,
    isResizable: false,
    onRender: (item: AnnualLeaveRecord) => (
      <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight }}>
        {item.days_taken ?? 'N/A'}
      </Text>
    ),
  },
  {
    key: 'status',
    name: 'Status',
    fieldName: 'status',
    minWidth: 90,
    maxWidth: 100,
    isResizable: false,
    onRender: (item: AnnualLeaveRecord) => {
      const statusColors: { [key: string]: string } = {
        'Approved': isDarkMode ? colours.green : '#059669',
        'Pending': isDarkMode ? colours.yellow : '#d97706',
        'Rejected': isDarkMode ? colours.cta : '#dc2626',
      };
      return (
        <Text style={{ 
          fontSize: '12px', 
          fontWeight: 600,
          color: statusColors[item.status] || (isDarkMode ? colours.dark.subText : colours.greyText),
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          {item.status}
        </Text>
      );
    },
  },
  {
    key: 'type',
    name: 'Type',
    fieldName: 'leave_type',
    minWidth: 80,
    maxWidth: 100,
    isResizable: false,
    onRender: (item: AnnualLeaveRecord) => (
      <Text style={{ fontSize: '13px', color: isDarkMode ? colours.dark.subText : colours.greyText }}>
        {item.leave_type || 'Standard'}
      </Text>
    ),
  },
];

function calculateWorkingDays(range: DateRangeSelection, bankHolidays?: Set<string>): number {
  const allDays = eachDayOfInterval({ start: range.startDate, end: range.endDate });
  let workingDays = 0;

  allDays.forEach((day) => {
    const dayOfWeek = day.getDay();
    const dayStr = format(day, 'yyyy-MM-dd');
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(dayStr)) {
      workingDays += 1;
    }
  });

  if (range.halfDayStart) {
    const dayOfWeek = range.startDate.getDay();
    const startStr = format(range.startDate, 'yyyy-MM-dd');
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(startStr)) {
      workingDays -= 0.5;
    }
  }

  if (range.halfDayEnd) {
    const dayOfWeek = range.endDate.getDay();
    const endStr = format(range.endDate, 'yyyy-MM-dd');
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bankHolidays?.has(endStr)) {
      workingDays -= 0.5;
    }
  }

  return workingDays;
}

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
  bankHolidays,
  allLeaveRecords,
}: AnnualLeaveFormProps) {
  const safeTotals = totals ?? { standard: 0, unpaid: 0, sale: 0 };
  const { isDarkMode } = useTheme();
  const [dateRanges, setDateRanges] = useState<DateRangeSelection[]>([]);
  const [totalDays, setTotalDays] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('standard');
  const [hearingConfirmation, setHearingConfirmation] = useState<string | null>(null);
  const [hearingDetails, setHearingDetails] = useState<string>('');

  const leaveTypeOptions: { key: string; text: string }[] = [
    { key: 'standard', text: 'Standard' },
    { key: 'purchase', text: 'Purchase' }, // Maps to "unpaid" in totals
    { key: 'sale', text: 'Sell' },         // Maps to "sale" in totals
  ];

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
      { startDate: new Date(), endDate: addDays(new Date(), 1) },
    ]);
  };

  const handleRemoveDateRange = (index: number) => {
    setDateRanges((prev) => {
      const newRanges = [...prev];
      newRanges.splice(index, 1);
      return newRanges;
    });
  };

  const handleClear = () => {
    setDateRanges([]);
    setNotes('');
    setHearingConfirmation(null);
    setHearingDetails('');
    setErrorMessage(''); // Clear any error messages
  };

  const holidayEntitlement = Number(userData?.[0]?.holiday_entitlement ?? 0);
  let effectiveRemaining = 0;
  if (selectedLeaveType === 'standard') {
    effectiveRemaining = holidayEntitlement - safeTotals.standard - totalDays;
  } else if (selectedLeaveType === 'purchase') {
    effectiveRemaining = 5 - safeTotals.unpaid - totalDays; // "Purchase" maps to "unpaid"
  } else if (selectedLeaveType === 'sale') {
    effectiveRemaining = 5 - safeTotals.sale - totalDays;   // "Sell" maps to "sale"
  }

  const groupedLeave = useMemo(() => {
    const groups: Record<
      string,
      { nickname: string; dateRanges: { start_date: string; end_date: string }[]; status: string }
    > = {};
    futureLeave.forEach((leave) => {
      dateRanges.forEach((range) => {
        const overlaps = getOverlapDates(leave, range);
        if (overlaps.length > 0) {
          const teamMember = team.find((m) => m.Initials?.toLowerCase() === leave.person.toLowerCase());
          const nickname = teamMember ? (teamMember.Nickname || teamMember.First || leave.person) : leave.person;
          const leaveStatus = leave.status.toLowerCase();
          const newRange = { start_date: overlaps[0], end_date: overlaps[overlaps.length - 1] };
          if (!groups[leave.person]) {
            groups[leave.person] = { nickname, dateRanges: [newRange], status: leaveStatus };
          } else {
            const alreadyExists = groups[leave.person].dateRanges.some(
              (dr) => dr.start_date === newRange.start_date && dr.end_date === newRange.end_date
            );
            if (!alreadyExists) groups[leave.person].dateRanges.push(newRange);
            if (groups[leave.person].status !== leaveStatus) groups[leave.person].status = 'requested';
          }
        }
      });
    });
    return Object.values(groups);
  }, [futureLeave, dateRanges, team]);

  const handleSubmit = async () => {
    // Clear previous messages
    setErrorMessage('');
    setConfirmationMessage('');
    
    if (dateRanges.length === 0) {
      setErrorMessage('Please add at least one date range for your leave.');
      return;
    }
    if (!notes.trim()) setNotes('No additional reason provided.');
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
        reason: notes || 'No additional reason provided.',
        days_taken: totalDays,
        leave_type: selectedLeaveType, // Will be "standard", "purchase", or "sale"
        overlapDetails: groupedLeave,
        hearing_confirmation: hearingConfirmation,
        hearing_details: hearingConfirmation === 'no' ? hearingDetails : '',
      };
  console.log('Annual Leave Form Payload:', payload);
  // Use server route (fully migrated from Azure Functions)
  // Always call the Express server directly; CRA proxy handles dev, same-origin handles prod
  const url = `/api/attendance/annual-leave`;
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
      setConfirmationMessage('✅ Your annual leave request has been submitted successfully and is pending approval.');
      handleClear();
    } catch (error) {
      console.error('Error submitting Annual Leave Form:', error);
      setErrorMessage(`❌ Failed to submit your request: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const userLeaveHistory = useMemo(() => {
    const userInitials = userData?.[0]?.Initials?.toLowerCase() || '';
    return allLeaveRecords
      .filter((record) => record.person.toLowerCase() === userInitials)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  }, [allLeaveRecords, userData]);

  // Removed renderSidePanel - now integrated into main layout

  function renderTeamLeaveConflicts() {
    if (!groupedLeave.length) return null;
    return (
      <Stack tokens={{ childrenGap: 10 }} style={{ marginTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {groupedLeave.map((item, idx) => {
            const formattedRanges = item.dateRanges
              .map((dr) => {
                const start = new Date(dr.start_date);
                const end = new Date(dr.end_date);
                const sameDay = dr.start_date === dr.end_date;
                return sameDay ? format(start, 'd MMM') : `${format(start, 'd MMM')} - ${format(end, 'd MMM')}`;
              })
              .join(' | ');
            let borderColor = colours.cta;
            if (item.status === 'approved') borderColor = colours.orange;
            else if (item.status === 'booked') borderColor = colours.green;
            return (
              <div
                key={idx}
                className="persona-bubble"
                style={{
                  animationDelay: `${idx * 0.1}s`,
                  border: `1px solid ${borderColor}`,
                  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.sectionBackground,
                  padding: '5px',
                  borderRadius: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '150px',
                }}
              >
                <div className="persona-icon-container" style={{ backgroundColor: 'transparent' }}>
                  <img src={HelixAvatar} alt={item.nickname} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                </div>
                <div style={{ marginTop: '5px', textAlign: 'center', width: '100%' }}>
                  <div className="persona-name-text" style={{ fontWeight: 600, fontSize: '16px', color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {item.nickname}
                  </div>
                  <div className="persona-range-text" style={{ fontSize: '14px', fontWeight: 400, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {formattedRanges}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Text style={{ fontStyle: 'italic', marginTop: '10px', color: isDarkMode ? colours.dark.text : colours.light.text }}>
          Please note: There are other team members scheduled for leave during the dates you've chosen...
        </Text>
      </Stack>
    );
  }

  return (
    <>
      <style key={isDarkMode ? 'dark' : 'light'}>
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
          .rdrDateRangePickerWrapper {
            display: flex !important;
            width: 100% !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .rdrDateRangeWrapper,
          .rdrCalendarWrapper,
          .rdrMonths {
            width: 100% !important;
            max-width: none !important;
            flex: 1 1 100% !important;
          }
          .rdrMonths {
            justify-content: center !important;
          }
          .rdrMonth {
            width: 100% !important;
            max-width: none !important;
            flex: 1 1 100% !important;
            padding: 16px 12px !important;
          }
          .rdrDefinedRangesWrapper {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
          }
          .rdrStaticRanges,
          .rdrInputRanges {
            display: none !important;
          }
        `}
        {isDarkMode && `
          /* Dark mode styles for react-date-range */
          .rdrCalendarWrapper {
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%) !important;
            color: ${colours.dark.text} !important;
            border-radius: 12px !important;
            border: 1px solid rgba(125, 211, 252, 0.24) !important;
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4) !important;
          }
          .rdrMonth {
            background-color: transparent !important;
          }
          .rdrMonthAndYearWrapper {
            background-color: transparent !important;
            color: ${colours.dark.text} !important;
          }
          .rdrMonthAndYearPickers select {
            background-color: rgba(15, 23, 42, 0.8) !important;
            color: ${colours.dark.text} !important;
            border: 1px solid rgba(125, 211, 252, 0.24) !important;
            border-radius: 6px !important;
            padding: 4px 8px !important;
          }
          .rdrMonthPicker select,
          .rdrYearPicker select {
            background-color: ${colours.dark.inputBackground} !important;
            color: ${colours.dark.text} !important;
          }
          .rdrWeekDay {
            color: ${colours.dark.text} !important;
          }
          .rdrDay {
            color: ${colours.dark.text} !important;
          }
          .rdrDayNumber span {
            color: ${colours.dark.text} !important;
          }
          .rdrDayPassive .rdrDayNumber span {
            color: ${colours.dark.text} !important;
            opacity: 0.4 !important;
          }
          .rdrDayToday .rdrDayNumber span:after {
            background: ${colours.highlight} !important;
          }
          .rdrDayDisabled {
            background-color: ${colours.dark.sectionBackground} !important;
          }
          .rdrDayDisabled .rdrDayNumber span {
            color: ${colours.dark.border} !important;
          }
          .rdrDateDisplayWrapper {
            background-color: transparent !important;
          }
          .rdrDateDisplay {
            background-color: transparent !important;
          }
          .rdrDateDisplayItem {
            background: rgba(15, 23, 42, 0.8) !important;
            border: 1px solid rgba(125, 211, 252, 0.24) !important;
            border-radius: 8px !important;
            color: ${colours.dark.text} !important;
            box-shadow: none !important;
          }
          .rdrDateDisplayItem input {
            color: ${colours.dark.text} !important;
            background: transparent !important;
          }
          .rdrDateInput {
            background-color: transparent !important;
          }
          .rdrDateInput input {
            color: ${colours.dark.text} !important;
            background-color: transparent !important;
          }
          .rdrMonthName {
            color: ${colours.dark.text} !important;
          }
          .rdrNextPrevButton {
            background-color: ${colours.dark.inputBackground} !important;
          }
          .rdrNextPrevButton:hover {
            background-color: ${colours.dark.border} !important;
          }
          .rdrPprevButton i,
          .rdrNextButton i {
            border-color: transparent ${colours.dark.text} transparent transparent !important;
          }
          .rdrPprevButton i {
            border-color: transparent transparent transparent ${colours.dark.text} !important;
          }
          
          /* ChoiceGroup (radio buttons) dark mode + brand colors */
          .ms-ChoiceField-labelWrapper {
            color: ${colours.dark.text} !important;
          }
          .ms-ChoiceFieldLabel {
            color: ${colours.dark.text} !important;
            font-weight: 500 !important;
          }
          .ms-ChoiceField-field:before {
            border-color: #64748b !important;
            border-width: 2px !important;
            background: ${colours.dark.inputBackground} !important;
          }
          .ms-ChoiceField-field.is-checked:before {
            border-color: ${colours.highlight} !important;
          }
          .ms-ChoiceField-field.is-checked:after {
            background-color: ${colours.highlight} !important;
            border-color: ${colours.highlight} !important;
          }
          .ms-ChoiceField:hover .ms-ChoiceField-field:before {
            border-color: ${colours.highlight} !important;
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
            matters={[]}
            hideButtons={true}
          >
            {/* Header Section: Leave Type + Summary Stats */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: '20px',
              marginBottom: '16px',
              alignItems: 'start'
            }}>
              {/* Leave Type Selection */}
              <div>
                <Text style={{ 
                  fontSize: '13px', 
                  fontWeight: 600, 
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  marginBottom: '8px',
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Leave Type
                </Text>
                <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
                  {leaveTypeOptions.map((option) => {
                    const isSelected = selectedLeaveType === option.key;
                    return (
                      <DefaultButton
                        key={option.key}
                        text={option.text}
                        onClick={() => setSelectedLeaveType(option.key)}
                        styles={isSelected ? getFormDecisionButtonStyles(isDarkMode) : getFormDefaultButtonStyles(isDarkMode)}
                      />
                    );
                  })}
                </Stack>
              </div>

              {/* Compact Summary Panel */}
              <div style={{
                minWidth: '240px',
                padding: '1rem 1.25rem',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
              }}>
                <Stack tokens={{ childrenGap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text style={{ fontSize: '12px', color: isDarkMode ? colours.dark.subText : colours.greyText, fontWeight: 600 }}>
                      Days Requested
                    </Text>
                    <Text style={{ fontSize: '20px', fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {totalDays}
                    </Text>
                  </div>
                  <div style={{ height: '1px', background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)' }} />
                  {selectedLeaveType === 'standard' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Entitlement</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{holidayEntitlement}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Used</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{safeTotals.standard}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Remaining</Text>
                        <Text style={{ 
                          fontWeight: 700, 
                          color: effectiveRemaining < 0 ? colours.cta : (isDarkMode ? colours.accent : colours.highlight)
                        }}>
                          {effectiveRemaining}
                        </Text>
                      </div>
                    </>
                  )}
                  {selectedLeaveType === 'purchase' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Purchase Limit</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>5</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Used</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{safeTotals.unpaid}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Remaining</Text>
                        <Text style={{ 
                          fontWeight: 700, 
                          color: (5 - safeTotals.unpaid - totalDays) < 0 ? colours.cta : (isDarkMode ? colours.accent : colours.highlight)
                        }}>
                          {5 - safeTotals.unpaid - totalDays}
                        </Text>
                      </div>
                    </>
                  )}
                  {selectedLeaveType === 'sale' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Sell Limit</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>5</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Used</Text>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{safeTotals.sale}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <Text style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>Remaining</Text>
                        <Text style={{ 
                          fontWeight: 700, 
                          color: (5 - safeTotals.sale - totalDays) < 0 ? colours.cta : (isDarkMode ? colours.accent : colours.highlight)
                        }}>
                          {5 - safeTotals.sale - totalDays}
                        </Text>
                      </div>
                    </>
                  )}
                </Stack>
              </div>
            </div>

            {/* Date Ranges Section */}
            <div style={{ marginBottom: '16px' }}>
              <Text style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                color: isDarkMode ? colours.dark.subText : colours.greyText,
                marginBottom: '8px',
                display: 'block',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Select Dates
              </Text>
              <Stack tokens={{ childrenGap: 12 }}>
                {dateRanges.map((range, index) => (
                  <Stack
                    key={index}
                    tokens={{ childrenGap: 8 }}
                    style={{
                      animation: 'fadeIn 0.5s ease forwards',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                      padding: '1rem',
                      borderRadius: 0,
                      background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
                      borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                      boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
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
                      staticRanges={[]}
                      inputRanges={[]}
                    />
                    
                    {/* Half Day Options */}
                    <div style={{
                      marginTop: '12px',
                      padding: '1rem',
                      borderRadius: 0,
                      background: isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.04)',
                      border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.1)'}`,
                    }}>
                      <Stack tokens={{ childrenGap: 10 }}>
                        <Text 
                          style={{ 
                            fontSize: '12px', 
                            fontWeight: 700,
                            color: isDarkMode ? colours.accent : colours.highlight,
                            textTransform: 'uppercase',
                            letterSpacing: '0.6px',
                            margin: '0 0 4px 0'
                          }}
                        >
                          Half-Day Options
                        </Text>
                        <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
                          {/* Start Half-Day */}
                          <div style={{
                            flex: '1 1 calc(50% - 6px)',
                            minWidth: '160px',
                            padding: '10px',
                            borderRadius: 0,
                            background: range.halfDayStart 
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)')
                              : (isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff'),
                            border: `1px solid ${range.halfDayStart
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)')}`,
                            borderLeft: range.halfDayStart 
                              ? `3px solid ${isDarkMode ? colours.accent : colours.highlight}`
                              : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}>
                            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                              <input
                                type="checkbox"
                                id={`halfDayStart_${index}`}
                                checked={range.halfDayStart || false}
                                onChange={(e) => {
                                  const updatedRanges = [...dateRanges];
                                  updatedRanges[index] = { ...range, halfDayStart: e.target.checked };
                                  setDateRanges(updatedRanges);
                                }}
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  cursor: 'pointer',
                                  accentColor: isDarkMode ? colours.accent : colours.highlight,
                                  flexShrink: 0
                                }}
                              />
                              <Stack tokens={{ childrenGap: 2 }} style={{ flex: 1 }}>
                                <label 
                                  htmlFor={`halfDayStart_${index}`}
                                  style={{ 
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: isDarkMode ? colours.dark.text : colours.light.text,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    margin: 0
                                  }}
                                >
                                  Start PM
                                </label>
                                <Text 
                                  style={{ 
                                    fontSize: '11px',
                                    color: isDarkMode ? 'rgba(203, 213, 225, 0.72)' : 'rgba(100, 116, 139, 0.8)',
                                    lineHeight: '1.4',
                                    margin: 0
                                  }}
                                >
                                  0.5 day
                                </Text>
                              </Stack>
                            </Stack>
                          </div>
                          
                          {/* End Half-Day */}
                          <div style={{
                            flex: '1 1 calc(50% - 6px)',
                            minWidth: '160px',
                            padding: '10px',
                            borderRadius: 0,
                            background: range.halfDayEnd 
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)')
                              : (isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff'),
                            border: `1px solid ${range.halfDayEnd
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)')}`,
                            borderLeft: range.halfDayEnd 
                              ? `3px solid ${isDarkMode ? colours.accent : colours.highlight}`
                              : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}>
                            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                              <input
                                type="checkbox"
                                id={`halfDayEnd_${index}`}
                                checked={range.halfDayEnd || false}
                                onChange={(e) => {
                                  const updatedRanges = [...dateRanges];
                                  updatedRanges[index] = { ...range, halfDayEnd: e.target.checked };
                                  setDateRanges(updatedRanges);
                                }}
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  cursor: 'pointer',
                                  accentColor: isDarkMode ? colours.accent : colours.highlight,
                                  flexShrink: 0
                                }}
                              />
                              <Stack tokens={{ childrenGap: 2 }} style={{ flex: 1 }}>
                                <label 
                                  htmlFor={`halfDayEnd_${index}`}
                                  style={{ 
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: isDarkMode ? colours.dark.text : colours.light.text,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    margin: 0
                                  }}
                                >
                                  End AM
                                </label>
                                <Text 
                                  style={{ 
                                    fontSize: '11px',
                                    color: isDarkMode ? 'rgba(203, 213, 225, 0.72)' : 'rgba(100, 116, 139, 0.8)',
                                    lineHeight: '1.4',
                                    margin: 0
                                  }}
                                >
                                  0.5 day
                                </Text>
                              </Stack>
                            </Stack>
                          </div>
                        </Stack>
                      </Stack>
                    </div>

                    <DefaultButton
                      text="Remove"
                      onClick={() => handleRemoveDateRange(index)}
                      iconProps={{ iconName: 'Cancel' }}
                      styles={{
                        ...getFormDefaultButtonStyles(isDarkMode),
                        root: { ...getFormDefaultButtonStyles(isDarkMode).root, width: '120px', marginTop: '12px' }
                      }}
                    />
                  </Stack>
                ))}
                <div
                  style={{
                    border: `1.5px dashed ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.3)'}`,
                    borderRadius: 0,
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={handleAddDateRange}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.04)';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.5)' : 'rgba(54, 144, 206, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.3)';
                  }}
                >
                  <Icon iconName="Add" style={{ 
                    fontSize: 18,
                    color: isDarkMode ? colours.accent : colours.highlight,
                    marginRight: 8,
                  }} />
                  <Text style={{ 
                    color: isDarkMode ? colours.dark.text : colours.light.text, 
                    fontSize: '13px',
                    fontWeight: 600,
                  }}>
                    {dateRanges.length === 0 ? 'Add Date Range' : 'Add Another Range'}
                  </Text>
                </div>
              </Stack>
            </div>

            {/* Additional Details Section */}
            <Stack tokens={{ childrenGap: 12 }}>
              <TextField
                label="Additional Notes (Optional)"
                placeholder="Reason for leave, handover notes, etc."
                value={notes}
                onChange={(e, newVal) => setNotes(newVal || '')}
                styles={{
                  root: {
                    '.ms-Label': {
                      color: `${isDarkMode ? '#f1f5f9' : '#374151'} !important`,
                      fontSize: '13px',
                      fontWeight: 600,
                    },
                  },
                  fieldGroup: {
                    borderRadius: 0,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                    selectors: {
                      ':hover': { borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)' },
                      ':focus-within': { borderColor: isDarkMode ? colours.accent : colours.highlight },
                    },
                  },
                  field: {
                    color: isDarkMode ? '#f1f5f9' : '#1e293b',
                    fontSize: '14px',
                  },
                }}
                multiline
                rows={2}
              />

              {/* Hearing Confirmation */}
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                background: isDarkMode ? 'rgba(31, 41, 55, 0.35)' : 'rgba(255, 255, 255, 0.65)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}>
                <Stack tokens={{ childrenGap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      No hearings scheduled during this absence
                    </Text>
                    <TooltipHost content="Leave requests may not be approved if hearings are scheduled">
                      <Icon iconName="Info" styles={{ root: { fontSize: 14, cursor: 'pointer', color: isDarkMode ? colours.dark.subText : colours.greyText } }} />
                    </TooltipHost>
                  </div>
                  <ChoiceGroup
                    selectedKey={hearingConfirmation || undefined}
                    options={[
                      { key: 'yes', text: 'Confirmed' },
                      { key: 'no', text: 'Hearings scheduled' },
                    ]}
                    onChange={(ev, option) => setHearingConfirmation(option?.key || null)}
                    styles={{
                      ...getChoiceGroupStyles(isDarkMode),
                      flexContainer: {
                        display: 'flex',
                        gap: '12px',
                      },
                      label: {
                        display: 'none',
                      },
                    }}
                  />
                  {hearingConfirmation === 'no' && (
                    <TextField
                      placeholder="Please provide hearing details..."
                      value={hearingDetails}
                      onChange={(e, newVal) => setHearingDetails(newVal || '')}
                      styles={{
                        fieldGroup: {
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                          selectors: {
                            ':hover': { borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)' },
                            ':focus-within': { borderColor: isDarkMode ? colours.accent : colours.highlight },
                          },
                        },
                        field: {
                          color: isDarkMode ? '#f1f5f9' : '#1e293b',
                          fontSize: '14px',
                        },
                      }}
                      multiline
                      rows={2}
                    />
                  )}
                </Stack>
              </div>
            </Stack>

            {/* Actions and Feedback */}
            <div style={{ marginTop: '16px' }}>
              <Stack horizontal tokens={{ childrenGap: 10 }} styles={{ root: { marginBottom: '12px' } }}>
                <DefaultButton
                  text="Clear All"
                  onClick={handleClear}
                  iconProps={{ iconName: 'Clear' }}
                  styles={{
                    ...getFormDefaultButtonStyles(isDarkMode),
                    root: { ...getFormDefaultButtonStyles(isDarkMode).root, width: '150px' }
                  }}
                />
                <DefaultButton
                  text={isSubmitting ? 'Submitting...' : 'Submit Request'}
                  className="custom-submit-button"
                  styles={getFormAccentOutlineButtonStyles(isDarkMode, '150px')}
                  onClick={handleSubmit}
                  disabled={isSubmitting || totalDays === 0}
                  iconProps={{ iconName: 'Send' }}
                />
              </Stack>
              
              {confirmationMessage && (
                <div style={{ 
                  fontWeight: 600,
                  fontSize: '13px',
                  color: isDarkMode ? '#86efac' : '#166534',
                  padding: '12px 16px',
                  backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)',
                  borderRadius: 0,
                  borderLeft: '3px solid #22c55e',
                  border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Icon iconName="CheckMark" />
                  {confirmationMessage}
                </div>
              )}
              {errorMessage && (
                <div style={{ 
                  fontWeight: 600,
                  fontSize: '13px',
                  color: isDarkMode ? '#fca5a5' : '#7f1d1d',
                  padding: '12px 16px',
                  backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)',
                  borderRadius: 0,
                  borderLeft: '3px solid #ef4444',
                  border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Icon iconName="ErrorBadge" />
                  {errorMessage}
                </div>
              )}
            </div>
          </BespokeForm>
        </div>
        {groupedLeave.length > 0 && (
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <div style={infoBoxStyle(isDarkMode)}>
              <Icon
                iconName="Info"
                style={{ position: 'absolute', right: 10, top: 10, fontSize: 40, opacity: 0.1, color: isDarkMode ? colours.dark.text : colours.light.text }}
              />
              <Stack tokens={{ childrenGap: 10 }}>
                <Text style={labelStyle}>Team Leave Conflicts</Text>
              </Stack>
              {renderTeamLeaveConflicts()}
            </div>
          </div>
        )}

        {/* Leave History Section */}
        <div style={{ marginTop: '24px' }}>
          <Text
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              marginBottom: '10px',
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Your Leave History
          </Text>
          {userLeaveHistory.length > 0 ? (
            <div style={{
              backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
              overflow: 'hidden',
              boxShadow: isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.03)'
            }}>
              <DetailsList
                items={userLeaveHistory}
                columns={getHistoryColumns(isDarkMode)}
                setKey="set"
                layoutMode={DetailsListLayoutMode.justified}
                selectionMode={SelectionMode.none}
                compact={false}
                styles={{
                  root: {
                    backgroundColor: 'transparent',
                    '.ms-DetailsRow': {
                      backgroundColor: 'transparent',
                      borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.05)'}`,
                      minHeight: '48px'
                    },
                    '.ms-DetailsRow:last-child': {
                      borderBottom: 'none'
                    },
                    '.ms-DetailsRow:hover': {
                      backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)',
                    },
                    '.ms-DetailsRow-cell': {
                      paddingTop: '12px',
                      paddingBottom: '12px'
                    }
                  },
                  headerWrapper: {
                    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(248, 250, 252, 0.8)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'}`,
                    '.ms-DetailsHeader': {
                      paddingTop: '0px',
                      borderTop: 'none'
                    },
                    '.ms-DetailsHeader-cell': {
                      height: '40px',
                      lineHeight: '40px'
                    },
                    '.ms-DetailsHeader-cellTitle': {
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isDarkMode ? colours.dark.subText : colours.greyText,
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px'
                    }
                  },
                  contentWrapper: {
                    backgroundColor: 'transparent'
                  }
                }}
              />
            </div>
          ) : (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
            }}>
              <Icon 
                iconName="CalendarMirrored" 
                style={{ 
                  fontSize: '32px', 
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)',
                  marginBottom: '8px'
                }} 
              />
              <Text style={{ 
                color: isDarkMode ? colours.dark.subText : colours.greyText, 
                fontStyle: 'italic',
                fontSize: '13px',
                display: 'block'
              }}>
                No leave history available.
              </Text>
            </div>
          )}
        </div>
      </Stack>
    </>
  );
}

export default AnnualLeaveForm;