# CCL backend chain — silent autopilot service

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

> **Supersession note (2026-04-22).** Phase B (Home pickup affordance) has been *partially superseded* by [HOME_TODO_SINGLE_PICKUP_SURFACE](HOME_TODO_SINGLE_PICKUP_SURFACE.md). PT-flagged CCL reviews now land on `dbo.hub_todo` (helix-operations) via `server/routes/ccl.js` → `hubTodoLog.createCard({ kind: 'review-ccl' })`, and will surface on the Home ImmediateActionsBar (A7 tray UI). The matters-box row is **no longer the sole** pickup surface — the hub_todo registry is the durable, owner-scoped spine. The existing `openHomeCclReview` event + `MatterOpenedHandoff` + `pendingShowCcl` deep-link remain in place as the realtime channel. Do not remove them. Treat B1/B2 below as a *visual compounding* opportunity on top of the registry rather than the primary wiring.

---

## 1. Why this exists (user intent)

During CCL demo prep, the user said:

> *"the CCL is something that should be a backend service running fully in the background and notifying users via teams cards and email. they should not be expected to use the UI as the standard route, only as the exception."*

And:

> *"the matters box on Home should be a pickup surface — when a CCL is ready for review the fee earner sees it there with one click to open the rail."*

The ND auto-upload piece of this chain has already shipped (changelog 2026-04-19, `CCL_AUTO_UPLOAD_ND` flag). What remains is everything that turns CCL generation into a true silent autopilot: notify the fee earner when a draft is ready, give them a one-click pickup affordance from Home, and only force them into the editor when something is genuinely wrong.

The user is **not** asking to redesign the editor itself. The editor stays — it just becomes the exception path, not the default.

---

## 2. Current state — verified findings

### 2.1 Generation paths converging on `/api/ccl/service/run`

