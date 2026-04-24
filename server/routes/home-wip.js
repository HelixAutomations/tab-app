/**
 * /api/home-wip
 * 
 * Dedicated endpoint for Home page time metrics.
 * Returns only the current user's aggregated daily WIP for current + last week.
 * 
 * Design goals:
 * - Fast: minimal payload (no individual activities)
 * - Resilient: aggressive cache + stale-on-error fallback
 * - Isolated: doesn't share failure domain with heavy reporting routes
 */

const express = require('express');
const fetch = require('node-fetch');
const { withRequest } = require('../utils/db');
const { getRedisClient, generateCacheKey, setCache, getCache } = require('../utils/redisClient');
const { getClient } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();
const { annotate } = require('../utils/devConsole');

// Cache TTL: 60s fresh for individual, 120s for team aggregate
const CACHE_TTL_SECONDS = 60;
const TEAM_CACHE_TTL_SECONDS = 120;
const TEAM_STALE_SERVE_WINDOW_MS = Number(process.env.HOME_WIP_TEAM_STALE_SERVE_WINDOW_MS || 15 * 60 * 1000);
// Keep stale data for longer so transient Key Vault / Clio blips don't zero the UI.
// Freshness is still governed by CACHE_TTL_SECONDS; this just controls fallback retention.
const STALE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

// Periodic pre-warm of the team aggregate cache. With TEAM_CACHE_TTL_SECONDS=120
// and a 15min stale-serve window, any dev-owner Home boot after ~15min idle
// triggers a cold Clio fan-out across the whole team. A modest background
// refresh keeps the cache permanently warm in production for negligible cost.
// Override via HOME_WIP_TEAM_PREWARM_INTERVAL_MS=0 to disable.
const TEAM_PREWARM_INTERVAL_MS = Number(
  process.env.HOME_WIP_TEAM_PREWARM_INTERVAL_MS
  ?? 90 * 1000,
);

// In-memory fallback when Redis unavailable
const memoryCache = new Map();

// De-dup concurrent fetches for the same cache key.
// Prevents duplicate Clio API calls when multiple requests hit the same cache miss.
const inflightRequests = new Map();

/**
 * GET /api/home-wip?entraId=<uuid>
 * 
 * Returns: {
 *   current_week: { daily_data: { "2026-01-06": { hours, value }, ... } },
 *   last_week:    { daily_data: { "2025-12-30": { hours, value }, ... } },
 *   cached: boolean,
 *   stale: boolean
 * }
 */
