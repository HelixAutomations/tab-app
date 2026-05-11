// server/operatorActions/instruction-lookup.js
//
// Operator action: instruction by InstructionRef. Read-only.
// Parity with `node tools/instant-lookup.mjs instruction <ref>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

function safeFragment(value) {
  return String(value || 'instruction').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'instruction';
}

async function runInstructionLookup({ params }) {
  const input = String(params.instructionRef || '').trim();
  if (!input) {
    return { summary: 'Empty InstructionRef', artefact: null, warnings: ['Empty InstructionRef'] };
  }

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const recordset = (await pool.request()
    .input('instructionRef', sql.VarChar, input)
    .query('SELECT * FROM Instructions WHERE InstructionRef = @instructionRef')).recordset;

  const summary = recordset.length === 0
    ? `No instruction matching ${input}`
    : `Instruction ${input}: matched`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: { type: 'instruction', input, scope: 'Instructions', recordset },
      downloadName: `instruction-lookup-${safeFragment(input)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'instruction-lookup',
  title: 'Instruction lookup',
  description: 'Fetch an Instructions row by InstructionRef. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'instructionRef',
      label: 'InstructionRef',
      type: 'text',
      required: true,
      placeholder: 'e.g. HLX-00898-37693',
      maxLength: 64,
      redactValue: false,
    },
  ],
  run: runInstructionLookup,
});

module.exports = { runInstructionLookup };
