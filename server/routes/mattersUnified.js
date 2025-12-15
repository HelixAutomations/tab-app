const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { cacheUnified, generateCacheKey, CACHE_CONFIG } = require('../utils/redisClient');

const router = express.Router();

// Simple in-memory cache for the unified payload
let unifiedCache = {
  data: null,
  ts: 0,
};

const UNIFIED_CACHE_TTL_MS = Number(process.env.UNIFIED_MATTERS_TTL_MS || 2 * 60 * 1000); // 2 minutes default

// Request throttling to prevent database overload
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3; // Allow up to 3 concurrent requests

function normalizeName(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  if (n.includes(',')) {
    const [last, first] = n.split(',').map(p => p.trim());
    if (first && last) return `${first} ${last}`;
  }
  return n.replace(/\s+/g, ' ');
}

/**
 * GET /api/matters-unified
 * Returns both legacy (all) and VNet (all) matters in a single payload.
 * Optional query params:
 *  - fullName: forwarded to VNet route for server-side filtering (legacy returns all)
 *  - bypassCache=true to force refresh
 */
router.get('/', async (req, res) => {
  const now = Date.now();
  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';
  const fullName = req.query.fullName ? String(req.query.fullName) : '';
  
  // Generate Redis cache key
  const cacheKey = generateCacheKey(
    CACHE_CONFIG.PREFIXES.UNIFIED, 
    'matters', 
    fullName || 'all'
  );

  // Level 1: In-memory cache (fastest)
  if (!bypassCache && unifiedCache.data && (now - unifiedCache.ts) < UNIFIED_CACHE_TTL_MS) {
    return res.json({ ...unifiedCache.data, cached: true, source: 'memory' });
  }

  // Level 2: Redis cache (if in-memory expired)
  if (!bypassCache) {
    try {
      const result = await cacheUnified([fullName || 'all'], async () => {
        return await performMattersUnifiedQuery(req.query);
      });
      
      // Update in-memory cache with Redis result
      unifiedCache.data = result;
      unifiedCache.ts = now;
      
      return res.json({ ...result, source: 'redis' });
    } catch (redisError) {
      console.warn('[mattersUnified] Redis cache unavailable, using in-memory fallback:', redisError.message);
    }
  }

  // Level 3: Database query (if both caches unavailable)
  return await performDirectMattersQuery(req, res);
});

/**
 * Extracted database query logic for caching
 */
async function performMattersUnifiedQuery(queryParams) {
  const fullName = queryParams.fullName ? String(queryParams.fullName) : '';
  const norm = normalizeName(fullName);

  // Database connection strings
  const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
  const vnetConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  if (!legacyConn || !vnetConn) {
    throw new Error('Missing DB connection strings');
  }

  // Query both databases
  let legacyAll = [];
  let legacyError = null;
  try {
    legacyAll = await withRequest(legacyConn, async (request) => {
      const q = 'SELECT * FROM matters';
      const r = await request.query(q);
      return Array.isArray(r.recordset) ? r.recordset : [];
    });
  } catch (err) {
    legacyAll = [];
    legacyError = err;
    console.error('❌ Legacy matters query failed:', err?.message || err);
  }

  let vnetAll = [];
  let vnetError = null;
  try {
    vnetAll = await withRequest(vnetConn, async (request) => {
      if (!norm) {
        const r = await request.query('SELECT * FROM Matters');
        return Array.isArray(r.recordset) ? r.recordset : [];
      }
      request.input('name', sql.VarChar(200), norm);
      request.input('nameLike', sql.VarChar(210), `%${norm}%`);
      const q = `
        SELECT * FROM Matters
        WHERE (
          LOWER(ResponsibleSolicitor) = @name OR LOWER(OriginatingSolicitor) = @name
          OR LOWER(ResponsibleSolicitor) LIKE @nameLike OR LOWER(OriginatingSolicitor) LIKE @nameLike
        )`;
      const r = await request.query(q);
      return Array.isArray(r.recordset) ? r.recordset : [];
    });
  } catch (err) {
    vnetAll = [];
    vnetError = err;
    console.error('❌ VNet matters query failed:', err?.message || err);
  }

  // Return fields expected by the frontend (legacyAll/vnetAll) and keep
  // legacy/vnet aliases for compatibility with any exploratory callers.
  return {
    legacyAll: legacyAll,
    vnetAll: vnetAll,
    legacy: legacyAll,
    vnet: vnetAll,
    legacyAllCount: legacyAll.length,
    vnetAllCount: vnetAll.length,
    errors: {
      legacy: legacyError?.message || null,
      vnet: vnetError?.message || null
    }
  };
}

