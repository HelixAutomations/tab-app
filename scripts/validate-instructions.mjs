#!/usr/bin/env node
// scripts/validate-instructions.mjs
// Validates instruction files are current and consistent. Flags stale references.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const INSTRUCTIONS_DIR = path.join(ROOT, '.github', 'instructions');
const ISSUES = [];

function checkFileExists(filePath, referencedIn) {
  const full = path.join(ROOT, filePath);
  if (!fs.existsSync(full)) {
    ISSUES.push({ type: 'missing', file: filePath, referencedIn });
  }
}

function scanForReferences(content, sourceFile) {
  // Find file references like `src/something.ts` or `server/routes/x.js`
  const patterns = [
    /`(src\/[^`]+)`/g,
    /`(server\/[^`]+)`/g,
    /`(api\/[^`]+)`/g,
    /`(scripts\/[^`]+)`/g,
  ];
  
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const [, filePath] of matches) {
      checkFileExists(filePath, sourceFile);
    }
  }
}

function checkInstructionFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);
  
  // Check for stale date references
  const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const refDate = new Date(dateMatch[1]);
    const daysSince = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      ISSUES.push({ type: 'stale', file: name, detail: `References date ${dateMatch[1]} (${Math.floor(daysSince)} days ago)` });
    }
  }
  
  scanForReferences(content, name);
}

function run() {
  console.log('Validating instruction files...\n');
  
  if (!fs.existsSync(INSTRUCTIONS_DIR)) {
    console.log('No instructions directory found.');
    return;
  }
  
  const files = fs.readdirSync(INSTRUCTIONS_DIR).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    checkInstructionFile(path.join(INSTRUCTIONS_DIR, file));
  }
  
  if (ISSUES.length === 0) {
    console.log('✓ All instruction files valid');
  } else {
    console.log(`Found ${ISSUES.length} issues:\n`);
    for (const issue of ISSUES) {
      if (issue.type === 'missing') {
        console.log(`  ✗ Missing file: ${issue.file} (referenced in ${issue.referencedIn})`);
      } else if (issue.type === 'stale') {
        console.log(`  ⚠ Stale: ${issue.file} - ${issue.detail}`);
      }
    }
  }
}

run();
