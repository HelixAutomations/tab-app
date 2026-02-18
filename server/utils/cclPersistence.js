/**
 * CCL Persistence Layer — read/write CclContent, CclAiTrace, CclAssessment.
 *
 * All functions are non-blocking / non-fatal:
 * callers wrap in try/catch so a DB outage never breaks the user flow.
 *
 * Connection strategy: same as instant-lookup.mjs —
 *   1. Try process.env.INSTRUCTIONS_SQL_CONNECTION_STRING (set by server/index.js at startup)
 *   2. Fall back to Key Vault resolution if the env var is missing/redacted
 */
const { sql, getPool } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');
const { getSecret } = require('../utils/getSecret');

const TABLE_CHECK_CACHE = {};
let _resolvedConnStr = null;
let _resolving = null;

const isRedacted = (v) => typeof v === 'string' && v.includes('<REDACTED>');

async function tableExists(pool, tableName) {
    if (TABLE_CHECK_CACHE[tableName] !== undefined) return TABLE_CHECK_CACHE[tableName];
    const result = await pool.request().query(
        `SELECT CASE WHEN OBJECT_ID(N'${tableName}', N'U') IS NOT NULL THEN 1 ELSE 0 END AS F`
    );
    TABLE_CHECK_CACHE[tableName] = Boolean(result?.recordset?.[0]?.F);
    if (!TABLE_CHECK_CACHE[tableName]) {
        console.warn(`[ccl-persist] ${tableName} table not found — run migration first`);
    }
    return TABLE_CHECK_CACHE[tableName];
}

/**
 * Resolve the Instructions DB connection string.
 * Uses env var if available (set by server/index.js Key Vault hydration),
 * otherwise resolves directly via Key Vault — same pattern as instant-lookup.mjs.
 */
