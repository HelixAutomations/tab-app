/**
 * Hub ToDo registry — server-side helper over dbo.hub_todo.
 *
 * HOME_TODO_SINGLE_PICKUP_SURFACE — Phase B3b.
 *
 * Why this exists
 * ───────────────
 * Home's immediate-actions bar is becoming the single pickup surface for
 * every hub-originating item (CCL review, annual leave, risk assessments,
 * call notes, …). Each source used to push through its own ad-hoc state;
 * this module is the unified spine.
 *
 * One INSERT here lights up two places:
 *   • Home immediate-actions bar (via GET /api/todo)
 *   • Activity feed         (via `hub.todo` source in activity-feed.js)
 *
 * Failure model
 * ─────────────
 * Every helper here is *best effort*. If the write fails, we log + track an
 * exception but DO NOT throw. The caller flow (CCL autopilot, annual-leave
 * approval, matter-opened handoff) must never fail because the registry
 * was unavailable.
 *
 * Dual-path compat
 * ────────────────
 * This helper IS the registry. Callers themselves decide whether to also
 * fire legacy events (e.g. `openHomeCclReview`) based on
 * HELIX_TODO_REGISTRY_ENABLED. Default while the brief rolls out: legacy
 * path stays on; this registry is an additive log.
 */

const { withRequest } = require('./db');
const { trackEvent, trackException, trackMetric } = require('./appInsights');

const HUB_TODO_TABLE_CHECK_TTL_MS = 5 * 60 * 1000;
const hubTodoTableCache = new Map();

/**
 * Resolve the Helix Operations Platform DB connection string at call time.
 *
 * Two-stage gate (mirrors formSubmissionLog + aiProposalLog):
 *   1. OPS_PLATFORM_ENABLED must be 'true' (repo-level kill switch).
 *   2. OPS_SQL_CONNECTION_STRING must be set.
 *
 * Emergency rollback: HUB_TODO_USE_LEGACY=true forces the helper onto
 * legacy helix-core-data via SQL_CONNECTION_STRING. Only use if the ops
 * DB is degraded; requires a later backfill.
 */
function getConnStr() {
  if (String(process.env.HUB_TODO_USE_LEGACY || '').toLowerCase() === 'true') {
    return process.env.SQL_CONNECTION_STRING || null;
  }
  if (String(process.env.OPS_PLATFORM_ENABLED || '').toLowerCase() !== 'true') {
    return null;
  }
  return process.env.OPS_SQL_CONNECTION_STRING || null;
}

