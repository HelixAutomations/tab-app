/**
 * Environment-aware logging utility for frontend
 * 
 * - REACT_APP_DEBUG_LOGS=true enables verbose debug logging
 * - Production builds suppress debug and info logs by default
 * - Development builds also suppress debug logs by default (opt-in via REACT_APP_DEBUG_LOGS)
 * - Errors are always logged
 */

const isDev = process.env.NODE_ENV !== 'production';
const isDebugEnabled = process.env.REACT_APP_DEBUG_LOGS === 'true';

export const isDebugLogs = (): boolean => isDebugEnabled;

/**
 * Debug logs - only in development or when REACT_APP_DEBUG_LOGS=true
 */
export const debugLog = (...args: unknown[]): void => {
  if (isDebugLogs()) console.log(...args);
};

/**
 * Debug warnings - only in development or when REACT_APP_DEBUG_LOGS=true
 */
export const debugWarn = (...args: unknown[]): void => {
  if (isDebugLogs()) console.warn(...args);
};

/**
 * Info logs - only in development (slightly less verbose than debug)
 */
export const infoLog = (...args: unknown[]): void => {
  if (isDev) console.log(...args);
};

/**
 * Error logs - always shown (critical for debugging production issues)
 */
export const errorLog = (...args: unknown[]): void => {
  console.error(...args);
};

/**
 * Create a prefixed logger for a specific component/module
 */
export const createLogger = (prefix: string) => ({
  debug: (...args: unknown[]) => debugLog(`[${prefix}]`, ...args),
  info: (...args: unknown[]) => infoLog(`[${prefix}]`, ...args),
  warn: (...args: unknown[]) => debugWarn(`[${prefix}]`, ...args),
  error: (...args: unknown[]) => errorLog(`[${prefix}]`, ...args),
});
