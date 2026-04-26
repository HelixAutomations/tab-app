const opLog = require('./opLog');
const { normalizeEmails } = require('./helixEmail');

function maskEmailForActivity(email) {
  if (!email || typeof email !== 'string') return null;
  const [localPart = '', domainPart = ''] = email.trim().split('@');
  if (!localPart && !domainPart) return null;
  if (!domainPart) return `${localPart.slice(0, 2)}***`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function appendInboxSearchActivity({ status = 'info', feeEarnerEmail, prospectEmail, resultCount = 0, durationMs, error } = {}) {
  const maskedProspectEmail = maskEmailForActivity(prospectEmail);
  const maskedFeeEarnerEmail = maskEmailForActivity(feeEarnerEmail);
  const safeResultCount = Number.isFinite(Number(resultCount)) ? Number(resultCount) : 0;
  const summaryParts = [];

  if (maskedProspectEmail) summaryParts.push(maskedProspectEmail);
  if (maskedFeeEarnerEmail) summaryParts.push(`mailbox ${maskedFeeEarnerEmail}`);
  if (status !== 'error') summaryParts.push(`${pluralize(safeResultCount, 'message')} found`);
  if (Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0) {
    summaryParts.push(`${Math.round(Number(durationMs))}ms`);
  }
  if (error) summaryParts.push(String(error));

  return opLog.append({
    type: 'activity.email.search',
    status,
    title: status === 'error'
      ? 'Email thread lookup failed'
      : safeResultCount > 0
        ? 'Email thread viewed'
        : 'Email thread checked',
    summary: summaryParts.join(' · ') || 'Mailbox search activity recorded.',
    maskedProspectEmail,
    maskedFeeEarnerEmail,
    resultCount: safeResultCount,
    durationMs: Number.isFinite(Number(durationMs)) ? Math.round(Number(durationMs)) : null,
  });
}

function appendEmailForwardActivity({ status = 'success', to, cc, method, sourceMailbox, fallbackReason, durationMs, error } = {}) {
  const recipients = normalizeEmails([to, cc].filter(Boolean));
  const maskedSourceMailbox = maskEmailForActivity(sourceMailbox);
  const summaryParts = [];

  if (method === 'graph-forward-action') {
    summaryParts.push('native forward');
  } else if (method === 'pseudo-forward') {
    summaryParts.push('forward copy sent');
  }

  if (fallbackReason) summaryParts.push(`fallback ${fallbackReason}`);
  if (maskedSourceMailbox) summaryParts.push(`from ${maskedSourceMailbox}`);
  if (recipients.length > 0) summaryParts.push(`${pluralize(recipients.length, 'recipient')}`);
  if (Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0) {
    summaryParts.push(`${Math.round(Number(durationMs))}ms`);
  }
  if (error) summaryParts.push(String(error));

  return opLog.append({
    type: 'activity.email.forward',
    status,
    title: status === 'error' ? 'Email forward failed' : 'Email forwarded',
    summary: summaryParts.join(' · ') || 'Email forward activity recorded.',
    method: method || null,
    fallbackReason: fallbackReason || null,
    maskedSourceMailbox,
    recipientCount: recipients.length,
    durationMs: Number.isFinite(Number(durationMs)) ? Math.round(Number(durationMs)) : null,
  });
}

module.exports = {
  appendInboxSearchActivity,
  appendEmailForwardActivity,
};