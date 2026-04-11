const express = require('express');
const { withRequest } = require('../utils/db');
const { cacheWrapper, generateCacheKey } = require('../utils/redisClient');
const router = express.Router();

/**
 * GET /api/transactions
 * Fetch all transactions from helix-core-data database
 * Migrated from Azure Function to fix cold start issues with connection pooling
 */
router.get('/', async (req, res) => {
  const connectionString = process.env.SQL_CONNECTION_STRING;

  if (!connectionString) {
    console.error('[Transactions Route] SQL_CONNECTION_STRING environment variable is not set');
    return res.status(500).json({ error: 'Database configuration error' });
  }

  try {
    // Range param: 'all' returns full table, default scoped to 90 days for Home perf
    const range = req.query.range || '90d';

    // Generate cache key based on current date + range
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'transactions', today, range);

    const transactions = await cacheWrapper(
      cacheKey,
      async () => {
        const result = await withRequest(connectionString, async (request) => {
          const dateFilter = range === 'all'
            ? ''
            : `WHERE transaction_date >= DATEADD(day, -90, GETDATE())`;
          const query = `
            SELECT id, transaction_date, description, amount, type, status,
                   matter_id, contact_name, payment_method, reference, created_at
            FROM transactions
            ${dateFilter}
            ORDER BY transaction_date DESC
          `;
          return await request.query(query);
        });

        return result.recordset;
      },
      1800 // 30 minutes TTL
    );

    // Return the transactions
    res.json(transactions);
  } catch (error) {
    console.error('[Transactions Route] Error fetching transactions:', error.message || error);
    // Don't leak error details to browser
    res.status(500).json({ 
      error: 'Failed to fetch transactions'
    });
  }
});

module.exports = router;
