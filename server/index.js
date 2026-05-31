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

// Dev-only boot timing markers. Set HELIX_BOOT_TIMING=1 to print elapsed-ms
// for each landmark, so we can pinpoint which require chain or top-level
// await is eating the wall-clock budget during `npm run dev:all`.
// `dev-all-with-logs.mjs` enables this by default; pass HELIX_BOOT_TIMING=0
// to silence.
const _bootTimingEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.HELIX_BOOT_TIMING &&
    process.env.HELIX_BOOT_TIMING !== '0' &&
    process.env.HELIX_BOOT_TIMING !== 'false';
function _bootMark(label) {
    if (_bootTimingEnabled) {
        const elapsed = Date.now() - serverBootStartedAt;
        console.log(`[boot-timing] +${String(elapsed).padStart(6, ' ')}ms  ${label}`);
    }
}
_bootMark('appinsights:ready');

//
// 🟢 THIS IS THE MAIN SERVER FILE - server/index.js 🟢
//
// When adding new routes:
// 1. Add require('./routes/yourRoute') in the imports section below
// 2. Add app.use('/api/your-path', yourRouter) in the route registration section
// 3. Restart the server to pick up new routes
//
// Both dev and production use this file (deploy scripts copy it as server.js).
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

// Validate env vars immediately after loading — crash fast in prod, warn in dev
const { validateEnv } = require('./utils/envSchema');
validateEnv();
_bootMark('env:validated');

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
const { startDataOperationsScheduler, stopScheduler, getSchedulerState } = require('./utils/dataOperationsScheduler');
const { startEventPoller, POLL_INTERVAL_MS } = require('./utils/eventPoller');
const { requestTrackerMiddleware } = require('./utils/requestTracker');
const { setStatus: setServerStatus } = require('./utils/serverStatus');
const { processHubAuditMiddleware } = require('./middleware/processHubAudit');
_bootMark('core-utils:loaded');

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
    let coreConn = process.env.SQL_CONNECTION_STRING;
    const vnetConn = process.env.SQL_CONNECTION_STRING_VNET;
    if ((!coreConn || isRedacted(coreConn)) && vnetConn && !isRedacted(vnetConn)) {
        process.env.SQL_CONNECTION_STRING = vnetConn;
        coreConn = vnetConn;
        console.log('[Secrets] SQL_CONNECTION_STRING set from SQL_CONNECTION_STRING_VNET');
    }

    const hydrationTasks = [];

    if (!coreConn || isRedacted(coreConn)) {
        hydrationTasks.push((async () => {
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
        })());
    }

    const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn || isRedacted(instructionsConn)) {
        hydrationTasks.push((async () => {
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
        })());
    }

    await Promise.all(hydrationTasks);
}

