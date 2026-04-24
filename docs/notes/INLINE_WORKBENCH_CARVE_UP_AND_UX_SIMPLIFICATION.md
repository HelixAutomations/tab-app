# Inline Workbench carve-up and UX simplification

> **Purpose.** Self-contained brief. A future agent can pick this up cold and execute without prior context.
>
> **How to use.** Read once end-to-end. Ship Phase A before starting Phase B. Log each phase in `logs/changelog.md` referencing this stash id.
>
> **Verified:** 2026-04-20 against `main`. If >30 days old, re-verify line refs first.

---

## 1. Why this exists (user intent)

Verbatim from the user (2026-04-20): *"yes please stash the candidates, add to scope general workbench clean up and simplification of both design and actions/information shown etc."*

`src/tabs/instructions/InlineWorkbench.tsx` is **10,322 lines** in a single `React.FC` function body — well past the 3,000-line threshold called out in `.github/copilot-instructions.md`. It has become the landing zone for every instructions-surface feature: EID result viewer, verification inspector, raw-record PDF export, payment pipeline, doc-workspace passcode resolver, pitch composer lazy-mount, client setup card, matter preflight, matter-wizard mount, CCL affordance, risk assessment, pipeline tabs, journey road.

Over time the UX has also accreted: too many rows of optional metadata, inconsistent dot/pill/chip treatments, density of actions that obscure the actual next step.

The user wants two things in one initiative:
1. **Structural** — break the god-component into a directory of focused subcomponents with shared types, per-phase shippable.
2. **UX** — while touching each phase, reduce visual noise: fewer rows, clearer next-step, consistent brand tokens, remove dead affordances.

No behaviour changes beyond what the user explicitly removes during UX simplification.

---

## 2. Current state — verified findings

### 2.1 File size and responsibility sprawl

- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) — **10,322 lines**, one default-export component.
- Imports `CompactMatterWizard` at L56, lazy-loads `PitchComposer` at L141.
- Component starts at L143, ends at EOF.
- Final JSX `return (` at L4194 — meaning ~4,000 lines of hooks/handlers/memos followed by ~6,000 lines of JSX.

### 2.2 Identifiable in-file "sections" (landmarks for carving)

Each should become its own file under `src/tabs/instructions/workbench/`.

| # | Section | Approx. line range | Notes |
|---|---------|-------------------|-------|
| a | Top-level types + helpers | L60–L141 | `MatterClientTypeOption`, `inferMatterClientType`, `getCandidateName`, `VerificationDetails`, `InlineWorkbenchProps`, `ContextStageKey` |
| b | Raw-record PDF export ref | L217 (`persistRawRecordPdfRef`) + emit block | Hook `workbench/hooks/useRawRecordPdf.ts` |
| c | Verification data helpers | L295 `getRawRecordText`, L309 `normaliseVerificationFieldValue` | `workbench/verification/` |
| d | Doc-workspace passcode resolver | L348 `resolveDocWorkspacePasscode` | `workbench/hooks/useDocWorkspacePasscode.ts` |
| e | Pitch/enquiry id resolver | L327 `resolvePitchEnquiryId` | `workbench/hooks/usePitchEnquiryId.ts` |
| f | Matter preflight + wizard orchestration | L252–L258 refs + L2971 onwards | `workbench/matter-pipeline/MatterPipelineStage.tsx` |
| g | Payment pipeline card | L3751–~L4193 | `workbench/payments/PaymentsCard.tsx` |
| h | Pipeline tabs (Instructed→Pay→ID→Risk→Matter→Docs) | L4213–L4441 | `workbench/pipeline/PipelineTabs.tsx` |
| i | Details tab — Client/Entity header | L4442–~L4800 | `workbench/details/ClientHeaderCard.tsx` |
| j | Journey road renderer (origin/road/destination) | L3099–L3230 | `workbench/pipeline/JourneyRoad.tsx` |

### 2.3 Cross-surface consumers

