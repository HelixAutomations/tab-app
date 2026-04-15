const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');

const router = express.Router();

// GET /api/enquiries-today
// Returns enquiries from helix-core-data where Touchpoint_Date is today (or a provided date)
router.get('/', async (req, res) => {
  const mainConnectionString = process.env.SQL_CONNECTION_STRING;
  if (!mainConnectionString) {
    return res.status(500).json({ enquiries: [], count: 0, error: 'Database configuration missing' });
  }

  // Optional query param ?date=YYYY-MM-DD (defaults to today)
  const dateParam = req.query.date;
  const baseDate = (() => {
    if (typeof dateParam === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateParam)) {
      return new Date(dateParam + 'T00:00:00Z');
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  try {
    const result = await withRequest(mainConnectionString, async (request) => {
      request.requestTimeout = Number(process.env.SQL_REQUEST_TIMEOUT_MS) || 300000;
      request.input('targetDate', sql.Date, baseDate);

      // Robust filter: handle Touchpoint_Date as DATE, DATETIME, or VARCHAR (dd/MM/yyyy)
      const query = `
        SELECT
          ID,
          Date_Created,
          Touchpoint_Date,
          Point_of_Contact,
          Call_Taker,
          Area_of_Work,
          Type_of_Work,
          Method_of_Contact,
          Value,
          Rating,
          Ultimate_Source,
          Contact_Referrer,
          Referring_Company,
          GCLID
        FROM enquiries WITH (NOLOCK)
        WHERE
          (
            -- If already date/datetime
            TRY_CONVERT(date, Touchpoint_Date) = @targetDate
            OR
            -- If stored as dd/MM/yyyy text
            TRY_CONVERT(date, Touchpoint_Date, 103) = @targetDate
          )
        ORDER BY
          -- Order by parsed date desc, fallback to Date_Created
          COALESCE(TRY_CONVERT(datetime, Touchpoint_Date), TRY_CONVERT(datetime, Touchpoint_Date, 103), Date_Created) DESC`;

      const result = await request.query(query);
      const rows = result.recordset || [];
      return res.status(200).json({ enquiries: rows, count: rows.length, date: baseDate.toISOString().slice(0, 10) });
    });
  } catch (err) {
    console.error('❌ Error querying enquiries for today:', err.message);
    return res.status(200).json({ enquiries: [], count: 0, error: 'Query failed' });
  }
});

module.exports = router;
