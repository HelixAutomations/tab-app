const path = require('path');

//
// 🟢 THIS IS THE MAIN SERVER FILE - server/index.js 🟢
//
// When adding new routes:
// 1. Add require('./routes/yourRoute') in the imports section below
// 2. Add app.use('/api/your-path', yourRouter) in the route registration section
// 3. Restart the server to pick up new routes
//
// Note: server/server.js is NOT the main server file - ignore it when adding routes!
//

// Ensure `fetch` is available for route handlers when running on
// versions of Node.js that do not provide it natively. Without this
// check, calls to `fetch` would throw a ReferenceError and surface as
// 500 errors in production.
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: false });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
// Optional compression (safe if not installed)
let compression;
try { compression = require('compression'); } catch { /* optional */ }
const { init: initOpLog, append: opAppend, sessionId: opSessionId } = require('./utils/opLog');
const { getRedisClient } = require('./utils/redisClient');
const { getPool } = require('./utils/db');

// Warm up connections in background (non-blocking)
async function warmupConnections() {
    // Warm up Redis
    getRedisClient().catch(() => { /* ignore - will retry on first use */ });
    
    // Warm up SQL connection pool with main database
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (connStr) {
        getPool(connStr).catch(() => { /* ignore - will retry on first use */ });
    }
}
warmupConnections();
const keysRouter = require('./routes/keys');
const refreshRouter = require('./routes/refresh');
const matterRequestsRouter = require('./routes/matterRequests');
const opponentsRouter = require('./routes/opponents');
const clioContactsRouter = require('./routes/clioContacts');
const clioMattersRouter = require('./routes/clioMatters');
const searchClioContactsRouter = require('./routes/searchClioContacts');
const clioClientQueryRouter = require('./routes/clio-client-query');
const clioClientLookupRouter = require('./routes/clio-client-lookup');
const relatedClientsRouter = require('./routes/related-clients');
const matterOperationsRouter = require('./routes/matter-operations');
const mattersRouter = require('./routes/matters');
const getMattersRouter = require('./routes/getMatters');
const riskAssessmentsRouter = require('./routes/riskAssessments');
const bundleRouter = require('./routes/bundle');
const { router: cclRouter, CCL_DIR } = require('./routes/ccl');
const enquiriesRouter = require('./routes/enquiries');
const enquiryEmailsRouter = require('./routes/enquiryEmails');
const updateEnquiryPOCRouter = require('./routes/updateEnquiryPOC');
const pitchesRouter = require('./routes/pitches');
const paymentsRouter = require('./routes/payments');
const instructionDetailsRouter = require('./routes/instruction-details');
const instructionsRouter = require('./routes/instructions');
const updateInstructionStatusRouter = require('./routes/updateInstructionStatus');
const documentsRouter = require('./routes/documents');
const demoDocumentsRouter = require('./routes/demo-documents');
const prospectDocumentsRouter = require('./routes/prospect-documents');
const enquiriesUnifiedRouter = require('./routes/enquiries-unified');
const mattersUnifiedRouter = require('./routes/mattersUnified');
const verifyIdRouter = require('./routes/verify-id');
const testDbRouter = require('./routes/test-db');
const teamLookupRouter = require('./routes/team-lookup');
const teamDataRouter = require('./routes/teamData');
const pitchTeamRouter = require('./routes/pitchTeam');
const proxyToAzureFunctionsRouter = require('./routes/proxyToAzureFunctions');
const fileMapRouter = require('./routes/fileMap');
const opsRouter = require('./routes/ops');
const sendEmailRouter = require('./routes/sendEmail');
const forwardEmailRouter = require('./routes/forwardEmail');
const searchInboxRouter = require('./routes/searchInbox');
const callrailCallsRouter = require('./routes/callrailCalls');
const attendanceRouter = require('./routes/attendance');
const reportingRouter = require('./routes/reporting');
const reportingStreamRouter = require('./routes/reporting-stream');
const homeMetricsStreamRouter = require('./routes/home-metrics-stream');
const poidRouter = require('./routes/poid');
const futureBookingsRouter = require('./routes/futureBookings');
const outstandingBalancesRouter = require('./routes/outstandingBalances');
const transactionsRouter = require('./routes/transactions');
const marketingMetricsRouter = require('./routes/marketing-metrics');
const cachePreheaterRouter = require('./routes/cache-preheater');
const clearCacheRouter = require('./routes/clearCache');
const teamsActivityTrackingRouter = require('./routes/teamsActivityTracking');
const pitchTrackingRouter = require('./routes/pitchTracking');
const enquiryEnrichmentRouter = require('./routes/enquiryEnrichment');
const claimEnquiryRouter = require('./routes/claimEnquiry');
const rateChangesRouter = require('./routes/rate-changes');
const cclDateRouter = require('./routes/ccl-date');
const expertsRouter = require('./routes/experts');
const counselRouter = require('./routes/counsel');
const techTicketsRouter = require('./routes/techTickets');
const logsStreamRouter = require('./routes/logs-stream');
const telemetryRouter = require('./routes/telemetry');
const { userContextMiddleware } = require('./middleware/userContext');

