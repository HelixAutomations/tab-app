const express = require('express');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

const router = express.Router();

/**
 * Whitelisted roots (relative to repo root) that can be scanned for the admin file map.
 * Keep this conservative to avoid exposing sensitive files.
 */
const ALLOWED_ROOTS = [
  "src",
  "api/src", 
  "decoupled-functions",
  "server",
  "database",
  "infra",
  "docs",
];

const DEFAULT_MAX_DEPTH = 3;

function isIgnored(name) {
  const lowered = name.toLowerCase();
  return (
    lowered === "node_modules" ||
    lowered === ".git" ||
    lowered === ".azure" ||
    lowered === ".vscode" ||
    lowered === "build" ||
    lowered === "dist" ||
    lowered.endsWith(".tsbuildinfo") ||
    lowered.endsWith(".log")
  );
}

async function safeStat(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function listDirRecursive(absDir, relPath, maxDepth, usedSet) {
  let items;
  try {
    items = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];

  for (const d of items) {
    if (isIgnored(d.name)) continue;

    const nextAbs = path.join(absDir, d.name);
    const nextRel = path.posix.join(relPath.replace(/\\/g, "/"), d.name);

    if (d.isDirectory()) {
      const children = maxDepth > 0 ? await listDirRecursive(nextAbs, nextRel, maxDepth - 1, usedSet) : [];
      // A directory is considered used if ANY descendant is used.
      const dirUsed = children.some(ch => ch.used === true);
      results.push({ name: d.name, path: nextRel, kind: "dir", used: dirUsed, children });
    } else if (d.isFile()) {
      const st = await safeStat(nextAbs);
      const used = usedSet ? usedSet.has(path.resolve(nextAbs)) : false;
      results.push({ name: d.name, path: nextRel, kind: "file", size: st?.size, used });
    }
  }
  return results;
}

function getRepoRoot() {
  // server routes run from server/; repo root is one level up
  return path.resolve(__dirname, "..", "..");
}

async function buildFileMap(roots, depth) {
  const repoRoot = getRepoRoot();
  // building file map
  
  const payload = [];

  // Build a set of used (reachable) files across key entrypoints
  const usedSet = buildUsedFilesSet(repoRoot);

  for (const r of roots) {
  // processing root
    if (!ALLOWED_ROOTS.includes(r)) {
      console.warn(`[buildFileMap] REJECTED root ${r}`);
      continue;
    }
    const absRoot = path.join(repoRoot, r);
  // absolute path log removed
    const st = await safeStat(absRoot);
    if (!st || !st.isDirectory()) {
      console.warn(`[buildFileMap] Root not a dir: ${absRoot}`);
      continue;
    }
  // scanning directory
    const entries = await listDirRecursive(absRoot, r, depth, usedSet);
  // entries found
    payload.push({ root: r, entries });
  }

  // final payload size
  return { ok: true, roots: payload };
}

function fileExists(p) {
  try { return fssync.existsSync(p); } catch { return false; }
}

function resolveImport(baseFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // only local
  const baseDir = path.dirname(baseFile);
  const target = path.resolve(baseDir, spec);
  const tryPaths = [
    target,
    `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.jsx`, `${target}.json`,
    path.join(target, 'index.ts'), path.join(target, 'index.tsx'), path.join(target, 'index.js'), path.join(target, 'index.jsx')
  ];
  for (const p of tryPaths) {
    if (fileExists(p)) return p;
  }
  return null;
}

function readText(p) {
  try { return fssync.readFileSync(p, 'utf8'); } catch { return ''; }
}

function extractImports(code) {
  const specs = new Set();
  const importRe = /import\s+[^'"\n]*['"]([^'"\n]+)['"]/g;
  const fromRe = /from\s+['"]([^'"\n]+)['"]/g;
  const reqRe = /require\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const dynRe = /import\(\s*['"]([^'"\n]+)['"]\s*\)/g; // dynamic import()
  let m;
  while ((m = importRe.exec(code))) specs.add(m[1]);
  while ((m = fromRe.exec(code))) specs.add(m[1]);
  while ((m = reqRe.exec(code))) specs.add(m[1]);
  while ((m = dynRe.exec(code))) specs.add(m[1]);
  return Array.from(specs);
}

function buildUsedFilesSet(repoRoot) {
  const entryCandidates = [
    // Frontend
    path.join(repoRoot, 'src', 'index.tsx'),
    path.join(repoRoot, 'src', 'index.ts'),
    path.join(repoRoot, 'src', 'index.jsx'),
    path.join(repoRoot, 'src', 'index.js'),
    path.join(repoRoot, 'src', 'main.tsx'),
    path.join(repoRoot, 'src', 'main.ts'),
    // Server
    path.join(repoRoot, 'server', 'index.js'),
    path.join(repoRoot, 'server', 'server.js'),
    path.join(repoRoot, 'server.js'),
    // Azure Functions TS
    path.join(repoRoot, 'api', 'src', 'index.ts'),
    // Decoupled functions (optional)
    path.join(repoRoot, 'decoupled-functions', 'index.js')
  ];
  const entries = entryCandidates.filter(fileExists);
  const used = new Set(entries.map(p => path.resolve(p)));
  const queue = [...used];
  const seen = new Set(queue);

  while (queue.length) {
    const file = queue.pop();
    const code = readText(file);
    if (!code) continue;
    const specs = extractImports(code);
    for (const s of specs) {
      const resolved = resolveImport(file, s);
      if (!resolved) continue;
      const abs = path.resolve(resolved);
      if (!seen.has(abs)) {
        seen.add(abs);
        used.add(abs);
        // Only traverse source files
        if (/\.(tsx?|jsx?)$/i.test(abs)) {
          queue.push(abs);
        }
      }
    }
  }

  return used;
}

// GET /api/getFileMap
router.get('/', async (req, res) => {
  // fileMap route hit
  
  try {
    // Query params: roots=csv, depth=number
    const rootsParam = req.query.roots;
    const depthParam = req.query.depth;
    const requestedRoots = rootsParam ? 
      rootsParam.split(",").map(s => s.trim()).filter(Boolean) : 
      ALLOWED_ROOTS.slice(0, 3);
    const depth = depthParam ? 
      Math.max(0, Math.min(5, Number(depthParam))) : 
      DEFAULT_MAX_DEPTH;
    
  // requested roots/depth

    const result = await buildFileMap(requestedRoots, Number.isFinite(depth) ? depth : DEFAULT_MAX_DEPTH);
    
  // result prepared
    
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.json(result);
  } catch (err) {
    console.error('🗂️ [fileMap] ERROR:', err);
    res.status(500).json({ ok: false, message: 'Internal Server Error' });
  }
});

// Handle OPTIONS for CORS
router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

module.exports = router;