#!/usr/bin/env node
// tools/validate-instructions.mjs
// Validates chat customization files and concrete instruction references.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const GITHUB_DIR = path.join(ROOT, '.github');
const INSTRUCTIONS_DIR = path.join(ROOT, '.github', 'instructions');
const PROMPTS_DIR = path.join(ROOT, '.github', 'prompts');
const AGENTS_DIR = path.join(ROOT, '.github', 'agents');
const COPILOT_INSTRUCTIONS = path.join(ROOT, '.github', 'copilot-instructions.md');
const ISSUES = [];

const CONCRETE_PATH_PREFIXES = [
  '.github/',
  'api/',
  'data/',
  'docs/',
  'logs/',
  'public/',
  'server/',
  'src/',
  'templates/',
  'tools/',
];

const PLACEHOLDER_PATH_MARKERS = [
  '*',
  '<',
  '>',
  '{',
  '}',
  '...',
  'Xxx',
  'xxx',
];

const PLACEHOLDER_TEXT_RE = /Describe what this custom agent does|Define what this custom agent does|The inputs this agent expects|TODO\b|TBD\b/i;

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function rel(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function addIssue(level, type, file, detail) {
  ISSUES.push({ level, type, file, detail });
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(predicate)
    .map((file) => path.join(dir, file));
}

function hasFrontmatter(content) {
  return /^---\s*\r?\n/.test(content);
}

function frontmatterBlock(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : '';
}

function frontmatterValue(content, key) {
  const block = frontmatterBlock(content);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '').trim();
}

function isPlaceholder(value) {
  return PLACEHOLDER_TEXT_RE.test(value || '');
}

