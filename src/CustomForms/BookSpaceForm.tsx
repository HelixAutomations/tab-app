import React, { useState, useEffect } from 'react';
import { Stack, Text, Spinner, SpinnerSize, Icon, DefaultButton, IButtonStyles } from '@fluentui/react';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import BespokeForm, { FormField } from './BespokeForms';
import {
  BoardroomBooking,
  SoundproofPodBooking,
  FutureBookingsResponse
} from '../app/functionality/types';

// Refined selection styles with pronounced states and larger size
const selectionStyles: IButtonStyles = {
  root: {
    padding: '16px 28px',
    borderRadius: '10px',
    backgroundColor: colours.grey,
    border: 'none',
    height: '70px',
    minWidth: '220px',
    fontWeight: '600',
    fontSize: '18px',
    color: colours.greyText,
    transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rootHovered: {
    backgroundColor: colours.highlight,
    color: '#ffffff',
    boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
    transform: 'translateY(-3px)',
  },
  rootPressed: {
    backgroundColor: `${colours.highlight}cc`,
    color: '#ffffff',
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
    transform: 'translateY(2px)',
  },
  icon: {
    marginRight: '12px',
    fontSize: '22px',
  },
  flexContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export interface BookSpaceData {
  fee_earner: string;
  booking_date: string;
  booking_time: Date;
  duration: number;
  reason: string;
  spaceType: 'Boardroom' | 'Soundproof Pod';
}

export interface BookSpaceFormProps {
  onCancel: () => void;
  feeEarner: string;
  futureBookings?: FutureBookingsResponse;
}

const BookSpaceForm: React.FC<BookSpaceFormProps> = ({
  onCancel,
  feeEarner,
  futureBookings
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
    const newStart = new Date(`${dateStr}T${timeStr}Z`);
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
      const existingStart = new Date(`${booking.booking_date}T${booking.booking_time}Z`);
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
    const dayEnd = new Date(`${dateStr}T23:59:59Z`);
    let proposedStart = new Date(startAfter);

    while (proposedStart <= dayEnd) {
      const proposedEnd = new Date(proposedStart.getTime() + duration * 3600000);
      let isSlotAvailable = true;

      for (const booking of dayBookings) {
        const existingStart = new Date(`${booking.booking_date}T${booking.booking_time}Z`);
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
    const bookingTimeDate = new Date(`1970-01-01T${t}Z`);
    const payload: BookSpaceData = {
      fee_earner: feeEarner,
      booking_date: values.bookingDate,
      booking_time: bookingTimeDate,
      duration: Number(values.duration),
      reason: values.reason,
      spaceType: selectedSpaceType,
    };
    try {
      await submitBooking(payload);
      setSubmissionSuccess(true);
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
    const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_INSERT_BOOK_SPACE_PATH}?code=${process.env.REACT_APP_INSERT_BOOK_SPACE_CODE}`;
    const isoTime = data.booking_time.toISOString().split('T')[1].split('Z')[0];
    let [time, fraction = ''] = isoTime.split('.');
    fraction = (fraction + '0000000').slice(0, 7);
    const finalTimeStr = `${time}.${fraction}`;
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
    const start = new Date(`${booking.booking_date}T${booking.booking_time}Z`);
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
      .filter(([date]) => {
        const d = new Date(date);
        return d >= today && d <= endDate;
      })
      .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());
  };

  // Load more weeks
  const handleLoadMore = () => {
    setDisplayWeeks((prev) => prev + 2); // Add 2 more weeks
  };

  return (
    <Stack tokens={{ childrenGap: 20 }} styles={{ root: { padding: '20px', position: 'relative' } }}>
      {!selectedSpaceType ? (
        <Stack horizontal tokens={{ childrenGap: 24 }} horizontalAlign="center">
          <DefaultButton
            onClick={() => handleSpaceSelection('Boardroom')}
            styles={selectionStyles}
            iconProps={{ iconName: 'OfficeChat' }}
            text="Boardroom"
          />
          <DefaultButton
            onClick={() => handleSpaceSelection('Soundproof Pod')}
            styles={selectionStyles}
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
                  backgroundColor: '#fff',
                  padding: '10px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                <Icon iconName="CheckMark" styles={{ root: { color: 'green', fontSize: '24px' } }} />
                <Text variant="xLarge" styles={{ root: { color: 'green', fontWeight: 600 } }}>
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
            <Stack
              styles={{
                root: {
                  backgroundColor: colours.grey,
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                },
              }}
            >
              <Text
                variant="mediumPlus"
                styles={{ root: { fontWeight: 600, color: isDarkMode ? '#ddd' : colours.darkBlue, marginBottom: '12px' } }}
              >
                {selectedSpaceType} on {new Date(formValues.bookingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <Stack tokens={{ childrenGap: 8 }}>
                {bookingsForDay.map((b) => (
                  <Stack
                    key={b.id}
                    horizontal
                    tokens={{ childrenGap: 12 }}
                    styles={{
                      root: {
                        padding: '8px 12px',
                        backgroundColor: isDarkMode ? colours.dark.grey : '#fff',
                        borderRadius: '6px',
                        border: `1px solid ${isDarkMode ? colours.dark.border : '#e8e8e8'}`,
                        transition: 'background 0.2s ease',
                        ':hover': { backgroundColor: isDarkMode ? '#444' : '#f9f9f9' },
                      },
                    }}
                  >
                    <Text variant="medium" styles={{ root: { fontWeight: 500, width: '90px', color: colours.blue } }}>
                      {formatBookingTime(b)}
                    </Text>
                    <Text variant="medium" styles={{ root: { color: isDarkMode ? '#bbb' : colours.greyText } }}>
                      {b.reason} <span style={{ fontWeight: 300 }}>(by {b.fee_earner})</span>
                    </Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          )}

          <Stack
            styles={{
              root: {
                backgroundColor: colours.grey,
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              },
            }}
          >
            <Text
              variant="mediumPlus"
              styles={{ root: { fontWeight: 600, color: isDarkMode ? '#ddd' : colours.darkBlue, marginBottom: '12px' } }}
            >
              {selectedSpaceType ? `${selectedSpaceType} Availability` : 'Space Availability'}
            </Text>
            <Stack tokens={{ childrenGap: 16 }}>
              {getDisplayedBookings().map(([date, bookings]) => (
                <Stack key={date}>
                  <Text
                    variant="medium"
                    styles={{ root: { fontWeight: 500, color: isDarkMode ? '#ccc' : colours.websiteBlue, marginBottom: '6px' } }}
                  >
                    {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  {bookings.length > 0 ? (
                    <Stack tokens={{ childrenGap: 6 }}>
                      {bookings.map((b) => (
                        <Stack
                          key={b.id}
                          horizontal
                          tokens={{ childrenGap: 12 }}
                          styles={{
                            root: {
                              padding: '6px 10px',
                              backgroundColor: isDarkMode ? colours.dark.grey : '#fff',
                              borderRadius: '6px',
                              border: `1px solid ${isDarkMode ? colours.dark.border : '#e8e8e8'}`,
                              transition: 'background 0.2s ease',
                              ':hover': { backgroundColor: isDarkMode ? '#444' : '#f9f9f9' },
                            },
                          }}
                        >
                          <Text variant="smallPlus" styles={{ root: { fontWeight: 500, width: '90px', color: colours.blue } }}>
                            {formatBookingTime(b)}
                          </Text>
                          <Text variant="smallPlus" styles={{ root: { color: isDarkMode ? '#bbb' : colours.greyText } }}>
                            {b.reason} <span style={{ fontWeight: 300 }}>(by {b.fee_earner})</span>
                          </Text>
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Text variant="smallPlus" styles={{ root: { color: isDarkMode ? '#888' : '#999', marginLeft: '10px', fontStyle: 'italic' } }}>
                      No bookings scheduled
                    </Text>
                  )}
                </Stack>
              ))}
              <DefaultButton
                text="Load More"
                onClick={handleLoadMore}
                styles={{ root: { marginTop: '16px', alignSelf: 'center' } }}
              />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default BookSpaceForm;