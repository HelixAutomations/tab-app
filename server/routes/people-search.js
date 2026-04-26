/**
 * People Search - cross-database enquiry lookup by name, email, or phone.
 * GET /api/people-search?q=<term>
 *
 * Default mode preserves the historic combined response (instructions + legacy,
 * deduped by email/day). `mode=staged` changes the route into the call-filing
 * contract: search current/instructions first, then expose legacy only when the
 * caller explicitly asks for it via `includeLegacy=true`.
 */
const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { loggers } = require('../utils/logger');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();
const log = (loggers.enquiries || loggers.default || console).child?.('PeopleSearch') || console;

const MAX_RESULTS = 30;

function clampLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_RESULTS;
  return Math.min(parsed, MAX_RESULTS);
}

function classifyQuery(q) {
  const trimmed = q.trim();
  if (trimmed.includes('@')) return 'email';
  if (trimmed.replace(/[^\d]/g, '').length >= 7) return 'phone';
  return 'name';
}

function normalisePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^\d]/g, '').replace(/^0/, '44').replace(/^44/, '');
}

function toDayKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function buildInstructionsWhere(request, query, queryType) {
  if (queryType === 'email') {
    request.input('email', sql.NVarChar(255), query.toLowerCase());
    return 'LOWER(email) = @email';
  }

  if (queryType === 'phone') {
    request.input('phone', sql.NVarChar(50), `%${normalisePhone(query)}%`);
    return "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE @phone";
  }

  const parts = query.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    request.input('first', sql.NVarChar(255), `%${parts[0]}%`);
    request.input('last', sql.NVarChar(255), `%${parts.slice(1).join(' ')}%`);
    return '(first LIKE @first AND last LIKE @last)';
  }

  request.input('term', sql.NVarChar(255), `%${parts[0] || query}%`);
  return '(first LIKE @term OR last LIKE @term OR email LIKE @term)';
}

function buildLegacyWhere(request, query, queryType) {
  if (queryType === 'email') {
    request.input('email', sql.NVarChar(255), query.toLowerCase());
    return 'LOWER(LTRIM(RTRIM(Email))) = @email';
  }

  if (queryType === 'phone') {
    request.input('phone', sql.NVarChar(50), `%${normalisePhone(query)}%`);
    return "REPLACE(REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', ''), '(', '') LIKE @phone";
  }

  const parts = query.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    request.input('first', sql.NVarChar(255), `%${parts[0]}%`);
    request.input('last', sql.NVarChar(255), `%${parts.slice(1).join(' ')}%`);
    return '(First_Name LIKE @first AND Last_Name LIKE @last)';
  }

  request.input('term', sql.NVarChar(255), `%${parts[0] || query}%`);
  return '(First_Name LIKE @term OR Last_Name LIKE @term OR Email LIKE @term)';
}

function mapInstructionRow(row) {
  return {
    id: String(row.id),
    date: row.datetime,
    first: row.first || '',
    last: row.last || '',
    email: row.email || '',
    phone: row.phone || '',
    poc: row.poc || '',
    aow: row.aow || '',
    tow: row.tow || '',
    moc: row.moc || '',
    stage: row.stage || null,
    claim: row.claim || null,
    acid: row.acid || null,
    notes: row.notes || '',
    value: row.value || null,
    source: row.source || null,
    rating: row.rating || null,
    _src: 'instructions',
  };
}

function mapLegacyRow(row) {
  return {
    id: String(row.ID),
    date: row.Touchpoint_Date,
    first: row.First_Name || '',
    last: row.Last_Name || '',
    email: row.Email || '',
    phone: row.Phone_Number || '',
    poc: row.Point_of_Contact || '',
    aow: row.Area_of_Work || '',
    tow: row.Type_of_Work || '',
    moc: row.Method_of_Contact || '',
    stage: null,
    claim: null,
    acid: null,
    notes: row.Initial_first_call_notes || '',
    value: row.Value || null,
    source: row.Ultimate_Source || null,
    rating: row.Rating || null,
    _src: 'legacy',
  };
}

