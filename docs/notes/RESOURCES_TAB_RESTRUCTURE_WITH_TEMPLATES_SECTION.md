# Resources tab restructure with Templates section

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

During CCL demo prep the user said:

> *"the current Resources tab is a useless link hub. it should host a Templates section where the team can see prompts, templates, AI behaviour, and the feedback loop running over them. resources should mean the things that drive the system, not bookmarks."*

The user is **not** asking for a wholesale rewrite of every link or to delete bookmarks people use. The bookmarks should move into a smaller, well-organised "Quick links" subsection. The headline real estate goes to Templates.

This brief restructures Resources into a working surface for prompt + template visibility, with the Templates section as the consumer of the CCL feedback-loop data (`ccl-prompt-feedback-loop-self-driving-template-improvement`).

**Addendum (2026-04-19, Phase A.5 scope add):** Card Lab (the Team Hub notification template library + preview/send composer) currently lives inside the Activity tab at [src/tabs/roadmap/parts/ActivityCardLabPanel.tsx](../../src/tabs/roadmap/parts/ActivityCardLabPanel.tsx). After shipping the Phase A autopilot notification work (2026-04-19), the user confirmed Card Lab doesn't belong in Activity — it's a *templates surface*, not an operational event feed. It should move into the new Resources → Templates section alongside CCL prompts, communication frameworks, and system behaviour. Activity keeps the operations feed (including `activity.ccl.autopilot` rows that just landed); Resources gains the authoring/preview/send surface for every Team Hub notification template.

**Addendum (2026-04-20, Phase B scope expansion — AI prompt templates):** The CCL v3-voice ship today added [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js) (`HELIX_VOICE_BLOCK` + `HELIX_VOICE_PT_AXIS`) and bumped `CCL_PROMPT_VERSION` in [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) to `ccl-ai-v3-voice`. The user wants these prompts surfaced in the Templates section as first-class read-only entries, not buried in the codebase. That means Templates panel should render four prompt families:

1. **Helix Voice** — `HELIX_VOICE_BLOCK` rendered verbatim with the rules grouped (cadence / specificity / word bans / anti-patterns). Caption: "Single source of voice. Consumed by CCL generation, Safety Net, and (future) communication-framework pressure tests." Show consumer count.
2. **CCL system prompts** — `SYSTEM_PROMPT` and `PRESSURE_TEST_SYSTEM_PROMPT` from `server/routes/ccl-ai.js`, each with its current `CCL_PROMPT_VERSION` tag. Show last-rev date (commit timestamp) and a tiny sparkline of flagged-rate over the last 4 weeks (depends on `ccl-prompt-version-a-b-dashboard` brief landing telemetry). Note: voice-axis scoring runs server-side but is intentionally NOT surfaced to fee earners — the Templates panel for devs is the only place voiceScore data should ever appear.
3. **Communication frameworks** — the four `FRAMEWORKS` exports from [server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js) (management/tasking/feedback/communication), each as a card showing its system prompt + scoring rubric. "Test a draft" CTA per card opens `/api/ai/pressure-test-comms`.
4. **Few-shot example library** (depends on `ccl-few-shot-example-library` brief) — practice-area-keyed worked examples once the library exists at `server/prompts/cclVoiceExamples/`.

New server route required: `GET /api/prompts/registry` returns `{ helixVoice: { block, version, consumers }, ccl: { systemPrompt, pressureTestSystemPrompt, version }, frameworks: [...], fewShot: [...] }` — admin-gated (`isAdminUser()`). Read-only; editing happens in code with PR review, not from the UI. The registry endpoint is the contract that lets every prompt surface (Templates panel, Card Lab, future telemetry views) read from one place instead of importing prompt modules directly into the client bundle.

This explicitly closes the loop the user asked for today ("add those to templates in the resource rework scope, i want these templates to surface there").

---

## 2. Current state — verified findings

### 2.1 Resources tab is a flat link list

- Folder: [src/tabs/resources/](../../src/tabs/resources/) — current implementation. Renders cards of external URLs (Clio, NetDocuments, Asana, etc.) and a few internal docs.
- No grouping beyond visual cards. No internal-tool surfaces. No live data.

### 2.2 Existing tab nav location

- File: [src/app/App.tsx](../../src/app/App.tsx) — Resources is a tier-1 tab. We keep it there but change what it contains.

### 2.3 No Templates surface anywhere in Hub

- Grep confirms: `Templates` as a Hub section title appears only in matter-opening (referring to letter templates, unrelated). There is no place to view CCL prompts/templates/AI behaviour.

### 2.4 Style guide

