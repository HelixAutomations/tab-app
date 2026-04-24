# Realtime multi-replica safety

> **Purpose of this document.** Make the 9 SSE channels coherent across multiple App Service replicas. Today, every `broadcast*Changed()` call only reaches clients connected to the *same* Node process. That's fine on one replica; the moment we scale out, half the users miss every event.
>
> **How to use it.** Read once. **Do not start until the user confirms scale-out is on the roadmap.** This is dormant work — the cost of building it now is wasted if we stay single-replica. The cost of *not* having it ready when we do scale out is silent staleness for half of users.
>
> **Verified:** 2026-04-19 against branch `main`. Re-verify if >30 days later.

---

## 1. Why this exists (user intent)

Standing user direction: *"i just really want an app that feels realtime."*

The R7 SSE work assumes one Node process holds every connected client. `broadcastMattersChanged()` walks an in-memory `Set<Response>` and writes the SSE frame to each. If App Service scales the Hub web app to 2+ instances, a write hitting replica A's HTTP route will only notify replica A's SSE clients. Clients on replica B will not see the event until they reconnect (typically when they switch tab or hit a manual refresh). The "realtime feel" silently degrades to "stale for some users".

This brief specs the fan-out layer that fixes it: every replica publishes broadcasts to a shared bus; every replica subscribes; each replica's local fan-out function delivers to its own clients. The clients see no difference.

**Not in scope:** the SSE transport itself (still SSE); the payload contract (covered separately by [REALTIME_DELTA_MERGE_UPGRADE.md](./REALTIME_DELTA_MERGE_UPGRADE.md)); cross-region or cross-cloud replication.

---

## 2. Current state — verified findings

### 2.1 In-process fan-out is universal

Verified pattern in [server/utils/matters-stream.js](../../server/utils/matters-stream.js):

```js
const clients = new Set(); // Set<express.Response>
function broadcastMattersChanged(payload) {
  const frame = `event: matters.changed\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) { try { res.write(frame); } catch (_) { /* ignore */ } }
}
```

Identical pattern in all 9 stream utilities:
- ops-queue-stream.js, outstanding-balances-stream.js, doc-workspace-stream.js, future-bookings-stream.js, attendance-stream.js, annual-leave-stream.js, data-operations-stream.js, enquiries-stream.js, matters-stream.js.

The `clients` Set is **per-process**. No persistence, no IPC.

### 2.2 We are currently single-replica

Hub app service plan: 1 instance (verified at the time of writing). The single-replica assumption is implicit — neither the routes nor the docs flag this as a constraint.

### 2.3 Auto-scale is plausible

Hub usage is bursty around month-end (collected time, WIP, billing chases). If the user enables autoscale or even a manual scale-out for resilience (no single point of failure for SSE), this brief becomes urgent overnight. The work itself is invisible until then.

### 2.4 Not all broadcasts are equal

Some originate from cron schedulers (data-operations-stream after WIP sync), some from external webhooks (Clio webhook → matters-stream), some from user actions (opsQueue approve). On scale-out, the cron problem is the worst: the scheduler runs on whichever instance got picked, and only that instance's clients learn about the sync result.

---

## 3. Plan

### Phase A — decision gate

**Do not implement until:**
- [ ] User confirms App Service will scale to ≥2 instances, OR
- [ ] User confirms multi-instance hosting is needed for resilience even at low load.

If the answer is "we'll stay on 1 replica indefinitely" — close this brief and move on. The work is wasted otherwise.

### Phase B — pick the bus

| Option | Pros | Cons |
|--------|------|------|
| **Azure Redis Cache pub/sub** | Already provisioned (used by clio-token cache, snapshot cache); zero new infra; sub-millisecond latency; messages are fire-and-forget which matches SSE semantics (don't care about late subscribers, they'll reconnect). | Pub/sub messages aren't persisted — a replica restart misses any messages during the restart window (clients on that replica will be momentarily stale until next event). |
| **Azure Service Bus topic** | Persistent; replicas that miss messages can replay; topic per channel keeps fan-out clean. | New infra; 10–50ms latency added per broadcast; far more cost; persistence isn't actually useful (we don't replay missed SSE events anyway — clients reconnect and refetch). |
| **Azure Web PubSub** | Purpose-built; handles SSE/WebSocket fan-out natively; eliminates the in-process Set entirely. | Largest refactor (rip out SSE plumbing in favour of a managed broker); cost; adds a single point of failure between client and origin. |

**Default recommendation: Redis pub/sub.** Cheapest, lowest latency, matches SSE semantics. Service Bus's persistence is a feature we don't need. Web PubSub is the "right" long-term answer but premature.

### Phase C — implementation

**C1.** Create [server/utils/realtime-bus.js](../../server/utils/realtime-bus.js):
```js
const { createClient } = require('redis');
const pub = createClient({ url: process.env.REDIS_CONNECTION_STRING }); pub.connect();
const sub = pub.duplicate(); sub.connect();

