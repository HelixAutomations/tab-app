/**
 * /api/home-enquiries
 * 
 * Dedicated endpoint for Home page enquiry & conversion metrics.
 * Returns aggregated counts for today/week/month - no full dataset transfer.
 * 
 * Design goals:
 * - Fast: single SQL aggregation, no client-side filtering of thousands of rows
 * - Resilient: Redis cache + stale-on-error fallback
 * - Isolated: doesn't share failure domain with heavy enquiries-unified route
 * - Dual-DB: queries both legacy (helix-core-data) and new (instructions) databases
 */

const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { getRedisClient, generateCacheKey, setCache, getCache } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { performUnifiedEnquiriesQuery } = require('./enquiries-unified');
const {
  collectProspectIdsFromUnifiedEnquiries,
  projectHomeDetailRecordsFromUnifiedEnquiries,
  projectHomeSummaryFromUnifiedEnquiries,
} = require('../utils/home-enquiry-projector');

const router = express.Router();
const { annotate } = require('../utils/devConsole');
const log = loggers.enquiries || console;

// Cache TTL: 60s fresh, stale data kept for fallback
const CACHE_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 300;

// In-memory fallback when Redis unavailable
const memoryCache = new Map();

// De-dup concurrent fetches for the same cache key.
// Prevents duplicate SQL queries when multiple requests hit the same cache miss.
const inflightRequests = new Map();
let enquiryFollowUpTableReady = null;

const resolveUserOverride = (emailRaw, initialsRaw) => {
  const email = (emailRaw || '').trim().toLowerCase();
  const initials = (initialsRaw || '').trim().toLowerCase().replace(/\./g, '');
  return { email, initials, overridden: false };
};

const buildInitialsMatchSql = (field) => `LOWER(REPLACE(REPLACE(CASE
  WHEN CHARINDEX('@', LTRIM(RTRIM(${field}))) > 0
    THEN LEFT(LTRIM(RTRIM(${field})), CHARINDEX('@', LTRIM(RTRIM(${field}))) - 1)
  ELSE LTRIM(RTRIM(${field}))
END, ' ', ''), '.', '')) = @userInitials`;

