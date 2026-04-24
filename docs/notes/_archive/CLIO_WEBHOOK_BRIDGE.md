# Clio webhook bridge

> **Purpose of this document.** Self-contained brief any future agent can pick up cold. Adds an inbound webhook endpoint that receives Clio change notifications and re-broadcasts them onto the existing `matters` and (optionally) `enquiries` SSE streams. Closes the "external edit gap" left by R7 — currently a Clio-side change is invisible to Hub until the next polled refresh.
>
> **How to use it.** Read once. Phase A (endpoint + matters re-broadcast) is independently shippable and the highest-value piece. Phase B (richer payloads, contact/billing webhooks) is optional polish.
>
> **Verified:** 2026-04-19 against branch `main`. If >30 days later, re-verify file/line refs and Clio API doc URLs.

---

## 1. Why this exists (user intent)

Standing user direction: *"i just really want an app that feels realtime."*

R7 made every Hub-side mutation broadcast on a SSE channel. But Hub is not the only writer of matter / contact data — Cass and other ops users edit Clio directly via the Clio web UI. Today those edits do not surface in Hub until the next manual refresh or until a user re-opens the page. The user-perceived feel is: "I just changed it in Clio, why doesn't Hub know?"

Clio supports outbound webhooks ("subscriptions") on Matter, Contact, Activity, Bill, etc. Subscribing Hub to the relevant ones, then re-broadcasting on the existing `matters` stream, closes that gap with no client-side changes.

**Not in scope:** mutating Clio in response to Hub events (already covered by `matter-operations.js`); subscribing to every Clio entity (start small); payload-shape contract changes for downstream Hub clients.

---

## 2. Current state — verified findings

### 2.1 Existing matters stream

- [server/utils/matters-stream.js](../../server/utils/matters-stream.js) — exports `broadcastMattersChanged(payload)` and `attachMattersStream(router)`.
- Currently invoked from [server/routes/matter-operations.js](../../server/routes/matter-operations.js) at line 164 (DB-only create) and line 540 (Clio create).
- Client consumer: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) L2608 (`matters.changed`).

### 2.2 No inbound webhook surface

There is no `/api/clio/webhook` route. Clio outbound subscriptions point to nothing on the Hub server. Verified by grep: no `webhook`, `clio.subscription`, `subscriptions/post` strings in `server/routes/`.

### 2.3 Clio auth context already present

- [server/routes/clio.js](../../server/routes/clio.js) — token refresh, OAuth client, base URL.
- Token refresh logic is duplicated in 3 places (noted in R7 stash candidates) — out of scope for this brief but worth a separate consolidation.

### 2.4 Clio API references

- Subscriptions API: `POST /api/v4/subscriptions` (creates a webhook subscription on a model + events).
- Models worth subscribing initially: `Matter`, `Contact`. Optional later: `Activity`, `Bill`, `Communication`.
- Outbound payload includes `event` (`update`, `create`, `delete`, `restore`), `object_type`, `object_id`, and a `previous_attributes` diff. See [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md).

---

## 3. Plan

### Phase A — receive + re-broadcast (single PR)

**A1. New route** `server/routes/clio-webhook.js`:

```js
// POST /api/clio/webhook — receives Clio outbound webhook
// Verifies signature header, decodes payload, re-broadcasts on matters stream.
const express = require('express');
const crypto = require('crypto');
const { broadcastMattersChanged } = require('../utils/matters-stream');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();
const WEBHOOK_SECRET = process.env.CLIO_WEBHOOK_SECRET;

router.post('/clio/webhook', express.json({ limit: '256kb' }), (req, res) => {
  try {
    if (!verifyClioSignature(req)) {
      trackEvent('Clio.Webhook.SignatureInvalid', { headers: Object.keys(req.headers).join(',') });
      return res.status(401).send('invalid signature');
    }
    const { event, object_type, object_id } = req.body || {};
    trackEvent('Clio.Webhook.Received', { event, objectType: object_type, objectId: String(object_id) });
    if (object_type === 'Matter') {
      broadcastMattersChanged({
        source: 'clio-webhook',
        event,                  // 'update' | 'create' | 'delete' | 'restore'
        clioMatterId: object_id,
        triggeredBy: 'Clio',
      });
    }
    // Phase B will add Contact → enquiries / instructions broadcast here.
    return res.status(204).end();
  } catch (err) {
    trackException(err, { phase: 'clio-webhook-handler' });
    trackEvent('Clio.Webhook.Failed', { error: err.message });
    return res.status(500).send('handler error');
  }
});

function verifyClioSignature(req) {
  if (!WEBHOOK_SECRET) return true; // dev-mode escape; never deploy without setting secret
  const sig = req.header('X-Hub-Signature-256') || '';
  const body = JSON.stringify(req.body || {});
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  // timingSafeEqual to prevent timing attacks
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

module.exports = { router };
```

**A2.** Wire route in [server/index.js](../../server/index.js): `app.use('/api', require('./routes/clio-webhook').router);`.

**A3.** Add `CLIO_WEBHOOK_SECRET` to Key Vault + App Service config. Document in [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md).

**A4.** Subscribe Hub to Clio Matter events. One-off script `scripts/clio-subscribe.mjs`:

