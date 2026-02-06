const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const router = express.Router();

// Database connection (shared pool)
const getInstrConnStr = () => {
  const cs = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!cs) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  return cs;
};

const TRANSIENT_SQL_CODES = new Set(['ESOCKET', 'ECONNCLOSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT']);
const DEFAULT_MAX_RETRIES = Number(process.env.SQL_INSTRUCTIONS_MAX_RETRIES || 4);

const instructionsQuery = (executor, retries = DEFAULT_MAX_RETRIES) =>
  withRequest(getInstrConnStr(), executor, retries);

const groupByKey = (rows, key) => {
  const map = new Map();
  for (const row of rows || []) {
    const value = row[key];
    if (!map.has(value)) {
      map.set(value, []);
    }
    map.get(value).push(row);
  }
  return map;
};

const createInClause = (values, prefix) => {
  const clauseParts = values.map((_, index) => `@${prefix}${index}`);
  const clause = clauseParts.join(', ');
  const bind = (request, type) => {
    values.forEach((value, index) => {
      request.input(`${prefix}${index}`, type, value);
    });
  };
  return { clause, bind };
};

const isTransientSqlError = (error) => {
  const code = error?.code || error?.originalError?.code || error?.cause?.code;
  if (code && TRANSIENT_SQL_CODES.has(String(code))) {
    return true;
  }
  const message = error?.message || error?.originalError?.message || '';
  return typeof message === 'string' && /ECONNRESET|ECONNCLOSED|ETIMEOUT|ETIMEDOUT/i.test(message);
};

const buildTransientFallback = (requestId, detail) => ({
  error: 'Failed to fetch instruction data from database',
  detail,
  instructions: [],
  deals: [],
  deal: null,
  instruction: null,
  idVerifications: [],
  documents: [],
  count: 0,
  computedServerSide: true,
  directDatabase: true,
  requestId,
  timestamp: new Date().toISOString(),
  transient: true
});

const runQuery = (builder, retries) =>
  instructionsQuery((request, s) => builder(request, s), retries);

// Generate unique request ID for logging
function generateRequestId() {
  return Math.random().toString(36).substring(2, 10);
}

