const { withRequest } = require('./db');
const { trackException } = require('./appInsights');

const CACHE_MS = 60 * 1000;
const schemaCache = new Map();

function emptySchema() {
  return {
    hasFormSubmissions: false,
    hasClientSubmissionId: false,
    hasKindColumn: false,
    hasFormSubmissionIntents: false,
    hasIntentRecordColumns: false,
    hasIntentMatchColumns: false,
    hasIntentOrphanColumns: false,
  };
}

function asBool(value) {
  return value === true || value === 1 || value === '1';
}

function errorMessage(err) {
  return String(err?.message || err || '');
}

function clearFormSubmissionSchemaCache(connStr) {
  if (connStr) schemaCache.delete(connStr);
}

function isMissingFormSubmissionOptionalColumnError(err) {
  const message = errorMessage(err);
  return /Invalid column name '(client_submission_id|kind)'/i.test(message);
}

function isMissingFormIntentSchemaError(err) {
  const message = errorMessage(err);
  return /Invalid object name 'dbo\.form_submission_intents'/i.test(message) ||
    /Invalid column name '(client_submission_id|form_key|submitted_by|created_at|payload_fingerprint|user_agent|route|orphan_notified_at|matched_submission_id|matched_at)'/i.test(message);
}

async function getFormSubmissionSchema(connStr) {
  if (!connStr) return emptySchema();

  const now = Date.now();
  const cached = schemaCache.get(connStr);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const result = await withRequest(connStr, async (request) => request.query(`
      SELECT
        CAST(CASE WHEN OBJECT_ID(N'dbo.form_submissions', N'U') IS NOT NULL THEN 1 ELSE 0 END AS bit) AS has_form_submissions,
        CAST(CASE WHEN COL_LENGTH(N'dbo.form_submissions', N'client_submission_id') IS NOT NULL THEN 1 ELSE 0 END AS bit) AS has_client_submission_id,
        CAST(CASE WHEN COL_LENGTH(N'dbo.form_submissions', N'kind') IS NOT NULL THEN 1 ELSE 0 END AS bit) AS has_kind_column,
        CAST(CASE WHEN OBJECT_ID(N'dbo.form_submission_intents', N'U') IS NOT NULL THEN 1 ELSE 0 END AS bit) AS has_form_submission_intents,
        CAST(CASE WHEN
          COL_LENGTH(N'dbo.form_submission_intents', N'client_submission_id') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'form_key') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'submitted_by') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'payload_fingerprint') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'user_agent') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'route') IS NOT NULL
        THEN 1 ELSE 0 END AS bit) AS has_intent_record_columns,
        CAST(CASE WHEN
          COL_LENGTH(N'dbo.form_submission_intents', N'client_submission_id') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'matched_submission_id') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'matched_at') IS NOT NULL
        THEN 1 ELSE 0 END AS bit) AS has_intent_match_columns,
        CAST(CASE WHEN
          COL_LENGTH(N'dbo.form_submission_intents', N'client_submission_id') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'form_key') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'submitted_by') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'created_at') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'payload_fingerprint') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'user_agent') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'route') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'orphan_notified_at') IS NOT NULL AND
          COL_LENGTH(N'dbo.form_submission_intents', N'matched_submission_id') IS NOT NULL
        THEN 1 ELSE 0 END AS bit) AS has_intent_orphan_columns;
    `));

    const row = result?.recordset?.[0] || {};
    const value = {
      hasFormSubmissions: asBool(row.has_form_submissions),
      hasClientSubmissionId: asBool(row.has_client_submission_id),
      hasKindColumn: asBool(row.has_kind_column),
      hasFormSubmissionIntents: asBool(row.has_form_submission_intents),
      hasIntentRecordColumns: asBool(row.has_intent_record_columns),
      hasIntentMatchColumns: asBool(row.has_intent_match_columns),
      hasIntentOrphanColumns: asBool(row.has_intent_orphan_columns),
    };
    schemaCache.set(connStr, { value, expiresAt: now + CACHE_MS });
    return value;
  } catch (err) {
    trackException(err, { phase: 'formSubmissionSchema.load' });
    return emptySchema();
  }
}

module.exports = {
  getFormSubmissionSchema,
  clearFormSubmissionSchemaCache,
  isMissingFormSubmissionOptionalColumnError,
  isMissingFormIntentSchemaError,
};