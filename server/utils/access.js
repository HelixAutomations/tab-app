// server/utils/access.js
//
// Access resolver — Phase Access.1.
//
// Source of truth (in priority order):
//   1. AccessGrants table in the Instructions DB
//   2. EMERGENCY_DEFAULTS (bootstrap fallback) when SQL is unreachable or the
//      migration has not run yet — keeps LZ as 'dev' so the app can still
//      be administered. Defaults intentionally minimal: anything beyond
//      LZ-as-dev requires the table.
//
// Caching:
//   - In-memory snapshot of all live grants, refreshed every 30s OR
//     immediately when invalidate() is called from a write endpoint.
//   - Per-process cache. In a single-instance Azure App Service this is
//     instant for everyone after a write. If the app ever scales out we add
//     pubsub-based invalidation; deferred until measurable.
//
// Resolution model:
//   - Subjects: 'user:<INITIALS>' is the primary identity. Group/role
//     resolution can be added later (resolveSubjects() seam below).
//   - Deny always wins (Effect='deny' on any matching grant blocks access).
//   - Expired grants (ExpiresAt <= now) are filtered out at read time AND
//     swept by a daily job (Phase Access.4).

const sql = require('mssql');
const { trackEvent, trackException } = require('./appInsights');

// =========================================================================
// Capability registry mirror.
// Kept in sync with src/app/capabilities.ts — duplicated here because the
// server can't import .ts files directly. If you add or change a capability
// in capabilities.ts, update this list too. Drift is detectable: the schema
// validator script (Phase Access.4) compares the two.
// =========================================================================
const EMERGENCY_DEFAULTS = {
  'tier:dev': ['user:LZ'],
  'tier:admin': ['user:LZ', 'user:AC', 'user:KW', 'user:JW', 'user:LA', 'user:EA'],
  'feature:reports': ['user:LZ', 'user:AC', 'user:KW', 'user:JW', 'user:EA'],
  'feature:firm-wide-home': ['user:LZ', 'user:KW', 'user:EA'],
  'feature:hub-controls': ['user:LZ'],
  'feature:activity-tab': ['user:LZ', 'user:EA'],
  'feature:ccl': ['group:*'],
  'action:matter-oneoff-replay': ['user:LZ'],
};

const CACHE_TTL_MS = 30_000;

let cachedGrants = null;
let cachedAt = 0;
let cacheSource = 'none'; // 'db' | 'fallback' | 'none'
let inflightLoad = null;

function nowMs() {
  return Date.now();
}

function isCacheStale() {
  return !cachedGrants || (nowMs() - cachedAt) > CACHE_TTL_MS;
}

async function loadGrantsFromDb() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) {
    return null;
  }
  let pool;
  try {
    pool = await sql.connect(connStr);
    const result = await pool.request().query(`
      SELECT GrantId, Subject, Capability, ResourceScope, Effect, Source, Priority, ExpiresAt
      FROM AccessGrants
      WHERE RevokedAt IS NULL
        AND (ExpiresAt IS NULL OR ExpiresAt > SYSUTCDATETIME())
    `);
    return result.recordset || [];
  } catch (err) {
    // Most likely cause in dev: migration not yet run (table missing).
    // In that case fall back to EMERGENCY_DEFAULTS rather than crashing.
    trackException(err, { component: 'Access', phase: 'load-grants' });
    return null;
  }
}

function buildFallbackSnapshot() {
  const rows = [];
  for (const [capability, subjects] of Object.entries(EMERGENCY_DEFAULTS)) {
    for (const subject of subjects) {
      rows.push({
        GrantId: `fallback:${subject}:${capability}`,
        Subject: subject,
        Capability: capability,
        ResourceScope: null,
        Effect: 'allow',
        Source: 'default',
        Priority: 100,
        ExpiresAt: null,
      });
    }
  }
  return rows;
}

async function refreshCache() {
  if (inflightLoad) return inflightLoad;
  inflightLoad = (async () => {
    const dbRows = await loadGrantsFromDb();
    if (Array.isArray(dbRows) && dbRows.length > 0) {
      cachedGrants = dbRows;
      cacheSource = 'db';
    } else {
      cachedGrants = buildFallbackSnapshot();
      cacheSource = dbRows == null ? 'fallback' : 'db'; // empty table is still 'db' but with 0 grants? -> use fallback if literally 0 to keep LZ alive
      if (Array.isArray(dbRows) && dbRows.length === 0) {
        cachedGrants = buildFallbackSnapshot();
        cacheSource = 'fallback';
      }
    }
    cachedAt = nowMs();
    inflightLoad = null;
    return cachedGrants;
  })();
  return inflightLoad;
}

