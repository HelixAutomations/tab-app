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

const router = express.Router();
const log = loggers.enquiries || console;

// Cache TTL: 60s fresh, stale data kept for fallback
const CACHE_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 300;

// In-memory fallback when Redis unavailable
const memoryCache = new Map();

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
  const { email, initials, overridden } = resolveUserOverride(req.query.email, req.query.initials);

  if (!email && !initials) {
    return res.status(400).json({ error: 'email or initials query parameter required' });
  }

  const cacheKey = generateCacheKey('homeEnquiries', email || initials);

  // Try cache first
  try {
    const cached = await getCached(cacheKey);
    if (cached && !cached.stale) {
      return res.json({ ...cached.data, cached: true, stale: false });
    }

    // Fetch fresh data
    const freshData = await fetchEnquiryMetrics(email, initials);

    // Store in cache (fire and forget)
    setCached(cacheKey, freshData).catch((err) => {
      log.warn('[home-enquiries] Cache set failed:', err.message);
    });

    return res.json({ ...freshData, cached: false, stale: false, overridden });
  } catch (err) {
    log.error('[home-enquiries] Fetch failed:', err.message);

    // Try stale cache as fallback
    try {
      const stale = await getCached(cacheKey, true);
      if (stale) {
        log.info('[home-enquiries] Returning stale cache after error');
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
 * GET /api/home-enquiries/details?email=<email>&initials=<initials>&period=<today|weekToDate|monthToDate>&limit=50
 * Returns sample rows for the requested period to help verify filtering.
 */
router.get('/details', async (req, res) => {
  const { email, initials, overridden } = resolveUserOverride(req.query.email, req.query.initials);
  const period = String(req.query.period || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 200);

  if (!email && !initials) {
    return res.status(400).json({ error: 'email or initials query parameter required' });
  }

  if (!['today', 'weekToDate', 'monthToDate'].includes(period)) {
    return res.status(400).json({ error: 'period must be today, weekToDate, or monthToDate' });
  }

  try {
    const ranges = buildPeriodRanges(period);
    const [currentMain, currentInst, prevMain, prevInst] = await Promise.all([
      queryMainDbRecords(process.env.SQL_CONNECTION_STRING, email, initials, ranges.currentStart, ranges.currentEnd, limit),
      queryInstructionsDbRecords(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING, email, initials, ranges.currentStart, ranges.currentEnd, limit),
      queryMainDbRecords(process.env.SQL_CONNECTION_STRING, email, initials, ranges.previousStart, ranges.previousEnd, limit),
      queryInstructionsDbRecords(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING, email, initials, ranges.previousStart, ranges.previousEnd, limit),
    ]);

    const current = dedupeDetailRecords([...currentMain, ...currentInst])
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, limit);
    const previous = dedupeDetailRecords([...prevMain, ...prevInst])
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, limit);

    return res.json({
      period,
      limit,
      currentRange: ranges.currentLabel,
      previousRange: ranges.previousLabel,
      current: { records: current },
      previous: { records: previous },
      filters: {
        email: email || undefined,
        initials: initials || undefined,
        includeTeamInbox: false,
        overridden: overridden || undefined,
      },
    });
  } catch (err) {
    log.error('[home-enquiries] Details fetch failed:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch details' });
  }
});

/**
 * Fetch enquiry metrics from both databases and matters counts
 */