/**
 * Original direct query logic (fallback)
 */
async function performDirectMattersQuery(req, res) {

  // Check request throttling
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return res.status(429).json({ 
      error: 'Too many concurrent requests', 
      details: 'Please try again in a moment',
      cached: unifiedCache.data ? true : false,
      ...(unifiedCache.data && { ...unifiedCache.data })
    });
  }

  try {
    activeRequests++;
    
    // Explicit, separate DB connection strings
    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING; // helix-core-data (legacy schema)
    const vnetConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB (new schema)

    if (!legacyConn || !vnetConn) {
      return res.status(500).json({ error: 'Missing DB connection strings', details: 'Require SQL_CONNECTION_STRING[_LEGACY] and SQL_CONNECTION_STRING_VNET or INSTRUCTIONS_SQL_CONNECTION_STRING' });
    }

    const fullName = req.query.fullName ? String(req.query.fullName) : '';
    const norm = normalizeName(fullName);

    // Sequential requests to avoid overwhelming the database
    let legacyAll = [];
    let legacyError = null;
    try {
      legacyAll = await withRequest(legacyConn, async (request) => {
        const q = 'SELECT * FROM matters';
        const r = await request.query(q);
        return Array.isArray(r.recordset) ? r.recordset : [];
      });
    } catch (err) {
      legacyAll = [];
      legacyError = err;
      console.error('❌ Legacy matters query failed:', err?.message || err);
    }

    // VNet/new: Handle instructions DB timeouts gracefully
    let vnetAll = [];
    let vnetError = null;
    try {
      vnetAll = await withRequest(vnetConn, async (request) => {
        if (!norm) {
          const r = await request.query('SELECT * FROM Matters');
          return Array.isArray(r.recordset) ? r.recordset : [];
        }
        request.input('name', sql.VarChar(200), norm);
        request.input('nameLike', sql.VarChar(210), `%${norm}%`);
        const q = `
          SELECT * FROM Matters
          WHERE (
            LOWER(ResponsibleSolicitor) = @name OR LOWER(OriginatingSolicitor) = @name
            OR LOWER(ResponsibleSolicitor) LIKE @nameLike OR LOWER(OriginatingSolicitor) LIKE @nameLike
          )`;
        const r = await request.query(q);
        return Array.isArray(r.recordset) ? r.recordset : [];
      });
    } catch (vnetError) {
      // VNet database unavailable - continue with legacy data only
      console.error('⚠️ VNet matters query fallback:', vnetError?.message || vnetError);
      vnetAll = []; // Fallback to empty array
    }

    const responsePayload = {
      legacyAllCount: Array.isArray(legacyAll) ? legacyAll.length : 0,
      vnetAllCount: Array.isArray(vnetAll) ? vnetAll.length : 0,
      legacyAll,
      vnetAll,
      cached: false,
      ttlMs: UNIFIED_CACHE_TTL_MS,
      errors: {},
    };

    if (legacyError) {
      responsePayload.errors.legacy = legacyError?.message || String(legacyError);
    }
    if (vnetError) {
      responsePayload.errors.vnet = vnetError?.message || String(vnetError);
    }

    if (!legacyAll.length && !vnetAll.length && (legacyError || vnetError)) {
      if (unifiedCache.data) {
        return res.status(200).json({
          ...unifiedCache.data,
          cached: true,
          stale: true,
          errors: {
            ...(unifiedCache.data.errors || {}),
            ...(responsePayload.errors || {}),
          },
        });
      }
      const consolidatedError = legacyError || vnetError;
      return res.status(502).json({
        error: 'Failed to fetch unified matters',
        details: consolidatedError?.message || String(consolidatedError),
      });
    }

    // Update in-memory cache timestamp correctly
    unifiedCache = { data: responsePayload, ts: Date.now() };
    return res.json(responsePayload);
  } catch (err) {
    console.error('❌ /api/matters-unified failed:', err);
    
    // Handle throttling errors with 429 status
    if (err.message.includes('Too many concurrent')) {
      return res.status(429).json({ 
        error: 'Too many concurrent requests', 
        details: 'Please try again in a moment',
        cached: unifiedCache.data ? true : false,
        ...(unifiedCache.data && { ...unifiedCache.data })
      });
    }
    if (unifiedCache.data) {
      return res.status(200).json({
        ...unifiedCache.data,
        cached: true,
        stale: true,
        errors: {
          ...(unifiedCache.data.errors || {}),
          runtime: err?.message || String(err),
        },
      });
    }
    
    return res.status(500).json({ error: 'Failed to fetch unified matters', details: String(err && err.message || err) });
  } finally {
    activeRequests--;
  }
}

module.exports = router;
