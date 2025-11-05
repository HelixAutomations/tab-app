const express = require('express');
const { getSecret } = require('../utils/getSecret');
const sql = require('mssql');
const router = express.Router();

// Database connection configuration
let dbConfig = null;

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  // Use the INSTRUCTIONS_SQL_CONNECTION_STRING from .env
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }
  
  // Parse connection string into config object
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

// List deals endpoint for debugging
router.get('/', async (req, res) => {
  try {
    console.log('📋 Listing all deals...');
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    
    const result = await pool.request().query('SELECT TOP 10 DealId, ServiceDescription, Amount FROM Deals ORDER BY DealId DESC');
    
    console.log(`Found ${result.recordset.length} deals`);
    res.json({ deals: result.recordset });
  } catch (error) {
    console.error('Error listing deals:', error);
    res.status(500).json({ error: 'Failed to list deals' });
  }
});

// Close deal when matter is opened
router.post('/close-by-instruction', async (req, res) => {
  const { instructionRef } = req.body;
  
  console.log(`🎯 CLOSE DEAL ENDPOINT HIT - Instruction Ref: ${instructionRef}`);
  
  if (!instructionRef) {
    console.log('❌ Bad request - missing instructionRef');
    return res.status(400).json({ error: 'instructionRef is required' });
  }

  try {
    console.log('🔗 Getting database configuration...');
    const config = await getDbConfig();
    console.log('🔗 Connecting to database...');
    const pool = await sql.connect(config);
    
    const now = new Date();
    const updateQuery = `
      UPDATE Deals 
      SET Status = @status,
          CloseDate = @closeDate,
          CloseTime = @closeTime
      WHERE InstructionRef = @instructionRef
    `;
    
    console.log(`Closing deal for instruction ${instructionRef}`);
    
    const result = await pool.request()
      .input('status', sql.NVarChar, 'closed')
      .input('closeDate', sql.Date, now)
      .input('closeTime', sql.Time, now)
      .input('instructionRef', sql.NVarChar, instructionRef)
      .query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      console.log(`⚠️ No deal found for instruction ${instructionRef}`);
      return res.status(404).json({ 
        success: false, 
        message: 'No deal found for this instruction reference' 
      });
    }
    
    console.log(`✅ Deal for instruction ${instructionRef} closed successfully`);
    
    res.json({
      success: true,
      message: 'Deal closed successfully',
      instructionRef
    });
    
  } catch (error) {
    console.error('Error closing deal:', error);
    res.status(500).json({ error: 'Failed to close deal', details: error.message });
  }
});

// Update deal endpoint
router.put('/:dealId', async (req, res) => {
  const dealId = parseInt(req.params.dealId);
  const { ServiceDescription, Amount } = req.body;
  
  console.log(`🎯 DEAL UPDATE ENDPOINT HIT - Deal ID: ${dealId}, Updates:`, { ServiceDescription, Amount });
  
  if (!dealId || (!ServiceDescription && Amount === undefined)) {
    console.log(`❌ Bad request - Deal ID: ${dealId}, ServiceDescription: ${ServiceDescription}, Amount: ${Amount}`);
    return res.status(400).json({ error: 'Deal ID and at least one field to update are required' });
  }

  try {
    console.log('🔗 Getting database configuration...');
    const config = await getDbConfig();
    console.log('🔗 Connecting to database...');
    const pool = await sql.connect(config);
    
    // Build dynamic update query based on provided fields
    const updates = [];
    const request = pool.request().input('dealId', sql.Int, dealId);
    
    if (ServiceDescription !== undefined) {
      updates.push('ServiceDescription = @serviceDescription');
      request.input('serviceDescription', sql.NVarChar, ServiceDescription);
    }
    
    if (Amount !== undefined) {
      updates.push('Amount = @amount');
      request.input('amount', sql.Decimal(18, 2), Amount);
    }
    
    
    const updateQuery = `
      UPDATE Deals 
      SET ${updates.join(', ')} 
      WHERE DealId = @dealId
    `;
    
    console.log(`Updating deal ${dealId} with query:`, updateQuery);
    console.log('Parameters:', { dealId, ServiceDescription, Amount });
    
    const result = await request.query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Fetch the updated deal to return
    const updatedDealQuery = `
      SELECT DealId, ServiceDescription, Amount
      FROM Deals 
      WHERE DealId = @dealId
    `;
    
    const updatedResult = await pool.request()
      .input('dealId', sql.Int, dealId)
      .query(updatedDealQuery);
    
    console.log(`Deal ${dealId} updated successfully`);
    
    res.json({
      success: true,
      deal: updatedResult.recordset[0]
    });
    
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal', details: error.message });
  }
});

module.exports = router;