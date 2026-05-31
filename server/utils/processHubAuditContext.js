const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithProcessHubAuditContext(context, callback) {
  return storage.run(context, callback);
}

function getProcessHubAuditContext() {
  return storage.getStore() || null;
}

function markProcessHubSubmissionRecorded({ formKey = null, submissionId = null } = {}) {
  const context = getProcessHubAuditContext();
  if (!context) return;
  context.recorded = true;
  context.formKey = formKey || context.formKey || null;
  context.submissionId = submissionId || context.submissionId || null;
}

module.exports = {
  runWithProcessHubAuditContext,
  getProcessHubAuditContext,
  markProcessHubSubmissionRecorded,
};