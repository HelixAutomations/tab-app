# Forms preflight matrix in Activity tab

> **Purpose of this document.** Self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context.
>
> **How to use it.** Read once. Then implement Phase A. Phase B picks up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-28 against branch `main`.
>
> **Sibling briefs (CRITICAL — read these before touching code):**
> - [ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md](./ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md) — defines the generic `checks` lens, `opsCheckCatalog.js`, `ops-checks.js` route, and dev-group gating. **This brief is a Phase B-style consumer of that one.** If sibling Phase A has shipped, register forms-preflight checks into the existing catalog and reuse the runner. If it has not, this brief implements its own forms-only catalog and route, with the response contract aligned so a later refactor can fold them together.
> - [ACTIVITY_TESTING_SECURITY_AND_OPERATIONAL_VISIBILITY_CONTROL_PLANE.md](./ACTIVITY_TESTING_SECURITY_AND_OPERATIONAL_VISIBILITY_CONTROL_PLANE.md) — same Activity surface, security posture lens. Coordinate, don't collide.
> - [RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md](./RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md) — Track C1 already plans a per-form mount-time `useFormRoutePreflight` dot (shallow). This brief is the **god-mode aggregator** view of the same data: matrix not dot, scheduled not on-mount, deep not shallow.

---

## 1. Why this exists (user intent)

User quote (verbatim, 2026-04-28):

> "i need you to scope an implementation of a tool in activity tab which is the dev god mode space, to one click validate all forms and their underlying pipework. so that i can visually see if any of the forms wont work if the team users them and can sporadically check and be sure theyre all live and listening and firing correctly with tokens and things all running smoothly. you know? otherwise its guessing."

User follow-up:

> "activity tab please, the one with the change log and traces and activity and things"

The ask: a sporadic-check, one-click matrix for a dev-group operator (LZ first) to see across **all bespoke forms × all their underlying dependencies** whether things are live and firing right now. Token expiry, SQL reachability, Asana whoami, Tiller health, Key Vault — the things that fail silently between releases. The user explicitly said "i hate when things fail silently" earlier in the same session.

This is **not**:
- a generic per-route ping (sibling brief covers that),
- a per-form-mount dot (RETIRE_HELIX_KEYS_PROXY brief Track C1 covers that),
- a passive observability dashboard.

It is the dense **forms × dependencies matrix** that surfaces *which form will fail and at which dependency* before the team finds out the hard way.

---

## 2. Current state — verified findings

All file/line refs verified 2026-04-28 against branch `main`.

### 2.1 Activity tab is Roadmap.tsx

- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — header comment L1: *"Activity dashboard (live ops + changelog)"*. This is the host surface.
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) L7 — `ActivityLens = 'all' | 'forms' | 'matters' | 'sync' | 'errors' | 'trace' | 'briefs'`. There is already a `forms` lens, but it shows ops-pulse form events, not preflight.
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — switches between lens panels.
- [src/app/admin.ts](../../src/app/admin.ts) L100, L105 — `isDevGroupOrHigher(user)` defines Activity audience.

### 2.2 Existing health scaffold (must extend, not duplicate)

| File | What it does | Gap |
|------|--------------|-----|
| [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js) | `GET /api/form-health` and `/:formId`. Per-form HTTP probes. Each probe is a single read-only HTTP hit. | Shallow. No SQL ping, no Key Vault, no Asana whoami, no Tiller, no token-expiry, no Graph, no audit-log writability. Single status per form, not per-dependency breakdown. |
| [server/routes/routeHealth.js](../../server/routes/routeHealth.js) | `GET /api/route-health`. Broader probes (registers, system health, enquiries, team-data). Calls into `/api/form-health` as one of its probes. | Same shallow shape. |
| [src/CustomForms/shared/FormHealthCheck.tsx](../../src/CustomForms/shared/FormHealthCheck.tsx) | UI list view of `/api/form-health` results. | One dot per form, no per-dependency columns, not surfaced in Activity. |
| [src/components/debug/RouteHealthIndicator.tsx](../../src/components/debug/RouteHealthIndicator.tsx) | Compact chip indicator for route-health. | Glance-only. Different purpose — keep it. |
| [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) L312 | Already has `local`/`production` env switcher for `/api/route-health`. | Reusable pattern for env-targeted probes. |

