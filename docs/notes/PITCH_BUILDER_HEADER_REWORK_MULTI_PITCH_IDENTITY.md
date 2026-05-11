# Pitch Builder header rework + multi-pitch identity

> **Purpose of this document.** Self-contained brief any future agent (or LZ on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read once. Implement Phase A. Phase B picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-30 against branch `main`. If reading this >30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

Direct ask, paraphrased from chat: *"pitch builder should be visible to everyone all the time, just pitching when an existing deal that hasn't expired is active the user should know about it. but the implementation needs to be really clean, currently the pitch builder page is lagging behind a little in terms of the sort of responsive design and things"* and then *"its more about the sort of where pitch builder is, but i want the whole top bit considered for rework also, and also how the pitches are opened/accessed given the pitch builder now being tailored to the selected pitch, you know? or a new pitch obv."*

The request is **not**:
- Gating Pitch Builder visibility by role (it stays available to everyone — no audience changes).
- A full editor / scenario / template refactor (those are separate stash candidates).
- Server changes — passcode/deal lookup endpoints already return everything we need.

The request **is**:
1. The top of Pitch Builder (`PitchHeaderRow`'s "modern card" block) is off-brand: gradients, `borderRadius: 16`, drop shadows, blur, 17px headers. Replace with the brand surface ladder (`borderRadius: 0`, websiteBlue/darkBlue, Raleway 11–13px, no gradients).
2. Multi-pitch identity: an enquiry can have several historical pitches (deals). Today Pitch Builder ignores them — it always opens in "fresh local passcode" mode and silently inserts a new deal on send. Make Pitch Builder aware of the existing pitches and let the user pick which one to edit, or start a new one.
3. Snappy, responsive, premium feel. Chips wrap. Identity strip stays compact. No layout jank when pitches load.

---

## 2. Current state — verified findings

### 2.1 Where Pitch Builder lives

- File: [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx)
- Rendered as a sub-tab on enquiry detail (L5180–5187): `{activeSubTab === 'Pitch' && <PitchBuilder enquiry={enquiry} userData={userData} initialScenario={selectedPitchScenario} />}`.
- Default sub-tab is `Timeline` (per 2026-03-04 changelog "Row click opens Timeline (Overview) instead of Pitch Builder"). Pitch Builder only opens via explicit chip / "Open Pitch Builder" CTA / scenario click. **Entry remains intentional — do not change this.**
- Resume mechanism: localStorage keys `resumePitchBuilder` + `pitchBuilderState` ([Enquiries.tsx#L3147](../../src/tabs/enquiries/Enquiries.tsx#L3147)).
- Cross-callback from EnquiryTimeline ([Enquiries.tsx#L5199](../../src/tabs/enquiries/Enquiries.tsx#L5199)): `onOpenPitchBuilder={(scenarioId) => { setSelectedPitchScenario(scenarioId); setActiveSubTab('Pitch'); }}`. Currently a single string scenario — no `dealId`.

### 2.2 PitchBuilder.tsx (the host)

- File: [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx)
- Props (L105–L110):
  ```ts
  interface PitchBuilderProps {
    enquiry: Enquiry;
    userData: UserData[] | null;
    showDealCapture?: boolean;
    initialScenario?: string;
  }
  ```
- Passcode model: on mount, generates a fresh local 5-digit passcode ([PitchBuilder.tsx#L1528](../../src/tabs/enquiries/PitchBuilder.tsx#L1528)):
  ```ts
  const [dealPasscode, setDealPasscode] = useState<string>(() => {
    const passcode = String(Math.floor(10000 + Math.random() * 90000));
    return passcode;
  });
  ```
- Deal status state ([PitchBuilder.tsx#L1533](../../src/tabs/enquiries/PitchBuilder.tsx#L1533)): `'idle' | 'processing' | 'ready' | 'error'`.
- Deal insertion (`insertDealIfNeeded`) at L2982 onward — POSTs to `/api/dealCapture` with `passcode: dealPasscode`. Server-side dealCapture **upserts** by passcode, so if we seed `dealPasscode` from an existing deal the same call updates it instead of inserting a new row.
- Background auto-create on mount ([PitchBuilder.tsx#L3221](../../src/tabs/enquiries/PitchBuilder.tsx#L3221)) is **disabled** with a clear comment: *"This was creating unwanted placeholder deals. Real deals are created when users send/draft emails."* — keep disabled.
- Imports `ADDITIONAL_CLIENT_PLACEHOLDER_ID` from `../../constants/deals` ([PitchBuilder.tsx#L64](../../src/tabs/enquiries/PitchBuilder.tsx#L64)) — multi-client wiring already exists.

### 2.3 PitchHeaderRow.tsx (the off-brand top card)

- File: [src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx](../../src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx)
- Off-brand styling (L70–L92):
  ```ts
  borderRadius: '16px',
  background: 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)',
  boxShadow: '0 20px 44px rgba(2, 6, 17, 0.72)',
  backdropFilter: 'blur(12px)',
  ```
- `enquiryNotesHeader` (L96–L120) uses 17px font + 3px gradient strip + `borderRadius: '0 0 8px 8px'`. All of this needs to go.
- `dealSideContainerStyle` at L343 is the right-side deal card container — also needs realignment.
- Has a stale comment block (L554–L556) about DealCaptureForm being inlined here — confirm before removing.

### 2.4 EnquiryTimeline.tsx (existing-pitch awareness today)

- File: [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx)
- `isExpiredIso` helper at L1602 — reuse this (or copy semantics) in the new hook.
- Workspace-status check around L1687–L1718: discriminated `{ kind: 'found' } & { passcode, urlPath, createdAt?, expiresAt?, dealId?, isExpired? }`. This proves an endpoint exists that returns exactly what the new strip needs. **Find that endpoint and reuse — do not invent a new contract.** Trace from L1687 backward to find the fetch.
- Existing-passcode banner JSX at L6212–L6286 — `isLive && isExpiredIso(expiresAt)` toggle.
- `onOpenPitchBuilder` callback at L742, L792, L1916–L1943 — needs the optional second arg `(scenarioId?, dealId?)`.

### 2.5 DealCard.tsx (the orphan)

- File: [src/tabs/enquiries/pitch-builder/DealCard.tsx](../../src/tabs/enquiries/pitch-builder/DealCard.tsx)
- 75 lines, exports `DealCard` default. Only references in workspace are its own definition + `export default`. **Confirmed orphan via grep on 2026-04-30** (no consumers). Off-brand `borderRadius: 8`, MD shadows, 13px uppercase labels.
- A second `DealCard.tsx` exists at [src/tabs/instructions/DealCard.tsx](../../src/tabs/instructions/DealCard.tsx) — that one is in active use; do not touch.

### 2.6 buildInlineWorkbenchMap.ts (already understands deal scoring)

- File: [src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts)
- L60–L64: deal-status preference logic (`instructed > pitched/accepted > expired/declined`). The chip strip should mirror these tones.

---

## 3. Plan

### Phase A — Header rework (replace off-brand top card, no behavioural change yet)

| #  | Change | File | Detail |
|----|--------|------|--------|
| A1 | Strip off-brand top card from `PitchHeaderRow` | [src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx](../../src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx) | Remove `enquiryNotesContainer` / `enquiryNotesHeader` style blocks (gradients, blur, `borderRadius: 16`). Replace with on-brand container (`borderRadius: 0`, surface ladder, Raleway). Keep all email-field children intact. |
| A2 | Realign `dealSideContainerStyle` | same file (L343) | `borderRadius: 0`, drop shadows, websiteBlue/darkBlue surface, accent (`#87F3F3`) for active borders only. |
| A3 | Delete orphan `pitch-builder/DealCard.tsx` | [src/tabs/enquiries/pitch-builder/DealCard.tsx](../../src/tabs/enquiries/pitch-builder/DealCard.tsx) | Re-grep before deleting (`Select-String -Path src/**/*.tsx -Pattern "from.*pitch-builder/DealCard"`). |
| A4 | Add `data-helix-region="pitch-builder.header"` | [src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx](../../src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx) | Wayfinding convention. |
| A5 | Changelog entry + screenshot if possible | [logs/changelog.md](../../logs/changelog.md) | Single line. |

**Phase A acceptance:**
- Top of Pitch Builder uses `borderRadius: 0`, no gradients, no blur, no MD shadows.
- Email fields render exactly as before (no field added/removed).
- Dark + light modes both look on-brand against UserBubble reference.
- `data-helix-region="pitch-builder.header"` visible in DOM.
- No new TypeScript errors. `npx tsc --noEmit` clean.

### Phase B — Multi-pitch identity (the chip strip)

#### B1. New hook `usePitchesForEnquiry`

File: `src/tabs/enquiries/pitch-builder/usePitchesForEnquiry.ts` (NEW, ~80 lines).

Trace the existing fetch from `EnquiryTimeline.tsx#L1687` backward — find the URL it hits. Likely `/api/instructions/lookup-passcode` or `/api/deals/by-prospect`. Reuse exactly that endpoint. **Do not invent a new server route.**

Return shape:
```ts
type PitchSummary = {
  dealId: number;
  passcode: string;
  instructionRef?: string | null;
  amount?: number | null;
  initialScopeDescription?: string | null;
  serviceDescription?: string | null;
  status: 'live' | 'expired' | 'instructed' | 'errored';
  createdAt?: string;
  expiresAt?: string;
  expiresInDays?: number; // computed client-side from expiresAt
};

type UsePitchesResult = {
  pitches: PitchSummary[];        // sorted newest first
  livePitch?: PitchSummary;       // most-recent live (helper)
  loading: boolean;
  error?: string;
  refetch: () => void;
};
```

Status derivation (mirror [buildInlineWorkbenchMap.ts#L60](../../src/tabs/enquiries/utils/buildInlineWorkbenchMap.ts#L60)):
- `instructionRef` present → `instructed`
- `expiresAt` past now → `expired`
- otherwise → `live`
- network/save error from server → `errored`

#### B2. New component `PitchHeader`

File: `src/tabs/enquiries/pitch-builder/PitchHeader.tsx` (NEW, ~220 lines).

Layout (single 64px-tall strip, `borderRadius: 0`):

```
[client name + ID pill]  PITCHES · [• #12345 4d] [#11892 expired] [+ new]
```

Props:
```ts
interface PitchHeaderProps {
  enquiry: Enquiry;
  pitches: PitchSummary[];
  loading: boolean;
  selectedDealId: number | 'new' | null;
  onSelectPitch: (dealId: number | 'new') => void;
  isDarkMode: boolean;
}
```

Chip = 9px uppercase passcode (`#12345`) + 6px tone dot:
- `green` (#20b26c) → instructed
- `accent` (#87F3F3) dark / `highlight` (#3690CE) light → live
- `subtleGrey` faded → expired
- `cta` (#D65541) → errored
- Active chip → filled accent/highlight tint + 2px bottom underline (mirror existing scope toggle pattern in Home.tsx).
- `+ New pitch` chip = `+` glyph + uppercase text, always rightmost, special active state.

Skeleton row (3 placeholder chips, 6px height shimmer) while `loading=true`. No spinner.

Wraps to second row at narrow widths via `flexWrap: 'wrap'`. Client name truncates with ellipsis.

`data-helix-region="pitch-builder.header"`. Wayfinding key for each chip: `data-helix-key="pitch-chip-<passcode>"`.

#### B3. Wire identity through PitchBuilder

File: [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx).

New optional props:
```ts
selectedDealId?: number | null;       // null/undefined = new pitch mode
onPitchSelectionChange?: (dealId: number | 'new') => void;
```

On mount and on `selectedDealId` change: if a `dealId` is supplied, hydrate `dealPasscode`, `initialScopeDescription`, `amount`, `selectedOption`, `subject` from the matching `PitchSummary`. Show a toast `"Editing pitch #<passcode> (<status>, expires in <Nd>)"`.

When user clicks `+ New pitch` while another is active, show an inline confirm IF the editor body is dirty (track via existing edit state — find the editor change detector in PitchBuilder, likely a `bodyChanged` or `editorDirty` ref). If clean, swap silently with a toast.

Render `<PitchHeader>` immediately above `<PitchHeaderRow>`. Pass `pitches` and `selectedDealId` from a new `usePitchesForEnquiry(enquiry.ID)` call inside PitchBuilder.

#### B4. Wire identity through Enquiries.tsx

File: [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx).

Add `selectedPitchDealId` state alongside `selectedPitchScenario`. Extend `onOpenPitchBuilder` to accept an optional `dealId` arg (default behaviour unchanged when omitted).

Default selection on Pitch Builder open:
- If `selectedDealId` was passed via the callback → use it.
- Else if any pitch is `live` → most-recent live one.
- Else (all expired or none) → `'new'`.

#### B5. Wire identity through EnquiryTimeline.tsx

File: [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx).

Existing-passcode workspace rows (L6212+) get a `Continue this pitch` quiet-link CTA wired to `onOpenPitchBuilder(undefined, dealId)`. Existing "Open Pitch Builder" CTAs unchanged.

#### B6. Telemetry

Two events only (avoid noise):
- `trackClientEvent('pitch-builder', 'pitch-selected', { dealId, status, source: 'header-chip' | 'timeline' | 'auto-default' })`
- `trackClientEvent('pitch-builder', 'new-pitch-started', { hadExistingLive: boolean })`

**Phase B acceptance:**
- Opening Pitch Builder for an enquiry with a live pitch defaults to editing that pitch (passcode reused, no new deal row created on send).
- Switching chips re-hydrates the editor with that pitch's data.
- `+ New pitch` always available; dirty-editor confirm fires.
- Send/draft on a selected live pitch updates the existing deal row (verify in Instructions DB: `node tools/instant-lookup.mjs deal <id>` shows updated `Amount` / `ServiceDescription`, no new row inserted).
- Send/draft on `+ New pitch` creates a new deal (verify: deal count increases by 1).
- App Insights: `pitch-builder.pitch-selected` event visible.
- TypeScript clean.
- No layout jank: pitches pre-load in parallel with editor mount; chip strip reserves height even while loading.

---

## 4. Step-by-step execution order

1. **A1** — Strip `PitchHeaderRow` off-brand top card, replace with on-brand container.
2. **A2** — Realign `dealSideContainerStyle`.
3. **A3** — Confirm orphan + delete `pitch-builder/DealCard.tsx`.
4. **A4** — Add wayfinding region attr.
5. **A5** — Changelog + ship Phase A.
6. **(Phase B)** **B1** — Trace existing endpoint from EnquiryTimeline L1687, write `usePitchesForEnquiry.ts`.
7. **B2** — Build `PitchHeader.tsx` with skeleton + chips. Render with mock data first to nail visuals.
8. **B3** — Wire `selectedDealId` hydration into PitchBuilder. Test send-on-existing-pitch updates rather than inserts.
9. **B4** — Wire state through Enquiries.tsx; default-selection rule.
10. **B5** — Wire EnquiryTimeline "Continue this pitch" CTA.
11. **B6** — Add two telemetry events.
12. Verification SQL spot check + changelog + ship Phase B.

---

## 5. Verification checklist

**Phase A:**
- [ ] Top of Pitch Builder visually matches UserBubble reference (no gradients, `borderRadius: 0`, Raleway 13px body, 12px label).
- [ ] Dark + light modes both pass.
- [ ] Email fields, deal capture form, all existing inputs render and submit identically.
- [ ] `npx tsc --noEmit` clean.
- [ ] Orphan `DealCard.tsx` deleted; no broken imports.

**Phase B:**
- [ ] Opening Pitch Builder for an enquiry with live pitches shows the chip strip; default chip = most-recent live.
- [ ] Switching chips re-hydrates editor; toast confirms.
- [ ] Dirty-editor guard fires when clicking `+ New pitch` mid-edit.
- [ ] Send on a selected live pitch updates the existing deal (SQL: `node tools/instant-lookup.mjs deal <id>`; deal count unchanged on Instructions DB).
- [ ] Send on `+ New pitch` inserts a new deal row.
- [ ] App Insights events `pitch-builder.pitch-selected` and `pitch-builder.new-pitch-started` visible.
- [ ] No layout jank — chip strip reserves height during load.

---

## 6. Open decisions (defaults proposed)

1. **Active-edit guard on chip switch** — Default: **inline confirm if editor body is dirty**, silent swap if clean. Rationale: losing an unsent draft is worse than one extra click.
2. **Default chip when opened from an Enquiries row click** — Default: **most-recent live pitch** if any, else `+ New pitch`. Rationale: the operator's most likely intent. Standalone "Open Pitch Builder" from navigator stays `+ New pitch`.
3. **Action group placement (Send / Draft / Copy link)** — Default: **leave where they are this round**. Header gets identity + chip strip + status meta only. Smaller diff, easier to revert. Consolidating actions into the header is a Phase C candidate.

---

## 7. Out of scope

- Pitch Builder lower portions (template editor, scenario picker, snippet popovers).
- New deal types or new fields.
- Server changes — passcode-lookup endpoint reused as-is.
- Audience/visibility gating — Pitch Builder remains visible to everyone.
- Pitch Builder "modes" (e.g. CFA-only, ID-only) — those flow through existing scenario plumbing untouched.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) — host component; gains `selectedDealId` + hydration + `<PitchHeader>` render.
- [src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx](../../src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx) — Phase A target (top card rework). Email fields preserved.
- [src/tabs/enquiries/pitch-builder/PitchHeader.tsx](../../src/tabs/enquiries/pitch-builder/PitchHeader.tsx) — NEW (Phase B).
- [src/tabs/enquiries/pitch-builder/usePitchesForEnquiry.ts](../../src/tabs/enquiries/pitch-builder/usePitchesForEnquiry.ts) — NEW (Phase B).
- [src/tabs/enquiries/pitch-builder/DealCard.tsx](../../src/tabs/enquiries/pitch-builder/DealCard.tsx) — DELETE (Phase A, orphan).
- [src/tabs/enquiries/Enquiries.tsx](../../src/tabs/enquiries/Enquiries.tsx) — add `selectedPitchDealId` state + extended callback (Phase B).
- [src/tabs/enquiries/EnquiryTimeline.tsx](../../src/tabs/enquiries/EnquiryTimeline.tsx) — "Continue this pitch" link + extended callback signature (Phase B).

Server:
- None. Reuses existing passcode/deal lookup endpoint already consumed by EnquiryTimeline.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: pitch-builder-header-rework-multi-pitch-identity
verified: 2026-04-30
branch: main
touches:
  client:
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/enquiries/pitch-builder/PitchHeaderRow.tsx
    - src/tabs/enquiries/pitch-builder/PitchHeader.tsx
    - src/tabs/enquiries/pitch-builder/usePitchesForEnquiry.ts
    - src/tabs/enquiries/pitch-builder/DealCard.tsx
    - src/tabs/enquiries/Enquiries.tsx
    - src/tabs/enquiries/EnquiryTimeline.tsx
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - enquiries-live-feed-freshness-wiring
  - home-animation-order-and-demo-insert-fidelity
  - hub-rollout-training-and-confidence-recovery
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- **`insertDealIfNeeded` upserts on passcode.** The whole multi-pitch identity model relies on this. If the passcode in `dealPasscode` state matches an existing deal row, the server updates that row; otherwise it inserts. Verify this before B3 — if the server hard-rejects existing-passcode collisions, plan changes.
- **PitchBuilder generates a fresh local passcode on mount** ([PitchBuilder.tsx#L1528](../../src/tabs/enquiries/PitchBuilder.tsx#L1528)). The hydration in B3 must `setDealPasscode(existing)` synchronously after the pitches load — otherwise the first send race-conditions in with the random local passcode and creates a new deal row. Use a `useEffect` keyed on `[selectedDealId, pitches]`.
- **Background auto-create on mount is disabled for a reason** ([PitchBuilder.tsx#L3221](../../src/tabs/enquiries/PitchBuilder.tsx#L3221)). Do not re-enable. Real deals are only created on send/draft.
- **Default Enquiries sub-tab is Timeline, not Pitch** (per 2026-03-04 changelog). Do not change. Pitch Builder must stay opt-in.
- **Two `DealCard.tsx` files exist**: `src/tabs/enquiries/pitch-builder/DealCard.tsx` (orphan, delete) and `src/tabs/instructions/DealCard.tsx` (in active use, do not touch).
- **Existing telemetry already covers most pitch flows.** Do not re-add events that already exist; check `pitchTelemetry.ts` first.
- **`onOpenPitchBuilder` callback signature change is breaking.** Add `dealId` as optional second arg, not first. All existing call sites pass `scenarioId` (or nothing) — they must keep working.
- **localStorage `pitchBuilderState` resume mechanism** ([Enquiries.tsx#L3147](../../src/tabs/enquiries/Enquiries.tsx#L3147)). When extending to support `dealId`, persist `selectedDealId` alongside `selectedPitchScenario` so resume works correctly.
- **Coordinates with 5 other stashed briefs** that touch the same two files (`PitchBuilder.tsx` or `Enquiries.tsx`). None of them touch the header region or the multi-pitch identity model — pure file-level coexistence. If any of them merge first, re-run `node tools/stash-precheck.mjs --draft <this-file>` and check `Phase A` line refs.
