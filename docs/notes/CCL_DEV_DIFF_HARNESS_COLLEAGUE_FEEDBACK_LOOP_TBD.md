# CCL dev diff harness — colleague feedback loop (TBD)

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-27 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

W2D shipped the dev-only CCL diff harness ([src/tabs/dev/CclDiff.tsx](../../src/tabs/dev/CclDiff.tsx) + `POST /api/ccl-dry-run`). Today every dry-run is **ephemeral and local** — the docx streams to the browser, nothing is persisted, nothing is shareable. If KW spots a bad CCL field there is no way for her to hand the producing run to LZ.

LZ flagged this directly:

> *"how will my colleagues share changes with me? … i will need the feedback loop implemented because otherwise my team will bury me with feedback."*

Without a structured sharing path, every observation becomes a Teams message LZ has to triage manually. With one, observations become artefacts (a shareable run id, optionally with field-level annotations) that batch sensibly into a review queue.

**Approach is TBD by the user.** This brief catalogues the realistic tiers and the boundaries against the existing prompt-feedback work — so when LZ is ready to commit, the design conversation starts with current findings, not from scratch.

What this is **not**: it is not an A/B harness, not the production prompt-iteration loop (see `ccl-prompt-feedback-loop-self-driving-template-improvement`), and not a fee-earner-facing surface. Audience is the dev-group (LZ + AC) plus a small triage circle.

---

## 2. Current state — verified findings

### 2.1 W2D dry-run harness is single-user, no persistence

- File: [server/routes/ccl-dry-run.js](../../server/routes/ccl-dry-run.js) — `POST /api/ccl-dry-run`. Runs `runCclAiFill()` + `generateWordFromJson()` against a temp dir, base64-encodes the docx, deletes the temp file, returns the payload. **Never writes to any DB table.** Telemetry only: `CCL.DryRun.{Started,Completed,Failed}` + `CCL.DryRun.Duration` (`triggeredBy: 'dev-diff'`).
- File: [src/tabs/dev/CclDiff.tsx](../../src/tabs/dev/CclDiff.tsx) — fullscreen overlay opened by `?cclDiff=1`. Two columns, each calls dry-run independently, downloads docx via `Blob` URL, renders a tinted field-by-field diff. No share button, no run history, no "load existing trace" affordance.
- File: [src/app/App.tsx](../../src/app/App.tsx) — gates the overlay behind `canSeePrivateHubControls()` (LZ + AC) and reads `?cclDiff=1` once at mount + on `popstate`. No deep-link handling for run ids.

### 2.2 Production AI traces ARE persisted (but unused for review)

- File: [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) — `saveCclAiTrace({ matterId, trackingId, aiStatus, model, durationMs, temperature, systemPrompt, userPrompt, userPromptLength, aiOutputJson, generatedFieldCount, confidence, dataSourcesJson, contextFieldsJson, contextSnippetsJson, fallbackReason, errorMessage, createdBy })`. Returns `aiTraceId`. Called from [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) at the success, partial, and fallback branches of `runCclAiFill()` (around L1090–L1170).
- The `CclAiTrace` table therefore already contains every production CCL generation's full input + output. **It is currently write-only** — no route reads rows back, and no UI surface lists or reopens them.
- This is the highest-leverage data source for a feedback loop: production runs are real evidence, not synthetic.

### 2.3 Pressure-test results land in DB but feed no UI

- File: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `/api/ccl-ai/pressure-test` writes per-field score 0–10 to `CclPressureTest`. Already used inline in the review rail (orange warning strip).
- No aggregate query, no surface that lists "fields most often flagged in the last 7 days". The existing `ccl-prompt-feedback-loop-self-driving-template-improvement` brief covers the aggregate side (Phase B2 — per-field correction inventory).

### 2.4 Existing brief overlap and boundary

