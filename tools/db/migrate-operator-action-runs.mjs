/**
 * Create dbo.operator_action_runs in the Instructions DB.
 *
 * Audit trail for the in-app Operator Actions surface (B1, Phase A).
 * Every action invocation (including dry-runs) writes one row here.
 * Params are redacted at write time — see server/operatorActions/redact.js.
 *
 * Optional companion table dbo.operator_action_attachments is created in
 * Phase B (artefact contract). Not part of this migration.
 *
 * Run:
 *   node tools/db/migrate-operator-action-runs.mjs
 */
import { config } from 'dotenv';
import sql from 'mssql';
import { createRequire } from 'module';

config();
const require = createRequire(import.meta.url);
const { getSecret } = require('../../server/utils/getSecret.js');

function isUsableConnectionString(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.includes('***')
    && !value.includes('REDACTED')
    && !value.includes('<REDACTED>');
}

async function resolveInstructionsConn() {
  const raw = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (isUsableConnectionString(raw)) return raw;
  const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
  const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
  const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
  const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';
  const password = await getSecret(secretName);
  return `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=60;`;
}

const connStr = await resolveInstructionsConn();
const pool = await sql.connect(connStr);

console.log('Connected to Instructions DB');

const tableResult = await pool.request().query(`
  IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'operator_action_runs' AND schema_id = SCHEMA_ID('dbo')
  )
  BEGIN
    CREATE TABLE dbo.operator_action_runs (
      id                    UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
      action_id             NVARCHAR(100)     NOT NULL,
      requestor_initials    NVARCHAR(16)      NULL,
      requestor_email       NVARCHAR(320)     NULL,
      requestor_name        NVARCHAR(200)     NULL,
      tier                  NVARCHAR(32)      NOT NULL,
      params_json           NVARCHAR(MAX)     NULL,
      dry_run               BIT               NOT NULL DEFAULT 0,
      started_at            DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
      finished_at           DATETIMEOFFSET(3) NULL,
      duration_ms           INT               NULL,
      status                NVARCHAR(16)      NOT NULL DEFAULT 'running',
      summary               NVARCHAR(2000)    NULL,
      artefact_kind         NVARCHAR(32)      NULL,
      artefact_size_bytes   INT               NULL,
      artefact_blob_url     NVARCHAR(1000)    NULL,
      error                 NVARCHAR(2000)    NULL,
      telemetry_event_id    NVARCHAR(100)     NULL,
      CONSTRAINT PK_operator_action_runs PRIMARY KEY (id)
    );
    SELECT 'CREATED' AS result;
  END
  ELSE
  BEGIN
    SELECT 'ALREADY_EXISTS' AS result;
  END
`);
console.log('Table dbo.operator_action_runs:', tableResult.recordset[0].result);

async function createIndex(name, ddl) {
  const result = await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.operator_action_runs') AND name = '${name}')
    BEGIN
      ${ddl}
      SELECT 'CREATED' AS result;
    END
    ELSE
    BEGIN
      SELECT 'ALREADY_EXISTS' AS result;
    END
  `);
  console.log(`Index ${name}:`, result.recordset[0].result);
}

await createIndex(
  'IX_operator_action_runs_action_started',
  `CREATE INDEX IX_operator_action_runs_action_started
     ON dbo.operator_action_runs (action_id, started_at DESC);`
);

await createIndex(
  'IX_operator_action_runs_requestor_started',
  `CREATE INDEX IX_operator_action_runs_requestor_started
     ON dbo.operator_action_runs (requestor_initials, started_at DESC);`
);

await pool.close();
console.log('Done.');
