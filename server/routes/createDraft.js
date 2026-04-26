/* eslint-disable no-console */
const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');
const { createHelixDraft } = require('../utils/helixEmail');

const router = express.Router();

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
    const result = await createHelixDraft({
      body: {
        mailbox_email,
        subject,
        body_html,
        to_email,
        cc_emails,
        bcc_emails,
        signature_initials,
      },
    });

    if (!result.ok) {
      console.error('[createDraft] Graph API error:', result.status, result.error);
      trackEvent('PitchComposer.Draft.Failed', {
        mailbox: mailbox_email,
        httpStatus: String(result.status),
        error: String(result.error || '').slice(0, 500),
      });
      return res.status(result.status).json({
        error: 'Failed to create draft in Outlook',
        details: result.error,
      });
    }

    const durationMs = result.durationMs || (Date.now() - startMs);

    trackEvent('PitchComposer.Draft.Completed', {
      mailbox: mailbox_email,
      to: to_email || '(none)',
      draftId: result.draftId,
      durationMs: String(durationMs),
    });

    console.log(`[createDraft] Draft created in ${mailbox_email} drafts (${durationMs}ms)`);
    return res.json({ success: true, draftId: result.draftId });

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

module.exports = router;
