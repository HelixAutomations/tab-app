import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const files = [
  'src/tabs/instructions/components/ClientLookupModal.tsx',
  'src/tabs/instructions/components/RelatedClientsSection.tsx',
  'src/tabs/matters/MatterOverview.tsx',
];

let eslintEntry;
try {
  const eslintPackageJson = require.resolve('eslint/package.json');
  eslintEntry = path.join(path.dirname(eslintPackageJson), 'bin', 'eslint.js');
} catch (error) {
  console.error(`Failed to resolve eslint entry point: ${error.message}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [eslintEntry, ...files, '--format', 'json'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: false,
});

if (result.error) {
  console.error(`Failed to run eslint: ${result.error.message}`);
  process.exit(1);
}

if (result.status === null) {
  console.error('Eslint did not return an exit code.');
  process.exit(1);
}

const rawOutput = (result.stdout || '').trim();

if (!rawOutput) {
  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    console.error(`Eslint exited with code ${result.status}.`);
    process.exit(result.status || 1);
  }
  console.log('Deploy warning summary: no issues in tracked files.');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(rawOutput);
} catch (error) {
  console.error('Failed to parse eslint JSON output.');
  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }
  console.error(rawOutput);
  process.exit(1);
}

const parseUnusedName = (message) => {
  const match = message.match(/'([^']+)'/);
  return match ? match[1] : message.replace(/\.$/, '');
};

const summarizeMessages = (ruleId, messages) => {
  if (ruleId === '@typescript-eslint/no-unused-vars') {
    return messages.map(({ message }) => parseUnusedName(message)).join(', ');
  }

  return messages
    .map(({ message }) => message.replace(/\.$/, ''))
    .join('; ');
};

const filesWithIssues = report.filter(
  (entry) => entry.warningCount > 0 || entry.errorCount > 0,
);

const totalWarnings = filesWithIssues.reduce((sum, entry) => sum + entry.warningCount, 0);
const totalErrors = filesWithIssues.reduce((sum, entry) => sum + entry.errorCount, 0);

if (!filesWithIssues.length) {
  console.log('Deploy warning summary: no issues in tracked files.');
  process.exit(0);
}

console.log(
  `Deploy warning summary: ${totalWarnings} warnings, ${totalErrors} errors across ${filesWithIssues.length} files.`,
);

for (const entry of filesWithIssues) {
  const relativePath = path.relative(repoRoot, entry.filePath).replace(/\\/g, '/');
  console.log(`\n${relativePath} (${entry.warningCount} warnings${entry.errorCount ? `, ${entry.errorCount} errors` : ''})`);

  const grouped = new Map();
  for (const message of entry.messages) {
    const key = message.ruleId || 'unknown';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(message);
  }

  for (const [ruleId, messages] of grouped) {
    console.log(`- ${ruleId}: ${summarizeMessages(ruleId, messages)}`);
  }
}

if (result.stderr?.trim()) {
  console.error(`\n${result.stderr.trim()}`);
}

process.exit(totalErrors > 0 ? 1 : 0);