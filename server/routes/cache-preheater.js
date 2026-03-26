const express = require('express');
const { getRedisClient, generateCacheKey } = require('../utils/redisClient');
const { fetchDatasetByName } = require('./reporting-stream');
const { calculateOptimalTTL, getCacheAnalytics } = require('../utils/smartCache');
const { loggers } = require('../utils/logger');

const router = express.Router();
const { annotate } = require('../utils/devConsole');
const log = loggers.cache.child('Preheater');

/**
 * Preheats cache for commonly accessed datasets
 * This can be triggered by a scheduled job or manual endpoint
 */
router.post('/preheat', async (req, res) => {
  try {
    const redisClient = await getRedisClient();
    if (!redisClient) {
      return res.json({ success: false, skipped: true, reason: 'Redis not available', results: [] });
    }

    const { datasets = ['enquiries', 'allMatters', 'wip', 'teamData'], entraId } = req.body;
    const results = [];

    for (const datasetName of datasets) {
      try {
        const cacheKey = generateCacheKey('stream', `${datasetName}:${entraId || 'team'}`);
        
        // Check if already cached and fresh
        const existing = await redisClient.get(cacheKey);
        if (existing) {
          results.push({ dataset: datasetName, status: 'already_cached' });
          continue;
        }

        // Fetch and cache
        const connectionString = process.env.SQL_CONNECTION_STRING;
        const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        const data = await fetchDatasetByName(datasetName, { connectionString, instructionsConnectionString, entraId });
        
        // Use smart TTL calculation
        const ttl = calculateOptimalTTL(datasetName, Array.isArray(data) ? data.length : 1);

        await redisClient.setEx(cacheKey, ttl, JSON.stringify(data));
        
        results.push({ 
          dataset: datasetName, 
          status: 'preheated', 
          count: Array.isArray(data) ? data.length : 1,
          ttl 
        });
        
      } catch (error) {
        log.fail('cache:preheat', error, { datasetName, entraId });
        results.push({ dataset: datasetName, status: 'failed', error: error.message });
      }
    }

    log.op('cache:preheat', { datasets: results.filter(r => r.status === 'preheated').length, skipped: results.filter(r => r.status === 'already_cached').length });
    const preheated = results.filter(r => r.status === 'preheated').length;
    const skipped = results.filter(r => r.status === 'already_cached').length;
    annotate(res, { source: 'redis', note: `${preheated} preheated, ${skipped} already cached` });
    res.json({ success: true, results });
  } catch (error) {
    log.fail('cache:preheat', error, {});
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cache warming strategy - proactively refresh datasets before they expire
 */
router.post('/warm', async (req, res) => {
  try {
    const redisClient = await getRedisClient();
    if (!redisClient) {
      return res.json({ success: false, skipped: true, reason: 'Redis not available' });
    }

    // Find keys that are about to expire (within 60 seconds)
    const pattern = 'stream:*';
    const keys = await redisClient.keys(pattern);
    const warnings = [];
    
    for (const key of keys) {
      const ttl = await redisClient.ttl(key);
      if (ttl > 0 && ttl < 60) { // Expiring within 1 minute
        warnings.push({ key, ttl });
      }
    }

    res.json({ success: true, expiring_soon: warnings });
  } catch (error) {
    log.fail('cache:warm', error, {});
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get cache performance analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await getCacheAnalytics();
    if (!analytics) {
      return res.status(500).json({ success: false, error: 'Analytics not available' });
    }
    
    res.json({ success: true, analytics });
  } catch (error) {
    log.fail('cache:analytics', error, {});
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cache diagnostics — per-key state for all high-value caches.
 * Used by the CacheMonitor UI (Reports tab) to visualise freshness,
 * hit savings, and staleness risk.
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const redisClient = await getRedisClient();
    const connected = Boolean(redisClient);

    const keys = [];
    // Probe known cache key families
    const probes = [
      { label: 'Ops: Pending', key: generateCacheKey('ops', 'pending'), group: 'ops-queue' },
      { label: 'Ops: Recent', key: generateCacheKey('ops', 'recent'), group: 'ops-queue' },
      { label: 'Ops: CCL dates', key: generateCacheKey('ops', 'ccl-dates-pending'), group: 'ops-queue' },
      { label: 'Ops: Transactions', key: generateCacheKey('ops', 'transactions', 'mtd'), group: 'ops-queue' },
    ];

    // Discover stream:* keys (reporting datasets)
    if (redisClient) {
      try {
        const streamKeys = await redisClient.keys('stream:*');
        for (const sk of streamKeys.slice(0, 30)) {
          const short = sk.replace(/^stream:/, '').replace(/:h-[a-f0-9]+/g, ':*');
          probes.push({ label: `Stream: ${short}`, key: sk, group: 'reporting' });
        }
      } catch { /* ignore scan errors */ }
    }

    for (const probe of probes) {
      if (!redisClient) {
        keys.push({ ...probe, status: 'offline', ttl: -1, age: null, size: null });
        continue;
      }
      try {
        const ttl = await redisClient.ttl(probe.key);
        if (ttl === -2) {
          // Key doesn't exist
          keys.push({ ...probe, status: 'miss', ttl: -1, age: null, size: null });
          continue;
        }
        const raw = await redisClient.get(probe.key);
        let age = null;
        let size = raw ? Buffer.byteLength(raw) : null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.cached_at) {
              age = Math.round((Date.now() - new Date(parsed.cached_at).getTime()) / 1000);
            }
          } catch { /* not JSON-wrapped — raw cache */ }
        }
        keys.push({
          ...probe,
          status: ttl > 0 ? 'hit' : 'persist',
          ttl,
          age,
          size,
        });
      } catch {
        keys.push({ ...probe, status: 'error', ttl: -1, age: null, size: null });
      }
    }

    // Server uptime
    const uptimeSeconds = Math.round(process.uptime());

    res.json({
      success: true,
      connected,
      uptimeSeconds,
      keys,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.fail('cache:diagnostics', error, {});
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;