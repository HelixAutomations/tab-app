const express = require('express');
const { withRequest } = require('../utils/db');
const { getMatterDateExpressions } = require('../utils/matterDateColumns');
const { getClient } = require('../utils/getSecret');
const fetch = require('node-fetch');
const { getRedisClient, cacheWrapper, generateCacheKey } = require('../utils/redisClient');
const { performUnifiedEnquiriesQuery } = require('./enquiries-unified');

const router = express.Router();
const { annotate } = require('../utils/devConsole');

// Use lightweight last-week snapshot instead of full WIP to keep management fast
const DEFAULT_DATASETS = ['userData', 'teamData', 'enquiries', 'allMatters', 'wipDbLastWeek', 'recoveredFees', 'wipClioCurrentWeek'];
const CACHE_TTL_MS = Number(process.env.REPORTING_DATASET_TTL_MS || 2 * 60 * 1000);
const cache = new Map();

// Helper: evict a Redis cache key before fetching fresh data
async function evictAndFetch(key, queryFn, ttl) {
  try { await deleteCache([key]); } catch (_) { /* non-fatal */ }
  return cacheWrapper(key, queryFn, ttl);
}

// Wrap a dataset fetch call: when bypassCache is true, evict the Redis key first
function cachedFetch(key, queryFn, ttl, bypassCache) {
  return bypassCache ? evictAndFetch(key, queryFn, ttl) : cacheWrapper(key, queryFn, ttl);
}

// Dataset fetchers are lazy functions that compute a cache key and then call cacheWrapper
const datasetFetchers = {
  // 5 min - user data changes rarely
  userData: ({ connectionString, entraId, bypassCache }) => {
    const key = generateCacheKey('rpt', 'userData', entraId || 'anon');
    return cachedFetch(key, () => fetchUserData({ connectionString, entraId }), 300, bypassCache);
  },
  // 30 min - team data is fairly static
  teamData: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'teamData');
    return cachedFetch(key, () => fetchTeamData({ connectionString }), 1800, bypassCache);
  },
  // 5 min - enquiries update regularly; align with client TTL
  enquiries: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'enquiries');
    return cachedFetch(key, () => fetchEnquiries({ connectionString }), 300, bypassCache);
  },
  // 15 min - matters update moderately
  allMatters: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'allMatters');
    return cachedFetch(key, () => fetchAllMatters({ connectionString }), 900, bypassCache);
  },
  // 5 min - WIP data changes frequently (DB-sourced historical)
  wip: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'wip');
    return cachedFetch(key, () => fetchWip({ connectionString }), 300, bypassCache);
  },
  // 2 min - collected fees; kept short for near-realtime parity with Home card
  recoveredFees: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'recoveredFees');
    return cachedFetch(key, () => fetchRecoveredFees({ connectionString }), 120, bypassCache);
  },
  // 2 min - per-user summary; include user in key (kept short for near-realtime Home card)
  recoveredFeesSummary: ({ connectionString, entraId, clioId, bypassCache, firm }) => {
    const who = firm ? 'firm' : (entraId || (typeof clioId === 'number' ? `clio:${clioId}` : 'anon'));
    const key = generateCacheKey('rpt', 'recoveredFeesSummary', who);
    return cachedFetch(key, () => fetchRecoveredFeesSummary({ connectionString, entraId, clioId, firm }), 120, bypassCache);
  },
  // 5 min - current week WIP from Clio; user-specific when entraId provided
  wipClioCurrentWeek: ({ connectionString, entraId, bypassCache }) => {
    const key = generateCacheKey('rpt', 'wipClioCurrentWeek', entraId || 'team');
    return cachedFetch(key, () => fetchWipClioCurrentWeek({ connectionString, entraId }), 300, bypassCache);
  },
  // 10 min - last week DB snapshot
  wipDbLastWeek: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'wipDbLastWeek');
    return cachedFetch(key, () => fetchWipDbLastWeek({ connectionString }), 600, bypassCache);
  },
  // 15 min - Deal/pitch data for Meta metrics conversion tracking
  deals: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'deals');
    return cachedFetch(key, () => fetchDeals({ connectionString }), 900, bypassCache);
  },
  // 15 min - Instruction data for conversion funnel tracking
  instructions: ({ connectionString, bypassCache }) => {
    const key = generateCacheKey('rpt', 'instructions');
    return cachedFetch(key, () => fetchInstructions({ connectionString }), 900, bypassCache);
  },
  // 5 min - Dubber call recordings for Calls Report
  dubberCalls: ({ bypassCache }) => {
    const key = generateCacheKey('rpt', 'dubberCalls');
    return cachedFetch(key, () => fetchDubberCalls(), 300, bypassCache);
  },
};

