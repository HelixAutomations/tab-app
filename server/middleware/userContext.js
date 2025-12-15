/**
 * User Context Middleware
 * Enriches requests with user information and logs user sessions/actions
 */

const { withRequest } = require('../utils/db');

// In-memory cache for user lookups (refresh every 15 minutes)
const userCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Look up user details from database by Entra ID
 */
async function getUserByEntraId(entraId) {
  if (!entraId) return null;

  // Check cache first
  const cached = userCache.get(entraId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }

  try {
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) return null;

    const result = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('entraId', sqlClient.NVarChar, entraId);
      const queryResult = await request.query(`
        SELECT 
          [Entra ID] as entraId,
          [Full Name] as fullName,
          [Initials] as initials,
          [Email] as email,
          [Clio ID] as clioId,
          [Role] as role
        FROM [dbo].[team]
        WHERE [Entra ID] = @entraId
      `);
      return queryResult.recordset[0] || null;
    });

    // Cache the result
    if (result) {
      userCache.set(entraId, {
        user: result,
        timestamp: Date.now()
      });
    }

    return result;
  } catch (error) {
    console.error('[UserContext] Failed to lookup user:', error.message);
    return null;
  }
}

/**
 * Look up user details by email or initials
 */
async function getUserByEmailOrInitials(email, initials) {
  if (!email && !initials) return null;

  try {
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) return null;

    const result = await withRequest(connectionString, async (request, sqlClient) => {
      let query = `
        SELECT 
          [Entra ID] as entraId,
          [Full Name] as fullName,
          [Initials] as initials,
          [Email] as email,
          [Clio ID] as clioId,
          [Role] as role
        FROM [dbo].[team]
        WHERE 1=1
      `;

      if (email) {
        request.input('email', sqlClient.VarChar(255), email.toLowerCase());
        query += ` AND LOWER([Email]) = @email`;
      }

      if (initials) {
        request.input('initials', sqlClient.VarChar(10), initials.toUpperCase());
        query += ` AND UPPER([Initials]) = @initials`;
      }

      const queryResult = await request.query(query);
      return queryResult.recordset[0] || null;
    });

    // Cache by entraId if found
    if (result && result.entraId) {
      userCache.set(result.entraId, {
        user: result,
        timestamp: Date.now()
      });
    }

    return result;
  } catch (error) {
    console.error('[UserContext] Failed to lookup user by email/initials:', error.message);
    return null;
  }
}

/**
 * Middleware to add user context to requests and log user actions
 */
async function userContextMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Extract user identifiers from query/body
  const entraId = req.query.entraId || req.body?.entraId;
  const email = req.query.email || req.body?.email;
  const initials = req.query.initials || req.body?.initials;

  // Try to get user details
  let user = null;
  if (entraId) {
    user = await getUserByEntraId(entraId);
  } else if (email || initials) {
    user = await getUserByEmailOrInitials(email, initials);
  }

  // Attach user to request for use in routes
  req.user = user;

  // Generate request ID for tracking
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Log response when finished - only errors and slow requests
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Only log errors (4xx/5xx) or slow requests (>3s)
    if (res.statusCode >= 400) {
      console.error(`[${req.requestId}] ${res.statusCode} ${req.method} ${req.path} | ${duration}ms | ${user?.initials || 'Anon'}`);
    } else if (duration > 3000) {
      console.warn(`[${req.requestId}] SLOW ${req.method} ${req.path} | ${duration}ms`);
    }

    return originalSend.call(this, data);
  };

  next();
}

module.exports = {
  userContextMiddleware,
  getUserByEntraId,
  getUserByEmailOrInitials
};
