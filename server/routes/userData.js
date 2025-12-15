const express = require('express');
const { withRequest } = require('../utils/db');

const router = express.Router();

/**
 * Get user data by Entra ID (Azure AD Object ID)
 * 
 * POST /api/user-data
 * Body: { userObjectId: string }
 * 
 * Returns: Array of user records matching the Entra ID
 * 
 * This route replaces the direct Azure Function call to getUserData
 * Benefits:
 * - Centralized error handling and logging
 * - Connection pooling and retry logic
 * - Consistent CORS and timeout handling
 * - Better monitoring and debugging
 */
router.post('/', async (req, res) => {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    console.error('❌ [userData] SQL_CONNECTION_STRING not configured');
    return res.status(500).json({ error: 'Database configuration missing' });
  }

  const { userObjectId } = req.body;

  // Validate required parameter
  if (!userObjectId || typeof userObjectId !== 'string') {
    console.warn('[userData] Missing or invalid userObjectId in request body');
    return res.status(400).json({ 
      error: 'Missing userObjectId in request body',
      details: 'userObjectId must be a non-empty string'
    });
  }

  try {
    const startTime = Date.now();
    
  const rows = await withRequest(connectionString, async (request) => {
      // Query team table for user matching Entra ID
      // Using parameterized query to prevent SQL injection
      const result = await request
        .input('userObjectId', userObjectId)
        .query(`
          SELECT 
            [Created Date],
            [Created Time],
            [Full Name],
            [Last],
            [First],
            [Nickname],
            [Initials],
            [Email],
            [Entra ID],
            [Clio ID],
            [Rate],
            [Role],
            [AOW],
            [holiday_entitlement],
            [status],
            [ASANAClient_ID],
            [ASANASecret],
            [ASANARefreshToken]
          FROM [dbo].[team]
          WHERE [Entra ID] = @userObjectId
        `);
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2); // 2 retries for transient errors

    const duration = Date.now() - startTime;
    
    if (rows.length === 0) {
      console.warn(`[userData] No user found for Entra ID: ${userObjectId} (${duration}ms)`);
      // Return empty array instead of error - allows graceful degradation
      return res.json([]);
    }

    // Normalize legacy spaced keys and add snake_case aliases while preserving originals
    const normalized = rows.map((u) => {
      const entraId = u?.['Entra ID'] ?? u?.EntraID ?? null;
      const fullName = u?.['Full Name'] ?? u?.FullName ?? null;
      const clioId = u?.['Clio ID'] ?? u?.ClioID ?? null;
      return {
        ...u,
        // Preferred aliases for client code
        EntraID: u?.EntraID ?? entraId,
        FullName: u?.FullName ?? fullName,
        // New schema snake_case fields for future consumers
        entra_id: entraId,
        full_name: fullName,
        clio_id: clioId,
        initials: u?.Initials ?? u?.initials ?? null,
        email: u?.Email ?? u?.email ?? null,
        role: u?.Role ?? u?.role ?? null,
        aow: u?.AOW ?? u?.aow ?? null,
        holiday_entitlement: u?.holiday_entitlement ?? u?.['holiday_entitlement'] ?? null,
        status: u?.status ?? u?.Status ?? null,
        // Asana credentials - preserve all possible field name variations
        ASANAClientID: u?.ASANAClient_ID ?? null, // Map from actual DB column
        ASANAClient_ID: u?.ASANAClient_ID ?? null,
        ASANASecret: u?.ASANASecret ?? null,
        ASANA_Secret: u?.ASANASecret ?? null, // Map from actual DB column  
        ASANARefreshToken: u?.ASANARefreshToken ?? null,
        ASANARefresh_Token: u?.ASANARefreshToken ?? null, // Map from actual DB column
      };
    });

    return res.json(normalized);

  } catch (error) {
    const duration = Date.now();
    console.error(`[userData] Database error after ${duration}ms:`, {
      message: error.message,
      code: error.code,
      userObjectId: userObjectId.substring(0, 8) + '...' // Log partial ID for privacy
    });

    // Return appropriate error based on error type
    if (error.message?.includes('queue timeout') || error.message?.includes('Database busy')) {
      return res.status(503).json({ 
        error: 'Database temporarily unavailable',
        details: 'Please try again in a moment'
      });
    }

    if (error.code === 'ETIMEOUT' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        error: 'Database request timeout',
        details: 'The request took too long to complete'
      });
    }

    // Generic error for unexpected issues
    return res.status(500).json({ 
      error: 'Failed to retrieve user data',
      details: 'An unexpected error occurred'
    });
  }
});

module.exports = router;
