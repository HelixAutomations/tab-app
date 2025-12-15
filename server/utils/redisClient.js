const redis = require('redis');
const { loggers } = require('./logger');

const log = loggers.redis;

// Redis client singleton with connection promise to prevent race conditions
let redisClient = null;
let isConnected = false;
let connectionPromise = null;
// Last used auth context (for diagnostics)
let lastAuthContext = { method: null, username: undefined, tenantId: undefined, oid: undefined, appid: undefined, sub: undefined, upn: undefined };
// In-flight de-duplication map: cacheKey -> Promise
const inflightCache = new Map();
// Rate-limit auth error logging (log once per minute max)
let lastAuthErrorLog = 0;
const AUTH_ERROR_LOG_INTERVAL_MS = 60 * 1000;

// Token management for Entra ID auth
let cachedCredential = null;
let lastTokenExpiry = 0;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// Cache configuration
const CACHE_CONFIG = {
  // TTL values in seconds
  TTL: {
    ENQUIRIES: 5 * 60,        // 5 minutes (frequently updated)
    MATTERS: 15 * 60,         // 15 minutes (moderate updates)
    CLIO_CONTACTS: 60 * 60,   // 1 hour (external API, expensive)
    TEAM_DATA: 24 * 60 * 60,  // 24 hours (rarely changes)
    UNIFIED: 10 * 60,         // 10 minutes (cross-database queries)
  },
  
  // Cache key prefixes for namespace separation
  PREFIXES: {
    HELIX_CORE: 'hc',         // helix-core-data database
    INSTRUCTIONS: 'inst',      // instructions database
    CLIO: 'clio',             // External Clio API
    UNIFIED: 'unified',       // Cross-database aggregated data
  }
};

/**
 * Get or refresh Entra ID credential and token for Redis authentication
 * @returns {Object|null} { token, username, claims } or null if unavailable
 */
async function getEntraToken() {
  const requestedTenant = process.env.REDIS_TENANT_ID || process.env.AZURE_TENANT_ID || undefined;
  
  try {
    const { DefaultAzureCredential, AzureCliCredential } = require('@azure/identity');

    // Create credential if not cached
    if (!cachedCredential) {
      if (requestedTenant) {
        try {
          cachedCredential = new AzureCliCredential({ tenantId: requestedTenant });
          const tprev = String(requestedTenant).slice(0, 8);
          log.debug(`🎯 Using Azure CLI credential for tenant ${tprev}…`);
        } catch (e) {
          log.warn('⚠️  AzureCliCredential init failed, falling back to DefaultAzureCredential');
          cachedCredential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
        }
      } else {
        cachedCredential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
      }
    }

    const tokenResponse = await cachedCredential.getToken('https://redis.azure.com/.default');
    if (!tokenResponse?.token) {
      log.warn('⚠️  Entra ID token not acquired; Redis cache will be disabled');
      return null;
    }

    // Store expiry for proactive refresh
    lastTokenExpiry = tokenResponse.expiresOnTimestamp || (Date.now() + 3600000);

    // Decode claims
    function decodeJwtClaims(t) {
      try {
        const parts = String(t).split('.');
        if (parts.length < 2) return {};
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '==='.slice((b64.length + 3) % 4);
        const json = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json);
      } catch {
        return {};
      }
    }

    const claims = decodeJwtClaims(tokenResponse.token);
    const derivedUsername = process.env.REDIS_USER
      || claims.oid
      || claims.appid
      || claims.sub
      || 'default';

    return { token: tokenResponse.token, username: derivedUsername, claims };
  } catch (tokenError) {
    log.warn('⚠️  Could not acquire Entra ID token for Redis:', tokenError?.message || tokenError);
    // Reset credential on error to allow fresh attempt
    cachedCredential = null;
    return null;
  }
}

/**
 * Check if current token needs refresh
 */
function needsTokenRefresh() {
  if (!lastTokenExpiry) return true;
  return Date.now() >= (lastTokenExpiry - TOKEN_REFRESH_BUFFER_MS);
}

