# pitch builder body editor revamp

> **Purpose of this document.** Self-contained brief any future agent can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read once. Implement Phase A first (small, fast, byte-equivalent output). Stop, live with it. Pick up Phase B/C only if A is insufficient. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-13 against branch `main`. Re-verify file/line refs if reading more than 30 days later.

---

## 1. Why this exists (user intent)

User quote: *"in the body editor undoing things undoes placeholder formatting and things, make sure all of that is hardened and improved since it was built in a patchy way... it just feels fragile right now, and the placeholders the way we treat them doesn't feel like that's the right approach."*

Undo is the headline symptom. The real cluster of bugs (all one root cause: **we rewrite the DOM after the user types**):
1. Ctrl+Z eats placeholders / jumps the whole document.
2. Caret occasionally hops to the start of a paragraph mid-type.
3. Caret can enter a placeholder span and corrupt the `[INSERT]` token.
4. Bold/italic state resets when typing near a placeholder.

User is **not** asking for a UX restyle. Chips, toolbar, shortcuts, colours, layout all stay the same. The output HTML that flows into the send pipeline must remain byte-equivalent to today's.

---

## 2. Current state — verified findings

### 2.1 The contentEditable surface

- [src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L1080 — `<div className="rich-text-editor" contentEditable={!isPitchFlowLocked}>` is the live body editor.
- Same file L1370-L1410 — a second contentEditable region for a sibling/preview block.
- Style hooks: same file L4800-L4845 (`.rich-text-editor a`, `.instruct-link`).

### 2.2 The DOM-rewrite root cause

- [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L500-L570 — `useEffect` that resyncs `bodyEditorRef.current.innerHTML` when `value` prop changes. Has guards (`internalUpdateRef`, `debounceActiveRef`, focus-check, selection-check) but they have gaps. Every guard miss = browser's native undo stack is severed.
- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L935 — `span.setAttribute('contenteditable', ...)` imperative toggle on lock state. Stomps DOM after user input.
- [PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L5015 — zero-width-space insertion "to prevent contentEditable from ...". Workaround that itself produces phantom undo steps.

### 2.3 Custom history stack (parallel to browser's)

- [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L467 — `addToHistory(newValue)` push.
- L876, L1355 — `handleUndo()` call sites bound to Ctrl+Z.
- L843, L893, L1061, L1137, L1160 — `addToHistory` call sites scattered through the file.
- This second history fights the browser's. Both reset whenever innerHTML is rewritten.

### 2.4 Placeholder system (regex over text nodes)

Production into body:
- [emailUtils.ts](../../src/tabs/enquiries/pitch-builder/emailUtils.ts) — `wrapInsertPlaceholders` wraps `[INSERT]` / `[INSERT contracts...]` tokens in spans.
- [PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L2240-L2335 — initial body HTML built with `data-sentence`, `data-placeholder`, contenteditable spans.

Detection:
- [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L186 — `findPlaceholders(text)` walks text nodes, matches `/\[[^\]]+\]/g`.
- Same file L208 — `stripEditorPlaceholderStyles`.
- Same file L223 — `highlightPlaceholdersHtml` (text-node walker that wraps tokens in `.insert-placeholder` / `.placeholder-unresolved` spans).
- [emailFormattingV2.ts](../../src/tabs/enquiries/pitch-builder/emailFormattingV2.ts) L883 — `processEmailContentV2` end-of-pipeline HTML normaliser. **Has unit tests at [__tests__/emailFormattingV2.test.ts](../../src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts) — this is the formatting parity lock.**
- [emailUtils.ts](../../src/tabs/enquiries/pitch-builder/emailUtils.ts) L482 — `applyDynamicSubstitutions` resolves `[INSERT ...]`, `[[INSTRUCT_LINK::...]]`, passcode-aware URLs.

Live editor styling: chips are real DOM spans, not tokens. Caret can enter them.

### 2.5 Toolbar / shortcuts / paste

- [FormattingToolbar.tsx](../../src/tabs/enquiries/pitch-builder/FormattingToolbar.tsx) — bold/italic/list buttons; uses `document.execCommand` internally.
- [editorHooks.ts](../../src/tabs/enquiries/pitch-builder/editorHooks.ts) — `useEditorState`, `useKeyboardShortcuts`.
- [editorEnhancements.ts](../../src/tabs/enquiries/pitch-builder/editorEnhancements.ts) — supplemental behaviour.
- [emailFormattingUtils.ts](../../src/tabs/enquiries/pitch-builder/emailFormattingUtils.ts) — `processEditorContentForEmail`, `KEYBOARD_SHORTCUTS`, paste/output conversion.
- Paste sanitisation runs **after** mutation, then rewrites DOM (compounds the undo problem).

### 2.6 Consumers we must not break

- [usePitchComposer.ts](../../src/tabs/enquiries/pitch-composer/usePitchComposer.ts) L260-L290 — `applyDynamicSubstitutions` then `processEmailContentV2`. Consumes serialised body string.
- [PitchComposer.tsx](../../src/tabs/enquiries/pitch-composer/PitchComposer.tsx) — composer wrapper.
- [EmailProcessor.ts](../../src/tabs/enquiries/pitch-builder/EmailProcessor.ts) L60-L300 — pipeline orchestrator.
- Server send: `server/utils/helixEmail.js` (out of scope).

---

## 3. Plan

### Phase A — Stabilise current editor (small, fast, no new deps)

| # | Change | File | Detail |
|---|--------|------|--------|
| A0 | Add formatting-parity snapshot test BEFORE any edits | [__tests__/emailFormattingV2.test.ts](../../src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts) + new sibling | Snapshot the full editor to send HTML for 3 representative pitches (basic, with placeholders, with instruct link). Lock parity. |
| A1 | Delete custom history stack | [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L467, L843, L876, L893, L1061, L1137, L1160, L1355 | Remove `addToHistory`, `handleUndo`, internal `historyStack`. Let browser handle Ctrl+Z. |
| A2 | Stop innerHTML rewrite during edit | [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L500-L570 | Sync DOM from `value` only on **mount** and when editor is **blurred AND value differs**. Never while focused. |
| A3 | Make placeholders atomic | [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) (wrap function) | Placeholder spans get `contenteditable="false"` + `data-atomic="true"`. Add keydown handler: Backspace/Delete adjacent to a placeholder removes the whole node in one step. Caret cannot enter. |
| A4 | Stop re-wrapping on every keystroke | [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) | `wrapInsertPlaceholders` runs once on insertion (scenario select, template insert, paste). NOT on every onChange. |
| A5 | Remove zero-width-space hack | [PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L5015 | Once A3 is in, the hack is obsolete. |
| A6 | Remove imperative contenteditable toggle | [PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L935 | Make `contenteditable` a React-rendered attribute driven by `isPitchFlowLocked`. No `setAttribute`. |
| A7 | Telemetry | new helper or inline | `trackEvent('PitchBuilder.Editor.PlaceholderRemoved')`, `PitchBuilder.Editor.PasteCleaned`, `PitchBuilder.Editor.SerialiseFailed`. |
| A8 | Changelog | [logs/changelog.md](../../logs/changelog.md) | One entry. |

**Phase A acceptance:**
- Ctrl+Z behaves word/format-level. No "whole-doc jump".
- Placeholders disappear in one Backspace, never partially corrupted.
- Caret no longer jumps to paragraph start mid-type.
- `npm test -- emailFormattingV2` green.
- Snapshot tests from A0 green (output HTML unchanged).
- Devtools: no `innerHTML = ` writes after typing.
- Sent emails render identically to before (manual check on staging).

### Phase B — New editor behind Dev Preview

Only if Phase A is insufficient. See section 6 for framework decision (default: Lexical).

#### B1. New component
- New `src/tabs/enquiries/pitch-builder/PitchBodyEditor.tsx`. Same `onChange(body: string)` shape as today.
- Gated behind `isLzOrAc` (Dev Preview). Old editor remains default.

#### B2. Node model
- `PlaceholderNode` (atomic, non-editable).
- `InstructLinkNode` (atomic, renders as link with hover state).
- `SentenceNode` optional (replaces `data-sentence` spans for scenario block tracking).
- Plus paragraph, text, list, link nodes from the framework defaults.

#### B3. Serialiser
- Lexical state to HTML string that matches what `processEmailContentV2` currently expects. Reuse `emailFormattingV2.test.ts` snapshots from A0 as the contract. **If snapshots break, the serialiser is wrong, not the test.**

#### B4. Toolbar
- Rewire [FormattingToolbar.tsx](../../src/tabs/enquiries/pitch-builder/FormattingToolbar.tsx) to dispatch Lexical commands instead of `document.execCommand`.

#### B5. Paste
- Paste handler as a Lexical model transform (strip Word/Outlook styles, preserve text + bold/italic/list structure).

### Phase C — Cut over and clean up

- Promote `PitchBodyEditor` to all users.
- Delete `editorHooks.ts` state hooks, `wrapInsertPlaceholders`, `highlightPlaceholdersHtml` editor-side use, zero-width-space hack, all `addToHistory` traces.
- `highlightPlaceholdersHtml` survives as a **preview-only** helper for legacy stored bodies; eventually retire.

---

## 4. Step-by-step execution order

**Phase A (one PR):**
1. A0 — write snapshot tests against current behaviour first.
2. A2 — tighten the innerHTML rewrite guard. Run tests.
3. A3 — atomic placeholder nodes. Run tests.
4. A4 — stop re-wrapping. Run tests.
5. A1 — delete custom history. Run tests.
6. A5, A6 — remove hacks. Run tests.
7. A7 — telemetry.
8. Manual QA: type, paste, format, insert scenario, edit placeholder, Ctrl+Z extensively, send a test email.
9. A8 — changelog. Ship.

**Phase B/C:** only after A has been live and the user confirms the fragile feeling is gone.

---

## 5. Verification checklist

**Phase A:**
- [ ] `npm test -- emailFormattingV2` green
- [ ] New snapshot tests from A0 green (parity locked)
- [ ] `npm run dev:fast`, open pitch, hammer Ctrl+Z, placeholders intact
- [ ] Backspace next to placeholder removes whole chip in one keystroke
- [ ] Caret cannot enter a placeholder span
- [ ] Bold/italic state stable when typing near placeholders
- [ ] No `innerHTML = ` writes in Devtools while typing
- [ ] App Insights `PitchBuilder.Editor.*` events visible
- [ ] Manual send: received email identical to pre-change baseline

**Phase B:**
- [ ] Same as A plus `npm run check-sizes` within budget
- [ ] Lexical bundle within 35KB gz
- [ ] All A snapshot tests still green when feature flag on
- [ ] Dev Preview users report stability for 7 days before C

---

## 6. Open decisions (defaults proposed)

1. **Editor framework for Phase B** — Default: **Lexical**. Rationale: Meta-maintained, React-first, ~30KB gz, atomic-node model is first-class. Slate is more flexible but larger API surface. ProseMirror is overkill. Defer decision until Phase A ships.
2. **Placeholder click behaviour** — Default: **keep popover-on-click** (current). Rationale: established muscle memory, no UX regression. Inline edit-until-blur is a future option.
3. **Should A0 snapshot tests live alongside V2 tests or in a new file?** — Default: **new file `pitchBodyParity.test.ts`** to keep concerns separate.

---

## 7. Out of scope

- Server send pipeline (`server/utils/helixEmail.js`).
- Signature paper rendering (already addressed in earlier session).
- Scenario block authoring UI ([scenarios.ts](../../src/tabs/enquiries/pitch-builder/scenarios.ts)).
- Pitch composer wrapper ([usePitchComposer.ts](../../src/tabs/enquiries/pitch-composer/usePitchComposer.ts)).
- Visual restyle of placeholder chips beyond what the atomic-node renderer requires.
- Subject line / header field editors.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) — primary surgical target (Phase A).
- [src/tabs/enquiries/PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) — owns body state; remove imperative DOM hacks (A5, A6).
- [src/tabs/enquiries/pitch-builder/emailFormattingV2.ts](../../src/tabs/enquiries/pitch-builder/emailFormattingV2.ts) — output normaliser, DO NOT TOUCH.
- [src/tabs/enquiries/pitch-builder/emailFormattingUtils.ts](../../src/tabs/enquiries/pitch-builder/emailFormattingUtils.ts) — paste / output utils.
- [src/tabs/enquiries/pitch-builder/emailUtils.ts](../../src/tabs/enquiries/pitch-builder/emailUtils.ts) — substitutions.
- [src/tabs/enquiries/pitch-builder/EmailProcessor.ts](../../src/tabs/enquiries/pitch-builder/EmailProcessor.ts) — pipeline orchestrator.
- [src/tabs/enquiries/pitch-builder/FormattingToolbar.tsx](../../src/tabs/enquiries/pitch-builder/FormattingToolbar.tsx) — toolbar (Phase B rewire).
- [src/tabs/enquiries/pitch-builder/editorHooks.ts](../../src/tabs/enquiries/pitch-builder/editorHooks.ts), [editorEnhancements.ts](../../src/tabs/enquiries/pitch-builder/editorEnhancements.ts) — toolbar state + keyboard.
- [src/tabs/enquiries/pitch-builder/PlaceholderEditorPopover.tsx](../../src/tabs/enquiries/pitch-builder/PlaceholderEditorPopover.tsx) — chip click popover.
- [src/tabs/enquiries/pitch-composer/usePitchComposer.ts](../../src/tabs/enquiries/pitch-composer/usePitchComposer.ts) — consumer; do not break.
- New: `src/tabs/enquiries/pitch-builder/PitchBodyEditor.tsx` (Phase B).

Tests:
- [src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts](../../src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts) — formatting parity oracle.
- New: `src/tabs/enquiries/pitch-builder/__tests__/pitchBodyParity.test.ts` (A0).

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) — entry per phase.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: pitch-builder-body-editor-revamp
verified: 2026-05-13
branch: main
touches:
  client:
    - src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx
    - src/tabs/enquiries/PitchBuilder.tsx
    - src/tabs/enquiries/pitch-builder/FormattingToolbar.tsx
    - src/tabs/enquiries/pitch-builder/editorHooks.ts
    - src/tabs/enquiries/pitch-builder/editorEnhancements.ts
    - src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts
  server: []
  submodules: []
depends_on: []
coordinates_with: []
conflicts_with: []
```

---

## 9. Gotchas appendix

- [emailFormattingV2.test.ts](../../src/tabs/enquiries/pitch-builder/__tests__/emailFormattingV2.test.ts) is the formatting lock. **If a test breaks during Phase A, the production behaviour just broke. Do not edit the test to make it pass, fix the code.** Only A0's new snapshots are allowed to be authored from current behaviour.
- The innerHTML resync `useEffect` at L500-L570 has FIVE guards (`internalUpdateRef`, `debounceActiveRef`, focus check, selection check, content-equal check). Removing the effect entirely is too aggressive, outside callers (scenario select, template insert) need DOM to update from prop. The fix is to make the focus check the gate, not a late short-circuit.
- The zero-width-space hack at [PitchBuilder.tsx](../../src/tabs/enquiries/PitchBuilder.tsx) L5015 exists because pressing Enter at the start of a `contenteditable="true"` span inside a `contenteditable="false"` parent caused Chrome to delete the span. Once placeholders are atomic (A3), Enter near them produces a normal newline outside the chip and the hack becomes redundant. **Verify before removing.**
- `document.execCommand` is deprecated but still works in all target browsers. Don't replace in Phase A; replace in Phase B as part of the framework swap.
- HMR gotcha: [EditorAndTemplateBlocks.tsx](../../src/tabs/enquiries/pitch-builder/EditorAndTemplateBlocks.tsx) L135-L148 appends a global `<style id="processing-animations">` once. If you duplicate or rename this during refactor, dev hot-reload will stack styles. Keep the id guard.
- `wrapInsertPlaceholders` is also called from non-editor paths (preview, send). Phase A only changes WHEN it runs in the editor, not what it does. Do not move it.
- Sentence-level tracking (`data-sentence`) is used by other features (the inline workbench may consume it). Grep before deleting in Phase C.
- `isPitchFlowLocked` is the lock toggle that drives `contenteditable` and the imperative `setAttribute` at L935. Replace with a React-rendered attribute; do not break the lock flow.
