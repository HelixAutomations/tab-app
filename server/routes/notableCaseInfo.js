/**
 * Notable Case Info submission route.
 *
 * Owns persistence directly on the server so the form no longer depends on
 * legacy Azure Function path/code credentials in root .env.
 */

const express = require('express');
const { sql, withRequest } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { sendHelixEmail } = require('../utils/helixEmail');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const PROJECT_SQL_DATABASE = process.env.PROJECT_DATA_SQL_DATABASE || 'helix-project-data';
const PROJECT_SQL_SERVER = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
const PROJECT_SQL_USER = process.env.SQL_USER_NAME || 'helix-database-server';
const PROJECT_SQL_SECRET_NAME = process.env.SQL_PASSWORD_SECRET_NAME || process.env.SQL_SERVER_PASSWORD_KEY || 'sql-databaseserver-password';

function normalizeBoolean(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  return String(value).toLowerCase() === 'true';
}

function parseExactValue(value) {
  const raw = value ? String(value).replace(/[,\s\u00a3]/g, '') : '';
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildProjectDataConnectionString() {
  if (process.env.PROJECT_DATA_SQL_CONNECTION_STRING) {
    return process.env.PROJECT_DATA_SQL_CONNECTION_STRING;
  }

  const password = await getSecret(PROJECT_SQL_SECRET_NAME);
  if (!password) {
    throw new Error(`SQL password secret ${PROJECT_SQL_SECRET_NAME} was empty`);
  }

  return `Server=tcp:${PROJECT_SQL_SERVER},1433;Initial Catalog=${PROJECT_SQL_DATABASE};Persist Security Info=False;User ID=${PROJECT_SQL_USER};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

async function lookupRelatedMatters(connectionString, displayNumber) {
  if (!displayNumber) return [];
  const result = await withRequest(connectionString, (request, sqlTypes) =>
    request
      .input('DisplayNumber', sqlTypes.NVarChar(100), displayNumber)
      .query(`
        SELECT display_number,
               initials AS client_name,
               summary AS matter_description,
               initials AS fee_earner
        FROM dbo.notable_case_info
        WHERE display_number = @DisplayNumber
        ORDER BY created_at DESC;
      `)
  );

  return result.recordset || [];
}

async function fetchNotableCaseHistory(connectionString, displayNumber) {
  if (!displayNumber) return [];
  const result = await withRequest(connectionString, (request, sqlTypes) =>
    request
      .input('DisplayNumber', sqlTypes.NVarChar(100), displayNumber)
      .query(`
        SELECT id,
               initials,
               display_number,
               summary,
               value_in_dispute,
               c_reference_status,
               counsel_instructed,
               counsel_name,
               created_at
        FROM dbo.notable_case_info
        WHERE display_number = @DisplayNumber
        ORDER BY created_at DESC;
      `)
  );

  return result.recordset || [];
}

async function insertNotableCaseInfo(connectionString, body) {
  const cReferenceStatus = normalizeBoolean(body.c_reference_status);
  const counselInstructed = normalizeBoolean(body.counsel_instructed);
  const exactValue = parseExactValue(body.value_in_dispute_exact);

  const result = await withRequest(connectionString, (request, sqlTypes) =>
    request
      .input('Initials', sqlTypes.NVarChar(20), body.initials)
      .input('ContextType', sqlTypes.Char(1), body.context_type)
      .input('DisplayNumber', sqlTypes.NVarChar(100), body.display_number || null)
      .input('ProspectId', sqlTypes.NVarChar(100), body.prospect_id || null)
      .input('Summary', sqlTypes.NVarChar(sql.MAX), body.summary)
      .input('MeritPress', sqlTypes.NVarChar(sql.MAX), body.merit_press || null)
      .input('ValueInDispute', sqlTypes.NVarChar(100), body.value_in_dispute || null)
      .input('ValueInDisputeExact', sqlTypes.Decimal(19, 2), exactValue)
      .input('CRef', sqlTypes.Bit, cReferenceStatus)
      .input('CounselInstr', sqlTypes.Bit, counselInstructed)
      .input('CounselName', sqlTypes.NVarChar(255), counselInstructed ? body.counsel_name || null : null)
      .query(`
        INSERT INTO dbo.notable_case_info
          (initials, context_type, display_number, prospect_id, summary, merit_press, value_in_dispute, value_in_dispute_exact, c_reference_status, counsel_instructed, counsel_name)
        OUTPUT Inserted.id
        VALUES
          (@Initials, @ContextType, @DisplayNumber, @ProspectId, @Summary, @MeritPress, @ValueInDispute, @ValueInDisputeExact, @CRef, @CounselInstr, @CounselName);
      `)
  );

  return result.recordset?.[0]?.id ? String(result.recordset[0].id) : null;
}

function buildNotificationHtml(body, relatedMatters, history) {
  const ref = body.context_type === 'C' ? body.display_number : body.prospect_id;
  const headingType = body.context_type === 'C' ? 'CLIENT MATTER' : 'PROSPECT / ENQUIRY';
  const intro = body.context_type === 'C'
    ? 'A new notable client matter submission has been recorded.'
    : 'A new notable prospect / enquiry submission has been recorded.';
  const classify = body.context_type === 'C'
    ? '<p style="margin:0 0 12px 0;font-size:13px;color:#2563eb"><strong>Classification:</strong> Client Matter (reference provided)</p>'
    : '<p style="margin:0 0 12px 0;font-size:13px;color:#7c3aed"><strong>Classification:</strong> Prospect / Enquiry (no formal file opened yet)</p>';

  const rows = [
    ['Submitted by (FE)', body.initials],
    [body.context_type === 'C' ? 'File Reference' : 'Prospect / Enquiry ID', ref],
    ['Brief Summary', body.summary],
  ];
  if (body.merit_press) rows.push(['PR Merit', body.merit_press]);
  rows.push(['Indication of Value', body.value_in_dispute || 'Not specified']);
  if (body.value_in_dispute_exact) rows.push(['Exact Value (>500k)', body.value_in_dispute_exact]);
  rows.push([`${body.context_type === 'C' ? 'Client' : 'Prospect'} Prepared to Provide Reference`, normalizeBoolean(body.c_reference_status) ? 'Yes' : 'No']);
  {
    const counselInstructed = normalizeBoolean(body.counsel_instructed);
    const counselLabel = body.context_type === 'C' ? 'Counsel Instructed' : 'Counsel Instructed or Likely';
    rows.push([counselLabel, counselInstructed ? 'Yes' : 'No']);
    if (counselInstructed) rows.push(['Counsel Name', body.counsel_name || 'Not specified']);
  }

  const tableRows = rows.map(([label, value]) => `<tr><td style="background:#f8fafc;font-weight:600;width:230px;border:1px solid #e2e8f0;padding:6px 10px">${escapeHtml(label)}</td><td style="border:1px solid #e2e8f0;padding:6px 10px">${escapeHtml(value)}</td></tr>`).join('');

  const relatedTable = body.context_type === 'C'
    ? (relatedMatters.length
      ? `<h3 style="margin:24px 0 8px 0;font-size:15px;color:#111">Related Matters</h3><table cellpadding="6" cellspacing="0" style="border:1px solid #e5e7eb;border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="border:1px solid #e5e7eb">Display Number</th><th style="border:1px solid #e5e7eb">Client Name</th><th style="border:1px solid #e5e7eb">Matter Description</th><th style="border:1px solid #e5e7eb">Fee Earner</th></tr></thead><tbody>${relatedMatters.map((matter) => `<tr><td style="border:1px solid #e5e7eb">${escapeHtml(matter.display_number)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(matter.client_name)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(matter.matter_description)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(matter.fee_earner)}</td></tr>`).join('')}</tbody></table>`
      : '<p style="font-size:12px;color:#555"><em>No related matters found.</em></p>')
    : '';

  const historyTable = body.context_type === 'C'
    ? (history.length
      ? `<h3 style="margin:28px 0 8px 0;font-size:15px;color:#111">Previous Notable Case Entries</h3><table cellpadding="6" cellspacing="0" style="border:1px solid #e5e7eb;border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#eef6ff;text-align:left"><th style="border:1px solid #e5e7eb">Date</th><th style="border:1px solid #e5e7eb">By</th><th style="border:1px solid #e5e7eb">Summary</th><th style="border:1px solid #e5e7eb">Value</th><th style="border:1px solid #e5e7eb">Ref?</th><th style="border:1px solid #e5e7eb">Counsel</th></tr></thead><tbody>${history.map((entry) => `<tr><td style="border:1px solid #e5e7eb">${escapeHtml(new Date(entry.created_at).toLocaleDateString('en-GB'))}</td><td style="border:1px solid #e5e7eb">${escapeHtml(entry.initials)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(entry.summary)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(entry.value_in_dispute || 'Not specified')}</td><td style="border:1px solid #e5e7eb">${entry.c_reference_status ? 'Yes' : 'No'}</td><td style="border:1px solid #e5e7eb">${entry.counsel_instructed ? escapeHtml(entry.counsel_name || 'Yes') : 'No'}</td></tr>`).join('')}</tbody></table>`
      : '<p style="font-size:12px;color:#555"><em>No previous notable case entries.</em></p>')
    : '<p style="font-size:12px;color:#555;margin-top:20px"><em>History will appear once a formal file reference exists.</em></p>';

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;"><div style="background:linear-gradient(135deg,#eff6ff,#ffffff);padding:14px 18px;border:1px solid #e5e7eb;margin-bottom:18px;box-shadow:0 2px 4px rgba(0,0,0,0.04)"><h1 style="margin:0;font-size:18px;letter-spacing:.5px;color:#111827;text-transform:uppercase">Notable ${headingType}</h1>${classify}<p style="margin:4px 0 0 0;font-size:14px">${intro}</p></div><table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px 0;border-collapse:separate;border-spacing:0 6px;">${tableRows}</table>${relatedTable}${historyTable}<p style="font-size:12px;color:#666;margin-top:30px">This email was automatically generated by the Helix Hub system.</p></body></html>`;
}

async function sendNotificationEmail(body, relatedMatters, history) {
  const ref = body.context_type === 'C' ? body.display_number : body.prospect_id;
  const html = buildNotificationHtml(body, relatedMatters, history);
  const result = await sendHelixEmail({
    body: {
      user_email: 'lz@helix-law.com;ac@helix-law.com',
      subject: `Notable ${body.context_type === 'C' ? 'Case' : 'Prospect'} Information Submitted - ${ref}`,
      email_contents: html,
      from_email: 'automations@helix-law.com',
      saveToSentItems: false,
      skipSignature: true,
    },
    route: 'server:/api/notable-case-info',
  });

  return { success: result.ok === true, status: result.status, error: result.error || null };
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  if (!body.initials) return 'Missing initials';
  if (!body.summary) return 'Missing summary';
  if (!['C', 'P'].includes(body.context_type)) return 'Missing or invalid context_type';
  if (body.context_type === 'C' && !body.display_number) return 'Missing display_number';
  if (body.context_type === 'P' && !body.prospect_id) return 'Missing prospect_id';
  return null;
}

router.options('/', (_req, res) => res.status(204).end());

// Lightweight history lookup so the form can show prior entries for the same
// file reference or prospect id and frame the next submission as an update.
router.get('/', async (req, res) => {
  const displayNumber = (req.query.display_number || '').toString().trim();
  const prospectId = (req.query.prospect_id || '').toString().trim();
  if (!displayNumber && !prospectId) {
    return res.status(400).json({ error: 'display_number or prospect_id is required' });
  }
  try {
    const connectionString = await buildProjectDataConnectionString();
    const result = await withRequest(connectionString, (request, sqlTypes) => {
      const where = displayNumber ? 'display_number = @Ref' : 'prospect_id = @Ref';
      return request
        .input('Ref', sqlTypes.NVarChar(100), displayNumber || prospectId)
        .query(`
          SELECT TOP 20 id, initials, context_type, display_number, prospect_id,
                 summary, value_in_dispute, value_in_dispute_exact,
                 c_reference_status, counsel_instructed, counsel_name, created_at
          FROM dbo.notable_case_info
          WHERE ${where}
          ORDER BY created_at DESC;
        `);
    });
    return res.json({ entries: (result.recordset || []).map((row) => ({ ...row, id: String(row.id) })) });
  } catch (error) {
    trackException(error, { operation: 'history', phase: 'notableCaseInfo.history' });
    return res.status(500).json({ error: 'Failed to load notable case history' });
  }
});

router.post('/', async (req, res) => {
  const started = Date.now();
  trackEvent('Forms.NotableCaseInfo.Started', {
    operation: 'submit',
    triggeredBy: req.body?.initials || 'unknown',
    contextType: req.body?.context_type || 'unknown',
  });

  const {
    initials,
    context_type,
    display_number,
    prospect_id,
    summary,
  } = req.body || {};

  const validationError = validatePayload(req.body);
  if (validationError) {
    trackEvent('Forms.NotableCaseInfo.Failed', {
      operation: 'submit',
      phase: 'validation',
      error: validationError,
    });
    return res.status(400).json({ error: validationError });
  }

  let submissionId = null;
  try {
    const ref = context_type === 'C' ? (display_number || '') : (prospect_id || '');
    submissionId = await recordSubmission({
      formKey: 'notable-case-info',
      submittedBy: String(initials || 'UNK').slice(0, 10),
      lane: 'Log',
      payload: req.body,
      summary: `Notable case info [${context_type || '?'}] ${ref}${summary ? ` - ${summary}` : ''}`.slice(0, 400),
      clientSubmissionId: req.body?.clientSubmissionId || null,
    });
  } catch (logErr) {
    trackException(logErr, { phase: 'notableCaseInfo.recordSubmission' });
  }

  try {
    const connectionString = await buildProjectDataConnectionString();
    const relatedMatters = context_type === 'C' && display_number
      ? await lookupRelatedMatters(connectionString, display_number)
      : [];
    const insertedId = await insertNotableCaseInfo(connectionString, req.body);
    const history = context_type === 'C' && display_number
      ? await fetchNotableCaseHistory(connectionString, display_number)
      : [];
    const email = await sendNotificationEmail(req.body, relatedMatters, history);

    if (submissionId) {
      await recordStep(submissionId, {
        name: 'notable-case-info.persist',
        status: 'success',
        output: { insertedId, emailSent: email.success, relatedMattersFound: relatedMatters.length },
      });
      await markComplete(submissionId, { lastEvent: 'notable-case-info persisted' });
    }

    const durationMs = Date.now() - started;
    trackMetric('Forms.NotableCaseInfo.Duration', durationMs, { operation: 'submit' });
    trackEvent('Forms.NotableCaseInfo.Completed', {
      operation: 'submit',
      triggeredBy: initials || 'unknown',
      durationMs,
      insertedId: insertedId || '',
      emailSent: String(email.success),
      relatedMattersFound: String(relatedMatters.length),
    });

    return res.status(201).json({
      message: 'Notable case information submitted successfully.',
      insertedId,
      emailSent: email.success,
      emailSkipped: false,
      relatedMattersFound: relatedMatters.length,
      runtimeVersion: 'server-express',
      submissionId,
      streamUrl: submissionId ? `forms?focusSubmission=${submissionId}` : null,
    });
  } catch (error) {
    console.error('[notable-case-info] submission error:', error);
    trackException(error, { operation: 'submit', phase: 'notableCaseInfo.persist', contextType: context_type || 'unknown' });
    trackEvent('Forms.NotableCaseInfo.Failed', {
      operation: 'submit',
      phase: 'persist',
      error: error?.message || String(error),
    });
    if (submissionId) {
      await markFailed(submissionId, {
        lastEvent: 'notable-case-info:persist:failed',
        error,
      });
    }
    return res.status(500).json({
      error: 'Failed to submit notable case information',
      details: error?.message || String(error),
    });
  }
});

module.exports = router;
