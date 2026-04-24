# To Do confidence — reveal-one-at-a-time, demo parity, predictable redirects, completion-state updates

> **Purpose.** The Home To Do surface is becoming the central attention space. The user needs to trust it: demo mode must mirror production faithfully, each card must have consistent read-then-act expansion, every card must redirect cleanly, and completions must visibly update state (including in demo). This brief scopes the gaps that today undermine that confidence.
>
> **How to use.** Read end-to-end. Ship Phase A first (the audit + parity + reveal-one). Phases B/C after. Changelog entry per phase.
>
> **Verified:** 2026-04-22 against branch `main`. Re-verify refs if picked up >30 days later.

---

## 1. Why this exists (user intent)

User verbatim (2026-04-22):

> *"scope the demo mode and the to do space in the scope also. i want to be confident that when im using the to do items in demo mode, i can a. hide them and reveal each so i dont get overwhelmed, and also that they really reflect whats shown/the user sees in prod. otherwise its useless. because for example, im trying to test the ccl workflow, but im having to rely on a real matter. and since we changed the matters box and the enquiry box/pipeline bit with the to do bit, im now not confident in what i see per to do card, do all have a tray with instructions? will users be cleanly redirected in a consistent/predictable way? will home to do cards update states as the user completes these actions? is that visible in demo mode? all of this, to be refined and polished. you might not be the agent to take on this work, but the brief would be helpful scoped, because to do is becoming the central attention space and i need to be confident it works right."*

Four distinct anxieties:

1. **Reveal-one control.** Too many cards at once → overwhelm. User wants to hide the full list and reveal them one at a time (walk-through / reading-stack mode), independent of the existing app-portal compact strip collapse.
2. **Demo parity.** A demo card must be indistinguishable from the production equivalent in every way a reviewer would notice — same expansion, same fields, same primary action, same completion behaviour. Today: demo seeds are toast-only stubs that don't mirror what a real user sees, so CCL workflow can't be practised end-to-end without a real matter.
3. **Consistent tray.** Every card should offer the same "read then act" contract (`TodoExpansion` — description, key/value fields, 1–3 actions). Today only some kinds opt in; bare rows look broken next to expanded peers.
4. **Predictable redirects + state updates.** Click → clean, deterministic hand-off to the right surface. Complete the action → the card dims/ticks/disappears on Home, visibly. This must be observable in demo too, not just in prod.

