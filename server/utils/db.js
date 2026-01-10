"use strict";

const sql = require("mssql");

// Connection pools keyed by connection string
const pools = new Map();
const connecting = new Map();

// Periodic health check to detect and remove stale connections
const healthCheckIntervalMs = Number(process.env.SQL_HEALTH_CHECK_INTERVAL_MS || 120000); // 2 minutes
let healthCheckTimer = null;

const startHealthCheck = () => {
  if (healthCheckTimer) return;
  
  healthCheckTimer = setInterval(async () => {
    for (const [connStr, pool] of pools.entries()) {
      try {
        if (!pool.connected) {
          console.warn("Health check: removing disconnected pool");
          pools.delete(connStr);
          continue;
        }
        
        // Quick health check query with short timeout
        const testRequest = new sql.Request(pool);
        testRequest.requestTimeout = 5000; // 5 second timeout
        await testRequest.query("SELECT 1");
      } catch (err) {
        console.warn("Health check failed for pool, removing:", err?.code || err?.message);
        try {
          await pool.close();
        } catch (closeErr) {
          // Ignore close errors
        }
        pools.delete(connStr);
      }
    }
  }, healthCheckIntervalMs);
  
  // Don't block Node.js exit
  if (healthCheckTimer.unref) {
    healthCheckTimer.unref();
  }
};

// Start health check on first use
const healthCheckStartTimer = setTimeout(() => startHealthCheck(), 5000);

// Don't block Node.js exit (important for tests)
if (healthCheckStartTimer.unref) {
  healthCheckStartTimer.unref();
}

// Increase default concurrent requests for production scale
const parsedMaxConcurrent = Number(process.env.SQL_MAX_CONCURRENT_REQUESTS);
const maxConcurrentRequests = Math.max(
  Number.isFinite(parsedMaxConcurrent) && parsedMaxConcurrent > 0
    ? Math.floor(parsedMaxConcurrent)
    : 25, // Increased from 6 to handle Teams mobile concurrent requests
  1,
);

// Queue timeout to prevent indefinite waiting (default 30s)
const queueTimeoutMs = Number(process.env.SQL_QUEUE_TIMEOUT_MS || 30000);

let activeRequestsCount = 0;
const requestQueue = [];

// Monitoring metrics
let totalRequests = 0;
let totalErrors = 0;
let totalQueueTimeouts = 0;
let lastMetricsLog = Date.now();

const logMetrics = () => {
  const now = Date.now();
  if (now - lastMetricsLog > 60000) { // Log every minute
    console.log("SQL Connection Metrics:", {
      activePools: pools.size,
      activeRequests: activeRequestsCount,
      queuedRequests: requestQueue.length,
      totalRequests,
      totalErrors,
      totalQueueTimeouts,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) + '%' : '0%',
    });
    lastMetricsLog = now;
  }
};

const dequeueNext = () => {
  if (activeRequestsCount >= maxConcurrentRequests) {
    return;
  }

  const next = requestQueue.shift();
  if (next && typeof next.resolve === "function") {
    activeRequestsCount += 1;
    // Clear timeout since we're processing this request
    if (next.timeoutId) {
      clearTimeout(next.timeoutId);
    }
    next.resolve();
  }
};

const acquireRequestSlot = async () => new Promise((resolve, reject) => {
  if (activeRequestsCount < maxConcurrentRequests) {
    activeRequestsCount += 1;
    resolve();
    return;
  }

  // Add timeout to prevent indefinite queue waiting
  const timeoutId = setTimeout(() => {
    // Remove from queue if still waiting
    const index = requestQueue.findIndex(item => item.resolve === resolve);
    if (index !== -1) {
      requestQueue.splice(index, 1);
      totalQueueTimeouts++;
      totalErrors++;
      logMetrics();
      reject(new Error(`Request queue timeout after ${queueTimeoutMs}ms. Active: ${activeRequestsCount}, Queued: ${requestQueue.length}`));
    }
  }, queueTimeoutMs);

  requestQueue.push({ resolve, reject, timeoutId });
});

