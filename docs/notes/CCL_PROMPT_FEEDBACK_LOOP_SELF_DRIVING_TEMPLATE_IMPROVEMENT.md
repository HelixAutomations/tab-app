# CCL prompt feedback loop — self-driving template improvement

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During CCL demo prep, the user said:

> *"i want a self-driving feedback loop on the prompt: the AI is fed → instructed → pressure-tested → reviewed → approved → sent → notes captured. those notes should feed back into prompt iteration so the system keeps getting better without me having to manually rewrite prompts."*

The user is **not** asking for an experiment platform or A/B testing harness. They want a closed loop where every fee-earner edit, every Safety Net flag, every "send" event becomes telemetry the prompt iterates against. The prompt should improve weekly without manual intervention.

This brief is the system that turns the existing CCL pipeline (generate → pressure-test → review → upload) into a learning loop.

---

## 2. Current state — verified findings

### 2.1 Prompt + template versioning exists but is read-only

- File: [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) — `CclContent` table stores `PromptVersion`, `TemplateVersion`, `AiTraceId`, `Confidence`, `OverrideMode`, `ReplacedVersion`. Versions are recorded but never analysed.
- File: [server/routes/ccl.js](../../server/routes/ccl.js) — `CCL_PROMPT_VERSION` and `CCL_TEMPLATE_VERSION` constants pinned at file top. Updates are manual (developer changes constant + commits).

### 2.2 Pressure-test results land in DB but feed nothing

