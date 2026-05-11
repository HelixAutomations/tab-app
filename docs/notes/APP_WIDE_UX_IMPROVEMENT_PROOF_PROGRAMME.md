# App-wide UX improvement proof programme

> **Purpose of this document.** This is a self-contained brief that any future agent can pick up cold and execute without relying on chat memory. It packages the UX improvement scope into visible, demoable waves so the team can feel the app has improved without needing an explanation tour.
>
> **How to use it.** Read the whole document once. Ship Phase A first, then Phase B through Phase E in order. Each phase must be independently shippable, verified in the browser, and logged in `logs/changelog.md` if it changes behaviour or UI.
>
> **Verified:** 2026-05-09 against branch `main`. If you are reading this more than 30 days later, re-verify file and line refs before executing.

---

## 1. Why this exists (user intent)

The user asked for an implementation scope they can point to and say the app-wide UX has improved, with the work speaking for itself. This is not a marketing page, a brand refresh, or a rewrite. It is a practical programme of visible interaction improvements across the tab app: fewer flickers, calmer tab switches, clearer control placement, stable loading geometry, and tighter visual consistency.

Relevant user wording from the session: "scope an implementation that i can say to my team ive improved the ux across the app etc. and have it speak for itself" and then "stash the work so we can focus on implementation and dont have to remember".

The current UX rating given in-session was roughly 7/10 for navigation and 6.5/10 for broader UX. The target is not perfection. The target is a demonstrable move to 8/10: fast cursor feedback, no breakpoint twitching, tab returns that feel warm, and controls that live in one obvious place.

---

## 2. Current state: verified findings

### 2.1 Home quick actions now has the first proof point

- File: [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx#L89-L148) now contains the first shipped example of the pattern this programme should reuse: compact-mode hysteresis, rAF-coalesced `ResizeObserver`, and stable observer setup.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L2927) gates quick actions readiness on `hasStartedParallelFetch` and user initials.
- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L7864-L7877) injects `QuickActionsBar` into navigator content and passes `loading={!quickActionsReady}`.
- Gotcha from this session: a `ResizeObserver` attached during a skeleton render can stay attached to the skeleton unless the effect reruns when the live node appears. The QuickActions fix now uses `loading` in the observer effect dependency list.

### 2.2 App shell still has chrome flicker risk

