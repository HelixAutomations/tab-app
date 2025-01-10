// src/tabs/home/OfficeAttendanceForm.tsx

import React from 'react';
import BespokeForm from './BespokeForms';

const officeAttendanceForm = [
  {
    label: 'Full Name',
    type: 'text',
    required: true,
    placeholder: 'Enter your full name',
  },
  {
    label: 'Check-in Time',
    type: 'text', // Changed from 'time' to 'text' to match BespokeForm types
    required: true,
    placeholder: 'Select check-in time',
  },
  {
    label: 'Notes',
    type: 'textarea',
    required: false,
    placeholder: 'Additional notes (optional)',
  },
];

const OfficeAttendanceForm: React.FC = () => {
  return null;
};

export { officeAttendanceForm };
export default OfficeAttendanceForm;
