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
  if (email === 'lz@helix-law.com' || initials === 'lz') {
    return { email: 'ac@helix-law.com', initials: 'ac', overridden: true };
  }
  return { email, initials, overridden: false };
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

    const current = [...currentMain, ...currentInst].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);
    const previous = [...prevMain, ...prevInst].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);

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

  // Query both databases in parallel
  const [mainCounts, instCounts, mattersCounts, pitchedCounts] = await Promise.all([
    queryMainDbCounts(mainConnectionString, email, initials, {
      today, endOfToday, startOfWeek, startOfMonth,
      prevToday, prevWeekStart, prevWeekEnd, prevMonthStart, prevMonthEnd,
      prevFullWeekStart, prevFullWeekEnd, prevFullMonthStart, prevFullMonthEnd
    }),
    queryInstructionsDbCounts(instructionsConnectionString, email, initials, {
      today, endOfToday, startOfWeek, startOfMonth,
      prevToday, prevWeekStart, prevWeekEnd, prevMonthStart, prevMonthEnd,
      prevFullWeekStart, prevFullWeekEnd, prevFullMonthStart, prevFullMonthEnd
    }),
    queryMattersOpened(instructionsConnectionString, initials, today),
    queryPitchedCounts(instructionsConnectionString, email, initials, {
      today, endOfToday, startOfWeek, startOfMonth,
      prevToday, prevWeekStart, prevWeekEnd, prevMonthStart, prevMonthEnd
    })
  ]);

  // For enquiries we need to be careful about double-counting across DBs.
  // Since migrated records exist in both, we take the MAX of each DB's count.
  // For breakdowns, we pick the breakdown from the same DB that provided the MAX.
  const pick = (mainValue, instValue, mainObj, instObj) => (mainValue >= instValue ? (mainObj || {}) : (instObj || {}));

  const enquiriesToday = Math.max(mainCounts.today, instCounts.today);
  const enquiriesWeekToDate = Math.max(mainCounts.weekToDate, instCounts.weekToDate);
  const enquiriesMonthToDate = Math.max(mainCounts.monthToDate, instCounts.monthToDate);

  const breakdown = {
    today: pick(mainCounts.today, instCounts.today, mainCounts.breakdown?.today, instCounts.breakdown?.today),
    weekToDate: pick(mainCounts.weekToDate, instCounts.weekToDate, mainCounts.breakdown?.weekToDate, instCounts.breakdown?.weekToDate),
    monthToDate: pick(mainCounts.monthToDate, instCounts.monthToDate, mainCounts.breakdown?.monthToDate, instCounts.breakdown?.monthToDate),
  };

  return {
    enquiriesToday,
    enquiriesWeekToDate,
    enquiriesMonthToDate,
    prevEnquiriesToday: Math.max(mainCounts.prevToday, instCounts.prevToday),
    prevEnquiriesWeekToDate: Math.max(mainCounts.prevWeekToDate, instCounts.prevWeekToDate),
    prevEnquiriesMonthToDate: Math.max(mainCounts.prevMonthToDate, instCounts.prevMonthToDate),
    prevEnquiriesWeekFull: Math.max(mainCounts.prevWeekFull || 0, instCounts.prevWeekFull || 0),
    prevEnquiriesMonthFull: Math.max(mainCounts.prevMonthFull || 0, instCounts.prevMonthFull || 0),
    pitchedToday: pitchedCounts.today,
    pitchedWeekToDate: pitchedCounts.weekToDate,
    pitchedMonthToDate: pitchedCounts.monthToDate,
    prevPitchedToday: pitchedCounts.prevToday,
    prevPitchedWeekToDate: pitchedCounts.prevWeekToDate,
    prevPitchedMonthToDate: pitchedCounts.prevMonthToDate,
    mattersOpenedMonth: mattersCounts.userMatters,
    firmMattersOpenedMonth: mattersCounts.firmMatters,
    breakdown,
  };
}

