#!/usr/bin/env node
// tools/sync-context.mjs
// Generates real-time context for agents. Run on session start or periodically.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, '.github', 'instructions', 'REALTIME_CONTEXT.md');
const SYNC_CHOICE_ARG = process.argv.find((arg) => arg.startsWith('--sync-choice='));

const SUBMODULE_TRACKED_BRANCHES = {
  'submodules/instruct-pitch': 'workspace',
  'submodules/enquiry-processing-v2': 'facebook-lead-processing',
};

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return null;
  }
}

function runResult(cmd, cwd = ROOT) {
  try {
    const outputText = execSync(cmd, { encoding: 'utf8', cwd }).trim();
    return { ok: true, output: outputText };
  } catch {
    return { ok: false, output: '' };
  }
}

function getGitState() {
  const branch = run('git branch --show-current');
  const status = run('git status --porcelain');
  const lastCommit = run('git log -1 --format="%h %s" 2>nul');
  const uncommitted = status ? status.split('\n').length : 0;
  return { branch, uncommitted, lastCommit };
}

function getSubmoduleState() {
  const submodules = [];
  const gitmodules = path.join(ROOT, '.gitmodules');
  if (!fs.existsSync(gitmodules)) return submodules;

  const content = fs.readFileSync(gitmodules, 'utf8');
  const matches = content.matchAll(/\[submodule "([^"]+)"\][\s\S]*?path = ([^\n]+)/g);

  for (const [, name, subPath] of matches) {
    const fullPath = path.join(ROOT, subPath.trim());
    if (fs.existsSync(fullPath)) {
      const branch = run(`git -C "${fullPath}" branch --show-current`);
      const lastCommit = run(`git -C "${fullPath}" log -1 --format="%h %s" 2>nul`);
      submodules.push({ name, path: subPath.trim(), branch, lastCommit });
    }
  }
  return submodules;
}

function refreshSubmoduleContext(submodules) {
  const results = [];

  for (const sub of submodules) {
    const trackedBranch = SUBMODULE_TRACKED_BRANCHES[sub.path] || sub.branch;

    if (!trackedBranch || trackedBranch === 'HEAD') {
      results.push({
        path: sub.path,
        branch: trackedBranch || '-',
        status: 'skipped',
        detail: 'No tracked branch configured',
      });
      continue;
    }

    const submoduleRoot = path.join(ROOT, sub.path);
    const beforeCommit = run(`git -C "${submoduleRoot}" rev-parse --short HEAD`) || '-';

    const fetch = runResult(`git -C "${submoduleRoot}" fetch origin ${trackedBranch}`);
    const checkout = runResult(`git -C "${submoduleRoot}" checkout ${trackedBranch}`);
    const pull = runResult(`git -C "${submoduleRoot}" pull --ff-only origin ${trackedBranch}`);
    const afterCommit = run(`git -C "${submoduleRoot}" rev-parse --short HEAD`) || '-';

    if (!fetch.ok || !checkout.ok || !pull.ok) {
      results.push({
        path: sub.path,
        branch: trackedBranch,
        status: 'failed',
        detail: 'Fetch/pull failed',
        beforeCommit,
        afterCommit,
      });
      continue;
    }

    const changed = beforeCommit !== afterCommit;
    results.push({
      path: sub.path,
      branch: trackedBranch,
      status: changed ? 'updated' : 'unchanged',
      detail: changed ? `${beforeCommit} -> ${afterCommit}` : 'Already latest',
      beforeCommit,
      afterCommit,
    });
  }

  return results;
}

async function shouldSyncSubmodules(submodules) {
  if (!submodules.length) return { selectedSubmodules: [], checkOnly: false };

  const argChoice = SYNC_CHOICE_ARG ? SYNC_CHOICE_ARG.split('=')[1].trim().toLowerCase() : '';
  if (argChoice) {
    if (argChoice === 'none' || argChoice === '0') return { selectedSubmodules: [], checkOnly: false };
    if (argChoice === 'all' || argChoice === '1') return { selectedSubmodules: submodules, checkOnly: false };
    if (argChoice === 'check' || argChoice === 'status' || argChoice === '4') {
      return { selectedSubmodules: [], checkOnly: true };
    }

    const match = submodules.find((sub) => {
      const shortName = sub.path.replace('submodules/', '').toLowerCase();
      return sub.path.toLowerCase() === argChoice || shortName === argChoice;
    });
    return { selectedSubmodules: match ? [match] : [], checkOnly: false };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { selectedSubmodules: [], checkOnly: false };
  }

  const rl = readline.createInterface({ input, output });
  console.log('Submodule sync choice (required each run):');
  console.log('  0) No sync');
  console.log('  1) Sync all submodules');
  console.log('  2) Sync instruct-pitch only');
  console.log('  3) Sync enquiry-processing-v2 only');
  console.log('  4) Check current position first (no sync)');

  const selection = await rl.question('Pick one option number: ');
  rl.close();

  const normalized = selection.trim();
  if (normalized === '1') {
    return { selectedSubmodules: submodules, checkOnly: false };
  }

  if (normalized === '0' || normalized === '') {
    return { selectedSubmodules: [], checkOnly: false };
  }

  if (normalized === '4') {
    return { selectedSubmodules: [], checkOnly: true };
  }

  if (normalized === '2') {
    const match = submodules.find((sub) => sub.path === 'submodules/instruct-pitch');
    return { selectedSubmodules: match ? [match] : [], checkOnly: false };
  }

  if (normalized === '3') {
    const match = submodules.find((sub) => sub.path === 'submodules/enquiry-processing-v2');
    return { selectedSubmodules: match ? [match] : [], checkOnly: false };
  }

  return { selectedSubmodules: [], checkOnly: false };
}

