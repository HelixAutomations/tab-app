# Demo Console — unify demo mode, rehearsal record, and walkthrough into one premium surface

> **Purpose of this document.** Self-contained brief. Any future agent (or the user on a different day) can pick this up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Implement Phase D1 first; D2–D5 follow only after D1 ships and is rehearsed. D6 (cleanup) only after D1–D5 are settled and have carried at least one real demo. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-06 against branch `main`. **Re-verified 2026-05-06 15:31 UTC** after the cheat-sheet author finalised the rewrite of Steps 1–6 and promoted `main-use` to a live "Start Here" orientation step. All 19 live steps now carry settled prose; no in-flux markers remain. Re-verify file/line refs before executing if reading >30 days later.

---

## 1. Why this exists (user intent)

User direction (verbatim, condensed):

> "what if we considered, demo mode, the demo record and the demo notes all under one roof? and then scoped an implementation that takes what we have and builds a better alternative given what we have. thats the key, standing this up from nothing was hard, but im literally giving you an already good piece of work and saying to you, now scope the next leg, and so if you understood me right youd understand im going for something truly quality and prod ready, with new features and ideas. and look and feel refined."

Today the platform has **three separate demo artefacts**, each with its own trigger, mental model, and persistence layer. They are three views of one mode of operation (the operator is presenting / rehearsing). A premium product would call this **the Demo Console** and present it as one surface.

What this brief delivers:

