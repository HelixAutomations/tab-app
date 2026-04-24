// tools/lib/stash-meta.mjs
// Shared loader + parser for stash brief metadata blocks.
// Briefs live in docs/notes/*.md and contain a YAML block under "Stash metadata".

import fs from 'fs';
import path from 'path';

export const NOTES_DIR = 'docs/notes';
export const ARCHIVE_DIR = 'docs/notes/_archive';
export const TEMPLATE_FILE = 'docs/notes/_HANDOFF_TEMPLATE.md';
export const INDEX_FILE = 'docs/notes/INDEX.md';
export const REQUIRED_KEYS = ['id', 'verified', 'branch', 'touches', 'depends_on', 'coordinates_with', 'conflicts_with'];
export const TOUCH_KEYS = ['client', 'server', 'submodules'];

// Minimal YAML parser tailored to the metadata schema (flat keys, nested touches, string lists).
// Avoids adding a dependency. Not a general YAML parser.
export function parseMetaBlock(yaml) {
  const out = {};
  const lines = yaml.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;
  let currentMap = null;
  let mapKey = null;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const indent = raw.match(/^(\s*)/)[1].length;
    const line = raw.trim();

    if (indent === 0) {
      currentList = null;
      currentMap = null;
      mapKey = null;
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
      if (!m) continue;
      const [, key, valRaw] = m;
      const val = stripInlineComment(valRaw);
      currentKey = key;
      if (val === '' || val === '|') {
        // Block — could be list or map; defer.
        out[key] = null;
      } else if (val === '[]') {
        out[key] = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        out[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        out[key] = stripQuotes(val);
      }
    } else if (indent === 2) {
      // Either "- item" (list) or "key:" (map under currentKey)
      if (line.startsWith('- ')) {
        if (out[currentKey] === null || !Array.isArray(out[currentKey])) {
          out[currentKey] = [];
        }
        out[currentKey].push(stripQuotes(line.slice(2).trim()));
        currentList = out[currentKey];
      } else {
        const m = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
        if (!m) continue;
        const [, key, valRaw] = m;
        const val = stripInlineComment(valRaw);
        if (out[currentKey] === null || typeof out[currentKey] !== 'object' || Array.isArray(out[currentKey])) {
          out[currentKey] = {};
        }
        mapKey = key;
        if (val === '' || val === '|') {
          out[currentKey][key] = [];
        } else if (val === '[]') {
          out[currentKey][key] = [];
        } else if (val.startsWith('[') && val.endsWith(']')) {
          out[currentKey][key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        } else {
          out[currentKey][key] = stripQuotes(val);
        }
      }
    } else if (indent >= 4 && line.startsWith('- ')) {
      // List item under a map sub-key
      if (mapKey && out[currentKey] && typeof out[currentKey] === 'object') {
        if (!Array.isArray(out[currentKey][mapKey])) out[currentKey][mapKey] = [];
        out[currentKey][mapKey].push(stripQuotes(line.slice(2).trim()));
      }
    }
  }

  return out;
}

function stripQuotes(s) {
  s = stripInlineComment(s).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function stripInlineComment(s) {
  s = s.trim();
  // Strip "  # comment" (must have whitespace before #) — but not inside quoted strings
  if (s.startsWith('"') || s.startsWith("'")) return s;
  const m = s.match(/^([^#]*?)\s+#.*$/);
  return m ? m[1].trim() : s;
}

// Extract the Stash metadata YAML block from a brief markdown file.
// Looks for a ```yaml ... ``` block following a "Stash metadata" heading.
export function extractMetaBlock(markdown) {
  // Find "Stash metadata" heading first
  const headingIdx = markdown.search(/Stash metadata/i);
  if (headingIdx === -1) return null;
  const after = markdown.slice(headingIdx);
  const fenceMatch = after.match(/```ya?ml\s*\n([\s\S]*?)\n```/);
  if (!fenceMatch) return null;
  return fenceMatch[1];
}

export function loadAllBriefs(rootDir = process.cwd()) {
  const dir = path.join(rootDir, NOTES_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .filter(f => f !== 'INDEX.md' && !f.startsWith('_'));
  const briefs = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const content = fs.readFileSync(full, 'utf8');
    const yaml = extractMetaBlock(content);
    const brief = {
      file: path.relative(rootDir, full).replace(/\\/g, '/'),
      filename: f,
      hasMetaBlock: !!yaml,
      meta: yaml ? safeParse(yaml) : null,
      rawContent: content,
    };
    briefs.push(brief);
  }
  return briefs;
}

function safeParse(yaml) {
  try {
    return parseMetaBlock(yaml);
  } catch (e) {
    return { _parseError: e.message };
  }
}

// Compute days since a date string (YYYY-MM-DD).
export function daysSince(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = today.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Status enum
export const STATUS = {
  OPEN: '🟡',
  STALE: '⚪',
  DONE: '🟢',
  READY: '▶️',
};

export function statusFor(meta) {
  if (!meta) return STATUS.OPEN;
  if (meta.shipped === 'true' || meta.shipped === true) return STATUS.DONE;
  if (meta.stale === 'true' || meta.stale === true) return STATUS.STALE;
  const days = daysSince(meta.verified);
  if (days !== null && days > 30) return STATUS.STALE;
  return STATUS.OPEN;
}

// Submodule freshness: returns ageDays of REALTIME_CONTEXT.md, or null.
export function realtimeContextAgeDays(rootDir = process.cwd()) {
  const f = path.join(rootDir, '.github/instructions/REALTIME_CONTEXT.md');
  if (!fs.existsSync(f)) return null;
  const stat = fs.statSync(f);
  return daysSince(stat.mtime.toISOString().slice(0, 10));
}
