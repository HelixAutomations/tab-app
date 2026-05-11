# Retire helix-keys-proxy and add form route preflight

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-27 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

<1â€“3 short paragraphs. Quote the user verbatim where possible. State what the request is and what the user is *not* asking for.>

---

## Why

The `helix-keys-proxy.azurewebsites.net` App Service and the legacy Azure Function App behind it are vestigial. They were originally a way to keep Function Keys out of the SPA bundle, but every Function they front has either (a) been re-implemented as an Express route already, or (b) is small enough that we can re-implement it now. Each call still pays for: extra DNS, an extra TLS handshake, a low-tier App Service hop, and (for cold Functions) ~600–1500ms of Consumption-plan cold-start.

Phase 1 (already shipped 2026-04-27) introduced `src/utils/getApiUrl.ts` and migrated `CallsAndNotes` (9 dubberCalls call sites) and `claimEnquiry` to the SPA's own origin. This brief covers the rest.

In parallel, this brief introduces a subtle per-form route-readiness indicator (a small dot, no copy) so users see a quiet, reassuring confirmation that the underlying submit route is live before they commit a form. It also opens up the existing forms-stream feed beyond the dev gate — defaulting to the user's own submissions, with a god-view toggle for dev owners (mirroring the Home to-do `'mine' | 'all'` pattern).

## What good looks like

### Track A — Cleanup

1. **A1. Blunder audit (read-only).** Grep + report on URL-building / env-var patterns that mis-route in staging/prod:
   - `${getProxyBaseUrl()}/api` concatenations (`/api/api/...` class)
   - Hard-coded `helix-keys-proxy` references
   - `process.env.REACT_APP_*_PATH` usages without their `_CODE` partner (or vice versa)
   - Env-var fallbacks that paper over missing vars (e.g. `|| 'api/...'`)
   - Functions that re-call other Functions through the proxy
   - Server-side fetches that include `${process.env.REACT_APP_*}` (server reading client env vars is a smell)
   Output: a single short report (`docs/notes/_audit-proxy-blunders.md`, throwaway), then decide what to fix vs park.

2. **A2. Phase 1b — CustomForms migration off `getProxyBaseUrl()`.** Mechanical, no Function source needed: VerificationCheckForm, UndertakingForm, ComplaintForm, LearningDevelopmentForm, CounselDirectory, CounselRecommendationForm, ExpertDirectory, ExpertRecommendationForm, TechProblemForm, TechIdeaForm. They all already hit Express routes — just swap to `getApiUrl()`.

### Track B — Phase 2 Function migration (stop relying on legacy Function App)

For each of the remaining live Functions, add a server route in `server/routes/legacy/<name>.js` that does what the Function does (SQL / Clio / etc.), reading any secrets from Key Vault via `server/utils/getSecret.js` or via a shared `server/utils/legacyFunctionProxy.js` helper if we decide to *server-side* proxy the Function temporarily (zero behaviour change, no SPA risk):

- **B1. updateTransactions** (write, finance) — port carefully, App Insights `Server.Legacy.UpdateTransactions.*` events, feature flag (`HELIX_LEGACY_TRANSACTIONS=express|function`).
- **B2. getMatterOverview / getMatterSpecificActivities / getGoogleAdsClickData** (read-only Reporting) — batch port. Lowest blast radius.
- **B3. updateAnnualLeave** — server-to-Function call from `api/src/functions/updateAnnualLeave.ts`. Either inline into Express (preferred, removes the api/ tier dependency) or route through Express â†’ SQL directly.
- **B4. submitSnippetEdit / approveSnippetEdit / deleteSnippetEdit** — submodule has source at `submodules/instruct-pitch/decoupled-functions/actionSnippet/`. Port directly.
- **B5. getInstructionData** — submodule has source at `submodules/instruct-pitch/decoupled-functions/fetchInstructionData/`. Port directly.

