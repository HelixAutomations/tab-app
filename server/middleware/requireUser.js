/**
 * requireUser — rejects requests where userContextMiddleware could not resolve a team member.
 *
 * Applied globally AFTER userContextMiddleware.
 * Whitelisted paths bypass the check (health probes, webhooks, static assets).
 */
const { trackEvent } = require('../utils/appInsights');

// Paths that must work without a user context
const PUBLIC_PREFIXES = [
    '/api/health',
    '/api/stripe',          // Stripe webhooks (own signature check)
    '/api/telemetry',       // Client-side telemetry (fire-and-forget)
    '/api/messages',        // Teams bot webhook (Bot Framework auth)
    '/api/teams-notify',    // Teams proactive messages
    '/api/logs',            // SSE log stream (EventSource can't send auth headers; UI is admin-gated)
    '/api/team-data',       // EntryGate bootstrap outside Teams (route returns slim active-user payload when anonymous)
];

function requireUser(req, res, next) {
    // Non-API paths (static files, SPA catch-all) are always public
    if (!req.path.startsWith('/api/')) return next();

    // In local dev, userContextMiddleware may not resolve a user (no Teams auth).
    // Skip enforcement so the app remains usable during development.
    if (process.env.NODE_ENV !== 'production') return next();

    // Check whitelist
    for (const prefix of PUBLIC_PREFIXES) {
        if (req.path.startsWith(prefix)) return next();
    }

    // OPTIONS preflight must pass through for CORS to work
    if (req.method === 'OPTIONS') return next();

    if (req.user) return next();

    trackEvent('Security.RequireUser.Rejected', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        headers: JSON.stringify({
            entraId: req.headers['x-helix-entra-id'] ? '[present]' : '[missing]',
            email: req.headers['x-user-email'] ? '[present]' : '[missing]',
            initials: req.headers['x-helix-initials'] ? '[present]' : '[missing]',
        }),
    });

    return res.status(401).json({
        error: 'unauthorized',
        message: 'User context required. Ensure identity headers are present.',
    });
}

module.exports = requireUser;