- `InlineWorkbench` is consumed only by `src/tabs/instructions/Instructions.tsx` (single default import). Props shape at L112–L139.
- `CompactMatterWizard` is consumed only by `InlineWorkbench` (L56). Internals covered by sister brief `compactmatterwizard-split-by-wizardmode`.

### 2.4 Recent additions to preserve

- [src/tabs/instructions/MatterOpening/DemoModeStripe.tsx](../../src/tabs/instructions/MatterOpening/DemoModeStripe.tsx) (2026-04-20) imported at L57, mounted above Client Setup card circa L9035 gated on `isDemoInstruction` (L1317). **Keep** this mount during carve-up.

### 2.5 UX friction (user-flagged / agent-spotted)

- Client Setup card stacks: client-type banner, candidate list, matter-type chooser, preflight status, wizard mount — all in one scroll with no visual rhythm.
- Payments card (L3751+) has ≥4 separator rules and ≥7 sub-sections in one card (Total Paid, Deal Amount, Payments list, Last Payment, Method, per-payment status pills, payment count badge, Create payment link).
- Pipeline tabs (L4213) use a connector with "lights up green when previous stage complete" comment (L4302), but journey road (L3099) has its own connector. Two implementations of the same idea.
- Off-brand RGB values appear — flagged in `copilot-instructions.md` under "known violations".

---

## 3. Plan

### Phase A — zero-behaviour extraction of types + helpers + hooks

Purely mechanical moves. No JSX touched.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Create `workbench/` directory | `src/tabs/instructions/workbench/` | New folder co-located with `InlineWorkbench.tsx` |
| A2 | Extract types | `workbench/types.ts` | `MatterClientTypeOption`, `MatterClientCandidate`, `VerificationDetails`, `ContextStageKey`, `InlineWorkbenchProps` from L60–L139 |
| A3 | Extract pure helpers | `workbench/helpers.ts` | `inferMatterClientType` (L78), `getCandidateName` (L88) |
| A4 | Extract passcode + enquiry-id hooks | `workbench/hooks/useDocWorkspacePasscode.ts`, `workbench/hooks/usePitchEnquiryId.ts` | Lift `resolvePitchEnquiryId` (L327), `resolveDocWorkspacePasscode` (L348) |

**Phase A acceptance:** `InlineWorkbench.tsx` drops by ≥150 lines, `npm run tsc` clean, no visual diff, no new console warnings.

### Phase B — payments card extraction + UX simplification

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Extract payments card | `workbench/payments/PaymentsCard.tsx` | Move L3751–L4193 JSX + handlers. Props: `{ deal, payments, instructionRef, isDarkMode, onCreatePaymentLink }` |
| B2 | Collapse redundant separators | same file | Keep **one** separator between logical groups (Totals \| Last activity \| Method). Drop three of the four. |
| B3 | Unify pill/dot treatment | same file | Status indicators → `colours.green/orange/cta/subtleGrey` + `borderRadius: 999`. Remove any `#20b26c`/`#FF8C00` literals. |
| B4 | Consolidate duplicate payment renders | same file | Rendered twice at L3842 + L3969. Pick one (default: the collapsible row at L3969). |
| B5 | Extract collapsible payment row | `workbench/payments/PaymentRow.tsx` | Pattern currently at L3976–L4193 |

**Phase B acceptance:** Payments card ≤300 lines, ≥30% fewer horizontal rules visible, every colour traces to `colours.ts`, `get_errors` clean.

### Phase C — pipeline tabs + journey road extraction

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Extract pipeline tabs | `workbench/pipeline/PipelineTabs.tsx` | L4213–L4441 |
| C2 | Extract journey road | `workbench/pipeline/JourneyRoad.tsx` | L3099–L3230 |
| C3 | Unify connectors | `workbench/pipeline/StageConnector.tsx` | Single `<StageConnector />` used by both |

**Phase C acceptance:** One connector implementation, single source of truth for stage colours.

