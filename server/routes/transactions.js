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
    // Generate cache key based on current date (transactions can be added throughout the day)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'transactions', today);

    const transactions = await cacheWrapper(
      cacheKey,
      async () => {
        const result = await withRequest(connectionString, async (request) => {
          const query = `
            SELECT *
            FROM transactions
            ORDER BY transaction_date DESC
          `;
          return await request.query(query);
        });

        return result.recordset;
      },
      1800 // 30 minutes TTL - transactions can be added during the day but not frequently
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