- File: [server/routes/ccl.js](../../server/routes/ccl.js) L967 — `POST /api/ccl/service/run` is the single chokepoint. It compiles context → runs AI fill → persists snapshot → fires background pressure test → fires background ND auto-upload (new, behind `CCL_AUTO_UPLOAD_ND=1`).
- Callers: matter-opening pipeline ([src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) L603), Home prewarm + manual rerun + override path ([src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L2639 `runHomeCclAiAutofill`).
- Anything we add to this handler runs for every generation path automatically.

### 2.2 Notification gap — no Teams card, no email

- File: [server/utils/notifyTeams.js](../../server/utils/notifyTeams.js) — Teams webhook helper exists (used by enquiries, attendance reminders).
- File: [server/utils/sendEmail.js](../../server/utils/sendEmail.js) — Microsoft Graph email helper exists (used by deal capture, matter-opening confirmations).
- Neither is called from `/service/run` or its background hooks. No telemetry event `CCL.Notification.*` exists in App Insights.

### 2.3 Home matters box is not a pickup surface for CCL

- File: [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — matters tile renders recent matters but does not surface CCL state.
- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L2639+ — `runHomeCclAiAutofill` exists, and the modal opens on `cclLetterModal` state, but no Home affordance flips this directly. The `pendingShowCcl` window-event hook (search `pendingShowCcl` in OperationsDashboard) is wired but rarely triggered from Home.

### 2.4 `pendingShowCcl` already plumbed but inactive

- File: [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — searches for `pendingShowCcl` show a setter and a consumer effect that opens `cclLetterModal` when set. Need to dispatch from Home + persist across navigation.

---

## 3. Plan

> **Status (2026-04-19):** Phase A 🟢 shipped (Teams DM to Luke only, gated). Phase B 🟢 pre-existing: OperationsDashboard already renders a live CCL step-strip per matter in its recent-matters list (`cclMap` + `getCanonicalCclStage`), and an `openHomeCclReview` window event listener + `reviewRequest` prop are both in place (L4213–L4263). What remained was (1) App-level deep-link parsing, and (2) a post-matter-opening handoff surface that shows live CCL state. Both are covered by Phase C below.

### Phase A — Notify fee earner when draft is ready (independently shippable)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | After `persistCclSnapshot` in `/service/run`, queue Teams card + email | [server/routes/ccl.js](../../server/routes/ccl.js) | Fire-and-forget like the ND upload. Gated by `CCL_AUTO_NOTIFY_FEE_EARNER=1`. Skip if `unresolvedCount > 0` or `confidence === 'fallback'`. |
| A2 | New helper `notifyCclReady({ matterId, matterDisplayNumber, feeEarnerEmail, clientName, ndDocumentId, reviewUrl })` | NEW [server/utils/cclNotifications.js](../../server/utils/cclNotifications.js) | Sends Teams adaptive card (matter ref, client, confidence, link to review rail) + email with same body. Telemetry: `CCL.Notification.{Teams,Email}.{Sent,Failed}`. |
| A3 | Build `reviewUrl` deep link | helper | Format: `https://<host>/?tab=operations&cclMatter=<matterId>&autoReview=1`. Hub already supports tab + state via query params (App.tsx). |
| A4 | Resolve fee earner email | helper | Use `preview.contextFields.feeEarnerEmail` already computed in `/service/run`. Fallback to team table lookup by initials. |

**Phase A acceptance:**
- After a CCL service run completes, the fee earner gets a Teams card and email within ~10s.
- Clicking the card opens Hub → Operations → CCL review rail for that matter.
- App Insights shows `CCL.Notification.*.Sent` events.
- If notifications fail, generation succeeds anyway (fire-and-forget).

### Phase B — Home pickup affordance

#### B1. Matters tile shows CCL state

Extend the matters tile in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) to render a small CCL chip when the matter has a draft awaiting review (`ccl.status === 'draft'` and `unresolvedCount === 0`). Chip styles: dark surface, accent dot, label "CCL ready". On click → dispatch `helix:openCclReview` window event with matterId.

Data source: reuse `cclMap` from `useCclStatusForMatters` (already in OperationsDashboard; lift to a shared hook in `src/hooks/useCclStatusForMatters.ts`).

#### B2. Listen for `helix:openCclReview` from anywhere

In OperationsDashboard, add a window event listener that:
1. Switches active tab to Operations
2. Sets `cclLetterModal = matterId`
3. Sets `pendingShowCcl` for the auto-review trigger

#### B3. Activate `pendingShowCcl` from Teams deep-link

When Hub loads with `?cclMatter=<id>&autoReview=1`, dispatch `helix:openCclReview` after auth resolves.

### Phase C — Telemetry + observability (🟢 shipped 2026-04-19)

- `CCL.AutopilotChain.Started` (sync at chain entry) and `CCL.AutopilotChain.Completed` (once ND+notify resolve) now emit from [server/routes/ccl.js](../../server/routes/ccl.js) L1103. ND + Teams DM hooks were refactored from two parallel `setImmediate` blocks into one chained flow so the notification can reference the ND document id (resolves the gotcha in §9) and the rollup sees every stage outcome.
- Each chain event tags `persistStage`, `ndStage` (+`ndReason`, `ndDocumentId`), `notifyStage` (+`notifyReason`), `allGreen`, `chainDurationMs`, `confidence`, `unresolvedCount`. Terminal good = `allGreen=true` where `succeeded` or `skipped` both count as non-failed.
- `trackMetric('CCL.AutopilotChain.Duration', ...)` for latency distribution.
- KQL runbook: [docs/PLATFORM_OPERATIONS.md](../../docs/PLATFORM_OPERATIONS.md) → "CCL autopilot chain — KQL runbook". Queries: 24h success rate, per-stage breakdown, failure drill-down, latency p50/p90/p99, drop-off detection, and suggested alert thresholds.

### Phase D — Matter-opened handoff surface (🟢 shipped 2026-04-19)

**Problem:** After matter opening succeeds, the processing panel auto-closes at 1.5–2s, swallowing the CCL service outcome. Users can't see whether the draft landed, whether pressure-test flagged anything, or whether ND upload succeeded. Demo-mode experience is the same as real: indistinguishable, no live transition.

**Solution:**
1. Keep `processingOpen=true` after success; dismissal is user-initiated.
2. Render `MatterOpenedHandoff` inside the processing panel (new component at [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx)).
3. Handoff polls `/api/ccl/batch-status` every 4s for the opened matter ID, surfacing real state: Compile → Generate → Pressure test → Review ready / Needs attention.
4. Primary CTA: **Open review rail** dispatches `openHomeCclReview` event. Secondary: **Go to matter**. Tertiary when draft missing: **Retry autopilot** re-fires `/service/run`.
5. Failure path: if CCL never appears within ~90s, show "CCL autopilot skipped" with retry, not a silent dead-end.

**Important constraint (from user):** demo mode runs real `/service/run` against matter `3311402`. Do NOT fake the state — surface whatever the service actually returns for that matter, including failures or fallback confidence.

### Phase E — App-level deep-link (🟢 shipped 2026-04-19)

Teams card URL format: `?tab=operations&cclMatter=<id>&autoReview=1`. App.tsx now parses on mount, dispatches `openHomeCclReview`, navigates to home, and strips the query params via `history.replaceState`.

---

## 4. Step-by-step execution order

1. **A1+A2+A3+A4** — All in one PR. Ship behind flag, validate in staging with one matter.
2. *(after A is stable)* **B1** — Home tile chip (visual only, doesn't change behaviour).
3. **B2** — Window event listener.
4. **B3** — Deep-link auto-review.
5. **C** — Telemetry rollup + runbook.

---

## 5. Verification checklist

**Phase A:**
- [ ] Setting `CCL_AUTO_NOTIFY_FEE_EARNER=1` and running a generation produces a Teams card in the fee earner's chat.
- [ ] Email arrives at `feeEarnerEmail` with matching body and review link.
- [ ] App Insights: `CCL.Notification.Teams.Sent` and `CCL.Notification.Email.Sent` events.
- [ ] Setting `CCL_AUTO_NOTIFY_FEE_EARNER=0` (or unset) suppresses notifications without affecting generation.

**Phase B:**
- [ ] Home matters tile shows "CCL ready" chip when draft exists.
- [ ] Clicking chip opens Operations tab → CCL review rail in <500ms.
- [ ] Teams card link opens Hub directly into the review rail.

**Phase C:**
- [ ] `CCL.AutopilotChain.Completed` count tracks generation count over 24h with <5% drop-off.

---

## 6. Open decisions (defaults proposed)

1. **Notification template tone** — Default: **factual, link-led, single CTA**. Rationale: matches existing Teams cards (deal capture, attendance). User dislikes noisy/warning UI.
2. **Notify on partial confidence?** — Default: **yes, but with explicit "review needed" framing**. Rationale: better than silent failure; fee earner knows AI was unsure.
3. **Home tile chip placement** — Default: **inline next to matter title**. Avoid adding new column.
4. **Email format** — Default: **HTML with plaintext fallback, single Helix-branded button**. Reuse `sendEmail.js` template helper.

---

## 7. Out of scope

- Editor/review-rail UX changes (covered by `ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity`).
- Prompt iteration / template improvement loop (covered by `ccl-prompt-feedback-loop-self-driving-template-improvement`).
- Multi-recipient notifications (e.g. supervising solicitor) — phase D, not now.
- SMS / mobile push.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — matters tile (Phase B1)
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — `cclLetterModal`, `pendingShowCcl`, `runHomeCclAiAutofill` (Phase B2/B3)
- [src/app/App.tsx](../../src/app/App.tsx) — query-param routing + tab activation (Phase B3)

Server:
- [server/routes/ccl.js](../../server/routes/ccl.js) — `/service/run` hook (Phase A1)
- [server/utils/cclNotifications.js](../../server/utils/cclNotifications.js) (NEW) — Teams + email helper (Phase A2)
- [server/utils/notifyTeams.js](../../server/utils/notifyTeams.js) — existing helper, reuse
- [server/utils/sendEmail.js](../../server/utils/sendEmail.js) — existing helper, reuse

Scripts / docs:
- [docs/PLATFORM_OPERATIONS.md](../../docs/PLATFORM_OPERATIONS.md) — KQL runbook (Phase C)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: ccl-backend-chain-silent-autopilot-service
shipped: true
shipped_on: 2026-04-24
verified: 2026-04-19
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/app/App.tsx
  server:
    - server/routes/ccl.js
    - server/utils/cclNotifications.js
    - server/utils/notifyTeams.js
    - server/utils/sendEmail.js
  submodules: []
depends_on: []
coordinates_with:
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ui-responsiveness-hover-scroll-and-tab-navigation
conflicts_with: []
```

---

## 9. Gotchas appendix

- The ND auto-upload (already shipped) and the new notification chain both run in `setImmediate` after `persistCclSnapshot`. Ordering matters: notification should reference `ndDocumentId`, so either (a) await the upload before notifying, or (b) accept that the first notification may not yet contain the ND link and let the next save event update it. Default is (a) — chain them in one helper.
- `feeEarnerEmail` in `preview.contextFields` is sometimes missing for older instructions — fall back to the team table lookup; do not silently skip.
- Teams adaptive cards must use the schema version supported by the existing webhook (check `notifyTeams.js`); raw markdown won't render.
- Deep-link auto-open MUST clear the `?cclMatter` query param after activation, otherwise refresh re-triggers it endlessly.
- The `pendingShowCcl` setter is currently only consumed inside OperationsDashboard. Ensure the consumer fires AFTER `cclLetterModal` is set, not before, or the modal's `useEffect` will see a stale matterId.