What is **not** being asked:
- Re-architecting the To Do registry (see `home-todo-single-pickup-surface` — that brief's Phase B is the server-side contract, still open; this brief runs on top of whatever client model is current).
- Adding new card kinds beyond what already ships.
- Generic demo-mode data overhaul (see `demo-mode-hardening-production-presentable-end-to-end` — this brief focuses only on the To Do slice of demo; that brief still owns EID/payment/Clio/ND plumbing).
- Moving controls between UserBubble and CommandDeck (see `userbubble-and-private-hub-tools-control-consolidation-and-sort`).

---

## 2. Current state — verified findings

### 2.1 Card model + expansion is optional per-kind

File: [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) L22–60.

`TodoExpansion` is well-specified: `kind` ('enquiry' | 'matter' | 'generic'), `primary`, `secondary`, `aow`, `description`, `fields[]` (0–4 labelled key/value), `actions[]` (1–3 buttons). The component that renders it exists: `src/components/modern/todo/TodoItemExpandedPane.tsx` (changelog 2026-04-20 "Home ToDo panel — bypass compact strip + panel card redesign" through "TodoItemExpandedPane").

**But `expansion` is OPTIONAL on `HomeImmediateAction`.** From [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) `immediateActionsList` L6594: AL actions, Confirm Attendance, and some instruction actions render as flat rows with no chevron — while enquiry/matter/generic ones expand. The chevron is only an expand toggle when `action.expansion` is populated ([ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) changelog 2026-04-20).

**Net effect:** A user clicking around doesn't know whether any given card will expand. Some open a tray; some just fire `onClick` and navigate. This is the inconsistency the user is calling out.

### 2.2 Reveal-one / hide-all is not implemented

File: [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) L63, L77–80, L207–212.

- `const [expanded, setExpanded] = useState(false)` — this is the *compact-strip → full-grid* toggle (portal mode, not seamless). Not what the user wants.
- In seamless mode (the new Home right-column ToDo card), the entire list renders. All 18+ items visible simultaneously. No "minimise" / "walk-through" affordance.
- No per-card explicit collapse — each row only has the expansion tray, which is a different dimension.

### 2.3 Demo seeds are toast-only, don't navigate

File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L6740–L6819 (inside `immediateActionsList` useMemo, under `if (demoModeEnabled)`).

Three showcase cards are unconditionally pushed when `demoModeEnabled`:

1. **Allocate Documents** (Demo Enquiry · Jane Holloway, enquiry-kind, aow=Commercial) — L6748.
2. **Verify ID** (Demo Matter · Patel Construction Ltd, matter-kind) — L6774.
3. **Review CCL** (Demo Draft, generic-kind) — L6803.

Every `onClick` in these seeds is `() => demoToast('open ...')` — fires `showToast`, does NOT navigate, does NOT mark the card complete, does NOT re-run through the same click handler the production equivalent uses. **This is the core of the user's frustration:** the seeds *look* real (subtitle, fields, actions, AoW dot) but the click does nothing meaningful. You can't rehearse the CCL workflow on Review CCL because clicking it just toasts.

### 2.4 Demo seeds don't hit the same `handleActionClick` the real cards use

Real cards dispatch `openHomeCclReview` / `openEnquiryWorkspace` / `openMatterOpeningWorkflow` — reused by [OperationsDashboard.tsx L4232](../../src/components/modern/OperationsDashboard.tsx#L4232) and [App.tsx L827](../../src/app/App.tsx#L827) listeners.

Demo seeds do none of that. So even if clicking *would* navigate, it wouldn't exercise the actual pipeline. CCL review can't be demo-tested without a real `matterRef`.

### 2.5 Completion state is partial — no client-side dim/tick for demo

Existing behaviour (from changelog 2026-04-20 "Home ImmediateActionsBar — empty + stable" and `home-todo-single-pickup-surface` §B2 "Completes when"):

- **Production:** Card disappears from the list when its *source condition* no longer holds (e.g. CCL draft is approved → `unapprovedCclDrafts.length` drops → card is not re-emitted by `immediateActionsList` on next render). Very indirect — relies on the next data-refresh cycle.
- **Demo:** None of the three seeds has a completion path at all. They're unconditionally pushed every render. Clicking never removes them. Even if you completed the underlying action manually, the card stays.
- **No dim-and-tick affordance** (brief §A6 in `home-todo-single-pickup-surface` flagged this as deferred — never shipped). No "Show completed" toggle either.

So the user's question "will home to do cards update states as the user completes these actions? is that visible in demo mode?" — today, **no to both** for the demo showcase items, and **only via an invisible refetch** for real items.

### 2.6 The Home layout change (the trigger for the concern)

Recent changelog entries (2026-04-20 / 2026-04-21) confirm: the `replacePipelineAndMatters` toggle in [OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) puts `ImmediateActionsBar` (seamless mode) in the right column of Home where the matters / pipeline previously sat. This moves To Do into the user's highest-attention zone — which is exactly why the "am I seeing what prod users see?" / "do all cards expand?" / "does click → redirect → complete round-trip?" questions now matter more than before.

### 2.7 Relationship to existing briefs

| Brief | Overlap with this one | Resolution |
|-------|----------------------|------------|
| `home-todo-single-pickup-surface` | Strategic parent. Defined the kinds, registry direction, "dim + tick" affordance (§A6), Phase B server registry. §A6 + §A7 deferred — this brief picks them up for demo-parity purposes. | coordinates_with. Respect its card contract. Don't re-do its Phase B here; that's still that brief's job. |
| `demo-mode-hardening-production-presentable-end-to-end` | Covers EID/payment backfill, Clio sandbox, ND folder, reset mechanism. Not scoped to To Do. | coordinates_with. This brief adds a **Demo To Do parity layer** on top — the per-card demo fidelity — without re-scoping seed-script/Clio/ND work. |
| `ccl-review-pickup-via-todo-and-addressee-fix` | Says CCL pickup should flow through To Do. Depends on `home-todo-single-pickup-surface`. Has `conflicts_with: ccl-backend-chain-silent-autopilot-service`. | coordinates_with. This brief uses CCL as the primary demo/parity case study (the user explicitly called it out), but doesn't change CCL server pipeline. |
| `ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity` | CCL review surface polish. | coordinates_with. When demo Review CCL card is wired to real navigation, it lands in this rail — so the rail must be ready. |
| `home-animation-order-and-demo-insert-fidelity` | Covers demo-insert animations into Home sections. | coordinates_with. This brief's "completion dim + tick" animation must not fight the existing demo-insert choreography. |
| `ccl-backend-chain-silent-autopilot-service` | Creates the invisible autopilot path that *bypasses* the manual pickup. | soft conflict via `ccl-review-pickup-via-todo-and-addressee-fix`. Not a direct file conflict for this brief. |

No hard file conflicts with any open brief.

---

## 3. Plan

### Phase A — audit + parity + reveal-one (ship first, client-only)

Pure client work. No server or schema changes. The acceptance bar is the user's four anxieties, one by one.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | **Card audit table** | NEW `docs/notes/TODO_CARD_AUDIT.md` | One row per `HomeImmediateAction` that can appear in `immediateActionsList`. Columns: `title` · `kind` · `has expansion?` · `primary onClick target (surface)` · `completion signal` · `demo equivalent? (y/n, file:line)` · `demo navigates? (y/n)` · `demo completion visible? (y/n)`. Populated by code-reading [Home.tsx](../../src/tabs/home/Home.tsx) `immediateActionsList` (L6594). This is the single source of truth for "which cards have trays" and "which have demo parity." Not a runtime artefact — a design document that backs the fixes in A2/A3. |
| A2 | **Require `expansion` on every card** | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx), [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) | Promote `expansion` from optional to strongly-encouraged: add a dev-only console warning in `ImmediateActionsBar.tsx` when a card lacks `expansion` (`if (!action.expansion && process.env.NODE_ENV !== 'production') console.warn('[todo] missing expansion for', action.title)`). Then populate expansions for every currently-bare card: AL actions (approver/approval context), Confirm Attendance (today's boardroom/soundproof bookings + "Confirm all / Mark me in"), any instruction action not already expanded. Cards genuinely without meaningful detail (e.g. a single-click toggle) get a `generic` expansion with `description` + 1 action. |
| A3 | **Demo seeds become mirrors of real cards** | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L6740 onwards, NEW [src/utils/demoTodoFixtures.ts](../../src/utils/demoTodoFixtures.ts) | Move the 3 showcase seeds into a centralised fixture module. Each demo card's `onClick` routes through the same `handleActionClick`/dispatch path as the prod equivalent, but keyed off a `DEMO-*` ref so downstream consumers (CCL rail, Enquiries workspace, Instruction workflow) can render a demo-only surface without writing to Clio/Core-Data. Concretely: Review CCL demo dispatches `openHomeCclReview` with `matterRef: 'DEMO-3311402'`; Allocate Documents demo dispatches `openEnquiryWorkspace` with `enquiryId: 'DEMO-ENQ-5521'`; Verify ID demo dispatches `openInstructionWorkflow` with `instructionRef: 'HLX-DEMO-00001'`. Downstream surfaces must treat demo refs as no-op writes (coordinated via `demo-mode-hardening` Phase C). Each demo card is emitted once and is removed from the list when its local demo-completion flag flips (A5). |
| A4 | **Reveal-one mode** | [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx), [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) | Add a "reveal-one" control in the ToDo card header (next to the inline count pill). Three modes persisted to `localStorage['helix.todo.revealMode']`: `all` (default, current behaviour), `one` (show only the top row; a "Next ↓" micro-button + `J`/`↓` key reveal the next one; previously-revealed rows scroll above and remain interactive), `collapsed` (show count + "Reveal first →" CTA only). Transition between modes animates via `iabChipIn`. `one` mode respects completion: revealing the next card auto-hides completed ones. |
| A5 | **Completion dim + tick — visible in demo** | [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx), [src/components/modern/todo/TodoItemExpandedPane.tsx](../../src/components/modern/todo/TodoItemExpandedPane.tsx) | Client-local `completedThisSession: Set<actionId>` state in the bar (or via a new `TodoCompletionContext`). When a card's primary action fires AND the downstream surface confirms via `helix:todo-completed` custom event `{ actionId, matterRef?, via }`, the row dims to 55% opacity, shows a stroke-dash tick animation (reuse `iabEmptyTickIn`), stays for 4s, then collapses out with a height transition. Works identically in demo — the demo downstream surfaces (per A3) dispatch the same event on their completion path. A "Show completed" footer toggle reveals the last 10 completions for the current session (not persisted server-side in this brief; that's `home-todo-single-pickup-surface` Phase B). |
| A6 | **Redirect predictability — dispatcher catalogue** | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx), NEW `src/utils/todoDispatch.ts` | Centralise the 6 distinct redirect events (`openHomeCclReview`, `openEnquiryWorkspace`, `openInstructionWorkflow`, `openAnnualLeaveApproval`, `openAttendanceConfirm`, `openMatterOpeningWorkflow`) behind a single `dispatchTodoNavigation(target, payload)` helper. Every card's `onClick` (production AND demo) goes through it. The helper logs `[todo-nav]` in dev and fires `Todo.Redirect` telemetry in prod. This removes the current inconsistency where some cards call handlers directly, some dispatch events, and some toast. |

