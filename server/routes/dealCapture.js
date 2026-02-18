const sql = require('mssql');
const { loggers } = require('../utils/logger');

const log = loggers.payments.child('DealCapture');

// Database connection configuration
let dbConfig = null;
let dealsColumnCache = null;

function parseSqlConnectionString(connectionString) {
  const map = new Map();
  for (const part of String(connectionString)
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    map.set(key, value);
  }
  return map;
}

function getFirstConnValue(connMap, keys) {
  for (const k of keys) {
    const v = connMap.get(String(k).toLowerCase());
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function normaliseServerName(serverValue) {
  if (!serverValue) return serverValue;
  // Common forms: tcp:myserver.database.windows.net,1433
  const withoutPrefix = String(serverValue).replace(/^tcp:/i, '');
  return withoutPrefix.split(',')[0];
}

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }

  // Production connection strings vary (e.g. Server/Initial Catalog vs Data Source/Database).
  // A brittle parser here can silently drop the database and default to the login's default DB
  // (often 'master'), which then causes "Invalid object name 'Deals'."
  const connMap = parseSqlConnectionString(connectionString);
  const serverRaw = getFirstConnValue(connMap, [
    'server',
    'data source',
    'address',
    'addr',
    'network address'
  ]);
  const database = getFirstConnValue(connMap, ['initial catalog', 'database']);
  const user = getFirstConnValue(connMap, ['user id', 'uid', 'user']);
  const password = getFirstConnValue(connMap, ['password', 'pwd']);

  const server = normaliseServerName(serverRaw);

  if (!server) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING missing Server/Data Source');
  }
  if (!database) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING missing Initial Catalog/Database');
  }
  if (!user || !password) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING missing User ID/Password');
  }
  
  dbConfig = {
    server,
    database, 
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
      requestTimeout: 30000
    }
  };
  
  return dbConfig;
}

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
    linkOnly,
    checkoutMode: providedCheckoutMode
  } = req.body;

  const finalServiceDescription = serviceDescription || initialScopeDescription;

  // Validate required fields
  if (!finalServiceDescription || amount == null || !areaOfWork || !pitchedBy) {
    return res.status(400).json({ error: 'Missing required fields', requestId });
  }

  const passcode = providedPasscode || Math.floor(10000 + Math.random() * 90000).toString();
  
  let instructionRef = providedInstructionRef;
  if (!instructionRef && prospectId) {
    const passcodeStr = String(passcode).padStart(5, '0');
    const prospectIdStr = String(prospectId).padStart(5, '0');
    instructionRef = `HLX-${prospectIdStr}-${passcodeStr}`;
  }

  try {
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    const dealsColumns = await getDealsColumns(pool);

    const resolvedDealKind = (() => {
      const raw = typeof providedDealKind === 'string' ? providedDealKind.trim() : '';
      if (raw) return raw.toUpperCase();
      if (linkOnly === true) return 'CHECKOUT_LINK';
      return '';
    })();

    const resolvedStatus = (() => {
      if (linkOnly === true) return 'CHECKOUT_LINK';
      // CFA checkout mode: set deal status to 'CFA' so instruct-pitch derives CFA mode
      if (typeof providedCheckoutMode === 'string' && providedCheckoutMode.toUpperCase() === 'CFA') return 'CFA';
      return 'pitched';
    })();

    // Insert new deal
    const now = new Date();
    const pitchValidUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const insertRequest = pool.request()
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription)
      .input('Amount', sql.Money, amount)
      .input('AreaOfWork', sql.NVarChar(100), areaOfWork)
      .input('PitchedBy', sql.NVarChar(100), pitchedBy)
      .input('PitchedDate', sql.Date, formatDate(now))
      .input('PitchedTime', sql.Time, now)
      .input('PitchValidUntil', sql.Date, formatDate(pitchValidUntil))
      .input('Status', sql.NVarChar(20), resolvedStatus)
      .input('IsMultiClient', sql.Bit, isMultiClient ? 1 : 0)
      .input('LeadClientId', sql.Int, prospectId || null)
      .input('LeadClientEmail', sql.NVarChar(255), leadClientEmail || null)
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
    const cleanNotes = (notes && notes.trim()) ? notes : null;
    
    await pool.request()
      .input('DealId', sql.Int, dealId)
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('Amount', sql.Money, amount)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription)
      .input('EmailSubject', sql.NVarChar(255), cleanEmailSubject)
      .input('EmailBody', sql.NVarChar(sql.MAX), cleanEmailBody)
      .input('EmailBodyHtml', sql.NVarChar(sql.MAX), cleanEmailBodyHtml)
      .input('Reminders', sql.NVarChar(sql.MAX), reminders ? JSON.stringify(reminders) : null)
      .input('CreatedBy', sql.NVarChar(100), pitchedBy)
      .input('Notes', sql.NVarChar(sql.MAX), cleanNotes)
      .input('ScenarioId', sql.NVarChar(100), scenarioId)
      .query(`
        INSERT INTO dbo.PitchContent (DealId, InstructionRef, ProspectId, Amount, ServiceDescription, EmailSubject, EmailBody, EmailBodyHtml, Reminders, CreatedBy, Notes, ScenarioId)
        VALUES (@DealId, @InstructionRef, @ProspectId, @Amount, @ServiceDescription, @EmailSubject, @EmailBody, @EmailBodyHtml, @Reminders, @CreatedBy, @Notes, @ScenarioId)
      `);

    // Log key operation for App Insights recovery
    log.op('deal:captured', { dealId, instructionRef, prospectId, amount, areaOfWork });

    const baseInstructions = process.env.DEAL_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch';
    const instructionsUrl = `${baseInstructions.replace(/\/$/, '')}/${encodeURIComponent(passcode)}`;
    
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
    let dbName;
    let dbServer;
    try {
      const cfg = await getDbConfig();
      dbName = cfg?.database;
      dbServer = cfg?.server;
    } catch (_e) {
      dbName = undefined;
      dbServer = undefined;
    }

    const message = error?.message || String(error);
    const isMissingDealsTable =
      /Invalid object name\s+'(?:dbo\.)?Deals'\./i.test(message) ||
      /Invalid object name\s+'Deals'\./i.test(message);

    log.fail('deal:capture', error, {
      prospectId,
      amount,
      areaOfWork,
      requestId,
      dbName,
      dbServer,
      recoverable: isMissingDealsTable
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