const app = express();
// Enable gzip compression if available, but skip SSE endpoints
if (compression) {
    app.use((req, res, next) => {
        // Skip compression for Server-Sent Events to avoid buffering
        if (req.path.startsWith('/api/reporting-stream') || req.path.startsWith('/api/home-metrics') || req.path.startsWith('/api/logs/stream') || req.path.startsWith('/api/ccl-date')) {
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            return next();
        }
        return compression()(req, res, next);
    });
}
const PORT = process.env.PORT || 8080;

// Initialize persistent operations log and add request logging middleware
initOpLog();
app.use((req, res, next) => {
    const start = Date.now();
    const ctx = { type: 'http', action: `${req.method} ${req.path}`, status: 'started' };
    opAppend(ctx);
    res.on('finish', () => {
        opAppend({ type: 'http', action: `${req.method} ${req.path}`, status: (res.statusCode >= 400 ? 'error' : 'success'), httpStatus: res.statusCode, durationMs: Date.now() - start });
    });
    next();
});

// Enable CORS: allow localhost in dev; restrict in production
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = isProd
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow same-origin/no-origin (curl, server-side)
        if (allowedOrigins.length === 0 && isProd) return callback(new Error('CORS blocked: no origins configured'));
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Reduce logging noise in production
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}
app.use(express.json());

// User context middleware - enriches requests with user info and logs sessions
app.use(userContextMiddleware);

