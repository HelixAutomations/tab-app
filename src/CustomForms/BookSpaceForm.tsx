import React, { useState, useEffect } from 'react';
// invisible change
import { 
  Stack, 
  Text, 
  Spinner, 
  SpinnerSize, 
  Icon, 
  DefaultButton, 
  IconButton, 
  TooltipHost,
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  MessageBar,
  MessageBarType,
  mergeStyles
} from '@fluentui/react';
import { keyframes } from '@fluentui/react/lib/Styling';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import BespokeForm, { FormField } from './BespokeForms';
import {
  BoardroomBooking,
  SoundproofPodBooking,
  FutureBookingsResponse
} from '../app/functionality/types';
import { getFormSelectionButtonStyles, getFormDefaultButtonStyles, getFormSectionStyle, getFormSectionHeaderStyle, getInfoBoxTextStyle } from './shared/formStyles';



export interface BookSpaceData {
  fee_earner: string;
  booking_date: string;
  booking_time: string; // Expected format: 'HH:MM:SS'
  duration: number;
  reason: string;
  spaceType: 'Boardroom' | 'Soundproof Pod';
}

export interface BookSpaceFormProps {
  onCancel: () => void;
  feeEarner: string;
  futureBookings?: FutureBookingsResponse;
  onBookingCreated?: () => void;
  realtimePulse?: { nonce: number; id?: string; spaceType?: 'Boardroom' | 'Soundproof Pod'; changeType?: string };
}

const bookingRowPulse = keyframes({
  '0%': {
    boxShadow: '0 0 0 rgba(54,144,206,0)',
    transform: 'translateZ(0)',
  },
  '35%': {
    boxShadow: '0 0 0 3px rgba(54,144,206,0.25), 0 10px 22px rgba(54,144,206,0.18)',
    transform: 'translateY(-1px)',
  },
  '100%': {
    boxShadow: '0 0 0 rgba(54,144,206,0)',
    transform: 'translateZ(0)',
  },
});

