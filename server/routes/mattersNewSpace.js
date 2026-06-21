const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { cacheUnified, generateCacheKey, CACHE_CONFIG } = require('../utils/redisClient');
const { buildDateParseExpression } = require('../utils/matterDateColumns');
const { annotate } = require('../utils/devConsole');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

let newSpaceCache = {
  data: null,
  ts: 0,
};
const openedCountsCache = new Map();

const NEW_SPACE_CACHE_TTL_MS = Number(process.env.NEW_SPACE_MATTERS_TTL_MS || 2 * 60 * 1000);
const NEW_SPACE_STALE_GRACE_MS = 5 * 60 * 1000;
const OPENED_COUNTS_CACHE_TTL_MS = Number(process.env.HOME_MATTERS_OPENED_COUNTS_TTL_MS || 5 * 60 * 1000);
const OPENED_COUNTS_CACHE_VERSION = 'combined-date-v1';
let backgroundRefreshInFlight = false;
let cacheGeneration = 0;

function clearMattersNewSpaceCaches(reason = 'manual') {
  const previousOpenedCountsSize = openedCountsCache.size;
  cacheGeneration += 1;
  newSpaceCache = { data: null, ts: 0 };
  openedCountsCache.clear();
  backgroundRefreshInFlight = false;
  trackEvent('Matters.NewSpace.CacheCleared', {
    operation: 'matters-new-space-cache-clear',
    reason,
    openedCountsEntries: String(previousOpenedCountsSize),
  });
}

function normalizeName(name) {
  if (!name) return '';
  let normalized = String(name).trim().toLowerCase();
  if (normalized.includes(',')) {
    const [last, first] = normalized.split(',').map((part) => part.trim());
    if (first && last) return `${first} ${last}`;
  }
  normalized = normalized.replace(/\./g, '');
  normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ');
  normalized = normalized.replace(/\s[-/|].*$/, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  if (normalized === 'bianca odonnell') return "bianca o'donnell";
  if (normalized === 'samuel packwood') return 'sam packwood';
  return normalized;
}

function namesMatch(a, b) {
  const n1 = normalizeName(a);
  const n2 = normalizeName(b);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  const initialsFrom = (value) => value.split(/\s+/).filter(Boolean).map((part) => part[0] || '').join('');
  const compact1 = n1.replace(/\s+/g, '');
  const compact2 = n2.replace(/\s+/g, '');
  const initials1 = initialsFrom(n1);
  const initials2 = initialsFrom(n2);
  if (compact1.length <= 3 && compact1 === initials2) return true;
  if (compact2.length <= 3 && compact2 === initials1) return true;

  const variations = {
    alexander: ['alex'],
    alex: ['alexander'],
    samuel: ['sam'],
    sam: ['samuel'],
    lukasz: ['luke', 'lucas'],
    luke: ['lukasz', 'lucas'],
    lucas: ['luke', 'lukasz'],
    robert: ['rob', 'bob'],
    rob: ['robert'],
    bob: ['robert'],
  };

  const p1 = n1.split(' ').filter(Boolean);
  const p2 = n2.split(' ').filter(Boolean);
  const first1 = p1[0] || '';
  const first2 = p2[0] || '';
  const last1 = p1[p1.length - 1] || '';
  const last2 = p2[p2.length - 1] || '';

  if (first1 && first2) {
    if (first1 === first2 && (!last1 || !last2 || last1 === last2)) return true;
    const vars1 = variations[first1] || [];
    const vars2 = variations[first2] || [];
    if ((vars1.includes(first2) || vars2.includes(first1)) && (!last1 || !last2 || last1 === last2)) return true;
  }

  return false;
}

function pickFirstDefined(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined) {
      return row[key];
    }
  }
  return undefined;
}

function deriveClientNameFallback(row) {
  // When Matters.ClientName is blank (common for newly-opened matters before
  // the sync hydrates the column), fall back to the linked instruction record.
  // Prefer CompanyName for company clients; otherwise compose First + Last.
  const company = typeof row._InstrCompanyName === 'string' ? row._InstrCompanyName.trim() : '';
  if (company) return company;
  const first = typeof row._InstrFirstName === 'string' ? row._InstrFirstName.trim() : '';
  const last = typeof row._InstrLastName === 'string' ? row._InstrLastName.trim() : '';
  const combined = `${first} ${last}`.trim();
  return combined || '';
}

