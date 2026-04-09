/**
 * Lightweight user-action logger.
 *
 * Prints timestamped, styled breadcrumbs to the browser console so the team
 * can see exactly what the app is doing and when — without adding network
 * overhead (no fetch calls, no telemetry posts).
 *
 * Usage:
 *   actionLog('Tab → Enquiries');
 *   actionLog.start('Instructions fetch');   // begins a timed span
 *   actionLog.end('Instructions fetch');     // closes it with duration
 *   actionLog.warn('Matters hydration took 4.2 s');
 */

const GREY = 'color:#888;font-weight:normal';
const BOLD = 'color:#3690CE;font-weight:bold';
const WARN_STYLE = 'color:#FF8C00;font-weight:bold';
const DIM = 'color:#666;font-weight:normal;font-size:11px';

const timers = new Map<string, number>();

function ts(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Log a user-visible action label. */
function actionLog(label: string, detail?: string): void {
  if (detail) {
    console.log(`%c[${ts()}] %c${label} %c${detail}`, GREY, BOLD, DIM);
  } else {
    console.log(`%c[${ts()}] %c${label}`, GREY, BOLD);
  }
}

/** Start a timed span — pairs with `actionLog.end(label)`. */
actionLog.start = (label: string, detail?: string): void => {
  timers.set(label, performance.now());
  if (detail) {
    console.log(`%c[${ts()}] %c⏳ ${label} %c${detail}`, GREY, BOLD, DIM);
  } else {
    console.log(`%c[${ts()}] %c⏳ ${label}`, GREY, BOLD);
  }
};

/** End a timed span and print duration. */
actionLog.end = (label: string, detail?: string): void => {
  const started = timers.get(label);
  timers.delete(label);
  const ms = started != null ? Math.round(performance.now() - started) : null;
  const suffix = ms != null ? `(${ms} ms)` : '';
  const style = ms != null && ms > 2000 ? WARN_STYLE : BOLD;
  if (detail) {
    console.log(`%c[${ts()}] %c✓ ${label} ${suffix} %c${detail}`, GREY, style, DIM);
  } else {
    console.log(`%c[${ts()}] %c✓ ${label} ${suffix}`, GREY, style);
  }
};

/** Log a warning-level action. */
actionLog.warn = (label: string, detail?: string): void => {
  if (detail) {
    console.log(`%c[${ts()}] %c⚠ ${label} %c${detail}`, GREY, WARN_STYLE, DIM);
  } else {
    console.log(`%c[${ts()}] %c⚠ ${label}`, GREY, WARN_STYLE);
  }
};

export default actionLog;
