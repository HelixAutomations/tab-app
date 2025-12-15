const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const router = express.Router();
const { append, redact } = require('../utils/opLog');

// Set up Key Vault client for retrieving secrets
const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const client = new SecretClient(vaultUrl, credential);

// Helper function to get function key from Key Vault (fallback)
async function getFunctionKey(functionName) {
    try {
        const secret = await client.getSecret(`${functionName}-code`);
        return secret.value;
    } catch (error) {
        console.error(`Failed to retrieve key for ${functionName}:`, error);
        throw error;
    }
}

// Helper function to proxy requests to Azure Functions
async function proxyToAzureFunction(req, res, functionName, port = 7072, method = 'POST') {
    try {
    // proxying request
        const op = { type: 'function', action: functionName, method, port, status: 'started' };
        append(op);
        
        // Check if code is provided in query params (from frontend)
        let functionKey = req.query.code;
        
        // If no code provided, try to get from Key Vault
        if (!functionKey) {
            try {
                functionKey = await getFunctionKey(functionName);
            } catch (error) {
                console.error(`No function key available for ${functionName}`);
                return res.status(500).json({ 
                    error: `Function key not found for ${functionName}`, 
                    details: error.message 
                });
            }
        }
        
        const targetUrl = `http://localhost:${port}/api/${functionName}?code=${functionKey}`;
        
        const requestOptions = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
            }
        };

        // Add body for POST requests
        if (method === 'POST' && req.body) {
            requestOptions.body = JSON.stringify(req.body);
        }

        // Add query parameters for GET requests (excluding code since we already have it)
        let urlWithQuery = targetUrl;
        if (method === 'GET' && Object.keys(req.query).length > 0) {
            const queryParams = new URLSearchParams();
            Object.keys(req.query).forEach(key => {
                if (key !== 'code') { // Don't duplicate the code parameter
                    queryParams.append(key, req.query[key]);
                }
            });
            if (queryParams.toString()) {
                urlWithQuery += '&' + queryParams.toString();
            }
        }

    // making request to proxied function
    const startedAt = Date.now();
        
        const response = await fetch(urlWithQuery, requestOptions);
        const data = await response.text();
    const durationMs = Date.now() - startedAt;
        
        // Set CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        
        res.status(response.status);
        
        // Try to parse as JSON, fall back to text
        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch {
            res.send(data);
        }
        append({
            type: 'function',
            action: functionName,
            method,
            status: response.ok ? 'success' : 'error',
            httpStatus: response.status,
            url: redact(urlWithQuery),
            durationMs,
        });
        if (functionName === 'sendEmail') {
            const toCount = Array.isArray(req.body?.to) ? req.body.to.length : (req.body?.to ? 1 : 0);
            const hasAttachments = Array.isArray(req.body?.attachments) && req.body.attachments.length > 0;
            append({
                type: 'email',
                action: 'sendEmail',
                status: response.ok ? 'success' : 'error',
                httpStatus: response.status,
                durationMs,
                details: `toCount=${toCount}${hasAttachments ? ' attachments' : ''}`,
            });
        }
        
    } catch (error) {
        console.error(`Error proxying to ${functionName}:`, error);
        append({ type: 'function', action: functionName, method, status: 'error', error: String(error) });
        if (functionName === 'sendEmail') {
            const toCount = Array.isArray(req.body?.to) ? req.body.to.length : (req.body?.to ? 1 : 0);
            append({ type: 'email', action: 'sendEmail', status: 'error', error: String(error), details: `toCount=${toCount}` });
        }
        res.status(500).json({ 
            error: `Failed to proxy request to ${functionName}`, 
            details: error.message 
        });
    }
}

// Back-compat shim: redirect legacy annual leave function path to Express route
router.post('/getAnnualLeave', (req, res) => {
    try {
        // Preserve method and body using 307 Temporary Redirect
        res.redirect(307, '/api/attendance/getAnnualLeave');
    } catch (e) {
        console.error('Failed to redirect /getAnnualLeave to /api/attendance/getAnnualLeave', e);
        res.status(500).json({ error: 'Redirect failed' });
    }
});

