# Dev preview gating + "View as" mode

> **Purpose of this document.** Self-contained brief. Any future agent can pick this up cold without prior context.
>
> **Verified:** 2026-04-18 against branch `main`. Re-verify file/line refs if reading >30 days later.

---

## 1. Why this exists (user intent)

Today, in-development surfaces (like the Forms entries rail) are gated by `isAdminUser()`, which exposes them to the entire admin tier. The user wants two distinct, layered changes:

1. **Restrict in-development surfaces to the dev group only** (LZ + AC), with a subtle "Dev preview" badge so it's obvious the surface isn't general-availability yet. Other users see the launcher without those panes.

2. **Add a "View as" mode for the dev owner** that, *only when demo mode is enabled*, lets the dev owner toggle between **Dev owner / Admin / Regular** rendering — so we can see what the rest of the org sees without juggling user accounts.

User's verbatim distinction: *"this is for code permissions, right? two different concepts. Switching users via the admin tools in the user bubble changes what data loads. View-as changes what code permissions render. We have a good demo mode implementation, so I'm suggesting that when in demo mode, the forms space surfaces a lightweight subtle overlay enabling me to see the space as both demo user … and regular users."*

The downstream goal is fewer-clicks visibility into permission-tier UX, so we can iterate on quality across the app surface (Forms first, then Reports, Instructions, Resources, Home).

---

## 2. Current state — verified findings

### 2.1 The five user-tier concepts (already documented)

[.github/copilot-instructions.md](../../.github/copilot-instructions.md) §"User Tiers" already codifies five distinct concepts: **Dev Preview** (LZ+AC), **Admin** (`isAdminUser`), **Reports** (`canAccessReports`), **Operations** (`isOperationsUser`), **Dev Owner** (`isDevOwner` — LZ only). It also documents the rollout ladder: Dev Preview → Admin → All Users.

The new "View as" override is a **rendering** layer that sits on top of these tier checks. It does not change the underlying tier functions.

### 2.2 Tier helpers

- [src/app/admin.ts](../../src/app/admin.ts) — `isAdminUser()`, `canAccessReports()`, `isOperationsUser()`, `isDevOwner()`. Pure functions taking `UserData`.
- Inline `isLzOrAc` / `['LZ','AC'].includes(initials)` checks — used as the dev-preview gate (search for the literal in any tab).

### 2.3 The Forms surface (the pilot)

[src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) at ~L137:

```tsx
const showDevStreamPanel = isAdminUser(currentUser);
const canManageStreamEntries = isAdminUser(currentUser);
```

Both gates are admin-tier today. The first should drop to **dev-preview** (LZ+AC); the second can stay admin (entry-management is a more permissive operation than mere visibility).

### 2.4 Demo mode

The repo has an existing demo-mode implementation. Search the workspace for `demoMode` / `useDemoMode` / `isDemoMode` to find the source of truth (not enumerated here — agent picking this up should grep at the top of Phase C). Key behaviour to confirm: how the toggle is set, where it persists, and whether there's already a demo-mode context provider we can extend.

### 2.5 User identity source

User identity comes from Teams context, resolved against legacy SQL user data (initials, AOW, role). 365 auth migration is **out of scope** for this brief — flagged as a future architectural concern.

---

## 3. Plan

### Phase A — Dev-preview gate + badge on Forms entries pane

