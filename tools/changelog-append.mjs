#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = process.env.CHANGELOG_ROOT
  ? path.resolve(process.env.CHANGELOG_ROOT)
  : path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'logs', 'changelog.md');
const FRAGMENT_DIR = path.join(ROOT, 'logs', 'changelog.d');
const ENTRY_PATTERN = /^\d{4}-\d{2}-\d{2} \/ [^/]+ \/ .+$/;
const FORBIDDEN_DASHES = /[\u2013\u2014]/;

function usage() {
  return `Usage:
  node tools/changelog-append.mjs --title "Short title" --description "What changed." --files "~ path, + path"
  node tools/changelog-append.mjs --entry "YYYY-MM-DD / Title / Description. (~ file)"
  node tools/changelog-append.mjs --rebuild
  node tools/changelog-append.mjs --check

Creates one unique file in logs/changelog.d/, then rebuilds logs/changelog.md
with fragment entries restored at the top and duplicate lines removed.`;
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--rebuild') {
      args.rebuild = true;
      continue;
    }

    if (arg === '--check') {
      args.check = true;
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    if (equalsIndex > -1) {
      args[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function londonNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${value.year}-${value.month}-${value.day}`;
  const time = `${value.hour}${value.minute}${value.second}`;
  return { date, time };
}

function fail(message) {
  console.error(`changelog-append: ${message}`);
  process.exit(1);
}

function required(args, key) {
  const value = typeof args[key] === 'string' ? args[key].trim() : '';
  if (!value) {
    fail(`missing --${key}`);
  }
  return value;
}

function validateLinePart(label, value) {
  if (/[\r\n]/.test(value)) {
    fail(`${label} must be a single line`);
  }

  if (FORBIDDEN_DASHES.test(value)) {
    fail(`${label} contains an en dash or em dash; use punctuation or a normal hyphen`);
  }
}

function validateEntry(entry) {
  validateLinePart('entry', entry);

  if (!ENTRY_PATTERN.test(entry)) {
    fail('entry must match: YYYY-MM-DD / Short title / Description. (~ changed/file.ts, + new/file.ts)');
  }

  return entry;
}

function buildEntry(args) {
  const explicitEntry = typeof args.entry === 'string' ? args.entry.trim() : '';
  const positionalEntry = args._.length > 0 ? args._.join(' ').trim() : '';
  if (explicitEntry || positionalEntry) {
    return validateEntry(explicitEntry || positionalEntry);
  }

  const title = required(args, 'title');
  const description = required(args, 'description');
  const files = required(args, 'files');
  const date = typeof args.date === 'string' && args.date.trim() ? args.date.trim() : londonNow().date;

  validateLinePart('title', title);
  validateLinePart('description', description);
  validateLinePart('files', files);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('--date must be YYYY-MM-DD');
  }

  const fileSummary = files.startsWith('(') ? files : `(${files})`;
  return validateEntry(`${date} / ${title} / ${description} ${fileSummary}`);
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');

  return slug || 'change';
}

function ensureFragmentDir() {
  fs.mkdirSync(FRAGMENT_DIR, { recursive: true });
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

function readEntriesFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readFragmentRecords() {
  if (!fs.existsSync(FRAGMENT_DIR)) {
    return [];
  }

  return fs.readdirSync(FRAGMENT_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .reverse()
    .flatMap((name) => {
      const filePath = path.join(FRAGMENT_DIR, name);
      return readEntriesFromText(readText(filePath))
        .filter((entry) => ENTRY_PATTERN.test(entry))
        .map((entry) => ({ name, filePath, entry }));
    });
}

function existingChangelogEntries() {
  return readEntriesFromText(readText(CHANGELOG_PATH));
}

function mergeEntries(fragmentEntries, currentEntries) {
  const seen = new Set();
  const merged = [];

  for (const entry of [...fragmentEntries, ...currentEntries]) {
    if (seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    merged.push(entry);
  }

  return merged;
}

function writeChangelog(entries) {
  fs.mkdirSync(path.dirname(CHANGELOG_PATH), { recursive: true });
  const next = `${entries.join('\n')}\n`;
  const current = readText(CHANGELOG_PATH);

  if (next !== current) {
    fs.writeFileSync(CHANGELOG_PATH, next, 'utf8');
    return true;
  }

  return false;
}

function rebuild() {
  const fragmentRecords = readFragmentRecords();
  const currentEntries = existingChangelogEntries();
  const fragmentEntries = fragmentRecords.map((record) => record.entry);
  const merged = mergeEntries(fragmentEntries, currentEntries);
  const changed = writeChangelog(merged);
  const currentSet = new Set(currentEntries);
  const restored = fragmentEntries.filter((entry) => !currentSet.has(entry)).length;

  return { changed, restored, fragmentCount: fragmentRecords.length, totalCount: merged.length };
}

function check() {
  const current = new Set(existingChangelogEntries());
  const missing = readFragmentRecords().filter((record) => !current.has(record.entry));

  if (missing.length === 0) {
    console.log('changelog-append: ok. All fragment entries are present in logs/changelog.md');
    return;
  }

  console.error('changelog-append: FAIL. logs/changelog.md is missing fragment entries:');
  for (const record of missing.slice(0, 20)) {
    console.error(`  ${record.name}: ${record.entry}`);
  }
  if (missing.length > 20) {
    console.error(`  ... and ${missing.length - 20} more`);
  }
  console.error('Run: npm run changelog:rebuild');
  process.exit(1);
}

function uniqueFragmentPath(entry) {
  const { date, time } = londonNow();
  const title = entry.split(' / ')[1] || 'change';
  const baseName = `${date}-${time}-${slugify(title)}`;

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const filePath = path.join(FRAGMENT_DIR, `${baseName}${suffix}.md`);
    if (!fs.existsSync(filePath)) {
      return filePath;
    }
  }

  fail('could not find a free fragment filename');
}

function append(args) {
  const entry = buildEntry(args);
  ensureFragmentDir();

  const fragmentRecords = readFragmentRecords();
  const duplicate = fragmentRecords.find((record) => record.entry === entry);
  let fragmentPath = duplicate ? duplicate.filePath : '';

  if (!duplicate) {
    fragmentPath = uniqueFragmentPath(entry);
    fs.writeFileSync(fragmentPath, `${entry}\n`, 'utf8');
  }

  const result = rebuild();
  const relativeFragmentPath = path.relative(ROOT, fragmentPath).replace(/\\/g, '/');
  const verb = duplicate ? 'kept existing fragment' : 'wrote fragment';
  console.log(`changelog-append: ${verb} ${relativeFragmentPath}`);
  console.log(`changelog-append: rebuilt logs/changelog.md (${result.totalCount} entries, ${result.restored} restored from fragments)`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage());
  process.exit(0);
}

if (args.check) {
  check();
  process.exit(0);
}

if (args.rebuild) {
  const result = rebuild();
  console.log(`changelog-append: rebuilt logs/changelog.md (${result.totalCount} entries, ${result.restored} restored from fragments)`);
  process.exit(0);
}

append(args);