router.get('/management-datasets', async (req, res) => {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'SQL connection string not configured' });
  }

  const datasetsParam = typeof req.query.datasets === 'string'
    ? req.query.datasets.split(',').map((name) => name.trim()).filter(Boolean)
    : null;
  const requestedDatasets = (datasetsParam && datasetsParam.length > 0)
    ? datasetsParam.filter((name) => Object.prototype.hasOwnProperty.call(datasetFetchers, name))
    : DEFAULT_DATASETS;
  const entraId = typeof req.query.entraId === 'string' && req.query.entraId.trim().length > 0
    ? req.query.entraId.trim()
    : null;
  const clioIdCandidate = typeof req.query.clioId === 'string'
    ? Number.parseInt(req.query.clioId, 10)
    : null;
  const clioId = Number.isNaN(clioIdCandidate ?? NaN) ? null : clioIdCandidate;
  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';
  const firm = String(req.query.firm || '').toLowerCase() === 'true';

  const cacheKey = `${entraId || 'anon'}|${requestedDatasets.join(',')}`;
  const cachedEntry = cache.get(cacheKey);
  if (!bypassCache && cachedEntry && cachedEntry.expires > Date.now()) {
    annotate(res, { source: 'memory', note: `TTL ${Math.round((cachedEntry.expires - Date.now()) / 1000)}s remaining` });
    return res.json(cachedEntry.data);
  }

  const responsePayload = {};
  const errors = {};

  // To reduce socket resets under load, fetch heavy datasets sequentially
  const heavy = new Set(['wip', 'recoveredFees']);
  const light = requestedDatasets.filter((d) => !heavy.has(d));
  const heavyList = requestedDatasets.filter((d) => heavy.has(d));

  // Fetch light datasets in parallel
  await Promise.all(light.map(async (datasetKey) => {
    const fetcher = datasetFetchers[datasetKey];
    if (!fetcher) return;
    try {
      responsePayload[datasetKey] = await fetcher({ connectionString, entraId, clioId, bypassCache, firm });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Reporting dataset fetch failed for ${datasetKey}:`, message);
      errors[datasetKey] = message;
      responsePayload[datasetKey] = null;
    }
  }));

  // Fetch heavy datasets one by one
  for (const datasetKey of heavyList) {
    const fetcher = datasetFetchers[datasetKey];
    if (!fetcher) continue;
    try {
      responsePayload[datasetKey] = await fetcher({ connectionString, entraId, clioId, bypassCache, firm });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Reporting dataset fetch failed for ${datasetKey}:`, message);
      errors[datasetKey] = message;
      responsePayload[datasetKey] = null;
    }
  }

  // Join: Merge current-week (prefer Clio; fallback to DB if Clio unavailable) into payload for frontend consumption
  try {
    // Extract activities array from the object structure returned by fetchWipClioCurrentWeek
    let clioActivities = responsePayload.wipClioCurrentWeek?.current_week?.activities 
      || (Array.isArray(responsePayload.wipClioCurrentWeek) ? responsePayload.wipClioCurrentWeek : null);
    
    // Prefer lightweight last-week dataset when present; fallback to full wip if explicitly requested
    const dbWipActivities = Array.isArray(responsePayload.wipDbLastWeek)
      ? responsePayload.wipDbLastWeek
      : (Array.isArray(responsePayload.wip) ? responsePayload.wip : null);

    // If Clio data is missing or empty, populate current week from DB as a fallback
    if (!clioActivities || clioActivities.length === 0) {
      // Prefer a direct DB query for the current week window
      try {
        const dbCurrentWeek = await fetchWipDbCurrentWeek({ connectionString });
        if (Array.isArray(dbCurrentWeek) && dbCurrentWeek.length > 0) {
          clioActivities = dbCurrentWeek;
        }
      } catch (fallbackErr) {
        console.warn('DB fallback for current-week WIP failed:', fallbackErr.message);
      }
    }

    if (clioActivities || dbWipActivities) {
      // Compute current and last week bounds
      const { start: currentStart, end: currentEnd } = getCurrentWeekBounds();
      
      const lastWeekStart = new Date(currentStart);
      lastWeekStart.setDate(currentStart.getDate() - 7);
      lastWeekStart.setHours(0, 0, 0, 0);
      const lastWeekEnd = new Date(currentEnd);
      lastWeekEnd.setDate(currentEnd.getDate() - 7);
      lastWeekEnd.setHours(23, 59, 59, 999);

      // Aggregate
      const currentWeekDaily = clioActivities
        ? aggregateDailyData(clioActivities, currentStart, currentEnd)
        : {};
      const lastWeekDaily = dbWipActivities
        ? aggregateDailyData(dbWipActivities, lastWeekStart, lastWeekEnd)
        : {};

      // If Clio data was missing and we used DB fallback, also shape wipClioCurrentWeek to satisfy UI merge
      if ((!responsePayload.wipClioCurrentWeek || !responsePayload.wipClioCurrentWeek.current_week?.activities?.length) && clioActivities && clioActivities.length > 0) {
        responsePayload.wipClioCurrentWeek = {
          current_week: { activities: clioActivities, daily_data: currentWeekDaily },
          last_week: { activities: [], daily_data: {} },
        };
      }

      responsePayload.wipCurrentAndLastWeek = {
        current_week: { daily_data: currentWeekDaily, activities: clioActivities || [] },
        last_week: { daily_data: lastWeekDaily, activities: dbWipActivities || [] },
      };
    }
  } catch (e) {
    console.error('Failed to merge current-week WIP from Clio', e);
  }

  if (Object.keys(errors).length > 0) {
    responsePayload.errors = errors;
  }

  cache.set(cacheKey, { data: responsePayload, expires: Date.now() + CACHE_TTL_MS });

  annotate(res, { source: 'sql', note: `${requestedDatasets.join('+')} fresh` });
  return res.json(responsePayload);
});

module.exports = router;

// Expose selected helpers for reuse in streaming route
module.exports.fetchWipClioCurrentWeek = fetchWipClioCurrentWeek;

