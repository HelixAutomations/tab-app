const express = require('express');
const router = express.Router();

/**
 * Real-time log streaming endpoint using Server-Sent Events
 * 
 * Logs are ALWAYS captured to buffer (even with no clients).
 * This ensures you see recent activity when you connect.
 * 
 * See docs/PLATFORM_OPERATIONS.md for logging conventions.
 */

// Store connected clients
const clients = new Set();

// Log buffer for recent logs (circular buffer)
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];

// Original console methods (stored once)
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

/**
 * Create a log entry from console arguments
 */
function createLogEntry(level, args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 0);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp,
    level,
    message: maskSensitiveData(message),
  };
}

/**
 * Mask sensitive data patterns in log messages
 */
function maskSensitiveData(text) {
  if (typeof text !== 'string') return text;
  
  // Mask email addresses (keep domain for context)
  text = text.replace(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/gi, 
    (_, local, domain) => `${local.substring(0, 2)}***@${domain}`);
  
  // Mask long tokens/keys (40+ alphanumeric chars)
  text = text.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[TOKEN]');
  
  // Mask connection string parts
  text = text.replace(/Server=[^;]+;/gi, 'Server=***;');
  text = text.replace(/Password=[^;]+;/gi, 'Password=***;');
  text = text.replace(/User Id=[^;]+;/gi, 'User Id=***;');
  
  return text;
}

/**
 * Broadcast log entry to connected clients
 */
function broadcastLog(entry) {
  // Always buffer (so you see recent logs when connecting)
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Only broadcast if clients connected
  if (clients.size > 0) {
    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}

/**
 * Initialize console interception (runs once at startup)
 */
function initConsoleInterception() {
  ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
    console[level] = (...args) => {
      // Always call original
      originalConsole[level](...args);
      // Always capture to buffer + broadcast if clients
      broadcastLog(createLogEntry(level, args));
    };
  });
}

// Start intercepting immediately on module load
initConsoleInterception();

/**
 * SSE endpoint for real-time log streaming
 * GET /api/logs/stream
 */
router.get('/stream', (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Flush headers early so proxies/browsers start the stream immediately
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  if (typeof res.flush === 'function') {
    res.flush();
  }

  // Send buffered logs (recent activity before you connected)
  for (const entry of logBuffer) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  if (typeof res.flush === 'function') {
    res.flush();
  }

  clients.add(res);

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

/**
 * Get recent logs (non-streaming)
 * GET /api/logs/recent
 */
router.get('/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, LOG_BUFFER_SIZE);
  res.json({
    logs: logBuffer.slice(-limit),
    total: logBuffer.length,
  });
});

/**
 * Clear log buffer
 * POST /api/logs/clear
 */
router.post('/clear', (req, res) => {
  logBuffer.length = 0;
  
  const msg = { type: 'clear', timestamp: new Date().toISOString() };
  for (const client of clients) {
    try {
      client.write(`data: ${JSON.stringify(msg)}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
  
  res.json({ success: true });
});

/**
 * Status endpoint
 * GET /api/logs/status
 */
router.get('/status', (req, res) => {
  res.json({
    clients: clients.size,
    buffered: logBuffer.length,
  });
});

module.exports = router;