**Phase A acceptance:**
- Audit table exists and is current — every card has a populated row.
- Every card has a populated `expansion` (console shows zero `[todo] missing expansion` warnings on a full Home render).
- In demo mode: clicking the 3 demo cards routes through the real dispatch path; CCL review rail opens against `DEMO-3311402`; Enquiries workspace opens against `DEMO-ENQ-5521`; Instruction workflow opens against `HLX-DEMO-00001`. None of these write to Clio or Core Data.
- Reveal-one mode works via the header control and `J`/`↓` key. Preference persists across reloads.
- Completing a demo card dims + ticks + collapses out within 5s, identically to production.
- `get_errors` clean on all touched files.
- Changelog entry.

### Phase B — server-side completion signal (coordinates with `home-todo-single-pickup-surface` Phase B)

Pure server + wiring. Can ship only after that brief's §B3 `POST /api/todo/reconcile` route lands.

#### B1. `helix:todo-completed` event-bus → server reconcile

When any surface completes an action that originated from a To Do card, it fires `window.dispatchEvent(new CustomEvent('helix:todo-completed', { detail: { sourceId, via } }))`. A shell listener in [src/index.tsx](../../src/index.tsx) forwards the event to `POST /api/todo/reconcile` (idempotent). Server marks the card complete, broadcasts to other replicas via existing realtime channels.

