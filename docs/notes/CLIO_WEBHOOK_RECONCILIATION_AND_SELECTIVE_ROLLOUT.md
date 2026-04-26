# Clio webhook reconciliation and selective rollout

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. It expands the already-shipped Clio webhook bridge into a broader webhook programme: selective entity subscriptions, targeted reconciliation into Hub mirrors, and fast UI invalidation/update paths.
>
> **How to use it.** Read the whole document once. Then pick a narrow Phase A slice to ship first. Do **not** treat this as "subscribe to everything at once". The user explicitly wants the scope captured broadly but the implementation actioned selectively, likely starting with **Matters** or **Activities** only.
>
> **Verified:** 2026-04-24 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs and the live Clio webhook docs before executing.

---

## 1. Why this exists (user intent)

User request, verbatim: *"review and then stash a brief to implement clio webhooks, scope all but say to be selective when it comes to actually actioning the brief as i might want to start with matters or activities only atm. but i want a scope to add clio reconscilliation and updates via webhooks. they will help."*

The repository already has a shipped inbound webhook bridge for Clio matters. What it does today is useful but narrow: it receives a webhook, verifies the signature, and re-broadcasts a `matters.changed` SSE nudge so the UI refreshes sooner. It does **not** yet provide broader entity coverage, replay/audit safety, or true reconciliation of Clio-originated changes back into Hub mirrors.

This brief is therefore **not** asking for a greenfield webhook system. It is a scoped expansion from the existing bridge into a selective rollout programme:
- first-class webhook intake and audit,
- entity-by-entity rollout,
- optional reconciliation for the entities that materially benefit,
- and explicit guidance to start with the smallest high-value slice, most likely **Matters first** or **Activities first**.

---

## 2. Current state — verified findings

### 2.1 Existing inbound webhook bridge is already live for Matter invalidation only

- [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L1-L99) already exists and is explicitly labelled "Clio webhook bridge — Phase A".
- The route is `POST /api/clio/webhook` at [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L41).
- On a valid payload it tracks `Clio.Webhook.Received` and, if `objectType === 'Matter'`, calls `broadcastMattersChanged(...)` at [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L71-L83).
- The file also states future intent for contacts only as a comment: *"Phase B will add Contact → enquiries / instructions broadcast here."* at [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L85).
- Startup warns when `CLIO_WEBHOOK_SECRET` is missing, disabling signature verification in dev at [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L96-L99).

### 2.2 The route is mounted early enough for raw-body signature verification and bypasses the auth gate by ordering

