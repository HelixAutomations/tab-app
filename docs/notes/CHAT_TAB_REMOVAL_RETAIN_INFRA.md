# Chat tab removal — retain bot infra

> **Purpose.** Remove the Chat tab from the Teams app manifest and hub navigation, but retain the Teams bot registration and any DM-send infrastructure for future re-use. Users should have no Chat surface in the hub after this ships.
>
> **Verified:** 2026-04-20 against branch `main`.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/notes/realignmentcall_scope.md](realignmentcall_scope.md)):

- *"remove chat for now. We'll come back to that"*
- *"we might re-add it later... so keep the bot piece in place"*

Out of scope: deleting Azure Bot registration, deleting Graph permissions, unregistering the app's bot capability.

---

## 2. Current state — verified findings

- Teams manifest: [appPackage/manifest.json](../../appPackage/manifest.json) — contains both a Chat tab (UI surface) and a `bots` block (Teams bot registration). These are independent; removing the tab does not un-register the bot.
- Client nav: Chat is a top-level entry — trace the nav component (OperationsDashboard or a dedicated nav file) to find the entry. The tab renders a chat-panel component (path to confirm in Phase A1 via grep).

---

## 3. Plan

### Phase A — Audit and isolate

- **A1.** Grep the manifest and client for "chat" / "Chat" to list every affected file. Expected hits:
  - `appPackage/manifest.json` — `staticTabs` entry (or configurable tab entry) with `entityId` / `name` matching "Chat".
  - Client nav — a route/entry for the chat surface.
  - A chat component file (likely under `src/tabs/chat/` or `src/components/chat/`).
- **A2.** Confirm the bot block in the manifest and any server routes under `server/routes/bot*.js` are unrelated to the chat tab's UI. These must remain untouched.

### Phase B — Removal

- **B1.** Remove the Chat `staticTabs` entry from [appPackage/manifest.json](../../appPackage/manifest.json). Retain `bots` block unchanged.
- **B2.** Remove the client nav entry (label, icon, route).
- **B3.** Delete (or `git rm`) the chat tab component file(s) — only if they are genuinely orphaned after B2. If other features reference any helper from the chat component (e.g. a message renderer), leave the helper and remove only the tab surface.
- **B4.** Remove any chat-specific routes/imports in `src/app/App.tsx`.
- **B5.** Remove any remaining "Chat" copy references (empty-state hints, tooltips elsewhere that mention the chat tab).

### Phase C — Manifest validation + rollout

- **C1.** Validate manifest via the Teams Toolkit (`teamsapp` task `Validate prerequisites` + `Provision` in the dev environment). Ensure manifest.json passes schema.
- **C2.** Build the Teams app package (existing flow).
- **C3.** Upload to Teams staging tenant; confirm Chat tab absent, other tabs intact, bot still registered.

### Phase D — Safety net

- **D1.** Leave a tombstone comment in `appPackage/manifest.json` beside the `bots` block: *"Chat tab removed 2026-04; bot retained for future re-use. See docs/notes/_archive/CHAT_TAB_REMOVAL_RETAIN_INFRA.md."*
- **D2.** If any server endpoint is chat-only and not used by the bot (e.g. `server/routes/chat.js`), mark it `// TODO(chat-revive): unused since <date>` rather than delete — cheap to re-enable later.

---

## 4. Step-by-step execution order

A1 → A2 → B1 → B2 → B3 → B4 → B5 → C1 → C2 → C3 → D1 → D2.

---

## 5. Verification checklist

- [ ] Teams app loads without a Chat tab.
- [ ] No 404 / broken deep-links to `/chat`.
- [ ] Bot still responds (if a test command exists) — confirms manifest `bots` block intact.
- [ ] `npm run check-sizes` + TS build pass.
- [ ] Grep `entityId.*[Cc]hat` returns zero hits in manifest.
- [ ] `appPackage/manifest.json` validates against its schema.

---

## 6. Open decisions (defaults proposed)

1. **Delete chat component file or keep dormant?** Default: **Delete.** Easy to restore from git. Keeping bloats the tree.
2. **Keep `server/routes/chat.js` (if exists)?** Default: **Keep, tombstoned.** Cheap to revive.
3. **Announce to users?** Default: **Yes** — one changelog entry is enough; no email required.

---

## 7. Out of scope

- Azure Bot deregistration.
- Graph permission pruning.
- Deleting the bot service entirely.
- Replacement notification UX (to be designed separately when chat returns or DM-notification lands).

---

## 8. File index

- [appPackage/manifest.json](../../appPackage/manifest.json) — remove `staticTabs` Chat entry; retain `bots`.
- Client nav (TBD in Phase A1 — likely `src/components/modern/OperationsDashboard.tsx` nav or a dedicated nav file).
- Chat component file(s) — TBD in Phase A1.
- [src/app/App.tsx](../../src/app/App.tsx) — remove chat-related imports/routes if any.
- Possibly `server/routes/chat.js` — tombstone, not delete.

### Stash metadata

```yaml
# Stash metadata
id: chat-tab-removal-retain-infra
verified: 2026-04-20
branch: main
touches:
  client:
    - appPackage/manifest.json
    - src/app/App.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface
  - ccl-backend-chain-silent-autopilot-service
  - ccl-review-pickup-via-todo-and-addressee-fix
  - demo-mode-hardening-production-presentable-end-to-end
  - home-animation-order-and-demo-insert-fidelity
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- `staticTabs` vs `configurableTabs` — check which section the Chat tab lives in; the removal is slightly different (configurable tabs also have Teams-side subscription state).
- Do NOT touch the `bots` block or `validDomains` entries tied to the bot endpoint. That's what's being preserved.
- If the chat component imports a message-renderer used elsewhere, isolate the shared helper before deleting.
- The Teams manifest must bump its `version` when changes are made — standard Teams Toolkit convention.
- After removal, any lingering deep-link URLs into Chat will 404 in Teams — acceptable; there were no external links to it.
