const express = require('express');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

// Route: GET /api/sqlMatters
// Calls the external fetchMattersData function (decoupled function in private vnet)
router.get('/', async (req, res) => {
    try {
        const { fullName, limit } = req.query;
        if (!fullName) {
            return res.status(400).json({ matters: [], count: 0, error: 'fullName is required' });
        }

        let functionCode;
        try {
            functionCode = await getSecret('fetchMattersData-code');
        } catch (kvError) {
            console.error('Failed to retrieve fetchMattersData-code', kvError.message);
            return res.status(500).json({ matters: [], count: 0, error: 'Failed to authenticate with external function' });
        }

        const baseUrl = 'https://instructions-vnet-functions.azurewebsites.net/api/fetchMattersData';
        const params = new URLSearchParams();
        params.append('code', functionCode);
        params.append('fullName', fullName);
        if (limit) params.append('limit', limit);
        const url = `${baseUrl}?${params.toString()}`;

        const response = await fetch(url);
        if (!response.ok) {
            const text = await response.text();
            console.warn('fetchMattersData call failed', text);
            return res.status(200).json({ matters: [], count: 0, error: 'Data temporarily unavailable' });
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.warn('Error calling fetchMattersData (non-blocking):', err.message);
        console.error('Full error:', err);
        res.status(200).json({ matters: [], count: 0, error: 'Data temporarily unavailable' });
    }
});

module.exports = router;
