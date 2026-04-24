# Session probing — Activity tab visibility and persistence

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quote (2026-04-19):

> *"expand on the probing mechanism without slowing down the app. scope implementation into activity custom tab, so that the users who have access can see the base for each session. i suggest you consider a new table to persist this."*

Today the probing mechanism (`useFirstHydration`, `TabMountMeter`, `DebugLatencyOverlay`) lives entirely in browser memory. Open dev tools, append `?ux-debug=1`, see numbers. Close the tab, lose them. The user wants probe data **persisted per session**, surfaced inside the **Activity tab** so users with access can see the baseline for each session — both their own and (admin-gated) other users'. This turns ad-hoc dev-only diagnostics into an operational transparency strip aligned with the "Architectural Transparency" pillar in `copilot-instructions.md`.

Critical constraint: *"without slowing down the app"*. Probe collection cost must be invisible — no synchronous IO, no expensive aggregation on the hot path, batched + idle-flushed transmission to the server, and the Activity tab view must read from the persistence table, never reach into a live process.

**Not in scope:** changing the probe set itself (covered by [UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md](./UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md) Phase A); App Insights replacement (this complements it, doesn't replace it); generating PII from session data.

---

## 2. Current state — verified findings

### 2.1 Existing probe infrastructure

- [src/utils/useFirstHydration.ts](../../src/utils/useFirstHydration.ts) — emits `hydrate.{section}.{ms}` once per mount.
- [src/components/TabMountMeter.tsx](../../src/components/TabMountMeter.tsx) — emits `nav.tabMount.{name}.{ms}` on first paint after mount.
- DebugLatencyOverlay (visible with `?ux-debug=1`) — surfaces both in-memory.
- App Insights `trackClientEvent` ([server/utils/appInsights.js](../../server/utils/appInsights.js)) — every probe also flows here via the existing `/api/telemetry` endpoint.

Gap: **no per-session aggregation, no in-app retrieval, no SQL persistence.** App Insights covers the analytics use case but requires KQL + portal access. The user's team can't see their own session metrics.

### 2.2 Activity tab today

File reference: search `src/tabs/` for `Activity` or `activity` — verify exact path. Likely `src/tabs/activity/ActivityTab.tsx` or similar. Renders user-action history (logins, edits, mutations) from existing `events` table (see `scripts/init-events-table.mjs`).

Tab is admin-gated per the user-tier rules — check `canAccessReports()` vs `isAdminUser()` to decide which tier sees the new section.

### 2.3 Existing telemetry endpoint

[server/routes/telemetry.js](../../server/routes/telemetry.js) (verify exists; otherwise the path that handles `trackClientEvent` POSTs from the SPA). Currently fans events into App Insights. Does not persist to SQL.

### 2.4 Naming convention for probe events

Client probes follow: `{namespace}.{name}.{outcome}` — e.g. `nav.tabMount.home`, `hydrate.matters`, `interaction.hover.toPaint`. Persisting needs a normalised schema that handles all current and future probes without column changes per probe.

---

## 3. Plan

### Phase A — persistence table + ingest endpoint

#### A1. Schema

> **2026-04-21 update:** since this brief was written, the **Helix Operations Platform DB** (`helix-operations`) has been stood up as the home for cross-app utility/audit tables (`dbo.ai_proposals`, `dbo.form_submissions`, `dbo.hub_todo`). When this brief is picked up, `session_probes` should land **on the ops DB**, not Core Data. Use the same two-stage gate as `formSubmissionLog.js` (`OPS_PLATFORM_ENABLED=true` + `OPS_SQL_CONNECTION_STRING`). The schema below is otherwise correct; just change the target DB. See [docs/HELIX_OPERATIONS_PLATFORM.md](../HELIX_OPERATIONS_PLATFORM.md).

```sql
-- NEW HOME: Helix Operations Platform DB (helix-operations)
CREATE TABLE session_probes (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    session_id      VARCHAR(64)   NOT NULL,         -- crypto.randomUUID() per browser session
    user_initials   VARCHAR(8)    NULL,             -- joined from user-data; null for pre-auth events
    probe_namespace VARCHAR(32)   NOT NULL,         -- 'nav', 'hydrate', 'interaction'
    probe_name      VARCHAR(64)   NOT NULL,         -- 'tabMount.home', 'matters', 'hover.toPaint'
    value_ms        INT           NOT NULL,         -- numeric value (always ms; if other unit needed, encode in name)
    metadata_json   NVARCHAR(MAX) NULL,             -- optional context (tab name, target element, sample count)
    user_agent      VARCHAR(256)  NULL,
    app_version     VARCHAR(32)   NULL,             -- from package.json — lets us correlate regressions to releases
    occurred_at     DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    received_at     DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
);

CREATE INDEX IX_session_probes_session    ON session_probes (session_id, occurred_at);
CREATE INDEX IX_session_probes_user_time  ON session_probes (user_initials, occurred_at DESC) INCLUDE (probe_namespace, probe_name, value_ms);
CREATE INDEX IX_session_probes_probe_time ON session_probes (probe_namespace, probe_name, occurred_at DESC) INCLUDE (value_ms);
```

Migration script: `scripts/migrate-add-session-probes.mjs` following the convention of `scripts/init-events-table.mjs`.

**Retention.** Add a daily cleanup job that deletes rows older than 30 days (configurable). Index makes this `DELETE WHERE occurred_at < DATEADD(day, -30, SYSUTCDATETIME())` cheap.

#### A2. Ingest endpoint

New route: `POST /api/telemetry/session-probe` accepting a **batch** payload (the client must batch — see B1):

```ts
POST /api/telemetry/session-probe
Body: {
  sessionId: string,
  userInitials?: string,
  appVersion: string,
  events: Array<{
    namespace: string,
    name: string,
    valueMs: number,
    occurredAt: string,  // ISO
    metadata?: Record<string, string | number | boolean>
  }>
}
→ 204 No Content
```

Pure insert, no read. Parameterised SQL, batched insert via table-valued parameter or JSON-shred pattern (see `scripts/init-events-table.mjs` for the existing batched-insert pattern in this codebase).

Validate: namespace + name string-only-printable, valueMs in `[0, 600000]`, batch size <500. Reject silently with 204 if oversized (don't 4xx — telemetry must never affect the app).

App Insights instrumentation: `Telemetry.SessionProbe.Received` (count + batch size), `Telemetry.SessionProbe.Failed` (exception, never propagates to client).

#### A3. Read endpoint for Activity tab

New route: `GET /api/activity/session-probes` with query params:

- `sessionId=` (filter to one session)
- `userInitials=` (admin-only — non-admins always get their own initials forced)
- `since=` ISO date (default: last 24h)
- `aggregate=` (`raw` | `p50p95` — default `p50p95` for the table view)

Return shape (aggregated):

```ts
{
  sessions: Array<{
    sessionId: string,
    userInitials: string,
    startedAt: string,
    endedAt: string,        // last event observed
    eventCount: number,
    appVersion: string,
    metrics: Array<{
      probe: string,        // 'nav.tabMount.home'
      p50: number,
      p95: number,
      max: number,
      count: number,
    }>
  }>
}
```

**Authorization.** Use `isAdminUser()` per the User Tier rules. Non-admin users get their own sessions only. Admins (including LA per the tiers table) get team-wide visibility.

### Phase B — client batching + transport

#### B1. Probe-collector hook

`src/utils/sessionProbeCollector.ts` — singleton that:

1. Generates a `sessionId` once per browser session (`crypto.randomUUID()`, stashed in `sessionStorage`).
2. Exposes `recordProbe({ namespace, name, valueMs, metadata? })` — pushes onto an in-memory queue.
3. **Flushes** on `requestIdleCallback` debounced 5s, on `visibilitychange → hidden`, and on `beforeunload` (using `navigator.sendBeacon` for the unload path so the request survives).
4. Caps queue at 500 events; drops oldest first.
5. Disables itself entirely if `navigator.sendBeacon` is missing AND the user has slow connection (`navigator.connection.effectiveType === 'slow-2g'`).

Wire all existing probe sources (`useFirstHydration`, `TabMountMeter`, the new `interaction.*` probes from the companion brief) to push into this collector AS WELL AS the existing App Insights path. Both paths in parallel — App Insights for Microsoft-side analytics, our table for in-app surfacing.

#### B2. Activity tab view

In the Activity tab, add a new collapsible section: **"Session telemetry"** (admin-gated; non-admins see only their own).

Layout: one row per session, columns: When (relative time), User, App version, Event count, with an expandable inner table showing the per-probe metrics (`p50 / p95 / max / count`). Default sort: most recent first. Default filter: last 24h, current user's sessions.

For admins: a user-picker lets them switch to any user's sessions. Add a "global p95" row at the top showing the team aggregate for the standard probe set (nav.tabMount.home, hydrate.matters, interaction.inp).

**Visual.** Match existing Activity tab cards. No new design system. Reuse existing skeleton + table primitives. Per the look-and-feel: muted body text, accent only at section headers.

#### B3. Cleanup job

`scripts/cleanup-session-probes.mjs` — runs daily via the existing scheduler (see `server/scheduler/` or whatever drives the WIP scheduler). Deletes rows older than retention window.

---

## 4. Step-by-step execution order

1. **A1** — schema migration, deploy to staging first.
2. **A2** — ingest endpoint. Smoke-test with a synthetic batch from `curl`.
3. **B1** — collector hook. Wire to existing probes. Verify telemetry table fills in staging.
4. **A3** — read endpoint. Verify returns shape from a curl call.
5. **B2** — Activity tab section. Manual test as both admin and non-admin.
6. **B3** — cleanup job. Verify row count plateaus.

Each step is a separate PR + changelog entry.

---

## 5. Verification checklist

**Phase A:**
- [ ] Migration runs cleanly on staging Core Data DB.
- [ ] `POST /api/telemetry/session-probe` accepts a 100-event batch in <50ms p95.
- [ ] Indexes verified via `EXPLAIN`-equivalent: read endpoint at <100ms p95 for 30-day window.
- [ ] App Insights `Telemetry.SessionProbe.*` events fire.
- [ ] Endpoint cost overhead measured: collector flushing every 5s costs <1ms client CPU per flush.

**Phase B:**
- [ ] Open the app, navigate around for 30s. Check `session_probes` table — rows visible with correct sessionId.
- [ ] Activity tab "Session telemetry" visible to admin user; not visible to non-admin? — actually visible but scoped.
- [ ] Non-admin user sees only their own sessions.
- [ ] Admin user-picker switches view.
- [ ] Cleanup job deletes rows older than retention. Verify with date math.
- [ ] Telemetry collection during normal use does NOT regress INP probe (see companion brief — verify no measurable difference).

---

## 6. Open decisions (defaults proposed)

1. **Persistence DB** — Default: **Core Data DB** (where `events` lives). Rationale: same DB as user-attributable activity; consistent with existing patterns.
2. **Retention window** — Default: **30 days**. Rationale: enough for trend-spotting; cheap to store; clears PII risk over time.
3. **Admin tier for cross-user view** — Default: **`isAdminUser()`**. Rationale: matches existing Activity tab gating.
4. **Sample rate** — Default: **100% in dev/staging, 100% for nav.tabMount + hydrate.* in prod, 10% for interaction.inp/hover/scroll in prod**. Rationale: nav/hydrate are infrequent; interaction events fire continuously.
5. **Aggregation timing** — Default: **server-side per request** (the read endpoint computes p50/p95). Rationale: simple, correct, fast at scale of one user-day.
6. **Session boundaries** — Default: **`sessionStorage` UUID + 30-min idle reset**. Rationale: matches typical analytics session model; multiple per workday.
7. **PII** — Default: **store user_initials + sanitized target element class names; never raw URL paths or text content**. Rationale: minimum needed for the intended use, no creep.

---

## 7. Out of scope

- Replacing App Insights — this complements it.
- Per-event alerting — existing App Insights alerts cover that.
- Front-end visualization beyond the Activity tab table (charts can come later).
- Cross-app probe aggregation (instruct-pitch / enquiry-processing-v2 contribute their own probes; out of scope here).
- Real-user monitoring of network performance (separate concern).
- Anonymous / pre-auth probe collection beyond what already happens (login-time probes are useful but the schema accepts NULL initials).

---

## 8. File index (single source of truth)

Client:
- `src/utils/sessionProbeCollector.ts` (NEW)
- [src/utils/useFirstHydration.ts](../../src/utils/useFirstHydration.ts) — wire to collector
- [src/components/TabMountMeter.tsx](../../src/components/TabMountMeter.tsx) — wire to collector
- New `interaction.*` probes from companion brief — wire to collector
- Activity tab component (find via grep: `src/tabs/activity/`) — new "Session telemetry" section

Server:
- `server/routes/telemetry-session-probe.js` (NEW) — ingest + read endpoints
- [server/index.js](../../server/index.js) — mount the router
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — telemetry events
- Scheduler entry — wire daily cleanup

Scripts / docs:
- `scripts/migrate-add-session-probes.mjs` (NEW)
- `scripts/cleanup-session-probes.mjs` (NEW)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — add `session_probes` table

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: session-probing-activity-tab-visibility-and-persistence
verified: 2026-04-19
branch: main
touches:
  client:
    - src/utils/sessionProbeCollector.ts
    - src/utils/useFirstHydration.ts
    - src/components/TabMountMeter.tsx
    - src/tabs/activity/
  server:
    - server/routes/telemetry-session-probe.js
    - server/index.js
    - server/utils/appInsights.js
  submodules: []
depends_on: []
coordinates_with:
  - ui-responsiveness-hover-scroll-and-tab-navigation   # this brief is the persistence backend for that brief's Phase A6
  - realtime-multi-replica-safety                       # both mount routes in server/index.js
  - ux-realtime-navigation-programme                    # both extend server/utils/appInsights.js
conflicts_with: []
```

---

## 9. Gotchas appendix

- **`sendBeacon` size limit is 64KB** (browser-dependent). If a session generates >64KB before unload, the beacon silently drops. Cap the unload-flush payload to ~50KB (drop oldest events).
- **`useFirstHydration` is called many times per second across all consumers.** Wire-up must NOT do per-call IO — push to the collector queue only, batch flushes via idle/visibility.
- **App version** in the schema is critical. Without it, a regression after a deploy is invisible — looks like normal noise. Read it from `process.env.REACT_APP_VERSION` at build time.
- **`SYSUTCDATETIME()` vs `GETDATE()`.** The codebase mixes these. Use `SYSUTCDATETIME()` for new tables — UTC-only, higher precision. Display layer converts to Europe/London.
- **Session ID stored in `sessionStorage` resets per tab.** A user with two browser tabs open generates two sessions. That's actually correct behaviour (we want per-tab measurement) but document it so the Activity tab view doesn't make admins think the user has "sessions" in some auth sense.
- **Don't auto-flush on every event.** First implementation will be tempted to POST per event. Resist — batching is the whole point. The queue + idle/visibility flush is the contract.
- **Activity tab must stay snappy.** The table view will tempt large fetches ("all sessions ever"). Cap default window to 24h, paginate beyond that.
- **Index choice matters.** The composite indexes in §A1 are sized for the expected access patterns (per-session lookup, per-user time-series, per-probe trending). Don't add more without measurement — write-amplification on a high-write table is a real cost.
- **Companion brief dependency loop.** The hover/scroll probes from [UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md](./UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md) feed into this brief's collector. But this brief can ship Phase A and B with just existing probes — the new probes plug in opportunistically. Do not block.