- Brief: [CCL_PROMPT_FEEDBACK_LOOP_SELF_DRIVING_TEMPLATE_IMPROVEMENT.md](CCL_PROMPT_FEEDBACK_LOOP_SELF_DRIVING_TEMPLATE_IMPROVEMENT.md) (`ccl-prompt-feedback-loop-self-driving-template-improvement`) is about **production data capture for prompt iteration**: `CclFieldEdits` table (Phase A), weekly digest job (Phase B1), per-field correction inventory (Phase B2), Templates section in Resources (Phase B3), AI-generated prompt revisions (Phase C).
- This brief is about **shareable dev-side review of individual runs** — a triage UI for LZ + a small circle. The two are complementary, not redundant:
  - The **production loop** answers "which fields drift across the firm?".
  - The **dev triage loop** answers "what was wrong with this specific run, and how do we ship a fix?".
- Concrete coupling points:
  - Tier 3 below (load `CclAiTrace` rows into a diff column) reuses the table that the production loop also reads from. Both are read-only against `CclAiTrace`, so no conflict.
  - Annotations (Tier 2 below) overlap conceptually with `CclFieldEdits` (Phase A2 of the existing brief) — but Phase A2 captures fee-earner edits in the live review rail, while annotations here capture **dev/admin commentary** on a run. Different write contexts, different tables.

### 2.5 No existing "share a CCL run" mechanism anywhere

- `grep_search` for `share|copy.*link|runId|cclShare` across `src/tabs/matters/ccl/**` and `server/routes/ccl*.js` returns zero matches in this domain. There is no precedent to extend.

---

## 3. Plan

The plan is **decision-first**: pick a tier, then implement. Tiers are additive — Tier 2 builds on Tier 1, Tier 3 stands alone but is most useful combined with Tier 1.

### Tier 1 — Persist + share by URL (smallest deposit)

| # | Change | File | Detail |
|---|--------|------|--------|
| 1.1 | New table `CclDryRun` in Instructions DB | NEW `scripts/migrate-ccl-dry-run.mjs` | Columns: `RunId UNIQUEIDENTIFIER PK`, `MatterId NVARCHAR(64)`, `Model NVARCHAR(64)`, `PromptVersion NVARCHAR(64)`, `TemplateVersion NVARCHAR(64)`, `Confidence NVARCHAR(32)`, `AiFieldsJson NVARCHAR(MAX)`, `DocxBase64 NVARCHAR(MAX)` *(or blob ref — see decision §6.1)*, `DurationMs INT`, `UnresolvedPlaceholdersJson NVARCHAR(MAX)`, `FallbackReason NVARCHAR(512) NULL`, `CreatedBy NVARCHAR(64)`, `CreatedAt DATETIME2`. |
| 1.2 | Persist on dry-run completion | [server/routes/ccl-dry-run.js](../../server/routes/ccl-dry-run.js) | After `generateWordFromJson()`, insert one row. Return `runId` in the response. |
| 1.3 | New `GET /api/ccl-dry-run/:runId` | same file | Returns `{ aiFields, docxBase64, model, promptVersion, templateVersion, durationMs, ... }` for an existing run. Telemetry: `CCL.DryRun.Loaded`. |
| 1.4 | Diff page accepts `?cclDiff=1&runA=<id>&runB=<id>` | [src/tabs/dev/CclDiff.tsx](../../src/tabs/dev/CclDiff.tsx) + [src/app/App.tsx](../../src/app/App.tsx) | On mount, if `runA`/`runB` present, hydrate the corresponding column via the GET endpoint. |
| 1.5 | "Copy share link" button per column | [src/tabs/dev/CclDiff.tsx](../../src/tabs/dev/CclDiff.tsx) | After a successful run, surface a button that copies `${origin}/?cclDiff=1&runA=<id>` (or `runB`) to clipboard with a toast confirmation. |
| 1.6 | Retention | server cron | Drop `CclDryRun` rows older than 30 days (configurable via env). Dry-runs are ephemeral by intent. |

