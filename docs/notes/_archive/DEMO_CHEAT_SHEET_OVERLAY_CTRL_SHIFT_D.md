# Demo cheat sheet overlay (Ctrl+Shift+D)

> **Purpose of this document.** Self-contained brief. Any future agent or LZ on a different day can pick this up cold and execute without prior context.
>
> **How to use it.** Read the whole document. Implement Phase A. Phase B is content authoring — only after Phase A ships and the calls/realignment story has settled. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-05 against branch `main`.

---

## 1. Why this exists (user intent)

LZ is starting to train Emma to run Hub demos, and AC's rollout plan is "issue to AC + Emma → session with Jonathan + Emma observing → daily +1–2 users". LZ wants a tactical crib he can pull up *during* a session so he doesn't drift, doesn't oversell, and doesn't forget the bits that are deliberately hidden or mid-rework. Quote: *"i need you to come up with a component in system that will help me as i demo almost a cheat sheet for me to follow with them to make it easier for everyone. hubspecific but we can touch on the other stuff if thats something yo uthink is worth it."*

What the user is **not** asking for:
- A public help / training centre for end users.
- A walkthrough that the audience sees on screen-share — this is for the presenter only.
- Anything API-driven. Static typed content is fine for v1.

Design pivot from the original plan: an **overlay** triggered by `Ctrl+Shift+D`, not a System-tab lens. Reasons in §6.

---

## 2. Current state — verified findings

### 2.1 System tab (Activity / Roadmap)

- Orchestrator: [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx)
- Lens chips already crowded — 9 lenses (`all/forms/matters/sync/checks/trace/errors/forge/briefs/actions`); see L444–L500. Adding a 10th risks hero overflow at 1280–1440px.
- Dev-owner gating uses inline `userInitials === 'LZ'` (L216) plus `canSeeForge = isDevOwner || isAC` (L218).
- Lens type union: [src/tabs/roadmap/parts/ActivityHero.tsx](../../src/tabs/roadmap/parts/ActivityHero.tsx) L7.
- Lens dispatcher: [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx).

**Conflict with stashed work** (precheck 2026-05-05):
- `activity-route-live-checks-and-prod-parity-surface` — touches `ActivityHero/FocalSurface/Roadmap`.
- `activity-testing-security-and-operational-visibility-control-plane` — same trio.
- `forms-preflight-matrix-in-activity-tab` — same trio.
- `b1-operator-actions-surface-first-class-one-offs-in-app` — `FocalSurface/Roadmap`.
- `helix-software-dev-productivity-control-plane` — `FocalSurface/Roadmap`.
- `resources-tab-restructure-with-templates-section` — `Roadmap`.

→ Adding a lens guarantees a merge against at least three queued briefs. **Overlay sidesteps all of them.**

### 2.2 Wayfinding overlay precedent

- `Ctrl+Shift+H` overlay convention is documented in `.github/instructions/wayfinding.instructions.md` and uses `window.__helix__` + `data-helix-region`.
- Pattern: a global keyboard listener mounts an overlay portal at body level, stays out of the React tree of the active tab, dismissable on Esc / click-outside.

### 2.3 Demo Mode coupling

- Demo Mode state: [src/app/App.tsx](../../src/app/App.tsx) ~L242, persisted via `localStorage('demoModeEnabled')`.
- Demo Mode currently injects 2 synthetic enquiries on top of the rehearsal record: `DEMO-ENQ-0002` (lease renewal), `DEMO-ENQ-0003` (employment tribunal). See [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) `ensureDemoEnquiryPresent` (~L3192).
- Rehearsal record (always live, no toggle needed): `HLX-27367-94842` / Helix Demo / £42,500 commercial debt recovery.

### 2.4 Brand reference

- Living implementation: [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx).
- Tokens: [src/app/styles/colours.ts](../../src/app/styles/colours.ts).
- CSS utility classes: [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css).
- Rules: Raleway, `borderRadius: 0` (999 pills / 50% dots only), accent `#3690CE` at section anchors only, neutral greys for body, one CTA pop per view.

### 2.5 Source content

- Realignment brief: [docs/realignmentcall_scope.md](../../docs/realignmentcall_scope.md). LZ has flagged: "I think it's done." A future agent **MUST read this in full** before authoring §3 content. The agent that wrote this brief read only L1–L450 (call transcript prefix); deeper sections may contain the canonical operating model.
- AC's rollout cadence + Asana team-bucket plans from January are **partly superseded** by the 30 Apr discussion. Do not treat January Asana threads as truth.

---

## 3. Plan

