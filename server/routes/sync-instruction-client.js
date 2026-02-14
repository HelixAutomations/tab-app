const express = require('express');
const router = express.Router();
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

/**
 * Sync Instruction Client API
 * Updates Instructions.ClientId when clients are linked through matter opening workflow
 */

// Database connection for Instructions
const getInstrConnStr = () => {
  const cs = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!cs) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  return cs;
};

/**
 * Update Instructions.ClientId when a client is linked to a matter
 * POST /api/sync-instruction-client/link-client
 */
router.post('/link-client', async (req, res) => {
  const startTime = Date.now();
  try {
    const { instructionRef, clientId, matterId } = req.body;
    const traceId = req.headers['x-matter-trace-id'] || '';
    trackEvent('MatterOpening.SyncInstructionClient.Started', {
      operation: 'link-client',
      instructionRef: String(instructionRef || ''),
      clientId: String(clientId || ''),
      matterId: String(matterId || ''),
      traceId: String(traceId || ''),
    });
    
    if (!instructionRef || !clientId) {
      trackEvent('MatterOpening.SyncInstructionClient.ValidationFailed', {
        operation: 'link-client',
        reason: 'Instruction reference and client ID are required',
        traceId: String(traceId || ''),
      });
      return res.status(400).json({ 
        error: 'Instruction reference and client ID are required' 
      });
    }
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      // Update Instructions table with client and matter info
      return await request
        .input('instructionRef', sql.NVarChar, instructionRef)
        .input('clientId', sql.NVarChar, clientId)
        .input('matterId', sql.NVarChar, matterId || null)
        .query(`
          UPDATE Instructions 
          SET 
            ClientId = @clientId,
            MatterId = @matterId
          WHERE InstructionRef = @instructionRef
        `);
    });
    
    if (result.rowsAffected[0] === 0) {
      trackEvent('MatterOpening.SyncInstructionClient.NotFound', {
        operation: 'link-client',
        instructionRef: String(instructionRef || ''),
        traceId: String(traceId || ''),
      });
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const durationMs = Date.now() - startTime;
    trackEvent('MatterOpening.SyncInstructionClient.Completed', {
      operation: 'link-client',
      instructionRef: String(instructionRef || ''),
      clientId: String(clientId || ''),
      matterId: String(matterId || ''),
      rowsAffected: String(result.rowsAffected[0] || 0),
      durationMs: String(durationMs),
      traceId: String(traceId || ''),
    });
    trackMetric('MatterOpening.SyncInstructionClient.Duration', durationMs, {
      operation: 'link-client',
      instructionRef: String(instructionRef || ''),
    });
    
    res.json({
      success: true,
      message: 'Client linked to instruction successfully',
      instructionRef,
      clientId,
      matterId,
      rowsAffected: result.rowsAffected[0]
    });
    
  } catch (error) {
    console.error('Error linking client to instruction:', error);
    const traceId = req.headers['x-matter-trace-id'] || '';
    trackException(error, {
      component: 'MatterOpening',
      operation: 'SyncInstructionClient.link-client',
      traceId: String(traceId || ''),
    });
    trackEvent('MatterOpening.SyncInstructionClient.Failed', {
      operation: 'link-client',
      error: String(error.message || error),
      durationMs: String(Date.now() - startTime),
      traceId: String(traceId || ''),
    });
    res.status(500).json({ 
      error: 'Failed to link client to instruction',
      details: error.message 
    });
  }
});

/**
 * Update Instructions.MatterId when a matter is created
 * POST /api/sync-instruction-client/link-matter
 */
