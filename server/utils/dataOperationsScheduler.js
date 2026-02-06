const { syncCollectedTime, logProgress } = require('../routes/dataOperations');
const { createLogger } = require('./logger');

const schedulerLogger = createLogger('DataOpsScheduler');

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

function startDataOperationsScheduler() {
  if (process.env.DATAOPS_SCHEDULER_ENABLED !== 'true') {
    schedulerLogger.warn('Scheduler disabled (set DATAOPS_SCHEDULER_ENABLED=true to enable)');
    return;
  }

  const state = {
    dailyLastSlot: null,
    rollingLastDate: null,
    dailyRunning: false,
    rollingRunning: false,
  };

  schedulerLogger.info('Data operations scheduler started (Europe/London)');

  setInterval(async () => {
    const now = getLondonNow();
    const minute = now.getMinutes();
    const hour = now.getHours();

    // 30-minute daily fill (today only)
    // Offset by 3 minutes to avoid collision with legacy Azure Functions (run at :03 and :33)
    if (minute % 30 === 3) {
      const slotKey = formatSlotKey(now);
      if (!state.dailyRunning && state.dailyLastSlot !== slotKey) {
        state.dailyRunning = true;
        state.dailyLastSlot = slotKey;
        logProgress('syncCollectedTimeDaily', `Scheduler triggered (${slotKey})`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ daysBack: 0, triggeredBy: 'scheduler' });
        } catch (error) {
          schedulerLogger.error('Daily collected time sync failed', error?.message || error);
        } finally {
          state.dailyRunning = false;
        }
      }
    }

    // 11pm rolling 7-day reset
    // Offset by 3 minutes (run at 23:03)
    if (hour === 23 && minute === 3) {
      const dateKey = formatDateKey(now);
      if (!state.rollingRunning && state.rollingLastDate !== dateKey) {
        state.rollingRunning = true;
        state.rollingLastDate = dateKey;
        logProgress('syncCollectedTimeRolling7d', `Scheduler triggered (${dateKey} 23:00)`, { triggeredBy: 'scheduler' });
        try {
          await syncCollectedTime({ daysBack: 7, triggeredBy: 'scheduler' });
        } catch (error) {
          schedulerLogger.error('Rolling 7-day collected time sync failed', error?.message || error);
        } finally {
          state.rollingRunning = false;
        }
      }
    }
  }, 30 * 1000);
}

module.exports = {
  startDataOperationsScheduler,
};
