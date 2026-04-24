const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { notify } = require('../utils/hubNotifier');
const { broadcastMattersChanged } = require('../utils/matters-stream');

/**
 * Matter Operations API Routes
 * Handles matter creation, updates, client linking, and management
 */

// Database connection configuration - use the same connection string as instructions
const getInstrConnStr = () => {
  const cs = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!cs) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  return cs;
};

/**
 * Get matter details by instruction reference
 */
router.get('/matter/:instructionRef', async (req, res) => {
  try {
    const { instructionRef } = req.params;
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return await request
        .input('instructionRef', sql.NVarChar, instructionRef)
        .query(`
          SELECT 
            CASE WHEN MatterId IS NOT NULL THEN MatterId ELSE 'NO_MATTER' END as MatterID,
            InstructionRef,
            CASE WHEN MatterId IS NOT NULL THEN 'Open' ELSE 'Not Created' END as Status,
            SubmissionDate as OpenDate,
            NULL as CloseDate,
            CASE WHEN MatterId IS NOT NULL THEN MatterId ELSE NULL END as DisplayNumber,
            CASE 
              WHEN ClientType = 'Company' THEN CompanyName
              ELSE CONCAT(ISNULL(FirstName, ''), ' ', ISNULL(LastName, ''))
            END as ClientName,
            ClientType,
            'Legal Services' as Description,
            'General' as PracticeArea,
            NULL as ApproxValue,
            HelixContact as ResponsibleSolicitor,
            HelixContact as OriginatingSolicitor,
            'Partner' as SupervisingPartner,
            'Direct' as Source,
            ClientId as ClientID,
            RelatedClientId as RelatedClientID
          FROM Instructions 
          WHERE InstructionRef = @instructionRef
        `);
    });
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    res.json({
      success: true,
      matter: result.recordset[0]
    });
    
  } catch (error) {
    console.error('Error fetching matter details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch matter details',
      details: error.message 
    });
  }
});

/**
 * Create new matter from instruction
 */
