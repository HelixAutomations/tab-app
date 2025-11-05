/* eslint-disable no-console */
const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { randomUUID } = require('crypto');
const opLog = require('../utils/opLog');

const router = express.Router();

// Key Vault setup
const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

// Secret name for CallRail API token
const CALLRAIL_TOKEN_SECRET = 'callrail-teamhub';
// CallRail Account ID from environment variable (fallback to default)
const CALLRAIL_ACCOUNT_ID = process.env.CALLRAIL_ACCOUNT_ID || '545032576';

// In-memory cache for API token
let cachedToken = { token: null, ts: 0 };

async function getCallRailToken() {
  const now = Date.now();
  // cache for 30 minutes
  if (cachedToken.token && now - cachedToken.ts < 30 * 60 * 1000) {
    return cachedToken.token;
  }
  const secret = await secretClient.getSecret(CALLRAIL_TOKEN_SECRET);
  cachedToken = { token: secret.value, ts: now };
  return secret.value;
}

// Format phone number like the Python code does
function formatPhoneNumber(phone) {
  phone = phone.replace(/\s/g, '');
  if (phone.startsWith('0')) {
    phone = '+44' + phone.substring(1);
  }
  return phone;
}

router.post('/callrailCalls', async (req, res) => {
  try {
    const reqId = randomUUID();
    const debugHeader = String(req.get('x-callrail-debug') || '').toLowerCase();
    const debugQuery = String(req.query?.debug || '').toLowerCase();
    const debug = debugHeader === '1' || debugHeader === 'true' || debugQuery === '1' || debugQuery === 'true';
    const started = Date.now();

    const body = req.body || {};
    const phoneNumber = String(body.phoneNumber || '').trim();
    const maxResults = Number(body.maxResults || 50);

    // Always write an ops log entry for observability
    opLog.append({
      type: 'callrail.search.attempt',
      reqId,
      route: 'server:/api/callrailCalls',
      phoneNumber,
      maxResults,
    });

    if (!phoneNumber) {
      if (debug) {
        console.log(`[callrail ${reqId}] invalid payload - missing phoneNumber`);
      }
      opLog.append({
        type: 'callrail.search.error',
        reqId,
        route: 'server:/api/callrailCalls',
        reason: 'missing-fields',
        status: 400,
      });
      return res.status(400).json({ error: 'Missing phoneNumber' });
    }

    if (debug) {
      console.log(`[callrail ${reqId}] searching calls`, {
        phoneNumber,
        maxResults,
      });
    }

    let apiToken;
    try {
      apiToken = await getCallRailToken();
      if (debug) console.log(`[callrail ${reqId}] token acquired`);
    } catch (e) {
      console.error(`[callrail ${reqId}] token acquisition failed`, e?.message || e);
      opLog.append({
        type: 'callrail.search.error',
        reqId,
        route: 'server:/api/callrailCalls',
        reason: 'token-failed',
        error: String(e?.message || e),
        status: 500,
      });
      return res.status(500).json({ error: 'Token acquisition failed' });
    }

    // CallRail API endpoint - search by phone number
    // Format phone number to match Python code (convert UK format to international)
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // CallRail API - search for calls using search parameter (not caller_phone_number)
    // This matches the working Python code
    const callRailUrl = `https://api.callrail.com/v3/a/${CALLRAIL_ACCOUNT_ID}/calls.json?` +
      `search=${encodeURIComponent(formattedPhone)}&` +
      `per_page=${maxResults}`;

    if (debug) {
      console.log(`[callrail ${reqId}] searching calls`, { 
        originalPhone: phoneNumber,
        formattedPhone,
        callRailUrl: callRailUrl.replace(apiToken, 'REDACTED') 
      });
    }

    const callRailRes = await fetch(callRailUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token token="${apiToken}"`,
        'Accept': 'application/json',
      },
    });

    const durationMs = Date.now() - started;
    const respText = await callRailRes.text();
    
    if (debug) {
      console.log(`[callrail ${reqId}] API response`, {
        status: callRailRes.status,
        durationMs,
        bodyPreview: respText?.slice(0, 200),
      });
    }

    // Append result to ops log
    opLog.append({
      type: 'callrail.search.result',
      reqId,
      route: 'server:/api/callrailCalls',
      status: callRailRes.status,
      durationMs,
      phoneNumber,
      maxResults,
    });

    if (callRailRes.status === 200) {
      const searchResults = JSON.parse(respText);
      const calls = searchResults.calls || [];
      
      // Transform the results for frontend consumption
      const transformedCalls = calls.map(call => ({
        id: call.id,
        duration: call.duration,
        startTime: call.start_time,
        direction: call.direction, // 'inbound' or 'outbound'
        answered: call.answered,
        customerPhoneNumber: call.customer_phone_number,
        businessPhoneNumber: call.business_phone_number,
        customerName: call.customer_name || 'Unknown Caller',
        trackingPhoneNumber: call.tracking_phone_number,
        source: call.source || 'Unknown',
        keywords: call.keywords || '',
        medium: call.medium || '',
        campaign: call.campaign || '',
        recordingUrl: call.recording || null,
        transcription: call.transcription || null,
        note: call.note || '',
        value: call.value || null,
        companyName: call.company_name || '',
      }));

      // Sort by start time (most recent first)
      transformedCalls.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      res.setHeader('X-CallRail-Request-Id', reqId);
      
      return res.status(200).json({
        success: true,
        calls: transformedCalls,
        totalCount: transformedCalls.length,
        phoneNumber,
      });
    }
    
    res.setHeader('X-CallRail-Request-Id', reqId);
    return res.status(callRailRes.status).json({ 
      error: `CallRail search failed: ${callRailRes.status}`,
      details: respText || `Unexpected status ${callRailRes.status}`
    });
  } catch (err) {
    console.error('server callrailCalls error:', err);
    try {
      opLog.append({ 
        type: 'callrail.search.error', 
        route: 'server:/api/callrailCalls', 
        reason: 'unhandled', 
        error: String(err?.message || err), 
        status: 500 
      });
    } catch { /* ignore logging errors */ }
    return res.status(500).json({ error: err?.message || 'Failed to search CallRail' });
  }
});

module.exports = router;