Each migration:
- Read Function source â†’ port to Express â†’ wire SPA via `getApiUrl()` â†’ run with feature flag both ways for a release â†’ flip flag off â†’ delete the env vars.
- App Insights `Server.Legacy.<Name>.Started/Completed/Failed` per the server instrumentation contract.
- Each is independently shippable.

### Track B-Decom — Local cleanup (resources stay)

Per direction: do NOT delete the Azure resources (App Services / Function App). Just stop relying on them.

- Delete `src/utils/getProxyBaseUrl.ts` and its test.
- Delete `REACT_APP_PROXY_BASE_URL` and all `REACT_APP_*_PATH` / `_CODE` env vars from `.env*` examples and any deploy scripts.
- Cross-check `submodules/instruct-pitch` and `submodules/enquiry-processing-v2` for stragglers (already eyeballed clean — re-check before final flip).

### Track C — Form route-readiness indicator + stream surfacing

1. **C1. Per-form route preflight.** When a form mounts, fire a lightweight `GET /api/<route>/health` (or `HEAD` if cheaper) against its target submit route. Hook: `useFormRoutePreflight(route)`. UI: an 8px dot tucked next to the form title or the submit button, neutral grey while probing, faint green once the route returns within budget (~600ms), faint amber if slow but reachable, red only on hard failure. No copy, no labels — the dot is the affordance. Tooltip on hover only ("Route checked HH:MM").
2. **C2. Server-side form-route health endpoints.** Each form's submit route gets a sibling `/health` that runs the cheapest possible end-to-end check (auth + a dependency ping — SQL `SELECT 1`, Clio token freshness, etc.). Cap latency at ~300ms server-side; if a check would be expensive, return a "warm" state instead.
3. **C3. Surface the forms stream to all users (not just dev group).** Re-use the existing forms-stream feed. Default scope: user sees only their own submissions. Dev-owner: `'mine' | 'all'` toggle, persist in `localStorage.helix.formStreamScope`, mirror the Home to-do pattern (`isDevOwner(req)` server-side gate, never trust the client).
4. **C4. Server scope hardening.** Whatever route serves the stream must filter by `userInitials` / `userEmail` server-side when scope=mine, and require `isDevOwner(req)` for scope=all. Add tests around the gate (security-critical).

### Track D — Tests (after A + B land)

- Smoke tests on each migrated route (B1–B5), exercising the same input the SPA sends.
- Form preflight contract tests — assert each form's `/health` endpoint returns `{ ok: true }` quickly.
- Forms-stream scope tests — `scope=mine` filters correctly; `scope=all` returns 403 for non-dev-owner.

## Acceptance

- [ ] A1 audit report written and reviewed; blunder candidates either fixed or parked.
- [ ] A2 — all 10 CustomForms files use `getApiUrl()`; zero `getProxyBaseUrl()` references in `src/CustomForms/`.
- [ ] B1–B5 — each Function migrated to an Express route, behind a feature flag, with App Insights events.
- [ ] B-Decom — `src/utils/getProxyBaseUrl.ts` deleted, env vars removed; `grep -r helix-keys-proxy src/` returns zero hits.
- [ ] C1 — `useFormRoutePreflight` hook + dot affordance live on at least 2 forms (smoke test).
- [ ] C2 — `/health` endpoints exist for the migrated form routes.
- [ ] C3 — forms stream surfaced; scope toggle visible to dev owner only; default scope mine; security gate verified.
- [ ] D — at least one test per migrated route + scope gate test.

## Out of scope

