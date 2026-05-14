# Direct referral onboarding and pitch link activation

> **Purpose of this document.** Self-contained brief that any future agent can pick up cold. Captures the scope from a product call where the user redirected effort toward direct/referral onboarding, prospect identity hygiene, and decoupling "instruct link" from Pitch Builder UX.
>
> **How to use it.** Read once end-to-end. Implement phases sequentially (A then B then C then D). Each phase is independently shippable. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-14 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)
User direction on the product call (paraphrased and refined through 5 corrections):
1. Design, then build, a real **prospect merge tool** in the style of ActiveCampaign with a "what stays / what goes" preview. Today there is automatic dedupe on display but no operator-facing merge UX. Do not ship a merge commit route until the connected-data map is explicit.
2. Rename the existing "generate passcode" path in Pitch Builder to **Activate Pitch Link** as a one-click popover with two fields (service description, fee). **Remove** the "Send by email / Just generate a passcode" toggle entirely. Pitch Builder stays the email drafting route; rename its primary action from "Send pitch" to **Draft pitch**.
3. Add a generic **Pitch External** Quick Action for direct or referral onboarding without a preceding enquiry. Same two-field modal as Activate Pitch Link plus minimal contact capture. The instruction agent / instruct-pitch submodule owns the heavy lifting after link issue: resolving a passcode that has no prior enquiry context, then creating contact and instruction state.
4. Consolidate **client destination launching** so every "open portal / open link" affordance across Hub routes through the existing `PortalLaunchModal`. **No new status strips** — the workbench already shows instructed, payment, and matter state and we must not duplicate it.
5. **Drop** email-into-contact parsing in the timeline. **Do not start** the Outlook add-in track in this scope because instruction-stage pre-ID contact creation covers the relevant onboarding need. **Defer** reporting and disbursement work.

User words: *"do another round to orient yourself and then confirm full brief one more time and stash it so we dont lose context"* — captured here so the next agent has the original framing.

### 2026-05-14 call follow-up clarification

- **Pitch External** should be a generic Quick Actions entry. The Hub side should issue the link and collect minimal referral/contact details, but the heavy lifting sits in the instruction agent / instruct-pitch flow: resolving a passcode with no existing enquiry, creating the contact, and creating instruction state.
- **Dedupe / matching** is not a quick UI-only fix. Existing code only groups likely duplicates for visibility. Before surfacing a merge action, map the connected data that must survive and move cleanly: emails/timeline rows, call records, pitches, Deals, Instructions, payments, ID verification, risk, matters, and audit history.
- **Jonathan staging access** is handled outside this brief.
- **Disbursement reporting** remains deferred.
- **Outlook filing** falls away for this scope if the instruction-stage pre-ID flow creates the contact first. Do not start an Outlook add-in track here.

### 2026-05-14 handoff correction from the longer call transcript

This brief now has one live handoff target: **finish the instruct-pitch side of generic Instruct links for direct/referral/off-system contacts**. Treat the rest as parked context unless the operator explicitly reactivates it.

Current product shape:

- The Hub action is a **generic Instruct link**, not a Pitch Builder alternative and not user-facing "passcode" language. Use labels like "Instruct link", "client onboarding link", or "Pitch External" only where the Hub action already exists.
- The use case is a warm referral or off-platform contact: friend texts, solicitor refers, fee earner has already exchanged emails or had a call, and now wants to send a clean onboarding/payment/ID link without first building a standard Hunter-style pitch email.
- Hub should stay thin. It issues the link and stores seed contact data on the deal shell. The portal/instruct-pitch first step should collect or confirm contact details, then create the Hub contact and instruction state.
- Contact creation must be idempotent. If the person already exists, link or update the existing contact rather than creating another duplicate.
- Existing email history does not need to create the contact. Once the contact exists in Hub with the same email address and point of contact, Prospect Overview already pulls inbox correspondence on open. Do not build email-to-contact parsing in this slice.
- Legacy proof-of-ID/Cognito links are a migration concern. The target future path is: issue generic Instruct link from Hub, client completes first-step contact capture, Hub contact and instruction are created, then ID/payment/document steps continue inside the same platform.

