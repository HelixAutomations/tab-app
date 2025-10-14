const { getRedisClient, generateCacheKey } = require('../utils/redisClient');

/**
 * Enhanced cache TTL strategy based on data volatility and access patterns
 */
const DYNAMIC_CACHE_STRATEGY = {
  // High volatility - short cache
  wip: {
    baseTTL: 300,     // 5 minutes
    conditions: [
      { condition: (count) => count > 1000, multiplier: 0.5 }, // Large datasets expire faster
      { condition: (count, time) => time > 18 && time < 9, multiplier: 2 }, // Cache longer overnight
    ]
  },
  
  // Medium volatility - moderate cache
  enquiries: {
    baseTTL: 600,     // 10 minutes
    conditions: [
      { condition: (count, time) => time >= 9 && time <= 17, multiplier: 0.8 }, // Shorter during business hours
      { condition: (count, time) => time > 17 || time < 9, multiplier: 1.5 }, // Longer outside business hours
    ]
  },
  
  allMatters: {
    baseTTL: 900,     // 15 minutes
    conditions: [
      { condition: (count) => count > 5000, multiplier: 1.2 }, // Large datasets cache longer
    ]
  },
  
  // Low volatility - long cache
  teamData: {
    baseTTL: 1800,    // 30 minutes
    conditions: [
      { condition: (count, time) => time > 22 || time < 6, multiplier: 2 }, // Cache much longer overnight
    ]
  },
  
  userData: {
    baseTTL: 1800,    // 30 minutes
    conditions: []
  },
  
  recoveredFees: {
    baseTTL: 1200,    // 20 minutes
    conditions: []
  },
  
  poidData: {
    baseTTL: 1800,    // 30 minutes
    conditions: []
  },
  
  // External API data - longer cache to reduce API calls
  metaMetrics: {
    baseTTL: 3600,    // 60 minutes
    conditions: [
      { condition: (count, time) => time > 22 || time < 6, multiplier: 2 }, // Cache longer overnight
    ]
  },
  
  annualLeave: {
    baseTTL: 1800,    // 30 minutes
    conditions: []
  }
};

/**
 * Calculate optimal TTL based on dataset characteristics and current conditions
 */
function calculateOptimalTTL(datasetName, dataCount = 0) {
  const strategy = DYNAMIC_CACHE_STRATEGY[datasetName];
  if (!strategy) return 600; // Default 10 minutes
  
  let ttl = strategy.baseTTL;
  const currentHour = new Date().getHours();
  
  // Apply conditions
  for (const { condition, multiplier } of strategy.conditions) {
    if (condition(dataCount, currentHour)) {
      ttl = Math.round(ttl * multiplier);
    }
  }
  
  return ttl;
}

/**
 * Enhanced cache analytics to inform TTL optimization
 */
async function getCacheAnalytics() {
  try {
    const redisClient = await getRedisClient();
    if (!redisClient) return null;
    
    const patterns = ['stream:*', 'rpt:*', 'hc:*'];
    const analytics = {
      totalKeys: 0,
      hitRate: 0,
      memoryUsage: 0,
      topKeys: [],
      expirationDistribution: {},
    };
    
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      analytics.totalKeys += keys.length;
      
      for (const key of keys.slice(0, 20)) { // Sample top 20 keys
        const ttl = await redisClient.ttl(key);
        const size = await redisClient.memory('usage', key).catch(() => 0);
        
        analytics.topKeys.push({ key, ttl, size });
        
        // Group by TTL ranges
        const ttlRange = ttl > 3600 ? '1h+' : ttl > 1800 ? '30m-1h' : ttl > 600 ? '10m-30m' : '<10m';
        analytics.expirationDistribution[ttlRange] = (analytics.expirationDistribution[ttlRange] || 0) + 1;
      }
    }
    
    return analytics;
  } catch (error) {
    console.error('Cache analytics error:', error);
    return null;
  }
}

/**
 * Cache warming scheduler - periodically refresh high-value datasets
 */
async function schedulePeriodicCacheWarming() {
  const WARMING_DATASETS = ['teamData', 'userData', 'enquiries'];
  function getSelfBaseUrl() {
    if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL.replace(/\/$/, '');
    if (process.env.WEBSITE_HOSTNAME) return `https://${process.env.WEBSITE_HOSTNAME}`;
    const port = process.env.PORT || 8080;
    return `http://localhost:${port}`;
  }
  
  setInterval(async () => {
    try {
      const redisClient = await getRedisClient();
      if (!redisClient) return;
      
      console.log('🔥 Starting scheduled cache warming...');
      
      for (const datasetName of WARMING_DATASETS) {
        const teamKey = generateCacheKey('stream', `${datasetName}:team`);
        const ttl = await redisClient.ttl(teamKey);
        
        // Refresh if TTL is less than 5 minutes
        if (ttl > 0 && ttl < 300) {
          console.log(`♨️  Warming ${datasetName} (TTL: ${ttl}s)`);
          // Trigger background refresh via cache preheater
          const base = getSelfBaseUrl();
          fetch(`${base}/api/cache-preheater/preheat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datasets: [datasetName] }),
          }).catch(() => {}); // Fire and forget
        }
      }
      
    } catch (error) {
      console.error('Cache warming error:', error);
    }
  }, 4 * 60 * 1000); // Every 4 minutes
}

module.exports = {
  DYNAMIC_CACHE_STRATEGY,
  calculateOptimalTTL,
  getCacheAnalytics,
  schedulePeriodicCacheWarming,
};