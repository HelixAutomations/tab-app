const path = require('path');

// Provide a fetch implementation when running on Node versions
// that do not ship with a global `fetch` (Node <18). This prevents
// runtime ReferenceError failures that surface as HTTP 500 responses
// when routes attempt to call `fetch`.
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

require('dotenv').config({ path: path.join(__dirname, '../.env.local'), override: false });
const express = require('express');
const morgan = require('morgan');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const refreshRouter = require('./routes/refresh');
const keysRouter = require('./routes/keys');
const matterRequestsRouter = require('./routes/matterRequests');
const opponentsRouter = require('./routes/opponents');
const clioContactsRouter = require('./routes/clioContacts');
const clioMattersRouter = require('./routes/clioMatters');
const getMattersRouter = require('./routes/getMatters');
const getAllMattersRouter = require('./routes/getAllMatters');
const riskAssessmentsRouter = require('./routes/riskAssessments');
const bundleRouter = require('./routes/bundle');
const proxyToAzureFunctionsRouter = require('./routes/proxyToAzureFunctions');

const enquiriesRouter = require('./routes/enquiries');
const enquiryEmailsRouter = require('./routes/enquiryEmails');
const pitchesRouter = require('./routes/pitches');
const sqlMattersRouter = require('./routes/sqlMatters');
const mattersRouter = require('./routes/matters');
// const { router: cclRouter, CCL_DIR } = require('./routes/ccl');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Set up Key Vault client for retrieving secrets
const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const client = new SecretClient(vaultUrl, credential);

// When running locally index.js lives in the `server` folder and the built
// client files are one level up. However after deployment the build script
// copies `index.js` to the site root alongside the compiled client assets.
// Using `__dirname` directly works for both cases.
const buildPath = path.join(__dirname);

// basic request logging
app.use(morgan('dev'));
app.use(express.json());
app.use('/api/refresh', refreshRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/bundle', bundleRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/getMatters', getMattersRouter);
app.use('/api/getAllMatters', getAllMattersRouter);
// app.use('/api/ccl', cclRouter);
// app.use('/ccls', express.static(CCL_DIR));

app.use('/api/enquiries', enquiriesRouter);
app.use('/api/enquiry-emails', enquiryEmailsRouter);
app.use('/api/pitches', pitchesRouter);
app.use('/api/sqlMatters', sqlMattersRouter);
app.use('/api/matters', mattersRouter);

// Proxy routes to Azure Functions
app.use('/', proxyToAzureFunctionsRouter);

app.get('/api/keys/:name/preview', async (req, res) => {
    try {
        const secret = await client.getSecret(req.params.name);
        const length = parseInt(process.env.SECRET_PREVIEW_LEN || '4', 10);
        res.json({ preview: secret.value.slice(0, length) });
    } catch (err) {
        console.error('Failed to retrieve secret preview', err);
        res.status(500).json({ error: 'Failed to retrieve secret preview' });
    }
});

app.use('/api/keys', keysRouter);
app.use('/api/refresh', refreshRouter);

// serve the built React files
app.use(express.static(buildPath));

// simple liveness probe
app.get('/health', (_req, res) => {
    res.sendStatus(200);
});

// example Server-Sent Events endpoint emitting fake progress
app.get('/process', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        res.write(`data: ${JSON.stringify({ progress })}\n\n`);
        if (progress >= 100) {
            res.write('event: done\n');
            res.write('data: {}\n\n');
            clearInterval(interval);
            res.end();
        }
    }, 500);

    req.on('close', () => clearInterval(interval));
});

// fallback to index.html for client-side routes
app.get('*', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