async function fetchEnquiryMetrics(email, initials) {
  const mainConnectionString = process.env.SQL_CONNECTION_STRING;
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  // Calculate date boundaries (UK timezone aware)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Start of current week (Monday)
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysToMonday);
  
  // Start of current month
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // Previous period boundaries for comparison
  const prevToday = new Date(today);
  prevToday.setDate(today.getDate() - 7); // Same day last week
  
  const prevWeekStart = new Date(startOfWeek);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(prevToday);
  prevWeekEnd.setHours(23, 59, 59, 999);

  const prevFullWeekStart = new Date(startOfWeek);
  prevFullWeekStart.setDate(prevFullWeekStart.getDate() - 7);
  prevFullWeekStart.setHours(0, 0, 0, 0);
  const prevFullWeekEnd = new Date(startOfWeek);
  prevFullWeekEnd.setMilliseconds(prevFullWeekEnd.getMilliseconds() - 1);
  
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(prevMonthStart);
  const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
  prevMonthEnd.setDate(Math.min(today.getDate(), prevMonthDays));
  prevMonthEnd.setHours(23, 59, 59, 999);

  const prevFullMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevFullMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

  // End of today for inclusive queries
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  // Query both databases in parallel — fetch actual email+date rows for dedup
  // plus matters and pitched counts (which are Instructions-only, no dedup needed)
  const widestStart = new Date(Math.min(
    prevFullMonthStart.getTime(), prevFullWeekStart.getTime(),
    prevMonthStart.getTime(), prevWeekStart.getTime(), prevToday.getTime(),
    startOfMonth.getTime()
  ));
  const [mainRows, instRows, mattersCounts, mainBreakdown, instBreakdown] = await Promise.all([
    queryDbEmailRows(mainConnectionString, email, initials, widestStart, endOfToday, 'legacy'),
    queryDbEmailRows(instructionsConnectionString, email, initials, widestStart, endOfToday, 'instructions'),
    queryMattersOpened(instructionsConnectionString, initials, today),
    queryMainDbBreakdown(mainConnectionString, email, initials, {
      today, endOfToday, startOfWeek, startOfMonth
    }),
    queryInstructionsDbBreakdown(instructionsConnectionString, email, initials, {
      today, endOfToday, startOfWeek, startOfMonth
    }),
  ]);

  // Merge rows from both DBs and deduplicate by lowercase email + date string.
  // Records with the same enquiry email on the same day are the same enquiry.
  const allRows = [...mainRows, ...instRows];
  const dedupKey = (r) => `${(r.email || '').toLowerCase()}|${r.dateStr}`;

  // Map each dedup key to all its prospect IDs (from either DB)
  const keyToPids = new Map();
  for (const r of allRows) {
    const key = dedupKey(r);
    if (!keyToPids.has(key)) keyToPids.set(key, new Set());
    if (r.prospectId) keyToPids.get(key).add(r.prospectId);
  }

  // Collect all prospect IDs and check which have been pitched (have Deals)
  const allPids = new Set();
  for (const r of allRows) {
    if (r.prospectId) allPids.add(r.prospectId);
  }
  const pitchedPids = await queryPitchedProspectIds(instructionsConnectionString, [...allPids]);

  // Build unique set per period
  const countInRange = (start, end) => {
    const seen = new Set();
    for (const r of allRows) {
      if (r.dateMs >= start.getTime() && r.dateMs <= end.getTime()) {
        seen.add(dedupKey(r));
      }
    }
    return seen.size;
  };

  // Count deduped enquiries in range that have at least one pitched deal
  const countPitchedInRange = (start, end) => {
    const seen = new Set();
    let count = 0;
    for (const r of allRows) {
      const key = dedupKey(r);
      if (r.dateMs >= start.getTime() && r.dateMs <= end.getTime() && !seen.has(key)) {
        seen.add(key);
        const pids = keyToPids.get(key);
        if (pids && [...pids].some(pid => pitchedPids.has(pid))) {
          count++;
        }
      }
    }
    return count;
  };

  const enquiriesToday = countInRange(today, endOfToday);
  const enquiriesWeekToDate = countInRange(startOfWeek, endOfToday);
  const enquiriesMonthToDate = countInRange(startOfMonth, endOfToday);

  // Pick breakdown from whichever DB has more records (approximation until breakdown is deduped too)
  const pick = (mainObj, instObj) => {
    const mainCount = (mainObj?.aowTop || []).reduce((s, x) => s + x.count, 0);
    const instCount = (instObj?.aowTop || []).reduce((s, x) => s + x.count, 0);
    return mainCount >= instCount ? (mainObj || {}) : (instObj || {});
  };

  const breakdown = {
    today: pick(mainBreakdown?.today, instBreakdown?.today),
    weekToDate: pick(mainBreakdown?.weekToDate, instBreakdown?.weekToDate),
    monthToDate: pick(mainBreakdown?.monthToDate, instBreakdown?.monthToDate),
  };

  return {
    enquiriesToday,
    enquiriesWeekToDate,
    enquiriesMonthToDate,
    prevEnquiriesToday: countInRange(prevToday, new Date(prevToday.getTime() + 24*60*60*1000 - 1)),
    prevEnquiriesWeekToDate: countInRange(prevWeekStart, prevWeekEnd),
    prevEnquiriesMonthToDate: countInRange(prevMonthStart, prevMonthEnd),
    prevEnquiriesWeekFull: countInRange(prevFullWeekStart, prevFullWeekEnd),
    prevEnquiriesMonthFull: countInRange(prevFullMonthStart, prevFullMonthEnd),
    pitchedToday: countPitchedInRange(today, endOfToday),
    pitchedWeekToDate: countPitchedInRange(startOfWeek, endOfToday),
    pitchedMonthToDate: countPitchedInRange(startOfMonth, endOfToday),
    prevPitchedToday: countPitchedInRange(prevToday, new Date(prevToday.getTime() + 24*60*60*1000 - 1)),
    prevPitchedWeekToDate: countPitchedInRange(prevWeekStart, prevWeekEnd),
    prevPitchedMonthToDate: countPitchedInRange(prevMonthStart, prevMonthEnd),
    mattersOpenedMonth: mattersCounts.userMatters,
    firmMattersOpenedMonth: mattersCounts.firmMatters,
    breakdown,
  };
}