Parked items from the same conversation:

- **Merge/dedupe:** not urgent for this handoff. Keep the connected-data map requirement, but do not build the merge UI or mutation route now. The new Instruct-link-first flow should reduce future duplicate creation.
- **Portal launch:** this only means consolidating Hub copy/open portal affordances through `PortalLaunchModal`. It is a later UI cleanup, not needed before direct/referral passcodes work.
- **Cross-tab visibility:** showing connected contact/prospect/matter overview context across Matters and Prospects is the separate `unified-overview-surface-for-prospects-and-matters` thread. Do not fold it into the instruct-pitch passcode resolution work.
- **Outlook add-in / matter filing:** later Matter-space work for selecting emails/documents and attaching them to a matter, with possible time recording. Not part of this link creation slice.

---

## 2. Current state — verified findings

### 2.1 Prospect dedupe (automatic, display only)

- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — `fuzzyKey`, `sameIdentity`, `pickBetter` around L3040. Used to fold duplicate rows in the displayed list.
- [src/tabs/enquiries/enquiryGrouping.ts](../../src/tabs/enquiries/enquiryGrouping.ts) — `clientKey` grouping, team-email vs personal-email split, `shouldAlwaysShowProspectHistory` exception for shared inboxes (`prospects@`) and shared legacy IDs.
- No operator-facing merge UI exists. No server route mutates underlying rows. Merging today is implicit and reversible only by editing source data.

### 2.2 Pitch Builder mode toggle (to be removed)

- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) — `linkActivationMode` state ('pitch' or 'manual') at L816; `handleGeneratePasscodeOnly()` at L3251 already calls `dealCapture` with `linkOnly: true` and toasts the resulting passcode plus URL.
- [src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) — toggle options at L2613 and L2614 with labels "Send by email" and "Just generate a passcode". `isPasscodeOnlyMode` branch starts around L1746. CSS class `.pitch-typeform__mode` in `PitchBuilderRefresh.css` L1404.
- [src/tabs/enquiries/pitch-builder/VerificationSummary.tsx](../../src/tabs/enquiries/pitch-builder/VerificationSummary.tsx) — receives `linkActivationMode` props and adjusts copy. Prop chain to simplify once toggle is gone.

### 2.3 Link-only deal capture (backend engine for #2 and #3)

- [server/routes/dealCapture.js](../../server/routes/dealCapture.js) — L77 onward: `resolvedDealKind` returns `'CHECKOUT_LINK'` when `linkOnly === true`. Generates passcode, creates `Deals` row, returns `{ instructionRef, passcode, instructionsUrl }`. No email is sent in this path.
- `dealCapture` currently assumes a prospect or enquiry context exists. Direct or referral path will need a branch (new `DealKind = 'DIRECT_REFERRAL'` or an explicit `source` flag) so instruct-pitch can identify these handoffs.

### 2.4 Portal launch model (consolidation target)

- [src/utils/portalLaunch.ts](../../src/utils/portalLaunch.ts) — `buildPortalUrl(passcode)` returns `https://instruct.helix-law.com/pitch/<passcode>`. `buildPortalLaunchModel` resolves prospect, holding, workspace, and matter-portal kinds.
- [src/components/portal/PortalLaunchModal.tsx](../../src/components/portal/PortalLaunchModal.tsx) — canonical UI. Already consumed by [src/tabs/matters/MatterOverview.tsx](../../src/tabs/matters/MatterOverview.tsx) around L1529.
- Other surfaces still have ad-hoc "open link" anchors (prospect chips, instruction summaries). These should be folded into `PortalLaunchModal`.

### 2.5 Quick Actions hosts (for Pitch External)

- [src/tabs/home/QuickActionsCard.tsx](../../src/tabs/home/QuickActionsCard.tsx) — mounted in [src/tabs/enquiries/EnquiriesMenu.tsx](../../src/tabs/enquiries/EnquiriesMenu.tsx) L155 and [src/tabs/matters/MattersCombinedMenu.tsx](../../src/tabs/matters/MattersCombinedMenu.tsx) L381.
- [src/tabs/enquiries/CreateContactModal.tsx](../../src/tabs/enquiries/CreateContactModal.tsx) — existing "Call In" manual contact form. Closest precedent for the Pitch External contact-capture inputs.

