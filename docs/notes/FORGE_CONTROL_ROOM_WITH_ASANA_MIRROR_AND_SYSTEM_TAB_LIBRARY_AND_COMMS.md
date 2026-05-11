# Forge Control Room with Asana mirror and System tab library and comms

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-03 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.
>
> **Parent programme.** This brief is the next arc on top of [HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md](./HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md) (Phase A2 shipped 2026-05-03). The whiteboard built there is the seed; this brief reshapes its cadence, plugs it into Asana, and grows the System tab into a single home for dev/comms tooling. **Do not duplicate the whiteboard CRUD route — extend it.**

---

## 1. Why this exists (user intent)

User said, verbatim (2026-05-03):

> "this becomes a sort of home for all of the different tools and we can visualise what we have in terms of dev stuff. The roadmap should be weekly with maybe some daily breakdown but I don't want to have to maintain it daily, as it doubles up on the task idea. So lets also have this have insight into the tech and automations Asana project, and show the position like we do the ops accounts asana board in home for ops. This becomes a sort of control room for the asana tickets of that board. It will need to mirror tickets into asana and update them as users complete them. Possibly look at the tasking functionapp or submodule to understand how all that works in depth first. I want to expand on the system tab, including the library/templates and comms next. I need a central space to visualise the emails that are going out and the signatures and edit things if needed. I want to be mindful of how it all works including signature attachment to records because I want the simplest solution possible in terms of maintaining code. So I want to consider that and standardising files where same content."

Three asks fused:

1. **Reframe the Forge whiteboard from daily to weekly.** Keep an optional daily view inside the active week, but the maintenance unit is the week. Daily granularity duplicates the task-list mental model and adds friction.
2. **Make the System tab the home for dev tools** — visualise what we have, including a live mirror of the Asana **Tech & Automations** project (the dev-side counterpart to the Ops Accounts board the firm already trusts on Home). Two-way: tickets stay sourced in Asana; the Hub drives status changes through the existing OAuth path.
3. **Grow System with a Library lens and a Comms lens.** Library = a single visualisation of every template family the Hub already owns (registry already exists, see §2.5). Comms = a single visualisation of the outbound email surface, the firm signature, and the per-user personal signatures, with edit affordances and a clear "where does this string actually live in code" answer for every block.

What the user is **not** asking for:

- A new tasking product. The hub-tasking surface remains a future stash (Phase F5 of the parent brief).
- Replacing Asana. Asana stays the source of truth for Tech & Automations tickets; the Hub mirrors and drives.
- A new template-authoring engine. The existing `templatesRegistry.ts` + family owners stay as-is; this brief makes them visible.
- Rewriting the email send path. `server/utils/helixEmail.js` already centralises personal signature loading + appending; this brief surfaces it, removes duplicated firm-signature constants, and adds operator visibility — it does not change the send contract.

---

## 2. Current state — verified findings

Every claim below is backed by a file path and a line/region reference. None are memory-based.

### 2.1 The whiteboard we already shipped (parent A2)

- [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx) — Today / Next 7 / Later / Parked / Done lanes, HTML5 drag-reorder, in-lane reorder uses `manualOrder` float midpoints, cross-lane drag rewrites `scheduledDate`, drag-to-Done sets `status`, drag-to-Parked soft-deletes. Inline edit on title / date / status / notes. `data-helix-region="system/forge/whiteboard"`.
- [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) — mounts the whiteboard above the existing Forge sections (Next deposits / Stale briefs / Recent changes / Toolbelt / Generated artifacts).
- [server/routes/dev-roadmap.js](../../server/routes/dev-roadmap.js) — JSON-backed CRUD at `/api/dev-console/roadmap`, dev-owner gated, telemetry under `DevConsole.Roadmap.{Get,Create,Update,Delete}.{Started,Completed,Failed}` + duration metric. Soft-delete moves items to `parked` with `deletedAt`.
- [data/roadmap-whiteboard.json](../../data/roadmap-whiteboard.json) — JSON store, gitignored. Item shape today: `{ id, title, scheduledDate (yyyy-mm-dd), status, notes, manualOrder, createdAt, updatedAt, deletedAt? }`.
- [src/tabs/roadmap/Activity.css](../../src/tabs/roadmap/Activity.css) — `.activity-dev-whiteboard` and lane / card / drag styles using helix design tokens.

This brief **extends** the existing route and component. It does not replace either.

### 2.2 Asana plumbing — already in the codebase

The hub already has every Asana primitive this brief needs. New work plugs into existing helpers, never re-implements them.

- [server/utils/asana.js](../../server/utils/asana.js) L1–L100 — `resolveAsanaAccessToken({ email, initials, entraId })`: prefers `process.env.ASANA_ACCESS_TOKEN`, falls back to per-user OAuth refresh from `[dbo].[team]` (columns `ASANAClient_ID` / `ASANASecret` / `ASANARefreshToken`). Exports `ASANA_BASE_URL`, `ASANA_WORKSPACE_ID = '1203336123398249'`, `ASANA_ACCOUNTS_PROJECT_ID = '1203336124217593'`.
- [server/routes/opsQueue.js](../../server/routes/opsQueue.js) L600–L680 — canonical "render an Asana project as a sectioned task list" implementation, used today for the **Ops Accounts** board on Home. Endpoint: `GET /api/ops-queue/asana-account-tasks?initials=KW`. Fetches sections, then incomplete tasks per section in parallel with a 120s in-memory cache, parses `HLX-####-#####` matter refs out of task names, returns `{ success, tasks, sections }`. **Telemetry: `OpsQueue.AsanaAccountTasks.Fetched` + `OpsQueue.AsanaAccountTasks` exception path.** This is the pattern Phase B clones.
- [server/routes/techTickets.js](../../server/routes/techTickets.js) — existing tech-tickets *create* flow (idea / problem) with team-table-resolved Asana recipients. Confirms the write path against the tech project already works end-to-end with telemetry + `formSubmissionLog`.
- [server/routes/bundle.js](../../server/routes/bundle.js) L83–L200 — example of `POST https://app.asana.com/api/1.0/tasks` writes using per-user OAuth credentials and `recordStep('asana.create', …)`. The complete-ticket / update-ticket calls in Phase C follow this shape.
- [server/utils/formSubmissionLog.js](../../server/utils/formSubmissionLog.js) — `recordSubmission / recordStep / markComplete / markFailed`. Every Asana write done from this brief MUST go through it so the existing observability dashboards keep working.

