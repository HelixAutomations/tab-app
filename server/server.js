//
// ⚠️  IMPORTANT: THIS FILE IS NOT THE MAIN SERVER FILE! ⚠️
// 
// The actual server that runs in development/production is server/index.js
// 
// When adding new routes:
// 1. Add the require() statement to server/index.js
// 2. Add the app.use() registration to server/index.js
// 3. DO NOT add routes here - they will be ignored!
//
// This file appears to be legacy/backup - the main server is server/index.js
//
const path = require('path');

// Provide a fetch implementation when running on Node versions
// that do not ship with a global `fetch` (Node <18). This prevents
// runtime ReferenceError failures that surface as HTTP 500 responses
// when routes attempt to call `fetch`.
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

require('dotenv').config({ path: path.join(__dirname, '../.env'), override: false });
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
// Optional compression (safe no-op if not installed)
let compression;
try { compression = require('compression'); } catch { /* optional */ }
const opLog = require('./utils/opLog');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const refreshRouter = require('./routes/refresh');
const clearCacheRouter = require('./routes/clearCache');
const keysRouter = require('./routes/keys');
const matterRequestsRouter = require('./routes/matterRequests');
const matterAuditRouter = require('./routes/matter-audit');
const opponentsRouter = require('./routes/opponents');
const clioContactsRouter = require('./routes/clioContacts');
const clioMattersRouter = require('./routes/clioMatters');
const clioClientQueryRouter = require('./routes/clio-client-query');
const clioClientLookupRouter = require('./routes/clio-client-lookup');
const relatedClientsRouter = require('./routes/related-clients');
const syncInstructionClientRouter = require('./routes/sync-instruction-client');
const getMattersRouter = require('./routes/getMatters');
const riskAssessmentsRouter = require('./routes/riskAssessments');
const bundleRouter = require('./routes/bundle');
const proxyToAzureFunctionsRouter = require('./routes/proxyToAzureFunctions');
const enquiriesUnifiedRouter = require('./routes/enquiries-unified');
const updateEnquiryPOCRouter = require('./routes/updateEnquiryPOC');
const pitchesRouter = require('./routes/pitches');
const mattersRouter = require('./routes/matters');
const mattersUnifiedRouter = require('./routes/mattersUnified');
const paymentsRouter = require('./routes/payments');
const callrailCallsRouter = require('./routes/callrailCalls');
const instructionsRouter = require('./routes/instructions');
const documentsRouter = require('./routes/documents');
const prospectDocumentsRouter = require('./routes/prospect-documents');
const docWorkspaceRouter = require('./routes/doc-workspace');
const verifyIdRouter = require('./routes/verify-id');
const teamLookupRouter = require('./routes/team-lookup');
const teamDataRouter = require('./routes/teamData');
const userDataRouter = require('./routes/userData');
const pitchTeamRouter = require('./routes/pitchTeam');
const sendEmailRouter = require('./routes/sendEmail');
const forwardEmailRouter = require('./routes/forwardEmail');
const searchInboxRouter = require('./routes/searchInbox');
const attendanceRouter = require('./routes/attendance');
const bookSpaceRouter = require('./routes/bookSpace');
const reportingRouter = require('./routes/reporting');
const reportingStreamRouter = require('./routes/reporting-stream');
const marketingMetricsRouter = require('./routes/marketing-metrics');
const poidRouter = require('./routes/poid');
const homeMetricsStreamRouter = require('./routes/home-metrics-stream');
const homeWipRouter = require('./routes/home-wip');
const homeEnquiriesRouter = require('./routes/home-enquiries');
const transactionsRouter = require('./routes/transactions');
const futureBookingsRouter = require('./routes/futureBookings');
const outstandingBalancesRouter = require('./routes/outstandingBalances');
const matterMetricsRouter = require('./routes/matter-metrics');
const cachePreheaterRouter = require('./routes/cache-preheater');
const teamsActivityTrackingRouter = require('./routes/teamsActivityTracking');
const pitchTrackingRouter = require('./routes/pitchTracking');
const enquiryEnrichmentRouter = require('./routes/enquiryEnrichment');
const rateChangesRouter = require('./routes/rate-changes');
const cclDateRouter = require('./routes/ccl-date');
const expertsRouter = require('./routes/experts');
const counselRouter = require('./routes/counsel');
const techTicketsRouter = require('./routes/techTickets');
const telemetryRouter = require('./routes/telemetry');
const financialTaskRouter = require('./routes/financialTask');
// const { router: cclRouter, CCL_DIR } = require('./routes/ccl');

// Initialize ops log (loads recent entries and ensures log dir)
try { opLog.init(); } catch { /* best effort */ }

const app = express();
// Enable gzip compression if available, but skip SSE endpoints
if (compression) {
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/reporting-stream') || req.path.startsWith('/api/home-metrics')) {
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            return next();
        }
        return compression()(req, res, next);
    });
}
const PORT = process.env.PORT || 8080;

