// server/routes/dev-console.js
// Dev-owner read-only summary for the System > Forge lens.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { loadAllBriefs, statusFor, daysSince, titleFromContent, STATUS } = require('../utils/stashMeta');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const access = require('../utils/access');
const { ASANA_BASE_URL, ASANA_WORKSPACE_ID, ASANA_TECH_AUTOMATIONS_PROJECT_ID, resolveAsanaAccessToken } = require('../utils/asana');
const { inspectTask: inspectAsanaTask, extractAsanaTaskGid } = require('../utils/asanaTasks');
const { listActions } = require('../operatorActions/registry');

require('../operatorActions/person-lookup');
require('../operatorActions/passcode-lookup');
require('../operatorActions/enquiry-lookup');
require('../operatorActions/deal-lookup');
require('../operatorActions/instruction-lookup');
require('../operatorActions/dataops-recent');
require('../operatorActions/prospect-lookup');
require('../operatorActions/pipeline-lookup');
require('../operatorActions/ccl-lookup');
require('../operatorActions/tiller-verify');
require('../operatorActions/validate-instructions');
require('../operatorActions/matter-oneoff-replay');
require('../operatorActions/asana-task-inspector');

const router = express.Router();
const GENERATED_MARKER = 'AUTO-GENERATED - do not edit.';

const CATEGORY_KEYWORDS = {
  fix: /\bfix(ed|es|ing)?\b|\bbug\b|\bpatch\b|\bharden(ed|ing)?\b|\bfallback\b|\bstabil/i,
  ops: /\btelemetry\b|\bapp\s*insights\b|\bscheduler\b|\bdeploy\b|\bops\b|\bmigrat/i,
  improvement: /\boptimis|refactor|clean|performance|simplif|redesign|improv|enrich|enhanc|inline|converge|consolidat/i,
};

function isDevOwner(req) {
  const initials = String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
  const email = String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  return initials === 'LZ' || email === 'lz@helix-law.com';
}

// Phase G — read-only widening to LZ + AC. Writes still need requireDevOwner.
function isForgeReader(req) {
  if (isDevOwner(req)) return true;
  const initials = String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || '').toUpperCase().trim();
  const email = String(req.user?.email || req.query?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  return initials === 'AC' || email === 'ac@helix-law.com';
}

function readActor(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || req.user?.email || req.query?.email || 'unknown').trim() || 'unknown';
}

function readViewMode(req) {
  const raw = String(req.query?.viewMode || req.headers['x-forge-view-mode'] || '').toLowerCase().trim();
  return raw === 'roadmap' ? 'roadmap' : 'dev';
}