#### B2. Demo refs skip the reconcile POST

If `sourceId` starts with `DEMO-` OR `detail.demo === true`, skip the POST entirely — the card completes client-side only. This keeps demo flows isolated from the ops-platform DB.

#### B3. Server emits on SSE

Consumers of `/api/todo?owner=XX` SSE (the To Do stream once B3 ships in `home-todo-single-pickup-surface`) get the completion event pushed — Home updates for other browser tabs/windows of the same user.

### Phase C — tray visual polish + empty-state wizard

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Shared `description` templating | [src/components/modern/todo/TodoItemExpandedPane.tsx](../../src/components/modern/todo/TodoItemExpandedPane.tsx) | Small helper to format `description` with highlighted tokens (matter ref, client name). Keeps prose consistent. |
| C2 | Empty-state wizard in demo | [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) | When `demoModeEnabled && actions.length === 0`, show a "Re-seed demo cards" button (calls [src/utils/demoTodoFixtures.ts](../../src/utils/demoTodoFixtures.ts) `reseedDemoTodo()`) so the reviewer can run the walk-through more than once per session. |
| C3 | Screenshot diff test | NEW `src/tabs/home/__tests__/todoParity.visual.test.tsx` | Render one production card + one demo-mirror card side-by-side. Snapshot. Fails if the two drift on chrome/copy/layout so future drift is caught at PR time. |

---

## 4. Step-by-step execution order

