# Activity tab — hybrid reshape (Work Activity / Ops Monitor / Release Notes)

> **Purpose of this document.** Self-contained brief. Any future agent can pick this up cold without prior context.
>
> **Verified:** 2026-04-18 against branch `main`. Re-verify file/line refs if reading >30 days later.
>
> **Origin:** transposed from a prior agent's discovery session into the house-standard template. Original product steer captured verbatim in §6.

---

## 1. Why this exists (user intent)

The Activity tab today is exposed under the `roadmap` key but presented to users as **Activity**. It already has a real implementation (not a stub) that mixes three concerns: a work activity feed, a dev-group-only live ops monitor, and release notes.

The user wants:
1. Keep it as **one top-level Activity tab** (do not split into separate tabs yet).
2. Keep it **dev-owner scoped** for now (do not widen access).
3. Reshape `Roadmap.tsx` into a clearer shell around the three layers, so it stops accumulating orchestration and each layer has its own owner.
4. **Prioritise Work Activity** as the next surface to add value to (its server contract is the most mature).

There is also a forward-looking concern: this surface is the natural home for **insight into stashed project briefs** (see `.github/instructions/STASHED_PROJECTS.md`). The Activity tab should eventually surface the live `docs/notes/INDEX.md` register so the user can see what's parked while looking at recent work. This is **out of scope for the first reshape** but should be designed for.

---

## 2. Current state — verified findings

### 2.1 Tab registration and access

- [src/app/App.tsx](../../src/app/App.tsx) ~L1426 — tab key is `roadmap`, label shown to users is **Activity**.
- [src/app/App.tsx](../../src/app/App.tsx) ~L1690 — tab routing.
- [src/app/admin.ts](../../src/app/admin.ts) ~L96 — access gate. Currently dev-owner only unless in local dev.

### 2.2 Owning composite UI

- [src/tabs/Roadmap/Roadmap.tsx](../../src/tabs/Roadmap/Roadmap.tsx) ~L245 — the main shell. Composes three concerns:
  1. Work Activity feed
  2. Dev-group-only Ops Monitor
  3. Release Notes

This shell is the orchestration target. Reshaping it into thinner sub-shells is the goal.

### 2.3 Backend surfaces

- [server/routes/activity-feed.js](../../server/routes/activity-feed.js) ~L1 — aggregates bot activity, tracked Teams cards, card-lab sends, bot actions, and DM sends into a shared client contract.
- [src/types.ts](../../src/types.ts) ~L1 — shared types for the activity feed.
- [src/hooks/useOpsPulse.ts](../../src/hooks/useOpsPulse.ts) ~L1 — client hook for live ops monitor.
- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) ~L1 — server side of the ops monitor.
- [server/routes/release-notes.js](../../server/routes/release-notes.js) — backed by [logs/changelog.md](../../logs/changelog.md).
- [server/routes/activity-card-lab.js](../../server/routes/activity-card-lab.js) ~L1 — local-dev card-lab tooling. Separate concern; should NOT define the Activity experience.

### 2.4 Existing front-end pieces to reuse

- `ActivityFeedSection.tsx` ~L1 — already encapsulates the work activity feed. Keep using it as the primary unit.
- The ops-pulse hook and the release-notes endpoint are already clean contracts; reshape work shouldn't touch them.

### 2.5 Submodule note

None of these files live in `submodules/**`. Submodule freshness is not a blocker for picking this up.

---

## 3. Plan

### Phase A — Reshape `Roadmap.tsx` into a thin shell

1. Convert [src/tabs/Roadmap/Roadmap.tsx](../../src/tabs/Roadmap/Roadmap.tsx) into a small router-style shell that mounts three child sections (Work Activity, Ops Monitor, Release Notes) in deliberate order.
2. Extract any orchestration logic that doesn't belong to a single section into local hooks (`useActivityShell`, etc.).
3. No new top-level route. Keep tab key `roadmap` and label `Activity`.
4. No widening of access — keep dev-owner gate at [src/app/admin.ts](../../src/app/admin.ts) ~L96.

