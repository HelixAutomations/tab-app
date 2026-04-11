/**
 * Request tracker — lightweight ring-buffer middleware.
 *
 * Records method, path, status, duration, user initials, and timestamp
 * for the last N API requests. Feed to ops-pulse dashboard as ApiHeat.
 */

const BUFFER_SIZE = 200;
const _buffer = [];

/** Express middleware — insert early in the pipeline */
function requestTrackerMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const entry = {
      ts: Date.now(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      user: req.user?.initials || null,
    };

    _buffer.push(entry);
    if (_buffer.length > BUFFER_SIZE) _buffer.shift();
  });

  next();
}

/** Get recent requests (newest first) */
function getRecentRequests(limit = 50) {
  return _buffer.slice(-limit).reverse();
}

/** Summary stats for pulse strip */
function getRequestStats() {
  const now = Date.now();
  const last5min = _buffer.filter((r) => now - r.ts < 5 * 60 * 1000);
  const errors = last5min.filter((r) => r.status >= 500);
  const durations = last5min.map((r) => r.durationMs);
  const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const p95Ms = durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] : 0;

  return {
    total5min: last5min.length,
    errors5min: errors.length,
    avgMs,
    p95Ms,
    rpm: Math.round(last5min.length / 5),
  };
}

module.exports = { requestTrackerMiddleware, getRecentRequests, getRequestStats };
