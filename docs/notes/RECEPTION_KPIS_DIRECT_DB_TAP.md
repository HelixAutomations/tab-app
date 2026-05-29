# Reception KPIs direct DB tap

> **Purpose.** Self-contained brief to replace the current cross-service HTTP proxy for Reception KPIs with a direct SQL read from tab-app against the same `instructions` database. A future agent can pick this up cold and execute Phase A in one pass.
>
> **Verified:** 2026-05-22 against branch `main`. Re-verify file/line refs if reading more than 30 days later.

---

## 1. Why this exists (user intent)

User, verbatim: *"what i dont understand is why we cant just tap into the tables and their indexes etc for a fast look etc. can we not do this? scope that out"* and then *"make sure you scope it from start to finish, including what the dashboard will look like and how it will be pulling data separately tro the management dashboard etc. and then finalise everything from navigation to transitions and security stuff."*

The Reception KPIs report shipped earlier this session as a proxy to `enquiry-processing-v2.azurewebsites.net`. Local dev currently 500s because the user's machine cannot DNS-resolve that host. Investigation confirmed the backend service connects to the exact `instructions` SQL DB tab-app already uses, so the HTTP boundary is decorative, not architectural.

Not asking for: a Reports tab redesign, drill-down `matters[]` payload (separate stash), or migration of the other three cross-service proxies (each scoped on its own).

---

## 2. Current state — verified findings

### 2.1 Backend (enquiry-processing-v2) — what we're replacing

- Submodule (READ-ONLY): [submodules/enquiry-processing-v2/Controllers/ReportingController.cs](../../submodules/enquiry-processing-v2/Controllers/ReportingController.cs)
- Connects to `Server=instructions.database.windows.net;Database=instructions;User Id=instructionsadmin;Password={KeyVault sql-connection-string}` (around L60, `GetConnectionStringAsync`).
- Endpoint: `GET /reporting/reception-kpis?from=&to=`, `[OutputCache(Duration=60, VaryByQueryKeys=new[]{"from","to"})]`.
- Defaults: last 7 days, cap 366 days, `cmd.CommandTimeout = 30`, params `@from`/`@to` as `DateTime2`.
- Single SQL block — two CTEs (`calls`, `callBestStage`) + aggregate. Captured verbatim in §3 B1 below.

### 2.2 tab-app — what already exists

