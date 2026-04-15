const { syncCollectedTime, syncWip, logProgress } = require('../routes/dataOperations');
const { createLogger } = require('./logger');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { acquire, getState: getMutexState } = require('./syncMutex');
const { getCache, setCache } = require('./redisClient');
const { status: devStatus } = require('./devConsole');
const { notify } = require('./hubNotifier');

const schedulerLogger = createLogger('DataOpsScheduler');

// ── Constants ────────────────────────────────────────────────────────
const WIP_HOT_DAYS_BACK = 7;
const WIP_WARM_DAYS_BACK = 21;
const WIP_COLD_DAYS_BACK = 56;

const SYNC_TIMEOUT_MS = 10 * 60 * 1000;        // 10 min — Cold syncs can take up to 8 min
const BOOT_CATCHUP_DELAY_MS = 30 * 1000;        // 30s after start — let connections warm up
const BOOT_CATCHUP_REDIS_TTL = 65 * 60;         // 65 min — slightly longer than Hot interval

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
  return new Date(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }));
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

// ── Scheduler state — exposed via getSchedulerState() for ops-pulse ──
const _tierState = {
  collected: { hot: null, warm: null, cold: null, monthly: null },
  wip:       { hot: null, warm: null, cold: null },
};

function recordTier(op, tier, status, slotKey, extra) {
  _tierState[op][tier] = { status, slotKey, ts: Date.now(), ...extra };
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
  hotLastSlot: null, warmLastSlot: null, coldLastDate: null, monthlyLastDate: null,
  wipHotLastSlot: null, wipWarmLastSlot: null, wipColdLastDate: null,
};

