// server/operatorActions/deal-lookup.js
//
// Operator action: deal by DealId. Read-only.
// Parity with `node tools/instant-lookup.mjs deal <id>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

async function runDealLookup({ params }) {
  const raw = String(params.dealId || '').trim();
  const dealId = Number.parseInt(raw, 10);
  if (!Number.isFinite(dealId)) {
    return { summary: 'DealId must be numeric', artefact: null, warnings: ['Non-numeric input'] };
  }

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const recordset = (await pool.request()
    .input('dealId', sql.Int, dealId)
    .query('SELECT * FROM Deals WHERE DealId = @dealId')).recordset;

  const summary = recordset.length === 0
    ? `No deal with id ${dealId}`
    : `Deal ${dealId}: matched`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: { type: 'deal', input: dealId, scope: 'Instructions', recordset },
      downloadName: `deal-lookup-${dealId}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'deal-lookup',
  title: 'Deal lookup',
  description: 'Fetch a Deals row by DealId. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'dealId',
      label: 'DealId',
      type: 'number',
      required: true,
      placeholder: 'e.g. 898',
      maxLength: 12,
      redactValue: false,
    },
  ],
  run: runDealLookup,
});

module.exports = { runDealLookup };
