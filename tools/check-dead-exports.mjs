#!/usr/bin/env node
/**
 * Dead-exports scanner — finds exported symbols that are never imported elsewhere.
 * Lightweight, zero-dependency. Uses regex heuristics (not full TS AST).
 *
 * Run: node tools/check-dead-exports.mjs
 * Options:
 *   --verbose   Show all exports, not just unused ones
 *   --json      Output as JSON for programmatic use
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const SRC = join(ROOT, 'src');
const SERVER = join(ROOT, 'server');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const jsonOutput = args.includes('--json');

// Files/dirs to skip
const SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'submodules', '__tests__', '__mocks__']);

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// Extract named exports from a file
function extractExports(content, filePath) {
  const exports = [];
  const rel = relative(ROOT, filePath);

  // export const/let/var/function/class/type/interface/enum NAME
  const namedRe = /^export\s+(?:declare\s+)?(?:const|let|var|function\*?|class|type|interface|enum|abstract\s+class)\s+(\w+)/gm;
  let m;
  while ((m = namedRe.exec(content))) {
    exports.push({ name: m[1], file: rel });
  }

  // export { A, B, C }  (not re-exports)
  const braceRe = /^export\s*\{([^}]+)\}/gm;
  while ((m = braceRe.exec(content))) {
    const names = m[1].split(',').map(n => {
      const parts = n.trim().split(/\s+as\s+/);
      return (parts[1] || parts[0]).trim();
    }).filter(Boolean);
    for (const name of names) {
      if (name !== 'default') exports.push({ name, file: rel });
    }
  }

  // export default — track as 'default'
  if (/^export\s+default\s/m.test(content)) {
    exports.push({ name: 'default', file: rel });
  }

  return exports;
}

// Check if a symbol name appears as an import anywhere in the codebase
function isImportedAnywhere(name, allContents, sourceFile) {
  if (name === 'default') return true; // default exports are always considered used
  for (const { file, content } of allContents) {
    if (file === sourceFile) continue;
    // Check: import { Name } or import { X as Name } or Name appears in import type
    if (content.includes(name)) {
      // Quick heuristic: does the name appear in an import statement from this file?
      const importRe = new RegExp(`(?:import|from).*['"][^'"]*['"]|\\b${name}\\b`, 'g');
      if (importRe.test(content)) return true;
    }
  }
  return false;
}

async function main() {
  const allFiles = [...await walk(SRC), ...await walk(SERVER)];

  // Read all files
  const allContents = [];
  for (const file of allFiles) {
    const content = await readFile(file, 'utf8');
    allContents.push({ file: relative(ROOT, file), content });
  }

  // Extract all exports
  const allExports = [];
  for (const { file, content } of allContents) {
    const exports = extractExports(content, join(ROOT, file));
    allExports.push(...exports);
  }

  // Check each export
  const unused = [];
  const used = [];
  for (const exp of allExports) {
    const found = isImportedAnywhere(exp.name, allContents, exp.file);
    if (found) {
      used.push(exp);
    } else {
      unused.push(exp);
    }
  }

  // Group unused by file
  const byFile = {};
  for (const exp of unused) {
    if (!byFile[exp.file]) byFile[exp.file] = [];
    byFile[exp.file].push(exp.name);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ total: allExports.length, unused: unused.length, used: used.length, byFile }, null, 2));
    return;
  }

  console.log(`\n🔍 Dead Exports Report\n`);
  console.log(`Total exports scanned: ${allExports.length}`);
  console.log(`Used: ${used.length}  |  Potentially unused: ${unused.length}`);
  console.log('─'.repeat(60));

  const sortedFiles = Object.keys(byFile).sort((a, b) => byFile[b].length - byFile[a].length);
  for (const file of sortedFiles) {
    const names = byFile[file];
    console.log(`\n  ${file} (${names.length} unused):`);
    for (const name of names) {
      console.log(`    • ${name}`);
    }
  }

  if (unused.length === 0) {
    console.log('\n✅ No obviously unused exports found.');
  } else {
    console.log(`\n⚠️  ${unused.length} potentially unused export(s) across ${sortedFiles.length} file(s).`);
    console.log('   Review before removing — some may be used dynamically or by external consumers.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