### Phase D — details/client-header extraction + UX prune

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Extract Client/Entity header | `workbench/details/ClientHeaderCard.tsx` | L4442–~L4540 |
| D2 | Banner subsection | `workbench/details/ClientTypeBanner.tsx` | L4451–L4472 |
| D3 | Meta tags row | `workbench/details/ClientMetaTags.tsx` | L4482+ |
| D4 | Prune meta tags | same file | Above-the-fold: name, client type, primary identifier. Everything else behind an "info" disclosure. |

**Phase D acceptance:** Details tab loads with ≤5 visible fields above the fold on 1440×900 (vs current ~12).

### Phase E — matter-pipeline orchestration extraction

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Extract Client Setup → Matter Wizard orchestration | `workbench/matter-pipeline/MatterPipelineStage.tsx` | From ~L2971 `isMatterWizardStepActive` through conditional wizard mount |
| E2 | Preserve `DemoModeStripe` mount | same file | Circa L9035 — keep at top of Client Setup branch |
| E3 | Keep scroll refs | same file | `matterPreflightPageRef` (L257), `matterWizardPageRef` (L258), effect L3012–L3030 must continue scrolling on stage change |

**Phase E acceptance:** Matter-opening flow identical (smoke: one real + one demo prospect). Refs still scroll into view.

---

## 4. Step-by-step execution order

1. **A1–A4** — types + helpers + hooks (one PR, zero behaviour change).
2. **B1–B5** — payments card (one PR, visible simplification).
3. *(parallel with 4)* **C1–C3** — pipeline + journey.
4. *(parallel with 3)* **D1–D4** — details/header.
5. **E1–E3** — matter-pipeline last (largest blast radius).

---

## 5. Verification checklist

**Phase A:**
- [ ] `InlineWorkbench.tsx` line count drops by ≥150.
- [ ] `npm run tsc` clean.
- [ ] App renders unchanged on a real instruction and on `DEMO-ENQ-0001`.

**Phase B:**
- [ ] Payments card file ≤300 lines.
- [ ] Zero inline hex colours — every colour traces to `src/app/styles/colours.ts`.
- [ ] Payment rows expand/collapse identically.
- [ ] Total line reduction in `InlineWorkbench.tsx` ≥ 400.

**Phase C:**
- [ ] One `<StageConnector />` used in both pipeline tabs and journey road.
- [ ] Stage colours sourced from one map.

**Phase D:**
- [ ] Details tab initial-fold field count ≤5.
- [ ] "Info" disclosure reveals the rest — no data lost.

**Phase E:**
- [ ] Smoke: real instruction → launch wizard → refs scroll into view.
- [ ] Smoke: `DEMO-ENQ-0001` → DemoModeStripe visible on Client Setup card.
- [ ] `InlineWorkbench.tsx` final line count < 3,000.

---

## 6. Open decisions (defaults proposed)

1. **Directory name** — Default: `src/tabs/instructions/workbench/`. Rationale: colocates with parent, matches `MatterOpening/` sibling.
2. **Shared types location** — Default: `workbench/types.ts`. Single well-known path.
3. **Hooks file-per-hook or grouped?** — Default: file-per-hook. Avoid recreating sprawl at smaller scale.
4. **UX prune aggressiveness** — Default: hide behind disclosure, don't delete. Safer rollback.
5. **Payments duplicate render winner (B4)** — Default: keep collapsible row at L3969, drop inline pills at L3842. Confirm with user before deleting.

---

## 7. Out of scope

- `CompactMatterWizard.tsx` internals — sister brief `compactmatterwizard-split-by-wizardmode`.
- CCL review modal plumbing — shipped 2026-04-20.
- Any server-side routes.
- Renaming `InlineWorkbench` — keep symbol, just slim file.
- `Instructions.tsx` consumer contract — props shape stays identical.
- EID result viewer restructure — separate future brief if needed.
- Raw-record PDF export overhaul — isolate hook (Phase A-adjacent) but don't rewrite.

---

## 8. File index (single source of truth)

