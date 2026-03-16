/**
 * Year-over-Year Comparison API
 * 
 * Returns aggregated WIP, Collected, and Matters Opened totals
 * for up to 5 financial years (1 Apr → 31 Mar), scoped to the
 * same YTD window (1 Apr → current equivalent day) in each year.
 * 
 * Also reports data-availability metadata so the UI can flag years
 * with missing/incomplete data rather than showing misleading zeros.
 * 
 * Route: /api/yoy-comparison
 */

const express = require('express');
const { withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');
const { getRedisClient, cacheWrapper, generateCacheKey } = require('../utils/redisClient');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────

/** Get the financial year window for a given FY start year.
 *  FY 2025 = 1 Apr 2025 → 31 Mar 2026.
 *  When `anchorDate` is provided, the end date is clamped to the
 *  same month/day as anchorDate within that FY.  */
function getFYWindow(fyStartYear, anchorDate) {
  const start = new Date(fyStartYear, 3, 1); // 1 April
  let end;
  if (anchorDate) {
    // Same month+day but in the FY's calendar year
    const anchorMonth = anchorDate.getMonth(); // 0-11
    const anchorDay = anchorDate.getDate();
    // If anchor is Jan-Mar, the year is fyStartYear+1
    const year = anchorMonth < 3 ? fyStartYear + 1 : fyStartYear;
    end = new Date(year, anchorMonth, anchorDay, 23, 59, 59, 999);
  } else {
    end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999); // 31 March
  }
  return { start, end };
}

/** Current financial year start year (e.g. in Feb 2026 → FY started Apr 2025, returns 2025). */
function currentFYStartYear(now = new Date()) {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function toSqlDate(d) {
  // Use local date parts to avoid UTC timezone shift (e.g. 1 Apr BST → 31 Mar UTC)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Route ─────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'SQL_CONNECTION_STRING not configured' });
  }

  // Parse optional params
  const yearsBack = Math.min(Math.max(Number(req.query.yearsBack) || 5, 1), 10);
  const ytd = req.query.ytd !== 'false'; // default true = year-to-date mode

  // Optional custom anchor: ?anchorMonth=2&anchorDay=19 (1-indexed month)
  // If omitted, today is the anchor.
  const now = new Date();
  let anchor = now;
  if (req.query.anchorMonth && req.query.anchorDay) {
    const m = Number(req.query.anchorMonth) - 1; // 0-indexed
    const d = Number(req.query.anchorDay);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const fyStart = currentFYStartYear(now);
      const yr = m < 3 ? fyStart + 1 : fyStart;
      anchor = new Date(yr, m, d);
    }
  }

  const fyStart = currentFYStartYear(now);

  trackEvent('YoYComparison.Requested', {
    yearsBack: String(yearsBack),
    ytd: String(ytd),
    anchorDate: toSqlDate(anchor),
    fy: `${fyStart}/${fyStart + 1}`,
  });

  try {
    const cacheKey = generateCacheKey('yoy', `${yearsBack}_${ytd}_${toSqlDate(anchor)}`);
    const result = await cacheWrapper(cacheKey, async () => {
      return await buildYoYData(connectionString, fyStart, yearsBack, ytd ? anchor : null);
    }, 300); // 5 min cache

    trackEvent('YoYComparison.Completed', {
      durationMs: String(Date.now() - startedAt),
      yearCount: String(result.years?.length || 0),
    });

    return res.json(result);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      operation: 'YoYComparison',
      phase: 'query',
    });
    console.error('[YoY] Failed:', err);
    return res.status(500).json({ error: 'Failed to fetch YoY comparison data' });
  }
});

// ── Data builder ──────────────────────────────────────────────

async function buildYoYData(connectionString, currentFY, yearsBack, anchorDate) {
  const years = [];
  for (let i = 0; i < yearsBack; i++) {
    const fy = currentFY - i;
    const { start, end } = getFYWindow(fy, anchorDate);
    years.push({ fy, label: `${fy}/${String(fy + 1).slice(2)}`, start, end });
  }

  // Run all three metric queries in parallel for each year
  const results = await Promise.all(years.map(async (yr) => {
    const startSql = toSqlDate(yr.start);
    const endSql = toSqlDate(yr.end);

    const [wip, collected, matters] = await Promise.all([
      queryWipTotal(connectionString, startSql, endSql),
      queryCollectedTotal(connectionString, startSql, endSql),
      queryMattersOpened(connectionString, startSql, endSql),
    ]);

    return {
      fy: yr.fy,
      label: yr.label,
      startDate: startSql,
      endDate: endSql,
      wip: wip.total,
      wipHours: wip.hours,
      wipRowCount: wip.rowCount,
      collected: collected.total,
      collectedRowCount: collected.rowCount,
      mattersOpened: matters.count,
      // Data availability flags
      dataAvailability: {
        wip: wip.rowCount > 0,
        collected: collected.rowCount > 0,
        matters: matters.count > 0 || matters.totalInPeriod > 0,
        wipMinDate: wip.minDate,
        wipMaxDate: wip.maxDate,
        collectedMinDate: collected.minDate,
        collectedMaxDate: collected.maxDate,
      },
    };
  }));

  return {
    generatedAt: new Date().toISOString(),
    anchorDate: anchorDate ? toSqlDate(anchorDate) : null,
    ytd: !!anchorDate,
    years: results.reverse(), // oldest first for chart display
  };
}