function gate(req, res, next) {
  if (!isDevOwner(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function requireForgeReader(req, res, next) {
  if (!isForgeReader(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function repoPath(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

function safeStat(relativePath, regenerateCommand) {
  const fullPath = repoPath(...relativePath.split('/'));
  const markerExpected = Boolean(regenerateCommand);
  if (!fs.existsSync(fullPath)) {
    return {
      path: relativePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      regenerateCommand,
      markerExpected,
      hasGeneratedMarker: null,
    };
  }
  const stat = fs.statSync(fullPath);
  const sample = markerExpected ? fs.readFileSync(fullPath, 'utf8').slice(0, 2048) : '';
  return {
    path: relativePath,
    exists: true,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    regenerateCommand,
    markerExpected,
    hasGeneratedMarker: markerExpected ? sample.includes(GENERATED_MARKER) : null,
  };
}

function detectCategory(title, details) {
  const hay = `${title || ''} ${details || ''}`;
  for (const [category, regex] of Object.entries(CATEGORY_KEYWORDS)) {
    if (regex.test(hay)) return category;
  }
  return 'feature';
}

function parseChangelog(markdown) {
  const entries = [];
  String(markdown || '').split(/\r?\n/).forEach((line, idx) => {
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*([^/]+?)(?:\s*\/\s*(.*))?\s*$/);
    if (!match) return;
    const date = match[1];
    const title = String(match[2] || '').trim();
    const details = String(match[3] || '').trim();
    if (!title) return;
    entries.push({
      date,
      title,
      details,
      category: detectCategory(title, details),
      idx,
    });
  });
  entries.sort((a, b) => (a.date === b.date ? a.idx - b.idx : a.date < b.date ? 1 : -1));
  return entries;
}

function loadChangelogSummary() {
  const filePath = repoPath('logs', 'changelog.md');
  const markdown = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const entries = parseChangelog(markdown);
  const byCategory = entries.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, { feature: 0, improvement: 0, fix: 0, ops: 0 });
  const today = Date.now();
  const last14Days = entries.filter((entry) => {
    const then = new Date(`${entry.date}T00:00:00`).getTime();
    return Number.isFinite(then) && today - then <= 14 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    total: entries.length,
    last14Days,
    byCategory,
    latest: entries.slice(0, 8).map(({ date, title, details, category }) => ({ date, title, details, category })),
  };
}

function statusKeyFor(status) {
  if (status === STATUS.STALE) return 'stale';
  if (status === STATUS.READY) return 'ready';
  if (status === STATUS.DONE) return 'done';
  return 'open';
}

function loadStashSummary() {
  const briefs = loadAllBriefs().filter((brief) => brief.hasMetaBlock);
  const items = briefs.map((brief) => {
    const meta = brief.meta || {};
    const status = statusFor(meta);
    const ageDays = daysSince(meta.verified);
    const depends = Array.isArray(meta.depends_on) ? meta.depends_on.length : 0;
    const coordinates = Array.isArray(meta.coordinates_with) ? meta.coordinates_with.length : 0;
    const conflicts = Array.isArray(meta.conflicts_with) ? meta.conflicts_with.length : 0;
    const relationshipCount = depends + coordinates + conflicts;
    return {
      id: meta.id || null,
      title: titleFromContent(brief.rawContent, brief.filename),
      file: brief.filename,
      status: statusKeyFor(status),
      verified: meta.verified || null,
      ageDays,
      relationshipCount,
      conflictCount: conflicts,
      staleRisk: (ageDays || 0) * Math.max(1, relationshipCount) + conflicts * 12,
    };
  });

  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    if (item.conflictCount > 0) acc.withConflicts += 1;
    return acc;
  }, { open: 0, stale: 0, ready: 0, done: 0, withConflicts: 0 });

  return {
    total: items.length,
    ...counts,
    highRisk: items
      .filter((item) => item.status !== 'done')
      .sort((a, b) => b.staleRisk - a.staleRisk)
      .slice(0, 8),
  };
}

function getToolbelt() {
  return [
    { id: 'dev-fast', label: 'Fast dev loop', command: 'npm run dev:fast', surface: 'tools/dev-fast.mjs', tone: 'success' },
    { id: 'dev-clean', label: 'Browser snappiness reset', command: 'npm run dev:clean -- --dry-run', surface: 'tools/dev-clean.mjs', tone: 'neutral' },
    { id: 'stash-status', label: 'Refresh stash index', command: 'npm run stash:status', surface: 'tools/stash-status.mjs', tone: 'warning' },
    { id: 'instant-lookup', label: 'Secure lookup primitive', command: 'node tools/instant-lookup.mjs pipeline <ref>', surface: 'tools/instant-lookup.mjs', tone: 'neutral' },
    { id: 'route-checks', label: 'Prod-parity checks', command: 'System > Checks', surface: 'server/utils/opsCheckCatalog.js', tone: 'success' },
    { id: 'session-start', label: 'Session context', command: 'npm run session:start', surface: 'tools/session-start.mjs', tone: 'neutral' },
    { id: 'health', label: 'Local health bundle', command: 'npm run health', surface: 'package.json', tone: 'neutral' },
  ];
}

function getUpgradeCandidates(stash) {
  return [
    {
      id: 'changelog-inspector',
      phase: 'B',
      title: 'Changelog inspector',
      signal: `${stash.open} open briefs need a learning loop attached to shipped changes`,
      outcome: 'Weekly themes, repeated mistake classes, and permission-aware summaries.',
      tone: 'success',
    },
    {
      id: 'stash-graph',
      phase: 'A',
      title: 'Stash graph',
      signal: `${stash.withConflicts} briefs currently declare conflicts`,
      outcome: 'Dependency clusters and next-best pickup order in the System tab.',
      tone: stash.withConflicts > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'generated-file-guard',
      phase: 'A',
      title: 'Generated-file guard',
      signal: 'Auto-generated outputs and tracked scratch files need a visible convention',
      outcome: 'Headers, regeneration commands, and safer cleanup sweeps.',
      tone: 'warning',
    },
    {
      id: 'lessons-ledger',
      phase: 'B',
      title: 'Lessons ledger',
      signal: 'Health observations and repo memories are useful but scattered',
      outcome: 'Accepted lessons become queryable records instead of chat footers.',
      tone: 'neutral',
    },
  ];
}

function allowedSubjectsFor(grants, capability) {
  const states = new Map();
  for (const grant of grants || []) {
    if (grant.Capability !== capability) continue;
    const subject = String(grant.Subject || '').trim();
    if (!subject) continue;
    if (grant.Effect === 'deny') {
      states.set(subject, false);
    } else if (grant.Effect === 'allow' && states.get(subject) !== false) {
      states.set(subject, true);
    }
  }
  return Array.from(states.entries())
    .filter(([, allowed]) => allowed)
    .map(([subject]) => subject)
    .sort();
}

function formatSubjectList(subjects) {
  const names = subjects.map((subject) => subject.startsWith('user:') ? subject.slice(5) : subject);
  if (names.length === 0) return 'No users granted yet';
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')} +${names.length - 4}`;
}

function buildReadinessSummary(grants) {
  const actions = listActions();
  const systemSubjects = allowedSubjectsFor(grants, 'feature:activity-tab').filter((subject) => subject.startsWith('user:'));
  const adminSafeActions = actions.filter((action) =>
    Array.isArray(action.allowedTiers)
    && action.allowedTiers.includes('admin')
    && action.category !== 'mutate'
  );
  const ownerOnlyWrites = actions.filter((action) =>
    Array.isArray(action.allowedTiers)
    && action.allowedTiers.includes('dev')
    && !action.allowedTiers.includes('admin')
  );
  const defaultCount = (grants || []).filter((grant) => grant.Source === 'default').length;
  const overrideCount = (grants || []).filter((grant) => grant.Source === 'override').length;

  return {
    systemUsers: {
      count: systemSubjects.length,
      meta: formatSubjectList(systemSubjects),
      tone: systemSubjects.length > 1 ? 'success' : 'warning',
    },
    adminSafeActions: {
      count: adminSafeActions.length,
      meta: 'read-only actions admin-ready',
      tone: adminSafeActions.length >= 10 ? 'success' : 'warning',
    },
    ownerOnlyWrites: {
      count: ownerOnlyWrites.length,
      meta: ownerOnlyWrites.map((action) => action.title || action.id).join(', ') || 'none',
      tone: ownerOnlyWrites.length === 1 ? 'success' : 'warning',
    },
    liveGrants: {
      count: (grants || []).length,
      meta: `${overrideCount} overrides · ${defaultCount} defaults`,
      tone: (grants || []).length > 0 ? 'info' : 'warning',
    },
  };
}

router.get('/summary', requireForgeReader, async (req, res) => {
  const startedAt = Date.now();
  const actor = readActor(req);
  const viewMode = readViewMode(req);
  trackEvent('DevConsole.Summary.Started', { operation: 'summary', triggeredBy: actor, actor, viewMode });

  try {
    const changelog = loadChangelogSummary();
    const stash = loadStashSummary();
    const grants = await access.getLiveGrants();
    const readiness = buildReadinessSummary(grants);
    const payload = {
      generatedAt: new Date().toISOString(),
      changelog,
      stash,
      readiness,
      tools: getToolbelt(),
      generatedArtifacts: [
        safeStat('docs/notes/INDEX.md', 'npm run stash:status'),
        safeStat('logs/changelog.md', null),
        safeStat('.github/instructions/REALTIME_CONTEXT.md', 'npm run sync:context'),
      ],
      upgradeCandidates: getUpgradeCandidates(stash),
    };
    const durationMs = Date.now() - startedAt;
    trackMetric('DevConsole.Summary.Duration', durationMs, { operation: 'summary', viewMode });
    trackEvent('DevConsole.Summary.Completed', {
      operation: 'summary',
      actor,
      viewMode,
      durationMs,
      changelogEntries: changelog.total,
      stashOpen: stash.open,
      stashStale: stash.stale,
      liveGrants: readiness.liveGrants.count,
      systemUsers: readiness.systemUsers.count,
    });
    res.json(payload);
  } catch (err) {
    trackException(err, { operation: 'DevConsole.Summary', phase: 'load', viewMode });
    trackEvent('DevConsole.Summary.Failed', { operation: 'summary', actor, viewMode, error: err.message });
    res.status(500).json({ error: 'failed to load dev console summary', detail: err.message });
  }
});

// ─── Phase B — Asana project mirror (read-only) ─────────────────────────────
// LZ + AC can read; no write affordances. Defaults to Tech & Automations but
// can mirror any project the requesting Asana identity can see in the workspace.

const asanaProjectMirrorCache = new Map();
const asanaProjectsCache = new Map();
const ASANA_PROJECT_CACHE_TTL = 120_000;
const ASANA_PROJECT_LIST_CACHE_TTL = 300_000;

function readAsanaLookupInitials(req) {
  return String(req.user?.initials || req.query?.initials || req.headers['x-user-initials'] || 'LZ').trim() || 'LZ';
}

async function resolveRequestAsanaAccessToken(req, lookupInitials = readAsanaLookupInitials(req)) {
  return resolveAsanaAccessToken({ initials: lookupInitials });
}

async function fetchAsanaCollection(firstUrl, accessToken) {
  const rows = [];
  let nextUrl = firstUrl;
  for (let page = 0; nextUrl && page < 20; page += 1) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `Asana HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    rows.push(...(payload.data || []));
    nextUrl = payload.next_page?.uri || null;
  }
  return rows;
}

router.get('/asana/projects', requireForgeReader, async (req, res) => {
  const startedAt = Date.now();
  const actor = readActor(req);
  const viewMode = readViewMode(req);
  const lookupInitials = readAsanaLookupInitials(req).toUpperCase();
  trackEvent('DevConsole.Asana.Projects.Started', { operation: 'asana-projects', actor, viewMode });

  const workspaceId = String(ASANA_WORKSPACE_ID || '').trim();
  if (!workspaceId) {
    trackEvent('DevConsole.Asana.Projects.Skipped', { operation: 'asana-projects', reason: 'no_workspace_id', actor, viewMode });
    return res.status(503).json({ success: false, error: 'ASANA_WORKSPACE_ID not configured.', configured: false });
  }

  try {
    const cached = asanaProjectsCache.get(lookupInitials);
    if (cached?.data && Date.now() < cached.expires) {
      trackEvent('DevConsole.Asana.Projects.CacheHit', { operation: 'asana-projects', actor, viewMode });
      return res.json({ ...cached.data, cached: true });
    }

    const accessToken = await resolveRequestAsanaAccessToken(req, lookupInitials);
    if (!accessToken) {
      trackEvent('DevConsole.Asana.Projects.Failed', { operation: 'asana-projects', reason: 'no_token', actor, viewMode });
      return res.status(500).json({ success: false, error: 'Unable to acquire Asana access token.' });
    }

    const projects = await fetchAsanaCollection(
      `${ASANA_BASE_URL}/projects?workspace=${encodeURIComponent(workspaceId)}&archived=false&opt_fields=gid,name,archived,team.name&limit=100`,
      accessToken,
    );
    const defaultProjectId = String(ASANA_TECH_AUTOMATIONS_PROJECT_ID || '').trim();
    const payload = {
      success: true,
      workspaceId,
      defaultProjectId: defaultProjectId || null,
      generatedAt: new Date().toISOString(),
      projects: projects
        .map((project) => ({
          gid: String(project.gid || ''),
          name: project.name || '',
          archived: Boolean(project.archived),
          teamName: project.team?.name || null,
        }))
        .filter((project) => project.gid && project.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };

    asanaProjectsCache.set(lookupInitials, { data: payload, expires: Date.now() + ASANA_PROJECT_LIST_CACHE_TTL });

    const durationMs = Date.now() - startedAt;
    trackMetric('DevConsole.Asana.Projects.Duration', durationMs, { operation: 'asana-projects', viewMode });
    trackEvent('DevConsole.Asana.Projects.Completed', {
      operation: 'asana-projects',
      actor,
      viewMode,
      durationMs,
      projectCount: String(payload.projects.length),
    });
    res.json(payload);
  } catch (err) {
    const status = Number(err.status) || 500;
    trackException(err, { operation: 'DevConsole.Asana.Projects', phase: 'fetch', viewMode });
    trackEvent('DevConsole.Asana.Projects.Failed', { operation: 'asana-projects', actor, viewMode, error: err.message });
    res.status(status).json({ success: false, error: err.message || 'Failed to fetch Asana projects.' });
  }
});

router.get('/asana/tech-automations', requireForgeReader, async (req, res) => {
  const startedAt = Date.now();
  const actor = readActor(req);
  const viewMode = readViewMode(req);
  const lookupInitials = readAsanaLookupInitials(req).toUpperCase();
  trackEvent('DevConsole.Asana.ProjectMirror.Started', { operation: 'asana-project-mirror', actor, viewMode });

  const projectId = String(req.query?.projectId || ASANA_TECH_AUTOMATIONS_PROJECT_ID || '').trim();
  if (!projectId) {
    trackEvent('DevConsole.Asana.ProjectMirror.Skipped', { operation: 'asana-project-mirror', reason: 'no_project_id', actor, viewMode });
    return res.status(503).json({
      success: false,
      error: 'No Asana project selected. Set ASANA_TECH_AUTOMATIONS_PROJECT_ID or choose a project from the org list.',
      configured: false,
    });
  }

  try {
    const cacheKey = `${lookupInitials}::${projectId}`;
    const cached = asanaProjectMirrorCache.get(cacheKey);
    if (cached?.data && Date.now() < cached.expires) {
      trackEvent('DevConsole.Asana.ProjectMirror.CacheHit', { operation: 'asana-project-mirror', actor, viewMode, projectId });
      return res.json({ ...cached.data, cached: true });
    }

    const accessToken = await resolveRequestAsanaAccessToken(req, lookupInitials);
    if (!accessToken) {
      trackEvent('DevConsole.Asana.ProjectMirror.Failed', { operation: 'asana-project-mirror', reason: 'no_token', actor, viewMode, projectId });
      return res.status(500).json({ success: false, error: 'Unable to acquire Asana access token.' });
    }

    const projectRes = await fetch(
      `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectId)}?opt_fields=gid,name,archived,team.name`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 },
    );
    if (!projectRes.ok) {
      const text = await projectRes.text();
      trackEvent('DevConsole.Asana.ProjectMirror.Failed', { operation: 'asana-project-mirror', reason: 'project_http', status: String(projectRes.status), actor, viewMode, projectId });
      return res.status(projectRes.status).json({ success: false, error: text || 'Asana project fetch failed.' });
    }
    const project = (await projectRes.json()).data || {};

    const sectionsRes = await fetch(
      `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectId)}/sections?opt_fields=name,gid`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 },
    );
    if (!sectionsRes.ok) {
      const text = await sectionsRes.text();
      trackEvent('DevConsole.Asana.ProjectMirror.Failed', { operation: 'asana-project-mirror', reason: 'sections_http', status: String(sectionsRes.status), actor, viewMode, projectId });
      return res.status(sectionsRes.status).json({ success: false, error: text || 'Asana sections fetch failed.' });
    }
    const sections = (await sectionsRes.json()).data || [];

    const sectionResults = await Promise.all(
      sections.map(async (section) => {
        try {
          const tasksRes = await fetch(
            `${ASANA_BASE_URL}/sections/${section.gid}/tasks?completed_since=now&opt_fields=gid,name,completed,assignee.name,permalink_url,due_on,created_at,notes&limit=100`,
            { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 },
          );
          if (!tasksRes.ok) return { section: section.name, sectionGid: section.gid, tasks: [] };
          const tasksData = (await tasksRes.json()).data || [];
          return {
            section: section.name,
            sectionGid: section.gid,
            tasks: tasksData.map((t) => ({
              gid: t.gid,
              name: t.name,
              assignee: t.assignee?.name || null,
              dueOn: t.due_on || null,
              createdAt: t.created_at || null,
              url: t.permalink_url || null,
              notes: typeof t.notes === 'string' ? t.notes.slice(0, 600) : '',
            })),
          };
        } catch (sectionErr) {
          trackException(sectionErr, { operation: 'DevConsole.Asana.ProjectMirror', phase: 'section_tasks', viewMode, projectId, sectionGid: section.gid });
          return { section: section.name, sectionGid: section.gid, tasks: [] };
        }
      }),
    );

    const tasks = [];
    for (const sr of sectionResults) {
      for (const t of sr.tasks) tasks.push({ ...t, section: sr.section, sectionGid: sr.sectionGid });
    }

    const result = {
      success: true,
      projectId,
      projectName: project.name || 'Asana project',
      teamName: project.team?.name || null,
      generatedAt: new Date().toISOString(),
      tasks,
      sections: sectionResults.map((s) => ({ name: s.section, gid: s.sectionGid, count: s.tasks.length })),
    };
    asanaProjectMirrorCache.set(cacheKey, { data: result, expires: Date.now() + ASANA_PROJECT_CACHE_TTL });

    const durationMs = Date.now() - startedAt;
    trackMetric('DevConsole.Asana.ProjectMirror.Duration', durationMs, { operation: 'asana-project-mirror', viewMode, projectId });
    trackEvent('DevConsole.Asana.ProjectMirror.Completed', {
      operation: 'asana-project-mirror',
      actor,
      viewMode,
      projectId,
      durationMs,
      taskCount: String(tasks.length),
      sectionCount: String(sectionResults.length),
    });
    res.json(result);
  } catch (err) {
    trackException(err, { operation: 'DevConsole.Asana.ProjectMirror', phase: 'fetch', viewMode, projectId });
    trackEvent('DevConsole.Asana.ProjectMirror.Failed', { operation: 'asana-project-mirror', actor, viewMode, projectId, error: err.message });
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch Asana project tasks.' });
  }
});

// ─── Asana task inspector (read-only) ──────────────────────────────────────
// LZ + AC can inspect any Asana task they have read access to. Accepts either
// a task gid or any flavour of Asana task URL via ?taskId or ?taskUrl.
// Cached for 60s per (initials, taskGid).

const asanaTaskInspectorCache = new Map();
const ASANA_TASK_INSPECTOR_CACHE_TTL = 60_000;

router.get('/asana/task', requireForgeReader, async (req, res) => {
  const startedAt = Date.now();
  const actor = readActor(req);
  const viewMode = readViewMode(req);
  const lookupInitials = readAsanaLookupInitials(req).toUpperCase();
  const rawInput = String(req.query?.taskId || req.query?.taskUrl || '').trim();
  const taskGid = extractAsanaTaskGid(rawInput);

  trackEvent('DevConsole.Asana.TaskInspector.Started', {
    operation: 'asana-task-inspector',
    actor,
    viewMode,
    hasInput: String(Boolean(rawInput)),
  });

  if (!taskGid) {
    trackEvent('DevConsole.Asana.TaskInspector.Skipped', {
      operation: 'asana-task-inspector',
      reason: 'no_task_gid',
      actor,
      viewMode,
    });
    return res.status(400).json({
      success: false,
      error: 'Provide ?taskId=<gid> or ?taskUrl=<asana task URL>',
    });
  }

  try {
    const cacheKey = `${lookupInitials}::${taskGid}`;
    const cached = asanaTaskInspectorCache.get(cacheKey);
    if (cached?.data && Date.now() < cached.expires) {
      trackEvent('DevConsole.Asana.TaskInspector.CacheHit', {
        operation: 'asana-task-inspector',
        actor,
        viewMode,
        taskGid,
      });
      return res.json({ ...cached.data, cached: true });
    }

    const accessToken = await resolveRequestAsanaAccessToken(req, lookupInitials);
    if (!accessToken) {
      trackEvent('DevConsole.Asana.TaskInspector.Failed', {
        operation: 'asana-task-inspector',
        reason: 'no_token',
        actor,
        viewMode,
        taskGid,
      });
      return res.status(500).json({ success: false, error: 'Unable to acquire Asana access token.' });
    }

    const inspection = await inspectAsanaTask({ accessToken, taskGid });
    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),
      input: rawInput,
      ...inspection,
    };
    asanaTaskInspectorCache.set(cacheKey, {
      data: payload,
      expires: Date.now() + ASANA_TASK_INSPECTOR_CACHE_TTL,
    });

    const durationMs = Date.now() - startedAt;
    trackMetric('DevConsole.Asana.TaskInspector.Duration', durationMs, {
      operation: 'asana-task-inspector',
      viewMode,
    });
    trackEvent('DevConsole.Asana.TaskInspector.Completed', {
      operation: 'asana-task-inspector',
      actor,
      viewMode,
      taskGid,
      durationMs,
      storyCount: String(inspection.stories.length),
      subtaskCount: String(inspection.subtasks.length),
      warnings: String(inspection.warnings.length),
    });
    res.json(payload);
  } catch (err) {
    const status = Number(err.status) || 500;
    trackException(err, { operation: 'DevConsole.Asana.TaskInspector', phase: 'fetch', viewMode, taskGid });
    trackEvent('DevConsole.Asana.TaskInspector.Failed', {
      operation: 'asana-task-inspector',
      actor,
      viewMode,
      taskGid,
      status: String(status),
      error: err.message,
    });
    res.status(status).json({ success: false, error: err.message || 'Failed to inspect Asana task.' });
  }
});

module.exports = router;