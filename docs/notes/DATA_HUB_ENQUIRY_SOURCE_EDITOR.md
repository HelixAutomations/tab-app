# Data Hub Enquiry Source Editor

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-06-09 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user wants a lightweight, editable enquiries ledger inside Data Hub, opened from the Enquiries dataset box, with the enquiry **source** as the first editable cell. Verbatim: "in data hub, starting with enquiries, when i click into enquiries, i want a lightweight table/ledger with editabel fields ... starting with a focus on the source." And: "this is the first cell thats editable, and it shows an option to reassign to any other unique value in the list. with an option to confirm deletion of the option once the last item in that option has been reassigned, leaving it at 0."

Reception is responsible for confirming enquiry source. The Reception Performance report already exists; this editor gives reception a place to correct source values as part of that responsibility. Verbatim: "we have a receoption performance report this might be another task the reception does ... they ... are responsible for confimring the source."

The critical framing is privacy. Verbatim: "because i cant let you lose on the data, in this way, without breaking the law, you must help me by giving me a surface to do this. isolated to its box in the app/data hub." The agent builds the surface; the authorised human (reception/ops) edits the data in the browser. The agent must never read client PII through this surface. Writes target the Instructions database, which is now production: "instructions is the new soure now, enquiries from core data isnt really used in production anymore, but we do need to keep the mappings for reports."

**Not** asking for: editing any field other than source this pass, exposing client names/notes/emails/phones, Core Data writes, or rebuilding the Reception Performance report.

---

## 2. Current state — verified findings

All refs verified 2026-06-09 against branch `main`.

### 2.1 Data Hub container and dataset detail mount point

- File: [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) is the Data Hub container. `selectedDatasetKey` state at L590; cleared to `null` at L597.
- The per-dataset detail renders at L2043 to L2056 via `DataHubDatasetDetail` when `activeOp === 'datasetDetail' && selectedDatasetDefinition`. Props: `definition`, `liveDataset`, `contextDatasets`, `previewTable`, `operationalViewLabel`, `isProductionInactive`, `onPreviewRows`, `onOpenOperationalView`.
- `selectedDatasetDefinition` resolved via `REPORTING_DATASET_BY_KEY` at L1950.
- This is the mount point: render the new `EnquirySourceLedger` when `selectedDatasetKey === 'enquiries'`, inside or above the dataset detail.

### 2.2 Dataset registry

- File: [src/tabs/Reporting/reportingDatasets.ts](../../src/tabs/Reporting/reportingDatasets.ts) defines `REPORTING_DATASET_DEFINITIONS`. The `enquiries` key (category `operational-cache`) lists `reportUsage` including `Reception Performance`, `Enquiries report`, `Enquiry ledger`. Exposes `ReportingDatasetKey` type and `REPORTING_DATASET_BY_KEY`.

### 2.3 Existing preview path is PII-heavy (do NOT reuse)

- File: [server/routes/dataOperations.js](../../server/routes/dataOperations.js) `GET /api/data-operations/preview/:table` at L2969. The `enquiries` config runs `SELECT TOP n * FROM enquiries` against Core Data at L3022, returning full client PII. The new ledger must use a dedicated lean endpoint, never this one.

### 2.4 Existing enquiry write path

- File: [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js) `POST /update` at L1058. Field whitelist: `First_Name`, `Last_Name`, `Email`, `Value`, `Initial_first_call_notes`, `Area_of_Work`, `Rating`, `Point_of_Contact`, `Shared_With`. **Source is not in the whitelist.**
- Legacy UPDATE `WHERE ID = @id` at L1232; Instructions UPDATE `WHERE id = @id` at L1287 using lowercase columns (`first`, `last`, `email`, `value`, `notes`, `aow`, `rating`, `poc`, `shared_with`).
- Paired Core Data / Instructions resolution via the `acid` bridge.
- After update: `clearUnifiedMemoryCache()`, `deleteCachePattern(...)`, `broadcastEnquiriesChanged(...)`, `emitEvent('enquiry.stage_changed', ...)`.
- Mounted at `/api/enquiries-unified` (server/index.js L819). Routes present: `GET /pulse` L276, `GET /` L334, `POST /update` L1058, `POST /create` L1332, `DELETE /:id` L1518, `DELETE /cleanup` L1803.

### 2.5 Source field shapes (verified via aggregate-only queries this session)