- Deleting Azure resources (per direction — leave the App Service and Function App in place even after they're unused).
- A full URL-builder refactor across `instruct-pitch` / `enquiry-processing-v2` — those submodules are clean of `helix-keys-proxy`, just monitor.
- Form layout / UX changes beyond the dot affordance.

## Files / links

Phase 1 (already shipped): `src/utils/getApiUrl.ts`, `src/components/modern/CallsAndNotes.tsx`, `src/utils/claimEnquiry.ts` — see changelog 2026-04-27 "Phase 1: retire helix-keys-proxy hop for our own routes".

Function source available in submodules:
- `submodules/instruct-pitch/decoupled-functions/actionSnippet/`
- `submodules/instruct-pitch/decoupled-functions/fetchInstructionData/`

Function source NOT in submodules — need to port from scratch by inspecting current SPA call shape + DB:
- `updateTransactions`, `getMatterOverview`, `getMatterSpecificActivities`, `getGoogleAdsClickData`, `updateAnnualLeave`

Existing patterns to mirror:
- Dev-owner gate: `server/routes/todo.js` `isDevOwner(req)`.
- Home to-do scope toggle: `src/tabs/home/Home.tsx` `homeTodoScope` + `helix.homeTodoScope` localStorage key.

## Risks

- **B1 (updateTransactions) is a write path on finance** — feature flag both ways for at least one release before retiring the Function, with App Insights diff between paths.
- **Server-side `/health` endpoints can themselves fail noisily** — make them best-effort; a failed health check should not raise a hard error in App Insights, just return a warm/red state.
- **Form-stream scope toggle is security-sensitive** — write the test for the dev-owner gate FIRST, before exposing scope=all.
- **Delete `getProxyBaseUrl.ts` last** — anything still importing it after Phase 2 will fail at build time, which is the point, but means the deletion needs to be the very last step.
### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: retire-helix-keys-proxy-and-add-form-route-preflight
verified: 2026-04-27
branch: main
touches:
  client:
    - src/utils/getProxyBaseUrl.ts
    - src/utils/getApiUrl.ts
    - src/CustomForms/VerificationCheckForm.tsx
    - src/CustomForms/UndertakingForm.tsx
    - src/CustomForms/ComplaintForm.tsx
    - src/CustomForms/LearningDevelopmentForm.tsx
    - src/CustomForms/CounselDirectory.tsx
    - src/CustomForms/CounselRecommendationForm.tsx
    - src/CustomForms/ExpertDirectory.tsx
    - src/CustomForms/ExpertRecommendationForm.tsx
    - src/CustomForms/TechProblemForm.tsx
    - src/CustomForms/TechIdeaForm.tsx
    - src/CustomForms/shared/FormHealthCheck.tsx
    - src/tabs/transactions/TransactionApprovalPopup.tsx
    - src/tabs/Reporting/MattersReport.tsx
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/home/Home.tsx
    - src/app/App.tsx
  server:
    - server/routes/legacy/getInstructionData.js
    - server/routes/legacy/updateTransactions.js
    - server/routes/legacy/snippetEdits.js
    - server/routes/legacy/mattersReport.js
    - server/routes/legacy/updateAnnualLeave.js
    - server/utils/legacyFunctionProxy.js
    - api/src/functions/updateAnnualLeave.ts
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```
### Stash metadata (REQUIRED â€” used by `check stash overlap`)

```yaml
# Stash metadata
id: retire-helix-keys-proxy-and-add-form-route-preflight
verified: 2026-04-27
branch: main
touches:
  client:
    - src/utils/getProxyBaseUrl.ts
    - src/utils/getApiUrl.ts
    - src/CustomForms/VerificationCheckForm.tsx
    - src/CustomForms/UndertakingForm.tsx
    - src/CustomForms/ComplaintForm.tsx
    - src/CustomForms/LearningDevelopmentForm.tsx
    - src/CustomForms/CounselDirectory.tsx
    - src/CustomForms/CounselRecommendationForm.tsx
    - src/CustomForms/ExpertDirectory.tsx
    - src/CustomForms/ExpertRecommendationForm.tsx
    - src/CustomForms/TechProblemForm.tsx
    - src/CustomForms/TechIdeaForm.tsx
    - src/CustomForms/shared/FormHealthCheck.tsx
    - src/tabs/transactions/TransactionApprovalPopup.tsx
    - src/tabs/Reporting/MattersReport.tsx
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/home/Home.tsx
    - src/app/App.tsx
  server:
    - server/routes/legacy/getInstructionData.js
    - server/routes/legacy/updateTransactions.js
    - server/routes/legacy/snippetEdits.js
    - server/routes/legacy/mattersReport.js
    - server/routes/legacy/updateAnnualLeave.js
    - server/utils/legacyFunctionProxy.js
    - api/src/functions/updateAnnualLeave.ts
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```



---

## 10. Appended 2026-04-27 — Custom Forms consistency programme (PaymentRequests trigger)

> Live UX review of `Bundle`, `Undertaking`, and `Payment Requests` made it clear this brief is no longer about one field or one route check. It is a **production-readiness consistency pass over the entire CustomForms surface**, with the route-preflight dot in Track C as the keystone. Stability and quiet reassurance over novelty — the team is about to live in these forms.

### 10.1 Why the scope broadens

User quote: *"payment requests also. theres zero of the new processing and even ux reassurances and ux cues etc. … the forms have no ready indicators … this becomes a big scope for opportunities to bring the custom forms into consistency and not a singular field. with subtle, not PR/AI clearly prompts just being transparent about the underlying processing and status updates instead of value 'didn't work or hit an error'"*.

Translation:

- Not a one-field fix. The whole `src/CustomForms/` surface has drifted into 3 different shells, 3 different date controls, inconsistent submit feedback, and zero pre-submit reassurance.
- **Subtle ≠ silent.** No marketing copy, no "AI-helpful" preambles, no banners that pat the user on the back. Just quiet transparency: "the route is up", "your payload reached the server", "the server accepted it", "here is your row in the stream".
- **Errors must be specific and honest.** Replace generic "Something went wrong" / "Network error" / "Failed to create task" strings with what actually happened: `route preflight failed (503)`, `Asana token expired – contact ops`, `validation failed: payee_account must be 8 digits`. Surface the same string in App Insights so support can correlate without asking the user.

### 10.2 Form-by-form audit (state on `main`, 2026-04-27)

| Form | Shell | Readiness cue | Route preflight | Date control | Submit feedback | Notes |
|------|-------|---------------|-----------------|--------------|-----------------|-------|
| BundleForm | New | `FormReadinessCue` (mount-only) | ❌ | Fluent `DatePicker` (just normalised) | `getFormSubmitFeedbackStyle` | Reference shell going forward |
| UndertakingForm | New | `FormReadinessCue` | ❌ | Native `input type="date"` × 2 | MessageBar | Date control out-of-spec |
| ComplaintForm | New | `FormReadinessCue` | ❌ | Native `input type="date"` | MessageBar | |
| LearningDevelopmentForm | New | `FormReadinessCue` | ❌ | Native `input type="date"` × 2 | MessageBar | |
| TransactionIntake | Old custom card | ❌ | ❌ | Native `input type="date"` | Inline | Pre-amalgamation chrome |
| VerificationCheckForm | New | `FormReadinessCue` | ❌ | Native `input type="date"` | MessageBar | DOB needs `min`/`max` |
| AnnualLeaveModal | Bespoke `.css` modal | ❌ | ❌ | Native `input type="date"` × 2 | Toast | Sits outside the shell entirely |
| **PaymentRequests** | **Schema engine (`BespokeForms`)** | ❌ | ❌ | Schema engine `'date'/'time'` (L753) | Generic | **User-flagged.** No reassurance, alien chrome |
| **TransferRequest** | **Schema engine (`BespokeForms`)** | ❌ | ❌ | Same engine | Generic | Same gap |
| Counsel/Expert directory + recommendation | New shell | `FormReadinessCue` | ❌ | n/a | MessageBar | |
| Tech idea / problem | New shell | `FormReadinessCue` | ❌ | n/a | MessageBar | |
| BookSpaceForm | Mixed | ❌ | ❌ | n/a | Inline | Drifted |
| AnnualLeaveForm | Mixed | ❌ | ❌ | n/a | Inline | Drifted |

### 10.3 Five consistency axes (the actual work)

Treat each axis as an independently shippable sub-phase. They compound — the more land, the more "solid" the suite feels.

#### Axis 1 — Shell

Every form inside `src/CustomForms/` (and every schema-rendered form via `BespokeForms.tsx`) must use:

- `getFormCardStyle(isDarkMode)` (no LHS accent on the page card; accent stripe on the header only — see Undertaking patch 2026-04-27)
- `getFormHeaderStyle(isDarkMode, accentColor)` with title only (no PR subtitle)
- `getFormSectionStyle` for grouped sections
- `getFormSubmitFeedbackStyle` for the submit strip

Migrate or wrap: `TransactionIntake`, `BookSpaceForm`, `AnnualLeaveForm`, `AnnualLeaveModal`, plus the schema engine output.

#### Axis 2 — Readiness cue (mount)

`FormReadinessCue` exists already and runs at mount. Add it to the forms missing it (`TransactionIntake`, `BookSpaceForm`, `AnnualLeaveForm`, `AnnualLeaveModal`, schema-rendered forms). State machine stays the same: `probing → ready/degraded/blocked`. No copy, just colour + subtle pulse.

#### Axis 3 — Route preflight (Track C, now mandatory)

Each form declares its submit route. `useFormRoutePreflight(route)` fires `GET /api/<route>/health` on mount and on focus return (browser tab regains focus). UI: 8px dot beside the readiness cue. Tooltip only on hover (`Route checked HH:MM · 142 ms`). For schema-driven forms add an optional `submitHealthRoute` field to the entry in [src/tabs/forms/FinancialForms.ts](../../src/tabs/forms/FinancialForms.ts) so PaymentRequests + TransferRequest can declare their target.

Server side: every form route gets a sibling `/health` (cheapest end-to-end check — auth + dependency ping; cap at 300 ms; degrade to "warm" rather than fail).

#### Axis 4 — Date control

`HelixDateField` shared wrapper (see prior version of §10.3). 8 hand-built sites + 1 schema-engine case. ISO `YYYY-MM-DD` contract unchanged.

#### Axis 5 — Submit feedback (transparent, specific, honest)

Standardise the strip across every form:

| Phase | Visual | Copy template |
|-------|--------|---------------|
| `idle` | hidden | — |
| `submitting` | `getFormSubmitFeedbackStyle('info')` + spin dot | `Submitting to <route> …` |
| `validating` (server) | same | `Server validating payload …` |
| `success` | `getFormSubmitFeedbackStyle('success')` | `Submitted. Reference: <id>. Visible in your forms stream.` |
| `error` | `getFormSubmitFeedbackStyle('error')` | `<specific reason from server>. Reference: <correlationId>.` |
| `route-down` (preflight failed) | `getFormSubmitFeedbackStyle('warning')` shown **before** user types | `Submission route is currently slow/unavailable (<status>). You can still draft — submission will retry when ready.` |

Remove every instance of:
- `'Something went wrong'`
- `'Network error - please check your connection and try again'` (current BundleForm)
- `'Failed to create task'` with no reason
- `'An error occurred while recording the undertaking.'` (current UndertakingForm fallback)

Replace with the actual `error.message` plus a server-issued `correlationId` (mint one if absent). Mirror the same string into App Insights `Forms.<Name>.Submit.Failed` so support can grep.

### 10.4 PaymentRequests + TransferRequest — schema-engine parity (the trigger forms)

Highest priority because they are the most-used finance forms and the worst offenders today.

- Wrap `BespokeForms.tsx` render output in the new shell helpers (header + card + section). Today the engine builds its own chrome.
- Add the readiness cue + preflight dot in the shell (engine doesn't need to know — the shell injects it).
- Add `HelixDateField` for the `'date' / 'time'` engine cases.
- Replace the inline submit handler's generic catch with the §10.5 transparent strip.
- Add a `submitHealthRoute` to each entry in [FinancialForms.ts](../../src/tabs/forms/FinancialForms.ts).
- Acceptance: PaymentRequests + TransferRequest visually indistinguishable in chrome from BundleForm. Same dot. Same strip. Same date control.

### 10.5 Production-rollout reassurance ladder (what the user sees)

Every form, in order:

1. **Mount.** Header renders instantly. Readiness cue + preflight dot start neutral. No copy.
2. **~300 ms.** Dot resolves: faint green (route healthy) / amber (warm) / red (down). If amber/red, user sees it before typing — no wasted effort.
3. **Type.** Inputs feel identical across forms (height, focus ring, date control) because everything routes through the shared shell + `HelixDateField`.
4. **Submit click.** Strip transitions through `submitting → validating → success/error` with specific copy per §10.3 Axis 5.
5. **Confirm.** Toast (existing) + a row appears in the forms stream (Track C3) = proof the submission landed.

If the dot was red at mount and the user submits anyway, the strip shows the same `route-down` warning with the actual status code — never a generic failure.

### 10.6 Updated acceptance additions (extends §Acceptance)

- [ ] All forms in §10.2 use the shared shell (Axis 1).
- [ ] All forms render `FormReadinessCue` at mount (Axis 2).
- [ ] All forms render the route-preflight dot wired to a server `/health` sibling (Axis 3).
- [ ] `HelixDateField` exists; all 8 sites + the schema-engine case migrated; no raw `<input type="date">` remains in `src/CustomForms/` (Axis 4).
- [ ] Every form's submit strip uses the §10.3 Axis 5 phase model with specific copy + correlationId; no generic fallback strings remain (Axis 5).
- [ ] PaymentRequests + TransferRequest visually + behaviourally consistent with BundleForm.
- [ ] App Insights `Forms.<Name>.Submit.Started/Completed/Failed` events emitted for every form (per server instrumentation contract).

### 10.7 Out of scope (still)

- Visual rewrite of `AnnualLeaveModal`'s outer modal chrome — only the date inputs + readiness cue + submit strip change here. Full re-skin lives in `annual-leave-modal-brand-rework`.
- Replacing `BespokeForms.tsx` schema engine entirely — only the shell wrap + date case + submit handler.
- Adding new fields, validation logic, or workflow changes to any form.
- Asana submit URL or payload changes.
- Cross-firm SRA submission (lives in `forms-ia-ld-undertaking-complaint-flow`).

### 10.8 Coordinates with

- `forms-ia-ld-undertaking-complaint-flow` — that brief routes L&D / Undertaking / Complaint submissions into LZ's To Do; this brief makes the chrome those flows submit through visually consistent and reassuring.
- `forms-stream-persistence` — the post-submit row in the stream is the closing reassurance for §10.5 step 5.
- `annual-leave-modal-brand-rework` — owns the broader AL modal re-skin; this brief only touches its date inputs + readiness + submit strip.
- `quick-actions-rework-empty-state` — same forms surfaced from Quick Actions; both should land on the same shell.
- `demo-mode-hardening-production-presentable-end-to-end` — every form must look correct in demo mode at rollout; readiness dot must respect demo data so it never goes red on a demo-only route.

### 10.9 Suggested execution order (smallest blast radius first)

1. **HelixDateField** wrapper (Axis 4) — no behaviour change anywhere; instant visual win on UndertakingForm/BundleForm/etc.
2. **Submit strip standardisation** (Axis 5) on the New-shell forms — they already have the helpers, just swap the copy and add correlationId.
3. **Route preflight** (Axis 3) on the New-shell forms — server `/health` siblings + shared hook + dot. Production reassurance unlocked.
4. **Schema-engine wrap** (Axis 1 + 2 for PaymentRequests + TransferRequest) — biggest user-visible payoff, but largest single edit.
5. **Drift forms** (TransactionIntake, BookSpaceForm, AnnualLeaveForm, AnnualLeaveModal) — pick up Axis 1/2/5 as they become natural to touch.

Each step is independently shippable and independently revertable. Each warrants its own changelog entry.

### 10.10 Appended — Forms-stream landing confirmation + Bundle step transparency (shipped)

Closes the post-submit transparency gap that was the user-visible counterpart to §10.5's "production reassurance ladder". The bet: every Custom Form now proves to the user, inline at the success state, that the submission landed in the unified Forms rail — and gives them a one-click hop to see it.

**What shipped (server)**

- **VerificationCheckForm rail gap closed** — `server/routes/verify-id.js` now records to the unified `formSubmissionLog`. The Tiller adhoc route was the last form-handling route writing only to its bespoke history table; it now appears in the same rail as every other form.
- **Bundle step transparency** — `server/routes/bundle.js` records `asana.tokenRefresh`, `asana.create`, and `email.operations` steps so the rail entry shows partial success states (e.g. Asana succeeded, email failed). Previously a Bundle that completed Asana but failed email looked the same as one that failed at Asana.
- **Standardised response shape** — eleven form route files (`verify-id`, `bundle`, `registers` (4 endpoints), `techTickets` (4 endpoints), `financialTask`, `counsel`, `experts`, `bookSpace`, `notableCaseInfo`, `attendance`, `transactionsV2`) now return `{ submissionId, streamUrl: 'forms?focusSubmission=<id>' }` on success (and `submissionId` on error where a row was logged). The `streamUrl` is a contract string — not a router URL — that the client parses to dispatch the cross-tab navigation event.

**What shipped (client)**

- **`<FormsStreamLanded />`** (`src/CustomForms/shared/FormsStreamLanded.tsx`) — small inline strip rendered directly under the success/error MessageBar. Shows: dot · `Logged in stream · <shortId>` · `View in stream →` button. Uses Helix tokens (neutral grey body, accent dot, no border-radius). Returns null if no submissionId so error-without-row paths render nothing.
- **Wired into 6 forms** — `BundleForm`, `ComplaintForm`, `UndertakingForm`, `LearningDevelopmentForm` (both handlers — Plan and Activity share the strip), `TechProblemForm`, `TechIdeaForm`, plus `VerificationCheckForm` (since the rail gap was closed). Each form captures `submissionId` + `streamUrl` from the response on success, and `submissionId` from `errorData` on failure (so the user can still hop to the failed-row entry).
- **FormsHub deep-link focus** — `FormsHub` accepts `focusSubmissionId` + `onFocusSubmissionHandled`. When set, it scrolls the matching `[data-submission-id]` row into view (smooth, centred), applies a 2.2s `forms-hub__stream-item--focus-flash` accent pulse, then clears the pending state. Retries up to 12× at 250ms intervals to cover SSE / store-event lag, then quietly gives up.
- **App.tsx handler** — extended `handleNavigateToForms` to read `detail.focusSubmissionId` from the CustomEvent payload, stored as `pendingFocusSubmissionId`, passed into FormsHub, cleared via `onFocusSubmissionHandled`. The "View in stream →" button dispatches `new CustomEvent('navigateToForms', { detail: { focusSubmissionId } })`.

**What was deliberately NOT shipped**

- **Team-wide Activity transparency strip** — separate brief. This shipment is per-user, post-submit only. The team-wide live ticker of who-just-submitted-what is a different surface and a different consent question.
- **Step transparency on every form** — only Bundle got per-step recording in this pass because it has the most distinct external dependencies (Asana token refresh, Asana create, email send) that can fail independently. Other forms still record start/complete/fail at the route level. Per-step coverage for other multi-dependency routes is a follow-up if/when needed.

**Acceptance**

- Submitting any of the 6 forms shows the inline landing strip after success/error.
- "View in stream →" navigates to Forms tab and the matching row scrolls into view with a brief accent pulse.
- VerificationCheckForm submissions appear in the unified rail (previously only in instruction history).
- Bundle entries show partial-success states when Asana succeeds but email fails (visible in entry detail view).
- All edits compile clean; no behaviour change to forms not in the wired set.

