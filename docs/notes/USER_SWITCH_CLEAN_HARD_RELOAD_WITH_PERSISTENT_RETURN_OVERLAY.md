# User switch — clean hard-reload with persistent return overlay

> **Purpose of this document.** Self-contained brief any future agent can execute cold.
>
> **How to use it.** Read once, ship Phase A, then Phase B. Changelog entry per phase.
>
> **Verified:** 2026-04-22 against branch `main`. Re-verify refs if picked up >30 days later.

---

## 1. Why this exists (user intent)

User verbatim (2026-04-22):

> *"switching users via the user bubble isnt smooth/clean. scope a rework around that so i can cleanly switch and get a real reload as that users. with an overlay cue to return so i can navigate and test faster. user bubble, name picker, im Lukasz so dev so i see all data/everyones data."*

Context: Lukasz (LZ) is the dev owner (`isDevOwner`) — sees firm-wide data by default. To QA flows as another fee earner (e.g. AC, KW, RC) he uses the inline name picker in UserBubble. Today, `switchUser()` is an in-place React state swap — partial cache purge, no hard reload, SSE subscriptions and module-level singletons retain the old identity, and there is no persistent "you're impersonating X, click to return" affordance once the popover closes. So QA sessions feel sticky and it's easy to forget you're viewing-as someone else.

What's being asked:
1. **A real reload as the target user** — boot path must re-run as if that user opened the app fresh. No stale caches, SSE streams, closed-over fetches, or context flags from the previous identity.
2. **A persistent return overlay** — always-on compact cue ("Viewing as **AC** · return to LZ") that sits outside the UserBubble, reachable from any tab, any scroll position. One click → hard reload back as LZ.
3. **Faster test loop** — switching should feel snappy and complete; returning should be one click and equally snappy.

What's **not** being asked:
- Re-homing the picker (already done 2026-04-21 — inline picker on name click).
- Changing *who* can switch (gate stays `canSwitchUser`).
- Changing data-scope logic (`isDevOwner` / `originalAdminUser` stays intact).
- Anything covered by `userbubble-and-private-hub-tools-control-consolidation-and-sort` (control placement / dedup across CommandDeck/QuickActionsBar). This brief coordinates with that one but does not overlap.

---

## 2. Current state — verified findings

### 2.1 `switchUser()` — in-place swap, not a reload

File: [src/index.tsx](../../src/index.tsx) — function defined L1627, invoked via `onUserChange={switchUser}` at L2498.

Current flow (L1627–1708):
1. `setLoading(true)`, normalise + hydrate target user.
2. `writeRequestAuthContext(activeUser)` — updates the request auth header surface.
3. Stores `originalAdminUser` if moving away from it for the first time; clears it if returning.
4. `setUserData([activeUser])` — React state swap.
5. Selective localStorage purge: only keys containing `enquiries-` or `userdata-`. **Matters cache deliberately retained** ("don't change often" comment L1661).
6. Refetches matters + enquiries scoped to the new user (or firm-wide if `isDevOwner && !activeOriginalAdminUser`).
7. `setLoading(false)`.

