/**
 * User Context Middleware
 * Enriches requests with user information and logs user sessions/actions
 */

const { withRequest } = require('../utils/db');

// In-memory cache for user lookups (refresh every 15 minutes)
const userCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const CACHE_MAX_SIZE = 500;        // LRU cap — prevents unbounded growth

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseClientPrincipal(headerValue) {
  const raw = asString(headerValue);
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getClientPrincipalClaim(clientPrincipal, claimTypes) {
  if (!clientPrincipal || !Array.isArray(clientPrincipal.claims) || !Array.isArray(claimTypes)) {
    return '';
  }

  const wanted = new Set(claimTypes.map((claimType) => String(claimType).toLowerCase()));
  for (const claim of clientPrincipal.claims) {
    const claimType = asString(claim?.typ || claim?.type).toLowerCase();
    if (!claimType || !wanted.has(claimType)) continue;

    const claimValue = asString(claim?.val || claim?.value);
    if (claimValue) {
      return claimValue;
    }
  }

  return '';
}

/**
 * Evict expired entries and enforce max size (oldest-first) when setting.
 */
function cacheSet(key, value) {
    userCache.set(key, value);
    // Evict expired entries first
    if (userCache.size > CACHE_MAX_SIZE) {
        for (const [k, v] of userCache) {
            if (Date.now() - v.timestamp >= CACHE_TTL) {
                userCache.delete(k);
            }
        }
    }
    // Still over cap? Drop oldest entries
    while (userCache.size > CACHE_MAX_SIZE) {
        const firstKey = userCache.keys().next().value;
        userCache.delete(firstKey);
    }
}

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
      cacheSet(entraId, {
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
      cacheSet(result.entraId, {
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
  const clientPrincipal = parseClientPrincipal(req.headers?.['x-ms-client-principal']);
  
  // Extract user identifiers from query/body/headers
  const entraId = asString(req.query?.entraId)
    || asString(req.body?.entraId)
    || asString(req.headers?.['x-helix-entra-id'])
    || getClientPrincipalClaim(clientPrincipal, [
      'http://schemas.microsoft.com/identity/claims/objectidentifier',
      'oid',
    ])
    || asString(req.headers?.['x-ms-client-principal-id']);
  const email = asString(req.query?.email)
    || asString(req.body?.email)
    || asString(req.headers?.['x-user-email'])
    || asString(req.headers?.['x-ms-client-principal-name'])
    || asString(clientPrincipal?.userDetails)
    || getClientPrincipalClaim(clientPrincipal, [
      'preferred_username',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'emails',
      'upn',
      'name',
    ]);
  const initials = asString(req.query?.initials)
    || asString(req.body?.initials)
    || asString(req.headers?.['x-helix-initials']);

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

  // Log response when finished - errors only (devConsole handles timing display in dev)
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Only log errors (4xx/5xx) — slow request display is handled by devConsole middleware
    if (res.statusCode >= 400) {
      console.error(`[${req.requestId}] ${res.statusCode} ${req.method} ${req.path} | ${duration}ms | ${user?.initials || 'Anon'}`);
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
