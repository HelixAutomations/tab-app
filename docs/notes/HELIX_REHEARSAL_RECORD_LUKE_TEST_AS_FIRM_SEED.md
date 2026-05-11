# Helix Rehearsal Record — Luke Test as firm seed

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B / C should be picked up only after A ships and is rehearsed. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-06 against branch `main`. Phase A delivered 2026-05-05; Phase B delivered 2026-05-06.
>
> **Status:** 🟡 Phase A + Phase B shipped. Demo surfaces anchor on the Helix Rehearsal Record (`HLX-27367-94842` / Helix Demo). One-click Reset Demo lives in CommandDeck (LZ/AC). `tools/db/seed-demo-matter.sql` retired. **Phase C (rehearsal infra hardening + generic interface) remains** — see §Phase C below. Brief stays open until Phase C is picked up or formally dropped.
>
> **Amalgamated 2026-05-06:** the older `demo-mode-hardening-production-presentable-end-to-end` brief was closed and the still-relevant items folded into Phase C below (Clio dry-run safety, env-split ND folders, telemetry, runbook discoverability). Anything not carried over there has been superseded by Phase A/B and is intentionally dropped.

---

## 1. Why this exists (user intent)

User direction (verbatim, condensed across two turns):

> "okay lets start scoping this out because theres alot to do, running ac and enquiry queries to update the record etc. scope it, then devise sample data for my sign off, i might want to impelment some kind of subtle easter egg re Aiden... 11 11 2011 as incorportation date, for company client seed info etc... if you need some ideas package it in the deliveryt to me. then stash so we dont lose any of this context, your work above you nailed it, save it. so we stay focused."

> "i actually dont like the sample data … too format. needs to be clearly system placeholder, clearly demo, clearly easteregged but clear enough users follow along. … you can see with helix data, that's not a problem. address Second Floor, Britannia House, 21 Station Street, Brighton BN1 4DE, company number you probably can get from the signature. all of that can be ours. phone etc. make sure the client care letter work can be 'shown off' with the demo data, and the ai will be considering this data, so we need to consider that also. address should be 'automations@helix-law.com' because we will need to receive emails to test things properly. later we will route emails and process then to trigger things if users use this demo contact so we have one centralised processing. luke test needs rewording too."

Aiden background (verbatim):

> "i had an idea long ago to ahev an agent called Aiden. but it wasnt good in production it was confusing, eg teams bot delivering enquiries. didnt land right, but this sample stuff is an opportunity to invest a clean fstart to end subtle, seed easter egg."

What this brief delivers:

1. Promote `HLX-27367-94842` ("Luke Test") from LZ-only canary to **the firm's shared rehearsal record** — institutionally named "Helix Demo", with Helix's real address/company/VAT, internally consistent across AC, Core Data, Instructions DB, Clio, CCL, and `/pitch/luke-portal`.
2. Real ops fire (open matter creates a new matter, save note creates a new note) — **no fake test mode**. Telemetry tags differentiate `seed: 'rehearsal'` events.
3. Demo data engineered so **CCL AI generation + Safety Net pressure-test produce showcase-quality output** — real numbers, real address, single coherent fact pattern.
4. **Subtle Aiden easter egg** as automation byline (never a person) — reserves the namespace for a future agent without repeating the Teams-bot confusion era.
5. Retire the parallel synthetic "demo" **fixtures** (`DEMO_FIELDS` Acme Corp in `cclSections.ts`, `DEMO_MATTER` HELIX01-01 used as a Matters tab card) so there is **one rehearsal record**, not two competing static fixtures.

> **What we keep, deliberately.** The matter-opening **Demo Mode** flow (banner = `DemoModeStripe`, ref = `DEMO-3311402`, state = `demoProcessingOutcome` with `success` / `fail-early` / `fail-mid` / `fail-late`, inline EID outcome picker `demoEidOverride` on `IdentityConfirmationCard`) is **out of scope and must NOT be removed**. It serves a different need: a *simulated* open that never creates a Clio matter, with on-demand pass/fail visualisation of the wizard steps and EID statuses. The Rehearsal Record is the *real-fire* counterpart — single canonical scenario (EID Passed / Risk Low-Medium), real Clio creation. You need both. Anything that touches `FlatMatterOpening.tsx`, `CompactMatterWizard.tsx`, `DemoModeStripe.tsx`, or the demo EID picker on `IdentityConfirmationCard.tsx` is out of scope unless explicitly re-scoped.

What this brief does **not** do:
- Does not introduce a new sandbox tier or "test mode" infra.
- Does not delete or rename the underlying instruction ref `HLX-27367-94842`.
- Does not touch production AC contacts other than `27367` / deal `234`.

---

## 2. Current state — verified findings

### 2.1 The seed record (data layer)

- AC contact: `27367`
- AC deal: `234`
- Instructions ref: `HLX-27367-94842`
- Passcode: `94842`
- Owner: LZ. Cleaned 2026-05-03.
- Has: real IDV row, real risk row, real docs, real matter linkage.

