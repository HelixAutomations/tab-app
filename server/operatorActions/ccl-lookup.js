// server/operatorActions/ccl-lookup.js
//
// Operator action: CCL persistence inspector.
// Mode is auto-detected from `query`:
//   - empty / "stats" / "summary"     → stats overview
//   - all-numeric                     → matter id
//   - starts with HLX-                → instruction ref
//   - one of draft/final/uploaded/sent → status filter
//   - anything else                   → name/text search across CclContent
// Read-only. Parity with `node tools/instant-lookup.mjs ccl <query>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

function safeFragment(value) {
  return String(value || 'ccl').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ccl';
}

async function runCclLookup({ params }) {
  const input = String(params.query || '').trim();

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const tableCheck = await pool.request().query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'Ccl%'`
  );
  const existingTables = tableCheck.recordset.map((r) => r.TABLE_NAME);
  if (existingTables.length === 0) {
    return {
      summary: 'No CCL tables found',
      warnings: ['Run tools/db/migrate-ccl-persistence.sql before this action.'],
      artefact: {
        kind: 'json',
        body: { type: 'ccl', mode: 'unavailable', input, scope: 'Instructions', recordset: [] },
        downloadName: `ccl-lookup-${safeFragment(input || 'unavailable')}.json`,
        mimeType: 'application/json',
        attachableTo: ['blob', 'asana'],
      },
    };
  }

  const isMatterId = /^\d+$/.test(input);
  const isInstructionRef = /^HLX-/i.test(input);
  const isStatus = ['draft', 'final', 'uploaded', 'sent'].includes(input.toLowerCase());
  const isStatsRequest = !input || input === 'stats' || input === 'summary';

  let mode;
  let recordset;
  let summary;

  if (isStatsRequest) {
    mode = 'stats';
    const stats = {};
    if (existingTables.includes('CclContent')) {
      const r = await pool.request().query(`
        SELECT
          COUNT(DISTINCT MatterId) AS TotalMatters,
          COUNT(*) AS TotalVersions,
          SUM(CASE WHEN Status = 'draft' THEN 1 ELSE 0 END) AS Drafts,
          SUM(CASE WHEN Status = 'final' THEN 1 ELSE 0 END) AS Finals,
          SUM(CASE WHEN Status = 'uploaded' THEN 1 ELSE 0 END) AS Uploaded,
          SUM(CASE WHEN UploadedToClio = 1 THEN 1 ELSE 0 END) AS ClioUploads,
          SUM(CASE WHEN UploadedToNd = 1 THEN 1 ELSE 0 END) AS NdUploads,
          MIN(CreatedAt) AS FirstCcl,
          MAX(CreatedAt) AS LatestCcl
        FROM CclContent
      `);
      stats.content = r.recordset[0];

      const pa = await pool.request().query(`
        SELECT ISNULL(PracticeArea, 'Unknown') AS PracticeArea,
          COUNT(DISTINCT MatterId) AS Matters, COUNT(*) AS Versions
        FROM CclContent GROUP BY PracticeArea ORDER BY Matters DESC
      `);
      stats.byPracticeArea = pa.recordset;

      const fe = await pool.request().query(`
        SELECT ISNULL(FeeEarner, 'Unknown') AS FeeEarner,
          COUNT(DISTINCT MatterId) AS Matters
        FROM CclContent GROUP BY FeeEarner ORDER BY Matters DESC
      `);
      stats.byFeeEarner = fe.recordset;
    }
    if (existingTables.includes('CclAiTrace')) {
      const r = await pool.request().query(`
        SELECT
          COUNT(*) AS TotalAiCalls,
          SUM(CASE WHEN AiStatus = 'complete' THEN 1 ELSE 0 END) AS FullAi,
          SUM(CASE WHEN AiStatus = 'partial' THEN 1 ELSE 0 END) AS PartialAi,
          SUM(CASE WHEN AiStatus = 'fallback' THEN 1 ELSE 0 END) AS FallbackAi,
          AVG(DurationMs) AS AvgDurationMs,
          AVG(GeneratedFieldCount) AS AvgFieldCount
        FROM CclAiTrace
      `);
      stats.ai = r.recordset[0];
    }
    recordset = [{ tables: existingTables, ...stats }];
    summary = `CCL stats: ${stats.content?.TotalMatters ?? 0} matters, ${stats.content?.TotalVersions ?? 0} versions`;
  } else if (isMatterId) {
    mode = 'matter';
    const result = { matterId: input };
    if (existingTables.includes('CclContent')) {
      const r = await pool.request()
        .input('MatterId', sql.NVarChar(50), input)
        .query(`SELECT CclContentId, MatterId, InstructionRef, DocumentType, ClientName,
                FeeEarner, PracticeArea, Version, Status, UploadedToClio, UploadedToNd,
                SentToClient, TemplateVersion, CreatedBy, CreatedAt, FinalizedAt
          FROM CclContent WHERE MatterId = @MatterId ORDER BY Version DESC`);
      result.versions = r.recordset;
      result.versionCount = r.recordset.length;
    }
    if (existingTables.includes('CclAiTrace')) {
      const r = await pool.request()
        .input('MatterId', sql.NVarChar(50), input)
        .query(`SELECT CclAiTraceId, TrackingId, AiStatus, Model, DurationMs,
                GeneratedFieldCount, Confidence, FallbackReason, RetryCount, CreatedBy, CreatedAt
          FROM CclAiTrace WHERE MatterId = @MatterId ORDER BY CreatedAt DESC`);
      result.aiTraces = r.recordset;
    }
    recordset = [result];
    summary = `CCL matter ${input}: ${result.versionCount ?? 0} version(s)`;
  } else if (isInstructionRef) {
    mode = 'instruction';
    if (existingTables.includes('CclContent')) {
      const r = await pool.request()
        .input('Ref', sql.NVarChar(100), input)
        .query(`SELECT CclContentId, MatterId, InstructionRef, DocumentType, ClientName,
                FeeEarner, PracticeArea, Version, Status, UploadedToClio, UploadedToNd,
                CreatedBy, CreatedAt
          FROM CclContent WHERE InstructionRef = @Ref ORDER BY CreatedAt DESC`);
      recordset = r.recordset;
    } else {
      recordset = [];
    }
    summary = `CCL instruction ${input}: ${recordset.length} row(s)`;
  } else if (isStatus) {
    mode = 'status';
    if (existingTables.includes('CclContent')) {
      const r = await pool.request()
        .input('Status', sql.NVarChar(20), input.toLowerCase())
        .query(`SELECT TOP 50 CclContentId, MatterId, InstructionRef, ClientName,
                FeeEarner, PracticeArea, Version, Status, UploadedToClio,
                CreatedBy, CreatedAt
          FROM CclContent WHERE Status = @Status ORDER BY CreatedAt DESC`);
      recordset = r.recordset;
    } else {
      recordset = [];
    }
    summary = `CCL status=${input.toLowerCase()}: ${recordset.length} row(s)`;
  } else {
    mode = 'search';
    if (existingTables.includes('CclContent')) {
      const r = await pool.request()
        .input('Like', sql.NVarChar(200), `%${input}%`)
        .query(`SELECT TOP 50 CclContentId, MatterId, InstructionRef, ClientName,
                FeeEarner, PracticeArea, Version, Status, UploadedToClio,
                CreatedBy, CreatedAt
          FROM CclContent
          WHERE ClientName LIKE @Like OR FeeEarner LIKE @Like
            OR InstructionRef LIKE @Like OR MatterDescription LIKE @Like
          ORDER BY CreatedAt DESC`);
      recordset = r.recordset;
    } else {
      recordset = [];
    }
    summary = `CCL search "${input}": ${recordset.length} row(s)`;
  }

  return {
    summary,
    artefact: {
      kind: 'json',
      body: { type: 'ccl', mode, input, scope: 'Instructions', recordset },
      downloadName: `ccl-lookup-${safeFragment(input || mode)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'ccl-lookup',
  title: 'CCL lookup',
  description: 'Inspect CclContent + CclAiTrace. Auto-detects mode: empty/stats → overview, numeric → matter id, HLX- → instruction ref, draft/final/uploaded/sent → status, else → text search.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'query',
      label: 'Query (matter id / HLX ref / status / search text / blank for stats)',
      type: 'text',
      required: false,
      placeholder: 'leave blank for stats',
      helpText: 'Auto-detects mode. Status accepts: draft, final, uploaded, sent.',
      maxLength: 200,
      redactValue: false,
    },
  ],
  run: runCclLookup,
});

module.exports = { runCclLookup };
