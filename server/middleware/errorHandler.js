/**
 * Centralised Express error handler
 *
 * Catches any unhandled error from any route.
 * - Logs to console + App Insights
 * - Sends DM notification for 500s (rate-limited by hubNotifier)
 * - Returns clean JSON for API routes, plain text otherwise
 */

const { trackException, trackEvent } = require('../utils/appInsights');
const { notify } = require('../utils/hubNotifier');
let _pushError;
try { _pushError = require('../routes/ops-pulse').pushError; } catch { /* ops-pulse not loaded yet */ }

function errorHandler(error, req, res, next) {
  const arrLogId = req.get('x-arr-log-id');
  const status = typeof error?.status === 'number' ? error.status : 500;

  // Common body-parser errors
  const isTooLarge =
    error?.type === 'entity.too.large' ||
    error?.name === 'PayloadTooLargeError' ||
    error?.statusCode === 413;

  const safeStatus = isTooLarge ? 413 : status;
  const message = isTooLarge
    ? 'Request body too large'
    : (error?.message || 'Internal server error');

  // Console log
  console.error('[server] Error:', {
    method: req.method,
    path: req.originalUrl,
    status: safeStatus,
    arrLogId,
    name: error?.name,
    type: error?.type,
    message,
  });

  // App Insights
  trackException(error, {
    operation: 'HTTP.UnhandledError',
    method: req.method,
    path: req.originalUrl,
    status: String(safeStatus),
    arrLogId: arrLogId || '',
  });

  trackEvent('Server.Error.Caught', {
    method: req.method,
    path: req.originalUrl,
    status: String(safeStatus),
    errorName: error?.name || '',
    arrLogId: arrLogId || '',
  });

  // Push to ops-pulse error stream for Helix Eye
  if (_pushError) {
    _pushError({
      message,
      path: req.originalUrl,
      status: safeStatus,
      user: req.user?.initials || null,
      stack: error?.stack,
    });
  }

  // DM notification for genuine 500s only — not 4xx client errors
  if (safeStatus >= 500) {
    notify('error.critical', {
      method: req.method,
      path: req.originalUrl,
      status: safeStatus,
      message,
      arrLogId: arrLogId || '',
    });
  }

  // JSON for API routes, plain text otherwise
  if (req.originalUrl?.startsWith('/api/')) {
    return res.status(safeStatus).json({
      error: isTooLarge ? 'payload_too_large' : 'internal_error',
      message,
      arrLogId,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(safeStatus).send(message);
}

module.exports = errorHandler;
