const express = require('express');
const { getRedisClient, cacheWrapper, generateCacheKey } = require('../utils/redisClient');

const router = express.Router();

// Import dataset fetchers from the main reporting route
const { withRequest } = require('../utils/db');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const fetch = require('node-fetch');
// Reuse the direct Clio current-week implementation from reporting route to avoid Azure Function fallback
const reportingRoute = require('./reporting');
const { fetchWipClioCurrentWeek: fetchWipClioCurrentWeekDirect } = reportingRoute;

// Re-use the same dataset fetcher functions from reporting.js
// (We'll import these or duplicate the core functions)

// Cache TTL configurations for each dataset (in seconds) - Optimized for performance
const DATASET_TTL = {
  userData: 300,      // 5 min - user data changes rarely
  teamData: 1800,     // 30 min - team data is fairly static
  enquiries: 600,     // 10 min - enquiries update regularly
  allMatters: 900,    // 15 min - matters update moderately
  wip: 1800,          // 30 min - Increased from 5min due to heavy query (was 300)
  recoveredFees: 3600, // 60 min - Increased from 30min due to heavy query (was 1800)
  recoveredFeesSummary: 1800, // 30 min - Increased from 15min (was 900)
  poidData: 3600,     // 60 min - Increased from 30min due to heavy query (was 1800)
  wipClioCurrentWeek: 600,   // 10 min - Increased from 5min (was 300)
  wipDbLastWeek: 1200, // 20 min - Increased from 10min (was 600)
  wipDbCurrentWeek: 600, // 10 min - current week DB fallback
  googleAnalytics: 1800, // 30 min - Google Analytics data updates hourly
  googleAds: 1800,    // 30 min - Google Ads data updates regularly
  deals: 900,         // 15 min - Deal/pitch data for Meta metrics conversion tracking
  instructions: 900,  // 15 min - Instruction data for conversion funnel
};

