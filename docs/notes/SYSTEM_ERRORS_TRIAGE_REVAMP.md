# System Errors triage revamp

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-26 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user opened the new System then Errors view filtered to `SP - Sam Packwood` and saw eight rows that looked like a raw log dump rather than a triage surface. Verbatim: *"it's not built for purpose it shows me the raw problems and who are thereby better than showing me any resolutions or escalation controls. The likely issue box doesn't add any value."*

The page must move from "what happened" to "what is broken and what do I do about it". This brief scopes that change.

Not in this brief: the Dashboard view, persisted incident state across reloads (deferred to Phase B), real Teams/email send (deferred to Phase B).

---

## 2. Current state — verified findings

### 2.1 Stat pills now match evidence (shipped earlier today)

- File: [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) — `evidenceStats` memo around L332 drives the four StatPills. Server-errors filter widened to include exception-tone events around L133.
- Changelog: 2026-05-26 "System errors stat/evidence alignment".

### 2.2 Evidence rows are ungrouped

- File: [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) ~L546-L560 — `filteredEvidence.map((event) => ...)` renders one row per evidence item with no clustering.
- Observed: `Asana credentials missing` rendered 3 times in 30s; `POST /api/verify-id 500` rendered twice; two SQL schema-drift exceptions render as separate rows even though they share the same deployment cause.

### 2.3 "Likely issue" panel dominates the viewport and frequently renders empty

- File: [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) ~L480-L497 — a 142px-min-height box that fills 1.5fr of the top grid; shows "No triage result / No summary available / Refresh the window or widen the filter" when `issue` is undefined. Adds no operator value.

### 2.4 Rows mix global vs user-scoped errors silently

- File: [server/routes/system-triage.js](../../server/routes/system-triage.js) — KQL user filter widens by `user =~ targetInitials or name has targetInitials or message has targetInitials or path has targetInitials or tostring(details) has targetInitials`. Global app exceptions (e.g. SQL schema drift) appear under a user filter only because they happened in the window, with no badge to say "this is not specific to SP".

### 2.5 No actions on a row

- File: [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) — evidence row renders timestamp, source, title, detail, status, duration. No buttons, no menu, no deep link to App Insights, no clipboard summary.

### 2.6 Formatting bugs in evidence row

- File: [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) — status and duration are concatenated visually (`500269ms`); exception rows always show `00ms`; full URLs (with query string) dominate the row. Sessions stat is always 0 currently and still takes a quarter of the StatPill grid.

---

## 3. Plan

### Phase A — Cluster, declutter, basic actions (client-only, no backend persistence)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add `clusterEvidence(evidence)` helper that groups rows by signature | [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) | Signature rules: requests -> `${method} ${path} ${status}`; exceptions -> `${exceptionType}::${normalisedMessage}` (strip GUIDs, ids, timestamps, quoted column/table names -> placeholder `<id>`); client/session events -> `${title}`. Output: `{ signature, title, count, firstSeen, lastSeen, affectedInitials: Set<string>, severity, scope: 'user'\|'global', rows: TriageEvidence[] }`. |
| A2 | New `IncidentRow` component | [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) | Collapsed: severity bar, signature title, `xN` chip, affected initials chips (max 3 + overflow), status badge, last-seen relative time, overflow menu. Expanded: raw rows underneath with timestamp, status, duration, full URL/detail. |
| A3 | Action menu per incident | [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) | Items: `Acknowledge` (local state only this phase), `Assign...` (opens user picker, dev-group only), `Copy escalation summary` (clipboard: signature + count + window + first affected user + top row detail), `Mark resolved` (local state), `Copy signature`, `Open in App Insights` (only when row has staging origin). Ack/resolve persist in `sessionStorage` keyed by signature for this phase. |
| A4 | Demote "Likely issue" | [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) ~L480-L497 | Delete the 142px panel. Replace with a one-line banner above the incident list, rendered only when there is a top incident with `count >= 3` OR any 5xx status. Dismissible per session. |
| A5 | Tighten layout | [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) | StatPills become a single horizontal row above incidents. Hide Sessions pill when value is 0. Split status and duration in evidence rows. Truncate URLs to `path?...` with full URL as `title` attribute. |
| A6 | Server adds `exceptionType`, normalised message, `scope`, App Insights deep link | [server/routes/system-triage.js](../../server/routes/system-triage.js) | Project `type` and `outerType` from `AppExceptions`. Add per-evidence-row `scope: 'user'\|'global'` set to `user` when the row matches `targetInitials`, else `global`. Add `aiDeepLink` field on staging rows when workspace id is configured. |
| A7 | Changelog entry | [logs/changelog.md](../../logs/changelog.md) | One entry summarising Phase A. |

