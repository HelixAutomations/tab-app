const express = require('express');
const router = express.Router();
const { getRedisClient, generateCacheKey } = require('../utils/redisClient');

// Helper: write SSE event safely
function writeSse(res, obj) {
  // Check if stream is still writable
  if (res.writableEnded || res.destroyed) return;
  
  try {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') {
      try { res.flush(); } catch { /* ignore */ }
    }
  } catch { /* connection likely closed */ }
}

// Resolve self base URL for internal calls (Azure friendly)
function getSelfBaseUrl() {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL.replace(/\/$/, '');
  if (process.env.WEBSITE_HOSTNAME) return `https://${process.env.WEBSITE_HOSTNAME}`;
  // For local dev, use standard port; on Azure App Service with iisnode, use external hostname
  const port = process.env.PORT || 8080;
  // Named pipe detected (Azure iisnode) - use external URL instead
  if (typeof port === 'string' && port.startsWith('\\\\.\\pipe\\')) {
    return process.env.WEBSITE_HOSTNAME 
      ? `https://${process.env.WEBSITE_HOSTNAME}` 
      : 'http://localhost:8080'; // fallback
  }
  return `http://localhost:${port}`;
}

// Fetch helpers using internal routes to reuse existing logic/caching
async function fetchJson(pathname) {
  const base = getSelfBaseUrl();
  const url = `${base}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

// Default metric set for Home
const DEFAULT_METRICS = ['transactions', 'futureBookings', 'outstandingBalances', 'poid6Years'];

// TTLs (seconds)
const METRIC_TTL = {
  transactions: 1800,         // 30m
  futureBookings: 900,         // 15m
  outstandingBalances: 1800,   // 30m
  poid6Years: 3600,            // 1h
};

router.get('/stream', async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  if (typeof res.flushHeaders === 'function') {
    try { res.flushHeaders(); } catch { /* ignore */ }
  }

  // Track if connection is closed
  let isClosed = false;
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!isClosed && !res.writableEnded) {
      try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
    }
  }, 15000);
  
  req.on('close', () => { 
    isClosed = true;
    clearInterval(heartbeat); 
    try { 
      if (!res.writableEnded) res.end(); 
    } catch { /* ignore */ } 
  });

  // Parse metrics from query
  const metrics = typeof req.query.metrics === 'string'
    ? req.query.metrics.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_METRICS;

  const bypassCache = String(req.query.bypassCache || '').toLowerCase() === 'true';

  // Instruct client to retry
  try { res.write('retry: 10000\n\n'); } catch { /* ignore */ }
  writeSse(res, { type: 'init', metrics: metrics.map(name => ({ name, status: 'loading' })) });

  const redis = await getRedisClient().catch(() => null);

  async function processMetric(name) {
    try {
      // Attempt Redis cache unless bypassing
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = generateCacheKey('home', `${name}:${today}`);
      let payload = null;
      let fromCache = false;

      if (!bypassCache && redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            payload = JSON.parse(cached);
            fromCache = true;
          }
        } catch { /* ignore cache read failure */ }
      }

      // Fetch fresh if needed
      if (!payload) {
        switch (name) {
          case 'transactions':
            payload = await fetchJson('/api/transactions');
            break;
          case 'futureBookings':
            payload = await fetchJson('/api/future-bookings');
            break;
          case 'outstandingBalances':
            payload = await fetchJson('/api/outstanding-balances');
            break;
          case 'poid6Years':
            payload = await fetchJson('/api/poid/6years');
            break;
          default:
            throw new Error(`Unknown metric: ${name}`);
        }

        // Store in Redis
        if (redis) {
          try {
            const ttl = METRIC_TTL[name] || 600;
            await redis.setEx(cacheKey, ttl, JSON.stringify(payload));
          } catch { /* ignore cache write failure */ }
        }
      }

      writeSse(res, {
        type: 'metric-complete',
        metric: name,
        status: 'ready',
        data: payload,
        cached: fromCache,
      });
    } catch (err) {
      writeSse(res, { type: 'metric-error', metric: name, status: 'error', error: String(err && err.message || err) });
    }
  }

  // Process all metrics concurrently for fastest first-paint
  await Promise.all(metrics.map(processMetric));

  // Send completion and give the socket a moment to flush before closing
  writeSse(res, { type: 'complete' });
  
  // Clear heartbeat and close connection
  clearInterval(heartbeat);
  isClosed = true;
  
  setTimeout(() => {
    try { 
      if (!res.writableEnded) res.end(); 
    } catch { /* ignore */ }
  }, 50);
});

module.exports = router;
