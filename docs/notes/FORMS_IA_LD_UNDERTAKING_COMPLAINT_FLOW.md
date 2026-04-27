# Forms — IA, L&D, Undertaking, Complaint flow + register routing

> **Purpose.** Repoint three forms (Learning & Development, Undertaking, Complaint) into a coherent submit-→-register-→-To-Do-→-sign-off loop, aligned to Stream 2. L&D submissions land in LZ's To Do for review + register entry. Undertakings submit to both a register and LZ's To Do (LZ is ultimate backstop even though senior fee earners manage day-to-day). Complaints go into LZ's To Do with a visible SLA countdown. Surfaces at [src/CustomForms/](../../src/CustomForms/) and [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx).
>
> **Verified:** 2026-04-20 against branch `main`.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/realignmentcall_scope.md](../realignmentcall_scope.md)):

- *"learning and development... I want that to be coming into my to do list and for me to then review it and add it to the register on their behalf. We don't need to give access to the register to any user"*
- *"complaints... the only surface on which it needs to be addressed is the to-do list I have, because I always deal with complaints"*
- *"undertakings... ultimately I deal with them if something goes wrong... the senior fee earners deal with them... should go to both the register and to the senior fee earner to do"*  (clarified intent: register + LZ To Do always; per-fee-earner notification is a nice-to-have but not this push).
- *"it would be nice if it included the real unit things like how many hours or how many pounds... if the unit is time we do need the hours to be included"*
- *"we still need this to work in forms and the forms, like, function and processes need to be retained"*
- *"L&D records should be logged by category like this"* — categories already known from the current register.

Out of scope: rewriting form validation, changing who can see registers (LZ only), cross-firm CPD submission to SRA.

---

## 2. Current state — verified findings

### 2.1 Forms

- [src/CustomForms/LearningDevelopmentForm.tsx](../../src/CustomForms/LearningDevelopmentForm.tsx) — L&D entry.
- [src/CustomForms/UndertakingForm.tsx](../../src/CustomForms/UndertakingForm.tsx) — undertaking entry.
- [src/CustomForms/ComplaintForm.tsx](../../src/CustomForms/ComplaintForm.tsx) — complaint entry.

### 2.2 Server routes

- [server/routes/registers.js](../../server/routes/registers.js):
  - L125: L&D register.
  - L399: undertakings register.
  - L534: complaints register.
- Registers surface: [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx).

### 2.3 Stream dependencies

- Depends on [HOME_TODO_SINGLE_PICKUP_SURFACE.md](HOME_TODO_SINGLE_PICKUP_SURFACE.md) for the `/api/todo/create` + `/reconcile` endpoints and `hub_todo` table.
- Coordinates with [FORMS_STREAM_PERSISTENCE_PLAN.md](FORMS_STREAM_PERSISTENCE_PLAN.md) for retrigger + draft persistence. Submissions in this brief rely on that brief's draft-retention semantics but do not conflict on files.

### 2.4 Unit detection

Forms today capture freeform "details". The user wants structured unit capture:

- L&D: **hours**, **category** (existing enum), **provider**, **date**, **notes**.
- Undertaking: **value** (GBP or descriptive), **given by**, **given to**, **matter ref**, **due date**, **status**.
- Complaint: **complainant**, **matter ref** (optional), **received at**, **SLA deadline (+8 weeks final)**, **status**.

---

## 3. Plan

### Phase A — L&D flow

- **A1.** Form unchanged in appearance; ensure hours + category + provider + date are required, notes optional. Submit path unchanged (POST to existing L&D endpoint — if none, add `POST /api/registers/ld-submission` landing in a staging table `hub_ld_pending`).
- **A2.** On submit → `POST /api/todo/create` with `{kind: 'ld-review', ownerInitials: 'LZ', payload: {submitter, hours, category, provider, date, notes, pendingId}}`.
- **A3.** LZ's To Do card opens a mini review (dialog) that allows: approve → writes to register ([server/routes/registers.js L125](../../server/routes/registers.js#L125)) and deletes the pending row; reject → records reason + deletes pending row; edit → tweaks fields before approve.
- **A4.** On approve/reject → `POST /api/todo/reconcile` closes card.
- **A5.** Register access stays LZ-only (unchanged).

