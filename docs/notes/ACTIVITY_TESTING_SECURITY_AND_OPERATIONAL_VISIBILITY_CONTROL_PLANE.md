# Activity testing security and operational visibility control plane

> **Purpose of this document.** Self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-27 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.
>
> **Sibling brief.** This brief explicitly extends [ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md](./ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md). If that brief has already shipped Phase A, skip §3 Phase A here and start at Phase B. If it hasn't, ship its Phase A first — this brief assumes the `checks` lens, `opsCheckCatalog.js`, and `ops-checks.js` route exist.

---

## 1. Why this exists (user intent)

User quotes from the originating session:

> "scope the current implementation in terms of 'testing'. testing things work, compile, prod/staging/local visibility. all that … lock down controls and visibility into operations at that kind of security level. documentation on rotating keys and leaks and things you know?"

> "do one more round of orienting and consider the activity tab as other operations are already tracked over there"

> "one brief. need new table please. not sure about staging setting but we can sort that if required. use azure cli to see but please don't change or edit anything without my say."

The ask is to land a single, Activity-anchored control plane that covers **(a)** testing & build confidence, **(b)** prod/staging/local visibility, and **(c)** the security posture (auth, secrets, headers, audit trail, rotation runbooks). The user does **not** want a parallel dashboard, a generic SaaS observability tool, or any direct mutation of Azure resources, Git repos, or production tables during scoping. A new SQL table for the audit log is approved.

---

## 2. Current state — verified findings

All file/line refs verified 2026-04-27 against branch `main`. Re-verify if reading >30 days later.

### 2.1 Activity tab is already a dev-group control plane

- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — gated with `isDevGroupOrHigher(primaryUser)`, wires `useOpsPulse(showLiveMonitor)`.
- [src/app/admin.ts](../../src/app/admin.ts) — `isDevGroupOrHigher(user)` definition, Activity visibility helper.
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) — `ActivityLens = 'all' | 'forms' | 'matters' | 'sync' | 'errors' | 'trace' | 'briefs'`.
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — switches between lens panels.

Implication: every new lens added by this brief must extend the union here, not invent a sibling surface.

### 2.2 Ops Pulse provides a reusable channel factory

- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) — defines `createOpsPulseChannel({ eventName, bufferSize, maxAgeMs, normalize })`; existing channels: `errorsChannel`, `doubledApiChannel`.
- SSE stream + REST snapshot exposed via the route.
- [src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts) — auth-probes `/api/ops-pulse/snapshot` first, then opens EventSource, HMR/server-bounce safe.

Implication: each new failure class (security rejections, rate-limit hits, CSP violations, audit log) is ~5 LOC of channel + 1 SSE event subscription, not a new route.

### 2.3 Server-side dev-group gate is hard-coded and mismatched

- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) — `isDevGroup(req)` returns `['LZ', 'AC'].includes(initials)`.
- [src/app/admin.ts](../../src/app/admin.ts) — UI uses `isDevGroupOrHigher`, which is a wider set (LZ, AC, plus admins per tier).

Implication: any new admin-only endpoint added here must use a single canonical helper. We will introduce `server/utils/userTier.js` (NEW) so UI and server share the definition.

### 2.4 Telemetry is rich, surfacing is shallow

- [server/utils/appInsights.js](../../server/utils/appInsights.js) — `trackEvent`, `trackException`, `trackMetric`, `trackDependency`. `client.context.tags[cloudRole] = 'helix-hub-server'`.
- Already-emitted security events: `Security.RequireUser.Rejected` ([server/middleware/requireUser.js](../../server/middleware/requireUser.js)), `Security.RateLimit.Exceeded`, `Security.RateLimit.AI.Exceeded` ([server/index.js](../../server/index.js)).
- No client-side surface for any of these events. Operators must open KQL.

### 2.5 Auth & header posture today

- [server/middleware/requireUser.js](../../server/middleware/requireUser.js) — bypassed entirely when `NODE_ENV !== 'production'`. Whitelist of public routes at the top of the file.
- [server/index.js](../../server/index.js) — `helmet({ contentSecurityPolicy: false, strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false })`. Rate limits applied only `if (isProd)`.
- CORS allowlist read from `ALLOWED_ORIGINS` env. No boot-time assertion that the prod list is non-empty.

Implication: staging behaviour depends entirely on whether `NODE_ENV` is set to `production` on the slot. **This is unverified** at time of writing — Azure CLI was used read-only for inventory, no app settings were inspected. Treat the staging gate as "must verify, then enforce".

### 2.6 Secrets path

