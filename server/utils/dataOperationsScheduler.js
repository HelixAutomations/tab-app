const { syncCollectedTime, syncWip, logProgress } = require('../routes/dataOperations');
const { createLogger } = require('./logger');
const { trackEvent, trackException } = require('./appInsights');
const { acquire, getState: getMutexState } = require('./syncMutex');

const schedulerLogger = createLogger('DataOpsScheduler');

const WIP_HOT_DAYS_BACK = 7;
const WIP_WARM_DAYS_BACK = 21;
const WIP_COLD_DAYS_BACK = 56;

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
 */
function startDataOperationsScheduler() {
  const dedup = {
    hotLastSlot: null,
    warmLastSlot: null,
    coldLastDate: null,
    monthlyLastDate: null,
    wipHotLastSlot: null,
    wipWarmLastSlot: null,
    wipColdLastDate: null,
  };

  schedulerLogger.info('Data operations scheduler started — Hot/Warm/Cold tiers + sync mutex (Europe/London)');
  trackEvent('Scheduler.Started', { tiers: 'Hot/Warm/Cold', operations: 'CollectedTime,Wip', mutex: true });

  /** Wrap a sync op with the global mutex + telemetry */
  async function runWithMutex(opName, tier, entity, slotKey, fn) {
    recordTier(entity === 'CollectedTime' ? 'collected' : 'wip', tier, 'queued', slotKey);
    const release = await acquire(opName);
    recordTier(entity === 'CollectedTime' ? 'collected' : 'wip', tier, 'running', slotKey);
    try {
      await fn();
      schedulerLogger.info(`${opName} completed (${slotKey})`);
      trackEvent(`Scheduler.${entity}.${tier.charAt(0).toUpperCase() + tier.slice(1)}.Completed`, { slotKey });
      recordTier(entity === 'CollectedTime' ? 'collected' : 'wip', tier, 'completed', slotKey);
    } catch (error) {
      schedulerLogger.error(`${opName} failed:`, error?.message || error);
      trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier, entity, slotKey });
      trackEvent(`Scheduler.${entity}.${tier.charAt(0).toUpperCase() + tier.slice(1)}.Failed`, { slotKey, error: error?.message || String(error) });
      recordTier(entity === 'CollectedTime' ? 'collected' : 'wip', tier, 'failed', slotKey, { error: error?.message });
    } finally {
      release();
    }
  }

  setInterval(async () => {
    const now = getLondonNow();
    const minute = now.getMinutes();
    const hour = now.getHours();

    // ═══════════════════════════════════════════════
    // COLLECTED TIME
    // ═══════════════════════════════════════════════

    // ─── HOT: every 60 min at :03 — today + yesterday ───
    if (minute === 3) {
      const slotKey = formatSlotKey(now);
      if (dedup.hotLastSlot !== slotKey) {
        dedup.hotLastSlot = slotKey;
        logProgress('syncCollectedTimeHot', `Hot sync triggered (${slotKey}) — today+yesterday`, { triggeredBy: 'scheduler' });
        runWithMutex('syncCollectedTimeHot', 'hot', 'CollectedTime', slotKey, () =>
          syncCollectedTime({ daysBack: 1, triggeredBy: 'scheduler' })
        );
      }
    }

    // ─── WARM: every 6h at :08 (00:08, 06:08, 12:08, 18:08) — rolling 3 days ───
    if (hour % 6 === 0 && minute === 8) {
      const slotKey = formatSlotKey(now);
      if (dedup.warmLastSlot !== slotKey) {
        dedup.warmLastSlot = slotKey;
        logProgress('syncCollectedTimeWarm', `Warm sync triggered (${slotKey}) — rolling 3 days`, { triggeredBy: 'scheduler' });
        runWithMutex('syncCollectedTimeWarm', 'warm', 'CollectedTime', slotKey, () =>
          syncCollectedTime({ daysBack: 3, triggeredBy: 'scheduler' })
        );
      }
    }

    // ─── COLD: nightly at 23:03 — full current month (1st → today) ───
    if (hour === 23 && minute === 3) {
      const dateKey = formatDateKey(now);
      if (dedup.coldLastDate !== dateKey) {
        dedup.coldLastDate = dateKey;
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
      if (dedup.monthlyLastDate !== dateKey) {
        dedup.monthlyLastDate = dateKey;
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
      if (dedup.wipHotLastSlot !== slotKey) {
        dedup.wipHotLastSlot = slotKey;
        logProgress('syncWipHot', `WIP hot sync triggered (${slotKey}) — rolling ${WIP_HOT_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        runWithMutex('syncWipHot', 'hot', 'Wip', slotKey, () =>
          syncWip({ daysBack: WIP_HOT_DAYS_BACK, triggeredBy: 'scheduler' })
        );
      }
    }

    // ─── WARM: every 6h at :25 (00:25, 06:25, 12:25, 18:25) — rolling medium history ───
    if (hour % 6 === 0 && minute === 25) {
      const slotKey = formatSlotKey(now);
      if (dedup.wipWarmLastSlot !== slotKey) {
        dedup.wipWarmLastSlot = slotKey;
        logProgress('syncWipWarm', `WIP warm sync triggered (${slotKey}) — rolling ${WIP_WARM_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        runWithMutex('syncWipWarm', 'warm', 'Wip', slotKey, () =>
          syncWip({ daysBack: WIP_WARM_DAYS_BACK, triggeredBy: 'scheduler' })
        );
      }
    }

    // ─── COLD: nightly at 23:20 — rolling deeper history ───
    if (hour === 23 && minute === 20) {
      const dateKey = formatDateKey(now);
      if (dedup.wipColdLastDate !== dateKey) {
        dedup.wipColdLastDate = dateKey;
        logProgress('syncWipCold', `WIP cold sync triggered (${dateKey} 23:20) — rolling ${WIP_COLD_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        runWithMutex('syncWipCold', 'cold', 'Wip', dateKey, () =>
          syncWip({ daysBack: WIP_COLD_DAYS_BACK, triggeredBy: 'scheduler' })
        );
      }
    }
  }, 30 * 1000);
}

/** Full scheduler + mutex state for ops-pulse dashboard */
function getSchedulerState() {
  const now = getLondonNow();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Calculate next scheduled fire time for each tier
  function minsUntil(targetMin, hourInterval) {
    const nowMins = hour * 60 + minute;
    if (hourInterval) {
      // Find next hour that matches interval, at targetMin past
      for (let h = hour; h < hour + 24; h++) {
        const candidate = (h % 24) * 60 + targetMin;
        const adjustedCandidate = candidate >= nowMins ? candidate : candidate + 24 * 60;
        if ((h % 24) % hourInterval === 0 && adjustedCandidate > nowMins) {
          return adjustedCandidate - nowMins;
        }
      }
    }
    // Simple: next occurrence of targetMin past any hour
    const minsLeft = targetMin - minute;
    return minsLeft > 0 ? minsLeft : 60 + minsLeft;
  }

  return {
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
  getSchedulerState,
};
