# Home realtime channel migration

> **Purpose of this document.** Self-contained brief any future agent can pick up cold. Migrates the 8 inline EventSource effects in `src/tabs/home/Home.tsx` to the shared `useRealtimeChannel` hook so reconnect, debounce, telemetry, and pulse-nonce wiring live in one place.
>
> **How to use it.** Read once. Ship as a single PR (low risk, high leverage). Add one `logs/changelog.md` entry on completion.
>
> **Verified:** 2026-04-19 against branch `main`. If >30 days later, re-verify file/line refs.

---

## 1. Why this exists (user intent)

Standing user direction: *"i just really want an app that feels realtime."*

R7 Phase A introduced [`useRealtimeChannel`](../../src/hooks/useRealtimeChannel.ts) — a single hook that handles SSE connect, debounce-coalesce, payload parsing, status, and (post-R7 Phase D) telemetry. R7 Phase B+C wired all 9 server channels and added pulse cues to Home tiles, but the 8 client consumers in `Home.tsx` are still hand-rolled EventSource effects copy-pasted from the original futureBookings prototype.

This brief replaces those copies with the hook. Net result: ~120 fewer lines in `Home.tsx`, automatic Phase D telemetry on every channel, one place to fix reconnect/back-off/visibility behaviour.

**Not in scope:** changing what each channel does on update, switching from notification-pings to delta-merge (that is a separate Phase E brief), or any visual changes.

---

## 2. Current state — verified findings

### 2.1 Eight inline EventSource effects in Home.tsx

All follow the same shape: `eventSource = new EventSource(url)` → `addEventListener(eventName, scheduleRefresh)` → `connected` listener → `onerror` → cleanup. Each has its own debounce timer and pulse-nonce setter.

| # | Channel | URL | Event name | Home.tsx line |
|---|---------|-----|------------|---------------|
| 1 | annualLeave | `/api/attendance/annual-leave/stream` | `annualLeave.changed` | L2243 |
| 2 | dataOps | `/api/data-operations/stream` | `dataOps.synced` | L2290 |
| 3 | attendance | `/api/attendance/attendance/stream` | `attendance.changed` | L2386 |
| 4 | futureBookings | `/api/future-bookings/stream` | `futureBookings.changed` | L2475 |
| 5 | outstandingBalances | `/api/outstanding-balances/stream` | `outstandingBalances.changed` | L2533 |
| 6 | opsQueue | `/api/ops-queue/stream` | `opsQueue.changed` | L2557 |
| 7 | docWorkspace | `/api/doc-workspace/stream` | `docWorkspace.changed` | L2582 |
| 8 | matters | `/api/matters/stream` | `matters.changed` | L2608 |

The 9th channel (`enquiries`) is intentionally NOT in this list — it is delivered via the app-shell `helix:enquiriesChanged` window event in [src/index.tsx](../../src/index.tsx) and listened to in Home via `window.addEventListener`. Leave that pattern alone.

### 2.2 Existing hook capability ([src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts))

- Accepts `{ event, onChange, enabled, debounceMs, name }`.
- Returns `{ nonce, lastPayload, status }`.
- Default `debounceMs` 350 — matches every existing inline effect.
- When `name` is provided, fires `Realtime.{name}.connected` / `.firstUpdate` / `.error` to App Insights (throttled per session).

### 2.3 Pulse nonces consumed by Home tiles

[src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) declares one `useState` nonce per channel and wraps the relevant tile in `<LivePulse nonce={n} variant="border|dot|ring">`. The hook's returned `nonce` is the drop-in replacement.

---

## 3. Plan

### Phase A — single-file migration (one PR)

For each channel listed in §2.1, replace the inline `useEffect` block with:

```ts
const { nonce: futureBookingsPulseNonce, status: futureBookingsStatus } = useRealtimeChannel(
  '/api/future-bookings/stream',
  {
    event: 'futureBookings.changed',
    name: 'futureBookings',
    enabled: isHomeActive && homeDataReady && isPageVisible,
    onChange: () => { void fetchFutureBookings(); },
  }
);
```

