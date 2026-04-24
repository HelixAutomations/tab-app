// Per-initials Clio token cache + 401-retry fetch wrapper.
//
// Used by routes that need a fee-earner's own Clio token (matter-audit,
// matter-metrics) — distinct from the shared `clio-teamhubv1-*` token used
// by reporting/home-wip/matter-operations which carry extra logic
// (Redis cache, abort-on-timeout, refresh-token rotation back to Key Vault).
//
// History: this consolidates verbatim copies that lived in
// server/routes/matter-audit.js and server/routes/matter-metrics.js.
// See ROADMAP.md D7 — Clio token-refresh dedup.

const fetch = require('node-fetch');
const { getSecret } = require('./getSecret');

const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';

// Module-scoped cache keyed by initials. Each consumer gets its own
// process-local cache (no Redis here — matches the original behaviour).
const tokenCache = new Map();

async function getClioAccessToken(initials, options = {}) {
    const { forceRefresh = false } = options;
    const key = String(initials || '').toLowerCase();
    if (!key) {
        throw new Error('getClioAccessToken: initials required');
    }

    if (!forceRefresh) {
        const cached = tokenCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.token;
        }
    } else {
        tokenCache.delete(key);
    }

    const [clientId, clientSecret, refreshToken] = await Promise.all([
        getSecret(`${key}-clio-v1-clientid`),
        getSecret(`${key}-clio-v1-clientsecret`),
        getSecret(`${key}-clio-v1-refreshtoken`),
    ]);

    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    const resp = await fetch(`${CLIO_TOKEN_URL}?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Failed to refresh Clio token: ${errorText}`);
    }

    const tokenData = await resp.json();
    const accessToken = tokenData.access_token;
    const expiresIn = Number(tokenData.expires_in || 3600) * 1000;
    tokenCache.set(key, { token: accessToken, expiresAt: Date.now() + expiresIn - 60 * 1000 });
    return accessToken;
}

async function fetchClioWithRetry(initials, url, options = {}) {
    let accessToken = await getClioAccessToken(initials);
    let resp = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (resp.status !== 401) {
        return resp;
    }

    const key = String(initials || '').toLowerCase();
    tokenCache.delete(key);
    accessToken = await getClioAccessToken(initials, { forceRefresh: true });

    resp = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    return resp;
}

module.exports = {
    getClioAccessToken,
    fetchClioWithRetry,
};