### 2.3 Form universe (catalog seeds)

POST routes confirmed via grep on `server/routes/**`. Each row is a form the matrix must cover.

| Form id | Title | Submit route | Likely dependencies |
|---------|-------|--------------|---------------------|
| `tech-idea` | Tech Idea | `/api/tech-tickets/idea` | route, sqlCore, asana, audit, appInsights |
| `tech-problem` | Tech Problem | `/api/tech-tickets/problem` | route, sqlCore, asana, audit, appInsights |
| `verification-check` | Verification Check | `/api/verify-id/adhoc` | route, sqlInstructions, keyVault, tiller, audit |
| `bundle` | Bundle Builder | `/api/bundle` | route, sqlCore, asana, graph, audit |
| `book-space` | Book Space | `/api/book-space` | route, sqlCore, graph, audit |
| `financial-task` | Financial Task | `/api/financial-task` | route, sqlCore, audit, teamsWebhook |
| `counsel` | Counsel | `/api/counsel` | route, sqlCore, audit |
| `experts` | Experts | `/api/experts` | route, sqlCore, audit |
| `registers-ld` | L&D Plans | `/api/registers/learning-dev` | route, sqlCore, audit |
| `registers-activity` | Activity Plans | `/api/registers/activity` | route, sqlCore, audit |
| `registers-undertakings` | Undertakings | `/api/registers/undertakings` | route, sqlCore, audit |
| `registers-complaints` | Complaints | `/api/registers/complaints` | route, sqlCore, audit |
| `transactions-v2` | Transactions | `/api/transactionsV2` | route, sqlInstructions, audit |
| `notable-case-info` | Notable Case | env-driven Function URL | route, sqlCore, audit |
| `attendance` | Attendance | `/api/attendance/*` | route, sqlCore, graph, audit |
| `claim-enquiry` | Claim Enquiry *(Phase B)* | `/api/claimEnquiry` | route, sqlCore, audit |
| `forward-email` | Forward Email *(Phase B)* | `/api/forwardEmail` | route, graph, audit |

### 2.4 Dependency probe inventory

| dep id | Probe | Source |
|--------|-------|--------|
| `route` | Reuse `formHealthCheck.js` per-form check | existing |
| `sqlCore` | `SELECT 1` against `SQL_CONNECTION_STRING` | env |
| `sqlInstructions` | `SELECT 1` against `INSTRUCTIONS_SQL_CONNECTION_STRING` | env |
| `keyVault` | Single `getSecret` on a known low-value probe secret name (cached 60s) | [server/utils/getSecret.js](../../server/utils/getSecret.js) |
| `asana` | `GET https://app.asana.com/api/1.0/users/me` with current token | existing Asana helper in `server/routes/techTickets/*` |
| `tiller` | Tiller health/whoami endpoint (verify with code; if none exists, mark `skip` with note) | existing Tiller integration |
| `graph` | Acquire Graph token via existing helper, assert TTL > 5 min | existing Graph helper |
| `teamsWebhook` | Env presence + DNS lookup only (NO POST) | env |
| `audit` | `SELECT TOP 1` from `formSubmissionLog` table | [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) |
| `appInsights` | Connection string env present + SDK initialised flag | [server/utils/appInsights.js](../../server/utils/appInsights.js) |

**Critical non-side-effects rule.** Every probe must be metadata/read-only. **No** POST to a real form route. **No** Asana task creation. **No** Tiller verification creation. **No** email send. **No** SQL inserts to production tables. Audit-log probe is read-only — write capability is inferred from the fact that production submissions succeed; if stronger proof is wanted later, add a dedicated `__preflight_pings` table (Phase B).