router.post('/create-matter', async (req, res) => {
  try {
    const { 
      instructionRef,
      clientId,
      clientName,
      description,
      practiceArea,
      responsibleSolicitor,
      clioMatterId 
    } = req.body;
    
    if (!instructionRef || !clientId) {
      return res.status(400).json({ 
        error: 'Instruction reference and client ID are required' 
      });
    }
    
    const connStr = getInstrConnStr();

    // Check if matter already exists
    const existingResult = await withRequest(connStr, async (request) => {
      return request
        .input('instructionRef', sql.NVarChar, instructionRef)
        .query('SELECT MatterID FROM matters WHERE InstructionRef = @instructionRef');
    });
      
    if (existingResult.recordset.length > 0) {
      return res.status(409).json({ 
        error: 'Matter already exists for this instruction',
        matterId: existingResult.recordset[0].MatterID
      });
    }
    
    // Generate display number (format: ITEM + timestamp + sequence)
    const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const displayNumber = `ITEM${timestamp}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;
    
    // Create new matter record
    await withRequest(connStr, async (request) => {
      return request
        .input('matterID', sql.NVarChar, clioMatterId || `temp_${Date.now()}`)
      .input('instructionRef', sql.NVarChar, instructionRef)
      .input('status', sql.NVarChar, 'Open')
      .input('openDate', sql.Date, new Date())
      .input('displayNumber', sql.NVarChar, displayNumber)
      .input('clientName', sql.NVarChar, clientName)
      .input('clientID', sql.NVarChar, clientId)
      .input('description', sql.NVarChar, description || 'Legal matter opened from instruction')
      .input('practiceArea', sql.NVarChar, practiceArea || 'General Legal Services')
      .input('responsibleSolicitor', sql.NVarChar, responsibleSolicitor || 'Unassigned')
      .input('clientType', sql.NVarChar, 'Individual')
      .input('source', sql.NVarChar, 'instruction')
      .query(`
        INSERT INTO matters (
          MatterID,
          InstructionRef,
          Status,
          OpenDate,
          DisplayNumber,
          ClientName,
          ClientID,
          Description,
          PracticeArea,
          ResponsibleSolicitor,
          ClientType,
          Source
        ) VALUES (
          @matterID,
          @instructionRef,
          @status,
          @openDate,
          @displayNumber,
          @clientName,
          @clientID,
          @description,
          @practiceArea,
          @responsibleSolicitor,
          @clientType,
          @source
        )
      `);
    });
    
    res.json({
      success: true,
      message: 'Matter created successfully',
      matter: {
        matterId: clioMatterId || `temp_${Date.now()}`,
        instructionRef,
        displayNumber,
        status: 'Open',
        openDate: new Date().toISOString(),
        clientName,
        practiceArea: practiceArea || 'General Legal Services'
      }
    });
    
    // R7: notify connected clients so matters tiles pulse + refetch.
    try {
      broadcastMattersChanged({
        matterId: clioMatterId || null,
        displayNumber,
        instructionRef,
        source: 'matter-operations.create',
      });
    } catch { /* best-effort */ }
    
  } catch (error) {
    console.error('Error creating matter:', error);
    res.status(500).json({ 
      error: 'Failed to create matter',
      details: error.message 
    });
  }
});

/**
 * Update matter details
 */
router.put('/matter/:matterId', async (req, res) => {
  try {
    const { matterId } = req.params;
    const { 
      status,
      description,
      practiceArea,
      responsibleSolicitor,
      approxValue,
      closeDate 
    } = req.body;

    const updateFields = [];
    const inputs = [['matterID', sql.NVarChar, matterId]];

    if (status) { updateFields.push('Status = @status'); inputs.push(['status', sql.NVarChar, status]); }
    if (description) { updateFields.push('Description = @description'); inputs.push(['description', sql.NVarChar, description]); }
    if (practiceArea) { updateFields.push('PracticeArea = @practiceArea'); inputs.push(['practiceArea', sql.NVarChar, practiceArea]); }
    if (responsibleSolicitor) { updateFields.push('ResponsibleSolicitor = @responsibleSolicitor'); inputs.push(['responsibleSolicitor', sql.NVarChar, responsibleSolicitor]); }
    if (approxValue) { updateFields.push('ApproxValue = @approxValue'); inputs.push(['approxValue', sql.NVarChar, approxValue]); }
    if (closeDate) { updateFields.push('CloseDate = @closeDate'); inputs.push(['closeDate', sql.Date, new Date(closeDate)]); }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      for (const [name, type, val] of inputs) request.input(name, type, val);
      return request.query(`
        UPDATE matters 
        SET ${updateFields.join(', ')}
        WHERE MatterID = @matterID
      `);
    });
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    res.json({
      success: true,
      message: 'Matter updated successfully',
      rowsAffected: result.rowsAffected[0]
    });
    
  } catch (error) {
    console.error('Error updating matter:', error);
    res.status(500).json({ 
      error: 'Failed to update matter',
      details: error.message 
    });
  }
});

/**
 * Link client to existing matter
 */
router.post('/link-client', async (req, res) => {
  try {
    const { matterId, clientId, clientName } = req.body;
    
    if (!matterId || !clientId) {
      return res.status(400).json({ 
        error: 'Matter ID and client ID are required' 
      });
    }
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return request
        .input('matterID', sql.NVarChar, matterId)
        .input('clientID', sql.NVarChar, clientId)
        .input('clientName', sql.NVarChar, clientName || 'Unknown Client')
        .query(`
          UPDATE matters 
          SET ClientID = @clientID, ClientName = @clientName
          WHERE MatterID = @matterID
        `);
    });
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    res.json({
      success: true,
      message: 'Client linked to matter successfully',
      matterId,
      clientId
    });
    
  } catch (error) {
    console.error('Error linking client to matter:', error);
    res.status(500).json({ 
      error: 'Failed to link client to matter',
      details: error.message 
    });
  }
});

/**
 * Get matter statistics for dashboard
 */
router.get('/statistics', async (req, res) => {
  try {
    const connStr = getInstrConnStr();

    const [result, practiceAreaResult, solicitorResult] = await Promise.all([
      withRequest(connStr, (request) => request.query(`
        SELECT 
          COUNT(*) as TotalMatters,
          COUNT(CASE WHEN Status = 'Open' THEN 1 END) as OpenMatters,
          COUNT(CASE WHEN Status = 'MatterRequest' THEN 1 END) as MatterRequests,
          COUNT(CASE WHEN Status = 'Closed' THEN 1 END) as ClosedMatters,
          COUNT(CASE WHEN ClientID IS NOT NULL THEN 1 END) as LinkedMatters,
          COUNT(CASE WHEN ClientID IS NULL THEN 1 END) as UnlinkedMatters,
          COUNT(CASE WHEN OpenDate >= DATEADD(day, -30, GETDATE()) THEN 1 END) as RecentMatters
        FROM matters
      `)),
      withRequest(connStr, (request) => request.query(`
        SELECT 
          PracticeArea,
          COUNT(*) as Count
        FROM matters 
        WHERE PracticeArea IS NOT NULL
        GROUP BY PracticeArea
        ORDER BY Count DESC
      `)),
      withRequest(connStr, (request) => request.query(`
        SELECT 
          ResponsibleSolicitor,
          COUNT(*) as Count
        FROM matters 
        WHERE ResponsibleSolicitor IS NOT NULL
        GROUP BY ResponsibleSolicitor
        ORDER BY Count DESC
      `)),
    ]);
    
    res.json({
      success: true,
      statistics: result.recordset[0],
      practiceAreas: practiceAreaResult.recordset,
      solicitors: solicitorResult.recordset
    });
    
  } catch (error) {
    console.error('Error fetching matter statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch matter statistics',
      details: error.message 
    });
  }
});

/**
 * Search matters by various criteria
 */
router.get('/search', async (req, res) => {
  try {
    const { 
      term = '',
      status,
      practiceArea,
      solicitor,
      limit = 50 
    } = req.query;
    
    const inputs = [
      ['searchTerm', sql.NVarChar, `%${term}%`],
      ['limit', sql.Int, parseInt(limit)],
    ];
    
    let whereClause = '1=1';
    
    if (term) {
      whereClause += ` AND (
        InstructionRef LIKE @searchTerm OR
        DisplayNumber LIKE @searchTerm OR
        ClientName LIKE @searchTerm OR
        Description LIKE @searchTerm
      )`;
    }
    
    if (status) {
      whereClause += ' AND Status = @status';
      inputs.push(['status', sql.NVarChar, status]);
    }
    
    if (practiceArea) {
      whereClause += ' AND PracticeArea = @practiceArea';
      inputs.push(['practiceArea', sql.NVarChar, practiceArea]);
    }
    
    if (solicitor) {
      whereClause += ' AND ResponsibleSolicitor = @solicitor';
      inputs.push(['solicitor', sql.NVarChar, solicitor]);
    }
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      for (const [name, type, val] of inputs) request.input(name, type, val);
      return request.query(`
        SELECT TOP (@limit)
        MatterID,
        InstructionRef,
        Status,
        OpenDate,
        DisplayNumber,
        ClientName,
        PracticeArea,
        ResponsibleSolicitor,
        Description
      FROM matters 
      WHERE ${whereClause}
      ORDER BY OpenDate DESC
    `);
    });
    
    res.json({
      success: true,
      matters: result.recordset,
      count: result.recordset.length
    });
    
  } catch (error) {
    console.error('Error searching matters:', error);
    res.status(500).json({ 
      error: 'Failed to search matters',
      details: error.message 
    });
  }
});

/**
 * Create matter in Clio and sync with database
 */
router.post('/create-clio-matter', async (req, res) => {
  try {
    const {
      instructionRef,
      clientId,
      displayNumber,
      description,
      practiceArea,
      responsibleSolicitor
    } = req.body;
    
    if (!instructionRef || !clientId || !displayNumber) {
      return res.status(400).json({
        error: 'Instruction reference, client ID, and display number are required'
      });
    }
    
    // Get Clio credentials from Azure Key Vault
    const clientIdSecret = await getSecret('clio-clientid');
    const clientSecret = await getSecret('clio-clientsecret');
    const refreshToken = await getSecret('clio-refreshtoken');
    
    // First, get access token
    const tokenResponse = await fetch('https://eu.app.clio.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientIdSecret,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Create matter in Clio
    const matterData = {
      matter: {
        display_number: displayNumber,
        description: description || 'Legal matter created from instruction',
        status: 'Open',
        location: 'Active',
        client: {
          id: clientId
        },
        practice_area: practiceArea || 'General Practice',
        responsible_attorney: responsibleSolicitor ? {
          name: responsibleSolicitor
        } : undefined
      }
    };
    
    const matterResponse = await fetch('https://eu.app.clio.com/api/v4/matters', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(matterData),
    });
    
    if (!matterResponse.ok) {
      const errorText = await matterResponse.text();
      throw new Error(`Failed to create matter in Clio: ${matterResponse.statusText} - ${errorText}`);
    }
    
    const matterResult = await matterResponse.json();
    const clioMatterId = matterResult.matter.id;
    
    // Update database with real Clio matter ID
    await withRequest(getInstrConnStr(), async (request) => {
      return request
        .input('matterID', sql.NVarChar, clioMatterId.toString())
      .input('instructionRef', sql.NVarChar, instructionRef)
      .input('displayNumber', sql.NVarChar, displayNumber)
      .input('status', sql.NVarChar, 'Open')
      .input('openDate', sql.Date, new Date())
      .input('clientID', sql.NVarChar, clientId)
      .input('description', sql.NVarChar, description || 'Legal matter created from instruction')
      .input('practiceArea', sql.NVarChar, practiceArea || 'General Practice')
      .input('responsibleSolicitor', sql.NVarChar, responsibleSolicitor || 'Unassigned')
      .input('source', sql.NVarChar, 'instruction')
      .query(`
        UPDATE matters 
        SET MatterID = @matterID,
            Status = @status,
            OpenDate = @openDate,
            ClientID = @clientID,
            Description = @description,
            PracticeArea = @practiceArea,
            ResponsibleSolicitor = @responsibleSolicitor,
            Source = @source
        WHERE InstructionRef = @instructionRef;
        
        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO matters (
            MatterID, InstructionRef, DisplayNumber, Status, OpenDate, 
            ClientID, Description, PracticeArea, ResponsibleSolicitor, Source
          ) VALUES (
            @matterID, @instructionRef, @displayNumber, @status, @openDate,
            @clientID, @description, @practiceArea, @responsibleSolicitor, @source
          )
        END
      `);
    });
    
    res.json({
      success: true,
      message: 'Matter created in Clio and database updated successfully',
      clioMatter: matterResult.matter,
      matterId: clioMatterId
    });

    // R7: notify connected clients so matters tiles pulse + refetch.
    try {
      broadcastMattersChanged({
        matterId: clioMatterId,
        displayNumber,
        instructionRef,
        source: 'matter-operations.clio-create',
      });
    } catch { /* best-effort */ }

    // Fire-and-forget DM notification
    notify('matter.opened', {
      displayNumber,
      instructionRef,
      description: description || '',
      practiceArea: practiceArea || '',
      responsibleSolicitor: responsibleSolicitor || '',
      triggeredBy: req.user?.initials || '',
    });
    
  } catch (error) {
    console.error('Error creating Clio matter:', error);
    res.status(500).json({
      error: 'Failed to create matter in Clio',
      details: error.message
    });
  }
});

module.exports = router;