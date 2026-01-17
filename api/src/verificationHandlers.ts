import { Request, Response } from 'express';
const sql = require('mssql');

/**
 * Fetches detailed ID verification data for review modal
 */
export const getVerificationDetails = async (req: Request, res: Response) => {
  try {
    const { instructionRef } = req.params;
    
    if (!instructionRef) {
      return res.status(400).json({ error: 'Instruction reference is required' });
    }

    // Query to get instruction and verification details
    const query = `
      SELECT 
        i.InstructionRef,
        i.FirstName,
        i.Surname, 
        i.Email,
        v.EIDOverallResult,
        v.PEPAndSanctionsCheckResult,
        v.AddressVerificationResult,
        v.EIDRawResponse,
        v.CheckedDate
      FROM Instructions i
      LEFT JOIN IDVerifications v ON i.InternalId = v.InstructionInternalId
      WHERE i.InstructionRef = @instructionRef
      ORDER BY v.CheckedDate DESC
    `;

    const pool = await sql.connect();
    const request = pool.request();
    request.input('instructionRef', sql.VarChar(50), instructionRef);
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const record = result.recordset[0];
    
    // Parse the raw response to determine actual status
    let rawResponse = null;
    try {
      rawResponse = record.EIDRawResponse ? JSON.parse(record.EIDRawResponse) : null;
    } catch (parseError) {
      console.error('Failed to parse EIDRawResponse:', parseError);
    }

    // Determine actual verification results from raw response
    let overallResult = record.EIDOverallResult || 'unknown';
    let pepResult = record.PEPAndSanctionsCheckResult || 'unknown';
    let addressResult = record.AddressVerificationResult || 'unknown';

    if (rawResponse) {
      // Extract actual results from Tiller response
      overallResult = rawResponse.result || rawResponse.overall_result || overallResult;
      pepResult = rawResponse.peps_and_sanctions?.result || pepResult;
      addressResult = rawResponse.address_verification?.result || addressResult;
    }

    const responseData = {
      instructionRef: record.InstructionRef,
      firstName: record.FirstName || '',
      surname: record.Surname || '',
      email: record.Email || '',
      overallResult,
      pepResult,
      addressResult,
      rawResponse: record.EIDRawResponse,
      checkedDate: record.CheckedDate
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error fetching verification details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Approves ID verification and updates status to Verified
 */
export const approveVerification = async (req: Request, res: Response) => {
  try {
    const { instructionRef } = req.params;
    
    if (!instructionRef) {
      return res.status(400).json({ error: 'Instruction reference is required' });
    }

    // Get the instruction details first
    const getInstructionQuery = `
      SELECT 
        i.InternalId,
        i.FirstName,
        i.Surname,
        i.Email
      FROM Instructions i
      WHERE i.InstructionRef = @instructionRef
    `;

    const pool = await sql.connect();
    let request = pool.request();
    request.input('instructionRef', sql.VarChar(50), instructionRef);
    
    const instructionResult = await request.query(getInstructionQuery);
    
    if (instructionResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const instruction = instructionResult.recordset[0];

    // Update the verification status
    const updateQuery = `
      UPDATE IDVerifications 
      SET 
        EIDOverallResult = 'Verified',
        LastUpdated = GETDATE()
      WHERE InstructionInternalId = @internalId
    `;

    request = pool.request();
    request.input('internalId', sql.Int, instruction.InternalId);
    
    await request.query(updateQuery);

    // Also update the Instructions table stage if needed
    const updateInstructionQuery = `
      UPDATE Instructions 
      SET 
        stage = 'proof-of-id-complete',
        EIDOverallResult = 'Verified'
      WHERE InternalId = @internalId
    `;

    request = pool.request();
    request.input('internalId', sql.Int, instruction.InternalId);
    
    await request.query(updateInstructionQuery);

    // Approval is a state change only; we do not send any client emails here.

    res.json({
      success: true,
      message: 'Verification approved successfully',
      instructionRef,
      emailSent: false
    });

  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