// Test direct database connection
router.get('/test-db', async (req, res) => {
  const requestId = generateRequestId();
  // Testing direct database connection

  try {
    const result = await runQuery((request) =>
      request.query('SELECT TOP 3 DealId, ProspectId, ServiceDescription, InstructionRef FROM Deals ORDER BY DealId DESC')
    );

    res.json({
      status: 'success',
      message: 'Direct database connection working!',
      data: {
        rowCount: result.recordset.length,
        sampleDeals: result.recordset,
        connectionInfo: {
          // Avoid leaking full connection details; basic signal only
          pooled: true
        }
      },
      requestId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${requestId}] Database test failed`, error);
    res.status(500).json({
      status: 'error',
      message: 'Direct database connection failed',
      error: error.message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  const requestId = generateRequestId();
  // Instructions route
  
  res.json({
    status: 'success',
    message: 'Instructions route is working!',
    timestamp: new Date().toISOString(),
    endpoint: '/api/instructions'
  });
});

// Main instructions endpoint - direct database access
router.get('/', async (req, res) => {
  const requestId = generateRequestId();
  // Instructions request (direct DB)

  // Handle deal update via query parameters (workaround for route issues)
  if (req.query.updateDeal && req.query.dealId) {
    // Deal update via query
    try {
      const dealId = parseInt(req.query.dealId);
      const updates = JSON.parse(req.query.updates || '{}');
      if (!Number.isFinite(dealId)) {
        return res.status(400).json({ error: 'Invalid deal id', requestId });
      }

      const updateParts = [];
      const inputs = [];

      if (updates.ServiceDescription !== undefined) {
        updateParts.push('ServiceDescription = @serviceDescription');
        inputs.push({ name: 'serviceDescription', type: sql.NVarChar, value: updates.ServiceDescription });
      }

      if (updates.Amount !== undefined) {
        updateParts.push('Amount = @amount');
        inputs.push({ name: 'amount', type: sql.Decimal(18, 2), value: updates.Amount });
      }

      if (updateParts.length === 0) {
        return res.status(400).json({ error: 'No fields provided to update', requestId });
      }

      const updateQuery = `UPDATE Deals SET ${updateParts.join(', ')} WHERE DealId = @dealId`;

      const result = await runQuery((request, s) => {
        request.input('dealId', s.Int, dealId);
        inputs.forEach(({ name, type, value }) => request.input(name, type, value));
        return request.query(updateQuery);
      });

      if (!result?.rowsAffected?.[0]) {
        return res.status(404).json({ error: 'Deal not found', requestId });
      }

      const updatedDeal = await runQuery((request, s) =>
        request.input('dealId', s.Int, dealId)
          .query(`
            SELECT DealId, ServiceDescription, Amount, UpdatedAt 
            FROM Deals 
            WHERE DealId = @dealId
          `)
      );

      return res.json({
        success: true,
        updated: true,
        dealId,
        deal: updatedDeal.recordset?.[0] || null,
        requestId
      });
      
    } catch (error) {
      console.error(`[${requestId}] ❌ Update error`, error);
      return res.status(500).json({ error: 'Update failed', details: error.message, requestId });
    }
  }

  try {
    const initials = req.query.initials;
    const prospectId = req.query.prospectId && Number(req.query.prospectId);
    const instructionRef = req.query.instructionRef;
    const dealId = req.query.dealId && Number(req.query.dealId);

    // Query params processed

    // ─── Deals pitched by this user with related data ────────────────────
    let deals = [];
    if (initials) {
      const dealsResult = await runQuery((request, s) =>
        request.input('initials', s.NVarChar, initials)
          .query('SELECT * FROM Deals WHERE PitchedBy=@initials ORDER BY DealId DESC')
      );
      deals = dealsResult.recordset || [];
    } else {
      const dealsResult = await runQuery((request) =>
        request.query('SELECT * FROM Deals ORDER BY DealId DESC')
      );
      deals = dealsResult.recordset || [];
    }

    // ─── Single deal by ID when requested ───────────────────────────────
    let deal = null;
    if (dealId != null) {
      const dealRes = await runQuery((request, s) =>
        request.input('dealId', s.Int, dealId)
          .query('SELECT * FROM Deals WHERE DealId=@dealId')
      );
      deal = dealRes.recordset[0] || null;
    }

    // ─── Instructions for this user ──────────────────────────────────────
    let instructions = [];
    if (initials) {
      const instrResult = await runQuery((request, s) =>
        request.input('initials', s.NVarChar, initials)
          .query('SELECT * FROM Instructions WHERE HelixContact=@initials ORDER BY InstructionRef DESC')
      );
      instructions = instrResult.recordset || [];
    } else {
      const instrResult = await runQuery((request) =>
        request.query('SELECT * FROM Instructions ORDER BY InstructionRef DESC')
      );
      instructions = instrResult.recordset || [];
    }

    let instruction = null;
    if (instructionRef) {
      const instRes = await runQuery((request, s) =>
        request.input('ref', s.NVarChar, instructionRef)
          .query('SELECT * FROM Instructions WHERE InstructionRef=@ref')
      );
      instruction = instRes.recordset[0] || null;
    }

    const instructionRefsSet = new Set();
    const dealIdsSet = new Set();

    const trackInstructionRef = (ref) => {
      if (ref) {
        instructionRefsSet.add(ref);
      }
    };

    const trackDealId = (id) => {
      if (Number.isFinite(id)) {
        dealIdsSet.add(id);
      }
    };

    deals.forEach((dealItem) => {
      trackInstructionRef(dealItem.InstructionRef);
      trackDealId(dealItem.DealId);
    });

    if (deal) {
      trackInstructionRef(deal.InstructionRef);
      trackDealId(deal.DealId);
    }

    instructions.forEach((inst) => trackInstructionRef(inst.InstructionRef));

    if (instructionRef) {
      trackInstructionRef(instructionRef);
    }

    const instructionRefs = Array.from(instructionRefsSet);
    const dealIds = Array.from(dealIdsSet);
    const emptyRecordset = { recordset: [] };

    const [
      documentsResult,
      idVerificationsResult,
      riskAssessmentsResult,
      paymentsResult,
      mattersResult,
      dealsForInstructionsResult,
      jointClientsResult,
      pitchContentResult
    ] = await Promise.all([
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'docRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM Documents WHERE InstructionRef IN (${clause}) ORDER BY DocumentId`);
          })
        : Promise.resolve(emptyRecordset),
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'idRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM IDVerifications WHERE InstructionRef IN (${clause}) ORDER BY InternalId DESC`);
          })
        : Promise.resolve(emptyRecordset),
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'riskRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM RiskAssessment WHERE InstructionRef IN (${clause}) ORDER BY ComplianceDate DESC`);
          })
        : Promise.resolve(emptyRecordset),
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'payRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM Payments WHERE instruction_ref IN (${clause}) ORDER BY created_at DESC`);
          })
        : Promise.resolve(emptyRecordset),
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'matterRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM Matters WHERE InstructionRef IN (${clause}) ORDER BY OpenDate DESC`);
          })
        : Promise.resolve(emptyRecordset),
      instructionRefs.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(instructionRefs, 'dealRef');
            bind(request, s.NVarChar);
            return request.query(`SELECT * FROM Deals WHERE InstructionRef IN (${clause})`);
          })
        : Promise.resolve(emptyRecordset),
      dealIds.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(dealIds, 'jointDeal');
            bind(request, s.Int);
            return request.query(`SELECT * FROM DealJointClients WHERE DealId IN (${clause}) ORDER BY DealJointClientId`);
          })
        : Promise.resolve(emptyRecordset),
      dealIds.length
        ? runQuery((request, s) => {
            const { clause, bind } = createInClause(dealIds, 'pitchDeal');
            bind(request, s.Int);
            return request.query(`SELECT * FROM PitchContent WHERE DealId IN (${clause}) ORDER BY CreatedAt DESC`);
          })
        : Promise.resolve(emptyRecordset)
    ]);

    const documentsByRef = groupByKey(documentsResult.recordset, 'InstructionRef');
    const idVerificationsByRef = groupByKey(idVerificationsResult.recordset, 'InstructionRef');
    const riskAssessmentsByRef = groupByKey(riskAssessmentsResult.recordset, 'InstructionRef');
    const paymentsByRef = groupByKey(paymentsResult.recordset, 'instruction_ref');
    const mattersByRef = groupByKey(mattersResult.recordset, 'InstructionRef');
    const jointClientsByDeal = groupByKey(jointClientsResult.recordset, 'DealId');
    const pitchContentByDeal = groupByKey(pitchContentResult.recordset, 'DealId');

    const dealsCatalog = new Map();
    for (const dealItem of deals) {
      if (Number.isFinite(dealItem.DealId)) {
        dealsCatalog.set(dealItem.DealId, dealItem);
      }
    }
    if (deal && Number.isFinite(deal.DealId)) {
      dealsCatalog.set(deal.DealId, deal);
    }
    for (const fetchedDeal of dealsForInstructionsResult.recordset || []) {
      if (Number.isFinite(fetchedDeal.DealId) && !dealsCatalog.has(fetchedDeal.DealId)) {
        dealsCatalog.set(fetchedDeal.DealId, fetchedDeal);
      }
    }

    const enrichDeal = (dealItem) => {
      if (!dealItem || !Number.isFinite(dealItem.DealId)) {
        return;
      }
      dealItem.jointClients = jointClientsByDeal.get(dealItem.DealId) || [];
      // Attach pitch content if available (take most recent)
      const pitchContents = pitchContentByDeal.get(dealItem.DealId) || [];
      dealItem.pitchContent = pitchContents.length > 0 ? pitchContents[0] : null;
    };

    dealsCatalog.forEach(enrichDeal);

    if (deal && Number.isFinite(deal.DealId)) {
      deal = dealsCatalog.get(deal.DealId) || deal;
    }

    const dealsByInstruction = groupByKey(Array.from(dealsCatalog.values()), 'InstructionRef');

    const attachInstructionAggregates = (inst) => {
      if (!inst || !inst.InstructionRef) {
        return;
      }
      const ref = inst.InstructionRef;
      inst.documents = documentsByRef.get(ref) || [];
      inst.idVerifications = idVerificationsByRef.get(ref) || [];
      inst.riskAssessments = riskAssessmentsByRef.get(ref) || [];
      inst.payments = paymentsByRef.get(ref) || [];
      const matters = mattersByRef.get(ref) || [];
      if (matters.length) {
        inst.MatterId = inst.MatterId ?? matters[0].MatterID;
        inst.DisplayNumber = inst.DisplayNumber ?? matters[0].DisplayNumber;
        inst.matters = matters;
      } else {
        inst.matters = inst.matters || [];
      }
      const relatedDeals = dealsByInstruction.get(ref) || [];
      if (relatedDeals.length) {
        const primaryDeal = relatedDeals[0];
        enrichDeal(primaryDeal);
        inst.deal = primaryDeal;
      } else if (!inst.deal) {
        inst.deal = null;
      }
    };

    const allIdVerifications = [];

    instructions.forEach((inst) => {
      attachInstructionAggregates(inst);
      allIdVerifications.push(...inst.idVerifications);
    });

    if (instruction) {
      const existingInstruction = instructions.find((inst) => inst.InstructionRef === instruction.InstructionRef);
      if (existingInstruction) {
        instruction = existingInstruction;
      }
      attachInstructionAggregates(instruction);
    }

    if (deal && Number.isFinite(deal.DealId)) {
      enrichDeal(deal);
    }

    // ─── ID verifications by ProspectId or instruction refs ─────────────
    let idVerifications = [];
    if (prospectId != null) {
      const riskRes = await runQuery((request, s) =>
        request.input('pid', s.Int, prospectId)
          .query('SELECT * FROM IDVerifications WHERE ProspectId=@pid ORDER BY InternalId DESC')
      );
      idVerifications = riskRes.recordset || [];
    } else if (initials) {
      idVerifications = allIdVerifications;
    } else {
      idVerifications = idVerificationsResult.recordset || [];
    }

    // ─── Documents by instruction ref when requested ────────────────────
    let documents = [];
    if (instructionRef && !instruction) {
      documents = documentsByRef.get(instructionRef) || [];
    } else if (!instructionRef) {
      documents = documentsResult.recordset || [];
    }

    // Instruction data fetched

    // Transform the data to match frontend expectations
    // The frontend expects all items in a single 'instructions' array
    const transformedInstructions = [];
    
    // Add real instructions to the array
    instructions.forEach(inst => {
      transformedInstructions.push({
        ...inst,
        isRealInstruction: true,
        deal: inst.deal || null,
        documents: inst.documents || [],
        idVerifications: inst.idVerifications || [],
        riskAssessments: inst.riskAssessments || [],
        payments: inst.payments || []
      });
    });
    
    // Add standalone deals (deals without instructions) to the same array
    const standaloneDeals = deals.filter(deal => {
      // Only include deals that don't have a corresponding instruction
      const hasInstruction = deal.InstructionRef && instructions.some(inst => inst.InstructionRef === deal.InstructionRef);
      return !hasInstruction;
    });
    
    standaloneDeals.forEach(deal => {
      transformedInstructions.push({
        // Preserve original InstructionRef if present, fallback to deal ID pattern
        InstructionRef: deal.InstructionRef || `deal-${deal.DealId}`,
        isRealInstruction: false,
        deal: deal,
        documents: [],
        idVerifications: [],
        riskAssessments: [],
        payments: []
      });
    });

    // Transformed data prepared

    const transformedData = {
      instructions: transformedInstructions, // All items in single array as expected by frontend
      deals,
      deal,
      instruction,
      idVerifications,
      documents,
      count: transformedInstructions.length,
      computedServerSide: true,
      directDatabase: true,
      requestId,
      timestamp: new Date().toISOString()
    };

    res.json(transformedData);

  } catch (error) {
    const transient = isTransientSqlError(error);
    console.error(
      `[${requestId}] Direct database instruction fetch failed${transient ? ' (transient)' : ''}`,
      error
    );
    if (transient) {
      res.status(503).json(buildTransientFallback(requestId, error.message));
      return;
    }

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

// Test endpoint to verify routes are working
router.get('/test-route', async (req, res) => {
  const requestId = generateRequestId();
  // Test route hit
  res.json({ message: 'Route is working', requestId, timestamp: new Date().toISOString() });
});

// Update deal endpoint - Added for deal editing functionality
router.put('/deals/:dealId', async (req, res) => {
  const requestId = generateRequestId();
  const dealId = parseInt(req.params.dealId);
  const { ServiceDescription, Amount } = req.body;
  
  // Deal update request
  
  if (!dealId || (!ServiceDescription && Amount === undefined)) {
    return res.status(400).json({ error: 'Deal ID and at least one field to update are required', requestId });
  }

  try {
    // Build dynamic update query based on provided fields
    const updates = [];
    if (ServiceDescription !== undefined) {
      updates.push('ServiceDescription = @serviceDescription');
    }
    
    if (Amount !== undefined) {
      updates.push('Amount = @amount');
    }
    
    // Add updated timestamp
    updates.push('UpdatedAt = GETDATE()');
    
    const updateQuery = `
      UPDATE Deals 
      SET ${updates.join(', ')} 
      WHERE DealId = @dealId
    `;
    
    const result = await runQuery((request, s) => {
      request.input('dealId', s.Int, dealId);
      if (ServiceDescription !== undefined) {
        request.input('serviceDescription', s.NVarChar, ServiceDescription);
      }
      if (Amount !== undefined) {
        request.input('amount', s.Decimal(18, 2), Amount);
      }
      return request.query(updateQuery);
    });
    
    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ error: 'Deal not found', requestId });
    }
    
    // Fetch the updated deal to return
    const updatedDealQuery = `
      SELECT DealId, ServiceDescription, Amount, UpdatedAt 
      FROM Deals 
      WHERE DealId = @dealId
    `;
    
    const updatedResult = await runQuery((request, s) =>
      request.input('dealId', s.Int, dealId)
        .query(updatedDealQuery)
    );
    
    
    res.json({
      success: true,
      deal: updatedResult.recordset[0],
      requestId
    });
    
  } catch (error) {
    const transient = isTransientSqlError(error);
    console.error(`[${requestId}] ❌ Error updating deal${transient ? ' (transient)' : ''}`, error);
    res.status(transient ? 503 : 500).json({
      error: 'Failed to update deal',
      details: error.message,
      transient,
      requestId
    });
  }
});