async function getConnStr() {
    // Fast path: already resolved this process
    if (_resolvedConnStr) return _resolvedConnStr;

    // Check env var (server/index.js resolves this at startup in production)
    const envConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (envConn && !isRedacted(envConn)) {
        _resolvedConnStr = envConn;
        return _resolvedConnStr;
    }

    // Key Vault fallback (same as instant-lookup.mjs)
    if (_resolving) return _resolving;
    _resolving = (async () => {
        try {
            const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
            const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
            const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
            const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';
            const password = await getSecret(secretName);
            const connStr = `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
            _resolvedConnStr = connStr;
            // Write back so other modules benefit
            process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = connStr;
            console.log('[ccl-persist] Connection string resolved via Key Vault');
            return connStr;
        } catch (err) {
            console.warn('[ccl-persist] Key Vault fallback failed:', err.message);
            return null;
        } finally {
            _resolving = null;
        }
    })();
    return _resolving;
}

// ─── CclContent ────────────────────────────────────────────────────────────

/**
 * Save a CCL content snapshot. Auto-increments version per matterId.
 * Returns the new CclContentId.
 */
async function saveCclContent({
    matterId,
    instructionRef,
    documentType = 'ccl',
    clientName,
    clientEmail,
    clientAddress,
    matterDescription,
    feeEarner,
    feeEarnerEmail,
    supervisingPartner,
    practiceArea,
    fieldsJson,
    provenanceJson,
    templateVersion,
    aiTraceId,
    status = 'draft',
    createdBy,
}) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return null;

    // Get current max version for this matter
    const versionResult = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .query('SELECT ISNULL(MAX(Version), 0) AS MaxVersion FROM CclContent WHERE MatterId = @MatterId');
    const nextVersion = (versionResult.recordset[0]?.MaxVersion || 0) + 1;

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .input('InstructionRef', sql.NVarChar(100), instructionRef || null)
        .input('DocumentType', sql.NVarChar(50), documentType)
        .input('ClientName', sql.NVarChar(200), clientName || null)
        .input('ClientEmail', sql.NVarChar(200), clientEmail || null)
        .input('ClientAddress', sql.NVarChar(500), clientAddress || null)
        .input('MatterDescription', sql.NVarChar(500), matterDescription || null)
        .input('FeeEarner', sql.NVarChar(100), feeEarner || null)
        .input('FeeEarnerEmail', sql.NVarChar(200), feeEarnerEmail || null)
        .input('SupervisingPartner', sql.NVarChar(100), supervisingPartner || null)
        .input('PracticeArea', sql.NVarChar(100), practiceArea || null)
        .input('FieldsJson', sql.NVarChar(sql.MAX), typeof fieldsJson === 'string' ? fieldsJson : JSON.stringify(fieldsJson))
        .input('ProvenanceJson', sql.NVarChar(sql.MAX), provenanceJson ? (typeof provenanceJson === 'string' ? provenanceJson : JSON.stringify(provenanceJson)) : null)
        .input('TemplateVersion', sql.NVarChar(50), templateVersion || null)
        .input('AiTraceId', sql.Int, aiTraceId || null)
        .input('Version', sql.Int, nextVersion)
        .input('Status', sql.NVarChar(20), status)
        .input('CreatedBy', sql.NVarChar(50), createdBy || null)
        .query(`INSERT INTO CclContent
            (MatterId, InstructionRef, DocumentType, ClientName, ClientEmail, ClientAddress,
             MatterDescription, FeeEarner, FeeEarnerEmail, SupervisingPartner, PracticeArea,
             FieldsJson, ProvenanceJson, TemplateVersion, AiTraceId, Version, Status, CreatedBy)
            OUTPUT INSERTED.CclContentId
            VALUES
            (@MatterId, @InstructionRef, @DocumentType, @ClientName, @ClientEmail, @ClientAddress,
             @MatterDescription, @FeeEarner, @FeeEarnerEmail, @SupervisingPartner, @PracticeArea,
             @FieldsJson, @ProvenanceJson, @TemplateVersion, @AiTraceId, @Version, @Status, @CreatedBy)`);

    const newId = result.recordset[0]?.CclContentId;
    trackEvent('CCL.Content.Saved', {
        matterId, version: String(nextVersion), status, documentType,
        cclContentId: String(newId || ''),
    });
    return newId;
}

/**
 * Get latest content version for a matter.
 */
async function getLatestCclContent(matterId) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return null;

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .query(`SELECT TOP 1 * FROM CclContent
                WHERE MatterId = @MatterId
                ORDER BY Version DESC`);

    return result.recordset[0] || null;
}

/**
 * Get full version history for a matter.
 */
async function getCclContentHistory(matterId) {
    const connStr = await getConnStr();
    if (!connStr) return [];

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return [];

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .query(`SELECT CclContentId, MatterId, InstructionRef,
                       ClientName, ClientEmail, ClientAddress,
                       MatterDescription, FeeEarner, FeeEarnerEmail,
                       SupervisingPartner, PracticeArea,
                       FieldsJson, ProvenanceJson, TemplateVersion,
                       AiTraceId, Version, Status,
                       UploadedToClio, UploadedToNd, ClioDocId, NdDocId,
                       CreatedBy, CreatedAt, FinalizedAt, FinalizedBy
                FROM CclContent
                WHERE MatterId = @MatterId
                ORDER BY Version DESC`);

    return result.recordset;
}

/**
 * Get a specific CCL content snapshot by ID.
 */
async function getCclContentById(cclContentId) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return null;

    const result = await pool.request()
        .input('Id', sql.Int, cclContentId)
        .query(`SELECT TOP 1 *
                FROM CclContent
                WHERE CclContentId = @Id`);

    return result.recordset[0] || null;
}

/**
 * Mark a content version as uploaded (Clio or ND).
 */
async function markCclUploaded(cclContentId, { clio, nd, clioDocId, ndDocId, finalizedBy }) {
    const connStr = await getConnStr();
    if (!connStr) return;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return;

    const updates = [];
    const req = pool.request().input('Id', sql.Int, cclContentId);

    if (clio) {
        updates.push('UploadedToClio = 1');
        if (clioDocId) {
            updates.push('ClioDocId = @ClioDocId');
            req.input('ClioDocId', sql.NVarChar(100), clioDocId);
        }
    }
    if (nd) {
        updates.push('UploadedToNd = 1');
        if (ndDocId) {
            updates.push('NdDocId = @NdDocId');
            req.input('NdDocId', sql.NVarChar(100), ndDocId);
        }
    }
    if (finalizedBy) {
        updates.push('Status = \'uploaded\'');
        updates.push('FinalizedAt = SYSDATETIME()');
        updates.push('FinalizedBy = @FinalizedBy');
        req.input('FinalizedBy', sql.NVarChar(50), finalizedBy);
    }

    if (updates.length === 0) return;

    await req.query(`UPDATE CclContent SET ${updates.join(', ')} WHERE CclContentId = @Id`);
}

// ─── CclAiTrace ────────────────────────────────────────────────────────────

/**
 * Save a full AI trace record. Call after every /fill invocation.
 */
async function saveCclAiTrace({
    matterId,
    trackingId,
    aiStatus,
    model,
    durationMs,
    temperature,
    systemPrompt,
    userPrompt,
    userPromptLength,
    aiOutputJson,
    generatedFieldCount,
    confidence,
    dataSourcesJson,
    contextFieldsJson,
    contextSnippetsJson,
    fallbackReason,
    errorMessage,
    promptTokens,
    completionTokens,
    totalTokens,
    retryCount,
    createdBy,
}) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAiTrace'))) return null;

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .input('TrackingId', sql.NVarChar(20), trackingId)
        .input('AiStatus', sql.NVarChar(20), aiStatus)
        .input('Model', sql.NVarChar(50), model || null)
        .input('DurationMs', sql.Int, durationMs || null)
        .input('Temperature', sql.Float, temperature || null)
        .input('PromptTokens', sql.Int, promptTokens || null)
        .input('CompletionTokens', sql.Int, completionTokens || null)
        .input('TotalTokens', sql.Int, totalTokens || null)
        .input('SystemPrompt', sql.NVarChar(sql.MAX), systemPrompt || null)
        .input('UserPrompt', sql.NVarChar(sql.MAX), userPrompt || null)
        .input('UserPromptLength', sql.Int, userPromptLength || null)
        .input('AiOutputJson', sql.NVarChar(sql.MAX), aiOutputJson ? (typeof aiOutputJson === 'string' ? aiOutputJson : JSON.stringify(aiOutputJson)) : null)
        .input('GeneratedFieldCount', sql.Int, generatedFieldCount || null)
        .input('Confidence', sql.NVarChar(20), confidence || null)
        .input('DataSourcesJson', sql.NVarChar(sql.MAX), dataSourcesJson ? (typeof dataSourcesJson === 'string' ? dataSourcesJson : JSON.stringify(dataSourcesJson)) : null)
        .input('ContextFieldsJson', sql.NVarChar(sql.MAX), contextFieldsJson ? (typeof contextFieldsJson === 'string' ? contextFieldsJson : JSON.stringify(contextFieldsJson)) : null)
        .input('ContextSnippetsJson', sql.NVarChar(sql.MAX), contextSnippetsJson ? (typeof contextSnippetsJson === 'string' ? contextSnippetsJson : JSON.stringify(contextSnippetsJson)) : null)
        .input('FallbackReason', sql.NVarChar(500), fallbackReason || null)
        .input('ErrorMessage', sql.NVarChar(500), errorMessage || null)
        .input('RetryCount', sql.Int, retryCount || 0)
        .input('CreatedBy', sql.NVarChar(50), createdBy || null)
        .query(`INSERT INTO CclAiTrace
            (MatterId, TrackingId, AiStatus, Model, DurationMs, Temperature,
             PromptTokens, CompletionTokens, TotalTokens,
             SystemPrompt, UserPrompt, UserPromptLength,
             AiOutputJson, GeneratedFieldCount, Confidence,
             DataSourcesJson, ContextFieldsJson, ContextSnippetsJson,
             FallbackReason, ErrorMessage, RetryCount, CreatedBy)
            OUTPUT INSERTED.CclAiTraceId
            VALUES
            (@MatterId, @TrackingId, @AiStatus, @Model, @DurationMs, @Temperature,
             @PromptTokens, @CompletionTokens, @TotalTokens,
             @SystemPrompt, @UserPrompt, @UserPromptLength,
             @AiOutputJson, @GeneratedFieldCount, @Confidence,
             @DataSourcesJson, @ContextFieldsJson, @ContextSnippetsJson,
             @FallbackReason, @ErrorMessage, @RetryCount, @CreatedBy)`);

    return result.recordset[0]?.CclAiTraceId || null;
}

/**
 * Get AI traces for a matter (newest first).
 */
async function getCclAiTraces(matterId, limit = 20) {
    const connStr = await getConnStr();
    if (!connStr) return [];

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAiTrace'))) return [];

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .input('Limit', sql.Int, limit)
        .query(`SELECT TOP (@Limit) * FROM CclAiTrace
                WHERE MatterId = @MatterId
                ORDER BY CreatedAt DESC`);

    return result.recordset;
}

/**
 * Get a single trace by trackingId.
 */
async function getCclAiTraceByTrackingId(trackingId) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAiTrace'))) return null;

    const result = await pool.request()
        .input('TrackingId', sql.NVarChar(20), trackingId)
        .query('SELECT TOP 1 * FROM CclAiTrace WHERE TrackingId = @TrackingId');

    return result.recordset[0] || null;
}



// ─── Admin / Cross-matter queries ──────────────────────────────────────────

/**
 * List all CCLs across all matters (admin view). Newest first.
 */
async function listAllCcls({ limit = 50, status, offset = 0 } = {}) {
    const connStr = await getConnStr();
    if (!connStr) return [];

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return [];

    const req = pool.request()
        .input('Limit', sql.Int, limit)
        .input('Offset', sql.Int, offset);

    let where = '1=1';
    if (status) {
        where = 'Status = @Status';
        req.input('Status', sql.NVarChar(20), status);
    }

    const result = await req.query(`
        SELECT CclContentId, MatterId, InstructionRef, ClientName,
               PracticeArea, FeeEarner, Version, Status,
               UploadedToClio, UploadedToNd,
               CreatedBy, CreatedAt, FinalizedAt
        FROM CclContent
        WHERE ${where}
        ORDER BY CreatedAt DESC
        OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);

    return result.recordset;
}

/**
 * Get aggregate stats for the admin dashboard.
 */
async function getCclStats() {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return null;

    const result = await pool.request().query(`
        SELECT
            COUNT(DISTINCT MatterId) AS TotalMatters,
            COUNT(*) AS TotalVersions,
            SUM(CASE WHEN Status = 'draft' THEN 1 ELSE 0 END) AS Drafts,
            SUM(CASE WHEN Status = 'final' THEN 1 ELSE 0 END) AS Finals,
            SUM(CASE WHEN Status = 'uploaded' THEN 1 ELSE 0 END) AS Uploaded,
            SUM(CASE WHEN UploadedToClio = 1 THEN 1 ELSE 0 END) AS ClioUploads,
            SUM(CASE WHEN UploadedToNd = 1 THEN 1 ELSE 0 END) AS NdUploads
        FROM CclContent
    `);

    const traceResult = await pool.request().query(`
        SELECT
            COUNT(*) AS TotalAiCalls,
            SUM(CASE WHEN AiStatus = 'complete' THEN 1 ELSE 0 END) AS FullAi,
            SUM(CASE WHEN AiStatus = 'partial' THEN 1 ELSE 0 END) AS PartialAi,
            SUM(CASE WHEN AiStatus = 'fallback' THEN 1 ELSE 0 END) AS FallbackAi,
            AVG(DurationMs) AS AvgDurationMs
        FROM CclAiTrace
    `);

    return {
        content: result.recordset[0],
        ai: traceResult.recordset[0],
    };
}

/**
 * CCLs grouped by practice area — counts + upload rates.
 */
async function getCclByPracticeArea() {
    const connStr = await getConnStr();
    if (!connStr) return [];
    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return [];

    const result = await pool.request().query(`
        SELECT
            ISNULL(PracticeArea, 'Unknown') AS PracticeArea,
            COUNT(DISTINCT MatterId) AS MatterCount,
            COUNT(*) AS VersionCount,
            SUM(CASE WHEN UploadedToClio = 1 THEN 1 ELSE 0 END) AS ClioUploads,
            SUM(CASE WHEN UploadedToNd = 1 THEN 1 ELSE 0 END) AS NdUploads,
            MAX(CreatedAt) AS LatestActivity
        FROM CclContent
        GROUP BY PracticeArea
        ORDER BY MatterCount DESC
    `);
    return result.recordset;
}

/**
 * CCLs grouped by fee earner — counts + upload rates.
 */
async function getCclByFeeEarner() {
    const connStr = await getConnStr();
    if (!connStr) return [];
    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return [];

    const result = await pool.request().query(`
        SELECT
            ISNULL(FeeEarner, 'Unknown') AS FeeEarner,
            COUNT(DISTINCT MatterId) AS MatterCount,
            COUNT(*) AS VersionCount,
            SUM(CASE WHEN UploadedToClio = 1 THEN 1 ELSE 0 END) AS ClioUploads,
            MAX(CreatedAt) AS LatestActivity
        FROM CclContent
        GROUP BY FeeEarner
        ORDER BY MatterCount DESC
    `);
    return result.recordset;
}

/**
 * CCL activity over time — daily counts for the last N days.
 */
async function getCclTimeline(days = 30) {
    const connStr = await getConnStr();
    if (!connStr) return [];
    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclContent'))) return [];

    const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
        SELECT
            CAST(CreatedAt AS DATE) AS Day,
            COUNT(*) AS Versions,
            COUNT(DISTINCT MatterId) AS Matters,
            SUM(CASE WHEN UploadedToClio = 1 THEN 1 ELSE 0 END) AS ClioUploads
        FROM CclContent
        WHERE CreatedAt >= DATEADD(DAY, -@Days, SYSDATETIME())
        GROUP BY CAST(CreatedAt AS DATE)
        ORDER BY Day DESC
    `);
    return result.recordset;
}

/**
 * AI performance over time — daily aggregates.
 */
async function getCclAiTimeline(days = 30) {
    const connStr = await getConnStr();
    if (!connStr) return [];
    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAiTrace'))) return [];

    const result = await pool.request()
        .input('Days', sql.Int, days)
        .query(`
        SELECT
            CAST(CreatedAt AS DATE) AS Day,
            COUNT(*) AS TotalCalls,
            SUM(CASE WHEN AiStatus = 'complete' THEN 1 ELSE 0 END) AS FullAi,
            SUM(CASE WHEN AiStatus = 'partial' THEN 1 ELSE 0 END) AS PartialAi,
            SUM(CASE WHEN AiStatus = 'fallback' THEN 1 ELSE 0 END) AS FallbackAi,
            AVG(DurationMs) AS AvgDurationMs,
            AVG(GeneratedFieldCount) AS AvgFieldCount
        FROM CclAiTrace
        WHERE CreatedAt >= DATEADD(DAY, -@Days, SYSDATETIME())
        GROUP BY CAST(CreatedAt AS DATE)
        ORDER BY Day DESC
    `);
    return result.recordset;
}

/**
 * Recent operations log — latest content saves + AI calls interleaved.
 * Returns a unified timeline of events, newest first.
 */
async function getCclOpsLog(limit = 50) {
    const connStr = await getConnStr();
    if (!connStr) return [];
    const pool = await getPool(connStr);

    const contentExists = await tableExists(pool, 'CclContent');
    const traceExists = await tableExists(pool, 'CclAiTrace');
    if (!contentExists && !traceExists) return [];

    const parts = [];
    if (contentExists) {
        parts.push(`
            SELECT TOP (${limit})
                'content' AS EventType,
                MatterId, InstructionRef, ClientName, FeeEarner, PracticeArea,
                'v' + CAST(Version AS NVARCHAR(5)) AS Detail,
                Status AS EventStatus,
                CreatedBy, CreatedAt
            FROM CclContent
            ORDER BY CreatedAt DESC
        `);
    }
    if (traceExists) {
        parts.push(`
            SELECT TOP (${limit})
                'ai-trace' AS EventType,
                MatterId, NULL AS InstructionRef, NULL AS ClientName, NULL AS FeeEarner, NULL AS PracticeArea,
                TrackingId AS Detail,
                AiStatus AS EventStatus,
                CreatedBy, CreatedAt
            FROM CclAiTrace
            ORDER BY CreatedAt DESC
        `);
    }

    const unionQuery = `
        SELECT TOP (${limit}) * FROM (
            ${parts.join(' UNION ALL ')}
        ) AS Combined
        ORDER BY CreatedAt DESC
    `;

    const result = await pool.request().query(unionQuery);
    return result.recordset;
}

// ─── CclAssessment — structured quality reviews ────────────────────────────

/**
 * Save a structured quality assessment of a CCL output.
 * Returns the new CclAssessmentId.
 */
async function saveCclAssessment({
    matterId,
    cclContentId,
    cclAiTraceId,
    instructionRef,
    practiceArea,
    feeEarner,
    documentType = 'ccl',
    overallScore,
    fieldAssessmentsJson,
    issueCategories,
    manualEditsJson,
    fieldsCorrect,
    fieldsEdited,
    fieldsReplaced,
    fieldsEmpty,
    notes,
    promptSuggestion,
    assessedBy,
}) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAssessment'))) return null;

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .input('CclContentId', sql.Int, cclContentId || null)
        .input('CclAiTraceId', sql.Int, cclAiTraceId || null)
        .input('InstructionRef', sql.NVarChar(100), instructionRef || null)
        .input('PracticeArea', sql.NVarChar(100), practiceArea || null)
        .input('FeeEarner', sql.NVarChar(100), feeEarner || null)
        .input('DocumentType', sql.NVarChar(50), documentType)
        .input('OverallScore', sql.Int, overallScore)
        .input('FieldAssessmentsJson', sql.NVarChar(sql.MAX), fieldAssessmentsJson ? (typeof fieldAssessmentsJson === 'string' ? fieldAssessmentsJson : JSON.stringify(fieldAssessmentsJson)) : null)
        .input('IssueCategories', sql.NVarChar(500), issueCategories ? (typeof issueCategories === 'string' ? issueCategories : JSON.stringify(issueCategories)) : null)
        .input('ManualEditsJson', sql.NVarChar(sql.MAX), manualEditsJson ? (typeof manualEditsJson === 'string' ? manualEditsJson : JSON.stringify(manualEditsJson)) : null)
        .input('FieldsCorrect', sql.Int, fieldsCorrect ?? null)
        .input('FieldsEdited', sql.Int, fieldsEdited ?? null)
        .input('FieldsReplaced', sql.Int, fieldsReplaced ?? null)
        .input('FieldsEmpty', sql.Int, fieldsEmpty ?? null)
        .input('Notes', sql.NVarChar(2000), notes || null)
        .input('PromptSuggestion', sql.NVarChar(1000), promptSuggestion || null)
        .input('AssessedBy', sql.NVarChar(50), assessedBy)
        .query(`INSERT INTO CclAssessment
            (MatterId, CclContentId, CclAiTraceId, InstructionRef,
             PracticeArea, FeeEarner, DocumentType, OverallScore,
             FieldAssessmentsJson, IssueCategories, ManualEditsJson,
             FieldsCorrect, FieldsEdited, FieldsReplaced, FieldsEmpty,
             Notes, PromptSuggestion, AssessedBy)
            OUTPUT INSERTED.CclAssessmentId
            VALUES
            (@MatterId, @CclContentId, @CclAiTraceId, @InstructionRef,
             @PracticeArea, @FeeEarner, @DocumentType, @OverallScore,
             @FieldAssessmentsJson, @IssueCategories, @ManualEditsJson,
             @FieldsCorrect, @FieldsEdited, @FieldsReplaced, @FieldsEmpty,
             @Notes, @PromptSuggestion, @AssessedBy)`);

    const newId = result.recordset[0]?.CclAssessmentId;
    trackEvent('CCL.Assessment.Created', {
        matterId, assessedBy, overallScore: String(overallScore),
        practiceArea: practiceArea || 'unknown',
        hasPromptSuggestion: promptSuggestion ? 'true' : 'false',
        cclAssessmentId: String(newId || ''),
    });
    return newId;
}

/**
 * Get assessments for a specific matter.
 */
async function getCclAssessments(matterId) {
    const connStr = await getConnStr();
    if (!connStr) return [];

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAssessment'))) return [];

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .query(`SELECT * FROM CclAssessment
                WHERE MatterId = @MatterId
                ORDER BY CreatedAt DESC`);

    return result.recordset;
}

/**
 * Get assessment corpus — aggregated quality data for prompt engineering.
 * Filterable by practice area, score threshold, unapplied only.
 * Returns assessments with their field-level detail for analysis.
 */
async function getAssessmentCorpus({ practiceArea, maxScore, unappliedOnly, feeEarner, limit = 100 } = {}) {
    const connStr = await getConnStr();
    if (!connStr) return [];

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAssessment'))) return [];

    const conditions = ['1=1'];
    const req = pool.request().input('Limit', sql.Int, limit);

    if (practiceArea) {
        conditions.push('PracticeArea = @PracticeArea');
        req.input('PracticeArea', sql.NVarChar(100), practiceArea);
    }
    if (maxScore) {
        conditions.push('OverallScore <= @MaxScore');
        req.input('MaxScore', sql.Int, maxScore);
    }
    if (unappliedOnly) {
        conditions.push('AppliedToPrompt = 0');
    }
    if (feeEarner) {
        conditions.push('FeeEarner = @FeeEarner');
        req.input('FeeEarner', sql.NVarChar(100), feeEarner);
    }

    const result = await req.query(`
        SELECT a.*, c.FieldsJson, c.ProvenanceJson,
               t.UserPrompt, t.AiOutputJson, t.DataSourcesJson
        FROM CclAssessment a
        LEFT JOIN CclContent c ON a.CclContentId = c.CclContentId
        LEFT JOIN CclAiTrace t ON a.CclAiTraceId = t.CclAiTraceId
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.CreatedAt DESC
        OFFSET 0 ROWS FETCH NEXT @Limit ROWS ONLY
    `);

    return result.recordset;
}

/**
 * Get assessment accuracy summary — field-level accuracy aggregated across all assessments.
 * For prompt tuning: "which fields consistently need correction?"
 */
async function getAssessmentAccuracySummary({ practiceArea } = {}) {
    const connStr = await getConnStr();
    if (!connStr) return null;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAssessment'))) return null;

    const conditions = ['1=1'];
    const req = pool.request();

    if (practiceArea) {
        conditions.push('PracticeArea = @PracticeArea');
        req.input('PracticeArea', sql.NVarChar(100), practiceArea);
    }

    const result = await req.query(`
        SELECT
            COUNT(*) AS TotalAssessments,
            AVG(CAST(OverallScore AS FLOAT)) AS AvgScore,
            SUM(ISNULL(FieldsCorrect, 0)) AS TotalCorrect,
            SUM(ISNULL(FieldsEdited, 0)) AS TotalEdited,
            SUM(ISNULL(FieldsReplaced, 0)) AS TotalReplaced,
            SUM(ISNULL(FieldsEmpty, 0)) AS TotalEmpty,
            SUM(CASE WHEN PromptSuggestion IS NOT NULL THEN 1 ELSE 0 END) AS WithSuggestions,
            SUM(CASE WHEN AppliedToPrompt = 1 THEN 1 ELSE 0 END) AS Applied,
            SUM(CASE WHEN AppliedToPrompt = 0 AND PromptSuggestion IS NOT NULL THEN 1 ELSE 0 END) AS PendingSuggestions
        FROM CclAssessment
        WHERE ${conditions.join(' AND ')}
    `);

    // Issue categories breakdown
    const issueResult = await pool.request().query(`
        SELECT IssueCategories FROM CclAssessment
        WHERE IssueCategories IS NOT NULL
        ${practiceArea ? "AND PracticeArea = '" + practiceArea.replace(/'/g, "''") + "'" : ''}
    `);

    // Count issue frequency
    const issueCounts = {};
    for (const row of issueResult.recordset) {
        try {
            const cats = JSON.parse(row.IssueCategories);
            if (Array.isArray(cats)) {
                for (const cat of cats) {
                    issueCounts[cat] = (issueCounts[cat] || 0) + 1;
                }
            }
        } catch { /* ignore parse errors */ }
    }

    return {
        summary: result.recordset[0],
        issueFrequency: issueCounts,
    };
}

/**
 * Mark an assessment's suggestion as applied to a prompt.
 */
async function markAssessmentApplied(assessmentId, appliedBy) {
    const connStr = await getConnStr();
    if (!connStr) return;

    const pool = await getPool(connStr);
    if (!(await tableExists(pool, 'CclAssessment'))) return;

    await pool.request()
        .input('Id', sql.Int, assessmentId)
        .input('AppliedBy', sql.NVarChar(50), appliedBy)
        .query(`UPDATE CclAssessment
                SET AppliedToPrompt = 1, AppliedAt = SYSDATETIME(), AppliedBy = @AppliedBy, UpdatedAt = SYSDATETIME()
                WHERE CclAssessmentId = @Id`);

    trackEvent('CCL.Assessment.Applied', { assessmentId: String(assessmentId), appliedBy });
}

module.exports = {
    saveCclContent,
    getLatestCclContent,
    getCclContentHistory,
    getCclContentById,
    markCclUploaded,
    saveCclAiTrace,
    getCclAiTraces,
    getCclAiTraceByTrackingId,

    listAllCcls,
    getCclStats,
    getCclByPracticeArea,
    getCclByFeeEarner,
    getCclTimeline,
    getCclAiTimeline,
    getCclOpsLog,
    saveCclAssessment,
    getCclAssessments,
    getAssessmentCorpus,
    getAssessmentAccuracySummary,
    markAssessmentApplied,
};
