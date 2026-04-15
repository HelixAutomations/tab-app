const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');

const router = express.Router();

const LEGACY_CACHE_TTL_MS = Number(process.env.LEGACY_MATTERS_TTL_MS || 60_000);
let mattersCache = { data: null, ts: 0 };

function getLegacyConnectionString() {
    const conn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    if (!conn || typeof conn !== 'string' || !conn.trim()) {
        throw new Error('Missing SQL connection string for legacy matters dataset');
    }
    return conn.trim();
}

function normalizeName(name) {
    if (!name) return '';
    const n = String(name).trim().toLowerCase();
    if (!n) return '';
    if (n.includes(',')) {
        const [last, first] = n.split(',').map(part => part.trim());
        if (first && last) {
            return `${first} ${last}`;
        }
    }
    return n.replace(/\s+/g, ' ');
}

function filterByFullName(records, fullName) {
    const target = normalizeName(fullName);
    if (!target) return records;
    return records.filter(record => {
        const responsible = normalizeName(
            record.ResponsibleSolicitor ||
            record['Responsible Solicitor'] ||
            record.responsible_solicitor ||
            record.responsibleSolicitor
        );
        const originating = normalizeName(
            record.OriginatingSolicitor ||
            record['Originating Solicitor'] ||
            record.originating_solicitor ||
            record.originatingSolicitor
        );
        return (
            responsible === target ||
            originating === target ||
            responsible.includes(target) ||
            originating.includes(target)
        );
    });
}

function applyLimit(records, limit) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return records;
    }
    return records.slice(0, parsed);
}

async function fetchLegacyMatters(bypassCache) {
    const now = Date.now();
    if (!bypassCache && mattersCache.data && (now - mattersCache.ts) < LEGACY_CACHE_TTL_MS) {
        return { records: mattersCache.data, cached: true };
    }

    const connectionString = getLegacyConnectionString();
    const result = await withRequest(connectionString, async (request) => {
        return request.query('SELECT TOP 10000 * FROM matters');
    });
    const records = Array.isArray(result.recordset) ? result.recordset : [];
    mattersCache = { data: records, ts: now };
    return { records, cached: false };
}

function shapeResponse(records, cached) {
    return {
        matters: records,
        count: Array.isArray(records) ? records.length : 0,
        cached,
        ttlMs: LEGACY_CACHE_TTL_MS,
    };
}

async function handleRequest(source) {
    const { fullName, limit, bypassCache } = source;
    const skipCache = String(bypassCache || '').toLowerCase() === 'true';
    const { records, cached } = await fetchLegacyMatters(skipCache);
    const filtered = filterByFullName(records, fullName);
    const limited = applyLimit(filtered, limit);
    return shapeResponse(limited, !skipCache && cached);
}

router.get('/', async (req, res) => {
    try {
        const payload = await handleRequest(req.query || {});
        res.json(payload);
    } catch (err) {
        console.error('❌ Failed to fetch legacy matters (GET /api/getAllMatters)', err);
        res.status(500).json({
            error: 'Failed to fetch legacy matters',
            details: String(err && err.message ? err.message : err),
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const payload = await handleRequest(req.body || {});
        res.json(payload);
    } catch (err) {
        console.error('❌ Failed to fetch legacy matters (POST /api/getAllMatters)', err);
        res.status(500).json({
            error: 'Failed to fetch legacy matters',
            details: String(err && err.message ? err.message : err),
        });
    }
});

module.exports = router;