/**
 * Initialize Redis client with Azure connection and Entra ID support
 */
async function initRedisClient() {
  // Return existing healthy connection
  if (redisClient && isConnected && redisClient.isReady) {
    return redisClient;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    log.debug('🔄 Redis initialization in progress, waiting...');
    return connectionPromise;
  }

  // Start new connection process
  connectionPromise = performRedisConnection();
  
  try {
    const result = await connectionPromise;
    return result;
  } finally {
    connectionPromise = null;
  }
}

async function performRedisConnection() {
  try {
    // Clean up any existing client
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch (e) {
        // Ignore disconnection errors
      }
      redisClient = null;
      isConnected = false;
    }

    // Azure Redis connection configuration
    const redisHost = process.env.REDIS_HOST || 'helix-cache-redis.redis.cache.windows.net';
    const redisPort = process.env.REDIS_PORT || 6380;
    
    // Auth config (auto-detect: access key first, then Entra ID)
    const redisPassword = process.env.REDIS_PASSWORD;
    const redisUser = process.env.REDIS_USER || 'default';
    const useEntraAuth = !redisPassword;
    const requestedTenant = process.env.REDIS_TENANT_ID || process.env.AZURE_TENANT_ID || undefined;

    const redisConfig = {
      socket: {
        host: redisHost,
        port: redisPort,
        tls: true, // Azure Redis requires TLS
        keepAlive: 30000, // Keep connection alive
        connectTimeout: 10000, // 10 second connect timeout
        commandTimeout: 5000, // 5 second command timeout
      },
      retryStrategy: (retries) => {
        if (retries > 10) {
          log.error('Redis connection failed after 10 retries');
          return null;
        }
        // Exponential backoff with jitter
        const delay = Math.min(retries * 1000 + Math.random() * 1000, 10000);
        log.debug(`🔄 Redis retry ${retries}/10 in ${Math.round(delay)}ms`);
        return delay;
      },
      lazyConnect: true, // Connect only when needed
    };

  // Track auth context for better error messages
  lastAuthContext = { method: useEntraAuth ? 'entra' : 'key', username: undefined, tenantId: requestedTenant };

    // Configure authentication automatically
    if (redisPassword) {
      log.debug('🔑 Using access key authentication for Redis');
      redisConfig.password = redisPassword;
      if (redisUser !== 'default') {
        redisConfig.username = redisUser;
      }
      lastAuthContext.username = redisConfig.username || 'default';
    } else {
      log.debug('🔐 No access key set; attempting Microsoft Entra ID authentication for Redis');
      try {
        const { DefaultAzureCredential, AzureCliCredential } = require('@azure/identity');

        // Prefer Azure CLI credential if a specific tenant is requested to avoid tenant mismatches.
        // Fall back to DefaultAzureCredential otherwise.
        let credential;
        if (requestedTenant) {
          try {
            credential = new AzureCliCredential({ tenantId: requestedTenant });
            const tprev = String(requestedTenant).slice(0, 8);
            log.debug(`🎯 Using Azure CLI credential for tenant ${tprev}…`);
          } catch (e) {
            log.warn('⚠️  AzureCliCredential init failed, falling back to DefaultAzureCredential');
            credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
          }
        } else {
          credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
        }

        const tokenResponse = await credential.getToken('https://redis.azure.com/.default');
        if (!tokenResponse?.token) {
          log.warn('⚠️  Entra ID token not acquired; Redis cache will be disabled');
          return null;
        }

        // Derive the required Redis username from the token claims.
        // Per Azure guidance: username should be Object ID (oid) of the principal (user/service principal/managed identity).
        function decodeJwtClaims(t) {
          try {
            const parts = String(t).split('.');
            if (parts.length < 2) return {};
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '==='.slice((b64.length + 3) % 4);
            const json = Buffer.from(padded, 'base64').toString('utf8');
            return JSON.parse(json);
          } catch {
            return {};
          }
        }

        const claims = decodeJwtClaims(tokenResponse.token);
        const derivedUsername = process.env.REDIS_USER
          || claims.oid /* user or app object id */
          || claims.appid /* some app tokens expose appid */
          || claims.sub /* fallback */
          || 'default';

        redisConfig.password = tokenResponse.token;
        redisConfig.username = derivedUsername;

        lastAuthContext = {
          method: 'entra',
          username: derivedUsername,
          tenantId: claims.tid,
          oid: claims.oid,
          appid: claims.appid,
          sub: claims.sub,
          upn: claims.upn || claims.preferred_username || claims.unique_name
        };

        const unamePreview = typeof derivedUsername === 'string' ? derivedUsername.slice(0, 8) : 'unknown';
        const tidPreview = typeof lastAuthContext.tenantId === 'string' ? lastAuthContext.tenantId.slice(0, 8) : 'unknown';
        const unameSource = process.env.REDIS_USER ? 'REDIS_USER' : (claims.oid ? 'oid' : (claims.appid ? 'appid' : (claims.sub ? 'sub' : 'default')));
        log.debug(`✅ Entra ID token acquired (tid=${tidPreview}); using username from ${unameSource}: ${unamePreview}…`);
      } catch (tokenError) {
        log.warn('⚠️  Could not acquire Entra ID token for Redis. Redis cache will be disabled.');
        log.warn(`   Details: ${tokenError?.message || tokenError}`);
        return null;
      }
    }

    redisClient = redis.createClient(redisConfig);

    redisClient.on('error', (err) => {
      const msg = String(err?.message || '');
      const isAuthError = msg.includes('WRONGPASS') || msg.includes('NOAUTH');
      
      // Rate-limit verbose auth error logging to avoid console spam
      if (isAuthError) {
        const now = Date.now();
        if (now - lastAuthErrorLog < AUTH_ERROR_LOG_INTERVAL_MS) {
          // Silently ignore repeat auth errors within the interval
          isConnected = false;
          redisClient = null;
          cachedCredential = null;
          lastTokenExpiry = 0;
          return;
        }
        lastAuthErrorLog = now;
        
        const who = lastAuthContext || {};
        const unamePreview = who.username ? String(who.username).slice(0, 8) : 'unknown';
        log.warn(`Redis auth failed (token likely expired). Will retry with fresh token. Username=${unamePreview}...`);
        isConnected = false;
        // Clear client and cached credential to force re-initialization with fresh token
        redisClient = null;
        cachedCredential = null;
        lastTokenExpiry = 0;
      } else {
        log.error('Redis error:', err);
        isConnected = false;
      }
    });

    redisClient.on('connect', () => {
      log.debug('🔗 Redis connecting...');
    });

    redisClient.on('ready', () => {
      const authMethod = useEntraAuth ? 'Entra ID' : 'Access Key';
      log.debug(`✅ Redis connected and ready (${authMethod} auth)`);
      isConnected = true;
    });

    redisClient.on('end', () => {
      log.debug('🔌 Redis connection ended');
      isConnected = false;
    });

    redisClient.on('reconnecting', () => {
      log.debug('🔄 Redis reconnecting...');
    });

    await redisClient.connect();
    return redisClient;

  } catch (error) {
    log.error('Failed to initialize Redis client:', error);
    redisClient = null;
    isConnected = false;
    return null;
  }
}

