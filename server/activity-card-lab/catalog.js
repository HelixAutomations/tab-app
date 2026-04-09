const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, 'templates');

const TEMPLATE_CATALOG = [
  {
    id: 'commercial-cta-form',
    label: 'Commercial enquiry',
    category: 'Enquiries',
    fileName: 'commercial-cta-form.json',
    description: 'Commercial web-form enquiry with claim actions and contact details.',
    defaultRoute: 'commercial',
    summary: 'Commercial enquiry card from Activity Card Lab',
    sampleData: {},
  },
  {
    id: 'direct-email-info',
    label: 'Direct email enquiry',
    category: 'Emails',
    fileName: 'direct-email-info.json',
    description: 'Inbound email enquiry card with simple claim and manage actions.',
    defaultRoute: 'general',
    summary: 'Direct email card from Activity Card Lab',
    sampleData: {
      prospectName: 'Sarah Mitchell',
      prospectEmail: 'sarah.mitchell@example.com',
      subject: 'Urgent advice on commercial tenancy dispute',
      emailBody: 'We have a dispute with our landlord over repairs, service charge, and an exit schedule. Please let me know whether someone can speak with us this week.',
      colleagueEmail: 'lz@helix-law.com',
    },
  },
  {
    id: 'incoming-call-enquiry',
    label: 'Incoming call enquiry',
    category: 'Calls',
    fileName: 'incoming-call-enquiry.json',
    description: 'Call Hub enquiry card with summary and transcript toggles.',
    defaultRoute: 'general',
    summary: 'Incoming call enquiry card from Activity Card Lab',
    sampleData: {},
  },
];

function resolveTemplate(templateId) {
  return TEMPLATE_CATALOG.find((template) => template.id === templateId) || null;
}

function getPublicTemplateMeta(template) {
  if (!template) return null;
  const { sampleData, ...publicMeta } = template;
  return publicMeta;
}

module.exports = {
  TEMPLATE_CATALOG,
  TEMPLATE_DIR,
  resolveTemplate,
  getPublicTemplateMeta,
};