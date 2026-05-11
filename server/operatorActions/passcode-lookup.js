// server/operatorActions/passcode-lookup.js
//
// Operator action: passcode → Deals + Instructions match. Read-only.
// Parity contract: same recordset shape as
//   `node tools/instant-lookup.mjs passcode <value>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

function safeFragment(value) {
  return String(value || 'passcode').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'passcode';
}

async function runPasscodeLookup({ params }) {
  const input = String(params.passcode || '').trim();
  if (!input) return { summary: 'Empty passcode', artefact: null, warnings: ['Empty passcode'] };
  const like = `%${input}%`;

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const recordset = (await pool.request()
    .input('passcode', sql.VarChar, input)
    .input('like', sql.VarChar, like)
    .query(`
      SELECT 'Deal' AS Type, DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef
      FROM Deals WHERE Passcode = @passcode
      UNION ALL
      SELECT 'Instruction' AS Type, InstructionRef, ProspectId, NULL, NULL, NULL, InstructionRef
      FROM Instructions WHERE InstructionRef LIKE @like
    `)).recordset;

  const summary = recordset.length === 0
    ? `No matches for passcode ${input}`
    : `Passcode ${input}: ${recordset.length} row(s)`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: { type: 'passcode', input, scope: 'Instructions', recordset },
      downloadName: `passcode-lookup-${safeFragment(input)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'passcode-lookup',
  title: 'Passcode lookup',
  description: 'Resolve a passcode to its Deal + Instruction rows. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'passcode',
      label: 'Passcode',
      type: 'text',
      required: true,
      placeholder: 'e.g. 37693',
      maxLength: 32,
      redactValue: false,
    },
  ],
  run: runPasscodeLookup,
});

module.exports = { runPasscodeLookup };
