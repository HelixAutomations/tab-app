// server/operatorActions/validate-instructions.js
//
// Operator action: validate the markdown instruction files under
// `.github/instructions/`. Flags missing referenced files and stale
// dated references. Read-only filesystem scan. Parity with
// `node tools/validate-instructions.mjs`.

const fs = require('fs');
const path = require('path');
const { registerAction } = require('./registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const INSTRUCTIONS_DIR = path.join(REPO_ROOT, '.github', 'instructions');

const REFERENCE_PATTERNS = [
  /`(src\/[^`]+)`/g,
  /`(server\/[^`]+)`/g,
  /`(api\/[^`]+)`/g,
  /`(tools\/[^`]+)`/g,
];

function checkReferences(content, sourceFile, issues) {
  for (const pattern of REFERENCE_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const [, filePath] of matches) {
      const full = path.join(REPO_ROOT, filePath);
      if (!fs.existsSync(full)) {
        issues.push({ type: 'missing', file: filePath, referencedIn: sourceFile });
      }
    }
  }
}

function checkInstructionFile(filePath, issues) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);

  const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const refDate = new Date(dateMatch[1]);
    const daysSince = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      issues.push({
        type: 'stale',
        file: name,
        detail: `References date ${dateMatch[1]} (${Math.floor(daysSince)} days ago)`,
      });
    }
  }

  checkReferences(content, name, issues);
}

async function runValidateInstructions() {
  if (!fs.existsSync(INSTRUCTIONS_DIR)) {
    return {
      summary: 'No instructions directory found',
      warnings: [`Missing directory: ${INSTRUCTIONS_DIR}`],
      artefact: {
        kind: 'json',
        body: {
          type: 'validate-instructions',
          input: null,
          scope: 'workspace',
          recordset: [{ totalFiles: 0, issues: [] }],
        },
        downloadName: 'validate-instructions.json',
        mimeType: 'application/json',
        attachableTo: ['blob', 'asana'],
      },
    };
  }

  const files = fs.readdirSync(INSTRUCTIONS_DIR).filter((f) => f.endsWith('.md'));
  const issues = [];
  for (const file of files) {
    try {
      checkInstructionFile(path.join(INSTRUCTIONS_DIR, file), issues);
    } catch (err) {
      issues.push({ type: 'read-error', file, detail: err && err.message });
    }
  }

  const missing = issues.filter((i) => i.type === 'missing').length;
  const stale = issues.filter((i) => i.type === 'stale').length;
  const errors = issues.filter((i) => i.type === 'read-error').length;
  const summary = issues.length === 0
    ? `All ${files.length} instruction file(s) valid`
    : `${files.length} file(s) scanned: ${missing} missing reference(s), ${stale} stale date(s)${errors ? `, ${errors} read error(s)` : ''}`;

  return {
    summary,
    warnings: issues.length > 0 ? [`${issues.length} issue(s) found`] : undefined,
    artefact: {
      kind: 'json',
      body: {
        type: 'validate-instructions',
        input: null,
        scope: 'workspace',
        recordset: [{
          totalFiles: files.length,
          counts: { missing, stale, errors, total: issues.length },
          issues,
        }],
      },
      downloadName: 'validate-instructions.json',
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'validate-instructions',
  title: 'Validate instruction files',
  description: 'Scan `.github/instructions/*.md` for missing file references and stale dated references. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [],
  run: runValidateInstructions,
});

module.exports = { runValidateInstructions };
