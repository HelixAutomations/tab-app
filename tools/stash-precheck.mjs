#!/usr/bin/env node
// tools/stash-precheck.mjs
// Trigger D — scan for overlap before writing a new stash brief.
//
// Usage:
//   node tools/stash-precheck.mjs --draft docs/notes/MY_NEW_BRIEF.md
//   node tools/stash-precheck.mjs --touches "src/foo.ts,server/bar.js"
//   echo "src/foo.ts" | node tools/stash-precheck.mjs --stdin
//
// Exit codes: 0 = independent, 1 = coordinates, 2 = conflicts.

import fs from 'fs';
import path from 'path';
import { loadAllBriefs, extractMetaBlock, parseMetaBlock, realtimeContextAgeDays, TOUCH_KEYS } from './lib/stash-meta.mjs';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { draft: null, touches: [], stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--draft') out.draft = argv[++i];
    else if (a === '--touches') out.touches = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--stdin') out.stdin = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node tools/stash-precheck.mjs [--draft <file>] [--touches "<file1,file2>"] [--stdin]`);
}

async function main() {
  let draftTouches = [...args.touches];

  if (args.draft) {
    if (!fs.existsSync(args.draft)) {
      console.error(`Draft file not found: ${args.draft}`);
      process.exit(3);
    }
    const md = fs.readFileSync(args.draft, 'utf8');
    const yaml = extractMetaBlock(md);
    if (!yaml) {
      console.error(`No "Stash metadata" block found in ${args.draft}.`);
      process.exit(3);
    }
    const meta = parseMetaBlock(yaml);
    for (const k of TOUCH_KEYS) {
      const list = meta.touches?.[k] || [];
      for (const f of list) draftTouches.push(f);
    }
  }
  if (args.stdin) {
    const stdin = fs.readFileSync(0, 'utf8');
    for (const line of stdin.split(/\r?\n/)) {
      if (line.trim()) draftTouches.push(line.trim());
    }
  }

  if (draftTouches.length === 0) {
    console.error('No touches provided. Use --draft <file> or --touches "<a,b>" or --stdin.');
    process.exit(3);
  }

  const briefs = loadAllBriefs();
  const conflicts = [];
  const coordinates = [];
  const declaredCoords = [];

  // If --draft was given, find what the draft itself declares
  let draftMeta = null;
  if (args.draft) {
    const md = fs.readFileSync(args.draft, 'utf8');
    const yaml = extractMetaBlock(md);
    if (yaml) draftMeta = parseMetaBlock(yaml);
  }
  const draftId = draftMeta?.id;
  const draftCoords = new Set([
    ...(draftMeta?.coordinates_with || []),
    ...(draftMeta?.conflicts_with || []),
    ...(draftMeta?.depends_on || []),
  ]);

  for (const brief of briefs) {
    if (!brief.meta) continue;
    if (args.draft && brief.file === path.relative(process.cwd(), args.draft).replace(/\\/g, '/')) continue;

    const briefTouches = collectTouches(brief.meta);
    const overlap = draftTouches.filter(f => briefTouches.includes(f));

    // Is the relationship already declared (either direction)?
    const briefRefs = new Set([
      ...(brief.meta.coordinates_with || []),
      ...(brief.meta.conflicts_with || []),
      ...(brief.meta.depends_on || []),
    ]);
    const isDeclaredConflict =
      (brief.meta.conflicts_with || []).includes(draftId) ||
      (draftMeta?.conflicts_with || []).includes(brief.meta.id);
    const isDeclaredCoord =
      briefRefs.has(draftId) || draftCoords.has(brief.meta.id);

    if (overlap.length) {
      if (isDeclaredConflict) {
        conflicts.push({ brief, overlap, declared: true });
      } else if (isDeclaredCoord) {
        declaredCoords.push({ brief, files: overlap });
      } else {
        conflicts.push({ brief, overlap, declared: false });
      }
      continue;
    }
    // Coordinates by proximity: same directory
    const coord = draftTouches.filter(f => briefTouches.some(b => sameDir(f, b)));
    if (coord.length) {
      coordinates.push({ brief, files: coord });
    }
  }

  // Submodule freshness
  const touchesSubmodule = draftTouches.some(f => f.startsWith('submodules/'));
  const ctxAge = realtimeContextAgeDays();
  const submoduleStale = touchesSubmodule && (ctxAge === null || ctxAge > 7);

  // Output
  console.log('Stash precheck');
  console.log('==============');
  console.log(`Draft touches ${draftTouches.length} file(s).`);
  console.log(`Compared against ${briefs.filter(b => b.meta).length} stashed brief(s).`);
  console.log('');

  if (conflicts.length === 0 && coordinates.length === 0 && declaredCoords.length === 0) {
    console.log('Result: INDEPENDENT — no overlap detected.');
  }

  if (declaredCoords.length) {
    console.log(`Declared coordinations (${declaredCoords.length}) — already cross-referenced in metadata:`);
    for (const c of declaredCoords) {
      console.log(`  • ${c.brief.meta.id} (${c.brief.file})`);
      for (const f of c.files) console.log(`      shared file: ${f}`);
    }
    console.log('');
  }

  if (coordinates.length) {
    console.log(`COORDINATES (${coordinates.length}) — same directory, no shared file:`);
    for (const c of coordinates) {
      console.log(`  • ${c.brief.meta.id} (${c.brief.file})`);
      for (const f of c.files) console.log(`      shared dir: ${f}`);
    }
    console.log('');
  }

  if (conflicts.length) {
    const undeclared = conflicts.filter(c => !c.declared);
    const declared = conflicts.filter(c => c.declared);
    if (undeclared.length) {
      console.log(`⚠️  POTENTIAL CONFLICTS (${undeclared.length}) — shared file, NOT declared in metadata:`);
      for (const c of undeclared) {
        console.log(`  • ${c.brief.meta.id} (${c.brief.file})`);
        for (const f of c.overlap) console.log(`      shared FILE: ${f}`);
      }
      console.log('  → Add to coordinates_with or conflicts_with in metadata, then re-run.');
      console.log('');
    }
    if (declared.length) {
      console.log(`Declared CONFLICTS (${declared.length}) — will need merge:`);
      for (const c of declared) {
        console.log(`  • ${c.brief.meta.id}`);
        for (const f of c.overlap) console.log(`      shared FILE: ${f}`);
      }
      console.log('');
    }
  }

  if (submoduleStale) {
    console.log(`⚠️  Submodule freshness: REALTIME_CONTEXT.md is ${ctxAge === null ? 'missing' : `${ctxAge}d old`}.`);
    console.log('    Suggest running "sync submodules" before writing this brief.');
    console.log('');
  }

  if (conflicts.filter(c => !c.declared).length) process.exit(2);
  if (coordinates.length || declaredCoords.length || conflicts.length) process.exit(1);
  process.exit(0);
}

function collectTouches(meta) {
  const out = [];
  for (const k of TOUCH_KEYS) {
    const list = meta.touches?.[k] || [];
    for (const f of list) out.push(f);
  }
  return out;
}

function sameDir(a, b) {
  if (a === b) return true;
  const da = path.posix.dirname(a.replace(/\\/g, '/'));
  const db = path.posix.dirname(b.replace(/\\/g, '/'));
  return da === db && da !== '.';
}

main().catch(err => { console.error(err); process.exit(3); });
