/**
 * Environment-aware logging utility
 * 
 * See docs/PLATFORM_OPERATIONS.md for conventions.
 * 
 * Levels:
 * - debug: Dev only, verbose troubleshooting
 * - info: Key operations (sparse in prod)
 * - warn: Recoverable issues, always shown
 * - error: Failures requiring attention, always shown
 * 
 * Usage:
 *   const { loggers } = require('./utils/logger');
 *   loggers.enquiries.info('Enquiry claimed', { operation: 'enquiry:claim', id: 123 });
 */

const { maskSensitiveFields } = require('./secureLogging');

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to error-only logging; use LOG_LEVEL=debug for verbose output during development
const DEFAULT_LEVEL = LOG_LEVELS.error;
const currentLevel = process.env.LOG_LEVEL 
  ? (LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] ?? DEFAULT_LEVEL)
  : DEFAULT_LEVEL;

function shouldLog(level) {
  if (isTest) return false;
  return LOG_LEVELS[level] >= currentLevel;
}

function formatArgs(prefix, args) {
  const masked = args.map(arg => 
    typeof arg === 'object' && arg !== null 
      ? maskSensitiveFields(arg)
      : arg
  );
  return prefix ? [`[${prefix}]`, ...masked] : masked;
}

/**
 * Create a logger instance with optional prefix
 */
function createLogger(prefix = '') {
  return {
    debug(...args) {
      if (shouldLog('debug')) console.log(...formatArgs(prefix, args));
    },
    info(...args) {
      if (shouldLog('info')) console.info(...formatArgs(prefix, args));
    },
    warn(...args) {
      if (shouldLog('warn')) console.warn(...formatArgs(prefix, args));
    },
    error(...args) {
      if (shouldLog('error')) console.error(...formatArgs(prefix, args));
    },
    
    /**
     * Log a key operation (always shown, suitable for App Insights)
     * @param {string} operation - Operation name (e.g., 'matter:open')
     * @param {object} context - Structured context
     */
    op(operation, context = {}) {
      console.info(...formatArgs(prefix, [operation, context]));
    },
    
    /**
     * Log an operation failure with recovery context
     * @param {string} operation - Operation name
     * @param {Error|string} error - The error
     * @param {object} context - Recovery context
     */
    fail(operation, error, context = {}) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(...formatArgs(prefix, [
        `${operation} FAILED`,
        { ...context, error: msg, recoverable: context.recoverable ?? true }
      ]));
    },

    child(childPrefix) {
      const combined = prefix ? `${prefix}:${childPrefix}` : childPrefix;
      return createLogger(combined);
    }
  };
}

const logger = createLogger();

// Pre-configured domain loggers
const loggers = {
  db: createLogger('DB'),
  cache: createLogger('Cache'),
  clio: createLogger('Clio'),
  auth: createLogger('Auth'),
  stream: createLogger('Stream'),
  enquiries: createLogger('Enquiries'),
  matters: createLogger('Matters'),
  payments: createLogger('Payments'),
  email: createLogger('Email'),
  redis: createLogger('Redis'),
};

module.exports = {
  logger,
  loggers,
  createLogger,
  isDev,
  shouldLog,
  LOG_LEVELS,
};
