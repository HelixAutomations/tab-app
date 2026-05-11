# B1 Operator Actions surface: first-class one-offs in-app

> **Purpose of this document.** This is the execution brief for workstream **B1** of the parent scope brief [HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md](HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md). Goal: replace the LZ-only `tools/*.mjs` one-offs with first-class in-app actions that have parameters, dry-run, RBAC, an audit trail, and downloadable/attachable result artefacts.
>
> **How to use it.** Read once. Implement Phase A. Stop. Confirm with operator. Implement Phase B. Etc. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-03 against branch `main`.

---

## 1. Why this exists (user intent)

Quoted from the parent scope brief and the conversation that produced it:

- *"if users need to trigger one off actions this is going to become problematic. so from the hub inside out, we need to be thoughtful and account for these instances before they happen."*
- *"i want to distance myself even more but this relies on flawless automations."*
- *"auditable and traces to surface where and when we want them and in a form we need it and with option to download or copy or upload to matters and prospects and storage accounts and things, time entries, asana integrations, internal SOPs."*

Today every bespoke trigger is a `tools/*.mjs` script LZ runs locally with Key Vault auth, then pastes results back into Teams. That is the desk-tether. B1 is the workstream that breaks it.

**Not** in this brief: the inbound action queue (B2), feedback funnel (B3), sandbox tier (B4), SOP library (B5), or the wider RBAC matrix (A4 — referenced where relevant but its own workstream).

---

## 2. Current state — verified findings

### 2.1 What exists today as terminal-only one-offs

In [tools/](../../tools/):

- [tools/instant-lookup.mjs](../../tools/instant-lookup.mjs) — passcode / enquiry / deal / instruction / prospect / person / pipeline / ops / ccl lookups. Auto-resolves Key Vault. The most-used tool.
- [tools/run-matter-oneoff.mjs](../../tools/run-matter-oneoff.mjs) — replay a matter open under corrected details (company name, fee earner, practice area override). Dry-run flag exists.
- [tools/tiller-verify.mjs](../../tools/tiller-verify.mjs) — Tiller EID verification probe.
- [tools/validate-instructions.mjs](../../tools/validate-instructions.mjs) — instruction-record sanity check.
- [tools/ops-platform-control.mjs](../../tools/ops-platform-control.mjs) — platform-level ops control surface.

`stash-*`, `dev-*`, `sync-context`, `session-start`, `check-*`, `update-submodules`, `setup-keyvault-secrets` are agent/dev tooling and stay as terminal scripts. They are **out of scope** for B1.

### 2.2 What the System/Forge tab already gives us

[src/tabs/roadmap/parts/](../../src/tabs/roadmap/parts/) — the natural home for the new panel:

