const express = require('express');
const { getRedisClient, generateCacheKey } = require('../utils/redisClient');
const { fetchDatasetByName } = require('./reporting-stream');
const { calculateOptimalTTL, getCacheAnalytics } = require('../utils/smartCache');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.cache.child('Preheater');

/**
 * Preheats cache for commonly accessed datasets
 * This can be triggered by a scheduled job or manual endpoint
 */
router.post('/preheat', async (req, res) => {
  try {
    const redisClient = await getRedisClient();
    if (!redisClient) {
      return res.status(500).json({ success: false, error: 'Redis not available' });
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
        const data = await fetchDatasetByName(datasetName, { connectionString, entraId });
        
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
      return res.status(500).json({ success: false, error: 'Redis not available' });
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

module.exports = router;