async function queryPitchedCounts(connectionString, email, initials, dates) {
  if (!connectionString) {
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0, prevWeekFull: 0, prevMonthFull: 0 };
  }

  try {
    const result = await withRequest(connectionString, async (request) => {
      const pitchedByConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pitchedByConditions.push("LOWER(LTRIM(RTRIM(PitchedBy))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pitchedByConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(PitchedBy)), ' ', ''), '.', '')) = @userInitials");
      }
      if (pitchedByConditions.length === 0) {
        return { today_count: 0, week_count: 0, month_count: 0, prev_today_count: 0, prev_week_count: 0, prev_month_count: 0 };
      }

      const pitchedByFilter = `(${pitchedByConditions.join(' OR ')})`;

      request.input('today', sql.DateTime2, dates.today);
      request.input('endOfToday', sql.DateTime2, dates.endOfToday);
      request.input('startOfWeek', sql.DateTime2, dates.startOfWeek);
      request.input('startOfMonth', sql.DateTime2, dates.startOfMonth);
      request.input('prevToday', sql.DateTime2, dates.prevToday);
      request.input('prevTodayEnd', sql.DateTime2, new Date(dates.prevToday.getTime() + 24*60*60*1000 - 1));
      request.input('prevWeekStart', sql.DateTime2, dates.prevWeekStart);
      request.input('prevWeekEnd', sql.DateTime2, dates.prevWeekEnd);
      request.input('prevMonthStart', sql.DateTime2, dates.prevMonthStart);
      request.input('prevMonthEnd', sql.DateTime2, dates.prevMonthEnd);
      request.input('prevFullWeekStart', sql.DateTime2, dates.prevFullWeekStart);
      request.input('prevFullWeekEnd', sql.DateTime2, dates.prevFullWeekEnd);
      request.input('prevFullMonthStart', sql.DateTime2, dates.prevFullMonthStart);
      request.input('prevFullMonthEnd', sql.DateTime2, dates.prevFullMonthEnd);

      const countsResult = await request.query(`
        SELECT
          COUNT(CASE WHEN PitchedDate >= @today AND PitchedDate <= @endOfToday THEN 1 END) as today_count,
          COUNT(CASE WHEN PitchedDate >= @startOfWeek AND PitchedDate <= @endOfToday THEN 1 END) as week_count,
          COUNT(CASE WHEN PitchedDate >= @startOfMonth AND PitchedDate <= @endOfToday THEN 1 END) as month_count,
          COUNT(CASE WHEN PitchedDate >= @prevToday AND PitchedDate <= @prevTodayEnd THEN 1 END) as prev_today_count,
          COUNT(CASE WHEN PitchedDate >= @prevWeekStart AND PitchedDate <= @prevWeekEnd THEN 1 END) as prev_week_count,
          COUNT(CASE WHEN PitchedDate >= @prevMonthStart AND PitchedDate <= @prevMonthEnd THEN 1 END) as prev_month_count
        FROM Deals
        WHERE ${pitchedByFilter}
          AND PitchedDate IS NOT NULL
      `);

      return countsResult.recordset?.[0] || {};
    });

    return {
      today: Number(result.today_count || 0),
      weekToDate: Number(result.week_count || 0),
      monthToDate: Number(result.month_count || 0),
      prevToday: Number(result.prev_today_count || 0),
      prevWeekToDate: Number(result.prev_week_count || 0),
      prevMonthToDate: Number(result.prev_month_count || 0),
    };
  } catch (err) {
    log.warn('[home-enquiries] Pitched counts query failed:', err.message);
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0 };
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
        pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(Point_of_Contact)), ' ', ''), '.', '')) = @userInitials");
      }
      // User-scoped metrics only (no team inbox)
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('rangeStart', sql.DateTime2, rangeStart);
      request.input('rangeEnd', sql.DateTime2, rangeEnd);
      request.input('limit', sql.Int, limit);

      const rows = await request.query(`
        SELECT TOP (@limit)
          CONVERT(VARCHAR(19), Date_Created, 120) as date,
          LTRIM(RTRIM(Point_of_Contact)) as poc,
          COALESCE(NULLIF(LTRIM(RTRIM(Area_of_Work)), ''), 'Other') as aow,
          CAST(ID as VARCHAR(50)) as id
        FROM enquiries
        WHERE ${pocFilter}
          AND Date_Created >= @rangeStart
          AND Date_Created <= @rangeEnd
        ORDER BY Date_Created DESC
      `);
      return (rows.recordset || []).map((r) => ({
        date: r.date,
        poc: r.poc,
        aow: r.aow,
        id: r.id,
        source: 'legacy',
      }));
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
    const result = await withRequest(connectionString, async (request) => {
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(poc))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(poc)), ' ', ''), '.', '')) = @userInitials");
      }
      // User-scoped metrics only (no team inbox)
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      request.input('rangeStart', sql.DateTime2, rangeStart);
      request.input('rangeEnd', sql.DateTime2, rangeEnd);
      request.input('limit', sql.Int, limit);

      const rows = await request.query(`
        SELECT TOP (@limit)
          CONVERT(VARCHAR(19), datetime, 120) as date,
          LTRIM(RTRIM(poc)) as poc,
          COALESCE(NULLIF(LTRIM(RTRIM(aow)), ''), 'Other') as aow
        FROM dbo.enquiries
        WHERE ${pocFilter}
          AND datetime >= @rangeStart
          AND datetime <= @rangeEnd
        ORDER BY datetime DESC
      `);
      return (rows.recordset || []).map((r) => ({
        date: r.date,
        poc: r.poc,
        aow: r.aow,
        source: 'instructions',
      }));
    });
    return result;
  } catch (err) {
    log.warn('[home-enquiries] Instructions records query failed:', err.message);
    return [];
  }
}