- [server/utils/getSecret.js](../../server/utils/getSecret.js) — Key Vault helper. In dev, persists to `.secrets-cache.json` at the repo root, mode 0o600, 7-day TTL. Dev-only by design but is the single biggest "ambient leak" risk on a developer laptop.
- [server/utils/clioAuth.js](../../server/utils/clioAuth.js) — only secret class with automated rotation today (Clio refresh-token write-back to Key Vault).
- No documented rotation cadence for: SQL passwords, Clio webhook secret, Stripe webhook secret, app registration certs/secrets, Bot Framework, Communication Services keys, Azure Storage keys.

### 2.7 Existing health and audit surfaces

- [server/routes/health.js](../../server/routes/health.js) — `/api/health`, `/api/health/system`, circuit breaker view.
- [server/routes/devHealth.js](../../server/routes/devHealth.js) — `/api/dev/health` returning `bootId, uptime, pid, lazyInit, nodeEnv` (dev only).
- [server/utils/opLog.js](../../server/utils/opLog.js) — JSONL append to `server/logs/ops.log.jsonl`, in-memory ring buffer. **Not durable across restarts in any meaningful way; not queryable.**
- No durable audit log for sensitive actions today.

### 2.8 CI and deploy posture

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — runs `npm run test:server --silent` + `npm run build`. No `tsc --noEmit`, no client jest, no lint, no audit, no secret scan, no coverage gate.
- Two test files invisible to the current configuration:
  - [server/routes/__tests__/enquiries-unified.update.test.ts](../../server/routes/__tests__/enquiries-unified.update.test.ts) — `.ts` rejected by [jest.server.config.js](../../jest.server.config.js) which requires `.test.js`.
  - `server/__tests_/ccl.test.js` — single-underscore directory, not matched by `server/__tests__/**`.