// Back-compat: redirect legacy attendance function path to Express route
router.post('/getAttendance', (req, res) => {
    try {
        res.redirect(307, '/api/attendance/getAttendance');
    } catch (e) {
        console.error('Failed to redirect /getAttendance to /api/attendance/getAttendance', e);
        res.status(500).json({ error: 'Redirect failed' });
    }
});

// Back-compat: redirect legacy matters endpoints to Express routes
router.get('/getMatters', (req, res) => {
    try { res.redirect(307, '/api/getMatters'); } catch (e) {
        console.error('Failed to redirect GET /getMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});
router.post('/getMatters', (req, res) => {
    try { res.redirect(307, '/api/getMatters'); } catch (e) {
        console.error('Failed to redirect POST /getMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});
router.get('/getAllMatters', (req, res) => {
    try { res.redirect(307, '/api/getAllMatters'); } catch (e) {
        console.error('Failed to redirect GET /getAllMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});

// Back-compat: redirect legacy sendEmail to centralized Express route
router.post('/sendEmail', (req, res) => {
    try { res.redirect(307, '/api/sendEmail'); } catch (e) {
        console.error('Failed to redirect /sendEmail to /api/sendEmail', e); res.status(500).json({ error: 'Redirect failed' }); }
});

// API Functions (port 7072) - These are the TypeScript functions
router.get('/getSnippetEdits', (req, res) => proxyToAzureFunction(req, res, 'getSnippetEdits', 7072, 'GET'));
// getAttendance handled by Express redirect above
router.post('/getWIPClio', (req, res) => proxyToAzureFunction(req, res, 'getWIPClio', 7072, 'POST'));
router.post('/getRecovered', (req, res) => proxyToAzureFunction(req, res, 'getRecovered', 7072, 'POST'));
router.get('/getPOID6Years', (req, res) => proxyToAzureFunction(req, res, 'getPOID6years', 7072, 'GET'));
router.get('/getFutureBookings', (req, res) => proxyToAzureFunction(req, res, 'getFutureBookings', 7072, 'GET'));
router.get('/getTransactions', (req, res) => proxyToAzureFunction(req, res, 'getTransactions', 7072, 'GET'));
router.get('/getOutstandingClientBalances', (req, res) => proxyToAzureFunction(req, res, 'getOutstandingClientBalances', 7072, 'GET'));
router.get('/getSnippetBlocks', (req, res) => proxyToAzureFunction(req, res, 'getSnippetBlocks', 7072, 'GET'));
// Removed: legacy function proxy for getAnnualLeave (use Express attendance route instead)

// Additional API functions that might be needed
router.post('/getEnquiries', (req, res) => proxyToAzureFunction(req, res, 'getEnquiries', 7072, 'POST'));
// getMatters and getAllMatters handled by Express redirects above
router.get('/getUserData', (req, res) => proxyToAzureFunction(req, res, 'getUserData', 7072, 'GET'));
router.get('/getTeamData', (req, res) => proxyToAzureFunction(req, res, 'getTeamData', 7072, 'GET'));
router.get('/getRoadmap', (req, res) => proxyToAzureFunction(req, res, 'getRoadmap', 7072, 'GET'));
router.get('/getComplianceData', (req, res) => proxyToAzureFunction(req, res, 'getComplianceData', 7072, 'GET'));
// Deal capture API
router.post('/insertDeal', (req, res) => proxyToAzureFunction(req, res, 'insertDeal', 7072, 'POST'));

// Decoupled Functions (port 7071) - These are the JavaScript functions
router.get('/fetchMattersData', (req, res) => proxyToAzureFunction(req, res, 'fetchMattersData', 7071, 'GET'));
router.post('/fetchEnquiriesData', (req, res) => proxyToAzureFunction(req, res, 'fetchEnquiriesData', 7071, 'POST'));
router.get('/fetchSnippetEdits', (req, res) => proxyToAzureFunction(req, res, 'fetchSnippetEdits', 7071, 'GET'));
router.post('/insertEnquiry', (req, res) => proxyToAzureFunction(req, res, 'insertEnquiry', 7071, 'POST'));
router.post('/processEnquiry', (req, res) => proxyToAzureFunction(req, res, 'processEnquiry', 7071, 'POST'));
// sendEmail handled by Express redirect above

// Handle OPTIONS requests for CORS
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.sendStatus(200);
});

module.exports = router;
