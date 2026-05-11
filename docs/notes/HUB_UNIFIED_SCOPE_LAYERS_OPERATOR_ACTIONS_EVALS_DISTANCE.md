# Hub unified scope: layers, operator actions, evals, distance

> **Purpose of this document.** Self-contained scope brief capturing the moment LZ stepped back and asked "what is the foundation, what's missing, and what gets me away from my desk safely?" Every concern raised in that conversation is captured here verbatim or summarised, plus the response analysis, plus pushbacks, plus suggested sequencing. Read this whole document before scoping any next-iteration platform work.
>
> **How to use it.** This is a scope brief, not a Phase A/B execution plan. Treat §3 as the workstream taxonomy. Pick ONE workstream, scope it as its own stash brief, then ship. Do not try to do all of this in one pass.
>
> **Verified:** 2026-05-03 against branch `main`.

---

## 1. Why this exists (user intent)

LZ has built the entire Hub (this repo + `submodules/instruct-pitch` + `submodules/enquiry-processing-v2`) remotely, vibe-coded, encoding ~10 years of Helix operations judgement. The platform now does what's needed but the *operating model around it* keeps LZ tied to the desk:

- One-off triggers and bespoke actions still flow through LZ + an LLM.
- Users follow patterns without fully understanding what's running underneath. Adoption is reluctant ("only if they have to").
- Every email landing in instructions/ops becomes a manual triage that LZ ends up running.
- Cleanup, dead code, and quality work get buried because there's "no time", which compounds debt.
- Auditability, legal backing, IR/backups, secondary-tools/failover, training, comms, and SOPs all exist in fragments rather than a single coherent scope.

LZ's ask, verbatim themes:

- *"Flawless automations"* — distance only works if processes are trustworthy.
- *"Hallucination-proof processing at agent level"* — clean AI environment, AI Foundry direction, but only after the foundation is there.
- *"It starts with clarity"* — agree the shape before overcomplicating.
- *"I just can't be the person to build and package and update and tweak and collect feedback and demo and train and explain."*
- The Hub is genuine and unique to Helix, but LZ wants a path where it stops scaling LZ's stress with usage.

LZ explicitly is **not** asking for:

- Merging the three codebases (the three-stage split — enquiry-processing → tab-app → instruct-pitch — is correct and stays).
- Foundation-first as an excuse to never ship.
- "More AI" as the moat. The moat is *trustworthy AI*.

---

## 2. Current state — what's actually true today

### 2.1 Three-codebase platform (correct topology, keep it)

- `submodules/enquiry-processing-v2` — lead capture/normalisation, Teams-linked intake, Facebook leads (currently `facebook-lead-processing` branch).
- `tab-app` (this repo) — internal operations command centre. Deals, matter opening pipeline, CCL + Safety Net, finance/reporting, ops controls, AI surfaces.
- `submodules/instruct-pitch` — client-facing onboarding portal (deal capture, EID, payment, document collection) on `workspace` branch.
- Adjacent: `aged-debts-v2`, `transaction-intake`.

### 2.2 What stabilised between roughly 2026-03-01 and 2026-05-03

