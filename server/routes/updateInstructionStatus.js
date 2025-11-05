const express = require('express');
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

// Update instruction status endpoint
router.post('/', async (req, res) => {
  const { instructionRef, stage, internalStatus, overrideReason, userInitials } = req.body;
  
  console.log(`🎯 UPDATE INSTRUCTION STATUS - Ref: ${instructionRef}, Stage: ${stage}, InternalStatus: ${internalStatus}`);
  
  if (!instructionRef || (!stage && !internalStatus)) {
    console.log('❌ Bad request - missing required fields');
    return res.status(400).json({ 
      success: false,
      error: 'Missing instructionRef or status fields in request body' 
    });
  }

  try {
    console.log('🔗 Getting database configuration...');
    const config = await getDbConfig();
    console.log('🔗 Connecting to database...');
    const pool = await sql.connect(config);
    
    // Build dynamic update query based on provided fields
    const updates = [];
    const request = pool.request().input('instructionRef', sql.NVarChar, instructionRef);
    
    if (stage) {
      updates.push('Stage = @stage');
      request.input('stage', sql.NVarChar, stage);
    }
    
    if (internalStatus) {
      updates.push('InternalStatus = @internalStatus');
      request.input('internalStatus', sql.NVarChar, internalStatus);
    }
    
    if (overrideReason) {
      updates.push('OverrideReason = @overrideReason');
      request.input('overrideReason', sql.NVarChar, overrideReason);
    }
    
    if (userInitials) {
      updates.push('LastModifiedBy = @userInitials');
      request.input('userInitials', sql.NVarChar, userInitials);
    }
    
    // Always update LastUpdated
    updates.push('LastUpdated = @lastUpdated');
    request.input('lastUpdated', sql.DateTime2, new Date());
    
    const updateQuery = `
      UPDATE Instructions 
      SET ${updates.join(', ')} 
      WHERE InstructionRef = @instructionRef
    `;
    
    console.log(`Updating instruction ${instructionRef}...`);
    
    const result = await request.query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'No instruction found with the provided reference' 
      });
    }
    
    console.log(`✅ Instruction ${instructionRef} updated successfully`);
    
    // If the stage is "matter opened", close the corresponding deal
    if (stage === "matter opened") {
      console.log('📊 Matter opened - closing corresponding deal...');
      try {
        const dealResponse = await fetch(`http://localhost:${process.env.PORT || 8080}/api/deals/close-by-instruction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ instructionRef })
        });
        
        if (dealResponse.ok) {
          console.log('✅ Deal closed successfully');
        } else {
          console.warn('⚠️ Failed to close deal, but instruction was updated');
        }
      } catch (dealError) {
        console.error('❌ Error closing deal:', dealError);
        // Don't fail the whole request if deal update fails
      }
    }
    
    res.json({
      success: true,
      message: 'Instruction status updated successfully',
      instructionRef,
      stage,
      internalStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error updating instruction status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update instruction status', 
      details: error.message 
    });
  }
});

module.exports = router;
