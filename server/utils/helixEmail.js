/* eslint-disable no-console */
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const opLog = require('./opLog');
const { getSecret } = require('./getSecret');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { recordHomeJourneyEmailEvent } = require('./homeJourneyEmailEvents');

const DEFAULT_GRAPH_CLIENT_ID_SECRET = 'graph-pitchbuilderemailprovider-clientid';
const DEFAULT_GRAPH_CLIENT_SECRET_SECRET = 'graph-pitchbuilderemailprovider-clientsecret';
const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

const graphSecretCache = new Map();
const graphTokenCache = new Map();

function resolveGraphSecretNames(options = {}) {
  return {
    clientIdSecretName: options.clientIdSecretName || DEFAULT_GRAPH_CLIENT_ID_SECRET,
    clientSecretSecretName: options.clientSecretSecretName || DEFAULT_GRAPH_CLIENT_SECRET_SECRET,
  };
}

function getGraphCacheKey(options = {}) {
  const { clientIdSecretName, clientSecretSecretName } = resolveGraphSecretNames(options);
  return `${clientIdSecretName}|${clientSecretSecretName}`;
}

async function getGraphSecrets(options = {}) {
  const { clientIdSecretName, clientSecretSecretName } = resolveGraphSecretNames(options);
  const cacheKey = getGraphCacheKey(options);
  const now = Date.now();
  const cachedSecrets = graphSecretCache.get(cacheKey);
  if (cachedSecrets?.id && cachedSecrets?.secret && now - cachedSecrets.ts < 30 * 60 * 1000) {
    return { clientId: cachedSecrets.id, clientSecret: cachedSecrets.secret };
  }
  const [clientId, clientSecret] = await Promise.all([
    getSecret(clientIdSecretName),
    getSecret(clientSecretSecretName),
  ]);
  graphSecretCache.set(cacheKey, { id: clientId, secret: clientSecret, ts: now });
  return { clientId, clientSecret };
}

async function getGraphToken(options = {}) {
  const cacheKey = getGraphCacheKey(options);
  const now = Math.floor(Date.now() / 1000);
  const cachedToken = graphTokenCache.get(cacheKey);
  if (cachedToken?.token && cachedToken.exp - 300 > now) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = await getGraphSecrets(options);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token request failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  graphTokenCache.set(cacheKey, { token: json.access_token, exp: now + (json.expires_in || 3600) });
  return json.access_token;
}

function normalizeEmails(emails) {
  if (!emails) return [];
  const raw = Array.isArray(emails) ? emails : [emails];
  const splitRegex = /[,;]+/;
  const flattened = raw
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(splitRegex) : []))
    .map((entry) => (entry || '').trim())
    .filter((entry) => entry.length > 0);
  const seen = new Set();
  const unique = [];
  for (const address of flattened) {
    if (!seen.has(address)) {
      seen.add(address);
      unique.push(address);
    }
  }
  return unique;
}

function toRecipients(emails) {
  return normalizeEmails(emails).map((address) => ({ emailAddress: { address } }));
}

function wrapSystemSignature(bodyHtml) {
  return `<!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8" /><title>Helix Email</title></head>
  <body style="margin:0; padding:0; font-family: Raleway, Arial, sans-serif; font-size:10pt; line-height:1.4; color:#000;">
    <div style="margin-bottom:4px;">${bodyHtml}</div>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0; padding:0; width:auto;">
      <tr><td style="padding-bottom:8px;"><img src="https://helix-law.co.uk/wp-content/uploads/2025/01/50px-logo.png" alt="Helix Law Logo" style="height:50px; display:block;" /></td></tr>
      <tr><td style="padding-top:8px; color:#D65541; font-size:6pt; line-height:1.4;">DISCLAIMER: Please be aware of cyber-crime. Our bank account details will NOT change during the course of a transaction. Helix Law Limited will not be liable if you transfer money to an incorrect account. We accept no responsibility or liability for malicious or fraudulent emails purportedly coming from our firm, and it is your responsibility to ensure that any emails coming from us are genuine before relying on anything contained within them.</td></tr>
      <tr><td style="padding-top:8px; font-style:italic; font-size:6pt; line-height:1.4; color:#444;">Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. Authorised and regulated by the Solicitors Regulation Authority. The term partner is a reference to a Director or senior solicitor of Helix Law Limited. Helix Law Limited does not accept service by email.</td></tr>
    </table>
  </body></html>`;
}