// Server-Sent Events endpoint for progressive dataset loading
router.get('/stream-datasets', async (req, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no' // Disable buffering on nginx/azure frontends
  });

  // Some proxies need headers flushed early for SSE to start
  if (typeof res.flushHeaders === 'function') {
    try { res.flushHeaders(); } catch { /* ignore */ }
  }

  // Small helper to write SSE events and flush immediately if supported
  function writeSse(obj) {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (typeof res.flush === 'function') {
        try { res.flush(); } catch { /* ignore flush error */ }
      }
    } catch {
      // Ignore write errors (connection likely closed)
    }
  }

  // Keep-alive heartbeat to prevent idle timeouts
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* connection might be closed */ }
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* ignore */ }
  });

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    res.write(`data: ${JSON.stringify({ error: 'SQL connection string not configured' })}\n\n`);
    res.end();
    return;
  }

  const datasetsParam = typeof req.query.datasets === 'string'
    ? req.query.datasets.split(',').map((name) => name.trim()).filter(Boolean)
    : ['userData', 'teamData', 'enquiries', 'allMatters', 'wip', 'recoveredFees', 'poidData', 'wipClioCurrentWeek'];

  const entraId = typeof req.query.entraId === 'string' && req.query.entraId.trim().length > 0
    ? req.query.entraId.trim()
    : null;

  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';

  // Send initial status for all datasets
  // Instruct EventSource to retry if disconnected
  try { res.write('retry: 10000\n\n'); } catch { /* ignore */ }
  writeSse({
    type: 'init',
    datasets: datasetsParam.map(name => ({ name, status: 'loading' }))
  });

  console.log(`🌊 Starting stream for datasets: [${datasetsParam.join(', ')}] with entraId: ${entraId}`);

  // Process each dataset individually with Redis caching
  const processDataset = async (datasetName) => {
    const startTime = Date.now();
    try {
      console.log(`🔍 Processing dataset: ${datasetName}`);
      
      // Send processing status to client
      writeSse({
        type: 'dataset-processing',
        dataset: datasetName,
        status: 'processing'
      });
      
      // Check Redis cache first (unless bypassing)
      let result = null;
      let fromCache = false;

      if (!bypassCache) {
        try {
          const redisClient = await getRedisClient();
          if (redisClient) {
            // For wipClioCurrentWeek we always use team scope; key by 'team' to avoid per-user caching
            const scopeKey = datasetName === 'wipClioCurrentWeek' ? 'team' : (entraId || 'team');
            const cacheKey = generateCacheKey('stream', `${datasetName}:${scopeKey}`);
            const cached = await redisClient.get(cacheKey);
            if (cached) {
              result = JSON.parse(cached);
              fromCache = true;
              const cacheTime = Date.now() - startTime;
              console.log(`📋 Dataset ${datasetName} cache hit (Redis) in ${cacheTime}ms`);
            }
          }
        } catch (redisError) {
          console.warn(`Redis cache read failed for ${datasetName}:`, redisError.message);
        }
      }

      // Fetch from source if not in cache
      if (!result) {
        const fetchStartTime = Date.now();
        const isHeavyDataset = ['wip', 'recoveredFees', 'poidData'].includes(datasetName);
        const timeoutMs = isHeavyDataset ? 120000 : 45000; // 2min for heavy, 45s for light
        
        console.log(`🚀 Fetching ${datasetName} from source (timeout: ${timeoutMs}ms, heavy: ${isHeavyDataset})`);
        
        try {
          result = await Promise.race([
            fetchDatasetByName(datasetName, { connectionString, entraId }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs))
          ]);
          
          const fetchTime = Date.now() - fetchStartTime;
          console.log(`✅ Dataset ${datasetName} fetched in ${fetchTime}ms, result type:`, typeof result, 'array length:', Array.isArray(result) ? result.length : 'not array');
        } catch (fetchError) {
          const fetchTime = Date.now() - fetchStartTime;
          console.error(`❌ Dataset ${datasetName} fetch failed after ${fetchTime}ms:`, fetchError.message);
          throw fetchError;
        }
        
        // Store in Redis cache
        try {
          const redisClient = await getRedisClient();
          if (redisClient) {
            const scopeKey2 = datasetName === 'wipClioCurrentWeek' ? 'team' : (entraId || 'team');
            const cacheKey = generateCacheKey('stream', `${datasetName}:${scopeKey2}`);
            const ttl = DATASET_TTL[datasetName] || 600;
            await redisClient.setEx(cacheKey, ttl, JSON.stringify(result));
            console.log(`📋 Dataset ${datasetName} cached (Redis, TTL: ${ttl}s)`);
          }
        } catch (redisError) {
          console.warn(`Redis cache write failed for ${datasetName}:`, redisError.message);
        }
      }

      // Send completed dataset to client
      const totalTime = Date.now() - startTime;
      writeSse({
        type: 'dataset-complete',
        dataset: datasetName,
        status: 'ready',
        data: result,
        cached: fromCache,
        count: Array.isArray(result) ? result.length : (result ? 1 : 0),
        processingTimeMs: totalTime
      });

      console.log(`✅ Dataset ${datasetName} sent to client (total time: ${totalTime}ms)`);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Dataset ${datasetName} failed after ${totalTime}ms:`, error.message);
      console.error('Full error:', error);
      
      // Send error status to client
      writeSse({
        type: 'dataset-error',
        dataset: datasetName,
        status: 'error',
        error: error.message,
        processingTimeMs: totalTime
      });
    }
  };

  try {
    // Process light datasets in parallel (fast ones)
    const lightDatasets = datasetsParam.filter(d => !['wip', 'recoveredFees', 'poidData'].includes(d));
    const heavyDatasets = datasetsParam.filter(d => ['wip', 'recoveredFees', 'poidData'].includes(d));

    console.log(`🚀 Processing light datasets: [${lightDatasets.join(', ')}]`);
    
    // Process light datasets concurrently
    await Promise.all(lightDatasets.map(processDataset));

    console.log(`🔥 Processing heavy datasets: [${heavyDatasets.join(', ')}]`);
    
    // Process heavy datasets sequentially to avoid overwhelming the system
    for (const dataset of heavyDatasets) {
      await processDataset(dataset);
    }

    // Send completion signal
    console.log(`✅ All datasets completed, sending completion signal`);
    writeSse({ type: 'complete' });
    res.end();
  } catch (globalError) {
    console.error('❌ Global streaming error:', globalError);
    writeSse({ 
      type: 'error', 
      error: 'Stream processing failed: ' + globalError.message 
    });
    res.end();
  }
});

// Dataset fetcher dispatcher
async function fetchDatasetByName(datasetName, { connectionString, entraId, clioId }) {
  switch (datasetName) {
    case 'userData':
      return fetchUserData({ connectionString, entraId });
    case 'teamData':
      return fetchTeamData({ connectionString });
    case 'enquiries':
      return fetchEnquiries({ connectionString });
    case 'allMatters':
      return fetchAllMatters({ connectionString });
    case 'wip':
      return fetchWip({ connectionString });
    case 'recoveredFees':
      return fetchRecoveredFees({ connectionString });
    case 'recoveredFeesSummary':
      return fetchRecoveredFeesSummary({ connectionString, entraId, clioId });
    case 'poidData':
      return fetchPoidData({ connectionString });
    case 'wipClioCurrentWeek':
      return fetchWipClioCurrentWeek({ connectionString, entraId });
    case 'wipDbLastWeek':
      return fetchWipDbLastWeek({ connectionString });
    case 'wipDbCurrentWeek':
      return fetchWipDbCurrentWeek({ connectionString });
    case 'googleAnalytics':
      return fetchGoogleAnalyticsData(3); // Default to 3 months, TODO: parameterize
    case 'googleAds':
      return fetchGoogleAdsData(3); // Default to 3 months, TODO: parameterize
    case 'metaMetrics':
      return fetchMetaMetrics(30); // Default to 30 days, TODO: parameterize
    case 'deals':
      return fetchDeals({ connectionString });
    case 'instructions':
      return fetchInstructions({ connectionString });
    default:
      throw new Error(`Unknown dataset: ${datasetName}`);
  }
}

// Expose dispatcher for external callers (e.g., cache preheater)
// Attach as a property on the router so require('./reporting-stream') can destructure it.
router.fetchDatasetByName = fetchDatasetByName;

// Dataset fetcher functions (duplicated from reporting.js for now)
// TODO: Extract these to a shared module

async function fetchUserData({ connectionString, entraId }) {
  if (!entraId) return null;
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('entraId', sqlClient.NVarChar, entraId);
    const result = await request.query(`
      SELECT [Created Date], [Created Time], [Full Name], [Last], [First], [Nickname],
             [Initials], [Email], [Entra ID], [Clio ID], [Rate], [Role], [AOW],
             [holiday_entitlement], [status]
      FROM [dbo].[team] WHERE [Entra ID] = @entraId
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchTeamData({ connectionString }) {
  return withRequest(connectionString, async (request) => {
    const result = await request.query(`
      SELECT [Created Date], [Created Time], [Full Name], [Last], [First], [Nickname],
             [Initials], [Email], [Entra ID], [Clio ID], [Rate], [Role], [AOW],
             [holiday_entitlement], [status]
      FROM [dbo].[team] ORDER BY [Full Name]
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchEnquiries({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    const result = await request.query(`
      SELECT * FROM [dbo].[enquiries]
      WHERE Touchpoint_Date BETWEEN @dateFrom AND @dateTo
      ORDER BY Touchpoint_Date DESC
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchAllMatters({ connectionString }) {
  return withRequest(connectionString, async (request) => {
    const result = await request.query('SELECT * FROM [dbo].[matters]');
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchWip({ connectionString }) {
  const { from, to } = getLast24MonthsExcludingCurrentWeek();
  console.log(`🔍 WIP Query (paged): ${formatDateOnly(from)} → ${formatDateOnly(to)}`);

  // Page by calendar month to avoid any implicit row caps
  const windows = enumerateMonthlyWindows(from, to);
  const all = [];

  for (const win of windows) {
    // eslint-disable-next-line no-await-in-loop
    const page = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('dateFrom', sqlClient.Date, formatDateOnly(win.start));
      request.input('dateTo', sqlClient.Date, formatDateOnly(win.end));
      const result = await request.query(`
        SELECT id, date,
               CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
               CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
               type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
               expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed
        FROM [dbo].[wip] WITH (NOLOCK)
        WHERE created_at_date BETWEEN @dateFrom AND @dateTo
      `);
      const rows = Array.isArray(result.recordset) ? result.recordset : [];
      return rows.map((row) => {
        if (row.quantity_in_hours != null) {
          const value = Number(row.quantity_in_hours);
          if (!Number.isNaN(value)) row.quantity_in_hours = Math.ceil(value * 10) / 10;
        }
        return row;
      });
    });
    all.push(...page);
  }

  // Sort newest first to match previous behaviour
  all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (Number(b.id || 0) - Number(a.id || 0)));
  console.log(`✅ WIP Query: Combined ${all.length} records across ${windows.length} windows`);
  return all;
}

async function fetchRecoveredFees({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  console.log(`🔍 Recovered Fees Query (paged): ${formatDateOnly(from)} → ${formatDateOnly(to)}`);

  // Page by calendar month to avoid limits
  const windows = enumerateMonthlyWindows(from, to);
  const all = [];

  for (const win of windows) {
    // eslint-disable-next-line no-await-in-loop
    const page = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('dateFrom', sqlClient.Date, formatDateOnly(win.start));
      request.input('dateTo', sqlClient.Date, formatDateOnly(win.end));
      const result = await request.query(`
        SELECT matter_id, bill_id, contact_id, id, date, created_at, kind, type, activity_type,
               description, sub_total, tax, secondary_tax, user_id, user_name, payment_allocated,
               CONVERT(VARCHAR(10), payment_date, 120) AS payment_date
        FROM [dbo].[collectedTime] WITH (NOLOCK)
        WHERE payment_date BETWEEN @dateFrom AND @dateTo
      `);
      const rows = Array.isArray(result.recordset) ? result.recordset : [];
      return rows.map((row) => {
        if (row.payment_allocated != null) {
          const value = Number(row.payment_allocated);
          if (!Number.isNaN(value)) row.payment_allocated = value;
        }
        return row;
      });
    });
    all.push(...page);
  }

  // Newest first
  all.sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)) || (Number(b.id || 0) - Number(a.id || 0)));
  console.log(`✅ Recovered Fees Query: Combined ${all.length} records across ${windows.length} windows`);
  return all;
}

async function fetchRecoveredFeesSummary({ connectionString, entraId, clioId }) {
  // Implementation similar to reporting.js
  return { currentMonthTotal: 0, previousMonthTotal: 0 };
}

async function fetchPoidData({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  console.log(`🔍 POID Query: Fetching data from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
  
  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    
    // Optimized query with performance improvements and reduced field selection
    const result = await request.query(`
      SELECT TOP 5000 poid_id, type, terms_acceptance, submission_url,
             CONVERT(VARCHAR(10), submission_date, 120) AS submission_date,
             id_docs_folder, acid, card_id, poc, nationality_iso, nationality, gender,
             first, last, prefix, date_of_birth, best_number, email, passport_number,
             drivers_license_number, house_building_number, street, city, county,
             post_code, country, country_code, company_name, company_number,
             company_house_building_number, company_street, company_city, company_county,
             company_post_code, company_country, company_country_code, stage, check_result,
             check_id, additional_id_submission_id, additional_id_submission_url,
             additional_id_submission_date, client_id, related_client_id, matter_id,
             risk_assessor, risk_assessment_date
      FROM [dbo].[poid] WITH (NOLOCK)
      WHERE submission_date BETWEEN @dateFrom AND @dateTo
      ORDER BY submission_date DESC, poid_id DESC
    `);
    
    console.log(`✅ POID Query: Retrieved ${result.recordset?.length || 0} records`);
    
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchWipClioCurrentWeek({ connectionString, entraId }) {
  // Management dashboard requires TEAM-WIDE current-week data.
  // Force team scope here regardless of entraId so we don't accidentally fetch only the current user.
  try {
    if (typeof fetchWipClioCurrentWeekDirect === 'function') {
      return await fetchWipClioCurrentWeekDirect({ connectionString, entraId: null });
    }
  } catch (e) {
    console.warn('Direct Clio current-week fetch failed in streaming route:', e.message);
  }
  // Safe empty struct on failure
  return { current_week: { daily_data: {}, activities: [] }, last_week: { daily_data: {}, activities: [] } };
}

async function fetchWipDbLastWeek({ connectionString }) {
  const now = new Date();
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const startOfCurrentWeek = new Date(current);
  startOfCurrentWeek.setDate(current.getDate() + diff);
  const endOfCurrentWeek = new Date(startOfCurrentWeek);
  endOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + 6);
  endOfCurrentWeek.setHours(23, 59, 59, 999);

  const lastWeekStart = new Date(startOfCurrentWeek);
  lastWeekStart.setDate(startOfCurrentWeek.getDate() - 7);
  lastWeekStart.setHours(0, 0, 0, 0);
  const lastWeekEnd = new Date(endOfCurrentWeek);
  lastWeekEnd.setDate(endOfCurrentWeek.getDate() - 7);
  lastWeekEnd.setHours(23, 59, 59, 999);

  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(lastWeekStart));
    request.input('dateTo', sqlClient.Date, formatDateOnly(lastWeekEnd));
    const result = await request.query(`
      SELECT id, date,
             CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
             CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
             type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
             expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed
      FROM [dbo].[wip]
      WHERE created_at_date BETWEEN @dateFrom AND @dateTo
    `);
    const rows = Array.isArray(result.recordset) ? result.recordset : [];
    return rows.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) row.quantity_in_hours = Math.ceil(value * 10) / 10;
      }
      return row;
    });
  });
}

// Helper functions
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

// Enumerate calendar-month windows between two dates (inclusive)
function enumerateMonthlyWindows(from, to) {
  const windows = [];
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const cursor = new Date(start);
  while (cursor <= end) {
    const winStart = new Date(cursor);
    winStart.setHours(0, 0, 0, 0);
    const winEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    winEnd.setHours(23, 59, 59, 999);
    // Clamp window to provided range
    const clampedStart = winStart < from ? new Date(from) : winStart;
    const clampedEnd = winEnd > to ? new Date(to) : winEnd;
    windows.push({ start: clampedStart, end: clampedEnd });
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return windows;
}

// Google Analytics data fetcher
async function fetchGoogleAnalyticsData(months = 3) {
  const http = require('http');
  const querystring = require('querystring');
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const params = querystring.stringify({
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: `/api/marketing-metrics/ga4?${params}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Google Analytics response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Google Analytics request failed: ${error.message}`));
    });

    req.end();
  });
}

// Google Ads data fetcher
async function fetchGoogleAdsData(months = 3) {
  const http = require('http');
  const querystring = require('querystring');
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const params = querystring.stringify({
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: `/api/marketing-metrics/google-ads?${params}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Google Ads response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Google Ads request failed: ${error.message}`));
    });

    req.end();
  });
}

async function fetchMetaMetrics(daysBack = 30) {
  const http = require('http');
  const querystring = require('querystring');
  
  const params = querystring.stringify({
    daysBack: daysBack
  });

  // Retry configuration for connection stability
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: process.env.PORT || 3000,
          path: `/api/marketing-metrics?${params}`,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive', // Reuse connections
            'User-Agent': 'Helix-Internal-Client/1.0'
          },
          // Use HTTP agent for connection pooling
          agent: new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 5,
            timeout: 15000 // 15 second socket timeout
          })
        };

        const req = http.request(options, (res) => {
          let data = '';
          
          // Handle connection errors during response
          res.on('error', (error) => {
            console.error(`Meta metrics response error (attempt ${attempt}/${maxRetries}):`, error);
            reject(error);
          });
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                console.warn(`Meta metrics HTTP error ${res.statusCode} (attempt ${attempt}/${maxRetries})`);
                reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                return;
              }
              
              const response = JSON.parse(data);
              if (response.success && response.data) {
                console.log(`✅ Meta metrics fetched successfully (attempt ${attempt})`);
                resolve(response.data);
              } else {
                console.warn(`Meta metrics invalid response (attempt ${attempt}/${maxRetries}):`, response);
                reject(new Error('Invalid response structure'));
              }
            } catch (error) {
              console.error(`Meta metrics JSON parse error (attempt ${attempt}/${maxRetries}):`, error);
              reject(error);
            }
          });
        });

        // Enhanced error handling for connection issues
        req.on('error', (error) => {
          console.error(`Meta metrics request error (attempt ${attempt}/${maxRetries}):`, error.message);
          if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
            console.error('📡 Connection issue - the marketing-metrics endpoint may be unavailable');
          }
          reject(error);
        });

        req.on('timeout', () => {
          console.error(`Meta metrics request timeout (attempt ${attempt}/${maxRetries})`);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        // Set request timeout
        req.setTimeout(15000);
        req.end();
      });
      
      return result; // Success - return data
      
    } catch (error) {
      console.error(`Meta metrics attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('❌ All Meta metrics retry attempts failed - returning empty data');
        return []; // Final fallback
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1)));
    }
  }
  
  return []; // Fallback if all retries failed
}

