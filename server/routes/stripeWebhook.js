const express = require('express');
const Stripe = require('stripe');
const sql = require('mssql');
const { getSecret } = require('../utils/getSecret');
const { getPool } = require('../utils/db');

const router = express.Router();

let cachedStripeWebhookSecret = null;
let cachedStripeWebhookSecretAt = 0;
const STRIPE_WEBHOOK_SECRET_CACHE_MS = 5 * 60 * 1000;

async function resolveStripeWebhookSecret() {
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.INSTRUCTIONS_SANDBOX_SS;
  if (envSecret) return envSecret;

  const now = Date.now();
  if (cachedStripeWebhookSecret && now - cachedStripeWebhookSecretAt < STRIPE_WEBHOOK_SECRET_CACHE_MS) {
    return cachedStripeWebhookSecret;
  }

  // Prefer a dedicated secret for Helix Hub webhooks.
  const kvSecret = await getSecret('stripe-webhook-secret');
  cachedStripeWebhookSecret = kvSecret;
  cachedStripeWebhookSecretAt = now;
  return kvSecret;
}

async function resolveStripeApiKey() {
  const envKey = process.env.STRIPE_SECRET_KEY || process.env.INSTRUCTIONS_SANDBOX_SK;
  if (!envKey) {
    throw new Error('Stripe secret key not configured (STRIPE_SECRET_KEY / INSTRUCTIONS_SANDBOX_SK)');
  }
  return envKey;
}

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalisePaymentLinkId(maybePaymentLink) {
  if (!maybePaymentLink) return null;
  if (typeof maybePaymentLink === 'string') return maybePaymentLink;
  if (typeof maybePaymentLink === 'object' && typeof maybePaymentLink.id === 'string') return maybePaymentLink.id;
  return null;
}

async function updatePaymentByPaymentLinkId({
  paymentLinkId,
  paymentStatus,
  internalStatus,
  stripeEvent,
  stripeCheckoutSession,
}) {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');

  const pool = await getPool(connStr);

  // Pull latest matching payment so we can merge JSON fields safely.
  const existing = await pool
    .request()
    .input('paymentLinkId', sql.NVarChar, paymentLinkId)
    .query(`
      SELECT TOP 1
        id,
        metadata,
        webhook_events
      FROM Payments
      WHERE payment_intent_id = @paymentLinkId
      ORDER BY created_at DESC
    `);

  if (!existing.recordset || existing.recordset.length === 0) {
    return { found: false };
  }

  const row = existing.recordset[0];
  const currentMetadata = safeJsonParse(row.metadata, {});
  const currentEvents = safeJsonParse(row.webhook_events, []);

  const nextMetadata = {
    ...currentMetadata,
    stripe: {
      ...(currentMetadata && typeof currentMetadata.stripe === 'object' ? currentMetadata.stripe : null),
      lastEventId: stripeEvent?.id,
      lastEventType: stripeEvent?.type,
      lastEventCreated: stripeEvent?.created,
      checkoutSessionId: stripeCheckoutSession?.id,
      paymentIntentId: stripeCheckoutSession?.payment_intent,
      paymentLinkId,
      paymentStatus: stripeCheckoutSession?.payment_status,
    },
  };

  const nextEvents = Array.isArray(currentEvents)
    ? currentEvents.concat([
        {
          id: stripeEvent?.id,
          type: stripeEvent?.type,
          created: stripeEvent?.created,
        },
      ])
    : [
        {
          id: stripeEvent?.id,
          type: stripeEvent?.type,
          created: stripeEvent?.created,
        },
      ];

  await pool
    .request()
    .input('paymentId', sql.NVarChar, row.id)
    .input('paymentStatus', sql.NVarChar, paymentStatus)
    .input('internalStatus', sql.NVarChar, internalStatus)
    .input('metadata', sql.NVarChar, JSON.stringify(nextMetadata))
    .input('webhookEvents', sql.NVarChar, JSON.stringify(nextEvents))
    .query(`
      UPDATE Payments
      SET
        payment_status = @paymentStatus,
        internal_status = @internalStatus,
        metadata = @metadata,
        webhook_events = @webhookEvents,
        updated_at = GETDATE()
      WHERE id = @paymentId
    `);

  return { found: true, paymentId: row.id };
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    let webhookSecret;
    try {
      webhookSecret = await resolveStripeWebhookSecret();
    } catch (_e) {
      return res.status(500).json({
        error: 'Webhook secret not configured',
        details: 'Set STRIPE_WEBHOOK_SECRET / INSTRUCTIONS_SANDBOX_SS, or provide Key Vault secret stripe-webhook-secret (via KEY_VAULT_URL).',
      });
    }

    const stripe = new Stripe(await resolveStripeApiKey(), { apiVersion: '2024-12-18.acacia' });

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid webhook signature', details: err?.message || 'Signature verification failed' });
    }

    // Only handle the event types we care about; return 200 for others so Stripe stops retrying.
    if (!event || !event.type) {
      return res.status(400).json({ error: 'Invalid event payload' });
    }

    if (event.type.startsWith('checkout.session.')) {
      const session = event.data?.object;
      const paymentLinkId = normalisePaymentLinkId(session?.payment_link);

      if (!paymentLinkId) {
        return res.status(200).json({ received: true, ignored: true, reason: 'No payment_link on session' });
      }

      // Stripe uses payment_status like "paid" / "unpaid" on Checkout Sessions.
      // Map into our DB statuses used by Helix Hub UI.
      let paymentStatus = 'processing';
      let internalStatus = 'pending';

      if (event.type === 'checkout.session.completed') {
        if (session?.payment_status === 'paid') {
          paymentStatus = 'succeeded';
          internalStatus = 'completed';
        } else {
          paymentStatus = 'processing';
          internalStatus = 'pending';
        }
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        paymentStatus = 'succeeded';
        internalStatus = 'completed';
      } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
        paymentStatus = 'failed';
        internalStatus = 'failed';
      }

      const result = await updatePaymentByPaymentLinkId({
        paymentLinkId,
        paymentStatus,
        internalStatus,
        stripeEvent: event,
        stripeCheckoutSession: session,
      });

      return res.status(200).json({ received: true, updated: result.found, paymentId: result.paymentId || null });
    }

    return res.status(200).json({ received: true, ignored: true, type: event.type });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return res.status(500).json({ error: 'Webhook handler failed', details: err?.message ? String(err.message) : 'Unknown error' });
  }
});

module.exports = router;
