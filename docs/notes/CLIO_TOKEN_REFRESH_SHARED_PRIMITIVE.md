# Clio token-refresh shared primitive

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

After the D7.3 dedup pass and the architecture audit ([CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md](./CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md)) consolidates the team-hub-v1 path into `server/utils/clio-team-token.js`, two helpers will sit alongside each other:

- `server/utils/clio-per-user-token.js` — per-initials credentials, in-memory cache, no rotation.
- `server/utils/clio-team-token.js` — shared credentials, Redis cache, rotation back to KV.

Both will internally hit the same Clio OAuth token endpoint with the same params (`grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`), parse the same response shape (`access_token`, `expires_in`, `refresh_token`), and need to handle the same error envelope. That HTTP+parse layer is the only legitimately-shared surface — everything around it (cache, rotation, lookup) is genuinely different.

This brief extracts that one shared primitive: `refreshClioToken({ clientId, clientSecret, refreshToken })`. **Only worth doing if** the audit (companion brief) actually consolidates the team path. Otherwise it's solving a problem we don't have.

**Not in scope:** changing cache strategy in either helper; changing rotation behaviour; changing OAuth flow.

---

## 2. Current state — verified findings

### 2.1 Both helpers will duplicate the OAuth fetch

Verified in [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) (already exists). The OAuth fetch portion:

```js
const params = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
});
const resp = await fetch(`${CLIO_TOKEN_URL}?${params.toString()}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});
if (!resp.ok) {
  const errorText = await resp.text();
  throw new Error(`Failed to refresh Clio token: ${errorText}`);
}
const tokenData = await resp.json();
```

Once the team helper is written from reporting.js, the same ~12 lines will appear there. Probably with a slightly different error message wrapping (worth aligning).

### 2.2 The rest is genuinely different

Cache backing, key shape, rotation back to KV, and abort behaviour are all unique to each helper's use case. They should NOT be shared.

### 2.3 The primitive is small

A standalone `refreshClioToken(...)` function would be ~20 lines including the abort timeout. It's a deposit, not a rewrite.

---

## 3. Plan

### Phase A — extract the primitive

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create the primitive. | `server/utils/clio-oauth.js` (NEW) | Exports `async function refreshClioToken({ clientId, clientSecret, refreshToken, abortMs = 10_000 })`. Returns `{ accessToken, refreshToken, expiresIn }`. Throws `ClioOAuthError` (custom class) with `.code` (`invalid_grant`, `network_timeout`, `http_error`, `parse_error`) for branch-able error handling upstream. |
| A2 | Wire `clio-per-user-token.js` to use it. | [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) | Replace the inline OAuth fetch with `await refreshClioToken({ ... })`. Keep cache logic intact. |
| A3 | Wire `clio-team-token.js` to use it. | `server/utils/clio-team-token.js` | Same. Keep Redis + rotation logic intact. |

**Phase A acceptance:**
- [ ] `get_errors` clean across all 3 files.
- [ ] One end-to-end smoke test for each path (per-user via `matter-metrics` endpoint; team via `reporting` endpoint).
- [ ] App Insights `Clio.Token.Refreshed` event fires with same shape pre/post.

### Phase B (optional) — telemetry deposit

Move the App Insights `trackEvent('Clio.Token.Refreshed', { source, durationMs })` and `trackException` calls *into* `refreshClioToken` so both helpers automatically get consistent telemetry without each having to remember. `source` parameter (`'team-hub-v1'` or `initials`) passed in by caller.

This is a small deposit but high-leverage: consistent telemetry means a single KQL query covers all Clio refresh activity.

---

## 4. Step-by-step execution order

1. **Confirm companion brief Phase B is shipped** — [CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md](./CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md). Otherwise this brief has no second helper to share with.
2. **A1** — write `clio-oauth.js`.
3. **A2** — refactor `clio-per-user-token.js`. Bake.
4. **A3** — refactor `clio-team-token.js`. Bake.
5. **B** (optional) — fold telemetry into the primitive.

---

## 5. Verification checklist

**Phase A:**
- [ ] `get_errors` clean across all 3 files.
- [ ] Smoke test: per-user path (call any matter-metrics endpoint requiring Clio).
- [ ] Smoke test: team path (call any reporting endpoint requiring Clio).
- [ ] App Insights pre/post comparison shows same event volume + shape.

**Phase B (if pursued):**
- [ ] App Insights single KQL query covers all Clio refresh activity (no orphan events from inline calls).

---

## 6. Open decisions (defaults proposed)

1. **Error class** — Default: **custom `ClioOAuthError extends Error`** with `.code` discriminator. Rationale: callers need to branch on `invalid_grant` (rotate-and-retry) vs `network_timeout` (just-retry) vs `http_error` (fail-fast).
2. **Abort default** — Default: **10s**. Rationale: matches reporting.js's existing behaviour. Callers can override.
3. **Telemetry** — Default: **inside the primitive (Phase B)**. Rationale: consistency. But Phase B is optional — Phase A does not block on it.
4. **Where to put it** — Default: `server/utils/clio-oauth.js`. Rationale: `clio-oauth` is unambiguous; `clio-token` was reserved for the cached-token helpers.

---

## 7. Out of scope

- Changing the OAuth flow (refresh_token grant stays).
- Changing the Clio token endpoint URL (env var stays).
- Caching at the primitive level — by design, the primitive is stateless. Cache lives in the helper, never in the primitive.
- Sharing rotation logic — also stays in the helper.

---

## 8. File index (single source of truth)

Server:
- `server/utils/clio-oauth.js` (NEW) — stateless OAuth refresh primitive
- [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js) — refactored to use primitive
- `server/utils/clio-team-token.js` — refactored to use primitive (created by companion brief)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — one entry for Phase A, optional second for Phase B
- [docs/notes/CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md](./CLIO_TOKEN_REFRESH_ARCHITECTURE_AUDIT.md) — must ship first

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: clio-token-refresh-shared-primitive
verified: 2026-04-19
branch: main
touches:
  client: []
  server:
    - server/utils/clio-oauth.js
    - server/utils/clio-per-user-token.js
    - server/utils/clio-team-token.js
  submodules: []
depends_on:
  - clio-token-refresh-architecture-audit       # this brief is meaningless until clio-team-token.js exists
coordinates_with: []
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Don't add a cache to the primitive.** It's tempting ("we always want caching"). But the per-user and team helpers cache by different keys, with different backings, and one rotates — putting cache in the primitive forces them to share, which defeats the architecture.
- **Don't pass an HTTP client in.** The primitive should `require('node-fetch')` directly. Injecting a client adds a parameter for no test win (we don't have unit tests for either helper, and adding them is a separate piece of work).
- **The error envelope shape matters.** Clio returns `{ "error": "invalid_grant", "error_description": "..." }` on auth failures. The primitive should parse this and surface it on `ClioOAuthError.code` so callers can decide whether to retry or surrender. Plain string error messages lose that.
- **Abort timeout via AbortController.** Use `AbortSignal.timeout(abortMs)` if the Node version supports it (Node 17.3+). Hub runs Node 20+, so safe. Don't reach for `setTimeout(() => controller.abort())` — the modern API is one line.
- **Don't extract too eagerly.** If the audit (companion brief) decides to LEAVE the team-hub-v1 sites separate (decision option 3), this brief becomes moot — there's only one consumer (`clio-per-user-token.js`) and a primitive for one consumer is over-engineering. Re-check before starting.
