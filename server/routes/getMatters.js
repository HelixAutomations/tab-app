const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const router = express.Router();

// In-memory cache for the SQL connection string
let cachedSqlConn = null;
let cachedSqlConnError = null;

// In-memory cache for Matters
const MATTERS_CACHE_TTL_MS = parseInt(process.env.MATTERS_CACHE_TTL_MS || '60000', 10);
let mattersCache = { data: null, ts: 0 };

async function resolveSqlConnectionString() {
    if (cachedSqlConn) return cachedSqlConn;
    if (cachedSqlConnError) throw cachedSqlConnError;

    try {
        // 1) Direct env var
        const direct = process.env.SQL_CONNECTION_STRING;
        if (direct && typeof direct === 'string' && direct.trim()) {
            cachedSqlConn = direct.trim();
            return cachedSqlConn;
        }

        // 2) Azure Key Vault (optional)
        const vaultUri = process.env.KEY_VAULT_URI;
        const secretName = process.env.SQL_CONNECTION_SECRET_NAME || 'SqlConnectionString';
        if (vaultUri) {
            const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
            const client = new SecretClient(vaultUri, credential);
            const secret = await client.getSecret(secretName);
            if (secret && secret.value) {
                cachedSqlConn = secret.value;
                return cachedSqlConn;
            }
        }

        throw new Error('No SQL connection string found in env or Key Vault');
    } catch (err) {
        cachedSqlConnError = err;
        throw err;
    }
}

function normalizeName(name) {
    if (!name) return '';
    const n = String(name).trim().toLowerCase();
    if (n.includes(',')) {
        const [last, first] = n.split(',').map(p => p.trim());
        if (first && last) return `${first} ${last}`;
    }
    return n.replace(/\s+/g, ' ');
}

function filterByFullName(matters, fullName) {
    const target = normalizeName(fullName);
    if (!target) return matters;
    return matters.filter(m => {
        const resp = normalizeName(m.ResponsibleSolicitor || m['Responsible Solicitor'] || m.responsible_solicitor || m.responsibleSolicitor);
        const orig = normalizeName(m.OriginatingSolicitor || m['Originating Solicitor'] || m.originating_solicitor || m.originatingSolicitor);
        return resp === target || orig === target || resp.includes(target) || orig.includes(target);
    });
}

async function fetchMattersFromDb() {
    // Serve from cache when fresh
    const now = Date.now();
    if (mattersCache.data && (now - mattersCache.ts) < MATTERS_CACHE_TTL_MS) {
        return mattersCache.data;
    }

    const conn = await resolveSqlConnectionString();
    const matters = await withRequest(conn, async (request) => {
        const result = await request.query('SELECT * FROM [dbo].[Matters]');
        if (!result.recordset || !Array.isArray(result.recordset)) {
            throw new Error('Query returned no valid recordset');
        }
        return result.recordset;
    });
    
    mattersCache = { data: matters, ts: now };
    return matters;
}

// GET /api/getMatters?fullName=...&limit=...
router.get('/', async (req, res) => {
    const { fullName, limit } = req.query || {};
    try {
        const matters = await fetchMattersFromDb();
        let result = Array.isArray(matters) ? matters : [];
        if (fullName) {
            result = filterByFullName(result, String(fullName));
        }
        if (limit && Number(limit) > 0) {
            result = result.slice(0, Number(limit));
        }
        const cached = Boolean(mattersCache.data && (Date.now() - mattersCache.ts) < MATTERS_CACHE_TTL_MS);
        res.json({ matters: result, count: result.length, cached });
    } catch (err) {
        const cacheAge = Date.now() - (mattersCache.ts || 0);
        if (mattersCache.data && cacheAge < (5 * 60 * 1000)) {
            let cachedResult = Array.isArray(mattersCache.data) ? mattersCache.data : [];
            if (fullName) {
                cachedResult = filterByFullName(cachedResult, String(fullName));
            }
            if (limit && Number(limit) > 0) {
                cachedResult = cachedResult.slice(0, Number(limit));
            }
            return res.status(200).json({
                matters: cachedResult,
                count: cachedResult.length,
                cached: true,
                stale: true,
                error: 'Served cached matters due to database error',
                details: String(err.message || err),
            });
        }
        res.status(502).json({ error: 'Failed to fetch matters from database', details: String(err.message || err) });
    }
});

// POST /api/getMatters with optional { fullName, limit }
router.post('/', async (req, res) => {
    const { fullName, limit } = req.body || {};
    try {
        const matters = await fetchMattersFromDb();
        let result = Array.isArray(matters) ? matters : [];
        if (fullName) {
            result = filterByFullName(result, String(fullName));
        }
        if (limit && Number(limit) > 0) {
            result = result.slice(0, Number(limit));
        }
        const cached = Boolean(mattersCache.data && (Date.now() - mattersCache.ts) < MATTERS_CACHE_TTL_MS);
        res.json({ matters: result, count: result.length, cached });
    } catch (err) {
        const cacheAge = Date.now() - (mattersCache.ts || 0);
        if (mattersCache.data && cacheAge < (5 * 60 * 1000)) {
            let cachedResult = Array.isArray(mattersCache.data) ? mattersCache.data : [];
            if (fullName) {
                cachedResult = filterByFullName(cachedResult, String(fullName));
            }
            if (limit && Number(limit) > 0) {
                cachedResult = cachedResult.slice(0, Number(limit));
            }
            return res.status(200).json({
                matters: cachedResult,
                count: cachedResult.length,
                cached: true,
                stale: true,
                error: 'Served cached matters due to database error',
                details: String(err.message || err),
            });
        }
        res.status(502).json({ error: 'Failed to fetch matters from database', details: String(err.message || err) });
    }
});

module.exports = router;