**Tier 1 acceptance:**
- KW (or any LZ+AC user) can run a dry-run, click "Copy link", paste in Teams.
- LZ opens the link → sees identical column contents + can run the other column with their own variant.
- One row per dry-run in `CclDryRun`, telemetry events visible in App Insights.
- No fee-earner-facing impact.

### Tier 2 — Annotated feedback on a run

*Depends on Tier 1.*

#### 2.1 New table `CclDryRunFeedback`

`{ FeedbackId UNIQUEIDENTIFIER PK, RunId UNIQUEIDENTIFIER FK, FieldKey NVARCHAR(128) NULL` *(NULL = whole-run comment)*`, Severity NVARCHAR(16)` *(`info`|`flag`|`block`)*`, Comment NVARCHAR(MAX), CreatedBy NVARCHAR(64), CreatedAt DATETIME2, ResolvedBy NVARCHAR(64) NULL, ResolvedAt DATETIME2 NULL }`

#### 2.2 Endpoints

- `POST /api/ccl-dry-run/:runId/feedback` — body `{ fieldKey?, severity, comment }`. Telemetry: `CCL.DryRun.Feedback.Added`.
- `POST /api/ccl-dry-run/:runId/feedback/:feedbackId/resolve` — marks resolved. Telemetry: `CCL.DryRun.Feedback.Resolved`.
- `GET /api/ccl-dry-run/:runId/feedback` — list for a run.

#### 2.3 Diff page UI

- Each row in the field diff table gets a small "💬 / count" affordance that opens an inline annotation popover (severity + comment). Use existing modal/toast tokens — `borderRadius: 0`, brand colours from `colours.ts`.
- Run-level annotation slot at the top of each column.
- Whole-run severity badge if any annotation is `flag` or `block`.

#### 2.4 Triage queue

New small panel inside the existing dev/HubTools surface ("CCL feedback queue"): lists all unresolved feedback rows across the last 30 days, grouped by `RunId`, sorted by severity then recency. Click → opens the diff page with both columns hydrated.

**Tier 2 acceptance:**
- Anyone in the LZ+AC circle can leave field-level or run-level commentary on a shared run.
- LZ can see at a glance every unresolved item across the firm without monitoring Teams.
- Each annotation event lands in App Insights for telemetry-driven KPIs ("avg time-to-resolve", "blocking flags per week").

### Tier 3 — Pull from real CCL traces, not just dev diffs

*Stands alone. Most useful combined with Tier 1.*

#### 3.1 New `GET /api/ccl-ai/trace/:traceId`

- Reads from existing `CclAiTrace` (see §2.2). Returns `{ aiFields: aiOutputJson, model, promptVersion, contextFields, contextSnippets, durationMs, confidence, createdAt, matterId }` shaped to the same envelope as `/api/ccl-dry-run/:runId`.
- Auth: same gate as the diff page (LZ + AC).
- Telemetry: `CCL.AiTrace.Loaded`.

#### 3.2 Diff page accepts `?traceA=<id>` / `?traceB=<id>`

- Hydrate column from a production trace instead of a dry-run.
- Tag the column header so the operator can see which side is "production trace" vs "fresh dry-run".
- Mixed mode allowed: `?traceA=<id>&runB=<id>` is the canonical workflow → "here's what production produced; here's what the new prompt would produce".

#### 3.3 Trace picker

Inside the diff page, a small picker per column: enter a matterId → show the last N traces for that matter (date / promptVersion / confidence) → click to load.

**Tier 3 acceptance:**
- Operator can compare any production CCL run to a fresh dry-run for the same matter.
- No new write paths against production tables — Tier 3 is read-only.

### Tier deferral

If the user ships only Tier 1 + Tier 3, the loop is: KW pastes a complaint in Teams referencing a Clio matter → LZ opens diff page, loads the production trace into A and a fresh dry-run with the new prompt into B → posts the share link back. That alone removes the "I have to recreate it" tax. Tier 2 is the upgrade once usage proves the need.

---

## 4. Step-by-step execution order

