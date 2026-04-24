const path = require('path');
const { NOTIFICATION_TEMPLATE_LIBRARY } = require('../utils/hubNotifier');

const TEMPLATE_DIR = path.join(__dirname, 'templates');

// Enquiry/acquisition cards removed from the library 2026-04-19 — they are
// emitted automatically by the enquiry pipelines (commercial CTA, direct
// email, incoming call) and don't need a manual preview/send affordance in
// the templates surface. Keep the static files in `templates/` in case we
// reintroduce them later, but don't expose them in the catalog.
const STATIC_TEMPLATE_CATALOG = [];

const TEMPLATE_CATALOG = [
  ...NOTIFICATION_TEMPLATE_LIBRARY.map((template) => ({
    ...template,
    resolver: 'hub-notifier',
    originLabel: 'Team Hub notification',
  })),
  ...STATIC_TEMPLATE_CATALOG,
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