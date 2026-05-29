const { syncCollectedTime, syncWip, logOperation, logProgress, refreshReconciliationSnapshot } = require('../routes/dataOperations');
const { createLogger } = require('./logger');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { acquire, getState: getMutexState } = require('./syncMutex');
const { getCache, setCache } = require('./redisClient');
const { status: devStatus } = require('./devConsole');

const schedulerLogger = createLogger('DataOpsScheduler');

// ── Constants ────────────────────────────────────────────────────────
// Current month is re-cleared from Clio hourly for both Collected and WIP.
// Previous month is sealed on a bounded cadence only: 3 runs on the 1st,
// one overnight run on days 2-14, one extra overnight run on day 21, and one late run on the last day of the
// current month. No tiers, no drift detection — re-fetching IS reconciliation.
// The previous Hot/Warm/Cold cadence was retired 2026-05-01 because it left
// gaps the trust gate could not close.

const SYNC_TIMEOUT_MS = 10 * 60 * 1000;        // 10 min — full-month sync runs ~30s in practice
const BOOT_CATCHUP_DELAY_MS = 30 * 1000;        // 30s after start — let connections warm up

const BASE_TICK_MS = 30 * 1000;                 // 30s — normal cadence
const BACKOFF_TICK_MS = 60 * 1000;              // 60s — idle cadence
const BACKOFF_THRESHOLD = 10;                    // 10 ticks (~5 min) of no fires → back off

// ── Scheduler lifecycle ──────────────────────────────────────────────
let _tickTimer = null;
let _currentTickMs = BASE_TICK_MS;
let _idleStreak = 0;
let _shuttingDown = false;

function isBootCatchUpEnabled() {
  const raw = String(process.env.DATAOPS_BOOT_CATCHUP ?? '').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function getLondonNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    0,
  );
}

function formatDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatSlotKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function getLatestHourlySlotKey(now, targetMinute) {
  const slot = new Date(now);
  if (now.getMinutes() >= targetMinute) {
    slot.setHours(slot.getHours(), targetMinute, 0, 0);
  } else {
    slot.setHours(slot.getHours() - 1, targetMinute, 0, 0);
  }
  return formatSlotKey(slot);
}