/**
 * Generate cache key with namespace and secure hashing for sensitive data
 * @param {string} prefix - Cache prefix (hc, inst, clio, unified)
 * @param {string} type - Data type (enquiries, matters, contacts)
 * @param {Array} params - Parameters for cache key
 * @returns {string} Formatted cache key with hashed sensitive data
 */
function generateCacheKey(prefix, type, ...params) {
  const crypto = require('crypto');
  
  const cleanParams = params
    .filter(p => p !== null && p !== undefined && p !== '')
    .map(p => {
      const param = String(p);
      
      // Hash email lists and other potentially sensitive data
      if (param.includes('@') || param.includes(',')) {
        // This looks like an email list or sensitive data - hash it
        const hash = crypto.createHash('sha256').update(param).digest('hex');
        return `h-${hash.substring(0, 16)}`; // Use first 16 chars of hash with prefix
      }
      
      // For non-sensitive data, clean normally
      return param.toLowerCase().replace(/[^a-z0-9]/g, '-');
    });
  
  return `${prefix}:${type}:${cleanParams.join(':')}`;
}

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {Object|null} Parsed data or null if not found
 */
async function getCache(key) {
  try {
    const client = await initRedisClient();
    if (!client || !isConnected) {
      const maskedKey = maskCacheKeyForLogging(key);
      log.debug(`⚠️  Redis client unavailable for key: ${maskedKey}`);
      return null;
    }

    const data = await client.get(key);
    if (!data) {
      const maskedKey = maskCacheKeyForLogging(key);
      log.debug(`🚫 Cache MISS: ${maskedKey} (key not found)`);
      return null;
    }

    const parsed = JSON.parse(data);
    return parsed;

  } catch (error) {
    const maskedKey = maskCacheKeyForLogging(key);
    log.error(`Cache GET error for key ${maskedKey}:`, error);
    return null;
  }
}

