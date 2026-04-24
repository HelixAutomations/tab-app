# Persistent user activity log (Phase 2)

> **Purpose of this document.** Self-contained brief for turning the in-tab ring buffer shipped in Phase 0 into a real, per-user, cross-session activity log.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-23 against branch `main`. Re-verify file/line refs if more than 30 days old.

---

## 1. Why this exists (user intent)

User quote (2026-04-23): *"maybe turning the user bubble space [into] a log of activity, do we store sessions now right?"*

The answer was **no** — there is no per-user audit/activity store. Phase 0 shipped an in-tab, in-memory ring buffer (`src/utils/sessionActivity.ts`) so the UserBubble could surface *"This session"*. Phase 2 (this brief) is the real version: per-user, persistent across reloads, searchable, and available to both the user and admins.

Not in scope here: a generic audit log for compliance/SRA. This is a personal productivity feed — *"what have I been doing"* — rendered back to the same user.

---

## 2. Current state — verified findings

### 2.1 Phase 0 client-side ring buffer (already shipped)

- File: [src/utils/sessionActivity.ts](../../src/utils/sessionActivity.ts) — singleton ring buffer, capacity 60, filters out noisy sources (Boot/Browser/Network) and types (chunk-reload, request-slow, stage, summary, enquiries-stream-*).
- File: [src/utils/telemetry.ts](../../src/utils/telemetry.ts) — inside `trackClientEvent`, calls `recordSessionActivity(source, type, sanitizedData)` right before `send()`. Sanitised payload only — no raw PII.
- File: [src/components/command-centre/SessionActivitySection.tsx](../../src/components/command-centre/SessionActivitySection.tsx) — renders the buffer, subscribes via `subscribeSessionActivity`, includes a "Clear" action and "Show all" expand.
- Rendered in: [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) below `SessionFiltersSection`.

### 2.2 Existing telemetry path (the feed source we reuse)

- Route: [server/routes/telemetry.js](../../server/routes/telemetry.js) — accepts `POST /api/telemetry`, forwards to App Insights. **Not persisted in SQL.**
- Client helper: `trackClientEvent(source, type, data, opts)` — already instrumented across the app (tab switches, matter opens, CCL generation, UX interactions).

### 2.3 What's missing

- No `user_activity` SQL table.
- No `GET /api/me/activity` endpoint.
- No way for an admin to see another user's timeline.
- Current ring buffer is lost on every reload, navigation to a non-tab page, or tab close.

### 2.4 Auth/identity available server-side

- Server already resolves the effective user from AAD in most routes. Confirm the helper before writing Phase A.
- Initials are the canonical identifier (two-letter, uppercase). Never store raw email in `user_activity.actor_initials`.

---

## 3. Plan

### Phase A — Persist the same events server-side (minimal)

Small, independently shippable. No UI changes beyond a swap of the data source.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create table migration | `scripts/migrate-add-user-activity.mjs` (NEW) | DDL below |
| A2 | Add write path | [server/routes/telemetry.js](../../server/routes/telemetry.js) | Persist a curated subset of events into `user_activity` (async, never blocks the response). |
| A3 | Add read endpoint | `server/routes/me-activity.js` (NEW) + mount in [server/index.js](../../server/index.js) | `GET /api/me/activity?limit=50` → rows for the caller's initials only. |
| A4 | Swap client data source | [src/components/command-centre/SessionActivitySection.tsx](../../src/components/command-centre/SessionActivitySection.tsx) | On mount, fetch `/api/me/activity`, merge with ring-buffer tail, de-dupe, still subscribe to live `sessionActivity` updates. |

**DDL (A1):**

```sql
CREATE TABLE user_activity (
    id              BIGINT IDENTITY PRIMARY KEY,
    actor_initials  NVARCHAR(8)    NOT NULL,
    source          NVARCHAR(64)   NOT NULL,
    event_type      NVARCHAR(128)  NOT NULL,
    meta_json       NVARCHAR(MAX)  NULL,       -- sanitised payload
    occurred_at     DATETIME2(3)   NOT NULL CONSTRAINT DF_user_activity_at DEFAULT SYSUTCDATETIME(),
    INDEX IX_user_activity_actor_time NONCLUSTERED (actor_initials, occurred_at DESC)
);
```

Which DB? Prefer **Core Data** (`SQL_CONNECTION_STRING`) — this is operational telemetry about users, not instruction/deal data.

**Event curation (A2):** Don't persist *every* telemetry event — that's a flood. Allow-list:

- `Nav.tab-switch`
- `Matter.matter-opened`
- `CCL.ccl-generated`
- `Admin.user-switched`
- `UX.theme-toggle`
- Anything explicitly tagged `opts.persist = true` from the call site.

**Phase A acceptance:**
- New `user_activity` row appears within ~2s of any allow-listed event.
- `GET /api/me/activity` returns only the caller's rows (server-side filter by resolved initials, not query param).
- UserBubble *"This session"* now persists across reloads (live ring buffer still used for immediate feedback).
- App Insights events: `UserActivity.Write.Completed/Failed`, `UserActivity.Read.Completed/Failed` (per `.github/instructions/server.instructions.md`).

### Phase B — Admin cross-user view

#### B1. Read endpoint