function isLastDayOfMonth(date) {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isPreviousMonthSealSlot(now, targetMinute) {
  if (now.getMinutes() !== targetMinute) return false;
  const day = now.getDate();
  const hour = now.getHours();
  if (day === 1 && [3, 12, 23].includes(hour)) return true;
  if (day >= 2 && day <= 14 && hour === 2) return true;
  if (day === 21 && hour === 2) return true;
  return isLastDayOfMonth(now) && hour === 23;
}

function getLatestPreviousMonthSealSlotKey(now, targetMinute) {
  const candidates = [];
  const addCandidate = (day, hour) => {
    const candidate = new Date(now.getFullYear(), now.getMonth(), day, hour, targetMinute, 0, 0);
    if (candidate <= now) candidates.push(candidate);
  };

  const day = now.getDate();
  if (day <= 14 || day === 21) {
    [3, 12, 23].forEach((hour) => addCandidate(1, hour));
    const lastDailySealDay = Math.min(day, 14);
    for (let sealDay = 2; sealDay <= lastDailySealDay; sealDay += 1) {
      addCandidate(sealDay, 2);
    }
    if (day === 21) addCandidate(21, 2);
  }

  if (isLastDayOfMonth(now)) {
    addCandidate(now.getDate(), 23);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.getTime() - a.getTime());
  return formatSlotKey(candidates[0]);
}

// ── Scheduler state — exposed via getSchedulerState() for ops-pulse ──
const _tierState = {
  collected: { currentHourly: null, previousSeal: null },
  wip:       { currentHourly: null, previousSeal: null },
};

function recordTier(op, tier, status, slotKey, extra) {
  _tierState[op][tier] = { status, slotKey, ts: Date.now(), ...extra };
}

function getTierOperationName(entity, tier) {
  if (entity === 'CollectedTime') {
    if (tier === 'previousSeal') return 'syncCollectedTimePreviousSeal';
    return 'syncCollectedTimeCurrentHourly';
  }
  if (tier === 'previousSeal') return 'syncWipPreviousSeal';
  return 'syncWipCurrentHourly';
}

function logTierLifecycle(entity, tier, status, slotKey, triggeredBy, extra = {}) {
  logOperation({
    operation: getTierOperationName(entity, tier),
    status,
    triggeredBy,
    message: extra.message || `${entity} ${tier} ${status} (${slotKey})`,
    durationMs: extra.durationMs,
    invokedBy: extra.invokedBy || null,
  });
}

// ── Adaptive tick interval (matches eventPoller pattern) ─────────────
function rebuildTickInterval(newMs) {
  if (newMs === _currentTickMs || !_tickTimer) return;
  const from = _currentTickMs;
  _currentTickMs = newMs;
  clearInterval(_tickTimer);
  _tickTimer = setInterval(schedulerTick, _currentTickMs);
  if (typeof _tickTimer.unref === 'function') _tickTimer.unref();
  trackEvent('Scheduler.IntervalChanged', { from: String(from), to: String(newMs), idleStreak: String(_idleStreak) });
  devStatus('Data scheduler', true, `tick every ${newMs / 1000}s (adapted)`);
}

// ── Redis-backed dedup (in-memory fallback if Redis unavailable) ─────
const _memDedup = {
  collectedCurrentHourlyLastSlot: null,
  wipCurrentHourlyLastSlot: null,
  collectedPreviousSealLastSlot: null,
  wipPreviousSealLastSlot: null,
};

/** Check if a tier already fired for the given slot. Redis first, memory fallback. */
async function isDedupHit(dedupKey, slotKey, memField) {
  try {
    const cached = await getCache(`dataops:dedup:${dedupKey}`);
    if (cached?.data != null) return cached.data === slotKey;
  } catch { /* Redis down — fall through to memory */ }
  return _memDedup[memField] === slotKey;
}

/** Record that a tier fired for the given slot. Redis + memory. */
async function recordDedup(dedupKey, slotKey, memField, ttlSeconds) {
  _memDedup[memField] = slotKey;
  try {
    await setCache(`dataops:dedup:${dedupKey}`, slotKey, ttlSeconds);
  } catch { /* Redis down — memory dedup is still set */ }
}

// Dedup TTLs (interval + 5 min buffer)
const DEDUP_TTL = {
  hourly:  65 * 60,                // 65 min — slightly longer than the 60-min cadence
  previousSeal: 22 * 24 * 60 * 60,  // 22 days — covers day-21 confidence seal
};

/**
 * Hourly full-month re-clear scheduler.
 *
 * Cadence:
 *   :05 every hour → Collected sync, full current month (1st → today)
 *   :20 every hour → WIP sync, full current month (offset to avoid Clio rate-limit clash)
 *   Previous month seal → Collected at :33, WIP at :50 on:
 *     - day 1 at 03:xx, 12:xx, 23:xx
 *     - days 2-14 at 02:xx
 *     - day 21 at 02:xx
 *     - the last day of the current month at 23:xx
 *
 * After every successful sync the reconciliation snapshot is rebuilt for the
 * matching scope, so the trust gate sees post-sync parity within seconds.
 *
 * All syncs acquire the global sync mutex — only ONE sync runs at a time.
 * Steady state after day 14 is 2 hourly runs, with one extra day-21 seal.
 * Previous-month work is bounded to the seal window and month-end guard.
 *
 * Hardened features (Apr 2026, refined May 2026):
 * - Boot catch-up: hourly sync fires 30s after server start if last persisted
 *   slot is >70 min old (Redis-deduped). On a fresh boot this means the gate
 *   is trusted within ~1 minute of startup.
 * - Operation timeout: 10 min limit prevents stuck Clio polls from blocking queue
 * - Graceful shutdown: stopScheduler() drains before exit
 * - Adaptive polling: backs off to 60s when idle, snaps back near tier windows
 * - Redis dedup: survives restarts (in-memory fallback if Redis down)
 * - Duration metrics: trackMetric for all completions
 * - Post-sync reconciliation: refreshReconciliationSnapshot fires after success
 */
function startDataOperationsScheduler() {
  _shuttingDown = false;
  _idleStreak = 0;
  _currentTickMs = BASE_TICK_MS;

  schedulerLogger.info('Data operations scheduler started — hourly full-month re-clear (Europe/London)');
  devStatus('Data scheduler', true, 'started — hourly full-month re-clear (Europe/London)');
  trackEvent('Scheduler.Started', {
    cadence: 'current collected :05 hourly, current wip :20 hourly, previous seal :33/:50 on day1/day2-14/day21/last-day',
    operations: 'CollectedTime,Wip',
    mutex: true,
    bootCatchUpDelay: String(BOOT_CATCHUP_DELAY_MS),
    bootCatchUpEnabled: String(isBootCatchUpEnabled()),
    syncTimeout: String(SYNC_TIMEOUT_MS),
  });

  // Start the main tick
  _tickTimer = setInterval(schedulerTick, _currentTickMs);
  if (typeof _tickTimer.unref === 'function') _tickTimer.unref();

  if (isBootCatchUpEnabled()) {
    // ── Boot catch-up: fire hourly syncs after warmup delay if overdue ──
    setTimeout(() => runBootCatchUp(), BOOT_CATCHUP_DELAY_MS);
  } else {
    schedulerLogger.info('Boot catch-up disabled via DATAOPS_BOOT_CATCHUP');
    devStatus('Data scheduler', true, 'boot catch-up disabled');
    trackEvent('Scheduler.BootCatchUp.Disabled', {
      configuredValue: String(process.env.DATAOPS_BOOT_CATCHUP ?? ''),
    });
  }
}

/**
 * Stop the scheduler. Clears the tick interval and sets the shutdown flag.
 * Called from SIGTERM/SIGINT handlers to allow in-flight syncs to drain.
 */
function stopScheduler() {
  _shuttingDown = true;
  if (_tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
  schedulerLogger.info('Scheduler stopped — shutdown flag set');
  devStatus('Data scheduler', false, 'stopped (shutting down)');
  trackEvent('Scheduler.Stopped');
}

/** Wrap a sync op with the global mutex + timeout + telemetry + duration metric.
 *  When reconcileScope is provided, the parity snapshot is refreshed after the
 *  sync succeeds so the trust gate sees post-sync truth within seconds.
 *  A snapshot-refresh failure is soft-logged and never masks the underlying
 *  sync result. */
async function runWithMutex(opName, tier, entity, slotKey, fn, triggeredBy = 'scheduler', reconcileScope = null) {
  if (_shuttingDown) return;

  const opKey = entity === 'CollectedTime' ? 'collected' : 'wip';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  recordTier(opKey, tier, 'queued', slotKey);

  const release = await acquire(opName);
  if (_shuttingDown) { release(); return; }

  recordTier(opKey, tier, 'running', slotKey);
  logTierLifecycle(entity, tier, 'started', slotKey, triggeredBy, {
    message: `${entity} ${tier} running (${slotKey})`,
  });
  devStatus('Data scheduler', true, `${entity} ${tier} running (${slotKey})`);
  const startMs = Date.now();

  try {
    // Race fn() against timeout to prevent indefinite mutex hold
    const syncResult = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${SYNC_TIMEOUT_MS / 1000}s`)), SYNC_TIMEOUT_MS)
      ),
    ]);

    const durationMs = Date.now() - startMs;
    schedulerLogger.info(`${opName} completed (${slotKey}) in ${durationMs}ms`);
    trackEvent(`Scheduler.${entity}.${tierLabel}.Completed`, { slotKey, durationMs: String(durationMs) });
    trackMetric(`Scheduler.${entity}.${tierLabel}.Duration`, durationMs, { slotKey });
    recordTier(opKey, tier, 'completed', slotKey, { durationMs });
    logTierLifecycle(entity, tier, 'completed', slotKey, triggeredBy, {
      durationMs,
      message: `${entity} ${tier} completed (${slotKey})`,
    });
    devStatus('Data scheduler', true, `${entity} ${tier} done (${(durationMs / 1000).toFixed(1)}s)`);

    // Post-sync reconciliation refresh — this is what makes the trust gate
    // continuously truthful. Soft-fail: a snapshot rebuild failure does not
    // invalidate the successful sync.
    if (reconcileScope && typeof refreshReconciliationSnapshot === 'function') {
      const snapStart = Date.now();
      try {
        await refreshReconciliationSnapshot(reconcileScope);
        const snapDurationMs = Date.now() - snapStart;
        trackEvent('Scheduler.Parity.Completed', {
          scope: reconcileScope, entity, tier, slotKey, durationMs: String(snapDurationMs),
        });
        trackMetric('Scheduler.Parity.Duration', snapDurationMs, { scope: reconcileScope });
      } catch (snapErr) {
        const snapDurationMs = Date.now() - snapStart;
        trackException(snapErr instanceof Error ? snapErr : new Error(String(snapErr?.message || snapErr)), {
          phase: 'refreshReconciliationSnapshot', scope: reconcileScope, entity, tier, slotKey,
        });
        trackEvent('Scheduler.Parity.Failed', {
          scope: reconcileScope, entity, tier, slotKey,
          error: snapErr?.message || String(snapErr), durationMs: String(snapDurationMs),
        });
      }
    }
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const isTimeout = error?.message?.startsWith('Timeout after');
    const status = isTimeout ? 'timeout' : 'failed';

    schedulerLogger.error(`${opName} ${status}:`, error?.message || error);
    trackException(error instanceof Error ? error : new Error(String(error?.message || error)), {
      tier, entity, slotKey, durationMs: String(durationMs),
    });
    trackEvent(`Scheduler.${entity}.${tierLabel}.${isTimeout ? 'Timeout' : 'Failed'}`, {
      slotKey, error: error?.message || String(error), durationMs: String(durationMs),
    });
    recordTier(opKey, tier, status, slotKey, { error: error?.message, durationMs });
    logTierLifecycle(entity, tier, status, slotKey, triggeredBy, {
      durationMs,
      message: error?.message
        ? `${entity} ${tier} ${status} (${slotKey}) — ${error.message}`
        : `${entity} ${tier} ${status} (${slotKey})`,
    });
    devStatus('Data scheduler', false, `${entity} ${tier} ${status} (${(durationMs / 1000).toFixed(1)}s)`);
  } finally {
    release();
  }
}

/**
 * Boot catch-up: on server start, fire current hourly syncs immediately if
 * the latest slot was missed, and fire previous-month seal syncs only when
 * the latest seal slot is inside the intended seal window.
 *
 * Keeps the gate trustworthy across restarts without waiting for the next
 * wall-clock slot, while avoiding previous-month work after the seal window.
 */
async function runBootCatchUp() {
  if (_shuttingDown) return;

  const now = getLondonNow();
  const slotKey = formatSlotKey(now);
  schedulerLogger.info(`Boot catch-up check (${slotKey})`);

  const monthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = formatDateKey(now);
  const previousMonthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousMonthEnd = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 0));

  const dueSlots = {
    collectedCurrentHourly: getLatestHourlySlotKey(now, 5),
    wipCurrentHourly: getLatestHourlySlotKey(now, 20),
    collectedPreviousSeal: getLatestPreviousMonthSealSlotKey(now, 33),
    wipPreviousSeal: getLatestPreviousMonthSealSlotKey(now, 50),
  };

  // ── Collected current month ──
  const collectedCurrentDue = !(await isDedupHit('collected:current-hourly', dueSlots.collectedCurrentHourly, 'collectedCurrentHourlyLastSlot'));
  if (collectedCurrentDue) {
    schedulerLogger.info(`Boot catch-up: firing Collected current hourly (${dueSlots.collectedCurrentHourly})`);
    devStatus('Data scheduler', true, `boot catch-up: Collected current hourly`);
    trackEvent('Scheduler.BootCatchUp.CollectedCurrentHourly.Started', { slotKey: dueSlots.collectedCurrentHourly });
    logProgress('syncCollectedTimeCurrentHourly',
      `Boot catch-up Collected current month due (${dueSlots.collectedCurrentHourly}) — ${monthStart} → ${monthEnd}`,
      { triggeredBy: 'scheduler-boot' }
    );
    await recordDedup('collected:current-hourly', dueSlots.collectedCurrentHourly, 'collectedCurrentHourlyLastSlot', DEDUP_TTL.hourly);
    runWithMutex(
      'bootCatchUpCollectedCurrentHourly', 'currentHourly', 'CollectedTime',
      `boot:${dueSlots.collectedCurrentHourly}`,
      () => syncCollectedTime({ startDate: monthStart, endDate: monthEnd, triggeredBy: 'scheduler-boot' }),
      'scheduler-boot', 'collected'
    );
  } else {
    trackEvent('Scheduler.BootCatchUp.CollectedCurrentHourly.Skipped', { slotKey: dueSlots.collectedCurrentHourly });
  }

  // ── WIP current month ──
  const wipCurrentDue = !(await isDedupHit('wip:current-hourly', dueSlots.wipCurrentHourly, 'wipCurrentHourlyLastSlot'));
  if (wipCurrentDue) {
    schedulerLogger.info(`Boot catch-up: firing WIP current hourly (${dueSlots.wipCurrentHourly})`);
    devStatus('Data scheduler', true, `boot catch-up: WIP current hourly`);
    trackEvent('Scheduler.BootCatchUp.WipCurrentHourly.Started', { slotKey: dueSlots.wipCurrentHourly });
    logProgress('syncWipCurrentHourly',
      `Boot catch-up WIP current month due (${dueSlots.wipCurrentHourly}) — ${monthStart} → ${monthEnd}`,
      { triggeredBy: 'scheduler-boot' }
    );
    await recordDedup('wip:current-hourly', dueSlots.wipCurrentHourly, 'wipCurrentHourlyLastSlot', DEDUP_TTL.hourly);
    runWithMutex(
      'bootCatchUpWipCurrentHourly', 'currentHourly', 'Wip',
      `boot:${dueSlots.wipCurrentHourly}`,
      () => syncWip({ startDate: monthStart, endDate: monthEnd, triggeredBy: 'scheduler-boot' }),
      'scheduler-boot', 'wip'
    );
  } else {
    trackEvent('Scheduler.BootCatchUp.WipCurrentHourly.Skipped', { slotKey: dueSlots.wipCurrentHourly });
  }

  // ── Collected previous month seal ──
  const collectedPreviousDue = dueSlots.collectedPreviousSeal
    && !(await isDedupHit('collected:previous-seal', dueSlots.collectedPreviousSeal, 'collectedPreviousSealLastSlot'));
  if (collectedPreviousDue) {
    schedulerLogger.info(`Boot catch-up: firing Collected previous seal (${dueSlots.collectedPreviousSeal})`);
    devStatus('Data scheduler', true, `boot catch-up: Collected previous seal`);
    trackEvent('Scheduler.BootCatchUp.CollectedPreviousSeal.Started', { slotKey: dueSlots.collectedPreviousSeal });
    logProgress('syncCollectedTimePreviousSeal',
      `Boot catch-up Collected previous-month seal due (${dueSlots.collectedPreviousSeal}) — ${previousMonthStart} → ${previousMonthEnd}`,
      { triggeredBy: 'scheduler-boot' }
    );
    await recordDedup('collected:previous-seal', dueSlots.collectedPreviousSeal, 'collectedPreviousSealLastSlot', DEDUP_TTL.previousSeal);
    runWithMutex(
      'bootCatchUpCollectedPreviousSeal', 'previousSeal', 'CollectedTime',
      `boot:${dueSlots.collectedPreviousSeal}`,
      () => syncCollectedTime({ startDate: previousMonthStart, endDate: previousMonthEnd, triggeredBy: 'scheduler-boot' }),
      'scheduler-boot', 'collected'
    );
  } else {
    trackEvent('Scheduler.BootCatchUp.CollectedPreviousSeal.Skipped', { slotKey: dueSlots.collectedPreviousSeal || 'none-due' });
  }

  // ── WIP previous month seal ──
  const wipPreviousDue = dueSlots.wipPreviousSeal
    && !(await isDedupHit('wip:previous-seal', dueSlots.wipPreviousSeal, 'wipPreviousSealLastSlot'));
  if (wipPreviousDue) {
    schedulerLogger.info(`Boot catch-up: firing WIP previous seal (${dueSlots.wipPreviousSeal})`);
    devStatus('Data scheduler', true, `boot catch-up: WIP previous seal`);
    trackEvent('Scheduler.BootCatchUp.WipPreviousSeal.Started', { slotKey: dueSlots.wipPreviousSeal });
    logProgress('syncWipPreviousSeal',
      `Boot catch-up WIP previous-month seal due (${dueSlots.wipPreviousSeal}) — ${previousMonthStart} → ${previousMonthEnd}`,
      { triggeredBy: 'scheduler-boot' }
    );
    await recordDedup('wip:previous-seal', dueSlots.wipPreviousSeal, 'wipPreviousSealLastSlot', DEDUP_TTL.previousSeal);
    runWithMutex(
      'bootCatchUpWipPreviousSeal', 'previousSeal', 'Wip',
      `boot:${dueSlots.wipPreviousSeal}`,
      () => syncWip({ startDate: previousMonthStart, endDate: previousMonthEnd, triggeredBy: 'scheduler-boot' }),
      'scheduler-boot', 'wip'
    );
  } else {
    trackEvent('Scheduler.BootCatchUp.WipPreviousSeal.Skipped', { slotKey: dueSlots.wipPreviousSeal || 'none-due' });
  }
}

/** Single scheduler tick — called every 30s (or 60s when idle). */
async function schedulerTick() {
  if (_shuttingDown) return;

  const now = getLondonNow();
  const minute = now.getMinutes();
  let firedThisTick = false;

  const monthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = formatDateKey(now);
  const previousMonthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousMonthEnd = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 0));

  // ═══════════════════════════════════════════════
  // COLLECTED — current month full re-clear at :05
  // ═══════════════════════════════════════════════
  if (minute === 5) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('collected:current-hourly', slotKey, 'collectedCurrentHourlyLastSlot'))) {
      await recordDedup('collected:current-hourly', slotKey, 'collectedCurrentHourlyLastSlot', DEDUP_TTL.hourly);
      firedThisTick = true;
      logProgress('syncCollectedTimeCurrentHourly',
        `Hourly Collected current month sync (${slotKey}) — ${monthStart} → ${monthEnd}`,
        { triggeredBy: 'scheduler' }
      );
      runWithMutex(
        'syncCollectedTimeCurrentHourly', 'currentHourly', 'CollectedTime', slotKey,
        () => syncCollectedTime({ startDate: monthStart, endDate: monthEnd, triggeredBy: 'scheduler' }),
        'scheduler', 'collected'
      );
    }
  }

  // ═══════════════════════════════════════════════
  // WIP — current month full re-clear at :20 (offset to avoid Clio rate clash)
  // ═══════════════════════════════════════════════
  if (minute === 20) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('wip:current-hourly', slotKey, 'wipCurrentHourlyLastSlot'))) {
      await recordDedup('wip:current-hourly', slotKey, 'wipCurrentHourlyLastSlot', DEDUP_TTL.hourly);
      firedThisTick = true;
      logProgress('syncWipCurrentHourly',
        `Hourly WIP current month sync (${slotKey}) — ${monthStart} → ${monthEnd}`,
        { triggeredBy: 'scheduler' }
      );
      runWithMutex(
        'syncWipCurrentHourly', 'currentHourly', 'Wip', slotKey,
        () => syncWip({ startDate: monthStart, endDate: monthEnd, triggeredBy: 'scheduler' }),
        'scheduler', 'wip'
      );
    }
  }

  // ═══════════════════════════════════════════════
  // COLLECTED — previous month seal slots at :33
  // ═══════════════════════════════════════════════
  if (isPreviousMonthSealSlot(now, 33)) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('collected:previous-seal', slotKey, 'collectedPreviousSealLastSlot'))) {
      await recordDedup('collected:previous-seal', slotKey, 'collectedPreviousSealLastSlot', DEDUP_TTL.previousSeal);
      firedThisTick = true;
      logProgress('syncCollectedTimePreviousSeal',
        `Collected previous-month seal (${slotKey}) — ${previousMonthStart} → ${previousMonthEnd}`,
        { triggeredBy: 'scheduler' }
      );
      runWithMutex(
        'syncCollectedTimePreviousSeal', 'previousSeal', 'CollectedTime', slotKey,
        () => syncCollectedTime({ startDate: previousMonthStart, endDate: previousMonthEnd, triggeredBy: 'scheduler' }),
        'scheduler', 'collected'
      );
    }
  }

  // ═══════════════════════════════════════════════
  // WIP — previous month seal slots at :50
  // ═══════════════════════════════════════════════
  if (isPreviousMonthSealSlot(now, 50)) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('wip:previous-seal', slotKey, 'wipPreviousSealLastSlot'))) {
      await recordDedup('wip:previous-seal', slotKey, 'wipPreviousSealLastSlot', DEDUP_TTL.previousSeal);
      firedThisTick = true;
      logProgress('syncWipPreviousSeal',
        `WIP previous-month seal (${slotKey}) — ${previousMonthStart} → ${previousMonthEnd}`,
        { triggeredBy: 'scheduler' }
      );
      runWithMutex(
        'syncWipPreviousSeal', 'previousSeal', 'Wip', slotKey,
        () => syncWip({ startDate: previousMonthStart, endDate: previousMonthEnd, triggeredBy: 'scheduler' }),
        'scheduler', 'wip'
      );
    }
  }

  // ── Adaptive polling ──
  if (firedThisTick) {
    _idleStreak = 0;
    if (_currentTickMs !== BASE_TICK_MS) rebuildTickInterval(BASE_TICK_MS);
  } else {
    _idleStreak++;
    if (_idleStreak >= BACKOFF_THRESHOLD && _currentTickMs !== BACKOFF_TICK_MS) {
      rebuildTickInterval(BACKOFF_TICK_MS);
    }
  }
}

/** Full scheduler + mutex state for ops-pulse dashboard */
function getSchedulerState() {
  const now = getLondonNow();
  const hour = now.getHours();
  const minute = now.getMinutes();

  function minsUntil(targetMin, hourInterval) {
    const nowMins = hour * 60 + minute;
    if (hourInterval) {
      for (let h = hour; h < hour + 24; h++) {
        const candidate = (h % 24) * 60 + targetMin;
        const adjustedCandidate = candidate >= nowMins ? candidate : candidate + 24 * 60;
        if ((h % 24) % hourInterval === 0 && adjustedCandidate > nowMins) {
          return adjustedCandidate - nowMins;
        }
      }
    }
    const minsLeft = targetMin - minute;
    return minsLeft > 0 ? minsLeft : 60 + minsLeft;
  }

  return {
    shuttingDown: _shuttingDown,
    tickIntervalMs: _currentTickMs,
    idleStreak: _idleStreak,
    tiers: _tierState,
    mutex: getMutexState(),
    nextFires: {
      collectedCurrentHourly:  { minsUntil: minsUntil(5),  schedule: ':05 current month' },
      wipCurrentHourly:        { minsUntil: minsUntil(20), schedule: ':20 current month' },
      collectedPreviousSeal:   { minsUntil: null, schedule: 'day 1 at 03:33/12:33/23:33, days 2-14 at 02:33, day 21 at 02:33, last day at 23:33' },
      wipPreviousSeal:         { minsUntil: null, schedule: 'day 1 at 03:50/12:50/23:50, days 2-14 at 02:50, day 21 at 02:50, last day at 23:50' },
    },
  };
}

module.exports = {
  startDataOperationsScheduler,
  stopScheduler,
  getSchedulerState,
};