### 2.6 Instruct-pitch submodule (Phase C dependency)

- Submodule path: `submodules/instruct-pitch`.
- Currently expects a passcode that maps to a Deal originating from a known prospect or enquiry. For Pitch External, instruct-pitch must accept passcodes with `DealKind = 'DIRECT_REFERRAL'` (no preceding enquiry) and create contact and instruction state on first portal load.

### 2.7 Workbench (do not duplicate)

- Matter and prospect workbenches already render instructed, payment, and matter status. The user explicitly rejected any "status strip at top" pattern in this brief. Phase D is launch consolidation only, not status reporting.

---

## 3. Plan

### Phase A — Activate Pitch Link rename + toggle removal (smallest correction)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Remove `linkActivationMode` state and prop plumbing | [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L816 | Delete state, default behaviour is email drafting |
| A2 | Remove "Send by email / Just generate a passcode" toggle UI | [src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L2613 | Remove toggle, related `isPasscodeOnlyMode` branches L1746+, `.pitch-typeform__mode` CSS |
| A3 | Add "Activate Pitch Link" button next to Draft Pitch | EditorAndTemplateBlocks | Opens compact popover; two fields (service description, fee); submit calls existing `handleGeneratePasscodeOnly` |
| A4 | Rename "Send pitch" to "Draft pitch" | EditorAndTemplateBlocks | Copy change only |
| A5 | Clean up `VerificationSummary` prop chain | [src/tabs/enquiries/pitch-builder/VerificationSummary.tsx](../../src/tabs/enquiries/pitch-builder/VerificationSummary.tsx) | Remove `linkActivationMode` references |
| A6 | Telemetry | client | `trackEvent('Hub.PitchLink.Activated', { source: 'pitch-builder', ... })` |

**Phase A acceptance:**
- Pitch Builder shows two clearly distinct actions: **Draft pitch** (primary) and **Activate Pitch Link** (secondary).
- No mode toggle visible. Email drafting remains the default flow.
- Activate Pitch Link popover: two fields, submit returns passcode plus instruct URL via toast.
- `linkActivationMode` no longer exists in the codebase.

### Phase B — Prospect merge tool

#### B0. Connected-data map first

Before any merge route exists, document the data graph for candidate records:
- enquiry rows and grouping keys
- timeline emails and call records
- pitch drafts and generated links
- Deals and Instructions records
- payment, ID verification, risk, matter, and document references
- audit history and operator notes

Output: a short design note in this brief or a companion implementation note that names which records move, which records stay as aliases, and how rollback works.

#### B1. Backend merge route

New: `POST /api/prospects/merge` (server).
- Body: `{ winnerId, loserIds: [], rules: { keep: { email|phone|name|notes }, ... } }`.
- Do not implement until B0 is complete and the connected-data map has been reviewed.
- Promotes existing `fuzzyKey` and `sameIdentity` heuristics into a candidate-detection endpoint `GET /api/prospects/merge/candidates`.
- Rewires references in `Deals`, `Instructions`, `Matters` to the winner. Marks losers with `MergedInto = <winnerId>` rather than deleting (auditability).
- Telemetry: `Hub.Prospect.Merge.Started`, `Hub.Prospect.Merge.Completed`, `Hub.Prospect.Merge.Failed`.

#### B2. Operator UI

- New modal in Helix house style: `borderRadius: 0`, helixBlue surface, helix highlight accent.
- Surface: button in [src/tabs/enquiries/components/ProspectCaseChips.tsx](../../src/tabs/enquiries/components/ProspectCaseChips.tsx) area when two or more candidates detected; also accessible from prospect row context menu.
- Two-column "what stays / what goes" with field-by-field choose. Preview the Deals, Instructions, and Matters that will reassign.
- Confirm step requires typing the winner name (irreversible-style guard).

#### B3. Honour shared inbox and shared ID exceptions

- Never auto-merge across the `shouldAlwaysShowProspectHistory` boundary. Show an explicit warning instead.

**Phase B acceptance:**
- Two duplicate prospect rows produce a merge candidate banner. Preview leads to confirm leads to a single winner row retaining all DealId and InstructionRef links.
- Losers marked with `MergedInto`, fully recoverable.
- Telemetry events visible.

### Phase C — Pitch External Quick Action (direct or referral)

#### C1. Client UI

- New generic Quick Action in [src/tabs/home/QuickActionsCard.tsx](../../src/tabs/home/QuickActionsCard.tsx) labelled "Pitch External".
- Modal combines minimal contact capture (name, email, phone, area of work) with Activate Pitch Link's two fields (service description, fee).
- Submit calls `dealCapture` with `linkOnly: true, source: 'direct-referral'` (or new `DealKind = 'DIRECT_REFERRAL'`).
- Telemetry: `Hub.PitchExternal.Issued`.

#### C2. Server branch

- [server/routes/dealCapture.js](../../server/routes/dealCapture.js) L77 — branch when `source === 'direct-referral'`: create `Deals` row without `EnquiryId`, store contact details on the deal record (or in a shadow `DirectReferrals` table, TBD), return passcode plus instruct URL.
- Decision 2 in section 6 covers whether the contact also lands in `enquiries`.

#### C3. Instruction agent / submodule handoff

- File a coordinated change in `submodules/instruct-pitch` so that:
  - Passcode resolution accepts deals with no preceding enquiry.
  - First portal load triggers contact and instruction creation on the instruct-pitch side.
- Document the contract here once landed (URL pattern, payload shape, idempotency). Hub should stay thin: issue link, pass source/contact payload, then let the instruction-stage pre-ID flow create the contact.

**Hub-side contract shipped 2026-05-14:**
- Home Quick Actions exposes **Pitch External** to LZ and AC as a dev-preview action.
- Client posts to `POST /api/deal-capture` with `source: 'direct-referral'`, `dealKind: 'DIRECT_REFERRAL'`, `linkOnly: true`, `firstName`, `lastName`, `contactEmail`, `leadClientEmail`, `serviceDescription`, `amount`, and `pitchedBy`.
- `server/routes/dealCapture.js` now creates a Deal plus PitchContent shell without `ProspectId`, sets `DealKind = 'DIRECT_REFERRAL'` when the column exists, sets `Status = 'PENDING_CONTACT'`, and generates `InstructionRef = HLX-EXT-<passcode>`.
- The Hub result is still a copyable link only. It does not email the client and does not create a full prospect/contact record. Instruct-pitch must treat `PENDING_CONTACT` / `DIRECT_REFERRAL` as the pre-ID stage that collects or confirms contact details, then creates the Hub contact and instruction state idempotently.
- The instruct-pitch side should resolve by passcode, read the Deal/PitchContent shell, use the contact payload in PitchContent notes as seed data, and preserve the returned `InstructionRef` rather than inventing a new one.

**Phase C acceptance:**
- Hub Quick Action issues an Instruct URL for direct/referral/off-system contacts.
- Opening that URL on instruct-pitch resolves the `DIRECT_REFERRAL` / `PENDING_CONTACT` Deal without requiring a prior enquiry.
- First portal step captures or confirms contact details, then creates or links the Hub contact and instruction idempotently.
- Existing inbox correspondence appears later through the normal Prospect Overview email lookup once the contact exists. No email-to-contact parser is added.

### Phase D — Single client-destination launcher (consolidation)

#### D1. Audit and replace

- Grep for ad-hoc `https://instruct.helix-law.com/pitch/` or `buildPortalUrl(` usages.
- Replace every "open portal" anchor with `PortalLaunchModal` invocation using the appropriate `buildPortalLaunchModel` kind.
- Do **not** add any new status strip or "instructed / paid / matter" header. Workbench already owns that surface.

**Phase D acceptance:**
- Single, consistent launcher across prospect, instruction, and matter.
- No remaining hand-built portal anchors outside `PortalLaunchModal`.

---

## 4. Step-by-step execution order

1. **Current handoff: Phase C3 instruct-pitch resolution**. Finish generic Instruct link support for `DIRECT_REFERRAL` / `PENDING_CONTACT` deals. This is the only work to hand to the other agent now.
2. **Then test the full loop** from Hub Pitch External link issue to instruct-pitch contact capture to Hub contact/instruction visibility.
3. **Park Phase B merge** until the new flow has had time to reduce duplicate creation. Revisit only with a connected-data map.
4. **Park Phase D PortalLaunchModal consolidation** as later Hub UI cleanup.

---

## 5. Verification checklist

**Phase A:**
- [ ] Pitch Builder renders **Draft pitch** plus **Activate Pitch Link** buttons. No mode toggle visible.
- [ ] Activate Pitch Link popover has exactly two fields. Submit toasts passcode plus URL.
- [ ] `linkActivationMode` removed from codebase (grep returns zero hits).
- [ ] `Hub.PitchLink.Activated` events visible in App Insights.

**Phase B:**
- [ ] Connected-data map completed before any merge mutation route ships.
- [ ] Duplicate prospects detected. Merge banner offered only when linked data can be previewed safely.
- [ ] Preview shows field-level winner and loser choices.
- [ ] After merge: winner retains all Deals, Instructions, and Matters. Losers have `MergedInto = <winnerId>`.
- [ ] Shared inbox rows refuse auto-merge with a clear warning.
- [ ] Telemetry events: `Hub.Prospect.Merge.Started`, `Hub.Prospect.Merge.Completed`, `Hub.Prospect.Merge.Failed`.

**Phase C:**
- [x] Hub creates a `DIRECT_REFERRAL` / `PENDING_CONTACT` deal shell and returns an Instruct URL.
- [ ] Direct/referral passcode resolves on instruct-pitch without enquiry context.
- [ ] First portal step captures or confirms contact details.
- [ ] Contact plus instruction created or linked idempotently on first portal completion.
- [ ] The created contact/instruction can be found in Hub, and the normal overview email lookup surfaces matching correspondence.
- [ ] Telemetry covers successful and failed direct/referral resolution on the instruct-pitch side.

**Phase D:**
- [ ] Grep for `buildPortalUrl` shows only `PortalLaunchModal`-related usages.
- [ ] All "open portal" affordances render the same modal.

---

## 6. Open decisions (defaults proposed)

1. **New `DealKind` vs `source` flag** — Default: **new `DealKind = 'DIRECT_REFERRAL'`**. Rationale: keeps server branching explicit and matches the existing `CHECKOUT_LINK` convention.
2. **Pitch External contact creation location** — Default: **instruction-stage pre-ID creates the Hub contact after link completion**. The Quick Action should create a pending direct/referral link payload, not a full prospect record, unless the instruct-pitch contract requires otherwise.
3. **Merge audit trail location** — Default: **`MergedInto` column on `enquiries`, plus a `prospect_merge_events` log table**. Rationale: cheap auditability, recoverable.
4. **Merge confirmation strength** — Default: **type winner name to confirm**. Rationale: irreversible-feeling without being modal-heavy.
5. **Submodule coordination cadence** — Default: **Phase C lands Hub-side stub with feature flag off; flip on once instruct-pitch handoff confirmed**. Rationale: prevents broken passcodes in prod.

---

## 7. Out of scope

- Email-into-contact parsing in the timeline (dropped; instruct-pitch owns contact creation for direct or referral).
- Outlook add-in / matter filing from email (falls away for this scope once instruction-stage pre-ID contact creation exists).
- Reporting and disbursement treatment (deferred).
- Any "status strip at top of prospect/matter" pattern (rejected; workbench already covers).
- Pitch Builder editor body changes — see `pitch-builder-body-editor-revamp` brief.
- Pitch Builder header / multi-pitch identity — see `pitch-builder-header-rework-multi-pitch-identity` brief.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) — remove `linkActivationMode`, keep `handleGeneratePasscodeOnly`
- [src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) — remove toggle, add Activate Pitch Link button plus popover, rename Send to Draft
- [src/tabs/enquiries/pitch-builder/VerificationSummary.tsx](../../src/tabs/enquiries/pitch-builder/VerificationSummary.tsx) — clean prop chain
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — surface merge candidate banner
- [src/tabs/enquiries/enquiryGrouping.ts](../../src/tabs/enquiries/enquiryGrouping.ts) — promote heuristics for candidate detection
- [src/tabs/enquiries/components/ProspectCaseChips.tsx](../../src/tabs/enquiries/components/ProspectCaseChips.tsx) — merge action entry point
- [src/tabs/home/QuickActionsCard.tsx](../../src/tabs/home/QuickActionsCard.tsx) — Pitch External tile
- `src/tabs/enquiries/PitchExternalModal.tsx` (NEW) — combined contact plus Activate Pitch Link form
- `src/tabs/enquiries/ProspectMergeModal.tsx` (NEW) — what stays / what goes
- [src/utils/portalLaunch.ts](../../src/utils/portalLaunch.ts) — extend kinds if needed
- [src/components/portal/PortalLaunchModal.tsx](../../src/components/portal/PortalLaunchModal.tsx) — consolidation target