async function getGrants() {
  if (isCacheStale()) {
    await refreshCache();
  }
  return cachedGrants || [];
}

function invalidate() {
  cachedGrants = null;
  cachedAt = 0;
}

function getCacheStatus() {
  return {
    source: cacheSource,
    ageMs: cachedGrants ? (nowMs() - cachedAt) : null,
    grantCount: cachedGrants ? cachedGrants.length : 0,
  };
}

// =========================================================================
// Subject resolution.
// Today only 'user:<INITIALS>' is meaningful. group:* is the universal group.
// Future: read team table to resolve group:operations / role:fee-earner.
// =========================================================================
function resolveSubjects(user) {
  if (!user) return ['group:*'];
  const initials = (user.initials || '').toUpperCase().trim();
  const subjects = ['group:*'];
  if (initials) {
    subjects.push(`user:${initials}`);
  }
  return subjects;
}

// =========================================================================
// hasCapability(user, capabilityKey, opts?)
//   - user: { initials, ... } shape from getRequestUser()
//   - capabilityKey: e.g. 'tier:admin', 'feature:reports'
//   - opts.resourceScope: optional, e.g. 'matter:HLX-...'
//   - Returns boolean. Deny wins.
// =========================================================================
async function hasCapability(user, capabilityKey, opts = {}) {
  const grants = await getGrants();
  const subjects = new Set(resolveSubjects(user));
  const scope = opts.resourceScope || null;

  let allowed = false;
  for (const g of grants) {
    if (!subjects.has(g.Subject)) continue;
    if (g.Capability !== capabilityKey) continue;
    if (g.ResourceScope && g.ResourceScope !== scope) continue;
    if (g.Effect === 'deny') {
      return false;
    }
    if (g.Effect === 'allow') {
      allowed = true;
    }
  }
  return allowed;
}

// Sync version backed by current cache (no DB round-trip). Returns false if
// cache is empty. Use the async hasCapability() wherever possible; this is a
// helper for code paths that can't be made async.
function hasCapabilitySync(user, capabilityKey, opts = {}) {
  if (!cachedGrants) return false;
  const subjects = new Set(resolveSubjects(user));
  const scope = opts.resourceScope || null;
  let allowed = false;
  for (const g of cachedGrants) {
    if (!subjects.has(g.Subject)) continue;
    if (g.Capability !== capabilityKey) continue;
    if (g.ResourceScope && g.ResourceScope !== scope) continue;
    if (g.Effect === 'deny') return false;
    if (g.Effect === 'allow') allowed = true;
  }
  return allowed;
}

// =========================================================================
// resolveTier(user) — returns the highest tier the user holds.
// Used by getUserTier(). If neither tier:dev nor tier:admin grants apply,
// returns 'user'.
// =========================================================================
async function resolveTier(user) {
  if (await hasCapability(user, 'tier:dev')) return 'dev';
  if (await hasCapability(user, 'tier:admin')) return 'admin';
  return 'user';
}

function resolveTierSync(user) {
  if (hasCapabilitySync(user, 'tier:dev')) return 'dev';
  if (hasCapabilitySync(user, 'tier:admin')) return 'admin';
  return 'user';
}

// Effective capability snapshot for one user (used by /api/access/effective).
async function getEffectiveCapabilities(user) {
  const grants = await getGrants();
  const subjects = new Set(resolveSubjects(user));
  const result = {};
  for (const g of grants) {
    if (!subjects.has(g.Subject)) continue;
    const key = g.Capability;
    const current = result[key];
    if (g.Effect === 'deny') {
      result[key] = { allowed: false, source: g.Source, via: g.Subject, scope: g.ResourceScope };
      continue;
    }
    if (g.Effect === 'allow' && (!current || current.allowed === false)) {
      // First allow wins unless a later deny overrides — which we handle above.
      result[key] = { allowed: true, source: g.Source, via: g.Subject, scope: g.ResourceScope };
    }
  }
  // Mark any capabilities not present as explicitly denied (closed-world).
  return result;
}

