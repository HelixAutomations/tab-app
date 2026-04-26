/* eslint-disable no-console */
const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');
const { sendHelixEmail } = require('../utils/helixEmail');
const { tryForwardMailboxMessage } = require('../utils/aidenMailbox');
const { appendEmailForwardActivity } = require('../utils/emailActivity');
const router = express.Router();

router.post('/forwardEmail', async (req, res) => {
  const started = Date.now();
  const requestBody = req.body || {};
  const { to, cc, subject, body, originalDate, originalFrom, messageId, feeEarnerEmail, mailboxEmail, internetMessageId, debug } = requestBody;
  let fallbackReason = null;
  try {
    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    trackEvent('ForwardEmail.Route.Started', {
      operation: 'forward',
      hasMessageId: String(!!messageId),
      hasInternetMessageId: String(!!internetMessageId),
      hasCc: String(!!cc),
    });

    // TRUE FORWARD: If we have messageId (or internetMessageId), use Graph's native forward action
    // The email must be forwarded from the mailbox where it currently exists
    if (messageId || internetMessageId) {
      // Fee earner is the point of contact – try their mailbox first, then any provided mailbox, then automations
      const sourceMailbox = feeEarnerEmail || mailboxEmail || 'automations@helix-law.com';
      
      console.log(`[forwardEmail] Attempting TRUE forward for message ${messageId || internetMessageId || 'unknown-id'} from mailbox: ${sourceMailbox}`);
      
      try {
        const graphResult = await tryForwardMailboxMessage({
          to,
          messageId,
          internetMessageId,
          preferredMailbox: sourceMailbox,
          candidateMailboxes: [feeEarnerEmail, mailboxEmail, 'automations@helix-law.com'],
          log: (message) => console.log(message),
          warn: (message) => console.warn(message),
        });

        if (graphResult.ok) {
          console.log(`[forwardEmail] ✓ TRUE forward sent successfully to ${to} from ${graphResult.sourceMailbox}${graphResult.resolvedViaInternetId ? ' (after id resolution)' : ''}`);
          trackEvent('ForwardEmail.Route.Completed', {
            operation: 'forward',
            method: 'graph-forward-action',
            mailbox: graphResult.sourceMailbox,
            resolvedViaInternetId: String(graphResult.resolvedViaInternetId),
            durationMs: String(Date.now() - started),
          });
          appendEmailForwardActivity({
            status: 'success',
            to,
            cc,
            method: 'graph-forward-action',
            sourceMailbox: graphResult.sourceMailbox,
            durationMs: Date.now() - started,
          });
          return res.status(200).json({
            success: true,
            message: 'Email forwarded successfully (true forward)',
            method: 'graph-forward-action',
            sourceMailbox: graphResult.sourceMailbox,
          });
        }

        console.warn('[forwardEmail] No resolvable message id for true forward; will fall back to pseudo-forward');
        console.log('[forwardEmail] Falling back to pseudo-forward');
        fallbackReason = graphResult.fallbackReason || 'graph-forward-failed';
        trackEvent('ForwardEmail.Route.Fallback', {
          operation: 'forward',
          reason: fallbackReason,
          mailbox: graphResult.sourceMailbox || sourceMailbox,
          durationMs: String(Date.now() - started),
          status: String(graphResult.status || ''),
        });

        if (debug) {
          return res.status(207).json({
            success: false,
            message: 'Falling back to pseudo-forward due to Graph error',
            method: 'fallback',
            debugDetails: {
              status: graphResult.status,
              errorText: graphResult.error,
              sourceMailbox: graphResult.sourceMailbox || sourceMailbox,
              attemptedId: graphResult.resolvedMessageId || null,
              internetMessageId: internetMessageId || null,
            },
          });
        }
      } catch (graphError) {
        console.error('[forwardEmail] Graph API error:', graphError.message);
        console.log('[forwardEmail] Falling back to pseudo-forward');
        fallbackReason = 'graph-exception';
        trackEvent('ForwardEmail.Route.Fallback', {
          operation: 'forward',
          reason: fallbackReason,
          durationMs: String(Date.now() - started),
          error: String(graphError?.message || graphError),
        });
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
      user_email: to,
      cc_emails: cc || undefined,
      subject,
      html: forwardedBody,
      from_email: 'automations@helix-law.com',
      saveToSentItems: true,
    };

    const sendResult = await sendHelixEmail({
      body: sendEmailPayload,
      req,
      route: 'server:/api/forwardEmail#pseudo-forward',
    });

    if (!sendResult.ok) {
      throw new Error(`SendEmail failed: ${sendResult.status} ${sendResult.error || 'Unknown error'}`);
    }

    trackEvent('ForwardEmail.Route.Completed', {
      operation: 'forward',
      method: 'pseudo-forward',
      durationMs: String(Date.now() - started),
    });
    appendEmailForwardActivity({
      status: 'success',
      to,
      cc,
      method: 'pseudo-forward',
      sourceMailbox: 'automations@helix-law.com',
      fallbackReason,
      durationMs: Date.now() - started,
    });

    return res.status(200).json({ success: true, message: 'Email forwarded successfully (pseudo-forward)', method: 'sendEmail' });
  } catch (err) {
    console.error('Forward email error:', err);
    trackException(err, {
      operation: 'forward',
      phase: 'route',
    });
    trackEvent('ForwardEmail.Route.Failed', {
      operation: 'forward',
      durationMs: String(Date.now() - started),
      error: String(err?.message || err),
    });
    appendEmailForwardActivity({
      status: 'error',
      to,
      cc,
      method: messageId || internetMessageId ? 'graph-forward-action' : 'pseudo-forward',
      sourceMailbox: feeEarnerEmail || mailboxEmail || 'automations@helix-law.com',
      fallbackReason,
      durationMs: Date.now() - started,
      error: String(err?.message || err),
    });
    return res.status(500).json({ error: err?.message || 'Failed to forward email' });
  }
});

module.exports = router;