1. In [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) ~L137, swap `showDevStreamPanel = isAdminUser(currentUser)` for an inline dev-group check: `const initials = currentUser?.Initials || ''; const showDevStreamPanel = ['LZ','AC'].includes(initials);`.
2. Keep `canManageStreamEntries = isAdminUser(currentUser)` (non-LZ/AC admins shouldn't suddenly lose entry-management; the gate they fall under is *the pane itself*, but the management chip can stay tier-aligned).
3. Add a subtle "Dev preview" badge in the pane header. Use `colours.accent` (#87F3F3) with low opacity backdrop, top-right of the entries pane. Match `forms-tokens.css` styles already present.
4. Non-dev-group users see the launcher without the entries pane (current pane visibility is already conditional, just add the badge gating).
5. Changelog entry.

### Phase B — `useEffectivePermissions()` hook

1. New file [src/app/effectivePermissions.tsx](../../src/app/effectivePermissions.tsx):
   - `EffectivePermissionsContext` — provider holding `{ overrideTier: 'devOwner' | 'admin' | 'regular' | null }`.
   - `useEffectivePermissions(currentUser)` hook returning `{ isLzOrAc, isAdminUser, canAccessReports, isDevOwner, isOperationsUser }` — wraps the raw functions from `src/app/admin.ts` and applies the override when present.
2. Override semantics:
   - `null` → passthrough (real tier).
   - `'admin'` → `isLzOrAc=false`, `isAdminUser=true`, `canAccessReports=true`, `isDevOwner=false`.
   - `'regular'` → all false except whatever a fee earner naturally gets.
   - `'devOwner'` → all true (dev owner default).
3. Provider mounted at the top of `App.tsx` (or wherever the demo-mode provider currently lives).
4. **Pilot replacement**: in `FormsHub.tsx` only, swap direct admin/dev-group calls for the hook.

### Phase C — Demo-mode "View as" pill

1. Confirm where demo mode lives (grep `demoMode`).
2. Add a "View as" pill to the UserBubble (canonical command-centre per copilot-instructions §"Helix look and feel"). Visible **only** when:
   - real user is dev owner (`isDevOwner(realUser) === true`), AND
   - demo mode is on.
3. Three options: `Dev owner` / `Admin` / `Regular`. Selection writes to `EffectivePermissionsContext` and persists in `sessionStorage` (clears on tab close).
4. Telemetry: `trackEvent('DevPreview.ViewAsChanged', { from, to })`.
5. Visual: pill matches AnnualLeaveModal user-switch chip pattern.

### Phase D — Roll out hook to other tabs (one PR per tab)

Order of rollout:
1. Forms (rest of, e.g. CCL surfaces).
2. Reports — replaces `canAccessReports` direct calls.
3. Instructions — admin gates around bulk actions.
4. Resources — Compliance + L&D admin chips.
5. Home — admin-only home cards.

Each step: grep direct tier calls, swap to hook, smoke-test view-as switching for that tab.

### Phase E — Out of scope but noted

- 365 auth migration (separate brief when needed).
- Splitting tabs into separate modules for performance (separate architectural brief).
- Teams chat tab capabilities (separate stash candidate).

---

## 4. Step-by-step execution order

1. **A1–A5** Forms entries pane → dev-group gate + badge. Ships independently.
2. **B1–B4** Effective permissions hook + Forms pilot.
3. **C1–C5** View-as pill in UserBubble + demo-mode gating.
4. **D1–D5** Roll out hook to remaining tabs (one per PR).
5. Changelog entry per phase.

---

## 5. Verification checklist

**Phase A:**
- [ ] Login as KW (admin, not dev group) → entries pane is hidden.
- [ ] Login as LZ or AC → pane visible with "Dev preview" badge top-right.
- [ ] Non-admin (e.g. fee earner) → pane hidden, launcher otherwise normal.

**Phase B:**
- [ ] Hook returns identical values to direct calls when `overrideTier === null`.
- [ ] Setting override to `'regular'` makes `isAdminUser` return false.
- [ ] FormsHub renders correctly through the hook (no regression).

**Phase C:**
- [ ] As LZ with demo mode on → "View as" pill appears in UserBubble.
- [ ] As LZ with demo mode off → pill is hidden.
- [ ] As KW (admin, not dev owner) → pill is hidden even with demo mode on.
- [ ] Selecting "Regular" → Forms entries pane disappears (matches Phase A real-regular-user view).
- [ ] App Insights: `DevPreview.ViewAsChanged` event recorded.

**Phase D:**
- [ ] Each tab passes the same gate-flip test against the override.

---

## 6. Open decisions (defaults proposed)

1. **Where does the "View as" pill live?** UserBubble (canonical command centre) vs floating overlay. **Default: UserBubble.**
2. **Should `regular` mode hide admin entries from Resources modal entirely?** **Default: yes.** The override should be lossless — if a regular user wouldn't see it, override-as-regular shouldn't either.
3. **Telemetry.** Track every view-as switch. **Default: yes** (`DevPreview.ViewAsChanged`, props `{ from, to }`).
4. **Scope of the override.** Should it also override `isOperationsUser`? **Default: yes** — full rendering parity with the chosen tier.

---

## 7. Out of scope

- 365 auth workflow migration.
- Splitting tabs into separate modules (architectural).
- Teams chat tab capabilities + cross-app communication.
- Changing what `isAdminUser` etc. return — they remain the source of truth.
- Changing the underlying SQL user-data source.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) — pilot surface (~L137 admin gate)
- [src/tabs/forms/forms-tokens.css](../../src/tabs/forms/forms-tokens.css) — badge styling
- [src/app/admin.ts](../../src/app/admin.ts) — tier helpers (read only)
- `src/app/effectivePermissions.tsx` (NEW) — hook + context
- [src/app/App.tsx](../../src/app/App.tsx) — provider mount
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — view-as pill (canonical reference)
- Each tab root touched in Phase D

Docs:
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — User Tiers section already documents the five concepts; update §"User Tiers" with the new "View as" override after Phase C lands

### Stash metadata

```yaml
# Stash metadata
id: dev-preview-and-view-as
shipped: true
shipped_on: 2026-04-19
verified: 2026-04-18
branch: main
touches:
  client:
    - src/tabs/forms/FormsHub.tsx
    - src/tabs/forms/forms-tokens.css
    - src/app/admin.ts
    - src/app/App.tsx
    - src/app/effectivePermissions.tsx        # NEW
    - src/components/UserBubble.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with: [forms-stream-persistence, activity-tab-hybrid-reshape]   # FormsHub + admin.ts/App.tsx
conflicts_with: []
```

## 9. Gotchas appendix

- `isAdminUser` and `isLzOrAc` are called from many tabs. A naive grep-and-replace will miss conditional rendering buried inside `useMemo` blocks. Trace each call before swapping.
- `colours.accent` (#87F3F3) is the dark-mode accent token. The badge must adapt for light mode — pair with `colours.highlight` (#3690CE) per the `isDarkMode ? accent : highlight` convention used elsewhere.
- The forms-stream-persistence brief touches `FormsHub.tsx` ~L137 too. If that ships first, the gate variable might have moved — re-locate via grep `showDevStreamPanel`.
- `currentUser?.Initials` is uppercase in some user objects, lowercase in others. Use the `Initials` field consistently and uppercase-compare (`(currentUser?.Initials || '').toUpperCase()`).
- Demo mode might already gate other surfaces — check whether toggling it triggers global re-renders that could clobber the override state. SessionStorage write should happen in the toggle handler synchronously.
- Be cautious with `useEffectivePermissions` in code paths that fire before the user resolves (Teams context can take a beat). Default the override to `null` so passthrough returns whatever the raw functions return for `undefined` user (which is "false everywhere").
