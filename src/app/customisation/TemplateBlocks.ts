// src/tabs/enquiries/TemplateBlocks.ts

import { IStyleFunctionOrObject, IDropdownStyles, IDropdownStyleProps } from '@fluentui/react';

export interface TemplateBlock {
  title: string;
  description: string;
  placeholder: string; // Link block to its placeholder
  isMultiSelect?: boolean; // Optional property for multi-select
  options: TemplateOption[];
  dropdownStyles?: IStyleFunctionOrObject<IDropdownStyleProps, IDropdownStyles>; // Correct type for styles
}

export interface TemplateOption {
  label: string;
  previewText: string;
}

export const templateBlocks: TemplateBlock[] = [
  // 1. Introduction
  {
    title: 'Introduction',
    description: 'Set the tone and acknowledge the enquiry.',
    placeholder: '[Introduction Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Standard Acknowledgment',
        previewText: `
          Thank you for your enquiry. I am confident we can assist with your matter.
        `,
      },
      {
        label: 'Follow-Up After Call',
        previewText: `
          Thank you for your enquiry and for your time on the phone earlier. It was good speaking with you.
        `,
      },
      {
        label: 'Missed Call Acknowledgment',
        previewText: `
          Thank you for your enquiry. I tried to call earlier but could not reach you.
        `,
      },
      {
        label: 'Apology for Delay',
        previewText: `
          Thank you for your enquiry. Apologies for the slight delay in responding.
        `,
      },
    ],
  },

  // 2. Scope of Work
  {
    title: 'Scope of Work',
    description: 'Define what assistance will be provided.',
    placeholder: '[Scope of Work Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Initial Review and Advice',
        previewText: `
          I will review the documents you provide and offer initial advice on next steps.
        `,
      },
      {
        label: 'Construction-Specific Scope',
        previewText: `
          We can review the quote/contract, correspondence, and provide a detailed letter of advice.
        `,
      },
      {
        label: 'Dispute Resolution Overview',
        previewText: `
          We can review your position and provide advice on strategy, including settlement and litigation steps.
        `,
      },
    ],
  },

  // 3. Risk Assessment
  {
    title: 'Risk Assessment',
    description: 'Outline potential risks and considerations.',
    placeholder: '[Risk Assessment Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'General Risk Explanation',
        previewText: `
          Litigation carries risks, including the possibility of costs being awarded against you.
        `,
      },
      {
        label: 'Cost/Benefit Analysis',
        previewText: `
          It is important to ensure that any costs incurred add sufficient value to justify proceeding.
        `,
      },
      {
        label: 'Specific Legal Risks',
        previewText: `
          We will carefully assess the strengths and weaknesses of your claim to minimize potential risks.
        `,
      },
    ],
  },

  // 4. Costs and Budget
  {
    title: 'Costs and Budget',
    description: 'Provide transparent cost estimates and fee structure.',
    placeholder: '[Costs and Budget Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Hourly Rate Explanation',
        previewText: `
          I am a Partner, and my hourly rate is £395 + VAT. Work is charged in 6-minute increments.
        `,
      },
      {
        label: 'Initial Budget Estimate',
        previewText: `
          For the initial scope, you should budget approximately £1,500 + VAT. This is an estimate, not a fixed fee.
        `,
      },
      {
        label: 'Comprehensive Budget Overview',
        previewText: `
          You will need to budget £30,000 + VAT for our fees and a further £20,000 + VAT for counsel's fees.
        `,
      },
    ],
  },

  // 5. Required Documents
  {
    title: 'Required Documents',
    description: 'List the documents needed to proceed.',
    placeholder: '[Required Documents Placeholder]',
    isMultiSelect: true,
    options: [
      { label: 'The contract', previewText: 'The contract' },
      { label: 'Any relevant correspondence', previewText: 'Any relevant correspondence' },
      { label: 'Settlement Agreement', previewText: 'Settlement Agreement' },
      { label: 'Shareholders\' Agreement', previewText: 'Shareholders\' Agreement' },
      { label: 'Financial Statements', previewText: 'Financial Statements' },
      { label: 'Invoices or Asset Information', previewText: 'Invoices or Asset Information' },
    ],
    dropdownStyles: {
      callout: {
        maxHeight: '150px',
        overflowY: 'auto',
      },
      title: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    },
  },

  // 6. Follow-Up Instructions
  {
    title: 'Follow-Up Instructions',
    description: 'Define clear next steps for the client.',
    placeholder: '[Follow-Up Instructions Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Proof of ID',
        previewText: `
          Please complete the identity form below for our compliance purposes:  
          https://helix-law.co.uk/proof-of-identity/
        `,
      },
      {
        label: 'Payment Instructions',
        previewText: `
          Please pay £X on account, using our account details below:  
          Helix Law General Client Account  
          Barclays Bank  
          Account Number: 93472434  
          Sort Code: 20-27-91  
          
          Reference: FE [NAME] // [ACID]
          
          Please ensure to quote the above reference so that we promptly identify your payment.
        `,
      },
      {
        label: 'Meeting Link (Optional)',
        previewText: `
          You are welcome to schedule a meeting using the link below:
          https://calendly.com/helixlaw-sam/telephone-call-duplicate
        `,
      },
    ],
  },

  // 7. Closing Notes
  {
    title: 'Closing Notes',
    description: 'Summarise and add a personal touch to the email.',
    placeholder: '[Closing Notes Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'General Closing',
        previewText: `
          I look forward to hearing from you and hope the above is helpful.
        `,
      },
      {
        label: 'Encouragement to Contact',
        previewText: `
          Please let me know if you have any questions or need further clarification.
        `,
      },
      {
        label: 'Custom Closing for High-Value Matters',
        previewText: `
          This is obviously a complex matter. We’re here to assist you in navigating the process effectively.
        `,
      },
    ],
  },

  // 8. Google Review
  {
    title: 'Google Review',
    description: 'Encourage prospects to leave a Google review.',
    placeholder: '[Google Review Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Request for Review',
        previewText: `
          I hope the above is useful and of course come back to me if I can help you further. In the meantime, I’m wondering if you can help me by providing a brief positive Google review of me and Helix Law. We’re a small but specialist team, and this would make a huge difference to us.
          
          If you don’t mind, please can you give us a brief 5* positive review at the following link:  
          http://bit.ly/2gGwyNJ  
          
          You will need to be signed into Google.
          
          Many thanks in advance.
        `,
      },
    ],
  },
];
