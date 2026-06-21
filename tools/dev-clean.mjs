#!/usr/bin/env node
// tools/dev-clean.mjs — clear local dev clutter that slows the loop.
//
// Targets (safe to wipe — all regenerated on next boot):
//   • node_modules/.cache           CRA/Babel/Webpack incremental cache (biggest offender)
//   • logs/dev-all                  per-session backend.log directories
//   • build                         stale CRA build output
//   • server/logs                   ops.log.jsonl + rotated logs
//   • .eslintcache                  ESLint incremental cache (root)
//
// Usage:
//   node tools/dev-clean.mjs                   # interactive — shows sizes, asks before deleting
//   node tools/dev-clean.mjs --yes             # delete without prompting
//   node tools/dev-clean.mjs --keep-logs       # keep logs/dev-all and server/logs
//   node tools/dev-clean.mjs --logs-only       # only delete logs (cheap, no recompile cost)
//   node tools/dev-clean.mjs --dry-run         # show sizes, change nothing
//   node tools/dev-clean.mjs --if-over-mb=2048 # delete only if selected targets exceed threshold
//
// After running, restart `npm run dev:all` (or dev:fast). First boot will be
// slower (cold webpack compile, ~30-60s) — every boot after is back to normal.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipPrompt = args.has('--yes') || args.has('-y');
const keepLogs = args.has('--keep-logs');
const logsOnly = args.has('--logs-only');

function parseThresholdBytes() {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith('--if-over-mb='));
  if (!raw) return 0;
  const value = Number.parseFloat(raw.split('=')[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * 1024 * 1024;
}

const minimumRecoverableBytes = parseThresholdBytes();

const heavyTargets = [
  'node_modules/.cache',
  'build',
  '.eslintcache',
];

const logTargets = [
  'logs/dev-all',
  'server/logs',
];

let targets;
if (logsOnly) targets = logTargets;
else if (keepLogs) targets = heavyTargets;
else targets = [...heavyTargets, ...logTargets];

function dirSize(p) {
  let total = 0;
  let count = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else {
        try { total += fs.statSync(full).size; count++; } catch { /* skip */ }
      }
    }
  }
  return { total, count };
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const summary = [];
let grandTotal = 0;
for (const rel of targets) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    summary.push({ rel, status: 'missing', total: 0, count: 0 });
    continue;
  }
  const stat = fs.statSync(abs);
  const { total, count } = stat.isDirectory() ? dirSize(abs) : { total: stat.size, count: 1 };
  summary.push({ rel, status: 'present', total, count });
  grandTotal += total;
}

console.log('\nDev clutter audit:');
console.log('─'.repeat(60));
for (const row of summary) {
  if (row.status === 'missing') {
    console.log(`  ${row.rel.padEnd(28)} (missing)`);
  } else {
    console.log(`  ${row.rel.padEnd(28)} ${fmt(row.total).padStart(10)}  (${row.count} items)`);
  }
}
console.log('─'.repeat(60));
console.log(`  TOTAL recoverable          ${fmt(grandTotal).padStart(10)}\n`);

if (dryRun) {
  console.log('--dry-run: nothing deleted.');
  process.exit(0);
}

if (grandTotal === 0) {
  console.log('Nothing to clean.');
  process.exit(0);
}

if (minimumRecoverableBytes > 0 && grandTotal < minimumRecoverableBytes) {
  console.log(`Recoverable total below threshold (${fmt(minimumRecoverableBytes)}); nothing deleted.`);
  process.exit(0);
}

async function confirm() {
  if (skipPrompt) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`Delete the above? [y/N] `, (a) => { rl.close(); resolve(a); });
  });
  return /^y(es)?$/i.test(answer.trim());
}

const ok = await confirm();
if (!ok) {
  console.log('Aborted.');
  process.exit(0);
}

console.log('');
for (const row of summary) {
  if (row.status !== 'present') continue;
  const abs = path.join(root, row.rel);
  process.stdout.write(`  Deleting ${row.rel} ... `);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log('done');
  } catch (err) {
    console.log(`failed: ${err.message}`);
  }
}

console.log(`\n✓ Recovered ${fmt(grandTotal)}.`);
console.log('Next `npm run dev:all` will do a cold webpack compile (~30-60s).');
console.log('Tip: also close + reopen the VS Code Simple Browser tab to clear its cache.');
