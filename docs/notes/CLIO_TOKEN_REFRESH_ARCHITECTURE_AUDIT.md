# Clio token-refresh architecture audit

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During the D7.3 dedup pass (changelog 2026-04-19) the per-user Clio token-refresh logic in `matter-audit.js` + `matter-metrics.js` was consolidated into [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js). The audit revealed the *team-hub-v1* (shared, non-per-initials) Clio token path is implemented THREE more times across the codebase, each with its own subtly different cache, rotation, and failure-handling behaviour. The dedup pass deliberately stopped short of folding them in because the differences look load-bearing and need a careful side-by-side comparison before any consolidation.

This brief is that comparison. The user does not want a rewrite for its own sake — only consolidate if the audit shows the variants are equivalent in behaviour (or that any divergence is a latent bug).

**Not in scope:** the per-user pattern (already done in D7.3); changing the OAuth flow itself (refresh_token grant stays); rotating refresh tokens to a managed identity (separate Azure-side concern). Companion work — extracting a low-level OAuth primitive — is parked separately in [CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md](./CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md).

---

## 2. Current state — verified findings

### 2.1 Three call sites, all team-hub-v1 (shared credentials)

Verified via grep `refresh_token` across `server/routes/**` on 2026-04-19:

- [server/routes/reporting.js](../../server/routes/reporting.js) ~L600-670 — token cache via Redis (`tokenCache.set/get`), abort timeout on the refresh fetch, **rotates the new refresh_token back to Key Vault** via `setSecret` after a successful refresh.
- [server/routes/home-wip.js](../../server/routes/home-wip.js) ~L362 — needs full read in Phase A1: cache backing, rotation, abort timeout all unverified.
- [server/routes/matter-operations.js](../../server/routes/matter-operations.js) ~L465 — needs full read in Phase A1: same questions.

### 2.2 The per-user path (already consolidated in D7.3, for contrast)

[server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) uses an in-memory `Map`, no Redis, no rotation, no abort. Per-initials cache key (`${initials}-clio-v1-*`). Used by `matter-audit.js` + `matter-metrics.js` only.

### 2.3 What "team-hub-v1" means

Single shared Clio app credentials (`team-hub-v1-clientid`, `team-hub-v1-clientsecret`, `team-hub-v1-refreshtoken`) used for read-only/aggregate queries that don't need per-user permissions. The per-user path uses `${initials}-clio-v1-*`.

### 2.4 Why the divergence is suspicious

If reporting.js rotates and home-wip.js doesn't, then home-wip is silently using stale refresh tokens until they expire. Clio refresh tokens have a sliding expiry (each successful refresh returns a new one); a site that doesn't rotate is using the original indefinitely until Clio decides it's stale (typically 60+ days). The first refresh after that returns `invalid_grant` and the route starts failing.

---

## 3. Plan

### Phase A — comparison matrix (no code change)

Produce a single table covering all 3 sites. **STOP after the matrix if the answer is "leave separate".**

| Site | Cache backing | Abort timeout | Rotate to KV | 401 retry | Credential keys | Acquire timing |
|------|---------------|---------------|--------------|-----------|-----------------|----------------|
| reporting.js | Redis | yes | **yes** | yes | team-hub-v1-* | per-request |
| home-wip.js | ? | ? | ? | ? | ? | ? |
| matter-operations.js | ? | ? | ? | ? | ? | ? |

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Read each call site (≥80 lines around the refresh) and fill the matrix. | reporting.js / home-wip.js / matter-operations.js | Note any other side effects (logs, telemetry events, metric counters). |
| A2 | App Insights cross-reference. | (KQL) | Search `exceptions \| where outerMessage has "Clio" and outerMessage has "401" or outerMessage has "invalid_grant"` over the last 90 days, group by `cloud_RoleInstance` + `operation_Name`. Decide whether divergence has been silently degrading reliability. |
| A3 | Decision. | (this doc) | Choose: (1) consolidate, (2) standardise then consolidate, (3) leave separate. Update §6. |

**Phase A acceptance:** matrix has no `?` cells; A2 query results captured in §9; §6 decision recorded.

### Phase B — consolidate into `server/utils/clio-team-token.js`

Mirror the per-user shape, but with the Redis + abort + rotation behaviour from reporting.js as the canonical implementation.

#### B1. Helper module

```js
// server/utils/clio-team-token.js
const { getSecret, setSecret } = require('./keyVault');
const { getRedisClient } = require('./redis');

const CACHE_KEY = 'clio:team-hub-v1:access-token';
const CACHE_TTL_SECONDS = 55 * 60;
const REFRESH_TIMEOUT_MS = 10_000;
const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';

async function getClioTeamAccessToken({ forceRefresh = false } = {}) { /* ... */ }
async function fetchClioTeamWithRetry(url, options = {}) { /* ... */ }
module.exports = { getClioTeamAccessToken, fetchClioTeamWithRetry };
```

Behaviour preserved verbatim from reporting.js (Phase A1 establishes which file is the source of truth — reporting.js is the working hypothesis).