- File: [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — UserBubble is the reference implementation. New panels should match (dark surface ladder, neutral body text, accent at anchor points only).

---

## 3. Plan

### Phase A — Restructure into 3 sections (visual, no new data dependencies)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Move existing link cards into a collapsed "Quick links" section | [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) | Default collapsed; user can expand. Don't delete any link. |
| A2 | Add "Templates" section as the new headline | [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx) (NEW) | Empty stub initially: shows "No templates yet — feedback loop wiring pending" placeholder. |
| A3 | Add "System behaviour" section | [src/tabs/resources/sections/SystemBehaviourSection.tsx](../../src/tabs/resources/sections/SystemBehaviourSection.tsx) (NEW) | Surfaces current Hub version, App Insights health, last deploy time, key feature flags (`CCL_AUTO_UPLOAD_ND`, `CCL_AUTO_NOTIFY_FEE_EARNER`). Read-only. |
| A4 | Apply Helix style guide consistently | all three sections | Dark surface ladder, neutral body text, accent at anchor points only. Match UserBubble reference. |
| A5 | **Relocate Card Lab from Activity to Resources → Templates** | [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx), [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx) | Unmount `ActivityCardLabPanel` from Roadmap (Activity). Import + render it inside TemplatesSection as the top panel ("Notification templates"). No server changes — `/api/activity-card-lab/*` routes stay where they are. The existing `NOTIFICATION_TEMPLATE_LIBRARY` spread in [server/activity-card-lab/catalog.js](../../server/activity-card-lab/catalog.js) already exposes the new `ccl-ready` template registered 2026-04-19. |
| A6 | Update Activity feed source types list to reflect Card Lab removal | [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) | Remove the Card Lab section header/affordance from the Activity tab. Keep `activity.cardlab.send` + `activity.card.send` entries still flowing into the operations feed — Card Lab sends from Resources still surface in Activity as events. |

**Phase A acceptance:**
- Resources tab opens with three sections in this order: **Templates** (top), **System behaviour** (mid), **Quick links** (bottom, collapsed).
- Templates section's top panel IS the Card Lab (preview + send + recent sends).
- Activity tab no longer renders Card Lab UI, but Card Lab sends still appear in its Operations feed.
- Visual feel matches UserBubble (no off-brand colours, no Tailwind defaults).
- Existing links still accessible.

### Phase B — Wire Templates section to real data (depends on feedback-loop brief)

#### B0. AI prompt registry surface (NEW — added 2026-04-20)

New panels at the top of Templates, sourced from `GET /api/prompts/registry`:

- **Helix Voice** card → renders `HELIX_VOICE_BLOCK` verbatim (collapsible by section), shows the list of consumers (CCL generator, CCL pressure test, future comms pressure test).
- **CCL system prompts** card → two collapsible blocks (`SYSTEM_PROMPT`, `PRESSURE_TEST_SYSTEM_PROMPT`), each tagged with `CCL_PROMPT_VERSION` and last-rev commit date. Per-field flagged-rate sparkline ribbon at the bottom (depends on `ccl-prompt-version-a-b-dashboard`).
- **Communication frameworks** grid → 4 cards (management/tasking/feedback/communication) reading from `server/prompts/communication-frameworks.js`. Each card has "Test a draft" CTA → opens existing `/api/ai/pressure-test-comms` flow.
- **Few-shot examples** card (depends on `ccl-few-shot-example-library`) → practice-area-keyed worked examples.

Server addition: new route `server/routes/prompts.js` exporting `GET /api/prompts/registry` (admin-gated). Reads from `server/prompts/*` modules at request time so deploys auto-refresh the surface — no caching layer needed at this scale.

#### B1. CCL templates panel (existing scope, depends on feedback loop)

When the feedback-loop brief Phase A ships (`CclFieldEdits` table), this panel reads:
- Current `CCL_PROMPT_VERSION` and `CCL_TEMPLATE_VERSION`
- Per-field heatmap (red = often rewritten, green = often accepted)
- Last 4 weekly digests (sparkline of edit-free send rate)
- "View prompt" button → opens read-only modal with current prompt text from [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js)

#### B2. Pressure-test panel

Shows aggregate Safety Net stats over last 30 days: average score per field, top-flagged fields. Read-only.

#### B3. Communication frameworks panel

Reuses the framework taxonomy from [.github/copilot-instructions.md](../../.github/copilot-instructions.md) (Management/Tasking/Feedback/Projects/Communication/Legal). Each framework gets a card with description + "Test a draft" CTA → opens the existing `/api/ai/pressure-test-comms` flow.

### Phase C — System behaviour panel polish

- Live App Insights health pull (last 24h success rate per major route)
- Feature flag toggles (admin-only, gated by `isAdminUser()`)
- Deploy provenance (build SHA, deploy time, environment)

---

## 4. Step-by-step execution order

1. **A1+A2+A3+A4** — Visual restructure, all in one PR. Ship even if Templates section is empty.
2. *(after `ccl-prompt-feedback-loop-self-driving-template-improvement` Phase A)* **B1** — wire CCL templates panel.
3. **B2** — pressure-test panel.
4. **B3** — communication frameworks panel.
5. **C** — System behaviour polish.

---

## 5. Verification checklist

**Phase A:**
- [ ] Resources tab renders three sections in correct order.
- [ ] Quick links collapsed by default; expand reveals all original links.
- [ ] Style audit passes (no off-brand colours, matches UserBubble).

**Phase B:**
- [ ] Templates panel shows current prompt/template version.
- [ ] Per-field heatmap renders with real data.
- [ ] Communication framework cards open the pressure-test flow.

**Phase C:**
- [ ] System behaviour panel shows live Hub health.
- [ ] Feature flag toggles work (admin-only).

---

## 6. Open decisions (defaults proposed)

1. **Section order** — Default: **Templates → System behaviour → Quick links**. Rationale: emphasises working surfaces over bookmarks.
2. **Quick links default state** — Default: **collapsed**. Rationale: deprioritise the legacy link hub without removing it.
3. **Admin-only sections** — Default: **System behaviour panel toggles + feature flags are admin-only via `isAdminUser()`**. Read-only views visible to all.
4. **Mobile layout** — Default: **stack sections vertically, no horizontal scroll**. Match existing tab patterns.

---

## 7. Out of scope

- Replacing the Resources tab with something else (it stays).
- Editing prompts directly from the UI (that's the prompt-feedback-loop brief, Phase C).
- Removing any existing quick link.
- Adding a search box to Resources (defer until link count grows).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) — top-level tab (Phase A1)
- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx) (NEW) — Phase A2/B1; hosts Card Lab panel per A5
- [src/tabs/resources/sections/SystemBehaviourSection.tsx](../../src/tabs/resources/sections/SystemBehaviourSection.tsx) (NEW) — Phase A3/C
- [src/tabs/resources/sections/QuickLinksSection.tsx](../../src/tabs/resources/sections/QuickLinksSection.tsx) (NEW) — Phase A1
- [src/tabs/roadmap/parts/ActivityCardLabPanel.tsx](../../src/tabs/roadmap/parts/ActivityCardLabPanel.tsx) — existing component; re-imported by TemplatesSection in A5 (move to `src/tabs/resources/sections/CardLabPanel.tsx` as follow-up cleanup)
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) — unmount Card Lab here (Phase A5/A6)

