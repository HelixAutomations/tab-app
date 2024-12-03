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
    {
      title: 'Scope',
      description: 'Outline the scope of services offered.',
      placeholder: '[Scope Placeholder]',
      options: [
        {
          label: 'Advice - Advising',
          previewText: 'We offer comprehensive advising services to guide you through every step of your legal needs.',
        },
        {
          label: 'Advice - Drafting',
          previewText: 'Our drafting services ensure that all your legal documents are meticulously prepared and tailored to your requirements.',
        },
        {
          label: 'Review',
          previewText: 'Our review services provide thorough examination of your legal documents to ensure accuracy and compliance.',
        },
      ],
    },
    {
      title: 'Pricing',
      description: 'Provide detailed pricing information.',
      placeholder: '[Fee Option Placeholder]',
      options: [
        {
          label: 'Fixed Price Service',
          previewText: 'Our fixed price service offers transparency and predictability, allowing you to budget effectively without unexpected costs.',
        },
        {
          label: 'Agreed Monthly Fee Retainer',
          previewText: 'With an agreed monthly fee retainer, you receive ongoing support and legal services tailored to your needs on a consistent basis.',
        },
        {
          label: 'No Win No Fee',
          previewText: 'Our no win no fee option ensures that you only pay for our services if we successfully resolve your case.',
        },
        {
          label: 'Residential Possession Fixed Fees',
          previewText: 'We provide fixed fees for residential possession cases, offering affordability and clarity throughout the process.',
        },
        {
          label: 'Adjudication Costs',
          previewText: 'Our adjudication costs are structured to provide you with fair and competitive pricing for dispute resolution services.',
        },
      ],
    },
    {
      title: 'Required Documents',
      description: 'List the documents needed to proceed.',
      placeholder: '[Required Documents Placeholder]',
      isMultiSelect: true,
      options: [
        { label: 'Lease Agreements', previewText: 'Lease Agreements' },
        { label: 'Correspondence', previewText: 'Correspondence' },
        { label: 'Financial Statements', previewText: 'Financial Statements' },
        { label: 'Legal Filings', previewText: 'Legal Filings' },
        { label: 'Property Documents', previewText: 'Property Documents' },
        { label: 'Tenant Information', previewText: 'Tenant Information' },
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
    {
      title: 'Payment Link',
      description: 'Provide a link for payment or further action.',
      placeholder: '[Payment Link Placeholder]',
      options: [
        {
          label: 'Pay Now',
          previewText: 'Click the link below to proceed with your payment and secure our services:',
        },
        {
          label: 'Schedule a Payment',
          previewText: 'Use the following link to schedule your payment at a convenient time:',
        },
      ],
    },
    {
      title: 'Meeting Link (Calendly)',
      description: 'Schedule a meeting using Calendly.',
      placeholder: '[Meeting Link Placeholder]',
      options: [
        {
          label: 'Schedule Meeting',
          previewText: 'I would like to schedule a meeting to discuss your needs further. Please choose a convenient time using my Calendly link below:\n\nBest regards,\n[Enquiry.Point_of_Contact]',
        },
      ],
    },
    {
      title: 'Google Review',
      description: 'Encourage clients to leave a Google review.',
      placeholder: '[Google Review Placeholder]',
      options: [
        {
          label: 'Request Review 1',
          previewText: '"Fantastic service! They handled everything professionally and efficiently." - Client D',
        },
        {
          label: 'Request Review 2',
          previewText: '"I am extremely satisfied with the outcome. Highly recommend their services!" - Client E',
        },
        {
          label: 'Request Review 3',
          previewText: '"Their team went above and beyond to ensure my case was a success." - Client F',
        },
      ],
    },
    {
      title: 'Case Studies',
      description: 'Provide relevant case studies.',
      placeholder: '[Case Studies Placeholder]',
      options: [
        {
          label: 'Commercial Success',
          previewText: 'Case Study: Successfully navigated a complex commercial dispute, resulting in favorable terms for our client.',
        },
        {
          label: 'Employment Resolution',
          previewText: 'Case Study: Assisted an employee in resolving a contractual disagreement, ensuring fair compensation.',
        },
        {
          label: 'Construction Project',
          previewText: 'Case Study: Managed legal aspects of a large-scale construction project, ensuring compliance and timely completion.',
        },
      ],
    },
    {
      title: 'Testimonials',
      description: 'Share client testimonials to build trust.',
      placeholder: '[Testimonials Placeholder]',
      options: [
        {
          label: 'General',
          previewText: `
  <ul>
    <li>"Their expertise was invaluable in resolving our dispute quickly." - Client A</li>
    <li>"Professional and dedicated team who truly understand our needs." - Client B</li>
    <li>"Highly recommended for their clear communication and effective solutions." - Client C</li>
  </ul>
          `,
        },
      ],
    },
  ];
  