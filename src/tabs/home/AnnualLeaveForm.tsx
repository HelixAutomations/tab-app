// src/tabs/home/AnnualLeaveForm.tsx

import React from 'react';
import { BespokeForm } from '../../app/styles/BespokeForms';

const annualLeaveForm = [
  {
    label: 'Full Name',
    type: 'text',
    required: true,
    placeholder: 'Enter your full name',
  },
  {
    label: 'Start Date',
    type: 'text', // Changed from 'date' to 'text' to match BespokeForm types
    required: true,
    placeholder: 'Select start date',
  },
  {
    label: 'End Date',
    type: 'text', // Changed from 'date' to 'text' to match BespokeForm types
    required: true,
    placeholder: 'Select end date',
  },
  {
    label: 'Reason for Leave',
    type: 'textarea',
    required: true,
    placeholder: 'Enter the reason for leave',
  },
];

const AnnualLeaveForm: React.FC = () => {
  return null;
};

export { annualLeaveForm };
export default AnnualLeaveForm;
