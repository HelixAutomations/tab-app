# Home todo god view — LZ can see firm-wide with filter back to mine

> **Status:** Shipped 2026-04-23. Brief preserved as the execution record.
> **Verified:** 2026-04-23 against branch `main`.

---

## 1. Why this exists (user intent)

> *"for luke, are you able to show everyones to do items? so i can track it and make sure that it looks right etc? but hide and filter back to mine also so i dont get overwhelmed?"*
> *"dev owner is Luke, so where you need the personal in the all context itll always be Luke."*

Default Home surface stays scoped to current user's hub_todo cards. LZ alone gains a toggle that flips into firm-wide read; non-own cards are read-only; toggle persists per session via localStorage.

Not asking for: slicers, bulk reassignment, extending to other admins, or surfacing outside Home.

---

## 2. Current state — verified findings

### 2.1 Server — `/api/todo`

- [server/routes/todo.js](../../server/routes/todo.js) L130 `router.get('/')` requires `owner` query param. Uses `fetchForOwner(ownerInitials, { includeCompleted })`.
- Caller identity is not verified server-side — any `?owner=` value is accepted. So `?scope=all` doesn't weaken trust vs today.

### 2.2 Client — Home hub_todo plumbing

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx):
  - L259 `FORMS_TODO_KINDS` whitelist.
  - L1379–L1380 `todoRegistryCards` state.
  - L2349–L2395 `fetchTodoRegistryCards({ silent })` — URL: `/api/todo?owner=${userInitials}`; filters to `FORMS_TODO_KINDS`.
  - `formsTodoActions` useMemo maps cards to `HomeImmediateAction`.

### 2.3 Dev-owner gate

- [src/app/admin.ts](../../src/app/admin.ts) exports `isDevOwner()` — LZ only. Correct gate per copilot-instructions.md "User Tiers" section.

---

## 3. Plan

### Phase A — Server: `?scope=all`

- A1 Add `fetchAll({ includeCompleted, limit })` helper alongside `fetchForOwner`. Hard cap 500, ORDER BY CreatedAt DESC.
- A2 GET handler branch: `?scope=all` → skip owner requirement, call `fetchAll`. Emit `trackEvent('Todo.Registry.AllScopeRead', { rowCount })`.

### Phase B — Client: scope toggle on Home

- B1 `homeTodoScope` state (`'mine' | 'all'`), init from `localStorage.helix.homeTodoScope`, default `'mine'`.
- B2 `fetchTodoRegistryCards` reads scope: `'all'` → `/api/todo?scope=all`; else owner URL.
- B3 Segmented toggle (Mine / Everyone), LZ-only via `isDevOwner()`.
- B4 Owner chip on cards when scope==='all' (`borderRadius: 999`, brand tokens).
- B5 Non-own cards: destructive actions disabled; read-only badge / tooltip.
- B6 Meter: `N cards · M owners`.

---

## 4. Acceptance

- Toggle only renders for LZ.
- Default `Mine`; refresh keeps last selection.
- Everyone mode: owner chips render; LZ's own cards fully interactive; others read-only.
- Flip back to Mine → identical render to pre-change baseline.
- Telemetry: `Todo.Registry.AllScopeRead` + `home/todo-scope-switched`.

---

## 5. Out of scope

Slicers, bulk reassignment, other dev-owners, surfaces outside Home.

---

## 6. File index

- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx)
- [server/routes/todo.js](../../server/routes/todo.js)
- `server/services/todo/*` (new `fetchAll` helper — location TBD during impl)
- [logs/changelog.md](../../logs/changelog.md)

### Stash metadata

```yaml
id: home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
shipped: true
shipped_on: 2026-04-23
verified: 2026-04-23
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
  server:
    - server/routes/todo.js
  submodules: []
depends_on: []
coordinates_with:
  - home-todo-single-pickup-surface
  - home-skeletons-aligned-cascade
  - ccl-backend-chain-silent-autopilot-service
  - demo-mode-hardening-production-presentable-end-to-end
  - forms-ia-ld-undertaking-complaint-flow
  - home-animation-order-and-demo-insert-fidelity
  - realtime-delta-merge-upgrade
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
conflicts_with: []
```

---

## 7. Gotchas

- Preserve the `FORMS_TODO_KINDS` post-filter — god view still should only show kinds Home knows how to render.
- `review-ccl` cards from other owners: still allow `openHomeCclReview` dispatch; inspector is read-friendly. Only disable destructive actions (Complete / Dismiss).
- localStorage key: `helix.homeTodoScope`.
- Brand tokens only. Segmented pill = `borderRadius: 999`.
- 60s poller already exists — refetch by changing a dep; don't add a new interval.
- Don't invent an `?owner=ALL` alias — use `?scope=all` so server logs are unambiguous.
