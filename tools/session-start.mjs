#!/usr/bin/env node
// tools/session-start.mjs
// Run at the start of every agent session. Ensures context is fresh.

import { execSync } from 'child_process';

const ROOT = process.cwd();

function run(cmd) {
  try {
    execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('═'.repeat(50));
  console.log('  HELIX HUB - Session Start');
  console.log('═'.repeat(50));
  console.log();

  // 1. Sync context
  console.log('1. Syncing context...');
  run('node tools/sync-context.mjs');

  // 2. Check submodules
  console.log('\n2. Checking submodules (read-only)...');
  run('node tools/update-submodules.mjs');

  // 3. Validate instructions
  console.log('\n3. Validating instruction files...');
  run('node tools/validate-instructions.mjs');

  // 4. Summary
  console.log('\n' + '═'.repeat(50));
  console.log('  Ready. Read .github/instructions/REALTIME_CONTEXT.md');
  console.log('═'.repeat(50));
}

main();
