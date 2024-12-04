export interface AttachmentOption {
  key: string;
  text: string;
  applicableTo?: string[]; // Optional: Define the practice areas this attachment is relevant to
}

export const availableAttachments: AttachmentOption[] = [
  // Universal Attachments
  { key: 'client-welcome-pack', text: 'Client Welcome Pack' },
  { key: 'guide-to-litigation', text: 'Guide to Litigation' },
  { key: 'terms-of-business', text: 'Terms of Business' },
  { key: 'faqs', text: 'FAQs' },

  // Practice Area-Specific Attachments
  { key: 'services-for-investors', text: 'Services for Investors', applicableTo: ['Commercial'] },
  { key: 'services-for-the-construction-industry', text: 'Services for the Construction Industry', applicableTo: ['Construction'] },
  { key: 'services-for-employers', text: 'Services for Employers', applicableTo: ['Employment'] },
  { key: 'services-for-landlords', text: 'Services for Landlords', applicableTo: ['Property'] },
  { key: 'services-for-agents', text: 'Services for Agents', applicableTo: ['Property'] },
  { key: 'guide-to-a-successful-tenancy', text: 'Guide to a Successful Tenancy', applicableTo: ['Property'] },
];

export default availableAttachments;
