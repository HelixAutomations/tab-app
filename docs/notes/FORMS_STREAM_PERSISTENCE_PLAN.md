# Forms entry stream — denser rows, inline tray, persistent payloads, retrigger

> **Purpose of this document.** This is a self-contained brief that any future agent (or LZ on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below. Verified against the codebase on 2026-04-18 against branch state at the time of writing.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B is independent and can be picked up later. Add a `logs/changelog.md` entry per phase.

---

## 1. Why this exists (user intent)

The **Form entries** rail in the Forms launcher (`FormsHub.tsx`) currently:

1. Renders rows that are too tall — only ~12 fit before scrolling, and each carries a resting "Edit" button that adds visual weight.
2. When a row's Edit is clicked, the editor panel renders **at the bottom of the list**, not under the active row. Visually, the user clicks row 1 and the tray appears below row 12.
3. Treats the rail as a transient UI scratchpad. The items are stored in `localStorage` only — there is **no server-side persistence of form submission payloads or processing state**, so a failed submission cannot be inspected or re-triggered.

The user wants the rail to become a real "submitted-and-stored" surface: dense list, tray opens under the active row, payloads persisted, and a retrigger affordance for failed processing — without forcing the user to re-fill the form.

---

## 2. Current state — verified findings

### 2.1 Where stream items live today

- `localStorage` key `forms-hub:submission-stream`, capped at `MAX_STREAM_ITEMS = 12` (see [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L43)).
- All read/write is done by [src/tabs/forms/processStreamStore.ts](../../src/tabs/forms/processStreamStore.ts) via `safeGetItem` / `safeSetItem` from `src/utils/storageUtils`.
- Item shape (see `ProcessStreamItem` in `src/tabs/forms/processHubData.ts`):

  ```
  { id, lane, processTitle, startedAt, status, summary, lastEvent }
  ```

  No payload, no actor, no per-step processing state, no error message field.

### 2.2 What `/api/process-hub/submissions` actually returns

- Defined in [server/routes/processHub.js](../../server/routes/processHub.js#L300) (route handler near line 300; helper `probeProcessHub` near line 235; `toProcessItem` near line 100).
- It is a **tech-tickets-only adapter**. The SQL UNIONs `dbo.tech_ideas` and `dbo.tech_problems`. It does **not** read undertakings, complaints, learning-dev entries, bundles, or any other form submission.
- The response declares its source explicitly: `{ items, source: 'techTickets-adapter' }` — line ~338.
- Mapped status vocabulary (lossy): `submitted → queued`, `asana_created → processing`, `asana_failed → failed`, anything else → `awaiting_human`.

### 2.3 Where current form POSTs land

Each form has its own table and its own POST handler. None of them log a unified submission record. Verified handlers:

- [server/routes/registers.js](../../server/routes/registers.js):
  - L125 `POST /learning-dev`
  - L173 `POST /learning-dev/activity`
  - L230 `PUT /learning-dev/:id`
  - L276 `PUT /learning-dev/activity/:id`
  - L399 `POST /undertakings`
  - L440 `PUT /undertakings/:id`
  - L534 `POST /complaints`
  - L579 `PUT /complaints/:id`
- [server/routes/techTickets.js](../../server/routes/techTickets.js):
  - L560 `POST /idea`
  - L689 `POST /problem`
- Bundle, notable case info, transaction intake — also write to their own tables; not yet enumerated, but follow the same pattern (look for `router.post` in their route files when reached).

### 2.4 Why the edit tray appears at the bottom

In [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) the structure inside `forms-hub__stream-list` is:

```tsx
{visibleStreamItems.map((item) => (
  <button className="forms-hub__stream-item" ...>
    {/* row content + Edit pill that sets editingStreamItemId */}
  </button>
))}
{canManageStreamEntries && editingStreamItem && (
  <div className="forms-hub__stream-edit-panel">
    {/* form picker, status chips, Done */}
  </div>
)}
```

The `<div className="forms-hub__stream-edit-panel">` block is rendered **after** the `.map(...)` closes (around line 693 in the current file). So regardless of which row was clicked, the panel is always the next sibling after the last rendered row. To make the tray appear under the active row, the conditional render needs to move **inside** the `.map()` callback and only render when `item.id === editingStreamItemId`.

### 2.5 The server-load effect

`useEffect` near line 256 in `FormsHub.tsx` fetches `${baseUrl}/api/process-hub/submissions?limit=8` whenever the launcher opens, and merges the (tech-ticket) items into `streamItems`, dedupe by `processTitle`. This is what makes the rail look populated even though there's no real persistence — Phase B replaces this with a real submissions endpoint.

### 2.6 Admin gating

Both `showDevStreamPanel` and `canManageStreamEntries` resolve to `isAdminUser(currentUser)` (FormsHub.tsx ~L137). Phase A keeps gating identical. Phase B introduces an "owner-or-admin" payload visibility rule (see §6 decision 1).

---

## 3. Two-phase plan

### Phase A — UX correction (small, ships independently)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Collapse `.forms-hub__stream-item` to one tight row (~36–40px). Status dot · title (truncate) · timestamp · entry id. **Remove the resting `Edit` pill** — surface it only on hover or via a single trailing icon. | [src/tabs/forms/forms-tokens.css](../../src/tabs/forms/forms-tokens.css), [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) (L645-L692) | Aim for ~20+ items visible without scroll. Keep status pill but reduce to a 6px dot. Drop the `forms-hub__stream-item-meta-line--id` second line; combine timestamp + id on one row in `subText` style. |
| A2 | Move the `editingStreamItem` render **inside** the `.map(visibleStreamItems)` callback. Render it as a sibling tray immediately after the matched `<button>` so it appears under the active row. Tray should expand inline (no portal). | [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) (L646-L730) | Wrap each item in a `<li>` or fragment. When `item.id === editingStreamItemId`, render the existing `.forms-hub__stream-edit-panel` JSX after the row button. Delete the standalone block at L693-L730. |
| A3 | Trim Phase A tray content to: status chips · form-template picker · "Open form" primary action · close. Reserve a `<section>` placeholder labelled "Payload + processing" with disabled "Retrigger" — wired in Phase B. | Same component | Disabled placeholder telegraphs the upcoming capability without blocking the visual fix. |
| A4 | Verify locally, then add a one-line `logs/changelog.md` entry. | [logs/changelog.md](../../logs/changelog.md) | Format per copilot-instructions §Logging. |

**Phase A acceptance:** ~20+ rows visible without scroll · clicking row 3 opens tray under row 3 · clicking row 7 closes row 3's tray and opens under row 7 · status pill, form picker, Done still functional.

### Phase B — Persistence + retrigger (architectural)

#### B1. Schema — `form_submissions` (Core Data DB)

Create a single table that accepts every form's submission as a payload blob plus normalised metadata:

```sql
CREATE TABLE dbo.form_submissions (
  id                     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  form_key               NVARCHAR(64)     NOT NULL,        -- 'undertaking' | 'complaint' | 'learning-dev' | 'learning-dev-activity' | 'tech-idea' | 'tech-problem' | 'bundle' | ...
  submitted_by           NVARCHAR(16)     NOT NULL,        -- initials
  submitted_at           DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  lane                   NVARCHAR(32)     NULL,            -- mirrors ProcessLane for client rendering
  payload_json           NVARCHAR(MAX)    NOT NULL,        -- the original POST body (sanitised — see §6 decision 1)
  summary                NVARCHAR(400)    NULL,            -- short label for the rail
  processing_status      NVARCHAR(32)     NOT NULL,        -- 'queued' | 'processing' | 'awaiting_human' | 'complete' | 'failed'
  processing_steps_json  NVARCHAR(MAX)    NULL,            -- JSON array: [{ name, startedAt, finishedAt, status, error?, output? }]
  last_event             NVARCHAR(200)    NULL,
  last_event_at          DATETIME2(3)     NULL,
  retrigger_count        INT              NOT NULL DEFAULT 0,
  last_retriggered_at    DATETIME2(3)     NULL,
  last_retriggered_by    NVARCHAR(16)     NULL,
  archived_at            DATETIME2(3)     NULL
);

CREATE INDEX ix_form_submissions_owner   ON dbo.form_submissions (submitted_by, submitted_at DESC);
CREATE INDEX ix_form_submissions_status  ON dbo.form_submissions (processing_status, submitted_at DESC) WHERE archived_at IS NULL;
```

Migration script: `scripts/migrate-add-form-submissions.mjs` (model after `scripts/migrate-add-collectedtime-indexes.mjs`).

#### B2. Helper — `server/utils/formSubmissionLog.js`

New module exposing:

- `recordSubmission({ formKey, submittedBy, lane, payload, summary }) → submissionId`
- `recordStep(submissionId, { name, status, error?, output? })`
- `markComplete(submissionId, { lastEvent? })`
- `markFailed(submissionId, { lastEvent, error })`
- `loadSubmission(submissionId)`

Each emits App Insights telemetry per the rules in `.github/copilot-instructions.md` §"Application Insights":

- `FormSubmission.Recorded` `{ formKey, submittedBy }`
- `FormSubmission.StepCompleted` `{ formKey, step, status }`
- `FormSubmission.Completed` `{ formKey, durationMs }`
- `FormSubmission.Failed` `{ formKey, error, step }` + `trackException`
- `FormSubmission.Retriggered` `{ formKey, retriggerCount }`

#### B3. Wire existing handlers through the helper

For each handler listed in §2.3, wrap the existing logic so that:

1. Before any side-effects, call `recordSubmission(...)` and capture `submissionId`.
2. Around each external call (Asana, Teams notification, Clio, etc.), wrap with `recordStep`.
3. On success → `markComplete`. On failure → `markFailed` + still return the existing error response.

The existing tables (e.g. `tech_ideas`, `Undertakings`, `Complaints`, `LearningDevPlans`) are unchanged. `form_submissions` is an audit + retrigger source-of-truth that lives alongside them.

Order:
- B3a: `registers.js` — undertakings (L399), complaints (L534), learning-dev (L125), learning-dev/activity (L173).
- B3b: `techTickets.js` — idea (L560), problem (L689).
- B3c: bundle, notable case info, transaction intake (extend as touched).

#### B4. Replace `/api/process-hub/submissions`

In [server/routes/processHub.js](../../server/routes/processHub.js):

- Replace the SQL inside `probeProcessHub` so it reads from `form_submissions` ordered by `submitted_at DESC`, scoped to `WHERE archived_at IS NULL` and (default) `WHERE submitted_by = @initials OR @isAdmin = 1`.
- Update `toProcessItem` to map a `form_submissions` row to the existing client `ProcessStreamItem` shape, plus three new fields: `submissionId`, `payloadAvailable: true`, `steps?: ProcessStep[]`.
- Update the `source` literal in the response from `'techTickets-adapter'` to `'form_submissions'`. Keep the response key (`items`) stable so the client effect at FormsHub L256 keeps working.

#### B5. New endpoints

In `processHub.js`:

- `GET /submissions/:id` — returns the full record incl. `payload_json` parsed. Authorise: admin OR `req.user.initials === row.submitted_by` (see §6 decision 1).
- `POST /submissions/:id/retrigger` — looks up the row, dispatches by `form_key` to a per-form handler that re-runs the side-effect with `payload_json`. Increments `retrigger_count`, updates `last_retriggered_at`/`last_retriggered_by`. Authorise as above.
- `DELETE /submissions/:id` — admin-only soft-delete (sets `archived_at`).

A small dispatcher map keeps the routing explicit:

```js
const RETRIGGER_DISPATCH = {
  'tech-idea':   require('./techTickets').retriggerIdea,
  'tech-problem':require('./techTickets').retriggerProblem,
  'undertaking': require('./registers').retriggerUndertaking,
  'complaint':   require('./registers').retriggerComplaint,
  // ...add as B3 progresses
};
```

Each retrigger function should be **idempotent** or carry an external-id check (see §6 decision 2).

#### B6. Client tray — Phase B

In [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx):

- When the inline tray opens for an item with `submissionId`, lazy-fetch `GET /api/process-hub/submissions/:id`.
- Render: collapsible payload (JSON pretty-print), step timeline, per-step error message.
- Add **Retrigger** button (visible when `processing_status === 'failed'`) → POST `/submissions/:id/retrigger` → optimistic status `processing` → short-poll `:id` every 2s up to 30s.
- Add **Edit and retrigger** → opens the original form (`handleSelectForm(target)`) prefilled from `payload_json`. Each form component will need a thin `initialPayload` prop (out of scope for the core wiring — wire as forms are touched).

#### B7. Drop localStorage seeding

Once B4–B6 are live, delete or short-circuit the `prependStoredStreamItem` write path in `processStreamStore.ts`. Keep an *optimistic* prepend on form submit (so the row appears before the server round-trip completes) but treat the server as the source of truth on next refresh.

Update [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) `ProcessStreamItem` to include optional `submissionId`, `payloadAvailable`, `steps`.

---

## 4. Step-by-step execution order

Phase A first (independent ship). Phase B has parallelisable bits:

1. **A1** collapse row CSS + JSX.
2. **A2** move tray inside `.map()`.
3. **A3** trim tray content + add disabled "Retrigger" placeholder.
4. **A4** changelog entry.
5. *(parallel with 6)* **B1** migration script for `form_submissions`.
6. *(parallel with 5)* **B2** `server/utils/formSubmissionLog.js`.
7. **B3a** wire `registers.js` (depends on 5+6).
8. **B3b** wire `techTickets.js` (parallel with 7).
9. **B4** rewrite `/submissions` reader (depends on 7+8).
10. **B5** add `/:id`, `/:id/retrigger`, `/:id` DELETE + dispatcher (depends on 9).
11. **B6** client tray Phase B additions (depends on 10).
12. **B7** drop localStorage seeding (depends on 11).
13. Smoke test each form-key end-to-end (submit → fail one step → retrigger).
14. Changelog entry per phase.

---

## 5. Verification checklist

**Phase A:**

- [ ] Visible row count goes from ~12 to ~20+ without scroll, in the standard rail width.
- [ ] Clicking row 1's edit affordance opens the tray under row 1, not at the bottom.
- [ ] Opening another row's tray collapses the first.
- [ ] Status chips, form picker, Done still functional.
- [ ] Lighthouse / manual a11y: edit affordance is keyboard-reachable.

**Phase B:**

- [ ] `SELECT TOP 5 * FROM dbo.form_submissions ORDER BY submitted_at DESC` returns rows for each form-key after submission.
- [ ] Submit Undertaking → row appears with `processing_status='complete'`, `processing_steps_json` populated.
- [ ] Submit Tech Idea with Asana token deliberately unset → row shows `failed`, step `asana.create` carries an error string.
- [ ] Hit **Retrigger** in the rail → step re-runs; on success status flips to `complete`; `retrigger_count = 1`.
- [ ] Reload the launcher in a fresh browser session (clear localStorage) → submissions still appear.
- [ ] App Insights shows `FormSubmission.Recorded`, `FormSubmission.Failed`, `FormSubmission.Retriggered` events.

---

## 6. Open decisions (defaults proposed)

1. **Payload visibility scope.** Undertaking/complaint payloads carry client names. Default: **owner-only + admin override** (admin = `isAdminUser`). Reject with `403` otherwise. Document this in the route's JSDoc.
2. **Retrigger idempotency.** Asana/Teams handlers may have created an external task on the first attempt. Each retrigger function MUST either (a) record the external id on first success and short-circuit on retrigger, or (b) accept a `force: true` flag. Default: implement (a) where the external system returns an id we can store; otherwise expose `force` toggle in the tray.
3. **Status updates after retrigger.** Phase B uses **short-poll every 2s for up to 30s**. Switch to SSE (Phase C) only if the rail becomes a live ops surface.

---

## 7. Out of scope

- Bulk retrigger (multi-select rows).
- Payload diff between attempts.
- Formal retention policy beyond the soft-delete column. Suggested follow-up: nightly job to set `archived_at` where `submitted_at < DATEADD(day, -90, SYSUTCDATETIME())` and `processing_status = 'complete'`.
- Cross-app surfacing (Instructions / Enquiries side panes). If the rail proves valuable, lift `form_submissions` to a shared cross-app contract — track in `.github/instructions/ROADMAP.md`.

---

## 8. Files referenced (single source of truth)

Client:
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) — launcher + rail + tray
- [src/tabs/forms/processStreamStore.ts](../../src/tabs/forms/processStreamStore.ts) — localStorage layer
- [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) — `ProcessStreamItem`, `streamStatusMeta`, `LEDGER_VISIBLE_STATUSES`
- [src/tabs/forms/forms-tokens.css](../../src/tabs/forms/forms-tokens.css) — `.forms-hub__stream-item`, `.forms-hub__stream-edit-panel`

Server:
- [server/routes/processHub.js](../../server/routes/processHub.js) — current `/definitions`, `/submissions`, `/health`; future `/:id`, `/:id/retrigger`, `/:id` DELETE
- [server/routes/registers.js](../../server/routes/registers.js) — undertakings, complaints, learning-dev handlers
- [server/routes/techTickets.js](../../server/routes/techTickets.js) — idea, problem handlers
- `server/utils/formSubmissionLog.js` (NEW)
- [server/utils/db.js](../../server/utils/db.js) — `withRequest` helper pattern
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — telemetry helpers

Scripts / docs:
- `scripts/migrate-add-form-submissions.mjs` (NEW) — model after `scripts/migrate-add-collectedtime-indexes.mjs`
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — add `form_submissions` section after B1 lands
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata

```yaml
# Stash metadata
id: forms-stream-persistence
verified: 2026-04-18
branch: main
touches:
  client:
    - src/tabs/forms/FormsHub.tsx
    - src/tabs/forms/processStreamStore.ts
    - src/tabs/forms/processHubData.ts
    - src/tabs/forms/forms-tokens.css
  server:
    - server/routes/processHub.js
    - server/routes/registers.js
    - server/routes/techTickets.js
    - server/utils/formSubmissionLog.js  # NEW
  submodules: []
depends_on: []
coordinates_with: [dev-preview-and-view-as]   # both touch FormsHub.tsx admin gating
conflicts_with: []
```

## 9. Gotchas appendix

- `FormsHub.tsx` ~L662: the row click calls `handleSelectForm(target)`. The inline Edit button uses `event.stopPropagation()` to avoid firing the parent row click. Preserve this when restructuring rows in Phase A.
- `FormsHub.tsx` ~L266: the server-load effect dedupes by `processTitle` (`localOnly = current.filter((item) => !incomingItems.some((incoming) => incoming.processTitle === item.processTitle))`). This is a noisy heuristic — two submissions of the same form-title silently collapse. Phase B's `submissionId` makes this go away; until then, do not rely on rail count being accurate.
- `processStreamStore.ts` writes on every state change via the `useEffect(writeStoredStream(streamItems))` at FormsHub L237. If you replace localStorage seeding in Phase B7, also remove that effect or it will keep writing.
- The current `/api/process-hub/submissions` response carries `source: 'techTickets-adapter'`. UI doesn't read this string today, but a couple of telemetry queries do — grep for `techTickets-adapter` before changing it in B4.
- `isAdminUser` gates BOTH `showDevStreamPanel` and `canManageStreamEntries` (FormsHub L137). The `dev-preview-and-view-as` brief flips `showDevStreamPanel` to a dev-group gate. If that brief ships first, Phase A here must update its gate references.
