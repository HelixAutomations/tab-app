// src/tabs/forms/FinancialForms.ts

import { FormItem } from '../../app/functionality/types'; // Adjust the path if necessary

// Define Financial Form Items
export const financialForms: FormItem[] = [
  {
    title: 'Transfer Request',
    url: 'https://form.asana.com/?k=ujtixxpHA7C-flR-UZyF0Q&d=1203336123398249', // Added a valid URL
    icon: 'Switch',
    description: 'Submit a transfer request form.',
    tags: ['Financial'], // Ensure tags are present
    fields: [
      {
        label: 'Transfer Type',
        type: 'dropdown',
        options: ['Client to Office', 'Office to Client', 'Client to Client'],
        required: true,
      },
      {
        label: 'Matter Reference',
        type: 'text',
        required: true,
      },
      {
        label: 'Amount',
        type: 'number',
        step: 250,
        editable: true,
        required: true,
        prefix: '£', // Add this to display the non-removable £
      },
      {
        label: 'Narrative',
        type: 'textarea',
        required: false,
        helpText: 'What the payment is for',
      },
      {
        label: 'Tag me as Collaborator',
        type: 'toggle',
        defaultValue: false,
        required: false,
      },
    ],
  },
  {
    title: 'Payment Requests',
    url: 'https://form.asana.com/?k=9CRRWY1ZvsPGJcA35aAM5w&d=1203336123398249',
    icon: 'Money',
    description: 'Submit a payment request form.',
    tags: ['Financial'],
    fields: [
      {
        label: 'Matter Reference',
        type: 'text',
        required: true,
      },
      {
        label: 'Debit Account',
        type: 'dropdown',
        options: ['Office', 'Client'],
        required: true,
      },
      {
        label: 'Amount',
        type: 'number',
        prefix: '£', // Add this to display the non-removable £
        required: true,
      },
      {
        label: 'Payee Name',
        type: 'text',
        required: true,
      },
      {
        label: 'Payee Bank Account Number',
        type: 'text',
        required: true,
      },
      {
        label: 'Payee Sort Code',
        type: 'text',
        required: true,
      },
      {
        label: 'Payment Reference',
        type: 'text',
        required: true,
        helpText: 'Please note this cannot be longer than 18 characters due to Barclays limit.',
      },
      {
        label: 'Narrative',
        type: 'textarea',
        required: false,
        helpText: 'What the payment is for',
      },
      {
        label: 'Have bank details been verified?',
        type: 'toggle',
        required: true,
        defaultValue: false,
      },
      {
        label: 'Do we have sufficient client funds to make payment?',
        type: 'toggle',
        required: true,
        defaultValue: false,
      },
      {
        label: 'Should Accounts send invoice raised to the client?',
        type: 'toggle',
        required: true,
        defaultValue: false,
        helpText: 'Disbursements will automatically be raised at time of posting onto the matter.',
      },
      {
        label: 'Should accounts make the client to office transfer as well?',
        type: 'toggle',
        required: true,
        defaultValue: false,
      },
      {
        label: 'Disbursement Upload', // New Field Added
        type: 'file',
        required: false,
        helpText: 'Upload related disbursement documents.',
        placeholder: 'Drag and drop a file or click to select one.',
      },
      {
        label: 'Tag me as Collaborator',
        type: 'toggle',
        defaultValue: false,
        required: false,
      },
    ],
  },
  {
    title: 'General Query',
    url: 'https://form.asana.com/?k=CYnw28rLCHDrNboUrgmdaQ&d=1203336123398249',
    icon: 'Help', // Valid Fluent UI icon
    description: 'Submit a general query form.',
    tags: ['Financial'], // Added tag
    fields: [
      {
        label: 'Query',
        type: 'textarea',
        required: true,
        helpText: 'Please enter your query in detail.',
      },
      {
        label: 'Matter Reference (if applicable)',
        type: 'text',
        required: false,
        helpText: 'Provide the matter reference if it is related to an existing matter.',
      },
      {
        label: 'Attachments',
        type: 'file', // Now a valid type
        required: false,
        helpText: 'Upload any relevant documents or files.',
        placeholder: 'Drag and drop a file or click to select one.', // Placeholder text
      },
    ],
  },
  {
    title: 'Supplier Payment/Helix Expense',
    url: 'https://form.asana.com/?k=N3UONR0R0PXYlSqQjcCv9w&d=1203336123398249',
    icon: 'AccountActivity', // Replaced 'Financial' with 'AccountActivity'
    description: 'Submit a nominal supplier payment or Helix expense form.',
    tags: ['Financial'], // Added tag
    fields: [
      {
        label: 'Supplier Name',
        type: 'text',
        required: true,
      },
      {
        label: 'Debit Account',
        type: 'dropdown',
        options: ['Office', 'Client'],
        required: true,
      },
      {
        label: 'VAT Amount',
        type: 'number',
        step: 0.01,
        editable: true,
        required: false,
        prefix: '£',
      },
      {
        label: 'Amount',
        type: 'number',
        step: 250,
        editable: true,
        required: true,
        prefix: '£',
      },
      {
        label: 'Payment Type',
        type: 'dropdown',
        options: [
          'CHAPS (same day over £1m)',
          'BACS (3 working day payment)',
          'Next Day BACS (Next working day payment)',
          'Faster Payment (Same day up to £1m)',
        ],
        required: true,
      },
      {
        label: 'Payee Name',
        type: 'text',
        required: true,
      },
      {
        label: 'Payee Bank Account Number',
        type: 'text',
        required: true,
      },
      {
        label: 'Payee Sort Code',
        type: 'text',
        required: true,
      },
      {
        label: 'Payment Reference',
        type: 'text',
        required: true,
        helpText: 'Please note this cannot be longer than 18 characters due to Barclays limit.',
      },
      {
        label: 'Expense Name',
        type: 'text',
        required: false,
        helpText: 'i.e Stationary, Travel expenses',
      },
      {
        label: 'Narrative',
        type: 'textarea',
        required: false,
        helpText: 'Provide additional details about the expense.',
      },
      {
        label: 'Invoice Upload',
        type: 'file',
        required: false,
        helpText: 'Upload the related invoice.',
        placeholder: 'Drag and drop a file or click to select one.',
      },
      {
        label: 'Tag me as Collaborator',
        type: 'toggle',
        defaultValue: false,
        required: false,
      },
    ],
  },
];
