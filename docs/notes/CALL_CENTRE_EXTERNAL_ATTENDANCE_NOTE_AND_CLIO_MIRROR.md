# Call Centre — external calls, attendance note, Clio time-entry mirror

> **Purpose.** Convert the current "Activity" surface into a focused Call Centre for external calls only. Attendance-note generation becomes the default, not a selective "Craft" action. Saving forks the result: attendance note → NetDocuments; chargeable time → Clio time entry. The user reviews both in a box styled after Clio's time-entry modal — with the time editable before save, because chargeable time ≠ call duration. Feature-flagged opt-in; existing Cognito attendance-note form stays live for redundancy.
>
> **Verified:** 2026-04-20 against branch `main`.

---

## 1. Why this exists (user intent)

From the realignment call (verbatim, [docs/notes/realignmentcall_scope.md](realignmentcall_scope.md)):

- *"this should not be identified as activity. This is not activity. This should be calls... amended to say call centre"*
- *"there should not be a distinction between all external, internal notes, emails, all of that gets cut. That whole banner... just external calls, full stop"*
- *"within this list, we should only include external calls"*
- *"those buttons on the right hand side... need to be about 10 times bigger"*
- On "Craft the note": *"I do crafting with my daughter"* → the word is wrong. *"It should actually be adds to file rather than Craft."*
- *"the default should be that"* (attendance note on by default; not selective)
- *"save note, it should fork... the attendance note to net docs and the time to clear [Clio]"*
- *"not discount, just literally if you go into Clio and you create time entry, you can see what is there. I have the ability to amend that. I do amend it... I need to have that ability here too, because this if this one recording my time"*
- *"imagine what it's like in clear [Clio] when you click create a time entry. That's what this needs to look like."*
- *"mirror Clio, basically"*
- *"primary being the most senior person in the call... being the one who is required to deal with it"*
- Multi-attendee: *"when Sam and I call somebody... it should take that person... ignore other attendees"*
- Multi-attendee external, number unresolved: *"that's a problem... needs to be worked out"*
- On rollout: *"keep it optional... keep the cognitos and attendance notes... we pushed this alongside it with a button. If people want to not do the, you can do it this way"* + *"I build everything in this way. Just to be clear. Everything is redundancy."*
- Non-negotiable quality bar: *"anxious... terrifying... telephone attendance notes, we charge for those... that's money, that's income... attendance notes are fundamental to confirm what people are instructing us to do, what advice we're giving. We need them to be really consistent."*
- Live file look-up: *"has to be live look up... that's actually already working in forms"*

Out of scope: internal-call notes, email notes, Clio-activity feed, cross-feed banner.

---

## 2. Current state — verified findings

### 2.1 Call Centre surface

- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — currently a mixed surface.
  - L146: `JourneyFilter` = `'all' | 'external' | 'internal' | 'notes' | 'activity' | 'emails'`.
  - L541: default export.
  - L910: fetches saved notes.
  - L954: `/api/dubberCalls/:id/attendance-note` call.
  - L955: `/api/dubberCalls/:id/matter-chain` call.
  - L1082: `/api/dubberCalls/:id/save-note`.
  - L1143: `/api/dubberCalls/:id/upload-note-nd`.
  - L1265: `externalCalls` filter predicate.
- Mounted in [src/components/modern/OperationsDashboard.tsx L6734](../../src/components/modern/OperationsDashboard.tsx#L6734).
- Compact strip: [src/components/modern/CallTicketsStrip.tsx](../../src/components/modern/CallTicketsStrip.tsx).

### 2.2 Server routes (dubberCalls)

- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js):
  - L385 list; L563 transcript; L821 resolve; L941 attendance-note (Foundry); L1063 matter-chain; L1242 save-note (blob + SQL); L1344 upload-note-nd; L1610 noted-ids; L1645 attendance-notes; L1687 saved-note.
- **No Clio time-entry write exists on this path.** Clio time entry endpoints exist elsewhere (matter-opening pipeline); we reuse the token primitive but add a new write-call endpoint for call-derived time entries.

### 2.3 Home journey feed