**The Tech & Automations project does NOT exist as a route yet.** Project gid is currently unknown to the codebase — the user will need to confirm it (probably visible in the Asana URL of that board). Phase A1 is "capture the gid as `ASANA_TECH_AUTOMATIONS_PROJECT_ID` in env + `server/utils/asana.js`".

### 2.3 The "tasking functionapp / submodule" the user asked us to inspect

There is **no `tasking` submodule** in `submodules/`. The directory contains: `aged-debts-v2`, `enquiry-processing-v2`, `instruct-pitch`, `transaction-intake`, `typefxce`. Confirmed via `list_dir submodules/`.

What does exist with "Tasking" in the name (read-only context for any future agent):

- **Tasking-v3 bot service** — separate Azure App Service at `tasking-v3.azurewebsites.net/api/messages`. Documented in [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) L306, L315–L325. Currently shares AAD app id `bee758ec` with the Team Hub tab, which is the blocker the ROADMAP describes. It is a **Teams bot**, not a Hub-side tasking surface, and is not in scope for this brief.
- [src/CustomForms/Tasking.tsx](../../src/CustomForms/Tasking.tsx) — a *Cognito-style intake form* used to file a new task. It is one form among many (`Tasking`, `TelephoneAttendance`, `Bundle`, etc.); it does not own a roadmap or pickup queue.
- "Tasking" as a **communication framework** — [server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js) L81. Pressure-test prompt family for outbound *task assignments*. Scope: language, not workflow.

**Conclusion for the brief:** "the tasking system" is currently a Teams bot + a Cognito form + a comms-frameworks prompt. There is **no Hub-side tasking workflow that owns durable state** today. The Asana **Tech & Automations** board *is* the dev tasking system in practice. That is exactly why the user's ask collapses to "mirror that board into Forge". A future Hub-wide tasking product is parent brief Phase F5 and stays out of scope here.

### 2.4 The Ops Accounts Asana board on Home — the visual we are mirroring

The Hub already shows an Ops Accounts Asana view that the firm trusts. Search for `asana-account-tasks` confirms a single consumer:

- Server: [server/routes/opsQueue.js](../../server/routes/opsQueue.js) L603+ (route).
- Server route smoke entry in [server/index.js](../../server/index.js) L253: `{ path: '/api/ops-queue/asana-account-tasks?initials=KW', method: 'GET', label: 'Asana Tasks' }` — i.e. KW is the canonical resolved Asana identity for the Accounts board.
- The grep shows zero direct client consumers, which means the board is rendered through the live ops-queue stream / a panel that consumes the bundled queue payload. Treat this as "the response shape and cache contract are stable" — the new Forge consumer can be a fresh, focused panel (do not try to embed the Home version inside Forge).

**Visual contract for Forge:** sectioned list (the Asana sections render as lanes), task cards inside each lane, assignee avatar, due date, matter ref pill if name matches `^([A-Z]+-\d+-\d+)`, link out to `permalink_url`. Mirror this exactly so the Tech & Automations control room feels like a sibling of the Accounts board, not a new product.

### 2.5 Templates registry — already exists, just not visualised in System

- [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts) — `HUB_COMMS_TEMPLATE_FAMILIES` enumerates **7 families** with `id / title / status (live|mapped|partial) / summary / stat / owners[]`:
  1. `notifications` — Card Lab catalogue
  2. `pitch-scenarios` — `PracticeAreaPitch` scenario count (computed)
  3. `pitch-blocks` — `Production` + `Simplified` block counts
  4. `signatures` — server-appended personal signatures + firm shell
  5. `document-requests` — verification doc request emails
  6. `ccl` — CCL template + ops send guard
  7. `frameworks` — 6 communication-framework prompt families
- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx) — already renders those families as cards with status pills under `data-helix-region="resources/templates"` inside the Resources tab.

The Library lens this brief adds in Phase D is **not a new registry** — it is a System-tab projection of the same `HUB_COMMS_TEMPLATE_FAMILIES` array, augmented with duplication detection and a "go to source" affordance per owner path. The registry stays as the single source of truth.

### 2.6 Signatures — the duplicate-content problem

Personal signatures are *already* well-centralised on the server side. Firm signatures are *not*.

- [server/utils/helixEmail.js](../../server/utils/helixEmail.js) L130–L340:
  - `getSignaturesRootDir()` (L134) walks a candidate list: `process.env.SIGNATURES_DIR`, `assets/signatures`, `src/assets/signatures`, then the same two relative to `process.cwd()`. Returns the first existing dir.
  - `pickSignatureFileFromDir(dirPath, fromEmail)` (L217) chooses an HTML file by `fromEmail`.
  - `loadPersonalSignatureHtml({ signatureInitials, fromEmail })` (L236) returns the raw HTML, run through `sanitizeSignatureHtml` (L176) and `ensureNoopenerRelForBlankTargets`.
  - `appendSignature(bodyHtml, signatureHtml)` (L262) concatenates.
  - `helixEmail.send` (L321) reads `body.use_personal_signature` + `body.signature_initials` and appends server-side. Verify-id (L591), Pitch Builder (L3408, L3646 of `PitchBuilder.tsx`), and `usePitchComposer.ts` (L327) all pass these flags. **The send contract is already standardised.**