const localHandlers = new Map(); // channel -> Set<(payload) => void>

function publish(channel, payload) {
  pub.publish(`hub:${channel}`, JSON.stringify({ payload, replicaId: process.env.WEBSITE_INSTANCE_ID || 'local' }));
}

function subscribe(channel, handler) {
  if (!localHandlers.has(channel)) {
    localHandlers.set(channel, new Set());
    sub.subscribe(`hub:${channel}`, (raw) => {
      try {
        const { payload } = JSON.parse(raw);
        for (const h of localHandlers.get(channel) || []) { h(payload); }
      } catch (e) { console.error('[realtime-bus] parse error', e); }
    });
  }
  localHandlers.get(channel).add(handler);
}

module.exports = { publish, subscribe };
```

**C2.** In each of the 9 stream utilities, refactor the broadcast function:
```js
const { publish, subscribe } = require('./realtime-bus');

const localClients = new Set();
function fanOutLocally(payload) {
  const frame = `event: matters.changed\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of localClients) { try { res.write(frame); } catch (_) { /* ignore */ } }
}

subscribe('matters', fanOutLocally);

function broadcastMattersChanged(payload) {
  publish('matters', payload);  // -> hits this replica AND every other
}
```

The publish-then-deliver pattern means the originating replica's clients also receive via the bus path (no double-delivery). Test confirms: pub/sub redelivers to the publisher's own subscribers.

**C3.** Add telemetry:
- `Realtime.Bus.Published` event (channel, payloadBytes)
- `Realtime.Bus.Received` event (channel, replicaId)
- `Realtime.Bus.Failed` event/exception in catch blocks
- `Realtime.Bus.Lag` metric: timestamp embedded in payload, measured at receiver

**C4.** Add a health-check route `/api/realtime/bus-health` returning Redis pub/sub connection state for both `pub` and `sub` clients. Surface in the existing app status panel.

### Phase D — cron / scheduler fix

For broadcasts originating from cron jobs (data-operations after sync, scheduled WIP refresh), ensure the cron only runs on **one** replica using either:
- App Service's "Always On + WEBSITE_RUN_FROM_PACKAGE" + leader election via Redis lock (recommended), or
- Move the scheduler to an Azure Function with a timer trigger (cleaner; one definitive runner).

Without this, every replica's cron fires, every replica publishes — clients see N×duplicate events. Not catastrophic (idempotent merge), but wasteful.

### Phase E — graceful degrade if Redis is down

If Redis pub/sub fails to connect on startup, fall back to in-process-only behaviour and log loudly. Better to have stale-on-other-replica than to drop broadcasts entirely.

---

## 4. Step-by-step execution order

1. **A** — get user sign-off that scale-out is happening.
2. **B** — confirm Redis is the bus (or pivot).
3. **C1** — write `realtime-bus.js`. Unit-test publish→subscribe round-trip.
4. **C2** — refactor one channel (matters) end-to-end. Deploy to a staging slot. Connect 2 instances. Verify cross-replica delivery.
5. **C3** — telemetry on the one channel. Bake 24h.
6. **C2 fan-out** — repeat for the other 8 channels. One PR per channel; each its own changelog entry.
7. **C4** — health-check endpoint + status panel surfacing.
8. **D** — cron leader election.
9. **E** — Redis-down fallback verified by killing Redis in staging.

---

## 5. Verification checklist

**After C2 (single channel):**
- [ ] Two replicas in staging. Client X on replica 1, client Y on replica 2. Mutation hits replica 1. Both X and Y receive the event.
- [ ] No double-delivery to client X (the publisher's own subscriber path).
- [ ] App Insights `Realtime.Bus.Lag` p95 < 50ms.

**After C2 fan-out (all channels):**
- [ ] Cross-replica delivery verified for every channel.
- [ ] No regression in single-replica perceived latency.

**After D (cron):**
- [ ] Scheduler runs once per cron tick across N replicas. Verify by counting `DataOps.SyncCollectedTime.Started` per minute.

**After E (degrade):**
- [ ] Kill Redis. Hub still serves. Broadcasts go in-process only. Clear log line in App Insights `Realtime.Bus.DegradedMode`.

---

## 6. Open decisions (defaults proposed)

1. **Bus choice** — Default: **Redis pub/sub**. Rationale: cheapest, lowest latency, matches SSE semantics, infra already provisioned.
2. **Cron leader election** — Default: **Redis lock with 30s TTL renewed every 10s**. Rationale: simple, no new dependency, matches D's recommended approach.
3. **Channel naming** — Default: `hub:{channel}` namespace prefix. Rationale: avoids collision with other Redis pub/sub users (other Helix apps if they share the cache).
4. **Telemetry sampling** — Default: every event tracked (low volume). Rationale: easier to debug; cost negligible at our scale.
5. **Replica identity** — Default: `process.env.WEBSITE_INSTANCE_ID` (App Service standard env var). Rationale: stable across restarts, distinct per replica.

---

## 7. Out of scope

- Cross-region replication (single-region single-cluster for now).
- Persistent message replay (we don't need it; clients reconnect and refetch).
- Rate-limiting broadcasts (none of the channels are high-frequency enough to matter; revisit if a channel exceeds 10 events/sec sustained).
- Per-user filtering at the bus layer (broadcast everything; client filters).

---

## 8. File index (single source of truth)

Server:
- `server/utils/realtime-bus.js` (NEW) — bus abstraction
- [server/utils/matters-stream.js](../../server/utils/matters-stream.js) and 8 sibling stream utilities — refactored to publish via bus
- All scheduler entry points (e.g. [server/index.js](../../server/index.js) `setInterval` calls) — wrapped in leader-election

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) — add bus topology diagram
- [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) — D6 cross-link

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: realtime-multi-replica-safety
verified: 2026-04-19
branch: main
touches:
  client: []
  server:
    - server/utils/realtime-bus.js
    - server/utils/matters-stream.js
    - server/utils/ops-queue-stream.js
    - server/utils/outstanding-balances-stream.js
    - server/utils/doc-workspace-stream.js
    - server/utils/future-bookings-stream.js
    - server/utils/attendance-stream.js
    - server/utils/annual-leave-stream.js
    - server/utils/data-operations-stream.js
    - server/utils/enquiries-stream.js
    - server/index.js
  submodules: []
depends_on: []                                    # technically independent of delta-merge
coordinates_with:
  - realtime-delta-merge-upgrade                  # both touch every stream utility; sequence: delta-merge first (smaller blast radius), then multi-replica
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Redis pub/sub messages have no acknowledgement.** If a replica is briefly disconnected from Redis, it misses every message during the gap. Clients on that replica won't know — they'll see a momentary stale state until the next event arrives. Acceptable trade-off for matching SSE semantics, but document in user-facing release notes.
- **Don't subscribe twice on the same channel from the same process** — the second subscription will leak handlers. The `if (!localHandlers.has(channel))` guard in C1 prevents this; preserve it.
- **`process.env.WEBSITE_INSTANCE_ID`** is empty in local dev. Default to `'local'` (already in C1). Tests should set it explicitly to simulate multi-replica.
- **Cron duplication is sneaky.** Without leader election (Phase D), every replica's `setInterval` fires. Visible only in App Insights as a sudden N× spike in `*.Started` events when the second replica boots. Easy to miss in dev (single replica) and find in prod (after release).
- **Redis credential rotation.** When Key Vault rotates the Redis password, the existing pub/sub clients stay connected (they cached the auth at connect time). On next reconnect they'll fail until restart. Worth wiring `pub.on('error', ...)` to App Insights so we see the expiry coming.
- **Don't try to mix in-process AND bus paths.** It's tempting to "publish to bus AND deliver locally" to avoid the bus round-trip on the originating replica. Don't — pub/sub redelivers to the publisher's subscribers. Doing both = double-delivery to local clients.
