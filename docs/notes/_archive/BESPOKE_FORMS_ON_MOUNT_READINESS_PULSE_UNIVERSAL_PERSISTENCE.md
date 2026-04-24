# Bespoke forms — on-mount readiness pulse + universal persistence

> **Purpose.** Every bespoke form in `src/CustomForms/` must (a) run a silent readiness probe against its submit endpoint the moment it mounts, render a subtle "checking → ready" cue that dissolves smoothly on success so users know before they start typing that the form will fire; and (b) persist its submission to the Helix Operations Platform `form_submissions` table so every entry is retrievable in the FormsHub right-rail and Activity feed. The readiness infrastructure (`/api/form-health/:formId`, `FORM_CHECKS` registry, `FormHealthCheck` admin panel) already exists and just needs to be wired per-form. The persistence helper (`server/utils/formSubmissionLog.js`) is live on `helix-operations`; 6 of the ~16 bespoke forms already write through it — this brief closes the remaining 10.
>
> **Verified:** 2026-04-21 against branch `main`, post-relocation.

---

## 1. Why this exists (user intent)

From the user (verbatim, session 2026-04-21):

> *"for all bespoke forms, please scope an on-entry pulse check to ensure all routes are ready and have all forms indicate subtly a little subtle processing cue, animating into a 'tick'/confirmation signal that subtle and shortly disappears smoothly. simply to indicate the route has been checked and the form will defo fire, if theres a problem then users wont even bother submitting. you see? ensure all bespoke form entries are persisted."*

Translation into acceptance criteria:

- **Readiness pulse.** On form mount, silently probe the form's server endpoint. Render a small cue (dot or chip) that pulses `checking` → animates into a ✓ → dissolves smoothly (~1.5s total). If the probe fails, the cue stays visible as a muted warning rather than fading — user can still submit, but knows something's off.
- **Universal persistence.** Every bespoke form entry lands in `helix-operations.dbo.form_submissions` with structured payload, processing_status, and step history. No form is allowed to drop entries.
- **Invisible on happy path.** The readiness cue is never a blocker, never gated, never loud. It is a reassurance signal — "the pipe is clean, go ahead".

Out of scope (parked below, §7):

- Redesigning any form's field layout, validation, or submit button.
- Adding new forms or changing where they're mounted.
- Changing the L&D / Undertaking / Complaint routing logic (that is [forms-ia-ld-undertaking-complaint-flow](FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW.md)).
- Retrigger / draft retention UX (that is [forms-stream-persistence](FORMS_STREAM_PERSISTENCE_PLAN.md)).

---

## 2. Current state — verified findings

### 2.1 Existing readiness infrastructure

Already built, mounted, and exercised by the admin panel. This brief only consumes it:

- [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js) — declares `FORM_CHECKS` array. Each entry: `{ id, label, target: { route }, method: 'OPTIONS' | 'GET' }`. Exposes `GET /api/form-health` (all) and `GET /api/form-health/:formId` (one). Non-destructive — uses `verifyMountedEndpoint()` which typically issues `OPTIONS` so the probe never writes.
- [server/index.js](../../server/index.js) L387, L671 — route mounted as `/api/form-health`.
- [src/CustomForms/shared/FormHealthCheck.tsx](../../src/CustomForms/shared/FormHealthCheck.tsx) — existing admin panel component (renders the full matrix in batch). Reference for how the endpoint responds; **not the surface this brief uses** (we want per-form inline cues, not a panel).
- [server/routes/routeHealth.js](../../server/routes/routeHealth.js) L60-L75 — aggregator wiring already includes `/api/form-health` under id `form-health`.

**Gap:** the infrastructure exists but is only surfaced in an admin-only panel. No bespoke form runs a pulse on its own mount.

### 2.2 Bespoke form inventory — readiness + persistence status