- [server/routes/home-journey.js L753](../../server/routes/home-journey.js#L753) — emits attendance-note items.
- Cache key `home-journey:*` at L842 — must invalidate on save.

### 2.4 Clio token

- [CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md](CLIO_TOKEN_REFRESH_SHARED_PRIMITIVE.md) — prerequisite for any new Clio write. Do not duplicate refresh logic.

### 2.5 Live file look-up primitive (reusable)

- Already working in forms (transcript: *"that's actually already working in forms... can probably put it from the SQL yeah. not having to look at their documents live"*). Trace the lookup component in `src/CustomForms/` and promote it (or re-export it) for reuse here rather than re-implementing.

---

## 3. Plan

### Phase A — Surface rename + prune

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Rename tab/surface to "Call Centre" | [CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx), [OperationsDashboard.tsx L6734](../../src/components/modern/OperationsDashboard.tsx#L6734), breadcrumb labels | Also update `CallTicketsStrip` header copy. |
| A2 | Collapse `JourneyFilter` to external-only | [CallsAndNotes.tsx L146](../../src/components/modern/CallsAndNotes.tsx#L146) | Remove `'all' \| 'internal' \| 'notes' \| 'activity' \| 'emails'`. Keep `'external'` as implicit default; remove filter chip row entirely. |
| A3 | Remove the banner | [CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) | Transcript: *"that whole banner... external calls, full stop"*. |
| A4 | Remove internal/notes/emails/activity data merge paths | [CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) | Keep only the `externalCalls` derivation at L1265; delete the rest. |
| A5 | Enlarge right-side action column | [CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) | Target ~10× current visual weight. Single primary action labelled **Add to file** (no "Craft"). Secondary actions behind overflow. |
| A6 | Default attendance-note ON | [CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) | Clicking **Add to file** triggers generation + preview. Explicit "skip note" affordance exists but is hidden behind confirm (rare case). |

**Phase A acceptance:** Call Centre shows only external calls. Banner gone. One big primary button per row. No regression in the existing attendance-note generation path.

### Phase B — Senior-attendee ownership

- **B1.** Internal-senior resolver. Add `resolveSeniorAttendee(internalInitialsList)` helper consuming the team roles table (see `.github/instructions/TEAM_DATA_REFERENCE.md`). Returns the most senior initials; ties broken by partner > associate > paralegal > trainee and then by alphabetical initials.
- **B2.** Apply in note metadata. In [CallsAndNotes.tsx L954](../../src/components/modern/CallsAndNotes.tsx#L954) attendance-note request payload and in [server/routes/dubberCalls.js L941](../../server/routes/dubberCalls.js#L941), set `primaryAttendeeInitials` = senior resolver output. Other internal attendees retained in `transcriptAttendees` but not in ownership.
- **B3.** External multi-attendee fallback. When an external call shows multiple external parties but only one phone→prospect match exists, flag the row with an amber "Unresolved attendee" badge — do not silently drop. Saving is allowed but the attendance note includes a placeholder "[Additional attendee identity unconfirmed]" that the reviewer replaces.

### Phase C — Attendance-note box (Clio-mirror review UI)

Replace inline preview with a modal/box styled like Clio's Create Time Entry form.

**C1. Layout (vertical order):**

1. **Matter** — live look-up field, prefilled from matter-chain resolution. Must list matching matters as user types (display number **or** client name). Uses SQL first; optionally live-looks-up NetDocs if SQL miss.
2. **Document type** — locked to "Attendance Note" with dropdown for future types.
3. **Date** — defaulted to call date, editable.
4. **Duration (non-chargeable)** — read-only, = call duration.
5. **Chargeable time** — editable numeric + unit (Clio's 6-minute units). Default = call duration rounded up to 6-min unit. Helper copy: *"Amend if your client should be charged less than the call duration."*
6. **Summary (editable)** — AI-generated body.
7. **Action points (checklist)** — each action-point from the AI extract rendered with a tick. User confirms individually; unticked ones drop from final note.
8. **Save button** — single primary action.

**C2. Save fork**

On Save:

- a) `POST /api/dubberCalls/:id/save-note` (existing, [L1242](../../server/routes/dubberCalls.js#L1242)) — blob + SQL.
- b) `POST /api/dubberCalls/:id/upload-note-nd` (existing, [L1344](../../server/routes/dubberCalls.js#L1344)) — NetDocuments upload.
- c) `POST /api/dubberCalls/:id/clio-time-entry` (**NEW**) — writes time entry to Clio (see Phase D).
- d) `POST /api/todo/reconcile` (Stream 2) — closes any open `call-attendance-note` To Do card for this user + call id.

Each leg runs in parallel with independent success/failure surfacing in the box. If (c) fails but (b) succeeds, the user sees a red strip: *"Attendance note filed. Clio time entry failed — retry?"* Idempotent retry button re-runs only the failed leg.

### Phase D — NEW Clio time-entry endpoint

- **D1.** `POST /api/dubberCalls/:id/clio-time-entry` in [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js). Body: `{matterDisplayNumber, chargeableMinutes, narrative, date, userInitials}`. Resolves Clio matter ID from display number (reuse matter-chain helper L1063). Uses the shared Clio token primitive.
- **D2.** Maps `userInitials` → Clio user id via existing Clio user directory (check `server/routes/clio*.js` for the primitive).
- **D3.** Narrative = summary text (or first 500 chars). Activity description = "Attendance Note – Telephone Call". Quantity = `chargeableMinutes / 60` hours with Clio-native rounding.
- **D4.** Telemetry: `CallCentre.TimeEntry.Started`, `.Completed`, `.Failed`; duration metric `CallCentre.TimeEntry.Duration`.
- **D5.** Failure handling: catch token-refresh failure separately from 4xx/5xx from Clio API. Return structured error `{code, message, retriable}` so the UI can make the "Retry Clio" affordance decisive.

### Phase E — Live matter look-up

- **E1.** Promote the forms live-lookup primitive into a shared component (likely under `src/components/matter-lookup/`). Consumes SQL first; optional NetDocs live look-up gated by a flag.
- **E2.** Wire into the attendance-note box's Matter field (Phase C1).
- **E3.** Verification: typing "bis" surfaces Biscap matters; typing a partial display number narrows.

### Phase F — Feature flag + Cognito redundancy

- **F1.** Feature flag `callCentre.enabled` at user-level. Default **off** at launch; LZ + AC flip on for themselves for production-smoke.
- **F2.** With flag off: Call Centre nav entry hidden; Cognito attendance-note form (existing) remains primary route.
- **F3.** With flag on: Cognito form still works (belt + braces). If a user files via Cognito first, the Cognito→Power Automate branch calls `/api/todo/reconcile` (Stream 2 Phase B4), which also marks any Call Centre box closed for that call id (via the reconcile matching on `matterRef`+`userInitials` — best-effort; if ambiguous, leave both open).

### Phase G — Demo-mode compatibility

- **G1.** Verify `DEMO_MODE_HARDENING_PRODUCTION_PRESENTABLE_END_TO_END` synthetic call timeline still renders under the pruned surface. Adjust fixtures if they depended on internal/emails/activity kinds.

---

## 4. Step-by-step execution order

1. **A1–A6** — ship Phase A behind the flag (F1). Staging only. No behavioural regression for flag-off users.
2. **E1–E3** — live look-up primitive ready.
3. **B1–B3** — senior resolver wired.
4. **C1** — new review box UI (save still uses existing endpoints; no Clio write yet — flag gates the box too).
5. **D1–D5** — Clio time-entry endpoint standalone; unit tested with a recorded Clio sandbox response.
6. **C2** — integrate fork (b)+(c)+(d) in the box's Save handler.
7. **F2–F3** — flag gating + Cognito reconciliation loop.
8. **G1** — demo-mode pass.
9. LZ + AC run real calls on staging end-to-end. Flip prod flag for LZ only. Monitor `CallCentre.*` telemetry for 48h before wider rollout.

---

## 5. Verification checklist

**Phase A:**
- [ ] Call Centre shows only external calls.
- [ ] No filter chip banner.
- [ ] One big **Add to file** button per row.

**Phase B:**
- [ ] Call with LZ + paralegal internal → ownership = LZ only; paralegal in transcript context only.
- [ ] External multi-attendee with missing phone → amber "Unresolved attendee" badge.

**Phase C–D:**
- [ ] Box layout matches Clio time-entry modal order.
- [ ] Chargeable time default = call duration rounded up; editable.
- [ ] Save produces ND upload **and** Clio time entry with matching narrative + duration.
- [ ] Failure of one leg doesn't block the other; retry affordance works.
- [ ] App Insights: `CallCentre.TimeEntry.Completed` visible with matter ref property.
- [ ] SQL spot check: `SELECT TOP 5 * FROM dubber_saved_notes ORDER BY created_at DESC;` shows sane rows.
- [ ] Clio sandbox: time entry appears under correct matter and user.

**Phase F:**
- [ ] Flag off: nav entry hidden, Cognito flow unchanged.
- [ ] Flag on: both paths work; reconcile closes To Do card in either direction.

---

## 6. Open decisions (defaults proposed)

1. **Rounding rule on chargeable time** — Default: **round up to nearest 6-minute unit** (Clio native). Reviewer can edit down.
2. **Narrative length** — Default: **first 500 chars of summary**, with full note in ND. Avoids Clio narrative bloat.
3. **Senior tie-breaker** — Default: partner > associate > paralegal > trainee; intra-tier = alphabetical initials.
4. **What if no internal attendee is identifiable?** — Default: **owner = logged-in user who opens the row**. Logged for audit.
5. **What if matter not resolvable from transcript?** — Default: **surface the box with Matter field empty + required**. User picks via live look-up.

---

## 7. Out of scope

- Internal calls (explicit).
- Email notes, Clio-activity feed on this surface (explicit).
- Rewriting the attendance-note generation prompt (retain existing Foundry prompt; audit later).
- Bulk save / bulk Clio push.
- Time entries for non-call work (that's Clio native).

---

## 8. File index

Client:
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) — main surface
- [src/components/modern/CallTicketsStrip.tsx](../../src/components/modern/CallTicketsStrip.tsx) — compact strip copy
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — mount point
- `src/components/matter-lookup/` (NEW, promoted from forms) — live look-up primitive

Server:
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) — prune surface feeds + add `/clio-time-entry` endpoint
- [server/routes/home-journey.js](../../server/routes/home-journey.js) — cache invalidation on save
- [server/routes/clio*.js](../../server/routes/) — reuse Clio primitive

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata

```yaml
# Stash metadata
id: call-centre-external-attendance-note-and-clio-mirror
verified: 2026-04-20
branch: main
touches:
  client:
    - src/components/modern/CallsAndNotes.tsx
    - src/components/modern/CallTicketsStrip.tsx
    - src/components/modern/OperationsDashboard.tsx
  server:
    - server/routes/dubberCalls.js
    - server/routes/home-journey.js
  submodules: []
depends_on:
  - clio-token-refresh-shared-primitive
coordinates_with:
  - home-todo-single-pickup-surface
  - demo-mode-hardening-production-presentable-end-to-end
  - forms-ia-ld-undertaking-complaint-flow
  - forms-stream-persistence
  - realtime-delta-merge
  - session-probing-activity-tab-visibility-and-persistence
  - ccl-backend-chain-silent-autopilot-service
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-experience-calm-rail-override-rerun-fix-docx-fidelity
  - ccl-review-landing-terser-intro-start-from-scratch-affordance-pipeline-toasting
  - ccl-review-pickup-via-todo-and-addressee-fix
conflicts_with: []
```

---

## 9. Gotchas appendix

- The matter-chain resolver ([dubberCalls.js L1063](../../server/routes/dubberCalls.js#L1063)) returns best-effort matches; do not assume a single-matter resolution. The box must show the candidate list and force a pick when >1.
- Clio rate limits: a busy call day could trigger 429. The new `/clio-time-entry` endpoint must honour `Retry-After` and surface a retriable error — never silently drop.
- Cognito → Power Automate reconciliation is best-effort. If the Cognito form files the same call twice (user confusion), the second write should be a no-op server-side (idempotency key = `dubber_call_id + owner`).
- `JourneyFilter` is referenced in tests and possibly in `CallTicketsStrip` props — grep before deleting values to avoid runtime errors.
- The AI attendance-note prompt currently produces action points as a bulleted list. The Phase C7 checklist parser must be resilient to trailing whitespace, numbered-list fallback, and blank bullets.
- The senior-attendee rule must NOT be applied to call-metadata display (transcript/listener initials) — only to ownership + To Do assignment. Otherwise the UI will look like paralegals "disappeared" from calls.
