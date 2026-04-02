const path = require('path');

// ── Application Insights (must init BEFORE express so HTTP is auto-instrumented) ──
const appInsights = require('./utils/appInsights');
appInsights.init();
const { trackEvent, trackException, trackMetric } = appInsights;
const serverBootStartedAt = Date.now();
trackEvent('Server.Boot.Started', {
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
});

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
const { devMiddleware, banner, annotate, status: devStatus } = require('./utils/devConsole');
// Optional compression (safe if not installed)
let compression;
try { compression = require('compression'); } catch { /* optional */ }
const { init: initOpLog, append: opAppend, sessionId: opSessionId } = require('./utils/opLog');
const { getRedisClient } = require('./utils/redisClient');
const { getPool } = require('./utils/db');
const { getSecret } = require('./utils/getSecret');
const { startDataOperationsScheduler } = require('./utils/dataOperationsScheduler');
const { setStatus: setServerStatus } = require('./utils/serverStatus');

const isRedacted = (value) => typeof value === 'string' && value.includes('<REDACTED>');

// Connection status tracking for dev banner
const _connStatus = { redis: null, sql: null, instructionsSql: null, clio: null };

async function buildConnectionString({ server, database, user, secretName }) {
    const password = await getSecret(secretName);
    if (!password || isRedacted(password)) {
        throw new Error(`Missing or redacted SQL password secret: ${secretName}`);
    }
    // Store raw password in env so routes that independently fetch it (e.g. attendance) skip Key Vault
    const envKey = secretName.replace(/-/g, '_').toUpperCase();
    if (!process.env[envKey]) process.env[envKey] = password;
    return `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

async function hydrateSqlConnectionStringsFromKeyVault() {
    const coreConn = process.env.SQL_CONNECTION_STRING;
    const vnetConn = process.env.SQL_CONNECTION_STRING_VNET;
    if ((!coreConn || isRedacted(coreConn)) && vnetConn && !isRedacted(vnetConn)) {
        process.env.SQL_CONNECTION_STRING = vnetConn;
        console.log('[Secrets] SQL_CONNECTION_STRING set from SQL_CONNECTION_STRING_VNET');
    }
    if (!coreConn || isRedacted(coreConn)) {
        const server = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
        const database = process.env.SQL_DATABASE_NAME || 'helix-core-data';
        const user = process.env.SQL_USER_NAME || 'helix-database-server';
        const secretName = process.env.SQL_PASSWORD_SECRET_NAME || process.env.SQL_SERVER_PASSWORD_KEY || 'sql-databaseserver-password';

        try {
            process.env.SQL_CONNECTION_STRING = await buildConnectionString({ server, database, user, secretName });
            console.log('[Secrets] SQL_CONNECTION_STRING resolved via Key Vault');
        } catch (error) {
            console.warn('[Secrets] Failed to resolve SQL_CONNECTION_STRING via Key Vault:', error?.message || error);
        }
    }

    const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn || isRedacted(instructionsConn)) {
        const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
        const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
        const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
        const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';

        try {
            process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = await buildConnectionString({ server, database, user, secretName });
            console.log('[Secrets] INSTRUCTIONS_SQL_CONNECTION_STRING resolved via Key Vault');
        } catch (error) {
            console.warn('[Secrets] Failed to resolve INSTRUCTIONS_SQL_CONNECTION_STRING via Key Vault:', error?.message || error);
        }
    }
}

// Warm up connections in background (non-blocking)
async function warmupConnections() {
    trackEvent('Server.Boot.Warmup.Scheduled', {
        tier1DelayMs: 3000,
        tier2DelayMs: 5000,
    });
    // Warm up Redis
    getRedisClient()
        .then(() => { _connStatus.redis = true; setServerStatus('redis', true); devStatus('Redis', true, 'connected'); })
        .catch(() => { _connStatus.redis = false; setServerStatus('redis', false); devStatus('Redis', false, 'connection failed — will retry on first use'); });
    
    // Warm up SQL connection pool with main database
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (connStr) {
        getPool(connStr)
            .then(() => { _connStatus.sql = true; setServerStatus('sql', true); devStatus('Core SQL', true, 'pool ready'); })
            .catch(() => { _connStatus.sql = false; setServerStatus('sql', false); devStatus('Core SQL', false, 'pool failed — will retry on first use'); });
    }

    // Warm up Instructions SQL pool
    const instrConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (instrConn) {
        getPool(instrConn)
            .then(() => { _connStatus.instructionsSql = true; setServerStatus('instructionsSql', true); devStatus('Instructions SQL', true, 'pool ready'); })
            .catch(() => { _connStatus.instructionsSql = false; setServerStatus('instructionsSql', false); devStatus('Instructions SQL', false, 'pool failed'); });
    }

    // Pre-warm Clio API credentials from Key Vault
    // Eliminates ~3.7s cold-start penalty on first /api/home-wip call
    try {
        const homeWip = require('./routes/home-wip');
        if (typeof homeWip.warmupClioCredentials === 'function') {
            homeWip.warmupClioCredentials()
                .then(() => { _connStatus.clio = true; setServerStatus('clio', true); devStatus('Clio creds', true, 'pre-warmed'); })
                .catch((err) => {
                    _connStatus.clio = false; setServerStatus('clio', false);
                    devStatus('Clio creds', false, `cold — ${err?.message || err}`);
                });
        }
    } catch { /* ignore — route not loaded yet */ }

    // ─── Aggressive data pre-warming ───────────────────────────────────
    // Fire-and-forget: populate caches for ALL heavy endpoints so the first
    // user gets instant hits. Runs 3s after listen (server must be accepting).
    // Tier 1 (fast, no external API): attendance, annual leave, ops-queue SQL.
    // Tier 2 (Clio API, slower): team WIP aggregate — chains after Clio creds.
    setTimeout(() => {
        const http = require('http');
        const port = process.env.PORT || 8080;
        trackEvent('Server.Boot.Warmup.Tier1.Started', { port });

        const warmup = (ep) => {
            const body = ep.body ? JSON.stringify(ep.body) : '';
            const headers = { 'Content-Type': 'application/json' };
            if (body) headers['Content-Length'] = Buffer.byteLength(body);
            const startedAt = Date.now();
            const req = http.request({ hostname: '127.0.0.1', port, path: ep.path, method: ep.method, headers }, (res) => {
                res.resume();
                devStatus(`Warmup ${ep.label || ep.path}`, res.statusCode < 400, `${res.statusCode}`);
                const durationMs = Date.now() - startedAt;
                trackEvent('Server.Boot.Warmup.Endpoint.Completed', {
                    label: ep.label || ep.path,
                    path: ep.path,
                    method: ep.method,
                    statusCode: res.statusCode,
                    success: res.statusCode < 400,
                });
                trackMetric('Server.Boot.Warmup.Endpoint.Duration', durationMs, {
                    label: ep.label || ep.path,
                    path: ep.path,
                    method: ep.method,
                    statusCode: res.statusCode,
                });
            });
            req.on('error', (error) => {
                const durationMs = Date.now() - startedAt;
                trackException(error instanceof Error ? error : new Error(String(error)), {
                    component: 'ServerBoot',
                    operation: 'WarmupEndpoint',
                    label: ep.label || ep.path,
                    path: ep.path,
                    method: ep.method,
                });
                trackEvent('Server.Boot.Warmup.Endpoint.Failed', {
                    label: ep.label || ep.path,
                    path: ep.path,
                    method: ep.method,
                    error: error?.message || String(error),
                });
                trackMetric('Server.Boot.Warmup.Endpoint.Duration', durationMs, {
                    label: ep.label || ep.path,
                    path: ep.path,
                    method: ep.method,
                    statusCode: 'error',
                });
            });
            if (body) req.write(body);
            req.end();
        };

        // Tier 1 — fire all immediately (SQL-only, fast)
        const tier1 = [
            { path: '/api/attendance/getAttendance', method: 'POST', label: 'Attendance' },
            { path: '/api/attendance/getAnnualLeave', method: 'POST', body: {}, label: 'Annual Leave' },
            { path: '/api/ops-queue/pending', method: 'GET', label: 'Ops Pending' },
            { path: '/api/ops-queue/recent', method: 'GET', label: 'Ops Recent' },
            { path: '/api/ops-queue/ccl-dates-pending', method: 'GET', label: 'CCL Dates' },
            { path: '/api/ops-queue/transactions-pending?range=mtd', method: 'GET', label: 'Transactions' },
            { path: '/api/ops-queue/asana-account-tasks?initials=KW', method: 'GET', label: 'Asana Tasks' },
        ];
        for (const ep of tier1) warmup(ep);

        // Tier 2 — team WIP aggregate (Clio API, ~30-90s but pre-fills all 32 per-user caches)
        // Delayed 5s extra to let Clio creds finish warming
        setTimeout(() => {
            trackEvent('Server.Boot.Warmup.Tier2.Started', { port, label: 'Team WIP (aggregate)' });
            warmup({ path: '/api/home-wip/team', method: 'GET', label: 'Team WIP (aggregate)' });
        }, 5000);

        // Periodic cache warming — re-heats high-value datasets when TTL drops below 5 min
        const { schedulePeriodicCacheWarming } = require('./utils/smartCache');
        schedulePeriodicCacheWarming();
    }, 3000);
}

// Hydrate SQL secrets from Key Vault BEFORE accepting requests.
// Stored as a module-level promise so app.listen() can await it.
const _hydrationReady = (async () => {
    const startedAt = Date.now();
    try {
        await hydrateSqlConnectionStringsFromKeyVault();
        const durationMs = Date.now() - startedAt;
        trackEvent('Server.Boot.Secrets.Completed', {});
        trackMetric('Server.Boot.Secrets.Duration', durationMs, {});
        warmupConnections();
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error instanceof Error ? error : new Error(String(error)), {
            component: 'ServerBoot',
            operation: 'HydrateSecrets',
        });
        trackEvent('Server.Boot.Secrets.Failed', {
            error: error?.message || String(error),
        });
        trackMetric('Server.Boot.Secrets.Duration', durationMs, { status: 'failed' });
        warmupConnections();
    }
})();
const keysRouter = require('./routes/keys');
const refreshRouter = require('./routes/refresh');
const matterRequestsRouter = require('./routes/matterRequests');
const matterAuditRouter = require('./routes/matter-audit');
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
const cclAiRouter = require('./routes/ccl-ai');
const aiCommsRouter = require('./routes/ai-comms');
const cclAdminRouter = require('./routes/ccl-admin');

const updateEnquiryPOCRouter = require('./routes/updateEnquiryPOC');
const pitchesRouter = require('./routes/pitches');
const paymentsRouter = require('./routes/payments');
const instructionDetailsRouter = require('./routes/instruction-details');
const instructionsRouter = require('./routes/instructions');
const updateInstructionStatusRouter = require('./routes/updateInstructionStatus');
const documentsRouter = require('./routes/documents');
const demoDocumentsRouter = require('./routes/demo-documents');
const prospectDocumentsRouter = require('./routes/prospect-documents');
const docWorkspaceRouter = require('./routes/doc-workspace');
const enquiriesUnifiedRouter = require('./routes/enquiries-unified');
const mattersUnifiedRouter = require('./routes/mattersUnified');
const verifyIdRouter = require('./routes/verify-id');
const testDbRouter = require('./routes/test-db');
const teamLookupRouter = require('./routes/team-lookup');
const teamDataRouter = require('./routes/teamData');
const userDataRouter = require('./routes/userData');
const pitchTeamRouter = require('./routes/pitchTeam');
const proxyToAzureFunctionsRouter = require('./routes/proxyToAzureFunctions');
const fileMapRouter = require('./routes/fileMap');
const paymentLinkRouter = require('./routes/paymentLink');
const stripeWebhookRouter = require('./routes/stripeWebhook');
const opsRouter = require('./routes/ops');
const sendEmailRouter = require('./routes/sendEmail');
const forwardEmailRouter = require('./routes/forwardEmail');
const searchInboxRouter = require('./routes/searchInbox');
const callrailCallsRouter = require('./routes/callrailCalls');
const dubberCallsRouter = require('./routes/dubberCalls');
const attendanceRouter = require('./routes/attendance');
const resourcesAnalyticsRouter = require('./routes/resources-analytics');
const resourcesCoreRouter = require('./routes/resources-core');
const reportingRouter = require('./routes/reporting');
const reportingStreamRouter = require('./routes/reporting-stream');
const homeMetricsStreamRouter = require('./routes/home-metrics-stream');
const complianceRouter = require('./routes/compliance');
const homeWipRouter = require('./routes/home-wip');
const homeEnquiriesRouter = require('./routes/home-enquiries');
const poidRouter = require('./routes/poid');
const futureBookingsRouter = require('./routes/futureBookings');
const outstandingBalancesRouter = require('./routes/outstandingBalances');
const matterMetricsRouter = require('./routes/matter-metrics');
const transactionsRouter = require('./routes/transactions');
const transactionsV2Router = require('./routes/transactionsV2');
const marketingMetricsRouter = require('./routes/marketing-metrics');
const cachePreheaterRouter = require('./routes/cache-preheater');
const clearCacheRouter = require('./routes/clearCache');
const teamsActivityTrackingRouter = require('./routes/teamsActivityTracking');
const pitchTrackingRouter = require('./routes/pitchTracking');
const enquiryEnrichmentRouter = require('./routes/enquiryEnrichment');
const peopleSearchRouter = require('./routes/people-search');
const claimEnquiryRouter = require('./routes/claimEnquiry');
const rateChangesRouter = require('./routes/rate-changes');
const cclDateRouter = require('./routes/ccl-date');
const cclOpsRouter = require('./routes/ccl-ops');
const expertsRouter = require('./routes/experts');
const counselRouter = require('./routes/counsel');
const syncInstructionClientRouter = require('./routes/sync-instruction-client');
const techTicketsRouter = require('./routes/techTickets');
const logsStreamRouter = require('./routes/logs-stream');
const telemetryRouter = require('./routes/telemetry');
const bookSpaceRouter = require('./routes/bookSpace');
const financialTaskRouter = require('./routes/financialTask');
const releaseNotesRouter = require('./routes/release-notes');
const opsQueueRouter = require('./routes/opsQueue');
const { router: dataOperationsRouter } = require('./routes/dataOperations');
const yoyComparisonRouter = require('./routes/yoy-comparison');
const formHealthCheckRouter = require('./routes/formHealthCheck');
const { userContextMiddleware } = require('./middleware/userContext');

const app = express();
// Enable gzip compression if available, but skip SSE endpoints
if (compression) {
    app.use((req, res, next) => {
        // Skip compression for Server-Sent Events to avoid buffering
        if (req.path.startsWith('/api/reporting-stream') || req.path.startsWith('/api/home-metrics') || req.path.startsWith('/api/logs/stream') || req.path.startsWith('/api/ccl-date') || req.path.startsWith('/api/enquiries-unified/stream') || req.path.startsWith('/api/attendance/annual-leave/stream') || req.path.startsWith('/api/attendance/attendance/stream') || req.path.startsWith('/api/future-bookings/stream') || req.path.startsWith('/api/data-operations/stream')) {
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

// Enable CORS: allow localhost in dev; restrict in production.
// IMPORTANT: SSE endpoints (e.g. /api/logs/stream) must work reliably behind proxies.
// Some browsers include an Origin header even for same-origin EventSource requests.
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = isProd
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : [])
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const isSameOriginRequest = (req, origin) => {
    if (!origin) return true;
    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = forwardedHost || req.headers.host;
    if (!rawHost) return false;
    const host = String(rawHost).split(',')[0].trim();
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = (forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol) || 'https';
    const expected = `${proto}://${host}`;
    return origin === expected;
};

