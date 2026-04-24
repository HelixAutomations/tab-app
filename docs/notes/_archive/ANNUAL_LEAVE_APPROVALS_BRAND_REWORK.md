# Annual Leave Approvals brand rework

> **Purpose of this document.** Self-contained brief for a future agent to pick up cold.
>
> **Verified:** 2026-04-22 against branch `main`. If reading >30 days later, re-verify file refs.

---

## 1. Why this exists (user intent)

User ask (verbatim): *"i want this component to also be speedy and all of its edge case moals and things to look and feel like the evolved helix software like app."*

The approvals surface is one of the "edge case" flows in the leave system — only admins / approvers see it. It still carries the older Helix look (mixed hex values, off-token spacing, dated button chrome, modal-within-modal transitions).

IS: bring `AnnualLeaveApprovals.tsx` + `.css` to the UserBubble / Portal design standard.

IS NOT: changing the approval workflow, the approver assignment logic, the server endpoints (`/api/attendance/updateAnnualLeave`), or the schema.

---

## 2. Current state — verified findings

### 2.1 Entry point

- File: [src/CustomForms/AnnualLeaveApprovals.tsx](../../src/CustomForms/AnnualLeaveApprovals.tsx) — 588 lines. Lists pending + requested leave for approvers; supports approve/reject/comments; shows rejection notes / hearing details.
- File: [src/CustomForms/AnnualLeaveApprovals.css](../../src/CustomForms/AnnualLeaveApprovals.css) — 1,026 lines. Largest CSS file in the `CustomForms` folder. Heavy on hard-coded hex + spacing values.

### 2.2 Reference implementations (same as modal brief)

- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — canonical look.
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md) — rules.
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — tokens + utility classes.
- [src/tabs/home/AttendancePortal.css](../../src/tabs/home/AttendancePortal.css) — just-polished sibling (pills 999, stagger 0.18s cap).

### 2.3 Dark-mode body text rule (CRITICAL)

Use neutral grey (`#d1d5db` / `var(--text-body)`) — NEVER `colours.dark.subText` (blue-on-blue).

### 2.4 Likely problem surfaces

- Approval card chrome — non-zero `border-radius`.
- Approve / Reject buttons — probably Fluent defaults; retheme to `.helix-btn-primary` + `.helix-btn-danger`.
- Comment/rejection-notes textarea — restyle to `.helix-input`.
- Status pills for `requested` / `approved` / `rejected` / `booked` — align with Portal's `.ap-status-pill` pattern at 999px radius.
- Stagger / entrance animations — cap at 0.18s.
- Empty state ("No pending approvals") — use Portal pattern.

---

## 3. Plan

### Phase A — Chrome, typography, borders

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Pills → 999px; everything else → 0 | [.css](../../src/CustomForms/AnnualLeaveApprovals.css) | Audit every `border-radius:` |
| A2 | Font `var(--font-primary)` | .css | Replace fallback stacks |
| A3 | Hex → CSS vars | .css | Same mapping as modal brief |
| A4 | Dark body text → `var(--text-body)` | [.tsx](../../src/CustomForms/AnnualLeaveApprovals.tsx) | Audit inline styles |
| A5 | Approve/Reject buttons adopt `.helix-btn-primary` / `.helix-btn-danger` | .tsx | Keep Fluent if behaviour requires; retheme otherwise |

**Phase A acceptance:** no bare hex, Fluent button chrome replaced or retokenised, dark/light visual parity with Portal.

### Phase B — Snappy feel

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Structural skeleton for loading | .tsx | Reserve final footprint |
| B2 | Stagger cap at 0.18s | .css | Match Portal |
| B3 | Toast on approve/reject | .tsx | `.helix-toast-success` / `.helix-toast-error` |
| B4 | `applyRowHover` on approval cards | .tsx | Subtle lift |

### Phase C — Optional consolidation

If Phase A reveals duplication with [src/CustomForms/AnnualLeaveModal.css](../../src/CustomForms/AnnualLeaveModal.css), factor shared styles into a sibling `AnnualLeaveShared.css`. Confirm with user first.

---

## 4. Step-by-step execution order

1. Phase A1–A3 — CSS retokenise.
2. A4–A5 — TSX audit + button retheme.
3. Smoke test: approve a test request, reject a test request, add a rejection note.
4. Phase B1–B4.
5. Changelog entry.
6. Phase C only if shared duplication is clear and user confirms.

---

## 5. Verification checklist

**Phase A:**
- [ ] `Select-String -Path src/CustomForms/AnnualLeaveApprovals.css -Pattern '#[0-9a-fA-F]{3,6}' | Measure-Object` → 0.
- [ ] Approve + reject both work with toast feedback.
- [ ] Visual parity with Portal in dark + light.

**Phase B:**
- [ ] Skeleton visible immediately on load.
- [ ] Stagger feels snappier; full list lands in < 600ms.

---

## 6. Open decisions (defaults proposed)

1. **Retheme Fluent buttons via styles prop, or swap to `<button class="helix-btn-*">`?** Default: **swap to native** — cleaner and fewer Fluent hooks. Only keep Fluent if there's a specific a11y or keyboard-handler reason in the existing code.
2. **Phase C consolidation?** Default: **no** unless duplication is obvious.

---

## 7. Out of scope

- Server endpoints (`/api/attendance/updateAnnualLeave`, approval notifications).
- Approver assignment logic.
- Schema changes (fully indexed this session).
- The book/edit modal — see sibling brief `annual-leave-modal-brand-rework`.

---

## 8. File index

Client:
- [src/CustomForms/AnnualLeaveApprovals.tsx](../../src/CustomForms/AnnualLeaveApprovals.tsx) — main file
- [src/CustomForms/AnnualLeaveApprovals.css](../../src/CustomForms/AnnualLeaveApprovals.css) — styles
- [src/components/UserBubble.tsx](../../src/components/UserBubble.tsx) — canonical reference
- [src/tabs/home/AttendancePortal.css](../../src/tabs/home/AttendancePortal.css) — sibling reference
- [src/app/styles/design-tokens.css](../../src/app/styles/design-tokens.css) — tokens

Server: n/a

Scripts / docs:
- [docs/COMPONENT_STYLE_GUIDE.md](../../docs/COMPONENT_STYLE_GUIDE.md)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED)

```yaml
# Stash metadata
id: annual-leave-approvals-brand-rework
shipped: true
shipped_on: 2026-04-22
verified: 2026-04-22
branch: main
touches:
  client:
    - src/CustomForms/AnnualLeaveApprovals.tsx
    - src/CustomForms/AnnualLeaveApprovals.css
  server: []
  submodules: []
depends_on: []
coordinates_with:
  - annual-leave-modal-brand-rework
conflicts_with: []
```

---

## 9. Gotchas appendix

- Rejection notes are free-text but displayed in a fixed-height container — preserve the overflow strategy when restyling.
- Approver list is derived server-side; the TSX just displays — don't touch approver logic.
- The approvals view renders inside `BespokePanel` (custom side panel) — test both slide-in + slide-out transitions remain smooth after chrome changes.
- When retheming status pills, the `acknowledged` and `discarded` statuses have neutral-grey palette (matches Portal's `ap-status--acknowledged`/`ap-status--cancelled`). Keep that pattern.
