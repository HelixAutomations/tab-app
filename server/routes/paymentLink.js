const express = require('express');
const sql = require('mssql');
const Stripe = require('stripe');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

let cachedStripeSecretKey = null;
let cachedStripeSecretKeyAt = 0;
const STRIPE_SECRET_CACHE_MS = 5 * 60 * 1000;

async function resolveStripeSecretKey() {
  const envKey = process.env.STRIPE_SECRET_KEY || process.env.INSTRUCTIONS_SANDBOX_SK;
  if (envKey) return envKey;

  const now = Date.now();
  if (cachedStripeSecretKey && now - cachedStripeSecretKeyAt < STRIPE_SECRET_CACHE_MS) {
    return cachedStripeSecretKey;
  }

  // Prefer a dedicated key with permissions to create Prices + Payment Links.
  // The general "restricted payments" key often cannot create Payment Links.
  let kvKey;
  try {
    kvKey = await getSecret('stripe-payment-links-key');
  } catch (_e) {
    kvKey = await getSecret('stripe-restricted-payments-key');
  }
  cachedStripeSecretKey = kvKey;
  cachedStripeSecretKeyAt = now;
  return kvKey;
}

// Lazily parse and cache the instructions DB connection config from the env connection string
let dbConfig = null;
function getDbConfig() {
  if (dbConfig) return dbConfig;
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');

  const params = new URLSearchParams(connectionString.split(';').join('&'));
  const server = params.get('Server')?.replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const userId = params.get('User ID');
  const password = params.get('Password');

  dbConfig = {
    server,
    database,
    user: userId,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
  };
  return dbConfig;
}

router.post('/', async (req, res) => {
  try {
    const { instructionRef, amount, description, clientEmail, clientName } = req.body || {};

    if (!instructionRef || amount == null) {
      return res.status(400).json({ error: 'instructionRef and amount are required' });
    }
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount < 1) {
      return res.status(400).json({ error: 'Amount must be at least £1' });
    }

    let stripeSecretKey;
    try {
      stripeSecretKey = await resolveStripeSecretKey();
    } catch (_e) {
      return res.status(500).json({
        error: 'Payment service not configured',
        details: 'Missing Stripe secret key. Set STRIPE_SECRET_KEY / INSTRUCTIONS_SANDBOX_SK, or provide Key Vault secret stripe-restricted-payments-key (via KEY_VAULT_URL).',
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

    // Create a one-time price
    const price = await stripe.prices.create({
      currency: 'gbp',
      unit_amount: Math.round(numericAmount * 100),
      product_data: {
        name: description || `Payment for ${instructionRef}`,
      },
    });

    // Create the payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        instructionRef,
        source: 'helix-hub-payment-request',
        requestedAt: new Date().toISOString(),
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://helix-law.com/payment-complete?ref=${instructionRef}`,
        },
      },
    });

    // Persist to payments table
    const paymentId = `plink_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const config = getDbConfig();
    const pool = await sql.connect(config);

    try {
      await pool
        .request()
        .input('id', sql.NVarChar, paymentId)
        .input('paymentLinkId', sql.NVarChar, paymentLink.id)
        .input('amount', sql.Decimal(10, 2), numericAmount)
        .input('amountMinor', sql.Int, Math.round(numericAmount * 100))
        .input('currency', sql.NVarChar, 'GBP')
        .input('instructionRef', sql.NVarChar, instructionRef)
        .input('description', sql.NVarChar, description || `Payment request for ${instructionRef}`)
        .input('clientEmail', sql.NVarChar, clientEmail || null)
        .input('clientName', sql.NVarChar, clientName || null)
        .input('metadata', sql.NVarChar, JSON.stringify({
          source: 'helix-hub-payment-request',
          requestedAt: new Date().toISOString(),
          clientEmail,
          clientName,
        }))
        .query(`
          INSERT INTO payments (
            id, payment_intent_id, amount, amount_minor, currency,
            instruction_ref, payment_status, internal_status,
            metadata, service_description
          )
          VALUES (
            @id, @paymentLinkId, @amount, @amountMinor, @currency,
            @instructionRef, 'pending', 'pending',
            @metadata, @description
          )
        `);
    } finally {
      await pool.close();
    }

    return res.json({
      success: true,
      paymentId,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.url,
      amount: numericAmount,
      currency: 'GBP',
      instructionRef,
    });
  } catch (err) {
    console.error('Error creating payment link:', err);
    const rawMessage = err?.message ? String(err.message) : 'Unknown error';
    const needsPermissions = /does not have the required permissions for this endpoint/i.test(rawMessage);
    const details = needsPermissions
      ? `${rawMessage} (Fix: use STRIPE_SECRET_KEY or a Key Vault secret 'stripe-payment-links-key' with permissions for Prices + Payment Links.)`
      : rawMessage;
    return res.status(500).json({ error: 'Failed to create payment link', details });
  }
});

module.exports = router;
