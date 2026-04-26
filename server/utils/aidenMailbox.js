const { getGraphAccessToken, normalizeEmails } = require('./helixEmail');

const AIDEN_GRAPH_AUTH = {
  clientIdSecretName: 'graph-aidenteams-clientid',
  clientSecretSecretName: 'aiden-email-secret-value',
};

const INBOX_MESSAGE_SELECT = 'id,subject,receivedDateTime,from,toRecipients,ccRecipients,bodyPreview,body,hasAttachments,importance,internetMessageId';

function normalizeInternetMessageId(id) {
  if (!id) return id;
  let trimmed = String(id).trim();
  if (!trimmed.startsWith('<')) trimmed = `<${trimmed}`;
  if (!trimmed.endsWith('>')) trimmed = `${trimmed}>`;
  return trimmed;
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

async function getAidenGraphAccessToken() {
  return getGraphAccessToken(AIDEN_GRAPH_AUTH);
}

function buildMailboxSearchQuery(correspondentEmail) {
  return `(from:${correspondentEmail} OR to:${correspondentEmail})`;
}

function transformMailboxMessage(email) {
  const rawBody = email?.body || null;
  const bodyContentType = rawBody?.contentType === 'html' || rawBody?.contentType === 'text'
    ? rawBody.contentType
    : null;
  const bodyContent = typeof rawBody?.content === 'string' ? rawBody.content : null;

  return {
    id: email.id,
    subject: email.subject || '(No Subject)',
    receivedDateTime: email.receivedDateTime,
    from: email.from?.emailAddress?.address || 'Unknown',
    fromName: email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown',
    bodyPreview: email.bodyPreview || '',
    bodyHtml: bodyContentType === 'html' ? (bodyContent || '') : '',
    bodyText: bodyContentType === 'text' ? (bodyContent || '') : '',
    hasAttachments: email.hasAttachments || false,
    importance: email.importance || 'normal',
    toRecipients: (email.toRecipients || []).map((recipient) => recipient.emailAddress?.address).filter(Boolean),
    ccRecipients: (email.ccRecipients || []).map((recipient) => recipient.emailAddress?.address).filter(Boolean),
    internetMessageId: email.internetMessageId || null,
  };
}

function transformMailboxSearchResults(emails = []) {
  const transformedEmails = emails.map(transformMailboxMessage);
  transformedEmails.sort((left, right) => new Date(right.receivedDateTime).getTime() - new Date(left.receivedDateTime).getTime());
  return transformedEmails;
}

async function searchMailboxMessages({ mailboxEmail, correspondentEmail, maxResults = 50, reqId, accessToken } = {}) {
  const resolvedAccessToken = accessToken || await getAidenGraphAccessToken();
  const searchQuery = buildMailboxSearchQuery(correspondentEmail);
  const searchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages?`
    + `$search="${encodeURIComponent(searchQuery)}"&`
    + `$top=${maxResults}&`
    + `$select=${INBOX_MESSAGE_SELECT}`;

  const graphRes = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${resolvedAccessToken}`,
      ConsistencyLevel: 'eventual',
      'client-request-id': reqId,
      'return-client-request-id': 'true',
    },
  });

  const responseText = await graphRes.text();
  const graphRequestId = graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null;
  const clientRequestId = graphRes.headers.get('client-request-id') || null;
  const emails = graphRes.status === 200
    ? transformMailboxSearchResults(JSON.parse(responseText)?.value || [])
    : [];

  return {
    status: graphRes.status,
    searchQuery,
    searchUrl,
    responseText,
    graphRequestId,
    clientRequestId,
    emails,
  };
}

