// src/CustomForms/AnnualLeaveForm.tsx

import React, { useState, useEffect } from 'react';
import BespokeForm, { FormField } from './BespokeForms'; // Adjust path if necessary
import { DateRangePicker, Range, RangeKeyDict } from 'react-date-range';
import 'react-date-range/dist/styles.css'; // Main style file
import 'react-date-range/dist/theme/default.css'; // Theme CSS
import { addDays, differenceInCalendarDays } from 'date-fns';

const initialFormFields: FormField[] = [
  {
    label: 'Full Name',
    type: 'text',
    required: true,
    placeholder: 'Enter your full name',
    name: 'fullName',
  },
  // Additional form fields as needed
  {
    label: 'Notes (Optional)',
    type: 'textarea',
    required: false,
    placeholder: 'Enter any additional notes',
    name: 'notes',
  },
  // Add more fields as necessary
];

interface DateRangeSelection {
  startDate: Date;
  endDate: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

const AnnualLeaveForm: React.FC = () => {
  const [dateRanges, setDateRanges] = useState<DateRangeSelection[]>([]);
  const [totalDays, setTotalDays] = useState<number>(0);

  // Handler to add a new date range
  const addDateRange = () => {
    setDateRanges([
      ...dateRanges,
      {
        startDate: new Date(),
        endDate: addDays(new Date(), 1),
      },
    ]);
  };

  // Handler to remove a date range
  const removeDateRange = (index: number) => {
    const newRanges = [...dateRanges];
    newRanges.splice(index, 1);
    setDateRanges(newRanges);
  };

  // Handler to update a specific date range
  const updateDateRange = (index: number, range: DateRangeSelection) => {
    const newRanges = [...dateRanges];
    newRanges[index] = range;
    setDateRanges(newRanges);
  };

  // Calculate total days whenever dateRanges change
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

  // Handle form submission
  const handleSubmit = (values: { [key: string]: string | number | boolean | File }) => {
    // Combine form values with date ranges and total days
    const formData = {
      ...values,
      dateRanges,
      totalDays,
    };
    console.log('Annual Leave Form Submitted:', formData);
    // TODO: Implement submission logic (e.g., send data to backend)
  };

  // Handle form cancellation
  const handleCancel = () => {
    console.log('Annual Leave Form Cancelled');
    // TODO: Implement cancellation logic if needed
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>Annual Leave Request</h2>
      <BespokeForm
        fields={initialFormFields}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      <div style={{ marginTop: '30px' }}>
        <h3>Date Ranges</h3>
        {dateRanges.map((range, index) => (
          <div
            key={index}
            style={{
              marginBottom: '25px',
              border: '1px solid #ccc',
              padding: '15px',
              borderRadius: '5px',
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
              editableDateInputs={true}
              moveRangeOnFirstSelection={false}
              months={1}
              direction="horizontal"
              className="my-custom-date-range"
            />
            <div style={{ marginTop: '10px' }}>
              <label style={{ marginRight: '20px' }}>
                <input
                  type="checkbox"
                  checked={range.halfDayStart || false}
                  onChange={(e) =>
                    updateDateRange(index, { ...range, halfDayStart: e.target.checked })
                  }
                  style={{ marginRight: '5px' }}
                />
                Half Day Start
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={range.halfDayEnd || false}
                  onChange={(e) =>
                    updateDateRange(index, { ...range, halfDayEnd: e.target.checked })
                  }
                  style={{ marginRight: '5px' }}
                />
                Half Day End
              </label>
            </div>
            <button
              type="button"
              onClick={() => removeDateRange(index)}
              style={{
                marginTop: '10px',
                backgroundColor: '#f44336',
                color: '#fff',
                border: 'none',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '3px',
              }}
            >
              Remove Range
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addDateRange}
          style={{
            backgroundColor: '#4CAF50',
            color: '#fff',
            border: 'none',
            padding: '10px 15px',
            cursor: 'pointer',
            borderRadius: '5px',
          }}
        >
          Add Date Range
        </button>
      </div>

      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#e7f3fe',
          border: '1px solid #b3d4fc',
          borderRadius: '5px',
        }}
      >
        <strong>Total Days Requested:</strong> {totalDays} day{totalDays !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

// Export the initial form fields as annualLeaveForm for Home.tsx
export { initialFormFields as annualLeaveForm };
export default AnnualLeaveForm;