- [src/tabs/enquiries/EmailSignature.tsx](../../src/tabs/enquiries/EmailSignature.tsx) — client-side firm signature shell used inside the Pitch Builder preview pane. Builds `signatureHtml` (L30) from `userData`.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9505–L9649 — **duplicates the firm signature constants inline** (`firmSignatureAddress`, `firmSignaturePhone`, `firmSignatureEmail`, `firmSignatureWeb`). This is the canonical example of the duplication the user is asking us to fix.

**The standardisation move (Phase E):** create a single `src/app/styles/firmSignature.ts` module exporting `FIRM_SIGNATURE = { address, phone, email, web, … }` and migrate `EmailSignature.tsx` + `OperationsDashboard.tsx` (and any other inline copies discovered by a grep on the same address string) to consume it. Personal signatures stay file-on-disk in `SIGNATURES_DIR` because that is already the simplest possible model and works for the existing send path.

### 2.7 The System tab and the Forge lens

- [src/tabs/roadmap/hooks/useActivityLayout.ts](../../src/tabs/roadmap/hooks/useActivityLayout.ts) — `VALID_LENSES` is the canonical list. Today `forge` is a member. Phase D adds `library`; Phase F adds `comms`.
- The Forge lens already mounts [DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) inside the System tab, gated by the dev-owner check (LZ). Library and Comms lenses follow the same pattern: a new section component per lens, registered in the lens enum + the layout switch.

---

## 3. Plan

The brief ships in six phases, each independently valuable and independently revertable.

### Phase A — Whiteboard goes weekly

**Shipped 2026-05-03:** Phase A is implemented. Existing items infer `weekStart` from `scheduledDate`, weekly lanes are live in Forge, the active-week daily breakdown is `localStorage`-only, drag/drop and date/status edits keep `weekStart` synced, and `DevConsole.Roadmap.*` telemetry now carries `cadence: 'weekly'`.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add `weekStart` (ISO date, Monday) to item shape on the server | [server/routes/dev-roadmap.js](../../server/routes/dev-roadmap.js) | Backfill on read: any existing item with `scheduledDate` infers `weekStart` as the Monday of that date. Validate on PATCH/POST — accept either field, persist both. |
| A2 | Replace day-lane geometry with week-lane geometry | [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx) | Lanes become: **This week / Next week / Two weeks out / Later / Parked / Done**. Sort within lane by `manualOrder` then `weekStart`. |
| A3 | Optional daily breakdown inside the active week | same | Toggle (off by default) that splits "This week" into Mon–Fri columns. Off = single lane. State stored in `localStorage` under `helix.forge.whiteboard.dailyBreakdown`. **No persistence to server**; the user explicitly does not want daily maintenance. |
| A4 | Drag rewrites `weekStart` (cross-lane) instead of `scheduledDate` | same | Drag from "This week" to "Next week" sets `weekStart` to next Monday; `scheduledDate` becomes optional metadata only. |
| A5 | Telemetry rename | both | Continue emitting `DevConsole.Roadmap.*` events. Add `cadence: 'weekly'` property so the dashboards distinguish pre/post cutover. |

**Phase A acceptance:**
- Existing items render in the correct week lane on first load (zero data migration).
- Daily breakdown columns are hidden when off; the local toggle reveals five columns inside "This week" when on.
- Telemetry events show `cadence=weekly` after rollout.
- TypeScript clean (`npx tsc --noEmit --pretty false`).

### Phase B — Read-only Asana mirror of the Tech & Automations board

**Shipped 2026-05-03:** Phase B is implemented. The mirror endpoint lives at `GET /api/dev-console/asana/tech-automations` (in `server/routes/dev-console.js`, not `dev-roadmap.js` — that path was the cleaner mount), with 120s in-memory cache and `DevConsole.Asana.TechAutomations.{Started,Fetched,Failed,CacheHit,Skipped}` telemetry. `<AsanaProjectMirror initials viewMode />` mounts inside `DevConsolePanel` and is also surfaced first in Roadmap mode (Phase G). Project gid defaults to the Tech & Automations project (`1204962032378888`, same gid `techTickets.js` posts to) via `ASANA_TECH_AUTOMATIONS_PROJECT_ID` in `server/utils/asana.js`; override with the env var of the same name.

#### B1. Server route: `GET /api/dev-console/asana/tech-automations`

Clone of `/api/ops-queue/asana-account-tasks` with the tech project gid. Lives in **the same router file** as the existing whiteboard (`server/routes/dev-roadmap.js`) so the dev-owner gate, telemetry namespace, and route prefix are reused.

```js
// pseudocode
const { resolveAsanaAccessToken, ASANA_BASE_URL } = require('../utils/asana');
const TECH_AUTOMATIONS_PROJECT_ID = process.env.ASANA_TECH_AUTOMATIONS_PROJECT_ID;
// 120s in-memory cache, sectioned fetch, parse HLX-#### refs out of task names.
// Telemetry: DevConsole.Asana.TechAutomations.{Fetched,Failed} + duration metric.
```

Return shape **must match** `/api/ops-queue/asana-account-tasks` so a shared client renderer can serve both boards.

#### B2. Client: `<AsanaProjectMirror projectKey="tech-automations" />`