- [build-and-deploy.ps1](../../build-and-deploy.ps1) and [build-and-deploy-staging.ps1](../../build-and-deploy-staging.ps1) — local PowerShell `az webapp deploy`. No smoke test, no slot-swap verification, no rollback hook (staging script has a build-output sanity check; prod doesn't).

### 2.9 Azure inventory (read-only via `az resource list`, 2026-04-27)

Subscription: `Helix Automations` (`57414284-bf79-487f-9317-7a4f9e37dfdf`), tenant `7fbc252f-3ce5-460f-9740-4e1cb8bf78b8`. Region: `uksouth` (one alert/AI workspace in `eastus`, NetworkWatcher in `ukwest`).

Security-relevant resources within scope of this brief:

| Resource | RG | Notes |
|---|---|---|
| Key Vault `Helix-Keys` | `Main` | Primary KV — SQL passwords, Clio creds, webhook secrets, integrations |
| Key Vault `kv-helix-aiden` | `Instructions` | Aiden mailbox / Graph creds |
| App Service `link-hub-v1` (+ slot `staging`) | `Main` / `main` | This app. **Slot `NODE_ENV` value unverified.** |
| App Service `instruct-helixlaw-pitch` (+ slot `staging`) | `Instructions` | instruct-pitch sibling |
| App Service `enquiry-processing` | `Enquiries` | enquiry-processing sibling |
| Function Apps | `Instructions`, `Enquiries`, `Recruitment`, `Compliance`, `Tasking`, `Matters`, `Content`, `operations` | Decoupled functions across the platform |
| Front Door + WAF `instructions-frontdoor` / `instructhelixlawwafpolicy` | `Instructions` | Public ingress for instruct-pitch |
| SQL Servers (`helixlaw-instructions`, `helix-operations-sql`, `helix-recruitment-sql`) | `Instructions`, `operations`, `Recruitment` | 2 DBs each |
| Redis `helix-cache-redis` | `Main` | Shared cache |
| App Insights instances | every RG with a workload | Already wired into this app via `APPLICATIONINSIGHTS_CONNECTION_STRING` |
| Communication Services + Email domain | `Playground` | Email sending infra |
| Bot Services | `Main`, `Tasking` | Teams bots |
| Storage Accounts | several | Document/blob storage per RG |

This inventory bounds the security work: the rotation runbook (Phase D) needs to enumerate secrets per KV, and the dependency board (Phase B) should ping the resources we actually consume from this app (Helix-Keys, both SQL servers, Redis, App Insights, possibly the Front Door endpoint health).

### 2.10 Existing related stash briefs (do not duplicate)

Found via `node tools/stash-precheck.mjs` 2026-04-27:

- **Sibling extended:** [ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md](./ACTIVITY_ROUTE_LIVE_CHECKS_AND_PROD_PARITY_SURFACE.md) — Phase A defines `checks` lens + `opsCheckCatalog.js` + `ops-checks.js`. **This brief assumes that lands first.**
- Coordinates (same files, different intent):
  - [NODE_22_PRODUCTION_ROLLOUT_FOR_LINK_HUB_V1.md](./NODE_22_PRODUCTION_ROLLOUT_FOR_LINK_HUB_V1.md) — touches deploy scripts.
  - [REALTIME_MULTI_REPLICA_SAFETY.md](./REALTIME_MULTI_REPLICA_SAFETY.md), [SESSION_PROBING_ACTIVITY_TAB_VISIBILITY_AND_PERSISTENCE.md](./SESSION_PROBING_ACTIVITY_TAB_VISIBILITY_AND_PERSISTENCE.md), [CLIO_WEBHOOK_RECONCILIATION_AND_SELECTIVE_ROLLOUT.md](./CLIO_WEBHOOK_RECONCILIATION_AND_SELECTIVE_ROLLOUT.md) — touch `server/index.js`.
  - [VAULT_ROOM_DEVELOPER_HYGIENE_HMR_DEV_PERFORMANCE_AND_AI_CLUTTER_GUARDRAILS.md](./VAULT_ROOM_DEVELOPER_HYGIENE_HMR_DEV_PERFORMANCE_AND_AI_CLUTTER_GUARDRAILS.md) — touches `useOpsPulse.ts`.
  - [RESOURCES_TAB_RESTRUCTURE_WITH_TEMPLATES_SECTION.md](./RESOURCES_TAB_RESTRUCTURE_WITH_TEMPLATES_SECTION.md) — touches `Roadmap.tsx`.

None block this brief; all are coordinated via the metadata block in §8.

---

## 3. Plan

Five phases, each independently shippable, each its own changelog entry. Phase A is the smallest correct first step (CI gate + canonical user-tier helper). Everything else builds on it.

### Phase A — CI gate hardening + canonical user-tier helper

Smallest safe deposit. No UX change, no DB change, no Azure change.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add `tsc --noEmit` and client jest to CI | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | Two new steps before `Build`. Keep `--silent` on tests. |
| A2 | Fix invisible test files | rename `server/__tests_/ccl.test.js` → `server/__tests__/routes/ccl.test.js`; update [jest.server.config.js](../../jest.server.config.js) `testMatch` to also accept `.test.ts` via `ts-jest` so [server/routes/__tests__/enquiries-unified.update.test.ts](../../server/routes/__tests__/enquiries-unified.update.test.ts) is picked up | Reuse `ts-jest` already in devDeps. |
| A3 | Add gitleaks and `npm audit` (informational) | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | `gitleaks/gitleaks-action@v2` step + `npm audit --omit=dev --audit-level=high \|\| true` — informational at first. |
| A4 | Add Dependabot config | `.github/dependabot.yml` (NEW) | npm + GitHub Actions, weekly. |
| A5 | Canonical user-tier helper for server routes | `server/utils/userTier.js` (NEW) | Single source: `isDevGroup(req)`, `isAdmin(req)`, `isDevOwner(req)`. Replace inline `['LZ','AC']` in [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js). |

**Phase A acceptance:**
- CI fails when `tsc --noEmit` or any jest test fails (server or client).
- The two previously invisible tests appear in CI output.
- gitleaks and `npm audit` produce a report (informational), not yet a hard fail.
- Dependabot opens its first PR within a week.
- `git grep "['LZ', 'AC']"` returns 0 hits in `server/`.

### Phase B — `security` lens in Activity (read-only)

Adds the operator-grade visibility surface for everything we already emit but don't show.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | New ops-pulse channels | [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) | `securityChannel`, `rateLimitChannel`, `cspChannel` via existing `createOpsPulseChannel` factory (5 LOC each). |
| B2 | Wire emitters | [server/middleware/requireUser.js](../../server/middleware/requireUser.js), [server/index.js](../../server/index.js) | Push to `securityChannel` / `rateLimitChannel` next to existing `trackEvent` calls. No behaviour change. |
| B3 | Extend `useOpsPulse` | [src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts), [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) | Add `security`, `rateLimits`, `csp` fields to `OpsPulseState` and SSE listeners. |
| B4 | New lens | [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx), [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) | Add `'security'` to `ActivityLens`, render new `SecurityPanel`. |
| B5 | Build the panel | `src/tabs/roadmap/parts/SecurityPanel.tsx` (NEW) | Five sub-cards: AuthGate (rejected requests last 24h grouped by path+IP), RateLimits (global + AI), HeaderPosture (CSP/HSTS/X-Frame, CORS allowlist size), SecretFreshness (last-modified per KV secret, flag >90d), AuditLog (last 50 entries — see Phase C). |
| B6 | Backing endpoints | `server/routes/security-board.js` (NEW), mounted at `/api/security-board` in [server/index.js](../../server/index.js) | Sub-routes: `/headers` (live snapshot), `/secrets-freshness` (KV `listPropertiesOfSecrets()` metadata only — no values, never), `/whoami` (resolved identity + headers used). All gated by `isAdmin` from Phase A's helper. |

**Phase B acceptance:**
- Dev-group user opens Activity → `Security` lens chip visible. Admin tier visible. Standard users do not see the chip.
- AuthGate card shows live count + 5 most recent rejections, anonymised IPs (last octet masked).
- RateLimits card shows global + AI windows with last-hour and last-24h counts.
- HeaderPosture shows pass/fail for CSP / HSTS / X-Frame-Options / `ALLOWED_ORIGINS` non-empty in current env.
- SecretFreshness lists secrets in `Helix-Keys` and `kv-helix-aiden` with last-modified date; >90d highlighted. **Values never leave the server.**
- App Insights events `Security.Board.*` visible (`Security.Board.SecretsFreshness.Requested`, `Security.Board.Headers.Requested`, etc.).
- No values for any secret are returned by any new endpoint. Verified via inspection of `security-board.js`.

### Phase C — durable audit log (new SQL table)

The user explicitly approved a new table. Source DB: **Core Data** (`SQL_CONNECTION_STRING`) — keeps audit data adjacent to existing operational tables and out of the more sensitive Instructions DB.

#### C1. Schema

```sql
-- Core Data DB: helix-core-data
CREATE TABLE dbo.audit_log (
    id              BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ts_utc          DATETIME2(3)         NOT NULL DEFAULT SYSUTCDATETIME(),
    actor_initials  NVARCHAR(8)          NULL,
    actor_email     NVARCHAR(256)        NULL,
    actor_entra_id  NVARCHAR(64)         NULL,
    action          NVARCHAR(64)         NOT NULL,    -- e.g. 'matter.create', 'user.switch', 'admin.override', 'secret.read'
    target_type     NVARCHAR(32)         NULL,        -- e.g. 'matter', 'instruction', 'enquiry', 'secret'
    target_id       NVARCHAR(128)        NULL,        -- ref/id only; never PII
    http_status     INT                  NULL,
    http_method     NVARCHAR(8)          NULL,
    request_path    NVARCHAR(256)        NULL,
    ip_masked       NVARCHAR(64)         NULL,        -- last octet zeroed for IPv4
    user_agent      NVARCHAR(256)        NULL,
    env             NVARCHAR(16)         NOT NULL,    -- 'production' | 'staging' | 'development'
    boot_id         NVARCHAR(64)         NULL,
    extra_json      NVARCHAR(MAX)        NULL         -- structured context, no PII
);
CREATE INDEX IX_audit_log_ts_utc        ON dbo.audit_log (ts_utc DESC);
CREATE INDEX IX_audit_log_action_ts     ON dbo.audit_log (action, ts_utc DESC);
CREATE INDEX IX_audit_log_actor_ts      ON dbo.audit_log (actor_initials, ts_utc DESC);
CREATE INDEX IX_audit_log_target        ON dbo.audit_log (target_type, target_id);
```

Migration script: `scripts/init-audit-log-table.mjs` (NEW), parameterised connection via `SQL_CONNECTION_STRING`. Idempotent (`IF OBJECT_ID('dbo.audit_log') IS NULL`).

#### C2. Helper

```js
// server/utils/auditLog.js (NEW)
const { append: opAppend } = require('./opLog');
const { trackEvent, trackException } = require('./appInsights');
const sql = require('mssql');
const { getPool } = require('./db'); // or whichever pool helper exists

function maskIp(ip) {
  if (!ip) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, '.0');
  return ip.split(':').slice(0, 4).join(':') + '::';
}

async function recordAudit(req, { action, targetType, targetId, httpStatus, extra } = {}) {
  try {
    const pool = await getPool(process.env.SQL_CONNECTION_STRING);
    await pool.request()
      .input('actor_initials', sql.NVarChar(8), req.user?.initials || null)
      .input('actor_email', sql.NVarChar(256), req.user?.email || null)
      .input('actor_entra_id', sql.NVarChar(64), req.user?.entraId || null)
      .input('action', sql.NVarChar(64), action)
      .input('target_type', sql.NVarChar(32), targetType || null)
      .input('target_id', sql.NVarChar(128), targetId ? String(targetId).slice(0, 128) : null)
      .input('http_status', sql.Int, httpStatus || null)
      .input('http_method', sql.NVarChar(8), req.method)
      .input('request_path', sql.NVarChar(256), req.path)
      .input('ip_masked', sql.NVarChar(64), maskIp(req.ip))
      .input('user_agent', sql.NVarChar(256), (req.get('user-agent') || '').slice(0, 256))
      .input('env', sql.NVarChar(16), process.env.NODE_ENV || 'development')
      .input('boot_id', sql.NVarChar(64), global.__helixBootId || null)
      .input('extra_json', sql.NVarChar(sql.MAX), extra ? JSON.stringify(extra) : null)
      .query(`
        INSERT INTO dbo.audit_log (actor_initials, actor_email, actor_entra_id, action, target_type, target_id,
                                   http_status, http_method, request_path, ip_masked, user_agent, env, boot_id, extra_json)
        VALUES (@actor_initials, @actor_email, @actor_entra_id, @action, @target_type, @target_id,
                @http_status, @http_method, @request_path, @ip_masked, @user_agent, @env, @boot_id, @extra_json);
      `);
    trackEvent('Audit.Recorded', { action, targetType, targetId });
  } catch (err) {
    trackException(err, { component: 'AuditLog', action });
    opAppend({ type: 'audit', action: 'audit.write.failed', status: 'error', err: err.message });
  }
}

module.exports = { recordAudit };
```

#### C3. Call sites (Phase C scope, conservative seed)

- **Matter creation** — [server/routes/openAnotherMatter.js](../../server/routes/openAnotherMatter.js) on success: `recordAudit(req, { action: 'matter.create', targetType: 'matter', targetId: instructionRef })`.
- **User switch** — wherever the UI calls a switch endpoint (locate via grep `user.switch` / `set-active-user`): `action: 'user.switch'`.
- **Admin overrides** — find all routes mounted with the new `isAdmin` helper from Phase A; wrap with a tiny `auditAdmin` middleware that records on 2xx.
- **Secret reads from new endpoints** — `action: 'secret.read'`, `targetId` = secret name (names only, never values).

Out of scope for Phase C: backfilling every existing route. Pick the four call sites above as the minimum useful seed. Expand in a follow-up if required.

#### C4. Read endpoint for the Activity panel

- `GET /api/security-board/audit?limit=50&action=...&actor=...` in `server/routes/security-board.js` — admin-gated, paginated, returns the rows directly.

**Phase C acceptance:**
- New table exists in Core Data DB; migration script runs idempotently.
- Matter creation, user switch, admin override, and secret read each generate exactly one row per action.
- Last 50 rows render in the Security panel's Audit card.
- IP last octet is zeroed in stored rows (`SELECT TOP 5 ip_masked FROM dbo.audit_log` shows `.0`).
- App Insights `Audit.Recorded` events present.

### Phase D — secret & key lifecycle docs + dev cache hardening

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Inventory doc | `docs/security/SECRETS_INVENTORY.md` (NEW) | Per-KV table: secret name, consumer, owner, rotation cadence, link to runbook step. |
| D2 | Rotation runbook | `docs/security/KEY_ROTATION.md` (NEW) | Step-by-step per class: SQL passwords, Clio OAuth, Stripe webhook, Clio webhook, app reg secrets/certs, Bot Framework, Communication Services. Each step copy-pasteable. |
| D3 | Leak response runbook | `docs/security/LEAKED_SECRET_RESPONSE.md` (NEW) | Hour-zero playbook: revoke → rotate → audit access logs → notify → write up. Linked from `copilot-instructions.md`. |
| D4 | Dev secret cache hardening | [server/utils/getSecret.js](../../server/utils/getSecret.js) | TTL 7d → 24h. Flip default to opt-in: only persist if `HELIX_SECRET_CACHE=1`. Inline JSDoc warning about laptop-loss risk. Boot log line states whether the cache is active. |
| D5 | Reference from copilot instructions | `.github/copilot-instructions.md` | Add a one-line pointer in the Security section to the three new runbook files (do not duplicate content). |

**Phase D acceptance:**
- Three runbook files exist, internally consistent, and are linked from `copilot-instructions.md`.
- `.secrets-cache.json` is no longer created on disk by default in dev. Setting `HELIX_SECRET_CACHE=1` re-enables it with 24h TTL.
- Boot log line: `[Secrets] dev cache: disabled (set HELIX_SECRET_CACHE=1 to enable, 24h TTL)`.

### Phase E — release smoke pack and `requireUser` parity

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Release smoke pack | extend [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) (from sibling brief) | Add `pack: 'release-smoke'` tag to a curated subset of safe checks: dev-health, secrets-freshness, header-posture, ops-pulse-snapshot, route-health, key SQL pings (no rows). |
| E2 | Pack runner endpoint | extend [server/routes/ops-checks.js](../../server/routes/ops-checks.js) (from sibling brief) | `POST /api/ops-checks/run-pack/:pack` returns one combined `pass / warn / fail` plus per-check breakdown. |
| E3 | UI: release lens or button | extend [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) (from sibling brief) | Either a new `release` lens or a "Run release smoke" CTA on the existing `checks` lens. Default: button on `checks` lens (less surface area). |
| E4 | CI deploy-time smoke | new GitHub Action job (post-deploy) | Workflow that POSTs to `/api/ops-checks/run-pack/release-smoke` against the staging slot after deploy; fails the run if combined verdict is not `pass`. Block prod swap on this. |
| E5 | Boot-time prod assertions | [server/index.js](../../server/index.js) | In prod: assert `ALLOWED_ORIGINS` is non-empty; assert `requireUser` is mounted; emit `Server.Boot.Assertions.Passed/Failed` to App Insights. Crash on assertion failure. |
| E6 | Staging `NODE_ENV` parity | App Service config (manual, **user-confirmed before any change**) | Verify `link-hub-v1-staging` has `NODE_ENV=production`; if not, surface in the HeaderPosture card so it is visible until fixed. **Do not change Azure config from this brief — escalate to user.** |

**Phase E acceptance:**
- Operator can press one button in Activity and get a combined release verdict in <10 seconds.
- A failing dependency (e.g. KV unreachable, header missing) names itself in the verdict; not a generic 500.
- CI deploy job runs the same pack post-staging-deploy and blocks prod swap on failure.
- Boot logs in prod show `Server.Boot.Assertions.Passed`. Test by removing `ALLOWED_ORIGINS` locally with `NODE_ENV=production` — expect crash.
- The HeaderPosture card flags the staging slot if `NODE_ENV` ≠ `production` until the App Service config is corrected.

---

## 4. Step-by-step execution order

1. **A1, A2, A3, A4, A5** — CI hardening + canonical helper. Single PR. No runtime change.
2. **B1, B2** — wire new ops-pulse channels + emitters. No UI yet. Verify SSE events arrive via `EventSource` in DevTools.
3. **B3, B4, B5, B6** — extend hook + add `security` lens + new endpoints. Per-card UX.
4. **C1** — run migration script against Core Data DB. **User-confirmed first** (running DDL is hard-to-reverse).
5. **C2, C3** — helper + four call sites.
6. **C4** — read endpoint, render Audit card.
7. **D1, D2, D3** — write runbooks. Independent of code.
8. **D4, D5** — dev cache hardening + instruction pointer.
9. **E1, E2, E3** — extend sibling-brief catalog + UI button.
10. **E4** — CI deploy-time smoke job.
11. **E5** — prod boot assertions.
12. **E6** — verify staging `NODE_ENV`. **User decides** when to flip the App Service config (out of scope for an agent acting unattended).

Each phase = one changelog entry. Each phase is independently revertable.

---

## 5. Verification checklist

**Phase A:**
- [ ] CI run on a no-op PR shows `tsc --noEmit`, server jest, client jest, gitleaks, `npm audit` steps.
- [ ] [server/routes/__tests__/enquiries-unified.update.test.ts](../../server/routes/__tests__/enquiries-unified.update.test.ts) appears in jest output.
- [ ] `git grep -n "\['LZ', 'AC'\]" server/` returns no results.
- [ ] Dependabot config validated by GitHub UI.

**Phase B:**
- [ ] In Activity, the `Security` chip is visible to dev-group, hidden to standard users.
- [ ] Triggering a 401 (curl `/api/matters` without identity headers in prod or with prod-mode local) increments AuthGate count within 5 seconds (SSE).
- [ ] `GET /api/security-board/secrets-freshness` returns `[{ name, lastModifiedUtc, ageDays, flag }]` with no `value` field. Verified by inspecting response and source.
- [ ] App Insights events `Security.Board.*` visible.

**Phase C:**
- [ ] SQL spot check: `SELECT TOP 1 * FROM dbo.audit_log ORDER BY ts_utc DESC` returns the most recent action.
- [ ] `SELECT action, COUNT(*) FROM dbo.audit_log GROUP BY action` shows all four seed actions after exercising them.
- [ ] All `ip_masked` values end in `.0` (IPv4) or `::` (IPv6).
- [ ] App Insights `Audit.Recorded` events present.

**Phase D:**
- [ ] `docs/security/SECRETS_INVENTORY.md` covers every secret in `Helix-Keys` and `kv-helix-aiden`.
- [ ] `KEY_ROTATION.md` includes copy-pasteable steps for each class.
- [ ] Fresh `git status` after `npm run dev:fast` shows no `.secrets-cache.json` (default disabled).
- [ ] Setting `HELIX_SECRET_CACHE=1` re-creates the file with `cachedAt` newer than 24h ago after subsequent boots.

**Phase E:**
- [ ] Pressing the smoke button in Activity returns a JSON verdict in <10s with per-check breakdown.
- [ ] CI deploy-staging workflow exits non-zero when a known-broken check is forced.
- [ ] `NODE_ENV=production` boot without `ALLOWED_ORIGINS` exits 1 with a clear assertion message.

---

## 6. Open decisions (defaults proposed)

1. **Audit table location** — Default: **Core Data DB** (`SQL_CONNECTION_STRING`). Rationale: keeps audit adjacent to existing operational tables, less sensitive than Instructions DB, easier ops access.
2. **Secret values exposure** — Default: **never**. Endpoints return metadata only (`name`, `lastModifiedUtc`, `enabled`). No code path returns `secret.value`.
3. **Phase C call-site seed** — Default: **four** (matter create, user switch, admin override middleware, secret reads). Rationale: small enough to land cleanly; expand in a follow-up if useful.
4. **Lens vs button for release smoke** — Default: **button on the existing `checks` lens**. Rationale: less Activity chrome, reuses sibling-brief surface.
5. **Server-side dev-group helper signature** — Default: `isDevGroup(req) | isAdmin(req) | isDevOwner(req)` reading `req.user.initials` + `req.user.aow`. Rationale: matches `src/app/admin.ts` semantics exactly.
6. **CSP rollout** — Default: **deferred to a Phase F follow-up brief** (not this one). Rationale: `cspChannel` is plumbed in Phase B; the actual policy + report-only → enforcing rollout is large enough to merit its own brief.
7. **Staging `NODE_ENV` change** — Default: **flag in HeaderPosture, do not flip**. Rationale: changing App Service config is hard-to-reverse and user explicitly reserved that decision.
8. **gitleaks failure mode** — Default: **informational in Phase A, hard-fail in a Phase F follow-up after a clean baseline**. Rationale: avoid a noisy first run blocking unrelated PRs.

---

## 7. Out of scope

- Any change to Azure resources (App Service config, KV access policies, SQL firewall, WAF rules). Scoping this brief used `az resource list` read-only only; nothing was modified.
- Any change to the Instructions DB schema. New table is in Core Data only.
- Any rotation **performed**. The brief delivers the runbook; humans run it on cadence.
- Encryption at rest of the dev secrets cache. We hardened defaults; DPAPI/keyed encryption is a separate decision if the threat model changes.
- A full CSP policy + enforcement rollout (deferred — see decision 6).
- Replacing `opLog.js` with the new audit table. They serve different purposes (opLog = ephemeral debugging, audit_log = durable record).
- A CCL-pipeline-wide audit trail (different domain; CCL has its own existing logging via `cclPersistence.js`).
- Multi-region or DR posture for the audit table. Single-region uksouth, same as the rest of the platform.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) — extend `ActivityLens` with `'security'` (B4).
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — render `SecurityPanel` (B4); add release-smoke button (E3).
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — wire new lens into chip set (B4).
- [src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts) — add `security`, `rateLimits`, `csp`, `audit` SSE listeners (B3).
- [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) — extend `OpsPulseState` (B3).
- `src/tabs/roadmap/parts/SecurityPanel.tsx` (NEW) — five sub-cards (B5).

