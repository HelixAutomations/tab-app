# Operator God-Mode (System tab pressure-release valve)

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-23 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

> "id like a really early catch so we never lose peoples submissions and have clear insight into them all."
>
> "atm when people call and say x didnt work i panic a little and i have that anxiety so much. then i have to rely on agents to tell me what the problem was."
>
> "i envisioned the system tab to be that pressure release valve for me. but it further complicates because i dont quite understand what its showing. all of these navigate.process etc. etc. i thought would help me just dont tell me anything. and it doesnt tell me if its like a system thing that fired in their session or if they did that."
>
> "i want to be confident and this means i have god mode."

When a user phones LZ ("X didn't work"), today LZ has no UI way to confirm whether the user's action ever reached the server, whether a downstream side-effect failed, or what the user has been doing this session. The fallback is App Insights KQL or asking an agent. That fallback is the anxiety.

This brief turns the System tab into a single search-by-user god-mode panel that answers within seconds: what they did, what fired automatically vs what they triggered, what failed, the payload, one-click recovery.

**Not asking for:** rebuilding FormsHub, rebuilding App Insights, an offline-queue retry system (separate future brief), or a new permissions tier.

---

## 2. Current state (verified findings)

### 2.1 System tab shell

- File: [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx). the "System" tab. Title is "System". Gated by `isDevGroupOrHigher`.
- Lens chips in [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) L5-L6: `'all' | 'forms' | 'matters' | 'sync' | 'checks' | 'errors' | 'trace' | 'signals' | 'briefs' | 'forge' | 'actions' | 'mechanisms'`. No `'audit'` lens yet.
- The feed has no per-user filter, no event-kind (system/user) filter, no noise suppression. Today it dumps `telemetry.*.navigate.process` and `*.heartbeat` heartbeat events that drown the signal.

### 2.2 Activity feed pipeline

- [server/routes/activity-feed.js](../../server/routes/activity-feed.js) L18. merges `opLogItems` (in-memory ring from [server/utils/opLog.js](../../server/utils/opLog.js)) with four DB sources.
- [server/utils/activityFeedDbSources.js](../../server/utils/activityFeedDbSources.js) L99. `mapFormSubmissionRow`; L118 `getFormSubmissionItems(limit)`; L243 merges form_submissions, ai_proposals, hub_todos, tracked_cards.
- Shape per row: `{ id, source, sourceLabel, status, title, summary, timestamp, teamsLink? }`. No `kind` field. No `actorInitials` field exposed on the row (it's inside `source`/`summary` text strings, not queryable).

### 2.3 Form submission audit table

- Migration: [scripts/migrate-add-form-submissions-ops.mjs](../../scripts/migrate-add-form-submissions-ops.mjs) L28-L42.
- Table: `dbo.form_submissions` on ops DB (or legacy via `FORM_SUBMISSIONS_USE_LEGACY=true`).
- Columns: `id UNIQUEIDENTIFIER PK`, `form_key NVARCHAR(64)`, `submitted_by NVARCHAR(16)`, `submitted_at DATETIME2(3)`, `lane NVARCHAR(32)`, `payload_json NVARCHAR(MAX)`, `summary NVARCHAR(400)`, `processing_status NVARCHAR(32)`, `processing_steps_json NVARCHAR(MAX)`, `last_event NVARCHAR(200)`, `last_event_at DATETIME2(3)`, `retrigger_count INT`, `last_retriggered_at DATETIME2(3)`, `last_retriggered_by NVARCHAR(16)`, `archived_at DATETIME2(3)`.
- Indexes: `ix_form_submissions_owner (submitted_by, submitted_at DESC)`, `ix_form_submissions_status (processing_status, submitted_at DESC)`.
- **No** `client_submission_id` column yet. must be added in P1.
- Wrapper: [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js). `recordSubmission`, `recordStep`, `markComplete`, `markAwaitingHuman`, `markFailed`. All best-effort, never throw.

### 2.4 Handlers wired into form_submissions (13 confirmed)

- [server/routes/bookSpace.js](../../server/routes/bookSpace.js) L135
- [server/routes/bundle.js](../../server/routes/bundle.js) L67
- [server/routes/counsel.js](../../server/routes/counsel.js) L182
- [server/routes/attendance.js](../../server/routes/attendance.js) L1459 (annual leave)
- [server/routes/experts.js](../../server/routes/experts.js) L170
- [server/routes/financialTask.js](../../server/routes/financialTask.js) L564
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) L2683
- [server/routes/notableCaseInfo.js](../../server/routes/notableCaseInfo.js) L236
- [server/routes/registers.js](../../server/routes/registers.js) L195, L269, L538, L727 (four entry points)
- [server/routes/techTickets.js](../../server/routes/techTickets.js) L636, L806
- [server/routes/transactionsV2.js](../../server/routes/transactionsV2.js) L126
- [server/routes/verify-id.js](../../server/routes/verify-id.js) L1296

