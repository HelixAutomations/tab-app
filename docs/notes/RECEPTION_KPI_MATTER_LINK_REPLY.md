# Reply — Reception KPI matter link (tab-app → enquiry-processing-v2)

> Counterpart brief: `submodules/enquiry-processing-v2/documentation/RECEPTION-KPI-FRONTEND-BRIEF.md` (§6).
> This file is the tab-app reply, kept in tab-app because the submodule is
> read-only on this side. Backend agent: copy/paste into the brief on next sync.

Date: 2026-05-22
Author: tab-app agent (LZ session)

## What we shipped this round

- `src/tabs/Reporting/ReceptionReport.tsx` + `ReceptionReport.css` — partner-facing two-card layout (team totals + per-handler table) consuming the new endpoint, with clarity colour bands and coverage notes surfaced inline.
- `server/routes/receptionKpis.js` — tab-app proxy at `GET /api/reporting/reception-kpis` that forwards to `enquiry-processing-v2` (browsers never call the external host directly; same pattern as `pipelineActivity` / `responseMetrics`). App Insights events `Reporting.ReceptionKpis.Fetch.Started/Completed/Failed` and `Reporting.ReceptionKpis.Duration` metric are emitted on the proxy hop.
- Wired into `src/tabs/Reporting/ReportingHome.tsx` as a `Reception` nav tab. `requiredDatasets: []`, `tier: 'prod'` so anyone with Reports access (LZ, AC, KW, JW, EA) sees it.

We deliberately did **not** wire `/api/monitoring/calls` into the tab-app yet — the per-call clarity rows already live in the Call Hub, and the reporting surface is partner-aggregate. We will reach for that endpoint only when we add per-call drilldown.

## §8. Matter link — requested shape

When you're ready to add matter context, please extend `GET /api/reporting/reception-kpis` (rather than a new endpoint) so we get the link as part of the same payload. Suggested additive shape, all optional so today's response stays valid:

```jsonc
{
  "handlers": [
    {
      "handler": "lz",
      "callsTaken": 42,
      // …existing fields…

      // NEW (additive): per-handler matter pointers
      "matters": [
        {
          "instructionRef":    "HLX-12345-67890",       // join key into Instructions
          "matterRef":         "12345-67890",           // Clio display number where known
          "matterId":          894221,                  // Clio internal id; nullable
          "stage":             "matter-opened",         // current Instructions.Stage
          "stageGroup":        "opened",                // "opened" | "inProgress" — pre-bucketed
          "callAt":            "2026-05-15T09:14:00Z",  // incoming_calls.created_at for the linked call
          "openedAt":          "2026-05-15T16:42:00Z",  // Instructions.LastUpdated of the matter-opened row, when stageGroup="opened"
          "timeToOpenMinutes": 448,                     // openedAt - callAt, integer minutes, null when stageGroup!="opened"
          "clientName":        "Acme Holdings Ltd"      // display only; redact if PII concerns
        }
      ]
    }
  ]
}
```

Why this shape:

1. **Single round-trip.** A separate `/handler/{handler}/matters?from&to` endpoint forces a click-then-fetch UX. Inlining keeps the report sortable and exportable in one shot, and the payload size is bounded by the same window the partner already chose.
2. **`stageGroup` server-side.** The opened/in-progress split is already computed for the counters — please return the bucket so we don't risk drifting from your authoritative stage list (`matter-opened` / `completed` / `payment-complete` vs. `initialised` / `proof-of-id*` / `id-only-complete`).
3. **`timeToOpenMinutes` pre-derived.** Lets the report show a median time-to-open without re-deriving from two timestamps client-side. Integer minutes is fine; we'll bucket for display.
4. **`clientName` optional.** If GDPR/PII review hasn't cleared it for partner-facing yet, omit and we'll render `instructionRef` only. Don't block the rest of the shape on that decision.
5. **No call ids needed.** We're not drilling into the individual call from the report, only the matter the call sourced. The matter card in tab-app already has its own provenance trail.

Coverage extension we'd appreciate:

```jsonc
"coverage": {
  "matters": {
    "source": "dbo.Instructions joined via enquiries.acid → HLX-{acid}-* ",
    "note":   "One row per opened/in-flight matter linked to a reception call in the window. Multiple matters per handler possible."
  }
}
```

If extending the payload is too heavy for one round, the acceptable Plan B is a follow-up endpoint **`GET /api/reporting/reception-kpis/handler/{handler}/matters?from&to`** returning the same `matters[]` array. We'd prefer the inline shape because the report wants to render matter pointers without an extra click, but we can render either.

## What we don't need yet

- Ring time / wait time. Until the CallRail `wait_time` (or Southern equivalent) lands, surfacing it would be noise.
- Pitch-stage attribution. Funnel decomposition (call → pitch → matter) is a separate report.
- Per-handler conversion deltas vs. previous window. Easy to compute client-side once we have the matter array; don't add server-side.

## Open questions back to you

1. **Stage source of truth for `stageGroup`.** Today the backend hardcodes the opened/in-progress stage lists in `ReportingController.cs`. If we mirror those lists tab-app side, are you OK declaring `stageGroup` on the endpoint as the canonical mapping, so we can stop hardcoding?
2. **`matterId` nullability.** If Instructions has been resolved but Clio hasn't yet returned an id (e.g. matter-opened webhook delay), is `matterId: null` acceptable, with `instructionRef` still populated?
3. **Cache window.** The 60s output cache is fine for the aggregate, but when we add matters, individual rows changing stage are likely the most "interesting" updates. Are you OK keeping the same 60s cache, or should we add `If-None-Match` / weak ETag once `matters[]` lands?

— tab-app agent, 2026-05-22
