/* eslint-disable no-console */
const express = require('express');
const { randomUUID } = require('crypto');
const opLog = require('../utils/opLog');
const { trackEvent, trackException } = require('../utils/appInsights');
const { getAidenGraphAccessToken, searchMailboxMessages } = require('../utils/aidenMailbox');
const { appendInboxSearchActivity } = require('../utils/emailActivity');

const router = express.Router();

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
    trackEvent('Inbox.Search.Started', {
      operation: 'search',
      feeEarnerEmail,
      prospectEmail,
      maxResults: String(maxResults),
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
      accessToken = await getAidenGraphAccessToken();
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
      trackException(e, {
        operation: 'search',
        phase: 'token',
      });
      trackEvent('Inbox.Search.Failed', {
        operation: 'search',
        reason: 'token-failed',
        durationMs: String(Date.now() - started),
      });
      appendInboxSearchActivity({
        status: 'error',
        feeEarnerEmail,
        prospectEmail,
        durationMs: Date.now() - started,
        error: 'Token acquisition failed',
      });
      return res.status(500).json({ error: 'Token acquisition failed' });
    }

    const mailboxSearch = await searchMailboxMessages({
      mailboxEmail: feeEarnerEmail,
      correspondentEmail: prospectEmail,
      maxResults,
      reqId,
      accessToken,
    });

    if (debug) {
      console.log(`[inbox ${reqId}] searching inbox`, { searchUrl: mailboxSearch.searchUrl });
    }

    const durationMs = Date.now() - started;
    const respText = mailboxSearch.responseText;
    
    if (debug) {
      console.log(`[inbox ${reqId}] graph response`, {
        status: mailboxSearch.status,
        requestId: mailboxSearch.graphRequestId,
        clientRequestId: mailboxSearch.clientRequestId,
        durationMs,
        bodyPreview: respText?.slice(0, 200),
      });
    }

    if (mailboxSearch.status === 200) {
      const transformedEmails = mailboxSearch.emails;

      if (debug) {
        try {
          const sample = transformedEmails.slice(0, 3).map(e => ({
            id: e.id,
            previewLen: (e.bodyPreview || '').length,
            htmlLen: (e.bodyHtml || '').length,
            textLen: (e.bodyText || '').length,
          }));
          console.log(`[inbox ${reqId}] body length sample`, sample);
        } catch { /* ignore debug logging failures */ }
      }

      opLog.append({
        type: 'inbox.search.result',
        reqId,
        route: 'server:/api/searchInbox',
        status: mailboxSearch.status,
        requestId: mailboxSearch.graphRequestId,
        clientRequestId: mailboxSearch.clientRequestId,
        durationMs,
        feeEarnerEmail,
        prospectEmail,
        maxResults,
        resultCount: transformedEmails.length,
      });

      res.setHeader('X-Inbox-Request-Id', reqId);
      res.setHeader('X-Graph-Request-Id', mailboxSearch.graphRequestId || '');
      trackEvent('Inbox.Search.Completed', {
        operation: 'search',
        durationMs: String(durationMs),
        resultCount: String(transformedEmails.length),
        feeEarnerEmail,
      });
      appendInboxSearchActivity({
        status: 'info',
        feeEarnerEmail,
        prospectEmail,
        resultCount: transformedEmails.length,
        durationMs,
      });
      
      return res.status(200).json({
        success: true,
        emails: transformedEmails,
        totalCount: transformedEmails.length,
        searchQuery: mailboxSearch.searchQuery,
        feeEarnerEmail,
        prospectEmail,
      });
    }
    
    opLog.append({
      type: 'inbox.search.result',
      reqId,
      route: 'server:/api/searchInbox',
      status: mailboxSearch.status,
      requestId: mailboxSearch.graphRequestId,
      clientRequestId: mailboxSearch.clientRequestId,
      durationMs,
      feeEarnerEmail,
      prospectEmail,
      maxResults,
    });
    res.setHeader('X-Inbox-Request-Id', reqId);
    res.setHeader('X-Graph-Request-Id', mailboxSearch.graphRequestId || '');
    trackEvent('Inbox.Search.Failed', {
      operation: 'search',
      durationMs: String(durationMs),
      status: String(mailboxSearch.status),
      feeEarnerEmail,
    });
    appendInboxSearchActivity({
      status: 'error',
      feeEarnerEmail,
      prospectEmail,
      durationMs,
      error: `Graph search failed (${mailboxSearch.status})`,
    });
    return res.status(mailboxSearch.status).json({ 
      error: `Search failed: ${mailboxSearch.status}`,
      details: respText || `Unexpected status ${mailboxSearch.status}`
    });
  } catch (err) {
    console.error('server searchInbox error:', err);
    trackException(err, {
      operation: 'search',
      phase: 'route',
    });
    trackEvent('Inbox.Search.Failed', {
      operation: 'search',
      reason: 'unhandled',
      error: String(err?.message || err),
    });
    appendInboxSearchActivity({
      status: 'error',
      feeEarnerEmail: req?.body?.feeEarnerEmail,
      prospectEmail: req?.body?.prospectEmail,
      error: String(err?.message || err),
    });
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