/**
 * Fetch email + date rows from a database for cross-DB deduplication.
 * Returns lightweight objects: { email, dateStr, dateMs, source }
 */
async function queryDbEmailRows(connectionString, email, initials, rangeStart, rangeEnd, source) {
  if (!connectionString) return [];

  const isLegacy = source === 'legacy';
  const pocField = isLegacy ? 'Point_of_Contact' : 'poc';
  const dateField = isLegacy ? 'Touchpoint_Date' : 'datetime';
  const emailField = isLegacy ? 'Email' : 'email';
  const table = isLegacy ? 'enquiries' : 'dbo.enquiries';

  try {
    return await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push(`LOWER(LTRIM(RTRIM(${pocField}))) = @userEmail`);
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push(buildInitialsMatchSql(pocField));
      }
      if (pocConditions.length === 0) return [];

      request.input('rangeStart', sql.DateTime2, rangeStart);
      request.input('rangeEnd', sql.DateTime2, rangeEnd);

      const idField = isLegacy ? 'ID' : 'acid';

      const result = await request.query(`
        SELECT
          LOWER(LTRIM(RTRIM(${emailField}))) as email,
          ${dateField} as enquiryDate,
          ${idField} as prospectId
        FROM ${table}
        WHERE (${pocConditions.join(' OR ')})
          AND ${dateField} >= @rangeStart
          AND ${dateField} <= @rangeEnd
      `);

      return (result.recordset || []).map((r) => {
        const d = new Date(r.enquiryDate);
        return {
          email: r.email || '',
          dateStr: d.toISOString().slice(0, 10),
          dateMs: d.getTime(),
          source,
          prospectId: r.prospectId != null ? String(r.prospectId) : null,
        };
      });
    });
  } catch (err) {
    log.warn(`[home-enquiries] ${source} DB email rows query failed:`, err.message);
    return [];
  }
}

/**
 * Query AoW breakdown from main (legacy) DB — no counts, just breakdown structure.
 */
