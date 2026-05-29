#!/usr/bin/env node
// tools/instruction-impact-snapshot.mjs
//
// Capture an objective snapshot of the instruction estate + ship cadence so
// we can compare before/after a structural change.
//
// Usage:
//   node tools/instruction-impact-snapshot.mjs                 # print snapshot
//   node tools/instruction-impact-snapshot.mjs --save          # also write logs/instruction-impact/<date>.json
//   node tools/instruction-impact-snapshot.mjs --compare       # diff vs earliest saved snapshot
//   node tools/instruction-impact-snapshot.mjs --compare=BASE  # diff vs logs/instruction-impact/BASE.json
//
// No external deps. Read-only against the repo (except the optional --save write).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'logs', 'instruction-impact');
const args = new Set(process.argv.slice(2).filter(a => !a.startsWith('--compare=')));
const compareArg = process.argv.slice(2).find(a => a.startsWith('--compare='));

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function lineCount(s) { return s ? s.split(/\r?\n/).length : 0; }
function byteCount(s) { return s ? Buffer.byteLength(s, 'utf8') : 0; }

function listInstructionFiles() {
  const dir = path.join(ROOT, '.github', 'instructions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => path.join(dir, f));
}

function frontmatter(content) {
  if (!content?.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const fm = {};
  for (const line of content.slice(3, end).split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+):\s*"?([^"]*)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

function alwaysOnFiles() {
  // Files actually loaded into every turn: copilot-instructions.md + AGENTS.md (if present)
  // + any .instructions.md with applyTo "**" (auto-attached but global).
  const out = [];
  const top = path.join(ROOT, '.github', 'copilot-instructions.md');
  if (fs.existsSync(top)) out.push(top);
  const agents = path.join(ROOT, 'AGENTS.md');
  if (fs.existsSync(agents)) out.push(agents);
  for (const f of listInstructionFiles()) {
    const fm = frontmatter(readSafe(f) || '');
    if (fm.applyTo === '**') out.push(f);
  }
  return out;
}

function runValidator() {
  try {
    const out = execSync('node tools/validate-instructions.mjs', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/Found (\d+) issues?: (\d+) error\(s\), (\d+) warning\(s\)/);
    if (m) return { issues: +m[1], errors: +m[2], warnings: +m[3], ok: true };
    return { issues: 0, errors: 0, warnings: 0, ok: true };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/Found (\d+) issues?: (\d+) error\(s\), (\d+) warning\(s\)/);
    if (m) return { issues: +m[1], errors: +m[2], warnings: +m[3], ok: false };
    return { issues: -1, errors: -1, warnings: -1, ok: false };
  }
}

function changelogStats() {
  const cl = readSafe(path.join(ROOT, 'logs', 'changelog.md')) || '';
  const entries = cl.split(/\r?\n/).filter(l => /^\d{4}-\d{2}-\d{2} \/ /.test(l));
  const now = new Date();
  const cutoff = new Date(now.getTime() - 7 * 86400000);
  const last7 = entries.filter(l => {
    const d = new Date(l.slice(0, 10));
    return !isNaN(d) && d >= cutoff;
  });
  return { total: entries.length, last7Days: last7.length };
}

function stashStats() {
  const dir = path.join(ROOT, 'docs', 'notes');
  const archive = path.join(dir, '_archive');
  const open = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'INDEX.md').length : 0;
  const done = fs.existsSync(archive) ? fs.readdirSync(archive).filter(f => f.endsWith('.md')).length : 0;
  return { open, doneTotal: done };
}

function instructionEstate() {
  const files = listInstructionFiles();
  let totalLines = 0;
  for (const f of files) totalLines += lineCount(readSafe(f));
  return { fileCount: files.length, totalLines };
}

function snapshot() {
  const ao = alwaysOnFiles().map(f => {
    const c = readSafe(f) || '';
    return { file: path.relative(ROOT, f).replace(/\\/g, '/'), lines: lineCount(c), bytes: byteCount(c) };
  });
  return {
    capturedAt: new Date().toISOString(),
    alwaysOn: {
      files: ao,
      totalLines: ao.reduce((a, b) => a + b.lines, 0),
      totalBytes: ao.reduce((a, b) => a + b.bytes, 0),
    },
    estate: instructionEstate(),
    validator: runValidator(),
    changelog: changelogStats(),
    stash: stashStats(),
  };
}