(Source: [logs/changelog.md](../../logs/changelog.md) — the Hub's audit trail.)

- **CCL pipeline matured**: two-pass generate → Safety Net pressure-test, decision-field scoping, document-first review UI, Dubber-prioritised evidence, persisted draft replay, blocked-state remediation.
- **Reporting trust gate**: 4-phase rollout (server readiness route → soft gate → persistent confidence rail → on-demand remediation loop with Teams DM escalation). Collected-fees parity check now lives at the top of Data Hub with per-month resync.
- **Data ops scheduler simplified**: hot/warm/cold tier system retired in favour of an hourly current-month re-fetch + bounded previous-month seal window, with App Insights telemetry on every tier and persisted history surviving restarts.
- **Activity / System tab**: dev-owner Forge lens with route checks (prod-parity smokes), Asana mirror, weekly roadmap whiteboard, telemetry feed, stash heat. The seed of an operator console.
- **Call Centre**: External Calls now first-class with attendee tagging (Primary/Supporting/Learning), Mine/All scope toggle, NetDocuments/Clio filing, prospect lookup with ACID stack, attendance-note SQL-first persistence.
- **Inline workbench**: tabs-own-the-shell rework, journey rail with stage-aware copy, claimed/pitch/instructed/payment/ID/risk/matter/docs unified visual family, AoW-coloured handoffs.
- **Local dev hygiene**: `dev:fast` mode, `disposeOnHmr`/`onServerBounced` SSE survival, 2-hour idle auto-shutdown, generated-artefact markers, prod-parity smoke catalog.
- **Permissions taxonomy clarified**: dev-preview / admin / reports / ops / dev-owner — five distinct concepts, documented, with a rollout ladder (dev-preview → admin → all).

This is genuinely a quality phase. The repo went from "vibe-coded" toward "auditable" in ~2 months. That is the surface LZ wants Alex to see.

### 2.3 What's still missing — the honest gap audit

| Layer | Today | Gap |
|-------|-------|-----|
| **System of record** | Two SQL DBs (Instructions + Core), Clio, ActiveCampaign. Decent. | No formal data lifecycle (retention, deletion, DSAR, legal hold). No vendor/dependency map with kill-switches. |
| **Operator console** | System/Forge tab, route checks, Asana mirror, whiteboard. Seed only. | One-off actions still run as `tools/*.mjs` only LZ executes. No generic Operator Actions surface (parameters, dry-run, audit, downloadable result). No inbound action queue (emails → typed actions). |
| **Change pipeline** | Rollout ladder, changelog as audit, stash protocol, prod-parity smokes, App Insights conventions. | No prompt versioning. No eval harness with golden cases. No SLO/error-budget per critical flow. No deputy programme — bus factor = 1. |
| **AI trust** | CCL Safety Net is a real second-pass quality gate. Foundry direction agreed. | No regression suite for prompts. No per-feature AI usage/cost dashboard. No agent-level hallucination guard pattern. |
| **Adoption / culture** | Hub works, but usage is reluctant. | No leadership mandate, no in-app feedback funnel, no sandbox tier (Luke Test is a canary, not a rehearsal space). No training/comms/SOP library shipped from inside the Hub. |

---

## 3. The scope (workstream taxonomy)

The clarity unlock LZ asked for is to stop treating this as one blob. Three layers, each with its own reliability rules, each with workstreams beneath.

### Layer A — System of record (high reliability, low change rate, audit obligatory)

**A1. Data lifecycle.** Per-table retention policy. Deletion flow. DSAR runbook. Legal hold. Backup test cadence. SRA + ICO + GDPR alignment. Required for legal-services firm; currently absent.

**A2. Vendor / dependency map + kill switches.** Single sheet: Clio, Azure OpenAI, Asana, Companies House, Tiller, Dubber, payment provider, ActiveCampaign. Per dep: what depends on it, who has admin, contract, failover, *manual fallback*. If Clio is down, what *can* the team still do?

**A3. Backups + IR plan.** Documented restore drill. Secondary tools to keep volumes up during downtime. Incident response playbook with named on-call.

**A4. Permissions / RBAC matrix.** One generated, reviewed-quarterly matrix per surface. Scattered across `isAdminUser` / `canAccessReports` / `isDevOwner` / dev-preview / AOW gates today. Fine for solo builder, fatal for stepping back.

### Layer B — Operator console (medium reliability, high change rate, audit obligatory)

**B1. Operator Actions surface (HIGHEST LEVERAGE).** Generic panel where each action declares: parameters, who can run, dry-run mode, audit log, result artefact (downloadable, attachable to matter/prospect, postable to Asana, time-entry-able). Replaces every `tools/*.mjs` LZ runs by hand. Once this exists, ~80% of "Luke please re-trigger X" disappears. The System/Forge tab is the natural home.

**B2. Inbound action queue.** Route triggering inboxes (instructions@, ops@) into a typed queue with classification, suggested action, operator approval. The system *receives* the trigger, doesn't get told about it after the fact. Pairs with B1 — approval = run an Operator Action.

**B3. In-app feedback funnel.** "Report this" with auto-attached context (URL, user, recent actions, last error) routed to a triage queue with SLAs. Removes LZ as the human Teams funnel.

**B4. Sandbox tier.** True non-prod where ops can rehearse a one-off, a CCL gen, a matter open without leaking to Clio/AC/ND. Luke Test is a canary, not a rehearsal space.

**B5. Training / comms / SOP library inside the Hub.** Already part of LZ's wider vision (templates, content library, comms frameworks). House it next to the action it documents — not in a separate Notion.

### Layer C — Change pipeline (governance, not uptime)

**C1. SLOs + error budgets per critical flow.** Pick 4–6 flows (matter opening, CCL gen, deal capture, ID verification, time entry, Reporting trust). Declare a target (e.g. matter opening: 99% success in 5 min, p95 < 30s). Let the budget drive whether new change ships or hardening is forced.

**C2. AI eval harness.** Prompt versioning + golden test cases per agent + regression run on change. Required *before* any AI Foundry migration — moving an unmeasured prompt to a different runtime swaps one opaque box for another. CCL is the natural pilot (already has the Safety Net second pass).

**C3. AI usage + cost observability.** Per-feature, per-user calls and spend. Without it, scaling AI bankrupts attention or budget invisibly.

**C4. Hardening as rule-of-touch.** Don't carve out a "cleanup project". Make it a promotion-gate: any file you edit gets dead imports removed, types tightened, observability added, one test if it's a hot path. The Health Observations footer is the seed; formalise it.

**C5. Deputy programme.** Named deputy per surface (matter opening, CCL, intake, deploy, reporting) with right to run + obligation to learn. Bus factor 1 → bus factor ≥ 2. Without this, no audit trail rescues a 2-week absence.

**C6. Exit / portability artefact pack.** Architecture diagram, deploy runbook, secrets inventory, vendor contracts, on-call doc, eval harness, decision log. Build *now* while context is hot. Whether or not it's ever used, building it makes LZ replaceable — which is the goal.

**C7. Leadership mandate.** "The Hub is the way; bypassing is exception, not norm." Uncomfortable but real. No tooling fix overcomes a missing political mandate. Worth more than any feature this quarter.

---

## 4. Suggested sequence (what unblocks distance fastest)

Not a strict ordering — but if LZ does these four in this order, every other workstream gets cheaper:

1. **B1 Operator Actions surface** — most leverage. Once one-offs become first-class, the desk-tether weakens immediately.
2. **A4 RBAC matrix** — without it, B1 can't safely delegate. With it, deputies can be named with confidence.
3. **C2 AI eval harness** (CCL pilot) — the only honest path to "hallucination-proof" and a prerequisite for Foundry migration.
4. **C5 Deputy programme** — pairs with B1 + A4. Now LZ can actually step away.

Everything else (lifecycle, dep map, IR, sandbox, feedback funnel, SOP library, SLOs, cost dashboards, hardening rule, portability pack, mandate) can run in parallel as separate stash briefs once the foundation above is laid.

---

## 5. Pushbacks LZ pre-accepted

- **"Bring everything together" ≠ merge codebases.** The submodule split is right. Resist the urge to fold instruct-pitch or enquiry-processing into tab-app.
- **"Foundation first" can become an excuse never to ship.** The minimum foundation that unlocks distance is the four items in §4. Everything past that is parallel, not sequential.
- **"More AI" is not the moat.** *Trustworthy AI* is. The leap from "AI does it" to "AI does it and we can prove it didn't lie" is the unlock.

---

## 6. Things LZ specifically called out that map into the workstreams

| LZ said | Workstream |
|---------|------------|
| "Get people what they need without retriggering via me" | B1 Operator Actions |
| "One-off actions clearly communicated, system trustworthy" | B1 + A4 + C1 |
| "Library of content and templates and comms" | B5 SOP/training library |
| "Auditable, traces in form we need, downloadable, copy/upload to matters and storage and time entries and Asana" | B1 result-artefact contract + A2 |
| "Legal backing, IR plan, backups, secondary independent tools" | A1 + A2 + A3 |
| "Dead code and optimising" | C4 rule-of-touch |
| "Clean AI env, Foundry, hallucination-proof at agent level" | C2 + C3 |
| "Nobody really uses it, only if they have to" | B3 feedback + C7 mandate |
| "Stop being indispensable" | C5 deputies + C6 portability pack |

Nothing LZ raised falls outside this taxonomy. That's the validation that the layering is right.

---

## 7. Out of scope (for this brief)

- Implementation. This is scope, not Phase A. Each workstream gets its own stash brief when picked up.
- Rebrand / UI overhaul beyond what already happened in the Mar–May quality phase.
- Merging the three codebases.
- Replacing Clio / Asana / Foundry with anything else.
- Any non-Helix expansion.

---

## 8. File index

This brief stands alone. When workstreams are picked up, their briefs link back here.

- [logs/changelog.md](../../logs/changelog.md) — the audit trail of the Mar–May quality phase referenced in §2.2
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — current operating contract for agents in this repo
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) — current architecture reference
- [.github/instructions/STASHED_PROJECTS.md](../../.github/instructions/STASHED_PROJECTS.md) — protocol for spawning per-workstream briefs from this scope

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: hub-unified-scope-layers-operator-actions-evals-distance
verified: 2026-05-03
branch: main
touches:
  client: []
  server: []
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
# This is a SCOPE brief, not an execution brief. Touches are intentionally
# empty. When a workstream (B1, A4, C2, C5, etc.) is picked up, it gets its
# own stash brief that declares real touches and links back to this id.
```

---

## 9. Gotchas appendix

- **This is a scope brief, not a workstream.** Resist the urge to start coding from this document. Pick one item from §3, scope it as its own brief, ship it, then come back here and tick it off.
- **The four-item sequence in §4 is opinionated, not gospel.** If a different ordering becomes obviously cheaper (e.g. a deputy turns up volunteering to run matter opening tomorrow), follow the cheaper path. The point is leverage, not order.
- **"Hallucination-proof" only means something with evals.** Don't let a Foundry migration ship without C2 in place — even partially. Otherwise the migration is theatre.
- **The mandate (C7) is the hidden dependency.** If leadership won't say "the Hub is the way", every other workstream loses 30% of its value. Surface this to Alex early, not late.
- **LZ is the bus factor.** Treat C5 + C6 as load-bearing, not nice-to-have. The whole point of this brief is that LZ should be able to stop and the platform keeps compounding.
