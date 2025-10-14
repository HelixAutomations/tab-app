const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: false });

const express = require('express');
const sql = require('mssql');
const router = express.Router();

/**
 * Create or update risk assessment for an instruction
 * POST /api/risk-assessments
 */
router.post('/', async (req, res) => {
    const body = req.body || {};
    const { InstructionRef, MatterId } = body;
    
    if (!InstructionRef && !MatterId) {
        return res.status(400).json({ error: 'Missing InstructionRef or MatterId' });
    }

    console.log(`[risk-assessments] Processing risk assessment for ${InstructionRef || MatterId}`);

    let pool;
    try {
        // Use the INSTRUCTIONS_SQL_CONNECTION_STRING from .env (same as verify-id)
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        pool = await sql.connect(connectionString);

        // Handle limitation date formatting like the Azure Function
        let limitation = body.Limitation || null;
        if (body.Limitation_Value === 2 || body.Limitation_Value === 3) {
            const datePart = body.LimitationDateTbc
                ? 'TBC'
                : body.LimitationDate
                    ? new Date(body.LimitationDate).toLocaleDateString('en-GB')
                    : '';
            if (datePart) limitation = `${limitation} - ${datePart}`;
        }

        // Insert/update the risk assessment
        await pool.request()
            .input('MatterId', sql.NVarChar(50), MatterId || InstructionRef)
            .input('InstructionRef', sql.NVarChar(50), InstructionRef || null)
            .input('RiskAssessor', sql.NVarChar(100), body.RiskAssessor || null)
            .input('ComplianceDate', sql.Date, body.ComplianceDate || null)
            .input('ComplianceExpiry', sql.Date, body.ComplianceExpiry || null)
            .input('ClientType', sql.NVarChar(255), body.ClientType || null)
            .input('ClientType_Value', sql.Int, body.ClientType_Value || null)
            .input('DestinationOfFunds', sql.NVarChar(255), body.DestinationOfFunds || null)
            .input('DestinationOfFunds_Value', sql.Int, body.DestinationOfFunds_Value || null)
            .input('FundsType', sql.NVarChar(255), body.FundsType || null)
            .input('FundsType_Value', sql.Int, body.FundsType_Value || null)
            .input('HowWasClientIntroduced', sql.NVarChar(255), body.HowWasClientIntroduced || null)
            .input('HowWasClientIntroduced_Value', sql.Int, body.HowWasClientIntroduced_Value || null)
            .input('Limitation', sql.NVarChar(255), limitation)
            .input('Limitation_Value', sql.Int, body.Limitation_Value || null)
            .input('SourceOfFunds', sql.NVarChar(255), body.SourceOfFunds || null)
            .input('SourceOfFunds_Value', sql.Int, body.SourceOfFunds_Value || null)
            .input('ValueOfInstruction', sql.NVarChar(255), body.ValueOfInstruction || null)
            .input('ValueOfInstruction_Value', sql.Int, body.ValueOfInstruction_Value || null)
            .input('RiskAssessmentResult', sql.NVarChar(255), body.RiskAssessmentResult || null)
            .input('RiskScore', sql.Int, body.RiskScore || null)
            .input('RiskScoreIncrementBy', sql.Int, body.RiskScoreIncrementBy || null)
            .input('TransactionRiskLevel', sql.NVarChar(255), body.TransactionRiskLevel || null)
            .input('ClientRiskFactorsConsidered', sql.Bit, body.ClientRiskFactorsConsidered ? 1 : 0)
            .input('TransactionRiskFactorsConsidered', sql.Bit, body.TransactionRiskFactorsConsidered ? 1 : 0)
            .input('FirmWideAMLPolicyConsidered', sql.Bit, body.FirmWideAMLPolicyConsidered ? 1 : 0)
            .input('FirmWideSanctionsRiskConsidered', sql.Bit, body.FirmWideSanctionsRiskConsidered ? 1 : 0)
            .query(`
                MERGE RiskAssessment AS target
                USING (VALUES (@MatterId)) AS source (MatterId)
                ON target.MatterId = source.MatterId
                WHEN MATCHED THEN 
                    UPDATE SET 
                        InstructionRef = @InstructionRef,
                        RiskAssessor = @RiskAssessor,
                        ComplianceDate = @ComplianceDate,
                        ComplianceExpiry = @ComplianceExpiry,
                        ClientType = @ClientType,
                        ClientType_Value = @ClientType_Value,
                        DestinationOfFunds = @DestinationOfFunds,
                        DestinationOfFunds_Value = @DestinationOfFunds_Value,
                        FundsType = @FundsType,
                        FundsType_Value = @FundsType_Value,
                        HowWasClientIntroduced = @HowWasClientIntroduced,
                        HowWasClientIntroduced_Value = @HowWasClientIntroduced_Value,
                        Limitation = @Limitation,
                        Limitation_Value = @Limitation_Value,
                        SourceOfFunds = @SourceOfFunds,
                        SourceOfFunds_Value = @SourceOfFunds_Value,
                        ValueOfInstruction = @ValueOfInstruction,
                        ValueOfInstruction_Value = @ValueOfInstruction_Value,
                        RiskAssessmentResult = @RiskAssessmentResult,
                        RiskScore = @RiskScore,
                        RiskScoreIncrementBy = @RiskScoreIncrementBy,
                        TransactionRiskLevel = @TransactionRiskLevel,
                        ClientRiskFactorsConsidered = @ClientRiskFactorsConsidered,
                        TransactionRiskFactorsConsidered = @TransactionRiskFactorsConsidered,
                        FirmWideAMLPolicyConsidered = @FirmWideAMLPolicyConsidered,
                        FirmWideSanctionsRiskConsidered = @FirmWideSanctionsRiskConsidered
                WHEN NOT MATCHED THEN
                    INSERT (
                        MatterId, InstructionRef, RiskAssessor, ComplianceDate, ComplianceExpiry,
                        ClientType, ClientType_Value, DestinationOfFunds, DestinationOfFunds_Value,
                        FundsType, FundsType_Value, HowWasClientIntroduced, HowWasClientIntroduced_Value,
                        Limitation, Limitation_Value, SourceOfFunds, SourceOfFunds_Value,
                        ValueOfInstruction, ValueOfInstruction_Value, RiskAssessmentResult,
                        RiskScore, RiskScoreIncrementBy, TransactionRiskLevel,
                        ClientRiskFactorsConsidered, TransactionRiskFactorsConsidered,
                        FirmWideAMLPolicyConsidered, FirmWideSanctionsRiskConsidered
                    ) VALUES (
                        @MatterId, @InstructionRef, @RiskAssessor, @ComplianceDate, @ComplianceExpiry,
                        @ClientType, @ClientType_Value, @DestinationOfFunds, @DestinationOfFunds_Value,
                        @FundsType, @FundsType_Value, @HowWasClientIntroduced, @HowWasClientIntroduced_Value,
                        @Limitation, @Limitation_Value, @SourceOfFunds, @SourceOfFunds_Value,
                        @ValueOfInstruction, @ValueOfInstruction_Value, @RiskAssessmentResult,
                        @RiskScore, @RiskScoreIncrementBy, @TransactionRiskLevel,
                        @ClientRiskFactorsConsidered, @TransactionRiskFactorsConsidered,
                        @FirmWideAMLPolicyConsidered, @FirmWideSanctionsRiskConsidered
                    );
            `);

        console.log(`[risk-assessments] Risk assessment saved successfully for ${InstructionRef || MatterId}`);
        
        res.status(200).json({ 
            success: true, 
            message: 'Risk assessment saved successfully',
            instructionRef: InstructionRef || MatterId
        });

    } catch (error) {
        console.error(`[risk-assessments] Error saving risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to save risk assessment',
            details: error.message 
        });
    } finally {
        if (pool) {
            await pool.close();
        }
    }
});

/**
 * Get risk assessment for an instruction
 * GET /api/risk-assessments/:instructionRef
 */
router.get('/:instructionRef', async (req, res) => {
    const { instructionRef } = req.params;
    
    if (!instructionRef) {
        return res.status(400).json({ error: 'Missing instructionRef' });
    }

    console.log(`[risk-assessments] Getting risk assessment for ${instructionRef}`);

    let pool;
    try {
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        pool = await sql.connect(connectionString);

        const result = await pool.request()
            .input('ref', sql.NVarChar, instructionRef)
            .query(`
                SELECT * FROM RiskAssessment 
                WHERE MatterId = @ref OR InstructionRef = @ref
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Risk assessment not found' });
        }

        res.json(result.recordset[0]);

    } catch (error) {
        console.error(`[risk-assessments] Error fetching risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch risk assessment',
            details: error.message 
        });
    } finally {
        if (pool) {
            await pool.close();
        }
    }
});

module.exports = router;
/**
 * Delete risk assessment for an instruction
 * DELETE /api/risk-assessments/:instructionRef
 */
router.delete('/:instructionRef', async (req, res) => {
    const { instructionRef } = req.params;

    if (!instructionRef) {
        return res.status(400).json({ error: 'Missing instructionRef' });
    }

    console.log(`[risk-assessments] Deleting risk assessment for ${instructionRef}`);

    let pool;
    try {
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        pool = await sql.connect(connectionString);

        const result = await pool.request()
            .input('ref', sql.NVarChar, instructionRef)
            .query(`
                DELETE FROM [dbo].[RiskAssessment]
                WHERE MatterId = @ref OR InstructionRef = @ref
            `);

        const rows = result.rowsAffected?.[0] ?? 0;
        if (rows === 0) {
            return res.status(404).json({ error: 'Risk assessment not found' });
        }

        res.json({ success: true, deleted: rows });

    } catch (error) {
        console.error(`[risk-assessments] Error deleting risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to delete risk assessment',
            details: error.message 
        });
    } finally {
        if (pool) {
            await pool.close();
        }
    }
});