1. **A1** — write the audit. This exposes every bare card and every demo gap. The table itself becomes the PR-review checklist for A2/A3.
2. **A2** — populate `expansion` on every currently-bare card (the audit tells you which).
3. **A6** — land `todoDispatch.ts`; refactor every `onClick` to go through it. Purely structural; no behaviour change yet.
4. **A3** — rewrite the 3 demo seeds on top of `todoDispatch`; wire downstream surfaces to recognise `DEMO-*` refs as read-only.
5. **A4** — reveal-one mode. Independent; can slot in any time after A1.
6. **A5** — completion dim + tick via `helix:todo-completed`. Works client-side without server changes.
7. *ship Phase A, changelog entry.*
8. Once `home-todo-single-pickup-surface` §B3 (`/api/todo/reconcile`) ships, do **B1** + **B2** + **B3**.
9. *ship Phase B.*
10. **C1** → **C2** → **C3** as polish.

---

## 5. Verification checklist

**Phase A:**
- [ ] `docs/notes/TODO_CARD_AUDIT.md` exists with one row per card kind currently emitted on Home.
- [ ] Zero `[todo] missing expansion` console warnings on full-render Home for LZ (firm-wide) and a non-dev-owner user.
- [ ] `demoModeEnabled` + click Review CCL → CCL rail opens against `DEMO-3311402`, no Clio writes (verify in Clio dashboard).
- [ ] `demoModeEnabled` + click Allocate Documents → enquiry workspace opens on `DEMO-ENQ-5521`.
- [ ] `demoModeEnabled` + click Verify ID → instruction workflow opens on `HLX-DEMO-00001`.
- [ ] Reveal-one mode: header control + `J`/`↓` key cycle reveal; mode persists across reload.
- [ ] Completing a demo card: dim → tick → collapse within 5s. "Show completed" footer toggle lists the just-completed row.
- [ ] `get_errors` clean.

**Phase B:**
- [ ] App Insights: `Todo.Redirect` event fires for every card click; `Todo.Card.Completed` fires only for non-demo completions.
- [ ] Two browser tabs as same user: completing a card in tab A removes it from tab B within 3s.
- [ ] `DEMO-*` sourceIds never appear in `dbo.hub_todo` rows (SQL spot check).

**Phase C:**
- [ ] Snapshot test catches visual drift between production + demo-mirror card rendering.

---

## 6. Open decisions (defaults proposed)

1. **Reveal-one default mode** — Default: **`all`** in prod, **`one`** when `demoModeEnabled` is first turned on (reviewer wants the walk-through). User can override; preference persists per-user.
2. **Completion dim duration** — Default: **4s**. Long enough to notice; short enough not to clutter.
3. **Demo refs accepted downstream** — Default: **`DEMO-*` or `HLX-DEMO-*` prefix, pattern-matched**. Aligns with existing `isDemoRef()` in [processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts).
4. **Re-seed in prod demo** — Default: **allow** (per C2). Rationale: a demo might be run back-to-back. Guard with admin check.
5. **Where `helix:todo-completed` is emitted** — Default: **each downstream surface emits it from its own completion path** (CCL rail on Save, enquiry workspace on "All allocated", instruction workflow on Verify ID success, AL form on approve, etc.). Centralising in a single place would need every surface to know about To Do — wrong direction.
6. **Key binding for "next"** — Default: **`J` and `↓`** (Vim-friendly; Gmail-parallel). Reject `Tab` (conflicts with focus management).

---

## 7. Out of scope

- New To Do kinds (this brief hardens what exists).
- Server-side To Do registry schema — see `home-todo-single-pickup-surface` §B3.
- Generic demo data fixes (EID, payment, ND upload) — see `demo-mode-hardening-production-presentable-end-to-end`.
- Mobile / narrow-viewport redesign — orthogonal.
- Asana or external task-source ingestion.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — `immediateActionsList` L6594, demo seeds L6740–L6819
- [src/tabs/home/ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) — reveal-one control, completion dim + tick
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — `TodoExpansion` contract
- [src/components/modern/todo/TodoItemExpandedPane.tsx](../../src/components/modern/todo/TodoItemExpandedPane.tsx) — tray render
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — right-column todoSlot wrapper; header controls
- `src/utils/todoDispatch.ts` (NEW, A6)
- `src/utils/demoTodoFixtures.ts` (NEW, A3)
- [src/index.tsx](../../src/index.tsx) — shell listener for `helix:todo-completed` (Phase B1)

