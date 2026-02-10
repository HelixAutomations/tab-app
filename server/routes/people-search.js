/**
 * People Search — cross-database enquiry lookup by name, email, or phone.
 * GET /api/people-search?q=<term>
 *
 * Searches both helix-core-data (legacy) and instructions DB, deduplicates
 * by email+date, and returns a unified result set.
 */
const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = (loggers.enquiries || loggers.default || console).child?.('PeopleSearch') || console;

const MAX_RESULTS = 30;

/**
 * Detect whether the query looks like an email, phone, or name.
 */
function classifyQuery(q) {
  const trimmed = q.trim();
  if (trimmed.includes('@')) return 'email';
  // Strip non-digits; if 7+ digits remain, treat as phone
  if (trimmed.replace(/[^\d]/g, '').length >= 7) return 'phone';
  return 'name';
}

/**
 * Normalise phone to digits-only for comparison.
 */
function normalisePhone(raw) {
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '').replace(/^0/, '44').replace(/^44/, '');
}

router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const query = String(q).trim();
  const queryType = classifyQuery(query);
  const results = [];
  const warnings = [];

  const mainConnStr = process.env.SQL_CONNECTION_STRING;
  const instrConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  // ----- Instructions DB (new) -----
  if (instrConnStr) {
    try {
      const rows = await withRequest(instrConnStr, async (request) => {
        let where = '';
        if (queryType === 'email') {
          request.input('email', sql.NVarChar(255), query.toLowerCase());
          where = 'LOWER(email) = @email';
        } else if (queryType === 'phone') {
          request.input('phone', sql.NVarChar(50), `%${normalisePhone(query)}%`);
          where = "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE @phone";
        } else {
          // Name search — split into parts for first/last
          const parts = query.split(/\s+/);
          if (parts.length >= 2) {
            request.input('first', sql.NVarChar(255), `%${parts[0]}%`);
            request.input('last', sql.NVarChar(255), `%${parts.slice(1).join(' ')}%`);
            where = '(first LIKE @first AND last LIKE @last)';
          } else {
            request.input('term', sql.NVarChar(255), `%${parts[0]}%`);
            where = '(first LIKE @term OR last LIKE @term OR email LIKE @term)';
          }
        }

        return await request.query(`
          SELECT TOP ${MAX_RESULTS}
            id, datetime, first, last, email, phone, poc, aow, tow, moc,
            stage, claim, acid, notes, value, source, rating
          FROM dbo.enquiries
          WHERE ${where}
          ORDER BY datetime DESC
        `);
      });

      (rows.recordset || []).forEach(r => {
        results.push({
          id: String(r.id),
          date: r.datetime,
          first: r.first || '',
          last: r.last || '',
          email: r.email || '',
          phone: r.phone || '',
          poc: r.poc || '',
          aow: r.aow || '',
          tow: r.tow || '',
          moc: r.moc || '',
          stage: r.stage || null,
          claim: r.claim || null,
          acid: r.acid || null,
          notes: r.notes || '',
          value: r.value || null,
          source: r.source || null,
          rating: r.rating || null,
          _src: 'instructions',
        });
      });
    } catch (err) {
      log.warn?.('Instructions DB search failed:', err?.message);
      warnings.push('Instructions DB search failed');
    }
  }

  // ----- Legacy DB -----
  if (mainConnStr) {
    try {
      const rows = await withRequest(mainConnStr, async (request) => {
        let where = '';
        if (queryType === 'email') {
          request.input('email', sql.NVarChar(255), query.toLowerCase());
          where = 'LOWER(LTRIM(RTRIM(Email))) = @email';
        } else if (queryType === 'phone') {
          request.input('phone', sql.NVarChar(50), `%${normalisePhone(query)}%`);
          where = "REPLACE(REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', ''), '(', '') LIKE @phone";
        } else {
          const parts = query.split(/\s+/);
          if (parts.length >= 2) {
            request.input('first', sql.NVarChar(255), `%${parts[0]}%`);
            request.input('last', sql.NVarChar(255), `%${parts.slice(1).join(' ')}%`);
            where = '(First_Name LIKE @first AND Last_Name LIKE @last)';
          } else {
            request.input('term', sql.NVarChar(255), `%${parts[0]}%`);
            where = '(First_Name LIKE @term OR Last_Name LIKE @term OR Email LIKE @term)';
          }
        }

        return await request.query(`
          SELECT TOP ${MAX_RESULTS}
            ID, Touchpoint_Date, First_Name, Last_Name, Email, Phone_Number,
            Point_of_Contact, Area_of_Work, Type_of_Work, Method_of_Contact,
            Initial_first_call_notes, Value, Ultimate_Source, Rating
          FROM enquiries
          WHERE ${where}
          ORDER BY Touchpoint_Date DESC
        `);
      });

      (rows.recordset || []).forEach(r => {
        results.push({
          id: String(r.ID),
          date: r.Touchpoint_Date,
          first: r.First_Name || '',
          last: r.Last_Name || '',
          email: r.Email || '',
          phone: r.Phone_Number || '',
          poc: r.Point_of_Contact || '',
          aow: r.Area_of_Work || '',
          tow: r.Type_of_Work || '',
          moc: r.Method_of_Contact || '',
          stage: null,
          claim: null,
          acid: null,
          notes: r.Initial_first_call_notes || '',
          value: r.Value || null,
          source: r.Ultimate_Source || null,
          rating: r.Rating || null,
          _src: 'legacy',
        });
      });
    } catch (err) {
      log.warn?.('Legacy DB search failed:', err?.message);
      warnings.push('Legacy DB search failed');
    }
  }

  // ----- Deduplicate: prefer instructions record when same email + same day -----
  const deduped = [];
  const seen = new Set();

  // Instructions records first (richer data)
  const instrResults = results.filter(r => r._src === 'instructions');
  const legacyResults = results.filter(r => r._src === 'legacy');

  instrResults.forEach(r => {
    const day = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
    const key = `${(r.email || '').toLowerCase()}|${day}`;
    seen.add(key);
    deduped.push(r);
  });

  legacyResults.forEach(r => {
    const day = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
    const key = `${(r.email || '').toLowerCase()}|${day}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  });

  // Sort by date descending
  deduped.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  res.json({
    query,
    queryType,
    count: deduped.length,
    results: deduped,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
});

module.exports = router;
