/* eslint-disable no-console */
const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const opLog = require('../utils/opLog');

const router = express.Router();

// Key Vault setup (reuse same vault as the rest of the server)
const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

// Secret names for Graph client credentials
const GRAPH_CLIENT_ID_SECRET = 'graph-pitchbuilderemailprovider-clientid';
const GRAPH_CLIENT_SECRET_SECRET = 'graph-pitchbuilderemailprovider-clientsecret';
const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

// In-memory cache for secrets and tokens
let cachedSecrets = { id: null, secret: null, ts: 0 };
let cachedToken = { token: null, exp: 0 };

async function getGraphSecrets() {
  const now = Date.now();
  // cache for 30 minutes
  if (cachedSecrets.id && cachedSecrets.secret && now - cachedSecrets.ts < 30 * 60 * 1000) {
    return { clientId: cachedSecrets.id, clientSecret: cachedSecrets.secret };
  }
  const [id, secret] = await Promise.all([
    secretClient.getSecret(GRAPH_CLIENT_ID_SECRET),
    secretClient.getSecret(GRAPH_CLIENT_SECRET_SECRET),
  ]);
  cachedSecrets = { id: id.value, secret: secret.value, ts: now };
  return { clientId: id.value, clientSecret: secret.value };
}

async function getGraphToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.token && cachedToken.exp - 300 > now) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = await getGraphSecrets();
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
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
}

// Normalize a string or array of emails into an array of unique addresses
function normalizeEmails(emails) {
  if (!emails) return [];
  const raw = Array.isArray(emails) ? emails : [emails];
  const splitRegex = /[,;]+/;
  const flattened = raw
    .flatMap((e) => (typeof e === 'string' ? e.split(splitRegex) : []))
    .map((e) => (e || '').trim())
    .filter((e) => e.length > 0);
  const seen = new Set();
  const unique = [];
  for (const addr of flattened) {
    if (!seen.has(addr)) {
      seen.add(addr);
      unique.push(addr);
    }
  }
  return unique;
}

function toRecipients(emails) {
  return normalizeEmails(emails).map((address) => ({ emailAddress: { address } }));
}

// Minimal system signature wrapper (no personal contact block)
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
  // Avoid double-signature: if disclaimer or company blurb already present, return as-is
  // Also skip for system emails marked with data-no-signature or already having full HTML structure
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
    // Relative to this file (robust to different process.cwd() values)
    path.join(__dirname, '..', '..', 'assets', 'signatures'),
    path.join(__dirname, '..', '..', 'src', 'assets', 'signatures'),
    // Deployed webapp package (see build-and-deploy scripts)
    path.join(process.cwd(), 'assets', 'signatures'),
    // Local dev / repo
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