const dedupeDetailRecords = (records) => {
  const seen = new Set();
  return records.filter((record) => {
    const key = [
      String(record.date || '').slice(0, 19),
      String(record.stage || '').toLowerCase(),
      String(record.name || '').toLowerCase(),
      String(record.aow || '').toLowerCase(),
      String(record.poc || '').toLowerCase(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getDetailRecordLookupIds = (record) => Array.from(new Set([
  record?.enquiryId,
  record?.id,
  record?.processingEnquiryId,
  record?.pitchEnquiryId,
  record?.legacyEnquiryId,
].map((value) => String(value || '').trim()).filter(Boolean)));

const normalizeFollowUpChannel = (value) => {
  const channel = String(value || '').trim().toLowerCase();
  if (channel === 'email' || channel === 'phone') return channel;
  return null;
};

async function ensureEnquiryFollowUpsTable(connectionString) {
  if (!connectionString) return false;
  if (enquiryFollowUpTableReady === true) return true;

  try {
    await withRequest(connectionString, async (request) => {
      await request.query(`
        IF OBJECT_ID(N'dbo.EnquiryFollowUps', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.EnquiryFollowUps (
            FollowUpId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            EnquiryId NVARCHAR(100) NOT NULL,
            Email NVARCHAR(255) NULL,
            Channel NVARCHAR(20) NOT NULL,
            RecordedAt DATETIME2(0) NOT NULL CONSTRAINT DF_EnquiryFollowUps_RecordedAt DEFAULT SYSDATETIME(),
            RecordedBy NVARCHAR(255) NULL,
            Notes NVARCHAR(500) NULL
          );

          CREATE INDEX IX_EnquiryFollowUps_EnquiryId ON dbo.EnquiryFollowUps (EnquiryId, RecordedAt DESC);
          CREATE INDEX IX_EnquiryFollowUps_Email ON dbo.EnquiryFollowUps (Email, RecordedAt DESC);
        END
      `);
    });

    enquiryFollowUpTableReady = true;
    return true;
  } catch (err) {
    enquiryFollowUpTableReady = false;
    log.error('[home-enquiries] Failed to ensure EnquiryFollowUps table:', err.message);
    return false;
  }
}

const combinePitchDateTime = (pitchedDate, pitchedTime) => {
  if (!pitchedDate) return null;
  const date = pitchedDate instanceof Date ? new Date(pitchedDate) : new Date(String(pitchedDate));
  if (Number.isNaN(date.getTime())) return null;

  if (pitchedTime) {
    const time = pitchedTime instanceof Date ? new Date(pitchedTime) : new Date(String(pitchedTime));
    if (!Number.isNaN(time.getTime())) {
      date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
    }
  }

  return date.toISOString();
};

async function queryLatestPitchDetails(connectionString, records) {
  if (!connectionString || !Array.isArray(records) || records.length === 0) {
    return { byProspectId: new Map(), byEmail: new Map() };
  }

  const chunkValues = (values, chunkSize = 900) => {
    const chunks = [];
    for (let index = 0; index < values.length; index += chunkSize) {
      chunks.push(values.slice(index, index + chunkSize));
    }
    return chunks;
  };

  const mergePitchMaps = (target, source) => {
    for (const [key, value] of source.entries()) {
      if (!target.has(key)) target.set(key, value);
    }
  };

  const runPitchLookupChunk = async (prospectIdChunk, emailChunk) => withRequest(connectionString, async (request) => {
    const filters = [];

    if (prospectIdChunk.length > 0) {
      const prospectParams = prospectIdChunk.map((prospectId, index) => {
        request.input(`pitchPid${index}`, sql.NVarChar(100), prospectId);
        return `@pitchPid${index}`;
      });
      filters.push(`CAST(d.ProspectId AS NVARCHAR(100)) IN (${prospectParams.join(',')})`);
    }

    if (emailChunk.length > 0) {
      const emailParams = emailChunk.map((email, index) => {
        request.input(`pitchEmail${index}`, sql.NVarChar(255), email);
        return `@pitchEmail${index}`;
      });
      filters.push(`LOWER(LTRIM(RTRIM(d.LeadClientEmail))) IN (${emailParams.join(',')})`);
    }

    const result = await request.query(`
      SELECT
        d.DealId,
        CAST(d.ProspectId AS NVARCHAR(100)) AS ProspectId,
        LOWER(LTRIM(RTRIM(d.LeadClientEmail))) AS LeadClientEmail,
        d.PitchedBy,
        d.PitchedDate,
        d.PitchedTime,
        d.InstructionRef,
        d.Status,
        pc.ScenarioId
      FROM [instructions].[dbo].[Deals] d
      LEFT JOIN [instructions].[dbo].[PitchContent] pc ON pc.DealId = d.DealId
      WHERE (${filters.join(' OR ')})
        AND d.PitchedDate IS NOT NULL
      ORDER BY d.PitchedDate DESC, d.PitchedTime DESC, d.DealId DESC
    `);

    const byProspectId = new Map();
    const byEmail = new Map();
    for (const row of result.recordset || []) {
      const pitchEvidence = {
        pitchDealId: row.DealId ? String(row.DealId) : undefined,
        pitchedBy: row.PitchedBy ? String(row.PitchedBy).trim() : undefined,
        pitchedAt: combinePitchDateTime(row.PitchedDate, row.PitchedTime),
        pitchInstructionRef: row.InstructionRef ? String(row.InstructionRef).trim() : undefined,
        pitchStatus: row.Status ? String(row.Status).trim() : undefined,
        pitchScenarioId: row.ScenarioId ? String(row.ScenarioId).trim() : undefined,
      };

      const prospectId = String(row.ProspectId || '').trim();
      const email = String(row.LeadClientEmail || '').trim().toLowerCase();

      if (prospectId && !byProspectId.has(prospectId)) {
        byProspectId.set(prospectId, pitchEvidence);
      }
      if (email && !byEmail.has(email)) {
        byEmail.set(email, pitchEvidence);
      }
    }

    return { byProspectId, byEmail };
  });

  const prospectIds = [...new Set(records.flatMap((record) => Array.isArray(record?.prospectIds)
    ? record.prospectIds.map((value) => String(value || '').trim()).filter(Boolean)
    : []))];
  const emails = [...new Set(records
    .map((record) => String(record?.email || '').trim().toLowerCase())
    .filter(Boolean))];

  if (prospectIds.length === 0 && emails.length === 0) {
    return { byProspectId: new Map(), byEmail: new Map() };
  }

  try {
    const byProspectId = new Map();
    const byEmail = new Map();
    const prospectChunks = chunkValues(prospectIds);
    const emailChunks = chunkValues(emails);

    for (const prospectChunk of prospectChunks) {
      const lookup = await runPitchLookupChunk(prospectChunk, []);
      mergePitchMaps(byProspectId, lookup.byProspectId);
      mergePitchMaps(byEmail, lookup.byEmail);
    }

    for (const emailChunk of emailChunks) {
      const lookup = await runPitchLookupChunk([], emailChunk);
      mergePitchMaps(byProspectId, lookup.byProspectId);
      mergePitchMaps(byEmail, lookup.byEmail);
    }

    return { byProspectId, byEmail };
  } catch (err) {
    log.warn('[home-enquiries] Latest pitch detail query failed:', err.message);
    return { byProspectId: new Map(), byEmail: new Map() };
  }
}

function applyPitchDetailsToRecords(records, pitchLookup) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const byProspectId = pitchLookup?.byProspectId || new Map();
  const byEmail = pitchLookup?.byEmail || new Map();

  return records.map((record) => {
    const prospectIds = Array.isArray(record?.prospectIds)
      ? record.prospectIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const matchedByProspectId = prospectIds
      .map((prospectId) => byProspectId.get(prospectId))
      .find(Boolean);
    const matchedPitch = matchedByProspectId
      || byEmail.get(String(record?.email || '').trim().toLowerCase());

    if (!matchedPitch) {
      return record;
    }

    return {
      ...record,
      ...matchedPitch,
    };
  });
}

async function queryFollowUpDetails(connectionString, records) {
  if (!connectionString || !Array.isArray(records) || records.length === 0) {
    return { byId: new Map(), byEmail: new Map() };
  }

  const recordIds = [...new Set(records.flatMap((record) => getDetailRecordLookupIds(record)))];
  const emails = [...new Set(records
    .map((record) => String(record?.email || '').trim().toLowerCase())
    .filter(Boolean))];

  if (recordIds.length === 0 && emails.length === 0) {
    return { byId: new Map(), byEmail: new Map() };
  }

  const tableReady = await ensureEnquiryFollowUpsTable(connectionString);
  if (!tableReady) {
    return { byId: new Map(), byEmail: new Map() };
  }

  try {
    return await withRequest(connectionString, async (request) => {
      const filters = [];

      if (recordIds.length > 0) {
        const idParams = recordIds.map((value, index) => {
          request.input(`followUpId${index}`, sql.NVarChar(100), value);
          return `@followUpId${index}`;
        });
        filters.push(`EnquiryId IN (${idParams.join(',')})`);
      }

      if (emails.length > 0) {
        const emailParams = emails.map((value, index) => {
          request.input(`followUpEmail${index}`, sql.NVarChar(255), value);
          return `@followUpEmail${index}`;
        });
        filters.push(`LOWER(LTRIM(RTRIM(Email))) IN (${emailParams.join(',')})`);
      }

      const result = await request.query(`
        SELECT
          EnquiryId,
          LOWER(LTRIM(RTRIM(Email))) AS Email,
          LOWER(LTRIM(RTRIM(Channel))) AS Channel,
          RecordedAt,
          RecordedBy
        FROM dbo.EnquiryFollowUps
        WHERE ${filters.join(' OR ')}
        ORDER BY RecordedAt DESC, FollowUpId DESC
      `);

      const byId = new Map();
      const byEmail = new Map();

      const mergeRow = (map, key, row) => {
        if (!key) return;
        const current = map.get(key) || {
          totalCount: 0,
          emailCount: 0,
          phoneCount: 0,
          lastFollowUpAt: undefined,
          lastChannel: undefined,
          lastRecordedBy: undefined,
        };

        current.totalCount += 1;
        if (row.Channel === 'email') current.emailCount += 1;
        if (row.Channel === 'phone') current.phoneCount += 1;

        if (!current.lastFollowUpAt) {
          current.lastFollowUpAt = row.RecordedAt instanceof Date ? row.RecordedAt.toISOString() : new Date(row.RecordedAt).toISOString();
          current.lastChannel = row.Channel || undefined;
          current.lastRecordedBy = row.RecordedBy ? String(row.RecordedBy).trim() : undefined;
        }

        map.set(key, current);
      };

      for (const row of result.recordset || []) {
        const enquiryId = String(row.EnquiryId || '').trim();
        const email = String(row.Email || '').trim().toLowerCase();
        mergeRow(byId, enquiryId, row);
        mergeRow(byEmail, email, row);
      }

      return { byId, byEmail };
    });
  } catch (err) {
    log.warn('[home-enquiries] Follow-up detail query failed:', err.message);
    return { byId: new Map(), byEmail: new Map() };
  }
}

function applyFollowUpDetailsToRecords(records, followUpLookup) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const byId = followUpLookup?.byId || new Map();
  const byEmail = followUpLookup?.byEmail || new Map();

  return records.map((record) => {
    const matchedById = getDetailRecordLookupIds(record)
      .map((identifier) => byId.get(identifier))
      .find(Boolean);
    const matched = matchedById || byEmail.get(String(record?.email || '').trim().toLowerCase());

    if (!matched) {
      return record;
    }

    return {
      ...record,
      followUpSummary: matched,
    };
  });
}

const toIsoBoundary = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

async function fetchUnifiedDetailRecords(email, initials, rangeStart, rangeEnd, limit, options = {}) {
  const fetchAll = options.fetchAll === true;
  const includeTeamInbox = options.includeTeamInbox === true;
  const result = await performUnifiedEnquiriesQuery({
    email,
    initials,
    sourcePolicy: 'operational',
    includeTeamInbox: includeTeamInbox ? 'true' : 'false',
    processingApproach: 'unified',
    fetchAll: fetchAll ? 'true' : 'false',
    dateFrom: toIsoBoundary(rangeStart),
    dateTo: toIsoBoundary(rangeEnd),
    limit: String(Math.max(limit, 200)),
  });

  return projectHomeDetailRecordsFromUnifiedEnquiries(result?.enquiries, limit);
}

const trackRouteCompleted = (eventName, startedAt, properties = {}, measurements = {}) => {
  const durationMs = Date.now() - startedAt;
  trackEvent(`${eventName}.Completed`, {
    triggeredBy: 'home-dashboard',
    ...properties,
  }, {
    durationMs,
    ...measurements,
  });
  trackMetric(`${eventName}.Duration`, durationMs, {
    triggeredBy: 'home-dashboard',
    ...properties,
  });
};

const trackRouteFailed = (eventName, startedAt, error, properties = {}) => {
  const durationMs = Date.now() - startedAt;
  const safeError = error instanceof Error ? error : new Error(String(error?.message || error || 'Unknown error'));
  trackException(safeError, {
    operation: eventName,
    triggeredBy: 'home-dashboard',
    ...properties,
    durationMs: String(durationMs),
  });
  trackEvent(`${eventName}.Failed`, {
    triggeredBy: 'home-dashboard',
    ...properties,
    error: safeError.message,
  }, {
    durationMs,
  });
  trackMetric(`${eventName}.Duration`, durationMs, {
    triggeredBy: 'home-dashboard',
    ...properties,
    outcome: 'failed',
  });
};

/**
 * GET /api/home-enquiries?email=<email>&initials=<initials>
 * 
 * Returns: {
 *   enquiriesToday: number,
 *   enquiriesWeekToDate: number,
 *   enquiriesMonthToDate: number,
 *   mattersOpenedMonth: number,
 *   firmMattersOpenedMonth: number,
 *   prevEnquiriesToday: number,
 *   prevEnquiriesWeekToDate: number,
 *   prevEnquiriesMonthToDate: number,
 *   prevEnquiriesWeekFull: number,
 *   prevEnquiriesMonthFull: number,
 *   pitchedToday: number,
 *   pitchedWeekToDate: number,
 *   pitchedMonthToDate: number,
 *   prevPitchedToday: number,
 *   prevPitchedWeekToDate: number,
 *   prevPitchedMonthToDate: number,
  *   breakdown?: {
  *     today?: { aowTop?: Array<{ key: string, count: number }> },
  *     weekToDate?: { aowTop?: Array<{ key: string, count: number }> },
  *     monthToDate?: { aowTop?: Array<{ key: string, count: number }> }
  *   },
 *   cached: boolean,
 *   stale: boolean
 * }
 */
router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const { email, initials, overridden } = resolveUserOverride(req.query.email, req.query.initials);

  if (!email && !initials) {
    return res.status(400).json({ error: 'email or initials query parameter required' });
  }

  const cacheKey = generateCacheKey('homeEnquiries', email || initials);

  // Try cache first
  try {
    const cached = await getCached(cacheKey);
    if (cached && !cached.stale) {
      trackRouteCompleted('Home.Enquiries.Summary', startedAt, {
        operation: 'summary',
        cacheState: 'fresh-hit',
      }, {
        enquiriesToday: Number(cached.data?.enquiriesToday || 0),
        enquiriesWeekToDate: Number(cached.data?.enquiriesWeekToDate || 0),
        enquiriesMonthToDate: Number(cached.data?.enquiriesMonthToDate || 0),
      });
      annotate(res, { source: 'redis', note: `summary TTL ${CACHE_TTL_SECONDS}s` });
      return res.json({ ...cached.data, cached: true, stale: false });
    }

    // Fetch fresh data (de-dup concurrent requests for same user)
    let freshData;
    if (inflightRequests.has(cacheKey)) {
      freshData = await inflightRequests.get(cacheKey);
    } else {
      const inFlight = fetchEnquiryMetrics(email, initials)
        .finally(() => inflightRequests.delete(cacheKey));
      inflightRequests.set(cacheKey, inFlight);
      freshData = await inFlight;
    }

    // Store in cache (fire and forget)
    setCached(cacheKey, freshData).catch((err) => {
      log.warn('[home-enquiries] Cache set failed:', err.message);
    });

    trackRouteCompleted('Home.Enquiries.Summary', startedAt, {
      operation: 'summary',
      cacheState: 'fresh-miss',
    }, {
      enquiriesToday: Number(freshData.enquiriesToday || 0),
      enquiriesWeekToDate: Number(freshData.enquiriesWeekToDate || 0),
      enquiriesMonthToDate: Number(freshData.enquiriesMonthToDate || 0),
      pitchedMonthToDate: Number(freshData.pitchedMonthToDate || 0),
    });

    annotate(res, { source: 'sql', note: 'fresh from 2 DBs' });
    return res.json({ ...freshData, cached: false, stale: false, overridden });
  } catch (err) {
    log.error('[home-enquiries] Fetch failed:', err.message);
    trackRouteFailed('Home.Enquiries.Summary', startedAt, err, {
      operation: 'summary',
      phase: 'primary-fetch',
    });

    // Try stale cache as fallback
    try {
      const stale = await getCached(cacheKey, true);
      if (stale) {
        log.info('[home-enquiries] Returning stale cache after error');
        trackRouteCompleted('Home.Enquiries.Summary', startedAt, {
          operation: 'summary',
          cacheState: 'stale-fallback',
          primaryFailed: 'true',
        }, {
          enquiriesToday: Number(stale.data?.enquiriesToday || 0),
          enquiriesWeekToDate: Number(stale.data?.enquiriesWeekToDate || 0),
          enquiriesMonthToDate: Number(stale.data?.enquiriesMonthToDate || 0),
        });
        annotate(res, { source: 'stale', note: 'summary fallback' });
        return res.json({ ...stale.data, cached: true, stale: true });
      }
    } catch { /* ignore */ }

    // No stale data – return zeros
    return res.status(200).json({
      enquiriesToday: 0,
      enquiriesWeekToDate: 0,
      enquiriesMonthToDate: 0,
      mattersOpenedMonth: 0,
      firmMattersOpenedMonth: 0,
      prevEnquiriesToday: 0,
      prevEnquiriesWeekToDate: 0,
      prevEnquiriesMonthToDate: 0,
      prevEnquiriesWeekFull: 0,
      prevEnquiriesMonthFull: 0,
      pitchedToday: 0,
      pitchedWeekToDate: 0,
      pitchedMonthToDate: 0,
      prevPitchedToday: 0,
      prevPitchedWeekToDate: 0,
      prevPitchedMonthToDate: 0,
      error: err.message,
      cached: false,
      stale: false,
      overridden
    });
  }
});

/**
 * GET /api/home-enquiries/details?email=<email>&initials=<initials>&period=<today|weekToDate|monthToDate|yearToDate>&limit=50&includePrevious=<true|false>
 * Returns sample rows for the requested period to help verify filtering.
 */
router.get('/details', async (req, res) => {
  const startedAt = Date.now();
  const { email, initials, overridden } = resolveUserOverride(req.query.email, req.query.initials);
  const period = String(req.query.period || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 500);
  const includePrevious = String(req.query.includePrevious || 'true').trim().toLowerCase() !== 'false';
  const fetchAll = String(req.query.fetchAll || 'false').trim().toLowerCase() === 'true';
  const includeTeamInbox = String(req.query.includeTeamInbox || 'false').trim().toLowerCase() === 'true';

  if (!email && !initials) {
    return res.status(400).json({ error: 'email or initials query parameter required' });
  }

  if (!['today', 'weekToDate', 'monthToDate', 'yearToDate'].includes(period)) {
    return res.status(400).json({ error: 'period must be today, weekToDate, monthToDate, or yearToDate' });
  }

  const cacheKey = generateCacheKey('homeEnquiriesDetails', `${email || initials}:${period}:${limit}:${includePrevious ? 'with-prev' : 'current-only'}:${fetchAll ? 'all' : 'scoped'}:${includeTeamInbox ? 'team' : 'no-team'}`);

  try {
    const cached = await getCached(cacheKey);
    if (cached && !cached.stale) {
      trackRouteCompleted('Home.Enquiries.Details', startedAt, {
        operation: 'details',
        period,
        includePrevious: includePrevious ? 'true' : 'false',
        fetchAll: fetchAll ? 'true' : 'false',
        cacheState: 'fresh-hit',
      }, {
        currentCount: Number(cached.data?.current?.records?.length || 0),
        previousCount: Number(cached.data?.previous?.records?.length || 0),
      });
      annotate(res, { source: 'redis', note: `details TTL ${CACHE_TTL_SECONDS}s` });
      return res.json({ ...cached.data, cached: true, stale: false });
    }

    // Fetch fresh data (de-dup concurrent requests for same cache key)
    let payload;
    if (inflightRequests.has(cacheKey)) {
      payload = await inflightRequests.get(cacheKey);
    } else {
      const inFlight = (async () => {
        const ranges = buildPeriodRanges(period);
        const [current, previous] = await Promise.all([
          fetchUnifiedDetailRecords(email, initials, ranges.currentStart, ranges.currentEnd, limit, { fetchAll, includeTeamInbox }),
          includePrevious
            ? fetchUnifiedDetailRecords(email, initials, ranges.previousStart, ranges.previousEnd, limit, { fetchAll, includeTeamInbox })
            : Promise.resolve([]),
        ]);

        const dedupedCurrent = dedupeDetailRecords(current);
        const dedupedPrevious = includePrevious ? dedupeDetailRecords(previous) : [];
        const pitchLookup = await queryLatestPitchDetails(
          process.env.INSTRUCTIONS_SQL_CONNECTION_STRING,
          [...dedupedCurrent, ...dedupedPrevious],
        );
        const followUpLookup = await queryFollowUpDetails(
          process.env.SQL_CONNECTION_STRING,
          [...dedupedCurrent, ...dedupedPrevious],
        );
        const enrichedCurrent = applyFollowUpDetailsToRecords(
          applyPitchDetailsToRecords(dedupedCurrent, pitchLookup),
          followUpLookup,
        );
        const enrichedPrevious = includePrevious
          ? applyFollowUpDetailsToRecords(
              applyPitchDetailsToRecords(dedupedPrevious, pitchLookup),
              followUpLookup,
            )
          : [];

        return {
          period,
          limit,
          currentRange: ranges.currentLabel,
          previousRange: includePrevious ? ranges.previousLabel : undefined,
          current: { records: enrichedCurrent },
          previous: { records: enrichedPrevious },
          filters: {
            email: email || undefined,
            initials: initials || undefined,
            includeTeamInbox,
            includePrevious,
            fetchAll,
            overridden: overridden || undefined,
          },
        };
      })().finally(() => inflightRequests.delete(cacheKey));
      inflightRequests.set(cacheKey, inFlight);
      payload = await inFlight;
    }

    setCached(cacheKey, payload).catch((err) => {
      log.warn('[home-enquiries] Details cache set failed:', err.message);
    });

    trackRouteCompleted('Home.Enquiries.Details', startedAt, {
      operation: 'details',
      period,
      includePrevious: includePrevious ? 'true' : 'false',
      fetchAll: fetchAll ? 'true' : 'false',
      cacheState: 'fresh-miss',
    }, {
      currentCount: Number(payload?.current?.records?.length || 0),
      previousCount: Number(payload?.previous?.records?.length || 0),
    });

    annotate(res, { source: 'sql', note: `${Number(payload?.current?.records?.length || 0)} current records` });
    return res.json({ ...payload, cached: false, stale: false });
  } catch (err) {
    log.error('[home-enquiries] Details fetch failed:', err.message);
    trackRouteFailed('Home.Enquiries.Details', startedAt, err, {
      operation: 'details',
      period,
      includePrevious: includePrevious ? 'true' : 'false',
      fetchAll: fetchAll ? 'true' : 'false',
      phase: 'primary-fetch',
    });

    try {
      const stale = await getCached(cacheKey, true);
      if (stale) {
        log.info('[home-enquiries] Returning stale details cache after error');
        trackRouteCompleted('Home.Enquiries.Details', startedAt, {
          operation: 'details',
          period,
          includePrevious: includePrevious ? 'true' : 'false',
          fetchAll: fetchAll ? 'true' : 'false',
          cacheState: 'stale-fallback',
          primaryFailed: 'true',
        }, {
          currentCount: Number(stale.data?.current?.records?.length || 0),
          previousCount: Number(stale.data?.previous?.records?.length || 0),
        });
        return res.json({ ...stale.data, cached: true, stale: true });
      }
    } catch {
      // ignore stale cache failures
    }

    return res.status(500).json({ error: err.message || 'Failed to fetch details' });
  }
});

router.post('/follow-up', async (req, res) => {
  const startedAt = Date.now();
  const channel = normalizeFollowUpChannel(req.body?.channel);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const lookupIds = Array.from(new Set([
    req.body?.enquiryId,
    req.body?.id,
    req.body?.processingEnquiryId,
    req.body?.pitchEnquiryId,
    req.body?.legacyEnquiryId,
  ].map((value) => String(value || '').trim()).filter(Boolean)));
  const enquiryId = lookupIds[0] || email;
  const recordedBy = String(req.body?.recordedBy || req.body?.initials || '').trim();
  const notes = String(req.body?.notes || '').trim().slice(0, 500);
  const connectionString = process.env.SQL_CONNECTION_STRING;

  if (!channel) {
    return res.status(400).json({ error: 'channel must be email or phone' });
  }

  if (!enquiryId) {
    return res.status(400).json({ error: 'enquiryId or email is required' });
  }

  trackEvent('Home.Enquiries.FollowUp.Started', {
    operation: 'follow-up',
    triggeredBy: 'home-dashboard',
    channel,
    enquiryId,
    recordedBy: recordedBy || '',
  });

  try {
    if (!connectionString) {
      throw new Error('SQL_CONNECTION_STRING is not configured');
    }

    const tableReady = await ensureEnquiryFollowUpsTable(connectionString);
    if (!tableReady) {
      throw new Error('Enquiry follow-up persistence is unavailable');
    }

    await withRequest(connectionString, async (request) => {
      await request
        .input('EnquiryId', sql.NVarChar(100), enquiryId)
        .input('Email', sql.NVarChar(255), email || null)
        .input('Channel', sql.NVarChar(20), channel)
        .input('RecordedBy', sql.NVarChar(255), recordedBy || null)
        .input('Notes', sql.NVarChar(500), notes || null)
        .query(`
          INSERT INTO dbo.EnquiryFollowUps (EnquiryId, Email, Channel, RecordedBy, Notes)
          VALUES (@EnquiryId, @Email, @Channel, @RecordedBy, @Notes)
        `);
    });

    const followUpLookup = await queryFollowUpDetails(connectionString, [{
      enquiryId,
      id: req.body?.id,
      processingEnquiryId: req.body?.processingEnquiryId,
      pitchEnquiryId: req.body?.pitchEnquiryId,
      legacyEnquiryId: req.body?.legacyEnquiryId,
      email,
    }]);

    const followUpSummary = lookupIds
      .map((value) => followUpLookup.byId.get(value))
      .find(Boolean)
      || followUpLookup.byId.get(enquiryId)
      || followUpLookup.byEmail.get(email)
      || null;

    trackRouteCompleted('Home.Enquiries.FollowUp', startedAt, {
      operation: 'follow-up',
      enquiryId,
      channel,
      recordedBy: recordedBy || '',
    }, {
      totalCount: Number(followUpSummary?.totalCount || 0),
    });

    return res.json({
      ok: true,
      enquiryId,
      channel,
      followUpSummary,
    });
  } catch (err) {
    trackRouteFailed('Home.Enquiries.FollowUp', startedAt, err, {
      operation: 'follow-up',
      enquiryId,
      channel: channel || '',
      recordedBy: recordedBy || '',
    });
    return res.status(500).json({ error: err.message || 'Failed to record follow-up' });
  }
});

/**
 * Fetch enquiry metrics from both databases and matters counts
 */
async function fetchEnquiryMetrics(email, initials) {
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysToMonday);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevToday = new Date(today);
  prevToday.setDate(today.getDate() - 7);
  const prevWeekStart = new Date(startOfWeek);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const widestStart = new Date(Math.min(
    prevMonthStart.getTime(),
    prevWeekStart.getTime(),
    prevToday.getTime(),
    startOfMonth.getTime()
  ));
  const [unifiedResult, mattersCounts] = await Promise.all([
    performUnifiedEnquiriesQuery({
      email,
      initials,
      sourcePolicy: 'operational',
      includeTeamInbox: 'false',
      processingApproach: 'unified',
      dateFrom: toIsoBoundary(widestStart),
      dateTo: toIsoBoundary(endOfToday),
      limit: '5000',
    }),
    queryMattersOpened(instructionsConnectionString, initials, today),
  ]);
  const prospectIds = collectProspectIdsFromUnifiedEnquiries(unifiedResult?.enquiries);
  const pitchedPids = await queryPitchedProspectIds(instructionsConnectionString, prospectIds);
  const projected = projectHomeSummaryFromUnifiedEnquiries(unifiedResult?.enquiries, pitchedPids, today);

  return {
    ...projected,
    mattersOpenedMonth: mattersCounts.userMatters,
    firmMattersOpenedMonth: mattersCounts.firmMatters,
  };
}