Server:
- `server/routes/todo.js` — owned by `home-todo-single-pickup-surface` §B3; B1/B2 extend only.

Scripts / docs:
- `docs/notes/TODO_CARD_AUDIT.md` (NEW, A1)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
verified: 2026-04-22
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/tabs/home/ImmediateActionsBar.tsx
    - src/tabs/home/ImmediateActionModel.ts
    - src/components/modern/todo/TodoItemExpandedPane.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/utils/todoDispatch.ts
    - src/utils/demoTodoFixtures.ts
    - src/index.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface
  - demo-mode-hardening-production-presentable-end-to-end
  - ccl-review-pickup-via-todo-and-addressee-fix
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - forms-stream-persistence
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - ux-realtime-navigation-programme
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-backend-chain-silent-autopilot-service
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - forms-ia-ld-undertaking-complaint-flow
  - operationsdashboard-carve-up-by-section
  - realtime-delta-merge-upgrade
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - session-probing-activity-tab-visibility-and-persistence
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
conflicts_with: []
```

---

## 9. Gotchas appendix

- `immediateActionsList` ([Home.tsx L6594](../../src/tabs/home/Home.tsx)) is a single `useMemo` with a ~15-entry dep array. Adding expansions in A2 means adding sources to the dep array — miss one and the card won't refresh when that data changes. Run `eslint-plugin-react-hooks/exhaustive-deps` before shipping.
- Demo seeds are pushed UNCONDITIONALLY under `if (demoModeEnabled)` at the end of the list. If A3 introduces a local `completedThisSession` filter, filter the demo seeds too — otherwise they'll re-emit after "completion" on the next render and the dim/tick will flash repeatedly.
- `iabEmptyTickIn` animation is already used for the empty-state "All caught up" check. Reusing it for per-card completion risks timing collisions if the LAST card completes while the debounce is still running. The `allowEmptyState` debounce is 1200ms (changelog 2026-04-20) — ensure A5's collapse-out completes before the empty badge tries to render.
- `PanelActionRow` in [ImmediateActionsBar.tsx](../../src/tabs/home/ImmediateActionsBar.tsx) was recently refactored from a single `<button>` to `<div>` + inner `<button>` + separate chevron `<button>` (changelog 2026-04-20 "Home ToDo panel — bypass compact strip"). When adding A5's dim overlay, apply it to the outer `<div>` — applying to the inner `<button>` leaves the chevron at full opacity and looks wrong.
- The compact-strip `expanded` state in [ImmediateActionsBar.tsx L63](../../src/tabs/home/ImmediateActionsBar.tsx) is a DIFFERENT concept from A4's `revealMode`. The strip toggle is portal-mode-only; the reveal-one is seamless-mode-only. Don't fuse them — they have different lifecycles and `seamless={true}` suppresses the strip path entirely.
- `showToast(..., 'success' | 'info' | ...)` in the current demo seeds is fine for "I clicked it". After A3, the dispatch may be async — always show the toast from the downstream surface's completion hook so you don't double-toast on click + complete.
- Production `DEMO-3311402` is Cass's real client matter in live Clio — see [demo-mode-hardening](./DEMO_MODE_HARDENING_PRODUCTION_PRESENTABLE_END_TO_END.md) §2.3. Do NOT let demo CCL write to it. `CLIO_DRY_RUN_FOR_DEMO_REFS=1` (Phase C1 of that brief) is the safety net, but this brief should also client-side short-circuit writes when the matterRef matches `^DEMO-` before any API call fires.
- `home-todo-single-pickup-surface` §A6 (dim + tick) was listed as deferred. This brief picks it up for demo parity, but keep the implementation client-session-local — server-side completed-state is that brief's §B2/§B3, not this one's.
- The reveal-one's auto-hide of completed cards in `one` mode must respect A5's 4s dim-and-tick visual — skip to next only AFTER the completion animation resolves, otherwise the user never sees the tick. Queue the advance behind the animation.
- Animated height transitions inside a `flex: 1; minHeight: 0` parent (the seamless card body) can clip during the collapse frame. Use `maxHeight` + `overflow: hidden` on the row wrapper, not `height`, for A5's collapse-out.