- Instructions DB `dbo.enquiries`: source column is `source` (lowercase), date column is `datetime`.
- Core Data `dbo.enquiries`: `Ultimate_Source`, date `Touchpoint_Date`.
- Instructions distinct source values (last 12m) were roughly 32 labels including: `organic search`, `paid search`, `direct firm email · other`/`sales`/`recruitment`/`system`, `web form`, `referral`, `facebook lead magnet`, `facebook paid`, `other`, `previous-client`, `tbc`, `legacy-migration`, plus internal markers (`colleague-auto-response`, `ops-dashboard-recovery`, and similar).
- A manual correction was already run this session against Instructions: `google` / `web form` / `webform-cfa` to `organic search`, and `paid searc` to `paid search` (1,179 rows, counts-only output). This editor productises exactly that operation so reception can do it themselves.

### 2.6 Source normaliser to reuse

- File: [src/utils/enquirySource.ts](../../src/utils/enquirySource.ts): `getNormalizedEnquirySource`, `getNormalizedEnquirySourceLabel`, `getNormalizedEnquiryMOC` / `getNormalizedEnquiryMOCLabel`. Candidate source fields at L61 to L77; `SYSTEM_SOURCE_MARKERS` set. Use `getNormalizedEnquirySourceLabel(value)` to show the report bucket beside each raw value in the palette so reception sees how each label maps.

### 2.7 Tier gating

- File: [src/app/admin.ts](../../src/app/admin.ts): inline `isLzOrAc` (`['LZ','AC']`) for dev preview, `isAdminUser()` for feature tier, `isOperationsUser()` for ops tools. Gate the editor behind `isLzOrAc` while building, promote to `isOperationsUser()` for reception when ready.

### 2.8 ZDR guard reference

- File: [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js) is the reference content-guard pattern (`assertOperatorReadConsent`, safe-summary helper, loud escape-hatch env flag). The repo `copilot-instructions.md` requires new client-data readers to follow it. The ledger endpoint avoids PII columns by design; keep the column whitelist server-side and never `SELECT *`.

---

## 3. Plan

Four phases, each independently shippable. Phase A is the smallest safe slice (read-only, zero PII, zero mutation).

### Phase A: Aggregate source palette (read-only)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | New endpoint `GET /api/enquiries-unified/source/options` | [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js) | Instructions DB only. Aggregate `GROUP BY` on `source`. Returns `[{ value, count }]`. No row-level data. SQL: `SELECT NULLIF(LTRIM(RTRIM(source)),'') AS value, COUNT_BIG(*) AS count FROM dbo.enquiries GROUP BY NULLIF(LTRIM(RTRIM(source)),'') ORDER BY count DESC`. |
| A2 | New component `EnquirySourceLedger.tsx` | [src/tabs/Reporting/components/EnquirySourceLedger.tsx](../../src/tabs/Reporting/components/EnquirySourceLedger.tsx) (NEW) | "Source palette" section: each unique value, its count, and its normalized bucket via `getNormalizedEnquirySourceLabel`. Sorted by count desc. Helix tokens, zero border radius, structural loading. `data-helix-region="reports/data-hub/enquiry-source"`. |
| A3 | Mount in Data Hub | [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) | Render `EnquirySourceLedger` when `selectedDatasetKey === 'enquiries'` near the L2043 detail render. Gate behind `isLzOrAc`. |

**Phase A acceptance:** opening Data Hub then Enquiries shows the live source palette with counts and bucket mapping; no names or PII anywhere; the agent never calls the endpoint.

### Phase B: Lean non-PII ledger (read-only, sortable)

#### B1. Ledger endpoint

`GET /api/enquiries-unified/source/ledger?limit=` on [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js). Instructions DB only. SELECT an explicit non-PII column whitelist only: `id`, `datetime` (as date), `aow`, method-of-contact, `poc`, `source`. **Never `SELECT *`.** Newest-first default; support a `sort` param. Cap `limit` (for example 200).

#### B2. Ledger table

In `EnquirySourceLedger.tsx`: columns Date, Area of Work, Method of Contact, POC, Source. Source cell rendered as a value chip (not yet editable). Sortable headers. Structural loading skeleton that mirrors settled layout.

**Phase B acceptance:** ledger shows lean rows, sortable, no PII; limit guard enforced server-side.

### Phase C: Single-row source edit

#### C1. Reassign endpoint (single)