- File: [src/app/App.tsx](../../src/app/App.tsx#L815-L818) toggles `chrome-tab-hidden` for navigator and action chrome based on `activeTab`.
- File: [src/app/App.tsx](../../src/app/App.tsx#L928-L940) still clears navigator content with `setContent(null)` when leaving Home for Enquiries, Matters, or Reports. That can produce a visible blank/fade because Navigator opacity is tied to content truthiness.
- File: [src/components/Navigator.tsx](../../src/components/Navigator.tsx#L27) sets content opacity from `content ? 1 : 0`, so transient `null` content is visible as a UX event.

### 2.3 The repo already has deep UX briefs, but not a team-facing proof wrapper

- [docs/notes/UX_REALTIME_NAVIGATION_PROGRAMME.md](UX_REALTIME_NAVIGATION_PROGRAMME.md) is the deep historical implementation plan for realtime/navigation feel. It includes older shipped rounds and remaining technical work.
- [docs/notes/UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md](UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md) is the focused responsiveness plan. It already flags hover, scroll, virtualization, and ResizeObserver banding work.
- [docs/notes/QUICK_ACTIONS_REWORK_EMPTY_STATE.md](QUICK_ACTIONS_REWORK_EMPTY_STATE.md) covers the Quick Actions empty-state/product surface work.
- [docs/notes/USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md](USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md) covers control consolidation into UserBubble.
- This brief does not replace those. It sequences the visible app-wide story and declares the coordination points.

### 2.4 Existing shell behaviour already supports part of the desired outcome

- File: [src/app/App.tsx](../../src/app/App.tsx#L803-L856) stores and restores scroll positions by tab, which is the right basis for warmer tab returns.
- File: [src/app/App.tsx](../../src/app/App.tsx#L758-L761) preloads inactive heavy tabs, which should be preserved while improving perceived transition calm.
- File: [src/app/functionality/NavigatorContext.tsx](../../src/app/functionality/NavigatorContext.tsx) already splits navigator actions/content contexts, reducing unnecessary rerenders around shell chrome.

### 2.5 Prospects is useful, but it still reads more like an internal pipeline ledger than a premium Helix CRM surface

- File: [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx#L6880-L7260) still owns the grouped-prospect header and grouped child-row branch inline, while single enquiry rows now live in [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx). The result is a split visual language: grouped rows feel like an older ops table, single rows feel newer and more animated.
- File: [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx#L7112-L7200) still uses React-managed hover state for grouped child rows, while [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx#L142) now uses a CSS-owned hover path. That inconsistency is visible as uneven polish.
- File: [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css#L1180-L1519) gives rows motion and hover lift, but the overall table still leans on ledger cues: faint column separators, hidden-on-hover actions, empty grouped pipeline cells, and metadata competing too hard with the contact identity.
- The current scan order does not yet feel CRM-native. The user should instantly read: who this prospect is, what stage they are at, who owns them, what the next likely action is, and whether the record is healthy. Today the surface still makes the operator decode that from multiple small sub-elements.
- The recent hover-responsiveness work stays in scope here. It is not a side quest. The grouped-row hover cleanup should be treated as part of the larger Prospects premium-CRM pass, not as a separate micro-fix.

---

## 3. Plan

### Phase A: make the proof contract visible

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Define the five UX proof scenarios | This brief | Use the acceptance scripts below as the visible team demo: resize Home chrome, tab switch, find controls, cold Home load, brand consistency screenshot. |
| A2 | Treat the shipped QuickActions fix as the first proof point | [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) | Keep the hysteresis and rAF pattern as the reference for other ResizeObserver sites. Do not regress the 624/656 compact band. |
| A3 | Add a small validation note to each implementation PR or changelog entry | [logs/changelog.md](../../logs/changelog.md) | Each phase should include what a teammate can try in the browser, not only what files changed. |

**Phase A acceptance:**
- The implementation team can name the five proof scenarios in one minute.
- No code changes are required beyond preserving the already-shipped QuickActions fix.
- Future phases are judged by visible browser outcomes, not internal refactor size.

### Phase B: calm the app shell

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Remove Home chrome blanking on tab changes | [src/app/App.tsx](../../src/app/App.tsx#L928-L940) | Replace eager `setContent(null)` clears with a stable hide/preserve model. The content can be visually hidden when not relevant, but should not briefly disappear because of route churn. |
| B2 | Keep Navigator transition semantics stable | [src/components/Navigator.tsx](../../src/components/Navigator.tsx#L27) | Avoid opacity flicker caused by transient null content. If content must be absent, make the transition deliberate and bounded. |
| B3 | Preserve scroll restore and preload behaviour | [src/app/App.tsx](../../src/app/App.tsx#L758-L856) | Do not regress inactive tab warmup or per-tab scroll restoration while changing chrome behaviour. |

**Phase B acceptance:**
- Switch Home to Reports to Home five times. No top chrome flash, no white blank, no QuickActions twitch.
- Return to a scrolled tab and land at the prior scroll position.
- Warm tab switch feels immediate enough that the user does not wonder whether data is reloading.

### Phase C: roll out interaction stability patterns

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Reuse the banded ResizeObserver pattern | [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts), affected consumers | Prefer a shared helper or consistent local pattern: hysteresis band, rAF coalescing, and ref swap awareness. |
| C2 | Move simple hover effects out of React state | [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css), affected components | Use CSS classes and tokens for row lift, hover, and active states. Keep inline mutation only for true runtime values. |
| C3 | Keep long-list scroll work passive and bounded | [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css), affected list views | Follow the responsiveness brief: passive scroll listeners, virtualization where row counts demand it, and no per-row hover state loops. |

**Phase C acceptance:**
- Hover rows in the busiest visible lists without delayed highlight or layout movement.
- Resize panels slowly across breakpoints without rapid mode flipping.
- Browser performance view shows input and scroll are not blocked by synchronous layout loops.

### Prospects premium CRM pass (insert between Phase C and Phase D)

| # | Change | File | Detail |
|---|--------|------|--------|
| P1 | Unify grouped and single-row interaction behaviour | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx), [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx), [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css) | Finish the move to one hover and reveal model. Grouped child rows should stop using the older React-managed hover path so the whole table feels like one product surface. |
| P2 | Rebuild row hierarchy around CRM signals, not raw table columns | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx), [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) | Promote the contact/company identity, owner, current stage, and next action to first-read status. Demote IDs, exact timestamps, and low-value metadata to supporting detail. |
| P3 | Give actions a stable premium lane | [src/tabs/enquiries/components/ActionsCell.tsx](../../src/tabs/enquiries/components/ActionsCell.tsx), [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css) | Avoid the current "find the actions by hovering" feel. Reserve a consistent action footprint, keep the most important controls obvious, and let secondary actions reveal progressively without making the row feel empty at rest. |
| P4 | Make grouped prospects feel like account summaries, not collapsible spacer rows | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) | Group headers should carry useful CRM summary content: strongest contact identity, company/account context, owner summary, pipeline health, enquiry count, and latest signal. The current empty pipeline column on group headers should be redesigned, not preserved. |
| P5 | Reduce ledger chrome and increase Helix composure | [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css) | Soften or remove unnecessary separators, improve padding rhythm, keep dark-mode body text neutral, and make the table feel like a composed Helix workspace rather than a dense internal spreadsheet. |
| P6 | Align notes and workbench affordances to one obvious reading path | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx), [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) | Notes, inline workbench, and expansion cues should read as one coherent "what happens next" layer. Avoid separate micro-affordances that compete for attention. |

**Prospects premium CRM pass acceptance:**
- A teammate looking at Prospects for the first time should read it as a Helix-owned CRM surface within seconds, not as a generic operations table.
- Grouped and single rows should follow the same interaction model and hover language.
- The strongest action and owner signals should be obvious without hunting on hover.
- The grouped row should summarise account/prospect state instead of leaving whole cells visually empty.
- The table should feel calmer and cleaner at rest, while still surfacing density when the operator leans in.

### Phase D: consolidate where controls live

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Use UserBubble as the primary control anchor | [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) | Theme, user switching, dev/private controls, and sign-out should be discoverable from the avatar surface unless a local workflow has a stronger reason. |
| D2 | Remove or demote duplicate top-bar controls | [src/app/App.tsx](../../src/app/App.tsx), [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | Avoid the same control appearing in multiple chrome zones. Coordinate with the UserBubble stash. |
| D3 | Fold QuickActions empty-state work into the same story | [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx), [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | The bar should keep a stable shape. Empty work belongs in the To Do or action surface, not as a jarring chrome state. |

**Phase D acceptance:**
- A new user can find theme, sign-out, and dev/private controls from the avatar surface without being coached.
- Quick Actions has a consistent footprint whether actions are ready, empty, or loaded.
- The top chrome contains fewer competing controls than before.

### Phase E: structural loading and visual consistency pass

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Reserve final layout before data lands | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx), first affected tabs | Start with Home, Reports, Matters, Instructions, Enquiries, Finance, Pipeline, Calendar, Matter detail, and Pitch detail. Update the file index before touching each exact file. |
| E2 | Replace spinner-only waits with structural skeletons | affected tab files | Skeletons should match settled height and grid shape. They should not shove adjacent panels after data arrives. |
| E3 | Sweep brand token violations in the touched surfaces | [src/app/styles/colours.ts](../../src/app/styles/colours.ts), [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) | Use canonical colours, neutral body text in dark panels, and approved radii. Do not introduce new hex values. |

**Phase E acceptance:**
- Cold open Home. The first frame reserves the same major geometry as the loaded page.
- Screenshot Home, Reports, and a representative detail panel. The app reads as one product: consistent palette, corners, text hierarchy, and loading structure.
- No visible text overlaps or layout jumps at desktop and narrow browser widths.

---

## 4. Step-by-step execution order

1. Re-run the app locally with `npm run dev:fast` unless an existing dev stack is already running.
2. Baseline the five proof scenarios in the browser before editing: Home resize, tab switch, control discovery, cold Home load, brand consistency screenshot.
3. Ship Phase B first if the goal is fastest team-visible improvement: the app shell is the shared frame everyone sees.
4. Ship Phase C next, starting with any remaining `ResizeObserver` and hover/scroll hotspots identified by [docs/notes/UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md](UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md).
5. Ship the Prospects premium CRM pass before broad design sweep work. It is one of the clearest places the team will feel that the software is Helix-built rather than generic.
6. Ship Phase D after checking [docs/notes/USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md](USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md) for exact UserBubble decisions.
7. Ship Phase E in small batches. Update the file index and metadata before touching new tab files outside this brief's initial touch list.
8. After each phase, run focused diagnostics, browser checks, and add a `logs/changelog.md` entry with the visible UX outcome.

---

## 5. Verification checklist

**Phase A:**
- [ ] Five proof scenarios are documented in the implementation notes or PR summary.
- [ ] QuickActions still keeps compact mode stable around the 624/656 band.

**Phase B:**
- [ ] Home to Reports to Home produces no top chrome blank/flicker.
- [ ] Enquiries and Matters tab returns preserve scroll position.
- [ ] Existing inactive tab preloading still runs.

**Phase C:**
- [ ] ResizeObserver consumers use hysteresis or a shared breakpoint helper.
- [ ] High-traffic hover states are CSS-driven where practical.
- [ ] Long-list scrolling remains responsive while data is present.

**Prospects premium CRM pass:**
- [ ] Grouped and single rows share one interaction model.
- [ ] Prospect identity, owner, stage, and next action read in a clear order without hover hunting.
- [ ] Group headers summarise useful CRM state instead of carrying empty-looking cells.
- [ ] Resting table density feels premium and composed, not like a spreadsheet with motion bolted on.

**Phase D:**
- [ ] Theme, sign-out, user switching, and private/dev controls have one obvious home.
- [ ] Duplicate top-bar controls are removed or demoted.
- [ ] QuickActions empty/loading states keep a stable footprint.

**Phase E:**
- [ ] Skeletons match final page geometry for each touched surface.
- [ ] Colours come from `src/app/styles/colours.ts` or `design-tokens.css`.
- [ ] Body text in dark panels uses neutral greys, not brand blue.
- [ ] `logs/changelog.md` has one concise entry per shipped phase.

---

## 6. Open decisions (defaults proposed)

1. **Proof format** - Default: browser demo plus changelog note, not a separate dashboard. Rationale: the team needs visible improvement, not another surface to maintain.
2. **Navigator content when inactive** - Default: preserve last Home content and hide it via shell state instead of clearing to `null`. Rationale: transient null is currently visible through Navigator opacity.
3. **Control home** - Default: UserBubble owns identity, theme, user switching, dev/private controls, and sign-out. Rationale: it matches the style guide and reduces top-bar clutter.
4. **Design sweep scope** - Default: only fix token/radius/text issues in files touched by the UX phases. Rationale: avoid a broad cosmetic churn pass.

---

## 7. Out of scope

- CRA to Vite migration.
- Mobile/touch-first redesign.
- Cross-app navigation changes for `instruct-pitch` or `enquiry-processing-v2`.
- New backend APIs or server-side telemetry unless a phase adds a server-side process.
- A full redesign of every tab in one branch.
- Replacing the existing deep UX briefs. This brief coordinates them and turns them into a presentable rollout.

---

## 8. File index (single source of truth)

Client:
- [src/app/App.tsx](../../src/app/App.tsx) - app shell, tab switching, chrome hide/show, scroll restoration.
- [src/app/functionality/NavigatorContext.tsx](../../src/app/functionality/NavigatorContext.tsx) - navigator action/content context split.
- [src/components/Navigator.tsx](../../src/components/Navigator.tsx) - top navigator content opacity and transition behaviour.
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) - primary home for user, theme, and private/dev controls.
- [src/components/modern/hooks/useContainerWidth.ts](../../src/components/modern/hooks/useContainerWidth.ts) - existing responsive helper pattern to reuse or align with.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) - grouped prospect rows, grouped child rows, expansion model, and premium CRM restructuring work.
- [src/tabs/enquiries/components/ProspectTableRow.tsx](../../src/tabs/enquiries/components/ProspectTableRow.tsx) - single-row CRM identity, metadata hierarchy, and row reveal behaviour.
- [src/tabs/enquiries/components/ActionsCell.tsx](../../src/tabs/enquiries/components/ActionsCell.tsx) - stable action lane and progressive action reveal.
- [src/tabs/enquiries/components/rowTypes.ts](../../src/tabs/enquiries/components/rowTypes.ts) - row prop contracts while grouped and single-row implementations converge.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) - Home data readiness, QuickActions injection, structural loading surfaces.
- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx) - first shipped hysteresis/rAF proof point and QuickActions footprint work.
- [src/app/styles/colours.ts](../../src/app/styles/colours.ts) - canonical colour tokens.
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) - shared CSS tokens/classes for hover, skeleton, and shell polish.
- [src/app/styles/Prospects.css](../../src/app/styles/Prospects.css) - existing list interaction styles likely touched by hover/scroll work.

Server:
- None expected. If a phase adds server work, update this section before editing and follow App Insights rules.

Scripts / docs:
- [docs/notes/APP_WIDE_UX_IMPROVEMENT_PROOF_PROGRAMME.md](APP_WIDE_UX_IMPROVEMENT_PROOF_PROGRAMME.md) - this stash brief.
- [docs/notes/UX_REALTIME_NAVIGATION_PROGRAMME.md](UX_REALTIME_NAVIGATION_PROGRAMME.md) - deep realtime/navigation implementation reference.
- [docs/notes/UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md](UI_RESPONSIVENESS_HOVER_SCROLL_AND_TAB_NAVIGATION.md) - hover/scroll/tab responsiveness reference.
- [docs/notes/QUICK_ACTIONS_REWORK_EMPTY_STATE.md](QUICK_ACTIONS_REWORK_EMPTY_STATE.md) - QuickActions product surface reference.
- [docs/notes/USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md](USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md) - UserBubble consolidation reference.
- [logs/changelog.md](../../logs/changelog.md) - entry per phase after UI or behaviour changes ship.

### Stash metadata (REQUIRED: used by `check stash overlap`)

```yaml
# Stash metadata
id: app-wide-ux-improvement-proof-programme
verified: 2026-05-09
branch: main
touches:
  client:
    - src/tabs/home/QuickActionsBar.tsx
    - src/tabs/home/Home.tsx
    - src/tabs/enquiries/Enquiries.tsx
    - src/tabs/enquiries/components/ProspectTableRow.tsx
    - src/tabs/enquiries/components/ActionsCell.tsx
    - src/tabs/enquiries/components/rowTypes.ts
    - src/components/Navigator.tsx
    - src/components/UserBubble.tsx
    - src/components/modern/hooks/useContainerWidth.ts
    - src/app/App.tsx
    - src/app/functionality/NavigatorContext.tsx
    - src/app/styles/design-tokens.css
    - src/app/styles/Prospects.css
    - src/app/styles/colours.ts
    - logs/changelog.md
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - chat-tab-removal-retain-infra
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - demo-console-unify-demo-mode-rehearsal-record-and-walkthrough-into-one-premium-surface
  - docs-transfer-review-ccl-review-fixes
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-ia-ld-undertaking-complaint-flow
  - helix-rehearsal-record-luke-test-as-firm-seed
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - hub-rollout-and-training-framework-operator-first-cheat-sheet-rewrite
  - operationsdashboard-sections-visual-alignment
  - quick-actions-rework-empty-state
  - realtime-delta-merge-upgrade
  - resources-hub-forms-pattern-rebuild
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - session-probing-activity-tab-visibility-and-persistence
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- `QuickActionsBar` uses a skeleton/live branch. Any observer attached to `containerRef.current` must account for branch swaps, or it may keep measuring the skeleton and miss the live bar.
- `App.tsx` has a note near tab changes that `setActiveTab()` must not be wrapped in `startTransition`. Preserve that when calming shell transitions.
- `Navigator` opacity currently makes `null` content a visible event. If you remove `setContent(null)` calls, verify that hidden stale Home actions are not clickable while other tabs are active.
- This is an umbrella proof brief. When a phase moves into a tab not listed in metadata, update the file index and rerun `node tools/stash-precheck.mjs --draft docs/notes/APP_WIDE_UX_IMPROVEMENT_PROOF_PROGRAMME.md` before editing.