### Phase B — Prioritise Work Activity (add value here first)

1. Treat `ActivityFeedSection.tsx` as the primary surface.
2. Where extending: validate server payload shape via [server/routes/activity-feed.js](../../server/routes/activity-feed.js) before polishing UI.
3. Consider richer filtering, grouping by source (bot / DM / card / action), and pagination if the feed grows.
4. Telemetry: per Application Insights rules, emit events on filter changes / drill-throughs (`Activity.Feed.Filtered`, `Activity.Feed.Drilldown`).

### Phase C — Ops Monitor stays dev-group-only

1. Inner-surface gate must remain dev-group (not just dev-owner) — distinct from the tab access gate. Reuse the gate from [src/hooks/useOpsPulse.ts](../../src/hooks/useOpsPulse.ts).
2. No UI rework here unless the diagnostics surface gains new contract data; behave as a passive consumer of [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js).

### Phase D — Release Notes secondary, sourced from changelog.md

1. Continue sourcing from [logs/changelog.md](../../logs/changelog.md) via [server/routes/release-notes.js](../../server/routes/release-notes.js).
2. Light visual polish only; do not redesign the changelog rendering ahead of broader product direction.
3. **Do not let this surface define the Activity experience.** The user has already flagged dissatisfaction with current release-notes UI and has scope sitting with another agent for a rework.

### Phase E — Card Lab kept separate

1. Card-lab tooling stays a local-dev utility under [server/routes/activity-card-lab.js](../../server/routes/activity-card-lab.js). Do not surface it inside the Activity tab.

### Phase F (forward-looking, OUT OF SCOPE for this brief, design hooks ready) — Stashed Projects insight

The Activity tab is the natural home for `docs/notes/INDEX.md` visibility. When that becomes a project, it should be added as a fourth section ("Stashed Projects"), reusing the dev-owner gate. Design Phase A's shell to make adding a new section trivial (sectioned grid or vertical stack, not bespoke 3-up layout).

---

## 4. Step-by-step execution order

1. **A1–A4** Reshape `Roadmap.tsx` into thin shell.
2. *(parallel with 3)* **B1–B4** Work Activity prioritisation.
3. *(parallel with 2)* **C1–C2** Ops Monitor — confirm gate, no rework.
4. **D1–D3** Release Notes — light polish only, do not redesign.
5. **E1** Card Lab — confirm separate, do not surface.
6. Changelog entry per phase.

---

## 5. Verification checklist

**Phase A:**
- [ ] Activity tab still loads under the `roadmap` key, labelled "Activity".
- [ ] Access remains restricted to dev-owner (or local-dev users).
- [ ] Each of the three sections renders independently — pulling one does not break the others.

**Phase B:**
- [ ] Work activity feed renders alone (without ops-pulse) without errors.
- [ ] New activity sources, if added, validate their server payload shape before UI render.
- [ ] App Insights events for filter / drilldown visible.

**Phase C:**
- [ ] Ops Monitor inner section is hard-gated to dev-group users (test with a non-dev-group account).

**Phase D:**
- [ ] Release notes still source from `changelog.md` via `release-notes.js`.

---

## 6. Open decisions (defaults proposed)

> **Note:** Two decisions were already taken by the user during the original discovery session, captured verbatim:
> - **Q:** What should the Activity tab primarily become over the next phase?
>   **A:** Hybrid — keep multiple modes in one tab but structure them more deliberately.
> - **Q:** Should this stay dev-owner scoped for now, or are we likely to widen access soon?
>   **A:** Keep dev-owner only.

Remaining decisions:
1. **Section order in the shell.** Default: **Work Activity (top) → Ops Monitor → Release Notes**. Rationale: prioritisation match.
2. **When to introduce the Stashed Projects section.** Default: **defer**. Surface only when the dev-preview/view-as work and the forms-stream-persistence work are both shipped, so the Activity tab isn't reshuffled twice.
3. **Telemetry event naming.** Default: `Activity.<Section>.<Action>` (e.g. `Activity.Feed.Filtered`, `Activity.OpsMonitor.AlertOpened`).

