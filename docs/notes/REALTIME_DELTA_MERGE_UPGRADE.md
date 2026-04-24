# Realtime delta-merge upgrade

> **Purpose of this document.** Self-contained brief any future agent can pick up cold. Upgrades the SSE pipeline from notification-only ("something changed, refetch") to delta-merge ("here is the changed row, merge it directly into state"). Cuts perceived latency on every realtime tile from ~300ms to ~10ms by eliminating the post-notification HTTP refetch. This is the highest-leverage realtime work left after R7 + home-realtime-channel-migration.
>
> **How to use it.** Read once. Implement Phase A on a single high-traffic channel (`opsQueue`) end-to-end as a proof point before broadening. Phase B fans out to the rest. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If >30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

Standing user direction: *"i just really want an app that feels realtime."*

R7 + home-realtime-channel-migration shipped 9 SSE channels and migrated every Hub-side mutation to broadcast on them. But the broadcast payload is currently *notification-only*: it says "matters changed, source: clio-webhook, event: update" and the client responds by firing a full HTTP refetch. That refetch is typically 200–500ms, hits SQL, transfers the entire dataset, and triggers a full list re-render. The user-perceived feel is "the system noticed quickly, but is now thinking" — not "the system already knew".

Delta-merge replaces the refetch with an in-payload row delta. The mutation route already has the row (it just wrote it). Pushing it down the SSE stream costs nothing extra on the server and removes an entire round-trip on the client. That is what makes Linear / Notion / Figma feel instant.

**Not in scope:** changing the SSE transport (still SSE, not WebSocket); reworking the cache strategy (LRU stays); per-user filtering of payloads; multi-replica coherency (separate brief: `realtime-multi-replica-safety`).

---

## 2. Current state — verified findings

### 2.1 Broadcast payloads today

All 9 stream utilities follow the same template. Verified on `matters-stream.js`:

- File: [server/utils/matters-stream.js](../../server/utils/matters-stream.js)
- `broadcastMattersChanged(payload)` accepts an arbitrary object and JSON-stringifies it into the SSE `data:` frame.
- Current callers pass metadata only: `{ source, event, clioMatterId, triggeredBy }` — no row content.

Same pattern in:
- [server/utils/outstanding-balances-stream.js](../../server/utils/outstanding-balances-stream.js)
- [server/utils/ops-queue-stream.js](../../server/utils/ops-queue-stream.js)
- [server/utils/doc-workspace-stream.js](../../server/utils/doc-workspace-stream.js)
- [server/utils/future-bookings-stream.js](../../server/utils/future-bookings-stream.js)
- [server/utils/attendance-stream.js](../../server/utils/attendance-stream.js)
- [server/utils/annual-leave-stream.js](../../server/utils/annual-leave-stream.js)
- [server/utils/data-operations-stream.js](../../server/utils/data-operations-stream.js)
- [server/utils/enquiries-stream.js](../../server/utils/enquiries-stream.js)

### 2.2 Client-side handlers today

Every consumer in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) (post-migration) follows the same shape:

```ts
const { status } = useRealtimeChannel('/api/<x>/stream', {
  event: '<x>.changed',
  name: '<x>',
  enabled: ...,
  onChange: () => {
    setXxxPulseNonce((n) => n + 1);
    void refetchOrDispatch();   // <-- this is the round-trip we're killing
  },
});
```

The hook at [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) already supports a typed `onChange(payload)` and `reducePayload` for coalescing — so client-side primitives are ready. Only the *consumers* assume "no payload, refetch".

### 2.3 The hook already passes the parsed payload

Confirmed: `useRealtimeChannel<T>` parses the SSE frame's JSON and hands it to `onChange(payload: T)`. Attendance + futureBookings already use this for metadata extraction. No hook change needed for Phase A.

### 2.4 Mutation routes already have the row

Spot-check: [server/routes/opsQueue.js](../../server/routes/opsQueue.js) — every mutation route ends with the updated row available in scope before calling `invalidateOpsCache()`. Same in `matter-operations.js`, `outstandingBalances.js`, `doc-workspace.js`. The data is there, just not put in the broadcast payload.

### 2.5 The cache layer is the trickiest piece

Most channels back onto a server-side cache (e.g. `invalidateOpsCache()`, `invalidateOutstandingBalanceCaches()`). On a delta-merge model the cache should be *updated*, not invalidated, so that any client that does fall back to a refetch (slow connection, missed event) sees the same state. Phase B addresses this.

---