/**
 * Set data in cache with TTL
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {boolean} Success status
 */
async function setCache(key, data, ttl = CACHE_CONFIG.TTL.UNIFIED) {
  try {
    const client = await initRedisClient();
    if (!client || !isConnected) return false;

    const serialized = JSON.stringify({
      data,
      cached_at: new Date().toISOString(),
      ttl
    });

    await client.setEx(key, ttl, serialized);
    const maskedKey = maskCacheKeyForLogging(key);
    log.debug(`💾 Cache SET: ${maskedKey} (TTL: ${ttl}s)`);
    return true;

  } catch (error) {
    const maskedKey = maskCacheKeyForLogging(key);
    log.error(`Cache SET error for key ${maskedKey}:`, error);
    return false;
  }
}

/**
 * Delete cache key(s)
 * @param {string|Array} keys - Single key or array of keys
 * @returns {number} Number of keys deleted
 */
async function deleteCache(keys) {
  try {
    const client = await initRedisClient();
    if (!client || !isConnected) return 0;

    const keyArray = Array.isArray(keys) ? keys : [keys];
    const deleted = await client.del(keyArray);
    log.debug(`🗑️  Cache DELETE: ${deleted} keys removed`);
    return deleted;

  } catch (error) {
    log.error('Cache DELETE error:', error);
    return 0;
  }
}

/**
 * Find and delete cache keys by pattern
 * @param {string} pattern - Redis pattern (e.g., "hc:enquiries:*")
 * @returns {number} Number of keys deleted
 */
async function deleteCachePattern(pattern) {
  try {
    const client = await initRedisClient();
    if (!client || !isConnected) return 0;

    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;

    const deleted = await client.del(keys);
    log.debug(`🗑️  Cache PATTERN DELETE: ${deleted} keys removed (${pattern})`);
    return deleted;

  } catch (error) {
    log.error(`❌ Cache PATTERN DELETE error for ${pattern}:`, error);
    return 0;
  }
}

/**
 * Safely mask sensitive parts of cache keys for logging
 * @param {string} key - Cache key to mask
 * @returns {string} Masked cache key safe for logging
 */
function maskCacheKeyForLogging(key) {
  // If the key contains hashed data (h- prefix), it's already safe
  if (key.includes(':h-')) {
    return key;
  }
  
  // For other keys, mask any parts that might contain sensitive data
  return key.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '***@***');
}

/**
 * Cache wrapper for database queries
 * @param {string} cacheKey - Cache key
 * @param {Function} queryFunction - Function that returns data
 * @param {number} ttl - Cache TTL in seconds
 * @returns {Object} Data with cache metadata
 */