router.post('/link-matter', async (req, res) => {
  const startTime = Date.now();
  try {
    const { instructionRef, matterId } = req.body;
    const traceId = req.headers['x-matter-trace-id'] || '';
    trackEvent('MatterOpening.SyncInstructionClient.Started', {
      operation: 'link-matter',
      instructionRef: String(instructionRef || ''),
      matterId: String(matterId || ''),
      traceId: String(traceId || ''),
    });
    
    if (!instructionRef || !matterId) {
      trackEvent('MatterOpening.SyncInstructionClient.ValidationFailed', {
        operation: 'link-matter',
        reason: 'Instruction reference and matter ID are required',
        traceId: String(traceId || ''),
      });
      return res.status(400).json({ 
        error: 'Instruction reference and matter ID are required' 
      });
    }
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return await request
        .input('instructionRef', sql.NVarChar, instructionRef)
        .input('matterId', sql.NVarChar, matterId)
        .query(`
          UPDATE Instructions 
          SET MatterId = @matterId
          WHERE InstructionRef = @instructionRef
        `);
    });
    
    if (result.rowsAffected[0] === 0) {
      trackEvent('MatterOpening.SyncInstructionClient.NotFound', {
        operation: 'link-matter',
        instructionRef: String(instructionRef || ''),
        traceId: String(traceId || ''),
      });
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const durationMs = Date.now() - startTime;
    trackEvent('MatterOpening.SyncInstructionClient.Completed', {
      operation: 'link-matter',
      instructionRef: String(instructionRef || ''),
      matterId: String(matterId || ''),
      rowsAffected: String(result.rowsAffected[0] || 0),
      durationMs: String(durationMs),
      traceId: String(traceId || ''),
    });
    trackMetric('MatterOpening.SyncInstructionClient.Duration', durationMs, {
      operation: 'link-matter',
      instructionRef: String(instructionRef || ''),
    });
    
    res.json({
      success: true,
      message: 'Matter linked to instruction successfully',
      instructionRef,
      matterId,
      rowsAffected: result.rowsAffected[0]
    });
    
  } catch (error) {
    console.error('Error linking matter to instruction:', error);
    const traceId = req.headers['x-matter-trace-id'] || '';
    trackException(error, {
      component: 'MatterOpening',
      operation: 'SyncInstructionClient.link-matter',
      traceId: String(traceId || ''),
    });
    trackEvent('MatterOpening.SyncInstructionClient.Failed', {
      operation: 'link-matter',
      error: String(error.message || error),
      durationMs: String(Date.now() - startTime),
      traceId: String(traceId || ''),
    });
    res.status(500).json({ 
      error: 'Failed to link matter to instruction',
      details: error.message 
    });
  }
});

/**
 * Get current sync status for an instruction
 * GET /api/sync-instruction-client/status/:instructionRef
 */
router.get('/status/:instructionRef', async (req, res) => {
  try {
    const { instructionRef } = req.params;
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return await request
        .input('instructionRef', sql.NVarChar, instructionRef)
        .query(`
          SELECT 
            InstructionRef,
            ClientId,
            MatterId,
            RelatedClientId,
            CASE 
              WHEN FirstName IS NOT NULL AND LastName IS NOT NULL 
              THEN CONCAT(FirstName, ' ', LastName)
              ELSE CompanyName
            END as ClientName
          FROM Instructions 
          WHERE InstructionRef = @instructionRef
        `);
    });
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }
    
    const instruction = result.recordset[0];
    
    res.json({
      success: true,
      instruction,
      status: {
        hasClientId: !!instruction.ClientId,
        hasMatterId: !!instruction.MatterId,
        hasRelatedClientIds: !!instruction.RelatedClientId,
        needsSync: !instruction.ClientId || !instruction.MatterId
      }
    });
    
  } catch (error) {
    console.error('Error getting instruction sync status:', error);
    res.status(500).json({ 
      error: 'Failed to get instruction sync status',
      details: error.message 
    });
  }
});

/**
 * Bulk sync - find instructions that need client/matter linking
 * GET /api/sync-instruction-client/audit
 */
router.get('/audit', async (req, res) => {
  try {
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return await request.query(`
        SELECT 
          InstructionRef,
          ClientId,
          MatterId,
          RelatedClientId,
          CASE 
            WHEN FirstName IS NOT NULL AND LastName IS NOT NULL 
            THEN CONCAT(FirstName, ' ', LastName)
            ELSE CompanyName
          END as ClientName,
          SubmissionDate
        FROM Instructions 
        WHERE 
          ClientId IS NULL 
          OR MatterId IS NULL
        ORDER BY SubmissionDate DESC
      `);
    });
    
    const needsSync = result.recordset;
    const stats = {
      totalNeedingSync: needsSync.length,
      missingClientId: needsSync.filter(i => !i.ClientId).length,
      missingMatterId: needsSync.filter(i => !i.MatterId).length,
      missingBoth: needsSync.filter(i => !i.ClientId && !i.MatterId).length
    };
    
    res.json({
      success: true,
      statistics: stats,
      instructions: needsSync.slice(0, 20) // Return first 20 for review
    });
    
  } catch (error) {
    console.error('Error auditing instruction sync status:', error);
    res.status(500).json({ 
      error: 'Failed to audit instruction sync status',
      details: error.message 
    });
  }
});

module.exports = router;