router.get('/', async (req, res) => {
  const entraId = typeof req.query.entraId === 'string' && req.query.entraId.trim()
    ? req.query.entraId.trim()
    : null;

  if (!entraId) {
    return res.status(400).json({ error: 'entraId query parameter required' });
  }

  const cacheKey = generateCacheKey('homeWip', entraId);
  const connectionString = process.env.SQL_CONNECTION_STRING;

  // Try cache first
  try {
    const cached = await getCached(cacheKey);
    if (cached && !cached.stale) {
      annotate(res, { source: 'redis', note: `TTL ${CACHE_TTL_SECONDS}s` });
      return res.json({ ...cached.data, cached: true, stale: false });
    }

    // Fetch fresh data (de-dup concurrent requests for same user)
    let freshData;
    if (inflightRequests.has(cacheKey)) {
      freshData = await inflightRequests.get(cacheKey);
    } else {
      const inFlight = fetchUserWipTwoWeeks(connectionString, entraId)
        .finally(() => inflightRequests.delete(cacheKey));
      inflightRequests.set(cacheKey, inFlight);
      freshData = await inFlight;
    }

    // Store in cache (don't await – fire and forget)
    setCached(cacheKey, freshData).catch((err) => {
      console.warn('[home-wip] Cache set failed:', err.message);
    });

    annotate(res, { source: 'clio', note: 'fresh from Clio API' });
    return res.json({ ...freshData, cached: false, stale: false });
  } catch (err) {
    console.error('[home-wip] Fetch failed:', err && err.stack ? err.stack : err.message);

    // Try stale cache as fallback
    try {
      const stale = await getCached(cacheKey, true);
      if (stale) {
        annotate(res, { source: 'stale', note: 'error fallback — stale redis' });
        console.log('[home-wip] Returning stale cache after error');
        return res.json({ ...stale.data, cached: true, stale: true });
      }
    } catch { /* ignore */ }

    // No stale data available – return empty structure
    return res.status(200).json({
      current_week: { daily_data: {} },
      last_week: { daily_data: {} },
      cached: false,
      stale: false,
      error: 'Failed to fetch WIP data',
      // Helpful locally; avoid leaking internals in prod.
      ...(process.env.NODE_ENV !== 'production' && err?.message ? { errorDetail: err.message } : {}),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch logic
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUserWipTwoWeeks(connectionString, entraId) {
  // Resolve Clio ID from Entra ID
  const clioId = await resolveClioId(connectionString, entraId);
  if (!clioId) {
    console.warn('[home-wip] No Clio ID found for', entraId);
    return { current_week: { daily_data: {} }, last_week: { daily_data: {} } };
  }
  return fetchUserWipTwoWeeksWithClioId(clioId);
}

/**
 * Fetch two weeks of WIP data when Clio ID is already known.
 * Skips the resolveClioId SQL query.
 */
async function fetchUserWipTwoWeeksWithClioId(clioId) {
  // Calculate date ranges
  const { currentStart, currentEnd, lastStart, lastEnd } = getTwoWeekBounds();

  // Fetch both weeks in parallel, with a 401 retry that forces a token refresh.
  // Clio access tokens can be invalidated unexpectedly (e.g. refresh-token rotation),
  // so we must not keep serving cached 401s until TTL expiry.
  const fetchWeek = async (start, end) => {
    let accessToken = await getClioAccessToken(false);
    try {
      return await fetchClioActivities(accessToken, clioId, start, end);
    } catch (err) {
      const status = err?.status || err?.responseStatus;
      const is401 = status === 401 || String(err?.message || '').includes('401');
      if (!is401) throw err;

      // Token refresh is de-duped — all concurrent 401s share one OAuth call
      accessToken = await getClioAccessToken(true);
      return await fetchClioActivities(accessToken, clioId, start, end);
    }
  };

  const [currentActivities, lastActivities] = await Promise.all([
    fetchWeek(currentStart, currentEnd),
    fetchWeek(lastStart, lastEnd),
  ]);

  // Aggregate to daily totals
  const currentDaily = aggregateDailyTotals(currentActivities, currentStart, currentEnd);
  const lastDaily = aggregateDailyTotals(lastActivities, lastStart, lastEnd);

  return {
    current_week: { daily_data: currentDaily },
    last_week: { daily_data: lastDaily },
  };
}

async function resolveClioId(connectionString, entraId) {
  if (!connectionString) return null;

  try {
    const result = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('entraId', sqlClient.NVarChar, entraId);
      const res = await request.query(`
        SELECT [Clio ID] FROM [dbo].[team] WHERE [Entra ID] = @entraId
      `);
      return res.recordset?.[0]?.['Clio ID'] || null;
    });
    return result;
  } catch (err) {
    console.error('[home-wip] Failed to resolve Clio ID:', err.message);
    return null;
  }
}

function getTwoWeekBounds() {
  const now = new Date();
  
  // Current week: Monday 00:00 to now
  const currentStart = new Date(now);
  const day = currentStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  currentStart.setDate(currentStart.getDate() + diff);
  currentStart.setHours(0, 0, 0, 0);
  
  const currentEnd = now;

  // Last week: previous Monday 00:00 to previous Sunday 23:59
  const lastStart = new Date(currentStart);
  lastStart.setDate(lastStart.getDate() - 7);
  
  const lastEnd = new Date(currentStart);
  lastEnd.setDate(lastEnd.getDate() - 1);
  lastEnd.setHours(23, 59, 59, 999);

  return { currentStart, currentEnd, lastStart, lastEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clio API (matches reporting.js credential pattern)
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache for credentials and token
const cache = new Map();
let inflightCredentialsFetch = null;

// Timeout helper
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function getClioCredentialsCached() {
  const cacheKey = 'clio:credentials';
  
  // Try Redis first
  const redis = await getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get('homeWip:' + cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch { /* ignore */ }
  }
  
  // Fallback to memory cache
  const memCached = cache.get(cacheKey);
  if (memCached && memCached.expires > Date.now()) {
    return memCached.data;
  }

  if (inflightCredentialsFetch) {
    return inflightCredentialsFetch;
  }
  
  // Fetch from Key Vault (use PBI credentials like reporting.js)
  inflightCredentialsFetch = (async () => {
    console.log('[home-wip] Fetching credentials from Key Vault...');
    const client = getClient();
    const [refreshTokenSecret, clientSecret, clientIdSecret] = await withTimeout(
      Promise.all([
        client.getSecret('clio-pbi-refreshtoken'),
        client.getSecret('clio-pbi-secret'),
        client.getSecret('clio-pbi-clientid'),
      ]),
      15000,
      'Key Vault credentials fetch'
    );
    console.log('[home-wip] Key Vault credentials fetched successfully');

    const credentials = {
      refreshToken: refreshTokenSecret.value,
      clientSecret: clientSecret.value,
      clientId: clientIdSecret.value,
    };

    const expiryTime = Date.now() + 60 * 60 * 1000;
    cache.set(cacheKey, { data: credentials, expires: expiryTime });

    if (redis) {
      try {
        await redis.setEx('homeWip:' + cacheKey, 3600, JSON.stringify(credentials));
      } catch { /* ignore */ }
    }

    return credentials;
  })();

  try {
    return await inflightCredentialsFetch;
  } finally {
    inflightCredentialsFetch = null;
  }
}

// De-dup forced token refresh: only one Clio OAuth call at a time.
let inflightTokenRefresh = null;

async function getClioAccessToken(forceRefresh = false) {
  if (!forceRefresh) {
    return getClioAccessTokenInternal(false);
  }
  // Piggyback on an existing refresh if one is already in-flight
  if (inflightTokenRefresh) {
    return inflightTokenRefresh;
  }
  inflightTokenRefresh = getClioAccessTokenInternal(true)
    .finally(() => { inflightTokenRefresh = null; });
  return inflightTokenRefresh;
}

async function clearClioAccessTokenCache() {
  try {
    cache.delete('clio:accessToken');
  } catch { /* ignore */ }

  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del('homeWip:clio:accessToken');
    } catch { /* ignore */ }
  }
}

async function getClioAccessTokenInternal(forceRefresh = false) {
  const tokenCacheKey = 'clio:accessToken';
  
  const redis = await getRedisClient();
  if (!forceRefresh) {
    // Try Redis first
    if (redis) {
      try {
        const cached = await redis.get('homeWip:' + tokenCacheKey);
        if (cached) return cached;
      } catch { /* ignore */ }
    }
    
    // Fallback to memory cache
    const memCached = cache.get(tokenCacheKey);
    if (memCached && memCached.expires > Date.now()) {
      return memCached.data;
    }
  } else {
    // Force refresh: clear any cached token before requesting a new one
    console.warn('[home-wip] Clio 401 detected; refreshing access token...');
    try { cache.delete(tokenCacheKey); } catch { /* ignore */ }
    if (redis) {
      try { await redis.del('homeWip:' + tokenCacheKey); } catch { /* ignore */ }
    }
  }
  
  // Get credentials and refresh token
  const { clientId, clientSecret, refreshToken } = await getClioCredentialsCached();
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  
  const response = await fetch(`https://eu.app.clio.com/oauth/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[home-wip] Failed to refresh Clio token (${response.status}):`, errorText);
    throw new Error(`Failed to obtain Clio access token (${response.status})`);
  }
  
  const tokenData = await response.json();
  const accessToken = tokenData.access_token;
  
  // Store new refresh token if changed
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    console.log('[home-wip] Storing new Clio refresh token to Key Vault');
    try {
      const client = getClient();
      await withTimeout(
        client.setSecret('clio-pbi-refreshtoken', tokenData.refresh_token),
        10000,
        'Key Vault refresh token update'
      );
    } catch (kvError) {
      console.error('[home-wip] Failed to update refresh token:', kvError.message);
    }
  }
  
  // Cache token (30min TTL, conservative)
  const expiresInSeconds = tokenData.expires_in || 3600;
  const cacheTtl = Math.min(expiresInSeconds - 300, 30 * 60);
  
  cache.set(tokenCacheKey, { data: accessToken, expires: Date.now() + cacheTtl * 1000 });
  
  if (redis) {
    try {
      await redis.setEx('homeWip:' + tokenCacheKey, cacheTtl, accessToken);
    } catch { /* ignore */ }
  }
  
  return accessToken;
}

async function fetchClioActivities(accessToken, clioId, startDate, endDate) {
  const activities = [];
  let offset = 0;
  const limit = 200;
  const fields = 'id,date,quantity_in_hours,total,price,type,note,matter{display_number,description},activity_description{name}';
  const baseUrl = 'https://eu.app.clio.com/api/v4/activities.json';

  // Filter by the activity's work date (start_date / end_date), NOT by record creation
  // timestamps. Using created_since/created_before misses any time logged retroactively
  // (e.g. Monday's hours entered on Tuesday) and was causing Home tiles to render as
  // zero for users who hadn't re-logged time in the current window. Matches the
  // pattern used in dataOperations.js::Clio WIP validate.
  const formatDay = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  while (true) {
    const params = new URLSearchParams({
      start_date: formatDay(startDate),
      end_date: formatDay(endDate),
      user_id: clioId.toString(),
      fields,
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(`${baseUrl}?${params}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const error = new Error(`Clio API error: ${resp.status}`);
        error.status = resp.status;
        throw error;
      }

      const data = await resp.json();
      if (data.data && Array.isArray(data.data)) {
        activities.push(...data.data);
      }

      if (!data.meta?.paging?.next || data.data.length < limit) {
        break;
      }
      offset += limit;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  return activities;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────────────────

function aggregateDailyTotals(activities, rangeStart, rangeEnd) {
  const daily = {};

  // Initialize all days in range with zeros
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const key = formatDayKey(cursor);
    // Use field names that match what the client expects
    daily[key] = { total_hours: 0, total_amount: 0, entries: [] };
    cursor.setDate(cursor.getDate() + 1);
  }

  // Sum activities into their respective days
  for (const act of activities) {
    const dateStr = act.date;
    if (!dateStr) continue;

    const key = dateStr.substring(0, 10); // "YYYY-MM-DD"
    if (!daily[key]) continue;

    const hours = typeof act.quantity_in_hours === 'number'
      ? Math.ceil(act.quantity_in_hours * 10) / 10
      : 0;
    const value = typeof act.total === 'number' ? act.total : 0;

    daily[key].total_hours += hours;
    daily[key].total_amount += value;

    // Carry per-entry detail for the client
    daily[key].entries.push({
      hours,
      value,
      type: act.type || undefined,
      note: act.note || undefined,
      matter: act.matter?.display_number || undefined,
      matterDesc: act.matter?.description || undefined,
      activity: act.activity_description?.name || undefined,
    });
  }

  // Round final values
  for (const key of Object.keys(daily)) {
    daily[key].total_hours = Math.round(daily[key].total_hours * 10) / 10;
    daily[key].total_amount = Math.round(daily[key].total_amount * 100) / 100;
  }

  return daily;
}

function formatDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Caching
// ─────────────────────────────────────────────────────────────────────────────

async function getCached(key, allowStale = false, ttlOverride) {
  const ttl = ttlOverride || CACHE_TTL_SECONDS;
  const redis = await getRedisClient();

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed.timestamp || 0);
        const stale = age > ttl * 1000;

        if (!stale || allowStale) {
          return { data: parsed.data, stale, ageMs: age };
        }
      }
    } catch { /* ignore */ }
  }

  // Fallback to memory cache
  const mem = memoryCache.get(key);
  if (mem) {
    const age = Date.now() - mem.timestamp;
    const stale = age > ttl * 1000;
    if (!stale || allowStale) {
      return { data: mem.data, stale, ageMs: age };
    }
  }

  return null;
}

async function setCached(key, data, ttlOverride) {
  const entry = { data, timestamp: Date.now() };

  // Memory cache (always)
  memoryCache.set(key, entry);

  // Redis (if available)
  const redis = await getRedisClient();
  if (redis && typeof redis.setEx === 'function') {
    await redis.setEx(key, STALE_TTL_SECONDS, JSON.stringify(entry));
  }
}

// Export warmup function so server can pre-warm Key Vault credentials at startup
router.warmupClioCredentials = () => getClioCredentialsCached();

// ─────────────────────────────────────────────────────────────────────────────
// Team aggregation mode
// ─────────────────────────────────────────────────────────────────────────────

async function buildTeamAggregateData(connectionString) {
  const teamMembers = await withRequest(connectionString, async (request) => {
    const result = await request.query(`
      SELECT [Entra ID], [Clio ID], [First], [Initials]
      FROM [dbo].[team]
      WHERE [Entra ID] IS NOT NULL AND [Entra ID] <> ''
        AND [Clio ID] IS NOT NULL AND [Clio ID] <> ''
    `);
    return result.recordset || [];
  });

  if (!teamMembers || teamMembers.length === 0) {
    return {
      current_week: { daily_data: {} },
      last_week: { daily_data: {} },
      memberCount: 0,
      requestedMemberCount: 0,
    };
  }

  const CONCURRENCY = 8;
  const results = [];
  for (let i = 0; i < teamMembers.length; i += CONCURRENCY) {
    const chunk = teamMembers.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.allSettled(
      chunk.map((member) => {
        const entraId = member['Entra ID'];
        const clioId = member['Clio ID'];
        const userCacheKey = generateCacheKey('homeWip', entraId);
        return getCached(userCacheKey).then((userCached) => {
          if (userCached && !userCached.stale) return userCached.data;
          if (inflightRequests.has(userCacheKey)) return inflightRequests.get(userCacheKey);
          const inFlight = fetchUserWipTwoWeeksWithClioId(clioId).then((freshData) => {
            setCached(userCacheKey, freshData).catch(() => {});
            return freshData;
          }).finally(() => inflightRequests.delete(userCacheKey));
          inflightRequests.set(userCacheKey, inFlight);
          return inFlight;
        });
      })
    );
    results.push(...chunkResults);
  }

  const { currentStart, currentEnd, lastStart, lastEnd } = getTwoWeekBounds();
  const aggregatedCurrent = {};
  const aggregatedLast = {};

  const initDays = (store, start, end) => {
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = formatDayKey(cursor);
      store[key] = { total_hours: 0, total_amount: 0, entries: [] };
      cursor.setDate(cursor.getDate() + 1);
    }
  };
  initDays(aggregatedCurrent, currentStart, currentEnd);
  initDays(aggregatedLast, lastStart, lastEnd);

  let successCount = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    successCount++;
    const data = result.value;

    const cDaily = data.current_week?.daily_data || {};
    for (const [day, vals] of Object.entries(cDaily)) {
      if (!aggregatedCurrent[day]) aggregatedCurrent[day] = { total_hours: 0, total_amount: 0, entries: [] };
      aggregatedCurrent[day].total_hours += vals.total_hours || 0;
      aggregatedCurrent[day].total_amount += vals.total_amount || 0;
      if (vals.entries) aggregatedCurrent[day].entries.push(...vals.entries);
    }

    const lDaily = data.last_week?.daily_data || {};
    for (const [day, vals] of Object.entries(lDaily)) {
      if (!aggregatedLast[day]) aggregatedLast[day] = { total_hours: 0, total_amount: 0, entries: [] };
      aggregatedLast[day].total_hours += vals.total_hours || 0;
      aggregatedLast[day].total_amount += vals.total_amount || 0;
      if (vals.entries) aggregatedLast[day].entries.push(...vals.entries);
    }
  }

  for (const day of Object.keys(aggregatedCurrent)) {
    aggregatedCurrent[day].total_hours = Math.round(aggregatedCurrent[day].total_hours * 10) / 10;
    aggregatedCurrent[day].total_amount = Math.round(aggregatedCurrent[day].total_amount * 100) / 100;
  }
  for (const day of Object.keys(aggregatedLast)) {
    aggregatedLast[day].total_hours = Math.round(aggregatedLast[day].total_hours * 10) / 10;
    aggregatedLast[day].total_amount = Math.round(aggregatedLast[day].total_amount * 100) / 100;
  }

  return {
    current_week: { daily_data: aggregatedCurrent },
    last_week: { daily_data: aggregatedLast },
    memberCount: successCount,
    requestedMemberCount: teamMembers.length,
  };
}

async function refreshTeamAggregateCache(connectionString, cacheKey, triggeredBy) {
  const operation = 'home-wip-team-aggregate';
  const startedAt = Date.now();

  trackEvent('HomeWip.TeamAggregate.Started', {
    operation,
    triggeredBy,
  });

  try {
    const freshData = await buildTeamAggregateData(connectionString);
    await setCached(cacheKey, freshData, TEAM_CACHE_TTL_SECONDS);

    const durationMs = Date.now() - startedAt;
    trackEvent('HomeWip.TeamAggregate.Completed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      memberCount: String(freshData.memberCount || 0),
      requestedMemberCount: String(freshData.requestedMemberCount || 0),
    });
    trackMetric('HomeWip.TeamAggregate.Duration', durationMs, {
      operation,
      triggeredBy,
    });

    return freshData;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      operation,
      phase: 'aggregate-refresh',
      triggeredBy,
      durationMs: String(durationMs),
    });
    trackEvent('HomeWip.TeamAggregate.Failed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      error: error?.message || String(error),
    });
    throw error;
  }
}

function getOrStartTeamAggregateRefresh(connectionString, cacheKey, triggeredBy) {
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const inFlight = refreshTeamAggregateCache(connectionString, cacheKey, triggeredBy)
    .finally(() => inflightRequests.delete(cacheKey));
  inflightRequests.set(cacheKey, inFlight);
  return inFlight;
}

/**
 * GET /api/home-wip/team
 *
 * Returns aggregated WIP data for ALL team members.
 * Same response shape as the individual endpoint so the client
 * can swap seamlessly.
 */
router.get('/team', async (req, res) => {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const cacheKey = generateCacheKey('homeWip', 'team-aggregate');

  try {
    const cached = await getCached(cacheKey, true, TEAM_CACHE_TTL_SECONDS);
    if (cached && !cached.stale) {
      annotate(res, { source: 'redis', note: `team aggregate, TTL ${TEAM_CACHE_TTL_SECONDS}s` });
      return res.json({ ...cached.data, cached: true, stale: false });
    }

    if (cached && cached.stale && (cached.ageMs || 0) <= TEAM_STALE_SERVE_WINDOW_MS) {
      void getOrStartTeamAggregateRefresh(connectionString, cacheKey, 'stale-cache-background').catch((err) => {
        console.warn('[home-wip/team] Background refresh failed:', err.message);
      });

      annotate(res, {
        source: 'stale',
        note: `team aggregate stale ${Math.round((cached.ageMs || 0) / 1000)}s, background refresh`,
      });
      return res.json({ ...cached.data, cached: true, stale: true, refreshing: true });
    }

    const freshData = await getOrStartTeamAggregateRefresh(
      connectionString,
      cacheKey,
      cached ? 'expired-cache-blocking' : 'request-miss'
    );

    annotate(res, {
      source: 'clio',
      note: `team aggregate: ${freshData.memberCount || 0}/${freshData.requestedMemberCount || 0} members`,
    });
    return res.json({ ...freshData, cached: false, stale: false });
  } catch (err) {
    console.error('[home-wip/team] Error:', err?.stack || err?.message);

    // Try stale cache
    try {
      const stale = await getCached(cacheKey, true, TEAM_CACHE_TTL_SECONDS);
      if (stale) {
        return res.json({ ...stale.data, cached: true, stale: true });
      }
    } catch { /* ignore */ }

    return res.status(200).json({
      current_week: { daily_data: {} },
      last_week: { daily_data: {} },
      cached: false,
      stale: false,
      error: 'Failed to fetch team WIP data',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Periodic team aggregate pre-warm
// ─────────────────────────────────────────────────────────────────────────────

let _teamPrewarmTimer = null;

function startTeamWipPrewarm() {
  if (_teamPrewarmTimer) return;
  if (!Number.isFinite(TEAM_PREWARM_INTERVAL_MS) || TEAM_PREWARM_INTERVAL_MS <= 0) {
    trackEvent('HomeWip.TeamAggregate.PrewarmDisabled', { reason: 'interval-non-positive' });
    return;
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    trackEvent('HomeWip.TeamAggregate.PrewarmDisabled', { reason: 'no-sql-connection-string' });
    return;
  }

  const cacheKey = generateCacheKey('homeWip', 'team-aggregate');

  const tick = () => {
    getOrStartTeamAggregateRefresh(connectionString, cacheKey, 'periodic-prewarm').catch((err) => {
      // refreshTeamAggregateCache already logs to App Insights; keep console quiet.
      trackEvent('HomeWip.TeamAggregate.PrewarmTickFailed', {
        error: err?.message || String(err),
      });
    });
  };

  _teamPrewarmTimer = setInterval(tick, TEAM_PREWARM_INTERVAL_MS);
  if (typeof _teamPrewarmTimer.unref === 'function') _teamPrewarmTimer.unref();

  trackEvent('HomeWip.TeamAggregate.PrewarmStarted', {
    intervalMs: String(TEAM_PREWARM_INTERVAL_MS),
  });
}

function stopTeamWipPrewarm() {
  if (_teamPrewarmTimer) {
    clearInterval(_teamPrewarmTimer);
    _teamPrewarmTimer = null;
    trackEvent('HomeWip.TeamAggregate.PrewarmStopped', {});
  }
}

router.startTeamWipPrewarm = startTeamWipPrewarm;
router.stopTeamWipPrewarm = stopTeamWipPrewarm;

module.exports = router;