- File: [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — `/api/ccl-ai/pressure-test` writes per-field score 0–10 to `CclPressureTest`. Fields scoring ≤7 are flagged for review.
- No aggregation. No "which prompts produce most flagged fields?" query exists.

### 2.3 Fee-earner edits not captured as deltas

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — review rail mutates `cclDraftCache[matterId].fields` and PATCHes via `/api/ccl/:matterId`. The PATCH stores the new snapshot but does not record diff against the AI's original output.
- Result: we cannot answer "which AI-suggested values did the fee earner change?" — the highest-signal training data we have.

### 2.4 Send/finalise event not closed

- File: [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — `markCclUploaded` flips `UploadedToNd`/`UploadedToClio` flags but no "sent to client" event is recorded.
- A finalise event would close the loop: AI proposed v1, fee earner edited to v3, v3 was sent. v1→v3 diff is the gold-standard correction signal.

---

## 3. Plan

### Phase A — Capture the deltas (data-only, no UX change)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New table `CclFieldEdits` in Instructions DB | NEW [scripts/migrate-ccl-field-edits.mjs](../../scripts/migrate-ccl-field-edits.mjs) | Columns: `EditId`, `CclContentId`, `FieldKey`, `AiValue`, `FinalValue`, `ChangedBy`, `ChangedAt`, `EditType` (`accepted`\|`rewritten`\|`cleared`\|`safety-net-override`). |
| A2 | Server hook to compute diff on PATCH | [server/routes/ccl.js](../../server/routes/ccl.js) `router.patch('/:matterId')` | Compare incoming `draftJson` against the latest persisted snapshot's AI fields. For each changed field, insert a `CclFieldEdits` row. |
| A3 | New finalise event | [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) | Add `markCclSent({ cclContentId, sentBy, sentAt, channel })`. Called from a new `/api/ccl-ops/mark-sent` endpoint (and eventually from the Teams card "sent" action). |
| A4 | Telemetry events | App Insights | `CCL.FieldEdit.Recorded`, `CCL.Sent.Recorded`. Properties: matterId, fieldKey, editType, promptVersion, templateVersion. |

**Phase A acceptance:**
- Every fee-earner edit produces one `CclFieldEdits` row + one App Insights event.
- Marking a CCL as sent produces one `CclSent` row + one event.
- No UI change visible to fee earners.

### Phase B — Aggregate into prompt insight reports

#### B1. Weekly digest job

New script `scripts/cclPromptInsightWeekly.mjs` — runs Sunday 02:00 BST. Queries:
- Top 10 most-edited fields (last 7 days) per `PromptVersion`.
- Average pressure-test score per field per `PromptVersion`.
- Override-rerun frequency per matter (signal that fee earner rejected first AI pass entirely).
- Sent-without-edit rate (the "AI got it right first time" KPI).

Writes a markdown digest to `exports/ccl-insights/<YYYY-MM-DD>.md` and posts a Teams card to a new `#ccl-quality` channel.

#### B2. Per-field correction inventory

For every field where >30% of the time the fee earner rewrites the AI value, generate a "correction inventory" — list of (AiValue, FinalValue) pairs. This is the dataset that drives prompt revision.

#### B3. Hub UI surface — Templates section in Resources tab

*Depends on `resources-tab-restructure-with-templates-section`.*

New Templates panel showing:
- Current `PromptVersion` + `TemplateVersion`
- Last 4 weekly digests (sparkline of "edit-free send rate")
- Per-field heatmap (red = often rewritten, green = often accepted as-is)
- "Propose prompt revision" button → opens a modal with the correction inventory and lets a dev draft the next prompt

### Phase C — Self-driving revision proposal

#### C1. AI-generated prompt revision

Second AI pass (temperature 0.1) reads the correction inventory + current prompt, proposes a revised prompt section. Output is a diff, not a replacement — must be human-approved.

#### C2. A/B harness (optional)

When a new prompt version is approved, route 50% of generations through `PromptVersion = vNext` for 2 weeks. Compare edit-free send rate. Promote or revert.

---

## 4. Step-by-step execution order

1. **A1** — Migration script + manual run.
2. **A2** — PATCH hook + tests.
3. **A3** — Finalise endpoint.
4. **A4** — Telemetry verified in App Insights.
5. *(after 1 week of A data)* **B1** — Weekly digest job.
6. **B2** — Per-field inventory query.
7. **B3** — Templates UI panel (depends on Resources restructure).
8. *(when the data warrants it)* **C1** — AI-generated revisions.
9. *(only if needed)* **C2** — A/B harness.

---

## 5. Verification checklist

**Phase A:**
- [ ] Editing 3 fields in the review rail produces 3 `CclFieldEdits` rows.
- [ ] Marking a CCL as sent produces 1 `CclSent` row.
- [ ] App Insights: `CCL.FieldEdit.Recorded` and `CCL.Sent.Recorded` events visible with correct properties.

**Phase B:**
- [ ] Weekly digest markdown file lands in `exports/ccl-insights/`.
- [ ] Teams card posts to `#ccl-quality` with top-10 edited fields.
- [ ] Templates UI panel shows current versions + sparkline.

**Phase C:**
- [ ] AI revision proposal produces a unified diff against current prompt.
- [ ] A/B harness routes correctly per matter (sticky, not random per request).

---

## 6. Open decisions (defaults proposed)

1. **Diff strategy** — Default: **field-level string diff (whole-value replacement counts as one edit)**. Rationale: simpler than token-level; matches how fee earners think about edits.
2. **Sent event source** — Default: **manual "Mark sent" button in review rail + auto-mark when ND upload succeeds AND no edits in last 24h**. Rationale: don't require a manual action for every CCL but capture explicit intent when given.
3. **Digest channel** — Default: **new `#ccl-quality` Teams channel**. Avoid spamming `#general` or fee-earner channels.
4. **Field-key normalisation** — Default: **store the raw field key (`insert_clients_name`) plus a human label**. Both useful for analysis.

---

## 7. Out of scope

- Live in-flight prompt mutation (don't change the prompt mid-generation).
- Per-fee-earner prompt personalisation (no "Alex's prompt" vs "Ryan's prompt").
- Changing the underlying model (model selection stays in `AZURE_OPENAI_DEPLOYMENT`).
- Re-pressure-testing historical CCLs after a prompt change.

---

## 8. File index (single source of truth)

Client:
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — review rail PATCH (Phase A2 hook is server-side)
- [src/tabs/resources/](../../src/tabs/resources/) — Templates panel (Phase B3, depends on Resources restructure)

Server:
- [server/routes/ccl.js](../../server/routes/ccl.js) — PATCH hook (Phase A2)
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — pressure-test source data
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — `markCclSent` (Phase A3)
- [server/utils/cclPersistence.js](../../server/utils/cclPersistence.js) — field reads

Scripts / docs:
- [scripts/migrate-ccl-field-edits.mjs](../../scripts/migrate-ccl-field-edits.mjs) (NEW) — Phase A1
- [scripts/cclPromptInsightWeekly.mjs](../../scripts/cclPromptInsightWeekly.mjs) (NEW) — Phase B1
- [docs/CCL_PROMPT_ENGINEERING.md](../../docs/CCL_PROMPT_ENGINEERING.md) — update with feedback loop section
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-prompt-feedback-loop-self-driving-template-improvement
verified: 2026-04-19
branch: main
touches:
  client:
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/resources/
  server:
    - server/routes/ccl.js
    - server/routes/ccl-ai.js
    - server/routes/ccl-ops.js
    - server/utils/cclPersistence.js
  submodules: []
depends_on:
  - resources-tab-restructure-with-templates-section
coordinates_with:
  - ccl-backend-chain-silent-autopilot-service
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - database-index-and-dual-db-audit
conflicts_with: []
```

---

## 9. Gotchas appendix

- `CclContent.FieldsJson` already contains the AI-generated values (snapshot). Don't re-fetch from `aiResult` — it may have been pruned.
- Pressure-test scores update asynchronously after `/service/run` returns. The diff hook in PATCH must handle the case where the latest snapshot has no PT scores yet.
- Field keys can be any string the prompt invents (not strictly an enum). Add a defensive `LEN(FieldKey) <= 128` check on the migration.
- `OverrideMode = 'replace-ai-fields'` (override-rerun) intentionally discards the previous edits — those edits should still be preserved in `CclFieldEdits` against the OLD `CclContentId`, otherwise we lose the signal.
- The Teams card for the digest needs to render a markdown table — adaptive cards have row limits; cap top-N at 10.