function dedupeResults(instructionResults, legacyResults) {
  const deduped = [];
  const seen = new Set();

  instructionResults.forEach((row) => {
    const key = `${(row.email || '').toLowerCase()}|${toDayKey(row.date)}`;
    seen.add(key);
    deduped.push(row);
  });

  legacyResults.forEach((row) => {
    const key = `${(row.email || '').toLowerCase()}|${toDayKey(row.date)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  });

  deduped.sort((left, right) => {
    const leftTs = left.date ? new Date(left.date).getTime() : 0;
    const rightTs = right.date ? new Date(right.date).getTime() : 0;
    return rightTs - leftTs;
  });

  return deduped;
}

async function searchInstructions(query, queryType, limit) {
  const instrConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!instrConnStr) return [];

  const rows = await withRequest(instrConnStr, async (request) => {
    request.input('limit', sql.Int, limit);
    const where = buildInstructionsWhere(request, query, queryType);
    return request.query(`
      SELECT TOP (@limit)
        id, datetime, first, last, email, phone, poc, aow, tow, moc,
        stage, claim, acid, notes, value, source, rating
      FROM dbo.enquiries
      WHERE ${where}
      ORDER BY datetime DESC
    `);
  });

  return (rows.recordset || []).map(mapInstructionRow);
}

async function searchLegacy(query, queryType, limit) {
  const mainConnStr = process.env.SQL_CONNECTION_STRING;
  if (!mainConnStr) return [];

  const rows = await withRequest(mainConnStr, async (request) => {
    request.input('limit', sql.Int, limit);
    const where = buildLegacyWhere(request, query, queryType);
    return request.query(`
      SELECT TOP (@limit)
        ID, Touchpoint_Date, First_Name, Last_Name, Email, Phone_Number,
        Point_of_Contact, Area_of_Work, Type_of_Work, Method_of_Contact,
        Initial_first_call_notes, Value, Ultimate_Source, Rating
      FROM enquiries
      WHERE ${where}
      ORDER BY Touchpoint_Date DESC
    `);
  });

  return (rows.recordset || []).map(mapLegacyRow);
}

router.get('/', async (req, res) => {
  const startedAt = Date.now();
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const query = String(q).trim();
  const queryType = classifyQuery(query);
  const limit = clampLimit(req.query.limit);
  const mode = String(req.query.mode || '').trim().toLowerCase();
  const stagedMode = mode === 'staged';
  const includeLegacy = String(req.query.includeLegacy || '').trim().toLowerCase() === 'true';
  const warnings = [];

  const complete = (payload) => {
    const durationMs = Date.now() - startedAt;
    trackEvent('Lookup.PeopleSearch.Completed', {
      operation: 'PeopleSearch.Lookup',
      triggeredBy: 'http',
      mode: stagedMode ? 'staged' : 'combined',
      stage: payload.stage || 'combined',
      includeLegacy,
      resultCount: payload.count,
      legacyAvailable: Boolean(payload.legacyAvailable),
      queryType,
    });
    trackMetric('Lookup.PeopleSearch.Duration', durationMs, {
      mode: stagedMode ? 'staged' : 'combined',
      stage: payload.stage || 'combined',
      queryType,
    });
    return res.json(payload);
  };

  trackEvent('Lookup.PeopleSearch.Started', {
    operation: 'PeopleSearch.Lookup',
    triggeredBy: 'http',
    mode: stagedMode ? 'staged' : 'combined',
    includeLegacy,
    queryLength: query.length,
    queryType,
  });

  try {
    let instructionResults = [];
    let legacyResults = [];

    try {
      instructionResults = await searchInstructions(query, queryType, limit);
    } catch (error) {
      log.warn?.('Instructions DB search failed:', error?.message);
      warnings.push('Instructions DB search failed');
    }

    if (stagedMode) {
      if (instructionResults.length > 0) {
        return complete({
          query,
          queryType,
          count: instructionResults.length,
          results: instructionResults,
          stage: 'current',
          legacyAvailable: false,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }

      try {
        legacyResults = await searchLegacy(query, queryType, includeLegacy ? limit : 1);
      } catch (error) {
        log.warn?.('Legacy DB search failed:', error?.message);
        warnings.push('Legacy DB search failed');
      }

      return complete({
        query,
        queryType,
        count: includeLegacy ? legacyResults.length : 0,
        results: includeLegacy ? legacyResults : [],
        stage: includeLegacy ? 'legacy' : 'current',
        legacyAvailable: legacyResults.length > 0,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    }

    try {
      legacyResults = await searchLegacy(query, queryType, limit);
    } catch (error) {
      log.warn?.('Legacy DB search failed:', error?.message);
      warnings.push('Legacy DB search failed');
    }

    const deduped = dedupeResults(instructionResults, legacyResults);
    return complete({
      query,
      queryType,
      count: deduped.length,
      results: deduped,
      stage: 'combined',
      legacyAvailable: false,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    trackException(error, {
      operation: 'PeopleSearch.Lookup',
      triggeredBy: 'http',
      mode: stagedMode ? 'staged' : 'combined',
      phase: 'route',
      queryType,
    });
    trackEvent('Lookup.PeopleSearch.Failed', {
      operation: 'PeopleSearch.Lookup',
      triggeredBy: 'http',
      mode: stagedMode ? 'staged' : 'combined',
      error: error?.message || String(error),
      queryType,
    });
    log.error?.('People search failed:', error?.message || error);
    return res.status(500).json({ error: 'People search failed', details: error?.message || String(error) });
  }
});

module.exports = router;
