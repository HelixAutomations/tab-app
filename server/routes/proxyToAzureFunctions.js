const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const router = express.Router();

// Set up Key Vault client for retrieving secrets
const credential = new DefaultAzureCredential();
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
        console.log(`Proxying ${method} request to ${functionName} on port ${port}`);
        
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

        console.log(`Making request to: ${urlWithQuery.replace(/code=[^&]+/, 'code=***')}`);
        
        const response = await fetch(urlWithQuery, requestOptions);
        const data = await response.text();
        
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
        
    } catch (error) {
        console.error(`Error proxying to ${functionName}:`, error);
        res.status(500).json({ 
            error: `Failed to proxy request to ${functionName}`, 
            details: error.message 
        });
    }
}

// API Functions (port 7072) - These are the TypeScript functions
router.get('/getSnippetEdits', (req, res) => proxyToAzureFunction(req, res, 'getSnippetEdits', 7072, 'GET'));
router.post('/getAttendance', (req, res) => proxyToAzureFunction(req, res, 'getAttendance', 7072, 'POST'));
router.post('/getWIPClio', (req, res) => proxyToAzureFunction(req, res, 'getWIPClio', 7072, 'POST'));
router.post('/getRecovered', (req, res) => proxyToAzureFunction(req, res, 'getRecovered', 7072, 'POST'));
router.get('/getPOID6Years', (req, res) => proxyToAzureFunction(req, res, 'getPOID6years', 7072, 'GET'));
router.get('/getFutureBookings', (req, res) => proxyToAzureFunction(req, res, 'getFutureBookings', 7072, 'GET'));
router.get('/getTransactions', (req, res) => proxyToAzureFunction(req, res, 'getTransactions', 7072, 'GET'));
router.get('/getOutstandingClientBalances', (req, res) => proxyToAzureFunction(req, res, 'getOutstandingClientBalances', 7072, 'GET'));
router.get('/getSnippetBlocks', (req, res) => proxyToAzureFunction(req, res, 'getSnippetBlocks', 7072, 'GET'));
router.post('/getAnnualLeave', (req, res) => proxyToAzureFunction(req, res, 'getAnnualLeave', 7072, 'POST'));

// Additional API functions that might be needed
router.post('/getEnquiries', (req, res) => proxyToAzureFunction(req, res, 'getEnquiries', 7072, 'POST'));
router.post('/getMatters', (req, res) => proxyToAzureFunction(req, res, 'getMatters', 7072, 'POST'));
router.get('/getMatters', (req, res) => proxyToAzureFunction(req, res, 'getMatters', 7072, 'GET'));
router.get('/getUserData', (req, res) => proxyToAzureFunction(req, res, 'getUserData', 7072, 'GET'));
router.get('/getTeamData', (req, res) => proxyToAzureFunction(req, res, 'getTeamData', 7072, 'GET'));
router.get('/getRoadmap', (req, res) => proxyToAzureFunction(req, res, 'getRoadmap', 7072, 'GET'));
router.get('/getComplianceData', (req, res) => proxyToAzureFunction(req, res, 'getComplianceData', 7072, 'GET'));

// Decoupled Functions (port 7071) - These are the JavaScript functions
router.get('/fetchMattersData', (req, res) => proxyToAzureFunction(req, res, 'fetchMattersData', 7071, 'GET'));
router.post('/fetchEnquiriesData', (req, res) => proxyToAzureFunction(req, res, 'fetchEnquiriesData', 7071, 'POST'));
router.get('/fetchSnippetEdits', (req, res) => proxyToAzureFunction(req, res, 'fetchSnippetEdits', 7071, 'GET'));
router.post('/insertEnquiry', (req, res) => proxyToAzureFunction(req, res, 'insertEnquiry', 7071, 'POST'));
router.post('/processEnquiry', (req, res) => proxyToAzureFunction(req, res, 'processEnquiry', 7071, 'POST'));
router.post('/sendEmail', (req, res) => proxyToAzureFunction(req, res, 'sendEmail', 7071, 'POST'));

// Handle OPTIONS requests for CORS
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.sendStatus(200);
});

module.exports = router;
