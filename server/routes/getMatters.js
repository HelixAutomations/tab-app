const express = require('express');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

// Route: GET /api/getMatters
// Calls the external fetchMattersData function (decoupled function in private vnet)
router.get('/', async (req, res) => {
    try {
        let functionCode;
        try {
            functionCode = await getSecret('fetchMattersData-code');
        } catch (kvError) {
            console.error('Failed to retrieve fetchMattersData-code', kvError.message);
            return res.status(500).json({ matters: [], count: 0, error: 'Failed to authenticate with external function' });
        }

        const baseUrl = process.env.FETCH_MATTERS_DATA_FUNC_BASE_URL ||
            'http://localhost:7071/api/fetchMattersData';
        const url = `${baseUrl}?code=${functionCode}`;

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

// Route: POST /api/getMatters
// Proxies to the getMatters Azure Function so local dev can use real data

// Route: POST /api/getMatters
// Proxies to the fetchMattersData Azure Function (decoupled)

// Route: POST /api/getMatters
// Always calls fetchMattersData as a GET, passing params as query string
router.post('/', async (req, res) => {
    const { fullName, limit } = req.body || {};
    if (!fullName) {
        return res.status(400).json({ error: 'fullName is required' });
    }

    try {
        let functionCode;
        try {
            functionCode = await getSecret('fetchMattersData-code');
        } catch (kvError) {
            console.error('Failed to retrieve fetchMattersData-code', kvError.message);
            return res.status(500).json({ error: 'Failed to authenticate with fetchMattersData function' });
        }

        // Always call as GET with query params
        const baseUrl = process.env.FETCH_MATTERS_DATA_FUNC_BASE_URL ||
            'http://localhost:7071/api/fetchMattersData';
        const url = `${baseUrl}?fullName=${encodeURIComponent(fullName)}${limit ? `&limit=${encodeURIComponent(limit)}` : ''}&code=${functionCode}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.warn('fetchMattersData function call failed', text);
            return res.status(resp.status).json({ error: 'Failed to fetch matters' });
        }

        const data = await resp.json();
        res.json(data);
    } catch (err) {
        console.error('Error calling fetchMattersData function', err);
        res.status(500).json({ error: 'Failed to fetch matters' });
    }
});

module.exports = router;

