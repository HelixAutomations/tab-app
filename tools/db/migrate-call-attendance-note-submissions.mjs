/**
 * Create dbo.call_attendance_note_submissions in the Instructions DB.
 *
 * Source-of-truth table for telephone attendance-note submissions.
 * Completion semantics:
 *   - matter   = SQL + ops queue + NetDocuments upload + Clio communication + Clio activity
 *   - prospect = SQL + ActiveCampaign contact note
 *
 * Runtime also bootstraps this table defensively, but this migration is the
 * preferred controlled deployment path.
 *
 * Run:
 *   node tools/db/migrate-call-attendance-note-submissions.mjs
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
    SELECT 1 FROM sys.tables WHERE name = 'call_attendance_note_submissions' AND schema_id = SCHEMA_ID('dbo')
  )
  BEGIN
    CREATE TABLE dbo.call_attendance_note_submissions (
      id                              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      recording_id                    NVARCHAR(100)    NOT NULL,
      target_type                     NVARCHAR(20)     NOT NULL,
      form_submission_id              UNIQUEIDENTIFIER NULL,
      matter_ref                      NVARCHAR(100)    NULL,
      matter_id                       NVARCHAR(100)    NULL,
      clio_matter_id                  NVARCHAR(100)    NULL,
      clio_user_id                    NVARCHAR(100)    NULL,
      enquiry_id                      INT              NULL,
      passcode                        NVARCHAR(100)    NULL,
      contact_name                    NVARCHAR(300)    NULL,
      ac_contact_id                   NVARCHAR(100)    NULL,
      ac_note_id                      NVARCHAR(100)    NULL,
      submitted_by_initials           NVARCHAR(16)     NOT NULL,
      submitted_by_email              NVARCHAR(320)    NULL,
      submitted_by_entra_id           NVARCHAR(100)    NULL,
      submitted_by_name               NVARCHAR(200)    NULL,
      submitted_at                    DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
      updated_at                      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
      call_date                       DATE             NULL,
      call_started_at                 NVARCHAR(64)     NULL,
      call_duration_seconds           INT              NULL,
      parties_from                    NVARCHAR(300)    NULL,
      parties_to                      NVARCHAR(300)    NULL,
      summary                         NVARCHAR(500)    NULL,
      attendance_note_text            NVARCHAR(MAX)    NULL,
      note_json                       NVARCHAR(MAX)    NOT NULL,
      payload_json                    NVARCHAR(MAX)    NOT NULL,
      required_steps_json             NVARCHAR(MAX)    NULL,
      processing_steps_json           NVARCHAR(MAX)    NULL,
      processing_status               NVARCHAR(32)     NOT NULL DEFAULT 'processing',
      last_event                      NVARCHAR(200)    NULL,
      last_error                      NVARCHAR(1000)   NULL,
      last_event_at                   DATETIMEOFFSET(3) NULL,
      blob_name                       NVARCHAR(300)    NULL,
      blob_url                        NVARCHAR(1000)   NULL,
      doc_file_name                   NVARCHAR(300)    NULL,
      nd_workspace_id                 NVARCHAR(100)    NULL,
      nd_folder_id                    NVARCHAR(100)    NULL,
      nd_doc_id                       NVARCHAR(100)    NULL,
      nd_uploaded_at                  DATETIMEOFFSET(3) NULL,
      clio_communication_id           NVARCHAR(100)    NULL,
      clio_activity_id                NVARCHAR(100)    NULL,
      clio_activity_quantity_seconds  INT              NULL,
      clio_recorded_at                DATETIMEOFFSET(3) NULL,
      ac_synced                       BIT              NOT NULL DEFAULT 0,
      ac_error                        NVARCHAR(1000)   NULL,
      ac_recorded_at                  DATETIMEOFFSET(3) NULL,
      completed_at                    DATETIMEOFFSET(3) NULL,
      CONSTRAINT PK_call_attendance_note_submissions PRIMARY KEY (id),
      CONSTRAINT UQ_call_attendance_note_submissions_recording UNIQUE (recording_id)
    );
    SELECT 'CREATED' AS result;
  END
  ELSE
  BEGIN
    SELECT 'ALREADY_EXISTS' AS result;
  END
`);
console.log('Table dbo.call_attendance_note_submissions:', tableResult.recordset[0].result);

async function createIndex(name, ddl) {
  const result = await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.call_attendance_note_submissions') AND name = '${name}')
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
  'IX_call_attendance_note_submissions_target_status',
  `CREATE INDEX IX_call_attendance_note_submissions_target_status
     ON dbo.call_attendance_note_submissions (target_type, processing_status, submitted_at DESC);`,
);

await createIndex(
  'IX_call_attendance_note_submissions_owner',
  `CREATE INDEX IX_call_attendance_note_submissions_owner
     ON dbo.call_attendance_note_submissions (submitted_by_initials, submitted_at DESC);`,
);

await createIndex(
  'IX_call_attendance_note_submissions_matter',
  `CREATE INDEX IX_call_attendance_note_submissions_matter
     ON dbo.call_attendance_note_submissions (matter_ref, submitted_at DESC)
     WHERE matter_ref IS NOT NULL;`,
);

await createIndex(
  'IX_call_attendance_note_submissions_enquiry',
  `CREATE INDEX IX_call_attendance_note_submissions_enquiry
     ON dbo.call_attendance_note_submissions (enquiry_id, submitted_at DESC)
     WHERE enquiry_id IS NOT NULL;`,
);

const verify = await pool.request().query(`
  SELECT i.name, i.type_desc,
    STRING_AGG(c.name, ', ') WITHIN GROUP(ORDER BY ic.key_ordinal) AS cols
  FROM sys.indexes i
  JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
  JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
  WHERE i.object_id = OBJECT_ID('dbo.call_attendance_note_submissions')
  GROUP BY i.name, i.type_desc
  ORDER BY i.name;
`);

console.log('\nIndexes on dbo.call_attendance_note_submissions:');
for (const idx of verify.recordset) {
  console.log(`  ${idx.name} (${idx.type_desc}): ${idx.cols}`);
}

await pool.close();
console.log('\nDone.');
