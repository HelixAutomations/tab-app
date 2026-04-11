/**
 * Async mutex for data sync operations.
 *
 * Ensures only ONE sync operation (Collected or WIP, any tier) runs at a time.
 * Queued operations wait in FIFO order. Prevents the noon pile-up where
 * 4 syncs fire within 17 minutes and peg CPU at 100% for 3 hours.
 *
 * Exposes queue state for the ops-pulse dashboard.
 */

const { createLogger } = require('./logger');
const { trackEvent, trackMetric } = require('./appInsights');

const log = createLogger('SyncMutex');

let _locked = false;
let _holder = null;      // { name, startedAt }
const _queue = [];        // [{ name, resolve }]
const _history = [];      // last 20 completed ops
const MAX_HISTORY = 20;

/**
 * Acquire the mutex. Returns a release function.
 * If already held, the caller waits in a FIFO queue.
 * @param {string} name - Human label for the operation (e.g. 'syncCollectedTimeHot')
 * @returns {Promise<() => void>} release function
 */
function acquire(name) {
  return new Promise((resolve) => {
    const grant = () => {
      _locked = true;
      _holder = { name, startedAt: Date.now() };
      log.info(`[SyncMutex] Acquired by ${name} (queue depth: ${_queue.length})`);
      trackEvent('SyncMutex.Acquired', { name, queueDepth: _queue.length });

      const release = () => {
        const durationMs = Date.now() - _holder.startedAt;
        _history.unshift({ name: _holder.name, startedAt: _holder.startedAt, durationMs, completedAt: Date.now() });
        if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
        trackMetric('SyncMutex.HoldDuration', durationMs, { name: _holder.name });
        log.info(`[SyncMutex] Released by ${_holder.name} (held ${Math.round(durationMs / 1000)}s)`);

        _holder = null;

        if (_queue.length > 0) {
          const next = _queue.shift();
          next.grant();
        } else {
          _locked = false;
        }
      };

      resolve(release);
    };

    if (!_locked) {
      grant();
    } else {
      log.info(`[SyncMutex] ${name} queued behind ${_holder?.name} (position ${_queue.length + 1})`);
      trackEvent('SyncMutex.Queued', { name, behind: _holder?.name, position: _queue.length + 1 });
      _queue.push({ name, grant });
    }
  });
}

/** Current state for ops-pulse dashboard */
function getState() {
  return {
    locked: _locked,
    holder: _holder ? { name: _holder.name, startedAt: _holder.startedAt, heldMs: Date.now() - _holder.startedAt } : null,
    queueDepth: _queue.length,
    queue: _queue.map((q) => q.name),
    recentHistory: _history.slice(0, 10),
  };
}

module.exports = { acquire, getState };