function pickSignatureFileFromDir(dirPath, fromEmail) {
  let files = [];
  try {
    files = fs.readdirSync(dirPath);
  } catch {
    return null;
  }
  const htmlFiles = files
    .filter((f) => /\.html?$/i.test(f) || /\.htm$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
  if (!htmlFiles.length) return null;
  const from = String(fromEmail || '').trim().toLowerCase();
  if (from) {
    const preferred = htmlFiles.find((f) => f.toLowerCase().includes(`(${from})`));
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
    if (html && html.trim()) return html;
  }

  return null;
}

function appendSignature(bodyHtml, signatureHtml) {
  const body = String(bodyHtml || '').trim();
  const sig = String(signatureHtml || '').trim();
  if (!sig) return body;
  if (!body) return sig;
  // Single line break for visual separation between body and signature
  return `${body}<br />${sig}`;
}

router.post('/sendEmail', async (req, res) => {
  try {
    const reqId = randomUUID();
    // Per-request debug without relying on env flags
    const debugHeader = String(req.get('x-email-debug') || '').toLowerCase();
    const debugQuery = String(req.query?.debug || '').toLowerCase();
    const debug = debugHeader === '1' || debugHeader === 'true' || debugQuery === '1' || debugQuery === 'true';
    const started = Date.now();
    const body = req.body || {};
    const to = String(body.user_email || body.to || '').trim();
    const subject = String(body.subject || 'Your Enquiry from Helix');
    const fromEmail = String(body.from_email || 'automations@helix-law.com');

    // Allow callers to explicitly skip signature
    let skipSignature = body.skipSignature === true || body.skip_signature === true;

    const usePersonalSignature = body.use_personal_signature === true || body.usePersonalSignature === true;
    const signatureInitials = String(body.signature_initials || body.signatureInitials || '').trim();

    // Accept alternate field names for compatibility with older callers
    const rawBodyHtml = String(body.body_html || body.bodyHtml || body.email_body_html || body.emailBodyHtml || '');
    const legacyHtml = String(body.email_contents || body.html || '');

    let html = legacyHtml || rawBodyHtml;
    if (usePersonalSignature) {
      // Prefer explicit body-only HTML when using personal signatures
      const baseBody = rawBodyHtml || legacyHtml;
      if (looksLikeHasSignature(baseBody)) {
        html = baseBody;
      } else {
        const sigHtml = loadPersonalSignatureHtml({ signatureInitials, fromEmail });
        if (sigHtml && sigHtml.trim()) {
          html = appendSignature(baseBody, sigHtml);
          // Personal signatures already include the signature/disclaimer block.
          // Do not wrap with the legacy system signature.
          skipSignature = true;
        } else {
          html = baseBody;
        }
      }
    }

    // Support both array/string and legacy bcc_email
    const ccList = normalizeEmails(body.cc_emails);
    const bccList = normalizeEmails([body.bcc_emails, body.bcc_email].filter(Boolean));
    const replyToList = normalizeEmails(body.reply_to || body.replyTo || body['reply-to']);
    const saveToSentItems = typeof body.saveToSentItems === 'boolean' ? body.saveToSentItems : false;

    // Always write an ops log entry for observability
    opLog.append({
      type: 'email.send.attempt',
      reqId,
      route: 'server:/api/sendEmail',
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
        route: 'server:/api/sendEmail',
        reason: 'missing-fields',
        details: { hasHtml: !!html, toPresent: !!to },
        status: 400,
      });
      return res.status(400).json({ error: 'Missing email_contents or user_email' });
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
    } catch (e) {
      console.error(`[email ${reqId}] token acquisition failed`, e?.message || e);
      opLog.append({
        type: 'email.send.error',
        reqId,
        route: 'server:/api/sendEmail',
        reason: 'token-failed',
        error: String(e?.message || e),
        status: 500,
      });
      return res.status(500).json({ error: 'Token acquisition failed' });
    }

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
      // Allow per-request override; default false
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
    const respText = graphRes.status === 202 ? '' : await graphRes.text();
    if (debug) {
      console.log(`[email ${reqId}] graph response`, {
        status: graphRes.status,
        requestId: graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null,
        clientRequestId: graphRes.headers.get('client-request-id') || null,
        date: graphRes.headers.get('date') || null,
        durationMs,
        body: graphRes.status === 202 ? undefined : respText?.slice(0, 500),
      });
    }

    // Append result to ops log (always on)
    opLog.append({
      type: 'email.send.result',
      reqId,
      route: 'server:/api/sendEmail',
      status: graphRes.status,
      requestId: graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null,
      clientRequestId: graphRes.headers.get('client-request-id') || null,
      durationMs,
      from: fromEmail,
      to,
      subject,
      ccCount: ccList.length,
      bccCount: bccList.length,
    });

    if (graphRes.status === 202) {
      res.setHeader('X-Email-Request-Id', reqId);
      res.setHeader('X-Graph-Request-Id', graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || '');
      return res.status(200).send('Email sent');
    }
    res.setHeader('X-Email-Request-Id', reqId);
    res.setHeader('X-Graph-Request-Id', graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || '');
    return res.status(500).send(respText || `Unexpected status ${graphRes.status}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('server sendEmail error:', err);
    try {
      opLog.append({ type: 'email.send.error', route: 'server:/api/sendEmail', reason: 'unhandled', error: String(err?.message || err), status: 500 });
    } catch { /* ignore logging errors */ }
    return res.status(500).json({ error: err?.message || 'Failed to send email' });
  }
});

module.exports = router;
