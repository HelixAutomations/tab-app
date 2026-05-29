/**
 * Lightweight enquiry / prospect lookup for form pickers.
 *
 * Modern instructions DB (dbo.enquiries) is the source of truth. When nothing
 * is found there we fall back to the legacy enquiries DB so older records
 * remain reachable, badged as "legacy" so the UI can surface the distinction.
 */

const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 15;

function clean(value) {
  return String(value || '').trim();
}

function buildLikeTerm(value) {
  const safe = value.replace(/[%_\[]/g, (ch) => `[${ch}]`);
  return `%${safe}%`;
}

function normaliseNewRow(row) {
  if (!row) return null;
  const id = row.id != null ? String(row.id) : null;
  if (!id) return null;
  const name = [row.first, row.last].filter(Boolean).join(' ').trim();
  return {
    source: 'new',
    id,
    acid: row.acid || null,
    displayName: name || row.email || `Enquiry ${id}`,
    email: row.email || null,
    areaOfWork: row.pitch || row.aow || null,
    typeOfWork: row.tow || null,
    value: row.value != null ? String(row.value) : null,
    poc: row.poc || null,
    createdAt: row.datetime ? new Date(row.datetime).toISOString() : null,
  };
}

function normaliseLegacyRow(row) {
  if (!row) return null;
  const id = row.ID != null ? String(row.ID) : null;
  if (!id) return null;
  const name = [row.First_Name, row.Last_Name].filter(Boolean).join(' ').trim();
  return {
    source: 'legacy',
    id,
    acid: null,
    displayName: name || row.Email || `Enquiry ${id}`,
    email: row.Email || null,
    areaOfWork: row.Area_of_Work || null,
    typeOfWork: row.Type_of_Work || null,
    value: row.Value != null ? String(row.Value) : null,
    poc: row.Point_of_Contact || null,
    createdAt: row.Date_Created ? new Date(row.Date_Created).toISOString() : null,
  };
}

async function searchNewEnquiries(q, limit) {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) return [];
  const like = buildLikeTerm(q);
  const result = await withRequest(conn, (request, sqlTypes) =>
    request
      .input('q', sqlTypes.NVarChar(200), like)
      .input('exact', sqlTypes.NVarChar(200), q)
      .input('limit', sqlTypes.Int, limit)
      .query(`
        SELECT TOP (@limit) id, acid, first, last, email, pitch, aow, tow, value, poc, datetime
        FROM dbo.enquiries
        WHERE id = @exact
           OR acid = @exact
           OR email LIKE @q
           OR first LIKE @q
           OR last LIKE @q
           OR (ISNULL(first, '') + ' ' + ISNULL(last, '')) LIKE @q
        ORDER BY datetime DESC;
      `)
  );
  return (result.recordset || []).map(normaliseNewRow).filter(Boolean);
}

async function searchLegacyEnquiries(q, limit) {
  const conn = process.env.SQL_CONNECTION_STRING;
  if (!conn) return [];
  const like = buildLikeTerm(q);
  const result = await withRequest(conn, (request, sqlTypes) =>
    request
      .input('q', sqlTypes.NVarChar(200), like)
      .input('exact', sqlTypes.NVarChar(200), q)
      .input('limit', sqlTypes.Int, limit)
      .query(`
        SELECT TOP (@limit) ID, First_Name, Last_Name, Email, Area_of_Work, Type_of_Work, Value, Point_of_Contact, Date_Created
        FROM enquiries
        WHERE CAST(ID AS NVARCHAR(50)) = @exact
           OR Email LIKE @q
           OR First_Name LIKE @q
           OR Last_Name LIKE @q
           OR (ISNULL(First_Name, '') + ' ' + ISNULL(Last_Name, '')) LIKE @q
        ORDER BY Date_Created DESC;
      `)
  );
  return (result.recordset || []).map(normaliseLegacyRow).filter(Boolean);
}

router.options('/', (_req, res) => res.status(204).end());

router.get('/', async (req, res) => {
  const q = clean(req.query.q);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (q.length < 2) {
    return res.json({ query: q, results: [], counts: { new: 0, legacy: 0 }, fellBackToLegacy: false });
  }

  const started = Date.now();
  trackEvent('Forms.Enquiries.Lookup.Started', { length: String(q.length), limit: String(limit) });

  let newResults = [];
  let legacyResults = [];
  let fellBackToLegacy = false;
  const warnings = [];

  try {
    newResults = await searchNewEnquiries(q, limit);
  } catch (error) {
    trackException(error, { phase: 'lookup.new' });
    warnings.push({ source: 'new', message: error?.message || String(error) });
  }

  if (newResults.length === 0) {
    try {
      legacyResults = await searchLegacyEnquiries(q, limit);
      fellBackToLegacy = legacyResults.length > 0;
    } catch (error) {
      trackException(error, { phase: 'lookup.legacy' });
      warnings.push({ source: 'legacy', message: error?.message || String(error) });
    }
  }

  const combined = [...newResults, ...legacyResults].slice(0, limit);
  const durationMs = Date.now() - started;
  trackEvent('Forms.Enquiries.Lookup.Completed', {
    length: String(q.length),
    newCount: String(newResults.length),
    legacyCount: String(legacyResults.length),
    fellBackToLegacy: String(fellBackToLegacy),
  });
  trackMetric('Forms.Enquiries.Lookup.Duration', durationMs);

  return res.json({
    query: q,
    results: combined,
    counts: { new: newResults.length, legacy: legacyResults.length },
    fellBackToLegacy,
    warnings: warnings.length ? warnings : undefined,
  });
});

module.exports = router;
