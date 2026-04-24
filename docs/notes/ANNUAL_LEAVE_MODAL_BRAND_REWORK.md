# Annual Leave Modal brand rework

> **Purpose of this document.** Self-contained brief for a future agent to pick up cold.
>
> **Verified:** 2026-04-22 against branch `main`. If reading >30 days later, re-verify file refs.

---

## 1. Why this exists (user intent)

User ask (verbatim): *"i want this component to also be speedy and all of its edge case moals and things to look and feel like the evolved helix software like app."*

Context: Phase A (this session) shipped attendance/annual-leave backend speedups (indexes + query collapse + longer mem cache + connection-string helper). The Portal overview is recently on-brand and received a polish pass in the same session (pills → 999, stagger trimmed). The outstanding "edge case modal" is the book/edit/cancel workflow surface, which still carries older Helix look + heavy Fluent UI styling.

IS: bring the Annual Leave Modal to the current UserBubble / Portal design standard (brand tokens, borderRadius 0 / pills 999, Raleway, neutral dark-mode body text, structural loading).

IS NOT: a functional rewrite of the leave workflow, schema changes, server changes, or the approvals UI (see sibling brief `annual-leave-approvals-brand-rework`).

---

## 2. Current state — verified findings

### 2.1 Entry point

- File: [src/CustomForms/AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) — 3,816 lines. Mixes Fluent UI + custom markup + inline styles. Handles: book, edit, cancel, half-day start/end, hearing confirmation, reason classification, remaining-days calculation, team conflict overlay.
- File: [src/CustomForms/AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css) — 523 lines. Many hard-coded hex values; borderRadius values inconsistent; spacing not tokenised.

### 2.2 Reference implementations

