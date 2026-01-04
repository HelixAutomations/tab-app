import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sigDir = path.join(__dirname, '../src/assets/signatures');

const results = {};
const dirs = fs.readdirSync(sigDir);

dirs.forEach(dir => {
  const file = path.join(sigDir, dir, `HelixSignature (${dir.toLowerCase()}@helix-law.com).htm`);
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    // Match the name line: <div...>Name<br>
    const match = content.match(/<div[^>]*?font[^>]*>[\n\s]*([A-Za-z\s\-']+)<br>/);
    if (match) {
      results[dir] = match[1].trim();
    }
  }
});

// Sort by initial
const sorted = Object.keys(results).sort();
console.log('\n=== SIGNATURE AUDIT ===\n');
sorted.forEach(init => {
  console.log(`${init.padEnd(5)} → ${results[init]}`);
});

// Check for duplicates
const nameToInitials = {};
const duplicates = [];
sorted.forEach(init => {
  const name = results[init];
  if (nameToInitials[name]) {
    duplicates.push({ name, initials: [nameToInitials[name], init] });
  } else {
    nameToInitials[name] = init;
  }
});

if (duplicates.length > 0) {
  console.log('\n=== DUPLICATES FOUND ===\n');
  duplicates.forEach(dup => {
    console.log(`❌ "${dup.name}" appears in: ${dup.initials.join(', ')}`);
  });
} else {
  console.log('\n✓ No duplicate names found');
}