### 2.5 Dev-group gate mismatch (carry over from sibling brief)

- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) hard-codes `['LZ', 'AC']`.
- [src/app/admin.ts](../../src/app/admin.ts) UI uses `isDevGroupOrHigher`.
- New `/api/forms-preflight` route MUST use the canonical helper (`server/utils/userTier.js` — created by sibling brief, or inline-fallback `['LZ', 'AC']` until that lands).

---

## 3. Plan

### Phase A — forms preflight matrix, manual run only

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Probe library | `server/utils/preflightProbes.js` (NEW) | Pure functions per dep id from §2.4. Each returns `{ status: 'ok'\|'warn'\|'fail'\|'skip', latencyMs, detail }`. 3s per-probe timeout. All read-only. |
| A2 | Forms catalog + aggregator route | `server/routes/formsPreflight.js` (NEW), [server/index.js](../../server/index.js) | Declarative `FORMS` registry from §2.3. `GET /api/forms-preflight` runs every distinct dep once (de-duped), maps results across forms, returns matrix payload. `?force=1` bypasses 60s in-memory cache. Dev-group gate. App Insights `Forms.Preflight.*` events. |
| A3 | Activity matrix panel | `src/tabs/roadmap/parts/FormsPreflightMatrix.tsx` (NEW), [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx), [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx), [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) | Extend `ActivityLens` with `'preflight'`. Lens chip in ActivityHero. FocalSurface routes the new lens to the matrix. Helix design tokens only. `borderRadius: 0`. |
| A4 | Retire stale UI | [src/CustomForms/shared/FormHealthCheck.tsx](../../src/CustomForms/shared/FormHealthCheck.tsx) | Delete the standalone screen (matrix supersedes it). Keep RouteHealthIndicator and HubToolsChip — different purpose. Verify no callers via grep before delete. |

**Phase A acceptance:**
- LZ opens Activity → `Preflight` lens chip is visible.
- One click → matrix renders (rows = forms, columns = deps) in <5s.
- Each cell = green/orange/red/grey dot using `colours.green`/`colours.orange`/`colours.cta`/`colours.subtleGrey`.
- Hover tooltip shows dep name, latencyMs, detail.
- Row click expands accordion with full check list + raw error text.
- Header shows last-run timestamp + `fromCache` badge + `[Run all]` `[Re-run failures]`.
- Zero production side-effects (verifiable: no new Asana tasks, no new emails, no new SQL inserts in non-probe tables).
- 403 from `/api/forms-preflight` for non-dev-group users.
- App Insights records `Forms.Preflight.Run.Started/Completed/Failed`.

#### Phase A response contract (frozen)

```ts
{
  startedAt: string,            // ISO
  completedAt: string,          // ISO
  durationMs: number,
  fromCache: boolean,
  dependencies: {
    [depId: string]: { status: 'ok'|'warn'|'fail'|'skip', latencyMs: number, detail?: string }
  },
  forms: Array<{
    id: string,
    title: string,
    route: string,
    overall: 'ok'|'warn'|'fail',
    checks: Array<{ depId: string, status: 'ok'|'warn'|'fail'|'skip', latencyMs: number, detail?: string }>
  }>,
  summary: { ok: number, warn: number, fail: number, total: number }
}
```

If sibling brief Phase A has already shipped, **A1+A2 collapse into**: register a `forms-preflight-matrix` entry inside `server/utils/opsCheckCatalog.js` whose `run()` returns this same contract, and replace direct `/api/forms-preflight` fetches with `POST /api/ops-checks/run/forms-preflight-matrix`. The matrix component (A3) is unchanged.

### Phase B — write-capability + token expiry + cached snapshot

#### B1. `__preflight_pings` table

