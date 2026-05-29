# Hub System Errors Repair Queue

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-26 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

System Errors was hardened on 2026-05-26 so the default view is Hub-only, grouped by canonical incidents, and stripped of Tasking-v3/shared-workspace noise. The user then asked: "identify the real problems in hub that we need to fix. anything you need from me?" and then: "stash this so we dont get lost and then one by one, rapid fire. begin."

This brief parks the real Hub repair queue discovered from the cleaned `All users + Today` feed, so each item can be fixed quickly without losing the incident context. It is not a request to rebuild System Errors itself. It is a queue of operational fixes exposed by System Errors.

---

## 2. Current state - verified findings

### 2.1 System Errors feed is now scoped and usable

- [server/routes/system-triage.js](../../server/routes/system-triage.js#L30) defaults Log Analytics role filtering to `link-hub-v1` and `helix-hub-server`, excluding shared-workspace apps such as Tasking-v3.
- [server/routes/system-triage.js](../../server/routes/system-triage.js#L645) builds the Log Analytics union query and filters by App Insights role before failure matching.
- [server/routes/system-triage.js](../../server/routes/system-triage.js#L680) chooses the staging Log Analytics workspace and role override env vars.
- [src/tabs/roadmap/parts/SystemTriagePanel.tsx](../../src/tabs/roadmap/parts/SystemTriagePanel.tsx#L356) keeps session summary rows out of the default incident list; they remain visible via the Sessions filter.

### 2.2 Real incident queue from cleaned feed

- `Asana credentials missing`: 6 rows, user SP. Client and server evidence. Source anchors: [server/routes/bundle.js](../../server/routes/bundle.js#L89), [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx#L1162), [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx#L2052).
- `Annual leave calendar side-effects failed`: 4 rows. SQL TDS error on `@outlookEntryId`: invalid data length or metadata length. Source anchors: [server/routes/attendance.js](../../server/routes/attendance.js#L1543), [server/routes/attendance.js](../../server/routes/attendance.js#L1946), [server/routes/attendance.js](../../server/routes/attendance.js#L1949).
- `Matter opening failed: invalid practice area`: 3 rows. Payload value was `commercial`. Source anchor: [server/routes/clioMatters.js](../../server/routes/clioMatters.js#L299).
- `Matter-open confirmation email failed auth`: 1 row. Confirmation email call returned 401 because user context headers were missing. Source anchor: [server/routes/clioMatters.js](../../server/routes/clioMatters.js#L723).
- `SQL column missing: client_submission_id`: 20 rows. Source anchors: [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js#L100), [server/routes/form-intent.js](../../server/routes/form-intent.js#L83), [server/routes/audit.js](../../server/routes/audit.js#L155).
- `SQL object missing: dbo.form_submission_intents`: 20 rows. Source anchors: [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js#L122), [server/routes/form-intent.js](../../server/routes/form-intent.js#L93), [server/routes/audit.js](../../server/routes/audit.js#L157).
- `SQL object missing: dbo.ai_proposals`: 12 rows. Source anchors: [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js#L16), [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js#L142), [server/routes/audit.js](../../server/routes/audit.js#L256).
- `SQL object missing: dbo.team`: 1 row. Source anchors: [server/utils/teamLookup.js](../../server/utils/teamLookup.js#L9), [server/utils/teamData.js](../../server/utils/teamData.js#L37), [server/routes/attendance.js](../../server/routes/attendance.js#L1590).
- `Clio rate limit hit`: 4 rows. Source anchors: [server/routes/reporting.js](../../server/routes/reporting.js#L863), `server/routes/home-wip.js` from staging stack trace around `fetchClioActivities`.
- Remaining lower-confidence rows: one `TypeError: fetch failed`, one `CredentialUnavailableError`, one `HTTP 401`, and route-specific network failures. Treat these as follow-up drill-down after the structural fixes above.

### 2.3 Stash overlap scan

Initial scan was run with the likely repair files and exited 2 because nine open briefs share exact files. These are declared as `coordinates_with` below. The scan also reported 41 same-directory coordinations, which are informational.

---

## 3. Plan

### Phase A - confirm and fix SQL schema drift

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Read-only schema check | database only | Confirm which DB the staging routes are using and whether `dbo.form_submission_intents`, `dbo.ai_proposals`, `dbo.team`, and `client_submission_id` exist. |
| A2 | Apply or repair migrations | `scripts/**` or DB admin command | Use existing migration scripts if present. Otherwise add a focused migration script and run only after presenting the DDL. |
| A3 | Smoke affected routes | [server/routes/form-intent.js](../../server/routes/form-intent.js), [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js), [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js), [server/routes/audit.js](../../server/routes/audit.js) | Verify the missing-object and missing-column errors disappear from System Errors. |

**Phase A acceptance:**
- Staging schema check reports the expected objects and columns present.
- System Errors no longer shows `dbo.form_submission_intents`, `dbo.ai_proposals`, `dbo.team`, or `client_submission_id` incidents for fresh probes.
- Any migration script is idempotent and logged.

### Phase B - fix matter opening credential and mapping failures

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | SP Asana credential path | [server/routes/bundle.js](../../server/routes/bundle.js), [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx), [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx) | Decide whether SP should have Asana credentials or whether the flow should gracefully bypass Asana for that user/context. Do not paste secrets into chat. |
| B2 | Practice-area mapping | [server/routes/clioMatters.js](../../server/routes/clioMatters.js) | Map `commercial` to a valid Clio practice area or stop sending that value from the UI. |
| B3 | Confirmation email auth | [server/routes/clioMatters.js](../../server/routes/clioMatters.js) | Preserve user context headers or convert the internal call to a server-side helper that does not require browser auth headers. |

**Phase B acceptance:**
- Compact matter pre-validation does not fail on SP solely because Asana credentials are missing, unless the intended business rule is to block SP.
- Matter opening no longer rejects `commercial` or the UI no longer submits it.
- Confirmation email call has authenticated context or a server-native send path.

### Phase C - fix annual leave calendar side-effects

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Confirm column and parameter length | [server/routes/attendance.js](../../server/routes/attendance.js) | Check `OutlookEntryId` column length and the `sql.NVarChar(100)` parameter. Outlook IDs may exceed 100 chars. |
| C2 | Increase storage/parameter length | [server/routes/attendance.js](../../server/routes/attendance.js), DB migration | Align SQL column and parameter length with real Outlook IDs. |
| C3 | Smoke one safe booking side-effect path | [server/routes/attendance.js](../../server/routes/attendance.js) | Verify calendar entry ID persists without TDS metadata errors. |

### Phase D - add Clio throttling hygiene and drill-down unknowns

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Clio 429 backoff/cache behaviour | [server/routes/reporting.js](../../server/routes/reporting.js), `server/routes/home-wip.js` | Add or verify retry-after handling, short cache fallback, and telemetry that distinguishes served-stale from hard failure. |
| D2 | Drill down one-off unknowns | System Errors route plus source routes | Unwrap `TypeError: fetch failed`, `CredentialUnavailableError`, `HTTP 401`, and route-specific network failures only after A to C are done. |

---

## 4. Step-by-step execution order

1. **A1** - Run read-only schema checks using the documented database access pattern. Do not mutate SQL yet.
2. **A2** - If drift is confirmed, present exact DDL or existing migration command, then apply only the approved idempotent migration.
3. **A3** - Smoke `/api/system-triage` and the affected form/proposal/audit paths.
4. **B1** - Resolve SP Asana credential behaviour. Ask the user only if a secret or business rule is needed.
5. **B2** - Fix or reject `commercial` practice-area mapping.
6. **B3** - Fix confirmation email auth propagation.
7. **C1-C3** - Fix annual leave `OutlookEntryId` storage length and smoke side-effects.
8. **D1-D2** - Tidy Clio throttling and unknown one-offs.

---

## 5. Verification checklist

**Phase A:**
- [ ] Read-only schema probe confirms current object/column state.
- [ ] Migration is idempotent and has a dry-run/read-only explanation before mutation.
- [ ] `node --check` passes for any touched server script/route.
- [ ] Fresh System Errors smoke no longer shows SQL schema incidents.

**Phase B:**
- [ ] Matter-opening prevalidation no longer fails with `Asana credentials missing` for the tested path, or the block is intentionally labelled.
- [ ] `commercial` no longer produces `Invalid practice area` in `/api/clio-matters`.
- [ ] Confirmation email path no longer returns 401 for missing user context.

**Phase C:**
- [ ] Calendar side-effect stores `OutlookEntryId` without TDS metadata errors.
- [ ] Existing leave record update/delete logic still handles stored IDs.

**Phase D:**
- [ ] Clio 429 incidents are labelled as throttling with retry/fallback state.
- [ ] Unknown one-off incidents either have source routes or are demoted with evidence.

---

## 6. Open decisions (defaults proposed)

1. **SQL mutation permission** - Default: read-only first, then present exact DDL before applying. Rationale: staging DB mutation should be explicit and reversible.
2. **SP Asana behaviour** - Default: if SP should open matters, restore credentials or add a controlled bypass only if Asana is non-essential for that path. Rationale: missing credentials should not silently create half-opened matters.
3. **`commercial` practice area** - Default: map to the intended Clio practice area if one exists; otherwise stop the UI from sending it. Rationale: server-side rejection is currently too late.

---

## 7. Out of scope

- Rebuilding System Errors UI.
- Pulling Tasking-v3 or other shared-workspace apps back into Hub System Errors.
- Handling secrets in chat. Any Asana or Graph secret must be entered through secure local/admin paths.
- Production deploy or production runtime mutation.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx) - compact matter prevalidation and Asana credential warning.
- [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx) - flat matter opening Asana credential handling.

Server:
- [server/routes/bundle.js](../../server/routes/bundle.js) - Asana credential availability logging.
- [server/routes/clioMatters.js](../../server/routes/clioMatters.js) - practice-area validation, Clio matter creation, confirmation email call.
- [server/routes/attendance.js](../../server/routes/attendance.js) - annual leave calendar side-effects and `OutlookEntryId` persistence.
- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) - form submission logging and `client_submission_id` usage.
- [server/routes/form-intent.js](../../server/routes/form-intent.js) - `dbo.form_submission_intents` reads/writes.
- [server/utils/aiProposalLog.js](../../server/utils/aiProposalLog.js) - `dbo.ai_proposals` writes/updates.
- [server/routes/audit.js](../../server/routes/audit.js) - audit queries over form intents and AI proposals.
- [server/routes/reporting.js](../../server/routes/reporting.js) - Clio report request and 429 evidence.
- `server/routes/home-wip.js` - Clio WIP fetch and stale-cache fallback evidence.
- [server/utils/teamLookup.js](../../server/utils/teamLookup.js) - `dbo.team` lookup helper.
- [server/utils/teamData.js](../../server/utils/teamData.js) - `dbo.team` data load helper.

Scripts / docs:
- `scripts/**` - likely home for any idempotent SQL migration added during Phase A.
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-system-errors-repair-queue                          # used in INDEX cross-refs
verified: 2026-05-26
branch: main
touches:
  client:
    - src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx
    - src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx
  server:
    - server/routes/bundle.js
    - server/routes/clioMatters.js
    - server/routes/attendance.js
    - server/utils/formSubmissionLog.js
    - server/routes/form-intent.js
    - server/utils/aiProposalLog.js
    - server/routes/audit.js
    - server/routes/reporting.js
    - server/routes/home-wip.js
    - server/utils/teamLookup.js
    - server/utils/teamData.js
    - logs/changelog.md
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with:
  - app-wide-ux-improvement-proof-programme
  - ccl-legal-document-production-hardening
  - clio-token-refresh-architecture-audit
  - compactmatterwizard-split-by-wizardmode
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-stream-persistence
  - operator-god-mode-system-tab-pressure-release-valve
  - server-mail-send-helper-extraction
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

- The System Errors query is intentionally Hub-scoped by App Insights role. Do not remove the `link-hub-v1` / `helix-hub-server` role filter while debugging missing rows.
- SQL is the first rapid-fire target, but the repo rules require read-only schema inspection before mutation and exact DDL before applying changes.
- `Asana credentials missing` may require a real secret/admin action. Do not ask the user to paste secrets into chat.
- `commercial` may be a business mapping decision, not just a code typo. Check existing Clio practice-area constants before adding a new server-side acceptance.
- The annual leave error is not a generic SQL outage. It points to `@outlookEntryId` length/metadata, so check parameter and column size before changing flow logic.