**Consequences (observable today):**
- No `window.location.reload()` or router remount — every mounted component keeps its local state, timers, EventSources, and IntersectionObservers.
- SSE consumers (enquiries live-feed, forms-stream, realtime-delta-merge, Matter Opening Pipeline telemetry, server-bounce listener) keep the **old** identity's streams open because they were opened in `useEffect` tied to the previous `userData[0]`. Until the consumer's dep array change fires, the stream is wrong.
- Schedulers / pollers that key off the signed-in user (Home's six `isDevOwner(...) && !originalAdminUser` gates — Home.tsx L1791, L1931, L3045, L4054, L4821, L5271) DO respond to the state change. But the transition is jank: skeletons reserved for LZ's firm-wide data collapse and re-reserve for the new scope.
- `canSeePrivateHubControls()` inline `isLzOrAc` checks flip instantly — correct — but also flip Home's `HOME_FORCE_MINE_LOCAL` derivations in surprising ways (changelog entry 2026-04-22 documents the local-dev mine-only path).
- Caches NOT cleared: matters (by design), `sessionStorage`, IndexedDB, Teams auth token cache, Clio token pool (server-side, unaffected), App Insights correlation context.
- `writeRequestAuthContext` writes to a module-level mutable — fine for new requests, but any in-flight fetch that closed over the old context completes against the old identity and merges its result into the new user's state.

### 2.2 `returnToAdmin()` — calls `switchUser(originalAdminUser)`

File: [src/index.tsx](../../src/index.tsx) L1710–1715.

```ts
const returnToAdmin = async () => {
  if (originalAdminUser) {
    await switchUser(originalAdminUser);
    setOriginalAdminUser(null);
  }
};
```

Same mechanism (in-place swap) → same staleness issues.

### 2.3 Return-to-admin affordance is **popover-only**

File: [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) L761:

```tsx
{originalAdminUser && onReturnToAdmin && (
  // "Return to <original admin>" button — only visible when UserBubble popover is OPEN
)}
```

Also the "View as" strip at L590–611 renders only when the popover is open.

**Nothing persistent is shown when the popover is closed.** The only passive cue is the avatar circle's impersonated initials — easy to forget while deep in another tab.

### 2.4 SSE / HMR survival hooks exist but aren't wired to identity changes

File: [src/utils/devHmr.ts](../../src/utils/devHmr.ts).

- `disposeOnHmr(fn)` — runs on webpack module replacement (dev only).
- `onServerBounced(fn)` — polls `/api/dev/health`, re-fires on `bootId` change.

Neither listens for an *identity* change. A clean switch would benefit from a similar `helix:user-switched` event so SSE consumers can drop + reopen their streams with the new auth context instead of waiting for their dep arrays to catch up.

### 2.5 Related: existing stash brief on UserBubble control layout

File: [docs/notes/USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md](./USERBUBBLE_AND_PRIVATE_HUB_TOOLS_CONTROL_CONSOLIDATION_AND_SORT.md).

Scope there: dedup controls across UserBubble / CommandDeck / QuickActionsBar; promote Demo mode; delete dead Replay Anims; group the tools grid. Phase B4 removes Switch-user + Return-to-admin from CommandDeck so UserBubble is canonical.

**No overlap.** That brief is about *where* controls live. This brief is about *how* the switch mechanism works and the persistent return cue. Complementary:
- If that brief ships first, this brief's overlay attaches to the same canonical UserBubble.
- If this brief ships first, the persistent overlay sits outside the UserBubble anyway; that brief proceeds untouched.

### 2.6 User-tier context (relevant to reload semantics)

Per `.github/copilot-instructions.md`:

- LZ is `isDevOwner` — sees all team data by default. When LZ switches to AC, `originalAdminUser=LZ`, data-scope flips to "AC's view" automatically (firm-wide gates become false because `originalAdminUser` is truthy).
- When LZ returns, data-scope flips back to firm-wide. The logic is correct — the bug is that proper unmount/remount of consumers doesn't happen, so derived state lingers.

---

## 3. Plan

### Phase A — persistent return overlay + observable switch event (ship first, low risk)

No behavioural change to `switchUser`. Adds transparency + return affordance.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New component `ImpersonationBanner` | `src/components/ImpersonationBanner.tsx` (NEW) | Fixed-position strip. Visible only when `originalAdminUser` is truthy. Renders: impersonated initials pill + "Viewing as **<FullName>**" + "Return to <OriginalInitials>" button. `borderRadius: 0` (or 2), `colours.cta` background at 8% opacity with 3px `colours.cta` left-border stripe to signal "not your real identity". Raleway 11–12px. Does NOT open the UserBubble — direct click fires `onReturnToAdmin`. Click target ≥ 32px. |
| A2 | Mount `ImpersonationBanner` in the app shell | [src/index.tsx](../../src/index.tsx) near L2498 | Sibling to `UserBubble`, inside `<TeamsFxContext.Provider>`. Pass `originalAdminUser`, `user`, `onReturnToAdmin={returnToAdmin}`. |
| A3 | Fire custom event on every identity change | [src/index.tsx](../../src/index.tsx) inside `switchUser` after `setUserData` | `window.dispatchEvent(new CustomEvent('helix:user-switched', { detail: { from, to, isReturnToAdmin } }))`. Informational for now — consumers opt in at Phase B. |
| A4 | Dev-only console hint | [src/index.tsx](../../src/index.tsx) | `if (process.env.NODE_ENV !== 'production') console.info('[user-switch]', { from, to, originalAdminUser: !!originalAdminUser })`. Matches existing `actionLog.start/end` style. |
| A5 | Keyboard shortcut — Esc to return | [src/components/ImpersonationBanner.tsx](../../src/components/ImpersonationBanner.tsx) | When banner visible, single `Esc` keypress (outside input/textarea/contenteditable) triggers `onReturnToAdmin`. Documented in aria-label. |

**Phase A acceptance:**
- While impersonating, compact CTA strip visible on every tab, any scroll position.
- One click → `returnToAdmin()`. Popover does not need to open.
- Esc returns (not fired when focus is in input/textarea/contenteditable).
- `helix:user-switched` observable in devtools console on both directions.
- No changes to cache-clearing or fetch logic.
- `get_errors` clean.
- Changelog entry.

### Phase B — real reload semantics for user switching

Ship only after A is stable for a few days.

#### B1. Full-bleed reload strategy — pick one of two

**Option B1.a — `window.location.reload()` with sessionStorage handoff (recommended default).**

1. Persist target identity into `sessionStorage` under `helix.pendingUserSwitch` with a short TTL (30s): `{ initials, entraId, originalAdminInitials, switchedAt }`.
2. Call `window.location.reload()`.
3. On boot (very early in `src/index.tsx`, before Teams context init), check `sessionStorage.getItem('helix.pendingUserSwitch')`. If present and fresh:
   - Hydrate the target user from `teamData` (already a boot-time fetch).
   - Set `userData` + `originalAdminUser` accordingly.
   - Clear the sessionStorage key.
   - Skip the normal Teams-account bootstrap for this user.

*Pros:* Every consumer remounts. SSE, schedulers, caches, observers — all torn down cleanly. Zero risk of stale closures.
*Cons:* Full repaint flash (~300–800ms). Needs verification that Teams SSO doesn't reprompt (it shouldn't — silent acquire).