/**
 * Query main (legacy) enquiries database for counts
 */
async function queryMainDbCounts(connectionString, email, initials, dates) {
  if (!connectionString) {
    log.warn('[home-enquiries] Main connection string not configured');
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0 };
  }

  try {
    const result = await withRequest(connectionString, async (request) => {
      // Build POC filter
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(Point_of_Contact))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(Point_of_Contact)), ' ', ''), '.', '')) = @userInitials");
      }
      // User-scoped metrics only (no team inbox)
      
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      // Set date parameters
      request.input('today', sql.DateTime2, dates.today);
      request.input('endOfToday', sql.DateTime2, dates.endOfToday);
      request.input('startOfWeek', sql.DateTime2, dates.startOfWeek);
      request.input('startOfMonth', sql.DateTime2, dates.startOfMonth);
      request.input('prevToday', sql.DateTime2, dates.prevToday);
      request.input('prevTodayEnd', sql.DateTime2, new Date(dates.prevToday.getTime() + 24*60*60*1000 - 1));
      request.input('prevWeekStart', sql.DateTime2, dates.prevWeekStart);
      request.input('prevWeekEnd', sql.DateTime2, dates.prevWeekEnd);
      request.input('prevMonthStart', sql.DateTime2, dates.prevMonthStart);
      request.input('prevMonthEnd', sql.DateTime2, dates.prevMonthEnd);

      const countsResult = await request.query(`
        SELECT
          COUNT(CASE WHEN Date_Created >= @today AND Date_Created <= @endOfToday THEN 1 END) as today_count,
          COUNT(CASE WHEN Date_Created >= @startOfWeek AND Date_Created <= @endOfToday THEN 1 END) as week_count,
          COUNT(CASE WHEN Date_Created >= @startOfMonth AND Date_Created <= @endOfToday THEN 1 END) as month_count,
          COUNT(CASE WHEN Date_Created >= @prevToday AND Date_Created <= @prevTodayEnd THEN 1 END) as prev_today_count,
          COUNT(CASE WHEN Date_Created >= @prevWeekStart AND Date_Created <= @prevWeekEnd THEN 1 END) as prev_week_count,
          COUNT(CASE WHEN Date_Created >= @prevMonthStart AND Date_Created <= @prevMonthEnd THEN 1 END) as prev_month_count,
          COUNT(CASE WHEN Date_Created >= @prevFullWeekStart AND Date_Created <= @prevFullWeekEnd THEN 1 END) as prev_week_full_count,
          COUNT(CASE WHEN Date_Created >= @prevFullMonthStart AND Date_Created <= @prevFullMonthEnd THEN 1 END) as prev_month_full_count
        FROM enquiries
        WHERE ${pocFilter}
      `);

      const buildAowTop = async (rangeStartParam, rangeEndParam) => {
        const aowResult = await request.query(`
          SELECT TOP (3)
            COALESCE(NULLIF(LTRIM(RTRIM(Area_of_Work)), ''), 'Other') as aow,
            COUNT(1) as c
          FROM enquiries
          WHERE ${pocFilter}
            AND Date_Created >= ${rangeStartParam}
            AND Date_Created <= ${rangeEndParam}
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

      const row = countsResult.recordset?.[0] || {};
      return {
        row,
        breakdown: {
          today: { aowTop: aowToday },
          weekToDate: { aowTop: aowWeek },
          monthToDate: { aowTop: aowMonth },
        },
      };
    });

    const row = result?.row || {};
    return {
      today: row.today_count || 0,
      weekToDate: row.week_count || 0,
      monthToDate: row.month_count || 0,
      prevToday: row.prev_today_count || 0,
      prevWeekToDate: row.prev_week_count || 0,
      prevMonthToDate: row.prev_month_count || 0,
      prevWeekFull: row.prev_week_full_count || 0,
      prevMonthFull: row.prev_month_full_count || 0,
      breakdown: result?.breakdown || undefined,
    };
  } catch (err) {
    log.error('[home-enquiries] Main DB query failed:', err.message);
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0, prevWeekFull: 0, prevMonthFull: 0, breakdown: undefined };
  }
}

/**
 * Query instructions database for enquiry counts
 */
async function queryInstructionsDbCounts(connectionString, email, initials, dates) {
  if (!connectionString) {
    log.warn('[home-enquiries] Instructions connection string not configured');
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0, prevWeekFull: 0, prevMonthFull: 0 };
  }

  try {
    const result = await withRequest(connectionString, async (request) => {
      // Build POC filter for instructions DB (uses 'poc' field)
      const pocConditions = [];
      if (email) {
        request.input('userEmail', sql.VarChar(255), email);
        pocConditions.push("LOWER(LTRIM(RTRIM(poc))) = @userEmail");
      }
      if (initials) {
        request.input('userInitials', sql.VarChar(50), initials);
        pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(poc)), ' ', ''), '.', '')) = @userInitials");
      }
      // User-scoped metrics only (no team inbox)
      
      const pocFilter = `(${pocConditions.join(' OR ')})`;

      // Set date parameters
      request.input('today', sql.DateTime2, dates.today);
      request.input('endOfToday', sql.DateTime2, dates.endOfToday);
      request.input('startOfWeek', sql.DateTime2, dates.startOfWeek);
      request.input('startOfMonth', sql.DateTime2, dates.startOfMonth);
      request.input('prevToday', sql.DateTime2, dates.prevToday);
      request.input('prevTodayEnd', sql.DateTime2, new Date(dates.prevToday.getTime() + 24*60*60*1000 - 1));
      request.input('prevWeekStart', sql.DateTime2, dates.prevWeekStart);
      request.input('prevWeekEnd', sql.DateTime2, dates.prevWeekEnd);
      request.input('prevMonthStart', sql.DateTime2, dates.prevMonthStart);
      request.input('prevMonthEnd', sql.DateTime2, dates.prevMonthEnd);
      request.input('prevFullWeekStart', sql.DateTime2, dates.prevFullWeekStart);
      request.input('prevFullWeekEnd', sql.DateTime2, dates.prevFullWeekEnd);
      request.input('prevFullMonthStart', sql.DateTime2, dates.prevFullMonthStart);
      request.input('prevFullMonthEnd', sql.DateTime2, dates.prevFullMonthEnd);

      const countsResult = await request.query(`
        SELECT
          COUNT(CASE WHEN datetime >= @today AND datetime <= @endOfToday THEN 1 END) as today_count,
          COUNT(CASE WHEN datetime >= @startOfWeek AND datetime <= @endOfToday THEN 1 END) as week_count,
          COUNT(CASE WHEN datetime >= @startOfMonth AND datetime <= @endOfToday THEN 1 END) as month_count,
          COUNT(CASE WHEN datetime >= @prevToday AND datetime <= @prevTodayEnd THEN 1 END) as prev_today_count,
          COUNT(CASE WHEN datetime >= @prevWeekStart AND datetime <= @prevWeekEnd THEN 1 END) as prev_week_count,
          COUNT(CASE WHEN datetime >= @prevMonthStart AND datetime <= @prevMonthEnd THEN 1 END) as prev_month_count,
          COUNT(CASE WHEN datetime >= @prevFullWeekStart AND datetime <= @prevFullWeekEnd THEN 1 END) as prev_week_full_count,
          COUNT(CASE WHEN datetime >= @prevFullMonthStart AND datetime <= @prevFullMonthEnd THEN 1 END) as prev_month_full_count
        FROM dbo.enquiries
        WHERE ${pocFilter}
      `);

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

      const row = countsResult.recordset?.[0] || {};
      return {
        row,
        breakdown: {
          today: { aowTop: aowToday },
          weekToDate: { aowTop: aowWeek },
          monthToDate: { aowTop: aowMonth },
        },
      };
    });

    const row = result?.row || {};
    return {
      today: row.today_count || 0,
      weekToDate: row.week_count || 0,
      monthToDate: row.month_count || 0,
      prevToday: row.prev_today_count || 0,
      prevWeekToDate: row.prev_week_count || 0,
      prevMonthToDate: row.prev_month_count || 0,
      prevWeekFull: row.prev_week_full_count || 0,
      prevMonthFull: row.prev_month_full_count || 0,
      breakdown: result?.breakdown || undefined,
    };
  } catch (err) {
    log.error('[home-enquiries] Instructions DB query failed:', err.message);
    return { today: 0, weekToDate: 0, monthToDate: 0, prevToday: 0, prevWeekToDate: 0, prevMonthToDate: 0, prevWeekFull: 0, prevMonthFull: 0, breakdown: undefined };
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

module.exports = router;