```
POST https://app.clio.com/api/v4/subscriptions
{ "data": { "model": "Matter", "events": ["update","create","delete","restore"], "url": "https://<hub-host>/api/clio/webhook" } }
```

Run once per environment (local dev → ngrok URL; staging; prod). Record the returned subscription id in Key Vault for later teardown.

**Phase A acceptance:**
- Edit a matter in Clio web UI → Hub `matters.changed` SSE fires within ~2 s.
- Hub `<LivePulse>` on the matters tile flashes.
- App Insights: `Clio.Webhook.Received` event with the right `objectType`.
- Invalid signature requests return 401 and log `Clio.Webhook.SignatureInvalid`.

### Phase B — broaden coverage (optional, ship later)

- Subscribe to `Contact` and re-broadcast on `enquiries` stream where the contact maps to a Hub enquiry.
- Subscribe to `Bill` / `Activity` and broadcast on `outstandingBalances` / `dataOps` streams.
- Add a small audit log table `ClioWebhookEvents` for replay during outages.

---

## 4. Step-by-step execution order

1. **A1** — write `server/routes/clio-webhook.js`.
2. **A2** — wire into `server/index.js`.
3. **A3** — set `CLIO_WEBHOOK_SECRET` in Key Vault (dev → staging → prod). Coordinate with Cass for the prod cutover.
4. **A4** — run subscribe script per environment.
5. **Verify** end-to-end in dev with ngrok before staging.
6. Ship Phase A. Phase B is a separate brief if/when needed.

---

## 5. Verification checklist

**Phase A:**
- [ ] Local dev: ngrok tunnel + Clio sandbox subscription works.
- [ ] Edit a sandbox matter in Clio → Hub matters tile pulses within 2 s.
- [ ] App Insights: `Clio.Webhook.Received` events visible.
- [ ] Bad signature → 401, `Clio.Webhook.SignatureInvalid` event.
- [ ] Subscription id stored in Key Vault for teardown.

---

## 6. Open decisions (defaults proposed)

1. **Signature header name** — Default: `X-Hub-Signature-256` (Clio convention as of 2025-Q3). Verify against current Clio docs before deploy.
2. **Phase A scope: Matter only or Matter+Contact?** — Default: Matter only. Smallest blast radius; Contact joins Phase B.
3. **Replay strategy on missed webhooks (server restart)** — Default: rely on existing nightly Clio→Hub sync to backfill. Audit log (Phase B) only if drift becomes user-visible.
4. **Secret rotation cadence** — Default: every 90 days, manual via Key Vault. Subscription URL is invariant, secret swap is invisible to Clio.

---

## 7. Out of scope

- Mutating Clio from this route (already handled by `matter-operations.js`).
- Consolidating the 3 duplicated Clio token-refresh paths (separate stash candidate from R7).
- True delta-merge of Clio payloads into Hub state (covered by the future Phase E delta-merge brief). Phase A is notification-only.
- `enquiries` stream — held for Phase B.

---

## 8. File index (single source of truth)

Client: none.

Server:
- `server/routes/clio-webhook.js` (NEW) — endpoint
- [server/index.js](../../server/index.js) — wire route
- [server/utils/matters-stream.js](../../server/utils/matters-stream.js) — re-used
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — telemetry

Scripts / docs:
- `scripts/clio-subscribe.mjs` (NEW) — one-off subscription registration
- [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md) — document `CLIO_WEBHOOK_SECRET`
- [.github/instructions/CLIO_API_REFERENCE.md](../../.github/instructions/CLIO_API_REFERENCE.md) — webhook payload shape
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: clio-webhook-bridge
shipped: true
shipped_on: 2026-04-19
verified: 2026-04-19
branch: main
touches:
  client: []
  server:
    - server/routes/clio-webhook.js   # new
    - server/index.js
    - scripts/clio-subscribe.mjs       # new
  submodules: []
depends_on: []
coordinates_with:
  - home-realtime-channel-migration   # client-only; this brief is server-only; no overlap but both compound the realtime story
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Express body parser order matters.** Signature is computed over the raw body; if `express.json()` runs before this route at the app level, the verification path needs `express.raw({ type: 'application/json' })`. Either mount this route BEFORE the global `app.use(express.json())`, or capture raw body via a `verify` callback on the global parser. Test the signature path before merging.
- **Clio subscription URLs are immutable.** To change the URL, delete the subscription and create a new one. Plan secret rotation around URL stability.
- **ngrok in dev**: free-tier URLs change on every restart, which means re-subscribing each time. For sustained dev work, use a paid static subdomain or a sandbox subscription that points at a long-lived dev tunnel.
- **Do not log payload bodies.** Clio webhook payloads contain client PII. Track event names + object ids only — see Copilot Data Handling rules in `.github/copilot-instructions.md`.
- **Multi-replica safety.** Every replica receives every webhook (Clio fans out to one URL → load-balanced) so each replica's local SSE clients get notified. No coordination needed UNTIL R7's notification-only model becomes delta-merge — then replicas need pub/sub. Out of scope here.
- **Don't subscribe to `Communication`** until you have agreed PII handling — those payloads include email subjects.
