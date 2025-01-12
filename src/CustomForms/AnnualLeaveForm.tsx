// src/CustomForms/AnnualLeaveForm.tsx

import React, { useState, useEffect } from 'react';
import { Stack, Text, PrimaryButton, DefaultButton, TextField } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { FormField } from './BespokeForms';
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import { addDays, differenceInCalendarDays } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';

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

const AnnualLeaveForm: React.FC = () => {
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
    let days = 0;
    dateRanges.forEach((range) => {
      const diff = differenceInCalendarDays(range.endDate, range.startDate) + 1;
      let adjustedDiff = diff;
      if (range.halfDayStart) adjustedDiff -= 0.5;
      if (range.halfDayEnd) adjustedDiff -= 0.5;
      days += adjustedDiff;
    });
    setTotalDays(days);
  }, [dateRanges]);

  const handleSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    setIsSubmitting(true);
    try {
      const formData = {
        ...values,
        notes,
        dateRanges,
        totalDays,
      };
      console.log('Annual Leave Form Submitted:', formData);
    } catch (error) {
      console.error('Error submitting Annual Leave Form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    console.log('Annual Leave Form Cancelled');
  };

  return (
    <Stack tokens={{ childrenGap: 20 }}>
      <BespokeForm
        fields={initialFormFields}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      >
        <Stack tokens={{ childrenGap: 10 }}>
          <Text
            variant="mediumPlus"
            style={{
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontWeight: 600,
            }}
          >
            Date Ranges
          </Text>
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
              />
              <DefaultButton
                text="Remove Range"
                onClick={() => removeDateRange(index)}
                styles={buttonStylesFixedWidthSecondary}
              />
            </Stack>
          ))}
          <PrimaryButton
            text="Add Date Range"
            onClick={addDateRange}
            styles={buttonStylesFixedWidth}
          />
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
      </BespokeForm>
      <Stack
        style={{
          padding: '10px',
          backgroundColor: colours.light.sectionBackground,
          borderRadius: '4px',
        }}
      >
        <Text
          variant="medium"
          style={{
            color: isDarkMode ? colours.dark.text : colours.light.text,
          }}
        >
          <strong>Total Days Requested:</strong> {totalDays} day{totalDays !== 1 ? 's' : ''}
        </Text>
      </Stack>
    </Stack>
  );
};

export default AnnualLeaveForm;