const releaseRequestSlot = () => {
  if (activeRequestsCount > 0) {
    activeRequestsCount -= 1;
  }
  dequeueNext();
};

const splitConnectionString = (connStr) => {
  const segments = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < connStr.length; i += 1) {
    const char = connStr[i];
    if (char === "{") depth += 1;
    if (char === "}" && depth > 0) depth -= 1;

    if (char === ";" && depth === 0) {
      if (current.trim()) segments.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
};

const toMilliseconds = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric >= 1000 ? numeric : numeric * 1000;
};

/**
 * Get (or create) a shared ConnectionPool for a given connection string.
 * Ensures only one connect() attempt per connStr at a time.
 */
async function getPool(connStr) {
  if (!connStr || typeof connStr !== "string") {
    throw new Error("getPool: invalid connection string");
  }

  const existing = pools.get(connStr);
  if (existing && existing.connected) return existing;


  const connectPromise = (async () => {
    // Close any half-open pool before reconnecting
    if (existing) {
      try { await existing.close(); } catch (_) { /* ignore */ }
    }

    // Configure pool and timeouts explicitly for stability on Azure App Service
    // Reduced timeouts for mobile clients (Teams app) to fail fast
  const requestTimeoutDefault = Number(process.env.SQL_REQUEST_TIMEOUT_MS || 60000); // 60s (was 300s)
  const connectionTimeoutDefault = Number(process.env.SQL_CONNECTION_TIMEOUT_MS || 15000); // 15s (was 30s)
    const acquireTimeoutMs = Number(process.env.SQL_POOL_ACQUIRE_TIMEOUT_MS || 10000); // 10s (was 20s)
    const idleTimeoutMs = Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000); // 30s (was 60s)
    const maxPool = Number(process.env.SQL_POOL_MAX || 25); // Reduced from 50 to match concurrency
    const minPool = Number(process.env.SQL_POOL_MIN || 2); // Reduced from 5

    // Parse connection string to handle both formats
    let poolConfig;
    
    // Check if it looks like a connection string (contains semicolons) or structured config
    if (connStr.includes(';') || (connStr.includes('=') && !connStr.startsWith('{'))) {
      // Traditional connection string format (Server=...; Database=...; etc.)
      // Parse connection string into individual properties for mssql v11+ compatibility
      const connParams = {};
      splitConnectionString(connStr).forEach((segment) => {
        const [rawKey, ...valueParts] = segment.split('=');
        if (!rawKey || valueParts.length === 0) return;

        let value = valueParts.join('=').trim();
        if (value.startsWith('{') && value.endsWith('}')) {
          value = value.slice(1, -1);
        }

        const keyLower = rawKey.trim().toLowerCase();
        if ([
          'server',
          'data source',
          'address',
          'addr',
          'network address'
        ].includes(keyLower)) {
          let serverValue = value;
          if (serverValue.startsWith('tcp:')) {
            serverValue = serverValue.substring(4);
          }
          const [serverName, port] = serverValue.split(',');
          connParams.server = serverName;
          if (port) {
            const parsedPort = parseInt(port, 10);
            if (Number.isFinite(parsedPort)) {
              connParams.port = parsedPort;
            }
          }
        } else if (keyLower === 'initial catalog' || keyLower === 'database') {
          connParams.database = value;
        } else if (keyLower === 'user id' || keyLower === 'uid' || keyLower === 'user') {
          connParams.user = value;
        } else if (keyLower === 'password' || keyLower === 'pwd') {
          connParams.password = value;
        } else if (keyLower === 'encrypt') {
          connParams.encrypt = value.toLowerCase() === 'true';
        } else if (keyLower === 'trustservercertificate') {
          connParams.trustServerCertificate = value.toLowerCase() === 'true';
        } else if (
          keyLower === 'connection timeout' ||
          keyLower === 'connect timeout' ||
          keyLower === 'login timeout'
        ) {
          const timeout = toMilliseconds(value);
          if (timeout != null) connParams.connectionTimeoutMs = timeout;
        } else if (
          keyLower === 'request timeout' ||
          keyLower === 'command timeout'
        ) {
          const timeout = toMilliseconds(value);
          if (timeout != null) connParams.requestTimeoutMs = timeout;
        }
      });

      const resolvedConnectionTimeout = Number.isFinite(connParams.connectionTimeoutMs)
        ? connParams.connectionTimeoutMs
        : connectionTimeoutDefault;
      const resolvedRequestTimeout = Number.isFinite(connParams.requestTimeoutMs)
        ? connParams.requestTimeoutMs
        : requestTimeoutDefault;
      
      poolConfig = {
        server: connParams.server,
        port: connParams.port || 1433,
        database: connParams.database,
        user: connParams.user,
        password: connParams.password,
        connectionTimeout: resolvedConnectionTimeout,
        requestTimeout: resolvedRequestTimeout,
        options: {
          encrypt: connParams.encrypt !== false, // default to true for Azure SQL
          trustServerCertificate: connParams.trustServerCertificate || false,
          requestTimeout: resolvedRequestTimeout,
          connectionTimeout: resolvedConnectionTimeout,
          enableArithAbort: true,
        },
        pool: {
          max: Number.isFinite(maxPool) ? maxPool : 10,
          min: Number.isFinite(minPool) ? minPool : 0,
          idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
          acquireTimeoutMillis: Number.isFinite(acquireTimeoutMs) ? acquireTimeoutMs : 20000,
          createTimeoutMillis: Number.isFinite(resolvedConnectionTimeout) ? resolvedConnectionTimeout : 30000,
          destroyTimeoutMillis: 5000,
        },
      };
    } else if (connStr.startsWith('{')) {
      // JSON-like config format
      try {
        const config = JSON.parse(connStr);
        if (!config.server) {
          throw new Error('JSON config must include "server" property');
        }
        const resolvedConnectionTimeout = Number.isFinite(config.connectionTimeout)
          ? config.connectionTimeout
          : connectionTimeoutDefault;
        const resolvedRequestTimeout = Number.isFinite(config.requestTimeout)
          ? config.requestTimeout
          : requestTimeoutDefault;

        poolConfig = {
          ...config,
          connectionTimeout: resolvedConnectionTimeout,
          requestTimeout: resolvedRequestTimeout,
          options: {
            encrypt: true,
            trustServerCertificate: false,
            requestTimeout: resolvedRequestTimeout,
            connectionTimeout: resolvedConnectionTimeout,
            enableArithAbort: true,
            ...config.options,
          },
          pool: {
            max: Number.isFinite(maxPool) ? maxPool : 10,
            min: Number.isFinite(minPool) ? minPool : 0,
            idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
            acquireTimeoutMillis: Number.isFinite(acquireTimeoutMs) ? acquireTimeoutMs : 20000,
            createTimeoutMillis: Number.isFinite(resolvedConnectionTimeout) ? resolvedConnectionTimeout : 30000,
            destroyTimeoutMillis: 5000,
            ...config.pool,
          },
        };
      } catch (parseErr) {
        throw new Error(`Invalid JSON connection config. Error: ${parseErr.message}`);
      }
    } else {
      // Fallback: create a basic config assuming it's a server name or simple format
      // This helps with local development
      poolConfig = {
        server: connStr,
        database: process.env.SQL_DATABASE || 'master',
        connectionTimeout: connectionTimeoutDefault,
        requestTimeout: requestTimeoutDefault,
        options: {
          encrypt: true,
          trustServerCertificate: true, // for local development
          requestTimeout: requestTimeoutDefault,
          connectionTimeout: connectionTimeoutDefault,
          enableArithAbort: true,
        },
        pool: {
          max: Number.isFinite(maxPool) ? maxPool : 10,
          min: Number.isFinite(minPool) ? minPool : 0,
          idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
          acquireTimeoutMillis: Number.isFinite(acquireTimeoutMs) ? acquireTimeoutMs : 20000,
          createTimeoutMillis: Number.isFinite(connectionTimeoutDefault) ? connectionTimeoutDefault : 30000,
          destroyTimeoutMillis: 5000,
        },
      };
      
      // Add authentication if available
      if (process.env.SQL_USER && process.env.SQL_PASSWORD) {
        poolConfig.user = process.env.SQL_USER;
        poolConfig.password = process.env.SQL_PASSWORD;
      }
    }

    const pool = new sql.ConnectionPool(poolConfig);
    
    // Enhanced error handling for connection pool
    pool.on("error", (err) => {
      console.error("SQL pool error:", err?.code || err?.message || "Unknown error");
      pools.delete(connStr);
    });

    // Connection health check validation
    try {
      await pool.connect();
      
      // Validate connection is actually working
      try {
        const testRequest = new sql.Request(pool);
        await testRequest.query("SELECT 1 AS test");
      } catch (testErr) {
        console.error("Connection health check failed:", testErr?.message);
        await pool.close().catch(() => {});
        throw new Error("Connection established but not responding to queries");
      }
      
      pools.set(connStr, pool);
      connecting.delete(connStr);
      return pool;
    } catch (connectErr) {
      connecting.delete(connStr);
      throw connectErr;
    }
  })();

  connecting.set(connStr, connectPromise);
  return await connectPromise;
}