#### B2–B4. Refactor call sites in order of risk

1. reporting.js (lowest risk — it IS the source of truth, refactor is essentially "move code to file").
2. home-wip.js.
3. matter-operations.js.

Each is a separate PR + changelog entry. After each: `get_errors` clean, manual end-to-end smoke test, App Insights spot-check 24h.

#### B5. Final sweep

Grep again to confirm no other call site exists. Update [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) module docstring to cross-reference the new team helper.

---

## 4. Step-by-step execution order

1. **A1** — read each site, fill matrix.
2. **A2** — App Insights query.
3. **A3** — decide. **STOP HERE if "leave separate".**
4. **B1** — write `server/utils/clio-team-token.js`.
5. **B2** — refactor reporting.js. Bake 24h.
6. **B3** — refactor home-wip.js. Bake 24h.
7. **B4** — refactor matter-operations.js. Bake 24h.
8. **B5** — grep + docstring cross-link.
9. Hand off to companion brief if Phase C of that brief is in scope.

---

## 5. Verification checklist

**Phase A:**
- [ ] Matrix complete with no `?` cells.
- [ ] App Insights query captured in §9 with row counts.
- [ ] §6 decision recorded.

**Phase B (per refactored route):**
- [ ] `get_errors` clean.
- [ ] One end-to-end manual call returns same shape as before.
- [ ] App Insights `Clio.*Token.*` events show same shape pre/post refactor.
- [ ] No new `invalid_grant` exceptions in 24h post-deploy.

---

## 6. Open decisions (defaults proposed)

1. **Source of truth for behaviour** — Default: **reporting.js**. Rationale: most complete (cache + abort + rotation). If A2 shows reporting.js has a quirk, pick the next-most-complete and standardise.
2. **Rotation behaviour for sites missing it** — Default: **add rotation** as part of Phase B. Rationale: silently using stale refresh tokens is a latent bug.
3. **Cache key** — Default: `clio:team-hub-v1:access-token`. Rationale: matches Redis convention used elsewhere.
4. **Helper location** — Default: `server/utils/clio-team-token.js`, mirroring `clio-per-user-token.js`. Rationale: discoverability.
5. **Concurrent-refresh lock** — Default: **add a Redis-backed lock with 5s TTL** if reporting.js doesn't already have one. Rationale: without it, two simultaneous 401s rotate twice and one ends up holding the now-stale token.

---

## 7. Out of scope

- Rotating refresh tokens to a managed identity flow (separate Azure-side concern).
- Adding more granular per-route rate limiting (Clio's API limits not currently a problem).
- Migrating to a different OAuth grant.
- Refactoring the per-user path again — already done.
- Extracting a low-level OAuth primitive (companion brief).

---

## 8. File index (single source of truth)

Server:
- `server/utils/clio-team-token.js` (NEW) — team-hub-v1 helper
- [server/routes/reporting.js](../../server/routes/reporting.js) — refactored (canonical source first)
- [server/routes/home-wip.js](../../server/routes/home-wip.js) — refactored
- [server/routes/matter-operations.js](../../server/routes/matter-operations.js) — refactored
- [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) — docstring cross-link only

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [docs/notes/CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md](./CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md) — companion brief, depends on this one

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: clio-token-refresh-architecture-audit
verified: 2026-04-19
branch: main
touches:
  client: []
  server:
    - server/utils/clio-team-token.js
    - server/routes/reporting.js
    - server/routes/home-wip.js
    - server/routes/matter-operations.js
    - server/utils/clio-per-user-token.js
  submodules: []
depends_on: []
coordinates_with:
  - realtime-delta-merge-upgrade        # both touch server/routes/matter-operations.js (this brief: token-refresh; that brief: broadcast payload). No region overlap, but same file.
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Rotation back to Key Vault is destructive and irreversible.** If you write a bad refresh token to KV by mistake (e.g. malformed Clio response), every subsequent request fails until ops manually fixes it. The reporting.js implementation guards against this — preserve that guard verbatim.
- **Clio's refresh_token has a sliding expiry.** Each successful refresh returns a new one. Sites that don't rotate are using the original until Clio decides it's stale (typically 60+ days). Manifests as `invalid_grant` after a long quiet period.
- **Concurrent refresh races.** If two requests hit a 401 simultaneously, both refresh; one rotates and the other fails with `invalid_grant` because it's holding the now-rotated token. Reporting.js may handle this with a Redis lock — verify in A1, add one in B1 if missing.
- **Don't merge with the per-user path.** They have fundamentally different requirements (per-initials credential lookup vs single shared). The companion primitive brief addresses the only legitimate shared surface (OAuth fetch URL/params).
- **App Insights is the only safety net.** No fixture exists for a real Clio token refresh. Verify in staging against a real Clio sandbox before promoting Phase B to prod.
- **Module-load vs per-request acquisition.** A1 specifically must check whether any route caches the access token at module-load time (variable in module scope). If so, the cache survives the TTL because nothing busts it. Refactor must move all token reads into request scope.