- [DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) — dev-owner Forge lens. Pattern to copy.
- [RouteChecksPanel.tsx](../../src/tabs/roadmap/parts/RouteChecksPanel.tsx) — prod-parity smoke catalog. Same shape we want for actions: server registry + client lens.
- [FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — where we mount the new lens.
- [Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — registers lenses and gates by tier.
- [Activity.css](../../src/tabs/roadmap/Activity.css) — shared styling tokens for the System tab family.

### 2.3 Server primitives we'll reuse

- [server/utils/userTier.js](../../server/utils/userTier.js) — `isDevOwner(req)`, `isAdminUser(req)`, `getRequestorTier(req)`. Already the pattern. We add an `assertTier(req, requiredTier)` helper here.
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — `trackEvent`, `trackException`, `trackMetric`. Mandatory on every action lifecycle event.
- [server/utils/getSecret.js](../../server/utils/getSecret.js) — Key Vault resolution; the ported actions will use this on the server instead of pulling Key Vault into a local CLI.
- [server/index.js](../../server/index.js) lines 434–446 — pattern for mounting new routers behind `/api/...`.

### 2.4 What's missing

- No action registry. No typed parameter schema. No dry-run convention. No audit table for action runs. No artefact contract (download/copy/attach/post). No client lens that lists, parameterises, and runs actions. No way to expose any of this safely below `dev-owner` tier.

---

## 3. Plan

### Phase A — Foundation + first ported action (read-only, dev-owner only)

Goal: prove the contract end-to-end with the lowest-risk action (`person` lookup), so every later action plugs into the same shape.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Server action registry | [server/operatorActions/registry.js](../../server/operatorActions/registry.js) (NEW) | Exports `registerAction(definition)` and `getAction(id)`. Action definition shape: `{ id, title, description, category, paramsSchema (Zod-like), allowedTiers: ['dev'\|'admin'\|'ops'\|'all'], dryRunSupported: bool, run({ params, dryRun, requestor }) → { ok, summary, artefact? } }`. |
| A2 | First ported action | [server/operatorActions/person-lookup.js](../../server/operatorActions/person-lookup.js) (NEW) | Wraps the `person` branch of [tools/instant-lookup.mjs](../../tools/instant-lookup.mjs). Read-only. `allowedTiers: ['dev']`. Returns `{ summary: string, artefact: { kind: 'json', body, downloadName } }`. |
| A3 | Routes | [server/routes/operator-actions.js](../../server/routes/operator-actions.js) (NEW) | `GET /api/operator-actions` (list visible to caller), `POST /api/operator-actions/:id/run` (run with body `{ params, dryRun }`), `GET /api/operator-actions/runs?actionId=&limit=` (recent runs scoped to caller). Tier-gated via `userTier.js`. App Insights events `OperatorActions.Run.{Started,Completed,Failed,DryRun}`. |
| A4 | Audit table migration | [tools/db/migrate-operator-action-runs.mjs](../../tools/db/migrate-operator-action-runs.mjs) (NEW) | Creates `operator_action_runs` in Instructions DB: `id (uniqueidentifier)`, `action_id`, `requestor_initials`, `requestor_email`, `tier`, `params_json` (redacted at write — no secrets/raw client PII), `dry_run`, `started_at`, `finished_at`, `status` (`ok\|failed\|dry-run`), `summary`, `artefact_blob_url` (nullable), `error`, `telemetry_event_id`. |
| A5 | Wire router | [server/index.js](../../server/index.js) | Mount `app.use('/api/operator-actions', operatorActionsRouter)` next to the dev-console mounts (~L765). |
| A6 | Client lens | [src/tabs/roadmap/parts/OperatorActionsPanel.tsx](../../src/tabs/roadmap/parts/OperatorActionsPanel.tsx) (NEW) | Lists actions from `GET /api/operator-actions`, opens an action drawer with dynamic param form (text/number/select/date), dry-run toggle (when supported), Run button, recent-runs strip beneath each action. Result viewer shows summary + raw JSON with copy + download. Brand-aligned (Activity.css tokens, zero radius, CTA pop on Run only). |
| A7 | Mount lens | [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx), [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) | Add `actions` lens key, dev-owner-only, slot into FocalSurface. |
| A8 | Telemetry contract | [server/operatorActions/telemetry.js](../../server/operatorActions/telemetry.js) (NEW) | Helper that wraps every action `.run()` with App Insights start/complete/fail + duration metric, generates `telemetry_event_id`, and writes the audit row. Single seam. |

**Phase A acceptance:**

- [ ] Dev-owner sees an "Actions" lens in System/Forge.
- [ ] Lens lists exactly one action: "Person lookup".
- [ ] Filling in `query: "Luke Test"` and clicking Run returns a result identical in content to `node tools/instant-lookup.mjs person "Luke Test"`.
- [ ] Result is downloadable as JSON and copyable.
- [ ] A row appears in `operator_action_runs` with redacted params.
- [ ] App Insights shows `OperatorActions.Run.Started` and `.Completed` with `actionId=person-lookup`, `requestor=LZ`, duration metric.
- [ ] Non-dev-owner calling `GET /api/operator-actions` gets a 200 with empty array (not 403). Non-dev-owner calling `POST .../person-lookup/run` gets 403.

### Phase B — Artefact contract (download / copy / attach / post / time-entry)

This is where one-offs become genuinely useful.

#### B1. Artefact kinds

In [server/operatorActions/artefactKinds.js](../../server/operatorActions/artefactKinds.js) (NEW):

```js
// kind: 'text' | 'json' | 'csv' | 'markdown' | 'pdf' | 'word'
// { kind, body | bodyBase64, mimeType, downloadName, attachableTo: ['matter','prospect','asana','time-entry','blob'] }
```

#### B2. Server attach endpoints (reuse, don't reinvent)

- `POST /api/operator-actions/runs/:runId/attach` body `{ target: 'matter'|'prospect'|'asana'|'time-entry'|'blob', targetRef }`. Internally delegates to:
  - matter / prospect attach → existing NetDocuments + Clio path used by attendance-note filing in [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js)
  - Asana → existing helper in [server/utils/asana.js](../../server/utils/asana.js)
  - time-entry → existing Clio time-entry path used by Call Centre filing
  - blob → existing prospect/matter workspace blob writer

Audit: every attach writes a child row to a new `operator_action_attachments` table referencing `run_id`.

#### B3. Client result viewer

Result drawer extended with action buttons matching the artefact's `attachableTo`:

- **Download** (always)
- **Copy to clipboard** (text-shaped only)
- **Attach to matter…** → matter picker (reuse `src/components/matter-lookup/`)
- **Attach to prospect…** → prospect picker (reuse `ProspectLookup.tsx`)
- **Post to Asana…** → project + section picker (reuse Asana mirror data)
- **Log as time entry…** → matter + minutes + narrative
- **Save to workspace blob** (prospect/matter)

Each click → `POST /attach` → toast on success + audit row.

**Phase B acceptance:**

- [ ] Person lookup result can be attached to a matter (lands in NetDocuments) and to a prospect (lands in their workspace blob).
- [ ] Any text/JSON artefact can be posted to Asana as a comment on a chosen task or as a new task in a chosen section.
- [ ] All attachments produce App Insights events `OperatorActions.Attach.{Started,Completed,Failed}` with `target` property.
- [ ] `operator_action_attachments` rows visible via a small "History" tab in the lens.

### Phase C — Port the high-value actions

Each action is its own `server/operatorActions/<id>.js` module, each adds one row to the registry, each follows the same shape. No new infra.

| Action | Source script | Tier | Dry-run | Artefact |
|--------|---------------|------|---------|----------|
| `passcode-lookup` | instant-lookup passcode | dev | n/a | json |
| `enquiry-lookup` | instant-lookup enquiry | dev | n/a | json |
| `deal-lookup` | instant-lookup deal | dev | n/a | json |
| `instruction-lookup` | instant-lookup instruction | dev | n/a | json |
| `pipeline-lookup` | instant-lookup pipeline | dev | n/a | json |
| `dataops-recent` | instant-lookup ops | dev | n/a | json |
| `ccl-lookup` | instant-lookup ccl | dev | n/a | json |
| `tiller-verify` | tiller-verify.mjs | dev | n/a | json |
| `validate-instructions` | validate-instructions.mjs | dev | n/a | markdown report |
| `matter-oneoff-replay` | run-matter-oneoff.mjs | **dev only, dry-run mandatory first** | yes | markdown plan + post-run json |

`matter-oneoff-replay` is the highest-risk port. Its Phase-C subtask explicitly requires:

1. The dry-run path runs first and produces a "what will change" markdown artefact.
2. The non-dry-run path is gated by an explicit confirmation phrase in the params (`confirmation: "REPLAY <ref>"`).
3. The audit row records both the dry-run plan and the actual run.

**Phase C acceptance:**

- [ ] All read-only lookups available in the lens; LZ can replace muscle-memory `node tools/instant-lookup.mjs ...` with the panel for a full week without falling back.
- [ ] `matter-oneoff-replay` dry-run produces a plan identical to the existing CLI dry-run.
- [ ] Non-dry-run replay refuses without the confirmation phrase.

### Phase D — Open up to admin tier (depends on A4 from parent brief)

Hard-blocked by the **A4 RBAC matrix** workstream. Once that lands:

- Re-tier each action explicitly. Read-only lookups become `admin`. Writes stay `dev` until per-action review.
- Add a `Why I can't run this` tooltip on locked actions explaining the tier gap.
- Add per-tier filtering in the lens.

**Phase D acceptance:**

- [ ] An admin user (e.g. KW) can run `person-lookup` and see their own previous runs but not LZ's.
- [ ] Audit table queryable by tier.

---

## 4. Step-by-step execution order

1. **A4** (audit table migration) — ship first, the rest writes to it.
2. **A1, A8** — registry + telemetry/audit seam.
3. **A2** — port person-lookup as the pilot.
4. **A3, A5** — routes + wiring.
5. **A6, A7** — client lens + mount.
6. Pause. Review with operator. Changelog entry.
7. **B1, B2** (parallel with B3) — artefact kinds + attach endpoints.
8. **B3** — result viewer extensions.
9. Pause. Review. Changelog entry.
10. **C** ports, one action per commit; matter-oneoff-replay last.
11. Pause. Review. Changelog entry.
12. **D** — only after A4 RBAC matrix workstream merges.

---

## 5. Verification checklist

**Phase A:**
- [ ] Person lookup parity with CLI on at least 5 known names (Luke Test, plus 4 redacted real prospects).
- [ ] App Insights events: `OperatorActions.Run.{Started,Completed,Failed}` with `actionId`, `requestor`, `tier`, `dryRun`, `durationMs`.
- [ ] SQL spot check: `SELECT TOP 10 * FROM operator_action_runs ORDER BY started_at DESC` shows redacted params.
- [ ] No raw client PII written to the audit row's `params_json` or `summary`.

**Phase B:**
- [ ] Attach to matter writes to NetDocuments matching the existing attendance-note path.
- [ ] Attach to Asana shows up as a comment under the chosen task within ~5s.
- [ ] Each attach has a `OperatorActions.Attach.Completed` event.

**Phase C:**
- [ ] Each ported action has at least one parity test against its CLI counterpart documented in `docs/notes/_archive/` after close.
- [ ] `matter-oneoff-replay` non-dry-run refuses 100% of attempts without the confirmation phrase in test.

**Phase D:**
- [ ] RBAC matrix doc cross-references action tiers.

---

## 6. Open decisions (defaults proposed)

1. **Param schema library** — Default: **inline Zod-like JSON schema** (no new dep), validated by a tiny home-grown validator next to `registry.js`. Adding `zod` is fine if we already have it; check `package.json` first. Rationale: keep dep surface small for an internal tool.
2. **Audit table location** — Default: **Instructions DB** (the `Deals` / `Instructions` neighbourhood is the audit-natural home). Alternative: Core DB. Pick Instructions because most actions touch instructions/clio data first.
3. **Artefact storage for large outputs** — Default: **inline in audit row up to 64KB; spill to existing prospect/matter workspace blob storage above that**. Avoids a new storage container.
4. **Lens placement** — Default: **its own lens key `actions` in System/Forge**, not a tab inside DevConsolePanel. Rationale: Actions will outgrow a sub-panel quickly.
5. **Dev-owner tier mapping for Phase A** — Default: **`isDevOwner(req)` only**. Admin opens up in Phase D, after A4.
6. **Redaction policy for `params_json`** — Default: **strip all email-shaped, phone-shaped, and 11+ digit-string values; keep ref-shaped values (HLX-…) intact**. Documented in `server/operatorActions/redact.js`.

---

## 7. Out of scope

- Inbound action queue (B2 of parent scope).
- Feedback funnel (B3 of parent scope).
- Sandbox tier (B4 of parent scope).
- SOP / training library (B5 of parent scope).
- Replacing the dev/agent tooling (`stash-*`, `sync-context`, `session-start`, etc.).
- Public/external API. This surface is internal-only.
- Auto-discovery of `tools/` scripts. Each action is an explicit, reviewed registry entry.

---

## 8. File index (single source of truth)

Server (NEW unless noted):

- `server/operatorActions/registry.js`
- `server/operatorActions/telemetry.js`
- `server/operatorActions/redact.js`
- `server/operatorActions/artefactKinds.js` *(Phase B)*
- `server/operatorActions/person-lookup.js`
- `server/operatorActions/passcode-lookup.js` *(Phase C)*
- `server/operatorActions/enquiry-lookup.js` *(Phase C)*
- `server/operatorActions/deal-lookup.js` *(Phase C)*
- `server/operatorActions/instruction-lookup.js` *(Phase C)*
- `server/operatorActions/pipeline-lookup.js` *(Phase C)*
- `server/operatorActions/dataops-recent.js` *(Phase C)*
- `server/operatorActions/ccl-lookup.js` *(Phase C)*
- `server/operatorActions/tiller-verify.js` *(Phase C)*
- `server/operatorActions/validate-instructions.js` *(Phase C)*
- `server/operatorActions/matter-oneoff-replay.js` *(Phase C, gated)*
- `server/routes/operator-actions.js`
- [server/index.js](../../server/index.js) — mount router (~L765 area)
- [server/utils/userTier.js](../../server/utils/userTier.js) — possibly add `assertTier(req, tier)` helper

Client (NEW unless noted):

- `src/tabs/roadmap/parts/OperatorActionsPanel.tsx`
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — register `actions` lens
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) — slot lens
- [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) — minor additions if any (prefer reuse)

Scripts / docs:

- `tools/db/migrate-operator-action-runs.mjs` (NEW)
- [docs/notes/HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md](HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md) — parent scope
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: b1-operator-actions-surface-first-class-one-offs-in-app
verified: 2026-05-03
branch: main
touches:
  client:
    - src/tabs/roadmap/parts/OperatorActionsPanel.tsx
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/Activity.css
  server:
    - server/operatorActions/registry.js
    - server/operatorActions/telemetry.js
    - server/operatorActions/redact.js
    - server/operatorActions/artefactKinds.js
    - server/operatorActions/person-lookup.js
    - server/operatorActions/passcode-lookup.js
    - server/operatorActions/enquiry-lookup.js
    - server/operatorActions/deal-lookup.js
    - server/operatorActions/instruction-lookup.js
    - server/operatorActions/pipeline-lookup.js
    - server/operatorActions/dataops-recent.js
    - server/operatorActions/ccl-lookup.js
    - server/operatorActions/tiller-verify.js
    - server/operatorActions/validate-instructions.js
    - server/operatorActions/matter-oneoff-replay.js
    - server/routes/operator-actions.js
    - server/index.js
    - server/utils/userTier.js
    - tools/db/migrate-operator-action-runs.mjs
  submodules: []
depends_on: []
coordinates_with:
  - hub-unified-scope-layers-operator-actions-evals-distance     # parent scope
  # Shared files (additive only — new lens key, new router mount, new helper export):
  - activity-route-live-checks-and-prod-parity-surface           # Roadmap.tsx, FocalSurface.tsx, server/index.js
  - activity-testing-security-and-operational-visibility-control-plane  # same + userTier.js
  - clio-webhook-reconciliation-and-selective-rollout            # server/index.js mount
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward  # server/index.js mount
  - forms-preflight-matrix-in-activity-tab                       # Roadmap.tsx, FocalSurface.tsx, server/index.js
  - helix-software-dev-productivity-control-plane                # Roadmap.tsx, FocalSurface.tsx, Activity.css, server/index.js
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes  # server/index.js mount
  - management-dashboard-trust-gate                              # server/index.js mount
  - realtime-multi-replica-safety                                # server/index.js boot order
  - resources-tab-restructure-with-templates-section             # Roadmap.tsx tab registration
  - session-probing-activity-tab-visibility-and-persistence      # server/index.js mount
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails  # server/index.js boot order
conflicts_with: []
# Phase D explicitly waits on the A4 RBAC matrix workstream (not yet stashed).
# All shared-file overlaps are additive (new mounts, new lens key, new helper export).
# No real conflicts; merging is order-of-merge, not content.
```

---

## 9. Gotchas appendix

- **Don't import from `tools/`.** The ported action modules must re-implement the relevant logic against the server's existing SQL/Key Vault helpers ([server/utils/getSecret.js](../../server/utils/getSecret.js), `mssql` pools). The CLI uses `createRequire` shims and dotenv that don't belong in the running server. Copy the *queries*, not the script.
- **Redaction is not optional.** `params_json` must be redacted at write time, not at read time. Audit reads from this row directly.
- **The `person` lookup is the only safe pilot.** Any port that hits Clio writes (`matter-oneoff-replay`) goes last and must require a confirmation phrase.
- **Don't surface dev/agent tooling.** `stash-*`, `sync-context`, `session-start`, `update-submodules`, `setup-keyvault-secrets`, `dev-*` are not actions. Resist suggestions to "while we're at it" surface them.
- **Lens key naming.** Use `actions`, not `operator-actions`. The System tab lens keys are short (`forge`, `whiteboard`, `asana`, `checks`, etc.) — match that family.
- **App Insights properties are strings.** The helper auto-converts but anything that looks like a nested object in the audit's `params_json` should be JSON-stringified explicitly before passing to `trackEvent` properties.
- **Don't leak Key Vault into the response.** The action runner uses Key Vault server-side for SQL auth; the response payload must never include connection strings, secret names, or password hashes.
- **Keep parity with the CLI deliberately for Phase A.** Phase A acceptance literally compares JSON output against `node tools/instant-lookup.mjs person ...`. Don't "improve" the response shape during the port — improve it in a follow-up commit so the parity test stays meaningful.