- [server/index.js](../../server/index.js#L546-L552) mounts Stripe and Clio webhook routes **before** the global `express.json()` middleware.
- [server/index.js](../../server/index.js#L562-L566) applies `userContextMiddleware` and then `requireUser` **after** the webhook mount, so the inbound webhook is not blocked by the normal API user-context guard.
- This means the main production-hardening question is not route reachability; it is correctness of signature verification, idempotency, and downstream processing.

### 2.3 Current client effect is refresh invalidation, not field-level reconciliation

- [server/utils/matters-stream.js](../../server/utils/matters-stream.js#L23-L37) exposes a lightweight SSE channel that broadcasts `matters.changed` with a payload-light `type: 'matters.changed'` event.
- The app shell subscribes to `/api/matters/stream` in [src/index.tsx](../../src/index.tsx#L1625-L1662), calls `requestMattersRefresh()`, and re-emits `helix:mattersChanged`.
- Home subscribes to the same matters stream in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L2726-L2733), increments the tile pulse nonce, and re-emits `helix:mattersChanged`.
- Practical meaning: the shipped bridge makes Hub feel fresher, but it does **not** merge webhook payloads into client state or reconcile SQL mirrors on its own.

### 2.4 The repo already has adjacent channels for Contact-style updates and data-ops invalidation

- [server/utils/enquiries-stream.js](../../server/utils/enquiries-stream.js#L208-L223) already exposes `broadcastEnquiriesChanged(...)` and an `/stream` SSE surface for enquiry-side invalidation.
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js#L1-L19) documents that recorded time / WIP comes from **Clio activities** into the `wip` table.
- The data-ops stream helper in [server/utils/dataOps-stream.js](../../server/utils/dataOps-stream.js#L26-L41) already exposes `broadcastDataOpsChanged(...)` and `/stream` for payload-light refresh signals.
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js#L1599-L1607) already uses `broadcastDataOpsChanged(...)` after collected syncs; the same pattern exists for WIP sync later in the file.

### 2.5 Local Clio reference material already documents the mirror targets that reconciliation would need to update

- [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md#L321-L337) documents the current Clio Matter → `Matters` table mirror shape (`MatterID`, `Status`, `OpenDate`, `ClientID`, `DisplayNumber`, `ClientName`, `Description`, `PracticeArea`, etc.).
- The same reference documents the Activities API as the WIP source at [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md#L344-L370), including that activities feed the WIP sync path.
- That means true reconciliation is only partly a webhook problem; it is also a choice of **which local mirrors should be patched immediately** versus simply invalidated and re-polled.

### 2.6 There is already a shipped archived brief for the original bridge

- [docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md](../../docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md) shows the first brief was completed and archived.
- This new brief should be treated as the next-stage programme brief, not a replacement for what is already shipped.

### 2.7 Token handling is not the blocker for Matter invalidation, but it will matter for fetch-and-reconcile phases

- [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js#L1-L86) already provides a shared per-initials token cache + retry wrapper for some Clio consumers.
- [server/routes/matter-operations.js](../../server/routes/matter-operations.js#L452-L457) still refreshes a shared Clio token inline.
- Implication: webhook **invalidation-only** phases can proceed without token refactors, but any webhook phase that fetches fresh Clio records to reconcile local mirrors should avoid creating a fourth token-refresh path.

### 2.8 Documentation gap: live vendor webhook docs were not reliably retrievable via static fetch in this session

- Static fetches against the Clio docs homepage succeeded, but the expected webhook-specific pages and API reference extraction did not yield stable content during this session.
- Do **not** assume header names, retry semantics, or supported subscription models from this brief alone. Re-verify them against the live Clio docs immediately before execution.

---

## 3. Plan

### Phase A — harden and formalise the shipped bridge

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Vendor-contract verification | [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L1-L99) | Confirm live Clio webhook header names, signature algorithm, retry semantics, and supported subscription models against current docs before changing behaviour. |
| A2 | Add inbound audit + idempotency envelope | [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L41-L91) | Persist or at least log a minimal envelope per inbound event: subscription id, delivery id, entity type, entity id, event name, received_at, processed_at, result. Keep payload bodies out of logs. |
| A3 | Productionise subscription management | `scripts/clio-subscribe.mjs` (NEW) | Add a repeatable script to create, list, and tear down subscriptions per environment. Store subscription ids outside code. |
| A4 | Document secret and rollout contract | [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md) | Record `CLIO_WEBHOOK_SECRET`, delivery URL policy, and rotation / cutover steps. |

**Phase A acceptance:**
- A bad signature is rejected and produces telemetry, without logging PII.
- A valid Matter webhook still causes the current `matters.changed` refresh path to fire.
- Each inbound delivery has enough metadata recorded to investigate duplicates, misses, or replays.
- Subscription registration is no longer an ad-hoc manual memory task.

### Phase B — selective entity rollout (ship one entity family at a time)

#### B1. Matters-first rollout: keep action narrow

Default first slice.

- Subscribe only to Matter create/update/delete/restore events.
- Keep initial action as **invalidate + refresh**, not full SQL merge.
- Only add fetch-and-reconcile once the invalidation path is stable and telemetry shows the volume/patterns are safe.

Why this is the safest first slice:
- the route already handles Matter payloads;
- the SSE and client refresh paths already exist;
- the user explicitly called out matters as a likely starting point.

#### B2. Activities rollout: use webhooks to improve WIP freshness, not to replace data-ops architecture in one jump

Second recommended slice if the user wants faster WIP / recorded-time freshness.

- Verify the exact Clio subscription model names for time/expense activity in the live docs.
- When activity-capable models are confirmed, route them into **data-ops invalidation** first, using the existing data-ops stream and sync surfaces.
- Preferred first behaviour: mark WIP as stale / nudge refresh / optionally enqueue a narrow targeted sync for the affected date window or matter.
- Do **not** jump straight to a full webhook-driven rewrite of `syncWip()` or historical WIP reconciliation.

This slice is higher leverage than Contact because the repo already treats Clio activities as a dedicated data pipeline source, not a UI-only surface.

#### B3. Contacts / enquiry-adjacent rollout

Third slice.

- Reuse [server/utils/enquiries-stream.js](../../server/utils/enquiries-stream.js#L208-L223) for payload-light invalidation.
- Add reconciliation only where there is a deterministic mapping between Clio contact change and the local enquiry / instruction mirror that should change.
- Be careful about PII-heavy payloads and cross-database joins.

#### B4. Billing / collected-time rollout

Later slice.

- Only pursue if live webhook models line up cleanly with the collected-time pipeline and the operational need is real.
- This should likely mirror the Activities approach: invalidate / targeted sync first, deep merge later.

### Phase C — true reconciliation and replay (only after one selective slice proves out)

#### C1. Reconciliation engine

- For entities that justify it, fetch the authoritative Clio record on webhook receipt.
- Map the fields through the existing mirror contract rather than trusting partial webhook payloads.
- Apply idempotent upserts keyed by Clio object id + updated timestamp / delivery id.

#### C2. Delivery ledger + replay

- Add a lightweight inbound event ledger table or durable log with status transitions: received → verified → processed → failed → replayed.
- Add an operator-facing replay path for missed or failed deliveries.

#### C3. Multi-replica and dedupe hardening

- If webhook-triggered processing becomes more than UI invalidation, add cross-replica dedupe / coordination so multiple instances do not independently reconcile the same entity in divergent ways.

---

## 4. Step-by-step execution order

1. **Re-verify the live Clio webhook docs** before touching behaviour. Confirm subscription models, signature contract, headers, and delivery metadata.
2. **Ship Phase A**: audit envelope, idempotency key plan, subscription management script, operations notes.
3. **Pick exactly one rollout slice**:
   Matters first by default; Activities first only if the immediate goal is WIP freshness rather than matter freshness.
4. **For that slice, start with invalidate/refresh** using existing SSE and refresh paths.
5. **Only after the invalidate path is stable**, decide whether true reconciliation is worth the added complexity for that entity.
6. **If reconciliation is added**, route it through a single Clio fetch primitive and an explicit mirror-mapping layer.
7. **Only then broaden to the next entity family**.

Parallelisable work:
- subscription management script and operations docs can be done alongside audit-envelope work;
- entity-specific mapping notes can be prepared while Phase A hardening lands.

---

## 5. Verification checklist

**Phase A:**
- [ ] Live Clio docs re-checked immediately before build; header names and supported models confirmed.
- [ ] Inbound webhook deliveries produce a minimal audit record without storing raw PII payload bodies.
- [ ] Signature failures return the correct status and emit telemetry.
- [ ] Existing Matter invalidation still reaches `/api/matters/stream` and the app-shell/Home listeners.

**Matters slice:**
- [ ] Editing a matter in Clio causes Hub to refresh matters quickly without a manual reload.
- [ ] Duplicate deliveries do not produce duplicate downstream work.
- [ ] No auth/user-context regression on inbound webhook handling.

**Activities slice:**
- [ ] Activity-capable webhook models are confirmed against current Clio docs before coding.
- [ ] An activity webhook causes the relevant WIP freshness/invalidation path to move, without rewriting the whole data-ops sync engine.
- [ ] App Insights events clearly show whether the delivery only invalidated, queued a sync, or reconciled rows.

**Reconciliation phases:**
- [ ] Upserts are idempotent.
- [ ] Replay works for at least one failed delivery case.
- [ ] Multi-replica behaviour is explicit rather than accidental.

---

## 6. Open decisions (defaults proposed)

1. **Which entity family ships first?** — Default: **Matters**. Rationale: the bridge, SSE path, and user-visible value already exist.
2. **What is the second slice if Matters lands cleanly?** — Default: **Activities/WIP freshness**. Rationale: this is the next highest-value operational path already backed by the data-ops pipeline.
3. **Should webhook phases start with direct reconciliation?** — Default: **No**. Start with invalidate/refresh; reconcile only when the entity proves it benefits from faster SQL mirror convergence.
4. **Should Contact webhooks be early or late?** — Default: **Later**. Rationale: mapping and PII handling are more complicated than Matter invalidation.
5. **Do we treat webhook payloads as authoritative enough to write straight to SQL?** — Default: **No**. Use payloads as triggers; fetch fresh canonical records before mutating mirrors.
6. **Do we need a durable ledger from day one?** — Default: **Minimal ledger/audit envelope from day one**. Full replay tooling can wait until after the first selective slice.
7. **Do we require the Clio token-refresh consolidation first?** — Default: **No for invalidate-only; yes-ish for fetch-and-reconcile**. If a slice fetches from Clio, use or extend the shared primitive rather than adding another bespoke refresh path.

---

## 7. Out of scope

- Replacing every existing poller or scheduler with webhook-driven flows in one go.
- Subscribing to every possible Clio model on the first pass.
- Blindly trusting webhook payload bodies as complete mirror-write inputs.
- Re-architecting the entire WIP/collected-time data pipeline before any selective webhook slice proves value.
- Client-side delta merge of webhook payloads into React state as the first step.

---

## 8. File index (single source of truth)

Client:
- [src/index.tsx](../../src/index.tsx#L1625-L1662) — app-shell matters refresh hook.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx#L2726-L2733) — Home matters pulse wiring.
- [src/tabs/matters/MatterTableView.tsx](../../src/tabs/matters/MatterTableView.tsx) — downstream consumer of `helix:mattersChanged` refresh behaviour.

Server:
- [server/routes/clio-webhook.js](../../server/routes/clio-webhook.js#L1-L99) — existing inbound webhook bridge.
- [server/index.js](../../server/index.js#L546-L566) — mount order, raw-body constraint, auth ordering.
- [server/utils/matters-stream.js](../../server/utils/matters-stream.js#L23-L37) — current Matter invalidation channel.
- [server/utils/enquiries-stream.js](../../server/utils/enquiries-stream.js#L208-L223) — likely Contact/enquiry invalidation channel.
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js#L1-L19) — activities/WIP pipeline entry point.
- [server/utils/dataOps-stream.js](../../server/utils/dataOps-stream.js#L26-L41) — data-ops invalidation channel.
- [server/utils/clio-per-user-token.js](../../server/utils/clio-per-user-token.js#L1-L86) — shared Clio token helper candidate for fetch-and-reconcile phases.
- [server/routes/matter-operations.js](../../server/routes/matter-operations.js#L452-L457) — existing inline shared-token refresh path to avoid duplicating again.

Scripts / docs:
- [docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md](../../docs/notes/_archive/CLIO_WEBHOOK_BRIDGE.md) — shipped Phase A brief.
- [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md#L321-L370) — mirror contract and Activities API reference.
- `scripts/clio-subscribe.mjs` (NEW) — repeatable subscription management.
- [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md) — secret / rollout notes.
- [logs/changelog.md](../../logs/changelog.md) — entry per shipped phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: clio-webhook-reconciliation-and-selective-rollout
verified: 2026-04-24
branch: main
touches:
  client:
    - src/index.tsx
    - src/tabs/home/Home.tsx
    - src/tabs/matters/MatterTableView.tsx
  server:
    - server/routes/clio-webhook.js
    - server/index.js
    - server/utils/matters-stream.js
    - server/utils/enquiries-stream.js
    - server/routes/dataOperations.js
    - scripts/clio-subscribe.mjs
  submodules: []
depends_on: []
coordinates_with:
  - demo-mode-hardening-production-presentable-end-to-end
  - docs-transfer-review-ccl-review-fixes
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - session-probing-activity-tab-visibility-and-persistence
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with:
  - realtime-delta-merge-upgrade
  - realtime-multi-replica-safety
```

---

## 9. Gotchas appendix

- The current bridge is already correct about one important thing: raw-body signature verification requires early route mounting before the global JSON parser. Preserve that ordering.
- The webhook route currently gives freshness, not reconciliation. Do not oversell a Matter-only invalidation slice as if it solved mirror drift.
- Activities are not a trivial extension of Matters. In this repo, they flow into the WIP / data-ops subsystem, not just a tile pulse.
- Contact-style rollouts are more PII-sensitive than Matter invalidation. Keep payload logging minimal.
- The live Clio webhook docs were not fully extractable through static fetch in this session. Treat header names, model names, and retry details in this brief as **must re-verify** items before implementation.
- If a future slice fetches records from Clio on webhook receipt, do not create yet another bespoke token-refresh implementation.