async function queryMainDbBreakdown(connectionString, email, initials, dates) {
  if (!connectionString) return undefined;

  try {
    return await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(Point_of_Contact))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push(buildInitialsMatchSql('Point_of_Contact'));
      }
      if (pocConditions.length === 0) return undefined;

      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('today', sql.DateTime2, dates.today);
      request.input('endOfToday', sql.DateTime2, dates.endOfToday);
      request.input('startOfWeek', sql.DateTime2, dates.startOfWeek);
      request.input('startOfMonth', sql.DateTime2, dates.startOfMonth);

      const buildAowTop = async (rangeStartParam, rangeEndParam) => {
        const aowResult = await request.query(`
          SELECT TOP (3)
            COALESCE(NULLIF(LTRIM(RTRIM(Area_of_Work)), ''), 'Other') as aow,
            COUNT(1) as c
          FROM enquiries
          WHERE ${pocFilter}
            AND Touchpoint_Date >= ${rangeStartParam}
            AND Touchpoint_Date <= ${rangeEndParam}
          GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(Area_of_Work)), ''), 'Other')
          ORDER BY COUNT(1) DESC
        `);
        return (aowResult.recordset || [])
          .map((r) => ({ key: String(r.aow || 'Other'), count: Number(r.c || 0) }))
          .filter((x) => x.count > 0);
      };

      const [aowToday, aowWeek, aowMonth] = await Promise.all([
        buildAowTop('@today', '@endOfToday'),
        buildAowTop('@startOfWeek', '@endOfToday'),
        buildAowTop('@startOfMonth', '@endOfToday'),
      ]);

      return {
        today: { aowTop: aowToday },
        weekToDate: { aowTop: aowWeek },
        monthToDate: { aowTop: aowMonth },
      };
    });
  } catch (err) {
    log.warn('[home-enquiries] Main DB breakdown query failed:', err.message);
    return undefined;
  }
}

/**
 * Query AoW breakdown from instructions DB — no counts, just breakdown structure.
 */
async function queryInstructionsDbBreakdown(connectionString, email, initials, dates) {
  if (!connectionString) return undefined;

  try {
    return await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(poc))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push(buildInitialsMatchSql('poc'));
      }
      if (pocConditions.length === 0) return undefined;

      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('today', sql.DateTime2, dates.today);
      request.input('endOfToday', sql.DateTime2, dates.endOfToday);
      request.input('startOfWeek', sql.DateTime2, dates.startOfWeek);
      request.input('startOfMonth', sql.DateTime2, dates.startOfMonth);

      const buildAowTop = async (rangeStartParam, rangeEndParam) => {
        const aowResult = await request.query(`
          SELECT TOP (3)
            COALESCE(NULLIF(LTRIM(RTRIM(aow)), ''), 'Other') as aow,
            COUNT(1) as c
          FROM dbo.enquiries
          WHERE ${pocFilter}
            AND datetime >= ${rangeStartParam}
            AND datetime <= ${rangeEndParam}
          GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(aow)), ''), 'Other')
          ORDER BY COUNT(1) DESC
        `);
        return (aowResult.recordset || [])
          .map((r) => ({ key: String(r.aow || 'Other'), count: Number(r.c || 0) }))
          .filter((x) => x.count > 0);
      };

      const [aowToday, aowWeek, aowMonth] = await Promise.all([
        buildAowTop('@today', '@endOfToday'),
        buildAowTop('@startOfWeek', '@endOfToday'),
        buildAowTop('@startOfMonth', '@endOfToday'),
      ]);

      return {
        today: { aowTop: aowToday },
        weekToDate: { aowTop: aowWeek },
        monthToDate: { aowTop: aowMonth },
      };
    });
  } catch (err) {
    log.warn('[home-enquiries] Instructions DB breakdown query failed:', err.message);
    return undefined;
  }
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

