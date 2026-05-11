// server/operatorActions/dataops-recent.js
//
// Operator action: recent rows from dbo.dataOpsLog (Instructions DB),
// scoped by a London-aware phrase like "today" / "yesterday" / "this week" /
// "last week" / "last 7 days". Read-only.
// Parity with `node tools/instant-lookup.mjs ops "<phrase>"`.

const sql = require('mssql');
const { registerAction } = require('./registry');
const { buildOpsRangeFromPhrase } = require('./_opsRangeHelpers');

function safeFragment(value) {
  return String(value || 'range').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'range';
}

async function runDataOpsRecent({ params }) {
  const phrase = String(params.range || 'this week').trim() || 'this week';
  const range = buildOpsRangeFromPhrase(phrase);

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const countResult = await pool.request()
    .input('start', sql.DateTime2, range.startDate)
    .input('end', sql.DateTime2, range.endDate)
    .query('SELECT COUNT(*) AS cnt FROM dataOpsLog WHERE ts >= @start AND ts <= @end');

  const rows = (await pool.request()
    .input('start', sql.DateTime2, range.startDate)
    .input('end', sql.DateTime2, range.endDate)
    .query(`
      SELECT TOP 200
        ts, operation, status, message,
        startDate, endDate, deletedRows, insertedRows, durationMs
      FROM dataOpsLog
      WHERE ts >= @start AND ts <= @end
      ORDER BY ts DESC
    `)).recordset;

  const total = countResult.recordset?.[0]?.cnt ?? 0;
  const summary = `dataOpsLog ${range.label}: ${total} rows (showing top ${Math.min(rows.length, 200)})`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: {
        type: 'dataops-recent',
        input: phrase,
        scope: 'Instructions',
        recordset: [{
          range: range.label,
          start: range.startDate.toISOString(),
          end: range.endDate.toISOString(),
          total,
          operations: rows,
        }],
      },
      downloadName: `dataops-recent-${safeFragment(range.label)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'dataops-recent',
  title: 'Data Ops recent',
  description: 'Recent dbo.dataOpsLog rows scoped by a phrase (today / yesterday / this week / last week / last 7 days). Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'range',
      label: 'Range phrase',
      type: 'text',
      required: false,
      placeholder: 'this week',
      helpText: 'Recognised: today, yesterday, this week, last week, last 7 days. Defaults to "this week".',
      maxLength: 64,
      redactValue: false,
    },
  ],
  run: runDataOpsRecent,
});

module.exports = { runDataOpsRecent };