// Update instruction endpoint - for inline editing of identity fields
router.patch('/:instructionRef', async (req, res) => {
  const requestId = generateRequestId();
  const { instructionRef } = req.params;
  const updates = req.body;
  
  console.log(`[${requestId}] PATCH instruction update for ${instructionRef}:`, updates);
  
  if (!instructionRef || !updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ 
      error: 'Instruction reference and at least one field to update are required', 
      requestId 
    });
  }

  try {
    // Build dynamic update query based on provided fields
    const updateParts = [];
    const validFields = [
      'Title', 'FirstName', 'LastName', 'Email', 'Phone', 'Gender', 'Nationality',
      'PassportNumber', 'DriversLicenseNumber', 'NationalIdNumber', 'Country',
      'ClientType', 'CompanyName', 'CompanyNumber', 'CompanyCountry'
    ];
    
    const inputParams = [];
    
    Object.keys(updates).forEach((field, index) => {
      if (validFields.includes(field)) {
        updateParts.push(`${field} = @field${index}`);
        inputParams.push({ name: `field${index}`, value: updates[field] });
      }
    });
    
    if (updateParts.length === 0) {
      return res.status(400).json({ 
        error: 'No valid fields provided for update', 
        validFields,
        requestId 
      });
    }
    
    const updateQuery = `
      UPDATE Instructions 
      SET ${updateParts.join(', ')} 
      WHERE InstructionRef = @instructionRef
    `;
    
    console.log(`[${requestId}] Executing update query:`, updateQuery);
    
    const result = await runQuery((request, s) => {
      request.input('instructionRef', s.NVarChar, instructionRef);
      inputParams.forEach(({ name, value }) => {
        request.input(name, s.NVarChar, value);
      });
      return request.query(updateQuery);
    });
    
    if (!result.rowsAffected?.[0]) {
      console.log(`[${requestId}] Instruction not found: ${instructionRef}`);
      return res.status(404).json({ error: 'Instruction not found', requestId });
    }
    
    // Fetch the updated instruction to return
    const updatedResult = await runQuery((request, s) =>
      request.input('instructionRef', s.NVarChar, instructionRef)
        .query('SELECT * FROM Instructions WHERE InstructionRef = @instructionRef')
    );
    
    console.log(`[${requestId}] Successfully updated instruction ${instructionRef}`);
    
    res.json({
      success: true,
      instruction: updatedResult.recordset[0],
      updatedFields: Object.keys(updates),
      requestId
    });
    
  } catch (error) {
    const transient = isTransientSqlError(error);
    console.error(`[${requestId}] ❌ Error updating instruction${transient ? ' (transient)' : ''}`, error);
    res.status(transient ? 503 : 500).json({
      error: 'Failed to update instruction',
      details: error.message,
      transient,
      requestId
    });
  }
});