### 2.5 User context middleware

- [server/middleware/userContext.js](../../server/middleware/userContext.js). resolves Entra claims → `req.user = { initials, email, fullName }`, LRU 500-entry cache, 15 min TTL.
- Every API request has `req.user.initials` available (when authenticated).

### 2.6 Client telemetry endpoint

- [server/routes/telemetry.js](../../server/routes/telemetry.js) L50-L72. `POST /api/telemetry`. Server enriches with `req.user.initials`, logs to opLog as `telemetry.{source}.{type}`, fires App Insights `Client.{source}.{type}` with `feeEarner` dimension.
- Accepts `type.includes('error')` (L115-L119) and fires `trackException`. **But** the frontend has no automatic capture for unhandled errors. only explicit posts.

### 2.7 Client-side unhandled error handling

- [src/index.tsx](../../src/index.tsx) L103-L170. `window.addEventListener('unhandledrejection', ...)` exists but only calls `reloadOnceForChunkError()`. No fetch to telemetry.
- React ErrorBoundary at [src/components/ErrorBoundary.tsx](../../src/components/ErrorBoundary.tsx). Need to verify whether it posts upstream.

### 2.8 FormsHub UI

- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx). detail pane L551-L650, retrigger button L625-L660.
- Data layer [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts).
- Local stream store [src/tabs/forms/processStreamStore.ts](../../src/tabs/forms/processStreamStore.ts).
- Detail fetch: `GET /api/process-hub/submissions/{id}?initials=<user>`. Retrigger: `POST /api/process-hub/submissions/{id}/retrigger`.

### 2.9 Tier gates

- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) L116. `isAdminUser()` (LZ, AC, KW, JW, LA, EA). `isLzOrAc` inline for dev-preview rollout. New audit lens starts behind `isLzOrAc`, promotes to `isAdminUser()` after one week of stable operation.

### 2.10 Anxiety hotspots (concrete, today)

1. POST never reaches server (network drop, server crash): zero trace anywhere.
2. Server route 500s before `recordSubmission()` is called: App Insights exception only, no FormsHub row.
3. Retrigger network-drops mid-flight: no record it was attempted.
4. Step `failed` with cryptic error text (e.g. "OAuth token expired"): no recovery hint surfaced.
5. Client React error → page reload, no server log of what broke or for whom.

---

## 3. Plan

### Phase P1: Form intent beacon (the original ask)

| # | Change | File | Detail |
|---|--------|------|--------|
| P1.1 | New migration | `scripts/migrate-add-form-submission-intents.mjs` (NEW) | Creates `dbo.form_submission_intents` on ops DB (and adds `client_submission_id NVARCHAR(64) NULL` to `dbo.form_submissions`, with index `ix_form_submissions_client_id`). |
| P1.2 | New server route | `server/routes/form-intent.js` (NEW) | `POST /api/forms/intent`. accepts `{ formKey, clientSubmissionId, payloadFingerprint, userAgent }`, derives `submitted_by` from `req.user.initials`, inserts row. Rate-limited per user (max 30/min). |
| P1.3 | Mount route lazily | [server/index.js](../../server/index.js) | Add `lazyRouter('/api/forms/intent', () => require('./routes/form-intent'))`. |
| P1.4 | Client helper | `src/utils/recordIntent.ts` (NEW) | Exports `recordIntent({ formKey, payload })` → posts to `/api/forms/intent` fire-and-forget, returns `clientSubmissionId` (uuid). Uses `navigator.sendBeacon` fallback on `beforeunload` if pending. |
| P1.5 | Wire P1.4 into each of 13 form submit components | (see file index) | Generate clientSubmissionId on Submit click → call `recordIntent()` BEFORE the real POST → include `clientSubmissionId` in real POST body. |
| P1.6 | Wire server handlers | All 13 handlers in §2.4 | When real handler runs `recordSubmission()`, accept `client_submission_id` from req.body and INSERT into the new column. Add `UPDATE form_submission_intents SET matched_submission_id=@id, matched_at=SYSUTCDATETIME() WHERE client_submission_id=@cid AND matched_submission_id IS NULL` immediately after recordSubmission returns. |
| P1.7 | Reconciler endpoint | `server/routes/form-intent.js` | `GET /api/forms/intents/orphaned?since=ISO`. returns intents older than 2 min with `matched_submission_id IS NULL`. |
| P1.8 | App Insights events | inline | `FormIntent.Recorded`, `FormIntent.Matched`, `FormIntent.Orphaned`. |
| P1.9 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry covering migration + intent endpoint + the 13 wirings. |