Server (no changes required by A5; B0 adds one new route):
- [server/routes/activity-card-lab.js](../../server/routes/activity-card-lab.js) — routes stay as-is
- [server/activity-card-lab/catalog.js](../../server/activity-card-lab/catalog.js) — catalog stays as-is (already auto-spreads `NOTIFICATION_TEMPLATE_LIBRARY` including the 2026-04-19 `ccl-ready` entry)
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js) — template library source
- [server/prompts/cclSystemPrompt.js](../../server/prompts/cclSystemPrompt.js) — read source for template panel
- [server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js) — read source for frameworks panel
- [server/prompts/helixVoice.js](../../server/prompts/helixVoice.js) — read source for Helix Voice card (Phase B0; added 2026-04-20)
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — exports `CCL_PROMPT_VERSION`; B0 surface reads `SYSTEM_PROMPT` + `PRESSURE_TEST_SYSTEM_PROMPT` via the new registry route
- `server/routes/prompts.js` (NEW — Phase B0) — `GET /api/prompts/registry`, admin-gated

Scripts / docs:
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — reference
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: resources-tab-restructure-with-templates-section
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/resources/Resources.tsx
    - src/tabs/resources/
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/ActivityCardLabPanel.tsx
  server:
    - server/prompts/
  submodules: []
depends_on: []
coordinates_with:
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-backend-chain-silent-autopilot-service
conflicts_with: []
```

---

## 9. Gotchas appendix

- The Resources tab is currently the only place users find the bookmark to Clio/ND/Asana. Don't bury it so deep that links are unfindable — collapsed first-section is fine, three-clicks-deep is not.
- The communication frameworks JSON is in [.github/copilot-instructions.md](../../.github/copilot-instructions.md) section text + [server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js). Single source of truth must be the JS file; instructions doc is documentation.
- `isAdminUser()` ≠ `isDevOwner()` — system behaviour toggles are feature gating (admin) not data scope (dev owner). Don't conflate.
- The existing Resources cards use a heterogenous mix of inline styles. Don't try to refactor them all in Phase A; just wrap them in the new collapsed section.
- **Card Lab relocation (A5):** `ActivityCardLabPanel.tsx` currently lives under `src/tabs/roadmap/parts/` because Activity adopted it first. Simplest first cut is to *re-import* it from Resources' TemplatesSection and unmount it from Roadmap.tsx — no file move, no server change. Follow-up cleanup (rename folder to `src/tabs/resources/sections/CardLabPanel.tsx`) can land later once dust has settled.
- **Don't break the Activity operations feed:** Card Lab sends (both manual `activity.cardlab.send` and real notifier `activity.card.send`) must still flow into [server/routes/activity-feed.js](../../server/routes/activity-feed.js) so the Activity feed keeps showing them as events. Only the *composer/preview UI* moves — the send-event source stays wired to the feed.
