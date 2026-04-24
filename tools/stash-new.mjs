#!/usr/bin/env node
// tools/stash-new.mjs
// Scaffold a new stash brief from the template.
//
// Usage:
//   node tools/stash-new.mjs "Some brief title"
//
// Creates docs/notes/SOME_BRIEF_TITLE.md with date, slug, empty metadata block.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { TEMPLATE_FILE, NOTES_DIR } from './lib/stash-meta.mjs';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: node tools/stash-new.mjs "Some brief title"');
  process.exit(1);
}

const slug = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const today = new Date().toISOString().slice(0, 10);
const file = path.join(process.cwd(), NOTES_DIR, `${slug}.md`);

if (fs.existsSync(file)) {
  console.error(`File already exists: ${file}`);
  process.exit(1);
}

const tmplPath = path.join(process.cwd(), TEMPLATE_FILE);
if (!fs.existsSync(tmplPath)) {
  console.error(`Template not found: ${TEMPLATE_FILE}`);
  process.exit(1);
}

let body = fs.readFileSync(tmplPath, 'utf8');
body = body.replace(/<TITLE>/g, title);
body = body.replace(/<DATE>/g, today);
body = body.replace(/<ID>/g, id);
body = body.replace(/<BRANCH>/g, currentBranch());

fs.writeFileSync(file, body, 'utf8');
console.log(`Created: ${path.relative(process.cwd(), file)}`);
console.log(`Brief id: ${id}`);
console.log('');
console.log('Next: fill out §1–§9 and the Stash metadata block, then:');
console.log(`  node tools/stash-precheck.mjs --draft ${path.relative(process.cwd(), file).replace(/\\/g, '/')}`);
console.log(`  node tools/stash-lint.mjs`);
console.log(`  node tools/stash-status.mjs`);

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
