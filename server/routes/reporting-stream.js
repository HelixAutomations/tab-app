const express = require('express');
const { getRedisClient, cacheWrapper, generateCacheKey } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.stream;

// Import dataset fetchers from the main reporting route
const { withRequest } = require('../utils/db');
const { getMatterDateExpressions } = require('../utils/matterDateColumns');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const fetch = require('node-fetch');
// Reuse the direct Clio current-week implementation from reporting route to avoid Azure Function fallback
const reportingRoute = require('./reporting');
const { fetchWipClioCurrentWeek: fetchWipClioCurrentWeekDirect } = reportingRoute;

// Re-use the same dataset fetcher functions from reporting.js
// (We'll import these or duplicate the core functions)

// Cache TTL configurations for each dataset (in seconds) - Optimized for stability and performance
const DATASET_TTL = {
  userData: 1800,     // 30 min - user data changes rarely, reduce frequent requests
  teamData: 3600,     // 1 hour - team data is very static
  enquiries: 1800,    // 30 min - enquiries don't need constant updates
  allMatters: 1800,   // 30 min - matters update moderately
  wip: 300,         // 5 min - aligned with smartCache; SSE broadcast triggers immediate refresh
  recoveredFees: 120, // 2 min - near-realtime parity with Home card
  recoveredFeesSummary: 120, // 2 min - per-user summary, near-realtime
  wipClioCurrentWeek: 300,   // 5 min - aligned with smartCache
  wipDbLastWeek: 600, // 10 min - last week data stabilises quickly
  wipDbCurrentWeek: 300, // 5 min - aligned with smartCache
  googleAnalytics: 3600, // 1 hour - Google Analytics data updates hourly
  googleAds: 3600,    // 1 hour - Google Ads data updates regularly  
  metaMetrics: 3600,  // 1 hour - Meta metrics don't need frequent updates
  deals: 1800,        // 30 min - Deal/pitch data for Meta metrics conversion tracking
  instructions: 1800, // 30 min - Instruction data for conversion funnel
  dubberCalls: 300,   // 5 min - Dubber call recordings
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
    // Avoid writes after end or after client disconnect
    if (res.writableEnded || res.destroyed) return;
    if (!isClientConnected) return;
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (typeof res.flush === 'function') {
        try { res.flush(); } catch { /* ignore flush error */ }
      }
    } catch (e) {
      // Ignore write errors (connection likely closed)
    }
  }

  // Keep-alive heartbeat to prevent idle timeouts
  const heartbeat = setInterval(() => {
    if (!isClientConnected || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    try { res.write(': heartbeat\n\n'); } catch { /* connection might be closed */ }
  }, 15000);

  // Clean up on client disconnect
  let isClientConnected = true;
  req.on('close', () => {
    isClientConnected = false;
    clearInterval(heartbeat);
    log.debug('🔌 Client disconnected from streaming');
    try { res.end(); } catch { /* ignore */ }
  });

  req.on('error', () => {
    isClientConnected = false;
    clearInterval(heartbeat);
  });

  const connectionString = process.env.SQL_CONNECTION_STRING;
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    res.write(`data: ${JSON.stringify({ error: 'SQL connection string not configured' })}\n\n`);
    res.end();
    return;
  }

  const datasetsParam = typeof req.query.datasets === 'string'
    ? req.query.datasets.split(',').map((name) => name.trim()).filter(Boolean)
    : ['userData', 'teamData', 'enquiries', 'allMatters', 'wip', 'recoveredFees', 'wipClioCurrentWeek'];

  const entraId = typeof req.query.entraId === 'string' && req.query.entraId.trim().length > 0
    ? req.query.entraId.trim()
    : null;

  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';

  const datasetRangeOverrides = buildRangeOverridesFromQuery(req.query);
  const getRangeCacheSuffix = (datasetName) => {
    const override = datasetRangeOverrides?.[datasetName];
    if (!override) return '';
    if (typeof override === 'number') {
      return `:${override}`;
    }
    if (override && typeof override === 'object' && override.from && override.to) {
      try {
        return `:${formatDateOnly(override.from)}_${formatDateOnly(override.to)}`;
      } catch {
        return '';
      }
    }
    return '';
  };

  // Send initial status for all datasets
  // Instruct EventSource to retry if disconnected
  try { res.write('retry: 10000\n\n'); } catch { /* ignore */ }
  writeSse({
    type: 'init',
    datasets: datasetsParam.map(name => ({ name, status: 'loading' }))
  });

  log.debug(`🌊 Starting stream for datasets: [${datasetsParam.join(', ')}] with entraId: ${entraId}`);

  // Process each dataset individually with Redis caching
  const processDataset = async (datasetName) => {
    const startTime = Date.now();
    try {
      // Check if client is still connected before processing
      if (!isClientConnected) {
        log.debug(`🔌 Client disconnected, skipping dataset: ${datasetName}`);
        return;
      }
      
      log.debug(`🔍 Processing dataset: ${datasetName}`);
      
      // Send processing status to client
      writeSse({
        type: 'dataset-processing',
        dataset: datasetName,
        status: 'processing'
      });
      
      // Check Redis cache first (unless bypassing) with priority on cache hits
      let result = null;
      let fromCache = false;

      const rangeSuffix = getRangeCacheSuffix(datasetName);
      if (!bypassCache) {
        try {
          const redisClient = await getRedisClient();
          if (redisClient) {
            // For wipClioCurrentWeek we always use team scope; key by 'team' to avoid per-user caching
            const scopeKey = datasetName === 'wipClioCurrentWeek' ? 'team' : (entraId || 'team');
            const cacheKey = generateCacheKey('stream', `${datasetName}:${scopeKey}${rangeSuffix}`);
            const cached = await redisClient.get(cacheKey);
            if (cached) {
              try {
                const cachePayload = JSON.parse(cached);
                // Support both old format (raw data) and new format (with timestamp)
                result = cachePayload.data !== undefined ? cachePayload.data : cachePayload;
                const cacheAge = cachePayload.timestamp ? Date.now() - cachePayload.timestamp : 0;
                fromCache = true;
                const cacheTime = Date.now() - startTime;
                log.debug(`📋 Dataset ${datasetName} cache hit (Redis) in ${cacheTime}ms - data age: ${Math.round(cacheAge / 1000)}s`);
              } catch (parseError) {
                log.warn(`Failed to parse cache payload for ${datasetName}:`, parseError.message);
                result = null;
              }
              
              // DO NOT extend TTL on cache hit - this causes data to become permanently stale
              // Instead, let the cache expire naturally at its original TTL
              // This ensures fresh data is fetched at regular intervals
              log.debug(`� Using cached ${datasetName} at original TTL (no extension to prevent staleness)`);
            }
          }
        } catch (redisError) {
          log.warn(`Redis cache read failed for ${datasetName}:`, redisError.message);
        }
      }

      // Fetch from source if not in cache
      if (!result) {
        // If client disconnected, still need to send error status to avoid UI hanging
        if (!isClientConnected) {
          log.warn(`⚠️ Client disconnected before fetching ${datasetName}, sending error to UI`);
          writeSse({
            type: 'dataset-error',
            dataset: datasetName,
            status: 'error',
            error: 'Client disconnected - request aborted',
            processingTimeMs: Date.now() - startTime
          });
          return; // Don't continue processing this dataset
        }

        const fetchStartTime = Date.now();
        const isHeavyDataset = ['wip', 'recoveredFees'].includes(datasetName);
        const isCollectedTimeOrPoid = ['recoveredFees'].includes(datasetName);
        
        // Extended timeouts for collected time and ID submission datasets
        let timeoutMs = 120000; // 2min default
        if (isCollectedTimeOrPoid) {
          timeoutMs = 900000; // 15 minutes for collected time/POID - these can be very slow
        } else if (isHeavyDataset) {
          timeoutMs = 600000; // 10 minutes for other heavy datasets
        }
        
        log.debug(`🚀 Fetching ${datasetName} from source (timeout: ${timeoutMs}ms, heavy: ${isHeavyDataset}, collected/poid: ${isCollectedTimeOrPoid}) - cache miss`);
        
        try {
          // For heavy datasets, DON'T abort on client disconnect - continue fetching and cache the result
          // This ensures the next request gets a cache hit instead of starting another slow fetch
          const racePromises = [
            fetchDatasetByName(datasetName, { connectionString, instructionsConnectionString, entraId, rangeOverrides: datasetRangeOverrides, bypassCache }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs))
          ];
          
          // Only abort light datasets on client disconnect - heavy ones should complete and cache
          if (!isHeavyDataset) {
            racePromises.push(
              new Promise((_, reject) => {
                const checkConnection = setInterval(() => {
                  if (!isClientConnected) {
                    clearInterval(checkConnection);
                    reject(new Error('Client disconnected during fetch'));
                  }
                }, 1000);
              })
            );
          } else {
            log.debug(`🔒 Heavy dataset ${datasetName} will complete even if client disconnects (for caching)`);
          }
          
          result = await Promise.race(racePromises);
          
          const fetchTime = Date.now() - fetchStartTime;
          log.debug(`✅ Dataset ${datasetName} fetched in ${fetchTime}ms, result type:`, typeof result, 'array length:', Array.isArray(result) ? result.length : 'not array');
        } catch (fetchError) {
          const fetchTime = Date.now() - fetchStartTime;
          log.error(`❌ Dataset ${datasetName} fetch failed after ${fetchTime}ms:`, fetchError.message);
          throw fetchError;
        }
        
        // Store in Redis cache with consistent TTLs (no extension tricks)
        try {
          const redisClient = await getRedisClient();
          if (redisClient) {
            const scopeKey2 = datasetName === 'wipClioCurrentWeek' ? 'team' : (entraId || 'team');
            const cacheKey = generateCacheKey('stream', `${datasetName}:${scopeKey2}${rangeSuffix}`);
            const baseTtl = DATASET_TTL[datasetName] || 1800;
            
            // Use base TTL directly - no multipliers that cause unpredictable behavior
            // Heavy datasets already have longer TTLs in DATASET_TTL config
            const ttl = baseTtl;
            
            // Always include timestamp so client knows when data was cached
            const cachePayload = {
              data: result,
              timestamp: Date.now(),
              ttl: ttl
            };
            
            await redisClient.setEx(cacheKey, ttl, JSON.stringify(cachePayload));
            log.debug(`� Dataset ${datasetName} cached (TTL: ${ttl}s, expires at ${new Date(Date.now() + ttl * 1000).toISOString()})`);
          }
        } catch (redisError) {
          log.warn(`Redis cache write failed for ${datasetName}:`, redisError.message);
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

      log.debug(`✅ Dataset ${datasetName} sent to client (total time: ${totalTime}ms)`);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      log.error(`❌ Dataset ${datasetName} failed after ${totalTime}ms:`, error.message);
      log.error('Full error:', error);
      
      // Graceful degradation for Clio token errors - log but still send error status 
      // so frontend can fallback to wipDbCurrentWeek
      const isClioDataset = datasetName === 'wipClioCurrentWeek';
      const isClioTokenError = error.message && (
        error.message.includes('401') || 
        error.message.includes('invalid_token') ||
        error.message.includes('Failed to obtain Clio access token')
      );
      
      if (isClioDataset && isClioTokenError) {
        log.warn(`⚠️ Clio token issue for ${datasetName}, frontend will use wipDbCurrentWeek fallback`);
        // Send error status so frontend knows to use DB fallback instead of empty data
        writeSse({
          type: 'dataset-error',
          dataset: datasetName,
          status: 'error',
          error: 'Clio authentication issue - using DB fallback',
          processingTimeMs: totalTime
        });
        return;
      }
      
      // Send error status to client for non-Clio errors
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
    const lightDatasets = datasetsParam.filter(d => !['wip', 'recoveredFees'].includes(d));
    const heavyDatasets = datasetsParam.filter(d => ['wip', 'recoveredFees'].includes(d));

    log.debug(`🚀 Processing light datasets: [${lightDatasets.join(', ')}]`);
    
    // Process light datasets concurrently
    await Promise.all(lightDatasets.map(processDataset));

    // If client disconnected during light set, stop early to avoid writes after end
    if (!isClientConnected || res.writableEnded || res.destroyed) {
      return; // 'close' handler already ended response
    }

    log.debug(`🔥 Processing heavy datasets: [${heavyDatasets.join(', ')}]`);
    
    // Process heavy datasets sequentially to avoid overwhelming the system
    for (const dataset of heavyDatasets) {
      // Stop if client disconnected between iterations
      if (!isClientConnected || res.writableEnded || res.destroyed) break;
      await processDataset(dataset);
    }

    // Send completion signal
    log.debug(`✅ All datasets completed, sending completion signal`);
    writeSse({ type: 'complete' });
    if (!res.writableEnded) res.end();
  } catch (globalError) {
    log.error('❌ Global streaming error:', globalError);
    writeSse({ 
      type: 'error', 
      error: 'Stream processing failed: ' + globalError.message 
    });
    if (!res.writableEnded) res.end();
  }
});