// Allow external routes to clear the in-memory response cache used by this router
module.exports.clearReportingCache = function clearReportingCache(scope = 'all') {
  try {
    if (!(cache instanceof Map)) return 0;
    let cleared = 0;
    if (scope === 'all') {
      cleared = cache.size;
      cache.clear();
      return cleared;
    }
    // For targeted clears, remove entries whose payload contains the target dataset
    for (const [key, entry] of cache.entries()) {
      const data = entry && entry.data;
      if (!data) continue;
      if (scope === 'enquiries' && Object.prototype.hasOwnProperty.call(data, 'enquiries')) {
        cache.delete(key);
        cleared++;
      }
      if (scope === 'matters' && (Object.prototype.hasOwnProperty.call(data, 'allMatters') || Object.prototype.hasOwnProperty.call(data, 'matters'))) {
        cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  } catch {
    return 0;
  }
};

async function fetchUserData({ connectionString, entraId }) {
  if (!entraId) {
    return null;
  }
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('entraId', sqlClient.NVarChar, entraId);
    const result = await request.query(`
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
        [status]
      FROM [dbo].[team]
      WHERE [Entra ID] = @entraId
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchTeamData({ connectionString }) {
  return withRequest(connectionString, async (request) => {
    const result = await request.query(`
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
        [status]
      FROM [dbo].[team]
      ORDER BY [Full Name]
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchEnquiries({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  console.log(`[Reporting] Fetching enquiries from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);

  const result = await performUnifiedEnquiriesQuery({
    sourcePolicy: 'reporting',
    fetchAll: 'true',
    includeTeamInbox: 'true',
    processingApproach: 'unified',
    dateFrom: formatDateOnly(from),
    dateTo: formatDateOnly(to),
    limit: '50000',
  });

  const enquiries = Array.isArray(result?.enquiries) ? result.enquiries : [];
  console.log(`[Reporting] Retrieved ${enquiries.length} enquiries via reporting policy (${result?.processingModel?.sourceBias || 'unknown'})`);
  return enquiries;
}

async function fetchAllMatters({ connectionString, range }) {
  const shouldApplyRange = Boolean(range?.from && range?.to);
  const dateExpressions = shouldApplyRange ? await getMatterDateExpressions(connectionString) : [];

  return withRequest(connectionString, async (request, sqlClient) => {
    let query = 'SELECT * FROM [dbo].[matters]';

    if (shouldApplyRange) {
      if (dateExpressions.length) {
        const [fromDate, toDate] = [formatDateOnly(range.from), formatDateOnly(range.to)];
        request.input('dateFrom', sqlClient.Date, fromDate);
        request.input('dateTo', sqlClient.Date, toDate);
        const coalesceClause = dateExpressions.join(', ');
        query = `
          SELECT *
          FROM [dbo].[matters]
          WHERE TRY_CONVERT(date, COALESCE(${coalesceClause}))
            BETWEEN @dateFrom AND @dateTo
        `;
        console.log(`[Reporting] Fetching matters scoped (${coalesceClause}) ${fromDate} → ${toDate}`);
      } else {
        console.warn('[Reporting] Range requested for matters but no recognized date columns; returning unfiltered dataset');
      }
    } else {
      console.log('[Reporting] Fetching matters without range filter');
    }

    const result = await request.query(query);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchWip({ connectionString }) {
  // Exclude current week: DB has no current-week rows (syncWip skips them).
  // Current week is sourced live from Clio via wipClioCurrentWeek.
  const { from, to } = getLast24MonthsExcludingCurrentWeek();
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    const result = await request.query(`
      SELECT 
        id,
        date,
        CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
        CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
        type,
        matter_id,
        matter_display_number,
        quantity_in_hours,
        note,
        total,
        price,
        expense_category,
        activity_description_id,
        activity_description_name,
        user_id,
        bill_id,
        billed
      FROM [dbo].[wip]
      WHERE created_at_date BETWEEN @dateFrom AND @dateTo
      ORDER BY created_at_date DESC
    `);
    if (!Array.isArray(result.recordset)) {
      return [];
    }
    return result.recordset.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) {
          row.quantity_in_hours = Math.ceil(value * 10) / 10;
        }
      }
      return row;
    });
  });
}

// Lightweight: fetch only last week's WIP from DB (as activity-like rows)
async function fetchWipDbLastWeek({ connectionString }) {
  const { start, end } = getCurrentWeekBounds();
  const lastWeekStart = new Date(start);
  lastWeekStart.setDate(start.getDate() - 7);
  lastWeekStart.setHours(0, 0, 0, 0);
  const lastWeekEnd = new Date(end);
  lastWeekEnd.setDate(end.getDate() - 7);
  lastWeekEnd.setHours(23, 59, 59, 999);

  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(lastWeekStart));
    request.input('dateTo', sqlClient.Date, formatDateOnly(lastWeekEnd));
    const result = await request.query(`
      SELECT 
        id,
        date,
        CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
        CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
        type,
        matter_id,
        matter_display_number,
        quantity_in_hours,
        note,
        total,
        price,
        expense_category,
        activity_description_id,
        activity_description_name,
        user_id,
        bill_id,
        billed
      FROM [dbo].[wip]
      WHERE created_at_date BETWEEN @dateFrom AND @dateTo
    `);
    if (!Array.isArray(result.recordset)) {
      return [];
    }
    return result.recordset.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) {
          row.quantity_in_hours = Math.ceil(value * 10) / 10;
        }
      }
      return row;
    });
  });
}

// Lightweight: fetch only current week's WIP from DB (as activity-like rows)
async function fetchWipDbCurrentWeek({ connectionString }) {
  const { start, end } = getCurrentWeekBounds();
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(start));
    request.input('dateTo', sqlClient.Date, formatDateOnly(end));
    const result = await request.query(`
      SELECT 
        id,
        date,
        CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
        CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
        type,
        matter_id,
        matter_display_number,
        quantity_in_hours,
        note,
        total,
        price,
        expense_category,
        activity_description_id,
        activity_description_name,
        user_id,
        bill_id,
        billed
      FROM [dbo].[wip]
      WHERE created_at_date BETWEEN @dateFrom AND @dateTo
    `);
    if (!Array.isArray(result.recordset)) {
      return [];
    }
    return result.recordset.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) {
          row.quantity_in_hours = Math.ceil(value * 10) / 10;
        }
      }
      return row;
    });
  });
}

// --- Direct Clio API Integration (replaced Azure Function call) ---
const kvClient = getClient();

async function getClioCredentialsCached() {
  const cacheKey = 'clio:credentials';
  
  // Check Redis first, then fallback to in-memory cache
  const redisClient = await getRedisClient();
  if (redisClient) {
    try {
      const cached = await redisClient.get(generateCacheKey('rpt', cacheKey));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (redisError) {
      console.warn('Redis get failed for Clio credentials, using in-memory fallback:', redisError.message);
    }
  }
  
  // Fallback to existing in-memory cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  // Try PBI credentials first, then fallback to user credentials if PBI unavailable
  let credentials = null;
  let source = 'unknown';
  
  try {
    const [refreshTokenSecret, clientSecret, clientIdSecret] = await Promise.all([
      kvClient.getSecret('clio-pbi-refreshtoken'),
      kvClient.getSecret('clio-pbi-secret'),
      kvClient.getSecret('clio-pbi-clientid'),
    ]);
    
    credentials = {
      refreshToken: refreshTokenSecret.value,
      clientSecret: clientSecret.value,
      clientId: clientIdSecret.value,
    };
    source = 'clio-pbi';
  } catch (pbiError) {
    console.warn('PBI Clio credentials unavailable, trying user fallback:', pbiError.message);
    
    // Fallback to user credentials (try lz, jw, ac in order)
    const fallbackUsers = ['lz', 'jw', 'ac'];
    for (const initials of fallbackUsers) {
      try {
        const [refreshTokenSecret, clientSecret, clientIdSecret] = await Promise.all([
          kvClient.getSecret(`${initials}-clio-v1-refreshtoken`),
          kvClient.getSecret(`${initials}-clio-v1-clientsecret`),
          kvClient.getSecret(`${initials}-clio-v1-clientid`),
        ]);
        
        credentials = {
          refreshToken: refreshTokenSecret.value,
          clientSecret: clientSecret.value,
          clientId: clientIdSecret.value,
        };
        source = `${initials}-clio-v1`;
        console.log(`✅ Using ${initials.toUpperCase()} Clio credentials as fallback for reporting`);
        break;
      } catch (userError) {
        console.warn(`${initials.toUpperCase()} Clio credentials unavailable:`, userError.message);
      }
    }
    
    if (!credentials) {
      throw new Error('No valid Clio credentials found (PBI or user fallback)');
    }
  }
  
  // Store in both Redis and memory cache
  const expiryTime = Date.now() + 60 * 60 * 1000; // 1h TTL
  cache.set(cacheKey, { data: credentials, expires: expiryTime });
  
  if (redisClient) {
    try {
      await redisClient.setEx(generateCacheKey('rpt', cacheKey), 3600, JSON.stringify(credentials)); // 1h TTL
    } catch (redisError) {
      console.warn('Redis set failed for Clio credentials:', redisError.message);
    }
  }
  
  return credentials;
}

async function getClioAccessToken(forceRefresh = false) {
  const cacheKey = 'clio:accessToken';
  
  // If forcing refresh, clear caches first
  if (forceRefresh) {
    cache.delete(cacheKey);
    const rc = await getRedisClient();
    if (rc) { try { await rc.del(generateCacheKey('rpt', cacheKey)); } catch { /* ignore */ } }
  }

  // Check Redis first, then fallback to in-memory cache
  const redisClient = await getRedisClient();
  if (redisClient) {
    try {
      const cached = await redisClient.get(generateCacheKey('rpt', cacheKey));
      if (cached) {
        return cached; // Redis stores the token directly as string
      }
    } catch (redisError) {
      console.warn('Redis get failed for Clio access token, using in-memory fallback:', redisError.message);
    }
  }
  
  // Fallback to existing in-memory cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  const { clientId, clientSecret, refreshToken } = await getClioCredentialsCached();
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  
  // Abort after 20s to avoid hanging requests
  const tokenAbort = new AbortController();
  const tokenTimeout = setTimeout(() => tokenAbort.abort(), 20000);
  const response = await fetch(`https://eu.app.clio.com/oauth/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: tokenAbort.signal,
  }).finally(() => clearTimeout(tokenTimeout));
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Reporting] Failed to refresh Clio token (${response.status}):`, errorText);
    
    // Clear both caches on failure
    cache.delete(cacheKey);
    if (redisClient) {
      try {
        await redisClient.del(generateCacheKey('rpt', cacheKey));
      } catch (delError) {
        console.warn('Failed to clear Redis cache on token error:', delError.message);
      }
    }
    
    throw new Error(`Failed to obtain Clio access token (${response.status}): ${errorText}. You may need to re-authenticate with Clio and update the refresh token in Key Vault.`);
  }
  
  const tokenData = await response.json();
  const accessToken = tokenData.access_token;
  
  // Clio returns a new refresh token on each refresh - store it back to Key Vault if changed
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    console.log('[Reporting] Storing new Clio refresh token to Key Vault');
    try {
      const kvUri = 'https://helix-keys.vault.azure.net/';
      const credential = new (require('@azure/identity').DefaultAzureCredential)();
      const secretClient = new (require('@azure/keyvault-secrets').SecretClient)(kvUri, credential);
      await secretClient.setSecret('clio-teamhubv1-refreshtoken', tokenData.refresh_token);
    } catch (kvError) {
      console.error('[Reporting] Failed to update refresh token in Key Vault:', kvError.message);
    }
  }
  
  // Cache with 30min TTL (tokens usually valid for 1h)
  const expiresInSeconds = tokenData.expires_in || 3600;
  const cacheTtl = Math.min(expiresInSeconds - 300, 30 * 60); // Conservative 30min max
  const expiryTime = Date.now() + cacheTtl * 1000;
  
  // Store in both Redis and memory cache
  cache.set(cacheKey, { data: accessToken, expires: expiryTime });
  
  if (redisClient) {
    try {
      await redisClient.setEx(generateCacheKey('rpt', cacheKey), cacheTtl, accessToken);
    } catch (redisError) {
      console.warn('Redis set failed for Clio access token:', redisError.message);
    }
  }
  
  return accessToken;
}

async function fetchWipClioCurrentWeek({ connectionString, entraId }) {
  // Fetch user-specific current week activities and return structured daily data
  const startedAt = Date.now();
  try {
    let accessToken = await getClioAccessToken();
    
    // Get user's Clio ID if entraId is provided
    let userClioId = null;
    if (entraId && connectionString) {
      try {
        const userData = await withRequest(connectionString, async (request, sqlClient) => {
          request.input('entraId', sqlClient.NVarChar, entraId);
          const result = await request.query(`
            SELECT [Clio ID] FROM [dbo].[team] WHERE [Entra ID] = @entraId
          `);
          return Array.isArray(result.recordset) ? result.recordset : [];
        });
        userClioId = userData?.[0]?.['Clio ID'] || null;
        if (userClioId) {
          console.log(`Found Clio ID ${userClioId} for Entra ID ${entraId}`);
        } else {
          console.warn(`No Clio ID found for Entra ID ${entraId}`);
        }
      } catch (dbError) {
        console.warn('Failed to lookup user Clio ID:', dbError.message);
      }
    }
    
    // Calculate current week date range (Monday to today)
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust when day is Sunday
    weekStart.setDate(weekStart.getDate() + diff);
    weekStart.setHours(0, 1, 0, 0); // Start at 00:01 on Monday
    
    const startDate = formatDateTimeForClio(weekStart);
    const endDate = formatDateTimeForClio(now);
    
    console.log(`[WipClio] Fetching ${userClioId ? `user ${userClioId}` : 'TEAM-WIDE'} activities from ${startDate} to ${endDate}`);
    
    // Fetch activities from Clio API with 401 retry
    // Pass userClioId to filter at API level (more efficient than post-filtering)
    let activities;
    try {
      activities = await fetchAllClioActivities(startDate, endDate, accessToken, userClioId);
    } catch (err) {
      const is401 = String(err?.message || '').includes('401');
      if (!is401) throw err;
      console.log('[WipClio] Clio 401 detected; refreshing access token...');
      accessToken = await getClioAccessToken(true);
      activities = await fetchAllClioActivities(startDate, endDate, accessToken, userClioId);
    }
    
    // Log the results
    if (userClioId) {
      console.log(`Fetched ${activities.length} activities for user ${userClioId}`);
    } else {
      console.log(`Fetched ${activities.length} team-wide activities (no user filter)`);
    }
    
    // Calculate date bounds
    const { start: currentStart, end: currentEnd } = getCurrentWeekBounds();
    console.log(`[WipClio] Current week bounds: ${currentStart.toISOString()} to ${currentEnd.toISOString()}`);
    const lastWeekStart = new Date(currentStart);
    lastWeekStart.setDate(currentStart.getDate() - 7);
    lastWeekStart.setHours(0, 0, 0, 0);
    const lastWeekEnd = new Date(currentEnd);
    lastWeekEnd.setDate(currentEnd.getDate() - 7);
    lastWeekEnd.setHours(23, 59, 59, 999);
    
    // Convert to WIP format
    const wipActivities = convertClioActivitiesToWIP(activities);
    console.log(`[WipClio] Converted to ${wipActivities.length} WIP activities`);
    
    // Build activities for the current week (used by dashboards) and aggregate daily_data
    const currentWeekActivities = wipActivities.filter(a => {
      const key = toDayKey(a.date || a.created_at || a.updated_at);
      return key && isDateInRange(key, currentStart, currentEnd);
    });
    console.log(`[WipClio] Filtered to ${currentWeekActivities.length} current week activities (from ${wipActivities.length} total)`);
    if (wipActivities.length > 0 && currentWeekActivities.length === 0) {
      // Debug why all got filtered out
      const sampleDates = wipActivities.slice(0, 5).map(a => a.date || a.created_at || 'no date');
      console.log(`[WipClio] ⚠️ All activities filtered out! Sample dates: ${JSON.stringify(sampleDates)}`);
    }

    // Aggregate per-day totals from the activities we fetched
    const currentWeekDaily = aggregateDailyData(wipActivities, currentStart, currentEnd);

    if (userClioId) {
      // User-specific: include both daily_data (for personal metrics) and activities (for consistency)
      console.log(`Returning aggregated daily data for user ${userClioId}`);
      return {
        current_week: { daily_data: currentWeekDaily, activities: currentWeekActivities },
        last_week: { daily_data: {}, activities: [] },
      };
    } else {
      // Team-wide: include both activities (to preserve user breakdown) and aggregated daily_data for safety
      console.log(`Returning ${currentWeekActivities.length} WIP activities with user breakdown`);
      return {
        current_week: { activities: currentWeekActivities, daily_data: currentWeekDaily },
        last_week: { activities: [], daily_data: {} },
      };
    }
  } catch (error) {
    console.error('Failed to fetch WIP from Clio:', error.message);
    // Propagate the error so the streaming handler can send dataset-error
    // instead of caching an empty result as 'ready' for 30 minutes.
    throw error;
  } finally {
    const ms = Date.now() - startedAt;
    // Only warn if extremely slow (>30s)
    if (ms > 30000) {
      console.warn(`User-specific Clio API call slow: ${ms}ms`);
    }
  }
}

function formatDateTimeForClio(date) {
  // Clio expects ISO timestamps with timezone. Use Zulu time to avoid local/UTC ambiguity.
  // Example: 2026-01-06T09:30:00Z
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function fetchAllClioActivities(startDate, endDate, accessToken, userId = null) {
  let allActivities = [];
  let offset = 0;
  const limit = 200;
  const fields = "id,date,created_at,updated_at,type,matter,quantity_in_hours,note,total,price,expense_category,activity_description,user,bill,billed";
  
  const activitiesUrl = 'https://eu.app.clio.com/api/v4/activities.json';
  
  while (true) {
    const params = new URLSearchParams({
      created_since: startDate,
      created_before: endDate,
      fields: fields,
      limit: limit.toString(),
      offset: offset.toString(),
    });
    
    // Add user_id filter if provided (for user-specific requests)
    if (userId) {
      params.set('user_id', userId.toString());
    }
    
    const url = `${activitiesUrl}?${params.toString()}`;
    
    // Abort each page after 20s to prevent indefinite waits
    const pageAbort = new AbortController();
    const pageTimeout = setTimeout(() => pageAbort.abort(), 20000);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: pageAbort.signal,
    }).finally(() => clearTimeout(pageTimeout));
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch team activities from Clio: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      allActivities = allActivities.concat(data.data);
    }
    
    // Check for pagination
    if (!data.meta?.paging?.next || data.data.length < limit) {
      break;
    }
    offset += limit;
  }
  
  // Success - return activities data without verbose logging
  return allActivities;
}

function convertClioActivitiesToWIP(activities) {
  if (!Array.isArray(activities)) return [];
  
  return activities.map(activity => {
    // Round up quantity_in_hours to one decimal place (matching Azure Function)
    const quantity = activity.quantity_in_hours !== undefined 
      ? Math.ceil(activity.quantity_in_hours * 10) / 10 
      : undefined;
    
    return {
      id: activity.id || 0,
      date: activity.date || undefined,
      created_at: activity.created_at || undefined,
      updated_at: activity.updated_at || undefined,
      type: activity.type || undefined,
      matter: activity.matter || undefined,
      quantity_in_hours: quantity,
      note: activity.note || undefined,
      total: activity.total || undefined,
      price: activity.price || undefined,
      expense_category: activity.expense_category || null,
      activity_description: activity.activity_description || undefined,
      user: activity.user || undefined,
      bill: activity.bill || undefined,
      billed: activity.billed || undefined,
    };
  });
}

// Helper functions for date handling and ranges

async function fetchRecoveredFees({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    const result = await request.query(`
      SELECT 
        matter_id,
        bill_id,
        contact_id,
        id,
        date,
        created_at,
        kind,
        type,
        activity_type,
        description,
        sub_total,
        tax,
        secondary_tax,
        user_id,
        user_name,
        payment_allocated,
        CONVERT(VARCHAR(10), payment_date, 120) AS payment_date
      FROM [dbo].[collectedTime]
      WHERE payment_date BETWEEN @dateFrom AND @dateTo
      ORDER BY payment_date DESC
    `);
    if (!Array.isArray(result.recordset)) {
      return [];
    }
    return result.recordset.map((row) => {
      if (row.payment_allocated != null) {
        const value = Number(row.payment_allocated);
        if (!Number.isNaN(value)) {
          row.payment_allocated = value;
        }
      }
      return row;
    });
  });
}

async function fetchRecoveredFeesSummary({ connectionString, entraId, clioId, firm }) {
  // Firm-wide mode: skip user resolution and query all collected time
  if (firm) {
    console.log('[RecoveredFees] Firm-wide query (no user filter)');
  } else {
    var effectiveClioId = typeof clioId === 'number' ? clioId : null;

    if (!effectiveClioId && entraId && connectionString) {
      try {
        const userData = await withRequest(connectionString, async (request, sqlClient) => {
          request.input('entraId', sqlClient.NVarChar, entraId);
          const result = await request.query(`
            SELECT [Clio ID]
            FROM [dbo].[team]
            WHERE [Entra ID] = @entraId
          `);
          return Array.isArray(result.recordset) ? result.recordset : [];
        });
        const resolved = userData?.[0]?.['Clio ID'];
        if (resolved != null) {
          const parsed = Number(resolved);
          if (!Number.isNaN(parsed)) {
            effectiveClioId = parsed;
          }
        }
      } catch (lookupError) {
        console.warn('Failed to resolve Clio ID for recovered fees summary:', lookupError.message);
      }
    }

    if (!effectiveClioId) {
      console.log('[RecoveredFees] No Clio ID found, returning zeros');
      return {
        currentMonthTotal: 0,
        previousMonthTotal: 0,
      };
    }

    console.log(`[RecoveredFees] Querying for Clio ID: ${effectiveClioId}`);
  }

  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  currentStart.setHours(0, 0, 0, 0);
  currentEnd.setHours(23, 59, 59, 999);

  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  previousStart.setHours(0, 0, 0, 0);
  previousEnd.setHours(23, 59, 59, 999);

  console.log(`[RecoveredFees] Date ranges: Current=${formatDateOnly(currentStart)} to ${formatDateOnly(currentEnd)}, Prev=${formatDateOnly(previousStart)} to ${formatDateOnly(previousEnd)}`);

  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('prevStart', sqlClient.Date, formatDateOnly(previousStart));
    request.input('prevEnd', sqlClient.Date, formatDateOnly(previousEnd));
    request.input('currentStart', sqlClient.Date, formatDateOnly(currentStart));
    request.input('currentEnd', sqlClient.Date, formatDateOnly(currentEnd));

    if (!firm) {
      request.input('userId', sqlClient.Int, effectiveClioId);
    }

    const result = await request.query(`
      SELECT
        SUM(CASE WHEN payment_date BETWEEN @currentStart AND @currentEnd THEN payment_allocated ELSE 0 END) AS current_total,
        SUM(CASE WHEN payment_date BETWEEN @prevStart AND @prevEnd THEN payment_allocated ELSE 0 END) AS prev_total
      FROM [dbo].[collectedTime]
      WHERE payment_date BETWEEN @prevStart AND @currentEnd
        ${firm ? '' : 'AND user_id = @userId'}
    `);

    const record = Array.isArray(result.recordset) && result.recordset.length > 0
      ? result.recordset[0]
      : { current_total: 0, prev_total: 0 };

    const currentTotal = Number(record.current_total) || 0;
    const previousTotal = Number(record.prev_total) || 0;
    // collectedTime tracks payments, not time entries — hours not available from this table
    const currentHours = 0;
    const previousHours = 0;

    console.log(`[RecoveredFees] Results${firm ? ' (FIRM)' : ` for Clio ID ${effectiveClioId}`}: Current=${currentTotal} (${currentHours}h), Previous=${previousTotal} (${previousHours}h)`);

    return {
      currentMonthTotal: currentTotal,
      previousMonthTotal: previousTotal,
      currentMonthHours: currentHours,
      previousMonthHours: previousHours,
    };
  });
}

function getLast24MonthsRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 23, 1);
  start.setHours(0, 0, 0, 0);
  return { from: start, to: end };
}

function getLast24MonthsExcludingCurrentWeek() {
  const now = new Date();
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const currentWeekStart = new Date(current);
  currentWeekStart.setDate(current.getDate() + diff);
  const rangeEnd = new Date(currentWeekStart);
  rangeEnd.setDate(currentWeekStart.getDate() - 1);
  rangeEnd.setHours(23, 59, 59, 999);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setMonth(rangeStart.getMonth() - 24, 1);
  rangeStart.setHours(0, 0, 0, 0);
  return { from: rangeStart, to: rangeEnd };
}

function formatDateOnly(date) {
  return date.toISOString().split('T')[0];
}

// Monday 00:00:00 to Sunday 23:59:59.999 of current week
function getCurrentWeekBounds() {
  const now = new Date();
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(current);
  start.setDate(current.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function enumerateDateKeys(from, to) {
  const keys = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    keys.push(formatDateOnly(d));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

// --- Local helpers to normalize and aggregate WIP entries into daily totals ---
function toDayKey(input) {
  if (typeof input !== 'string') {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return formatDateOnly(d);
    return '';
  }
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return formatDateOnly(d);
  return '';
}

function parseDateOnlyLocal(s) {
  const m = typeof s === 'string' && s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function isDateInRange(dateStr, startDate, endDate) {
  const date = parseDateOnlyLocal(dateStr);
  return date >= startDate && date <= endDate;
}

function aggregateDailyData(activities, rangeStart, rangeEnd) {
  const daily = {};
  if (!Array.isArray(activities)) return daily;
  for (const a of activities) {
    const rawDate = a.date || a.created_at || a.updated_at;
    const key = toDayKey(rawDate);
    if (!key) continue;
    if (!isDateInRange(key, rangeStart, rangeEnd)) continue;
    if (!daily[key]) daily[key] = { total_hours: 0, total_amount: 0 };
    const hours = typeof a.quantity_in_hours === 'number'
      ? a.quantity_in_hours
      : Number(a.quantity_in_hours);
    const amount = typeof a.total === 'number' ? a.total : Number(a.total);
    if (!Number.isNaN(hours)) daily[key].total_hours += hours;
    if (!Number.isNaN(amount)) daily[key].total_amount += amount;
  }
  return daily;
}

// Deal/pitch data for Meta metrics conversion tracking
async function fetchDeals({ connectionString }) {
  try {
    // Use the instructions database connection string
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      return [];
    }

    return withRequest(instructionsConnStr, async (request, sqlClient) => {
      const result = await request.query(`
        SELECT TOP 2000 DealId, InstructionRef, ProspectId, ServiceDescription, Amount, AreaOfWork,
               PitchedBy, PitchedDate, PitchedTime, Status, IsMultiClient, LeadClientEmail,
               LeadClientId, CloseDate, CloseTime, PitchValidUntil
        FROM [dbo].[Deals] WITH (NOLOCK)
        ORDER BY PitchedDate DESC, DealId DESC
      `);
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    });
  } catch (error) {
    console.error('[Reporting] Deals fetch error:', error);
    return [];
  }
}

// Instruction data for conversion funnel tracking
async function fetchInstructions({ connectionString }) {
  try {
    // Use the instructions database connection string
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      return [];
    }

    return withRequest(instructionsConnStr, async (request, sqlClient) => {
      const result = await request.query(`
        SELECT TOP 2000 InstructionRef, Stage, SubmissionDate, SubmissionTime, LastUpdated,
               MatterId, ClientId, Email, FirstName, LastName, Phone, InternalStatus
        FROM [dbo].[Instructions] WITH (NOLOCK)
        ORDER BY SubmissionDate DESC, InstructionRef DESC
      `);
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    });
  } catch (error) {
    console.error('[Reporting] Instructions fetch error:', error);
    return [];
  }
}

/**
 * Fetch Dubber call recordings with enquiry cross-reference and summaries.
 * Queries Instructions DB (dubber_recordings, dubber_recording_summaries)
 * and Core Data DB (enquiries) for phone-based matching.
 */
async function fetchDubberCalls() {
  const instrConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const coreConnStr = process.env.SQL_CONNECTION_STRING;
  if (!instrConnStr) return [];

  try {
    // 1) Pull recordings + summaries from Instructions DB
    const recordings = await withRequest(instrConnStr, async (request) => {
      const result = await request.query(`
        SELECT
          r.recording_id,
          r.from_party,
          r.from_label,
          r.to_party,
          r.to_label,
          r.call_type,
          r.recording_type,
          r.duration_seconds,
          r.start_time_utc,
          r.document_sentiment_score,
          r.ai_document_sentiment,
          r.channel,
          r.status,
          r.matched_team_initials,
          r.matched_team_email,
          r.match_strategy,
          r.document_emotion_json,
          s.summary_text
        FROM [dbo].[dubber_recordings] r WITH (NOLOCK)
        LEFT JOIN [dbo].[dubber_recording_summaries] s WITH (NOLOCK)
          ON r.recording_id = s.recording_id AND s.summary_source = 'dubber_ai'
        ORDER BY r.start_time_utc DESC
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });

    if (!recordings.length) return [];

    // 1b) Pull all transcript sentences in one query
    const transcriptRows = await withRequest(instrConnStr, async (request) => {
      const result = await request.query(`
        SELECT recording_id, sentence_index, speaker, content, sentiment
        FROM [dbo].[dubber_transcript_sentences] WITH (NOLOCK)
        ORDER BY recording_id, sentence_index
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });

    // Build recording_id → sentences lookup
    const transcriptMap = new Map();
    for (const row of transcriptRows) {
      if (!transcriptMap.has(row.recording_id)) transcriptMap.set(row.recording_id, []);
      transcriptMap.get(row.recording_id).push({
        sentence_index: row.sentence_index,
        speaker: row.speaker || null,
        content: row.content || '',
        sentiment: row.sentiment != null ? Number(row.sentiment) : null,
      });
    }

    // 2) Pull Core Data enquiries for phone cross-referencing
    let enquiries = [];
    if (coreConnStr) {
      try {
        enquiries = await withRequest(coreConnStr, async (request) => {
          const result = await request.query(`
            SELECT ID, First_Name, Last_Name, Phone_Number, Area_of_Work
            FROM [dbo].[enquiries] WITH (NOLOCK)
            WHERE Phone_Number IS NOT NULL AND LEN(Phone_Number) > 6
          `);
          return Array.isArray(result.recordset) ? result.recordset : [];
        });
      } catch { /* non-fatal — proceed without enquiry matches */ }
    }

    // 3) Build normalised phone → enquiry lookup
    const normDigits = (raw) => {
      if (!raw) return '';
      let d = raw.replace(/\D/g, '');
      if (d.startsWith('44')) d = d.slice(2);
      if (d.startsWith('0')) d = d.slice(1);
      return d;
    };

    const phoneMap = new Map();
    const nameMap = new Map();
    for (const e of enquiries) {
      const entry = {
        name: [e.First_Name, e.Last_Name].filter(Boolean).join(' '),
        id: e.ID,
        aow: e.Area_of_Work,
      };
      const nd = normDigits(e.Phone_Number);
      if (nd.length >= 7) phoneMap.set(nd, entry);
      if (entry.name) nameMap.set(entry.name.toLowerCase(), entry);
    }

    // 4) Enrich recordings
    // Helper: detect if a string looks like a phone number (digits, +, spaces, dashes)
    const looksLikePhone = (s) => s && /^\+?[\d\s\-().]{7,}$/.test(s.trim());

    return recordings.map((r) => {
      // Determine if internal (both parties matched to team members or same domain)
      const is_internal = !!(r.matched_team_initials && r.match_strategy === 'internal');

      // Try phone match — pick whichever party field contains a phone number
      const candidates = [r.from_party, r.to_party, r.from_label, r.to_label].filter(Boolean);
      const phoneCandidates = candidates.filter(looksLikePhone);
      // Also try name-based matching on non-phone candidates
      const nameCandidates = candidates.filter(c => !looksLikePhone(c));

      let match;
      // First: try phone number matching
      for (const p of phoneCandidates) {
        const nd = normDigits(p);
        if (nd.length >= 7) { match = phoneMap.get(nd); if (match) break; }
      }
      // Fallback: try name matching against enquiry names
      if (!match) {
        for (const n of nameCandidates) {
          match = nameMap.get(n.toLowerCase().trim());
          if (match) break;
        }
      }

      return {
        recording_id: r.recording_id,
        from_party: r.from_party,
        from_label: r.from_label,
        to_party: r.to_party,
        to_label: r.to_label,
        call_type: r.call_type,
        recording_type: r.recording_type || null,
        duration_seconds: r.duration_seconds,
        start_time_utc: r.start_time_utc,
        document_sentiment_score: r.document_sentiment_score,
        ai_document_sentiment: r.ai_document_sentiment,
        channel: r.channel,
        status: r.status,
        matched_team_initials: r.matched_team_initials,
        matched_team_email: r.matched_team_email,
        match_strategy: r.match_strategy,
        document_emotion_json: r.document_emotion_json,
        is_internal,
        resolved_name: match?.name || null,
        enquiry_ref: match?.id ? String(match.id) : null,
        area_of_work: match?.aow || null,
        summary_text: r.summary_text || null,
        transcript: transcriptMap.get(r.recording_id) || [],
      };
    });
  } catch (error) {
    console.error('[Reporting] DubberCalls fetch error:', error);
    return [];
  }
}

module.exports = router;