**Phase A acceptance:**
- SP view: the three `Asana credentials missing` rows collapse into one incident with `x3` and an SP chip; the two `verify-id 500` rows collapse into one with `x2`.
- All-users view: each SQL schema-drift exception is its own incident; SQL rows have a `global` badge when viewed under a user filter.
- "Likely issue" panel is gone. Banner appears only when there is a real top incident.
- Each incident exposes Acknowledge / Assign / Copy summary / Mark resolved / Open in App Insights / Copy signature.
- Sessions pill hidden when 0. Status and duration render separately. URLs truncate.

### Phase B — Persisted state + real escalation

#### B1. Server-side incident state

- New SQL table `system_triage_incident_state` (Instructions DB):
  - `signature TEXT NOT NULL PRIMARY KEY`
  - `status TEXT NOT NULL CHECK (status IN ('new','acknowledged','assigned','resolved'))`
  - `assigned_to TEXT NULL` (initials)
  - `acknowledged_by TEXT NULL`
  - `acknowledged_at DATETIME NULL`
  - `resolved_at DATETIME NULL`
  - `note TEXT NULL`
  - `updated_at DATETIME NOT NULL`
- New routes on `server/routes/system-triage.js`:
  - `GET /api/system-triage/incidents/state?signatures=...` bulk fetch
  - `POST /api/system-triage/incidents/:signature/state` upsert (body: status, assigned_to, note)
- Frontend hydrates incident state alongside evidence; ack/assign/resolve become server-side instead of sessionStorage.

#### B2. Real escalation

- `Escalate` action posts to a new `POST /api/system-triage/incidents/:signature/escalate` route which sends a Teams DM via existing Teams webhook (or email to `lz@helix-law.com` as fallback). Reuses existing email helper; do not invent a new one.
- App Insights telemetry event `System.Errors.Incident.Action` with `{ action, signature, initials }`.

---

## 4. Step-by-step execution order

1. **A6** first — server projects `exceptionType`, normalised message, `scope`, `aiDeepLink`. Lock the contract before the client consumes it.
2. **A1** — `clusterEvidence` helper.
3. **A2** — `IncidentRow` collapsed + expanded states.
4. **A3** — action menu wired to sessionStorage; Open in App Insights only when `aiDeepLink` present.
5. **A4** — delete Likely issue panel, add conditional banner.
6. **A5** — StatPill row collapse, hide Sessions when 0, formatting fixes.
7. **A7** — changelog.
8. *(Phase B)* B1 then B2 in order.

---

## 5. Verification checklist

**Phase A:**
- [ ] SP view: `Asana credentials missing` is one incident `x3` with SP chip.
- [ ] SP view: `POST /api/verify-id 500` is one incident `x2` with SP chip.
- [ ] All-users view: SQL errors are separate incidents with `global` badge under any user filter.
- [ ] Likely issue panel removed; banner only shows when criteria met.
- [ ] Acknowledge / Mark resolved persist across panel re-renders within the session.
- [ ] Copy escalation summary writes a readable multi-line string to clipboard.
- [ ] Open in App Insights opens the portal with the right KQL (only on staging rows).
- [ ] `npm run build` clean; `get_errors` clean on touched files.

**Phase B:**
- [ ] Ack/assign/resolve survive a hard refresh.
- [ ] Escalate delivers to Teams or email.
- [ ] App Insights event `System.Errors.Incident.Action` visible with `Completed`/`Failed` variants.

