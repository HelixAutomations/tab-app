const express = require('express');
const { getSecret } = require('../utils/getSecret');
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

        // Query pitch content from the instructions database with full details
        const result = await withRequest(connectionString, async (request) => {
            return request
                .input('enquiryId', sql.NVarChar, enquiryId)
                .query(`
                    SELECT 
                        EmailSubject,
                        EmailBody,
                        EmailBodyHtml,
                        CreatedAt,
                        CreatedBy,
                        Amount,
                        ServiceDescription,
                        Reminders,
                        Notes,
                        ScenarioId
                    FROM PitchContent
                    WHERE ProspectId = @enquiryId
                    ORDER BY CreatedAt DESC
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
    const baseUrl =
        process.env.PITCH_SECTIONS_FUNC_BASE_URL ||
        'https://instructions-vnet-functions.azurewebsites.net/api/recordPitchSections';
    try {
        let code = process.env.PITCH_SECTIONS_FUNC_CODE;
        if (!code) {
            const secretName =
                process.env.PITCH_SECTIONS_FUNC_CODE_SECRET || 'recordPitchSections-code';
            code = await getSecret(secretName);
        }

        const url = `${baseUrl}?code=${code}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error('Pitch save failed', text);
            return res.status(500).json({ error: 'Pitch save failed' });
        }

        const data = await resp.json();
        res.json(data);
    } catch (err) {
        console.error('Pitch save error', err);
        res.status(500).json({ error: 'Pitch save failed' });
    }
});

module.exports = router;