---

## 7. Out of scope

- Splitting Activity into separate top-level tabs.
- Widening access beyond dev-owner.
- Release Notes UI rework (sitting with another agent).
- Surfacing Card Lab inside the Activity tab.
- The Stashed Projects section (Phase F — design hooks ready, but not implementing now).
- 365 auth migration.

---

## 8. File index (single source of truth)

Client:
- [src/app/App.tsx](../../src/app/App.tsx) (~L1426 tab registration, ~L1690 routing)
- [src/app/admin.ts](../../src/app/admin.ts) (~L96 access gate)
- [src/tabs/Roadmap/Roadmap.tsx](../../src/tabs/Roadmap/Roadmap.tsx) (~L245)
- `src/components/ActivityFeedSection.tsx` (~L1)
- [src/hooks/useOpsPulse.ts](../../src/hooks/useOpsPulse.ts) (~L1)
- [src/types.ts](../../src/types.ts) (~L1)

Server:
- [server/routes/activity-feed.js](../../server/routes/activity-feed.js)
- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js)
- [server/routes/release-notes.js](../../server/routes/release-notes.js)
- [server/routes/activity-card-lab.js](../../server/routes/activity-card-lab.js)

Docs:
- [logs/changelog.md](../../logs/changelog.md) — release notes source + entry per phase
- [.github/instructions/STASHED_PROJECTS.md](../../.github/instructions/STASHED_PROJECTS.md) — forward-looking integration target (Phase F)
- [docs/notes/INDEX.md](../../docs/notes/INDEX.md) — register that Phase F would surface

### Stash metadata

```yaml
# Stash metadata
id: activity-tab-hybrid-reshape
shipped: true
shipped_on: 2026-04-18
verified: 2026-04-18
branch: main
touches:
  client:
    - src/app/App.tsx
    - src/app/admin.ts
    - src/tabs/Roadmap/Roadmap.tsx
    - src/components/ActivityFeedSection.tsx
    - src/hooks/useOpsPulse.ts
    - src/types.ts
  server:
    - server/routes/activity-feed.js
    - server/routes/ops-pulse.js
    - server/routes/release-notes.js
    - server/routes/activity-card-lab.js
  submodules: []
depends_on: []
coordinates_with: [dev-preview-and-view-as]   # both touch src/app/admin.ts and src/app/App.tsx
conflicts_with: []
notes:
  - Forward-looking Phase F is the integration point with the stash routine
    (docs/notes/INDEX.md surface). Do not implement here; design shell to
    accept the section trivially when that work lands.
  - The user has separate scope sitting with another agent for a Release
    Notes UI rework. Keep this brief's Phase D light to avoid clashing.
```

## 9. Gotchas appendix

- The tab is keyed `roadmap` in App.tsx but labelled **Activity** to users — do not rename the key when reshaping; downstream code paths key off the literal `'roadmap'`.
- [src/app/admin.ts](../../src/app/admin.ts) ~L96 carries the *tab access* gate. The *Ops Monitor inner gate* lives separately (dev-group, not dev-owner). Don't conflate them — Activity tab access can stay dev-owner while the inner Ops Monitor stays dev-group; if/when access widens, the inner gate must remain.
- `Roadmap.tsx` already accumulates orchestration. Resist pulling more into it during the reshape — push logic *out* into the section components or local hooks. The whole point of the reshape is to stop the file growing.
- `ActivityFeedSection.tsx` and the activity-feed server route are already a clean contract. Don't refactor them unless extending the shape — most "improvements" here will create churn for no value.
- The Release Notes surface has known UX dissatisfaction with another agent already drafting a rework brief. **Do not reshape Release Notes here.** Touch only what's necessary to keep it functional inside the new shell.
- Card Lab is *not* a feature surface — it's local dev tooling. If you find yourself rendering it in the Activity tab, you've drifted out of scope.
- Phase F (Stashed Projects insight) is intentionally deferred. Design the Phase A shell to *accept* a fourth section without rework (sectioned grid or vertical stack), but do not implement the section.