// Warm up connections in background (non-blocking)
async function warmupConnections() {
    const shouldRunAggressiveWarmups = process.env.NODE_ENV === 'production' || process.env.FORCE_BOOT_WARMUPS === 'true';
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

    // Phase Access.1 — pre-warm the AccessGrants resolver cache so the very
    // first authed request gets the data-driven tier resolution rather than
    // falling through to the constant-based heuristic.
    try {
        const access = require('./utils/access');
        access.warm()
            .then(() => devStatus('Access grants', true, `cached (${access.getCacheStatus().source})`))
            .catch((err) => devStatus('Access grants', false, `warm failed — ${err?.message || err}`));
    } catch { /* resolver not present yet */ }

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

    if (!shouldRunAggressiveWarmups) {
        trackEvent('Server.Boot.Warmup.Skipped', { reason: 'local-dev' });
        return;
    }

    // ─── Aggressive data pre-warming ───────────────────────────────────
    // Fire-and-forget: populate caches for ALL heavy endpoints so the first
    // user gets instant hits. Runs 3s after listen (server must be accepting).
    // Tier 1 (fast, no external API): attendance, annual leave, ops-queue SQL.
    // Tier 2 (Clio API, slower): team WIP aggregate — chains after Clio creds.
    setTimeout(() => {
        const http = require('http');
        const port = process.env.PORT || 8080;
        trackEvent('Server.Boot.Warmup.Tier1.Started', { port });

        const buildWarmupRequestOptions = (ep, headers) => {
            const options = { path: ep.path, method: ep.method, headers };
            if (typeof port === 'string' && port.startsWith('\\\\.\\pipe\\')) {
                options.socketPath = port;
            } else {
                options.hostname = '127.0.0.1';
                options.port = port;
            }
            return options;
        };

        const warmup = (ep) => {
            const body = ep.body ? JSON.stringify(ep.body) : '';
            const headers = { 'Content-Type': 'application/json' };
            if (body) headers['Content-Length'] = Buffer.byteLength(body);
            const startedAt = Date.now();
            const req = http.request(buildWarmupRequestOptions(ep, headers), (res) => {
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
            { path: '/api/home-enquiries/', method: 'GET', label: 'Home Enquiries' },
            { path: '/api/ops-queue/pending', method: 'GET', label: 'Ops Pending' },
            { path: '/api/ops-queue/recent', method: 'GET', label: 'Ops Recent' },
            { path: '/api/ops-queue/ccl-dates-pending', method: 'GET', label: 'CCL Dates' },
            { path: '/api/ops-queue/transactions-pending?range=mtd', method: 'GET', label: 'Transactions' },
            { path: '/api/ops-queue/asana-account-tasks?initials=KW', method: 'GET', label: 'Asana Tasks' },
            { path: '/api/enquiries-unified/', method: 'GET', label: 'Enquiries Unified' },
            { path: '/api/home-journey/?initials=KW', method: 'GET', label: 'Home Journey' },
            { path: '/api/reporting/management-datasets?datasets=recoveredFeesSummary&firm=true', method: 'GET', label: 'Collected (firm)' },
            { path: '/api/outstanding-balances/', method: 'GET', label: 'Outstanding Balances' },
            { path: '/api/doc-workspace/pending-actions', method: 'GET', label: 'Doc Workspace Pending' },
            { path: '/api/documents/pending-transfers', method: 'GET', label: 'Pending Transfers' },
            { path: '/api/future-bookings', method: 'GET', label: 'Future Bookings' },
            { path: '/api/todo?scope=all', method: 'GET', label: 'Todo (all)' },
        ];
        for (const ep of tier1) warmup(ep);

        // Tier 2 — team WIP aggregate (Clio API, ~30-90s but pre-fills all 32 per-user caches)
        // Delayed 5s extra to let Clio creds finish warming
        setTimeout(() => {
            trackEvent('Server.Boot.Warmup.Tier2.Started', { port, label: 'Team WIP (aggregate)' });
            warmup({ path: '/api/home-wip/team', method: 'GET', label: 'Team WIP (aggregate)' });

            // Periodic pre-warm: keep team WIP aggregate cache permanently warm so
            // dev-owner Home boots after a quiet period don't pay for the cold
            // Clio fan-out. Cheap (~one Clio fan-out every 90s) but eliminates the
            // worst-case Home boot latency for the dev-owner view.
            try {
                if (typeof homeWipRouter.startTeamWipPrewarm === 'function') {
                    homeWipRouter.startTeamWipPrewarm();
                }
            } catch (err) {
                trackEvent('Server.Boot.Warmup.TeamWipPrewarm.Failed', {
                    error: err?.message || String(err),
                });
            }
        }, 5000);

        // Periodic cache warming — re-heats high-value datasets when TTL drops below 5 min
        const { schedulePeriodicCacheWarming } = require('./utils/smartCache');
        schedulePeriodicCacheWarming();
    }, 3000);
}

// Hydrate SQL secrets from Key Vault BEFORE accepting requests.
// Stored as a module-level promise so the readiness gate middleware can await it.
let _hydrationDone = false;
const _hydrationReady = (async () => {
    _bootMark('hydration:started');
    const startedAt = Date.now();
    try {
        await hydrateSqlConnectionStringsFromKeyVault();
        const durationMs = Date.now() - startedAt;
        _bootMark('hydration:completed');
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
    } finally {
        _hydrationDone = true;
    }
})();
_bootMark('routes:require:start');
if (_bootTimingEnabled && !global.__helixBootRequirePatched) {
    const Module = require('module');
    const originalLoad = Module._load;
    const bootParentFile = __filename;

    global.__helixBootRequirePatched = true;
    Module._load = function helixBootTimedLoad(request, parent, isMain) {
        const isTopLevelBootRequire =
            parent?.filename === bootParentFile
            && typeof request === 'string'
            && (request.startsWith('./routes/') || request.startsWith('./middleware/'));

        if (!isTopLevelBootRequire) {
            return originalLoad.apply(this, arguments);
        }

        const startedAt = Date.now();
        console.log(`[boot-timing] require:start ${request}`);
        try {
            return originalLoad.apply(this, arguments);
        } finally {
            console.log(`[boot-timing] require:done ${request} +${Date.now() - startedAt}ms`);
        }
    };
}
// ── Lazy route loader (Phase B1 of DEV_LOOP_COLD_BOOT_PERFORMANCE_OVERHAUL) ──
// Defers `require()` of each route module until the first request hits its
// mount point. Cold boot drops from ~170s to a few seconds because the heavy
// SDK closures (mssql, @azure/storage-blob, stripe, openai, docx, puppeteer,
// pdf-lib, ...) only load when actually needed.
//
// `loader` is either a module path string (most common) or a function that
// returns the actual router (used for named exports e.g. `{ router }`).
// `module.exports` is captured once and reused for subsequent requests.
function lazyRouter(loader) {
    let cached = null;
    const proxy = function lazyRouterMiddleware(req, res, next) {
        if (!cached) {
            const resolved = typeof loader === 'function' ? loader() : require(loader);
            if (typeof resolved !== 'function') {
                return next(new Error(`lazyRouter: ${loader} did not resolve to a router function`));
            }
            cached = resolved;
        }
        return cached(req, res, next);
    };
    return proxy;
}

// Eager — has top-level side effects (setInterval) so it must register at boot.
const openAnotherMatterRouter = require('./routes/openAnotherMatter');
// Eager — CCL_DIR is consumed below by express.static() outside any handler.
const { router: cclRouter, CCL_DIR } = require('./routes/ccl');
// Eager — middleware used directly via app.use(), not as a route router.
const { userContextMiddleware } = require('./middleware/userContext');
const errorHandler = require('./middleware/errorHandler');

// Lazy — every other route deferred to first-request load.
const keysRouter = lazyRouter('./routes/keys');
const refreshRouter = lazyRouter('./routes/refresh');
const matterRequestsRouter = lazyRouter('./routes/matterRequests');
const matterAuditRouter = lazyRouter('./routes/matter-audit');
const opponentsRouter = lazyRouter('./routes/opponents');
const clioContactsRouter = lazyRouter('./routes/clioContacts');
const clioMattersRouter = lazyRouter('./routes/clioMatters');
const searchClioContactsRouter = lazyRouter('./routes/searchClioContacts');
const clioClientQueryRouter = lazyRouter('./routes/clio-client-query');
const clioClientLookupRouter = lazyRouter('./routes/clio-client-lookup');
const relatedClientsRouter = lazyRouter('./routes/related-clients');
const matterOperationsRouter = lazyRouter('./routes/matter-operations');
const mattersRouter = lazyRouter('./routes/matters');
const getMattersRouter = lazyRouter('./routes/getMatters');
const riskAssessmentsRouter = lazyRouter('./routes/riskAssessments');
const bundleRouter = lazyRouter('./routes/bundle');
const cclAiRouter = lazyRouter('./routes/ccl-ai');
const commsFrameworkRouter = lazyRouter('./routes/comms-framework');
const promptCoachRouter = lazyRouter('./routes/prompt-coach');
const cclAdminRouter = lazyRouter('./routes/ccl-admin');
const formsAiRouter = lazyRouter('./routes/formsAi');

const updateEnquiryPOCRouter = lazyRouter('./routes/updateEnquiryPOC');
const pitchesRouter = lazyRouter('./routes/pitches');
const paymentsRouter = lazyRouter('./routes/payments');
const instructionDetailsRouter = lazyRouter('./routes/instruction-details');
const instructionsRouter = lazyRouter('./routes/instructions');
const updateInstructionStatusRouter = lazyRouter('./routes/updateInstructionStatus');
const documentsRouter = lazyRouter('./routes/documents');
const demoDocumentsRouter = lazyRouter('./routes/demo-documents');
const prospectDocumentsRouter = lazyRouter('./routes/prospect-documents');
const docRequestDealsRouter = lazyRouter('./routes/doc-request-deals');
const docWorkspaceRouter = lazyRouter('./routes/doc-workspace');
const enquiriesUnifiedRouter = lazyRouter('./routes/enquiries-unified');
const mattersUnifiedRouter = lazyRouter('./routes/mattersUnified');
const verifyIdRouter = lazyRouter('./routes/verify-id');
const testDbRouter = lazyRouter('./routes/test-db');
const teamLookupRouter = lazyRouter('./routes/team-lookup');
const teamDataRouter = lazyRouter('./routes/teamData');
const userDataRouter = lazyRouter('./routes/userData');
const pitchTeamRouter = lazyRouter('./routes/pitchTeam');
const fileMapRouter = lazyRouter('./routes/fileMap');
const paymentLinkRouter = lazyRouter('./routes/paymentLink');
const stripeWebhookRouter = lazyRouter('./routes/stripeWebhook');
const clioWebhookRouter = lazyRouter('./routes/clio-webhook');
const opsRouter = lazyRouter('./routes/ops');
const sendEmailRouter = lazyRouter('./routes/sendEmail');
const emailSignatureRouter = lazyRouter('./routes/emailSignature');
const demoCheatSheetRouter = lazyRouter('./routes/demoCheatSheet');
const createDraftRouter = lazyRouter('./routes/createDraft');
const forwardEmailRouter = lazyRouter('./routes/forwardEmail');
const searchInboxRouter = lazyRouter('./routes/searchInbox');
const callrailCallsRouter = lazyRouter('./routes/callrailCalls');
const dubberCallsRouter = lazyRouter('./routes/dubberCalls');
const homeJourneyRouter = lazyRouter('./routes/home-journey');
const attendanceRouter = lazyRouter('./routes/attendance');
const resourcesAnalyticsRouter = lazyRouter('./routes/resources-analytics');
const resourcesCoreRouter = lazyRouter('./routes/resources-core');
const reportingRouter = lazyRouter('./routes/reporting');
const reportingStreamRouter = lazyRouter('./routes/reporting-stream');
const homeMetricsStreamRouter = lazyRouter('./routes/home-metrics-stream');
const complianceRouter = lazyRouter('./routes/compliance');
const homeWipRouter = lazyRouter('./routes/home-wip');
const homeEnquiriesRouter = lazyRouter('./routes/home-enquiries');
const mattersNewSpaceRouter = lazyRouter('./routes/mattersNewSpace');
const poidRouter = lazyRouter('./routes/poid');
const futureBookingsRouter = lazyRouter('./routes/futureBookings');
const outstandingBalancesRouter = lazyRouter('./routes/outstandingBalances');
const matterMetricsRouter = lazyRouter('./routes/matter-metrics');
const transactionsRouter = lazyRouter('./routes/transactions');
const transactionsV2Router = lazyRouter('./routes/transactionsV2');
const marketingMetricsRouter = lazyRouter('./routes/marketing-metrics');
const cachePreheaterRouter = lazyRouter('./routes/cache-preheater');
const clearCacheRouter = lazyRouter('./routes/clearCache');
const teamsActivityTrackingRouter = lazyRouter('./routes/teamsActivityTracking');
const pitchTrackingRouter = lazyRouter('./routes/pitchTracking');
const enquiryEnrichmentRouter = lazyRouter('./routes/enquiryEnrichment');
const peopleSearchRouter = lazyRouter('./routes/people-search');
const claimEnquiryRouter = lazyRouter('./routes/claimEnquiry');
const pipelineActivityRouter = lazyRouter('./routes/pipelineActivity');
const responseMetricsRouter = lazyRouter('./routes/responseMetrics');
const receptionKpisRouter = lazyRouter('./routes/receptionKpis');
const rateChangesRouter = lazyRouter('./routes/rate-changes');
const cclDateRouter = lazyRouter('./routes/ccl-date');
const cclOpsRouter = lazyRouter('./routes/ccl-ops');
const cclDryRunRouter = lazyRouter('./routes/ccl-dry-run');
const expertsRouter = lazyRouter('./routes/experts');
const counselRouter = lazyRouter('./routes/counsel');
const syncInstructionClientRouter = lazyRouter('./routes/sync-instruction-client');
const techTicketsRouter = lazyRouter('./routes/techTickets');
const signalsRouter = lazyRouter('./routes/signals');
const logsStreamRouter = lazyRouter('./routes/logs-stream');
const telemetryRouter = lazyRouter('./routes/telemetry');
const formIntentRouter = lazyRouter('./routes/form-intent');
const auditRouter = lazyRouter('./routes/audit');
const todoRouter = lazyRouter('./routes/todo');
const bookSpaceRouter = lazyRouter('./routes/bookSpace');
const financialTaskRouter = lazyRouter('./routes/financialTask');
const activityFeedRouter = lazyRouter('./routes/activity-feed');
const releaseNotesRouter = lazyRouter('./routes/release-notes');
const stashBriefsRouter = lazyRouter('./routes/stash-briefs');
const devConsoleRouter = lazyRouter('./routes/dev-console');
const devRoadmapRouter = lazyRouter('./routes/dev-roadmap');
const opsQueueRouter = lazyRouter('./routes/opsQueue');
const processHubRouter = lazyRouter('./routes/processHub');
const dataOperationsRouter = lazyRouter(() => require('./routes/dataOperations').router);
const yoyComparisonRouter = lazyRouter('./routes/yoy-comparison');
const formHealthCheckRouter = lazyRouter('./routes/formHealthCheck');
const notableCaseInfoRouter = lazyRouter('./routes/notableCaseInfo');
const enquiriesLookupRouter = lazyRouter('./routes/enquiriesLookup');
const teamsBotRouter = lazyRouter('./routes/teamsBot');
const teamsNotifyRouter = lazyRouter('./routes/teamsNotify');
const activityCardLabRouter = lazyRouter('./routes/activity-card-lab');
const opsPulseRouter = lazyRouter(() => require('./routes/ops-pulse').router);
const opsChecksRouter = lazyRouter('./routes/ops-checks');
const systemTriageRouter = lazyRouter('./routes/system-triage');
const matterReplayRouter = lazyRouter('./routes/matter-replay');
const operatorActionsRouter = lazyRouter('./routes/operator-actions');
const accessRouter = lazyRouter('./routes/access');
_bootMark('routes:require:done');

const isProd = process.env.NODE_ENV === 'production';
const app = express();
if (isProd) {
    // App Service sits behind a reverse proxy; trust the forwarded client hop.
    app.set('trust proxy', 1);
}

function _rateLimitQueryValue(value) {
    if (Array.isArray(value)) return String(value[0] || '');
    if (value == null) return '';
    return String(value);
}

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

function _rateLimitKey(req) {
    const entraId = _rateLimitQueryValue(req.query?.entraId).trim().toLowerCase();
    if (entraId) return `entra:${entraId}`;

    const email = _rateLimitQueryValue(req.query?.email).trim().toLowerCase();
    if (email) return `email:${email}`;

    const initials = _rateLimitQueryValue(req.query?.initials).trim().toUpperCase();
    if (initials) return `initials:${initials}`;

    return `ip:${ipKeyGenerator(req.ip || 'unknown')}`;
}

function _shouldSkipGlobalRateLimit(req) {
    const originalUrl = String(req.originalUrl || '');
    return req.path.includes('/stream')
        || req.path === '/health'
        || originalUrl.startsWith('/api/health')
        || originalUrl.startsWith('/api/telemetry');
}

// Enable gzip compression if available, but skip SSE endpoints.
// SSE prefix list lives in server/utils/sseEndpoints.js and is shared with requireUser.
const { isSsePath } = require('./utils/sseEndpoints');
if (compression) {
    const compress = compression();
    app.use((req, res, next) => {
        // Skip compression for Server-Sent Events to avoid buffering
        if (isSsePath(req.path)) {
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            return next();
        }
        return compress(req, res, next);
    });
}
const PORT = process.env.PORT || 8080;

// ── Doubled-prefix guard: surface `/api/api/*` regressions loudly ──
// Class of bug: a client builds `${proxyBase}/api/foo` where `proxyBase` already
// ends in `/api`, producing `/api/api/foo`. Historically these returned a silent
// 404. We now log + telemeter + return a structured error so future regressions
// are visible in App Insights instead of dying in the network tab.
app.use('/api/api', (req, res) => {
    const correctedPath = `/api${req.url}`;
    console.warn(`[doubled-api-guard] ${req.method} /api/api${req.url} → likely meant ${correctedPath}`);
    const hitMeta = {
        method: req.method,
        originalPath: `/api/api${req.url}`,
        suggestedPath: correctedPath,
        referer: req.headers['referer'] || '',
        userAgent: req.headers['user-agent'] || '',
    };
    try {
        trackEvent('Server.DoubledApiPrefix.Hit', hitMeta);
    } catch { /* telemetry best-effort */ }
    // Surface to the Activity tab alerts strip in real-time (dev group only).
    try {
        const { pushDoubledApi } = require('./routes/ops-pulse');
        if (typeof pushDoubledApi === 'function') pushDoubledApi(hitMeta);
    } catch { /* ops-pulse not loaded yet — ignore */ }
    res.status(404).json({
        error: 'doubled_api_prefix',
        message: 'The path starts with /api/api/ — the client likely concatenated a base URL that already includes /api. See server/index.js doubled-api-guard.',
        suggestedPath: correctedPath,
    });
});

// ── Hydration gate: 503 on /api/* until Key Vault secrets are ready ──
// Lets the process listen immediately (Azure health probes see it alive)
// while blocking real API traffic until connection strings are hydrated.
app.use('/api', (req, res, next) => {
    if (_hydrationDone) return next();
    // Allow health/status probes through so Azure doesn't restart the container
    if (req.path === '/health' || req.path === '/status') return next();
    _hydrationReady.then(() => next()).catch(() => next());
});

// ── Security headers (helmet) ──
const helmet = require('helmet');
app.use(helmet({
    // CSP in report-only — logs violations without breaking functionality.
    // Teams embeds and inline scripts need 'unsafe-inline'; tighten later.
    contentSecurityPolicy: false,
    // Teams hosts the tab cross-origin. Helmet defaults X-Frame-Options to
    // SAMEORIGIN, which lets Teams fetch / but blocks the iframe from running.
    xFrameOptions: false,
    // HSTS is handled by IIS/Azure Front Door in production; avoid double-setting.
    strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

const allowedFrameAncestors = [
    "'self'",
    'https://teams.microsoft.com',
    'https://*.teams.microsoft.com',
    'https://teams.office.com',
    'https://*.teams.office.com',
    'https://teams.live.com',
    'https://*.teams.live.com',
    'https://*.skype.com',
    'https://*.cloud.microsoft',
].join(' ');

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedFrameAncestors};`);
    next();
});

// ── Rate limiting ──
if (isProd) {
    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,       // 15 minutes
        max: 300,                        // 300 requests per window
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: _rateLimitKey,
        // Skip SSE endpoints and best-effort client telemetry.
        skip: _shouldSkipGlobalRateLimit,
        handler: (req, res) => {
            trackEvent('Security.RateLimit.Exceeded', { ip: req.ip, path: req.path, key: _rateLimitKey(req) });
            res.status(429).json({ error: 'rate_limited', message: 'Too many requests — try again later.' });
        },
    });
    app.use('/api/', globalLimiter);
}

// Stricter limit on AI/generation endpoints (expensive operations)
if (isProd) {
    const aiLimiter = rateLimit({
        windowMs: 5 * 60 * 1000,        // 5 minutes
        max: 20,                         // 20 AI calls per 5 min
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: _rateLimitKey,
        handler: (req, res) => {
            trackEvent('Security.RateLimit.AI.Exceeded', { ip: req.ip, path: req.path, user: req.user?.initials, key: _rateLimitKey(req) });
            res.status(429).json({ error: 'rate_limited', message: 'AI rate limit reached — try again in a few minutes.' });
        },
    });
    app.use('/api/ccl-ai', aiLimiter);
    app.use('/api/ai', aiLimiter);
    app.use('/api/forms-ai', aiLimiter);
}

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
const allowedOrigins = isProd
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : [])
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || ''));

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
    const allow = !origin || allowedOrigins.includes(origin) || isSameOriginRequest(req, origin) || (!isProd && isLocalDevOrigin(origin));

    // If Origin is missing, let the request through without forcing CORS headers.
    // If Origin is present and allowed, reflect it (required when credentials are used).
    const corsOptions = {
        origin: origin ? (allow ? origin : false) : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        // EventSource reconnects may include Last-Event-ID; some environments add Cache-Control.
        // x-user-initials is sent by CallsAndNotes save-note; x-user-* is a general pattern.
        allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Last-Event-ID', 'x-user-initials', 'x-user-email', 'x-helix-initials', 'x-helix-entra-id'],
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

// Clio outbound webhooks — same constraint (signature over raw body).
// See server/routes/clio-webhook.js and docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md.
app.use('/api/clio/webhook', clioWebhookRouter);

// Financial forms can include base64 file uploads; default 100kb limit is too small.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Request tracker — lightweight ring-buffer for ops-pulse API heat view
app.use(requestTrackerMiddleware);

// User context middleware - enriches requests with user info and logs sessions
app.use(userContextMiddleware);

// Auth guard - rejects API requests with no resolved user (whitelist: health, stripe, telemetry)
const requireUser = require('./middleware/requireUser');
app.use(requireUser);
app.use(processHubAuditMiddleware);

function isLocalCclRequest(req) {
    const host = String(req.headers.host || req.hostname || '').toLowerCase();
    return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]') || host === '::1';
}

function guardCclOperations(req, res, next) {
    if (isLocalCclRequest(req)) return next();
    trackEvent('CCL.Operations.Disabled.Blocked', {
        operation: 'guardCclOperations',
        triggeredBy: req.user?.initials || req.user?.email || 'unknown',
        method: req.method,
        route: req.originalUrl || req.url,
        host: req.headers.host || '',
    });
    return res.status(403).json({
        ok: false,
        code: 'CCL_DISABLED',
        error: 'CCL operations are disabled outside local development while ZDR/LPP review is ongoing.',
    });
}

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
// Mount BEFORE /api/matters so '/api/matters/open-another' doesn't get caught by matters.js GET /:id
app.use('/api/matters/open-another', openAnotherMatterRouter);
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
app.use('/api/ccl', guardCclOperations, cclRouter);
app.use('/api/ccl-ai', guardCclOperations, cclAiRouter);
app.use('/api/ai', commsFrameworkRouter);
app.use('/api/ai', promptCoachRouter);
app.use('/api/forms-ai', formsAiRouter);
app.use('/api/ccl-admin', guardCclOperations, cclAdminRouter);
app.use('/api/ccl-ops', guardCclOperations, cclOpsRouter);
app.use('/api/ccl-dry-run', guardCclOperations, cclDryRunRouter);
app.use('/api/enquiries-unified', enquiriesUnifiedRouter);
app.use('/api/home-wip', homeWipRouter);
app.use('/api/home-enquiries', homeEnquiriesRouter);
app.use('/api/matters-new-space', mattersNewSpaceRouter);
app.use('/api/home-journey', homeJourneyRouter);
app.use('/api/updateEnquiryPOC', updateEnquiryPOCRouter);
app.use('/api/claimEnquiry', claimEnquiryRouter);
app.use('/api/pipeline-activity', pipelineActivityRouter);
app.use('/api/response-metrics', responseMetricsRouter);
app.use('/api/reporting', receptionKpisRouter);
app.use('/api/matters-unified', mattersUnifiedRouter);
app.use('/api/ops', opsRouter);
// Email route (server-based). Expose under both /api and / to match existing callers.
app.use('/api', sendEmailRouter);
app.use('/api', emailSignatureRouter);
app.use('/api', demoCheatSheetRouter);
app.use('/api', createDraftRouter);
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
app.use('/api/doc-request-deals', docRequestDealsRouter);
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
// Management Dashboard trust gate (Phase A — read-only readiness payload)
// See docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md
app.use('/api/reporting', require('./routes/reportingReadiness'));
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
app.use('/api/activity-feed', activityFeedRouter);
app.use('/api/release-notes', releaseNotesRouter);
app.use('/api', stashBriefsRouter);
app.use('/api/dev-console/roadmap', devRoadmapRouter);
app.use('/api/dev-console', devConsoleRouter);
app.use('/api/ops-queue', opsQueueRouter);
app.use('/api/messages', teamsBotRouter);
app.use('/api/teams-notify', teamsNotifyRouter);
app.use('/api/activity-card-lab', activityCardLabRouter);
app.use('/api/ops-pulse', opsPulseRouter);
app.use('/api/ops-checks', opsChecksRouter);
app.use('/api/system-triage', systemTriageRouter);
app.use('/api/matter-replay', matterReplayRouter);

// In-app operator actions (B1) — first-class, audited replacements for
// LZ-only tools/*.mjs one-offs. Phase A: dev-owner only, person lookup pilot.
app.use('/api/operator-actions', operatorActionsRouter);

// Access controls (Phase Access.2) — data-driven RBAC read/write surface.
app.use('/api/access', accessRouter);

// Rate change notification tracking (for Jan 2026 hourly rate increase)
app.use('/api/rate-changes', rateChangesRouter);

// CCL Date operation (Clio + legacy SQL)
app.use('/api/ccl-date', guardCclOperations, cclDateRouter);

// Expert and Counsel directories
app.use('/api/experts', expertsRouter);
app.use('/api/counsel', counselRouter);

// Tech tickets (Asana integration for ideas and problem reports)
app.use('/api/tech-tickets', techTicketsRouter);

// Unified intake ledger for the Suggestions Inbox in My Helix. Additive
// mirror over tech_problems / tech_ideas / roadmap / stash + agent
// footers. See docs/notes/AGENT_SUGGESTIONS_INBOX_IN_MY_HELIX.md.
app.use('/api/signals', signalsRouter);

// Telemetry endpoint for pitch builder and client-side event tracking
app.use('/api/telemetry', telemetryRouter);

// Form intent beacon: records the moment a user presses submit on any form,
// BEFORE the real POST fires. Orphan rows surface lost submissions. See
// docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md (P1).
app.use('/api/forms/intent', formIntentRouter);
app.use('/api/audit', auditRouter);

// Hub ToDo registry (HOME_TODO_SINGLE_PICKUP_SURFACE) — dbo.hub_todo on
// helix-operations. Feeds Home immediate-actions bar + activity feed from
// one INSERT. Gated by OPS_PLATFORM_ENABLED + OPS_SQL_CONNECTION_STRING.
app.use('/api/todo', todoRouter);

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

// Notable case info proxy (records + forwards to downstream Azure Function)
app.use('/api/notable-case-info', notableCaseInfoRouter);

// Lightweight enquiry/prospect lookup for shared form pickers
app.use('/api/enquiries/lookup', enquiriesLookupRouter);

// Unified process definitions and submission feed foundation
app.use('/api/process-hub', processHubRouter);

// Route health (dev indicator — probes all registered routes)
const registersRouter = require('./routes/registers');
app.use('/api/registers', registersRouter);

const routeHealthRouter = require('./routes/routeHealth');
app.use('/api/route-health', routeHealthRouter);

// Server component health
const healthRouter = require('./routes/health');
app.use('/api/health', healthRouter);

// Dev-only: stable boot id so the browser can detect nodemon restarts
// (used by useDevServerBoot to fire `helix:server-bounced` and reconnect SSE).
// Production safety: this route is never mounted outside dev.
if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev/health', require('./routes/devHealth'));
    app.use('/api/dev', require('./routes/dev-rehearsal'));
}

// Metrics routes (migrated from Azure Functions to fix cold start issues)
app.use('/api/poid', poidRouter);
app.use('/api/future-bookings', futureBookingsRouter);
app.use('/api/outstanding-balances', outstandingBalancesRouter);
app.use('/api/matter-metrics', matterMetricsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/transactions-v2', transactionsV2Router);
app.use('/api/migration', require('./routes/legacyMigration'));

app.use('/ccls', guardCclOperations, express.static(CCL_DIR));

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

// API routes should come BEFORE static file serving and catch-all route
// This ensures API requests don't get caught by the catch-all route

// Prefer serving the latest CRA build output from the repo root.
// Fallback to __dirname for flat deploy structure (frontend sits alongside server.js).
const fs = require('fs');
const rootBuildPath = path.resolve(__dirname, '..', 'build');
const buildPath = fs.existsSync(path.join(rootBuildPath, 'index.html'))
    ? rootBuildPath
    : __dirname;

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
// Centralised: logs, App Insights, DM notification for 500s, clean JSON responses.
app.use(errorHandler);

// Listen immediately — the hydration gate middleware holds /api/* requests
// until secrets are ready, but the process is reachable for health probes.
app.listen(PORT, () => {
    const bootDurationMs = Date.now() - serverBootStartedAt;
    _bootMark('listen:ready');
    trackEvent('Server.Boot.ListenReady', { port: PORT, hydrated: _hydrationDone });
    trackMetric('Server.Boot.Listen.Duration', bootDurationMs, { port: PORT });

    // Defer scheduler + event poller until hydration completes
    _hydrationReady.then(() => {
        // Dev opt-in: HELIX_LAZY_INIT skips the scheduler + event poller so the
        // local boot is snappy and nodemon restarts don't re-spin all of them.
        // Always runs in production, regardless of the env flag.
        const skipBackground =
            process.env.NODE_ENV !== 'production' && process.env.HELIX_LAZY_INIT === '1';

        banner({
            port: PORT,
            redis: _connStatus.redis,
            sql: _connStatus.sql,
            instructionsSql: _connStatus.instructionsSql,
            clio: _connStatus.clio,
            scheduler: !skipBackground,
            eventPoller: skipBackground ? 'skipped (HELIX_LAZY_INIT)' : POLL_INTERVAL_MS / 1000,
        });

        if (skipBackground) {
            try {
                trackEvent('Server.Boot.LazyInit.Skipped', {
                    reason: 'HELIX_LAZY_INIT',
                    skipped: 'scheduler,eventPoller',
                });
            } catch { /* */ }
            setServerStatus('scheduler', false);
            setServerStatus('eventPoller', false);
        } else {
            setServerStatus('scheduler', true);
            startDataOperationsScheduler();
            startEventPoller();
            setServerStatus('eventPoller', true);
            // Phase Access.4 — daily-ish expiry sweep. Same gate as scheduler.
            try {
                const access = require('./utils/access');
                if (typeof access.startExpirySweep === 'function') {
                    access.startExpirySweep();
                    trackEvent('Access.ExpirySweep.Scheduled', { intervalHours: '6' });
                }
            } catch { /* non-fatal */ }
        }
    });
});

// Graceful shutdown: stop scheduler, drain mutex (up to 15s), flush telemetry
async function gracefulShutdown(signal) {
    schedulerLogger.info(`${signal} received — initiating graceful shutdown`);
    stopScheduler();

    // Stop background pre-warm timers so Node can exit cleanly.
    try {
        if (typeof homeWipRouter.stopTeamWipPrewarm === 'function') {
            homeWipRouter.stopTeamWipPrewarm();
        }
    } catch { /* non-fatal */ }

    // Wait for mutex to drain (in-flight sync to finish)
    const { getState: getMutexState } = require('./utils/syncMutex');
    const drainStart = Date.now();
    const DRAIN_TIMEOUT_MS = 15000;
    while (getMutexState().locked && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 500));
    }
    if (getMutexState().locked) {
        schedulerLogger.warn('Mutex still held after 15s drain — forcing exit');
    }

    await appInsights.flush();
    process.exit(0);
}

const schedulerLogger = require('./utils/logger').createLogger('Shutdown');
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));