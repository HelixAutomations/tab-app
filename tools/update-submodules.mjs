#!/usr/bin/env node
// tools/update-submodules.mjs
// Submodules are read-only in this repo.
// This script DOES NOT fetch/pull/update submodules. It only reports status.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function run(cmd, cwd = ROOT) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function getSubmodules() {
  const gitmodules = path.join(ROOT, '.gitmodules');
  if (!fs.existsSync(gitmodules)) return [];

  const content = fs.readFileSync(gitmodules, 'utf8');
  const submodules = [];
  const regex = /\[submodule "([^"]+)"\][\s\S]*?path = ([^\n]+)[\s\S]*?url = ([^\n]+)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    submodules.push({
      name: match[1],
      path: match[2].trim(),
      url: match[3].trim()
    });
  }
  return submodules;
}

function updateSubmodule(sub) {
  const fullPath = path.join(ROOT, sub.path);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ✗ ${sub.name}: Path not found`);
    return null;
  }

  const branch = run('git branch --show-current', fullPath);
  const hash = run('git rev-parse HEAD', fullPath);
  const status = run('git status --porcelain', fullPath);
  const lines = status ? status.split('\n').filter(l => l.trim()) : [];
  const untracked = lines.filter(l => l.startsWith('??')).length;
  const modified = lines.length - untracked;

  return {
    name: sub.name,
    branch,
    untracked,
    modified,
    hash: hash?.slice(0, 7)
  };
}

function main() {
  console.log('Submodule status (read-only)...\n');

  const submodules = getSubmodules();
  if (submodules.length === 0) {
    console.log('No submodules found.');
    return;
  }

  const results = [];
  for (const sub of submodules) {
    const result = updateSubmodule(sub);
    if (result) results.push(result);
  }

  console.log('\nSubmodule Status:');
  console.log('─'.repeat(60));

  for (const r of results) {
    let status = '✓ Clean';
    if (r.modified > 0 && r.untracked > 0) status = `● ${r.modified} modified, ${r.untracked} untracked`;
    else if (r.modified > 0) status = `● ${r.modified} modified`;
    else if (r.untracked > 0) status = `● ${r.untracked} untracked`;

    console.log(`  ${r.name}`);
    console.log(`    Branch: ${r.branch || 'detached'} @ ${r.hash}`);
    console.log(`    Status: ${status}`);
  }

  const anyUntracked = results.some(r => r.untracked > 0);
  if (anyUntracked) {
    console.log('\nTip: hide noisy untracked files in submodules (recommended):');
    console.log('  git config submodule.ignore untracked');
  }

  // Regenerate context
  console.log('\nRegenerating context...');
  run('node tools/sync-context.mjs');
  console.log('Done.');
}

main();
