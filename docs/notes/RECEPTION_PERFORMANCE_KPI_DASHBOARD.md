# Reception Performance KPI dashboard

> **Purpose of this document.** This is a self-contained brief that any future agent can pick up cold and execute without prior context. It scopes the full Reception Performance implementation, from the current call-taker KPI report through to a joined call-taking to matter-opening dashboard.
>
> **How to use it.** Read the whole document once. If `reception-kpis-direct-db-tap` is still open, ship or merge that foundation first. Then implement Phase A and continue phase by phase. Add a `logs/changelog.md` entry per shipped phase.
>
> **Verified:** 2026-05-24 against branch `main`. If reading this more than 30 days later, re-verify file and line refs before executing.

---

## 1. Why this exists (user intent)

User, verbatim: *"the goal is to surface a proper surface. my team expects a basic how many calls etc. so thats the bar but i want to crush it and we are well positiioned for it."*

User, verbatim: *"we are linking the matters via the whole new workbench pipeline workflow and we have the activity and enquiry id from the very early stages, so this now starts joining call takig to matter opening."* User also called out the architectural boundary: *"otherwise the enquiry processing platform would have to tap into matters and pitches and things."*

User, verbatim: *"ensure that in the early stages we are aleady thinking aout quality and reassuring deasign and look and feel and realtime singnals when data comes in and updates in realtime in the backend. id like the dashboard to subtly indicate/hghlight the updates as they come in without relying on a higher level refresh for this."*

The ask is not just a table of calls. The correct product is a tab-app Reception Performance surface that starts with call-taking signals from enquiry-processing and the `instructions` database, then joins them to tab-app's workbench and matter-opening pipeline so Reception can be assessed on the full path from call to instructed matter. enquiry-processing remains the source for early call intake. tab-app is the join point for matters, pitches, instructions, and operational reporting.

Early implementation principle: quality, coverage truth, and realtime reassurance belong in Phase A. The report should reuse existing tab-app realtime channels where possible, keep refreshes scoped to Reception data, and avoid adding a new polling or global Reporting refresh path unless the existing stream cannot carry the signal.

---

## 2. Current state: verified findings

### 2.1 Reception KPI route exists, but it is still a starter read model

- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L1) is a direct read from the `instructions` SQL database, mounted at `GET /api/reporting/reception-kpis`.
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L46) now treats date-only `to` values as the next day's midnight, so user-visible date ranges include the selected final day and single-day windows are valid.
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L79) aggregates `incoming_calls`, `dubber_recordings`, `enquiries`, `TeamsBotActivityTracking`, and `Instructions`.
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L141) currently links call outcome to Instructions by `dbo.enquiries.acid` and `InstructionRef LIKE 'HLX-' + acid + '-%'`. This is useful, but it is weaker than the workbench pipeline link because it cannot see all tab-app matter-opening context.
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L150) now returns handler-level aggregates plus a capped call-level evidence lane. Evidence rows include call id, call time, handler, duration source, enquiry id/ACID, Teams activity identifiers where available, instruction ref/stage, matter id/display number, outcome, call-to-matter timing where defensible, and join confidence.
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L257) has a 60 second in-process cache, and [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L294) emits `Reporting.ReceptionKpis.Query.Started/Completed/Failed` telemetry.

### 2.2 Reception report UI is wired, but it still behaves like a basic KPI tab

- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L67) consumes the route shape: `window`, `handlers`, `totals`, and `coverage`.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L101) formats dates as `YYYY-MM-DD`; the backend now interprets the date-only upper bound as inclusive for the selected day.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L318) now refreshes by bumping its own fetch nonce only. [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L816) declares `requiredDatasets: []`, so Reception no longer receives the global dataset refresh callback.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L361) renders the KPI strip: calls taken, handled, average call, conversion, notes clarity, opened, and in flight.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L388) renders the handler table, but the column labelled `Time -> matter` is currently only opened vs in-flight counts.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L204) now says the conversion tile is opened over calls taken, matching [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js#L225).
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L132) keeps the detailed intro collapsible, and the report now has a compact always-visible coverage strip for source, notes sample, ring-time status, and realtime status.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx#L330) subscribes to `/api/enquiries-unified/stream` via `useRealtimeChannel` for `pipeline.changed` and `enquiries.changed`; matching events trigger a debounced local Reception refetch and a subtle update cue.
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) now renders a `Call-to-matter evidence` panel with instruction-link rate, matter-link rate, unlinked-call count, latest source timestamp, latest evidence rows, and a selected-row detail panel. This is the first visible bridge from call taking to matter opening.

