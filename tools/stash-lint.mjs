#!/usr/bin/env node
// tools/stash-lint.mjs
// Validate every brief in docs/notes/ has a clean Stash metadata block.
//
// Checks:
//   - Required keys present
//   - id is unique across all briefs
//   - verified is a real ISO date
//   - depends_on / coordinates_with / conflicts_with reference real ids
//
// Exit codes: 0 clean, 1 if any brief fails.

import { loadAllBriefs, REQUIRED_KEYS, TOUCH_KEYS } from './lib/stash-meta.mjs';

const briefs = loadAllBriefs();
const failures = [];
const ids = new Set();
const allIds = new Set();

for (const b of briefs) {
  if (b.meta?.id) allIds.add(b.meta.id);
}

for (const b of briefs) {
  const errs = [];
  if (!b.hasMetaBlock) {
    errs.push('missing Stash metadata YAML block');
    failures.push({ file: b.file, errs });
    continue;
  }
  const m = b.meta;
  if (m._parseError) errs.push(`YAML parse error: ${m._parseError}`);
  for (const k of REQUIRED_KEYS) {
    if (m[k] === undefined) errs.push(`missing required key: ${k}`);
  }
  if (m.id) {
    if (ids.has(m.id)) errs.push(`duplicate id: ${m.id}`);
    ids.add(m.id);
  }
  if (m.verified) {
    const d = new Date(m.verified);
    if (isNaN(d.getTime())) errs.push(`verified is not a valid date: ${m.verified}`);
  }
  if (m.touches) {
    if (typeof m.touches !== 'object' || Array.isArray(m.touches)) {
      errs.push('touches must be a map with client/server/submodules');
    } else {
      for (const k of TOUCH_KEYS) {
        if (m.touches[k] === undefined) errs.push(`touches.${k} missing (use [] if none)`);
      }
    }
  }
  for (const refKey of ['depends_on', 'coordinates_with', 'conflicts_with']) {
    const list = m[refKey];
    if (!Array.isArray(list)) continue;
    for (const ref of list) {
      if (!allIds.has(ref)) errs.push(`${refKey} references unknown id: ${ref}`);
    }
  }
  if (errs.length) failures.push({ file: b.file, errs });
}

console.log(`Lint: ${briefs.length} brief(s) checked.`);
if (failures.length === 0) {
  console.log('All clean.');
  process.exit(0);
}

console.log('');
for (const f of failures) {
  console.log(`✗ ${f.file}`);
  for (const e of f.errs) console.log(`    - ${e}`);
}
console.log('');
console.log(`${failures.length} brief(s) with issues.`);
process.exit(1);