// ── Individual metric queries ─────────────────────────────────

async function queryWipTotal(connectionString, startDate, endDate) {
  try {
    return await withRequest(connectionString, async (request, sqlClient) => {
      request.input('startDate', sqlClient.Date, startDate);
      request.input('endDate', sqlClient.Date, endDate);
      const result = await request.query(`
        SELECT 
          ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) AS totalValue,
          ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) AS totalHours,
          COUNT(*) AS cnt,
          MIN(date) AS minDate,
          MAX(date) AS maxDate
        FROM [dbo].[wip]
        WHERE date BETWEEN @startDate AND @endDate
      `);
      const row = result.recordset[0] || {};
      return {
        total: Number(row.totalValue) || 0,
        hours: Number(row.totalHours) || 0,
        rowCount: Number(row.cnt) || 0,
        minDate: row.minDate || null,
        maxDate: row.maxDate || null,
      };
    });
  } catch (err) {
    console.error(`[YoY] WIP query failed for ${startDate}→${endDate}:`, err.message);
    return { total: 0, hours: 0, rowCount: 0, minDate: null, maxDate: null };
  }
}

async function queryCollectedTotal(connectionString, startDate, endDate) {
  try {
    return await withRequest(connectionString, async (request, sqlClient) => {
      request.input('startDate', sqlClient.Date, startDate);
      request.input('endDate', sqlClient.Date, endDate);
      const result = await request.query(`
        SELECT 
          ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) AS totalValue,
          COUNT(*) AS cnt,
          MIN(payment_date) AS minDate,
          MAX(payment_date) AS maxDate
        FROM [dbo].[collectedTime]
        WHERE payment_date BETWEEN @startDate AND @endDate
      `);
      const row = result.recordset[0] || {};
      return {
        total: Number(row.totalValue) || 0,
        rowCount: Number(row.cnt) || 0,
        minDate: row.minDate || null,
        maxDate: row.maxDate || null,
      };
    });
  } catch (err) {
    console.error(`[YoY] Collected query failed for ${startDate}→${endDate}:`, err.message);
    return { total: 0, rowCount: 0, minDate: null, maxDate: null };
  }
}

async function queryMattersOpened(connectionString, startDate, endDate) {
  try {
    return await withRequest(connectionString, async (request, sqlClient) => {
      request.input('startDate', sqlClient.Date, startDate);
      request.input('endDate', sqlClient.Date, endDate);
      const result = await request.query(`
        SELECT 
          COUNT(*) AS openedCount,
          (SELECT COUNT(*) FROM [dbo].[matters] WHERE TRY_CONVERT(DATE, [Open Date]) BETWEEN @startDate AND @endDate) AS totalInPeriod
        FROM [dbo].[matters]
        WHERE TRY_CONVERT(DATE, [Open Date]) BETWEEN @startDate AND @endDate
          AND [Status] != 'MatterRequest'
      `);
      const row = result.recordset[0] || {};
      return {
        count: Number(row.openedCount) || 0,
        totalInPeriod: Number(row.totalInPeriod) || 0,
      };
    });
  } catch (err) {
    console.error(`[YoY] Matters query failed for ${startDate}→${endDate}:`, err.message);
    return { count: 0, totalInPeriod: 0 };
  }
}

// ── Monthly breakdown route ───────────────────────────────────

const MONTH_NAMES = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