function printCurrentPosition(git, submodules) {
  console.log('Current position check:');
  console.log(`- Parent branch: ${git.branch || 'unknown'}`);
  console.log(`- Parent uncommitted changes: ${git.uncommitted}`);
  for (const sub of submodules) {
    console.log(`- ${sub.path}: branch=${sub.branch || '-'} commit=${sub.lastCommit || '-'}`);
  }
}

function printSubmoduleSummary(selectedSubmodules, syncResults) {
  if (!selectedSubmodules.length) {
    console.log('Submodule sync skipped.');
    console.log('After this: rerun sync-context and pick a sync option when prompted.');
    return;
  }

  console.log('Submodule sync summary:');
  console.log(`- Selected: ${selectedSubmodules.map((sub) => sub.path).join(', ')}`);
  for (const result of syncResults) {
    console.log(`- ${result.path}: ${result.status} (${result.detail})`);
  }

  const pointerChanges = run('git status --short -- submodules');
  if (pointerChanges) {
    console.log('After this: parent repo now shows submodule pointer changes in git status.');
  } else {
    console.log('After this: no parent submodule pointer changes detected.');
  }
}

function getServerState() {
  const ports = [3000, 7071, 53000];
  const results = [];
  for (const port of ports) {
    const listening = run(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`);
    results.push({ port, active: !!listening });
  }
  return results;
}

function getRecentChanges() {
  const files = run('git diff --name-only HEAD~5 2>nul');
  return files ? files.split('\n').slice(0, 20) : [];
}

async function generate() {
  const now = new Date().toISOString();
  const git = getGitState();
  let submodules = getSubmoduleState();
  const { selectedSubmodules, checkOnly } = await shouldSyncSubmodules(submodules);
  const didSyncSubmodules = selectedSubmodules.length > 0;
  const syncResults = didSyncSubmodules ? refreshSubmoduleContext(selectedSubmodules) : [];
  if (didSyncSubmodules) {
    submodules = getSubmoduleState();
  }
  const servers = getServerState();
  const recentFiles = getRecentChanges();

  let md = `# Realtime Context\n\nAuto-generated: ${now}\n\n## Git State\n\n- **Branch**: ${git.branch || 'unknown'}\n- **Uncommitted changes**: ${git.uncommitted}\n- **Last commit**: ${git.lastCommit || 'none'}\n\n## Submodules\n\n| Name | Path | Branch | Last Commit |\n|------|------|--------|-------------|\n`;

  for (const sub of submodules) {
    md += `| ${sub.name} | ${sub.path} | ${sub.branch || '-'} | ${sub.lastCommit || '-'} |\n`;
  }

  if (didSyncSubmodules) {
    md += `\n### Submodule Sync\n\n| Path | Tracked Branch | Result | Detail |\n|------|----------------|--------|--------|\n`;
    for (const result of syncResults) {
      md += `| ${result.path} | ${result.branch} | ${result.status} | ${result.detail.replace(/\|/g, '\\|')} |\n`;
    }
    md += `\n`; 
  } else {
    md += `\n### Submodule Sync\n\n- Not run in this refresh.\n\n`;
  }

  md += `\n## Local Servers\n\n| Port | Status |\n|------|--------|\n`;
  for (const s of servers) {
    md += `| ${s.port} | ${s.active ? '🟢 Active' : '⚫ Inactive'} |\n`;
  }

  md += `\n## Recent Changes (last 5 commits)\n\n`;
  for (const f of recentFiles) {
    md += `- ${f}\n`;
  }

  md += `\n---\n*Run \`node tools/sync-context.mjs\` to refresh (you will be asked each run whether to sync submodules)*\n`;

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, md);
  console.log(`Context synced → ${OUTPUT}`);
  if (checkOnly) {
    printCurrentPosition(git, submodules);
    console.log('After this: pick 1/2/3 next run to sync selected submodule context.');
  }
  printSubmoduleSummary(selectedSubmodules, syncResults);
}

await generate();