`POST /api/enquiries-unified/source/reassign` with body `{ id, to }` on [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js). Instructions DB. Transaction-wrapped, parameterised: `UPDATE dbo.enquiries SET source=@to WHERE id=@id`. Returns `{ rowsAffected }` only. Telemetry `Enquiry.Source.ReassignSingle` Started/Completed/Failed. Reuse the `/update` cache invalidation and `broadcastEnquiriesChanged` pattern.

#### C2. Editable source cell

Make the Source cell a dropdown of existing unique values (from the options endpoint) plus a free-text "new value" affordance. On confirm, call reassign `{ id, to }`, optimistic update, then refresh palette counts.

**Phase C acceptance:** change one row's source from the ledger; palette counts shift; telemetry fires; response is counts-only.

### Phase D: Bulk reassign and retire emptied option

#### D1. Reassign endpoint (bulk)

Extend `POST /source/reassign` to accept `{ from, to }`: `UPDATE dbo.enquiries SET source=@to WHERE LTRIM(RTRIM(source))=@from`. Transaction-wrapped. Returns `{ rowsAffected, from, to }`. Telemetry `Enquiry.Source.ReassignBulk`.

#### D2. Palette reassign-all and retire

Each palette value gets "Reassign all to..." picking another existing value. After bulk reassign the value's count becomes 0 and it disappears from DISTINCT results. Confirm dialog: "Retire 'X'? N enquiries will move to 'Y'."

#### D3. Clarify retire semantics in UI

State plainly that "delete option" means reassign all then it disappears. There is no separate options table to delete from.

**Phase D acceptance:** reassign-all moves the cohort; emptied value vanishes from the palette; confirm gate prevents accidental retire; responses are counts-only.

---

## 4. Step-by-step execution order

1. **A1**: build the aggregate `source/options` endpoint (Instructions only, counts-only).
2. **A2 + A3**: build `EnquirySourceLedger.tsx` palette and mount it in Data Hub behind `isLzOrAc` (needs A1).
3. *(parallel with 2)* **B1**: build the lean `source/ledger` endpoint (explicit non-PII columns).
4. **B2**: render the sortable lean ledger table (needs B1).
5. **C1**: build the single-row `source/reassign {id,to}` endpoint with telemetry and cache broadcast.
6. **C2**: make the source cell an editable dropdown wired to C1 (needs B2 + C1 + A1).
7. **D1**: extend `source/reassign` to accept `{from,to}` bulk (needs C1).
8. **D2 + D3**: palette reassign-all, confirm dialog, retire semantics copy (needs A2 + D1).

---

All verification is structural. The implementing agent must NOT call the options/ledger/reassign endpoints or read their output. Confirm shape via types and fixtures; the operator exercises the live surface in the browser.

**Phase A:**
- [ ] `source/options` returns counts only (operator curl, not agent); palette renders with bucket mapping.
- [ ] Editor diagnostics clean; `isLzOrAc` gate verified (hidden for non-LZ/AC).

**Phase B:**
- [ ] Ledger SELECT is the column whitelist only: grep shows no `*`, no name/email/notes/phone/url columns.
- [ ] Sortable headers; structural loading; `limit` capped server-side.

**Phase C:**
- [ ] Single reassign updates exactly one row; response counts-only.
- [ ] App Insights events `Enquiry.Source.ReassignSingle.Started/Completed/Failed` visible.
- [ ] Cache invalidation and `broadcastEnquiriesChanged` fire.

**Phase D:**
- [ ] Bulk reassign moves the cohort; emptied value disappears from palette.
- [ ] Confirm dialog blocks accidental retire.
- [ ] App Insights events `Enquiry.Source.ReassignBulk.Started/Completed/Failed` visible.

**Cross-cutting:**
- [ ] No route returns names, emails, phones, notes, or URLs.
- [ ] All SQL parameterised and reassign transaction-wrapped.
- [ ] `logs/changelog.md` entry per phase.

---

## 6. Open decisions (defaults proposed)