/**
 * Execute a function with an sql.Request created from a shared pool.
 * Retries on transient connection errors by recreating the pool.
 */
async function withRequest(connStr, fn, retries = 2) {
  const configuredTimeout = Number(process.env.SQL_REQUEST_TIMEOUT_MS || 60000);
  const requestTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 60000;
  let lastErr;
  
  totalRequests++;
  logMetrics();
  
  try {
    await acquireRequestSlot();
  } catch (queueErr) {
    // Queue timeout occurred
    console.error("SQL request queue timeout:", queueErr.message);
    throw new Error(`Database busy: ${queueErr.message}`);
  }
  
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const pool = await getPool(connStr);
        
        // Validate pool is still connected before using
        if (!pool.connected) {
          console.warn(`Pool not connected on attempt ${attempt + 1}, recreating...`);
          pools.delete(connStr);
          throw new Error("Pool connection lost");
        }
        
        const request = new sql.Request(pool);
        request.requestTimeout = requestTimeout;
        return await fn(request, sql);
      } catch (err) {
        lastErr = err;
        const code = err?.code || err?.originalError?.code || err?.cause?.code;
        
        // Log detailed error for diagnostics
        if (attempt === 0) {
          console.error(`SQL error on attempt ${attempt + 1}:`, {
            code,
            message: err?.message,
            originalCode: err?.originalError?.code,
          });
        }
        
        // Include ECONNRESET and ETIMEDOUT as transient as seen on Azure SQL over ARR/iisnode
        const transientCodes = new Set([
          "ECONNCLOSED", 
          "ETIMEOUT", 
          "ETIMEDOUT", 
          "ESOCKET", 
          "ELOGIN", 
          "ECONNRESET",
          "EPIPE", // Broken pipe
          "ENOTFOUND", // DNS resolution failure
        ]);
        const retryable = transientCodes.has(String(code));
        
        if (!retryable || attempt === retries) {
          totalErrors++;
          logMetrics();
          // Don't throw queue timeout errors as transient SQL errors
          if (err.message?.includes("queue timeout")) {
            throw err;
          }
          throw err;
        }

        // Recreate pool then backoff with jitter
        console.log(`Retrying SQL request (attempt ${attempt + 2}/${retries + 1}) after ${code}...`);
        pools.delete(connStr);
        const backoffMs = 100 * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastErr || new Error("SQL request failed without error details");
  } finally {
    releaseRequestSlot();
  }
}

module.exports = { sql, getPool, withRequest };
