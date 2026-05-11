# Staging walkthrough call 2026-05-11 — To Do strip realtime (focus) plus parked items

> **Purpose of this document.** This brief captures every action point from the staging walkthrough call on 2026-05-11 with Alex, Richard and Emma. ONE section is in-scope for the current agent (the To Do strip queue + realtime). Every other action point from the call is **reserved** below so that another agent picking up a different thread can find it here, append findings in place, and NOT open a separate overlapping brief.
>
> **How to use it.** If you are the To Do strip realtime agent: implement Phase A. If you are picking up any other section (attendance notes UI, CCL review UI / send copy, conversion data carry-over, etc.) you MUST update the relevant `## §X RESERVED` section in this same file rather than spinning up a new brief.
>
> **Verified:** 2026-05-11 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user (LZ) walked Alex, Richard and Emma through the staging Hub on 2026-05-11, focused on the new **call handling / transcripts / attendance notes** flow and the new **client care letter (CCL) review with Safety Net**. Several pieces of feedback landed on the call. The user has asked the current agent to focus on **the To Do strip queue and its realtime updates** because that surface is the explicit "bridge between notifications and real work" for every fee earner. When an item is actioned anywhere, the card must disappear from the queue immediately for everyone, not on a 15-second poll.

Verbatim from the call (paraphrased, transcript indexed):
- "the to do strip in the home page. The kind of to do section is the bridge between the notifications and the real work" (transcript L315–L321)
- "this becomes the kind of to do queue for everyone" (L322)
- "as soon as he... approves it, [the] card will disappear" — Alex approving Harkiran's annual leave (L322–L326)
- "if you action the client care letter review off the back of that prompt... matter opens, the client care letter either succeeds or fails. You can review it right there and then. But if you don't, that's when you'll see the To Do card" (L312–L314)
- "approve internal... that then goes out of To Do List" (L500–L504)

The other items below are real and tracked but **not** for this agent.

Note on terminology: the call uses "Fiona" generically; the user has clarified that across this brief and any sibling work the correct term is **fee earner**.

---

## 2. Current state — verified findings

### 2.1 Home To Do rail (the queue)

- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — `fetchTodoRegistryCards` at L2554, hits `GET /api/todo?owner=XX` (or `?scope=all` for god view), filters to `FORMS_TODO_KINDS`. **Polls every 15s** via `setInterval` at L2615. No `useRealtimeChannel` for todo.
- The same Home file already subscribes to other SSE channels (annual-leave, future-bookings, ops-queue, etc.) at L2699–L2917 — same pattern to copy.
- The rail is gated by `isActive` (Home tab visible) and by owner initials / god-view scope.

### 2.2 Server `/api/todo` and `hub_todo` table

