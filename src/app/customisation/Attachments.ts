// src/app/customisation/Attachments.ts

export interface AttachmentOption {
    key: string;
    text: string;
  }
  
  export const availableAttachments: AttachmentOption[] = [
    { key: 'lease-agreements', text: 'Lease Agreements' },
    { key: 'correspondence', text: 'Correspondence' },
    { key: 'financial-statements', text: 'Financial Statements' },
    { key: 'legal-filings', text: 'Legal Filings' },
    { key: 'property-documents', text: 'Property Documents' },
    { key: 'tenant-information', text: 'Tenant Information' },
    // Add more attachments as needed
  ];
  