// ============================================================================
// GET /api/instructions/matters - Fetch all matters from Instructions DB
// Experimental endpoint for v2 matters visualizer
// ============================================================================
router.get('/matters', async (req, res) => {
  const requestId = `instr-matters-${Date.now()}`;
  console.log(`[${requestId}] Fetching all matters from Instructions DB`);
  
  try {
    const runQuery = (executor) => instructionsQuery(executor);
    
    const result = await runQuery((request) =>
      request.query(`
        SELECT 
          MatterID,
          InstructionRef,
          DisplayNumber,
          Status,
          ClientID,
          ClientName,
          OpenDate,
          Description,
          PracticeArea,
          ResponsibleSolicitor,
          OriginatingSolicitor
        FROM Matters
        ORDER BY OpenDate DESC
      `)
    );
    
    const matters = result.recordset || [];
    console.log(`[${requestId}] Retrieved ${matters.length} matters from Instructions DB`);
    
    res.json({
      success: true,
      matters,
      count: matters.length,
      source: 'instructions-db',
      requestId
    });
    
  } catch (error) {
    const transient = isTransientSqlError(error);
    console.error(`[${requestId}] ❌ Error fetching instruction matters${transient ? ' (transient)' : ''}`, error);
    res.status(transient ? 503 : 500).json({
      error: 'Failed to fetch instruction matters',
      details: error.message,
      transient,
      requestId
    });
  }
});

module.exports = router;