### Phase A — overlay shell + minimum viable content (LZ + AC)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create overlay component | `src/components/DemoCheatSheetOverlay.tsx` (NEW) | Portal-based drawer. Dark surface (`var(--surface-section)`). Section list left, detail pane right. Esc / click-outside / `Ctrl+Shift+D` dismiss. Helix Highlight on section title only; neutral greys for body. `borderRadius: 0`. |
| A2 | Create content file | `src/components/demoCheatSheet.data.ts` (NEW) | Typed `DemoSection[]` — see §3.1 schema. v1 sections enumerated in §3.2. Each section carries `lastReviewed: ISO date`. |
| A3 | Mount overlay globally | [src/app/App.tsx](../../src/app/App.tsx) | Single mount near top-level. Gate visibility behind `['LZ','AC'].includes(userInitials)`. Listen for `Ctrl+Shift+D` (also `Cmd+Shift+D` on Mac); ignore if focus is in an input/textarea/contenteditable. |
| A4 | Add `lastReviewed` banner | inside overlay | If any section's `lastReviewed` is >14 days old, show an amber strip at the top: "Some notes are >14 days old — verify before using." |

**Phase A acceptance:**
- LZ presses `Ctrl+Shift+D` on any tab → overlay appears within 100ms.
- Esc or click-outside dismisses; pressing the shortcut again toggles closed.
- Overlay does not steal focus from inputs (i.e. typing in a search field stays typing).
- AC sees the same overlay; no other initials do.
- No TypeScript errors. No new ESLint warnings.
- No Tailwind / Material colours. Brand tokens only.
- Hero of System tab unchanged (no lens added → no merge conflict with the 6 queued briefs that touch System).
- Renders correctly in light + dark + high-contrast themes.

### Phase B — content authoring (post-realignment)

Author the 12 sections enumerated in §3.2. Each must cite the exact route / button / field referenced so an agent revisiting in 6 months can verify drift.

Hard prerequisite for Phase B: read [docs/realignmentcall_scope.md](../../docs/realignmentcall_scope.md) **fully**, plus grep for any newer doc that supersedes it (`docs/UX_REALTIME_PROGRAMME.md`, `docs/HELIX_OPERATIONS_PLATFORM.md`, recent `logs/changelog.md` entries with "realignment" or "calls"). Do not transcribe January Asana team-bucket plans into the cheat sheet — they're partly stale.

### 3.1 Content schema

```ts
type DemoSection = {
  id: string;                // stable kebab-case
  order: number;             // 1..N
  title: string;             // e.g. "Enquiries"
  sayThis: string[];         // 1–3 short lines, presenter-voice
  showThis: string[];        // bullet steps — what to click / where to point
  gotchas?: string[];        // amber-strip warnings (max 2)
  hidden?: string[];         // "deliberately not shown to audience" notes
  ifAsked?: { q: string; a: string }[]; // collapsible objection handling
  crossApp?: string[];       // optional instruct-pitch / enquiry-processing-v2 callouts
  lastReviewed: string;      // ISO date YYYY-MM-DD
};
```

### 3.2 v1 section list (Hub-spec)

