#!/usr/bin/env node
// Replacement for `node --watch-path=server --watch-path=server.js`.
// node --watch has no ignore list, so any stray write under server/ (a log
// file, a cache file, a touch from a route handler) restarts the backend.
// This wrapper adds ignore patterns + debouncing + names the trigger file
// in the log so future restart loops are diagnosable on sight.

import { spawn } from 'node:child_process';
import { readdirSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_JS = path.join(ROOT, 'server.js');
const ENTRY = path.join(SERVER_DIR, 'index.js');

const IGNORE_RE = /(?:^|[\\/])(?:node_modules|\.git|__tests__|coverage)(?:[\\/]|$)|\.(?:log|jsonl|tmp|swp|swo)$|(?:^|[\\/])\.[^\\/]+$/i;

const DEBOUNCE_MS = 350;
const RESTART_BACKOFF_MS = 250;
const WATCHABLE_RE = /\.(?:js|cjs|mjs|json)$/i;

let child = null;
let restartTimer = null;
let pendingTrigger = null;
let shuttingDown = false;
const mtimes = new Map();

function ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function log(msg) {
  process.stdout.write(`[server-watch ${ts()}] ${msg}\n`);
}

function keyFor(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function isInside(childPath, parentPath) {
  const rel = path.relative(parentPath, childPath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function trackFile(filePath, stats) {
  mtimes.set(keyFor(filePath), stats.mtimeMs);
}

function seedMtimes(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(ROOT, fullPath);
    if (IGNORE_RE.test(rel)) continue;

    if (entry.isDirectory()) {
      seedMtimes(fullPath);
      continue;
    }

    if (!WATCHABLE_RE.test(entry.name)) continue;
    try {
      trackFile(fullPath, statSync(fullPath));
    } catch {
      // File disappeared while seeding. The next real edit will be picked up.
    }
  }
}

function resolveEventPath(filename) {
  const rel = filename.toString();
  const fullPath = path.resolve(SERVER_DIR, rel);
  if (!isInside(fullPath, SERVER_DIR)) return null;
  return fullPath;
}

function shouldRestartForPath(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (IGNORE_RE.test(rel) || !WATCHABLE_RE.test(filePath)) return false;

  const fileKey = keyFor(filePath);
  const previous = mtimes.get(fileKey);
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    if (previous === undefined) return false;
    mtimes.delete(fileKey);
    return true;
  }

  if (stats.isDirectory()) return false;
  if (previous === stats.mtimeMs) return false;

  trackFile(filePath, stats);
  return true;
}

function startChild(reason) {
  if (shuttingDown) return;
  log(`starting server/index.js${reason ? ` (${reason})` : ''}`);
  const proc = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  child = proc;
  proc.on('exit', (code, signal) => {
    const wasOurs = proc.__killing;
    if (child === proc) {
      child = null;
    }
    if (shuttingDown) return;
    if (!wasOurs) {
      log(`server exited (code=${code} signal=${signal}); waiting for a file change before restarting.`);
    }
  });
  proc.on('error', (err) => {
    log(`spawn error: ${err.message}`);
  });
}

function restartChild(trigger) {
  if (shuttingDown) return;
  const reason = trigger ? `triggered by ${trigger}` : 'manual';
  if (!child) {
    startChild(reason);
    return;
  }
  log(`restart ${reason}`);
  child.__killing = true;
  const old = child;
  child = null;
  try {
    old.kill('SIGTERM');
  } catch {
    // ignore
  }
  setTimeout(() => {
    try { if (!old.killed) old.kill('SIGKILL'); } catch { /* ignore */ }
    startChild(reason);
  }, RESTART_BACKOFF_MS);
}

function scheduleRestart(trigger) {
  pendingTrigger = pendingTrigger || trigger;
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    const t = pendingTrigger;
    restartTimer = null;
    pendingTrigger = null;
    restartChild(t);
  }, DEBOUNCE_MS);
}

function handleEvent(event, filename) {
  if (!filename) return;
  const fullPath = resolveEventPath(filename);
  if (!fullPath || !shouldRestartForPath(fullPath)) return;
  scheduleRestart(`${path.relative(SERVER_DIR, fullPath)} (${event})`);
}

function attachWatchers() {
  seedMtimes(SERVER_DIR);
  try {
    trackFile(SERVER_JS, statSync(SERVER_JS));
  } catch {
    // Root entry shim can be absent in some script contexts.
  }

  try {
    watch(SERVER_DIR, { recursive: true, persistent: true }, handleEvent);
    log(`watching ${path.relative(ROOT, SERVER_DIR)} (recursive)`);
  } catch (err) {
    log(`failed to watch server/: ${err.message}`);
  }
  try {
    watch(SERVER_JS, { persistent: true }, (event) => {
      if (shouldRestartForPath(SERVER_JS)) {
        scheduleRestart(`server.js (${event})`);
      }
    });
    log(`watching ${path.relative(ROOT, SERVER_JS)}`);
  } catch (err) {
    log(`failed to watch server.js: ${err.message}`);
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down`);
  if (child) {
    child.__killing = true;
    try { child.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM'); } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

attachWatchers();
startChild('initial');