New component at `src/tabs/roadmap/parts/AsanaProjectMirror.tsx`. Sectioned column layout matching the Ops Accounts board on Home:

- One column per Asana section (lane).
- Cards show: title, assignee initials avatar, due-on pill, matter-ref pill (if `^([A-Z]+-\d+-\d+)`), open-in-Asana button (`permalink_url`).
- 120s SWR-style refresh, optimistic UI is **off** in this phase (read-only).
- `data-helix-region="system/forge/asana/tech-automations"`.

Mounted from `DevConsolePanel.tsx` underneath the whiteboard.

**Phase B acceptance:**
- Anon hits `403`; LZ hits `200` and sees the live board.
- Telemetry `DevConsole.Asana.TechAutomations.Fetched` visible in App Insights with `taskCount` + `sectionCount` properties.
- Same response shape as Ops Accounts board (verified with a `diff <(curl …/ops-queue/asana-account-tasks) <(curl …/dev-console/asana/tech-automations)` of the top-level keys).

### Phase C — Two-way sync (control-room mode)

This is the "control room" part of the user's ask. Requires write credentials, so it ships behind dev-owner first and only opens up to wider collaborators after Phase F4 of the parent brief lands.

#### C1. `POST /api/dev-console/asana/tech-automations/:taskGid/complete`

- Resolves access token via `resolveAsanaAccessToken({ initials: req.user?.initials || req.query.initials })`.
- Calls `PUT https://app.asana.com/api/1.0/tasks/:gid` with `{ data: { completed: true } }`.
- Wraps every step with `formSubmissionLog` (`asana.complete:started/success/failed`).
- Telemetry `DevConsole.Asana.TechAutomations.Complete.{Started,Completed,Failed}` + duration.
- Cache invalidation: drops the 120s cache so the next read reflects the change.

#### C2. `PATCH /api/dev-console/asana/tech-automations/:taskGid`

Body: `{ name?, notes?, due_on?, assignee? }`. Mirrors Asana fields 1:1. Same telemetry pattern.

#### C3. Whiteboard ⇄ Asana linkage (the actual control-room behaviour)

This is the bit that makes Forge a *control room* rather than a duplicate todo list.

- Whiteboard items gain an optional `asanaTaskGid` field on the JSON store.
- New affordance on a whiteboard card: **"Link to Asana ticket"** → opens a picker fed by the B1 mirror response → writes `asanaTaskGid` to the whiteboard item.
- When a whiteboard item is dragged to **Done**, the server emits a follow-up `POST :gid/complete` to Asana (best-effort, telemetered, never blocks the whiteboard write — the JSON store update succeeds first, then the Asana call is fire-and-forget with telemetry on failure).
- When a whiteboard item with `asanaTaskGid` is *un*completed (dragged out of Done), emit a `PATCH` setting `completed: false`.
- When the B1 mirror polls and an Asana task moves to a different section, **do not** touch the whiteboard `weekStart` — Asana sections are the dev's queue, the whiteboard is the operator's plan. They drift on purpose.

**Phase C acceptance:**
- Marking a linked whiteboard item Done flips the Asana ticket to completed within one polling cycle (≤120s).
- Editing title/notes/due-on on a linked whiteboard item PATCHes Asana with the same values.
- Telemetry shows write success rate ≥98% over a working day; failures logged with `formSubmissionLog`.
- No whiteboard write is ever blocked by Asana being slow or down.

### Phase D — System Library lens (visualise what we have)

Add `library` to `VALID_LENSES`. New panel at `src/tabs/roadmap/parts/SystemLibraryPanel.tsx` rendering `HUB_COMMS_TEMPLATE_FAMILIES` from the existing `templatesRegistry.ts`, augmented with three operator affordances:

1. **Owner-path resolver.** For each `owners[]` entry, render as a clickable file link (use the wayfinding `data-helix-region` convention); if the file is missing on disk, show a red dot. Keeps the registry honest.
2. **Duplicate-content detector** (server side, runs on demand). New endpoint `GET /api/dev-console/library/duplicates` (dev-owner) that scans the `owners[]` paths plus a hard-coded list of known signature/firm-detail strings (e.g. `"Britannia House"`, `"0345 314 2044"`) and returns every file containing them. Cards in the Library lens display duplicate count + a "Show duplicates" tray. This is exactly what powers Phase E.
3. **Surface-counts.** Already partially present (`practiceAreaScenarioCount`, `productionBlockCount`); extend with a notification card count fed from the Card Lab catalogue and a CCL field count read from the existing CCL template module. All counts are computed at build time / on import — no extra fetches.

`data-helix-region="system/library"`. Dev-owner only initially; opens to admin after the duplicate-detector is trusted.

**Phase D acceptance:**
- All 7 families render with correct status pills.
- Each owner path is a working file link.
- Duplicate detector returns at least one row for the firm signature address (proves the loop closes).

### Phase E — Signature standardisation (the simplest-possible code change)

Triggered by the Phase D detector showing the duplication. Single concrete refactor:

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Create canonical firm signature module | `src/app/styles/firmSignature.ts` (NEW) | Exports `FIRM_SIGNATURE = { addressLines, phone, email, web }` and a `renderFirmSignatureHtml(opts)` helper. No styling tokens here — that stays in `EmailSignature.tsx`. |
| E2 | Migrate Pitch Builder firm shell | [src/tabs/enquiries/EmailSignature.tsx](../../src/tabs/enquiries/EmailSignature.tsx) | Replace inline strings with `FIRM_SIGNATURE.*`. Visible HTML is unchanged. |
| E3 | Migrate Operations Dashboard print/preview | [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) L9505–L9649 | Replace `firmSignature*` constants with `FIRM_SIGNATURE.*`. |
| E4 | Coordinate with `operationsdashboard-carve-up-by-section` | docs/notes/OPERATIONSDASHBOARD_CARVE_UP_BY_SECTION.md | If the carve-up brief ships first, the migration moves to whichever sub-component owns the print/preview after the carve. Both briefs MUST list each other in `coordinates_with`. |
| E5 | Server side stays untouched | [server/utils/helixEmail.js](../../server/utils/helixEmail.js) | Personal signatures already centralised; firm-shell HTML is only ever rendered client-side. No server change needed. |