`GET /api/admin/activity?actor=LZ&limit=100` — gated by `isAdminUser()` on the server (mirror the allow-list in `src/app/admin.ts`). Returns rows for the requested actor.

#### B2. UI surface

New compact activity stripe inside the existing Hub/People admin view (not the UserBubble). Link from the user avatar in the team list. Borrow `SessionActivitySection` rendering; inject a different data source.

#### B3. Retention

Nightly job: `DELETE FROM user_activity WHERE occurred_at < DATEADD(day, -90, SYSUTCDATETIME())`. Run via existing scheduler (`server/scheduler.js`).

### Phase C — Activity-driven UX

Once B lands: surface "recently opened matter" shortcuts in the home tab pulled from `user_activity`; flag idle sessions; drive the returning-user onboarding strip. Each is its own brief.

---

## 4. Step-by-step execution order

1. **A1** — DDL migration script, run against dev, verify table + index.
2. **A2** — Telemetry route write path + App Insights instrumentation.
3. **A3** — Read endpoint + auth check.
4. **A4** — Client fetch + merge with ring buffer.
5. Ship Phase A. Changelog entry.
6. **B1 → B2 → B3** in order.

---

## 5. Verification checklist

**Phase A:**
- [ ] Table created, index verified via `sp_helpindex 'user_activity'`.
- [ ] Trigger a tab switch → confirm a row in `user_activity`.
- [ ] Reload the tab → *"This session"* list still shows that entry.
- [ ] Log in as a different user → endpoint returns zero rows.
- [ ] App Insights: `UserActivity.Write.Completed` event visible.
- [ ] No PII in `meta_json` (spot check 20 rows — the existing `sanitizeValue` in `telemetry.ts` handles this).

**Phase B:**
- [ ] Non-admin calling `/api/admin/activity?actor=LZ` gets 403.
- [ ] Admin cross-user view renders within 500ms for 100 rows.
- [ ] Retention job deletes rows older than 90 days.

---

## 6. Open decisions (defaults proposed)

1. **DB choice** — Default: **Core Data** (`SQL_CONNECTION_STRING`). Rationale: operational, not instruction data.
2. **Write path** — Default: **inline from `/api/telemetry`** (not a separate endpoint). Rationale: every event already flows through there.
3. **Retention** — Default: **90 days**. Rationale: personal productivity horizon, not compliance.
4. **Live updates in Phase A** — Default: **no SSE; refresh on UserBubble open**. Rationale: the live ring buffer already covers "happening now".
5. **Admin gating (Phase B)** — Default: **`isAdminUser()`** plus audit log of every admin read. Rationale: trust but verify.

---

## 7. Out of scope

- SRA compliance audit trail (separate system, different retention/access).
- Mutation history (who edited what field when) — this is user-initiated actions, not diff capture.
- Team-wide aggregation dashboards (belongs in Reports tab, separate brief).
- Replacing App Insights — keep sending there too; SQL is a queryable mirror, not the source of truth.

---

## 8. File index (single source of truth)

Client:
- [src/utils/sessionActivity.ts](../../src/utils/sessionActivity.ts) — ring buffer (Phase 0, shipped).
- [src/utils/telemetry.ts](../../src/utils/telemetry.ts) — tap already wired.
- [src/components/command-centre/SessionActivitySection.tsx](../../src/components/command-centre/SessionActivitySection.tsx) — consumer; modified in A4.
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — mounts the section.

Server:
- [server/routes/telemetry.js](../../server/routes/telemetry.js) — add write path (A2).
- `server/routes/me-activity.js` (NEW) — read endpoint (A3).
- `server/routes/admin-activity.js` (NEW) — admin read endpoint (B1).
- [server/index.js](../../server/index.js) — route mounting.

Scripts / docs:
- `scripts/migrate-add-user-activity.mjs` (NEW) — DDL.
- [logs/changelog.md](../../logs/changelog.md) — one entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: persistent-user-activity-log-phase-2
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-23
branch: main
touches:
  client:
    - src/components/command-centre/SessionActivitySection.tsx
    - src/utils/telemetry.ts
  server:
    - server/routes/telemetry.js
    - server/routes/me-activity.js
    - server/routes/admin-activity.js
    - server/index.js
  submodules: []
depends_on: []
coordinates_with:
  - realtime-multi-replica-safety
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- `src/utils/telemetry.ts` `sanitizeValue` already redacts emails, long numbers, and PII-keyed fields. Reuse the already-sanitised payload for `meta_json`; do not re-run the raw data through it.
- `trackClientEvent` has a throttle via `opts.throttleKey` — some events intentionally skip sending. Write path must respect the same gate.
- `server/index.js` auto-tracks HTTP requests via the App Insights SDK. You still need explicit `trackEvent`/`trackException` for the write/read paths per `.github/instructions/server.instructions.md`.
- The initials resolver must be the same one `/api/ops-pulse` uses so `actor_initials` is consistent. Do not trust a client-sent initials field.
- `isDevOwner()` (LZ) must NOT bypass the Phase A `/api/me/activity` filter — LZ sees their own feed on the bubble; the admin cross-user view is a separate route (Phase B).
- The ring buffer in `sessionActivity.ts` uses `unshift`; SQL reads should `ORDER BY occurred_at DESC`. When merging, de-dupe on `{occurred_at, source, event_type}` because the server write is fire-and-forget and may land slightly after the client has already recorded locally.
