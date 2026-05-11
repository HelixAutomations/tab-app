/**
 * Teams escalation helper for the Management Dashboard trust gate (Phase D).
 *
 * When automated remediation (e.g. on-demand `syncCollectedTime`) fails to
 * resolve a blocking readiness check after the agreed attempt ceiling, we
 * post a Teams DM to the platform owner so the user is never silently stuck.
 *
 * Design rules:
 *  - Idempotent within a 10-minute window per `(checkId, escalationKey)` so
 *    rapid retries don't spam the channel.
 *  - Falls back to a no-op + telemetry event if the Teams credentials are
 *    missing (local dev, ephemeral environments).
 *  - Never throws; returns `{ ok, status, suppressed?, error? }` so the gate
 *    can render a sensible state either way.
 */

const { sendCardToDM } = require('./teamsNotificationClient');
const { trackEvent, trackException } = require('./appInsights');

const ESCALATION_TARGET_EMAIL = process.env.HELIX_TRUST_GATE_ESCALATION_EMAIL || 'lz@helix-law.com';
const SUPPRESSION_WINDOW_MS = 10 * 60 * 1000;

const recentEscalations = new Map(); // key -> timestamp

function purgeStale(now) {
  for (const [k, ts] of recentEscalations.entries()) {
    if (now - ts > SUPPRESSION_WINDOW_MS) recentEscalations.delete(k);
  }
}

function buildCard({ checkId, checkLabel, attempts, lastError, initials, drift }) {
  const facts = [
    { title: 'Check', value: `${checkLabel} (${checkId})` },
    { title: 'Attempts', value: String(attempts) },
    { title: 'Triggered by', value: initials || 'unknown' },
  ];
  if (drift != null) facts.push({ title: 'Drift', value: `£${Number(drift).toLocaleString('en-GB', { maximumFractionDigits: 2 })}` });
  if (lastError) facts.push({ title: 'Last error', value: String(lastError).slice(0, 240) });

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: 'Management Dashboard trust gate — escalation',
        weight: 'Bolder',
        size: 'Medium',
        color: 'Attention',
      },
      {
        type: 'TextBlock',
        text: `Automated remediation could not clear a blocking signal after ${attempts} attempts. The dashboard remains gated for the user.`,
        wrap: true,
      },
      { type: 'FactSet', facts },
      {
        type: 'TextBlock',
        text: 'Investigate the underlying source (Clio sync / DB freshness) before clearing.',
        wrap: true,
        spacing: 'Small',
        isSubtle: true,
      },
    ],
  };
}

/**
 * Send a Teams escalation card. Returns a plain object — never throws.
 * @param {object} args
 * @param {string} args.checkId
 * @param {string} args.checkLabel
 * @param {number} args.attempts
 * @param {string} [args.initials]
 * @param {string|null} [args.lastError]
 * @param {number|null} [args.drift]
 * @param {string} [args.escalationKey] - extra disambiguator if needed.
 */
async function escalate({ checkId, checkLabel, attempts, initials, lastError = null, drift = null, escalationKey = null }) {
  const now = Date.now();
  purgeStale(now);
  const key = `${checkId}:${escalationKey || 'default'}`;
  const last = recentEscalations.get(key);
  if (last && now - last < SUPPRESSION_WINDOW_MS) {
    trackEvent('Reporting.Readiness.Escalation.Suppressed', {
      checkId, reason: 'recent', sinceMs: String(now - last),
    });
    return { ok: false, suppressed: true };
  }

  try {
    const card = buildCard({ checkId, checkLabel, attempts, lastError, initials, drift });
    const result = await sendCardToDM(
      ESCALATION_TARGET_EMAIL,
      card,
      `Trust gate escalation: ${checkLabel}`,
    );
    // sendCardToDM does NOT throw on recipient-block / known failure modes —
    // it returns `{ success: false, error }`. Treat that as a real failure.
    if (!result || result.success === false) {
      const errMsg = (result && result.error) || 'Teams DM call returned no success';
      trackEvent('Reporting.Readiness.Escalation.Failed', {
        checkId, error: String(errMsg).slice(0, 240),
      });
      return { ok: false, error: errMsg };
    }
    recentEscalations.set(key, now);
    trackEvent('Reporting.Readiness.Escalation.Sent', {
      checkId, target: ESCALATION_TARGET_EMAIL, attempts: String(attempts),
    });
    return { ok: true, status: 'sent', result };
  } catch (err) {
    trackException(err, { operation: 'Reporting.Readiness.Escalation', checkId });
    trackEvent('Reporting.Readiness.Escalation.Failed', {
      checkId, error: err.message || String(err),
    });
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { escalate };
