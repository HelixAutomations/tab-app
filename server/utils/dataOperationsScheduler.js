const { syncCollectedTime, syncWip, logProgress } = require('../routes/dataOperations');
const { createLogger } = require('./logger');
const { trackEvent, trackException } = require('./appInsights');

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

/**
 * Overlapping-window scheduler for collected time AND WIP.
 *
 * Tier     | Frequency              | Window                   | Purpose
 * ---------|------------------------|--------------------------|------------------------------------------
 * Hot      | Every 60 min at :03    | Today+yesterday          | Catches entries finalised after last run
 * Warm     | Every 6h (00/06/12/18) | Rolling 3 days           | Catches delayed Clio report appearances
 * Cold     | Nightly at 23:03       | Full current month (1st→today) | Reconciles entire month, catches backdated entries & purges duplicates
 * Monthly  | 2nd of month at 02:03  | Full previous month      | Post-close reconciliation of last month
 *
 * ~29 API calls/day per operation (24 hot + 4 warm + 1 cold) + 1 monthly.
 * Each tier has its own running guard + last-slot dedup.
 * WIP runs at :20 offset to avoid overlapping Clio API calls with collected.
 * WIP windows are wider than collected to catch delayed backfills in recent history.
 */
function startDataOperationsScheduler() {
  const state = {
    // Collected
    hotLastSlot: null,
    hotRunning: false,
    warmLastSlot: null,
    warmRunning: false,
    coldLastDate: null,
    coldRunning: false,
    monthlyLastDate: null,
    monthlyRunning: false,
    // WIP
    wipHotLastSlot: null,
    wipHotRunning: false,
    wipWarmLastSlot: null,
    wipWarmRunning: false,
    wipColdLastDate: null,
    wipColdRunning: false,
  };

  schedulerLogger.info('Data operations scheduler started — Hot/Warm/Cold tiers for Collected + WIP (Europe/London)');
  trackEvent('Scheduler.Started', { tiers: 'Hot/Warm/Cold', operations: 'CollectedTime,Wip' });

  setInterval(async () => {
    const now = getLondonNow();
    const minute = now.getMinutes();
    const hour = now.getHours();

    // ═══════════════════════════════════════════════
    // COLLECTED TIME — runs at :03
    // ═══════════════════════════════════════════════

    // ─── HOT: every 60 min at :03 — today + yesterday ───
    if (minute === 3) {
      const slotKey = formatSlotKey(now);
      if (!state.hotRunning && state.hotLastSlot !== slotKey) {
        state.hotRunning = true;
        state.hotLastSlot = slotKey;
        const opName = 'syncCollectedTimeHot';
        logProgress(opName, `Hot sync triggered (${slotKey}) — today+yesterday`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ daysBack: 1, triggeredBy: 'scheduler' });
          schedulerLogger.info(`Collected hot sync completed (${slotKey})`);
          trackEvent('Scheduler.Collected.Hot.Completed', { slotKey });
        } catch (error) {
          schedulerLogger.error('Collected hot sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'hot', entity: 'CollectedTime', slotKey });
          trackEvent('Scheduler.Collected.Hot.Failed', { slotKey, error: error?.message || String(error) });
        } finally {
          state.hotRunning = false;
        }
      }
    }

    // ─── WARM: every 6h at :03 (00:03, 06:03, 12:03, 18:03) — rolling 3 days ───
    if (hour % 6 === 0 && minute === 3) {
      const slotKey = formatSlotKey(now);
      if (!state.warmRunning && state.warmLastSlot !== slotKey) {
        state.warmRunning = true;
        state.warmLastSlot = slotKey;
        const opName = 'syncCollectedTimeWarm';
        logProgress(opName, `Warm sync triggered (${slotKey}) — rolling 3 days`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ daysBack: 3, triggeredBy: 'scheduler' });
          schedulerLogger.info(`Collected warm sync completed (${slotKey})`);
          trackEvent('Scheduler.Collected.Warm.Completed', { slotKey });
        } catch (error) {
          schedulerLogger.error('Collected warm sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'warm', entity: 'CollectedTime', slotKey });
          trackEvent('Scheduler.Collected.Warm.Failed', { slotKey, error: error?.message || String(error) });
        } finally {
          state.warmRunning = false;
        }
      }
    }

    // ─── COLD: nightly at 23:03 — full current month (1st → today) ───
    if (hour === 23 && minute === 3) {
      const dateKey = formatDateKey(now);
      if (!state.coldRunning && state.coldLastDate !== dateKey) {
        state.coldRunning = true;
        state.coldLastDate = dateKey;

        // Full current month: 1st of month → today
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const startDate = formatDateKey(monthStart);
        const endDate = formatDateKey(now);

        const opName = 'syncCollectedTimeCold';
        logProgress(opName, `Cold sync triggered (${dateKey} 23:03) — full month ${startDate} → ${endDate}`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ startDate, endDate, triggeredBy: 'scheduler' });
          schedulerLogger.info(`Collected cold sync completed (${dateKey}): ${startDate} → ${endDate}`);
          trackEvent('Scheduler.Collected.Cold.Completed', { dateKey, startDate, endDate });
        } catch (error) {
          schedulerLogger.error('Collected cold sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'cold', entity: 'CollectedTime', dateKey });
          trackEvent('Scheduler.Collected.Cold.Failed', { dateKey, error: error?.message || String(error) });
        } finally {
          state.coldRunning = false;
        }
      }
    }

    // ─── MONTHLY: 2nd of month at 02:03 — full previous month ───
    if (now.getDate() === 2 && hour === 2 && minute === 3) {
      const dateKey = formatDateKey(now);
      if (!state.monthlyRunning && state.monthlyLastDate !== dateKey) {
        state.monthlyRunning = true;
        state.monthlyLastDate = dateKey;

        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
        const startDate = formatDateKey(prevMonthStart);
        const endDate = formatDateKey(prevMonthEnd);

        const opName = 'syncCollectedTimeMonthly';
        logProgress(opName, `Monthly sweep triggered (${dateKey} 02:03) — previous month ${startDate} → ${endDate}`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ startDate, endDate, triggeredBy: 'scheduler' });
          schedulerLogger.info(`Collected monthly sweep completed (${dateKey}): ${startDate} → ${endDate}`);
          trackEvent('Scheduler.Collected.Monthly.Completed', { dateKey, startDate, endDate });
        } catch (error) {
          schedulerLogger.error('Collected monthly sweep failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'monthly', entity: 'CollectedTime', dateKey });
          trackEvent('Scheduler.Collected.Monthly.Failed', { dateKey, error: error?.message || String(error) });
        } finally {
          state.monthlyRunning = false;
        }
      }
    }

    // ═══════════════════════════════════════════════
    // WIP — runs at :20 (17 min offset from collected)
    // ═══════════════════════════════════════════════

    // ─── HOT: every 60 min at :20 — rolling recent history ───
    if (minute === 20) {
      const slotKey = formatSlotKey(now);
      if (!state.wipHotRunning && state.wipHotLastSlot !== slotKey) {
        state.wipHotRunning = true;
        state.wipHotLastSlot = slotKey;
        const opName = 'syncWipHot';
        logProgress(opName, `WIP hot sync triggered (${slotKey}) — rolling ${WIP_HOT_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        try {
          await syncWip({ daysBack: WIP_HOT_DAYS_BACK, triggeredBy: 'scheduler' });
          schedulerLogger.info(`WIP hot sync completed (${slotKey})`);
          trackEvent('Scheduler.Wip.Hot.Completed', { slotKey });
        } catch (error) {
          schedulerLogger.error('WIP hot sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'hot', entity: 'Wip', slotKey });
          trackEvent('Scheduler.Wip.Hot.Failed', { slotKey, error: error?.message || String(error) });
        } finally {
          state.wipHotRunning = false;
        }
      }
    }

    // ─── WARM: every 6h at :20 (00:20, 06:20, 12:20, 18:20) — rolling medium history ───
    if (hour % 6 === 0 && minute === 20) {
      const slotKey = formatSlotKey(now);
      if (!state.wipWarmRunning && state.wipWarmLastSlot !== slotKey) {
        state.wipWarmRunning = true;
        state.wipWarmLastSlot = slotKey;
        const opName = 'syncWipWarm';
        logProgress(opName, `WIP warm sync triggered (${slotKey}) — rolling ${WIP_WARM_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        try {
          await syncWip({ daysBack: WIP_WARM_DAYS_BACK, triggeredBy: 'scheduler' });
          schedulerLogger.info(`WIP warm sync completed (${slotKey})`);
          trackEvent('Scheduler.Wip.Warm.Completed', { slotKey });
        } catch (error) {
          schedulerLogger.error('WIP warm sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'warm', entity: 'Wip', slotKey });
          trackEvent('Scheduler.Wip.Warm.Failed', { slotKey, error: error?.message || String(error) });
        } finally {
          state.wipWarmRunning = false;
        }
      }
    }

    // ─── COLD: nightly at 23:20 — rolling deeper history ───
    if (hour === 23 && minute === 20) {
      const dateKey = formatDateKey(now);
      if (!state.wipColdRunning && state.wipColdLastDate !== dateKey) {
        state.wipColdRunning = true;
        state.wipColdLastDate = dateKey;
        const opName = 'syncWipCold';
        logProgress(opName, `WIP cold sync triggered (${dateKey} 23:20) — rolling ${WIP_COLD_DAYS_BACK} days`, { triggeredBy: 'scheduler' });
        try {
          await syncWip({ daysBack: WIP_COLD_DAYS_BACK, triggeredBy: 'scheduler' });
          schedulerLogger.info(`WIP cold sync completed (${dateKey})`);
          trackEvent('Scheduler.Wip.Cold.Completed', { dateKey });
        } catch (error) {
          schedulerLogger.error('WIP cold sync failed:', error?.message || error);
          trackException(error instanceof Error ? error : new Error(String(error?.message || error)), { tier: 'cold', entity: 'Wip', dateKey });
          trackEvent('Scheduler.Wip.Cold.Failed', { dateKey, error: error?.message || String(error) });
        } finally {
          state.wipColdRunning = false;
        }
      }
    }
  }, 30 * 1000);
}

module.exports = {
  startDataOperationsScheduler,
};