## 3. Plan

### Phase A — proof-of-concept on opsQueue (single PR)

Target the highest-volume channel first to validate the model.

**A1.** Update [server/utils/ops-queue-stream.js](../../server/utils/ops-queue-stream.js) `broadcastOpsQueueChanged` to accept a typed payload `{ kind: 'upsert' | 'delete', row: OpsQueueRow, op: string }` plus the existing metadata. Backwards-compatible: empty `kind` means "notification-only, refetch".

**A2.** Update the 3 mutation routes in [server/routes/opsQueue.js](../../server/routes/opsQueue.js) to pass the just-written row:
- `/approve` (L213) → `{ kind: 'upsert', row: updatedRow, op: 'approve' }`
- `/ccl-date-confirm` (L310) → `{ kind: 'upsert', row: updatedRow, op: 'ccl-date' }`
- `/transaction-approve` (L412) → `{ kind: 'upsert', row: updatedRow, op: 'tx-approve' }`

**A3.** Update the opsQueue consumer in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) (the `useRealtimeChannel('/api/ops-queue/stream', ...)` call) to use a typed `onChange(payload)`:
- If `payload.kind === 'upsert'`: merge `payload.row` into existing ops-queue state by id, bump pulse, no refetch.
- If `payload.kind === 'delete'`: filter by id.
- If `payload.kind` absent: fall back to today's behaviour (dispatch `helix:opsQueueChanged`).

**A4.** Phase A acceptance:
- [ ] Approving a queue item in Hub on machine X → tile on machine Y updates the row in <50ms (DevTools network tab shows zero requests).
- [ ] Demo wave still works (no payload → falls back to refetch via dispatched event).
- [ ] App Insights `Realtime.opsQueue.firstUpdate` p95 < 100ms (currently ~400ms).

### Phase B — broaden to all channels

For each remaining channel, repeat the A1/A2/A3 pattern. Order by traffic + value:

1. **matters** — also receives `clio-webhook` deltas. The webhook handler in [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js) needs a Clio fetch to get the row, OR the payload uses Clio's own `previous_attributes` diff. Decision deferred to Phase B planning.
2. **outstandingBalances** — already has the row in scope post-sync.
3. **annualLeave** — single-row mutations, easy.
4. **attendance** — already extracts initials from payload; extend to include the full attendance row.
5. **docWorkspace** — extend `/upload` to broadcast the new doc record.
6. **futureBookings** — already has rich metadata; extend to include the booking row.
7. **dataOps** — different shape (sync completion, not row mutation). Skip; remains notification-only.
8. **enquiries** — currently relayed via app-shell window event. May stay as-is or follow the pattern.

### Phase C — cache coherency

Replace `invalidate*Cache()` calls with `update*Cache(row)` so the server-side cache stays correct after a write instead of being purged. This means a fall-back refetch returns the same state as the delta-merged client.

This is the riskiest phase — defer until Phase A + B are stable in prod for ≥1 week.

### Phase D — drop the `helix:*Changed` window-event dispatches

Once delta-merge is the default and refetches are extinct, the `dispatchEvent(new CustomEvent('helix:*Changed'))` calls in Home.tsx consumers become dead code. Remove them and any listeners.

---

## 4. Step-by-step execution order

1. **A1** — extend `broadcastOpsQueueChanged` payload contract.
2. **A2** — update 3 opsQueue mutation routes with typed payloads.
3. **A3** — update Home.tsx opsQueue consumer to merge.
4. **Verify Phase A acceptance live.** Telemetry must show p95 < 100ms.
5. **Ship Phase A as its own PR.** Bake for 24h.
6. **Phase B** — fan out one channel at a time, each its own changelog entry.
7. **Phase C** — cache coherency, only after B stable.
8. **Phase D** — dead-code sweep.

---

## 5. Verification checklist

**Phase A:**
- [ ] Two browsers; approve in one; row updates in the other in <50ms with zero HTTP requests in network tab.
- [ ] App Insights `Realtime.opsQueue.firstUpdate` p95 < 100ms.
- [ ] Demo Realtime Pulse wave still flashes opsQueue tile.
- [ ] Slow connection (Network throttling: Slow 3G) — payload still merges, no fallback refetch fires.

**Phase B (per channel):**
- [ ] Same end-to-end test in two browsers.
- [ ] No regression on existing tile renderers.

**Phase C:**
- [ ] Hard refresh on machine Y after a mutation on machine X returns the same state as the delta-merge produced (cache stayed coherent, no stale read).