### 2.2 Synthetic demo surfaces that need to converge on the rehearsal record

- [src/tabs/matters/ccl/cclSections.ts](../../src/tabs/matters/ccl/cclSections.ts) — `DEMO_FIELDS` constant (~L240+) currently fictional Acme Corp values. Used when CCL is opened with no resolved instruction.
- [src/tabs/matters/Matters.tsx](../../src/tabs/matters/Matters.tsx) — `DEMO_MATTER` + `DEMO_MATTER_CLIO_ID = '3311402'` (~L50–90). Synthetic Clio matter `HELIX01-01`.
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) — `isDemoMatter` check + `portalUrl = '/pitch/luke-portal'` (~L1540–75). The "Open client portal" affordance.
- [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) — separate seed concept using `HLX-DEMO-*` refs. Candidate to retire or repurpose.

### 2.3 Surfaces that already work and will be reused (do NOT rebuild)

- [submodules/instruct-pitch](../../submodules/instruct-pitch) — `/pitch/luke-portal` route + `LukeLauncher.tsx`. **Submodule = read-only** (per copilot instructions). Update via coordination only.
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) — call note save chain (SQL → ops queue → blob → legacy). Already telemetry-rich.
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — `/upload-clio` flow (regenerate → block unresolved → Clio create → S3 PUT → confirm). Already telemetry-rich.
- [server/routes/clioContacts.js](../../server/routes/clioContacts.js) — matter-opening Clio contact creation.
- [tools/run-matter-oneoff.mjs](../../tools/run-matter-oneoff.mjs) — CLI matter replay; supports company client types and EID pull from IdVerifications.

### 2.4 Operator Actions registry

- 12 actions; only `matter-oneoff-replay` is dev-tier; rest admin.
- `dryRunSupported` flag exists but **dry-run was rejected** by user — real ops on real seed instead.

### 2.5 Strategy alignment

- Strategy doc B4 in [docs/notes/HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md](./HUB_UNIFIED_SCOPE_LAYERS_OPERATOR_ACTIONS_EVALS_DISTANCE.md) said "Luke Test is a canary, not a rehearsal space." **This brief consciously flips that** — institutional name + Helix-owned data make the canary/rehearsal distinction safe to collapse.

---

## 3. Plan

### Phase A — Seed update (data only, no UI changes) — *DELIVERED 2026-05-05*

| # | Change | Mechanism |
|---|--------|-----------|
| A1 | Update AC contact `27367` to Helix Demo identity (name, email, phone, address, custom fields) | AC API script |
| A2 | Update AC deal `234` to commercial debt recovery scenario (amount, service description, stage) | AC API script |
| A3 | Update Core Data `enquiries` row (`First_Name=Helix`, `Last_Name=Demo`, `Email=automations@helix-law.com`, etc.) | SQL script (idempotent) |
| A4 | Update Instructions DB `Instructions`/`Deals`/`PitchContent` for `HLX-27367-94842` with new identity + scenario | SQL script (idempotent) |
| A5 | Seed/refresh `IdVerifications` row for natural-person path (passport, expiry 2031-11-11) | SQL upsert |
| A6 | Seed/refresh `RiskAssessments` row (Low–Medium, MLRO=LZ, rationale string) | SQL upsert |
| A7 | Add a second instruction `HLX-27367-11112011` under same prospect for **company client variant** (Helix Law Limited, company `07845461`, VAT `124713339`, incorporated 2011-11-11) | SQL insert + script |
| A8 | Add `seed: 'rehearsal'` App Insights tag to events originating from refs `HLX-27367-94842` and `HLX-27367-11112011` | server middleware |
| A9 | Changelog entry | `logs/changelog.md` |

**Phase A acceptance:**
- AC contact 27367 displays "Helix Demo" with `automations@helix-law.com` and Britannia House address.
- Opening `HLX-27367-94842` in the inline workbench shows the new scenario end-to-end (enquiry, deal, pitch, IDV, risk, matter).
- CCL generation against `HLX-27367-94842` produces a credible draft with real numbers (£42,500 / £2,500) and Helix's real registered office.
- `HLX-27367-11112011` exists and renders the company client path.
- App Insights events for the rehearsal refs carry `seed: 'rehearsal'`.

### Phase B — Demo-mode unification & cleanup — *ship-now scope (blocking demos)*

