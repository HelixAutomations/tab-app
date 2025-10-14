#!/usr/bin/env node
/**
 * Update an instruction's Stage field in dbo.Instructions.
 * Usage:
 *   node scripts/updateInstructionStage.js --ref HLX-26710-66409 --stage proof-of-id-complete
 *
 * Reads INSTRUCTIONS_SQL_CONNECTION_STRING from environment (.env supported).
 */
const path = require('path');
const dotenv = require('dotenv');
const sql = require('mssql');

// Load env from root .env files
dotenv.config({ path: path.join(__dirname, '../.env') });

// Simple arg parser
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const instructionRef = args.ref || process.env.INSTRUCTION_REF || 'HLX-26710-66409';
  const stage = (args.stage || process.env.NEW_STAGE || 'proof-of-id-complete');

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!connStr) {
    console.error('Missing INSTRUCTIONS_SQL_CONNECTION_STRING in environment.');
    process.exit(1);
  }

  console.log(`Updating Instructions.Stage for ${instructionRef} -> ${stage}`);

  let pool;
  try {
    pool = await sql.connect(connStr);

    const result = await pool.request()
      .input('ref', sql.VarChar(64), instructionRef)
      .input('stage', sql.VarChar(64), stage)
      .query(`
        UPDATE dbo.Instructions
        SET Stage = @stage
        WHERE InstructionRef = @ref;
        SELECT @@ROWCOUNT AS rowsAffected;
      `);

    const rows = result?.recordset?.[0]?.rowsAffected ?? 0;
    console.log(`Rows affected: ${rows}`);

    const verify = await pool.request()
      .input('ref', sql.VarChar(64), instructionRef)
      .query('SELECT TOP 1 InstructionRef, Stage, LastUpdated FROM dbo.Instructions WHERE InstructionRef = @ref');

    console.log('Post-update:', verify.recordset?.[0] || {});
  } catch (err) {
    console.error('Update failed:', err);
    process.exit(2);
  } finally {
    try { await pool?.close(); } catch {}
  }
})();
