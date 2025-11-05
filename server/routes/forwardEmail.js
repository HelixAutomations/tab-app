/* eslint-disable no-console */
const express = require('express');
const fetch = require('node-fetch');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const router = express.Router();

// Key Vault setup for Graph credentials
const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

const GRAPH_CLIENT_ID_SECRET = 'graph-aidenteams-clientid';
const GRAPH_CLIENT_SECRET_SECRET = 'aiden-email-secret-value';
const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

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

// Utilities to help resolve a Graph message id when only InternetMessageId is known
function normalizeInternetMessageId(id) {
  if (!id) return id;
  let trimmed = String(id).trim();
  if (!trimmed.startsWith('<')) trimmed = `<${trimmed}`;
  if (!trimmed.endsWith('>')) trimmed = `${trimmed}>`;
  return trimmed;
}

function escapeODataString(value) {
  // Escape single quotes for OData $filter strings
  return String(value).replace(/'/g, "''");
}

async function findMessageIdByInternetId(mailboxEmail, internetMessageId) {
  const accessToken = await getGraphToken();
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
  const id = json?.value?.[0]?.id;
  return id || null;
}

router.post('/forwardEmail', async (req, res) => {
  try {
    const { to, cc, subject, body, originalDate, originalFrom, messageId, feeEarnerEmail, mailboxEmail, internetMessageId, debug } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    // TRUE FORWARD: If we have messageId (or internetMessageId), use Graph's native forward action
    // The email must be forwarded from the mailbox where it currently exists
    if (messageId || internetMessageId) {
      // Fee earner is the point of contact – try their mailbox first, then any provided mailbox, then automations
      let sourceMailbox = feeEarnerEmail || mailboxEmail || 'automations@helix-law.com';
      
      console.log(`[forwardEmail] Attempting TRUE forward for message ${messageId || internetMessageId || 'unknown-id'} from mailbox: ${sourceMailbox}`);
      
      try {
        const accessToken = await getGraphToken();
        let resolvedMessageId = messageId || null;
        let resolvedViaInternetId = false;
        if (!resolvedMessageId && internetMessageId) {
          resolvedMessageId = await findMessageIdByInternetId(sourceMailbox, internetMessageId);
          resolvedViaInternetId = true;
          console.log(`[forwardEmail] Resolved Graph message id via internetMessageId: ${resolvedMessageId}`);
          // If not found under the provided mailbox, try a small set of alternative mailboxes we likely control
          if (!resolvedMessageId) {
            const candidates = Array.from(new Set([
              feeEarnerEmail,
              mailboxEmail,
              'automations@helix-law.com',
            ].filter(Boolean)));
            for (const candidate of candidates) {
              if (candidate === sourceMailbox) continue;
              try {
                const altId = await findMessageIdByInternetId(candidate, internetMessageId);
                if (altId) {
                  resolvedMessageId = altId;
                  sourceMailbox = candidate;
                  console.log(`[forwardEmail] Resolved via alternate mailbox ${candidate}: ${resolvedMessageId}`);
                  break;
                }
              } catch (altErr) {
                console.warn('[forwardEmail] Alternate mailbox lookup failed', candidate, altErr?.message || altErr);
              }
            }
          }
        }

        if (!resolvedMessageId) {
          console.warn('[forwardEmail] No resolvable message id for true forward; will fall back to pseudo-forward');
        } else {
          // Use Graph's native /forward endpoint (sends immediately, not as draft)
          let forwardUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sourceMailbox)}/messages/${encodeURIComponent(resolvedMessageId)}/forward`;
        
        // Build toRecipients array - Graph API requires emailAddress object format
        const toRecipients = to.split(',').map(email => ({ 
          emailAddress: { address: email.trim() } 
        }));
        
        const forwardPayload = {
          comment: '', // Optional forward comment (can be empty string)
          toRecipients,
        };
        
        console.log(`[forwardEmail] Calling Graph API: ${forwardUrl}`);
        console.log(`[forwardEmail] Recipients: ${to}`);
        
        let forwardRes = await fetch(forwardUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(forwardPayload),
        });

        if (!forwardRes.ok) {
          const status = forwardRes.status;
          const errorText = await forwardRes.text();
          console.error('[forwardEmail] Graph forward failed:', status, errorText);

          // If we attempted using a possibly wrong message id and we have an internetMessageId, try to resolve and retry once
          if (internetMessageId && status === 404) {
            try {
              // First, retry resolving within the current source mailbox
              let retryId = await findMessageIdByInternetId(sourceMailbox, internetMessageId);
              // If still not found, try alternate mailboxes (fee earner first)
              if (!retryId) {
                const candidates = Array.from(new Set([
                  feeEarnerEmail,
                  mailboxEmail,
                  'automations@helix-law.com',
                ].filter(Boolean)));
                for (const candidate of candidates) {
                  try {
                    const altId = await findMessageIdByInternetId(candidate, internetMessageId);
                    if (altId) {
                      retryId = altId;
                      sourceMailbox = candidate;
                      console.log(`[forwardEmail] Retrying with alternate mailbox ${candidate} and resolved id ${retryId}`);
                      break;
                    }
                  } catch (altErr) {
                    console.warn('[forwardEmail] Retry alternate mailbox lookup failed', candidate, altErr?.message || altErr);
                  }
                }
              }
              if (retryId) {
                forwardUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sourceMailbox)}/messages/${encodeURIComponent(retryId)}/forward`;
                forwardRes = await fetch(forwardUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(forwardPayload),
                });
              }
            } catch (resolveErr) {
              console.error('[forwardEmail] Failed resolving message by internetMessageId:', resolveErr.message);
            }
          }

          if (forwardRes && forwardRes.ok) {
            console.log(`[forwardEmail] ✓ TRUE forward sent successfully to ${to} from ${sourceMailbox} (after id resolution)`);
            return res.status(200).json({ 
              success: true, 
              message: 'Email forwarded successfully (true forward)', 
              method: 'graph-forward-action',
              sourceMailbox 
            });
          } else {
            console.log('[forwardEmail] Falling back to pseudo-forward');
            // Fall through to pseudo-forward instead of throwing
            if (debug) {
              return res.status(207).json({
                success: false,
                message: 'Falling back to pseudo-forward due to Graph error',
                method: 'fallback',
                debugDetails: { status, errorText, sourceMailbox, attemptedId: resolvedMessageId || null, internetMessageId: internetMessageId || null }
              });
            }
          }
        } else {
          console.log(`[forwardEmail] ✓ TRUE forward sent successfully to ${to} from ${sourceMailbox}`);
          return res.status(200).json({ 
            success: true, 
            message: 'Email forwarded successfully (true forward)', 
            method: 'graph-forward-action',
            sourceMailbox 
          });
        }
        // Close the 'else' block that handles the true-forward path when a resolvable message id exists
        }
      } catch (graphError) {
        console.error('[forwardEmail] Graph API error:', graphError.message);
        console.log('[forwardEmail] Falling back to pseudo-forward');
        // Fall through to pseudo-forward
      }
    }

    // PSEUDO FORWARD: Fall back to custom email for pitches or emails without message ID
    console.log(`[forwardEmail] Using PSEUDO forward (no messageId available or Graph forward failed)`);
    
    if (!body) {
      return res.status(400).json({ error: 'Missing body for pseudo-forward' });
    }

    const forwardedBody = `
      <div style="font-family: 'Raleway', Arial, sans-serif; font-size: 10pt; color: #000;">
        <div style="border-left: 3px solid #3690CE; padding-left: 12px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0; color: #64748B; font-size: 9pt;">
            <strong>---------- Forwarded message ---------</strong><br/>
            <strong>From:</strong> ${originalFrom || 'Unknown'}<br/>
            <strong>Date:</strong> ${originalDate ? new Date(originalDate).toLocaleString('en-GB', { 
              dateStyle: 'medium', 
              timeStyle: 'short' 
            }) : 'Unknown'}<br/>
            <strong>Subject:</strong> ${subject.replace('Fwd: ', '')}
          </p>
        </div>
        <div style="margin-top: 16px;">
          ${body}
        </div>
      </div>
    `;

    const sendEmailPayload = {
      to,
      cc_emails: cc || undefined,
      subject,
      html: forwardedBody,
      from_email: 'automations@helix-law.com',
      saveToSentItems: true,
    };

    const baseUrl = req.protocol + '://' + req.get('host');
    const sendEmailResponse = await fetch(`${baseUrl}/api/sendEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendEmailPayload),
    });

    if (!sendEmailResponse.ok) {
      const errorText = await sendEmailResponse.text();
      throw new Error(`SendEmail failed: ${sendEmailResponse.status} ${errorText}`);
    }

    return res.status(200).json({ success: true, message: 'Email forwarded successfully (pseudo-forward)', method: 'sendEmail' });
  } catch (err) {
    console.error('Forward email error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to forward email' });
  }
});

module.exports = router;