**P1 acceptance:**
- Submit a form with the network throttled offline → intent row exists, no matching submission row, App Insights `FormIntent.Orphaned` fires after 2 min.
- Submit a form normally → intent row exists, matched_submission_id populated within 1s of `recordSubmission`.
- `npm run check-sizes` clean.
- All 13 handlers continue to work when `clientSubmissionId` is absent (backwards-compatible for old client builds).

### Phase P2: Client unhandled error → server log

- Modify [src/index.tsx](../../src/index.tsx) L103-L170. extend `unhandledrejection` and `window.onerror` handlers to also fetch `POST /api/telemetry` with `{ source: 'client', event: { type: 'client.error.unhandled', error: { message, stack, source, line, col }, sessionId, route: location.pathname } }`.
- Per-session rate limit: max 5 errors per session per minute (client-side); server adds 100/min/user circuit breaker on telemetry route.
- Extend [src/components/ErrorBoundary.tsx](../../src/components/ErrorBoundary.tsx) to post via the same helper.
- New helper `src/utils/clientErrorReporter.ts`.
- Changelog entry.

**P2 acceptance:** throw an unhandled exception in dev → see `Client.Error.Unhandled` in opLog and App Insights within 2s, with operator initials attached.

### Phase P3: Audit lens (user search)

- New lens chip `'audit'` in [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx).
- New component `src/tabs/roadmap/parts/AuditLens.tsx`:
  - Search input: initials autocomplete from team table.
  - Date range: today / last 7d / custom.
  - Output: unified timeline merging (in this order of priority):
    1. Form submission intents (matched + unmatched) with status badges
    2. `form_submissions` rows where `submitted_by = X`
    3. `ai_proposals` where `created_by = X`
    4. Client errors (`client.error.unhandled`) tagged with `feeEarner = X` from opLog
    5. Telemetry events tagged with `feeEarner = X` (filtered to user-initiated kinds only by default)
  - Each row: kind badge (user/system/background), status badge, time, summary. Click → opens existing FormsHub detail pane in a side panel.
- New server route `server/routes/audit.js`: `GET /api/audit/user/:initials?since=ISO&until=ISO`.
- Initially gated by `isLzOrAc`.
- Changelog entry.

**P3 acceptance:** type "AC" → unified timeline of AC's day renders in under 3 seconds, with status badges making failures obvious at a glance.

### Phase P4: Event kind taxonomy + noise suppression