> **Why this is blocking.** Phase A made the seed real and consistent. But demo mode still injects three competing identity worlds at once: the seed (`HLX-27367-94842` / Helix Demo), legacy enquiry decoys (`DEMO-ENQ-0002/0003`), and orphan UI fixtures (`DEMO-3311402`, `HLX-DEMO-*` x6+, `DEMO_FIELDS` Acme/Luke). Operator can't confidently demo because surfaces don't agree on which client they're showing. This phase collapses to **one anchor (the seed) for real-feeling surfaces**, **clearly-labelled mocks for aggregate tiles** (time, leave, ops queue, etc. — staying mocked deliberately), and **a single Reset Demo button** so the operator can re-run a clean walkthrough.
>
> **Decorative-by-design rule.** Surfaces that aggregate firm-wide numbers (time metrics, annual leave, OperationsQueue tiles) are **kept mocked** — operator does not want to bill themselves or generate real ops queue traffic to demo a tile shape. Those surfaces must be **clearly labelled `Demo · `** so a viewer can see at a glance "this tile is illustrative; only the rehearsal client is wired end-to-end".

#### Demo data inventory (verified 2026-05-05)

| Surface | Current ID(s) injected | Linked to seed? | Action |
|---|---|---|---|
| Prospects (Enquiries tab) | real seed + `DEMO-ENQ-0002`, `DEMO-ENQ-0003` | Decoys, alongside | Keep as decorative decoys; tighten labels (`Demo · Lease renewal`, `Demo · Employment tribunal`) |
| Home demo to-dos | `DEMO-3311402` (CCL), `DEMO-ENQ-5521`, `HLX-DEMO-00001` | **No — orphan IDs** | **Repoint all 3 to the seed** |
| Matters tab — `DEMO_MATTER` | `DEMO-3311402` / `HELIX01-01` (Cass's real Clio client `5257922`) | No | Resolve to seed's real matter; fall back only if missing |
| `DEMO_FIELDS` (CCL fallback) | Mr Luke Test / Acme Corp / Rory McBride | **No — stale Acme** | Replace with Helix Demo / Britannia House / £42,500 (from the seed) |
| OperationsQueue Bank/CCL/Txn/V2 tiles | `HLX-DEMO-3311402/4428801/5501/7702/2299107/8801/8802` | No | **Keep mocked** (aggregate-shaped); prefix every row `Demo · `; no backend writes |
| Time metrics tile (Home) | `demoTimeMetrics` (numbers only) | n/a — pure mock | **Keep mocked**; small "demo numbers" sublabel when demo on |
| Annual leave (`AnnualLeaveForm`) | `demoLeaveRecords` | n/a — pure mock | **Keep mocked**; sublabel as above |
| Matter-opening wizard demo simulation | `DEMO-3311402` | No | Out of scope (separate brief `compactmatterwizard-split-by-wizardmode`); leave as-is |
| `tools/db/seed-demo-matter.sql` (`HLX-DEMO-*`) | DB writes | No | **Retire** (file delete or archive) |

#### Phase B tasks

| # | Change | File |
|---|--------|------|
| B1 | **Repoint Home demo to-dos to the seed.** Review CCL → matter on `HLX-27367-94842`; Allocate Documents → enquiry 27367 (Helix Demo); Verify ID → instruction `HLX-27367-94842`. Drop `DEMO-3311402` / `DEMO-ENQ-5521` / `HLX-DEMO-00001` from this surface. | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) (`immediateActionsList` ~L6740–L6819) + [src/utils/demoTodoFixtures.ts](../../src/utils/demoTodoFixtures.ts) if present |
| B2 | **Replace `DEMO_FIELDS`** (cclSections.ts) with values derived from the seed: Helix Demo / Britannia House / £42,500 / £2,500 / Britannia Test Counterparty Ltd. Remove all Luke Test / Acme Corp / Rory McBride strings. | [src/tabs/matters/ccl/cclSections.ts](../../src/tabs/matters/ccl/cclSections.ts) (~L244) |
| B3 | **Resolve `DEMO_MATTER` to the seed's real matter** when one exists (lookup by `instructionRef = 'HLX-27367-94842'`); fall back to current synthetic only if no real matter is opened yet. | [src/tabs/matters/Matters.tsx](../../src/tabs/matters/Matters.tsx) (~L57) |
| B4 | **Tighten `DEMO-ENQ-0002` / `0003` labels** to `Demo · Lease renewal` / `Demo · Employment tribunal`. Document them as deliberate decoys (decorative-only — never write to backends). | [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) (~L3211) + [src/tabs/enquiries/utils/enquiryHelpers.ts](../../src/tabs/enquiries/utils/enquiryHelpers.ts) |
| B5 | **Decorative-by-design label** for OperationsQueue tiles: prefix every row in `DEMO_BANK_ITEMS` / `DEMO_CCL_ITEMS` / `DEMO_TXN_ITEMS` / `DEMO_RECENT_ITEMS` / `DEMO_V2_ITEMS` with `Demo · ` and add a single "demo numbers" pill at the strip header when `demoModeEnabled`. No write paths from these. | [src/components/modern/OperationsQueue.tsx](../../src/components/modern/OperationsQueue.tsx) (~L208–L300) |
| B6 | **Time metrics + annual leave sublabel.** When demo on, render a small `Demo numbers` chip on the Home time-metrics tile and the leave widget so a viewer immediately sees "this tile is illustrative; numbers don't reflect reality". | [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) (~L5901), [src/CustomForms/AnnualLeaveForm.tsx](../../src/CustomForms/AnnualLeaveForm.tsx) (~L496) |
| B7 | **Reset Demo one-click** in CommandDeck. New chip "Reset demo" (LZ/AC only). Sequence: (1) `setDemoModeEnabled(false)`; (2) clear `localStorage` keys `demoModeEnabled`, `cclDraftCache.*`, all `helix.demo.*`; clear `sessionStorage`; (3) `POST /api/dev/reseed-rehearsal` (new dev-only route that shells out to `scripts/seed-rehearsal-record-sql.mjs --confirm`); (4) toast "Demo reset · seed reaffirmed · 1 row". | [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) (CommandDeck section), NEW [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| B8 | **Retire `tools/db/seed-demo-matter.sql`.** Delete or move to `tools/db/_archive/`. Update any references (search for `seed-demo-matter` in repo). | [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) |
| B9 | **End-to-end smoke** against the seed: `node tools/instant-lookup.mjs pipeline HLX-27367-94842`; open in inline workbench; CCL Fill + Safety Net; capture result and tick acceptance. | n/a (verification) |
| B10 | **Changelog + close brief.** | `logs/changelog.md` |

**Phase B acceptance (the demo-confidence bar):**
- Demo ON → Home to-do strip surfaces 3 cards all wired to the seed (no orphan IDs).
- Demo ON → Matters tab shows the seed's real matter (or a single clearly-labelled fallback).
- Demo ON → CCL fallback uses Helix Demo / Britannia House / £42,500. No Acme / Luke / Rory strings anywhere.
- Demo ON → OperationsQueue tiles every row prefixed `Demo · ` with a single header pill saying "demo numbers".
- Demo ON → Time metrics + leave widget show a small `Demo numbers` chip.
- Reset Demo button: one click → demo off, local caches cleared, seed reaffirmed, single toast.
- `tools/db/seed-demo-matter.sql` deleted/archived.
- All synthetic write paths confirmed inert (Clio, Core Data, Instructions DB) when demo on.

#### Phase B addendum: Allocate Documents card (shipped 2026-05-07)

Two follow-ups to B1 once the seed-anchored demo card was in front of real users:

1. **Click destination.** The card now lands the user directly on the **Documents** tab inside the enquiry workbench (not just a timeline scroll). The dispatch carries `workbenchTab: 'documents'` alongside the existing `timelineItem: 'doc-workspace'`; [src/app/App.tsx](../../src/app/App.tsx) persists it as `localStorage.navigateToWorkbenchTab` and [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) reads it inside the pending-enquiry effect to call `setWorkbenchInitialTab('documents')`. Applies to both the real card and the demo seed (rehearsal prospect 27367), so Ctrl+Shift+D walkthroughs land on the docs tab where the actual allocation UI lives.
2. **User scoping.** `/api/doc-workspace/pending-actions` is a firm-wide blob scan, so Alex used to see Lukasz's holding files. Card is now scoped client-side: non-firm-wide users only see actions whose enquiry POC matches their initials; LZ/KW/EA (and admins who opt into firm-wide Home metrics) still see the full set. Filter lives in `immediateActionsList` in [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx); no server change.

### Phase C — Rehearsal infra hardening + generic interface — *open*

> **Why this exists.** Phases A + B made the seed real, internally consistent, and demo-presentable. Phase C is the remaining hardening: stop demo runs from leaking into production Clio / NetDocuments, give demo mode its own observability, surface a runbook link, and lay the groundwork for per-AOW rehearsal seeds + inbound mail routing. None of these block today's demo, but each one removes a footgun before the surface is opened to non-LZ presenters.
>
> **Source.** Phase C amalgamates this brief's original "generic rehearsal-record interface" with the still-relevant items from the now-archived `demo-mode-hardening-production-presentable-end-to-end` brief. Phases A/B/E of that older brief were superseded by Phase A/B above; the items below are the live carryovers.

#### C1 — Clio write safety for rehearsal/demo refs (carryover)

Add a `CLIO_DRY_RUN_FOR_REHEARSAL_REFS=1` env flag (renamed from the older `CLIO_DRY_RUN_FOR_DEMO_REFS` to align with the rehearsal vocabulary). When set, [server/routes/clio-matters.js](../../server/routes/clio-matters.js) and [server/routes/clio-contacts.js](../../server/routes/clio-contacts.js) short-circuit on refs matching `^(HLX-27367-|DEMO-|HLX-DEMO-)` and return a synthetic Clio response without writing. Telemetry: `Demo.Clio.WriteSkipped` with `{ ref, route, seed: 'rehearsal' }`.

Acceptance: with the flag on, a `matter-oneoff-replay` against `HLX-27367-94842` returns success and emits `Demo.Clio.WriteSkipped` without creating a Clio contact or matter.

#### C2 — NetDocuments isolation (carryover)

Replace single `CCL_ND_UPLOAD_FOLDER` with `CCL_ND_UPLOAD_FOLDER_REHEARSAL` and `CCL_ND_UPLOAD_FOLDER_PROD` in [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js). Refs in the rehearsal allowlist route to `*_REHEARSAL`; everything else to `*_PROD`. Document folder ids in [docs/AZURE_OPERATIONS.md](../../docs/AZURE_OPERATIONS.md).

Acceptance: a CCL upload against `HLX-27367-94842` lands in the rehearsal ND folder; a real-client CCL still lands in prod.

#### C3 — Demo + rehearsal telemetry (carryover)

Centralised `Demo.*` events emitted from `server/utils/appInsights.js` (already tags rehearsal refs with `seed: 'rehearsal'` after Phase A8). Add: `Demo.Mode.Enabled`, `Demo.Mode.Disabled`, `Demo.Reset.Triggered`, `Demo.Clio.WriteSkipped`, `Demo.ND.RouteSwitched`. KQL runbook entry: "Rehearsal-record traffic in last 30 days, by user / route / outcome."

Acceptance: toggling demo mode from CommandDeck and clicking Reset Demo both produce visible events in App Insights filtered by `customDimensions.seed == 'rehearsal'`.

#### C4 — Runbook discoverability (carryover, scoped down)

Add a single "About demo mode" link in CommandDeck (LZ/AC only, next to the Reset Demo chip) pointing to [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md). The standalone `DemoWalkthrough.tsx` from the older brief is **not** carried over — the Ctrl+Shift+D presenter cheat sheet (`DemoCheatSheetOverlay`) shipped 2026-05-05 already covers that need.

Acceptance: link visible only to LZ/AC, opens the runbook inline, runbook still exists and reflects post-Phase-B reality (i.e. references the rehearsal seed, not `HLX-DEMO-*`).

#### C5 — Generic rehearsal-record interface (original Phase C)

- `IsRehearsalSeed BIT` column on `Instructions` so any instruction can be flagged as a rehearsal seed instead of hard-coding the rehearsal allowlist.
- Per-AOW rehearsal seeds (Property, Employment, Construction) following the same pattern as Phase A's Commercial seed.
- Update C1/C3 to drive the rehearsal allowlist from `Instructions.IsRehearsalSeed = 1` rather than a hard-coded constant.

#### C6 — Inbound email routing for `automations@helix-law.com` (original Phase C)

- Parse mail to `automations@helix-law.com` and dispatch to the rehearsal record referenced in subject / body / `In-Reply-To`. Phase A already chose this address deliberately so this hook is unblocked.
- Coordinates with `server-mail-send-helper-extraction` and `call-centre-external-attendance-note-and-clio-mirror`.

#### C — execution order

1. **C1** (Clio dry-run flag) — server-only, reversible. Highest safety gain.
2. **C2** (env-split ND folders) — server-only.
3. **C3** (telemetry) — small, makes C1/C2 observable.
4. **C4** (runbook link) — UI-only, one chip.
5. **C5** (`IsRehearsalSeed` + per-AOW seeds) — schema change; do once C1/C3 are wired so the allowlist switch is mechanical.
6. **C6** (inbound mail routing) — depends on C5 plus `server-mail-send-helper-extraction`.

#### Items intentionally NOT carried over from `demo-mode-hardening`

- **Centralise demo fixtures into `src/utils/demoData.ts`** — superseded; Phase B collapsed surfaces onto the seed and labelled the remaining decorative-by-design tiles in place.
- **`?reset-demo=1` URL param + `POST /api/admin/demo/reseed`** — superseded by Phase B7 (Reset Demo chip + `POST /api/dev/reseed-rehearsal`).
- **Pre-create a labelled "Helix Demo Matter — DO NOT EDIT" Clio matter (old C2)** — superseded; the rehearsal seed itself plays this role and demo refs route through C1's dry-run flag.
- **DEMO chip in header (old E1)** — superseded by the existing CommandDeck demo chip.
- **`DemoWalkthrough.tsx` checklist (old E2)** — superseded by the Ctrl+Shift+D presenter cheat sheet.
- **Per-user ND folders (old D2)** — deferred indefinitely; only revisit if C2 proves insufficient.

---

## 4. Sample data (signed off 2026-05-05)

### 4.1 Naming

- First name: **Helix**
- Last name: **Demo**
- Display label across the Hub: **"Helix Rehearsal — system test client"**

### 4.2 Natural-person contact

| Field | Value |
|---|---|
| Title | Mr |
| First / Last | Helix Demo |
| Email | **`automations@helix-law.com`** *(functional inbox — enables future inbound email routing)* |
| Phone (DDI) | `+44 1273 091111` *(Brighton dialling, ends `91111`)* |
| Mobile | `07783949281` *(operator's real mobile — needed to receive cross-app SMS / verification tests against this rehearsal contact)* |
| DOB | `1985-11-11` |
| Address | **Second Floor, Britannia House, 21 Station Street, Brighton BN1 4DE** *(Helix's real registered office)* |
| Nationality | British |
| ID type | UK Passport |
| Passport expiry | `2031-11-11` |

### 4.3 Company variant

| Field | Value |
|---|---|
| Client type | Company |
| InstructionRef | `HLX-27367-11112011` |
| Company name | **Helix Law Limited** |
| Company number | **`07845461`** |
| VAT number | **`124713339`** |
| Incorporation date | `2011-11-11` *(real)* |
| Registered office | Second Floor, Britannia House, 21 Station Street, Brighton BN1 4DE |
| Authorised signatory | Helix Demo, Director |

### 4.4 Scenario (drives CCL generation)

- **Area of Work:** Commercial
- **Service description:** "Pre-action commercial debt recovery — outstanding invoice of £42,500 for completed consultancy services. Initial review of contractual terms and invoice trail, opponent correspondence, advice on merits and proportionate next steps including pre-action protocol letter."
- **Estimated retainer:** £2,500
- **Disputed sum:** £42,500
- **Opponent:** Britannia Test Counterparty Ltd
- **Opponent address:** `1 Sample Lane, London EC1A 1AA`
- **Source:** Existing client / direct
- **Risk score:** Low–Medium
- **MLRO sign-off:** LZ
- **Originating fee earner:** LZ
- **Supervising:** AC
- **Fee earner on instruction:** assigned at matter open (default LZ)

### 4.5 Aiden easter egg — tier 1 + 2 + 3

1. Single line in the enquiry notes: *"Initial triage by Aiden (automation)."*
2. Aiden as named author on AI-generated internal notes (CCL drafts, risk auto-summaries, time-narrative suggestions): *"Drafted by Aiden (Helix automation)."*
3. Reserved metadata field in seed config: `__rehearsal_persona = 'aiden'`. Pure placeholder. Does nothing today — reserves namespace for future agent identity.

Aiden is owned by the AI/automation lane, **never as a person**. This avoids repeating the Teams-bot confusion.

### 4.6 Easter egg roll-up (single source)

- Phone DDI ends `91111`
- Mobile is the operator's real number (deliberate — receives SMS tests from other apps)
- DOB `1985-11-11`
- Passport expiry `2031-11-11`
- Company incorporated `2011-11-11` (genuine)
- Second instruction ref `HLX-27367-11112011`
- Email `automations@helix-law.com` (functional, enables Phase C email routing)
- "Aiden" as automation byline / metadata persona

---

## 5. Step-by-step execution order (Phase A)

1. **A3 first** (Core Data enquiries) — lowest blast radius, lets us verify the SQL pattern.
2. **A4** Instructions DB (Instructions / Deals / PitchContent) — the meaty one.
3. **A5 + A6** IdVerifications + RiskAssessments — round out the natural-person path.
4. **A7** Company variant instruction — separate row, separate ref.
5. **A1 + A2** AC contact and deal updates — last, because AC is the externally visible system. Verify Hub-side first.
6. **A8** App Insights `seed: 'rehearsal'` tag — middleware shim that checks ref against a known-list constant.
7. **A9** Changelog.

Each SQL change goes into a single idempotent script `scripts/seed-rehearsal-record-sql.mjs` so it can be re-run cleanly. AC changes go into `scripts/seed-rehearsal-record-ac.mjs`. Both committed; both logged.

### Phase A delivery log

- **2026-05-05 — A3 / A4 / A5 / A6 / A7 / A8 / A9 landed.** `scripts/seed-rehearsal-record-sql.mjs` written and run with `--confirm`. All 9 planned ops succeeded; only the legacy Core `enquiries` row (ID=27367) was skipped (absent — already lives in new-space). `server/utils/appInsights.js` now auto-tags any telemetry referencing `HLX-27367-94842` or `HLX-27367-11112011` with `seed: 'rehearsal'`. Changelog entry filed. Verified via `node tools/instant-lookup.mjs pipeline HLX-27367-94842` — Instructions, IdVerifications (`Passed`), RiskAssessment (`Low-Medium`), Deals 234, and the company variant `HLX-27367-11112011` (Helix Law Limited / 07845461) all show the new identity.
- **Delivered — A1 (ActiveCampaign contact sync), 2026-05-05.** Script `scripts/seed-rehearsal-record-ac.mjs` (plan-only by default; `--confirm` to fire). AC contact `27367` updated: `firstName=Helix`, `lastName=Demo`, `email=automations@helix-law.com`, `phone=07783949281` (operator's real mobile — keeps SMS / verification tests from other apps reachable). Tag `helix-rehearsal-seed` (id=1160) created and attached. Idempotent — re-runs show zero changes. **Custom field values (DDI, address, AOW, etc.) intentionally NOT touched** — no canonical field-ID map and high downstream-automation trigger risk. Add to Phase B/C scope when needed.
- **Skipped permanently — A2 (ActiveCampaign deal sync).** Per operator (2026-05-05): *"we don't use deals in AC for now."* `DEAL_ID=234` referenced in this brief was the Instructions DB `Deals.DealId`, not an AC deal id. Script tolerates the 404 and proceeds with contact + tag only. Do not re-open A2 unless AC deals usage changes.

---

## 6. Verification checklist

**Phase A:**
- [ ] AC contact `27367` shows "Helix Demo" / `automations@helix-law.com` / Britannia House.
- [ ] AC deal `234` shows commercial debt recovery scenario, £2,500 amount.
- [ ] Core Data `enquiries` row for prospect 27367 reflects new identity.
- [ ] Instructions DB `HLX-27367-94842` row shows new fields end-to-end.
- [ ] `HLX-27367-11112011` exists in Instructions DB with company client fields.
- [ ] CCL generation against `HLX-27367-94842` returns a draft naming Helix Demo, £42,500 / £2,500, Britannia House.
- [ ] CCL Safety Net (`pressure-test`) scores fields without flagging fictional placeholders.
- [ ] App Insights query `customEvents | where customDimensions.seed == 'rehearsal'` returns events.
- [ ] `/pitch/luke-portal` still renders (no submodule changes — verify it still works against new data).

**Phase B (deferred):**
- [ ] No remaining references to "Acme Corp" or "HELIX01-01" in `cclSections.ts` / `Matters.tsx`.
- [ ] Quick Action "Open rehearsal record" visible to admin tier on Home.
- [ ] "Rehearsal" badge renders on matter overview, CCL view, call notes view.

---

## 7. Open decisions (defaults proposed)

1. **Sample data sign-off** — DONE 2026-05-05 (Helix Demo, VAT 124713339, company 07845461).
2. **Should the rehearsal record have a real Clio matter created for it during Phase A?** — Default: NO during Phase A. Let the first real `matter-oneoff-replay` against the new data create it organically. This proves the live flow.
3. **Should `DEMO_FIELDS` be removed entirely or kept as fallback?** — Default: keep as fallback when rehearsal record can't be fetched (offline / dev disconnect), but route the happy path to real data.
4. **Phase A scope for ship-tomorrow** — Default: A3, A4, A5, A6, A1, A2, A9. Defer A7 (company variant) and A8 (telemetry tag) by 24h if pressed for time.

---

## 8. Out of scope

- New sandbox tier / test-mode infra.
- Deletion or rename of `HLX-27367-94842`.
- Changes to `submodules/instruct-pitch` (read-only per house rules).
- Email routing infrastructure for `automations@helix-law.com` (Phase C).
- Replacement of `tools/db/seed-demo-matter.sql` HLX-DEMO concept (Phase B5).
- Per-AOW rehearsal seeds (Phase C).

---

## 9. Addendum 2026-06 — Home Allocate / Transfer cards

The Home "Allocate Documents" card has been gated to LZ only. Holding-folder
filing is a triage tool, not a flow we want to encourage firm-wide once a
matter is open. The endpoint (`/api/doc-workspace/pending-actions`) is
unchanged and still does the firm-wide blob scan.

In its place for everyone else, a new "Transfer Documents" card surfaces
instructions where a matter is already open and at least one document hasn't
been pushed to ND yet. Backed by SQL on `dbo.Documents`, not a blob scan, so
it's cheap. Endpoint: `GET /api/documents/pending-transfers` (60s server-side
cache).

Three new nullable columns were added to `dbo.Documents`:

- `TransferredToNdAt DATETIME2(3) NULL` — set when the document is filed in ND.
- `NdDocId NVARCHAR(64) NULL` — the ND-side identifier, post-transfer.
- `RemovedFromAzureAt DATETIME2(3) NULL` — set when the source blob is purged.

A filtered index `ix_Documents_pending_transfer` covers
`WHERE TransferredToNdAt IS NULL` so the Home query stays cheap as the table
grows.

The expanded pane also gains a reusable `kind: 'list'` mode for showing a
clickable queue of entities inline, used here to triage Transfer Documents
without leaving Home. Future post-matter-opening cards (e.g. ND transfer
breakdown by stage) reuse the same pattern.

Demo seed: when demo mode is on, the Transfer Documents card renders against
the rehearsal record (HLX-27367-94842 + a fake HLX-27367-94843) so the list
expansion is showcased without waiting on real data.

## 9. File index (single source of truth)

**Client:**
- [src/tabs/matters/ccl/cclSections.ts](../../src/tabs/matters/ccl/cclSections.ts) — `DEMO_FIELDS` to be derived from rehearsal record (Phase B1)
- [src/tabs/matters/Matters.tsx](../../src/tabs/matters/Matters.tsx) — `DEMO_MATTER` to resolve to real matter (Phase B2)
- [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) — `isDemoMatter` check + portal link
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) — Quick Action "Open rehearsal record" (Phase B3)

**Server:**
- [server/routes/people-search.js](../../server/routes/people-search.js) — verify lookup of new identity
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) — CCL generation reads rehearsal record
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) — call notes path against rehearsal record
- [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js) — CCL upload-Clio flow
- [server/routes/clioContacts.js](../../server/routes/clioContacts.js) — Clio contact creation on matter open
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — `seed: 'rehearsal'` tagging