Server:
- [server/routes/dealCapture.js](../../server/routes/dealCapture.js) — add `DIRECT_REFERRAL` branch
- `server/routes/prospectMerge.js` (NEW) — merge candidates plus merge commit
- `scripts/migrate-add-merged-into.mjs` (NEW) — adds `MergedInto` column plus `prospect_merge_events` table

Submodule:
- `submodules/instruct-pitch/**` — direct or referral passcode resolution (separate PR)

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: direct-referral-onboarding-and-pitch-link-activation
verified: 2026-05-14
branch: main
touches:
  client:
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx
    - src/tabs/enquiries/pitch-builder/VerificationSummary.tsx
    - src/tabs/enquiries/Enquiries.tsx
    - src/tabs/enquiries/enquiryGrouping.ts
    - src/tabs/enquiries/components/ProspectCaseChips.tsx
    - src/tabs/home/QuickActionsCard.tsx
    - src/utils/portalLaunch.ts
    - src/components/portal/PortalLaunchModal.tsx
  server:
    - server/routes/dealCapture.js
    - server/routes/prospectMerge.js
  submodules:
    - submodules/instruct-pitch
depends_on: []
coordinates_with:
  - pitch-builder-body-editor-revamp
  - pitch-builder-header-rework-multi-pitch-identity
  - hub-rollout-training-and-confidence-recovery
  - unified-overview-surface-for-prospects-and-matters
  - quick-actions-rework-empty-state
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - app-wide-ux-improvement-proof-programme
  - enquiries-live-feed-freshness-wiring
  - home-animation-order-and-demo-insert-fidelity
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- `handleGeneratePasscodeOnly` in [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L3251 already does exactly what Activate Pitch Link needs. Do **not** rewrite the call site; only change the UI that invokes it.
- The `shouldAlwaysShowProspectHistory` rule in [src/tabs/enquiries/enquiryGrouping.ts](../../src/tabs/enquiries/enquiryGrouping.ts) exists because `prospects@helix-law.com` and shared legacy IDs would otherwise eat distinct enquiries. The merge tool must respect this — never offer to merge across that boundary without explicit override.
- `DealKind = 'CHECKOUT_LINK'` is the existing precedent for "link-only / no email" deal capture. `DIRECT_REFERRAL` follows the same pattern but additionally lacks an `EnquiryId`. Don't conflate the two.
- Workbench already shows instructed, payment, and matter state on prospect and matter surfaces. Re-rendering that information as a "status strip at top" was explicitly rejected by the user — do not regress.
- The Pitch Builder mode toggle is referenced in several brief docs (`pitch-builder-body-editor-revamp`, `pitch-builder-header-rework-multi-pitch-identity`, `hub-rollout-training-and-confidence-recovery`). Coordinate the removal so those briefs don't reintroduce it.
- `PortalLaunchModal` is the canonical launcher — its `buildPortalLaunchModel` already knows prospect, holding, workspace, and matter-portal kinds. Do not add a new portal URL builder; extend the existing model.
- Instruct-pitch submodule changes must be a separate PR with its own access key per the submodule rule in `copilot-instructions.md`.
