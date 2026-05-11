# Hub rollout and training framework — operator-first cheat sheet rewrite

> **Purpose of this document.** Self-contained brief to take the existing `Ctrl+Shift+D` Demo Cheat Sheet from a presenter Q&A crib (sayThis / ifAsked / hidden) into an **operator-first walk-through** that doubles as the seed of the team-facing Hub rollout & training framework. Verified 2026-05-05 against `main`.

---

## 1. Why this exists (user intent)

User said (verbatim, 2026-05-05):

> "youre still using/showing 'if asked' etc. pressure test all of the side pane contents for this tone. the notes should be clearly what we are going to talk about/demo/confirm. not just new stuff, but how to do the key operations. infact as part of the larger framework and training, ive had cass working on this, it might help [...] this is the sort of thing were implementing now [...] its almost like we're implemnting/starting on a sort of internal process street, but initially just as notes for me when teaching and with scope to expand for them so they have these and listed bullets and instructuions for this stuff."

This brief is the **rewrite plan** for the side pane. The actual rewrite is being executed in the same 2026-05-05 session — see `logs/changelog.md` "Demo cheat sheet — operator-first rewrite". If picked up cold later, execute Phase A.

The user is **not** asking for a Process Street UI, a new platform, or any change to the keyboard shortcut / access model.

---

## 2. Current state — verified findings

### 2.1 Cheat sheet data model

- File: [src/components/demoCheatSheet.data.ts](../../src/components/demoCheatSheet.data.ts)
- Pre-rewrite `DemoSection` fields: `sayThis`, `showThis`, `gotchas`, `hidden`, `ifAsked`, `crossApp`, `lastReviewed`, `draft`.
- Tone problem: `sayThis` reads like a script, `ifAsked` implies reactive defence, `hidden` mixes dev-only chrome with section content. None of it tells the operator "this is the operation; here are the steps; here's what proves it worked."

### 2.2 Overlay UI

- File: [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx)
- Email + share-access footer (Phase 6) and transparent-backdrop snappiness (Phase 7) shipped 2026-05-05. Email signature unification (Phase 7b) shipped 2026-05-05.
- Allowlist gate: LZ + AC + server-backed `data/demo-cheat-sheet-access.json`. **Do not change.**

### 2.3 Source of truth for Hub features (Cass's mapped doc)

- Pasted into chat 2026-05-05; covers: Home / Prospects / Pitch process / Pitch Builder / Overview after instruction / Matter opening / Matter / Forms / "Approach LZ when…" / "Next steps" feedback loop.
- Also: https://docs.google.com/document/d/15D9uxxqnauymfsHXjD7vTwpJ2yC3q_RjvkUU98aq9-c/edit (Cass, 2026-02-12).

### 2.4 Asana parent context (verified by API fetch 2026-05-05)

- Task `1212671027459241` "Create Hub rollout & training framework" (Cass). Five questions LZ asked Cass to answer in plain language (2026-01-29):
  1. Where new Hub features/changes are announced.
  2. How we label "ready" vs "still settling" vs "not for use".
  3. Where team questions go.
  4. Where "something didn't work" gets reported.
  5. How those questions/issues loop back to fixes.
- Task `1212753092014721` "Test Monitor Debug" (LZ). Staging mirrors prod; deploy script auto-tasks Cass to push edge cases. Alex (2026-01-15) added: also pull in one of JW/LA/SP/RC/JWH/CS/BOD/EV per change. **7-day review window.** Lean over perfect.

### 2.5 Known constraints

