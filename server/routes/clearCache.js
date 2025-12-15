const express = require('express');
const { getRedisClient } = require('../utils/redisClient');
const reporting = require('./reporting');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.cache.child('Clear');

// Clear Redis cache endpoint
router.post('/clear-cache', async (req, res) => {
  try {
    const { scope } = req.body;
    
    const redisClient = await getRedisClient();
    if (!redisClient) {
      return res.status(503).json({ 
        success: false, 
        error: 'Redis not available',
        message: 'Cache clearing skipped - Redis client unavailable'
      });
    }

    let clearedKeys = [];
    
    if (scope === 'reporting' || scope === 'all') {
      // Clear all reporting cache keys
      const reportingKeys = await redisClient.keys('rpt:*');
      if (reportingKeys.length > 0) {
        await redisClient.del(reportingKeys);
        clearedKeys.push(...reportingKeys);
      }
      // Also clear in-memory reporting response cache
      try {
        const cleared = typeof reporting.clearReportingCache === 'function'
          ? reporting.clearReportingCache('all')
          : 0;
      } catch {}
    }
    
    if (scope === 'clio' || scope === 'all') {
      // Clear Clio-related cache keys
      const clioKeys = await redisClient.keys('clio:*');
      if (clioKeys.length > 0) {
        await redisClient.del(clioKeys);
        clearedKeys.push(...clioKeys);
      }
    }
    
    if (scope === 'unified' || scope === 'all') {
      // Clear unified endpoint cache keys
      const unifiedKeys = await redisClient.keys('unified:*');
      if (unifiedKeys.length > 0) {
        await redisClient.del(unifiedKeys);
        clearedKeys.push(...unifiedKeys);
      }
    }

    if (scope === 'enquiries' || scope === 'all') {
      // Clear helix-core enquiries dataset keys and reporting enquiries
      const hcKeys = await redisClient.keys('hc:enquiries:*');
      const rptEnq = await redisClient.keys('rpt:enquiries*');
      const toDelete = [...hcKeys, ...rptEnq];
      if (toDelete.length > 0) {
        await redisClient.del(toDelete);
        clearedKeys.push(...toDelete);
      }
      // Clear in-memory response cache entries that include enquiries
      try {
        const cleared = typeof reporting.clearReportingCache === 'function'
          ? reporting.clearReportingCache('enquiries')
          : 0;
      } catch {}
    }
    
    log.op('cache:clear', { scope, keysCleared: clearedKeys.length });
    
    return res.json({
      success: true,
      message: `Cache cleared successfully`,
      clearedKeys: clearedKeys.length,
      scope,
      keys: clearedKeys.slice(0, 10)
    });
    
  } catch (error) {
    log.fail('cache:clear', error, { scope: req.body?.scope });
    return res.status(500).json({
      success: false,
      error: 'Cache clear failed',
      details: error.message
    });
  }
});

module.exports = router;