**Phase E acceptance:**
- A grep for `'Britannia House'` returns exactly one source-of-truth file (`firmSignature.ts`).
- Visual diff of Pitch preview + OpsDash print preview is zero.
- Phase D duplicate detector now returns zero rows for firm address strings.

### Phase F — System Comms lens (the operator's view of outbound mail)

Add `comms` to `VALID_LENSES`. New panel `src/tabs/roadmap/parts/SystemCommsPanel.tsx`. Three sub-sections, each `data-helix-region="system/comms/<id>"`:

1. **Personal signatures explorer.** Server endpoint `GET /api/dev-console/comms/personal-signatures` (dev-owner) lists the files in `getSignaturesRootDir()` with `{ initials, email, sizeBytes, modifiedAt, previewHtml }`. UI: file list + sanitized preview (re-uses `sanitizeSignatureHtml`). **Edit affordance ships in Phase F.2 only after the user signs off — file writes need a dedicated guard.**
2. **Firm signature preview.** Renders `renderFirmSignatureHtml` from E1. Read-only. Edit means changing `firmSignature.ts` — surface that as "edit in code" with a link to the file.
3. **Recent outbound emails.** Read-only feed of the last N entries from `formSubmissionLog` filtered to send-email steps (`mail.send:success` / `:failed`). Re-uses an existing reader function (or adds a thin selector if none exists). Each row links to the matter / instruction / enquiry context the email belonged to.

**Phase F acceptance:**
- Personal signatures list shows ≥1 entry locally with a working preview.
- Firm signature preview renders identical HTML to the Pitch Builder preview (visual diff zero).
- Last 20 outbound mails visible with success/failure pills.

---

### Phase G — Colleague POV ("Roadmap" mode) with dev preview toggle

**Shipped 2026-05-03:** Phase G is implemented. Read paths on `/api/dev-console/*` and `/api/dev-console/roadmap` now accept LZ + AC via `requireForgeReader`; mutations stay on `requireDevOwner`. Frontend exposes a Dev/Roadmap toggle to LZ (persisted in `localStorage.helix.forge.viewMode`) and AC defaults to Roadmap mode. Roadmap mode renders the Asana mirror first, the whiteboard second with `readOnly` (no quickadd, drag, controls, or notes), and shows a preview banner when LZ is in colleague POV.

**Why.** The Forge today is dev-shaped: stale briefs, deposit hints, generated artifacts, telemetry, and writeable controls. AC (Alex) and other approved colleagues do not need that surface — they need to see *what we are doing this week* and *what the Tech & Automations Asana board says*, with no dev clutter. LZ should be able to **preview** the colleague view from the same page so we can iterate on it without a separate user account.

**Audience model (gate widening, writes stay narrow).**

| Identity | Sees Forge lens? | Default mode | Can toggle? | Can write? |
|----------|------------------|--------------|-------------|------------|
| LZ (`isDevOwner`) | yes | `dev` | yes (`dev` ↔ `roadmap`) | yes — all Phase A/C writes |
| AC (in `isLzOrAc` but not `isDevOwner`) | yes | `roadmap` (forced) | no | no — read-only |
| Other admins | no (unchanged) | — | — | — |
| Everyone else | 403 (unchanged) | — | — | — |

The widening is **read-only and Forge-scoped**. `isDevOwner` keeps its meaning everywhere else. This is the same shape as the existing dev-preview ladder in `.github/copilot-instructions.md` ("Dev Preview" tier).

**G1 — Server: split read vs write gates in `server/routes/dev-roadmap.js`.**

- New helper `requireForgeReader(req, res, next)` allows `isLzOrAc` (existing initials check, plus the LZ email).
- Existing `requireDevOwner` stays for every mutating route (POST/PATCH/DELETE on whiteboard items, Phase C Asana writes).
- Apply `requireForgeReader` to: `GET /api/dev-console/whiteboard`, `GET /api/dev-console/asana/tech-automations` (Phase B), `GET /api/dev-console/comms/recent-outbound` if/when it becomes part of Roadmap mode (deferred — see Open decisions).
- Telemetry: every event in the namespace gains `actor: 'LZ' | 'AC' | …` and `viewMode: 'dev' | 'roadmap'` properties so we can tell the two POVs apart in App Insights.
- Acceptance: `curl -H 'x-user-initials: AC' .../whiteboard` returns `200`; the same call to `POST .../whiteboard/items` returns `403`.

**G2 — Client: `viewMode` prop on `DevConsolePanel.tsx` (no new file).**

```ts
type ForgeViewMode = 'dev' | 'roadmap';
interface DevConsolePanelProps { viewMode: ForgeViewMode; canToggle: boolean; }
```

Resolution at the lens mount point in `useActivityLayout.ts` (or wherever Forge currently mounts):

```ts
const isLZ = isDevOwner(user);
const isAC = !isLZ && isLzOrAc(user);
const stored = (localStorage.getItem('helix.forge.viewMode') as ForgeViewMode | null);
const viewMode: ForgeViewMode = isAC ? 'roadmap' : (stored ?? 'dev');
const canToggle = isLZ;
```