Notes:
- **`enabled` gate must match the existing inline effect's gate** (some are `homeDataReady && isPageVisible`, some include `isHomeActive`). Diff each one before deleting.
- **Drop the manual `useState` nonce** — use the hook's returned `nonce` directly.
- **Drop the manual debounce** — `debounceMs` defaults to 350 which matches.
- **Replace `realtimeChannelStatus` aggregation** with the per-channel `status` returned by each hook call (or keep the aggregation object and write to it via `useEffect`).
- **Demo wave** at the bottom of the file still works — it sets the same nonce state. After migration, demo wave needs to call a no-op or be replaced by `setNonce` overrides. **Decide before starting:** simplest path is to keep one local `demoNonce` per channel and `Math.max(realNonce, demoNonce)` when feeding `<LivePulse>`. Document this in the PR.

**Phase A acceptance:**
- `Home.tsx` is ~120 lines shorter (8 effects × ~15 lines, replaced by 8 × ~7 lines).
- All 8 tile pulses still fire on real server events.
- Demo wave (`?ux-demo=1` style trigger) still flashes all 9 tiles.
- App Insights shows new `Realtime.{name}.connected` / `.firstUpdate` events for every channel.

### Phase B — n/a

Single-PR migration. No follow-up phase.

---

## 4. Step-by-step execution order

1. Pick the simplest channel first (e.g. `dataOps`) — single fetch, no extra payload work. Migrate, verify in dev.
2. Migrate the remaining 7 in any order. Each is independent.
3. Delete the now-unused `useState` nonces and any orphan refs.
4. Add a `logs/changelog.md` entry.

---

## 5. Verification checklist

- [ ] Dev: trigger a mutation on each channel (or the demo wave) and confirm pulse still fires.
- [ ] App Insights: `Realtime.{channel}.connected` events present for all 8.
- [ ] App Insights: `Realtime.{channel}.firstUpdate` event after first real broadcast.
- [ ] No regressions in DebugLatencyOverlay (LZ/AC + `?ux-debug=1`).
- [ ] `npm run typecheck` clean.

---

## 6. Open decisions (defaults proposed)

1. **Demo wave reconciliation** — Default: keep a separate `demoNonce` per channel, render `<LivePulse nonce={Math.max(realNonce, demoNonce)} />`. Rationale: zero impact on real telemetry; demo stays purely client-side.
2. **Per-channel `enabled` gates** — Default: preserve each existing gate verbatim. Do not "harmonise" them in this PR — that is a behaviour change.

---

## 7. Out of scope

- Switching from notification-pings to true delta-merge (separate Phase E brief).
- Touching the `enquiries` window-event relay in [src/index.tsx](../../src/index.tsx).
- Any visual change to `LivePulse` itself.
- Adding new channels.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — the only file changed
- [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) — already in place, unchanged

Server: none.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — single entry on completion

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: home-realtime-channel-migration
shipped: true
shipped_on: 2026-04-19
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - ux-realtime-navigation-programme   # both touch Home.tsx; this brief is small + low-risk and should ship first to clear the SSE noise before Phase 2 virtualization work begins
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Gates differ between channels.** Don't search-and-replace the `enabled` value. Read each existing effect's deps array and reproduce it exactly. `outstandingBalances`, `opsQueue`, `docWorkspace`, `matters` were added in R7 Phase B and may have slightly different gates than the original 4 (annualLeave, dataOps, attendance, futureBookings).
- **Demo wave is in the same file** at the bottom of Home.tsx (extended in R7 to wave 9 channels at 120ms). Don't break it — it's used in pitches.
- **Do NOT migrate the enquiries listener.** It is a `window.addEventListener('helix:enquiriesChanged', ...)` on a custom event dispatched by [src/index.tsx](../../src/index.tsx) after `pipelineEventListenersRef.current.forEach`. That bridge is intentional (reuses the existing app-shell SSE pipe). Leave it alone.
- **`fetchPendingDocActions` is already a `useCallback`** (hoisted in R7). Re-using it inside the hook's `onChange` is safe.
