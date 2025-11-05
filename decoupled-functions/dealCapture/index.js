const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');
const { getSqlPool } = require('../sqlClient');

const keyVaultName = process.env.KEY_VAULT_NAME;
if (!keyVaultName && !process.env.KEY_VAULT_URL) {
  throw new Error('Key Vault not specified! Set KEY_VAULT_NAME or KEY_VAULT_URL');
}
const vaultUrl = process.env.KEY_VAULT_URL ||
  `https://${keyVaultName}.vault.azure.net/`;
const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(vaultUrl, credential);
let passwordPromise;

async function ensureDbPassword() {
  if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
  if (!passwordPromise) {
const dbPasswordSecret = process.env.DB_PASSWORD_SECRET || 'instructionsadmin-password';
passwordPromise = secretClient.getSecret(dbPasswordSecret).then(s => {
      process.env.DB_PASSWORD = s.value;
      return s.value;
    });
  }
  return passwordPromise;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(date) {
  return date.toISOString().slice(11, 19); // "HH:MM:SS"
}

module.exports = async function (context, req) {
  context.log('dealCapture function received a request');

  if (req.method !== 'POST') {
    context.res = { status: 405, body: 'Method not allowed' };
    return;
  }

  const body = req.body || {};
  const { 
    serviceDescription, 
    initialScopeDescription, // Frontend sends this name
    amount, areaOfWork, prospectId, pitchedBy, isMultiClient, leadClientEmail, clients, passcode,
    // Pitch content fields
    emailSubject, emailBody, emailBodyHtml, reminders, notes
  } = body;

  // Accept either field name for service description
  const finalServiceDescription = serviceDescription || initialScopeDescription;

  if (!finalServiceDescription || amount == null || !areaOfWork || !pitchedBy) {
    context.res = { status: 400, body: 'Missing required fields' };
    return;
  }

  try {
    await ensureDbPassword();
    const pool = await getSqlPool();

    // Check for recent duplicate deals (same ProspectId, similar ServiceDescription, within last 5 minutes)
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

    if (duplicateCheck.recordset.length > 0) {
      const existingDeal = duplicateCheck.recordset[0];
      context.log('Returning existing deal to prevent duplicate:', { dealId: existingDeal.DealId, passcode: existingDeal.Passcode });
      context.res = { status: 200, body: { ok: true, dealId: existingDeal.DealId, passcode: existingDeal.Passcode } };
      return;
    }

    const now = new Date();
    const pitchValidUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const instructionRef = body.instructionRef || null;
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
      .input('Passcode', sql.NVarChar(50), passcode || null)
      .input('CloseDate', sql.Date, null)
      .input('CloseTime', sql.Time, null)
      .query(`INSERT INTO Deals (InstructionRef, ProspectId, ServiceDescription, Amount, AreaOfWork, PitchedBy, PitchedDate, PitchedTime, PitchValidUntil, Status, IsMultiClient, LeadClientId, LeadClientEmail, Passcode, CloseDate, CloseTime)
              OUTPUT INSERTED.DealId
              VALUES (@InstructionRef, @ProspectId, @ServiceDescription, @Amount, @AreaOfWork, @PitchedBy, @PitchedDate, @PitchedTime, @PitchValidUntil, @Status, @IsMultiClient, @LeadClientId, @LeadClientEmail, @Passcode, @CloseDate, @CloseTime)`);

    const dealId = dealResult.recordset[0].DealId;

    // Always insert pitch content to preserve email body/subject
    // Convert empty strings to null for proper database storage
    const cleanEmailSubject = (emailSubject && emailSubject.trim()) ? emailSubject : null;
    const cleanEmailBody = (emailBody && emailBody.trim()) ? emailBody : null;
    const cleanEmailBodyHtml = (emailBodyHtml && emailBodyHtml.trim()) ? emailBodyHtml : null;
    const cleanNotes = (notes && notes.trim()) ? notes : null;
    
    await pool.request()
      .input('DealId', sql.Int, dealId)
      .input('InstructionRef', sql.NVarChar(50), instructionRef)
      .input('ProspectId', sql.Int, prospectId || null)
      .input('Amount', sql.Money, amount)
      .input('ServiceDescription', sql.NVarChar(sql.MAX), finalServiceDescription) // Now unlimited
      .input('EmailSubject', sql.NVarChar(255), cleanEmailSubject)
      .input('EmailBody', sql.NVarChar(sql.MAX), cleanEmailBody)
      .input('EmailBodyHtml', sql.NVarChar(sql.MAX), cleanEmailBodyHtml)
      .input('Reminders', sql.NVarChar(sql.MAX), reminders ? JSON.stringify(reminders) : null)
      .input('CreatedBy', sql.NVarChar(100), pitchedBy)
      .input('Notes', sql.NVarChar(sql.MAX), cleanNotes)
      .query(`INSERT INTO PitchContent (DealId, InstructionRef, ProspectId, Amount, ServiceDescription, EmailSubject, EmailBody, EmailBodyHtml, Reminders, CreatedBy, Notes)
              VALUES (@DealId, @InstructionRef, @ProspectId, @Amount, @ServiceDescription, @EmailSubject, @EmailBody, @EmailBodyHtml, @Reminders, @CreatedBy, @Notes)`);

    if (isMultiClient && Array.isArray(clients)) {
      for (const c of clients) {
        await pool.request()
          .input('DealId', sql.Int, dealId)
          // Support both `email` and `clientEmail` field names
          .input('ClientEmail', sql.NVarChar(255), c.clientEmail || c.email || '')
          .query('INSERT INTO DealJointClients (DealId, ClientEmail) VALUES (@DealId, @ClientEmail)');
      }
    }

    context.res = { status: 200, body: { ok: true, dealId, passcode } };
  } catch (err) {
    context.log.error('dealCapture error:', err);
    context.res = { status: 500, body: { error: 'Failed to insert deal', detail: err.message } };
  }
};