`DevConsolePanel.tsx` becomes a thin orchestrator that conditionally renders sections by `viewMode`:

| Section | dev mode | roadmap mode |
|---------|----------|--------------|
| Header strip + dev toggle pill | shown | toggle hidden; header reads "Roadmap" |
| `RoadmapWhiteboard` (Phase A) | full (drag/drop + edits) | **read-only** (no drag handles, no inline editors, lane-only view) |
| `AsanaProjectMirror` (Phase B) | shown | **shown — promoted to top of the lens** |
| Next deposits / Stale briefs | shown | hidden |
| Recent changes feed | shown | hidden |
| Toolbelt (scripts, generated artifacts) | shown | hidden |
| Telemetry dump | shown | hidden |
| Library lens (Phase D) | shown (when admin) | hidden |
| Comms lens (Phase F) | shown | hidden |
| Phase C write affordances | shown | hidden |

Read-only whiteboard in roadmap mode means: same React tree, but `RoadmapWhiteboard` accepts an existing-or-new `readOnly` prop that disables drag listeners, hides the "+ add" button, hides inline date editors, and falls back to plain row rendering. This is a single boolean flag inside the component, not a fork.

**G3 — Dev toggle UI (LZ only).**

A small pill in the Forge header, next to the existing weekly-cadence label. Two segments: `Dev` / `Roadmap`. Click flips `localStorage.helix.forge.viewMode` and re-renders. Wayfinding region `data-helix-region="system/forge/view-toggle"`. Telemetry `DevConsole.Forge.ViewMode.Switched` `{ from, to }`.

A persistent **"Previewing Roadmap mode"** banner shows in roadmap mode for LZ only ("you are previewing AC's view — click to return to Dev mode"). For AC the banner is suppressed because there is no other mode to return to.

**G4 — Wayfinding regions.**

- `system/forge/view-toggle` — LZ-only toggle pill
- `system/forge/roadmap-banner` — LZ preview banner
- `system/forge/colleague-view` — outermost wrapper when `viewMode === 'roadmap'`

Existing regions (`system/forge/whiteboard`, `system/forge/asana/tech-automations`) keep their ids in both modes.

**Phase G acceptance:**
- LZ at `/forge`: sees toggle, defaults to Dev, can switch to Roadmap, choice persists across reload, sees the preview banner in Roadmap mode.
- AC at `/forge`: sees Roadmap-only view, no toggle, no banner, no dev-only sections, no write controls.
- AC `POST /api/dev-console/whiteboard/items` → `403`. AC `GET /api/dev-console/whiteboard` → `200`.
- App Insights: `DevConsole.Roadmap.*` events show `actor` and `viewMode` properties. `DevConsole.Forge.ViewMode.Switched` fires only for LZ.
- Visual: in Roadmap mode the Asana mirror is the top section and the whiteboard is a calmer secondary rail; no telemetry, deposits, or generated-artifact panels are visible.

---

## 4. Step-by-step execution order

1. **A1–A5** — weekly cadence on the existing whiteboard. Ship. *(SHIPPED 2026-05-03)*
2. **B1** — Asana mirror route; verify with curl.
3. **B2** — Asana mirror panel; ship.
4. **G1–G3** — Colleague POV (`viewMode`) + dev toggle. Ships immediately after B so AC's view has the Asana mirror as its anchor. Read-only widening for AC; LZ unchanged.
5. **D1–D2** — Library lens with the existing registry; ship.
6. **E1–E3** — Firm signature standardisation, driven by the Phase D detector. Ship.
7. **F1–F3** — Comms lens, read-only. Ship.
8. **C1–C3** — Two-way Asana sync. Ships **last** because it is the only phase with cross-system writes; everything before this is recoverable.

Phases 1–7 are cumulative; each is independently revertable. The final two-way Asana write phase is the only one that mutates external state and therefore ships behind a feature flag (`HELIX_FORGE_ASANA_WRITES=1`) for the first week.

---

## 5. Verification checklist

**Phase A (weekly cadence):**
- [ ] `npx tsc --noEmit --pretty false` clean.
- [ ] Existing items render in the correct week lane without a data migration.
- [ ] Daily breakdown toggle persists in `localStorage` only.
- [ ] App Insights shows `DevConsole.Roadmap.*` events with `cadence=weekly`.

**Phase B (read mirror):**
- [ ] `curl -H 'x-user-initials: LZ' http://127.0.0.1:8080/api/dev-console/asana/tech-automations` returns `200`.
- [ ] Anon (`curl http://127.0.0.1:8080/api/dev-console/asana/tech-automations`) returns `403`.
- [ ] Response shape matches `asana-account-tasks` top-level keys.
- [ ] App Insights `DevConsole.Asana.TechAutomations.Fetched` visible with task/section counts.

**Phase C (write sync):**
- [ ] Marking a linked whiteboard item Done updates Asana within one polling cycle.
- [ ] PATCH on linked item edits Asana fields 1:1.
- [ ] `formSubmissionLog` rows for `asana.complete` and `asana.update` populate.
- [ ] Whiteboard write succeeds even if Asana is forced offline (tested by setting `ASANA_ACCESS_TOKEN=invalid` for one request).

**Phase D (library):**
- [ ] All 7 families render.
- [ ] Owner paths are clickable file links.
- [ ] Duplicate detector returns ≥1 row for `'Britannia House'` (pre-Phase E).

**Phase E (signature standardisation):**
- [ ] Single source of truth in `src/app/styles/firmSignature.ts`.
- [ ] Visual diff of Pitch preview + OpsDash print is zero.
- [ ] Phase D detector returns zero rows for firm address strings.

