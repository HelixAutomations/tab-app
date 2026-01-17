const express = require('express');
const { sql, withRequest } = require('../utils/db');

const router = express.Router();

// GET /api/pitches/:enquiryId - Fetch pitch history for an enquiry
router.get('/:enquiryId', async (req, res) => {
    const { enquiryId } = req.params;

    if (!enquiryId) {
        return res.status(400).json({ error: 'Missing enquiryId parameter' });
    }

    try {
        // Use instructions database connection string
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        
        if (!connectionString) {
            console.error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Query pitch content from the instructions database with full details.
        // Include deal + instruction join so the UI can show whether pitches have converted.
        const result = await withRequest(connectionString, async (request) => {
            return request
                .input('enquiryId', sql.NVarChar, enquiryId)
                .query(`
                    SELECT 
                        pc.DealId,
                        pc.InstructionRef,
                        pc.ProspectId,
                        pc.EmailSubject,
                        pc.EmailBody,
                        pc.EmailBodyHtml,
                        pc.CreatedAt,
                        pc.CreatedBy,
                        pc.Amount,
                        pc.ServiceDescription,
                        pc.Reminders,
                        pc.Notes,
                        pc.ScenarioId,
                        d.Passcode AS Passcode,
                        d.Status AS DealStatus,
                        d.PitchValidUntil AS PitchValidUntil,
                        i.Stage AS InstructionStage,
                        i.InternalStatus AS InstructionInternalStatus
                    FROM PitchContent pc
                    LEFT JOIN Deals d ON d.DealId = pc.DealId
                    LEFT JOIN Instructions i ON i.InstructionRef = pc.InstructionRef
                    WHERE pc.ProspectId = @enquiryId
                    ORDER BY pc.CreatedAt DESC
                `);
        });

        const pitches = result.recordset || [];
        res.json({ pitches });
    } catch (err) {
        console.error('Error fetching pitch history:', err);
        res.status(500).json({ error: 'Failed to fetch pitch history', details: err.message });
    }
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const { enquiryId, sections = [], user } = body;

    if (!enquiryId || !Array.isArray(sections)) {
        return res.status(400).json({ error: 'Invalid payload - need enquiryId and sections array' });
    }

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    try {
        const result = await withRequest(connectionString, async (request) => {
            const schema = process.env.DB_SCHEMA || 'pitchbuilder';
            for (const section of sections) {
                await request
                    .input('enquiryId', sql.Int, enquiryId)
                    .input('block', sql.NVarChar(100), section.block || '')
                    .input('optionLabel', sql.NVarChar(100), section.option || '')
                    .input('content', sql.NVarChar(sql.MAX), section.content || '')
                    .input('createdBy', sql.NVarChar(50), user || null)
                    .query(`INSERT INTO ${schema}.PitchSections (EnquiryId, Block, OptionLabel, Content, CreatedBy)
                            VALUES (@enquiryId, @block, @optionLabel, @content, @createdBy)`);
            }
            return { ok: true };
        });

        res.json(result);
    } catch (err) {
        console.error('[pitches] Error saving pitch sections:', err);
        res.status(500).json({ error: 'Failed to save pitch sections', detail: err.message });
    }
});

module.exports = router;
