# UserBubble and Private Hub Tools — control consolidation and sort

> **Purpose.** Self-contained brief any future agent can pick up cold. Every file path, line number, and decision captured below.
>
> **How to use.** Read end-to-end. Ship Phase A first. Phases B/C after A lands. One `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. Re-verify refs if picked up >30 days later.

---

## 1. Why this exists (user intent)

User verbatim (2026-04-19):

> *"review the user bubble and conflicting modes and controls with the private hub tools. the priate hub tools also has three buttons, but qwuick actions banner has release notes and the light mode toggle aswel, so there is three places now and its a bit all over the place. scope all controls and lets group and sort this out, theres also some in the private hub tools that dont do anything. scope this out and then stash it"*

Three separate surfaces expose overlapping app-level controls:

1. **UserBubble** — bottom-right avatar popover
2. **Private Hub Tools / CommandDeck** — `HubToolsChip` → `CommandDeck`, gated by `canSeePrivateHubControls()` (LZ + AC)
3. **QuickActionsBar** — greeting banner on Home, has Changelog icon + Light/Dark toggle

Controls are duplicated, inconsistently placed, and some CommandDeck entries are dead (no handler wired). Goal: scope everything, group by function, one canonical home per control, secondary surfacing only where it earns its place.

Out of scope: Activity `ToolsDrawer`, CCL review rail, Resources Card Lab.

---

## 2. Current state — verified findings

### 2.1 UserBubble ([src/components/UserBubble.tsx](../../src/components/UserBubble.tsx))

Canonical reference for the Helix look-and-feel per [.github/copilot-instructions.md](../../.github/copilot-instructions.md). Exposes:

| Control | Approx line | Notes |
|---------|-------------|-------|
| Switch user select | ~680 | Admin-only |
| Comms framework section | ~695 | Dev/devGroup only |
| Appearance / Light-Dark row | ~711–737 | Full row, `onClick={toggleTheme}` |
| LocalDevSection | ~742 | isLocalDev-gated — dev dashboard, loading debug, error tracker, demo prompts, migration |
| Refresh Data button | ~759 | Opens `RefreshDataModal` |
| Return to Admin | ~776 | Only when switched user |

**Not present:** Demo mode toggle, Changelog link.

### 2.2 CommandDeck / Private Hub Tools ([src/components/command-centre/CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx))

Opened via [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) — LZ + AC only. Three visible sections:

#### Toggles row (L~173–233)
Demo · Prod (viewAsProd) · Attendance · CCL dates · Ops Queue — all 5 share identical pill UI.

#### Tools grid (L~238–276)
Dev Dashboard · Error Tracker · Error Preview · Loading Debug · Replay Anims · Demo Matter · Demo CCL · Ledger ×4 (demo-mode only) · Rate Tracker · Prompt Seeds · Migration · Changelog

#### Footer (L~477–498)
Activity · Data · Refresh · Return-to-admin

#### Dead / overlapping entries (verify before deleting)

1. **Replay Anims** (L243) — dispatches `replayHomeAnimations`. Initial grep found the dispatcher in CommandDeck and LocalDevSection but no `addEventListener('replayHomeAnimations'` anywhere. **Re-verify with full grep before deletion.**
2. **Error Preview** vs **Error Tracker** — near-identical UX. Merge.
3. **Demo Matter** vs **Demo CCL** — both call `onOpenDemoMatter(boolean)`. Leave as-is or collapse with a CCL chip toggle.
4. **Ledger ×4** — seeds demo entries, only visible when demo is on + admin. Belongs in a "Demo lab" group, not the main tools grid.
5. **Rate Tracker** — has a real listener in Home (~L1453). Keep. But it's a user utility, not a dev tool — re-home into Utilities group.

#### Toggle overlap with UserBubble

**Demo toggle** lives ONLY in CommandDeck. But `demoModeEnabled` is per-user localStorage with no admin check on the handler ([src/app/App.tsx](../../src/app/App.tsx) L1084). So demo mode is effectively LZ/AC-only by UI accident. Should be accessible to any `isAdminUser()`.

### 2.3 QuickActionsBar ([src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx))

Home-only greeting banner. Two icon buttons:

- **Changelog** (L~449) — opens `ReleaseNotesModal`; unread dot when new entries
- **Light/Dark toggle** (L~505) — flips theme

Deliberate peripheral shortcuts — one click from Home greeting zone. The Changelog unread dot is a genuinely good affordance that UserBubble doesn't have.

### 2.4 Cross-reference — what lives where

| Control | UserBubble | CommandDeck | QuickActionsBar |
|---------|:----------:|:-----------:|:---------------:|
| Dark/Light mode | ✅ row | — | ✅ icon |
| Changelog | — | ✅ tool | ✅ icon |
| Refresh Data | ✅ btn | ✅ btn | — |
| Switch user | ✅ | ✅ | — |
| Return to admin | ✅ | ✅ | — |
| Demo mode | — | ✅ toggle | — |
| Dev tools (Dashboard / Error / Loading / Migration / Prompts) | ✅ (LocalDev) | ✅ | — |
| Feature flags (viewAsProd / Attendance / CCL dates / OpsQueue) | — | ✅ | — |
| Demo Matter / Demo CCL / Ledger seeds | — | ✅ | — |
| Rate Tracker | — | ✅ | — |
| Replay Anims | — | ✅ *(dead?)* | — |

**Hard duplications:** Dark mode, Refresh Data, Switch user, Return to admin, dev tools.
**Soft duplications:** Changelog (twice).
**Missing natural home:** Demo mode should be reachable from UserBubble for all admins.

---

## 3. Plan

### Phase A — remove dead entries, group the tools grid (small, shippable)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Remove **Replay Anims** if truly dead | [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) L243, [LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx) L160 | Re-grep `replayHomeAnimations` — addEventListener too. If zero listeners, delete dispatchers. |
| A2 | Merge **Error Preview** into **Error Tracker** | [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) L241–242 | Keep Error Tracker. Delete Error Preview tool row. |
| A3 | Group tools grid with sub-section labels | [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) L434–452 | Reuse `cmd-deck__section-label` pattern. Groups: **Diagnostics** (Dev Dashboard, Error Tracker, Loading Debug), **Demo lab** (Demo Matter, Demo CCL, Ledger ×4, Prompt Seeds), **Utilities** (Rate Tracker, Migration). |
| A4 | Re-home **Rate Tracker** into Utilities | [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) L269 | No handler change, just grouping. |
| A5 | Remove **Changelog** entry from CommandDeck | [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) | QuickActionsBar keeps it — has unread dot, reachable by all users. CommandDeck Utilities should not duplicate. |

**Phase A acceptance:**
- No dead buttons — every CommandDeck entry fires something observable.
- Tools grid = 3 labelled sub-sections.
- Changelog has one entry point (QuickActionsBar).
- `get_errors` clean.

### Phase B — resolve dark-mode duplication and re-home demo mode

**B1. Dark/Light — Default: keep both UserBubble row + QuickActionsBar icon.** Deliberate redundancy: UserBubble = labelled/explicit; QuickActionsBar = peripheral one-click. Document the rationale; remove any *ad-hoc* third toggles if found.

**B2. Demo mode — promote to UserBubble.** Add a new "Mode" row below Appearance, gated by `isAdminUser()` (not `canSeePrivateHubControls()`). Reuse `onToggleDemoMode` prop already plumbed. Sub-label: *"Pin demo prospects/matters to your workspace"*. Keep the CommandDeck toggle for LZ/AC too.

**B3. Refresh Data — keep both.** Different contexts; both are one-click. Document and move on.

**B4. Switch user + Return to admin — remove from CommandDeck.** User-level action, not dev diagnostic. UserBubble is canonical.

Phase B files:
- [UserBubble.tsx](../../src/components/UserBubble.tsx) — add Demo mode row
- [CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx) — remove switch-user + return-to-admin

### Phase C — document the three-surface model

Update [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) with:

- **UserBubble** = personal/user (identity, mode, appearance, refresh, switch-user).
- **CommandDeck** = dev/diagnostics (feature flags, errors, demo lab).
- **QuickActionsBar** = peripheral shortcuts (Changelog, Dark mode) — Home only.

Add header comment to each file: "If adding a new control, decide user action / dev diagnostic / peripheral shortcut."

---

## 4. Execution order

1. A1 — re-grep `replayHomeAnimations`, delete if dead.
2. A2 — remove Error Preview.
3. A3 — split tools grid into 3 labelled groups.
4. A4 — move Rate Tracker into Utilities.
5. A5 — remove Changelog from CommandDeck.
6. *ship Phase A, changelog entry.*
7. B1 — document in style guide (no code change unless ad-hoc toggles found).
8. B2 — add Demo mode row to UserBubble (copy Appearance pattern).
9. B4 — remove switch-user + return-to-admin from CommandDeck.
10. *ship Phase B, changelog entry.*
11. C — style-guide update.

---

## 5. Verification checklist

**Phase A:**
- [ ] `grep_search replayHomeAnimations` — zero matches after delete.
- [ ] Error Preview gone; Error Tracker still opens.
- [ ] CommandDeck tools grid shows 3 sub-sections with labels.
- [ ] Rate Tracker under Utilities.
- [ ] Changelog reachable only from QuickActionsBar.

**Phase B:**
- [ ] Demo mode toggle in UserBubble for all admins; persists to localStorage.
- [ ] Switch user + Return to admin only in UserBubble.
- [ ] Build clean.

**Phase C:**
- [ ] COMPONENT_STYLE_GUIDE.md has the three-surface section.

---

## 6. Open decisions (defaults proposed)

1. **Changelog location** — Default: **QuickActionsBar only** (has unread dot).
2. **Dark mode location** — Default: **both UserBubble + QuickActionsBar** (deliberate redundancy).
3. **Demo mode admin gate** — Default: **`isAdminUser()`** (any admin can present the app).
4. **Refresh Data duplication** — Default: **keep both** (genuinely different contexts).
5. **Switch user location** — Default: **UserBubble only**.

---

## 7. Out of scope

- Activity `ToolsDrawer`.
- CCL review rail.
- Resources Card Lab.
- Adding *new* controls (this brief sorts what exists).
- Mobile/tablet layout.

---

## 8. File index

Client:
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx)
- [src/components/command-centre/CommandDeck.tsx](../../src/components/command-centre/CommandDeck.tsx)
- [src/components/command-centre/LocalDevSection.tsx](../../src/components/command-centre/LocalDevSection.tsx)
- [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx)
- [src/tabs/home/QuickActionsBar.tsx](../../src/tabs/home/QuickActionsBar.tsx)
- [src/app/App.tsx](../../src/app/App.tsx)
- [src/app/admin.ts](../../src/app/admin.ts)

Server: none.

Docs:
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — Phase C update.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata

```yaml
id: userbubble-and-private-hub-tools-control-consolidation-and-sort
verified: 2026-04-19
branch: main
touches:
  client:
    - src/components/UserBubble.tsx
    - src/components/command-centre/CommandDeck.tsx
    - src/components/command-centre/LocalDevSection.tsx
    - src/components/HubToolsChip.tsx
    - src/tabs/home/QuickActionsBar.tsx
    - src/app/App.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-animation-order-and-demo-insert-fidelity
  - ccl-backend-chain-silent-autopilot-service
  - demo-mode-hardening-production-presentable-end-to-end
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas

- `canSeePrivateHubControls()` = LZ+AC only. `isAdminUser()` = 6 people. Don't conflate when re-homing demo mode (use `isAdminUser()`).
- `CommandDeck` renders inside `HubToolsChip` via portal. Preserve scrim logic if altering closure.
- `onToggleDemoMode` in App.tsx now (since 2026-04-19) also dispatches `demoRealtimePulse` + `helix:*Changed` events. Any new demo surface must reuse this prop — do NOT call `setDemoModeEnabled` directly.
- `ReleaseNotesModal` component/file name unchanged — only labels say "Changelog". Don't rename the component unless scope expands.
- `replayHomeAnimations` — re-grep including `addEventListener` before deletion. If found wired somewhere, the tool row stays.
- UserBubble's `LocalDevSection` overlaps much of CommandDeck's tools grid but is `isLocalDev`-gated — deliberately separate audience. Don't merge here.
- Reuse `cmd-deck__section-label` for new sub-section headings; don't invent new label styles.
