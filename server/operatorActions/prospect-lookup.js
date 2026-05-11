// server/operatorActions/prospect-lookup.js
//
// Operator action: prospect by ProspectId → Deals + linked Instructions.
// Read-only. Parity with `node tools/instant-lookup.mjs prospect <id>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

function safeFragment(value) {
  return String(value || 'prospect').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'prospect';
}

async function runProspectLookup({ params }) {
  const pid = String(params.prospectId || '').trim();
  if (!pid) return { summary: 'Empty ProspectId', artefact: null, warnings: ['Empty ProspectId'] };

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const deals = (await pool.request()
    .input('pid', sql.VarChar, pid)
    .query(`
      SELECT TOP 50 DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef
      FROM Deals
      WHERE ProspectId = @pid
      ORDER BY DealId DESC
    `)).recordset;

  const instructionRefs = [...new Set(
    deals.map((d) => (d?.InstructionRef ? String(d.InstructionRef).trim() : '')).filter(Boolean)
  )];

  let instructions = [];
  if (instructionRefs.length > 0) {
    const req = pool.request();
    instructionRefs.forEach((ref, idx) => req.input(`ref${idx}`, sql.VarChar, ref));
    const inList = instructionRefs.map((_, idx) => `@ref${idx}`).join(',');
    instructions = (await req.query(`
      SELECT TOP 50 InstructionRef, Stage, FirstName, LastName, ClientId, MatterId, Email
      FROM Instructions
      WHERE InstructionRef IN (${inList})
      ORDER BY InstructionRef DESC
    `)).recordset;
  }

  const summary = `Prospect ${pid}: ${deals.length} deal(s), ${instructions.length} instruction(s)`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: {
        type: 'prospect',
        input: pid,
        scope: 'Instructions',
        recordset: [{ prospectId: pid, deals, instructions }],
      },
      downloadName: `prospect-lookup-${safeFragment(pid)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'prospect-lookup',
  title: 'Prospect lookup',
  description: 'Resolve a ProspectId to its Deals + linked Instructions. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'prospectId',
      label: 'ProspectId',
      type: 'text',
      required: true,
      placeholder: 'e.g. 30038',
      maxLength: 32,
      redactValue: false,
    },
  ],
  run: runProspectLookup,
});

module.exports = { runProspectLookup };
