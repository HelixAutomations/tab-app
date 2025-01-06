// src/app/customisation/Attachments.ts

export interface AttachmentOption {
  key: string;
  text: string;
  applicableTo?: string[]; // Optional: Define the practice areas this attachment is relevant to
  status: 'production' | 'draft'; // New: Status of the attachment
  link: string; // New: URL link for the attachment
}


export const availableAttachments: AttachmentOption[] = [
  // Universal Attachments
  {
    key: 'client-welcome-pack',
    text: 'Client Welcome Pack',
    status: 'draft',
    link: '#', // Placeholder link for draft
  },
  {
    key: 'guide-to-litigation',
    text: 'Guide to Litigation',
    status: 'draft',
    link: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/ESgqdEAOBx9FrF2pgI45XJEBbFPIS6Do6whaJpV8dLtszg?e=zH1cCI',
  },
  {
    key: 'terms-of-business',
    text: 'Terms of Business',
    status: 'production',
    link: 'https://helix-law.co.uk/terms-and-conditions/',
  },
  {
    key: 'faqs',
    text: 'FAQs',
    status: 'draft',
    link: '#', // Placeholder link for draft
  },

  // Practice Area-Specific Attachments
  {
    key: 'services-for-investors',
    text: 'Services for Investors',
    applicableTo: ['Commercial'],
    status: 'production',
    link: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/EXkqf5Ye17REkQi2cynH85wB0WHRbQCuArZaLuH_NPve2A?e=IQw5n2',
  },
  {
    key: 'services-for-the-construction-industry',
    text: 'Services for the Construction Industry',
    applicableTo: ['Construction'],
    status: 'production',
    link: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/EZINHVau6dVHspG9yAwCV08BxsMOPYIWdKff8hApzP1CZg?e=qfamTm',
  },
  {
    key: 'resolving-a-building-dispute', // Updated key to use kebab-case for consistency
    text: 'Resolving a Building Dispute',
    applicableTo: ['Construction'],
    status: 'production',
    link: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/ESoiCNUf6HBHqYUjUrxu82YBlfYsPjqO7ils4NEg9_BlAA?e=zNv9Eo',
  },
  {
    key: 'services-for-employers',
    text: 'Services for Employers',
    applicableTo: ['Employment'],
    status: 'draft',
    link: '#', // Placeholder link for draft
  },
  {
    key: 'services-for-landlords',
    text: 'Services for Landlords',
    applicableTo: ['Property'],
    status: 'draft',
    link: '#', // Placeholder link for draft
  },
  {
    key: 'services-for-agents',
    text: 'Services for Agents',
    applicableTo: ['Property'],
    status: 'draft',
    link: '#', // Placeholder link for draft
  },
  {
    key: 'guide-to-a-successful-tenancy',
    text: 'Guide to a Successful Tenancy',
    applicableTo: ['Property'],
    status: 'draft',
    link: '#', // Placeholder link for draft
  },
];

export default availableAttachments;