async function queryMainDbRecords(connectionString, email, initials, rangeStart, rangeEnd, limit) {
  if (!connectionString) return [];

  try {
    const result = await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(Point_of_Contact))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push(buildInitialsMatchSql('Point_of_Contact'));
      }
      // User-scoped metrics only (no team inbox)
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('rangeStart', sql.DateTime2, rangeStart);
      request.input('rangeEnd', sql.DateTime2, rangeEnd);
      request.input('limit', sql.Int, limit);

      const rows = await request.query(`
        SELECT TOP (@limit)
          CONVERT(VARCHAR(19), Touchpoint_Date, 120) as date,
          LTRIM(RTRIM(Point_of_Contact)) as poc,
          COALESCE(NULLIF(LTRIM(RTRIM(Area_of_Work)), ''), 'Other') as aow,
          CAST(ID as VARCHAR(50)) as id,
          LTRIM(RTRIM(First_Name)) as firstName,
          LTRIM(RTRIM(Last_Name)) as lastName
        FROM enquiries
        WHERE ${pocFilter}
          AND Touchpoint_Date >= @rangeStart
          AND Touchpoint_Date <= @rangeEnd
        ORDER BY Touchpoint_Date DESC
      `);
      return (rows.recordset || []).map((r) => {
        const parts = [r.firstName, r.lastName].filter(Boolean);
        return {
          date: r.date,
          poc: r.poc,
          aow: r.aow,
          id: r.id,
          name: parts.length > 0 ? parts.join(' ') : undefined,
          stage: 'enquiry',
          pipelineStage: 'enquiry',
          source: 'legacy',
        };
      });
    });
    return result;
  } catch (err) {
    log.warn('[home-enquiries] Main records query failed:', err.message);
    return [];
  }
}

