import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractName(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/<div[^>]*?font[^>]*>[\n\s]*([A-Za-z\s\-']+)<br>/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const currentDir = path.join(__dirname, '../src/assets/signatures');
const v2Dir = path.join(__dirname, '../src/assets/signatures/v2');

const dirs = fs.readdirSync(currentDir).filter(d => fs.statSync(path.join(currentDir, d)).isDirectory());

console.log('\n=== SIGNATURE AUDIT: CURRENT vs V2 ===\n');

const issues = [];
const ok = [];

dirs.forEach(dir => {
  const currentFile = path.join(currentDir, dir, `HelixSignature (${dir.toLowerCase()}@helix-law.com).htm`);
  const v2File = path.join(v2Dir, dir, `HelixSignature (${dir.toLowerCase()}@helix-law.com).htm`);
  
  const currentName = extractName(currentFile);
  const v2Name = extractName(v2File);
  
  if (!v2Name) {
    console.log(`⚠️  ${dir.padEnd(5)} — No v2 version`);
    return;
  }
  
  if (currentName === v2Name) {
    ok.push(dir);
    console.log(`✓  ${dir.padEnd(5)} → ${v2Name}`);
  } else {
    issues.push({ init: dir, current: currentName, v2: v2Name });
    console.log(`❌ ${dir.padEnd(5)} MISMATCH:`);
    console.log(`     Current: ${currentName}`);
    console.log(`     V2:      ${v2Name}`);
  }
});

console.log(`\n=== SUMMARY ===`);
console.log(`✓ Correct: ${ok.length}`);
console.log(`❌ Mismatches: ${issues.length}\n`);

if (issues.length > 0) {
  console.log('Issues to fix:');
  issues.forEach(issue => {
    console.log(`  ${issue.init}: "${issue.current}" → "${issue.v2}"`);
  });
}
