// server/utils/stashMeta.js
// Server-side mirror of tools/lib/stash-meta.mjs.
// Keeps the brief parser identical between CLI tools and the API.
// If you change the schema, update BOTH this file and tools/lib/stash-meta.mjs.

const fs = require('fs');
const path = require('path');

const NOTES_DIR = 'docs/notes';
const ARCHIVE_DIR = 'docs/notes/_archive';
const TEMPLATE_FILE = 'docs/notes/_HANDOFF_TEMPLATE.md';
const INDEX_FILE = 'docs/notes/INDEX.md';
const REQUIRED_KEYS = ['id', 'verified', 'branch', 'touches', 'depends_on', 'coordinates_with', 'conflicts_with'];
const TOUCH_KEYS = ['client', 'server', 'submodules'];

const STATUS = {
  OPEN: '🟡',
  STALE: '⚪',
  DONE: '🟢',
  READY: '▶️',
};

function stripInlineComment(s) {
  s = String(s).trim();
  if (s.startsWith('"') || s.startsWith("'")) return s;
  const m = s.match(/^([^#]*?)\s+#.*$/);
  return m ? m[1].trim() : s;
}

function stripQuotes(s) {
  s = stripInlineComment(s).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseMetaBlock(yaml) {
  const out = {};
  const lines = String(yaml || '').split(/\r?\n/);
  let currentKey = null;
  let mapKey = null;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const indent = raw.match(/^(\s*)/)[1].length;
    const line = raw.trim();

    if (indent === 0) {
      mapKey = null;
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
      if (!m) continue;
      const [, key, valRaw] = m;
      const val = stripInlineComment(valRaw);
      currentKey = key;
      if (val === '' || val === '|') {
        out[key] = null;
      } else if (val === '[]') {
        out[key] = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        out[key] = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        out[key] = stripQuotes(val);
      }
    } else if (indent === 2) {
      if (line.startsWith('- ')) {
        if (out[currentKey] === null || !Array.isArray(out[currentKey])) {
          out[currentKey] = [];
        }
        out[currentKey].push(stripQuotes(line.slice(2).trim()));
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
          out[currentKey][key] = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
        } else {
          out[currentKey][key] = stripQuotes(val);
        }
      }
    } else if (indent >= 4 && line.startsWith('- ')) {
      if (mapKey && out[currentKey] && typeof out[currentKey] === 'object') {
        if (!Array.isArray(out[currentKey][mapKey])) out[currentKey][mapKey] = [];
        out[currentKey][mapKey].push(stripQuotes(line.slice(2).trim()));
      }
    }
  }

  return out;
}

function extractMetaBlock(markdown) {
  const headingIdx = String(markdown || '').search(/Stash metadata/i);
  if (headingIdx === -1) return null;
  const after = markdown.slice(headingIdx);
  const fenceMatch = after.match(/```ya?ml\s*\n([\s\S]*?)\n```/);
  if (!fenceMatch) return null;
  return fenceMatch[1];
}

function safeParse(yaml) {
  try {
    return parseMetaBlock(yaml);
  } catch (e) {
    return { _parseError: e.message };
  }
}

function loadAllBriefs(rootDir = process.cwd()) {
  const dir = path.join(rootDir, NOTES_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => f !== 'INDEX.md' && !f.startsWith('_'));
  const briefs = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const content = fs.readFileSync(full, 'utf8');
    const yaml = extractMetaBlock(content);
    briefs.push({
      file: path.relative(rootDir, full).replace(/\\/g, '/'),
      filename: f,
      hasMetaBlock: !!yaml,
      meta: yaml ? safeParse(yaml) : null,
      rawContent: content,
    });
  }
  return briefs;
}

function daysSince(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = today.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function statusFor(meta) {
  if (!meta) return STATUS.OPEN;
  if (meta.shipped === 'true' || meta.shipped === true) return STATUS.DONE;
  if (meta.stale === 'true' || meta.stale === true) return STATUS.STALE;
  const days = daysSince(meta.verified);
  if (days !== null && days > 30) return STATUS.STALE;
  return STATUS.OPEN;
}

function realtimeContextAgeDays(rootDir = process.cwd()) {
  const f = path.join(rootDir, '.github/instructions/REALTIME_CONTEXT.md');
  if (!fs.existsSync(f)) return null;
  const stat = fs.statSync(f);
  return daysSince(stat.mtime.toISOString().slice(0, 10));
}

// Title helper — first H1 of the brief.
function titleFromContent(content, fallback) {
  const m = String(content || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// Render INDEX.md from current briefs (mirrors tools/stash-status.mjs).
function renderIndex(briefs) {
  const order = { [STATUS.READY]: 0, [STATUS.OPEN]: 1, [STATUS.STALE]: 2, [STATUS.DONE]: 3 };
  const rows = briefs
    .filter((b) => b.hasMetaBlock)
    .map((b) => {
      const status = statusFor(b.meta);
      return {
        status,
        title: titleFromContent(b.rawContent, b.filename),
        file: b.filename,
        id: (b.meta && b.meta.id) || '—',
        verified: (b.meta && b.meta.verified) || '—',
        age: daysSince(b.meta && b.meta.verified),
        coords: formatCoords(b.meta || {}),
        nextAction: nextActionFor(b.meta || {}, status),
      };
    })
    .sort((a, b) => {
      const oa = order[a.status] != null ? order[a.status] : 9;
      const ob = order[b.status] != null ? order[b.status] : 9;
      if (oa !== ob) return oa - ob;
      return (b.verified || '').localeCompare(a.verified || '');
    });

  const header = `# Stashed projects — index\n\nSingle source of truth for parked work. **This file is auto-generated** by \`tools/stash-status.mjs\` from the YAML metadata block in each brief. Edit the brief, not this file.\n\n**Status legend:** ${STATUS.OPEN} Open · ${STATUS.READY} Ready (newly unblocked, re-run dependency check) · ${STATUS.STALE} Stale (>30 days since \`verified\` — re-verify file/line refs) · ${STATUS.DONE} Done\n\n`;
  const tableHeader = `| Status | Title | id | Last verified | Coordinates / depends | Next action |\n|--------|-------|----|---------------|----------------------|-------------|\n`;
  const tableBody = rows.map((r) => {
    const ageNote = r.age !== null ? ` (${r.age}d)` : '';
    return `| ${r.status} | [${r.title}](${r.file}) | \`${r.id}\` | ${r.verified}${ageNote} | ${r.coords} | ${r.nextAction} |`;
  }).join('\n');
  const footer = `\n\n## Closure protocol\n\nWhen a brief is picked up and shipped:\n1. Confirm in your response that the brief was followed (or note deviations).\n2. Run \`node tools/stash-close.mjs <id>\` — marks brief shipped, moves to \`_archive/\`, re-runs dependency scan.\n3. Add a changelog entry referencing the brief id.\n\nSee [.github/instructions/STASHED_PROJECTS.md](../../.github/instructions/STASHED_PROJECTS.md) for the full protocol (triggers A–D, metadata schema, dependency-check algorithm).\n`;

  return header + tableHeader + tableBody + footer;
}

function formatCoords(meta) {
  const parts = [];
  if (meta.depends_on && meta.depends_on.length) parts.push(`depends_on: ${meta.depends_on.join(', ')}`);
  if (meta.coordinates_with && meta.coordinates_with.length) parts.push(`coordinates_with: ${meta.coordinates_with.join(', ')}`);
  if (meta.conflicts_with && meta.conflicts_with.length) parts.push(`⚠️ conflicts_with: ${meta.conflicts_with.join(', ')}`);
  return parts.length ? parts.join('; ') : '—';
}

function nextActionFor(meta, status) {
  if (status === STATUS.DONE) return 'Shipped';
  if (status === STATUS.STALE) return 'Re-verify file/line refs, then proceed';
  if (status === STATUS.READY) return 'Re-run precheck, then proceed';
  return meta.next_action || 'See brief §3 (Plan)';
}

// Rewrite INDEX.md from disk state.
function regenerateIndex(rootDir = process.cwd()) {
  const briefs = loadAllBriefs(rootDir);
  const output = renderIndex(briefs);
  fs.writeFileSync(path.join(rootDir, INDEX_FILE), output, 'utf8');
  return briefs.length;
}

module.exports = {
  NOTES_DIR,
  ARCHIVE_DIR,
  TEMPLATE_FILE,
  INDEX_FILE,
  REQUIRED_KEYS,
  TOUCH_KEYS,
  STATUS,
  parseMetaBlock,
  extractMetaBlock,
  loadAllBriefs,
  daysSince,
  statusFor,
  realtimeContextAgeDays,
  titleFromContent,
  renderIndex,
  regenerateIndex,
};