1. **Pre-flight** — open `localhost:3000` (or prod), confirm rehearsal record visible, decide whether to flip Demo Mode (warn: synthetic 0002/0003 will appear).
2. **Home** — pipeline live updates from enquiry-processing-v2 events, attendance/leave. Don't dwell on activity feed — calls treatment is mid-realignment.
3. **Enquiries** — anchor on `HLX-27367-94842` (Helix Demo). ID pill = EID modal (NOT detail expansion). Risk colour comes from `RiskAssessmentResult`.
4. **Pitch / Deal** — capture email goes to `lz@helix-law.com`; passcode = rehearsal one.
5. **Instructions** — stage progression. Real fields vs. synthetic.
6. **Matter Opening** — fee earner + supervising selection. Mention `tools/run-matter-oneoff.mjs` exists for replays (don't run it during demo).
7. **CCL** — Generate → auto-Safety-Net → orange strip = flagged for fee earner. Two-pass pipeline.
8. **Reports** — admin tier; LA is admin but not Reports access.
9. **System tab** — what AC + admins see vs. LZ-only (Briefs / Actions / Forge).
10. **Cross-app aside (collapsible)** — instruct-pitch (client portal), enquiry-processing-v2 (intake).
11. **If asked / objections** — "why is X still in dev?", "where do calls go?" (link to realignment scope), "what about Asana?", "is this on prod?".
12. **Recovery line** — what to say if something hangs live (cold boot, server bounced, falls back to cache).

---

## 4. Step-by-step execution order

1. **A2** — write `demoCheatSheet.data.ts` with the schema and stub content for sections 1, 3, 7 (highest-value three). Other 9 sections get a `TODO` placeholder so the overlay still renders.
2. **A1** — write `DemoCheatSheetOverlay.tsx`. Render against the 3-section stub.
3. **A3** — wire global keyboard listener + gate in `App.tsx`.
4. **A4** — add the >14-day banner.
5. Manual verify against §5 acceptance.
6. Changelog: `2026-MM-DD / Demo cheat sheet overlay (Ctrl+Shift+D) / LZ + AC can pull up a presenter crib over any tab. (~ src/app/App.tsx, + src/components/DemoCheatSheetOverlay.tsx, + src/components/demoCheatSheet.data.ts)`
7. **Phase B** — author the remaining 9 sections. Each commit can be one section. Update `lastReviewed` per touch.

---

## 5. Verification checklist

**Phase A:**
- [ ] `Ctrl+Shift+D` toggles overlay on every tab.
- [ ] Shortcut ignored when focus in input/textarea/contenteditable.
- [ ] Esc and click-outside both close.
- [ ] Only LZ + AC ever see it (verify via UserBubble user switcher).
- [ ] Overlay z-index sits above modals / Simple Browser embed.
- [ ] `borderRadius: 0` everywhere except 999 pills / 50% dots.
- [ ] No `@fluentui/react` defaults bleeding through (e.g. blue button hover).
- [ ] Works in dark, light, high-contrast.
- [ ] No console errors / warnings on open + close.
- [ ] Bundle: overlay code-splits or inlines small (<10KB gzipped target).

**Phase B (content):**
- [ ] Every section has at least one `sayThis` and one `showThis`.
- [ ] No reference to deprecated routes (verify with grep against current `src/`).
- [ ] No claim about calls / realignment that contradicts `docs/realignmentcall_scope.md`.
- [ ] No Cass-era team-bucket references unless verified still current as of 30 Apr 2026.

---

## 6. Open decisions (defaults proposed)

1. **Lens vs overlay vs separate route** — Default: **overlay**. Rationale: System tab is already crowded with 9 lenses + 6 queued briefs; LZ wouldn't open System mid-demo while screen-sharing Hub anyway; overlay sits on top of whatever's being shown so it works during a live walkthrough.
2. **Gating tier** — Default: **`['LZ','AC'].includes(initials)` from day one**. Rationale: AC is co-running rollout and will demo solo; LZ-only forever creates a bus-factor of one.
3. **Demo Mode integration** — Default: **don't auto-toggle**, just warn. Rationale: synthetic 0002/0003 enquiries appearing live mid-session looks unprofessional unless the presenter has set expectations.
4. **Prod readiness** — Default: **flag in changelog that this needs the next prod cut to reach Emma**. Last prod deploy was 2026-03-03 (~9 weeks before this brief). Cheat sheet on staging only is useless for live demos.
5. **Position on screen** — Default: **right-side drawer, ~420px wide, full height**. Rationale: leaves the demo content visible in the left ~70% of the viewport.
6. **Persistence of "current section"** — Default: **persist to `localStorage('helix.demoCheatSheet.section')`** so re-opening returns to the last-read section. Cleared on hard reload only.

---

## 7. Out of scope

- API-driven content (Phase B+ if ever).
- Multi-presenter sync (e.g. AC and LZ on the same call seeing the same section).
- Recording / analytics on which sections are used most.
- A non-overlay, audience-visible "guided tour" for end-user onboarding — that's a different brief.
- Translations / i18n.
- Embedding in instruct-pitch or enquiry-processing-v2.

---

## 8. File index (single source of truth)

Client (NEW):
- `src/components/DemoCheatSheetOverlay.tsx` — overlay shell + keyboard listener
- `src/components/demoCheatSheet.data.ts` — typed content array

Client (MODIFIED):
- [src/app/App.tsx](../../src/app/App.tsx) — mount overlay globally, gate on initials

Reference (read before authoring content):
- [docs/realignmentcall_scope.md](../../docs/realignmentcall_scope.md) — calls / realignment ground truth (READ FULLY)
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — brand reference
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — Helix look + feel
- [.github/instructions/wayfinding.instructions.md](../../.github/instructions/wayfinding.instructions.md) — `Ctrl+Shift+H` overlay precedent
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: demo-cheat-sheet-overlay-ctrl-shift-d
shipped: true
shipped_on: 2026-05-05
verified: 2026-05-05
branch: main
touches:
  client:
    - src/components/DemoCheatSheetOverlay.tsx
    - src/components/demoCheatSheet.data.ts
    - src/app/App.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  # All share src/app/App.tsx — mount-point only, single-line addition.
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - chat-tab-removal-retain-infra
  - demo-mode-hardening-production-presentable-end-to-end
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-single-pickup-surface
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
  # Same directory only (src/components/) — no file overlap.
  - session-probing-activity-tab-visibility-and-persistence
  - user-switch-clean-hard-reload-with-persistent-return-overlay
conflicts_with: []
```

---