- Add `kind: 'user' | 'system' | 'background'` to the activity feed row shape in [server/utils/activityFeedDbSources.js](../../server/utils/activityFeedDbSources.js#L99).
  - `form_submissions` rows → `kind: 'user'`
  - `ai_proposals` rows → `kind: 'system'` (AI initiated) or `'user'` (user-triggered) based on a column we'll need to expose
  - `hub_todos` → `kind: 'system'`
  - `tracked_cards` → `kind: 'system'`
- Classify opLog telemetry events:
  - `telemetry.*.navigate.process`, `*.heartbeat`, `*.presence.*` → `kind: 'background'` (hidden by default)
  - `telemetry.*.click.*`, `*.submit.*`, `*.error.*` → `kind: 'user'`
  - Anything else → `kind: 'system'`
- Add a toggle in [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx): "Show background noise" (default off).
- Each row in the activity feed gets a small kind chip so LZ can see at a glance whether it was a person or the system.
- Changelog entry.

**P4 acceptance:** the System tab is no longer drowned in `navigate.process` rows. A user-initiated event has a visibly different chip from a system-fired one.

### Phase P5: Failure explainer

> **Status (2026-05-26): superseded by System Errors triage Phase C.** The failure explainer landed inside the Errors tab instead of FormsHub. Implementation lives in `server/utils/failureCatalog.js` (catalog match), `server/utils/errorContext.js` (dim enrichment via trackRouteException), and is rendered as a "Recommended action" strip per incident in `src/tabs/roadmap/parts/SystemTriagePanel.tsx`. Matter-opening failures get a one-click dry-run + commit replay through `POST /api/system-triage/replay-matter`. See [SYSTEM_ERRORS_TRIAGE_REVAMP.md](SYSTEM_ERRORS_TRIAGE_REVAMP.md) Phase C.

- New module `server/utils/failureExplainer.js`. pattern-matches step `error` strings, returns `{ headline, likelyCause, recoveryAction, severity }`. Initial catalog: OAuth token expired, SQL timeout, 401, 403, 5xx upstream, network DNS, Asana rate limit, Teams webhook 400.
- Server response from `GET /api/process-hub/submissions/{id}` includes `explainer` block alongside `steps`.
- FormsHub detail pane ([src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) L581-L650) renders the explainer block above the raw step output when present.
- Audit lens uses the same data.
- Changelog entry.

**P5 acceptance:** open a known failed submission → see a sentence like "Asana auth expired. The user's form is safe. Click Retrigger; if it fails again call Luke." instead of `Error: invalid_token`.

---

## 4. Step-by-step execution order

1. **P1.1** migration script (creates table + column + indexes).
2. **P1.1** run migration against ops DB locally and staging.
3. **P1.2** + **P1.3** intent route + lazy mount.
4. **P1.4** client helper with uuid + sendBeacon fallback.
5. **P1.5** wire helper into 13 client form components (one PR per logical group is OK; can be parallel).
6. **P1.6** server handler updates (one PR per route file, or batched).
7. **P1.7** orphan reconciler endpoint.
8. **P1.8** telemetry events.
9. **P1.9** changelog.
10. (next session) **P2** unhandled-error capture.
11. (next session) **P3** audit lens.
12. (next session) **P4** event kind taxonomy.
13. (next session) **P5** failure explainer.

---

## 5. Verification checklist

**Phase P1:**
- [ ] Migration runs idempotently against ops DB. `\d dbo.form_submission_intents` shows expected columns.
- [ ] Submit a Tech Problem with Network throttled offline → intent row exists, no submission row.
- [ ] Submit a Tech Problem normally → intent row exists with `matched_submission_id` populated.
- [ ] App Insights: `FormIntent.Recorded` and `FormIntent.Matched` events visible.
- [ ] App Insights: `FormIntent.Orphaned` fires for the offline submission 2+ min later.
- [ ] Old client (no `clientSubmissionId`) still works. backwards compatible.
- [ ] SQL spot check: `SELECT TOP 20 i.client_submission_id, i.created_at, i.matched_at, s.processing_status FROM dbo.form_submission_intents i LEFT JOIN dbo.form_submissions s ON s.client_submission_id = i.client_submission_id ORDER BY i.created_at DESC`.

**Phase P2:**
- [ ] `throw new Error('test')` from a React effect → opLog shows `telemetry.client.error.unhandled` within 2s with operator initials.
- [ ] Burst 10 errors in 10s → only 5 reach server (client rate limit working).

**Phase P3:**
- [ ] Type "AC" in audit lens → timeline of AC's day renders in under 3s.
- [ ] Unmatched intents visible with distinct visual treatment.
- [ ] Click any row → FormsHub detail pane opens in side panel.

**Phase P4:**
- [ ] System tab default view has zero `navigate.process` rows.
- [ ] Toggle "Show background noise" on → they reappear.
- [ ] Every row has a kind chip.

**Phase P5:**
- [ ] Known failure with "invalid_token" error → explainer renders human sentence + Retrigger guidance.

---

## 6. Open decisions (defaults proposed)

1. **Orphan notification**. Default: **surface only in audit lens** (no Teams ping). Rationale: until we know the false-positive rate, a Teams notification could spam. Phase 6 once we see real orphan volume.
2. **Client error rate limit**. Default: **5 per session per minute client-side + 100/min/user server-side**. Rationale: cheap insurance against bad-deploy flood.
3. **Intent retention**. Default: **30 days, then archive matched intents; keep orphans forever for audit**. Rationale: orphans are rare and high-value.
4. **Dev-preview duration**. Default: **1 week behind `isLzOrAc` before promoting to `isAdminUser()`**. Rationale: confirm zero false-positive orphans first.
5. **Sequence**. Default: **P1 → P2 → P3 → P4 → P5**. P1 first because P3 displays P1 data; doing P3 first would show empty rows.

---

## 7. Out of scope

- Offline localStorage retry queue for failed real-form POSTs (future Phase 6).
- Teams notification on orphan (future Phase 6).
- Backfilling historic submissions with synthetic intents.
- Rebuilding FormsHub from scratch.
- New permissions tier (reuses `isAdminUser` / `isLzOrAc`).
- Bot-action / Teams tracking pipeline changes.

---

## 8. File index (single source of truth)

**New files:**
- `scripts/migrate-add-form-submission-intents.mjs`. migration (P1.1)
- `server/routes/form-intent.js`. intent endpoint + orphan reconciler (P1.2, P1.7)
- `src/utils/recordIntent.ts`. client helper (P1.4)
- `src/utils/clientErrorReporter.ts`. client error reporter (P2)
- `src/tabs/roadmap/parts/AuditLens.tsx`. user audit lens (P3)
- `server/routes/audit.js`. audit data endpoint (P3)
- `server/utils/failureExplainer.js`. error → recovery sentence (P5)

**Modified files:**
- [server/index.js](../../server/index.js). mount intent + audit routes (P1.3, P3)
- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js). accept clientSubmissionId in recordSubmission, persist + match intent (P1.6)
- [server/utils/activityFeedDbSources.js](../../server/utils/activityFeedDbSources.js). add `kind` field to row shape (P4)
- [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx). new `audit` lens chip + noise toggle (P3, P4)
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx). render explainer block (P5)
- [src/index.tsx](../../src/index.tsx). wire unhandled error capture (P2)
- [src/components/ErrorBoundary.tsx](../../src/components/ErrorBoundary.tsx). post via reporter (P2)
- All 13 form route handlers in §2.4. accept `clientSubmissionId` from req.body (P1.6)
- All 13 client form components (one per handler). call `recordIntent` on Submit click (P1.5)
- [logs/changelog.md](../../logs/changelog.md). one entry per phase