Server:
- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) — new channels (B1).
- [server/middleware/requireUser.js](../../server/middleware/requireUser.js) — wire `securityChannel.push` (B2).
- [server/index.js](../../server/index.js) — wire `rateLimitChannel.push`, mount new routes, prod assertions (B2, B6, E5).
- [server/utils/getSecret.js](../../server/utils/getSecret.js) — dev cache hardening (D4).
- [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) — extend with security checks + release pack (E1). *(Created by sibling brief.)*
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js) — pack runner (E2). *(Created by sibling brief.)*
- `server/utils/userTier.js` (NEW) — canonical `isDevGroup / isAdmin / isDevOwner` (A5).
- `server/utils/auditLog.js` (NEW) — `recordAudit(req, ...)` helper (C2).
- `server/routes/security-board.js` (NEW) — `/headers`, `/secrets-freshness`, `/whoami`, `/audit` (B6, C4).

Scripts / docs:
- `scripts/init-audit-log-table.mjs` (NEW) — idempotent DDL runner (C1).
- `docs/security/SECRETS_INVENTORY.md` (NEW) — D1.
- `docs/security/KEY_ROTATION.md` (NEW) — D2.
- `docs/security/LEAKED_SECRET_RESPONSE.md` (NEW) — D3.
- `.github/dependabot.yml` (NEW) — A4.
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — A1, A3.
- [jest.server.config.js](../../jest.server.config.js) — A2 (`.test.ts` matcher).
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — D5 (one-line pointer to runbooks).
- New GitHub Actions workflow file for deploy smoke (E4) — name TBD; suggest `.github/workflows/deploy-smoke.yml`.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: activity-testing-security-and-operational-visibility-control-plane
verified: 2026-04-27
branch: main
touches:
  client:
    - src/tabs/roadmap/parts/ActivityHero.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/hooks/useOpsPulse.ts
    - src/tabs/roadmap/parts/ops-pulse-types.ts
    - src/tabs/roadmap/parts/SecurityPanel.tsx
  server:
    - server/routes/ops-pulse.js
    - server/middleware/requireUser.js
    - server/index.js
    - server/utils/getSecret.js
    - server/utils/opsCheckCatalog.js
    - server/routes/ops-checks.js
    - server/utils/userTier.js
    - server/utils/auditLog.js
    - server/routes/security-board.js
    - jest.server.config.js
    - scripts/init-audit-log-table.mjs
    - .github/workflows/ci.yml
    - .github/dependabot.yml
    - .github/workflows/deploy-smoke.yml
    - .github/copilot-instructions.md
    - docs/security/SECRETS_INVENTORY.md
    - docs/security/KEY_ROTATION.md
    - docs/security/LEAKED_SECRET_RESPONSE.md
  submodules: []
