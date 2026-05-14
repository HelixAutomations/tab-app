const sql = require('mssql');
const { loggers } = require('../utils/logger');
const { emitEvent } = require('../utils/eventEmitter');
const { getPool } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const log = loggers.payments.child('DealCapture');

const getInstrConnStr = () => {
  const s = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!s) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return s;
};

let dealsColumnCache = null;
async function getDealsColumns(pool) {
  if (dealsColumnCache) return dealsColumnCache;
  const result = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Deals'
  `);
  const columns = new Set((result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
  dealsColumnCache = columns;
  return columns;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  const requestId = Math.random().toString(36).substring(2, 10);
  
  const {
    serviceDescription,
    initialScopeDescription,
    amount,
    areaOfWork,
    prospectId,
    pitchedBy,
    isMultiClient,
    leadClientEmail,
    leadClientId,
    clients = [],
    passcode: providedPasscode,
    instructionRef: providedInstructionRef,
    emailSubject,
    emailBody,
    emailBodyHtml,
    reminders,
    notes,
    dealKind: providedDealKind,
    source,
    firstName,
    lastName,
    contactEmail,
    linkOnly,
    checkoutMode: providedCheckoutMode
  } = req.body;

  const rawDealKind = typeof providedDealKind === 'string' ? providedDealKind.trim().toUpperCase() : '';
  const isDirectReferral = rawDealKind === 'DIRECT_REFERRAL' || source === 'direct-referral';
  const finalServiceDescription = serviceDescription || initialScopeDescription || (isDirectReferral ? 'External pitch request' : '');
  const finalAmount = amount == null && isDirectReferral ? 0 : amount;
  const finalAreaOfWork = areaOfWork || (isDirectReferral ? 'Misc' : '');
  const finalPitchedBy = pitchedBy || (isDirectReferral ? 'Hub' : '');
  const startedAt = Date.now();

  trackEvent('DealCapture.Started', {
    operation: isDirectReferral ? 'pitchExternal' : 'dealCapture',
    triggeredBy: finalPitchedBy,
    dealKind: isDirectReferral ? 'DIRECT_REFERRAL' : (rawDealKind || (linkOnly === true ? 'CHECKOUT_LINK' : '')),
    source: source || '',
    hasProspectId: Boolean(prospectId),
  });

  // Validate required fields
  if (!finalServiceDescription || finalAmount == null || !finalAreaOfWork || !finalPitchedBy) {
    trackEvent('DealCapture.Failed', {
      operation: isDirectReferral ? 'pitchExternal' : 'dealCapture',
      triggeredBy: finalPitchedBy,
      phase: 'validation',
      error: 'Missing required fields',
      requestId,
    });
    return res.status(400).json({ error: 'Missing required fields', requestId });
  }

  const passcode = providedPasscode || Math.floor(10000 + Math.random() * 90000).toString();
  
  let instructionRef = providedInstructionRef;
  if (!instructionRef && prospectId) {
    const passcodeStr = String(passcode).padStart(5, '0');
    const prospectIdStr = String(prospectId).padStart(5, '0');
    instructionRef = `HLX-${prospectIdStr}-${passcodeStr}`;
  }
  if (!instructionRef && isDirectReferral) {
    const passcodeStr = String(passcode).padStart(5, '0');
    instructionRef = `HLX-EXT-${passcodeStr}`;
  }

  try {
    const pool = await getPool(getInstrConnStr());
    const dealsColumns = await getDealsColumns(pool);

    const resolvedDealKind = (() => {
      if (rawDealKind) return rawDealKind;
      if (isDirectReferral) return 'DIRECT_REFERRAL';
      if (linkOnly === true) return 'CHECKOUT_LINK';
      return '';
    })();

    const resolvedStatus = (() => {
      if (isDirectReferral) return 'PENDING_CONTACT';
      if (linkOnly === true) return 'CHECKOUT_LINK';
      // CFA checkout mode: set deal status to 'CFA' so instruct-pitch derives CFA mode
      if (typeof providedCheckoutMode === 'string' && providedCheckoutMode.toUpperCase() === 'CFA') return 'CFA';
      // ID-only checkout mode: identity verification only, no payment
      if (typeof providedCheckoutMode === 'string' && providedCheckoutMode.toUpperCase() === 'ID_ONLY') return 'ID_ONLY';
      return 'pitched';
    })();

    // Insert new deal
    const now = new Date();
    const pitchValidUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const insertRequest = pool.request()
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription)
      .input('Amount', sql.Money, finalAmount)
      .input('AreaOfWork', sql.NVarChar(100), finalAreaOfWork)
      .input('PitchedBy', sql.NVarChar(100), finalPitchedBy)
      .input('PitchedDate', sql.Date, formatDate(now))
      .input('PitchedTime', sql.Time, now)
      .input('PitchValidUntil', sql.Date, formatDate(pitchValidUntil))
      .input('Status', sql.NVarChar(20), resolvedStatus)
      .input('IsMultiClient', sql.Bit, isMultiClient ? 1 : 0)
      .input('LeadClientId', sql.Int, prospectId || null)
      .input('LeadClientEmail', sql.NVarChar(255), leadClientEmail || contactEmail || null)
      .input('Passcode', sql.NVarChar(50), passcode)
      .input('CloseDate', sql.Date, null)
      .input('CloseTime', sql.Time, null);

    const insertColumns = [
      'InstructionRef',
      'ProspectId',
      'ServiceDescription',
      'Amount',
      'AreaOfWork',
      'PitchedBy',
      'PitchedDate',
      'PitchedTime',
      'PitchValidUntil',
      'Status',
      'IsMultiClient',
      'LeadClientId',
      'LeadClientEmail',
      'Passcode',
      'CloseDate',
      'CloseTime',
    ];
    const insertValues = insertColumns.map((col) => `@${col}`);

    if (resolvedDealKind && dealsColumns.has('DealKind')) {
      insertRequest.input('DealKind', sql.NVarChar(20), resolvedDealKind);
      insertColumns.push('DealKind');
      insertValues.push('@DealKind');
    }

    const dealResult = await insertRequest.query(`
        INSERT INTO dbo.Deals (${insertColumns.join(', ')})
        OUTPUT INSERTED.DealId
        VALUES (${insertValues.join(', ')})
      `);

    const dealId = dealResult.recordset[0].DealId;

    // Insert joint clients if multi-client
    if (isMultiClient && Array.isArray(clients)) {
      for (const c of clients) {
        await pool.request()
          .input('DealId', sql.Int, dealId)
          .input('ClientEmail', sql.NVarChar(255), c.clientEmail || c.email || '')
          .query('INSERT INTO dbo.DealJointClients (DealId, ClientEmail) VALUES (@DealId, @ClientEmail)');
      }
    }

    // Save pitch content
    const scenarioId = req.body.scenarioId || null;
    const cleanEmailSubject = (emailSubject && emailSubject.trim()) ? emailSubject : null;
    const cleanEmailBody = (emailBody && emailBody.trim()) ? emailBody : null;
    const cleanEmailBodyHtml = (emailBodyHtml && emailBodyHtml.trim()) ? emailBodyHtml : null;
    const directReferralNotes = isDirectReferral
      ? JSON.stringify({
          source: 'direct-referral',
          firstName: firstName || null,
          lastName: lastName || null,
          email: leadClientEmail || contactEmail || null,
          originalNotes: (notes && notes.trim()) ? notes : null,
        })
      : null;
    const cleanNotes = directReferralNotes || ((notes && notes.trim()) ? notes : null);
    
    await pool.request()
      .input('DealId', sql.Int, dealId)
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('Amount', sql.Money, finalAmount)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription)
      .input('EmailSubject', sql.NVarChar(255), cleanEmailSubject)
      .input('EmailBody', sql.NVarChar(sql.MAX), cleanEmailBody)
      .input('EmailBodyHtml', sql.NVarChar(sql.MAX), cleanEmailBodyHtml)
      .input('Reminders', sql.NVarChar(sql.MAX), reminders ? JSON.stringify(reminders) : null)
      .input('CreatedBy', sql.NVarChar(100), finalPitchedBy)
      .input('Notes', sql.NVarChar(sql.MAX), cleanNotes)
      .input('ScenarioId', sql.NVarChar(100), scenarioId)
      .query(`
        INSERT INTO dbo.PitchContent (DealId, InstructionRef, ProspectId, Amount, ServiceDescription, EmailSubject, EmailBody, EmailBodyHtml, Reminders, CreatedBy, Notes, ScenarioId)
        VALUES (@DealId, @InstructionRef, @ProspectId, @Amount, @ServiceDescription, @EmailSubject, @EmailBody, @EmailBodyHtml, @Reminders, @CreatedBy, @Notes, @ScenarioId)
      `);

    // Log key operation for App Insights recovery
    log.op('deal:captured', { dealId, instructionRef, prospectId, amount: finalAmount, areaOfWork: finalAreaOfWork, dealKind: resolvedDealKind });

    const baseInstructions = process.env.DEAL_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch';
    const instructionsUrl = `${baseInstructions.replace(/\/$/, '')}/${encodeURIComponent(passcode)}`;

    // Emit to shared Events table for realtime pipeline updates
    emitEvent('deal.created', 'tab-app', instructionRef || String(dealId), 'deal', {
      dealId,
      amount: finalAmount,
      areaOfWork: finalAreaOfWork,
      passcode,
      dealKind: resolvedDealKind,
    });

    const durationMs = Date.now() - startedAt;
    trackEvent('DealCapture.Completed', {
      operation: isDirectReferral ? 'pitchExternal' : 'dealCapture',
      triggeredBy: finalPitchedBy,
      durationMs,
      dealKind: resolvedDealKind,
      status: resolvedStatus,
      hasProspectId: Boolean(prospectId),
    });
    trackMetric('DealCapture.Duration', durationMs, { operation: isDirectReferral ? 'pitchExternal' : 'dealCapture' });

    res.json({ 
      success: true,
      ok: true,
      dealId,
      passcode,
      instructionRef,
      instructionsUrl,
      message: 'Deal captured',
      requestId
    });

  } catch (error) {
    const dbName = undefined;
    const dbServer = undefined;

    const message = error?.message || String(error);
    const isMissingDealsTable =
      /Invalid object name\s+'(?:dbo\.)?Deals'\./i.test(message) ||
      /Invalid object name\s+'Deals'\./i.test(message);

    log.fail('deal:capture', error, {
      prospectId,
      amount: finalAmount,
      areaOfWork: finalAreaOfWork,
      requestId,
      dbName,
      dbServer,
      recoverable: isMissingDealsTable
    });

    trackException(error, {
      operation: isDirectReferral ? 'pitchExternal' : 'dealCapture',
      phase: 'captureDeal',
      requestId,
      dealKind: rawDealKind || '',
    });
    trackEvent('DealCapture.Failed', {
      operation: isDirectReferral ? 'pitchExternal' : 'dealCapture',
      triggeredBy: finalPitchedBy,
      error: message,
      requestId,
      recoverable: isMissingDealsTable,
    });

    // If the DB/table is missing due to configuration drift, treat as recoverable so callers
    // (e.g. email send flows) can continue without hard-failing the whole request.
    if (isMissingDealsTable) {
      return res.status(200).json({
        success: false,
        ok: false,
        recoverable: true,
        error: 'Deal capture unavailable (Deals table not found)',
        requestId
      });
    }

    res.status(500).json({
      error: 'Failed to capture deal',
      details: message,
      requestId
    });
  }
};
