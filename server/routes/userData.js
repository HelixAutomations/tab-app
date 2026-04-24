const express = require('express');
const { withRequest } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRows(rows) {
  return rows.map((u) => {
    const entraId = u?.['Entra ID'] ?? u?.EntraID ?? null;
    const fullName = u?.['Full Name'] ?? u?.FullName ?? null;
    const clioId = u?.['Clio ID'] ?? u?.ClioID ?? null;
    return {
      ...u,
      EntraID: u?.EntraID ?? entraId,
      FullName: u?.FullName ?? fullName,
      entra_id: entraId,
      full_name: fullName,
      clio_id: clioId,
      initials: u?.Initials ?? u?.initials ?? null,
      email: u?.Email ?? u?.email ?? null,
      role: u?.Role ?? u?.role ?? null,
      aow: u?.AOW ?? u?.aow ?? null,
      holiday_entitlement: u?.holiday_entitlement ?? u?.['holiday_entitlement'] ?? null,
      status: u?.status ?? u?.Status ?? null,
      ASANAClientID: u?.ASANAClient_ID ?? null,
      ASANAClient_ID: u?.ASANAClient_ID ?? null,
      ASANASecret: u?.ASANASecret ?? null,
      ASANA_Secret: u?.ASANASecret ?? null,
      ASANARefreshToken: u?.ASANARefreshToken ?? null,
      ASANARefresh_Token: u?.ASANARefreshToken ?? null,
    };
  });
}

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

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const requestUser = req.user && typeof req.user === 'object' ? req.user : null;
  const userObjectId = asString(body.userObjectId) || asString(requestUser?.entraId);
  const email = (asString(body.email) || asString(requestUser?.email)).toLowerCase();
  const initials = (asString(body.initials) || asString(requestUser?.initials)).toUpperCase();
  const lookupMode = userObjectId ? 'entra-id' : 'email-or-initials';

  // Validate required parameter
  if (!userObjectId && !email && !initials) {
    console.warn('[userData] Missing lookup fields in request body');
    return res.status(400).json({ 
      error: 'Missing lookup fields in request body',
      details: 'Provide userObjectId, email, or initials'
    });
  }

  try {
    const startTime = Date.now();
    trackEvent('UserData.Lookup.Started', {
      operation: 'lookup',
      lookupMode,
      triggeredBy: requestUser?.initials || initials || 'unknown',
    });
    
    const rows = await withRequest(connectionString, async (request, sqlClient) => {
      let query = `
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
          WHERE 1 = 1
        `;

      if (userObjectId) {
        request.input('userObjectId', sqlClient.NVarChar, userObjectId);
        query += ` AND [Entra ID] = @userObjectId`;
      } else {
        if (email) {
          request.input('email', sqlClient.VarChar(255), email);
          query += ` AND LOWER([Email]) = @email`;
        }

        if (initials) {
          request.input('initials', sqlClient.VarChar(10), initials);
          query += ` AND UPPER([Initials]) = @initials`;
        }
      }

      query += ` ORDER BY [Full Name]`;

      const result = await request
        .query(query);
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2); // 2 retries for transient errors

    const duration = Date.now() - startTime;
    trackMetric('UserData.Lookup.Duration', duration, { lookupMode });
    
    if (rows.length === 0) {
      console.warn(`[userData] No user found for ${lookupMode}: ${userObjectId || email || initials} (${duration}ms)`);
      trackEvent('UserData.Lookup.Completed', {
        operation: 'lookup',
        lookupMode,
        triggeredBy: requestUser?.initials || initials || 'unknown',
        rowCount: '0',
      });
      // Return empty array instead of error - allows graceful degradation
      return res.json([]);
    }

    trackEvent('UserData.Lookup.Completed', {
      operation: 'lookup',
      lookupMode,
      triggeredBy: requestUser?.initials || initials || 'unknown',
      rowCount: String(rows.length),
    });

    return res.json(normalizeRows(rows));

  } catch (error) {
    const duration = Date.now();
    trackException(error, {
      operation: 'UserData.Lookup',
      phase: 'query',
      lookupMode,
    });
    trackEvent('UserData.Lookup.Failed', {
      operation: 'lookup',
      lookupMode,
      triggeredBy: requestUser?.initials || initials || 'unknown',
      error: error.message || 'unknown-error',
    });
    console.error(`[userData] Database error after ${duration}ms:`, {
      message: error.message,
      code: error.code,
      userObjectId: userObjectId ? `${userObjectId.substring(0, 8)}...` : undefined,
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