async function cacheWrapper(cacheKey, queryFunction, ttl = CACHE_CONFIG.TTL.UNIFIED) {
  try {
    // Try cache first
    const maskedKey = maskCacheKeyForLogging(cacheKey);
    log.debug(`🔍 Checking cache for key: ${maskedKey}`);
    const cached = await getCache(cacheKey);
    if (cached && Object.prototype.hasOwnProperty.call(cached, 'data')) {
      log.debug(`📦 Cache HIT: ${maskedKey}`);
      return cached.data; // preserve original shape
    }

    // Cache miss - de-dupe concurrent fetches for this key
    log.debug(`🌐 Cache MISS: ${maskedKey}`);
    if (inflightCache.has(cacheKey)) {
      log.debug(`🔁 Awaiting in-flight fetch for key: ${maskedKey}`);
      return await inflightCache.get(cacheKey);
    }
    const inFlight = (async () => {
      try {
        log.debug(`🚀 Executing query for key: ${maskedKey}`);
        const freshData = await queryFunction();
        const cacheSuccess = await setCache(cacheKey, freshData, ttl);
        if (!cacheSuccess) {
          log.warn(`⚠️  Failed to cache result for key: ${maskedKey}`);
        }
        return freshData;
      } finally {
        inflightCache.delete(cacheKey);
      }
    })();
    inflightCache.set(cacheKey, inFlight);
    return await inFlight;
  } catch (error) {
    const maskedKey = maskCacheKeyForLogging(cacheKey);
    log.error(`Cache wrapper error for key ${maskedKey}:`, error);
    // Fall back to executing query without cache
    log.debug(`🔄 Falling back to direct query execution`);
    const freshData = await queryFunction();
    return freshData;
  }
}

/**
 * Gracefully close Redis connection
 */
async function closeRedisClient() {
  if (redisClient && isConnected) {
    await redisClient.quit();
    log.debug('👋 Redis connection closed');
  }
}

/**
 * Get the initialized Redis client (or null if unavailable)
 */
async function getRedisClient() {
  try {
    // Return existing healthy connection immediately
    if (redisClient && isConnected && redisClient.isReady) {
      return redisClient;
    }
    
    // Initialize if needed (with singleton protection)
    const client = await initRedisClient();
    return client && isConnected ? client : null;
  } catch (error) {
    log.warn('⚠️  Redis client unavailable:', error.message);
    return null;
  }
}

module.exports = {
  CACHE_CONFIG,
  initRedisClient,
  getRedisClient,
  generateCacheKey,
  maskCacheKeyForLogging,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  cacheWrapper,
  closeRedisClient,
  getLastRedisAuthContext: () => ({ ...lastAuthContext }),
  
  // Convenience functions for common cache operations
  cacheEnquiries: (params, queryFn) => {
    const key = generateCacheKey(CACHE_CONFIG.PREFIXES.HELIX_CORE, 'enquiries', ...params);
    return cacheWrapper(key, queryFn, CACHE_CONFIG.TTL.ENQUIRIES);
  },
  
  cacheMatters: (params, queryFn) => {
    const key = generateCacheKey(CACHE_CONFIG.PREFIXES.INSTRUCTIONS, 'matters', ...params);
    return cacheWrapper(key, queryFn, CACHE_CONFIG.TTL.MATTERS);
  },
  
  cacheClioContacts: (params, queryFn) => {
    const key = generateCacheKey(CACHE_CONFIG.PREFIXES.CLIO, 'contacts', ...params);
    return cacheWrapper(key, queryFn, CACHE_CONFIG.TTL.CLIO_CONTACTS);
  },
  
  cacheUnified: (params, queryFn) => {
    const key = generateCacheKey(CACHE_CONFIG.PREFIXES.UNIFIED, 'data', ...params);
    return cacheWrapper(key, queryFn, CACHE_CONFIG.TTL.UNIFIED);
  }
};
