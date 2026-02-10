/**
 * Application Insights Telemetry Utility
 *
 * Lightweight wrapper around the `applicationinsights` SDK.
 * Auto-detects `APPLICATIONINSIGHTS_CONNECTION_STRING` in App Service.
 * Locally (no connection string), all calls become no-ops — zero overhead.
 *
 * Usage:
 *   const { trackEvent, trackException, trackMetric, trackDependency } = require('../utils/appInsights');
 *
 *   trackEvent('DataOps.SyncCompleted', { operation: 'collectedTime', daysBack: 7, rows: 1200 });
 *   trackException(error, { operation: 'syncWip', phase: 'clioFetch' });
 *   trackMetric('DataOps.SyncDuration', 4500, { operation: 'collectedTime' });
 *   trackDependency('Clio', 'POST /reports.json', 3200, true, { reportId: '...' });
 *
 * Query in App Insights (Log Analytics / KQL):
 *   customEvents | where name startswith "DataOps" | project timestamp, name, customDimensions
 *   exceptions   | where customDimensions.component == "DataOps"
 *   customMetrics | where name == "DataOps.SyncDuration"
 *   dependencies  | where target == "Clio"
 */

let client = null;

function init() {
  const connStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connStr) {
    console.log('[AppInsights] No connection string — telemetry disabled (local dev)');
    return;
  }

  try {
    const appInsights = require('applicationinsights');
    appInsights
      .setup(connStr)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, true)   // captures console.log/warn/error → traces
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .setSendLiveMetrics(true)
      .start();

    client = appInsights.defaultClient;
    client.context.tags[client.context.keys.cloudRole] = 'helix-hub-server';
    console.log('[AppInsights] Telemetry initialised');
  } catch (err) {
    console.warn('[AppInsights] Failed to initialise:', err.message);
  }
}

// ─── Telemetry helpers (no-op when client is null) ───

/**
 * Track a named custom event with properties.
 * Use for key lifecycle moments: sync started, completed, validated, scheduler fired.
 *
 * @param {string} name - Event name, e.g. 'DataOps.SyncCompleted'
 * @param {Record<string, string|number|boolean>} properties - Structured context
 * @param {Record<string, number>} [measurements] - Numeric measurements
 */
function trackEvent(name, properties = {}, measurements = {}) {
  if (!client) return;
  // Stringify non-string property values for App Insights compatibility
  const safeProps = {};
  for (const [k, v] of Object.entries(properties)) {
    safeProps[k] = v == null ? '' : String(v);
  }
  client.trackEvent({ name, properties: safeProps, measurements });
}

/**
 * Track an exception with structured context.
 *
 * @param {Error} error - The error object
 * @param {Record<string, string>} [properties] - Additional context (operation, phase, etc.)
 */
function trackException(error, properties = {}) {
  if (!client) return;
  const safeProps = { component: 'DataOps', ...properties };
  for (const [k, v] of Object.entries(safeProps)) {
    safeProps[k] = v == null ? '' : String(v);
  }
  client.trackException({ exception: error, properties: safeProps });
}

/**
 * Track a numeric metric.
 *
 * @param {string} name - Metric name, e.g. 'DataOps.SyncDuration'
 * @param {number} value - The value
 * @param {Record<string, string>} [properties] - Dimensions
 */
function trackMetric(name, value, properties = {}) {
  if (!client) return;
  const safeProps = {};
  for (const [k, v] of Object.entries(properties)) {
    safeProps[k] = v == null ? '' : String(v);
  }
  client.trackMetric({ name, value, properties: safeProps });
}

/**
 * Track an external dependency call (Clio API, SQL, Redis, etc.).
 *
 * @param {string} target - e.g. 'Clio', 'SQL', 'Redis'
 * @param {string} name - e.g. 'POST /reports.json', 'INSERT collectedTime'
 * @param {number} duration - Duration in ms
 * @param {boolean} success - Whether the call succeeded
 * @param {Record<string, string>} [properties] - Additional context
 */
function trackDependency(target, name, duration, success, properties = {}) {
  if (!client) return;
  const safeProps = {};
  for (const [k, v] of Object.entries(properties)) {
    safeProps[k] = v == null ? '' : String(v);
  }
  client.trackDependency({
    target,
    name,
    duration,
    resultCode: success ? 200 : 500,
    success,
    dependencyTypeName: 'HTTP',
    data: name,
    properties: safeProps,
  });
}

/**
 * Flush pending telemetry. Call on graceful shutdown.
 * @returns {Promise<void>}
 */
function flush() {
  if (!client) return Promise.resolve();
  return new Promise((resolve) => {
    client.flush({ callback: () => resolve() });
  });
}

module.exports = {
  init,
  trackEvent,
  trackException,
  trackMetric,
  trackDependency,
  flush,
};
