#!/usr/bin/env node
/**
 * File-size guardrail — warns when .ts/.tsx source files exceed a line threshold.
 * Run: node tools/check-file-sizes.mjs
 * Options:
 *   --limit=N   Override the default 3000-line threshold
 *   --fail      Exit with code 1 if any file exceeds the limit (for CI)
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const SRC = join(ROOT, 'src');
const SERVER = join(ROOT, 'server');
const DEFAULT_LIMIT = 3000;

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : DEFAULT_LIMIT;
const shouldFail = args.includes('--fail');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
      files.push(...await walk(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function countLines(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split('\n').length;
}

async function main() {
  const dirs = [SRC, SERVER];
  const allFiles = [];
  for (const dir of dirs) {
    try { allFiles.push(...await walk(dir)); } catch { /* dir may not exist */ }
  }

  const results = [];
  for (const file of allFiles) {
    const lines = await countLines(file);
    results.push({ file: relative(ROOT, file), lines });
  }

  results.sort((a, b) => b.lines - a.lines);

  const violations = results.filter(r => r.lines > limit);
  const top15 = results.slice(0, 15);

  console.log(`\n📏 File Size Report (threshold: ${limit} lines)\n`);
  console.log('Top 15 largest files:');
  console.log('─'.repeat(60));
  for (const { file, lines } of top15) {
    const flag = lines > limit ? ' ⚠️  OVER' : '';
    console.log(`  ${String(lines).padStart(6)} │ ${file}${flag}`);
  }
  console.log('─'.repeat(60));

  if (violations.length > 0) {
    console.log(`\n⚠️  ${violations.length} file(s) exceed ${limit} lines — splitting candidates:\n`);
    for (const { file, lines } of violations) {
      console.log(`  ${file} (${lines} lines, ${Math.ceil(lines / limit)} chunks target)`);
    }
    if (shouldFail) {
      process.exit(1);
    }
  } else {
    console.log(`\n✅ All files within ${limit}-line limit.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
