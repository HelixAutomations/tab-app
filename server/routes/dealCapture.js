const sql = require('mssql');
const { loggers } = require('../utils/logger');

const log = loggers.payments.child('DealCapture');

// Database connection configuration
let dbConfig = null;

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }
  
  const params = new URLSearchParams(connectionString.split(';').join('&'));
  const server = params.get('Server').replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const user = params.get('User ID');
  const password = params.get('Password');
  
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
    notes
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

    // Check for recent duplicate deals
    const duplicateCheck = await pool.request()
      .input('ProspectId', sql.Int, prospectId || null)
      .input('ServiceDescription', sql.NVarChar(255), finalServiceDescription)
      .query(`
        SELECT TOP 1 DealId, Passcode
        FROM Deals 
        WHERE ProspectId = @ProspectId 
          AND ServiceDescription = @ServiceDescription
          AND PitchedDate = CAST(GETDATE() AS DATE)
          AND DATEDIFF(MINUTE, CAST(PitchedDate AS DATETIME) + CAST(PitchedTime AS DATETIME), GETDATE()) < 5
        ORDER BY DealId DESC
      `);

    let dealId;

    if (duplicateCheck.recordset.length > 0) {
      const existingDeal = duplicateCheck.recordset[0];
      dealId = existingDeal.DealId;
      
      const baseInstructions = process.env.DEAL_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch';
      const instructionsUrl = `${baseInstructions.replace(/\/$/, '')}/${encodeURIComponent(existingDeal.Passcode)}`;
      
      return res.json({ 
        success: true,
        ok: true,
        dealId,
        passcode: existingDeal.Passcode,
        instructionRef: instructionRef,
        instructionsUrl,
        message: 'Deal captured',
        requestId
      });
    }

    // Insert new deal
    const now = new Date();
    const pitchValidUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const dealResult = await pool.request()
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription)
      .input('Amount', sql.Money, amount)
      .input('AreaOfWork', sql.NVarChar(100), areaOfWork)
      .input('PitchedBy', sql.NVarChar(100), pitchedBy)
      .input('PitchedDate', sql.Date, formatDate(now))
      .input('PitchedTime', sql.Time, now)
      .input('PitchValidUntil', sql.Date, formatDate(pitchValidUntil))
      .input('Status', sql.NVarChar(20), 'pitched')
      .input('IsMultiClient', sql.Bit, isMultiClient ? 1 : 0)
      .input('LeadClientId', sql.Int, prospectId || null)
      .input('LeadClientEmail', sql.NVarChar(255), leadClientEmail || null)
      .input('Passcode', sql.NVarChar(50), passcode)
      .input('CloseDate', sql.Date, null)
      .input('CloseTime', sql.Time, null)
      .query(`
        INSERT INTO Deals (InstructionRef, ProspectId, ServiceDescription, Amount, AreaOfWork, PitchedBy, PitchedDate, PitchedTime, PitchValidUntil, Status, IsMultiClient, LeadClientId, LeadClientEmail, Passcode, CloseDate, CloseTime)
        OUTPUT INSERTED.DealId
        VALUES (@InstructionRef, @ProspectId, @ServiceDescription, @Amount, @AreaOfWork, @PitchedBy, @PitchedDate, @PitchedTime, @PitchValidUntil, @Status, @IsMultiClient, @LeadClientId, @LeadClientEmail, @Passcode, @CloseDate, @CloseTime)
      `);

    dealId = dealResult.recordset[0].DealId;

    // Insert joint clients if multi-client
    if (isMultiClient && Array.isArray(clients)) {
      for (const c of clients) {
        await pool.request()
          .input('DealId', sql.Int, dealId)
          .input('ClientEmail', sql.NVarChar(255), c.clientEmail || c.email || '')
          .query('INSERT INTO DealJointClients (DealId, ClientEmail) VALUES (@DealId, @ClientEmail)');
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
        INSERT INTO PitchContent (DealId, InstructionRef, ProspectId, Amount, ServiceDescription, EmailSubject, EmailBody, EmailBodyHtml, Reminders, CreatedBy, Notes, ScenarioId)
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
    log.fail('deal:capture', error, { prospectId, amount, areaOfWork, requestId });
    res.status(500).json({ 
      error: 'Failed to capture deal', 
      details: error.message,
      requestId
    });
  }
};