Add `ld-review` kind to `ImmediateActionModel.ts` (Stream 2 B1).

### Phase B — Undertaking flow

- **B1.** Form gains a **Value / Unit** block (numeric GBP OR descriptive — user picks). "Given by" defaults to logged-in user initials but editable (senior fee earner can file on behalf).
- **B2.** On submit → **two** writes:
  - `POST /api/registers/undertakings` (existing L399) — immediate register entry; status = "Open".
  - `POST /api/todo/create` with `{kind: 'undertaking-oversight', ownerInitials: 'LZ', payload: {undertakingId, value, givenBy, givenTo, matterRef, dueDate}}`.
- **B3.** LZ's To Do card = oversight read-only view + "Mark as discharged" button → PATCH register row to status "Discharged" + reconcile card.
- **B4.** (Nice-to-have, deferred) Also create a card for the `givenBy` fee earner so they can discharge themselves. Park in §7.

### Phase C — Complaint flow

- **C1.** Form captures complainant, optional matter ref, date received, summary. SLA deadline = received + 56 days (8 weeks, SRA rule), auto-calculated.
- **C2.** On submit → `POST /api/registers/complaints` (existing L534) with status "Open".
- **C3.** `POST /api/todo/create` with `{kind: 'complaint-handling', ownerInitials: 'LZ', payload: {complaintId, complainant, receivedAt, slaDeadline, matterRef?}}`.
- **C4.** To Do card displays **countdown to SLA** as a prominent strip (amber when <14 days, red when <3 days). Helix style: use `colours.orange` / `colours.cta` tokens; never invent hex.
- **C5.** Card completes on status change to "Resolved" in register (manual) → emits reconcile.
- **C6.** Form surface removed from user-visible catalogue? — **No**, keep the form accessible to all users so complaints can be lodged internally. Only the register view stays LZ-only.

### Phase D — Registers workspace coherence

- **D1.** Ensure [RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx) renders the three registers (L&D, Undertakings, Complaints) with consistent columns, filters, and a "Copy to clipboard as CSV" action for audit.
- **D2.** Access gate: `isAdminUser()` = false → workspace not visible. LZ sees all.
- **D3.** Each register row links back to the To Do card if still open (read-only link + badge "Open in To Do").

### Phase E — Telemetry

