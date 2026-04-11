const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Generate unique request ID for logging
function generateRequestId() {
  return Math.random().toString(36).substring(2, 10);
}

// Test endpoint
router.get('/test', (req, res) => {
  const requestId = generateRequestId();
  console.log(`[${requestId}] Testing instructions route`);
  
  res.json({
    status: 'success',
    message: 'Instructions route is working!',
    timestamp: new Date().toISOString(),
    endpoint: '/api/instructions'
  });
});

// Main instructions endpoint - query database directly
router.get('/', async (req, res) => {
  const requestId = generateRequestId();
  console.log(`[${requestId}] Instructions request:`, {
    query: req.query,
    headers: req.headers['user-agent'],
    ip: req.ip
  });

  try {
    const { initials, prospectId, instructionRef, dealId, includeAll } = req.query;
    
    console.log(`[${requestId}] Connecting to Instructions SQL database...`);
    const pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
    
    // Query deals
    let dealsQuery = `
      SELECT 
        DealId, ProspectId, InstructionRef, ServiceDescription, Status, 
        DeadlineDate, ValueEstimate, CreatedAt, UpdatedAt
      FROM Deals
    `;
    let dealsParams = [];
    
    // Apply filters if provided
    if (dealId) {
      dealsQuery += ` WHERE DealId = @dealId`;
      dealsParams.push({ name: 'dealId', type: sql.Int, value: dealId });
    } else if (prospectId) {
      dealsQuery += ` WHERE ProspectId = @prospectId`;
      dealsParams.push({ name: 'prospectId', type: sql.Int, value: prospectId });
    } else if (instructionRef) {
      dealsQuery += ` WHERE InstructionRef = @instructionRef`;
      dealsParams.push({ name: 'instructionRef', type: sql.NVarChar, value: instructionRef });
    }
    
    dealsQuery += ` ORDER BY DealId DESC`;
    
    console.log(`[${requestId}] Executing deals query:`, dealsQuery);
    
    const dealsRequest = pool.request();
    dealsParams.forEach(param => {
      dealsRequest.input(param.name, param.type, param.value);
    });
    
    const dealsResult = await dealsRequest.query(dealsQuery);
    const deals = dealsResult.recordset;
    
    console.log(`[${requestId}] Found ${deals.length} deals`);
    
    // Query instructions
    let instructionsQuery = `
      SELECT 
        InstructionRef, ProspectId, Stage, Status, ServiceDescription,
        CreatedAt, UpdatedAt
      FROM Instructions
    `;
    let instructionsParams = [];
    
    if (instructionRef) {
      instructionsQuery += ` WHERE InstructionRef = @instructionRef`;
      instructionsParams.push({ name: 'instructionRef', type: sql.NVarChar, value: instructionRef });
    } else if (prospectId) {
      instructionsQuery += ` WHERE ProspectId = @prospectId`;
      instructionsParams.push({ name: 'prospectId', type: sql.Int, value: prospectId });
    }
    
    instructionsQuery += ` ORDER BY CreatedAt DESC`;
    
    console.log(`[${requestId}] Executing instructions query:`, instructionsQuery);
    
    const instructionsRequest = pool.request();
    instructionsParams.forEach(param => {
      instructionsRequest.input(param.name, param.type, param.value);
    });
    
    const instructionsResult = await instructionsRequest.query(instructionsQuery);
    const instructions = instructionsResult.recordset;
    
    console.log(`[${requestId}] Found ${instructions.length} instructions`);
    
    // Query enquiries from instructions database for ProspectId → acid/name lookup
    // Only fetch rows matching the instructions' ProspectIds (avoids full table scan)
    console.log(`[${requestId}] Querying enquiries for name lookup...`);
    const prospectIds = [...new Set(instructions.map(i => i.ProspectId).filter(Boolean))];
    let enquiries = [];
    if (prospectIds.length > 0) {
      // Batch into groups of 500 to stay within SQL parameter limits
      const BATCH = 500;
      for (let i = 0; i < prospectIds.length; i += BATCH) {
        const batch = prospectIds.slice(i, i + BATCH);
        const placeholders = batch.map((_, idx) => `@pid${i + idx}`).join(',');
        const req = pool.request();
        batch.forEach((pid, idx) => req.input(`pid${i + idx}`, sql.Int, pid));
        const r = await req.query(`SELECT id, acid, first, last, email FROM enquiries WHERE id IN (${placeholders})`);
        enquiries.push(...r.recordset);
      }
    }
    
    console.log(`[${requestId}] Found ${enquiries.length} enquiries for lookup`);
    
    // Create lookup map: ProspectId → client name
    const prospectNameMap = new Map();
    enquiries.forEach(enq => {
      if (enq.id) {
        const clientName = [enq.first, enq.last].filter(Boolean).join(' ').trim() || enq.email || `Client ${enq.id}`;
        prospectNameMap.set(enq.id, clientName);
      }
    });
    
    // Transform the data to match what frontend expects
    // Frontend expects all items (both instructions and deals) in the "instructions" array
    
    // Start with real instructions (these take priority)
    const instructionsByRef = new Map();
    instructions.forEach(inst => {
      const dealForInst = deals.find(d => d.InstructionRef === inst.InstructionRef);
      const clientName = prospectNameMap.get(inst.ProspectId) || `Prospect ${inst.ProspectId}`;
      
      instructionsByRef.set(inst.InstructionRef, {
        ...inst,
        deal: dealForInst || null,
        clientName: clientName,
        isRealInstruction: true
      });
    });
    
    // Add deals that don't have corresponding instructions
    deals.forEach(deal => {
      // Check if this deal has a corresponding instruction
      const hasInstruction = deal.InstructionRef && 
                           deal.InstructionRef.trim() !== '' && 
                           instructionsByRef.has(deal.InstructionRef);
      
      if (!hasInstruction) {
        // This deal doesn't have a corresponding instruction yet
        const pseudoInstructionRef = (deal.InstructionRef && deal.InstructionRef.trim() !== '') 
                                   ? deal.InstructionRef 
                                   : `deal-${deal.DealId}`;
        
        if (!instructionsByRef.has(pseudoInstructionRef)) {
          const clientName = prospectNameMap.get(deal.ProspectId) || `Prospect ${deal.ProspectId}`;
          
          instructionsByRef.set(pseudoInstructionRef, {
            InstructionRef: pseudoInstructionRef,
            ProspectId: deal.ProspectId,
            Stage: deal.Status === 'pitched' ? 'pitched' : 'instructed',
            Status: deal.Status,
            ServiceDescription: deal.ServiceDescription,
            CreatedAt: deal.CreatedAt,
            UpdatedAt: deal.UpdatedAt,
            deal: deal,
            clientName: clientName,
            documents: [],
            idVerifications: [],
            riskAssessments: [],
            isRealInstruction: false
          });
        }
      }
    });

    const allInstructions = Array.from(instructionsByRef.values());

    const transformedData = {
      instructions: allInstructions, // All unique items in instructions array as frontend expects
      deals: deals, // Keep separate deals array for backward compatibility
      documents: [], // Empty for now, can be added later if needed
      idVerifications: [], // Empty for now, can be added later if needed
      count: allInstructions.length,
      computedServerSide: true,
      requestId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[${requestId}] Direct DB query success:`, {
      totalInstructionsInResponse: transformedData.instructions.length,
      realInstructions: instructions.length,
      totalDeals: transformedData.deals.length,
      realInstructionsWithDeals: allInstructions.filter(i => i.isRealInstruction).length,
      pitchedDealsOnly: allInstructions.filter(i => !i.isRealInstruction).length,
      enquiriesForLookup: enquiries.length,
      clientNamesResolved: allInstructions.filter(i => i.clientName && !i.clientName.startsWith('Prospect ')).length
    });
    
    res.json(transformedData);
    
  } catch (error) {
    console.log(`[${requestId}] Instructions endpoint error:`, error.message);
    res.status(500).json({
      error: 'Failed to fetch instruction data from database',
      detail: error.message,
      instructions: [],
      deals: [],
      count: 0,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

module.exports = router;