app.use(cors((req, callback) => {
    const origin = req.header('Origin');
    const allow = !origin || allowedOrigins.includes(origin) || isSameOriginRequest(req, origin);

    // If Origin is missing, let the request through without forcing CORS headers.
    // If Origin is present and allowed, reflect it (required when credentials are used).
    const corsOptions = {
        origin: origin ? (allow ? origin : false) : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        // EventSource reconnects may include Last-Event-ID; some environments add Cache-Control.
        allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Last-Event-ID'],
    };

    return callback(null, corsOptions);
}));

// Dev console: structured request logger (replaces morgan in dev)
if (process.env.NODE_ENV !== 'production') {
    app.use(devMiddleware);
}

// Stripe webhooks require the *raw* request body for signature verification.
// This must be registered before express.json().
app.use('/api/stripe/webhook', stripeWebhookRouter);

// Financial forms can include base64 file uploads; default 100kb limit is too small.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// User context middleware - enriches requests with user info and logs sessions
app.use(userContextMiddleware);

app.use('/api/keys', keysRouter);
app.use('/api/refresh', refreshRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/matter-audit', matterAuditRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/bundle', bundleRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/sync-instruction-client', syncInstructionClientRouter);
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
app.use('/api/ccl-ai', cclAiRouter);
app.use('/api/ai/pressure-test-comms', aiCommsRouter);
app.use('/api/ccl-admin', cclAdminRouter);
app.use('/api/ccl-ops', cclOpsRouter);
app.use('/api/enquiries-unified', enquiriesUnifiedRouter);
app.use('/api/home-wip', homeWipRouter);
app.use('/api/home-enquiries', homeEnquiriesRouter);
app.use('/api/updateEnquiryPOC', updateEnquiryPOCRouter);
app.use('/api/claimEnquiry', claimEnquiryRouter);
app.use('/api/matters-unified', mattersUnifiedRouter);
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
// Dubber calls route for Dubber recording/transcript queries
app.use('/api', dubberCallsRouter);
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
app.use('/api/doc-workspace', docWorkspaceRouter);
app.use('/api/verify-id', verifyIdRouter);
app.use('/api/test-db', testDbRouter);
app.use('/api/team-lookup', teamLookupRouter);
app.use('/api/team-data', teamDataRouter);
app.use('/api/user-data', userDataRouter);
app.use('/api/pitch-team', pitchTeamRouter);
app.use('/api/file-map', fileMapRouter);
app.use('/api/payment-link', paymentLinkRouter);
app.use('/api/reporting', reportingRouter);
app.use('/api/reporting-stream', reportingStreamRouter);
app.use('/api/home-metrics', homeMetricsStreamRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/marketing-metrics', marketingMetricsRouter);
app.use('/api/cache-preheater', cachePreheaterRouter);
app.use('/api/cache', clearCacheRouter);
app.use('/api/teams-activity-tracking', teamsActivityTrackingRouter);
app.use('/api/pitch-tracking', pitchTrackingRouter);
app.use('/api/enquiry-enrichment', enquiryEnrichmentRouter);
app.use('/api/people-search', peopleSearchRouter);
app.use('/api/logs', logsStreamRouter);
app.use('/api/release-notes', releaseNotesRouter);
app.use('/api/ops-queue', opsQueueRouter);

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

// Data operations (collected time, WIP sync) - manual triggers for Data Centre
app.use('/api/data-operations', dataOperationsRouter);

// Year-over-Year comparison (WIP, Collected, Matters) — Management Dashboard
app.use('/api/yoy-comparison', yoyComparisonRouter);

// IMPORTANT: Attendance routes must come BEFORE proxy routes to avoid conflicts
app.use('/api/attendance', attendanceRouter);
app.use('/api/resources/analytics', resourcesAnalyticsRouter);
app.use('/api/resources/core', resourcesCoreRouter);

// Book space and financial task routes (migrated from Azure Functions)
app.use('/api/book-space', bookSpaceRouter);
app.use('/api/financial-task', financialTaskRouter);

// Form health checks (admin-only, non-destructive endpoint probes)
app.use('/api/form-health', formHealthCheckRouter);

// Route health (dev indicator — probes all registered routes)
const registersRouter = require('./routes/registers');
app.use('/api/registers', registersRouter);

const routeHealthRouter = require('./routes/routeHealth');
app.use('/api/route-health', routeHealthRouter);

// Server component health
const healthRouter = require('./routes/health');
app.use('/api/health', healthRouter);

// Metrics routes (migrated from Azure Functions to fix cold start issues)
app.use('/api/poid', poidRouter);
app.use('/api/future-bookings', futureBookingsRouter);
app.use('/api/outstanding-balances', outstandingBalancesRouter);
app.use('/api/matter-metrics', matterMetricsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/transactions-v2', transactionsV2Router);
app.use('/api/migration', require('./routes/legacyMigration'));

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

// Prefer serving the latest CRA build output from the repo root.
// Fallback to the packaged `server/static` directory if present.
const fs = require('fs');
const rootBuildPath = path.resolve(__dirname, '..', 'build');
const packagedBuildPath = path.join(__dirname, 'static');
const buildPath = fs.existsSync(rootBuildPath) ? rootBuildPath : packagedBuildPath;

// Only serve static files if the chosen directory exists
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

// Error handling middleware (must be after all routes)
// Ensures API callers get JSON rather than IIS/HTML error pages.
app.use((error, req, res, next) => {
    const arrLogId = req.get('x-arr-log-id');
    const status = typeof error?.status === 'number' ? error.status : 500;

    // Common body-parser errors
    const isTooLarge =
        error?.type === 'entity.too.large' ||
        error?.name === 'PayloadTooLargeError' ||
        error?.statusCode === 413;

    const safeStatus = isTooLarge ? 413 : status;
    const message = isTooLarge
        ? 'Request body too large'
        : (error?.message || 'Internal server error');

    console.error('[server] Error:', {
        method: req.method,
        path: req.originalUrl,
        status: safeStatus,
        arrLogId,
        name: error?.name,
        type: error?.type,
        message,
    });

    if (req.originalUrl?.startsWith('/api/')) {
        return res.status(safeStatus).json({
            error: isTooLarge ? 'payload_too_large' : 'internal_error',
            message,
            arrLogId,
            timestamp: new Date().toISOString(),
        });
    }

    return res.status(safeStatus).send(message);
});

// Wait for Key Vault secrets before accepting connections — eliminates
// ELOGIN race where routes query SQL before credentials are hydrated.
_hydrationReady.then(() => {
    app.listen(PORT, () => {
        const bootDurationMs = Date.now() - serverBootStartedAt;
        banner({
            port: PORT,
            redis: _connStatus.redis,
            sql: _connStatus.sql,
            instructionsSql: _connStatus.instructionsSql,
            clio: _connStatus.clio,
            scheduler: true,
        });
        setServerStatus('scheduler', true);
        startDataOperationsScheduler();
        trackEvent('Server.Boot.ListenReady', { port: PORT });
        trackMetric('Server.Boot.Listen.Duration', bootDurationMs, { port: PORT });
    });
});

// Flush App Insights telemetry on graceful shutdown
process.on('SIGTERM', async () => {
    await appInsights.flush();
    process.exit(0);
});
process.on('SIGINT', async () => {
    await appInsights.flush();
    process.exit(0);
});