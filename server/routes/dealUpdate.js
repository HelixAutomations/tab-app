const express = require('express');
const { getSecret } = require('../utils/getSecret');
const sql = require('mssql');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.payments.child('DealUpdate');

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
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    
    const result = await pool.request().query('SELECT TOP 10 DealId, ServiceDescription, Amount FROM Deals ORDER BY DealId DESC');
    
    res.json({ deals: result.recordset });
  } catch (error) {
    log.fail('deals:list', error, {});
    res.status(500).json({ error: 'Failed to list deals' });
  }
});

// Close deal when matter is opened
router.post('/close-by-instruction', async (req, res) => {
  const { instructionRef } = req.body;
  
  if (!instructionRef) {
    return res.status(400).json({ error: 'instructionRef is required' });
  }

  try {
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    
    const now = new Date();
    const updateQuery = `
      UPDATE Deals 
      SET Status = @status,
          CloseDate = @closeDate,
          CloseTime = @closeTime
      WHERE InstructionRef = @instructionRef
    `;
    
    const result = await pool.request()
      .input('status', sql.NVarChar, 'closed')
      .input('closeDate', sql.Date, now)
      .input('closeTime', sql.Time, now)
      .input('instructionRef', sql.NVarChar, instructionRef)
      .query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No deal found for this instruction reference' 
      });
    }
    
    log.op('deal:closed', { instructionRef });
    
    res.json({
      success: true,
      message: 'Deal closed successfully',
      instructionRef
    });
    
  } catch (error) {
    log.fail('deal:close', error, { instructionRef });
    res.status(500).json({ error: 'Failed to close deal', details: error.message });
  }
});

// Update deal endpoint
router.put('/:dealId', async (req, res) => {
  const dealId = parseInt(req.params.dealId);
  const { ServiceDescription, Amount } = req.body;
  
  if (!dealId || (!ServiceDescription && Amount === undefined)) {
    return res.status(400).json({ error: 'Deal ID and at least one field to update are required' });
  }

  try {
    const config = await getDbConfig();
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
    
    log.op('deal:updated', { dealId, ServiceDescription, Amount });
    
    res.json({
      success: true,
      deal: updatedResult.recordset[0]
    });
    
  } catch (error) {
    log.fail('deal:update', error, { dealId });
    res.status(500).json({ error: 'Failed to update deal', details: error.message });
  }
});

module.exports = router;