**Option B1.b — soft reset via `key` remount of the root app.**

Wrap the app root in `<AppRoot key={sessionEpoch}>` and bump `sessionEpoch` on switch.

*Pros:* No browser repaint; faster; preserves Teams iframe state.
*Cons:* Module-level mutable state (`writeRequestAuthContext` target, `HOME_FORCE_MINE_LOCAL` constant, any singleton caches) NOT reset. Timers outside React lifecycle may leak.

**Default: B1.a.** Correctness > flash. If flash is too harsh, revisit.

#### B2. Aggressive cache purge on switch

Centralise into `src/utils/userSwitchReset.ts` (NEW). Purge:
- All `localStorage` keys starting with `helix.` OR containing any of: `enquiries-`, `matters-`, `userdata-`, `wip-`, `collected-`, `outstandingBalances-`, `transactions-`, `instructions-`, `deals-`, `forms-`, `boardroom-`, `soundproof-`, `activity-`, `ccl-`.
- All `sessionStorage` keys under `helix.*` EXCEPT `helix.pendingUserSwitch` (the handoff itself).
- Do NOT touch: Teams auth tokens, Clio tokens (server-side), App Insights distinct-id, dark-mode pref.

One source of truth so the purge list can grow safely.

#### B3. Wire `helix:user-switched` event to SSE consumers

Extend [src/utils/devHmr.ts](../../src/utils/devHmr.ts) with `onUserSwitched(fn)` — same pattern as `onServerBounced`. Consumers update cleanup:

```ts
useEffect(() => {
  const es = new EventSource(url);
  const undoHmr = disposeOnHmr(() => es.close());
  const undoBounce = onServerBounced(() => es.close() /* reconnect */);
  const undoSwitch = onUserSwitched(() => es.close() /* reconnect with new auth */);
  return () => { es.close(); undoHmr(); undoBounce(); undoSwitch(); };
}, [url]);
```

If B1.a is chosen, consumers don't strictly need to subscribe (reload tears everything down). But the event is still useful for non-reloading surfaces and future soft-switch paths.

#### B4. Telemetry

