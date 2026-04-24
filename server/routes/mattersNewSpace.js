const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { cacheUnified, generateCacheKey, CACHE_CONFIG } = require('../utils/redisClient');
const { annotate } = require('../utils/devConsole');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

let newSpaceCache = {
  data: null,
  ts: 0,
};

const NEW_SPACE_CACHE_TTL_MS = Number(process.env.NEW_SPACE_MATTERS_TTL_MS || 2 * 60 * 1000);
const NEW_SPACE_STALE_GRACE_MS = 5 * 60 * 1000;
let backgroundRefreshInFlight = false;

function normalizeName(name) {
  if (!name) return '';
  const normalized = String(name).trim().toLowerCase();
  if (normalized.includes(',')) {
    const [last, first] = normalized.split(',').map((part) => part.trim());
    if (first && last) return `${first} ${last}`;
  }
  return normalized.replace(/\s+/g, ' ');
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
      queryNewSpaceMatters(req.query)
        .then((freshData) => {
          newSpaceCache = { data: freshData, ts: Date.now() };
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