### 2.3 Reports navigation is already live

- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L66) imports `ReceptionReport`.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L816) registers the card as `key: 'receptionReport'`, name `Reception Performance`, status `Evidence live`, tier `prod`, with no required datasets.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L1611) adds the `Reception` nav tab to the prod group.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx#L6389) renders `ReceptionReport` without passing global `isFetching`, `lastRefreshTimestamp`, or `refreshDatasetsWithStreaming`.

### 2.4 Existing realtime path is realistic enough for Phase A

- [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) provides the shared EventSource registry and HMR cleanup. Use it instead of creating a second direct `EventSource` consumer.
- [server/utils/enquiries-stream.js](../../server/utils/enquiries-stream.js) exposes `/api/enquiries-unified/stream` and broadcasts `pipeline.changed` and `enquiries.changed` events.
- [server/utils/eventHandlers.js](../../server/utils/eventHandlers.js) routes `matter.requested`, `matter.opened`, `deal.created`, `deal.updated`, `instruction.completed`, and payment events into `pipeline.changed` broadcasts.
- Phase A should treat this as a lightweight indication channel: signal, refetch the Reception route, and show a subtle cue. Do not make it the source of metric truth.

### 2.5 The workbench already knows how to join enquiries, deals, instructions, and matters

- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L86) builds a `Map<string, WorkbenchItem>` from enriched instruction data.
- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L105) indexes instructions by `InstructionRef`, deals by `InstructionRef`, and deals by `ProspectId`.
- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L183) uses the preferred linkage: `Instruction.ProspectId` or a `HLX-{ProspectId}-{Passcode}` pattern extracted from `InstructionRef`.
- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L191) also links deal-only pitch records by `Deal.ProspectId` or `Deal.InstructionRef`.
- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L222) adds an email fallback for v2 enquiries where IDs are not present.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx#L535) builds the inline workbench map, and [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx#L544) resolves an enquiry to its workbench item by `ACID`, fallback ID, legacy ID, then email.
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx#L586) dispatches instruction actions by `InstructionRef`, keeping Enquiries and Instructions coordinated.

### 2.6 InlineWorkbench exposes the same identifiers the dashboard needs

- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L526) derives `baseInstructionRef` from instruction or deal data.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L552) hydrates missing instruction details from `/api/instructions/:instructionRef`.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L649) finds the matching matter by `InstructionRef` or `MatterId`.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L836) builds a Teams identifier from a tracking record ID, falling back to `prospectId` as enquiry ID.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L853) fetches a Teams card link from `/api/teams-activity-tracking/link/:identifier`.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L894) keeps `instructionRef` sourced from instruction/deal for ID, EID, risk, matter, and document actions, while [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx#L897) uses stable enquiry ID for motion.

### 2.7 Matter opening records the downstream truth tab-app owns

- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L26) generates a per-run `matterTraceId`, and [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L92) sends it as `x-matter-trace-id` on matter-opening API calls.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L288) creates a placeholder matter request with `instructionRef`, source/referrer, fee earner, supervising partner, practice area, value, and other opening metadata.
- [server/routes/matterRequests.js](../../server/routes/matterRequests.js#L21) handles `POST /api/matter-requests`, inserts a row into `Matters`, and [server/routes/matterRequests.js](../../server/routes/matterRequests.js#L149) emits `matter.requested` with the placeholder `matterId`.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L373) opens the Clio matter, and [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L385) stores the returned Clio matter id and display number.
- [server/routes/clioMatters.js](../../server/routes/clioMatters.js#L708) emits `MatterOpening.ClioMatter.Completed` with `displayNumber` and `clioMatterId`; [server/routes/clioMatters.js](../../server/routes/clioMatters.js#L711) emits `matter.opened` with the same downstream identifiers.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L435) patches the placeholder matter request with `instructionRef`, `clientId`, `displayNumber`, and `clioMatterId`.
- [server/routes/matterRequests.js](../../server/routes/matterRequests.js#L164) handles the patch, and [server/routes/matterRequests.js](../../server/routes/matterRequests.js#L218) updates `Matters.InstructionRef`, `ClientID`, `DisplayNumber`, and `MatterID`.

### 2.8 Teams activity and early enquiry IDs are already available to tab-app

- [server/routes/enquiryEnrichment.js](../../server/routes/enquiryEnrichment.js#L34) documents the important mapping: `TeamsBotActivityTracking.EnquiryId` uses new instructions enquiry IDs, while legacy IDs are stored in `instructions.enquiries.acid`.
- [server/routes/enquiryEnrichment.js](../../server/routes/enquiryEnrichment.js#L43) maps legacy IDs to new enquiry IDs via `dbo.enquiries.acid` before querying Teams activity.
- [server/routes/enquiryEnrichment.js](../../server/routes/enquiryEnrichment.js#L75) selects `Id`, `ActivityId`, `EnquiryId`, `CardType`, `TeamsMessageId`, `ClaimedBy`, `ClaimedAt`, `CreatedAt`, and `UpdatedAt` from `TeamsBotActivityTracking`.
- [server/routes/teamsActivityTracking.js](../../server/routes/teamsActivityTracking.js#L1) exposes the Teams activity link API used by InlineWorkbench.

### 2.9 enquiry-processing source remains read-only reference

- [submodules/enquiry-processing-v2/Controllers/ReportingController.cs](../../submodules/enquiry-processing-v2/Controllers/ReportingController.cs) remains the original call-intake KPI source and should not be edited from tab-app.
- [submodules/enquiry-processing-v2/documentation/RECEPTION-KPI-FRONTEND-BRIEF.md](../../submodules/enquiry-processing-v2/documentation/RECEPTION-KPI-FRONTEND-BRIEF.md) is a useful endpoint contract, but it is not enough for the full tab-app dashboard because it cannot own matter/pitch joins.
- [submodules/enquiry-processing-v2/wwwroot/call-hub/app.js](../../submodules/enquiry-processing-v2/wwwroot/call-hub/app.js) is the closest product reference for live operator evidence: source feed plus explicit coverage plus event stream. Treat it as read-only inspiration, not a dependency.

---

## 3. Plan

### Phase A: make the current Reception report trustworthy

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Fix date-window semantics | [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js), [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) | Treat date-only `to` as the next day's midnight when it came from the report UI, or send an exclusive `toExclusive` date from the client. Verify one-day, week, month, quarter, and FY ranges. |
| A2 | Align conversion denominator | same files | Choose one denominator and make code and copy match. Default: opened over calls taken, because the server already computes it that way and it keeps abandoned/unhandled calls visible. |
| A3 | Move coverage truth into the main surface | [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx), [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css) | Add a compact always-visible coverage strip near the KPI tiles: call source, note clarity sample, ring-time missing, and final-day inclusion. Keep the detailed intro collapsible. |
| A4 | Make refresh scoped | [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx), [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | Reception refresh should refetch its own route only. Do not trigger `refreshDatasetsWithStreaming` for a report whose `requiredDatasets` is empty. |
| A5 | Adjust live/prod labelling if needed | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) | If ring time and matter evidence are not yet present, change status copy from `Live today` to a more honest operational label until Phase C/D lands. Keep access tier unchanged unless user wants a dev-preview gate. |
| A6 | Add subtle realtime reassurance | [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx), [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css), [src/hooks/useRealtimeChannel.ts](../../src/hooks/useRealtimeChannel.ts) | Reuse `/api/enquiries-unified/stream` through `useRealtimeChannel`, listen for `pipeline.changed` and `enquiries.changed`, debounce to a Reception-only refetch, and show a small live signal/update cue. Avoid a new polling loop and avoid the global Reporting refresh. |

**Phase A acceptance:**

- One-day range returns 200 and includes that day.
- UI conversion copy matches the API denominator.
- Coverage limitations are visible without opening the intro.
- Refresh does not pull global Reporting datasets.
- Backend pipeline/enquiry signals produce a subtle local update cue and Reception-only refetch.
- Existing KPI report remains usable even before the richer dashboard lands.

### Phase B: extend the server read model in tab-app

**Progress note 2026-05-25:** The first read-model slice is now live inside `/api/reporting/reception-kpis`: aggregate rows are shaped from call-level evidence, the response includes a capped `evidence.rows` collection plus join coverage, and the UI renders the first evidence lane. Remaining Phase B work is to split a dedicated paged evidence endpoint, deepen the join model, and add route-level tests.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Split aggregate and evidence queries | [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) or new [server/routes/receptionPerformance.js](../../server/routes/receptionPerformance.js) | Keep `/reception-kpis` for aggregates if already consumed. Add a richer endpoint for call-level rows and handler drill-downs. |
| B2 | Add call evidence fields | same route | Return call id, created time, handler, status, enquiry id, acid, Dubber id, duration source, FE notes rating/comment timestamps, Teams activity id, Teams message timestamp, and confidence reasons. |
| B3 | Add handler rollups with confidence | same route | Per handler, return calls taken, handled, avg talk time, notes clarity, opened matters, in-flight instructions, median call-to-matter time, unrated notes count, and missing-link count. |
| B4 | Add coverage object per metric | same route | Keep each metric honest: `complete`, `partial`, `not_yet_tracked`, `not_applicable`. Include `source`, `denominator`, and `knownGaps`. |
| B5 | Telemetry and cache | same route | Emit `Reporting.ReceptionPerformance.Query.Started/Completed/Failed`, `Reporting.ReceptionPerformance.Evidence.Started/Completed/Failed`, and duration metrics. Cache aggregates for 60 seconds; keep evidence either uncached or very short TTL. |

**Read-model join sequence:**

1. Start with `dbo.incoming_calls` for call id, `created_at`, `taken_by`, `status`, `enquiry_id`, and form duration.
2. Join `dbo.dubber_recordings` by `matched_dubber_recording_id` for talk duration.
3. Join `dbo.enquiries` by `incoming_calls.enquiry_id = enquiries.id` to get `acid` and any v2 enquiry fields.
4. Join `dbo.TeamsBotActivityTracking` by new enquiry id for activity evidence and notes clarity feedback.
5. Join Instructions by the current conservative path: `InstructionRef LIKE 'HLX-' + enquiries.acid + '-%'`.
6. Join tab-app matter-opening rows in `dbo.Matters` by `InstructionRef`, then by patched `DisplayNumber`/`MatterID` where present.
7. Report a `joinConfidence` for each row: `matterRequestPatched`, `instructionRefExact`, `acidPattern`, `teamsOnly`, or `unlinked`.

### Phase C: join call-taking to the workbench pipeline

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Define a canonical Reception pipeline row | new helper under [server/utils](../../server/utils) or route-local function | Shape: `call`, `enquiry`, `teamsActivity`, `instruction`, `deal`, `matterRequest`, `clioMatter`, `coverage`, `joinConfidence`. Keep PII out of telemetry. |
| C2 | Reuse workbench identity rules | [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts) as reference, server-side helper if needed | Mirror the same priority: `ACID`/`ProspectId`, `InstructionRef`, legacy id, then email fallback. Do not make enquiry-processing know about matters or pitches. |
| C3 | Use matter-opening events and patched rows as downstream truth | [server/routes/matterRequests.js](../../server/routes/matterRequests.js), [server/routes/clioMatters.js](../../server/routes/clioMatters.js), read model route | Prefer patched `Matters.DisplayNumber` and `Matters.MatterID` for opened matters. Use `matter.opened` event timestamps where available for precise opened-at timing. |
| C4 | Add evidence drill-down endpoint | new endpoint under `/api/reporting/reception-performance/evidence` | Filter by date window, handler, outcome, note clarity, join confidence, and matter state. Return paged rows with no raw client free-text unless explicitly required and masked. |
| C5 | Add operator smoke endpoint | new endpoint or operator action | A read-only smoke that checks source table row counts, latest call timestamp, Teams linkability, Instructions join rate, matter join rate, and route duration. |

**Phase C acceptance:**

- A call row can show whether it reached Teams, whether it linked to an instruction, whether it opened a matter, and which join path was used.
- Matter linkage lives in tab-app. No submodule code changes are needed.
- Missing joins are visible as product truth, not silent drops.

### Phase D: build the proper Reception Performance surface

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Rename/position the report surface | [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx), [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) | User-facing label should become `Reception Performance` or similar while preserving route key unless a rename is worth the churn. |
| D2 | Executive snapshot | [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) or new child components | First screen: calls taken, answered/handled, avg talk time, notes clarity, opened matters, in-flight, median time to matter, join coverage. |
| D3 | Handler comparison | same client area | Dense table with sortable columns: handler, calls, handled %, avg call, clarity, opened, in-flight, call-to-matter median, unrated notes, missing joins. |
| D4 | Evidence drawer | new child component and CSS | Clicking a handler or KPI opens call-level evidence: call time, handler, Teams card link, enquiry id, instruction ref, matter display number, opened-at, notes clarity rating, confidence reason. |
| D5 | Coverage and confidence band | same client area | Always-visible coverage strip: `Ring time not wired`, `Notes sample`, `Matter join confidence`, `Latest source timestamp`, and `Rows excluded`. |
| D6 | Empty, loading, degraded states | same client area | Structural loading with fixed card/table geometry. Keep last successful payload visible if a refresh fails. |
| D7 | Premium but operational styling | [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css) | Stay within Helix Reporting visual language: border radius 0, dense table, calm hierarchy, clear operational scanning, no marketing hero. |

**Phase D acceptance:**

- A team member can answer the basic question: how many calls, who took them, how long did they take, what opened.
- A partner can answer the better question: which call-taking behaviours correlate with clear notes, faster pipeline progress, and opened matters.
- Every visible metric explains its data coverage and known gaps.
- The first viewport feels like a proper operational surface, not a proof-of-concept report.

### Phase E: validation, release, and stash closure

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Add tests where cheap | server test or route smoke | Cover date window semantics, aggregate totals, empty result shape, and evidence row shaping. |
| E2 | Run focused validation | terminal | Minimum: route smoke, `npm run build` or repo-appropriate typecheck, and manual Reports -> Reception Performance path in `npm run dev:fast`. |
| E3 | Changelog | [logs/changelog.md](../../logs/changelog.md) | Add one entry per shipped phase. Final entry should reference `reception-performance-kpi-dashboard`. |
| E4 | Archive this stash | terminal | After delivery is confirmed: `node tools/stash-close.mjs reception-performance-kpi-dashboard`, then `node tools/stash-status.mjs`. Do not hand-edit [docs/notes/INDEX.md](../../docs/notes/INDEX.md). |

---

## 4. Step-by-step execution order

1. Re-check current dirty worktree and confirm whether `reception-kpis-direct-db-tap` has shipped or is still represented by local changes.
2. Implement Phase A as the trust baseline.
3. Run the Phase A route smoke and UI range checks.
4. Implement Phase B aggregate and evidence read model.
5. Run server route smoke for aggregate and evidence payloads.
6. Implement Phase C join confidence and matter-opening linkage.
7. Run a prod-parity read-only smoke against a real recent window, summarising only counts and coverage, not raw PII.
8. Implement Phase D UI, keeping the first viewport dense and operational.
9. Run focused frontend validation and manual Reports path in `npm run dev:fast`.
10. Add changelog entries.
11. Once the user confirms the implementation is shipped, run `node tools/stash-close.mjs reception-performance-kpi-dashboard` and then `node tools/stash-status.mjs`.

---

## 5. Verification checklist

**Phase A:**
- [ ] `GET /api/reporting/reception-kpis?from=YYYY-MM-DD&to=YYYY-MM-DD` for a single day returns 200 and includes that day.
- [ ] Week, month, quarter, and FY range pills request the expected inclusive user-visible range.
- [ ] Conversion copy and denominator match.
- [ ] Coverage strip is visible before the intro is expanded.
- [ ] Reception refresh does not trigger the global Reporting data stream.
- [ ] A `pipeline.changed` or `enquiries.changed` signal causes a debounced Reception-only refetch and visible but subtle live cue.

**Phase B:**
- [ ] Aggregate endpoint returns `window`, `handlers`, `totals`, `coverage`.
- [ ] Evidence endpoint returns paged rows with call, enquiry, Teams, instruction, matter, and confidence objects.
- [ ] Empty date windows return stable empty shapes.
- [ ] App Insights events: `Reporting.ReceptionPerformance.Query.Started/Completed/Failed` and `Reporting.ReceptionPerformance.Evidence.Started/Completed/Failed`.

**Phase C:**
- [ ] SQL spot check: recent `incoming_calls` count for the window matches route total calls taken.
- [ ] SQL spot check: linked instruction count by `enquiries.acid` matches route `instructionRefExact` plus `acidPattern` categories.
- [ ] SQL spot check: patched matter request rows in `Matters` match displayed opened-matter counts for a small sample.
- [ ] Evidence rows show `joinConfidence` and do not silently drop unlinked calls.

**Phase D:**
- [ ] Desktop and mobile first viewport have no overlap and no content jump during loading.
- [ ] Handler table remains scannable at narrow widths.
- [ ] Evidence drawer opens from a handler row and from KPI drill-downs.
- [ ] Teams links, instruction refs, and matter display numbers open or copy using existing app conventions.
- [ ] Error state keeps the last successful payload visible when possible.

**Phase E:**
- [ ] [logs/changelog.md](../../logs/changelog.md) includes the shipped phases.
- [ ] `node tools/stash-close.mjs reception-performance-kpi-dashboard` ran after confirmation.
- [ ] `node tools/stash-status.mjs` rebuilt [docs/notes/INDEX.md](../../docs/notes/INDEX.md).

---

## 6. Open decisions (defaults proposed)

1. **Report label.** Default: **Reception Performance**. Rationale: the surface is broader than static KPIs, but still obvious to the team.
2. **Conversion denominator.** Default: **opened matters over calls taken**. Rationale: it keeps unhandled/abandoned calls in the operating picture. If leadership wants handler-only conversion, add a second metric rather than changing the denominator silently.
3. **Matter-open timestamp.** Default: **prefer `matter.opened` event timestamp where available, fallback to `Matters` patch/update timestamp if present, then Clio display number presence as opened with unknown time**. Rationale: avoid false precision.
4. **Evidence text.** Default: **do not expose raw call notes/free-text in the dashboard**. Rationale: performance view needs links and metadata, not sensitive content.
5. **Submodule changes.** Default: **none**. Rationale: enquiry-processing should keep producing early call signals; tab-app owns the join to matters and pitches.
6. **Access tier.** Default: **Reports access via existing Reports tab gate**. Rationale: this is a management/reporting surface, not a dev-only control plane once coverage is honest.

---

## 7. Out of scope

- Editing `submodules/enquiry-processing-v2` beyond read-only sync/status checks.
- Making enquiry-processing call into tab-app matters, pitches, or workbench data.
- Persisting CallRail ring/wait time unless the source feed is already available in `instructions` DB.
- Free-text call quality scoring with AI. That should be a separate brief once evidence plumbing is stable.
- Rebuilding the whole Reports tab shell.
- Changing admin/report access tiers outside this report's registration.
- Production deploy. Use the normal production deploy guard if deployment is requested later.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) - current report component, likely main UI target.
- [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css) - report styling and responsive evidence drawer/table work.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) - report registration, nav, refresh wiring, status label.
- [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts) - client-side reference for identity join priority.
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) - client-side reference for matter, Teams link, and instruction identity behaviour.

Server:
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) - current aggregate route and likely read-model home.
- [server/routes/matterRequests.js](../../server/routes/matterRequests.js) - matter request insert and patch truth for downstream matter linkage.
- [server/routes/clioMatters.js](../../server/routes/clioMatters.js) - Clio matter creation, telemetry, and `matter.opened` event emission.
- [server/routes/enquiryEnrichment.js](../../server/routes/enquiryEnrichment.js) - reference for legacy id to new enquiry id mapping and Teams activity selection.
- [server/routes/teamsActivityTracking.js](../../server/routes/teamsActivityTracking.js) - Teams deep-link lookup used by InlineWorkbench.
- [server/utils/db.js](../../server/utils/db.js) - preferred SQL helper for new or edited server SQL.

Submodule references, read-only:
- [submodules/enquiry-processing-v2/Controllers/ReportingController.cs](../../submodules/enquiry-processing-v2/Controllers/ReportingController.cs) - original KPI query/reference.
- [submodules/enquiry-processing-v2/documentation/RECEPTION-KPI-FRONTEND-BRIEF.md](../../submodules/enquiry-processing-v2/documentation/RECEPTION-KPI-FRONTEND-BRIEF.md) - symbolic handoff contract.
- [submodules/enquiry-processing-v2/wwwroot/call-hub/app.js](../../submodules/enquiry-processing-v2/wwwroot/call-hub/app.js) - source product pattern for live call evidence.

Scripts / docs:
- [docs/notes/RECEPTION_KPIS_DIRECT_DB_TAP.md](../../docs/notes/RECEPTION_KPIS_DIRECT_DB_TAP.md) - foundation brief this work depends on or must merge if still open.
- [logs/changelog.md](../../logs/changelog.md) - add entries per shipped phase.
- `node tools/stash-close.mjs reception-performance-kpi-dashboard` - close this stash only after implementation is confirmed shipped.
- `node tools/stash-status.mjs` - rebuild the generated stash index after closure.

### Stash metadata (REQUIRED, used by `check stash overlap`)

```yaml
# Stash metadata
id: reception-performance-kpi-dashboard
verified: 2026-05-24
branch: main
touches:
  client:
    - src/tabs/Reporting/ReceptionReport.tsx
    - src/tabs/Reporting/ReceptionReport.css
    - src/tabs/Reporting/ReportingHome.tsx
  server:
    - server/routes/receptionKpis.js
  submodules: []
depends_on:
  - reception-kpis-direct-db-tap
coordinates_with:
  - function-retirement-phase-2-d-and-e-transactionapprovalpopup-and-mattersreport-cleanup
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - hub-rollout-training-and-confidence-recovery
  - management-dashboard-trust-gate
  - ppc-report-does-paid-acquisition-actually-pay
  - reporting-trust-and-ops-visibility
conflicts_with: []
```

---

## 9. Gotchas appendix

- The UI sends date-only values from [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx), and [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) now treats a date-only `to` as the next day's midnight. Preserve that inclusive user-visible date behaviour when adding evidence endpoints.
- `dbo.enquiries.id` and legacy ACID are not the same thing. [server/routes/enquiryEnrichment.js](../../server/routes/enquiryEnrichment.js#L34) documents the mapping. Do not join `TeamsBotActivityTracking.EnquiryId` directly to legacy enquiry IDs without translating through `enquiries.acid`.
- `buildInlineWorkbenchMap` is the best expression of current product identity rules. Mirror its priority rather than inventing a new one for Reporting.
- Matter opening has two identifiers: the placeholder `matterRequestId` from [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L320), then the Clio matter id/display number from [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L385). The dashboard should distinguish requested, opened, and patched.
- `matterTraceId` is currently request-header telemetry, not a persisted join key. It is useful for diagnostics but should not become the primary reporting join without a persistence change.
- Coverage truth is part of the product. Ring time is not tracked in this route today; do not hide that gap behind a tooltip-only detail.
- Submodules are read-only under repo rules. Sync/status is fine. Editing `submodules/enquiry-processing-v2` requires a separate explicit process and should not be needed for this implementation.