Client-side events via `/api/telemetry`:
- `UserSwitch.Started` — `{ from, to, trigger: 'picker'|'return-to-admin'|'overlay-return' }`
- `UserSwitch.ReloadTriggered` — `{ from, to, strategy: 'location.reload'|'soft-remount' }`
- `UserSwitch.Completed` — `{ from, to, durationMs }` (sessionStorage write → mount completion on the other side)
- `UserSwitch.Failed` — `{ from, to, phase, error }`

Per `.github/copilot-instructions.md` App Insights rules.

#### B5. Return-to-admin: same mechanism, symmetric

`returnToAdmin()` routes through the same B1.a handoff — identical code path, just with `originalAdminInitials` → `targetInitials`. Removes the current two-hop `switchUser → setOriginalAdminUser(null)` sequence.

---

## 4. Step-by-step execution order

1. **A1** — build `ImpersonationBanner` component (isolated, easy to test).
2. **A2** — mount alongside `UserBubble`.
3. **A3 + A4** — emit `helix:user-switched` + dev console line.
4. **A5** — Esc key handler.
5. *ship Phase A, changelog entry: "Persistent return overlay + user-switch event."*
6. **B2** — land centralised cache-purge helper first (no behaviour change yet).
7. **B1.a** — add sessionStorage handoff + reload; update `switchUser` + `returnToAdmin` behind feature flag `HELIX_USER_SWITCH_RELOAD=1`.
8. **B3** — add `onUserSwitched` to `devHmr.ts`; wire into 3 most-active SSE consumers (enquiries live-feed, forms-stream, Matter Opening pipeline). Others adopt incrementally.
9. **B4** — telemetry events.
10. Verify durations + failure rate in App Insights for ~2 days.
11. Flip `HELIX_USER_SWITCH_RELOAD=1` default on; delete legacy in-place swap path.
12. **B5** — unify return-to-admin onto same path.
13. *ship Phase B, changelog entry.*

---

## 5. Verification checklist

**Phase A:**
- [ ] Banner visible on every tab while impersonating; invisible otherwise.
- [ ] One-click return works from any scroll position.
- [ ] Esc returns when banner visible + focus not in input.
- [ ] `helix:user-switched` fires with correct `from`/`to` on both directions.
- [ ] No layout shift on other surfaces (banner is fixed-position, doesn't reserve flow space).
- [ ] `get_errors` clean.

**Phase B:**
- [ ] LZ → AC: full reload fires once; AC's enquiries + matters load fresh; Home skeletons cascade as first boot.
- [ ] After reload, `originalAdminUser` is LZ and banner shows immediately.
- [ ] AC → LZ: full reload fires; Home reverts to firm-wide view.
- [ ] No stale SSE events from previous identity in devtools Network after switch.
- [ ] App Insights events `UserSwitch.Started/ReloadTriggered/Completed/Failed` visible.
- [ ] `UserSwitch.Completed` median < 2.5s local, < 4s staging.
- [ ] Teams SSO does NOT reprompt on reload.
- [ ] Cache purge leaves dark-mode pref + Clio server tokens intact.

---

## 6. Open decisions (defaults proposed)

1. **Reload strategy** — Default: **B1.a** (`window.location.reload` + sessionStorage handoff). Correctness beats flash; SSE + schedulers benefit most from a clean slate.
2. **Banner position** — Default: **bottom-centre, above UserBubble** (~24px margin). Always visible without covering tab chrome; doesn't collide with toasts (top-right). Alt: top-centre pinned under Teams tab bar.
3. **Banner colour** — Default: **`colours.cta` 8% bg + 3px left stripe in `colours.cta`**. CTA is the single warm alert colour per palette; signals "not your real identity" without alarming.
4. **Keyboard shortcut** — Default: **Esc only**. Matches modal-dismiss semantics. Reject `Ctrl+Shift+U` (conflicts with Ctrl+Shift+H wayfinding overlay).
5. **Cache purge scope** — Default: **allow-list by prefix** (§B2). Explicit is safer than "purge everything" — don't wipe dark-mode pref or App Insights correlation id.
6. **Event name** — Default: **`helix:user-switched`**. Matches `helix:server-bounced` from `devHmr.ts`.
7. **Feature flag for reload** — Default: **`HELIX_USER_SWITCH_RELOAD`**, off during bake-in, flipped on after 2 days of clean telemetry. Matches existing `HELIX_LAZY_INIT` / `FORCE_BOOT_WARMUPS` convention.

---

## 7. Out of scope

- Changing *who* can switch (`canSwitchUser = isAdminUser(user) || !!originalAdminUser`).
- Re-homing the picker (done 2026-04-21).
- CommandDeck/QuickActionsBar control dedup — see `userbubble-and-private-hub-tools-control-consolidation-and-sort`.
- Server-side impersonation (Clio / Entra). We stay authenticated as the real user and scope data queries by the impersonated user's initials/email. Unchanged.
- Dev Preview `isLzOrAc` gating — orthogonal.
- `View-as` persona overlay (different concept — permission tier simulation, not identity switch).

---

## 8. File index (single source of truth)

Client:
- [src/index.tsx](../../src/index.tsx) — `switchUser` L1627, `returnToAdmin` L1710, `<UserBubble>` mount L2498
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — picker L452, Return-to-Admin button L761, View-as strip L590
- `src/components/ImpersonationBanner.tsx` (NEW, Phase A)
- [src/utils/devHmr.ts](../../src/utils/devHmr.ts) — add `onUserSwitched` (Phase B3)
- `src/utils/userSwitchReset.ts` (NEW, Phase B2)
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — dev-owner gates already react to `userData`/`originalAdminUser`; no direct change, verify during Phase B
- [src/app/admin.ts](../../src/app/admin.ts) — `isDevOwner`, `isAdminUser`, `canAccessReports` (read only)

Server:
- No server changes expected. Auth context remains the real user; data scoping is client-driven.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md) — add `onUserSwitched` to SSE consumer rules if B3 ships

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: user-switch-clean-hard-reload-with-persistent-return-overlay
verified: 2026-04-22
branch: main
touches:
  client:
    - src/index.tsx
    - src/components/UserBubble.tsx
    - src/components/ImpersonationBanner.tsx
    - src/utils/devHmr.ts
    - src/utils/userSwitchReset.ts
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - demo-mode-hardening-production-presentable-end-to-end
  - ux-realtime-navigation-programme
  - session-probing-activity-tab-visibility-and-persistence
