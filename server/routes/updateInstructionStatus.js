const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const router = express.Router();

const getInstrConnStr = () => {
  const s = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!s) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return s;
};

// Update instruction status endpoint
router.post('/', async (req, res) => {
  const { instructionRef, stage, internalStatus, overrideReason, userInitials } = req.body;
  
  if (!instructionRef || (!stage && !internalStatus)) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing instructionRef or status fields in request body' 
    });
  }

  try {
    // Build dynamic update query based on provided fields
    const updates = [];
    const inputs = [['instructionRef', sql.NVarChar, instructionRef]];
    
    if (stage) {
      updates.push('Stage = @stage');
      inputs.push(['stage', sql.NVarChar, stage]);
    }
    
    if (internalStatus) {
      updates.push('InternalStatus = @internalStatus');
      inputs.push(['internalStatus', sql.NVarChar, internalStatus]);
    }
    
    if (overrideReason) {
      updates.push('OverrideReason = @overrideReason');
      inputs.push(['overrideReason', sql.NVarChar, overrideReason]);
    }
    
    if (userInitials) {
      updates.push('LastModifiedBy = @userInitials');
      inputs.push(['userInitials', sql.NVarChar, userInitials]);
    }
    
    // Always update LastUpdated
    updates.push('LastUpdated = @lastUpdated');
    inputs.push(['lastUpdated', sql.DateTime2, new Date()]);
    
    const updateQuery = `
      UPDATE Instructions 
      SET ${updates.join(', ')} 
      WHERE InstructionRef = @instructionRef
    `;
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      for (const [name, type, val] of inputs) request.input(name, type, val);
      return request.query(updateQuery);
    });
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'No instruction found with the provided reference' 
      });
    }
    
    // If the stage is "matter opened", close the corresponding deal
    if (stage === "matter opened") {
      try {
        const dealResponse = await fetch(`http://localhost:${process.env.PORT || 8080}/api/deals/close-by-instruction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ instructionRef })
        });
        
        if (!dealResponse.ok) {
          console.warn('[updateInstructionStatus] Failed to close deal, but instruction was updated');
        }
      } catch (dealError) {
        console.error('[updateInstructionStatus] Error closing deal:', dealError);
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
