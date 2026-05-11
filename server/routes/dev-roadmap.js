// server/routes/dev-roadmap.js
// Dev-owner personal roadmap whiteboard for the System > Forge lens.

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { loadAllBriefs, statusFor, titleFromContent, STATUS } = require('../utils/stashMeta');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const STORE_VERSION = 2;
const STORE_PATH = path.resolve(process.cwd(), 'data', 'roadmap-whiteboard.json');
const ORDER_GAP = 1024;
const STATUS_VALUES = new Set(['open', 'in_progress', 'done', 'parked']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDevOwner(req) {
  const initials = String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
  const email = String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  return initials === 'LZ' || email === 'lz@helix-law.com';
}

// Phase G — reader gate widens to LZ + AC for read-only Forge surfaces.
// Writes still require requireDevOwner (LZ only).
function isForgeReader(req) {
  if (isDevOwner(req)) return true;
  const initials = String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
  const email = String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  return initials === 'AC' || email === 'ac@helix-law.com';
}

function readActor(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || req.user?.email || req.query?.email || 'unknown').trim() || 'unknown';
}

function readViewMode(req) {
  const raw = String(req.query?.viewMode || req.headers['x-forge-view-mode'] || '').toLowerCase().trim();
  if (raw === 'roadmap') return 'roadmap';
  return 'dev';
}