---

## 6. Open decisions (defaults proposed)

1. **Escalate channel in Phase B** — Default: **Teams webhook if configured, else email to `lz@helix-law.com`**. Rationale: reuse existing wiring; do not stand up a new transport.
2. **Assignee picker scope** — Default: **dev-group only** (`isDevGroupOrHigher`). Rationale: errors are an internal-dev concern.
3. **Phase A persistence** — Default: **sessionStorage, signature-keyed**. Rationale: avoids new DB table until Phase B confirms shape.
4. **Banner threshold** — Default: **`count >= 3` OR any 5xx**. Rationale: matches the SP screenshot pattern.

---

## 7. Out of scope

- Dashboard view changes (still in System chooser as the second tile).
- Cross-window history ("first seen 3 days ago"); Phase A windows are point-in-time.
- Auto-resolution heuristics (e.g. mark resolved when not seen for N minutes).
- KQL deep links into non-staging environments.
- Bulk actions across incidents.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx) — clustering, IncidentRow, action menu, layout, banner. Largest delta.
- [src/tabs/roadmap/system/SystemErrorsView.tsx](../../src/tabs/roadmap/system/SystemErrorsView.tsx) — may host the banner if the panel becomes too tall.

Server:
- [server/routes/system-triage.js](../../server/routes/system-triage.js) — Phase A: add `exceptionType`, normalised message, `scope`, `aiDeepLink`. Phase B: new state + escalate routes.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: system-errors-triage-revamp
verified: 2026-05-26
branch: main
touches:
  client:
    - src/tabs/roadmap/parts/SystemTriagePanel.tsx
    - src/tabs/roadmap/system/SystemErrorsView.tsx
  server:
    - server/routes/system-triage.js
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```

---

## 9. Gotchas appendix

- The local-dev caller-identity fallback in [server/routes/system-triage.js](../../server/routes/system-triage.js) uses `?initials=` only when no header identity is present. Keep `targetInitials` distinct from caller initials, collapsing them re-introduces the 403 bug fixed earlier today.
- KQL `take N` must come after `sort by`, not before — using `top N by ...` against the staging workspace returned `query_failed`.
- Some evidence rows ship without `categories` (older path); `evidenceMatchesFilter` falls back to source heuristics. Keep that fallback intact when clustering, or the SP filter loses rows.
- The four StatPills now read from `evidenceStats` (derived from the same array the panel renders). Do not regress this when restructuring layout.
- Normalising exception messages: strip quoted identifiers (`'client_submission_id'` -> `'<id>'`) and GUIDs, but leave the exception type intact. Without this, every fresh schema drift becomes a "new" incident.
- `Open in App Insights` deep link must NOT embed customer PII from the row. Build the link from signature only (KQL search by exception type + path), not from the row's email/initials querystring.

## Phase C - Failure catalog + matter replay (2026-05-26)

- Added shared trackRouteException wrapper (server/utils/errorContext.js) that merges route, method, initials, submissionId, clientSubmissionId, formKey, instructionRef, payloadFingerprint (sha256 first 12 chars) into App Insights exception customDimensions.
- Wrapped primary failure sites: server/routes/clioMatters.js (matter creation), server/routes/financialTask.js (route catch), server/routes/techTickets.js (idea + problem), server/routes/verify-id.js (adhoc tillerSubmit + insertIDVerification).
- Extended KQL projection in server/routes/system-triage.js across all 10 union legs so the new dimensions reach triage evidence.
- New server/utils/failureCatalog.js maps an evidence event to { headline, explanation, action }. Action kinds: retrigger-submission, replay-matter, open-form-detail, open-schema-ref, copy-curl, none.
- New POST /api/system-triage/replay-matter (gated to LZ/AC + canAccessSystemTriage) spawns tools/run-matter-oneoff.mjs as a child process; dry-run by default, commit flag promotes to live.
- SystemTriagePanel renders a Recommended action strip per incident with a single primary button, optional Commit replay button after dry-run, and a JSON preview pane.
- No new table; raw payloads never persisted (fingerprint only).