// Fetch deals/pitches data for Meta metrics conversion tracking
async function fetchDeals({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  console.log(`🔍 Deals Query: Fetching data from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
  
  try {
    // Use the instructions database connection string (deals are in the same database)
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      console.log(`⚠️  Instructions database connection string not found - returning empty dataset`);
      return [];
    }

    return withRequest(instructionsConnStr, async (request, sqlClient) => {
      request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
      request.input('dateTo', sqlClient.Date, formatDateOnly(to));
      
      const result = await request.query(`
        SELECT TOP 2000 DealId, InstructionRef, ProspectId, ServiceDescription, Amount, AreaOfWork,
               PitchedBy, PitchedDate, PitchedTime, Status, IsMultiClient, LeadClientEmail,
               LeadClientId, CloseDate, CloseTime, PitchValidUntil
        FROM [dbo].[Deals] WITH (NOLOCK)
        WHERE PitchedDate BETWEEN @dateFrom AND @dateTo
        ORDER BY PitchedDate DESC, DealId DESC
      `);
      
      console.log(`✅ Deals Query: Retrieved ${result.recordset?.length || 0} records`);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });
  } catch (error) {
    console.error('❌ Deals fetch error:', error);
    return [];
  }
}

// Fetch instruction summaries for conversion tracking
async function fetchInstructions({ connectionString }) {
  const { from, to } = getLast24MonthsRange();
  console.log(`🔍 Instructions Query: Fetching data from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
  
  try {
    // Use the instructions database connection string
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      console.log(`⚠️  Instructions database connection string not found - returning empty dataset`);
      return [];
    }

    return withRequest(instructionsConnStr, async (request, sqlClient) => {
      request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
      request.input('dateTo', sqlClient.Date, formatDateOnly(to));
      
      const result = await request.query(`
        SELECT TOP 2000 InstructionRef, Stage, SubmissionDate, SubmissionTime, LastUpdated,
               MatterId, ClientId, Email, FirstName, LastName, Phone, InternalStatus
        FROM [dbo].[Instructions] WITH (NOLOCK)
        WHERE SubmissionDate BETWEEN @dateFrom AND @dateTo
        ORDER BY SubmissionDate DESC, InstructionRef DESC
      `);
      
      console.log(`✅ Instructions Query: Retrieved ${result.recordset?.length || 0} records`);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });
  } catch (error) {
    console.error('❌ Instructions fetch error:', error);
    return [];
  }
}

module.exports = router;

// Local helper shared with function-first path
function normalizeFunctionWipClio(payload) {
  if (payload.current_week && payload.last_week) return payload;
  const current = payload.current_week || payload.currentWeek || {};
  const last = payload.last_week || payload.lastWeek || {};
  return {
    current_week: {
      activities: Array.isArray(current.activities) ? current.activities : (Array.isArray(payload.activities) ? payload.activities : []),
      daily_data: current.daily_data || current.dailyData || {},
    },
    last_week: {
      activities: Array.isArray(last.activities) ? last.activities : [],
      daily_data: last.daily_data || last.dailyData || {},
    },
  };
}

// Lightweight: fetch only current week's WIP from DB (as activity-like rows)
async function fetchWipDbCurrentWeek({ connectionString }) {
  const now = new Date();
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const startOfCurrentWeek = new Date(current);
  startOfCurrentWeek.setDate(current.getDate() + diff);
  const endOfCurrentWeek = new Date(startOfCurrentWeek);
  endOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + 6);
  endOfCurrentWeek.setHours(23, 59, 59, 999);

  return withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(startOfCurrentWeek));
    request.input('dateTo', sqlClient.Date, formatDateOnly(endOfCurrentWeek));
    const result = await request.query(`
      SELECT id, date,
             CONVERT(VARCHAR(10), created_at_date, 120) + 'T' + CONVERT(VARCHAR(8), created_at_time, 108) AS created_at,
             CONVERT(VARCHAR(10), updated_at_date, 120) + 'T' + CONVERT(VARCHAR(8), updated_at_time, 108) AS updated_at,
             type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
             expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed
      FROM [dbo].[wip]
      WHERE created_at_date BETWEEN @dateFrom AND @dateTo
    `);
    const rows = Array.isArray(result.recordset) ? result.recordset : [];
    return rows.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) row.quantity_in_hours = Math.ceil(value * 10) / 10;
      }
      return row;
    });
  });
}