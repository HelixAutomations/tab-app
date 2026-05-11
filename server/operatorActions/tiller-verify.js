// server/operatorActions/tiller-verify.js
//
// Operator action: pull the stored IDVerifications row(s) for an
// InstructionRef, plus the parent Instruction record. Read-only.
//
// NOTE: This is a *stored-data* lookup, not a live Tiller probe. The
// CLI counterpart `tools/tiller-verify.mjs` accepts raw PII (name, DOB,
// email, address) and POSTs to live Tiller — that flow is intentionally
// kept out of the dev-surface action lens to avoid pasting raw client
// PII through chat/JSON forms (see copilot-instructions.md).
//
// If a fee-earner needs to re-run a Tiller verification, use the CLI.
// This action exists to surface what was sent / received last time.

const sql = require('mssql');
const { registerAction } = require('./registry');

function safeFragment(value) {
  return String(value || 'tiller')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tiller';
}

function summariseEid(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'no stored verifications';
  const latest = rows[0] || {};
  const result = latest.EIDStatus || latest.EIDOverallResult || latest.EIDCheckResult || 'unknown';
  return `${rows.length} stored verification${rows.length === 1 ? '' : 's'} — latest: ${result}`;
}

async function runTillerVerify({ params }) {
  const ref = String(params.instructionRef || '').trim().toUpperCase();
  if (!ref) {
    return { summary: 'Empty InstructionRef', artefact: null, warnings: ['Empty InstructionRef'] };
  }

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const instructions = (await pool.request()
    .input('ref', sql.VarChar, ref)
    .query(`
      SELECT TOP 1 InstructionRef, Stage, ClientId, MatterId, FirstName, LastName,
             Email, Phone, DateOfBirth, Country, ProspectId
      FROM Instructions
      WHERE InstructionRef = @ref
    `)).recordset;

  let idVerifications = [];
  let unavailableReason = null;
  try {
    idVerifications = (await pool.request()
      .input('ref', sql.VarChar, ref)
      .query(`
        SELECT *
        FROM IDVerifications
        WHERE InstructionRef = @ref
        ORDER BY EIDCheckedDate DESC, InternalId DESC
      `)).recordset;
  } catch (err) {
    // Table missing or column name drift — surface as warning, don't fail.
    unavailableReason = err && err.message ? err.message : 'IDVerifications query failed';
  }

  const warnings = [];
  if (instructions.length === 0) warnings.push(`No Instructions row for ${ref}`);
  if (unavailableReason) warnings.push(`IDVerifications: ${unavailableReason}`);
  if (!unavailableReason && idVerifications.length === 0) warnings.push('No stored verifications for this ref');

  const summary = `Tiller stored — ${ref}: ${summariseEid(idVerifications)}`;

  return {
    summary,
    warnings: warnings.length > 0 ? warnings : undefined,
    artefact: {
      kind: 'json',
      body: {
        type: 'tiller-verify',
        input: ref,
        scope: 'Instructions (stored)',
        recordset: [{
          instructionRef: ref,
          instruction: instructions[0] || null,
          idVerifications,
        }],
      },
      downloadName: `tiller-verify-${safeFragment(ref)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'tiller-verify',
  title: 'Tiller verification (stored)',
  description: 'Look up the stored IDVerifications row(s) for an InstructionRef. Read-only — no live Tiller call.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'instructionRef',
      label: 'InstructionRef',
      type: 'text',
      required: true,
      placeholder: 'HLX-30038-73942',
      maxLength: 32,
      redactValue: false,
    },
  ],
  run: runTillerVerify,
});

module.exports = { runTillerVerify };
