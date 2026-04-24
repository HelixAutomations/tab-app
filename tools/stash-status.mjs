#!/usr/bin/env node
// tools/stash-status.mjs
// Render docs/notes/INDEX.md from metadata blocks. Single source of truth = the briefs themselves.
//
// Usage:
//   node tools/stash-status.mjs            # rewrite INDEX.md
//   node tools/stash-status.mjs --check    # exit 1 if INDEX.md would change
//   node tools/stash-status.mjs --print    # print to stdout, do not write

import fs from 'fs';
import path from 'path';
import { loadAllBriefs, statusFor, daysSince, STATUS, INDEX_FILE } from './lib/stash-meta.mjs';

const args = new Set(process.argv.slice(2));

const briefs = loadAllBriefs().filter(b => b.hasMetaBlock);

// Sort: Open first, then Ready, then Stale, then Done. Inside each group, by verified date desc.
const order = { [STATUS.READY]: 0, [STATUS.OPEN]: 1, [STATUS.STALE]: 2, [STATUS.DONE]: 3 };
const rows = briefs.map(b => {
  const status = statusFor(b.meta);
  return {
    status,
    title: titleFromFile(b.rawContent, b.filename),
    file: b.filename,
    id: b.meta.id || '—',
    verified: b.meta.verified || '—',
    age: daysSince(b.meta.verified),
    coords: formatCoords(b.meta),
    nextAction: nextActionFor(b.meta, status),
  };
}).sort((a, b) => {
  const oa = order[a.status] ?? 9;
  const ob = order[b.status] ?? 9;
  if (oa !== ob) return oa - ob;
  return (b.verified || '').localeCompare(a.verified || '');
});

const header = `# Stashed projects — index

Single source of truth for parked work. **This file is auto-generated** by \`tools/stash-status.mjs\` from the YAML metadata block in each brief. Edit the brief, not this file.

**Status legend:** ${STATUS.OPEN} Open · ${STATUS.READY} Ready (newly unblocked, re-run dependency check) · ${STATUS.STALE} Stale (>30 days since \`verified\` — re-verify file/line refs) · ${STATUS.DONE} Done

`;

const tableHeader = `| Status | Title | id | Last verified | Coordinates / depends | Next action |
|--------|-------|----|---------------|----------------------|-------------|
`;

const tableBody = rows.map(r => {
  const ageNote = r.age !== null ? ` (${r.age}d)` : '';
  return `| ${r.status} | [${r.title}](${r.file}) | \`${r.id}\` | ${r.verified}${ageNote} | ${r.coords} | ${r.nextAction} |`;
}).join('\n');

const footer = `

## Closure protocol

When a brief is picked up and shipped:
1. Confirm in your response that the brief was followed (or note deviations).
2. Run \`node tools/stash-close.mjs <id>\` — marks brief shipped, moves to \`_archive/\`, re-runs dependency scan.
3. Add a changelog entry referencing the brief id.

See [.github/instructions/STASHED_PROJECTS.md](../../.github/instructions/STASHED_PROJECTS.md) for the full protocol (triggers A–D, metadata schema, dependency-check algorithm).
`;

const output = header + tableHeader + tableBody + footer;

if (args.has('--print')) {
  console.log(output);
  process.exit(0);
}

const indexPath = path.join(process.cwd(), INDEX_FILE);
const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';

if (args.has('--check')) {
  if (existing.trim() !== output.trim()) {
    console.error('INDEX.md is out of date. Run: node tools/stash-status.mjs');
    process.exit(1);
  }
  console.log('INDEX.md is up to date.');
  process.exit(0);
}

fs.writeFileSync(indexPath, output, 'utf8');
console.log(`Wrote ${INDEX_FILE} (${rows.length} brief(s)).`);

function titleFromFile(content, fallback) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function formatCoords(meta) {
  const parts = [];
  if (meta.depends_on?.length) parts.push(`depends_on: ${meta.depends_on.join(', ')}`);
  if (meta.coordinates_with?.length) parts.push(`coordinates_with: ${meta.coordinates_with.join(', ')}`);
  if (meta.conflicts_with?.length) parts.push(`⚠️ conflicts_with: ${meta.conflicts_with.join(', ')}`);
  return parts.length ? parts.join('; ') : '—';
}

function nextActionFor(meta, status) {
  if (status === STATUS.DONE) return 'Shipped';
  if (status === STATUS.STALE) return 'Re-verify file/line refs, then proceed';
  if (status === STATUS.READY) return 'Re-run precheck, then proceed';
  return meta.next_action || 'See brief §3 (Plan)';
}