- Proxy route: [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) — forwards to upstream. Emits `Reporting.ReceptionKpis.Fetch.Started/Completed/UpstreamFailed/Failed` + `Reporting.ReceptionKpis.Duration` metric.
- Mounted in [server/index.js](../../server/index.js#L450) (`app.use('/api/reporting', receptionKpisRouter)` after responseMetricsRouter).
- Client: [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) — uses `ReportShell`, `ReportingSectionCard`, `useReportRange({ defaultKey: 'month' })`. Helpers `fmtMSS`, `fmtPct`, `handlerLabel`, `clarityBand` / `clarityColour`. Two cards (totals + by-handler table).
- Styles: [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css) — borderRadius 0, Raleway, 2-col grid collapses at 960px, row hover `rgba(54,144,206,0.06)`.
- Reports nav wiring already in place in [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx):
  - `AVAILABLE_REPORTS` entry `key: 'receptionReport'`, `tier: 'prod'` (around L881).
  - `REPORT_NAV_TABS` includes `Reception` in prod section (around L1621).
  - `ActiveViewType` union extended (around L1624).
  - Render branch (around L6194): `if (activeView === 'receptionReport')`.

### 2.3 tab-app already connects to the same DB

- `INSTRUCTIONS_SQL_CONNECTION_STRING` resolved via Key Vault in [server/index.js](../../server/index.js#L118-L130) (`sql-connection-string` secret).
- Reused by [server/operatorActions/deal-lookup.js](../../server/operatorActions/deal-lookup.js#L16), [server/operatorActions/person-lookup.js](../../server/operatorActions/person-lookup.js#L37), [server/operatorActions/passcode-lookup.js](../../server/operatorActions/passcode-lookup.js#L19), [server/operatorActions/instruction-lookup.js](../../server/operatorActions/instruction-lookup.js#L19), [server/operatorActions/matter-oneoff-replay.js](../../server/operatorActions/matter-oneoff-replay.js#L342), [server/operatorActions/telemetry.js](../../server/operatorActions/telemetry.js#L70).
- Pattern: `await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING)` then `pool.request().input(...).query(...)`.
- Tables this brief touches all live in this DB: `dbo.incoming_calls`, `dbo.dubber_recordings`, `dbo.enquiries`, `dbo.TeamsBotActivityTracking`, `dbo.Instructions`.

### 2.4 Independence from "management dashboard" data path

- The Reports tab's heavyweight reports (Management Dashboard, Enquiries, Matters, Annual Leave) read via `ManagementDataContext` plus Azure Functions against `helix-core-data`.
- Reception KPIs is a separate aggregated SQL read against `instructions`. No shared cache, no shared context payload, no overlap with `helix-core-data`.
- This brief preserves that separation. Reception remains an isolated route with its own pool, cache, telemetry, and failure mode.

---

## 3. Plan

### Phase A — replace proxy with direct SQL (single-shot, ships in one go)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Rewrite handler body | [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) | Drop `fetch(upstream)`. Use lazy cached `mssql` pool against `INSTRUCTIONS_SQL_CONNECTION_STRING`. Run the CTE in §B1. Build the response shape (`window`, `handlers[]`, `totals`, `coverage`). 30s `requestTimeout`. |
| A2 | Add 60s memo cache | same file | In-process `Map<string, { at, payload }>` keyed by `${fromIso}|${toIso}`, capped at ~50 entries, evict on insert. Mirrors backend `[OutputCache(Duration=60)]`. |
| A3 | Validation | same file | `from` and `to` ISO date, `from < to`, span ≤ 366 days else clamp. Defaults: last 7 days UTC, exclusive upper bound. Bad input returns 400 `{ error: 'invalid_range', detail }`. |
| A4 | Telemetry rename | same file | New events: `Reporting.ReceptionKpis.Query.Started / Completed / Failed`. Metric: `Reporting.ReceptionKpis.QueryDuration`. Properties: `from`, `to`, `days`, `handlerCount`, `rowCount`, `cacheHit`, `triggeredBy`. `trackException` on SQL failure. Mount point unchanged. |
| A5 | Server-side reports gate | same file | Same `requireAuth` middleware chain as siblings plus a reports-access check (mirror what `responseMetrics`/`pipelineActivity` use). Frontend already hides via `tier: 'prod'`. |
| A6 | Schema-drift comment | same file | Header comment linking to [submodules/enquiry-processing-v2/Controllers/ReportingController.cs](../../submodules/enquiry-processing-v2/Controllers/ReportingController.cs) as the canonical mirror. |
| A7 | Schema reference note | [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) | Add short paragraph: `incoming_calls`, `dubber_recordings`, `TeamsBotActivityTracking` are cross-service tables in `instructions` DB, owned operationally by enquiry-processing-v2 but read by tab-app reporting. **Coordinates with `instruction-and-prompt-estate-refresh`** (touches same file). |
| A8 | Mark matter-link reply obsolete | [docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md](../../docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md) | Top-of-file note: §8 matter-link contract superseded. Drill-down will be an in-house SQL extension (separate stash). |
| A9 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One-line entry: `Reception KPIs read direct from instructions DB / Replace enquiry-processing-v2 proxy with in-process SQL ...`. |

**Phase A acceptance:**
- `GET /api/reporting/reception-kpis?from=2026-05-15&to=2026-05-22` returns 200 with the same JSON shape as before.
- Response body diff vs old proxy is zero for the same window (compare in staging once both reachable).
- DNS to `enquiry-processing-v2.azurewebsites.net` no longer required by this route.
- `npm run dev:fast` then Reports tab then Reception then range pill `Week`: totals populate, table sorts by `callsTaken` desc.
- App Insights: `customEvents | where name startswith 'Reporting.ReceptionKpis.Query.'` shows events with `cacheHit` true/false.

### Phase B (not scoped here) — drill-down matters[]

Separate stash. Would join `dbo.Instructions` per row to add `matters[]` (instructionRef, matterRef, matterId, stage, stageGroup, callAt, openedAt, timeToOpenMinutes). Reference: [docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md](../../docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md) §8.

---

## B1. The SQL to port (verbatim from ReportingController.cs)

```sql
WITH calls AS (
    SELECT
        ic.id,
        LOWER(LTRIM(RTRIM(ic.taken_by))) AS handler,
        ic.status,
        ic.created_at,
        ic.enquiry_id,
        ic.matched_dubber_recording_id,
        ic.call_duration_seconds AS form_duration_seconds,
        dr.duration_seconds      AS dubber_duration_seconds,
        e.acid                   AS enquiry_acid,
        fn.FeNotesRating         AS fe_notes_rating
    FROM dbo.incoming_calls ic
    LEFT JOIN dbo.dubber_recordings dr
        ON dr.recording_id = ic.matched_dubber_recording_id
    LEFT JOIN dbo.enquiries e
        ON e.id = ic.enquiry_id
    OUTER APPLY (
        SELECT TOP 1 t.FeNotesRating
        FROM dbo.TeamsBotActivityTracking t
        WHERE ic.enquiry_id IS NOT NULL
          AND TRY_CONVERT(int, t.EnquiryId) = ic.enquiry_id
          AND t.FeNotesRating IS NOT NULL
          AND (t.CardType IS NULL OR t.CardType <> 'partner_review_dm')
        ORDER BY t.FeNotesRatedAt DESC, t.Id DESC
    ) fn
    WHERE ic.created_at >= @from
      AND ic.created_at <  @to
      AND ic.taken_by IS NOT NULL
      AND LTRIM(RTRIM(ic.taken_by)) <> ''
),
callBestStage AS (
    SELECT c.id,
           MIN(CASE i.Stage
                WHEN 'completed'             THEN 1
                WHEN 'matter-opened'         THEN 2
                WHEN 'payment-complete'      THEN 3
                WHEN 'id-only-complete'      THEN 4
                WHEN 'proof-of-id-complete'  THEN 5
                WHEN 'proof-of-id'           THEN 6
                WHEN 'initialised'           THEN 7
                ELSE NULL END) AS stageRank
    FROM calls c
    LEFT JOIN dbo.Instructions i
        ON c.enquiry_acid IS NOT NULL
       AND i.InstructionRef LIKE 'HLX-' + c.enquiry_acid + '-%'
    GROUP BY c.id
)
SELECT
    c.handler,
    COUNT(*)                                              AS callsTaken,
    SUM(CASE WHEN c.status = 'handled' THEN 1 ELSE 0 END) AS callsHandled,
    AVG(CAST(COALESCE(c.dubber_duration_seconds, c.form_duration_seconds) AS FLOAT)) AS avgCallSeconds,
    SUM(CASE WHEN COALESCE(c.dubber_duration_seconds, c.form_duration_seconds) IS NOT NULL THEN 1 ELSE 0 END) AS callsWithDuration,
    SUM(CASE WHEN cbs.stageRank BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS prospectsOpened,
    SUM(CASE WHEN cbs.stageRank BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS prospectsInProgress,
    SUM(CASE WHEN c.fe_notes_rating IS NOT NULL THEN 1 ELSE 0 END) AS notesRated,
    SUM(CASE WHEN c.fe_notes_rating = 'clear'   THEN 1 ELSE 0 END) AS notesClear,
    SUM(CASE WHEN c.fe_notes_rating = 'unclear' THEN 1 ELSE 0 END) AS notesUnclear
FROM calls c
LEFT JOIN callBestStage cbs ON cbs.id = c.id
GROUP BY c.handler
ORDER BY callsTaken DESC, c.handler ASC;
```

Bind with `request.input('from', sql.DateTime2, fromUtc).input('to', sql.DateTime2, toUtc)`. Never string-concatenate.

Per-handler `conversionRate` = `prospectsOpened / callsTaken` (4dp, null if callsTaken=0). `clarityScore` = `notesClear / notesRated` (4dp, null if notesRated=0). Round `avgCallSeconds` to 1dp. Totals: sum cols; `avgCallSeconds` = `Σ(avg*callsWithDuration) / Σ callsWithDuration`; same conversion/clarity formulas at firm level.

---

## B2. Response shape (LOCKED — frontend depends on it)

```ts
{
  window: { from: string; to: string; days: number },
  handlers: HandlerRow[],         // sorted callsTaken desc, handler asc
  totals: HandlerRow,             // handler field omitted or empty
  coverage: {
    callsTaken?: { source, status, note },
    avgCallSeconds?: { source, status, note },
    prospectsOpened?: { source, status, note },
    prospectsInProgress?: { source, status, note },
    notesClarity?: { source, status, note },
    ringTime?: { source, status, note },   // "not yet wired" until backend ring-time lands
  }
}
```

Coverage block is hardcoded text mirroring what the backend emits today. Lift the strings verbatim from a fresh upstream response before cutover so wording matches.

---

## 4. Step-by-step execution order

1. **A1+A2+A3+A4+A5+A6** — single rewrite of `server/routes/receptionKpis.js`.
2. **A7** — append to `DATABASE_SCHEMA_REFERENCE.md` (coordinate with `instruction-and-prompt-estate-refresh`).
3. **A8** — top note on `RECEPTION_KPI_MATTER_LINK_REPLY.md`.
4. Smoke locally (`dev:fast`).
5. **A9** — changelog entry, newest at top.

---

## 5. Verification checklist

**Phase A:**
- [ ] `GET /api/reporting/reception-kpis?from=2026-05-15&to=2026-05-22` returns 200 locally without internet access to enquiry-processing-v2.
- [ ] Response keys: `window`, `handlers`, `totals`, `coverage`.
- [ ] `ReceptionReport.tsx` renders without code changes; totals and handler table populate.
- [ ] Range pills (today, week, month, quarter, fy) all return data.
- [ ] Bad input (`from=2026-99-99`) returns 400 with `error: 'invalid_range'`.
- [ ] Second hit within 60s emits `cacheHit: true`.
- [ ] App Insights: `Reporting.ReceptionKpis.Query.Started/Completed` events present; failure path emits `Failed` plus exception.
- [ ] SQL spot check: row count for one handler matches a manual `SELECT COUNT(*) FROM dbo.incoming_calls WHERE taken_by = ... AND created_at >= ... AND created_at < ...`.
- [ ] No new env var, no new Key Vault secret, no new firewall rule.

---

## 6. Dashboard / UX scope (no client code changes expected)

Visual contract for `ReceptionReport.tsx`, recorded so a future agent can verify cutover did not disturb anything:

- **Layout:** ReportShell header + range pills → totals card (left) + clarity band + coverage notes (right) → by-handler table.
- **Tokens:** `borderRadius: 0` everywhere; `50%` only for the clarity status dot. `colours.highlight` for section titles, neutral body text (`#d1d5db` dark, `#374151` light), never highlight blue for prose.
- **Clarity bands:** `green` ≥0.80, neutral 0.60–0.79, `cta` <0.60, `subtleGrey` no sample.
- **Hover:** table row `rgba(54,144,206,0.06)`.
- **Structural loading:** card shells mount at final dimensions; skeleton rows in the table mirror final geometry; totals show `–` then fade in.
- **Transitions:** 150ms fade on totals values on range change; refresh shimmer ≤ 400ms; no scroll jump.
- **Empty / degraded:** zero handlers shows "No reception calls in this window". SQL failure shows red `helix-toast-error` strip with retry; last cached payload stays visible.

---

## 7. Navigation scope (already wired, do not re-do)

- Tab key: `receptionReport` in `REPORT_NAV_TABS` (prod section, not draft).
- `AVAILABLE_REPORTS` entry tier `'prod'` — visible to everyone with `canAccessReports()`.
- Inline `isLzOrAc` gate NOT required; the feature is past dev preview.
- Render branch in `ReportingHome.tsx` at `activeView === 'receptionReport'`.

---

## 8. Security scope

- **AuthN/AuthZ:** mounted under the standard `/api/reporting` middleware. Add a reports-access guard on the route handler (match what `responseMetrics.js` does).
- **SQL injection:** parameterised inputs only. The CTE is a constant string.
- **PII:** no call content, client names, or enquiry IDs in logs or App Insights properties. Aggregate counts only.
- **Secrets:** reuses `INSTRUCTIONS_SQL_CONNECTION_STRING` (Key Vault `sql-connection-string`). No new secret or grant.
- **Rate / abuse:** date span clamped to 366 days. 60s cache absorbs rapid refreshes. `requestTimeout: 30000`.
- **Egress:** no new outbound surface. SQL outbound already permitted from App Service.
- **Schema-drift defence:** code comment pointing at the .NET mirror file. Optional later: nightly `SELECT TOP 0` smoke logging `Reporting.ReceptionKpis.SchemaDrift.Detected`.

---

## 9. Open decisions (defaults proposed)

1. **Cache layer.** Default: **in-process `Map` with 60s TTL** (matches backend `OutputCache`). Alternative Redis. Recommend in-process for first ship; revisit if multi-instance staleness becomes an issue.
2. **Coverage text.** Default: **mirror backend strings verbatim by lifting from a live upstream response before cutover**. Avoids subtle wording drift.
3. **Reports-access guard.** Default: **same helper used by `responseMetrics.js`** (read at implementation time to copy the exact pattern).
4. **Connection pool ownership.** Default: **route-local cached pool** (lazy, reused). Other routes use their own pools too; do not add to a global registry yet.
5. **Rename the file?** Default: **keep `receptionKpis.js`**. The route URL does not change; renaming would only add noise.

---

## 10. Out of scope (deliberate)

- Drill-down `matters[]` payload (separate stash; deferred per user).
- Migrating `pipelineActivity`, `responseMetrics`, `claimEnquiry` proxies (same pattern, scope individually).
- Ring-time / wait-time / unanswered call coverage (backend doesn't emit it yet).
- Deciding canonical SQL ownership between the two services (organisational call, not a code change).
- Adding Redis caching.
- Any change to `ReceptionReport.tsx` or `ReceptionReport.css` (frontend contract is locked).

---

## 11. File index (single source of truth)

Client (NO CHANGES expected this round):
- [src/tabs/Reporting/ReceptionReport.tsx](../../src/tabs/Reporting/ReceptionReport.tsx) — consumer; contract locked.
- [src/tabs/Reporting/ReceptionReport.css](../../src/tabs/Reporting/ReceptionReport.css) — locked.
- [src/tabs/Reporting/ReportingHome.tsx](../../src/tabs/Reporting/ReportingHome.tsx) — nav wiring already in place.

Server (rewrite target):
- [server/routes/receptionKpis.js](../../server/routes/receptionKpis.js) — replace proxy body with direct SQL.
- [server/index.js](../../server/index.js#L450) — mount point unchanged.

Reference (READ-ONLY submodule):
- [submodules/enquiry-processing-v2/Controllers/ReportingController.cs](../../submodules/enquiry-processing-v2/Controllers/ReportingController.cs) — canonical SQL.

Scripts / docs:
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — add cross-service tables note.
- [docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md](../../docs/notes/RECEPTION_KPI_MATTER_LINK_REPLY.md) — mark §8 obsolete.
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: reception-kpis-direct-db-tap
verified: 2026-05-22
branch: main
touches:
  client: []
  server:
    - server/routes/receptionKpis.js
  submodules: []
depends_on: []
coordinates_with:
  - instruction-and-prompt-estate-refresh   # both touch .github/instructions/DATABASE_SCHEMA_REFERENCE.md
conflicts_with: []
```

---

## 12. Gotchas appendix

- `submodules/enquiry-processing-v2/**` is **read-only** per copilot-instructions. Do not edit the controller even though it carries the canonical SQL.
- PowerShell `curl` is aliased to `Invoke-WebRequest` and rejects `-s -i`. Use `Invoke-WebRequest -UseBasicParsing` for any local smoke against the upstream while testing parity.
- `mssql` ESM import gotcha: when running ad-hoc `node -e` scripts use `const m = await import('mssql'); const sql = m.default || m;`. Not relevant inside CommonJS `require('mssql')`.
- The `enquiry_acid` join key is a string. The `LIKE 'HLX-' + c.enquiry_acid + '-%'` pattern is sargable-ish on `InstructionRef` thanks to the prefix; do not invert to `CHARINDEX`.
- The CTE filters `ic.taken_by` non-null and non-blank in SQL — do not also filter in JS, or counts will diverge from the backend.
- Frontend `ReceptionReport.tsx` types are strict on the response shape. `avgCallSeconds` must be `number | null`, never `undefined`. Same for `conversionRate` and `clarityScore`. Match the backend's null-on-zero-denominator behaviour exactly.
- `coverage.ringTime` should keep emitting `status: 'pending'` / `note: 'not yet wired'` (or whatever the backend currently returns). Do not delete the key; the React component reads it.
- The current proxy emits events under `Reporting.ReceptionKpis.Fetch.*`. After cutover rename to `.Query.*` and update any saved KQL or alerts at the same time.
- Local DNS for `enquiry-processing-v2.azurewebsites.net` was the originating bug. Once this brief ships, the route should work even with that host unreachable.