conflicts_with: []
```

---

## 9. Gotchas appendix

- `src/index.tsx` L1627 `switchUser` deliberately does NOT purge the matters cache (comment L1661). Phase B's purge list must explicitly include `matters-` — the original rationale (matters don't change often) is correct for *refresh* but wrong for *identity change*.
- `writeRequestAuthContext` is a module-level mutable. In-flight fetches that closed over the previous context WILL complete and call `setState` with results belonging to the wrong identity. A full reload (B1.a) sidesteps this; a soft remount (B1.b) does not — don't pick B1.b without aborting in-flight fetches.
- The inline picker in UserBubble (L452) uses `u.Initials === user.Initials` as the "is current" check. If user-equality is refactored, fix both here and in `isSameSwitchIdentity` at the top of `switchUser` — they must agree.
- `canSwitchUser = isAdminUser(user) || !!originalAdminUser` — the `|| originalAdminUser` clause is why a switched-to non-admin user still sees the picker. Do not simplify this in the banner; the banner shows whenever `originalAdminUser` is truthy, regardless of whether the current user is admin.
- Teams tab context: `window.location.reload()` inside the Teams iframe is supported (the `ServerBouncedReload` branch in `useDevServerBoot` effectively reloads). Do NOT use `window.top.location.reload()` — will fail the Teams iframe CSP.
- App Insights correlation: on `location.reload`, the SDK re-initialises — distinct-id persists via localStorage, session id rolls. Acceptable.
- `HOME_FORCE_MINE_LOCAL` (dev-only mine-only default for LZ) is module-level, evaluated once at import. A full reload re-imports, no cache to invalidate. A soft remount does NOT re-evaluate it — another reason B1.a is safer.
- Banner z-index: UserBubble uses a large z-index for its command-centre overlay. Banner should sit one tier below (~2000) so opening the popover doesn't collide.
- The existing `View-as` segmented control (Phase C of `dev-preview-and-view-as`) also uses `originalAdminUser || user` as the "real user" anchor (UserBubble L117 `realUser`). Keep this pattern — don't introduce a second notion of "real user".