router.get('/monthly', async (req, res) => {
  const startedAt = Date.now();
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'SQL_CONNECTION_STRING not configured' });
  }

  const fy = Number(req.query.fy);
  const metric = req.query.metric; // wip | collected | mattersOpened
  if (!fy || !['wip', 'collected', 'mattersOpened'].includes(metric)) {
    return res.status(400).json({ error: 'Required: ?fy=YYYY&metric=wip|collected|mattersOpened' });
  }

  // YTD anchor: clamp to today's equivalent in the requested FY
  const now = new Date();
  const currentFY = currentFYStartYear(now);
  const anchorMonth = now.getMonth();
  const anchorDay = now.getDate();

  trackEvent('YoYMonthly.Requested', { fy: String(fy), metric });

  try {
    const cacheKey = generateCacheKey('yoy-monthly', `${fy}_${metric}_${toSqlDate(now)}`);
    const result = await cacheWrapper(cacheKey, async () => {
      return await buildMonthlyBreakdown(connectionString, fy, metric, currentFY, anchorMonth, anchorDay);
    }, 300);

    trackEvent('YoYMonthly.Completed', { fy: String(fy), metric, durationMs: String(Date.now() - startedAt) });
    return res.json(result);
  } catch (err) {
    trackException(err instanceof Error ? err : new Error(String(err)), {
      operation: 'YoYMonthly', phase: 'query', fy: String(fy), metric,
    });
    console.error('[YoY Monthly] Failed:', err);
    return res.status(500).json({ error: 'Failed to fetch monthly breakdown' });
  }
});

async function buildMonthlyBreakdown(connectionString, fy, metric, currentFY, anchorMonth, anchorDay) {
  const months = [];
  // FY months: Apr(3)→Mar(2) next year
  for (let i = 0; i < 12; i++) {
    const monthIdx = (3 + i) % 12; // 3=Apr, 4=May, ..., 2=Mar
    const year = monthIdx < 3 ? fy + 1 : fy;
    const monthStart = new Date(year, monthIdx, 1);
    // End of month
    const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);

    // YTD clamp: if this FY is being viewed and the month is beyond today, skip
    const anchorYear = anchorMonth < 3 ? currentFY + 1 : currentFY;
    const fyAnchorYear = anchorMonth < 3 ? fy + 1 : fy;
    const isCurrentFY = (fy === currentFY);

    let clampedEnd = monthEnd;
    if (isCurrentFY && monthIdx === anchorMonth) {
      // Partial month — clamp to today's date in this FY
      clampedEnd = new Date(fyAnchorYear, anchorMonth, anchorDay, 23, 59, 59, 999);
    } else if (isCurrentFY) {
      // If this month is after current anchor month, skip
      const monthOrder = i; // 0=Apr, 1=May, ...
      const anchorOrder = anchorMonth >= 3 ? anchorMonth - 3 : anchorMonth + 9;
      if (monthOrder > anchorOrder) continue;
    }

    months.push({
      monthIdx,
      label: MONTH_NAMES[i],
      start: toSqlDate(monthStart),
      end: toSqlDate(clampedEnd),
    });
  }

  // Query all months in parallel
  const results = await Promise.all(months.map(async (m) => {
    const value = await queryMonthlyMetric(connectionString, metric, m.start, m.end);
    return { ...m, ...value };
  }));

  return {
    fy,
    fyLabel: `${fy}/${String(fy + 1).slice(2)}`,
    metric,
    months: results,
  };
}

async function queryMonthlyMetric(connectionString, metric, startDate, endDate) {
  try {
    return await withRequest(connectionString, async (request, sqlClient) => {
      request.input('startDate', sqlClient.Date, startDate);
      request.input('endDate', sqlClient.Date, endDate);

      if (metric === 'wip') {
        const r = await request.query(`
          SELECT ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) AS val,
                 COUNT(*) AS cnt
          FROM [dbo].[wip]
          WHERE date BETWEEN @startDate AND @endDate
        `);
        return { value: Number(r.recordset[0]?.val) || 0, rowCount: Number(r.recordset[0]?.cnt) || 0 };
      }
      if (metric === 'collected') {
        const r = await request.query(`
          SELECT ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) AS val,
                 COUNT(*) AS cnt
          FROM [dbo].[collectedTime]
          WHERE payment_date BETWEEN @startDate AND @endDate
        `);
        return { value: Number(r.recordset[0]?.val) || 0, rowCount: Number(r.recordset[0]?.cnt) || 0 };
      }
      // mattersOpened
      const r = await request.query(`
        SELECT COUNT(*) AS val
        FROM [dbo].[matters]
        WHERE TRY_CONVERT(DATE, [Open Date]) BETWEEN @startDate AND @endDate
          AND [Status] != 'MatterRequest'
      `);
      return { value: Number(r.recordset[0]?.val) || 0, rowCount: Number(r.recordset[0]?.val) || 0 };
    });
  } catch (err) {
    console.error(`[YoY Monthly] ${metric} query failed for ${startDate}→${endDate}:`, err.message);
    return { value: 0, rowCount: 0 };
  }
}

module.exports = router;
