/* eslint-disable no-console */
const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const fs = require('fs');
const path = require('path');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

// Key Vault setup (same as sendEmail)
const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

const GRAPH_CLIENT_ID_SECRET = 'graph-pitchbuilderemailprovider-clientid';
const GRAPH_CLIENT_SECRET_SECRET = 'graph-pitchbuilderemailprovider-clientsecret';
const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

// In-memory cache for secrets and tokens
let cachedSecrets = { id: null, secret: null, ts: 0 };
let cachedToken = { token: null, exp: 0 };

async function getGraphSecrets() {
  const now = Date.now();
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

/**
 * POST /api/create-draft
 *
 * Creates a real Outlook draft in the fee earner's mailbox via Graph API.
 * The FE can then review, edit, and send from Outlook natively.
 *
 * Body: { mailbox_email, subject, body_html, to_email, cc_emails?, bcc_emails?, signature_initials? }
 */
router.post('/create-draft', async (req, res) => {
  const startMs = Date.now();
  const { mailbox_email, subject, body_html, to_email, cc_emails, bcc_emails, signature_initials } = req.body;

  if (!mailbox_email || !subject || !body_html) {
    return res.status(400).json({ error: 'mailbox_email, subject, and body_html are required' });
  }

  trackEvent('PitchComposer.Draft.Started', {
    mailbox: mailbox_email,
    to: to_email || '(none)',
    hasCC: String(!!cc_emails),
  });

  try {
    const token = await getGraphToken();

    // Build toRecipients array
    const toRecipients = to_email
      ? normalizeEmails(to_email).map(addr => ({ emailAddress: { address: addr } }))
      : [];

    const ccRecipients = cc_emails
      ? normalizeEmails(cc_emails).map(addr => ({ emailAddress: { address: addr } }))
      : [];

    const bccRecipients = bcc_emails
      ? normalizeEmails(bcc_emails).map(addr => ({ emailAddress: { address: addr } }))
      : [];

    // Apply personal signature (or system fallback)
    const finalHtml = applySignature(body_html, {
      signatureInitials: signature_initials || '',
      fromEmail: mailbox_email,
    });

    // POST /users/{email}/messages creates a draft (does NOT send)
    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox_email)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          body: { contentType: 'HTML', content: finalHtml },
          toRecipients,
          ccRecipients,
          bccRecipients,
          isDraft: true,
        }),
      },
    );

    if (!graphRes.ok) {
      const errBody = await graphRes.text();
      console.error('[createDraft] Graph API error:', graphRes.status, errBody);
      trackEvent('PitchComposer.Draft.Failed', {
        mailbox: mailbox_email,
        httpStatus: String(graphRes.status),
        error: errBody.slice(0, 500),
      });
      return res.status(graphRes.status).json({
        error: 'Failed to create draft in Outlook',
        details: errBody,
      });
    }

    const draft = await graphRes.json();
    const durationMs = Date.now() - startMs;

    trackEvent('PitchComposer.Draft.Completed', {
      mailbox: mailbox_email,
      to: to_email || '(none)',
      draftId: draft.id,
      durationMs: String(durationMs),
    });

    console.log(`[createDraft] Draft created in ${mailbox_email} drafts (${durationMs}ms)`);
    return res.json({ success: true, draftId: draft.id });

  } catch (err) {
    const durationMs = Date.now() - startMs;
    console.error('[createDraft] Error:', err);
    trackException(err, { operation: 'createDraft', mailbox: mailbox_email, durationMs: String(durationMs) });
    trackEvent('PitchComposer.Draft.Failed', {
      mailbox: mailbox_email,
      error: err.message,
      durationMs: String(durationMs),
    });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Normalize emails (same logic as sendEmail.js)
function normalizeEmails(emails) {
  if (!emails) return [];
  const raw = Array.isArray(emails) ? emails : [emails];
  const splitRegex = /[,;]+/;
  return raw
    .flatMap(e => (typeof e === 'string' ? e.split(splitRegex) : []))
    .map(e => (e || '').trim())
    .filter(e => e.length > 0);
}

// ── Signature helpers (mirrored from sendEmail.js) ─────────────────────────

function safeReadTextFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
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
  for (const dir of candidates) {
    if (!dir) continue;
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir; } catch { /* ignore */ }
  }
  return null;
}

function sanitizeSignatureHtml(html) {
  let h = String(html || '').trim();
  if (!h) return h;
  h = h.replace(/^\uFEFF/, '');
  const firstTag = h.indexOf('<');
  if (firstTag > 0) h = h.slice(firstTag);
  h = h
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<html\b[^>]*>/gi, '').replace(/<\/html>/gi, '')
    .replace(/<body\b[^>]*>/gi, '').replace(/<\/body>/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if[\s\S]*?\]>/gi, '')
    .replace(/<!\[endif\]>/gi, '')
    .replace(/<!--(?!\s*\[if)[\s\S]*?-->/gi, '');
  return h;
}

function pickSignatureFileFromDir(dirPath, fromEmail) {
  let files;
  try { files = fs.readdirSync(dirPath); } catch { return null; }
  const htmlFiles = files.filter(f => /\.html?$/i.test(f));
  if (htmlFiles.length === 0) return null;
  const from = String(fromEmail || '').trim().toLowerCase();
  if (from) {
    const preferred = htmlFiles.find(f => f.toLowerCase().includes(`(${from})`));
    if (preferred) return preferred;
  }
  return htmlFiles[0];
}

function loadPersonalSignatureHtml({ signatureInitials, fromEmail }) {
  const root = getSignaturesRootDir();
  if (!root) return null;
  const initials = String(signatureInitials || '').trim().toUpperCase();
  const fromLocal = String(fromEmail || '').split('@')[0]?.trim().toUpperCase() || '';
  const candidates = [initials, fromLocal].filter(Boolean);
  const tried = new Set();
  for (const folderName of candidates) {
    if (tried.has(folderName)) continue;
    tried.add(folderName);
    const folderPath = path.join(root, folderName);
    if (!fs.existsSync(folderPath)) continue;
    const picked = pickSignatureFileFromDir(folderPath, fromEmail);
    if (!picked) continue;
    const html = safeReadTextFile(path.join(folderPath, picked));
    if (html && html.trim()) return sanitizeSignatureHtml(html);
  }
  return null;
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

function applySignature(bodyHtml, { signatureInitials, fromEmail }) {
  const sigHtml = loadPersonalSignatureHtml({ signatureInitials, fromEmail });
  if (sigHtml && sigHtml.trim()) {
    return `${String(bodyHtml || '').trim()}<br />${sigHtml}`;
  }
  // Fallback: system signature
  return wrapSystemSignature(bodyHtml);
}

module.exports = router;