async function hasHubTodoTable(connStr) {
  if (!connStr) return false;

  const cached = hubTodoTableCache.get(connStr);
  const now = Date.now();
  if (cached && now - cached.checkedAt < HUB_TODO_TABLE_CHECK_TTL_MS) {
    return cached.exists;
  }

  try {
    const result = await withRequest(connStr, async (request) => request.query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.hub_todo', N'U') IS NOT NULL THEN 1 ELSE 0 END AS exists_flag;
    `));
    const exists = Boolean(result?.recordset?.[0]?.exists_flag);
    hubTodoTableCache.set(connStr, { exists, checkedAt: now });

    if (!exists) {
      trackEvent('Todo.Table.Missing', {
        source: connStr === (process.env.SQL_CONNECTION_STRING || null) ? 'legacy' : 'ops-platform',
      });
    }

    return exists;
  } catch (err) {
    trackException(err, { phase: 'hubTodoLog.hasHubTodoTable' });
    hubTodoTableCache.set(connStr, { exists: false, checkedAt: now });
    return false;
  }
}

/**
 * Kinds recognised today. Mirrors `ToDoKind` in
 * `src/tabs/home/ImmediateActionModel.ts`. The server does not enforce
 * this list — callers are free to insert new kinds (the activity feed
 * renders them generically) — but it drives idempotency and summary
 * fallbacks for the ones we care about.
 */
const KNOWN_KINDS = new Set([
  'review-ccl',
  'annual-leave',
  'ld-review',
  'snippet-edits',
  'call-attendance-note',
  'open-file',
  'risk-assessment',
  'undertaking-request',
  'complaint-followup',
]);

/**
 * Build a reasonable default `summary` when the caller didn't supply one.
 */
function defaultSummary({ kind, matterRef, docType }) {
  const parts = [];
  if (kind) parts.push(String(kind));
  if (matterRef) parts.push(String(matterRef));
  if (docType) parts.push(String(docType));
  return parts.join(' · ') || 'Hub to-do';
}

/**
 * Create a card, idempotent on (kind, matter_ref, owner_initials) when
 * matter_ref is present. Returns `{ id, deduplicated }`.
 *
 * Never throws — failures resolve to `{ id: null, deduplicated: false }`.
 */
async function createCard({
  kind,
  ownerInitials,
  matterRef = null,
  docType = null,
  stage = null,
  payload = null,
  summary = null,
  lastEvent = null,
}) {
  const connStr = getConnStr();
  if (!connStr) return { id: null, deduplicated: false };
  if (!(await hasHubTodoTable(connStr))) return { id: null, deduplicated: false };

  if (!kind || !ownerInitials) {
    trackException(new Error('hubTodoLog.createCard missing kind/ownerInitials'), {
      kind: String(kind || ''),
      ownerInitials: String(ownerInitials || ''),
    });
    return { id: null, deduplicated: false };
  }

  const payloadJson = payload ? JSON.stringify(payload) : null;
  const resolvedSummary = summary || defaultSummary({ kind, matterRef, docType });

  try {
    // Idempotency: if there's already an OPEN card for the same
    // (kind, matter_ref, owner_initials), return that id.
    if (matterRef) {
      const existing = await withRequest(connStr, async (request, sql) => {
        request.input('kind', sql.NVarChar(50), kind);
        request.input('matter_ref', sql.NVarChar(50), matterRef);
        request.input('owner_initials', sql.NVarChar(16), ownerInitials);
        return request.query(`
          SELECT TOP 1 id
          FROM dbo.hub_todo
          WHERE kind = @kind
            AND matter_ref = @matter_ref
            AND owner_initials = @owner_initials
            AND completed_at IS NULL
          ORDER BY created_at DESC;
        `);
      });
      const existingId = existing?.recordset?.[0]?.id || null;
      if (existingId) {
        trackEvent('Todo.Card.Deduplicated', {
          kind,
          ownerInitials,
          matterRef: String(matterRef),
          id: String(existingId),
        });
        return { id: existingId, deduplicated: true };
      }
    }

    const result = await withRequest(connStr, async (request, sql) => {
      request.input('kind', sql.NVarChar(50), kind);
      request.input('owner_initials', sql.NVarChar(16), ownerInitials);
      request.input('matter_ref', sql.NVarChar(50), matterRef);
      request.input('doc_type', sql.NVarChar(100), docType);
      request.input('stage', sql.NVarChar(32), stage);
      request.input('payload_json', sql.NVarChar(sql.MAX), payloadJson);
      request.input('summary', sql.NVarChar(400), resolvedSummary);
      request.input('last_event', sql.NVarChar(200), lastEvent);
      return request.query(`
        INSERT INTO dbo.hub_todo
          (kind, owner_initials, matter_ref, doc_type, stage, payload_json, summary, last_event)
        OUTPUT INSERTED.id
        VALUES
          (@kind, @owner_initials, @matter_ref, @doc_type, @stage, @payload_json, @summary, @last_event);
      `);
    });
    const id = result?.recordset?.[0]?.id || null;
    trackEvent('Todo.Card.Created', {
      kind,
      ownerInitials,
      matterRef: matterRef ? String(matterRef) : '',
      id: id ? String(id) : '',
    });
    trackMetric('Todo.Card.Created.Count', 1, { kind });
    return { id, deduplicated: false };
  } catch (err) {
    trackException(err, { phase: 'createCard', kind, ownerInitials });
    trackEvent('Todo.Card.Created.Failed', {
      kind: String(kind),
      error: err?.message || String(err),
    });
    return { id: null, deduplicated: false };
  }
}

/**
 * Mark a card complete. Either `id` OR the `(kind, matterRef, ownerInitials)`
 * triple must be provided. Returns `{ id, alreadyComplete }`.
 *
 * Never throws — failures resolve to `{ id: null, alreadyComplete: false }`.
 */
async function reconcileCard({
  id = null,
  kind = null,
  matterRef = null,
  ownerInitials = null,
  completedVia,
  lastEvent = null,
}) {
  const connStr = getConnStr();
  if (!connStr) return { id: null, alreadyComplete: false };
  if (!(await hasHubTodoTable(connStr))) return { id: null, alreadyComplete: false };

  if (!completedVia) {
    trackException(new Error('hubTodoLog.reconcileCard missing completedVia'), {
      id: String(id || ''),
      kind: String(kind || ''),
    });
    return { id: null, alreadyComplete: false };
  }
  if (!id && !(kind && ownerInitials)) {
    trackException(new Error('hubTodoLog.reconcileCard needs id or (kind+ownerInitials)'), {
      kind: String(kind || ''),
      ownerInitials: String(ownerInitials || ''),
    });
    return { id: null, alreadyComplete: false };
  }

  trackEvent('Todo.Reconcile.Started', {
    id: id ? String(id) : '',
    kind: kind ? String(kind) : '',
    ownerInitials: ownerInitials ? String(ownerInitials) : '',
    completedVia: String(completedVia),
  });

  try {
    // Resolve to a single id first (so we can report alreadyComplete
    // deterministically).
    let targetId = id;
    if (!targetId) {
      const lookup = await withRequest(connStr, async (request, sql) => {
        request.input('kind', sql.NVarChar(50), kind);
        request.input('owner_initials', sql.NVarChar(16), ownerInitials);
        request.input('matter_ref', sql.NVarChar(50), matterRef);
        return request.query(`
          SELECT TOP 1 id, completed_at
          FROM dbo.hub_todo
          WHERE kind = @kind
            AND owner_initials = @owner_initials
            AND (@matter_ref IS NULL OR matter_ref = @matter_ref)
            AND completed_at IS NULL
          ORDER BY created_at DESC;
        `);
      });
      targetId = lookup?.recordset?.[0]?.id || null;
      if (!targetId) {
        // Nothing open to reconcile — treat as no-op.
        trackEvent('Todo.Reconcile.Completed', {
          id: '',
          kind: String(kind),
          ownerInitials: String(ownerInitials),
          completedVia: String(completedVia),
          outcome: 'no-match',
        });
        return { id: null, alreadyComplete: false };
      }
    }

    const update = await withRequest(connStr, async (request, sql) => {
      request.input('id', sql.UniqueIdentifier, targetId);
      request.input('completed_via', sql.NVarChar(32), completedVia);
      request.input('last_event', sql.NVarChar(200), lastEvent);
      return request.query(`
        UPDATE dbo.hub_todo
        SET completed_at = CASE WHEN completed_at IS NULL THEN SYSUTCDATETIME() ELSE completed_at END,
            completed_via = CASE WHEN completed_at IS NULL THEN @completed_via ELSE completed_via END,
            last_event = COALESCE(@last_event, last_event)
        OUTPUT INSERTED.id,
          CASE WHEN DELETED.completed_at IS NOT NULL THEN 1 ELSE 0 END AS already_complete
        WHERE id = @id;
      `);
    });
    const row = update?.recordset?.[0];
    const alreadyComplete = Boolean(row?.already_complete);
    trackEvent('Todo.Reconcile.Completed', {
      id: String(targetId),
      kind: String(kind || ''),
      completedVia: String(completedVia),
      alreadyComplete: String(alreadyComplete),
    });
    if (!alreadyComplete) {
      trackEvent('Todo.Card.Completed', {
        id: String(targetId),
        kind: String(kind || ''),
        completedVia: String(completedVia),
      });
      trackMetric('Todo.Card.Completed.Count', 1, { kind: String(kind || '') });
    }
    return { id: targetId, alreadyComplete };
  } catch (err) {
    trackException(err, { phase: 'reconcileCard', id: String(id || ''), kind: String(kind || '') });
    trackEvent('Todo.Reconcile.Failed', {
      id: String(id || ''),
      kind: String(kind || ''),
      error: err?.message || String(err),
    });
    return { id: null, alreadyComplete: false };
  }
}

/**
 * Reconcile every open card matching `(kind, matterRef)` — useful for
 * records with multiple approvers/owners (e.g. annual leave has 2 approvers
 * per request). Returns `{ count }`.
 *
 * Never throws — failures resolve to `{ count: 0 }`.
 */
async function reconcileAllByRef({ kind, matterRef, completedVia, lastEvent = null }) {
  const connStr = getConnStr();
  if (!connStr) return { count: 0 };
  if (!(await hasHubTodoTable(connStr))) return { count: 0 };
  if (!kind || !matterRef || !completedVia) {
    trackException(new Error('hubTodoLog.reconcileAllByRef missing args'), {
      kind: String(kind || ''),
      matterRef: String(matterRef || ''),
    });
    return { count: 0 };
  }
  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('kind', sql.NVarChar(50), kind);
      request.input('matter_ref', sql.NVarChar(50), matterRef);
      request.input('completed_via', sql.NVarChar(32), completedVia);
      request.input('last_event', sql.NVarChar(200), lastEvent);
      return request.query(`
        UPDATE dbo.hub_todo
        SET completed_at = SYSUTCDATETIME(),
            completed_via = @completed_via,
            last_event = COALESCE(@last_event, last_event)
        WHERE kind = @kind
          AND matter_ref = @matter_ref
          AND completed_at IS NULL;
        SELECT @@ROWCOUNT AS count;
      `);
    });
    const count = Number(result?.recordset?.[0]?.count || 0);
    if (count > 0) {
      trackEvent('Todo.Card.Completed', {
        kind,
        matterRef,
        completedVia,
        count: String(count),
        mode: 'bulk',
      });
      trackMetric('Todo.Card.Completed.Count', count, { kind });
    }
    return { count };
  } catch (err) {
    trackException(err, { phase: 'reconcileAllByRef', kind, matterRef });
    trackEvent('Todo.Reconcile.Failed', {
      kind: String(kind),
      matterRef: String(matterRef),
      error: err?.message || String(err),
    });
    return { count: 0 };
  }
}

/**
 * Fetch cards for a single owner. Open-only by default; pass
 * `includeCompleted: true` to include closed cards from the last 7 days.
 *
 * Never throws — failures resolve to `[]`.
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   kind: string,
 *   ownerInitials: string,
 *   matterRef: string|null,
 *   docType: string|null,
 *   stage: string|null,
 *   payload: object|null,
 *   summary: string|null,
 *   createdAt: string,
 *   completedAt: string|null,
 *   completedVia: string|null,
 *   lastEvent: string|null,
 * }>>}
 */
async function fetchForOwner(ownerInitials, { includeCompleted = false } = {}) {
  const connStr = getConnStr();
  if (!connStr) return [];
  if (!(await hasHubTodoTable(connStr))) return [];
  if (!ownerInitials) return [];

  try {
    const result = await withRequest(connStr, async (request, sql) => {
      request.input('owner_initials', sql.NVarChar(16), ownerInitials);
      const whereCompleted = includeCompleted
        ? 'AND (completed_at IS NULL OR completed_at > DATEADD(day, -7, SYSUTCDATETIME()))'
        : 'AND completed_at IS NULL';
      return request.query(`
        SELECT id, kind, owner_initials, matter_ref, doc_type, stage,
               payload_json, summary, created_at, completed_at, completed_via, last_event
        FROM dbo.hub_todo
        WHERE owner_initials = @owner_initials
          ${whereCompleted}
        ORDER BY created_at DESC;
      `);
    });
    const rows = result?.recordset || [];
    return rows.map((r) => {
      let payload = null;
      if (r.payload_json) {
        try {
          payload = JSON.parse(r.payload_json);
        } catch {
          payload = null;
        }
      }
      return {
        id: r.id,
        kind: r.kind,
        ownerInitials: r.owner_initials,
        matterRef: r.matter_ref || null,
        docType: r.doc_type || null,
        stage: r.stage || null,
        payload,
        summary: r.summary || null,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        completedVia: r.completed_via || null,
        lastEvent: r.last_event || null,
      };
    });
  } catch (err) {
    trackException(err, { phase: 'fetchForOwner', ownerInitials });
    trackEvent('Todo.Fetch.Failed', {
      ownerInitials: String(ownerInitials),
      error: err?.message || String(err),
    });
    return [];
  }
}

/**
 * Fetch all hub_todo cards across owners (god view — dev-owner only).
 * @param {{ includeCompleted?: boolean, limit?: number }} options
 */
async function fetchAll({ includeCompleted = false, limit = 500 } = {}) {
  const connStr = getConnStr();
  if (!connStr) return [];
  if (!(await hasHubTodoTable(connStr))) return [];
  const cap = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  try {
    const result = await withRequest(connStr, async (request) => {
      const whereCompleted = includeCompleted
        ? 'WHERE (completed_at IS NULL OR completed_at > DATEADD(day, -7, SYSUTCDATETIME()))'
        : 'WHERE completed_at IS NULL';
      return request.query(`
        SELECT TOP ${cap} id, kind, owner_initials, matter_ref, doc_type, stage,
               payload_json, summary, created_at, completed_at, completed_via, last_event
        FROM dbo.hub_todo
        ${whereCompleted}
        ORDER BY created_at DESC;
      `);
    });
    const rows = result?.recordset || [];
    return rows.map((r) => {
      let payload = null;
      if (r.payload_json) {
        try { payload = JSON.parse(r.payload_json); } catch { payload = null; }
      }
      return {
        id: r.id,
        kind: r.kind,
        ownerInitials: r.owner_initials,
        matterRef: r.matter_ref || null,
        docType: r.doc_type || null,
        stage: r.stage || null,
        payload,
        summary: r.summary || null,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        completedVia: r.completed_via || null,
        lastEvent: r.last_event || null,
      };
    });
  } catch (err) {
    trackException(err, { phase: 'fetchAll' });
    trackEvent('Todo.Fetch.Failed', {
      scope: 'all',
      error: err?.message || String(err),
    });
    return [];
  }
}

module.exports = {
  createCard,
  reconcileCard,
  reconcileAllByRef,
  fetchForOwner,
  fetchAll,
  // exposed for tests / diagnostics
  _getConnStr: getConnStr,
  KNOWN_KINDS,
};
