# Matter Portal — Comprehensive Code Review

_Generated: 2025-07-15_

---

## A. Architecture Overview

### System Topology

The Matter Portal is a **client-facing read/write interface** inside the `instruct-pitch` submodule that lets clients who have completed the onboarding/payment flow view their active matters, upload documents, track progress, and request new instructions.

```
┌─────────────────────────────────────────────────────────────────┐
│  App.tsx  (instruct-pitch routing layer)                        │
│   ├─ Passcode lookup → /api/getDealByPasscodeIncludingLinked    │
│   ├─ Portal check   → /api/matter-portal/check/:passcode       │
│   ├─ People check   → /api/matter-portal/people/:passcode      │
│   └─ if showPortal  → <MatterPortal passcode={…} />            │
│                                                                 │
│  MatterPortal.tsx   (2 154 lines)                               │
│   ├─ Overview grid   (folder rows, new-instruction CTA)         │
│   ├─ Detail view     (stage tracker, checklist, docs, sidebar)  │
│   ├─ Security gate   (client ID verification)                   │
│   ├─ ContactEmailBox                                            │
│   └─ InlineInstructionIntake / NewInstructionModal              │
│                                                                 │
│  StageTracker.tsx   (6-stage recovery pipeline)                 │
│  DocumentUpload.tsx (shared checkout-flow upload, NOT portal)   │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  matter-portal.js   (Express router, 1 717 lines)              │
│   ├─ MSSQL (Instructions DB)                                   │
│   │    Tables: Deals, Instructions, DealJointClients,           │
│   │            IDVerifications, team, MatterChecklist,          │
│   │            ClientBranding, Opponents                        │
│   ├─ MSSQL (Core Data DB)                                      │
│   │    Tables: Matters                                          │
│   └─ Azure Blob Storage                                        │
│        Container: instruction-files                             │
│        Paths: matters/{passcode}/{matterId}/…                   │
│               matters/{passcode}/holding/…                      │
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Model

- **Passcode-based**: No JWT, no session tokens. A client enters via a URL containing their passcode (e.g. `/27367-20200`). The backend resolves the passcode to deals/matters.
- **Client-side security gate**: `PortalSecurityGate` demands the user enter their **Clio client ID** (numeric). It validates against `validClientIds` derived from the matters list and persists in `sessionStorage['mp-gate-passed-{passcode}']`.
- **No server-side auth middleware**: All `/api/matter-portal/*` routes are publicly accessible to anyone who knows a valid passcode. Rate limiting and IP restrictions are the only real defences.

### Data Flow (primary entry)

1. `App.tsx` detects a returning user by checking `data.InstructionRef` from the deal lookup.
2. Calls `GET /api/matter-portal/check/:passcode` — lightweight check returning `{ showPortal, matterCount }`.
3. If `showPortal`, renders `<MatterPortal passcode={passcode} />`.
4. `MatterPortal` fetches `GET /api/matter-portal/by-passcode/:passcode` (or `/matters/:instructionRef`).
5. Backend joins Deals → Instructions → Matters + Opponents + DealJointClients + IDVerifications + team + MatterChecklist + ClientBranding.
6. Returns a `PortalData` shape with `client`, `matters[]`, `pendingInstructions[]`, `branding`.
7. If `enableSecurityGate`, the portal shows the gate before rendering data.

### Blob Storage Patterns

| Purpose | Prefix | Example |
|---------|--------|---------|
| Per-matter docs | `matters/{passcode}/{matterId}/` | `matters/20200/12345/001-contract.pdf` |
| Holding folder | `matters/{passcode}/holding/` | `matters/20200/holding/002-receipt.jpg` |

Files are prefixed with a 3-digit sequence number (`001-`, `002-`) for ordering. Automatic folder creation (`ensureMatterFolders`) generates sub-directories: `client-uploads`, `case-documents`, `correspondence`.

---

## B. Backend API Endpoints

All routes are mounted at `app.use('/api', matterPortalRouter)` in `server.js:394-395`.

| # | Method | Path | Purpose | SQL Tables | Notes |
|---|--------|------|---------|------------|-------|
| 1 | GET | `/api/matter-portal/matters/:instructionRef` | Fetch matters by instruction ref | Deals, Instructions, Matters, Opponents, DealJointClients, IDVerifications, team, MatterChecklist, ClientBranding | Primary data endpoint (ref-based) |
| 2 | GET | `/api/matter-portal/people/:passcode` | Multi-person detection | Deals, Instructions, DealJointClients, IDVerifications | Returns `{ isMultiPerson, people[] }` |
| 3 | GET | `/api/matter-portal/check/:passcode` | Lightweight portal availability check | Deals, Instructions, Matters | Returns `{ showPortal, matterCount }` |
| 4 | GET | `/api/matter-portal/by-passcode/:passcode` | Primary client entry (passcode-based) | Same as #1 | Resolves passcode → instructionRef first |
| 5 | GET | `/api/matter-portal/documents/:matterId` | List documents for a matter | — (blob only) | Reads from Azure Blob Storage |
| 6 | POST | `/api/matter-portal/documents/:matterId/upload` | Upload document to a matter | — (blob only) | Multer, 10 MB max, extension whitelist |
| 7 | GET | `/api/matter-portal/documents/:matterId/download/*` | Download a document | — (blob only) | Streams blob to client |
| 8 | POST | `/api/matter-portal/contact` | Send contact email | — | Uses `./email` module |
| 9 | GET | `/api/matter-portal/deals/:passcode` | Dev diagnostic route | Deals | Lists raw deals for a passcode |
| 10 | POST | `/api/matter-portal/new-instruction` | Self-service new instruction request | Instructions (INSERT) | Sends notification email |
| 11 | GET | `/api/matter-portal/brand-logo/:passcode` | Stream client brand logo | ClientBranding, Deals | Returns binary image |
| 12 | POST | `/api/matter-portal/holding/:passcode/upload` | Upload to holding folder | — (blob only) | Multer, same limits |
| 13 | GET | `/api/matter-portal/holding/:passcode` | List holding folder contents | — (blob only) | |

### Helper Functions

| Function | Purpose |
|----------|---------|
| `resolvePasscodeForMatter(matterId)` | Reverse-lookup passcode from a Clio matter ID |
| `matterBlobPrefix(passcode, matterId)` | Returns `matters/{passcode}/{matterId}/` |
| `holdingBlobPrefix(passcode)` | Returns `matters/{passcode}/holding/` |
| `ensureMatterFolders(prefix)` | Creates sub-directories in blob storage |
| `sanitize(filename)` | Strips dangerous characters from filenames |
| `deriveRecoveryStage(matter)` | Maps matter status to a–f recovery stage |
| `hasRecoveryStageColumn()` | Cached schema check for RecoveryStage column |
| `hasChecklistTable()` | Cached check for MatterChecklist table existence |
| `hasBrandingTable()` | Cached check for ClientBranding table existence |
| `buildChecklist(matter, instruction)` | Constructs 6-item default checklist |
| `buildBranding(passcode)` | Fetches branding from ClientBranding table |
| `deriveInitials(name)` | Extracts initials from a full name |

### Schema Detection Pattern

The backend uses a "check once per boot" caching pattern for optional columns/tables:
```js
let _hasRecoveryStage = null;
async function hasRecoveryStageColumn() {
  if (_hasRecoveryStage !== null) return _hasRecoveryStage;
  // ... INFORMATION_SCHEMA query ...
  _hasRecoveryStage = result;
  return result;
}
```
This avoids repeated metadata queries but means schema changes require a server restart to take effect.

---

## C. Client-Side Components

### Component Tree

```
MatterPortal (main, 2 154 lines)
├── PortalSecurityGate          — Client ID verification overlay
├── Overview View
│   ├── FolderCard[]            — One per matter (clickable row)
│   ├── PendingInstructionRow[] — Submitted but not-yet-opened instructions
│   ├── InlineInstructionIntake — Bizcap-specific new instruction form
│   ├── ContactEmailBox         — Compose-and-send to solicitor
│   └── HoldingUploadSection    — Drag-drop to holding folder
├── Detail View (MatterDetailView)
│   ├── Banner (back, title, ref, status)
│   ├── StageTracker            — 6-stage horizontal pipeline
│   ├── ChecklistSection        — Per-matter progress items
│   ├── DocumentsSection        — File list + upload zone
│   ├── Sidebar (info card)
│   └── CopyValue               — Inline copy-to-clipboard
├── NewInstructionModal          — Full modal alternative to inline intake
├── Toast / ToastContainer       — Notification system
└── PaymentLayout wrapper        — footerVariant="workspace"
```

### State Management

All state is local `useState` — no Redux, no Context for portal data. Key state:

| State | Type | Purpose |
|-------|------|---------|
| `portalData` | `PortalData \| null` | Full response from backend |
| `selectedMatterId` | `string \| null` | Currently viewed matter (detail view) |
| `gateUnlocked` | `boolean` | Security gate passed? |
| `toasts` | `Toast[]` | Active toast notifications |
| `niExpanded` | `boolean` | Inline instruction intake open? |
| `holdingFiles` | `HoldingFile[]` | Holding folder document list |

### Data Types (inline, not shared)

All interfaces (`PortalData`, `PortalMatter`, `PortalClient`, `PortalChecklist`, etc.) are defined inline in `MatterPortal.tsx`. They are not exported or shared with other components.

### Routing

- `App.tsx:856-870` — Portal rendered when `showPortal && passcode` is truthy
- Dev route: `/luke-portal` renders `<MatterPortal demoData={DEMO_PORTAL_DATA} testMode />`
- The portal does NOT use react-router sub-routes for overview/detail; it manages view state internally via `selectedMatterId`

### Props

```typescript
interface MatterPortalProps {
  passcode?: string;
  instructionRef?: string;
  demoData?: PortalData;
  testMode?: boolean;
}
```

### Key Behaviours

1. **Multi-person support**: `PersonSelector` shown when `peopleRes.isMultiPerson` — lets users pick their identity before entering portal.
2. **Inline instruction intake**: Bizcap-specific with fields: Company Name, Debtor Name, Guarantor Name, Loan Balance, Email, Description. Posts to `/api/matter-portal/new-instruction`.
3. **Holding upload**: Drag-drop zone for documents before a matter is opened. Files go to `matters/{passcode}/holding/`.
4. **Security gate**: Validates client ID against `matter.clientId` values. Persisted in `sessionStorage`.
5. **Copy-to-clipboard**: `CopyValue` wraps any text with a hover-reveal copy button and tick + toast feedback.

---

## D. Visual Design Audit

### Design System Files

| File | Lines | Role |
|------|-------|------|
| `design-system.css` | 524 | CSS custom properties (--helix-*), resets, utilities |
| `colours.ts` | 22 | JS-side brand tokens |
| `theme.ts` | 9 | Minimal theme object (4 colours + spacing) |
| `MatterPortal.css` | 2 891 | Full portal styling |
| `StageTracker.css` | ~120 | Stage tracker styling |
| `UploadWorkspace.css` | — | Upload workspace styling (not reviewed) |

### Token Usage Assessment

**Good**: MatterPortal.css heavily uses CSS custom properties with fallback values:
```css
color: var(--helix-navy, #061733);
background: var(--helix-blue, #3690CE);
color: var(--helix-text-muted, #A0A0A0);
```

**The token system is self-contained within instruct-pitch** and does NOT share the tab-app's `colours.ts` or `design-tokens.css`. The instruct-pitch `design-system.css` defines its own `--helix-*` variables.

### Brand Palette Compliance

| Token / Hex | Expected (Brand Spec) | Actual (instruct-pitch) | Match? |
|-------------|----------------------|------------------------|--------|
| websiteBlue | `#000319` | `#000319` | ✅ |
| darkBlue | `#061733` | `#061733` | ✅ |
| helixBlue | `#0D2F60` | `#0D2F60` | ✅ |
| highlight / blue | `#3690CE` | `#3690CE` | ✅ |
| cta | `#D65541` | `#D65541` | ✅ |
| grey | `#F4F4F6` | `#F4F4F6` | ✅ |
| accent | `#87F3F3` | `#87F3F3` | ✅ |
| green (brand) | `#20b26c` | `#14B07A` | ❌ Mismatch |
| success (design-system.css) | `#20b26c` | `#14B07A` | ❌ Same mismatch |

### Hardcoded Colour Violations

Colours appearing in CSS that are NOT brand tokens:

| Hex | Where | Should Be |
|-----|-------|-----------|
| `#16a34a` | Checklist done icon, copy tick, intake success | `colours.green` (`#14B07A` or brand `#20b26c`) — Tailwind green-600 |
| `#1a9c5b` | Toast success background | `colours.green` |
| `#d94040` | Toast error background | `colours.cta` (#D65541) |
| `#e74c3c` | Required asterisk, gate error, file remove hover | `colours.cta` (#D65541) |
| `#27ae60` | Modal success icon | `colours.green` |
| `#f0f5fa` | Checklist item hover | Should use `var(--helix-grey)` or token |
| `#ebedf2` | New instruction CTA background | No token |
| `#e4e7ee` | New instruction CTA hover | No token |
| `#dde0e8` | Various borders, intake active | No token |
| `#fafbfc` | Email box footer, dropzone | No token |
| `#b58a12` | Pending badge, pending ref | No token (amber/warning) |
| `#fffcf5` | Pending folder background | No token |
| `#d4a017` | Pending border-left | No token (amber/warning) |
| `#2a7ab8` | Email send hover | Should use darker shade of `--helix-blue` |
| `#1a5276` | Contact link accent | Should use `--helix-navy` or `--helix-blue` |
| `#2d3748` | Holding dropzone title | No token — Tailwind grey-800 |
| `#94a3b8` | Holding dropzone subtitle | Tailwind slate-400 |
| `#d1d5db` | Holding dropzone border | Tailwind grey-300 |
| `#e2e8f0` | Holding icon box-shadow | Tailwind slate-200 |
| `#f0f9ff` | Uploading icon gradient | Tailwind sky-50 |
| `#e0f2fe` | Uploading icon gradient | Tailwind sky-100 |
| `#8a6d3b` | Modal note warning text | No token |
| `#c44` | Modal required asterisk | Should match `#e74c3c` or `cta` |

**Summary**: ~25 unique off-brand hex values. Most are Tailwind defaults or ad-hoc greys that should be replaced with either existing `--helix-*` tokens or new purpose-built tokens.

### Border Radius Violations

Brand spec: **`borderRadius: 0`** everywhere (999 for pills, 50% for dots only).

| Value | Count (approx) | Where |
|-------|----------------|-------|
| `2px` | ~15 | Section cards, status badges, detail banner, back button, file rows, copy button |
| `3px` | ~12 | Email send, check item, modal note, select, textarea, buttons, copy toast |
| `4px` | ~5 | Toast, email box, ni-field-input |
| `6px` | ~8 | Upload zone, ni-dropzone, instruct section, gate input, gate button, holding dropzone icon, StageTracker summary |
| `10px` | 1 | Docs contact prompt |
| `12px` | 2 | Gate card, holding dropzone |
| `14px` | 2 | Back button pill (intentional pill style) |
| `50%` | 2 | Gate lock icon, instruct trigger icon (circles — acceptable) |
| `0` | 0 | **Not used anywhere as an explicit value** |

**Verdict**: Widespread non-compliance with the `borderRadius: 0` brand rule. The portal uses primarily 2-3px radii, which is subtle but inconsistent with the brand spec. The security gate card at `12px` is the most visible deviation.

### Typography

- **Font**: Raleway specified via `font-family: 'Raleway', sans-serif` in modal elements and `--helix-font` CSS variable. Most elements inherit via `font-family: inherit` which is correct.
- **Sizes**: Range from `0.5rem` (8px) to `1.1875rem` (19px). Most body text is `0.8125rem` (13px) — meets the 13px minimum.
- **Hierarchy**: Appropriate use of uppercase + letter-spacing for labels, bold for headings.

### Animations

Well-crafted micro-interactions throughout:
- `mp-fadeIn` — page-level fade
- `mp-riseIn` — section reveal with spring easing
- `mp-scaleReveal` — security gate card
- `mp-gridReveal` — folder grid stagger
- `mp-barGrow` — progress bar fill
- `mp-dotBreathe` — status indicator pulse
- `mp-ni-slide` — intake panel expand
- `mp-gate-shake` — error shake
- `mpShimmer` — skeleton loading

All animations use `cubic-bezier(0.22, 1, 0.36, 1)` consistently as the spring curve, which gives a premium feel.

### Responsive Design

Breakpoints used:
- `768px` — detail grid collapses to single column
- `640px` — folder grid collapses, column headers hidden
- `600px` — intake field grid goes single column
- `480px` — area of work cards go from 4-column to 2-column

Good mobile coverage for the core layout. Sidebar stacks below main content.

---

## E. Quality Issues

### Security

| Severity | Issue | Location |
|----------|-------|----------|
| **HIGH** | No server-side authentication on any API endpoint. Anyone with a valid passcode (5-digit number) can access all matter data, documents, and submit instructions. Passcodes are brute-forceable. | All routes in `matter-portal.js` |
| **HIGH** | The security gate is client-side only — a user can bypass it by calling the API directly or editing sessionStorage. | `MatterPortal.tsx` PortalSecurityGate |
| **MEDIUM** | `GET /api/matter-portal/deals/:passcode` is a dev diagnostic route that returns raw deal data. Should be behind auth or removed in production. | `matter-portal.js` route #9 |
| **MEDIUM** | The `new-instruction` endpoint accepts and stores user-submitted data (email, description, files) without rate limiting. Could be abused for spam. | `matter-portal.js` route #10 |
| **LOW** | Document download endpoint uses wildcard path (`*`) — ensure path traversal is not possible beyond the blob prefix scope. | `matter-portal.js` route #7 |

### Error Handling

| Severity | Issue | Location |
|----------|-------|----------|
| **MEDIUM** | `catch (err: any)` used in multiple places — should be `catch (err: unknown)` per TypeScript best practices. | `MatterPortal.tsx` multiple catch blocks |
| **LOW** | Some fetch calls have empty `.catch(() => {})` — silent failures that could mask bugs. | `MatterPortal.tsx` several places |
| **LOW** | The `contact` POST endpoint returns 200 even on email send failure (only logs the error). Client sees success but email wasn't sent. | `matter-portal.js` route #8 |

### Performance

| Severity | Issue | Location |
|----------|-------|----------|
| **MEDIUM** | N+1 blob listing: for each matter, the backend iterates blob lists to count documents. With many matters, this creates O(N) Azure Storage API calls per portal load. | `matter-portal.js` by-passcode route |
| **LOW** | The 2 891-line CSS file is not code-split or lazy-loaded. All portal styles are loaded regardless of whether the portal is shown. | `MatterPortal.css` |
| **LOW** | `MatterPortal.tsx` at 2 154 lines contains ~15 inline sub-components. Extracting them would improve tree-shaking and code splitting. | `MatterPortal.tsx` |

### Code Quality

| Severity | Issue | Location |
|----------|-------|----------|
| **LOW** | Multiple `console.log` statementsremain in App.tsx (dev bypasses, deal lookup logging). These should use structured logging in production. | `App.tsx` lines 203–330+ |
| **LOW** | `DEMO_PORTAL_DATA` is exported as a named export alongside the default component. This demo data (with synthetic names/refs) ships to production. | `MatterPortal.tsx` export |
| **LOW** | `InlineInstructionIntake` is hardcoded for Bizcap debt-recovery fields (debtorName, guarantorName, loanBalance). Should be configurable per area of work. | `MatterPortal.tsx` ~lines 480–620 |
| **LOW** | Interfaces (`PortalData`, `PortalMatter`, etc.) are defined inline and not exported. Other components that might need the same types (PersonSelector, DevToolsPanel) can't reuse them. | `MatterPortal.tsx` |
| **INFO** | The CSS file has ~1 400 lines of duplication — the entire block from "CONTACT EMAIL BOX" through "RESPONSIVE" is duplicated verbatim (compare lines ~1200-1500 with ~2400-2891). This appears to be an accidental double-paste. | `MatterPortal.css` |

### Accessibility

| Severity | Issue | Location |
|----------|-------|----------|
| **MEDIUM** | Security gate input has no `<label>` element — only placeholder text. Screen readers won't announce the field purpose. | `MatterPortal.tsx` PortalSecurityGate |
| **LOW** | `FolderCard` rows use `<div onClick>` instead of `<button>` or `<a>`. Not keyboard-navigable without tabindex. | `MatterPortal.tsx` FolderCard |
| **LOW** | Toast notifications are not announced via `aria-live` region. | `MatterPortal.tsx` ToastContainer |
| **LOW** | The copy button uses `all: unset` which removes focus ring. The `:focus-visible` fallback addresses this partially but may not work in all browsers. | `MatterPortal.css` `.mp-copy-btn` |

---

## F. Cross-App Contract

### instruct-pitch → tab-app

The matter portal in `instruct-pitch` is **self-contained** — it does not call any `tab-app` API endpoints and does not share types or components with the tab-app.

However, both systems operate on the same database tables:

| Table | instruct-pitch (portal) | tab-app |
|-------|------------------------|---------|
| Matters (Core Data) | READ | READ/WRITE |
| Instructions (Instructions DB) | READ/WRITE (new-instruction) | READ/WRITE |
| Deals (Instructions DB) | READ | READ/WRITE |
| MatterChecklist | READ | Potentially WRITE |
| ClientBranding | READ | Potentially WRITE |

### tab-app's MatterOverview

The tab-app has `MatterOverview` (imported in `MattersReport.tsx:36`) which provides internal staff views of the same Clio matters. This is a **separate component with its own data pipeline** that calls `getMatterOverview` (an Azure Function). There is no shared code between the portal's matter rendering and the tab-app's matter rendering.

**Key divergences to track:**
- Portal uses `RecoveryStage` column (with fallback derivation) for stage tracking; tab-app uses Clio status/practice-area directly.
- Portal renders a 6-stage pipeline (a–f); tab-app has no equivalent visual.
- Portal's document storage uses `instruction-files` blob container; tab-app documents may use a different pattern.

### instruct-pitch → enquiry-processing-v2

No direct dependencies detected. The portal does not interact with `enquiry-processing-v2`. However, the `new-instruction` endpoint creates records that will eventually flow through the processing pipeline.

### Shared Surface: Passcode

The **passcode** is the cross-app join key. It originates in `enquiry-processing-v2` (lead capture), is stored in `Deals.Passcode`, and is used by both `instruct-pitch` (checkout flow + portal) and `tab-app` (operational lookups). Changes to passcode handling in any system affect all three.

---

## Summary of Priority Actions

| Priority | Action | Effort |
|----------|--------|--------|
| **P1** | Add server-side auth middleware (at minimum rate limiting + passcode validation) to prevent brute-force access | Medium |
| **P1** | Remove or protect `GET /api/matter-portal/deals/:passcode` diagnostic route | Trivial |
| **P2** | Fix the CSS duplication (~1 400 duplicate lines in MatterPortal.css) | Trivial |
| **P2** | Replace ~25 hardcoded hex values with design tokens | Medium |
| **P2** | Align green colour: `#14B07A` → `#20b26c` (or update brand spec) | Trivial |
| **P2** | Fix border-radius violations (set to 0 per brand spec) | Medium |
| **P3** | Extract inline sub-components and interfaces from MatterPortal.tsx into separate files | Medium |
| **P3** | Fix N+1 blob listing (batch document counts) | Medium |
| **P3** | Add aria labels, keyboard navigation, and live region for toasts | Medium |
| **P3** | Make InlineInstructionIntake configurable beyond Bizcap fields | Medium |
| **P4** | Replace `catch (err: any)` with `catch (err: unknown)` | Trivial |
| **P4** | Remove production `console.log` statements from App.tsx | Trivial |
| **P4** | Remove `DEMO_PORTAL_DATA` from production bundle (tree-shake or conditional import) | Trivial |