// Warm the cache on boot so the first request doesn't pay DB latency.
async function warm() {
  try {
    await refreshCache();
    trackEvent('Access.Cache.Warmed', {
      source: cacheSource,
      grantCount: String(cachedGrants ? cachedGrants.length : 0),
    });
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'warm' });
  }
}

// =========================================================================
// Expiry sweep — Phase Access.4.
// Soft-revokes any grant whose ExpiresAt has passed and writes a history
// row with Action='expired'. Idempotent (filters RevokedAt IS NULL). Runs
// on boot then on a 6h interval. Skipped under HELIX_LAZY_INIT.
// =========================================================================
const EXPIRY_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
let _expirySweepTimer = null;

async function sweepExpired({ triggeredBy = 'scheduled' } = {}) {
  const startedAt = nowMs();
  trackEvent('Access.ExpirySweep.Started', { triggeredBy });
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) {
    trackEvent('Access.ExpirySweep.Skipped', { reason: 'no-connection-string' });
    return { ok: false, reason: 'no-connection-string', expired: 0 };
  }
  try {
    const pool = await sql.connect(connStr);
    // OUTPUT inserted rows so we can audit + emit per-grant telemetry.
    const result = await pool.request().query(`
      UPDATE AccessGrants
      SET RevokedAt = SYSUTCDATETIME(), RevokedBy = 'system:expiry-sweep'
      OUTPUT INSERTED.GrantId, INSERTED.Subject, INSERTED.Capability,
             INSERTED.Source, INSERTED.ExpiresAt
      WHERE RevokedAt IS NULL
        AND ExpiresAt IS NOT NULL
        AND ExpiresAt <= SYSUTCDATETIME()
    `);
    const expired = result.recordset || [];
    if (expired.length > 0) {
      // Write history rows in a single batch (one round-trip per row is fine
      // at this volume; switch to TVP if it ever exceeds dozens per sweep).
      for (const row of expired) {
        try {
          await pool.request()
            .input('grantId', sql.UniqueIdentifier, row.GrantId)
            .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(row))
            .query(`
              INSERT INTO AccessGrantHistory (GrantId, Action, ActorInitials, PayloadJson)
              VALUES (@grantId, 'expired', 'system', @payload)
            `);
          trackEvent('Access.Grant.Expired', {
            grantId: row.GrantId,
            subject: row.Subject,
            capability: row.Capability,
            source: row.Source,
          });
        } catch (innerErr) {
          trackException(innerErr, { component: 'Access', phase: 'sweep-history', grantId: row.GrantId });
        }
      }
      invalidate();
    }
    const durationMs = nowMs() - startedAt;
    trackEvent('Access.ExpirySweep.Completed', {
      triggeredBy,
      expiredCount: String(expired.length),
      durationMs: String(durationMs),
    });
    return { ok: true, expired: expired.length, durationMs };
  } catch (err) {
    trackException(err, { component: 'Access', phase: 'sweep' });
    trackEvent('Access.ExpirySweep.Failed', { triggeredBy, error: err.message });
    return { ok: false, reason: 'error', error: err.message, expired: 0 };
  }
}

function startExpirySweep() {
  if (_expirySweepTimer) return;
  // Run once shortly after boot, then on the interval.
  setTimeout(() => { void sweepExpired({ triggeredBy: 'boot' }); }, 30_000);
  _expirySweepTimer = setInterval(() => {
    void sweepExpired({ triggeredBy: 'scheduled' });
  }, EXPIRY_SWEEP_INTERVAL_MS);
  if (typeof _expirySweepTimer.unref === 'function') _expirySweepTimer.unref();
}

function stopExpirySweep() {
  if (_expirySweepTimer) {
    clearInterval(_expirySweepTimer);
    _expirySweepTimer = null;
  }
}

module.exports = {
  hasCapability,
  hasCapabilitySync,
  resolveTier,
  resolveTierSync,
  getEffectiveCapabilities,
  getLiveGrants: getGrants,
  resolveSubjects,
  invalidate,
  warm,
  getCacheStatus,
  sweepExpired,
  startExpirySweep,
  stopExpirySweep,
  // exported for tests
  _getGrantsForTesting: getGrants,
  _setGrantsForTesting: (rows) => { cachedGrants = rows; cachedAt = nowMs(); cacheSource = 'test'; },
  EMERGENCY_DEFAULTS,
};