async function queryInstructionsDbRecords(connectionString, email, initials, rangeStart, rangeEnd, limit) {
  if (!connectionString) return [];

  try {
    const rangeStartMs = rangeStart.getTime();
    const rangeEndMs = rangeEnd.getTime();
    const result = await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(e.poc))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push(buildInitialsMatchSql('e.poc'));
      }
      // User-scoped metrics only (no team inbox)
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('rangeStart', sql.DateTime2, rangeStart);
      request.input('rangeEnd', sql.DateTime2, rangeEnd);
      request.input('limit', sql.Int, limit);

      const rows = await request.query(`
        SELECT TOP (@limit)
          CONVERT(VARCHAR(19), e.datetime, 120) as enquiryDate,
          CONVERT(VARCHAR(19), COALESCE(
            TRY_CONVERT(DATETIME2, CONCAT(d.PitchedDate, ' ', COALESCE(NULLIF(d.PitchedTime, ''), '00:00:00'))),
            TRY_CONVERT(DATETIME2, d.PitchedDate)
          ), 120) as pitchDate,
          CONVERT(VARCHAR(19), COALESCE(ins.LastUpdated, CAST(ins.SubmissionDate AS DATETIME2)), 120) as instructionDate,
          LTRIM(RTRIM(e.poc)) as poc,
          COALESCE(NULLIF(LTRIM(RTRIM(e.aow)), ''), 'Other') as aow,
          LTRIM(RTRIM(e.first)) as firstName,
          LTRIM(RTRIM(e.last)) as lastName,
          CAST(e.id AS NVARCHAR(100)) as enquiryId,
          LTRIM(RTRIM(CAST(e.acid AS NVARCHAR(100)))) as acid,
          LTRIM(RTRIM(e.stage)) as stage,
          t.ChannelId   as teamsChannelId,
          t.TeamId       as teamsTeamId,
          t.CardType     as teamsCardType,
          t.Stage        as teamsStage,
          t.ClaimedBy    as teamsClaimed,
          t.TeamsMessageId as teamsMessageId,
          t.ActivityId   as teamsActivityId,
          DATEDIFF_BIG(MILLISECOND, '1970-01-01', t.CreatedAt) AS teamsCreatedAtMs,
          CASE
            WHEN ins.MatterId IS NOT NULL THEN 'instructed'
            WHEN ins.Stage IN ('proof-of-id-complete', 'completed') THEN 'instructed'
            WHEN ins.Stage = 'pitch' THEN 'pitched'
            WHEN d.PitchedDate IS NOT NULL THEN 'pitched'
            WHEN t.Stage IS NOT NULL THEN t.Stage
            ELSE e.stage
          END as pipelineStage,
          CASE WHEN d.PitchedDate IS NOT NULL OR ins.Stage = 'pitch' THEN 1 ELSE 0 END as hasPitch,
          CASE WHEN ins.MatterId IS NOT NULL OR ins.Stage IN ('proof-of-id-complete', 'completed') THEN 1 ELSE 0 END as hasInstruction
        FROM dbo.enquiries e
        LEFT JOIN (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY EnquiryId ORDER BY CreatedAt DESC) AS rn
          FROM dbo.TeamsBotActivityTracking
          WHERE Status = 'active'
        ) t ON t.EnquiryId = e.id AND t.rn = 1
        LEFT JOIN (
          SELECT ProspectId, PitchedDate, PitchedTime, InstructionRef,
                 ROW_NUMBER() OVER (
                   PARTITION BY ProspectId
                   ORDER BY TRY_CONVERT(DATETIME2, CONCAT(PitchedDate, ' ', COALESCE(NULLIF(PitchedTime, ''), '00:00:00'))) DESC,
                            TRY_CONVERT(DATETIME2, PitchedDate) DESC
                 ) AS rn
          FROM Deals
          WHERE PitchedDate IS NOT NULL
        ) d ON d.rn = 1 AND (
          CAST(d.ProspectId AS NVARCHAR(100)) = CAST(e.id AS NVARCHAR(100))
          OR CAST(d.ProspectId AS NVARCHAR(100)) = LTRIM(RTRIM(CAST(e.acid AS NVARCHAR(100))))
        )
        LEFT JOIN Instructions ins ON ins.InstructionRef = d.InstructionRef
        WHERE ${pocFilter}
          AND (
            (e.datetime >= @rangeStart AND e.datetime <= @rangeEnd)
            OR (
              COALESCE(
                TRY_CONVERT(DATETIME2, CONCAT(d.PitchedDate, ' ', COALESCE(NULLIF(d.PitchedTime, ''), '00:00:00'))),
                TRY_CONVERT(DATETIME2, d.PitchedDate)
              ) >= @rangeStart
              AND COALESCE(
                TRY_CONVERT(DATETIME2, CONCAT(d.PitchedDate, ' ', COALESCE(NULLIF(d.PitchedTime, ''), '00:00:00'))),
                TRY_CONVERT(DATETIME2, d.PitchedDate)
              ) <= @rangeEnd
            )
            OR (
              COALESCE(ins.LastUpdated, CAST(ins.SubmissionDate AS DATETIME2)) >= @rangeStart
              AND COALESCE(ins.LastUpdated, CAST(ins.SubmissionDate AS DATETIME2)) <= @rangeEnd
            )
          )
        ORDER BY
          COALESCE(
            ins.LastUpdated,
            CAST(ins.SubmissionDate AS DATETIME2),
            TRY_CONVERT(DATETIME2, CONCAT(d.PitchedDate, ' ', COALESCE(NULLIF(d.PitchedTime, ''), '00:00:00'))),
            TRY_CONVERT(DATETIME2, d.PitchedDate),
            e.datetime
          ) DESC
      `);
      return (rows.recordset || []).flatMap((r) => {
        const parts = [r.firstName, r.lastName].filter(Boolean);
        let teamsLink = null;
        let teamsChannel = null;
        if (r.teamsChannelId && r.teamsTeamId) {
          teamsLink = buildTeamsDeepLink(r.teamsChannelId, r.teamsActivityId, r.teamsTeamId, r.teamsMessageId, r.teamsCreatedAtMs);
          teamsChannel = resolveChannelName(r.teamsChannelId);
        }
        const base = {
          enquiryId: r.enquiryId || undefined,
          poc: r.poc,
          aow: r.aow,
          name: parts.length > 0 ? parts.join(' ') : undefined,
          source: 'instructions',
          teamsChannel: teamsChannel || undefined,
          teamsCardType: r.teamsCardType || undefined,
          teamsStage: r.teamsStage || undefined,
          teamsClaimed: r.teamsClaimed || undefined,
          teamsLink: teamsLink || undefined,
          pipelineStage: r.pipelineStage || r.teamsStage || r.stage || undefined,
        };

        const out = [];
        const enquiryMs = r.enquiryDate ? Date.parse(r.enquiryDate) : NaN;
        const pitchMs = r.pitchDate ? Date.parse(r.pitchDate) : NaN;
        const instructionMs = r.instructionDate ? Date.parse(r.instructionDate) : NaN;

        if (Number.isFinite(enquiryMs) && enquiryMs >= rangeStartMs && enquiryMs <= rangeEndMs) {
          out.push({ ...base, date: r.enquiryDate, stage: 'enquiry' });
        }
        if (Number.isFinite(pitchMs) && pitchMs >= rangeStartMs && pitchMs <= rangeEndMs && Number(r.hasPitch) > 0) {
          out.push({ ...base, date: r.pitchDate, stage: 'pitched' });
        }
        if (Number.isFinite(instructionMs) && instructionMs >= rangeStartMs && instructionMs <= rangeEndMs && Number(r.hasInstruction) > 0) {
          out.push({ ...base, date: r.instructionDate, stage: 'instructed' });
        }

        return out;
      });
    });
    return result;
  } catch (err) {
    log.warn('[home-enquiries] Instructions records query failed:', err.message);
    return [];
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Teams deep link helpers (mirrors teamsActivityTracking.js logic)
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

/** Resolve a message ID (epoch ms) from various formats */
function resolveMessageId(value) {
  if (!value) return null;
  if (typeof value === 'number' && value > 1640995200000) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('0:')) {
    const tail = raw.split(':')[1];
    if (tail && /^\d{13,}$/.test(tail)) return Number(tail);
  }
  const match = raw.match(/\d{13,}/);
  if (match) return Number(match[0]);
  return null;
}