1. **Decision (user)** — pick the tier(s) to implement. Default recommendation: Tier 1 + Tier 3 first; defer Tier 2 until usage proves the need.
2. *(if Tier 1)* **1.1** migration → **1.2** persist on completion → **1.3** GET endpoint → **1.4** URL hydration → **1.5** copy-link → **1.6** retention.
3. *(if Tier 3, parallel-safe with Tier 1)* **3.1** trace GET → **3.2** URL params → **3.3** picker.
4. *(if Tier 2, after Tier 1)* **2.1** migration → **2.2** endpoints → **2.3** UI affordances → **2.4** triage queue.
5. Telemetry verified in App Insights for every new event.
6. Coordinate with `ccl-prompt-feedback-loop-self-driving-template-improvement` so the production-data feedback loop can also surface annotations from Tier 2 (read-only join on `CclDryRunFeedback.MatterId`).

---

## 5. Verification checklist

**Tier 1:**
- [ ] Migration creates `CclDryRun` cleanly on a fresh DB.
- [ ] One dry-run produces exactly one `CclDryRun` row with all metadata populated.
- [ ] `GET /api/ccl-dry-run/:runId` returns identical AI field content + downloadable docx.
- [ ] Pasting the share link as a different LZ-tier user (e.g. AC) hydrates the column correctly.
- [ ] App Insights events: `CCL.DryRun.Completed` (existing) and `CCL.DryRun.Loaded` (new) visible with `runId` property.
- [ ] Retention cron drops rows >30 days.

**Tier 2:**
- [ ] Adding 3 annotations across 2 fields produces 3 `CclDryRunFeedback` rows.
- [ ] Resolving one annotation flips `ResolvedBy`/`ResolvedAt`.
- [ ] Triage queue shows unresolved items only, sorted correctly.
- [ ] App Insights: `CCL.DryRun.Feedback.{Added,Resolved}` with severity property.

**Tier 3:**
- [ ] `GET /api/ccl-ai/trace/:traceId` returns a known production trace correctly shaped.
- [ ] `?traceA=<id>&runB=<id>` hydrates A from production and leaves B empty for fresh runs.
- [ ] Trace picker lists the last N traces for a matter.

---

## 6. Open decisions (defaults proposed)

1. **DocxBase64 storage** — Default: **store inline as `NVARCHAR(MAX)`** for the first 100 runs, then revisit. Dry-run docx is typically <100 KB; rows are short-lived (30-day retention). Rationale: simpler than blob storage, reversible later. Alternative: write to Azure Blob Storage and persist a SAS reference.
2. **Run id format** — Default: **`UNIQUEIDENTIFIER` (server-generated)**. Easier to share than incrementing ints. Rationale: avoids enumeration, fine for Teams pasting.
3. **Annotation surface gate (Tier 2)** — Default: **`canSeePrivateHubControls()` (LZ + AC)** for write, **read-only for `isAdminUser()`**. Rationale: writes need accountability; reads are useful for the wider admin tier.
4. **Retention** — Default: **30 days**, configurable via `CCL_DRY_RUN_RETENTION_DAYS` env. Rationale: matches the "ephemeral by intent" stance; long-term signal lives in the production loop.
5. **Triage queue location (Tier 2)** — Default: **inside the diff page** (no new tab) — a collapsible drawer at the top. Rationale: keeps the surface contained; revisit if Tier 2 actually gets used.
6. **Share link domain** — Default: **same origin as the operator** (no canonical "production" link). Rationale: operators bounce between staging and prod; the link should land where they are. Alternative: always `https://link.helix-law.com/?cclDiff=1&...`.

---

## 7. Out of scope

