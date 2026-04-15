/**
 * Hub Notifier — Adaptive Card notifications to Dev channel
 *
 * Fire-and-forget, rate-limited, silent on failure.
 * Never throws, never blocks the calling code.
 *
 * Events:
 *   matter.opened   – matter successfully created in Clio + DB
 *   eid.completed   – ID verification submitted via Tiller
 *   ccl.approved    – CCL approved for a matter
 *   sync.completed  – collected time or WIP sync finished
 *   error.critical  – unhandled 500 on an API route
 */

const { sendCardToDM } = require('./teamsNotificationClient');
const { trackEvent } = require('./appInsights');
const log = require('./logger').createLogger('HubNotifier');

const NOTIFY_EMAIL = 'lz@helix-law.com';

// ── Rate limiter ─────────────────────────────────────────────
// Same event type + ref → max once per COOLDOWN window
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const _sent = new Map(); // key → timestamp

function shouldSend(key) {
  const last = _sent.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return false;
  _sent.set(key, Date.now());
  // Evict expired entries when map grows
  if (_sent.size > 300) {
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [k, v] of _sent) {
      if (v < cutoff) _sent.delete(k);
    }
  }
  return true;
}

// ── Card builders ────────────────────────────────────────────

const ACCENT_COLOURS = {
  'matter.opened':  'good',      // green
  'eid.completed':  'accent',    // blue
  'ccl.approved':   'good',      // green
  'sync.completed': 'accent',    // blue
  'error.critical': 'attention', // red
};

const TITLES = {
  'matter.opened':  'Matter Opened',
  'eid.completed':  'ID Check Completed',
  'ccl.approved':   'CCL Approved',
  'sync.completed': 'Data Sync',
  'error.critical': 'Error',
};

const ICONS = {
  'matter.opened':  '\u2705',  // ✅
  'eid.completed':  '\uD83D\uDCCB',  // 📋
  'ccl.approved':   '\uD83D\uDCDD',  // 📝
  'sync.completed': '\uD83D\uDD04',  // 🔄
  'error.critical': '\u26A0\uFE0F',  // ⚠️
};

function buildCard(type, data) {
  const facts = [];

  if (type === 'matter.opened') {
    if (data.displayNumber) facts.push({ title: 'Matter', value: data.displayNumber });
    if (data.instructionRef) facts.push({ title: 'Ref', value: data.instructionRef });
    if (data.description) facts.push({ title: 'Description', value: truncate(data.description, 80) });
    if (data.practiceArea) facts.push({ title: 'Practice area', value: data.practiceArea });
    if (data.responsibleSolicitor) facts.push({ title: 'Fee earner', value: data.responsibleSolicitor });
    if (data.triggeredBy) facts.push({ title: 'Opened by', value: data.triggeredBy });
  }

  if (type === 'eid.completed') {
    if (data.instructionRef) facts.push({ title: 'Ref', value: data.instructionRef });
    if (data.name) facts.push({ title: 'Name', value: data.name });
    if (data.overall) facts.push({ title: 'Overall', value: data.overall });
    if (data.pep) facts.push({ title: 'PEP', value: data.pep });
    if (data.address) facts.push({ title: 'Address', value: data.address });
    if (data.triggeredBy) facts.push({ title: 'Run by', value: data.triggeredBy });
  }

  if (type === 'ccl.approved') {
    if (data.matterId) facts.push({ title: 'Matter', value: String(data.matterId) });
    if (data.instructionRef) facts.push({ title: 'Ref', value: data.instructionRef });
    if (data.approvedBy) facts.push({ title: 'Approved by', value: data.approvedBy });
  }

  if (type === 'sync.completed') {
    if (data.entity) facts.push({ title: 'Entity', value: data.entity });
    if (data.tier) facts.push({ title: 'Tier', value: data.tier });
    if (data.durationMs) facts.push({ title: 'Duration', value: `${(Number(data.durationMs) / 1000).toFixed(1)}s` });
    if (data.triggeredBy) facts.push({ title: 'Trigger', value: data.triggeredBy });
  }

  if (type === 'error.critical') {
    if (data.method && data.path) facts.push({ title: 'Route', value: `${data.method} ${data.path}` });
    if (data.status) facts.push({ title: 'Status', value: String(data.status) });
    if (data.message) facts.push({ title: 'Error', value: truncate(data.message, 120) });
    if (data.arrLogId) facts.push({ title: 'ARR Log ID', value: data.arrLogId });
  }

  const title = `${ICONS[type] || ''} ${TITLES[type] || type}`;
  const colour = ACCENT_COLOURS[type] || 'default';

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: colour,
        items: [
          {
            type: 'TextBlock',
            text: title,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
        ],
      },
      {
        type: 'FactSet',
        facts: facts.map(f => ({ title: f.title, value: f.value })),
      },
      {
        type: 'TextBlock',
        text: `${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
        size: 'Small',
        isSubtle: true,
        wrap: true,
      },
    ],
  };
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Main entry point ─────────────────────────────────────────

/**
 * Send a notification card to the Dev channel.
 * @param {'matter.opened'|'eid.completed'|'ccl.approved'|'sync.completed'|'error.critical'} type
 * @param {Record<string, string>} data - Event-specific key/value pairs
 */
async function notify(type, data = {}) {
  try {
    const key = `${type}:${data.entity || data.instructionRef || data.matterId || data.path || 'global'}:${data.tier || ''}`;

    if (!shouldSend(key)) {
      log.debug(`[HubNotifier] Rate-limited: ${key}`);
      return;
    }

    const card = buildCard(type, data);
    const result = await sendCardToDM(NOTIFY_EMAIL, card, `Hub: ${type}`);

    if (result.success) {
      trackEvent('HubNotifier.Sent', { type, key });
    } else {
      log.warn(`[HubNotifier] Post failed (${result.statusCode}): ${result.error?.slice(0, 200)}`);
    }
  } catch (err) {
    // Silent — never break the calling code
    log.warn(`[HubNotifier] Error: ${err.message}`);
  }
}

module.exports = { notify, buildCard, COOLDOWN_MS };
