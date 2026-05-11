/**
 * Create dbo.operator_action_attachments in the Instructions DB.
 *
 * One row per attach attempt for an Operator Action run (B1, Phase B).
 * See server/operatorActions/attach.js for the dispatcher that writes
 * these rows and server/routes/operator-actions.js for the HTTP surface.
 *
 * Run:
 *   node tools/db/migrate-operator-action-attachments.mjs
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
    SELECT 1 FROM sys.tables WHERE name = 'operator_action_attachments' AND schema_id = SCHEMA_ID('dbo')
  )
  BEGIN
    CREATE TABLE dbo.operator_action_attachments (
      id                    UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
      run_id                UNIQUEIDENTIFIER  NOT NULL,
      action_id             NVARCHAR(100)     NOT NULL,
      target                NVARCHAR(32)      NOT NULL, -- blob | asana | matter | prospect | time-entry
      target_ref            NVARCHAR(400)     NULL,     -- e.g. blob path, asana task gid, matter id
      target_meta_json      NVARCHAR(MAX)     NULL,     -- payload echo + remote ids
      attached_by_initials  NVARCHAR(16)      NULL,
      attached_by_email     NVARCHAR(320)     NULL,
      attached_at           DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
      duration_ms           INT               NULL,
      status                NVARCHAR(16)      NOT NULL DEFAULT 'completed', -- completed | failed
      error                 NVARCHAR(2000)    NULL,
      CONSTRAINT PK_operator_action_attachments PRIMARY KEY (id),
      CONSTRAINT FK_operator_action_attachments_run
        FOREIGN KEY (run_id) REFERENCES dbo.operator_action_runs(id)
    );
    SELECT 'CREATED' AS result;
  END
  ELSE
  BEGIN
    SELECT 'ALREADY_EXISTS' AS result;
  END
`);
console.log('Table dbo.operator_action_attachments:', tableResult.recordset[0].result);

async function createIndex(name, ddl) {
  const result = await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.operator_action_attachments') AND name = '${name}')
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
  'IX_operator_action_attachments_run',
  'CREATE INDEX IX_operator_action_attachments_run ON dbo.operator_action_attachments(run_id, attached_at DESC);'
);
await createIndex(
  'IX_operator_action_attachments_action',
  'CREATE INDEX IX_operator_action_attachments_action ON dbo.operator_action_attachments(action_id, attached_at DESC);'
);

await pool.close();
console.log('Done.');