function projectMatterRow(row) {
  const rawClientName = pickFirstDefined(row, ['ClientName', 'Client Name', 'client_name', 'clientName']);
  const clientNameStr = typeof rawClientName === 'string' ? rawClientName.trim() : (rawClientName != null ? String(rawClientName).trim() : '');
  const resolvedClientName = clientNameStr || deriveClientNameFallback(row) || rawClientName || '';
  return {
    MatterID: pickFirstDefined(row, ['MatterID', 'matterId']),
    InstructionRef: pickFirstDefined(row, ['InstructionRef', 'Instruction Ref', 'instruction_ref', 'instructionRef']),
    DisplayNumber: pickFirstDefined(row, ['DisplayNumber', 'Display Number', 'display_number', 'displayNumber']),
    OpenDate: pickFirstDefined(row, ['OpenDate', 'Open Date', 'open_date', 'openDate']),
    ClientID: pickFirstDefined(row, ['ClientID', 'Client ID', 'client_id', 'clientId']),
    ClientName: resolvedClientName,
    ClientPhone: pickFirstDefined(row, ['ClientPhone', 'Client Phone', 'client_phone', 'clientPhone']),
    ClientEmail: pickFirstDefined(row, ['ClientEmail', 'Client Email', 'client_email', 'clientEmail']),
    Status: pickFirstDefined(row, ['Status', 'status']),
    UniqueID: pickFirstDefined(row, ['UniqueID', 'Unique ID', 'unique_id', 'uniqueId']),
    Description: pickFirstDefined(row, ['Description', 'description']),
    PracticeArea: pickFirstDefined(row, ['PracticeArea', 'Practice Area', 'practice_area', 'practiceArea']),
    Source: pickFirstDefined(row, ['Source', 'source']),
    Referrer: pickFirstDefined(row, ['Referrer', 'referrer']),
    ResponsibleSolicitor: pickFirstDefined(row, ['ResponsibleSolicitor', 'Responsible Solicitor', 'responsible_solicitor', 'responsibleSolicitor']),
    OriginatingSolicitor: pickFirstDefined(row, ['OriginatingSolicitor', 'Originating Solicitor', 'originating_solicitor', 'originatingSolicitor']),
    SupervisingPartner: pickFirstDefined(row, ['SupervisingPartner', 'Supervising Partner', 'supervising_partner', 'supervisingPartner']),
    Opponent: pickFirstDefined(row, ['Opponent', 'opponent']),
    OpponentSolicitor: pickFirstDefined(row, ['OpponentSolicitor', 'Opponent Solicitor', 'opponent_solicitor', 'opponentSolicitor']),
    CloseDate: pickFirstDefined(row, ['CloseDate', 'Close Date', 'close_date', 'closeDate']),
    ApproxValue: pickFirstDefined(row, ['ApproxValue', 'Approx. Value', 'approx_value', 'approxValue', 'value']),
    mod_stamp: pickFirstDefined(row, ['mod_stamp', 'modStamp']),
    method_of_contact: pickFirstDefined(row, ['method_of_contact', 'methodOfContact']),
    CCL_date: pickFirstDefined(row, ['CCL_date', 'ccl_date', 'cclDate']),
    Rating: pickFirstDefined(row, ['Rating', 'rating']),
  };
}

function trackCompleted(startedAt, properties, measurements) {
  const durationMs = Date.now() - startedAt;
  trackEvent('Matters.NewSpace.Completed', {
    triggeredBy: 'home-matters-speed-path',
    ...properties,
  }, {
    durationMs,
    ...measurements,
  });
  trackMetric('Matters.NewSpace.Duration', durationMs, {
    triggeredBy: 'home-matters-speed-path',
    ...properties,
  });
}

function trackFailed(startedAt, error, properties) {
  const durationMs = Date.now() - startedAt;
  trackException(error, {
    operation: 'Matters.NewSpace',
    triggeredBy: 'home-matters-speed-path',
    ...properties,
  });
  trackEvent('Matters.NewSpace.Failed', {
    triggeredBy: 'home-matters-speed-path',
    error: error?.message || String(error),
    ...properties,
  }, {
    durationMs,
  });
}