Client (existing, to be modified):
- [src/tabs/instructions/InlineWorkbench.tsx](../../src/tabs/instructions/InlineWorkbench.tsx) — shrinks across all phases
- [src/tabs/instructions/Instructions.tsx](../../src/tabs/instructions/Instructions.tsx) — consumer, no expected changes
- [src/tabs/instructions/MatterOpening/DemoModeStripe.tsx](../../src/tabs/instructions/MatterOpening/DemoModeStripe.tsx) — preserved during Phase E

Client (NEW):
- `src/tabs/instructions/workbench/types.ts` (A2)
- `src/tabs/instructions/workbench/helpers.ts` (A3)
- `src/tabs/instructions/workbench/hooks/useDocWorkspacePasscode.ts` (A4)
- `src/tabs/instructions/workbench/hooks/usePitchEnquiryId.ts` (A4)
- `src/tabs/instructions/workbench/payments/PaymentsCard.tsx` (B1)
- `src/tabs/instructions/workbench/payments/PaymentRow.tsx` (B5)
- `src/tabs/instructions/workbench/pipeline/PipelineTabs.tsx` (C1)
- `src/tabs/instructions/workbench/pipeline/JourneyRoad.tsx` (C2)
- `src/tabs/instructions/workbench/pipeline/StageConnector.tsx` (C3)
- `src/tabs/instructions/workbench/details/ClientHeaderCard.tsx` (D1)
- `src/tabs/instructions/workbench/details/ClientTypeBanner.tsx` (D2)
- `src/tabs/instructions/workbench/details/ClientMetaTags.tsx` (D3)
- `src/tabs/instructions/workbench/matter-pipeline/MatterPipelineStage.tsx` (E1)

Docs / logs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase referencing stash id

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: inline-workbench-carve-up-and-ux-simplification
verified: 2026-04-20
branch: main
touches:
  client:
    - src/tabs/instructions/InlineWorkbench.tsx
    - src/tabs/instructions/workbench/types.ts
    - src/tabs/instructions/workbench/helpers.ts
    - src/tabs/instructions/workbench/hooks/useDocWorkspacePasscode.ts
    - src/tabs/instructions/workbench/hooks/usePitchEnquiryId.ts
    - src/tabs/instructions/workbench/payments/PaymentsCard.tsx
    - src/tabs/instructions/workbench/payments/PaymentRow.tsx
    - src/tabs/instructions/workbench/pipeline/PipelineTabs.tsx
    - src/tabs/instructions/workbench/pipeline/JourneyRoad.tsx
    - src/tabs/instructions/workbench/pipeline/StageConnector.tsx
    - src/tabs/instructions/workbench/details/ClientHeaderCard.tsx
    - src/tabs/instructions/workbench/details/ClientTypeBanner.tsx
    - src/tabs/instructions/workbench/details/ClientMetaTags.tsx
    - src/tabs/instructions/workbench/matter-pipeline/MatterPipelineStage.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - compactmatterwizard-split-by-wizardmode
  - demo-mode-hardening-production-presentable-end-to-end
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Do not touch `matterWizardAnchorRef` / `matterPreflightPageRef` / `matterWizardPageRef`** (L252–L258) without preserving the scroll effect at L3012–L3030. It fires on `isMatterWizardStepActive` transitions; losing it regresses the scroll-to-wizard UX.
- `isDemoInstruction` is evaluated at L1317 — derive in the parent, pass down as prop. Do NOT re-read `localStorage` per child.
- `workbenchEntryMotionLastPlayedAt` at L140 is a **module-level `Map`** (not per-instance) intentional so motion doesn't re-trigger on re-mount. Keep it module-level when relocated.
- `LazyPitchComposer` at L141 must stay lazy-loaded — do not eagerly import during extraction.
- The Payments card renders per-payment status pills at L3842 AND a second collapsible per-payment row at L3969 — overlapping responsibility. Confirm before deleting either.
- `persistRawRecordPdfRef` at L217 is `useRef<(source?: 'manual' | 'auto') => Promise<void>>` — assigned inside a child effect, consumed by a parent handler. When extracting, pass ref down or lift the assignment.
- No new off-brand colours — if a shade isn't in `colours.ts`, **add it there first**, then consume.