1. **Write target**. Default: **Instructions DB only** (`source` column). Rationale: user said Instructions is production, Core Data is historical. Optionally mirror to paired Core Data legacy rows via `acid` in a later pass.
2. **Auth**. Default: **dev-preview `isLzOrAc` while building, promote to `isOperationsUser()`** for reception, plus an operator-header check server-side before any reassign. Rationale: reception are the intended users; ops tier fits.
3. **Ledger column set**. Default: **Date, Area of Work, Method of Contact, POC, Source** (no referral URL/UTM/notes). Open question: can reception confirm source from this alone? If they need referral URL or UTM, that goes behind the formal content guard as a later phase.
4. **New value entry**. Default: **allow free-text new source on single-row edit, with a warning that it creates a new palette option**. Rationale: matches the real correction flow and keeps the taxonomy honest.
5. **Telemetry value logging**. Default: **log normalized bucket + rowCount + a short hash of raw from/to**; do not log full raw source strings beyond the bucket. Rationale: keep telemetry structural.

---

## 7. Out of scope

- Editing any field other than source.
- Showing or returning client names, emails, phones, notes, narratives, referral URLs, or UTM strings.
- Core Data writes (read-only and historical this pass).
- Reception Performance report changes.
- A separate source lookup/options table (none exists; options are DISTINCT over rows).
- Auto-merge or dedup across Instructions and Core Data.
- Agent-side invocation of the new endpoints (operator-only by design).

---

## 8. File index (single source of truth)

Client:
- [src/tabs/Reporting/DataCentre.tsx](../../src/tabs/Reporting/DataCentre.tsx) — mount `EnquirySourceLedger` when `selectedDatasetKey === 'enquiries'` near the L2043 detail render.
- [src/tabs/Reporting/components/EnquirySourceLedger.tsx](../../src/tabs/Reporting/components/EnquirySourceLedger.tsx) (NEW) — palette, ledger, edit affordances.
- [src/tabs/Reporting/reportingDatasets.ts](../../src/tabs/Reporting/reportingDatasets.ts) — optional: an enquiries affordance label if needed (read-mostly).
- [src/utils/enquirySource.ts](../../src/utils/enquirySource.ts) — reuse `getNormalizedEnquirySourceLabel` (read-only).
- [src/app/admin.ts](../../src/app/admin.ts) — reuse `isLzOrAc` / `isOperationsUser` (read-only).

Server:
- [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js) — add `GET /source/options`, `GET /source/ledger`, `POST /source/reassign`.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: data-hub-enquiry-source-editor                          # used in INDEX cross-refs
verified: 2026-06-09
branch: main
touches:
  client:
    - src/tabs/Reporting/DataCentre.tsx
    - src/tabs/Reporting/components/EnquirySourceLedger.tsx
    - src/tabs/Reporting/reportingDatasets.ts
    - src/utils/enquirySource.ts
  server:
    - server/routes/enquiries-unified.js
  submodules: []
depends_on: []
coordinates_with:
  - reports-data-hub-dataset-provider-migration
conflicts_with: []
```

---

## 9. Gotchas appendix

- Instructions source column is lowercase `source`; Core Data is `Ultimate_Source`. Date columns differ (`datetime` vs `Touchpoint_Date`). Do not assume PascalCase on Instructions.
- The existing `/preview/:table` endpoint returns `SELECT *` (full PII). Do NOT reuse it for the ledger. Build the lean endpoint with an explicit non-PII column whitelist.
- There is NO source options/lookup table. "Delete an option" just means reassign all rows off that value; it then disappears from DISTINCT. Do not go hunting for a table to DELETE from.
- The `/update` route updates BOTH databases with paired `acid` resolution. For source you want Instructions-only; do not copy the dual-write logic unless you deliberately want Core Data legacy mirrored.
- Instructions DB connection: env `INSTRUCTIONS_SQL_CONNECTION_STRING`, with Key Vault fallback secret `instructions-sql-password` (see server/index.js hydration and dataOperations.js L80). Core Data fallback secret is `sql-databaseserver-password`.
- `ELOGIN` on first connect is the known Key Vault hydration path, not a data error. Use the documented fallback connection string.
- Reassign must be transaction-wrapped and parameterised (`UPDATE ... WHERE source=@from`). Never string-concat the value.
- Keep responses counts-only. The agent building this must never call the ledger/options/reassign endpoints or read their output; verify via types and fixtures. That blindness is the entire point of the surface.
- Source labels can contain a middle dot `·` and casing variants (`direct firm email · sales`). Trim and compare case-insensitively for bulk reassign, but preserve the chosen target's exact casing on write.
- Add `data-helix-region="reports/data-hub/enquiry-source"` on the panel per the wayfinding instructions.
- Em dashes and en dashes are banned in this repo's output; palette and confirm copy must use plain punctuation.