- `Forms.LdSubmission.Received`, `Forms.UndertakingSubmission.Received`, `Forms.ComplaintSubmission.Received`, each with matter ref + submitter.
- `Register.LdReview.Approved` / `Rejected`.
- `Register.Complaint.SlaBreached` (nightly job — a cron checks open complaints past SLA and fires this event; out of this brief's scope for the cron job, but the event key is reserved).

---

## 4. Step-by-step execution order

1. **A1 → A5** — L&D flow end-to-end; smallest surface; validates the To Do integration.
2. **B1 → B3** — undertakings; register write is already in place, just add the To Do emit.
3. **C1 → C5** — complaints with SLA strip.
4. **D1 → D3** — registers workspace coherence pass.
5. **E** — telemetry throughout.

---

## 5. Verification checklist

**Phase A:**
- [ ] L&D submit → row in `hub_ld_pending`, card in `hub_todo` for LZ.
- [ ] Approve → register row created, pending cleared, card reconciled.
- [ ] Reject → pending cleared with reason, card reconciled, no register row.

**Phase B:**
- [ ] Undertaking submit writes to register **and** creates LZ card.
- [ ] "Mark discharged" updates register status + closes card.

**Phase C:**
- [ ] Complaint submit writes register row with SLA deadline = received + 56 days.
- [ ] To Do card shows countdown; colours shift correctly at 14d / 3d thresholds.
- [ ] Status change to "Resolved" closes card.

**Phase D:**
- [ ] Registers workspace visible only to admin users.
- [ ] Open-card badge links back to Home.

---

## 6. Open decisions (defaults proposed)

1. **Per-fee-earner undertaking card?** Default: **Deferred.** LZ sees all; fee earners use register view directly if needed.
2. **Complaint SLA = 8 weeks?** Default: **Yes (SRA final response rule).** Early acknowledgement (48h) surfaced as a sub-strip only if trivial to add; otherwise skip.
3. **L&D pending staging table vs direct-with-approval-flag?** Default: **Staging table.** Keeps register clean; approvals are explicit writes.
4. **Can a non-admin see their own L&D submission card?** Default: **No.** LZ approves; submitter gets a toast on submission and a notification on approval (via DM once chat removal allows; not in scope here).

---

## 7. Out of scope

- SRA-native CPD submission.
- Per-fee-earner undertaking To Do card (parked; see Phase B4).
- Nightly SLA-breach cron (event key reserved; job built separately).
- Changing register access model.
- Form UI redesign beyond adding the value/unit block on undertakings + hours on L&D.

---

## 8. File index

Client:
- [src/CustomForms/LearningDevelopmentForm.tsx](../../src/CustomForms/LearningDevelopmentForm.tsx)
- [src/CustomForms/UndertakingForm.tsx](../../src/CustomForms/UndertakingForm.tsx)
- [src/CustomForms/ComplaintForm.tsx](../../src/CustomForms/ComplaintForm.tsx)
- [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx)
- [src/tabs/home/ImmediateActionModel.ts](../../src/tabs/home/ImmediateActionModel.ts) — add kinds

Server:
- [server/routes/registers.js](../../server/routes/registers.js) — L125 L&D, L399 undertakings, L534 complaints
- `server/routes/todo.js` (from Stream 2)

Scripts:
- `scripts/migrate-add-hub-ld-pending.mjs` (NEW) — `hub_ld_pending` table

### Stash metadata

```yaml
# Stash metadata
id: forms-ia-ld-undertaking-complaint-flow
verified: 2026-04-20
branch: main
touches:
  client:
    - src/CustomForms/LearningDevelopmentForm.tsx
    - src/CustomForms/UndertakingForm.tsx
    - src/CustomForms/ComplaintForm.tsx
    - src/tabs/resources/registers/RegistersWorkspace.tsx
    - src/tabs/home/ImmediateActionModel.ts
  server:
    - server/routes/registers.js
    - server/routes/todo.js
  submodules: []
depends_on:
  - home-todo-single-pickup-surface
coordinates_with:
  - forms-stream-persistence
conflicts_with: []
```

---

## 9. Gotchas appendix

- Complaint SLA is an SRA regulatory concern — don't silently truncate the countdown display. If the SLA has passed, the strip should state "SLA exceeded — review urgently" in `colours.cta`.
- `hub_ld_pending` table is intentionally separate from the L&D register to keep unapproved entries out of the audit trail. Do not shortcut into the main register with an "approved=false" flag.
- Form retrigger (from FORMS_STREAM_PERSISTENCE_PLAN) must play nicely with pending state: a resubmitted L&D form must replace its pending row, not stack new rows.
- When LZ edits on approval, the edit must be captured on the register row with an audit note ("Approved by LZ with amendments"); do not overwrite the submitter field.
- Access gate `isAdminUser()` covers all current admins. Register contents must not leak via unprotected endpoints — verify `/api/registers/*` routes check admin on the server, not just client hiding.
- The Undertaking "Value / Unit" can be descriptive ("undertaking to release funds on completion"), so don't force numeric. Store `{amountPence?, currency?, descriptive?}` and render appropriately.