function buildTeamsDeepLink(channelId, activityId, teamId, teamsMessageId, createdAtMs) {
  if (!channelId || !teamId) return null;
  const messageId = resolveMessageId(teamsMessageId) || resolveMessageId(activityId) || resolveMessageId(createdAtMs);
  if (!messageId) return null;
  const token = String(messageId);
  const channelName = resolveChannelName(channelId);
  return `https://teams.microsoft.com/l/message/${channelId}/${token}?tenantId=${TENANT_ID}&groupId=${encodeURIComponent(teamId)}&parentMessageId=${token}&teamName=${encodeURIComponent('Helix Law')}&channelName=${encodeURIComponent(channelName)}&createdTime=${messageId}`;
}

function resolveChannelName(channelId) {
  if (!channelId) return 'General';
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) return 'Commercial';
  if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) return 'Construction';
  if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) return 'Property';
  if (channelId.includes('9e1c8918bca747f5afc9ca5acbd89683')) return 'Employment';
  if (channelId.includes('033cf7072dae4900b661c2c19c36c90e')) return 'Commercial';
  if (channelId.includes('ac1bc6fba0d4479ba96e041198cebc40')) return 'Construction';
  if (channelId.includes('9eddeca7cbcd4aebba1b4d43f80b779b')) return 'Employment';
  if (channelId.includes('2e0082c66bdd47ebacc6496ebd7a8ed8')) return 'Property';
  if (channelId.includes('3fccda9236ee4dcbb3989566baca35ba')) return 'Triage';
  if (channelId.includes('cd13d45296d64fc493f74d9c00f669f6')) return 'Triage';
  if (channelId.includes('83484a22d83941fd93710c08b821cbb2')) return 'Outreach';
  return 'General';
}

module.exports = router;
