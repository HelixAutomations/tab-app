/**
 * Dev-only health route.
 *
 * GET /api/dev/health → { bootId, uptime, pid, lazyInit, nodeEnv }
 *
 * The `bootId` is generated once at module load. The browser's
 * `useDevServerBoot` hook polls this every few seconds and dispatches a
 * `helix:server-bounced` event when the id changes, letting SSE consumers
 * reconnect immediately after a nodemon restart.
 *
 * Production safety: the route is mounted in server/index.js behind a
 * `NODE_ENV !== 'production'` check. Even if it leaked through, all it
 * exposes is a UUID, an uptime number, and the process id — no secrets.
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const BOOT_ID =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
const BOOT_AT = Date.now();

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    bootId: BOOT_ID,
    uptime: Date.now() - BOOT_AT,
    pid: process.pid,
    lazyInit: !!process.env.HELIX_LAZY_INIT,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
