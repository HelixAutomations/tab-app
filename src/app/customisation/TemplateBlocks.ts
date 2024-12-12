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
          label: 'Initial Outreach - Unavailable by Phone',
          previewText: `
            Thank you for your enquiry. I am confident we can assist with your matter.
    
            Please let me know a time/date you’re available to speak using the link below and I will call then to discuss your matter in greater detail to see if I/we can assist. The initial call is on a no-cost or obligation basis.
    
            https://calendly.com/helixlaw-sam/telephone-call-duplicate
    
            I look forward to speaking with you.
          `,
        },
        {
          label: 'Initial Scope - Construction',
          previewText: `
            We can:-
            <ol>
              <li>Review the quote/contract from the architect;</li>
              <li>Review the correspondence between you and the architect/builder/engineer in respect of the depth of the foundations;</li>
              <li>Provide you with a letter of advice detailing:
                <ol type="a">
                  <li>The basis and prospects of your claim;</li>
                  <li>The likely costs to trial;</li>
                  <li>The evidence that you need to obtain;</li>
                  <li>The next steps to advance your position.</li>
                </ol>
              </li>
            </ol>
            Together items 1-3 above are ‘the Initial Scope’.
          `,
        },
      ],
    },
    {
      title: 'Hourly Rate and Budget',
      description: 'Provide tailored hourly rate and budget information.',
      placeholder: '[Hourly Rate and Budget Placeholder]',
      options: [
        {
          label: 'Initial Scope Budget - Hourly Rate (Solicitor)',
          previewText: 'I am a solicitor and my hourly rate is £285 plus VAT. For you to instruct me to complete the Initial Scope you would need to budget approximately [£X] +VAT, which is an estimate and not a fixed fee. Any additional work would incur further cost on a time-recorded basis.',
        },
        {
          label: 'Initial Scope Budget - Hourly Rates',
          previewText: 'I am a solicitor and my hourly rate is £285 plus VAT. For you to instruct me to complete the Initial Scope you would need to budget approximately [£X] +VAT, which is an estimate and not a fixed fee. Any additional work would incur further cost on a time-recorded basis.',
        },
      ],
    },
    {
      title: 'Payment Instructions',
      description: 'Confirm next steps and payment instructions.',
      placeholder: '[Payment Link Placeholder]',
      options: [      
        {
          label: 'Request for ID & Payment Instructions',
          previewText: `
            If you wish to instruct us, I would be grateful if you could:
        
            1. Complete the identity form below for our compliance purposes:  
               https://helix-law.co.uk/proof-of-identity/
        
            2. Pay the amount of £X on account, using our account details below:  
               Helix Law General Client Account  
               Barclays Bank  
               Account Number: 93472434  
               Sort Code: 20-27-91  
        
               Reference: FE [NAME] // [ACID]
        
            Please ensure to quote the above reference so that we promptly identify your payment.
        
            Once you have confirmed the above, I will be able to open a file for you and we will begin working on your behalf.
          `,
        },                
      ],
    },
    {
      title: 'Required Documents',
      description: 'List the documents needed to proceed.',
      placeholder: '[Required Documents Placeholder]',
      isMultiSelect: true,
      options: [
        { label: 'The contract', previewText: 'The contract' },
        { label: 'Any relevant correspondence', previewText: 'Any relevant correspondence' },
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
      title: 'Calendly Link',
      description: 'Schedule a meeting using Calendly.',
      placeholder: '[Meeting Link Placeholder]',
      options: [
        {
          label: '15m Telephone Call',
          previewText: `
            You are welcome to schedule a 15-minute telephone call to discuss your needs further. 
            Please select a convenient time using the link below:
          `,
        },
        {
          label: '30m Telephone Call',
          previewText: `
            You are welcome to schedule a 30-minute telephone call to explore your matter in more detail. 
            Please select a convenient time using the link below:
          `,
        },
        {
          label: '15m Video Call',
          previewText: `
            You are invited to schedule a 15-minute video call to discuss your needs. 
            Please choose a suitable time using the link below:
          `,
        },
        {
          label: '30m Video Call',
          previewText: `
            You are invited to schedule a 30-minute video call to discuss your requirements in detail. 
            Please select a convenient time using the link below:
          `,
        },        
      ],
    },
    {
      title: 'Google Review',
      description: 'Encourage prospects to leave a Google review.',
      placeholder: '[Google Review Placeholder]',
      options: [
        {
          label: '5* Google Review',
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
  