| # | Form (file) | Form id | Submit endpoint | In `FORM_CHECKS`? | Persists to `form_submissions`? |
|---|-------------|---------|-----------------|-------------------|---------------------------------|
| 1 | [TechIdeaForm.tsx](../../src/CustomForms/TechIdeaForm.tsx) | `tech-idea` | POST `/api/tech-tickets/idea` | ✅ (`tech-tickets`) | ✅ via techTickets.js |
| 2 | [TechProblemForm.tsx](../../src/CustomForms/TechProblemForm.tsx) | `tech-problem` | POST `/api/tech-tickets/problem` | ✅ (`tech-tickets`) | ✅ via techTickets.js |
| 3 | [LearningDevelopmentForm.tsx](../../src/CustomForms/LearningDevelopmentForm.tsx) | `learning-dev-plan` / `learning-dev-activity` | POST `/api/registers/learning-dev`, `/api/registers/learning-dev/activity` | partial | ✅ via registers.js |
| 4 | [UndertakingForm.tsx](../../src/CustomForms/UndertakingForm.tsx) | `undertaking` | POST `/api/registers/undertakings` | partial | ✅ via registers.js |
| 5 | [ComplaintForm.tsx](../../src/CustomForms/ComplaintForm.tsx) | `complaint` | POST `/api/registers/complaints` | partial | ✅ via registers.js |
| 6 | [CounselRecommendationForm.tsx](../../src/CustomForms/CounselRecommendationForm.tsx) | `counsel-recommendation` | POST `/api/counsel` | ✅ (`counsel`) | ❌ |
| 7 | [ExpertRecommendationForm.tsx](../../src/CustomForms/ExpertRecommendationForm.tsx) | `expert-recommendation` | POST `/api/experts` | ✅ (`experts`) | ❌ |
| 8 | [BundleForm.tsx](../../src/CustomForms/BundleForm.tsx) | `bundle` | POST `/api/bundle` | ? | ❌ |
| 9 | [BookSpaceForm.tsx](../../src/CustomForms/BookSpaceForm.tsx) | `book-space` | POST `/api/book-space/*` | ✅ (`book-space`) | ❌ |
| 10 | [NotableCaseInfoForm.tsx](../../src/CustomForms/NotableCaseInfoForm.tsx) | `notable-case-info` | POST `REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH` (Azure Fn, external) | ✅ (`notable-case-info`) | ❌ (external endpoint — persistence must happen on a proxy route; see §3 C5) |
| 11 | [TransactionIntake.tsx](../../src/CustomForms/TransactionIntake.tsx) | `transactions-v2` | POST `/api/transactions-v2` | ? | ❌ |
| 12 | [AnnualLeaveForm.tsx](../../src/CustomForms/AnnualLeaveForm.tsx) | `annual-leave-request` | POST `/api/attendance/annual-leave` | ? | ❌ |
| 13 | [AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) | `annual-leave-admin` | POST `/api/attendance/annual-leave`, `/admin/annual-leave` | ? | ❌ |
| 14 | [AnnualLeaveApprovals.tsx](../../src/CustomForms/AnnualLeaveApprovals.tsx) | `annual-leave-approval` | PATCH approvals | ? | ❌ |
| 15 | [AnnualLeaveBookings.tsx](../../src/CustomForms/AnnualLeaveBookings.tsx) | `annual-leave-booking` | POST booking | ? | ❌ |
| 16 | [AnnualLeaveHistory.tsx](../../src/CustomForms/AnnualLeaveHistory.tsx) | `annual-leave-history` | DELETE only | N/A (read/delete) | N/A |
| 17 | [BespokeForms.tsx](../../src/CustomForms/BespokeForms.tsx) `BespokeForm` generic | varies (e.g. `financial-task`) | POST (per form) | ✅ (`financial-task`) | ❌ |

Summary: **4 endpoints already probed + persisted** (tech-idea, tech-problem, learning-dev variants, undertaking, complaint). **10 bespoke forms need persistence wiring.** ~4-6 forms not yet in `FORM_CHECKS` (bundle, transactions-v2, annual-leave variants).

### 2.3 Persistence helper

- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) — post-relocation two-stage gate (`OPS_PLATFORM_ENABLED=true` + `OPS_SQL_CONNECTION_STRING`; rollback `FORM_SUBMISSIONS_USE_LEGACY=true`). Exports `recordSubmission`, `recordStep`, `markComplete`, `markFailed`, `loadSubmission`, `bumpRetrigger`, `archiveSubmission`. Uses lazy per-call `getConnStr()` (KV timing).
- Shape of `recordSubmission(entry)`: `{ id, form_key, submitted_by, submitted_at, lane, summary, payload_json, processing_status }`.
- Payloads live in `dbo.form_submissions.payload_json` (nvarchar(max)); steps in `processing_steps_json`.

### 2.4 Client read surface

- [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) L20-40 — `ProcessStreamItem` shape (submissionId, formKey, payloadAvailable, steps[], retriggerCount).
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) L861-930 — right-rail renders `ProcessStreamItem`s from `/api/process-hub/submissions`. Every new persisted form automatically shows up here once wired.

### 2.5 Existing cue vocabulary — don't reinvent

- [docs/COMPONENT_STYLE_GUIDE.md](../COMPONENT_STYLE_GUIDE.md) — toast + status colour conventions.
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — `--helix-green` (#20b26c ready), `--helix-highlight` (#3690CE checking), `--helix-orange` (#FF8C00 degraded).
- Existing pattern: Home's backing warm-indicator pulse (see `OperationsDashboard.tsx` `opsBillingComplete` keyframes) — 1.7s fade-in → hold → fade-out, re-keyed via data-attribute nonce.

---

## 3. Plan

### Phase A — Shared readiness hook + cue component (new, tiny)

**A1.** Create [src/CustomForms/shared/useFormReadinessPulse.ts](../../src/CustomForms/shared/useFormReadinessPulse.ts) (new):

```ts
type PulseState = 'idle' | 'checking' | 'ready' | 'degraded';

export function useFormReadinessPulse(formId: string): {
  state: PulseState;
  detail?: string;  // failure reason when degraded
} {
  // Mount → GET /api/form-health/:formId with 3s timeout + AbortController
  // Map response.ok === true → 'ready' (after 400ms minimum so the animation reads)
  // Map response.ok === false or timeout → 'degraded' with detail = response.error
  // No retry. If probe fails, UI can still submit; cue communicates the risk.
}
```

**A2.** Create [src/CustomForms/shared/FormReadinessCue.tsx](../../src/CustomForms/shared/FormReadinessCue.tsx) (new):

- Renders a small 14-16px anchor point (top-right of form header or next to the title — form decides). States:
  - `checking` — muted highlight dot with a 1.4s slow pulse (no text).
  - `ready` — dot animates into ✓ glyph over ~220ms (CSS transform + mask), holds for ~650ms, then dot + ✓ fade out together over ~320ms. Component unmounts the cue after total ~1.2s on the ready path, leaving zero footprint.
  - `degraded` — dot turns `--helix-orange`, stays visible. Hover tooltip shows `detail`. Does not disappear.
- No interaction; `aria-live="polite"` announces "Form ready" once on `checking → ready`.
- `prefers-reduced-motion` — skip the pulse + glyph animation, snap to ✓ and fade instantly.

**A3.** Add unit test stub `src/CustomForms/shared/__tests__/useFormReadinessPulse.test.ts` covering: happy path transitions to `ready`, 3s timeout → `degraded`, `response.ok === false` → `degraded`, unmount cancels in-flight fetch.

### Phase B — Wire the cue into every bespoke form (1-line per form)

Each bespoke form gets:

```tsx
const readiness = useFormReadinessPulse('<form-id>');
// …
<FormReadinessCue state={readiness.state} detail={readiness.detail} />
```

**B1–B10.** Wire into forms #1–#15 in the §2.2 table (skip #16 `AnnualLeaveHistory` — read/delete only, no readiness relevance). Use the form id that matches the `FORM_CHECKS` entry.

**B11.** For forms missing a `FORM_CHECKS` entry (bundle, transactions-v2, annual-leave-* variants, BespokeForm generic variants), add an entry to [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js) `FORM_CHECKS` with `method: 'OPTIONS'` and the correct route. For endpoints that don't support OPTIONS, fall back to a HEAD probe or a new dedicated `/api/<route>/health` endpoint returning `{ ok: true }` cheaply.

**B12.** Update [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js) to short-circuit per-form GETs with a <200ms total budget (probe can stack with page load — must be fast).

### Phase C — Universal persistence wiring (server side)

For each form in §2.2 marked ❌ persists, add `recordSubmission` + `markComplete`/`markFailed` calls to its server route, following the pattern already used in [server/routes/registers.js](../../server/routes/registers.js) and [server/routes/techTickets.js](../../server/routes/techTickets.js).

**C1. CounselRecommendationForm → `/api/counsel`** — add `recordSubmission({ form_key: 'counsel-recommendation', submitted_by, lane: 'Request', summary: <counsel name>, payload_json: body })` at route entry; `markComplete` on DB insert success with step `counsel.insert`.

**C2. ExpertRecommendationForm → `/api/experts`** — same shape, `form_key: 'expert-recommendation'`.

**C3. BundleForm → `/api/bundle`** — `form_key: 'bundle'`, `lane: 'Request'`.

**C4. BookSpaceForm → `/api/book-space/*`** — `form_key: 'book-space'`, `lane: 'Log'`, summary includes space + date range. Note: booking is keyed per type (desk, meeting room) — capture `type` in the payload but keep one `form_key`.

**C5. NotableCaseInfoForm → Azure Fn (external)** — cannot persist server-side from client. Add a thin proxy route `POST /api/notable-case-info` in [server/routes/notableCaseInfo.js](../../server/routes/notableCaseInfo.js) (new) that:

  1. Calls `recordSubmission`.
  2. Forwards to the Azure Fn URL (read from env) server-side.
  3. `markComplete` on Fn 2xx, `markFailed` on Fn error with the Fn's body captured in `last_event`.
  4. Repoint the form's submit handler away from the Azure Fn URL to this proxy.
  
  Kill-switch-safe: if `OPS_PLATFORM_ENABLED !== 'true'`, the proxy still forwards to the Fn (persistence is a best-effort side-effect, never a blocker).

**C6. TransactionIntake → `/api/transactions-v2`** — `form_key: 'transactions-v2'`, `lane: 'Request'`, summary = matter ref + counterparty.

**C7. AnnualLeave* (4 forms) → `/api/attendance/*`** — wire at the attendance route layer. Distinct `form_key` per user action: `annual-leave-request`, `annual-leave-booking`, `annual-leave-approval`. `AnnualLeaveHistory` delete calls `archiveSubmission(id)` instead of a new row.

**C8. BespokeForms.tsx generic `BespokeForm`** — touches multiple endpoints (financial-task, etc.). Wire persistence at each target endpoint server-side rather than inside the generic renderer; each target already has its own route file.

**C9.** Every new `recordSubmission` call MUST tolerate helper failure silently — never 500 a user-facing route because the log table is down. Pattern from `registers.js`:

```js
try {
  await recordSubmission({ /* … */ });
} catch (err) {
  // non-blocking — log telemetry, continue
  trackException(err, { component: 'CounselRoute', operation: 'recordSubmission' });
}
```

### Phase D — Verification

- **D1.** After B+C, the Activity feed sources `{forms.submission}` count visibly rises across the 10 newly-wired forms. Confirm via `/api/activity-feed?limit=50`.
- **D2.** FormsHub right-rail (`/api/process-hub/submissions`) shows items for every persisted form (not just learning-dev / tech-tickets / undertaking / complaint).
- **D3.** Per-form on-mount render: expected timing budget <220ms to probe completion on warm backend, <1s cold. Cue total on-screen time on happy path ~1.2s.
- **D4.** Simulate a degraded route (temporarily break `/api/counsel` OPTIONS) — cue stays orange; submit still works; `form_submissions` still records on the real POST.
- **D5.** Kill-switch verification — set `OPS_PLATFORM_ENABLED=false`, confirm every form still submits successfully; `recordSubmission` calls become no-ops; cue state is driven only by readiness probe (unaffected by persistence gate).

---

## 4. Rollback

No DB migrations in this brief. Rollback is purely code-level:

1. Each Phase C wiring sits behind a `try/catch` that already tolerates failure. To roll back a single form's persistence, remove the `recordSubmission` block from its route.
2. To roll back the readiness cue globally, remove `<FormReadinessCue>` from individual forms OR set a single env flag `REACT_APP_DISABLE_FORM_READINESS_PULSE=true` (read inside `useFormReadinessPulse`, returns `'idle'` immediately).
3. To roll back the persistence layer entirely: set `FORM_SUBMISSIONS_USE_LEGACY=true` — reverts every helper call to the legacy DB (already implemented in the predecessor brief).

---

## 5. Verification checklist (post-ship)

- [ ] `FORM_CHECKS` entry exists for every form in §2.2 (except #16 read-only).
- [ ] `useFormReadinessPulse` and `FormReadinessCue` present under `src/CustomForms/shared/`.
- [ ] Unit tests for the hook green.
- [ ] Each of the 15 forms (B1–B10, plus the 5 already partially wired) renders `<FormReadinessCue>` and the pulse fires on mount.
- [ ] Every form in §2.2 persists to `form_submissions` on submit (verified by submitting a test entry and querying `SELECT TOP 10 form_key, submitted_at FROM dbo.form_submissions ORDER BY submitted_at DESC`).
- [ ] `prefers-reduced-motion` honoured.
- [ ] Kill-switch + rollback flags behave as described in §4.
- [ ] `/api/form-health/:formId` p95 <200ms on warm backend.

---

## 6. File index

- Read: [server/routes/formHealthCheck.js](../../server/routes/formHealthCheck.js), [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js), [src/CustomForms/shared/FormHealthCheck.tsx](../../src/CustomForms/shared/FormHealthCheck.tsx), all files in [src/CustomForms/](../../src/CustomForms/).
- Modify: every bespoke form file in §2.2 (JSX hook + cue), server route files for forms in §2.2 marked ❌ persists.
- Create:
  - `src/CustomForms/shared/useFormReadinessPulse.ts`
  - `src/CustomForms/shared/FormReadinessCue.tsx`
  - `src/CustomForms/shared/FormReadinessCue.module.css` (or collocated keyframes)
  - `src/CustomForms/shared/__tests__/useFormReadinessPulse.test.ts`
  - `server/routes/notableCaseInfo.js` (proxy) — only if C5 proceeds.

---

## 7. Parked follow-ups

- **P1.** Retroactive cue for `FormHealthCheck` admin panel — surface the same pulse vocabulary in the matrix.
- **P2.** Per-form circuit-breaker — if `/api/form-health/:formId` returns degraded 3 times in a row within 5 minutes, raise an App Insights `FormReadiness.Degraded.Persistent` event. Owner: platform ops.
- **P3.** Pre-submit re-probe — if the user sits on a form for >60s, re-run the probe silently before submit. Useful for long intake forms.
- **P4.** Extract an `<FormShell>` wrapper that bakes in readiness cue + telemetry + persistence breadcrumb so future bespoke forms opt in with one import. Coordinates with the `BespokeForm` generic renderer in [BespokeForms.tsx](../../src/CustomForms/BespokeForms.tsx).
- **P5.** Visual design pass — confirm the cue placement on each form. Default assumption: top-right of form header next to the title.

---

## 8. Gotchas

- **Probe timing.** `/api/form-health/:formId` currently uses `verifyMountedEndpoint()` which may internally call `OPTIONS` against a non-mounted route and cache negative results. Confirm the cache invalidates on hot reload (affects dev loop only; prod is stable) and that the per-form GET returns fast enough (<200ms) to not delay form paint.
- **OPTIONS vs HEAD.** Some of our Express routes don't handle OPTIONS cleanly (they 404 instead of 204). Audit before adding new `FORM_CHECKS` entries. If OPTIONS 404s, prefer a dedicated readiness endpoint returning `{ ok: true }` at zero cost.
- **Animation re-fires on re-mount.** Forms inside `AnnualLeaveModal` mount/unmount as the modal opens/closes. The pulse will re-run every time the modal re-opens — acceptable, but confirm it doesn't feel noisy. If it does, memoise readiness per form id at the parent and skip the probe within an N-second window.
- **`prefers-reduced-motion`.** Absolutely required — the animation is decorative. Snap to ready + fade without the dot→tick morph.
- **`recordSubmission` silent failure.** The helper MUST NOT throw into the user's submit path. The `try/catch` wrapper pattern is already the house style — don't invent new error semantics.
- **External endpoints.** `NotableCaseInfoForm` is the only form submitting to an Azure Function directly from the client. Proxying it through our server (C5) is the only way to persist — this is the reason for the proxy route rather than client-side persistence.
- **Read-only forms.** `AnnualLeaveHistory` is delete-only. The pulse still makes sense there (confirming the DELETE endpoint is alive) but persistence should use `archiveSubmission`, not `recordSubmission`.
- **Form id collision with FORM_CHECKS.** Keep the hook's `formId` argument identical to the `FORM_CHECKS` entry id. Don't invent a second naming scheme.
- **Kill-switch independence.** Readiness cue is driven by `/api/form-health` (which has no `OPS_PLATFORM_ENABLED` gate). Persistence is gated. Don't couple them — a form with the cue working but persistence disabled is a legitimate state under the rollback flag.

---

## Metadata

### Stash metadata

```yaml
# Stash metadata
id: bespoke-forms-on-mount-readiness-pulse-universal-persistence
shipped: true
shipped_on: 2026-04-21
verified: 2026-04-21
branch: main
touches:
  client:
    - src/CustomForms/TechIdeaForm.tsx
    - src/CustomForms/TechProblemForm.tsx
    - src/CustomForms/LearningDevelopmentForm.tsx
    - src/CustomForms/UndertakingForm.tsx
    - src/CustomForms/ComplaintForm.tsx
    - src/CustomForms/CounselRecommendationForm.tsx
    - src/CustomForms/ExpertRecommendationForm.tsx
    - src/CustomForms/BundleForm.tsx
    - src/CustomForms/BookSpaceForm.tsx
    - src/CustomForms/NotableCaseInfoForm.tsx
    - src/CustomForms/TransactionIntake.tsx
    - src/CustomForms/AnnualLeaveForm.tsx
    - src/CustomForms/AnnualLeaveModal.tsx
    - src/CustomForms/AnnualLeaveApprovals.tsx
    - src/CustomForms/AnnualLeaveBookings.tsx
    - src/CustomForms/AnnualLeaveHistory.tsx
    - src/CustomForms/BespokeForms.tsx
    - src/CustomForms/shared/useFormReadinessPulse.ts  # NEW
    - src/CustomForms/shared/FormReadinessCue.tsx      # NEW
  server:
    - server/routes/formHealthCheck.js
    - server/routes/registers.js
    - server/routes/techTickets.js
    - server/routes/notableCaseInfo.js                 # NEW (C5 proxy)
    - server/utils/formSubmissionLog.js
  submodules: []
depends_on:
  - helix-operations-platform-standup
  - forms-as-real-system-relocate-form-submissions-to-ops-platform-unify-activity-feed
coordinates_with:
  - forms-stream-persistence                            # shares registers.js, techTickets.js, formSubmissionLog.js
  - forms-ia-ld-undertaking-complaint-flow              # shares registers.js + L&D/undertaking/complaint form files
  - home-todo-single-pickup-surface
  - ccl-backend-chain-silent-autopilot-service
  - demo-mode-hardening-production-presentable-end-to-end
  - ux-realtime-navigation-programme
conflicts_with: []
```

