const path = require('path');

// Ensure `fetch` is available for route handlers when running on
// versions of Node.js that do not provide it natively. Without this
// check, calls to `fetch` would throw a ReferenceError and surface as
// 500 errors in production.
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

require('dotenv').config({ path: path.join(__dirname, '../.env.local'), override: false });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const keysRouter = require('./routes/keys');
const refreshRouter = require('./routes/refresh');
const matterRequestsRouter = require('./routes/matterRequests');
const opponentsRouter = require('./routes/opponents');
const clioContactsRouter = require('./routes/clioContacts');
const clioMattersRouter = require('./routes/clioMatters');
const mattersRouter = require('./routes/matters');
const getMattersRouter = require('./routes/getMatters');
const getAllMattersRouter = require('./routes/getAllMatters');
const riskAssessmentsRouter = require('./routes/riskAssessments');
const bundleRouter = require('./routes/bundle');
const { router: cclRouter, CCL_DIR } = require('./routes/ccl');
const enquiriesRouter = require('./routes/enquiries');
const enquiryEmailsRouter = require('./routes/enquiryEmails');
const pitchesRouter = require('./routes/pitches');
const sqlMattersRouter = require('./routes/sqlMatters');
const proxyToAzureFunctionsRouter = require('./routes/proxyToAzureFunctions');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for all routes to allow frontend on port 3000 to access API on port 8080
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json());

app.use('/api/keys', keysRouter);
app.use('/api/refresh', refreshRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/bundle', bundleRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/matters', mattersRouter);
app.use('/api/getMatters', getMattersRouter);
app.use('/api/getAllMatters', getAllMattersRouter);
app.use('/api/ccl', cclRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/enquiry-emails', enquiryEmailsRouter);
app.use('/api/pitches', pitchesRouter);
app.use('/api/sqlMatters', sqlMattersRouter);
app.use('/ccls', express.static(CCL_DIR));

// Proxy routes to Azure Functions - these handle requests without /api/ prefix
app.use('/', proxyToAzureFunctionsRouter);

// API routes should come BEFORE static file serving and catch-all route
// This ensures API requests don't get caught by the catch-all route

const buildPath = path.join(__dirname, 'static');
// Only serve static files if the directory exists
const fs = require('fs');
if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    
    // Catch-all route for SPA - only for non-API routes
    app.get('*', (req, res) => {
        // Don't serve HTML for API routes
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.sendFile(path.join(buildPath, 'index.html'));
    });
} else {
    console.log('Static build directory not found, serving API only');
    // For non-API routes when no static files exist
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.status(404).json({ error: 'Static files not available' });
    });
}

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});