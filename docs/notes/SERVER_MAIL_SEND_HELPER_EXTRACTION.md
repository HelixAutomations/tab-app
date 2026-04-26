# Server mail send helper extraction

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-24 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user asked to scope and stash the health observation that the new guarded CCL send route is still using a server-side HTTP loopback into `/api/sendEmail`, then clarified that the work should be implemented now rather than parked. This brief preserves the extraction scope as a reusable handoff while the live implementation continues.

The underlying issue is architectural, not CCL-specific: server routes are re-entering the app over HTTP to send email instead of calling a shared internal mail helper. The user is not asking for recipient-policy changes, new email templates, or a Graph auth rewrite here.

---

## 2. Current state — verified findings

The current send path duplicates transport entry through a route instead of a shared internal helper.

### 2.1 The route holds the real email-send logic today

- File: [server/routes/sendEmail.js](../../server/routes/sendEmail.js#L283) — helper functions such as `pickEmailContextLabel` and `buildEmailEventMetadata` sit beside the route and shape telemetry/context.
- File: [server/routes/sendEmail.js](../../server/routes/sendEmail.js#L303) — `POST /sendEmail` currently owns payload normalisation, signature policy, CC/BCC parsing, telemetry, ops logging, validation, and the downstream Graph send.

### 2.2 CCL now uses a server-side loopback to that route

- File: [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js#L987) — the guarded CCL send route builds recipient policy, review links, and body HTML in-process.
- File: [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js#L1048) — it then calls `fetch(${baseUrl}/api/sendEmail, ...)`, which means delivery depends on an HTTP round trip back into the same app.

### 2.3 The same loopback pattern already exists elsewhere

- File: [server/routes/attendance.js](../../server/routes/attendance.js#L183) — payroll annual leave notifications also call `${baseUrl}/api/sendEmail` from the server.
- File: [server/routes/forwardEmail.js](../../server/routes/forwardEmail.js#L281) — another server route loopbacks into `/api/sendEmail`.
- File: [server/routes/clioMatters.js](../../server/routes/clioMatters.js#L675) — Clio matter flow does the same.
- File: [server/routes/verify-id.js](../../server/routes/verify-id.js#L578) — verification flow also uses the route as an internal relay.

### 2.4 The first migration does not need to cover every caller

- File: [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js#L1048) — the new guarded send is the most recent and most obvious candidate to move first.
- File: [server/routes/attendance.js](../../server/routes/attendance.js#L183) — attendance is a second small, server-originated caller that can prove the helper is general enough without widening into every email surface at once.

---

## 3. Plan

### Phase A — Extract the shared server mail helper and migrate the first callers

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Extract the reusable mail-send core | [server/routes/sendEmail.js](../../server/routes/sendEmail.js) | Move the normalisation, signature, telemetry, ops logging, and Graph-send body into a shared server utility while preserving the route contract. |
| A2 | Thin the route | [server/routes/sendEmail.js](../../server/routes/sendEmail.js) | Leave `POST /sendEmail` as an adapter over the helper so browser callers keep working unchanged. |
| A3 | Migrate the guarded CCL sender | [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) | Replace the loopback fetch with a direct helper call while preserving recipient hard guards and current telemetry. |
| A4 | Migrate a second server caller | [server/routes/attendance.js](../../server/routes/attendance.js) | Replace the loopback there too so the helper is proven outside the CCL path. |

**Phase A acceptance:**
- Server-originated senders no longer need an HTTP round trip back into the same app to deliver email.
- `POST /api/sendEmail` still works unchanged for existing external callers.
- Existing telemetry and ops logging around email sends are preserved.
- The guarded CCL internal-only policy stays intact.

### Phase B — Migrate the remaining server loopback callers

#### B1. Finish server-side migrations

Move `forwardEmail`, `clioMatters`, `verify-id`, and any other server-only callers onto the shared helper once Phase A is stable.

#### B2. Separate transport from request-shape compatibility

Once the helper is in place, decide whether to keep one legacy payload shape internally or introduce a normalised envelope for server callers only.

---

## 4. Step-by-step execution order

1. **A1** — Extract the mail-send core from `sendEmail.js` into a shared server utility.
2. **A2** — Rewire `POST /sendEmail` to call the new helper without changing its external payload contract.
3. **A3** — Replace the guarded CCL route loopback with a direct helper call.
4. **A4** — Replace the attendance loopback with a direct helper call.
5. **B1** — Migrate the remaining server loopback callers in small follow-up slices.
6. **B2** — Revisit helper input normalisation only after all first-party server callers are on the shared path.

---

## 5. Verification checklist

**Phase A:**
- [ ] `node --check` passes for the shared helper, `sendEmail.js`, `ccl-ops.js`, and `attendance.js`.
- [ ] The guarded CCL send still succeeds through the helper without any `/api/sendEmail` HTTP loopback.
- [ ] Attendance email still succeeds through the helper without any `/api/sendEmail` HTTP loopback.

**Phase B:**
- [ ] Remaining server email routes are off the loopback path.
- [ ] App Insights `Email.Send.*` events still appear exactly once per send.
- [ ] Changelog entry added for each shipped migration slice.

---

## 6. Open decisions (defaults proposed)

1. **Should the helper accept the legacy route payload or a normalised envelope?** — Default: **normalise once inside the helper and keep the route as a thin adapter**. Rationale: server callers can then reuse one path without duplicating parsing or signature rules.
2. **How much of the migration belongs in the first slice?** — Default: **`ccl-ops` plus `attendance` first**. Rationale: that removes the new guarded CCL loopback immediately and proves the helper on a second caller without dragging every email surface into the same change.

---

## 7. Out of scope

- Changing recipient policies, templates, or signature content.
- Replacing Microsoft Graph auth or changing email account ownership.

---

## 8. File index (single source of truth)

Client:
- None in this slice.

Server:
- [server/routes/sendEmail.js](../../server/routes/sendEmail.js) — current owner of the reusable send logic that should move into a shared helper.
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — new guarded CCL internal-send route that currently loopbacks into `/api/sendEmail`.
- [server/routes/attendance.js](../../server/routes/attendance.js) — second server caller suitable for the first helper migration.
- [server/routes/forwardEmail.js](../../server/routes/forwardEmail.js) — additional loopback caller for follow-up migration.
- [server/routes/clioMatters.js](../../server/routes/clioMatters.js) — additional loopback caller for follow-up migration.
- [server/routes/verify-id.js](../../server/routes/verify-id.js) — additional loopback caller for follow-up migration.

Scripts / docs:
- [docs/notes/SERVER_MAIL_SEND_HELPER_EXTRACTION.md](../../docs/notes/SERVER_MAIL_SEND_HELPER_EXTRACTION.md) — this brief.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: server-mail-send-helper-extraction                          # used in INDEX cross-refs
verified: 2026-04-24
branch: main
touches:
  client: []
  server:
    - server/routes/sendEmail.js
    - server/routes/ccl-ops.js
    - server/routes/attendance.js
    - server/routes/forwardEmail.js
    - server/routes/clioMatters.js
    - server/routes/verify-id.js
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with:
  - call-centre-external-attendance-note-and-clio-mirror
  - clio-token-refresh-architecture-audit
  - clio-webhook-reconciliation-and-selective-rollout
  - forms-ia-ld-undertaking-complaint-flow
  - forms-stream-persistence
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - realtime-delta-merge-upgrade
  - session-probing-activity-tab-visibility-and-persistence
conflicts_with:
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - demo-mode-hardening-production-presentable-end-to-end
  - docs-transfer-review-ccl-review-fixes
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
```

---

## 9. Gotchas appendix

- The current route does more than deliver mail: it also decides signature behaviour, records ops-log entries, and emits email telemetry. If the shared helper only sends mail and drops those side effects, the migration will regress observability.
- `ccl-ops.js` currently hard-guards recipients before calling `/api/sendEmail`. Preserve that policy in the route; do not move business-specific recipient decisions into the shared helper.
- `attendance.js` is a good second migration target precisely because it is simpler than `forwardEmail` or `verify-id`. Prove the helper there before widening to the more bespoke routes.