- Canonical look: [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx).
- Design guide: [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md).
- Tokens: [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — `--helix-*`, `--surface-*`, `--text-*`, `--border-*`, `--shadow-*`, `--spacing-*` + utility classes (`.helix-panel`, `.helix-input`, `.helix-label`, `.helix-btn-primary`, `.helix-toast-*`, `.helix-section-title`, `.helix-body`).
- Just-polished sibling: [src/tabs/home/AttendancePortal.css](../../src/tabs/home/AttendancePortal.css) — badges at `999px`, stagger capped at 0.18s.

### 2.3 Text hierarchy rule (CRITICAL — prevents blue-on-blue)

Body text in dark-mode panels MUST use neutral grey (`#d1d5db` or `var(--text-body)`). NEVER `colours.dark.subText` (that's `#3690CE` highlight blue — creates blue-on-blue on navy surfaces).

### 2.4 Likely problem surfaces to audit on open

- Modal chrome: non-zero `border-radius` at top-level, header, footer, input wrappers.
- Primary action button: probably Fluent `PrimaryButton` — retheme to match `.helix-btn-primary`.
- Date inputs: Fluent `DatePicker` with default palette — restyle via tokens, keep behaviour.
- Reason/classification dropdown styling.
- Team conflict overlay ("X others are off that week") — spacing + colour.
- Loading state — must be structural skeleton, not spinner over collapsed geometry.
- Success/error feedback — use `.helix-toast-success` / `.helix-toast-error`.

---

## 3. Plan

### Phase A — Chrome, typography, borders (low risk, visible win)

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | `border-radius: 0` everywhere except pills (999px) and circular dots (50%) | [AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css) | Audit every `border-radius:` declaration |
| A2 | Font family = `var(--font-primary)` (Raleway) | [AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css) | Replace `Segoe UI` fallback stacks |
| A3 | Hard-coded hex → CSS vars | [AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css) | `#3690CE`→`var(--helix-highlight)`, `#FF8C00`→`var(--helix-orange)`, `#20b26c`→`var(--helix-green)`, `#D65541`→`var(--helix-cta)`, `#6B6B6B`→`var(--helix-grey-text)`, etc. |
| A4 | Dark-mode body text → `var(--text-body)` | [AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) | Replace any `colours.dark.subText` used for prose |
| A5 | Surface depth ladder | both | Backdrop on `var(--surface-page)` + blur; panel `var(--surface-section)`; inner cards `var(--surface-card)` |

**Phase A acceptance:**
- No bare hex literals remain in `AnnualLeaveModal.css`.
- Visual pass in both dark + light matches UserBubble / Portal feel.
- No functional regression (book/edit/cancel/half-day/hearing all still work).

### Phase B — Structural loading + snappy feel

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Spinner-over-void → structural skeleton | [AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) | Reserve final footprint; skeleton rows for team list + leave list |
| B2 | Stagger capped at 0.18s | both | Match Portal polish |
| B3 | Adopt `applyRowHover` / `resetRowHover` | [AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) | Interactive conflict rows |
| B4 | Toast on save/cancel via `.helix-toast-*` | [AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) | Replace bespoke banners |

### Phase C — Optional decomposition

File is 3,816 lines. If Phase A reveals that one-shot editing is too risky, split into:
- `AnnualLeaveBookForm.tsx` (form body)
- `AnnualLeaveConflictPanel.tsx` (team overlay)
- `AnnualLeaveRemainingCard.tsx` (remaining-days)
- `AnnualLeaveReasonSelect.tsx` (classification)
- `AnnualLeaveModal.tsx` stays as shell + state owner.

Only do Phase C after user confirmation.

---

## 4. Step-by-step execution order

1. **A1–A3** — CSS pass. TSX untouched.
2. **A4–A5** — TSX inline-style audit.
3. Smoke test: open modal, book a day, cancel, edit, half-day — confirm no regressions.
4. **B1** — Structural loader.
5. **B2–B4** — Stagger, hover, toasts.
6. Changelog entry per phase.
7. **C** only if needed — plan and confirm first.

---

## 5. Verification checklist

**Phase A:**
- [ ] PowerShell: `Select-String -Path src/CustomForms/AnnualLeaveModal.css -Pattern '#[0-9a-fA-F]{3,6}' | Measure-Object` → count should be 0.
- [ ] Modal renders correctly in dark + light.
- [ ] Book / edit / cancel / half-day all work.

**Phase B:**
- [ ] Perceived first-paint under 300ms (skeleton visible immediately, no collapsed geometry).
- [ ] Save triggers `.helix-toast-success`; error triggers `.helix-toast-error`.

---

## 6. Open decisions (defaults proposed)

1. **Keep Fluent `DatePicker` or replace?** Default: **keep Fluent** — replacing dates is high-risk (i18n, a11y). Restyle via tokens only.
2. **Decompose in Phase C?** Default: **no** unless Phase A shows merge-conflict-prone regions. User's ask is visual, not architectural.
3. **Half-day PM/AM micro-copy?** Default: **unchanged** — out of scope.

---

## 7. Out of scope

- Server changes (leave API, approval flow).
- Schema changes (`annualLeave` indexed this session).
- Approvals surface — see sibling brief.
- New fields / reason taxonomy changes.
- Removing [src/tabs/home/AttendanceCompact.tsx](../../src/tabs/home/AttendanceCompact.tsx) — appears unused (not imported anywhere), logged as separate health observation.

---

## 8. File index

Client:
- [src/CustomForms/AnnualLeaveModal.tsx](../../src/CustomForms/AnnualLeaveModal.tsx) — modal to rework
- [src/CustomForms/AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css) — styles to retokenise
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — canonical reference
- [src/tabs/home/AttendancePortal.tsx](../../src/tabs/home/AttendancePortal.tsx) — sibling reference
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — tokens
- [src/app/styles/colours.ts](../../src/app/styles/colours.ts) — TS palette

Server: n/a (out of scope)

Scripts / docs:
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — follow this
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED)

```yaml
# Stash metadata
id: annual-leave-modal-brand-rework
verified: 2026-04-22
branch: main
touches:
  client:
    - src/CustomForms/AnnualLeaveModal.tsx
    - src/CustomForms/AnnualLeaveModal.css
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - annual-leave-approvals-brand-rework
  - ux-realtime-navigation-programme
conflicts_with: []
```

---

## 9. Gotchas appendix

- The modal is used from multiple entry points (Home Portal button, UserBubble action). Verify both trigger paths still open it after Phase A.
- Half-day start / half-day end are separate booleans — preserve both.
- Hearing confirmation field is visible only for certain reason classifications — guard those branches.
- The leave record shape uses both `id` and `request_id`; some records have one, some the other (see LeaveRecordRow in AttendancePortal.tsx).
- Phase A Portal session set `--accent-rgb` to 135,243,243 in dark mode — any rgba tints in the modal that relied on highlight-blue should switch to accent in dark mode for dark-mode interactive highlights.
