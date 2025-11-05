/* eslint-disable no-console */
const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { randomUUID } = require('crypto');
const opLog = require('../utils/opLog');

const router = express.Router();

// Key Vault setup (reuse same vault as the rest of the server)
const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

// Secret names for Graph client credentials
const GRAPH_CLIENT_ID_SECRET = 'graph-aidenteams-clientid';
const GRAPH_CLIENT_SECRET_SECRET = 'aiden-email-secret-value';
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

router.post('/searchInbox', async (req, res) => {
  try {
    const reqId = randomUUID();
    const debugHeader = String(req.get('x-inbox-debug') || '').toLowerCase();
    const debugQuery = String(req.query?.debug || '').toLowerCase();
    const debug = debugHeader === '1' || debugHeader === 'true' || debugQuery === '1' || debugQuery === 'true';
    const started = Date.now();

    const body = req.body || {};
    const feeEarnerEmail = String(body.feeEarnerEmail || '').trim();
    const prospectEmail = String(body.prospectEmail || '').trim();
    const maxResults = Number(body.maxResults || 50);

    // Always write an ops log entry for observability
    opLog.append({
      type: 'inbox.search.attempt',
      reqId,
      route: 'server:/api/searchInbox',
      feeEarnerEmail,
      prospectEmail,
      maxResults,
    });

    if (!feeEarnerEmail || !prospectEmail) {
      if (debug) {
        console.log(`[inbox ${reqId}] invalid payload`, {
          hasFeeEarnerEmail: !!feeEarnerEmail,
          hasProspectEmail: !!prospectEmail,
          keys: Object.keys(body || {}),
        });
      }
      opLog.append({
        type: 'inbox.search.error',
        reqId,
        route: 'server:/api/searchInbox',
        reason: 'missing-fields',
        details: { hasFeeEarnerEmail: !!feeEarnerEmail, hasProspectEmail: !!prospectEmail },
        status: 400,
      });
      return res.status(400).json({ error: 'Missing feeEarnerEmail or prospectEmail' });
    }

    if (debug) {
      console.log(`[inbox ${reqId}] searching`, {
        feeEarnerEmail,
        prospectEmail,
        maxResults,
      });
    }

    let accessToken;
    try {
      accessToken = await getGraphToken();
      if (debug) console.log(`[inbox ${reqId}] token acquired`);
    } catch (e) {
      console.error(`[inbox ${reqId}] token acquisition failed`, e?.message || e);
      opLog.append({
        type: 'inbox.search.error',
        reqId,
        route: 'server:/api/searchInbox',
        reason: 'token-failed',
        error: String(e?.message || e),
        status: 500,
      });
      return res.status(500).json({ error: 'Token acquisition failed' });
    }

    // Search for emails to/from the prospect email
    const searchQuery = `(from:${prospectEmail} OR to:${prospectEmail})`;
    const searchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(feeEarnerEmail)}/messages?` +
      `$search="${encodeURIComponent(searchQuery)}"&` +
      `$top=${maxResults}&` +
      `$select=id,subject,receivedDateTime,from,toRecipients,ccRecipients,bodyPreview,hasAttachments,importance,internetMessageId`;

    if (debug) {
      console.log(`[inbox ${reqId}] searching inbox`, { searchUrl });
    }

    const graphRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'client-request-id': reqId,
        'return-client-request-id': 'true',
      },
    });

    const durationMs = Date.now() - started;
    const respText = await graphRes.text();
    
    if (debug) {
      console.log(`[inbox ${reqId}] graph response`, {
        status: graphRes.status,
        requestId: graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null,
        clientRequestId: graphRes.headers.get('client-request-id') || null,
        durationMs,
        bodyPreview: respText?.slice(0, 200),
      });
    }

    // Append result to ops log
    opLog.append({
      type: 'inbox.search.result',
      reqId,
      route: 'server:/api/searchInbox',
      status: graphRes.status,
      requestId: graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || null,
      clientRequestId: graphRes.headers.get('client-request-id') || null,
      durationMs,
      feeEarnerEmail,
      prospectEmail,
      maxResults,
    });

    if (graphRes.status === 200) {
      const searchResults = JSON.parse(respText);
      const emails = searchResults.value || [];
      
      // Transform the results for frontend consumption
      const transformedEmails = emails.map(email => ({
        id: email.id,
        subject: email.subject || '(No Subject)',
        receivedDateTime: email.receivedDateTime,
        from: email.from?.emailAddress?.address || 'Unknown',
        fromName: email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown',
        bodyPreview: email.bodyPreview || '',
        hasAttachments: email.hasAttachments || false,
        importance: email.importance || 'normal',
        toRecipients: (email.toRecipients || []).map(r => r.emailAddress?.address).filter(Boolean),
        ccRecipients: (email.ccRecipients || []).map(r => r.emailAddress?.address).filter(Boolean),
        internetMessageId: email.internetMessageId || null,
      }));

      // Sort by date since we can't use $orderby with $search
      transformedEmails.sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());

      res.setHeader('X-Inbox-Request-Id', reqId);
      res.setHeader('X-Graph-Request-Id', graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || '');
      
      return res.status(200).json({
        success: true,
        emails: transformedEmails,
        totalCount: transformedEmails.length,
        searchQuery,
        feeEarnerEmail,
        prospectEmail,
      });
    }
    
    res.setHeader('X-Inbox-Request-Id', reqId);
    res.setHeader('X-Graph-Request-Id', graphRes.headers.get('request-id') || graphRes.headers.get('x-ms-request-id') || '');
    return res.status(graphRes.status).json({ 
      error: `Search failed: ${graphRes.status}`,
      details: respText || `Unexpected status ${graphRes.status}`
    });
  } catch (err) {
    console.error('server searchInbox error:', err);
    try {
      opLog.append({ 
        type: 'inbox.search.error', 
        route: 'server:/api/searchInbox', 
        reason: 'unhandled', 
        error: String(err?.message || err), 
        status: 500 
      });
    } catch { /* ignore logging errors */ }
    return res.status(500).json({ error: err?.message || 'Failed to search inbox' });
  }
});

module.exports = router;