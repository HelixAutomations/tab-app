# Hub rollout training and confidence recovery

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-30 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User direction in this session was: "stash this so we dont lose the transcript and action points". The newer transcript was about rollout/training, user confidence, reporting trust, pitch-builder discoverability, and the sense that the call-transcript workflow still is not joined up tightly enough for day-to-day use. The user then added an older transcript and suspected some of it may already have been actioned.

This brief is therefore not a fresh umbrella rewrite of Home, Call Centre, Forms, Chat, or Reporting. Its job is to preserve the newer action points, map the older transcript onto the work that is already stashed or already shipped, and give a future agent one clean coordination layer for deciding what the next real blocker is.

User is not asking for another duplicate stash that re-describes existing work already parked in separate briefs. The correct outcome is: keep the transcript/action-point context, point future work at the existing briefs where that work already lives, and only open one new execution slice where there is still a real rollout blocker.

---

## 2. Current state — verified findings

### 2.1 The older transcript is already split across dedicated open briefs

- The stash register already has open entries for the main older-transcript themes: Management trust gate at [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L9), Home To Do replacement at [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L19), Call Centre at [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L34), Chat removal at [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L35), and Forms/Register routing at [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L37).
- Those are backed by dedicated briefs, not vague placeholders: [docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md](../../docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md#L1), [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](../../docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md#L1), [docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md](../../docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md#L1), [docs/notes/CHAT_TAB_REMOVAL_RETAIN_INFRA.md](../../docs/notes/CHAT_TAB_REMOVAL_RETAIN_INFRA.md#L1), and [docs/notes/FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW.md](../../docs/notes/FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW.md#L1).
- The only currently-open brief that explicitly lists `src/tabs/enquiries/PitchBuilder.tsx` in its touch set is the proxy-retirement brief at [docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md](../../docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md#L138) and again in its metadata at [docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md](../../docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md#L157). That means Pitch Builder is already in an active coordination surface, but not yet under a dedicated rollout/discoverability brief.

### 2.2 Several older-transcript items are already shipped, not just parked

- Home already defaults to the To Do pickup layout and already has the softer secondary-prompt lane described in the realignment work: [logs/changelog.md](../../logs/changelog.md#L330) and [logs/changelog.md](../../logs/changelog.md#L332).
- Forms/Register routing is already materially shipped: Home To Do approval wiring at [logs/changelog.md](../../logs/changelog.md#L372), L&D/compliance surface reframing at [logs/changelog.md](../../logs/changelog.md#L438), and the compliance landing + form-led intake split at [logs/changelog.md](../../logs/changelog.md#L450).
- The call/transcript workflow is already live in multiple slices: missing-transcript empty state at [logs/changelog.md](../../logs/changelog.md#L56), transcript evidence rendered into the filing workspace at [logs/changelog.md](../../logs/changelog.md#L60), and a labelled "Generate from transcript" affordance at [logs/changelog.md](../../logs/changelog.md#L87).
- Reporting trust is also no longer hypothetical. The changelog shows active shipping of the Management trust gate and remediation loop at [logs/changelog.md](../../logs/changelog.md#L10), [logs/changelog.md](../../logs/changelog.md#L11), [logs/changelog.md](../../logs/changelog.md#L15), [logs/changelog.md](../../logs/changelog.md#L16), [logs/changelog.md](../../logs/changelog.md#L17), and [logs/changelog.md](../../logs/changelog.md#L18).
- Pitch Builder remains a live, recently-edited surface rather than a dead branch: [logs/changelog.md](../../logs/changelog.md#L12).

### 2.3 The live product surfaces already exist; the remaining gap is rollout confidence and join-up

- Pitch Builder is still a large primary surface with the main component at [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx#L556) and `VerificationSummary` mounted at [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx#L4696). Any discoverability polish will likely land here first.
- Calls and Notes is already operating as a two-half call-centre surface: component entry at [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L576), explicit "External Calls" label at [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2400), explicit "Call Filing Workspace" label at [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2408), and missing-transcript copy at [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L1790) and [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2966).
- The filing box already exposes both the AI path and the manual fallback: [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L851) and [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L874).
- Reporting already has the live trust surfaces wired in: `ReportingReadinessGate` import at [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L33), refusal to open when blocked at [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L4054), gate mount at [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L4576), trust rail import at [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx#L19), rail mount at [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx#L2257), degradation copy at [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx#L2279), and refresh CTA at [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx#L2292).
- The server contract for that reporting trust flow is live, not planned-only: readiness route at [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js#L466) and remediation route at [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js#L618).

### 2.4 What is still missing is a coordination layer for rollout, owner, and blocker order

- The stash register proves the underlying feature work is fragmented across multiple briefs, but there is no dedicated brief for the newer transcript's rollout/training problem. This new file is that layer.
- The practical remaining question is no longer "build all this from scratch". It is "which already-existing surface is still preventing confident rollout, who owns the pilot, and which single blocker should be fixed first".

### 2.5 Snapshot — locked classification (2026-04-30)

Phase A1 result. Each transcript theme is mapped once to `shipped`, `open brief`, or `new gap`. **Do not spawn duplicate umbrella briefs for any of these.**

| Transcript theme | Status | Anchor |
|---|---|---|
| Management/Reporting trust gate | shipped + open brief | gate live in `ReportingHome.tsx` L4576 + `ManagementDashboard.tsx` L2257; further work parked under `management-dashboard-trust-gate` |
| Home To Do as primary pickup | shipped + open brief | default layout shipped (changelog L330/L332); deeper rebuild parked under `home-todo-single-pickup-surface` |
| Forms / Register routing | shipped + open brief | approval wiring + L&D + intake split shipped (L372/L438/L450); remaining IA work under `forms-ia-ld-undertaking-complaint-flow` |
| Call-transcript workflow | shipped + open brief | empty state + transcript evidence + "Generate from transcript" shipped (L56/L60/L87); call-centre architecture under `call-centre-external-attendance-note-and-clio-mirror` |
| Chat tab removal | open brief | `chat-tab-removal-retain-infra` |
| Pitch Builder discoverability | new gap | live surface exists at `PitchBuilder.tsx` L556; only proxy-retirement brief touches it; no dedicated discoverability brief |
| Rollout owner / pilot loop / training cadence | new gap | this brief is the only home for it |

**Phase A2 — owner and pilot (locked):**
- Rollout owner: **Emma** (default from §6, accepted).
- First pilot cohort: Emma + Jonathan (real day-to-day usage on the live build).
- Feedback cadence: each finding routed into one of three buckets — narrow fix, attach to existing brief, or close as already-shipped — per Phase E.

**Phase A3 — chosen next blocker (locked):**
- **Reporting entry UX redesign.** Justification: the current trust gate is a basic dev strip optimised for LZ. The Reports entry must look like a normal first-class tab with a subtle access indicator and one-click resolution, available to every `canAccessReports` user (not only LZ). See Phase C below for the locked spec.
- Pitch Builder discoverability and Call-Notes join-up stay parked. Do **not** open them in parallel with this slice.

---

## 3. Plan

### Phase A — Rollout checkpoint and blocker triage

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Map transcript actions to `shipped`, `open brief`, or `new gap` | [docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md](../../docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md) | Prevent a second umbrella brief that duplicates Home, Call Centre, Forms, Chat, or Reporting work already parked elsewhere. |
| A2 | Name the rollout owner, pilot users, and feedback cadence | [docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md](../../docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md) | Turn the newer transcript into an explicit operator loop rather than loose recollection. |
| A3 | Pick exactly one next blocker slice | [docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md](../../docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md) | Only one of these should become the next live implementation: Pitch Builder discoverability, Reporting confidence prove-out, or call-transcript workflow join-up. |

**Phase A acceptance:**
- Every major transcript action point is classified once.
- Existing briefs are referenced, not duplicated.
- A named owner and first pilot group exist.
- There is one chosen next blocker, not three concurrent rewrites.

### Phase B — Pitch Builder discoverability polish

Use the existing Pitch Builder surface, not a new shell. Start from [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx#L556) and the mounted summary/launch area at [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx#L4696). The goal is not to redesign the whole pitch flow; it is to make the thing a first-time user is supposed to click or trust visually obvious.

Coordinate with [docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md](../../docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md#L157) because that brief already claims `src/tabs/enquiries/PitchBuilder.tsx`.

### Phase C — Reporting entry UX redesign (CHOSEN — in flight)

Do not rebuild the trust gate logic. Keep the readiness fetch, verdict, and override flow at [src/tabs/Reporting/ReportingReadinessGate.tsx](../../src/tabs/Reporting/ReportingReadinessGate.tsx) and [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js#L466). What changes is the entry-surface presentation only.

**Spec (locked 2026-04-30):**

1. **Remove the prominent dev-grade strip above the Management hero card.** The current `<ReportingReadinessGate>` mount at [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L4576) dominates the entry list and feels LZ-only. Reports entry must look like a normal first-class tab, not a diagnostic page.
2. **Render a subtle access indicator on the Management Dashboard card itself**, not above it. A small status dot (green = ready, amber = warn, red = blocked) sits inline with the card title. No always-visible chrome about "trust".
3. **One-click resolution when blocked.** Hovering / clicking the indicator reveals a compact popover with the single most relevant reason (one line, e.g. "Collected parity needs refresh") and one button: "Refresh and retry". Click → fires `POST /api/reporting/management-readiness/refresh` then re-fetches; on success the dot flips to green and the dashboard becomes openable. No menus, no list of seven checks on the entry surface.
4. **Drop the "manual refresh required before verdict counts" gate.** Today the component refuses to report `ready` until the user clicks Refresh once. That is a debug belt-and-braces — remove it; trust the latest payload.
5. **Audience widening.** Indicator + one-click refresh must be available to every `canAccessReports` user (LZ, AC, KW, JW, EA), not just the dev preview tier. The admin override path stays admin-only and stays invisible unless the indicator is red.
6. **Detail-on-demand stays available.** A small "Details" link inside the popover navigates to the full readiness rail already shipped in `ManagementDashboard.tsx` (via the existing trust-rail anchor). The full rail is still the source of truth; it just stops being the entry experience.

**Out of scope for this slice:**
- Adding new readiness checks.
- Changing the server contract at [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js#L466).
- Touching `ManagementDashboardTrustRail.tsx` (the in-dashboard rail stays as is).
- KPI redesign, observability rebuild, or any other Reports tab.

**Acceptance:**
- Reports tab entry shows the report cards with no banner above them.
- The Management Dashboard card has a small inline status dot.
- Clicking the dot when amber/red opens a one-line reason + one button. Click → refresh → resolve.
- Non-LZ admins see the same dot and the same one-click resolution.
- Existing entry-block behaviour for `blocked` verdict is preserved (dashboard still refuses to open while red), but enforcement happens silently behind the indicator instead of via a scrollIntoView on a noisy strip.

### Phase D — Call transcript workflow join-up and training handoff

Use the existing call-centre shell in [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2400) and [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2408), plus the existing filing actions in [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L851) and [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L874). The likely work is not transcript rendering itself; it is reducing the gap between "I can see the transcript" and "I know what to do with it next".

Coordinate with [docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md](../../docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md#L1) rather than creating a second call-centre architecture brief.

### Phase E — Pilot rollout and feedback capture

Run the first-wave rollout with the named trainer/owner, collect concrete friction points from Emma/Jonathan-level real usage, and file each finding into one of three buckets:

- fix immediately as a narrow slice,
- attach to an existing brief,
- or close as already shipped / not actually a blocker.

---

## 4. Step-by-step execution order

1. **A1** — Re-read this brief plus the linked stash entries and shipped changelog evidence; mark each transcript item as `shipped`, `open brief`, or `new gap`.
2. **A2** — Record the rollout owner, pilot users, and feedback cadence in this brief before touching code.
3. **A3** — Choose the single next blocker slice.
4. **B / C / D** — Work only the chosen blocker surface first.
5. *(parallel with 4 once a fix exists)* **E1** — Run a live pilot walkthrough with the actual operator cohort.
6. **E2** — Convert resulting feedback into either a shipped narrow fix or a cross-reference into an existing brief; do not spawn overlapping umbrella briefs.
7. **Close-out** — Once the rollout blocker list is stable, either close this brief as done or narrow it to the one remaining coordination item.

---

## 5. Verification checklist

**Phase A:**
- [ ] Every major action point from the newer and older transcript is classified as `shipped`, `open brief`, or `new gap`.
- [ ] No duplicate stash brief is created for Home To Do, Call Centre, Forms/Register routing, Chat removal, or Management trust work already parked.
- [ ] A named rollout owner and first pilot group are written down.

**Phase B:**
- [ ] If Pitch Builder is the chosen blocker, the first-click path is obvious in a live walkthrough.
- [ ] If Reporting is the chosen blocker, the entry gate and trust rail behaviour are verified against current live data or a forced degraded path.
- [ ] If Calls/Notes is the chosen blocker, a user can move from selected call to transcript-backed filing without confusion, while manual fallback still exists.
- [ ] Any touched reporting server changes still emit `Reporting.Readiness.*` telemetry.
- [ ] Any touched call-flow server changes still preserve the existing Dubber/Call-Centre pipeline behaviour end to end.

---

## 6. Open decisions (defaults proposed)

1. **Who owns the first-wave rollout/training loop?** — Default: **Emma**. Rationale: the newer transcript positions Emma as a natural training/adoption node, while Luke remains escalation owner.
2. **Which blocker ships first if all three still feel rough?** — Default: **Pitch Builder discoverability first**. Rationale: it is likely the smallest isolated client-side slice and fastest way to remove avoidable friction.
3. **Should Reporting be widened before a live confidence walkthrough on the current build?** — Default: **No**. Rationale: the trust gate already exists; prove it in real operator use before widening trust claims.
4. **Should call-transcript follow-up add new Home To Do routing in this brief?** — Default: **No**. Rationale: coordinate with [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](../../docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md#L1) instead of duplicating routing logic here.

---

## 7. Out of scope

- Rebuilding Home To Do architecture from scratch.
- Re-implementing the Management trust gate from zero.
- Re-opening Chat removal unless the user explicitly wants that brief picked up.
- Rewriting Forms/Register foundations that are already shipped or already covered by the dedicated forms brief.
- Creating another umbrella brief for Call Centre internals that duplicates [docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md](../../docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md#L1).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx#L556) — live Pitch Builder surface; likely home of any discoverability polish.
- [src/tabs/enquiries/pitch-builder/VerificationSummary.tsx](../../src/tabs/enquiries/pitch-builder/VerificationSummary.tsx) — likely first-click / summary affordance companion to Pitch Builder.
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L576) — current External Calls + Call Filing Workspace shell.
- [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L851) — transcript-backed filing CTA and manual fallback.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L4576) — Management readiness gate mount.
- [src/tabs/Reporting/ManagementDashboard.tsx](../../src/tabs/Reporting/ManagementDashboard.tsx#L2257) — in-dashboard trust rail and degradation veil.

Server:
- [server/routes/reportingReadiness.js](../../server/routes/reportingReadiness.js#L466) — reporting readiness contract and remediation entrypoint.
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) — call transcript / filing / Clio mirror server path to coordinate with Calls & Notes work.

Scripts / docs:
- [docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md](../../docs/notes/HUB_ROLLOUT_TRAINING_AND_CONFIDENCE_RECOVERY.md) (NEW) — coordination brief for the newer transcript and rollout blocker ordering.
- [docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md](../../docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md#L1) — existing reporting-confidence implementation brief.
- [docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md](../../docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md#L1) — existing Home pickup-surface brief.
- [docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md](../../docs/notes/CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.md#L1) — existing call-centre brief.
- [docs/notes/FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW.md](../../docs/notes/FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW.md#L1) — existing Forms/Register routing brief.
- [docs/notes/CHAT_TAB_REMOVAL_RETAIN_INFRA.md](../../docs/notes/CHAT_TAB_REMOVAL_RETAIN_INFRA.md#L1) — existing chat-removal brief.
- [docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md](../../docs/notes/RETIRE_HELIX_KEYS_PROXY_AND_ADD_FORM_ROUTE_PREFLIGHT.md#L157) — current open brief that already claims Pitch Builder.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-rollout-training-and-confidence-recovery                          # used in INDEX cross-refs
verified: 2026-04-30
branch: main
touches:
  client:
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/enquiries/pitch-builder/VerificationSummary.tsx
    - src/components/modern/CallsAndNotes.tsx
    - src/components/modern/AttendanceNoteBox.tsx
    - src/tabs/Reporting/ReportingHome.tsx
    - src/tabs/Reporting/ManagementDashboard.tsx
  server:
    - server/routes/reportingReadiness.js
    - server/routes/dubberCalls.js
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with:
  - management-dashboard-trust-gate
  - call-centre-external-attendance-note-and-clio-mirror
  - home-todo-single-pickup-surface
  - forms-ia-ld-undertaking-complaint-flow
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - demo-mode-hardening-production-presentable-end-to-end
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

- The stash queue can make something look "unshipped" even when large parts are already live. Management trust is the clearest example: the brief is still open in [docs/notes/INDEX.md](../../docs/notes/INDEX.md#L9), but live code and changelog entries show the gate/rail/remediation loop already mounted and shipped. Re-verify live code before assuming the brief is untouched.
- The Calls & Notes gap is no longer raw transcript visibility. The transcript placeholder, filing-workspace rendering, and CTA copy are already there in [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L1790), [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L2966), and [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L851). The remaining problem is workflow confidence and downstream action clarity.
- Pitch Builder already sits inside the proxy-retirement brief's touch list. If a future agent edits Pitch Builder for rollout polish, re-run stash precheck and coordinate with that brief instead of treating Pitch Builder as an untouched surface.
- The user's newer request is operationally narrower than the older transcript. If a future agent starts rewriting Home, Forms, Chat, or Call Centre wholesale from this brief alone, they are widening scope incorrectly.