- Any fee-earner-facing surface. This is a dev-group + admin tool only.
- Production prompt iteration (covered by `ccl-prompt-feedback-loop-self-driving-template-improvement`).
- A/B harness for new prompts (Phase C2 of the existing brief).
- Automated prompt revision proposals (Phase C1 of the existing brief).
- Editing the live `cclTemplate.docx` — template authoring stays in `templates/` + the existing brief's Templates panel work.
- Multi-row "diff three or more runs" — two columns is enough for triage.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/dev/CclDiff.tsx](../../src/tabs/dev/CclDiff.tsx) — extend with URL hydration, share-link button, optional annotation drawer, optional trace picker
- [src/app/App.tsx](../../src/app/App.tsx) — extend `?cclDiff=1` parser to also read `runA` / `runB` / `traceA` / `traceB`
- [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts) — add `runCclDryRun` / `loadCclDryRun` / `loadCclAiTrace` client wrappers (keeps `buildCclApiUrl()` consistent)

Server:
- [server/routes/ccl-dry-run.js](../../server/routes/ccl-dry-run.js) — add persistence + GET-by-id + (Tier 2) feedback endpoints
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — add `GET /trace/:traceId` (Tier 3)
- [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) — already has `saveCclAiTrace()`; extend with `saveCclDryRun()` / `loadCclDryRun()` / (Tier 2) `saveCclDryRunFeedback()` / `resolveCclDryRunFeedback()`
- [server/index.js](../../server/index.js) — no new mounts (routes live under existing routers)

Scripts / docs:
- `scripts/migrate-ccl-dry-run.mjs` (NEW, Tier 1) — `CclDryRun` migration
- `scripts/migrate-ccl-dry-run-feedback.mjs` (NEW, Tier 2) — `CclDryRunFeedback` migration
- `scripts/cclDryRunRetention.mjs` (NEW, Tier 1.6) — drop rows >`CCL_DRY_RUN_RETENTION_DAYS`
- [logs/changelog.md](../../logs/changelog.md) — entry per tier shipped

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-dev-diff-harness-colleague-feedback-loop-tbd
verified: 2026-04-27
branch: main
touches:
  client:
    - src/tabs/dev/CclDiff.tsx
    - src/app/App.tsx
    - src/tabs/matters/ccl/cclAiService.ts
  server:
    - server/routes/ccl-dry-run.js
    - server/routes/ccl-ai.js
    - server/utils/cclPersistence.js
  submodules: []
depends_on: []
coordinates_with:
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - ccl-review-action-extraction
  - resources-tab-restructure-with-templates-section
  # App.tsx is a shared mount surface — declare coordination with all briefs that touch it
  - chat-tab-removal-retain-infra
  - demo-mode-hardening-production-presentable-end-to-end
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-single-pickup-surface
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- The W2D dry-run route deliberately **does not** write to `CclContent` / `CclSent` / `CclPressureTest`. Tier 1 introduces a *separate* `CclDryRun` table specifically to preserve that boundary — never persist dry-run output into the production tables, even if it would be convenient.
- `CclAiTrace.AiOutputJson` is the AI's raw output **before** fee-earner edits. Tier 3 column headers must label this clearly so an operator does not confuse "what AI said" with "what was sent".
- `CclAiTrace` rows are written from `runCclAiFill()` even on partial / fallback paths. Tier 3 must surface the `Confidence` value (`full` / `partial` / `fallback`) so the operator does not draw conclusions from a fallback run.
- The diff page currently uses inline styles. Any new affordances should use the same `colours.ts` tokens + `borderRadius: 0` discipline as the rest of the file. Do not introduce Tailwind defaults or off-palette greens.
- `?cclDiff=1` is parsed once at mount + on `popstate`. If you add new params (`runA`, `runB`, etc.), update **both** code paths or fresh links from Teams will hydrate one column but not the other.
- Avoid putting a "Send share link" button that auto-posts to Teams — operators should choose where the link goes. A clipboard-copy with toast is enough.
- The existing prompt-feedback brief's Phase A2 captures `CclFieldEdits` from the production review rail. If Tier 2 ever wants to roll into the same triage queue, the join key is `MatterId`, not `RunId` — `CclFieldEdits` has no concept of dry-run.