**Scripts / docs:**
- `scripts/seed-rehearsal-record-sql.mjs` (NEW) — idempotent SQL upserts (Core + Instructions)
- `scripts/seed-rehearsal-record-ac.mjs` (NEW) — AC contact + deal updates
- [tools/run-matter-oneoff.mjs](../../tools/run-matter-oneoff.mjs) — used to open Clio matter against rehearsal record
- [tools/db/seed-demo-matter.sql](../../tools/db/seed-demo-matter.sql) — HLX-DEMO seed (to retire / fold in, Phase B5)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata

```yaml
# Stash metadata
id: helix-rehearsal-record-luke-test-as-firm-seed
verified: 2026-05-06
branch: main
touches:
  client:
    - src/tabs/home/Home.tsx
    - src/tabs/matters/Matters.tsx
    - src/tabs/matters/MatterOverview.tsx
    - src/tabs/matters/ccl/cclSections.ts
  server:
    - server/routes/people-search.js
    - server/routes/ccl-ai.js
    - server/routes/ccl-ops.js
    - server/routes/dubberCalls.js
    - server/routes/clioContacts.js
    - server/utils/appInsights.js
    - tools/run-matter-oneoff.mjs
  submodules: []
depends_on: []
coordinates_with:
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - hub-unified-scope-layers-operator-actions-evals-distance
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - ccl-review-action-extraction
  - call-centre-external-attendance-note-and-clio-mirror
  - quick-actions-rework-empty-state
  - hub-rollout-training-and-confidence-recovery
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - clio-token-refresh-architecture-audit
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-ia-ld-undertaking-complaint-flow
  - forms-preflight-matrix-in-activity-tab
  - forms-stream-persistence
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - helix-software-dev-productivity-control-plane
  - home-skeletons-aligned-cascade
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - management-dashboard-trust-gate
  - reporting-trust-and-ops-visibility
  - server-mail-send-helper-extraction
  - session-probing-activity-tab-visibility-and-persistence
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
  - clio-webhook-reconciliation-and-selective-rollout
  - docs-transfer-review-ccl-review-fixes
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - realtime-delta-merge-upgrade
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
conflicts_with: []
```

