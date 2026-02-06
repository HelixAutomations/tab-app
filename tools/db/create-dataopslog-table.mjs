#!/usr/bin/env node
/**
 * Create dataOpsLog table in Core Data DB
 * 
 * Usage:
 *   node tools/db/create-dataopslog-table.mjs          # Dry run (show SQL only)
 *   node tools/db/create-dataopslog-table.mjs --run    # Execute against database
 * 
 * This table persists data operation logs (Clio→SQL syncs, etc.)
 * Previously stored in-memory; now persisted for audit and debugging.
 */

import { config } from 'dotenv';
config();

const CREATE_TABLE_SQL = `
-- Create dataOpsLog table for persistent operation logging
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'dataOpsLog')
BEGIN
    CREATE TABLE dataOpsLog (
        id            bigint IDENTITY(1,1) PRIMARY KEY,
        ts            datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        jobId         uniqueidentifier NULL,
        operation     nvarchar(120) NOT NULL,
        entity        nvarchar(60) NULL,
        sourceSystem  nvarchar(30) NULL,
        direction     nvarchar(12) NULL,
        status        nvarchar(20) NOT NULL,
        message       nvarchar(500) NULL,
        startDate     date NULL,
        endDate       date NULL,
        deletedRows   int NULL,
        insertedRows  int NULL,
        changedRows   int NULL,
        durationMs    int NULL,
        triggeredBy   nvarchar(40) NULL,
        invokedBy     nvarchar(120) NULL,
        meta          nvarchar(max) NULL
    );
    PRINT 'Created table: dataOpsLog';
END
ELSE
BEGIN
    PRINT 'Table dataOpsLog already exists - skipping creation';
END
`;

const CREATE_INDEXES_SQL = `
-- Index: recent operations (most common query)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_dataOpsLog_ts' AND object_id = OBJECT_ID('dataOpsLog'))
BEGIN
    CREATE INDEX IX_dataOpsLog_ts ON dataOpsLog(ts DESC);
    PRINT 'Created index: IX_dataOpsLog_ts';
END

-- Index: job correlation (for abort/progress tracking)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_dataOpsLog_jobId' AND object_id = OBJECT_ID('dataOpsLog'))
BEGIN
    CREATE INDEX IX_dataOpsLog_jobId ON dataOpsLog(jobId) WHERE jobId IS NOT NULL;
    PRINT 'Created index: IX_dataOpsLog_jobId';
END

-- Index: operation history
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_dataOpsLog_operation_ts' AND object_id = OBJECT_ID('dataOpsLog'))
BEGIN
    CREATE INDEX IX_dataOpsLog_operation_ts ON dataOpsLog(operation, ts DESC);
    PRINT 'Created index: IX_dataOpsLog_operation_ts';
END

-- Index: entity history
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_dataOpsLog_entity_ts' AND object_id = OBJECT_ID('dataOpsLog'))
BEGIN
    CREATE INDEX IX_dataOpsLog_entity_ts ON dataOpsLog(entity, ts DESC) WHERE entity IS NOT NULL;
    PRINT 'Created index: IX_dataOpsLog_entity_ts';
END
`;

const FULL_SQL = CREATE_TABLE_SQL + '\n' + CREATE_INDEXES_SQL;

async function main() {
  const dryRun = !process.argv.includes('--run');

  console.log('='.repeat(60));
  console.log('dataOpsLog Table Migration');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --run to execute)' : 'LIVE EXECUTION'}`);
  console.log('Target: Instructions DB (INSTRUCTIONS_SQL_CONNECTION_STRING)');
  console.log('');

  if (dryRun) {
    console.log('SQL to execute:\n');
    console.log(FULL_SQL);
    console.log('\nRun with --run flag to execute against database.');
    return;
  }

  // Try env var first, fall back to Key Vault
  let connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  
  // Check if connection string is missing or redacted
  const needsKeyVault = !connStr || connStr.includes('***') || connStr.includes('REDACTED');
  
  if (needsKeyVault) {
    console.log('Connection string missing/redacted, fetching password from Key Vault...');
    try {
      const { getSecret } = await import('../../server/utils/getSecret.js');
      const sqlPassword = await getSecret('instructions-sql-password');
      connStr = `Server=tcp:instructions.database.windows.net,1433;Initial Catalog=instructions;Persist Security Info=False;User ID=instructionsadmin;Password=${sqlPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
      console.log('Password retrieved from Key Vault.');
    } catch (kvErr) {
      console.error('ERROR: Could not get password from Key Vault:', kvErr.message);
      process.exit(1);
    }
  }

  const m = await import('mssql');
  const sql = m.default || m;

  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(connStr);
    
    console.log('Executing migration...\n');
    const result = await pool.request().query(FULL_SQL);
    
    console.log('\nMigration complete.');
    console.log('Output messages:', result.output || '(none)');
    
    // Verify table exists
    const verify = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'dataOpsLog'
    `);
    console.log(`Verification: dataOpsLog table exists = ${verify.recordset[0].cnt > 0}`);
    
    await pool.close();
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

main();