app.use('/api/keys', keysRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/bundle', bundleRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/search-clio-contacts', searchClioContactsRouter);
app.use('/api/clio-client-query', clioClientQueryRouter);
app.use('/api/clio-client-lookup', clioClientLookupRouter);
app.use('/api/related-clients', relatedClientsRouter);
app.use('/api/matter-operations', matterOperationsRouter);
app.use('/api/matters', mattersRouter);
app.use('/api/getMatters', getMattersRouter);
// Deprecated: getAllMatters has been removed in favor of unified matters endpoint
app.use('/api/getAllMatters', (req, res) => {
    res.status(410).json({
        error: 'Deprecated endpoint',
        message: 'Use /api/matters-unified instead of /api/getAllMatters',
        replacement: '/api/matters-unified'
    });
});
app.use('/api/ccl', cclRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/enquiries-unified', enquiriesUnifiedRouter);
app.use('/api/updateEnquiryPOC', updateEnquiryPOCRouter);
app.use('/api/claimEnquiry', claimEnquiryRouter);
app.use('/api/matters-unified', mattersUnifiedRouter);
app.use('/api/enquiry-emails', enquiryEmailsRouter);
app.use('/api/ops', opsRouter);
// Email route (server-based). Expose under both /api and / to match existing callers.
app.use('/api', sendEmailRouter);
app.use('/', sendEmailRouter);
// Forward email route for timeline email forwarding functionality
app.use('/api', forwardEmailRouter);
// Search inbox route for email sync functionality
app.use('/api', searchInboxRouter);
// CallRail calls route for call tracking sync functionality
app.use('/api', callrailCallsRouter);
// app.post('/api/update-enquiry', require('../api/update-enquiry')); // Moved to enquiries-unified/update
// Register deal update endpoints (used by instruction cards editing)
app.post('/api/update-deal', require('./routes/updateDeal'));
app.post('/api/deal-capture', require('./routes/dealCapture'));
app.use('/api/deals', require('./routes/dealUpdate'));
app.use('/api/pitches', pitchesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/instruction-details', instructionDetailsRouter);
app.use('/api/instructions', instructionsRouter);
app.use('/api/update-instruction-status', updateInstructionStatusRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/demo-documents', demoDocumentsRouter);
app.use('/api/prospect-documents', prospectDocumentsRouter);
app.use('/api/verify-id', verifyIdRouter);
app.use('/api/test-db', testDbRouter);
app.use('/api/team-lookup', teamLookupRouter);
app.use('/api/team-data', teamDataRouter);
app.use('/api/pitch-team', pitchTeamRouter);
app.use('/api/file-map', fileMapRouter);
app.use('/api/reporting', reportingRouter);
app.use('/api/reporting-stream', reportingStreamRouter);
app.use('/api/home-metrics', homeMetricsStreamRouter);
app.use('/api/marketing-metrics', marketingMetricsRouter);
app.use('/api/cache-preheater', cachePreheaterRouter);
app.use('/api/cache', clearCacheRouter);
app.use('/api/teams-activity-tracking', teamsActivityTrackingRouter);
app.use('/api/pitch-tracking', pitchTrackingRouter);
app.use('/api/enquiry-enrichment', enquiryEnrichmentRouter);
app.use('/api/logs', logsStreamRouter);

// Rate change notification tracking (for Jan 2026 hourly rate increase)
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

// Metrics routes (migrated from Azure Functions to fix cold start issues)
app.use('/api/poid', poidRouter);
app.use('/api/future-bookings', futureBookingsRouter);
app.use('/api/outstanding-balances', outstandingBalancesRouter);
app.use('/api/transactions', transactionsRouter);

app.use('/ccls', express.static(CCL_DIR));

// Temporary debug helper: allow GET /api/update-deal?dealId=...&ServiceDescription=...&Amount=...
app.get('/api/update-deal', async (req, res) => {
    try {
        const updateDeal = require('./routes/updateDeal');
        // Shim req.body from query
        req.body = {
            dealId: req.query.dealId,
            ServiceDescription: req.query.ServiceDescription,
            Amount: req.query.Amount ? Number(req.query.Amount) : undefined,
        };
        return updateDeal(req, res);
    } catch (err) {
        console.error('Fallback GET /api/update-deal failed:', err);
        res.status(500).json({ error: 'Fallback update failed', details: String(err) });
    }
});

// Route registration logs removed to reduce startup noise

// Proxy routes to Azure Functions - these handle requests without /api/ prefix
app.use('/', proxyToAzureFunctionsRouter);

// API routes should come BEFORE static file serving and catch-all route
// This ensures API requests don't get caught by the catch-all route

const buildPath = path.join(__dirname, 'static');
// Only serve static files if the directory exists
const fs = require('fs');
if (fs.existsSync(buildPath)) {
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
    
    // Catch-all route for SPA - only for non-API routes
    app.get('*', (req, res) => {
        // Don't serve HTML for API routes
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.sendFile(path.join(buildPath, 'index.html'));
    });
} else {
    // Static build directory not found, serving API only
    // For non-API routes when no static files exist
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.status(404).json({ error: 'Static files not available' });
    });
}

app.listen(PORT, () => {
    // Server started
});