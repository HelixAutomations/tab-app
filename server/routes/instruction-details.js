const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');

const router = express.Router();

const getInstrConnStr = () => {
  const s = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!s) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return s;
};

// GET /api/instruction-details/:instructionRef - Get instruction details for an instruction
router.get('/:instructionRef', async (req, res) => {
    try {
        const { instructionRef } = req.params;
        
        if (!instructionRef) {
            return res.status(400).json({ error: 'Instruction reference is required' });
        }

        const result = await withRequest(getInstrConnStr(), async (request) => {
            return request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .query(`
                SELECT 
                    InstructionRef,
                    Stage,
                    ClientType,
                    HelixContact,
                    ConsentGiven,
                    InternalStatus,
                    SubmissionDate,
                    SubmissionTime,
                    LastUpdated,
                    ClientId,
                    RelatedClientId,
                    MatterId,
                    Title,
                    FirstName,
                    LastName,
                    Nationality,
                    NationalityAlpha2,
                    DOB,
                    Gender,
                    Phone,
                    Email,
                    PassportNumber,
                    DriversLicenseNumber,
                    IdType,
                    HouseNumber,
                    Street,
                    City,
                    County,
                    Postcode,
                    Country,
                    CountryCode,
                    CompanyName,
                    CompanyNumber,
                    CompanyHouseNumber,
                    CompanyStreet,
                    CompanyCity,
                    CompanyCounty,
                    CompanyPostcode,
                    CompanyCountry,
                    CompanyCountryCode,
                    Notes
                FROM Instructions 
                WHERE InstructionRef = @instructionRef
            `);
        });

        // Format the results
        const instructions = result.recordset.map(instruction => ({
            ...instruction,
            // Format dates for display
            SubmissionDate: instruction.SubmissionDate ? instruction.SubmissionDate.toISOString().split('T')[0] : null,
            LastUpdated: instruction.LastUpdated ? instruction.LastUpdated.toISOString() : null,
            DOB: instruction.DOB ? instruction.DOB.toISOString().split('T')[0] : null,
            // Format time
            SubmissionTime: instruction.SubmissionTime ? instruction.SubmissionTime.toString() : null
        }));

        res.json({
            success: true,
            instructionRef,
            instructions,
            count: instructions.length
        });

    } catch (error) {
        console.error('Error fetching instruction details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch instruction details',
            details: error.message 
        });
    }
});

module.exports = router;