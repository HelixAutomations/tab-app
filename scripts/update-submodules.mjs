#!/usr/bin/env node
// scripts/update-submodules.mjs
// Fetches latest from all submodules and reports their state.

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
  const uncommitted = status ? status.split('\n').filter(l => l.trim()).length : 0;
  
  return {
    name: sub.name,
    branch,
    uncommitted,
    hash: hash?.slice(0, 7)
  };
}

function main() {
  console.log('Updating submodules...\n');
  
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
    if (r.uncommitted > 0) status = `● ${r.uncommitted} uncommitted`;
    
    console.log(`  ${r.name}`);
    console.log(`    Branch: ${r.branch || 'detached'} @ ${r.hash}`);
    console.log(`    Status: ${status}`);
  }
  
  // Regenerate context
  console.log('\nRegenerating context...');
  run('node scripts/sync-context.mjs');
  console.log('Done.');
}

main();