/** Check if a tier already fired for the given slot. Redis first, memory fallback. */
async function isDedupHit(dedupKey, slotKey, memField) {
  try {
    const cached = await getCache(`dataops:dedup:${dedupKey}`);
    if (cached?.data === slotKey) return true;
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
  hot:     65 * 60,       // 65 min
  warm:    6 * 60 * 60 + 5 * 60,  // 6h 5min
  cold:    24 * 60 * 60 + 5 * 60, // 24h 5min
  monthly: 31 * 24 * 60 * 60,     // 31 days
};

/**
 * Overlapping-window scheduler for collected time AND WIP.
 *
 * Tier       | Collected          | WIP
 * -----------|--------------------|-----------------------
 * Hot        | Every 60 min at :03| Every 60 min at :20
 * Warm       | Every 6h at :08    | Every 6h at :25
 * Cold       | Nightly at 23:03   | Nightly at 23:20
 * Monthly    | 2nd of month 02:03 | —
 *
 * Warm is staggered 5 min after Hot to let Hot finish first.
 * All tiers acquire the global sync mutex — only ONE sync runs at a time.
 * ~29 API calls/day per operation (24 hot + 4 warm + 1 cold) + 1 monthly.
 *
 * Hardened features (Apr 2026):
 * - Boot catch-up: Hot syncs fire 30s after server start (Redis-deduped)
 * - Operation timeout: 10 min limit prevents stuck Clio polls from blocking queue
 * - Graceful shutdown: stopScheduler() drains before exit
 * - Adaptive polling: backs off to 60s when idle, snaps back near tier windows
 * - Redis dedup: survives restarts (in-memory fallback if Redis down)
 * - Duration metrics: trackMetric for all tier completions
 */
function startDataOperationsScheduler() {
  _shuttingDown = false;
  _idleStreak = 0;
  _currentTickMs = BASE_TICK_MS;

  schedulerLogger.info('Data operations scheduler started — Hot/Warm/Cold tiers + sync mutex (Europe/London)');
  devStatus('Data scheduler', true, 'started — Hot/Warm/Cold tiers (Europe/London)');
  trackEvent('Scheduler.Started', {
    tiers: 'Hot/Warm/Cold',
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
    // ── Boot catch-up: fire Hot syncs after warmup delay ──
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

/** Wrap a sync op with the global mutex + timeout + telemetry + duration metric */
async function runWithMutex(opName, tier, entity, slotKey, fn) {
  if (_shuttingDown) return;

  const opKey = entity === 'CollectedTime' ? 'collected' : 'wip';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  recordTier(opKey, tier, 'queued', slotKey);

  const release = await acquire(opName);
  if (_shuttingDown) { release(); return; }

  recordTier(opKey, tier, 'running', slotKey);
  devStatus('Data scheduler', true, `${entity} ${tier} running (${slotKey})`);
  const startMs = Date.now();

  try {
    // Race fn() against timeout to prevent indefinite mutex hold
    await Promise.race([
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
    devStatus('Data scheduler', true, `${entity} ${tier} done (${(durationMs / 1000).toFixed(1)}s)`);
    notify('sync.completed', { entity, tier, durationMs: String(durationMs), triggeredBy: 'scheduler' });
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
    devStatus('Data scheduler', false, `${entity} ${tier} ${status} (${(durationMs / 1000).toFixed(1)}s)`);
  } finally {
    release();
  }
}

/**
 * Boot catch-up: run Hot syncs for both collected + WIP immediately after
 * server start. Redis key prevents re-firing if a sync completed recently
 * (e.g. server restarted 10 min after last Hot sync).
 */
async function runBootCatchUp() {
  if (_shuttingDown) return;

  const slotKey = formatSlotKey(getLondonNow());
  schedulerLogger.info(`Boot catch-up check (${slotKey})`);

  // Collected Hot
  const collectedRecent = await isDedupHit('collected:hot', null, '__skip__');
  if (!collectedRecent) {
    schedulerLogger.info('Boot catch-up: firing Collected Hot sync');
    devStatus('Data scheduler', true, 'boot catch-up: Collected Hot');
    trackEvent('Scheduler.BootCatchUp.CollectedHot.Started', { slotKey });
    await recordDedup('collected:hot', slotKey, 'hotLastSlot', DEDUP_TTL.hot);
    runWithMutex('bootCatchUpCollectedHot', 'hot', 'CollectedTime', `boot:${slotKey}`, () =>
      syncCollectedTime({ daysBack: 1, triggeredBy: 'scheduler-boot' })
    );
  } else {
    schedulerLogger.info('Boot catch-up: Collected Hot skipped (recent sync exists in Redis)');
    trackEvent('Scheduler.BootCatchUp.CollectedHot.Skipped', { slotKey });
  }

  // WIP Hot
  const wipRecent = await isDedupHit('wip:hot', null, '__skip__');
  if (!wipRecent) {
    schedulerLogger.info('Boot catch-up: firing WIP Hot sync');
    devStatus('Data scheduler', true, 'boot catch-up: WIP Hot');
    trackEvent('Scheduler.BootCatchUp.WipHot.Started', { slotKey });
    await recordDedup('wip:hot', slotKey, 'wipHotLastSlot', DEDUP_TTL.hot);
    runWithMutex('bootCatchUpWipHot', 'hot', 'Wip', `boot:${slotKey}`, () =>
      syncWip({ daysBack: WIP_HOT_DAYS_BACK, triggeredBy: 'scheduler-boot' })
    );
  } else {
    schedulerLogger.info('Boot catch-up: WIP Hot skipped (recent sync exists in Redis)');
    trackEvent('Scheduler.BootCatchUp.WipHot.Skipped', { slotKey });
  }
}

/** Single scheduler tick — called every 30s (or 60s when idle). */
async function schedulerTick() {
  if (_shuttingDown) return;

  const now = getLondonNow();
  const minute = now.getMinutes();
  const hour = now.getHours();
  let firedThisTick = false;

  // ═══════════════════════════════════════════════
  // COLLECTED TIME
  // ═══════════════════════════════════════════════

  // ─── HOT: every 60 min at :03 — today + yesterday ───
  if (minute === 3) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('collected:hot', slotKey, 'hotLastSlot'))) {
      await recordDedup('collected:hot', slotKey, 'hotLastSlot', DEDUP_TTL.hot);
      firedThisTick = true;
      logProgress('syncCollectedTimeHot', `Hot sync triggered (${slotKey}) — today+yesterday`, { triggeredBy: 'scheduler' });
      runWithMutex('syncCollectedTimeHot', 'hot', 'CollectedTime', slotKey, () =>
        syncCollectedTime({ daysBack: 1, triggeredBy: 'scheduler' })
      );
    }
  }

  // ─── WARM: every 6h at :08 (00:08, 06:08, 12:08, 18:08) — rolling 3 days ───
  if (hour % 6 === 0 && minute === 8) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('collected:warm', slotKey, 'warmLastSlot'))) {
      await recordDedup('collected:warm', slotKey, 'warmLastSlot', DEDUP_TTL.warm);
      firedThisTick = true;
      logProgress('syncCollectedTimeWarm', `Warm sync triggered (${slotKey}) — rolling 3 days`, { triggeredBy: 'scheduler' });
      runWithMutex('syncCollectedTimeWarm', 'warm', 'CollectedTime', slotKey, () =>
        syncCollectedTime({ daysBack: 3, triggeredBy: 'scheduler' })
      );
    }
  }

  // ─── COLD: nightly at 23:03 — full current month (1st → today) ───
  if (hour === 23 && minute === 3) {
    const dateKey = formatDateKey(now);
    if (!(await isDedupHit('collected:cold', dateKey, 'coldLastDate'))) {
      await recordDedup('collected:cold', dateKey, 'coldLastDate', DEDUP_TTL.cold);
      firedThisTick = true;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = formatDateKey(monthStart);
      const endDate = formatDateKey(now);
      logProgress('syncCollectedTimeCold', `Cold sync triggered (${dateKey} 23:03) — full month ${startDate} → ${endDate}`, { triggeredBy: 'scheduler' });
      runWithMutex('syncCollectedTimeCold', 'cold', 'CollectedTime', dateKey, () =>
        syncCollectedTime({ startDate, endDate, triggeredBy: 'scheduler' })
      );
    }
  }

  // ─── MONTHLY: 2nd of month at 02:03 — full previous month ───
  if (now.getDate() === 2 && hour === 2 && minute === 3) {
    const dateKey = formatDateKey(now);
    if (!(await isDedupHit('collected:monthly', dateKey, 'monthlyLastDate'))) {
      await recordDedup('collected:monthly', dateKey, 'monthlyLastDate', DEDUP_TTL.monthly);
      firedThisTick = true;
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const startDate = formatDateKey(prevMonthStart);
      const endDate = formatDateKey(prevMonthEnd);
      logProgress('syncCollectedTimeMonthly', `Monthly sweep triggered (${dateKey} 02:03) — previous month ${startDate} → ${endDate}`, { triggeredBy: 'scheduler' });
      runWithMutex('syncCollectedTimeMonthly', 'monthly', 'CollectedTime', dateKey, () =>
        syncCollectedTime({ startDate, endDate, triggeredBy: 'scheduler' })
      );
    }
  }

  // ═══════════════════════════════════════════════
  // WIP — offset from collected
  // ═══════════════════════════════════════════════

  // ─── HOT: every 60 min at :20 — rolling recent history ───
  if (minute === 20) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('wip:hot', slotKey, 'wipHotLastSlot'))) {
      await recordDedup('wip:hot', slotKey, 'wipHotLastSlot', DEDUP_TTL.hot);
      firedThisTick = true;
      logProgress('syncWipHot', `WIP hot sync triggered (${slotKey}) — rolling ${WIP_HOT_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
      runWithMutex('syncWipHot', 'hot', 'Wip', slotKey, () =>
        syncWip({ daysBack: WIP_HOT_DAYS_BACK, triggeredBy: 'scheduler' })
      );
    }
  }

  // ─── WARM: every 6h at :25 (00:25, 06:25, 12:25, 18:25) — rolling medium history ───
  if (hour % 6 === 0 && minute === 25) {
    const slotKey = formatSlotKey(now);
    if (!(await isDedupHit('wip:warm', slotKey, 'wipWarmLastSlot'))) {
      await recordDedup('wip:warm', slotKey, 'wipWarmLastSlot', DEDUP_TTL.warm);
      firedThisTick = true;
      logProgress('syncWipWarm', `WIP warm sync triggered (${slotKey}) — rolling ${WIP_WARM_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
      runWithMutex('syncWipWarm', 'warm', 'Wip', slotKey, () =>
        syncWip({ daysBack: WIP_WARM_DAYS_BACK, triggeredBy: 'scheduler' })
      );
    }
  }

  // ─── COLD: nightly at 23:20 — rolling deeper history ───
  if (hour === 23 && minute === 20) {
    const dateKey = formatDateKey(now);
    if (!(await isDedupHit('wip:cold', dateKey, 'wipColdLastDate'))) {
      await recordDedup('wip:cold', dateKey, 'wipColdLastDate', DEDUP_TTL.cold);
      firedThisTick = true;
      logProgress('syncWipCold', `WIP cold sync triggered (${dateKey} 23:20) — rolling ${WIP_COLD_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
      runWithMutex('syncWipCold', 'cold', 'Wip', dateKey, () =>
        syncWip({ daysBack: WIP_COLD_DAYS_BACK, triggeredBy: 'scheduler' })
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
      collectedHot:  { minsUntil: minsUntil(3), schedule: ':03 (1h)' },
      collectedWarm: { minsUntil: minsUntil(8, 6), schedule: ':08 (6h)' },
      collectedCold: { minsUntil: hour < 23 ? (23 - hour) * 60 + (3 - minute) : (3 - minute > 0 ? 3 - minute : 60), schedule: '23:03' },
      wipHot:        { minsUntil: minsUntil(20), schedule: ':20 (1h)' },
      wipWarm:       { minsUntil: minsUntil(25, 6), schedule: ':25 (6h)' },
      wipCold:       { minsUntil: hour < 23 ? (23 - hour) * 60 + (20 - minute) : (20 - minute > 0 ? 20 - minute : 60), schedule: '23:20' },
    },
  };
}

module.exports = {
  startDataOperationsScheduler,
  stopScheduler,
  getSchedulerState,
};