// TEMP: Open CORS to all origins (reflect request origin). Revert to allowlist when ready.
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Defer Key Vault client creation to route-time to avoid IMDS probe on boot
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
let kvClient = null;
function getKvClient() {
    if (!kvClient) {
        const credential = new DefaultAzureCredential();
        kvClient = new SecretClient(vaultUrl, credential);
    }
    return kvClient;
}

// Prefer serving the CRA build output from the repo root when available.
// Fallback to serving alongside this file (deployment packaging).
const rootBuildPath = path.resolve(__dirname, '..', 'build');
const buildPath = require('fs').existsSync(rootBuildPath) ? rootBuildPath : path.join(__dirname);

// basic request logging (disable verbose logs in production)
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}
app.use(express.json());
app.use('/api/refresh', refreshRouter);
app.use('/api/cache', clearCacheRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/matter-audit', matterAuditRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/bundle', bundleRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/clio-client-query', clioClientQueryRouter);
app.use('/api/clio-client-lookup', clioClientLookupRouter);
app.use('/api/related-clients', relatedClientsRouter);
app.use('/api/sync-instruction-client', syncInstructionClientRouter);
app.use('/api/getMatters', getMattersRouter);
// app.use('/api/ccl', cclRouter);
// app.use('/ccls', express.static(CCL_DIR));

app.use('/api/enquiries-unified', enquiriesUnifiedRouter);
app.use('/api/updateEnquiryPOC', updateEnquiryPOCRouter);

// Update enquiry endpoint - moved to enquiries-unified/update
// app.post('/api/update-enquiry', require('../api/update-enquiry'));
app.post('/api/update-deal', require('./routes/updateDeal'));
app.post('/api/deal-capture', require('./routes/dealCapture'));
app.use('/api/pitches', pitchesRouter);
app.use('/api/matters', mattersRouter);
app.use('/api/matters-unified', mattersUnifiedRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/instructions', instructionsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/prospect-documents', prospectDocumentsRouter);
app.use('/api/doc-workspace', docWorkspaceRouter);
app.use('/api/deals', require('./routes/dealUpdate'));
app.use('/api/verify-id', verifyIdRouter);
app.use('/api/team-lookup', teamLookupRouter);
app.use('/api/team-data', teamDataRouter);
app.use('/api/user-data', userDataRouter);
app.use('/api/pitch-team', pitchTeamRouter);
app.use('/api', sendEmailRouter);
app.use('/api', forwardEmailRouter);
app.use('/api', searchInboxRouter);
app.use('/api', callrailCallsRouter);
app.use('/api/reporting', reportingRouter);
app.use('/api/reporting-stream', reportingStreamRouter);
app.use('/api/home-metrics', homeMetricsStreamRouter);
app.use('/api/home-wip', homeWipRouter);
app.use('/api/home-enquiries', homeEnquiriesRouter);
app.use('/api/marketing-metrics', marketingMetricsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/cache-preheater', cachePreheaterRouter);
app.use('/api/teams-activity-tracking', teamsActivityTrackingRouter);
app.use('/api/pitch-tracking', pitchTrackingRouter);
app.use('/api/enquiry-enrichment', enquiryEnrichmentRouter);
// Rate change notification tracking
app.use('/api/rate-changes', rateChangesRouter);

// CCL Date operation (Clio + legacy SQL)
app.use('/api/ccl-date', cclDateRouter);

// Expert and Counsel directories
app.use('/api/experts', expertsRouter);
app.use('/api/counsel', counselRouter);

// Tech tickets (Asana integration for ideas and problem reports)
app.use('/api/tech-tickets', techTicketsRouter);

// Telemetry endpoint for pitch builder and client-side event tracking
app.use('/api/telemetry', telemetryRouter);

// IMPORTANT: Attendance routes must come BEFORE proxy routes to avoid conflicts
app.use('/api/attendance', attendanceRouter);
app.use('/api/book-space', bookSpaceRouter);

// Financial task route (Asana + optional OneDrive upload)
app.use('/api/financial-task', financialTaskRouter);

// Metrics routes (migrated from Azure Functions to fix cold start issues)
app.use('/api/poid', poidRouter);
app.use('/api/future-bookings', futureBookingsRouter);
app.use('/api/outstanding-balances', outstandingBalancesRouter);
app.use('/api/matter-metrics', matterMetricsRouter);

// Proxy routes to Azure Functions
app.use('/', proxyToAzureFunctionsRouter);

app.get('/api/keys/:name/preview', async (req, res) => {
    try {
        const secret = await getKvClient().getSecret(req.params.name);
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
// Serve static assets with better caching
app.use(express.static(buildPath, {
    etag: true,
    setHeaders: (res, filePath) => {
        if (/\.html?$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    },
}));

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

// Do not serve HTML for API routes that didn't match – return JSON 404 instead
app.get('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// JSON error handler to prevent HTML 500 pages from iisnode leaking to clients
// Must be after routes and before static fallback
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    console.error('Unhandled server error', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(status).json({ error: message, status });
});

// fallback to index.html for client-side routes
app.get('*', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