### Stash metadata (REQUIRED, used by `check stash overlap`)

```yaml
# Stash metadata
id: operator-god-mode-system-tab-pressure-release-valve
verified: 2026-05-23
branch: main
touches:
  client:
    - src/utils/recordIntent.ts
    - src/utils/clientErrorReporter.ts
    - src/tabs/roadmap/parts/AuditLens.tsx
    - src/tabs/roadmap/parts/ActivityHero.tsx
    - src/tabs/forms/FormsHub.tsx
    - src/index.tsx
    - src/components/ErrorBoundary.tsx
  server:
    - server/index.js
    - server/routes/form-intent.js
    - server/routes/audit.js
    - server/utils/formSubmissionLog.js
    - server/utils/activityFeedDbSources.js
    - server/utils/failureExplainer.js
    - server/routes/bookSpace.js
    - server/routes/bundle.js
    - server/routes/counsel.js
    - server/routes/attendance.js
    - server/routes/experts.js
    - server/routes/financialTask.js
    - server/routes/dubberCalls.js
    - server/routes/notableCaseInfo.js
    - server/routes/registers.js
    - server/routes/techTickets.js
    - server/routes/transactionsV2.js
    - server/routes/verify-id.js
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - agent-suggestions-inbox-in-my-helix
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - call-centre-external-attendance-note-and-clio-mirror
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - dev-loop-cold-boot-performance-overhaul
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-ia-ld-undertaking-complaint-flow
  - forms-preflight-matrix-in-activity-tab
  - forms-stream-persistence
  - helix-rehearsal-record-luke-test-as-firm-seed
  - helix-software-dev-productivity-control-plane
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - hub-rollout-training-and-confidence-recovery
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - resources-hub-forms-pattern-rebuild
  - server-mail-send-helper-extraction
  - session-probing-activity-tab-visibility-and-persistence
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas appendix

- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) `recordSubmission` is best-effort and returns `null` on failure. The intent-matching `UPDATE` must therefore tolerate a null id (skip silently). Do NOT throw if recordSubmission returns null.
- `dbo.form_submissions` lives on the ops DB when `OPS_PLATFORM_ENABLED=true`, otherwise on legacy (`SQL_CONNECTION_STRING`). The new `form_submission_intents` table MUST follow the same selector logic; don't hard-code one DB.
- Connection-string selection happens per-call (not at module load) because Key Vault resolves after some utils are required. Pattern in [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) `getConnStr()`. copy it verbatim.
- 13 form handlers must remain backwards compatible: if `clientSubmissionId` is absent (older client build cached in some user's browser), the handler must still record the submission and not crash.
- `navigator.sendBeacon` doesn't accept arbitrary headers. payload must be a Blob with `application/json` type. Don't try to set Authorization on it; the route can resolve the user via cookie/session.
- The audit lens (P3) must NOT show payloads in the timeline list view by default. only in the detail panel. Some payloads contain PII per the Copilot Data Handling rules in copilot-instructions.md.
- Rate limiter on the intent route should key on `req.user.initials || req.ip`, not just IP. a shared office IP would over-limit.
- Existing failed submissions (status='failed') in form_submissions WITHOUT matching intent are NOT orphans. they were submissions, not pre-flight intents. The orphan query is `intents WHERE matched_submission_id IS NULL AND created_at < DATEADD(MINUTE, -2, SYSUTCDATETIME())`.
- When adding the `kind` chip in P4, do NOT change the existing `source`/`status` fields. older clients may still reference them.