function fmtRow(label, value) { return `  ${label.padEnd(28)} ${value}`; }

function printSnapshot(s, title = 'Snapshot') {
  console.log(`\n=== ${title} (${s.capturedAt}) ===`);
  console.log('\nAlways-on context (loaded every turn):');
  for (const f of s.alwaysOn.files) console.log(fmtRow(f.file, `${f.lines} lines / ${f.bytes} B`));
  console.log(fmtRow('TOTAL', `${s.alwaysOn.totalLines} lines / ${s.alwaysOn.totalBytes} B`));
  console.log('\nInstruction estate:');
  console.log(fmtRow('files', s.estate.fileCount));
  console.log(fmtRow('total lines', s.estate.totalLines));
  console.log('\nValidator:');
  console.log(fmtRow('errors', s.validator.errors));
  console.log(fmtRow('warnings', s.validator.warnings));
  console.log('\nShip cadence:');
  console.log(fmtRow('changelog entries (last 7d)', s.changelog.last7Days));
  console.log(fmtRow('changelog entries (total)', s.changelog.total));
  console.log('\nStash queue:');
  console.log(fmtRow('open', s.stash.open));
  console.log(fmtRow('closed (archive total)', s.stash.doneTotal));
}

function diffNum(a, b) { const d = b - a; const sign = d > 0 ? '+' : ''; return `${a} -> ${b} (${sign}${d})`; }

function printDiff(base, now) {
  console.log(`\n=== Impact diff: ${base.capturedAt}  ->  ${now.capturedAt} ===`);
  console.log('\nAlways-on context:');
  console.log(fmtRow('total lines', diffNum(base.alwaysOn.totalLines, now.alwaysOn.totalLines)));
  console.log(fmtRow('total bytes', diffNum(base.alwaysOn.totalBytes, now.alwaysOn.totalBytes)));
  const pct = base.alwaysOn.totalLines ? Math.round(((now.alwaysOn.totalLines - base.alwaysOn.totalLines) / base.alwaysOn.totalLines) * 100) : 0;
  console.log(fmtRow('change %', `${pct >= 0 ? '+' : ''}${pct}%`));
  console.log('\nValidator:');
  console.log(fmtRow('errors', diffNum(base.validator.errors, now.validator.errors)));
  console.log(fmtRow('warnings', diffNum(base.validator.warnings, now.validator.warnings)));
  console.log('\nEstate:');
  console.log(fmtRow('files', diffNum(base.estate.fileCount, now.estate.fileCount)));
  console.log(fmtRow('total lines', diffNum(base.estate.totalLines, now.estate.totalLines)));
  console.log('\nShip cadence:');
  console.log(fmtRow('changelog last 7d', diffNum(base.changelog.last7Days, now.changelog.last7Days)));
  console.log(fmtRow('changelog total', diffNum(base.changelog.total, now.changelog.total)));
  console.log('\nStash:');
  console.log(fmtRow('open', diffNum(base.stash.open, now.stash.open)));
  console.log(fmtRow('closed (archive)', diffNum(base.stash.doneTotal, now.stash.doneTotal)));
}

function loadBaseline(arg) {
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json')).sort();
  if (!files.length) return null;
  const pick = arg && arg !== '--compare' ? `${arg.replace(/^--compare=/, '')}.json` : files[0];
  const p = path.join(OUT_DIR, pick);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const now = snapshot();

if (args.has('--save')) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = now.capturedAt.replace(/[:.]/g, '-');
  const out = path.join(OUT_DIR, `${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(now, null, 2));
  console.log(`Saved: ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
}

if (args.has('--compare') || compareArg) {
  const base = loadBaseline(compareArg || '--compare');
  if (!base) {
    console.error('No baseline snapshot found in logs/instruction-impact/. Run with --save first.');
    process.exit(1);
  }
  printSnapshot(base, 'Baseline');
  printSnapshot(now, 'Current');
  printDiff(base, now);
} else {
  printSnapshot(now, 'Snapshot');
}