---

## 10. Gotchas appendix

- **Submodules are read-only.** `submodules/instruct-pitch/luke-portal` already works against the existing instruction ref. Do NOT modify it. The new identity must therefore use the same `HLX-27367-94842` ref so the portal continues to render.
- **AC field protection.** Do not touch AC contact `id`, `cdate`, original create timestamps, or list memberships. Only update display fields and custom fields. Confirmed scope: name, email, phone, address, deal-linked custom fields.
- **The CCL `DEMO_FIELDS` constant is read at module load.** Phase B1 must convert it to a function or async fetcher; doing the swap at `import` time will break SSR / test snapshots.
- **`DEMO_MATTER_CLIO_ID = '3311402'`** is referenced by `MatterOverview.tsx` `isDemoMatter` predicate. When B2 swaps it, update the predicate too — otherwise the "Open client portal" button disappears for the rehearsal record.
- **`tools/run-matter-oneoff.mjs`** populates `company_details` from Instructions when ClientType=Company, and pulls EID from `IdVerifications`. The company variant `HLX-27367-11112011` will Just Work with this tool — no tool changes needed.
- **`automations@helix-law.com` must be a real receiving inbox** (or alias) for Phase C email routing to be possible later. Confirm with operator before going live with that as the email field. If not yet routable, still set the field — undeliverable is acceptable for Phase A.
- **Risk colour source must remain `RiskAssessmentResult`** (per copilot-instructions guardrail), not `TransactionRiskLevel`. The seeded risk row must populate `RiskAssessmentResult`.
- **Telemetry tag**: `seed: 'rehearsal'` should be applied via a thin middleware that checks the ref against a constant `REHEARSAL_REFS = ['HLX-27367-94842', 'HLX-27367-11112011']`, not by mutating individual `trackEvent` call sites. Centralised so future rehearsal seeds inherit the tag.
- **Instruct-pitch luke-portal** is keyed by passcode `94842`. Don't change the passcode under any circumstances.
- **Aiden namespace**: the metadata field `__rehearsal_persona = 'aiden'` is a placeholder. No live code should branch on it. If a future agent module is added, it inherits this field; until then, it is dead weight on purpose.