// Dataset fetcher dispatcher
async function fetchDatasetByName(datasetName, { connectionString, instructionsConnectionString, entraId, clioId, rangeOverrides = {}, bypassCache = false }) {
  switch (datasetName) {
    case 'userData':
      return fetchUserData({ connectionString, entraId });
    case 'teamData':
      return fetchTeamData({ connectionString });
    case 'enquiries':
      return fetchEnquiries({ connectionString, instructionsConnectionString, range: rangeOverrides.enquiries });
    case 'allMatters':
      return fetchAllMatters({ connectionString, range: rangeOverrides.allMatters });
    case 'wip':
      return fetchWip({ connectionString, range: rangeOverrides.wip });
    case 'recoveredFees':
      return fetchRecoveredFees({ connectionString, range: rangeOverrides.recoveredFees });
    case 'recoveredFeesSummary':
      return fetchRecoveredFeesSummary({ connectionString, entraId, clioId });
    case 'wipClioCurrentWeek':
      return fetchWipClioCurrentWeek({ connectionString, entraId });
    case 'wipDbLastWeek':
      return fetchWipDbLastWeek({ connectionString });
    case 'wipDbCurrentWeek':
      return fetchWipDbCurrentWeek({ connectionString });
    case 'googleAnalytics': {
      const months = sanitizeMonths(rangeOverrides.googleAnalytics, 24) ?? 3;
      return fetchGoogleAnalyticsData(months);
    }
    case 'googleAds': {
      const months = sanitizeMonths(rangeOverrides.googleAds, 24) ?? 3;
      return fetchGoogleAdsData(months);
    }
    case 'metaMetrics': {
      const daysBack = sanitizeDays(rangeOverrides.metaMetrics, 90) ?? 30;
      return fetchMetaMetrics(daysBack, bypassCache);
    }
    case 'deals':
      return fetchDeals({ connectionString, range: rangeOverrides.deals });
    case 'instructions':
      return fetchInstructions({ connectionString, range: rangeOverrides.instructions });
    case 'dubberCalls':
      return fetchDubberCallsStream();
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

async function fetchEnquiries({ connectionString, instructionsConnectionString, range }) {
  const resolvedRange = range ?? getLast24MonthsRange();
  const { from, to } = resolvedRange;

  const coreEnquiries = await withRequest(connectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    const result = await request.query(`
      SELECT * FROM [dbo].[enquiries]
      WHERE Touchpoint_Date BETWEEN @dateFrom AND @dateTo
      ORDER BY Touchpoint_Date DESC
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });

  // If the Instructions DB isn't configured, fall back to core enquiries only.
  if (!instructionsConnectionString) {
    return coreEnquiries;
  }

  // Pull enquiries from the Instructions DB and map them into the core Enquiry shape
  // so downstream reporting can use Touchpoint_Date/Point_of_Contact consistently.
  const instructionsRows = await withRequest(instructionsConnectionString, async (request, sqlClient) => {
    request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
    request.input('dateTo', sqlClient.Date, formatDateOnly(to));
    const result = await request.query(`
      SELECT
        id,
        datetime,
        stage,
        claim,
        poc,
        pitch,
        aow,
        tow,
        moc,
        rep,
        first,
        last,
        email,
        phone,
        value,
        rating,
        acid,
        notes
      FROM [dbo].[enquiries]
      WHERE CONVERT(date, datetime) BETWEEN @dateFrom AND @dateTo
      ORDER BY datetime DESC
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });

  if (!Array.isArray(instructionsRows) || instructionsRows.length === 0) {
    return coreEnquiries;
  }

  const coreById = new Map(
    coreEnquiries
      .map((row) => [String(row?.ID ?? row?.id ?? ''), row])
      .filter(([id]) => Boolean(id))
  );

  const mappedInstructions = [];

  for (const inst of instructionsRows) {
    const legacyId = inst?.acid != null && String(inst.acid).trim() !== '' ? String(inst.acid) : null;
    const instructionsId = inst?.id != null ? inst.id : undefined;

    // If this instructions enquiry is a migrated/cross-referenced row, enrich the core record
    // and avoid double-counting.
    if (legacyId && coreById.has(legacyId)) {
      const core = coreById.get(legacyId);
      if (core && instructionsId != null && core.pitchEnquiryId == null) {
        core.pitchEnquiryId = instructionsId;
      }
      continue;
    }

    let dateOnly = '';
    let dateIso = '';
    if (inst?.datetime) {
      const candidate = new Date(inst.datetime);
      if (!Number.isNaN(candidate.getTime())) {
        dateOnly = candidate.toISOString().split('T')[0];
        dateIso = candidate.toISOString();
      } else if (typeof inst.datetime === 'string') {
        dateOnly = inst.datetime.split('T')[0];
        dateIso = inst.datetime;
      }
    }

    const stableFallbackId = `inst:${dateOnly || String(inst?.datetime || 'unknown')}:${String(inst?.email || '').toLowerCase()}`;
    const mappedId = legacyId ?? (instructionsId != null ? `inst:${instructionsId}` : stableFallbackId);

    mappedInstructions.push({
      ID: mappedId,
      pitchEnquiryId: instructionsId,
      Date_Created: dateIso || dateOnly,
      Touchpoint_Date: dateIso || dateOnly,
      Email: inst?.email ?? '',
      Area_of_Work: inst?.aow ?? '',
      Type_of_Work: inst?.tow ?? '',
      Method_of_Contact: inst?.moc ?? '',
      Point_of_Contact: inst?.poc ?? '',
      Call_Taker: inst?.rep ?? undefined,
      First_Name: inst?.first ?? '',
      Last_Name: inst?.last ?? '',
      Phone_Number: inst?.phone ?? undefined,
      Tags: inst?.stage ?? undefined,
      Value: inst?.value ?? undefined,
      Rating: inst?.rating ?? undefined,
      Initial_first_call_notes: inst?.notes ?? undefined,
    });
  }

  return coreEnquiries.concat(mappedInstructions);
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
        log.debug(`🔍 Matters Query (scoped via ${coalesceClause}): ${fromDate} → ${toDate}`);
      } else {
        log.warn('⚠️ Matters range requested but no recognized date columns found; returning full dataset');
      }
    } else {
      log.debug('🔍 Matters Query: no range supplied, returning full dataset');
    }

    const result = await request.query(query);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchWip({ connectionString, range }) {
  // Exclude current week: DB has no current-week rows (syncWip skips them).
  // Current week is sourced live from Clio via wipClioCurrentWeek.
  const resolvedRange = range
    ? { from: new Date(range.from), to: new Date(range.to) }
    : getLast24MonthsExcludingCurrentWeek();
  const { from, to } = resolvedRange;
  const rangeLabel = range ? 'custom' : 'default';
  log.debug(`🔍 WIP Query (${rangeLabel}, paged): ${formatDateOnly(from)} → ${formatDateOnly(to)}`);

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
  log.debug(`✅ WIP Query: Combined ${all.length} records across ${windows.length} windows`);
  return all;
}

async function fetchRecoveredFees({ connectionString, range }) {
  const resolvedRange = range
    ? { from: new Date(range.from), to: new Date(range.to) }
    : getLast24MonthsRange();
  const { from, to } = resolvedRange;
  const rangeLabel = range ? 'custom' : 'default';
  log.info(`🔍 Recovered Fees Query (${rangeLabel}): ${formatDateOnly(from)} → ${formatDateOnly(to)}`);
  log.debug(`🔍 Recovered Fees Query (${rangeLabel}, optimized paged): ${formatDateOnly(from)} → ${formatDateOnly(to)}`);

  // Optimize by using 3-month windows instead of monthly for better performance
  const windows = enumerateQuarterlyWindows(from, to);
  const all = [];
  let totalRows = 0;

  log.debug(`📊 Processing ${windows.length} quarterly windows for collected time data`);

  for (const win of windows) {
    const pageStart = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const page = await withRequest(connectionString, async (request, sqlClient) => {
      // Configure request for large dataset handling
      request.timeout = 300000; // 5 minute timeout per window
      request.input('dateFrom', sqlClient.Date, formatDateOnly(win.start));
      request.input('dateTo', sqlClient.Date, formatDateOnly(win.end));
      
      // Optimized query with indexed columns and reduced field selection
      // NOTE: No TOP limit - we need all records to avoid data truncation in PPC/income reporting
      const result = await request.query(`
        SELECT matter_id, bill_id, contact_id, id, 
               CONVERT(VARCHAR(10), payment_date, 120) AS payment_date,
               created_at, kind, type, activity_type, description, 
               sub_total, tax, secondary_tax, user_id, user_name, payment_allocated
        FROM [dbo].[collectedTime] WITH (NOLOCK)
        WHERE payment_date BETWEEN @dateFrom AND @dateTo
        ORDER BY payment_date DESC, id DESC
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
    const pageTime = Date.now() - pageStart;
    totalRows += page.length;
    log.debug(`📊 Collected time window ${windows.indexOf(win) + 1}/${windows.length}: ${page.length} records in ${pageTime}ms (total: ${totalRows})`);
    all.push(...page);
  }

  // Limit sorting to improve performance - data is already ordered by query
  log.debug(`✅ Recovered Fees Query: Combined ${all.length} records across ${windows.length} quarterly windows`);
  return all;
}

async function fetchRecoveredFeesSummary({ connectionString, entraId, clioId }) {
  // Implementation similar to reporting.js
  return { currentMonthTotal: 0, previousMonthTotal: 0 };
}

async function fetchWipClioCurrentWeek({ connectionString, entraId }) {
  // Management dashboard requires TEAM-WIDE current-week data.
  // Force team scope here regardless of entraId so we don't accidentally fetch only the current user.
  if (typeof fetchWipClioCurrentWeekDirect !== 'function') {
    throw new Error('wipClioCurrentWeek: fetchWipClioCurrentWeekDirect not available');
  }

  // Let errors propagate so the streaming handler sends 'error' status
  // and the frontend falls back to wipDbCurrentWeek instead of caching
  // an empty result as 'ready'.
  const result = await fetchWipClioCurrentWeekDirect({ connectionString, entraId: null });
  const activityCount = result?.current_week?.activities?.length ?? 0;
  log.info(`✅ wipClioCurrentWeek: fetched ${activityCount} activities from Clio API`);
  return result;
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

// Enumerate quarterly windows for better performance on large datasets
function enumerateQuarterlyWindows(from, to) {
  const windows = [];
  const start = new Date(from.getFullYear(), Math.floor(from.getMonth() / 3) * 3, 1);
  const end = new Date(to.getFullYear(), Math.floor(to.getMonth() / 3) * 3, 1);
  const cursor = new Date(start);
  
  while (cursor <= end) {
    const winStart = new Date(cursor);
    winStart.setHours(0, 0, 0, 0);
    const winEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 0);
    winEnd.setHours(23, 59, 59, 999);
    // Clamp window to provided range
    const clampedStart = winStart < from ? new Date(from) : winStart;
    const clampedEnd = winEnd > to ? new Date(to) : winEnd;
    windows.push({ start: clampedStart, end: clampedEnd });
    cursor.setMonth(cursor.getMonth() + 3, 1);
  }
  return windows;
}

function buildRangeOverridesFromQuery(query) {
  const wipRange = createRangeOverride(
    getQueryValue(query.wipRangeStart),
    getQueryValue(query.wipRangeEnd)
  );
  const recoveredRange = createRangeOverride(
    getQueryValue(query.recoveredRangeStart) ?? getQueryValue(query.wipRangeStart),
    getQueryValue(query.recoveredRangeEnd) ?? getQueryValue(query.wipRangeEnd)
  );
  const enquiriesRange = createRangeOverride(
    getQueryValue(query.enquiriesRangeStart),
    getQueryValue(query.enquiriesRangeEnd)
  );
  const dealsRange = createRangeOverride(
    getQueryValue(query.dealsRangeStart) ?? getQueryValue(query.enquiriesRangeStart),
    getQueryValue(query.dealsRangeEnd) ?? getQueryValue(query.enquiriesRangeEnd)
  ) || enquiriesRange;
  const instructionsRange = createRangeOverride(
    getQueryValue(query.instructionsRangeStart) ?? getQueryValue(query.enquiriesRangeStart),
    getQueryValue(query.instructionsRangeEnd) ?? getQueryValue(query.enquiriesRangeEnd)
  ) || enquiriesRange;

  const metaDaysBack = parsePositiveInt(getQueryValue(query.metaDaysBack));
  const gaMonths = parsePositiveInt(getQueryValue(query.gaMonths));
  const adsMonths = parsePositiveInt(getQueryValue(query.googleAdsMonths));

  return {
    wip: wipRange,
    recoveredFees: recoveredRange,
    allMatters: wipRange,
    enquiries: enquiriesRange,
    deals: dealsRange,
    instructions: instructionsRange,
    metaMetrics: metaDaysBack,
    googleAnalytics: gaMonths,
    googleAds: adsMonths,
  };
}

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function createRangeOverride(rawStart, rawEnd) {
  if (!rawStart && !rawEnd) return null;
  const parsedStart = rawStart ? new Date(rawStart) : null;
  const parsedEnd = rawEnd ? new Date(rawEnd) : null;
  if (parsedStart && Number.isNaN(parsedStart.getTime())) {
    return null;
  }
  if (parsedEnd && Number.isNaN(parsedEnd.getTime())) {
    return null;
  }
  const from = parsedStart ? new Date(parsedStart) : (parsedEnd ? new Date(parsedEnd) : null);
  const to = parsedEnd ? new Date(parsedEnd) : (parsedStart ? new Date(parsedStart) : null);
  if (!from || !to) {
    return null;
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (to < from) {
    return null;
  }
  return { from, to };
}

function parsePositiveInt(raw) {
  if (raw == null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function sanitizeMonths(value, maxMonths = 24) {
  if (!Number.isFinite(value)) return null;
  const months = Math.max(1, Math.floor(value));
  return Math.min(months, maxMonths);
}

function sanitizeDays(value, defaultCap = 90) {
  if (!Number.isFinite(value)) return null;
  const days = Math.max(7, Math.floor(value));
  return Math.min(days, defaultCap);
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
    const port = process.env.PORT || 3000;
    const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
    
    const options = {
      path: `/api/marketing-metrics/ga4?${params}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // Use socketPath for named pipes (Azure iisnode), otherwise use hostname + port
    if (isNamedPipe) {
      options.socketPath = port;
    } else {
      options.hostname = 'localhost';
      options.port = port;
    }

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
    const port = process.env.PORT || 3000;
    const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
    
    const options = {
      path: `/api/marketing-metrics/google-ads?${params}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // Use socketPath for named pipes (Azure iisnode), otherwise use hostname + port
    if (isNamedPipe) {
      options.socketPath = port;
    } else {
      options.hostname = 'localhost';
      options.port = port;
    }

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

async function fetchMetaMetrics(daysBack = 30, bypassCache = false) {
  const http = require('http');
  const querystring = require('querystring');
  
  const params = querystring.stringify({
    daysBack: daysBack,
    ...(bypassCache ? { bypassCache: 'true' } : {}),
  });

  // Retry configuration for connection stability
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const port = process.env.PORT || 3000;
        const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
        
        const options = {
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

        // Use socketPath for named pipes (Azure iisnode), otherwise use hostname + port
        if (isNamedPipe) {
          options.socketPath = port;
        } else {
          options.hostname = 'localhost';
          options.port = port;
        }

        const req = http.request(options, (res) => {
          let data = '';
          
          // Handle connection errors during response
          res.on('error', (error) => {
            log.error(`Meta metrics response error (attempt ${attempt}/${maxRetries}):`, error);
            reject(error);
          });
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                log.warn(`Meta metrics HTTP error ${res.statusCode} (attempt ${attempt}/${maxRetries})`);
                reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                return;
              }
              
              const response = JSON.parse(data);
              if (response.success && response.data) {
                log.debug(`✅ Meta metrics fetched successfully (attempt ${attempt})`);
                resolve(response.data);
              } else {
                log.warn(`Meta metrics invalid response (attempt ${attempt}/${maxRetries}):`, response);
                reject(new Error('Invalid response structure'));
              }
            } catch (error) {
              log.error(`Meta metrics JSON parse error (attempt ${attempt}/${maxRetries}):`, error);
              reject(error);
            }
          });
        });

        // Enhanced error handling for connection issues
        req.on('error', (error) => {
          log.error(`Meta metrics request error (attempt ${attempt}/${maxRetries}):`, error.message);
          if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
            log.error('📡 Connection issue - the marketing-metrics endpoint may be unavailable');
          }
          reject(error);
        });

        req.on('timeout', () => {
          log.error(`Meta metrics request timeout (attempt ${attempt}/${maxRetries})`);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        // Set request timeout
        req.setTimeout(15000);
        req.end();
      });
      
      return result; // Success - return data
      
    } catch (error) {
      log.error(`Meta metrics attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        log.error('❌ All Meta metrics retry attempts failed - returning empty data');
        return []; // Final fallback
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1)));
    }
  }
  
  return []; // Fallback if all retries failed
}

// Fetch deals/pitches data for Meta metrics conversion tracking
async function fetchDeals({ connectionString, range }) {
  const resolvedRange = range ?? getLast24MonthsRange();
  const { from, to } = resolvedRange;
  log.debug(`🔍 Deals Query: Fetching data from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
  
  try {
    // Use the instructions database connection string (deals are in the same database)
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      log.debug(`⚠️  Instructions database connection string not found - returning empty dataset`);
      return [];
    }
    
    // Add connection timeout for this query
    const connectionTimeout = 30000; // 30 seconds

    return await Promise.race([
      withRequest(instructionsConnStr, async (request, sqlClient) => {
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
        
        log.debug(`✅ Deals Query: Retrieved ${result.recordset?.length || 0} records`);
        return Array.isArray(result.recordset) ? result.recordset : [];
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Deals query timeout after 30s')), connectionTimeout)
      )
    ]);
  } catch (error) {
    log.error('❌ Deals fetch error:', error);
    return [];
  }
}

// Fetch instruction summaries for conversion tracking
async function fetchInstructions({ connectionString, range }) {
  const resolvedRange = range ?? getLast24MonthsRange();
  const { from, to } = resolvedRange;
  log.debug(`🔍 Instructions Query: Fetching data from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
  
  try {
    // Use the instructions database connection string
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConnStr) {
      log.debug(`⚠️  Instructions database connection string not found - returning empty dataset`);
      return [];
    }
    
    // Add connection timeout for this query
    const connectionTimeout = 30000; // 30 seconds

    return await Promise.race([
      withRequest(instructionsConnStr, async (request, sqlClient) => {
        request.input('dateFrom', sqlClient.Date, formatDateOnly(from));
        request.input('dateTo', sqlClient.Date, formatDateOnly(to));
        
        const result = await request.query(`
          SELECT TOP 2000 InstructionRef, Stage, SubmissionDate, SubmissionTime, LastUpdated,
                 MatterId, ClientId, Email, FirstName, LastName, Phone, InternalStatus
          FROM [dbo].[Instructions] WITH (NOLOCK)
          WHERE SubmissionDate BETWEEN @dateFrom AND @dateTo
          ORDER BY SubmissionDate DESC, InstructionRef DESC
        `);
        
        log.debug(`✅ Instructions Query: Retrieved ${result.recordset?.length || 0} records`);
        return Array.isArray(result.recordset) ? result.recordset : [];
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Instructions query timeout after 30s')), connectionTimeout)
      )
    ]);
  } catch (error) {
    log.error('❌ Instructions fetch error:', error);
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

  log.info(`📅 wipDbCurrentWeek: querying ${formatDateOnly(startOfCurrentWeek)} → ${formatDateOnly(endOfCurrentWeek)}`);

  const rows = await withRequest(connectionString, async (request, sqlClient) => {
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
    const rowsArr = Array.isArray(result.recordset) ? result.recordset : [];
    return rowsArr.map((row) => {
      if (row.quantity_in_hours != null) {
        const value = Number(row.quantity_in_hours);
        if (!Number.isNaN(value)) row.quantity_in_hours = Math.ceil(value * 10) / 10;
      }
      return row;
    });
  });
  
  log.info(`✅ wipDbCurrentWeek: retrieved ${rows.length} rows from DB`);
  return rows;
}

/**
 * Fetch Dubber recordings with summary and enquiry cross-reference.
 * Mirrors the logic in reporting.js fetchDubberCalls but lives here for the SSE pipeline.
 */
async function fetchDubberCallsStream() {
  const instrConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const coreConnStr = process.env.SQL_CONNECTION_STRING;
  if (!instrConnStr) return [];

  try {
    const recordings = await withRequest(instrConnStr, async (request) => {
      const result = await request.query(`
        SELECT
          r.recording_id, r.from_party, r.from_label, r.to_party, r.to_label,
          r.call_type, r.recording_type, r.duration_seconds, r.start_time_utc,
          r.document_sentiment_score, r.ai_document_sentiment,
          r.channel, r.status, r.matched_team_initials, r.matched_team_email,
          r.match_strategy, r.document_emotion_json,
          s.summary_text
        FROM [dbo].[dubber_recordings] r WITH (NOLOCK)
        LEFT JOIN [dbo].[dubber_recording_summaries] s WITH (NOLOCK)
          ON r.recording_id = s.recording_id AND s.summary_source = 'dubber_ai'
        ORDER BY r.start_time_utc DESC
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });

    if (!recordings.length) return [];

    // Pull all transcript sentences in one query
    const transcriptRows = await withRequest(instrConnStr, async (request) => {
      const result = await request.query(`
        SELECT recording_id, sentence_index, speaker, content, sentiment
        FROM [dbo].[dubber_transcript_sentences] WITH (NOLOCK)
        ORDER BY recording_id, sentence_index
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    });

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
      } catch { /* non-fatal */ }
    }

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

    // Helper: detect if a string looks like a phone number (digits, +, spaces, dashes)
    const looksLikePhone = (s) => s && /^\+?[\d\s\-().]{7,}$/.test(s.trim());

    return recordings.map((r) => {
      const is_internal = !!(r.matched_team_initials && r.match_strategy === 'internal');

      // Pick whichever party field contains a phone number
      const candidates = [r.from_party, r.to_party, r.from_label, r.to_label].filter(Boolean);
      const phoneCandidates = candidates.filter(looksLikePhone);
      const nameCandidates = candidates.filter(c => !looksLikePhone(c));

      let match;
      for (const p of phoneCandidates) {
        const nd = normDigits(p);
        if (nd.length >= 7) { match = phoneMap.get(nd); if (match) break; }
      }
      if (!match) {
        for (const n of nameCandidates) {
          match = nameMap.get(n.toLowerCase().trim());
          if (match) break;
        }
      }
      return {
        recording_id: r.recording_id,
        from_party: r.from_party, from_label: r.from_label,
        to_party: r.to_party, to_label: r.to_label,
        call_type: r.call_type, recording_type: r.recording_type || null,
        duration_seconds: r.duration_seconds,
        start_time_utc: r.start_time_utc,
        document_sentiment_score: r.document_sentiment_score,
        ai_document_sentiment: r.ai_document_sentiment,
        channel: r.channel, status: r.status,
        matched_team_initials: r.matched_team_initials,
        matched_team_email: r.matched_team_email,
        match_strategy: r.match_strategy,
        document_emotion_json: r.document_emotion_json,
        is_internal, resolved_name: match?.name || null,
        enquiry_ref: match?.id ? String(match.id) : null,
        area_of_work: match?.aow || null,
        summary_text: r.summary_text || null,
        transcript: transcriptMap.get(r.recording_id) || [],
      };
    });
  } catch (error) {
    log.error('❌ DubberCalls fetch error:', error);
    return [];
  }
}
