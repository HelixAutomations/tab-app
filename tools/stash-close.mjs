#!/usr/bin/env node
// tools/stash-close.mjs
// Close out a shipped stash brief: mark shipped, archive, re-run dependency scan.
//
// Usage:
//   node tools/stash-close.mjs <id>

import fs from 'fs';
import path from 'path';
import { loadAllBriefs, ARCHIVE_DIR, NOTES_DIR } from './lib/stash-meta.mjs';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node tools/stash-close.mjs <id>');
  process.exit(1);
}

const briefs = loadAllBriefs();
const target = briefs.find(b => b.meta?.id === id);
if (!target) {
  console.error(`No brief found with id: ${id}`);
  console.error('Available ids:');
  briefs.filter(b => b.meta?.id).forEach(b => console.error(`  - ${b.meta.id}`));
  process.exit(1);
}

// Mark shipped in-place by injecting `shipped: true` after `id:` line in metadata block.
const today = new Date().toISOString().slice(0, 10);
let content = target.rawContent;

// Inject shipped + shipped_on into metadata block (idempotent)
content = content.replace(
  /(```ya?ml[\s\S]*?id:\s*[^\n]+\n)/,
  (match, p1) => p1 + `shipped: true\nshipped_on: ${today}\n`,
);

// Move to archive
const archiveDir = path.join(process.cwd(), ARCHIVE_DIR);
if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

const newPath = path.join(archiveDir, target.filename);
fs.writeFileSync(newPath, content, 'utf8');
fs.unlinkSync(path.join(process.cwd(), target.file));

console.log(`Closed: ${id}`);
console.log(`  → archived to ${path.relative(process.cwd(), newPath).replace(/\\/g, '/')}`);

// Re-run dependency scan: find briefs referencing this id
const dependents = briefs.filter(b => {
  if (!b.meta || b.meta.id === id) return false;
  const refs = [
    ...(b.meta.depends_on || []),
    ...(b.meta.coordinates_with || []),
    ...(b.meta.conflicts_with || []),
  ];
  return refs.includes(id);
});

if (dependents.length) {
  console.log('');
  console.log('Closure ripple — these briefs reference the just-shipped id:');
  for (const d of dependents) {
    const role = (d.meta.depends_on || []).includes(id) ? 'depends_on (now ▶️ Ready)'
      : (d.meta.conflicts_with || []).includes(id) ? '⚠️ conflicts_with (re-verify)'
      : 'coordinates_with (re-scan recommended)';
    console.log(`  • ${d.meta.id} (${d.file}) — ${role}`);
  }
}

console.log('');
console.log('Next steps:');
console.log('  1. node tools/stash-status.mjs   # rebuild INDEX.md');
console.log('  2. Add changelog entry referencing this id');
