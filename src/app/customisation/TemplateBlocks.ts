// src/tabs/enquiries/TemplateBlocks.ts

import { IStyleFunctionOrObject, IDropdownStyles, IDropdownStyleProps } from '@fluentui/react';

export interface TemplateBlock {
  title: string;
  description: string;
  placeholder: string;
  isMultiSelect?: boolean;
  options: TemplateOption[];
  dropdownStyles?: IStyleFunctionOrObject<IDropdownStyleProps, IDropdownStyles>;
}

export interface TemplateOption {
  label: string;
  previewText: string;
}

export const templateBlocks: TemplateBlock[] = [
  {
    title: 'Introduction',
    description: 'Set the tone and acknowledge the enquiry.',
    placeholder: '[FE Introduction Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Standard Acknowledgment',
        previewText: `Thank you for your enquiry to Helix Law. We’re a specialist firm of litigation solicitors. We only deal with disputes and act nationally. I am confident we can assist in relation to your matter.\n\nAs a starting point some further initial details and information will help me understand your situation and confirm your best next steps. I have therefore set out below some brief requests and would be grateful if you can please consider this and come back to me as soon as possible.`,
      },
      {
        label: 'Follow-Up After Call',
        previewText: `Thank you for your enquiry and for your time on the phone earlier. It was good speaking with you.\n\nThe purpose of this email is to briefly follow up on our conversation.`,
      },
      {
        label: 'Missed Call Acknowledgment',
        previewText: `Thank you for your enquiry to Helix Law. I have tried to call you to discuss your matter but was unable to reach you.\n\nAs a starting point, if you prefer, please email me a brief summary of the background and current position. I will briefly review the content and will come back to you and we can take it from there.`,
      },
      {
        label: 'Apology for Delay',
        previewText: `Thank you for your enquiry to Helix Law. Please accept my apology for the slight delay in my contacting you.\n\nI have only limited information regarding your dispute. As a starting point please can you email me a brief summary of the background and current position. I will briefly review the content and will come back to you and we can take it from there.`,
      },
    ],
  },
  {
    title: 'Current Situation and Problem',
    description: 'Overview of the current situation and identified problems.',
    placeholder: '[Current Situation and Problem Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Current Position and Problems',
        previewText: `We have discussed that you are [INSERT]. You have a dispute with [INSERT] because [INSERT] and have confirmed that [INSERT].\n\nThe dispute with [INSERT] situation creates difficulty for you for obvious reasons, including because [INSERT].\n\nIn addition to the above, additional problems arise and need to be addressed, such as [INSERT].`,
      },           
    ],
  },
  {
    title: 'Scope of Work',
    description: 'Define what assistance will be provided.',
    placeholder: '[Scope of Work Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Initial Steps- Review and Advice',
        previewText: `Initial Steps- Review and Advice\n\nI am experienced in dealing with this type of issue and am happy to assist you. At this initial stage it is necessary and incredibly important to review the background and current position so that we can then advise on your best next steps.\n\nThis will require an initial review of core documents such as [INSERT the contracts, notices, demands, accounts, relevant correspondence set out below] so that we can be as clear as possible on the factual position with companies house and land registry. I then anticipate being able to provide initial advice on your current position and best next steps.`,
      },
      {
        label: 'Shareholder Dispute',
        previewText: `Obviously you will want and need to protect your position in the company as robustly as possible. In the above context I need to review your situation and the background and current position in more detail, including documents that are relevant to your situation and filings with companies house. This will enable me to provide you with initial advice on your current position and your best next steps.\n\nTo assist me in completing the review if you can please provide a copy of the shareholders agreement (if any), Directors service agreement (if any), copies of the recent correspondence you have received and sent, and a brief summary over no more than 2 pages of the current position. It is fine to use bullet points within an email for this if you prefer.\n\nOn receipt of the above I will confirm our time and cost estimate for our review of the documents and initial advice on your current position and best next steps.`,
      },
      {
        label: 'Statutory Demand',
        previewText: `In the above context I need to review your situation and the background and current position in more detail, including documents that are relevant to your situation. This will enable me to provide you with initial advice on your current position and your best next steps.\n\nIt is usually important to act quickly in this type of situation to force or avoid a winding up petition being issued. When a petition is issued all company bank accounts are immediately frozen which can have a catastrophic impact on a business for obvious reasons. A quick and robust approach is therefore needed to force resolution.\n\nIt will assist me in completing the review if you can please provide a copy of the contract or agreement (if any), any terms and conditions, the unpaid invoice and copies of the recent correspondence you have received and have sent, as well as a brief summary over no more than 2 pages setting out the relevant background and current position. It is fine to use bullet points for this in an email if you prefer.\n\nOn receipt of the above I will confirm our time and cost estimate for our review of the documents and initial advice on your current position and best next steps.`,
      },
      {
        label: 'Property-Specific Review and Advice',
        previewText: `In the above context I need to review your situation and the background and current position in more detail, including documents that are relevant to your situation.\n\nAt this initial early stage please provide me with the tenancy agreement, any relevant correspondence, and a brief summary of no more than 2 pages or bullet points in an email, summarising your current position and the dispute. This will enable me to provide you with initial advice on your current position and your best next steps.\n\nFurther documents might be needed from you which I will confirm separately when you have taken the next steps below.`,
      },
      {
        label: 'Construction-Specific Scope',
        previewText: `In the above context I need to review your situation and the background and current position in more detail, including documents that are relevant to your dispute.\n\nPlease provide me with a copy of the contract, any relevant correspondence, and a brief summary of no more than 2 pages summarising the nature of the dispute. This will enable me to provide you with initial advice on your current position and your best next steps.\n\nIt is likely that further documents and information might be needed which I will confirm in due course, but this will be a useful starting point.\n\nI will then review your position and advise on strategy, including settlement and appropriate next steps and we can then discuss this further.`,
      },
    ],
  },  
  {
    title: 'Risk Assessment',
    description: 'Outline potential risks and considerations.',
    placeholder: '[Risk Assessment Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Cost/Benefit Analysis',
        previewText: `My current initial view is that this is a situation, and is sufficiently serious, where it stacks up from a cost; benefit perspective for you to obtain advice on your current position and best next steps.\n\nObviously it is fundamentally important that we (you and I) continue to keep this under review including within our initial work on your behalf.`,
      },
    ],
  },
  {
    title: 'Costs and Budget',
    description: 'Provide transparent cost estimates and fee structure.',
    placeholder: '[Costs and Budget Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Initial Cost',
        previewText: `We charge on a time recorded basis and record all time in 6 minute units. This includes for emails in and out and telephone attendances, and all steps on your behalf. I am a Partner and my hourly rate is £395 + VAT.\n\nWe work as a team and a number of colleagues may assist in relation to various steps in relation to your matter, at different times. Their time will be recorded and charged on the basis of their hourly rates as applicable from time to time – these are all lower than £395+VAT.\n\nFor the initial work and review above you will need to budget in the region of approximately £1,500 + VAT. This is an estimate and not a fixed fee; the cost will ultimately depend on the time spent including the scale of documents and enquiries received from you, but based on my experience this is likely to be an accurate estimate at this stage.\n\nFurther work will incur additional costs on a time basis and in a fully litigated dispute it is not unusual for each party to incur costs of tens of thousands of pounds in this type of dispute, if not higher. Costs will of course be a concern, naturally.\n\nEqually, if you are positioned to win a dispute you can usually expect to recover in the region of approximately 65-70% of your costs (if not higher). In this context the fear of being ordered to pay your costs can provide powerful leverage to force resolution of a dispute in your favour. We will of course consider this within our initial review and work as above.`,
      },      
      {
        label: 'CFA',
        previewText: `I am aware that you are seeking alternative funding regarding your matter commonly known as a Conditional Fee Agreement, or 'no win, no fee' agreement. We are not obliged to offer this form of funding but I am happy to consider doing so. This is subject to us entering into a separate funding agreement between us (a contract). Transparently we only offer no win, no fee funding where it stacks up for you and for us and we need to be sufficiently confident in your prospects of success. At this initial stage please therefore provide the initial documents and information I have requested to enable me to initially briefly review whether this will be appropriate.`,
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
  {
    title: 'Next Steps',
    description: 'Define clear next steps for the client.',
    placeholder: '[Follow-Up Instructions Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Confirm Instructions, Payment & Document Submission',
        previewText: 
          `To confirm my instructions and to enable us to open a file and move this forwards please take the steps below:\n\n` +
          `We are required to verify your identity. Please complete the identity form below with your personal details. We will try to verify you electronically initially;\n\n` +
          `https://helix-law.co.uk/proof-of-identity/\n\n` +
          `We work with funds on account of costs at all times. Please pay £1800 on account of costs, using our account details below:\n\n` +
          `<ul type="disc" style="padding-left:20px; margin:0 0 0 20px;">` +
            `<li>Helix Law General Client Account</li>` +
            `<li>Barclays Bank</li>` +
            `<li>Account Number: 93472434</li>` +
            `<li>Sort Code: 20-27-91</li>` +
            `<li>Reference: FE [NAME] // [ACID]</li>` +
          `</ul>\n` +
          `Please ensure to quote the above reference so that we promptly identify your payment.\n\n` +
          `I have mentioned above some specific documents that will assist me at this stage. Please put these together and email them to me.\n\n` +
          `If the file sizes or volume are significant please let me know and we can arrange a document sharing facility for you to send these to us. Alternatively please send the files to me via WeTransfer or Dropbox—both are free services.`,
      },
    ],
  },  

  // Separate Block for Meeting Link
  {
    title: 'Meeting Link',
    description: 'Provide the client with an option to schedule a meeting.',
    placeholder: '[Meeting Link Placeholder]',
    isMultiSelect: false,
    options: [
      {
        label: 'Meeting Link',
        previewText: 
          `You are welcome to schedule a meeting using the link below:\n\n` +
          `https://calendly.com/helixlaw-fe`,
      },
    ],
  },  
  {
    title: 'Closing Notes',
    description: 'Summarise and add a personal touch to the email.',
    placeholder: '[Closing Notes Placeholder]',
    isMultiSelect: true,
    options: [
      {
        "label": "Closing",
        "previewText": "I hope the above helps and look forward to helping resolve your matter.\n\nThere is obviously some degree of complexity factually and legally in relation to your matter. We’re a specialist team and I hope to assist you navigate the process effectively to achieve a positive outcome.\n\nTo be clear, when you have completed the above steps we will review the position and at our discretion will open a file. We will then set out the terms of our retainer and file with you and will ask you to confirm that those terms are accepted. Only at that stage will a retainer be confirmed between us. Although unusual, we may decline to act for you for any reason in which case any monies paid by you will be returned without charge. I hope the above makes sense and is clear but don't hesitate to contact me if you have any queries and I will be happy to help."
      },
    ],
  },
  {
    title: 'Google Review',
    description: 'Encourage prospects to leave a Google review.',
    placeholder: '[Google Review Placeholder]',
    isMultiSelect: true,
    options: [
      {
        label: 'Request for Review',
        previewText: `I hope the above [and our call] is useful and of course come back to me if I can help you further.\n\nIn the meantime, I’m wondering if you can help me by providing a brief positive Google review of me and Helix Law. We’re a small but specialist team, and this would make a huge difference to us.\n\nIf you don’t mind, please can you give us a brief 5* positive review at the following link:\n\nhttp://bit.ly/2gGwyNJ\n\nYou will need to be signed into Google.\n\nMany thanks in advance.`,
      },
    ],
  }  
];