1. A single docked panel — the **Demo Console** — with four tabs (Status, Walkthrough, Record, Telemetry).
2. One canonical trigger (decided in §6) that opens the Console; the existing Ctrl+Shift+D and CommandDeck chips re-route to the same surface.
3. A **pre-flight checklist** so the operator can see at a glance whether the local stack is demo-safe (dry-run flag on, ND folders configured, dev server healthy, rehearsal record reseeded recently).
4. A **live telemetry tail** of `Demo.*` App Insights events so dry-run / route-switch behaviour is visible while presenting, not after.
5. A **rehearsal record health probe** that runs the same checks `tools/instant-lookup.mjs pipeline` does (Clio matter present, EID present, risk present, CCL drafts present), exposed as JSON via a new dev-only endpoint.
6. A consolidated `helix.demo.console.*` localStorage namespace via a tiny `useDemoConsole()` hook so future surfaces don't reinvent their own.
7. Strict adherence to the design tokens in `src/app/styles/colours.ts` + `design-tokens.css` (websiteBlue/darkBlue/helixBlue depth ladder, accent #3690CE for anchor points, neutral greys for body, borderRadius 0).

What this brief does **not** do:

- Does NOT remove the synthetic `Demo · ` labelled mocks elsewhere in the app (OperationsQueue tiles, time-metrics chip, leave widget). The Console *describes* them; it does not replace them.
- Does NOT alter the matter-opening Demo Mode auto-skip flow (`DEMO-3311402`, `DemoModeStripe`, `demoEidOverride`, etc.) — out of scope (separate brief).
- Does NOT touch `submodules/instruct-pitch` or `submodules/enquiry-processing-v2` (read-only per house rules).

---

## 2. Current state — verified findings

### 2.1 Trigger surfaces (three, today)

| Trigger | File | What it opens |
|---|---|---|
| UserBubble "Demo mode" switch | [src/app/App.tsx](../../src/app/App.tsx) `handleToggleDemoMode` | Sets `localStorage.demoModeEnabled`, fires `trackClientEvent('Demo','Mode.Enabled'/'Mode.Disabled')`. No panel. |
| Ctrl+Shift+D | [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) | Full-screen overlay reading `data/demo-cheat-sheet-overrides.json`. Single scrollable column. |
| CommandDeck "Reset demo" + "About" chips | [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) `handleResetDemo` (~L504) and About chip (~L756) | Reset triggers `POST /api/dev/reseed-rehearsal`; About opens `/api/dev/demo-reference` in new tab. |

### 2.2 State + persistence (fragmented, today)

- `localStorage.demoModeEnabled` — Demo Mode toggle.
- `localStorage.cclDraftCache.*`, `localStorage.helix.demo.*`, matching `sessionStorage` — cleared by Reset Demo chip.
- `data/demo-cheat-sheet-overrides.json` — walkthrough copy for Ctrl+Shift+D overlay. **Live shape (verified 2026-05-06 15:31 UTC):** top-level presenter key (`LZ` today; structure is multi-presenter ready) → `schema: 1` → `sections: { [stepKey]: { title?, notes: string[], approachLZWhen?: string[], crossApp?: string[] } }` → `updatedAt`. 22 sections total: 2 legacy/superseded + 19 live steps + the `dev-only` wrap. See §2.6 for the per-step inventory. All step prose is now settled — the renderer treats the JSON as the source of truth.
- SQL: `Instructions.dbo.Instructions` rows `HLX-27367-94842` + `HLX-27367-11112011` are the rehearsal record. Reseeded by `scripts/seed-rehearsal-record-sql.mjs --confirm`.

### 2.3 Server endpoints already wired (reused by D1–D5)

- `GET /api/dev/health` — bootId, uptime, pid, lazyInit, nodeEnv. Read by `useDevServerBoot`.
- `GET /api/dev/demo-reference` — streams `.github/instructions/DEMO_MODE_REFERENCE.md` as markdown (no GitHub auth needed).
- `POST /api/dev/reseed-rehearsal` — runs the seed script, busts caches, broadcasts SSE invalidate. Returns stdoutTail/stderrTail/exitCode/cacheInvalidated.
- `POST /api/dev/invalidate-enquiries` — bust-only. Returns `{ deletedData, deletedEnquiries }`.

All three live in [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js); router mounted at `/api/dev` only when `NODE_ENV !== 'production'`.

### 2.4 Telemetry already emitted (just not surfaced)

Server-side: `Demo.Clio.WriteSkipped`, `Demo.ND.RouteSwitched` — wired in [server/utils/rehearsalGuard.js](../../server/utils/rehearsalGuard.js) consumers and [server/routes/ccl-ops.js](../../server/routes/ccl-ops.js).

Client-side: `trackClientEvent('Demo', 'Mode.Enabled' | 'Mode.Disabled' | 'Reset.Triggered' | 'Reference.Opened', ...)` via [src/utils/telemetry.ts](../../src/utils/telemetry.ts).

All rehearsal-ref telemetry carries `customDimensions.seed == 'rehearsal'` (Phase A8 middleware in [server/utils/appInsights.js](../../server/utils/appInsights.js)).

### 2.5 Style guide reference implementation

UserBubble is the canonical Helix look-and-feel anchor: [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx). The Console must mirror its surface depth ladder, row hover behaviour, toast feedback, and 0px borderRadius rules. See `docs/COMPONENT_STYLE_GUIDE.md` §1b–§1c and the "Brand Colour Palette" section of `.github/copilot-instructions.md`.

### 2.6 Cheat-sheet sections inventory (verified 2026-05-06 15:31 UTC)

The walkthrough JSON contains both **live demo steps** and **legacy sections** explicitly marked as "folded into" newer steps. The renderer must distinguish them.

**Legacy / superseded sections** (do not show as walkthrough steps; surface only as optional "Legacy notes" affordance, or skip entirely):

| Key | Status | Reason (from notes) |
|-----|--------|----------------------|
| `prospects` | superseded | "now covered by Step 3, Prospects: claim, triage, pitch routes" |
| `notification` | superseded | "now mostly folded into Step 1" |

**Live steps** (canonical demo order — the JSON itself is unordered, so the renderer maintains its own sequence in `cheatSheetStepOrder.ts`):

| # | Step key | Has title? | Has approachLZWhen? | Has crossApp? |
|---|----------|------------|---------------------|---------------|
| 0 | `main-use` | Yes ("Start Here") | Yes | Yes |
| 1 | `home-todo` | — (humanise key) | — | — |
| 2 | `prospects-claim` | — | — | Yes |
| 3 | `pitch-builder` | — | — | Yes |
| 4 | `post-instruct-overview` | Yes ("After instruction: Overview + step strip") | — | — |
| 5 | `workbench-id` | — | — | — |
| 6 | `workbench-risk` | — | — | — |
| 7 | `workbench-matter` | — | — | — |
| 8 | `workbench-ccl-generate` | — | — | — |
| 9 | `workbench-ccl-pressure-test` | — | — | — |
| 10 | `workbench-ccl-review` | — | — | — |
| 11 | `workbench-doc-transfer` | — | — | — |
| 12 | `matter-handoff` | — | — | — |
| 13 | `matter-card` | — | — | — |
| 14 | `forms-feedback` | — | — | — |
| 15 | `reports` | — | — | — |
| 16 | `attendance-notes` | — | — | — |
| 17 | `ac-uploads` | — | — | — |
| 18 | `rollout-framework` | — | — | — |
| 19 | `dev-only` | — | — | — |

Notes:
- `main-use` was previously documented as legacy. As of 2026-05-06 15:31 UTC it carries `title: "Start Here"` and is the orientation step that opens the walkthrough.
- `workbench-doc-transfer` is in the sequence but the author currently flags it as not-for-use during live demos. Render it normally; the operator decides whether to skip via the dot-strip.
- `dev-only` (Step 19) is the wrap-up; gate its visibility behind the existing dev-preview check (`['LZ','AC'].includes(initials)`) so a non-dev presenter doesn't accidentally land on it.

**Convention markers inside `notes[]`** that the renderer should recognise:

- A line beginning `What to say:` is the presenter cue — one per step, by convention. Render it as a distinct presenter-cue affordance (separate visual treatment from the supporting bullets).
- A line beginning `Boundary:` flags a known caveat / limit-of-claim — render with the `orange` accent (warning, not error) so the operator does not overstate the feature live.
- A line beginning `Honest framing:` or `Honest state:` is a deliberate honesty marker — same treatment as `Boundary:`.
- A line beginning `Rough edge:` is a known gap surfaced for transparency — same treatment.
- All other lines are supporting notes.

These are conventions the author has adopted across the file; the renderer uses prefix detection, not a separate field, so the JSON shape stays stable while the formatting compounds.

---

## 3. Plan

### Phase D1 — Console shell + Status tab (read-only)

A new `<DemoConsole/>` component, gated behind `isLzOrAc` (matches current dev-preview pattern; widen later). One trigger opens it (decided in §6).

| # | Change | File |
|---|--------|------|
| D1.1 | New component `<DemoConsole/>` with left-rail tab switcher (Status / Walkthrough / Record / Telemetry). Empty body for tabs except Status. | NEW [src/components/demoConsole/DemoConsole.tsx](../../src/components/demoConsole/DemoConsole.tsx) |
| D1.2 | New `useDemoConsole()` hook — owns open/closed state, active tab, last-seen telemetry counter. Persists to `helix.demo.console.*` localStorage. | NEW [src/components/demoConsole/useDemoConsole.ts](../../src/components/demoConsole/useDemoConsole.ts) |
| D1.3 | Status tab content: live readouts of (a) Demo Mode on/off; (b) `CLIO_DRY_RUN_FOR_REHEARSAL_REFS` value via new `GET /api/dev/demo-status`; (c) ND folder split health (REHEARSAL/PROD env vars present); (d) dev server bootId + uptime; (e) rehearsal record SQL freshness (timestamp from `Instructions.UpdatedAt` for `HLX-27367-94842`). One green/orange/cta pill: **"Demo-safe to present"**. | NEW [src/components/demoConsole/StatusTab.tsx](../../src/components/demoConsole/StatusTab.tsx) |
| D1.4 | New endpoint `GET /api/dev/demo-status` — returns env flag bools (no values, just truthy/falsy), folder ids redacted to last 4 chars, uptime. **Never returns secret values.** | [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| D1.5 | Open trigger wired to canonical entry point (§6 decision). Old Ctrl+Shift+D handler in `DemoCheatSheetOverlay.tsx` short-circuits to Console-open + sets activeTab='walkthrough'. CommandDeck About chip → Console-open + activeTab='status'. CommandDeck Reset chip stays put for now (collapses in D6). | [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx), [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) |
| D1.6 | Mount `<DemoConsole/>` once at app root next to `<UserBubble/>`. | [src/app/App.tsx](../../src/app/App.tsx) |
| D1.7 | `logs/changelog.md` entry. | n/a |

**Phase D1 acceptance:**
- LZ or AC opens Console → sees Status tab with all five readouts populated.
- "Demo-safe to present" pill is green only when: dry-run flag truthy, both ND folder env vars present, server uptime > 30s, rehearsal record `UpdatedAt` within 24h.
- Non-LZ/AC users see nothing (no chip change, no Console mount).
- Closing + reopening preserves active tab.
- No secret values transit `/api/dev/demo-status`.

### Phase D2 — Record tab + rehearsal record health probe

| # | Change | File |
|---|--------|------|
| D2.1 | New endpoint `GET /api/dev/rehearsal-status` — wraps the same SQL queries `tools/instant-lookup.mjs pipeline HLX-27367-94842` runs. Returns JSON `{ enquiry, instruction, idVerification, risk, deal, clioMatter:{present,displayNumber}, cclDrafts:{count,latest} }`. Dev-only mount. | [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| D2.2 | Record tab UI: identity card (Helix Demo, both refs, address, VAT). Two columns of health rows — natural-person variant (`HLX-27367-94842`) and company variant (`HLX-27367-11112011`). Each row shows green dot or orange dot. | NEW [src/components/demoConsole/RecordTab.tsx](../../src/components/demoConsole/RecordTab.tsx) |
| D2.3 | Action buttons (helix-btn-primary): **Reseed**, **Invalidate caches**, **Open in workbench** (deep-links to instruction tab + ref), **Open company variant**. Reseed + Invalidate hit existing endpoints. Each button emits `trackClientEvent('Demo', 'Console.Action', { action })`. | same |
| D2.4 | Reset history persistence — append `{ timestamp, outcome, deletedData, deletedEnquiries }` to `data/demo-console-history.json`. Show last 5 in a small history strip. | NEW `data/demo-console-history.json`, [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| D2.5 | Changelog. | n/a |

**Phase D2 acceptance:**
- Record tab renders both rehearsal variants with one row per surface (Clio / EID / Risk / Deal / CCL drafts).
- Reseed button completes in <10s; history strip updates immediately on success.
- Invalidate caches button shows count of deleted Redis keys in toast.
- Open in workbench navigates to the inline workbench with the ref pre-loaded.
- `data/demo-console-history.json` truncates to last 50 entries to avoid unbounded growth.

### Phase D3 — Walkthrough tab (Ctrl+Shift+D collapses in)

| # | Change | File |
|---|--------|------|
| D3.1 | Extract the JSON loader from `DemoCheatSheetOverlay.tsx` into a shared hook `useCheatSheetSteps({ presenter? })`. **Hook contract (per §2.6):** accepts a presenter key (defaults to `'LZ'`), reads `data.<presenter>.sections`, applies the canonical step sequence (configured in a sibling `cheatSheetStepOrder.ts`), filters `superseded` keys (`prospects`, `notification`) out of the main rail, falls back `title` to a humanised step key, and classifies each note line by prefix (`What to say:` → cue, `Boundary:` / `Honest framing:` / `Honest state:` / `Rough edge:` → caveat, else → supporting). | NEW [src/components/demoConsole/useCheatSheetSteps.ts](../../src/components/demoConsole/useCheatSheetSteps.ts), NEW [src/components/demoConsole/cheatSheetStepOrder.ts](../../src/components/demoConsole/cheatSheetStepOrder.ts), [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) |
| D3.2 | Each step rendered as a card (mirrors `wb-tab-stack` cascade pattern from InlineWorkbench). Card layout: `title` (or fallback) as 11px uppercase section accent; presenter cue (`What to say:` line) as a distinct lead block in `accent` (#3690CE); supporting `notes` as a 13px `bodyText` list; caveats (`Boundary:` / `Honest:` / `Rough edge:`) as `orange`-accented chips beneath; optional `approachLZWhen` rendered as a small "Ask Luke when…" panel; optional `crossApp` rendered as cross-app reference chips. Progress dots along the top. Active step underlined with `accent`. | NEW [src/components/demoConsole/WalkthroughTab.tsx](../../src/components/demoConsole/WalkthroughTab.tsx) |
| D3.3 | "Jump there" button per step — uses existing tab routing to deep-link target tab + entity. **Step→target registry** (extend per step, ship gradually): `main-use` → Home (top-of-app overview); `home-todo` → Home; `prospects-claim` → Prospects (filter Unclaimed); `pitch-builder` → Prospects → Pitch Builder for `HLX-27367-94842`; `post-instruct-overview` → Prospects → Overview for `HLX-27367-94842`; `workbench-id`/`-risk`/`-matter` → Inline Workbench tab; `workbench-ccl-generate`/`-pressure-test`/`-review` → Home review rail (dispatch `openHomeCclReview`); `matter-handoff` → Matter detail Overview for the rehearsal Clio matter; `matter-card` → Matters list; `forms-feedback` → Forms launcher; `reports` → Reports landing; `attendance-notes` → Home Call Centre; `ac-uploads` → Enquiries timeline (Request Documents action); `rollout-framework` → System changelog modal; `dev-only` → System / Activity. Steps without a target render the button disabled with tooltip "No deep-link target configured". | same |
| D3.4 | Position persists to `helix.demo.console.walkthroughStep` so reload + navigation away doesn't lose place. Persist `presenter` too (default `'LZ'`). | useDemoConsole hook |
| D3.5 | Old `DemoCheatSheetOverlay.tsx` Ctrl+Shift+D handler short-circuits to Console-open + activeTab='walkthrough'. **Old overlay UI stays in tree for one release** — remove in D6. All 19 live steps render straight from the JSON; no in-flux pill needed since the cheat-sheet author finalised the rewrite on 2026-05-06 15:31 UTC. The renderer remains data-driven so future copy edits land without code changes. | [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) |
| D3.6 | Changelog. | n/a |

**Phase D3 acceptance:**
- Ctrl+Shift+D opens Console at Walkthrough tab.
- All 19 live steps from `demo-cheat-sheet-overrides.json` render as cards (legacy `prospects` / `notification` keys are filtered out by `useCheatSheetSteps`).
- `main-use` ("Start Here") opens as the first card.
- `What to say:` lines render as a distinct presenter cue, not buried in the bullet list.
- `Boundary:` / `Honest framing:` / `Rough edge:` lines render with the `orange` caveat treatment.
- Optional `approachLZWhen` / `crossApp` blocks only render when present in the JSON (no empty panels).
- Jump-there navigates correctly for Steps `home-todo` → Home, `workbench-matter` → Inline Workbench, and `matter-card` → Matters list at minimum.
- Position survives reload, including the active presenter key.
- Old full-screen overlay no longer rendered.

### Phase D4 — Telemetry tab (live `Demo.*` event tail)

| # | Change | File |
|---|--------|------|
| D4.1 | New SSE channel `GET /api/dev/demo-telemetry/stream` — server-side ring buffer of last 50 `Demo.*` events. Hook into existing App Insights `trackEvent` wrapper to ALSO push to ring buffer when `name.startsWith('Demo.')`. | [server/utils/appInsights.js](../../server/utils/appInsights.js), [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| D4.2 | Client-side: also forward client `trackClientEvent('Demo', ...)` to the same ring buffer via `POST /api/dev/demo-telemetry`. | [src/utils/telemetry.ts](../../src/utils/telemetry.ts), [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) |
| D4.3 | Telemetry tab UI: rolling tail of last 10 events. Each row: timestamp (HH:mm:ss), event name pill, key dimension (ref or action). Auto-scroll, manual scroll-lock when user scrolls up. Empty state: "No demo events in the last 60s". | NEW [src/components/demoConsole/TelemetryTab.tsx](../../src/components/demoConsole/TelemetryTab.tsx) |
| D4.4 | EventSource subscription must follow the `disposeOnHmr` + `onServerBounced` pattern from [src/utils/devHmr.ts](../../src/utils/devHmr.ts). | same |
| D4.5 | Changelog. | n/a |

**Phase D4 acceptance:**
- Toggling Demo Mode while Console is open + Telemetry tab active → event appears in tail within 1s.
- HMR / nodemon restart → tail reconnects automatically (no manual refresh).
- Tail caps at 10 visible rows; older events fade out.

### Phase D5 — Pre-flight checklist polish + reset history surfacing

| # | Change | File |
|---|--------|------|
| D5.1 | Status tab gains a checklist component. Each item has a green/orange dot + 1-line explanation + (when red) a "Fix" affordance. | [src/components/demoConsole/StatusTab.tsx](../../src/components/demoConsole/StatusTab.tsx) |
| D5.2 | Pre-flight items: dry-run flag, ND folders, dev server healthy, rehearsal record reseeded <24h, Demo Mode state matches operator intent (warning only — not green/red). | same |
| D5.3 | Reset history strip on Record tab gains hover-tooltips with full payload (deletedData, deletedEnquiries, exitCode). | [src/components/demoConsole/RecordTab.tsx](../../src/components/demoConsole/RecordTab.tsx) |
| D5.4 | Changelog. | n/a |

**Phase D5 acceptance:**
- All pre-flight items reflect live values.
- Single "Demo-safe to present" pill aggregates them — only green when all checks pass.
- Hover on a history entry shows full payload.

### Phase D6 — Cleanup pass (only after D1–D5 carry one real demo)

| # | Change | File |
|---|--------|------|
| D6.1 | Delete `DemoCheatSheetOverlay.tsx`'s old overlay UI; keep only the Ctrl+Shift+D shortcut binding which now opens Console. | [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) |
| D6.2 | Collapse CommandDeck "Reset demo" + "About demo mode" chips into one **Console** chip. | [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) |
| D6.3 | Remove now-unused legacy localStorage keys (one-off migration in `useDemoConsole` first-run effect). | [src/components/demoConsole/useDemoConsole.ts](../../src/components/demoConsole/useDemoConsole.ts) |
| D6.4 | Changelog + close brief. | `logs/changelog.md`, `docs/notes/INDEX.md` |

**Phase D6 acceptance:**
- Single CommandDeck chip "Console" (LZ/AC, only when applicable).
- Ctrl+Shift+D, the chip, and the UserBubble Demo toggle (long-press if §6 picks that) all converge on the Console.
- No orphaned `helix.demo.*` localStorage keys after first run.

---

## 4. Step-by-step execution order

1. **D1.1 → D1.7** — ship shell + Status tab + new `/api/dev/demo-status` endpoint.
2. **D2.1 → D2.5** — Record tab + rehearsal-status endpoint + history persistence.
3. **D3.1 → D3.6** — Walkthrough tab port. Coordinate with `hub-rollout-and-training-framework-operator-first-cheat-sheet-rewrite` (also touching `DemoCheatSheetOverlay.tsx`).
4. **D4.1 → D4.5** — Telemetry tab + SSE channel. Higher-risk because it touches `server/utils/appInsights.js`.
5. **D5.1 → D5.4** — checklist + history polish.
6. **D6.1 → D6.4** — cleanup. Only when D1–D5 have carried at least one real demo without regressions.

---

## 5. Verification checklist

**Phase D1:**
- [ ] LZ + AC see the Console; KW/JW/EA/LA/others see nothing.
- [ ] Status tab pill turns green only when all five conditions met.
- [ ] No secret values returned by `/api/dev/demo-status`.
- [ ] App Insights event `Demo.Console.Opened` fires on first open per session.

**Phase D2:**
- [ ] Reseed → cache invalidate → SSE invalidate → UI refetch within ~400ms (matches existing Reset Demo chip behaviour).
- [ ] Record tab health rows reflect actual SQL state (verify with `node tools/instant-lookup.mjs pipeline HLX-27367-94842`).
- [ ] `data/demo-console-history.json` capped at 50 entries.

**Phase D3:**
- [ ] All 19 live steps render; 2 legacy keys (`prospects`, `notification`) filtered.
- [ ] `main-use` is the first card and renders its `approachLZWhen` and `crossApp` blocks.
- [ ] `What to say:` cue rendered distinctly (separate visual block, not a bullet).
- [ ] `Boundary:` / `Honest framing:` / `Rough edge:` lines render with orange caveat treatment.
- [ ] Jump-there deep-links work for the three sample steps (home-todo, workbench-matter, matter-card).
- [ ] Renderer pulls fresh copy from JSON without code change when the author edits prose.
- [ ] Reduced-motion mode disables the cascade.

**Phase D4:**
- [ ] Server-side ring buffer never exceeds 50 events.
- [ ] HMR + nodemon restart → reconnects.
- [ ] Backpressure handled: client throttles render at 5 events/s max.

**Phase D5:**
- [ ] Pre-flight pill is the SINGLE source of truth.

**Phase D6:**
- [ ] Old `DemoCheatSheetOverlay` overlay removed.
- [ ] CommandDeck strip shows one demo chip, not two.

---

## 6. Open decisions (defaults proposed)

1. **Name.** Default: **"Demo Console"**. Alternatives: "Rehearsal Console" (narrower), "Stage" (cute but less self-explanatory).
2. **Canonical trigger.** Default: **Ctrl+Shift+D + CommandDeck "Console" chip + UserBubble long-press (>300ms)** — all open the same surface.
3. **Visibility tier.** Default: **`isLzOrAc` for D1–D5; promote to `isAdminUser()` after D6 ships and one real cross-admin demo lands**.
4. **Telemetry tab — server-side or client-side ring buffer?** Default: **server-side ring buffer**, broadcast via SSE. Captures both server- and client-emitted `Demo.*` events.
5. **Docked or modal?** Default: **side-docked (right-edge), 400px wide**.
6. **Auto-open on demo on?** Default: **NO**. Operator must opt in.
7. **Presenter-key handling (NEW 2026-05-06).** Default: **single presenter (`LZ`) today; hook signature is parameterised so future presenters get their own top-level key with no schema change**. Rationale: the JSON is already presenter-scoped (`{ "LZ": { schema, sections, updatedAt } }`). When KW/AC/etc start contributing, add a per-user-initials key alongside `LZ`. The Console picks the presenter via `useDemoConsole().presenter`, defaulting to the current user's initials when a section block exists for them, falling back to `'LZ'` otherwise.
8. **Cross-app chip behaviour (NEW 2026-05-06).** Default: **render `crossApp` lines as small cross-app reference chips, non-interactive in D3**. Rationale: many steps already enumerate `instruct-pitch` / `enquiry-processing-v2` / Clio / NetDocuments / ActiveCampaign / Asana / Dubber surfaces; a future phase can wire these to the Resources Hub Phase G entity-pin lookup so a chip becomes a one-click open. That is **explicitly out of scope for D3** and lives in a follow-up brief slot. See `coordinates_with: resources-hub-forms-pattern-rebuild`.

---

## 7. Out of scope

- Removing `Demo · ` labelled mocks elsewhere (OperationsQueue, time-metrics, leave widget).
- Matter-opening Demo Mode auto-skip flow (`DEMO-3311402`, `DemoModeStripe`, `demoEidOverride`, `IdentityConfirmationCard` inline picker).
- Submodule changes (`instruct-pitch`, `enquiry-processing-v2`).
- Production deploy of `/api/dev/*` endpoints.
- Migration of `data/demo-cheat-sheet-overrides.json` schema. D3 reads as-is so the other agent's in-progress walkthrough work isn't disrupted.
- **Editing the cheat-sheet copy itself.** The other agent (and the user) own the source-of-truth notes. D3 is a renderer; it must not rewrite or normalise the prose, only structure it visually.
- Wiring `crossApp` chips to live entity pins. That depends on `resources-hub-forms-pattern-rebuild` Phase G shipping first; left for a follow-up.

---

## 8. File index (single source of truth)

**Client:**
- NEW [src/components/demoConsole/DemoConsole.tsx](../../src/components/demoConsole/DemoConsole.tsx) — shell + tab switcher
- NEW [src/components/demoConsole/useDemoConsole.ts](../../src/components/demoConsole/useDemoConsole.ts) — open/closed + active tab + persistence
- NEW [src/components/demoConsole/StatusTab.tsx](../../src/components/demoConsole/StatusTab.tsx)
- NEW [src/components/demoConsole/RecordTab.tsx](../../src/components/demoConsole/RecordTab.tsx)
- NEW [src/components/demoConsole/WalkthroughTab.tsx](../../src/components/demoConsole/WalkthroughTab.tsx)
- NEW [src/components/demoConsole/TelemetryTab.tsx](../../src/components/demoConsole/TelemetryTab.tsx)
- NEW [src/components/demoConsole/useCheatSheetSteps.ts](../../src/components/demoConsole/useCheatSheetSteps.ts)
- NEW [src/components/demoConsole/cheatSheetStepOrder.ts](../../src/components/demoConsole/cheatSheetStepOrder.ts) — canonical 1–20 step order + legacy/superseded key filter; includes per-step jump-there target registry (D3.3)
- [src/app/App.tsx](../../src/app/App.tsx) — mount Console once at root
- [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) — chip routing (D1.5, D6.2)
- [src/components/DemoCheatSheetOverlay.tsx](../../src/components/DemoCheatSheetOverlay.tsx) — Ctrl+Shift+D shortcut routes to Console (D1.5, D6.1)
- [src/utils/telemetry.ts](../../src/utils/telemetry.ts) — D4 client-side telemetry forwarding
- [src/utils/devHmr.ts](../../src/utils/devHmr.ts) — `disposeOnHmr` + `onServerBounced` for D4 SSE

**Server:**
- [server/routes/dev-rehearsal.js](../../server/routes/dev-rehearsal.js) — three new endpoints: `/demo-status` (D1.4), `/rehearsal-status` (D2.1), `/demo-telemetry/stream` (D4.1)
- [server/utils/appInsights.js](../../server/utils/appInsights.js) — ring-buffer hook for `Demo.*` events (D4.1)
- [server/utils/rehearsalGuard.js](../../server/utils/rehearsalGuard.js) — already classifies refs; reused by `/rehearsal-status`

**Scripts / docs:**
- NEW `data/demo-console-history.json` — last 50 reset/invalidate operations
- [.github/instructions/DEMO_MODE_REFERENCE.md](../../.github/instructions/DEMO_MODE_REFERENCE.md) — update once D1 lands; full rewrite once D6 lands
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — add Console to canonical surfaces list
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: demo-console-unify-demo-mode-rehearsal-record-and-walkthrough-into-one-premium-surface
verified: 2026-05-06
branch: main
touches:
  client:
    - src/components/demoConsole/DemoConsole.tsx
    - src/components/demoConsole/useDemoConsole.ts
    - src/components/demoConsole/StatusTab.tsx
    - src/components/demoConsole/RecordTab.tsx
    - src/components/demoConsole/WalkthroughTab.tsx
    - src/components/demoConsole/TelemetryTab.tsx
    - src/components/demoConsole/useCheatSheetSteps.ts
    - src/components/HubToolsChip.tsx
    - src/components/DemoCheatSheetOverlay.tsx
    - src/app/App.tsx
    - src/utils/telemetry.ts
    - src/utils/devHmr.ts
  server:
    - server/routes/dev-rehearsal.js
    - server/utils/appInsights.js
    - server/utils/rehearsalGuard.js
  submodules: []
depends_on: []
coordinates_with:
  - helix-rehearsal-record-luke-test-as-firm-seed
  - hub-rollout-and-training-framework-operator-first-cheat-sheet-rewrite
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - chat-tab-removal-retain-infra
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-single-pickup-surface
  - resources-hub-forms-pattern-rebuild
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - session-probing-activity-tab-visibility-and-persistence
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - user-switch-clean-hard-reload-with-persistent-return-overlay
  - ux-realtime-navigation-programme
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Existing Reset Demo chip works — don't break it.** The chip in [src/components/HubToolsChip.tsx](../../src/components/HubToolsChip.tsx) ~L504 calls `POST /api/dev/reseed-rehearsal` and toasts on success. The Console "Reseed" button reuses the SAME endpoint; the chip stays put through D1–D5.
- **Cache invalidation is already wired end-to-end.** `POST /api/dev/reseed-rehearsal` and `POST /api/dev/invalidate-enquiries` both call `invalidateUnifiedEnquiriesCache(reason)` exported from [server/routes/enquiries-unified.js](../../server/routes/enquiries-unified.js). The client SSE listener in [src/index.tsx](../../src/index.tsx) ~L1352 has an `invalidate` branch that purges client caches. Don't reinvent this.
- **Production guard.** `dev-rehearsal.js` mount is gated `NODE_ENV !== 'production'` in [server/index.js](../../server/index.js) ~L867. Every new endpoint must `return res.status(403)` if `process.env.NODE_ENV === 'production'` — defence in depth.
- **No env value leaks.** `GET /api/dev/demo-status` MUST return only booleans + last-four-chars, never raw values.
- **`DemoCheatSheetOverlay.tsx` is shared with another agent's brief** (`hub-rollout-and-training-framework-operator-first-cheat-sheet-rewrite`). Coordinate on the JSON loader extraction (D3.1). Format of `data/demo-cheat-sheet-overrides.json` must stay stable.
- **`HubToolsChip.tsx` is also shared** with `userbubble-and-private-hub-tools-control-consolidation-and-sort`. The chip-collapse in D6.2 should be sequenced AFTER that brief lands, or merged into it.
- **The rehearsal-record brief is 🟢 SHIPPED** (`helix-rehearsal-record-luke-test-as-firm-seed`). All Phase A/B/C work it shipped is the foundation of D2 — re-use, don't re-implement.
- **`tools/instant-lookup.mjs pipeline` is the spec for `/api/dev/rehearsal-status`.** Replicate its SQL.
- **Style guide trap.** Do NOT use `colours.dark.subText` (#3690CE) for body text on dark surfaces — that's blue-on-blue. Use neutral greys per `.github/copilot-instructions.md` "Text hierarchy inside panels".
- **Reduced-motion guard mandatory** for D3.2 cascade. Existing `wb-tab-substack` CSS already has the guard — copy that pattern.
- **History file growth.** `data/demo-console-history.json` truncates to last 50: read → unshift → slice(0, 50) → write. The `data/` folder is gitignored; do not commit.
- **Source-of-truth ownership.** The cheat-sheet author owns the JSON prose. D3 is a renderer; it must not rewrite or normalise the prose, only structure it visually. As of 2026-05-06 15:31 UTC the rewrite is finalised — future edits land in the JSON and surface automatically.
- **Schema observations** (verified 2026-05-06 15:31 UTC): `title` is optional and present today on `main-use` and `post-instruct-overview` only; the renderer must humanise the step key when missing. `notes` is the only required array. `approachLZWhen` and `crossApp` are optional; today only `main-use`, `prospects-claim`, and `pitch-builder` carry them. `updatedAt` is per-presenter, not per-section.
- **Convention prefixes inside `notes[]`** — `What to say:`, `Boundary:`, `Honest framing:`, `Honest state:`, `Rough edge:`. These are author conventions, not schema fields. Use prefix detection in the renderer; do **not** lobby for the JSON to be restructured into typed fields — the prose is the contract.
- **Legacy keys to filter:** `prospects`, `notification`. Each section's first note line explicitly states the supersession. The renderer should detect supersession from the leading `"This… is now covered by…"` / `"This legacy section… is now mostly folded into…"` phrasing rather than a hard-coded blocklist that drifts — belt-and-braces: maintain both, and log when they disagree. (`main-use`, previously suspected legacy, is now a live "Start Here" step.)
- **`dev-only` step visibility.** Step 19 is the wrap-up where Luke shows the machinery behind the demo. Gate it behind the existing dev-preview check (`['LZ','AC'].includes(initials)`) so a non-dev presenter doesn't accidentally land on it during a live external session.
