// Dev-only route: reseed the Helix Rehearsal Record (HLX-27367-94842).
// Production safety: this router is only mounted when NODE_ENV !== 'production'
// (see server/index.js). Triggers `scripts/seed-rehearsal-record-sql.mjs --confirm`
// as a child process so demo state matches the canonical seed after a Reset.
//
// See:
//   docs/notes/HELIX_REHEARSAL_RECORD_LUKE_TEST_AS_FIRM_SEED.md (Phase B / B7)
//   src/components/HubToolsChip.tsx → handleResetDemo

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();

const SEED_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'seed-rehearsal-record-sql.mjs');
const DEMO_REFERENCE_PATH = path.resolve(__dirname, '..', '..', '.github', 'instructions', 'DEMO_MODE_REFERENCE.md');

router.post('/reseed-rehearsal', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ ok: false, error: 'Disabled in production' });
    }

    const child = spawn(process.execPath, [SEED_SCRIPT, '--confirm'], {
        cwd: path.resolve(__dirname, '..', '..'),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
        console.error('[dev-rehearsal] reseed spawn failed:', err);
        res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
    });

    child.on('close', (code) => {
        const ok = code === 0;
        if (!ok) console.warn('[dev-rehearsal] reseed exited with code', code, stderr.slice(0, 4000));
        // Bust the unified-enquiries cache + push an SSE invalidate so any
        // open client refetches on the next read. Without this, SQL-side
        // changes from the seed are invisible until the in-memory (15s) /
        // Redis cache expires.
        let cacheResult = null;
        try {
            const { invalidateUnifiedEnquiriesCache } = require('./enquiries-unified');
            if (typeof invalidateUnifiedEnquiriesCache === 'function') {
                Promise.resolve(invalidateUnifiedEnquiriesCache('rehearsal-reseed'))
                    .then((r) => { cacheResult = r; })
                    .catch(() => {})
                    .finally(() => {
                        res.status(ok ? 200 : 500).json({
                            ok,
                            exitCode: code,
                            cacheInvalidated: cacheResult,
                            stdoutTail: stdout.slice(-2000),
                            stderrTail: stderr.slice(-2000),
                        });
                    });
                return;
            }
        } catch { /* fall through to plain response */ }
        res.status(ok ? 200 : 500).json({
            ok,
            exitCode: code,
            stdoutTail: stdout.slice(-2000),
            stderrTail: stderr.slice(-2000),
        });
    });
});

// Serve the Demo Mode runbook as markdown so the in-app "About demo mode"
// chip (HubToolsChip → CommandDeck strip) can open it in a new tab without
// requiring GitHub auth. Dev-only (router only mounted outside production).
router.get('/demo-reference', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).type('text/plain').send('Disabled in production');
    }
    fs.readFile(DEMO_REFERENCE_PATH, 'utf8', (err, content) => {
        if (err) {
            return res.status(404).type('text/plain').send('DEMO_MODE_REFERENCE.md not found');
        }
        res.type('text/markdown; charset=utf-8').send(content);
    });
});

// Generic invalidation hook for any out-of-band writer that mutates
// instructions/enquiries data without going through a routed handler:
//   - the seed script run from terminal
//   - ad-hoc SQL scripts
//   - future Clio webhook receivers
// Without this, in-process memory cache (15s TTL) + Redis (60s) keep showing
// stale data after a direct write. POSTing here busts both layers and
// broadcasts an SSE `enquiries.changed { changeType: 'invalidate' }`.
//
// Dev-only by mount; safe to call repeatedly (idempotent).
router.post('/invalidate-enquiries', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ ok: false, error: 'Disabled in production' });
    }
    const reason = (req.body && typeof req.body.reason === 'string' && req.body.reason)
        || (req.query && typeof req.query.reason === 'string' && req.query.reason)
        || 'manual-invalidate';
    try {
        const { invalidateUnifiedEnquiriesCache } = require('./enquiries-unified');
        if (typeof invalidateUnifiedEnquiriesCache !== 'function') {
            return res.status(500).json({ ok: false, error: 'invalidator not available' });
        }
        const result = await invalidateUnifiedEnquiriesCache(reason);
        return res.json({ ok: true, reason, result });
    } catch (err) {
        console.error('[dev-rehearsal] invalidate-enquiries failed:', err);
        return res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
    }
});

module.exports = router;