depends_on:
  - activity-route-live-checks-and-prod-parity-surface
coordinates_with:
  - node-22-production-rollout-for-link-hub-v1
  - realtime-multi-replica-safety
  - session-probing-activity-tab-visibility-and-persistence
  - clio-webhook-reconciliation-and-selective-rollout
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - resources-tab-restructure-with-templates-section
conflicts_with: []
```

---

## 9. Gotchas appendix

The non-transferable residue. Things only spotted by tracing code in this session.

- **`requireUser` is silently bypassed in non-production.** [server/middleware/requireUser.js](../../server/middleware/requireUser.js) returns `next()` immediately when `NODE_ENV !== 'production'`. If `link-hub-v1-staging` does **not** have `NODE_ENV=production` set, staging has effectively no auth gate today. Phase E surfaces this in HeaderPosture; the user must verify the App Service config.
- **`ops-pulse.js` server gate is `['LZ', 'AC']`, not `isDevGroupOrHigher`.** Trusting the UI gate alone would mean an admin who is not LZ/AC could see the lens chip but get a 403 from the API. Phase A5's helper fixes this.
- **App Insights `setAutoCollectConsole(true, true)`** ([server/utils/appInsights.js](../../server/utils/appInsights.js)) captures `console.log` as traces. Anything logged by `auditLog.js` therefore double-emits — once as a `customEvent` (via `trackEvent('Audit.Recorded')`), once as a trace if any `console.log` is added. Keep `auditLog.js` silent on success.
- **`secureLogging.js` masks emails as `lu***@domain`** ([server/utils/secureLogging.js](../../server/utils/secureLogging.js)) — but it is opt-in. Default `console.log` is unmasked. The audit log helper writes `actor_email` directly because the audit table is admin-only and the email is the actual auditable identity. **Do not mirror this pattern for general logging.**
- **`req.ip` returns the raw socket IP behind App Service** unless `app.set('trust proxy', ...)` is configured. Verify before relying on `ip_masked` for forensic value — may need `req.headers['x-forwarded-for']` first hop.
- **`getSecret.js` writes to `.secrets-cache.json` at the repo root, mode 0o600.** The file is gitignored, but OneDrive / corporate backup tools will still capture it. The 7-day TTL was already aggressive; D4 hardens this further. Do not silently re-enable the default behaviour in a follow-up.
- **`ops-pulse.js` `createOpsPulseChannel` defaults `maxAgeMs = 15 * 60_000`.** Security/audit data is more valuable than 15 minutes; pass `maxAgeMs: 24 * 60 * 60_000` for `securityChannel` and `rateLimitChannel`. The new audit endpoint should read directly from SQL, not from the channel.
- **`ALLOWED_ORIGINS` is comma-split with `.split(',').map(o => o.trim()).filter(Boolean)`** ([server/index.js](../../server/index.js)). Empty string in prod yields an empty list — every cross-origin request denied. Phase E5's assertion catches this on boot before requests start failing.
- **Stripe and Clio webhooks must remain mounted before `express.json()`** ([server/index.js](../../server/index.js)) — the signature verification needs the raw body. Any new middleware Phase B/C adds must come *after* these mounts.
- **`opsCheckCatalog.js` and `ops-checks.js` do not exist yet** — they are created by the sibling brief. If you ship this brief without that one, Phase E will not work. Phase A–D are independent.