async function findMessageIdByInternetId(mailboxEmail, internetMessageId, options = {}) {
  const accessToken = options.accessToken || await getAidenGraphAccessToken();
  const normalized = normalizeInternetMessageId(internetMessageId);
  const filter = `internetMessageId eq '${escapeODataString(normalized)}'`;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages?$select=id&$top=1&$filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`findMessageIdByInternetId failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json?.value?.[0]?.id || null;
}

async function resolveMessageIdAcrossMailboxes({
  messageId,
  internetMessageId,
  preferredMailbox,
  candidateMailboxes = [],
  accessToken,
  log,
  warn,
}) {
  const resolvedAccessToken = accessToken || await getAidenGraphAccessToken();
  const logger = typeof log === 'function' ? log : () => {};
  const warningLogger = typeof warn === 'function' ? warn : () => {};
  const candidates = Array.from(new Set([preferredMailbox, ...candidateMailboxes].filter(Boolean)));
  let sourceMailbox = preferredMailbox || candidates[0] || null;

  if (messageId || !internetMessageId || !sourceMailbox) {
    return {
      resolvedMessageId: messageId || null,
      resolvedViaInternetId: false,
      sourceMailbox,
    };
  }

  let resolvedMessageId = await findMessageIdByInternetId(sourceMailbox, internetMessageId, { accessToken: resolvedAccessToken });
  logger(`[aidenMailbox] Resolved Graph message id via internetMessageId: ${resolvedMessageId}`);

  if (!resolvedMessageId) {
    for (const candidate of candidates) {
      if (candidate === sourceMailbox) continue;
      try {
        const altId = await findMessageIdByInternetId(candidate, internetMessageId, { accessToken: resolvedAccessToken });
        if (altId) {
          resolvedMessageId = altId;
          sourceMailbox = candidate;
          logger(`[aidenMailbox] Resolved via alternate mailbox ${candidate}: ${resolvedMessageId}`);
          break;
        }
      } catch (error) {
        warningLogger(`[aidenMailbox] Alternate mailbox lookup failed ${candidate}: ${error?.message || error}`);
      }
    }
  }

  return {
    resolvedMessageId,
    resolvedViaInternetId: true,
    sourceMailbox,
  };
}

async function postForwardGraphMessage({ mailboxEmail, messageId, to, accessToken }) {
  const forwardUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/forward`;
  const forwardPayload = {
    comment: '',
    toRecipients: normalizeEmails(to).map((email) => ({ emailAddress: { address: email } })),
  };

  return fetch(forwardUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(forwardPayload),
  });
}

async function tryForwardMailboxMessage({
  to,
  messageId,
  internetMessageId,
  preferredMailbox,
  candidateMailboxes = [],
  log,
  warn,
}) {
  const accessToken = await getAidenGraphAccessToken();
  const logger = typeof log === 'function' ? log : () => {};
  const warningLogger = typeof warn === 'function' ? warn : () => {};

  let {
    resolvedMessageId,
    resolvedViaInternetId,
    sourceMailbox,
  } = await resolveMessageIdAcrossMailboxes({
    messageId,
    internetMessageId,
    preferredMailbox,
    candidateMailboxes,
    accessToken,
    log: logger,
    warn: warningLogger,
  });

  if (!resolvedMessageId || !sourceMailbox) {
    return {
      ok: false,
      fallbackReason: 'unresolved-message-id',
      sourceMailbox,
      resolvedMessageId,
      resolvedViaInternetId,
      status: 404,
      error: 'No resolvable message id for true forward',
    };
  }

  let forwardRes = await postForwardGraphMessage({
    mailboxEmail: sourceMailbox,
    messageId: resolvedMessageId,
    to,
    accessToken,
  });
  let status = forwardRes.status;
  let errorText = forwardRes.ok ? '' : await forwardRes.text();

  if (!forwardRes.ok && internetMessageId && status === 404) {
    const retryResolution = await resolveMessageIdAcrossMailboxes({
      messageId: null,
      internetMessageId,
      preferredMailbox: sourceMailbox,
      candidateMailboxes,
      accessToken,
      log: logger,
      warn: warningLogger,
    });

    if (retryResolution.resolvedMessageId) {
      resolvedMessageId = retryResolution.resolvedMessageId;
      sourceMailbox = retryResolution.sourceMailbox;
      resolvedViaInternetId = resolvedViaInternetId || retryResolution.resolvedViaInternetId;
      forwardRes = await postForwardGraphMessage({
        mailboxEmail: sourceMailbox,
        messageId: resolvedMessageId,
        to,
        accessToken,
      });
      status = forwardRes.status;
      errorText = forwardRes.ok ? '' : await forwardRes.text();
    }
  }

  const graphRequestId = forwardRes.headers.get('request-id') || forwardRes.headers.get('x-ms-request-id') || null;

  if (forwardRes.ok) {
    return {
      ok: true,
      sourceMailbox,
      resolvedMessageId,
      resolvedViaInternetId,
      status,
      graphRequestId,
    };
  }

  return {
    ok: false,
    fallbackReason: 'graph-forward-failed',
    sourceMailbox,
    resolvedMessageId,
    resolvedViaInternetId,
    status,
    graphRequestId,
    error: errorText,
  };
}

module.exports = {
  AIDEN_GRAPH_AUTH,
  getAidenGraphAccessToken,
  findMessageIdByInternetId,
  searchMailboxMessages,
  tryForwardMailboxMessage,
};