function maybeWrapSignature(html) {
  const hasSignature = /Helix Law Limited is a limited liability company/i.test(html)
    || /DISCLAIMER: Please be aware of cyber-crime/i.test(html)
    || /data-no-signature/i.test(html);
  return hasSignature ? html : wrapSystemSignature(html);
}

function looksLikeHasSignature(html) {
  if (!html) return false;
  return /Helix Law Limited is a limited liability company/i.test(html)
    || /DISCLAIMER: Please be aware of cyber-crime/i.test(html);
}

function findFirstExistingDir(dirCandidates) {
  for (const dir of dirCandidates) {
    if (!dir) continue;
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // ignore
    }
  }
  return null;
}

function getSignaturesRootDir() {
  const envDir = String(process.env.SIGNATURES_DIR || '').trim();
  const candidates = [
    envDir || null,
    path.join(__dirname, '..', '..', 'assets', 'signatures'),
    path.join(__dirname, '..', '..', 'src', 'assets', 'signatures'),
    path.join(process.cwd(), 'assets', 'signatures'),
    path.join(process.cwd(), 'src', 'assets', 'signatures'),
  ];
  return findFirstExistingDir(candidates);
}

function safeReadTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function ensureNoopenerRelForBlankTargets(html) {
  const input = String(html || '');
  if (!input) return input;

  return input.replace(/<a\b[^>]*\btarget=(['"])_blank\1[^>]*>/gi, (tag) => {
    if (!/\srel\s*=\s*/i.test(tag)) {
      return tag.replace(/>$/, ' rel="noopener noreferrer">');
    }

    return tag.replace(/\brel\s*=\s*(['"])([^'"]*)\1/i, (_match, quote, relValue) => {
      const tokens = String(relValue || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
      const set = new Set(tokens.map((token) => token.toLowerCase()));
      set.add('noopener');
      set.add('noreferrer');
      return `rel=${quote}${Array.from(set).join(' ')}${quote}`;
    });
  });
}

function sanitizeSignatureHtml(signatureHtml) {
  let html = String(signatureHtml || '').trim();
  if (!html) return html;

  html = html.replace(/^\uFEFF/, '');

  const firstTagIndex = html.indexOf('<');
  if (firstTagIndex > 0) {
    html = html.slice(firstTagIndex);
  }

  html = html
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<html\b[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<body\b[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if[\s\S]*?\]>/gi, '')
    .replace(/<!\[endif\]>/gi, '')
    .replace(/<!--(?!\s*\[if)[\s\S]*?-->/gi, '');

  html = html.replace(
    /<u>\s*([a-z0-9._%+-]+)\s*<a\b([^>]*?)href=(['"])mailto:([^'"]+)\3([^>]*)>\s*(@?[^<]*)\s*<\/a>\s*<\/u>/gi,
    (_match, prefix, preAttrs, quote, hrefEmail, postAttrs, anchorText) => {
      const normalizedHrefEmail = String(hrefEmail || '').trim();
      const normalizedPrefix = String(prefix || '').trim();
      const normalizedAnchorText = String(anchorText || '').trim();
      const displayEmail = normalizedAnchorText.startsWith('@')
        ? `${normalizedPrefix}${normalizedAnchorText}`
        : normalizedHrefEmail;

      return `<u><a${preAttrs}href=${quote}mailto:${normalizedHrefEmail}${quote}${postAttrs}>${displayEmail}</a></u>`;
    }
  );

  return html.trim();
}

function pickSignatureFileFromDir(dirPath, fromEmail) {
  let files = [];
  try {
    files = fs.readdirSync(dirPath);
  } catch {
    return null;
  }
  const htmlFiles = files
    .filter((fileName) => /\.html?$/i.test(fileName) || /\.htm$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right));
  if (!htmlFiles.length) return null;
  const from = String(fromEmail || '').trim().toLowerCase();
  if (from) {
    const preferred = htmlFiles.find((fileName) => fileName.toLowerCase().includes(`(${from})`));
    if (preferred) return preferred;
  }
  return htmlFiles[0];
}

function loadPersonalSignatureHtml({ signatureInitials, fromEmail }) {
  const root = getSignaturesRootDir();
  if (!root) return null;

  const initials = String(signatureInitials || '').trim().toUpperCase();
  const fromLocalPart = String(fromEmail || '').split('@')[0]?.trim().toUpperCase() || '';
  const folderCandidates = [initials, fromLocalPart].filter(Boolean);
  const tried = new Set();

  for (const folderName of folderCandidates) {
    if (tried.has(folderName)) continue;
    tried.add(folderName);

    const folderPath = path.join(root, folderName);
    if (!fs.existsSync(folderPath)) continue;
    const picked = pickSignatureFileFromDir(folderPath, fromEmail);
    if (!picked) continue;
    const html = safeReadTextFile(path.join(folderPath, picked));
    if (html && html.trim()) {
      return ensureNoopenerRelForBlankTargets(sanitizeSignatureHtml(html));
    }
  }

  return null;
}

function appendSignature(bodyHtml, signatureHtml) {
  const body = String(bodyHtml || '').trim();
  const sig = String(signatureHtml || '').trim();
  if (!sig) return body;
  if (!body) return sig;
  return `${body}<br />${sig}`;
}

function readHeader(req, headerName) {
  if (!req || typeof req.get !== 'function') return null;
  try {
    return req.get(headerName) || null;
  } catch {
    return null;
  }
}

function pickEmailSource(body, req) {
  const explicit = body.source || body.email_source || body.stream_source || body.context || null;
  if (explicit) return String(explicit).slice(0, 100);

  const referer = String(readHeader(req, 'referer') || '');
  if (referer.includes('/instructions')) return 'instructions-ui';
  if (referer.includes('/enquiries')) return 'enquiries-ui';
  if (referer.includes('/home')) return 'home-ui';
  return 'manual-send';
}

function pickEmailContextLabel(body) {
  const candidates = [
    body.contextLabel,
    body.template_name,
    body.templateName,
    body.supportCategory,
    body.subject,
  ];
  const value = candidates.find((candidate) => String(candidate || '').trim());
  return value ? String(value).slice(0, 200) : null;
}

function buildEmailEventMetadata(body, req) {
  const metadata = {
    referer: readHeader(req, 'referer'),
    templateName: body.template_name || body.templateName || null,
    recipientDetails: body.recipient_details || null,
    saveToSentItems: body.saveToSentItems === true,
  };

  return Object.values(metadata).some(Boolean) ? metadata : null;
}

async function sendHelixEmail({ body = {}, req = null, debug = false, route = 'server:/api/sendEmail' } = {}) {
  const reqId = randomUUID();
  const started = Date.now();
  const to = String(body.user_email || body.to || '').trim();
  const subject = String(body.subject || 'Your Enquiry from Helix');
  const fromEmail = String(body.from_email || 'automations@helix-law.com');

  let skipSignature = body.skipSignature === true || body.skip_signature === true;
  const usePersonalSignature = body.use_personal_signature === true || body.usePersonalSignature === true;
  const signatureInitials = String(body.signature_initials || body.signatureInitials || '').trim();
  const rawBodyHtml = String(body.body_html || body.bodyHtml || body.email_body_html || body.emailBodyHtml || '');
  const legacyHtml = String(body.email_contents || body.html || '');

  let html = legacyHtml || rawBodyHtml;
  if (usePersonalSignature) {
    const baseBody = rawBodyHtml || legacyHtml;
    if (looksLikeHasSignature(baseBody)) {
      html = baseBody;
    } else {
      const sigHtml = loadPersonalSignatureHtml({ signatureInitials, fromEmail });
      if (sigHtml && sigHtml.trim()) {
        html = appendSignature(baseBody, sigHtml);
        skipSignature = true;
      } else {
        html = baseBody;
      }
    }
  }

  const ccList = normalizeEmails(body.cc_emails);
  const bccList = normalizeEmails([body.bcc_emails, body.bcc_email].filter(Boolean));
  const replyToList = normalizeEmails(body.reply_to || body.replyTo || body['reply-to']);
  const saveToSentItems = typeof body.saveToSentItems === 'boolean' ? body.saveToSentItems : false;

  trackEvent('Email.Send.Started', {
    operation: 'send',
    requestId: reqId,
    from: fromEmail,
    ccCount: String(ccList.length),
    bccCount: String(bccList.length),
    saveToSentItems: String(saveToSentItems),
  });

  opLog.append({
    type: 'email.send.attempt',
    reqId,
    route,
    from: fromEmail,
    to,
    subject,
    ccCount: ccList.length,
    bccCount: bccList.length,
    replyToCount: replyToList.length,
    saveToSentItems,
  });

  if (!html || !to) {
    if (debug) {
      console.log(`[email ${reqId}] invalid payload`, {
        hasHtml: !!html,
        to,
        keys: Object.keys(body || {}),
      });
    }
    opLog.append({
      type: 'email.send.error',
      reqId,
      route,
      reason: 'missing-fields',
      details: { hasHtml: !!html, toPresent: !!to },
      status: 400,
    });
    return { ok: false, status: 400, error: 'Missing email_contents or user_email', responseKind: 'json', requestId: reqId };
  }

  if (debug) {
    const previewLen = Number(process.env.EMAIL_LOG_HTML_PREVIEW_CHARS || 0);
    console.log(`[email ${reqId}] prepared`, {
      subject,
      from: fromEmail,
      to,
      ccCount: ccList.length,
      bccCount: bccList.length,
      htmlPreview: previewLen > 0 ? html.slice(0, previewLen) : undefined,
    });
  }

  let accessToken;
  try {
    accessToken = await getGraphToken();
    if (debug) console.log(`[email ${reqId}] token acquired`);
  } catch (error) {
    console.error(`[email ${reqId}] token acquisition failed`, error?.message || error);
    opLog.append({
      type: 'email.send.error',
      reqId,
      route,
      reason: 'token-failed',
      error: String(error?.message || error),
      status: 500,
    });
    return { ok: false, status: 500, error: 'Token acquisition failed', responseKind: 'json', requestId: reqId };
  }

  try {
    const payload = {
      message: {
        subject,
        body: { contentType: 'HTML', content: skipSignature ? html : maybeWrapSignature(html) },
        toRecipients: toRecipients(to),
        from: { emailAddress: { address: fromEmail } },
        ...(ccList.length ? { ccRecipients: toRecipients(ccList) } : {}),
        ...(bccList.length ? { bccRecipients: toRecipients(bccList) } : {}),
        ...(replyToList.length ? { replyTo: toRecipients(replyToList) } : {}),
      },
      saveToSentItems,
    };

    if (debug) {
      console.log(`[email ${reqId}] sending via Graph users/${fromEmail}/sendMail`);
    }

    const graphRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'client-request-id': reqId,
        'return-client-request-id': 'true',
      },
      body: JSON.stringify(payload),
    });

    const durationMs = Date.now() - started;
    const graphRequestId = graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null;
    const respText = graphRes.status === 202 ? '' : await graphRes.text();

    if (debug) {
      console.log(`[email ${reqId}] graph response`, {
        status: graphRes.status,
        requestId: graphRequestId,
        clientRequestId: graphRes.headers.get('client-request-id') || null,
        date: graphRes.headers.get('date') || null,
        durationMs,
        body: graphRes.status === 202 ? undefined : respText?.slice(0, 500),
      });
    }

    opLog.append({
      type: 'email.send.result',
      reqId,
      route,
      status: graphRes.status,
      requestId: graphRequestId,
      clientRequestId: graphRes.headers.get('client-request-id') || null,
      durationMs,
      from: fromEmail,
      to,
      subject,
      ccCount: ccList.length,
      bccCount: bccList.length,
    });

    if (graphRes.status === 202) {
      try {
        await recordHomeJourneyEmailEvent({
          sentAt: new Date().toISOString(),
          senderEmail: fromEmail,
          senderInitials: String(body.signature_initials || req?.user?.initials || '').trim().toUpperCase() || null,
          toRecipients: normalizeEmails(to),
          ccRecipients: ccList,
          bccRecipients: bccList,
          subject,
          source: pickEmailSource(body, req),
          contextLabel: pickEmailContextLabel(body),
          enquiryRef: body.enquiryId || body.enquiry_id || body.enquiryRef || null,
          instructionRef: body.instructionRef || body.instruction_ref || null,
          matterRef: body.matterRef || body.matter_ref || null,
          clientRequestId: reqId,
          graphRequestId,
          metadata: buildEmailEventMetadata(body, req),
        });
      } catch (persistError) {
        trackException(persistError, {
          component: 'Email',
          operation: 'PersistJourneyEvent',
          requestId: reqId,
        });
      }

      trackEvent('Email.Send.Completed', {
        operation: 'send',
        requestId: reqId,
        from: fromEmail,
        status: '202',
        graphRequestId: graphRequestId || '',
        durationMs: String(durationMs),
      });
      trackMetric('Email.Send.Duration', durationMs, {
        operation: 'send',
        from: fromEmail,
      });
      return {
        ok: true,
        status: 200,
        responseText: 'Email sent',
        requestId: reqId,
        graphRequestId: graphRequestId || '',
      };
    }

    trackEvent('Email.Send.Failed', {
      operation: 'send',
      requestId: reqId,
      from: fromEmail,
      status: String(graphRes.status),
      durationMs: String(durationMs),
    });
    trackMetric('Email.Send.Duration', durationMs, {
      operation: 'send',
      status: 'failed',
    });
    return {
      ok: false,
      status: 500,
      error: respText || `Unexpected status ${graphRes.status}`,
      responseKind: 'text',
      requestId: reqId,
      graphRequestId: graphRequestId || '',
    };
  } catch (err) {
    console.error('server sendEmail error:', err);
    trackException(err, {
      component: 'Email',
      operation: 'send',
      phase: 'route',
    });
    trackEvent('Email.Send.Failed', {
      operation: 'send',
      status: 'exception',
      error: String(err?.message || err),
    });
    try {
      opLog.append({ type: 'email.send.error', route, reason: 'unhandled', error: String(err?.message || err), status: 500 });
    } catch {
      // ignore logging errors
    }
    return { ok: false, status: 500, error: err?.message || 'Failed to send email', responseKind: 'json', requestId: reqId };
  }
}

async function createHelixDraft({ body = {}, route = 'server:/api/create-draft' } = {}) {
  const reqId = randomUUID();
  const started = Date.now();
  const mailboxEmail = String(body.mailbox_email || body.mailboxEmail || body.from_email || body.fromEmail || '').trim();
  const subject = String(body.subject || '').trim();
  const rawBodyHtml = String(body.body_html || body.bodyHtml || body.email_body_html || body.emailBodyHtml || body.html || '').trim();
  const signatureInitials = String(body.signature_initials || body.signatureInitials || '').trim();

  if (!mailboxEmail || !subject || !rawBodyHtml) {
    return { ok: false, status: 400, error: 'mailbox_email, subject, and body_html are required', requestId: reqId };
  }

  let html = rawBodyHtml;
  if (!looksLikeHasSignature(rawBodyHtml)) {
    const sigHtml = loadPersonalSignatureHtml({ signatureInitials, fromEmail: mailboxEmail });
    html = sigHtml && sigHtml.trim() ? appendSignature(rawBodyHtml, sigHtml) : maybeWrapSignature(rawBodyHtml);
  }

  const ccList = normalizeEmails(body.cc_emails || body.ccEmails);
  const bccList = normalizeEmails(body.bcc_emails || body.bccEmails);

  opLog.append({
    type: 'email.draft.attempt',
    reqId,
    route,
    mailbox: mailboxEmail,
    subject,
    toCount: normalizeEmails(body.to_email || body.to || body.user_email).length,
    ccCount: ccList.length,
    bccCount: bccList.length,
  });

  let accessToken;
  try {
    accessToken = await getGraphToken();
  } catch (error) {
    opLog.append({
      type: 'email.draft.error',
      reqId,
      route,
      reason: 'token-failed',
      error: String(error?.message || error),
      status: 500,
    });
    return { ok: false, status: 500, error: 'Token acquisition failed', requestId: reqId };
  }

  try {
    const graphRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'client-request-id': reqId,
        'return-client-request-id': 'true',
      },
      body: JSON.stringify({
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: toRecipients(body.to_email || body.to || body.user_email),
        ...(ccList.length ? { ccRecipients: toRecipients(ccList) } : {}),
        ...(bccList.length ? { bccRecipients: toRecipients(bccList) } : {}),
        isDraft: true,
      }),
    });

    const durationMs = Date.now() - started;

    if (!graphRes.ok) {
      const errBody = await graphRes.text();
      opLog.append({
        type: 'email.draft.error',
        reqId,
        route,
        mailbox: mailboxEmail,
        reason: 'graph-failed',
        status: graphRes.status,
        error: errBody.slice(0, 500),
      });
      return { ok: false, status: graphRes.status, error: errBody, requestId: reqId, durationMs };
    }

    const draft = await graphRes.json();
    opLog.append({
      type: 'email.draft.result',
      reqId,
      route,
      mailbox: mailboxEmail,
      status: graphRes.status,
      draftId: draft?.id || null,
      durationMs,
    });

    return { ok: true, status: 200, draft, draftId: draft?.id || null, requestId: reqId, durationMs };
  } catch (error) {
    opLog.append({
      type: 'email.draft.error',
      reqId,
      route,
      mailbox: mailboxEmail,
      reason: 'unhandled',
      status: 500,
      error: String(error?.message || error),
    });
    throw error;
  }
}

module.exports = {
  createHelixDraft,
  getGraphAccessToken: getGraphToken,
  sendHelixEmail,
  normalizeEmails,
};