**Phase F (comms lens):**
- [ ] Personal signatures explorer lists local files with sanitized preview.
- [ ] Firm signature preview matches Pitch Builder.
- [ ] Outbound emails feed shows last 20 with success/failure pills.

**Phase G (colleague POV + dev toggle):**
- [ ] LZ default `dev`, toggle persists in `localStorage`, preview banner visible in `roadmap` mode.
- [ ] AC forced to `roadmap`, no toggle, no dev-only sections, no write controls.
- [ ] `requireForgeReader` allows AC on GETs; `requireDevOwner` still blocks AC on every mutation.
- [ ] App Insights events tagged with `actor` + `viewMode`; `DevConsole.Forge.ViewMode.Switched` fires only for LZ.
- [ ] Read-only whiteboard render in `roadmap` mode has no drag handles or inline editors.

---

## 6. Open decisions (defaults proposed)

1. **Where does `ASANA_TECH_AUTOMATIONS_PROJECT_ID` live?** — Default: **env var only**, set in Key Vault for prod and `.env.local` for dev. Rationale: same pattern as `ASANA_BUNDLE_PROJECT_ID` in [server/routes/bundle.js](../../server/routes/bundle.js) L97. User must paste the gid from the board URL on first run.
2. **Whiteboard ↔ Asana linkage source of truth on conflict.** — Default: **Whiteboard wins on user-driven status changes**; Asana wins on read-back during polling. Rationale: the whiteboard is where the operator drives the day; if a colleague closes a ticket in Asana, the next poll will quietly remove it from the active week lanes.
3. **Cadence migration for existing items.** — Default: **infer `weekStart` from existing `scheduledDate`** on first load, no data migration needed. Rationale: parent A2 shipped with zero items, so the migration cost is near-zero today; the inference logic stays in for new items added before this brief lands.
4. **Library lens audience.** — Default: **dev-owner only at first**, opens to `isAdminUser()` once the duplicate detector has run quietly for a week. Rationale: the duplicate scan returns code-paths and could surface secrets if a future owner path is wrong.
5. **Comms personal signature edit.** — Default: **read-only in Phase F1**, edit deferred to a follow-up brief. Rationale: writing files in `SIGNATURES_DIR` is not git-tracked and can drift between the local checkout and the deployed container; needs its own deploy contract.
6. **Asana writes flag.** — Default: **`HELIX_FORGE_ASANA_WRITES=1` gated for the first week**, then remove the flag. Rationale: Phase C is the only one with cross-system mutation; an explicit feature gate is the cheapest reversibility insurance.
7. **Phase G audience gate.** — Default: **`isLzOrAc` (LZ + AC only)** for the first cut, opened to a named allow-list (e.g. `FORGE_ROADMAP_VIEWERS=AC,KW`) once the colleague view has run quietly for a week. Rationale: keeps the surface tight while the Asana mirror stabilises; named allow-list avoids re-using `isAdminUser` for what is really a per-person preview.
8. **Comms feed in Roadmap mode.** — Default: **hidden in Roadmap mode for now**. Rationale: Phase F surfaces send-email logs that may include client PII fragments in subject lines; AC has no operational reason to see those today. Reconsider when the feed is filtered to subject-redacted summaries.

---

## 7. Out of scope

- **A new tasking product.** Hub-wide tasking remains parent brief Phase F5.
- **Migrating Tasking-v3 bot identity.** Tracked separately in [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) L306+.
- **Editing CCL / Pitch / framework prompts from the Library lens.** Library is read + jump-to-source. Authoring stays in code or in the existing Card Lab UI.
- **Changing the email send contract.** `helixEmail.send` already accepts `use_personal_signature` + `signature_initials`; this brief surfaces it, not rewrites it.
- **Wider rollout of the whiteboard.** Parent brief Phase F covers collaboration. This brief stays dev-owner for the whiteboard write path; only the read mirror in Phase B opens to admin.

---

## 8. File index (single source of truth)

Client (modify):
- [src/tabs/roadmap/parts/RoadmapWhiteboard.tsx](../../src/tabs/roadmap/parts/RoadmapWhiteboard.tsx) — Phase A; Phase G adds `readOnly` prop
- [src/tabs/roadmap/parts/DevConsolePanel.tsx](../../src/tabs/roadmap/parts/DevConsolePanel.tsx) — mount new panels; Phase G adds `viewMode` + `canToggle` props and conditional sections
- [src/tabs/roadmap/hooks/useActivityLayout.ts](../../src/tabs/roadmap/hooks/useActivityLayout.ts) — add `library` + `comms` lenses; Phase G resolves `viewMode` from identity + `localStorage`
- [src/app/admin.ts](../../src/app/admin.ts) — Phase G consumer of existing `isDevOwner` / `isLzOrAc` (no change to definitions)
- [src/tabs/enquiries/EmailSignature.tsx](../../src/tabs/enquiries/EmailSignature.tsx) — Phase E2
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) — Phase E3 (only the firm-signature lines L9505–L9649; coordinate with `operationsdashboard-carve-up-by-section`)
- [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts) — read-only consumer

Client (NEW):
- `src/tabs/roadmap/parts/AsanaProjectMirror.tsx` — Phase B2
- `src/tabs/roadmap/parts/SystemLibraryPanel.tsx` — Phase D
- `src/tabs/roadmap/parts/SystemCommsPanel.tsx` — Phase F
- `src/app/styles/firmSignature.ts` — Phase E1

Server (modify):
- [server/routes/dev-roadmap.js](../../server/routes/dev-roadmap.js) — Phase A1, B1, C1, C2; Phase G1 adds `requireForgeReader` and split read/write gates
- [server/utils/asana.js](../../server/utils/asana.js) — export `ASANA_TECH_AUTOMATIONS_PROJECT_ID`

