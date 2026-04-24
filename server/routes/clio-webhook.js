// Clio webhook bridge — Phase A
// Receives outbound webhook notifications from Clio and re-broadcasts them
// onto the existing matters SSE stream so Hub clients see external Clio
// edits within ~2 s instead of waiting for the next polled refresh.
//
// See docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md for the full brief.
//
// Mounting order: this router MUST be registered BEFORE express.json() in
// server/index.js because the signature is computed over the raw request
// body. See the stripeWebhook precedent.

const express = require('express');
const crypto = require('crypto');
const { broadcastMattersChanged } = require('../utils/matters-stream');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

const WEBHOOK_SECRET = process.env.CLIO_WEBHOOK_SECRET || '';

function verifySignature(rawBody, headerSig) {
    if (!WEBHOOK_SECRET) {
        // Dev escape: never deploy without setting the secret. Logged once on startup.
        return true;
    }
    if (!headerSig || typeof headerSig !== 'string') return false;
    try {
        const expected = 'sha256=' + crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');
        const sigBuf = Buffer.from(headerSig);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
        return false;
    }
}

// POST /api/clio/webhook
router.post(
    '/',
    express.raw({ type: 'application/json', limit: '256kb' }),
    (req, res) => {
        try {
            const rawBody = req.body instanceof Buffer ? req.body : Buffer.from('');
            const headerSig = req.header('X-Hub-Signature-256') || req.header('x-hub-signature-256') || '';

            if (!verifySignature(rawBody, headerSig)) {
                trackEvent('Clio.Webhook.SignatureInvalid', {
                    hasSecret: WEBHOOK_SECRET ? 'true' : 'false',
                    hasHeader: headerSig ? 'true' : 'false',
                });
                return res.status(401).send('invalid signature');
            }

            let payload = null;
            try {
                payload = rawBody.length > 0 ? JSON.parse(rawBody.toString('utf8')) : null;
            } catch (parseErr) {
                trackEvent('Clio.Webhook.ParseFailed', { error: parseErr.message });
                return res.status(400).send('invalid json');
            }

            const event = payload?.event || payload?.action || 'unknown';
            const objectType = payload?.object_type || payload?.objectType || 'unknown';
            const objectIdRaw = payload?.object_id ?? payload?.objectId ?? payload?.id;
            const objectId = objectIdRaw !== undefined && objectIdRaw !== null ? String(objectIdRaw) : '';

            trackEvent('Clio.Webhook.Received', {
                event,
                objectType,
                objectId,
            });

            if (objectType === 'Matter') {
                broadcastMattersChanged({
                    source: 'clio-webhook',
                    event,
                    clioMatterId: objectId,
                    triggeredBy: 'Clio',
                });
            }
            // Phase B will add Contact → enquiries / instructions broadcast here.

            return res.status(204).end();
        } catch (err) {
            trackException(err, { phase: 'clio-webhook-handler' });
            trackEvent('Clio.Webhook.Failed', { error: err.message });
            return res.status(500).send('handler error');
        }
    }
);

if (!WEBHOOK_SECRET) {
    // Loud at startup so misconfigured prod is obvious. Use console for dev visibility.
    // eslint-disable-next-line no-console
    console.warn('[clio-webhook] CLIO_WEBHOOK_SECRET not set — signature verification disabled (dev mode only).');
}

module.exports = router;