- Brand: `borderRadius: 0`, Raleway, accent `#3690CE` only at anchors. Body text in dark panels = `#d1d5db` (NEVER `colours.dark.subText` — that's highlight blue).
- Sections must be glance-aid; full prose belongs in Nuclino/Scribe.
- Overlay paints over any tab — must stay snappy.

---

## 3. Plan

### Phase A — Reshape data + content rewrite (single PR) — **SHIPPED 2026-05-05**

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Replace `DemoSection` type | demoCheatSheet.data.ts | Drop `sayThis`, `ifAsked`, `hidden`, `gotchas`, `showThis`. Add `notes: string[]` (flat presenter-note fragments in LZ's voice), `approachLZWhen?: string[]`, `readiness?: 'ready' \| 'settling' \| 'not-for-use'`, keep `crossApp?`, `lastReviewed`. |
| A2 | Rewrite all sections | same | Spine = Cass's doc + verified walkthroughs. Order: Pre-flight → Home → Prospects → Pitch Builder → Overview after instruction → Matter opening → Matter → Forms → Rollout & feedback framework → Approach LZ when. Each bullet ≤ ~12 words, fragmentary, presenter-voice. |
| A3 | Update overlay renderer | DemoCheatSheetOverlay.tsx | Render `notes` as a single flat `<ul>`, `approachLZWhen` as warning strip, `crossApp` as labelled list, readiness chip beside title and stacked under nav-item label. |
| A4 | Changelog entry | logs/changelog.md | "Demo cheat sheet — operator-first rewrite" |

> **Note on intermediate shape (scrapped).** A first pass introduced `purpose` / `walkThrough[]` / `keyOperations[]` with numbered `steps` + verifiable `confirm` checklist. The user rejected this as too prescriptive ("note form for me, the things i need to cover. not instruct people to fucking log in"). Collapsed to the flat `notes[]` shape above. If a future agent revives the structured shape, it should be a deliberate Phase B decision and be team-facing, not LZ's notes.

**Phase A acceptance (met):**
- No `sayThis` / `ifAsked` / `hidden` / `purpose` / `walkThrough` / `keyOperations` references in either file.
- Every section has `notes` populated.
- Allowlist + keyboard shortcut + share-access footer unchanged.
- `get_errors` clean on both files.

### Phase B — Promote framework to team-facing (later)

Picked up only after Phase A is in operator hands for >7 days.

#### B1. Surface the "Rollout & feedback framework" section to the wider team

Move the framework half (announcements / readiness labels / question routing / issue reporting / feedback loop) out of the LZ-only overlay into a Hub System tab page or Nuclino entry. The overlay keeps the operator walk-through; the team sees the framework in their normal Hub.

#### B2. Wire readiness chips to a manifest

Right now `readiness` is hand-coded per section. Once we have stable feature flags / rollout tiers, drive the chip from a single manifest (e.g. `data/feature-readiness.json`).

#### B3. Backfill from validated processes

When Cass finishes hands-on validation per Asana task `1212668264563175`, the `keyOperations[].steps` should be replaced/extended from his mapped processes.

---

## 4. Step-by-step execution order

1. **A1** — reshape `DemoSection` type.
2. **A2** — rewrite each section against Cass's doc. Keep bullets short (≤ 12 words). Numbered `steps`, verifiable `confirm` ("matter visible in Clio", "ND folder created", "CCL flag in Hub To Do").
3. **A3** — update the overlay. Reuse existing typography + spacing. Add readiness chip (green `#20b26c` / orange `#FF8C00` / grey `#6B6B6B`).
4. **A4** — log to changelog.

---

## 5. Verification checklist

**Phase A:**
- [ ] `Ctrl+Shift+D` opens overlay; Pre-flight visible.
- [ ] Every section renders `purpose` + ≥1 `walkThrough` bullet.
- [ ] Matter opening shows `keyOperations` with `Confirm worked` checklist.
- [ ] No `ifAsked` UI anywhere.
- [ ] Readiness chips visible on every section that sets one.
- [ ] AC sees the same content; revoked initials don't.
- [ ] Email + share-access footer still functional.

**Phase B:** deferred.

---

## 6. Open decisions (defaults proposed)

1. **Drop `gotchas` field** — Default: **YES**, fold into `walkThrough` or `approachLZWhen`.
2. **Keep `draft` field** — Default: **NO**. Every section must be ready or removed.
3. **Readiness chip on Pre-flight** — Default: **omit**.
4. **Cross-app on every section** — Default: **only where genuinely cross-app** (Pitch Builder ↔ instruct-pitch, Prospects ↔ enquiry-processing-v2).

---

## 7. Out of scope

- Process Street UI or any new platform.
- Surfacing the cheat sheet beyond LZ + AC + existing allowlist.
- Changing `Ctrl+Shift+D` shortcut or dismiss behaviour.
- Wiring readiness to feature flags (Phase B).
- Changing email signature, share-access, or snappiness work shipped 2026-05-05.

---

## 8. File index (single source of truth)

Client:
- [src/components/demoCheatSheet.data.ts](../../src/components/demoCheatSheet.data.ts)
- [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx)

Server:
- [server/routes/demoCheatSheet.js](../../server/routes/demoCheatSheet.js) — share-access (NO CHANGE)

Refs:
- [logs/changelog.md](../../logs/changelog.md)
- Cass's mapped-process doc: https://docs.google.com/document/d/15D9uxxqnauymfsHXjD7vTwpJ2yC3q_RjvkUU98aq9-c/edit
- Asana parent: https://app.asana.com/1/1203336123398249/project/1207129476831699/task/1212671027459241
- Asana testing parallel: https://app.asana.com/1/1203336123398249/project/1207129476831699/task/1212753092014721

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-rollout-and-training-framework-operator-first-cheat-sheet-rewrite
shipped: true
shipped_on: 2026-05-05
verified: 2026-05-05
branch: main
touches:
  client:
    - src/components/demoCheatSheet.data.ts
    - src/components/DemoCheatSheetOverlay.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - session-probing-activity-tab-visibility-and-persistence
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - ux-realtime-navigation-programme
conflicts_with: []
```

---