function isConcreteReference(rawRef) {
  const cleaned = rawRef.trim();
  if (!cleaned) return false;
  if (/^(https?:|mailto:|#)/i.test(cleaned)) return false;
  if (PLACEHOLDER_PATH_MARKERS.some((marker) => cleaned.includes(marker))) return false;
  if (cleaned.endsWith('/')) return false;
  return true;
}

function normalizeReference(rawRef, sourceFile) {
  let refPath = rawRef
    .split('#')[0]
    .split('?')[0]
    .trim()
    .replace(/[),.;:]+$/g, '')
    .replace(/\\/g, '/');

  if (!isConcreteReference(refPath)) return null;

  if (refPath.startsWith('./') || refPath.startsWith('../')) {
    const sourceDir = path.dirname(sourceFile);
    const absolute = path.resolve(sourceDir, refPath);
    const repoRelative = rel(absolute);
    return CONCRETE_PATH_PREFIXES.some((prefix) => repoRelative.startsWith(prefix))
      ? repoRelative
      : null;
  }

  return CONCRETE_PATH_PREFIXES.some((prefix) => refPath.startsWith(prefix))
    ? refPath
    : null;
}

function isPlannedReferenceLine(line) {
  const text = line.trim();
  if (/-\s*\[\s\]/.test(text)) return true;
  return /\b(New file|Create .*file|Extract .*component|Extract .*hook|future|parked|worth a stash|pending|not started|to be created)\b/i.test(text);
}

function checkFileExists(filePath, referencedIn, lineNumber) {
  const full = path.join(ROOT, filePath.replace(/\//g, path.sep));
  if (!fs.existsSync(full)) {
    const lineDetail = lineNumber ? ` on line ${lineNumber}` : '';
    addIssue('warn', 'missing-reference', referencedIn, `${filePath} does not exist${lineDetail}`);
  }
}

function scanForReferences(content, sourceFile) {
  const patterns = [
    /`((?:\.github|api|data|docs|logs|public|server|src|templates|tools)\/[^`]+)`/g,
    /\[[^\]]+\]\(((?:\.\/|\.\.\/|\.github\/|api\/|data\/|docs\/|logs\/|public\/|server\/|src\/|templates\/|tools\/)[^)#?]+)(?:[#?][^)]*)?\)/g,
  ];

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isPlannedReferenceLine(line)) continue;
    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const [, filePath] of matches) {
        const normalized = normalizeReference(filePath, path.join(ROOT, sourceFile));
        if (normalized) checkFileExists(normalized, sourceFile, index + 1);
      }
    }
  }
}

function checkPromptFile(filePath) {
  const content = read(filePath);
  const file = rel(filePath);
  if (!hasFrontmatter(content)) {
    addIssue('error', 'frontmatter', file, 'Prompt files need YAML frontmatter with a description.');
  }
  const description = frontmatterValue(content, 'description');
  if (!description) {
    addIssue('error', 'description', file, 'Missing prompt description.');
  } else if (isPlaceholder(description)) {
    addIssue('error', 'placeholder', file, 'Prompt description still looks like placeholder text.');
  }
  if (isPlaceholder(content)) {
    addIssue('error', 'placeholder', file, 'Prompt body contains placeholder or TODO wording.');
  }
}

function checkAgentFile(filePath) {
  const content = read(filePath);
  const file = rel(filePath);
  if (!hasFrontmatter(content)) {
    addIssue('error', 'frontmatter', file, 'Agent files need YAML frontmatter.');
  }
  const name = frontmatterValue(content, 'name');
  const description = frontmatterValue(content, 'description');
  if (!name) addIssue('error', 'name', file, 'Missing agent name.');
  if (!description) {
    addIssue('error', 'description', file, 'Missing agent description.');
  } else if (isPlaceholder(description)) {
    addIssue('error', 'placeholder', file, 'Agent description still looks like placeholder text.');
  }
  if (isPlaceholder(content)) {
    addIssue('error', 'placeholder', file, 'Agent body contains placeholder or TODO wording.');
  }
}

function checkInstructionCustomization(filePath) {
  const content = read(filePath);
  const file = rel(filePath);
  if (!hasFrontmatter(content)) {
    addIssue('error', 'frontmatter', file, 'Instruction customization files need YAML frontmatter.');
  }
  const applyTo = frontmatterValue(content, 'applyTo');
  if (!applyTo) {
    addIssue('error', 'applyTo', file, 'Missing applyTo pattern.');
  } else if (applyTo === '**') {
    addIssue('warn', 'broad-applyTo', file, 'applyTo "**" is always loaded. Keep only if this is truly cross-cutting.');
  }
}

function checkCopilotInstructions() {
  if (!fs.existsSync(COPILOT_INSTRUCTIONS)) return;
  const content = read(COPILOT_INSTRUCTIONS);
  const file = rel(COPILOT_INSTRUCTIONS);
  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > 700) {
    addIssue('warn', 'large-always-on-context', file, `${lineCount} lines. Consider moving stable reference material into narrower instruction files.`);
  }
}

function checkReferenceDocs() {
  const docs = listFiles(INSTRUCTIONS_DIR, (file) => file.endsWith('.md'));
  for (const doc of docs) {
    scanForReferences(read(doc), rel(doc));
  }
}

function run() {
  console.log('Validating chat customizations and instruction references...\n');

  if (!fs.existsSync(GITHUB_DIR)) {
    console.log('No .github directory found.');
    return;
  }

  checkCopilotInstructions();

  for (const file of listFiles(INSTRUCTIONS_DIR, (name) => name.endsWith('.instructions.md'))) {
    checkInstructionCustomization(file);
  }

  for (const file of listFiles(PROMPTS_DIR, (name) => name.endsWith('.prompt.md'))) {
    checkPromptFile(file);
  }

  for (const file of listFiles(AGENTS_DIR, (name) => name.endsWith('.agent.md'))) {
    checkAgentFile(file);
  }

  checkReferenceDocs();

  if (ISSUES.length === 0) {
    console.log('[ok] All chat customizations valid');
    return;
  }

  const errors = ISSUES.filter((issue) => issue.level === 'error');
  const warnings = ISSUES.filter((issue) => issue.level === 'warn');
  console.log(`Found ${ISSUES.length} issues: ${errors.length} error(s), ${warnings.length} warning(s)\n`);

  for (const issue of ISSUES) {
    console.log(`  [${issue.level}] ${issue.file}: ${issue.detail} (${issue.type})`);
  }

  if (errors.length > 0) process.exitCode = 1;
}

run();