/**
 * Given a list of prospect IDs (acid / legacy ID), return the Set of those
 * that have at least one Deal with a non-null PitchedDate.
 * Used to answer "of my enquiries, how many have been pitched?"
 */
async function queryPitchedProspectIds(connectionString, prospectIds) {
  if (!connectionString || !prospectIds.length) return new Set();

  try {
    return await withRequest(connectionString, async (request) => {
      const params = prospectIds.map((pid, i) => {
        request.input(`pid${i}`, sql.NVarChar(100), pid);
        return `@pid${i}`;
      });

      const result = await request.query(`
        SELECT DISTINCT CAST(ProspectId AS NVARCHAR(100)) as pid
        FROM Deals
        WHERE CAST(ProspectId AS NVARCHAR(100)) IN (${params.join(',')})
          AND PitchedDate IS NOT NULL
      `);

      return new Set((result.recordset || []).map(r => String(r.pid).trim()));
    });
  } catch (err) {
    log.warn('[home-enquiries] Pitched prospect IDs query failed:', err.message);
    return new Set();
  }
}

function buildPeriodRanges(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  if (period === 'today') {
    const prevToday = new Date(today);
    prevToday.setDate(today.getDate() - 7);
    const prevEnd = new Date(prevToday);
    prevEnd.setHours(23, 59, 59, 999);
    return {
      currentStart: today,
      currentEnd: endOfToday,
      previousStart: prevToday,
      previousEnd: prevEnd,
      currentLabel: today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      previousLabel: prevToday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    };
  }

  if (period === 'weekToDate') {
    const prevWeekStart = new Date(startOfWeek);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(today);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
    prevWeekEnd.setHours(23, 59, 59, 999);
    return {
      currentStart: startOfWeek,
      currentEnd: endOfToday,
      previousStart: prevWeekStart,
      previousEnd: prevWeekEnd,
      currentLabel: `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${endOfToday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      previousLabel: `${prevWeekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${prevWeekEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
    };
  }

  if (period === 'yearToDate') {
    const prevYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate(), 23, 59, 59, 999);
    return {
      currentStart: startOfYear,
      currentEnd: endOfToday,
      previousStart: prevYearStart,
      previousEnd: prevYearEnd,
      currentLabel: `${startOfYear.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${endOfToday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      previousLabel: `${prevYearStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${prevYearEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
    };
  }

  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
  const prevMonthEnd = new Date(prevMonthStart);
  prevMonthEnd.setDate(Math.min(today.getDate(), prevMonthDays));
  prevMonthEnd.setHours(23, 59, 59, 999);
  return {
    currentStart: startOfMonth,
    currentEnd: endOfToday,
    previousStart: prevMonthStart,
    previousEnd: prevMonthEnd,
    currentLabel: `${startOfMonth.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${endOfToday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
    previousLabel: `${prevMonthStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${prevMonthEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
  };
}

/**
 * Query matters opened this month from instructions DB
 */
async function queryMattersOpened(connectionString, initials, today) {
  if (!connectionString) {
    log.warn('[home-enquiries] Instructions connection string not configured for matters');
    return { userMatters: 0, firmMatters: 0 };
  }

  try {
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const result = await withRequest(connectionString, async (request) => {
      request.input('startOfMonth', sql.DateTime2, startOfMonth);
      request.input('endOfMonth', sql.DateTime2, endOfMonth);
      
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials.toUpperCase());
      }

      // Count all matters opened this month (firm total)
      // And count matters where user is responsible solicitor
      return await request.query(`
        SELECT
          COUNT(*) as firm_total,
          COUNT(CASE 
            WHEN ${initials ? "UPPER(ResponsibleSolicitor) = @userInitials" : "1=0"} 
            THEN 1 
          END) as user_total
        FROM dbo.Matters
        WHERE OpenDate >= @startOfMonth 
          AND OpenDate <= @endOfMonth
          AND Status = 'Open'
      `);
    });

    const row = result.recordset?.[0] || {};
    return {
      userMatters: row.user_total || 0,
      firmMatters: row.firm_total || 0
    };
  } catch (err) {
    log.error('[home-enquiries] Matters query failed:', err.message);
    return { userMatters: 0, firmMatters: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers (same pattern as home-wip)
// ─────────────────────────────────────────────────────────────────────────────

async function getCached(key, allowStale = false) {
  // Try Redis first
  try {
    const redis = await getRedisClient();
    if (redis) {
      const cached = await redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._cachedAt || 0);
        const isStale = age > CACHE_TTL_SECONDS * 1000;
        
        if (!isStale || allowStale) {
          return { data: parsed.data, stale: isStale };
        }
      }
    }
  } catch (err) {
    log.warn('[home-enquiries] Redis get failed:', err.message);
  }

  // Fallback to memory cache
  const mem = memoryCache.get(key);
  if (mem) {
    const age = Date.now() - mem._cachedAt;
    const isStale = age > CACHE_TTL_SECONDS * 1000;
    if (!isStale || allowStale) {
      return { data: mem.data, stale: isStale };
    }
  }

  return null;
}

async function setCached(key, data) {
  const payload = { data, _cachedAt: Date.now() };

  // Store in memory cache
  memoryCache.set(key, payload);

  // Store in Redis with stale TTL
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.setEx(key, STALE_TTL_SECONDS, JSON.stringify(payload));
    }
  } catch (err) {
    log.warn('[home-enquiries] Redis set failed:', err.message);
  }
}

function clearHomeMemoryCache() {
  memoryCache.clear();
}

/**
 * POST /api/home-enquiries/pitch-lookup
 *
 * Lightweight endpoint: given prospect IDs and/or emails,
 * return pitch evidence from the Deals table.  Used by the client to enrich
 * seeded enquiry records that the user-scoped detail fetch doesn't cover.
 *
 * Body: { prospectIds: string[], emails: string[] }
 */
router.post('/pitch-lookup', express.json(), async (req, res) => {
  const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!instructionsConnStr) {
    return res.json({ byProspectId: {}, byEmail: {} });
  }

  const prospectIds = Array.isArray(req.body?.prospectIds)
    ? req.body.prospectIds.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const emails = Array.isArray(req.body?.emails)
    ? req.body.emails.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : [];

  if (prospectIds.length === 0 && emails.length === 0) {
    return res.json({ byProspectId: {}, byEmail: {} });
  }

  try {
    // Build pseudo-records that queryLatestPitchDetails expects
    const pseudoRecords = [
      ...prospectIds.map((pid) => ({ prospectIds: [pid], email: undefined })),
      ...emails.map((email) => ({ prospectIds: [], email })),
    ];
    const lookup = await queryLatestPitchDetails(instructionsConnStr, pseudoRecords);
    const byProspectId = Object.fromEntries(lookup.byProspectId);
    const byEmail = Object.fromEntries(lookup.byEmail);

    annotate(res, { source: 'live', note: `pitch-lookup pids=${prospectIds.length} emails=${emails.length}` });
    return res.json({ byProspectId, byEmail });
  } catch (err) {
    log.warn('[home-enquiries] Pitch lookup failed:', err.message);
    return res.json({ byProspectId: {}, byEmail: {} });
  }
});

module.exports = router;
module.exports.clearHomeMemoryCache = clearHomeMemoryCache;