Tiny table for proving audit-log write capability. DDL:

```sql
CREATE TABLE __preflight_pings (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  ranAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ranBy NVARCHAR(16) NOT NULL,
  source NVARCHAR(64) NOT NULL
);
-- Daily TRUNCATE via existing scheduler (or a 7-day TTL delete).
```

Audit probe inserts one row, then `SELECT TOP 1 ORDER BY id DESC`. Confirms write+read both work.

#### B2. Token-expiry telemetry

Promote Asana, Graph, and Clio token TTLs from `detail` strings to first-class probe outputs (`expiresInMinutes`). Threshold: `warn` if <60 min, `fail` if expired.

#### B3. Scheduled snapshot (still no alerts)

Run the matrix server-side every 15 min (in prod), persist last result to in-memory + Redis (60s TTL bypass for forced runs). UI shows when the cached snapshot was taken so the operator's "one click" returns instantly unless they hit `Re-run`.

**Phase B acceptance:**
- `__preflight_pings` table exists, audit probe inserts and reads.
- Token cells show TTL remaining; expired tokens render red.
- Default matrix view loads in <500ms because it reads the cached snapshot.

### Phase C — alert hooks (out of scope unless asked)

Out of scope by default. Ship A and B; only add Teams/email alerts if user explicitly requests.

---

## 4. Step-by-step execution order

1. **A1** — `server/utils/preflightProbes.js` with all §2.4 probes. Unit-shape return. No side effects.
2. **A2** — `server/routes/formsPreflight.js` + mount in `server/index.js`. Telemetry. Dev-group gate. 60s cache.
3. **Mid-A validation** — `curl -H "x-user-initials: LZ" http://localhost:8080/api/forms-preflight | jq .summary` returns sane numbers locally.
4. **A3** — Matrix panel + lens wiring in ActivityHero/FocalSurface/Roadmap.
5. **A4** — Grep for `FormHealthCheck` callers; if zero, delete the file. Document in changelog.
6. **Phase A acceptance walk** — open Activity as LZ, run matrix, hover each cell, drill into a failed row, confirm App Insights events.
7. **B1** — `__preflight_pings` DDL + audit probe upgrade.
8. **B2** — Token TTL fields.
9. **B3** — Scheduled snapshot + cached-first UX.

Each phase = independent changelog entry.

---

## 5. Verification checklist

**Phase A:**
- [ ] `GET /api/forms-preflight` (LZ initials header) returns Phase A response contract (§3).
- [ ] `GET /api/forms-preflight` (non-dev-group) returns 403.
- [ ] Activity → `Preflight` lens visible to dev-group only.
- [ ] Matrix renders all forms × deps; failures visually obvious.
- [ ] Zero new rows in production tables after a run (spot-check Asana, formSubmissionLog, transactions, instructions).
- [ ] App Insights: `Forms.Preflight.Run.Started`, `Forms.Preflight.Run.Completed`, `Forms.Preflight.Run.Failed`, `Forms.Preflight.Probe.Failed`, metric `Forms.Preflight.Duration`.
- [ ] No regression in `/api/form-health` or `/api/route-health` (existing UIs still work).

**Phase B:**
- [ ] `__preflight_pings` table created; audit probe inserts + reads succeed.
- [ ] Token cells display `expiresInMinutes`; <60 min = warn, expired = fail.
- [ ] Cached snapshot loads matrix in <500ms; force-run rebuilds.

---

## 6. Open decisions (defaults proposed)

1. **Lens label** — Default: **`Preflight`**. Rationale: shorter than "Forms preflight", consistent with one-word lens chips (`forms`, `sync`, `errors`).
2. **Tab placement** — Default: **new lens inside Activity (Roadmap.tsx)**, not a panel beside the live monitor. Rationale: lens model is already the pattern; panels are heavier.
3. **Sibling brief integration** — Default: **build standalone in Phase A, fold into `opsCheckCatalog.js` later**. Rationale: don't block on sibling Phase A. Response contract is frozen so the merge is mechanical.
4. **Tiller probe** — Default: **`skip` with explanatory detail if no health endpoint exists**. Rationale: never invent a probe that creates real verifications.
5. **Cache TTL** — Default: **60s**. Rationale: forms don't break in 60s windows; protects deps from probe storms.

