#!/usr/bin/env node
// tools/sync-context.mjs
// Generates real-time context for agents. Run on session start or periodically.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, '.github', 'instructions', 'REALTIME_CONTEXT.md');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT }).trim();
  } catch {
    return null;
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

function generate() {
  const now = new Date().toISOString();
  const git = getGitState();
  const submodules = getSubmoduleState();
  const servers = getServerState();
  const recentFiles = getRecentChanges();

  let md = `# Realtime Context\n\nAuto-generated: ${now}\n\n## Git State\n\n- **Branch**: ${git.branch || 'unknown'}\n- **Uncommitted changes**: ${git.uncommitted}\n- **Last commit**: ${git.lastCommit || 'none'}\n\n## Submodules\n\n| Name | Path | Branch | Last Commit |\n|------|------|--------|-------------|\n`;

  for (const sub of submodules) {
    md += `| ${sub.name} | ${sub.path} | ${sub.branch || '-'} | ${sub.lastCommit || '-'} |\n`;
  }

  md += `\n## Local Servers\n\n| Port | Status |\n|------|--------|\n`;
  for (const s of servers) {
    md += `| ${s.port} | ${s.active ? '🟢 Active' : '⚫ Inactive'} |\n`;
  }

  md += `\n## Recent Changes (last 5 commits)\n\n`;
  for (const f of recentFiles) {
    md += `- ${f}\n`;
  }

  md += `\n---\n*Run \`node tools/sync-context.mjs\` to refresh*\n`;

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, md);
  console.log(`Context synced → ${OUTPUT}`);
}

generate();
