/**
 * Error context wrapper.
 *
 * Extends trackException() with extra custom dimensions that the System Errors
 * view needs to link an error to a submission/instruction/route and surface
 * the right Recommended action. Never persists payload bodies; only a short
 * fingerprint hash so we can correlate without leaking PII.
 */

const crypto = require('crypto');
const { trackException } = require('./appInsights');

function payloadFingerprint(body) {
  if (body == null) return null;
  try {
    const serialised = typeof body === 'string' ? body : JSON.stringify(body);
    if (!serialised) return null;
    return crypto.createHash('sha256').update(serialised).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function pickInitials(req) {
  const headerInitials = String(req?.headers?.['x-helix-initials'] || '').trim().toUpperCase();
  if (headerInitials) return headerInitials;
  const userInitials = String(req?.user?.initials || '').trim().toUpperCase();
  return userInitials || null;
}

function pickInstructionRef(body) {
  if (!body || typeof body !== 'object') return null;
  return (
    body.instructionRef ||
    body.instruction_ref ||
    body?.matter_details?.instruction_ref ||
    body?.formData?.matter_details?.instruction_ref ||
    null
  );
}

function pickFormKey(body) {
  if (!body || typeof body !== 'object') return null;
  return body.formKey || body.form_key || null;
}

function pickSubmissionId(body) {
  if (!body || typeof body !== 'object') return null;
  return body.submissionId || body.submission_id || null;
}

function pickClientSubmissionId(body) {
  if (!body || typeof body !== 'object') return null;
  return body.clientSubmissionId || body.client_submission_id || null;
}

/**
 * Track an exception with enriched custom dimensions.
 *
 * @param {Error} error
 * @param {import('express').Request} req
 * @param {Object} [extra] Caller-provided dimensions (operation, phase, etc.)
 * @param {Object|string} [body] Request body for fingerprint + correlation (defaults to req.body)
 */
function trackRouteException(error, req, extra = {}, body = undefined) {
  const sourceBody = body !== undefined ? body : req?.body;
  const dimensions = {
    route: String(req?.originalUrl || req?.url || '').split('?')[0] || null,
    method: req?.method || null,
    initials: pickInitials(req),
    submissionId: extra.submissionId || pickSubmissionId(sourceBody),
    clientSubmissionId: extra.clientSubmissionId || pickClientSubmissionId(sourceBody),
    formKey: extra.formKey || pickFormKey(sourceBody),
    instructionRef: extra.instructionRef || pickInstructionRef(sourceBody),
    payloadFingerprint: payloadFingerprint(sourceBody),
    ...extra,
  };
  // Drop nulls so dimensions stay clean in App Insights.
  for (const key of Object.keys(dimensions)) {
    if (dimensions[key] == null || dimensions[key] === '') delete dimensions[key];
  }
  trackException(error instanceof Error ? error : new Error(String(error)), dimensions);
}

module.exports = {
  trackRouteException,
  payloadFingerprint,
};