---

## 7. Out of scope

- Auto-remediation of any failed probe.
- Scheduled background runs in dev (B3 prod only).
- Alerting integrations (Teams/email/PagerDuty).
- Per-form synthetic full-submission tests (use form unit tests for that).
- Replacing `RouteHealthIndicator` (different purpose).
- Adding new probes beyond §2.4 dep list.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — host (lens wiring)
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) — extend `ActivityLens` union + chip
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — route `'preflight'` lens to matrix
- `src/tabs/roadmap/parts/FormsPreflightMatrix.tsx` (NEW) — the matrix component
- [src/CustomForms/shared/FormHealthCheck.tsx](../../src/CustomForms/shared/FormHealthCheck.tsx) — DELETE in A4 (after grep confirms no callers)

Server:
- `server/utils/preflightProbes.js` (NEW) — probe library
- `server/routes/formsPreflight.js` (NEW) — aggregator route
- [server/index.js](../../server/index.js) — mount the route
- [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js) — keep, route probe reuses it
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — telemetry import
- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) — read-only probe target

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: forms-preflight-matrix-in-activity-tab
verified: 2026-04-28
branch: main
touches:
  client:
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/ActivityHero.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/parts/FormsPreflightMatrix.tsx
    - src/CustomForms/shared/FormHealthCheck.tsx
  server:
    - server/index.js
    - server/routes/formsPreflight.js
    - server/utils/preflightProbes.js
    - server/routes/formHealthCheck.js
  submodules: []
depends_on: []                    # can ship without sibling, but folds in cleanly afterwards
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - forms-stream-persistence
  - forms-ia-ld-undertaking-complaint-flow
  - clio-webhook-reconciliation-and-selective-rollout
  - realtime-multi-replica-safety
  - resources-tab-restructure-with-templates-section
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Activity tab = Roadmap.tsx.** There is no `src/tabs/activity/`. The user calls it "Activity" because of the header comment and because it hosts changelog + ops-pulse + traces.
- **Dev-group gate mismatch.** [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) uses `['LZ', 'AC']`; UI uses `isDevGroupOrHigher`. New route MUST pick one and document it. Sibling brief proposes `server/utils/userTier.js` — if it exists when this brief is picked up, use it; otherwise inline `['LZ', 'AC']` and add a TODO referencing the sibling.
- **Asana token rotation** lives in env / KV; the probe must read the same source as the live route or it will green-light a config that the real form would fail with.
- **Tiller has no documented health endpoint** at time of writing. Verify by reading the existing Tiller helper before implementing — if none exists, return `skip` with detail `"No health endpoint exposed by Tiller; use full verify flow to test"` rather than inventing one.
- **`SELECT 1` on Instructions DB** uses `INSTRUCTIONS_SQL_CONNECTION_STRING`, not `SQL_CONNECTION_STRING`. Do not collapse them — they are different servers.
- **Cache invalidation** — when a form's dep changes (e.g. Asana token rotated), the cached snapshot will lie for up to 60s. Acceptable for v1; document in panel UI.
- **Existing `formHealthCheck.js` `notable-case-info` probe** depends on env vars `REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH` + `_CODE`. If those are missing it throws — propagate as `skip` not `fail`.
- **Do not POST to `/api/forms-preflight`.** GET only. POST shape is reserved for sibling brief's `/api/ops-checks/run/:id`.
- **HMR/SSE survival** — if the matrix grows a live-refresh feed in Phase B, follow [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md): pair `disposeOnHmr` with `onServerBounced`.