---

## 6. Open decisions (defaults proposed)

1. **Payload contract per channel** — Default: `{ kind: 'upsert' | 'delete', row, op }` with row matching the existing GET endpoint's row shape. Rationale: same shape both sides; client merge code is trivial.
2. **Backwards compatibility** — Default: keep notification-only as fallback (empty `kind`). Rationale: enables Phase A/B/C to ship piecemeal without breaking older client builds during rollout.
3. **Clio webhook row hydration** — Default: do a single Clio GET inside the webhook handler to fetch the matter row before broadcasting. Rationale: Clio's `previous_attributes` diff is incomplete (missing computed fields). One extra Clio call per webhook is cheap.
4. **Telemetry naming** — Reuse `Realtime.{name}.firstUpdate` (already exists). Add `Realtime.{name}.deltaMerged` event with `kind` property. Rationale: keeps the existing dashboard intact.

---

## 7. Out of scope

- Multi-replica coherency — see [REALTIME_MULTI_REPLICA_SAFETY.md](./REALTIME_MULTI_REPLICA_SAFETY.md).
- Switching SSE → WebSocket — current transport is fine for our scale.
- Per-user filtering of payloads (e.g. only send rows the recipient has permission to see). Today everything broadcasts to everyone; defer until it becomes a concern.
- Optimistic updates on the writer's own client — separate concern.
- Conflict resolution (two writers race on the same row). SQL row-level locks already handle the server side; the last delta wins on the client, which matches today's refetch behaviour.

---

## 8. File index (single source of truth)

Client:
- [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) — already supports typed payload; no change needed Phase A
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — per-channel `onChange` handlers (one per channel in B)

Server:
- [server/utils/matters-stream.js](../../server/utils/matters-stream.js) and the 8 sibling stream utilities — extend payload contract
- [server/routes/opsQueue.js](../../server/routes/opsQueue.js) — Phase A target
- [server/routes/matter-operations.js](../../server/routes/matter-operations.js) — Phase B
- [server/routes/outstandingBalances.js](../../server/routes/outstandingBalances.js) — Phase B
- [server/routes/doc-workspace.js](../../server/routes/doc-workspace.js) — Phase B
- [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js) — Phase B + decision 6.3 (Clio row hydration)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) — D6 cross-link

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: realtime-delta-merge-upgrade
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
  server:
    - server/utils/ops-queue-stream.js
    - server/utils/matters-stream.js
    - server/utils/outstanding-balances-stream.js
    - server/utils/doc-workspace-stream.js
    - server/utils/attendance-stream.js
    - server/utils/annual-leave-stream.js
    - server/utils/future-bookings-stream.js
    - server/routes/opsQueue.js
    - server/routes/matter-operations.js
    - server/routes/outstandingBalances.js
    - server/routes/doc-workspace.js
    - server/routes/clio-webhook.js
  submodules: []
depends_on: []
coordinates_with:
  - realtime-multi-replica-safety       # both touch broadcast layer; sequence: delta-merge first, then multi-replica
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Demo Realtime Pulse compatibility.** The demo wave fires `set*PulseNonce` directly from a setInterval and does NOT go through the broadcast layer. Phase A consumer must still bump the pulse on `onChange` so the demo continues to flash tiles.
- **Outstanding-balances cache lives outside the broadcast.** `invalidateOutstandingBalanceCaches()` is called from multiple places (sync route, manual refresh). Make sure the new `update*Cache(row)` path covers all of them in Phase C, or the cache will go stale.
- **Clio webhook payload size.** A Clio matter GET response can be 5–20kb. Sending it on every webhook to every connected SSE client multiplies bandwidth. If we have 30 connected clients × 100 webhooks/day, that's still trivial (~30MB/day) — but if Phase B scales to subscribe to Activity (per-time-entry), it may be noticeable. Sample bandwidth before committing to Activity.
- **Don't merge into stale state.** If the client missed an event (tab was hidden, just connected), a delta-merge of a single row produces an inconsistent list. Solution: on every reconnect (`status === 'open'` after `'connecting'`), do one refetch to resync, then resume merging. Hook should expose this — add a `onReconnect` callback in Phase A if needed.
- **Window-event dispatches are load-bearing.** `helix:opsQueueChanged` is listened to by other panels (search before deleting in Phase D). Use grep, don't assume.
- **TypeScript narrowing on `kind`.** Use a discriminated union on the payload type so `payload.row` is correctly typed in each branch — saves debugging time.
