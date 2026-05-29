/**
 * Run alongside `npm run dev:fast` in a separate terminal:
 *   node tools/diagnose-server-watch.mjs
 *
 * Logs every filesystem event under <repo>/server and <repo>/server.js so we
 * can see exactly which path is triggering `node --watch-path=server` to
 * restart. Read-only — does not change anything.
 */
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_JS = path.join(ROOT, 'server.js');

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(event, full) {
  const rel = path.relative(ROOT, full);
  console.log(`[${ts()}] ${event.padEnd(8)} ${rel}`);
}

const watchers = [];

function watchDirRecursive(dir) {
  try {
    const w = watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return log(event, dir);
      log(event, path.join(dir, filename));
    });
    watchers.push(w);
  } catch (err) {
    console.error('watch failed for', dir, err.message);
  }
}

console.log(`Watching: ${SERVER_DIR}`);
console.log(`Watching: ${SERVER_JS}`);
console.log('Press Ctrl+C to stop.\n');

watchDirRecursive(SERVER_DIR);
try {
  const w = watch(SERVER_JS, (event) => log(event, SERVER_JS));
  watchers.push(w);
} catch (err) {
  console.error('watch failed for server.js:', err.message);
}

process.on('SIGINT', () => {
  for (const w of watchers) w.close();
  process.exit(0);
});