const BookSpaceForm: React.FC<BookSpaceFormProps> = ({
  onCancel,
  feeEarner,
  futureBookings,
  onBookingCreated,
  realtimePulse,
}) => {
  const { isDarkMode } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<boolean>(false);
  const [conflictMessage, setConflictMessage] = useState<string>("");
  const [formValues, setFormValues] = useState<{ [key: string]: any }>({});
  const [bookingsForDay, setBookingsForDay] = useState<(BoardroomBooking | SoundproofPodBooking)[]>([]);
  const [twoWeekBookings, setTwoWeekBookings] = useState<{
    [date: string]: (BoardroomBooking | SoundproofPodBooking)[];
  }>({});
  const [selectedSpaceType, setSelectedSpaceType] = useState<'Boardroom' | 'Soundproof Pod' | null>(null);
  const [displayWeeks, setDisplayWeeks] = useState(2); // Start with 2 weeks
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<(BoardroomBooking | SoundproofPodBooking) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Dark mode dialog styling
  const dialogContainerClass = mergeStyles({
    '& .ms-Dialog-main': {
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      borderRadius: 0,
      border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(15, 23, 42, 0.08)',
    },
    '& .ms-Dialog-title': {
      color: isDarkMode ? colours.dark.text : colours.light.text,
      fontWeight: 600,
    },
    '& .ms-Dialog-subText': {
      color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
    },
  });

  const realtimePulseId = realtimePulse?.id ? String(realtimePulse.id) : '';
  const realtimePulseSpaceType = realtimePulse?.spaceType;
  const realtimePulseNonce = realtimePulse?.nonce || 0;

  const formFields: FormField[] = [
    {
      label: 'Booking Date',
      name: 'bookingDate',
      type: 'date',
      required: true,
      placeholder: 'YYYY-MM-DD',
    },
    {
      label: 'Start Time',
      name: 'bookingTime',
      type: 'time',
      required: true,
      placeholder: 'HH:MM',
    },
    {
      label: 'Duration (hours)',
      name: 'duration',
      type: 'number',
      required: true,
      placeholder: 'Enter duration in hours',
    },
    {
      label: 'Additional Notes',
      name: 'reason',
      type: 'textarea',
      required: true,
      placeholder: 'Any special requirements...',
    },
  ];

  function checkConflictAndSuggest(values: { [key: string]: any }): {
    hasConflict: boolean;
    conflictEnd?: Date;
    nextAvailable?: string;
  } {
    const { bookingDate, bookingTime, duration } = values;
    const spaceType = selectedSpaceType;
    if (!bookingDate || !bookingTime || !spaceType || !duration) {
      return { hasConflict: false };
    }

    let dateStr = bookingDate;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    let timeStr = bookingTime;
    if (timeStr.length === 5) {
      timeStr = `${timeStr}:00`;
    }
    // Parse time parts to avoid timezone conversion
    const timeParts = timeStr.split(':');
    const newStart = new Date(dateStr);
    newStart.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2] || '0'), 0);
    const newEnd = new Date(newStart.getTime() + Number(duration) * 3600000);

    let relevantBookings: (BoardroomBooking | SoundproofPodBooking)[] = [];
    if (futureBookings) {
      relevantBookings =
        spaceType === 'Boardroom'
          ? futureBookings.boardroomBookings
          : futureBookings.soundproofBookings;
    }

    const dayBookings = relevantBookings.filter((b) => b.booking_date === dateStr);
    let latestConflictEnd: Date | undefined;
    for (const booking of dayBookings) {
      // Parse time parts to create Date without timezone conversion
      const bookingTimeParts = booking.booking_time.split(':').map(p => p.split('.')[0]);
      const existingStart = new Date(booking.booking_date);
      existingStart.setHours(parseInt(bookingTimeParts[0]), parseInt(bookingTimeParts[1]), parseInt(bookingTimeParts[2] || '0'), 0);
      const existingEnd = new Date(existingStart.getTime() + booking.duration * 3600000);
      if (newStart < existingEnd && newEnd > existingStart) {
        if (!latestConflictEnd || existingEnd > latestConflictEnd) {
          latestConflictEnd = existingEnd;
        }
      }
    }

    if (latestConflictEnd) {
      const nextAvailable = findNextAvailableSlot(dayBookings, latestConflictEnd, Number(duration), dateStr);
      return {
        hasConflict: true,
        conflictEnd: latestConflictEnd,
        nextAvailable,
      };
    }

    return { hasConflict: false };
  }

  function findNextAvailableSlot(
    dayBookings: (BoardroomBooking | SoundproofPodBooking)[],
    startAfter: Date,
    duration: number,
    dateStr: string
  ): string | undefined {
    const dayEnd = new Date(`${dateStr}T23:59:59`);
    let proposedStart = new Date(startAfter);

    while (proposedStart <= dayEnd) {
      const proposedEnd = new Date(proposedStart.getTime() + duration * 3600000);
      let isSlotAvailable = true;

      for (const booking of dayBookings) {
        // Parse time parts to create Date without timezone conversion
        const timeParts = booking.booking_time.split(':').map(p => p.split('.')[0]);
        const existingStart = new Date(booking.booking_date);
        existingStart.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2] || '0'), 0);
        const existingEnd = new Date(existingStart.getTime() + booking.duration * 3600000);
        if (proposedStart < existingEnd && proposedEnd > existingStart) {
          isSlotAvailable = false;
          proposedStart = new Date(existingEnd);
          break;
        }
      }

      if (isSlotAvailable && proposedEnd <= dayEnd) {
        return proposedStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    return undefined;
  }

  useEffect(() => {
    const { bookingDate } = formValues;
    if (!bookingDate || !selectedSpaceType) {
      setBookingsForDay([]);
      return;
    }
    let dateStr = bookingDate;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    let relevantBookings: (BoardroomBooking | SoundproofPodBooking)[] = [];
    if (futureBookings) {
      relevantBookings =
        selectedSpaceType === 'Boardroom'
          ? futureBookings.boardroomBookings
          : futureBookings.soundproofBookings;
    }
    const dayBookings = relevantBookings.filter((b) => b.booking_date === dateStr);
    setBookingsForDay(dayBookings);
  }, [formValues.bookingDate, selectedSpaceType, futureBookings]);

  useEffect(() => {
    const { hasConflict, conflictEnd, nextAvailable } = checkConflictAndSuggest(formValues);
    setConflict(hasConflict);

    if (hasConflict && conflictEnd) {
      const endTime = conflictEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let message = `Conflict until ${endTime}.`;
      if (nextAvailable) {
        message += ` Your ${formValues.duration}-hour booking fits at ${nextAvailable}.`;
      } else {
        message += ` No ${formValues.duration}-hour slot available today.`;
      }
      setConflictMessage(message);
    } else {
      setConflictMessage('');
    }
  }, [formValues.bookingTime, formValues.bookingDate, formValues.duration, selectedSpaceType]);

  useEffect(() => {
    if (!futureBookings) {
      setTwoWeekBookings({});
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1); // Set to oneのようなyear from today

    const bookingsByDate: { [date: string]: (BoardroomBooking | SoundproofPodBooking)[] } = {};

    // Generate dates for the next year, excluding weekends
    let currentDate = new Date(today);
    while (currentDate <= oneYearLater) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude weekends
        const dateStr = currentDate.toISOString().split('T')[0];
        bookingsByDate[dateStr] = [];
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Populate bookings
    const allBookings = selectedSpaceType
      ? (selectedSpaceType === 'Boardroom' ? futureBookings.boardroomBookings : futureBookings.soundproofBookings)
      : [...futureBookings.boardroomBookings, ...futureBookings.soundproofBookings];

    allBookings.forEach((booking) => {
      const bookingDate = booking.booking_date;
      if (bookingsByDate[bookingDate]) {
        bookingsByDate[bookingDate].push(booking);
      }
    });

    setTwoWeekBookings(bookingsByDate);
  }, [futureBookings, selectedSpaceType]);

  const handleFieldChange = (vals: { [key: string]: any }) => {
    setFormValues(vals);
  };

  async function handleFormSubmit(values: { [key: string]: any }) {
    if (conflict || !selectedSpaceType) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    let t = values.bookingTime;
    if (t.length === 5) {
      t = t + ':00';
    }
    const formattedTime = t;
    const payload: BookSpaceData = {
      fee_earner: feeEarner,
      booking_date: values.bookingDate,
      booking_time: formattedTime,
      duration: Number(values.duration),
      reason: values.reason,
      spaceType: selectedSpaceType,
    };
    try {
      await submitBooking(payload);
      setSubmissionSuccess(true);
      onBookingCreated?.(); // Trigger refresh of future bookings
      setTimeout(() => {
        onCancel();
      }, 2000);
    } catch (err: any) {
      setSubmissionError(err.message || 'Booking failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitBooking(data: BookSpaceData) {
  const url = '/api/book-space';
    let finalTimeStr = data.booking_time;
    if (!finalTimeStr.includes('.')) {
      finalTimeStr += '.0000000';
    } else {
      const [time, fraction = ''] = finalTimeStr.split('.');
      finalTimeStr = `${time}.${(fraction + '0000000').slice(0, 7)}`;
    }
    const finalPayload = {
      ...data,
      booking_time: finalTimeStr,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
    });
    if (!response.ok) {
      throw new Error(`Booking failed with status ${response.status}`);
    }
    return response.json();
  }

  const formatBookingTime = (booking: BoardroomBooking | SoundproofPodBooking) => {
    // Parse time parts to avoid timezone conversion
    const timeParts = booking.booking_time.split(':').map(p => p.split('.')[0]);
    const start = new Date(booking.booking_date);
    start.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2] || '0'), 0);
    const end = new Date(start.getTime() + booking.duration * 3600000);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleSpaceSelection = (spaceType: 'Boardroom' | 'Soundproof Pod') => {
    setSelectedSpaceType(spaceType);
    setFormValues({ ...formValues, spaceType });
  };

  // Helper to get bookings for the displayed period
  const getDisplayedBookings = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + displayWeeks * 7); // Calculate end date based on weeks
    return Object.entries(twoWeekBookings)
      .filter(([date, bookings]) => {
        const d = new Date(date);
        return d >= today && d <= endDate && bookings.length > 0; // Only show dates with bookings
      })
      .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());
  };

  // Load more weeks
  const handleLoadMore = () => {
    setDisplayWeeks((prev) => prev + 2); // Add 2 more weeks
  };

  // Delete booking functions
  const handleDeleteBooking = (booking: BoardroomBooking | SoundproofPodBooking) => {
    setBookingToDelete(booking);
    setDeleteDialogOpen(true);
    setDeleteError(null);
  };

  const confirmDeleteBooking = async () => {
    if (!bookingToDelete) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      const spaceType = 'booking_date' in bookingToDelete ? 
        (selectedSpaceType || 'Boardroom') : 
        (selectedSpaceType || 'Soundproof Pod');
        
      const response = await fetch(`/api/book-space/${encodeURIComponent(spaceType)}/${bookingToDelete.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete booking');
      }
      
      console.log(`Deleted booking ${bookingToDelete.id}`);
      
      // Close dialog immediately
      const deletedId = bookingToDelete.id;
      const deletedReason = bookingToDelete.reason;
      setDeleteDialogOpen(false);
      setBookingToDelete(null);
      
      // Update local state immediately for instant UI feedback
      setTwoWeekBookings(prev => {
        const updated = { ...prev };
        for (const date in updated) {
          updated[date] = updated[date].filter(b => b.id !== deletedId);
        }
        return updated;
      });
      
      setBookingsForDay(prev => prev.filter(b => b.id !== deletedId));
      
      // Show success toast
      showToast(`Booking "${deletedReason}" deleted`, 'success');
      
      // Also trigger parent refresh for data consistency
      onBookingCreated?.();
      
    } catch (error: any) {
      console.error('Delete booking error:', error);
      setDeleteError(error.message || 'Failed to delete booking');
      showToast(error.message || 'Failed to delete booking', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDeleteBooking = () => {
    setDeleteDialogOpen(false);
    setBookingToDelete(null);
    setDeleteError(null);
  };

  return (
    <Stack tokens={{ childrenGap: 20 }} styles={{ root: { padding: '20px', position: 'relative' } }}>
      {!selectedSpaceType ? (
        <Stack horizontal tokens={{ childrenGap: 24 }} horizontalAlign="center">
          <DefaultButton
            onClick={() => handleSpaceSelection('Boardroom')}
            styles={getFormSelectionButtonStyles(isDarkMode)}
            iconProps={{ iconName: 'OfficeChat' }}
            text="Boardroom"
          />
          <DefaultButton
            onClick={() => handleSpaceSelection('Soundproof Pod')}
            styles={getFormSelectionButtonStyles(isDarkMode)}
            iconProps={{ iconName: 'Phone' }}
            text="Soundproof Pod"
          />
        </Stack>
      ) : (
        <>
          {isSubmitting && (
            <Stack horizontalAlign="center" styles={{ root: { position: 'absolute', width: '100%', zIndex: 1 } }}>
              <Spinner size={SpinnerSize.large} label="Booking in progress..." />
            </Stack>
          )}
          {submissionSuccess && (
            <Stack
              horizontalAlign="center"
              styles={{
                root: {
                  position: 'absolute',
                  width: '100%',
                  zIndex: 1,
                  backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                  padding: '12px',
                  borderRadius: 0,
                  borderLeft: '3px solid #22c55e',
                  boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
            >
              <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                <Icon iconName="CheckMark" styles={{ root: { color: colours.green, fontSize: '24px' } }} />
                <Text variant="xLarge" styles={{ root: { color: colours.green, fontWeight: 600 } }}>
                  Booking confirmed!
                </Text>
              </Stack>
            </Stack>
          )}
          {submissionError && (
            <Stack horizontalAlign="center" styles={{ root: { position: 'absolute', width: '100%', zIndex: 1 } }}>
              <Text variant="large" styles={{ root: { color: 'red' } }}>
                {submissionError}
              </Text>
            </Stack>
          )}
          {conflict && (
            <Stack horizontalAlign="center" styles={{ root: { marginBottom: '10px' } }}>
              <Text variant="large" styles={{ root: { color: colours.cta, fontWeight: 600 } }}>
                {conflictMessage}
              </Text>
            </Stack>
          )}
          <BespokeForm
            fields={formFields}
            onSubmit={handleFormSubmit}
            onCancel={onCancel}
            onChange={handleFieldChange}
            matters={[]}
            submitDisabled={conflict || isSubmitting}
            conflict={conflict}
          />

          {bookingsForDay.length > 0 && (
            <div style={getFormSectionStyle(isDarkMode, isDarkMode ? colours.accent : colours.highlight)}>
              <div style={getFormSectionHeaderStyle(isDarkMode, isDarkMode ? colours.accent : colours.highlight)}>
                <Icon iconName="EventDate" style={{ fontSize: 16 }} />
                {selectedSpaceType} on {new Date(formValues.bookingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <Stack tokens={{ childrenGap: 6 }}>
                {bookingsForDay.map((b) => (
                  <div
                    key={(realtimePulseId && String(b.id) === realtimePulseId) ? `${b.id}-${realtimePulseNonce}` : b.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                      borderRadius: 0,
                      transition: 'background 0.15s ease',
                      ...(realtimePulseId
                        && String(b.id) === realtimePulseId
                        && (!realtimePulseSpaceType || realtimePulseSpaceType === selectedSpaceType)
                        ? {
                            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.55)' : 'rgba(54,144,206,0.45)'}`,
                            backgroundColor: isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.06)',
                          }
                        : {}),
                    }}
                  >
                    <div style={{ width: '3px', height: '28px', background: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }} />
                    <Text variant="smallPlus" styles={{ root: { fontWeight: 600, minWidth: '100px', color: isDarkMode ? colours.accent : colours.blue, fontSize: '11px' } }}>
                      {formatBookingTime(b)}
                    </Text>
                    <Text variant="smallPlus" styles={{ root: { color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)', fontSize: '11px', flex: 1 } }}>
                      {b.reason} <span style={{ fontWeight: 300 }}>(by {b.fee_earner})</span>
                    </Text>
                  </div>
                ))}
              </Stack>
            </div>
          )}

          <div style={getFormSectionStyle(isDarkMode, isDarkMode ? colours.accent : colours.highlight)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, isDarkMode ? colours.accent : colours.highlight)}>
              <Icon iconName="Calendar" style={{ fontSize: 16 }} />
              {selectedSpaceType ? `${selectedSpaceType} Availability` : 'Space Availability'}
            </div>
            <Text style={getInfoBoxTextStyle(isDarkMode)}>
              Upcoming bookings for this space. Click the delete button to remove your bookings.
            </Text>
            <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: '12px' } }}>
              {getDisplayedBookings().length > 0 ? (
                <>
                  {getDisplayedBookings().map(([date, bookings]) => (
                    <Stack key={date} tokens={{ childrenGap: 6 }}>
                      <Text
                        styles={{ root: { fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' } }}
                      >
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      {bookings.length > 0 ? (
                        <Stack tokens={{ childrenGap: 6 }}>
                          {bookings.map((b) => (
                            <div
                              key={(realtimePulseId && String(b.id) === realtimePulseId) ? `${b.id}-${realtimePulseNonce}` : b.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px',
                                background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                                borderRadius: 0,
                                transition: 'background 0.15s ease',
                                ...(realtimePulseId
                                  && String(b.id) === realtimePulseId
                                  && (!realtimePulseSpaceType || realtimePulseSpaceType === selectedSpaceType)
                                  ? {
                                      border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.55)' : 'rgba(54,144,206,0.45)'}`,
                                      backgroundColor: isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.06)',
                                    }
                                  : {}),
                              }}
                            >
                              <div style={{ width: '3px', height: '28px', background: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }} />
                              <Text variant="smallPlus" styles={{ root: { fontWeight: 600, minWidth: '100px', color: isDarkMode ? colours.accent : colours.blue, fontSize: '11px' } }}>
                                {formatBookingTime(b)}
                              </Text>
                              <Text variant="smallPlus" styles={{ root: { color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)', fontSize: '11px', flex: 1 } }}>
                                {b.reason} <span style={{ fontWeight: 300 }}>(by {b.fee_earner})</span>
                              </Text>
                              <TooltipHost content="Delete">
                                <IconButton
                                  iconProps={{ iconName: 'Delete', style: { fontSize: '11px' } }}
                                  onClick={() => handleDeleteBooking(b)}
                                  styles={{
                                    root: {
                                      width: 22,
                                      height: 22,
                                      background: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                                      border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)'}`,
                                      borderRadius: 0,
                                      transition: 'background 0.15s, border-color 0.15s, color 0.15s'
                                    },
                                    rootHovered: {
                                      background: isDarkMode ? 'rgba(248, 113, 113, 0.2)' : 'rgba(248, 113, 113, 0.14)',
                                      borderColor: isDarkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(248, 113, 113, 0.4)'
                                    },
                                    icon: { color: '#D65541' }
                                  }}
                                />
                              </TooltipHost>
                            </div>
                          ))}
                        </Stack>
                      ) : (
                        <Text variant="smallPlus" styles={{ root: { color: isDarkMode ? colours.dark.subText : '#999', marginLeft: '10px', fontStyle: 'italic' } }}>
                          No bookings scheduled
                        </Text>
                      )}
                    </Stack>
                  ))}
                  <DefaultButton
                    text="Load More"
                    onClick={handleLoadMore}
                    styles={getFormDefaultButtonStyles(isDarkMode)}
                  />
                </>
              ) : (
                <Text style={getInfoBoxTextStyle(isDarkMode)}>
                  No upcoming bookings
                </Text>
              )}
            </Stack>
          </div>
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 20px',
          backgroundColor: isDarkMode
            ? (toast.type === 'success' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)')
            : (toast.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'),
          border: `1px solid ${toast.type === 'success'
            ? (isDarkMode ? 'rgba(74, 222, 128, 0.4)' : 'rgba(74, 222, 128, 0.3)')
            : (isDarkMode ? 'rgba(248, 113, 113, 0.4)' : 'rgba(248, 113, 113, 0.3)')}`,
          borderRadius: 0,
          boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
          color: toast.type === 'success'
            ? (isDarkMode ? '#4ade80' : '#15803d')
            : (isDarkMode ? '#f87171' : '#b91c1c'),
          fontSize: '13px',
          fontWeight: 500,
        }}>
          <Icon iconName={toast.type === 'success' ? 'CheckMark' : 'ErrorBadge'} />
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        hidden={!deleteDialogOpen}
        onDismiss={cancelDeleteBooking}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Delete Booking',
          subText: bookingToDelete ? 
            `Delete "${bookingToDelete.reason}" on ${new Date(bookingToDelete.booking_date).toLocaleDateString()}? This cannot be undone.` :
            'Are you sure you want to delete this booking?',
          className: dialogContainerClass,
        }}
        modalProps={{
          isBlocking: false,
          styles: {
            main: {
              backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: 0,
              border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(15, 23, 42, 0.08)',
            },
          },
        }}
        minWidth={340}
      >
        {deleteError && (
          <MessageBar messageBarType={MessageBarType.error} styles={{
            root: { marginBottom: '16px' }
          }}>
            {deleteError}
          </MessageBar>
        )}
        <DialogFooter>
          <PrimaryButton 
            onClick={confirmDeleteBooking} 
            text={isDeleting ? 'Deleting...' : 'Delete'}
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: colours.cta,
                border: 'none',
                borderRadius: 0,
              },
              rootHovered: {
                backgroundColor: '#c74a3a',
              },
            }}
          />
          <DefaultButton 
            onClick={cancelDeleteBooking} 
            text="Cancel"
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15, 23, 42, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'}`,
                borderRadius: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
              rootHovered: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(15, 23, 42, 0.08)',
              },
            }}
          />
        </DialogFooter>
      </Dialog>
    </Stack>
  );
};

export default BookSpaceForm;