async function queryNewSpaceMatters(queryParams) {
  const fullName = queryParams.fullName ? String(queryParams.fullName) : '';
  const norm = normalizeName(fullName);
  const limit = parseInt(queryParams.limit, 10);
  const hasLimit = !isNaN(limit) && limit > 0;
  const connectionString = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error('Missing Instructions DB connection string');
  }

  return withRequest(connectionString, async (request) => {
    if (norm) {
      request.input('name', sql.VarChar(200), norm);
      request.input('nameLike', sql.VarChar(210), `%${norm}%`);
    }
    if (hasLimit) {
      request.input('limit', sql.Int, limit);
    }

    const whereClause = norm ? `WHERE (
        LOWER(m.[ResponsibleSolicitor]) = @name OR LOWER(m.[OriginatingSolicitor]) = @name
        OR LOWER(m.[ResponsibleSolicitor]) LIKE @nameLike OR LOWER(m.[OriginatingSolicitor]) LIKE @nameLike
      )` : '';

    // Outer apply grabs the most recent Instructions row linked by MatterId so we can
    // backfill ClientName (and future client fields) without duplicating matter rows.
    const instructionFallback = `OUTER APPLY (
      SELECT TOP 1 i.FirstName AS _InstrFirstName, i.LastName AS _InstrLastName, i.CompanyName AS _InstrCompanyName
      FROM [dbo].[Instructions] i
      WHERE i.MatterId = m.[MatterID]
      ORDER BY i.LastUpdated DESC, i.SubmissionDate DESC
    ) instr`;

    const query = hasLimit
      ? `SELECT m.*, instr._InstrFirstName, instr._InstrLastName, instr._InstrCompanyName FROM [dbo].[Matters] m ${instructionFallback} ${whereClause} ORDER BY m.[OpenDate] DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`
      : `SELECT m.*, instr._InstrFirstName, instr._InstrLastName, instr._InstrCompanyName FROM [dbo].[Matters] m ${instructionFallback} ${whereClause}`;

    const result = await request.query(query);
    const matters = Array.isArray(result.recordset)
      ? result.recordset.map(projectMatterRow)
      : [];

    return {
      matters,
      count: matters.length,
      limited: hasLimit,
      errors: {},
    };
  });
}

function toDateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function parseDateOnlyParam(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map((part) => Number.parseInt(part, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseOpenedCountsWindow(queryParams) {
  const now = new Date();
  const requestedStart = parseDateOnlyParam(queryParams.start);
  const requestedEnd = parseDateOnlyParam(queryParams.end);

  if (requestedStart && requestedEnd && requestedStart <= requestedEnd) {
    const endExclusive = addUtcDays(requestedEnd, 1);
    const maxStart = addUtcDays(endExclusive, -190);
    const start = requestedStart < maxStart ? maxStart : requestedStart;
    const startDate = toDateKey(start);
    const endDate = toDateKey(requestedEnd);
    return {
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      start,
      endExclusive,
      startDate,
      endDate,
      rangeKey: `${startDate}:${endDate}`,
    };
  }

  const year = Number.parseInt(queryParams.year, 10) || now.getFullYear();
  const rawMonth = Number.parseInt(queryParams.month, 10);
  const month = Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  const endInclusive = addUtcDays(endExclusive, -1);
  const startDate = toDateKey(start);
  const endDate = toDateKey(endInclusive);
  return { year, month, start, endExclusive, startDate, endDate, rangeKey: `${startDate}:${endDate}` };
}

function matterDedupeKey(row) {
  const displayNumber = row.displayNumber != null ? String(row.displayNumber).trim() : '';
  if (displayNumber) return `display:${displayNumber.toLowerCase()}`;
  const uniqueId = row.uniqueId != null ? String(row.uniqueId).trim() : '';
  if (uniqueId) return `unique:${uniqueId.toLowerCase()}`;
  const matterId = row.matterId != null ? String(row.matterId).trim() : '';
  if (matterId) return `matter:${matterId.toLowerCase()}`;
  return `source:${row.source}:${row.rowNumber}`;
}

async function queryOpenedCounts(queryParams) {
  const { year, month, start, endExclusive, startDate, endDate } = parseOpenedCountsWindow(queryParams);
  const fullName = queryParams.fullName ? String(queryParams.fullName).trim() : '';
  const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
  const newSpaceConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const legacyOpenDateExpression = buildDateParseExpression('[Open Date]');
  const newSpaceOpenDateExpression = buildDateParseExpression('[OpenDate]');
  const errors = { legacy: null, newSpace: null };

  if (!legacyConn && !newSpaceConn) {
    throw new Error('Missing DB connection string for matters opened counts');
  }

  const legacyRowsPromise = legacyConn ? withRequest(legacyConn, async (request) => {
    request.input('start', sql.DateTime2, start);
    request.input('end', sql.DateTime2, endExclusive);
    const result = await request.query(`
      SELECT
        CAST([Unique ID] AS NVARCHAR(100)) AS uniqueId,
        CAST([Unique ID] AS NVARCHAR(100)) AS matterId,
        CAST([Display Number] AS NVARCHAR(100)) AS displayNumber,
        CAST([Responsible Solicitor] AS NVARCHAR(200)) AS responsibleSolicitor,
        ${legacyOpenDateExpression} AS openDate
      FROM matters
      WHERE ${legacyOpenDateExpression} >= @start AND ${legacyOpenDateExpression} < @end
    `);
    return Array.isArray(result.recordset)
      ? result.recordset.map((row, index) => ({ ...row, source: 'legacy', rowNumber: index }))
      : [];
  }).catch((error) => {
    errors.legacy = error?.message || String(error);
    trackException(error, { operation: 'Matters.OpenedCounts', phase: 'legacy-query', startDate, endDate });
    trackEvent('Matters.OpenedCounts.SourceFailed', {
      operation: 'home-opened-counts',
      source: 'legacy',
      startDate,
      endDate,
      error: errors.legacy,
    });
    return [];
  }) : Promise.resolve([]);

  const newSpaceRowsPromise = newSpaceConn ? withRequest(newSpaceConn, async (request) => {
    request.input('start', sql.DateTime2, start);
    request.input('end', sql.DateTime2, endExclusive);
    const result = await request.query(`
      SELECT
        CAST(NULL AS NVARCHAR(100)) AS uniqueId,
        CAST([MatterID] AS NVARCHAR(100)) AS matterId,
        CAST([DisplayNumber] AS NVARCHAR(100)) AS displayNumber,
        CAST([ResponsibleSolicitor] AS NVARCHAR(200)) AS responsibleSolicitor,
        ${newSpaceOpenDateExpression} AS openDate
      FROM [dbo].[Matters]
      WHERE ${newSpaceOpenDateExpression} >= @start AND ${newSpaceOpenDateExpression} < @end
    `);
    return Array.isArray(result.recordset)
      ? result.recordset.map((row, index) => ({ ...row, source: 'newSpace', rowNumber: index }))
      : [];
  }).catch((error) => {
    errors.newSpace = error?.message || String(error);
    trackException(error, { operation: 'Matters.OpenedCounts', phase: 'new-space-query', startDate, endDate });
    trackEvent('Matters.OpenedCounts.SourceFailed', {
      operation: 'home-opened-counts',
      source: 'newSpace',
      startDate,
      endDate,
      error: errors.newSpace,
    });
    return [];
  }) : Promise.resolve([]);

  const [legacyRows, newSpaceRows] = await Promise.all([legacyRowsPromise, newSpaceRowsPromise]);
  const configuredSourceCount = Number(Boolean(legacyConn)) + Number(Boolean(newSpaceConn));
  const failedSourceCount = Number(Boolean(legacyConn && errors.legacy)) + Number(Boolean(newSpaceConn && errors.newSpace));

  if (configuredSourceCount > 0 && failedSourceCount === configuredSourceCount) {
    throw new Error(`Failed all matters opened count sources: ${[errors.newSpace, errors.legacy].filter(Boolean).join('; ')}`);
  }

  const rowsByMatter = new Map();

  for (const row of [...newSpaceRows, ...legacyRows]) {
    const key = matterDedupeKey(row);
    const existing = rowsByMatter.get(key);
    const isUserMatter = fullName ? namesMatch(row.responsibleSolicitor, fullName) : false;
    const dateKey = toDateKey(row.openDate);
    if (existing) {
      existing.sources.add(row.source);
      existing.isUserMatter = existing.isUserMatter || isUserMatter;
      existing.dateKey = existing.dateKey || dateKey;
    } else {
      rowsByMatter.set(key, { dateKey, isUserMatter, sources: new Set([row.source]) });
    }
  }

  const deduped = [...rowsByMatter.values()];
  const daily = new Map();
  for (const row of deduped) {
    if (!row.dateKey) continue;
    const entry = daily.get(row.dateKey) || { date: row.dateKey, firmCount: 0, userCount: 0 };
    entry.firmCount += 1;
    if (row.isUserMatter) entry.userCount += 1;
    daily.set(row.dateKey, entry);
  }

  return {
    year,
    month,
    startDate,
    endDate,
    firmCount: deduped.length,
    userCount: fullName ? deduped.filter((row) => row.isUserMatter).length : 0,
    fullName,
    dailyCounts: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)),
    sourceCounts: {
      legacy: legacyRows.length,
      newSpace: newSpaceRows.length,
      deduped: deduped.length,
    },
    sourceBasis: newSpaceRows.length && legacyRows.length ? 'new-space+legacy' : newSpaceRows.length ? 'new-space' : 'legacy',
    errors,
  };
}

router.get('/opened-counts', async (req, res) => {
  const startedAt = Date.now();
  const { year, month, startDate, endDate, rangeKey } = parseOpenedCountsWindow(req.query);
  const fullName = req.query.fullName ? String(req.query.fullName).trim() : '';
  const cacheKey = `${rangeKey}:${normalizeName(fullName) || 'firm'}:${OPENED_COUNTS_CACHE_VERSION}`;
  const now = Date.now();

  trackEvent('Matters.OpenedCounts.Started', {
    operation: 'home-opened-counts',
    triggeredBy: 'home-idle-fetch',
    year: String(year),
    month: String(month),
    startDate,
    endDate,
    filtered: String(Boolean(fullName)),
  });

  const cachedCounts = openedCountsCache.get(cacheKey);
  if (cachedCounts && now - cachedCounts.ts < OPENED_COUNTS_CACHE_TTL_MS) {
    annotate(res, { source: 'memory', note: 'matters opened counts' });
    return res.json({ ...cachedCounts.data, cached: true, source: 'memory' });
  }

  try {
    const data = await queryOpenedCounts(req.query);
    openedCountsCache.set(cacheKey, { data, ts: Date.now() });
    if (openedCountsCache.size > 60) {
      const oldestKey = openedCountsCache.keys().next().value;
      if (oldestKey) openedCountsCache.delete(oldestKey);
    }
    const durationMs = Date.now() - startedAt;
    trackEvent('Matters.OpenedCounts.Completed', {
      operation: 'home-opened-counts',
      triggeredBy: 'home-idle-fetch',
      year: String(data.year),
      month: String(data.month),
      firmCount: String(data.firmCount),
      userCount: String(data.userCount),
      legacyCount: String(data.sourceCounts?.legacy ?? 0),
      newSpaceCount: String(data.sourceCounts?.newSpace ?? 0),
      sourceBasis: String(data.sourceBasis || ''),
    });
    trackMetric('Matters.OpenedCounts.Duration', durationMs, { operation: 'home-opened-counts' });
    annotate(res, { source: 'sql', note: `${data.firmCount} matters opened (${data.sourceBasis})` });
    return res.json({ ...data, cached: false, source: 'sql' });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation: 'Matters.OpenedCounts', phase: 'query' });
    trackEvent('Matters.OpenedCounts.Failed', {
      operation: 'home-opened-counts',
      triggeredBy: 'home-idle-fetch',
      error: error?.message || String(error),
    });
    trackMetric('Matters.OpenedCounts.Duration', durationMs, { operation: 'home-opened-counts', success: 'false' });
    return res.status(500).json({ error: 'Failed to fetch matters opened counts', details: error?.message || String(error) });
  }
});

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const fullName = req.query.fullName ? String(req.query.fullName) : '';
  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';
  const limit = parseInt(req.query.limit, 10);
  const hasLimit = !isNaN(limit) && limit > 0;

  res.setTimeout(45_000, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'New-space matters request timed out' });
    }
  });

  // Limited requests (Home dashboard) go straight to SQL/Redis — skip memory cache
  // to avoid poisoning the full-dataset cache used by the Matters tab.
  if (hasLimit) {
    try {
      const limitCacheKey = generateCacheKey(
        CACHE_CONFIG.PREFIXES.UNIFIED,
        'matters-new-space',
        `${fullName || 'all'}:limit:${limit}`
      );
      const data = bypassCache
        ? await queryNewSpaceMatters(req.query)
        : await cacheUnified([limitCacheKey], async () => queryNewSpaceMatters(req.query));
      annotate(res, { source: bypassCache ? 'sql' : 'redis', note: `${data?.count || 0} new-space matters (limit=${limit})` });
      trackCompleted(startedAt, { cacheState: bypassCache ? 'bypass' : 'redis', filtered: fullName ? 'true' : 'false', limited: 'true' }, { count: Number(data?.count || 0) });
      return res.json({ ...data, cached: !bypassCache, source: bypassCache ? 'sql' : 'redis' });
    } catch (error) {
      trackFailed(startedAt, error, { phase: 'query-limited', filtered: fullName ? 'true' : 'false' });
      return res.status(500).json({ error: 'Failed to fetch new-space matters', details: error?.message || String(error) });
    }
  }

  const cacheKey = generateCacheKey(
    CACHE_CONFIG.PREFIXES.UNIFIED,
    'matters-new-space',
    fullName || 'all'
  );
  const now = Date.now();

  if (!bypassCache && newSpaceCache.data && (now - newSpaceCache.ts) < NEW_SPACE_CACHE_TTL_MS) {
    annotate(res, { source: 'memory', note: `new-space TTL ${Math.round((NEW_SPACE_CACHE_TTL_MS - (now - newSpaceCache.ts)) / 1000)}s remaining` });
    trackCompleted(startedAt, { cacheState: 'memory-hit', filtered: fullName ? 'true' : 'false' }, { count: Number(newSpaceCache.data?.count || 0) });
    return res.json({ ...newSpaceCache.data, cached: true, source: 'memory' });
  }

  const memoryAge = now - newSpaceCache.ts;
  if (!bypassCache && newSpaceCache.data && memoryAge < NEW_SPACE_CACHE_TTL_MS + NEW_SPACE_STALE_GRACE_MS) {
    if (!backgroundRefreshInFlight) {
      backgroundRefreshInFlight = true;
      const refreshGeneration = cacheGeneration;
      queryNewSpaceMatters(req.query)
        .then((freshData) => {
          if (refreshGeneration === cacheGeneration) {
            newSpaceCache = { data: freshData, ts: Date.now() };
          }
        })
        .catch((error) => {
          trackFailed(startedAt, error, { phase: 'background-refresh', filtered: fullName ? 'true' : 'false' });
        })
        .finally(() => {
          backgroundRefreshInFlight = false;
        });
    }

    annotate(res, { source: 'stale', note: 'new-space stale - refreshing in background' });
    trackCompleted(startedAt, { cacheState: 'memory-stale', filtered: fullName ? 'true' : 'false' }, { count: Number(newSpaceCache.data?.count || 0) });
    return res.json({ ...newSpaceCache.data, cached: true, source: 'memory-stale' });
  }

  try {
    if (!bypassCache) {
      const cachedResult = await cacheUnified([cacheKey], async () => queryNewSpaceMatters(req.query));
      newSpaceCache = { data: cachedResult, ts: Date.now() };
      annotate(res, { source: 'redis', note: 'new-space matters' });
      trackCompleted(startedAt, { cacheState: 'redis', filtered: fullName ? 'true' : 'false' }, { count: Number(cachedResult?.count || 0) });
      return res.json({ ...cachedResult, cached: true, source: 'redis' });
    }

    const data = await queryNewSpaceMatters(req.query);
    newSpaceCache = { data, ts: Date.now() };
    annotate(res, { source: 'sql', note: `${Number(data?.count || 0)} new-space matters` });
    trackCompleted(startedAt, { cacheState: 'bypass', filtered: fullName ? 'true' : 'false' }, { count: Number(data?.count || 0) });
    return res.json({ ...data, cached: false, source: 'sql' });
  } catch (error) {
    trackFailed(startedAt, error, { phase: 'query', filtered: fullName ? 'true' : 'false' });

    if (newSpaceCache.data) {
      return res.status(200).json({
        ...newSpaceCache.data,
        cached: true,
        stale: true,
        source: 'memory-stale',
        errors: {
          ...(newSpaceCache.data.errors || {}),
          runtime: error?.message || String(error),
        },
      });
    }

    return res.status(500).json({ error: 'Failed to fetch new-space matters', details: error?.message || String(error) });
  }
});

module.exports = router;
module.exports.clearMattersNewSpaceCaches = clearMattersNewSpaceCaches;