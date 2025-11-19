const sql = require('mssql');

console.log('🔧 DEAL CAPTURE ROUTE MODULE LOADED');

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

function formatTime(date) {
  return date.toISOString().slice(11, 19); // "HH:MM:SS"
}

module.exports = async (req, res) => {
  const requestId = Math.random().toString(36).substring(2, 10);
  
  console.log(`[${requestId}] 🎯 DEAL CAPTURE ENDPOINT - New deal/pitch submission`);
  
  const {
    // Frontend payload fields (match Azure Function exactly)
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
    // Pitch content fields
    emailSubject,
    emailBody,
    emailBodyHtml,
    reminders,
    notes
  } = req.body;

  // Accept either field name for service description (match Azure Function)
  const finalServiceDescription = serviceDescription || initialScopeDescription;

  // Validate required fields (match Azure Function validation)
  if (!finalServiceDescription || amount == null || !areaOfWork || !pitchedBy) {
    console.log(`[${requestId}] ❌ Bad request - missing required fields`);
    return res.status(400).json({ error: 'Missing required fields', requestId });
  }

  // Use provided passcode or generate one (match Azure Function)
  const passcode = providedPasscode || Math.floor(10000 + Math.random() * 90000).toString();
  
  // Generate instructionRef if not provided (match insertDeal logic)
  let instructionRef = providedInstructionRef;
  if (!instructionRef && prospectId) {
    const pad = (v, width = 5) => String(v).padStart(width, '0');
    const passcodeStr = String(passcode).padStart(5, '0');
    const prospectIdStr = String(prospectId).padStart(5, '0');
    instructionRef = `HLX-${prospectIdStr}-${passcodeStr}`;
  }
  
  console.log(`[${requestId}] 📝 Passcode: ${passcode}, instructionRef: ${instructionRef}`);

  try {
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    
    console.log(`[${requestId}] ✅ Database connected successfully`);

    // Check for recent duplicate deals (match Azure Function logic exactly)
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
      console.log(`[${requestId}] 🔄 Returning existing deal to prevent duplicate:`, { dealId, passcode: existingDeal.Passcode });
      
      // Return existing deal without creating duplicate
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

    // No duplicate found - insert new deal (match Azure Function exactly)
    console.log(`[${requestId}] ➕ Creating new deal...`);
    
    const now = new Date();
    const pitchValidUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

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
    console.log(`[${requestId}] ✅ Deal created successfully (ID: ${dealId})`);

    // Insert joint clients if multi-client (match Azure Function exactly)
    if (isMultiClient && Array.isArray(clients)) {
      console.log(`[${requestId}] 👥 Processing ${clients.length} joint clients...`);
      
      for (const c of clients) {
        await pool.request()
          .input('DealId', sql.Int, dealId)
          // Support both `email` and `clientEmail` field names (match Azure Function)
          .input('ClientEmail', sql.NVarChar(255), c.clientEmail || c.email || '')
          .query('INSERT INTO DealJointClients (DealId, ClientEmail) VALUES (@DealId, @ClientEmail)');
      }
      console.log(`[${requestId}] ✅ Joint clients saved successfully`);
    }

    // Always insert pitch content to preserve email body/subject (match Azure Function exactly)
    console.log(`[${requestId}] 📧 Saving pitch content...`);
    
    // Extract scenarioId from payload (optional, may be undefined)
    const scenarioId = req.body.scenarioId || null;
    
    // Convert empty strings to null for proper database storage (match Azure Function)
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
    
    console.log(`[${requestId}] ✅ Pitch content saved successfully`);

    console.log(`[${requestId}] 🎉 Deal capture complete - DealID: ${dealId}, Passcode: ${passcode}`);

    // Build instructions URL
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
    console.error(`[${requestId}] ❌ Database error:`, error);
    res.status(500).json({ 
      error: 'Failed to capture deal', 
      details: error.message,
      requestId
    });
  }
};