- File: [server/routes/todo.js](../../server/routes/todo.js)
  - `POST /create` at L142 → `createCard` then `invalidateHomeJourneyCache()` at L173.
  - `POST /reconcile` at L183 → `reconcileCard` then `invalidateHomeJourneyCache()` at L212.
  - `invalidateHomeJourneyCache()` at L124 already drops `todo:all:*` Redis keys.
  - Mounted at `app.use('/api/todo', todoRouter);` in [server/index.js L853](../../server/index.js#L853).
- File: [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js)
  - `createCard` at L125 — single insert chokepoint into `dbo.hub_todo` (helix-operations DB, `OPS_SQL_CONNECTION_STRING`, gated by `OPS_PLATFORM_ENABLED=true`).
  - `reconcileCard` at L222 — single update chokepoint by `id` or `(kind, ownerInitials)`.
  - `reconcileAllByRef` at L338 — bulk close by `(kind, matterRef)`.
  - Allow-list for `kind` is at L97.

### 2.3 Existing card writers (must continue to fire after the change)

- [server/routes/attendance.js L17–L19](../../server/routes/attendance.js#L17), with `reconcileAllByRef` calls at L1769, L2437, L2629.
- [server/routes/registers.js L31–L33](../../server/routes/registers.js#L31), `reconcileAllByRef` at L96.
- [server/routes/ccl.js L1363–L1366](../../server/routes/ccl.js#L1363) — `createCard({ kind: 'review-ccl' })`.
- [server/routes/ccl-ops.js L869–L892](../../server/routes/ccl-ops.js#L869) — already calls `reconcileAllByRef({ kind: 'review-ccl' })` from inside `POST /upload-nd` (L798).
- Other CCL approve/send entry points to verify in Phase B: `POST /upload-clio` (L593), `POST /mark-sent` (L929), `POST /send-to-client` (L1012).

### 2.4 SSE pattern to copy

- `server/utils/annualLeaveStream.js` (and the `future-bookings`, `ops-queue`, `outstanding-balances` siblings) — every one exposes `attachXxxStream(router)` + `broadcastXxxChanged(payload)`. Consumed on the client via the shared `useRealtimeChannel(url, { event, name, enabled, onChange })` hook with EventSource dedup.
- Dev-loop survival: `disposeOnHmr` + `onServerBounced` from [src/utils/devHmr.ts](../../src/utils/devHmr.ts) are mandatory for any new EventSource consumer (see [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md)).

---

## 3. Plan

### Phase A — In-scope: realtime SSE for the To Do queue

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create `attachTodoStream(router)` + `broadcastTodoChanged(payload)` | `server/utils/todoStream.js` (NEW) | Mirror `server/utils/annualLeaveStream.js` exactly. Event name: `todo.changed`. Payload: `{ changeType: 'created' | 'updated' | 'reconciled' | 'deleted', kind, ownerInitials, id, matterRef, sourceId, ts }`. |
| A2 | Mount the stream | [server/routes/todo.js](../../server/routes/todo.js) | Import `attachTodoStream` and call it on the router so the endpoint is `GET /api/todo/stream`. |
| A3 | Single chokepoint broadcast | [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js) | After successful insert in `createCard` (L125), call `broadcastTodoChanged({ changeType: 'created', ... })`. After successful update in `reconcileCard` (L222) and inside the loop body of `reconcileAllByRef` (L338), call `broadcastTodoChanged({ changeType: 'reconciled', ... })`. Wrap every broadcast in `try/catch` so a broadcast failure never throws out of the helper. |
| A4 | Replace 15s poll with SSE subscription | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L2614–L2620 | Remove `window.setInterval(... 15000)`. Add `useRealtimeChannel('/api/todo/stream', { event: 'todo.changed', name: 'home-todo-rail', enabled: isActive && (!!userInitials || useAllScope), onChange: () => fetchTodoRegistryCards({ silent: true }) })`. Keep a 60s `setInterval` as a backstop (matches the home-metrics safety pattern). EventSource lifecycle paired with `disposeOnHmr`. |
| A5 | Telemetry | server side | App Insights events `Hub.Todo.Stream.Started` (subscriber attach), `Hub.Todo.Broadcast.Failed` (broadcast catch). String-only properties per `appInsights.js` helper contract. |
| A6 | Changelog entry | [logs/changelog.md](../../logs/changelog.md) | One entry: "Realtime To Do strip queue / SSE channel `/api/todo/stream`; broadcast from `createCard`/`reconcileCard`/`reconcileAllByRef`; Home rail switches from 15s poll to SSE plus 60s safety poll." |

**Phase A acceptance:**
- A second user approving Harkiran's annual leave causes Harkiran's annual-leave-cover To Do card to disappear from LZ's open Hub within ~1s, without LZ refreshing.
- A CCL `upload-nd` that calls `reconcileAllByRef({ kind: 'review-ccl', matterRef })` causes the matching `review-ccl` To Do card to disappear from every open Hub within ~1s.
- The Home rail still recovers if the SSE drops (60s backstop poll fires).
- App Insights shows `Hub.Todo.Stream.Started` events from each connected client and zero `Hub.Todo.Broadcast.Failed`.
- No new behavioural change to `/api/todo` GET response shape — only the SSE side-channel is new.

### Phase B — In-scope follow-ups bundled with this realtime work

These are the call's other To-Do-strip-adjacent items that belong with this brief because they finish the loop the realtime change opens.

#### B1. CCL "Approve and send internal" — confirm card reconciliation on every approve path

- The `upload-nd` route already reconciles (L869). Verify the **other** approve/send paths in [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js):
  - `POST /upload-clio` at L593
  - `POST /mark-sent` at L929
  - `POST /send-to-client` at L1012
- Each is a place where the fee earner has effectively finished with the CCL review. They MUST also call `reconcileAllByRef({ kind: 'review-ccl', matterRef, completedVia: '<route-name>' })` before responding 200, so the card leaves the queue from every entry point. Wrap each in the same best-effort try/catch the upload-nd path uses.

#### B2. CCL "Approve and send internal" — clearer email body

- The internal email sent on approve (Luke is the only recipient today; CCs in staging) currently does not tell the fee earner what to do next.
- Add to the email body, in plain prose: *"This client care letter has been approved internally. Please now open the matter in NetDocs, finalise the document, and send it to the client."*
- Locate the email template that fires from the approve+send path (likely in `server/utils/ccl*.js` or `server/templates/`). If the template is shared with another flow, branch it so only the approve+send copy carries the NetDocs instruction.

#### B3. Hide CCL review version-history strip from fee earners

- The CCL review screen currently shows "Current draft is archived to version history. Fresh run pulls live source data..." (transcript L341–L343, L362–L365: *"would be a bit unnerving for a fee earner, I would hide that because it's irrelevant"*).
- Gate the version-history strip behind `isLzOrAc` (inline `['LZ','AC'].includes(initials)` per the dev-preview lock pattern in `.github/copilot-instructions.md` → User Tiers). Devs keep visibility for QA; fee earners do not see it.
- Locate the strip in the CCL review component (grep for `archived to version history` or `Fresh run pulls live source data`).

**Phase B acceptance:**
- Approving via any of the four CCL routes (upload-nd, upload-clio, mark-sent, send-to-client) reconciles the `review-ccl` card and the rail updates in realtime.
- The internal approval email contains the NetDocs next-step sentence.
- Fee earners no longer see the version-history strip; LZ and AC still do.

---

## 4. Step-by-step execution order

1. **A1** — write `server/utils/todoStream.js` by copying `annualLeaveStream.js` and renaming.
2. **A2** — mount it in `server/routes/todo.js`.
3. **A3** — add broadcast calls to `hubTodoLog.js` (single chokepoint covers all writers).
4. **A4** — replace the Home rail poll with `useRealtimeChannel` plus 60s backstop.
5. **A5** — add the App Insights events.
6. **A6** — changelog entry for Phase A; smoke-test in `dev:fast`; ship Phase A.
7. *(Phase B — only after A is on staging)*
8. **B1** — audit and patch the three remaining CCL approve/send routes.
9. **B2** — locate and update the internal approval email template.
10. **B3** — gate the version-history strip behind `isLzOrAc`.
11. Changelog entry for Phase B; smoke-test; ship.

---

## 5. Verification checklist

**Phase A:**
- [ ] `GET /api/todo/stream` returns `text/event-stream` and emits a heartbeat (matches `annualLeaveStream` pattern).
- [ ] Approving an annual leave request in one browser causes the To Do card to disappear in another open Hub within ~1s.
- [ ] CCL upload-nd reconcile triggers the same realtime card removal.
- [ ] Backstop 60s poll still fires when SSE is forcibly closed (kill the EventSource in DevTools, wait 60s, observe refetch).
- [ ] HMR plus nodemon restart: the rail reconnects without a manual page refresh (`disposeOnHmr` + `onServerBounced` working).
- [ ] App Insights: `Hub.Todo.Stream.Started` per subscriber; zero `Hub.Todo.Broadcast.Failed`.

**Phase B:**
- [ ] All four CCL approve/send routes reconcile the `review-ccl` card.
- [ ] Approval email body contains the NetDocs next-step sentence.
- [ ] Version-history strip hidden for non-LZ/AC users (verify by switching user in dev).

---

## 6. Open decisions (defaults proposed)

1. **Backstop poll interval after SSE lands** — Default: **60s** (matches the home-metrics safety pattern). Rationale: the rail must self-heal after a stream drop, and 60s is invisible to a fee earner who just actioned a card themselves (their own action also fires the broadcast).
2. **Per-owner SSE filtering server-side vs client-side** — Default: **broadcast everything; filter on the client** in the `onChange` callback by re-running `fetchTodoRegistryCards`. Rationale: god-view scope already needs the firm-wide stream, the broadcast payload is small (a few ids), and the existing fetch already enforces owner/scope. Server-side filtering can be added later if broadcast volume becomes an issue.
3. **Whether to also broadcast on the legacy `/api/todo/create` and `/reconcile` HTTP routes directly** — Default: **no, rely on the chokepoint inside `createCard`/`reconcileCard`**. Rationale: every HTTP route delegates to the same helper, so the helper-level emit covers them with a single point of change.
4. **Whether B1/B2/B3 stay in this brief or split out** — Default: **stay**. They are tightly coupled to the realtime change because they are the producer side of the events the rail now consumes.

---

## 7. Out of scope (in this brief)

- Anything in §§ 10–18 below — those are reserved for other agents picking up other call action points.
- Migrating the other 4 stale-data surfaces from the prior audit (Matters detail outstanding balances, DataCentre finance status, DataCentre ops log) — separate follow-up.
- Changing the `/api/todo` GET response shape, the `dbo.hub_todo` schema, or the Redis cache TTL.
- Turning on the safety-net switch that lets CCLs go to clients automatically — explicitly OFF, do not flip in this work.
- Any Asana integration or task creation off CCL action points (transcript L514–L521, L375–L377: explicitly "next iteration").

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — Home To Do rail consumer (A4)
- CCL review component (B3) — locate via grep for `archived to version history`

Server:
- [server/routes/todo.js](../../server/routes/todo.js) — mount the new stream (A2)
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js) — broadcast chokepoint (A3)
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — verify reconcile on every approve/send route (B1) and update the internal approval email template (B2)
- `server/utils/todoStream.js` (NEW) — A1
- [server/index.js](../../server/index.js) — already mounts `/api/todo` at L853; no change needed unless A2 also adds a top-level mount

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: staging-walkthrough-call-2026-05-11-to-do-strip-realtime-focus-plus-parked-items
verified: 2026-05-11
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
  server:
    - server/routes/todo.js
    - server/utils/hubTodoLog.js
    - server/utils/todoStream.js
    - server/routes/ccl-ops.js
  submodules: []
depends_on: []
coordinates_with:
  - app-wide-ux-improvement-proof-programme
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - docs-transfer-review-ccl-review-fixes
  - forms-ia-ld-undertaking-complaint-flow
  - helix-rehearsal-record-luke-test-as-firm-seed
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - quick-actions-rework-empty-state
  - realtime-delta-merge-upgrade
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - server-mail-send-helper-extraction
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
conflicts_with: []
```

---

## 9. Gotchas appendix (To Do strip realtime)

- `hubTodoLog.js` is gated by `OPS_PLATFORM_ENABLED=true` (L42); the broadcast must still be emitted even when the helper is a no-op so the contract stays uniform. Wrap broadcast in its own try/catch and never gate it on the helper's no-op path.
- `reconcileAllByRef` (L338) loops over multiple matches; broadcast inside the loop, not after, so each closed card emits its own event.
- The Home rail's existing single-flight guard (`todoRegistryFetchAbortRef.current`) at L2569 will dedupe simultaneous SSE-triggered refetches — keep it; do not bypass it from the SSE callback. Run `fetchTodoRegistryCards({ silent: true })` (the silent path already short-circuits when a request is in flight).
- The SSE event `todo.changed` MUST also be emitted on the `deleted` change type if any helper ever hard-deletes a row (today nothing does, but `changeType: 'deleted'` is in the payload contract for future-proofing).
- App Insights: properties must be strings (auto-converted by helper) — keep payload primitives only.
- Do NOT delete the existing 15s poll until SSE is wired and the 60s backstop is in place; reduce to 60s in the same edit, never leave the rail with no poll.

---

---

# RESERVED SECTIONS — other call action points (do NOT spin up new briefs)

> Every section below corresponds to a separate action point from the same 2026-05-11 call. Each is intentionally a placeholder for another agent. If you are picking up one of these threads, **edit this section in place** with your verified findings and plan. Do NOT open a new top-level stash brief for any of these — the user has explicitly asked to keep the call's action points consolidated under this single brief so that nothing overlaps.

## 10. RESERVED — Attendance note: hide Topics + Destinations sections

- **Source in transcript:** L168–L177, L230–L234. The fee-earner-facing attendance note view should hide the "topics" and "destinations" blocks; they are noisy and only useful for the next iteration (Asana task generation off topics, L178–L180).
- **Status:** RESERVED for separate agent. NOT actioned by this brief.
- **Next agent should populate:** current state findings (which component renders the note, which fields are emitted by the AI summariser), proposed gate (likely a dev-preview / `isLzOrAc` lock so devs still see the data, fee earners do not), changelog entry plan.

## 11. RESERVED — Attendance note: primary/secondary attendee detection bug

- **Source in transcript:** L128–L131. The transcript classifier currently labelled Alex as external on a call where he is internal. Need a fix to the attendee inference so internal team members are not auto-tagged as primary external.
- **Status:** RESERVED for separate agent.
- **Likely area:** the Dubber/transcript attendee extractor (see `/memories/repo/dubber-attendee-extraction-gotchas.md`). Verify directory before assuming.

## 12. RESERVED — Attendance note: action-points checkbox should be display-only for now

- **Source in transcript:** L189–L201. Right now ticking/unticking action points is academic (it does not change anything downstream). Either remove the tick affordance or make it explicitly read-only with a tooltip until the downstream consumer (Asana / hub To Do task generation) lands.
- **Status:** RESERVED for separate agent.

## 13. RESERVED — Conversion: drag prospect call notes into the new matter

- **Source in transcript:** L235–L242. When a prospect is converted into a matter, the prospect-call attendance notes should follow the conversion into the matter file (NetDocs upload + Clio note + the matter's own pinned notes). Today they live only against the prospect contact in ActiveCampaign.
- **Status:** RESERVED for separate agent. Cross-app touchpoint (`enquiry-processing-v2` ↔ `tab-app`) — capture both sides.

## 14. RESERVED — CCL safety-net: copy and traffic-light refinements

- **Source in transcript:** L289–L311. The "17 fields needs confirmation" copy is alarming when most CCLs flag 4-5. Refine the orange/amber traffic-light thresholds, the count phrasing, and the per-field reason text. Out of scope for the realtime brief.
- **Status:** RESERVED for separate agent.

## 15. RESERVED — In-app help notes panel cleanup

- **Source in transcript:** L78–L101, L112–L115. The in-app help notes (bottom-right of staging Home) are settling; refine and trim per OneNote feedback.
- **Status:** RESERVED for separate agent.

## 16. RESERVED — Receptionist KPI strip on Home

- **Source in transcript:** L557–L565. Receptionist users should see call-handling KPIs (calls picked up, average call time, etc.) instead of fee earner / firm time figures. Tier the Home metrics strip by role.
- **Status:** RESERVED for separate agent. Cross-references the Hub / receptionist tier work — verify against `src/app/admin.ts` user-tier helpers before designing.

## 17. RESERVED — Hub Operations expansion (transactions / aged debt visibility)

- **Source in transcript:** L591–L596. Tease-up scope to bring transactions and aged-debt tickets into Home so fee earners stop using Asana forms for money-transfer requests. Long-horizon "stickier hub" item.
- **Status:** RESERVED for separate agent. Treat as next-iteration; do NOT start without a roadmap entry.

## 18. RESERVED — Feedback channel: process the staging "Report a technical problem" form

- **Source in transcript:** L629–L644. Feedback from Richard/Emma/Alex will arrive via the existing forms registry. Add a small operator affordance so submissions can be marked actioned/rejected once handled. Also: per the user, the feedback queue must NOT become a personal To Do list.
- **Status:** RESERVED for separate agent.