// Write gate — LZ only. Used by POST/PATCH/DELETE on whiteboard items.
function requireDevOwner(req, res, next) {
  if (!isDevOwner(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// Read gate — LZ + AC. Used by the GET endpoint so AC's Roadmap mode can load.
function requireForgeReader(req, res, next) {
  if (!isForgeReader(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function londonDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function cleanString(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanNotes(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
}

function normaliseStatus(value) {
  const status = String(value || '').trim();
  return STATUS_VALUES.has(status) ? status : 'open';
}

function normaliseDate(value, fallback = londonDateString()) {
  const raw = String(value || '').trim();
  if (raw === 'parked') return 'parked';
  if (DATE_RE.test(raw)) return raw;
  return fallback;
}

function weekStartForDate(value, fallback = londonDateString()) {
  const source = DATE_RE.test(String(value || '')) ? String(value) : fallback;
  const date = new Date(`${source}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return weekStartForDate(fallback);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function normaliseWeekStart(value, fallbackDate = londonDateString()) {
  const raw = String(value || '').trim();
  if (raw === 'parked') return 'parked';
  if (DATE_RE.test(raw)) return weekStartForDate(raw);
  return weekStartForDate(fallbackDate);
}

function normaliseBriefId(value) {
  const cleaned = cleanString(value, 160);
  return /^[a-z0-9][a-z0-9_-]*$/i.test(cleaned) ? cleaned : '';
}

function normaliseOrder(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normaliseItem(raw, index = 0) {
  const now = new Date().toISOString();
  const rawStatus = normaliseStatus(raw?.status);
  const isParked = rawStatus === 'parked' || raw?.scheduledDate === 'parked' || raw?.weekStart === 'parked';
  const scheduledDate = isParked ? 'parked' : normaliseDate(raw?.scheduledDate, DATE_RE.test(String(raw?.weekStart || '')) ? raw.weekStart : londonDateString());
  const weekStart = isParked ? 'parked' : normaliseWeekStart(raw?.weekStart, scheduledDate);
  return {
    id: cleanString(raw?.id, 80) || `rw_${randomUUID()}`,
    title: cleanString(raw?.title, 140),
    notes: cleanNotes(raw?.notes),
    scheduledDate,
    weekStart,
    manualOrder: normaliseOrder(raw?.manualOrder, (index + 1) * ORDER_GAP),
    status: isParked ? 'parked' : rawStatus,
    briefId: normaliseBriefId(raw?.briefId) || undefined,
    createdAt: cleanString(raw?.createdAt, 40) || now,
    updatedAt: cleanString(raw?.updatedAt, 40) || now,
    createdBy: cleanString(raw?.createdBy, 20) || 'LZ',
    deletedAt: raw?.deletedAt ? cleanString(raw.deletedAt, 40) : undefined,
  };
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const items = Array.isArray(parsed.items) ? parsed.items.map(normaliseItem).filter((item) => item.title) : [];
    return { version: STORE_VERSION, items };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { version: STORE_VERSION, items: [] };
    }
    throw err;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const payload = {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    items: store.items.map((item, index) => normaliseItem(item, index)),
  };
  const tmpPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, STORE_PATH);
}

function visibleItems(store) {
  return store.items.filter((item) => !item.deletedAt);
}

function laneKey(item) {
  if (item.status === 'done') return 'done';
  if (item.status === 'parked' || item.scheduledDate === 'parked' || item.weekStart === 'parked') return 'parked';
  return `week:${item.weekStart || weekStartForDate(item.scheduledDate)}`;
}

function tailOrder(items, sample) {
  const key = laneKey(sample);
  const laneItems = items.filter((item) => !item.deletedAt && laneKey(item) === key);
  const max = laneItems.reduce((highest, item) => Math.max(highest, Number(item.manualOrder) || 0), 0);
  return max + ORDER_GAP;
}

function statusKeyForBrief(status) {
  if (status === STATUS.STALE) return 'stale';
  if (status === STATUS.READY) return 'ready';
  if (status === STATUS.DONE) return 'done';
  return 'open';
}

function loadBriefLookup() {
  return loadAllBriefs()
    .filter((brief) => brief.hasMetaBlock && brief.meta && brief.meta.id)
    .map((brief) => ({
      id: brief.meta.id,
      title: titleFromContent(brief.rawContent, brief.filename),
      file: brief.file,
      status: statusKeyForBrief(statusFor(brief.meta)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildPulse(items, today = londonDateString()) {
  const currentWeek = weekStartForDate(today);
  const nextWeek = addDays(currentWeek, 7);
  const twoWeeks = addDays(currentWeek, 14);
  const threeWeeks = addDays(currentWeek, 21);
  const active = items.filter((item) => !item.deletedAt && item.status !== 'done' && item.status !== 'parked' && item.scheduledDate !== 'parked');
  return {
    today: active.filter((item) => item.scheduledDate === today).length,
    thisWeek: active.filter((item) => (item.weekStart || weekStartForDate(item.scheduledDate)) <= currentWeek).length,
    overdue: active.filter((item) => (item.weekStart || weekStartForDate(item.scheduledDate)) < currentWeek).length,
    next7: active.filter((item) => item.scheduledDate > today && item.scheduledDate <= addDays(today, 7)).length,
    nextWeek: active.filter((item) => (item.weekStart || weekStartForDate(item.scheduledDate)) === nextWeek).length,
    twoWeeks: active.filter((item) => (item.weekStart || weekStartForDate(item.scheduledDate)) === twoWeeks).length,
    later: active.filter((item) => (item.weekStart || weekStartForDate(item.scheduledDate)) >= threeWeeks).length,
    parked: items.filter((item) => !item.deletedAt && (item.status === 'parked' || item.scheduledDate === 'parked')).length,
    doneLast14: items.filter((item) => !item.deletedAt && item.status === 'done' && item.updatedAt.slice(0, 10) >= addDays(today, -14)).length,
  };
}

function sendStarted(name, req) {
  const startedAt = Date.now();
  const actor = readActor(req);
  const viewMode = readViewMode(req);
  const baseProps = { operation: name, triggeredBy: actor, actor, viewMode, cadence: 'weekly' };
  trackEvent(`DevConsole.Roadmap.${name}.Started`, baseProps);
  return {
    complete(properties = {}) {
      const durationMs = Date.now() - startedAt;
      trackMetric(`DevConsole.Roadmap.${name}.Duration`, durationMs, { operation: name, viewMode, cadence: 'weekly' });
      trackEvent(`DevConsole.Roadmap.${name}.Completed`, { ...baseProps, durationMs, ...properties });
    },
    fail(err, properties = {}) {
      trackException(err, { operation: `DevConsole.Roadmap.${name}`, phase: 'route', viewMode, cadence: 'weekly', ...properties });
      trackEvent(`DevConsole.Roadmap.${name}.Failed`, { ...baseProps, error: err.message, ...properties });
    },
  };
}

router.get('/', requireForgeReader, async (req, res) => {
  const telemetry = sendStarted('Get', req);
  try {
    const store = await readStore();
    const items = visibleItems(store);
    const today = londonDateString();
    telemetry.complete({ itemCount: items.length });
    res.json({
      generatedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      today,
      weekStart: weekStartForDate(today),
      items,
      pulse: buildPulse(items, today),
      briefs: loadBriefLookup(),
    });
  } catch (err) {
    telemetry.fail(err);
    res.status(500).json({ error: 'failed to load roadmap whiteboard', detail: err.message });
  }
});

router.post('/', requireDevOwner, async (req, res) => {
  const telemetry = sendStarted('Create', req);
  try {
    const title = cleanString(req.body?.title, 140);
    if (!title) {
      telemetry.complete({ result: 'validation_failed', reason: 'title_required' });
      return res.status(400).json({ error: 'title is required' });
    }

    const store = await readStore();
    const rawStatus = normaliseStatus(req.body?.status);
    const isParked = rawStatus === 'parked' || req.body?.scheduledDate === 'parked' || req.body?.weekStart === 'parked';
    const scheduledDate = isParked ? 'parked' : normaliseDate(req.body?.scheduledDate, req.body?.weekStart || londonDateString());
    const weekStart = isParked ? 'parked' : normaliseWeekStart(req.body?.weekStart, scheduledDate);
    const status = isParked ? 'parked' : rawStatus;
    const item = normaliseItem({
      id: `rw_${randomUUID()}`,
      title,
      notes: req.body?.notes,
      scheduledDate,
      weekStart,
      status,
      manualOrder: normaliseOrder(req.body?.manualOrder, tailOrder(store.items, { scheduledDate, weekStart, status })),
      briefId: req.body?.briefId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: readActor(req).toUpperCase(),
    });
    store.items.push(item);
    await writeStore(store);
    telemetry.complete({ itemId: item.id });
    res.status(201).json({ item });
  } catch (err) {
    telemetry.fail(err);
    res.status(500).json({ error: 'failed to create roadmap item', detail: err.message });
  }
});

router.patch('/:id', requireDevOwner, async (req, res) => {
  const telemetry = sendStarted('Update', req);
  try {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === req.params.id && !item.deletedAt);
    if (index === -1) {
      telemetry.complete({ result: 'not_found', itemId: req.params.id });
      return res.status(404).json({ error: 'roadmap item not found' });
    }

    const existing = store.items[index];
    const next = { ...existing };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) {
      const title = cleanString(req.body.title, 140);
      if (!title) {
        telemetry.complete({ result: 'validation_failed', reason: 'title_empty', itemId: req.params.id });
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      next.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) next.notes = cleanNotes(req.body.notes);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'briefId')) next.briefId = normaliseBriefId(req.body.briefId) || undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledDate')) next.scheduledDate = normaliseDate(req.body.scheduledDate, existing.scheduledDate);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'weekStart')) next.weekStart = normaliseWeekStart(req.body.weekStart, next.scheduledDate);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) next.status = normaliseStatus(req.body.status);
    if (next.scheduledDate === 'parked' || next.status === 'parked') {
      next.scheduledDate = 'parked';
      next.weekStart = 'parked';
      next.status = 'parked';
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledDate') && !Object.prototype.hasOwnProperty.call(req.body || {}, 'weekStart')) {
      next.weekStart = normaliseWeekStart(undefined, next.scheduledDate);
    } else if (!DATE_RE.test(String(next.weekStart || ''))) {
      next.weekStart = normaliseWeekStart(undefined, next.scheduledDate);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'manualOrder')) {
      next.manualOrder = normaliseOrder(req.body.manualOrder, existing.manualOrder);
    } else if (next.weekStart !== existing.weekStart || next.scheduledDate !== existing.scheduledDate || next.status !== existing.status) {
      next.manualOrder = tailOrder(store.items.filter((item) => item.id !== next.id), next);
    }
    next.updatedAt = new Date().toISOString();
    store.items[index] = normaliseItem(next, index);
    await writeStore(store);
    telemetry.complete({ itemId: next.id });
    res.json({ item: store.items[index] });
  } catch (err) {
    telemetry.fail(err, { itemId: req.params.id });
    res.status(500).json({ error: 'failed to update roadmap item', detail: err.message });
  }
});

router.delete('/:id', requireDevOwner, async (req, res) => {
  const telemetry = sendStarted('Delete', req);
  try {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === req.params.id && !item.deletedAt);
    if (index === -1) {
      telemetry.complete({ result: 'not_found', itemId: req.params.id });
      return res.status(404).json({ error: 'roadmap item not found' });
    }
    store.items[index] = normaliseItem({
      ...store.items[index],
      scheduledDate: 'parked',
      weekStart: 'parked',
      status: 'parked',
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, index);
    await writeStore(store);
    telemetry.complete({ itemId: req.params.id });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    telemetry.fail(err, { itemId: req.params.id });
    res.status(500).json({ error: 'failed to delete roadmap item', detail: err.message });
  }
});

module.exports = router;