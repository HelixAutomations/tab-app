const express = require('express');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

// Route: GET /api/getMatters
// Calls the external fetchMattersData function (decoupled function in private vnet)
router.get('/', async (req, res) => {
    try {
        console.log('🔵 NEW MATTERS ROUTE CALLED for decoupled function');
        console.log('🔍 Query parameters:', req.query);

        // Try to get the function code
        let functionCode;
        try {
            functionCode = await getSecret('fetchMattersData-code');
            console.log('✅ Successfully retrieved function code');
        } catch (kvError) {
            console.error('❌ Failed to get function code:', kvError.message);
            // Fallback to mock data if Key Vault is not available
            const mockData = {
                matters: [
                    { id: 1, matter_name: 'Sample Matter 1', client_name: 'Sample Client 1' },
                    { id: 2, matter_name: 'Sample Matter 2', client_name: 'Sample Client 2' }
                ],
                count: 2
            };
            return res.status(200).json(mockData);
        }

        const baseUrl = process.env.FETCH_MATTERS_DATA_FUNC_BASE_URL ||
            'https://instructions-vnet-functions.azurewebsites.net/api/fetchmattersdata';
        const url = `${baseUrl}?code=${functionCode}`;

        console.log('🌐 Calling external function URL:', url.replace(functionCode, '[REDACTED]'));

        const response = await fetch(url, { 
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`❌ Function call failed: ${response.status} ${response.statusText}`, errorText);
            // Return empty data instead of failing - don't block app
            return res.status(200).json({ matters: [], count: 0, error: 'Data temporarily unavailable' });
        }

        const data = await response.json();
        console.log('✅ Successfully fetched matters data, count:', data.matters ? data.matters.length : data.length || 'unknown');
        res.json(data);
    } catch (err) {
        console.warn('❌ Error calling fetchMattersData (non-blocking):', err.message);
        console.error('Full error:', err);
        
        // Return mock data when Azure Function is not available
        const mockData = {
            matters: [
                { id: 1, matter_name: 'Sample Matter 1', client_name: 'Sample Client 1' },
                { id: 2, matter_name: 'Sample Matter 2', client_name: 'Sample Client 2' }
            ],
            count: 2
        };
        res.status(200).json(mockData);
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
            // Fallback to mock data if Key Vault is not available
            const mockData = {
                matters: [
                    { id: 1, matter_name: `Sample Matter for ${fullName}`, client_name: 'Sample Client 1' },
                    { id: 2, matter_name: `Another Matter for ${fullName}`, client_name: 'Sample Client 2' }
                ],
                count: 2
            };
            return res.status(200).json(mockData);
        }

        // Always call as GET with query params
        const baseUrl = process.env.FETCH_MATTERS_DATA_FUNC_BASE_URL ||
            'https://instructions-vnet-functions.azurewebsites.net/api/fetchmattersdata';
        const url = `${baseUrl}?fullName=${encodeURIComponent(fullName)}${limit ? `&limit=${encodeURIComponent(limit)}` : ''}&code=${functionCode}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        }

        const data = await resp.json();
        res.json(data);
    } catch (err) {
        console.error('Error calling fetchMattersData function', err);
        
        // Return mock data when Azure Function is not available
        const mockData = {
            matters: [
                { id: 1, matter_name: `Sample Matter for ${fullName}`, client_name: 'Sample Client 1' },
                { id: 2, matter_name: `Another Matter for ${fullName}`, client_name: 'Sample Client 2' }
            ],
            count: 2
        };
        res.status(200).json(mockData);
    }
});

module.exports = router;