Server (NEW endpoints inside `dev-roadmap.js`):
- `GET /api/dev-console/asana/tech-automations` — Phase B1
- `POST /api/dev-console/asana/tech-automations/:taskGid/complete` — Phase C1
- `PATCH /api/dev-console/asana/tech-automations/:taskGid` — Phase C2
- `GET /api/dev-console/library/duplicates` — Phase D
- `GET /api/dev-console/comms/personal-signatures` — Phase F1
- `GET /api/dev-console/comms/recent-outbound` — Phase F3

Storage:
- [data/roadmap-whiteboard.json](../../data/roadmap-whiteboard.json) — gain `weekStart`, `asanaTaskGid` fields

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [docs/notes/HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md](./HELIX_SOFTWARE_DEV_PRODUCTIVITY_CONTROL_PLANE.md) — link this brief from §coordinates_with on close

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
verified: 2026-05-03
branch: main
touches:
  client:
    - src/tabs/roadmap/parts/RoadmapWhiteboard.tsx
    - src/tabs/roadmap/parts/DevConsolePanel.tsx
    - src/tabs/roadmap/parts/AsanaProjectMirror.tsx
    - src/tabs/roadmap/parts/SystemLibraryPanel.tsx
    - src/tabs/roadmap/parts/SystemCommsPanel.tsx
    - src/tabs/roadmap/hooks/useActivityLayout.ts
    - src/tabs/enquiries/EmailSignature.tsx
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/resources/templatesRegistry.ts
    - src/app/styles/firmSignature.ts
  server:
    - server/routes/dev-roadmap.js
    - server/utils/asana.js
    - server/utils/helixEmail.js
    - server/utils/formSubmissionLog.js
  submodules: []
depends_on:
  - helix-software-dev-productivity-control-plane
coordinates_with:
  - resources-tab-restructure-with-templates-section
  - server-mail-send-helper-extraction
  - ux-realtime-navigation-programme
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - clio-token-refresh-shared-primitive
  - activity-testing-security-and-operational-visibility-control-plane
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-action-extraction
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - docs-transfer-review-ccl-review-fixes
  - home-skeletons-aligned-cascade
  - home-todo-single-pickup-surface
  - quick-actions-rework-empty-state
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - forms-stream-persistence
conflicts_with:
  - operationsdashboard-carve-up-by-section
```

---

## 9. Gotchas appendix

- **Route ordering.** `server/index.js` mounts `/api/dev-console/roadmap` BEFORE `/api/dev-console`. Any new dev-console subroute must be registered ahead of the summary mount or Express greedy-matches and 404s. See parent brief A2 close-out.
- **Dev-owner gate is local, not shared.** `server/routes/dev-roadmap.js` defines its own `isDevOwner` reading `req.user.initials || req.query.initials || x-user-initials || x-user-email`. Reuse this exact gate for B1/C1/C2/D/F endpoints. **Do not** import the client-side `isDevOwner()` from `src/app/admin.ts` — it is browser-only.
- **Asana cache invalidation on writes.** The 120s cache in `opsQueue.js` is per-process. Phase C writes MUST drop `asanaCache.expires = 0` (or its B1-clone equivalent) so the next read reflects the change. Otherwise the operator will see "I marked it done but it's still here" for up to two minutes.
- **`permalink_url` is the only safe link.** Do not synthesise Asana URLs from gid + workspace; Asana sometimes redirects and the constructed URL breaks. Use the `permalink_url` field returned by the API.
- **`HLX-####-#####` matter ref parsing is shared.** The regex `^([A-Z]+-\d+-\d+)` lives in `opsQueue.js` L632. Extract to a shared helper in `server/utils/asana.js` during B1 so the Tech & Automations route uses the same parser. Otherwise drift will appear the first time someone tweaks the Accounts version.
- **Personal signatures dir order matters.** `getSignaturesRootDir()` candidate order is `SIGNATURES_DIR → assets → src/assets → cwd/assets → cwd/src/assets`. The first existing dir wins. If multiple exist, the env var takes precedence — useful for staging where signatures are mounted from a Key Vault-backed share.
- **`OperationsDashboard.tsx` is being carved up in a parallel brief.** Phase E3's location is owned by whichever brief lands first. If `operationsdashboard-carve-up-by-section` ships before this one, the firm-signature lines move to whichever sub-component owns the print/preview after the carve — re-check L9505–L9649 against the post-carve layout before doing E3.
- **The Asana access token can be either env-level or per-user.** `resolveAsanaAccessToken` prefers env. In dev with `ASANA_ACCESS_TOKEN=` unset, it falls back to OAuth refresh against the team table — which means the dev's own Asana account is what reads/writes the Tech & Automations board. That is correct behaviour, but the first time a dev runs locally, they need a valid Asana refresh token in their team row or a `ASANA_ACCESS_TOKEN` in `.env.local`.
- **`use_personal_signature` is server-side only.** Do not add a client-side path that pre-renders the personal signature into the body before sending; the server has all the sanitisation logic and any client-side render will diverge in subtle ways (`mailto:` rewrite, `noopener` injection, etc.). Phase F surfaces the rendered HTML; it does not change where rendering happens.
- **Tasking-v3 bot identity collision is a different problem.** If a future agent tries to "consolidate the tasking systems" by pointing the Tasking-v3 bot at the Forge whiteboard or Asana, they will hit the AAD app id collision documented at [.github/instructions/ROADMAP.md](../../.github/instructions/ROADMAP.md) L317. That is parent brief F5, not this brief.
